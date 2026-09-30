import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Chat, Close, Mic, Send } from '../../components/Icons';
import { LiveImage, sourceName } from '../../components/Live';
import { api } from '../../lib/api';
import { useChat, type ChatOpenOptions } from '../../lib/chat';
import { INTENT_LABEL, TYPE_LABEL } from '../../lib/format';
import type { ChatResponse } from '../../lib/types';
import { ReplyText } from '../sections/CtaForm';

const STORAGE_KEY = 'nestr_chat_session'; // session id only — no personal data in the browser

interface Msg {
  id: string;
  author: 'customer' | 'ai' | 'broker';
  text: string;
  result?: ChatResponse;
}

const GREETING = 'Hi! I’m the NESTR property assistant. Are you looking to buy, rent or invest? Tell me what you need and I’ll reply instantly with matching properties.';

function readSession(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && /^[a-zA-Z0-9_-]{8,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Reveals the newest assistant reply character by character (capped at ~1.4s), then renders links. */
function TypeReveal({ text: raw, onDone }: { text: string; onDone?: () => void }) {
  // Animate a plain-text version (no markdown markers), then swap to the formatted reply.
  const text = raw.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const [n, setN] = useState(0);
  const done = n >= text.length;
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return;
    }
    const step = Math.max(1, Math.ceil(text.length / 90)); // ≈ 90 frames
    const t = setInterval(() => setN((v) => Math.min(text.length, v + step)), 15);
    return () => clearInterval(t);
  }, [text]);
  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);
  if (done) return <ReplyText text={raw} />;
  return (
    <p className="type-reveal">
      {text.slice(0, n)}
      <span className="type-caret" aria-hidden />
    </p>
  );
}

const TOTAL_FIELDS = 7;

/** Tap-to-answer suggestions for the most important field that is still missing. */
function smartChips(r: ChatResponse | undefined): string[] {
  if (!r) return ['I want to buy', 'I want to rent', 'I want to invest'];
  const m = r.missingFields;
  if (m.includes('intent')) return ['I want to buy', 'I want to rent', 'I want to invest'];
  if (m.includes('location')) return ['In Mumbai', 'In Pune', 'In Bengaluru', 'In Hyderabad', 'In Gurugram'];
  if (m.includes('budget')) {
    return r.intent === 'renter'
      ? ['Under ₹25k a month', '₹25k–60k a month', 'Above ₹60k a month']
      : ['Under ₹80 lakh', '₹80 lakh – 1.5 Cr', 'Above ₹1.5 Cr'];
  }
  if (m.includes('timeline')) return ['Immediately', 'Within 3 months', 'In 6+ months', 'Just exploring'];
  if (m.includes('property_type')) return ['Apartment', 'Villa / house', 'Plot', 'Commercial space'];
  return [];
}

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** Voice input through the browser's Web Speech API (en-IN), when available. */
function useVoice(onText: (t: string, final: boolean) => void) {
  const Ctor = (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) as (new () => SpeechRec) | undefined;
  const rec = useRef<SpeechRec | null>(null);
  const [listening, setListening] = useState(false);
  const toggle = () => {
    if (!Ctor) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      onText(res[0].transcript, res.isFinal);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  return { supported: Boolean(Ctor), listening, toggle };
}

function Summary({ r }: { r: ChatResponse }) {
  const s = r.summary;
  const rows: [string, string | null | undefined][] = [
    ['Looking to', s.intent !== 'unclear' ? INTENT_LABEL[s.intent] : null],
    ['Where', s.location.join(', ')],
    ['Budget', s.budget],
    ['When', s.timeline],
    ['Property', [s.bedrooms ? `${s.bedrooms} BHK` : null, s.propertyType ? TYPE_LABEL[s.propertyType] : null].filter(Boolean).join(' · ')],
    ['Contact', [s.name, s.phone, s.email].filter(Boolean).join(' · ')],
  ];
  return (
    <div className="chat__summary">
      <p className="chat__summary-title">Here’s what I understood</p>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <p className={`chat__followup urg-bg--${r.urgency}`}>
        {r.urgency === 'high' ? 'Priority lead — a senior broker will call you within 30 minutes.' : r.urgency === 'medium' ? 'A broker will follow up within 4 hours.' : 'A broker will follow up within 24 hours.'}
      </p>
    </div>
  );
}

export function Chatbot() {
  const { open, options, openChat, closeChat } = useChat();
  const [sessionId, setSessionId] = useState<string | null>(readSession);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const voice = useVoice((t) => setInput(t));

  const loadHistory = useCallback(async (sid: string) => {
    try {
      const r = await api<{ messages: { id: string; author: Msg['author']; text: string }[] }>(`/chat/session/${sid}`);
      setMsgs((prev) => {
        // keep result cards from this browser tab; append broker replies that arrived since
        if (!prev.length) return r.messages.map((m) => ({ id: m.id, author: m.author, text: m.text }));
        const known = new Set(prev.map((m) => m.text + m.author));
        const extra = r.messages.filter((m) => m.author === 'broker' && !known.has(m.text + m.author));
        return extra.length ? [...prev, ...extra.map((m) => ({ id: m.id, author: m.author, text: m.text }))] : prev;
      });
    } catch {
      /* offline: keep current view */
    }
  }, []);

  useEffect(() => {
    if (sessionId) void loadHistory(sessionId);
  }, [sessionId, loadHistory]);

  // While open, poll for broker replies sent from the admin panel.
  useEffect(() => {
    if (!open || !sessionId) return;
    const t = setInterval(() => loadHistory(sessionId), 15000);
    return () => clearInterval(t);
  }, [open, sessionId, loadHistory]);

  useEffect(() => {
    if (!open) return;
    if (options.prefill !== undefined) setInput(options.prefill);
    setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, options]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || typing) return;
    setError('');
    setInput('');
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, author: 'customer', text: t }]);
    setTyping(true);
    try {
      const r = await api<ChatResponse>('/chat/message', {
        method: 'POST',
        json: { text: t, ...(sessionId ? { sessionId } : {}), ...(options.property ? { propertySlug: options.property.slug } : {}) },
      });
      if (r.sessionId && r.sessionId !== sessionId) {
        setSessionId(r.sessionId);
        try {
          localStorage.setItem(STORAGE_KEY, r.sessionId);
        } catch {
          /* storage disabled */
        }
      }
      const id = `ai-${Date.now()}`;
      setRevealId(id);
      setMsgs((m) => [...m, { id, author: 'ai', text: r.reply, result: r }]);
    } catch (e) {
      setError((e as Error).message || 'Could not reach us. Please try again.');
      setMsgs((m) => m.slice(0, -1));
      setInput(t);
    } finally {
      setTyping(false);
    }
  };

  // Hero AI search: open the panel and send the query straight away (once per request).
  const sentRef = useRef<ChatOpenOptions | null>(null);
  useEffect(() => {
    if (open && options.send && sentRef.current !== options) {
      sentRef.current = options;
      void send(options.send);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSessionId(null);
    setMsgs([]);
  };

  const last = [...msgs].reverse().find((m) => m.result)?.result;
  const lastMsg = msgs[msgs.length - 1];
  const chips = !typing && (!lastMsg || lastMsg.author !== 'customer') ? smartChips(last) : [];
  const known = last ? TOTAL_FIELDS - last.missingFields.length : 0;
  // Over the hero the launcher is a compact circle so it never covers the hero's rating badge.
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    const on = () => setCompact(window.scrollY < window.innerHeight * 0.6);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            className={`chat-launcher ${compact ? 'chat-launcher--compact' : ''}`}
            aria-label="Open chat — find my property"
            onClick={() => openChat()}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
          >
            <Chat size={24} />
            <span className="chat-launcher__label">Find my property</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            className="chat"
            role="dialog"
            aria-label="NESTR property assistant"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            data-lenis-prevent
          >
            <header className="chat__head">
              <div className="chat__avatar">N.</div>
              <div className="chat__title">
                <p className="h4">NESTR AI</p>
                <p className="chat__status">
                  <span className="chat__online" /> {typing ? 'Matching properties…' : 'Replies instantly'}
                </p>
              </div>
              {last && (
                <div className="chat__meter" title={`${known} of ${TOTAL_FIELDS} details known`} aria-label={`Profile ${known} of ${TOTAL_FIELDS} complete`}>
                  <svg viewBox="0 0 36 36" width="38" height="38" aria-hidden>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
                    <motion.circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="#ff8a24"
                      strokeWidth="3"
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                      strokeDasharray={2 * Math.PI * 15}
                      animate={{ strokeDashoffset: 2 * Math.PI * 15 * (1 - known / TOTAL_FIELDS) }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </svg>
                  <span className="mono">{known}/{TOTAL_FIELDS}</span>
                </div>
              )}
              {msgs.length > 0 && (
                <button className="chat__reset" onClick={reset} title="Start a new conversation">
                  New chat
                </button>
              )}
              <button className="chat__close" onClick={closeChat} aria-label="Close chat">
                <Close size={18} />
              </button>
            </header>

            {options.property && (
              <div className="chat__context">
                Asking about <Link to={`/property/${options.property.slug}`}>{options.property.title}</Link>
              </div>
            )}

            <div className="chat__list" ref={listRef} aria-live="polite">
              <div className="msg msg--ai">
                <p>{GREETING}</p>
              </div>
              {msgs.map((m) => (
                <div key={m.id} className={`msg msg--${m.author === 'customer' ? 'me' : m.author}`}>
                  {m.author === 'broker' && <span className="msg__from">Your NESTR broker</span>}
                  {m.author === 'customer' ? <p>{m.text}</p> : m.id === revealId ? <TypeReveal text={m.text} onDone={() => setRevealId(null)} /> : <ReplyText text={m.text} />}
                  {m.id !== revealId && m.result && m.result.matches.length > 0 && (
                    <div className="chat__matches">
                      {m.result.matches.map((p) => (
                        <div key={p.slug} className="match match--live">
                          {p.image && <LiveImage src={p.image} alt="" className="match__img" loading="lazy" />}
                          <div className="match__body">
                            <Link to={`/property/${p.slug}`} className="match__title" data-cursor="Open">
                              {p.title}
                            </Link>
                            <span className="match__meta">
                              {[p.locality, p.city].filter(Boolean).join(', ')} · {p.priceLabel}
                            </span>
                            {p.sourceUrl && (
                              <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="match__source">
                                Original on {sourceName(p.sourceUrl)} ↗
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.id !== revealId && m.result?.done && m.result === last && <Summary r={m.result} />}
                </div>
              ))}
              {typing && (
                <div className="msg msg--ai msg--typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {!revealId && chips.length > 0 && (
                <motion.div className="chat__chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={chips.join('|')}>
                  {chips.map((c, i) => (
                    <motion.button key={c} className="chip" onClick={() => send(c)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                      {c}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </div>

            {error && (
              <p className="chat__error" role="alert">
                {error}
              </p>
            )}
            <form className="chat__form" onSubmit={onSubmit}>
              <textarea
                ref={inputRef}
                className="chat__input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={voice.listening ? 'Listening… speak now' : 'e.g. 2BHK on rent in Powai under 60k, moving next month'}
                rows={1}
                maxLength={1500}
                aria-label="Your message"
              />
              {voice.supported && (
                <button type="button" className={`chat__mic ${voice.listening ? 'is-on' : ''}`} onClick={voice.toggle} aria-label={voice.listening ? 'Stop voice input' : 'Speak your requirement'} aria-pressed={voice.listening}>
                  <Mic />
                </button>
              )}
              <button className="chat__send" type="submit" disabled={!input.trim() || typing} aria-label="Send message">
                <Send />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
