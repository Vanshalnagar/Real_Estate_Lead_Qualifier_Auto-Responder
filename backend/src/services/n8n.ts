import { config } from '../config.js';
import { logger } from '../logger.js';

export interface N8nResult {
  ok: boolean;
  data?: any;
  error?: string;
  ms: number;
}

/** POST the normalized inbound to the n8n "lead-intake" webhook and wait for its response node. */
export async function postToN8n(payload: Record<string, unknown>): Promise<N8nResult> {
  const started = Date.now();
  if (!config.N8N_ENABLED) return { ok: false, error: 'n8n disabled (N8N_ENABLED=false)', ms: 0 };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.N8N_TIMEOUT_MS);
  try {
    const res = await fetch(config.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.INTERNAL_API_SECRET },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!res.ok || !data || data.ok === false || !data.reply) {
      return { ok: false, error: `n8n HTTP ${res.status}: ${(data?.error ?? text).toString().slice(0, 200)}`, ms: Date.now() - started };
    }
    return { ok: true, data, ms: Date.now() - started };
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? `timeout after ${config.N8N_TIMEOUT_MS}ms` : (e as Error).message;
    return { ok: false, error: `n8n unreachable: ${msg}`, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

export async function n8nHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(config.N8N_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok };
  } catch (e) {
    logger.debug({ err: (e as Error).message }, 'n8n health check failed');
    return { ok: false, error: (e as Error).message };
  }
}
