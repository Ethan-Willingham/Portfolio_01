// Exact contact-solver regression and isolated CPU timing. No browser or dependencies.
// Run from any directory: node tools/perf/slime-contact-equivalence.mjs
// BASE_REF defaults to the release before v27. BENCH=0 skips timing.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRAGMENT = 'js/sluice/340-jello.js';
const BASE_REF = process.env.BASE_REF || '2ca9565';
const before = execFileSync('git', ['show', `${BASE_REF}:${FRAGMENT}`], { cwd: ROOT, encoding: 'utf8' });
const after = fs.readFileSync(path.join(ROOT, FRAGMENT), 'utf8');

function engine(source) {
  return new Function('window', 'TILE', 'GRAVITY', source + `
    return {
      solve: jelloContactSolve,
      configure: function (self, iters) { JELLO_CONTACT_SELF = self; JELLO_CONTACT_ITERS = iters; }
    };
  `)({ location: { search: '' } }, 32, 600);
}

let seed = 12345;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
}

function scene(count, side, gap, jitter, offset = 0) {
  return Array.from({ length: count }, (_, k) => {
    const n = side * side;
    const x = (k % 4) * (side * 5 + gap) + offset;
    const y = Math.floor(k / 4) * (side * 5 + gap) + offset;
    const b = { n, cr: 2.5, selfMin2: 156.25, _cHits: 0, sleeping: k % 2 === 0,
      _solve: k % 2 !== 0, _plyMs: k === 0 ? 5000 : 0 };
    for (const key of ['px', 'py', 'ox', 'oy']) b[key] = new Float64Array(n);
    for (const key of ['rx', 'ry']) b[key] = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      b.px[i] = b.rx[i] = x + (i % side) * 5 + (random() - 0.5) * jitter;
      b.py[i] = b.ry[i] = y + Math.floor(i / side) * 5 + (random() - 0.5) * jitter;
      b.ox[i] = b.px[i] - (random() - 0.5) * 3;
      b.oy[i] = b.py[i] - (random() - 0.5) * 3;
    }
    return b;
  });
}

const baseline = engine(before), optimized = engine(after);
let solves = 0;
for (let trial = 0; trial < 200; trial++) {
  // Vary particle count across the sparse/dense boundary, negative world
  // coordinates, rest-distance gates, self-contact, pass count and bad points.
  const a = scene(2 + trial % 7, 4 + trial % 13, -10 + trial % 13, trial % 11,
    trial % 3 === 0 ? -100000 : 0);
  if (trial % 17 === 0) a[0].px[0] = NaN;
  if (trial % 23 === 0) a[0]._phaseMate = a[1];
  const b = structuredClone(a);
  for(let k=0;k<a.length;k++)a[k].cr=b[k].cr=1.5+(trial+k)%4;
  const cellSize=2*Math.max(...a.map(b=>b.cr));
  baseline.configure(trial % 2, 1 + trial % 4);
  optimized.configure(trial % 2, 1 + trial % 4);
  for (let step = 0; step < 10; step++) {
    assert.equal(optimized.solve(b, b.length, cellSize), baseline.solve(a, a.length, cellSize),
      `contact count at trial ${trial}, step ${step}`);
    for (let k = 0; k < a.length; k++) {
      for (const key of ['px', 'py', 'ox', 'oy']) {
        // Compare bytes, including signed zero and non-finite payloads.
        assert.deepEqual(new Uint8Array(b[k][key].buffer), new Uint8Array(a[k][key].buffer),
          `${key} at trial ${trial}, step ${step}, body ${k}`);
      }
      for (const key of ['_cHits', 'sleeping', '_solve', '_plyMs']) assert.equal(b[k][key], a[k][key]);
    }
    solves++;
  }
}
console.log(`PASS: ${solves} solves across 200 scenes, byte-identical point/velocity buffers and contact state.`);

if (process.env.BENCH !== '0') {
  baseline.configure(1, 3); optimized.configure(1, 3);
  function time(e, bodies, loops) {
    const start = performance.now();
    for (let i = 0; i < loops; i++) e.solve(bodies, bodies.length, 5);
    return (performance.now() - start) / loops;
  }
  for (const [name, count, side, gap, jitter] of [
    ['two small separated bodies', 2, 4, 15, 0],
    ['eight small separated bodies', 8, 4, 15, 0],
    ['eight touching bodies', 8, 8, -8, 3],
    ['32 large bodies', 32, 12, -8, 3],
  ]) {
    const a = scene(count, side, gap, jitter), b = structuredClone(a);
    time(baseline, a, 200); time(optimized, b, 200);
    const oldTimes = [], newTimes = [], loops = 200;
    for (let run = 0; run < 7; run++) {
      if (run % 2) {
        newTimes.push(time(optimized, b, loops)); oldTimes.push(time(baseline, a, loops));
      } else {
        oldTimes.push(time(baseline, a, loops)); newTimes.push(time(optimized, b, loops));
      }
    }
    oldTimes.sort((a, b) => a - b); newTimes.sort((a, b) => a - b);
    const oldMs = oldTimes[3], newMs = newTimes[3];
    console.log(`${name}: ${oldMs.toFixed(4)} -> ${newMs.toFixed(4)} ms/solve, ` +
      `${((1 - newMs / oldMs) * 100).toFixed(1)}% faster (isolated CPU, not whole-game FPS).`);
  }
}
