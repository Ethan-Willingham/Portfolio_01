// Deterministic weather, thaw and save migration checks against production
// fragments. The particle pool replaces only the renderer and liquid backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let seed = 270926;
const math = Object.create(Math);
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
math.random = random;
const noop = () => {};
const arrays = ['liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidType', 'liquidDensity',
  'liquidOrigin', 'liquidSleeping', 'liquidRestFrames'];
const s = {
  Math: math, window: { location: { search: '' } }, location: { search: '' },
  cam: { x: 1900, y: -180 }, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 345, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000,
  SNOW_ACTIVE_CAP: 36000, SNOW_CPU_CAP: 7000, LIQUID_MAX_PARTICLES: 65536,
  LIQUID_SNOW_DENSITY: 3.2, LIQUID_SNOW_DIAMETER: 1.8, GRAVITY: 600,
  LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5,
  liquidCount: 0, liquidWGPU: null, liquidOps: [], LIQUID_OPS_MAX: 10000, liquidMutationSeq: 0,
  surfaceWind: { current: 0 }, surfacePonds: [],
  player: { x: 2400, y: 90, vx: 100, onGround: true, jetThrottle: 1 },
  bathMode: false, PERF_DISABLE_WATER: false, PERF_DISABLE_WEATHER: false,
  gameOver: false, gameWon: false, timeOfDay: 0.5,
  computeSunElevation: () => 1, scatDayWeight: elevation => elevation,
  snowAir: { active: false }, snowAirReset: noop, updateSnowAir: noop,
  snowAirAt: () => [0, 0, 0], liquidToolSync: noop,
  tileAt: () => null, liquidWorldSolidAt: (x, y) => y >= 128,
  liquidPointInMiner: () => false, liquidLineClear: () => true,
  mineralLiquidParkedSampleRect: () => []
};
for (const key of arrays) s[key] = [];
s.addLiquidParticle = (type, x, y, vx, vy, origin = 3) => {
  const i = s.liquidCount++;
  [s.liquidType[i], s.liquidX[i], s.liquidY[i], s.liquidVX[i], s.liquidVY[i]] = [type, x, y, vx, vy];
  s.liquidDensity[i] = 3.2;
  s.liquidOrigin[i] = origin; s.liquidSleeping[i] = s.liquidRestFrames[i] = 0;
  return i;
};
s.removeLiquidParticle = i => {
  const last = --s.liquidCount;
  for (const key of arrays) { s[key][i] = s[key][last]; s[key].length = last; }
  s.liquidMutationSeq++;
};
vm.createContext(s);
for (const file of ['155-weather.js', '156-particle-weather.js', '157-particle-rain.js',
  '158-rain-lakes.js', '159-snow-physics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', file), 'utf8'), s);
}
const plain = value => JSON.parse(JSON.stringify(value));
function reset(snowMode = false) {
  s.liquidCount = 0;
  for (const key of arrays) s[key].length = 0;
  s.liquidOps.length = 0; s.liquidMutationSeq = 0;
  s.snowAir.active = false; s.snowAirAt = () => [0, 0, 0];
  s.liquidWorldSolidAt = (x, y) => y >= 128;
  s.tileAt = () => null;
  s.weatherForce = -1; s.weatherTune.precipMode = 0;
  s.weather.flash = 0; s.weather.dbl = 0; s.weather.flashT = 8;
  s.computeSunElevation = () => 1;
  s.rainReset(true, snowMode);
  s.snowSkyExposure.clear();
}
function setFront(kind, phase = 2) {
  s.rain.climate = { kind, phase, elapsed: 20, duration: phase === 3 ? kind === 'snow' ? 240 : 50 : 120,
    strength: 0.95, storm: kind === 'rain', run: 1, first: false };
  s.rainWeather();
  s.weather.cov = s.weather.tcov; s.weather.dark = s.weather.tdark;
  s.weather.pcp = s.weather.tpcp; s.weather.wind = s.weather.twind;
}
function snowGrain(x, y = 127, vx = 0, vy = 0) {
  const i = s.addLiquidParticle(5, x, y, vx, vy);
  s.snow.active++; s.snow.mass++; s.snow.emitted++;
  return i;
}
function step(seconds) {
  for (let t = 0; t < seconds; t += 0.05) {
    s.updateWeather(0.05);
    s.updateParticleRain(0.05);
  }
}

// The chosen starting weather survives saving before the first front arrives.
reset();
assert.equal(s.rain.climate.kind, 'rain');
assert.equal(s.rain.climate.first, true);
const firstSave = plain(s.rainSave());
s.rainRestore(firstSave);
s.rainAdvanceWeather(s.rain.climate.duration + 0.001);
assert.equal(s.rain.climate.kind, 'rain', 'rain-first worlds retain their selected first front after a reload');
assert.equal(s.rain.climate.first, false, 'the first-front choice is consumed once');
reset(true);
assert.equal(s.rain.climate.kind, 'snow', 'snow-first worlds begin with snow');
assert.equal(s.rain.climate.phase, 2, 'snow-first worlds begin in the snow front');

// Follow hundreds of complete fronts, including their real duration draws.
reset();
const counts = { rain: 0, snow: 0, storm: 0 }, durationBounds = [[120, 210], [35, 65], null, null];
let previous = '', run = 0;
for (let transition = 0; transition < 2400; transition++) {
  const old = s.rain.climate.phase;
  s.rainAdvanceWeather(s.rain.climate.duration - s.rain.climate.elapsed + 0.001);
  const f = s.rain.climate;
  assert.equal(f.phase, (old + 1) % 4, 'the front visits each phase in order');
  assert.ok(f.elapsed >= 0 && f.elapsed < 0.002, 'phase transition preserves its fractional remainder');
  const bounds = f.phase === 2 ? f.kind === 'snow' ? [90, 150] : [75, 120] : f.phase === 3 ? f.kind === 'snow' ? [180, 300] : [30, 60] : durationBounds[f.phase];
  assert.ok(f.duration >= bounds[0] && f.duration <= bounds[1], 'duration fits the phase bounds');
  assert.ok(!f.storm || f.kind === 'rain', 'only rain can become a thunderstorm');
  if (f.phase === 1) {
    run = f.kind === previous ? run + 1 : 1;
    previous = f.kind;
    assert.ok(run <= 2, 'the same precipitation kind cannot run more than twice');
    counts[f.kind]++; if (f.storm) counts.storm++;
  }
  s.rainWeather();
  if (f.phase !== 2) assert.equal(s.weather.tpcp, 0, 'sunny, gathering and post-storm cloud phases have no precipitation target');
}
assert.ok(counts.rain > 230 && counts.snow > 230, 'both weather kinds have a substantial share of the seeded sequence');
assert.ok(counts.storm > 80 && counts.storm < counts.rain, 'rain includes both showers and thunderstorms');

// The storm path reaches the existing lightning system, whereas snow does not.
reset(); setFront('rain');
s.weather.flashT = 0;
s.updateWeather(0.05);
assert.ok(s.weather.flash >= 0.8, 'a rainy storm triggers a visible lightning flash');
reset(true); setFront('snow');
s.weather.flashT = 0;
s.updateWeather(0.05);
assert.equal(s.weather.flash, 0, 'snow fronts do not inherit thunderstorm flashes');

// Clear source tails still finish. The protected dry interval emits neither
// material and keeps existing deposited snow in both kinds of weather world.
for (const kind of ['rain', 'snow']) {
  reset(kind === 'snow'); setFront(kind, 3);
  s.snow.field.strength = s.rain.field.strength = 0;
  for (let n = 0; n < 24; n++) snowGrain(2380 + n * 1.5);
  const emitted = [s.snow.emitted, s.rain.emitted];
  step(kind === 'snow' ? 180 : 25);
  assert.deepEqual([s.snow.emitted, s.rain.emitted], emitted, 'settled cloudy weather emits no new snow or rain');
  assert.equal(s.snow.mass, 24, 'the cloudy interval protects the snow already on the ground');
  assert.equal(s.snow.melted, 0, 'cloudy dry weather never starts a thaw');
}
reset(true); setFront('snow', 3);
s.snow.field.strength = 0.8;
const field = s.particleWeatherState(); field.strength = 0.8;
const rect = s.particleWeatherRect();
for (let i = 0; i < 45; i++) s.particleWeatherField(field, rect, [], 0, 5400, 0, 0, [32, 53, 74], 1, noop, noop);
assert.equal(field.strength, 0, 'the residual snow source finishes well before the protected cloud interval ends');

// Thaw follows the eased cloud opening, including the few seconds after
// switching to sunny weather, rather than a phase label or player action.
reset(true); setFront('snow', 3);
s.snow.field.strength = 0;
assert.ok(s.snowTemperature() < 0, 'the full post-storm cloud cover remains cold');
s.rain.climate.phase = 0; s.rain.climate.elapsed = 0; s.rain.climate.duration = 160;
s.updateWeather(0.05);
assert.ok(s.weather.cov > 0.55 && s.snowTemperature() < 0, 'the first sunny frame does not instantly melt the pile');
const temperatures = [];
for (let i = 0; i < 240; i++) { s.updateWeather(0.05); temperatures.push(s.snowTemperature()); }
assert.ok(temperatures.at(-1) > 0, 'parted clouds eventually permit a thaw');
assert.ok(temperatures.every((value, index) => !index || value >= temperatures[index - 1]), 'thaw strength follows the gradual clearing continuously');
s.weather.pcp = 0.02;
assert.ok(s.snowTemperature() < 0, 'remaining precipitation prevents premature thaw');
s.weather.pcp = 0; s.snow.field.strength = 0.02;
assert.ok(s.snowTemperature() < 0, 'the final snow source tail prevents premature thaw');

// The rig and foundations provide no heat, even under sustained strong jets.
reset(true); setFront('snow', 3);
s.snow.field.strength = 0;
s.tileAt = row => row >= s.SKY_ROWS ? { type: 'foundation' } : null;
s.snowAir.active = true; s.snowAirAt = () => [950, -600, 1000];
for (let n = 0; n < 24; n++) snowGrain(2380 + n * 1.5);
step(8);
assert.equal(s.snowHeat(s.player.x + 5, 127), 0, 'foundation and player proximity add no heat');
assert.equal(s.snow.melted, 0, 'sustained strong exhaust never melts snow');
assert.equal(s.snow.mass, 24, 'strong exhaust preserves every dry snow particle');

// Only actual water contributes local thaw. Other liquid surfaces still
// catch precipitation, but oil or mineral contents are not water.
reset(true); setFront('snow', 3);
for (const [type, x] of [[0, 2502], [1, 2604], [2, 2706]]) {
  for (let n = 0; n < 12; n++) s.addLiquidParticle(type, x + n % 3, 126 + Math.floor(n / 3) * 0.2, 0, 0, 1);
}
s.rainScan(0); s.snow.temperature = -4;
assert.ok(s.snowHeat(2503, 127) > 0, 'actual water contact thaws snow even under clouds');
assert.equal(s.snowHeat(2605, 127), 0, 'oil contact does not thaw snow');
assert.equal(s.snowHeat(2707, 127), 0, 'mineral liquid contact does not thaw snow');
assert.ok(s.rain.cells[s.rainCell(2605, 127)] >= 10, 'nonwater contact remains available to the rain collision path');
const wet = snowGrain(2503, 127, 17, 29);
const before = [s.liquidX[wet], s.liquidY[wet], s.liquidVX[wet], s.liquidVY[wet]];
math.random = () => 0;
s.snowScan(1 / 60, 0.12);
math.random = random;
assert.equal(s.liquidType[wet], 0, 'the water-contact maintenance path converts snow to water');
assert.deepEqual([s.liquidX[wet], s.liquidY[wet], s.liquidVX[wet], s.liquidVY[wet]], before,
  'water thaw retains the exact solver position and momentum');
assert.deepEqual(s.liquidOps.slice(-4), [4, wet, 0, 3], 'thaw queues an in-place GPU material change');
assert.equal(s.snow.melted, 1, 'each melted grain is accounted once');

reset(true);
s.snow.temperature = 5;
s.liquidWorldSolidAt = (x, y) => y >= 224 || (x >= 2500 && y >= 160 && y < 176);
assert.ok(s.snowHeat(2400, 223) > 0, 'sunlight reaches snow at the bottom of an open shaft');
assert.equal(s.snowHeat(2500, 223), 0, 'a roof protects underground snow from clearing-weather thaw');
assert.ok(s.snowHeat(2400, 223) < 0.1, 'clear-sky thaw remains gradual');
s.rain.waterCells[s.rainCell(2500, 223)] = 12;
assert.ok(s.snowHeat(2500, 223) >= 5, 'water contact can thaw sheltered snow');

// Repeated sunny maintenance converts individual grains over time while
// conserving material. A roof continues protecting an adjacent pile.
reset(true);
s.snow.temperature = 5;
s.liquidWorldSolidAt = (x, y) => y >= 224 || (x >= 2500 && y >= 160 && y < 176);
for (let n = 0; n < 100; n++) {
  snowGrain(2300 + n * 1.5, 223);
  snowGrain(2600 + n * 1.5, 223);
}
s.snowScan(0.12, 0.12);
assert.ok(s.snow.melted < 5, 'clearing does not convert the whole exposed pile at once');
for (let n = 1; n < 250; n++) s.snowScan(0.12, 0.12);
assert.ok(s.snow.melted > 30 && s.snow.melted < 95, 'the exposed pile progressively becomes water over thirty seconds');
assert.equal(s.liquidCount, 200, 'clear-sky thaw conserves every material particle');
assert.equal(s.liquidType.filter((type, i) => type === 5 && s.liquidX[i] >= 2500).length, 100,
  'the entire sheltered pile survives while adjacent exposed snow melts');
assert.equal(s.snow.mass + s.rain.waterCount, 200, 'clear-sky melt accounting conserves the combined mass');

// Weather saves carry the material across front changes and restore the
// actual eased sky, not a new snap to the current phase's target.
reset(true); setFront('rain', 3);
s.rain.climate.elapsed = 23.25; s.rain.climate.run = 2;
s.weather.cov = 0.63; s.weather.dark = 0.2; s.weather.pcp = 0.012; s.weather.wind = 0.25;
snowGrain(2400, 127, 3, 4);
s.snowStore(5000, 127, -2, 7); s.snow.mass++;
s.snow.grains.push({ x: 2420, y: 40, vx: 12, vy: -17, size: 0.5, phase: 1, physical: true });
s.snow.mass++;
s.rain.parked.push(2400, 80, 2500, 150);
const saved = plain(s.rainSave());
assert.equal(saved.climate.version, 3, 'the new weather save identifies its full front schema');
assert.equal(saved.mode, 'rain', 'rain is the current front despite remaining snow');
s.rainRestore(saved);
assert.deepEqual(plain(s.rainSave()), saved, 'new saves round-trip all snow, water, front progress and eased sky');
assert.equal(s.window.__particleSnow.stats().mass, 3, 'rain-front loading retains landed and airborne snow');

// v28.95 gave rain the long snow interval. Shorten its remaining break once,
// without delaying a front that was already close to clearing.
for (const remaining of [210, 10]) {
  const prior = plain(saved);
  prior.climate.version = 2; prior.climate.elapsed = 20; prior.climate.duration = 20 + remaining;
  s.rainRestore(prior);
  const left = s.rain.climate.duration - s.rain.climate.elapsed;
  if (remaining === 210) assert.ok(left >= 30 && left <= 60, 'old rain aftermath adopts the short break');
  else assert.equal(left, 10, 'migration never prolongs a rain break about to end');
  const migrated = plain(s.rainSave());
  s.rainRestore(migrated);
  assert.deepEqual(plain(s.rainSave()), migrated, 'subsequent loads keep the shortened duration exactly');
}
const priorSnow = plain(saved);
priorSnow.mode = priorSnow.climate.kind = 'snow';
priorSnow.climate.version = 2; priorSnow.climate.duration = 240;
s.rainRestore(priorSnow);
assert.equal(s.rain.climate.duration, 240, 'existing snow aftermath retains its long play interval');

const legacySnow = { enabled: true, mode: 'snow', water: [2400, 150],
  snow: { version: 2, particles: [2400, 127, 0, 0], grains: [] },
  climate: { phase: 3, elapsed: 12, duration: 24, strength: 0.75 } };
s.rainRestore(legacySnow);
assert.equal(s.rain.climate.elapsed, 12, 'legacy loading preserves elapsed front progress');
assert.ok(s.rain.climate.duration - s.rain.climate.elapsed >= 180 && s.rain.climate.duration - s.rain.climate.elapsed <= 300,
  'legacy short cloud breaks receive the protected play interval');
assert.equal(s.window.__particleSnow.stats().mass, 1, 'legacy deposited snow is preserved');
assert.equal(s.rain.climate.kind, 'snow', 'legacy snow mode supplies the missing front kind');
const legacyRain = { enabled: true, mode: 'rain', water: [2400, 40, 2450, 150],
  climate: { phase: 2, elapsed: 17, duration: 100, strength: 0.75 } };
s.rainRestore(legacyRain);
assert.deepEqual(plain(s.rain.parked), legacyRain.water, 'legacy rain worlds retain real above-ground water when mixed weather is enabled');
assert.equal(s.rain.climate.elapsed, 17, 'legacy rain-front progress is preserved');
assert.equal(s.rain.climate.kind, 'rain', 'legacy rain mode supplies the missing front kind');
assert.equal(s.worldSnowEnabled, true, 'an existing rain world can receive a later snow front');
s.rainRestore({ enabled: false });
assert.equal(s.worldRainEnabled, false, 'weather-disabled worlds stay disabled');
assert.equal(s.worldSnowEnabled, false, 'weather-disabled worlds do not acquire snow');
assert.deepEqual(plain(s.rainSave()), { enabled: false }, 'disabled saves remain disabled');

console.log('Weather cycle, protected cloud interval, thaw and save migration checks passed.', counts);
