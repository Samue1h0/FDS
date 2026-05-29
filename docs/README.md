# Fraud Detection System — Documentation

Full technical documentation for the real-time, blockchain-backed credit-card
fraud detection system.

## Contents

1. [Overview](01-overview.md) — what the system is, the problem it solves, key capabilities
2. [Architecture](02-architecture.md) — high-level design, components, end-to-end data flow
3. [Data Pipeline](03-data-pipeline.md) — CSV → Kafka → consumers → Postgres + Fabric
4. [Fraud Detection](04-fraud-detection.md) — the rule engine (all 9 rules) + the ML model + hybrid scoring
5. [Blockchain](05-blockchain.md) — Hyperledger Fabric network, what's on-chain vs the private store, integrity checks
6. [Backend & API Reference](06-backend-api.md) — FastAPI app, every endpoint, the SSE stream
7. [Frontend](07-frontend.md) — Next.js dashboard, pages, components, the live feed
8. [Auth & Accounts](08-auth-and-accounts.md) — JWT login, roles, the team accounts, the profile page
9. [Notifications](09-notifications.md) — the live notification bell + Dynamic Island
10. [Demo](10-demo.md) — the curated 9-scene demo deck and how to run/reset it
11. [Deployment](11-deployment.md) — Vercel + Cloudflare tunnel (myfaid.com)
12. [Local Setup](12-local-setup.md) — prerequisites, seeding, running the whole stack

See also [`../CHANGELOG.md`](../CHANGELOG.md) for the dated work log.

## One-paragraph summary

Transactions stream through **Kafka**; each one is scored in real time by a
**hybrid engine** (a 9-rule expert system + a Random-Forest ML model). The
result is written to two places at once: an **encrypted PostgreSQL** store (full
private detail) and a **Hyperledger Fabric** ledger (a tamper-evident public
record). A card is **auto-frozen** the moment a fraud is detected on it. A
**Next.js dashboard** shows everything live over Server-Sent Events — metrics,
trends, a fraud feed, frozen cards, and a blockchain audit view — and analysts
**review** flagged transactions, which can unfreeze a falsely-flagged card.
