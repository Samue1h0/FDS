# 6. Backend & API Reference

The backend is a Python **FastAPI** app (`backend/src/api.py`) plus the Kafka
consumers, scorer, stores, and seed scripts. Base URL (local): `http://localhost:8000`.

## Backend modules (`backend/src/`)

| File | Role |
|---|---|
| `api.py` | FastAPI app — all REST endpoints + the SSE stream. One `asyncio.Queue` per browser tab; `_notify_clients()` fans out updates |
| `kafka_producer.py` | Reads CSV (or demo deck) + KYC, publishes to `raw-transactions` |
| `kafka_fraud_consumer.py` | Scores via `FraudScorer`, saves to Postgres + Fabric, freezes cards, notifies the API |
| `kafka_blockchain_consumer.py` | Consumes `scored-transactions`, writes to Fabric |
| `fraud_scorer.py` | `FraudScorer` — the live single-row scoring path (rules + ML + hybrid) |
| `ml_preprocessing.py` | `compute_velocity_features()`, `preprocess_data()`, `parse_income_range()` |
| `rule_engine.py` | The 9 fraud rules |
| `fabric_client.py` | HTTP client for the Fabric gateway |
| `blockchain_preprocessing.py` | `BlockchainPreprocessor` — assigns `customer_ref`, hashes/masks, splits the row |
| `private_store.py` | `PrivateRecordStore` — encrypted Postgres I/O; `freeze_card()` + `reconcile_card_freeze()` |
| `kyc_store.py` | `KYCStore` — encrypted KYC I/O |
| `user_store.py` | `UserStore` — users table, password hashing/verify, `update_password()` |
| `seed_kyc.py` / `seed_transactions.py` / `seed_users.py` | One-time DB seeders |
| `backfill_frozen_cards.py` | Backfills `card_hash` + freezes each card at its first fraud |
| `eval_model.py` | Offline held-out model evaluation → `model_metrics.json` |
| `demo_deck.py` | The curated 9-scene demo deck (see [Demo](10-demo.md)) |

## REST endpoints

### Transactions
| Method | Path | Description |
|---|---|---|
| GET | `/api/transactions` | List transactions. Filters: `decision`, `reviewed`, `search`, `risk`, `customers`, `limit`, `offset`, `sort`, `order`. Each row also carries `card_frozen` / `card_frozen_at` / `card_frozen_reasons` |
| GET | `/api/transactions/customer/{customer_ref}` | All of a customer's transactions (public fields, no PII) |
| GET | `/api/transactions/{id}` | One transaction — Fabric public fields **+** decrypted PII from Postgres + review + freeze fields |
| GET | `/api/transactions/{id}/history` | On-chain amendment history |
| POST | `/api/transactions/{id}/review` | Submit ground truth `{ground_truth_label, reviewer_id, notes?}`. Writes Fabric → Postgres → reconciles the card freeze → SSE-pushes |

### Customers (KYC)
| Method | Path | Description |
|---|---|---|
| GET | `/api/customers/search?q=&limit=` | Typeahead on `customer_ref` (no PII) |
| GET | `/api/customers/{customer_ref}` | Full KYC profile (decrypted IC + personal/employment fields) |

### Stats & charts
| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | `total, fraud_count, legit_count, pending_review, reviewed, avg_fraud_score, balance_at_risk, compromised_cards` |
| GET | `/api/charts/fraud-trend` | Monthly `[{date, fraud, legit, amount_at_risk}]` (rolled up to quarter/year client-side) |
| GET | `/api/charts/score-distribution` | Counts per fraud-score band |
| GET | `/api/triggers/stats` | Rule fire-counts + ML feature importances (Triggers page) |
| GET | `/api/model/performance` | `{test, live}` — held-out metrics + live confusion matrix |
| GET | `/api/export/transactions` | Privacy-safe CSV/XLSX export (PII gated by role + `pii=true`) |
| GET | `/api/export/transactions/meta` | Row count + date bounds for the export modal |

### Frozen cards
| Method | Path | Description |
|---|---|---|
| GET | `/api/frozen-cards` | All frozen cards + summary (`total`, `this_month`, `total_at_risk`) |
| GET | `/api/frozen-cards/{card_hash}` | One card + all its txns, each tagged `is_post_freeze` |

### Audit & blockchain
| Method | Path | Description |
|---|---|---|
| GET | `/api/audit/integrity-check` | Cross-check Fabric vs Postgres → `verified` / `tampered` |
| GET | `/api/blockchain/nodes` | Live node health (liveness, latency, block height) |
| GET | `/api/blockchain/chain?blocks=N` | Real ledger hash chain (qscc) |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → JWT + user |
| GET | `/api/auth/me` | Current user from the JWT |
| GET | `/api/auth/me/review-stats` | The logged-in analyst's review activity |
| POST | `/api/auth/change-password` | Verify current password, set a new one |

### Streaming
| Method | Path | Description |
|---|---|---|
| GET | `/api/stream` | SSE. Full snapshot on connect, then a push on every new transaction or review. 30s keepalive. Closes on demo reset (client reconnects) |

### Internal (local-only — `require_local`)
All `/internal/*` reject any request with a forwarding header (so they 403 through
the Cloudflare tunnel — local browser only):

| Method | Path | Description |
|---|---|---|
| POST | `/internal/notify` | Consumer → trigger an SSE push |
| POST | `/internal/run-demo?delay=N` | Spawn the demo-deck producer |
| POST | `/internal/stop-demo` | Stop the demo subprocess |
| GET | `/internal/demo-status` | `{running, pid}` |
| POST | `/internal/reset-demo-data` | Delete only `is_demo=true` rows (normal rerun reset) |
| POST | `/internal/reset-demo` | Truncate `private_transactions` + `frozen_cards` entirely (nuclear) |

## SSE snapshot shape

```json
{
  "stats": { "total", "fraud_count", "legit_count", "pending_review",
             "reviewed", "avg_fraud_score", "balance_at_risk", "compromised_cards" },
  "trend": [{ "date": "YYYY-MM", "fraud": 0, "legit": 0, "amount_at_risk": 0.0 }],
  "score_distribution": [{ "range": "0.0-0.2", "count": 0 }],
  "recent_transactions": [{ "...private_transactions columns... + card_frozen" }]
}
```

## Database tables (PostgreSQL, `backend/sql/`)

- **`private_transactions`** — full per-transaction record; IC + card number are
  Fernet-encrypted; holds `card_hash`, scoring fields, review fields, `is_demo`.
- **`frozen_cards`** — one row per auto-frozen card (PK `card_hash`); `frozen_at`
  is the **first** fraud's timestamp; "first fraud wins" via `ON CONFLICT DO
  NOTHING`. A freeze is reversible — `reconcile_card_freeze()` re-points or
  deletes it after a review.
- **`kyc_profiles`** — customer identity/employment/income (encrypted IC).
- **`users`** — `username`, `password_hash` (PBKDF2-SHA256), `role`, `is_active`.

DSN via `POSTGRES_DSN`. Init SQL is mounted to Postgres and runs on first start.
