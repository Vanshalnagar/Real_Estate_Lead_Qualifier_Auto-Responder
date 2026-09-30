import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SEED_PROPERTIES } from '../fixtures/properties.js';
import {
  classifyWithFallback,
  completeTextWithFallback,
  geminiProvider,
  groqProvider,
  ProviderError,
  setProvidersForTest,
  type Provider,
} from '../../src/pipeline/llm.js';
import type { Classification } from '../../src/pipeline/rules.js';
import { CLASSIFY_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from '../../src/prompts/index.js';
import { scoreProperty } from '../../src/services/matching.js';

const base: Classification = {
  intent: 'renter',
  intent_confidence: 0.9,
  urgency: 'medium',
  urgency_reason: '',
  location: { preferred: ['Powai'], flexible: true },
  budget: { min: null, max: 70000, currency: 'INR', period: 'monthly', raw: '70k' },
  timeline: { raw: '', days_estimate: null },
  property_requirements: { type: 'apartment', bedrooms: 2, bathrooms: null, area_sqft: null, furnishing: null, amenities: [], other: [] },
  contact: { name: null, phone: null, email: null },
  property_of_interest: null,
  missing_fields: [],
  summary_for_broker: 'Renter in Powai.',
  next_question: null,
};

function rank(c: Classification) {
  return SEED_PROPERTIES.map((p) => ({ slug: p.slug, s: scoreProperty(p as any, c) }))
    .filter((x) => x.s > 20)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.slug);
}

describe('property matching', () => {
  it('renter in Powai under 70k/month gets the Powai 2BHK first', () => {
    expect(rank(base)[0]).toBe('harbour-view-2bhk-rent-powai');
  });
  it('never offers sale listings to a renter', () => {
    const slugs = rank({ ...base, location: { preferred: ['Mumbai'], flexible: true }, budget: { ...base.budget, max: 500000 } });
    for (const s of slugs) expect(SEED_PROPERTIES.find((p) => p.slug === s)!.listingType).toBe('rent');
  });
  it('investor looking at commercial in Gurugram gets the pre-leased office', () => {
    const slugs = rank({
      ...base,
      intent: 'investor',
      location: { preferred: ['Gurugram'], flexible: true },
      budget: { min: null, max: 50000000, currency: 'INR', period: 'total', raw: '5 cr' },
      property_requirements: { ...base.property_requirements, type: 'commercial', bedrooms: null },
    });
    expect(slugs[0]).toBe('cyber-hub-office-suite-gurugram');
  });
  it('over-budget listings are excluded', () => {
    const slugs = rank({ ...base, intent: 'buyer', location: { preferred: ['Pune'], flexible: true }, budget: { min: null, max: 9000000, currency: 'INR', period: 'total', raw: '90L' } });
    expect(slugs).not.toContain('skyline-residences-3bhk-baner');
  });
});

describe('provider fallback', () => {
  afterEach(() => setProvidersForTest([groqProvider, geminiProvider]));

  const validJson = JSON.stringify(base);
  const mock = (name: 'groq' | 'gemini', impl: () => Promise<string>, calls: string[]): Provider => ({
    name,
    model: `${name}-mock`,
    available: () => true,
    complete: async () => {
      calls.push(name);
      return impl();
    },
  });

  it('Groq failure (HTTP 429) → Gemini is used', async () => {
    const calls: string[] = [];
    setProvidersForTest([
      mock('groq', async () => { throw new ProviderError('groq', 'HTTP 429 rate limited', 429); }, calls),
      mock('gemini', async () => validJson, calls),
    ]);
    const r = await classifyWithFallback('sys', 'user');
    expect(r?.provider).toBe('gemini');
    expect(r?.classification.intent).toBe('renter');
    expect(calls).toEqual(['groq', 'gemini']);
  });

  it('invalid JSON from Groq is retried once before falling back', async () => {
    const calls: string[] = [];
    setProvidersForTest([mock('groq', async () => 'not json', calls), mock('gemini', async () => validJson, calls)]);
    const r = await classifyWithFallback('sys', 'user');
    expect(calls).toEqual(['groq', 'groq', 'gemini']);
    expect(r?.provider).toBe('gemini');
  });

  it('valid Groq answer on retry does not call Gemini', async () => {
    const calls: string[] = [];
    let n = 0;
    setProvidersForTest([mock('groq', async () => (n++ === 0 ? '{"intent": 5}' : validJson), calls), mock('gemini', async () => validJson, calls)]);
    const r = await classifyWithFallback('sys', 'user');
    expect(r?.provider).toBe('groq');
    expect(calls).toEqual(['groq', 'groq']);
  });

  it('both providers failing returns null (caller flags manual review)', async () => {
    const calls: string[] = [];
    setProvidersForTest([
      mock('groq', async () => { throw new Error('timeout'); }, calls),
      mock('gemini', async () => { throw new Error('HTTP 500'); }, calls),
    ]);
    expect(await classifyWithFallback('sys', 'user')).toBeNull();
  });

  it('reply generation falls back to Gemini', async () => {
    const calls: string[] = [];
    setProvidersForTest([mock('groq', async () => { throw new Error('down'); }, calls), mock('gemini', async () => 'Hello!', calls)]);
    expect((await completeTextWithFallback('s', 'u'))?.provider).toBe('gemini');
  });
});

describe('prompts are shared with n8n', () => {
  it('the exported n8n workflow embeds the exact backend prompt text', () => {
    const wf = readFileSync(resolve(__dirname, '../../../n8n/workflows/lead-intake-qualification.json'), 'utf8');
    const code = (JSON.parse(wf).nodes as { parameters?: { jsCode?: string } }[]).map((n) => n.parameters?.jsCode ?? '').join('\n');
    expect(code).toContain(JSON.stringify(CLASSIFY_SYSTEM_PROMPT));
    expect(code).toContain(JSON.stringify(REPLY_SYSTEM_PROMPT));
  });
});

describe('property matching — locations and types', () => {
  it('never suggests another city', () => {
    const slugs = rank({ ...base, location: { preferred: ['Hinjewadi', 'Baner'], flexible: true }, budget: { ...base.budget, max: 25000 } });
    for (const s of slugs) expect(SEED_PROPERTIES.find((p) => p.slug === s)!.city).toBe('Pune');
  });
  it('understands old city names (Gurgaon → Gurugram)', () => {
    const slugs = rank({
      ...base,
      intent: 'investor',
      location: { preferred: ['gurgaon'], flexible: true },
      budget: { min: null, max: 50000000, currency: 'INR', period: 'total', raw: '5 cr' },
      property_requirements: { ...base.property_requirements, type: 'commercial', bedrooms: null },
    });
    expect(slugs).toContain('cyber-hub-office-suite-gurugram');
  });
  it('excludes a different property type', () => {
    const slugs = rank({
      ...base,
      intent: 'buyer',
      location: { preferred: ['Bengaluru'], flexible: true },
      budget: { min: null, max: 35000000, currency: 'INR', period: 'total', raw: '3.5 cr' },
      property_requirements: { ...base.property_requirements, type: 'villa', bedrooms: null },
    });
    expect(slugs).toEqual(['palm-grove-villa-whitefield']);
  });
});
