import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useLive } from './AdminApp';
import { ChannelBadge } from './ui';

interface Activity {
  _id: string;
  leadId: string;
  name: string | null;
  phone: string | null;
  urgency: string | null;
  channel: string;
  author: 'customer' | 'ai' | 'broker';
  text: string;
  responseTimeMs: number | null;
  createdAt: string;
}

const WHO: Record<Activity['author'], string> = { customer: 'Customer', ai: 'AI replied', broker: 'Broker replied' };

/** Live stream of the latest messages across every channel. Refreshes on SSE events. */
export function ActivityFeed() {
  const [items, setItems] = useState<Activity[]>([]);
  const { tick } = useLive();
  const [, force] = useState(0);
  useEffect(() => {
    api<{ items: Activity[] }>('/admin/activity?limit=14')
      .then((r) => setItems(r.items))
      .catch(() => null);
  }, [tick]);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30000); // keep "time ago" fresh
    return () => clearInterval(t);
  }, []);
  return (
    <section className="acard acard--feed">
      <h2 className="h4 feed__title">
        <span className="feed__live" /> Live activity
      </h2>
      <ol className="feed">
        <AnimatePresence initial={false}>
          {items.map((a) => (
            <motion.li
              key={a._id}
              layout
              initial={{ opacity: 0, x: -16, backgroundColor: 'rgba(255,138,36,.18)' }}
              animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(255,138,36,0)' }}
              transition={{ duration: 0.8 }}
              className={`feed__item feed__item--${a.author}`}
            >
              <span className="feed__rail" />
              <div className="feed__body">
                <div className="feed__meta">
                  <strong>{WHO[a.author]}</strong>
                  <ChannelBadge c={a.channel} />
                  {a.urgency === 'high' && a.author === 'customer' && <span className="ubadge ubadge--high">high</span>}
                  {a.responseTimeMs != null && <span className="mono muted">{(a.responseTimeMs / 1000).toFixed(1)}s</span>}
                  <span className="muted feed__time">{timeAgo(a.createdAt)}</span>
                </div>
                <Link to={`/admin/leads/${a.leadId}`} className="feed__text">
                  <span className="feed__who">{a.author === 'customer' ? `${a.name ?? a.phone ?? 'Visitor'}:` : `→ ${a.name ?? a.phone ?? 'Visitor'}:`}</span> {a.text}
                </Link>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
