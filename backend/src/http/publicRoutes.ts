import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Lead, Message, Property } from '../db/models.js';
import { logger } from '../logger.js';
import { processInbound } from '../pipeline/process.js';
import { formFieldsToText, normalizeInbound } from '../pipeline/rules.js';
import { apifyStatus, LIVE_FILTER } from '../services/apify.js';
import { asyncH, formLimiter, isBot, publicLimiter } from './middleware.js';

export const publicRouter = Router();

const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);

export const chatMessageSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  text: z.string().trim().min(1, 'Please type a message').max(1500),
  propertySlug: z.string().regex(/^[a-z0-9-]{1,120}$/).optional().nullable(),
});

export const leadFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your name').max(80),
    email: z.string().trim().email('Please enter a valid email').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d][\d\s-]{7,16}$/, 'Please enter a valid phone number'),
    intent: z.enum(['Buy', 'Rent', 'Invest']),
    location: z.string().trim().min(2, 'Where are you looking?').max(120),
    budget: z.string().trim().max(60).optional().default(''),
    timeline: z.string().trim().max(60).optional().default(''),
    message: z.string().trim().max(1500).optional().default(''),
  })
  .passthrough();

// --- website chatbot -------------------------------------------------------------------------

publicRouter.post(
  '/chat/message',
  publicLimiter,
  asyncH(async (req, res) => {
    const body = chatMessageSchema.parse(req.body);
    const sessionId = body.sessionId ?? randomUUID().replace(/-/g, '');
    const inb = normalizeInbound({
      channel: 'web_chat',
      sessionId,
      text: body.text,
      propertySlug: body.propertySlug ?? null,
      traceId: 'web_' + randomUUID(),
    });
    const out = await processInbound(inb);
    res.json({ ...out, sessionId });
  }),
);

/** Restores a conversation after a refresh (localStorage keeps only the session id). */
publicRouter.get(
  '/chat/session/:sessionId',
  asyncH(async (req, res) => {
    const sid = sessionIdSchema.safeParse(req.params.sessionId);
    if (!sid.success) return res.status(400).json({ ok: false, error: 'bad session id' });
    const lead = await Lead.findOne({ sessionId: sid.data }).lean();
    if (!lead) return res.json({ ok: true, messages: [] });
    const msgs = await Message.find({ leadId: lead._id }).sort({ createdAt: 1 }).limit(100).lean();
    res.json({
      ok: true,
      messages: msgs.map((m) => ({ id: String(m._id), author: m.author, text: m.text, at: m.createdAt })),
      urgency: lead.urgency,
      missingFields: lead.missingFields,
    });
  }),
);

// --- website CTA form --------------------------------------------------------------------------

publicRouter.post(
  '/leads/form',
  formLimiter,
  asyncH(async (req, res) => {
    if (isBot(req.body)) {
      logger.warn({ ip: req.ip }, 'honeypot triggered on lead form');
      return res.json({ ok: true, reply: 'Thanks! We will be in touch shortly.' }); // silent drop
    }
    const f = leadFormSchema.parse(req.body);
    const text = formFieldsToText({ intent: f.intent, location: f.location, budget: f.budget, timeline: f.timeline, message: f.message });
    const inb = normalizeInbound({
      channel: 'web_form',
      text,
      contact: { name: f.name, email: f.email, phone: f.phone },
      traceId: 'form_' + randomUUID(),
    });
    const out = await processInbound(inb);
    res.json(out);
  }),
);

// --- property listings -------------------------------------------------------------------------

/** Freshness of the live data, shown on the website ("Live from MagicBricks · updated 8 min ago"). */
publicRouter.get(
  '/properties/meta',
  asyncH(async (_req, res) => {
    const s = await apifyStatus();
    res.json({ ok: true, source: s.source, lastSuccessfulSyncAt: s.lastSuccessfulSyncAt, activeListings: s.activeListings, syncIntervalMin: s.syncIntervalMin, syncing: s.runningScrapes > 0 });
  }),
);

const listQuery = z.object({
  mode: z.enum(['buy', 'rent', 'invest']).optional(),
  location: z.string().max(60).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  bedrooms: z.coerce.number().int().min(0).max(10).optional(),
  type: z.enum(['apartment', 'villa', 'plot', 'commercial', 'other']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

publicRouter.get(
  '/properties',
  asyncH(async (req, res) => {
    const q = listQuery.parse(req.query);
    // Live Apify listings only (active, real, with a source URL).
    const filter: Record<string, unknown> = { ...LIVE_FILTER };
    if (q.mode === 'buy') filter.listingType = 'sale';
    if (q.mode === 'rent') filter.listingType = 'rent';
    if (q.mode === 'invest') Object.assign(filter, { investment: true, listingType: 'sale' });
    if (q.location) {
      const rx = new RegExp(q.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ city: rx }, { locality: rx }];
    }
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      filter.price = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
    }
    if (q.bedrooms !== undefined) filter.bedrooms = q.bedrooms >= 4 ? { $gte: 4 } : q.bedrooms;
    if (q.type) filter.type = q.type;
    const items = await Property.find(filter).sort({ listedAt: -1 }).limit(q.limit ?? 60).lean();
    const cities = (await Property.distinct('city', LIVE_FILTER)).sort();
    const s = await apifyStatus();
    res.json({ ok: true, items, cities, sync: { source: s.source, lastSuccessfulSyncAt: s.lastSuccessfulSyncAt, activeListings: s.activeListings } });
  }),
);

publicRouter.get(
  '/properties/:slug',
  asyncH(async (req, res) => {
    // Inactive listings still resolve (old links keep working) but are flagged as no longer available.
    const p = await Property.findOne({ slug: String(req.params.slug), source: { $ne: 'demo' } }).lean();
    if (!p) return res.status(404).json({ ok: false, error: 'not found' });
    const similar = await Property.find({ ...LIVE_FILTER, _id: { $ne: p._id }, listingType: p.listingType, city: p.city }).limit(3).lean();
    res.json({ ok: true, item: p, similar });
  }),
);
