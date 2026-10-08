// Exact skin-crossing verdicts for radial proof and pairwise fallback paths.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const baseline = process.env.BASE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598';
const file = 'js/sluice/342-soft-contact.js';
const before = execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' });
const after = fs.readFileSync(path.join(root, file), 'utf8');
const intent = fs.readFileSync(path.join(root, 'js/sluice/346-soft-intent.js'), 'utf8');
function declaration(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const next = source.indexOf('\n  function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}
function engine(source, fresh) {
  const names = ['softContactSkinCrossed', 'softContactEdgesCross'];
  if (fresh) names.push('softContactRadialClear');
  return new Function(`function softIntentBody(b) { return b.intentMode; }
    ${declaration(intent, 'softIntentEdgesOverlap')}
    ${names.map(name => declaration(source, name)).join('\n')}
    return softContactSkinCrossed;`)();
}
const old = engine(before, false), fresh = engine(after, true);
let seed = 123456, checks = 0;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function body(points, mode, center) {
  const b = { n: points.length, ringN: points.length, ring: points.map((_, i) => i), intentMode: mode,
    px: Float64Array.from(points.map(p => p[0])), py: Float64Array.from(points.map(p => p[1])) };
  if (center) { b.cx = center[0]; b.cy = center[1]; }
  return b;
}
// Geometrically disjoint thin strips still overlap under the intent solver's
// 1e-7 distance tolerance. The radial proof must defer these to the old test.
for (const width of [1e-12, 1e-10, 1e-8, 1e-7, 1e-6, 1e-4, 0.01]) {
  for (const length of [0.001, 1, 10, 100, 10000]) {
    for (const angle of [0, 0.1, Math.PI / 4, 1.3, 2.8]) {
      for (const offset of [0, 100000, 1e9]) {
        const points = [[-length, -width], [length, -width], [length, width], [-length, width]].map(([x, y]) =>
          [offset + x * Math.cos(angle) - y * Math.sin(angle), offset + x * Math.sin(angle) + y * Math.cos(angle)]);
        for (const mode of [false, true]) {
          const a = body(points, mode, [offset, offset]), b = body(points, mode, [offset, offset]);
          assert.equal(fresh(b), old(a), `thin strip ${width}/${length}/${angle}/${offset}/${mode}`); checks++;
        }
      }
    }
  }
}
for (const gap of [1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 0.01]) {
  for (const inner of [1e-10, 1e-6, 0.01, 1, 10]) {
    for (const angle of [0, 0.3, 1.1]) {
      const points = [0, gap, 0.8, 2, 3, 4, 5].map((a, i) => {
        const radius = i === 0 || i === 1 ? inner : 20;
        return [Math.cos(a + angle) * radius, Math.sin(a + angle) * radius];
      });
      for (const mode of [false, true]) {
        const a = body(points, mode, [0, 0]), b = body(points, mode, [0, 0]);
        assert.equal(fresh(b), old(a), `thin sector ${gap}/${inner}/${angle}/${mode}`); checks++;
      }
    }
  }
}
for (let trial = 0; trial < 1600; trial++) {
  const n = 5 + trial % 22, offset = [0, 100000, 1e9][trial % 3], phase = random() * Math.PI * 2;
  const points = Array.from({ length: n }, (_, i) => {
    const angle = phase + i * Math.PI * 2 / n * (trial % 11 === 0 ? 2 : trial % 13 === 0 ? 3 : 1);
    const radius = 10 + random() * 25;
    return [offset + Math.cos(angle) * radius, offset + Math.sin(angle) * radius];
  });
  if (trial % 3 === 0) for (const p of points) { p[0] += (random() - 0.5) * 80; p[1] += (random() - 0.5) * 80; }
  if (trial % 17 === 0) points[3] = points[2].slice();
  if (trial % 19 === 0) points[3] = [points[2][0] + 1e-9, points[2][1] - 1e-9];
  if (trial % 23 === 0) points.forEach((p, i) => { p[1] = offset; p[0] = offset + (i % 4) * 10; });
  const center = trial % 4 === 0 ? null : [offset + (trial % 4 === 1 ? 50 : 0), offset];
  const a = body(points, !!(trial % 2), center), b = body(points, !!(trial % 2), center);
  for (let step = 0; step < 8; step++) {
    assert.equal(fresh(b), old(a), `trial ${trial}, step ${step}`); checks++;
    if (step === 1) { a.px[1] += 35; b.px[1] += 35; }
    if (step === 3) { a.ring.reverse(); b.ring.reverse(); }
    if (step === 4) { a.intentMode = !a.intentMode; b.intentMode = !b.intentMode; }
    if (step === 5) { a.px[2] = NaN; b.px[2] = NaN; }
  }
}
console.log(`PASS: ${checks} identical crossing verdicts across folds, multiple windings, collinear overlap, centers, scales and mutations.`);
if (process.env.BENCH !== '0') {
  const bodies = [old, fresh].map(() => body(Array.from({ length: 18 }, (_, i) => {
    const angle = i * Math.PI * 2 / 18, radius = 24 + Math.sin(i * 1.3) * 4;
    return [100 + Math.cos(angle) * radius, 100 + Math.sin(angle) * radius];
  }), true, [100, 100]));
  function time(which, count) {
    const b = bodies[which], query = which ? fresh : old, start = performance.now();
    for (let i = 0; i < count; i++) { b.px[3] += i % 2 ? -0.001 : 0.001; query(b); }
    return (performance.now() - start) / count;
  }
  time(0, 5000); time(1, 5000);
  const timings = [[], []];
  for (let run = 0; run < 7; run++) for (const which of run % 2 ? [1, 0] : [0, 1]) timings[which].push(time(which, 30000));
  timings.forEach(row => row.sort((a, b) => a - b));
  console.log(`Moving radial ring: ${(timings[0][3] * 1000).toFixed(3)} -> ${(timings[1][3] * 1000).toFixed(3)} us/query, ${((1 - timings[1][3] / timings[0][3]) * 100).toFixed(1)}% faster (isolated CPU).`);
}
