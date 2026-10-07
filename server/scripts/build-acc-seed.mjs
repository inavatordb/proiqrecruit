/**
 * Turns the parts of the supplied ACC research file that survived checking into seed CSVs.
 *
 *   node server/scripts/probe-urls.mjs        # writes data/import/acc/url-probe.json
 *   node server/scripts/build-acc-seed.mjs
 *
 * Kept:   program ids (as stable codes) and website links that actually resolve; conference moves
 *         (as Needs Review); staff + emails read directly from official staff directories.
 * Not kept (see data/import/acc/REVIEW.md): coaches, emails, seasons, rankings, camps and ID events
 *         from the file -- they contradicted sourced data or pointed at sites that do not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../recruiting/core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const probe = new Map(JSON.parse(fs.readFileSync(path.join(root, 'data/import/acc/url-probe.json'), 'utf8')).map((r) => [r.u, r.status]));
// An existing page, or one behind a bot check, is kept. A dead domain or 404 is dropped.
const alive = (u) => u && probe.has(u) && (probe.get(u) < 400 || [401, 403, 429].includes(probe.get(u)));

const CODES = {
  'w-soccer-boston-college': ['ACC_BC_WSOC', 'Boston College'], 'w-soccer-california': ['ACC_CAL_WSOC', 'California'], 'w-soccer-clemson': ['ACC_CLEM_WSOC', 'Clemson'],
  'w-soccer-duke': ['ACC_DUKE_WSOC', 'Duke'], 'w-soccer-florida-state': ['ACC_FSU_WSOC', 'Florida State'], 'w-soccer-louisville': ['ACC_LOU_WSOC', 'Louisville'],
  'w-soccer-miami': ['ACC_MIA_WSOC', 'Miami (FL)'], 'w-soccer-nc-state': ['ACC_NCSU_WSOC', 'NC State'], 'w-soccer-north-carolina': ['ACC_UNC_WSOC', 'North Carolina'],
  'w-soccer-notre-dame': ['ACC_ND_WSOC', 'Notre Dame'], 'w-soccer-pittsburgh': ['ACC_PITT_WSOC', 'Pittsburgh'], 'w-soccer-smu': ['ACC_SMU_WSOC', 'SMU'],
  'w-soccer-stanford': ['ACC_STAN_WSOC', 'Stanford'], 'w-soccer-syracuse': ['ACC_SYR_WSOC', 'Syracuse'], 'w-soccer-virginia': ['ACC_UVA_WSOC', 'Virginia'],
  'w-soccer-virginia-tech': ['ACC_VT_WSOC', 'Virginia Tech'], 'w-soccer-wake-forest': ['ACC_WAKE_WSOC', 'Wake Forest'],
};

/* ---- programs: codes + links that resolve ---- */
const dropped = [];
const programs = parseCsv(fs.readFileSync(path.join(root, 'data/import/acc/source/gemini_programs.csv'), 'utf8')).map((r) => {
  const [code, name] = CODES[r.program_id];
  const keep = (k, u) => { if (alive(u)) return u; if (u) dropped.push(`${name} ${k}: ${u} (${probe.get(u) ?? 'unprobed'})`); return ''; };
  const soccer = keep('soccer page', r.official_soccer_url);
  return {
    program_id: code, school_name: name, sport: 'soccer', gender: 'women', division: 'D1',
    athletics_website: keep('athletics site', r.official_athletics_url), soccer_website: soccer, camps_url: keep('camps page', r.camps_url),
    source_url: soccer, source_name: 'Supplied ACC research file; links machine-checked to resolve (2026-10-07). Not otherwise verified.',
    source_type: soccer ? 'official_university' : '', verified: 'no', notes: 'Links only. Confirm against the official athletics site before marking verified.',
  };
});
fs.writeFileSync(path.join(SEEDS, 'programs-acc.csv'), toCsv(programs));

/* ---- conference moves: ACC from 2024 is corroborated by the 2024 ACC team pages; the earlier conference comes from the research file ---- */
const page24 = (nick) => `https://en.wikipedia.org/wiki/2024_${nick.replace(/ /g, '_')}_women's_soccer_team`;
const moves = [['ACC_CAL_WSOC', 'California', 'Pac-12 Conference', 'California Golden Bears'], ['ACC_STAN_WSOC', 'Stanford', 'Pac-12 Conference', 'Stanford Cardinal'], ['ACC_SMU_WSOC', 'SMU', 'American Athletic Conference', 'SMU Mustangs']];
const hist = [];
for (const [code, school, prev, nick] of moves) {
  hist.push({ program_id: code, school_name: school, conference: prev, start_season: '', end_season: 2023, source_url: '', source_name: 'Supplied ACC research file (earlier conference); not independently sourced', source_type: 'other', verified: 'no', notes: `${school} left ${prev} for the ACC for the 2024 season. Start of earlier membership unknown.` });
  hist.push({ program_id: code, school_name: school, conference: 'Atlantic Coast Conference', start_season: 2024, end_season: '', source_url: page24(nick), source_name: `Wikipedia: 2024 ${nick} women's soccer team (lists ACC)`, source_type: 'other', verified: 'no', notes: '' });
}
fs.writeFileSync(path.join(SEEDS, 'conference_history-acc.csv'), toCsv(hist));

/* ---- staff + emails read from the official directory pages on 2026-10-07 (verified) ---- */
const CLEM = 'https://clemsontigers.com/staff-directory/'; const VT = 'https://hokiesports.com/staff-directory';
const row = (code, school, first, last, title, email, src) => ({ program_id: code, school_name: school, first_name: first, last_name: last, title, email, phone: '', profile_url: '', source_url: src, source_name: 'Official athletics staff directory, read 2026-10-07', source_type: 'official_university', verified: 'yes', last_verified_at: '2026-10-07', notes: email ? '' : 'Email not printed on the official directory.' });
const official = [
  row('ACC_CLEM_WSOC', 'Clemson', 'Eddie', 'Radwanski', 'Head Coach', 'eradwan@clemson.edu', CLEM),
  row('ACC_CLEM_WSOC', 'Clemson', 'Jeff', 'Robbins', 'Associate Head Coach', 'jeferyr@clemson.edu', CLEM),
  row('ACC_CLEM_WSOC', 'Clemson', 'Siri', 'Mullinix', 'Assistant Coach', 'sirim@clemson.edu', CLEM),
  row('ACC_CLEM_WSOC', 'Clemson', 'Maryanne', 'Kilgore', 'Assistant Coach', 'kilgor4@clemson.edu', CLEM),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Chugger', 'Adair', 'Head Coach', '', VT),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Drew', 'Kopp', 'Associate Head Coach', 'drewk@vt.edu', VT),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Matt', 'Gwilliam', 'Assistant Coach', 'mattg08@vt.edu', VT),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Preston', 'Burpo', 'Assistant Coach', '', VT),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Hailey', 'Williams', 'Assistant Coach', 'haileywilliams@vt.edu', VT),
  row('ACC_VT_WSOC', 'Virginia Tech', 'Katie', 'Flores', 'Director of Operations', 'kflores1@vt.edu', VT),
];
fs.writeFileSync(path.join(SEEDS, 'coaches-acc-official.csv'), toCsv(official));

console.log(`programs-acc.csv ${programs.length} rows; ${dropped.length} link(s) dropped:\n${dropped.join('\n')}`);
console.log(`conference_history-acc.csv ${hist.length} rows; coaches-acc-official.csv ${official.length} rows`);
