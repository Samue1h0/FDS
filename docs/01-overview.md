# 1. Overview

## What it is

A full-stack, real-time **credit-card fraud detection system** with a
blockchain-backed audit trail. It ingests a stream of card transactions, decides
whether each one is fraudulent within seconds, acts on that decision
(flagging it and freezing the card if needed), and records every decision
immutably so it can later be proven untampered.

It was built as a final-year project. The guiding principle for every feature is
that it must serve **fraud detection + auditability**.

## The problem it solves

Card fraud has to be caught *as it happens*, not in a nightly batch — and once a
fraud team makes a decision, there must be a trustworthy record of exactly what
the system saw and decided, for disputes and audits. This system addresses both:
real-time detection **and** a tamper-evident decision trail.

## Key capabilities

- **Real-time scoring** — transactions are scored the moment they arrive, via
  Kafka streaming, with sub-second latency per transaction.
- **Hybrid detection** — a transparent **rule engine** (9 hand-written fraud
  rules) combined with a **machine-learning model** (Random Forest). Rules catch
  known patterns and give human-readable reasons; the ML model catches the
  subtle cases rules miss.
- **Automatic card freezing** — when a transaction is judged fraud, the card is
  frozen immediately to block further use. Freezes are **reversible**: an
  analyst marking the transaction legitimate unfreezes the card.
- **Blockchain audit trail** — every decision is written to a Hyperledger Fabric
  ledger. Records can't be silently altered or deleted; an integrity check
  cross-references the ledger against the database.
- **Privacy by design** — personal data (IC number, card number) is encrypted at
  rest; the ledger stores only hashed/masked identifiers; list views never show
  cardholder names (only customer references); full PII is gated behind role +
  consent.
- **Analyst dashboard** — a live web dashboard: metrics, fraud trend, a real-time
  fraud feed, frozen cards, detection-rule explainers, model performance, and a
  blockchain view. Analysts review flagged transactions and the system learns the
  ground truth.
- **Notifications** — a live notification bell plus an off-dashboard "Dynamic
  Island" pill surface new frauds, freezes, and pending-review reminders on any
  page.

## Who uses it

**Fraud analysts** — they log in, watch the live dashboard, review flagged
transactions (Confirm Fraud / Mark Legitimate), and manage frozen cards. Roles
are `analyst` and `admin`.

## Technology at a glance

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Backend | Python + FastAPI |
| Streaming | Apache Kafka (+ Zookeeper) |
| Database | PostgreSQL (Fernet-encrypted sensitive columns) |
| Blockchain | Hyperledger Fabric (test-network) + a Go gateway |
| ML | scikit-learn Random Forest (93 features) |
| Realtime | Server-Sent Events (SSE) |
| Hosting | Vercel (frontend) + Cloudflare tunnel (local backend) |

See [Architecture](02-architecture.md) for how these fit together.
