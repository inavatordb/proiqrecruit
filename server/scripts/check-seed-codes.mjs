/** Dev check: after loading all seeds, how many programs carry a stable code, and are any codes duplicated or rows rejected? */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRecruitingService } from '../recruiting/service.mjs';
import { parseCsv } from '../recruiting/core.mjs';

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const store = new Map();
const loadEntity = (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); };
const svc = createRecruitingService({ loadEntity, persistEntity() {}, seedDir });
svc.bootstrap();
const progs = svc.rows('CollegeProgram');
const withCode = progs.filter((p) => p.program_code);
const seen = new Map(); for (const p of withCode) seen.set(p.program_code, (seen.get(p.program_code) || 0) + 1);
console.log(`programs ${progs.length}, with stable code ${withCode.length}, duplicate codes ${[...seen].filter(([, n]) => n > 1).length}`);
const d1 = progs.filter((p) => p.division === 'D1');
console.log(`D1 ${d1.length}, D1 with code ${d1.filter((p) => p.program_code).length}, logos ${d1.filter((p) => p.logo_url).length}, athletics link ${d1.filter((p) => p.athletics_website).length}, soccer link ${d1.filter((p) => p.team_website).length}`);
console.log('D1 without code:', d1.filter((p) => !p.program_code).map((p) => p.school_name).join(', '));
// every seed row must have been accepted: compare file row counts with what a preview says
for (const f of fs.readdirSync(seedDir).filter((x) => (x.startsWith('programs-') || x.startsWith('conference_history-')) && x.includes('-other'))) {
  const kind = f.split('-')[0]; const rows = parseCsv(fs.readFileSync(path.join(seedDir, f), 'utf8'));
  const plan = svc.previewImport(kind, fs.readFileSync(path.join(seedDir, f), 'utf8'), { ignoreProvenance: true });
  console.log(`${f}: ${rows.length} rows; errors on re-preview: ${plan.summary.errors}; would change: ${plan.summary.new + plan.summary.updated}`);
  for (const i of plan.items.filter((x) => x.action === 'error').slice(0, 5)) console.log('   ', i.label, i.messages.join('; '));
}
const st = svc.stats(); console.log('conference history rows:', svc.rows('ProgramConferenceHistory').length);
