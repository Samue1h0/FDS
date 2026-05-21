"""
One-time script: seeds kyc_profiles table from KYC_Data.csv.
Uses the same BlockchainPreprocessor logic so customer_ref assignments
are identical to what's already written into existing transaction records.

Usage (from backend/ directory):
    POSTGRES_DSN=postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private \
    ENCRYPTION_KEY=<your_key> \
    python3 -m src.seed_kyc
"""

import os
import sys
import pandas as pd
import psycopg2
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.blockchain_preprocessing import BlockchainPreprocessor
from src.kyc_store import KYCStore

POSTGRES_DSN   = os.getenv("POSTGRES_DSN",   "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "").encode()
KYC_CSV        = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "KYC_Data.csv")


def _parse_dob(val) -> "datetime.date | None":
    if pd.isna(val):
        return None
    for fmt in ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            continue
    return None


def main():
    print(f"Loading {KYC_CSV} ...")
    kyc_df = pd.read_csv(KYC_CSV)
    print(f"  {len(kyc_df)} rows loaded")

    # Run through BlockchainPreprocessor so customer_ref assignments
    # are identical to what the consumer has been using.
    bp = BlockchainPreprocessor(kyc_df=kyc_df)
    kyc_with_refs = bp.kyc_df

    conn  = psycopg2.connect(POSTGRES_DSN)
    store = KYCStore(conn, ENCRYPTION_KEY)

    inserted = skipped = 0

    for _, row in kyc_with_refs.iterrows():
        ic_number    = str(row.get("IC Number", "")).strip()
        customer_ref = str(row.get("customer_ref", "")).strip()

        if not ic_number or not customer_ref:
            skipped += 1
            continue

        record = {
            "customer_ref":      customer_ref,
            "ic_number":         ic_number,
            "name":              str(row.get("Name", "")).strip() or None,
            "date_of_birth":     _parse_dob(row.get("Date of Birth")),
            "gender":            str(row.get("Gender", "")).strip() or None,
            "phone_number":      str(row.get("Phone Number", "")).strip() or None,
            "street_address":    str(row.get("Street Address", "")).strip() or None,
            "city":              str(row.get("City", "")).strip() or None,
            "state":             str(row.get("State", "")).strip() or None,
            "country":           str(row.get("Country", "")).strip() or None,
            "nationality":       str(row.get("Nationality", "")).strip() or None,
            "marital_status":    str(row.get("Marital Status", "")).strip() or None,
            "employment_status": str(row.get("Employment Status", "")).strip() or None,
            "job_title":         str(row.get("Job Title", "")).strip() or None,
            "income_range":      str(row.get("Income Range", "")).strip() or None,
        }

        store.upsert(record)
        inserted += 1

        if inserted % 100 == 0:
            print(f"  {inserted} records upserted...")

    store.close()
    print(f"\nDone — inserted/updated: {inserted}, skipped: {skipped}")


if __name__ == "__main__":
    main()
