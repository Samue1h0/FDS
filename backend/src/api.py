import os
import csv
import io
import asyncio
import json
import joblib
import psycopg2
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Query, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
from jose import jwt, JWTError

from src.fabric_client import FabricClient
from src.private_store import PrivateRecordStore
from src.kyc_store import KYCStore
from src.user_store import UserStore, verify_password

app = FastAPI(title="Fraud Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FABRIC_GATEWAY_URL = os.getenv("FABRIC_GATEWAY_URL", "http://localhost:8080")
POSTGRES_DSN       = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
ENCRYPTION_KEY     = os.getenv("ENCRYPTION_KEY", "").encode()
JWT_SECRET         = os.getenv("JWT_SECRET", "fraud-detection-secret-change-in-prod")
JWT_ALGORITHM      = "HS256"
JWT_EXPIRE_HOURS   = 8

fabric = FabricClient(gateway_url=FABRIC_GATEWAY_URL)

# ── SSE client registry ───────────────────────────────────────
# One asyncio.Queue per connected browser tab.
# When data changes, we put an event into every queue.
_sse_clients: set[asyncio.Queue] = set()
_event_loop: asyncio.AbstractEventLoop | None = None


@app.on_event("startup")
async def _capture_event_loop():
    global _event_loop
    _event_loop = asyncio.get_event_loop()


def _notify_clients(event_type: str, data: dict):
    """
    Notify every active SSE client. Safe to call from both async routes
    and sync routes (which FastAPI runs in a thread-pool thread).
    asyncio.Queue is not thread-safe, so we always schedule via
    call_soon_threadsafe to ensure the put runs on the event loop thread.
    """
    if not _sse_clients or _event_loop is None:
        return
    payload = {"type": event_type, **data}
    for q in list(_sse_clients):
        try:
            _event_loop.call_soon_threadsafe(q.put_nowait, payload)
        except Exception:
            pass


def get_db():
    return psycopg2.connect(POSTGRES_DSN)


# ── Dashboard snapshot builder ────────────────────────────────
# Reads from PostgreSQL (the read model) so the snapshot is available
# immediately after the fraud consumer saves — no need to wait for
# blockchain confirmation. Runs in a thread executor so it doesn't
# block the event loop.

def _build_snapshot() -> dict:
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # ── Stats ─────────────────────────────────────────────
            cur.execute("""
                SELECT
                    COUNT(*)                                                            AS total,
                    COUNT(*) FILTER (WHERE predicted_label = 'FRAUD')                  AS fraud_count,
                    COUNT(*) FILTER (WHERE predicted_label = 'LEGIT')                  AS legit_count,
                    COUNT(*) FILTER (WHERE predicted_label = 'FRAUD'
                                     AND reviewed_by IS NULL)                          AS pending_review,
                    COUNT(*) FILTER (WHERE reviewed_by IS NOT NULL)                    AS reviewed,
                    COALESCE(AVG(fraud_score), 0)                                      AS avg_fraud_score
                FROM private_transactions
            """)
            total, fraud_count, legit_count, pending, reviewed, avg_score = cur.fetchone()

            # ── Trend (monthly) ───────────────────────────────────
            cur.execute("""
                SELECT TO_CHAR(DATE_TRUNC('month', timestamp), 'YYYY-MM') AS month,
                       predicted_label, COUNT(*)
                FROM private_transactions
                WHERE predicted_label IN ('FRAUD', 'LEGIT')
                GROUP BY DATE_TRUNC('month', timestamp), predicted_label
                ORDER BY 1
            """)
            trend_map = defaultdict(lambda: {"FRAUD": 0, "LEGIT": 0})
            for month, label, cnt in cur.fetchall():
                trend_map[month][label] = int(cnt)

            # ── Score distribution (FRAUD only, 3 buckets) ────────
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE fraud_score < 0.6)                        AS low,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.6 AND fraud_score < 0.8) AS medium,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.8)                       AS high
                FROM private_transactions
                WHERE predicted_label = 'FRAUD' AND fraud_score IS NOT NULL
            """)
            low, medium, high = cur.fetchone()

            # ── Recent transactions ────────────────────────────────
            cur.execute("""
                SELECT
                    transaction_id, timestamp::text, amount_myr, merchant_name,
                    customer_ref, fraud_score, predicted_label, ml_prediction,
                    rule_flag, risk_reasons, ground_truth_label,
                    reviewed_by, reviewed_at::text,
                    mcc, mode, location, ic_hash, masked_card_number
                FROM private_transactions
                ORDER BY timestamp DESC
                LIMIT 8
            """)
            cols = [
                "transaction_id", "timestamp", "amount_myr", "merchant_name",
                "customer_ref", "fraud_score", "predicted_label", "ml_prediction",
                "rule_flag", "risk_reasons", "ground_truth_label",
                "reviewed_by", "reviewed_at",
                "mcc", "mode", "location", "ic_hash", "masked_card_number",
            ]
            recent = []
            for r in cur.fetchall():
                txn = dict(zip(cols, r))
                txn["fraud_score"] = float(txn["fraud_score"]) if txn["fraud_score"] is not None else 0.0
                txn["amount_myr"]  = float(txn["amount_myr"])  if txn["amount_myr"]  is not None else 0.0
                rr = txn["risk_reasons"]
                txn["risk_reasons"] = json.loads(rr) if isinstance(rr, str) else (rr or [])
                recent.append(txn)
    finally:
        conn.close()

    return {
        "stats": {
            "total":           int(total),
            "fraud_count":     int(fraud_count),
            "legit_count":     int(legit_count),
            "pending_review":  int(pending),
            "reviewed":        int(reviewed),
            "avg_fraud_score": round(float(avg_score), 4),
        },
        "trend": [
            {"date": d, "fraud": c["FRAUD"], "legit": c["LEGIT"]}
            for d, c in sorted(trend_map.items())
        ],
        "score_distribution": [
            {"range": "Low",    "count": int(low)},
            {"range": "Medium", "count": int(medium)},
            {"range": "High",   "count": int(high)},
        ],
        "recent_transactions": recent,
    }


# ── Models ────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class ReviewRequest(BaseModel):
    ground_truth_label: int
    reviewer_id: str
    notes: Optional[str] = ""


# ── Auth ──────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest):
    conn = get_db()
    try:
        user = UserStore(conn).get_by_username(body.username)
    finally:
        conn.close()

    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    payload = {
        "sub":     user["username"],
        "user_id": user["user_id"],
        "role":    user["role"],
        "exp":     datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "token": token,
        "user":  {"user_id": user["user_id"], "username": user["username"], "role": user["role"]},
    }


@app.get("/api/auth/me")
def get_me(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "user_id":  payload.get("user_id"),
            "username": payload.get("sub"),
            "role":     payload.get("role"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Transactions ──────────────────────────────────────────────

@app.get("/api/transactions")
def list_transactions(
    decision: Optional[str] = Query(None),
    reviewed: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    risk: Optional[str] = Query(None),
    limit: int = Query(50, le=100000),
    offset: int = Query(0),
):
    conditions, params = ["1=1"], []

    if decision:
        conditions.append("predicted_label = %s")
        params.append(decision.upper())
    if reviewed is True:
        conditions.append("reviewed_by IS NOT NULL AND reviewed_by != ''")
    elif reviewed is False:
        conditions.append("(reviewed_by IS NULL OR reviewed_by = '')")
    if search:
        conditions.append(
            "(transaction_id ILIKE %s OR merchant_name ILIKE %s OR customer_ref ILIKE %s)"
        )
        s = f"%{search}%"
        params.extend([s, s, s])
    if risk:
        r = risk.upper()
        if r == "LOW":
            conditions.append("fraud_score < 0.6")
        elif r == "MEDIUM":
            conditions.append("fraud_score >= 0.6 AND fraud_score < 0.8")
        elif r == "HIGH":
            conditions.append("fraud_score >= 0.8")

    where = " AND ".join(conditions)
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM private_transactions WHERE {where}", params)
            total = cur.fetchone()[0]
            cur.execute(
                f"""
                SELECT transaction_id, customer_ref, timestamp, amount_myr,
                       merchant_name, mcc, mode, location, ic_hash,
                       masked_card_number, fraud_score, predicted_label,
                       ml_prediction, rule_flag, risk_reasons,
                       ground_truth_label, reviewed_by, reviewed_at, created_at
                FROM private_transactions
                WHERE {where}
                ORDER BY timestamp DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    def _row_to_txn(row):
        try:
            risk_reasons = json.loads(row[14]) if row[14] else []
        except Exception:
            risk_reasons = []
        return {
            "transaction_id":     row[0],
            "customer_ref":       row[1] or "",
            "timestamp":          row[2].isoformat() if row[2] else "",
            "amount_myr":         float(row[3]) if row[3] is not None else 0.0,
            "merchant_name":      row[4] or "",
            "mcc":                row[5] or "",
            "mode":               row[6] or "",
            "location":           row[7] or "",
            "ic_hash":            row[8] or "",
            "masked_card_number": row[9] or "",
            "fraud_score":        float(row[10]) if row[10] is not None else 0.0,
            "predicted_label":    row[11] or "pending",
            "ml_prediction":      int(row[12]) if row[12] is not None else 0,
            "rule_flag":          int(row[13]) if row[13] is not None else 0,
            "risk_reasons":       risk_reasons,
            "ground_truth_label": int(row[15]) if row[15] is not None else 0,
            "reviewed_by":        row[16] or "",
            "reviewed_at":        row[17].isoformat() if row[17] else "",
            "created_at":         row[18].isoformat() if row[18] else "",
            "created_by":         "",
        }

    return {"total": int(total), "transactions": [_row_to_txn(r) for r in rows]}


def _txn_filter(decision, reviewed, search, risk):
    """Shared WHERE builder for transaction list / export / meta — returns
    (conditions, params). Risk bands: Low <0.6, Med 0.6–0.8, High ≥0.8."""
    conditions, params = ["1=1"], []
    if decision:
        conditions.append("predicted_label = %s")
        params.append(decision.upper())
    if reviewed is True:
        conditions.append("reviewed_by IS NOT NULL AND reviewed_by != ''")
    elif reviewed is False:
        conditions.append("(reviewed_by IS NULL OR reviewed_by = '')")
    if search:
        conditions.append(
            "(transaction_id ILIKE %s OR merchant_name ILIKE %s OR customer_ref ILIKE %s)"
        )
        s = f"%{search}%"
        params.extend([s, s, s])
    if risk:
        r = risk.upper()
        if r == "LOW":
            conditions.append("fraud_score < 0.6")
        elif r == "MEDIUM":
            conditions.append("fraud_score >= 0.6 AND fraud_score < 0.8")
        elif r == "HIGH":
            conditions.append("fraud_score >= 0.8")
    return conditions, params


# Canonical export columns: key -> header. This list is also the output order.
_EXPORT_COLUMNS = [
    ("transaction_id",  "Transaction ID"),
    ("timestamp",       "Timestamp"),
    ("customer_ref",    "Customer Ref"),
    ("masked_card",     "Masked Card"),
    ("merchant",        "Merchant"),
    ("mcc",             "MCC"),
    ("mode",            "Mode"),
    ("location",        "Location"),
    ("amount",          "Amount (MYR)"),
    ("fraud_score",     "Fraud Score"),
    ("risk_level",      "Risk Level"),
    ("decision",        "Decision"),
    ("ml_prediction",   "ML Prediction"),
    ("rule_flag",       "Rule Flag"),
    ("rules_triggered", "Rules Triggered"),
    ("ground_truth",    "Ground Truth"),
    ("reviewed_by",     "Reviewed By"),
    ("reviewed_at",     "Reviewed At"),
]
_EXPORT_KEYS = [k for k, _ in _EXPORT_COLUMNS]

# Sensitive columns — only emitted for an authorized, consented PII export.
_PII_COLUMNS = [
    ("cardholder_name", "Cardholder Name"),
    ("ic_number",       "IC Number"),
    ("card_number",     "Card Number"),
    ("card_expiration", "Card Expiration"),
]
_PII_KEYS = [k for k, _ in _PII_COLUMNS]
_PII_ROLES = {"analyst", "admin"}   # roles allowed to export decrypted PII


def _require_pii_role(authorization: Optional[str]):
    """Validate the JWT and require an allowed role for a PII export."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required for PII export")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") not in _PII_ROLES:
        raise HTTPException(status_code=403, detail="Your role is not permitted to export PII")
    return payload


@app.get("/api/export/transactions")
def export_transactions(
    decision: Optional[str] = Query(None),
    reviewed: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    risk: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    columns: Optional[str] = Query(None),
    pii: bool = Query(False),
    format: str = Query("csv"),
    authorization: Optional[str] = Header(None),
):
    """Export transactions matching the same filters as GET /api/transactions
    (mirrors the table, all matching rows). `columns` (comma-separated keys),
    `date_from`/`date_to` (YYYY-MM-DD), `format` csv|xlsx. Privacy-safe by
    default; `pii=true` adds decrypted IC/card/cardholder and requires an
    authenticated user with an allowed role."""
    fmt = format.lower()
    if fmt not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'xlsx'")

    if pii:
        _require_pii_role(authorization)

    # Columns available depend on whether PII was authorized
    available = _EXPORT_COLUMNS + (_PII_COLUMNS if pii else [])
    available_keys = [k for k, _ in available]
    headers_map = dict(available)

    if columns:
        requested = {c.strip() for c in columns.split(",") if c.strip()}
        selected = [k for k in available_keys if k in requested]
    else:
        selected = list(_EXPORT_KEYS)   # default = non-PII columns only
    if not selected:
        raise HTTPException(status_code=400, detail="No valid columns selected.")

    # Filters (shared with /api/transactions) + optional date range
    conditions, params = _txn_filter(decision, reviewed, search, risk)
    if date_from:
        conditions.append("timestamp::date >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("timestamp::date <= %s")
        params.append(date_to)
    where = " AND ".join(conditions)

    base_cols = ("transaction_id, timestamp, customer_ref, masked_card_number, "
                 "merchant_name, mcc, mode, location, amount_myr, fraud_score, "
                 "predicted_label, ml_prediction, rule_flag, risk_reasons, "
                 "ground_truth_label, reviewed_by, reviewed_at")
    pii_select = (", cardholder_name, card_expiration_date, ic_number_enc, card_number_enc"
                  if pii else "")

    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {base_cols}{pii_select} FROM private_transactions "
                f"WHERE {where} ORDER BY timestamp DESC",
                params,
            )
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    cipher = None
    if pii and ENCRYPTION_KEY:
        from cryptography.fernet import Fernet
        cipher = Fernet(ENCRYPTION_KEY)

    def _decrypt(value):
        if not value or not cipher:
            return ""
        try:
            return cipher.decrypt(value.encode()).decode()
        except Exception:
            return ""

    def _risk_level(score):
        if score is None:
            return ""
        if score >= 0.8:
            return "High"
        if score >= 0.6:
            return "Medium"
        return "Low"

    def _values(row):
        try:
            reasons = json.loads(row[13]) if row[13] else []
        except Exception:
            reasons = []
        reasons = [x for x in reasons if isinstance(x, str) and not x.startswith("ML score")]
        score = float(row[9]) if row[9] is not None else None
        v = {
            "transaction_id":  row[0],
            "timestamp":       row[1].isoformat() if row[1] else "",
            "customer_ref":    row[2] or "",
            "masked_card":     row[3] or "",
            "merchant":        row[4] or "",
            "mcc":             row[5] or "",
            "mode":            row[6] or "",
            "location":        row[7] or "",
            "amount":          round(float(row[8]), 2) if row[8] is not None else "",
            "fraud_score":     round(score, 4) if score is not None else "",
            "risk_level":      _risk_level(score),
            "decision":        row[10] or "",
            "ml_prediction":   int(row[11]) if row[11] is not None else 0,
            "rule_flag":       int(row[12]) if row[12] is not None else 0,
            "rules_triggered": "; ".join(reasons),
            "ground_truth":    int(row[14]) if row[14] is not None else "",
            "reviewed_by":     row[15] or "",
            "reviewed_at":     row[16].isoformat() if row[16] else "",
        }
        if pii:
            v["cardholder_name"] = row[17] or ""
            v["card_expiration"] = row[18] or ""
            v["ic_number"]       = _decrypt(row[19])
            v["card_number"]     = _decrypt(row[20])
        return v

    header   = [headers_map[k] for k in selected]
    rows_out = [_values(r) for r in rows]
    ts  = datetime.now().strftime("%Y%m%d-%H%M%S")
    tag = "transactions-pii" if pii else "transactions"

    if fmt == "xlsx":
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Transactions"
        ws.append(header)
        for v in rows_out:
            ws.append([v[k] for k in selected])
        bio = io.BytesIO()
        wb.save(bio)
        return Response(
            content=bio.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{tag}-{ts}.xlsx"'},
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    for v in rows_out:
        writer.writerow([v[k] for k in selected])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{tag}-{ts}.csv"'},
    )


@app.get("/api/export/transactions/meta")
def export_meta(
    decision: Optional[str] = Query(None),
    reviewed: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    risk: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """For the export modal: how many rows the export will contain (filters +
    date range) and the selectable date window (min/max date over the filters,
    ignoring the date range). Used to size the count + constrain the calendars."""
    conditions, params = _txn_filter(decision, reviewed, search, risk)
    filter_where = " AND ".join(conditions)

    # COUNT applies the date range; MIN/MAX define the selectable bounds (no dates).
    date_clause, date_params = "TRUE", []
    if date_from:
        date_clause += " AND timestamp::date >= %s"
        date_params.append(date_from)
    if date_to:
        date_clause += " AND timestamp::date <= %s"
        date_params.append(date_to)

    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) FILTER (WHERE {date_clause}),
                       MIN(timestamp)::date,
                       MAX(timestamp)::date
                FROM private_transactions
                WHERE {filter_where}
                """,
                date_params + params,
            )
            count, min_d, max_d = cur.fetchone()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "count":    int(count or 0),
        "min_date": min_d.isoformat() if min_d else None,
        "max_date": max_d.isoformat() if max_d else None,
    }


@app.get("/api/transactions/customer/{customer_ref}")
def get_customer_transactions(customer_ref: str, limit: int = Query(20, le=50)):
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT transaction_id, customer_ref, timestamp, amount_myr,
                       merchant_name, mcc, mode, location, ic_hash,
                       masked_card_number, fraud_score, predicted_label,
                       ml_prediction, rule_flag, risk_reasons,
                       ground_truth_label, reviewed_by, reviewed_at, created_at
                FROM private_transactions
                WHERE customer_ref = %s
                ORDER BY timestamp DESC
                LIMIT %s
                """,
                (customer_ref, limit),
            )
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    def _row_to_txn(row):
        try:
            risk_reasons = json.loads(row[14]) if row[14] else []
        except Exception:
            risk_reasons = []
        return {
            "transaction_id":     row[0],
            "customer_ref":       row[1] or "",
            "timestamp":          row[2].isoformat() if row[2] else "",
            "amount_myr":         float(row[3]) if row[3] is not None else 0.0,
            "merchant_name":      row[4] or "",
            "mcc":                row[5] or "",
            "mode":               row[6] or "",
            "location":           row[7] or "",
            "ic_hash":            row[8] or "",
            "masked_card_number": row[9] or "",
            "fraud_score":        float(row[10]) if row[10] is not None else 0.0,
            "predicted_label":    row[11] or "pending",
            "ml_prediction":      int(row[12]) if row[12] is not None else 0,
            "rule_flag":          int(row[13]) if row[13] is not None else 0,
            "risk_reasons":       risk_reasons,
            "ground_truth_label": int(row[15]) if row[15] is not None else 0,
            "reviewed_by":        row[16] or "",
            "reviewed_at":        row[17].isoformat() if row[17] else "",
            "created_at":         row[18].isoformat() if row[18] else "",
            "created_by":         "",
        }

    txns = [_row_to_txn(r) for r in rows]
    return {"customer_ref": customer_ref, "total": len(txns), "transactions": txns}


@app.get("/api/transactions/{transaction_id}")
def get_transaction(transaction_id: str):
    try:
        blockchain_data = fabric.get_transaction(transaction_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Transaction not found: {e}")

    try:
        from cryptography.fernet import Fernet, InvalidToken
        cipher = Fernet(ENCRYPTION_KEY) if ENCRYPTION_KEY else None

        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cardholder_name, card_expiration_date,
                       ic_number_enc, card_number_enc,
                       reviewed_by, reviewed_at, notes
                FROM private_transactions
                WHERE transaction_id = %s
            """, (transaction_id,))
            row = cur.fetchone()
        conn.close()
        if row:
            blockchain_data["cardholder_name"]     = row[0]
            blockchain_data["card_expiration_date"] = row[1]

            def _decrypt(value: str) -> str | None:
                if not value or not cipher:
                    return None
                try:
                    return cipher.decrypt(value.encode()).decode()
                except (InvalidToken, Exception):
                    return None

            blockchain_data["ic_number"]           = _decrypt(row[2])
            blockchain_data["card_number"]         = _decrypt(row[3])
            blockchain_data["private_reviewed_by"] = row[4]
            blockchain_data["private_reviewed_at"] = str(row[5]) if row[5] else ""
            blockchain_data["notes"]               = row[6]
    except Exception as e:
        blockchain_data["private_data_error"] = str(e)

    return blockchain_data


@app.get("/api/transactions/{transaction_id}/history")
def get_transaction_history(transaction_id: str):
    try:
        return fabric.get_history(transaction_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fabric error: {e}")


@app.post("/api/transactions/{transaction_id}/review")
def review_transaction(transaction_id: str, body: ReviewRequest):
    if body.ground_truth_label not in [0, 1]:
        raise HTTPException(status_code=400, detail="ground_truth_label must be 0 or 1")
    if not body.reviewer_id.strip():
        raise HTTPException(status_code=400, detail="reviewer_id is required")

    try:
        fabric.update_ground_truth(
            transaction_id=transaction_id,
            ground_truth_label=body.ground_truth_label,
            reviewer_id=body.reviewer_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fabric update failed: {e}")

    try:
        conn = get_db()
        private_store = PrivateRecordStore(conn, ENCRYPTION_KEY)
        private_store.update_ground_truth(
            transaction_id=transaction_id,
            ground_truth_label=body.ground_truth_label,
            reviewer_id=body.reviewer_id,
            notes=body.notes or "",
        )
        private_store.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Postgres update failed: {e}")

    # Notify all SSE clients that a review was just submitted
    _notify_clients("review", {"transaction_id": transaction_id})

    return {"status": "SUCCESS", "transaction_id": transaction_id}


# ── Customers (KYC) ──────────────────────────────────────────

@app.get("/api/customers/{customer_ref}")
def get_customer_kyc(customer_ref: str):
    conn = get_db()
    try:
        store   = KYCStore(conn, ENCRYPTION_KEY)
        profile = store.get_by_customer_ref(customer_ref)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Customer {customer_ref} not found")
        return profile
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()


# ── Stats ─────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*)                                                            AS total,
                    COUNT(*) FILTER (WHERE predicted_label = 'FRAUD')                  AS fraud_count,
                    COUNT(*) FILTER (WHERE predicted_label = 'LEGIT')                  AS legit_count,
                    COUNT(*) FILTER (WHERE predicted_label = 'FRAUD'
                                     AND reviewed_by IS NULL)                          AS pending_review,
                    COUNT(*) FILTER (WHERE reviewed_by IS NOT NULL)                    AS reviewed,
                    COALESCE(AVG(fraud_score), 0)                                      AS avg_fraud_score
                FROM private_transactions
            """)
            total, fraud_count, legit_count, pending, reviewed, avg_score = cur.fetchone()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "total":           int(total),
        "fraud_count":     int(fraud_count),
        "legit_count":     int(legit_count),
        "pending_review":  int(pending),
        "reviewed":        int(reviewed),
        "avg_fraud_score": round(float(avg_score), 4),
    }


# ── Charts ────────────────────────────────────────────────────

@app.get("/api/charts/fraud-trend")
def fraud_trend():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT TO_CHAR(DATE_TRUNC('month', timestamp), 'YYYY-MM') AS month,
                       predicted_label, COUNT(*)
                FROM private_transactions
                WHERE predicted_label IN ('FRAUD', 'LEGIT')
                GROUP BY DATE_TRUNC('month', timestamp), predicted_label
                ORDER BY 1
            """)
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    trend = defaultdict(lambda: {"FRAUD": 0, "LEGIT": 0})
    for month, label, cnt in rows:
        trend[month][label] = int(cnt)

    return [
        {"date": m, "fraud": c["FRAUD"], "legit": c["LEGIT"]}
        for m, c in sorted(trend.items())
    ]


@app.get("/api/charts/score-distribution")
def score_distribution():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE fraud_score < 0.6)                        AS low,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.6 AND fraud_score < 0.8) AS medium,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.8)                       AS high
                FROM private_transactions
                WHERE predicted_label = 'FRAUD' AND fraud_score IS NOT NULL
            """)
            low, medium, high = cur.fetchone()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return [
        {"range": "Low",    "count": int(low)},
        {"range": "Medium", "count": int(medium)},
        {"range": "High",   "count": int(high)},
    ]


# ── Detection triggers (rule firing counts + ML feature importance) ──

# Parent names of one-hot encoded categorical features. preprocess_data()
# get_dummies() produces "<Parent>_<value>" columns; we sum a parent's dummies
# back together so the chart shows ~12 meaningful signals, not fragmented dummies.
_CATEGORICAL_PARENTS = [
    "Date of Birth", "Employment Status", "Job Title", "Marital Status",
    "Device Information", "IP Address", "Location", "City", "State",
    "Country", "Nationality", "Gender", "Mode", "Card Type",
]

# Friendly labels + group for numeric (non-dummy) features. Anything not here
# that isn't a categorical parent falls back to its raw name / "Other".
_NUMERIC_FEATURES = {
    "hours_since_last_txn":   ("Hours since last txn",        "Velocity"),
    "amount_zscore_cust":     ("Amount vs customer norm (z)", "Velocity"),
    "amount_vs_cust_avg":     ("Amount vs customer average",  "Velocity"),
    "cust_avg_amount":        ("Customer average amount",     "Velocity"),
    "cust_std_amount":        ("Customer amount spread",      "Velocity"),
    "txn_count_history":      ("Customer history depth",      "Velocity"),
    "new_mcc_flag":           ("New merchant category",       "Velocity"),
    "location_changed":       ("Location changed",            "Velocity"),
    "log_amount":             ("Amount (log)",                "Engineered"),
    "amount_is_round":        ("Round-number amount",         "Engineered"),
    "amount_to_income_ratio": ("Amount-to-income ratio",      "Engineered"),
    "has_income_data":        ("Has income data",             "Engineered"),
    "income_min":             ("Income (min)",                "Engineered"),
    "income_max":             ("Income (max)",                "Engineered"),
    "income_mid":             ("Income (midpoint)",           "Engineered"),
    "Amount (MYR)":           ("Transaction amount",          "Transaction"),
    "txn_hour":               ("Hour of day",                 "Transaction"),
    "txn_dayofweek":          ("Day of week",                 "Transaction"),
    "Merchant Category Code (MCC)": ("Merchant category (MCC)", "Transaction"),
}

_ml_importance_cache: Optional[list] = None


def _parent_of(feature: str) -> str:
    for parent in _CATEGORICAL_PARENTS:
        if feature == parent or feature.startswith(parent + "_"):
            return parent
    return feature


def _compute_ml_importances(top_n: int = 12) -> list:
    global _ml_importance_cache
    if _ml_importance_cache is not None:
        return _ml_importance_cache

    model = joblib.load("models/fraud_model.pkl")
    cols  = joblib.load("models/feature_columns.pkl")

    agg: dict[str, float] = defaultdict(float)
    for col, imp in zip(cols, model.feature_importances_):
        agg[_parent_of(col)] += float(imp)

    ranked = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:top_n]

    result = []
    for raw, importance in ranked:
        if raw in _NUMERIC_FEATURES:
            label, group = _NUMERIC_FEATURES[raw]
        elif raw in _CATEGORICAL_PARENTS:
            label, group = raw, "Profile"
        else:
            label, group = raw, "Other"
        result.append({
            "label":      label,
            "raw":        raw,
            "group":      group,
            "importance": round(importance, 4),
        })

    _ml_importance_cache = result
    return result


@app.get("/api/triggers/stats")
def trigger_stats():
    """Live data for the Detection Triggers page: how often each rule has
    fired across scored transactions + aggregated ML feature importances."""
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE predicted_label = 'FRAUD') FROM private_transactions")
            total, total_fraud = cur.fetchone()

            cur.execute("SELECT risk_reasons FROM private_transactions WHERE risk_reasons IS NOT NULL")
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    rule_counts: dict[str, int] = defaultdict(int)
    for (rr,) in rows:
        reasons = json.loads(rr) if isinstance(rr, str) else (rr or [])
        for reason in reasons:
            # skip the "ML score = 0.xxxx" entries written for non-rule rows
            if isinstance(reason, str) and not reason.startswith("ML score"):
                rule_counts[reason] += 1

    try:
        importances = _compute_ml_importances()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model load error: {e}")

    return {
        "total_transactions": int(total),
        "total_fraud":        int(total_fraud),
        "rule_counts":        dict(rule_counts),
        "ml": {
            "model":       "Random Forest",
            "n_features":  93,
            "importances": importances,
        },
    }


# ── Audit: chain vs DB integrity ─────────────────────────────

@app.get("/api/audit/integrity-check")
def integrity_check():
    """
    Compares every record on the Fabric blockchain against the private
    PostgreSQL store and flags any count or field-level discrepancies.
    Fields checked: fraud_score, predicted_label, amount_myr,
                    ml_prediction, rule_flag.
    """
    try:
        fabric_result = fabric.get_all_transactions()
        fabric_txns = fabric_result if isinstance(fabric_result, list) else fabric_result.get("transactions", [])
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Fabric unavailable: {e}")

    fabric_map: dict = {
        t["transaction_id"]: t
        for t in fabric_txns
        if t.get("transaction_id")
    }

    conn = get_db()
    db_map: dict = {}
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT transaction_id, fraud_score, predicted_label,
                       amount_myr, ml_prediction, rule_flag
                FROM private_transactions
            """)
            for row in cur.fetchall():
                db_map[row[0]] = {
                    "fraud_score":     float(row[1]) if row[1] is not None else None,
                    "predicted_label": row[2],
                    "amount_myr":      float(row[3]) if row[3] is not None else None,
                    "ml_prediction":   int(row[4])   if row[4] is not None else None,
                    "rule_flag":       int(row[5])   if row[5] is not None else None,
                }
    finally:
        conn.close()

    fabric_ids  = set(fabric_map.keys())
    db_ids      = set(db_map.keys())
    common      = fabric_ids & db_ids
    only_chain  = fabric_ids - db_ids
    only_db     = db_ids - fabric_ids

    FLOAT_FIELDS   = {"fraud_score", "amount_myr"}
    COMPARE_FIELDS = ["fraud_score", "predicted_label", "amount_myr", "ml_prediction", "rule_flag"]

    mismatch_details = []
    matched = 0
    for tid in common:
        f_rec = fabric_map[tid]
        d_rec = db_map[tid]
        record_ok = True
        for field in COMPARE_FIELDS:
            f_val = f_rec.get(field)
            d_val = d_rec.get(field)
            if field in FLOAT_FIELDS:
                try:
                    match = abs(float(f_val) - float(d_val)) <= 0.001
                except (TypeError, ValueError):
                    match = (f_val == d_val)
            else:
                match = str(f_val).upper() == str(d_val).upper()
            if not match:
                mismatch_details.append({
                    "transaction_id": tid,
                    "field":  field,
                    "chain":  f_val,
                    "db":     d_val,
                })
                record_ok = False
                break
        if record_ok:
            matched += 1

    tampered = bool(mismatch_details) or bool(only_db) or bool(only_chain)

    return {
        "status":          "tampered" if tampered else "verified",
        "chain_total":     len(fabric_ids),
        "db_total":        len(db_ids),
        "checked":         len(common),
        "matched":         matched,
        "mismatches":      len(mismatch_details),
        "only_in_chain":   len(only_chain),
        "only_in_db":      len(only_db),
        "mismatch_sample": mismatch_details[:3],
        "checked_at":      datetime.now(timezone.utc).isoformat(),
    }


# ── Internal reset (demo only) ───────────────────────────────

@app.post("/internal/reset-demo")
def reset_demo():
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE private_transactions RESTART IDENTITY")
    conn.commit()
    conn.close()
    _notify_clients("reset", {})
    return {"status": "cleared"}


# ── Internal notify (called by Kafka consumer) ────────────────

@app.post("/internal/notify")
async def internal_notify(request: Request):
    """
    Called by kafka_fraud_consumer after saving a new transaction.
    Triggers an immediate SSE push to all connected dashboard clients.
    Restricted to localhost only.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Internal endpoint only")

    body = await request.json()
    _notify_clients("new_transaction", body)
    return {"notified": len(_sse_clients)}


# ── SSE Stream ────────────────────────────────────────────────

@app.get("/api/stream")
async def stream_dashboard(request: Request):
    """
    Event-driven SSE endpoint.

    - Sends a full snapshot immediately on connect
    - Pushes a fresh snapshot when:
        (a) Kafka consumer saves a new transaction  → POST /internal/notify
        (b) A reviewer submits a decision           → POST /api/transactions/{id}/review
    - Sends a keepalive comment every 30s so the
      connection isn't dropped by proxies/browsers
    - No fixed polling interval — only fires when data changes
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=20)
    _sse_clients.add(queue)

    async def event_generator():
        try:
            # Send initial snapshot on connect
            try:
                snapshot = await asyncio.get_event_loop().run_in_executor(
                    None, _build_snapshot
                )
                yield f"event: dashboard\ndata: {json.dumps(snapshot)}\n\n"
            except Exception as e:
                # Keep the stream alive; client will retry on next event/keepalive
                print(f"[SSE] initial snapshot error: {e}", flush=True)
                yield ": keepalive\n\n"

            # Wait for events, push snapshot on each one
            while True:
                if await request.is_disconnected():
                    break

                try:
                    # Block until an event arrives or 30s keepalive timeout
                    event_data = await asyncio.wait_for(queue.get(), timeout=30)

                    # Reset event: notify the client then close this connection.
                    # The browser's EventSource will reconnect automatically and
                    # get a fresh empty snapshot — no manual reconnect needed.
                    if isinstance(event_data, dict) and event_data.get("type") == "reset":
                        yield "event: reset\ndata: {}\n\n"
                        return

                    # Debounce: drain any events that stacked up while
                    # we were building the last snapshot
                    while not queue.empty():
                        queue.get_nowait()

                    try:
                        snapshot = await asyncio.get_event_loop().run_in_executor(
                            None, _build_snapshot
                        )
                        yield f"event: dashboard\ndata: {json.dumps(snapshot)}\n\n"
                    except Exception as e:
                        # Keep the stream alive; don't push a broken event to the client
                        print(f"[SSE] snapshot error: {e}", flush=True)
                        yield ": keepalive\n\n"

                except asyncio.TimeoutError:
                    # Keepalive — SSE comment, ignored by browser
                    yield ": keepalive\n\n"

        finally:
            # Always clean up when client disconnects
            _sse_clients.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )