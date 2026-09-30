export type Intent = 'buyer' | 'renter' | 'investor' | 'unclear';
export type Urgency = 'high' | 'medium' | 'low';
export type Channel = 'web_chat' | 'web_form' | 'google_form' | 'whatsapp';
export type LeadStatus = 'new' | 'auto_responded' | 'needs_broker' | 'contacted' | 'qualified' | 'closed_won' | 'closed_lost';

export interface Property {
  _id: string;
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
  areaSqft: number;
  furnishing: string | null;
  amenities: string[];
  expectedYield: number | null;
  description: string;
  images: string[];
  imageAlt: string;
  listedAt: string;
  /** Live-data provenance (Apify → MagicBricks). */
  source?: string;
  sourceUrl?: string | null;
  active?: boolean;
  lastSeenAt?: string | null;
  projectName?: string | null;
  listedBy?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  possession?: string | null;
}

export interface SyncInfo {
  source: string;
  lastSuccessfulSyncAt: string | null;
  activeListings: number;
  syncing?: boolean;
}

export interface MatchSummary {
  title: string;
  slug: string;
  city: string;
  locality?: string | null;
  priceLabel?: string | null;
  bedrooms?: number | null;
  type?: string;
  url: string;
  image?: string | null;
  sourceUrl?: string | null;
}

export interface ChatResponse {
  ok: true;
  sessionId?: string;
  leadId: string;
  reply: string;
  processedBy: 'n8n' | 'backend-fallback';
  intent: Intent;
  urgency: Urgency;
  score: number;
  missingFields: string[];
  done: boolean;
  summary: {
    intent: Intent;
    location: string[];
    budget: string;
    timeline: string;
    propertyType: string | null;
    bedrooms: number | null;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  matches: MatchSummary[];
}
