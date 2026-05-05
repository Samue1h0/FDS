import json
import os
import psycopg2
import pandas as pd
import requests
from confluent_kafka import Consumer, Producer, KafkaError
from cryptography.fernet import Fernet

from src.fraud_scorer import FraudScorer
from src.private_store import PrivateRecordStore

BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POSTGRES_DSN      = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
ENCRYPTION_KEY    = os.getenv("ENCRYPTION_KEY", "").encode()
FASTAPI_URL       = os.getenv("FASTAPI_URL", "http://localhost:8000")


def notify_fastapi(transaction_id: str, predicted_label: str, fraud_score: float):
    try:
        requests.post(
            f"{FASTAPI_URL}/internal/notify",
            json={
                "transaction_id":  transaction_id,
                "predicted_label": predicted_label,
                "fraud_score":     fraud_score,
            },
            timeout=2,
        )
    except Exception:
        pass

INPUT_TOPIC  = "raw-transactions"
OUTPUT_TOPIC = "scored-transactions"
DLQ_TOPIC    = "dead-letter-transactions"
GROUP_ID     = "fraud-scoring-group"


def run():
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    producer = Producer({"bootstrap.servers": BOOTSTRAP_SERVERS})

    conn = psycopg2.connect(POSTGRES_DSN)
    private_store = PrivateRecordStore(conn, ENCRYPTION_KEY)

    kyc_df = pd.read_csv("data/KYC_Dataset.csv")
    txn_df = pd.read_csv("data/Transaction_Datasetss.csv")
    scorer = FraudScorer(kyc_df=kyc_df, history_df=txn_df.merge(kyc_df, on="IC Number", how="left"))

    consumer.subscribe([INPUT_TOPIC])
    print(f"Fraud scoring consumer started, listening on '{INPUT_TOPIC}'...")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() != KafkaError._PARTITION_EOF:
                    print(f"Consumer error: {msg.error()}")
                continue

            try:
                row    = json.loads(msg.value().decode("utf-8"))
                txn_id = row.get("Transaction ID", "unknown")

                result = scorer.score(row)

                if result["status"] == "REJECTED":
                    print(f"REJECTED {txn_id}: {result['errors']}")
                    producer.produce(
                        DLQ_TOPIC,
                        key=txn_id,
                        value=json.dumps({"transaction_id": txn_id, "errors": result["errors"]}),
                    )
                else:
                    bp = result["blockchain_payload"]
                    pr = result["private_record"]
                    pr["fraud_score"]        = bp["fraud_score"]
                    pr["predicted_label"]    = bp["predicted_label"]
                    pr["ml_prediction"]      = bp["ml_prediction"]
                    pr["rule_flag"]          = bp["rule_flag"]
                    pr["risk_reasons"]       = bp["risk_reasons"]
                    pr["ic_hash"]            = bp["ic_hash"]
                    pr["masked_card_number"] = bp["masked_card_number"]

                    private_store.save(pr)
                    notify_fastapi(
                        transaction_id=bp["transaction_id"],
                        predicted_label=bp["predicted_label"],
                        fraud_score=bp["fraud_score"],
                    )

                    producer.produce(
                        OUTPUT_TOPIC,
                        key=result["blockchain_payload"]["transaction_id"],
                        value=json.dumps(result["blockchain_payload"]),
                    )

                    label = result["blockchain_payload"]["predicted_label"]
                    score = result["blockchain_payload"]["fraud_score"]
                    print(f"ACCEPTED {txn_id} → {label} (score={score})")

                producer.flush()
                consumer.commit(asynchronous=False)

            except Exception as e:
                print(f"Error processing {msg.key()}: {e}")
                producer.produce(
                    DLQ_TOPIC,
                    key=str(msg.key()),
                    value=json.dumps({"error": str(e)}),
                )
                producer.flush()
                consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()
        private_store.close()
        print("Consumer shut down.")


if __name__ == "__main__":
    run()