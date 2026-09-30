import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { CHANNEL_LABEL, dateTime, inr, STATUS_LABEL, TYPE_LABEL } from '../../lib/format';
import type { MatchSummary } from '../../lib/types';
import { useLive } from '../AdminApp';
import { ChannelBadge, IntentBadge, ScoreBar, StatusBadge, UrgencyBadge } from '../ui';

interface Msg {
  _id: string;
  channel: string;
  direction: 'inbound' | 'outbound';
  author: 'customer' | 'ai' | 'broker';
  text: string;
  deliveryStatus: string | null;
  responseTimeMs: number | null;
  createdAt: string;
}
interface Lead {
  _id: string;
  channel: string;
  channels: string[];
  contact: { name: string | null; phone: string | null; email: string | null };
  intent: string;
  intentConfidence: number;
  urgency: string;
  llmUrgency: string | null;
  urgencyReason: string;
  score: number;
  location: { preferred: string[]; flexible: boolean };
  budget: { min: number | null; max: number | null; period: string | null; raw: string };
  timeline: { raw: string; daysEstimate: number | null };
  propertyRequirements: { type: string | null; bedrooms: number | null; bathrooms: number | null; areaSqft: number | null; furnishing: string | null; amenities: string[]; other: string[] };
  propertyOfInterest: string | null;
  missingFields: string[];
  summaryForBroker: string;
  nextQuestion: string | null;
  autoResponse: string;
  classificationRaw: unknown;
  llmProvider: string | null;
  processedBy: string | null;
  needsManualReview: boolean;
  status: string;
  statusHistory: { from: string; to: string; by: string; at: string }[];
  assignedBroker: string | null;
  brokerNotes: { _id: string; author: string; text: string; createdAt: string }[];
  brokerAlerts: { channel: string; ok: boolean; detail: string; at: string }[];
  sheetRow: number | null;
  lastResponseMs: number | null;
  createdAt: string;
}
interface Detail {
  lead: Lead;
  brief: string;
  messages: Msg[];
  matches: (MatchSummary & { image?: string })[];
  broker: { _id: string; name: string; email: string; phone: string } | null;
  sheetConfigured: boolean;
  sheetUrl: string | null;
}
interface Broker {
  _id: string;
  name: string;
  areas: string[];
}

function budgetLine(b: Lead['budget']) {
  if (b.min === null && b.max === null) return b.raw || '—';
  const r = b.min !== null && b.max !== null ? `${inr(b.min)} – ${inr(b.max)}` : inr(b.max ?? b.min);
  return `${r}${b.period === 'monthly' ? ' / month' : ''}${b.raw ? `  (“${b.raw}”)` : ''}`;
}

export function LeadDetail() {
  const { id } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const { tick, last } = useLive();

  const load = useCallback(() => {
    api<Detail>(`/admin/leads/${id}`).then(setD).catch(() => setD(null));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (last?.leadId === id) load();
  }, [tick, last, id, load]);
  useEffect(() => {
    api<{ items: Broker[] }>('/admin/brokers').then((r) => setBrokers(r.items)).catch(() => null);
  }, []);

  if (!d) return <div className="admin-loading">Loading lead…</div>;
  const l = d.lead;

  const patch = async (body: Record<string, unknown>) => {
    await api(`/admin/leads/${l._id}`, { method: 'PATCH', json: body });
    load();
  };
  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/admin/leads/${l._id}/notes`, { method: 'POST', json: { text: note } });
    setNote('');
    load();
  };
  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ via: string; deliveryStatus: string }>(`/admin/leads/${l._id}/reply`, { method: 'POST', json: { text: reply } });
      setMsg(`Sent via ${r.via === 'email' ? 'email' : CHANNEL_LABEL[r.via] ?? r.via} — ${r.deliveryStatus}`);
      setReply('');
      load();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pr = l.propertyRequirements;
  const conf = Math.round((l.intentConfidence ?? 0) * 100);
  return (
    <div className="apage">
      <Link to="/admin/leads" className="aback">
        ← All leads
      </Link>
      <div className="ld__head">
        <div>
          <h1 className="h2">{l.contact.name ?? 'Unknown visitor'}</h1>
          <p className="body">
            {[l.contact.phone, l.contact.email].filter(Boolean).join(' · ') || 'No contact details yet'} · since {dateTime(l.createdAt)}
          </p>
          <div className="ld__badges">
            {l.channels.map((c) => (
              <ChannelBadge key={c} c={c} />
            ))}
            <IntentBadge i={l.intent} />
            <UrgencyBadge u={l.urgency} />
            <StatusBadge s={l.status} />
            <ScoreBar score={l.score} />
            {l.needsManualReview && <span className="flag">Manual review</span>}
          </div>
        </div>
        <div className="ld__controls">
          <label className="field">
            <span className="field__label">Status</span>
            <select className="select select--sm" value={l.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Change status">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Assigned broker</span>
            <select className="select select--sm" value={l.assignedBroker ?? ''} onChange={(e) => patch({ assignedBroker: e.target.value || null })} aria-label="Assign broker">
              <option value="">Unassigned</option>
              {brokers.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name} — {b.areas.slice(0, 2).join(', ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="acard ld__brief">
        <h2 className="h4">Broker brief</h2>
        <p className="body body-2">{d.brief}</p>
      </section>

      <div className="ld__grid">
        <div className="ld__col">
          <section className="acard">
            <h2 className="h4">Conversation ({d.messages.length})</h2>
            <ol className="timeline">
              {d.messages.map((m) => (
                <li key={m._id} className={`tl tl--${m.author}`}>
                  <div className="tl__meta">
                    <strong>{m.author === 'customer' ? 'Customer' : m.author === 'ai' ? 'AI auto-reply' : 'Broker'}</strong>
                    <ChannelBadge c={m.channel} />
                    <span>{m.direction}</span>
                    <span>{dateTime(m.createdAt)}</span>
                    {m.responseTimeMs != null && <span>{(m.responseTimeMs / 1000).toFixed(1)}s</span>}
                    {m.deliveryStatus && <span className="tl__status">{m.deliveryStatus}</span>}
                  </div>
                  <p className="tl__text">{m.text}</p>
                </li>
              ))}
            </ol>
            <form className="ld__reply" onSubmit={sendReply}>
              <label className="field">
                <span className="field__label">
                  Reply to customer on {CHANNEL_LABEL[d.messages.filter((m) => m.direction === 'inbound').slice(-1)[0]?.channel ?? l.channel]}
                  {['web_form', 'google_form'].includes(l.channel) ? ' (sent by email)' : ''}
                </span>
                <textarea className="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a follow-up message…" />
              </label>
              <div className="ld__reply-foot">
                <span className="body">{msg}</span>
                <button className="btn btn--orange btn--sm" disabled={busy || !reply.trim()}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <div className="ld__col">
          <section className="acard">
            <h2 className="h4">AI classification</h2>
            <dl className="kv">
              <div>
                <dt>Intent</dt>
                <dd>
                  <IntentBadge i={l.intent} /> <span className="mono">{conf}% confidence</span>
                </dd>
              </div>
              <div>
                <dt>Urgency</dt>
                <dd>
                  <UrgencyBadge u={l.urgency} /> {l.llmUrgency && l.llmUrgency !== l.urgency && <span className="muted">(LLM said {l.llmUrgency}, raised by rules)</span>}
                  <p className="muted">{l.urgencyReason}</p>
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{l.location.preferred.join(', ') || '—'}{l.location.preferred.length ? (l.location.flexible ? ' (flexible)' : ' (fixed)') : ''}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{budgetLine(l.budget)}</dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>
                  {l.timeline.raw || '—'} {l.timeline.daysEstimate != null && <span className="muted">≈ {l.timeline.daysEstimate} days</span>}
                </dd>
              </div>
              <div>
                <dt>Requirements</dt>
                <dd>
                  {[pr.bedrooms ? `${pr.bedrooms} BHK` : null, pr.type ? TYPE_LABEL[pr.type] : null, pr.areaSqft ? `${pr.areaSqft} sq ft` : null, pr.furnishing, ...(pr.amenities ?? []), ...(pr.other ?? [])].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt>Property of interest</dt>
                <dd>{l.propertyOfInterest ?? '—'}</dd>
              </div>
              <div>
                <dt>Missing fields</dt>
                <dd>{l.missingFields.length ? l.missingFields.map((f) => <span key={f} className="tag">{f}</span>) : 'None — fully qualified'}</dd>
              </div>
              <div>
                <dt>Next question</dt>
                <dd>{l.nextQuestion ?? '—'}</dd>
              </div>
              <div>
                <dt>Processed by</dt>
                <dd>
                  {l.processedBy ?? '—'} · {l.llmProvider ?? 'no LLM (manual review)'} {l.lastResponseMs != null && `· ${(l.lastResponseMs / 1000).toFixed(1)}s`}
                </dd>
              </div>
              <div>
                <dt>Google Sheet</dt>
                <dd>
                  {l.sheetRow ? (d.sheetUrl ? <a href={d.sheetUrl} target="_blank" rel="noreferrer">Row {l.sheetRow} ↗</a> : `Row ${l.sheetRow}`) : d.sheetConfigured ? 'Not synced yet' : 'Sheets web app not configured'}
                </dd>
              </div>
            </dl>
            <details className="raw">
              <summary>Raw LLM output</summary>
              <pre>{JSON.stringify(l.classificationRaw, null, 2)}</pre>
            </details>
          </section>

          <section className="acard">
            <h2 className="h4">Latest auto-reply</h2>
            <p className="tl__text">{l.autoResponse || '—'}</p>
          </section>

          {d.matches.length > 0 && (
            <section className="acard">
              <h2 className="h4">Matched properties</h2>
              <div className="amatches">
                {d.matches.map((m) => (
                  <a key={m.slug} href={`/property/${m.slug}`} target="_blank" rel="noreferrer" className="amatch">
                    {m.image && <img src={m.image} alt="" />}
                    <span>
                      <strong>{m.title}</strong>
                      <span className="muted">
                        {m.locality}, {m.city} · {m.priceLabel}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="acard">
            <h2 className="h4">Broker notes</h2>
            <ul className="notes">
              {l.brokerNotes.map((n) => (
                <li key={n._id}>
                  <p>{n.text}</p>
                  <span className="muted">
                    {n.author} · {dateTime(n.createdAt)}
                  </span>
                </li>
              ))}
              {!l.brokerNotes.length && <li className="muted">No notes yet.</li>}
            </ul>
            <form className="ld__note" onSubmit={addNote}>
              <input className="input input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="New note" />
              <button className="btn btn--dark btn--sm" disabled={!note.trim()}>
                Add note
              </button>
            </form>
          </section>

          <section className="acard">
            <h2 className="h4">Status history &amp; alerts</h2>
            <ul className="history">
              {l.statusHistory.map((h, i) => (
                <li key={i}>
                  <StatusBadge s={h.from} /> → <StatusBadge s={h.to} /> <span className="muted">by {h.by} · {dateTime(h.at)}</span>
                </li>
              ))}
              {l.brokerAlerts.map((a, i) => (
                <li key={`a${i}`}>
                  <span className={`tag ${a.ok ? 'tag--ok' : 'tag--warn'}`}>{a.channel}</span> {a.detail} <span className="muted">· {dateTime(a.at)}</span>
                </li>
              ))}
            </ul>
            {d.broker && (
              <p className="body">
                Assigned: <strong>{d.broker.name}</strong> · {d.broker.email} · {d.broker.phone}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
