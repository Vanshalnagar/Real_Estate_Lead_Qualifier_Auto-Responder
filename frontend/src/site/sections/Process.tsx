import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { useRef, useState } from 'react';
import { PhoneButton } from '../../components/Button';
import { Chat, IconClipboard, IconSpark, IconUsers } from '../../components/Icons';
import { Appear } from '../../components/Motion';
import { BRAND, PROCESS } from '../content';

const ICONS = { chat: Chat, spark: IconSpark, clipboard: IconClipboard, users: IconUsers } as const;

export function Process() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const line = useSpring(scrollYProgress, { stiffness: 168, damping: 30 });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const n = PROCESS.steps.length;
    setActive(Math.min(n - 1, Math.max(0, Math.floor(v * n * 0.999))));
  });

  return (
    <section className="process frame" id="process">
      {/* Tall scroll area; the inner block sticks while the steps advance (one step per viewport). */}
      <div className="process__scroll" ref={ref} style={{ height: `${PROCESS.steps.length * 70 + 60}vh` }}>
        <div className="process__sticky">
          <div className="container process__inner">
            <Appear className="head-center">
              <span className="eyebrow">
                <span className="slashes">//</span> Our process
              </span>
              <h2 className="h2">{PROCESS.title}</h2>
              <p className="body process__lead">{PROCESS.text}</p>
            </Appear>

            <div className="process__body">
              <div className="process__images">
                {PROCESS.steps.map((s, i) => (
                  <motion.img
                    key={s.img}
                    src={s.img}
                    alt={s.title}
                    loading="lazy"
                    className="process__img"
                    initial={false}
                    animate={
                      reduce
                        ? { opacity: i === active ? 1 : 0 }
                        : {
                            opacity: i <= active ? 1 : 0,
                            scale: i < active ? 0.92 : 1,
                            y: i <= active ? '0%' : '12%',
                            filter: i < active ? 'brightness(.55)' : 'brightness(1)',
                          }
                    }
                    transition={{ type: 'spring', stiffness: 168, damping: 30 }}
                    style={{ zIndex: i }}
                  />
                ))}
              </div>

              <div className="process__track" aria-hidden>
                <motion.div className="process__line" style={{ scaleY: line }} />
              </div>

              <ol className="process__steps">
                {PROCESS.steps.map((s, i) => {
                  const Icon = ICONS[s.icon as keyof typeof ICONS];
                  const open = i === active;
                  return (
                    <li key={s.title} className={`step ${open ? 'step--open' : ''} ${i < active ? 'step--done' : ''}`}>
                      <div className="step__head">
                        <span className="step__icon">
                          <Icon size={26} />
                        </span>
                        <h3 className="h4 step__title">{s.title}</h3>
                      </div>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            className="step__content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 32 }}
                          >
                            <p className="body">{s.text}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="process__cta">
              <PhoneButton phone={BRAND.phone} glow />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
