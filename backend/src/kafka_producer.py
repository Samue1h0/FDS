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
    delay_seconds: float = 1.0,
):
    producer = Producer({"bootstrap.servers": bootstrap_servers})

    txn_df = pd.read_csv(txn_path)
    kyc_df = pd.read_csv(kyc_path)

    merged = txn_df.merge(kyc_df, on="IC Number", how="left")

    print(f"Producing {len(merged)} transactions to '{TOPIC}'...")

    for _, row in merged.iterrows():
        message = row.to_dict()
        message = {k: (None if pd.isna(v) else v) for k, v in message.items()}

        producer.produce(
            TOPIC,
            key=str(message.get("Transaction ID", "")),
            value=json.dumps(message),
            callback=delivery_report,
        )
        producer.poll(0)

        if delay_seconds > 0:
            time.sleep(delay_seconds)

    producer.flush()
    print(f"Done. {len(merged)} messages sent.")


if __name__ == "__main__":
    produce_from_csv(
        txn_path="data/Transaction_Datasetss.csv",
        kyc_path="data/KYC_Dataset.csv",
    )