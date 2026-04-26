import pandas as pd
import re
import numpy as np

def parse_income_range(val):
        if pd.isna(val):
            return np.nan, np.nan, np.nan

        val = str(val)

        # Normalize text
        val = val.replace("MYR", "").replace("RM", "")
        val = val.replace(",", "")
        val = val.replace("–", "-")
        val = val.strip()

        # Case: < MYR 2000
        if "<" in val:
            max_val = float(re.findall(r"\d+", val)[0])
            return 0.0, max_val, max_val / 2

        # Case: range MYR 5001-8000
        nums = re.findall(r"\d+", val)
        if len(nums) == 2:
            min_val = float(nums[0])
            max_val = float(nums[1])
            return min_val, max_val, (min_val + max_val) / 2
            
        return np.nan, np.nan, np.nan

def preprocess_data(df: pd.DataFrame, feature_columns=None, is_training=False):
    """
    Shared preprocessing for training (train_model.py) and prediction (predict.py)
    """

    # Drop PII
    df = df.drop(columns=[
        "Name",
        "Cardholder Name",
        "Card Number",
        "IC Number",
        "Phone Number",
        "Street Address"
    ], errors="ignore")

    # Feature engineering
    if "Date of Birth" in df.columns:
        df["Date of Birth"] = pd.to_datetime(df["Date of Birth"], errors="coerce")
        df["age"] = (pd.Timestamp.now() - df["Date of Birth"]).dt.days // 365
        df = df.drop(columns=["Date of Birth"])

    if "Date & Time" in df.columns:
        df["Date & Time"] = pd.to_datetime(
            df["Date & Time"],
            format="%m/%d/%Y %H:%M",
            errors="coerce"
        )
        df["txn_hour"] = df["Date & Time"].dt.hour
        df["txn_dayofweek"] = df["Date & Time"].dt.dayofweek
        df = df.drop(columns=["Date & Time"])

    if "Amount (MYR)" in df.columns:
        df["Amount (MYR)"] = (
            df["Amount (MYR)"]
            .astype(str)
            .str.replace("RM", "", regex=False)
            .str.replace(",", "", regex=False)
        )

        df["Amount (MYR)"] = pd.to_numeric(
            df["Amount (MYR)"],
            errors="coerce"
        )

    if "Income Range" in df.columns:
        income_parsed = df["Income Range"].apply(parse_income_range)

        df["income_min"] = income_parsed.apply(lambda x: x[0])
        df["income_max"] = income_parsed.apply(lambda x: x[1])
        df["income_mid"] = income_parsed.apply(lambda x: x[2])

        df = df.drop(columns=["Income Range"])

    # Drop unused columns
    df = df.drop(columns=[
        "Transaction ID",
        "Merchant Name",
        "Card Expiration Date"
    ], errors="ignore")

    # Handle missing values
    num_cols = df.select_dtypes(include=["int64", "float64"]).columns
    cat_cols = df.select_dtypes(include=["object"]).columns

    # Exclude income columns from median fill
    income_cols = ["income_min", "income_max", "income_mid"]

    num_cols_no_income = [col for col in num_cols if col not in income_cols]

    # Fill ONLY non-income numeric columns
    df[num_cols_no_income] = df[num_cols_no_income].fillna(
        df[num_cols_no_income].median()
    )

    # Keep income columns as NaN (important for rule based code)
    df[cat_cols] = df[cat_cols].fillna("UNKNOWN")

    # Encode categoricals
    df = pd.get_dummies(df)

    # Align feature columns during prediction
    if not is_training and feature_columns is not None:
        df = df.reindex(columns=feature_columns, fill_value=0)

    return df