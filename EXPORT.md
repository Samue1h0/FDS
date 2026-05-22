# Report Export & BI Feed — Design

Export functionality for the fraud dashboard, plus a BI-friendly data feed
(e.g. Power BI / Excel) for business-operations users.

## Two surfaces (built button-first)
1. **Transactions page → "Export" button** — downloads the *current filtered
   view* (CSV / Excel). Reuses the existing Decision / Risk / Status / Search
   filters. Exports **all rows matching the filter**, not just the visible page
   (that's why it goes through a backend endpoint, not client-side).
2. **Reports page (later)** — column picker, date range, format choice, the
   Summary PDF, and the gated full-PII export.

## Outputs
- **Transaction CSV** (core).
- **Excel (.xlsx)** — same data, formatted.
- **Summary PDF** (later) — KPIs (`/api/stats`), fraud trend, risk distribution,
  top rule triggers (`/api/triggers/stats`), integrity-check result.
- **Full-PII export** — decrypted IC / card / name. **Gated**: role check +
  consent confirm (reuse `piiConsented`). Analyst-only; never part of the BI feed.

## Governance (the core rule)
Privacy-first system → exports are **privacy-safe by default**. Direct PII
(decrypted `ic_number`, `card_number`, `cardholder_name`, phone, exact address,
exact DOB) is **excluded** from the normal export and the BI feed. Full PII is a
separate, gated, analyst-only path.

## BI-friendly data feed (for business ops / Power BI)
BI tools self-serve best on **row-level, denormalized, privacy-safe** data —
NOT pre-aggregated (pre-aggregating locks ops into cuts they didn't choose).

- **Stable GET endpoint**, one flat row per transaction.
- **Optional `from`/`to` date params** → default returns all; can be scoped.
- Columns:
  - IDs: `transaction_id`, `customer_ref` (pseudonymous), `masked_card_number`
  - Date parts: `year`, `month`, `day_of_week`, `hour`
  - Transaction: `amount_myr`, `merchant_name`, `mcc`, `mode`, `location`
  - Risk: `fraud_score`, `risk_level` (Low/Med/High), `ml_prediction`,
    `rule_flag`, `decision`
  - Rules: `rules_triggered_count` + one 0/1 column per rule
  - Review/outcome: `reviewed`, `ground_truth_label`, `model_correct`, `reviewed_at`
  - Segments (Standard tier): `employment_status`, `income_band`, `state`, `city`,
    `age_band` (derived — never raw DOB)
- **Excluded:** decrypted IC/card, name, phone, exact address, exact DOB.

## Connection options for Power BI (when we get there)
- **Desktop** can read `localhost` while on the same machine/network.
- **Service** (cloud, scheduled refresh) needs the endpoint reachable over the
  internet → the Cloudflare tunnel (see HOSTING.md), plus **non-interactive auth**
  (API key / token — the JWT login is interactive). Deferred; the chosen scope is
  "BI-friendly export now", not the live endpoint yet.

## Backend endpoint
`GET /api/export/transactions?decision=&reviewed=&risk=&search=&date_from=&date_to=&columns=&format=csv`
- Reuses the same filters as `GET /api/transactions` (risk bands Low <0.6, Med
  0.6–0.8, High ≥0.8 — unified across the app).
- `columns` = comma-separated keys from the `_EXPORT_COLUMNS` registry (default =
  all 18, always in canonical order); `date_from`/`date_to` filter `timestamp::date`.
- Streams a privacy-safe CSV. Frontend fetches with the auth token → blob → download.

## Status / phases
- **Phase 1 — DONE (2026-05-21, extended 2026-05-22):** Export button on Transactions
  opens `ExportModal` (`components/tables/ExportModal.tsx`): **editable filters**
  (Decision/Status/Risk, seeded from the table), **live row count** + selectable
  **date window** from `GET /api/export/transactions/meta`, native date calendars
  constrained to the data's min/max for the chosen filters (defaulting to the full
  window; cross-validated start≤end), column picker, and CSV. Backend
  `columns`/`date_from`/`date_to` implemented; shared `_txn_filter()` helper.
- **Phase 2 — DONE (2026-05-22):** `format=csv|xlsx` (Excel via `openpyxl`, pinned in
  requirements). Gated full-PII export: `pii=true` adds decrypted Cardholder/IC/Card/
  Expiration, requires a valid JWT with role in {analyst, admin} (else 401/403) and a
  consent checkbox in the modal. PII columns never emitted without `pii=true` (the keys
  are dropped if requested otherwise). PII files are named `transactions-pii-*`.
- **Phase 3 — DONE (2026-05-22):** Dashboard "Download PDF report" button (print-to-PDF).
  `window.print()` + an `@media print` stylesheet in `globals.css` (A4, color-adjust,
  `.break-avoid`). The dashboard page (`app/(admin)/page.tsx`) registers `beforeprint`/
  `afterprint` to drop the `.dark` class (light theme on paper) and dispatch a `resize`
  so the ApexCharts SVGs reflow to print width. Chrome hidden via `print:hidden`
  (`AppHeader`, sign-out bar, status bar, live `FraudAlertFeed`, the button). Two
  print-only sections in `components/dashboard/ReportSections.tsx` (`hidden print:block`):
  **top rule triggers** (`/api/triggers/stats`) and **top-risk transactions** (derived
  from `allTransactions` already on the page), plus a report header (title/timestamp/
  user). No new dependency; charts reused as-is.
