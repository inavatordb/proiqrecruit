# Recruit — college soccer recruiting platform

Standalone app (own server, own accounts, own build). Women's soccer, NCAA D1 + D2 first;
sport and division are data, so D3 / NAIA / JUCO / other sports are an import away.

```bash
npm install
cp .env.example .env     # set ADMIN_EMAILS
npm run build && npm start   # http://localhost:8787
npm run dev                  # Vite on :5173, proxies /api to :8787 (run `npm start` too)
npm test
```

## Layout

| Piece | Path |
|---|---|
| Server (auth, static, share previews) | `server/index.js`, `server/store.mjs` |
| Recruiting logic: vocab, CSV, normalizers, import planner | `server/recruiting/core.mjs` |
| Search, detail, imports, player data | `server/recruiting/service.mjs` |
| HTTP routes `/api/recruiting/*` | `server/recruiting/routes.mjs` |
| Seed builders (re-runnable) | `server/scripts/` |
| Bundled seed CSVs | `server/seeds/recruiting/` |
| UI | `src/` |

## Pages

`/` home · `/schools` · `/schools/:slug` · `/camps` · `/camps/:id` · `/my-list` · `/profile` · `/compare` ·
`/auth` · `/player/:slug` and `/list/:token` (shared, read-only) · `/admin/*` (admins).

## Entities (JSON files under `DATA_DIR`)

Catalog: `CollegeProgram`, `ProgramCoach`, `ProgramSeason`, `ProgramRanking`, `ProgramCamp`, `IDCampAppearance`, `DataSource`, `RecruitImport`.
Private, scoped to the player's profile: `RecruitPlayerProfile`, `RecruitTarget`, `RecruitNote`, `RecruitContact`, `RecruitActivity`, `RecruitCampTrack`.
Accounts: `User`, `_AuthToken`.

Program ids are stable (`prg_<sport>_<slug>`); child ids are hashes of their natural key, so re-imports update instead of duplicating.

## Rules the code enforces

* Every private row carries `profile_id`; another account gets 404. Public player pages are an allowlist and never include contact or guardian fields. Default privacy is `private`.
* Coach emails: personal webmail is dropped on import and admin save; missing shows "Email not publicly listed"; emails are never guessed.
* Imports never erase a stored value with a blank and never overwrite a `verified` record unless the admin ticks the override.
* Official camps and external ID events are separate entities with different UI treatment.
* Stored URLs are http(s) only.

## Importing data

Admin → Imports: pick a kind, upload/paste a CSV (template download included), Preview, Commit.
Child kinds match a program by `program_id` or `school_name`. Columns: `CSV_TEMPLATES` in `core.mjs`.
Files in `server/seeds/recruiting/` named `<kind>-*.csv` load at boot (adds missing rows; updates only rows it created that nobody edited or verified).

Refresh: `npm run seed:programs` (D1/D2 lists), `npm run seed:ncaa` (D1 tournament rounds), commit, deploy.

## Environment

| Var | Purpose |
|---|---|
| `ADMIN_EMAILS` | comma-separated admin emails (empty = no admins) |
| `DATA_DIR` | where JSON data lives — **must be a persistent disk in production** |
| `PUBLIC_APP_URL` | public origin for share previews |
| `PORT` | default 8787 |

## Deploying (Render)

`render.yaml` is included. A persistent disk needs a paid plan; on an ephemeral filesystem every deploy wipes accounts and player data.
Set `ADMIN_EMAILS` and `PUBLIC_APP_URL` in the dashboard. Not built yet: password reset email, and a real database
(`server/store.mjs` is the one module to swap).
