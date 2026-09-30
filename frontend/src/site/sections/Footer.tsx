import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Facebook, Instagram, XLogo } from '../../components/Icons';
import { BRAND, FOOTER } from '../content';
import { HONEYPOTS } from '../leadForm';

export function Footer() {
  const [sub, setSub] = useState<'idle' | 'done' | 'bad'>('idle');
  const onSubscribe = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (HONEYPOTS.some((h) => String(fd.get(h) ?? '').trim())) return;
    const email = String(fd.get('email') ?? '');
    setSub(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'done' : 'bad');
  };
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__cols">
          <div className="footer__col">
            <p className="footer__heading">Quick links</p>
            {FOOTER.quick.map((l) => (
              <Link key={l.label} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="footer__col">
            <p className="footer__heading">Services</p>
            {FOOTER.services.map((l) => (
              <Link key={l.label} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="footer__col">
            <p className="footer__heading">Contact us</p>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            <a href={`tel:${BRAND.phone.replace(/\s/g, '')}`}>{BRAND.phone}</a>
            <span>{BRAND.address[0]}</span>
            <span>{BRAND.address[1]}</span>
          </div>
        </div>
        <div className="footer__divider" />
        <div className="footer__top">
          <p className="footer__wordmark" aria-label="NESTR.">
            NESTR<span className="footer__dot" aria-hidden />
          </p>
          <div className="footer__card">
            <p className="h4">Subscribe for new listings &amp; market updates</p>
            <form className="footer__form" onSubmit={onSubscribe} noValidate>
              <input className="input" type="email" name="email" placeholder="Enter your email" aria-label="Email for newsletter" />
              {HONEYPOTS.map((h) => (
                <input key={h} type="text" name={h} className="hp" tabIndex={-1} autoComplete="off" aria-hidden />
              ))}
              <Button type="submit" label={sub === 'done' ? 'Subscribed' : 'Subscribe'} chevron={false} />
            </form>
            {sub === 'bad' && <p className="field__error">Please enter a valid email.</p>}
            <p className="eyebrow footer__follow">Follow us on</p>
            <div className="footer__socials">
              <a className="icon-btn" href="https://www.facebook.com/" aria-label="Facebook" target="_blank" rel="noreferrer">
                <Facebook />
              </a>
              <a className="icon-btn" href="https://x.com/" aria-label="X" target="_blank" rel="noreferrer">
                <XLogo />
              </a>
              <a className="icon-btn" href="https://www.instagram.com/" aria-label="Instagram" target="_blank" rel="noreferrer">
                <Instagram />
              </a>
            </div>
          </div>
        </div>
        <div className="footer__divider" />
        <div className="footer__bottom">
          <span>© 2026 NESTR. All rights reserved. A fictional brand for demonstration.</span>
          <div className="footer__legal">
            <Link to="/#faq">Privacy Policy</Link>
            <Link to="/#faq">Terms &amp; Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
