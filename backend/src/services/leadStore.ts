import { Types } from 'mongoose';
import {
  Broker,
  IntakeLog,
  Lead,
  Message,
  Property,
  type BrokerDoc,
  type Channel,
  type LeadDoc,
} from '../db/models.js';
import { logger } from '../logger.js';
import {
  budgetText,
  requirementsText,
  type Classification,
  type Contact,
  type HistoryItem,
  type NormalizedInbound,
  type PreviousExtraction,
  type Urgency,
} from '../pipeline/rules.js';
import { emitAdmin } from './events.js';

const DAY = 24 * 60 * 60 * 1000;

export async function findLeadForInbound(inb: Pick<NormalizedInbound, 'leadId' | 'sessionId' | 'contact' | 'channel'>) {
  if (inb.leadId && Types.ObjectId.isValid(inb.leadId)) {
    const l = await Lead.findById(inb.leadId);
    if (l) return l;
  }
  if (inb.sessionId) {
    const l = await Lead.findOne({ sessionId: inb.sessionId }).sort({ updatedAt: -1 });
    if (l) return l;
  }
  const or: Record<string, string>[] = [];
  if (inb.contact.phone) or.push({ 'contact.phone': inb.contact.phone });
  if (inb.contact.email) or.push({ 'contact.email': inb.contact.email });
  if (or.length) return Lead.findOne({ $or: or }).sort({ updatedAt: -1 });
  return null;
}

export interface IntakeContext {
  leadId: string | null;
  isNew: boolean;
  history: HistoryItem[];
  previous: PreviousExtraction | null;
  knownContact: Contact;
  repeatContactWithin24h: boolean;
  propertyContext: string | null;
  propertyOfInterest: string | null;
  currentStatus: string | null;
  today: string;
}

/** Everything the classifier needs about this customer before the LLM call. */
export async function getIntakeContext(inb: NormalizedInbound, meta: { executionId?: string; path: 'n8n' | 'backend-fallback' }): Promise<IntakeContext> {
  const lead = await findLeadForInbound(inb);
  let history: HistoryItem[] = [];
  let repeat = false;
  if (lead) {
    const msgs = await Message.find({ leadId: lead._id }).sort({ createdAt: 1 }).limit(60).lean();
    history = msgs
      .filter((m) => m.traceId !== inb.traceId)
      .map((m) => ({ author: m.author as HistoryItem['author'], text: m.text, at: new Date(m.createdAt).toISOString() }));
    const lastInbound = [...msgs].reverse().find((m) => m.direction === 'inbound' && m.traceId !== inb.traceId);
    if (lastInbound) {
      const gap = Date.now() - new Date(lastInbound.createdAt).getTime();
      const separateContact =
        inb.channel === 'web_form' || inb.channel === 'google_form' || lastInbound.channel !== inb.channel || gap > 2 * 60 * 60 * 1000;
      repeat = separateContact && gap < DAY;
    }
  }
  let propertyContext: string | null = null;
  let propertyOfInterest: string | null = lead?.propertyOfInterest ?? null;
  if (inb.propertySlug) {
    const p = await Property.findOne({ slug: inb.propertySlug }).lean();
    if (p) {
      propertyContext = `"${p.title}" (slug ${p.slug}) — ${p.listingType === 'rent' ? 'for rent' : 'for sale'}, ${p.type}, ${p.bedrooms ?? '-'} bed, ${p.locality ?? ''} ${p.city}, ${p.priceLabel}`;
      propertyOfInterest = p.title;
    }
  }
  const knownContact: Contact = {
    name: inb.contact.name || lead?.contact?.name || null,
    phone: inb.contact.phone || lead?.contact?.phone || null,
    email: inb.contact.email || lead?.contact?.email || null,
  };
  await IntakeLog.create({
    traceId: inb.traceId,
    executionId: meta.executionId ?? null,
    channel: inb.channel,
    leadId: lead?._id ?? null,
    contact: knownContact,
    path: meta.path,
  });
  return {
    leadId: lead ? String(lead._id) : null,
    isNew: !lead,
    history,
    previous: lead ? leadToPrevious(lead.toObject() as LeadDoc) : null,
    knownContact,
    repeatContactWithin24h: repeat,
    propertyContext,
    propertyOfInterest,
    currentStatus: lead?.status ?? null,
    today: new Date().toISOString().slice(0, 10),
  };
}

function leadToPrevious(l: LeadDoc): PreviousExtraction {
  return {
    intent: l.intent as PreviousExtraction['intent'],
    intentConfidence: l.intentConfidence,
    location: { preferred: l.location?.preferred ?? [], flexible: l.location?.flexible ?? true },
    budget: {
      min: l.budget?.min ?? null,
      max: l.budget?.max ?? null,
      currency: l.budget?.currency ?? 'INR',
      period: l.budget?.period ?? null,
      raw: l.budget?.raw ?? '',
    },
    timeline: { raw: l.timeline?.raw ?? '', daysEstimate: l.timeline?.daysEstimate ?? null },
    propertyRequirements: {
      type: l.propertyRequirements?.type ?? null,
      bedrooms: l.propertyRequirements?.bedrooms ?? null,
      bathrooms: l.propertyRequirements?.bathrooms ?? null,
      areaSqft: l.propertyRequirements?.areaSqft ?? null,
      furnishing: l.propertyRequirements?.furnishing ?? null,
      amenities: l.propertyRequirements?.amenities ?? [],
      other: l.propertyRequirements?.other ?? [],
    },
    propertyOfInterest: l.propertyOfInterest ?? null,
    contact: { name: l.contact?.name ?? null, phone: l.contact?.phone ?? null, email: l.contact?.email ?? null },
  };
}

/** Simple auto-assignment: broker covering the lead's location with the lead's intent specialty, least loaded first. */
export async function pickBroker(locations: string[], intent: string): Promise<BrokerDoc | null> {
  const brokers = (await Broker.find({ active: true }).lean()) as unknown as BrokerDoc[];
  if (!brokers.length) return null;
  const locs = locations.map((l) => l.toLowerCase());
  const scored = await Promise.all(
    brokers.map(async (b) => {
      const areaHit = (b.areas ?? []).some((a) => locs.some((l) => l.includes(a.toLowerCase()) || a.toLowerCase().includes(l)));
      const specHit = (b.specialties ?? []).includes(intent as 'buyer');
      const load = await Lead.countDocuments({ assignedBroker: b._id, status: { $in: ['new', 'auto_responded', 'needs_broker', 'contacted'] } });
      return { b, s: (areaHit ? 10 : 0) + (specHit ? 5 : 0) - load * 0.1 };
    }),
  );
  scored.sort((a, b) => b.s - a.s);
  return scored[0].b;
}

export interface UpsertInput {
  traceId: string;
  executionId?: string | null;
  processedBy: 'n8n' | 'backend-fallback';
  inbound: NormalizedInbound;
  leadId: string | null;
  classification: Classification;
  classificationRaw: unknown;
  llmProvider: string | null;
  urgency: Urgency;
  urgencyReason: string;
  llmUrgency: Urgency | null;
  score: number;
  status: string;
  reply: string;
  replyProvider: string | null;
  matches: string[];
  manualReview: boolean;
  responseTimeMs: number | null;
}

export interface UpsertResult {
  leadId: string;
  isNew: boolean;
  duplicate: boolean;
  sheet: { leadId: string; row: (string | number)[]; sheetRow: number | null };
  broker: { name: string; email: string; phone: string | null } | null;
  notifyBroker: boolean;
  customerEmail: string | null;
  customerPhone: string | null;
  brief: string;
}

/** Idempotent (by traceId) write of one processed turn: lead fields + inbound + outbound message. */
export async function upsertLeadResult(input: UpsertInput): Promise<UpsertResult> {
  const c = input.classification;
  const inb = input.inbound;
  let lead = input.leadId && Types.ObjectId.isValid(input.leadId) ? await Lead.findById(input.leadId) : null;
  if (!lead) lead = await findLeadForInbound(inb);

  // Same traceId already stored (n8n finished after the backend fallback started, or a retry).
  if (lead) {
    const dup = await Message.findOne({ leadId: lead._id, traceId: input.traceId, direction: 'outbound' });
    if (dup) {
      logger.info({ traceId: input.traceId, leadId: String(lead._id) }, 'upsert skipped: turn already stored');
      return buildResult(lead.toObject() as LeadDoc, false, true);
    }
  }
  const isNew = !lead;
  if (!lead) lead = new Lead({ channel: inb.channel, channels: [inb.channel], sessionId: inb.sessionId ?? undefined, status: 'new' });

  const channels = new Set<Channel>([...(lead.channels ?? []), inb.channel as Channel]);
  lead.set({
    channels: [...channels],
    contact: {
      name: c.contact.name ?? lead.contact?.name ?? null,
      phone: c.contact.phone ?? lead.contact?.phone ?? null,
      email: c.contact.email ?? lead.contact?.email ?? null,
    },
    intent: c.intent,
    intentConfidence: c.intent_confidence,
    urgency: input.urgency,
    urgencyReason: input.urgencyReason,
    llmUrgency: input.llmUrgency,
    score: input.score,
    location: c.location,
    budget: c.budget,
    timeline: { raw: c.timeline.raw, daysEstimate: c.timeline.days_estimate },
    propertyRequirements: {
      type: c.property_requirements.type,
      bedrooms: c.property_requirements.bedrooms,
      bathrooms: c.property_requirements.bathrooms,
      areaSqft: c.property_requirements.area_sqft,
      furnishing: c.property_requirements.furnishing,
      amenities: c.property_requirements.amenities,
      other: c.property_requirements.other,
    },
    propertyOfInterest: c.property_of_interest,
    missingFields: c.missing_fields,
    summaryForBroker: c.summary_for_broker,
    nextQuestion: c.next_question,
    autoResponse: input.reply,
    matchedProperties: input.matches,
    classificationRaw: input.classificationRaw,
    llmProvider: input.llmProvider,
    processedBy: input.processedBy,
    needsManualReview: input.manualReview || lead.needsManualReview,
    lastResponseMs: input.responseTimeMs,
    lastMessageAt: new Date(),
  });
  if (inb.sessionId && !lead.sessionId) lead.sessionId = inb.sessionId;
  if (lead.status !== input.status) {
    lead.statusHistory.push({ from: lead.status, to: input.status, by: input.processedBy, at: new Date() });
    lead.status = input.status as LeadDoc['status'];
  }
  if (!lead.assignedBroker) {
    const b = await pickBroker(c.location.preferred, c.intent);
    if (b) lead.assignedBroker = b._id;
  }
  await lead.save();

  await Message.create({
    leadId: lead._id,
    channel: inb.channel,
    direction: 'inbound',
    author: 'customer',
    text: inb.text,
    providerMessageId: inb.providerMessageId,
    traceId: input.traceId,
    createdAt: inb.receivedAt ? new Date(inb.receivedAt) : new Date(),
  });
  await Message.create({
    leadId: lead._id,
    channel: inb.channel,
    direction: 'outbound',
    author: 'ai',
    text: input.reply,
    traceId: input.traceId,
    responseTimeMs: input.responseTimeMs,
    deliveryStatus: inb.channel === 'whatsapp' ? 'pending' : 'shown',
  });
  await IntakeLog.updateMany({ traceId: input.traceId }, { $set: { leadId: lead._id, status: 'done' } });

  const obj = lead.toObject() as LeadDoc;
  emitAdmin({ type: isNew ? 'lead.created' : 'lead.updated', leadId: String(lead._id), urgency: obj.urgency, channel: inb.channel });
  logger.info(
    { leadId: String(lead._id), traceId: input.traceId, processedBy: input.processedBy, intent: c.intent, urgency: input.urgency, score: input.score },
    'lead upserted',
  );
  return buildResult(obj, isNew, false);
}

export function brokerBrief(l: LeadDoc): string {
  const req = requirementsText({
    type: (l.propertyRequirements?.type as any) ?? null,
    bedrooms: l.propertyRequirements?.bedrooms ?? null,
    bathrooms: l.propertyRequirements?.bathrooms ?? null,
    area_sqft: l.propertyRequirements?.areaSqft ?? null,
    furnishing: l.propertyRequirements?.furnishing ?? null,
    amenities: l.propertyRequirements?.amenities ?? [],
    other: l.propertyRequirements?.other ?? [],
  });
  const contact = [l.contact?.name, l.contact?.phone, l.contact?.email].filter(Boolean).join(' · ') || 'no contact yet';
  const next =
    l.urgency === 'high'
      ? 'Call now and offer site visits for the matched listings.'
      : (l.missingFields ?? []).length
        ? `Confirm the missing details (${(l.missingFields ?? []).join(', ')}) and share a shortlist.`
        : 'Share a curated shortlist and book a site visit.';
  return `${l.summaryForBroker || 'No summary yet.'} Requirements: ${req || 'not specified'}; budget ${budgetText(l.budget as any) || 'not specified'}; timeline ${l.timeline?.raw || 'not specified'}. Contact: ${contact}. Suggested next step: ${next}`;
}

async function buildResult(l: LeadDoc, isNew: boolean, duplicate: boolean): Promise<UpsertResult> {
  const broker = l.assignedBroker ? ((await Broker.findById(l.assignedBroker).lean()) as unknown as BrokerDoc | null) : null;
  return {
    leadId: String(l._id),
    isNew,
    duplicate,
    sheet: { leadId: String(l._id), row: sheetRow(l, broker?.name ?? ''), sheetRow: l.sheetRow ?? null },
    broker: broker ? { name: broker.name, email: broker.email, phone: broker.phone ?? null } : null,
    notifyBroker: !duplicate && l.urgency === 'high' && !l.brokerNotifiedAt,
    customerEmail: l.contact?.email ?? null,
    customerPhone: l.contact?.phone ?? null,
    brief: brokerBrief(l),
  };
}

const CHANNEL_LABEL: Record<string, string> = {
  web_chat: 'Website Chat',
  web_form: 'Website Form',
  google_form: 'Google Form',
  whatsapp: 'WhatsApp',
};

export function sheetRow(l: LeadDoc, brokerName: string): (string | number)[] {
  return [
    new Date().toISOString(),
    String(l._id),
    CHANNEL_LABEL[l.channel] ?? l.channel,
    l.contact?.name ?? '',
    l.contact?.phone ?? '',
    l.contact?.email ?? '',
    l.intent,
    l.urgency,
    l.score,
    (l.location?.preferred ?? []).join(', '),
    budgetText(l.budget as any),
    l.timeline?.raw ?? '',
    requirementsText({
      type: (l.propertyRequirements?.type as any) ?? null,
      bedrooms: l.propertyRequirements?.bedrooms ?? null,
      bathrooms: null,
      area_sqft: l.propertyRequirements?.areaSqft ?? null,
      furnishing: l.propertyRequirements?.furnishing ?? null,
      amenities: l.propertyRequirements?.amenities ?? [],
      other: l.propertyRequirements?.other ?? [],
    }),
    l.summaryForBroker ?? '',
    l.autoResponse ?? '',
    l.status,
    brokerName,
  ];
}

export async function recordSheetRow(leadId: string, row: number | null, ok: boolean, error?: string, skipped = false): Promise<void> {
  if (!Types.ObjectId.isValid(leadId) || skipped) return;
  if (ok && row) await Lead.updateOne({ _id: leadId }, { $set: { sheetRow: row } });
  if (!ok) logger.warn({ leadId, error }, 'sheet sync failed');
}

/**
 * Records a high-urgency broker notification. The admin-panel alert (live SSE toast + top of the
 * follow-up queue) always fires; the email result from Apps Script is stored next to it.
 */
export async function recordBrokerAlert(leadId: string, email: { ok: boolean; skipped?: boolean; error?: string | null }): Promise<void> {
  if (!Types.ObjectId.isValid(leadId)) return;
  const lead = await Lead.findById(leadId);
  if (!lead) return;
  const now = new Date();
  lead.brokerAlerts.push({ channel: 'admin-panel', ok: true, detail: 'Live alert + follow-up queue', at: now });
  lead.brokerAlerts.push({
    channel: 'email',
    ok: email.ok,
    detail: email.ok ? 'Sent via Apps Script MailApp' : email.skipped ? 'Skipped: Apps Script web app not configured' : `Failed: ${email.error ?? 'unknown'}`,
    at: now,
  });
  lead.brokerNotifiedAt = now;
  await lead.save();
  emitAdmin({ type: 'broker.alert', leadId, urgency: lead.urgency, channel: lead.channel, name: lead.contact?.name ?? null, summary: lead.summaryForBroker ?? '' });
  logger.info({ leadId, email: email.ok ? 'sent' : email.skipped ? 'skipped' : 'failed' }, 'broker alerted');
}
