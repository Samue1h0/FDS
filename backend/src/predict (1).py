# Fraud prediction with fraud score (probability)
# Aligned with train_model.py (KYC + Transaction features)
# Fraud prediction using real transaction + KYC data
# Hybrid fraud prediction using ML score + weighted rule score

import pandas as pd
import joblib

from preprocessing import preprocess_data, parse_income_range

from rule_engine import apply_rule_engine

# Load model artifacts
model = joblib.load("fraud_model.pkl")
feature_columns = joblib.load("feature_columns.pkl")
imputer = joblib.load("imputer.pkl")

print("Model and feature schema loaded successfully.")

# Load incoming data
kyc_df = pd.read_csv("KYC_Data.csv")
txn_df = pd.read_csv("Transaction_Data5k.csv")

# Predict any number of transactions (change index as needed)
txn_row = txn_df.iloc[:]

# Merge with KYC
df = txn_row.merge(
    kyc_df,
    on="IC Number",
    how="left"
)

# Parse datetime & amount FOR RULE ENGINE
df["Date & Time"] = pd.to_datetime(
    df["Date & Time"],
    format="%m/%d/%Y %H:%M",
    errors="coerce"
)

df["Amount (MYR)"] = (
    df["Amount (MYR)"]
    .astype(str)
    .str.replace("RM", "", regex=False)
    .str.replace(",", "", regex=False)
    .astype(float)
)

# Parse income BEFORE rules
income_parsed = df["Income Range"].apply(parse_income_range)

df["income_min"] = income_parsed.apply(lambda x: x[0])
df["income_max"] = income_parsed.apply(lambda x: x[1])
df["income_mid"] = income_parsed.apply(lambda x: x[2])

rule_results = []

for _, row in df.iterrows():
    rule_flags = apply_rule_engine(row, df)

    rule_results.append({
        "Transaction ID": row["Transaction ID"],
        "Rule Flags": rule_flags,
        "Rule Count": len(rule_flags)
    })

rule_df = pd.DataFrame(rule_results)

# Preprocess for ML prediction
X = preprocess_data(
    df,
    feature_columns=feature_columns,
    is_training=False
)

# Apply same imputer as training
X = pd.DataFrame(
    imputer.transform(X),
    columns=X.columns
)

# Predict ML fraud probabilities
ml_scores = model.predict_proba(X)[:, 1]

# Hybrid decision logic
THRESHOLD = 0.6
RULE_WEIGHT = 0.2     # Each triggered rule adds 0.2
MAX_RULE_BOOST = 0.5    # Cap total rule contribution

results = []

for i in range(len(df)):
    txn_id = df.iloc[i]["Transaction ID"]
    rule_flags = rule_df.iloc[i]["Rule Flags"]
    rule_count = rule_df.iloc[i]["Rule Count"]
    ml_score = ml_scores[i]

    # Weighted rule score
    rule_score = min(rule_count * RULE_WEIGHT, MAX_RULE_BOOST)

    # Final combined fraud score
    final_score = min(ml_score + rule_score, 1.0)

    # Final decision
    decision = "FRAUD" if final_score >= THRESHOLD else "LEGIT"

    # Reason text
    if rule_flags:
        reason = (
            f"ML score = {ml_score:.4f}; "
            f"Rules triggered ({rule_count}): " + "; ".join(rule_flags)
        )
    else:
        reason = f"ML score = {ml_score:.4f}; No rules triggered"

    results.append({
        "Transaction ID": txn_id,
        "ML Score": round(ml_score, 4),
        "Rule Score": round(rule_score, 4),
        "Fraud Score": round(final_score, 4),
        "Decision": decision,
        "Reason": reason
    })

results_df = pd.DataFrame(results)

pd.set_option("display.max_rows", None)
pd.set_option("display.max_colwidth", None)
pd.set_option("display.width", None)
pd.set_option("display.max_columns", None)

print("\nFinal Fraud Detection Results")
print(results_df)