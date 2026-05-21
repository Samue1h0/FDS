import json
import time
import pandas as pd
from confluent_kafka import Producer

BOOTSTRAP_SERVERS = "localhost:9092"
TOPIC = "raw-transactions"


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


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Produce transactions to Kafka")
    parser.add_argument("--limit",   type=int,   default=100, help="Number of transactions to send (default: 100)")
    parser.add_argument("--delay",   type=float, default=0.5, help="Seconds between messages (default: 0.5)")
    parser.add_argument("--skip",    type=int,   default=0,   help="Skip first N rows of CSV (default: 0)")
    parser.add_argument("--txn-csv", type=str,   default="data/Transaction_Data5k.csv")
    parser.add_argument("--kyc-csv", type=str,   default="data/KYC_Data.csv")
    args = parser.parse_args()

    produce_from_csv(
        txn_path=args.txn_csv,
        kyc_path=args.kyc_csv,
        delay_seconds=args.delay,
        limit=args.limit,
        skip=args.skip,
    )