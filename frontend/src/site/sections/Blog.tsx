import { ButtonLink } from '../../components/Button';
import { Appear, CardAppear } from '../../components/Motion';
import { BLOG } from '../content';

export function Blog() {
  return (
    <section className="blog frame" id="blogs">
      <div className="container section-y">
        <Appear className="head-split">
          <div>
            <span className="eyebrow">
              <span className="slashes">//</span> Blog
            </span>
            <h2 className="h2">{BLOG.title}</h2>
            <p className="body blog__lead">{BLOG.text}</p>
          </div>
          <ButtonLink to="/#blogs" label="All Articles" glow />
        </Appear>
        <div className="blog__grid">
          {BLOG.posts.map((p, i) => (
            <CardAppear key={p.title} delay={i * 0.08}>
              <a href="#blogs" className="post" onClick={(e) => e.preventDefault()}>
                <img src={p.img} alt="" className="post__img" loading="lazy" />
                <div className="post__content">
                  <span className="pill">{p.cat}</span>
                  <h3 className="h4 post__title">{p.title}</h3>
                  <div className="post__author">
                    <img src={p.avatar} alt="" />
                    <span>{p.author}</span>
                    <span className="dot" aria-hidden />
                    <span>{p.date}</span>
                  </div>
                </div>
              </a>
            </CardAppear>
          ))}
        </div>
      </div>
    </section>
  );
}
