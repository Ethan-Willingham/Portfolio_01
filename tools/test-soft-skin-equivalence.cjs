// Differential regression for the skin broadphase/cache, against the v28.116 solver.
// Run from any directory: node tools/test-soft-skin-equivalence.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.env.BASELINE_REF || 'd3c4930';
const contactPath = 'js/sluice/342-soft-contact.js';
const terrainPath = 'js/sluice/344-soft-terrain.js';

function declaration(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing function ' + name);
  const next = source.indexOf('\n  function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}
function source(file, old) {
  return old ? execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
}
const oldContact = source(contactPath, true), newContact = source(contactPath, false);
const oldTerrain = source(terrainPath, true), newTerrain = source(terrainPath, false);
function runtime(old, solid) {
  const contact = old ? oldContact : newContact;
  const context = { Math, Float64Array, jelloWorldSolidAt: solid, softContactReport: { selfContacts: 0 } };
  vm.createContext(context);
  const names = ['softContactSkin', 'softContactEdgesCross'];
  if (!old) names.push('softContactRadialClear', 'softContactSkinCrossed');
  vm.runInContext(names.map(name => declaration(contact, name)).join('\n') + '\n' +
    declaration(old ? oldTerrain : newTerrain, 'softTerrainSkinCrossed'), context);
  return context;
}
let seed = 0x58743219;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const arrays = ['px', 'py', 'ox', 'oy', '_softPX', '_softPY'];
function ringBody(points) {
  const n = 37, b = { n, ringN: points.length, ring: points.map((_, i) => i * 2 + 1) };
  for (const key of arrays) b[key] = new Float64Array(n);
  for (let i = 0; i < n; i++) { b.px[i] = b.ox[i] = b._softPX[i] = 100; b.py[i] = b.oy[i] = b._softPY[i] = 100; }
  points.forEach(([x, y], k) => {
    const i = b.ring[k], angle = k / points.length * Math.PI * 2;
    b.px[i] = x; b.py[i] = y;
    b.ox[i] = x + (random() - 0.5) * 2; b.oy[i] = y + (random() - 0.5) * 2;
    b._softPX[i] = 100 + Math.cos(angle) * 24; b._softPY[i] = 100 + Math.sin(angle) * 24;
  });
  return b;
}
function clone(b) {
  const copy = { ...b, ring: b.ring.slice() };
  for (const key of arrays) copy[key] = b[key].slice();
  return copy;
}
function assertSame(a, b, label) {
  for (const key of arrays) {
    assert.equal(Buffer.compare(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer)), 0, label + ' ' + key);
  }
}
function radial(radius, phase = 0) {
  return Array.from({ length: 18 }, (_, i) => {
    const a = i / 18 * Math.PI * 2 + phase, r = radius(i);
    return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
  });
}
const fixtures = [
  ['round', radial(() => 24)],
  ['concave', radial(i => i % 2 ? 9 : 26)],
  ['figure-eight', Array.from({ length: 18 }, (_, i) => [100 + Math.sin(i / 18 * Math.PI * 2) * 25,
    100 + Math.sin(i / 18 * Math.PI * 4) * 21])],
  ['almost-collinear', radial(() => 24).map(([x, y]) => [x, 100 + (y - 100) * 1e-11])],
  ['touching', [[76, 100], [79, 87], [89, 78], [100, 76], [111, 78], [121, 87],
    [100, 100], [121, 113], [111, 122], [100, 124], [89, 122], [79, 113],
    [100, 100], [88, 110], [85, 100], [88, 90], [100, 100], [80, 102]]],
  ['axis-aligned', [[76, 76], [88, 76], [100, 76], [112, 76], [124, 76], [124, 88],
    [124, 100], [124, 112], [124, 124], [112, 124], [100, 124], [88, 124],
    [76, 124], [76, 112], [76, 100], [76, 88], [76, 82], [76, 79]]],
];
for (let trial = 0; trial < 500; trial++) {
  const points = radial(() => 10 + random() * 20, random() * Math.PI);
  if (trial % 3) for (const p of points) { p[0] += (random() - 0.5) * 55; p[1] += (random() - 0.5) * 55; }
  fixtures.push(['random-' + trial, points]);
}
const worlds = {
  air: () => false,
  floor: (x, y) => y >= 121,
  wall: (x, y) => x >= 121,
  corner: (x, y) => x >= 121 || y >= 121,
};
let comparisons = 0, crossingVerdicts = 0, corrections = 0, correctedCases = 0;
for (const [worldName, solid] of Object.entries(worlds)) {
  const old = runtime(true, solid), current = runtime(false, solid);
  for (const [name, points] of fixtures) {
    const a = ringBody(points), b = clone(a), before = old.softContactReport.selfContacts;
    for (let sweep = 0; sweep < 9; sweep++) {
      const label = worldName + '/' + name + '/' + sweep;
      // Repeated queries must reuse only a verdict justified by the current pose.
      for (let repeat = 0; repeat < 3; repeat++) {
        assert.equal(current.softTerrainSkinCrossed(b), old.softTerrainSkinCrossed(a), label + ' crossing');
        crossingVerdicts++;
      }
      old.softContactSkin(a); current.softContactSkin(b);
      assertSame(a, b, label);
      assert.equal(current.softContactReport.selfContacts, old.softContactReport.selfContacts, label + ' corrections');
      comparisons++;
      // Snapshot/history changes alone are independent of the geometric verdict.
      if (sweep === 1) {
        for (let i = 0; i < a.n; i++) {
          a._softPX[i] += (random() - 0.5) * 50; a._softPY[i] += (random() - 0.5) * 50;
          a.ox[i] += (random() - 0.5) * 5; a.oy[i] += (random() - 0.5) * 5;
        }
        for (const key of ['_softPX', '_softPY', 'ox', 'oy']) b[key].set(a[key]);
      }
      if (sweep === 3) {
        const i = a.ring[4]; a.px[i] -= 30; a.py[i] += 17; b.px[i] = a.px[i]; b.py[i] = a.py[i];
      }
      if (sweep === 4) {
        // Keep coordinates fixed while changing which edges they form.
        [a.ring[2], a.ring[10]] = [a.ring[10], a.ring[2]]; b.ring = a.ring.slice();
      }
      if (sweep === 5) { a.ring.reverse(); b.ring = a.ring.slice(); }
      if (sweep === 6) { a.ring.pop(); b.ring.pop(); a.ringN--; b.ringN--; }
    }
    const caseCorrections = old.softContactReport.selfContacts - before;
    corrections += caseCorrections;
    if (caseCorrections) correctedCases++;
  }
}
assert(corrections > 1000 && correctedCases > 1000, 'must exercise the correction path, not only no-op rings');
console.log(JSON.stringify({ baseline, fixtures: fixtures.length, worlds: Object.keys(worlds).length,
  comparisons, crossingVerdicts, corrections, correctedCases, bitExact: true }, null, 2));
