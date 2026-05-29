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
        │  browser fetch + SSE go to ────────────┘  https://api.myfaid.com
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
  (`https://api.myfaid.com`), so you set `NEXT_PUBLIC_API_URL` once.

- **Why Vercel.** Native Next.js host — App Router, SSR, and `middleware.ts`
  work without extra config. Deploys straight from the `frontend/` folder.

- **CORS is locked to the known origins.** `backend/src/api.py` allows
  `https://myfaid.com`, `https://www.myfaid.com`, `localhost:3000` (dev), and
  `*.vercel.app` (preview/initial deploys); add more via the
  `CORS_EXTRA_ORIGINS` env var. The auth cookie is set client-side on the Vercel
  domain and read by `middleware.ts` there, so the route guard keeps working
  when hosted.

---

## Prerequisite

A domain whose DNS is managed in Cloudflare. **`myfaid.com` was bought through
Cloudflare Registrar, so its DNS is already on Cloudflare — no nameserver change
needed.** The stable-URL tunnel routes `api.myfaid.com` to your local backend.

> No domain? Use a **quick tunnel** instead: `cloudflared tunnel --url http://localhost:8000`.
> Zero setup, instant HTTPS, but the URL changes each run → update
> `NEXT_PUBLIC_API_URL` in Vercel and redeploy each time.

---

## Part A — Backend (local) via Cloudflare named tunnel (token-managed)

We use a **remotely-managed (token) tunnel**: the tunnel is created in the
Cloudflare dashboard and its routing lives in the dashboard, so there is **no
local `config.yml` and no `cloudflared tunnel route dns`**. Run inside WSL.

1. Install `cloudflared` (no sudo needed):
   ```
   mkdir -p ~/.local/bin
   curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared
   chmod +x ~/.local/bin/cloudflared
   ```
2. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → **Cloudflared** → name it `fraud-backend`. Copy the **token** (`eyJ…`).
3. Store the token in the git-ignored `.env` at repo root:
   `CLOUDFLARE_TUNNEL_TOKEN=eyJ…`. `start.sh` reads it and runs the tunnel in a
   `tunnel` tmux window.
4. In the tunnel's **Public Hostname** tab, add: subdomain `api`, domain
   `myfaid.com`, service **HTTP** → `localhost:8000`. This auto-creates the
   `api.myfaid.com` DNS record. Backend is then reachable at
   **`https://api.myfaid.com`**.

> **Do NOT use `cloudflared service install` on WSL.** Its generated unit is
> `Type=notify` with `TimeoutStartSec=15`; WSL's slow stub resolver
> (`10.255.255.254`) makes the first DNS lookup stall ~10s, so cloudflared never
> signals "ready" in time → systemd times out at 15s, SIGTERMs it, and
> `Restart=on-failure` crash-loops. The foreground `cloudflared tunnel run
> --token …` (what `start.sh` does) has no such deadline and connects fine. If a
> service was already installed: `sudo cloudflared service uninstall`.
>
> The dashboard-managed tunnel can't do a path-based `/internal` 404 ingress
> rule, but it doesn't need to — `/internal/*` is already locked at the backend
> via `require_local` (rejects any forwarded/tunneled request). See
> [HOSTING.md notes](#notes--gotchas).

## Part B — Frontend on Vercel

1. Push the repo to GitHub.
2. Vercel → New Project → import repo → **Root Directory = `frontend`**.
3. Add env var **`NEXT_PUBLIC_API_URL = https://api.myfaid.com`** (Production).
4. Deploy → you get `https://<project>.vercel.app`.
5. **Custom domain:** Vercel → Project → Settings → Domains → add `myfaid.com`
   and `www.myfaid.com`. Since DNS is on Cloudflare, add the records Vercel
   shows (apex → A/ALIAS or the Vercel anycast IP; `www` → CNAME
   `cname.vercel-dns.com`). In Cloudflare set those records to **DNS-only (grey
   cloud)**, not proxied, so Vercel can issue the TLS cert. The site is then live
   at `https://myfaid.com`.

## Part C — Per-session run order (to bring the site live)

`./start.sh` brings up the whole stack in tmux — Docker (Postgres + Kafka),
Fabric, the consumers, FastAPI :8000, the Next.js dev server, **and** the
Cloudflare tunnel (the `tunnel` window runs `cloudflared tunnel run --token`
from `CLOUDFLARE_TUNNEL_TOKEN` in `.env`). So a single `./start.sh` is enough.

The frontend is always live on Vercel; it only needs the tunnel + backend up to
fetch data. The tunnel window skips gracefully if cloudflared isn't installed or
the token isn't set.

---

## Notes & gotchas

- **`frontend/.env.local` is git-ignored** (`.env*.local`) — it holds the local
  `http://localhost:8000` value and must NOT ship to Vercel, or it would override
  the hosted API URL. Vercel uses its own dashboard env var instead.
- **The site is only up while your machine + tunnel are running.** Laptop off =
  site down. Fine for a demo / presentation.
- **The tunnel exposes your backend to the internet.** JWT login gates the data.
  `/internal/*` is now **local-only and tunnel-proof** (2026-05-29): `require_local`
  rejects any request carrying a proxy/forwarding header (`cf-connecting-ip`,
  `x-forwarded-for`, …), which every tunneled request has — a plain `client.host`
  localhost check is NOT enough since cloudflared forwards from localhost.
  **Side effect:** the hosted dashboard's demo controls (Run/Stop/Reset) will 403;
  drive the demo from a local browser instead. Still, don't leave the tunnel up 24/7.
- **Defense in depth at the tunnel:** also 404 `/internal` in the cloudflared
  ingress so those routes never even reach the backend:
  ```yaml
  ingress:
    - hostname: api.myfaid.com
      path: ^/internal/.*
      service: http_status:404
    - hostname: api.myfaid.com
      service: http://localhost:8000
    - service: http_status:404
  ```
- **CORS is locked** (done): `backend/src/api.py` allows `myfaid.com`,
  `www.myfaid.com`, `localhost:3000`, and `*.vercel.app`. Add transient origins
  with the `CORS_EXTRA_ORIGINS` env var instead of editing code.
