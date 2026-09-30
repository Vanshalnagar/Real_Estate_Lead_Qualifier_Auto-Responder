import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { PageHead } from '../ui';

interface Health {
  checkedAt: string;
  services: Record<string, { ok: boolean; detail?: string; enabled?: boolean }>;
}

const LABELS: Record<string, string> = {
  mongodb: 'MongoDB',
  n8n: 'n8n (lead-intake workflow)',
  groq: 'Groq (primary LLM)',
  gemini: 'Gemini (fallback LLM)',
  sheets: 'Google Sheets web app',
  whatsapp: 'WhatsApp provider',
};

export function Settings() {
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api<Health>('/admin/health')
      .then(setH)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="apage">
      <PageHead
        title="Settings & health"
        sub="Read-only status of every integration. Secrets are configured in server-side .env files and n8n credentials, never here."
        right={
          <button className="btn btn--dark" onClick={load} disabled={loading}>
            {loading ? 'Checking…' : 'Re-check'}
          </button>
        }
      />
      <div className="health">
        {Object.keys(LABELS).map((k) => {
          const s = h?.services[k];
          return (
            <div key={k} className={`health__row ${s ? (s.ok ? 'is-ok' : 'is-bad') : ''}`}>
              <span className="health__dot" />
              <div>
                <p className="h4">{LABELS[k]}</p>
                <p className="body">{s ? s.detail ?? (s.ok ? 'OK' : 'Unavailable') : 'Checking…'}</p>
              </div>
              <span className="health__state">{s ? (s.ok ? 'Operational' : 'Attention') : '…'}</span>
            </div>
          );
        })}
      </div>
      {h && <p className="body">Last checked {dateTime(h.checkedAt)}</p>}
    </div>
  );
}
