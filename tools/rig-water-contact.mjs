// Deterministic moving-hull tests. Real GPU counterpart lives in slime-garden-smoke.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../js/sluice/070-collision-liquids.js', import.meta.url), 'utf8');
function fn(name) {
  const a = src.indexOf('  function ' + name + '(');
  assert(a >= 0, name);
  return src.slice(a, src.indexOf('\n  }', a) + 4);
}
const state = { Math, Infinity, player: { x: 64, y: 64, vx: 0, vy: 0, dir: 1 },
  gameWon: false, LIQUID_DBG_NO_PLAYER: 0, PLAYER_W: 22, PLAYER_H: 26,
  LIQUID_MINER_HULL_L: 3, LIQUID_MINER_HULL_T: 6, LIQUID_MINER_HULL_R: 20, LIQUID_MINER_HULL_B: 20,
  LIQUID_MINER_TRACK_L: 1.5, LIQUID_MINER_TRACK_T: 18, LIQUID_MINER_TRACK_R: 20.5, LIQUID_MINER_TRACK_B: 25,
  liquidWorldSolidAt: (x, y) => y >= 90 };
vm.createContext(state);
vm.runInContext(['liquidMinerRect','liquidMinerContains','liquidMinerExitClear','liquidProjectMiner'].map(fn).join('\n'), state);
const radius = 2.5 * 0.5 * 0.85;
let count = 0;
for (const dir of [-1, 1]) for (const speed of [0, 2, 160, 500]) {
  Object.assign(state.player, { dir, vx: dir * speed });
  for (let x = 66; x < 85; x += 1.25) for (let y = 72; y <= 88; y += 1.25) {
    if (!state.liquidMinerContains(x, y, radius)) continue;
    const p = state.liquidProjectMiner(x, y, 0, 0, radius);
    assert(p, 'deep overlap always gets a full exit');
    assert(!state.liquidMinerContains(p[0], p[1], radius), 'outside the entire hull/track union');
    assert(state.liquidMinerExitClear(x, y, p[0], p[1], radius), 'no terrain crossing');
    assert(p.every(Number.isFinite));
    count++;
  }
  if (speed) {
    const x = state.player.x + (dir > 0 ? 19 : 3);
    const p = state.liquidProjectMiner(x, 85, 0, 0, radius);
    assert(p[2] * dir >= speed, 'the advancing track transfers its velocity to water');
  }
}
// A wall blocks the preferred exit. Search another face without crossing it.
state.liquidWorldSolidAt = (x, y) => y >= 90 || x < 65;
Object.assign(state.player, { dir: -1, vx: -160 });
const p = state.liquidProjectMiner(67, 85, 0, 0, radius);
assert(p && p[0] - radius >= 65 && p[1] + radius < 90);
console.log(`PASS ${count} moving/stationary rig overlaps: both directions, slow/fast motion, floor and wall clearance.`);
