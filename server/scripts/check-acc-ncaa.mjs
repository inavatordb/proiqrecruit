/** Cross-check the supplied ACC seasons file against the sourced NCAA bracket seed. Prints conflicts only. */
import fs from 'node:fs';
import { parseCsv, slugify } from '../recruiting/core.mjs';

const seed = parseCsv(fs.readFileSync('server/seeds/recruiting/seasons-ncaa-d1.csv', 'utf8'));
const progs = parseCsv(fs.readFileSync('server/seeds/recruiting/programs-d1.csv', 'utf8'));
const sourced = new Map(seed.map((r) => [`${slugify(r.school_name)}|${r.season}`, r.ncaa_tournament_round]));
const rows = parseCsv(fs.readFileSync('data/import/acc/source/gemini_seasons.csv', 'utf8'));
const names = { 'w-soccer-florida-state': 'florida-state', 'w-soccer-north-carolina': 'north-carolina', 'w-soccer-notre-dame': 'notre-dame', 'w-soccer-virginia-tech': 'virginia-tech', 'w-soccer-wake-forest': 'wake-forest', 'w-soccer-pittsburgh': 'pittsburgh', 'w-soccer-nc-state': 'nc-state' };
const label = (t) => {
  const s = t.toLowerCase();
  if (/did not/.test(s)) return 'DNQ';
  if (/national champ/.test(s)) return 'Champion';
  if (/runner/.test(s)) return 'Runner-up';
  if (/college cup semi/.test(s)) return 'Semifinal';
  if (/elite eight|quarter/.test(s)) return 'Quarterfinal';
  if (/third/.test(s)) return 'Round of 16';
  if (/second/.test(s)) return 'Second Round';
  if (/first/.test(s)) return 'First Round';
  return '?';
};
let ok = 0; let bad = 0;
for (const r of rows) {
  const slug = names[r.program_id] || r.program_id.replace('w-soccer-', '');
  const want = sourced.get(`${slug}|${r.season_year}`) || 'DNQ';
  const got = label(r.ncaa_result);
  if (want === got) ok++; else { bad++; console.log(`CONFLICT ${slug} ${r.season_year}: file says "${r.ncaa_result}" (${got}); NCAA bracket says ${want}`); }
}
console.log(`${ok} agree, ${bad} conflict of ${rows.length}`);
console.log('program names in seed:', progs.filter((p) => /Miami|NC State|Pitt|California/.test(p.school_name)).map((p) => p.school_name).join(' | '));
