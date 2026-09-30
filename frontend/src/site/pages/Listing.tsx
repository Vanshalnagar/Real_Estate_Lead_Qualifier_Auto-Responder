import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Pin } from '../../components/Icons';
import { LiveImage, sourceName, SyncBadge } from '../../components/Live';
import { Appear } from '../../components/Motion';
import { api } from '../../lib/api';
import { useChat } from '../../lib/chat';
import { TYPE_LABEL } from '../../lib/format';
import type { Property, SyncInfo } from '../../lib/types';
import { CtaForm } from '../sections/CtaForm';

type Mode = 'buy' | 'rent' | 'invest';

const PAGE: Record<Mode, { title: string; lead: string; img: string; eyebrow: string; prompt: string }> = {
  buy: { eyebrow: 'Buy', title: 'Homes to Buy, Verified by Experts', lead: 'Apartments, villas and plots across six cities — every listing checked for ownership, approvals and availability.', img: '/images/site/buy-hero.jpg', prompt: 'I want to buy a ' },
  rent: { eyebrow: 'Rent', title: 'Rentals Ready for Your Move-In', lead: 'Furnished and family rentals with transparent deposits, near the places you work and study.', img: '/images/site/rent-hero.jpg', prompt: 'I want to rent a ' },
  invest: { eyebrow: 'Invest', title: 'Investment Properties With Real Numbers', lead: 'Pre-leased offices, warehouses, plots and high-demand apartments — with rental yield and resale data.', img: '/images/site/invest-hero.jpg', prompt: 'I want to invest in ' },
};

const BUDGETS: Record<Mode, { label: string; min?: number; max?: number }[]> = {
  buy: [
    { label: 'Any budget' },
    { label: 'Under ₹1 Cr', max: 10000000 },
    { label: '₹1 – 2 Cr', min: 10000000, max: 20000000 },
    { label: '₹2 – 5 Cr', min: 20000000, max: 50000000 },
    { label: 'Above ₹5 Cr', min: 50000000 },
  ],
  rent: [
    { label: 'Any budget' },
    { label: 'Under ₹25,000/mo', max: 25000 },
    { label: '₹25k – 75k/mo', min: 25000, max: 75000 },
    { label: '₹75k – 1.5L/mo', min: 75000, max: 150000 },
    { label: 'Above ₹1.5L/mo', min: 150000 },
  ],
  invest: [
    { label: 'Any budget' },
    { label: 'Under ₹1 Cr', max: 10000000 },
    { label: '₹1 – 5 Cr', min: 10000000, max: 50000000 },
    { label: 'Above ₹5 Cr', min: 50000000 },
  ],
};

export function PropertyCard({ p }: { p: Property }) {
  // 3D tilt towards the pointer; the second photo (interior) fades in on hover.
  const ref = useRef<HTMLAnchorElement>(null);
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--rx', `${(-py * 7).toFixed(2)}deg`);
    e.currentTarget.style.setProperty('--ry', `${(px * 9).toFixed(2)}deg`);
    e.currentTarget.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    e.currentTarget.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  const perSqft = p.listingType === 'sale' && p.areaSqft ? Math.round(p.price / p.areaSqft) : null;
  return (
    <Link to={`/property/${p.slug}`} className="lcard" ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="lcard__glare" aria-hidden />
      <div className="lcard__img">
        <LiveImage src={p.images[0]} alt={p.imageAlt || p.title} loading="lazy" />
        {p.images[1] && <LiveImage src={p.images[1]} alt="" aria-hidden loading="lazy" className="lcard__img2" />}
        <span className="pill lcard__pill">{p.listingType === 'rent' ? 'For rent' : p.investment ? 'Investment' : 'For sale'}</span>
      </div>
      <div className="lcard__body">
        <p className="lcard__meta">
          <Pin size={16} /> {p.locality}, {p.city}
        </p>
        <h3 className="h4">{p.title}</h3>
        <p className="lcard__facts">
          {[TYPE_LABEL[p.type], p.bedrooms ? `${p.bedrooms} BHK` : null, p.areaSqft ? `${p.areaSqft.toLocaleString('en-IN')} sq ft` : null, p.furnishing, p.expectedYield ? `${p.expectedYield}% yield` : null].filter(Boolean).join(' · ')}
        </p>
        <div className="lcard__foot">
          <p className="lcard__price">{p.priceLabel}</p>
          {perSqft && <span className="lcard__psf mono">₹{perSqft.toLocaleString('en-IN')}/sq ft</span>}
        </div>
        {p.sourceUrl && (
          <p className="lcard__source">
            Listed on {sourceName(p.sourceUrl)}
            {p.listedAt ? ` · posted ${new Date(p.listedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
          </p>
        )}
      </div>
    </Link>
  );
}

export function Listing({ mode }: { mode: Mode }) {
  const cfg = PAGE[mode];
  const { openChat } = useChat();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Property[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<SyncInfo | null>(null);

  const location = params.get('location') ?? '';
  const budget = Number(params.get('budget') ?? 0);
  const bedrooms = params.get('bedrooms') ?? '';
  const type = params.get('type') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const sorted = useMemo(() => {
    const list = [...items];
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'yield') list.sort((a, b) => (b.expectedYield ?? 0) - (a.expectedYield ?? 0));
    return list;
  }, [items, sort]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ mode });
    const b = BUDGETS[mode][budget];
    if (location) q.set('location', location);
    if (b?.min !== undefined) q.set('minPrice', String(b.min));
    if (b?.max !== undefined) q.set('maxPrice', String(b.max));
    if (bedrooms) q.set('bedrooms', bedrooms);
    if (type) q.set('type', type);
    return q.toString();
  }, [mode, location, budget, bedrooms, type]);

  useEffect(() => {
    document.title = `${cfg.eyebrow} Properties | NESTR.`;
    setLoading(true);
    api<{ items: Property[]; cities: string[]; sync: SyncInfo }>(`/properties?${query}`)
      .then((r) => {
        setItems(r.items);
        setCities(r.cities);
        setSync(r.sync);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [query, cfg.eyebrow]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <section className="lhero frame">
        <div className="lhero__box">
          <img src={cfg.img} alt="" className="lhero__img" />
          <div className="hero__overlay" />
          <div className="container lhero__content">
            <Appear>
              <span className="eyebrow">
                <span className="slashes">//</span> {cfg.eyebrow}
              </span>
            </Appear>
            <Appear delay={0.1}>
              <h1 className="h1">{cfg.title}</h1>
            </Appear>
            <Appear delay={0.2}>
              <p className="body body-2 lhero__lead">{cfg.lead}</p>
            </Appear>
          </div>
        </div>
      </section>

      <section className="frame" id="listings">
        <div className="container section-y">
          <div className="filters" role="search" aria-label="Filter properties">
            <label className="field">
              <span className="field__label">Location</span>
              <select className="select" value={location} onChange={(e) => set('location', e.target.value)}>
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Budget</span>
              <select className="select" value={budget} onChange={(e) => set('budget', e.target.value === '0' ? '' : e.target.value)}>
                {BUDGETS[mode].map((b, i) => (
                  <option key={b.label} value={i}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Bedrooms</span>
              <select className="select" value={bedrooms} onChange={(e) => set('bedrooms', e.target.value)}>
                <option value="">Any</option>
                <option value="1">1 BHK</option>
                <option value="2">2 BHK</option>
                <option value="3">3 BHK</option>
                <option value="4">4+ BHK</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Property type</span>
              <select className="select" value={type} onChange={(e) => set('type', e.target.value)}>
                <option value="">All types</option>
                {Object.entries(TYPE_LABEL)
                  .filter(([k]) => k !== 'other')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <SyncBadge sync={sync} />
          <div className="listing__bar">
            <p className="body listing__count" aria-live="polite">
              {loading ? 'Loading properties…' : `${items.length} ${items.length === 1 ? 'property' : 'properties'} found`}
            </p>
            <label className="listing__sort">
              <span className="field__label">Sort</span>
              <select className="select select--sm" value={sort} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                {mode === 'invest' && <option value="yield">Highest rental yield</option>}
              </select>
            </label>
          </div>
          <motion.div className="listing__grid" layout>
            <AnimatePresence mode="popLayout">
              {sorted.map((p, i) => (
                <motion.div
                  key={p.slug}
                  layout
                  initial={{ opacity: 0, scale: 0.92, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 28, delay: (i % 6) * 0.04 }}
                >
                  <PropertyCard p={p} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {!loading && !items.length && (
            <div className="listing__empty">
              {sync && sync.activeListings === 0 ? (
                <>
                  <p className="h4">Fetching live listings from {sync.source}…</p>
                  <p className="body">The first sync is in progress — fresh listings appear here within a few minutes. Meanwhile, tell us what you need.</p>
                </>
              ) : (
                <>
                  <p className="h4">No live listings match these filters right now.</p>
                  <p className="body">Tell us what you need — we’ll fetch fresh listings for your area and reply instantly.</p>
                </>
              )}
              <Button label="Describe my requirement" onClick={() => openChat({ prefill: cfg.prompt })} />
            </div>
          )}
        </div>
      </section>
      <CtaForm />
    </>
  );
}
