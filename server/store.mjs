/**
 * Tiny entity store: one JSON file per entity under DATA_DIR, held in memory,
 * flushed atomically on a short debounce. `persistEntity` marks one dirty.
 * Swap this module for a real database when traffic justifies it -- the rest of
 * the server only uses loadEntity / persistEntity / flush.
 */
import fs from 'node:fs';
import path from 'node:path';

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const entities = new Map();
  const dirty = new Set();
  let timer = null;
  const file = (name) => path.join(dataDir, `${name}.json`);

  function loadEntity(name) {
    if (entities.has(name)) return entities.get(name);
    const m = new Map();
    try { for (const r of JSON.parse(fs.readFileSync(file(name), 'utf8'))) if (r && r.id != null) m.set(r.id, r); } catch { /* new entity */ }
    entities.set(name, m);
    return m;
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    const failed = [];
    for (const name of dirty) {
      try {
        const tmp = `${file(name)}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify([...entities.get(name).values()]));
        fs.renameSync(tmp, file(name));
      } catch (e) { failed.push(name); console.warn(`[store] ${name} not written (${e.code || e.message}); retrying`); }
    }
    dirty.clear();
    for (const n of failed) dirty.add(n);
    if (failed.length) timer = setTimeout(flush, 1000);
  }

  function persistEntity(name) {
    dirty.add(name);
    if (!timer) timer = setTimeout(flush, 300);
  }

  for (const f of fs.readdirSync(dataDir)) if (f.endsWith('.json')) loadEntity(f.slice(0, -5));
  return { loadEntity, persistEntity, flush, dataDir };
}
