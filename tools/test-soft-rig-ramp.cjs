// Production resident contact: a grounded horizontal drive must lift skin on either rig slope.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8');
const world = { Math, Float64Array, URLSearchParams, location: { search: '' }, softProjectEnabled: true,
  player: { x: 100, y: 100, dir: 1, vx: 120, vy: 0 }, PLAYER_W: 22, PLAYER_H: 26,
  playerBodyScale: () => ({ x: 1, y: 1 }), playerFxLandOffset: () => 0,
  solidAt: (x, y, w, h) => y + h > 126,
  performance: { now: () => 100 },
  jelloFrameNo: 12,
  skySlimeClamp: (value, min, max) => Math.max(min, Math.min(max, value)) };
vm.createContext(world);
const jello = read('340-jello.js'), start = jello.indexOf('  function jelloPointInRing(');
const pointInRing = jello.slice(start, jello.indexOf('\n  }', start) + 4);
const nearStart = jello.indexOf('  function jelloNearestOnRing(');
const nearestOnRing = jello.slice(nearStart, jello.indexOf('\n  }', nearStart) + 4);
vm.runInContext(read('069-rig-hull.js') + '\n' + read('342-soft-contact.js') + '\n' + pointInRing +
  '\nvar _jNear = { x: 0, y: 0 };\n' + nearestOnRing, world);
const project = world.softContactProject, rows = [];
for (const dir of [-1, 1]) {
  world.player.dir = dir;
  world.player.vx = dir * 120;
  const hull = world.rigContactHull();
  let face = -1;
  for (let i = 0; i < hull.n; i++) {
    const next = (i + 1) % hull.n;
    if (hull.nx[i] * dir > 0.5 && hull.ny[i] < -0.1 &&
        (hull.y[i] + hull.y[next]) / 2 > world.player.y + world.PLAYER_H * 0.65) face = i;
  }
  assert(face >= 0, 'lower side must be a lifting ramp in direction ' + dir);
  const next = (face + 1) % hull.n, nx = hull.nx[face], ny = hull.ny[face];
  const sx = (hull.x[face] + hull.x[next]) / 2, sy = (hull.y[face] + hull.y[next]) / 2;
  const nearX = sx - dir * 0.7, left = dir > 0 ? nearX : sx - 12, right = dir > 0 ? sx + 12 : nearX;
  const top = sy - 8, bottom = 126;
  const b = { n: 4, ringN: 4, ring: [0, 1, 2, 3], sleeping: false,
    px: new Float64Array([left, right, right, left]), py: new Float64Array([top, top, bottom, bottom]),
    ox: new Float64Array([left, right, right, left]), oy: new Float64Array([top, top, bottom, bottom]) };
  assert(world.jelloPointInRing(b, sx, sy), 'ramp sample overlaps a vertical skin wall');
  const beforeY = Array.from(b.py), h = 1 / 120;
  const frame = { rig: { x: 100, y: 100, vx: dir * 120, vy: 0 }, vx: dir * 120, vy: 0, hit: false };
  let contact;
  world.softContactProject = (...args) => {
    contact = { a: args[1], c: args[2], t: args[3], nx: args[4], ny: args[5], depth: args[6] };
    project(...args);
  };
  world.softContactSolve(b, sx, sy, nx, ny, h, frame);
  assert(contact, 'intersecting skin generates a contact');
  assert(Math.abs(contact.depth - 0.7 / Math.abs(nx)) < 1e-8, 'near-side depth, not the body-width far exit');
  assert(Math.abs(contact.nx + nx) < 1e-8 && Math.abs(contact.ny + ny) < 1e-8, 'reaction follows the actual rig slope');
  assert(contact.a === (dir > 0 ? 3 : 1) && contact.c === (dir > 0 ? 0 : 2), 'force reaches the contacted skin edge');
  assert(contact.t > 0 && contact.t < 1, 'edge force has genuine barycentric weights');
  const touched = new Set([contact.a, contact.c]);
  let maxRise = 0, upwardSpeed = 0;
  for (let i = 0; i < b.n; i++) {
    if (!touched.has(i)) assert.equal(b.py[i], beforeY[i], 'uncontacted nodes get no artificial upward boost');
    else {
      assert(b.py[i] < beforeY[i], 'horizontal drive lifts both contacted material nodes');
      assert((b.py[i] - b.oy[i]) / h < 0, 'lift survives the unchanged Coulomb friction');
      maxRise = Math.max(maxRise, beforeY[i] - b.py[i]);
      upwardSpeed = Math.max(upwardSpeed, -(b.py[i] - b.oy[i]) / h);
    }
  }
  assert.equal(frame.rig.y, 100, 'ground prevents downward rig recoil');
  assert.equal(frame.rig.vy, 0, 'ground absorbs downward contact velocity');
  // A track sample near the underside is inside this same tall body, but
  // it is a back face of the side impact, not a separate landing patch.
  const bx = (left + right) / 2, by = bottom - 0.5;
  const beforeBack = Array.from(b.py);
  contact = null;
  world.softContactSolve(b, bx, by, 0, 1, h, frame);
  assert.equal(contact, null, 'immersed back face does not push through the whole body');
  assert.deepEqual(Array.from(b.py), beforeBack, 'no false track-landing impulse during a side impact');
  // A bent skin beside the track corner can pass the nearest-point direction
  // check while the inward track ray reaches a roof beyond the rig's crown.
  const cornerX = 119, cornerY = 124;
  const trackNX = 0.018, trackNY = Math.sqrt(1 - trackNX * trackNX);
  const wallSlope = trackNX / trackNY + 0.00001;
  const bent = { n: 4, ringN: 4, ring: [0, 1, 2, 3], sleeping: false,
    px: new Float64Array([104, cornerX + 0.001 - wallSlope * 20, cornerX + 0.001 + wallSlope * 2, 104]),
    py: new Float64Array([104, 104, 126, 126]) };
  bent.ox = bent.px.slice(); bent.oy = bent.py.slice();
  assert(world.jelloPointInRing(bent, cornerX, cornerY), 'bent skin encloses the track corner');
  const nearBent = world.jelloNearestOnRing(bent, cornerX, cornerY);
  assert(nearBent.y < cornerY, 'nearest bent skin sits slightly behind the track normal');
  contact = null;
  assert((nearBent.x - cornerX) * trackNX + (nearBent.y - cornerY) * trackNY < 0,
    'bent corner passes the nearest-point direction guard');
  world.softContactSolve(bent, cornerX, cornerY, trackNX, trackNY, h, frame);
  assert.equal(contact, null, 'track corner cannot contact the far roof beyond the rig hull');
  rows.push({ dir, normal: [nx, ny], maxRise, upwardSpeed });
}
world.player.x = 117; world.player.y = 94;
world.softContactDraw = { x: 100, y: 100, endX: 117, endY: 94 };
world.softContactInterpolate();
assert.equal(world.player.renderX, world.player.x, 'drawn rig stays aligned horizontally');
assert.equal(world.player.renderY, world.player.y, 'drawn rig stays aligned vertically');

// A stationary rig wholly inside a large skin must recover through one real
// outer plane. The floor rules out the shortest downward escape.
world.player.x = 100; world.player.y = 100; world.player.dir = 1;
const deep = { n: 4, ringN: 4, ring: [0, 1, 2, 3], sleeping: false,
  px: new Float64Array([70, 160, 160, 70]), py: new Float64Array([90, 90, 126, 126]) };
deep.ox = deep.px.slice(); deep.oy = deep.py.slice();
const deepFrame = { rig: { x: 100, y: 100, vx: 0, vy: 0, onGround: true }, vx: 0, vy: 0, hit: false };
const recoveryH = 1 / 120;
let escape, recoveryCalls = 0, maxRecoveryStep = 0;
world.softContactProject = (...args) => {
  escape = { a: args[1], c: args[2], t: args[3], nx: args[4], ny: args[5], depth: args[6] };
  recoveryCalls++;
  project(...args);
};
world.softContactEnclosedEscape(deep, world.rigContactHull(100, 100), recoveryH, deepFrame);
assert(escape, 'wholly enclosed stationary hull gets an escape constraint');
assert.equal(escape.a, 0); assert.equal(escape.c, 1);
assert(escape.t > 0 && escape.t < 1, 'escape uses actual barycentric skin nodes');
assert.equal(escape.nx, 0); assert.equal(escape.ny, -1);
assert(Math.abs(escape.depth - 34) < 1e-8, 'escape depth separates the whole hull, including its rear support');
assert(Math.abs(deepFrame.rig.y - 100) < 0.2, 'deep recovery starts with a bounded physical projection');
assert(deepFrame.rig.vy < 0, 'escape impulse follows the available outer skin plane');
for (let step = 0; step < 120; step++) {
  const beforeX = deepFrame.rig.x, beforeY = deepFrame.rig.y;
  world.softContactMove(deepFrame.rig, deepFrame.rig.vx * recoveryH, deepFrame.rig.vy * recoveryH);
  world.softContactEnclosedEscape(deep, world.rigContactHull(deepFrame.rig.x, deepFrame.rig.y), recoveryH, deepFrame);
  maxRecoveryStep = Math.max(maxRecoveryStep, Math.hypot(deepFrame.rig.x - beforeX, deepFrame.rig.y - beforeY));
  assert(Number.isFinite(deepFrame.rig.x + deepFrame.rig.y + deepFrame.rig.vx + deepFrame.rig.vy), 'deep recovery stays finite');
  assert(deepFrame.rig.y + world.PLAYER_H <= 126, 'terrain mask prevents rig floor penetration');
  for (let i = 0; i < deep.n; i++) {
    assert(Number.isFinite(deep.px[i] + deep.py[i] + deep.ox[i] + deep.oy[i]), 'escape skin stays finite');
    assert(deep.py[i] <= 126, 'escape skin never penetrates the floor');
  }
}
const recoveredHull = world.rigContactHull(deepFrame.rig.x, deepFrame.rig.y);
assert(Array.from(recoveredHull.x).every((x, i) => !world.jelloPointInRing(deep, x, recoveredHull.y[i])),
  'bounded stationary overlap recovers to a hull entirely outside the skin');
assert(maxRecoveryStep < 2, 'recovery is gradual rather than a one-frame position jump');
assert(recoveryCalls > 1 && recoveryCalls < 60, 'escape constraint engages only during the enclosed part of recovery');

// A thin concave indent crosses a long hull side between contained vertices.
// It belongs to ordinary face contacts, even though every hull vertex is inside.
const notch = { ringN: 8, ring: [0, 1, 2, 3, 4, 5, 6, 7],
  px: new Float64Array([70, 160, 160, 113, 113, 160, 160, 70]),
  py: new Float64Array([90, 90, 117.9, 117.9, 118.1, 118.1, 126, 126]) };
const notchHull = world.rigContactHull(100, 100);
assert(Array.from(notchHull.x).every((x, i) => world.jelloPointInRing(notch, x, notchHull.y[i])),
  'indent fixture contains all vertices but crosses a face between them');
escape = null;
world.softContactEnclosedEscape(notch, notchHull, recoveryH, deepFrame);
assert.equal(escape, null, 'actual skin/hull crossing excludes the deep fallback');
console.log(JSON.stringify({ pass: true, rows, deepRecovery: { recoveryCalls, maxRecoveryStep,
  finalX: deepFrame.rig.x, finalY: deepFrame.rig.y } }));
