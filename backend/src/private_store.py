import json
import psycopg2
from cryptography.fernet import Fernet


class PrivateRecordStore:
    def __init__(self, db_conn, encryption_key: bytes):
        self.conn = db_conn
        self.cipher = Fernet(encryption_key)

    def _encrypt(self, value: str) -> str:
        if value is None:
            return None
        return self.cipher.encrypt(str(value).encode()).decode()

    def save(self, private_record: dict):
        encrypted_ic   = self._encrypt(private_record.get("ic_number"))
        encrypted_card = self._encrypt(private_record.get("card_number"))
        risk_reasons   = private_record.get("risk_reasons", [])
        risk_reasons_json = json.dumps(risk_reasons) if risk_reasons is not None else json.dumps([])

        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO private_transactions (
                    transaction_id,
                    cardholder_name,
                    ic_number_enc,
                    card_number_enc,
                    card_expiration_date,
                    customer_ref,
                    timestamp,
                    amount_myr,
                    merchant_name,
                    mcc,
                    mode,
                    location,
                    ic_hash,
                    masked_card_number,
                    fraud_score,
                    predicted_label,
                    ml_prediction,
                    rule_flag,
                    risk_reasons,
                    ground_truth_label
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (transaction_id) DO NOTHING
            """, (
                private_record.get("transaction_id"),
                private_record.get("cardholder_name"),
                encrypted_ic,
                encrypted_card,
                private_record.get("card_expiration_date"),
                private_record.get("customer_ref"),
                private_record.get("timestamp"),
                private_record.get("amount_myr"),
                private_record.get("merchant_name"),
                private_record.get("mcc"),
                private_record.get("mode"),
                private_record.get("location"),
                private_record.get("ic_hash"),
                private_record.get("masked_card_number"),
                private_record.get("fraud_score"),
                private_record.get("predicted_label"),
                private_record.get("ml_prediction"),
                private_record.get("rule_flag"),
                risk_reasons_json,
                private_record.get("ground_truth_label"),
            ))
        self.conn.commit()

    def update_ground_truth(
        self,
        transaction_id: str,
        ground_truth_label: int,
        reviewer_id: str,
        notes: str = ""
    ):
        if ground_truth_label not in [0, 1]:
            raise ValueError("ground_truth_label must be 0 or 1")
        if not reviewer_id or not reviewer_id.strip():
            raise ValueError("reviewer_id is required")

        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE private_transactions
                SET
                    ground_truth_label = %s,
                    reviewed_by        = %s,
                    reviewed_at        = NOW(),
                    notes              = %s
                WHERE transaction_id = %s
            """, (
                ground_truth_label,
                reviewer_id.strip(),
                notes,
                transaction_id
            ))

            if cur.rowcount == 0:
                raise ValueError(f"Transaction {transaction_id} not found in private store")

        self.conn.commit()

    def close(self):
        self.conn.close()