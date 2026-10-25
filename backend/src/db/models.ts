import mongoose, { Schema, type InferSchemaType, type Types } from 'mongoose';

export const CHANNELS = ['web_chat', 'web_form', 'google_form', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];

export const LEAD_STATUSES = [
  'new',
  'auto_responded',
  'needs_broker',
  'contacted',
  'qualified',
  'closed_won',
  'closed_lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses a broker set by hand; the pipeline never overwrites these. */
export const BROKER_OWNED_STATUSES: LeadStatus[] = ['contacted', 'qualified', 'closed_won', 'closed_lost'];

const brokerNoteSchema = new Schema(
  { author: String, text: { type: String, required: true }, createdAt: { type: Date, default: Date.now } },
  { _id: true },
);

const statusChangeSchema = new Schema(
  { from: String, to: String, by: String, at: { type: Date, default: Date.now } },
  { _id: false },
);

const leadSchema = new Schema(
  {
    channel: { type: String, enum: CHANNELS, required: true },
    channels: [{ type: String, enum: CHANNELS }],
    sessionId: { type: String, index: true, sparse: true },
    contact: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      email: { type: String, default: null },
    },
    intent: { type: String, enum: ['buyer', 'renter', 'investor', 'unclear'], default: 'unclear' },
    intentConfidence: { type: Number, default: 0 },
    urgency: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
    urgencyReason: { type: String, default: '' },
    llmUrgency: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    score: { type: Number, default: 0 },
    location: { preferred: [String], flexible: { type: Boolean, default: true } },
    budget: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      currency: { type: String, default: 'INR' },
      period: { type: String, enum: ['total', 'monthly', null], default: null },
      raw: { type: String, default: '' },
    },
    timeline: { raw: { type: String, default: '' }, daysEstimate: { type: Number, default: null } },
    propertyRequirements: {
      type: { type: String, default: null },
      bedrooms: { type: Number, default: null },
      bathrooms: { type: Number, default: null },
      areaSqft: { type: Number, default: null },
      furnishing: { type: String, default: null },
      amenities: [String],
      other: [String],
    },
    propertyOfInterest: { type: String, default: null },
    missingFields: [String],
    summaryForBroker: { type: String, default: '' },
    nextQuestion: { type: String, default: null },
    autoResponse: { type: String, default: '' },
    matchedProperties: [{ type: String }],
    classificationRaw: { type: Schema.Types.Mixed },
    llmProvider: { type: String, default: null },
    processedBy: { type: String, enum: ['n8n', 'backend-fallback', null], default: null },
    needsManualReview: { type: Boolean, default: false },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    statusHistory: [statusChangeSchema],
    assignedBroker: { type: Schema.Types.ObjectId, ref: 'Broker', default: null },
    brokerNotes: [brokerNoteSchema],
    brokerNotifiedAt: { type: Date, default: null },
    brokerAlerts: [
      {
        _id: false,
        channel: String, // 'admin-panel' | 'email' | 'whatsapp'
        ok: Boolean,
        detail: String,
        at: { type: Date, default: Date.now },
      },
    ],
    sheetRow: { type: Number, default: null },
    lastResponseMs: { type: Number, default: null },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
leadSchema.index({ 'contact.phone': 1 });
leadSchema.index({ 'contact.email': 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ urgency: 1 });
leadSchema.index({ createdAt: -1 });

const messageSchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    channel: { type: String, enum: CHANNELS, required: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    author: { type: String, enum: ['customer', 'ai', 'broker'], required: true },
    text: { type: String, required: true },
    providerMessageId: { type: String, default: null },
    traceId: { type: String, default: null },
    responseTimeMs: { type: Number, default: null },
    deliveryStatus: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
messageSchema.index({ traceId: 1, direction: 1 });

const propertySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    listingType: { type: String, enum: ['sale', 'rent'], required: true },
    investment: { type: Boolean, default: false },
    type: { type: String, enum: ['apartment', 'villa', 'plot', 'commercial', 'other'], required: true },
    price: { type: Number, required: true },
    priceLabel: String,
    city: { type: String, required: true },
    locality: String,
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    areaSqft: Number,
    furnishing: String,
    amenities: [String],
    expectedYield: { type: Number, default: null },
    description: String,
    images: [String],
    imageAlt: { type: String, default: '' },
    listedAt: { type: Date, default: Date.now },
    // --- live data provenance (Apify) ---
    /** 'apify-magicbricks' for live listings; 'demo' for the old sample data (never shown). */
    source: { type: String, default: 'demo', index: true },
    /** The source portal's listing id — the de-duplication key together with `source`. */
    externalId: { type: String, default: null },
    /** Original listing page on the source portal. */
    sourceUrl: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
    inactiveAt: { type: Date, default: null },
    firstSeenAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    /** Scrape target this listing came from, e.g. "rent:Pune" — used for inactive detection. */
    target: { type: String, default: null, index: true },
    projectName: { type: String, default: null },
    listedBy: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    possession: { type: String, default: null },
  },
  { timestamps: true },
);
propertySchema.index({ city: 1, listingType: 1 });
propertySchema.index({ source: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } });

const brokerSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    areas: [String],
    specialties: [{ type: String, enum: ['buyer', 'renter', 'investor'] }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const adminSchema = new Schema(
  { email: { type: String, required: true, unique: true }, passwordHash: { type: String, required: true } },
  { timestamps: true },
);

/** One Apify actor run per scrape target (e.g. rent in Pune). */
const apifyRunSchema = new Schema(
  {
    runId: { type: String, required: true, unique: true },
    datasetId: String,
    target: { type: String, required: true, index: true },
    input: Schema.Types.Mixed,
    status: { type: String, default: 'RUNNING', index: true }, // Apify status, then PROCESSED / PROCESS_FAILED
    reason: { type: String, default: 'scheduled' }, // scheduled | bootstrap | on-demand
    items: { type: Number, default: 0 },
    upserted: { type: Number, default: 0 },
    deactivated: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    error: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** Singleton with the sync bookkeeping (last successful sync etc.). */
const apifyStateSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    lastTickAt: Date,
    lastSuccessfulSyncAt: Date,
    lastRunStartedAt: Date,
    lastError: String,
    lastErrorAt: Date,
    rotationIndex: { type: Number, default: 0 },
    monthlyUsageUsd: Number,
    monthlyLimitUsd: Number,
    targetsLastSuccess: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

/** Customer accounts managed by Clerk. Separate from `admins`; old fields remain for data migration. */
const userSchema = new Schema(
  {
    clerkId: { type: String, default: null, unique: true, sparse: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null, index: true, sparse: true },
    avatar: { type: String, default: null },
    phone: { type: String, default: null },
    providers: [{ type: String, enum: ['password', 'google', 'clerk'] }],
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** One row per n8n execution / fallback run, so the error workflow can find the lead it was handling. */
const intakeLogSchema = new Schema(
  {
    traceId: { type: String, index: true },
    executionId: { type: String, index: true },
    channel: String,
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    contact: { name: String, phone: String, email: String },
    path: { type: String, enum: ['n8n', 'backend-fallback'] },
    status: { type: String, enum: ['started', 'done', 'failed'], default: 'started' },
    error: String,
  },
  { timestamps: true },
);

export type LeadDoc = InferSchemaType<typeof leadSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type MessageDoc = InferSchemaType<typeof messageSchema> & { _id: Types.ObjectId; createdAt: Date };
export type PropertyDoc = InferSchemaType<typeof propertySchema> & { _id: Types.ObjectId };
export type BrokerDoc = InferSchemaType<typeof brokerSchema> & { _id: Types.ObjectId };

export const Lead = mongoose.model('Lead', leadSchema);
export const Message = mongoose.model('Message', messageSchema);
export const Property = mongoose.model('Property', propertySchema);
export const Broker = mongoose.model('Broker', brokerSchema);
export const Admin = mongoose.model('Admin', adminSchema);
export const IntakeLog = mongoose.model('IntakeLog', intakeLogSchema);
export const User = mongoose.model('User', userSchema);
export const ApifyRun = mongoose.model('ApifyRun', apifyRunSchema);
export const ApifyState = mongoose.model('ApifyState', apifyStateSchema);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId; createdAt: Date };
