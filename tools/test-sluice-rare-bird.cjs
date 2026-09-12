// Run with node tools/test-sluice-rare-bird.cjs. Exercises real 205/206 sources.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var drawn = [], canvases = [], saved = [];
var c = {
  Math: Math, Float64Array: Float64Array, isFinite: isFinite,
  TILE: 32, SKY_ROWS: 4, COLS: 320, PLAYER_W: 22, PLAYER_H: 26,
  world: [], cam: { x: 1024, y: -120 }, screenW: 640, screenH: 360,
  player: { x: 1280, y: 102, vx: 0, vy: 0, fx: { boomN: 0 } },
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
    imageSmoothingEnabled: true,
    save: function() { saved.push(this.imageSmoothingEnabled); },
    restore: function() { this.imageSmoothingEnabled = saved.pop(); },
    translate: function(x, y) { assert(Number.isInteger(x) && Number.isInteger(y), 'Draw snaps to world pixels'); },
    scale: function() {}, fillRect: function() {},
    drawImage: function(cv) { drawn.push(cv); }
  }
};
vm.createContext(c);
var palette = read('170-render-station-decor.js').match(/var BLD = \{[\s\S]*?\n  \};/);
var skyPalette = read('170-render-station-decor.js').match(/var SKY = \{[\s\S]*?\n  \};/);
assert(palette, 'Read the production palette');
assert(skyPalette, 'Read the actual cloud white from the sky palette');
vm.runInContext(palette[0] + skyPalette[0] + read('205-birds.js') + read('206-rare-bird.js'), c);
// No flock slots: the independent heron hook must still run before that exit.
c.birdsInited = true; c.birdsRoostN = 0;
function step(seconds) { for (var i = 0; i < Math.round(seconds * 20); i++) c.birdsUpdate(0.05); }
function draw() { drawn.length = 0; c.birdsDraw(); return drawn.length; }
c.birdsUpdate(0);
var initialWait = c.rareBird.wait;
assert(initialWait >= 45 && initialWait <= 75, 'First sighting has a long surface-exposure wait');
c.cam.y = 180;
step(200);
assert.equal(c.rareBird.wait, initialWait, 'Mining time does not advance the rare visitor timer');
c.cam.y = -1000;
step(200);
assert.equal(c.rareBird.wait, initialWait, 'High-altitude time does not queue a visitor');
c.cam.y = -120;
[-1, NaN, Infinity].forEach(function(dt) { c.rareBirdUpdate(dt); });
assert.equal(c.rareBird.wait, initialWait, 'Invalid frame times cannot advance the timer');
c.rareBirdUpdate(1000);
assert(initialWait - c.rareBird.wait <= 0.051, 'A stalled frame cannot skip the waiting period');
var elapsed = 0;
while (!c.rareBird.active && elapsed < 76) { c.birdsUpdate(0.05); elapsed += 0.05; }
assert(c.rareBird.active && elapsed >= 44.9, 'Surface exposure eventually admits one heron');
assert.equal(c.rareBird.pass, 1, 'Only one encounter begins');
assert.equal(c.rareBirdInView(20), false, 'The larger heron starts entirely beyond a screen edge');
assert.equal(draw(), 0, 'An approaching heron does not pop into view');
while (!c.rareBirdInView(0) && c.rareBird.age < 3) c.birdsUpdate(0.05);
assert.equal(draw(), 1, 'Heron draws independently of the absent tiny flocks');
assert.equal(canvases.length, 9, 'Glide and eight wingbeat poses are baked once');
var allowedColors = Object.values(c.BLD).concat(c.SKY.cloudSunHi);
var wings = [], heads = new Set(), tails = new Set(), distinctArt = new Set();
canvases.forEach(function(cv) {
  assert(cv.width === 32 && cv.height === 32, 'Larger poses have room for a broad wing stroke');
  var colors = Object.values(cv.pixels), columns = Object.keys(cv.pixels).map(function(k) { return Number(k) % cv.width; });
  assert(Math.max.apply(null, columns) - Math.min.apply(null, columns) >= 28, 'Every pose retains the large heron profile');
  var whites = colors.filter(function(color) { return color === c.SKY.cloudSunHi; }).length;
  assert(whites > colors.length * 0.3, 'Warm white feathers remain a major part of every pose');
  assert(colors.every(function(color) { return allowedColors.includes(color); }), 'Heron uses the real cloud white and station shadows');
  var wingRows = [], legRows = [];
  Object.keys(cv.pixels).forEach(function(k) {
    var x = Number(k) % cv.width, y = Math.floor(Number(k) / cv.width), color = cv.pixels[k];
    if (x <= 6 && color === c.SKY.cloudSunHi) wingRows.push(y);
    if (color === c.BLD.metalDark) heads.add(k);
    if (color === c.BLD.stoneBase) legRows.push(y);
  });
  assert(wingRows.length > 0 && legRows.length > 0, 'Wing and trailing-leg silhouettes survive each pose');
  wings.push(Math.min.apply(null, wingRows));
  tails.add(Math.max.apply(null, legRows));
  distinctArt.add(JSON.stringify(cv.pixels));
});
assert(Math.max.apply(null, wings) - Math.min.apply(null, wings) >= 12, 'Broad wings visibly travel through a large arc');
assert(heads.size > 1 && tails.size > 1, 'Head and trailing legs respond to the wingbeat');
assert(distinctArt.size >= 8, 'The cache contains distinct intermediate poses, not repeated frames');
assert.equal(c.window.__rareBird.info().kind, 'white heron', 'Read-only QA names the new visitor');
assert.equal(c.window.__rareBird.info().wingspan, 30, 'QA reports the enlarged profile');

// Sample one real animation cycle, preserving the flight's age afterwards.
var previousAge = c.rareBird.age, cyclePoses = [], lastPose = -1, flapTime = 0;
for (var t = 0; t < c.rareBird.flapPeriod; t += 0.005) {
  c.rareBird.age = t;
  var sampledPose = c.rareBirdPose();
  assert(Number.isInteger(sampledPose) && sampledPose >= 0 && sampledPose < canvases.length, 'Animation indexes valid cached poses');
  if (sampledPose !== lastPose) { cyclePoses.push(sampledPose); lastPose = sampledPose; }
  if (sampledPose !== 0) flapTime += 0.005;
}
c.rareBird.age = previousAge;
assert.equal(cyclePoses.filter(function(p) { return p === 1; }).length, 2, 'Each cycle contains two complete wingbeats');
assert.equal(cyclePoses.length, 17, 'Both wingbeats pass through all eight intermediate poses');
assert(Math.abs(flapTime - 1.76) < 0.02, 'Two deliberate wingbeats take about 0.88 seconds each');
assert.equal(c.ctx.imageSmoothingEnabled, true, 'Bird drawing restores canvas state');
var originalX = c.cam.x, birdX = c.rareBird.x;
c.cam.x += 10000;
assert.equal(draw(), 0, 'The draw respects horizontal camera culling');
assert.equal(c.rareBird.x, birdX, 'Changing the camera cannot reposition the bird');
c.cam.x = originalX;
var glide = 0, visible = 0, poses = new Set();
while (c.rareBird.active && c.rareBird.age < 60) {
  var pose = c.rareBirdPose(); poses.add(pose); if (pose === 0) glide++;
  visible++;
  assert(draw() <= 1, 'There is never more than one rare bird in a frame');
  c.birdsUpdate(0.05);
}
assert.equal(c.rareBird.active, false, 'The visitor eventually exits the scene');
assert(poses.size === 9 && glide / visible > 0.5 && glide / visible < 0.8, 'The more animated visitor still spends most of its flight gliding');
assert.equal(canvases.length, 9, 'Animation never rebakes sprites');
assert.equal(c.rareBird.pass, 1, 'Exit does not instantly replace the visitor');
assert(c.rareBird.wait >= 90 && c.rareBird.wait <= 180, 'Later visits have 90-180 second gaps');
step(60);
assert.equal(c.rareBird.active, false, 'A full minute after departure still has no new visitor');

// A player who follows the heron must never see it vanish on a lifetime limit.
c.rareBird.wait = 0;
c.birdsUpdate(0.05);
c.rareBird.age = c.rareBird.maxAge + 1;
c.cam.x = c.rareBird.x - c.screenW / 2;
c.birdsUpdate(0.05);
assert.equal(c.rareBird.active, true, 'Visible herons survive the offscreen-retirement timer');
c.rareBird.dir = -1;
c.cam.x = c.rareBird.x + 14;
assert.equal(draw(), 1, 'A large wing or tail can remain visible with its origin beyond the edge');
c.rareBirdUpdate(0.001);
assert.equal(c.rareBird.active, true, 'Lifetime retirement includes the larger sprite extent');
var previousWorld = c.world;
c.world = [];
assert.notEqual(c.world, previousWorld);
assert.equal(draw(), 0, 'A replaced world never draws a previous-world visitor');
c.birdsUpdate(0);
assert.equal(c.rareBird.active, false, 'New world resets the active visitor');
assert.equal(c.rareBird.pass, 0, 'New world resets encounter sequence');
assert(c.rareBird.wait >= 45 && c.rareBird.wait <= 75, 'New world starts with a fresh rare wait');

// Existing flock initialization, motion and drawing still work through 205.
c.birdsInit();
assert(c.birdsRoostN > 0, 'Normal roosts still initialize');
c.cam.x = c.birdsRoostX[0] - c.screenW / 2;
c.birdsUpdate(0.05);
assert(c.birdsFActive.some(Boolean), 'Nearby tiny flocks still activate');
var flockX = Array.from(c.birdsX);
c.birdsUpdate(0.05);
assert(c.birdsX.some(function(x, i) { return x !== flockX[i]; }), 'Normal flock motion is unchanged');
c.birdsDraw();
console.log('Heron timing, solo lifecycle, large white sprites, wing/head/tail animation, cache, offscreen retirement, reset and flock integration checks passed.');
