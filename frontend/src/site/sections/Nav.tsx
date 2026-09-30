import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../../components/Button';
import {
  ChevronDown,
  Close,
  Facebook,
  IconAgent,
  IconBuilding,
  IconChart,
  IconCrane,
  IconHome,
  IconKey,
  Instagram,
  Menu,
  Phone,
  XLogo,
} from '../../components/Icons';
import { RollingText } from '../../components/RollingText';
import { useAuth } from '../../lib/auth';
import { useChat } from '../../lib/chat';
import { BRAND, MEGA_ITEMS, MORE_ITEMS, NAV_LINKS } from '../content';

const MEGA_ICON = { home: IconHome, key: IconKey, chart: IconChart, crane: IconCrane, building: IconBuilding, agent: IconAgent } as const;

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="NESTR.">
      NESTR<span className="wordmark__dot">.</span>
    </span>
  );
}

export function Nav() {
  const { openChat } = useChat();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mega, setMega] = useState(false);
  const [more, setMore] = useState(false);
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    setMobile(false);
    setMega(false);
    setMore(false);
  }, [loc.pathname, loc.hash]);

  const findProperty = () => openChat({ prefill: '' });

  return (
    <nav className={`nav ${scrolled ? 'nav--scrolled' : ''} ${mobile ? 'nav--open' : ''}`} aria-label="Main">
      <div className="nav__topbar">
        <div className="nav__topbar-inner">
          <a href={`tel:${BRAND.phone.replace(/\s/g, '')}`} className="nav__phone">
            <Phone size={16} />
            <span>{BRAND.phone}</span>
          </a>
          <div className="nav__socials">
            <a href="https://www.facebook.com/" aria-label="Facebook" target="_blank" rel="noreferrer">
              <Facebook size={16} />
            </a>
            <a href="https://www.instagram.com/" aria-label="Instagram" target="_blank" rel="noreferrer">
              <Instagram size={16} />
            </a>
            <a href="https://x.com/" aria-label="X" target="_blank" rel="noreferrer">
              <XLogo size={16} />
            </a>
          </div>
        </div>
      </div>

      <div className="nav__bar">
        <div className="nav__bar-inner">
          <div className="nav__left">
            <Link to="/" className="nav__logo" aria-label="NESTR. home">
              <Wordmark />
            </Link>
            <ul className="nav__links">
              {NAV_LINKS.map((l) => {
                if (l.mega) {
                  return (
                    <li key={l.label} className="nav__item" onMouseEnter={() => setMega(true)} onMouseLeave={() => setMega(false)}>
                      <button className="nav__link roll-host" aria-expanded={mega} aria-haspopup="true" onClick={() => setMega((v) => !v)} onFocus={() => setMega(true)}>
                        <RollingText text={l.label} />
                        <ChevronDown size={14} />
                      </button>
                    </li>
                  );
                }
                if (l.dropdown) {
                  return (
                    <li key={l.label} className="nav__item nav__item--dd" onMouseEnter={() => setMore(true)} onMouseLeave={() => setMore(false)}>
                      <button className="nav__link roll-host" aria-expanded={more} aria-haspopup="true" onClick={() => setMore((v) => !v)}>
                        <RollingText text={l.label} />
                        <ChevronDown size={14} />
                      </button>
                      <AnimatePresence>
                        {more && (
                          <motion.ul className="nav__dropdown" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                            {MORE_ITEMS.map((m) => (
                              <li key={m.label}>
                                <Link to={m.to} className="roll-host">
                                  <RollingText text={m.label} />
                                </Link>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                }
                return (
                  <li key={l.label} className="nav__item">
                    <Link to={l.to} className="nav__link roll-host">
                      <RollingText text={l.label} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="nav__right">
            {user ? (
              <Link to="/account" className="nav__account" title={`Signed in as ${user.email}`}>
                {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{user.name.slice(0, 1).toUpperCase()}</span>}
              </Link>
            ) : (
              <Link to="/login" className="nav__signin roll-host">
                <RollingText text="Sign in" />
              </Link>
            )}
            <Button label="Find My Property" variant={scrolled ? 'dark' : 'orange'} className="nav__cta" onClick={findProperty} />
          </div>
          <button className="nav__burger" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile((v) => !v)}>
            {mobile ? <Close /> : <Menu />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mega && (
          <motion.div
            className="mega"
            onMouseEnter={() => setMega(true)}
            onMouseLeave={() => setMega(false)}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <div className="mega__inner">
              <div className="mega__grid">
                {MEGA_ITEMS.map((m) => {
                  const Icon = MEGA_ICON[m.icon];
                  const content = (
                    <>
                      <span className="mega__icon">
                        <Icon size={22} />
                      </span>
                      <span className="mega__text">
                        <span className="mega__title">{m.title}</span>
                        <span className="mega__sub">{m.text}</span>
                      </span>
                    </>
                  );
                  return m.to === '#chat' ? (
                    <button key={m.title} className="mega__item" onClick={() => { setMega(false); openChat({ prefill: 'I would like to talk to an agent about ' }); }}>
                      {content}
                    </button>
                  ) : (
                    <Link key={m.title} to={m.to} className="mega__item">
                      {content}
                    </Link>
                  );
                })}
              </div>
              <div className="mega__cta">
                <img src="/images/site/mega-cta.jpg" alt="Modern apartment complex with a pool" loading="lazy" />
                <div className="mega__cta-overlay" />
                <span className="pill mega__cta-pill">Instant reply</span>
                <div className="mega__cta-content">
                  <div>
                    <p className="h4">Looking for something specific?</p>
                    <p className="body body-2">Tell us your requirement and get matching listings in seconds.</p>
                  </div>
                  <Button label="Start Chat" onClick={() => { setMega(false); openChat(); }} small />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobile && (
          <motion.div className="mnav" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
            <ul>
              {NAV_LINKS.filter((l) => !l.dropdown).map((l) => (
                <li key={l.label}>
                  <Link to={l.mega ? '/buy' : l.to}>{l.mega ? 'Properties' : l.label}</Link>
                </li>
              ))}
              {MORE_ITEMS.map((m) => (
                <li key={m.label}>
                  <Link to={m.to}>{m.label}</Link>
                </li>
              ))}
              <li>
                <Link to={user ? '/account' : '/login'}>{user ? `My account (${user.name.split(' ')[0]})` : 'Sign in / Register'}</Link>
              </li>
            </ul>
            <Button label="Find My Property" block onClick={() => { setMobile(false); findProperty(); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
