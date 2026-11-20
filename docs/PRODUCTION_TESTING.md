# Verification and release gates

This is an implementation for review, not a claim that production is live or
verified. No Git push, Render resource creation, production import, live call,
Retell agent publication or database migration was performed.

Full changed-file inventory: CHANGED_FILES.txt. The three original n8n generated
files listed there were already modified before this task and were preserved.
The implementation is on feat/retell-render-production. The original branch was
not committed, reset or force-pushed. No local .env credentials were changed.

## Executed checks

- Workspace backend and frontend TypeScript checks passed.
- `npm run build` passed (backend compilation + prompt assets, frontend Vite bundle).
  Vite reports harmless upstream Zod annotation warnings.
- `npm test`: 69 tests passed, including the final production-origin and admin
  authentication check. The isolated clean copy also passed both typechecks,
  build and its 68-test suite before that final test was added.
- `npm ci` failed in the working directory twice because Windows held a Rollup
  native module open. `npm install` restored the workspace. A clean `npm ci`
  in ignored `.validation/` succeeded from the same root lockfile without secrets.
- Blueprint YAML parses with three services and one database. This is not a
  Render-account Blueprint validation or a successful provisioning test.
- Backend source and frontend production bundle secret scans passed. The scanner
  now excludes only explicitly named Clerk publishable keys with pk_test/pk_live
  prefixes, while retaining checks for private or misnamed VITE_* secrets.
- Production npm audit after compatible mongoose/qs updates and build/test-tool
  reclassification reports zero vulnerabilities. Full development audit still
  reports five high findings in the existing picomatch/Vite/Vitest chain; the
  registry's latest picomatch was 4.0.7. Do not run npm audit fix --force blindly.
- `docker compose config --quiet` passed (exit 0) on the final check.
  Both Docker image builds were attempted, but Docker's build
  and container-list commands stalled after C: ran out of space. Disposable npm
  cache cleanup restored free space. Only this task's stalled build/status CLI
  processes were terminated; the running n8n service was not restarted or stopped.
  Neither image build is claimed to have passed.

## Commands for a clean verification environment

```sh
npm ci
npm run typecheck -w backend
npm run typecheck -w frontend
npm test
npm run build
npm run secrets:scan
node scripts/secret-scan.mjs --dir frontend/dist
npm audit --omit=dev
docker compose config --quiet
docker build -f backend/Dockerfile -t nestr-backend .
docker build -f n8n/Dockerfile -t nestr-n8n-production .
```

The added CI workflow repeats build, tests, typechecks, tracked secret scan and
both Docker builds on Linux; it has not run on GitHub because nothing was pushed.
Docker Desktop must be responsive before repeating the image checks. Do not
restart Docker while local services are in use without arranging that interruption.

## Automated coverage and its limits

Voice tests cover E.164 validation, missing consent/evidence, DNC, test allowlist,
hours, 24-hour frequency, known-only dynamic variables, missing/invalid leads,
atomic lock duplicate-key rejection, provider errors, stable event identity,
signature verification against exact raw bytes, tampering, late started/ended
events, analysis extraction, opt-out suppression, n8n outbox failure retention,
unauthorized admin access and existing-JWT bearer handling.

Database queries and provider API calls in unit tests are mocked; no production
MongoDB records or real phone numbers are used. Real database concurrency,
Retell delivery, carrier routing and browser cross-origin behavior still require
the deployment tests below. Existing integration tests include legacy customer
email/password flows predating Clerk; do not treat those as proof of current
Clerk behavior or run them against production data.

## Before enabling real callbacks

1. Complete both Docker builds, start the images with isolated test databases,
   verify non-root backend execution and readiness, and send SIGTERM to verify
   graceful shutdown. Verify n8n uses PostgreSQL and retains workflows after a
   restart. Confirm initial import flags with the pinned n8n CLI help.
2. In separate Render frontend/API domains, test admin login, authenticated SSE,
   expired JWT, logout and page reload. Reload intentionally requires admin
   sign-in because bearer tokens live only in memory. Test rejected cross-origin
   cookie POSTs. Test Clerk sign-in with a verified email for the configured app.
3. Create synthetic leads in an isolated Mongo database. Record consent for one
   verified test phone. Send simultaneous initiation requests; only one Retell
   call may result, including when two leads share that phone. Revoke consent,
   verify DNC suppression, and test the test-number allowlist and calling hours.
4. Keep Retell disabled until the backend URL is live. Set the signed webhook,
   publish the existing agent, connect the Twilio US number via Retell and verify
   carrier permissions. Enable only your verified test number and make one
   consented call. Check ongoing/ended/analyzed states, transcript, duration,
   recording settings and extracted fields. Ending a call alone must not qualify it.
5. Replay the same signed provider event, deliver analysis before call_ended,
   stop/restart the API while inbox/outbox work is pending, and make n8n temporarily
   unavailable. Confirm persistence and retry without duplicate tasks/calls.
6. Verify HOT leads appear in the assigned broker's admin follow-up queue and
   have a persisted in-app alert, WARM enters review, COLD is not auto-redialed,
   CALLBACK stores the requested time, and OPTED_OUT/NOT_INTERESTED suppress calls.

## Known operational limits

- One API replica initially: SSE and the worker overlap guard are in-process.
  Database call locks still guard duplicates; horizontal scaling needs shared
  event delivery and atomic outbox claim ownership first.
- HOT notifications use the existing admin interface; there is no new broker
  email/SMS delivery service. Callback time is recorded, not auto-scheduled.
- Provider request timeout is an unknown outcome, never proof of failure. Keep
  the frequency lock and inspect Retell history. Calls with known provider IDs
  can be refreshed via POST `/api/admin/voice/calls/:id/sync`.
- Incoming calls are stored and matched to an existing phone, but inbound number
  provisioning, inbound agent configuration and unmatched-call triage remain
  later capabilities as requested.
- Raw webhook inbox retention is seven days. Set a business-appropriate retention
  policy for VoiceCall transcripts/recordings and follow provider consent policies.
- Admin logout clears browser state but does not revoke a stolen JWT; current
  tokens expire after 12 hours. A revocation/session store is not implemented.
- Existing local Bash import CRLF/PATH limitations are preserved; the production
  CLI import does not use Bash or Docker host commands.

Deploy only after the owner reviews configuration, costs, remaining advisories
and the live checks. See RENDER_DEPLOYMENT.md for exact operator commands and rollback.
