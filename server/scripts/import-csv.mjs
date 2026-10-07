/**
 * Import a researched CSV into the recruiting database.
 *
 *   npm run import:programs -- --file data/import/programs.csv --dry-run
 *   npm run import:programs -- --file data/import/programs.csv
 *
 * Kinds: programs, coaches, seasons, rankings, camps, id-camps, conference-history
 * Flags: --file <path>   --dry-run   --overwrite-verified   --verbose   --actor <name>
 *
 * Uses the same database as the app: DATABASE_URL -> PostgreSQL, otherwise the local JSON store.
 * If you run this against a database a live server is using, press "Reload from database"
 * in Admin > Imports (or restart the service) so the server picks the new rows up.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createStore } from '../store.mjs';
import { createRecruitingService } from '../recruiting/service.mjs';
import { KINDS } from '../recruiting/core.mjs';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const kind = (args[0] || '').replace(/-/g, '_').replace('id_camps', 'idcamps');
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };

if (!KINDS[kind] || kind === 'sources') die(`Usage: import-csv.mjs <programs|coaches|seasons|rankings|camps|id-camps|conference-history> --file <csv> [--dry-run]`);
const file = opt('file'); if (!file) die('--file <path to csv> is required.');
if (!fs.existsSync(file)) die(`File not found: ${file}`);
const dryRun = flag('dry-run');
const csv = fs.readFileSync(file, 'utf8');

const store = await createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.DATA_DIR || './data', log: { log() {}, error: console.error, warn: console.warn } });
const svc = createRecruitingService({ loadEntity: store.loadEntity, persistEntity: store.persistEntity, seedDir: null });
console.log(`${KINDS[kind].label} — ${path.basename(file)} — ${dryRun ? 'DRY RUN (nothing written)' : 'IMPORT'} — storage: ${store.mode}`);

let plan; let code = 0;
try {
  const overwriteVerified = flag('overwrite-verified');
  if (dryRun) plan = svc.previewImport(kind, csv, { overwriteVerified });
  else {
    const r = svc.commitImport(kind, csv, { overwriteVerified, actor: opt('actor') || 'cli', filename: path.basename(file) });
    plan = r.plan;
    await store.flush();
  }
} catch (e) { await store.close(); die(`Import failed: ${e.message}`); }

const c = plan.columns || {};
if (c.missing?.length) console.log(`  BLOCKED — missing required column(s): ${c.missing.join('; ')}`);
if (c.unknown?.length) console.log(`  note: unrecognised column(s) ignored: ${c.unknown.join(', ')}`);
for (const n of c.notes || []) console.log(`  note: ${n}`);
const s = plan.summary;
console.log(`  ${s.new} new | ${s.updated} updated | ${s.skipped} skipped | ${s.errors} errors | ${s.review} need review | ${s.warnings} with warnings` + (kind === 'coaches' ? ` | ${s.missing_email} missing email` : ''));

const show = plan.items.filter((i) => i.action === 'error' || i.action === 'review' || (flag('verbose') && (i.messages || []).length));
for (const i of show.slice(0, flag('verbose') ? 1000 : 40)) console.log(`   line ${i.line} [${i.action}] ${i.label}: ${(i.messages || []).join(' · ')}`);
if (show.length > 40 && !flag('verbose')) console.log(`   … ${show.length - 40} more (use --verbose)`);

if (s.errors || plan.blocked) code = 2;
if (!dryRun && !plan.blocked) console.log('  Done. Records are in the database.');
await store.close();
process.exit(code);
