/**
 * Thin driver wrappers. Both expose the same tiny interface so the adapter and
 * migrations never care which Postgres they are talking to:
 *
 *   db.query(sql, params) -> Promise<rows[]>
 *   db.exec(sql)          -> Promise<void>      (multi-statement, no params)
 *   db.tx(fn)             -> Promise<result>    (fn receives {query, exec})
 *   db.close()
 *
 * Production / Render: node-postgres via DATABASE_URL.
 * Tests / offline checks: PGlite (real Postgres compiled to WASM, in-process).
 */

export async function connectPg(databaseUrl, { ssl } = {}) {
  const { default: pg } = await import('pg');
  let useSsl = ssl;
  if (useSsl === undefined) {
    const host = (() => { try { return new URL(databaseUrl).hostname; } catch { return ''; } })();
    useSsl = !['localhost', '127.0.0.1', '::1', ''].includes(host);
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (e) => console.error('[db] idle client error:', e.message));
  const wrap = (c) => ({ query: async (s, p) => (await c.query(s, p)).rows, exec: async (s) => { await c.query(s); } });
  return {
    kind: 'postgres',
    ...wrap(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(wrap(c));
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

export async function connectPglite(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const wrap = (c) => ({ query: async (s, p) => (await c.query(s, p)).rows, exec: async (s) => { await c.exec(s); } });
  return { kind: 'pglite', ...wrap(pg), tx: (fn) => pg.transaction((t) => fn(wrap(t))), close: () => pg.close() };
}
