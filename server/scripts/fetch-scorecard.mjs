/**
 * Downloads basic institution facts from the U.S. Department of Education College Scorecard API (public federal data) into
 * data/import/scorecard/pages/page-N.json, one file per 100 schools, resumable.
 *
 *   node server/scripts/fetch-scorecard.mjs            # uses SCORECARD_API_KEY if set, else the public DEMO_KEY (10 requests/hour)
 *
 * Fields: name, city, state, ownership (public/private), enrollment, overall admission rate, average SAT, ACT midpoint, school url.
 * Scorecard publishes no "typical GPA", so that field is never filled from here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(root, 'data', 'import', 'scorecard', 'pages');
fs.mkdirSync(DIR, { recursive: true });
const KEY = process.env.SCORECARD_API_KEY || 'DEMO_KEY';
const FIELDS = ['id', 'school.name', 'school.city', 'school.state', 'school.ownership', 'school.school_url', 'latest.student.size',
  'latest.admissions.admission_rate.overall', 'latest.admissions.sat_scores.average.overall', 'latest.admissions.act_scores.midpoint.cumulative'].join(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let total = Infinity;
for (let page = 0; page * 100 < total; page++) {
  const file = path.join(DIR, `page-${page}.json`);
  if (fs.existsSync(file)) { total = JSON.parse(fs.readFileSync(file, 'utf8')).metadata.total; continue; }
  const url = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${KEY}&school.operating=1&school.degrees_awarded.predominant=3&per_page=100&page=${page}&sort=id&fields=${FIELDS}`;
  for (;;) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (res.status === 429) { console.log(`page ${page}: rate limited, waiting 10 minutes`); await sleep(10 * 60 * 1000); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
    const body = await res.json();
    fs.writeFileSync(file, JSON.stringify(body));
    total = body.metadata.total;
    console.log(`page ${page} saved (${body.results.length} schools, ${total} total)`);
    break;
  }
  await sleep(1000);
}
console.log('done');
