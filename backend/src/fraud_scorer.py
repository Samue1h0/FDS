import joblib
import pandas as pd
from src.ml_preprocessing import preprocess_data, parse_income_range, compute_velocity_features
from src.rule_engine import apply_rule_engine
from src.blockchain_preprocessing import BlockchainPreprocessor


class FraudScorer:
    def __init__(self, kyc_df: pd.DataFrame, history_df: pd.DataFrame = None,
                 threshold: float = 0.6, rule_weight: float = 0.2, max_rule_boost: float = 0.5):
        self.model = joblib.load("models/fraud_model.pkl")
        self.feature_columns = joblib.load("models/feature_columns.pkl")
        self.imputer = joblib.load("models/imputer.pkl")
        self.kyc_df = kyc_df
        self.threshold = threshold
        self.rule_weight = rule_weight        # each triggered rule adds this much
        self.max_rule_boost = max_rule_boost  # cap on total rule contribution
        self.bp = BlockchainPreprocessor(kyc_df=kyc_df)

        if history_df is not None:
            self.history_df = self._prepare_history(history_df)
        else:
            self.history_df = pd.DataFrame()

    def _prepare_history(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["Date & Time"] = pd.to_datetime(
            df["Date & Time"], format="%d/%m/%Y %H:%M", errors="coerce"
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
                df["Date & Time"], format="%d/%m/%Y %H:%M", errors="coerce"
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

        # Build full context for velocity feature computation
        if not self.history_df.empty:
            context_df = pd.concat([self.history_df, enriched_df], ignore_index=True)
        else:
            context_df = enriched_df.copy()

        # Velocity features require the full customer history
        context_with_vel = compute_velocity_features(context_df)

        # Locate the current row by Transaction ID after sort
        txn_id = row.get("Transaction ID")
        mask = context_with_vel["Transaction ID"] == txn_id
        current_row_vel = context_with_vel[mask].iloc[0]

        rule_flags = apply_rule_engine(current_row_vel, context_with_vel)

        X = preprocess_data(
            pd.DataFrame([current_row_vel.to_dict()]),
            feature_columns=self.feature_columns,
            is_training=False
        )
        X = pd.DataFrame(self.imputer.transform(X), columns=X.columns)
        ml_score = float(self.model.predict_proba(X)[:, 1][0])

        ml_prediction = 1 if ml_score >= self.threshold else 0
        rule_flag = 1 if len(rule_flags) > 0 else 0

        # Weighted hybrid score: ML probability plus a capped contribution
        # from the rule engine (each triggered rule adds rule_weight, total
        # capped at max_rule_boost), then thresholded for the final decision.
        rule_count = len(rule_flags)
        rule_score = min(rule_count * self.rule_weight, self.max_rule_boost)
        fraud_score = min(ml_score + rule_score, 1.0)
        decision = "FRAUD" if fraud_score >= self.threshold else "LEGIT"

        if rule_flags:
            risk_reasons = [f"ML score = {ml_score:.4f}"] + rule_flags
        else:
            risk_reasons = [f"ML score = {ml_score:.4f}"]

        processed, errors = self.bp.process_transaction(current_row_vel.to_dict())

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
