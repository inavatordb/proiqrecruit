/**
 * The storage abstraction the whole server uses:
 *
 *   const store = await createStore({ databaseUrl, dataDir });
 *   store.loadEntity(name)     -> Map<id, record>   (synchronous, in memory)
 *   store.persistEntity(name)  -> marks the entity changed
 *   store.flush()              -> resolves once every change is durably written
 *
 * Application code mutates the Maps and calls persistEntity -- it never sees SQL.
 * Underneath, an adapter makes it durable:
 *
 *   DATABASE_URL set    -> PostgreSQL (authoritative; schema in server/db/migrations)
 *   DATABASE_URL absent -> JSON files under DATA_DIR (local development ONLY)
 *
 * Postgres stays the source of truth: everything is read from it at boot, and
 * each flush writes only the rows that changed (diffed against what was last
 * saved) in dependency order. To move to another Postgres provider, change
 * DATABASE_URL. To change engines, write another adapter with load()/save().
 */
import { createJsonAdapter } from './db/jsonAdapter.mjs';
import { createPgAdapter } from './db/pgAdapter.mjs';
import { connectPg } from './db/connect.mjs';
import { runMigrations } from './db/migrate.mjs';
import { ENTITY_ORDER } from './db/schema.mjs';

const MAX_ROW_FAILURES = 3;

export async function createStore({ databaseUrl, dataDir, db, log = console } = {}) {
  let adapter; let closeDb = async () => {};
  if (db || databaseUrl) {
    const conn = db || await connectPg(databaseUrl, { ssl: process.env.DATABASE_SSL === 'false' ? false : undefined });
    await runMigrations(conn, (m) => log.log(m));
    adapter = createPgAdapter(conn);
    closeDb = () => conn.close();
  } else {
    adapter = createJsonAdapter(dataDir);
  }

  const entities = new Map();   // name -> Map<id, record>
  const saved = new Map();      // name -> Map<id, JSON string last written>
  const failures = new Map();   // `${name}:${id}` -> consecutive failure count
  const dirty = new Set();
  let timer = null;
  let chain = Promise.resolve();
  const debounceMs = adapter.kind === 'postgres' ? 100 : 300;

  const mapFor = (name) => { if (!entities.has(name)) entities.set(name, new Map()); return entities.get(name); };
  const loadEntity = mapFor;

  async function init() {
    const loaded = await adapter.load();
    for (const [name, rows] of loaded) {
      const m = mapFor(name); const snap = new Map();
      for (const r of rows) { m.set(r.id, r); snap.set(r.id, JSON.stringify(r)); }
      saved.set(name, snap);
    }
  }

  const orderOf = (n) => { const i = ENTITY_ORDER.indexOf(n); return i < 0 ? 999 : i; };

  async function flushOnce() {
    if (timer) { clearTimeout(timer); timer = null; }
    const names = [...dirty].sort((a, b) => orderOf(a) - orderOf(b));
    dirty.clear();
    const plan = names.map((name) => {
      const m = mapFor(name); const snap = saved.get(name) || new Map();
      const upserts = []; const next = new Map();
      for (const [id, rec] of m) {
        const s = JSON.stringify(rec);
        next.set(id, s);
        if (snap.get(id) !== s && (failures.get(`${name}:${id}`) || 0) < MAX_ROW_FAILURES) upserts.push(rec);
      }
      const deletes = [...snap.keys()].filter((id) => !m.has(id));
      return { name, m, snap, next, upserts, deletes };
    }).filter((p) => p.upserts.length || p.deletes.length);

    // Parents first for writes...
    for (const p of plan) {
      try {
        const { failed } = await adapter.save(p.name, { upserts: p.upserts, deletes: [], all: p.m });
        const bad = new Set(failed.map((f) => f.id));
        for (const f of failed) {
          const k = `${p.name}:${f.id}`; const n = (failures.get(k) || 0) + 1; failures.set(k, n);
          log.error(`[store] ${p.name} ${f.id} rejected (${n}/${MAX_ROW_FAILURES}): ${f.error}`);
        }
        for (const rec of p.upserts) if (!bad.has(rec.id)) { p.snap.set(rec.id, p.next.get(rec.id)); failures.delete(`${p.name}:${rec.id}`); }
        saved.set(p.name, p.snap);
      } catch (e) {
        dirty.add(p.name);
        log.error(`[store] ${p.name} not saved: ${e.message}`);
        throw e;
      }
    }
    // ...children first for deletes.
    for (const p of [...plan].reverse()) {
      if (!p.deletes.length) continue;
      try {
        await adapter.save(p.name, { upserts: [], deletes: p.deletes, all: p.m });
        for (const id of p.deletes) p.snap.delete(id);
      } catch (e) { dirty.add(p.name); log.error(`[store] ${p.name} delete failed: ${e.message}`); throw e; }
    }
  }

  /** Serialised: concurrent callers queue behind the in-flight write, then see their own changes written. */
  function flush() {
    const run = chain.then(flushOnce);
    chain = run.catch(() => {});
    return run;
  }

  function persistEntity(name) {
    dirty.add(name);
    if (!timer) timer = setTimeout(() => { timer = null; flush().catch(() => { retryLater(); }); }, debounceMs);
  }
  function retryLater() { if (!timer && dirty.size) timer = setTimeout(() => { timer = null; flush().catch(retryLater); }, 2000); }

  /**
   * Re-read everything from the database in place (same Map objects, so holders of loadEntity() results stay valid).
   * Used after something else wrote to the database -- e.g. the import CLI run against production.
   */
  async function reload() {
    await flush();
    const loaded = await adapter.load();
    for (const [name, rows] of loaded) {
      const m = mapFor(name); m.clear();
      const snap = new Map();
      for (const r of rows) { m.set(r.id, r); snap.set(r.id, JSON.stringify(r)); }
      saved.set(name, snap);
    }
    failures.clear();
  }

  await init();
  return {
    mode: adapter.kind, loadEntity, persistEntity, flush, reload, ping: () => adapter.ping(),
    async close() { await flush().catch(() => {}); await closeDb(); },
    adapter,
  };
}
