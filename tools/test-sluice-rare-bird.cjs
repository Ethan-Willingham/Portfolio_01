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
    var cv = { pixels: [] };
    cv.getContext = function() { return { fillRect: function(x, y) {
      cv.pixels.push([x, y, this.fillStyle]);
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
assert(palette, 'Read the production palette');
vm.runInContext(palette[0] + read('205-birds.js') + read('206-rare-bird.js'), c);
// No flock slots: the independent hawk hook must still run before that exit.
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
assert(c.rareBird.active && elapsed >= 44.9, 'Surface exposure eventually admits one hawk');
assert.equal(c.rareBird.pass, 1, 'Only one encounter begins');
assert.equal(c.rareBirdInView(8), false, 'The hawk starts entirely beyond a screen edge');
assert.equal(draw(), 0, 'An approaching hawk does not pop into view');
while (!c.rareBirdInView(0) && c.rareBird.age < 3) c.birdsUpdate(0.05);
assert.equal(draw(), 1, 'Hawk draws independently of the absent tiny flocks');
assert.equal(canvases.length, 3, 'The three small poses are baked once');
canvases.forEach(function(cv) {
  assert.equal(cv.width, 9, 'Wingspan is three times the three-pixel flock birds');
  assert(cv.pixels.length > 12, 'Each pose contains a readable silhouette');
  assert(cv.pixels.every(function(p) { return Object.values(c.BLD).includes(p[2]); }), 'Bird reuses the station palette');
});
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
assert(poses.size === 3 && glide / visible > 0.8, 'Long glides have occasional deliberate wing strokes');
assert.equal(canvases.length, 3, 'Animation never rebakes sprites');
assert.equal(c.rareBird.pass, 1, 'Exit does not instantly replace the visitor');
assert(c.rareBird.wait >= 90 && c.rareBird.wait <= 180, 'Later visits have 90-180 second gaps');
step(60);
assert.equal(c.rareBird.active, false, 'A full minute after departure still has no new visitor');

// A player who follows the hawk must never see it vanish on a lifetime limit.
c.rareBird.wait = 0;
c.birdsUpdate(0.05);
c.rareBird.age = c.rareBird.maxAge + 1;
c.cam.x = c.rareBird.x - c.screenW / 2;
c.birdsUpdate(0.05);
assert.equal(c.rareBird.active, true, 'Visible hawks survive the offscreen-retirement timer');
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
console.log('Rare bird timing, solo lifecycle, offscreen entry/exit, glide/poses, palette/cache, reset and flock integration checks passed.');
