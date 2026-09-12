// Run with node tools/test-sluice-boulders.cjs. Uses real placement/draw source.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var marks = [], bakedPixels = 0, pieceCrops = [], canvasStack = [];
var c = {
  Math: Math, Uint8Array: Uint8Array, Int32Array: Int32Array,
  TILE: 32, SKY_ROWS: 4, COLS: 320, REGION_TOWN: 'town',
  center: 48, regionKind: 'town', surfacePonds: [], world: [],
  cam: { x: 0, y: 0 }, screenW: 320 * 32, screenH: 256,
  window: { location: { search: '' } },
  document: { createElement: function() {
    return { getContext: function() { return {
      fillRect: function() { bakedPixels++; },
      drawImage: function() { pieceCrops.push(Array.from(arguments)); }
    }; } };
  } },
  ctx: {
    imageSmoothingEnabled: true, globalAlpha: 1,
    save: function() { canvasStack.push([this.imageSmoothingEnabled, this.globalAlpha]); },
    restore: function() {
      var state = canvasStack.pop(); this.imageSmoothingEnabled = state[0]; this.globalAlpha = state[1];
    },
    beginPath: function() {}, rect: function() {}, clip: function() {},
    translate: function() {}, rotate: function() {}, fillRect: function() {},
    drawImage: function() { var mark = Array.from(arguments); mark.alpha = this.globalAlpha; marks.push(mark); }
  }
};
c.tileAt = function(r, col) { return c.world[r] && c.world[r][col] || null; };
c.regionAt = function() { return { kind: c.regionKind, townIndex: 0 }; };
c.townCenterCol = function() { return c.center; };
function dirt() { return Array.from({ length: c.COLS }, function() { return { type: 'dirt' }; }); }
c.world[c.SKY_ROWS] = dirt();
vm.createContext(c);
var palette = read('170-render-station-decor.js').match(/var BLD = \{[\s\S]*?\n  \};/);
assert(palette, 'Read the station palette from source');
vm.runInContext(palette[0] + read('165-render-trees.js') + read('166-render-surface-boulders.js'), c);
c.treesBuilt = true; c.treesWorldRef = c.world;
c.surfaceBouldersRebuild();
assert(c.surfaceBoulders.length > 3 && bakedPixels > 0, 'Solid town surface gets baked stone accents');
function placement() {
  return JSON.stringify(c.surfaceBoulders.map(function(r) { return [r.x, r.cL, r.cR, r.spr.w, r.spr.h]; }));
}
var baseline = placement(), pixelsBefore = bakedPixels;
c.surfaceBouldersRebuild();
assert.equal(placement(), baseline, 'Same world produces deterministic placement and sprite choices');
assert.equal(bakedPixels, pixelsBefore, 'Rebuilding reuses baked sprites');

// Pick an actual wide stone so removing a side support tests its whole foot,
// rather than accidentally testing only the tile under its centre.
var rock = c.surfaceBoulders.find(function(r) { return r.cL < Math.floor(r.x / c.TILE); });
assert(rock, 'Fixture includes a stone spanning multiple ground columns');
var sideCol = rock.cL;
function hasRock() { return c.surfaceBoulders.some(function(r) { return r.x === rock.x; }); }
[null, { type: 'foundation' }, 'wall'].forEach(function(block) {
  c.world[c.SKY_ROWS][sideCol] = block;
  assert.equal(c.surfaceBoulderSupported(rock), false, 'Every foot tile must be natural solid ground');
  c.surfaceBouldersRebuild();
  assert.equal(hasRock(), false, 'Invalid side support excludes placement');
  c.world[c.SKY_ROWS][sideCol] = { type: 'dirt' };
});
c.surfacePonds = [{ cL: sideCol, cR: sideCol }];
c.surfaceBouldersRebuild();
assert.equal(hasRock(), false, 'Pond banks exclude stones even when the tile is still solid');
c.surfacePonds = [];
c.center = Math.floor(rock.x / c.TILE);
c.surfaceBouldersRebuild();
assert.equal(hasRock(), false, 'The town compound stays clear');
c.center = 48;
c.regionKind = 'ocean';
c.surfaceBouldersRebuild();
assert.equal(c.surfaceBoulders.length, 0, 'Stones only decorate town land');
c.regionKind = 'town';
c.TREES = [{ x: rock.x, spr: { w: 48 } }];
c.surfaceBouldersRebuild();
assert.equal(hasRock(), false, 'Stones leave space around existing vegetation');
c.TREES = [];
c.surfaceBouldersRebuild();
assert.equal(placement(), baseline, 'Restoring terrain and surroundings restores deterministic placement');

function draw() { marks.length = 0; c.drawSurfaceBoulders(); return marks.length; }
function advance(seconds) {
  for (var i = 0; i < Math.round(seconds * 100); i++) c.surfaceBouldersUpdate(0.01);
}
function currentRock() { return c.surfaceBoulders.find(function(r) { return r.x === rock.x; }); }
rock = currentRock();
c.cam.x = rock.x - 16; c.screenW = 32;
assert.equal(draw(), 1, 'A narrow camera frames the selected stone');
assert.equal(c.ctx.imageSmoothingEnabled, true, 'Pixel-art drawing restores canvas smoothing');
c.world[c.SKY_ROWS][sideCol] = null;
assert.equal(draw(), 1, 'Excavation does not make the boulder pop out during draw');
assert.equal(rock.fall, -1, 'Drawing cannot start or advance collapse while paused');
c.surfaceBouldersUpdate(0);
assert.equal(rock.fall, -1, 'A zero-time update leaves the paused scene unchanged');
c.surfaceBouldersUpdate(0.01);
assert.equal(rock.fall, 0, 'Lost support starts a timed collapse');
assert.equal(rock.dir, -1, 'A missing left support tips the stone left');
assert.equal(draw(), 1, 'Collapse initially retains the complete stone');
assert.equal(marks[0][0], rock.spr.cv, 'Settling uses the original cached silhouette');
for (var pausedDraw = 0; pausedDraw < 30; pausedDraw++) draw();
assert.equal(rock.fall, 0, 'Repeated paused rendering never advances the animation');
advance(0.15);
assert.equal(draw(), 1, 'The first 0.16 seconds are a short whole-stone settle');
advance(0.02);
assert.equal(draw(), 3, 'The stone then splits into three cached pieces');
assert(marks.every(function(mark) { return rock.spr.pieces.includes(mark[0]); }), 'Draw uses the baked fragments');
var pieces = rock.spr.pieces, cropCount = pieceCrops.length;
assert.equal(c.surfaceBoulderPieces(rock.spr), pieces, 'Fragment cache is reused');
assert.equal(pieceCrops.length, cropCount, 'Repeated fragment requests do no canvas copying');
// Check the actual sprite-copy calls: every source pixel belongs to exactly
// one shard, including each jagged boundary. No duplicated or missing strips.
var coverage = Array(rock.spr.w * rock.spr.h).fill(0);
pieceCrops.filter(function(args) { return args[0] === rock.spr.cv; }).forEach(function(args) {
  assert.equal(args[4], 1, 'Fragments copy one source row at a time');
  assert.equal(args[1], args[5], 'Fragment copies retain horizontal registration');
  assert.equal(args[2], args[6], 'Fragment copies retain vertical registration');
  for (var x = args[1]; x < args[1] + args[3]; x++) coverage[args[2] * rock.spr.w + x]++;
});
assert(coverage.every(function(n) { return n === 1; }), 'Fragments exactly cover the original sprite');
advance(0.48);
assert.equal(draw(), 3, 'Fragments remain visible during their fall');
assert(marks.every(function(mark) { return mark.alpha > 0 && mark.alpha < 1; }), 'Chunks fade as they settle');
assert.equal(c.ctx.globalAlpha, 1, 'Fall rendering restores canvas alpha');
advance(0.39);
assert.equal(rock.gone, false, 'Collapse remains live just before 1.05 seconds');
advance(0.02);
assert.equal(rock.gone, true, 'Collapse retires after 1.05 seconds');
assert.equal(draw(), 0, 'Finished fragments are not drawn');

// Offscreen updates finish an existing collapse, while excavation that starts
// out of sight is retired directly and cannot replay when the camera returns.
c.world[c.SKY_ROWS][sideCol] = { type: 'dirt' };
c.surfaceBouldersRebuild(); rock = currentRock();
c.world[c.SKY_ROWS][sideCol] = null;
c.surfaceBouldersUpdate(0.01);
c.cam.x = c.COLS * c.TILE + 100;
advance(1.1);
assert.equal(rock.gone, true, 'A collapse finishes even after the camera leaves');
c.cam.x = rock.x - 16;
assert.equal(draw(), 0, 'Returning to a finished collapse does not replay it');
c.world[c.SKY_ROWS][sideCol] = { type: 'dirt' };
c.surfaceBouldersRebuild(); rock = currentRock();
c.cam.x = c.COLS * c.TILE + 100;
c.world[c.SKY_ROWS][sideCol] = null;
c.surfaceBouldersUpdate(0.01);
assert(rock.gone && rock.fall === -1, 'Offscreen excavation does not queue a later animation');
c.cam.x = rock.x - 16;
assert.equal(draw(), 0, 'An offscreen excavation stays gone when revisited');
c.world[c.SKY_ROWS][sideCol] = { type: 'dirt' };
c.surfaceBouldersRebuild(); rock = currentRock();
assert.equal(draw(), 1, 'Supported draw fixture is visible again');
c.cam.x = c.COLS * c.TILE + 100;
assert.equal(draw(), 0, 'Horizontal camera culling skips distant stones');
c.cam.x = rock.x - 16;
c.cam.y = c.SKY_ROWS * c.TILE + 100;
assert.equal(draw(), 0, 'An underground camera does not draw surface stones');
c.cam.y = -1000;
assert.equal(draw(), 0, 'A high camera does not draw surface stones');
c.cam.y = 0;

assert(rock.cR > Math.floor(rock.x / c.TILE), 'Wide fixture also has a right support');
c.world[c.SKY_ROWS][rock.cR] = null;
c.surfaceBouldersUpdate(0.01);
assert.equal(rock.dir, 1, 'A missing right support tips the stone right');
assert.equal(rock.fall, 0, 'Save/reset fixture has a live collapse');

var oldWorld = c.world;
c.world = [];
c.world[c.SKY_ROWS] = Array(c.COLS).fill(null);
assert.equal(draw(), 0, 'A new world waits for its vegetation placement');
assert.equal(c.surfaceBoulderWorld, oldWorld, 'Waiting does not derive from stale vegetation');
c.treesWorldRef = c.world;
assert.equal(draw(), 0, 'Loading an excavated world leaves no floating stones');
assert.equal(c.surfaceBoulderWorld, c.world, 'World replacement triggers stone rebuilding');
assert.equal(c.surfaceBoulders.length, 0, 'Rebuild discards all obsolete placements');
assert.equal(canvasStack.length, 0, 'Every drawing save has a matching restore');
console.log('Boulder placement/exclusions, settle/shard lifecycle, pause, direction, sprite cache/coverage, offscreen retirement, reset and culling checks passed.');
