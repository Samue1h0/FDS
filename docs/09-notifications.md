# 9. Notifications

Live notifications surface important events on **any** page, driven by the same
single SSE stream as the dashboard.

## Source

`context/LiveContext.tsx` (`LiveProvider`) owns one `EventSource` and, from each
snapshot, detects:
- **New fraud** — a newly-seen transaction predicted `FRAUD` (same `seenTxIds`
  pattern as the dashboard feed; the first snapshot seeds silently, no alert
  storm on load).
- **Card auto-frozen** — a new fraud whose card is frozen.
- **Pending-review reminder** — a re-ping every 5 minutes while any transactions
  await review.

`useNotifications()` exposes the list, unread count, the transient "latest"
event, plus `markAllRead` / `dismissLatest` / `clearAll`.

## Two surfaces

### Header bell (`components/header/NotificationDropdown.tsx`) — all pages
A bell with an unread **dot**; clicking opens a dropdown listing recent
notifications (type-colored, "time ago"), with **mark-all-read** on open and
**clear all**. Each item links to its target. On the **dashboard** the bell still
lights up, but the live fraud *feed* on the page is the main cue.

### Dynamic Island (`components/notifications/DynamicIsland.tsx`) — off-dashboard only
A dark, rounded **pill that drops in from the top** when a new event arrives,
auto-dismisses after ~6s, and jumps to the target on click. It is **hidden on the
dashboard** (the feed covers it there) via `usePathname()`. The slide-in uses the
`animate-island-in` keyframe in `globals.css`.

## Triggers → targets

| Trigger | Color | Click target |
|---|---|---|
| New fraud | red | `/basic-tables` (Transactions) |
| Card auto-frozen | blue | `/frozen-cards` |
| Pending-review re-ping (every 5 min) | amber | `/basic-tables` |

## Design note

The bell and the Dynamic Island both read from the **one** `LiveProvider` SSE
connection — the same one the dashboard uses — so there's a single stream feeding
the whole app (no duplicate connections).
