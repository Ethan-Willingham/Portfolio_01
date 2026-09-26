// Saved bath liquid migration and entry streaming, using the real fragment code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'js/sluice', name + '.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function fixture() {
  const s = {
    window: {}, TILE: 32, COLS: 320, TOTAL_ROWS: 1412,
    bathMode: false, bathFading: false, bathRoomReady: false,
    bathFloorsOwned: [true, false, false, false, false],
    liquidCatalog: ['Water', 'Oil', 'Brine', 'Nectar', 'Lumen'].map((name, id) => ({ name, id })),
    siphon: { tank: [0, 0, 0, 0, 0, 0], capacity: 16000 },
    liquidCount: 0, liquidX: [], liquidY: [], liquidType: [], liquidOrigin: [],
    LIQUID_MAX_PARTICLES: 20000, worldRainEnabled: false,
    cam: { x: 700, y: 19300 }, viewW: 1000, viewH: 650, worldScale: 1,
    bathThermal: { meanC: 20, totalCapacity: 0, migrationC: 0 },
    bathToolReset() {}, bathSyncCollision() {}, hearthRoomRestore() {},
    hearthRoomSave: () => ({}), hearthBeds: { boiler: { fuelSeconds: 0 } },
    skySlimeClamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    liquidToolSync() {},
    bathThermalTemperature: () => s.bathThermal.meanC,
    bathThermalReset() { s.bathThermal = { meanC: 20, totalCapacity: 0, migrationC: 0 }; },
    bathThermalSave: () => copy(s.bathThermal),
    bathThermalRestore(data) { if (data) Object.assign(s.bathThermal, data); },
    bathThermalSample() { s.bathThermal.totalCapacity = s.bathBasinCount(); },
    addLiquidParticle(type, x, y, vx, vy, origin) {
      if (s.liquidCount >= s.LIQUID_MAX_PARTICLES) return -1;
      const i = s.liquidCount++;
      s.liquidType[i] = type; s.liquidX[i] = x; s.liquidY[i] = y; s.liquidOrigin[i] = origin;
      return i;
    },
    removeLiquidParticle(i) {
      const last = --s.liquidCount;
      for (const key of ['liquidType', 'liquidX', 'liquidY', 'liquidOrigin']) {
        s[key][i] = s[key][last]; s[key].length = last;
      }
    },
    liquidSampleRect(x0, y0, x1, y1) {
      const counts = s.mineralLiquidParkedSampleRect(x0, y0, x1, y1);
      for (let i = 0; i < s.liquidCount; i++) {
        if (s.liquidX[i] >= x0 && s.liquidX[i] < x1 && s.liquidY[i] >= y0 && s.liquidY[i] < y1) counts[s.liquidType[i]]++;
      }
      return counts;
    }
  };
  vm.createContext(s);
  const floors = source('072-bath').match(/  var BATH_FLOORS = \[[\s\S]*?\n  \];/);
  assert(floors, 'real bath floor definitions are available');
  vm.runInContext(floors[0], s);
  for (const name of ['073-liquid-deposits', '074-bath-service', '074-bath-silos']) vm.runInContext(source(name), s);
  s.bathSiloReset();
  return s;
}
function seedBath(s, floor, type, count) {
  const F = s.BATH_FLOORS[floor], tub = F.tubs[0];
  assert(tub, 'fixture floor has a real tub');
  const cx = (tub[0] + tub[1] + 1) * s.TILE / 2, cy = F.fr * s.TILE;
  for (let i = 0; i < count; i++) s.mineralLiquidPark(type, cx + i % 80 * 0.25, cy + Math.floor(i / 80) * 0.25);
}
function parkedCount(s) { return Object.values(s.mineralLiquidParked).reduce((n, data) => n + data.length / 3, 0); }
function stores(s) { return Array.from({ length: 5 }, (_, type) => s.bathLiquidCount(type)); }
function liquidSignature(s) {
  const particles = [];
  for (const bin of Object.values(s.mineralLiquidSave().parked)) {
    for (let i = 0; i < bin.length; i += 3) particles.push(bin.slice(i, i + 3).join(':'));
  }
  return particles.sort();
}
function snapshot(s) { return copy({ bathhouse: s.bathServiceSave(), mineralLiquids: s.mineralLiquidSave() }); }
function restore(s, saved) {
  // The save loader restores real liquid before service state and its migration.
  s.mineralLiquidRestore(saved.mineralLiquids);
  s.bathServiceRestore(saved.bathhouse);
  return s.bathRecoverLegacyWater(saved.bathhouse);
}

{
  const s = fixture();
  seedBath(s, 0, 0, 150); seedBath(s, 1, 0, 30);
  seedBath(s, 0, 2, 73); seedBath(s, 3, 3, 11); seedBath(s, 4, 4, 9);
  s.mineralLiquidPark(0, 64, 128); s.mineralLiquidPark(2, 100, 300);
  s.addLiquidParticle(0, 110, 180, 0, 0, 0);
  s.bathThermal.meanC = 44; s.bathThermal.migrationC = 19;
  assert.equal(s.bathRecoverLegacyWater({ version: 6 }), 273);
  assert.deepEqual(stores(s), [180, 0, 73, 11, 9], 'every identity from the main and upper tubs remains dispensable');
  near(s.bathSiloTank(0).temp, (150 * 44 + 30 * 20) / 180);
  near(s.bathSiloTank(1).temp, 44); near(s.bathSiloTank(2).temp, 20);
  near(s.bathSilos.pendingHeat[4], 9 * 20);
  assert.equal(parkedCount(s), 2, 'only the two outdoor parked particles remain');
  assert.deepEqual(Array.from(s.mineralLiquidParkedSampleRect(0, 0, 500, 500)), [1, 0, 1, 0, 0]);
  assert.equal(s.liquidCount, 1, 'outdoor live water remains untouched');
  assert.equal(s.liquidX[0], 110); assert.equal(s.liquidY[0], 180);
  assert.equal(s.bathWater, 0); assert.equal(s.bathThermal.migrationC, 0); assert.equal(s.bathThermal.meanC, 20);
  const after = snapshot(s);
  assert.equal(s.bathRecoverLegacyWater({ version: 6 }), 0, 'repeating migration cannot reclaim the same particles');
  assert.deepEqual(snapshot(s), after);
  const reloaded = fixture();
  assert.equal(after.bathhouse.version, 7, 'the real service serializer marks the migration complete');
  assert.equal(restore(reloaded, after), 0);
  assert.deepEqual(stores(reloaded), stores(s));
  assert.equal(parkedCount(reloaded), 3, 'save packs the one live outdoor particle exactly once');
  assert.deepEqual(snapshot(reloaded), after, 'save and reload cannot duplicate migrated stock');
  console.log('PASS old main and upper tubs migrate with identity and temperature, leaving outdoor water untouched');
  console.log('PASS repeated migration and a real service/liquid save round trip conserve every drop');
}

{
  const s = fixture(), cap = s.BATH_SILO_CAPACITY;
  s.bathSiloPut(0, 0, cap, 30); s.bathSiloPut(1, 1, cap - 500, 35); s.bathSiloPut(2, 4, cap, 25);
  s.bathSiloQueue(0, 12, 30);
  seedBath(s, 0, 0, 900); seedBath(s, 0, 1, 500); seedBath(s, 1, 1, 30);
  seedBath(s, 1, 2, 13); seedBath(s, 0, 3, 7);
  s.bathThermal.meanC = 44;
  assert.equal(s.bathRecoverLegacyWater({ version: 3 }), 1450);
  assert.deepEqual(stores(s), [cap + 912, cap + 30, 13, 7, cap]);
  assert.deepEqual(Array.from(s.bathSilos.tanks, tank => [tank.type, tank.count]), [[0, cap], [1, cap], [4, cap]]);
  near(s.bathSiloTank(1).temp, ((cap - 500) * 35 + 500 * 44) / cap);
  assert.deepEqual(Array.from(s.bathSilos.pending), [912, 30, 13, 7, 0]);
  near(s.bathSilos.pendingHeat[0], 12 * 30 + 900 * 44);
  near(s.bathSilos.pendingHeat[1], 30 * 20); near(s.bathSilos.pendingHeat[2], 13 * 20);
  near(s.bathSilos.pendingHeat[3], 7 * 44);
  assert.equal(parkedCount(s), 0);
  console.log('PASS full and incompatible silos retain overflow, typed stock and its stored heat');
}

{
  for (const version of [7, 8]) {
    const s = fixture(); seedBath(s, 0, 0, 8105); seedBath(s, 1, 2, 17);
    s.bathThermal.meanC = 39; s.bathSiloPut(0, 0, 300, 23);
    const before = snapshot(s);
    assert.equal(s.bathRecoverLegacyWater({ version }), 0);
    assert.deepEqual(snapshot(s), before, 'deliberately filled modern tubs retain their water and heat');
  }
  const s = fixture(); seedBath(s, 0, 0, 10);
  assert.equal(s.bathRecoverLegacyWater(null), 0); assert.equal(parkedCount(s), 10);
  console.log('PASS version 7 and newer retain deliberately poured basin water without remigration');
}

{
  for (const [mode, fading] of [[false, false], [true, false], [false, true]]) {
    const s = fixture(); seedBath(s, 0, 0, 8105); s.bathMode = mode; s.bathFading = fading;
    s.mineralLiquidTick(1 / 60);
    assert.equal(s.liquidCount, 3600, 'ordinary streaming retains the 3600-particle budget');
    assert.equal(parkedCount(s), 4505);
    s.mineralLiquidTick(1 / 60);
    assert.equal(s.liquidCount, 3600, 'ordinary streaming still observes its cooldown');
    s.mineralLiquidTick(0.35);
    assert.equal(s.liquidCount, 7200); assert.equal(parkedCount(s), 905);
  }
  console.log('PASS outdoor and uncovered bath streaming keep the normal budget and cooldown');
}

{
  const original = fixture(); seedBath(original, 0, 0, 8105);
  const positions = liquidSignature(original);
  const saved = snapshot(original), s = fixture();
  assert.equal(restore(s, saved), 0);
  s.bathMode = true; s.bathFading = true; s.mineralLiquidClock = 0.35;
  s.mineralLiquidTick(1 / 60);
  assert.equal(s.liquidCount, 8105, 'existing bath water restores fully during the entry cover despite the cooldown');
  assert.equal(parkedCount(s), 0);
  for (let i = 0; i < 4; i++) s.mineralLiquidTick(1 / 60);
  s.bathFading = false; s.mineralLiquidTick(0.35);
  assert.equal(s.liquidCount, 8105); assert.equal(parkedCount(s), 0);
  assert.deepEqual(liquidSignature(s), positions, 'entry preserves every saved position and liquid identity');
  assert.equal(stores(s).reduce((a, b) => a + b, 0), 0, 'restoring deliberate water does not also create silo stock');
  const after = snapshot(s), next = fixture();
  restore(next, after); next.bathMode = true; next.bathFading = true; next.mineralLiquidTick(0);
  assert.equal(next.liquidCount, 8105); assert.equal(parkedCount(next), 0);
  assert.deepEqual(liquidSignature(next), positions);
  console.log('PASS saved water restores under the entry cover in one pass with no replay or save duplication');
}

{
  const s = fixture(); seedBath(s, 0, 0, 8105); s.LIQUID_MAX_PARTICLES = 6000;
  s.bathMode = true; s.bathFading = true; s.mineralLiquidTick(0);
  assert.equal(s.liquidCount, 5488, 'entry restoration still respects the solver reserve');
  assert.equal(s.liquidCount + parkedCount(s), 8105, 'capacity-limited restoration leaves excess safely parked');
  s.mineralLiquidTick(0);
  assert.equal(s.liquidCount, 5488); assert.equal(s.liquidCount + parkedCount(s), 8105);
  console.log('PASS entry restoration respects capacity and preserves excess parked water');
}
