# 2. Architecture

## High-level design

The system is split into a **local backend** (the detection brain + databases +
blockchain) and a **web frontend** (the analyst dashboard). They communicate
over HTTP/REST and a Server-Sent Events (SSE) stream.

```
                        ┌─────────────────────────────────────────────┐
                        │                 BACKEND (local)              │
   transactions         │                                             │
   (CSV / producer)     │   Kafka ── fraud consumer ── FraudScorer     │
        │               │     │         │  (rules + ML)               │
        ▼               │     │         ├── PostgreSQL (encrypted)     │
   raw-transactions ────┼─────┘         │     └── frozen_cards         │
                        │               └── scored-transactions ──┐    │
                        │                                          ▼    │
                        │                       blockchain consumer     │
                        │                          └── Hyperledger Fabric│
                        │                                                │
                        │   FastAPI ── REST + /api/stream (SSE) ─────────┼──┐
                        └────────────────────────────────────────────────┘  │
                                                                              │
                        ┌─────────────────────────────────────────────┐      │
                        │            FRONTEND (Next.js)                │◄─────┘
                        │   dashboard, transactions, frozen cards,     │
                        │   triggers, blockchain, profile + live feed  │
                        └─────────────────────────────────────────────┘
```

## Components

### Streaming — Apache Kafka
Two topics decouple the stages:
- `raw-transactions` — incoming transactions (produced by `kafka_producer.py`).
- `scored-transactions` — transactions after scoring, awaiting blockchain write.

### Detection — the fraud consumer
`kafka_fraud_consumer.py` consumes `raw-transactions`, scores each one with
`FraudScorer` (rules + ML → a hybrid score and decision), saves the full record
(encrypted) to Postgres, freezes the card if it's fraud, then publishes the
public payload to `scored-transactions` and pings the API to push an SSE update.

### Ledger — the blockchain consumer
`kafka_blockchain_consumer.py` consumes `scored-transactions` and writes the
public fields to Hyperledger Fabric via a Go gateway.

### Storage
- **PostgreSQL** holds the full private record (`private_transactions`),
  customer KYC profiles (`kyc_profiles`), frozen cards (`frozen_cards`), and
  users (`users`). Sensitive columns (IC, card number) are **Fernet-encrypted**.
- **Hyperledger Fabric** holds the tamper-evident public record (no PII).

### API — FastAPI
`api.py` exposes all REST endpoints, the SSE stream, and local-only `/internal`
endpoints (demo control + the consumer's notify hook). One `asyncio.Queue` per
connected browser tab fans out live updates.

### Frontend — Next.js
The dashboard and feature pages, all reading the live SSE stream through one
shared provider. See [Frontend](07-frontend.md).

## End-to-end data flow

```
raw transaction (Kafka: raw-transactions)
        │
        ▼
kafka_fraud_consumer.py
  → FraudScorer  (velocity features → rule engine → ML model → hybrid score)
  → BlockchainPreprocessor.process_transaction()   # split into 2 outputs
        ├── private_record  ──► PostgreSQL (PrivateRecordStore.save, encrypted)
        │        └── if decision == FRAUD → freeze_card() ──► frozen_cards
        └── blockchain_payload ──► Kafka: scored-transactions
                                          │
                                          ▼
                                kafka_blockchain_consumer.py
                                  └── FabricClient → Hyperledger Fabric
                                          │
                                          ▼
                                POST /internal/notify
                                  └── SSE push to all dashboard clients
```

One raw row becomes **two synchronized outputs** — see
[Blockchain](05-blockchain.md) for the exact field split.

## Process topology (per session)

Brought up by `start.sh` in a tmux session named `fraud`:

| tmux window | Process |
|---|---|
| `gateway` | Fabric Go gateway (`go run main.go`), port 8080 |
| `fraud-consumer` | `kafka_fraud_consumer.py` |
| `chain-consumer` | `kafka_blockchain_consumer.py` |
| `fastapi` | `uvicorn src.api:app` on port 8000 |
| `frontend` | `npm run dev` (Next.js) on port 3000 |
| `tunnel` | `cloudflared tunnel run` (for hosted access) |

Plus Docker Compose for Kafka/Zookeeper/Postgres, and the Fabric test-network
containers. See [Local Setup](12-local-setup.md).

## Environment variables

| Variable | Default | Used by |
|---|---|---|
| `FABRIC_GATEWAY_URL` | `http://localhost:8080` | api.py, fabric_client.py |
| `POSTGRES_DSN` | `postgresql://fraud_user:fraud_pass@localhost:5432/fraud_private` | api.py, consumers, stores, seeds |
| `ENCRYPTION_KEY` | — (required) | private_store.py, kyc_store.py (Fernet key) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | frontend (baked at build time) |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | fraud consumer |
| `FASTAPI_URL` | `http://localhost:8000` | fraud consumer (for `/internal/notify`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | `start.sh` tunnel window |
