import { motion } from 'framer-motion';
import { useEffect, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ArrowLeft, ArrowRight, IconBuilding, IconChart, IconCrane, IconHome, IconKey, IconLand } from '../../components/Icons';
import { Appear, SPRING } from '../../components/Motion';
import { useChat } from '../../lib/chat';
import { SERVICES } from '../content';

const ICONS = { home: IconHome, key: IconKey, chart: IconChart, building: IconBuilding, crane: IconCrane, land: IconLand } as const;

function useVisibleCount() {
  const get = () => (window.innerWidth < 810 ? 1 : window.innerWidth < 1200 ? 2 : 3);
  const [n, setN] = useState(get);
  useEffect(() => {
    const on = () => setN(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return n;
}

function ServiceCard({ s }: { s: (typeof SERVICES)[number] }) {
  const Icon = ICONS[s.icon];
  const [light, setLight] = useState({ x: 50, y: 50 });
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setLight({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  return (
    <Link to={s.to} className="svc" onPointerMove={onMove} style={{ ['--lx' as string]: `${light.x}%`, ['--ly' as string]: `${light.y}%` }}>
      <div className="svc__body">
        <div className="svc__image">
          <img src={s.img} alt="" loading="lazy" />
          <div className="svc__overlay" />
        </div>
        <div className="svc__shine" aria-hidden />
        <Icon size={34} className="svc__icon" />
        <div className="svc__text">
          <h3 className="h5 svc__title">{s.title}</h3>
          <p className="body svc__desc">{s.text}</p>
        </div>
      </div>
    </Link>
  );
}

export function Services() {
  const { openChat } = useChat();
  const visible = useVisibleCount();
  const max = SERVICES.length - visible;
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx((i) => Math.min(i, max)), [max]);
  const progress = (idx + visible) / SERVICES.length;

  return (
    <section className="services frame" id="service-section">
      <div className="container section-y services__inner">
        <Appear className="head-center">
          <span className="eyebrow">
            <span className="slashes">//</span> Services
          </span>
          <h2 className="h2">
            Property Services
            <br />
            Built Around You
          </h2>
          <p className="body">From your first home to your next investment, we find, verify and close with complete transparency.</p>
        </Appear>

        <Appear className="svc-slider" y={80}>
          <div className="svc-viewport">
            <div
              className="svc-track"
              style={{ ['--visible' as string]: visible, transform: `translateX(calc(${-idx} * (100% + 16px) / ${visible}))` }}
            >
              {SERVICES.map((s) => (
                <ServiceCard key={s.title} s={s} />
              ))}
            </div>
          </div>
          <div className="svc-controls">
            <button className="round-btn" aria-label="Previous services" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
              <ArrowLeft />
            </button>
            <div className="svc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <motion.div className="svc-progress__fill" animate={{ width: `${progress * 100}%` }} transition={SPRING} />
            </div>
            <button className="round-btn" aria-label="Next services" onClick={() => setIdx((i) => Math.min(max, i + 1))} disabled={idx >= max}>
              <ArrowRight />
            </button>
          </div>
        </Appear>

        <div className="services__cta">
          <Button label="Get Matched Now" glow onClick={() => openChat()} />
        </div>
      </div>
    </section>
  );
}
