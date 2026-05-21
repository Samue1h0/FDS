import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    roc_auc_score
)
from src.ml_preprocessing import preprocess_data, compute_velocity_features
from sklearn.impute import SimpleImputer

# Run from the backend/ directory:  python -m src.train_model
#
# Mirrors the shipped pipeline so the retrained artifacts stay compatible with
# the live FraudScorer:
#   parse -> compute_velocity_features -> preprocess_data
#   -> feature selection (MDI top-100 -> correlation prune r>0.85)
#   -> impute (on selected) -> RandomForest (class_weight="balanced")
# Imbalance is handled by class_weight, not SMOTE (matches the shipped model).
# Overwrites models/{fraud_model,feature_columns,imputer}.pkl.

# ── Load + merge current data ────────────────────────────────
kyc_df = pd.read_csv("data/KYC_Data.csv")
txn_df = pd.read_csv("data/Transaction_Data5k.csv")
df = txn_df.merge(kyc_df, on="IC Number", how="left")

# Parse the fields compute_velocity_features() needs, before engineering
df["Date & Time"] = pd.to_datetime(
    df["Date & Time"], format="%d/%m/%Y %H:%M", errors="coerce"
)
df["Amount (MYR)"] = (
    df["Amount (MYR)"].astype(str)
    .str.replace("RM", "", regex=False)
    .str.replace(",", "", regex=False)
)
df["Amount (MYR)"] = pd.to_numeric(df["Amount (MYR)"], errors="coerce")

# Per-customer behavioural / velocity features (same as real-time scoring).
# Sorts rows, so take the target AFTER this.
df = compute_velocity_features(df).reset_index(drop=True)

TARGET = "is_fraud"
y = df[TARGET]
X_raw = df.drop(columns=[TARGET])

# ── Preprocess (one-hot, engineered features, etc.) ──────────
X_all = preprocess_data(X_raw, is_training=True)

# ── Split first (selection happens on TRAIN only, to avoid leakage) ──
X_train_all, X_test_all, y_train, y_test = train_test_split(
    X_all, y, test_size=0.2, stratify=y, random_state=42
)

# ── Feature selection: MDI top-100 -> drop one of each pair with |corr| > 0.85 ──
sel_imputer = SimpleImputer(strategy="median")
X_train_imp = pd.DataFrame(
    sel_imputer.fit_transform(X_train_all), columns=X_train_all.columns
)
sel_rf = RandomForestClassifier(
    n_estimators=100, class_weight="balanced", random_state=42, n_jobs=-1
)
sel_rf.fit(X_train_imp, y_train)

importances = pd.Series(sel_rf.feature_importances_, index=X_train_all.columns)
top = importances.sort_values(ascending=False).head(100).index.tolist()

corr = X_train_imp[top].corr().abs()
upper = corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool))
to_drop = [c for c in upper.columns if (upper[c] > 0.85).any()]
selected = [c for c in top if c not in to_drop]

print(f"\nSelected {len(selected)} features (from {X_all.shape[1]} after encoding)")

# Save feature schema (the live scorer reindexes incoming rows to this)
joblib.dump(selected, "models/feature_columns.pkl")

# ── Restrict to selected, then fit the FINAL imputer on those columns ──
X_train_all = X_train_all[selected]
X_test_all = X_test_all[selected]

imputer = SimpleImputer(strategy="median")
X_train = pd.DataFrame(imputer.fit_transform(X_train_all), columns=selected)
X_test = pd.DataFrame(imputer.transform(X_test_all), columns=selected)
joblib.dump(imputer, "models/imputer.pkl")

# ── Train ────────────────────────────────────────────────────
# Imbalance handled by class_weight="balanced" (no SMOTE — matches shipped model)
model = RandomForestClassifier(
    n_estimators=100, class_weight="balanced", random_state=42, n_jobs=-1
)
model.fit(X_train, y_train)

# ── Evaluation ──────────────────────────────────────────────
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

print("\nModel Performance:")
print("-----------------------")
print("Accuracy :", accuracy_score(y_test, y_pred))
print("Precision:", precision_score(y_test, y_pred, zero_division=0))
print("Recall   :", recall_score(y_test, y_pred, zero_division=0))
print("F1 Score :", f1_score(y_test, y_pred, zero_division=0))
print("ROC-AUC  :", roc_auc_score(y_test, y_prob))
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

joblib.dump(model, "models/fraud_model.pkl")
print("\nSaved to models/: fraud_model.pkl, feature_columns.pkl, imputer.pkl")
