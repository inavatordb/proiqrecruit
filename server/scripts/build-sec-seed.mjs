/**
 * Turns the parts of the supplied SEC research file that survived checking into seed CSVs.
 *
 *   node server/scripts/probe-urls.mjs sec
 *   node server/scripts/build-sec-seed.mjs
 *
 * Kept:   stable program codes + website links that resolve; conference moves (Needs Review, sourced where a
 *         page names the conference); Auburn and Texas A&M staff/emails read from the official directories.
 * Not kept (see data/import/sec/REVIEW.md): the file's coaches, emails, seasons, rankings, camps and ID events.
 * No Wikipedia team-season pages exist for SEC programs, so sourced records/staff are not available the way they were for the ACC.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../recruiting/core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const probe = new Map(JSON.parse(fs.readFileSync(path.join(root, 'data/import/sec/url-probe.json'), 'utf8')).map((r) => [r.u, r.status]));
const alive = (u) => u && probe.has(u) && (probe.get(u) < 400 || [401, 403, 429].includes(probe.get(u)));

const CODES = {
  'w-soccer-alabama': ['SEC_ALA_WSOC', 'Alabama'], 'w-soccer-arkansas': ['SEC_ARK_WSOC', 'Arkansas'], 'w-soccer-auburn': ['SEC_AUB_WSOC', 'Auburn'],
  'w-soccer-florida': ['SEC_FLA_WSOC', 'Florida'], 'w-soccer-georgia': ['SEC_UGA_WSOC', 'Georgia'], 'w-soccer-kentucky': ['SEC_UK_WSOC', 'Kentucky'],
  'w-soccer-lsu': ['SEC_LSU_WSOC', 'LSU'], 'w-soccer-mississippi-state': ['SEC_MSST_WSOC', 'Mississippi State'], 'w-soccer-missouri': ['SEC_MIZ_WSOC', 'Missouri'],
  'w-soccer-oklahoma': ['SEC_OU_WSOC', 'Oklahoma'], 'w-soccer-ole-miss': ['SEC_MISS_WSOC', 'Ole Miss'], 'w-soccer-south-carolina': ['SEC_SC_WSOC', 'South Carolina'],
  'w-soccer-tennessee': ['SEC_TENN_WSOC', 'Tennessee'], 'w-soccer-texas': ['SEC_TEX_WSOC', 'Texas'], 'w-soccer-texas-am': ['SEC_TAMU_WSOC', 'Texas A&M'],
  'w-soccer-vanderbilt': ['SEC_VAN_WSOC', 'Vanderbilt'],
};

/* ---- programs: codes + links that resolve ---- */
const dropped = [];
const programs = parseCsv(fs.readFileSync(path.join(root, 'data/import/sec/source/gemini_programs.csv'), 'utf8')).map((r) => {
  const [code, name] = CODES[r.program_id];
  const keep = (k, u) => { if (alive(u)) return u; if (u) dropped.push(`${name} ${k}: ${u} (${probe.get(u) ?? 'unprobed'})`); return ''; };
  const soccer = keep('soccer page', r.official_soccer_url);
  return {
    program_id: code, school_name: name, sport: 'soccer', gender: 'women', division: 'D1',
    athletics_website: keep('athletics site', r.official_athletics_url), soccer_website: soccer, camps_url: keep('camps page', r.camps_url),
    source_url: soccer, source_name: 'Supplied SEC research file; links machine-checked to resolve (2026-10-09). Not otherwise verified.',
    source_type: soccer ? 'official_university' : '', verified: 'no', notes: 'Links only. Confirm against the official athletics site before marking verified.',
  };
});
fs.writeFileSync(path.join(SEEDS, 'programs-sec.csv'), toCsv(programs));

/* ---- conference moves ---- */
const NCAA = (y) => `https://en.wikipedia.org/wiki/${y}_NCAA_Division_I_women's_soccer_tournament`;
const hist = [];
const move = (code, school, prev, endPrev, startSec, prevSrc, secSrc, note) => {
  hist.push({ program_id: code, school_name: school, conference: prev, start_season: '', end_season: endPrev, source_url: prevSrc, source_name: prevSrc ? `Wikipedia: ${endPrev} NCAA tournament field (lists ${prev})` : 'Supplied SEC research file; not independently sourced', source_type: 'other', verified: 'no', notes: note });
  hist.push({ program_id: code, school_name: school, conference: 'Southeastern Conference', start_season: startSec, end_season: '', source_url: secSrc, source_name: secSrc ? `Wikipedia: ${startSec} NCAA tournament field (lists SEC)` : 'Supplied SEC research file; not independently sourced', source_type: 'other', verified: 'no', notes: '' });
};
move('SEC_TEX_WSOC', 'Texas', 'Big 12 Conference', 2023, 2024, NCAA(2023), NCAA(2024), 'Start of earlier membership unknown.');
move('SEC_OU_WSOC', 'Oklahoma', 'Big 12 Conference', 2023, 2024, '', '', 'Joined the SEC for 2024 per the research file; confirm against the SEC announcement.');
move('SEC_MIZ_WSOC', 'Missouri', 'Big 12 Conference', 2011, 2012, '', '', 'Joined the SEC for 2012 per the research file; confirm.');
move('SEC_TAMU_WSOC', 'Texas A&M', 'Big 12 Conference', 2011, 2012, '', '', 'Joined the SEC for 2012 per the research file; confirm.');
fs.writeFileSync(path.join(SEEDS, 'conference_history-sec.csv'), toCsv(hist));

/* ---- staff + emails read from the official directory pages on 2026-10-09 (verified) ---- */
const AUB = 'https://auburntigers.com/staff-directory'; const TAMU = 'https://12thman.com/staff-directory';
const row = (code, school, first, last, title, email, src, note = '') => ({ program_id: code, school_name: school, first_name: first, last_name: last, title, email, phone: '', profile_url: '', source_url: src, source_name: 'Official athletics staff directory (section "Soccer"), read 2026-10-09', source_type: 'official_university', verified: 'yes', last_verified_at: '2026-10-09', notes: note });
const shared = 'Shared program mailbox printed on the official directory.';
const official = [
  row('SEC_AUB_WSOC', 'Auburn', 'James', 'Armstrong', 'Head Coach', 'asoccer@auburn.edu', AUB, shared),
  row('SEC_AUB_WSOC', 'Auburn', 'Drago', 'Ćeranić', 'Associate Head Coach', 'asoccer@auburn.edu', AUB, shared),
  row('SEC_AUB_WSOC', 'Auburn', 'Rob', 'McGann', 'Assistant Coach', 'asoccer@auburn.edu', AUB, shared),
  row('SEC_AUB_WSOC', 'Auburn', 'Tara', 'McQueen', 'Assistant Coach', 'asoccer@auburn.edu', AUB, shared),
  row('SEC_AUB_WSOC', 'Auburn', 'Price', 'Loposer', 'Player Development Coordinator', 'asoccer@auburn.edu', AUB, shared),
  row('SEC_AUB_WSOC', 'Auburn', 'Amy', 'Reif', 'Director of Soccer Operations', 'arr0063@auburn.edu', AUB),
  row('SEC_TAMU_WSOC', 'Texas A&M', 'Bobby', 'Shuttleworth', 'Head Coach', 'bshuttleworth@athletics.tamu.edu', TAMU),
  row('SEC_TAMU_WSOC', 'Texas A&M', 'Marc', 'Burch', 'Assistant Coach', 'mburch@athletics.tamu.edu', TAMU),
  row('SEC_TAMU_WSOC', 'Texas A&M', 'Alyssa', 'Bower', 'Assistant Coach', 'amautz@athletics.tamu.edu', TAMU),
  row('SEC_TAMU_WSOC', 'Texas A&M', 'Ali', 'Hanif', 'Assistant Coach', 'ahanif@athletics.tamu.edu', TAMU),
  row('SEC_TAMU_WSOC', 'Texas A&M', 'Curt', 'Magnuson', 'Director of Soccer Operations', 'cmagnuson@athletics.tamu.edu', TAMU),
];
fs.writeFileSync(path.join(SEEDS, 'coaches-sec-official.csv'), toCsv(official));

console.log(`programs-sec.csv ${programs.length} rows; ${dropped.length} link(s) dropped:\n${dropped.join('\n')}`);
console.log(`conference_history-sec.csv ${hist.length} rows; coaches-sec-official.csv ${official.length} rows`);
