# 7. Frontend

A **Next.js** (App Router) + TypeScript + Tailwind CSS app in `frontend/`. It
reads the backend over REST and the live SSE stream. Every backend call uses
`NEXT_PUBLIC_API_URL` (baked at build time), so the same build works locally and
hosted.

## Live data — one SSE source

`context/LiveContext.tsx` (`LiveProvider`, mounted in `(admin)/layout.tsx`) owns
a **single** `EventSource` to `/api/stream` for the whole admin app and exposes
both:
- the **dashboard data** (`useDashboardData()` — stats, trend, recent
  transactions, the fraud alert feed, connection status, with 5s reconnect and
  30s polling fallback), and
- the **notifications** (`useNotifications()` — see [Notifications](09-notifications.md)).

`services/fraudApi.ts` is the typed API client (attaches the JWT, exposes typed
functions for every endpoint).

## Pages

The header nav has five sections (plus login and profile):

### Dashboard (`/`)
The live command center. Layout (12-col grid):
- **Row 1** — `FraudMetrics`: four stat cards (Flagged Transactions, Balance at
  Risk, Compromised Cards, Pending Review).
- **Row 2** — `RecentTransactions` (last 8, with a frozen-card lock indicator) +
  `ReviewProgressCard` (reviewed vs pending) + `FraudAlertFeed` (live new-fraud
  feed).
- **Row 3** — `FraudTrendChart` (dual-axis: fraud count + amount at risk;
  Monthly/Quarterly/Yearly toggle) + `PeriodSummary` (period-aware summary:
  selectable period, fraud cases + Δ vs previous, amount at risk + Δ, fraud rate,
  totals).
- **Row 4** — `BlockchainAuditSection` (integrity check).
- Header also has `DashboardStatusBar` (live/stale/error), a **Download PDF
  report** button (print-to-PDF of the dashboard), and `DemoControls`
  (Run/Stop/Reset — local-only; hidden on hosted).

### Transactions (`/basic-tables`)
`TransactionTable` — real data from `/api/transactions`, with filters
(Decision / Status / Risk / Search), 10/page pagination, and a frozen-card pill.
A **Review** button on unreviewed rows opens the `ReviewModal`, which fetches the
enriched transaction, the customer's history, and their KYC, and offers
**Confirm Fraud / Mark Legitimate** + notes. The reviewer is auto-filled from the
logged-in user.

### Frozen Cards (`/frozen-cards`)
Cards auto-frozen after fraud. Summary cards + a table (customer ref, masked
card, frozen-on, fraud count, at-risk, txns). **Search by customer ID** with an
autocomplete dropdown; **7-per-page** pagination. A detail modal shows the card's
timeline with a "Frozen here" divider and a PII-gated cardholder section. List
views never show cardholder names — only `customer_ref`.

### Triggers (`/triggers`)
Explains how verdicts are made: the 9 rules as cards with thresholds + live
fire-counts, the model identity + hybrid-scoring formula + top-12 feature
importances, and a model-performance modal (held-out vs live metrics).

### Blockchain (`/blockchain`)
Live proof the ledger is running and untampered: per-node health cards, ledger
status, a horizontal **block hash chain** (last 8 blocks linked by prev-hash), a
self-contained integrity panel (re-runs every 30s), and a transaction-history
inspector.

### Profile (`/profile`)
See [Auth & Accounts](08-auth-and-accounts.md).

## Auth & route protection

JWT-based (`context/AuthContext.tsx`). The admin layout guards client-side:
unauthenticated users are redirected to `/signin`. After login the app does a
hard navigation to `/` so the cookie is reliably carried. The header user
dropdown shows the logged-in person's real name + avatar (mapped in
`lib/userDirectory.ts`) with a working sign-out.

## Notable conventions

- **No names in lists** — list/table/filter views use `customer_ref`; cardholder
  names appear only in PII-gated detail contexts.
- **Print/PDF** — report-only sections render on `print` for the dashboard PDF.
- The middleware file is named `proxy.ts` (Next.js 16's name for middleware).
