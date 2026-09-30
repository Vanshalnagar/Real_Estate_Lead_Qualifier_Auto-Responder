import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/**
 * Intro loader (the template's "Loading Screen" layer): wordmark + counting percentage, then a
 * curtain that lifts off the page. Shown once per browser session.
 */
export function Preloader() {
  const [show, setShow] = useState(() => {
    if (reducedMotion()) return false;
    try {
      return !sessionStorage.getItem('nestr_intro');
    } catch {
      return false;
    }
  });
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!show) return;
    document.documentElement.style.overflow = 'hidden';
    const c = animate(0, 100, {
      duration: 1.5,
      ease: [0.65, 0, 0.35, 1],
      onUpdate: (v) => setPct(Math.round(v)),
      onComplete: () => {
        try {
          sessionStorage.setItem('nestr_intro', '1');
        } catch {
          /* storage disabled */
        }
        setTimeout(() => setShow(false), 180);
      },
    });
    return () => {
      c.stop();
      document.documentElement.style.overflow = '';
    };
  }, [show]);
  useEffect(() => {
    if (!show) document.documentElement.style.overflow = '';
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="loader" aria-hidden exit={{ clipPath: 'inset(0 0 100% 0)' }} transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}>
          <div className="loader__inner">
            <p className="loader__word">
              {'NESTR'.split('').map((ch, i) => (
                <motion.span key={i} initial={{ y: '110%' }} animate={{ y: '0%' }} transition={{ delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                  {ch}
                </motion.span>
              ))}
              <motion.span className="loader__dot" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.55, type: 'spring', stiffness: 300, damping: 14 }} />
            </p>
            <div className="loader__bar">
              <span style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <div className="loader__meta">
              <span>Finding the right property</span>
              <span className="mono">{String(pct).padStart(3, '0')}%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Route change curtain (the template's "Page Transition" layer). */
export function PageTransition() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reducedMotion()) setKey((k) => k + 1);
  }, [pathname]);
  return (
    <AnimatePresence>
      {key > 0 && (
        <motion.div
          key={key}
          className="curtain"
          aria-hidden
          initial={{ clipPath: 'inset(100% 0 0 0)' }}
          animate={{ clipPath: ['inset(100% 0 0 0)', 'inset(0% 0 0 0)', 'inset(0 0 100% 0)'] }}
          transition={{ duration: 1.05, times: [0, 0.42, 1], ease: [0.76, 0, 0.24, 1] }}
          onAnimationComplete={() => setKey(0)}
        >
          <span className="curtain__word">
            NESTR<span>.</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Thin orange reading-progress bar above the nav. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden />;
}

/** Subtle animated film grain for a premium, photographic feel. */
export function Grain() {
  return <div className="grain" aria-hidden />;
}

/**
 * Custom cursor: an orange dot plus a trailing ring. The ring grows over interactive elements and
 * shows a contextual label ("Drag", "View", "Open") from `data-cursor` or known components.
 * Only on fine pointers; the native cursor stays visible for accessibility.
 */
export function Cursor() {
  const reduce = useReducedMotion();
  const [enabled] = useState(() => finePointer() && !reducedMotion());
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 380, damping: 32, mass: 0.5 });
  const ry = useSpring(y, { stiffness: 380, damping: 32, mass: 0.5 });
  const [state, setState] = useState<{ hover: boolean; label: string; hidden: boolean }>({ hover: false, label: '', hidden: true });

  useEffect(() => {
    if (!enabled || reduce) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const t = e.target as Element | null;
      const labelled = t?.closest?.('[data-cursor]') as HTMLElement | null;
      let label = labelled?.dataset.cursor ?? '';
      if (!label && t?.closest?.('.compare, .ticker')) label = 'Drag';
      else if (!label && t?.closest?.('.lcard, .post, .pcard')) label = 'View';
      const hover = Boolean(label) || Boolean(t?.closest?.('a, button, select, input, textarea, [role="slider"], label'));
      setState((s) => (s.hover === hover && s.label === label && !s.hidden ? s : { hover, label, hidden: false }));
    };
    const leave = () => setState((s) => ({ ...s, hidden: true }));
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [enabled, reduce, x, y]);

  if (!enabled || reduce) return null;
  return (
    <>
      <motion.div className="cursor-dot" style={{ x, y, opacity: state.hidden ? 0 : 1 }} aria-hidden />
      <motion.div
        className={`cursor-ring ${state.hover ? 'is-hover' : ''} ${state.label ? 'has-label' : ''}`}
        style={{ x: rx, y: ry, opacity: state.hidden ? 0 : 1 }}
        aria-hidden
      >
        {state.label && <span>{state.label}</span>}
      </motion.div>
    </>
  );
}

/**
 * Magnetic buttons: primary buttons and round controls lean towards the pointer.
 * One delegated listener for the whole site instead of wiring every button.
 */
export function useMagnetic(selector = '.btn--orange, .round-btn, .icon-btn, .chat-launcher') {
  useEffect(() => {
    if (!finePointer() || reducedMotion()) return;
    let active: HTMLElement | null = null;
    const reset = (el: HTMLElement) => {
      el.style.transform = '';
      el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
    };
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
      if (active && active !== el) reset(active);
      active = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      el.style.transition = 'transform .15s ease-out';
      el.style.transform = `translate(${dx * 10}px, ${dy * 8}px)`;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [selector]);
}
