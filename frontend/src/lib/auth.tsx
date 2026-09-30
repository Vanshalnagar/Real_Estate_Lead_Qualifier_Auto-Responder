import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  providers: ('password' | 'google')[];
  createdAt: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  googleEnabled: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Customer session (httpOnly cookie set by the backend). Nothing sensitive is stored in the browser. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null; google: boolean }>('/auth/me');
      setUser(r.user);
      setGoogleEnabled(r.google);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', json: { email, password } });
    setUser(r.user);
    return r.user;
  }, []);
  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/register', { method: 'POST', json: { name, email, password } });
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, googleEnabled, refresh, login, register, logout }), [user, loading, googleEnabled, refresh, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
