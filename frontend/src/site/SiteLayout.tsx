import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Cursor, Grain, PageTransition, Preloader, ScrollProgress, useMagnetic } from '../components/Effects';
import { getLenis, useLenis } from '../lib/useLenis';
import { Chatbot } from './chat/Chatbot';
import { Footer } from './sections/Footer';
import { Nav } from './sections/Nav';

/** Scroll to #hash targets after navigation (works with Lenis), or to top on page change. */
function useHashScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const go = () => {
      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) {
          const lenis = getLenis();
          if (lenis) lenis.scrollTo(el, { offset: -80 });
          else el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          return;
        }
      }
      window.scrollTo(0, 0);
      getLenis()?.scrollTo(0, { immediate: true });
    };
    const t = setTimeout(go, hash ? 120 : 0);
    return () => clearTimeout(t);
  }, [pathname, hash]);
}

export function SiteLayout() {
  useLenis(true);
  useHashScroll();
  useMagnetic();
  return (
    <>
      <Preloader />
      <PageTransition />
      <ScrollProgress />
      <Nav />
      <main>
        <Outlet />
      </main>
      <Footer />
      <Chatbot />
      <Grain />
      <Cursor />
    </>
  );
}
