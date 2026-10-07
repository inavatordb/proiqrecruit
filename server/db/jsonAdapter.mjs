import fs from 'node:fs';
import path from 'node:path';

/**
 * Local-development adapter: one JSON file per entity under DATA_DIR.
 * NOT for production -- Render's free filesystem is wiped on every deploy.
 */
export function createJsonAdapter(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = (name) => path.join(dataDir, `${name}.json`);
  return {
    kind: 'json',
    async load() {
      const out = new Map();
      for (const f of fs.readdirSync(dataDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const rows = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
          out.set(f.slice(0, -5), rows.filter((r) => r && r.id != null));
        } catch (e) { console.warn(`[store] could not read ${f}: ${e.message}`); }
      }
      return out;
    },
    async save(entity, { all }) {
      const tmp = `${file(entity)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...all.values()]));
      fs.renameSync(tmp, file(entity));
      return { failed: [] };
    },
    async ping() { return true; },
    async close() {},
  };
}
