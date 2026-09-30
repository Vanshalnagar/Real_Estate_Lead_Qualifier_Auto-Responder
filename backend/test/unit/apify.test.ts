import { describe, expect, it } from 'vitest';
import {
  budgetAllows,
  buildTarget,
  buildTargets,
  dedupe,
  displayCity,
  formatPrice,
  isUnderConstruction,
  mapMagicBricksItem,
  portalCity,
  SOURCE,
  upscaleImage,
} from '../../src/services/apifyMap.js';

// A real item returned by thirdwatch~magicbricks-scraper (trimmed).
const ITEM = {
  listing_id: '85387799',
  title: '2BHK Multistorey Apartment for Rent in Shivanand Garden at Wanowrie',
  searchMode: 'rent',
  propertyType: 'apartment',
  propertyType_display: 'Apartment',
  bhk: 2,
  bedrooms: 2,
  bathrooms: 2,
  super_area_sqft: 1000,
  price_inr: 38000,
  furnishing: 'Furnished',
  floor_display: '1 of 6 Floor',
  facing: 'East',
  possession_date: 'Immediately',
  locality: 'Wanawari',
  city: 'Pune',
  latitude: 18.4936,
  longitude: 73.9098,
  project_name: 'Shivanand Garden',
  listed_by: 'agent',
  images: ['https://img.staticmb.com/mbphoto/property/cropped_images/ver2/X/Photo_h180_w240/85387799_11_img_180_240.jpeg'],
  amenities: ['12202 12208 12209'],
  description: '2 BHK, Multistorey Apartment is available for Rent in Wanowrie, Pune for 38,000',
  url: 'https://www.magicbricks.com/propertyDetails-pdpid-4d4235303332343838',
  posted_at: '2026-09-28T23:45:19.000Z',
};
const NOW = new Date('2026-09-30T12:00:00Z');

describe('Apify → Property mapping', () => {
  const t = buildTarget('rent', 'Pune', 12);

  it('maps a MagicBricks rent listing with source URL, images and facts', () => {
    const p = mapMagicBricksItem(ITEM, t, NOW)!;
    expect(p).toMatchObject({
      title: ITEM.title,
      listingType: 'rent',
      investment: false,
      type: 'apartment',
      price: 38000,
      priceLabel: '₹38,000 / month',
      city: 'Pune',
      locality: 'Wanawari',
      bedrooms: 2,
      bathrooms: 2,
      areaSqft: 1000,
      furnishing: 'furnished',
      source: SOURCE,
      externalId: '85387799',
      sourceUrl: ITEM.url,
      target: 'rent:Pune',
      projectName: 'Shivanand Garden',
    });
    expect(p.slug).toMatch(/-mb85387799$/);
    expect(p.images[0]).toContain('Photo_h470_w1080');
    expect(p.amenities).toEqual([]); // numeric portal codes are dropped
    expect(p.description).toContain('Wanowrie');
    expect(p.listedAt.toISOString()).toBe('2026-09-28T23:45:19.000Z');
  });

  it('rejects items that cannot be shown honestly (no id, price or original URL)', () => {
    expect(mapMagicBricksItem({ ...ITEM, url: '' }, t, NOW)).toBeNull();
    expect(mapMagicBricksItem({ ...ITEM, url: 'https://evil.example/x' }, t, NOW)).toBeNull();
    expect(mapMagicBricksItem({ ...ITEM, price_inr: 0 }, t, NOW)).toBeNull();
    expect(mapMagicBricksItem({ ...ITEM, listing_id: undefined }, t, NOW)).toBeNull();
  });

  it('flags investment listings: plots, invest targets, under-construction sales', () => {
    const buy = buildTarget('buy', 'Pune', 12);
    const sale = { ...ITEM, searchMode: 'buy', price_inr: 9500000 };
    expect(mapMagicBricksItem(sale, buy, NOW)!).toMatchObject({ listingType: 'sale', investment: false, priceLabel: '₹95 L' });
    expect(mapMagicBricksItem({ ...sale, possession_date: "Dec '28" }, buy, NOW)!.investment).toBe(true);
    expect(mapMagicBricksItem({ ...sale, propertyType: 'plot' }, buy, NOW)!).toMatchObject({ type: 'plot', investment: true });
    expect(mapMagicBricksItem(sale, buildTarget('invest', 'Pune', 12), NOW)!.investment).toBe(true);
  });

  it('maps villas / independent houses and normalises city names', () => {
    const p = mapMagicBricksItem({ ...ITEM, propertyType: 'independent-house', city: 'Bangalore' }, t, NOW)!;
    expect(p.type).toBe('villa');
    expect(p.city).toBe('Bengaluru');
    expect(displayCity('gurgaon')).toBe('Gurugram');
    expect(portalCity('Bengaluru')).toBe('Bangalore');
  });

  it('de-duplicates the same listing within a dataset', () => {
    const a = mapMagicBricksItem(ITEM, t, NOW)!;
    const b = mapMagicBricksItem({ ...ITEM, price_inr: 36000 }, t, NOW)!;
    const out = dedupe([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(36000);
  });

  it('builds rent / buy / invest targets per city', () => {
    const ts = buildTargets(['Pune', 'Bengaluru'], 10);
    expect(ts.map((x) => x.key)).toEqual(['rent:Pune', 'buy:Pune', 'invest:Pune', 'rent:Bangalore', 'buy:Bangalore', 'invest:Bangalore']);
    expect(ts[2].input).toMatchObject({ searchMode: 'buy', propertyType: ['plot'], city: 'Pune', maxResults: 10 });
  });

  it('helpers: price labels, image upscaling, possession parsing', () => {
    expect(formatPrice(14500000, false)).toBe('₹1.45 Cr');
    expect(formatPrice(25000, true)).toBe('₹25,000 / month');
    expect(upscaleImage('https://x/Photo_h180_w240/a_180_240.jpeg')).toBe('https://x/Photo_h470_w1080/a_470_1080.jpeg');
    expect(isUnderConstruction('Immediately', NOW)).toBe(false);
    expect(isUnderConstruction("Mar '27", NOW)).toBe(true);
    expect(isUnderConstruction("Jan '25", NOW)).toBe(false);
  });
});

describe('budget pacing', () => {
  const cycle = { cycleStart: new Date('2026-09-16T00:00:00Z'), cycleEnd: new Date('2026-10-16T00:00:00Z') };
  const base = { ...cycle, budgetUsd: 4.5, limitUsd: 5, estimatedRunUsd: 0.036 };

  it('allows a scrape while spending is under the pro-rata allowance', () => {
    // Half-way through the cycle: ~$2.25 allowed.
    expect(budgetAllows({ ...base, usageUsd: 1.0, now: new Date('2026-10-01T00:00:00Z') }).ok).toBe(true);
  });
  it('defers scheduled scrapes when ahead of the pro-rata allowance', () => {
    expect(budgetAllows({ ...base, usageUsd: 3.0, now: new Date('2026-10-01T00:00:00Z') }).ok).toBe(false);
  });
  it('bootstrap scrapes ignore pacing but never exceed the hard cap', () => {
    expect(budgetAllows({ ...base, usageUsd: 3.0, now: new Date('2026-10-01T00:00:00Z'), bootstrap: true }).ok).toBe(true);
    expect(budgetAllows({ ...base, usageUsd: 4.49, now: new Date('2026-10-15T00:00:00Z'), bootstrap: true }).ok).toBe(false);
  });
  it('the Apify account limit caps the budget', () => {
    expect(budgetAllows({ ...base, budgetUsd: 50, usageUsd: 4.99, now: new Date('2026-10-15T00:00:00Z'), bootstrap: true }).capUsd).toBe(5);
  });
});
