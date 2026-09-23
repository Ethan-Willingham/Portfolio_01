// Local coal contacts, thermal progression and persistence without a browser.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = ['combustion', 'fracture', 'geometry', 'physics'].map(n => fs.readFileSync('js/sluice/077-hearth-' + n + '.js', 'utf8')).join('\n');
function fixture(fps = 60) {
  const s = { Math, console };
  vm.createContext(s);
  const functions = [...source.matchAll(/^  function (\w+)\(/gm)].map(m => m[1]);
  vm.runInContext('(function(){' + source + '\nObject.assign(globalThis, {' + functions.join(',') + '});' +
    'globalThis.hearthHullCache=hearthHullCache;Object.defineProperty(globalThis,"hearthBeds",{get:function(){return hearthBeds;}});})();', s);
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
    assert(b.vertices.every(p => p[0] >= -0.4 && p[0] <= 320.4 && p[1] <= 210.4), 'polygon containment');
    near(b.fuel, b.volatile + b.carbon, 1e-10, 'combustible mass is conserved');
    assert(b.fuel >= 0 && b.fuel <= 1, 'bounded fuel');
    assert(b.heat >= 0 && b.heat <= 1, 'bounded coal heat');
  }
  assert(bed.heat >= 0 && bed.heat <= 1 && bed.power >= 0 && bed.power <= 1, 'bounded output');
  assert(bed.sparks.length <= 64, 'bounded spark allocation');
}

{
  const {s,advance}=fixture(), bed=s.hearthBeds.boiler;
  const lower=s.hearthAddChunk('boiler',160,180), upper=s.hearthAddChunk('boiler',160,110);
  for(const b of [lower,upper]){b.angle=0;b.r=b.baseR=30;b.shape=[[-1,-.6],[1,-.6],[1,.6],[-1,.6]];s.hearthHullCache.delete(b);s.hearthMass(b);}
  advance(3);
  lower.fuel=lower.carbon=0.08;lower.volatile=0;lower.moisture=0;
  const y=upper.y, kg=lower.dryKg, share=lower.fuelShare;
  advance(8);
  assert(!bed.chunks.includes(lower),'supported weight fractures a weakened lower coal');
  assert(upper.y>y+8,'upper coal falls as its support loses integrity');
  near(bed.chunks.filter(b=>b!==upper).reduce((n,b)=>n+b.dryKg,0),kg,1e-10,'fracture conserves dry reference mass');
  near(bed.chunks.filter(b=>b!==upper).reduce((n,b)=>n+b.fuelShare,0),share,1e-10,'fracture conserves paid fuel share');
  checkBodies(bed);
  const saved=JSON.parse(JSON.stringify(s.hearthSave()));s.hearthRestore(saved);
  assert.equal(JSON.stringify(s.hearthSave()),JSON.stringify(saved),'fragment shapes and damage survive saves');
  for(const b of bed.chunks){b.fuel=b.carbon=b.volatile=0;b.ash=true;}
  // Test bounded mineral accumulation without conflating combustion rates.
  const restored=s.hearthBeds.boiler;
  for(const b of restored.chunks){b.fuel=b.carbon=b.volatile=0;b.ash=true;}
  const minerals=restored.chunks.reduce((n,b)=>n+b.dryKg*0.16,0);
  advance(2);near(s.hearthAshMass(restored),minerals,1e-10,'burnout retains mineral mass');
  assert(restored.chunks.length===0 && restored.ash.length>4 && restored.ash.every(g=>g.y<=210),'ash grains settle on the grate');
  console.log('PASS loaded fuel fractures, stack collapses, mass persists, fragment saves and physical ash');
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
  near(Math.max(...s.hearthWorldHull(upper).map(p => p[1])), 210, 0.1, 'coal falls through the detached hand bookmark to the floor');
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
      overlap = Math.max(overlap, -Math.max(s.hearthFaceSeparation(s.hearthWorldHull(a), s.hearthWorldHull(b)).gap, s.hearthFaceSeparation(s.hearthWorldHull(b), s.hearthWorldHull(a)).gap));
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
  const a = s.hearthAddChunk('boiler', 80, 190), b = s.hearthAddChunk('boiler', 136, 190);
  const far = s.hearthAddChunk('boiler', 285, 190);
  advance(1);
  b.x += Math.max(...s.hearthWorldHull(a).map(p => p[0])) - Math.min(...s.hearthWorldHull(b).map(p => p[0])) - 0.1;
  advance(0.1); assert(s.hearthLightChunk(bed, a)); advance(10);
  assert(a.lit && b.lit, 'adjacent loaded coal catches from a live chunk');
  assert(!far.lit && far.fuel === 1, 'a separated chunk cannot ignite through empty space');
  const fuel = bed.fuelSeconds;
  advance(10); assert(fuel > bed.fuelSeconds, 'reactions consume finite fuel');
  assert(a.core < a.heat, 'the large core heats more slowly than the surface');
  const hot = bed.heat;
  advance(150);
  assert(bed.ash.length>0, 'burned pieces leave mineral grains');
  assert(bed.heat < hot && bed.ash.every(g=>g.heat<0.02), 'spent fire cools');
  near(s.hearthAshMass(bed), (a.dryKg+b.dryKg)*0.16,1e-9,'mineral ash mass persists');
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
  assert(s.hearthBeds.forge.power > 0.8 && s.hearthBeds.forge.power >= normal, 'bellows reaches forging output with one coal');
  const before = b.fuel * b.life;
  advance(1);
  assert(before - b.fuel * b.life > 1.3, 'extra air costs extra fuel');
  advance(150);
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
  s.hearthRestore({version:4,boiler:{chunks:Array.from({length:40},()=>({
    shape:[[-1,-1],[1,-1],[1,-1],[1,1],[-1,1]]
  }))}});
  const bed=s.hearthBeds.boiler;
  assert.equal(bed.chunks.length,24,'fragment saves have a bounded separate capacity');
  assert(bed.chunks.every(b=>!b.shape),'zero-length polygon edges are rejected');
  const minerals=bed.chunks.reduce((n,b)=>n+b.dryKg*.16,0);
  for(const b of bed.chunks){b.ash=true;b.fuel=b.volatile=b.carbon=0;}
  advance(3);
  assert.equal(bed.ash.length,128,'large burnouts merge into the bounded grain pool');
  near(s.hearthAshMass(bed),minerals,1e-10,'grain merging preserves mineral mass');
  const bounded=JSON.stringify(s.hearthSave());s.hearthRestore(JSON.parse(bounded));
  assert.equal(JSON.stringify(s.hearthSave()),bounded,'a full ash pool survives reload');
  console.log('PASS malformed save repair, capacity, bounded events and invalid input');
}
{
  function block(s, x, y) {
    const b = s.hearthAddChunk('boiler', x, y);
    b.angle = 0; b.r = b.baseR = 30;
    s.hearthHullCache.set(b, { vertices: [[-1,-0.5],[1,-0.5],[1,0.5],[-1,0.5]], area: 2, inertia: 5/12 });
    s.hearthMass(b); s.hearthWorldHull(b); return b;
  }
  const { s, advance } = fixture();
  const lower = block(s, 160, 195), upper = block(s, 160, 150);
  advance(4);
  near(upper.x, 160, 0.15, 'a centered face stack balances without sliding');
  near(upper.angle, 0, 0.003, 'flat contacts preserve the resting face');
  near(upper.y + 15, lower.y - 15, 0.15, 'visible faces touch despite overlapping bounding circles');
  assert(s.hearthInside(upper, upper.x + 28, upper.y + 13), 'picking includes a visible polygon corner');
  assert(!s.hearthInside(upper, upper.x, upper.y + 22), 'picking excludes empty space inside the old circle');
  upper.x = 204; upper.y = 150; s.hearthBeds.boiler.contacts = {};
  advance(2);
  assert(upper.y > 175, 'an unsupported center of mass tips off the lower piece');
  assert(Math.abs(upper.angle) > 0.2, 'off-center contacts impart real torque');
  lower.held = true;
  const slider = block(s, 60, 194); slider.vx = 170;
  advance(2);
  assert(slider.x < 150 && Math.abs(slider.vx) < 0.5, 'grate friction stops a sliding flat piece');
  console.log('PASS two-point face support, exact picking, overbalance torque and static friction');
}

{
  const { s, advance } = fixture();
  const b = s.hearthAddChunk('boiler', 160, 10), phases = new Set();
  b.generation=2; advance(1); s.hearthLightChunk(s.hearthBeds.boiler, b);
  let maxSmoke = 0, maxSteam = 0, lastFuel = b.fuel;
  for (let i = 0; i < 140 * 30; i++) {
    s.hearthTick(1/30); phases.add(b.stage);
    assert(b.fuel <= lastFuel + 1e-12, 'combustion never creates fuel'); lastFuel = b.fuel;
    near(b.fuel, b.volatile + b.carbon, 1e-12);
    maxSmoke = Math.max(maxSmoke, b.smoke); maxSteam = Math.max(maxSteam, b.steam);
    if (b.stage === 'coke') assert.equal(b.flame, 0, 'coke glow is not a persistent volatile flame');
  }
  for (const stage of ['drying','flaming','coke','embers']) assert(phases.has(stage), 'observable phase: ' + stage);
  assert(maxSmoke > 0.1 && maxSteam > 0.1, 'gas release and drying drive distinct visible emissions');
  assert(b.r < b.baseR * 0.46 && b.ash, 'fuel loss changes the collision hull and leaves an ash skeleton');
  assert(s.hearthBeds.boiler.ash.every(g=>g.heat<0.05), 'mineral grains cool after burnout');
  console.log('PASS drying, gas release, coke, embers, cooling ash and conserved burn reservoirs');
}

{
  const f = fixture(), s = f.s;
  for (let i = 0; i < 18; i++) s.hearthAddChunk('boiler', 160, 12);
  f.advance(12);
  const bed = s.hearthBeds.boiler;
  const buried = bed.chunks.reduce((a,b) => a.oxygen < b.oxygen ? a : b);
  const crowdedAir = buried.oxygen;
  assert(crowdedAir < 0.45, 'surrounding faces obstruct oxygen');
  for (const b of [...bed.chunks]) if (b !== buried) s.hearthRemoveChunk('boiler', b.id);
  f.advance(2);
  assert(buried.oxygen > crowdedAir + 0.3, 'opening the pile restores oxygen');
  s.hearthLightChunk(bed, buried); f.advance(28);
  const saved = JSON.parse(JSON.stringify(s.hearthSave()));
  f.advance(5); const normal = buried.fuel;
  s.hearthRestore(saved);
  for (let i = 0; i < 10; i++) { s.hearthPump('boiler'); f.advance(0.5); }
  assert(s.hearthBeds.boiler.chunks[0].fuel < normal, 'bellows consume more carbon from identical saved conditions');
  const cold = s.hearthAddChunk('boiler', 270, 20);
  f.advance(1); s.hearthWorldHull(cold);
  const openAir = s.hearthSurfaceAir(s.hearthBeds.boiler, cold);
  for (let i = 0; i < 4; i++) {
    const ash = s.hearthAddChunk('boiler', 30 + i * 30, 190);
    ash.fuel = ash.volatile = ash.carbon = 0; ash.ash = true; ash.coating = 1;
  }
  f.advance(2);
  assert(s.hearthSurfaceAir(s.hearthBeds.boiler, cold) < openAir, 'spent ash restricts the grate air supply');
  s.hearthBeds.boiler.ash.length=0;
  f.advance(2);
  assert(s.hearthBeds.boiler.ashLoad === 0, 'raked ash no longer obstructs underfire air');
  console.log('PASS packed-bed starvation, rearrangement, bellows fuel cost and ash obstruction');
}

{
  const { s, advance } = fixture();
  const old = { version: 1, boiler: { chunks: [
    { id: 51, x: 160, y: 190, r: 17, seed: 0.31, fuel: 0.4, life: 54, heat: 0.8, lit: true },
    { id: 82, x: 230, y: 190, r: 19, seed: 0.77, fuel: 1, life: 60, heat: 0, lit: false }
  ] } };
  s.hearthRestore(old);
  const b = s.hearthBeds.boiler.chunks[0];
  near(s.hearthBeds.boiler.fuelSeconds, 81.6, 1e-10, 'old paid fuel survives migration');
  assert.equal(b.volatile, 0, 'old partly burned coal resumes as carbon, without fresh volatile gas');
  assert.equal(b.baseR, 17, 'old paid coal retains its size');
  assert.equal(b.vertices.length, s.hearthHull(b).vertices.length, 'restored hull never retains vertices from the temporary seed');
  const shape = JSON.stringify(s.hearthHull(b).vertices), saved = s.hearthSave();
  s.hearthRestore(saved);
  assert.equal(JSON.stringify(s.hearthHull(s.hearthBeds.boiler.chunks[0]).vertices), shape, 'saved coal restores the same visible/contact geometry');
  advance(1); checkBodies(s.hearthBeds.boiler);
  console.log('PASS legacy fuel/size migration, carbon phase and seeded hull round-trip');
}
console.log('All hearth physics checks passed.');
