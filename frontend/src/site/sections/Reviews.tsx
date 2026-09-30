import { Quote } from '../../components/Icons';
import { Appear } from '../../components/Motion';
import { Ticker } from '../../components/Ticker';
import { REVIEWS } from '../content';
import { RatingBadge } from './Hero';

function ReviewCard({ r }: { r: (typeof REVIEWS)[number] }) {
  return (
    <figure className="review">
      <Quote size={30} className="review__quote" />
      <blockquote className="body review__text">{r.text}</blockquote>
      <div className="review__divider" />
      <figcaption className="review__who">
        <img src={r.img} alt="" loading="lazy" />
        <div>
          <p className="h4">{r.name}</p>
          <p className="body">{r.place}</p>
        </div>
      </figcaption>
    </figure>
  );
}

export function Reviews() {
  const half = Math.ceil(REVIEWS.length / 2);
  const rowA = [...REVIEWS.slice(0, half), ...REVIEWS.slice(half)];
  const rowB = [...REVIEWS.slice(half), ...REVIEWS.slice(0, half)];
  return (
    <section className="reviews frame" id="reviews">
      <div className="section-y">
        <Appear className="head-center container">
          <RatingBadge />
          <h2 className="h2">What Our Clients Are Saying</h2>
          <p className="body">Home buyers, tenants and investors share their experience finding property with NESTR.</p>
        </Appear>
        <div className="reviews__rows">
          <Ticker speed={34} gap={16}>
            {rowA.map((r, i) => (
              <ReviewCard key={`a${i}`} r={r} />
            ))}
          </Ticker>
          <Ticker speed={34} gap={16} reverse>
            {rowB.map((r, i) => (
              <ReviewCard key={`b${i}`} r={r} />
            ))}
          </Ticker>
        </div>
      </div>
    </section>
  );
}
