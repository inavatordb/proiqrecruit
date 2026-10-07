/**
 * Finds a logo image URL for each D1/D2 program from the lead image of its Wikipedia athletics page.
 *
 *   node server/scripts/build-recruiting-logos.mjs
 *
 * Writes server/seeds/recruiting/programs-logos.csv (logo_url only; blank = none found, never guessed).
 * An image is accepted only if its file name says it is a logo/wordmark -- so a stadium photo is never used.
 *
 * LICENSING: school logos are trademarks of the institutions, and most are non-free images on Wikipedia.
 * Hot-linking them is a convenience for development/beta. Before a commercial launch, replace logo_url with
 * assets you have permission to use (athletics media kits) -- the importer accepts a `logo_url` column.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../recruiting/core.mjs';

const SEEDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const UA = 'HoursOfGamesRecruiting/1.0 (darisbrownseo@gmail.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const programs = ['programs-d1.csv', 'programs-d2.csv'].flatMap((f) => parseCsv(fs.readFileSync(path.join(SEEDS, f), 'utf8')));
// Wikipedia athletics pages are "<School> <Nickname>" ("Duke Blue Devils"); try the short and the official name.
const candidates = (p) => [...new Set([`${p.school_name} ${p.nickname}`, `${p.official_school_name.replace(/^(The )?University of /i, '')} ${p.nickname}`, `${p.school_name} ${p.nickname.replace(/^Lady /, '')}`].map((t) => t.trim()))];

// Conference logos recolored for a school ("ACC logo in Duke colors") are NOT school logos.
const bad = (n) => /logo[_ ]in[_ ]|[_ ]colors?|conference|NCAA/i.test(n) || /(^|[_ ])(ACC|SEC|MAC|MW|Big[_ ]?(Ten|12|East|West|Sky|South)|Pac[_ ]?12)[_ ]/.test(n);
const found = new Map(); // title -> { logo, page }
async function lookup(titles) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=240&titles=${encodeURIComponent(titles.join('|'))}`;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const txt = await res.text();
    if (res.ok && txt.startsWith('{')) {
      const q = JSON.parse(txt).query || {};
      const alias = new Map();
      for (const k of ['normalized', 'redirects']) for (const r of q[k] || []) alias.set(r.from, r.to);
      const resolve = (t) => { let x = t; for (let n = 0; n < 3 && alias.has(x); n++) x = alias.get(x); return x; };
      const pages = new Map(Object.values(q.pages || {}).map((p) => [p.title, p]));
      for (const t of titles) {
        const p = pages.get(resolve(t));
        if (p?.thumbnail?.source && /logo|wordmark|athletic|mark|icon|seal/i.test(p.pageimage || '') && !bad(p.pageimage || '')) found.set(t, { logo: p.thumbnail.source, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` });
      }
      return;
    }
    await sleep(2000 * (i + 1));
  }
  console.warn('lookup failed for a batch');
}

const all = [...new Set(programs.flatMap(candidates))];
for (let i = 0; i < all.length; i += 40) { await lookup(all.slice(i, i + 40)); await sleep(300); }

// Second pass: pages with no lead image. List the page's files and take a logo file that names the school.
async function api(params) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?format=json&redirects=1&${params}`, { headers: { 'User-Agent': UA } });
    const txt = await res.text();
    if (res.ok && txt.startsWith('{')) return JSON.parse(txt);
    await sleep(2000 * (i + 1));
  }
  return null;
}
const token = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
for (const p of programs) {
  if (candidates(p).some((c) => found.has(c))) continue;
  const title = candidates(p)[0];
  const j = await api(`action=query&prop=images&imlimit=60&titles=${encodeURIComponent(title)}`); await sleep(200);
  const page = Object.values(j?.query?.pages || {})[0];
  const want = token(p.school_name.split(/[ (]/)[0]);
  const file = (page?.images || []).map((i) => i.title).find((n) => /logo|wordmark/i.test(n) && !bad(n) && !/nike|adidas|under armour|jumpman/i.test(n) && token(n).includes(want) && !/\.(jpg|jpeg)$/i.test(n));
  if (!file) continue;
  const info = await api(`action=query&prop=imageinfo&iiprop=url&iiurlwidth=240&titles=${encodeURIComponent(file)}`); await sleep(200);
  const thumb = Object.values(info?.query?.pages || {})[0]?.imageinfo?.[0]?.thumburl;
  if (thumb) found.set(title, { logo: thumb, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` });
}

const rows = []; let hit = 0;
for (const p of programs) {
  const t = candidates(p).find((c) => found.has(c));
  if (!t) continue;
  hit++;
  const { logo, page } = found.get(t);
  rows.push({ sport: 'soccer', gender: 'women', division: p.division, school_name: p.school_name, state: p.state, logo_url: logo, source_url: page, source_name: 'Wikipedia athletics page lead image (logo)', source_type: 'other', verified: 'no', notes: 'Logo is the institution\'s trademark; replace with licensed asset before commercial launch.' });
}
fs.writeFileSync(path.join(SEEDS, 'programs-logos.csv'), toCsv(rows));
console.log(`logos found for ${hit} of ${programs.length} programs (${Math.round((hit / programs.length) * 100)}%)`);
console.log('D1:', rows.filter((r) => r.division === 'D1').length, 'of', programs.filter((p) => p.division === 'D1').length, '| D2:', rows.filter((r) => r.division === 'D2').length, 'of', programs.filter((p) => p.division === 'D2').length);
console.log('ACC missing:', programs.filter((p) => p.conference === 'Atlantic Coast Conference' && !rows.some((r) => r.school_name === p.school_name)).map((p) => p.school_name).join(', ') || 'none');
