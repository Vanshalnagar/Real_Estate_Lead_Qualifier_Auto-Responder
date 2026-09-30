import { Router } from 'express';
import { z } from 'zod';
import { IntakeLog, Lead, Message } from '../db/models.js';
import { logger } from '../logger.js';
import { normalizeClassification, type NormalizedInbound } from '../pipeline/rules.js';
import { classificationSchema } from '../pipeline/schema.js';
import { emitAdmin } from '../services/events.js';
import { findLeadForInbound, getIntakeContext, recordBrokerAlert, recordSheetRow, upsertLeadResult } from '../services/leadStore.js';
import { matchProperties } from '../services/matching.js';
import { asyncH, requireInternalSecret } from './middleware.js';

export const internalRouter = Router();
internalRouter.use(requireInternalSecret);

const inboundSchema = z.object({
  channel: z.enum(['web_chat', 'web_form', 'google_form', 'whatsapp']),
  text: z.string().min(1).max(4000),
  contact: z.object({ name: z.string().nullish(), phone: z.string().nullish(), email: z.string().nullish() }),
  sessionId: z.string().nullable(),
  leadId: z.string().nullable(),
  traceId: z.string().min(4),
  propertySlug: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  receivedAt: z.string(),
});

internalRouter.get('/ping', (_req, res) => res.json({ ok: true }));

/** Step "fetch history": lead lookup, conversation so far, previous extraction, repeat-contact flag. */
internalRouter.post(
  '/context',
  asyncH(async (req, res) => {
    const inbound = inboundSchema.parse(req.body.inbound) as NormalizedInbound;
    const ctx = await getIntakeContext(inbound, { executionId: String(req.body.executionId ?? ''), path: 'n8n' });
    res.json({ ok: true, ...ctx });
  }),
);

internalRouter.post(
  '/properties/match',
  asyncH(async (req, res) => {
    const norm = normalizeClassification(req.body.classification);
    if (!norm.value) return res.status(400).json({ ok: false, error: 'invalid classification' });
    res.json({ ok: true, matches: await matchProperties(norm.value) });
  }),
);

const upsertSchema = z.object({
  traceId: z.string(),
  executionId: z.string().nullish(),
  processedBy: z.enum(['n8n', 'backend-fallback']),
  inbound: inboundSchema,
  leadId: z.string().nullable(),
  classification: classificationSchema,
  classificationRaw: z.unknown(),
  llmProvider: z.string().nullable(),
  urgency: z.enum(['high', 'medium', 'low']),
  urgencyReason: z.string(),
  llmUrgency: z.enum(['high', 'medium', 'low']).nullable(),
  score: z.number().min(0).max(100),
  status: z.enum(['new', 'auto_responded', 'needs_broker', 'contacted', 'qualified', 'closed_won', 'closed_lost']),
  reply: z.string().min(1),
  replyProvider: z.string().nullable(),
  matches: z.array(z.string()),
  manualReview: z.boolean(),
  responseTimeMs: z.number().nullable(),
});

internalRouter.post(
  '/leads/upsert',
  asyncH(async (req, res) => {
    const input = upsertSchema.parse(req.body);
    const out = await upsertLeadResult(input as Parameters<typeof upsertLeadResult>[0]);
    res.json({ ok: true, ...out });
  }),
);

internalRouter.post(
  '/leads/:id/sheet-row',
  asyncH(async (req, res) => {
    const body = z.object({ ok: z.boolean().optional(), row: z.coerce.number().nullish(), error: z.string().nullish(), skipped: z.boolean().optional() }).parse(req.body ?? {});
    if (!body.skipped) await recordSheetRow(req.params.id, body.row ?? null, Boolean(body.ok), body.error ?? undefined);
    res.json({ ok: true });
  }),
);

internalRouter.post(
  '/leads/:id/notified',
  asyncH(async (req, res) => {
    const body = z.object({ ok: z.boolean().optional(), channel: z.string().default('email'), error: z.string().nullish(), skipped: z.boolean().optional() }).parse(req.body ?? {});
    await recordBrokerAlert(req.params.id, { ok: Boolean(body.ok), skipped: body.skipped, error: body.error });
    res.json({ ok: true });
  }),
);

internalRouter.post(
  '/leads/:id/delivery',
  asyncH(async (req, res) => {
    const body = z.object({ traceId: z.string(), status: z.string(), providerMessageId: z.string().nullish() }).parse(req.body);
    await Message.updateOne(
      { leadId: req.params.id, traceId: body.traceId, direction: 'outbound' },
      { $set: { deliveryStatus: body.status, ...(body.providerMessageId ? { providerMessageId: body.providerMessageId } : {}) } },
    );
    emitAdmin({ type: 'message', leadId: req.params.id, direction: 'outbound' });
    res.json({ ok: true });
  }),
);

/** Called by the n8n "Lead Intake — Error Handler" workflow. Marks the affected lead for manual review. */
internalRouter.post(
  '/n8n-error',
  asyncH(async (req, res) => {
    const b = z
      .object({
        executionId: z.union([z.string(), z.number()]).transform(String).nullish(),
        workflowName: z.string().nullish(),
        lastNodeExecuted: z.string().nullish(),
        error: z.string().nullish(),
        url: z.string().nullish(),
      })
      .parse(req.body ?? {});
    logger.error({ ...b }, 'n8n workflow execution failed');
    const log = b.executionId ? await IntakeLog.findOne({ executionId: b.executionId, path: 'n8n' }) : null;
    let leadId: string | null = null;
    if (log) {
      log.status = 'failed';
      log.error = `${b.lastNodeExecuted ?? ''}: ${b.error ?? ''}`.slice(0, 500);
      await log.save();
      const lead =
        (log.leadId && (await Lead.findById(log.leadId))) ||
        (await findLeadForInbound({ leadId: null, sessionId: null, channel: log.channel as any, contact: { phone: log.contact?.phone, email: log.contact?.email } }));
      if (lead) {
        lead.needsManualReview = true;
        if (!['contacted', 'qualified', 'closed_won', 'closed_lost'].includes(lead.status)) {
          lead.statusHistory.push({ from: lead.status, to: 'needs_broker', by: 'n8n-error', at: new Date() });
          lead.status = 'needs_broker';
        }
        lead.brokerNotes.push({ author: 'system', text: `n8n failed at "${b.lastNodeExecuted ?? '?'}": ${b.error ?? 'unknown error'} — please review manually.` });
        await lead.save();
        leadId = String(lead._id);
        emitAdmin({ type: 'lead.updated', leadId, urgency: lead.urgency, channel: lead.channel });
      }
    }
    res.json({ ok: true, leadId });
  }),
);
