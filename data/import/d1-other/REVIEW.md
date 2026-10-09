# Remaining D1 programs file (programs only) — review (2026-10-09)

One file, 273 programs (America East, American, Atlantic 10, ASUN, Big East, Big Sky, Big South, Big West, CAA, C-USA, Horizon, MAAC, MAC, MVC,
Mountain West, NEC, OVC, Patriot, SoCon, Southland, SWAC, Summit, Sun Belt, WCC, WAC), every row labelled "Verified". No coaches, seasons,
rankings, camps or events were included. The raw file is in `source/` for audit; nothing there is loaded.

## What failed

| Check | Result |
|---|---|
| Websites (athletics + soccer pages, 546 URLs) | **528 resolve (97%)** — these are good and were kept. 18 dead/404/bot-blocked (e.g. `uvmathletics.com`, `gocolgateraiders.com`, `goargos.com`, `goutsa.com/…`, `golobos.com/…`). One URL is corrupted with Cyrillic characters (`unfosp марreys.com`). |
| Camp websites (272 URLs) | **228 are dead or 404 (84%)** — invented domains like `vermontsoccercamps.com`. Only 44 camp links resolved; those were kept. |
| Conference history vs today's conference | **17 programs' histories contradict the current seed** and were dropped entirely, e.g. Austin Peay, Central Arkansas, Eastern Kentucky and Little Rock (the file has them in ASUN/OVC; they are UAC for 2026), the renamed WAC → UAC schools (Abilene Christian, Tarleton State), and the six schools now in the revived Pac-12 (Boise State, Fresno State, Utah State, Texas State, Oregon State, Washington State). |
| Conference history it could not express | 17 segments (e.g. "D2 Gulf South", "Independent / MEAC", "Great West") were skipped rather than guessed. |
| Matching | 271 of 273 rows matched an existing D1 program. Not matched (no such program in the NCAA list): Saint Francis (PA), Mississippi Valley State. |

## What was imported

| Seed file | Source | Status |
|---|---|---|
| `programs-d1-other.csv` (271) | stable codes `<CONF>_<SCHOOL>_WSOC` (conference taken from the seed, so they match 2026), 267 athletics links, 44 camp links, soccer pages that resolve | Needs Review |
| `conference_history-d1-other.csv` (169 rows, 85 programs) | the file's history, parsed ("thru 2022-23" = last season 2022; "2018-23" = 2018–2022), only where it ends at today's conference. Plausible and consistent with the public record, but **not independently sourced** | Needs Review |

With this file 346 of 349 D1 programs now have a stable program code (missing: Loyola Marymount, New Haven, West Georgia).

Regenerate: `node server/scripts/probe-urls.mjs d1-other && node server/scripts/build-programs-only-seed.mjs d1-other` (writes `build-report.txt` listing every dropped link and skipped history).
