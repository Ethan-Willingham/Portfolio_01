// Snow admission, persistent identity, migration and accounting regressions.
// The real maintenance fragments run against an in-memory particle pool;
// trajectory/contact forces are covered by the separate solver tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let seed = 2873;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noop = () => {};
const arrays = ['liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidType', 'liquidDensity',
  'liquidOrigin', 'liquidSleeping', 'liquidRestFrames',
  'liquidG00', 'liquidG01', 'liquidG10', 'liquidG11'];
const s = {
  Math: math, window: { location: { search: '' } },
  cam: { x: 1900, y: -180 }, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 0, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000,
  SNOW_ACTIVE_CAP: 36000, LIQUID_MAX_PARTICLES: 65536,
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
  // to y=127.4, within one physical radius of the floor at y=128.
  const bottom = lastRow === 20 ? 127.4 : lastRow * 6 + 5.5;
  for (let y = bottom; y >= firstRow * 6; y -= 1.5) {
    for (const offset of [1.3, 2.8, 4.3]) {
      s.addLiquidParticle(5, column * 6 + offset, y, 0, 0);
      s.snow.active++; s.snow.mass++; s.snow.emitted++;
    }
  }
}
function mirror() {
  // Admission support must remain meaningful between GPU snapshots.
  s.liquidWGPU = staleGPU;
  s.snowScan(1 / 60, 0);
}
function falling(column, y) {
  const p = { x: column * 6 + 3, y, vx: 0, vy: 53, size: .5, phase: 0 };
  s.snow.grains.push(p); s.snow.mass++; s.snow.emitted++;
  return p;
}
function conserve(expected, label) {
  const water = s.liquidType.slice(0, s.liquidCount).filter(type => type === 0).length + s.rain.parked.length / 2;
  assert.equal(s.window.__particleSnow.stats().mass + water, expected, label + ': material count');
  assert.equal(s.snow.mass + water, expected, label + ': tracked mass');
  assert.equal(s.snow.emitted - s.snow.recycled - s.snow.collected, expected, label + ': budget');
}

{
  reset();
  for (let column = 396; column <= 404; column++) fillColumn(column, 0, 2);
  mirror();
  const p = falling(400, -1), initial = s.snow.mass, liquidBefore = s.liquidCount;
  s.updateSnow(1 / 60);
  assert.ok(s.snow.grains.includes(p), 'unsupported cloud cannot catch atmospheric snow');
  assert.ok(p.y > -.2, 'flake continues moving through the unsupported cloud');
  assert.equal(s.liquidCount, liquidBefore, 'cloud contact never deposits another solver particle');
  conserve(initial, 'unsupported cloud');
}

reset();
for (let column = 396; column <= 404; column++) fillColumn(column, 0, 2);
mirror();
const sheetMass = s.snow.mass;
{
  // Count the fixture's own grains per 6 px rain cell.
  const cells = {};
  for (let i = 0; i < s.liquidCount; i++) if (s.liquidType[i] === 5) {
    const key = s.rainCell(s.liquidX[i], s.liquidY[i]); cells[key] = (cells[key] || 0) + 1;
  }
  assert.ok(Object.values(cells).length && Object.values(cells).every(n => n > 3), 'persistent-identity fixture is a dense sheet');
}
s.liquidWGPU = null;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, sheetMass, 'unsupported snow stays in the persistent particle pool');
assert.equal(s.snow.grains.length, 0, 'readback cannot transfer a sheet into CPU weather motion');
assert.ok(s.liquidType.every(type => type === 5), 'unsupported snow retains its material identity');
conserve(sheetMass, 'persistent sheet');

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
  assert.equal(s.liquidCount, mass, 'detached near-floor powder remains in the contact solver');
  assert.equal(s.snow.grains.length, 0, 'near-floor support changes never switch motion models');
  assert.ok(s.liquidVY.every(vy => vy === 0), 'maintenance supplies no launch or falling impulse');
  conserve(mass, 'detached near-floor layer');
}

// Sharing a coarse bucket with grounded snow is not itself support. The
// ground height puts both grains inside the former six-pixel bucket.
reset();
s.liquidWorldSolidAt = (x, y) => y >= 160;
for (const y of [159.4, 156]) {
  s.addLiquidParticle(5, 2401, y, 0, 0);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
assert.equal(Math.floor(159 / 6), Math.floor(156 / 6), 'mixed fixture shares the former bucket');
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 2, 'support and flight share the persistent particle pool');
assert.equal(s.liquidY[0], 159.4, 'maintenance preserves the grounded grain');
assert.equal(s.snow.grains.length, 0, 'disconnected grains do not become weather flakes');
assert.equal(s.liquidY[1], 156, 'detached grain retains its actual position');
assert.equal(s.snowSupported(2401, 156), false, 'grounded neighbour cannot bridge the open gap');
assert.equal(s.snowBedContact(2401, 156), false, 'detached grain cannot become a landing surface');
conserve(2, 'mixed grounded and detached bucket');

// A sparse sloped edge can carry load through touching grains across a
// column boundary. Every connection fits within the contact-support tolerance.
reset();
const edge = [[2399.6, 127.4], [2400.5, 126.3], [2401.4, 125.2], [2402.3, 124.1]];
for (const [x, y] of edge) {
  s.addLiquidParticle(5, x, y, 0, 0);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
assert.notEqual(Math.floor(edge[0][0] / 6), Math.floor(edge[1][0] / 6),
  'sloped fixture crosses the former column boundary');
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, edge.length, 'actual contacts preserve the entire sloped edge');
assert.equal(s.snow.grains.length, 0, 'supported edge grains never release artificially');
assert.ok(s.snowBedContact(edge.at(-1)[0], edge.at(-1)[1] - 1.2),
  'the supported sloped edge catches new snow at an actual grain contact');
conserve(edge.length, 'cross-column edge');
s.removeLiquidParticle(0); s.snow.mass--; s.snow.collected++;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, edge.length - 1, 'removing the root preserves each detached grain in the contact solver');
assert.equal(s.snow.grains.length, 0, 'losing terrain support cannot trigger a group handoff');
assert.equal(s.snow.bed.size, 0, 'an unrooted component has no cached landing surface');
conserve(edge.length - 1, 'removed contact root');

// Maintenance must never rewrite moving grains at any readback age, even
// during intense airflow and when every particle becomes unsupported.
for (const gpu of [null, staleGPU, { simActive: true, readbackApplyGen: 2, getReadbackAge: () => 0 }]) {
  reset(); s.liquidWGPU = gpu;
  s.snowAir.active = true; s.snowAirAt = () => [320, -90, 260];
  const moving = [[2401, 125, 17, -60], [2413, 124, -11, 53], [2425, 123, 9, 0]];
  for (const [x, y, vx, vy] of moving) {
    s.addLiquidParticle(5, x, y, vx, vy);
    s.snow.active++; s.snow.mass++; s.snow.emitted++;
  }
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, moving.length, 'readback timing cannot remove moving solver grains');
  assert.equal(s.snow.grains.length, 0, 'no physical grain changes to weather motion');
  for (let i = 0; i < moving.length; i++) {
    assert.deepEqual([s.liquidX[i], s.liquidY[i], s.liquidVX[i], s.liquidVY[i]], moving[i],
      'maintenance retains exact position and both velocity components');
  }
  conserve(moving.length, 'persistent momentum');
}

// An atmospheric flake crosses its apex through finite acceleration, with
// no jump directly from rising to its eventual terminal falling speed.
reset();
const apex = falling(400, -220);
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
const fine = falling(400, -240), coarse = falling(406, -240);
fine.size = 0; coarse.size = 1; fine.vy = coarse.vy = 0;
s.updateSnow(1 / 120);
assert.ok(fine.vy > 0 && coarse.vy > fine.vy && coarse.vy < s.GRAVITY / 120,
  'drag begins descent gradually without a prescribed minimum speed');
for (let frame = 1; frame < 120; frame++) s.updateSnow(1 / 120);
assert.ok(Math.abs(fine.vy - 12) < 0.1 && Math.abs(coarse.vy - 54) < 0.1,
  'grain sizes converge to distinct terminal velocities relative to the moving air');
assert.ok(coarse.y - fine.y > 25, 'independent grain trajectories spread during descent');
conserve(2, 'size-dependent descent');

// The atmospheric cap is independent of existing physical material. A full
// weather budget must neither hold physical snow in place nor change its model.
reset();
for (let i = 0; i < s.SNOW_FLAKE_CAP; i++) falling(396 + i % 24, -160 - i % 60);
for (let i = 0; i < 3100; i++) {
  s.addLiquidParticle(5, 2370 + i % 120, -100 - Math.floor(i / 120) * 1.4, (i % 9) - 4, 53);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
}
const saturatedMass = s.snow.mass;
s.snowScan(1 / 60, 0);
assert.equal(s.liquidCount, 3100, 'full weather budget preserves all persistent physical grains');
assert.equal(s.snow.grains.length, s.SNOW_FLAKE_CAP, 'physical material consumes no atmospheric slots');
assert.equal(s.snowSpawn(2400, -250), null, 'new atmospheric snow remains bounded');
assert.ok(s.liquidVY.every(vy => vy === 53), 'maintenance retains every incoming vertical velocity');
conserve(saturatedMass, 'saturated flight');
const saturatedSave = JSON.parse(JSON.stringify(s.snowSave()));
reset(); s.snowRestore(saturatedSave);
assert.equal(s.snow.parked.length / 4, 3100, 'reload preserves every physical particle for streaming');
assert.equal(s.snow.grains.length, s.SNOW_FLAKE_CAP, 'reload preserves the complete atmospheric budget');
assert.equal(JSON.stringify(s.snowSave()), JSON.stringify(saturatedSave), 'particle positions and momentum round-trip exactly');
conserve(saturatedMass, 'saturated flight reload');

// Old saved powder enters persistent storage exactly once, including when
// the active pool is full. Migration preserves momentum and the material budget.
for (const cap of [7000, 0]) {
  reset(); const savedCap = s.SNOW_ACTIVE_CAP; s.SNOW_ACTIVE_CAP = cap;
  const legacy = [[2400, -100, 12, -42, 1, 1, .7, 1.2], [2420, -80, -18, 57, 1, 1, .4, .2]];
  s.snowRestore({ version: 2, particles: [], grains: legacy });
  s.updateSnow(0);
  assert.equal(s.snow.grains.length, 0, 'legacy physical powder migrates out of atmospheric motion');
  assert.equal(s.liquidCount, cap ? 2 : 0, 'migration honors active capacity');
  const migrated = s.snowSave();
  const rows = [];
  for (let i = 0; i < migrated.particles.length; i += 4) rows.push(migrated.particles.slice(i, i + 4));
  rows.sort((a, b) => a[0] - b[0]);
  assert.equal(JSON.stringify(rows), JSON.stringify(legacy.map(row => row.slice(0, 4))), 'migration preserves position and momentum');
  s.updateSnow(0);
  conserve(2, 'legacy powder migration');
  assert.equal(s.snowSave().particles.length / 4, 2, 'repeated updates cannot duplicate migrated powder');
  s.SNOW_ACTIVE_CAP = savedCap;
}

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

// Motion does not remove contact with a pile rooted in the ground. New
// weather falling onto a sliding bed must enter at its actual surface.
for (const reverse of [false, true]) {
  reset();
  s.addLiquidParticle(5, 2403, 127.4, 0, 0);
  s.snow.active = s.snow.mass = s.snow.emitted = 1;
  s.snowScan(1 / 60, 0);
  // A burst begins with separated grains, then reaches the same small
  // landing area within one frame. Array order must not compress deposits.
  for (let n = 0; n < 12; n++) {
    const p = falling(400, 124 - 2.2 * n);
    p.vy = 300;
  }
  if (reverse) s.snow.grains.reverse();
  s.updateSnow(0.05);
  assert.ok(s.liquidCount >= 4, 'burst fixture deposits several grains in the same frame');
  let minSpacing = Infinity;
  for (let i = 0; i < s.liquidCount; i++) for (let j = i + 1; j < s.liquidCount; j++) {
    minSpacing = Math.min(minSpacing, Math.hypot(s.liquidX[i] - s.liquidX[j], s.liquidY[i] - s.liquidY[j]));
  }
  assert.ok(minSpacing >= s.snowContactRadius() * 2 * 0.95,
    `same-frame deposits retain contact spacing in ${reverse ? 'reversed' : 'original'} array order (minimum ${minSpacing})`);
  conserve(13, 'same-frame batch deposition');
}

// A moving rooted pile remains a collision surface even while its grains
// exceed the former low-speed support gate.
for (const velocity of [[0, 53], [53, 0]]) {
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
  const top = Math.min(...s.liquidY);
  const p = falling(400, top - s.snowContactRadius() * 2 - .35), initial = s.snow.mass;
  s.updateSnow(1 / 60);
  assert.ok(!s.snow.grains.includes(p), 'returning snow cannot pass through a moving rooted pile');
  assert.equal(s.liquidCount, pileMass + 1, 'moving-bed contact deposits exactly one grain');
  assert.ok(s.liquidY[s.liquidCount - 1] < top, 'deposit stays at the actual upper surface');
  conserve(initial, 'moving rooted bed');
}

// A disconnected moving cloud still has no support, even when all its
// grains touch one another. Connectivity to terrain is the deciding fact.
for (const velocity of [[0, 53], [53, 0], [0, -53]]) {
  reset();
  fillColumn(400, 5, 19);
  for (let i = 0; i < s.liquidCount; i++) {
    [s.liquidVX[i], s.liquidVY[i]] = velocity;
  }
  mirror();
  assert.equal(s.snow.bed.size, 0, 'disconnected moving cloud supplies no terrain support');
  const p = falling(400, 29), initial = s.snow.mass, before = s.liquidCount;
  s.updateSnow(1 / 60);
  assert.ok(s.snow.grains.includes(p), 'unsupported cloud does not turn a free grain into deposited snow');
  assert.ok(p.y > 29.8, 'flake keeps descending through the unsupported cloud');
  assert.equal(s.liquidCount, before, 'disconnected cloud receives no deposited material');
  conserve(initial, 'disconnected moving cloud');
}

for (const firstRow of [20, 5]) {
  reset();
  fillColumn(400, firstRow, 20);
  // Run an actual fresh scan first: the tall supported pile must not be
  // mistaken for separated snow merely because its top is high in the sky.
  const pileMass = s.snow.mass;
  s.snowScan(1 / 60, 0);
  assert.equal(s.liquidCount, pileMass, 'terrain-supported pile stays in the contact solver');
  assert.equal(s.snow.grains.length, 0, 'supported pile does not spontaneously release');
  const top = Math.min(...s.liquidY);
  const p = falling(400, top - s.snowContactRadius() * 2 - .35), initial = s.snow.mass;
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
const detached = falling(400, 29), gapMass = s.snow.mass;
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
console.log('PASS persistent snow identity and momentum, atmospheric admission, rooted contact, migration, thaw metadata and exact material budgets');
