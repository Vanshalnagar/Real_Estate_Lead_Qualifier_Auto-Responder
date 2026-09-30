import type { ReactNode } from 'react';
import { CHANNEL_LABEL, INTENT_LABEL, STATUS_LABEL } from '../lib/format';

export function UrgencyBadge({ u }: { u: string }) {
  return <span className={`ubadge ubadge--${u}`}>{u}</span>;
}
export function ChannelBadge({ c }: { c: string }) {
  return <span className={`cbadge cbadge--${c}`}>{CHANNEL_LABEL[c] ?? c}</span>;
}
export function IntentBadge({ i }: { i: string }) {
  return <span className={`ibadge ibadge--${i}`}>{INTENT_LABEL[i] ?? i}</span>;
}
export function StatusBadge({ s }: { s: string }) {
  return <span className={`sbadge sbadge--${s}`}>{STATUS_LABEL[s] ?? s}</span>;
}
export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="apage__head">
      <div>
        <span className="eyebrow">
          <span className="slashes">//</span> Admin
        </span>
        <h1 className="h2">{title}</h1>
        {sub && <p className="body">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
export function ScoreBar({ score }: { score: number }) {
  return (
    <span className="score" title={`Lead score ${score}/100`}>
      <span className="score__bar">
        <span style={{ width: `${score}%` }} />
      </span>
      <span className="mono">{score}</span>
    </span>
  );
}
