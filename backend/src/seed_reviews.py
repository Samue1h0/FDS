"""
seed_reviews.py — mark a sample of historical transactions as reviewed so the
dashboard's Review Progress (and per-analyst review stats) isn't stuck at 0%.

It mirrors the real review path exactly — the same two writes the
POST /api/transactions/{id}/review endpoint does:
    1. fabric.update_ground_truth(...)        # reviewer decision on-chain
    2. private_store.update_ground_truth(...)  # Postgres ground_truth/reviewed_by
    3. private_store.reconcile_card_freeze(...) # unfreeze cleared false-positives

The review OUTCOME uses each row's existing ground_truth_label (the CSV truth
loaded by seed_transactions), so the dashboard's agreement-rate card reflects
the model's real accuracy rather than random labels. Reviews are attributed
round-robin across the analyst accounts so per-user stats look realistic.

Picks the riskiest unreviewed rows first (fraud_score DESC) — how an analyst
would actually work the queue.

Prereqs: Postgres up. For the on-chain write, the rows must already be on the
ledger (run backfill_chain.py first) and the gateway must be up; if not, pass
--skip-chain (Postgres-only, still moves the progress bar) or let per-row chain
failures fall through (they're warned, not fatal).

Run from backend/:
    python3 -m src.seed_reviews --count 250
    python3 -m src.seed_reviews --count 250 --skip-chain
    python3 -m src.seed_reviews --count 100 --reviewer Sam
    python3 -m src.seed_reviews --dry-run
"""

import os
import argparse

import psycopg2

from src.fabric_client import FabricClient
from src.private_store import PrivateRecordStore

POSTGRES_DSN       = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
FABRIC_GATEWAY_URL = os.getenv("FABRIC_GATEWAY_URL", "http://localhost:8080")
ENCRYPTION_KEY     = os.getenv("ENCRYPTION_KEY")


def _reviewers(conn, forced=None):
    if forced:
        return [forced]
    with conn.cursor() as cur:
        cur.execute("SELECT username FROM users WHERE role = 'analyst' ORDER BY username")
        names = [r[0] for r in cur.fetchall()]
    return names or ["analyst1"]


def run(count=250, reviewer=None, skip_chain=False, dry_run=False):
    conn = psycopg2.connect(POSTGRES_DSN)
    fabric = FabricClient(gateway_url=FABRIC_GATEWAY_URL)
    store = PrivateRecordStore(conn, ENCRYPTION_KEY)

    reviewers = _reviewers(conn, reviewer)
    print(f"Reviewers: {', '.join(reviewers)}")

    # Unreviewed rows that have a known truth label, riskiest first.
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT transaction_id, ground_truth_label, card_hash
            FROM private_transactions
            WHERE (reviewed_by IS NULL OR reviewed_by = '')
              AND ground_truth_label IS NOT NULL
            ORDER BY fraud_score DESC NULLS LAST, transaction_id
            LIMIT %s
            """,
            (count,),
        )
        rows = cur.fetchall()

    total = len(rows)
    if total == 0:
        print("Nothing to review — no unreviewed rows with a ground-truth label.")
        store.close()
        return

    print(f"Reviewing {total} transactions "
          f"({'DRY RUN' if dry_run else 'Postgres' + ('' if skip_chain else ' + chain')})...")

    reviewed = chain_fail = 0
    for i, (txn_id, truth, card_hash) in enumerate(rows, 1):
        who = reviewers[i % len(reviewers)]
        label = int(truth)
        if dry_run:
            print(f"  [{i}/{total}] {txn_id} → {'FRAUD' if label else 'LEGIT'} by {who}  [dry-run]")
            reviewed += 1
            continue

        if not skip_chain:
            try:
                fabric.update_ground_truth(transaction_id=txn_id, ground_truth_label=label, reviewer_id=who)
            except Exception as e:
                chain_fail += 1
                print(f"  [{i}/{total}] chain update failed for {txn_id} (continuing on Postgres): {e}")

        store.update_ground_truth(transaction_id=txn_id, ground_truth_label=label,
                                  reviewer_id=who, notes="seeded review")
        if card_hash:
            store.reconcile_card_freeze(card_hash)
        reviewed += 1
        if i % 50 == 0 or i == total:
            print(f"  [{i}/{total}] reviewed (chain failures so far: {chain_fail})")

    store.close()
    print(f"\nDone. {reviewed} reviewed"
          + ("" if skip_chain or dry_run else f", {chain_fail} chain failures") + ".")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed reviewed transactions so Review Progress isn't 0%")
    parser.add_argument("--count", type=int, default=250, help="How many rows to mark reviewed")
    parser.add_argument("--reviewer", type=str, default=None, help="Force one reviewer username (else round-robin analysts)")
    parser.add_argument("--skip-chain", action="store_true", help="Postgres only — don't write to Fabric")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be reviewed, write nothing")
    args = parser.parse_args()
    run(count=args.count, reviewer=args.reviewer, skip_chain=args.skip_chain, dry_run=args.dry_run)
