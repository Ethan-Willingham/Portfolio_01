import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { aggregateUsage, collectUsage } from './about-usage.mjs';
import { collectPublishedUsage } from './about-usage-refresh.mjs';

const registry = JSON.parse(readFileSync(new URL('./about-models.json', import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), 'about-multimachine-'));
const counters = (input, output) => ({ input_tokens: input, cached_input_tokens: input / 2, output_tokens: output, total_tokens: input + output });
const row = (type, payload, timestamp) => ({ type, payload, timestamp });
const timestamp = '2026-10-21T12:00:00.000Z';
const cutoff = '2026-10-29T16:38:00.000Z';
const total = days => Object.values(days).reduce((n, d) => n + d.totalTokens, 0);
try {
  const canonicalDir = join(temp, 'canonical');
  const desktopDir = join(temp, 'desktop');
  mkdirSync(canonicalDir);
  mkdirSync(desktopDir);
  const oldUsage = counters(100, 10);
  const oldTime = '2026-10-19T12:00:00.000Z';
  writeFileSync(join(canonicalDir, 'old.jsonl'), [
    row('session_meta', { id: 'old' }, oldTime),
    row('turn_context', { turn_id: 'old-turn', model: 'gpt-6-astra' }, oldTime),
    row('event_msg', { type: 'token_count', info: { total_token_usage: oldUsage, last_token_usage: oldUsage } }, oldTime)
  ].map(JSON.stringify).join('\n'));
  const privateFile = join(temp, 'canonical.json');
  const baseStats = { legacy: { through: '2026-07-22' }, methodology: {}, days: {} };
  const first = await collectUsage({ registry, stats: baseStats, privateFile, codexRoots: [canonicalDir], claudeRoots: [], write: true, cutoff: '2026-10-20T14:16:22.733Z' });
  const stats = { ...baseStats, days: first.days, retainedDays: first.retainedDays, collection: first.evidence, methodology: { usageLedgerId: first.evidence.ledgerId } };
  const records = [
    row('session_meta', { id: 'desktop', subagent_history_start_ordinal: 2 }, timestamp),
    row('token_usage_record', { thread_id: 'copied-parent', response_id: 'inherited', usage: counters(500, 50) }, timestamp),
    row('turn_context', { turn_id: 'turn', model: 'gpt-6-astra' }, timestamp)
  ];
  for (let i = 1; i <= 3; i++) {
    records.push(row('token_usage_record', { thread_id: 'desktop', turn_id: 'turn', response_id: `response-${i}`, usage: oldUsage, thread_token_usage: counters(i * 100, i * 10) }, timestamp));
    // One cumulative notification is missing. Others trail the native record by a minute.
    if (i !== 2) records.push(row('event_msg', { type: 'token_count', info: { total_token_usage: counters((i === 3 ? 2 : i) * 100, (i === 3 ? 2 : i) * 10), last_token_usage: oldUsage } }, '2026-10-21T12:01:00.000Z'));
  }
  records.push(row('event_msg', { type: 'token_count', info: { total_token_usage: counters(200, 20), last_token_usage: counters(0, 0) } }, '2026-10-21T12:02:00.000Z'));
  records.push(records[3]); // Repeated native response must count once.
  writeFileSync(join(desktopDir, 'new.jsonl'), records.map(JSON.stringify).join('\n'));
  const localPrivateFile = join(temp, 'desktop-ledger.json');
  const localExportFile = join(temp, 'desktop-export.json');
  const options = { registry, stats, cutoff, privateFile: join(temp, 'absent-master.json'), localPrivateFile, localExportFile, codexRoots: [desktopDir], claudeRoots: [], write: true };
  const desktop = await collectPublishedUsage(options);
  assert.equal(desktop.supplement.totalTokens, 330);
  assert.equal(total(desktop.days), 440);
  assert.equal(desktop.evidence.ledgerId, first.evidence.ledgerId);
  const withSupplement = { ...stats, ...desktop, collection: desktop.evidence };
  const repeated = await collectPublishedUsage({ ...options, stats: withSupplement });
  assert.deepEqual(repeated.days, desktop.days);
  assert.equal(repeated.supplement.reportHash, desktop.supplement.reportHash);
  await assert.rejects(collectPublishedUsage({ ...options, stats: withSupplement, localPrivateFile: join(temp, 'lost-local.json') }), /Restore the private desktop/);
  await assert.rejects(collectPublishedUsage({ ...options, stats: withSupplement, privateFile }), /Import the exact private desktop/);
  await assert.rejects(collectPublishedUsage({ ...options, stats: withSupplement, privateFile, ledgerImports: [privateFile] }), /Import the exact private desktop/);
  // Laptop absorbs the report even when the same desktop logs have been copied there.
  const absorbed = await collectPublishedUsage({ ...options, stats: withSupplement, privateFile, codexRoots: [canonicalDir, desktopDir], ledgerImports: [desktop.localReportPath] });
  assert.equal(total(absorbed.days), 440);
  assert.equal(absorbed.supplement, undefined);
  assert.equal(absorbed.nativeDays, undefined);
  const stored = JSON.parse(readFileSync(privateFile));
  const native = Object.values(stored.responses);
  delete stored.responses[Object.keys(stored.responses)[1]];
  assert.throws(() => aggregateUsage(stored, registry, '2026-07-22', cutoff), /Partial native response coverage/);
  assert.equal(native.length, 3);
  console.log('About multi-computer and native-response regression checks passed.');
} finally {
  if (!resolve(temp).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test cleanup path');
  rmSync(temp, { recursive: true, force: true });
}
