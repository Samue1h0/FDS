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

# `email` = the Google account allowed to "Sign in with Google" as this user
# (must match exactly). Leave None for accounts without Google login.
USERS = [
    {"username": "analyst1", "password": "analyst123", "role": "analyst", "email": None},
    {"username": "analyst2", "password": "analyst123", "role": "analyst", "email": None},
    {"username": "admin",    "password": "admin123",   "role": "admin",   "email": None},
    # Team accounts (display name + avatar mapped in frontend userDirectory.ts)
    {"username": "CCX",  "password": "ccx12345",  "role": "analyst", "email": "ccxian97@gmail.com"},    # Chun Xian
    {"username": "Hong", "password": "hong12345", "role": "analyst", "email": "gohmunhong@gmail.com"},  # Mun Hong
    {"username": "Sam",  "password": "sam12345",  "role": "analyst", "email": "143samuelho@gmail.com"}, # Sam
    {"username": "Siew", "password": "siew12345", "role": "analyst", "email": "siao.alter@gmail.com"},  # Yat Fei
]


def main():
    conn = psycopg2.connect(POSTGRES_DSN)
    for u in USERS:
        try:
            with conn.cursor() as cur:
                # Insert new accounts; for existing ones, keep the password but
                # refresh the email (so adding an SSO email here + re-running
                # this script is enough to enable Google login for that user).
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, role, email)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email
                    """,
                    (u["username"], hash_password(u["password"]), u["role"], u["email"]),
                )
            conn.commit()
            print(f"  Seeded: {u['username']} ({u['role']}) email={u['email'] or '-'}")
        except Exception as e:
            print(f"  Error seeding {u['username']}: {e}")
            conn.rollback()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
