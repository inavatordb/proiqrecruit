# Ivy League, Big 12 and Big Ten research files — review (2026-10-09)

Eighteen files (programs, coaches, seasons, rankings, camps, id_camp_appearances × 3 conferences), every row again labelled "Verified" or
"Needs Review" with no evidence. Checked against sources, so **only the parts that survived were imported**. Raw files are in
`data/import/<ivy|big12|bigten>/source/` for audit; nothing there is loaded.

## What failed

| Check | Result |
|---|---|
| NCAA results vs the NCAA bracket pages | **32 of 81 season rows contradict them** (Ivy 4/24, Big 12 11/27, Big Ten 17/30). Examples: UCLA 2025 listed as a College Cup semifinalist (it went out in the second round); USC 2025 and Rutgers 2025 listed as NCAA teams (neither was in the field); Washington 2025 listed as a first-round exit (it reached the quarterfinals); Baylor and UCF 2025 listed as not qualifying (both were in the tournament). |
| Final polls vs the United Soccer Coaches final polls | **Only 4 of 30 ranks match** (Ivy 0/5, Big 12 2/9, Big Ten 2/16). Brown and Princeton are listed as ranked in 2023/2024 — neither was in the final top 25. UCLA 2025 file #5 vs poll #22. |
| URLs | **34 of 132 dead or 404**, almost all invented camp sites (`crimsonsoccercamps.com`, `uclasocceracademy.com`, `wvusoccercamp.com`, …) plus the Nebraska and Purdue soccer pages. |
| Coaches | Official directories: Cornell's staff is Rob Ferguson, Danielle Reid-Espinal and Shaela Krayer (the file lists Jackie Hagopian and gives `rf387@cornell.edu` / `jh2394@cornell.edu`; **no emails are printed**). Penn's is Krissy Turner, Boomer Steigelman, Seve Hirst, Kamryn Stablein (the file lists "Megan Link" and `kturn@upenn.edu`; **no emails printed**). The same names recur at different schools across the files — Megan Link at Penn and Michigan State, Ken Maspell at Miami (ACC file) and Maryland, "Meghan Ryan" at Rutgers and "Meghan Ryan Nemzer" at Maryland — and almost every row has an identical phone number for the whole staff. |
| Camps / ID events | Every camp site checked is dead or 404. `future500soccer.com` does not exist. No dates or prices can be trusted, so none were imported. |

## What was imported

| Seed file | Source | Status |
|---|---|---|
| `programs-ivy.csv`, `programs-big12.csv`, `programs-bigten.csv` | stable codes `IVY_/B12_/B10_*_WSOC` + only the links that resolve | Needs Review |
| `conference_history-big12.csv` (24 rows), `conference_history-bigten.csv` (15 rows) | the file's `conference_history` column, parsed ("thru 2023-24" = last season 2023). Realignment dates match the public record, but they are **not independently sourced** | Needs Review |
| `coaches-ivy-official.csv` | Cornell (3) and Penn (4) staff read from the official staff directories on 2026-10-09; no emails exist there, so none are stored | **Verified** |
| NCAA rounds, final top-25 polls | already loaded for every D1 program | Needs Review |

Regenerate: `node server/scripts/probe-urls.mjs <conf> && node server/scripts/build-conference-seeds.mjs <conf>`.

## Still empty
Season records and conference finishes (Wikipedia has team-season pages for only 6 of these 126 team-seasons), official camps, ID appearances,
and head coaches/staff for 40 of the 42 programs. Official team pages (`/sports/womens-soccer/roster`, `/schedule`) or the conference sites are the
next place to look; their staff directories are large and did not load reliably for most schools.
