# ProIQ Recruit — college soccer recruiting platform

Standalone app (own server, accounts and build). Women's soccer, NCAA D1 + D2 first;
sport and division are data, so D3 / NAIA / JUCO / other sports are an import away.

```bash
npm install
cp .env.example .env
npm run build && npm start     # http://localhost:3000   (no database needed locally)
npm run dev                    # Vite on :5173, proxies /api to :3000 (run `npm start` too)
npm test
```

## Storage

`server/store.mjs` is the only thing the app talks to (`loadEntity`, `persistEntity`, `flush`).

| `DATABASE_URL` | Backend |
|---|---|
| set | **PostgreSQL** — authoritative. Migrations run automatically at boot. |
| empty | JSON files in `DATA_DIR` — **local development only** (a Render free filesystem is wiped on every deploy). |

How it works: rows are loaded from Postgres at boot; each change is written back (only changed rows, parents before children).
Every non-GET API call waits for that write before it replies, so an acknowledged signup or note is already in the database.
Moving to another Postgres provider = change `DATABASE_URL`. Moving to another engine = write another adapter (`server/db/*Adapter.mjs`).

### Tables (`server/db/migrations/001_init.sql`)

Global, admin-curated catalog (shared by every player, never copied per player):
`college_programs` ← `coaches`, `program_seasons`, `program_rankings`, `camps` (official only), `id_camp_appearances` (external), `data_sources`; plus `import_runs`.

Player-owned and private (every row has `profile_id`; each references the global program by `program_id`):
`player_profiles`, `saved_schools` (+ view `recruiting_pipeline`), `recruiting_notes`, `coach_communications`, `recruiting_activity`, `camp_tracking`.

Accounts: `users` (scrypt-hashed passwords, never plaintext), `auth_tokens`.

Adding a field to a record needs no migration (full record is in `data jsonb`); only promoted columns/relationships do.

### Moving existing JSON data into Postgres

```bash
DATABASE_URL=postgres://... npm run db:migrate-json -- --dir ./data --dry-run
DATABASE_URL=postgres://... npm run db:migrate-json -- --dir ./data
```
Preserves ids, never deletes the JSON files, and reports inserted / updated / skipped / errors per entity.

## Security model

* Server-side ownership: every private read/write is scoped to the caller's profile; someone else's id returns 404. Hiding in the UI is not relied on.
* Public player pages are an allowlist (no contact or guardian fields). Default privacy is `private`.
* Admin = email in `ADMIN_EMAILS`. Admins manage the catalog; the admin Players list shows summaries only, not private notes/contacts.
* Coach emails: personal webmail dropped on import/save; missing shows "Email not publicly listed"; never guessed.
* Imports never erase a stored value with a blank and never overwrite a `verified` record without the explicit override.
* Login/registration are rate-limited. Stored URLs are http(s) only.

## Importing recruiting data

Admin → Imports (CSV, preview then commit) for programs, coaches, seasons, rankings, camps, ID appearances. Templates are downloadable.
Files in `server/seeds/recruiting/` named `<kind>-*.csv` load at boot (adds missing rows; updates only rows it created that nobody edited or verified).
Refresh seeds: `npm run seed:programs`, `npm run seed:ncaa`.

## Deploying on Render (free web service + free Postgres, no disk)

1. Push this repo to GitHub (done: `inavatordb/proiqrecruit`).
2. Render dashboard → **New → Blueprint** → pick the repo. `render.yaml` creates the free web service **and** the free Postgres database `recruit-db` and wires `DATABASE_URL` for you.
   *(Manual route instead: New → PostgreSQL → plan **Free** → create; then New → Web Service → plan **Free**, build `npm install && npm run build`, start `node server/index.js`, health check `/api/health`, and add env var `DATABASE_URL` = the database's **Internal Database URL**.)*
3. On the web service → Environment, set:
   * `ADMIN_EMAILS` — your email(s), comma-separated
   * `PUBLIC_APP_URL` — the service URL, e.g. `https://recruit.onrender.com`
4. Deploy. First boot creates the tables and loads the D1/D2 seed. `GET /api/health` should show `"storage":"postgres"`.
   If the log says `RUNNING ON RENDER WITHOUT DATABASE_URL`, step 2 or 3 is incomplete.

| Variable | Required in prod | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `ADMIN_EMAILS` | yes | who is admin |
| `PUBLIC_APP_URL` | yes | share-link previews |
| `DATA_DIR` | no | local JSON fallback only |
| `PORT` | no | Render sets it |
| `DATABASE_SSL=false` | no | only for a non-TLS Postgres on a non-local host |

### Free-tier limits to know about

* The free web service sleeps after inactivity (first request after a pause is slow).
* Render's free Postgres is for development/beta: it is size-limited and, per Render's current policy, **expires** unless upgraded
  (check the dashboard for the expiry date). Before then, either upgrade it or move to another provider: `pg_dump` and restore, change `DATABASE_URL`.

## TODO

* **Password reset** — not built (needs transactional email). Passwords are scrypt-hashed and compared in constant time; auth otherwise works. Until reset exists, an admin can't recover a forgotten password.
* Coach / camp / ranking / record data beyond the D1+D2 program list and D1 NCAA tournament rounds still has to be imported.

## Layout

| Piece | Path |
|---|---|
| Server (auth, static, share previews) | `server/index.js` |
| Storage facade + adapters, schema, migrations | `server/store.mjs`, `server/db/` |
| Recruiting logic: vocab, CSV, normalizers, import planner | `server/recruiting/core.mjs` |
| Search, detail, imports, player data | `server/recruiting/service.mjs` |
| HTTP routes `/api/recruiting/*` | `server/recruiting/routes.mjs` |
| Seed builders / seeds | `server/scripts/`, `server/seeds/recruiting/` |
| UI | `src/` |

Pages: `/` · `/schools` · `/schools/:slug` · `/camps` · `/camps/:id` · `/my-list` · `/profile` · `/compare` · `/auth` · `/player/:slug` · `/list/:token` · `/admin/*`.
