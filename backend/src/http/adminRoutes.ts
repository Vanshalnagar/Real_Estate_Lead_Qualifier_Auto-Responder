import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { z } from 'zod';
import { config } from '../config.js';
import { dbState } from '../db/connect.js';
import { Admin, Broker, Lead, LEAD_STATUSES, Message, Property, type LeadDoc } from '../db/models.js';
import { logger } from '../logger.js';
import { geminiProvider, groqProvider } from '../pipeline/llm.js';
import { pingAppsScript, sendCustomerEmail, sheetsConfigured, upsertSheetRow } from '../services/appsScript.js';
import { bus, emitAdmin, type AdminEvent } from '../services/events.js';
import { brokerBrief, recordSheetRow, sheetRow } from '../services/leadStore.js';
import { toMatchSummary } from '../services/matching.js';
import { n8nHealth } from '../services/n8n.js';
import { apifyStatus, apifyTick } from '../services/apify.js';
import { buildMetaInboundPayload, sendWhatsAppText, signWhatsAppBody, whatsappLiveConfigured } from '../services/whatsapp.js';
import { AUTH_COOKIE, asyncH, loginLimiter, requireAdmin, type AdminClaims } from './middleware.js';

export const adminRouter = Router();
type AReq = Request & { admin: AdminClaims };

// --- auth --------------------------------------------------------------------------------------

adminRouter.post(
  '/auth/login',
  loginLimiter,
  asyncH(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      logger.warn({ email }, 'admin login failed');
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }
    const token = jwt.sign({ sub: String(admin._id), email: admin.email } satisfies AdminClaims, config.JWT_SECRET, { expiresIn: '12h' });
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ ok: true, email: admin.email });
  }),
);

adminRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.json({ ok: true });
});

adminRouter.use(requireAdmin);
adminRouter.get('/auth/me', (req, res) => res.json({ ok: true, email: (req as AReq).admin.email }));

// --- dashboard ---------------------------------------------------------------------------------

adminRouter.get(
  '/stats',
  asyncH(async (_req, res) => {
    const [total, highWaiting, byIntent, byChannel, byStatus, resp, last7] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ urgency: 'high', status: { $in: ['new', 'auto_responded', 'needs_broker'] } }),
      Lead.aggregate([{ $group: { _id: '$intent', n: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$channel', n: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Message.aggregate([{ $match: { author: 'ai', responseTimeMs: { $ne: null } } }, { $group: { _id: null, avg: { $avg: '$responseTimeMs' } } }]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const toMap = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.n]));
    res.json({
      ok: true,
      total,
      highWaiting,
      byIntent: toMap(byIntent),
      byChannel: toMap(byChannel),
      byStatus: toMap(byStatus),
      avgResponseMs: Math.round(resp[0]?.avg ?? 0),
      last7Days: last7.map((d) => ({ day: d._id, n: d.n })),
    });
  }),
);

// --- leads -------------------------------------------------------------------------------------

const listQuery = z.object({
  search: z.string().max(80).optional(),
  intent: z.enum(['buyer', 'renter', 'investor', 'unclear']).optional(),
  urgency: z.enum(['high', 'medium', 'low']).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  channel: z.enum(['web_chat', 'web_form', 'google_form', 'whatsapp']).optional(),
  location: z.string().max(60).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(['newest', 'urgency', 'score']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

adminRouter.get(
  '/leads',
  asyncH(async (req, res) => {
    const q = listQuery.parse(req.query);
    const f: Record<string, unknown> = {};
    if (q.intent) f.intent = q.intent;
    if (q.urgency) f.urgency = q.urgency;
    if (q.status) f.status = q.status;
    if (q.channel) f.channels = q.channel;
    if (q.location) f['location.preferred'] = new RegExp(esc(q.location), 'i');
    if (q.from || q.to) {
      f.createdAt = {
        ...(q.from ? { $gte: new Date(q.from) } : {}),
        ...(q.to ? { $lte: new Date(new Date(q.to).getTime() + 86399999) } : {}),
      };
    }
    if (q.search) {
      const rx = new RegExp(esc(q.search), 'i');
      f.$or = [{ 'contact.name': rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { summaryForBroker: rx }, { 'location.preferred': rx }];
    }
    const pipeline: any[] = [
      { $match: f },
      { $addFields: { urgencyRank: { $indexOfArray: [['high', 'medium', 'low'], '$urgency'] } } },
      { $sort: q.sort === 'urgency' ? { urgencyRank: 1, score: -1, createdAt: -1 } : q.sort === 'score' ? { score: -1, createdAt: -1 } : { createdAt: -1 } },
      { $facet: { items: [{ $skip: (q.page - 1) * q.pageSize }, { $limit: q.pageSize }], total: [{ $count: 'n' }] } },
    ];
    const [r] = await Lead.aggregate(pipeline);
    const brokers = await Broker.find().lean();
    const bmap = new Map(brokers.map((b) => [String(b._id), b.name]));
    res.json({
      ok: true,
      total: r.total[0]?.n ?? 0,
      items: r.items.map((l: LeadDoc) => ({
        _id: l._id,
        channel: l.channel,
        channels: l.channels,
        contact: l.contact,
        intent: l.intent,
        urgency: l.urgency,
        score: l.score,
        status: l.status,
        location: l.location?.preferred ?? [],
        budget: l.budget,
        summaryForBroker: l.summaryForBroker,
        processedBy: l.processedBy,
        needsManualReview: l.needsManualReview,
        assignedBroker: l.assignedBroker ? bmap.get(String(l.assignedBroker)) ?? null : null,
        createdAt: l.createdAt,
        lastMessageAt: l.lastMessageAt,
      })),
    });
  }),
);

adminRouter.get(
  '/leads/:id',
  asyncH(async (req, res) => {
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ ok: false });
    const lead = (await Lead.findById(req.params.id).lean()) as LeadDoc | null;
    if (!lead) return res.status(404).json({ ok: false, error: 'not found' });
    const [messages, matches, broker] = await Promise.all([
      Message.find({ leadId: lead._id }).sort({ createdAt: 1 }).lean(),
      Property.find({ slug: { $in: lead.matchedProperties ?? [] } }).lean(),
      lead.assignedBroker ? Broker.findById(lead.assignedBroker).lean() : null,
    ]);
    res.json({
      ok: true,
      lead,
      brief: brokerBrief(lead),
      messages,
      matches: matches.map((m) => ({ ...toMatchSummary(m as any), image: m.images?.[0] })),
      broker,
      sheetConfigured: sheetsConfigured(),
      sheetUrl: config.SHEETS_SPREADSHEET_URL && lead.sheetRow ? `${config.SHEETS_SPREADSHEET_URL.split('#')[0]}#gid=0&range=A${lead.sheetRow}` : null,
    });
  }),
);

const patchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  assignedBroker: z.string().nullable().optional(),
});

adminRouter.patch(
  '/leads/:id',
  asyncH(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ ok: false });
    const by = (req as AReq).admin.email;
    if (body.status && body.status !== lead.status) {
      lead.statusHistory.push({ from: lead.status, to: body.status, by, at: new Date() });
      lead.status = body.status;
    }
    if (body.assignedBroker !== undefined) {
      if (body.assignedBroker && !(await Broker.exists({ _id: body.assignedBroker }))) return res.status(400).json({ ok: false, error: 'unknown broker' });
      lead.assignedBroker = body.assignedBroker ? new Types.ObjectId(body.assignedBroker) : null;
    }
    await lead.save();
    void syncSheet(lead.toObject() as LeadDoc);
    emitAdmin({ type: 'lead.updated', leadId: String(lead._id), urgency: lead.urgency, channel: lead.channel });
    res.json({ ok: true, lead });
  }),
);

adminRouter.post(
  '/leads/:id/notes',
  asyncH(async (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ ok: false });
    lead.brokerNotes.push({ author: (req as AReq).admin.email, text });
    await lead.save();
    emitAdmin({ type: 'lead.updated', leadId: String(lead._id), urgency: lead.urgency, channel: lead.channel });
    res.json({ ok: true, notes: lead.brokerNotes });
  }),
);

/** Broker reply on the lead's original channel; logged to the conversation. */
adminRouter.post(
  '/leads/:id/reply',
  asyncH(async (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(1500) }).parse(req.body);
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ ok: false });
    const lastInbound = await Message.findOne({ leadId: lead._id, direction: 'inbound' }).sort({ createdAt: -1 });
    const channel = (lastInbound?.channel ?? lead.channel) as LeadDoc['channel'];
    let deliveryStatus = 'shown';
    let providerMessageId: string | null = null;
    let via: string = channel;
    if (channel === 'whatsapp' && lead.contact?.phone) {
      const r = await sendWhatsAppText(lead.contact.phone, text);
      deliveryStatus = r.simulated ? 'simulated' : r.ok ? 'sent' : 'failed';
      providerMessageId = r.id ?? null;
    } else if ((channel === 'web_form' || channel === 'google_form') && lead.contact?.email) {
      const r = await sendCustomerEmail({ leadId: String(lead._id), to: lead.contact.email, subject: 'Update on your property enquiry — NESTR.', body: text });
      deliveryStatus = r.ok ? 'sent' : r.skipped ? 'email-not-configured' : 'failed';
      via = 'email';
    }
    const msg = await Message.create({ leadId: lead._id, channel, direction: 'outbound', author: 'broker', text, deliveryStatus, providerMessageId });
    if (['new', 'auto_responded', 'needs_broker'].includes(lead.status)) {
      lead.statusHistory.push({ from: lead.status, to: 'contacted', by: (req as AReq).admin.email, at: new Date() });
      lead.status = 'contacted';
    }
    lead.lastMessageAt = new Date();
    await lead.save();
    void syncSheet(lead.toObject() as LeadDoc);
    emitAdmin({ type: 'message', leadId: String(lead._id), direction: 'outbound' });
    res.json({ ok: true, message: msg, via, deliveryStatus });
  }),
);

adminRouter.get(
  '/followup',
  asyncH(async (_req, res) => {
    const leads = (await Lead.aggregate([
      { $match: { $or: [{ urgency: 'high', status: { $nin: ['closed_won', 'closed_lost'] } }, { status: 'needs_broker' }] } },
      { $addFields: { urgencyRank: { $indexOfArray: [['high', 'medium', 'low'], '$urgency'] } } },
      { $sort: { urgencyRank: 1, score: -1, createdAt: 1 } },
      { $limit: 100 },
    ])) as LeadDoc[];
    const brokers = await Broker.find().lean();
    const bmap = new Map(brokers.map((b) => [String(b._id), b]));
    res.json({
      ok: true,
      items: leads.map((l) => ({
        _id: l._id,
        channel: l.channel,
        contact: l.contact,
        intent: l.intent,
        urgency: l.urgency,
        score: l.score,
        status: l.status,
        brief: brokerBrief(l),
        assignedBroker: l.assignedBroker ? { _id: l.assignedBroker, name: bmap.get(String(l.assignedBroker))?.name } : null,
        brokerNotifiedAt: l.brokerNotifiedAt,
        needsManualReview: l.needsManualReview,
        createdAt: l.createdAt,
      })),
      brokers: brokers.map((b) => ({ _id: b._id, name: b.name, areas: b.areas, specialties: b.specialties })),
    });
  }),
);

adminRouter.get(
  '/brokers',
  asyncH(async (_req, res) => res.json({ ok: true, items: await Broker.find().lean() })),
);

/** Latest conversation events across all leads, for the dashboard's live activity feed. */
adminRouter.get(
  '/activity',
  asyncH(async (req, res) => {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
    const msgs = await Message.find().sort({ createdAt: -1 }).limit(limit).lean();
    const leads = await Lead.find({ _id: { $in: [...new Set(msgs.map((m) => String(m.leadId)))] } }, { contact: 1, urgency: 1, intent: 1 }).lean();
    const byId = new Map(leads.map((l) => [String(l._id), l]));
    res.json({
      ok: true,
      items: msgs.map((m) => {
        const l = byId.get(String(m.leadId));
        return {
          _id: m._id,
          leadId: m.leadId,
          name: l?.contact?.name ?? null,
          phone: l?.contact?.phone ?? null,
          urgency: l?.urgency ?? null,
          intent: l?.intent ?? null,
          channel: m.channel,
          author: m.author,
          text: m.text.slice(0, 160),
          responseTimeMs: m.responseTimeMs,
          createdAt: m.createdAt,
        };
      }),
    });
  }),
);

// --- live updates (SSE) -------------------------------------------------------------------------

adminRouter.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const onEvent = (e: AdminEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  bus.on('admin', onEvent);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('admin', onEvent);
  });
});

// --- WhatsApp simulator -------------------------------------------------------------------------

adminRouter.post(
  '/simulator/whatsapp',
  asyncH(async (req, res) => {
    const b = z
      .object({ from: z.string().regex(/^\+?\d{10,15}$/), name: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    const payload = buildMetaInboundPayload(b);
    const raw = JSON.stringify(payload);
    // Post to the real webhook route, signed exactly as Meta would sign it.
    const r = await fetch(`http://127.0.0.1:${config.PORT}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.WHATSAPP_APP_SECRET ? { 'X-Hub-Signature-256': signWhatsAppBody(raw) } : {}),
      },
      body: raw,
    });
    res.json({ ok: r.ok, status: r.status, payload });
  }),
);

adminRouter.get(
  '/simulator/thread',
  asyncH(async (req, res) => {
    const phone = String(req.query.phone ?? '').replace(/[^\d]/g, '');
    if (!phone) return res.json({ ok: true, lead: null, messages: [] });
    const lead = await Lead.findOne({ 'contact.phone': '+' + phone }).sort({ updatedAt: -1 }).lean();
    if (!lead) return res.json({ ok: true, lead: null, messages: [] });
    const messages = await Message.find({ leadId: lead._id, channel: 'whatsapp' }).sort({ createdAt: 1 }).lean();
    res.json({ ok: true, lead: { _id: lead._id, intent: lead.intent, urgency: lead.urgency, score: lead.score, status: lead.status, processedBy: lead.processedBy }, messages });
  }),
);

// --- live property data (Apify) ----------------------------------------------------------------------

adminRouter.get('/apify', asyncH(async (_req, res) => res.json({ ok: true, ...(await apifyStatus()) })));
/** Run one sync cycle now (collect finished scrapes, maybe start the next one). */
adminRouter.post(
  '/apify/sync',
  asyncH(async (_req, res) => {
    await apifyTick();
    res.json({ ok: true, ...(await apifyStatus()) });
  }),
);

// --- settings / health ---------------------------------------------------------------------------

async function probeLlm(p: typeof groqProvider): Promise<{ ok: boolean; model: string; error?: string; ms?: number }> {
  if (!p.available()) return { ok: false, model: p.model, error: 'API key not set' };
  const t = Date.now();
  try {
    await p.complete({ system: 'Reply with the single word OK.', user: 'ping', json: false, maxTokens: 50 });
    return { ok: true, model: p.model, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, model: p.model, error: (e as Error).message.slice(0, 160) };
  }
}

adminRouter.get(
  '/health',
  asyncH(async (_req, res) => {
    const [n8n, groq, gemini, sheets, apify] = await Promise.all([
      n8nHealth(),
      probeLlm(groqProvider),
      probeLlm(geminiProvider),
      sheetsConfigured() ? pingAppsScript() : Promise.resolve({ ok: false, skipped: true, error: 'SHEETS_WEBAPP_URL / SHEETS_WEBHOOK_TOKEN not set' }),
      apifyStatus(),
    ]);
    const syncAgeMin = apify.lastSuccessfulSyncAt ? Math.round((Date.now() - new Date(apify.lastSuccessfulSyncAt).getTime()) / 60000) : null;
    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      services: {
        mongodb: { ok: dbState() === 'up', detail: config.MONGODB_URI.includes('mongodb.net') ? 'MongoDB Atlas' : 'Local MongoDB' },
        n8n: { ok: n8n.ok, detail: n8n.ok ? 'Webhook host reachable' : n8n.error, enabled: config.N8N_ENABLED },
        groq: { ok: groq.ok, detail: groq.ok ? `${groq.model} · ${groq.ms}ms` : `${groq.model}: ${groq.error}` },
        gemini: { ok: gemini.ok, detail: gemini.ok ? `${gemini.model} · ${gemini.ms}ms` : `${gemini.model}: ${gemini.error}` },
        sheets: { ok: sheets.ok, detail: sheets.ok ? 'Apps Script web app responding' : sheets.error },
        apify: {
          ok: apify.configured && apify.activeListings > 0 && !apify.lastErrorAt,
          detail: !apify.configured
            ? 'APIFY_API_TOKEN not set'
            : `${apify.activeListings} live listings · last successful sync ${syncAgeMin === null ? 'never' : `${syncAgeMin} min ago`} · ${apify.runningScrapes} scrape(s) running · usage $${(apify.monthlyUsageUsd ?? 0).toFixed(2)} of $${apify.budgetUsd} budget${apify.lastError ? ` · last error: ${apify.lastError.slice(0, 80)}` : ''}`,
        },
        whatsapp: {
          ok: config.WHATSAPP_PROVIDER === 'simulator' || whatsappLiveConfigured(),
          detail: config.WHATSAPP_PROVIDER === 'simulator' ? 'Simulator mode (no live number configured)' : whatsappLiveConfigured() ? 'Meta Cloud API configured' : 'Meta selected but token / phone number id missing',
        },
      },
    });
  }),
);

async function syncSheet(l: LeadDoc) {
  if (!sheetsConfigured()) return;
  const broker = l.assignedBroker ? await Broker.findById(l.assignedBroker).lean() : null;
  const r = await upsertSheetRow(String(l._id), sheetRow(l, broker?.name ?? ''));
  await recordSheetRow(String(l._id), r.row ?? null, r.ok, r.error, r.skipped);
}
