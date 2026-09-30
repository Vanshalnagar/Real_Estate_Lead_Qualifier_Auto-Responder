import { motion, useReducedMotion } from 'framer-motion';
import { useState, type PointerEvent } from 'react';
import { ButtonLink } from '../../components/Button';
import { Appear } from '../../components/Motion';
import { AREAS } from '../content';
import { INDIA_DOTS, MAP_BOUNDS } from '../indiaDots';

const project = (lon: number, lat: number) => ({
  x: ((lon - MAP_BOUNDS.lon0) / (MAP_BOUNDS.lon1 - MAP_BOUNDS.lon0)) * MAP_BOUNDS.w,
  y: ((MAP_BOUNDS.lat1 - lat) / (MAP_BOUNDS.lat1 - MAP_BOUNDS.lat0)) * MAP_BOUNDS.h,
});

export function Areas() {
  const reduce = useReducedMotion();
  const [glow, setGlow] = useState<{ x: number; y: number } | null>(null);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setGlow({ x: ((e.clientX - r.left) / r.width) * MAP_BOUNDS.w, y: ((e.clientY - r.top) / r.height) * MAP_BOUNDS.h });
  };

  return (
    <section className="areas frame" id="areas-we-serve">
      <div className="panel areas__panel">
        <div className="container section-y areas__inner">
          <Appear className="head-center">
            <span className="eyebrow">
              <span className="slashes">//</span> Areas we serve
            </span>
            <h2 className="h2">{AREAS.title}</h2>
            <p className="body areas__lead">{AREAS.text}</p>
          </Appear>

          <Appear className="map" y={80}>
            <svg viewBox={`0 0 ${MAP_BOUNDS.w} ${MAP_BOUNDS.h}`} className="map__svg" onPointerMove={onMove} onPointerLeave={() => setGlow(null)} role="img" aria-label={`Map of India showing ${AREAS.cities.map((c) => c.name).join(', ')}`}>
              <defs>
                <radialGradient id="glowGrad">
                  <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                <mask id="glowMask">
                  {glow && <circle cx={glow.x} cy={glow.y} r={170} fill="url(#glowGrad)" />}
                </mask>
              </defs>
              <g fill="rgba(255,255,255,.2)">
                {INDIA_DOTS.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={4.2} />
                ))}
              </g>
              {!reduce && (
                <g fill="#fff" mask="url(#glowMask)">
                  {INDIA_DOTS.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={4.6} />
                  ))}
                </g>
              )}
              {AREAS.cities.map((c, i) => {
                const p = project(c.lon, c.lat);
                return (
                  <g key={c.name} transform={`translate(${p.x} ${p.y})`}>
                    {!reduce && (
                      <motion.circle r={9} fill="rgba(255,138,36,.35)" initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
                    )}
                    <circle r={8} fill="#ff8a24" />
                    <circle r={3.2} fill="#fff" opacity={0.9} />
                  </g>
                );
              })}
            </svg>
            {AREAS.cities.map((c) => {
              const p = project(c.lon, c.lat);
              const left = (p.x / MAP_BOUNDS.w) * 100;
              const top = (p.y / MAP_BOUNDS.h) * 100;
              return (
                <span key={c.name} className={`map__label map__label--${c.place}`} style={{ left: `${left}%`, top: `${top}%` }}>
                  {c.name}
                </span>
              );
            })}
          </Appear>

          <ButtonLink to="/buy" label="Browse All Cities" glow />
        </div>
      </div>
    </section>
  );
}
