import { describe, expect, it } from 'vitest';
import {
  applyUrgencyRules,
  computeMissingFields,
  computeScore,
  decideStatus,
  mergeWithPrevious,
  normalizeClassification,
  normalizeInbound,
  parseJsonLoose,
  sanitizeReply,
  type Classification,
} from '../../src/pipeline/rules.js';
import { classificationSchema } from '../../src/pipeline/schema.js';

function cls(over: Partial<Classification> = {}): Classification {
  return {
    intent: 'buyer',
    intent_confidence: 0.9,
    urgency: 'low',
    urgency_reason: '',
    location: { preferred: ['Pune'], flexible: true },
    budget: { min: null, max: 8000000, currency: 'INR', period: 'total', raw: 'under 80 lakh' },
    timeline: { raw: 'in 6 months', days_estimate: 180 },
    property_requirements: { type: 'apartment', bedrooms: 2, bathrooms: null, area_sqft: null, furnishing: null, amenities: [], other: [] },
    contact: { name: 'Riya', phone: '+919876543210', email: null },
    property_of_interest: null,
    missing_fields: [],
    summary_for_broker: 'Buyer wants a 2BHK in Pune.',
    next_question: null,
    ...over,
  };
}

describe('classification schema validation', () => {
  it('accepts a well-formed classification after normalisation', () => {
    const n = normalizeClassification(cls());
    expect(n.ok).toBe(true);
    expect(classificationSchema.safeParse(n.value).success).toBe(true);
  });

  it('coerces strings, percentages and placeholder values', () => {
    const n = normalizeClassification({
      intent: 'Investor',
      intent_confidence: '85',
      urgency: 'HIGH',
      budget: { min: '5000000', max: '₹1,20,00,000', period: 'total', raw: '50L-1.2cr' },
      location: { preferred: 'Pune, Mumbai' },
      property_requirements: { type: 'flat', bedrooms: '2' },
      contact: { name: 'null', phone: '98765 43210', email: 'not-an-email' },
      next_question: 'string',
      summary_for_broker: 'x',
    });
    expect(n.value!.intent).toBe('investor');
    expect(n.value!.intent_confidence).toBe(0.85);
    expect(n.value!.urgency).toBe('high');
    expect(n.value!.budget.max).toBe(12000000);
    expect(n.value!.location.preferred).toEqual(['Pune', 'Mumbai']);
    expect(n.value!.property_requirements.type).toBe('other');
    expect(n.value!.property_requirements.bedrooms).toBe(2);
    expect(n.value!.contact).toEqual({ name: null, phone: '+919876543210', email: null });
    expect(n.value!.next_question).toBeNull();
    expect(classificationSchema.safeParse(n.value).success).toBe(true);
  });

  it('rejects non-objects and objects without intent or summary', () => {
    expect(normalizeClassification(null).ok).toBe(false);
    expect(normalizeClassification([1, 2]).ok).toBe(false);
    expect(normalizeClassification({ foo: 'bar' }).ok).toBe(false);
  });

  it('strict zod schema rejects unknown keys and bad enums', () => {
    expect(classificationSchema.safeParse({ ...cls(), extra: 1 }).success).toBe(false);
    expect(classificationSchema.safeParse({ ...cls(), intent: 'seller' }).success).toBe(false);
  });

  it('parses JSON wrapped in fences or prose', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(parseJsonLoose('no json')).toBeNull();
  });
});

describe('urgency rules', () => {
  const ctx = { customerTexts: ['looking for a flat'], repeatContactWithin24h: false };

  it('keeps LLM urgency when no rule fires', () => {
    expect(applyUrgencyRules(cls({ urgency: 'low' }), ctx).urgency).toBe('low');
  });
  it('timeline ≤ 30 days → high', () => {
    expect(applyUrgencyRules(cls({ timeline: { raw: 'next month', days_estimate: 30 } }), ctx).urgency).toBe('high');
  });
  it('31–90 days → medium', () => {
    const r = applyUrgencyRules(cls({ timeline: { raw: 'in 2 months', days_estimate: 60 } }), ctx);
    expect(r.urgency).toBe('medium');
  });
  it('urgent words (incl. Hinglish) → high', () => {
    expect(applyUrgencyRules(cls(), { ...ctx, customerTexts: ['I am relocating to Pune'] }).urgency).toBe('high');
    expect(applyUrgencyRules(cls(), { ...ctx, customerTexts: ['need it this week'] }).urgency).toBe('high');
    expect(applyUrgencyRules(cls(), { ...ctx, customerTexts: ['flat jaldi chahiye'] }).urgency).toBe('high');
  });
  it('ready budget with a named property → high', () => {
    expect(applyUrgencyRules(cls({ property_of_interest: 'Skyline Residences 3BHK' }), ctx).urgency).toBe('high');
  });
  it('repeat contact within 24h → high', () => {
    expect(applyUrgencyRules(cls(), { ...ctx, repeatContactWithin24h: true }).urgency).toBe('high');
  });
  it('rules only raise, never lower, the LLM urgency', () => {
    const r = applyUrgencyRules(cls({ urgency: 'high', timeline: { raw: 'next year', days_estimate: 365 } }), ctx);
    expect(r.urgency).toBe('high');
    expect(r.llmUrgency).toBe('high');
  });
});

describe('scoring and status', () => {
  it('complete, confident, urgent lead scores high', () => {
    expect(computeScore(cls(), 'high')).toBeGreaterThanOrEqual(90);
  });
  it('empty unclear lead scores low', () => {
    const c = cls({
      intent: 'unclear', intent_confidence: 0, location: { preferred: [], flexible: true },
      budget: { min: null, max: null, currency: 'INR', period: null, raw: '' }, timeline: { raw: '', days_estimate: null },
      property_requirements: { type: null, bedrooms: null, bathrooms: null, area_sqft: null, furnishing: null, amenities: [], other: [] },
      contact: { name: null, phone: null, email: null },
    });
    expect(computeScore(c, 'low')).toBeLessThan(15);
    expect(computeMissingFields(c)).toEqual(['intent', 'location', 'budget', 'timeline', 'property_type', 'name', 'contact']);
  });
  it('score is always within 0–100', () => {
    expect(computeScore(cls({ intent_confidence: 1 }), 'high')).toBeLessThanOrEqual(100);
  });
  it('decideStatus never overrides a broker-owned status', () => {
    expect(decideStatus('contacted', 'high', [], false)).toBe('contacted');
    expect(decideStatus('auto_responded', 'high', [], false)).toBe('needs_broker');
    expect(decideStatus('new', 'low', ['budget', 'timeline', 'name'], false)).toBe('auto_responded');
  });
});

describe('merging and inbound normalisation', () => {
  it('keeps previously known values and channel-verified contact', () => {
    const now = cls({ location: { preferred: [], flexible: true }, contact: { name: null, phone: null, email: null } });
    const merged = mergeWithPrevious(now, { location: { preferred: ['Baner'] }, contact: { name: 'Riya' } }, { phone: '9876543210' });
    expect(merged.location.preferred).toEqual(['Baner']);
    expect(merged.contact.name).toBe('Riya');
    expect(merged.contact.phone).toBe('+919876543210');
  });

  it('normalizes a Meta WhatsApp payload', () => {
    const n = normalizeInbound({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Amit' } }], messages: [{ from: '919812345678', id: 'wamid.X', timestamp: '1790000000', type: 'text', text: { body: '2bhk rent pune' } }] } }] }],
    });
    expect(n.channel).toBe('whatsapp');
    expect(n.text).toBe('2bhk rent pune');
    expect(n.contact.phone).toBe('+919812345678');
    expect(n.contact.name).toBe('Amit');
    expect(n.providerMessageId).toBe('wamid.X');
  });

  it('ignores WhatsApp status callbacks', () => {
    const n = normalizeInbound({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] });
    expect(n.ignored).toBe(true);
  });

  it('normalizes a Google Form submission', () => {
    const n = normalizeInbound({
      source: 'google_form',
      namedValues: { 'Full Name': ['Neha'], Email: ['neha@example.com'], 'Phone Number': ['9000000000'], 'I want to': ['Rent'], 'Preferred Location': ['Powai'], Budget: ['60k'] },
    });
    expect(n.channel).toBe('google_form');
    expect(n.contact).toEqual({ name: 'Neha', phone: '+919000000000', email: 'neha@example.com' });
    expect(n.text).toContain('rent');
    expect(n.text).toContain('Powai');
  });

  it('WhatsApp replies are plain text under 700 chars', () => {
    const out = sanitizeReply('**Hello** there\n* item\n' + 'x'.repeat(900), 'whatsapp');
    expect(out).not.toContain('**');
    expect(out.length).toBeLessThanOrEqual(700);
  });
});
