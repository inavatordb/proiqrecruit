/**
 * Builds a ProgramSeason seed (NCAA tournament appearance + deepest round) from
 * Wikipedia's NCAA women's soccer tournament pages, which compile the official
 * NCAA brackets.
 *
 *   node server/scripts/build-recruiting-ncaa-tournaments.mjs [years...]
 *
 * "Reached round X" = the team played a match listed under round X. Teams with a
 * first-round bye therefore start at Second Round. Only the NCAA fields are
 * written (no win-loss records), so this layers cleanly under other imports.
 * Teams that cannot be matched to a program in the seed list are printed and
 * skipped rather than guessed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, slugify, toCsv } from '../recruiting/core.mjs';

const SEEDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const UA = 'HoursOfGamesRecruiting/1.0 (darisbrownseo@gmail.com)';
const YEARS = process.argv.slice(2).map(Number).filter(Boolean);
const years = YEARS.length ? YEARS : [2023, 2024, 2025];

const ROUND_OF = (h) => {
  const s = h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (s === 'first round') return ['First Round', 1];
  if (s === 'second round') return ['Second Round', 2];
  if (s === 'round of 16' || s === 'third round') return ['Round of 16', 3];
  if (s === 'quarterfinals' || s === 'quarterfinal') return ['Quarterfinal', 4];
  if (/^semi ?finals?$/.test(s)) return ['Semifinal', 5];
  if (s === 'final' || s === 'national championship') return ['Final', 6];
  return null;
};

function teamName(raw) {
  let s = String(raw || '');
  const csoc = s.match(/title=([^|}]+)/); if (csoc) return csoc[1].trim();
  const col = s.match(/CollegeSecondaryColorLink\|(?:[^|}]*\|){2}([^|}]+)\}\}/); if (col) return col[1].trim();
  s = s.replace(/'''/g, '').replace(/\{\{small\|[^}]*\}\}/gi, '').replace(/\{\{[^{}]*\}\}/g, '');
  const link = s.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/); if (link) s = link[1];
  return s.replace(/^\s*(\(\d+\)|#\d+)\s*/, '').replace(/[#()0-9]+/g, '').trim();
}
const bold = (raw) => /'''/.test(String(raw || ''));

async function load(year) {
  const title = `${year}_NCAA_Division_I_women's_soccer_tournament`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`, { headers: { 'User-Agent': UA } });
    const body = await res.text();
    if (res.ok && !body.startsWith('<!DOCTYPE')) return { url: `https://en.wikipedia.org/wiki/${title}`, text: body };
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  throw new Error(`could not fetch ${title}`);
}

function parseYear(text) {
  const reached = new Map(); // name -> [roundLabel, rank]
  let round = null;
  const boxes = text.split(/\n(?==+[^=\n]+=+[ \t]*(?:\n|$))/);
  for (const block of boxes) {
    const head = block.match(/^=+\s*([^=\n]+?)\s*=+\s*$/m);
    if (head) round = ROUND_OF(head[1]) || (/college cup|bracket|schedule/i.test(head[1]) ? round : null);
    if (!round) continue;
    for (const box of block.split('{{football box').slice(1)) {
      const t1 = box.match(/\|\s*team1\s*=\s*(.*)/)?.[1]; const t2 = box.match(/\|\s*team2\s*=\s*(.*)/)?.[1];
      if (!t1 || !t2) continue;
      const score = box.match(/\|\s*score\s*=\s*(\d+)\s*[–-]\s*(\d+)/);
      const n1 = teamName(t1); const n2 = teamName(t2);
      for (const n of [n1, n2]) { const prev = reached.get(n); if (!prev || prev[1] < round[1]) reached.set(n, round); }
      if (round[1] === 6) { // the final decides champion / runner-up
        let w = null;
        if (score && +score[1] !== +score[2]) w = +score[1] > +score[2] ? n1 : n2;
        else if (bold(t1) !== bold(t2)) w = bold(t1) ? n2 : n1; // bold marks the eliminated side on these pages
        if (w) { reached.set(w, ['Champion', 7]); reached.set(w === n1 ? n2 : n1, ['Runner-up', 6]); }
      }
    }
  }
  return reached;
}

const programs = parseCsv(fs.readFileSync(path.join(SEEDS, 'programs-d1.csv'), 'utf8'));
const bySlug = new Map();
for (const p of programs) { bySlug.set(slugify(p.school_name), p); bySlug.set(slugify(p.official_school_name), p); }
const alias = { 'grambling': 'grambling-state', 'cal baptist': 'california-baptist', 'miami fl': 'miami-fl', 'north carolina': 'north-carolina', 'unc': 'north-carolina', 'usc': 'usc', 'lsu': 'lsu', 'byu': 'byu', 'tcu': 'tcu', 'smu': 'smu', 'ucf': 'ucf', 'ole miss': 'ole-miss' };
const find = (n) => bySlug.get(slugify(n)) || bySlug.get(alias[n.toLowerCase()] || '') || bySlug.get(slugify(n.replace(/^(University of |The )/i, '').replace(/ University$/i, '')));

const out = [];
for (const year of years) {
  const { url, text } = await load(year);
  const reached = parseYear(text);
  let miss = [];
  for (const [name, [label]] of reached) {
    const p = find(name);
    if (!p) { miss.push(name); continue; }
    out.push({ school_name: p.school_name, sport: 'womens-soccer', division: 'D1', season: year, ncaa_tournament_appearance: 'yes', ncaa_tournament_round: label, source_url: url, source_name: `Wikipedia: ${year} NCAA Division I women's soccer tournament (compiles NCAA brackets)` });
  }
  console.log(`${year}: ${reached.size} teams found, ${reached.size - miss.length} matched${miss.length ? `; UNMATCHED: ${miss.join(', ')}` : ''}`);
}
fs.writeFileSync(path.join(SEEDS, 'seasons-ncaa-d1.csv'), toCsv(out));
console.log(`wrote ${out.length} rows`);
