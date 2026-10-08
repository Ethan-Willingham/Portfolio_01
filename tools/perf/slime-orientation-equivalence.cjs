// Exact orientation-repair and fold-check regression, including changing terrain.
// BASE_REF selects another baseline; BEFORE_FILE selects a saved candidate.
// BENCH=0 skips isolated CPU timing; MIXED_SHAPES=1 varies body layouts.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const baseline = process.env.BASE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598';
const file = 'js/sluice/340-jello.js';
const before = process.env.BEFORE_FILE ? fs.readFileSync(process.env.BEFORE_FILE, 'utf8') :
  execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' });
const after = fs.readFileSync(path.join(root, file), 'utf8');
const material = fs.readFileSync(path.join(root, 'js/sluice/344-soft-material.js'), 'utf8');
function engine(source) {
  return new Function('window', 'TILE', 'GRAVITY', `
    var COLS = 320, TOTAL_ROWS = 500, softProjectEnabled = true;
    var location = window.location, floor = Infinity, enclosed = false;
    function tileAt(r, c) { return enclosed || r * TILE >= floor ? {type: 'stone'} : null; }
    ${source}\n${material}
    return { build: function() { jelloBodies.length = 0; jelloCount = 0; return jelloBuildDisc.apply(null, arguments); },
      limit: jelloLimitOrientation, folded: jelloHasOrientationFold,
      configure: function(y, solid, minimum) { floor = y; enclosed = solid; JELLO_ORIENT_MIN = minimum; } };
  `)({ location: { search: '' } }, 32, 600);
}
const old = engine(before), fresh = engine(after);
const arrays = ['px', 'py', 'ox', 'oy'];
let calls = 0;
for (let trial = 0; trial < 100; trial++) {
  const bodies = [old, fresh].map(e => e.build(100, 100, 22 + trial % 6, 'slime'));
  for (const b of bodies) {
    if (trial % 3) b.surfaceSlime = {};
    for (let i = 0; i < b.n; i++) {
      b.px[i] += trial % 5 ? Math.sin(i * 1.73 + trial) * (trial % 15) : 0;
      b.py[i] += trial % 5 ? Math.cos(i * 0.71 + trial) * (trial % 12) : 0;
      b.ox[i] = b.px[i] - Math.cos(i * 2.4) * 0.2;
      b.oy[i] = b.py[i] - Math.sin(i * 3.1) * 0.2;
    }
  }
  for (let step = 0; step < 12; step++) {
    for (const e of [old, fresh]) e.configure(trial % 2 ? 128 : Infinity,
      step < 2 && trial % 4 === 0, step < 7 ? -0.005 : 0.15);
    if (step === 4) for (const b of bodies) { b.px[5] += 14; b.py[8] -= 19; }
    if (step === 6) for (const b of bodies) {
      b.triA = b.triA.slice(); b.triB = b.triB.slice(); b.triC = b.triC.slice();
      b.triDmInv = b.triDmInv.slice(); b.triDmInv[0] *= 1.1;
    }
    if (step === 8) for (const b of bodies) {
      b.ox[0] -= 3; b.oy[0] += 2;
      if (b.surfaceSlime) delete b.surfaceSlime; else b.surfaceSlime = {};
    }
    if (step === 10) for (const b of bodies) { b.px[1] = NaN; }
    assert.equal(fresh.folded(bodies[1]), old.folded(bodies[0]), `${trial}/${step} before fold`);
    assert.equal(fresh.limit(bodies[1]), old.limit(bodies[0]), `${trial}/${step} repairs`);
    assert.equal(fresh.folded(bodies[1]), old.folded(bodies[0]), `${trial}/${step} after fold`);
    for (const key of arrays) assert.deepEqual(Buffer.from(bodies[1][key].buffer),
      Buffer.from(bodies[0][key].buffer), `${trial}/${step}/${key}`);
    assert.equal(bodies[1]._orientFixes, bodies[0]._orientFixes);
    calls++;
  }
}
console.log(`PASS: ${calls} orientation repairs and ${calls * 2} fold checks retain exact results and point/history bytes.`);
if (process.env.BENCH !== '0') {
  const engines = [engine(before), engine(after)];
  const bodies = engines.map(e => Array.from({ length: 8 }, (_, i) => {
    const b = e.build(100 + i * 70, 100, 25, 'slime'); b.surfaceSlime = {}; return b;
  }));
  if (process.env.MIXED_SHAPES === '1') for (const group of bodies) for (let i = 0; i < group.length; i++) {
    for (let k = 0; k <= i; k++) group[i]['_benchmarkLayout' + k] = k;
  }
  function time(which, loops) {
    const start = performance.now();
    for (let i = 0; i < loops; i++) for (const b of bodies[which]) {
      // One new material pose, then the repeated terrain/contact validators.
      for (let p = 0; p < b.n; p++) b.px[p] += 0.01;
      engines[which].limit(b); engines[which].limit(b); engines[which].folded(b);
    }
    return (performance.now() - start) / loops;
  }
  time(0, 1000); time(1, 1000);
  const times = [[], []];
  for (let run = 0; run < 7; run++) for (const which of run % 2 ? [1, 0] : [0, 1]) times[which].push(time(which, 3000));
  times.forEach(row => row.sort((a, b) => a - b));
  console.log(`Eight residents, repeated clear-pose validation: ${times[0][3].toFixed(4)} -> ${times[1][3].toFixed(4)} ms, ${((1 - times[1][3] / times[0][3]) * 100).toFixed(1)}% faster (isolated CPU).`);
}
