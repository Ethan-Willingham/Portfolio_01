import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateProjects, buildProjectUsage, classifyTurn, makeRouter } from './build-project-usage.mjs';

const route = makeRouter([{ key: 'sluice', href: 'grand-motherload.html' }, { key: 'water-smoke-slime', href: 'water-smoke-slime.html' }, { key: 'kant', href: 'kant.html' }]);
const turn = { cwd: '/Users/example/Portfolio_01', paths: ['AGENTS.md'], writePaths: [] };
// Repository instructions mentioning the game are not task evidence.
assert.equal(classifyTurn({ ...turn, prompt: '# AGENTS.md\nThe Sluice game lives here' }, route).bucket, 'shared');
assert.equal(classifyTurn({ ...turn, paths: [], prompt: 'Please audit my game Sluice' }, route).project, 'sluice');
assert.equal(classifyTurn({ ...turn, paths: ['js/sluice/340-jello.js'] }, route).project, 'sluice');
// Comparing an existing page while writing Kant does not charge that comparison page.
assert.equal(classifyTurn({ ...turn, paths: ['grand-motherload.html'], writePaths: ['kant.html'] }, route).project, 'kant');
const shared = classifyTurn({ ...turn, paths: ['js/sluice/340-jello.js', 'js/water-smoke-slime.js'] }, route);
assert.deepEqual(shared.projects, ['sluice', 'water-smoke-slime']);
assert.equal(shared.bucket, 'shared');
assert.equal(classifyTurn({ ...turn, paths: [], prompt: 'Looks good' }, route).bucket, 'unassigned');
assert.equal(classifyTurn({ ...turn, paths: ['/Users/example/Documents/other.txt'] }, route).bucket, 'other');

const hash = s => createHash('sha256').update(s).digest('hex');
const old = { timestamp: '2026-07-22T12:00:00Z', model: 'old', input: 5, cacheWrite: 10, cacheRead: 80, output: 5 };
const point = { timestamp: '2026-09-12T12:00:00Z', model: 'new', cumulative: [200, 180, 0, 20, 10] };
const duplicate = { ...point, timestamp: '2026-09-12T12:00:01Z' };
const native = { claude: { old, shared: { ...old, output: 15 }, unknown: { ...old, output: 25 } }, codex: { session: { point, duplicate } } };
const assignments = { 'claude:old': { project: 'sluice' }, 'claude:shared': shared, ['codex:session:' + hash(point.timestamp + ':' + point.cumulative.join(','))]: { project: 'sluice' } };
const stats = { legacy: { through: '2026-07-22', tokens: 1000 }, days: { '2026-09-12': { totalTokens: 220 } } };
const r = aggregateProjects(native, assignments, stats, '2026-09-23T00:00:00Z');
assert.equal(r.total, 1220); // Historical recovery allocates the baseline, never adds to it.
assert.equal(r.posts.sluice.tokens, 320); // Cached input/reasoning and duplicate snapshots are not extra tokens.
assert.equal(r.recovered, 550);
assert.equal(r.historicalRecovered, 330);
assert.equal(r.buckets.missing, 670);
assert.equal(r.buckets.shared, 110);
assert.equal(r.buckets.unassigned, 120);
assert.equal(r.shared[0].tokens, 110); // Kept once, never assigned to both pages.
assert.equal(r.posts['water-smoke-slime'], undefined); // Missing is unknown, not a manufactured zero.
assert.equal(Object.values(r.posts).reduce((n,p) => n+p.tokens,0) + Object.values(r.buckets).reduce((n,v) => n+v,0), r.total);
// Exercise real transcript routing, child-history boundaries, repeated PC imports
// and persistence after both computers' source files have disappeared.
const temp = mkdtempSync(join(tmpdir(), 'project-usage-test-'));
try {
  for (const path of ['tools', 'js', 'private', 'logs']) mkdirSync(join(temp, path));
  const write = (file, value) => writeFileSync(join(temp, file), JSON.stringify(value));
  write('tools/about-stats.json', { ...stats, methodology: { usageLedgerId: hash('fixture') }, collection: { cutoff: '2026-09-23T00:00:00Z' } });
  write('tools/about-models.json', { models: {} });
  writeFileSync(join(temp, 'js/git-attribution-data.js'), 'window.GIT_ATTRIBUTION = ' + JSON.stringify({ posts: [{ key: 'sluice', href: 'grand-motherload.html' }, { key: 'kant', href: 'kant.html' }] }) + ';');
  write('private/native-ledger.json', { id: 'fixture', codex: { [hash('child')]: { point, duplicate } }, claude: { [hash('pc-message')]: old } });
  const record = (ordinal, type, payload) => JSON.stringify({ ordinal, timestamp: point.timestamp, type, payload });
  writeFileSync(join(temp, 'logs/child.jsonl'), [
    record(0, 'session_meta', { id: 'child', session_id: 'parent', cwd: turn.cwd, subagent_history_start_ordinal: 3 }),
    record(1, 'session_meta', { id: 'parent' }),
    record(2, 'event_msg', { type: 'item_completed', turn_id: 'parent-turn', item: { type: 'FileChange', status: 'completed', changes: { 'js/sluice/000-head.js': {} } } }),
    record(3, 'event_msg', { type: 'task_started', turn_id: 'child-turn' }),
    record(4, 'turn_context', { turn_id: 'child-turn', cwd: turn.cwd }),
    record(5, 'event_msg', { type: 'item_completed', turn_id: 'child-turn', item: { type: 'FileChange', status: 'completed', changes: { 'kant.html': {} } } }),
    record(6, 'event_msg', { type: 'token_count', info: { total_token_usage: { input_tokens: 200, cached_input_tokens: 180, output_tokens: 20, reasoning_output_tokens: 10 } } })
  ].join('\n'));
  const pcFile = join(temp, 'pc.jsonl');
  writeFileSync(pcFile, JSON.stringify({ provider: 'anthropic', message_id: 'pc-message', timestamp: old.timestamp, counters: { total_tokens: 100 }, classification: { project: 'sluice' } }));
  const opts = { repo: temp, directory: join(temp, 'private'), codexRoots: [join(temp, 'logs')], claudeRoots: [], imports: [pcFile, pcFile], write: true };
  const first = buildProjectUsage(opts);
  assert.equal(first.posts.kant.tokens, 220);
  assert.equal(first.posts.sluice.tokens, 100);
  assert.equal(first.buckets.shared, 0); // Copied parent edits were excluded.
  assert.deepEqual(buildProjectUsage({ ...opts, codexRoots: [], imports: [] }), first);
  rmSync(join(temp, 'private/project-ledger.json'));
  assert.throws(() => buildProjectUsage({ ...opts, codexRoots: [], imports: [] }), /Restore the private project ledger/);
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log('Project usage accounting and attribution checks passed.');
