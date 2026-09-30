import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Client for the Google Apps Script web app (apps-script/Code.gs → doPost).
 * Apps Script cannot read request headers, so the shared token travels as the `token` query param.
 */
export function sheetsConfigured(): boolean {
  return Boolean(config.SHEETS_WEBAPP_URL && config.SHEETS_WEBHOOK_TOKEN);
}

async function call(action: string, payload: Record<string, unknown>): Promise<any> {
  if (!sheetsConfigured()) return { ok: false, skipped: true, error: 'SHEETS_WEBAPP_URL not configured' };
  const url = `${config.SHEETS_WEBAPP_URL}?token=${encodeURIComponent(config.SHEETS_WEBHOOK_TOKEN)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    // Apps Script answers with a 302 to googleusercontent.com; fetch follows it.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `non-JSON response (HTTP ${res.status})` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

export async function upsertSheetRow(leadId: string, row: (string | number)[]): Promise<{ ok: boolean; row?: number; error?: string; skipped?: boolean }> {
  const r = await call('upsertLead', { leadId, row });
  if (!r.ok && !r.skipped) logger.warn({ leadId, error: r.error }, 'Sheets upsert failed');
  return r;
}

export async function notifyBrokerByEmail(input: {
  leadId: string;
  broker: { name: string; email: string };
  brief: string;
  urgency: string;
  adminUrl: string;
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return call('notifyBroker', input);
}

export async function sendCustomerEmail(input: { leadId: string; to: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return call('emailCustomer', input);
}

export async function pingAppsScript(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return call('ping', {});
}
