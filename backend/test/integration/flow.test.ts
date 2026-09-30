/**
 * End-to-end lead flow against the RUNNING stack (backend :4000, n8n :5678, MongoDB, real LLMs).
 *   docker compose up -d && npm run dev   (or the backend alone)   then:   npm run test:integration
 * Calls are paced to stay inside the Groq free-tier tokens-per-minute limit.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const N8N = process.env.N8N_URL ?? 'http://localhost:5678';
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2]]),
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = Number(process.env.PACE_MS ?? 9000);
const uniq = Date.now().toString().slice(-7);

let cookie = '';
async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}
async function lead(id: string) {
  return (await call(`/admin/leads/${id}`)).data;
}

beforeAll(async () => {
  const h = await call('/health');
  if (h.status !== 200) throw new Error('backend not running on :4000');
  const r = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  });
  expect(r.status).toBe(200);
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  expect(cookie).toMatch(/^nestr_admin=/);
});

describe('security', () => {
  it('admin API requires the httpOnly session cookie', async () => {
    const r = await fetch(`${API}/admin/leads`);
    expect(r.status).toBe(401);
  });
  it('login cookie is httpOnly + SameSite=Strict', async () => {
    const r = await fetch(`${API}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
    const c = r.headers.get('set-cookie') ?? '';
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
  });
  it('internal API rejects calls without X-Internal-Secret', async () => {
    expect((await call('/internal/ping')).status).toBe(401);
    expect((await call('/internal/ping', { headers: { 'X-Internal-Secret': 'nope' } })).status).toBe(401);
    expect((await call('/internal/ping', { headers: { 'X-Internal-Secret': env.INTERNAL_API_SECRET } })).status).toBe(200);
  });
  it('n8n webhook rejects calls without the header secret', async () => {
    const r = await fetch(`${N8N}/webhook/lead-intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect([401, 403]).toContain(r.status);
  });
  it('WhatsApp webhook: verify handshake and signature check', async () => {
    const ok = await call(`/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(env.WHATSAPP_VERIFY_TOKEN)}&hub.challenge=12345`);
    expect(ok.status).toBe(200);
    expect(String(ok.data)).toBe('12345');
    expect((await call('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status).toBe(403);
    const bad = await call('/webhooks/whatsapp', { method: 'POST', json: { object: 'whatsapp_business_account', entry: [] }, headers: { 'X-Hub-Signature-256': 'sha256=deadbeef' } });
    expect(bad.status).toBe(401);
  });
  it('validation errors return 400 with field issues', async () => {
    const r = await call('/leads/form', { method: 'POST', json: { name: 'A', email: 'nope', phone: '1', intent: 'Sell', location: '' } });
    expect(r.status).toBe(400);
    expect(r.data.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'intent', 'location']));
  });
  it('honeypot submissions are silently dropped', async () => {
    const before = (await call('/admin/leads?search=Honeypot')).data.total;
    const r = await call('/leads/form', { method: 'POST', json: { name: 'Honeypot Bot', email: 'bot@spam.test', phone: '9999999999', intent: 'Buy', location: 'Pune', website: 'http://spam' } });
    expect(r.status).toBe(200);
    expect((await call('/admin/leads?search=Honeypot')).data.total).toBe(before);
  });
});

describe('website chatbot → n8n → lead in admin', () => {
  let sessionId = '';
  let leadId = '';
  it('multi-turn conversation collects the requirement and qualifies the lead', async () => {
    const t1 = await call('/chat/message', { method: 'POST', json: { text: 'Hi, I want to rent a flat' } });
    expect(t1.status).toBe(200);
    expect(t1.data.reply.length).toBeGreaterThan(10);
    expect(t1.data.intent).toBe('renter');
    expect(t1.data.done).toBe(false);
    expect(t1.data.missingFields).toEqual(expect.arrayContaining(['location', 'budget']));
    sessionId = t1.data.sessionId;
    leadId = t1.data.leadId;
    await sleep(PACE);

    const t2 = await call('/chat/message', { method: 'POST', json: { sessionId, text: '2BHK in Powai, Mumbai, around 65k per month. I am relocating for work in 2 weeks.' } });
    expect(t2.data.leadId).toBe(leadId);
    expect(t2.data.urgency).toBe('high');
    expect(t2.data.summary.location.join(' ')).toMatch(/Powai/i);
    await sleep(PACE);

    const t3 = await call('/chat/message', { method: 'POST', json: { sessionId, text: `I'm Karan Shah, call me on 98200${uniq.slice(-5)}` } });
    expect(t3.data.done).toBe(true);
    expect(t3.data.summary.name).toMatch(/Karan/);
    expect(t3.data.summary.phone).toMatch(/^\+91/);
    expect(t3.data.matches.map((m: any) => m.slug)).toContain('harbour-view-2bhk-rent-powai');
    console.log(`chat processedBy=${t3.data.processedBy} urgency=${t3.data.urgency} score=${t3.data.score}`);
  });

  it('session history is restorable by session id only', async () => {
    const h = await call(`/chat/session/${sessionId}`);
    expect(h.data.messages.length).toBe(6);
    expect(h.data.messages.map((m: any) => m.author)).toEqual(['customer', 'ai', 'customer', 'ai', 'customer', 'ai']);
  });

  it('the lead appears in the admin with intent, urgency, brief, reply and the full conversation', async () => {
    const d = await lead(leadId);
    expect(d.lead.channel).toBe('web_chat');
    expect(d.lead.intent).toBe('renter');
    expect(d.lead.urgency).toBe('high');
    expect(d.lead.status).toBe('needs_broker');
    expect(d.lead.summaryForBroker.length).toBeGreaterThan(20);
    expect(d.lead.autoResponse.length).toBeGreaterThan(20);
    expect(d.lead.brokerNotifiedAt).toBeTruthy();
    expect(d.brief).toMatch(/Suggested next step/);
    expect(d.messages).toHaveLength(6);
    expect(['n8n', 'backend-fallback']).toContain(d.lead.processedBy);
    const q = await call('/admin/followup');
    const idx = q.data.items.findIndex((i: any) => i._id === leadId);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(q.data.items.slice(0, idx).every((i: any) => i.urgency === 'high')).toBe(true); // high urgency first
    await sleep(PACE);
  });
});

describe('website CTA form', () => {
  it('creates a classified lead and returns the AI reply', async () => {
    const r = await call('/leads/form', {
      method: 'POST',
      json: { name: 'Meera Iyer', email: `meera.${uniq}@example.com`, phone: `98450${uniq.slice(-5)}`, intent: 'Buy', location: 'Whitefield, Bengaluru', budget: '3.5 Cr', timeline: 'in 6 months', message: 'Independent villa with a garden for my family' },
    });
    expect(r.status).toBe(200);
    expect(r.data.intent).toBe('buyer');
    expect(r.data.reply.length).toBeGreaterThan(20);
    expect(r.data.matches.map((m: any) => m.slug)).toContain('palm-grove-villa-whitefield');
    const d = await lead(r.data.leadId);
    expect(d.lead.channel).toBe('web_form');
    expect(d.lead.contact.email).toBe(`meera.${uniq}@example.com`);
    await sleep(PACE);
  });
});

describe('Google Form (Apps Script payload straight into n8n)', () => {
  it('n8n classifies and stores the lead with channel google_form', async () => {
    const email = `gform.${uniq}@example.com`;
    const res = await fetch(`${N8N}/webhook/lead-intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_API_SECRET },
      body: JSON.stringify({
        source: 'google_form',
        namedValues: { 'Full Name': ['Sana Khan'], Email: [email], 'Phone Number': [`90000${uniq.slice(-5)}`], 'I want to': ['Invest'], 'Preferred Location': ['Gurugram'], Budget: ['4-5 Cr'], Timeline: ['3 months'], Message: ['Pre-leased commercial office for rental yield'] },
      }),
    });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.processedBy).toBe('n8n');
    expect(out.intent).toBe('investor');
    const list = await call(`/admin/leads?search=${encodeURIComponent(email)}`);
    expect(list.data.items[0].channel).toBe('google_form');
    await sleep(PACE);
  });
});

describe('WhatsApp (simulator → signed Meta payload → webhook → n8n)', () => {
  const phone = `9198765${uniq.slice(-5)}`;
  it('creates a lead and replies on WhatsApp (simulated delivery)', async () => {
    const r = await call('/admin/simulator/whatsapp', { method: 'POST', json: { from: phone, name: 'Imran', text: 'hi need 1bhk on rent in hinjewadi pune, 18k budget, joining next month' } });
    expect(r.data.ok).toBe(true);
    let thread: any = null;
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      thread = (await call(`/admin/simulator/thread?phone=${phone}`)).data;
      if (thread.messages.some((m: any) => m.author === 'ai' && m.deliveryStatus && m.deliveryStatus !== 'pending')) break;
    }
    const ai = thread.messages.find((m: any) => m.author === 'ai');
    expect(ai).toBeTruthy();
    expect(ai.text.length).toBeLessThanOrEqual(700);
    expect(ai.text).not.toMatch(/\*\*/);
    expect(['simulated', 'sent']).toContain(ai.deliveryStatus);
    expect(thread.lead.intent).toBe('renter');
    expect(thread.lead.urgency).toBe('high');
    await sleep(PACE);
  });

  it('a second WhatsApp message continues the same lead (multi-turn by phone)', async () => {
    await call('/admin/simulator/whatsapp', { method: 'POST', json: { from: phone, name: 'Imran', text: 'semi furnished preferred. my name is Imran Qureshi' } });
    let thread: any = null;
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      thread = (await call(`/admin/simulator/thread?phone=${phone}`)).data;
      if (thread.messages.filter((m: any) => m.author === 'ai').length >= 2) break;
    }
    expect(thread.messages.filter((m: any) => m.author === 'customer')).toHaveLength(2);
    expect(thread.messages.filter((m: any) => m.author === 'ai')).toHaveLength(2);
    const d = await lead(thread.lead._id);
    expect(d.lead.contact.name).toMatch(/Imran/);
    expect(d.lead.channel).toBe('whatsapp');
  });

  it('broker actions: status change, note, and a broker reply logged on the original channel', async () => {
    const thread = (await call(`/admin/simulator/thread?phone=${phone}`)).data;
    const id = thread.lead._id;
    const brokers = (await call('/admin/brokers')).data.items;
    const p = await call(`/admin/leads/${id}`, { method: 'PATCH', json: { status: 'qualified', assignedBroker: brokers[0]._id } });
    expect(p.data.lead.status).toBe('qualified');
    const n = await call(`/admin/leads/${id}/notes`, { method: 'POST', json: { text: 'Called, site visit booked for Saturday 11am.' } });
    expect(n.data.notes.at(-1).text).toMatch(/site visit/);
    const rep = await call(`/admin/leads/${id}/reply`, { method: 'POST', json: { text: 'Hi Imran, this is your NESTR broker — confirming the visit on Saturday.' } });
    expect(rep.data.via).toBe('whatsapp');
    expect(['simulated', 'sent']).toContain(rep.data.deliveryStatus);
    const d = await lead(id);
    expect(d.messages.at(-1).author).toBe('broker');
    expect(d.lead.statusHistory.map((h: any) => h.to)).toContain('qualified');
  });
});

describe('resilience: n8n down → backend fallback', () => {
  const docker = (cmd: string) => execSync(`docker ${cmd} nestr-n8n`, { stdio: 'ignore' });
  afterAll(async () => {
    docker('start');
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${N8N}/webhook/lead-intake`, { method: 'POST', body: '{}' });
        if (r.status !== 404) break;
      } catch {
        /* starting */
      }
      await sleep(1500);
    }
  });
  it('the chatbot still answers and the lead is marked processedBy backend-fallback', async () => {
    await sleep(PACE);
    docker('stop');
    const r = await call('/chat/message', { method: 'POST', json: { text: 'Looking to buy a 3BHK apartment in Kharadi, Pune under 1.3 crore within 6 months' } });
    expect(r.status).toBe(200);
    expect(r.data.processedBy).toBe('backend-fallback');
    expect(r.data.intent).toBe('buyer');
    expect(r.data.reply.length).toBeGreaterThan(20);
    const d = await lead(r.data.leadId);
    expect(d.lead.processedBy).toBe('backend-fallback');
  });
});
