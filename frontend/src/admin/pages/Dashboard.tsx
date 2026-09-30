import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardAppear, Counter } from '../../components/Motion';
import { api } from '../../lib/api';
import { CHANNEL_LABEL, INTENT_LABEL } from '../../lib/format';
import { useLive } from '../AdminApp';
import { ActivityFeed } from '../ActivityFeed';
import { PageHead } from '../ui';

interface Stats {
  total: number;
  highWaiting: number;
  byIntent: Record<string, number>;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  avgResponseMs: number;
  last7Days: { day: string; n: number }[];
}

const INTENT_COLORS: Record<string, string> = { buyer: '#ff8a24', renter: '#de8f07', investor: '#c25800', unclear: '#4a4a4a' };

function Donut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  let acc = 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Lead intent split">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#262626" strokeWidth="18" />
        {entries.map(([k, n]) => {
          const len = (n / total) * C;
          const el = (
            <circle key={k} cx="70" cy="70" r={R} fill="none" stroke={INTENT_COLORS[k] ?? '#888'} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
          );
          acc += len;
          return el;
        })}
      </svg>
      <ul className="legend">
        {['buyer', 'renter', 'investor', 'unclear'].map((k) => (
          <li key={k}>
            <span className="legend__sw" style={{ background: INTENT_COLORS[k] }} />
            {INTENT_LABEL[k]}
            <strong className="mono">{data[k] ?? 0}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ rows, label }: { rows: { k: string; n: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.k}>
          <span className="bars__label">{label(r.k)}</span>
          <span className="bars__track">
            <span className="bars__fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <strong className="mono">{r.n}</strong>
        </li>
      ))}
    </ul>
  );
}

function Spark({ days }: { days: { day: string; n: number }[] }) {
  // last 7 days, filling gaps with 0
  const all = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return { day: key, n: days.find((x) => x.day === key)?.n ?? 0 };
  });
  const max = Math.max(1, ...all.map((d) => d.n));
  return (
    <div className="spark" role="img" aria-label="Leads per day, last 7 days">
      {all.map((d) => (
        <div key={d.day} className="spark__col">
          <span className="spark__n mono">{d.n}</span>
          <span className="spark__bar" style={{ height: `${Math.max(4, (d.n / max) * 120)}px` }} />
          <span className="spark__day">{new Date(d.day).toLocaleDateString('en-US', { weekday: 'short' })}</span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const { tick } = useLive();
  useEffect(() => {
    api<Stats>('/admin/stats').then(setS).catch(() => null);
  }, [tick]);

  if (!s) return <div className="admin-loading">Loading dashboard…</div>;
  const avgSec = s.avgResponseMs / 1000;
  return (
    <div className="apage">
      <PageHead title="Lead dashboard" sub="Every inquiry from the website, forms and WhatsApp — classified and answered automatically." right={<Link className="btn btn--orange" to="/admin/follow-up">Open follow-up queue</Link>} />
      <div className="kpis">
        <CardAppear className="kpi">
          <p className="kpi__value mono">
            <Counter to={s.total} />
          </p>
          <p className="kpi__label">Total leads</p>
        </CardAppear>
        <CardAppear className="kpi kpi--hot" delay={0.05}>
          <p className="kpi__value mono">
            <Counter to={s.highWaiting} />
          </p>
          <p className="kpi__label">High-urgency leads waiting</p>
        </CardAppear>
        <CardAppear className="kpi" delay={0.1}>
          <p className="kpi__value mono">
            <Counter to={avgSec} decimals={1} suffix="s" />
          </p>
          <p className="kpi__label">Average AI response time</p>
        </CardAppear>
        <CardAppear className="kpi" delay={0.15}>
          <p className="kpi__value mono">
            <Counter to={(s.byStatus.needs_broker ?? 0) + (s.byStatus.new ?? 0)} />
          </p>
          <p className="kpi__label">Need a broker</p>
        </CardAppear>
      </div>
      <div className="agrid">
        <section className="acard">
          <h2 className="h4">Buyers · renters · investors</h2>
          <Donut data={s.byIntent} />
        </section>
        <section className="acard">
          <h2 className="h4">Leads by channel</h2>
          <Bars rows={['web_chat', 'web_form', 'google_form', 'whatsapp'].map((k) => ({ k, n: s.byChannel[k] ?? 0 }))} label={(k) => CHANNEL_LABEL[k]} />
        </section>
        <section className="acard">
          <h2 className="h4">New leads — last 7 days</h2>
          <Spark days={s.last7Days} />
        </section>
        <ActivityFeed />
      </div>
    </div>
  );
}
