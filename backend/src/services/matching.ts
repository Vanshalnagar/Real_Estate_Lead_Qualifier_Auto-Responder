import { config } from '../config.js';
import { Property, type PropertyDoc } from '../db/models.js';
import { LIVE_FILTER, requestFreshData } from './apify.js';
import type { Classification, MatchSummary } from '../pipeline/rules.js';

// Old and alternate city names customers commonly use.
const CITY_ALIASES: Record<string, string> = {
  gurgaon: 'gurugram',
  bangalore: 'bengaluru',
  bengaluru: 'bengaluru',
  bombay: 'mumbai',
  madras: 'chennai',
  poona: 'pune',
  'navi mumbai': 'mumbai',
  'new delhi': 'delhi',
};

function norm(s: string): string {
  let out = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [alias, city] of Object.entries(CITY_ALIASES)) out = out.replace(new RegExp(`\\b${alias}\\b`, 'g'), city);
  return out;
}

/**
 * Relevance score for one listing (negative = excluded). A location the customer named must match the
 * listing's city or locality; `sameCity` lists cities of named localities (e.g. "Baner" → "Pune"), which
 * lets other listings in that city through with a smaller bonus.
 */
export function scoreProperty(
  p: Pick<PropertyDoc, 'listingType' | 'investment' | 'type' | 'price' | 'city' | 'locality' | 'bedrooms'>,
  c: Classification,
  sameCity: string[] = [],
): number {
  let score = 0;
  const wantsRent = c.intent === 'renter' || c.budget.period === 'monthly';
  if (c.intent !== 'unclear' || c.budget.period) {
    if (wantsRent && p.listingType !== 'rent') return -1;
    if (!wantsRent && p.listingType !== 'sale') return -1;
  }
  const locs = c.location.preferred.map(norm).filter(Boolean);
  let locHit = false;
  if (locs.length) {
    const hay = norm(`${p.city} ${p.locality ?? ''}`);
    locHit = locs.some((l) => hay.includes(l) || l.split(' ').some((w) => w.length > 3 && hay.includes(w)));
    if (locHit) score += 40;
    else if (c.location.flexible && sameCity.map(norm).includes(norm(p.city))) score += 20;
    else return -1;
  }
  const t = c.property_requirements.type;
  if (t && p.type === t) score += 25;
  else if (t && t !== 'other' && p.type !== t) return -1;
  const { min, max } = c.budget;
  if (max !== null || min !== null) {
    // More than 25% over budget (or far under a stated minimum) is never a match.
    if (max !== null && p.price > max * 1.25) return -1;
    if (min !== null && p.price < min * 0.5) return -1;
    const okMax = max === null || p.price <= max * 1.1;
    const okMin = min === null || p.price >= min * 0.8;
    if (okMax && okMin) score += 25;
    else score -= 20;
  }
  const beds = c.property_requirements.bedrooms;
  if (beds !== null && p.bedrooms !== null && p.bedrooms !== undefined) score += p.bedrooms === beds ? 10 : Math.abs(p.bedrooms - beds) === 1 ? 4 : -5;
  if (c.intent === 'investor' && p.investment) score += 10;
  return score;
}

export function toMatchSummary(p: PropertyDoc): MatchSummary {
  return {
    title: p.title,
    slug: p.slug,
    city: p.city,
    locality: p.locality ?? null,
    priceLabel: p.priceLabel ?? null,
    bedrooms: p.bedrooms ?? null,
    type: p.type,
    url: `${config.PUBLIC_SITE_URL}/property/${p.slug}`,
    sourceUrl: (p as PropertyDoc & { sourceUrl?: string | null }).sourceUrl ?? null,
    image: p.images?.[0] ?? null,
  };
}

/** Up to `limit` listings matched on intent/listing type, location, type, budget and bedrooms. */
export async function matchProperties(c: Classification, limit = 3): Promise<MatchSummary[]> {
  if (c.intent === 'unclear' && !c.location.preferred.length && !c.property_requirements.type) return [];
  // Only live listings synced from Apify — never demo data.
  const all = (await Property.find(LIVE_FILTER).lean()) as unknown as PropertyDoc[];
  const named = c.location.preferred.map(norm);
  const sameCity = [...new Set(all.filter((p) => p.locality && named.some((l) => norm(p.locality!).includes(l))).map((p) => p.city))];
  const out = all
    .map((p) => ({ p, s: scoreProperty(p, c, sameCity) }))
    .filter((x) => x.s > 20)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => toMatchSummary(x.p));
  // Nothing live for this city yet: ask Apify for fresh listings there (budget-guarded, async).
  if (out.length < limit && c.location.preferred[0] && c.intent !== 'unclear') {
    const city = sameCity[0] ?? c.location.preferred.find((l) => /^[a-z .'-]{2,40}$/i.test(l));
    if (city) void requestFreshData(city, c.intent);
  }
  return out;
}
