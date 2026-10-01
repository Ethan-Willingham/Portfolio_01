// The sliced landing-bed search must publish exactly the bed that the
// synchronous snowBuildSupport() returns for the same snapshot: the same
// bucket keys in the same order, holding the same grains in the same order.
// Run: node tools/test-snow-support-sliced.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const noop = () => {};
const N = 40000;
const s = {
  Math, performance, window: { location: { search: '' } },
  cam: { x: 1900, y: -180 }, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 0, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000, SNOW_ACTIVE_CAP: 36000,
  LIQUID_MAX_PARTICLES: N, LIQUID_SNOW_DENSITY: 3.2, LIQUID_CELL: 2.5, GRAVITY: 600,
  RAIN_STORAGE_CAP: 40000, RAIN_ORIGIN: 3, liquidCount: 0, liquidWGPU: null,
  liquidOps: [], LIQUID_OPS_MAX: 10000, liquidMutationSeq: 0,
  liquidType: new Uint8Array(N), liquidX: new Float32Array(N), liquidY: new Float32Array(N),
  rain: { intensity: 0, cells: {}, waterCells: {}, parked: [], waterCount: 0 },
  surfaceWind: { current: 0 }, snowAir: { active: false }, snowAirReset: noop, updateSnowAir: noop,
  liquidToolSync: noop, tileAt: () => null, liquidPointInMiner: () => false,
  rainCell: (x, y) => Math.floor(y / 6) * (Math.ceil(320 * 32 / 6) + 1) + Math.floor(x / 6)
};
vm.createContext(s);
for (const file of ['156-particle-weather.js', '159-snow-physics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', file), 'utf8'), s);
}
let seed = 9137;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function fill(points) {
  s.liquidCount = 0;
  for (const [type, x, y] of points) {
    const i = s.liquidCount++;
    s.liquidType[i] = type; s.liquidX[i] = x; s.liquidY[i] = y;
  }
}
const pitch = 2.5 / Math.sqrt(3.2);
const fixtures = {
  // A wide bed on a floor, with water mixed in and a detached cloud above.
  'rooted bed, water, detached cloud': () => {
    const p = [];
    for (let row = 0; row < 40; row++) for (let col = 0; col < 360; col++) {
      p.push([col % 17 === 0 ? 0 : 5, 2000 + col * pitch + (row % 2) * pitch / 2, 127.3 - row * pitch * 0.87]);
    }
    for (let k = 0; k < 900; k++) p.push([5, 2100 + rand() * 60, -40 - rand() * 30]);
    return { points: p, solid: (x, y) => y >= 128 };
  },
  // A step in the terrain, sloped heaps and scattered free grains.
  'stepped terrain and loose grains': () => {
    const p = [];
    for (let k = 0; k < 16000; k++) {
      const x = 1800 + rand() * 600, ground = x < 2100 ? 128 : 96;
      p.push([5, x, ground - 0.7 - rand() * rand() * 40]);
    }
    return { points: p, solid: (x, y) => y >= (x < 2100 ? 128 : 96) };
  },
  // Coordinates outside the direct-addressed range use the Map traversal.
  'map traversal outside direct range': () => {
    const p = [];
    for (let k = 0; k < 4000; k++) p.push([5, 1 + rand() * 4, 127.2 - rand() * 20]);
    for (let k = 0; k < 2000; k++) p.push([5, 5000 + rand() * 30, 127.2 - rand() * 12]);
    return { points: p, solid: (x, y) => y >= 128 };
  },
  'empty': () => ({ points: [[0, 2000, 120]], solid: (x, y) => y >= 128 })
};
function entries(bed) { return Array.from(bed.entries()).map(([key, grains]) => [key, Array.from(grains)]); }
let checks = 0;
for (const [name, make] of Object.entries(fixtures)) {
  for (const sliceMs of [0, 0.05, 1000]) {
    const { points, solid } = make();
    s.liquidWorldSolidAt = solid;
    fill(points);
    const reference = entries(vm.runInContext('snowBuildSupport()', s));
    vm.runInContext('snowSupportJob = null; snow.bed = new Map(); snowSupportJobStart("k")', s);
    let steps = 0;
    while (vm.runInContext('snowSupportJob', s)) {
      vm.runInContext('snowSupportJobStep(' + sliceMs + ')', s);
      if (++steps > 100000) throw new Error('sliced search did not finish');
    }
    assert.deepEqual(entries(s.snow.bed), reference, name + ' / ' + sliceMs + ' ms slices');
    assert.equal(s.snow.bedKey, 'k');
    checks++;
    console.log('PASS ' + name + ' / ' + sliceMs + ' ms slices: ' + reference.length + ' buckets in ' + steps + ' steps');
  }
}
// Grains admitted while the search runs stay on the published bed.
{
  const { points, solid } = fixtures['rooted bed, water, detached cloud']();
  s.liquidWorldSolidAt = solid; fill(points);
  vm.runInContext('snowSupportJob = null; snow.bed = new Map(); snowSupportJobStart("k"); snowSupportJobStep(0)', s);
  assert.ok(vm.runInContext('!!snowSupportJob', s), 'search spans several slices');
  vm.runInContext('snowSupportJob.inserted.push(2100.5, 60.25)', s);
  while (vm.runInContext('snowSupportJob', s)) vm.runInContext('snowSupportJobStep(0)', s);
  assert.ok(vm.runInContext('snowTouchesBed(2100.5, 60.25, snow.bed, 0.01)', s), 'admitted grain is on the new bed');
  checks++;
  console.log('PASS grain admitted during the search remains a landing contact');
}
console.log('PASS sliced snow support: ' + checks + ' exact comparisons');
