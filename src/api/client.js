const TOKEN_KEY = 'recruit_token';
const store = () => { try { return window.localStorage; } catch { return null; } };
export const getToken = () => { try { return store()?.getItem(TOKEN_KEY) || null; } catch { return null; } };
const setToken = (t) => { try { t ? store()?.setItem(TOKEN_KEY, t) : store()?.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const auth = {
  me: () => apiFetch('/api/auth/me'),
  async login(email, password) { const r = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setToken(r.token); return r.user; },
  async register(email, password, full_name) { const r = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name }) }); setToken(r.token); return r.user; },
  async logout() { try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* already gone */ } setToken(null); },
};
