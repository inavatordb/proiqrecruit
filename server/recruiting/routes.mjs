/**
 * Recruiting platform -- HTTP surface, mounted at /api/recruiting.
 *
 *   public     catalog reads (schools, camps, shared pages) -- no login
 *   /me/*      the signed-in player/family; every row is scoped to THEIR profile
 *   /admin/*   admin only
 *
 * None of the recruiting entities are reachable through the generic
 * /api/e/:name route (see RECRUITING_ENTITIES in core.mjs and entityGuard).
 */
import express from 'express';
import { createRecruitingService, httpErr } from './service.mjs';
import { KINDS, CSV_TEMPLATES_WITH_EXAMPLE, TEMPLATE_FILE, str } from './core.mjs';

export function mountRecruiting(app, deps) {
  const { userForRequest, isAdminUser, isImpersonating, loadEntity, persistEntity, seedDir } = deps;
  const svc = createRecruitingService({ loadEntity, persistEntity, seedDir });
  const router = express.Router();

  /* -- tiny in-memory rate limit: protects write paths from a runaway client -- */
  const hits = new Map();
  const limit = (max, windowMs = 60_000) => (req, res, next) => {
    const key = `${req.user?.id || req.ip}:${req.baseUrl}${req.route?.path || ''}`;
    const t = Date.now();
    const rec = hits.get(key) && hits.get(key).reset > t ? hits.get(key) : { n: 0, reset: t + windowMs };
    rec.n++; hits.set(key, rec);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
    if (rec.n > max) return res.status(429).json({ error: 'Too many requests. Slow down a moment.' });
    return next();
  };

  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error('[recruiting]', e);
      res.status(status).json({ error: status === 500 ? 'Something went wrong.' : e.message });
    }
  };

  router.use((req, _res, next) => { req.user = userForRequest(req) || null; next(); });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const needUser = (req) => {
    if (!req.user) throw httpErr(401, 'Sign in to continue.');
    return req.user;
  };
  const needPlayer = (req) => {
    const u = needUser(req);
    const p = svc.profileFor(u, { create: false });
    if (p?.disabled) throw httpErr(403, 'This recruiting account has been disabled. Contact support.');
    return u;
  };
  const writer = (req) => {
    const u = needPlayer(req);
    if (isImpersonating?.(req)) throw httpErr(403, 'Changes cannot be made while viewing as another user.');
    return u;
  };
  const needAdmin = (req) => {
    const u = needUser(req);
    if (!isAdminUser(u)) throw httpErr(403, 'Admin access required.');
    return u;
  };

  /* ------------------------------------ public ----------------------------------- */
  router.get('/meta', wrap(() => svc.meta()));
  router.get('/programs', wrap((req) => svc.search(req.query, { admin: false })));
  router.get('/programs/compare', wrap((req) => ({ programs: svc.compare(String(req.query.ids || '').split(',').filter(Boolean)) })));
  router.get('/programs/:slug', wrap((req) => {
    const d = svc.detail(req.params.slug, { sport: str(req.query.sport || 'womens-soccer', 40), admin: !!(req.user && isAdminUser(req.user) && req.query.admin === '1') });
    if (!d) throw httpErr(404, 'School not found.');
    if (req.user) { svc.noteView(req.user, d.program.id); d.workspace = svc.programWorkspace(req.user, d.program.id); }
    d.viewer = { signed_in: !!req.user, is_admin: !!(req.user && isAdminUser(req.user)) };
    return d;
  }));
  router.get('/camps', wrap((req) => svc.listCamps(req.query)));
  router.get('/camps/:id', wrap((req) => { const c = svc.campDetail(req.params.id); if (!c) throw httpErr(404, 'Camp not found.'); return c; }));
  router.get('/share/player/:slug', wrap((req) => { const p = svc.sharedProfile(req.params.slug, req.query.t); if (!p) throw httpErr(404, 'This profile is private or does not exist.'); return p; }));
  router.get('/share/list/:token', wrap((req) => { const p = svc.sharedList(req.params.token); if (!p) throw httpErr(404, 'This list is not shared.'); return p; }));

  /* ------------------------------------ player ------------------------------------ */
  const mine = express.Router();
  mine.use(limit(240));
  mine.get('/profile', wrap((req) => ({ profile: svc.profileFor(needPlayer(req)) })));
  mine.put('/profile', limit(40), wrap((req) => ({ profile: svc.saveProfile(writer(req), req.body || {}) })));
  mine.post('/profile/rotate-share-token', limit(10), wrap((req) => ({ profile: svc.rotateShareToken(writer(req)) })));
  mine.get('/dashboard', wrap((req) => svc.dashboard(needPlayer(req))));
  mine.post('/targets', limit(60), wrap((req) => ({ target: svc.addTarget(writer(req), str(req.body?.program_id, 120), req.body?.stage) })));
  mine.patch('/targets/:id', limit(120), wrap((req) => ({ target: svc.updateTarget(writer(req), req.params.id, req.body || {}) })));
  mine.delete('/targets/:id', limit(60), wrap((req) => ({ ok: svc.removeTarget(writer(req), req.params.id) })));
  mine.post('/notes', limit(60), wrap((req) => ({ note: svc.addNote(writer(req), str(req.body?.program_id, 120), req.body?.body, req.body?.pinned) })));
  mine.patch('/notes/:id', limit(60), wrap((req) => ({ note: svc.updateNote(writer(req), req.params.id, req.body || {}) })));
  mine.delete('/notes/:id', limit(60), wrap((req) => ({ ok: svc.deleteNote(writer(req), req.params.id) })));
  mine.post('/contacts', limit(60), wrap((req) => ({ contact: svc.addContact(writer(req), str(req.body?.program_id, 120), req.body || {}) })));
  mine.patch('/contacts/:id', limit(60), wrap((req) => ({ contact: svc.updateContact(writer(req), req.params.id, req.body || {}) })));
  mine.delete('/contacts/:id', limit(60), wrap((req) => ({ ok: svc.deleteContact(writer(req), req.params.id) })));
  mine.post('/camps', limit(60), wrap((req) => ({ camp: svc.trackCamp(writer(req), req.body || {}) })));
  mine.delete('/camps/:id', limit(60), wrap((req) => ({ ok: svc.deleteCampTrack(writer(req), req.params.id) })));
  router.use('/me', mine);

  /* ------------------------------------- admin ------------------------------------ */
  const admin = express.Router();
  admin.use(limit(600));
  admin.get('/stats', wrap((req) => { needAdmin(req); return svc.stats(); }));
  admin.get('/players', wrap((req) => { needAdmin(req); return { players: svc.adminPlayers() }; }));
  admin.patch('/players/:id', wrap((req) => { needAdmin(req); return { player: svc.adminSetPlayerDisabled(req.params.id, !!req.body?.disabled) }; }));
  admin.get('/users', wrap((req) => {
    needAdmin(req);
    const profiles = new Map(svc.rows('RecruitPlayerProfile').map((p) => [p.owner_user_id, p]));
    const users = [...loadEntity('User').values()].map((u) => ({
      id: u.id, email: u.email, full_name: u.full_name, created_date: u.created_date, is_admin: isAdminUser(u), has_recruiting_profile: profiles.has(u.id), profile_privacy: profiles.get(u.id)?.privacy || null,
    }));
    return { users: users.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')).slice(0, 500) };
  }));
  admin.get('/imports', wrap((req) => { needAdmin(req); return { imports: svc.rows('RecruitImport').sort((a, b) => b.created_date.localeCompare(a.created_date)).slice(0, 50), templates: CSV_TEMPLATES_WITH_EXAMPLE, template_files: TEMPLATE_FILE }; }));
  admin.post('/import/:kind', limit(30), wrap((req) => {
    const u = needAdmin(req);
    const { csv, commit, overwrite_verified: ow, filename } = req.body || {};
    if (typeof csv !== 'string' || !csv.trim()) throw httpErr(400, 'Provide the CSV text.');
    if (!KINDS[req.params.kind]) throw httpErr(404, 'Unknown import kind.');
    return commit
      ? svc.commitImport(req.params.kind, csv, { overwriteVerified: !!ow, actor: u.email, filename: str(filename, 160) })
      : { plan: svc.previewImport(req.params.kind, csv, { overwriteVerified: !!ow }) };
  }));
  admin.post('/bootstrap', limit(5), wrap((req) => { needAdmin(req); return svc.bootstrap(); }));
  // Re-read the database (e.g. after the import CLI wrote to it) so this running server sees the new rows.
  admin.post('/reload', limit(5), wrap(async (req) => { needAdmin(req); await deps.reload?.(); svc.refresh(); return { ok: true }; }));
  admin.get('/:kind', wrap((req) => { needAdmin(req); return svc.adminList(req.params.kind, req.query); }));
  admin.get('/:kind/:id', wrap((req) => {
    needAdmin(req);
    const rec = svc.getRow(KINDS[req.params.kind]?.entity || '_', req.params.id);
    if (!rec) throw httpErr(404, 'Not found.');
    return rec;
  }));
  admin.post('/:kind', limit(120), wrap((req) => { const u = needAdmin(req); return svc.adminSave(req.params.kind, req.body || {}, null, u.email); }));
  admin.patch('/:kind/:id', limit(240), wrap((req) => {
    const u = needAdmin(req);
    if (req.params.kind === 'sources') return svc.adminSourceNote(req.params.id, req.body || {});
    return svc.adminSave(req.params.kind, req.body || {}, req.params.id, u.email);
  }));
  admin.post('/:kind/:id/status', limit(240), wrap((req) => { const u = needAdmin(req); return svc.adminSetStatus(req.params.kind, req.params.id, req.body?.status, u.email); }));
  admin.delete('/:kind/:id', limit(120), wrap((req) => { needAdmin(req); return { ok: svc.adminDelete(req.params.kind, req.params.id) }; }));
  router.use('/admin', admin);

  app.use('/api/recruiting', router);
  return svc;
}
