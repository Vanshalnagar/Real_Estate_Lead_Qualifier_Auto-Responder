import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Fragment, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { Button, PhoneButton } from '../../components/Button';
import { CheckCircle, IconSpark, Leaf, Send, Star } from '../../components/Icons';
import { SPRING } from '../../components/Motion';
import { useChat } from '../../lib/chat';
import { BRAND, HERO } from '../content';

export function RatingBadge({ value = HERO.rating }: { value?: string }) {
  return (
    <div className="badge" aria-label={`Rated ${value} out of 5`}>
      <Leaf />
      <div className="badge__content">
        <div className="badge__stars">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={13} />
          ))}
        </div>
        <div className="badge__title">
          <span>{value}</span>
          <span>Highly Rated</span>
        </div>
      </div>
      <Leaf flip />
    </div>
  );
}

/** Headline revealed word by word from behind a mask. */
function SplitHeadline({ lines, delay = 0.15 }: { lines: string[]; delay?: number }) {
  const reduce = useReducedMotion();
  let n = 0;
  return (
    <h1 className="h1 hero__title" aria-label={lines.join(' ')}>
      {lines.map((line, li) => (
        <span className="split-line" key={li} aria-hidden>
          {line.split(' ').map((w, wi) => {
            const i = n++;
            return (
              <Fragment key={wi}>
                <span className="split-word">
                  <motion.span
                    initial={reduce ? false : { y: '110%', rotate: 4 }}
                    animate={{ y: '0%', rotate: 0 }}
                    transition={{ ...SPRING, delay: delay + i * 0.055 }}
                  >
                    {w}
                  </motion.span>
                </span>{' '}
              </Fragment>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

const EXAMPLES = [
  '2BHK on rent in Powai under ₹65k, moving next month',
  'Villa in Whitefield around ₹3 Cr for my family',
  'Pre-leased office in Gurugram with 7%+ rental yield',
  'Furnished 1BHK near Hinjewadi IT park, urgent',
];

/** Cycles example queries in the placeholder like someone typing. */
function useTypewriter(words: string[], active: boolean) {
  const [text, setText] = useState('');
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active || reduce) {
      setText(words[0]);
      return;
    }
    let w = 0;
    let i = 0;
    let deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = words[w];
      i += deleting ? -1 : 1;
      setText(word.slice(0, i));
      let wait = deleting ? 22 : 48;
      if (!deleting && i === word.length) {
        deleting = true;
        wait = 1800;
      } else if (deleting && i === 0) {
        deleting = false;
        w = (w + 1) % words.length;
        wait = 350;
      }
      t = setTimeout(tick, wait);
    };
    t = setTimeout(tick, 1200);
    return () => clearTimeout(t);
  }, [words, active, reduce]);
  return text;
}

/** AI search bar: describe the property in plain words → the assistant replies with matches. */
function AiSearch() {
  const { openChat } = useChat();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const typed = useTypewriter(EXAMPLES, !value && !focused);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      openChat();
      return;
    }
    openChat({ send: q });
    setValue('');
  };
  return (
    <form className="aisearch" onSubmit={submit} role="search" aria-label="Describe the property you want">
      <span className="aisearch__icon" aria-hidden>
        <IconSpark size={20} />
      </span>
      <input
        className="aisearch__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? 'Describe your dream home in your own words…' : typed}
        aria-label="Describe the property you are looking for"
        maxLength={300}
      />
      <button className="aisearch__btn" type="submit" data-cursor="Match">
        <span>Match me</span>
        <Send size={16} />
      </button>
    </form>
  );
}

export function Hero() {
  const { openChat } = useChat();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: -999, y: -999, on: false });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const imgScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 1.18]);
  const contentY = useTransform(scrollYProgress, [0, 1], reduce ? ['0px', '0px'] : ['0px', '-90px']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], reduce ? [1, 1] : [1, 0]);

  const onMove = (e: PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = ref.current!.getBoundingClientRect();
    setSpot({ x: e.clientX - r.left, y: e.clientY - r.top, on: true });
  };

  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 60 }, animate: { opacity: 1, y: 0 }, transition: { ...SPRING, delay: d } });

  return (
    <header className="hero frame" id="hero-section">
      <div className="hero__box" ref={ref} onPointerMove={onMove} onPointerLeave={() => setSpot((s) => ({ ...s, on: false }))}>
        <motion.div className="hero__media" style={{ scale: imgScale }}>
          <motion.img
            src="/images/site/hero.jpg"
            alt="Modern home with glass walls at dusk"
            className="hero__img"
            initial={reduce ? false : { scale: 1.12 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            fetchPriority="high"
          />
          <img
            src="/images/site/hero-reveal.jpg"
            alt=""
            aria-hidden
            className="hero__img hero__reveal"
            style={{
              opacity: spot.on ? 1 : 0,
              WebkitMaskImage: `radial-gradient(circle 190px at ${spot.x}px ${spot.y}px, #000 45%, transparent 100%)`,
              maskImage: `radial-gradient(circle 190px at ${spot.x}px ${spot.y}px, #000 45%, transparent 100%)`,
            }}
          />
        </motion.div>
        <div className="hero__overlay" />

        <motion.div className="hero__content" style={{ y: contentY, opacity: contentOpacity }}>
          <div className="hero__top">
            <div className="hero__left">
              <motion.span className="hero__kicker" {...rise(0.05)}>
                <span className="hero__live" /> AI matchmaker online · replies in seconds
              </motion.span>
              <SplitHeadline lines={HERO.title} />
              <motion.div className="hero__actions" {...rise(0.45)}>
                <AiSearch />
                <PhoneButton phone={BRAND.phone} glow />
              </motion.div>
            </div>
            <motion.div className="hero__card" {...rise(0.6)}>
              <img src="/images/site/hero-card.jpg" alt="Minimal white modern home" className="hero__card-img" />
              <div className="hero__card-body">
                <p className="h4 hero__card-title">{HERO.card.title}</p>
                <Button label={HERO.card.cta} variant="outline" onClick={() => openChat()} />
              </div>
            </motion.div>
          </div>
          <motion.div className="hero__divider" {...rise(0.7)} />
          <motion.div className="hero__bottom" {...rise(0.75)}>
            <ul className="hero__benefits">
              {HERO.benefits.map((b) => (
                <li key={b}>
                  <CheckCircle size={20} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <RatingBadge />
          </motion.div>
        </motion.div>
      </div>
    </header>
  );
}
