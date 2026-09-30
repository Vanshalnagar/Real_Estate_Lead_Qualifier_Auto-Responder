import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Appear } from '../../components/Motion';
import { useChat } from '../../lib/chat';
import { ABOUT } from '../content';

/** Word-by-word reveal: faint → orange (currently revealing) → white, driven by scroll. */
function RevealText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const words = text.split(' ');
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const [pos, setPos] = useState(reduce ? words.length + 2 : 0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => !reduce && setPos(v * (words.length + 3)));
  return (
    <p ref={ref} className="reveal-text" aria-label={text}>
      {words.map((w, i) => {
        const d = pos - i;
        const state = d >= 3 ? 'on' : d > 0 ? 'active' : 'off';
        return (
          <span key={i} className={`reveal-word reveal-word--${state}`} aria-hidden>
            {w}{' '}
          </span>
        );
      })}
    </p>
  );
}

export function About() {
  const { openChat } = useChat();
  const imgRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: imgRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-8%', '8%']);

  return (
    <section className="about frame" id="about-us">
      <Appear className="panel about__panel">
        <div className="container section-y about__inner">
          <div className="about__top">
            <span className="eyebrow">
              <span className="slashes">//</span> About us
            </span>
            <RevealText text={ABOUT.text} />
          </div>
          <div className="about__bottom">
            <div className="about__card">
              <h3 className="h3">
                {ABOUT.cardTitle[0]}
                <br />
                {ABOUT.cardTitle[1]}
              </h3>
              <div className="about__card-foot">
                <p className="body body-2">{ABOUT.cardText}</p>
                <Button label="Talk to an Expert" onClick={() => openChat({ prefill: 'Hi, I would like to talk to an expert about ' })} />
              </div>
            </div>
            <div className="about__image" ref={imgRef}>
              <motion.img src="/images/site/about.jpg" alt="Broker shaking hands with a client after a deal" style={{ y, scale: 1.18 }} loading="lazy" />
            </div>
          </div>
        </div>
      </Appear>
    </section>
  );
}
