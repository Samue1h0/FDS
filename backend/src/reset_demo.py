"""
Deletes the demo batch (first 100 rows of Transaction_Data5k.csv) from
private_transactions so the live demo can be re-run cleanly.

Historical data (rows 101+) is untouched.

Usage (from backend/ directory):
    POSTGRES_DSN=postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private \
    python3 -m src.reset_demo
"""

import os
import sys
import pandas as pd
import psycopg2

POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
TXN_CSV      = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "Transaction_Data5k.csv")
DEMO_ROWS    = 100


def main():
    demo_ids = pd.read_csv(TXN_CSV)["Transaction ID"].head(DEMO_ROWS).tolist()
    print(f"Deleting {len(demo_ids)} demo transactions ({demo_ids[0]} → {demo_ids[-1]})...")

    conn = psycopg2.connect(POSTGRES_DSN)
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM private_transactions WHERE transaction_id = ANY(%s)",
            (demo_ids,)
        )
        deleted = cur.rowcount
    conn.commit()
    conn.close()

    print(f"Done — {deleted} rows deleted. Ready for next demo run.")


if __name__ == "__main__":
    main()
