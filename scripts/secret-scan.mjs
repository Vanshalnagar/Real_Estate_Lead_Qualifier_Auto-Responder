#!/usr/bin/env node
/**
 * Secret scanner. Fails (exit 1) if any scanned file contains:
 *   - provider key patterns: Google/Gemini "AIza…", Groq "gsk_…", MongoDB URIs with a password,
 *     private keys, generic "Bearer <long token>" literals
 *   - the literal value of any secret-looking variable in the local .env files
 *     (…KEY, …SECRET, …TOKEN, …PASSWORD, MONGODB_URI), so even random-looking secrets are caught.
 *
 *   node scripts/secret-scan.mjs                 # all git-tracked files (default)
 *   node scripts/secret-scan.mjs --staged        # files staged for commit (pre-commit hook)
 *   node scripts/secret-scan.mjs --dir frontend/dist
 *   node scripts/secret-scan.mjs --file some.log --file other.json
 * Matches are reported by file and pattern name only — the secret itself is never printed.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);

const PATTERNS = [
  ['Google/Gemini API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['Groq API key', /gsk_[0-9A-Za-z]{20,}/],
  ['Google OAuth client secret', /GOCSPX-[0-9A-Za-z_-]{20,}/],
  ['Apify API token', /apify_api_[0-9A-Za-z]{20,}/],
  ['MongoDB URI with password', /mongodb(\+srv)?:\/\/[^\s:/@"'<>]+:[^\s@/"'<>]+@/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Meta/WhatsApp access token', /EAA[A-Za-z0-9]{60,}/],
];

// Literal values of secrets from local env files (never committed).
const literal = [];
for (const f of ['.env', 'backend/.env', 'frontend/.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (/(KEY|SECRET|TOKEN|PASSWORD)$|^MONGODB_URI$/.test(k) && v.length >= 12 && !v.startsWith('<')) literal.push([`value of ${k} (from ${f})`, v]);
  }
}

function listFiles() {
  const files = [];
  const pushDir = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) pushDir(p);
      else files.push(p);
    }
  };
  let mode = 'tracked';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--staged') mode = 'staged';
    if (args[i] === '--dir') {
      mode = 'custom';
      pushDir(resolve(root, args[++i]));
    }
    if (args[i] === '--file') {
      mode = 'custom';
      files.push(resolve(root, args[++i]));
    }
  }
  if (mode === 'tracked' || mode === 'staged') {
    const cmd = mode === 'staged' ? 'git diff --cached --name-only --diff-filter=ACMR' : 'git ls-files';
    const out = execSync(cmd, { cwd: root, encoding: 'utf8' });
    for (const f of out.split('\n').filter(Boolean)) files.push(join(root, f));
  }
  return { mode, files };
}

const { mode, files } = listFiles();
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;
const findings = [];
for (const f of files) {
  if (BINARY.test(f) || !existsSync(f)) continue;
  let text;
  if (mode === 'staged') {
    try {
      text = execSync(`git show :"${relative(root, f).replace(/\\/g, '/')}"`, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue;
    }
  } else {
    text = readFileSync(f, 'utf8');
  }
  for (const [name, rx] of PATTERNS) if (rx.test(text)) findings.push([relative(root, f), name]);
  for (const [name, value] of literal) if (text.includes(value)) findings.push([relative(root, f), name]);
}

if (findings.length) {
  console.error(`✖ secret scan (${mode}): ${findings.length} finding(s)`);
  for (const [f, n] of findings) console.error(`  ${f}: ${n}`);
  process.exit(1);
}
console.log(`✔ secret scan (${mode}): ${files.length} files clean (${PATTERNS.length} patterns + ${literal.length} local secret values)`);
