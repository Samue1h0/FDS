# 5. Blockchain (Hyperledger Fabric)

## Why a blockchain

Every fraud decision is written to a **Hyperledger Fabric** ledger so it can't be
silently altered or deleted afterward. This gives a provable, append-only audit
trail of exactly what the system decided — valuable for disputes and audits. The
ledger holds **no personal data**; only hashed/masked identifiers and the public
decision fields.

## Network topology (test-network)

| Node | Ports (service / operations) | MSP |
|---|---|---|
| orderer.example.com | 7050 / 9443 | Orderer |
| peer0.org1.example.com | 7051 / 9444 | Org1 |
| peer0.org2.example.com | 9051 / 9445 | Org2 |

- Channel: `mychannel`
- Chaincode: deployed as **`fraud`** (the gateway resolves it via the
  `CHAINCODE_NAME` env var).
- Each node's **operations service** is plain HTTP, so `/healthz` (liveness) and
  Prometheus `/metrics` (block height) are directly scrapeable — this powers the
  Blockchain page's live node health.

## The gateway (`blockchain/gateway/main.go`)

A small Go HTTP service (port 8080, run as `go run main.go`) that the Python
backend talks to. Routes:

| Route | Purpose |
|---|---|
| `/submit` | Write a transaction record on-chain |
| `/query` | Read one record |
| `/all` | Read all records |
| `/update-ground-truth` | Append a review/amendment |
| `/history` | Full amendment history of one transaction |
| `/chain-info` | qscc `GetChainInfo` — height + current/previous block hash |
| `/blocks?count=N` | qscc `GetBlockByNumber` — decoded block headers |

`/chain-info` and `/blocks` query Fabric's built-in **qscc** system chaincode and
decode the block protobufs into JSON (hex hashes), so the dashboard can show the
real hash chain without any custom chaincode.

## On-chain vs private store

`BlockchainPreprocessor.process_transaction()` splits one raw transaction into
two synchronized outputs:

| Field | Fabric (on-chain) | PostgreSQL (private) |
|---|---|---|
| `transaction_id` | ✅ (primary join) | ✅ |
| `customer_ref` | ✅ | ✅ |
| `ic_hash` (SHA-256) | ✅ | ✅ |
| `masked_card_number` | ✅ | ✅ |
| `fraud_score`, `predicted_label`, `ml_prediction`, `rule_flag`, `risk_reasons` | ✅ | ✅ (duplicated for fast reads) |
| `amount_myr` | ✅ | ✅ |
| `cardholder_name` | ❌ | ✅ (plaintext) |
| `ic_number` | ❌ | ✅ (Fernet-encrypted) |
| `card_number` | ❌ | ✅ (Fernet-encrypted) |
| `card_expiration_date` | ❌ | ✅ (plaintext) |
| `card_hash` | ❌ | ✅ (freeze key only) |

So the ledger is the **public, verifiable record**; Postgres is the **private,
detailed record**. They're joined by `transaction_id`.

## Integrity check

`GET /api/audit/integrity-check` walks every Fabric record and compares it to the
matching Postgres row on `fraud_score`, `predicted_label`, `amount_myr`,
`ml_prediction`, `rule_flag`. It returns `verified` if everything matches or
`tampered` if any record diverges — proving the off-chain DB hasn't been edited
behind the ledger's back. The dashboard and the Blockchain page both surface this
(the Blockchain page re-runs it every 30s).

## Reviews on-chain

When an analyst submits a review, the new ground truth is written to **Fabric
first** (`/update-ground-truth`, an append — the original record is preserved),
then to Postgres. The Blockchain page's history inspector (`/history`) shows the
full append-only amendment trail for any transaction ID.
