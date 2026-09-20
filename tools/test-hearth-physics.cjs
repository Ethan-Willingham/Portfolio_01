// Local coal contacts, thermal progression and persistence without a browser.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/sluice/077-hearth-physics.js', 'utf8');
function fixture(fps = 60) {
  const s = { Math, console };
  vm.createContext(s); vm.runInContext(source, s);
  return { s, advance(seconds) {
    for (let i = 0; i < Math.round(seconds * fps); i++) s.hearthTick(1 / fps);
  } };
}
function near(a, b, tolerance = 1e-7, message = '') {
  assert(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
}
function checkBodies(bed) {
  for (const b of bed.chunks) {
    for (const key of ['x', 'y', 'vx', 'vy', 'r', 'angle', 'spin', 'seed', 'fuel', 'heat']) {
      assert(Number.isFinite(b[key]), `finite ${key}`);
    }
    assert(b.x >= b.r - 1e-7 && b.x <= 320 - b.r + 1e-7, 'side containment');
    assert(b.y <= 210 - b.r + 1e-7, 'floor containment');
    assert(b.fuel >= 0 && b.fuel <= 1, 'bounded fuel');
    assert(b.heat >= 0 && b.heat <= 1, 'bounded coal heat');
  }
  assert(bed.heat >= 0 && bed.heat <= 1 && bed.power >= 0 && bed.power <= 1, 'bounded output');
  assert(bed.sparks.length <= 64, 'bounded spark allocation');
}

{
  const { s, advance } = fixture();
  const lower = s.hearthAddChunk('boiler', 160, 195);
  const upper = s.hearthAddChunk('boiler', 160, 210 - lower.r * 2 - 20);
  advance(1);
  assert(upper.y + upper.r < 205, 'lower coal supports the upper piece before pickup');
  lower.held = true;
  const bookmark = { x: lower.x, y: lower.y };
  advance(2);
  near(upper.y + upper.r, 210, 0.05, 'coal falls through the detached hand bookmark to the floor');
  near(lower.x, bookmark.x); near(lower.y, bookmark.y);
  assert.equal(lower.fuel, 1, 'detaching a piece does not consume fuel');
  console.log('PASS picking up a support detaches it from all bed contacts');
}

{
  const { s, advance } = fixture();
  const bed = s.hearthBeds.boiler;
  for (let i = 0; i < 18; i++) assert(s.hearthAddChunk('boiler', 160, 12));
  assert.equal(s.hearthAddChunk('boiler', 20, 20), null, 'coal cap does not silently discard a piece');
  const fuel = bed.fuelSeconds;
  advance(15); checkBodies(bed);
  near(bed.fuelSeconds, fuel, 0, 'cold fuel conserved during a crowded drop');
  assert(bed.chunks.every(b => !b.lit && !b.ash && b.heat === 0), 'boiler never lights itself');
  let overlap = 0, speed = 0;
  for (let i = 0; i < bed.chunks.length; i++) {
    const a = bed.chunks[i]; speed = Math.max(speed, Math.hypot(a.vx, a.vy));
    for (let j = i + 1; j < bed.chunks.length; j++) {
      const b = bed.chunks[j];
      overlap = Math.max(overlap, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  assert(overlap < 0.5, `settled coal overlap ${overlap}`);
  assert(speed < 8, `pile has no perpetual bounce ${speed}`);
  const piece = bed.chunks[4], removed = s.hearthRemoveChunk('boiler', piece.id);
  assert.equal(removed, piece); near(bed.fuelSeconds + removed.fuel * removed.life, fuel, 1e-7);
  assert.equal(s.hearthRemoveChunk('boiler', piece.id), null, 'cannot retrieve a chunk twice');
  console.log('PASS 18-piece pile, bounded contact solve, no runaway, cold fuel conservation and removal');
}

{
  const { s, advance } = fixture();
  const bed = s.hearthBeds.boiler;
  const a = s.hearthAddChunk('boiler', 100, 190), b = s.hearthAddChunk('boiler', 133, 190);
  const far = s.hearthAddChunk('boiler', 285, 190);
  advance(1);
  assert(s.hearthIgnite('boiler')); advance(6);
  assert(a.lit && b.lit, 'adjacent loaded coal catches from a live chunk');
  assert(!far.lit && far.fuel === 1, 'a separated chunk cannot ignite through empty space');
  const fuel = bed.fuelSeconds;
  advance(10); near(fuel - bed.fuelSeconds, 20, 1e-6, 'two burning chunks consume two fuel-seconds per second');
  const hot = bed.heat;
  advance(65);
  assert(a.ash && b.ash && a.fuel === 0 && b.fuel === 0, 'burned pieces remain as ash');
  assert(bed.heat < hot && a.heat < 0.02, 'spent fire cools');
  assert.equal(bed.chunks.length, 3, 'fuel depletion does not remove physical ash');
  console.log('PASS ignition requires a source, local spread, burn rate, persistent ash and cooling');
}

{
  const { s, advance } = fixture();
  const b = s.hearthAddChunk('forge', 150, 5);
  advance(0.5); assert(!b.lit, 'forge pilot is not immediate ignition');
  advance(3.5); assert(b.lit, 'banked forge pilot starts settled coal');
  advance(6);
  const normal = s.hearthBeds.forge.power;
  s.hearthPump('forge'); s.hearthPump('forge'); s.hearthPump('forge');
  advance(1);
  assert(s.hearthBeds.forge.power > 0.8 && s.hearthBeds.forge.power > normal, 'bellows reaches forging output with one coal');
  const before = b.fuel * b.life;
  advance(1);
  assert(before - b.fuel * b.life > 1.3, 'extra air costs extra fuel');
  advance(60);
  const next = s.hearthAddChunk('forge', 200, 30);
  advance(4); assert(next.lit, 'pilot still works after previous fire burns out');
  console.log('PASS forge bootstrap, air boost, fuel cost and relighting');
}

{
  const runs = [];
  for (const fps of [30, 60, 144]) {
    const { s, advance } = fixture(fps);
    for (let i = 0; i < 8; i++) s.hearthAddChunk('boiler', 120 + i * 5, 20 - i * 6);
    s.hearthAddChunk('forge', 140, 40);
    advance(2); s.hearthIgnite('boiler');
    advance(3); s.hearthPump('boiler'); s.hearthPump('forge');
    advance(15); checkBodies(s.hearthBeds.boiler); checkBodies(s.hearthBeds.forge);
    runs.push(s.hearthSave());
  }
  for (let n = 1; n < runs.length; n++) {
    for (const kind of ['boiler', 'forge']) {
      near(runs[0][kind].time, runs[n][kind].time);
      near(runs[0][kind].heat, runs[n][kind].heat);
      for (let i = 0; i < runs[0][kind].chunks.length; i++) {
        for (const key of ['x', 'y', 'fuel', 'heat', 'angle']) near(runs[0][kind].chunks[i][key], runs[n][kind].chunks[i][key]);
      }
    }
  }
  console.log('PASS identical physics and combustion at 30, 60 and 144 FPS');
}

{
  const { s, advance } = fixture();
  const b = s.hearthAddChunk('boiler', 160, 0), held = s.hearthAddChunk('boiler', 50, 20);
  held.held = true; held.vx = 120; held.vy = 180;
  advance(2);
  near(held.x, 50); near(held.y, 20); assert.equal(held.fuel, 1, 'held coal is not consumed');
  s.hearthIgnite('boiler'); advance(12);
  const saved = JSON.parse(JSON.stringify(s.hearthSave()));
  const expectedFuel = s.hearthBeds.boiler.fuelSeconds;
  assert(s.hearthRestore(saved));
  near(s.hearthBeds.boiler.fuelSeconds, expectedFuel);
  const resumed = s.hearthBeds.boiler.chunks.find(c => c.id === b.id);
  near(resumed.fuel, b.fuel); assert(resumed.lit, 'saved live coal resumes live');
  const release = s.hearthBeds.boiler.chunks.find(c => c.id === held.id);
  assert(!release.held && release.vx === 0 && release.vy === 0, 'reload cancels a drag safely');
  advance(2); assert(release.y > held.y, 'released coal resumes gravity');
  assert(s.hearthAddChunk('boiler', 120, 0).id > Math.max(b.id, held.id), 'saved id sequence remains unique');
  const oldFuel = s.hearthBeds.boiler.fuelSeconds;
  s.hearthTick(1000);
  assert(oldFuel - s.hearthBeds.boiler.fuelSeconds < 1, 'long suspension does not burn through stock');
  checkBodies(s.hearthBeds.boiler);
  console.log('PASS save fuel and IDs, safe drag cancellation, reload and suspension clamp');
}

{
  const { s, advance } = fixture();
  assert.equal(s.hearthRestore(null), false);
  assert.equal(s.hearthRestore({ boiler: { chunks: 'bad' } }), false);
  assert(s.hearthRestore({ boiler: { chunks: [null, {
    id: 1, x: NaN, y: Infinity, vx: -Infinity, r: -50, seed: 'bad', fuel: -2,
    heat: 99, lit: true, held: true, life: 1,
  }, { id: 1, x: 9999, y: -9999, vx: 999999, fuel: 2 }], heat: 999, air: -5, pilot: true },
  forge: { chunks: Array.from({ length: 60 }, () => ({})) } }));
  assert(!s.hearthBeds.boiler.pilot && s.hearthBeds.forge.pilot, 'save cannot change the boiler ignition rule');
  assert.equal(s.hearthBeds.forge.chunks.length, 18, 'restore enforces capacity');
  assert.equal(new Set(s.hearthBeds.boiler.chunks.map(b => b.id)).size, 2, 'duplicate IDs repaired');
  const ash = s.hearthBeds.boiler.chunks[0];
  assert(ash.ash && !ash.lit && ash.fuel === 0, 'zero fuel cannot be resurrected');
  const before = s.hearthBeds.boiler.time;
  for (const bad of [NaN, Infinity, -1, 0, '1', null]) s.hearthTick(bad);
  assert.equal(s.hearthBeds.boiler.time, before);
  advance(3); checkBodies(s.hearthBeds.boiler); checkBodies(s.hearthBeds.forge);
  for (let i = 0; i < 100; i++) s.hearthPump('forge');
  checkBodies(s.hearthBeds.forge);
  s.hearthReset(); assert.equal(s.hearthBeds.boiler.chunks.length, 0);
  assert.equal(s.hearthBeds.forge.chunks.length, 0);
  assert.equal(s.hearthAddChunk('invalid', 0, 0), null);
  assert.equal(s.hearthIgnite('invalid'), false);
  console.log('PASS malformed save repair, capacity, bounded events and invalid input');
}
console.log('All hearth physics checks passed.');
