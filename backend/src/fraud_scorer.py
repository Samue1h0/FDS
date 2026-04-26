import joblib
import pandas as pd
from src.ml_preprocessing import preprocess_data, parse_income_range
from src.rule_engine import apply_rule_engine
from src.blockchain_preprocessing import BlockchainPreprocessor


class FraudScorer:
    def __init__(self, kyc_df: pd.DataFrame, history_df: pd.DataFrame = None, threshold: float = 0.6):
        self.model = joblib.load("models/fraud_model.pkl")
        self.feature_columns = joblib.load("models/feature_columns.pkl")
        self.imputer = joblib.load("models/imputer.pkl")
        self.kyc_df = kyc_df
        self.threshold = threshold
        self.bp = BlockchainPreprocessor(kyc_df=kyc_df)

        if history_df is not None:
            self.history_df = self._prepare_history(history_df)
        else:
            self.history_df = pd.DataFrame()

    def _prepare_history(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["Date & Time"] = pd.to_datetime(
            df["Date & Time"], format="%m/%d/%Y %H:%M", errors="coerce"
        )
        df["Amount (MYR)"] = (
            df["Amount (MYR)"].astype(str)
            .str.replace("RM", "", regex=False)
            .str.replace(",", "", regex=False)
        )
        df["Amount (MYR)"] = pd.to_numeric(df["Amount (MYR)"], errors="coerce")

        if "Income Range" in df.columns:
            income_parsed = df["Income Range"].apply(parse_income_range)
            df["income_min"] = income_parsed.apply(lambda x: x[0])
            df["income_max"] = income_parsed.apply(lambda x: x[1])
            df["income_mid"] = income_parsed.apply(lambda x: x[2])

        return df

    def _build_enriched_row(self, row: dict) -> pd.DataFrame:
        df = pd.DataFrame([row])

        if "Date & Time" in df.columns:
            df["Date & Time"] = pd.to_datetime(
                df["Date & Time"], format="%m/%d/%Y %H:%M", errors="coerce"
            )
        if "Amount (MYR)" in df.columns:
            df["Amount (MYR)"] = (
                df["Amount (MYR)"].astype(str)
                .str.replace("RM", "", regex=False)
                .str.replace(",", "", regex=False)
            )
            df["Amount (MYR)"] = pd.to_numeric(df["Amount (MYR)"], errors="coerce")

        if "Income Range" in df.columns:
            income_parsed = df["Income Range"].apply(parse_income_range)
            df["income_min"] = income_parsed.apply(lambda x: x[0])
            df["income_max"] = income_parsed.apply(lambda x: x[1])
            df["income_mid"] = income_parsed.apply(lambda x: x[2])

        return df

    def score(self, row: dict) -> dict:
        enriched_df = self._build_enriched_row(row)
        current_row = enriched_df.iloc[0]

        context_df = pd.concat(
            [self.history_df, enriched_df], ignore_index=True
        ) if not self.history_df.empty else enriched_df

        rule_flags = apply_rule_engine(current_row, context_df)

        X = preprocess_data(
            enriched_df.copy(),
            feature_columns=self.feature_columns,
            is_training=False
        )
        X = pd.DataFrame(self.imputer.transform(X), columns=X.columns)
        ml_score = float(self.model.predict_proba(X)[:, 1][0])

        ml_prediction = 1 if ml_score >= self.threshold else 0
        rule_flag = 1 if len(rule_flags) > 0 else 0

        if rule_flags:
            decision = "FRAUD"
            fraud_score = max(ml_score, 0.9)
            risk_reasons = rule_flags
        else:
            decision = "FRAUD" if ml_score >= self.threshold else "LEGIT"
            fraud_score = ml_score
            risk_reasons = [f"ML score = {ml_score:.4f}"]

        processed, errors = self.bp.process_transaction(current_row.to_dict())

        if processed is None:
            return {"status": "REJECTED", "errors": errors}

        private_record = processed["private_record"]
        blockchain_payload = processed["blockchain_payload"]

        blockchain_payload["fraud_score"]     = round(fraud_score, 4)
        blockchain_payload["ml_prediction"]   = int(ml_prediction)
        blockchain_payload["rule_flag"]        = int(rule_flag)
        blockchain_payload["predicted_label"]  = decision
        blockchain_payload["risk_reasons"]     = risk_reasons

        return {
            "status": "ACCEPTED",
            "private_record": private_record,
            "blockchain_payload": blockchain_payload,
        }