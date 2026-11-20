import mongoose, { Schema } from 'mongoose';

const voiceSchema = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  retellCallId: { type: String, unique: true, sparse: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  fromNumber: String, toNumber: String,
  status: { type: String, default: 'initiating' },
  idempotencyKey: { type: String, unique: true, sparse: true },
  startedAt: Date, endedAt: Date, durationSeconds: Number,
  transcript: String, recordingUrl: String, callSummary: String,
  extractedData: Schema.Types.Mixed,
  leadCategory: String, customerIntent: String, requirementsSummary: String,
  followUpAction: String, preferredLocation: String, propertyType: String,
  budget: String, bedrooms: Number, purchaseTimeline: String,
  callbackRequested: Boolean, callbackTime: String, optedOut: Boolean,
  analysisReceived: { type: Boolean, default: false },
  followupPending: { type: Boolean, default: false },
  followupDeliveredAt: Date, followupAppliedAt: Date, followupLeaseUntil: Date,
  failureCode: String,
}, { timestamps: true });
voiceSchema.index({ followupPending: 1, followupLeaseUntil: 1 });

const eventSchema = new Schema({
  key: { type: String, unique: true, required: true },
  event: { type: String, required: true },
  call: { type: Schema.Types.Mixed, required: true },
  processedAt: Date, leaseUntil: Date, attempts: { type: Number, default: 0 },
}, { timestamps: true });
eventSchema.index({ processedAt: 1, leaseUntil: 1 });
// Raw event payloads expire after seven days. Authoritative call records remain.
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 });
export const VoiceCall = mongoose.model('VoiceCall', voiceSchema);
export const VoiceEvent = mongoose.model('VoiceEvent', eventSchema);
export const VoiceNumberLock = mongoose.model('VoiceNumberLock', new Schema({
  _id: String, until: { type: Date, required: true },
}));
