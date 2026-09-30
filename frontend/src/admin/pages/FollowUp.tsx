import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { STATUS_LABEL, timeAgo } from '../../lib/format';
import { useLive } from '../AdminApp';
import { ChannelBadge, IntentBadge, PageHead, ScoreBar, StatusBadge, UrgencyBadge } from '../ui';

interface Item {
  _id: string;
  channel: string;
  contact: { name: string | null; phone: string | null; email: string | null };
  intent: string;
  urgency: string;
  score: number;
  status: string;
  brief: string;
  assignedBroker: { _id: string; name?: string } | null;
  brokerNotifiedAt: string | null;
  needsManualReview: boolean;
  createdAt: string;
}
interface Broker {
  _id: string;
  name: string;
  areas: string[];
}

export function FollowUp() {
  const [items, setItems] = useState<Item[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { tick } = useLive();

  const load = useCallback(() => {
    api<{ items: Item[]; brokers: Broker[] }>('/admin/followup')
      .then((r) => {
        setItems(r.items);
        setBrokers(r.brokers);
      })
      .catch(() => null);
  }, []);
  useEffect(load, [load, tick]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/admin/leads/${id}`, { method: 'PATCH', json: body });
    load();
  };
  const addNote = async (id: string) => {
    const text = notes[id]?.trim();
    if (!text) return;
    await api(`/admin/leads/${id}/notes`, { method: 'POST', json: { text } });
    setNotes((n) => ({ ...n, [id]: '' }));
    load();
  };

  return (
    <div className="apage">
      <PageHead title="Broker follow-up queue" sub="High-urgency leads first, then everything waiting for a broker. Each card has the AI broker brief." />
      <div className="fq">
        {items.map((l) => (
          <article key={l._id} className={`fq__card ${l.urgency === 'high' ? 'fq__card--hot' : ''}`}>
            <header className="fq__head">
              <div>
                <Link to={`/admin/leads/${l._id}`} className="h4">
                  {l.contact.name ?? 'Unknown visitor'}
                </Link>
                <p className="body">
                  {[l.contact.phone, l.contact.email].filter(Boolean).join(' · ') || 'no contact yet'} · {timeAgo(l.createdAt)}
                </p>
              </div>
              <div className="ld__badges">
                <UrgencyBadge u={l.urgency} />
                <IntentBadge i={l.intent} />
                <ChannelBadge c={l.channel} />
                <StatusBadge s={l.status} />
                <ScoreBar score={l.score} />
                {l.needsManualReview && <span className="flag">Manual review</span>}
              </div>
            </header>
            <p className="fq__brief">{l.brief}</p>
            <div className="fq__actions">
              <select className="select select--sm" value={l.assignedBroker?._id ?? ''} onChange={(e) => patch(l._id, { assignedBroker: e.target.value || null })} aria-label="Assign broker">
                <option value="">Unassigned</option>
                {brokers.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select className="select select--sm" value={l.status} onChange={(e) => patch(l._id, { status: e.target.value })} aria-label="Change status">
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input className="input input--sm" placeholder="Add a note…" value={notes[l._id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [l._id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addNote(l._id)} aria-label="Note" />
              <button className="btn btn--dark btn--sm" onClick={() => addNote(l._id)}>
                Add note
              </button>
              <Link to={`/admin/leads/${l._id}`} className="btn btn--orange btn--sm">
                Reply on channel
              </Link>
            </div>
            {l.brokerNotifiedAt && <p className="fq__alerted">Broker alerted {timeAgo(l.brokerNotifiedAt)}</p>}
          </article>
        ))}
        {!items.length && <p className="body">Nothing waiting — every lead has been handled. 🎉</p>}
      </div>
    </div>
  );
}
