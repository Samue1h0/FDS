# Fraud prediction with fraud score (probability)
# Aligned with train_model.py (KYC + Transaction features)
# Fraud prediction using real transaction + KYC data

import pandas as pd
import joblib

from src.ml_preprocessing import preprocess_data, parse_income_range

from rule_engine import apply_rule_engine

# Load model artifacts
model = joblib.load("fraud_model.pkl")
feature_columns = joblib.load("feature_columns.pkl")
imputer = joblib.load("imputer.pkl")

print("Model and feature schema loaded successfully.")

# Load incoming data
kyc_df = pd.read_csv("KYC_Dataset.csv")
txn_df = pd.read_csv("Transaction_Datasetss.csv")

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

for idx, row in df.iterrows():
    rule_flags = apply_rule_engine(row, df)

    rule_results.append({
        "Transaction ID": row["Transaction ID"],
        "Rule Flags": rule_flags
    })

rule_df = pd.DataFrame(rule_results)

transaction_id = df["Transaction ID"].iloc[0]

# Preprocess (PREDICTION)
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

# Predict fraud score
ml_scores = model.predict_proba(X)[:, 1]

# Decision logic
THRESHOLD = 0.6 # Can change to 0.7 possibly lesser false positives
decisions = ["FRAUD" if score >= THRESHOLD else "LEGIT" for score in ml_scores]

results = []

for i in range(len(df)):
    txn_id = df.iloc[i]["Transaction ID"]
    rule_flags = rule_df.iloc[i]["Rule Flags"]
    ml_score = ml_scores[i]

    if rule_flags:
        decision = "FRAUD"
        reason = "; ".join(rule_flags)
        fraud_score = max(ml_score, 0.9)  # rules override
    else:
        decision = "FRAUD" if ml_score >= THRESHOLD else "LEGIT"
        reason = f"ML score = {ml_score:.4f}"
        fraud_score = ml_score

    results.append({
        "Transaction ID": txn_id,
        "Fraud Score": round(fraud_score, 4),
        "Decision": decision,
        "Reason": reason
    })

results_df = pd.DataFrame(results)

pd.set_option("display.max_rows", None)
pd.set_option("display.max_colwidth", None)

print("\nFinal Fraud Detection Results")
print(results_df)