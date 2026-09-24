// Terrain support regression for dense snow, independent of rendering and GPU
// timing. The real snow fragments run against an in-memory particle pool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let seed = 2873;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noop = () => {};
const arrays = ['liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidType', 'liquidDensity',
  'liquidOrigin', 'liquidSleeping', 'liquidRestFrames'];
const s = {
  Math: math, window: { location: { search: '' } },
  cam: { x: 1900, y: -180 }, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 0, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000,
  SNOW_ACTIVE_CAP: 36000, SNOW_CPU_CAP: 7000, LIQUID_MAX_PARTICLES: 65536,
  LIQUID_SNOW_DENSITY: 3.2, RAIN_STORAGE_CAP: 40000, RAIN_ORIGIN: 3,
  liquidCount: 0, liquidWGPU: null, liquidOps: [], LIQUID_OPS_MAX: 10000, liquidMutationSeq: 0,
  rain: { intensity: 0, cells: {}, parked: [], waterCount: 0 },
  surfaceWind: { current: 0 }, player: { x: 2700, y: 90 },
  snowAir: { active: false }, snowAirReset: noop, updateSnowAir: noop,
  snowAirAt: () => [0, 0, 0], liquidToolSync: noop, rainCatchLakes: noop,
  tileAt: () => null, liquidWorldSolidAt: (x, y) => y >= 128,
  liquidPointInMiner: () => false, liquidLineClear: () => true,
  rainCell: (x, y) => Math.floor(y / 6) * (Math.ceil(320 * 32 / 6) + 1) + Math.floor(x / 6)
};
for (const key of arrays) s[key] = [];
s.addLiquidParticle = (type, x, y, vx, vy, origin = 3) => {
  const i = s.liquidCount++;
  [s.liquidType[i], s.liquidX[i], s.liquidY[i], s.liquidVX[i], s.liquidVY[i]] = [type, x, y, vx, vy];
  s.liquidDensity[i] = 3.2;
  s.liquidOrigin[i] = origin; s.liquidSleeping[i] = s.liquidRestFrames[i] = 0;
  return i;
};
s.removeLiquidParticle = i => {
  const last = --s.liquidCount;
  for (const key of arrays) { s[key][i] = s[key][last]; s[key].length = last; }
};
vm.createContext(s);
for (const file of ['156-particle-weather.js', '159-snow-physics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', file), 'utf8'), s);
}
s.snowTemperature = () => -4;
const staleGPU = { simActive: true, readbackApplyGen: 1, getReadbackAge: () => 1 / 60 };
function reset() {
  s.liquidCount = 0;
  for (const key of arrays) s[key].length = 0;
  s.liquidWGPU = null;
  s.liquidOps.length = 0; s.liquidMutationSeq = 0;
  s.rain.cells = {}; s.rain.waterCount = 0; s.rain.parked.length = 0;
  s.liquidWorldSolidAt = (x, y) => y >= 128;
  s.snowReset(true);
}
function fillColumn(column, firstRow, lastRow) {
  for (let row = firstRow; row <= lastRow; row++) {
    // Four actual particles per six-pixel cell, above the landing threshold.
    for (const offset of [1, 2, 3, 4]) {
      s.addLiquidParticle(5, column * 6 + offset, row * 6 + 3, 0, 0);
      s.snow.active++; s.snow.mass++; s.snow.emitted++;
    }
  }
}
function mirror() {
  // Keep the physical cloud in the shared solver while testing the CPU
  // collision decision, as happens between successful GPU readbacks.
  s.liquidWGPU = staleGPU;
  s.snowScan(1 / 60, 0);
}
function falling(column, y, physical) {
  const p = { x: column * 6 + 3, y, vx: 0, vy: 53, size: .5, phase: 0 };
  if (physical) p.physical = true;
  s.snow.grains.push(p); s.snow.mass++; s.snow.emitted++;
  return p;
}
function conserve(expected, label) {
  const water = s.liquidType.slice(0, s.liquidCount).filter(type => type === 0).length + s.rain.parked.length / 2;
  assert.equal(s.window.__particleSnow.stats().mass + water, expected, label + ': material count');
  assert.equal(s.snow.mass + water, expected, label + ': tracked mass');
  assert.equal(s.snow.emitted - s.snow.recycled - s.snow.collected, expected, label + ': budget');
}

for (const physical of [false, true]) {
  reset();
  for (let column = 396; column <= 404; column++) fillColumn(column, 0, 2);
  mirror();
  const p = falling(400, -1, physical), initial = s.snow.mass, liquidBefore = s.liquidCount;
  s.updateSnow(1 / 60);
  assert.ok(s.snow.grains.includes(p), 'unsupported cloud cannot catch ' + (physical ? 'loose powder' : 'sky snow'));
  assert.ok(p.y > -.2, 'flake continues moving through the unsupported cloud');
  assert.equal(s.liquidCount, liquidBefore, 'cloud contact never deposits another solver particle');
  conserve(initial, 'unsupported cloud');
}

reset();
for (let column = 396; column <= 404; column++) fillColumn(column, 0, 2);
mirror();
const sheetMass = s.snow.mass;
assert.ok(Object.values(s.snow.cells).every(n => n > 3), 'release fixture is a dense sheet');
s.liquidWGPU = null;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 0, 'every unsupported sheet particle leaves the dense solver');
assert.equal(s.snow.grains.length, sheetMass, 'sheet becomes individual airborne grains');
assert.ok(s.snow.grains.every(p => p.physical), 'released sheet keeps its physical material identity');
conserve(sheetMass, 'sheet release');

// A falling or sideways-moving curtain can fill every bucket down to the
// floor. Density continuity still must not turn that moving air into a bed.
for (const velocity of [[0, 53], [53, 0]]) for (const physical of [false, true]) {
  reset();
  fillColumn(400, 5, 20);
  for (let i = 0; i < s.liquidCount; i++) {
    [s.liquidVX[i], s.liquidVY[i]] = velocity;
  }
  mirror();
  assert.equal(Object.keys(s.snow.bed).length, 0, 'moving curtain contributes no resting bed');
  const p = falling(400, 29, physical), initial = s.snow.mass;
  s.updateSnow(1 / 60);
  assert.ok(s.snow.grains.includes(p), 'moving curtain cannot catch another falling grain');
  assert.ok(p.y > 29.8, 'flake passes through the moving curtain');
  conserve(initial, 'moving curtain');
}

for (const firstRow of [20, 5]) for (const physical of [false, true]) {
  reset();
  fillColumn(400, firstRow, 20);
  // Run an actual fresh scan first: the tall supported pile must not be
  // mistaken for separated snow merely because its top is high in the sky.
  const pileMass = s.snow.mass;
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, pileMass, 'terrain-supported pile stays in the dense solver');
  assert.equal(s.snow.grains.length, 0, 'supported pile does not spontaneously release');
  const p = falling(400, firstRow * 6 - 1, physical), initial = s.snow.mass;
  s.updateSnow(1 / 60);
  assert.ok(!s.snow.grains.includes(p), 'supported pile catches falling snow at its top');
  assert.equal(s.liquidCount, pileMass + 1, 'landing transfers one particle into the pile');
  conserve(initial, 'supported pile landing');
}

// A lower pile must not support a detached cap across an empty bucket.
// Changing support is discovered on the next particle snapshot.
reset();
fillColumn(400, 5, 20);
mirror();
assert.ok(s.snowSupported(2403, 33, s.snow.bed, s.snow.support));
for (let i = s.liquidCount - 1; i >= 0; i--) {
  if (Math.floor(s.liquidY[i] / 6) === 12) {
    s.removeLiquidParticle(i); s.snow.mass--; s.snow.collected++;
  }
}
mirror();
assert.equal(s.snowSupported(2403, 33, s.snow.bed, s.snow.support), false,
  'removing support invalidates the previous supported result');
const detached = falling(400, 29, true), gapMass = s.snow.mass;
s.updateSnow(1 / 60);
assert.ok(s.snow.grains.includes(detached), 'detached upper pile cannot catch another flake');
conserve(gapMass, 'removed support');

// Snow in water must remain in the solver long enough to thaw. Returning
// it to flight first immediately lands it on that same water next frame,
// producing an endless conversion loop that bypasses the heat branch.
reset();
s.liquidWorldSolidAt = (x, y) => y >= 300;
s.addLiquidParticle(5, 2403, 190, 0, 0);
s.snow.active = s.snow.mass = s.snow.emitted = 1;
s.rain.cells[s.rainCell(2403, 190)] = 10;
assert.equal(s.snowHeat(2403, 190), 5, 'submerged snow receives the existing water thaw rate');
seed = 1; // First draw is below the ordinary 120ms water-thaw probability.
s.snowScan(1 / 60, .12);
assert.equal(s.snow.grains.length, 0, 'submerged snow cannot enter a flight/landing loop');
assert.equal(s.liquidCount, 1, 'thaw retains the original particle');
assert.equal(s.liquidType[0], 0, 'submerged snow reaches the water thaw branch');
assert.equal(s.snow.melted, 1, 'thaw is recorded exactly once');
assert.deepEqual([s.liquidX[0], s.liquidY[0]], [2403, 190], 'thaw leaves the particle in place');
assert.equal(s.rain.waterCount, 1, 'thaw updates the water budget');
conserve(1, 'submerged thaw');
console.log('PASS unsupported clouds, moving curtains, dense sheet release, tall pile landing, support removal, submerged thaw and exact budgets');
