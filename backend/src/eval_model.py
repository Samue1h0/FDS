import json
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
from src.ml_preprocessing import preprocess_data, compute_velocity_features

# Run from the backend/ directory:  python -m src.eval_model
#
# Produces an HONEST held-out evaluation of the *deployed* model and writes it
# to models/model_metrics.json (served by GET /api/model/performance).
#
# Why this is defensible:
#   train_model.py fits the shipped fraud_model.pkl on the TRAIN 80% only and
#   leaves the 20% test split untouched (train_test_split, random_state=42,
#   stratify=y). We reproduce that exact split here and score the deployed
#   artifacts on those test rows — so these numbers reflect performance on data
#   the model never saw during training. No retraining happens.

DATA_TXN = "data/Transaction_Data5k.csv"
DATA_KYC = "data/KYC_Data.csv"
OUT_PATH = "models/model_metrics.json"
RANDOM_STATE = 42
TEST_SIZE = 0.2

# ── Load + merge current data (identical to train_model.py) ──────────
kyc_df = pd.read_csv(DATA_KYC)
txn_df = pd.read_csv(DATA_TXN)
df = txn_df.merge(kyc_df, on="IC Number", how="left")

df["Date & Time"] = pd.to_datetime(
    df["Date & Time"], format="%d/%m/%Y %H:%M", errors="coerce"
)
df["Amount (MYR)"] = (
    df["Amount (MYR)"].astype(str)
    .str.replace("RM", "", regex=False)
    .str.replace(",", "", regex=False)
)
df["Amount (MYR)"] = pd.to_numeric(df["Amount (MYR)"], errors="coerce")

# Velocity features sort rows, so take the target AFTER (matches training).
df = compute_velocity_features(df).reset_index(drop=True)

TARGET = "is_fraud"
y = df[TARGET]
X_raw = df.drop(columns=[TARGET])

X_all = preprocess_data(X_raw, is_training=True)

# ── Reproduce the EXACT split the shipped model was trained against ──
_, X_test_all, _, y_test = train_test_split(
    X_all, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE
)

# ── Load the deployed artifacts (no retraining) ──────────────────────
selected = joblib.load("models/feature_columns.pkl")
imputer = joblib.load("models/imputer.pkl")
model = joblib.load("models/fraud_model.pkl")

# Reindex the held-out rows to the deployed feature schema, then impute with
# the deployed (training-fit) imputer — exactly what the live scorer does.
X_test_sel = X_test_all.reindex(columns=selected)
X_test = pd.DataFrame(imputer.transform(X_test_sel), columns=selected)

y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

# ── Metrics ──────────────────────────────────────────────────────────
tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()
fpr = fp / (fp + tn) if (fp + tn) else 0.0

metrics = {
    "model": "Random Forest",
    "n_features": len(selected),
    "n_estimators": int(getattr(model, "n_estimators", 100)),
    "class_weight": "balanced",
    "methodology": (
        "Held-out 20% stratified test split (random_state=42). The deployed "
        "model was trained on the remaining 80% and never saw these rows."
    ),
    "test_size": int(len(y_test)),
    "train_size": int(len(X_all) - len(y_test)),
    "positives": int(tp + fn),   # actual fraud in the test set
    "negatives": int(tn + fp),   # actual legit in the test set
    "confusion_matrix": {
        "tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn),
    },
    "accuracy":  round(float(accuracy_score(y_test, y_pred)), 4),
    "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
    "recall":    round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
    "f1":        round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
    "fpr":       round(float(fpr), 4),
    "roc_auc":   round(float(roc_auc_score(y_test, y_prob)), 4),
    "generated_at": datetime.now(timezone.utc).isoformat(),
}

with open(OUT_PATH, "w") as fh:
    json.dump(metrics, fh, indent=2)

print(f"Wrote {OUT_PATH}")
print(json.dumps(metrics, indent=2))
