import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { STATUS_LABEL, timeAgo } from '../../lib/format';
import type { LeadStatus } from '../../lib/types';
import { useLive } from '../AdminApp';
import { ChannelBadge, IntentBadge, PageHead, ScoreBar, UrgencyBadge } from '../ui';

interface Card {
  _id: string;
  channel: string;
  contact: { name: string | null; phone: string | null; email: string | null };
  intent: string;
  urgency: string;
  score: number;
  status: LeadStatus;
  location: string[];
  summaryForBroker: string;
  assignedBroker: string | null;
  createdAt: string;
}

const STAGES: LeadStatus[] = ['new', 'auto_responded', 'needs_broker', 'contacted', 'qualified', 'closed_won', 'closed_lost'];

/** Kanban view of the lead pipeline. Drag a card to another stage to change its status. */
export function Pipeline() {
  const [cards, setCards] = useState<Card[]>([]);
  const [over, setOver] = useState<LeadStatus | null>(null);
  const [error, setError] = useState('');
  const { tick } = useLive();

  const load = useCallback(() => {
    api<{ items: Card[] }>('/admin/leads?pageSize=100&sort=urgency')
      .then((r) => setCards(r.items))
      .catch(() => null);
  }, []);
  useEffect(load, [load, tick]);

  const move = async (id: string, to: LeadStatus) => {
    const prev = cards;
    const card = cards.find((c) => c._id === id);
    if (!card || card.status === to) return;
    setCards((cs) => cs.map((c) => (c._id === id ? { ...c, status: to } : c))); // optimistic
    try {
      await api(`/admin/leads/${id}`, { method: 'PATCH', json: { status: to } });
      setError('');
    } catch (e) {
      setCards(prev);
      setError(`Could not move lead: ${(e as Error).message}`);
    }
  };

  const onDrop = (e: DragEvent, to: LeadStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/lead-id');
    if (id) void move(id, to);
  };

  const total = cards.length || 1;
  return (
    <div className="apage apage--wide">
      <PageHead title="Pipeline board" sub="Drag a lead to another stage to update its status (the Google Sheet row updates too). Updates live." />
      {error && <p className="form-error">{error}</p>}
      <div className="funnel" aria-label="Pipeline distribution">
        {STAGES.map((s) => {
          const n = cards.filter((c) => c.status === s).length;
          return <span key={s} className={`funnel__seg funnel__seg--${s}`} style={{ flexGrow: Math.max(n, 0.15) }} title={`${STATUS_LABEL[s]}: ${n}`} />;
        })}
      </div>
      <p className="muted">
        {cards.length} leads · conversion {Math.round((cards.filter((c) => c.status === 'closed_won').length / total) * 100)}%
      </p>
      <div className="board">
        {STAGES.map((stage) => {
          const col = cards.filter((c) => c.status === stage);
          return (
            <section
              key={stage}
              className={`board__col ${over === stage ? 'is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => onDrop(e, stage)}
              aria-label={STATUS_LABEL[stage]}
            >
              <header className="board__head">
                <span className={`board__dot board__dot--${stage}`} />
                <span>{STATUS_LABEL[stage]}</span>
                <span className="board__count mono">{col.length}</span>
              </header>
              <div className="board__cards">
                <AnimatePresence initial={false}>
                  {col.map((c) => (
                    <motion.article
                      key={c._id}
                      layout
                      layoutId={c._id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                      className={`kcard ${c.urgency === 'high' ? 'kcard--hot' : ''}`}
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/lead-id', c._id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        className="kcard__drag"
                      >
                        <div className="kcard__top">
                          <Link to={`/admin/leads/${c._id}`} className="kcard__name">
                            {c.contact.name ?? 'Unknown visitor'}
                          </Link>
                          <UrgencyBadge u={c.urgency} />
                        </div>
                        <p className="kcard__summary">{c.summaryForBroker || c.location.join(', ') || '—'}</p>
                        <div className="kcard__meta">
                          <IntentBadge i={c.intent} />
                          <ChannelBadge c={c.channel} />
                        </div>
                        <div className="kcard__foot">
                          <ScoreBar score={c.score} />
                          <span className="muted">{timeAgo(c.createdAt)}</span>
                        </div>
                        <select
                          className="kcard__move"
                          value={c.status}
                          onChange={(e) => move(c._id, e.target.value as LeadStatus)}
                          aria-label={`Move ${c.contact.name ?? 'lead'} to stage`}
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
                {!col.length && <p className="board__empty">Drop leads here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
