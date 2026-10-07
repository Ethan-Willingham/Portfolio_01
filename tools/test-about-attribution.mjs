import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'about-attribution-regression-'));
const model = 'gpt-6.1-sol';
const session = 'test-published-page-builder';
const sessionKey = 'codex:' + createHash('sha256').update(session).digest('hex').slice(0, 16);
const credit = { edits: 19, tokens: 33759, first: '2026-10-06', last: '2026-10-07' };
const json = (path, data) => writeFileSync(path, JSON.stringify(data));
const data = (path, name, value) => writeFileSync(path, 'window.' + name + ' = ' + JSON.stringify(value) + ';\n');
const readData = path => JSON.parse(readFileSync(path, 'utf8').match(/=\s*(\{[\s\S]*\});?\s*$/m)[1]);

try {
  mkdirSync(join(root, 'tools'));
  mkdirSync(join(root, 'js'));
  mkdirSync(join(root, '.codex/sessions'), { recursive: true });
  writeFileSync(join(root, 'tools/about-models.json'), readFileSync(join(tools, 'about-models.json')));
  data(join(root, 'js/git-history-data.js'), 'GIT_HISTORY', {
    topics: [{ key: 'removed-demo', label: 'Removed demo', kind: 'removed', href: null, historicalHref: 'removed-demo.html' }],
    commits: [['test-history', 1791320400, 1, 0, 1, 0, 'Recorded build']]
  });
  const seed = () => {
    json(join(root, 'tools/about-attribution-ledger.json'), {
      version: 2, residualsInitialized: '2026-07-23', residuals: {},
      sessions: { [sessionKey]: { provider: 'codex', models: { [model]: { 'removed-demo': credit } } } }
    });
    data(join(root, 'js/git-attribution-data.js'), 'GIT_ATTRIBUTION', {
      window: '2026-05-21 to 2026-10-07',
      models: [{ id: model, tokens: 0, cost: 0, edits: 19, posts: 1 }],
      posts: [{ key: 'removed-demo', label: 'Removed demo', kind: 'post', href: 'removed-demo.html',
        ...credit, words: 15, models: { [model]: { edits: 19, tokens: 33759 } } }]
    });
  };
  const rows = [
    { type: 'session_meta', payload: { id: session } },
    { type: 'turn_context', payload: { turn_id: 'test-turn', model } },
    { type: 'event_msg', payload: { type: 'task_started', turn_id: 'test-turn' } },
    ...Array.from({ length: 21 }, (_, i) => ({ type: 'event_msg', payload: {
      type: 'patch_apply_end', success: true, call_id: 'test-edit-' + i,
      changes: { '/fixture/removed-demo.html': {} }
    } })),
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { output_tokens: 40000 } } } }
  ].map(row => ({ timestamp: '2026-10-07T00:00:00.000Z', ...row }));
  writeFileSync(join(root, '.codex/sessions/test.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const run = explicit => {
    execFileSync(process.execPath, [join(tools, 'build-attribution.mjs'), '--write',
      ...(explicit ? ['--exclude-session=' + session] : [])], {
      cwd: root, encoding: 'utf8', env: { ...process.env, ATTR_NEW_JSON: '{}',
        ABOUT_ATTRIBUTION_TRANSCRIPT_ROOT: root, ABOUT_USAGE_CUTOFF: '2026-10-08T00:00:00.000Z',
        CODEX_THREAD_ID: explicit ? '' : session }
    });
    const post = readData(join(root, 'js/git-attribution-data.js')).posts[0];
    assert.equal(post.kind, 'removed');
    assert.equal(post.href, null);
    assert.equal(post.historicalHref, 'removed-demo.html');
    assert.deepEqual(post.models[model], { edits: 19, tokens: 33759 });
    assert.equal(post.edits, Object.values(post.models).reduce((n, row) => n + row.edits, 0));
    assert.equal(post.tokens, Object.values(post.models).reduce((n, row) => n + row.tokens, 0));
    const ledger = JSON.parse(readFileSync(join(root, 'tools/about-attribution-ledger.json')));
    assert.deepEqual(ledger.sessions[sessionKey].models[model]['removed-demo'], credit);
  };
  seed();
  run(false);
  run(false);
  seed();
  run(true);
  run(true);
  console.log('About attribution regression passed: removed card retains 19 edits and 33,759 tokens through repeated excluded-session refreshes.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
