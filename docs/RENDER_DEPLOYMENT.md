# Render deployment and rollback

Do not deploy until the owner approves costs, secret configuration and this branch.
The Blueprint uses a free static site, two paid starter services and paid
PostgreSQL. Review current Render pricing first. Free sleeping web services and
expiring free PostgreSQL are unsuitable for reliable phone callbacks.

## Before provisioning

1. Review changes on feat/retell-render-production; push only with explicit owner
   approval. Connect this branch in Render New → Blueprint using render.yaml.
   Subsequent approved GitHub pushes deploy after GitHub checks pass. No workflows are
   imported or overwritten by service startup.
2. Create Render env groups `nestr-backend-secrets` and `nestr-n8n-secrets` in the
   same workspace. Populate values from PRODUCTION_ENVIRONMENT.md. Copy the
   existing N8N_ENCRYPTION_KEY exactly; never regenerate it during migration.
3. All server/database resources use Singapore. Set Atlas network access to the
   API service's documented outbound IP ranges, use a dedicated least-privilege
   DB user, and confirm TLS connectivity. Avoid permanently allowing all IPs.
4. Set PUBLIC_SITE_URL and CORS_ORIGIN to the actual static origin (no trailing
   slash), VITE_API_BASE_URL to `https://ACTUAL-API.onrender.com/api`.
   Set n8n N8N_HOST to its actual host and WEBHOOK_URL/N8N_EDITOR_BASE_URL to
   its public HTTPS URL with trailing slash. Names may be suffixed by Render.
5. Set production Clerk public/secret keys for the same app. Allow the frontend
   origin and configure Clerk production domains. Never put a secret in VITE_*.

Use one API replica. Admin production auth uses the existing JWT returned after
password login, held in browser memory and sent as Authorization. Refreshing
the page requires signing in again. Tokens never enter localStorage, URLs or
SSE query strings. SSE uses authenticated fetch streaming against apiBase.
Local development retains HTTP-only SameSite=strict cookie login. Unsafe admin
requests with cookies require an allowed Origin; bearer requests from tools
without cookies need no CSRF token. JWTs expire in 12h; logout clears browser
state but cannot revoke an already stolen token. A server-side session revocation
store is a future enhancement. Do not switch cookies to SameSite=None as a fix.

## Initial n8n migration

Back up the local n8n volume and export workflows/credentials securely before
migrating. If migrating existing stored credentials, preserve their encrypted
exports and the original encryption key. PostgreSQL is the source of n8n
persistence on Render; no SQLite or persistent filesystem is assumed. These
workflows use JSON only; introducing filesystem binary workflows needs a storage
review. Retain the local Docker stack for development.

On the first production launch create the n8n owner, open the personal project
and obtain its project ID. In Render n8n shell, run explicitly:

```sh
N8N_IMPORT_PROJECT_ID=YOUR_PROJECT_ID NESTR_IMPORT_CONFIRM=yes node /opt/nestr/production-import.mjs
```

Set import-only credential env values in the n8n service first. Imported IDs are
fixed, so a repeat import updates those workflows and credentials. Back up before
every update, review node changes, import only in a maintenance window, publish
explicitly in the UI, then restart the n8n service. No `docker exec/cp` is needed
in production. The import command does not publish. Confirm CLI help for the
pinned image before importing into an existing project.

Publish the error handler, intake, voice-outbound and voice-followup workflows.
The two voice workflows delegate final eligibility and follow-up application to
the backend. The main backend worker already triggers eligible calls; do not add
an independent Retell HTTP node. A real n8n error appears as a failed execution;
the attached error workflow logs it. Inspect Executions and worker logs after
deployment. Secret env access is enabled for existing Code nodes: restrict n8n
editing/admin access to trusted operators.

## Verification after deployment

```sh
curl -fsS https://YOUR-API.onrender.com/api/health
curl -i -X POST https://YOUR-API.onrender.com/api/webhooks/retell -H 'Content-Type: application/json' -d '{}'
curl -i -X POST https://YOUR-N8N.onrender.com/webhook/lead-intake -H 'Content-Type: application/json' -d '{}'
```

Expect health 200 with db up, unsigned Retell 401, unauthenticated intake 401/403
(not 404). Then complete browser admin/Clerk/SSE checks and a consented test call
as described in PRODUCTION_TESTING.md. Configure the Retell webhook and publish
only after these URLs work. A Blueprint file does not itself create a URL.

Rollback: set RETELL_ENABLED=false and VOICE_AUTO_CALL=false; stop any ongoing
calls in Retell. Redeploy the previous approved Git commit in Render. Restore
n8n workflow export in a maintenance window if changed. Do not change encryption
keys or blindly restore MongoDB over live records. Added Mongo fields/collections
are additive and can remain. Preserve inbox/outbox records for recovery.

Official references: [Docker](https://render.com/docs/docker),
[static sites](https://render.com/docs/static-sites),
[Blueprint](https://render.com/docs/blueprint-spec),
[PostgreSQL](https://render.com/docs/postgresql).
