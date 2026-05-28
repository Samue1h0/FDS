"""One-shot backfill for the card-freeze feature.

Run once after adding the card_hash column + frozen_cards table to an existing
database:

    python -m src.backfill_frozen_cards

Step 1 — decrypt card_number_enc on every row missing card_hash and populate it
         (same hash as the live scoring path, so future joins line up).
Step 2 — walk FRAUD rows oldest-first and freeze each card at its first fraud.

Idempotent: re-running only fills gaps (NULL card_hash) and ON CONFLICT skips
cards already frozen.
"""

import os
import psycopg2
from cryptography.fernet import Fernet, InvalidToken

from src.blockchain_preprocessing import BlockchainPreprocessor

POSTGRES_DSN   = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "").encode()


def backfill_card_hash(conn, preproc, cipher):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, card_number_enc
            FROM private_transactions
            WHERE card_hash IS NULL AND card_number_enc IS NOT NULL
        """)
        rows = cur.fetchall()

    updated, skipped = 0, 0
    with conn.cursor() as cur:
        for row_id, enc in rows:
            try:
                card_number = cipher.decrypt(enc.encode()).decode()
            except (InvalidToken, Exception):
                skipped += 1
                continue
            cur.execute(
                "UPDATE private_transactions SET card_hash = %s WHERE id = %s",
                (preproc._hash_card(card_number), row_id),
            )
            updated += 1
    conn.commit()
    print(f"card_hash backfill: {updated} updated, {skipped} skipped (decrypt failed)")


def backfill_frozen_cards(conn):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO frozen_cards (
                card_hash, customer_ref, cardholder_name, card_last4,
                frozen_at, trigger_txn_id, trigger_reasons
            )
            SELECT DISTINCT ON (card_hash)
                card_hash,
                customer_ref,
                cardholder_name,
                RIGHT(masked_card_number, 4),
                timestamp,
                transaction_id,
                COALESCE(risk_reasons, '[]')
            FROM private_transactions
            WHERE predicted_label = 'FRAUD' AND card_hash IS NOT NULL
            ORDER BY card_hash, timestamp ASC
            ON CONFLICT (card_hash) DO NOTHING
        """)
        inserted = cur.rowcount
    conn.commit()
    print(f"frozen_cards backfill: {inserted} cards frozen")


def run():
    if not ENCRYPTION_KEY:
        raise SystemExit("ENCRYPTION_KEY env var is required to decrypt card numbers")
    conn = psycopg2.connect(POSTGRES_DSN)
    cipher = Fernet(ENCRYPTION_KEY)
    preproc = BlockchainPreprocessor()
    try:
        backfill_card_hash(conn, preproc, cipher)
        backfill_frozen_cards(conn)
    finally:
        conn.close()
    print("Backfill complete.")


if __name__ == "__main__":
    run()
