import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SHEET_HEADERS } from '../../src/pipeline/rules.js';

/** Runs apps-script/Code.gs in a VM with in-memory mocks of the Apps Script services. */
function load(props: Record<string, string> = {}) {
  const rows: unknown[][] = [];
  const mails: any[] = [];
  const fetches: any[] = [];
  const range = (r: number, c: number, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
    getValue: () => rows[r - 1]?.[c - 1] ?? '',
    setValues: (v: unknown[][]) => v.forEach((row, i) => (rows[r - 1 + i] = [...row])),
    setFontWeight: () => range(r, c, nr, nc),
    setBackground: () => range(r, c, nr, nc),
    setFontColor: () => range(r, c, nr, nc),
  });
  const sheet = {
    getName: () => 'Leads',
    getLastRow: () => rows.length,
    appendRow: (r: unknown[]) => rows.push([...r]),
    setFrozenRows: () => undefined,
    getRange: range,
  };
  const ctx: Record<string, unknown> = {
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    MailApp: { sendEmail: (m: unknown) => mails.push(m), getRemainingDailyQuota: () => 100 },
    UrlFetchApp: {
      fetch: (url: string, opts: any) => {
        fetches.push({ url, opts });
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(resolve(__dirname, '../../../apps-script/Code.gs'), 'utf8'), ctx);
  const post = (body: object, token?: string) =>
    (ctx.doPost as (e: unknown) => { body: any })({ parameter: token ? { token } : {}, postData: { contents: JSON.stringify(body) } }).body;
  return { ctx, rows, mails, fetches, post };
}

const TOKEN = 'sheet-token-1234567890';
const row = (id: string, urgency = 'medium') => ['2026-09-30T10:00:00Z', id, 'WhatsApp', 'Riya', '+91', '', 'renter', urgency, 70, 'Pune', '', '', '', 'sum', 'reply', 'needs_broker', 'Diya'];

describe('apps-script/Code.gs', () => {
  it('has the same column order as the backend', () => {
    const { ctx } = load();
    expect(vm.runInContext('HEADERS', ctx as vm.Context)).toEqual(SHEET_HEADERS);
  });

  it('rejects calls without the shared token', () => {
    const { post } = load({ SHEETS_WEBHOOK_TOKEN: TOKEN });
    expect(post({ action: 'ping' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(post({ action: 'ping' }, 'wrong-token-000000000')).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('appends a new lead row, then updates the same row by lead id', () => {
    const { post, rows } = load({ SHEETS_WEBHOOK_TOKEN: TOKEN });
    const a = post({ action: 'upsertLead', leadId: 'L1', row: row('L1') }, TOKEN);
    expect(a).toEqual({ ok: true, row: 2, updated: false });
    post({ action: 'upsertLead', leadId: 'L2', row: row('L2') }, TOKEN);
    const upd = row('L1');
    upd[15] = 'contacted';
    const b = post({ action: 'upsertLead', leadId: 'L1', row: upd }, TOKEN);
    expect(b).toEqual({ ok: true, row: 2, updated: true });
    expect(rows).toHaveLength(3); // header + 2 leads
    expect(rows[1][15]).toBe('contacted');
    expect(rows[0]).toEqual(SHEET_HEADERS);
  });

  it('emails the broker for a high-urgency lead (token in body also accepted)', () => {
    const { post, mails } = load({ SHEETS_WEBHOOK_TOKEN: TOKEN });
    const r = post({ action: 'notifyBroker', token: TOKEN, broker: { name: 'Diya', email: 'diya@x.test' }, brief: 'Urgent <b>relocation</b>', adminUrl: 'http://localhost:5173/admin/leads/1' });
    expect(r).toEqual({ ok: true });
    expect(mails[0].to).toBe('diya@x.test');
    expect(mails[0].htmlBody).toContain('&lt;b&gt;relocation'); // escaped
  });

  it('onFormSubmit posts the response to the n8n webhook with the internal secret', () => {
    const { ctx, fetches } = load({ N8N_WEBHOOK_URL: 'https://n8n.example/webhook/lead-intake', INTERNAL_API_SECRET: 'sek' });
    (ctx.onFormSubmit as (e: unknown) => void)({ namedValues: { 'Full Name': ['Neha'] }, range: { getRow: () => 5 } });
    expect(fetches).toHaveLength(1);
    expect(fetches[0].url).toBe('https://n8n.example/webhook/lead-intake');
    expect(fetches[0].opts.headers['X-Internal-Secret']).toBe('sek');
    const body = JSON.parse(fetches[0].opts.payload);
    expect(body.source).toBe('google_form');
    expect(body.namedValues['Full Name']).toEqual(['Neha']);
  });
});
