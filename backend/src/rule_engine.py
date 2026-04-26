import pandas as pd
from datetime import timedelta

DEBUG = False

def get_customer_history(df, customer_id, current_time):
    # This function retrieves a customer's past transaction history before the current transaction.
    history = df[
        (df["IC Number"] == customer_id) &
        (df["Date & Time"] < current_time)
    ].sort_values("Date & Time")

    return history

def rule_unusual_merchant(row, history):
    # This rule checks if a customer is making a transaction with a merchant category that they haven’t interacted with recently.
    # Flags transactions if the number of previous unique merchants is greater than 5.
    # Considers only the last 15 days of transaction history, and flags the transaction only if the amount is unusually high 
    #   (greater of RM 250 or 2.5 times the customer's average spending).
    reasons = []

    # Last 15 days
    recent_history = history[
        history["Date & Time"] >= row["Date & Time"] - timedelta(days=15)
    ]

    previous_merchants = recent_history["Merchant Category Code (MCC)"].astype(str).unique()
    current_mcc = str(row["Merchant Category Code (MCC)"])
    avg_spend = history["Amount (MYR)"].mean()

    if (
        current_mcc not in previous_merchants
        and len(previous_merchants) >= 5
    ):
        if pd.notna(avg_spend):
            if row["Amount (MYR)"] > max(250, avg_spend * 2.5):
                reasons.append("Unusual merchant category")
   
    """
    print("\nDEBUG")
    print("Current MCC:", current_mcc)
    print("Previous MCCs:", previous_merchants)
    print("Count:", len(previous_merchants))
    """

    return reasons

def rule_high_value(row, history):
    # This rule flags high-value transactions that significantly exceed the customer’s usual spending
    #   (The first transaction will not be flagged since there's no prior spending history to calculate an average spend).
    # A transaction is flagged if its amount exceeds the higher of RM 500 or 5 times the customer's average spend
    reasons = []

    avg_spend = history["Amount (MYR)"].mean()

    if pd.notna(avg_spend):
        if row["Amount (MYR)"] > max(500, avg_spend * 5):
            reasons.append("High-value transaction")

    return reasons

def rule_repeated_small(row, history):
    # This rule detects if a customer has made multiple small transactions in a short time window,
    #   which may indicate suspicious activity.
    # A transaction is flagged if there are more than 3 small transactions (< RM 10) within a 15-minute window.
    reasons = []

    window_start = row["Date & Time"] - timedelta(minutes=15)

    recent_small = history[
        (history["Date & Time"] >= window_start) &
        (history["Amount (MYR)"] <= 10)
    ]

    if len(recent_small) >= 3:
        reasons.append("Repeated small transactions")

    return reasons

def rule_cross_location(row, history):
    # This rule checks for rapid cross-location transactions, which could indicate fraudulent activity.
    # A transaction is flagged if it occurs in a different location (city) than the last transaction within a 30-minute window.
    reasons = []

    window_start = row["Date & Time"] - timedelta(minutes=30)

    recent_txns = history[
        history["Date & Time"] >= window_start
    ]

    if not recent_txns.empty:
        last_location = recent_txns.iloc[-1]["Location"]

        if row["Location"] != last_location:
            reasons.append("Rapid cross-location transaction")

    return reasons

def rule_income_mismatch(row):
    # This rule checks if a transaction amount exceeds the expected income capacity based on the customer’s income profile.
    # A transaction is flagged if its amount exceeds 1.2 times the customer’s income_max.
    reasons = []

    income_max = row.get("income_max")
    amount = row.get("Amount (MYR)")
    employment = row.get("Employment Status")

    if pd.notna(income_max) and income_max > 0 and pd.notna(amount):
        if income_max > 0 and amount > income_max * 1.2 and employment != "Self-Employed":
            reasons.append("Exceeds expected income capacity")

    return reasons

def rule_student_high_spend(row):
    # This rule flags high-value transactions made by customers identified as "Student",
    #   who are expected to have lower spending capacity.
    # A transaction is flagged if the amount exceeds RM 3000 for "Student" customers.
    reasons = []

    if row.get("Employment Status") == "Student":
        if row.get("Amount (MYR)", 0) > 3000:
            reasons.append("High-value transaction for student profile")

    return reasons

def rule_unknown_income(row):
    # This rule flags high-value transactions for customers with unknown income information and who are unemployed.
    # A transaction is flagged if the customer is unemployed and the amount exceeds RM 5000.
    reasons = []

    income_max = row.get("income_max")
    amount = row.get("Amount (MYR)")
    employment = row.get("Employment Status")

    if pd.isna(income_max) and pd.notna(amount) and employment == "Unemployed":
        if amount > 5000:
            reasons.append("High-value transaction with unknown income")

    return reasons

def rule_retiree_high_value(row):
    # Flags high-value transactions for retirees with unknown income.
    # Assumes retirees may have savings, so threshold is higher than unemployed.
    reasons = []

    income_max = row.get("income_max")
    amount = row.get("Amount (MYR)")
    employment = row.get("Employment Status")

    if pd.isna(income_max) and pd.notna(amount) and employment == "Retired":
        if amount > 10000:  # Higher threshold than unemployed
            reasons.append("High-value transaction (retiree) with unknown income")

    return reasons


def rule_self_employed_high_value(row):
    """
    This rule checks for unusually high-value transactions by self-employed individuals,
        who may have a higher capacity for large transactions.
    Transactions of RM 20,000 or less are considered normal and are not flagged. 
        For transactions above RM 20,000, the rule evaluates the customer income level if available.
        If income_max is known, a transaction is flagged as “unusually high” when it exceeds twice the income_max.
        It is further escalated to “very high” if the transaction exceeds both twice the income_max and RM 50,000.
    """
    reasons = []

    employment = row.get("Employment Status")
    amount = row.get("Amount (MYR)")
    income_max = row.get("income_max")

    if employment == "Self-Employed" and pd.notna(amount):
        # Allow up to RM 20,000 without flag
        if amount <= 20000:
            return reasons

        # Flag only if extremely abnormal
        if pd.notna(income_max) and income_max > 0:
            if amount > income_max * 2 and amount > 50000:
                reasons.append(
                    "Very high transaction for self-employed profile"
                )
            else:
                if amount > income_max * 2:
                    reasons.append(
                        "Unusually high transaction for self-employed profile"
                    )

    return reasons

def apply_rule_engine(row, full_df):
    """
    Apply all rule-based fraud detection
    """
    reasons = []

    history = get_customer_history(
        full_df,
        row["IC Number"],
        row["Date & Time"]
    )

    # debugging
    if DEBUG and not history.empty:
        print(f"\nHistory found for IC {row['IC Number']}:")
        print(history)

    reasons += rule_unusual_merchant(row, history)
    reasons += rule_high_value(row, history)
    reasons += rule_repeated_small(row, history)
    reasons += rule_cross_location(row, history)
    reasons += rule_income_mismatch(row)
    reasons += rule_student_high_spend(row)
    reasons += rule_unknown_income(row)
    reasons += rule_self_employed_high_value(row)
    reasons += rule_retiree_high_value(row)

    return reasons