/**
 * Cross-check a supplied seasons file against the sourced NCAA bracket seed. Prints conflicts only.
 *   node server/scripts/check-acc-ncaa.mjs [conference-dir]     (default: acc)
 */
import fs from 'node:fs';
import { parseCsv, slugify } from '../recruiting/core.mjs';

const conf = process.argv[2] || 'acc';
const seed = parseCsv(fs.readFileSync('server/seeds/recruiting/seasons-ncaa-d1.csv', 'utf8'));
const sourced = new Map(seed.map((r) => [`${slugify(r.school_name)}|${r.season}`, r.ncaa_tournament_round]));
const rows = parseCsv(fs.readFileSync(`data/import/${conf}/source/gemini_seasons.csv`, 'utf8'));
// program_id "w-soccer-<slug>" -> seed slug, for names that slugify differently
const alias = { 'texas-am': 'texas-a-and-m', 'ole-miss': 'ole-miss', 'lsu': 'lsu', 'mississippi-state': 'mississippi-state' };
const label = (t) => {
  const s = t.toLowerCase();
  if (/did not/.test(s)) return 'DNQ';
  if (/national champ/.test(s)) return 'Champion';
  if (/runner/.test(s)) return 'Runner-up';
  if (/college cup semi/.test(s)) return 'Semifinal';
  if (/elite eight|quarter/.test(s)) return 'Quarterfinal';
  if (/third|round of 16/.test(s)) return 'Round of 16';
  if (/second/.test(s)) return 'Second Round';
  if (/first/.test(s)) return 'First Round';
  return '?';
};
let ok = 0; let bad = 0;
for (const r of rows) {
  const raw = r.program_id.replace('w-soccer-', '');
  const slug = alias[raw] || raw;
  const want = sourced.get(`${slug}|${r.season_year}`) || 'DNQ';
  const got = label(r.ncaa_result);
  if (want === got) ok++; else { bad++; console.log(`CONFLICT ${slug} ${r.season_year}: file says "${r.ncaa_result}" (${got}); NCAA bracket says ${want}`); }
}
console.log(`${ok} agree, ${bad} conflict of ${rows.length}`);
