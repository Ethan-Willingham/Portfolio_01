// Exact world-save format regression, pinned to the v28.172 encoder.
// Run with BENCH=1 for a short, optional alternating CPU benchmark.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '../..');
const file = 'js/sluice/047-save.js';
const ref = process.env.BASE_REF || 'b6dc539759097cdf386ea535692516c37ae81ea6';

function engine(source) {
  const helper = source.indexOf('  function saveClearedRowFlags()');
  const start = helper >= 0 ? helper : source.indexOf('  function saveSerializeWorld()');
  const end = source.indexOf('  // ---- Envelope build');
  assert(start >= 0 && end > start, 'World encoder source boundaries');
  return new Function('TOTAL_ROWS', 'WORLD_COLS', 'world', 'terrainClearedKinds', 'ORES', 'btoa',
    source.slice(start, end) + 'return saveSerializeWorld;');
}
const old = engine(cp.execFileSync('git', ['show', ref + ':' + file], { cwd: root, encoding: 'utf8' }));
const now = engine(fs.readFileSync(path.join(root, file), 'utf8'));
const ores = { dirt: { hp: 3 }, stone: { hp: 5 }, coal: { hp: 4 }, jello: { hp: 8 }, foundation: { hp: 100 } };
const base64 = s => Buffer.from(s, 'binary').toString('base64');
let comparisons = 0;

function run(make, which) {
  const f = make();
  return which(f.rows, f.cols, f.world, f.kinds, ores, base64)();
}
function check(name, make) {
  const a = run(make, old), b = run(make, now);
  assert.deepStrictEqual(b, a, name);
  assert.strictEqual(JSON.stringify(b), JSON.stringify(a), name + ' serialized bytes');
  comparisons++;
}
function random(seed, rows, cols, nullPrototype) {
  let state = seed;
  const rand = () => ((state = Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const world = [], kinds = nullPrototype ? Object.create(null) : {};
  for (let r = 0; r < rows; r++) {
    if (rand() < .07) continue;
    const row = world[r] = [];
    for (let c = 0; c < cols; c++) {
      if (rand() < .65) {
        if (rand() < .07) kinds[r + ':' + c] = ['dirt', 'stone', '', 0, false, null, undefined, 'ice'][Math.floor(rand() * 8)];
        continue;
      }
      const type = ['dirt', 'stone', 'coal', 'jello', 'foundation'][Math.floor(rand() * 5)];
      row[c] = { type, hp: rand() < .1 ? rand() * 10 : ores[type].hp, shiny: rand() < .07 };
      if (type === 'jello' && rand() < .7) row[c].jellyType = ['ice', 'blue', '#typed'][Math.floor(rand() * 3)];
    }
  }
  return { rows, cols, world, kinds };
}
for (let i = 1; i <= 260; i++) check('mixed ' + i, () => random(i, i % 37, i % 23, i % 2));
for (const n of [0, 1, 127, 128, 129, 16383, 16384, 16385, 451840]) {
  check('air run ' + n, () => ({ rows: 1, cols: n, world: [], kinds: {} }));
}
check('inherited and non-enumerable labels', () => {
  const base = Object.create(null);
  Object.defineProperty(base, '1:2', { value: 'stone' });
  base['0:1'] = 'dirt';
  const kinds = Object.create(base);
  Object.defineProperty(kinds, '1:2', { value: undefined });
  Object.defineProperty(kinds, '2:3', { value: 'dirt' });
  for (const key of ['01:1', '1:01', '-0:1', 'NaN:1', 'Infinity:1', '3:0']) kinds[key] = 'outside';
  return { rows: 3, cols: 4, world: [], kinds };
});
check('accessor mutates a later row', () => {
  const kinds = {};
  Object.defineProperty(kinds, '0:0', { get() { kinds['2:1'] = 'stone'; return 'dirt'; } });
  return { rows: 3, cols: 3, world: [], kinds };
});
check('coercion mutates a later row', () => {
  const kinds = { '0:0': { toString() { kinds['2:1'] = 'stone'; return 'dirt'; } } };
  return { rows: 3, cols: 3, world: [], kinds };
});
check('inherited accessor sequence', () => {
  let n = 0;
  const base = {};
  Object.defineProperty(base, '0:0', { get() { return ++n % 2 ? 'dirt' : 'stone'; } });
  const kinds = Object.create(base);
  Object.defineProperty(kinds, '2:1', { get() { return ++n % 2 ? 'stone' : 'dirt'; } });
  return { rows: 3, cols: 3, world: [], kinds };
});
check('palette encounter order and exceptions', () => ({
  rows: 2, cols: 4,
  world: [[{ type: 'stone', hp: NaN, shiny: true }, null, { type: 'jello', jellyType: 'ice', hp: 2 }, null],
    [{ type: 'dirt', hp: 3 }, false, 0, undefined]],
  kinds: { '0:1': 'stone', '1:2': false }
}));
check('prototype-looking solid keys', () => ({
  rows: 1, cols: 7,
  world: [[{ type: '__proto__' }, { type: 'constructor' }, null, { type: 'toString' }, null, { type: 'air:' }, null]],
  kinds: {}
}));
// Real world dimensions include the unused air rows beneath the single-town mine.
function game(seed, mined) {
  const f = random(seed, 408, 320, false);
  f.rows = 1412;
  for (const key of Object.keys(f.kinds)) delete f.kinds[key];
  if (mined) for (let r = 4; r < 404; r++) for (let c = 1; c < 8; c++) {
    f.world[r] ||= [];
    f.world[r][c] = null;
    f.kinds[r + ':' + c] = (r + c) % 2 ? 'dirt' : 'stone';
  }
  return f;
}
check('town full dimensions', () => game(719, false));
check('mined full dimensions', () => game(719, true));

// Reuse an encoder while labels are added and deleted. Flags must not survive a save.
for (const which of [old, now]) {
  const f = { rows: 4, cols: 5, world: [], kinds: {} };
  const encode = which(f.rows, f.cols, f.world, f.kinds, ores, base64);
  encode();
  f.kinds['3:4'] = 'stone';
  const mutated = encode();
  assert(mutated.pal.includes('air:stone'));
  delete f.kinds['3:4'];
  assert.deepStrictEqual(encode().pal, ['air:']);
}
console.log(JSON.stringify({ comparisons, repeatedSaveLifecycle: true, exact: true }));

if (process.env.BENCH === '1') for (const mined of [false, true]) {
  const f = game(719, mined);
  const build = which => which(f.rows, f.cols, f.world, f.kinds, ores, base64);
  const a = build(old), b = build(now), times = [[], []];
  for (let i = 0; i < 4; i++) { a(); b(); }
  for (let i = 0; i < 8; i++) for (const k of (i % 2 ? [1, 0] : [0, 1])) {
    const t = performance.now();
    (k ? b : a)();
    times[k].push(performance.now() - t);
  }
  const median = x => x.sort((a, b) => a - b)[x.length >> 1];
  console.log(JSON.stringify({ mined, referenceMs: median(times[0]), candidateMs: median(times[1]),
    ratio: median(times[1]) / median(times[0]) }));
}
