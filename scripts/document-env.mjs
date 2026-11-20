// Generate a complete variable index using example files only, never local secrets.
import { readFileSync, writeFileSync } from 'node:fs';
const files = ['.env.example', 'backend/.env.example', 'frontend/.env.example', 'n8n/.env.example'];
let text = `# Production environment\n\nBackend config is validated in backend/src/config.ts. Empty optional integrations stay\ndisabled until their credentials are configured. VITE_* values are public build-time\ninputs; rebuild the static site after changing them. Never copy backend .env to frontend.\n\nRender nestr-backend-secrets: MongoDB URI/name, admin email/password, JWT_SECRET,\nINTERNAL_API_SECRET, Clerk secret key, optional LLM/Apify/Sheets/WhatsApp/Retell secrets.\nRender nestr-n8n-secrets: preserve N8N_ENCRYPTION_KEY and share INTERNAL_API_SECRET,\nprovider credentials needed for the explicit import, plus PUBLIC_SITE_URL and the\nnon-secret LLM/Sheets/WhatsApp workflow settings in n8n/.env.example. These groups\nare created manually before syncing the Blueprint. Secrets use Render encrypted env\nvalues; the Blueprint never contains them.\n\nProduction backend: ADMIN_BEARER_AUTH=true, PUBLIC_SITE_URL=CORS_ORIGIN=actual static\norigin. NESTR_N8N_HOSTPORT is supplied by Render; backend startup derives all n8n URLs.\nProduction n8n: NESTR_BACKEND_HOSTPORT supplied by Render; startup derives\nBACKEND_INTERNAL_URL. The private-network connections use HTTP; public API/editor and\nprovider webhooks use HTTPS. DB_POSTGRESDB_* come from the private Render PostgreSQL\nresource. Preserve the encryption key when moving between SQLite and PostgreSQL.\n\nRETELL_ENABLED=false and VOICE_AUTO_CALL=false until manual verification. Set\nRETELL_TEST_NUMBERS to a single verified E.164 number before enabling trial calls.\nRETELL_WEBHOOK_SECRET means the Retell webhook-badged API key, not a random string.\nCalling hours use Asia/Kolkata; 24-hour frequency and DNC apply even for manual calls.\n\nLocal development: root env configures Compose, backend env configures Express, frontend\nenv configures Vite; n8n/.env.example describes Render settings and is not automatically\nloaded by local Compose. Use npm run setup:env only for a new development environment;\ndo not regenerate existing production secrets.\n\n`;
for (const file of files) {
  text += `## ${file}\n\n| Variable | Visibility | Purpose / example-file context |\n|---|---|---|\n`;
  let comment = '';
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('#') && !/^# [-—]/.test(line)) comment = line.replace(/^#\s*/, '');
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) continue;
    const key = match[1];
    const secret = /SECRET|TOKEN|PASSWORD|ENCRYPTION|MONGODB_URI|API_KEY/.test(key) && !key.startsWith('VITE_');
    text += `| ${key} | ${secret ? 'Secret' : key.startsWith('VITE_') ? 'Public browser build' : 'Server configuration'} | ${(comment || key.toLowerCase().replaceAll('_', ' ')).replace(/\|/g, '/')} |\n`;
    comment = '';
  }
  text += '\n';
}
writeFileSync('docs/PRODUCTION_ENVIRONMENT.md', text.trimEnd() + '\n');
