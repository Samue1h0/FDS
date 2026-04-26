import json
import os
import time
import requests
from confluent_kafka import Consumer, Producer, KafkaError
from src.fabric_client import FabricClient

BOOTSTRAP_SERVERS  = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
FABRIC_GATEWAY_URL = os.getenv("FABRIC_GATEWAY_URL", "http://localhost:8080")
FASTAPI_URL        = os.getenv("FASTAPI_URL", "http://localhost:8000")


def notify_fastapi(transaction_id: str, predicted_label: str, fraud_score: float):
    """
    Pings FastAPI after the transaction is confirmed on-chain so the SSE
    stream pushes a fresh snapshot that actually includes the new record.
    Fire-and-forget — never raises, never blocks the consumer.
    """
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

INPUT_TOPIC = "scored-transactions"
DLQ_TOPIC   = "dead-letter-transactions"
GROUP_ID    = "blockchain-submit-group"

MAX_RETRIES = 3
RETRY_DELAY = 2


def run():
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    producer = Producer({"bootstrap.servers": BOOTSTRAP_SERVERS})
    consumer.subscribe([INPUT_TOPIC])

    fabric = FabricClient(gateway_url=FABRIC_GATEWAY_URL)

    print(f"Blockchain consumer started, listening on '{INPUT_TOPIC}'...")

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
                payload = json.loads(msg.value().decode("utf-8"))
                txn_id  = payload.get("transaction_id", "unknown")

                submitted = False
                for attempt in range(1, MAX_RETRIES + 1):
                    try:
                        response = fabric.submit_transaction(payload)
                        print(f"Submitted to blockchain: {txn_id} → {response}")
                        submitted = True
                        break
                    except Exception as e:
                        print(f"Attempt {attempt} failed for {txn_id}: {e}")
                        if attempt < MAX_RETRIES:
                            time.sleep(RETRY_DELAY)

                if submitted:
                    notify_fastapi(
                        transaction_id=txn_id,
                        predicted_label=payload.get("predicted_label", ""),
                        fraud_score=payload.get("fraud_score", 0.0),
                    )
                else:
                    print(f"Sending {txn_id} to DLQ after {MAX_RETRIES} failed attempts")
                    producer.produce(
                        DLQ_TOPIC,
                        key=txn_id,
                        value=json.dumps({
                            "error": "Max retries exceeded",
                            "payload": payload,
                        }),
                    )
                    producer.flush()

                consumer.commit(asynchronous=False)

            except Exception as e:
                print(f"Fatal error on message: {e}")
                consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()
        print("Blockchain consumer shut down.")


if __name__ == "__main__":
    run()