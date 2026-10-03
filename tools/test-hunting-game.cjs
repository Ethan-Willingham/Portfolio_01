// NODE_PATH=/path/to/bundled/node_modules node tools/test-hunting-game.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { TUNING: T, World, launch, position, hitPixel, lookoutPace } = require('../js/hunting-physics.js');
const { DEER_LEVELS, Campaign, animalArt } = require('../js/hunting-campaign.js');
const masks = Object.fromEntries(DEER_LEVELS.map(d => {
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../assets/hunting/deer-' + d.level + '-v4.png')));
  return ['deer-' + d.level, { ...d, width: png.width, height: png.height, alpha: Uint8Array.from({ length: png.width * png.height }, (_, i) => png.data[i * 4 + 3]) }];
}));
const art = masks['deer-1'];
function check(name, run) { run(); console.log('PASS ' + name); }
function advance(world, seconds, input = {}) { for (let i = 0; i < Math.round(seconds * 120); i++) world.step(1 / 120, input); }
function scene(facingRight = true) {
  const world = new World(art, 11);
  world.deer = [world.deer[0]];
  Object.assign(world.deer[0], { x: 0, y: .8, previousX: 0, previousY: .8, facingRight, pause: 999 });
  world.wind = 0;
  return world;
}
function aimFor(world, u, v, wind = 0) {
  const deer = world.deer[0], man = world.hunter;
  const art = world.animalArt(deer);
  const targetX = deer.x + (u - .5) * art.width / T.pixelsPerUnit;
  const dy = deer.y - man.y;
  let time = Math.hypot(targetX - man.x, dy) / T.muzzleSpeed;
  for (let i = 0; i < 20; i++) time = Math.hypot(targetX - man.x - .5 * wind * T.windStrength * time * time, dy) / T.muzzleSpeed;
  const height = v * art.height / T.pixelsPerUnit;
  const vz = (height - T.standHeight + .5 * T.gravity * time * time) / time;
  const duration = (vz + Math.sqrt(vz * vz + 2 * T.gravity * T.standHeight)) / T.gravity;
  const ratio = duration / time;
  return { x: man.x + (targetX - man.x - .5 * wind * T.windStrength * time * time) * ratio, y: man.y + dy * ratio };
}
check('all five deer sprites have binary alpha and their authored sizes', () => {
  for (const d of DEER_LEVELS) {
    const mask = masks['deer-' + d.level]; assert.equal(mask.width, d.width);
    assert.ok(mask.alpha.every(a => a === 0 || a === 255));
  }
  assert.ok(art.alpha.some(a => a === 0)); assert.ok(art.alpha.some(a => a === 255));
});
check('each deer silhouette has exactly four separate feet at game resolution', () => {
  for (const mask of Object.values(masks)) {
    const floor = Math.floor(mask.height * .85), pixels = new Set();
    for (let y = floor; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.alpha[y * mask.width + x]) pixels.add(y * mask.width + x);
    let feet = 0;
    while (pixels.size) {
      feet++; const first = pixels.values().next().value, queue = [first]; pixels.delete(first);
      while (queue.length) {
        const id = queue.pop(), x = id % mask.width, y = Math.floor(id / mask.width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy, next = yy * mask.width + xx;
          if (xx >= 0 && xx < mask.width && yy >= floor && yy < mask.height && pixels.has(next)) { pixels.delete(next); queue.push(next); }
        }
      }
    }
    assert.equal(feet, 4, 'level ' + mask.level + ' must have four distinct hooves');
  }
});
check('a still-air round lands exactly at its aim, independent of integration steps', () => {
  for (const aim of [{ x: 0, y: 3 }, { x: -8, y: 1 }, { x: 6, y: 5 }]) {
    const shot = launch({ x: .3, y: T.muzzleY }, aim);
    const end = position(shot, shot.duration);
    assert.ok(Math.abs(end.x - aim.x) < 1e-10 && Math.abs(end.y - aim.y) < 1e-10 && Math.abs(end.h) < 1e-10);
  }
});
check('wind deflects longer shots more, without changing their flight duration', () => {
  const short = launch({ x: 0, y: -3.9 }, { x: 0, y: 0 }, .8);
  const long = launch({ x: 0, y: -3.9 }, { x: 0, y: 5 }, .8);
  assert.ok(position(long, long.duration).x > position(short, short.duration).x * 4);
  assert.equal(long.duration, launch(long.origin, { x: 0, y: 5 }, 0).duration);
});
check('opaque vitals, body wounds, and transparent pixels follow the actual sprite', () => {
  assert.equal(hitPixel(art, true, T.vitalsX, T.vitalsY), 'vitals');
  assert.equal(hitPixel(art, true, .4, .55), 'wound');
  assert.equal(hitPixel(art, true, .35, .1), 'transparent');
  assert.equal(hitPixel(art, false, 1 - T.vitalsX, T.vitalsY), 'vitals');
  assert.equal(hitPixel(art, false, .6, .55), 'wound');
});
check('a swept shot through either mirrored chest is recovered after a short run', () => {
  for (const facing of [true, false]) {
    const world = scene(facing);
    world.fire(aimFor(world, facing ? T.vitalsX : 1 - T.vitalsX, T.vitalsY));
    advance(world, .6);
    assert.equal(world.deer[0].state, 'fleeing');
    assert.ok(world.deer[0].bleed > 0);
    advance(world, 2);
    assert.equal(world.recovered, 1);
  }
});
check('wind compensation still resolves the intended sprite pixel', () => {
  for (const wind of [-.9, .9]) {
    const world = scene(); world.wind = wind;
    world.fire(aimFor(world, T.vitalsX, T.vitalsY, wind)); advance(world, 2.5);
    assert.equal(world.recovered, 1);
  }
});
check('a shot through the leg gap is a miss, while a body wound can escape', () => {
  let world = scene(); world.fire(aimFor(world, .35, .1)); advance(world, .7);
  assert.equal(world.wounded, 0); assert.equal(world.recovered, 0);
  assert.equal(world.deer[0].state, 'grazing');
  assert.ok(world.events.some(event => event.type === 'miss'));
  world = scene(); world.fire(aimFor(world, .4, .55)); advance(world, 3);
  assert.equal(world.wounded, 1); assert.equal(world.escaped, 1); assert.equal(world.recovered, 0);
});
check('an empty magazine starts one timed reload and cannot fire while reloading', () => {
  const world = scene(); for (let i = 0; i < 5; i++) assert.equal(world.fire({ x: 8, y: 5 }), true);
  assert.equal(world.shots, 5); assert.equal(world.hunter.ammo, 0);
  assert.equal(world.fire({ x: 8, y: 5 }), false); assert.ok(world.hunter.reload > 0);
  assert.equal(world.fire({ x: 8, y: 5 }), false); assert.equal(world.shots, 5);
  advance(world, 1.2); assert.equal(world.hunter.ammo, 5); assert.equal(world.hunter.reload, 0);
});
check('the hunter stays on the stand and downed deer do not block repopulation', () => {
  const world = scene(); advance(world, 1, { move: 1 }); assert.equal(world.hunter.x, .7);
  advance(world, 1, { move: -1 }); assert.equal(world.hunter.x, -.7);
  world.deer[0].state = 'down'; world.spawnTimer = .01; advance(world, .1);
  assert.ok(world.deer.some(deer => deer.state !== 'down'));
  advance(world, 12); assert.ok(!world.deer.some(deer => deer.id === 1));
});
check('seeded outings and fast-forward use the same fixed-step simulation', () => {
  const a = new World(art, 92), b = new World(art, 92);
  advance(a, 8); for (let i = 0; i < 8; i++) advance(b, 1);
  assert.deepEqual(a.deer, b.deer); assert.equal(a.wind, b.wind);
});
check('free walking is bounded, diagonal speed is normalized, and the stand needs proximity', () => {
  const world = new World(art, 11, { freeWalk: true }); world.deer = [];
  assert.equal(world.hunter.x, -7.6); assert.equal(world.hunter.mounted, false); assert.equal(world.toggleStand(), false);
  const x = world.hunter.x, y = world.hunter.y; advance(world, 1, { move: 1, moveY: 1 });
  assert.ok(Math.abs(Math.hypot(world.hunter.x - x, world.hunter.y - y) - T.walkSpeed) < 1e-8);
  Object.assign(world.hunter, { x: 0, y: -4.2 }); assert.equal(world.toggleStand(), true); assert.equal(world.hunter.height, T.standHeight);
  advance(world, 1, { move: 1, moveY: 1 }); assert.equal(world.hunter.x, .7); assert.equal(world.hunter.y, T.muzzleY);
  assert.equal(world.toggleStand(), true); assert.equal(world.hunter.height, 1.1);
  advance(world, 10, { moveY: 1 }); assert.equal(world.hunter.y, 2.5);
});
check('the boar uses its own opaque chest and reverse-direction shots still recover', () => {
  const boar = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../assets/hunting/boar-v3.png')));
  const mask = { width: boar.width, height: boar.height, alpha: Uint8Array.from({ length: boar.width * boar.height }, (_, i) => boar.data[i * 4 + 3]), vitalsX: .67, vitalsY: .45, radius: .1 };
  assert.equal(hitPixel(mask, true, .67, .45), 'vitals');
  assert.equal(hitPixel(mask, false, .33, .45), 'vitals');
  const world = new World(mask, 71, { freeWalk: true, species: 'boar' });
  Object.assign(world.hunter, { x: 0, y: 3, height: 1.1 });
  world.deer = [world.deer[0]]; Object.assign(world.deer[0], { x: 0, y: .8, previousX: 0, previousY: .8, pause: 999, facingRight: true });
  world.wind = 0;
  const targetX = (.67 - .5) * mask.width / T.pixelsPerUnit, dy = .8 - world.hunter.y;
  const time = Math.hypot(targetX, dy) / T.muzzleSpeed, h = .45 * mask.height / T.pixelsPerUnit;
  const vz = (h - 1.1 + .5 * T.gravity * time * time) / time;
  const duration = (vz + Math.sqrt(vz * vz + 2 * T.gravity * 1.1)) / T.gravity;
  world.fire({ x: targetX * duration / time, y: world.hunter.y + dy * duration / time });
  advance(world, 3); assert.equal(world.recovered, 1);
});
check('wounded escapes carry a profile and leave a blood trail', () => {
  const world = scene(); world.fire(aimFor(world, .4, .55)); advance(world, 3);
  assert.ok(world.blood.length > 2); const escape = world.events.find(e => e.type === 'escape');
  assert.equal(escape.animal.species, 'deer'); assert.ok(Number.isInteger(escape.animal.seed));
});
check('every deer level uses its own shoulder mask for mirrored shots and recovery profiles', () => {
  const c = new Campaign();
  for (const d of DEER_LEVELS) for (const facingRight of [true, false]) {
    const mask = masks['deer-' + d.level];
    assert.equal(hitPixel(mask, facingRight, facingRight ? d.vitalsX : 1 - d.vitalsX, d.vitalsY), 'vitals');
    const world = new World(art, 90, { animal: (species, seed) => c.animal(species, seed, d.level), artFor: profile => masks[animalArt(profile)] });
    world.deer = [world.deer[0]];
    Object.assign(world.deer[0], { x: 0, y: .8, previousX: 0, previousY: .8, facingRight, pause: 999 }); world.wind = 0;
    world.fire(aimFor(world, facingRight ? d.vitalsX : 1 - d.vitalsX, d.vitalsY)); advance(world, 2.5);
    assert.equal(world.recovered, 1, 'level ' + d.level + ' / facing ' + facingRight);
    assert.equal(world.events.find(e => e.type === 'recovered').animal.level, d.level);
  }
});
function lookoutScene(mask = art, facingRight = true, depth = 90) {
  const world = new World(mask, 101, { lookout: true, windForce: 0 });
  world.spawnTimer = 999;
  const deer = world.spawn(0, depth);
  Object.assign(deer, { facingRight, state: 'grazing', pause: 999, visit: 999 });
  return world;
}
function sightFor(world, deer, u, v, wind = 0) {
  const size = world.animalSize(deer), x = deer.x + (u - .5) * size.width;
  const speed = world.hunter.muzzleSpeed, depth = deer.y - world.hunter.y;
  let flight = Math.hypot(x - world.hunter.x, depth) / speed;
  for (let i = 0; i < 20; i++) flight = Math.hypot(x - world.hunter.x - .5 * wind * T.windStrength * flight * flight, depth) / speed;
  const compensatedX = x - .5 * wind * T.windStrength * flight * flight;
  const sightHeight = v * size.height + .5 * T.gravity * flight * flight;
  return { x: compensatedX * 100 / depth, y: 100, h: world.hunter.height + (sightHeight - world.hunter.height) * 100 / depth };
}
check('the lookout starts with an empty distant field and cannot be moved or dismounted', () => {
  const world = new World(art, 7, { lookout: true, freeWalk: true });
  assert.equal(world.deer.length, 0);
  assert.equal(world.hunter.height, T.lookoutEyeHeight);
  assert.equal(world.hunter.muzzleSpeed, T.lookoutMuzzleSpeed);
  assert.equal(world.toggleStand(), false);
  advance(world, 1, { move: 1, moveY: 1 });
  assert.equal(world.hunter.x, 0); assert.equal(world.hunter.y, 0);
  assert.deepEqual(world.critters.map(c => c.kind).sort(), ['owl', 'squirrel']);
  assert.equal(world.ambient, world.critters);
});
check('new arrivals offer finite positive-speed assistance and can leave while waiting is held', () => {
  const world = new World(art, 31, { lookout: true });
  world.critterTimer = 999;
  world.spawnTimer = .01; advance(world, .02);
  const deer = world.deer[0];
  assert.ok(deer.y >= T.lookoutNear && deer.y <= T.lookoutFar);
  assert.equal(world.opportunity, 1);
  const arrival = world.events.find(event => event.type === 'arrival');
  assert.equal(arrival.id, deer.id); assert.equal(arrival.animal.species, 'deer');
  const helped = lookoutPace(true, false, 2.4), expired = lookoutPace(true, false, 0);
  assert.ok(helped.clock > 1 && helped.simulation > 1);
  assert.ok(expired.clock > helped.clock && expired.simulation > helped.simulation);
  assert.deepEqual(lookoutPace(false, false, 2.4), { clock: 1, simulation: 1 });
  assert.deepEqual(lookoutPace(true, true, 2.4), { clock: 1, simulation: 1 });
  world.spawnTimer = 999;
  const x = deer.x; advance(world, 1);
  assert.notEqual(deer.x, x);
  advance(world, T.lookoutVisitMax + T.lookoutDepartureSeconds);
  assert.ok(!world.deer.some(d => d.id === deer.id));
  assert.ok(world.events.some(event => event.type === 'departed' && event.id === deer.id));
});
check('default near and distant arrivals are visible before their attention event, preserving explicit fixtures', () => {
  const projectedX = animal => T.width / 2 + T.lookoutFocal * animal.x / animal.y;
  let nearest = Infinity, farthest = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const world = new World(art, seed, { lookout: true });
    for (const animal of [world.spawn(), world.spawn(undefined, 24), world.spawn(undefined, 145),
      world.spawnCritter('squirrel'), world.spawnCritter('squirrel', undefined, 20), world.spawnCritter('owl', undefined, 145)]) {
      const x = projectedX(animal);
      assert.ok(x >= 24 && x <= T.width - 24, animal.species + ' at depth ' + animal.y + ' must arrive in view');
      nearest = Math.min(nearest, animal.y); farthest = Math.max(farthest, animal.y);
    }
    assert.equal(world.spawn(130, 24).x, 130);
    assert.equal(world.spawnCritter('squirrel', -130, 20).x, -130);
  }
  assert.equal(nearest, 20); assert.equal(farthest, 145);
});
check('scope rays share a direction at every reference depth while bullets visibly drop and drift', () => {
  const world = new World(art, 23, { lookout: true });
  const shallow = launch(world.hunter, { x: 8, y: 80, h: 2 }, .8);
  const deep = launch(world.hunter, { x: 12, y: 120, h: -3 }, .8);
  assert.equal(shallow.dx, deep.dx); assert.equal(shallow.dy, deep.dy);
  assert.ok(Math.abs(shallow.vz - deep.vz) < 1e-10);
  for (const t of [.1, .4]) {
    const bullet = position(shallow, t);
    assert.ok(Math.abs(bullet.h - (12 + shallow.vz * t - .5 * T.gravity * t * t)) < 1e-10);
    assert.ok(Math.abs(bullet.x - (shallow.dx * 150 * t + .5 * .8 * T.windStrength * t * t)) < 1e-10);
  }
  assert.ok(world.sight({ x: 10, y: 100, h: -25 }).h < 0);
  const sky = launch(world.hunter, { x: 0, y: 100, h: 70 });
  assert.equal(sky.duration, T.lookoutMaxFlight);
});
check('pointing directly at a far shoulder misses low, while holdover and wind correction hit actual mirrored pixels', () => {
  const world = lookoutScene(art, true, 140), deer = world.deer[0], size = world.animalSize(deer);
  const shoulderX = deer.x + (T.vitalsX - .5) * size.width, h = T.vitalsY * size.height;
  world.fire({ x: shoulderX * 100 / deer.y, y: 100, h: 12 + (h - 12) * 100 / deer.y });
  advance(world, 2);
  assert.equal(world.recovered, 0); assert.equal(world.wounded, 0);
  for (const facingRight of [true, false]) for (const wind of [-.8, .8]) {
    const corrected = lookoutScene(art, facingRight, 140); corrected.wind = wind;
    corrected.fire(sightFor(corrected, corrected.deer[0], facingRight ? T.vitalsX : 1 - T.vitalsX, T.vitalsY, wind));
    advance(corrected, 3); assert.equal(corrected.recovered, 1);
  }
});
check('every distant level and boar uses physical sprite dimensions for alpha collision', () => {
  const c = new Campaign();
  for (const d of DEER_LEVELS) for (const facingRight of [true, false]) {
    const world = new World(art, 77, { lookout: true, windForce: 0,
      animal: (species, seed) => c.animal(species, seed, d.level), artFor: profile => masks[animalArt(profile)] });
    world.spawnTimer = 999;
    const deer = world.spawn(0, 100);
    Object.assign(deer, { state: 'grazing', pause: 999, visit: 999, facingRight, scale: 1.1 });
    assert.equal(world.animalSize(deer).width, T.lookoutAnimalWidth * 1.1);
    world.fire(sightFor(world, deer, facingRight ? d.vitalsX : 1 - d.vitalsX, d.vitalsY));
    advance(world, 3); assert.equal(world.recovered, 1, 'distant level ' + d.level);
    assert.equal(world.events.find(event => event.type === 'recovered').animal.level, d.level);
  }
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../assets/hunting/boar-v3.png')));
  const mask = { width: png.width, height: png.height, alpha: Uint8Array.from({ length: png.width * png.height }, (_, i) => png.data[i * 4 + 3]) };
  const world = lookoutScene(mask, false, 120); world.deer[0].profile.species = 'boar';
  world.fire(sightFor(world, world.deer[0], .33, .45)); advance(world, 3);
  assert.equal(world.recovered, 1); assert.equal(world.events.find(event => event.type === 'recovered').animal.species, 'boar');
});
check('owls and squirrels move, expire and remain outside the hunting hit candidates', () => {
  const world = new World(art, 29, { lookout: true, windForce: 0 });
  world.spawnTimer = 999; world.critterTimer = 999;
  const owl = world.critters.find(c => c.kind === 'owl'), squirrel = world.critters.find(c => c.kind === 'squirrel');
  const owlX = owl.x, squirrelX = squirrel.x;
  world.fire({ x: owl.x * 100 / owl.y, y: 100, h: 12 + (owl.h - 12) * 100 / owl.y });
  advance(world, 3);
  assert.notEqual(owl.x, owlX); assert.notEqual(squirrel.x, squirrelX);
  assert.equal(world.recovered, 0); assert.equal(world.wounded, 0);
  advance(world, 25); assert.equal(world.critters.length, 0);
});
