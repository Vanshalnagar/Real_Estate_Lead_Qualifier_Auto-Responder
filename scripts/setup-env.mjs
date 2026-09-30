#!/usr/bin/env node
/**
 * Creates .env, backend/.env and frontend/.env from their .env.example files (only if missing),
 * replacing every <random-N-chars> / password placeholder with a strong random value.
 * Provider keys can be supplied through the environment of this command, e.g.
 *   GROQ_API_KEY=… GEMINI_API_KEY=… MONGODB_URI=… node scripts/setup-env.mjs
 * Values are written to the git-ignored .env files only and never printed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rand = (n) => randomBytes(n * 2).toString('base64url').replace(/[-_]/g, '').slice(0, n);
const password = () => `Nx${rand(14)}7!`;

const PASS_FROM_ENV = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'MONGODB_URI', 'ADMIN_EMAIL', 'SHEETS_WEBAPP_URL'];

function fill(example, target) {
  if (existsSync(target)) {
    console.log(`kept existing ${target.replace(root, '.')}`);
    return;
  }
  let text = readFileSync(example, 'utf8');
  text = text.replace(/<random-(\d+)-chars>/g, (_, n) => rand(Number(n)));
  text = text.replace(/<random-or-meta-app-secret>/g, () => rand(40));
  text = text.replace(/<strong-password>|<StrongPassword1>/g, () => password());
  for (const key of PASS_FROM_ENV) {
    if (process.env[key]) text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${process.env[key]}`);
  }
  writeFileSync(target, text);
  const left = [...text.matchAll(/^([A-Z0-9_]+)=<[^>]+>$/gm)].map((m) => m[1]);
  console.log(`created ${target.replace(root, '.')}${left.length ? ` — still to fill: ${left.join(', ')}` : ''}`);
}

fill(resolve(root, '.env.example'), resolve(root, '.env'));
fill(resolve(root, 'backend/.env.example'), resolve(root, 'backend/.env'));
fill(resolve(root, 'frontend/.env.example'), resolve(root, 'frontend/.env'));
