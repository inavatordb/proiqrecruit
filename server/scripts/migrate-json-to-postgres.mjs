/**
 * Copies a local JSON data directory into PostgreSQL. JSON files are never modified or deleted.
 *
 *   DATABASE_URL=postgres://... node server/scripts/migrate-json-to-postgres.mjs [--dir ./data] [--dry-run]
 *
 * Per entity it reports: inserted (new id), updated (id exists, content differs),
 * skipped (identical), errors (rejected by the database, with the reason).
 * IDs are preserved. Safe to run repeatedly.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { connectPg } from '../db/connect.mjs';
import { runMigrations } from '../db/migrate.mjs';
import { createPgAdapter } from '../db/pgAdapter.mjs';
import { createJsonAdapter } from '../db/jsonAdapter.mjs';
import { ENTITY_ORDER, BY_ENTITY } from '../db/schema.mjs';

dotenv.config();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirIdx = args.indexOf('--dir');
const dir = path.resolve(dirIdx >= 0 ? args[dirIdx + 1] : process.env.DATA_DIR || './data');

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }

const db = await connectPg(process.env.DATABASE_URL);
await runMigrations(db);
const pg = createPgAdapter(db);
const [local, remote] = [await createJsonAdapter(dir).load(), await pg.load()];

let totals = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
const unmapped = [...local.keys()].filter((n) => !BY_ENTITY.has(n));
console.log(`Source: ${dir}${dryRun ? '  (dry run — nothing will be written)' : ''}`);

for (const name of ENTITY_ORDER) {
  const rows = local.get(name) || [];
  if (!rows.length) continue;
  const existing = new Map((remote.get(name) || []).map((r) => [r.id, JSON.stringify(r)]));
  const seen = new Set();
  const upserts = []; const r = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  for (const rec of rows) {
    if (seen.has(rec.id)) { r.skipped++; continue; } // duplicate id inside the file
    seen.add(rec.id);
    const prev = existing.get(rec.id);
    if (prev === undefined) { r.inserted++; upserts.push(rec); } else if (prev !== JSON.stringify(rec)) { r.updated++; upserts.push(rec); } else r.skipped++;
  }
  if (!dryRun && upserts.length) {
    // chunk so one huge entity never holds a single giant transaction
    for (let i = 0; i < upserts.length; i += 500) {
      const { failed } = await pg.save(name, { upserts: upserts.slice(i, i + 500), deletes: [] });
      for (const f of failed) {
        r.errors++; console.error(`  ERROR ${name} ${f.id}: ${f.error}`);
        const wasNew = !existing.has(f.id); if (wasNew) r.inserted--; else r.updated--;
      }
    }
  }
  console.log(`${name.padEnd(22)} inserted ${String(r.inserted).padStart(5)}  updated ${String(r.updated).padStart(5)}  skipped ${String(r.skipped).padStart(5)}  errors ${r.errors}`);
  for (const k of Object.keys(totals)) totals[k] += r[k];
}
if (unmapped.length) console.warn(`Not migrated (no table mapped): ${unmapped.join(', ')}`);
console.log(`TOTAL inserted ${totals.inserted}, updated ${totals.updated}, skipped ${totals.skipped}, errors ${totals.errors}`);
await db.close();
process.exit(totals.errors ? 2 : 0);
