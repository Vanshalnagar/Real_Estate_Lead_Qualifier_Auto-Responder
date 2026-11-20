import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Call { _id: string; status: string; createdAt: string; durationSeconds?: number; callSummary?: string; transcript?: string; leadCategory?: string; callbackTime?: string; extractedData?: unknown; }
export function VoicePanel({ leadId, phone, consent, dnc, onChange }: { leadId: string; phone: string | null; consent: boolean; dnc: boolean; onChange: () => void }) {
  const [calls, setCalls] = useState<Call[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Call | null>(null);
  const load = () => api<{ items: Call[] }>(`/admin/voice/calls?leadId=${leadId}`).then(r => setCalls(r.items)).catch(e => setError(e.message));
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer); }, [leadId]);
  const action = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await load(); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <section className="acard">
    <h2 className="h4">Voice calls</h2>
    <p>Calling consent: {consent ? 'Recorded' : 'Not recorded'} · Do Not Call: {dnc ? 'Enabled' : 'Off'}</p>
    <button className="btn btn--orange btn--sm" disabled={busy || !consent || dnc || !phone} onClick={() => { if (window.confirm(`Call ${phone} with the NESTR AI assistant? Provider charges may apply.`)) void action(() => api('/admin/voice/calls', { method: 'POST', json: { leadId } })); }}>Call lead</button>{' '}
    <button className="btn btn--sm" disabled={busy} onClick={() => { const source = window.prompt('Enter the evidence/source of the customer’s calling consent.'); if (source) void action(() => api(`/admin/voice/leads/${leadId}/consent`, { method: 'PATCH', json: { callConsent: true, doNotCall: false, source } })); }}>Record consent</button>{' '}
    <button className="btn btn--sm" disabled={busy || dnc} onClick={() => void action(() => api(`/admin/voice/leads/${leadId}/consent`, { method: 'PATCH', json: { callConsent: false, doNotCall: true, source: 'Admin recorded opt-out' } }))}>Do not call</button>
    {error && <p role="alert" className="form-error">{error}</p>}
    {calls.map(c => <div key={c._id}><p>{new Date(c.createdAt).toLocaleString()} · {c.status} · {c.durationSeconds ?? 0}s · {c.leadCategory || 'Awaiting analysis'}</p><p>{c.callSummary}</p>{c.callbackTime && <p>Callback: {c.callbackTime}</p>}<button onClick={() => void action(async () => { const r = await api<{ call: Call }>(`/admin/voice/calls/${c._id}`); setSelected(r.call); })}>Inspect transcript</button>{c.status === 'ongoing' && <button onClick={() => { if (window.confirm('End this live call?')) void action(() => api(`/admin/voice/calls/${c._id}/cancel`, { method: 'POST' })); }}>End call</button>}</div>)}
    {selected && <div><h3>Call details</h3><p style={{ whiteSpace: 'pre-wrap' }}>{selected.transcript || 'No transcript available yet.'}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(selected.extractedData, null, 2)}</pre><button onClick={() => void action(() => api(`/admin/voice/calls/${selected._id}/sync`, { method: 'POST' }))}>Sync from Retell</button><button onClick={() => setSelected(null)}>Close</button></div>}
  </section>;
}
