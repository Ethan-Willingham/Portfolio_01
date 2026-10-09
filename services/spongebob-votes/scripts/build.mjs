import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const ids = JSON.parse(await readFile(resolve(root, 'roster.json'), 'utf8'));
assert(ids.length >= 2, 'Sync the researched roster before building.');
assert(ids.every(id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 100));
assert.equal(new Set(ids).size, ids.length, 'Roster IDs must be unique.');
const source = await readFile(resolve(root, 'worker/index.js'), 'utf8');
assert(source.includes('/* SITES_ROSTER_IDS */ []'));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await writeFile(resolve(root, 'dist/server/index.js'), source.replace('/* SITES_ROSTER_IDS */ []', JSON.stringify(ids)));
await cp(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
await cp(resolve(root, 'drizzle'), resolve(root, 'dist/.openai/drizzle'), { recursive: true });
console.log(`Built voting Worker for ${ids.length} characters.`);
