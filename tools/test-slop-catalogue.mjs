#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
const source = readFileSync(join(root, 'js/slop-data.js'), 'utf8');
runInNewContext(source, context, { timeout: 1000 });
const data = context.window.SLOP_DATA;
const requireComplete = process.argv.includes('--complete');
const reviewChecks = ['words', 'evidence', 'medium', 'cringe', 'guardrails', 'batch'];
const loggedAttempts = [];
const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;
const demonstrationPrompts = {
  '096': 'A photo of my grandmother.',
  '097': 'A portrait of an artist at work.',
  '098': 'The most beautiful painting in the world.',
  '099': 'Make an image of something no one has ever seen before.'
};

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

function validateDeletion(record, fields, label, recordedAt) {
  for (const field of fields) assert.equal(record[field], null, `${label}: clear every deleted asset path.`);
  assert(nonemptyString(record.deletionReason), `${label}: retain the owner's reason for deleting the assets.`);
  assert(timestamp(record.deletedAt, `${label} deletion`) >= recordedAt, `${label}: deletion must follow production.`);
}

function validateReview(record, label, recordedAt, { allowPending = false, observational = false } = {}) {
  if (record.review == null) {
    assert(!requireComplete && allowPending, `${label}: only the latest image may await review during production.`);
    assert.equal(record.decision, 'pending', `${label}: an unreviewed image must remain pending.`);
    return null;
  }
  assert(typeof record.review === 'object' && !Array.isArray(record.review), `${label}: record a review object.`);
  for (const name of reviewChecks) {
    const check = record.review.checks?.[name];
    assert(typeof check?.pass === 'boolean' && nonemptyString(check.note), `${label}: ${name} needs a boolean result and nonempty note.`);
  }
  const allPassed = reviewChecks.every(name => record.review.checks[name].pass);
  assert.equal(record.decision, observational ? 'recorded' : allPassed ? 'accepted' : 'rejected', `${label}: keep the decision consistent with its review type.`);
  const reviewedAt = timestamp(record.review.reviewedAt, `${label} review`);
  assert(reviewedAt >= recordedAt, `${label}: review must follow the recorded image.`);
  return reviewedAt;
}

function validatePlanned(work) {
  assert.equal(work.generation.attempts, 0, `${work.id}: planned works cannot contain image calls.`);
  assert.equal(work.image, null, `${work.id}: a planned work has no gallery image.`);
  assert.equal(work.fallback, null, `${work.id}: a planned work has no fallback image.`);
  assert(work.generation.selectedAttempt == null && work.generation.sourceSha256 == null, `${work.id}: a planned work cannot select an image.`);
  assert.equal(work.prompt, work.originalPrompt, `${work.id}: keep the planned prompt unchanged.`);
}

function validateSource(asset, expectedHash, label) {
  validateAsset(asset, label);
  assert(/^[0-9a-f]{64}$/.test(expectedHash || ''), `${label}: retain a SHA-256 fingerprint.`);
  assert.equal(createHash('sha256').update(readFileSync(join(root, asset))).digest('hex'), expectedHash, `${label}: preserved source bytes do not match their fingerprint.`);
}

function validateDemonstration(work) {
  const generation = work.generation;
  assert(Object.hasOwn(demonstrationPrompts, work.id) && work.styleId === 'demo-grid', `${work.id}: only the four approved demonstrations use source runs.`);
  assert.equal(generation.expectedRuns, 9, `${work.id}: record exactly nine unedited calls.`);
  assert.equal(work.originalPrompt, demonstrationPrompts[work.id], `${work.id}: keep the exact bare demonstration prompt.`);
  assert.equal(work.prompt, work.originalPrompt, `${work.id}: a demonstration prompt cannot be revised.`);
  assert(!Object.hasOwn(generation, 'attemptLog') && !Object.hasOwn(generation, 'selectedAttempt'), `${work.id}: demonstrations retain every source instead of selecting a retry.`);
  assert(!generation.revisions?.length, `${work.id}: demonstration sources cannot be rerolled under a revision.`);
  const runs = generation.sourceRuns;
  assert(Array.isArray(runs) && runs.length <= 9, `${work.id}: keep at most nine source calls.`);
  assert.equal(generation.attempts, runs.length, `${work.id}: count each actual source call once.`);
  if (generation.status === 'planned') {
    validatePlanned(work);
    assert(generation.assembly == null, `${work.id}: planned sources cannot have an assembly.`);
    return;
  }
  assert(['reviewing', 'complete', 'retired'].includes(generation.status) && runs.length > 0, `${work.id}: demonstration results are observations, not failed retries.`);
  runs.forEach((run, index) => {
    const label = `${work.id} source ${index + 1}`;
    assert.equal(run.number, index + 1, `${label}: preserve generation order.`);
    assert.equal(run.prompt, work.originalPrompt, `${label}: do not add to or steer the prompt.`);
    assert(nonemptyString(run.change), `${label}: describe the unchanged source call.`);
    assert(!run.legacy && !run.revisionId && !run.referenceAttempt, `${label}: each source must be an independent unedited observation.`);
    assert(run.width > 0 && run.height > 0, `${label}: preserve the actual source dimensions.`);
    assert.equal(run.provider, 'OpenAI built-in image tool', `${label}: retain the actual provider.`);
    assert(run.model === null && run.usage === null && run.costUsd === null, `${label}: unreported generation measurements must remain unknown.`);
    const recordedAt = timestamp(run.recordedAt, label);
    if (run.deletedAt) {
      assert.equal(generation.status, 'retired', `${label}: active demonstrations need every source.`);
      validateDeletion(run, ['source', 'image', 'fallback'], label, recordedAt);
      assert(/^[0-9a-f]{64}$/.test(run.sourceSha256), `${label}: retain the deleted source fingerprint.`);
    } else {
      validateAsset(run.image, label);
      validateAsset(run.fallback, label);
      validateSource(run.source, run.sourceSha256, label);
    }
    const reviewedAt = validateReview(run, label, recordedAt, { observational: true, allowPending: generation.status === 'reviewing' && index === runs.length - 1 });
    loggedAttempts.push({ label, recordedAt, reviewedAt });
  });
  if (generation.status === 'reviewing') {
    assert(work.image === null && work.fallback === null && generation.assembly == null, `${work.id}: assemble only after all nine source reviews.`);
    return;
  }
  assert.equal(runs.length, 9, `${work.id}: complete grids need all nine source images.`);
  assert(runs.every(run => run.review && run.decision === 'recorded'), `${work.id}: review all sources before assembly.`);
  const assembly = generation.assembly;
  assert(assembly?.method === 'code' && assembly.columns === 3 && assembly.rows === 3, `${work.id}: record a code-made 3 by 3 grid.`);
  assert.equal(assembly.fit, 'contain', `${work.id}: keep each whole source image without cropping.`);
  assert.equal(assembly.caption, work.title, `${work.id}: code must add the exact title as its caption.`);
  assert(Array.isArray(assembly.sourceRunNumbers) && assembly.sourceRunNumbers.length === 9 && assembly.sourceRunNumbers.every((value, index) => value === index + 1), `${work.id}: assemble all sources in generation order.`);
  assert(timestamp(assembly.recordedAt, `${work.id} assembly`) >= Date.parse(runs.at(-1).review.reviewedAt), `${work.id}: assemble after the final source review.`);
  if (assembly.deletedAt) {
    assert.equal(generation.status, 'retired', `${work.id}: an active grid needs its assembly source.`);
    validateDeletion(assembly, ['source'], `${work.id} assembly`, Date.parse(assembly.recordedAt));
    assert(/^[0-9a-f]{64}$/.test(assembly.sourceSha256), `${work.id}: retain the deleted assembly fingerprint.`);
  } else {
    validateSource(assembly.source, assembly.sourceSha256, `${work.id} assembly`);
    assert.equal(readFileSync(join(root, assembly.source)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${work.id}: preserve the code-made source PNG.`);
  }
  assert.equal(generation.sourceSha256, assembly.sourceSha256, `${work.id}: identify the composition as the gallery source.`);
}

function validateAttemptLog(work) {
  const generation = work.generation;
  if (!Object.hasOwn(generation, 'attemptLog')) {
    assert(!generation.revisions?.length, `${work.id}: a revised work needs a lifetime attempt log.`);
    assert(['complete', 'retired'].includes(generation.status) && Number(work.id) <= 34, `${work.id}: new works need an attempt log.`);
    return; // Earlier works predate per-attempt records.
  }
  const log = generation.attemptLog;
  assert(Array.isArray(log), `${work.id}: retain an attempt log.`);
  assert.equal(generation.attempts, log.length, `${work.id}: attempt count must match its log.`);
  assert(nonemptyString(work.originalPrompt), `${work.id}: retain the original prompt.`);
  if (generation.status === 'planned') {
    validatePlanned(work);
    return;
  }
  assert(log.length >= 1, `${work.id}: retain every recorded attempt.`);
  const revisions = generation.revisions ?? [];
  assert(Array.isArray(revisions), `${work.id}: revisions must be an array.`);
  const revisionTimes = new Map();
  for (const revision of revisions) {
    assert(nonemptyString(revision?.id) && nonemptyString(revision.reason), `${work.id}: retain each revision's id and reason.`);
    assert(!revisionTimes.has(revision.id), `${work.id}: revision ids must be unique.`);
    const requestedAt = timestamp(revision.requestedAt, `${work.id} revision ${revision.id}`);
    const previous = [...revisionTimes.values()].at(-1);
    assert(previous === undefined || requestedAt >= previous, `${work.id}: revisions must remain in request order.`);
    revisionTimes.set(revision.id, requestedAt);
  }
  const runCounts = new Map();
  const closedRuns = new Set();
  let previousRun;
  log.forEach((attempt, index) => {
    const label = `${work.id} attempt ${index + 1}`;
    assert(attempt && typeof attempt === 'object' && !Array.isArray(attempt), `${label}: record an attempt object.`);
    assert.equal(attempt.number, index + 1, `${label}: attempt numbers must be sequential.`);
    const run = Object.hasOwn(attempt, 'revisionId') ? attempt.revisionId : null;
    if (run !== null) assert(nonemptyString(run) && revisionTimes.has(run), `${label}: use a registered revision id.`);
    else assert(!Object.hasOwn(attempt, 'revisionId'), `${label}: omit revisionId for the initial run.`);
    if (index === 0) assert.equal(run, null, `${label}: retain the original run before its revisions.`);
    if (index > 0 && run !== previousRun) closedRuns.add(previousRun);
    assert(!closedRuns.has(run), `${label}: a finished revision run cannot resume later in the log.`);
    previousRun = run;
    runCounts.set(run, (runCounts.get(run) || 0) + 1);
    assert(runCounts.get(run) <= 3, `${label}: keep at most three attempts per revision run, including the initial run.`);
    assert(nonemptyString(attempt.prompt) && nonemptyString(attempt.change), `${label}: retain the prompt and change note.`);
    if (index === 0) assert.equal(attempt.prompt, work.originalPrompt, `${label}: the first prompt must match originalPrompt.`);
    assert(typeof attempt.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(attempt.sourceSha256), `${label}: retain the original image fingerprint.`);
    const recordedAt = timestamp(attempt.recordedAt, label);
    if (attempt.image === null && attempt.fallback === null) {
      assert(attempt.ownerDecision === 'rejected' || generation.status === 'retired' || attempt.number !== generation.selectedAttempt, `${label}: keep the selected image of an active work.`);
      validateDeletion(attempt, ['image', 'fallback'], label, recordedAt);
    } else {
      assert(!Object.hasOwn(attempt, 'deletedAt'), `${label}: remove both asset paths when recording deletion.`);
      validateAsset(attempt.image, label);
      validateAsset(attempt.fallback, label);
    }
    if (run !== null) assert(recordedAt >= revisionTimes.get(run), `${label}: record the revision request before its image.`);
    if (index > 0 && !log[index - 1].legacy && !attempt.legacy) {
      assert(log[index - 1].review && Date.parse(log[index - 1].review.reviewedAt) <= recordedAt, `${label}: the previous attempt must be reviewed before this image is recorded.`);
    }
    let reviewedAt = null;
    if (attempt.legacy === true) {
      assert(index === 0 && run === null, `${label}: only an original image may use the legacy review exception.`);
      assert.equal(attempt.review, null, `${label}: do not invent a review for a legacy image.`);
      assert.equal(attempt.decision, 'superseded', `${label}: retain the owner's rejection of the legacy image.`);
      assert(nonemptyString(attempt.note), `${label}: explain why the legacy review is unavailable.`);
    } else {
      reviewedAt = validateReview(attempt, label, recordedAt, { allowPending: generation.status === 'reviewing' && index === log.length - 1 });
    }
    if (!attempt.legacy) loggedAttempts.push({ label, recordedAt, reviewedAt });
  });
  assert(Number.isInteger(generation.selectedAttempt) && generation.selectedAttempt >= 1 && generation.selectedAttempt <= log.length, `${work.id}: select an existing attempt.`);
  const selected = log[generation.selectedAttempt - 1];
  assert.equal(work.prompt, selected.prompt, `${work.id}: current prompt must match the selected attempt.`);
  assert.equal(generation.sourceSha256, selected.sourceSha256, `${work.id}: current fingerprint must match the selected attempt.`);
  if (generation.status === 'failed') {
    const failedRun = log.filter(attempt => (attempt.revisionId || null) === (selected.revisionId || null));
    assert(failedRun.length === 3 && failedRun.every(attempt => attempt.decision === 'rejected'), `${work.id}: failed works must retain three reviewed failures in their final run.`);
    assert.equal(generation.selectedAttempt, log.length, `${work.id}: retain the last failed image as the record.`);
  }
  if (generation.status === 'complete') {
    assert(selected.ownerDecision !== 'rejected' && selected.image && selected.fallback, `${work.id}: an active work cannot select an owner-rejected or deleted image.`);
    const pendingLegacyRevision = !requireComplete && selected.legacy === true && revisions.length > 0;
    assert(selected.decision === 'accepted' || pendingLegacyRevision, `${work.id}: a complete work must select an accepted attempt.`);
    if (requireComplete && revisions.length) assert.equal(selected.revisionId, revisions.at(-1).id, `${work.id}: finish the latest requested revision before publication.`);
  }
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
const retired = data.works.filter(w => w.generation.status === 'retired');
const failed = data.works.filter(w => w.generation.status === 'failed');
const planned = data.works.filter(w => w.generation.status === 'planned');
const reviewing = data.works.filter(w => ['reviewing', 'needs-review'].includes(w.generation.status));
if (requireComplete) assert.equal(complete.length + retired.length + failed.length, data.works.length, 'Every finished record must be complete, retired or an honestly recorded failure.');
for (const work of data.works) {
  const phrase = data.phrases.find(p => p.id === work.phraseId);
  assert(phrase, `Missing phrase for ${work.id}`);
  assert(data.styles.some(s => s.id === work.styleId), `Missing style for ${work.id}`);
  assert(nonemptyString(work.prompt), `${work.id}: retain the exact prompt.`);
  assert(['planned', 'reviewing', 'needs-review', 'failed', 'complete', 'retired'].includes(work.generation.status), `${work.id}: use a recorded production status.`);
  const demonstration = work.generation.kind === 'demonstration-grid';
  if (Object.hasOwn(demonstrationPrompts, work.id)) assert(demonstration, `${work.id}: preserve the demonstration record format.`);
  if (!demonstration) assert(work.prompt.includes(phrase.text), `Prompt does not preserve exact phrase for ${work.id}`);
  assert(work.generation.usage === null, 'Built-in image inference usage must remain unknown.');
  assert(work.generation.model === null, 'Do not invent the image model name.');
  if (demonstration) validateDemonstration(work);
  else validateAttemptLog(work);
  if (work.generation.status === 'retired') {
    assert(nonemptyString(work.retirement?.reason), `${work.id}: retain the reason for retirement.`);
    timestamp(work.retirement.retiredAt, `${work.id} retirement`);
  }
  if (work.generation.status === 'planned' || (demonstration && work.generation.status === 'reviewing')) continue;
  assert(work.width > 0 && work.height > 0, 'Image dimensions must be recorded.');
  assert(work.generation.attempts > 0, 'Generated works need recorded image calls.');
  assert(/^[0-9a-f]{64}$/.test(work.generation.sourceSha256), 'Keep the original image fingerprint.');
  if (work.deletedAt) {
    assert.equal(work.generation.status, 'retired', `${work.id}: only retired gallery images can be removed.`);
    validateDeletion(work, ['image', 'fallback'], work.id, Date.parse(work.generation.recordedAt));
    continue;
  }
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
const generated = data.works.filter(work => work.image && work.generation.attempts > 0);
console.log(`Validated ${data.phrases.length} phrases, ${data.styles.length} styles, ${generated.length} works with images: ${complete.length} on view, ${retired.length} retired, ${failed.length} failed, ${planned.length} planned, ${reviewing.length} under review.`);
