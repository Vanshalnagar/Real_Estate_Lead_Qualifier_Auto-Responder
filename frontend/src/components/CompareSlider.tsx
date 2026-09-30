import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Before/after drag slider from the template's project cards, used as "Exterior / Interior".
 * Mouse and touch via pointer events; keyboard with arrows (5%), Home/End.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel = 'Exterior',
  afterLabel = 'Interior',
  alt,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt: string;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromX = useCallback((clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  };
  const onMove = (e: PointerEvent) => dragging.current && setFromX(e.clientX);
  const onUp = () => (dragging.current = false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
    else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
  };

  return (
    <div className="compare" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <img src={after} alt={`${alt} — ${afterLabel.toLowerCase()}`} className="compare__img" draggable={false} loading="lazy" referrerPolicy="no-referrer" />
      <div className="compare__before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={`${alt} — ${beforeLabel.toLowerCase()}`} className="compare__img" draggable={false} loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <span className="compare__tag compare__tag--l">{beforeLabel}</span>
      <span className="compare__tag compare__tag--r">{afterLabel}</span>
      <div className="compare__line" style={{ left: `${pos}%` }} aria-hidden />
      <div
        className="compare__handle"
        style={{ left: `${pos}%` }}
        role="slider"
        tabIndex={0}
        aria-label={`Drag to compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={onKey}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
