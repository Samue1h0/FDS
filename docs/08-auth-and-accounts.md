# 8. Auth & Accounts

## Authentication

JWT-based. `POST /api/auth/login` with `{username, password}` verifies the
password (PBKDF2-SHA256 in `user_store.py`) and returns a signed JWT plus
`{user_id, username, role}`. The frontend stores the token in `localStorage` and
a cookie; `AuthContext` decodes it to the current user. Tokens expire after
**8 hours**.

Server-side, protected endpoints read the `Authorization: Bearer <jwt>` header
and decode it (e.g. `/api/auth/me`, `/api/auth/me/review-stats`,
`/api/auth/change-password`, and PII export). Route protection in the UI is
client-side (the admin layout redirects to `/signin` if there's no user).

## Roles

- `analyst` — the standard fraud-analyst role.
- `admin` — same dashboard; the role is also one of the roles allowed to export
  full PII.

## Accounts

Seeded by `backend/src/seed_users.py` (run `python3 -m src.seed_users`;
idempotent — `ON CONFLICT DO NOTHING`). Passwords live in that file.

| Username | Role | Display name | Avatar |
|---|---|---|---|
| `analyst1`, `analyst2` | analyst | — | — |
| `admin` | admin | — | — |
| `CCX` | analyst | Chun Xian | `CCX.jpg` |
| `Hong` | analyst | Mun Hong | `Hong.jpg` |
| `Sam` | analyst | Sam | `Sam.jpg` |
| `Siew` | analyst | Yat Fei | `Siew.jpg` |

> **Login is case-sensitive** — log in as `CCX`, not `ccx`.
>
> Editing `seed_users.py` does **not** create accounts — you must run the seed
> script against the database. Re-run it on any fresh Postgres container.

### Display names & avatars
`frontend/src/lib/userDirectory.ts` maps a username → `{name, avatar}`. This is
**display only** — login/auth is always by username. Adding or renaming a person
for the UI is a one-line edit there (avatars live in `frontend/public/images/user/`).

## Profile page (`/profile`)

A real analyst profile (`components/user-profile/AnalystProfile.tsx`), all keyed
to the logged-in user:

1. **Identity & session** — avatar + name, role, user ID, JWT session-expiry
   time, and sign out.
2. **Review activity** — from `GET /api/auth/me/review-stats` (counts rows where
   `reviewed_by` = the logged-in username): reviews done, confirmed fraud,
   cleared (legitimate), amount approved (sum of cleared amounts), cards
   unfrozen. These grow as the analyst reviews.
3. **Change password** — `POST /api/auth/change-password`; verifies the current
   password, requires the new one to be ≥6 chars and different.

The header user dropdown links here and shows the same name + avatar.
