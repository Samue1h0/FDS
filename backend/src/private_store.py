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
                    card_hash,
                    masked_card_number,
                    fraud_score,
                    predicted_label,
                    ml_prediction,
                    rule_flag,
                    risk_reasons,
                    ground_truth_label,
                    is_demo
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (transaction_id) DO UPDATE SET
                    mcc                = EXCLUDED.mcc,
                    mode               = EXCLUDED.mode,
                    location           = EXCLUDED.location,
                    ic_hash            = EXCLUDED.ic_hash,
                    card_hash          = EXCLUDED.card_hash,
                    masked_card_number = EXCLUDED.masked_card_number,
                    fraud_score        = EXCLUDED.fraud_score,
                    predicted_label    = EXCLUDED.predicted_label,
                    ml_prediction      = EXCLUDED.ml_prediction,
                    rule_flag          = EXCLUDED.rule_flag,
                    risk_reasons       = EXCLUDED.risk_reasons,
                    is_demo            = EXCLUDED.is_demo
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
                private_record.get("card_hash"),
                private_record.get("masked_card_number"),
                private_record.get("fraud_score"),
                private_record.get("predicted_label"),
                private_record.get("ml_prediction"),
                private_record.get("rule_flag"),
                risk_reasons_json,
                private_record.get("ground_truth_label"),
                bool(private_record.get("is_demo", False)),
            ))
        self.conn.commit()

    def freeze_card(
        self,
        card_hash: str,
        customer_ref: str,
        cardholder_name: str,
        card_last4: str,
        frozen_at,
        trigger_txn_id: str,
        trigger_reasons,
    ):
        """Record a card freeze triggered by a FRAUD decision. Keyed by
        card_hash; the first fraud wins (ON CONFLICT DO NOTHING), so duplicate
        or later fraud transactions on the same card don't reset frozen_at."""
        if not card_hash:
            return
        reasons_json = json.dumps(trigger_reasons if trigger_reasons is not None else [])
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO frozen_cards (
                    card_hash, customer_ref, cardholder_name, card_last4,
                    frozen_at, trigger_txn_id, trigger_reasons
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (card_hash) DO NOTHING
            """, (
                card_hash,
                customer_ref,
                cardholder_name,
                card_last4,
                frozen_at,
                trigger_txn_id,
                reasons_json,
            ))
        self.conn.commit()

    def reconcile_card_freeze(self, card_hash: str):
        """Recompute a card's freeze after a review changed its labels. A card
        stays frozen while it has a 'standing fraud' (predicted FRAUD and NOT
        reviewed-legit, i.e. ground_truth_label IS DISTINCT FROM 0). Re-points
        frozen_cards to the EARLIEST standing fraud, or deletes the row
        (unfreezes) when none remain."""
        if not card_hash:
            return
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT transaction_id, timestamp, customer_ref, cardholder_name,
                       masked_card_number, risk_reasons
                FROM private_transactions
                WHERE card_hash = %s
                  AND predicted_label = 'FRAUD'
                  AND ground_truth_label IS DISTINCT FROM 0
                ORDER BY timestamp ASC
                LIMIT 1
            """, (card_hash,))
            row = cur.fetchone()
            if row is None:
                cur.execute("DELETE FROM frozen_cards WHERE card_hash = %s", (card_hash,))
            else:
                txn_id, ts, customer_ref, cardholder_name, masked, reasons = row
                cur.execute("""
                    INSERT INTO frozen_cards (
                        card_hash, customer_ref, cardholder_name, card_last4,
                        frozen_at, trigger_txn_id, trigger_reasons
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (card_hash) DO UPDATE SET
                        customer_ref    = EXCLUDED.customer_ref,
                        cardholder_name = EXCLUDED.cardholder_name,
                        card_last4      = EXCLUDED.card_last4,
                        frozen_at       = EXCLUDED.frozen_at,
                        trigger_txn_id  = EXCLUDED.trigger_txn_id,
                        trigger_reasons = EXCLUDED.trigger_reasons
                """, (card_hash, customer_ref, cardholder_name, (masked or "")[-4:],
                      ts, txn_id, reasons))
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