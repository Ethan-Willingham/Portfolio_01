// Core handling and course checks. Run: node tools/test-four-wheels.cjs
const assert = require('node:assert/strict');
const { World, point, wrap, clamp, BODY } = require('../js/four-wheels-physics.js');
const levels = require('../js/four-wheels-levels.js');
const dt = 1 / 120;
const empty = { name: 'fixture', start: { x: 230, y: 150, a: 0 }, limit: 300, par: 100, shelves: [], objects: [], gates: [{ x: 400, y: 260 }], goal: { x: 430, y: 230, w: 80, h: 80, a: 0 } };
const step = (w, seconds, input) => { for (let i = 0; i < Math.round(seconds / dt); i++) w.step(dt, input); };
function test(name, fn) { fn(); console.log('PASS ' + name); }

test('rotation preserves the direction of existing momentum', () => {
  const w = new World(empty); w.body.vx = 60;
  step(w, .7, { turn: 1 });
  assert.ok(Math.abs(w.body.a) > .8, 'basket rotates substantially');
  assert.equal(w.body.vy, 0, 'rotation does not redirect linear velocity');
  assert.ok(w.body.vx > 40);
  assert.ok(Math.abs(w.wheels[0].a - w.wheels[3].a) > .1, 'casters see different contact velocities');
  step(w, .35, { push: 1 });
  assert.ok(w.body.vy > 10, 'a new push bends the trajectory');
});

test('the combined center of mass sits behind the basket', () => {
  assert.ok(BODY.cartX > 0 && BODY.personX < 0);
  const w = new World(empty), initial = point(w.body, BODY.cartX, 0);
  step(w, .8, { turn: 1 });
  assert.equal(w.body.x, empty.start.x); assert.equal(w.body.y, empty.start.y);
  assert.ok(Math.hypot(point(w.body, BODY.cartX, 0).x - initial.x, point(w.body, BODY.cartX, 0).y - initial.y) > 10);
});

test('a shelf impact stops penetration, turns the cart, and spills once', () => {
  const w = new World({ ...empty, start: { x: 180, y: 136, a: .2 }, shelves: [{ x: 241, y: 140, w: 45, h: 70, stock: 'dishes' }] });
  w.body.vx = 115; step(w, .65, {});
  assert.equal(w.messes, 1); assert.equal(w.penalty, 5);
  assert.ok(w.body.x < 242 && w.body.a > .27, 'an off-center impact rotates the basket');
  step(w, .4, { push: 1 }); assert.equal(w.messes, 1);
});

test('cones topple and move, and each cone is charged once', () => {
  const w = new World({ ...empty, start: { x: 130, y: 150, a: 0 }, objects: [{ kind: 'cone', x: 181, y: 150 }] });
  w.body.vx = 75; step(w, .6, {});
  assert.ok(w.objects[0].down && w.objects[0].x > 190);
  assert.equal(w.messes, 1); assert.equal(w.penalty, 2);
});

test('the shopper collides with walls while reversing', () => {
  const w = new World({ ...empty, start: { x: 60, y: 150, a: 0 } });
  step(w, 4, { push: -1 });
  assert.ok(point(w.body, BODY.personX, 0).x - BODY.personRadius >= 7.9);
});

test('the puddle keeps momentum longer and weakens braking', () => {
  const dry = new World(empty), wet = new World({ ...empty, puddle: { x: 230, y: 150, rx: 180, ry: 140 } });
  dry.body.vx = wet.body.vx = 80;
  step(dry, .3, { brake: 1 }); step(wet, .3, { brake: 1 });
  assert.ok(wet.body.vx > dry.body.vx + 20);
});

test('checkout requires the route, complete footprint, heading, and a stop', () => {
  const level = { ...empty, start: { x: 230, y: 150, a: 0 }, goal: { x: 230, y: 150, w: 82, h: 72, a: 0 } };
  const w = new World(level); step(w, 1, {}); assert.equal(w.status, 'running');
  w.gate = 1; w.body.a = Math.PI / 2; step(w, 1, {}); assert.equal(w.status, 'running');
  w.body.a = 0; w.body.x = 255; step(w, 1, {}); assert.equal(w.status, 'running');
  w.body.x = 230; step(w, .7, {}); assert.equal(w.status, 'won');
});

test('timeout includes penalties, and practice has no deadline', () => {
  const w = new World({ ...empty, limit: 1 }); w.penalty = .9; step(w, .2, {}); assert.equal(w.status, 'lost');
  const practice = new World({ ...empty, limit: 1 }, true); step(practice, 4, {}); assert.equal(practice.status, 'running');
});

test('every course has a reachable, properly sized checkout', () => {
  for (const level of levels) {
    const w = new World(level); w.gate = level.gates.length;
    Object.assign(w.body, { x: level.goal.x - Math.cos(level.goal.a) * 4, y: level.goal.y - Math.sin(level.goal.a) * 4, a: level.goal.a });
    step(w, .7, {}); assert.equal(w.status, 'won', level.name);
  }
});

test('all six courses can be driven through before their deadlines', () => {
  // The controller uses only push, pull, twist and brake. It follows markers
  // and parks with the same collisions as a player, without moving the body
  // directly. This catches impossible layouts and parking approaches.
  function drive(w, target) {
    const b = w.body, dx = target.x - b.x, dy = target.y - b.y, d = Math.hypot(dx, dy);
    const speed = Math.min(62, d * 1.25), vx = d > 1 ? dx / d * speed : 0, vy = d > 1 ? dy / d * speed : 0;
    const ax = (vx - b.vx) * 2.1, ay = (vy - b.vy) * 2.1;
    let error = wrap(Math.atan2(ay, ax) - b.a), sign = 1;
    if (Math.abs(error) > Math.PI / 2) { error = wrap(error + Math.PI); sign = -1; }
    return { turn: clamp(error * 4 - b.omega * 1.15, -1, 1), push: Math.abs(error) < .65 ? clamp(Math.hypot(ax, ay) / (sign === 1 ? 78 : 50), 0, 1) * sign : 0, brake: Math.abs(error) > .6 && Math.hypot(b.vx, b.vy) > 40 ? 1 : 0 };
  }
  for (const level of levels) {
    const w = new World(level), goal = { x: level.goal.x - Math.cos(level.goal.a) * 4, y: level.goal.y - Math.sin(level.goal.a) * 4 };
    for (let i = 0; i < level.limit * 120 && w.status === 'running'; i++) {
      let input;
      if (w.gate < level.gates.length) input = drive(w, level.gates[w.gate]);
      else if (Math.hypot(w.body.x - goal.x, w.body.y - goal.y) > 4) input = drive(w, goal);
      else input = { brake: 1, turn: clamp(wrap(level.goal.a - w.body.a) * 4 - w.body.omega * 1.15, -1, 1) };
      w.step(dt, input);
    }
    assert.equal(w.status, 'won', level.name + ': route must be completable with time penalties');
  }
});

test('all courses stay finite during hard pushes, spin, and contact', () => {
  for (const level of levels) {
    const w = new World(level, true);
    for (let i = 0; i < 3600; i++) {
      w.step(dt, { push: Math.sin(i / 260) > -.7 ? 1 : -1, turn: Math.sin(i / 115), brake: i % 480 < 30 ? 1 : 0 });
      for (const value of Object.values(w.body)) assert.ok(Number.isFinite(value), level.name);
      assert.ok(w.body.x >= 7 && w.body.x <= 473 && w.body.y >= 7 && w.body.y <= 293, level.name);
    }
  }
});

console.log('All cart physics checks passed.');
