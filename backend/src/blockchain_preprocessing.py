import json
import hashlib
import uuid
from datetime import datetime
import pandas as pd


class BlockchainPreprocessor:
    def __init__(self, kyc_df=None, strict=True):
        self.strict = strict
        self.rejection_log = []
        self.customer_ref_map = {}
        self.kyc_df = None

        if kyc_df is not None:
            self.kyc_df = self._prepare_kyc_dataframe(kyc_df)
            self._initialize_customer_ref_map(self.kyc_df)

    # ----------------------------------------------------------
    # Prepare KYC dataframe and ensure customer_ref exists
    # ----------------------------------------------------------
    def _prepare_kyc_dataframe(self, kyc_df):
        if "IC Number" not in kyc_df.columns:
            raise ValueError("KYC dataset must contain 'IC Number' column")

        kyc_df = kyc_df.copy()
        kyc_df["IC Number"] = kyc_df["IC Number"].astype(str).str.strip()

        kyc_df = kyc_df[kyc_df["IC Number"] != ""]

        if "customer_ref" not in kyc_df.columns:
            kyc_df["customer_ref"] = None

        next_id = 1

        existing_refs = kyc_df["customer_ref"].dropna().astype(str).str.strip()
        numeric_ids = []

        for ref in existing_refs:
            if ref.startswith("CUST"):
                suffix = ref.replace("CUST", "")
                if suffix.isdigit():
                    numeric_ids.append(int(suffix))

        if numeric_ids:
            next_id = max(numeric_ids) + 1

        for idx in kyc_df.index:
            current_ref = kyc_df.at[idx, "customer_ref"]
            if pd.isna(current_ref) or str(current_ref).strip() == "":
                kyc_df.at[idx, "customer_ref"] = f"CUST{next_id:06d}"
                next_id += 1

        return kyc_df

    # ----------------------------------------------------------
    # Build lookup map
    # ----------------------------------------------------------
    def _initialize_customer_ref_map(self, kyc_df):
        for _, row in kyc_df.iterrows():
            ic_number = str(row["IC Number"]).strip()
            customer_ref = str(row["customer_ref"]).strip()
            if ic_number and customer_ref:
                self.customer_ref_map[ic_number] = customer_ref

    # ----------------------------------------------------------
    # Save updated KYC file if needed
    # ----------------------------------------------------------
    def save_updated_kyc(self, filename="KYC_Dataset_with_customer_ref.csv"):
        if self.kyc_df is None:
            raise ValueError("No KYC dataframe loaded")
        self.kyc_df.to_csv(filename, index=False)
        print(f"Updated KYC file saved to {filename}")

    # ----------------------------------------------------------
    # Public: process one raw transaction row
    # ----------------------------------------------------------
    def process_transaction(self, row):
        errors = []
        cleaned = self._clean_raw_transaction(row, errors)

        if errors:
            self._log_rejection(row, errors)
            return None, errors

        customer_ref = self._get_customer_ref(cleaned["ic_number"], errors)
        ic_hash = self._hash_ic(cleaned["ic_number"])
        card_hash = self._hash_card(cleaned["card_number"])
        masked_card_number = self._mask_card(cleaned["card_number"])

        if errors:
            self._log_rejection(row, errors)
            return None, errors

        private_record = {
            "transaction_id":       cleaned["transaction_id"],
            "cardholder_name":      cleaned["cardholder_name"],
            "ic_number":            cleaned["ic_number"],
            "card_number":          cleaned["card_number"],
            "card_expiration_date": cleaned["card_expiration_date"],
            "card_hash":            card_hash,
            "customer_ref":         customer_ref,
            "timestamp":            cleaned["timestamp"],
            "amount_myr":           cleaned["amount_myr"],
            "merchant_name":        cleaned["merchant_name"],
            "mcc":                  cleaned["mcc"],
            "mode":                 cleaned["mode"],
            "location":             cleaned["location"],
            "ip_address":           cleaned["ip_address"],
            "device_information":   cleaned["device_information"],
            "ground_truth_label":   cleaned["ground_truth_label"],
            "is_demo":              bool(row.get("is_demo", False)),
        }

        blockchain_payload = {
            "transaction_id":     cleaned["transaction_id"],
            "timestamp":          cleaned["timestamp"],
            "amount_myr":         cleaned["amount_myr"],
            "merchant_name":      cleaned["merchant_name"],
            "mcc":                cleaned["mcc"],
            "mode":               cleaned["mode"],
            "location":           cleaned["location"],
            "customer_ref":       customer_ref,
            "ic_hash":            ic_hash,
            "masked_card_number": masked_card_number,
            "fraud_score":        None,
            "ml_prediction":      None,
            "rule_flag":          None,
            "predicted_label":    "pending",
            "risk_reasons":       [],
        }

        return {
            "private_record": private_record,
            "blockchain_payload": blockchain_payload
        }, None

    # ----------------------------------------------------------
    # Get customer_ref strictly from KYC mapping
    # ----------------------------------------------------------
    def _get_customer_ref(self, ic_number, errors):
        ic_number = str(ic_number).strip()

        if ic_number in self.customer_ref_map:
            return self.customer_ref_map[ic_number]

        errors.append(f"IC Number not found in KYC dataset: {ic_number}")
        return None

    # ----------------------------------------------------------
    # Dataset processor
    # ----------------------------------------------------------
    def process_dataset(self, raw_transactions):
        accepted = []
        for row in raw_transactions:
            result, errors = self.process_transaction(row)
            if result:
                accepted.append(result)
        return accepted

    # ----------------------------------------------------------
    # Raw transaction cleaning
    # ----------------------------------------------------------
    def _clean_raw_transaction(self, row, errors):
        def get_value(key, required=True):
            value = row.get(key)
            if required and (value is None or str(value).strip() == ""):
                errors.append(f"Missing field: {key}")
                return None
            return value

        raw_transaction_id = get_value("Transaction ID", required=False)
        raw_datetime       = get_value("Date & Time")
        raw_amount         = get_value("Amount (MYR)")
        raw_cardholder     = get_value("Cardholder Name")
        raw_ic             = get_value("IC Number")
        raw_card           = get_value("Card Number")
        raw_expiry         = get_value("Card Expiration Date")
        raw_merchant       = get_value("Merchant Name")
        raw_mcc            = get_value("Merchant Category Code (MCC)")
        raw_mode           = get_value("Mode")
        raw_location       = get_value("Location")
        raw_ip             = get_value("IP Address")
        raw_device         = get_value("Device Information")
        raw_label          = row.get("is_fraud")  # never required

        if errors:
            return None

        transaction_id       = str(raw_transaction_id).strip() if raw_transaction_id else uuid.uuid4().hex
        timestamp            = self._parse_datetime(raw_datetime, errors)
        amount_myr           = self._parse_amount(raw_amount, errors)
        cardholder_name      = str(raw_cardholder).strip()
        ic_number            = str(raw_ic).strip()
        card_number          = str(raw_card).replace(" ", "").strip()
        card_expiration_date = str(raw_expiry).strip()
        merchant_name        = str(raw_merchant).strip()
        mcc                  = str(raw_mcc).strip()
        mode                 = str(raw_mode).strip()
        location             = str(raw_location).strip()
        ip_address           = str(raw_ip).strip()
        device_information   = str(raw_device).strip()

        if len(cardholder_name) < 2:
            errors.append("Invalid Cardholder Name")
        if len(ic_number) < 6:
            errors.append("Invalid IC Number")
        if len(card_number) < 4:
            errors.append("Invalid Card Number")
        if len(merchant_name) < 2:
            errors.append("Invalid Merchant Name")
        if amount_myr is not None and amount_myr <= 0:
            errors.append("Amount must be positive")

        # ground_truth parsed separately — never blocks the transaction
        ground_truth_label = self._parse_ground_truth(raw_label)

        if errors:
            return None

        return {
            "transaction_id":       transaction_id,
            "timestamp":            timestamp,
            "amount_myr":           amount_myr,
            "cardholder_name":      cardholder_name,
            "ic_number":            ic_number,
            "card_number":          card_number,
            "card_expiration_date": card_expiration_date,
            "merchant_name":        merchant_name,
            "mcc":                  mcc,
            "mode":                 mode,
            "location":             location,
            "ip_address":           ip_address,
            "device_information":   device_information,
            "ground_truth_label":   ground_truth_label,
        }

    def _parse_datetime(self, raw_datetime, errors):
        dt_str = str(raw_datetime).strip()
        formats = [
            "%m/%d/%Y %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M",
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(dt_str, fmt)
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue

        try:
            dt = pd.to_datetime(dt_str)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            errors.append("Invalid Date & Time format")
            return None

    def _parse_amount(self, raw_amount, errors):
        try:
            return float(str(raw_amount).replace(",", "").strip())
        except Exception:
            errors.append("Invalid Amount (MYR)")
            return None

    # ground_truth never takes errors — invalid or missing just returns None
    def _parse_ground_truth(self, raw_label):
        if raw_label is None or str(raw_label).strip() == "":
            return None
        try:
            val = int(raw_label)
            return val if val in [0, 1] else None
        except Exception:
            return None

    def _hash_ic(self, ic_number):
        return hashlib.sha256(str(ic_number).encode()).hexdigest()

    # Hashes the cleaned card number (same value that gets encrypted into
    # card_number_enc), so the backfill can reproduce this hash by decrypting.
    def _hash_card(self, card_number):
        return hashlib.sha256(str(card_number).encode()).hexdigest()

    def _mask_card(self, card_number):
        card_number = str(card_number).replace(" ", "").replace(".0", "").strip()
        return "****" + card_number[-4:] if len(card_number) >= 4 else "****"

    def _log_rejection(self, row, errors):
        self.rejection_log.append({
            "transaction": row,
            "errors": errors,
            "action": "REJECTED"
        })

    def save_rejection_report(self, filename="blockchain_preprocessing_rejections.json"):
        with open(filename, "w") as f:
            json.dump(self.rejection_log, f, indent=2)