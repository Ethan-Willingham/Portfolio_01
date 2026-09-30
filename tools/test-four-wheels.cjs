// Core handling and course checks. Run: node tools/test-four-wheels.cjs
const assert = require('node:assert/strict');
const { World, point, corners, advanceGait, wrap, clamp, BODY, CASTER, WHEELS, ROOM, CHECKPOINT_RADIUS, CHECKPOINT_SENSOR, cartTouchesCheckpoint, casterPose, casterCorners, footprint, cartCircle, boxContact } = require('../js/four-wheels-physics.js');
const levels = require('../js/four-wheels-levels.js');
const Stock = require('../js/four-wheels-stock.js');
const dt = 1 / 120;
const empty = { name: 'fixture', start: { x: 230, y: 150, a: 0 }, limit: 300, par: 100, shelves: [], objects: [], gates: [{ x: 400, y: 260 }], exit: { side: 'right', center: 150, width: 80 } };
const step = (w, seconds, input) => { for (let i = 0; i < Math.round(seconds / dt); i++) w.step(dt, input); };
function test(name, fn) { fn(); console.log('PASS ' + name); }

test('walking has a steady human cadence without jumping when speed changes', () => {
  const gait = new World(empty).gait, body = { a: 0, vx: 60, vy: 0, omega: 0 };
  advanceGait(gait, body, .25);
  assert.ok(gait.phase / (.25 * Math.PI) > 1.8 && gait.phase / (.25 * Math.PI) < 2.5, 'normal cart travel should take about two steps per second');
  const phase = gait.phase; body.vx = 135; advanceGait(gait, body, dt);
  assert.ok(gait.phase > phase && gait.phase - phase < .1, 'acceleration must advance smoothly, not re-evaluate elapsed time');
  body.vx = 0; const stopped = gait.phase;
  for (let i = 0; i < 120; i++) advanceGait(gait, body, dt);
  assert.equal(gait.phase, stopped); assert.ok(gait.stride < .001, 'the feet settle when movement stops');
});

test('the shopper steps around a stationary cart and walks backward with it', () => {
  const gait = new World(empty).gait, body = { a: 0, vx: 0, vy: 0, omega: 2 };
  advanceGait(gait, body, .25);
  assert.ok(gait.phase > 0 && gait.stride > 1); assert.equal(gait.speed, 32);
  assert.ok(gait.sideways < -.99 && Math.abs(gait.forward) < .01);
  body.omega = 0; body.vx = -40; const phase = gait.phase; advanceGait(gait, body, dt);
  assert.ok(gait.forward < -.99 && gait.phase > phase, 'reverse steps retain the continuous alternating cycle');
});

test('walking phase and stride are independent of render frequency', () => {
  const slow = new World(empty).gait, fast = new World(empty).gait, body = { a: .8, vx: 30, vy: 40, omega: .5 };
  for (let i = 0; i < 30; i++) advanceGait(slow, body, 1 / 30);
  for (let i = 0; i < 120; i++) advanceGait(fast, body, 1 / 120);
  assert.ok(Math.abs(slow.phase - fast.phase) < 1e-9 && Math.abs(slow.stride - fast.stride) < 1e-9);
  assert.ok(Math.abs(slow.leanX - fast.leanX) < 1e-9 && Math.abs(slow.leanY - fast.leanY) < 1e-9);
});

test('the shopper leans into effort, braces when braking, and settles at rest', () => {
  const gait = new World(empty).gait, body = { a: 0, vx: 60, vy: 0, omega: 0 };
  const pose = input => { for (let i = 0; i < 90; i++) advanceGait(gait, body, dt, input); };
  pose({push:1}); assert.ok(gait.leanX > 1.8 && Math.abs(gait.leanY) < .01);
  pose({brake:1}); assert.ok(gait.leanX < -1.5, 'forward braking braces backward');
  body.vx = 0; body.vy = 60; pose({brake:1}); assert.ok(gait.leanY < -.8, 'sideways braking braces against the slide');
  body.vy = 0;
  body.vx = -40; pose({push:-1}); assert.ok(gait.leanX < -1.8, 'pulling shifts weight backward');
  body.vx = 0; body.omega = 1.5; pose({turn:1});
  assert.ok(gait.leanY < -2, 'clockwise steering follows the handle moving around the cart');
  body.omega = -1.5; pose({turn:-1}); assert.ok(gait.leanY > 2);
  body.omega = 0; pose({});
  assert.ok(Math.abs(gait.leanX) < .01 && Math.abs(gait.leanY) < .01, 'the upper body returns to rest');
  assert.deepEqual(body, {a:0,vx:0,vy:0,omega:0}, 'posture must not change the rigid-body motion');
});

test('rotation preserves the direction of existing momentum', () => {
  const w = new World(empty); w.body.vx = 60;
  step(w, .7, { turn: 1 });
  assert.ok(Math.abs(w.body.a) > .8, 'basket rotates substantially');
  assert.ok(Math.abs(Math.atan2(w.body.vy, w.body.vx)) < .01, 'small caster reactions leave momentum facing the old way');
  assert.ok(w.body.vx > 40);
  assert.ok(Math.abs(w.wheels[0].a - w.wheels[3].a) > .1, 'casters see different contact velocities');
  step(w, .35, { push: 1 });
  assert.ok(w.body.vy > 10, 'a new push bends the trajectory');
});

test('the combined center of mass sits behind the basket', () => {
  assert.ok(BODY.cartX > 0 && BODY.personX < 0);
  const w = new World(empty), initial = point(w.body, BODY.cartX, 0);
  step(w, .8, { turn: 1 });
  assert.ok(Math.hypot(w.body.x - empty.start.x, w.body.y - empty.start.y) < .05, 'swiveling wheels barely displace the combined center of mass');
  assert.ok(Math.hypot(point(w.body, BODY.cartX, 0).x - initial.x, point(w.body, BODY.cartX, 0).y - initial.y) > 10);
});

test('the tire follows a fixed pivot at a constant caster trail', () => {
  const w = new World(empty);
  for (const angle of [0, .4, Math.PI / 2, Math.PI, -2.1]) {
    w.wheels[1].a = angle;
    const pose = casterPose(w.body, w.wheels[1], 1), pivot = point(w.body, ...WHEELS[1]);
    assert.deepEqual(pose.pivot, pivot);
    const dx = pivot.x - pose.x, dy = pivot.y - pose.y;
    assert.ok(Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle) - CASTER.trail) < 1e-10);
    assert.ok(Math.abs(Math.hypot(dx, dy) - Math.hypot(CASTER.trail, CASTER.axleOffset)) < 1e-10);
  }
});

test('caster alignment depends on travel, and idle wheels hold their angles', () => {
  const idle = new World(empty), slow = new World(empty), fast = new World(empty);
  for (const w of [idle, slow, fast]) w.wheels.forEach(q => { q.a = Math.PI / 2; });
  slow.body.vx = 5; fast.body.vx = 60;
  for (const w of [idle, slow, fast]) step(w, .15, {});
  assert.equal(idle.wheels[0].a, Math.PI / 2, 'stationary casters do not reset toward the basket');
  assert.ok(fast.wheels[0].a < slow.wheels[0].a - .5, 'more travel brings the trailing tire into line sooner');
  const w = fast, q = w.wheels[0], p = casterPose(w.body, q, 0).pivot;
  const lateral = (w.body.vx - w.body.omega * (p.y - w.body.y)) * -Math.sin(q.a)
    + (w.body.vy + w.body.omega * (p.x - w.body.x)) * Math.cos(q.a) - CASTER.trail * q.omega;
  assert.ok(Math.abs(lateral) < .001, 'the trailing contact rolls without lateral slip');
});

test('reversing flips all four forks instead of instantly resetting them', () => {
  const w = new World(empty);
  step(w, .2, { push: -1 });
  assert.ok(w.wheels.every(q => Math.abs(q.a) < .1 && q.roll < 0), 'tires initially roll backward in their old orientation');
  step(w, 1.8, { push: -1 });
  assert.ok(w.wheels.every(q => Math.abs(q.a) > 2.8 && q.speed > 0), 'the offset forks eventually swing around to trail in reverse');
  assert.ok(w.body.vx < -60 && Math.abs(w.body.vy) < 1, 'the chassis still travels backward');
});

test('a tire can hit a cone that the basket never touches', () => {
  const w = new World({ ...empty, start: { x: 130, y: 150, a: 0 }, objects: [{ kind: 'cone', x: 163, y: 132 }] });
  w.body.vx = 75;
  for (let i = 0; i < 36; i++) {
    assert.equal(cartCircle(w.body, w.objects[0]), null, 'the cone stays outside the basket and shopper');
    w.step(dt);
  }
  assert.ok(w.objects[0].y < 130 && w.objects[0].vy < -5, 'the actual tire contact pushes the cone aside');
  assert.ok(Math.abs(w.wheels[1].a - w.wheels[3].a) > .01, 'the fork responds independently to contact');
});

test('a protruding tire collides with a shelf outside the basket footprint', () => {
  const shelf = { x: 240, y: 120, w: 35, h: 10 };
  const w = new World({ ...empty, shelves: [shelf] });
  w.wheels.forEach(q => { q.a = Math.PI / 2; });
  assert.equal(boxContact(w.body, shelf), null);
  step(w, .08, {});
  assert.ok(w.body.y > empty.start.y + .1 && w.shelves[0].cy < shelf.y+shelf.h/2, 'the caster contact separates both physical bodies');
  const contact=Stock.polygonContact(casterCorners(w.body,w.wheels[1],1),Stock.shelfPolygon(w.shelves[0]));
  assert.ok(!contact||contact.depth<.15,'the tire cannot rest inside the moving shelf');
});

test('a shelf impact stops penetration, turns the cart, and spills once', () => {
  const w = new World({ ...empty, start: { x: 180, y: 136, a: .2 }, shelves: [{ x: 241, y: 140, w: 45, h: 70, stock: 'dishes' }] });
  w.body.vx = 115; step(w, 1.3, {});
  assert.equal(w.messes, 1); assert.equal(w.penalty, 5);
  const hit=Stock.polygonContact(corners(w.body),Stock.shelfPolygon(w.shelves[0]));
  assert.ok((!hit||hit.depth<.1) && w.body.a > .27, 'an off-center impact rotates the basket without penetrating the moving rack');
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

test('every map edge reports exact resting contact without an impact threshold', () => {
  const starts = [{ x: 441, y: 150, a: 0, side: 'right' }, { x: 39, y: 150, a: Math.PI, side: 'left' },
    { x: 230, y: 39, a: -Math.PI / 2, side: 'top' }, { x: 230, y: 261, a: Math.PI / 2, side: 'bottom' }];
  for (const start of starts) {
    const w = new World({ ...empty, start }); w.step(dt);
    assert.ok(w.boundaryContacts.some(c => c.side === start.side && c.part === 'cart'), start.side + ' must pop red on the first step');
    step(w, .2, {}); assert.ok(w.boundaryContacts.some(c => c.life > .3), 'held contact stays lit');
    Object.assign(w.body, { x: 230, y: 150, vx: 0, vy: 0, omega: 0 });
    step(w, .4, {}); assert.equal(w.boundaryContacts.length, 0, 'feedback clears after separating');
    assert.equal(w.messes, 0); assert.equal(w.penalty, 0);
  }
});

test('the red contact identifies a protruding caster or the shopper', () => {
  const tire = new World({ ...empty, start: { x: 230, y: 29.5, a: 0 } });
  tire.wheels.forEach(q => { q.a = Math.PI / 2; }); tire.step(dt);
  assert.ok(tire.boundaryContacts.some(c => c.part === 'wheel:0' && c.side === 'top'));
  assert.ok(tire.boundaryContacts.every(c => c.part.startsWith('wheel:')), 'the basket and shopper have not touched');
  const shopper = new World({ ...empty, start: { x: ROOM.left - BODY.personX + BODY.personRadius, y: 150, a: 0 } }); shopper.step(dt);
  assert.ok(shopper.boundaryContacts.some(c => c.part === 'shopper' && c.side === 'left'));
});

test('the checkpoint sensor sits two thirds along the basket and counts first touch', () => {
  const target={x:230,y:150};
  assert.equal(CHECKPOINT_SENSOR.x, BODY.cartX-BODY.halfLength+BODY.halfLength*4/3);
  const w=new World({...empty,gates:[target],start:{x:target.x-BODY.personX,y:150,a:0}});
  w.step(dt);assert.equal(w.gate,0,'shopper contact cannot clear a checkpoint');
  for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2,.7]) {
    const body={x:target.x+CHECKPOINT_RADIUS+CHECKPOINT_SENSOR.radius-.05-Math.cos(a)*CHECKPOINT_SENSOR.x,y:target.y-Math.sin(a)*CHECKPOINT_SENSOR.x,a};
    assert.ok(cartTouchesCheckpoint(body,target),'a tiny basket-sensor overlap counts at every heading');
    body.x+=.1;assert.ok(!cartTouchesCheckpoint(body,target),'a real gap cannot count');
  }
  Object.assign(w.body,{x:target.x+CHECKPOINT_RADIUS+CHECKPOINT_SENSOR.radius-CHECKPOINT_SENSOR.x,y:150,a:0});
  w.step(dt);assert.equal(w.gate,1,'exact tangency counts once');
  w.step(dt);assert.equal(w.events.filter(e=>e.type==='gate').length,1);
});

test('basket checkpoints count in route order and open checkout after the last one', () => {
  const w=new World({...empty,gates:[{x:230,y:150},{x:300,y:150}],start:{x:300-CHECKPOINT_SENSOR.x,y:150,a:0}});
  w.step(dt);assert.equal(w.gate,0);
  w.body.x=230-CHECKPOINT_SENSOR.x;w.step(dt);assert.equal(w.gate,1);assert.equal(w.exitOpen,false);
  w.step(dt);assert.equal(w.gate,1);
  w.body.x=300-CHECKPOINT_SENSOR.x;w.step(dt);assert.equal(w.gate,2);assert.equal(w.exitOpen,true);
});

test('checkout stays solid until all route markers are cleared', () => {
  const w = new World({ ...empty, start: { x: 415, y: 150, a: 0 } });
  step(w, 3, { push: 1 });
  assert.equal(w.status, 'running'); assert.equal(w.exitOpen, false);
  assert.ok(w.body.x < 442 && w.boundaryContacts.some(c => c.side === 'right'));
});

test('the cart must actually leave checkout, with the shopper fully outside', () => {
  const w = new World({ ...empty, start: { x: 415, y: 150, a: 0 } }); w.gate = 1;
  step(w, 1, {}); assert.equal(w.status, 'running', 'waiting in the approach does not finish');
  w.body.x = 475; step(w, 1, {});
  assert.equal(w.status, 'running', 'the basket can be out while the shopper is still inside');
  assert.ok(w.exiting);
  step(w, 1.5, { push: 1 });
  assert.equal(w.status, 'won'); assert.ok(w.body.vx > 0, 'no stopping or parking is required');
  assert.ok(footprint(w.body, w.wheels).every(p => p.x > 480));
});

test('completion waits for trailing tires as well as the basket and shopper', () => {
  const w = new World({ ...empty, start: { x: 514, y: 150, a: Math.PI }, gates: [] });
  w.wheels.forEach(q => { q.a = 0; });
  step(w, .1, {}); assert.equal(w.status, 'running', 'an outward-facing caster still has its trailing tire inside');
  w.body.x += 4; w.step(dt); assert.equal(w.status, 'won');
});

test('the open doorway leaves its jambs and other map edges solid', () => {
  const w = new World({ ...empty, start: { x: 415, y: 225, a: 0 }, gates: [] });
  step(w, 3, { push: 1 }); assert.equal(w.status, 'running'); assert.ok(w.body.x < 442);
  const left = new World({ ...empty, start: { x: 60, y: 150, a: 0 }, gates: [] });
  step(left, 3, { push: -1 }); assert.equal(left.status, 'running');
  assert.ok(point(left.body, BODY.personX, 0).x - BODY.personRadius >= 7.9);
});

test('timeout includes penalties, and practice has no deadline', () => {
  const w = new World({ ...empty, limit: 1 }); w.penalty = .9; step(w, .2, {}); assert.equal(w.status, 'lost');
  const practice = new World({ ...empty, limit: 1 }, true); step(practice, 4, {}); assert.equal(practice.status, 'running');
});

test('checkout openings work on all four sides of the map', () => {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const w = new World({ ...empty, gates: [], exit: { side, center: side === 'left' || side === 'right' ? 150 : 230, width: 80 } });
    Object.assign(w.body, { ...w.exit.approach, a: w.exit.a }); w.wheels.forEach(q => { q.a = w.exit.a; });
    step(w, 3, { push: 1 }); assert.equal(w.status, 'won', side);
  }
});

test('an expired clock cannot be rescued by crossing the exit on that step', () => {
  const w = new World({ ...empty, gates: [], limit: .005, start: { x: 503, y: 150, a: 0 } }); w.body.vx = 2;
  w.step(dt); assert.equal(w.status, 'lost');
  assert.ok(footprint(w.body, w.wheels).every(p => p.x > 480), 'the whole footprint cleared on the expired step');
});

test('all six courses can be driven through before their deadlines', () => {
  // The controller uses only push, pull, twist and brake. It follows markers
  // and drives out with the same collisions as a player, without moving the
  // body directly. This catches impossible layouts and blocked exits.
  function drive(w, target) {
    const b = w.body;
    if (target === w.level.gates[w.gate]) {
      // Near a checkpoint, account for the sensor moving with the basket.
      // This keeps the pilot stable when a small overlap clears a circle early.
      const person = point(b, CHECKPOINT_SENSOR.x, 0), dx = target.x - person.x, dy = target.y - person.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 55) {
        const c = Math.cos(b.a), s = Math.sin(b.a), speed = Math.min(60, distance * 2);
        const vx = b.vx - b.omega * CHECKPOINT_SENSOR.x * s, vy = b.vy + b.omega * CHECKPOINT_SENSOR.x * c;
        const ax = ((distance ? dx / distance * speed : 0) - vx) * 3;
        const ay = ((distance ? dy / distance * speed : 0) - vy) * 3;
        const along = ax * c + ay * s + b.omega * b.omega * CHECKPOINT_SENSOR.x, lateral = -ax * s + ay * c;
        return {push:clamp(along / (along > 0 ? 78 : 50), -1, 1), turn:clamp((lateral / CHECKPOINT_SENSOR.x + 4.2 * b.omega) / 8.8, -1, 1)};
      }
      const previous = w.gate ? w.level.gates[w.gate - 1] : w.level.start;
      const approach = Math.atan2(target.y - previous.y, target.x - previous.x);
      target = {x:target.x - CHECKPOINT_SENSOR.x * Math.cos(approach), y:target.y - CHECKPOINT_SENSOR.x * Math.sin(approach)};
    }
    const dx = target.x - b.x, dy = target.y - b.y, d = Math.hypot(dx, dy);
    const speed = Math.min(62, d * 1.25), vx = d > 1 ? dx / d * speed : 0, vy = d > 1 ? dy / d * speed : 0;
    const ax = (vx - b.vx) * 2.1, ay = (vy - b.vy) * 2.1;
    let error = wrap(Math.atan2(ay, ax) - b.a), sign = 1;
    if (Math.abs(error) > Math.PI / 2) { error = wrap(error + Math.PI); sign = -1; }
    return { turn: clamp(error * 4 - b.omega * 1.15, -1, 1), push: Math.abs(error) < .65 ? clamp(Math.hypot(ax, ay) / (sign === 1 ? 78 : 50), 0, 1) * sign : 0, brake: Math.abs(error) > .6 && Math.hypot(b.vx, b.vy) > 40 ? 1 : 0 };
  }
  for (const level of levels) {
    const w = new World(level); let departing = false;
    for (let i = 0; i < level.limit * 120 && w.status === 'running'; i++) {
      let input;
      if (w.gate < level.gates.length) input = drive(w, level.gates[w.gate]);
      else {
        if (Math.hypot(w.body.x - w.exit.approach.x, w.body.y - w.exit.approach.y) < 7) departing = true;
        input = drive(w, departing ? w.exit.outside : w.exit.approach);
      }
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
      for (const q of w.wheels) for (const value of Object.values(q).filter(v=>typeof v==='number')) assert.ok(Number.isFinite(value), level.name + ' caster');
      if (!w.exitOpen) assert.ok(w.body.x >= 7 && w.body.x <= 473 && w.body.y >= 7 && w.body.y <= 293, level.name);
      assert.ok(w.body.x > -80 && w.body.x < 560 && w.body.y > -80 && w.body.y < 380, level.name);
    }
  }
});

console.log('All cart physics checks passed.');
