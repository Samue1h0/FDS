# 4. Fraud Detection

Detection is **hybrid**: a transparent rule engine plus a machine-learning model,
combined into a single score. Rules give human-readable reasons and catch known
patterns; the ML model catches subtle cases the rules miss.

## 4.1 The rule engine (`backend/src/rule_engine.py`)

`apply_rule_engine(row, full_df)` pulls the customer's **prior** transactions
(`get_customer_history` — same IC, earlier timestamp) and runs 9 rules. Each rule
returns zero or more **reason strings**, which are stored in the transaction's
`risk_reasons`. The reason strings are also what the Triggers page counts.

| # | Rule | Fires when | Reason string |
|---|---|---|---|
| 1 | Unusual merchant | New MCC for the customer, they've used ≥5 distinct MCCs in the last 15 days, and amount > max(RM 250, 2.5 × avg spend) | `Unusual merchant category` |
| 2 | High value | Amount > max(RM 500, 5 × customer avg spend). (No flag on a customer's first transaction — no history.) | `High-value transaction` |
| 3 | Repeated small | ≥3 prior transactions ≤ RM 10 within a 15-minute window (smurfing) | `Repeated small transactions` |
| 4 | Cross-location | Location differs from the last transaction within a 30-minute window (impossible travel) | `Rapid cross-location transaction` |
| 5 | Income mismatch | Amount > 1.2 × `income_max` (and not Self-Employed) | `Exceeds expected income capacity` |
| 6 | Student high spend | Employment = Student and amount > RM 3,000 | `High-value transaction for student profile` |
| 7 | Unknown income (unemployed) | Employment = Unemployed, income unknown, amount > RM 5,000 | `High-value transaction with unknown income` |
| 8 | Self-employed high value | Self-Employed and amount > RM 20,000: flagged if amount > 2 × `income_max` ("unusually high"); escalated if also > RM 50,000 ("very high") | `Unusually high transaction for self-employed profile` / `Very high transaction for self-employed profile` |
| 9 | Retiree high value | Employment = Retired, income unknown, amount > RM 10,000 (higher bar — retirees may have savings) | `High-value transaction (retiree) with unknown income` |

Rules 1–4 are **velocity/behavioral** (need transaction history); rules 5–9 are
**profile-based** (use the KYC employment + income). A transaction can trip
several rules at once; all matching reasons are recorded.

## 4.2 Feature engineering (`backend/src/ml_preprocessing.py`)

### Velocity features — `compute_velocity_features()`
Computed on the full context (history + current row), sorted by
`[IC Number, Date & Time]`, using `.shift(1)` / `.expanding()`:

| Feature | Captures |
|---|---|
| `hours_since_last_txn` | Time gap since the customer's previous transaction |
| `cust_avg_amount` | Expanding mean of the customer's past amounts |
| `cust_std_amount` | Expanding std of past amounts |
| `amount_zscore_cust` | How unusual this amount is vs the customer's own history |
| `amount_vs_cust_avg` | This amount ÷ customer historical average |
| `txn_count_history` | How many prior transactions the customer has |
| `location_changed` | 1 if location differs from the last transaction |
| `new_mcc_flag` | 1 if this merchant category is new for the customer |

### Engineered features — `preprocess_data()`
| Feature | Captures |
|---|---|
| `log_amount` | `log1p(amount)` — compresses large-value skew |
| `amount_is_round` | 1 if amount % 100 == 0 (fraud often uses round numbers) |
| `amount_to_income_ratio` | amount ÷ income midpoint |
| `has_income_data` | 1 if income is known |

`preprocess_data()` also one-hot-encodes categoricals and drops PII columns.

## 4.3 The ML model (`backend/models/`)

- **Random Forest**, 300 trees, `class_weight="balanced"` (fraud is rare).
- **93 features**, selected by: all features → MDI importance → top 100 →
  correlation pruning (r > 0.85) → 93 final.
- Artifacts: `fraud_model.pkl`, `imputer.pkl` (median impute, fit on the 93
  selected features), `feature_columns.pkl` (the schema).
- At inference: build the 93-feature row → median-impute → `predict_proba(X)[:,1]`
  = the fraud probability (`ml_score`).

### Held-out performance (`model_metrics.json`, via `eval_model.py`)
On a 1,024-row held-out test fold (36 fraud / 988 legit):

| Metric | Value |
|---|---|
| Recall | 0.972 |
| Precision | 0.875 |
| F1 | 0.921 |
| ROC-AUC | 0.997 |
| False-positive rate | 0.005 |

Recall is emphasized over accuracy because missing fraud is far costlier than a
false alarm. `eval_model.py` reproduces the training split exactly and scores the
*deployed* model — an honest evaluation, no retraining.

## 4.4 Hybrid scoring (`backend/src/fraud_scorer.py`)

`FraudScorer` is the single live scoring path (used by the fraud consumer). It
holds the customer history in memory and, per transaction, combines rules and ML
with a **weighted-hybrid** formula:

```
rule_score  = min(rule_count × rule_weight, max_rule_boost)   # default 0.2 / 0.5
fraud_score = min(ml_score + rule_score, 1.0)
decision    = FRAUD if fraud_score ≥ 0.6 else LEGIT
```

So the ML probability is the base, and each fired rule nudges it up (capped), and
the decision threshold is 0.6. `rule_weight` and `max_rule_boost` are
constructor parameters. (This replaced an older "any rule → score = max(ml, 0.9)"
rule-override logic.)

The result — `fraud_score`, `predicted_label`, `ml_prediction`, `rule_flag`,
`risk_reasons` — is stored in Postgres **and** written on-chain.

## 4.5 What the analyst sees

- The **Triggers page** (`/triggers`) explains every rule with its real
  threshold and a live "times fired" count, plus the model identity, the hybrid
  formula, the top-12 ML feature importances, and a model-performance modal
  (held-out vs live metrics, confusion matrices).
- Each flagged transaction shows its `risk_reasons` and `fraud_score` in the
  review modal.
