# 10. Demo

## The demo deck

`backend/src/demo_deck.py` is a curated **9-scene story** (~80 transactions)
designed to exercise every fraud rule plus the auto-freeze and post-freeze flow —
not random data. Each row stores only a **relative** `offset_seconds`; the
producer computes real timestamps at runtime as `T0 + offset`, where
`T0 = MAX(timestamp)` of the non-demo data. So every replay lands in the same
clean window and is fully reproducible.

| Scene | Beat | What it demonstrates |
|---|---|---|
| 1 | Quiet morning (15 legit) | A normal baseline |
| 2 | High-value attack on Marcus | RM 9,500 → high-value rule → **card freezes**; post-freeze retries |
| 3 | Normal traffic (10 legit) | Recovery |
| 4 | Impossible travel (Daniel KL→Tokyo) | Cross-location rule → freeze mid-scene |
| 5 | Normal traffic (8 legit) | — |
| 6 | Smurfing on Sarah | Repeated-small-transactions rule → freeze on the 5th |
| 7 | ML-only catches | No rule fires — the model alone flags them |
| 8 | Mixed frauds | Income mismatch / student / retiree / unemployed overspend |
| 9 | Wind-down (10 legit) | Dashboard settles |

The "victims" (Marcus, Daniel, Sarah, Ying, Tan, Raj, Zhen, Arjun) must exist in
`KYC_Data.csv`.

## Running the demo

**Option A — the dashboard button (local only).** On `localhost`, the
**Run Demo** button plays the deck through Kafka at ~2s/transaction. (These
controls are hidden on the hosted site because `/internal/*` is local-only.)

**Option B — the terminal (works anywhere, incl. when presenting on the hosted
site):**
```
cd backend && python3 -m src.kafka_producer --demo        # add --delay 2 to pace it
```

Either way, each transaction flows Kafka → fraud scorer → blockchain → SSE, and
the dashboard updates **live**: metrics, trend, the recent feed, frozen cards,
the alert feed, and the notification bell / Dynamic Island.

## Resetting between runs

Demo rows are tagged `is_demo=true`, so a reset deletes **only** them — the
~5,000 historical transactions stay put.

- **Reset Demo** button (local), or
- `POST /internal/reset-demo-data`, or `python3 -m src.reset_demo`-style cleanup.

Because demo timestamps are always later than the historical data, a demo fraud
is never a card's *earliest* fraud, so resetting demo data also safely drops the
freezes it created.

> `POST /internal/reset-demo` is the **nuclear** option — it truncates
> `private_transactions` and `frozen_cards` entirely (historical included). Use
> `reset-demo-data` for normal rerun cycles.

## A clean demo loop

```
./start.sh                       # bring up the whole stack
→ Run Demo (or the producer cmd) # narrate the scenes as freezes happen
→ Reset Demo                     # wipe demo rows
→ repeat
```
