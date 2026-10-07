import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectPglite } from './connect.mjs';
import { createStore } from '../store.mjs';
import { createRecruitingService } from '../recruiting/service.mjs';
import { ENTITIES } from './schema.mjs';

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const quiet = { log() {}, error() {}, warn() {} };
const A = { id: 'u_a', email: 'a@x.com' };
const B = { id: 'u_b', email: 'b@x.com' };

async function boot(db) {
  const store = await createStore({ db, log: quiet });
  const svc = createRecruitingService({ loadEntity: store.loadEntity, persistEntity: store.persistEntity, seedDir });
  return { store, svc };
}

describe('postgres storage (PGlite = real Postgres)', () => {
  it('creates every mapped table + the pipeline view, and survives a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgl-'));
    let db = await connectPglite(dir);
    let { store, svc } = await boot(db);

    for (const e of ENTITIES) await db.query(`SELECT 1 FROM ${e.table} LIMIT 1`);
    await db.query('SELECT * FROM recruiting_pipeline LIMIT 1');

    // users + a player's private data, written through the store
    store.loadEntity('User').set('u_a', { id: 'u_a', email: 'a@x.com', password_hash: 'h', password_salt: 's', created_date: new Date().toISOString() });
    store.loadEntity('User').set('u_b', { id: 'u_b', email: 'b@x.com', password_hash: 'h', password_salt: 's', created_date: new Date().toISOString() });
    store.persistEntity('User');
    svc.bootstrap();
    const prog = svc.search({ q: 'Stanford' }).results[0];
    svc.saveProfile(A, { first_name: 'Ava', last_name: 'Stone', grad_year: 2028, state: 'CA', privacy: 'unlisted' });
    svc.addTarget(A, prog.id);
    svc.addNote(A, prog.id, 'Liked campus');
    svc.addContact(A, prog.id, { summary: 'Emailed coach', kind: 'outreach' });
    await store.flush();

    const counts = Object.fromEntries(await Promise.all(['college_programs', 'saved_schools', 'recruiting_notes', 'coach_communications', 'program_seasons'].map(async (t) => [t, Number((await db.query(`SELECT count(*)::int AS n FROM ${t}`))[0].n)])));
    expect(counts.college_programs).toBeGreaterThan(600);
    expect(counts.saved_schools).toBe(1);
    expect(counts.recruiting_notes).toBe(1);
    expect(counts.program_seasons).toBeGreaterThan(150);
    // saved school references the global program rather than copying it
    const link = await db.query('SELECT s.program_id, p.slug FROM saved_schools s JOIN college_programs p ON p.id = s.program_id');
    expect(link[0].slug).toBe('stanford');
    expect((await db.query('SELECT stage FROM recruiting_pipeline'))[0].stage).toBe('contacted');
    // passwords are never plaintext in the table
    expect(JSON.stringify(await db.query('SELECT data FROM users'))).not.toMatch(/secret12/);

    // --- "redeploy": brand-new process, same database ---
    await store.close();
    db = await connectPglite(dir);
    ({ store, svc } = await boot(db));
    expect(svc.search({ q: 'Stanford' }).total).toBe(1);
    const ws = svc.programWorkspace(A, prog.id);
    expect(ws.notes[0].body).toBe('Liked campus');
    expect(ws.target.stage).toBe('contacted');
    expect(svc.profileFor(A, { create: false }).grad_year).toBe(2028);
    // isolation still holds after reload
    expect(svc.programWorkspace(B, prog.id).notes).toHaveLength(0);
    expect(svc.dashboard(B).cards).toHaveLength(0);

    // deletes reach the database too
    const note = ws.notes[0];
    svc.deleteNote(A, note.id);
    await store.flush();
    expect((await db.query('SELECT count(*)::int AS n FROM recruiting_notes'))[0].n).toBe(0);

    // admin delete of a program cascades cleanly
    const tgt = svc.programWorkspace(A, prog.id).target;
    svc.removeTarget(A, tgt.id);
    svc.addContact(B, prog.id, { summary: 'orphan check' });
    svc.adminDelete('programs', prog.id);
    await store.flush();
    expect((await db.query('SELECT count(*)::int AS n FROM college_programs WHERE id = $1', [prog.id]))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM coach_communications'))[0].n).toBe(0);
    await store.close();
  }, 120_000);

  it('rejects a bad row without losing the rest', async () => {
    const db = await connectPglite();
    const { store } = await boot(db);
    store.loadEntity('User').set('u1', { id: 'u1', email: 'dup@x.com' });
    store.loadEntity('User').set('u2', { id: 'u2', email: 'dup@x.com' }); // violates UNIQUE(email)
    store.loadEntity('User').set('u3', { id: 'u3', email: 'ok@x.com' });
    store.persistEntity('User');
    await store.flush();
    const ids = (await db.query('SELECT id FROM users ORDER BY id')).map((r) => r.id);
    expect(ids).toEqual(['u1', 'u3']);
    await store.close();
  });
});

describe('json fallback (no DATABASE_URL)', () => {
  it('persists to files and reloads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsn-'));
    let s = await createStore({ dataDir: dir, log: quiet });
    expect(s.mode).toBe('json');
    s.loadEntity('User').set('u1', { id: 'u1', email: 'x@x.com' });
    s.persistEntity('User');
    await s.flush();
    s = await createStore({ dataDir: dir, log: quiet });
    expect(s.loadEntity('User').get('u1').email).toBe('x@x.com');
  });
});
