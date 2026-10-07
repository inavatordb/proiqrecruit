import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies every unapplied `NNN_name.sql` in order, each in its own transaction. Safe to run on every boot. */
export async function runMigrations(db, log = console.log) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    applied.push(f);
    log(`[db] applied migration ${f}`);
  }
  return applied;
}
