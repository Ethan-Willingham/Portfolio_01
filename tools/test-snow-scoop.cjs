// Scooping and releasing dry snow must preserve its material and mass across
// the shared particle pool, airborne powder, tank, and saved game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const arrays = ['liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidType',
  'liquidOrigin', 'liquidSleeping', 'liquidFrozen', 'liquidRestFrames'];
const s = {
  Math, window: { location: { search: '' } },
  cam: { x: 700, y: -180 }, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_MASS_CAP: 120000, SNOW_ACTIVE_CAP: 36000, SNOW_CPU_CAP: 7000,
  SNOW_FLAKE_CAP: 5400, LIQUID_MAX_PARTICLES: 65536, RAIN_ORIGIN: 3,
  LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5, LIQUID_SNOW_DENSITY: 3.2, LIQUID_SNOW_DIAMETER: 1.8,
  liquidCount: 0, liquidWGPU: null, liquidOps: [], LIQUID_OPS_MAX: 10000, liquidMutationSeq: 0,
  liquidWorldSolidAt: () => false, liquidPointInMiner: () => false, liquidLineClear: () => true,
  snowAir: { active: false }, snowAirReset: noop, hearthDevSupplies: () => false,
  player: { x: 1000, y: 80, vx: 0, vy: 0, dir: 1 },
  introPhase: 'done', gamePaused: false, gameOver: false, gameWon: false,
  shopOpen: false, shopState: 'closed', ledgerOpen: false, cargoManifestOpen: false,
  itemWheel: { open: false }, bathMode: false, skySlimeCapture: () => null,
  sfxPlay: noop, drilling: null
};
for (const key of arrays) s[key] = [];
s.addLiquidParticle = (type, x, y, vx, vy, origin = 0) => {
  const i = s.liquidCount++;
  [s.liquidType[i], s.liquidX[i], s.liquidY[i], s.liquidVX[i], s.liquidVY[i], s.liquidOrigin[i]] =
    [type, x, y, vx, vy, origin];
  s.liquidSleeping[i] = s.liquidFrozen[i] = s.liquidRestFrames[i] = 0;
  s.liquidMutationSeq++;
  return i;
};
s.removeLiquidParticle = i => {
  const last = --s.liquidCount;
  for (const key of arrays) { s[key][i] = s[key][last]; s[key].length = last; }
  s.liquidMutationSeq++;
};
vm.createContext(s);
for (const file of ['071-liquid-catalog', '073-liquid-deposits', '074-bath-service', '074-bath-silos',
  '075-liquid-tool', '156-particle-weather', '159-snow-physics']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', file + '.js'), 'utf8'), s);
}
function reset() {
  s.liquidCount = 0;
  for (const key of arrays) s[key].length = 0;
  s.liquidWorldSolidAt = () => false;
  s.SNOW_CPU_CAP = 7000;
  s.snowReset(true); s.siphonReset(); s.bathSiloReset(); s.mineralLiquidReset();
  s.bathSupplies = [0, 0, 0, 0, 0];
  s.player.x = 1000; s.player.y = 80; s.player.vx = s.player.vy = 0;
}
function dense(type, x, y) {
  if (type === 5) {
    assert.equal(s.snowParticle(x, y, 0, 0), true);
    s.snow.mass++; s.snow.emitted++;
  } else s.addLiquidParticle(type, x, y, 0, 0, 0);
}
function powder(x, y) {
  s.snow.grains.push({ x, y, vx: 4, vy: 18, size: .5, phase: 0, physical: true });
  s.snow.mass++; s.snow.emitted++;
}
function checkSnow(total, label) {
  const stats = s.window.__particleSnow.stats();
  assert.equal(stats.mass + s.siphon.tank[5], total, label + ': world plus tank');
  assert.equal(s.snow.mass, stats.mass, label + ': tracked world mass');
  assert.equal(s.snow.active, stats.active, label + ': tracked active particles');
  assert.equal(s.snow.emitted - s.snow.collected - s.snow.recycled - s.snow.melted,
    stats.mass, label + ': world boundary accounting');
  assert.equal(s.snow.melted, 0, label + ': no player-induced melting');
}

reset();
dense(5, 1015, 114); dense(5, 1018, 114); dense(0, 1020, 114); dense(2, 1022, 114);
powder(1016, 116);
const samples = [];
const taken = s.liquidToolExtract(1015, 114, 42, 20, { ry: 38, fromX: 1015, fromY: 100, samples });
assert.deepEqual(Array.from(taken), [1, 0, 1, 0, 0, 3], 'dense and airborne snow enter their own chamber');
assert.equal(samples[0].type, 5, 'snow intake effects retain their material');
s.siphon.tank = taken;
checkSnow(3, 'mixed extraction');
assert.equal(s.snow.collected, 3);
const released = s.liquidToolEmit(5, 3, 1050, 90, 20, 80);
s.siphon.tank[5] -= released;
assert.equal(released, 3, 'the entire snow chamber can be released');
assert.ok(s.liquidType.every(type => type === 5), 'released snow is never water');
assert.ok(s.liquidOrigin.every(origin => origin === s.RAIN_ORIGIN), 'snow uses its own persistence origin');
checkSnow(3, 'snow release');
assert.equal(s.snowSave().particles.length / 4, 3, 'released snow is saved exactly once in snow');
assert.equal(Object.keys(s.mineralLiquidSave().parked).length, 0, 'released snow is not duplicated in mineral persistence');

// Exercise the actual tool tick and full-load dump, including their chamber
// transfer loops, so adding a catalog entry cannot leave it behind in the tank.
reset();
dense(5, 1015, 114); dense(5, 1018, 114); dense(0, 1020, 114); powder(1016, 116);
s.siphon.equipped = true; s.siphon.power = 1;
s.siphonTick(.1);
assert.deepEqual(Array.from(s.siphon.tank), [1, 0, 0, 0, 0, 3]);
assert.equal(s.siphonTotal(), 4);
checkSnow(3, 'scoop tick');
s.siphon.selected = 0; s.siphonCycle();
assert.equal(s.siphon.selected, 5, 'tank selection includes snow');
const saved = JSON.parse(JSON.stringify(s.siphonSave()));
s.siphonRestore(saved);
assert.deepEqual(Array.from(s.siphon.tank), [1, 0, 0, 0, 0, 3], 'six chambers survive saving');
assert.equal(s.siphon.selected, 5, 'saved snow selection survives');
s.siphonDump(); s.siphonTick(.1);
assert.equal(s.siphonTotal(), 0, 'dump debits every released chamber');
assert.equal(s.liquidType.filter(type => type === 5).length, 3);
assert.equal(s.liquidType.filter(type => type === 0).length, 1, 'dump cannot turn snow into bath water');
checkSnow(3, 'mixed dump');

reset();
s.siphonRestore({ tank: [100, 20, 30, 40, 50], selected: 4 });
assert.deepEqual(Array.from(s.siphon.tank), [100, 20, 30, 40, 50, 0], 'legacy five-slot saves gain an empty snow chamber');
assert.equal(s.siphonTotal(), 240);
const legacyDump = s.liquidToolDump([2, 0, 1, 0, 0], 3, 1050, 90, 28, 0);
assert.deepEqual(Array.from(legacyDump), [2, 0, 1, 0, 0, 0], 'legacy five-slot callers stay finite');
s.siphonRestore({ tank: [15999, 0, 0, 0, 0, 50], selected: 5 });
assert.equal(s.siphon.tank[5], 1, 'snow shares the existing total capacity');
assert.equal(s.siphonTotal(), s.siphon.capacity);

reset();
s.siphon.tank[5] = 7;
assert.equal(s.bathWaterCount(), 0, 'dry snow supplies no bath water');
assert.equal(s.bathTakeWater(1), false, 'the bath cannot consume snow as water');
s.siphon.tank[0] = 2; s.bathSupplies[0] = 1;
assert.equal(s.bathTakeWater(3), true);
assert.equal(s.siphon.tank[5], 7, 'water withdrawal leaves dry snow untouched');
const before = JSON.stringify(s.snow);
s.liquidWorldSolidAt = () => true;
assert.equal(s.liquidToolEmit(5, 7, 1050, 90, 0, 80), 0, 'a blocked nozzle retains its snow');
assert.deepEqual(Array.from(s.liquidToolDump(s.siphon.tank, 7, 1050, 90, 28, 0)), [0, 0, 0, 0, 0, 0]);
assert.equal(JSON.stringify(s.snow), before, 'failed release does not change snow accounting');
assert.equal(s.siphon.tank[5], 7);

reset();
s.siphon.tank[5] = 4; s.SNOW_CPU_CAP = 0;
const parkedRelease = s.liquidToolEmit(5, 4, 1050, 90, 0, 80);
s.siphon.tank[5] -= parkedRelease;
assert.equal(parkedRelease, 4, 'a full active pool can preserve released snow in storage');
assert.equal(s.snow.parked.length / 4, 4);
checkSnow(4, 'parked release');
const snowSaved = JSON.parse(JSON.stringify(s.snowSave()));
s.snowReset(true); s.snowRestore(snowSaved);
checkSnow(4, 'parked save round trip');

console.log('Snow scoop material, accounting, release, legacy saves, and bath isolation passed.');
