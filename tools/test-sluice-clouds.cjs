// Cloud raster/cache regressions. Run with node tools/test-sluice-clouds.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const drawn = [];
function context() {
  return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, save() {}, restore() {}, fillRect() {},
    drawImage(...args) { drawn.push(args.slice(1)); },
    createPattern: () => ({ setTransform() {} }),
    createLinearGradient: () => ({ addColorStop() {} })
  };
}
const c = {
  Math, Uint8ClampedArray, Float32Array,
  document: { createElement: () => ({ getContext: context }) },
  ctx: context(), dpr: 1, worldScale: 1, SKY_ROWS: 4, TILE: 32,
  cam: { x: 4400, y: -155 }, timeOfDay: .5, atmosDayWeight: 1,
  computeSunElevation: () => Math.PI / 2, PERF_DISABLE_WEATHER: false,
  DOMMatrix: function () {},
  nightSkyHexRGB(hex) { const v = parseInt(hex.slice(1), 16); return { r:v>>16, g:(v>>8)&255, b:v&255 }; }
};
vm.createContext(c);
const root = path.resolve(__dirname, '..');
// Read the real palette and source; no generated-bundle dependency.
const decor = fs.readFileSync(path.join(root, 'js/sluice/170-render-station-decor.js'), 'utf8');
const weatherSource = fs.readFileSync(path.join(root, 'js/sluice/155-weather.js'), 'utf8');
const exposed = ['weatherInitSprites', 'weatherBakeSprite', 'drawWeatherClouds', 'CLOUD_CLASSES',
  'CLOUD_VARIANTS', 'cloudSprites', 'weather', 'weatherTune'];
const accessors = exposed.map(n => `Object.defineProperty(globalThis, '${n}', {
  get: function() { return ${n}; }, set: function(v) { ${n} = v; }
});`).join('\n');
// Match the game's IIFE scope, including setters for instrumentation.
vm.runInContext('(function(){var Math = globalThis.Math, Float32Array = globalThis.Float32Array;' + decor.match(/var SKY = \{[\s\S]*?\n  \};/)[0] +
  weatherSource + accessors + '})();', c);
c.weatherInitSprites();
const bake = c.weatherBakeSprite;
const counts = new Map();
c.weatherBakeSprite = (ci, vi) => { const k = ci + ':' + vi; counts.set(k, (counts.get(k) || 0) + 1); bake(ci, vi); };
function draw() { c.drawWeatherClouds(960, 680, 283); }
for (let i = 0; i < 26; i++) draw();
for (let ci = 0; ci < c.CLOUD_CLASSES.length; ci++) {
  const C = c.CLOUD_CLASSES[ci];
  for (let vi = 0; vi < c.CLOUD_VARIANTS; vi++) {
    const S = c.cloudSprites[ci][vi];
    assert(S.ready && !S.dirty, 'Every variant finishes warming');
    assert(S.den.some(a => a > 100), 'Every variant contains visible cloud');
    if (!C.cirrus) assert(S.den.some(a => a >= 250), 'Cumulus retains an opaque core');
    for (let y = 0; y < C.th; y++) for (let x = 0; x < C.tw; x++) {
      if (!x || !y || x === C.tw - 1 || y === C.th - 1) assert.equal(S.den[y*C.tw+x], 0, 'Transparent sprite gutter');
    }
    const before = Buffer.from(S.den);
    bake(ci, vi);
    assert.deepEqual(Buffer.from(S.den), before, 'Identical seed and controls produce identical geometry');
  }
}
for (let i = 0; i < 26; i++) draw();
const bakesBefore = [...counts.values()].reduce((a,b) => a+b, 0);
const densityBefore = Buffer.from(c.cloudSprites[1][0].den);
for (const coverage of [.05, .3, .58, 1]) {
  c.weather.cov = coverage;
  for (const drift of [-1e8, -300, 0, 300, 1e8]) {
    c.weather.driftAccum = drift;
    draw();
  }
}
assert.equal([...counts.values()].reduce((a,b) => a+b, 0), bakesBefore, 'Coverage and drift reuse geometry');
assert(drawn.every(a => a.every(Number.isFinite)), 'All draw coordinates stay finite across long drift');
const colour = Buffer.from(c.cloudSprites[1][0].img.data);
c.weatherTune.highlight = .4;
for (let i = 0; i < 8; i++) draw();
assert.notDeepEqual(Buffer.from(c.cloudSprites[1][0].img.data), colour, 'Live highlight updates with a frozen sun');
assert.deepEqual(Buffer.from(c.cloudSprites[1][0].den), densityBefore, 'Recolour preserves density');
counts.clear();
for (let i = 0; i < 24; i++) {
  c.weather.morph += .25; // Invalidate faster than an entire pool can bake.
  draw();
}
assert.equal(counts.size, 24, 'Rapid morph changes cannot starve any variant');
const beforeDisable = drawn.length;
c.weatherTune.enabled = 0;
draw();
assert.equal(drawn.length, beforeDisable, 'Weather off does no cloud drawing');
console.log('Cloud raster, deterministic geometry, cache reuse, live colour, morph fairness and disable checks passed.');
