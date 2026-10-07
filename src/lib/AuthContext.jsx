import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth, getToken } from '@/api/client';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setLoading] = useState(true);

  const checkAppState = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try { setUser(await auth.me()); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { checkAppState(); }, [checkAppState]);

  const logout = async () => { await auth.logout(); setUser(null); window.location.assign('/'); };

  return <Ctx.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth, checkAppState, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
};
