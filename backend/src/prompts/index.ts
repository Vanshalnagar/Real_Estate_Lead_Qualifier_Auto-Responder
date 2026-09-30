import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The .md files are the single source of prompt text. n8n/build-workflows.mjs embeds the same
// files into the n8n workflow, and a unit test checks that the exported workflow is in sync.
const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(resolve(here, name), 'utf8').trim();

export const CLASSIFY_SYSTEM_PROMPT = load('classify.system.md');
export const REPLY_SYSTEM_PROMPT = load('reply.system.md');
