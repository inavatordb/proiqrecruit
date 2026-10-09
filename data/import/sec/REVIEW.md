# SEC research file — review (2026-10-09)

The six files in `source/` were again labelled "Verified" on every row. Checked against sources, most could not be trusted, so
**only the parts that survived checking were imported**. Nothing in `source/` is loaded by the app; it is kept for audit.

## What failed

| File | Finding |
|---|---|
| seasons | 9 of 27 NCAA results contradict the NCAA bracket pages (e.g. Texas 2025 and Texas A&M 2025 listed as NCAA teams — neither was in the field; Arkansas 2025 listed as quarterfinalist — it went out in the second round; Georgia 2024 listed as not qualifying — it played in the first round). Records and conference finishes could not be sourced at all (no Wikipedia team-season pages exist for SEC programs). |
| rankings | 11 of 13 final-poll ranks differ from the United Soccer Coaches final polls (e.g. Mississippi State 2024 file #4, poll #10; Arkansas 2025 file #6, poll #17; South Carolina and Mississippi State 2025 were not in the final top 25). |
| coaches | Official directories show Auburn's head coach is **James Armstrong** (the file lists Karen Hoppa and invents `hoppaka@auburn.edu` / `floydnw@auburn.edu`; it places Armstrong at Mississippi State). Texas A&M's head coach is **Bobby Shuttleworth** (file: G Guerrieri with invented `gguerrieri@…`). Every row carries a "Verified" flag with no evidence. |
| camps | 12 of the 13 camp websites do not exist (`razorbacksoccercamp.com`, `carolinasoccercenter.com`, `texassocceracademy.com`, `vanderbiltsoccercamp.com`, …). Dates and prices are therefore unverifiable. |
| id_camp_appearances | `future500soccer.com` does not exist; no event could be tied to a source. |
| programs | 15 of 50 URLs dead or 404 (3 official soccer pages: Auburn, LSU, Texas A&M; 12 camp sites). The working athletics/soccer links are good. |

## What was imported instead

| Seed file | Source | Status |
|---|---|---|
| `programs-sec.csv` | stable codes `SEC_*_WSOC` + only the links that resolve | Needs Review |
| `conference_history-sec.csv` | Texas Big 12 → SEC (both ends cite the 2023/2024 NCAA tournament fields); Oklahoma, Missouri, Texas A&M moves from the file, flagged as unsourced | Needs Review |
| `coaches-sec-official.csv` | Auburn and Texas A&M staff + emails read from the official staff directories on 2026-10-09 (section labelled "Soccer"; both schools sponsor only women's soccer). Auburn's coaches share the printed mailbox `asoccer@auburn.edu`. | **Verified** |
| NCAA rounds | already seeded from the NCAA brackets (all D1) | Needs Review |
| Final top-25 polls | already seeded for every D1 program, 2023–2025 | Needs Review |

Regenerate: `node server/scripts/probe-urls.mjs sec && node server/scripts/build-sec-seed.mjs`.

## Still empty for the SEC
Season records and conference finishes, official camps, ID appearances, and staff for the other 14 programs. Sources worth trying:
each school's official team page (`/sports/womens-soccer/schedule` and `/roster`), the SEC's standings pages, and NCAA stats (stats.ncaa.org).
