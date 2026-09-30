import { useAnimationFrame, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

/**
 * Infinite ticker that can be dragged (mouse/touch). Content is rendered twice and the offset
 * wraps at half the track width, so the loop is seamless. Pauses while hovered or dragged.
 */
export function Ticker({ children, speed = 40, reverse = false, className = '', gap = 16 }: { children: ReactNode; speed?: number; reverse?: boolean; className?: string; gap?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const x = useRef(0);
  const hover = useRef(false);
  const drag = useRef<{ startX: number; startOffset: number } | null>(null);
  const reduce = useReducedMotion();

  useAnimationFrame((_, delta) => {
    const el = track.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (!drag.current && !hover.current && !reduce) x.current += ((reverse ? 1 : -1) * speed * delta) / 1000;
    if (half > 0) {
      if (x.current <= -half) x.current += half;
      if (x.current > 0) x.current -= half;
    }
    el.style.transform = `translate3d(${x.current}px,0,0)`;
  });

  return (
    <div
      className={`ticker ${className}`}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => {
        hover.current = false;
        drag.current = null;
      }}
      onPointerDown={(e) => {
        drag.current = { startX: e.clientX, startOffset: x.current };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) x.current = drag.current.startOffset + (e.clientX - drag.current.startX);
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div className="ticker__track" ref={track} style={{ gap }}>
        <div className="ticker__group" style={{ gap }}>{children}</div>
        <div className="ticker__group" style={{ gap }} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
