/**
 * Pure helpers for the Apify integration: scrape targets, mapping MagicBricks items to our
 * Property shape, and budget pacing. No I/O here so everything is unit-testable.
 */

export type TargetMode = 'rent' | 'buy' | 'invest';

export interface ScrapeTarget {
  key: string; // e.g. "rent:Pune"
  mode: TargetMode;
  city: string;
  input: Record<string, unknown>;
}

export const SOURCE = 'apify-magicbricks';

/** Display names for cities the portal spells differently. */
const CITY_DISPLAY: Record<string, string> = { bangalore: 'Bengaluru', bengaluru: 'Bengaluru', gurgaon: 'Gurugram', gurugram: 'Gurugram', bombay: 'Mumbai' };
export function displayCity(c: string): string {
  const k = c.trim().toLowerCase();
  return CITY_DISPLAY[k] ?? c.trim().replace(/\b\w/g, (m) => m.toUpperCase());
}
/** Portal (query) spelling for a city the customer typed. */
export function portalCity(c: string): string {
  const k = c.trim().toLowerCase();
  if (k === 'bengaluru') return 'Bangalore';
  if (k === 'gurugram') return 'Gurgaon';
  return c.trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

export function buildTarget(mode: TargetMode, city: string, maxResults: number): ScrapeTarget {
  const c = portalCity(city);
  const base = { city: c, maxResults };
  const input =
    mode === 'rent'
      ? { ...base, searchMode: 'rent' }
      : mode === 'buy'
        ? { ...base, searchMode: 'buy' }
        : // Investment: land/plots (the classic appreciation play) — new launches are flagged from buy results.
          { ...base, searchMode: 'buy', propertyType: ['plot'] };
  return { key: `${mode}:${c}`, mode, city: c, input };
}

export function buildTargets(cities: string[], maxResults: number): ScrapeTarget[] {
  const out: ScrapeTarget[] = [];
  for (const city of cities.map((c) => c.trim()).filter(Boolean)) for (const m of ['rent', 'buy', 'invest'] as TargetMode[]) out.push(buildTarget(m, city, maxResults));
  return out;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

export function formatPrice(price: number, rent: boolean): string {
  if (rent) return `₹${Math.round(price).toLocaleString('en-IN')} / month`;
  if (price >= 10000000) return `₹${+(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${+(price / 100000).toFixed(1)} L`;
  return `₹${Math.round(price).toLocaleString('en-IN')}`;
}

/** MagicBricks serves 240×180 thumbnails in listings; the same path has a 1080-wide variant. */
export function upscaleImage(url: string): string {
  return url.replace('Photo_h180_w240', 'Photo_h470_w1080').replace(/_180_240(\.\w+)$/, '_470_1080$1');
}

const TYPE_MAP: Record<string, 'apartment' | 'villa' | 'plot' | 'commercial' | 'other'> = {
  apartment: 'apartment',
  studio: 'apartment',
  penthouse: 'apartment',
  'builder-floor': 'apartment',
  villa: 'villa',
  'independent-house': 'villa',
  plot: 'plot',
};

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "Dec '27" / "Dec 2027" in the future → under construction. "Immediately"/"Ready" → ready. */
export function isUnderConstruction(possession: unknown, now = new Date()): boolean {
  const s = String(possession ?? '').toLowerCase();
  if (!s || /immediate|ready/.test(s)) return false;
  const m = s.match(/([a-z]{3})[a-z]*\W*'?(\d{2,4})/);
  if (!m || MONTHS[m[1]] === undefined) return /under construction|new launch/.test(s);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return new Date(year, MONTHS[m[1]], 1) > now;
}

export interface MappedProperty {
  slug: string;
  title: string;
  listingType: 'sale' | 'rent';
  investment: boolean;
  type: 'apartment' | 'villa' | 'plot' | 'commercial' | 'other';
  price: number;
  priceLabel: string;
  city: string;
  locality: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  furnishing: string | null;
  amenities: string[];
  expectedYield: null;
  description: string;
  images: string[];
  imageAlt: string;
  listedAt: Date;
  source: string;
  externalId: string;
  sourceUrl: string;
  target: string;
  projectName: string | null;
  listedBy: string | null;
  latitude: number | null;
  longitude: number | null;
  possession: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};

/**
 * One MagicBricks dataset item → our Property shape. Returns null for items we cannot show
 * honestly (no id, no price, or no original listing URL).
 */
export function mapMagicBricksItem(item: Record<string, any>, target: ScrapeTarget, now = new Date()): MappedProperty | null {
  const externalId = str(String(item.listing_id ?? item.id ?? ''));
  const price = num(item.price_inr ?? item.price);
  const sourceUrl = str(item.url);
  const title = str(item.title);
  if (!externalId || !price || !sourceUrl || !/^https:\/\/(www\.)?magicbricks\.com\//.test(sourceUrl) || !title) return null;

  const rent = String(item.searchMode ?? target.input.searchMode) === 'rent';
  const rawType = String(item.propertyType ?? '').toLowerCase();
  const type = TYPE_MAP[rawType] ?? (/plot|land/.test(rawType) ? 'plot' : 'other');
  const possession = str(item.possession_date);
  const investment = !rent && (target.mode === 'invest' || type === 'plot' || isUnderConstruction(possession, now));
  const city = displayCity(str(item.city) ?? target.city);
  const locality = str(item.locality) ?? '';
  const images = (Array.isArray(item.images) ? item.images : [])
    .filter((u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u))
    .map(upscaleImage)
    .slice(0, 8);
  const amenities = (Array.isArray(item.amenities) ? item.amenities : [])
    .filter((a: unknown): a is string => typeof a === 'string' && /[a-z]/i.test(a)) // the portal sometimes returns numeric codes only
    .slice(0, 12);
  const beds = num(item.bedrooms ?? item.bhk);
  const facts = [
    beds ? `${beds} BHK` : null,
    item.propertyType_display ?? null,
    num(item.super_area_sqft) ? `${num(item.super_area_sqft)} sq ft` : null,
    str(item.furnishing),
    str(item.floor_display),
    str(item.facing) ? `${item.facing}-facing` : null,
  ].filter(Boolean);
  const described = str(item.description) ?? '';
  const description = described.length > 60 ? described : [described, facts.join(' · '), str(item.project_name) ? `Project: ${item.project_name}.` : ''].filter(Boolean).join(' ');

  return {
    slug: `${slugify(title)}-mb${externalId}`,
    title,
    listingType: rent ? 'rent' : 'sale',
    investment,
    type,
    price,
    priceLabel: formatPrice(price, rent),
    city,
    locality,
    bedrooms: beds,
    bathrooms: num(item.bathrooms),
    areaSqft: num(item.super_area_sqft ?? item.carpet_area_sqft),
    furnishing: str(item.furnishing)?.toLowerCase() ?? null,
    amenities,
    expectedYield: null,
    description,
    images,
    imageAlt: title,
    listedAt: item.posted_at ? new Date(item.posted_at) : now,
    source: SOURCE,
    externalId,
    sourceUrl,
    target: target.key,
    projectName: str(item.project_name),
    listedBy: str(item.listed_by),
    latitude: typeof item.latitude === 'number' ? item.latitude : null,
    longitude: typeof item.longitude === 'number' ? item.longitude : null,
    possession,
  };
}

/** Collapse duplicates inside one dataset (same listing id) — last one wins. */
export function dedupe(items: MappedProperty[]): MappedProperty[] {
  const byId = new Map<string, MappedProperty>();
  for (const p of items) byId.set(p.externalId, p);
  return [...byId.values()];
}

/**
 * Budget pacing: a new scrape may start only if the account's usage this billing cycle plus the
 * run's estimated cost stays within the pro-rata share of the budget (plus one run of headroom).
 * `bootstrap` runs (targets never fetched) only need to fit under the hard cap.
 */
export function budgetAllows(o: {
  usageUsd: number;
  budgetUsd: number;
  limitUsd: number | null;
  cycleStart: Date;
  cycleEnd: Date;
  now: Date;
  estimatedRunUsd: number;
  bootstrap?: boolean;
}): { ok: boolean; allowedUsd: number; capUsd: number } {
  const cap = Math.min(o.budgetUsd, o.limitUsd ?? Infinity);
  const total = Math.max(1, o.cycleEnd.getTime() - o.cycleStart.getTime());
  const elapsed = Math.min(total, Math.max(0, o.now.getTime() - o.cycleStart.getTime()));
  const allowed = Math.min(cap, cap * (elapsed / total) + o.estimatedRunUsd);
  const after = o.usageUsd + o.estimatedRunUsd;
  const ok = after <= cap && (o.bootstrap ? true : after <= allowed);
  return { ok, allowedUsd: allowed, capUsd: cap };
}
