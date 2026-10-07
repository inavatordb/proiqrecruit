import { ENTITIES, BY_ENTITY, ENTITY_ORDER } from './schema.mjs';

const colValue = (v) => (v === '' || v === undefined || (typeof v === 'object' && v !== null) ? null : v);
const asDate = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const parseData = (d) => (typeof d === 'string' ? JSON.parse(d) : d);

/**
 * Postgres adapter. Knows SQL; knows nothing about the app. The store hands it
 * diffs (rows to upsert, ids to delete) and it applies them.
 *
 * Each row is applied under its own SAVEPOINT so one bad row (a constraint
 * violation) is reported in `failed` instead of poisoning the whole batch.
 */
export function createPgAdapter(db) {
  const sqlFor = (spec) => {
    const names = spec.cols.map(([c]) => c);
    const cols = ['id', ...names, 'data', 'created_at', 'updated_at'];
    const upd = [...names, 'data'].map((c) => `${c} = EXCLUDED.${c}`).concat('updated_at = now()');
    // updated_at is generated in SQL, so it takes no parameter slot.
    const params = cols.filter((c) => c !== 'updated_at');
    const placeholders = [];
    let n = 0;
    for (const c of cols) {
      if (c === 'updated_at') { placeholders.push('now()'); continue; }
      n++;
      placeholders.push(c === 'data' ? `$${n}::jsonb` : c === 'created_at' ? `COALESCE($${n}::timestamptz, now())` : `$${n}`);
    }
    return {
      text: `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${upd.join(', ')}`,
      params,
    };
  };
  const compiled = new Map(ENTITIES.map((s) => [s.entity, sqlFor(s)]));

  return {
    kind: 'postgres',

    /** Every row of every known entity: Map<entityName, row[]> */
    async load() {
      const out = new Map();
      for (const spec of ENTITIES) {
        const rows = await db.query(`SELECT data FROM ${spec.table}`);
        out.set(spec.entity, rows.map((r) => parseData(r.data)));
      }
      return out;
    },

    /** Applies a diff. Returns { failed: [{id, error}] }. Upserts go parents-first. */
    async save(entity, { upserts = [], deletes = [] }) {
      const spec = BY_ENTITY.get(entity);
      if (!spec) throw new Error(`No table is mapped for entity "${entity}"`);
      const failed = [];
      const { text, params } = compiled.get(entity);
      await db.tx(async (t) => {
        for (const rec of upserts) {
          const values = params.map((c) => {
            if (c === 'id') return rec.id;
            if (c === 'data') return JSON.stringify(rec);
            if (c === 'created_at') return asDate(rec.created_date);
            const field = spec.cols.find(([col]) => col === c)[1];
            return colValue(rec[field]);
          });
          await t.exec('SAVEPOINT row_sp');
          try { await t.query(text, values); await t.exec('RELEASE SAVEPOINT row_sp'); } catch (e) {
            await t.exec('ROLLBACK TO SAVEPOINT row_sp');
            failed.push({ id: rec.id, error: e.message });
          }
        }
        for (const id of deletes) await t.query(`DELETE FROM ${spec.table} WHERE id = $1`, [id]);
      });
      return { failed };
    },

    async ping() { await db.query('SELECT 1'); return true; },
    close: () => db.close(),
  };
}

export { ENTITY_ORDER };
