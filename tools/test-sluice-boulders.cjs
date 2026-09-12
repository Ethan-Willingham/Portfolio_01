// Run with node tools/test-sluice-boulders.cjs. Uses real placement/draw source.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var marks = [], bakedPixels = 0;
var c = {
  Math: Math, Uint8Array: Uint8Array, Int32Array: Int32Array,
  TILE: 32, SKY_ROWS: 4, COLS: 320, REGION_TOWN: 'town',
  center: 48, regionKind: 'town', surfacePonds: [], world: [],
  cam: { x: 0, y: 0 }, screenW: 320 * 32, screenH: 256,
  window: { location: { search: '' } },
  document: { createElement: function() {
    return { getContext: function() { return { fillRect: function() { bakedPixels++; } }; } };
  } },
  ctx: { imageSmoothingEnabled: true, drawImage: function() { marks.push(Array.from(arguments)); } }
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
c.cam.x = rock.x - 16; c.screenW = 32;
assert.equal(draw(), 1, 'A narrow camera frames the selected stone');
assert.equal(c.ctx.imageSmoothingEnabled, true, 'Pixel-art drawing restores canvas smoothing');
c.world[c.SKY_ROWS][sideCol] = null;
assert.equal(draw(), 0, 'Digging any supporting tile removes the stone immediately without rebuilding');
c.world[c.SKY_ROWS][sideCol] = { type: 'dirt' };
assert.equal(draw(), 1, 'Supported draw fixture is visible again');
c.cam.x = c.COLS * c.TILE + 100;
assert.equal(draw(), 0, 'Horizontal camera culling skips distant stones');
c.cam.x = rock.x - 16;
c.cam.y = c.SKY_ROWS * c.TILE + 1;
assert.equal(draw(), 0, 'An underground camera does not draw surface stones');
c.cam.y = -1000;
assert.equal(draw(), 0, 'A high camera does not draw surface stones');
c.cam.y = 0;

var oldWorld = c.world;
c.world = [];
c.world[c.SKY_ROWS] = Array(c.COLS).fill(null);
assert.equal(draw(), 0, 'A new world waits for its vegetation placement');
assert.equal(c.surfaceBoulderWorld, oldWorld, 'Waiting does not derive from stale vegetation');
c.treesWorldRef = c.world;
assert.equal(draw(), 0, 'Loading an excavated world leaves no floating stones');
assert.equal(c.surfaceBoulderWorld, c.world, 'World replacement triggers stone rebuilding');
assert.equal(c.surfaceBoulders.length, 0, 'Rebuild discards all obsolete placements');
console.log('Boulder bake/reuse, deterministic placement, terrain/pond/compound exclusions, support, reset and culling checks passed.');
