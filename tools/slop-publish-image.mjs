#!/usr/bin/env node
// Import one generated work without changing its composition or lettering.
// Requires macOS sips and cwebp. The original remains at the tool's saved path.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
}
const id = option('--id');
const source = option('--source');
if (!id || !source) throw new Error('Usage: node tools/slop-publish-image.mjs --id 001 --source /absolute/generated.png');
const dataPath = join(root, 'js/slop-data.js');
const context = { window: {} };
runInNewContext(readFileSync(dataPath, 'utf8'), context, { timeout: 1000 });
const data = context.window.SLOP_DATA;
const work = data.works.find(w => w.id === id);
if (!work) throw new Error(`Unknown work: ${id}`);
if (work.generation.status === 'complete') throw new Error(`Work ${id} is already imported; use a new id for another version.`);
const folder = join(root, 'assets/slop');
mkdirSync(folder, { recursive: true });
const jpg = join(folder, id + '.jpg');
const webp = join(folder, id + '.webp');
if (existsSync(jpg) || existsSync(webp)) throw new Error(`Output for ${id} already exists.`);
function run(bin, commandArgs) {
  const result = spawnSync(bin, commandArgs, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
const dimensions = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', source]);
const width = Number(dimensions.match(/pixelWidth:\s*(\d+)/)?.[1]);
const height = Number(dimensions.match(/pixelHeight:\s*(\d+)/)?.[1]);
if (!(width > 0 && height > 0)) throw new Error('Could not read generated image dimensions.');
run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '91', source, '--out', jpg]);
run('cwebp', ['-quiet', '-q', '86', source, '-o', webp]);
work.image = `assets/slop/${id}.webp`;
work.fallback = `assets/slop/${id}.jpg`;
work.width = width;
work.height = height;
Object.assign(work.generation, {
  provider: 'OpenAI built-in image tool',
  model: null,
  status: 'complete',
  attempts: (work.generation.attempts || 0) + 1,
  usage: null,
  costUsd: null,
  createdAt: null,
  recordedAt: option('--observed-at') || new Date().toISOString(),
  sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  note: 'Generated separately from the saved prompt. Model name, inference tokens and price are not reported by the tool.'
});
writeFileSync(dataPath, '/* Slop: authored catalogue and recorded production data. */\nwindow.SLOP_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(JSON.stringify({ id, title: work.title, width, height, image: work.image, fallback: work.fallback }));
