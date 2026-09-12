// Run with node tools/test-sluice-rare-bird.cjs. Exercises real 205/206 sources.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var drawn = [], canvases = [], saved = [], scales = [];
var c = {
  Math: Math, Float64Array: Float64Array, isFinite: isFinite,
  TILE: 32, SKY_ROWS: 4, COLS: 320, PLAYER_W: 22, PLAYER_H: 26,
  world: [], cam: { x: 1024, y: -120 }, screenW: 640, screenH: 360,
  player: { x: 1280, y: 102, vx: 0, vy: 0, fx: { boomN: 0 } },
  TREES: [], treesTune: { enabled: true }, treesBuilt: true, treesWorldRef: null,
  window: {}, document: { createElement: function() {
    var cv = { pixels: {} };
    cv.getContext = function() { return { fillRect: function(x, y, w, h) {
      assert([x, y, w, h].every(Number.isInteger), 'Sprite rectangles stay on the pixel grid');
      assert(x >= 0 && y >= 0 && x + w <= cv.width && y + h <= cv.height, 'Art fits inside its cached canvas');
      for (var py = y; py < y + h; py++) for (var px = x; px < x + w; px++) {
        cv.pixels[py * cv.width + px] = this.fillStyle;
      }
    } }; };
    canvases.push(cv); return cv;
  } },
  ctx: {
    imageSmoothingEnabled: true, globalAlpha: 0.8,
    save: function() { saved.push([this.imageSmoothingEnabled, this.globalAlpha]); },
    restore: function() {
      var state = saved.pop(); this.imageSmoothingEnabled = state[0]; this.globalAlpha = state[1];
    },
    translate: function(x, y) { assert(Number.isInteger(x) && Number.isInteger(y), 'Draw snaps to world pixels'); },
    scale: function(x, y) { scales.push([x, y]); }, fillRect: function() {},
    drawImage: function(cv) { drawn.push({ cv: cv, alpha: this.globalAlpha }); }
  }
};
c.tileAt = function(r, col) { return c.world[r] && c.world[r][col] || null; };
vm.createContext(c);
var palette = read('170-render-station-decor.js').match(/var BLD = \{[\s\S]*?\n  \};/);
var skyPalette = read('170-render-station-decor.js').match(/var SKY = \{[\s\S]*?\n  \};/);
var treeKinds = read('165-render-trees.js').match(/var TREES_KIND_SPRUCE[^;]+;/);
assert(palette && skyPalette && treeKinds, 'Read the production palettes and tree species');
vm.runInContext(palette[0] + skyPalette[0] + treeKinds[0] + read('205-birds.js') + read('206-rare-bird.js'), c);
function tree(col, kind, height) {
  return { c: col, x: col * c.TILE + c.TILE * 0.5, cy: 128 - height * 0.62,
    kind: kind, spr: { h: height }, st: 0 };
}
function fixture() {
  c.world = [];
  c.world[c.SKY_ROWS] = Array.from({ length: c.COLS }, function() { return { type: 'dirt' }; });
  c.treesWorldRef = c.world; c.treesBuilt = true; c.treesTune.enabled = true;
  c.TREES = [tree(32, c.TREES_KIND_BIRCH, 82), tree(47, c.TREES_KIND_SPRUCE, 90)];
  c.cam.x = 1024; c.cam.y = -120;
  c.player.x = 1280; c.player.y = 102; c.player.vx = 0; c.player.vy = 0;
  // No flock slots: the independent heron update hook must still run before that exit.
  c.birdsInited = true; c.birdsRoostN = 0;
  c.rareBirdUpdate(0);
}
function step(seconds) { for (var i = 0; i < Math.round(seconds * 20); i++) c.birdsUpdate(0.05); }
function draw() { drawn.length = 0; c.rareBirdDraw(); return drawn.length; }
function roost(direction) {
  fixture();
  var t = c.TREES[1]; c.TREES = [t];
  c.player.x = t.x - direction * 220 - c.PLAYER_W * 0.5;
  c.player.vx = direction * 30; c.cam.x = t.x - c.screenW * 0.5;
  assert.equal(c.rareBirdBegin(), true, 'An eligible tree admits one hidden visitor');
  return t;
}
function approach(direction) {
  var t = c.rareBird.perch, x = c.rareBird.x, y = c.rareBird.y;
  c.player.x = t.x - direction * 80 - c.PLAYER_W * 0.5;
  c.player.vx = direction * 30;
  c.birdsUpdate(0.05);
  assert.equal(c.rareBird.state, 'takeoff', 'Driving near the occupied tree launches its visitor');
  assert.equal(c.rareBird.dir, direction, 'The launch heads away from the approaching rig');
  assert.equal(c.rareBird.x, x, 'Takeoff starts at the roost without a horizontal jump');
  assert.equal(c.rareBird.y, y, 'Takeoff starts at the roost without an altitude jump');
  assert(c.rareBird.vy < 0, 'The first motion lifts out of the canopy');
}
fixture();
var initialWait = c.rareBird.wait;
assert(initialWait >= 45 && initialWait <= 73, 'First sighting has a 45-73 second surface-exposure wait');
c.cam.y = 180; step(200);
assert.equal(c.rareBird.wait, initialWait, 'Mining time does not advance the rare visitor timer');
c.cam.y = -1000; step(200);
assert.equal(c.rareBird.wait, initialWait, 'High-altitude time does not queue a visitor');
c.cam.y = -120;
[-1, 0, NaN, Infinity].forEach(function(dt) { c.rareBirdUpdate(dt); });
assert.equal(c.rareBird.wait, initialWait, 'Invalid or paused frame times cannot advance the timer');
c.rareBirdUpdate(1000);
assert(initialWait - c.rareBird.wait <= 0.051, 'A stalled frame cannot skip the waiting period');
var elapsed = 0;
while (!c.rareBird.active && elapsed < 74) { c.birdsUpdate(0.05); elapsed += 0.05; }
assert(c.rareBird.active && elapsed >= 44.9, 'Surface exposure eventually admits one heron');
assert.equal(c.rareBird.pass, 1, 'Only one encounter begins');
assert.equal(c.rareBird.state, 'perched', 'A rare encounter begins in a real tree');
assert(c.TREES.includes(c.rareBird.perch), 'The roost belongs to the current generated trees');
assert.equal(draw(), 0, 'The resting visitor stays hidden in its canopy without appearing suddenly');
var occupied = c.rareBird.perch;
c.player.x = occupied.x - 80 - c.PLAYER_W * 0.5;
step(12);
assert.equal(c.rareBird.state, 'perched', 'An idle rig beside the tree does not continually spook wildlife');
assert.equal(c.rareBird.pass, 1, 'Waiting beside a roost cannot admit a second visitor');
approach(1);
assert.equal(draw(), 1, 'The departing heron draws independently of absent tiny flocks');
assert.equal(canvases.length, 9, 'The glide and eight wingbeat poses are baked once');
assert.deepEqual(scales[scales.length - 1], [0.75, 0.75], 'The bird is reduced to three quarters of its former size');
assert(Math.abs(drawn[0].alpha - 0.8 * 0.76) < 1e-9, 'Atmospheric fading multiplies the current canvas opacity');
assert.equal(c.ctx.globalAlpha, 0.8, 'Bird drawing restores the previous opacity');
assert.equal(c.ctx.imageSmoothingEnabled, true, 'Bird drawing restores canvas smoothing');

// Preserve coverage of the actual raster art, independent of flight behavior.
var allowedColors = Object.values(c.BLD).concat(c.SKY.cloudSunHi);
var wings = [], heads = new Set(), tails = new Set(), distinctArt = new Set();
canvases.forEach(function(cv) {
  assert(cv.width === 32 && cv.height === 32, 'Cached poses have room for a broad wing stroke');
  var colors = Object.values(cv.pixels), columns = Object.keys(cv.pixels).map(function(k) { return Number(k) % cv.width; });
  assert(Math.max.apply(null, columns) - Math.min.apply(null, columns) >= 28, 'Every pose retains the long heron profile');
  var whites = colors.filter(function(color) { return color === c.SKY.cloudSunHi; }).length;
  assert(whites > colors.length * 0.3, 'Warm white feathers remain a major part of every pose');
  assert(colors.every(function(color) { return allowedColors.includes(color); }), 'Heron uses cloud white and station shadows');
  var wingRows = [], legRows = [];
  Object.keys(cv.pixels).forEach(function(k) {
    var x = Number(k) % cv.width, y = Math.floor(Number(k) / cv.width), color = cv.pixels[k];
    if (x <= 6 && color === c.SKY.cloudSunHi) wingRows.push(y);
    if (color === c.BLD.metalDark) heads.add(k);
    if (color === c.BLD.stoneBase) legRows.push(y);
  });
  assert(wingRows.length > 0 && legRows.length > 0, 'Wing and trailing-leg silhouettes survive each pose');
  wings.push(Math.min.apply(null, wingRows)); tails.add(Math.max.apply(null, legRows));
  distinctArt.add(JSON.stringify(cv.pixels));
});
assert(Math.max.apply(null, wings) - Math.min.apply(null, wings) >= 12, 'Broad wings visibly travel through a large arc');
assert(heads.size > 1 && tails.size > 1, 'Head and trailing legs respond to the wingbeat');
assert(distinctArt.size >= 8, 'The cache contains distinct intermediate poses');
assert.equal(c.window.__rareBird.info().kind, 'white heron', 'Read-only QA identifies the visitor');
assert.equal(c.window.__rareBird.info().wingspan, 22.5, 'QA reports the smaller flight silhouette');

var paused = JSON.stringify(c.rareBird), pausedPose = c.rareBirdPose();
for (var pd = 0; pd < 20; pd++) draw();
c.rareBirdUpdate(0);
assert.equal(JSON.stringify(c.rareBird), paused, 'Repeated paused drawing changes no flight or wing state');
assert.equal(c.rareBirdPose(), pausedPose, 'Paused drawing holds the wing pose');
var originalX = c.cam.x, birdX = c.rareBird.x;
c.cam.x += 10000;
assert.equal(draw(), 0, 'Horizontal camera culling keeps offscreen sprites out of the draw');
assert.equal(c.rareBird.x, birdX, 'Camera movement cannot reposition the bird');
c.cam.x = originalX;
var poses = new Set(), rates = [], repeated = 0, longestRepeat = 0, previousPose = -1;
while (c.rareBird.active && c.rareBird.flightAge < 60) {
  var phase = c.rareBird.wingPhase;
  c.birdsUpdate(0.05);
  if (!c.rareBird.active) break;
  var pose = c.rareBirdPose();
  assert(Number.isInteger(pose) && pose >= 1 && pose <= 8, 'Every active phase uses a real wingbeat pose');
  poses.add(pose);
  repeated = pose === previousPose ? repeated + 1 : 1;
  longestRepeat = Math.max(longestRepeat, repeated); previousPose = pose;
  rates.push(((c.rareBird.wingPhase - phase + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 * 0.05));
  assert(draw() <= 1, 'There is at most one rare bird in a frame');
}
assert.equal(c.rareBird.active, false, 'The visitor eventually flies out of the scene');
assert.equal(poses.size, 8, 'Continuous flapping traverses every wingbeat pose');
assert(longestRepeat * 0.05 < 0.25, 'Flapping never freezes into a prolonged glide');
assert(Math.max.apply(null, rates) - Math.min.apply(null, rates) > 0.12, 'Wingbeat rate varies over the flight');
assert.equal(canvases.length, 9, 'Animation never rebakes sprites');
assert.equal(c.rareBird.pass, 1, 'Exit does not instantly replace the visitor');
assert(c.rareBird.wait >= 90 && c.rareBird.wait <= 180, 'Later encounters have 90-180 second gaps');
step(60);
assert.equal(c.rareBird.active, false, 'A full minute after departure still has no new visitor');

// Launch from both directions, then follow a long flight through several altitude choices.
[-1, 1].forEach(function(direction) {
  roost(direction); approach(direction);
  c.birdsUpdate(0.05); draw();
  assert.equal(Math.sign(c.rareBird.vx), direction, 'Initial travel follows the away direction');
  assert.deepEqual(scales[scales.length - 1], [direction * 0.75, 0.75], 'Facing follows departure without changing size');
});
var climbed = false, descended = false, lowestY = c.rareBird.y, highestY = c.rareBird.y;
for (var frame = 0; frame < 1400; frame++) {
  c.cam.x = c.rareBird.x - c.screenW * 0.5;
  c.cam.y = c.rareBird.y - c.screenH * 0.5;
  var oldX = c.rareBird.x, oldY = c.rareBird.y, oldVX = c.rareBird.vx, oldVY = c.rareBird.vy;
  c.birdsUpdate(0.05);
  assert(c.rareBird.active, 'A visible bird survives the nominal flight lifetime');
  assert(Math.abs(c.rareBird.x - oldX) < 2.4 && Math.abs(c.rareBird.y - oldY) < 2.2, 'Flight has no position jumps at altitude changes');
  assert(Math.abs(c.rareBird.vx - oldVX) < 3 && Math.abs(c.rareBird.vy - oldVY) < 6.1, 'New altitude targets retain bounded acceleration');
  if (c.rareBird.vy < -4) climbed = true;
  if (c.rareBird.vy > 4) descended = true;
  lowestY = Math.max(lowestY, c.rareBird.y); highestY = Math.min(highestY, c.rareBird.y);
}
assert(climbed && descended && lowestY - highestY > 70, 'The visitor climbs and dips through a changing route');
assert.equal(c.rareBird.state, 'flying', 'The initial launch transitions into cruising flight');
c.cam.x = c.rareBird.x + 10;
assert.equal(draw(), 1, 'Wing and tail remain drawable when the origin is just beyond the view');
c.rareBirdUpdate(0.001);
assert(c.rareBird.active, 'Retirement respects the bird silhouette near a screen edge');
c.cam.x += 1000; c.rareBirdUpdate(0.05);
assert.equal(c.rareBird.active, false, 'A distant visitor retires without being kept forever');

// Roost admission must not attach a visitor to unsupported or unsuitable scenery.
roost(1); c.rareBirdRetire();
var validTree = c.TREES[0];
[
  function() { validTree.kind = c.TREES_KIND_BUSH; },
  function() { validTree.kind = c.TREES_KIND_SNAG; },
  function() { validTree.spr.h = 40; },
  function() { validTree.st = 1; },
  function() { c.world[c.SKY_ROWS][validTree.c] = null; },
  function() { c.world[c.SKY_ROWS][validTree.c] = { type: 'foundation' }; },
  function() { c.world[c.SKY_ROWS][validTree.c] = 'wall'; }
].forEach(function(invalidate) {
  validTree.kind = c.TREES_KIND_SPRUCE; validTree.spr.h = 90; validTree.st = 0;
  c.world[c.SKY_ROWS][validTree.c] = { type: 'dirt' };
  invalidate();
  var pass = c.rareBird.pass;
  assert.equal(c.rareBirdBegin(), false, 'Unsuitable or unsupported trees cannot host a bird');
  assert.equal(c.rareBird.active, false, 'Failed admission leaves no ghost visitor');
  assert.equal(c.rareBird.pass, pass, 'Failed admission does not consume an encounter');
});
[function(t) { t.st = 1; }, function(t) { c.world[c.SKY_ROWS][t.c] = null; }].forEach(function(fell) {
  var t = roost(1); c.player.vx = 0; fell(t); c.rareBirdUpdate(0.05);
  assert.equal(c.rareBird.state, 'takeoff', 'A felling or excavated roost releases its resting bird');
});
[
  function() { c.TREES = []; },
  function() { c.treesBuilt = false; },
  function() { c.treesTune.enabled = false; },
  function() { c.treesWorldRef = []; }
].forEach(function(rebuild) {
  roost(1); rebuild(); c.rareBirdUpdate(0.05);
  assert.equal(c.rareBird.active, false, 'Rebuilt or disabled foliage cannot leave an orphaned roost');
});
roost(1); approach(1);
c.world = [];
assert.equal(draw(), 0, 'A replaced world never draws a previous-world visitor');
c.birdsUpdate(0);
assert.equal(c.rareBird.active, false, 'New world resets the active visitor even on a paused frame');
assert.equal(c.rareBird.pass, 0, 'New world resets encounter sequence');
assert(c.rareBird.wait >= 45 && c.rareBird.wait <= 73, 'New world starts with a fresh rare wait');

// The rare visitor now renders before trees and stations, once per main draw.
var mainDraw = read('140-render-maindraw.js');
var rareCalls = mainDraw.match(/rareBirdDraw\(\)/g) || [];
assert.equal(rareCalls.length, 1, 'The main draw paints the background visitor exactly once');
var rareIndex = mainDraw.indexOf('rareBirdDraw()');
assert(rareIndex < mainDraw.indexOf('drawTrees()') && rareIndex < mainDraw.indexOf('drawStation(REGIONS'), 'Trees and buildings occlude the visitor');
assert(!/rareBirdDraw\(\)/.test(read('205-birds.js')), 'Foreground flocks cannot redraw the heron over the scenery');

// Existing flock initialization, motion and drawing still work through 205.
fixture(); c.birdsInit();
assert(c.birdsRoostN > 0, 'Normal roosts still initialize');
c.cam.x = c.birdsRoostX[0] - c.screenW / 2;
c.birdsUpdate(0.05);
assert(c.birdsFActive.some(Boolean), 'Nearby tiny flocks still activate');
var flockX = Array.from(c.birdsX);
c.birdsUpdate(0.05);
assert(c.birdsX.some(function(x, i) { return x !== flockX[i]; }), 'Normal flock motion is unchanged');
c.birdsDraw();
console.log('Heron rarity, real tree roosts, two-sided takeoff, altitude continuity, varied continuous wings, white raster art, background draw, reset and flock integration checks passed.');
