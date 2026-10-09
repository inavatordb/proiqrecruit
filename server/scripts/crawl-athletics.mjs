/**
 * Crawl official athletics sites for each program's current coaching staff, season records, and camps page.
 *
 *   node server/scripts/crawl-athletics.mjs [--division D1] [--conf "Atlantic Coast"] [--limit 20] [--years 2023,2024,2025,2026] [--force]
 *
 * What it reads (public pages, a few requests at a time, resumable):
 *   the team's staff page      -> the coaching staff (name, title, email/phone when printed)
 *   the season schedule pages  -> the season summary ("Overall Wins 17 Losses 5 Ties 1 ... Conf Wins 7 ...")
 *   the site's navigation      -> a link to the official camps page
 * Results are cached as small JSON files in data/import/crawl/cache/ ; nothing is guessed. A page that does not
 * parse is recorded as a failure with the reason, never filled in. build-crawl-seeds.mjs turns the cache into seed CSVs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from '../recruiting/service.mjs';
import { decode, strip, parseCoaches, parseSeason, findCampsLink, findSoccerLink } from './athleticsParse.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = path.join(root, 'data', 'import', 'crawl', 'cache');
fs.mkdirSync(CACHE, { recursive: true });
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIVISION = opt('division', 'D1'); const CONF = opt('conf', ''); const LIMIT = Number(opt('limit', 0));
const YEARS = opt('years', '2023,2024,2025,2026').split(',').map(Number); const FORCE = args.includes('--force');
const CONCURRENCY = Number(opt('concurrency', 6));
const UA = 'Mozilla/5.0 (compatible; ProIQRecruitBot/1.0; +https://recruit-ousc.onrender.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (res.ok) return { status: res.status, html: await res.text(), url: res.url };
      if ([403, 404, 410, 429].includes(res.status)) return { status: res.status, html: '', url: res.url };
    } catch (e) { if (i === tries - 1) return { status: 0, html: '', url, err: e.cause?.code || e.message }; }
    await sleep(1500);
  }
  return { status: 0, html: '', url, err: 'failed' };
}

const lastHit = new Map();
async function polite(url) { // one request per host at a time, 500ms apart
  let host; try { host = new URL(url).host; } catch { return { status: 0, html: '', url, err: 'bad url' }; }
  const prev = lastHit.get(host) || Promise.resolve();
  const next = prev.then(() => sleep(500)); lastHit.set(host, next.catch(() => {})); await prev; return get(url);
}

/* --------------------------------- crawl --------------------------------- */
const svc = createRecruitingService({ loadEntity: (() => { const s = new Map(); return (n) => { if (!s.has(n)) s.set(n, new Map()); return s.get(n); }; })(), persistEntity() {}, seedDir: path.join(root, 'server', 'seeds', 'recruiting') });
svc.bootstrap();
let programs = svc.rows('CollegeProgram').filter((p) => p.division === DIVISION && p.active !== false && (p.team_website || p.athletics_website));
if (CONF) programs = programs.filter((p) => (p.conference || '').toLowerCase().includes(CONF.toLowerCase()));
programs.sort((a, b) => a.school_name.localeCompare(b.school_name));
if (LIMIT) programs = programs.slice(0, LIMIT);
console.log(`crawling ${programs.length} ${DIVISION} programs${CONF ? ` in "${CONF}"` : ''}, years ${YEARS.join(',')}`);

const cacheFile = (p) => path.join(CACHE, `${(p.program_code || p.id).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
const SLUGS = ['womens-soccer', 'wsoc', 'w-soccer', 'wsoccer', 'soccer'];

/** The team's real site root: our stored link, else the athletics home page's "Women's Soccer" link, else common slugs. */
async function findHome(p, out) {
  if (p.team_website) { const r = await polite(p.team_website); if (r.html) return r; }
  if (!p.athletics_website) return { html: '', status: 0 };
  const front = await polite(p.athletics_website);
  if (front.html && !out.camps_url) out.camps_url = findCampsLink(front.html, front.url);
  const link = front.html ? findSoccerLink(front.html, front.url) : '';
  if (link) { const r = await polite(link); if (r.html) return r; }
  const origin = new URL(front.url || p.athletics_website).origin;
  for (const s of SLUGS) {
    const r = await polite(`${origin}/sports/${s}`);
    if (r.html && /soccer/i.test(r.html.slice(0, 20000)) && !/\/sports\/(m-|mens-)/.test(new URL(r.url).pathname)) return r;
  }
  return { html: '', status: front.status || 0, err: front.err };
}

async function crawlOne(p) {
  const file = cacheFile(p);
  const out = fs.existsSync(file) && !FORCE ? JSON.parse(fs.readFileSync(file, 'utf8')) : { program_id: p.program_code || p.id, school_name: p.school_name, conference: p.conference, seasons: {}, coaches: null, camps_url: '' };
  const needWork = FORCE || !out.coaches?.ok || YEARS.some((y) => !out.seasons[y]?.ok && out.seasons[y]?.status !== 404);
  if (!needWork) return out;
  const save = () => { out.fetched_at = new Date().toISOString(); fs.writeFileSync(file, JSON.stringify(out)); return out; };

  const home = await findHome(p, out);
  if (!home.html) { out.coaches = { ok: false, status: home.status, reason: home.err || `team page not found (HTTP ${home.status})`, rows: [] }; return save(); }
  const base = home.url.replace(/[?#].*$/, '').replace(/\/$/, '');
  out.base = base;
  if (!out.camps_url) out.camps_url = findCampsLink(home.html, home.url);

  // Coaches: the platform's staff page (Sidearm: /coaches, WMT: /roster).
  if (!out.coaches?.ok || FORCE) {
    let best = null;
    for (const suffix of ['/coaches', '/roster', '/roster/coaches']) {
      const r = await polite(`${base}${suffix}`);
      const rows = r.html ? parseCoaches(r.html) : [];
      if (rows.length) { best = { url: r.url, status: r.status, ok: true, rows, reason: '' }; if (!out.camps_url) out.camps_url = findCampsLink(r.html, r.url); break; }
      best = best || { url: r.url, status: r.status, ok: false, rows: [], reason: r.err || (r.html ? 'no coaching staff found on page' : `HTTP ${r.status}`) };
    }
    out.coaches = best;
  }

  // Seasons: try each platform's URL pattern; the parser rejects a page that does not show the requested season.
  const root2 = base.replace(/\/[^/]+$/, ''); const slug = base.split('/').pop();
  const yy = (y) => String((y + 1) % 100).padStart(2, '0');
  const patterns = (y) => [`${base}/schedule/${y}`, `${base}/schedule/${y}-${yy(y)}`, `${base}/schedule/season/${y}`, `${root2}/${slug}/${y}-${yy(y)}/schedule`];
  for (const y of YEARS) {
    if (out.seasons[y]?.ok && !FORCE) continue;
    const order = out.pattern !== undefined ? [out.pattern, ...patterns(y).keys()].filter((v, i, a) => a.indexOf(v) === i) : [...patterns(y).keys()];
    let last = null;
    for (const i of order) {
      const r = await polite(patterns(y)[i]);
      const parsed = r.html ? parseSeason(r.html, y) : { ok: false, reason: r.err || `HTTP ${r.status}` };
      const res = { url: r.url, status: r.status, ...parsed };
      if (parsed.ok) { out.pattern = i; last = res; break; }
      // keep the most informative failure: a page that loaded but showed the wrong season beats a 404
      if (!last || (r.html && !last.status) || (r.html && last.status === 404)) last = res; else if (r.html) last = res;
    }
    out.seasons[y] = last;
  }
  return save();
}

let done = 0; let ok = 0; const queue = [...programs];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    try { const r = await crawlOne(p); if (r.coaches?.ok || Object.values(r.seasons).some((s) => s?.ok)) ok++; } catch (e) { console.error(`  ${p.school_name}: ${e.message}`); }
    if (++done % 10 === 0) console.log(`  ${done}/${programs.length} done (${ok} with data)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`finished: ${done} programs, ${ok} with at least some data. Cache: ${CACHE}`);
