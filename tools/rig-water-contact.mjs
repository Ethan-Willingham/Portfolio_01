// Deterministic contacts against the production rounded rig silhouette.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../js/sluice/070-collision-liquids.js', import.meta.url), 'utf8');
const hullSrc = fs.readFileSync(new URL('../js/sluice/069-rig-hull.js', import.meta.url), 'utf8');
function fn(name) {
  const a = src.indexOf('  function ' + name + '(');
  assert(a >= 0, name);
  return src.slice(a, src.indexOf('\n  }', a) + 4);
}
const state = { Math, Infinity, player: { x: 64, y: 64, vx: 0, vy: 0, dir: 1 },
  gameWon: false, LIQUID_DBG_NO_PLAYER: 0, PLAYER_W: 22, PLAYER_H: 26,
  playerBodyScale: () => ({ x: 1, y: 1 }), playerFxLandOffset: () => 0,
  liquidWorldSolidAt: (x, y) => y >= 90 };
vm.createContext(state);
vm.runInContext(hullSrc + '\n' + ['liquidMinerContains','liquidMinerExitClear','liquidProjectMiner'].map(fn).join('\n'), state);
const radius = 2.5 * 0.5 * 0.85;
function edgePoint(index, inset) {
  const hull = state.rigContactHull(), next = (index + 1) % hull.n;
  const nx = hull.nx[index], ny = hull.ny[index];
  return { x: (hull.x[index] + hull.x[next]) / 2 - nx * inset,
    y: (hull.y[index] + hull.y[next]) / 2 - ny * inset, nx, ny };
}
function checkNormalTransfer(point, vx, vy, label) {
  const projected = state.liquidProjectMiner(point.x, point.y, vx, vy, radius);
  assert(projected, label + ': overlap exits');
  const q = state.rigHullQuery(state.rigContactHull(), projected[0], projected[1]);
  const nx = q.nx, ny = q.ny, tx = -ny, ty = nx;
  const expectedNormal = Math.max(vx * nx + vy * ny, state.player.vx * nx + state.player.vy * ny);
  assert(Math.abs(projected[2] * nx + projected[3] * ny - expectedNormal) < 1e-7,
    label + ': approaching normal velocity transfers');
  assert(Math.abs((projected[2] - vx) * tx + (projected[3] - vy) * ty) < 1e-7,
    label + ': tangential velocity remains free');
  assert(!state.liquidMinerContains(projected[0], projected[1], radius), label + ': outside the curved boundary');
  return projected;
}
let count = 0;
for (const dir of [-1, 1]) for (const speed of [0, 2, 160, 500]) {
  Object.assign(state.player, { dir, vx: dir * speed });
  for (let x = 66; x < 85; x += 1.25) for (let y = 72; y <= 88; y += 1.25) {
    if (!state.liquidMinerContains(x, y, radius)) continue;
    const p = state.liquidProjectMiner(x, y, 0, 0, radius);
    assert(p, 'deep overlap always gets a full exit');
    assert(!state.liquidMinerContains(p[0], p[1], radius), 'outside the rounded hull');
    assert(state.liquidMinerExitClear(x, y, p[0], p[1], radius), 'no terrain crossing');
    assert(p.every(Number.isFinite));
    count++;
  }
  for (const [lx, ly] of [[3,6],[20,6],[2,17],[20,17]]) {
    const x = state.player.x + (dir > 0 ? lx : state.PLAYER_W - lx), y = state.player.y + ly;
    assert(!state.liquidMinerContains(x, y, radius), 'empty former box corners remain open');
    assert.equal(state.liquidProjectMiner(x, y, 0, 0, radius), null, 'empty corners do not push water');
  }
  if (speed) {
    const front = edgePoint(9, 0.4);
    const lifted = checkNormalTransfer(front, 0, 0, 'advancing lower side');
    assert(lifted[2] * dir > 0 && lifted[3] < 0, 'lower ramp lifts material in either direction');
    const crown = edgePoint(7, 0.25), tx = -crown.ny, ty = crown.nx;
    const vx = tx * 35 - crown.nx * 40, vy = ty * 35 - crown.ny * 40;
    const p = checkNormalTransfer(crown, vx, vy, 'glancing curved crown');
    assert((p[2] - vx) * dir > 0 && p[3] - vy < 0, 'curved crown guides a glance upward');
  }
}
// A wall blocks the preferred exit. Search another face without crossing it.
state.liquidWorldSolidAt = (x, y) => y >= 90 || x < 67;
Object.assign(state.player, { dir: -1, vx: -160 });
const p = state.liquidProjectMiner(69, 85, 0, 0, radius);
assert(p && p[0] - radius >= 67 && p[1] + radius < 90);
console.log(`PASS ${count} rig overlaps: both directions, slow/fast motion, open corners, curved glances, normal transfer, floor and wall clearance.`);
