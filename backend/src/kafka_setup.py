from confluent_kafka.admin import AdminClient, NewTopic

TOPICS = [
    "raw-transactions",
    "scored-transactions",
    "dead-letter-transactions",
]

def create_topics(bootstrap_servers: str = "localhost:9092"):
    admin = AdminClient({"bootstrap.servers": bootstrap_servers})
    new_topics = [
        NewTopic(t, num_partitions=3, replication_factor=1)
        for t in TOPICS
    ]
    futures = admin.create_topics(new_topics)
    for topic, future in futures.items():
        try:
            future.result()
            print(f"Created topic: {topic}")
        except Exception as e:
            print(f"Topic '{topic}' already exists or error: {e}")

if __name__ == "__main__":
    create_topics()