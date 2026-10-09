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

Templates (headers + one ignored example row) are in `data/import/templates/` and downloadable from Admin → Imports:
`programs`, `coaches`, `program_seasons`, `rankings`, `camps`, `id_camp_appearances`, `conference_history`.
Put your researched files in `data/import/` (tracked in git).

**Order:** programs → conference_history → coaches → seasons → rankings → camps → id_camp_appearances.

### Admin UI — `/admin/imports`

Pick a type, upload a CSV, **Preview** (dry run), review, then **Commit**. The preview checks columns, duplicate program ids, unknown program references,
malformed emails, invalid dates, and shows new vs existing records. Nothing is written until you commit, and every row is accounted for:
`new / updated / skipped / needs review / errors` (+ warnings, and missing emails for coaches). Past imports are listed with who/when/counts.

### CLI

```bash
npm run import:programs -- --file data/import/programs.csv --dry-run
npm run import:programs -- --file data/import/programs.csv
# also: import:coaches  import:seasons  import:rankings  import:camps  import:id-camps  import:conference-history
# flags: --dry-run  --overwrite-verified  --verbose  --actor <name>
```
Uses `DATABASE_URL` (PostgreSQL) or the local JSON store. If you run it against a database a live server is using, press **Reload** in Admin → Imports
(or restart) so the site picks up the new rows. For production data, the Admin UI is the simplest path (it writes through the live server).

### How rows are matched and protected

* **`program_id` is a stable code** like `ACC_DUKE_WSOC` (never a row number). The programs file defines it; every other file points at it.
  Importing a program that already exists (matched by code, else by name + state) updates it and attaches the code — it never creates a duplicate.
  A code already used by a different program is an error.
* **Conference history** (`conference_history.csv`) is separate from today's conference, so moves like ASUN → UAC keep the old membership. Re-importing a program with a
  new conference warns you to add history rows; it never rewrites them. Season cards show the conference as of that season when history exists.
* **Seasons:** 2023–2025 are the completed seasons; 2026 is the *current* season (flagged, can be partial) and never touches earlier ones.
* **Rankings:** one record per organization/season/type/date — preseason, "Week 4", "Week 8", final… are each their own row.
* **Camps vs ID events:** `camps.csv` is official university camps only; third-party events go in `id_camp_appearances.csv`.
* **Never invented:** blank email stays blank ("Email not publicly listed"); personal webmail is dropped; blank cells never erase stored values.
* **Source tracking:** `source_url` + `source_type` (`official_university`, `conference`, `external_event`, `ncaa`, `united_soccer_coaches`, `official_camp`, `other`).
  A row is only **Verified** if `verified=yes` *and* it has a `source_url`; everything else is **Needs Review**. Verified records are never overwritten without `--overwrite-verified`.
  Statuses (editable by admins): Verified, Needs Review, Historical, Unverified, Archived.
* Dates: `YYYY-MM-DD` (also `M/D/YYYY`, `Jul 15, 2026`). Invalid dates are reported, never silently dropped.

Files in `server/seeds/recruiting/` named `<kind>-*.csv` load at boot (adds missing rows; updates only rows it created that nobody edited or verified).
Refresh seeds: `npm run seed:programs`, `npm run seed:ncaa`. Rebuild templates: `npm run templates:build`.

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

## ACC data (2026-10-07)

A supplied ACC research file was checked before import and mostly rejected — see `data/import/acc/REVIEW.md` for what failed and what was loaded instead
(sourced final polls for every D1 program, ACC season records/staff from Wikipedia season pages, official-directory staff for Clemson and Virginia Tech).
Everything loaded this way is **Needs Review** (shown as "Unverified" on the site) until an admin checks it against the official page.

## Logos

`programs.logo_url` shows on school cards and pages (initials tile if missing or broken). `npm run` is not needed: `server/seeds/recruiting/programs-logos.csv`
was built by `node server/scripts/build-recruiting-logos.mjs` from each program's Wikipedia athletics page (D1: 337/349, D2: 40/259), skipping conference logos and photos.
**Licensing:** school logos are the institutions' trademarks and mostly non-free images. Hot-linking them is for development/beta — before a commercial launch,
replace `logo_url` with assets you have permission to use (athletics media kits) via the programs CSV import (`logo_url` column).

## SEC data (2026-10-09)

Same process as the ACC: the supplied SEC file was checked and mostly rejected — see `data/import/sec/REVIEW.md`. Loaded: program codes + working links,
conference moves, and Auburn/Texas A&M staff from official directories. SEC season records and staff are still empty (no sourced equivalent found).
Helper scripts take a conference folder: `node server/scripts/probe-urls.mjs sec`, `node server/scripts/check-acc-ncaa.mjs sec`.

## Ivy, Big 12, Big Ten data (2026-10-09)

Same process again — see `data/import/REVIEW-ivy-big12-bigten.md`. Loaded: program codes + working links, parsed conference history (Big 12 and Big Ten realignment),
and Cornell/Penn staff from official directories. Helper: `node server/scripts/build-conference-seeds.mjs <ivy|big12|bigten>`.

## Remaining D1 programs (2026-10-09)

A programs-only file for the rest of D1 was checked the same way — see `data/import/d1-other/REVIEW.md`. Loaded: stable program codes for 346 of 349 D1 programs,
links that resolve, and conference history that agrees with today's conference. `node server/scripts/check-seed-codes.mjs` reports code coverage.

## Remaining Division II programs (2026-10-09)

A programs-only Division II file was checked the same way — see `data/import/d2-other/REVIEW.md`. Loaded: stable program codes for 234 D2 programs,
links that resolve, and conference history that agrees with today's conference. Programs the NCAA D2 list does not contain were not created.

## Official-site crawl (Division I)

`node server/scripts/crawl-athletics.mjs --division D1` reads each team's own athletics site (staff page, completed season
schedule pages, camps link) into `data/import/crawl/cache/`; `node server/scripts/build-crawl-seeds.mjs` converts the cache to
`seasons-crawl.csv`, `coaches-crawl.csv`, `programs-crawl.csv` and `data/import/crawl/REPORT.md` (per-conference coverage and
every failure). Rows are Verified against the page they came from. Seeds load last, so they upgrade older Needs-Review rows, and
seeded coaches missing from an official staff page are archived. Individual camps (dates, prices) are not imported: only the
official camps page link.
