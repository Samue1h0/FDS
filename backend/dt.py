import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    roc_auc_score
)

from src.ml_preprocessing import preprocess_data
from sklearn.impute import SimpleImputer

# Load datasets
kyc_df = pd.read_csv("KYC_Dataset.csv")
txn_df = pd.read_csv("Transaction_Datasets.csv")

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

# Preprocess data
X = preprocess_data(X_raw, is_training=True)

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

# Train Decision Tree
model = DecisionTreeClassifier(
    max_depth=4,              # prevents overfitting
    min_samples_leaf=2,       # stability for small data
    class_weight="balanced",
    random_state=42
)

model.fit(X_train, y_train)

# Evaluation
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

print("\nDecision Tree Model Performance")
print("--------------------------------")
print("Accuracy :", accuracy_score(y_test, y_pred))
print("Precision:", precision_score(y_test, y_pred, zero_division=0))
print("Recall   :", recall_score(y_test, y_pred, zero_division=0))
print("F1 Score :", f1_score(y_test, y_pred, zero_division=0))
print("ROC-AUC  :", roc_auc_score(y_test, y_prob))

print("\nClassification Report")
print(classification_report(y_test, y_pred, zero_division=0))

# Save model
joblib.dump(model, "fraud_model.pkl")

print("\nDecision Tree model saved as fraud_model.pkl")
print("Feature columns saved as feature_columns.pkl")
print("Imputers saved as imputer.pkl")