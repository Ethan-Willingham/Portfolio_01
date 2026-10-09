import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const source = (await readFile(new URL('../worker/index.js', import.meta.url), 'utf8'))
  .replace('/* SITES_ROSTER_IDS */ []', JSON.stringify(['spongebob-squarepants', 'patrick-star', 'sandy-cheeks']));
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const schema = await readFile(new URL('../drizzle/0000_matchup_votes.sql', import.meta.url), 'utf8');
const origin = 'https://ethanwillingham.com';
const pair = ['spongebob-squarepants', 'patrick-star'];
const voterOne = 'a4cfa85b-7e36-468b-9594-01b1bdb90001';
const voterTwo = 'a4cfa85b-7e36-468b-9594-01b1bdb90002';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          // D1's numbered SQL bindings map to SQLite's named ?1 parameters.
          const bindings = Object.fromEntries(values.map((value, index) => ['?' + (index + 1), value]));
          const statement = sqlite.prepare(sql);
          return {
            sql,
            values,
            first: async () => statement.get(bindings),
            run: () => /^\s*SELECT/i.test(sql)
              ? { results: statement.all(bindings), meta: { changes: 0 } }
              : { results: [], meta: statement.run(bindings) }
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    withSession: () => DB
  };
  return { DB, sqlite };
}

function voteRequest(body, requestOrigin = origin) {
  return new Request('https://votes.example/v1/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(requestOrigin ? { Origin: requestOrigin } : {}) },
    body: JSON.stringify(body)
  });
}

async function vote(env, winner, voterId = voterOne, selectedPair = pair) {
  const response = await worker.fetch(voteRequest({ pair: selectedPair, winner, voterId }), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('real SQLite counts, unordered pair, first vote sticks, reload identifies visitor', async () => {
  const env = database();
  try {
    const empty = await worker.fetch(new Request(`https://votes.example/v1/votes?a=${pair[0]}&b=${pair[1]}&voterId=${voterOne}`), env);
    assert.equal((await empty.json()).total, 0);
    const first = await vote(env, 'patrick-star');
    assert.equal(first.total, 1);
    assert.equal(first.percentages['patrick-star'], 100);
    assert.equal(first.accepted, true);
    const duplicate = await vote(env, 'spongebob-squarepants', voterOne, pair.slice().reverse());
    assert.equal(duplicate.total, 1);
    assert.equal(duplicate.winner, 'patrick-star');
    assert.equal(duplicate.accepted, false);
    const second = await vote(env, 'spongebob-squarepants', voterTwo);
    assert.equal(second.total, 2);
    assert.deepEqual(second.percentages, { 'patrick-star': 50, 'spongebob-squarepants': 50 });
    const reload = await worker.fetch(new Request(`https://votes.example/v1/votes?a=${pair[0]}&b=${pair[1]}&voterId=${voterOne}`), env);
    const reloaded = await reload.json();
    assert.equal(reloaded.winner, 'patrick-star');
    assert.equal(reloaded.total, 2);
    const otherPair = await vote(env, 'sandy-cheeks', voterOne, ['sandy-cheeks', 'patrick-star']);
    assert.equal(otherPair.total, 1);
    assert.equal(otherPair.percentages['sandy-cheeks'], 100);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS total FROM matchup_votes').get().total, 3);
    const stored = env.sqlite.prepare('SELECT voter_hash FROM matchup_votes LIMIT 1').get();
    assert.equal(stored.voter_hash.length, 64);
    assert.notEqual(stored.voter_hash, voterOne);
  } finally { env.sqlite.close(); }
});

test('simultaneous submissions count once, independent browser votes count separately', async () => {
  const env = database();
  try {
    await Promise.all(Array.from({ length: 20 }, (_, index) => vote(env, pair[index % 2])));
    const last = await vote(env, 'patrick-star', voterTwo);
    assert.equal(last.total, 2);
    assert.equal(Object.values(last.counts).reduce((sum, value) => sum + value, 0), 2);
  } finally { env.sqlite.close(); }
});

test('reject invalid roster IDs, winner, identity, cross-origin requests and large JSON', async () => {
  const env = database();
  try {
    const inputs = [
      [{ pair: ['patrick-star', 'invented-character'], winner: 'patrick-star', voterId: voterOne }, 400],
      [{ pair: ['patrick-star', 'patrick-star'], winner: 'patrick-star', voterId: voterOne }, 400],
      [{ pair, winner: 'sandy-cheeks', voterId: voterOne }, 400],
      [{ pair, winner: 'patrick-star', voterId: 'not-a-uuid' }, 400]
    ];
    for (const [input, status] of inputs) assert.equal((await worker.fetch(voteRequest(input), env)).status, status);
    assert.equal((await worker.fetch(voteRequest({ pair, winner: pair[0], voterId: voterOne }, 'https://stranger.example'), env)).status, 403);
    assert.equal((await worker.fetch(voteRequest({ pair, winner: pair[0], voterId: voterOne }, null), env)).status, 403);
    assert.equal((await worker.fetch(voteRequest({ data: 'a'.repeat(3000) }), env)).status, 413);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS total FROM matchup_votes').get().total, 0);
  } finally { env.sqlite.close(); }
});

test('CORS preflight allows owner site and localhost; missing DB and DB errors remain honest', async () => {
  for (const requestOrigin of [origin, 'http://localhost:8765']) {
    const response = await worker.fetch(new Request('https://votes.example/v1/votes', { method: 'OPTIONS', headers: { Origin: requestOrigin } }), {});
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), requestOrigin);
  }
  const input = voteRequest({ pair, winner: pair[0], voterId: voterOne });
  assert.equal((await worker.fetch(input.clone(), {})).status, 503);
  assert.equal((await worker.fetch(input.clone(), { DB: { prepare() { throw new Error('DB down'); } } })).status, 503);
});
