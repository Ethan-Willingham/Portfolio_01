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
const requireComplete = process.argv.includes('--complete');
const reviewChecks = ['words', 'evidence', 'medium', 'cringe', 'guardrails', 'batch'];
const loggedAttempts = [];
const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;

function validateAsset(asset, label) {
  assert(typeof asset === 'string' && asset.startsWith('assets/slop/'), `${label}: asset must live in the project.`);
  assert(!asset.includes('..'), `${label}: asset paths must stay in the project.`);
  const file = join(root, asset);
  assert(existsSync(file) && statSync(file).isFile() && statSync(file).size > 1000, `${label}: missing image ${asset}`);
}

function timestamp(value, label) {
  assert(nonemptyString(value) && Number.isFinite(Date.parse(value)), `${label}: record a valid timestamp.`);
  return Date.parse(value);
}

function validateAttemptLog(work) {
  const generation = work.generation;
  if (!Object.hasOwn(generation, 'attemptLog')) return; // Earlier works predate per-attempt records.
  const log = generation.attemptLog;
  assert(Array.isArray(log) && log.length >= 1 && log.length <= 3, `${work.id}: keep one to three attempts.`);
  assert.equal(generation.attempts, log.length, `${work.id}: attempt count must match its log.`);
  assert(nonemptyString(work.originalPrompt), `${work.id}: retain the original prompt.`);
  log.forEach((attempt, index) => {
    const label = `${work.id} attempt ${index + 1}`;
    assert(attempt && typeof attempt === 'object' && !Array.isArray(attempt), `${label}: record an attempt object.`);
    assert.equal(attempt.number, index + 1, `${label}: attempt numbers must be sequential.`);
    assert(nonemptyString(attempt.prompt) && nonemptyString(attempt.change), `${label}: retain the prompt and change note.`);
    if (index === 0) assert.equal(attempt.prompt, work.originalPrompt, `${label}: the first prompt must match originalPrompt.`);
    assert(typeof attempt.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(attempt.sourceSha256), `${label}: retain the original image fingerprint.`);
    validateAsset(attempt.image, label);
    validateAsset(attempt.fallback, label);
    const recordedAt = timestamp(attempt.recordedAt, label);
    if (index > 0) assert(Date.parse(log[index - 1].review.reviewedAt) <= recordedAt, `${label}: the previous attempt must be reviewed before this image is recorded.`);
    let reviewedAt = null;
    if (attempt.review != null) {
      assert(typeof attempt.review === 'object' && !Array.isArray(attempt.review), `${label}: record a review object.`);
      for (const name of reviewChecks) {
        const check = attempt.review.checks?.[name];
        assert(typeof check?.pass === 'boolean' && nonemptyString(check.note), `${label}: ${name} needs a boolean result and nonempty note.`);
      }
      const allPassed = reviewChecks.every(name => attempt.review.checks[name].pass);
      assert.equal(attempt.decision, allPassed ? 'accepted' : 'rejected', `${label}: accept exactly when all six checks pass.`);
      reviewedAt = timestamp(attempt.review.reviewedAt, `${label} review`);
      assert(reviewedAt >= recordedAt, `${label}: review must follow the recorded image.`);
    } else {
      assert(!requireComplete && generation.status === 'reviewing' && index === log.length - 1, `${label}: only the latest attempt may await review during production.`);
      assert.equal(attempt.decision, 'pending', `${label}: an unreviewed attempt must remain pending.`);
    }
    loggedAttempts.push({ label, recordedAt, reviewedAt });
  });
  assert(Number.isInteger(generation.selectedAttempt) && generation.selectedAttempt >= 1 && generation.selectedAttempt <= log.length, `${work.id}: select an existing attempt.`);
  const selected = log[generation.selectedAttempt - 1];
  assert.equal(work.prompt, selected.prompt, `${work.id}: current prompt must match the selected attempt.`);
  assert.equal(generation.sourceSha256, selected.sourceSha256, `${work.id}: current fingerprint must match the selected attempt.`);
  if (generation.status === 'complete') assert.equal(selected.decision, 'accepted', `${work.id}: a complete work must select an accepted attempt.`);
}

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
if (requireComplete) assert.equal(complete.length, data.works.length, 'Every published work needs an actual image.');
for (const work of data.works) {
  const phrase = data.phrases.find(p => p.id === work.phraseId);
  assert(phrase, `Missing phrase for ${work.id}`);
  assert(data.styles.some(s => s.id === work.styleId), `Missing style for ${work.id}`);
  assert(work.prompt.includes(phrase.text), `Prompt does not preserve exact phrase for ${work.id}`);
  assert(work.generation.usage === null, 'Built-in image inference usage must remain unknown.');
  assert(work.generation.model === null, 'Do not invent the image model name.');
  validateAttemptLog(work);
  if (work.generation.status !== 'complete') continue;
  assert(work.width > 0 && work.height > 0, 'Image dimensions must be recorded.');
  assert(work.generation.attempts > 0, 'Complete works need a generation attempt.');
  assert(/^[0-9a-f]{64}$/.test(work.generation.sourceSha256), 'Keep the original image fingerprint.');
  for (const asset of [work.image, work.fallback]) {
    validateAsset(asset, work.id);
  }
  assert.equal(readFileSync(join(root, work.image)).toString('ascii', 8, 12), 'WEBP');
  const jpeg = readFileSync(join(root, work.fallback));
  assert(jpeg[0] === 255 && jpeg[1] === 216, 'Fallback must be JPEG.');
}
loggedAttempts.sort((a, b) => a.recordedAt - b.recordedAt);
for (let index = 1; index < loggedAttempts.length; index++) {
  const previous = loggedAttempts[index - 1];
  const next = loggedAttempts[index];
  assert(previous.reviewedAt !== null && previous.reviewedAt <= next.recordedAt, `${previous.label}: review must precede the next recorded attempt (${next.label}).`);
}
console.log(`Validated ${data.phrases.length} phrases, ${data.styles.length} styles, ${complete.length}/${data.works.length} generated works.`);
