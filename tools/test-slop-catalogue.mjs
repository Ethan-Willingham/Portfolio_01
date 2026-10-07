#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
const source = readFileSync(join(root, 'js/slop-data.js'), 'utf8');
runInNewContext(source, context, { timeout: 1000 });
const data = context.window.SLOP_DATA;
for (const key of ['phrases', 'styles', 'works']) {
  assert(Array.isArray(data[key]), key + ' must be an array');
  assert.equal(new Set(data[key].map(x => x.id)).size, data[key].length, key + ' ids must be unique');
}
assert(data.phrases.length >= 100, 'The phrase bank must remain substantial.');
assert(data.styles.length >= 40, 'The catalogue must retain its range of directions.');
assert(!source.includes('\u2014'), 'No em dashes in published data.');
assert(!source.includes('/Users/'), 'Never publish local paths.');
assert(!source.includes('accountId'), 'Never publish account identifiers.');
const complete = data.works.filter(w => w.generation.status === 'complete');
if (process.argv.includes('--complete')) assert.equal(complete.length, data.works.length, 'Every published work needs an actual image.');
for (const work of data.works) {
  const phrase = data.phrases.find(p => p.id === work.phraseId);
  assert(phrase, `Missing phrase for ${work.id}`);
  assert(data.styles.some(s => s.id === work.styleId), `Missing style for ${work.id}`);
  assert(work.prompt.includes(phrase.text), `Prompt does not preserve exact phrase for ${work.id}`);
  assert(work.generation.usage === null, 'Built-in image inference usage must remain unknown.');
  assert(work.generation.model === null, 'Do not invent the image model name.');
  if (work.generation.status !== 'complete') continue;
  assert(work.width > 0 && work.height > 0, 'Image dimensions must be recorded.');
  assert(work.generation.attempts > 0, 'Complete works need a generation attempt.');
  assert(/^[0-9a-f]{64}$/.test(work.generation.sourceSha256), 'Keep the original image fingerprint.');
  for (const asset of [work.image, work.fallback]) {
    assert(asset?.startsWith('assets/slop/'), 'Asset must live in the project.');
    assert(!asset.includes('..'), 'Asset paths must stay in the project.');
    const file = join(root, asset);
    assert(existsSync(file) && statSync(file).size > 1000, `Missing image ${asset}`);
  }
  assert.equal(readFileSync(join(root, work.image)).toString('ascii', 8, 12), 'WEBP');
  const jpeg = readFileSync(join(root, work.fallback));
  assert(jpeg[0] === 255 && jpeg[1] === 216, 'Fallback must be JPEG.');
}
console.log(`Validated ${data.phrases.length} phrases, ${data.styles.length} styles, ${complete.length}/${data.works.length} generated works.`);
