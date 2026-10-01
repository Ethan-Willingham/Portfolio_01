// NODE_PATH=/path/to/bundled/node_modules node tools/test-hunting-game.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { TUNING: T, World, launch, position, hitPixel } = require('../js/hunting-physics.js');
const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../assets/hunting/deer.png')));
const art = { width: png.width, height: png.height, alpha: Uint8Array.from({ length: png.width * png.height }, (_, i) => png.data[i * 4 + 3]) };
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
  const targetX = deer.x + (u - .5) * art.width / 16;
  const dy = deer.y - man.y;
  let time = Math.hypot(targetX - man.x, dy) / T.muzzleSpeed;
  for (let i = 0; i < 20; i++) time = Math.hypot(targetX - man.x - .5 * wind * T.windStrength * time * time, dy) / T.muzzleSpeed;
  const height = v * art.height / 16;
  const vz = (height - T.standHeight + .5 * T.gravity * time * time) / time;
  const duration = (vz + Math.sqrt(vz * vz + 2 * T.gravity * T.standHeight)) / T.gravity;
  const ratio = duration / time;
  return { x: man.x + (targetX - man.x - .5 * wind * T.windStrength * time * time) * ratio, y: man.y + dy * ratio };
}
check('the original artwork is 24 by 19 and has both solid and transparent pixels', () => {
  assert.equal(art.width, 24); assert.equal(art.height, 19);
  assert.ok(art.alpha.some(a => a === 0)); assert.ok(art.alpha.some(a => a === 255));
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
  assert.equal(hitPixel(art, true, .6, .45), 'vitals');
  assert.equal(hitPixel(art, true, .4, .55), 'wound');
  assert.equal(hitPixel(art, true, .35, .1), 'transparent');
  assert.equal(hitPixel(art, false, .4, .45), 'vitals');
  assert.equal(hitPixel(art, false, .6, .55), 'wound');
});
check('a swept shot through either mirrored chest is recovered after a short run', () => {
  for (const facing of [true, false]) {
    const world = scene(facing);
    world.fire(aimFor(world, facing ? .6 : .4, .45));
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
    world.fire(aimFor(world, .6, .45, wind)); advance(world, 2.5);
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
