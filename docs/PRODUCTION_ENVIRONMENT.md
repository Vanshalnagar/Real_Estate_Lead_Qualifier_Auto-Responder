# Production environment

Backend config is validated in backend/src/config.ts. Empty optional integrations stay
disabled until their credentials are configured. VITE_* values are public build-time
inputs; rebuild the static site after changing them. Never copy backend .env to frontend.

Render nestr-backend-secrets: MongoDB URI/name, admin email/password, JWT_SECRET,
INTERNAL_API_SECRET, Clerk secret key, optional LLM/Apify/Sheets/WhatsApp/Retell secrets.
Render nestr-n8n-secrets: preserve N8N_ENCRYPTION_KEY and share INTERNAL_API_SECRET,
provider credentials needed for the explicit import, plus PUBLIC_SITE_URL and the
non-secret LLM/Sheets/WhatsApp workflow settings in n8n/.env.example. These groups
are created manually before syncing the Blueprint. Secrets use Render encrypted env
values; the Blueprint never contains them.

Production backend: ADMIN_BEARER_AUTH=true, PUBLIC_SITE_URL=CORS_ORIGIN=actual static
origin. NESTR_N8N_HOSTPORT is supplied by Render; backend startup derives all n8n URLs.
Production n8n: NESTR_BACKEND_HOSTPORT supplied by Render; startup derives
BACKEND_INTERNAL_URL. The private-network connections use HTTP; public API/editor and
provider webhooks use HTTPS. DB_POSTGRESDB_* come from the private Render PostgreSQL
resource. Preserve the encryption key when moving between SQLite and PostgreSQL.

RETELL_ENABLED=false and VOICE_AUTO_CALL=false until manual verification. Set
RETELL_TEST_NUMBERS to a single verified E.164 number before enabling trial calls.
RETELL_WEBHOOK_SECRET means the Retell webhook-badged API key, not a random string.
Calling hours use Asia/Kolkata; 24-hour frequency and DNC apply even for manual calls.

Local development: root env configures Compose, backend env configures Express, frontend
env configures Vite; n8n/.env.example describes Render settings and is not automatically
loaded by local Compose. Use npm run setup:env only for a new development environment;
do not regenerate existing production secrets.

## .env.example

| Variable | Visibility | Purpose / example-file context |
|---|---|---|
| N8N_ENCRYPTION_KEY | Secret | (changing it makes existing n8n credentials unreadable). 48+ random chars. |
| N8N_OWNER_EMAIL | Server configuration | n8n owner account (created by n8n/import.sh on first run; log in at http://localhost:5678) |
| N8N_OWNER_PASSWORD | Secret | n8n owner password |
| N8N_OWNER_FIRST_NAME | Server configuration | n8n owner first name |
| N8N_OWNER_LAST_NAME | Server configuration | n8n owner last name |
| N8N_WEBHOOK_BASE_URL | Server configuration | Public base URL n8n uses for its webhook URLs (set to your tunnel URL when exposing webhooks) |
| BACKEND_INTERNAL_URL | Server configuration | How n8n (inside Docker) reaches the backend running on the host |
| GROQ_MODEL | Server configuration | Non-secret values the workflow reads via $env (secrets live in n8n credentials instead) |
| GROQ_REPLY_MODEL | Server configuration | groq reply model |
| GROQ_REASONING_EFFORT | Server configuration | groq reasoning effort |
| GEMINI_MODEL | Server configuration | gemini model |
| PUBLIC_SITE_URL | Server configuration | public site url |
| SHEETS_WEBAPP_URL | Server configuration | sheets webapp url |
| WHATSAPP_PROVIDER | Server configuration | whatsapp provider |
| WHATSAPP_PHONE_NUMBER_ID | Server configuration | whatsapp phone number id |
| WHATSAPP_GRAPH_VERSION | Server configuration | whatsapp graph version |

## backend/.env.example

| Variable | Visibility | Purpose / example-file context |
|---|---|---|
| NODE_ENV | Server configuration | Never commit backend/.env. Only this example file is tracked. |
| RETELL_ENABLED | Server configuration | Retell is disabled until the agent is published and webhook delivery is verified. |
| RETELL_API_KEY | Secret | retell api key |
| RETELL_AGENT_ID | Server configuration | retell agent id |
| RETELL_PHONE_NUMBER | Server configuration | retell phone number |
| RETELL_WEBHOOK_SECRET | Secret | Optional webhook-badged Retell API key. Defaults to RETELL_API_KEY; not a random secret. |
| RETELL_TEST_NUMBERS | Server configuration | Comma-separated E.164 numbers. Set your own verified number for trial use. |
| VOICE_AUTO_CALL | Server configuration | voice auto call |
| VOICE_CALL_START_HOUR | Server configuration | voice call start hour |
| VOICE_CALL_END_HOUR | Server configuration | voice call end hour |
| N8N_VOICE_FOLLOWUP_URL | Server configuration | n8n voice followup url |
| N8N_VOICE_OUTBOUND_URL | Server configuration | n8n voice outbound url |
| ADMIN_BEARER_AUTH | Server configuration | Enable for separate Render domains; admin JWT stays in browser memory. |
| PORT | Server configuration | port |
| LOG_LEVEL | Server configuration | log level |
| CORS_ORIGIN | Server configuration | Comma-separated list of allowed browser origins (the Vite dev server) |
| PUBLIC_SITE_URL | Server configuration | Used to build property links in AI replies and the admin link in broker emails |
| MONGODB_URI | Secret | mongodb://127.0.0.1:27017   (and run `docker compose --profile local-mongo up -d`) |
| MONGODB_DB | Server configuration | Database name used by this app (overrides any db name inside the URI) |
| GROQ_API_KEY | Secret | Pick current production models via each provider's list-models endpoint (see docs/RUNBOOK.md) |
| GROQ_MODEL | Server configuration | groq model |
| GROQ_REPLY_MODEL | Server configuration | Separate Groq model for reply drafting (own tokens-per-minute bucket on the free tier) |
| GROQ_REASONING_EFFORT | Server configuration | groq reasoning effort |
| GEMINI_API_KEY | Secret | gemini api key |
| GEMINI_MODEL | Server configuration | gemini model |
| LLM_TIMEOUT_MS | Server configuration | llm timeout ms |
| N8N_WEBHOOK_URL | Server configuration | Production webhook of the "Lead Intake & Qualification" workflow |
| N8N_HEALTH_URL | Server configuration | n8n health url |
| N8N_TIMEOUT_MS | Server configuration | n8n timeout ms |
| N8N_ENABLED | Server configuration | Set to false to force the in-process fallback pipeline |
| INTERNAL_API_SECRET | Secret | Must match the "Backend Internal Secret" credential in n8n (import.sh sets it). 48+ random chars. |
| CLERK_SECRET_KEY | Secret | clerk secret key |
| SHEETS_WEBAPP_URL | Server configuration | Deployed Apps Script web app URL (…/exec) and the token stored in its Script Properties |
| SHEETS_SPREADSHEET_URL | Server configuration | Optional: the spreadsheet URL (for “open row” links in the admin panel) |
| SHEETS_WEBHOOK_TOKEN | Secret | sheets webhook token |
| WHATSAPP_PROVIDER | Server configuration | simulator = no live number (admin → WhatsApp Simulator); meta = Meta WhatsApp Cloud API |
| WHATSAPP_TOKEN | Secret | whatsapp token |
| WHATSAPP_PHONE_NUMBER_ID | Server configuration | whatsapp phone number id |
| WHATSAPP_VERIFY_TOKEN | Secret | whatsapp verify token |
| WHATSAPP_APP_SECRET | Secret | whatsapp app secret |
| WHATSAPP_GRAPH_VERSION | Server configuration | whatsapp graph version |
| APIFY_API_TOKEN | Secret | API token from https://console.apify.com/settings/integrations — backend only, never commit it. |
| APIFY_ENABLED | Server configuration | apify enabled |
| APIFY_ACTOR | Server configuration | Actor that scrapes MagicBricks (rent + buy + plots) for Indian cities |
| APIFY_SYNC_INTERVAL_MIN | Server configuration | The backend talks to Apify this often: collects finished scrapes, syncs MongoDB, maybe starts a scrape |
| APIFY_MAX_RESULTS | Server configuration | Listings per scrape run (the actor charges ~$0.003 per listing) |
| APIFY_MONTHLY_BUDGET_USD | Server configuration | Scrapes are paced so this app never spends more than this per Apify billing cycle |
| APIFY_PRICE_PER_RESULT_USD | Server configuration | apify price per result usd |
| APIFY_CITIES | Server configuration | apify cities |
| GOOGLE_CLIENT_ID | Server configuration | Authorised redirect URI to register there: http://localhost:5173/api/auth/google/callback |
| GOOGLE_CLIENT_SECRET | Secret | google client secret |
| GOOGLE_REDIRECT_URI | Server configuration | Leave empty to use PUBLIC_SITE_URL + /api/auth/google/callback |
| ADMIN_EMAIL | Server configuration | admin email |
| ADMIN_PASSWORD | Secret | admin password |
| JWT_SECRET | Secret | jwt secret |

## frontend/.env.example

| Variable | Visibility | Purpose / example-file context |
|---|---|---|
| VITE_API_BASE_URL | Public browser build | /api is proxied to the backend by the Vite dev server (see vite.config.ts). |
| VITE_CLERK_PUBLISHABLE_KEY | Public browser build | Render: replace /api with https://<actual-backend>.onrender.com/api and rebuild. |

## n8n/.env.example

| Variable | Visibility | Purpose / example-file context |
|---|---|---|
| DB_TYPE | Server configuration | Render n8n service. Do not use SQLite on an ephemeral filesystem. |
| DB_POSTGRESDB_HOST | Server configuration | db postgresdb host |
| DB_POSTGRESDB_PORT | Server configuration | db postgresdb port |
| DB_POSTGRESDB_DATABASE | Server configuration | db postgresdb database |
| DB_POSTGRESDB_USER | Server configuration | db postgresdb user |
| DB_POSTGRESDB_PASSWORD | Secret | db postgresdb password |
| N8N_ENCRYPTION_KEY | Secret | n8n encryption key |
| N8N_HOST | Server configuration | n8n host |
| N8N_PORT | Server configuration | n8n port |
| N8N_LISTEN_ADDRESS | Server configuration | n8n listen address |
| N8N_PROTOCOL | Server configuration | n8n protocol |
| WEBHOOK_URL | Server configuration | webhook url |
| N8N_EDITOR_BASE_URL | Server configuration | n8n editor base url |
| N8N_PROXY_HOPS | Server configuration | n8n proxy hops |
| N8N_SECURE_COOKIE | Server configuration | n8n secure cookie |
| GENERIC_TIMEZONE | Server configuration | generic timezone |
| N8N_BLOCK_ENV_ACCESS_IN_NODE | Server configuration | n8n block env access in node |
| N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS | Server configuration | n8n enforce settings file permissions |
| EXECUTIONS_DATA_PRUNE | Server configuration | executions data prune |
| EXECUTIONS_DATA_MAX_AGE | Server configuration | executions data max age |
| BACKEND_INTERNAL_URL | Server configuration | backend internal url |
| PUBLIC_SITE_URL | Server configuration | public site url |
| INTERNAL_API_SECRET | Secret | internal api secret |
| GROQ_API_KEY | Secret | groq api key |
| GEMINI_API_KEY | Secret | gemini api key |
| GROQ_MODEL | Server configuration | groq model |
| GROQ_REPLY_MODEL | Server configuration | groq reply model |
| GROQ_REASONING_EFFORT | Server configuration | groq reasoning effort |
| GEMINI_MODEL | Server configuration | gemini model |
| SHEETS_WEBAPP_URL | Server configuration | sheets webapp url |
| SHEETS_WEBHOOK_TOKEN | Secret | sheets webhook token |
| WHATSAPP_PROVIDER | Server configuration | whatsapp provider |
| WHATSAPP_TOKEN | Secret | whatsapp token |
| WHATSAPP_PHONE_NUMBER_ID | Server configuration | whatsapp phone number id |
| WHATSAPP_GRAPH_VERSION | Server configuration | whatsapp graph version |
| N8N_IMPORT_PROJECT_ID | Server configuration | Set only for the explicit one-time operator import command. |
| NESTR_IMPORT_CONFIRM | Server configuration | nestr import confirm |
