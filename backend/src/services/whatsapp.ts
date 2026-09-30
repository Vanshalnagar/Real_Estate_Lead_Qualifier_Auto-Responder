import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Meta signs webhook bodies with HMAC-SHA256(app secret) in `X-Hub-Signature-256: sha256=<hex>`. */
export function signWhatsAppBody(rawBody: Buffer | string, secret = config.WHATSAPP_APP_SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyWhatsAppSignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!config.WHATSAPP_APP_SECRET) return config.WHATSAPP_PROVIDER === 'simulator';
  if (!header) return false;
  const expected = Buffer.from(signWhatsAppBody(rawBody));
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function whatsappLiveConfigured(): boolean {
  return config.WHATSAPP_PROVIDER === 'meta' && Boolean(config.WHATSAPP_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Send a plain-text WhatsApp message. In simulator mode nothing leaves the machine: the message is
 * stored in MongoDB and shown in the admin "WhatsApp Simulator" thread.
 */
export async function sendWhatsAppText(to: string, text: string): Promise<{ ok: boolean; simulated: boolean; id?: string; error?: string }> {
  if (!whatsappLiveConfigured()) return { ok: true, simulated: true };
  try {
    const res = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body: text, preview_url: true } }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      logger.warn({ status: res.status, error: data?.error?.message }, 'WhatsApp send failed');
      return { ok: false, simulated: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, simulated: false, id: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, simulated: false, error: (e as Error).message };
  }
}

/** A payload in Meta's real webhook format, used by the admin simulator and tests. */
export function buildMetaInboundPayload(input: { from: string; name: string; text: string; id?: string }) {
  const id = input.id ?? `wamid.SIM${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'SIMULATED_WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: config.WHATSAPP_PHONE_NUMBER_ID || 'SIMULATED_PHONE_ID' },
              contacts: [{ profile: { name: input.name }, wa_id: input.from.replace(/^\+/, '') }],
              messages: [
                {
                  from: input.from.replace(/^\+/, ''),
                  id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: input.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
