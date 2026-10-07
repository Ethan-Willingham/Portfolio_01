#!/usr/bin/env node
// Keep every source attempt and its review before selecting a gallery image.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = key => {
  const index = args.indexOf(key);
  return index < 0 ? undefined : args[index + 1];
};
const id = opt('--id');
if (!/^\d{3}$/.test(id || '')) throw Error('Supply --id NNN.');
const file = join(root, 'js/slop-data.js');
const context = { window: {} };
runInNewContext(readFileSync(file, 'utf8'), context, { timeout: 1000 });
const data = context.window.SLOP_DATA;
let work = data.works.find(w => w.id === id);
if (args.includes('--source')) {
  const plan = JSON.parse(readFileSync(join(root, 'research/slop/third-group-plan.json'))).plan.find(w => w.id === id);
  if (!plan) throw Error('Work is not in the approved plan.');
  const request = JSON.parse(readFileSync(resolve(opt('--request'))));
  if (!work) {
    if (!data.phrases.some(p => p.id === plan.phraseId)) data.phrases.push({ id: plan.phraseId, text: plan.title });
    if (!data.styles.some(s => s.id === plan.styleId)) data.styles.push(plan.style);
    work = { id, phraseId: plan.phraseId, title: plan.title, styleId: plan.styleId, alt: '', image: null, fallback: null,
      width: 1024, height: 1024, prompt: plan.prompt, originalPrompt: plan.prompt,
      generation: { provider: 'OpenAI built-in image tool', model: null, status: 'reviewing', attempts: 0, usage: null, costUsd: null, attemptLog: [] } };
    data.works.push(work);
  }
  const number = work.generation.attempts + 1;
  if (number > 3) throw Error('Three-attempt limit reached.');
  if (number > 1 && !work.generation.attemptLog.at(-1)?.review) throw Error('Review the previous attempt before regenerating.');
  if (number === 1 && request.prompt !== plan.prompt) throw Error('First prompt must be verbatim.');
  const source = resolve(opt('--source'));
  const stamp = `${id}-${String(number).padStart(2, '0')}`;
  const image = `assets/slop/attempts/${stamp}.webp`, fallback = `assets/slop/attempts/${stamp}.jpg`;
  mkdirSync(join(root, 'assets/slop/attempts'), { recursive: true });
  if (existsSync(join(root, image)) || existsSync(join(root, fallback))) throw Error('Attempt already exists.');
  const dimensions = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', source], { encoding: 'utf8' });
  const width = Number(dimensions.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(dimensions.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!width || width !== height) throw Error('Expected a square image.');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '91', source, '--out', join(root, fallback)]);
  execFileSync('cwebp', ['-quiet', '-q', '86', source, '-o', join(root, image)]);
  const attempt = { number, prompt: request.prompt, change: request.change || 'First attempt, prompt used verbatim.', image, fallback,
    sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'), recordedAt: new Date().toISOString(), review: null, decision: 'pending' };
  if (request.referenceAttempt !== undefined) {
    if (!Number.isInteger(request.referenceAttempt) || request.referenceAttempt < 1 || request.referenceAttempt >= number) throw Error('Reference must identify an earlier attempt.');
    attempt.referenceAttempt = request.referenceAttempt;
  }
  work.generation.attemptLog.push(attempt);
  Object.assign(work.generation, { attempts: number, status: 'reviewing', sourceSha256: attempt.sourceSha256, recordedAt: attempt.recordedAt, selectedAttempt: number });
  Object.assign(work, { width, height, prompt: request.prompt, image: `assets/slop/${id}.webp`, fallback: `assets/slop/${id}.jpg` });
  copyFileSync(join(root, image), join(root, work.image));
  copyFileSync(join(root, fallback), join(root, work.fallback));
} else if (args.includes('--review')) {
  if (!work) throw Error('Import the attempt first.');
  const review = JSON.parse(readFileSync(resolve(opt('--review'))));
  const keys = ['words', 'evidence', 'medium', 'cringe', 'guardrails', 'batch'];
  if (!keys.every(k => typeof review.checks?.[k]?.pass === 'boolean' && review.checks[k].note)) throw Error('Record all six checks.');
  const attempt = work.generation.attemptLog.at(-1);
  if (attempt.review) throw Error('Attempt already reviewed.');
  attempt.review = { checks: review.checks, reviewedAt: new Date().toISOString() };
  attempt.decision = keys.every(k => review.checks[k].pass) ? 'accepted' : 'rejected';
  work.generation.status = attempt.decision === 'accepted' ? 'complete' : 'needs-review';
  work.alt = review.alt;
} else throw Error('Supply --source and --request, or --review.');
writeFileSync(file, '/* Slop: authored catalogue and recorded production data. */\nwindow.SLOP_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(JSON.stringify({ id, attempts: work.generation.attempts, status: work.generation.status }));
