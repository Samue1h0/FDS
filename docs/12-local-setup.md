# 12. Local Setup

How to run the whole stack on one machine (developed on WSL/Linux).

## Prerequisites

- **Docker** (for Kafka + Zookeeper + Postgres via Docker Compose)
- **Python 3.12** + the backend deps (`pip install -r backend/requirements.txt`)
- **Node.js** + npm (for the Next.js frontend)
- **Go** (for the Fabric gateway) + the Hyperledger Fabric test-network
  prerequisites
- **tmux** (the launcher runs each service in a tmux window)

## Required environment

A `.env` file at the repo root (git-ignored). Minimum:
```
ENCRYPTION_KEY=<a Fernet key>          # used to encrypt IC/card columns
CLOUDFLARE_TUNNEL_TOKEN=<token>        # only needed for the hosted tunnel window
```
Other variables default sensibly (see [Architecture](02-architecture.md)).
`frontend/.env.local` holds `NEXT_PUBLIC_API_URL=http://localhost:8000` for local
dev (git-ignored, so it never ships to Vercel).

> Keep `.env` to plain `KEY=value` lines — **no comments or spaces**. `start.sh`
> loads it with `export $(cat .env | xargs)`, which breaks on `#`/spaces (this
> once aborted the FastAPI startup → Cloudflare 502).

## First-time database seeding

With Postgres up (`docker compose up -d`), from `backend/`:
```
# 1. KYC profiles
POSTGRES_DSN=... ENCRYPTION_KEY=... python3 -m src.seed_kyc

# 2. Historical transactions (rows 101–5118; first 100 reserved for the demo)
POSTGRES_DSN=... ENCRYPTION_KEY=... python3 -m src.seed_transactions

# 3. User accounts (analyst1/2, admin, CCX/Hong/Sam/Siew)
POSTGRES_DSN=... python3 -m src.seed_users
```
On a fresh container the table DDL in `backend/sql/` runs automatically. On an
already-initialized DB you may need to add the `card_hash` column + `frozen_cards`
table by hand, then run `python3 -m src.backfill_frozen_cards`.

## Running everything

```
./start.sh
```
This brings up, in a tmux session named `fraud`: Docker (Kafka/Postgres), the
Fabric network, the gateway, both Kafka consumers, FastAPI (`:8000`), the Next.js
dev server (`:3000`), and the Cloudflare tunnel.

tmux basics: `tmux attach -t fraud`, switch windows with `Ctrl+B` then `W`,
detach with `Ctrl+B` then `D`. Stop everything with `./stop.sh`.

## Verify it's up

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/stats   # 200
```
Then open `http://localhost:3000` and log in (e.g. `CCX` / `ccx12345`).

## Running a demo

See [Demo](10-demo.md). Quickest:
```
cd backend && python3 -m src.kafka_producer --demo --delay 2
```
Watch the dashboard update live; reset with the **Reset Demo** button or
`/internal/reset-demo-data`.

## Useful one-offs

| Command (from `backend/`) | Does |
|---|---|
| `python3 -m src.eval_model` | Regenerate held-out model metrics (`model_metrics.json`) |
| `python3 -m src.backfill_frozen_cards` | Populate `card_hash` + freeze each card at its first fraud |
| `python3 -m src.seed_users` | (Re)create user accounts |
