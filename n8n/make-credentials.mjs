#!/usr/bin/env node
/**
 * Writes a temporary n8n credentials import file from the local (git-ignored) .env files.
 * Used only by import.sh, which deletes the file right after `n8n import:credentials`.
 * Credential ids/names match n8n/credentials.manifest.json, which the workflows reference.
 * Nothing is printed except the output path.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const be = parseEnv(resolve(root, 'backend/.env'));
const manifest = JSON.parse(readFileSync(resolve(root, 'n8n/credentials.manifest.json'), 'utf8'));
const byName = Object.fromEntries(manifest.map((c) => [c.name, c]));
const placeholder = 'not-configured';

const data = {
  'Backend Internal Secret': { name: 'X-Internal-Secret', value: be.INTERNAL_API_SECRET },
  'Groq API': { name: 'Authorization', value: `Bearer ${be.GROQ_API_KEY || placeholder}` },
  'Gemini API': { name: 'x-goog-api-key', value: be.GEMINI_API_KEY || placeholder },
  'Sheets Webhook Token': { name: 'token', value: be.SHEETS_WEBHOOK_TOKEN || placeholder },
  'WhatsApp Cloud API': { name: 'Authorization', value: `Bearer ${be.WHATSAPP_TOKEN || placeholder}` },
};
if (!be.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET missing in backend/.env');

const creds = Object.entries(data).map(([name, d]) => ({ id: byName[name].id, name, type: byName[name].type, data: d }));
const out = resolve(root, 'n8n/.tmp/credentials.import.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(creds), { mode: 0o600 });
console.log(out);
