import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? '').toLowerCase() === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default('nestr_leads'),

  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Reply drafting uses a separate Groq model so it draws on its own tokens-per-minute bucket.
  GROQ_REPLY_MODEL: z.string().default('openai/gpt-oss-20b'),
  GROQ_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  LLM_TIMEOUT_MS: z.coerce.number().default(20000),

  N8N_WEBHOOK_URL: z.string().default('http://localhost:5678/webhook/lead-intake'),
  N8N_HEALTH_URL: z.string().default('http://localhost:5678/healthz'),
  N8N_TIMEOUT_MS: z.coerce.number().default(45000),
  N8N_ENABLED: bool.default('true'),
  INTERNAL_API_SECRET: z.string().min(24),

  SHEETS_WEBAPP_URL: z.string().default(''),
  SHEETS_WEBHOOK_TOKEN: z.string().default(''),
  // Optional: the Google Sheet's own URL, used to deep-link lead rows from the admin panel
  SHEETS_SPREADSHEET_URL: z.string().default(''),

  WHATSAPP_PROVIDER: z.enum(['meta', 'simulator']).default('simulator'),
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default(''),
  WHATSAPP_GRAPH_VERSION: z.string().default('v21.0'),

  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),

  // Live property data: Apify (MagicBricks scraper). Server-side only.
  APIFY_API_TOKEN: z.string().default(''),
  APIFY_ENABLED: bool.default('true'),
  APIFY_ACTOR: z.string().default('thirdwatch~magicbricks-scraper'),
  /** How often the backend talks to Apify (collect finished runs, sync MongoDB, maybe start a scrape). */
  APIFY_SYNC_INTERVAL_MIN: z.coerce.number().min(1).default(10),
  /** Listings requested per scrape run (the actor charges per listing). */
  APIFY_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(12),
  /** Spending cap for this app within the Apify billing cycle; scrapes are paced to stay under it. */
  APIFY_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(4.5),
  /** Estimated price per listing, used for budget pacing. */
  APIFY_PRICE_PER_RESULT_USD: z.coerce.number().min(0).default(0.003),
  APIFY_CITIES: z.string().default('Mumbai,Pune,Bangalore,Hyderabad,Gurgaon,Chennai'),

  // Customer accounts: Google sign-in (OAuth 2.0 authorization-code flow). Optional —
  // email/password accounts work without it. The redirect URI must be registered in Google Cloud.
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Only variable names are printed, never values.
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid backend environment configuration: ${missing}. See backend/.env.example`);
}

export const config = parsed.data;
export type Config = typeof config;
