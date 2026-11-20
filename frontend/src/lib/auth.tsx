import { useAuth as useClerkAuth, useUser } from '@clerk/react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthTokenGetter } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  providers: ('password' | 'google' | 'clerk')[];
  createdAt: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Synchronizes the Clerk session with the application's MongoDB customer record. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthTokenGetter(async () => (isLoaded && isSignedIn ? getToken() : null));
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded, isSignedIn]);

  const refresh = async () => {
    if (!isLoaded || !isSignedIn) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api<{ user: User | null }>('/auth/me');
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [isLoaded, isSignedIn, clerkUser?.id]);

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
