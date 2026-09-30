import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Plus } from '../../components/Icons';
import { Appear } from '../../components/Motion';
import { FAQ } from '../content';

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="faq frame" id="faq">
      <div className="container section-y">
        <Appear className="head-center">
          <span className="eyebrow">
            <span className="slashes">//</span> FAQ’s
          </span>
          <h2 className="h2">
            {FAQ.title[0]}
            <br />
            {FAQ.title[1]}
          </h2>
        </Appear>
        <Appear className="faq__list" y={60}>
          {FAQ.items.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={`faq__item ${isOpen ? 'faq__item--open' : ''}`}>
                <button className="faq__q" aria-expanded={isOpen} aria-controls={`faq-a-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                  <span className="h4">{f.q}</span>
                  <motion.span className="faq__icon" animate={{ rotate: isOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                    <Plus />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-a-${i}`}
                      className="faq__a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 30 }}
                    >
                      <p className="body">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Appear>
      </div>
    </section>
  );
}
