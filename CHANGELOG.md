# Changelog

## 2026-05-29

### Hosting / Deployment — site went live
- Connected the **`myfaid.com`** domain (Cloudflare Registrar → DNS already on Cloudflare).
- Backend exposed via a **Cloudflare token tunnel** at `api.myfaid.com`, wired into `start.sh` as a `tunnel` tmux window (token in git-ignored `.env`).
- Frontend deployed on **Vercel** from the repo (now `Samue1h0/FDS`); `myfaid.com` + `www` custom domain attached.
- Locked backend **CORS** to `myfaid.com` / `www` / `localhost` / `*.vercel.app` (was `["*"]`).
- Fixed **login redirect bounce** — switched to a hard navigation so the auth cookie is carried (a cached middleware redirect was sending users back to `/signin`).
- Fixed the **dashboard browser-tab title** (was showing the URL) via a root-layout default title.
- Hid the **demo controls on hosted/non-local hosts** (they 403 through the tunnel by design); drive the demo locally via `python3 -m src.kafka_producer --demo`.
- See `HOSTING.md` for full setup details.

### Dashboard
- Replaced the risk-distribution donut with a **Period Summary** panel that follows the Fraud Trend granularity (Monthly/Quarterly/Yearly): selectable period (defaults to latest), fraud cases + Δ vs previous period, amount at risk + Δ, fraud rate, and a totals footer.
- **Swapped rows**: Recent Transactions now sits above the Fraud Trend row.
- Removed the misleading current-month label beside the "Dashboard" title.

### Frozen Cards
- Added **search by customer ID** with an autocomplete dropdown of matching frozen-card customers.
- Added **pagination, 7 per page**, with a "Showing X–Y of Z" count.

### Profile & Accounts
- Built a real **analyst profile page** (`/profile`): identity & session (from the JWT), **review activity** (reviews done, confirmed fraud, cleared, amount approved, cards unfrozen — keyed on the logged-in user), and **change password** (new `POST /api/auth/change-password`; review-stats via `GET /api/auth/me/review-stats`).
- Wired the **header user dropdown** to the logged-in user (real name + avatar, working sign-out); removed the top-right "Signed in as … Sign out" bar.
- Added 4 **team accounts** (`CCX`→Chun Xian, `Hong`→Mun Hong, `Sam`→Sam, `Siew`→Yat Fei) with avatars; names/photos mapped in `lib/userDirectory.ts`. (Run `python3 -m src.seed_users` to create them; login is case-sensitive.)

### Notifications
- Added **live notifications**: a header **bell** (all pages, unread dot + list + mark-all-read) and an off-dashboard **Dynamic Island** pill that drops in on new events.
- Triggers: new fraud, card auto-frozen, and a pending-review re-ping every 5 minutes. Click-through jumps to the transaction / Frozen Cards.
- **Unified the live data**: one `LiveProvider` now owns a single SSE connection feeding both the dashboard and the notifications (removed the dashboard's second connection).
