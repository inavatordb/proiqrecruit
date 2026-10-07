import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createStore } from './store.mjs';
import { mountRecruiting } from './recruiting/routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
const DIST = path.join(here, '..', 'dist');
const SITE_ORIGIN = (process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
// Admins come from the environment and nowhere else. No variable = no admins.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!ADMIN_EMAILS.length) console.warn('[admin] ADMIN_EMAILS is not set -- nobody has admin rights.');

const store = await createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: DATA_DIR });
const { loadEntity, persistEntity, flush } = store;
if (store.mode === 'postgres') console.log('[store] PostgreSQL');
else {
  console.warn('[store] DATABASE_URL not set -- using local JSON files in ' + DATA_DIR + ' (development only).');
  if (process.env.RENDER) console.error('[store] RUNNING ON RENDER WITHOUT DATABASE_URL: all data is lost on every deploy. Set DATABASE_URL.');
}
const now = () => new Date().toISOString();
const newId = (p) => `${p}_${crypto.randomBytes(9).toString('hex')}`;

/* ---------------------------------- auth ---------------------------------- */
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') });
const tokens = () => loadEntity('_AuthToken');
const bearer = (req) => { const a = req.headers.authorization || ''; return a.startsWith('Bearer ') ? a.slice(7) : null; };
const isAdminUser = (u) => !!u && ADMIN_EMAILS.includes((u.email || '').toLowerCase());

function userForRequest(req) {
  const t = bearer(req);
  const row = t && tokens().get(t);
  return row ? loadEntity('User').get(row.user_id) || null : null;
}
const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, created_date: u.created_date, role: isAdminUser(u) ? 'admin' : 'user' });
function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens().set(token, { id: token, user_id: userId, created_date: now() });
  persistEntity('_AuthToken');
  return token;
}

// Brute-force guard for credential endpoints: 10 attempts / 10 min per IP+email.
const attempts = new Map();
function throttled(key) {
  const t = Date.now(); const rec = attempts.get(key);
  if (!rec || rec.reset < t) { attempts.set(key, { n: 1, reset: t + 600_000 }); return false; }
  rec.n++; return rec.n > 10;
}

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// A write is acknowledged only after it is durable: wait for the store to flush before replying.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const json = res.json.bind(res);
  res.json = (body) => { flush().then(() => json(body), (e) => { console.error('[store] flush failed:', e.message); res.status(503); json({ error: 'Could not save. Please try again.' }); }); return res; };
  next();
});

app.get('/api/health', async (_req, res) => {
  try { await store.ping(); res.json({ ok: true, storage: store.mode, time: now() }); } catch (e) { res.status(503).json({ ok: false, storage: store.mode, error: 'database unreachable' }); }
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, full_name } = req.body || {};
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || String(password || '').length < 6) return res.status(400).json({ error: 'A valid email and a password of 6+ characters are required.' });
  if (throttled(`reg:${req.ip}`)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const users = loadEntity('User');
  if ([...users.values()].some((u) => u.email === mail)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const { salt, hash } = hashPassword(password);
  const user = { id: newId('usr'), email: mail, full_name: String(full_name || mail.split('@')[0]).slice(0, 80), password_hash: hash, password_salt: salt, created_date: now() };
  users.set(user.id, user); persistEntity('User');
  res.status(201).json({ token: issueToken(user.id), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const mail = String(req.body?.email || '').trim().toLowerCase();
  if (throttled(`login:${req.ip}:${mail}`)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const user = [...loadEntity('User').values()].find((u) => u.email === mail);
  const ok = user && crypto.timingSafeEqual(Buffer.from(hashPassword(req.body?.password, user.password_salt).hash), Buffer.from(user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: issueToken(user.id), user: publicUser(user) });
});

app.get('/api/auth/me', (req, res) => {
  const u = userForRequest(req);
  return u ? res.json(publicUser(u)) : res.status(401).json({ error: 'Not authenticated' });
});

app.post('/api/auth/logout', (req, res) => {
  const t = bearer(req);
  if (t && tokens().delete(t)) persistEntity('_AuthToken');
  res.json({ ok: true });
});

/* ------------------------------- recruiting ------------------------------- */
const recruiting = mountRecruiting(app, {
  userForRequest, isAdminUser, isImpersonating: () => false, loadEntity, persistEntity, reload: store.reload,
  seedDir: path.join(here, 'seeds', 'recruiting'),
});

/* ------------------------- share previews (OG tags) ------------------------ */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const template = () => { try { return fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'); } catch { return null; } };

// A private or unknown profile gets the plain page: nothing about it reaches a crawler.
const share = (describe) => (req, res, next) => {
  const html = template();
  if (!html) return next();
  let card = null;
  try { card = describe(req); } catch { card = null; }
  res.set('Cache-Control', 'no-cache');
  if (!card) return res.send(html);
  const meta = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(card.title)}" />
    <meta property="og:description" content="${esc(card.description)}" />
    <meta property="og:url" content="${esc(SITE_ORIGIN + req.path)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(card.title)}" />
    <meta name="twitter:description" content="${esc(card.description)}" />
  </head>`;
  return res.send(html.replace(/<title>.*?<\/title>/s, `<title>${esc(card.title)}</title>`).replace('</head>', meta));
};
app.get('/schools/:slug', share((req) => {
  const d = recruiting.detail(req.params.slug); if (!d) return null;
  const p = d.program;
  return { title: `${p.school_name} Women's Soccer — Recruiting Profile`, description: `${p.division_label}${p.conference ? ` · ${p.conference}` : ''}. Coaches, recent results, rankings and camps.` };
}));
app.get('/camps/:id', share((req) => {
  const c = recruiting.campDetail(req.params.id);
  return c ? { title: `${c.camp_name}${c.program ? ` — ${c.program.school_name}` : ''}`, description: `Official university camp on ${c.camp_date}${c.location ? ` · ${c.location}` : ''}.` } : null;
}));
app.get('/player/:slug', share((req) => {
  const p = recruiting.sharedProfile(req.params.slug, req.query.t);
  return p ? { title: `${p.name}${p.grad_year ? ` · Class of ${p.grad_year}` : ''} — Soccer Recruiting Profile`, description: [p.positions?.join('/'), p.club, p.state].filter(Boolean).join(' · ') || "Women's soccer recruiting profile." } : null;
}));

/* ------------------------------ static / spa ------------------------------ */
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

try {
  const seeded = recruiting.bootstrap();
  if (seeded.loaded.length) console.log('[recruiting] seeded', JSON.stringify(seeded.loaded));
} catch (e) { console.error('[recruiting] seed failed:', e?.message || e); }
await flush();

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Recruit on :${PORT} (data: ${DATA_DIR})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await store.close().catch(() => {}); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
