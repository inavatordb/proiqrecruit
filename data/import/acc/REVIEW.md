# ACC research file — review (2026-10-07)

The six files in `source/` (programs, coaches, seasons, rankings, camps, id_camp_appearances) arrived labelled "Verified".
Checked against sources, most of that could not be trusted, so **only the parts that survived checking were imported**.
Nothing in `source/` is loaded by the app; it is kept for audit.

## What failed

| File | Finding |
|---|---|
| seasons | 11 of 27 NCAA results contradict the NCAA bracket pages (e.g. Florida State 2025 listed as semifinalist — it won the title; Stanford 2025 listed as third round — it was runner-up; Wake Forest 2023 and Pitt 2025 listed as NCAA teams — neither was in the field). Records such as Stanford 2025 "14-4-3" conflict with the team's season page. |
| rankings | Final polls conflict with the United Soccer Coaches final polls (2025: Florida State #1, Stanford #2, Duke #3 — file has Duke #4, Florida State #3, Stanford absent). |
| coaches | Duke head coach is listed as Robbie Church; Duke's 2025 season page lists Kieran Hall as head coach. `jrobb22@clemson.edu` is wrong (official directory: `jeferyr@clemson.edu`). Virginia Tech's directory prints **no** email for Chugger Adair; the file invents `adairc@vt.edu`. UNC head coach spelled "Damon Nahsa". Almost every staff row carried a "Verified" flag with no evidence. |
| camps | 8 of the 9 camp websites do not exist (`clemsonsoccercamp.com`, `carolinasoccercamp.com`, `virginiasoccercamp.com`, `vtwsoccercamps.com`, `seminolesoccercamps.com` 404s, …). Dates and prices for them are therefore unverifiable. |
| id_camp_appearances | `future500soccer.com` does not exist; none of the events could be tied to a source. |
| programs | 13 of 53 URLs dead or 404 (Miami soccer + camps, Virginia soccer, and 9 camp sites). The working athletics/soccer links are good. |

## What was imported instead

| Seed file | Source | Status |
|---|---|---|
| `programs-acc.csv` | stable codes `ACC_*_WSOC` + only the links that resolve | Needs Review |
| `conference_history-acc.csv` | Cal/Stanford (Pac-12 → ACC) and SMU (AAC → ACC) for 2024; ACC rows cite the 2024 team pages | Needs Review |
| `seasons-acc-wiki.csv` | final overall + conference record from each team's Wikipedia season page, 2023-2025 (Cal, SMU, Stanford 2023 have no page) | Needs Review |
| `coaches-acc-wiki.csv` | staff in each team's most recent season infobox (no emails) | Needs Review |
| `coaches-acc-official.csv` | Clemson + Virginia Tech staff and emails read from the official staff directories on 2026-10-07 | **Verified** |
| `rankings-final-usc.csv` | United Soccer Coaches **final** top 25, 2023-2025, every D1 program | Needs Review |
| NCAA rounds | already seeded from the NCAA brackets (`seasons-ncaa-d1.csv`) and win over the file where they differ | Needs Review |

Regenerate: `node server/scripts/probe-urls.mjs && node server/scripts/build-acc-seed.mjs && node server/scripts/build-recruiting-wikipedia-data.mjs`.

## Still empty for ACC
Official camps, external ID appearances, and verified coaching staff for the other 15 programs. Wikipedia staff names are as listed for the 2025 season and may be out of date — they show an "Unverified" label on the site.
