# NESTR. — Real Estate Lead Qualifier & Auto-Responder

Every property inquiry, from the website chatbot, the website form, a Google Form or WhatsApp, is
classified by an LLM (buyer / renter / investor, urgency, budget, location, timeline, requirements) and
answered instantly with a personalised reply and matching listings. It is stored in MongoDB, logged to
Google Sheets and handed to the right broker, with high-urgency leads first. The customer site is a
pixel-level React rebuild of the BLDR Framer template, adapted to real estate.

```
Website chat ─┐
Website form ─┼─► Backend (Express) ─► n8n "lead-intake" ─► Groq → (Gemini) classify ─► rules ─► matches
Google Form ──┤                                         ─► reply draft ─► MongoDB ─► Sheets ─► reply on channel
WhatsApp ─────┘       (n8n down → same pipeline in-process)                 ─► high urgency → broker alert
                                                          Admin panel ◄── MongoDB ──► broker follow-up
```

## Quick start

Needs Node 20+ (tested on 24), Docker Desktop and Git.

```bash
npm install
npm run setup:env          # generates .env files with random secrets; then put your keys + Mongo URI in backend/.env
docker compose up -d       # n8n (add --profile local-mongo for a local MongoDB)
npm run seed               # sample properties + brokers
npm run n8n:import         # n8n credentials + workflows, published
npm run dev                # http://localhost:5173 (site) · /admin (lead desk) · API :4000
```

Admin login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`. n8n: http://localhost:5678.

Customer authentication uses Clerk. Set `CLERK_SECRET_KEY` in `backend/.env` and
`VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` using the selected Clerk application. Existing
MongoDB customer records are linked to Clerk by verified email on first sign-in; admin authentication
continues to use the local JWT login.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | backend (tsx) + frontend (Vite) together |
| `npm test` | backend unit tests (schema, urgency, score, matching, LLM fallback, prompt sync, Apps Script) |
| `npm run eval:llm` | 15 fixed inquiries through the real LLMs; asserts intent and urgency on the clear cases |
| `npm run test:integration` | end-to-end against the running stack: chatbot, form, Google Form → n8n, WhatsApp simulator, broker actions, security, n8n-down fallback |
| `npm run visual` | section screenshots at 1440/1200/810/390 via Chrome DevTools (no Playwright) |
| `npm run secrets:scan` · `secrets:scan:dist` | secret scan of Git-tracked files · of the built frontend |
| `npm run n8n:import` | rebuild + import + publish the n8n workflows |
| `npm run build` | production builds |

## Layout

```
frontend/   React site (src/site) + admin panel (src/admin), shared tokens in src/styles/tokens.css
backend/    Express API, pipeline (src/pipeline), prompts (src/prompts/*.md), tests
n8n/        build-workflows.mjs → workflows/*.json, import.sh
apps-script/ Code.gs + appsscript.json (Sheets, Form trigger, broker email)
docs/       PLAN, DESIGN_INVENTORY, ARCHITECTURE, RUNBOOK, IMAGE_CREDITS, visual-diff/
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/RUNBOOK.md](docs/RUNBOOK.md) (Atlas, Google,
WhatsApp, n8n setup) · [docs/DESIGN_INVENTORY.md](docs/DESIGN_INVENTORY.md) · [docs/visual-diff/NOTES.md](docs/visual-diff/NOTES.md).

NESTR. is a fictional brand. Listings, testimonials and people are sample content.
