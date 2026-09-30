import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { CheckCircle } from '../../components/Icons';
import { Appear } from '../../components/Motion';
import { api, ApiError } from '../../lib/api';
import { INTENT_LABEL } from '../../lib/format';
import type { ChatResponse } from '../../lib/types';
import { CTA } from '../content';
import { HONEYPOTS, leadFormSchema } from '../leadForm';

type Errors = Partial<Record<string, string>>;

/** Link to our own listing pages stays in-app; anything else opens in a new tab. */
function SmartLink({ href, label, k }: { href: string; label?: string; k: string }) {
  const internal = href.match(/^https?:\/\/[^/]+(\/property\/[a-z0-9-]+)/) ?? href.match(/^(\/property\/[a-z0-9-]+)/);
  if (internal) {
    return (
      <Link key={k} to={internal[1]} className="reply-link">
        {label && !/^view listing$/i.test(label) ? label : 'View listing'} →
      </Link>
    );
  }
  if (!/^https?:\/\//.test(href)) return <span key={k}>{label ?? href}</span>;
  return (
    <a key={k} href={href} target="_blank" rel="noreferrer" className="reply-link">
      {label ?? href}
    </a>
  );
}

/** Inline markdown subset: [text](url), bare URLs and **bold**. Built from React nodes only. */
function inline(text: string, key: string) {
  const out: JSX.Element[] = [];
  const rx = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(<span key={`${key}t${n++}`}>{text.slice(last, m.index)}</span>);
    if (m[1] && m[2]) out.push(<SmartLink key={`${key}l${n}`} k={`${key}l${n++}`} href={m[2]} label={m[1].replace(/\*\*/g, '')} />);
    else if (m[3]) out.push(<SmartLink key={`${key}u${n}`} k={`${key}u${n++}`} href={m[3]} />);
    else if (m[4]) out.push(<strong key={`${key}b${n++}`}>{m[4]}</strong>);
    last = rx.lastIndex;
  }
  if (last < text.length) out.push(<span key={`${key}t${n++}`}>{text.slice(last).replace(/\*\*/g, '')}</span>);
  return out;
}

export function ReplyText({ text }: { text: string }) {
  // Light formatting only (bold, links, bullets, line breaks). No HTML injection.
  const lines = text.replace(/\n{3,}/g, '\n\n').split('\n');
  return (
    <div className="reply-text">
      {lines.map((l, i) => {
        if (!l.trim()) return <span key={i} className="reply-text__gap" />;
        const bullet = /^\s*([-•*]|\d+[.)])\s+/.test(l);
        const body = bullet ? l.replace(/^\s*([-•*]|\d+[.)])\s+/, '') : l;
        return (
          <p key={i} className={bullet ? 'reply-text__bullet' : undefined}>
            {inline(body, `r${i}`)}
          </p>
        );
      })}
    </div>
  );
}

export function CtaForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [message, setMessage] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
    const parsed = leadFormSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setStatus('sending');
    const honeypots = Object.fromEntries(HONEYPOTS.map((h) => [h, raw[h] ?? '']));
    try {
      const r = await api<ChatResponse>('/leads/form', { method: 'POST', json: { ...parsed.data, ...honeypots } });
      setResult(r);
      setStatus('done');
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.issues) setErrors(Object.fromEntries(e2.issues.map((i) => [i.path, i.message])));
      setMessage(e2.message || 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const field = (name: string, el: JSX.Element) => (
    <label className={`field ${errors[name] ? 'field--invalid' : ''}`}>
      {el}
      {errors[name] && <span className="field__error">{errors[name]}</span>}
    </label>
  );

  return (
    <section className="cta frame" id="cta">
      <div className="cta__box">
        <img src="/images/site/cta.jpg" alt="" className="cta__bg" loading="lazy" />
        <div className="cta__overlay" />
        <div className="container section-y cta__inner">
          <Appear className="head-center cta__head">
            <span className="eyebrow">
              <span className="slashes">//</span> {CTA.eyebrow}
            </span>
            <h2 className="h2">
              {CTA.title[0]}
              <br />
              {CTA.title[1]}
            </h2>
            <p className="body body-2">{CTA.text}</p>
          </Appear>

          <Appear className="cta__form-wrap" y={80}>
            <AnimatePresence mode="wait">
              {status !== 'done' ? (
                <motion.form key="form" className="cta__form" onSubmit={onSubmit} noValidate exit={{ opacity: 0, y: -20 }} aria-label="Property enquiry form">
                  {field('name', <input className="input" name="name" placeholder="Full Name" autoComplete="name" aria-label="Full name" />)}
                  <div className="cta__row">
                    {field('email', <input className="input" type="email" name="email" placeholder="Enter your email" autoComplete="email" aria-label="Email" />)}
                    {field('phone', <input className="input" type="tel" name="phone" placeholder="Enter your number" autoComplete="tel" aria-label="Phone number" />)}
                  </div>
                  <div className="cta__row">
                    {field(
                      'intent',
                      <select className="select" name="intent" defaultValue="" aria-label="I want to">
                        <option value="" disabled>
                          I want to…
                        </option>
                        <option value="Buy">Buy</option>
                        <option value="Rent">Rent</option>
                        <option value="Invest">Invest</option>
                      </select>,
                    )}
                    {field('location', <input className="input" name="location" placeholder="Preferred location" aria-label="Preferred location" />)}
                  </div>
                  <div className="cta__row">
                    {field('budget', <input className="input" name="budget" placeholder="Budget (e.g. 80 lakh or 30k/month)" aria-label="Budget" />)}
                    {field('timeline', <input className="input" name="timeline" placeholder="Timeline (e.g. next month)" aria-label="Timeline" />)}
                  </div>
                  {field('message', <textarea className="textarea" name="message" placeholder="Tell us about your requirement…" aria-label="Message" />)}
                  {HONEYPOTS.map((h) => (
                    <input key={h} type="text" name={h} className="hp" tabIndex={-1} autoComplete="off" aria-hidden />
                  ))}
                  {status === 'error' && <p className="form-error" role="alert">{message}</p>}
                  <Button type="submit" label={status === 'sending' ? 'Matching you…' : 'Send Message'} block chevron={false} disabled={status === 'sending'} />
                </motion.form>
              ) : (
                <motion.div key="done" className="cta__form cta__done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="cta__done-head">
                    <CheckCircle size={28} />
                    <div>
                      <p className="h4">Thanks{result?.summary.name ? `, ${result.summary.name.split(' ')[0]}` : ''} — here is your instant reply</p>
                      <p className="body">
                        {INTENT_LABEL[result!.intent]} · urgency <strong className={`urg urg--${result!.urgency}`}>{result!.urgency}</strong>
                      </p>
                    </div>
                  </div>
                  <ReplyText text={result!.reply} />
                  <p className="body cta__done-foot">A NESTR broker has your brief and will follow up {result!.urgency === 'high' ? 'within 30 minutes' : 'shortly'}.</p>
                  <Button label="Send another enquiry" variant="dark" onClick={() => { setStatus('idle'); setResult(null); }} />
                </motion.div>
              )}
            </AnimatePresence>
          </Appear>
        </div>
      </div>
    </section>
  );
}
