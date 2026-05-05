import os
import asyncio
import json
import psycopg2
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict

from src.fabric_client import FabricClient
from src.private_store import PrivateRecordStore

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

            # ── Trend ─────────────────────────────────────────────
            cur.execute("""
                SELECT DATE(timestamp)::text, predicted_label, COUNT(*)
                FROM private_transactions
                WHERE predicted_label IN ('FRAUD', 'LEGIT')
                GROUP BY DATE(timestamp), predicted_label
                ORDER BY 1
            """)
            trend_map = defaultdict(lambda: {"FRAUD": 0, "LEGIT": 0})
            for date, label, cnt in cur.fetchall():
                trend_map[date][label] = int(cnt)

            # ── Score distribution ─────────────────────────────────
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE fraud_score < 0.2)                        AS b1,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.2 AND fraud_score < 0.4) AS b2,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.4 AND fraud_score < 0.6) AS b3,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.6 AND fraud_score < 0.8) AS b4,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.8)                       AS b5
                FROM private_transactions
                WHERE fraud_score IS NOT NULL
            """)
            b1, b2, b3, b4, b5 = cur.fetchone()

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
            {"range": "0.0-0.2", "count": int(b1)},
            {"range": "0.2-0.4", "count": int(b2)},
            {"range": "0.4-0.6", "count": int(b3)},
            {"range": "0.6-0.8", "count": int(b4)},
            {"range": "0.8-1.0", "count": int(b5)},
        ],
        "recent_transactions": recent,
    }


# ── Models ────────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    ground_truth_label: int
    reviewer_id: str
    notes: Optional[str] = ""


# ── Transactions ──────────────────────────────────────────────

@app.get("/api/transactions")
def list_transactions(
    decision: Optional[str] = Query(None),
    reviewed: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    try:
        result = fabric.get_all_transactions()
        transactions = result if isinstance(result, list) else result.get("transactions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fabric error: {e}")

    if decision:
        transactions = [t for t in transactions if t.get("predicted_label", "").upper() == decision.upper()]
    if reviewed is not None:
        if reviewed:
            transactions = [t for t in transactions if t.get("reviewed_by", "") != ""]
        else:
            transactions = [t for t in transactions if t.get("reviewed_by", "") == ""]
    if search:
        s = search.lower()
        transactions = [
            t for t in transactions
            if s in t.get("transaction_id", "").lower()
            or s in t.get("merchant_name", "").lower()
            or s in t.get("customer_ref", "").lower()
        ]

    total = len(transactions)
    return {"total": total, "transactions": transactions[offset: offset + limit]}


@app.get("/api/transactions/{transaction_id}")
def get_transaction(transaction_id: str):
    try:
        blockchain_data = fabric.get_transaction(transaction_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Transaction not found: {e}")

    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cardholder_name, card_expiration_date,
                       reviewed_by, reviewed_at, notes
                FROM private_transactions
                WHERE transaction_id = %s
            """, (transaction_id,))
            row = cur.fetchone()
        conn.close()
        if row:
            blockchain_data["cardholder_name"]      = row[0]
            blockchain_data["card_expiration_date"]  = row[1]
            blockchain_data["private_reviewed_by"]   = row[2]
            blockchain_data["private_reviewed_at"]   = str(row[3]) if row[3] else ""
            blockchain_data["notes"]                 = row[4]
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
                SELECT DATE(timestamp)::text, predicted_label, COUNT(*)
                FROM private_transactions
                WHERE predicted_label IN ('FRAUD', 'LEGIT')
                GROUP BY DATE(timestamp), predicted_label
                ORDER BY 1
            """)
            rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    trend = defaultdict(lambda: {"FRAUD": 0, "LEGIT": 0})
    for date, label, cnt in rows:
        trend[date][label] = int(cnt)

    return [
        {"date": d, "fraud": c["FRAUD"], "legit": c["LEGIT"]}
        for d, c in sorted(trend.items())
    ]


@app.get("/api/charts/score-distribution")
def score_distribution():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE fraud_score < 0.2)                        AS b1,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.2 AND fraud_score < 0.4) AS b2,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.4 AND fraud_score < 0.6) AS b3,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.6 AND fraud_score < 0.8) AS b4,
                    COUNT(*) FILTER (WHERE fraud_score >= 0.8)                       AS b5
                FROM private_transactions
                WHERE fraud_score IS NOT NULL
            """)
            b1, b2, b3, b4, b5 = cur.fetchone()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return [
        {"range": "0.0-0.2", "count": int(b1)},
        {"range": "0.2-0.4", "count": int(b2)},
        {"range": "0.4-0.6", "count": int(b3)},
        {"range": "0.6-0.8", "count": int(b4)},
        {"range": "0.8-1.0", "count": int(b5)},
    ]


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