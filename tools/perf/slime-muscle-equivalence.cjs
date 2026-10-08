// Differential material-muscle check and isolated CPU timing.
// BASE_REF selects the pre-optimization revision; BEFORE_FILE selects a saved
// candidate instead. BENCH=0 skips timing; MIXED_SHAPES=1 varies body layouts.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = 'js/sluice/346-soft-intent.js';
const before = process.env.BEFORE_FILE ? fs.readFileSync(process.env.BEFORE_FILE, 'utf8') :
  execFileSync('git', ['show', `${process.env.BASE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598'}:${file}`], { cwd: root, encoding: 'utf8' });
const after = fs.readFileSync(path.join(root, file), 'utf8');
const shared = ['340-jello', '348-sky-slimes', '347-slime-locomotion', '347-surface-slimes']
  .map(name => fs.readFileSync(path.join(root, 'js/sluice', name + '.js'), 'utf8')).join('\n');
function engine(source) {
  return new Function('window', 'TILE', 'GRAVITY', `
    var ENABLE_JELLO = true, SOFT_INTENT = true, COLS = 320, TOTAL_ROWS = 500;
    var player = {x: 6000, y: 2000}, SKY_ROWS = 16;
    function tileAt() { return null; }
    ${shared}\n${source}
    return { build: surfaceSlimeBuild, step: softIntentMuscleStep, rest: jelloComputeRest };
  `)({ location: { search: '' } }, 32, 600);
}
const old = engine(before), fresh = engine(after);
function pair(seed, radius) {
  return [old, fresh].map(e => e.build(4800, 450, { id: 1, seed, r: radius }));
}
function configure(b, step) {
  const m = b.surfaceSlime;
  m.state = step % 143 < 90 ? 'crawl' : 'idle'; m.drive = step % 107 < 99;
  m.detach = step % 101 === 0 ? 0.1 : 0; m.wet = step % 137 === 0;
  b._grabbed = step % 151 === 0; b._carried = step % 157 === 0;
  if (step % 3 === 0) m.materialAngle = Math.sin(step / 80) * 1.3;
  if (m.intent) {
    m.intent.supported = step % 71 < 69;
    if (step % 3 === 0) {
      m.intent.tx = Math.cos(step / 90); m.intent.ty = Math.sin(step / 90);
      m.intent.nx = m.intent.ty; m.intent.ny = -m.intent.tx;
    }
  }
}
let steps = 0;
for (let trial = 0; trial < 30; trial++) {
  const [a, b] = pair((trial + 0.25) / 30, 22 + trial % 6);
  for (let step = 0; step < 480; step++) {
    configure(a, step); configure(b, step);
    if (step === 177 || step === 299) {
      // Rest geometry changes and recomputes without replacing its arrays.
      for (const body of [a, b]) { body.rx[7] += 0.125; body.ry[9] -= 0.25; }
      old.rest(a); fresh.rest(b);
    }
    if (step === 380) {
      for (const body of [a, b]) {
        body.qx = body.qx.slice(); body.qy = body.qy.slice();
        body.sA = body.sA.slice(); body.sB = body.sB.slice();
        body.surfaceSlime.radius = 24;
      }
    }
    const h = [1 / 720, 1 / 480, 1 / 240][trial % 3];
    old.step(a, h); fresh.step(b, h);
    for (const key of ['sRest']) assert.deepEqual(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer), `${trial}/${step}/${key}`);
    assert.deepEqual(Buffer.from(a.surfaceSlime.waveCos.buffer), Buffer.from(b.surfaceSlime.waveCos.buffer), 'node wave bytes');
    for (const key of ['power', 'motorBlend', 'phase']) assert.equal(a.surfaceSlime[key], b.surfaceSlime[key], key);
    assert.equal(a.surfaceSlime.intent.effort, b.surfaceSlime.intent.effort);
    steps++;
  }
}
console.log(`PASS: ${steps} muscle steps retain byte-identical spring lengths and wave samples.`);
if (process.env.BENCH !== '0') {
  const instances = [engine(before), engine(after)];
  const bodies = instances.map(e => Array.from({ length: 8 }, (_, i) => e.build(4800 + i * 70, 450, { id: i, seed: i / 8, r: 25 })));
  if (process.env.MIXED_SHAPES === '1') for (const group of bodies) for (let i = 0; i < group.length; i++) {
    // Runtime contact, terrain and sleep caches give residents distinct object
    // layouts. Uniform fresh builders conceal the cost of repeated b.array reads.
    for (let k = 0; k <= i; k++) group[i]['_benchmarkLayout' + k] = k;
  }
  function time(which, count) {
    const start = performance.now();
    for (let step = 0; step < count; step++) for (const b of bodies[which]) {
      configure(b, step); instances[which].step(b, 1 / 720);
    }
    return (performance.now() - start) / count;
  }
  time(0, 1000); time(1, 1000);
  const times = [[], []];
  for (let run = 0; run < 7; run++) for (const which of run % 2 ? [1, 0] : [0, 1]) times[which].push(time(which, 3000));
  times.forEach(row => row.sort((a, b) => a - b));
  console.log(`Eight residents: ${times[0][3].toFixed(4)} -> ${times[1][3].toFixed(4)} ms/microstep, ${((1 - times[1][3] / times[0][3]) * 100).toFixed(1)}% faster (isolated CPU).`);
}
