import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { CHANNEL_LABEL, INTENT_LABEL, STATUS_LABEL, timeAgo } from '../../lib/format';
import { useLive } from '../AdminApp';
import { ChannelBadge, IntentBadge, PageHead, ScoreBar, StatusBadge, UrgencyBadge } from '../ui';

interface Row {
  _id: string;
  channel: string;
  channels: string[];
  contact: { name: string | null; phone: string | null; email: string | null };
  intent: string;
  urgency: string;
  score: number;
  status: string;
  location: string[];
  summaryForBroker: string;
  processedBy: string | null;
  needsManualReview: boolean;
  assignedBroker: string | null;
  createdAt: string;
  lastMessageAt: string;
}

const FILTERS = ['search', 'intent', 'urgency', 'status', 'channel', 'location', 'from', 'to', 'sort'] as const;

export function Leads() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const { tick, last } = useLive();
  const page = Number(params.get('page') ?? 1);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    for (const f of FILTERS) {
      const v = params.get(f);
      if (v) q.set(f, v);
    }
    q.set('page', String(page));
    return q.toString();
  }, [params, page]);

  useEffect(() => {
    let alive = true;
    api<{ items: Row[]; total: number }>(`/admin/leads?${qs}`)
      .then((r) => {
        if (!alive) return;
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => null)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [qs, tick]);

  useEffect(() => {
    if (last?.type === 'lead.created') {
      setFlash(last.leadId);
      const t = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [last]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const sel = (k: string, opts: Record<string, string>, all: string) => (
    <select className="select select--sm" value={params.get(k) ?? ''} onChange={(e) => set(k, e.target.value)} aria-label={all}>
      <option value="">{all}</option>
      {Object.entries(opts).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div className="apage">
      <PageHead title="Leads" sub={`${total} leads · updates live as new inquiries arrive`} />
      <div className="afilters">
        <input className="input input--sm" placeholder="Search name, phone, email, summary…" defaultValue={params.get('search') ?? ''} onChange={(e) => set('search', e.target.value)} aria-label="Search leads" />
        {sel('intent', INTENT_LABEL, 'All intents')}
        {sel('urgency', { high: 'High', medium: 'Medium', low: 'Low' }, 'All urgency')}
        {sel('status', STATUS_LABEL, 'All statuses')}
        {sel('channel', CHANNEL_LABEL, 'All channels')}
        <input className="input input--sm" placeholder="Location" defaultValue={params.get('location') ?? ''} onChange={(e) => set('location', e.target.value)} aria-label="Location" />
        <input className="input input--sm" type="date" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
        <input className="input input--sm" type="date" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
        {sel('sort', { newest: 'Newest first', urgency: 'Urgency', score: 'Score' }, 'Sort: newest')}
      </div>

      <div className="atable-wrap">
        <table className="atable">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Channel</th>
              <th>Intent</th>
              <th>Urgency</th>
              <th>Score</th>
              <th>Location</th>
              <th>Status</th>
              <th>Broker</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className={flash === r._id ? 'is-new' : undefined}>
                <td>
                  <Link to={`/admin/leads/${r._id}`} className="atable__lead">
                    <strong>{r.contact.name ?? 'Unknown visitor'}</strong>
                    <span>{r.contact.phone ?? r.contact.email ?? '—'}</span>
                    {r.needsManualReview && <span className="flag">Manual review</span>}
                  </Link>
                </td>
                <td>
                  <ChannelBadge c={r.channel} />
                </td>
                <td>
                  <IntentBadge i={r.intent} />
                </td>
                <td>
                  <UrgencyBadge u={r.urgency} />
                </td>
                <td>
                  <ScoreBar score={r.score} />
                </td>
                <td className="atable__muted">{r.location.join(', ') || '—'}</td>
                <td>
                  <StatusBadge s={r.status} />
                </td>
                <td className="atable__muted">{r.assignedBroker ?? '—'}</td>
                <td className="atable__muted" title={new Date(r.createdAt).toLocaleString()}>
                  {timeAgo(r.createdAt)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="atable__empty">
                  {loading ? 'Loading…' : 'No leads match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > 25 && (
        <div className="apager">
          <button className="btn btn--dark btn--sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
            Previous
          </button>
          <span className="body">
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <button className="btn btn--dark btn--sm" disabled={page * 25 >= total} onClick={() => { const n = new URLSearchParams(params); n.set('page', String(page + 1)); setParams(n); }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
