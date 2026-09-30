#!/usr/bin/env node
/**
 * Generates n8n/workflows/*.json from the backend's single sources of truth:
 *   - backend/src/prompts/*.md          (LLM prompts, embedded verbatim)
 *   - backend/src/pipeline/rules.ts     (normalisation, urgency, score, prompt builders; bundled with esbuild)
 * so the n8n path and the backend fallback path stay identical.
 *
 * The JSON references credentials by id + name only. Secrets are added to n8n by import.sh
 * (from local .env files) and never appear in these files.
 *
 * Run: node n8n/build-workflows.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIFY_PROMPT = readFileSync(resolve(root, 'backend/src/prompts/classify.system.md'), 'utf8').trim();
const REPLY_PROMPT = readFileSync(resolve(root, 'backend/src/prompts/reply.system.md'), 'utf8').trim();

// Bundled as ESM, then the trailing `export {…}` clause is rewritten into a plain `return {…}`, so
// `R` is an ordinary object of functions. (esbuild's IIFE/CJS export helpers rely on
// Object.defineProperty getters, which n8n's Code-node sandbox does not allow.)
const esm = buildSync({
  entryPoints: [resolve(root, 'backend/src/pipeline/rules.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  minifyWhitespace: true,
  legalComments: 'none',
}).outputFiles[0].text.trim();
const exportMatch = esm.match(/export\s*\{([^}]*)\};?\s*$/);
if (!exportMatch) throw new Error('could not find the export clause in the rules bundle');
const returned = exportMatch[1]
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [local, exported] = s.split(/\s+as\s+/);
    return `${exported ?? local}: ${local}`;
  })
  .join(', ');
const bundle = `// Shared rules bundled from backend/src/pipeline/rules.ts — do not edit here.\nconst R = (function () { ${esm.slice(0, exportMatch.index)}\nreturn { ${returned} }; })();`;

// ------------------------------------------------------------------------------------------------
// Credentials: referenced by fixed id + name. import.sh creates them with these ids.
// ------------------------------------------------------------------------------------------------
export const CREDS = {
  internal: { id: 'nestrCredIntrnl1', name: 'Backend Internal Secret', type: 'httpHeaderAuth' },
  groq: { id: 'nestrCredGroqAp1', name: 'Groq API', type: 'httpHeaderAuth' },
  gemini: { id: 'nestrCredGemini1', name: 'Gemini API', type: 'httpHeaderAuth' },
  sheets: { id: 'nestrCredSheets1', name: 'Sheets Webhook Token', type: 'httpQueryAuth' },
  whatsapp: { id: 'nestrCredWhatsA1', name: 'WhatsApp Cloud API', type: 'httpHeaderAuth' },
};
const cred = (c) => ({ [c.type]: { id: c.id, name: c.name } });

const MAIN_ID = 'nestrLeadIntake1';
const ERROR_ID = 'nestrErrorHndlr1';
const BACKEND = '{{ $env.BACKEND_INTERNAL_URL }}';

// ------------------------------------------------------------------------------------------------
// Node helpers
// ------------------------------------------------------------------------------------------------
let seq = 0;
const nodes = [];
const connections = {};
function add(node) {
  seq += 1;
  const full = { id: `node-${String(seq).padStart(3, '0')}`, position: [0, 0], ...node };
  nodes.push(full);
  return full.name;
}
/** connect(from, to, outputIndex) */
function link(from, to, output = 0) {
  connections[from] ??= { main: [] };
  while (connections[from].main.length <= output) connections[from].main.push([]);
  connections[from].main[output].push({ node: to, type: 'main', index: 0 });
}

const code = (name, js, extra = {}) =>
  add({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: `${bundle}\n\n${js.trim()}\n` }, ...extra });

function http(name, { url, body, credential, onError, timeout = 20000, extraOptions = {} }) {
  const params = {
    method: 'POST',
    url: `=${url}`,
    authentication: credential ? 'genericCredentialType' : 'none',
    ...(credential ? { genericAuthType: credential.type } : {}),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ ${body} }}`,
    options: { timeout, ...extraOptions },
  };
  return add({
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: params,
    ...(credential ? { credentials: cred(credential) } : {}),
    ...(onError ? { onError } : {}),
  });
}

function iff(name, expr) {
  return add({
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [
          {
            id: `cond-${seq + 1}`,
            leftValue: `={{ ${expr} }}`,
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      looseTypeValidation: true,
      options: {},
    },
  });
}

// ------------------------------------------------------------------------------------------------
// Lead Intake & Qualification
// ------------------------------------------------------------------------------------------------
const N = {
  webhook: 'Webhook: lead-intake',
  normalize: 'Normalize payload',
  ignored: 'Ignored event?',
  respondIgnored: 'Respond: ignored',
  history: 'Fetch history (backend)',
  buildClassify: 'Build classify request',
  groq: 'Groq classify',
  vGroq: 'Validate Groq JSON',
  okGroq: 'Groq JSON valid?',
  groqRetry: 'Groq classify (retry)',
  vGroqRetry: 'Validate Groq retry JSON',
  okGroqRetry: 'Groq retry valid?',
  gemini: 'Gemini classify',
  vGemini: 'Validate Gemini JSON',
  okGemini: 'Gemini JSON valid?',
  geminiRetry: 'Gemini classify (retry)',
  vGeminiRetry: 'Validate Gemini retry JSON',
  okGeminiRetry: 'Gemini retry valid?',
  manual: 'Manual review classification',
  rules: 'Apply rules (urgency + score)',
  match: 'Fetch matching properties',
  buildReply: 'Build reply request',
  groqReply: 'Groq reply draft',
  geminiReply: 'Gemini reply draft',
  finalize: 'Finalize reply',
  upsert: 'Upsert lead + messages (backend)',
  client: 'Client response',
  sheetsOn: 'Sheets configured?',
  sheets: 'Sheets append/update (Apps Script)',
  sheetRow: 'Record sheet row (backend)',
  isWa: 'WhatsApp channel?',
  waLive: 'Live WhatsApp provider?',
  waSend: 'Send WhatsApp reply',
  waRecord: 'Record WhatsApp delivery (backend)',
  waSim: 'Record simulated delivery (backend)',
  emailOn: 'Form lead with email?',
  emailCustomer: 'Email confirmation (Apps Script)',
  respond: 'Respond to webhook',
  notify: 'High urgency — notify broker?',
  emailBrokerOn: 'Broker email possible?',
  emailBroker: 'Email broker (Apps Script)',
  logEmail: 'Log broker notification (backend)',
  logInApp: 'Log in-app broker alert (backend)',
};

add({
  name: N.webhook,
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  webhookId: 'b7d6c1f0-3c2a-4a55-9d1e-6f7a8e9b0c11',
  parameters: { httpMethod: 'POST', path: 'lead-intake', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
  credentials: cred(CREDS.internal),
});

code(
  N.normalize,
  `
// Per-channel normalisation: website chat/form (backend), Google Form (Apps Script), WhatsApp (Meta payload).
const body = $input.first().json.body || {};
const inbound = R.normalizeInbound(body);
return [{ json: { inbound, startedAt: Number(body.receivedAtMs) || Date.now(), executionId: String($execution.id) } }];
`,
);
iff(N.ignored, '$json.inbound.ignored === true || !$json.inbound.text');
add({
  name: N.respondIgnored,
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, ignored: true, reason: $json.inbound.ignoreReason || "empty" }) }}', options: {} },
});

http(N.history, {
  url: `${BACKEND}/api/internal/context`,
  body: 'JSON.stringify({ inbound: $json.inbound, executionId: $json.executionId })',
  credential: CREDS.internal,
});

code(
  N.buildClassify,
  `
const CLASSIFY_PROMPT = ${JSON.stringify(CLASSIFY_PROMPT)};
const RETRY_NOTE = "\\n\\nYour previous answer was not valid JSON matching the schema. Return ONLY the JSON object.";
const n = $('${N.normalize}').first().json;
const ctx = $input.first().json;
const user = R.buildClassifyUserMessage({
  channel: n.inbound.channel,
  today: ctx.today,
  history: ctx.history || [],
  latest: n.inbound.text,
  knownContact: ctx.knownContact || {},
  propertyContext: ctx.propertyContext || null,
});
const groq = (u, t) => ({ temperature: t, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: CLASSIFY_PROMPT }, { role: 'user', content: u }] });
const gemini = (u, t) => ({ systemInstruction: { parts: [{ text: CLASSIFY_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: u }] }], generationConfig: { temperature: t, maxOutputTokens: 4096, responseMimeType: 'application/json' } });
return [{ json: {
  groqBody: groq(user, 0.1), groqRetryBody: groq(user + RETRY_NOTE, 0),
  geminiBody: gemini(user, 0.1), geminiRetryBody: gemini(user + RETRY_NOTE, 0),
} }];
`,
);

const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/{{ $env.GEMINI_MODEL }}:generateContent';
// Model + reasoning effort come from $env (non-secret). gpt-oss models get reasoning_effort to stay inside the TPM limit.
const withGroqModel = (expr, modelVar = 'GROQ_MODEL') =>
  `JSON.stringify(Object.assign({ model: $env.${modelVar} }, String($env.${modelVar}).startsWith('openai/gpt-oss') ? { reasoning_effort: $env.GROQ_REASONING_EFFORT || 'low' } : {}, ${expr}))`;

http(N.groq, { url: groqUrl, body: withGroqModel('$json.groqBody'), credential: CREDS.groq, onError: 'continueErrorOutput' });
http(N.groqRetry, { url: groqUrl, body: withGroqModel(`$('${N.buildClassify}').first().json.groqRetryBody`), credential: CREDS.groq, onError: 'continueErrorOutput' });
http(N.gemini, { url: geminiUrl, body: `JSON.stringify($('${N.buildClassify}').first().json.geminiBody)`, credential: CREDS.gemini, onError: 'continueErrorOutput', timeout: 30000 });
http(N.geminiRetry, { url: geminiUrl, body: `JSON.stringify($('${N.buildClassify}').first().json.geminiRetryBody)`, credential: CREDS.gemini, onError: 'continueErrorOutput', timeout: 30000 });

const validator = (provider) => `
// Strict JSON validation (same normaliser + checks as the backend; zod runs again on upsert).
const PROVIDER = '${provider}';
const j = $input.first().json;
const text = PROVIDER === 'groq'
  ? (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
const parsed = R.parseJsonLoose(text);
const norm = R.normalizeClassification(parsed);
return [{ json: { ok: Boolean(norm.ok && norm.value), classification: norm.value, raw: parsed, provider: PROVIDER, model: j.model || j.modelVersion || null, errors: norm.errors } }];
`;
code(N.vGroq, validator('groq'));
code(N.vGroqRetry, validator('groq'));
code(N.vGemini, validator('gemini'));
code(N.vGeminiRetry, validator('gemini'));
iff(N.okGroq, '$json.ok === true');
iff(N.okGroqRetry, '$json.ok === true');
iff(N.okGemini, '$json.ok === true');
iff(N.okGeminiRetry, '$json.ok === true');

code(
  N.manual,
  `
// Both providers failed: keep the lead and flag it for a human.
const n = $('${N.normalize}').first().json;
return [{ json: { ok: false, manualReview: true, classification: R.manualReviewClassification(n.inbound.text), raw: { error: 'all providers failed' }, provider: null, model: null } }];
`,
);

code(
  N.rules,
  `
const v = $input.first().json;
const n = $('${N.normalize}').first().json;
const ctx = $('${N.history}').first().json;
const c = R.mergeWithPrevious(v.classification, ctx.previous || null, ctx.knownContact || {});
if (!c.property_of_interest && ctx.propertyOfInterest) c.property_of_interest = ctx.propertyOfInterest;
const customerTexts = (ctx.history || []).filter((h) => h.author === 'customer').map((h) => h.text).concat([n.inbound.text]);
const u = R.applyUrgencyRules(c, { customerTexts, repeatContactWithin24h: Boolean(ctx.repeatContactWithin24h) });
const score = R.computeScore(c, u.urgency);
const manualReview = Boolean(v.manualReview);
const status = R.decideStatus(ctx.currentStatus, u.urgency, c.missing_fields, manualReview);
return [{ json: { classification: c, urgency: u.urgency, urgencyReason: u.reason, llmUrgency: manualReview ? null : u.llmUrgency, score, status, manualReview, provider: v.provider, model: v.model, raw: v.raw === undefined ? null : v.raw } }];
`,
);

http(N.match, { url: `${BACKEND}/api/internal/properties/match`, body: 'JSON.stringify({ classification: $json.classification })', credential: CREDS.internal });

code(
  N.buildReply,
  `
const REPLY_PROMPT = ${JSON.stringify(REPLY_PROMPT)};
const n = $('${N.normalize}').first().json;
const ctx = $('${N.history}').first().json;
const a = $('${N.rules}').first().json;
const matches = $input.first().json.matches || [];
const user = R.buildReplyUserMessage({ channel: n.inbound.channel, history: ctx.history || [], latest: n.inbound.text, classification: a.classification, urgency: a.urgency, matches });
return [{ json: {
  matches,
  groqBody: { temperature: 0.5, max_tokens: 900, messages: [{ role: 'system', content: REPLY_PROMPT }, { role: 'user', content: user }] },
  geminiBody: { systemInstruction: { parts: [{ text: REPLY_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } },
} }];
`,
);
http(N.groqReply, { url: groqUrl, body: withGroqModel('$json.groqBody', 'GROQ_REPLY_MODEL'), credential: CREDS.groq, onError: 'continueErrorOutput' });
http(N.geminiReply, { url: geminiUrl, body: `JSON.stringify($('${N.buildReply}').first().json.geminiBody)`, credential: CREDS.gemini, onError: 'continueErrorOutput', timeout: 30000 });

code(
  N.finalize,
  `
const j = $input.first().json;
const n = $('${N.normalize}').first().json;
const ctx = $('${N.history}').first().json;
const a = $('${N.rules}').first().json;
const b = $('${N.buildReply}').first().json;
let text = '';
let provider = 'template';
if (j.choices) { text = (j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; provider = 'groq:' + (j.model || ''); }
else if (j.candidates) { text = ((j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).filter((p) => !p.thought).map((p) => p.text || '').join(''); provider = 'gemini:' + (j.modelVersion || ''); }
const input = { channel: n.inbound.channel, history: ctx.history || [], latest: n.inbound.text, classification: a.classification, urgency: a.urgency, matches: b.matches };
let reply;
if (text.trim()) reply = R.sanitizeReply(text, n.inbound.channel);
else { reply = R.templateReply(input); provider = 'template'; }
const upsert = {
  traceId: n.inbound.traceId, executionId: n.executionId, processedBy: 'n8n', inbound: n.inbound, leadId: ctx.leadId || null,
  classification: a.classification, classificationRaw: a.raw, llmProvider: a.provider ? a.provider + ':' + (a.model || '') : null,
  urgency: a.urgency, urgencyReason: a.urgencyReason, llmUrgency: a.llmUrgency, score: a.score, status: a.status,
  reply, replyProvider: provider, matches: b.matches.map((m) => m.slug), manualReview: a.manualReview, responseTimeMs: Date.now() - n.startedAt,
};
return [{ json: { upsert } }];
`,
);
http(N.upsert, { url: `${BACKEND}/api/internal/leads/upsert`, body: 'JSON.stringify($json.upsert)', credential: CREDS.internal });

code(
  N.client,
  `
const up = $input.first().json;
const f = $('${N.finalize}').first().json.upsert;
const a = $('${N.rules}').first().json;
const b = $('${N.buildReply}').first().json;
const response = R.buildClientResponse(a.classification, a.urgency, a.score, f.reply, b.matches, up.leadId, 'n8n');
return [{ json: { response, up, channel: f.inbound.channel, traceId: f.traceId, reply: f.reply, phone: up.customerPhone } }];
`,
);

const C = `$('${N.client}').first().json`;
iff(N.sheetsOn, 'Boolean($env.SHEETS_WEBAPP_URL)');
http(N.sheets, {
  url: '{{ $env.SHEETS_WEBAPP_URL }}',
  body: 'JSON.stringify({ action: "upsertLead", leadId: $json.up.leadId, row: $json.up.sheet.row })',
  credential: CREDS.sheets,
  onError: 'continueRegularOutput',
});
http(N.sheetRow, {
  url: `${BACKEND}/api/internal/leads/{{ ${C}.up.leadId }}/sheet-row`,
  body: 'JSON.stringify({ ok: $json.ok === true, row: $json.row || null, error: $json.error ? String($json.error.message || $json.error) : null })',
  credential: CREDS.internal,
  onError: 'continueRegularOutput',
});

iff(N.isWa, `${C}.channel === 'whatsapp'`);
iff(N.waLive, "$env.WHATSAPP_PROVIDER === 'meta'");
add({
  name: N.waSend,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  onError: 'continueRegularOutput',
  credentials: cred(CREDS.whatsapp),
  parameters: {
    method: 'POST',
    url: '=https://graph.facebook.com/{{ $env.WHATSAPP_GRAPH_VERSION }}/{{ $env.WHATSAPP_PHONE_NUMBER_ID }}/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ messaging_product: "whatsapp", to: String(${C}.phone || "").replace(/^\\+/, ""), type: "text", text: { body: ${C}.reply, preview_url: true } }) }}`,
    options: { timeout: 20000 },
  },
});
http(N.waRecord, {
  url: `${BACKEND}/api/internal/leads/{{ ${C}.up.leadId }}/delivery`,
  body: `JSON.stringify({ traceId: ${C}.traceId, status: $json.messages ? "sent" : "failed", providerMessageId: $json.messages ? $json.messages[0].id : null })`,
  credential: CREDS.internal,
  onError: 'continueRegularOutput',
});
http(N.waSim, {
  url: `${BACKEND}/api/internal/leads/{{ ${C}.up.leadId }}/delivery`,
  body: `JSON.stringify({ traceId: ${C}.traceId, status: "simulated" })`,
  credential: CREDS.internal,
  onError: 'continueRegularOutput',
});
iff(N.emailOn, `['web_form', 'google_form'].includes(${C}.channel) && Boolean(${C}.up.customerEmail) && Boolean($env.SHEETS_WEBAPP_URL)`);
http(N.emailCustomer, {
  url: '{{ $env.SHEETS_WEBAPP_URL }}',
  body: `JSON.stringify({ action: "emailCustomer", leadId: ${C}.up.leadId, to: ${C}.up.customerEmail, subject: "We received your property enquiry — NESTR.", body: ${C}.reply })`,
  credential: CREDS.sheets,
  onError: 'continueRegularOutput',
});

add({
  name: N.respond,
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  parameters: { respondWith: 'json', responseBody: `={{ JSON.stringify(${C}.response) }}`, options: {} },
});

iff(N.notify, `${C}.up.notifyBroker === true`);
iff(N.emailBrokerOn, `Boolean($env.SHEETS_WEBAPP_URL) && Boolean(${C}.up.broker)`);
http(N.emailBroker, {
  url: '{{ $env.SHEETS_WEBAPP_URL }}',
  body: `JSON.stringify({ action: "notifyBroker", leadId: ${C}.up.leadId, broker: ${C}.up.broker, brief: ${C}.up.brief, urgency: "high", adminUrl: $env.PUBLIC_SITE_URL + "/admin/leads/" + ${C}.up.leadId })`,
  credential: CREDS.sheets,
  onError: 'continueRegularOutput',
});
http(N.logEmail, {
  url: `${BACKEND}/api/internal/leads/{{ ${C}.up.leadId }}/notified`,
  body: 'JSON.stringify({ ok: $json.ok === true, channel: "email", error: $json.error ? String($json.error.message || $json.error) : null })',
  credential: CREDS.internal,
  onError: 'continueRegularOutput',
});
http(N.logInApp, {
  url: `${BACKEND}/api/internal/leads/{{ ${C}.up.leadId }}/notified`,
  body: 'JSON.stringify({ ok: false, channel: "email", skipped: true, error: "Apps Script web app not configured" })',
  credential: CREDS.internal,
  onError: 'continueRegularOutput',
});

// --- wiring -------------------------------------------------------------------------------------
link(N.webhook, N.normalize);
link(N.normalize, N.ignored);
link(N.ignored, N.respondIgnored, 0);
link(N.ignored, N.history, 1);
link(N.history, N.buildClassify);
link(N.buildClassify, N.groq);
link(N.groq, N.vGroq, 0);
link(N.groq, N.gemini, 1); // HTTP error / timeout / 429 → Gemini
link(N.vGroq, N.okGroq);
link(N.okGroq, N.rules, 0);
link(N.okGroq, N.groqRetry, 1); // invalid JSON → one retry
link(N.groqRetry, N.vGroqRetry, 0);
link(N.groqRetry, N.gemini, 1);
link(N.vGroqRetry, N.okGroqRetry);
link(N.okGroqRetry, N.rules, 0);
link(N.okGroqRetry, N.gemini, 1);
link(N.gemini, N.vGemini, 0);
link(N.gemini, N.manual, 1);
link(N.vGemini, N.okGemini);
link(N.okGemini, N.rules, 0);
link(N.okGemini, N.geminiRetry, 1);
link(N.geminiRetry, N.vGeminiRetry, 0);
link(N.geminiRetry, N.manual, 1);
link(N.vGeminiRetry, N.okGeminiRetry);
link(N.okGeminiRetry, N.rules, 0);
link(N.okGeminiRetry, N.manual, 1);
link(N.manual, N.rules);
link(N.rules, N.match);
link(N.match, N.buildReply);
link(N.buildReply, N.groqReply);
link(N.groqReply, N.finalize, 0);
link(N.groqReply, N.geminiReply, 1);
link(N.geminiReply, N.finalize, 0);
link(N.geminiReply, N.finalize, 1); // both failed → template reply
link(N.finalize, N.upsert);
link(N.upsert, N.client);
link(N.client, N.sheetsOn);
link(N.sheetsOn, N.sheets, 0);
link(N.sheetsOn, N.isWa, 1);
link(N.sheets, N.sheetRow);
link(N.sheetRow, N.isWa);
link(N.isWa, N.waLive, 0);
link(N.isWa, N.emailOn, 1);
link(N.waLive, N.waSend, 0);
link(N.waLive, N.waSim, 1);
link(N.waSend, N.waRecord);
link(N.waRecord, N.respond);
link(N.waSim, N.respond);
link(N.emailOn, N.emailCustomer, 0);
link(N.emailOn, N.respond, 1);
link(N.emailCustomer, N.respond);
link(N.respond, N.notify);
link(N.notify, N.emailBrokerOn, 0);
link(N.emailBrokerOn, N.emailBroker, 0);
link(N.emailBrokerOn, N.logInApp, 1);
link(N.emailBroker, N.logEmail);

// Simple left-to-right layout by BFS depth.
function layout(list, conns, start) {
  const depth = { [start]: 0 };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const out of conns[cur]?.main ?? []) {
      for (const e of out) {
        if (depth[e.node] === undefined || depth[e.node] < depth[cur] + 1) {
          if (depth[e.node] !== undefined && depth[e.node] >= depth[cur] + 1) continue;
          depth[e.node] = depth[cur] + 1;
          if (depth[e.node] < 60) queue.push(e.node);
        }
      }
    }
  }
  const rows = {};
  for (const n of list) {
    const d = depth[n.name] ?? 0;
    rows[d] = (rows[d] ?? 0) + 1;
    n.position = [d * 260, (rows[d] - 1) * 180];
  }
}
layout(nodes, connections, N.webhook);

const mainWorkflow = {
  id: MAIN_ID,
  name: 'Lead Intake & Qualification',
  active: false,
  nodes,
  connections,
  settings: {
    executionOrder: 'v1',
    errorWorkflow: ERROR_ID,
    timezone: 'Asia/Kolkata',
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    saveManualExecutions: true,
  },
  pinData: {},
  meta: { templateCredsSetupCompleted: true },
  tags: [],
};

// ------------------------------------------------------------------------------------------------
// Error workflow
// ------------------------------------------------------------------------------------------------
const errorWorkflow = {
  id: ERROR_ID,
  name: 'Lead Intake — Error Handler',
  active: false,
  nodes: [
    { id: 'err-001', name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    {
      id: 'err-002',
      name: 'Report failure to backend',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [300, 0],
      credentials: cred(CREDS.internal),
      parameters: {
        method: 'POST',
        url: `=${BACKEND}/api/internal/n8n-error`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ executionId: $json.execution && $json.execution.id, workflowName: $json.workflow && $json.workflow.name, lastNodeExecuted: $json.execution && $json.execution.lastNodeExecuted, error: $json.execution && $json.execution.error ? $json.execution.error.message : null, url: $json.execution && $json.execution.url }) }}',
        options: { timeout: 15000 },
      },
    },
  ],
  connections: { 'Error Trigger': { main: [[{ node: 'Report failure to backend', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata' },
  pinData: {},
  tags: [],
};

// n8n 2.x runs the published workflow-history snapshot for a versionId, so a content change must
// come with a new versionId or re-imports keep executing the old snapshot. Deterministic per content.
for (const wf of [mainWorkflow, errorWorkflow]) {
  wf.versionId = createHash('sha256').update(JSON.stringify({ nodes: wf.nodes, connections: wf.connections, settings: wf.settings })).digest('hex').slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

const outDir = resolve(root, 'n8n/workflows');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'lead-intake-qualification.json'), JSON.stringify(mainWorkflow, null, 2) + '\n');
writeFileSync(resolve(outDir, 'lead-intake-error-handler.json'), JSON.stringify(errorWorkflow, null, 2) + '\n');
writeFileSync(resolve(root, 'n8n/credentials.manifest.json'), JSON.stringify(Object.values(CREDS), null, 2) + '\n');
console.log(`n8n workflows written (${nodes.length} nodes in the main workflow)`);
