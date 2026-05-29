# 3. Data Pipeline

## Datasets

| File | Contents |
|---|---|
| `backend/data/Transaction_Data5k.csv` | 5,118 transactions (`TXN0001`–`TXN5118`) |
| `backend/data/KYC_Data.csv` | ~700 customer KYC profiles |

Date format throughout is `DD/MM/YYYY HH:MM`. Each transaction has: amount (MYR),
merchant name + MCC, mode (In-Person/Online), location, IP, device, and an
`is_fraud` ground-truth label. KYC has identity, contact, employment, and an
`income_range` string (e.g. `"MYR 5001-8000"`).

## Two ingestion paths

### 1. Batch seeding (historical backdrop)
`seed_transactions.py` loads the CSV, scores every row, and inserts it into
Postgres. By default it **skips the first 100 rows** (`--skip 100`) — those are
reserved as the live demo batch. Rows 101–5118 become the historical backdrop the
dashboard shows at startup. Ground-truth labels come from the CSV's `is_fraud`.

`seed_kyc.py` loads `KYC_Data.csv` through the same `BlockchainPreprocessor` so
each customer gets the same `customer_ref` the transactions reference, then
inserts into `kyc_profiles`.

### 2. Real-time streaming (the live path)
`kafka_producer.py` reads the CSV (or the curated demo deck), merges each
transaction with its customer's KYC, and publishes to the `raw-transactions`
Kafka topic. This is the path used during a live demo.

```
kafka_producer.py  ──►  Kafka: raw-transactions
                              │
                              ▼
                   kafka_fraud_consumer.py   (score + persist + freeze + notify)
                              │
                              ▼
                   Kafka: scored-transactions
                              │
                              ▼
                   kafka_blockchain_consumer.py   (write to Fabric)
```

Producer arguments: `--limit` (CSV mode count), `--delay` (seconds between
messages), `--skip` (CSV rows to skip), `--demo` (play the curated deck instead),
`--txn-csv` / `--kyc-csv`.

## customer_ref — the join key

`customer_ref` (e.g. `CUST000001`) is **not** in the CSV. It's assigned by
`BlockchainPreprocessor` from the KYC map, deterministically, so the **same**
customer always gets the **same** ref across the transaction table, the KYC
table, and the ledger. This ref is what ties everything together while keeping
the real IC number out of list views.

```
private_transactions.customer_ref ──► kyc_profiles.customer_ref
```

## What gets computed per transaction

Before scoring, the consumer enriches each row:
1. Parse date / amount / income range.
2. Append to the in-memory customer history.
3. Compute **velocity features** (per-customer behavioral signals — see
   [Fraud Detection](04-fraud-detection.md)).
4. Run the **rule engine** against the customer's prior transactions only.
5. Run **ML preprocessing** + the model.
6. Combine into a hybrid score + decision.
7. Split into the private record (Postgres) + public payload (Fabric).

## Identifiers & privacy

`BlockchainPreprocessor` derives, for each row:
- `ic_hash` — SHA-256 of the IC number (goes on-chain + Postgres).
- `card_hash` — SHA-256 of the card number (Postgres only; the freeze key).
- `masked_card_number` — `****1234` form (on-chain + Postgres).

The real IC number and card number are **Fernet-encrypted** in Postgres and never
written to the ledger. See [Blockchain](05-blockchain.md) for the field split.
