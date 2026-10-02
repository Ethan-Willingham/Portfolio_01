// Compare both cart arrangements using real forces, contacts and saved worlds.
const assert = require('node:assert/strict');
const P = require('../js/four-wheels-physics');
const C = require('../js/four-wheels-course');
const T = require('../js/four-wheels-terrain');
const make = (chapter = 0, mode = 'front-swivel') => new P.World(C.build(chapter), false, mode);
const step = (w, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    w.step(1 / 120, input);
    for (const index of [0, 2]) if (w.wheels[index].fixed) {
      assert.equal(w.wheels[index].a, w.body.a, 'rear fork follows chassis heading');
      assert.equal(w.wheels[index].omega, w.body.omega, 'rear fork has no independent swivel velocity');
    }
  }
};
const check = (name, fn) => { fn(); console.log('PASS ' + name); };
const pose = (w, x, y, a = 0, speed = 0) => {
  Object.assign(w.body, { x, y, a, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, omega: 0 });
  T.init(w, w.terrainGeometry);
  w.wheels.forEach(q => Object.assign(q, { a, omega: 0 }));
};

check('the original cart stays the default and the test locks only the rear pair', () => {
  const original = new P.World(C.build()), test = make();
  assert.equal(original.wheelMode, 'all-swivel');
  assert.ok(original.wheels.every(q => !q.fixed));
  assert.deepEqual(test.wheels.map(q => !!q.fixed), [true, false, true, false]);
  step(test, 1.5, { push: 1 });
  assert.ok(test.wheels.every(q => q.roll > 40), 'all four tires still roll');
});

check('pulling flips the front forks while the rear tires roll backward', () => {
  const w = make();
  step(w, 2, { push: -1 });
  assert.ok(w.body.vx < -60);
  for (const index of [0, 2]) assert.ok(w.wheels[index].speed < -50 && w.wheels[index].roll < -60);
  for (const index of [1, 3]) assert.ok(Math.abs(P.wrap(w.wheels[index].a - w.body.a)) > 2.8 && w.wheels[index].speed > 50);
});

check('rear grip bends the coasting path and the front casters still swivel', () => {
  const original = make(0, 'all-swivel'), fixed = make();
  for (const w of [original, fixed]) { step(w, 1.5, { push: 1 }); step(w, .7, { turn: 1 }); }
  const direction = w => Math.atan2(w.body.vy, w.body.vx);
  assert.ok(direction(fixed) > direction(original) + .4, 'fixed rear tires change the actual path');
  assert.ok(fixed.body.a > .4 && fixed.falls === 0);
  assert.ok([1, 3].every(i => Math.abs(P.wrap(fixed.wheels[i].a - fixed.body.a)) > .15));
});

check('a rear tire collision transfers torque to the body instead of a free fork', () => {
  const w = make(), rigid = make(), q = w.wheels[0], p = P.casterPose(w.body, q, 0);
  w.body.vy = rigid.body.vy = 20;
  const hit = { x: p.x, y: p.y, nx: 0, ny: -1, depth: .01 };
  const impulse = w.casterImpulse(hit, q, 0);
  rigid.spatialImpulse({ ...hit, cartZ: p.z + 3 });
  assert.ok(impulse > 0 && w.body.vy < 20);
  assert.ok(Math.abs(w.body.omega) > .1);
  assert.deepEqual(w.body, rigid.body, 'a locked fork reacts as a contact on the rigid body');
  assert.equal(q.omega, 0, 'the collision cannot excite an independent rear swivel');
  w.syncFixedWheels();
  assert.equal(q.omega, w.body.omega);
});

check('fixed rear wheels settle on slopes and stay locked through bumps and falls', () => {
  const flat = make(); step(flat, 2);
  assert.ok(Math.abs(flat.body.z) < .2 && flat.ground.count === 4);
  const slope = make(4); pose(slope, 1300, 980, Math.PI); step(slope, 1);
  assert.ok(slope.body.z > 20 && Math.abs(slope.body.pitch) > .05 && slope.falls === 0);
  const bumps = make(1); pose(bumps, 590, 1195, -Math.PI / 2, 35); step(bumps, .6, { push: 1 });
  assert.ok(Number.isFinite(bumps.body.pitchRate) && bumps.falls === 0);
  const lost = make(6); pose(lost, 710, 700, Math.PI / 2, 65); step(lost, 4);
  assert.equal(lost.falls, 1); assert.equal(lost.fall, null); assert.equal(lost.roomIndex, 0);
  assert.equal(lost.wheelMode, 'front-swivel');
});

check('fixed tires gain no grip or braking force while airborne', () => {
  const coast = make(5), controlled = make(5);
  for (const w of [coast, controlled]) {
    pose(w, 1215, 410, Math.PI, 60);
    Object.assign(w.body, { z: 45, vz: 10 });
    Object.assign(w.shopper, { z: 63, vz: 10, feet: 0 });
    Object.assign(w.ground, { airborne: true, count: 0, feet: 0 });
    w.wheels.forEach(q => q.load = 0);
  }
  step(coast, .1); step(controlled, .1, { push: 1, turn: 1, brake: 1 });
  assert.ok(Math.abs(coast.body.vx - controlled.body.vx) < .01 && Math.abs(coast.body.a - controlled.body.a) < .01);
  assert.ok(controlled.wheels.every(q => q.surface.grip === 0));
});

check('switching arrangements preserves the run and reloading resumes the same motion', () => {
  const w = make(); step(w, .8, { push: 1, turn: .3 });
  w.stock.spill('wine', 1180, 1300, 8);
  const body = { ...w.body }, time = w.time, gate = w.gate, stock = w.stock, rolls = w.wheels.map(q => q.roll);
  w.setWheelMode('all-swivel'); w.setWheelMode('front-swivel');
  assert.deepEqual(w.body, body); assert.equal(w.time, time); assert.equal(w.gate, gate);
  assert.equal(w.stock, stock); assert.deepEqual(w.wheels.map(q => q.roll), rolls);
  const saved = JSON.parse(JSON.stringify(C.snapshot(w))), restored = make(0, 'all-swivel');
  assert.ok(C.restore(restored, saved)); assert.equal(restored.wheelMode, 'front-swivel');
  assert.deepEqual(restored.body, w.body);
  step(w, .3, { push: -1, turn: -.4 }); step(restored, .3, { push: -1, turn: -.4 });
  assert.deepEqual(restored.body, w.body);
  assert.deepEqual(restored.wheels.map(q => [q.a, q.omega, q.roll]), w.wheels.map(q => [q.a, q.omega, q.roll]));
  const old = JSON.parse(JSON.stringify(C.snapshot(new P.World(C.build())))); delete old.wheelMode;
  const legacy = make();
  assert.ok(C.restore(legacy, old)); assert.equal(legacy.wheelMode, 'all-swivel');
  assert.ok(legacy.wheels.every(q => !q.fixed));
  const bad = structuredClone(saved); bad.wheelMode = 'rear-swivel';
  assert.equal(C.restore(make(), bad), false);
});

console.log('All wheel arrangement checks passed.');
