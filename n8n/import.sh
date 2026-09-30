#!/usr/bin/env bash
# Imports the NESTR. workflows + credentials into the n8n container and publishes (activates) them.
#   bash n8n/import.sh            (or: npm run n8n:import)
# Requires: docker compose up -d n8n, root .env and backend/.env present (npm run setup:env).
# Secrets are read from the local .env files, written to a temp file, copied into the container,
# imported (n8n encrypts them with N8N_ENCRYPTION_KEY) and deleted on both sides.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=${N8N_CONTAINER:-nestr-n8n}
N8N_URL=${N8N_URL:-http://localhost:5678}
MAIN_ID=nestrLeadIntake1
ERROR_ID=nestrErrorHndlr1

envval() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2-; }

echo "▸ waiting for n8n at $N8N_URL"
for _ in $(seq 1 40); do
  curl -fs "$N8N_URL/healthz" >/dev/null 2>&1 && break
  sleep 3
done
curl -fs "$N8N_URL/healthz" >/dev/null || { echo "n8n is not reachable — run: docker compose up -d n8n"; exit 1; }

echo "▸ building workflow JSON from backend prompts + rules"
node n8n/build-workflows.mjs

echo "▸ importing credentials (values from local .env files, never committed)"
TMP_FILE=$(node n8n/make-credentials.mjs)
trap 'rm -f "$TMP_FILE"; docker exec -u root "$CONTAINER" rm -f /tmp/nestr-creds.json >/dev/null 2>&1 || true' EXIT
MSYS_NO_PATHCONV=1 docker cp "$TMP_FILE" "$CONTAINER:/tmp/nestr-creds.json"
MSYS_NO_PATHCONV=1 docker exec -u root "$CONTAINER" chmod 644 /tmp/nestr-creds.json
rm -f "$TMP_FILE"
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" n8n import:credentials --input=/tmp/nestr-creds.json
MSYS_NO_PATHCONV=1 docker exec -u root "$CONTAINER" rm -f /tmp/nestr-creds.json

echo "▸ importing workflows"
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" n8n import:workflow --separate --input=/workflows

echo "▸ publishing workflows"
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" n8n publish:workflow --id="$ERROR_ID" || true
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" n8n publish:workflow --id="$MAIN_ID"

echo "▸ restarting n8n so the published webhook is registered"
docker restart "$CONTAINER" >/dev/null
# /healthz answers before published webhooks are registered, so wait for the webhook itself.
for _ in $(seq 1 40); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$N8N_URL/webhook/lead-intake" -H "Content-Type: application/json" -d '{}' || true)
  [ "$CODE" != "404" ] && [ "$CODE" != "000" ] && break
  sleep 3
done

# Owner account (first run only). n8n answers 400 once an owner exists.
OWNER_EMAIL=$(envval N8N_OWNER_EMAIL .env)
OWNER_PASSWORD=$(envval N8N_OWNER_PASSWORD .env)
if [ -n "$OWNER_EMAIL" ] && [ -n "$OWNER_PASSWORD" ]; then
  BODY=$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.argv[2],firstName:process.argv[3]||"NESTR",lastName:process.argv[4]||"Admin"}))' \
    "$OWNER_EMAIL" "$OWNER_PASSWORD" "$(envval N8N_OWNER_FIRST_NAME .env)" "$(envval N8N_OWNER_LAST_NAME .env)")
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$N8N_URL/rest/owner/setup" -H "Content-Type: application/json" -d "$BODY" || true)
  case "$CODE" in
    200) echo "▸ n8n owner account created ($OWNER_EMAIL)";;
    *) echo "▸ n8n owner account already set up (HTTP $CODE)";;
  esac
fi

echo "▸ checking the production webhook is registered (expects 401/403 without the secret)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$N8N_URL/webhook/lead-intake" -H "Content-Type: application/json" -d '{}')
echo "   POST /webhook/lead-intake without secret → HTTP $CODE"
if [ "$CODE" = "404" ]; then echo "   webhook not registered — check the n8n logs: docker logs $CONTAINER"; exit 1; fi
echo "✔ n8n ready: $N8N_URL (workflow 'Lead Intake & Qualification' published)"
