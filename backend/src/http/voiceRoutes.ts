import { Retell } from 'retell-sdk';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { config } from '../config.js';
import { Lead } from '../db/models.js';
import { VoiceCall } from '../db/voice.js';
import { acceptVoiceEvent, applyFollowup, applyVoiceEvent, startVoiceCall } from '../services/voice.js';
import { retellRequest } from '../services/retell.js';
import { asyncH, formLimiter } from './middleware.js';

export const voiceAdminRouter = Router();
const id = z.string().refine(v => Types.ObjectId.isValid(v), 'Invalid ID');
voiceAdminRouter.post('/calls', formLimiter, asyncH(async (req, res) => {
  res.status(201).json({ ok: true, call: await startVoiceCall(id.parse(req.body.leadId)) });
}));
voiceAdminRouter.get('/calls', asyncH(async (req, res) => {
  const q = z.object({ leadId: id.optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  const items = await VoiceCall.find(q.leadId ? { leadId: q.leadId } : {}).select('-transcript -extractedData').sort({ createdAt: -1 }).skip((q.page - 1) * 25).limit(25).lean();
  res.json({ ok: true, items });
}));
voiceAdminRouter.get('/calls/:id', asyncH(async (req, res) => {
  const call = await VoiceCall.findById(id.parse(req.params.id)).lean();
  if (!call) return res.status(404).json({ ok: false, error: 'Call not found' });
  res.json({ ok: true, call });
}));
voiceAdminRouter.post('/calls/:id/cancel', asyncH(async (req, res) => {
  const call = await VoiceCall.findById(id.parse(req.params.id));
  if (!call) return res.status(404).json({ ok: false, error: 'Call not found' });
  if (!call.retellCallId || call.status !== 'ongoing') return res.status(409).json({ ok: false, error: 'Only ongoing calls can be stopped' });
  await retellRequest(`/v2/stop-call/${encodeURIComponent(call.retellCallId)}`, 'POST');
  res.json({ ok: true });
}));
voiceAdminRouter.post('/calls/:id/sync', asyncH(async (req, res) => {
  const call = await VoiceCall.findById(id.parse(req.params.id));
  if (!call?.retellCallId) return res.status(409).json({ ok: false, error: 'No provider call ID available; inspect Retell history' });
  const remote = await retellRequest(`/v2/get-call/${encodeURIComponent(call.retellCallId)}`);
  await applyVoiceEvent(remote.call_analysis ? 'call_analyzed' : remote.call_status === 'ongoing' ? 'call_started' : 'call_ended', remote);
  res.json({ ok: true });
}));
voiceAdminRouter.patch('/leads/:id/consent', asyncH(async (req, res) => {
  const body = z.object({ callConsent: z.boolean(), doNotCall: z.boolean(), source: z.string().trim().min(3).max(200) }).parse(req.body);
  const lead = await Lead.findByIdAndUpdate(id.parse(req.params.id), { $set: { callConsent: body.callConsent && !body.doNotCall, doNotCall: body.doNotCall, callConsentAt: new Date(), callConsentSource: `${(req as any).admin.email}: ${body.source}` } });
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
  res.json({ ok: true });
}));
export const voiceInternalRouter = Router();
voiceInternalRouter.post('/calls', asyncH(async (req, res) => {
  res.status(201).json({ ok: true, call: await startVoiceCall(id.parse(req.body.leadId)) });
}));
voiceInternalRouter.get('/calls/:id', asyncH(async (req, res) => {
  const call = await VoiceCall.findById(id.parse(req.params.id)).select('-transcript -recordingUrl').lean();
  if (!call) return res.sendStatus(404);
  res.json({ ok: true, call });
}));
voiceInternalRouter.post('/calls/:id/followup', asyncH(async (req, res) => {
  await applyFollowup(id.parse(req.params.id)); res.json({ ok: true });
}));
export const retellWebhook = asyncH(async (req: Request, res) => {
  const key = config.RETELL_WEBHOOK_SECRET || config.RETELL_API_KEY;
  const signature = req.header('x-retell-signature');
  if (!key || !signature || !Buffer.isBuffer(req.body) || !await Retell.verify(req.body.toString('utf8'), key, signature)) return res.sendStatus(401);
  const { event, call } = JSON.parse(req.body.toString('utf8'));
  await acceptVoiceEvent(event, call);
  res.sendStatus(204);
});
