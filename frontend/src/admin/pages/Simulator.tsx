import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { WhatsApp } from '../../components/Icons';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useLive } from '../AdminApp';
import { IntentBadge, PageHead, StatusBadge, UrgencyBadge } from '../ui';

interface Msg {
  _id: string;
  author: 'customer' | 'ai' | 'broker';
  text: string;
  deliveryStatus: string | null;
  createdAt: string;
}
interface Thread {
  lead: { _id: string; intent: string; urgency: string; score: number; status: string; processedBy: string } | null;
  messages: Msg[];
}

const SAMPLES = [
  'hi, need 2bhk flat on rent in powai, budget 65k, shifting next month',
  'bhai mujhe Pune mein 1bhk chahiye rent pe, 15-18k tak, turant',
  'Looking to invest ~4 cr in pre-leased commercial in Gurugram',
  'villa whitefield 3 cr, 6 months, family of 4',
];

/**
 * Posts payloads in Meta's real WhatsApp Cloud API webhook format (signed like Meta signs them)
 * to the same /api/webhooks/whatsapp endpoint, so the full n8n flow runs without a live number.
 */
export function Simulator() {
  const [from, setFrom] = useState('919812345678');
  const [name, setName] = useState('Amit Verma');
  const [text, setText] = useState('');
  const [thread, setThread] = useState<Thread>({ lead: null, messages: [] });
  const [waiting, setWaiting] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { tick } = useLive();

  const load = useCallback(() => {
    api<Thread>(`/admin/simulator/thread?phone=${encodeURIComponent(from)}`)
      .then((t) => {
        setThread(t);
        if (t.messages.length && t.messages[t.messages.length - 1].author !== 'customer') setWaiting(false);
      })
      .catch(() => null);
  }, [from]);
  useEffect(load, [load, tick]);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 1500);
    const stop = setTimeout(() => setWaiting(false), 60000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [waiting, load]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread.messages.length, waiting]);

  const send = async (e?: FormEvent, override?: string) => {
    e?.preventDefault();
    const body = (override ?? text).trim();
    if (!body) return;
    setText('');
    setWaiting(true);
    const r = await api<{ payload: unknown }>('/admin/simulator/whatsapp', { method: 'POST', json: { from, name, text: body } }).catch(() => null);
    if (r) setPayload(r.payload);
    setTimeout(load, 400);
  };

  return (
    <div className="apage">
      <PageHead title="WhatsApp simulator" sub="Sends Meta WhatsApp Cloud API webhook payloads to the real webhook — same n8n pipeline, no live number needed." />
      <div className="sim">
        <div className="sim__phone">
          <header className="sim__bar">
            <WhatsApp size={20} />
            <div>
              <strong>NESTR. (business)</strong>
              <span>Simulated WhatsApp chat with +{from}</span>
            </div>
          </header>
          <div className="sim__list" ref={listRef}>
            {thread.messages.map((m) => (
              <div key={m._id} className={`wa wa--${m.author === 'customer' ? 'in' : 'out'}`}>
                {m.author === 'broker' && <span className="wa__from">Broker</span>}
                <p>{m.text}</p>
                <span className="wa__meta">
                  {dateTime(m.createdAt)}
                  {m.author !== 'customer' && m.deliveryStatus ? ` · ${m.deliveryStatus}` : ''}
                </span>
              </div>
            ))}
            {waiting && <div className="wa wa--out wa--typing">typing…</div>}
            {!thread.messages.length && !waiting && <p className="sim__empty">Send a message as the customer to start.</p>}
          </div>
          <form className="sim__form" onSubmit={send}>
            <input className="input input--sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a WhatsApp message as the customer…" aria-label="Message" />
            <button className="btn btn--orange btn--sm" disabled={!text.trim()}>
              Send
            </button>
          </form>
        </div>

        <div className="sim__side">
          <section className="acard">
            <h2 className="h4">Customer</h2>
            <label className="field">
              <span className="field__label">WhatsApp number (with country code)</span>
              <input className="input input--sm" value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d]/g, ''))} />
            </label>
            <label className="field">
              <span className="field__label">Profile name</span>
              <input className="input input--sm" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="sim__samples">
              {SAMPLES.map((s) => (
                <button key={s} className="chip" onClick={() => send(undefined, s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          {thread.lead && (
            <section className="acard">
              <h2 className="h4">Lead created</h2>
              <div className="ld__badges">
                <IntentBadge i={thread.lead.intent} />
                <UrgencyBadge u={thread.lead.urgency} />
                <StatusBadge s={thread.lead.status} />
                <span className="tag">score {thread.lead.score}</span>
                <span className="tag">{thread.lead.processedBy}</span>
              </div>
              <Link to={`/admin/leads/${thread.lead._id}`} className="btn btn--dark btn--sm">
                Open lead
              </Link>
            </section>
          )}
          {payload != null && (
            <details className="raw acard">
              <summary>Last webhook payload (Meta format)</summary>
              <pre>{JSON.stringify(payload, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
