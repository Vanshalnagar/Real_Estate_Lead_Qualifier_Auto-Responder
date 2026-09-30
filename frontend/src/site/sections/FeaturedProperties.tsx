import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '../../components/Button';
import { CompareSlider } from '../../components/CompareSlider';
import { Calendar, Pin } from '../../components/Icons';
import { LiveImage, sourceName } from '../../components/Live';
import { Appear } from '../../components/Motion';
import { api } from '../../lib/api';
import { dateLong } from '../../lib/format';
import type { Property } from '../../lib/types';
import { FEATURED } from '../content';

function StackCard({ p, i, total, progress }: { p: Property; i: number; total: number; progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  // As later cards slide over, earlier ones shrink slightly (template's stacked sticky cards).
  const start = i / total;
  const scale = useTransform(progress, [start, 1], [1, reduce ? 1 : 1 - (total - i - 1) * 0.04]);
  return (
    <div className="stack__item" style={{ top: `calc(110px + ${i * 24}px)` }}>
      <motion.article className="pcard" style={{ scale }}>
        <div className="pcard__media">
          {p.images.length >= 2 ? (
            <CompareSlider before={p.images[0]} after={p.images[1]} beforeLabel="Photo 1" afterLabel="Photo 2" alt={p.title} />
          ) : (
            <LiveImage src={p.images[0]} alt={p.imageAlt || p.title} className="pcard__img" loading="lazy" />
          )}
        </div>
        <div className="pcard__info">
          <div className="pcard__meta">
            <span>
              <Calendar size={18} /> {dateLong(p.listedAt)}
            </span>
            <span className="dot" aria-hidden />
            <span>
              <Pin size={18} /> {[p.locality, p.city].filter(Boolean).join(', ')}
            </span>
          </div>
          <div className="pcard__text">
            <h3 className="h3">{p.title}</h3>
            <p className="body">{p.description}</p>
            <p className="pcard__price">{p.priceLabel}</p>
          </div>
          <div className="pcard__actions">
            <ButtonLink to={`/property/${p.slug}`} label="View Property" variant="dark" />
            {p.sourceUrl && (
              <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="pcard__source">
                Original on {sourceName(p.sourceUrl)} ↗
              </a>
            )}
          </div>
        </div>
      </motion.article>
    </div>
  );
}

export function FeaturedProperties() {
  const [items, setItems] = useState<Property[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  useEffect(() => {
    // Newest live listings (Apify), mixing rent / buy / investment, photos first.
    api<{ items: Property[] }>('/properties?limit=60')
      .then((r) => {
        const withPhoto = r.items.filter((p) => p.images.length > 0);
        const pools = [withPhoto.filter((p) => p.listingType === 'sale' && !p.investment), withPhoto.filter((p) => p.listingType === 'rent'), withPhoto.filter((p) => p.investment)];
        const picked: Property[] = [];
        for (let i = 0; picked.length < 4 && i < 12; i++) {
          const next = pools[i % 3].shift();
          if (next) picked.push(next);
        }
        for (const p of withPhoto) if (picked.length < 4 && !picked.includes(p)) picked.push(p);
        setItems(picked);
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <section className="featured frame" id="projects">
      <div className="panel featured__panel">
        <div className="container section-y">
          <Appear className="head-split featured__head">
            <div>
              <span className="eyebrow">
                <span className="slashes">//</span> Featured properties
              </span>
              <h2 className="h2">
                {FEATURED.title[0]}
                <br />
                {FEATURED.title[1]}
              </h2>
            </div>
            <ButtonLink to="/buy" label="All Properties" glow />
          </Appear>
          <div className="stack" ref={ref}>
            {items.map((p, i) => (
              <StackCard key={p.slug} p={p} i={i} total={items.length} progress={scrollYProgress} />
            ))}
            {!items.length && <div className="stack__placeholder" aria-hidden />}
          </div>
        </div>
      </div>
    </section>
  );
}
