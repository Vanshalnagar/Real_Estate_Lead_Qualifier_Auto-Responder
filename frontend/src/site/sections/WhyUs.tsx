import { Appear, CardAppear, Counter, WordRotator } from '../../components/Motion';
import { Ticker } from '../../components/Ticker';
import { WHY } from '../content';

/** Small original partner marks for the logo ticker (fictional brands). */
function PartnerLogo({ name, i }: { name: string; i: number }) {
  const shapes = [
    <circle key="c" cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />,
    <path key="p" d="M3 17L10 3l7 14z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
    <rect key="r" x="3" y="3" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />,
    <path key="h" d="M3 10l7-7 7 7v7H3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
    <path key="s" d="M10 2l2.4 5.3L18 8l-4.2 3.8L15 18l-5-3-5 3 1.2-6.2L2 8l5.6-.7z" fill="currentColor" />,
    <path key="w" d="M2 14c3-6 5-6 8 0s5 6 8 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  ];
  return (
    <span className="partner">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        {shapes[i % shapes.length]}
      </svg>
      {name}
    </span>
  );
}

/** Topographic contour lines behind the rotating-word banner (the template's shader card). */
function Contours() {
  return (
    <svg className="contours" viewBox="0 0 500 280" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.2">
        <path d="M-20 60 C 60 20, 120 110, 200 70 S 330 10, 420 60 S 520 120, 540 90" />
        <path d="M-20 150 C 40 110, 110 190, 190 160 S 300 90, 380 150 S 500 220, 540 180" />
        <path d="M20 280 C 60 230, 140 250, 170 200 S 150 120, 230 110 S 330 180, 300 240 S 260 300, 330 300" />
        <path d="M330 -20 C 300 40, 360 80, 420 70 S 520 20, 520 -20" />
        <path d="M90 -20 C 70 30, 20 40, -20 30" />
        <path d="M430 280 C 400 230, 440 190, 500 200 S 540 250, 540 280" />
        <path d="M260 20 C 240 60, 280 90, 320 80 S 360 30, 330 10" />
      </g>
    </svg>
  );
}

export function WhyUs() {
  return (
    <section className="why frame" id="why-us">
      <div className="container section-y">
        <Appear className="why__head">
          <div>
            <span className="eyebrow">
              <span className="slashes">//</span> Why choose us
            </span>
            <h2 className="h2">
              {WHY.title[0]}{' '}
              <br />
              {WHY.title[1]}
            </h2>
          </div>
          <p className="body why__head-text">{WHY.text}</p>
        </Appear>

        <div className="why__grid">
          <CardAppear className="why__tall">
            <img src="/images/site/why-tall.jpg" alt="Modern apartment building facade" loading="lazy" />
            <div className="why__tall-overlay" />
            <p className="h4 why__tall-text">{WHY.tallText}</p>
            <Ticker className="why__logos" speed={30} gap={28}>
              {WHY.partners.map((p, i) => (
                <PartnerLogo key={p} name={p} i={i} />
              ))}
            </Ticker>
          </CardAppear>

          <div className="why__stats">
            <div className="why__row">
              <CardAppear className="stat stat--rating" delay={0.05}>
                <div>
                  <p className="stat__value mono">
                    <Counter to={WHY.rating.value} decimals={1} suffix="+" />
                  </p>
                  <p className="body stat__label">{WHY.rating.label}</p>
                </div>
                <div className="avatars">
                  {['/images/people/a1.jpg', '/images/people/a2.jpg', '/images/people/a3.jpg'].map((src) => (
                    <img key={src} src={src} alt="" loading="lazy" />
                  ))}
                  <span className="avatars__count">{WHY.rating.count}</span>
                </div>
              </CardAppear>
              <CardAppear className="stat stat--banner" delay={0.1}>
                <div className="banner">
                  <Contours />
                  <p className="h4 banner__text">
                    {WHY.callback} <WordRotator words={WHY.words} />
                  </p>
                </div>
              </CardAppear>
            </div>
            <div className="why__row">
              <CardAppear className="stat stat--coverage" delay={0.15}>
                <div className="coverage__text">
                  <p className="h3">{WHY.coverage.title}</p>
                  <p className="body">{WHY.coverage.text}</p>
                </div>
                <img src="/images/site/coverage.jpg" alt="Broker and client finalising a property deal" className="coverage__img" loading="lazy" />
              </CardAppear>
              <CardAppear className="stat stat--count" delay={0.2}>
                <div>
                  <p className="stat__value mono">
                    <Counter to={WHY.stat.value} suffix={WHY.stat.suffix} />
                  </p>
                  <p className="body stat__label">{WHY.stat.label}</p>
                </div>
                <p className="body">{WHY.stat.text}</p>
              </CardAppear>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
