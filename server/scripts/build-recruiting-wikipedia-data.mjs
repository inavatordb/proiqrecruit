/**
 * Builds sourced seed CSVs from Wikipedia's per-team season pages and season pages:
 *
 *   node server/scripts/build-recruiting-wikipedia-data.mjs
 *
 *  - rankings-final-usc.csv        United Soccer Coaches FINAL top-25, every D1 program, 2023-2025
 *  - seasons-acc-wiki.csv          final overall + conference records, ACC programs, 2023-2025
 *  - coaches-acc-wiki.csv          staff listed in each ACC team's most recent season infobox
 *  - conference_history-acc-wiki.csv  conference changes observed across those seasons
 *
 * Everything is imported as Needs Review (Wikipedia is a secondary source) and every row carries
 * its page URL. Nothing is guessed: a page that cannot be fetched or parsed is reported and skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, slugify, toCsv } from '../recruiting/core.mjs';

const SEEDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const UA = 'HoursOfGamesRecruiting/1.0 (darisbrownseo@gmail.com)';
const YEARS = [2023, 2024, 2025];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wiki(title, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&action=raw`, { headers: { 'User-Agent': UA } });
    const body = await res.text();
    if (res.ok && !body.startsWith('<!DOCTYPE')) {
      const redirect = body.match(/^#REDIRECT\s*\[\[([^\]|#]+)/i);
      if (redirect) return wiki(redirect[1], tries);
      return body;
    }
    if (res.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  return null;
}
const pageUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/* ------------------------------ final polls (all D1) ------------------------------ */
const programs = parseCsv(fs.readFileSync(path.join(SEEDS, 'programs-d1.csv'), 'utf8'));
const bySlug = new Map();
for (const p of programs) { bySlug.set(slugify(p.school_name), p); bySlug.set(slugify(p.official_school_name), p); }
const alias = { 'miami florida': 'miami-fl', miami: 'miami-fl', 'nc state': 'nc-state', 'north carolina state': 'nc-state', 'florida gulf coast': 'florida-gulf-coast' };
const findProgram = (n) => bySlug.get(slugify(n)) || bySlug.get(alias[n.toLowerCase()] || '') || bySlug.get(slugify(n.replace(/^(University of |The )/i, '')));

function teamName(raw) {
  let s = String(raw || '');
  const csoc = s.match(/title=([^|}]+)/); if (csoc) return csoc[1].trim();
  s = s.replace(/'''/g, '').replace(/\{\{[^{}]*\}\}/g, '');
  const link = s.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/); if (link) return link[1].trim();
  return s.replace(/\[|\]/g, '').trim();
}

const rankingRows = []; const report = [];
for (const year of YEARS) {
  const title = `${year} NCAA Division I women's soccer season`;
  const text = await wiki(title);
  if (!text) { report.push(`${year}: season page unavailable`); continue; }
  const start = text.indexOf('=== Final rankings ===');
  const block = start >= 0 ? text.slice(start, text.indexOf('|}', start)) : '';
  let n = 0; let miss = [];
  for (const chunk of block.split('\n|-').slice(2)) {
    const cells = chunk.split('\n').filter((l) => l.startsWith('|')).map((l) => l.slice(1).trim());
    if (cells.length < 2) continue;
    const rank = parseInt(cells[0], 10); const name = teamName(cells[1]);
    if (!rank || !name) continue;
    const p = findProgram(name);
    if (!p) { miss.push(`${rank}.${name}`); continue; }
    n++;
    rankingRows.push({ school_name: p.school_name, sport: 'soccer', gender: 'women', season: year, ranking_organization: 'United Soccer Coaches', ranking_type: 'Final', ranking: rank, ranking_date: '', source_url: pageUrl(title), source_name: `Wikipedia: ${title} (United Soccer Coaches final poll)`, source_type: 'united_soccer_coaches', verified: 'no', notes: '' });
  }
  report.push(`${year}: ${n} final poll rows${miss.length ? `; unmatched (not D1 programs in seed?): ${miss.join(', ')}` : ''}`);
}
fs.writeFileSync(path.join(SEEDS, 'rankings-final-usc.csv'), toCsv(rankingRows));

/* ------------------------------ ACC team season pages ------------------------------ */
// Wikipedia title = "<year> <School> <Nickname> women's soccer team"
const ACC = [
  ['Boston College', 'Boston College Eagles', 'ACC_BC_WSOC'], ['California', 'California Golden Bears', 'ACC_CAL_WSOC'], ['Clemson', 'Clemson Tigers', 'ACC_CLEM_WSOC'],
  ['Duke', 'Duke Blue Devils', 'ACC_DUKE_WSOC'], ['Florida State', 'Florida State Seminoles', 'ACC_FSU_WSOC'], ['Louisville', 'Louisville Cardinals', 'ACC_LOU_WSOC'],
  ['Miami (FL)', 'Miami Hurricanes', 'ACC_MIA_WSOC'], ['NC State', 'NC State Wolfpack', 'ACC_NCSU_WSOC'], ['North Carolina', 'North Carolina Tar Heels', 'ACC_UNC_WSOC'],
  ['Notre Dame', 'Notre Dame Fighting Irish', 'ACC_ND_WSOC'], ['Pittsburgh', 'Pittsburgh Panthers', 'ACC_PITT_WSOC'], ['SMU', 'SMU Mustangs', 'ACC_SMU_WSOC'],
  ['Stanford', 'Stanford Cardinal', 'ACC_STAN_WSOC'], ['Syracuse', 'Syracuse Orange', 'ACC_SYR_WSOC'], ['Virginia', 'Virginia Cavaliers', 'ACC_UVA_WSOC'],
  ['Virginia Tech', 'Virginia Tech Hokies', 'ACC_VT_WSOC'], ['Wake Forest', 'Wake Forest Demon Deacons', 'ACC_WAKE_WSOC'],
];
const clean = (v) => String(v || '').replace(/<ref[^>]*>.*?<\/ref>/gs, '').replace(/<ref[^>]*\/>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim();
function infobox(text) {
  const m = text.match(/\{\{Infobox college sports team season([\s\S]*?)\n\}\}/i); if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) { const k = line.match(/^\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/); if (k) out[k[1].toLowerCase()] = clean(k[2]); }
  return out;
}
const triple = (s) => { const m = String(s || '').match(/(\d+)\D+(\d+)(?:\D+(\d+))?/); return m ? { w: +m[1], l: +m[2], t: m[3] != null ? +m[3] : '' } : null; };
const splitName = (full) => {
  const parts = full.split(/\s+/); if (parts.length < 2) return { first: full, last: '' };
  let i = parts.length - 1; while (i > 1 && /^(da|de|del|van|von|di|la|le|mc|st\.?)$/i.test(parts[i - 1])) i--;
  return { first: parts.slice(0, i).join(' '), last: parts.slice(i).join(' ') };
};

const seasonRows = []; const coachRows = []; const confRows = []; const notes = [];
for (const [school, nick, code] of ACC) {
  const seen = {};
  for (const year of [2026, ...YEARS]) {
    const title = `${year} ${nick} women's soccer team`;
    const text = await wiki(title); await sleep(250);
    const box = text && infobox(text);
    if (!box) { notes.push(`${school} ${year}: no season page/infobox`); continue; }
    seen[year] = { box, title };
    if (year === 2026) continue; // current season: staff only (below); no results yet
    const rec = triple(box.record); const conf = triple(box.conf_record);
    if (rec) seasonRows.push({ program_id: code, school_name: school, season: year, wins: rec.w, losses: rec.l, ties: rec.t, conference_wins: conf?.w ?? '', conference_losses: conf?.l ?? '', conference_ties: conf?.t ?? '', conference: box.conference || '', source_url: pageUrl(title), source_name: `Wikipedia: ${title}`, source_type: 'other', verified: 'no', notes: '' });
    else notes.push(`${school} ${year}: no record in infobox`);
  }
  // staff from the most recent season page that exists
  const latest = [2026, ...YEARS.slice().reverse()].find((y) => seen[y]);
  if (latest) {
    const { box, title } = seen[latest];
    const staff = [['head_coach', 'Head Coach'], ['assoc_coach', 'Associate Head Coach'], ['asst_coach1', 'Assistant Coach'], ['asst_coach2', 'Assistant Coach'], ['asst_coach3', 'Assistant Coach'], ['asst_coach4', 'Assistant Coach']];
    for (const [k, role] of staff) {
      const name = (box[k] || '').replace(/\(.*?\)/g, '').trim();
      if (!name || /^(none|vacant|n\/a|tbd)$/i.test(name)) continue;
      const { first, last } = splitName(name);
      coachRows.push({ program_id: code, school_name: school, first_name: first, last_name: last, title: role, email: '', phone: '', profile_url: '', source_url: pageUrl(title), source_name: `Wikipedia: ${title} (staff as listed for the ${latest} season)`, source_type: 'other', verified: 'no', notes: '' });
    }
  } else notes.push(`${school}: no season page found for staff`);
  // conference changes observed across the pages we have
  const obs = YEARS.filter((y) => seen[y]?.box.conference).map((y) => ({ y, c: seen[y].box.conference }));
  // No 2023 team page but a 2024 ACC page: look for the school on the 2023 page of its likely previous conference.
  if (!seen[2023] && seen[2024]) {
    for (const prev of ['Pac-12 Conference', 'American Athletic Conference']) {
      const t = `2023 ${prev} women's soccer season`;
      const txt = await wiki(t); await sleep(250);
      if (txt && new RegExp(`\\[\\[[^\\]]*${school.replace(/[()]/g, '')}[^\\]]*\\]\\]`).test(txt)) { obs.unshift({ y: 2023, c: prev, via: t }); break; }
    }
  }
  const groups = [];
  for (const o of obs) { const g = groups.at(-1); if (g && g.c === o.c) g.end = o.y; else groups.push({ c: o.c, start: o.y, end: o.y, via: o.via }); }
  if (groups.length > 1) {
    groups.forEach((g, i) => confRows.push({ program_id: code, school_name: school, conference: g.c, start_season: i === 0 ? '' : g.start, end_season: i === groups.length - 1 ? '' : g.end, source_url: pageUrl(g.via || seen[g.start]?.title || seen[g.end].title), source_name: 'Wikipedia team season pages (conference as listed for each season)', source_type: 'other', verified: 'no', notes: i === 0 ? 'First season in this file is 2023; earlier start unknown.' : '' }));
  }
}
fs.writeFileSync(path.join(SEEDS, 'seasons-acc-wiki.csv'), toCsv(seasonRows));
// Programs whose staff were read from the official directory (coaches-acc-official.csv) keep only those rows.
const OFFICIAL_STAFF = new Set(['ACC_CLEM_WSOC', 'ACC_VT_WSOC']);
const wikiCoaches = coachRows.filter((r) => !OFFICIAL_STAFF.has(r.program_id));
fs.writeFileSync(path.join(SEEDS, 'coaches-acc-wiki.csv'), toCsv(wikiCoaches));
const confFile = path.join(SEEDS, 'conference_history-acc-wiki.csv');
if (confRows.length) fs.writeFileSync(confFile, toCsv(confRows)); else fs.rmSync(confFile, { force: true });
console.log(report.join('\n'));
console.log(`seasons ${seasonRows.length}, coaches ${coachRows.length}, conference-history ${confRows.length}, final-poll rows ${rankingRows.length}`);
if (notes.length) console.log(`\nNOT FOUND / SKIPPED (${notes.length}):\n${notes.join('\n')}`);
