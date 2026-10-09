/**
 * Seeds from a programs-only research file (program codes, links, conference history), keeping only what survived checking.
 *
 *   node server/scripts/probe-urls.mjs d1-other
 *   node server/scripts/build-programs-only-seed.mjs d1-other
 *
 * - Each row is matched to an EXISTING seeded D1 program (by name); unmatched rows are listed, never created.
 * - program_id becomes <CONF>_<SCHOOL>_WSOC where CONF comes from the program's CURRENT conference in the seed.
 * - Links are kept only if they resolve.
 * - Conference history is parsed from the file but a program's history is dropped entirely if the file's "present"
 *   conference disagrees with today's conference in the seed (the file is stale, e.g. 2026 realignment).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, slugify, toCsv } from '../recruiting/core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const conf = process.argv[2] || 'd1-other';
const probe = new Map(JSON.parse(fs.readFileSync(path.join(root, `data/import/${conf}/url-probe.json`), 'utf8')).map((r) => [r.u, r.status]));
const alive = (u) => u && probe.has(u) && (probe.get(u) < 400 || [401, 403, 429].includes(probe.get(u)));
const today = new Date().toISOString().slice(0, 10);

const seed = parseCsv(fs.readFileSync(path.join(SEEDS, 'programs-d1.csv'), 'utf8'));
const bySlug = new Map();
for (const p of seed) { bySlug.set(slugify(p.school_name), p); bySlug.set(slugify(p.official_school_name), p); }
// Names the file spells differently from the seed (Wikipedia short names).
const ALIAS = {
  'massachusetts': 'umass', 'ulm': 'louisiana-monroe', 'louisiana': 'louisiana', 'kansas-city': 'kansas-city', 'tam-commerce': 'east-texas-a-and-m',
  'tam-corpus-christi': 'texas-a-and-m-corpus-christi', 'saint-peters': 'saint-peter-s', 'saint-marys': 'saint-mary-s', 'saint-josephs': 'saint-joseph-s',
  'csun': 'cal-state-northridge', 'loyola-maryland': 'loyola-md', 'seattle-u': 'seattle', 'southeast-missouri': 'southeast-missouri-state', 'cal-baptist': 'california-baptist', 'iu-indy': 'iu-indy', 'the-citadel': 'the-citadel', 'sc-state': 'south-carolina-state',
};
const FULL = { 'America East': 'America East Conference', NEC: 'Northeast Conference', Northeast: 'Northeast Conference', ASUN: 'Atlantic Sun Conference', 'Atlantic Sun': 'Atlantic Sun Conference',
  CUSA: 'Conference USA', 'Conference USA': 'Conference USA', AAC: 'American Athletic Conference', 'A-10': 'Atlantic 10 Conference', 'Atlantic 10': 'Atlantic 10 Conference', SoCon: 'Southern Conference', Southern: 'Southern Conference',
  CAA: 'Coastal Athletic Association', 'Big East': 'Big East Conference', 'Big Sky': 'Big Sky Conference', 'Big South': 'Big South Conference', 'Big West': 'Big West Conference',
  Horizon: 'Horizon League', 'Horizon League': 'Horizon League', MAAC: 'Metro Atlantic Athletic Conference', MAC: 'Mid-American Conference', MVC: 'Missouri Valley Conference', 'Missouri Valley': 'Missouri Valley Conference',
  MW: 'Mountain West Conference', 'Mountain West': 'Mountain West Conference', OVC: 'Ohio Valley Conference', 'Ohio Valley': 'Ohio Valley Conference', 'Patriot League': 'Patriot League', Southland: 'Southland Conference',
  SWAC: 'Southwestern Athletic Conference', Summit: 'Summit League', 'Summit League': 'Summit League', 'Sun Belt': 'Sun Belt Conference', WCC: 'West Coast Conference', 'West Coast': 'West Coast Conference', 'Pac-12': 'Pac-12 Conference',
  WAC: 'Western Athletic Conference', 'Great West': 'Great West Conference' };
/** "Atlantic Sun Conference" and "ASUN" -> same key. */
const norm = (s) => String(s).toLowerCase().replace(/conference|athletic|league|association/g, '').replace(/[^a-z0-9]/g, '');
const PREFIX = { 'America East': 'AE', 'American': 'AAC', 'Atlantic 10': 'A10', 'Atlantic Sun': 'ASUN', 'United Athletic': 'UAC', 'Big East': 'BE', 'Big Sky': 'BSKY', 'Big South': 'BSOUTH', 'Big West': 'BW', 'Coastal': 'CAA',
  'Conference USA': 'CUSA', 'Horizon': 'HOR', 'Metro Atlantic': 'MAAC', 'Mid-American': 'MAC', 'Missouri Valley': 'MVC', 'Mountain West': 'MW', 'Northeast': 'NEC', 'Ohio Valley': 'OVC', 'Patriot': 'PAT',
  'Southern': 'SOCON', 'Southland': 'SLND', 'Southwestern': 'SWAC', 'Summit': 'SUM', 'Sun Belt': 'SB', 'West Coast': 'WCC', 'Pac-12': 'PAC12', 'Independent': 'IND' };
const prefixFor = (c) => { const k = Object.keys(PREFIX).find((n) => norm(n) === norm(c) || norm(c).startsWith(norm(n))); return k ? PREFIX[k] : 'D1'; };

function parseHistory(h) {
  if (!h.includes('(')) return { rows: [], skipped: [] };
  const rows = []; const skipped = [];
  for (const seg of h.split(/\),\s*/)) {
    const m = seg.match(/^(.*?)\s*\((.*?)\)?$/); if (!m) { skipped.push(seg); continue; }
    const name = m[1].trim(); const conference = FULL[name]; const spec = m[2].trim();
    let r;
    if (!conference || /^D[23]\b/.test(name)) { skipped.push(seg); continue; }
    if ((r = spec.match(/^thru (\d{4})-\d{2}$/))) rows.push({ conference, start: '', end: +r[1] });
    else if ((r = spec.match(/^(?:affiliate )?(\d{4})-present$/))) rows.push({ conference, start: +r[1], end: '' });
    else if ((r = spec.match(/^(\d{4})-(\d{4})$/))) rows.push({ conference, start: +r[1], end: +r[2] - 1 });
    else if ((r = spec.match(/^(\d{4})-(\d{2})$/))) {
      const y = +r[1]; const yy = +r[2];
      if (yy === (y + 1) % 100) rows.push({ conference, start: y, end: y }); // one season, e.g. 2013-14
      else rows.push({ conference, start: y, end: Math.floor(y / 100) * 100 + yy - 1 }); // range, e.g. 2018-23 -> 2018..2022
    } else skipped.push(seg);
  }
  return { rows, skipped };
}

const unmatched = []; const dropped = []; const programs = []; const hist = []; const histSkipped = []; const histStale = [];
const codes = new Set();
for (const r of parseCsv(fs.readFileSync(path.join(root, `data/import/${conf}/source/gemini_programs.csv`), 'utf8'))) {
  const slugFromId = r.program_id.replace('w-soccer-', '');
  const base = slugify(r.school_name.replace(/\s*\(.*?\)\s*/g, ''));
  const p = bySlug.get(base) || bySlug.get(ALIAS[slugFromId] || '') || bySlug.get(slugFromId) || bySlug.get(ALIAS[base] || '');
  if (!p) { unmatched.push(`${r.school_name} (${r.program_id})`); continue; }
  let code = `${prefixFor(p.conference)}_${slugify(p.school_name).toUpperCase().replace(/-/g, '_')}_WSOC`;
  if (codes.has(code)) code = `${code.slice(0, -5)}_${p.state}_WSOC`;
  codes.add(code);
  const keep = (k, u) => { if (alive(u)) return u; if (u) dropped.push(`${p.school_name} ${k}: ${u} (${probe.get(u) ?? 'unprobed'})`); return ''; };
  const soccer = keep('soccer page', r.official_soccer_url);
  programs.push({
    program_id: code, school_name: p.school_name, sport: 'soccer', gender: 'women', division: 'D1', state: p.state,
    athletics_website: keep('athletics site', r.official_athletics_url), soccer_website: soccer, camps_url: keep('camps page', r.camps_url),
    source_url: soccer, source_name: `Supplied research file (${conf}); links machine-checked to resolve (${today}). Not otherwise verified.`,
    source_type: soccer ? 'official_university' : '', verified: 'no', notes: 'Links only. Confirm against the official athletics site before marking verified.',
  });
  // history
  const { rows, skipped } = parseHistory(r.conference_history);
  if (skipped.length) histSkipped.push(`${p.school_name}: ${skipped.join(' | ')}`);
  if (!rows.length) continue;
  const last = rows.at(-1);
  if (last.end !== '' || norm(last.conference) !== norm(p.conference)) { histStale.push(`${p.school_name}: file ends in ${last.conference}${last.end !== '' ? ` (to ${last.end})` : ''}, seed says ${p.conference}`); continue; }
  for (const s of rows) hist.push({ program_id: code, school_name: p.school_name, conference: norm(s.conference) === norm(p.conference) ? p.conference : s.conference, start_season: s.start, end_season: s.end, source_url: '', source_name: `Supplied research file (${conf}); not independently sourced`, source_type: 'other', verified: 'no', notes: r.notes || '' });
}
fs.writeFileSync(path.join(SEEDS, `programs-${conf}.csv`), toCsv(programs));
if (hist.length) fs.writeFileSync(path.join(SEEDS, `conference_history-${conf}.csv`), toCsv(hist)); else fs.rmSync(path.join(SEEDS, `conference_history-${conf}.csv`), { force: true });

console.log(`programs ${programs.length} written; ${dropped.length} link(s) dropped; history rows ${hist.length}`);
console.log(`\nUNMATCHED to the seed (${unmatched.length}): ${unmatched.join('; ')}`);
console.log(`\nHISTORY dropped as stale/contradicting today's conference (${histStale.length}):\n  ${histStale.join('\n  ')}`);
console.log(`\nHISTORY segments not understood (${histSkipped.length}): ${histSkipped.join(' || ')}`);
fs.writeFileSync(path.join(root, `data/import/${conf}/build-report.txt`), `unmatched:\n${unmatched.join('\n')}\n\nlinks dropped:\n${dropped.join('\n')}\n\nhistory stale:\n${histStale.join('\n')}\n\nhistory segments not understood:\n${histSkipped.join('\n')}\n`);
