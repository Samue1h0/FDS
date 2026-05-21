import pandas as pd
import re
import numpy as np


def parse_income_range(val):
    if pd.isna(val):
        return np.nan, np.nan, np.nan

    val = str(val)
    val = val.replace("MYR", "").replace("RM", "")
    val = val.replace(",", "")
    val = val.replace("–", "-")
    val = val.strip()

    if "<" in val:
        max_val = float(re.findall(r"\d+", val)[0])
        return 0.0, max_val, max_val / 2

    nums = re.findall(r"\d+", val)
    if len(nums) == 2:
        min_val = float(nums[0])
        max_val = float(nums[1])
        return min_val, max_val, (min_val + max_val) / 2

    return np.nan, np.nan, np.nan


def compute_velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-customer behavioral and velocity features.
    Must be called on the full context df (history + current row) before preprocess_data().
    """
    df = df.sort_values(["IC Number", "Date & Time"]).copy()

    df["prev_txn_time"] = df.groupby("IC Number")["Date & Time"].shift(1)
    df["hours_since_last_txn"] = (
        df["Date & Time"] - df["prev_txn_time"]
    ).dt.total_seconds() / 3600
    df = df.drop(columns=["prev_txn_time"])

    df["cust_avg_amount"] = (
        df.groupby("IC Number")["Amount (MYR)"]
        .transform(lambda x: x.expanding().mean().shift(1))
    )
    df["cust_std_amount"] = (
        df.groupby("IC Number")["Amount (MYR)"]
        .transform(lambda x: x.expanding().std().shift(1))
    )

    df["amount_zscore_cust"] = (
        (df["Amount (MYR)"] - df["cust_avg_amount"])
        / (df["cust_std_amount"] + 1e-6)
    )

    df["amount_vs_cust_avg"] = (
        df["Amount (MYR)"] / (df["cust_avg_amount"] + 1e-6)
    )

    df["txn_count_history"] = df.groupby("IC Number").cumcount()

    df["prev_location"] = df.groupby("IC Number")["Location"].shift(1)
    df["location_changed"] = (
        (df["Location"] != df["prev_location"]) & df["prev_location"].notna()
    ).astype(int)
    df = df.drop(columns=["prev_location"])

    def _new_mcc_flag(group):
        seen = set()
        flags = []
        for mcc in group:
            flags.append(1 if mcc not in seen else 0)
            seen.add(mcc)
        return flags

    mcc_col = df["Merchant Category Code (MCC)"].astype(str)
    df["new_mcc_flag"] = (
        df.assign(_mcc_str=mcc_col)
        .groupby("IC Number")["_mcc_str"]
        .transform(lambda x: _new_mcc_flag(x.tolist()))
    )
    df = df.drop(columns=["_mcc_str"], errors="ignore")

    return df


def preprocess_data(df: pd.DataFrame, feature_columns=None, is_training=False):
    """
    Shared preprocessing for training and prediction.
    compute_velocity_features() must be called before this for real-time scoring.
    """
    df = df.drop(columns=[
        "Name",
        "Cardholder Name",
        "Card Number",
        "IC Number",
        "Phone Number",
        "Street Address"
    ], errors="ignore")

    if "Date & Time" in df.columns:
        df["Date & Time"] = pd.to_datetime(
            df["Date & Time"],
            format="%d/%m/%Y %H:%M",
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
        df["Amount (MYR)"] = pd.to_numeric(df["Amount (MYR)"], errors="coerce")

        df["log_amount"] = np.log1p(df["Amount (MYR)"])
        df["amount_is_round"] = (df["Amount (MYR)"] % 100 == 0).astype(int)

    if "Income Range" in df.columns:
        income_parsed = df["Income Range"].apply(parse_income_range)
        df["income_min"] = income_parsed.apply(lambda x: x[0])
        df["income_max"] = income_parsed.apply(lambda x: x[1])
        df["income_mid"] = income_parsed.apply(lambda x: x[2])
        df = df.drop(columns=["Income Range"])

    if "Amount (MYR)" in df.columns and "income_mid" in df.columns:
        df["amount_to_income_ratio"] = (
            df["Amount (MYR)"] / (df["income_mid"] + 1e-6)
        )
        df["has_income_data"] = df["income_mid"].notna().astype(int)

    df = df.drop(columns=[
        "Transaction ID",
        "Merchant Name",
        "Card Expiration Date"
    ], errors="ignore")

    num_cols = df.select_dtypes(include=["int64", "float64"]).columns
    cat_cols = df.select_dtypes(include=["object"]).columns

    protected_nan_cols = [
        "income_min", "income_max", "income_mid",
        "hours_since_last_txn",
        "cust_avg_amount", "cust_std_amount",
        "amount_zscore_cust", "amount_vs_cust_avg",
        "amount_to_income_ratio",
    ]

    num_cols_to_fill = [col for col in num_cols if col not in protected_nan_cols]
    df[num_cols_to_fill] = df[num_cols_to_fill].fillna(df[num_cols_to_fill].median())

    df[cat_cols] = df[cat_cols].fillna("UNKNOWN")

    df = pd.get_dummies(df)

    if not is_training and feature_columns is not None:
        df = df.reindex(columns=feature_columns, fill_value=0)

    return df
