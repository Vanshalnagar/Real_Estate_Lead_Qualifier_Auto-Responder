import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { Lead } from '../db/models.js';
import { VoiceCall, VoiceEvent, VoiceNumberLock } from '../db/voice.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { emitAdmin } from './events.js';
import { callRequest, eligibility, retellRequest, VoiceError } from './retell.js';

export async function startVoiceCall(leadId: string) {
  if (!config.RETELL_ENABLED) throw new VoiceError(503, 'Voice calling is disabled');
  if (!Types.ObjectId.isValid(leadId)) throw new VoiceError(400, 'Invalid lead ID');
  const lead = await Lead.findById(leadId).lean();
  if (!lead) throw new VoiceError(404, 'Lead not found');
  const reason = eligibility(lead);
  if (reason) throw new VoiceError(409, reason);
  const now = new Date();
  // Hash phone numbers in locks and enforce frequency across different lead records.
  const phoneKey = createHash('sha256').update(lead.contact!.phone!).digest('hex');
  try {
    await VoiceNumberLock.findOneAndUpdate({ _id: phoneKey, until: { $lte: now } }, { $set: { until: new Date(+now + 86400000) } }, { upsert: true });
  } catch (e: any) { if (e.code === 11000) throw new VoiceError(409, 'A call to this phone was already attempted within 24 hours'); throw e; }
  const locked = await Lead.findOneAndUpdate({ _id: leadId, callConsent: true, doNotCall: { $ne: true },
    $and: [ { $or: [{ voiceLastAttemptAt: { $exists: false } }, { voiceLastAttemptAt: { $lte: new Date(+now - 86400000) } }] },
      { $or: [{ voiceLockUntil: { $exists: false } }, { voiceLockUntil: { $lte: now } }] } ],
  }, { $set: { voiceLastAttemptAt: now, voiceLockUntil: new Date(+now + 86400000) } }, { new: true });
  if (!locked) throw new VoiceError(409, 'Call already requested or consent changed');
  const attempt = await VoiceCall.create({ leadId, direction: 'outbound', fromNumber: config.RETELL_PHONE_NUMBER, toNumber: lead.contact!.phone, status: 'initiating' });
  attempt.idempotencyKey = String(attempt._id);
  await attempt.save();
  try {
    const remote = await retellRequest('/v2/create-phone-call', 'POST', callRequest(lead, String(attempt._id)));
    if (typeof remote.call_id !== 'string' || !remote.call_id.trim()) throw new VoiceError(502, 'Retell did not return a call ID; inspect provider history before retrying');
    // Webhook can arrive before this response. Do not regress its newer status.
    await VoiceCall.updateOne({ _id: attempt._id }, { $set: { retellCallId: remote.call_id } });
    await VoiceCall.updateOne({ _id: attempt._id, status: 'initiating' }, { $set: { status: remote.call_status || 'registered' } });
    return await VoiceCall.findById(attempt._id);
  } catch (err) {
    await VoiceCall.updateOne({ _id: attempt._id, status: 'initiating' }, { $set: { status: 'unknown', failureCode: 'provider-request-failed' } });
    throw err;
  }
}

export async function acceptVoiceEvent(event: string, call: any) {
  if (!['call_started', 'call_ended', 'call_analyzed'].includes(event)) return;
  if (!call || typeof call.call_id !== 'string' || !call.call_id) throw new VoiceError(400, 'Missing call_id');
  // Stable provider event identity; re-deliveries update neither processing state nor payload.
  const key = createHash('sha256').update(`${event}:${call.call_id}`).digest('hex');
  try { await VoiceEvent.updateOne({ key }, { $setOnInsert: { key, event, call } }, { upsert: true }); }
  catch (e: any) { if (e.code !== 11000) throw e; }
}

export async function applyVoiceEvent(event: string, call: any) {
  let record = await VoiceCall.findOne({ retellCallId: call.call_id });
  if (!record && Types.ObjectId.isValid(call.metadata?.attemptId ?? '')) record = await VoiceCall.findOne({ _id: call.metadata.attemptId, retellCallId: { $exists: false } });
  if (!record) {
    const lead = call.direction === 'inbound' ? await Lead.findOne({ 'contact.phone': call.from_number }).lean() : null;
    try { record = await VoiceCall.create({ retellCallId: call.call_id, direction: call.direction === 'inbound' ? 'inbound' : 'outbound', leadId: lead?._id }); }
    catch (e: any) { if (e.code !== 11000) throw e; record = await VoiceCall.findOne({ retellCallId: call.call_id }); }
  }
  if (!record) throw new Error('Cannot persist call');
  await VoiceCall.updateOne({ _id: record._id }, { $set: { retellCallId: call.call_id } });
  const fields: Record<string, unknown> = {};
  if (call.from_number) fields.fromNumber = call.from_number;
  if (call.to_number) fields.toNumber = call.to_number;
  if (call.start_timestamp) fields.startedAt = new Date(call.start_timestamp);
  if (call.end_timestamp) fields.endedAt = new Date(call.end_timestamp);
  if (typeof call.duration_ms === 'number') fields.durationSeconds = call.duration_ms / 1000;
  if (typeof call.transcript === 'string') fields.transcript = call.transcript;
  if (typeof call.recording_url === 'string' && call.recording_url.startsWith('https://')) fields.recordingUrl = call.recording_url;
  if (event === 'call_started') {
    await VoiceCall.updateOne({ _id: record._id, status: { $in: ['initiating', 'registered', 'unknown'] }, analysisReceived: false, endedAt: { $exists: false } }, { $set: { ...fields, status: 'ongoing' } });
  } else if (event === 'call_ended') {
    await VoiceCall.updateOne({ _id: record._id, analysisReceived: false }, { $set: { ...fields, status: call.call_status || 'ended' } });
  } else {
    const analysis = call.call_analysis || {};
    const data = analysis.custom_analysis_data || {};
    const clean: Record<string, unknown> = {};
    for (const k of ['leadCategory','customerIntent','requirementsSummary','followUpAction','preferredLocation','propertyType','budget','purchaseTimeline','callbackTime']) {
      if (typeof data[k] === 'string') clean[k] = data[k].slice(0, 4000);
    }
    for (const k of ['callbackRequested','optedOut']) if (typeof data[k] === 'boolean') clean[k] = data[k];
    if (typeof data.bedrooms === 'number') clean.bedrooms = data.bedrooms;
    await VoiceCall.updateOne({ _id: record._id }, { $set: { ...fields, ...clean, extractedData: clean, callSummary: typeof analysis.call_summary === 'string' ? analysis.call_summary : '', status: call.call_status || 'ended', analysisReceived: true, followupPending: true } });
    // Opt-out takes effect before acknowledging processing; repeat applications are safe.
    if (record.leadId && (clean.optedOut || clean.leadCategory === 'OPTED_OUT' || clean.leadCategory === 'NOT_INTERESTED')) {
      await Lead.updateOne({ _id: record.leadId }, { $set: { doNotCall: true, callConsent: false } });
    }
  }
  if (record.leadId) emitAdmin({ type: 'lead.updated', leadId: String(record.leadId), urgency: 'low', channel: 'voice' });
}

export async function applyFollowup(callId: string) {
  const call = await VoiceCall.findById(callId);
  if (!call || !call.analysisReceived) throw new VoiceError(409, 'Call analysis is not available');
  if (!call.leadId) return;
  // Persist deterministic values: retrying notification never appends duplicate tasks.
  const set: Record<string, unknown> = {};
  if (call.optedOut || ['NOT_INTERESTED','OPTED_OUT'].includes(call.leadCategory || '')) { set.doNotCall = true; set.callConsent = false; }
  if (call.leadCategory === 'HOT') { set.urgency = 'high'; set.needsManualReview = true; }
  if (call.leadCategory === 'WARM') set.needsManualReview = true;
  if (call.callbackRequested || call.leadCategory === 'CALLBACK') { set.callbackRequested = true; set.callbackTime = call.callbackTime || 'Time not specified'; }
  if (Object.keys(set).length) await Lead.updateOne({ _id: call.leadId }, { $set: set });
  if (['HOT', 'WARM'].includes(call.leadCategory || '')) {
    await Lead.updateOne({ _id: call.leadId, status: { $in: ['new', 'auto_responded'] } }, { $set: { status: 'needs_broker' } });
  }
  if (call.leadCategory === 'HOT') {
    await Lead.updateOne({ _id: call.leadId, 'brokerAlerts.detail': { $ne: `Voice call ${call._id}` } }, { $push: { brokerAlerts: { channel: 'admin-panel', ok: true, detail: `Voice call ${call._id}`, at: new Date() } } });
  }
  // Persist the alert before claiming the ephemeral SSE notification.
  const first = await VoiceCall.findOneAndUpdate({ _id: call._id, followupAppliedAt: { $exists: false } }, { $set: { followupAppliedAt: new Date() } });
  if (first && call.leadCategory === 'HOT') {
    const lead = await Lead.findById(call.leadId).lean();
    emitAdmin({ type: 'broker.alert', leadId: String(call.leadId), urgency: 'high', channel: 'voice', name: lead?.contact?.name || null, summary: call.callSummary || '' });
  }
}

let working = false;
export async function voiceTick() {
  if (working) return;
  working = true;
  try {
    for (let i = 0; i < 10; i++) {
      const evt = await VoiceEvent.findOneAndUpdate({ processedAt: { $exists: false }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { new: true });
      if (!evt) break;
      await applyVoiceEvent(evt.event, evt.call);
      await VoiceEvent.updateOne({ _id: evt._id }, { $set: { processedAt: new Date() } });
    }
    const calls = await VoiceCall.find({ followupPending: true, $or: [{ followupLeaseUntil: { $exists: false } }, { followupLeaseUntil: { $lt: new Date() } }] }).limit(10);
    for (const call of calls) {
      await VoiceCall.updateOne({ _id: call._id }, { $set: { followupLeaseUntil: new Date(Date.now() + 60000) } });
      await applyFollowup(String(call._id));
      if (config.N8N_VOICE_FOLLOWUP_URL) {
        const response = await fetch(config.N8N_VOICE_FOLLOWUP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.INTERNAL_API_SECRET }, body: JSON.stringify({ callId: String(call._id) }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`n8n followup HTTP ${response.status}`);
      }
      await VoiceCall.updateOne({ _id: call._id }, { $set: { followupPending: false, followupDeliveredAt: new Date() } });
    }
    if (config.RETELL_ENABLED && config.VOICE_AUTO_CALL) {
      const leads = await Lead.find({ callConsent: true, doNotCall: { $ne: true }, voiceLastAttemptAt: { $exists: false }, 'contact.phone': { $ne: null } }).limit(5).lean();
      for (const lead of leads) {
        if (eligibility(lead)) continue;
        if (config.N8N_VOICE_OUTBOUND_URL) {
          const response = await fetch(config.N8N_VOICE_OUTBOUND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.INTERNAL_API_SECRET }, body: JSON.stringify({ leadId: String(lead._id) }), signal: AbortSignal.timeout(25000) });
          if (!response.ok) throw new Error(`n8n outbound HTTP ${response.status}`);
        } else await startVoiceCall(String(lead._id));
      }
    }
  } catch { logger.error('Voice processing failed; persisted items will retry after lease expiry'); }
  finally { working = false; }
}
export function startVoiceWorker() { const timer = setInterval(() => void voiceTick(), 5000); timer.unref(); return () => clearInterval(timer); }
