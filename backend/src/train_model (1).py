import pandas as pd
import numpy as np
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
from imblearn.over_sampling import SMOTE
from preprocessing import preprocess_data
from sklearn.impute import SimpleImputer

# Load datasets
kyc_df = pd.read_csv("KYC_Data.csv")
txn_df = pd.read_csv("Transaction_Data5k.csv")

# Merge KYC + Transactions
df = txn_df.merge(
    kyc_df,
    on="IC Number",
    how="left"
)

# Define target
TARGET = "is_fraud"

y = df[TARGET]
X_raw = df.drop(columns=[TARGET])

# debugging
print("\n--- RAW Income Range ---")
print(df["Income Range"])

# Preprocess (TRAINING)
X = preprocess_data(X_raw, is_training=True)

# debugging
print("\n--- Transformed Income Columns ---")
print(X[["income_min", "income_max", "income_mid"]])

# Save feature schema
joblib.dump(X.columns.tolist(), "feature_columns.pkl")

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    stratify=y,
    random_state=42
)

# Handle NaN before SMOTE
imputer = SimpleImputer(strategy="median")

X_train = pd.DataFrame(
    imputer.fit_transform(X_train),
    columns=X_train.columns
)

X_test = pd.DataFrame(
    imputer.transform(X_test),
    columns=X_test.columns
)

# Save imputer
joblib.dump(imputer, "imputer.pkl")

# SMOTE (TRAIN ONLY)
#smote = SMOTE(random_state=42)
#X_train_res, y_train_res = smote.fit_resample(X_train, y_train)

# Train model
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=None,
    min_samples_split=2,
    min_samples_leaf=1,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# Evaluation
y_prob = model.predict_proba(X_test)[:, 1]

THRESHOLD = 0.25
y_pred = (y_prob > THRESHOLD).astype(int)

# Results Output
print("\nRandom Forest Model Performance:")
print("\n-----------------------")
print("Accuracy :", accuracy_score(y_test, y_pred))
print("Precision:", precision_score(y_test, y_pred, zero_division=0))
print("Recall   :", recall_score(y_test, y_pred, zero_division=0))
print("F1 Score :", f1_score(y_test, y_pred, zero_division=0))
print("ROC-AUC  :", roc_auc_score(y_test, y_prob))

print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Save model
joblib.dump(model, "fraud_model.pkl")

# debugging
#print(X.columns.tolist())

print("\nModel saved as fraud_model.pkl")
print("Feature columns saved as feature_columns.pkl")
print("Imputers saved as imputer.pkl")

"""# Use this to find the best threshold
thresholds = np.arange(0.01, 0.5, 0.01)

best_f1 = 0
best_thresh = 0.5

for t in thresholds:
    preds = (y_prob > t).astype(int)
    f1 = f1_score(y_test, preds)
    if f1 > best_f1:
        best_f1 = f1
        best_thresh = t

print("Best threshold:", best_thresh)"""