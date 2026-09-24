// Geometric regression for the actual resident mesh installer, without a browser.
// Run: node tools/test-slime-mesh.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../js/sluice/343-slime-mesh.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const install = context.surfaceSlimeInstallMesh;

function resident(radius, seed, rings) {
  // Mirror the public polar rest geometry, including its fixed radial variation.
  const n = 1 + 3 * rings * (rings + 1);
  const b = { n, rx: new Float32Array(n), ry: new Float32Array(n), ring: [] };
  const cx = 4800, cy = 150;
  b.rx[0] = cx; b.ry[0] = cy;
  let index = 1;
  for (let r = 1; r <= rings; r++) {
    const count = r * 6, phase = (r & 1) * Math.PI / count;
    for (let k = 0; k < count; k++) {
      const angle = phase + k / count * 6.2831853;
      const variation = 0.94 * (1 + 0.045 * Math.sin(angle * 3 + seed * 6.28) + 0.025 * Math.cos(angle * 5 - seed * 9));
      b.rx[index] = cx + Math.cos(angle) * r * radius / rings * variation;
      b.ry[index] = cy + Math.sin(angle) * r * radius / rings * variation;
      if (r === rings) b.ring.push(index);
      index++;
    }
  }
  return b;
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
function orientation(b, a, c, d) {
  return cross(b.rx[c] - b.rx[a], b.ry[c] - b.ry[a], b.rx[d] - b.rx[a], b.ry[d] - b.ry[a]);
}
function properIntersection(b, a, c, d, e) {
  return orientation(b, a, c, d) * orientation(b, a, c, e) < -1e-8 &&
    orientation(b, d, e, a) * orientation(b, d, e, c) < -1e-8;
}
let cases = 0;
for (const rings of [2, 3, 4, 5]) {
  for (const radius of [22, 23, 24, 25, 26, 27]) {
    for (const seed of [0, 0.08, 0.27, 0.46, 0.65, 0.84, 1]) {
      const b = resident(radius, seed, rings);
      const legacy = {
        sA: new Int32Array([0, 1]), sB: new Int32Array([1, 2]), sRest: new Float32Array([3, 4]),
        sType: new Int8Array([0, 0]), sLambda: new Float32Array(2), springN: 2,
        triA: new Int32Array([0]), triB: new Int32Array([1]), triC: new Int32Array([2]),
        triDmInv: new Float32Array([1, 0, 0, 1]), triRestArea: new Float32Array([1]),
        triLambda: new Float32Array(2), triN: 1, triHealthOnly: true
      };
      Object.assign(b, legacy);
      assert.equal(install(b), true, 'valid polar rest geometry installs');
      for (const key of Object.keys(legacy)) assert.equal(b[key], legacy[key], 'existing tension braces and health topology stay untouched');
      assert.equal(b.cellN, 6 * rings * rings, 'annuli have the exact planar triangle count');
      assert.equal(b.cellLambda.length, b.cellN, 'one multiplier per volume cell');
      let totalArea = 0, boundaryArea = 0;
      const uses = new Map();
      for (let t = 0; t < b.cellN; t++) {
        const a = b.cellA[t], c = b.cellB[t], d = b.cellC[t];
        const det = orientation(b, a, c, d);
        assert.ok(det > 0, 'every rest triangle has positive orientation');
        totalArea += det * 0.5;
        assert.ok(Math.abs(b.cellRestArea[t] - det * 0.5) < 0.00001, 'rest areas match geometry');
        const inverse = t * 4;
        const invDet = b.cellInv[inverse] * b.cellInv[inverse + 3] - b.cellInv[inverse + 1] * b.cellInv[inverse + 2];
        assert.ok(Math.abs(det * invDet - 1) < 0.000001, 'rest deformation determinant is one');
        for (const [u, v] of [[a, c], [c, d], [d, a]]) {
          const key = `${Math.min(u, v)},${Math.max(u, v)}`;
          uses.set(key, (uses.get(key) || 0) + 1);
        }
      }
      for (let k = 0; k < b.ring.length; k++) {
        const a = b.ring[k], c = b.ring[(k + 1) % b.ring.length];
        boundaryArea += cross(b.rx[a] - b.rx[0], b.ry[a] - b.ry[0], b.rx[c] - b.rx[0], b.ry[c] - b.ry[0]) * 0.5;
      }
      assert.ok(Math.abs(totalArea - boundaryArea) < 0.000001, 'triangle area covers the boundary exactly once');
      assert.equal([...uses.values()].filter(count => count === 1).length, b.ring.length, 'only skin edges have one incident triangle');
      assert.ok([...uses.values()].every(count => count === 1 || count === 2), 'no nonmanifold edges');
      const edges = [...uses.keys()].map(key => key.split(',').map(Number));
      assert.equal(edges.length, 3 * b.n - 3 - b.ring.length, 'unique material edges satisfy Euler topology');
      for (let s = 0; s < edges.length; s++) {
        const [a, c] = edges[s];
        for (let q = 0; q < s; q++) {
          const [d, e] = edges[q];
          if (a === d || a === e || c === d || c === e) continue;
          assert.equal(properIntersection(b, a, c, d, e), false, 'nonadjacent edges do not cross');
        }
      }
      cases++;
    }
  }
}
const invalid = { n: 38, sA: 'unchanged' };
assert.equal(install(invalid), false, 'unsupported topology is rejected');
assert.equal(invalid.sA, 'unchanged', 'a rejected installation is atomic');
console.log(`PASS ${cases} resident meshes: positive cells, exact area coverage, nonoverlapping edges, and unchanged tension braces`);
