import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    roc_auc_score
)
from imblearn.over_sampling import SMOTE
from src.ml_preprocessing import preprocess_data
from sklearn.impute import SimpleImputer

# Load datasets
kyc_df = pd.read_csv("KYC_Dataset.csv")
txn_df = pd.read_csv("Transaction_Datasets.csv")

# Merge
df = txn_df.merge(
    kyc_df,
    on="IC Number",
    how="left"
)

# Target
TARGET = "is_fraud"
y = df[TARGET]
X_raw = df.drop(columns=[TARGET])

# Preprocess
X = preprocess_data(X_raw, is_training=True)

# Save feature columns
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

# SMOTE (safe for small data)
smote = SMOTE(sampling_strategy=0.8, random_state=42)
X_train_res, y_train_res = smote.fit_resample(X_train, y_train)

# Pipeline: Scaling + Logistic Regression
model = Pipeline(steps=[
    ("scaler", StandardScaler()),
    ("logreg", LogisticRegression(
        class_weight="balanced",
        solver="liblinear",
        random_state=42
    ))
])

model.fit(X_train_res, y_train_res)

# Evaluation
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

print("\nModel Performance (Logistic Regression)")
print("--------------------------------------")
print("Accuracy :", accuracy_score(y_test, y_pred))
print("Precision:", precision_score(y_test, y_pred, zero_division=0))
print("Recall   :", recall_score(y_test, y_pred, zero_division=0))
print("F1 Score :", f1_score(y_test, y_pred, zero_division=0))
print("ROC-AUC  :", roc_auc_score(y_test, y_prob))

print("\nClassification Report")
print(classification_report(y_test, y_pred, zero_division=0))

# Save model
joblib.dump(model, "fraud_model.pkl")

print("\nLogistic Regression model saved as fraud_model.pkl")
print("Feature columns saved as feature_columns.pkl")
print("Imputers saved as imputer.pkl")