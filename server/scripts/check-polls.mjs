/** Compare a supplied final-poll file with the sourced United Soccer Coaches final polls. node check-polls.mjs <conf-dir> */
import fs from 'node:fs';
import { parseCsv, slugify } from '../recruiting/core.mjs';

const conf = process.argv[2] || 'acc';
const src = parseCsv(fs.readFileSync('server/seeds/recruiting/rankings-final-usc.csv', 'utf8'));
const m = new Map(src.map((r) => [`${slugify(r.school_name)}|${r.season}`, +r.ranking]));
const alias = { 'texas-am': 'texas-a-and-m' };
let ok = 0; const bad = [];
const rows = parseCsv(fs.readFileSync(`data/import/${conf}/source/gemini_rankings.csv`, 'utf8'));
for (const r of rows) {
  const raw = r.program_id.replace('w-soccer-', ''); const s = alias[raw] || raw;
  const want = m.get(`${s}|${r.season_year}`);
  if (want === +r.rank) ok++; else bad.push(`${s} ${r.season_year}: file ${/^\d+$/.test(r.rank) ? `#${r.rank}` : r.rank} vs ${want ? `#${want}` : 'not in final top 25'}`);
}
console.log(`${conf}: ${ok} agree, ${bad.length} differ of ${rows.length}`);
for (const b of bad) console.log(`  ${b}`);
