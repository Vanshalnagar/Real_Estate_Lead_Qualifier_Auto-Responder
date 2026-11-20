import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Retell } from 'retell-sdk';
import { config } from '../../src/config.js';
import { Lead } from '../../src/db/models.js';
import { VoiceCall, VoiceEvent, VoiceNumberLock } from '../../src/db/voice.js';
import { callRequest, eligibility, isPhone, retellRequest } from '../../src/services/retell.js';
import { acceptVoiceEvent, applyVoiceEvent, startVoiceCall, voiceTick } from '../../src/services/voice.js';
import { voiceAdminRouter, retellWebhook } from '../../src/http/voiceRoutes.js';
import { errorHandler, requireAdmin } from '../../src/http/middleware.js';
import { createApp } from '../../src/app.js';

const leadId = '507f1f77bcf86cd799439011';
const base = () => ({ _id: leadId, contact: { name: 'Test Customer', phone: '+919876543210' }, channel: 'web_form', callConsent: true, callConsentAt: new Date(), callConsentSource: 'Explicit test consent', doNotCall: false });
const saved = { ...config };
beforeEach(() => { Object.assign(config, { RETELL_ENABLED: true, RETELL_API_KEY: 'test-retell-key', RETELL_AGENT_ID: 'agent_test', RETELL_PHONE_NUMBER: '+12025550123', RETELL_WEBHOOK_SECRET: '', RETELL_TEST_NUMBERS: '', VOICE_CALL_START_HOUR: 0, VOICE_CALL_END_HOUR: 24, VOICE_AUTO_CALL: false, ADMIN_BEARER_AUTH: true }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.assign(config, saved); });
describe('eligibility and request construction', () => {
  it.each(['123', '+0123456789', '919876543210', null])('rejects invalid phone %s', phone => expect(isPhone(phone)).toBe(false));
  it('requires consent evidence and honors DNC', () => {
    expect(eligibility({ ...base(), callConsent: false })).toMatch(/consent/);
    expect(eligibility({ ...base(), callConsentSource: '' })).toMatch(/consent/);
    expect(eligibility({ ...base(), doNotCall: true })).toMatch(/Do Not Call/);
  });
  it('limits tests, hours and recent attempts', () => {
    config.RETELL_TEST_NUMBERS = '+12025550123'; expect(eligibility(base())).toMatch(/allowlist/);
    config.RETELL_TEST_NUMBERS = ''; config.VOICE_CALL_START_HOUR = 9; config.VOICE_CALL_END_HOUR = 21;
    expect(eligibility(base(), new Date('2026-11-18T00:00:00Z'))).toMatch(/hours/);
    config.VOICE_CALL_START_HOUR = 0; config.VOICE_CALL_END_HOUR = 24;
    expect(eligibility({ ...base(), voiceLastAttemptAt: new Date() })).toMatch(/24 hours/);
  });
  it('passes known facts as strings and omits missing fields', () => {
    const request = callRequest(base(), 'attempt-1');
    expect(request.metadata.leadId).toBe(leadId); expect(request.idempotency_key).toBe('attempt-1');
    expect(request.retell_llm_dynamic_variables.customer_name).toBe('Test Customer');
    expect(request.retell_llm_dynamic_variables).not.toHaveProperty('budget');
    expect(request.retell_llm_dynamic_variables).not.toHaveProperty('property_name');
  });
  it('rejects missing and invalid leads without a provider call', async () => {
    await expect(startVoiceCall('invalid')).rejects.toMatchObject({ status: 400 });
    vi.spyOn(Lead, 'findById').mockReturnValue({ lean: async () => null } as any);
    await expect(startVoiceCall(leadId)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects an atomic duplicate phone lock', async () => {
    vi.spyOn(Lead, 'findById').mockReturnValue({ lean: async () => base() } as any);
    vi.spyOn(VoiceNumberLock, 'findOneAndUpdate').mockRejectedValue({ code: 11000 });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(startVoiceCall(leadId)).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not leak provider response bodies on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status: 401 })));
    await expect(retellRequest('/v2/create-phone-call', 'POST', {})).rejects.toThrow('HTTP 401');
  });
});

describe('durable webhooks', () => {
  it('uses stable event identity and tolerates a duplicate-key race', async () => {
    const update = vi.spyOn(VoiceEvent, 'updateOne').mockResolvedValue({} as any);
    await acceptVoiceEvent('call_ended', { call_id: 'call_1' });
    const key = (update.mock.calls[0][0] as any).key;
    update.mockRejectedValueOnce({ code: 11000 });
    await acceptVoiceEvent('call_ended', { call_id: 'call_1' });
    expect((update.mock.calls[1][0] as any).key).toBe(key);
  });
  it('does not treat call_ended as qualification or overwrite analyzed calls', async () => {
    vi.spyOn(VoiceCall, 'findOne').mockResolvedValue({ _id: leadId, leadId } as any);
    const update = vi.spyOn(VoiceCall, 'updateOne').mockResolvedValue({} as any);
    const lead = vi.spyOn(Lead, 'updateOne');
    await applyVoiceEvent('call_ended', { call_id: 'call_1', call_status: 'ended' });
    expect(update.mock.calls[1][0]).toMatchObject({ analysisReceived: false });
    expect(lead).not.toHaveBeenCalled();
  });
  it('does not regress a completed call on a late started event', async () => {
    vi.spyOn(VoiceCall, 'findOne').mockResolvedValue({ _id: leadId } as any);
    const update = vi.spyOn(VoiceCall, 'updateOne').mockResolvedValue({} as any);
    await applyVoiceEvent('call_started', { call_id: 'call_1' });
    expect(update.mock.calls[1][0]).toMatchObject({ analysisReceived: false, endedAt: { $exists: false } });
  });
  it('extracts analysis and applies opt-out before notification', async () => {
    vi.spyOn(VoiceCall, 'findOne').mockResolvedValue({ _id: leadId, leadId } as any);
    const update = vi.spyOn(VoiceCall, 'updateOne').mockResolvedValue({} as any);
    const lead = vi.spyOn(Lead, 'updateOne').mockResolvedValue({} as any);
    await applyVoiceEvent('call_analyzed', { call_id: 'call_1', duration_ms: 12000, call_analysis: { call_summary: 'Declined', custom_analysis_data: { optedOut: true, leadCategory: 'OPTED_OUT', unsafeField: 'ignored' } } });
    expect((update.mock.calls as any)[1][1]).toMatchObject({ $set: { durationSeconds: 12, analysisReceived: true, followupPending: true, extractedData: { optedOut: true, leadCategory: 'OPTED_OUT' } } });
    expect(lead).toHaveBeenCalledWith({ _id: leadId }, { $set: { doNotCall: true, callConsent: false } });
  });
  it('retains pending outbox on n8n failure', async () => {
    config.N8N_VOICE_FOLLOWUP_URL = 'https://automation.invalid/webhook/test';
    vi.spyOn(VoiceEvent, 'findOneAndUpdate').mockResolvedValue(null);
    vi.spyOn(VoiceCall, 'find').mockReturnValue({ limit: async () => [{ _id: leadId }] } as any);
    vi.spyOn(VoiceCall, 'findById').mockResolvedValue({ analysisReceived: true } as any);
    const update = vi.spyOn(VoiceCall, 'updateOne').mockResolvedValue({} as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await voiceTick();
    expect((update.mock.calls as any[]).some(c => c[1].$set?.followupPending === false)).toBe(false);
  });
});

describe('HTTP security', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>; let origin: string;
  beforeEach(async () => {
    const app = express();
    app.post('/webhook', express.raw({ type: 'application/json' }), retellWebhook);
    app.use(express.json(), cookieParser()); app.use('/admin', requireAdmin, voiceAdminRouter); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('rejects unsigned webhooks and unauthorized calls', async () => {
    expect((await fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect((await fetch(`${origin}/admin/calls`)).status).toBe(401);
  });
  it('verifies exact raw bytes and durably writes before 204', async () => {
    const body = '{ "event": "call_started", "call": {"call_id":"signed_call"} }';
    const signature = await Retell.sign(body, config.RETELL_API_KEY);
    const write = vi.spyOn(VoiceEvent, 'updateOne').mockResolvedValue({} as any);
    const response = await fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Retell-Signature': signature }, body });
    expect(response.status).toBe(204); expect(write).toHaveBeenCalledOnce();
    expect((await fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Retell-Signature': signature }, body: body.replace('signed_call', 'modified') })).status).toBe(401);
  });
  it('accepts an existing admin JWT bearer and rejects invalid IDs', async () => {
    const token = jwt.sign({ sub: leadId, email: 'admin@test.local' }, config.JWT_SECRET, { expiresIn: '1h' });
    const response = await fetch(`${origin}/admin/calls`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: 'invalid' }) });
    expect(response.status).toBe(400);
  });
});

describe('production origin and admin authentication', () => {
  it('accepts bearer authentication with CORS and blocks cookie CSRF', async () => {
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const token = jwt.sign({ sub: leadId, email: 'admin@test.local' }, config.JWT_SECRET, { expiresIn: '1h' });
    const allowed = config.CORS_ORIGIN.split(',')[0].trim();
    try {
      const me = await fetch(`${origin}/api/admin/auth/me`, { headers: { Origin: allowed, Authorization: `Bearer ${token}` } });
      expect(me.status).toBe(200); expect(me.headers.get('access-control-allow-origin')).toBe(allowed);
      const forged = await fetch(`${origin}/api/admin/voice/calls`, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', Cookie: `nestr_admin=${token}`, 'Content-Type': 'application/json' }, body: '{}' });
      expect(forged.status).toBe(403);
      const anonymous = await fetch(`${origin}/api/admin/auth/me`); expect(anonymous.status).toBe(401);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
