// Live-course steering response and the physical limits on a fast corner.
const assert = require('node:assert/strict');
const P = require('../js/four-wheels-physics');
const C = require('../js/four-wheels-course');
const T = require('../js/four-wheels-terrain');
const dt = 1 / 120;
const step = (w, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) w.step(dt, input);
};
const make = (mode = 'all-swivel', speed = 150, ice = false) => {
  const w = new P.World(C.build(ice ? 9 : 0), false, mode), a = ice ? Math.PI / 2 : 0;
  Object.assign(w.body, { x: ice ? 2110 : 300, y: ice ? 545 : 1520, a,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, omega: 0 });
  T.init(w, w.terrainGeometry);
  w.wheels.forEach(q => Object.assign(q, { a, omega: 0 }));
  return w;
};
const check = (name, fn) => { fn(); console.log('PASS ' + name); };

check('both arrangements respond quickly from rest and during a fast push', () => {
  for (const mode of ['all-swivel', 'front-swivel']) for (const speed of [0, 150]) {
    const w = make(mode, speed), fixed = mode === 'front-swivel';
    step(w, .25, { push: 1, turn: 1 });
    assert.ok(w.body.a > (fixed ? .18 : .26), 'turn onset within a quarter-second');
    step(w, .45, { push: 1, turn: 1 });
    assert.ok(w.body.a > (fixed ? .86 : 1.18), 'a sustained input keeps turning');
    if (speed) {
      assert.ok(Math.atan2(w.body.vy, w.body.vx) > (fixed ? .48 : .24), 'actual travel bends');
      assert.ok(Math.hypot(w.body.vx, w.body.vy) > 150, 'the corner preserves forward motion');
    }
    assert.equal(w.falls, 0);
    assert.ok(Math.abs(w.body.rollTilt) < .25, 'the level-ground corner stays supported');
  }
});

check('steering leaves sideways momentum and free casters follow the contact', () => {
  const w = make();
  step(w, dt, { turn: 1 });
  assert.ok(w.body.a > 0 && w.body.a < .002, 'force starts rotation without snapping');
  step(w, .25 - dt, { turn: 1 });
  const travel = Math.atan2(w.body.vy, w.body.vx);
  assert.ok(w.body.a > .26 && Math.abs(travel) < .04, 'coasting retains the old travel direction');
  assert.ok(Math.hypot(w.body.vx, w.body.vy) > 125);
  assert.ok(w.wheels.some(q => Math.abs(P.wrap(q.a - w.body.a)) > .25), 'forks are not locked to steering');
  assert.ok(Math.abs(P.wrap(w.wheels[0].a - w.wheels[1].a)) > .1, 'front and rear forks follow different point velocities');
});

check('countersteering reverses angular momentum over time in both arrangements', () => {
  for (const mode of ['all-swivel', 'front-swivel']) {
    const w = make(mode);
    step(w, .7, { push: 1, turn: 1 });
    const omega = w.body.omega;
    step(w, dt, { turn: -1 });
    assert.ok(w.body.omega > 0 && w.body.omega < omega, 'one opposite impulse cannot erase the turn');
    step(w, .18, { turn: -1 });
    assert.ok(w.body.omega < -.5, 'the opposite force catches the turn promptly');
  }
  const released = make();
  step(released, .7, { push: 1, turn: 1 });
  step(released, .3);
  assert.ok(released.body.omega > 0 && released.body.omega < .65, 'release damps the turn without a heading reset');
});

check('analog input and slippery footing still limit steering force', () => {
  const full = make(), half = make(), ice = make('all-swivel', 150, true);
  step(full, .25, { push: 1, turn: 1 });
  step(half, .25, { push: 1, turn: .5 });
  step(ice, .25, { push: 1, turn: 1 });
  assert.ok(half.body.a > full.body.a * .45 && half.body.a < full.body.a * .55);
  assert.ok(P.wrap(ice.body.a - Math.PI / 2) < full.body.a * .6, 'ice supplies less steering force');
  assert.ok(ice.wheels.every(q => q.surface.grip === .07));
});

console.log('All steering-response and momentum checks passed.');
