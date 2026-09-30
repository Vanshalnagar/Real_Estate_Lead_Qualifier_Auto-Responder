/**
 * Pure, dependency-free pipeline rules.
 *
 * This file is used in two places:
 *  - the backend (in-process fallback pipeline and the internal API that n8n calls), and
 *  - the n8n workflow: `n8n/build-workflows.mjs` bundles this file with esbuild and embeds it
 *    in the Code nodes, so both paths run identical normalisation, urgency, scoring and prompts.
 * Do not import anything here.
 */

export type Intent = 'buyer' | 'renter' | 'investor' | 'unclear';
export type Urgency = 'high' | 'medium' | 'low';
export type ChannelId = 'web_chat' | 'web_form' | 'google_form' | 'whatsapp';

export interface Classification {
  intent: Intent;
  intent_confidence: number;
  urgency: Urgency;
  urgency_reason: string;
  location: { preferred: string[]; flexible: boolean };
  budget: { min: number | null; max: number | null; currency: string; period: 'total' | 'monthly' | null; raw: string };
  timeline: { raw: string; days_estimate: number | null };
  property_requirements: {
    type: 'apartment' | 'villa' | 'plot' | 'commercial' | 'other' | null;
    bedrooms: number | null;
    bathrooms: number | null;
    area_sqft: number | null;
    furnishing: string | null;
    amenities: string[];
    other: string[];
  };
  contact: { name: string | null; phone: string | null; email: string | null };
  property_of_interest: string | null;
  missing_fields: string[];
  summary_for_broker: string;
  next_question: string | null;
}

export interface Contact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface HistoryItem {
  author: 'customer' | 'ai' | 'broker';
  text: string;
  at?: string;
}

export interface NormalizedInbound {
  channel: ChannelId;
  text: string;
  contact: Contact;
  sessionId: string | null;
  leadId: string | null;
  traceId: string;
  propertySlug: string | null;
  providerMessageId: string | null;
  receivedAt: string;
  ignored?: boolean;
  ignoreReason?: string;
}

const INTENTS: Intent[] = ['buyer', 'renter', 'investor', 'unclear'];
const URGENCIES: Urgency[] = ['high', 'medium', 'low'];
const TYPES = ['apartment', 'villa', 'plot', 'commercial', 'other'] as const;
export const ESSENTIAL_FIELDS = ['intent', 'location', 'budget', 'timeline', 'property_type', 'name', 'contact'];

// ---------------------------------------------------------------------------------------------
// Inbound normalisation (website chat, website form, Google Form via Apps Script, WhatsApp Cloud API)
// ---------------------------------------------------------------------------------------------

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return String(v).trim();
}
function orNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}
export function normalizePhone(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, '');
  const plain = digits.replace(/^\+/, '');
  if (plain.length < 8) return null;
  if (plain.length === 10) return '+91' + plain; // Indian mobile without country code
  return '+' + plain;
}
function randomId(): string {
  return 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Pick a field from a Google Form "namedValues"-style object by fuzzy title match. */
function pickField(obj: Record<string, unknown>, ...needles: string[]): string {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    if (needles.some((n) => k.includes(n))) return str(obj[key]);
  }
  return '';
}

/** Build a readable inquiry text out of structured form fields. */
export function formFieldsToText(f: {
  intent?: string;
  location?: string;
  budget?: string;
  timeline?: string;
  propertyType?: string;
  message?: string;
}): string {
  const parts: string[] = [];
  if (f.intent) parts.push(`I want to ${f.intent.toLowerCase()} a property.`);
  if (f.propertyType) parts.push(`Property type: ${f.propertyType}.`);
  if (f.location) parts.push(`Preferred location: ${f.location}.`);
  if (f.budget) parts.push(`Budget: ${f.budget}.`);
  if (f.timeline) parts.push(`Timeline: ${f.timeline}.`);
  if (f.message) parts.push(f.message);
  return parts.join(' ');
}

export function normalizeInbound(body: any): NormalizedInbound {
  const now = new Date().toISOString();
  const b = body && typeof body === 'object' ? body : {};

  // Meta WhatsApp Cloud API webhook payload
  if (b.object === 'whatsapp_business_account' || (b.entry && Array.isArray(b.entry))) {
    const value = b.entry?.[0]?.changes?.[0]?.value ?? {};
    const msg = value.messages?.[0];
    const profileName = value.contacts?.[0]?.profile?.name ?? null;
    if (!msg) {
      return {
        channel: 'whatsapp', text: '', contact: {}, sessionId: null, leadId: null, traceId: randomId(),
        propertySlug: null, providerMessageId: null, receivedAt: now, ignored: true,
        ignoreReason: value.statuses ? 'status-update' : 'no-message',
      };
    }
    let text = '';
    if (msg.type === 'text') text = str(msg.text?.body);
    else if (msg.type === 'button') text = str(msg.button?.text);
    else if (msg.type === 'interactive') text = str(msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title);
    else text = `[${msg.type} message]`;
    return {
      channel: 'whatsapp',
      text,
      contact: { name: orNull(profileName), phone: normalizePhone(msg.from), email: null },
      sessionId: null,
      leadId: null,
      traceId: str(b.traceId) || 'wa_' + str(msg.id || randomId()),
      propertySlug: null,
      providerMessageId: orNull(msg.id),
      receivedAt: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : now,
    };
  }

  // Google Form (posted by Apps Script onFormSubmit)
  if (b.source === 'google_form' || b.channel === 'google_form') {
    const nv: Record<string, unknown> = b.namedValues ?? b.fields ?? {};
    const name = pickField(nv, 'name');
    const email = pickField(nv, 'email');
    const phone = pickField(nv, 'phone', 'mobile', 'whatsapp');
    const text = formFieldsToText({
      intent: pickField(nv, 'want to', 'intent', 'looking to'),
      location: pickField(nv, 'location', 'city', 'area'),
      budget: pickField(nv, 'budget'),
      timeline: pickField(nv, 'timeline', 'when'),
      propertyType: pickField(nv, 'property type', 'type of property'),
      message: pickField(nv, 'message', 'requirement', 'details', 'anything else'),
    });
    return {
      channel: 'google_form',
      text: text || 'Submitted the enquiry form.',
      contact: { name: orNull(name), phone: normalizePhone(phone), email: orNull(email)?.toLowerCase() ?? null },
      sessionId: null,
      leadId: null,
      traceId: str(b.traceId) || randomId(),
      propertySlug: null,
      providerMessageId: orNull(b.responseId),
      receivedAt: str(b.timestamp) || now,
    };
  }

  // Website chat / website form (posted by the backend)
  const channel: ChannelId = b.channel === 'web_form' ? 'web_form' : 'web_chat';
  const c = b.contact ?? {};
  return {
    channel,
    text: str(b.text),
    contact: { name: orNull(c.name), phone: normalizePhone(c.phone), email: orNull(c.email)?.toLowerCase() ?? null },
    sessionId: orNull(b.sessionId),
    leadId: orNull(b.leadId),
    traceId: str(b.traceId) || randomId(),
    propertySlug: orNull(b.propertySlug),
    providerMessageId: null,
    receivedAt: now,
  };
}

// ---------------------------------------------------------------------------------------------
// LLM output parsing and normalisation
// ---------------------------------------------------------------------------------------------

/** Extract the first JSON object from model text (tolerates code fences and stray prose). */
export function parseJsonLoose(text: unknown): unknown {
  if (text && typeof text === 'object') return text;
  const s = str(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function strArr(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean);
  return [];
}
function nullIfPlaceholder(v: unknown): string | null {
  const s = str(v);
  if (!s || /^(null|none|n\/a|unknown|string)$/i.test(s)) return null;
  return s;
}

/**
 * Coerce a parsed LLM object into the Classification shape and report structural problems.
 * `ok` is false when the object is not usable (then the caller retries / falls back).
 */
export function normalizeClassification(raw: unknown): { ok: boolean; value: Classification | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, value: null, errors: ['not a JSON object'] };
  }
  const r = raw as any;
  let intent = str(r.intent).toLowerCase() as Intent;
  if (!INTENTS.includes(intent)) {
    errors.push('intent invalid');
    intent = 'unclear';
  }
  let urgency = str(r.urgency).toLowerCase() as Urgency;
  if (!URGENCIES.includes(urgency)) {
    errors.push('urgency invalid');
    urgency = 'low';
  }
  let conf = num(r.intent_confidence);
  if (conf === null) conf = intent === 'unclear' ? 0.2 : 0.6;
  if (conf > 1 && conf <= 100) conf = conf / 100;
  conf = Math.max(0, Math.min(1, conf));

  const pr = r.property_requirements ?? {};
  let ptype = nullIfPlaceholder(pr.type)?.toLowerCase() ?? null;
  if (ptype && !(TYPES as readonly string[]).includes(ptype)) ptype = 'other';
  const period = nullIfPlaceholder(r.budget?.period)?.toLowerCase();

  const value: Classification = {
    intent,
    intent_confidence: Math.round(conf * 100) / 100,
    urgency,
    urgency_reason: str(r.urgency_reason),
    location: {
      preferred: strArr(r.location?.preferred ?? r.location).filter((x) => !/^(string|null)$/i.test(x)),
      flexible: r.location?.flexible === false ? false : true,
    },
    budget: {
      min: num(r.budget?.min),
      max: num(r.budget?.max),
      currency: str(r.budget?.currency) || 'INR',
      period: period === 'monthly' || period === 'total' ? period : null,
      raw: str(r.budget?.raw).replace(/^string$/i, ''),
    },
    timeline: {
      raw: str(r.timeline?.raw ?? (typeof r.timeline === 'string' ? r.timeline : '')).replace(/^string$/i, ''),
      days_estimate: num(r.timeline?.days_estimate),
    },
    property_requirements: {
      type: ptype as Classification['property_requirements']['type'],
      bedrooms: num(pr.bedrooms),
      bathrooms: num(pr.bathrooms),
      area_sqft: num(pr.area_sqft),
      furnishing: nullIfPlaceholder(pr.furnishing),
      amenities: strArr(pr.amenities).filter((x) => !/^string$/i.test(x)),
      other: strArr(pr.other).filter((x) => !/^string$/i.test(x)),
    },
    contact: {
      name: nullIfPlaceholder(r.contact?.name),
      phone: normalizePhone(nullIfPlaceholder(r.contact?.phone)),
      email: nullIfPlaceholder(r.contact?.email)?.toLowerCase() ?? null,
    },
    property_of_interest: nullIfPlaceholder(r.property_of_interest),
    missing_fields: strArr(r.missing_fields),
    summary_for_broker: str(r.summary_for_broker),
    next_question: nullIfPlaceholder(r.next_question),
  };
  if (value.budget.min !== null && value.budget.max !== null && value.budget.min > value.budget.max) {
    const t = value.budget.min;
    value.budget.min = value.budget.max;
    value.budget.max = t;
  }
  if (value.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact.email)) value.contact.email = null;
  // An object with no intent AND no summary is not a classification at all.
  const ok = !errors.includes('intent invalid') || value.summary_for_broker.length > 0;
  return { ok, value, errors };
}

/** Used when both providers fail twice: keep the lead, flag it for a human. */
export function manualReviewClassification(text: string): Classification {
  return {
    intent: 'unclear',
    intent_confidence: 0,
    urgency: 'medium',
    urgency_reason: 'Automatic classification unavailable; flagged for manual review.',
    location: { preferred: [], flexible: true },
    budget: { min: null, max: null, currency: 'INR', period: null, raw: '' },
    timeline: { raw: '', days_estimate: null },
    property_requirements: { type: null, bedrooms: null, bathrooms: null, area_sqft: null, furnishing: null, amenities: [], other: [] },
    contact: { name: null, phone: null, email: null },
    property_of_interest: null,
    missing_fields: [...ESSENTIAL_FIELDS],
    summary_for_broker: `AI classification failed. Customer wrote: "${text.slice(0, 240)}"`,
    next_question: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Merging, missing fields, urgency, score, status
// ---------------------------------------------------------------------------------------------

export interface PreviousExtraction {
  intent?: Intent;
  intentConfidence?: number;
  location?: { preferred?: string[]; flexible?: boolean };
  budget?: { min?: number | null; max?: number | null; currency?: string; period?: string | null; raw?: string };
  timeline?: { raw?: string; daysEstimate?: number | null };
  propertyRequirements?: {
    type?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    areaSqft?: number | null;
    furnishing?: string | null;
    amenities?: string[];
    other?: string[];
  };
  propertyOfInterest?: string | null;
  contact?: Contact;
}

/**
 * Combine this turn's extraction with what we already knew. The model sees the full history, so
 * normally it re-extracts everything; this only protects against it dropping a known value.
 * Channel-verified contact details (WhatsApp number, form fields) always win over model output.
 */
export function mergeWithPrevious(cls: Classification, prev: PreviousExtraction | null, known: Contact): Classification {
  const out: Classification = JSON.parse(JSON.stringify(cls));
  const p = prev ?? {};
  if (out.intent === 'unclear' && p.intent && p.intent !== 'unclear') {
    out.intent = p.intent;
    out.intent_confidence = Math.max(out.intent_confidence, p.intentConfidence ?? 0.5);
  }
  if (!out.location.preferred.length && p.location?.preferred?.length) out.location = { preferred: [...p.location.preferred], flexible: p.location.flexible ?? true };
  if (out.budget.min === null && out.budget.max === null && p.budget && (p.budget.min != null || p.budget.max != null)) {
    out.budget = {
      min: p.budget.min ?? null,
      max: p.budget.max ?? null,
      currency: p.budget.currency || 'INR',
      period: (p.budget.period as 'total' | 'monthly' | null) ?? null,
      raw: p.budget.raw ?? '',
    };
  }
  if (!out.timeline.raw && p.timeline?.raw) out.timeline = { raw: p.timeline.raw, days_estimate: p.timeline.daysEstimate ?? null };
  const pr = p.propertyRequirements;
  if (pr) {
    const o = out.property_requirements;
    if (!o.type && pr.type) o.type = pr.type as Classification['property_requirements']['type'];
    if (o.bedrooms === null && pr.bedrooms != null) o.bedrooms = pr.bedrooms;
    if (o.bathrooms === null && pr.bathrooms != null) o.bathrooms = pr.bathrooms;
    if (o.area_sqft === null && pr.areaSqft != null) o.area_sqft = pr.areaSqft;
    if (!o.furnishing && pr.furnishing) o.furnishing = pr.furnishing;
    if (!o.amenities.length && pr.amenities?.length) o.amenities = [...pr.amenities];
  }
  if (!out.property_of_interest && p.propertyOfInterest) out.property_of_interest = p.propertyOfInterest;
  const pc = p.contact ?? {};
  out.contact = {
    name: known.name || out.contact.name || pc.name || null,
    phone: normalizePhone(known.phone) || out.contact.phone || pc.phone || null,
    email: known.email || out.contact.email || pc.email || null,
  };
  out.missing_fields = computeMissingFields(out);
  return out;
}

export function computeMissingFields(c: Classification): string[] {
  const m: string[] = [];
  if (c.intent === 'unclear') m.push('intent');
  if (!c.location.preferred.length) m.push('location');
  if (c.budget.min === null && c.budget.max === null && !c.budget.raw) m.push('budget');
  if (!c.timeline.raw && c.timeline.days_estimate === null) m.push('timeline');
  if (!c.property_requirements.type) m.push('property_type');
  if (!c.contact.name) m.push('name');
  if (!c.contact.phone && !c.contact.email) m.push('contact');
  return m;
}

const URGENT_WORDS =
  /\b(urgent(ly)?|immediate(ly)?|asap|right away|this week|within (a|one|1) week|relocat(e|ing|ion)|transferred|jaldi|turant|abhi chahiye|joining (next|this) (week|month))\b/i;

export interface UrgencyContext {
  customerTexts: string[];
  repeatContactWithin24h: boolean;
}

/**
 * LLM urgency plus deterministic checks that can only RAISE it:
 * timeline ≤ 30 days, urgent words, ready budget + named property, or a repeat contact within 24h → high;
 * 31–90 days → at least medium.
 */
export function applyUrgencyRules(c: Classification, ctx: UrgencyContext): { urgency: Urgency; reason: string; llmUrgency: Urgency } {
  const llm = c.urgency;
  const reasons: string[] = [];
  let level = URGENCIES.indexOf(llm); // 0 = high
  const days = c.timeline.days_estimate;
  const raise = (to: Urgency, why: string) => {
    const idx = URGENCIES.indexOf(to);
    if (idx < level) {
      level = idx;
      reasons.push(why);
    }
  };
  if (days !== null && days <= 30) raise('high', `timeline ${days} days`);
  const joined = ctx.customerTexts.join(' \n ');
  const word = joined.match(URGENT_WORDS);
  if (word) raise('high', `said "${word[0]}"`);
  if ((c.budget.max !== null || c.budget.min !== null) && c.property_of_interest) raise('high', 'ready budget for a named property');
  if (ctx.repeatContactWithin24h) raise('high', 'repeat contact within 24h');
  if (days !== null && days > 30 && days <= 90) raise('medium', `timeline ${days} days`);
  const urgency = URGENCIES[level];
  const reason = reasons.length ? `${c.urgency_reason ? c.urgency_reason + ' | ' : ''}Rules: ${reasons.join(', ')}` : c.urgency_reason || `LLM: ${llm}`;
  return { urgency, reason, llmUrgency: llm };
}

/** 0–100: intent confidence (25) + completeness of essential fields (45) + urgency (30). */
export function computeScore(c: Classification, urgency: Urgency): number {
  const intentPts = c.intent === 'unclear' ? 0 : c.intent_confidence * 25;
  const missing = computeMissingFields(c).length;
  const completeness = ((ESSENTIAL_FIELDS.length - missing) / ESSENTIAL_FIELDS.length) * 45;
  const urgencyPts = urgency === 'high' ? 30 : urgency === 'medium' ? 18 : 6;
  return Math.max(0, Math.min(100, Math.round(intentPts + completeness + urgencyPts)));
}

const BROKER_OWNED = ['contacted', 'qualified', 'closed_won', 'closed_lost'];
export function decideStatus(current: string | null | undefined, urgency: Urgency, missing: string[], manualReview: boolean): string {
  if (current && BROKER_OWNED.includes(current)) return current;
  const readyForBroker = !missing.includes('intent') && !missing.includes('contact') && missing.length <= 2;
  if (manualReview || urgency === 'high' || readyForBroker) return 'needs_broker';
  return 'auto_responded';
}

export function followUpPromise(urgency: Urgency): string {
  if (urgency === 'high') return 'A senior broker will call you within 30 minutes (during 9am-9pm IST).';
  if (urgency === 'medium') return 'A broker will reach out within 4 hours.';
  return 'A broker will get in touch within 24 hours.';
}

// ---------------------------------------------------------------------------------------------
// Prompt message builders (shared by backend and n8n)
// ---------------------------------------------------------------------------------------------

export interface ClassifyInput {
  channel: ChannelId;
  today: string;
  history: HistoryItem[];
  latest: string;
  knownContact: Contact;
  propertyContext: string | null;
}

export function buildClassifyUserMessage(i: ClassifyInput): string {
  const lines: string[] = [];
  lines.push(`Today's date: ${i.today}`);
  lines.push(`Channel: ${i.channel}`);
  const kc = i.knownContact;
  const known = [kc.name && `name=${kc.name}`, kc.phone && `phone=${kc.phone}`, kc.email && `email=${kc.email}`].filter(Boolean);
  lines.push(`Known contact details: ${known.length ? known.join(', ') : 'none'}`);
  if (i.propertyContext) lines.push(`The customer is asking about this listing: ${i.propertyContext}`);
  lines.push('');
  lines.push('Conversation so far (oldest first):');
  const hist = i.history.slice(-20);
  if (!hist.length) lines.push('(no earlier messages)');
  for (const h of hist) lines.push(`${h.author === 'customer' ? 'Customer' : h.author === 'broker' ? 'Broker' : 'Agency AI'}: ${h.text}`);
  lines.push('');
  lines.push(`Latest customer message: ${i.latest}`);
  lines.push('');
  lines.push('Return the JSON object now.');
  return lines.join('\n');
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
  /** Original listing on the source portal (live Apify data). */
  sourceUrl?: string | null;
  image?: string | null;
}

export interface ReplyInput {
  channel: ChannelId;
  history: HistoryItem[];
  latest: string;
  classification: Classification;
  urgency: Urgency;
  matches: MatchSummary[];
}

export function buildReplyUserMessage(i: ReplyInput): string {
  const c = i.classification;
  const data = {
    name: c.contact.name,
    intent: c.intent,
    location: c.location.preferred,
    budget: c.budget.raw || (c.budget.max ?? c.budget.min),
    budget_period: c.budget.period,
    timeline: c.timeline.raw,
    property_type: c.property_requirements.type,
    bedrooms: c.property_requirements.bedrooms,
    property_of_interest: c.property_of_interest,
    missing_fields: c.missing_fields,
    next_question: c.next_question,
    urgency: i.urgency,
  };
  const lines: string[] = [];
  lines.push(`Channel: ${i.channel}`);
  lines.push(`Follow-up promise: ${followUpPromise(i.urgency)}`);
  lines.push(`Extracted data: ${JSON.stringify(data)}`);
  lines.push('Matching listings:');
  if (!i.matches.length) lines.push('(none found — do not suggest any listing)');
  i.matches.forEach((m, n) =>
    lines.push(`${n + 1}. ${m.title} — ${[m.locality, m.city].filter(Boolean).join(', ')} — ${m.priceLabel ?? ''} — ${m.url}`),
  );
  lines.push('');
  lines.push('Conversation (oldest first):');
  for (const h of i.history.slice(-10)) lines.push(`${h.author === 'customer' ? 'Customer' : 'Agency'}: ${h.text}`);
  lines.push(`Customer (latest): ${i.latest}`);
  lines.push('');
  lines.push('Write the reply now.');
  return lines.join('\n');
}

/** Enforce channel format limits regardless of what the model produced. */
export function sanitizeReply(text: string, channel: ChannelId): string {
  let t = str(text).replace(/^["']|["']$/g, '').trim();
  if (channel === 'whatsapp') {
    t = t.replace(/\*\*?|__|`|#+\s/g, '').replace(/^\s*[•*]\s+/gm, '- ');
    if (t.length > 700) {
      const cut = t.slice(0, 690);
      t = cut.slice(0, Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. ') + 1, 600)).trim() + '…';
    }
  } else if (t.length > 1400) {
    t = t.slice(0, 1390).trim() + '…';
  }
  return t;
}

function money(n: number | null): string {
  if (n === null) return '';
  if (n >= 10000000) return `₹${+(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${+(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Deterministic reply used only when both LLM providers fail for the reply step. */
export function templateReply(i: ReplyInput): string {
  const c = i.classification;
  const first = c.contact.name ? c.contact.name.split(' ')[0] : '';
  const parts: string[] = [];
  parts.push(`Thanks${first ? ' ' + first : ''} for reaching out to NESTR.!`);
  const want = [
    c.intent !== 'unclear' ? { buyer: 'buy', renter: 'rent', investor: 'invest in' }[c.intent as 'buyer'] : null,
    c.property_requirements.bedrooms ? `a ${c.property_requirements.bedrooms}BHK` : null,
    c.property_requirements.type,
    c.location.preferred.length ? `in ${c.location.preferred.join(', ')}` : null,
    c.budget.max ? `around ${money(c.budget.max)}${c.budget.period === 'monthly' ? '/month' : ''}` : null,
  ].filter(Boolean);
  if (want.length > 1) parts.push(`You're looking to ${want.join(' ')}.`);
  if (i.matches.length) {
    parts.push('A few listings that fit:');
    for (const m of i.matches) parts.push(`- ${m.title}, ${m.city} (${m.priceLabel ?? ''}): ${m.url}`);
  }
  if (c.next_question) parts.push(c.next_question);
  parts.push(followUpPromise(i.urgency));
  return sanitizeReply(parts.join('\n'), i.channel);
}

// ---------------------------------------------------------------------------------------------
// Response returned to the website (same shape from n8n and from the backend fallback)
// ---------------------------------------------------------------------------------------------

export interface ClientResponse {
  ok: true;
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

/** "Enough information" = we know what, where, how much and how to reach them. */
export function isQualified(missing: string[]): boolean {
  return !['intent', 'location', 'budget', 'contact'].some((f) => missing.includes(f));
}

export function buildClientResponse(
  c: Classification,
  urgency: Urgency,
  score: number,
  reply: string,
  matches: MatchSummary[],
  leadId: string,
  processedBy: 'n8n' | 'backend-fallback',
): ClientResponse {
  return {
    ok: true,
    leadId,
    reply,
    processedBy,
    intent: c.intent,
    urgency,
    score,
    missingFields: c.missing_fields,
    done: isQualified(c.missing_fields),
    summary: {
      intent: c.intent,
      location: c.location.preferred,
      budget: budgetText(c.budget),
      timeline: c.timeline.raw,
      propertyType: c.property_requirements.type,
      bedrooms: c.property_requirements.bedrooms,
      name: c.contact.name,
      phone: c.contact.phone,
      email: c.contact.email,
    },
    matches,
  };
}

// ---------------------------------------------------------------------------------------------
// Google Sheet row (column order must match apps-script/Code.gs HEADERS)
// ---------------------------------------------------------------------------------------------

export const SHEET_HEADERS = [
  'Timestamp', 'Lead ID', 'Channel', 'Name', 'Phone', 'Email', 'Intent', 'Urgency', 'Score', 'Location',
  'Budget', 'Timeline', 'Requirements', 'Summary', 'Auto-Response', 'Status', 'Assigned Broker',
];

export function requirementsText(pr: Classification['property_requirements']): string {
  return [
    pr.bedrooms ? `${pr.bedrooms}BHK` : null,
    pr.type,
    pr.area_sqft ? `${pr.area_sqft} sqft` : null,
    pr.furnishing,
    ...(pr.amenities ?? []),
    ...(pr.other ?? []),
  ]
    .filter(Boolean)
    .join(', ');
}

export function budgetText(b: Classification['budget']): string {
  if (b.min === null && b.max === null) return b.raw || '';
  const range = b.min !== null && b.max !== null ? `${money(b.min)} – ${money(b.max)}` : money(b.max ?? b.min);
  return `${range}${b.period === 'monthly' ? '/month' : ''}`;
}
