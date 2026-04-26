import pandas as pd
import joblib

from src.ml_preprocessing import preprocess_data, parse_income_range
from src.rule_engine import apply_rule_engine
from src.blockchain_preprocessing import BlockchainPreprocessor
from src.private_store import PrivateRecordStore


def load_artifacts():
    model = joblib.load("models/fraud_model.pkl")
    feature_columns = joblib.load("models/feature_columns.pkl")
    imputer = joblib.load("models/imputer.pkl")
    return model, feature_columns, imputer


def _build_enriched_dataframe(txn_df: pd.DataFrame, kyc_df: pd.DataFrame) -> pd.DataFrame:
    df = txn_df.merge(kyc_df, on="IC Number", how="left")

    if "Date & Time" in df.columns:
        df["Date & Time"] = pd.to_datetime(
            df["Date & Time"],
            format="%m/%d/%Y %H:%M",
            errors="coerce"
        )

    if "Amount (MYR)" in df.columns:
        df["Amount (MYR)"] = (
            df["Amount (MYR)"]
            .astype(str)
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


def score_and_prepare_blockchain_records(
    txn_df: pd.DataFrame,
    kyc_df: pd.DataFrame,
    private_store: PrivateRecordStore,
    threshold: float = 0.6
):
    model, feature_columns, imputer = load_artifacts()

    enriched_df = _build_enriched_dataframe(txn_df, kyc_df)

    # Rule engine on enriched df
    rule_flags_per_row = []
    for _, row in enriched_df.iterrows():
        rule_flags = apply_rule_engine(row, enriched_df)
        rule_flags_per_row.append(rule_flags)

    # ML preprocessing on a copy
    X = preprocess_data(
        enriched_df.copy(),
        feature_columns=feature_columns,
        is_training=False
    )
    X = pd.DataFrame(imputer.transform(X), columns=X.columns)
    ml_scores = model.predict_proba(X)[:, 1]

    bp = BlockchainPreprocessor(kyc_df=kyc_df)

    final_outputs = []
    results_rows = []

    for idx, (i, row) in enumerate(enriched_df.iterrows()):
        rule_flags = rule_flags_per_row[idx]
        ml_score = float(ml_scores[idx])  # fixed: use idx not i

        ml_prediction = 1 if ml_score >= threshold else 0
        rule_flag = 1 if len(rule_flags) > 0 else 0

        if rule_flags:
            decision = "FRAUD"
            fraud_score = max(ml_score, 0.9)
            risk_reasons = rule_flags
        else:
            decision = "FRAUD" if ml_score >= threshold else "LEGIT"
            fraud_score = ml_score
            risk_reasons = [f"ML score = {ml_score:.4f}"]

        processed, errors = bp.process_transaction(row.to_dict())

        if processed is None:
            final_outputs.append({
                "status": "REJECTED",
                "transaction_id": row.get("Transaction ID"),
                "errors": errors
            })
            continue

        private_record = processed["private_record"]
        blockchain_payload = processed["blockchain_payload"]

        # Inject fraud assessment into flat payload
        blockchain_payload["fraud_score"]    = round(float(fraud_score), 4)
        blockchain_payload["ml_prediction"]  = int(ml_prediction)
        blockchain_payload["rule_flag"]      = int(rule_flag)
        blockchain_payload["predicted_label"] = decision
        blockchain_payload["risk_reasons"]   = risk_reasons

        # Save private record to encrypted DB immediately
        try:
            private_store.save(private_record)
        except Exception as e:
            final_outputs.append({
                "status": "PRIVATE_STORE_ERROR",
                "transaction_id": private_record.get("transaction_id"),
                "error": str(e)
            })
            continue

        # Only flat blockchain_payload goes forward
        final_outputs.append({
            "status": "ACCEPTED",
            "transaction_id": blockchain_payload["transaction_id"],
            "blockchain_payload": blockchain_payload
        })

        results_rows.append({
            "Transaction ID":     blockchain_payload.get("transaction_id"),
            "Date & Time":        blockchain_payload.get("timestamp"),
            "Amount (MYR)":       blockchain_payload.get("amount_myr"),
            "Merchant Name":      blockchain_payload.get("merchant_name"),
            "customer_ref":       blockchain_payload.get("customer_ref"),
            "ic_hash":            blockchain_payload.get("ic_hash"),
            "masked_card_number": blockchain_payload.get("masked_card_number"),
            "Fraud Score":        blockchain_payload.get("fraud_score"),
            "ML Prediction":      blockchain_payload.get("ml_prediction"),
            "Rule Flag":          blockchain_payload.get("rule_flag"),
            "Decision":           blockchain_payload.get("predicted_label"),
            "Reason":             "; ".join(blockchain_payload.get("risk_reasons", []))
        })

    results_df = pd.DataFrame(results_rows)

    return {
        "final_outputs": final_outputs,
        "results_df": results_df,
        "rejection_log": bp.rejection_log
    }