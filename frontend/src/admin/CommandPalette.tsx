import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CHANNEL_LABEL } from '../lib/format';

interface Item {
  id: string;
  group: 'Go to' | 'Actions' | 'Leads';
  label: string;
  hint?: string;
  urgency?: string;
  run: () => void;
}

interface LeadHit {
  _id: string;
  contact: { name: string | null; phone: string | null; email: string | null };
  urgency: string;
  intent: string;
  channel: string;
  location: string[];
}

/** Ctrl/⌘ + K: jump to any admin page, run an action, or search leads by name/phone/email/area. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-palette', onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  // Debounced lead search.
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: LeadHit[] }>(`/admin/leads?search=${encodeURIComponent(q.trim())}&pageSize=6`)
        .then((r) => setHits(r.items))
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (to: string) => () => {
    setOpen(false);
    nav(to);
  };
  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: 'd', group: 'Go to', label: 'Dashboard', hint: 'Overview & live activity', run: go('/admin') },
      { id: 'l', group: 'Go to', label: 'Leads', hint: 'Table with filters', run: go('/admin/leads') },
      { id: 'p', group: 'Go to', label: 'Pipeline board', hint: 'Drag leads between stages', run: go('/admin/pipeline') },
      { id: 'f', group: 'Go to', label: 'Broker follow-up queue', hint: 'High urgency first', run: go('/admin/follow-up') },
      { id: 'w', group: 'Go to', label: 'WhatsApp simulator', run: go('/admin/simulator') },
      { id: 's', group: 'Go to', label: 'Settings & health', run: go('/admin/settings') },
      { id: 'a1', group: 'Actions', label: 'Show high-urgency leads', run: go('/admin/leads?urgency=high&sort=score') },
      { id: 'a2', group: 'Actions', label: 'Show leads waiting for a broker', run: go('/admin/leads?status=needs_broker') },
      { id: 'a3', group: 'Actions', label: 'Show WhatsApp leads', run: go('/admin/leads?channel=whatsapp') },
      { id: 'a4', group: 'Actions', label: 'Open the customer website', hint: 'New tab', run: () => { setOpen(false); window.open('/', '_blank'); } },
    ];
    const term = q.trim().toLowerCase();
    const filtered = term ? base.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(term)) : base;
    const leads: Item[] = hits.map((h) => ({
      id: h._id,
      group: 'Leads',
      label: h.contact.name ?? h.contact.phone ?? h.contact.email ?? 'Unknown visitor',
      hint: [h.intent, CHANNEL_LABEL[h.channel], h.location.join(', ')].filter(Boolean).join(' · '),
      urgency: h.urgency,
      run: go(`/admin/leads/${h._id}`),
    }));
    return [...leads, ...filtered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hits]);

  useEffect(() => setIdx(0), [items.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[idx]?.run();
    }
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setOpen(false)}>
          <motion.div
            className="palette__box"
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="palette__search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search leads, pages and actions…"
                aria-label="Search"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
              />
              <kbd>Esc</kbd>
            </div>
            <ul className="palette__list" id="palette-list" role="listbox">
              {items.map((it, i) => {
                const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
                return (
                  <li key={it.id} role="presentation">
                    {head && <p className="palette__group">{head}</p>}
                    <button
                      role="option"
                      aria-selected={i === idx}
                      className={`palette__item ${i === idx ? 'is-active' : ''}`}
                      onMouseEnter={() => setIdx(i)}
                      onClick={it.run}
                    >
                      <span className="palette__label">
                        {it.urgency && <span className={`ubadge ubadge--${it.urgency}`}>{it.urgency}</span>}
                        {it.label}
                      </span>
                      {it.hint && <span className="palette__hint">{it.hint}</span>}
                    </button>
                  </li>
                );
              })}
              {!items.length && <li className="palette__empty">No results for “{q}”.</li>}
            </ul>
            <div className="palette__foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> navigate
              </span>
              <span>
                <kbd>Enter</kbd> open
              </span>
              <span>
                <kbd>Ctrl</kbd>
                <kbd>K</kbd> toggle
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
