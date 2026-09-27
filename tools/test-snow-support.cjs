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
  LIQUID_SNOW_DENSITY: 3.2, LIQUID_SNOW_DIAMETER: 1.8, GRAVITY: 600,
  LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5,
  RAIN_STORAGE_CAP: 40000, RAIN_ORIGIN: 3,
  liquidCount: 0, liquidWGPU: null, liquidOps: [], LIQUID_OPS_MAX: 10000, liquidMutationSeq: 0,
  rain: { intensity: 0, cells: {}, waterCells: {}, parked: [], waterCount: 0 },
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
  s.rain.cells = {}; s.rain.waterCells = {}; s.rain.waterCount = 0; s.rain.parked.length = 0;
  s.liquidWorldSolidAt = (x, y) => y >= 128;
  s.snowAir.active = false;
  s.snowAirAt = () => [0, 0, 0];
  s.snowReset(true);
}
function fillColumn(column, firstRow, lastRow) {
  // A connected lattice with real grain contacts. Grounded fixtures extend
  // to y=127, one grain radius above the floor at y=128.
  const bottom = lastRow === 20 ? 127 : lastRow * 6 + 5.5;
  for (let y = bottom; y >= firstRow * 6; y -= 1.5) {
    for (const offset of [1.3, 2.8, 4.3]) {
      s.addLiquidParticle(5, column * 6 + offset, y, 0, 0);
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

// Merely sharing the floor's six-pixel bucket cannot suspend a detached
// layer. These were all caught by the former eight-pixel terrain probe.
for (const gap of [3, 4, 5, 6, 7, 8]) {
  reset();
  for (let n = 0; n < 12; n++) {
    s.addLiquidParticle(5, 2401 + n * 1.4, 128 - gap, 0, 0);
    s.snow.active++; s.snow.mass++; s.snow.emitted++;
  }
  mirror();
  assert.equal(s.snowSupported(2403, 128 - gap, s.snow.bed), false,
    `a detached layer ${gap} pixels above terrain has no support`);
  const mass = s.snow.mass;
  s.liquidWGPU = null;
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, 0, 'detached near-floor powder leaves the dense solver');
  assert.equal(s.snow.grains.length, mass, 'near-floor release retains every grain');
  assert.ok(s.snow.grains.every(p => p.vy === 0), 'release itself supplies no launch or falling impulse');
  conserve(mass, 'detached near-floor layer');
}

// Sharing a coarse bucket with grounded snow is not itself support. The
// ground height puts both grains inside the former six-pixel bucket.
reset();
s.liquidWorldSolidAt = (x, y) => y >= 160;
for (const y of [159, 156]) {
  s.addLiquidParticle(5, 2401, y, 0, 0);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
assert.equal(Math.floor(159 / 6), Math.floor(156 / 6), 'mixed fixture shares the former bucket');
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 1, 'only the terrain-rooted grain remains supported');
assert.equal(s.liquidY[0], 159, 'support preserves the grounded grain');
assert.equal(s.snow.grains.length, 1, 'disconnected grain leaves the mixed bucket');
assert.equal(s.snow.grains[0].y, 156, 'detached grain retains its actual position');
assert.equal(s.snowSupported(2401, 156), false, 'grounded neighbour cannot bridge the open gap');
assert.equal(s.snowBedContact(2401, 156), false, 'detached grain cannot become a landing surface');
conserve(2, 'mixed grounded and detached bucket');

// A sparse sloped edge can carry load through touching grains across a
// column boundary. Every connection is shorter than two collision radii.
reset();
const edge = [[2399.6, 127], [2400.9, 125.6], [2402.2, 124.2], [2403.5, 122.8]];
for (const [x, y] of edge) {
  s.addLiquidParticle(5, x, y, 0, 0);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
assert.notEqual(Math.floor(edge[0][0] / 6), Math.floor(edge[1][0] / 6),
  'sloped fixture crosses the former column boundary');
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, edge.length, 'actual contacts preserve the entire sloped edge');
assert.equal(s.snow.grains.length, 0, 'supported edge grains never release artificially');
assert.ok(s.snowBedContact(edge.at(-1)[0], edge.at(-1)[1] - 1.5),
  'the supported sloped edge catches new snow at an actual grain contact');
conserve(edge.length, 'cross-column edge');
s.removeLiquidParticle(0); s.snow.mass--; s.snow.collected++;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 0, 'removing the root releases the entire detached contact chain');
assert.equal(s.snow.bed.size, 0, 'an unrooted component has no cached landing surface');
conserve(edge.length - 1, 'removed contact root');

// A supported stem cannot hold a horizontal or downward-hanging lip by
// tension. Nearby contacts remain colliders, but carry weight from below.
for (const slope of [0, 0.2]) {
  reset();
  for (let n = 0; n < 20; n++) {
    s.addLiquidParticle(5, 2400, 127 - n * 1.4, 90, 20);
    s.snow.active++; s.snow.mass++; s.snow.emitted++;
  }
  for (let n = 1; n <= 80; n++) {
    s.addLiquidParticle(5, 2400 + n * 1.4, 100.4 + n * slope, 90, 20);
    s.snow.active++; s.snow.mass++; s.snow.emitted++;
  }
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, 21, 'only the stem and its directly supported edge remain dense');
  assert.equal(s.snow.grains.length, 79, 'the projecting lip cannot hang from a sideways contact chain');
  assert.ok(s.snow.grains.every(p => p.vx === 90 && p.vy === 20), 'overhang release preserves actual momentum');
  assert.equal(s.snowBedContact(2490, 100.4 + 90 / 1.4 * slope), false, 'the detached lip cannot catch returning snow');
  conserve(100, 'unsupported overhang');
}

// Airflow has already done work on a compressed grain. A high density
// cannot suppress its earned upward flight while the stationary bed remains.
reset();
fillColumn(400, 16, 20);
s.snowAir.active = true; s.snowAirAt = () => [120, -80, 100];
const topIndex = s.liquidCount - 1;
s.liquidVX[topIndex] = 40; s.liquidVY[topIndex] = -60; s.liquidDensity[topIndex] = 12;
const liftedPoint = [s.liquidX[topIndex], s.liquidY[topIndex]], denseMass = s.snow.mass;
s.snowScan(1 / 60, 0);
assert.equal(s.snow.grains.length, 1, 'a packed upward-moving grain releases without lifting the stationary bed');
assert.deepEqual([s.snow.grains[0].x, s.snow.grains[0].y], liftedPoint);
assert.deepEqual([s.snow.grains[0].vx, s.snow.grains[0].vy], [40, -60], 'density cannot cancel earned jet momentum');
conserve(denseMass, 'packed grain release');

// A grazing side contact cannot cancel the downward velocity of a grain
// that has neither ground nor a weight-bearing contact underneath it.
reset();
s.addLiquidParticle(5, 2401.3, 127, 0, 0);
s.snow.active = s.snow.mass = s.snow.emitted = 1;
const grazing = falling(400, 126.5, true);
s.updateSnow(1 / 120);
assert.equal(s.liquidCount, 2, 'side contact enters the collision solver');
assert.ok(s.liquidVY[1] > 50, 'grazing contact preserves downward momentum');
assert.equal(s.snowSupported(s.liquidX[1], s.liquidY[1]), false, 'side contact is not load support');
conserve(2, 'grazing side contact');

// Strong air may have accelerated dense grains before handoff. Switching
// representations must retain that momentum, including a downward grain.
reset();
s.snowAir.active = true;
s.snowAirAt = () => [320, -90, 260];
const handoffs = [[2401, 125, 17, -60], [2413, 124, -11, 53], [2425, 123, 9, 0]];
for (const [x, y, vx, vy] of handoffs) {
  s.addLiquidParticle(5, x, y, vx, vy);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 0, 'all unsupported grains release under strong airflow');
for (const [x, y, vx, vy] of handoffs) {
  const p = s.snow.grains.find(grain => grain.x === x);
  assert.ok(p, 'handoff preserves the original grain');
  assert.deepEqual([p.x, p.y, p.vx, p.vy], [x, y, vx, vy],
    'handoff adds no random launch and does not cancel descending momentum');
}
conserve(handoffs.length, 'momentum-preserving handoff');

// A grain crosses its apex through finite acceleration. It must not jump
// directly from rising to its eventual terminal falling speed.
reset();
const apex = falling(400, -220, true);
apex.vy = -0.1;
const apexDt = 1 / 600, apexY = apex.y;
s.updateSnow(apexDt);
assert.ok(apex.vy > 0 && apex.vy < 1.1,
  'apex crosses continuously under approximately one pixel per second of gravity');
assert.ok(apex.y > apexY && apex.y - apexY < 0.003,
  'apex position has no artificial downward step');
conserve(1, 'continuous apex');

// Equal starting momentum develops different terminal speeds through drag.
// A modest updraft reduces descent continuously instead of hitting a floor.
reset();
s.snowAirAt = () => [0, -20, 0];
const fine = falling(400, -240, true), coarse = falling(406, -240, true);
fine.size = 0; coarse.size = 1; fine.vy = coarse.vy = 0;
s.updateSnow(1 / 120);
assert.ok(fine.vy > 0 && coarse.vy > fine.vy && coarse.vy < s.GRAVITY / 120,
  'drag begins descent gradually without a prescribed minimum speed');
for (let frame = 1; frame < 120; frame++) s.updateSnow(1 / 120);
assert.ok(Math.abs(fine.vy - 12) < 0.1 && Math.abs(coarse.vy - 54) < 0.1,
  'grain sizes converge to distinct terminal velocities relative to the moving air');
assert.ok(coarse.y - fine.y > 25, 'independent grain trajectories spread during descent');
conserve(2, 'size-dependent descent');

// A full sky-weather budget cannot strand existing material in the dense
// solver. Cross both the former 5400 flight cap and 8192 drawing allocation.
reset();
for (let i = 0; i < s.SNOW_FLAKE_CAP; i++) falling(396 + i % 24, -160 - i % 60, false);
for (let i = 0; i < 3100; i++) {
  s.addLiquidParticle(5, 2370 + i % 120, -100 - Math.floor(i / 120) * 1.4, (i % 9) - 4, 53);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
const saturatedMass = s.snow.mass;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 0, 'full weather budget cannot prevent physical flight');
assert.equal(s.snow.grains.length, saturatedMass, 'every released grain remains visible flight material');
assert.equal(s.snow.grains.filter(p => p.physical).length, 3100, 'all overflow grains retain physical identity');
assert.equal(s.snowSpawn(2400, -250), null, 'new weather remains bounded while physical flight exceeds its budget');
assert.ok(s.snow.grains.filter(p => p.physical).every(p => p.vy === 53),
  'saturated handoff preserves every incoming vertical velocity');
for (let frame = 0; frame < 5; frame++) s.updateSnow(1 / 60);
const overflowFlight = s.snow.grains.filter(p => p.physical);
for (const p of overflowFlight) {
  const terminal = 32 + p.size * 42;
  assert.ok(p.vy >= Math.min(53, terminal) && p.vy <= Math.max(53, terminal),
    'overflow powder approaches its terminal speed without overshoot');
  assert.ok(Math.abs(p.vy - terminal) <= Math.abs(53 - terminal),
    'overflow drag reduces the difference from each grain terminal speed');
}
assert.ok(Math.max(...overflowFlight.map(p => p.vy)) - Math.min(...overflowFlight.map(p => p.vy)) > 10,
  'overflow grains keep individual falling speeds');
conserve(saturatedMass, 'saturated flight');

// Save all physical flight, including rows beyond the former weather-only
// restore prefix. Physical rows first also exercise independent sky slots.
const saturatedSave = JSON.parse(JSON.stringify(s.snowSave()));
saturatedSave.grains.sort((a, b) => b[5] - a[5]);
reset();
s.snowRestore(saturatedSave);
assert.equal(s.snow.parked.length, 0, 'reloading flying powder never parks it back in the dense solver');
assert.equal(s.snow.grains.filter(p => p.physical).length, 3100, 'reload preserves every physical grain');
assert.equal(s.snow.grains.filter(p => !p.physical).length, s.SNOW_FLAKE_CAP, 'physical flight consumes no restored weather slots');
assert.equal(JSON.stringify(s.snowSave()), JSON.stringify(saturatedSave), 'flight positions, momentum, sizes and phases survive reload');
conserve(saturatedMass, 'saturated flight reload');

// Restoring modern flight beside an old bundled record still obeys the
// one material budget, even when the last bundle straddles its boundary.
reset();
const massCap = s.SNOW_MASS_CAP;
s.SNOW_MASS_CAP = 12;
s.snowRestore({ version: 2, particles: Array.from({ length: 8 }, () => [2400, 125, 0, 0]).flat(),
  grains: [[2400, -100, 12, -42, 1, 1, .7, 1.2], [2400, -100, 0, 53, 12, 1, .5, 0]] });
assert.equal(s.snow.grains.length, 1, 'physical flight restores without a weather field');
assert.equal(s.snow.grains[0].vy, -42, 'legacy field absence does not reset physical momentum');
assert.equal(s.snow.parked.length / 4, 11, 'legacy bundle expansion stops at the shared mass cap');
conserve(12, 'bounded legacy restore');
s.SNOW_MASS_CAP = massCap;

// Motion does not remove contact with a pile rooted in the ground. Powder
// returning to a sliding or disturbed bed must land on its actual surface.
for (const reverse of [false, true]) {
  reset();
  s.addLiquidParticle(5, 2403, 127, 0, 0);
  s.snow.active = s.snow.mass = s.snow.emitted = 1;
  s.snowScan(1 / 60, 0);
  // A burst begins with separated grains, then reaches the same small
  // landing area within one frame. Array order must not compress deposits.
  for (let n = 0; n < 12; n++) {
    const p = falling(400, 124 - 2.2 * n, true);
    p.vy = 300;
  }
  if (reverse) s.snow.grains.reverse();
  s.updateSnow(0.05);
  assert.ok(s.liquidCount >= 4, 'burst fixture deposits several grains in the same frame');
  let minSpacing = Infinity;
  for (let i = 0; i < s.liquidCount; i++) for (let j = i + 1; j < s.liquidCount; j++) {
    minSpacing = Math.min(minSpacing, Math.hypot(s.liquidX[i] - s.liquidX[j], s.liquidY[i] - s.liquidY[j]));
  }
  assert.ok(minSpacing >= s.LIQUID_SNOW_DIAMETER * 0.95,
    `same-frame deposits retain contact spacing in ${reverse ? 'reversed' : 'original'} array order (minimum ${minSpacing})`);
  conserve(13, 'same-frame batch deposition');
}

// A moving rooted pile remains a collision surface even while its grains
// exceed the former low-speed support gate.
for (const velocity of [[0, 53], [53, 0]]) for (const physical of [false, true]) {
  reset();
  fillColumn(400, 5, 20);
  for (let i = 0; i < s.liquidCount; i++) {
    [s.liquidVX[i], s.liquidVY[i]] = velocity;
  }
  const pileMass = s.snow.mass;
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, pileMass, 'moving rooted grains retain their physical contacts');
  assert.equal(s.snow.grains.length, 0, 'motion alone cannot release a supported pile');
  assert.ok(s.snow.bed.size > 0, 'moving rooted pile remains a landing surface');
  const p = falling(400, 29, physical), initial = s.snow.mass;
  s.updateSnow(1 / 60);
  assert.ok(!s.snow.grains.includes(p), 'returning snow cannot pass through a moving rooted pile');
  assert.equal(s.liquidCount, pileMass + 1, 'moving-bed contact deposits exactly one grain');
  assert.ok(s.liquidY[s.liquidCount - 1] < 30, 'deposit stays at the actual upper surface');
  conserve(initial, 'moving rooted bed');
}

// A disconnected moving cloud still has no support, even when all its
// grains touch one another. Connectivity to terrain is the deciding fact.
for (const velocity of [[0, 53], [53, 0], [0, -53]]) for (const physical of [false, true]) {
  reset();
  fillColumn(400, 5, 19);
  for (let i = 0; i < s.liquidCount; i++) {
    [s.liquidVX[i], s.liquidVY[i]] = velocity;
  }
  mirror();
  assert.equal(s.snow.bed.size, 0, 'disconnected moving cloud supplies no terrain support');
  const p = falling(400, 29, physical), initial = s.snow.mass, before = s.liquidCount;
  s.updateSnow(1 / 60);
  assert.ok(s.snow.grains.includes(p), 'unsupported cloud does not turn a free grain into deposited snow');
  assert.ok(p.y > 29.8, 'flake keeps descending through the unsupported cloud');
  assert.equal(s.liquidCount, before, 'disconnected cloud receives no deposited material');
  conserve(initial, 'disconnected moving cloud');
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
  assert.equal(s.liquidVY[s.liquidCount - 1], 0, 'landing dissipates incoming normal momentum');
  conserve(initial, 'supported pile landing');
}

// A lower pile must not support a detached cap across an empty bucket.
// Changing support is discovered on the next particle snapshot.
reset();
fillColumn(400, 5, 20);
mirror();
assert.ok(s.snowSupported(2403, 33, s.snow.bed));
for (let i = s.liquidCount - 1; i >= 0; i--) {
  if (Math.floor(s.liquidY[i] / 6) === 12) {
    s.removeLiquidParticle(i); s.snow.mass--; s.snow.collected++;
  }
}
mirror();
assert.equal(s.snowSupported(2403, 33, s.snow.bed), false,
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
s.rain.waterCells[s.rainCell(2403, 190)] = 10;
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
console.log('PASS batch deposition, moving rooted contact, detached moving clouds, actual grain support, momentum-preserving handoff, continuous apex, size-dependent descent, saturated reload and exact budgets');
