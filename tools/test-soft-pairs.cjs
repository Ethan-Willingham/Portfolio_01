// Contact-law checks of the actual pair fragment: equal-mass momentum in air,
// passive energy, terrain-masked normal closure, and bounded local correction.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/sluice/345-soft-pairs.js'), 'utf8');
let assertions = 0, cases = 0;
function check(ok, message) { assert.ok(ok, message); assertions++; }
function context(mask = 0, origins = [[5, 5], [3, 4], [8, 4]]) {
  let query = 0;
  const w = { console, Math, SOFT_PAIRS: true, SOFT_CONTACT_POINT_MASS: 0.18,
    JELLO_TIMESCALE: 0.5, jelloFrameNo: 1,
    skySlimeClamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    // Each bit fixes one coordinate of a material node. Match spatial probes
    // to their node so a zero-weight endpoint can skip its probes entirely.
    jelloWorldSolidAt: (x, y) => {
      let closest = 0, distance = Infinity;
      for (let i = 0; i < origins.length; i++) {
        const d = Math.hypot(x - origins[i][0], y - origins[i][1]);
        if (d < distance) { distance = d; closest = i; }
      }
      return !!(mask & (1 << (closest * 2 + query++ % 2)));
    } };
  vm.createContext(w); vm.runInContext(source, w); return w;
}
function body(points, velocities) {
  return { n: points.length, surfaceSlime: {}, _cHits: 0, sleeping: false,
    px: points.map(p => p[0]), py: points.map(p => p[1]),
    ox: points.map((p, i) => p[0] - velocities[i][0]),
    oy: points.map((p, i) => p[1] - velocities[i][1]) };
}
function velocities(A, B) {
  return [[A.px[0] - A.ox[0], A.py[0] - A.oy[0]],
    [B.px[0] - B.ox[0], B.py[0] - B.oy[0]], [B.px[1] - B.ox[1], B.py[1] - B.oy[1]]];
}
const energy = v => v.reduce((sum, p) => sum + 0.5 * (p[0] * p[0] + p[1] * p[1]), 0);
const momentum = v => v.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]);
const relative = (v, t) => [v[0][0] - v[1][0] * (1 - t) - v[2][0] * t,
  v[0][1] - v[1][1] * (1 - t) - v[2][1] * t];
function run({ mask = 0, angle = 0, t = 0.5, depth = 1, seed = 1, boost = [0, 0] } = {}) {
  const w = context(mask), nx = Math.cos(angle), ny = Math.sin(angle);
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296) * 0.8 - 0.4;
  const v = Array.from({ length: 3 }, (_, i) => [mask & (1 << (i * 2)) ? 0 : random() + boost[0],
    mask & (1 << (i * 2 + 1)) ? 0 : random() + boost[1]]);
  const A = body([[5, 5]], [v[0]]), B = body([[3, 4], [8, 4]], [v[1], v[2]]);
  const before = velocities(A, B), pBefore = momentum(before), eBefore = energy(before);
  const oldPoints = [[A.px[0], A.py[0]], [B.px[0], B.py[0]], [B.px[1], B.py[1]]];
  w.softPairsProject(A, 0, B, 0, 1, t, nx, ny, depth, 1 / 720);
  const after = velocities(A, B), eAfter = energy(after), pAfter = momentum(after);
  const label = JSON.stringify({ mask, angle, t, depth, seed });
  const points = [[A.px[0], A.py[0]], [B.px[0], B.py[0]], [B.px[1], B.py[1]]];
  check(after.flat().every(Number.isFinite) && points.flat().every(Number.isFinite), 'finite output ' + label);
  check(eAfter <= eBefore + Math.max(1e-10, eBefore * 1e-11), 'contact does not add kinetic energy ' + label);
  check(points.every((p, i) => Math.hypot(p[0] - oldPoints[i][0], p[1] - oldPoints[i][1]) <= 2 + 1e-9), 'at most 2px per material node ' + label);
  const beforeRV = relative(before, t), afterRV = relative(after, t);
  const beforeN = beforeRV[0] * nx + beforeRV[1] * ny, afterN = afterRV[0] * nx + afterRV[1] * ny;
  if (w.softPairsReport.contacts && beforeN < 0) check(afterN >= -1e-10, 'masked friction cannot leave an approaching normal ' + label);
  for (let i = 0; i < 3; i++) for (let axis = 0; axis < 2; axis++) if (mask & (1 << (i * 2 + axis))) {
    check(Math.abs(points[i][axis] - oldPoints[i][axis]) < 1e-12 && Math.abs(after[i][axis] - before[i][axis]) < 1e-12, 'fixed terrain coordinate unchanged ' + label);
  }
  if (!mask) {
    check(Math.hypot(pAfter[0] - pBefore[0], pAfter[1] - pBefore[1]) < 1e-10, 'equal opposite impulses preserve linear momentum ' + label);
    const jx = after[0][0] - before[0][0], jy = after[0][1] - before[0][1];
    const jn = jx * nx + jy * ny, jt = -jx * ny + jy * nx;
    check(Math.abs(jt) <= w.SOFT_PAIRS_FRICTION * jn + 1e-10 && jn >= -1e-10, 'Coulomb bound ' + label);
  }
  cases++;
  return { before, after, A, B, w };
}
for (let mask = 0; mask < 64; mask++) for (const angle of [0, Math.atan2(0.8, 0.6), 2.1, -1.2]) {
  for (const t of [0, 0.25, 0.5, 0.9, 1]) run({ mask, angle, t, depth: 8, seed: 31 + mask * 7 });
}
for (const angle of [0.0001, Math.PI / 2 - 0.0001, Math.PI / 2 + 0.0001]) {
  for (const mask of [21, 42, 62, 61, 59, 55]) for (const depth of [0.01, 1, 1000]) run({ mask, angle, depth, seed: 101 });
}
for (const angle of [0.2, 1.2, 3.8]) for (const t of [0, 0.5, 1]) {
  const ordinary = run({ angle, t, seed: 400 }), boosted = run({ angle, t, seed: 400, boost: [3, -5] });
  for (let i = 0; i < 3; i++) check(Math.hypot(boosted.after[i][0] - ordinary.after[i][0] - 3,
    boosted.after[i][1] - ordinary.after[i][1] + 5) < 1e-10, 'inertial frame does not change impulse');
}
for (let mask = 0; mask < 256; mask++) for (const angle of [0.2, 1.2, 2.8]) {
  const points = [[-4, 0], [4, 0], [0, -4], [0, 4]], w = context(mask, points);
  const v = points.map((_, i) => [mask & (1 << (i * 2)) ? 0 : Math.sin(i * 1.4 + mask) * 0.3,
    mask & (1 << (i * 2 + 1)) ? 0 : Math.cos(i * 0.7 + mask) * 0.3]);
  const A = body(points.slice(0, 2), v.slice(0, 2)), B = body(points.slice(2), v.slice(2));
  const get = () => [A, B].flatMap(b => b.px.map((x, i) => [x - b.ox[i], b.py[i] - b.oy[i]]));
  const before = get(), eBefore = energy(before), nx = Math.cos(angle), ny = Math.sin(angle);
  w.softPairsPatch(A, 0, 1, 0.7, B, 0, 1, 0.4, nx, ny, 1000, 1 / 720);
  const after = get(), weights = [0.3, 0.7, -0.6, -0.4];
  check(after.flat().every(Number.isFinite), 'four-node patch remains finite');
  check(energy(after) <= eBefore + 1e-10, 'four-node masked contact is passive');
  const oldN = before.reduce((sum, v, i) => sum + weights[i] * (v[0] * nx + v[1] * ny), 0);
  const newN = after.reduce((sum, v, i) => sum + weights[i] * (v[0] * nx + v[1] * ny), 0);
  if (w.softPairsReport.contacts && oldN < 0) check(newN >= -1e-10, 'four-node masked friction leaves no closing normal');
  const moved = [A, B].flatMap(b => b.px.map((x, i) => [x, b.py[i]]));
  check(moved.every((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) <= 2 + 1e-9), 'four-node deep repair caps each node');
  if (!mask) {
    const pa = momentum(after), pb = momentum(before);
    check(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-10, 'four-node free contact preserves linear momentum');
  }
  cases++;
}
{
  const w = context(0), make = points => Object.assign(body(points, points.map(() => [0, 0])), {
    ring: points.map((_, i) => i), ringN: points.length, ringSign: 1, cr: 0.2 });
  const A = make([[-12, -1], [12, -1], [12, 1], [-12, 1]]);
  const B = make([[-1, -12], [1, -12], [1, 12], [-1, 12]]);
  // Neither long thin skin has a node inside the other; all eight nodes are
  // also much farther than the contact margin from the other skin's edges.
  check(A.px.every(x => Math.abs(x) > 1) && B.py.every(y => Math.abs(y) > 1), 'crossing fixture evades vertex containment');
  const beforeX = [...A.px, ...B.px].reduce((s, x) => s + x, 0);
  const beforeY = [...A.py, ...B.py].reduce((s, y) => s + y, 0);
  w.softPairsEdges(A, B, 1 / 720);
  check(w.softPairsReport.contacts > 0, 'intersecting edges are detected between nodes');
  check(Math.abs([...A.px, ...B.px].reduce((s, x) => s + x, 0) - beforeX) < 1e-10 &&
    Math.abs([...A.py, ...B.py].reduce((s, y) => s + y, 0) - beforeY) < 1e-10, 'edge repair has equal opposite displacement');
  check([A, B].every(b => b.px.every((x, i) => x === b.ox[i] && b.py[i] === b.oy[i])), 'static edge repair injects no velocity');
}
{
  const w = context(), A = body([[0, 0]], [[0, 0]]), B = body([[1, 0]], [[0, 0]]);
  w.SOFT_PAIRS = false; const before = JSON.stringify([A, B]);
  check(w.softPairsStep([A, B], 2, 1 / 720) === 0 && JSON.stringify([A, B]) === before, 'flag-off path is byte-exact');
  w.SOFT_PAIRS = true; delete A.surfaceSlime; delete B.surfaceSlime;
  check(!w.softPairsBody(A) && !w.softPairsManaged(A, B), 'hard bodies are excluded');
  const hardBefore = JSON.stringify([A, B]);
  // An untouched nonresident must not reach a contact query or correction.
  w.jelloRingBBox = () => { throw new Error('hard body reached pair geometry'); };
  w.softPairsStep([A, B], 2, 1 / 720);
  check(geometryOnly(A, B) === geometryOnly(...JSON.parse(hardBefore)), 'hard-body geometry and velocity histories remain exact');
}
function geometryOnly(...bodies) {
  return JSON.stringify(bodies.map(b => [b.px, b.py, b.ox, b.oy]));
}
console.log('PASS soft pair law: ' + cases + ' air/masked contact cases, ' + assertions + ' checks of momentum, energy, normal closure, correction bounds, and exclusions.');
