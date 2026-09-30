import { useEffect } from 'react';
import { About } from '../sections/About';
import { Areas } from '../sections/Areas';
import { Blog } from '../sections/Blog';
import { CtaForm } from '../sections/CtaForm';
import { Faq } from '../sections/Faq';
import { FeaturedProperties } from '../sections/FeaturedProperties';
import { Hero } from '../sections/Hero';
import { Process } from '../sections/Process';
import { Reviews } from '../sections/Reviews';
import { Services } from '../sections/Services';
import { WhyUs } from '../sections/WhyUs';

export function Home() {
  useEffect(() => {
    document.title = 'NESTR. | Find the Right Property — Buy, Rent & Invest';
  }, []);
  return (
    <>
      <Hero />
      <Services />
      <About />
      <WhyUs />
      <Process />
      <FeaturedProperties />
      <Reviews />
      <Areas />
      <Blog />
      <Faq />
      <CtaForm />
    </>
  );
}
