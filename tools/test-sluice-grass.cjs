// Run with node tools/test-sluice-grass.cjs. Exercises the real fragment source.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sluice/140-render-maindraw.js'), 'utf8');
var constants = fs.readFileSync(path.join(root, 'js/sluice/010-constants.js'), 'utf8');
var grassSource = source.slice(source.indexOf('  // ===== Surface grass wind'), source.indexOf('  // v23.50'));
assert(grassSource.includes('function updateGrassWind'), 'Grass source boundary exists');

function fixture() {
  var c = { Math: Math, Float32Array: Float32Array, WORLD_COLS: 64,
    cam: { x: 512 }, screenW: 640, rocketIntensity: 0 };
  ['TILE', 'SKY_ROWS', 'PLAYER_W', 'PLAYER_H'].forEach(function(name) {
    var value = constants.match(new RegExp('var ' + name + ' = (\\d+);'));
    assert(value, 'Read ' + name + ' from production constants');
    c[name] = Number(value[1]);
  });
  c.surfaceY = c.SKY_ROWS * c.TILE;
  c.world = [];
  c.world[c.SKY_ROWS] = Array.from({ length: c.WORLD_COLS }, function() { return { type: 'dirt' }; });
  c.player = { x: 800 - c.PLAYER_W / 2, y: c.surfaceY - c.PLAYER_H,
    vx: 0, vy: 0, onGround: true, squash: 0 };
  c.tileAt = function(r, col) { return c.world[r] && c.world[r][col] || null; };
  c.rocketExhaustDir = function() { return { x: 0, y: 1 }; };
  c.playerLocalToWorld = function(x, y) { return { x: c.player.x + x, y: c.player.y + y }; };
  vm.createContext(c);
  vm.runInContext(grassSource, c);
  c.grassWindTune.ambient = 0;
  return c;
}

function step(c, seconds, move) {
  for (var t = 0; t < Math.round(seconds * 120); t++) {
    if (move) c.player.x += c.player.vx / 120;
    c.updateGrassWind(1 / 120);
  }
}
function sample(c, x) {
  c.sampleGrassWind(x);
  return { d: c._gwS.d, v: c._gwS.v };
}
function maxBend(c) {
  return c.gwFieldD ? c.gwFieldD.reduce(function(m, d) { return Math.max(m, Math.abs(d)); }, 0) : 0;
}

// Sweep the rig across actual cells with the jet off. Recently crossed grass
// keeps moving behind it, then recovers instead of snapping back on departure.
[1, -1].forEach(function(direction) {
  var c = fixture();
  c.player.vx = direction * 200;
  step(c, 0.4, true);
  var wakeX = c.player.x + c.PLAYER_W / 2 - direction * 28;
  var wake = sample(c, wakeX);
  assert(wake.d * direction > 0.15, 'Wheel wake follows travel direction ' + direction);
  c.player.y -= 200;
  c.player.vx = 0;
  step(c, 0.05);
  assert(Math.abs(sample(c, wakeX).d) > 0.05, 'Grass retains inertia after the rig leaves');
  step(c, 1.5);
  assert(Math.abs(sample(c, wakeX).d) < 0.001, 'Vacated grass returns upright');
});

var c = fixture();
step(c, 2);
var parkedLeft = sample(c, 784), parkedRight = sample(c, 816);
assert(parkedLeft.d < -0.1 && parkedRight.d > 0.1, 'Parked rig holds a small outward bend');
assert(Math.abs(parkedLeft.v) < 0.001 && Math.abs(parkedRight.v) < 0.001,
  'An idle rig settles instead of continually shaking grass');
c.player.squash = 0.65;
step(c, 0.15);
assert(sample(c, 816).d > parkedRight.d * 1.25, 'A landing pushes nearby grass outward');

[-200, 80].forEach(function(offset) {
  var distant = fixture();
  distant.player.y += offset;
  distant.player.vx = 200;
  step(distant, 0.5, true);
  assert.equal(maxBend(distant), 0, 'No wheel contact far above or below the surface');
});

var jet = fixture();
jet.player.y -= 64;
jet.rocketIntensity = 1;
step(jet, 0.5);
assert(sample(jet, 752).d < -0.1 && sample(jet, 848).d > 0.1,
  'Airborne rocket downwash still fans grass outward');

// Disabling masks the current field immediately and discards the old wake.
c.grassWindTune.enabled = false;
assert.equal(sample(c, 816).d, 0, 'Disabled motion is not drawn');
c.updateGrassWind(1 / 60);
assert.equal(c.gwFieldD, null, 'Disabled field releases its previous displacement');
c.grassWindTune.enabled = true;
c.player.y -= 200;
step(c, 0.25);
assert.equal(maxBend(c), 0, 'Enabling again does not replay old wheel motion');

// Restart and save loading replace world, even when its dimensions stay equal.
c = fixture();
c.player.vx = 180;
step(c, 0.25);
assert(maxBend(c) > 0.1, 'Reset fixture contains a bent field');
c.world = c.world.slice();
assert.equal(sample(c, 800).d, 0, 'A replaced world cannot display the old field');
c.updateGrassWind(0);
assert.equal(maxBend(c), 0, 'World replacement resets every cell before stepping');
assert.equal(c.grassWindTime, 0, 'A new world resets the animation clock');
c.WORLD_COLS *= 2;
c.updateGrassWind(0);
assert.equal(c.gwFieldLen, Math.ceil(c.WORLD_COLS * c.TILE / c.GRASS_WIND_CELL) + 2,
  'World-width changes resize the field');

c = fixture();
c.player.vx = 180;
step(c, 0.25);
var col = Math.floor(808 / c.TILE);
assert(c.grassSupported(808), 'Initial ground supports grass');
c.world[c.SKY_ROWS][col] = null;
c.updateGrassWind(1 / 60);
assert.equal(c.grassSupported(808), false, 'Ground removal invalidates cached support');
assert.equal(sample(c, 808).d, 0, 'Removed ground cannot retain a moving blade');
assert.equal(c.grassSupported(-1), false, 'World-edge walls do not grow grass');
assert.equal(c.grassSupported(c.WORLD_COLS * c.TILE), false, 'Outside the world has no grass');

// Exercise the real draw block after removing all surface support, including
// the tiny ground flecks which used to remain suspended across excavations.
var drawStart = source.indexOf('    // Surface grass line');
var drawEnd = source.indexOf("    perfBuckets['render.tiles']", drawStart);
var drawSource = source.slice(drawStart, drawEnd);
var marks = 0;
c.ctx = new Proxy({}, { get: function(target, key) {
  if (key === 'createRadialGradient') return function() { return { addColorStop: function() {} }; };
  if (key === 'stroke' || key === 'fill') return function() { marks++; };
  return function() {};
}, set: function() { return true; } });
c.tileHash01 = function() { return 0.9; };
c.worldLeft = 768; c.worldRight = 832;
c.worldTop = 0; c.worldBottom = c.surfaceY + 50;
vm.runInContext(drawSource, c);
assert(marks > 0, 'Supported grass draw fixture paints visible marks');
c.world[c.SKY_ROWS].fill(null);
marks = 0;
vm.runInContext(drawSource, c);
assert.equal(marks, 0, 'Excavation removes blades, seed heads, shadows and ground flecks');

console.log('Grass drive/reverse, recovery, idle/landing, altitude, jets, disable, reset and terrain checks passed.');
