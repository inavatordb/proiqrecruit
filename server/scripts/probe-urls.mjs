/** Probe every URL in the supplied ACC CSVs. Prints status per URL so dead/invented links are visible. */
import fs from 'node:fs';
import { parseCsv } from '../recruiting/core.mjs';

const dir = 'data/import/acc/source';
const urls = new Map();
const add = (u, where) => { if (/^https?:/.test(u || '')) { if (!urls.has(u)) urls.set(u, new Set()); urls.get(u).add(where); } };
for (const r of parseCsv(fs.readFileSync(`${dir}/gemini_programs.csv`, 'utf8'))) for (const k of ['official_athletics_url', 'official_soccer_url', 'camps_url']) add(r[k], `programs.${k}`);
for (const r of parseCsv(fs.readFileSync(`${dir}/gemini_camps.csv`, 'utf8'))) add(r.registration_url, 'camps');
for (const r of parseCsv(fs.readFileSync(`${dir}/gemini_id_camp_appearances.csv`, 'utf8'))) add(r.event_url, 'id_events');

const results = [];
async function probe(u) {
  const t = async (method) => fetch(u, { method, redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProIQRecruitLinkCheck/1.0)' } });
  try {
    let res = await t('HEAD');
    if (res.status >= 400) res = await t('GET');
    return { u, status: res.status, final: res.url };
  } catch (e) { return { u, status: 'FAIL', err: e.cause?.code || e.message }; }
}
const list = [...urls.keys()];
for (let i = 0; i < list.length; i += 8) results.push(...await Promise.all(list.slice(i, i + 8).map(probe)));
const bucket = (s) => (s === 'FAIL' ? 'dead (DNS/connect)' : s < 400 ? 'ok' : [401, 403, 429].includes(s) ? 'blocked-by-bot-check' : 'broken (4xx/5xx)');
const tally = {};
for (const r of results) { const b = bucket(r.status); tally[b] = (tally[b] || 0) + 1; if (b !== 'ok') console.log(`${b.padEnd(22)} ${String(r.status).padEnd(5)} ${r.u}  [${[...urls.get(r.u)].join(',')}]`); }
console.log(tally, `of ${results.length}`);
fs.writeFileSync('data/import/acc/url-probe.json', JSON.stringify(results, null, 1));
