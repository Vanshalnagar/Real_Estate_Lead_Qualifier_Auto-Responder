import { config } from '../config.js';
import { logger } from '../logger.js';
import { normalizeClassification, parseJsonLoose, type Classification } from './rules.js';
import { classificationSchema } from './schema.js';

export type ProviderName = 'groq' | 'gemini';

export interface ChatRequest {
  system: string;
  user: string;
  json: boolean;
  temperature?: number;
  maxTokens?: number;
  /** 'reply' uses the provider's reply model when it has one (Groq: GROQ_REPLY_MODEL). */
  purpose?: 'classify' | 'reply';
}

export interface Provider {
  name: ProviderName;
  model: string;
  available: () => boolean;
  complete: (req: ChatRequest) => Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    public provider: ProviderName,
    message: string,
    public status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const groqProvider: Provider = {
  name: 'groq',
  model: config.GROQ_MODEL,
  available: () => Boolean(config.GROQ_API_KEY),
  async complete(req) {
    const model = req.purpose === 'reply' ? config.GROQ_REPLY_MODEL : config.GROQ_MODEL;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            // gpt-oss models reason before answering; "low" keeps each call well inside the free-tier TPM.
            ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: config.GROQ_REASONING_EFFORT } : {}),
            temperature: req.temperature ?? 0.2,
            max_tokens: req.maxTokens ?? 1500,
            ...(req.json ? { response_format: { type: 'json_object' } } : {}),
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
          }),
        },
        config.LLM_TIMEOUT_MS,
      );
    } catch (e) {
      throw new ProviderError('groq', (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message);
    }
    if (!res.ok) throw new ProviderError('groq', `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
    const data = (await res.json()) as any;
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError('groq', 'empty response');
    return String(text);
  },
};

export const geminiProvider: Provider = {
  name: 'gemini',
  model: config.GEMINI_MODEL,
  available: () => Boolean(config.GEMINI_API_KEY),
  async complete(req) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': config.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.user }] }],
            generationConfig: {
              temperature: req.temperature ?? 0.2,
              maxOutputTokens: req.maxTokens ?? 2048,
              ...(req.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        },
        config.LLM_TIMEOUT_MS,
      );
    } catch (e) {
      throw new ProviderError('gemini', (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message);
    }
    if (!res.ok) throw new ProviderError('gemini', `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
    const data = (await res.json()) as any;
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text ?? '')
      .join('');
    if (!text) throw new ProviderError('gemini', `empty response (${data?.candidates?.[0]?.finishReason ?? 'no candidates'})`);
    return text;
  },
};

let providers: Provider[] = [groqProvider, geminiProvider];
/** Test hook: replace the provider chain (e.g. mock Groq failing). */
export function setProvidersForTest(p: Provider[]): void {
  providers = p;
}
export function getProviders(): Provider[] {
  return providers;
}

export interface ClassifyResult {
  classification: Classification;
  raw: unknown;
  provider: ProviderName | null;
  model: string | null;
  attempts: { provider: ProviderName; ok: boolean; error?: string }[];
}

/**
 * Classification: each provider gets one call plus one retry on invalid JSON / schema failure.
 * HTTP errors, timeouts and rate limits skip straight to the next provider.
 */
export async function classifyWithFallback(system: string, user: string): Promise<ClassifyResult | null> {
  const attempts: ClassifyResult['attempts'] = [];
  for (const p of providers) {
    if (!p.available()) {
      attempts.push({ provider: p.name, ok: false, error: 'not configured' });
      continue;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const retryNote =
          attempt === 0 ? '' : '\n\nYour previous answer was not valid JSON matching the schema. Return ONLY the JSON object.';
        const text = await p.complete({ system, user: user + retryNote, json: true, temperature: attempt ? 0 : 0.1 });
        const parsed = parseJsonLoose(text);
        const norm = normalizeClassification(parsed);
        const strict = norm.value ? classificationSchema.safeParse(norm.value) : null;
        if (norm.ok && strict?.success) {
          attempts.push({ provider: p.name, ok: true });
          return { classification: norm.value!, raw: parsed, provider: p.name, model: p.model, attempts };
        }
        const why = strict && !strict.success ? strict.error.issues.map((i) => i.path.join('.')).join(',') : norm.errors.join(',');
        attempts.push({ provider: p.name, ok: false, error: `invalid JSON: ${why}` });
        logger.warn({ provider: p.name, attempt, why }, 'classification output invalid');
      } catch (e) {
        attempts.push({ provider: p.name, ok: false, error: (e as Error).message });
        logger.warn({ provider: p.name, err: (e as Error).message }, 'classification provider failed, falling back');
        break; // provider error → next provider
      }
    }
  }
  logger.error({ attempts }, 'all classification providers failed');
  return null;
}

export async function completeTextWithFallback(
  system: string,
  user: string,
): Promise<{ text: string; provider: ProviderName; model: string } | null> {
  for (const p of providers) {
    if (!p.available()) continue;
    try {
      const text = await p.complete({ system, user, json: false, temperature: 0.5, maxTokens: 900, purpose: 'reply' });
      if (text.trim()) return { text: text.trim(), provider: p.name, model: p.name === 'groq' ? config.GROQ_REPLY_MODEL : p.model };
    } catch (e) {
      logger.warn({ provider: p.name, err: (e as Error).message }, 'reply provider failed, falling back');
    }
  }
  return null;
}
