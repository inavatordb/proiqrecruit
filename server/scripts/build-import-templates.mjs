/** Writes data/import/templates/*.csv from the single source of truth in server/recruiting/core.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE_HEADERS, TEMPLATE_EXAMPLES } from '../recruiting/core.mjs';

const dir = path.join(process.cwd(), 'data', 'import', 'templates');
fs.mkdirSync(dir, { recursive: true });
for (const [file, header] of Object.entries(TEMPLATE_HEADERS)) {
  fs.writeFileSync(path.join(dir, `${file}.csv`), `${header}\n${TEMPLATE_EXAMPLES[file]}\n`);
  console.log(`wrote data/import/templates/${file}.csv`);
}
