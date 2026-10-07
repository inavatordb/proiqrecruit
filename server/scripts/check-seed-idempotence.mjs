/** Dev check: loading the bundled seeds twice must write nothing the second time. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from '../recruiting/service.mjs';

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const store = new Map();
const loadEntity = (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); };
const svc = createRecruitingService({ loadEntity, persistEntity() {}, seedDir });
console.log('first ', JSON.stringify(svc.bootstrap().loaded));
console.log('second', JSON.stringify(svc.bootstrap().loaded));
const s = svc.stats();
console.log(`programs ${s.programs}, coaches ${s.coaches}, seasons ${s.seasons}, rankings ${s.rankings}, verified ${s.verified}`);
