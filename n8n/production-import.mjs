// Explicit operator command only. Never runs on service startup/deployment.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.env.NESTR_IMPORT_CONFIRM !== 'yes') throw new Error('Back up n8n first, then set NESTR_IMPORT_CONFIRM=yes explicitly');
if (!process.env.N8N_IMPORT_PROJECT_ID) throw new Error('Set the owner personal project ID as N8N_IMPORT_PROJECT_ID');
const manifest = JSON.parse(readFileSync('/opt/nestr/manifest.json', 'utf8'));
const secret = process.env.INTERNAL_API_SECRET;
if (!secret) throw new Error('INTERNAL_API_SECRET is required');
const data = {
  'Backend Internal Secret': { name: 'X-Internal-Secret', value: secret },
  'Groq API': { name: 'Authorization', value: `Bearer ${process.env.GROQ_API_KEY || 'not-configured'}` },
  'Gemini API': { name: 'x-goog-api-key', value: process.env.GEMINI_API_KEY || 'not-configured' },
  'Sheets Webhook Token': { name: 'token', value: process.env.SHEETS_WEBHOOK_TOKEN || 'not-configured' },
  'WhatsApp Cloud API': { name: 'Authorization', value: `Bearer ${process.env.WHATSAPP_TOKEN || 'not-configured'}` },
};
const dir = mkdtempSync(join(tmpdir(), 'nestr-import-'));
try {
  const file = join(dir, 'credentials.json');
  writeFileSync(file, JSON.stringify(manifest.map(c => ({ ...c, data: data[c.name] }))), { mode: 0o600 });
  const opts = { stdio: 'inherit' };
  execFileSync('n8n', ['import:credentials', `--input=${file}`, `--projectId=${process.env.N8N_IMPORT_PROJECT_ID}`], opts);
  execFileSync('n8n', ['import:workflow', '--separate', '--input=/opt/nestr/workflows', `--projectId=${process.env.N8N_IMPORT_PROJECT_ID}`], opts);
  console.log('Imported inactive workflows. Review them in n8n, publish explicitly, and restart the service.');
} finally { rmSync(dir, { recursive: true, force: true }); }
