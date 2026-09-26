// Saved bath migration and visible restoration, using the real fragment code.
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
    bathMode: false, bathFading: false, bathRoomReady: false, gamePaused: false,
    bathFloorsOwned: [true, false, false, false, false],
    liquidCatalog: ['Water', 'Oil', 'Brine', 'Nectar', 'Lumen'].map((name, id) => ({ name, id })),
    siphon: { tank: [0, 0, 0, 0, 0, 0], capacity: 16000 },
    liquidCount: 0, liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [], liquidOrigin: [],
    LIQUID_MAX_PARTICLES: 20000, worldRainEnabled: false,
    cam: { x: 700, y: 19300 }, viewW: 1000, viewH: 650, screenW: 1000, screenH: 650, worldScale: 1,
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
      s.liquidVX[i] = vx; s.liquidVY[i] = vy;
      return i;
    },
    removeLiquidParticle(i) {
      const last = --s.liquidCount;
      for (const key of ['liquidType', 'liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidOrigin']) {
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
  const curve = source('072-bath').match(/  function bathTubCurve\(F, tb\) \{[\s\S]*?\n  \}/);
  assert(curve, 'real bath curve is available');
  vm.runInContext('var BATH_CAT_C = 2;\n' + curve[0], s);
  for (const name of ['073-liquid-deposits', '074-bath-arrival', '074-bath-service', '074-bath-silos']) vm.runInContext(source(name), s);
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

function begin(s) {
  s.bathMode = true; s.bathFading = true;
  s.bathArrivalBegin();
}
function run(s, frames = 180, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) s.mineralLiquidTick(dt);
}
function seedReveal(s, count, floor = 0) {
  const F = s.BATH_FLOORS[floor], curve = s.bathTubCurve(F, F.tubs[0]);
  const center = (curve.x0 + curve.x1) / 2;
  // Distinct quarter-pixel positions in the center of the real basin.
  for (let i = 0; i < count; i++) {
    const x = center - 50 + i % 80 * 1.25;
    const y = curve.y0 + curve.D - 20 - Math.floor(i / 80) * 1.25;
    assert(y >= curve.y0 - 16 && y < curve.y0 + curve.depthAt(x) - 1);
    s.mineralLiquidPark(i % 5, x, y);
  }
}
function liveSignature(s) {
  const particles = [];
  for (let i = 0; i < s.liquidCount; i++) particles.push([s.liquidType[i], s.liquidX[i], s.liquidY[i]].join(':'));
  return particles.sort();
}

{
  for (const [mode, fading] of [[false, false], [true, false], [false, true], [true, true]]) {
    const s = fixture(); seedBath(s, 0, 0, 8105); s.bathMode = mode; s.bathFading = fading;
    s.mineralLiquidTick(1 / 60);
    assert.equal(s.liquidCount, 3600, 'ordinary streaming retains the 3600-particle budget');
    assert.equal(parkedCount(s), 4505);
    s.mineralLiquidTick(1 / 60);
    assert.equal(s.liquidCount, 3600, 'ordinary streaming still observes its cooldown');
    s.mineralLiquidTick(0.35);
    assert.equal(s.liquidCount, 7200); assert.equal(parkedCount(s), 905);
  }
  console.log('PASS normal streaming keeps the same budget and cooldown outside a controlled bath arrival');
}

{
  const s = fixture(); seedReveal(s, 8105);
  const expected = liquidSignature(s), stock = stores(s);
  begin(s); run(s, 50);
  assert.equal(s.liquidCount, 0, 'saved liquid waits until the fade clears');
  assert.equal(parkedCount(s), 8105);
  assert.equal(s.bathArrival[0].age, 0);
  assert.equal(s.bathArrivalVisibleWater(1621), 0, 'guest presentation uses visible water during arrival');
  s.bathFading = false;
  s.mineralLiquidClock = 0; s.mineralLiquidTick(0);
  assert.equal(s.liquidCount, 0, 'normal streaming cannot bypass controlled restoration');
  let previous = 0, growingFrames = 0;
  for (let i = 0; i < 210; i++) {
    s.mineralLiquidTick(1 / 60);
    assert(s.liquidCount >= previous, 'live mass increases monotonically without a solver consuming it');
    assert(s.liquidCount - previous <= Math.ceil(28000 / 60), 'one frame cannot dump the saved bath all at once');
    if (s.liquidCount > previous) growingFrames++;
    previous = s.liquidCount;
    assert.equal(s.liquidCount + parkedCount(s), 8105, 'live and pending together conserve the entire bath');
  }
  assert(growingFrames > 20, 'restoration is spread across many visible frames');
  assert.equal(s.liquidCount, 8105); assert.equal(parkedCount(s), 0);
  assert.deepEqual(liveSignature(s), expected, 'every original saved position and material reappears exactly once');
  assert.deepEqual(stores(s), stock, 'arrival never draws from or creates silo stock');
  assert.equal(s.bathArrival, null, 'finished cosmetic state expires');
  assert.equal(s.bathArrivalVisibleWater(1621), 1621);
  console.log('PASS saved liquid rebuilds visibly over many frames after fade, preserving positions, identity and quantity');
}

{
  const s = fixture(); seedReveal(s, 8105); begin(s); s.bathFading = false;
  run(s, 28); assert(s.liquidCount > 0 && parkedCount(s) > 0);
  const removed = s.mineralLiquidParkedExtractRect(768, 19456, 1600, 19712, 2, 137);
  assert.equal(removed, 137);
  const expected = liquidSignature(s);
  run(s, 210);
  assert.equal(s.liquidCount, 8105 - removed); assert.equal(parkedCount(s), 0);
  assert.deepEqual(liveSignature(s), expected, 'consumed parked particles cannot return from a stale reveal queue');
  console.log('PASS evaporation or extraction during reveal cannot resurrect consumed parked liquid');
}

{
  const s = fixture(); seedReveal(s, 8105); begin(s); s.bathFading = false; run(s, 35);
  const before = snapshot(s), live = liveSignature(s), arrival = copy(s.bathArrival);
  s.gamePaused = true; run(s, 90);
  assert.deepEqual(snapshot(s), before); assert.deepEqual(liveSignature(s), live);
  assert.deepEqual(copy(s.bathArrival), arrival, 'paused time cannot advance the wavefront');
  s.gamePaused = false; run(s, 210);
  assert.equal(s.liquidCount, 8105); assert.equal(parkedCount(s), 0);
  console.log('PASS pause freezes restoration and resume continues without lost or duplicated liquid');
}

{
  const s = fixture(); seedReveal(s, 8105); s.LIQUID_MAX_PARTICLES = 6000;
  const expected = liquidSignature(s);
  begin(s); s.bathFading = false; run(s, 240);
  assert.equal(s.liquidCount, 5488, 'restoration retains the solver reserve');
  assert.equal(parkedCount(s), 2617); assert(s.bathArrival[0].remaining > 0);
  const held = copy(s.bathArrival); run(s, 90);
  assert.deepEqual(copy(s.bathArrival), held, 'the reveal waits when there is no particle capacity');
  s.LIQUID_MAX_PARTICLES = 20000; run(s, 240);
  assert.equal(s.liquidCount, 8105); assert.equal(parkedCount(s), 0);
  assert.deepEqual(liveSignature(s), expected);
  console.log('PASS capacity pressure preserves pending liquid and retries when space becomes available');
}

{
  const s = fixture(); seedReveal(s, 2000);
  const expected = liquidSignature(s), add = s.addLiquidParticle;
  begin(s); s.bathFading = false;
  s.addLiquidParticle = () => -1; run(s, 180);
  assert.equal(s.liquidCount, 0); assert.equal(parkedCount(s), 2000);
  s.addLiquidParticle = add; run(s, 210);
  assert.deepEqual(liveSignature(s), expected);
  console.log('PASS a rejected solver insertion retains the exact pending parcel for a later retry');
}

{
  const s = fixture(); seedReveal(s, 8105);
  const expected = liquidSignature(s);
  begin(s); s.bathFading = false; run(s, 35);
  assert(s.liquidCount > 0 && parkedCount(s) > 0);
  // Mirror the exit callback. A fast reentry can still have active bath water.
  s.bathMode = false; s.bathArrivalReset();
  assert.deepEqual(liquidSignature(s), expected);
  begin(s);
  assert.equal(s.liquidCount, 0, 'reentry reparks previously active bath water');
  assert.equal(parkedCount(s), 8105); run(s, 20); assert.equal(s.liquidCount, 0);
  s.bathFading = false; run(s, 210);
  assert.deepEqual(liveSignature(s), expected);
  console.log('PASS leaving and immediately reentering midway preserves all pending and live water');
}

{
  const s = fixture(); seedReveal(s, 8105); s.bathThermal.meanC = 39;
  s.bathSiloPut(0, 0, 300, 23);
  const expected = liquidSignature(s);
  begin(s); s.bathFading = false; run(s, 35);
  assert(s.liquidCount > 0 && parkedCount(s) > 0);
  const saved = snapshot(s), reloaded = fixture();
  assert.equal(restore(reloaded, saved), 0);
  assert.equal(reloaded.bathArrival, null, 'loading discards only transient visual state');
  assert.equal(parkedCount(reloaded), 8105); assert.equal(reloaded.liquidCount, 0);
  assert.equal(reloaded.bathThermal.meanC, 39); assert.deepEqual(stores(reloaded), stores(s));
  begin(reloaded); reloaded.bathFading = false; run(reloaded, 210);
  assert.deepEqual(liveSignature(reloaded), expected);
  assert.deepEqual(stores(reloaded), stores(s));
  console.log('PASS saving halfway through captures each parcel once and a reload reveals that same water');
}

{
  const s = fixture(); s.bathSiloPut(0, 0, 900, 35);
  const before = snapshot(s);
  begin(s); assert.equal(s.bathArrival, null); s.bathFading = false; run(s, 210);
  assert.equal(s.liquidCount, 0); assert.equal(parkedCount(s), 0);
  assert.deepEqual(snapshot(s), before, 'a dry tub and its stored silo stock stay untouched');
  console.log('PASS dry tubs remain dry without draining their silos');
}

{
  const s = fixture(); seedReveal(s, 4000); seedReveal(s, 2000, 1);
  s.bathFloorsOwned[1] = true;
  const expected = liquidSignature(s);
  begin(s); s.bathFading = false; run(s, 210);
  assert.equal(s.liquidCount, 4000); assert.equal(parkedCount(s), 2000);
  assert.equal(s.bathArrival.length, 1); assert.equal(s.bathArrival[0].floor, 1);
  assert.equal(s.bathArrival[0].age, 0, 'hidden upper floor does not reveal off camera');
  // Scroll so the upper floor is visible and the main basin is out of residency.
  s.cam.y = 18900; s.screenH = s.viewH = 400;
  run(s, 210);
  assert.equal(s.liquidCount, 2000); assert.equal(parkedCount(s), 4000);
  assert.deepEqual(liquidSignature(s), expected, 'scrolling preserves both rooms and restores only the visible one');
  console.log('PASS invisible upper floors remain parked until their room becomes visible');
}

{
  const s = fixture(); seedReveal(s, 1000, 1);
  begin(s); s.bathFading = false;
  const r = s.bathArrival[0]; r.emitted = 1;
  // A hidden room must not scan every live particle to draw a clipped reflection.
  s.bathArrivalSurface = () => { throw new Error('sampled an offscreen reflection'); };
  s.bathArrivalDraw({});
  r.remaining = 0;
  for (let i = 0; i < 50; i++) s.bathArrivalTick(1 / 60);
  assert.equal(s.bathArrival, null, 'completed reflections retire even after scrolling away');
  console.log('PASS offscreen reflections skip particle scans and expire without revisiting the room');
}
