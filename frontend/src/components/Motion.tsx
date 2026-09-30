import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Template spring: stiffness ~168, damping ~30. */
export const SPRING = { type: 'spring', stiffness: 168, damping: 30, mass: 1 } as const;

/** Section / text appear: translateY(40–150px) + fade. */
export function Appear({
  children,
  y = 40,
  delay = 0,
  className,
  style,
  as = 'div',
}: {
  children: ReactNode;
  y?: number;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </Tag>
  );
}

/** Card appear: translateY(140px) scale(.8) rotateX(14deg). */
export function CardAppear({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={{ transformPerspective: 1200, ...style }}
      initial={reduce ? false : { opacity: 0, y: 140, scale: 0.8, rotateX: 14 }}
      whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Animated counter (Fragment Mono digits), counts up when scrolled into view. */
export function Counter({ to, decimals = 0, suffix = '', prefix = '', duration = 1.8 }: { to: number; decimals?: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setVal });
    return () => c.stop();
  }, [inView, to, duration, reduce]);
  return (
    <span ref={ref} className="counter">
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Vertical rotating-word carousel ("Without a single callback for …"). */
export function WordRotator({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval, reduce]);
  return (
    <span className="rotator" aria-live="polite">
      <motion.span
        key={i}
        className="rotator__word"
        initial={reduce ? false : { y: '100%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={SPRING}
      >
        {words[i]}
      </motion.span>
    </span>
  );
}
