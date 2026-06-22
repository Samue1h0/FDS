"""
backfill_chain.py — push already-scored historical transactions onto the
Hyperledger Fabric ledger.

The normal data path only writes to chain through the live Kafka pipeline
(raw-transactions → fraud-consumer → scored-transactions → blockchain-consumer
→ Fabric). The batch seed (seed_transactions.py) writes ONLY to Postgres, so
the historical rows never made it on-chain. This one-shot reads those scored
rows straight from `private_transactions` and submits them to Fabric.

It does NOT re-score and does NOT touch Postgres — every field already exists
in the table and maps 1:1 to the chaincode struct. Submitting is idempotent:
the chaincode keys on transaction_id (PutState), so re-running overwrites
rather than duplicating. Safe to re-run.

Prereqs: Fabric network + gateway up (./start.sh handles both). The
blockchain-consumer does NOT need to be running — we submit directly.

Run from backend/:
    python3 -m src.backfill_chain                 # all non-demo rows
    python3 -m src.backfill_chain --include-demo   # include demo-tagged rows
    python3 -m src.backfill_chain --limit 50        # first 50 only
    python3 -m src.backfill_chain --dry-run         # build payloads, submit nothing
    python3 -m src.backfill_chain --with-ground-truth   # also push reviewed labels
"""

import os
import json
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2

from src.fabric_client import FabricClient

POSTGRES_DSN       = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
FABRIC_GATEWAY_URL = os.getenv("FABRIC_GATEWAY_URL", "http://localhost:8080")

# Columns pulled straight from private_transactions, in SELECT order.
SELECT_COLS = [
    "transaction_id", "timestamp", "amount_myr", "merchant_name", "mcc",
    "mode", "location", "customer_ref", "ic_hash", "masked_card_number",
    "fraud_score", "ml_prediction", "rule_flag", "predicted_label",
    "risk_reasons", "ground_truth_label", "reviewed_by", "reviewed_at",
]


def _row_to_payload(row: dict, with_ground_truth: bool) -> dict:
    """Map a private_transactions row to the chaincode FraudTransaction shape.
    Mirrors BlockchainPreprocessor's blockchain_payload exactly."""
    # risk_reasons is stored as a JSON-array TEXT column.
    reasons = row.get("risk_reasons")
    if isinstance(reasons, str) and reasons.strip():
        try:
            reasons = json.loads(reasons)
        except json.JSONDecodeError:
            reasons = []
    if not isinstance(reasons, list):
        reasons = []

    ts = row.get("timestamp")
    timestamp = ts.strftime("%Y-%m-%d %H:%M:%S") if ts is not None else ""

    payload = {
        "transaction_id":     row["transaction_id"],
        "timestamp":          timestamp,
        "amount_myr":         float(row["amount_myr"]) if row["amount_myr"] is not None else 0.0,
        "merchant_name":      row.get("merchant_name") or "",
        "mcc":                str(row.get("mcc") or ""),
        "mode":               row.get("mode") or "",
        "location":           row.get("location") or "",
        "customer_ref":       row.get("customer_ref") or "",
        "ic_hash":            row.get("ic_hash") or "",
        "masked_card_number": row.get("masked_card_number") or "",
        "fraud_score":        float(row["fraud_score"]) if row["fraud_score"] is not None else 0.0,
        "ml_prediction":      int(row["ml_prediction"]) if row["ml_prediction"] is not None else 0,
        "rule_flag":          int(row["rule_flag"]) if row["rule_flag"] is not None else 0,
        "predicted_label":    row.get("predicted_label") or "pending",
        "risk_reasons":       reasons,
    }

    # Optionally carry the reviewer decision onto the initial chain record so a
    # backfilled history reflects past reviews. Without this, on-chain records
    # land unreviewed (ground_truth_label 0 / reviewed_by ""), matching the
    # live path, and a later review (or seed_reviews.py) sets them.
    if with_ground_truth and row.get("reviewed_by"):
        payload["ground_truth_label"] = int(row["ground_truth_label"] or 0)
        payload["reviewed_by"]        = row["reviewed_by"]
        ra = row.get("reviewed_at")
        payload["reviewed_at"]        = ra.strftime("%Y-%m-%d %H:%M:%S") if ra is not None else ""

    return payload


def run(limit=None, include_demo=False, dry_run=False, with_ground_truth=False, workers=1):
    fabric = FabricClient(gateway_url=FABRIC_GATEWAY_URL)
    conn = psycopg2.connect(POSTGRES_DSN)

    where = "" if include_demo else "WHERE is_demo = FALSE"
    sql = f"SELECT {', '.join(SELECT_COLS)} FROM private_transactions {where} ORDER BY timestamp ASC"
    if limit:
        sql += f" LIMIT {int(limit)}"

    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = [dict(zip(SELECT_COLS, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    # The chaincode's CreateTransaction rejects duplicates, so skip anything
    # already on-chain — makes the backfill resumable and re-runnable cleanly.
    if not dry_run:
        try:
            existing = fabric.get_all_transactions() or []
            on_chain = {r.get("transaction_id") for r in existing if isinstance(r, dict)}
            if on_chain:
                before = len(rows)
                rows = [r for r in rows if r["transaction_id"] not in on_chain]
                print(f"Skipping {before - len(rows)} txns already on-chain.")
        except Exception as e:
            print(f"Could not read existing chain records (submitting all): {e}")

    total = len(rows)
    mode = "DRY RUN — nothing submitted" if dry_run else f"submitting to {FABRIC_GATEWAY_URL}"
    print(f"Backfilling {total} transactions onto chain ({mode}, {workers} worker(s))...")

    if dry_run:
        for i, row in enumerate(rows, 1):
            p = _row_to_payload(row, with_ground_truth)
            print(f"  [{i}/{total}] {p['transaction_id']} → {p['predicted_label']} "
                  f"(score {p['fraud_score']:.3f})  [dry-run]")
        print(f"\nDone. {total} would be submitted (dry-run).")
        return

    # Concurrent submission lets the orderer batch many txns into each block,
    # instead of every submit waiting out the per-block batch timeout (~2s).
    # FabricClient uses bare requests.post (no shared Session) → thread-safe.
    counter = {"ok": 0, "failed": 0, "done": 0}
    lock = threading.Lock()

    def submit_one(row):
        payload = _row_to_payload(row, with_ground_truth)
        try:
            fabric.submit_transaction(payload)
            result = ("ok", payload["transaction_id"], None)
        except Exception as e:
            result = ("failed", payload["transaction_id"], str(e))
        with lock:
            counter["done"] += 1
            counter[result[0]] += 1
            d = counter["done"]
            if result[0] == "failed":
                print(f"  [{d}/{total}] FAILED {result[1]}: {result[2]}")
            elif d % 100 == 0 or d == total:
                print(f"  [{d}/{total}] submitted (ok={counter['ok']}, failed={counter['failed']})")
        return result

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(submit_one, row) for row in rows]
        for _ in as_completed(futures):
            pass

    print(f"\nDone. {counter['ok']} submitted, {counter['failed']} failed, {total} total.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill scored Postgres rows onto the Fabric ledger")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N rows")
    parser.add_argument("--include-demo", action="store_true", help="Include is_demo=TRUE rows")
    parser.add_argument("--dry-run", action="store_true", help="Build payloads but submit nothing")
    parser.add_argument("--with-ground-truth", action="store_true",
                        help="Also push reviewer decisions (ground_truth/reviewed_by) for already-reviewed rows")
    parser.add_argument("--workers", type=int, default=16,
                        help="Concurrent submitters (default 16; orderer batches them per block)")
    args = parser.parse_args()
    run(limit=args.limit, include_demo=args.include_demo,
        dry_run=args.dry_run, with_ground_truth=args.with_ground_truth, workers=args.workers)
