/**
 * Seeds from a supplied conference research file, keeping only what survived checking.
 *
 *   node server/scripts/probe-urls.mjs <conf>
 *   node server/scripts/build-conference-seeds.mjs <ivy|big12|bigten>
 *
 * Kept:   stable program codes + website links that resolve; conference history parsed from the file's
 *         conference_history column (Needs Review -- it is not independently sourced); staff read from
 *         official directories where listed in OFFICIAL below.
 * Not kept: the file's coaches, emails, seasons, rankings, camps and ID events (see data/import/<conf>/REVIEW.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../recruiting/core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const conf = process.argv[2];

const CONFS = {
  ivy: { prefix: 'IVY', codes: { brown: 'BRWN', columbia: 'COL', cornell: 'CORN', dartmouth: 'DART', harvard: 'HARV', penn: 'PENN', princeton: 'PRIN', yale: 'YALE' } },
  big12: { prefix: 'B12', codes: { arizona: 'ARIZ', 'arizona-state': 'ASU', baylor: 'BAY', byu: 'BYU', cincinnati: 'CIN', colorado: 'COLO', houston: 'HOU', 'iowa-state': 'ISU', kansas: 'KU', 'kansas-state': 'KSU', 'oklahoma-state': 'OKST', tcu: 'TCU', 'texas-tech': 'TTU', ucf: 'UCF', utah: 'UTAH', 'west-virginia': 'WVU' } },
  bigten: { prefix: 'B10', codes: { illinois: 'ILL', indiana: 'IU', iowa: 'IOWA', maryland: 'UMD', michigan: 'MICH', 'michigan-state': 'MSU', minnesota: 'MINN', nebraska: 'NEB', northwestern: 'NU', 'ohio-state': 'OSU', oregon: 'ORE', 'penn-state': 'PSU', purdue: 'PUR', rutgers: 'RUT', ucla: 'UCLA', usc: 'USC', washington: 'UW', wisconsin: 'WISC' } },
};
const cfg = CONFS[conf];
if (!cfg) { console.error('usage: build-conference-seeds.mjs <ivy|big12|bigten>'); process.exit(1); }

/** Staff read straight from official directories (verified). */
const DIR = { cornell: 'https://cornellbigred.com/staff-directory', penn: 'https://pennathletics.com/staff-directory' };
const OFFICIAL = {
  cornell: ['Cornell', [['Rob', 'Ferguson', 'Head Coach'], ['Danielle', 'Reid-Espinal', 'Associate Head Coach'], ['Shaela', 'Krayer', 'Assistant Coach / Recruiting Coordinator']]],
  penn: ['Penn', [['Krissy', 'Turner', 'Head Coach'], ['Boomer', 'Steigelman', 'Assistant Coach'], ['Seve', 'Hirst', 'Assistant Coach'], ['Kamryn', 'Stablein', 'Assistant Coach']]],
};

const FULL = { 'Big 12': 'Big 12 Conference', 'Big Ten': 'Big Ten Conference', 'Pac-12': 'Pac-12 Conference', AAC: 'American Athletic Conference', American: 'American Athletic Conference', CUSA: 'Conference USA', WCC: 'West Coast Conference', 'Big East': 'Big East Conference', 'Mountain West': 'Mountain West Conference', ACC: 'Atlantic Coast Conference', 'Ivy League': 'Ivy League' };

const probe = new Map(JSON.parse(fs.readFileSync(path.join(root, `data/import/${conf}/url-probe.json`), 'utf8')).map((r) => [r.u, r.status]));
const alive = (u) => u && probe.has(u) && (probe.get(u) < 400 || [401, 403, 429].includes(probe.get(u)));
const seed = new Map(parseCsv(fs.readFileSync(path.join(SEEDS, 'programs-d1.csv'), 'utf8')).map((p) => [p.school_name, p]));
const today = new Date().toISOString().slice(0, 10);

/** "Pac-12 (thru 2023-24), Big 12 (2024-present)" -> [{conference,start,end}]. Academic years: thru 2023-24 = last season 2023. */
function parseHistory(h) {
  if (!h.includes('(')) return [];
  const out = [];
  for (const seg of h.split(/\),\s*/)) {
    const m = seg.match(/^(.*?)\s*\((.*?)\)?$/); if (!m) continue;
    const conference = FULL[m[1].trim()]; const spec = m[2].trim();
    if (!conference) { out.push({ error: `unrecognised conference "${m[1]}"` }); continue; }
    let r;
    if ((r = spec.match(/^thru (\d{4})-\d{2}$/))) out.push({ conference, start: '', end: +r[1] });
    else if ((r = spec.match(/^(\d{4})-present$/))) out.push({ conference, start: +r[1], end: '' });
    else if ((r = spec.match(/^(\d{4})-(\d{4})$/))) out.push({ conference, start: +r[1], end: +r[2] - 1 });
    else if ((r = spec.match(/^(\d{4})-(\d{2})$/))) out.push({ conference, start: +r[1], end: +r[1] });
    else out.push({ error: `unparsed "${seg}"` });
  }
  return out;
}

const dropped = []; const programs = []; const hist = []; const problems = [];
for (const r of parseCsv(fs.readFileSync(path.join(root, `data/import/${conf}/source/gemini_programs.csv`), 'utf8'))) {
  const slug = r.program_id.replace('w-soccer-', '');
  const code = `${cfg.prefix}_${cfg.codes[slug]}_WSOC`;
  if (!cfg.codes[slug]) { problems.push(`no code for ${slug}`); continue; }
  if (!seed.has(r.school_name)) problems.push(`${r.school_name} not in the D1 seed`);
  const keep = (k, u) => { if (alive(u)) return u; if (u) dropped.push(`${r.school_name} ${k}: ${u} (${probe.get(u) ?? 'unprobed'})`); return ''; };
  const soccer = keep('soccer page', r.official_soccer_url);
  programs.push({
    program_id: code, school_name: r.school_name, sport: 'soccer', gender: 'women', division: 'D1',
    athletics_website: keep('athletics site', r.official_athletics_url), soccer_website: soccer, camps_url: keep('camps page', r.camps_url),
    source_url: soccer, source_name: `Supplied ${conf} research file; links machine-checked to resolve (${today}). Not otherwise verified.`,
    source_type: soccer ? 'official_university' : '', verified: 'no', notes: 'Links only. Confirm against the official athletics site before marking verified.',
  });
  for (const seg of parseHistory(r.conference_history)) {
    if (seg.error) { problems.push(`${r.school_name}: ${seg.error}`); continue; }
    hist.push({ program_id: code, school_name: r.school_name, conference: seg.conference, start_season: seg.start, end_season: seg.end, source_url: '', source_name: `Supplied ${conf} research file; not independently sourced`, source_type: 'other', verified: 'no', notes: r.notes || '' });
  }
}
fs.writeFileSync(path.join(SEEDS, `programs-${conf}.csv`), toCsv(programs));
if (hist.length) fs.writeFileSync(path.join(SEEDS, `conference_history-${conf}.csv`), toCsv(hist));

const official = [];
for (const [slug, [school, staff]] of Object.entries(OFFICIAL)) {
  const code = `${cfg.prefix}_${cfg.codes[slug]}_WSOC`; if (!programs.some((p) => p.program_id === code)) continue;
  for (const [first, last, title] of staff) official.push({ program_id: code, school_name: school, first_name: first, last_name: last, title, email: '', phone: '', profile_url: '', source_url: DIR[slug], source_name: `Official athletics staff directory (women's soccer), read ${today}`, source_type: 'official_university', verified: 'yes', last_verified_at: today, notes: 'Email not printed on the official directory.' });
}
if (official.length) fs.writeFileSync(path.join(SEEDS, `coaches-${conf}-official.csv`), toCsv(official));

console.log(`${conf}: programs ${programs.length}, history rows ${hist.length}, official staff ${official.length}; ${dropped.length} link(s) dropped`);
console.log(dropped.join('\n'));
if (problems.length) console.log(`PROBLEMS:\n${problems.join('\n')}`);
