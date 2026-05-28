import os
import json
import time
import psycopg2
import pandas as pd
from datetime import datetime, timedelta
from confluent_kafka import Producer

from src.demo_deck import DEMO_DECK, deck_total

BOOTSTRAP_SERVERS = "localhost:9092"
TOPIC = "raw-transactions"
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")


def delivery_report(err, msg):
    if err:
        print(f"Delivery failed for {msg.key()}: {err}")


def produce_from_csv(
    txn_path: str,
    kyc_path: str,
    bootstrap_servers: str = BOOTSTRAP_SERVERS,
    delay_seconds: float = 0.5,
    limit: int = 100,
    skip: int = 0,
):
    producer = Producer({"bootstrap.servers": bootstrap_servers})

    txn_df = pd.read_csv(txn_path)
    kyc_df = pd.read_csv(kyc_path)

    if skip > 0:
        txn_df = txn_df.iloc[skip:].reset_index(drop=True)

    txn_df = txn_df.head(limit)
    merged = txn_df.merge(kyc_df, on="IC Number", how="left")

    total = len(merged)
    est   = total * delay_seconds
    print(f"Producing {total} transactions to '{TOPIC}' at {delay_seconds}s delay (~{est:.0f}s total)...")

    for i, (_, row) in enumerate(merged.iterrows(), 1):
        message = row.to_dict()
        message = {k: (None if pd.isna(v) else v) for k, v in message.items()}

        producer.produce(
            TOPIC,
            key=str(message.get("Transaction ID", "")),
            value=json.dumps(message),
            callback=delivery_report,
        )
        producer.poll(0)
        print(f"  [{i}/{total}] {message.get('Transaction ID')} — RM {message.get('Amount (MYR)', '')}")

        if delay_seconds > 0:
            time.sleep(delay_seconds)

    producer.flush()
    print(f"Done. {total} messages sent.")


# ── Demo deck producer ──────────────────────────────────────────────────────

def _historical_max_timestamp() -> datetime:
    """Returns MAX(timestamp) of non-demo rows, or now() if table is empty."""
    conn = psycopg2.connect(POSTGRES_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MAX(timestamp) FROM private_transactions WHERE is_demo = FALSE"
            )
            row = cur.fetchone()
            if row and row[0]:
                return row[0]
    finally:
        conn.close()
    return datetime.now()


def produce_demo_deck(
    bootstrap_servers: str = BOOTSTRAP_SERVERS,
    delay_seconds: float = 2.0,
):
    """
    Plays the curated demo deck once. Each row's timestamp is computed at
    runtime as T0 + offset_seconds, where T0 = MAX(timestamp) of non-demo
    rows in the DB. Rows are tagged is_demo=true so /internal/reset-demo-data
    can wipe just the demo data; the next run starts from the same T0.

    Args:
      delay_seconds: real-world pause between sends (controls demo pace,
                     independent of the in-deck `offset_seconds` story time).
    """
    producer = Producer({"bootstrap.servers": bootstrap_servers})
    total = deck_total()

    t0 = _historical_max_timestamp()
    # Bump 1 minute past T0 so demo data doesn't collide with the last historical row
    anchor = t0 + timedelta(minutes=1)

    print(f"[demo] starting — anchored at {anchor.isoformat()} "
          f"(T0={t0.isoformat()}, {total} txns)")

    for i, deck_row in enumerate(DEMO_DECK, 1):
        offset = deck_row["offset_seconds"]
        real_ts = anchor + timedelta(seconds=offset)

        message = {
            "Transaction ID": f"DEMO{i:04d}",
            "Date & Time":    real_ts.strftime("%Y-%m-%d %H:%M:%S"),
            "is_demo":        True,
        }
        for k, v in deck_row.items():
            if k == "offset_seconds":
                continue
            message[k] = v

        producer.produce(
            TOPIC,
            key=message["Transaction ID"],
            value=json.dumps(message),
            callback=delivery_report,
        )
        producer.poll(0)
        print(f"  [{i}/{total}] {message['Transaction ID']} "
              f"{message['Date & Time']} — RM {message['Amount (MYR)']:>8.2f} "
              f"{'FRAUD' if deck_row['is_fraud'] else 'legit'} "
              f"{deck_row['Cardholder Name']}")

        if delay_seconds > 0:
            time.sleep(delay_seconds)

    producer.flush()
    print(f"[demo] complete ({total} txns sent).")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Produce transactions to Kafka")
    parser.add_argument("--demo",    action="store_true", help="Play the curated demo deck (overrides --txn-csv)")
    parser.add_argument("--limit",   type=int,   default=100, help="CSV mode: number of transactions to send")
    parser.add_argument("--delay",   type=float, default=0.5, help="Seconds between messages")
    parser.add_argument("--skip",    type=int,   default=0,   help="CSV mode: skip first N rows")
    parser.add_argument("--txn-csv", type=str,   default="data/Transaction_Data5k.csv")
    parser.add_argument("--kyc-csv", type=str,   default="data/KYC_Data.csv")
    args = parser.parse_args()

    if args.demo:
        produce_demo_deck(
            delay_seconds=args.delay if args.delay > 0 else 2.0,
        )
    else:
        produce_from_csv(
            txn_path=args.txn_csv,
            kyc_path=args.kyc_csv,
            delay_seconds=args.delay,
            limit=args.limit,
            skip=args.skip,
        )
