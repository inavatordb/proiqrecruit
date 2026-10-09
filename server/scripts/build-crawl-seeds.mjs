/**
 * Turns the crawl cache (data/import/crawl/cache/*.json) into seed CSVs plus a per-conference coverage report.
 *
 *   node server/scripts/build-crawl-seeds.mjs [--no-probe]
 *
 * seasons-crawl.csv  completed seasons read from the team's own schedule page (Verified, source = that page)
 * coaches-crawl.csv  the staff page as printed (Verified, source = that page); emails/phones only if printed there
 * programs-crawl.csv official camps-page link (after a HEAD/GET check) and the working soccer page; Needs Review
 * The season in progress (current calendar year) is skipped: a partial record is not a season result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = path.join(root, 'data', 'import', 'crawl', 'cache');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const today = new Date().toISOString().slice(0, 10);
const di = process.argv.indexOf('--division'); const DIVISION = di >= 0 ? process.argv[di + 1] : 'D1';
const SUFFIX = DIVISION === 'D1' ? '' : '-' + DIVISION.toLowerCase();
const PROBE = !process.argv.includes('--no-probe');
const CURRENT_YEAR = new Date().getFullYear();

const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = (a) => a.map(csv).join(',');

/** "Chugger Adair" / 'Matt "Chugger" Adair' -> first/last. Suffixes stay on the last name. */
function splitName(full) {
  let n = full.replace(/\s+/g, ' ').trim();
  const nick = n.match(/["â€œ'â€˜]([^"â€'â€™]{2,20})["â€'â€™]/);
  if (nick) n = n.replace(nick[0], ' ').replace(/\s+/g, ' ').trim();
  const parts = n.split(' ');
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) ? parts.pop() : '';
  const last = parts.pop() + (suffix ? ` ${suffix}` : '');
  return { first: parts.join(' '), last };
}

const institutional = (e) => /^[\w.+-]+@[\w-]+(\.[\w-]+)*\.(edu|org)$/i.test(e);

async function alive(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProIQRecruitBot/1.0)' } });
    return r.ok || [401, 403].includes(r.status) ? r.url : '';
  } catch { return ''; }
}

const files = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json'));
const caches = files.map((f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))).filter((c) => (c.division || 'D1') === DIVISION);

const seasons = [['program_id', 'school_name', 'season', 'wins', 'losses', 'ties', 'conference_wins', 'conference_losses', 'conference_ties', 'conference', 'source_url', 'source_name', 'source_type', 'verified', 'last_verified_at', 'notes']];
const coaches = [['program_id', 'school_name', 'first_name', 'last_name', 'title', 'email', 'phone', 'profile_url', 'source_url', 'source_name', 'source_type', 'verified', 'last_verified_at', 'notes']];
const programs = [['program_id', 'school_name', 'sport', 'gender', 'division', 'camps_url', 'source_url', 'source_name', 'source_type', 'verified', 'notes']];
const stats = new Map();
const stat = (c) => { const k = c.conference || 'Unknown'; if (!stats.has(k)) stats.set(k, { n: 0, coaches: 0, seasons: 0, seasonsPossible: 0, camps: 0, failed: [] }); return stats.get(k); };

const probeQueue = [];
for (const c of caches.sort((a, b) => (a.conference || '').localeCompare(b.conference || '') || a.school_name.localeCompare(b.school_name))) {
  const st = stat(c); st.n++;
  const why = [];
  if (c.coaches?.ok) {
    st.coaches++;
    for (const r of c.coaches.rows) {
      const { first, last } = splitName(r.name);
      if (!first || !last) continue;
      const email = institutional(r.email || '') ? r.email : '';
      coaches.push([c.program_id, c.school_name, first, last, r.title, email, r.phone || '', '', c.coaches.url, `Official athletics staff page, read ${today}`, 'official_university', 'yes', today, '']);
    }
  } else why.push(`coaches: ${c.coaches?.reason || 'not crawled'}`);
  let got = 0; let need = 0;
  for (const [y, s] of Object.entries(c.seasons || {})) {
    if (Number(y) >= CURRENT_YEAR) continue; // in progress
    need++;
    if (!s?.ok) { why.push(`${y}: ${s?.reason || 'not crawled'}`); continue; }
    got++;
    const o = s.overall; const k = s.conf;
    seasons.push([c.program_id, c.school_name, y, o.wins, o.losses, o.ties, k?.wins ?? '', k?.losses ?? '', k?.ties ?? '', '', s.url, `Official ${y} schedule/results page, read ${today}`, 'official_university', 'yes', today, '']);
  }
  st.seasons += got; st.seasonsPossible += need;
  if (c.camps_url) probeQueue.push({ c, st });
  if (why.length) st.failed.push(`${c.school_name} â€” ${why.join('; ')}`);
  if (c.camps_url) programs.push([c.program_id, c.school_name, 'soccer', 'women', DIVISION, '', c.camps_url, `Official camps link found on team site, read ${today}`, 'official_university', 'no', '']);
}

// Camps: only an official camps page that actually loads; the individual camps (dates, prices) are not read.
const campsByProgram = new Map();
if (PROBE) {
  let i = 0;
  const worker = async () => {
    while (i < probeQueue.length) {
      const { c, st } = probeQueue[i++];
      const url = await alive(c.camps_url);
      if (url) { campsByProgram.set(c.program_id, url); st.camps++; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
// Seeds that already carry a camps link keep it (two files disagreeing would flip-flop at every boot).
const taken = new Set();
for (const f of fs.readdirSync(SEEDS).filter((x) => /^programs-.*\.csv$/.test(x) && !/crawl/.test(x))) {
  const [h, ...r] = fs.readFileSync(path.join(SEEDS, f), 'utf8').split(/\r?\n/); const cols = h.split(',');
  const ci = cols.indexOf('camps_url');
  if (ci >= 0) for (const l of r) { const m = l.match(/^([^,]+),/); if (m && l.split(',')[ci]) taken.add(m[1]); }
}
for (const row of programs.slice(1)) row[5] = campsByProgram.get(row[0]) || '';
for (let i = programs.length - 1; i > 0; i--) if (!programs[i][5] || taken.has(programs[i][0])) programs.splice(i, 1);
// A programs row that adds nothing (no camps link) would only rewrite the soccer page; keep it, the page is verified reachable.

fs.writeFileSync(path.join(SEEDS, `seasons-crawl${SUFFIX}.csv`), seasons.map(line).join('\n') + '\n');
fs.writeFileSync(path.join(SEEDS, `coaches-crawl${SUFFIX}.csv`), coaches.map(line).join('\n') + '\n');
fs.writeFileSync(path.join(SEEDS, `programs-crawl${SUFFIX}.csv`), programs.map(line).join('\n') + '\n');

const md = [`# Official-site crawl â€” coverage report (${today})`, '',
  `${caches.length} ${DIVISION} programs crawled. Coaches and season records were read from each team's own athletics site; nothing was guessed.`,
  `Completed seasons only (${CURRENT_YEAR} is in progress). Camps: only a link to the official camps page was collected (checked to load); individual camp dates and prices are not imported.`, '',
  '| Conference | Programs | Staff found | Seasons found | Camps link |', '|---|---|---|---|---|'];
for (const [k, s] of [...stats].sort()) md.push(`| ${k} | ${s.n} | ${s.coaches}/${s.n} | ${s.seasons}/${s.seasonsPossible} | ${s.camps}/${s.n} |`);
md.push('', '## What could not be read', '');
for (const [k, s] of [...stats].sort()) { if (!s.failed.length) continue; md.push(`### ${k}`, ...s.failed.map((f) => `- ${f}`), ''); }
fs.mkdirSync(path.join(root, 'data', 'import', 'crawl'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'import', 'crawl', `REPORT${SUFFIX}.md`), md.join('\n'));
console.log(`seasons ${seasons.length - 1}, coaches ${coaches.length - 1}, programs ${programs.length - 1}, camps links ${campsByProgram.size}`);
