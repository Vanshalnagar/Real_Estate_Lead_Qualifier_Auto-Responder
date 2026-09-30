import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/admin.css';
import '../styles/admin-enhance.css';
import { CommandPalette } from './CommandPalette';
import { Dashboard } from './pages/Dashboard';
import { FollowUp } from './pages/FollowUp';
import { LeadDetail } from './pages/LeadDetail';
import { Leads } from './pages/Leads';
import { Login } from './pages/Login';
import { Pipeline } from './pages/Pipeline';
import { Settings } from './pages/Settings';
import { Simulator } from './pages/Simulator';

export interface AdminEvent {
  type: 'lead.created' | 'lead.updated' | 'message' | 'broker.alert';
  leadId: string;
  urgency?: string;
  channel?: string;
  name?: string | null;
  summary?: string;
}

/** Live admin events (SSE). Pages subscribe to refresh when leads change. */
const LiveCtx = createContext<{ tick: number; last: AdminEvent | null }>({ tick: 0, last: null });
export const useLive = () => useContext(LiveCtx);

function useAdminEvents(enabled: boolean, onAlert: (e: AdminEvent) => void) {
  const [state, setState] = useState<{ tick: number; last: AdminEvent | null }>({ tick: 0, last: null });
  const alertRef = useRef(onAlert);
  alertRef.current = onAlert;
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/admin/events', { withCredentials: true });
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as AdminEvent;
        setState((s) => ({ tick: s.tick + 1, last: e }));
        if (e.type === 'broker.alert' || (e.type === 'lead.created' && e.urgency === 'high')) alertRef.current(e);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [enabled]);
  return state;
}

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/pipeline', label: 'Pipeline board' },
  { to: '/admin/follow-up', label: 'Broker follow-up' },
  { to: '/admin/simulator', label: 'WhatsApp simulator' },
  { to: '/admin/settings', label: 'Settings & health' },
];

export default function AdminApp() {
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [toasts, setToasts] = useState<(AdminEvent & { id: number })[]>([]);
  const nav = useNavigate();
  const loc = useLocation();

  const check = useCallback(() => {
    api<{ email: string }>('/admin/auth/me')
      .then((r) => setMe(r.email))
      .catch(() => setMe(null));
  }, []);
  useEffect(check, [check]);
  useEffect(() => {
    document.title = 'NESTR. Admin';
  }, []);

  const pushToast = useCallback((e: AdminEvent) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.filter((x) => x.leadId !== e.leadId), { ...e, id }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000);
  }, []);
  const live = useAdminEvents(Boolean(me), pushToast);

  if (me === undefined) return <div className="admin-loading">Loading…</div>;
  if (me === null) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={(email) => { setMe(email); if (loc.pathname === '/admin/login') nav('/admin'); }} />} />
      </Routes>
    );
  }

  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => null);
    setMe(null);
    nav('/admin');
  };

  return (
    <LiveCtx.Provider value={live}>
      <div className="admin">
        <aside className="admin__side">
          <Link to="/" className="admin__brand">
            <span className="admin__word">
              NESTR<span>.</span>
            </span>
            <small>Lead desk</small>
          </Link>
          <button className="admin__search" onClick={() => window.dispatchEvent(new Event('open-palette'))}>
            <span>Search…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav className="admin__nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="admin__me">
            <span className="admin__live" title="Live updates connected" />
            <span className="admin__email">{me}</span>
            <button className="admin__logout" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>
        <main className="admin__main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="leads" element={<Leads />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="follow-up" element={<FollowUp />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="settings" element={<Settings />} />
            <Route path="login" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
        <CommandPalette />
        <div className="toasts" aria-live="assertive">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div key={t.id} className="toast" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
                <p className="toast__title">{t.type === 'broker.alert' ? '🔔 High-urgency lead — broker alerted' : 'New high-urgency lead'}</p>
                <p className="toast__text">{t.name ? `${t.name}: ` : ''}{t.summary?.slice(0, 120) || 'Open the follow-up queue.'}</p>
                <Link to={`/admin/leads/${t.leadId}`} className="toast__link">
                  Open lead →
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </LiveCtx.Provider>
  );
}
