# Division II programs file (programs only) — review (2026-10-09)

One file, 250 programs across 21 conferences (PSAC, NE10, ECC, CACC, MEC, G-MAC, GLIAC, GLVC, NSIC, MIAA, Lone Star, RMAC, SAC, Conference Carolinas,
Peach Belt, Gulf South, Sunshine State, CIAA, SIAC, CCAA, PacWest, GNAC), every row labelled "Verified". It has no coaches, seasons, rankings, camps or
events. The raw file is in `source/`; nothing there is loaded.

## What failed

| Check | Result |
|---|---|
| Athletics + soccer websites (502 URLs) | **424 resolve (84%)** and were kept. 58 are dead and 20 are behind bot checks. Noticeably worse than the Division I file (97%): many athletic-site domains here were invented. |
| Camp websites (248 URLs) | **231 are dead (93%)**, e.g. every `*soccercamps.com`-style domain. Only 16 resolved; those were kept. |
| Conference history vs today's conference | 4 programs' histories contradict the current list and were dropped (Allen and Edward Waters are shown as SIAC members in the file but are Independent in the NCAA list; Fresno Pacific and Menlo are listed as PacWest but are CCAA). |
| History it could not express | 43 segments (NAIA, D3, NCCAA and old-conference stints, e.g. "NAIA RSC", "D3 CUNYAC") were skipped rather than guessed. |
| Matching | **234 of 250 rows matched** a program in the NCAA Division II women's soccer list. 16 did not: Albany State, Benedict, Clark Atlanta, Fort Valley State, Kentucky State, Lane, Miles, Bowie State, Elizabeth City State (SIAC/CIAA schools), New Haven, Bloomfield, Glenville State, Sonoma State, Academy of Art, Azusa Pacific, Carolina University. Either they don't sponsor D2 women's soccer or the list I'm using doesn't have them — not created. |
| Not in the file | 25 programs in the NCAA D2 list are not covered by it (e.g. Alabama–Huntsville, Colorado Christian, Florida Southern, Harding, Lincoln (MO), UNC Pembroke). |

## What was imported

| Seed file | Source | Status |
|---|---|---|
| `programs-d2-other.csv` (234) | stable codes `<CONF>_<SCHOOL>_WSOC` (long names shortened to fit the 60-character limit), links that resolve | Needs Review |
| `conference_history-d2-other.csv` (128 rows) | the file's history, parsed, only where it ends at today's conference. Not independently sourced | Needs Review |

Regenerate: `node server/scripts/probe-urls.mjs d2-other && node server/scripts/build-programs-only-seed.mjs d2-other D2`. The output name must not be `d2`
(that would overwrite the base seed `programs-d2.csv`; the script now refuses).
