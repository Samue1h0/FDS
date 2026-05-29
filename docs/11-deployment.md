# 11. Deployment

The live site runs the **frontend on Vercel** and keeps the **backend (+ Fabric +
Postgres + Kafka) local**, exposed to the internet through a **Cloudflare
tunnel**. Full step-by-step is in [`../HOSTING.md`](../HOSTING.md); this is the
overview.

```
   Visitor browser
        │ loads UI from
        ▼
   Vercel (Next.js frontend)  ── NEXT_PUBLIC_API_URL = https://api.myfaid.com
        │ browser fetch + SSE
        ▼
   Cloudflare tunnel (stable public HTTPS)
        │
        ▼
   Your machine: FastAPI :8000 ── Postgres ── Kafka ── Hyperledger Fabric
```

## Why this shape

Fabric (orderer/peers/CAs/chaincode) is impractical to host, so the whole backend
stays on the machine where the Fabric network already runs. But every backend
call happens in the **browser** (the frontend reads `NEXT_PUBLIC_API_URL`
client-side), so the local backend needs a **public HTTPS** address — that's what
the tunnel provides. A **named/token** Cloudflare tunnel gives a *fixed* URL
(`api.myfaid.com`), so `NEXT_PUBLIC_API_URL` is set once at build time and never
needs a redeploy.

## Domains

- **Frontend:** `myfaid.com` + `www.myfaid.com` (Vercel custom domain). The
  auto-generated `*.vercel.app` URL also works as a fallback.
- **Backend:** `api.myfaid.com` (the Cloudflare tunnel).
- `myfaid.com` was bought through **Cloudflare Registrar**, so DNS is already on
  Cloudflare.

## Backend — Cloudflare token tunnel

A **remotely-managed (token) tunnel**: created in the Cloudflare Zero Trust
dashboard, routing configured there (Public Hostname `api.myfaid.com` →
`http://localhost:8000`). The token lives in the git-ignored `.env` as
`CLOUDFLARE_TUNNEL_TOKEN`, and `start.sh` runs `cloudflared tunnel run --token …`
in a `tunnel` tmux window.

> **Do not** `cloudflared service install` on WSL — its systemd unit is
> `Type=notify` with `TimeoutStartSec=15`, and WSL's slow DNS makes the first
> lookup blow past the 15s deadline, so systemd kills it in a crash loop. The
> foreground `tunnel run` (what `start.sh` does) has no such deadline.

## Frontend — Vercel

- Import the repo, **Root Directory = `frontend`**.
- Env var **`NEXT_PUBLIC_API_URL = https://api.myfaid.com`** (Production) — it's
  baked in at build time, so a redeploy is needed if it changes.
- Add `myfaid.com` + `www` as custom domains; set those DNS records in Cloudflare
  to **DNS-only (grey cloud)** so Vercel can issue TLS. (The `api` record stays
  proxied/orange — that's the tunnel.)

## Security hardening

- **CORS** is locked to `myfaid.com`, `www.myfaid.com`, `localhost:3000`, and
  `*.vercel.app` (plus a `CORS_EXTRA_ORIGINS` env escape hatch).
- **`/internal/*` is local-only** (`require_local`) — it rejects any request with
  a forwarding header, which every tunneled request has. So demo controls and the
  notify hook can't be hit from the internet (the hosted dashboard's demo buttons
  are hidden for this reason).

## Per-session run order

```
1. docker compose up          # Postgres + Kafka
2. start the Fabric network   # via start.sh
3. FastAPI on :8000
4. cloudflared tunnel run      # the tunnel window
```
`./start.sh` does all of this (incl. the tunnel) in tmux. The frontend is always
live on Vercel; it only shows data while the machine + tunnel are up.
