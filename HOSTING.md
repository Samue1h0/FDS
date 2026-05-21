# Hosting Guide

How to put the dashboard online while keeping the backend (and Hyperledger
Fabric) running on a local machine.

**Chosen setup:** Frontend on **Vercel**, backend stays **local**, exposed to the
internet through a **Cloudflare named tunnel** (stable HTTPS URL).

```
   Visitor browser
        │  loads UI from
        ▼
   Vercel  ──(Next.js frontend, public HTTPS)──┐
        │                                        │  NEXT_PUBLIC_API_URL =
        │  browser fetch + SSE go to ────────────┘  https://api.yourdomain.com
        ▼
   Cloudflare named tunnel  (public HTTPS, stable URL)
        │
        ▼
   YOUR machine (localhost:8000)
        └── FastAPI ── Postgres ── Kafka ── Hyperledger Fabric
            (all stay local — Fabric never leaves your PC)
```

---

## Why it's set up this way

- **Why the backend stays local.** The stack depends on a Hyperledger Fabric
  network plus Postgres and Kafka. Fabric is painful to host (orderer, peers,
  CAs, chaincode lifecycle), so the whole backend stays on the machine where the
  Fabric network already runs.

- **Why a tunnel is mandatory (not just `localhost`).** Every backend call in
  this app happens in the **browser**, not on the server: `services/fraudApi.ts`,
  `context/AuthContext.tsx` (login), `components/dashboard/BlockchainAuditSection.tsx`,
  and the SSE `EventSource` in `hooks/useDashboardData.ts` all read
  `NEXT_PUBLIC_API_URL` client-side. (`middleware.ts` only reads a cookie — it
  never calls the backend.) So when the frontend is hosted, each visitor's
  browser tries to reach whatever `NEXT_PUBLIC_API_URL` points to. If that is
  `http://localhost:8000`, the browser hits the **visitor's own** machine, not
  yours — and an HTTPS page calling `http://localhost` is blocked as mixed
  content anyway. The local backend therefore needs a **public HTTPS address**,
  which the tunnel provides.

- **Why Cloudflare *named* tunnel (not quick / ngrok).** `NEXT_PUBLIC_*` values
  are baked into the frontend at **build time**. A changing tunnel URL (free
  ngrok / `cloudflared --url`) forces a frontend redeploy every restart. A named
  Cloudflare tunnel on your own domain gives a **fixed** URL
  (`https://api.yourdomain.com`), so you set `NEXT_PUBLIC_API_URL` once.

- **Why Vercel.** Native Next.js host — App Router, SSR, and `middleware.ts`
  work without extra config. Deploys straight from the `frontend/` folder.

- **CORS already allows it.** The backend sets `allow_origins=["*"]`, so the
  cross-origin calls from the Vercel domain work out of the box. The auth cookie
  is set client-side on the Vercel domain and read by `middleware.ts` there, so
  the route guard keeps working when hosted.

---

## Prerequisite

A domain whose DNS is managed in Cloudflare (nameservers pointed at Cloudflare).
The stable-URL tunnel routes e.g. `api.yourdomain.com` to your local backend.

> No domain? Use a **quick tunnel** instead: `cloudflared tunnel --url http://localhost:8000`.
> Zero setup, instant HTTPS, but the URL changes each run → update
> `NEXT_PUBLIC_API_URL` in Vercel and redeploy each time.

---

## Part A — Backend (local) via Cloudflare named tunnel

Run inside WSL (where the stack runs). Interactive logins open a browser.

1. Install `cloudflared`.
2. `cloudflared tunnel login` — authorize and pick your domain.
3. `cloudflared tunnel create fraud-backend` — creates the tunnel + a
   credentials JSON under `~/.cloudflared/`.
4. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: fraud-backend
   credentials-file: /home/user/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: api.yourdomain.com
       service: http://localhost:8000
     - service: http_status:404
   ```
5. `cloudflared tunnel route dns fraud-backend api.yourdomain.com` — creates the
   DNS record.
6. `cloudflared tunnel run fraud-backend` — backend is now reachable at
   **`https://api.yourdomain.com`**.

## Part B — Frontend on Vercel

1. Push the repo to GitHub.
2. Vercel → New Project → import repo → **Root Directory = `frontend`**.
3. Add env var **`NEXT_PUBLIC_API_URL = https://api.yourdomain.com`** (Production).
4. Deploy → you get `https://your-app.vercel.app`.

## Part C — Per-session run order (to bring the site live)

```
1. docker compose up            # Postgres + Kafka
2. start the Fabric network     # start.sh
3. run FastAPI on :8000
4. cloudflared tunnel run fraud-backend
```
The frontend is always live on Vercel; it only needs the tunnel up to fetch data.

---

## Notes & gotchas

- **`frontend/.env.local` is git-ignored** (`.env*.local`) — it holds the local
  `http://localhost:8000` value and must NOT ship to Vercel, or it would override
  the hosted API URL. Vercel uses its own dashboard env var instead.
- **The site is only up while your machine + tunnel are running.** Laptop off =
  site down. Fine for a demo / presentation.
- **The tunnel exposes your backend to the internet.** JWT login gates the data
  and `/internal/*` endpoints reject non-localhost callers, but don't leave it
  running 24/7.
- **Optional hardening:** tighten backend CORS from `["*"]` to just
  `https://your-app.vercel.app`.
