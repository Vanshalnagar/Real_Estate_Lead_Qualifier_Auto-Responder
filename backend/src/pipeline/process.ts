import { config } from '../config.js';
import { Message } from '../db/models.js';
import { logger } from '../logger.js';
import { CLASSIFY_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from '../prompts/index.js';
import { notifyBrokerByEmail, sendCustomerEmail, upsertSheetRow } from '../services/appsScript.js';
import { getIntakeContext, recordBrokerAlert, recordSheetRow, upsertLeadResult, type UpsertResult } from '../services/leadStore.js';
import { matchProperties } from '../services/matching.js';
import { postToN8n } from '../services/n8n.js';
import { sendWhatsAppText } from '../services/whatsapp.js';
import { classifyWithFallback, completeTextWithFallback } from './llm.js';
import {
  applyUrgencyRules,
  buildClassifyUserMessage,
  buildClientResponse,
  buildReplyUserMessage,
  computeScore,
  decideStatus,
  manualReviewClassification,
  mergeWithPrevious,
  sanitizeReply,
  templateReply,
  type ClientResponse,
  type NormalizedInbound,
} from './rules.js';

/**
 * Entry point for every channel. The n8n "Lead Intake & Qualification" workflow is the primary path;
 * if it is unreachable, times out or errors, the identical pipeline runs in-process and the lead is
 * marked processedBy "backend-fallback". `forwardBody` is what n8n receives (raw provider payload for
 * WhatsApp / Google Form, the normalized object for website channels).
 */
export async function processInbound(inb: NormalizedInbound, forwardBody?: Record<string, unknown>): Promise<ClientResponse> {
  const started = Date.now();
  const n8n = await postToN8n({ ...(forwardBody ?? inb), traceId: inb.traceId, receivedAtMs: started });
  if (n8n.ok) {
    logger.info({ traceId: inb.traceId, channel: inb.channel, ms: n8n.ms, path: 'n8n' }, 'pipeline completed via n8n');
    return n8n.data as ClientResponse;
  }
  logger.warn({ traceId: inb.traceId, channel: inb.channel, reason: n8n.error }, 'n8n path failed — running backend fallback pipeline');
  return runPipelineInProcess(inb, started);
}

export async function runPipelineInProcess(inb: NormalizedInbound, started = Date.now()): Promise<ClientResponse> {
  const ctx = await getIntakeContext(inb, { path: 'backend-fallback' });

  // 1. classify (Groq → Gemini, one retry each on invalid JSON)
  const user = buildClassifyUserMessage({
    channel: inb.channel,
    today: ctx.today,
    history: ctx.history,
    latest: inb.text,
    knownContact: ctx.knownContact,
    propertyContext: ctx.propertyContext,
  });
  const result = await classifyWithFallback(CLASSIFY_SYSTEM_PROMPT, user);
  const manualReview = !result;
  const base = result?.classification ?? manualReviewClassification(inb.text);

  // 2. merge + deterministic rules
  const cls = mergeWithPrevious(base, ctx.previous, ctx.knownContact);
  if (!cls.property_of_interest && ctx.propertyOfInterest) cls.property_of_interest = ctx.propertyOfInterest;
  const customerTexts = [...ctx.history.filter((h) => h.author === 'customer').map((h) => h.text), inb.text];
  const u = applyUrgencyRules(cls, { customerTexts, repeatContactWithin24h: ctx.repeatContactWithin24h });
  const score = computeScore(cls, u.urgency);
  const status = decideStatus(ctx.currentStatus, u.urgency, cls.missing_fields, manualReview);

  // 3. matches + personalised reply
  const matches = await matchProperties(cls);
  const replyInput = { channel: inb.channel, history: ctx.history, latest: inb.text, classification: cls, urgency: u.urgency, matches };
  const replyRes = await completeTextWithFallback(REPLY_SYSTEM_PROMPT, buildReplyUserMessage(replyInput));
  const reply = replyRes ? sanitizeReply(replyRes.text, inb.channel) : templateReply(replyInput);
  const responseTimeMs = Date.now() - started;

  // 4. persist
  const up = await upsertLeadResult({
    traceId: inb.traceId,
    processedBy: 'backend-fallback',
    inbound: inb,
    leadId: ctx.leadId,
    classification: cls,
    classificationRaw: result?.raw ?? { error: 'all providers failed', attempts: result?.attempts },
    llmProvider: result ? `${result.provider}:${result.model}` : null,
    urgency: u.urgency,
    urgencyReason: u.reason,
    llmUrgency: result ? u.llmUrgency : null,
    score,
    status,
    reply,
    replyProvider: replyRes ? `${replyRes.provider}:${replyRes.model}` : 'template',
    matches: matches.map((m) => m.slug),
    manualReview,
    responseTimeMs,
  });

  // 5. side effects (Sheets, channel delivery, broker alert) — not on the chat's critical path
  void afterUpsert(inb, up, reply).catch((e) => logger.error({ err: (e as Error).message, leadId: up.leadId }, 'fallback side effects failed'));

  logger.info({ traceId: inb.traceId, leadId: up.leadId, ms: responseTimeMs, path: 'backend-fallback' }, 'pipeline completed in-process');
  return buildClientResponse(cls, u.urgency, score, reply, matches, up.leadId, 'backend-fallback');
}

async function afterUpsert(inb: NormalizedInbound, up: UpsertResult, reply: string): Promise<void> {
  if (up.duplicate) return;
  const sheet = await upsertSheetRow(up.leadId, up.sheet.row);
  await recordSheetRow(up.leadId, sheet.row ?? null, sheet.ok, sheet.error, sheet.skipped);

  if (inb.channel === 'whatsapp' && up.customerPhone) {
    const sent = await sendWhatsAppText(up.customerPhone, reply);
    await Message.updateOne(
      { leadId: up.leadId, traceId: inb.traceId, direction: 'outbound' },
      { $set: { deliveryStatus: sent.simulated ? 'simulated' : sent.ok ? 'sent' : 'failed', providerMessageId: sent.id ?? null } },
    );
  } else if ((inb.channel === 'web_form' || inb.channel === 'google_form') && up.customerEmail) {
    await sendCustomerEmail({ leadId: up.leadId, to: up.customerEmail, subject: 'We received your property enquiry — NESTR.', body: reply });
  }

  if (up.notifyBroker) {
    const r = up.broker
      ? await notifyBrokerByEmail({
          leadId: up.leadId,
          broker: up.broker,
          brief: up.brief,
          urgency: 'high',
          adminUrl: `${config.PUBLIC_SITE_URL}/admin/leads/${up.leadId}`,
        })
      : { ok: false, error: 'no broker assigned' };
    await recordBrokerAlert(up.leadId, r);
  }
}
