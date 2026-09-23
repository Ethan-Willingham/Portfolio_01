import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { aggregateUsage, codexDeltas, collectUsage, localDay, mergeClaude, mergePoint, priceUsage } from './about-usage.mjs';

const registry = JSON.parse(readFileSync(new URL('./about-models.json', import.meta.url)));
const point = (timestamp, input, cached, output) => ({ timestamp, model: 'gpt-6-astra', cumulative: [input, cached, 0, output, 0] });
const stream = {};
mergePoint(stream, point('2026-09-12T12:00:00Z', 100, 80, 10));
mergePoint(stream, point('2026-09-12T12:00:01Z', 100, 80, 10));
mergePoint(stream, point('2026-09-12T12:00:02Z', 250, 180, 30));
assert.deepEqual(codexDeltas(stream).map(p => p.usage), [[100, 80, 0, 10, 0], [150, 100, 0, 20, 0]]);
// An overlapping export and a repeat import must not add another response.
mergePoint(stream, point('2026-09-12T12:00:02Z', 250, 180, 30));
assert.equal(codexDeltas(stream).length, 2);
mergePoint(stream, point('2026-09-12T12:00:03Z', 80, 40, 5));
assert.deepEqual(codexDeltas(stream).at(-1).usage, [80, 40, 0, 5, 0]);
const partial = {};
mergePoint(partial, { ...point('2026-09-12T12:00:02Z', 250, 180, 30), initial: [150, 100, 0, 20, 0] });
assert.deepEqual(codexDeltas(partial)[0].usage, [150, 100, 0, 20, 0]);
mergePoint(partial, point('2026-09-12T12:00:00Z', 100, 80, 10));
assert.equal(codexDeltas(partial).reduce((n, p) => n + p.usage[0] + p.usage[3], 0), 280);

const messages = {};
const claude = { timestamp: '2026-09-12T12:00:00Z', model: 'claude-opus-5', input: 2, cacheWrite: 10, cacheWrite1h: 10, cacheRead: 20, output: 1 };
mergeClaude(messages, 'message-one', claude);
mergeClaude(messages, 'message-one', { ...claude, request: 'request-one', output: 30 });
mergeClaude(messages, 'message-one', { ...claude, output: 10 });
assert.equal(Object.keys(messages).length, 1);
assert.equal(Object.values(messages)[0].output, 30);
assert.throws(() => mergeClaude(messages, 'message-one', { ...claude, request: 'different-request' }), /Conflicting request/);
assert.equal(localDay('2026-09-12T04:59:59Z'), '2026-09-11');
assert.equal(localDay('2026-09-12T05:00:00Z'), '2026-09-12');
const categories = { input: 200000, cacheRead: 100000, cacheWrite: 0, cacheWrite1h: 0, output: 1000 };
assert.equal(priceUsage(registry, 'gpt-6-astra', '2026-09-12', categories), 4.275);
assert.equal(priceUsage(registry, 'gpt-5.6-sol', '2026-08-20', categories), 2.145);
assert.equal(priceUsage(registry, 'gpt-5.6-sol', '2026-08-21', categories), 1.71);
assert.equal(priceUsage(registry, 'claude-opus-5', '2026-09-12', claude), 0.000145);
const daily = aggregateUsage({ codex: { a: stream }, claude: messages }, registry, '2026-07-22', '2026-09-23T00:00:00Z');
assert.equal(daily['2026-09-12'].totalTokens, 427);

// Exercise file parsing, copied parent metadata, child identity, durability and repeat imports.
const temp = mkdtempSync(join(tmpdir(), 'about-usage-test-'));
try {
  const parent = 'parent', child = 'child';
  const usage = { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110 };
  const record = (ordinal, type, payload) => JSON.stringify({ ordinal, timestamp: '2026-09-12T12:00:00Z', type, payload });
  writeFileSync(join(temp, 'child.jsonl'), [
    record(0, 'session_meta', { id: child, session_id: parent, subagent_history_start_ordinal: 3 }),
    record(1, 'session_meta', { id: parent }),
    record(2, 'event_msg', { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage } }),
    record(3, 'turn_context', { turn_id: 'turn', model: 'gpt-6-astra' }),
    record(4, 'event_msg', { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage } })
  ].join('\n'));
  const options = { registry, stats: { legacy: { through: '2026-07-22' }, methodology: {}, days: {} }, codexRoots: [temp], claudeRoots: [], privateFile: join(temp, 'ledger.json'), cutoff: '2026-09-23T00:00:00Z', write: true };
  const first = await collectUsage(options);
  assert.equal(first.days['2026-09-12'].totalTokens, 110);
  assert.deepEqual((await collectUsage(options)).days, first.days);
  assert.deepEqual((await collectUsage({ ...options, codexRoots: [] })).days, first.days);
  const exportFile = join(temp, 'import.json');
  writeFileSync(exportFile, JSON.stringify({ provider: 'openai', session_id: child, model: 'gpt-6-astra', timestamp: '2026-09-12T12:00:00Z', raw_cumulative: usage, raw_usage: usage,
    counters: { ...usage, uncached_input_tokens: 20, cache_write_input_tokens: 0 } }) + '\n');
  assert.deepEqual((await collectUsage({ ...options, imports: [exportFile, exportFile] })).days, first.days);
  assert.deepEqual((await collectUsage({ ...options, codexRoots: [], imports: [exportFile] })).days, first.days);
  await assert.rejects(collectUsage({ ...options, stats: { ...options.stats, methodology: { usageLedgerId: 'wrong-ledger' } } }), /Restore the private/);
  const stored = JSON.parse(readFileSync(options.privateFile));
  stored.claude.staleDuration = { ...claude, cacheWrite: 0, cacheWrite1h: 10, input: 0, cacheRead: 0, output: 1 };
  writeFileSync(options.privateFile, JSON.stringify(stored));
  const corrected = await collectUsage({ ...options, codexRoots: [] });
  assert.equal(corrected.evidence.cacheDurationInconsistencies, 1);
  assert.equal(corrected.days['2026-09-12'].models['claude-opus-5'].cacheWrite1h, 0);
  assert.equal(corrected.days['2026-09-12'].models['claude-opus-5'].cost, 0.000025);
  assert.throws(() => codexDeltas({ bad: { ...point('2026-09-12T12:00:00Z', 100, 80, 10), last: [80, 60, 0, 10, 0] } }), /Missing per-response/);
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log('About usage regression checks passed.');
