// Copies the prompt markdown files next to the compiled output (tsc does not copy non-TS files).
import { cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
cpSync(resolve(here, '../src/prompts'), resolve(here, '../dist/prompts'), {
  recursive: true,
  filter: (src) => !src.endsWith('.ts'),
});
console.log('prompts copied to dist/prompts');
