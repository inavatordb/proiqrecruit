/** Which per-team season pages exist on Wikipedia for a conference's programs? node check-wiki-pages.mjs ivy big12 bigten */
import fs from 'node:fs';
import { parseCsv } from '../recruiting/core.mjs';

const seed = parseCsv(fs.readFileSync('server/seeds/recruiting/programs-d1.csv', 'utf8'));
const byName = new Map(seed.map((p) => [p.school_name, p]));
const NAMES = { Penn: 'Penn', 'Texas A&M': 'Texas A&M' };
for (const conf of process.argv.slice(2)) {
  const progs = parseCsv(fs.readFileSync(`data/import/${conf}/source/gemini_programs.csv`, 'utf8'));
  const teams = progs.map((r) => byName.get(NAMES[r.school_name] || r.school_name)).filter(Boolean);
  const titles = teams.flatMap((p) => [2023, 2024, 2025].map((y) => `${y} ${p.school_name} ${p.nickname} women's soccer team`));
  const found = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(titles.slice(i, i + 50).join('|'))}`, { headers: { 'User-Agent': 'HoursOfGamesRecruiting/1.0 (darisbrownseo@gmail.com)' } });
    const j = await r.json();
    const redirects = new Map((j.query.redirects || []).map((x) => [x.to, x.from]));
    for (const p of Object.values(j.query.pages)) if (!('missing' in p)) { found.add(p.title); if (redirects.has(p.title)) found.add(redirects.get(p.title)); }
  }
  console.log(`${conf}: ${teams.length}/${progs.length} programs matched to seed; ${titles.filter((t) => found.has(t)).length} of ${titles.length} season pages exist`);
  for (const p of teams) console.log(`  ${p.school_name.padEnd(18)} ${[2023, 2024, 2025].map((y) => (found.has(`${y} ${p.school_name} ${p.nickname} women's soccer team`) ? y : '----')).join(' ')}`);
}
