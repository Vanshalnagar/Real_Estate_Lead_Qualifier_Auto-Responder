import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { processInbound } from '../pipeline/process.js';
import { normalizeInbound } from '../pipeline/rules.js';
import { verifyWhatsAppSignature } from '../services/whatsapp.js';
import { asyncH } from './middleware.js';

export const webhookRouter = Router();

type RawReq = Request & { rawBody?: Buffer };

/** Meta webhook verification handshake (GET hub.challenge). */
webhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = req.query['hub.challenge'];
  const expected = config.WHATSAPP_VERIFY_TOKEN;
  const match = expected && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (mode === 'subscribe' && match) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(String(challenge ?? ''));
  }
  logger.warn('WhatsApp webhook verification failed');
  res.sendStatus(403);
});

/**
 * Inbound WhatsApp messages. The signature is checked here (n8n cannot see the raw body bytes
 * reliably), then the untouched Meta payload is forwarded to the n8n lead-intake webhook; if n8n
 * is down the same pipeline runs in-process. Meta needs a fast 200, so processing is async.
 */
webhookRouter.post(
  '/whatsapp',
  asyncH(async (req: RawReq, res) => {
    if (!verifyWhatsAppSignature(req.rawBody ?? Buffer.from(''), req.header('x-hub-signature-256'))) {
      logger.warn({ ip: req.ip }, 'WhatsApp webhook signature invalid');
      return res.sendStatus(401);
    }
    const inb = normalizeInbound(req.body);
    res.sendStatus(200);
    if (inb.ignored || !inb.text) {
      logger.debug({ reason: inb.ignoreReason }, 'WhatsApp event ignored');
      return;
    }
    logger.info({ traceId: inb.traceId, providerMessageId: inb.providerMessageId }, 'WhatsApp message received');
    processInbound(inb, { ...req.body, traceId: inb.traceId }).catch((e) =>
      logger.error({ err: (e as Error).message, traceId: inb.traceId }, 'WhatsApp processing failed'),
    );
  }),
);

/**
 * Mirror of the Google Form intake. Apps Script normally posts straight to the n8n webhook; this
 * route exists so the form keeps working (via the backend fallback) when only the backend is public.
 */
webhookRouter.post(
  '/google-form',
  asyncH(async (req, res) => {
    const token = String(req.query.token ?? req.body?.token ?? '');
    if (!config.SHEETS_WEBHOOK_TOKEN || token !== config.SHEETS_WEBHOOK_TOKEN) return res.status(401).json({ ok: false });
    const inb = normalizeInbound({ ...req.body, source: 'google_form' });
    const out = await processInbound(inb, { ...req.body, source: 'google_form', traceId: inb.traceId });
    res.json({ ok: true, leadId: out.leadId });
  }),
);
