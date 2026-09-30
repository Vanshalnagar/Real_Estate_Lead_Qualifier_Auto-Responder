import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/Button';
import { CompareSlider } from '../../components/CompareSlider';
import { Calendar, CheckCircle, Pin } from '../../components/Icons';
import { LiveImage, sourceName } from '../../components/Live';
import { Appear } from '../../components/Motion';
import { api } from '../../lib/api';
import { useChat } from '../../lib/chat';
import { dateLong, timeAgo, TYPE_LABEL } from '../../lib/format';
import type { Property } from '../../lib/types';
import { PropertyCard } from './Listing';

export function PropertyDetail() {
  const { slug } = useParams();
  const { openChat } = useChat();
  const [p, setP] = useState<Property | null>(null);
  const [similar, setSimilar] = useState<Property[]>([]);
  const [missing, setMissing] = useState(false);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    setP(null);
    setMissing(false);
    setPhoto(0);
    api<{ item: Property; similar: Property[] }>(`/properties/${slug}`)
      .then((r) => {
        setP(r.item);
        setSimilar(r.similar);
        document.title = `${r.item.title} — ${r.item.locality}, ${r.item.city} | NESTR.`;
      })
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <section className="frame pd-missing">
        <div className="container section-y head-center">
          <h1 className="h2">This listing is no longer available</h1>
          <ButtonLink to="/buy" label="Browse live properties" />
        </div>
      </section>
    );
  }
  if (!p) return <div className="pd-loading" aria-busy="true" />;

  const ask = () =>
    openChat({
      property: { slug: p.slug, title: p.title },
      prefill: `Hi, I’m interested in ${p.title} in ${p.locality}, ${p.city} (${p.priceLabel}). `,
    });

  const inactive = p.active === false;
  const facts: [string, string | null | undefined][] = [
    ['Type', TYPE_LABEL[p.type]],
    ['Listing', p.listingType === 'rent' ? 'For rent' : p.investment ? 'For sale · investment' : 'For sale'],
    ['Bedrooms', p.bedrooms ? `${p.bedrooms} BHK` : null],
    ['Bathrooms', p.bathrooms ? String(p.bathrooms) : null],
    ['Area', p.areaSqft ? `${p.areaSqft.toLocaleString('en-IN')} sq ft` : null],
    ['Furnishing', p.furnishing],
    ['Project', p.projectName],
    ['Possession', p.possession],
    ['Listed by', p.listedBy ? p.listedBy[0].toUpperCase() + p.listedBy.slice(1) : null],
    ['Rental yield', p.expectedYield ? `≈ ${p.expectedYield}% per year` : null],
  ];
  const map = p.latitude && p.longitude ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;

  return (
    <>
      <section className="frame pd">
        <div className="panel">
          <div className="container pd__inner">
            <nav className="pd__crumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link> / <Link to={p.listingType === 'rent' ? '/rent' : p.investment ? '/invest' : '/buy'}>{p.listingType === 'rent' ? 'Rent' : p.investment ? 'Invest' : 'Buy'}</Link> / <span>{p.title}</span>
            </nav>
            {inactive && (
              <p className="pd__inactive" role="status">
                This listing is no longer in the latest data from {sourceName(p.sourceUrl)} — it may have been rented or sold.
              </p>
            )}
            <div className="pd__grid">
              <Appear className="pd__media">
                {p.images.length >= 2 ? (
                  <CompareSlider before={p.images[0]} after={p.images[1]} beforeLabel="Photo 1" afterLabel="Photo 2" alt={p.title} />
                ) : (
                  <div className="pd__photo">
                    <LiveImage src={p.images[photo] ?? p.images[0]} alt={p.imageAlt || p.title} />
                  </div>
                )}
                {p.images.length > 2 && (
                  <div className="pd__thumbs">
                    {p.images.slice(0, 8).map((src, i) => (
                      <button key={src} className={i === photo ? 'is-active' : ''} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}>
                        <LiveImage src={src} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </Appear>
              <Appear className="pd__info" delay={0.1}>
                <div className="pcard__meta">
                  <span>
                    <Calendar size={18} /> Listed {dateLong(p.listedAt)}
                  </span>
                  <span className="dot" aria-hidden />
                  <span>
                    <Pin size={18} /> {[p.locality, p.city].filter(Boolean).join(', ')}
                  </span>
                </div>
                <h1 className="h2">{p.title}</h1>
                <p className="pd__price">{p.priceLabel}</p>
                <p className="body body-2">{p.description}</p>
                <dl className="pd__facts">
                  {facts
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
                {p.amenities.length > 0 && (
                  <ul className="pd__amenities">
                    {p.amenities.map((a) => (
                      <li key={a}>
                        <CheckCircle size={18} /> {a}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pd__actions">
                  <Button label="Ask about this property" glow onClick={ask} />
                  {p.sourceUrl && <ButtonLink to={p.sourceUrl} label={`View original on ${sourceName(p.sourceUrl)}`} variant="dark" />}
                </div>
                <p className="pd__provenance">
                  Live listing sourced from{' '}
                  {p.sourceUrl ? (
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                      {sourceName(p.sourceUrl)}
                    </a>
                  ) : (
                    'the source portal'
                  )}{' '}
                  via Apify{p.lastSeenAt ? ` · last verified ${timeAgo(p.lastSeenAt)}` : ''}
                  {map && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={map} target="_blank" rel="noreferrer">
                        Open in Google Maps
                      </a>
                    </>
                  )}
                </p>
              </Appear>
            </div>
          </div>
        </div>
      </section>
      {similar.length > 0 && (
        <section className="frame">
          <div className="container section-y">
            <div className="head-split">
              <div>
                <span className="eyebrow">
                  <span className="slashes">//</span> Similar live listings
                </span>
                <h2 className="h2">More in {p.city}</h2>
              </div>
            </div>
            <div className="listing__grid pd__similar">
              {similar.map((s) => (
                <PropertyCard key={s.slug} p={s} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
