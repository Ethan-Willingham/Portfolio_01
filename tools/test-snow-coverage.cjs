// Deterministic weather-only regression. The live GPU/CPU jet and smoke tests
// cover solver transfer; this isolates camera coverage, streaming and saves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let seed = 2039;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noop = () => {};
const s = { Math: math, window: { location: { search: '' } },
  cam: {x: 2000, y: -900}, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 345, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000,
  SNOW_ACTIVE_CAP: 36000, SNOW_CPU_CAP: 7000, LIQUID_MAX_PARTICLES: 65536,
  RAIN_STORAGE_CAP: 40000, RAIN_ORIGIN: 3, liquidCount: 0, liquidWGPU: null,
  liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [],
  rain: { intensity: .65, cells: {}, parked: [], waterCount: 0 },
  surfaceWind: { current: .3 }, player: {x: 2465, y: -620},
  snowAir: {}, snowAirReset: noop, updateSnowAir: noop, snowAirAt: () => [0, 0],
  liquidToolSync: noop, rainCatchLakes: noop,
  tileAt: () => null, liquidWorldSolidAt: () => false, liquidPointInMiner: () => false,
  liquidLineClear: () => true, rainCell: (x, y) => Math.floor(y / 6) * 2000 + Math.floor(x / 6)
};
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice/159-snow-physics.js'), 'utf8'), s);
s.snowTemperature = () => -4;
function reset() {
  s.snowReset(true); s.cam.x = 2000; s.cam.y = -900; s.screenW = 960; s.screenH = 600;
  s.rain.intensity = .65; s.surfaceWind.current = .3; s.SNOW_RATE = 345;
  s.updateSnow(0);
}
function count(rect) { return s.snow.grains.filter(p => p.x >= rect.left && p.x < rect.right && p.y >= rect.top && p.y < rect.bottom).length; }
function nearRig() { return count({left: s.cam.x + 300, right: s.cam.x + 660, top: s.cam.y + 180, bottom: s.cam.y + 420}); }
function step(dx, dy = 0, frames = 1) {
  for (let i = 0; i < frames; i++) { s.cam.x += dx; s.cam.y += dy; s.updateSnow(1 / 60); }
}
reset();
const baseline = nearRig();
assert.ok(baseline > 150, 'sky initially surrounds the rig');
const counts = [];
for (const direction of [1, -1, 1, -1]) {
  for (let t = 0; t < 8; t++) { step(direction * 8, 0, 30); counts.push(nearRig()); }
}
console.log({ baseline, minFlight: Math.min(...counts), maxFlight: Math.max(...counts), stats: s.window.__particleSnow.stats() });
assert.ok(Math.min(...counts) > baseline * .55, 'left and right flight retain surrounding snowfall');
assert.ok(Math.max(...counts) < baseline * 1.9, 'reversal does not stack full snow volumes');
assert.ok(s.snow.grains.length <= 5400 && s.snow.airCount > 1000, 'offscreen sky frees the active budget');
assert.equal(s.window.__particleSnow.stats().mass, s.snow.emitted, 'streaming conserves every emitted grain');

// A camera-only translation cannot drag the particles already in the overlap.
reset();
const tracked = s.snow.grains.filter(p => p.x > 2350 && p.x < 2500).map(p => [p, p.x, p.y, p.vx, p.vy]);
s.cam.x += 120; s.updateSnow(0);
for (const [p, x, y, vx, vy] of tracked) {
  assert.ok(s.snow.grains.includes(p)); assert.deepEqual([p.x, p.y, p.vx, p.vy], [x, y, vx, vy]);
}
// An offscreen flake returns with its own world position and velocity.
const flake = tracked[0][0];
s.cam.x += 2400; s.updateSnow(0);
assert.ok(!s.snow.grains.includes(flake));
s.cam.x -= 2400; s.updateSnow(0);
assert.ok(s.snow.grains.includes(flake));
assert.deepEqual([flake.x, flake.y, flake.vx, flake.vy], tracked[0].slice(1));

const saved = JSON.parse(JSON.stringify(s.snowSave()));
const mass = s.window.__particleSnow.stats().mass;
s.snowReset(true); s.snowRestore(saved);
assert.equal(s.window.__particleSnow.stats().mass, mass);
assert.equal(JSON.stringify(s.snowSave()), JSON.stringify(saved), 'stored sky and coverage round-trip exactly');
s.updateSnow(0);
assert.equal(s.window.__particleSnow.stats().mass, mass, 'reload does not prime a second sky');
const storedAir = s.snow.airCount;
s.snow.temperature = 4; s.rain.waterCount = s.RAIN_STORAGE_CAP;
s.snowScan(10000);
assert.equal(s.snow.airCount, storedAir, 'full water storage defers atmospheric thaw');
s.rain.waterCount = 0; s.snowScan(10000);
assert.equal(s.snow.airCount, 0);
assert.equal(s.rain.parked.length / 2, storedAir, 'stored sky melts one for one into stored water');
assert.equal(s.window.__particleSnow.stats().mass + s.rain.parked.length / 2, mass);
s.rain.parked = [];

// A world initialized before precipitation starts still primes its first sky.
s.snowReset(true); s.rain.intensity = 0; s.updateSnow(0);
assert.equal(s.snow.grains.length, 0);
s.rain.intensity = .65; s.updateSnow(0);
assert.ok(nearRig() > 150);

// Zoom expansion and vertical travel populate newly exposed open air.
reset(); s.screenW = 1440; s.screenH = 800; s.updateSnow(0);
assert.ok(count({left: s.cam.x + 1050, right: s.cam.x + 1400, top: -700, bottom: -300}) > 100);
step(0, -5, 120);
assert.ok(nearRig() > 100);
step(0, 5, 120);
assert.ok(nearRig() > 100);
// No births in fair weather, underground, above the weather ceiling or at cap.
for (const scene of ['fair', 'underground', 'space', 'full']) {
  reset();
  if (scene === 'fair') s.rain.intensity = 0;
  if (scene === 'underground') s.cam.y = 600;
  if (scene === 'space') s.cam.y = -4000;
  if (scene === 'full') s.SNOW_MASS_CAP = s.snow.mass;
  const emitted = s.snow.emitted;
  step(8, 0, 60);
  assert.equal(s.snow.emitted, emitted, scene + ' does not create snowfall');
  s.SNOW_MASS_CAP = 120000;
}
// World edges still contain snow, with every new flake inside world bounds.
for (const x of [0, 320 * 32 - 960]) {
  reset(); s.cam.x = x; s.updateSnow(0);
  assert.ok(nearRig() > 100);
  assert.ok(s.snow.grains.every(p => p.x >= 2 && p.x < s.COLS * s.TILE));
}
console.log('PASS horizontal flight, reversals, world anchoring, streaming conservation, save/load, zoom, altitude and budgets');
