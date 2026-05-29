"""
Seed default analyst accounts into the users table.
Run once after creating the users table.

Usage (from backend/ directory):
    POSTGRES_DSN=postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private \
    python3 -m src.seed_users
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import psycopg2
from src.user_store import hash_password

POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")

USERS = [
    {"username": "analyst1", "password": "analyst123", "role": "analyst"},
    {"username": "analyst2", "password": "analyst123", "role": "analyst"},
    {"username": "admin",    "password": "admin123",   "role": "admin"},
    # Team accounts (display name + avatar mapped in frontend userDirectory.ts)
    {"username": "CCX",  "password": "ccx12345",  "role": "analyst"},  # Chun Xian
    {"username": "Hong", "password": "hong12345", "role": "analyst"},  # Mun Hong
    {"username": "Sam",  "password": "sam12345",  "role": "analyst"},  # Sam
    {"username": "Siew", "password": "siew12345", "role": "analyst"},  # Yat Fei
]


def main():
    conn = psycopg2.connect(POSTGRES_DSN)
    for u in USERS:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, role)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (username) DO NOTHING
                    """,
                    (u["username"], hash_password(u["password"]), u["role"]),
                )
            conn.commit()
            print(f"  Seeded: {u['username']} ({u['role']})")
        except Exception as e:
            print(f"  Error seeding {u['username']}: {e}")
            conn.rollback()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
