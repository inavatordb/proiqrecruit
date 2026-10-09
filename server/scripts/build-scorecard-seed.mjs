/**
 * College Scorecard pages (fetch-scorecard.mjs) -> server/seeds/recruiting/programs-scorecard.csv
 * Fills enrollment, acceptance rate and (when published) average SAT / ACT midpoint for each program. A school is matched only by an
 * exact normalized name within its state; anything else is listed in data/import/scorecard/REPORT.md and left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from '../recruiting/service.mjs';
import { stateAbbr } from '../recruiting/core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGES = path.join(root, 'data', 'import', 'scorecard', 'pages');
const SEEDS = path.join(root, 'server', 'seeds', 'recruiting');
const today = new Date().toISOString().slice(0, 10);

const norm = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[–—]/g, '-').replace(/[^a-z0-9 -]/g, ' ').replace(/\bthe\b/g, ' ').replace(/\s+/g, ' ').trim();
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const schools = [];
for (const f of fs.readdirSync(PAGES)) schools.push(...JSON.parse(fs.readFileSync(path.join(PAGES, f), 'utf8')).results);
const byKey = new Map();
for (const s of schools) {
  const k = `${s['school.state']}|${norm(s['school.name'])}`;
  byKey.set(k, [...(byKey.get(k) || []), s]);
}

const svc = createRecruitingService({ loadEntity: (() => { const m = new Map(); return (n) => { if (!m.has(n)) m.set(n, new Map()); return m.get(n); }; })(), persistEntity() {}, seedDir: SEEDS });
svc.bootstrap();
const rows = [['program_id', 'school_name', 'sport', 'gender', 'division', 'enrollment', 'acceptance_rate', 'academic_info', 'source_url', 'source_name', 'source_type', 'verified', 'notes']];
const missed = []; let matched = 0;
for (const p of svc.rows('CollegeProgram').filter((x) => x.active !== false).sort((a, b) => a.school_name.localeCompare(b.school_name))) {
  const st = stateAbbr(p.state) || p.state;
  const hits = [p.official_school_name, p.school_name].filter(Boolean).flatMap((n) => byKey.get(`${st}|${norm(n)}`) || []);
  const uniq = [...new Map(hits.map((h) => [h.id, h])).values()];
  if (uniq.length !== 1) { missed.push(`${p.school_name} (${p.state}) — ${uniq.length ? 'ambiguous' : 'no exact name match'}`); continue; }
  const s = uniq[0]; matched++;
  const size = s['latest.student.size']; const rate = s['latest.admissions.admission_rate.overall'];
  const sat = s['latest.admissions.sat_scores.average.overall']; const act = s['latest.admissions.act_scores.midpoint.cumulative'];
  const info = [sat ? `Average SAT ${sat}` : '', act ? `ACT midpoint ${act}` : ''].filter(Boolean).join(' · ');
  if (!size && rate == null && !info) { missed.push(`${p.school_name} — Scorecard has no figures`); continue; }
  rows.push([p.program_code || '', p.school_name, 'soccer', 'women', p.division, size || '', rate == null ? '' : +(rate * 100).toFixed(1),
    info ? `${info} (U.S. Dept. of Education College Scorecard).` : '', `https://collegescorecard.ed.gov/school/?${s.id}`,
    `College Scorecard, read ${today}`, 'other', 'no', '']);
}
fs.writeFileSync(path.join(SEEDS, 'programs-scorecard.csv'), rows.map((r) => r.map(csv).join(',')).join('\n') + '\n');
fs.writeFileSync(path.join(root, 'data', 'import', 'scorecard', 'REPORT.md'), `# College Scorecard academics (${today})\n\n${matched} programs matched an exact name + state; ${missed.length} not filled.\nTypical GPA is not published by Scorecard and is left blank.\n\n## Not filled\n${missed.map((m) => `- ${m}`).join('\n')}\n`);
console.log(`matched ${matched}, not filled ${missed.length}`);
