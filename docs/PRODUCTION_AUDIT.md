# Production audit — 2026-11-18

## Baseline and Git safety

Base branch: `feat/clerk-auth-and-api-fixes`. Implementation branch:
`feat/retell-render-production`. Pre-existing changes in the n8n credentials manifest
and both intake workflow exports are preserved. No push or deployment is authorized.

## Existing architecture

Vite React frontend → Express /api → MongoDB Atlas. Public intake chooses n8n,
with an in-process Groq/Gemini fallback. Both converge on leadStore.upsertLeadResult.
Clerk bearer tokens authenticate customers; a signed HTTP-only JWT cookie authenticates
admins. An in-memory SSE bus feeds the admin dashboard. Apify starts with the backend.
Root npm workspaces and one lockfile govern dependency installation.

Docker Compose currently runs n8n with a persistent local SQLite volume and an optional
local MongoDB profile. Frontend and backend run on the host. There are no Dockerfiles,
Render definitions, or voice services. Existing n8n import uses host Docker commands,
regenerates intake files, and publishes/restarts the local instance. Preserve it.

## Deployment and security blockers

- No Retell models, consent/DNC fields, atomic call lock, signature handler or UI.
- No durable webhook inbox/outbox: process crashes would otherwise lose callbacks.
- Production frontend needs a backend URL; SSE currently hardcodes /api.
- Strict cookies will not authenticate across unrelated Render service domains.
  Use short-lived admin bearer JWTs held only in memory for production cross-origin API;
  authenticated fetch streaming replaces EventSource where a bearer header is needed.
- Existing JSON middleware preserves raw body; increase only the Retell route limit.
- Clerk email linking must require verified email. Admin state-changing cookie requests
  need an Origin check. Internal secrets must stay backend/n8n only.
- n8n needs PostgreSQL on Render; local SQLite data requires an explicit export/import.
- No shutdown handling, production image, rollback instructions or readiness endpoint.
- Free Render services can sleep; expiring free PostgreSQL is unsuitable for permanent
  n8n persistence. Blueprint will select paid always-on services and durable PostgreSQL.
- Only one backend replica is supported initially (existing SSE bus is in-process).

## Implementation sequence and affected areas

1. Complete this audit and preserve Git changes (done).
2. Add voice persistence, call eligibility/atomic lock, Retell API adapter, durable inbox
   and retrying post-call outbox; existing lead storage remains authoritative.
3. Extend existing admin/internal routes and lead screen, add separate voice workflows.
4. Add production Dockerfiles and Render Blueprint; preserve development Compose.
5. Add isolated automated tests and run build, unit tests, typechecks and Docker checks.
   Document real deployment verification separately; never claim a local build proves
   that production cookies, caller routing or provider webhooks work.

No live calls, paid resources, database migration, agent publication or workflow import
will occur during implementation. External configuration is completed after deployment.
