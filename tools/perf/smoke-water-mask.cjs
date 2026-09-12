// Real Canvas2D mask and WebGL smoke regression. No game hooks ship.
// PLAYWRIGHT_MODULE / CHROME override local installations; DUMP stays outside the repo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const fragment = 'js/sluice/190-smoke-webgl.js';
const original = cp.execFileSync('git', ['show', (process.env.BASE_REF || '97f9f70') + ':' + fragment], { cwd: root, encoding: 'utf8' });
const current = fs.readFileSync(path.join(root, fragment), 'utf8');

function checkMasks({ original, current }) {
  function factory(source) {
    const paint = source.slice(source.indexOf('  function smokeFluidPaintObstacle()'), source.indexOf('  // Hand the strongest downward water motion'));
    const state = source.slice(source.indexOf('  var smokeObstWaterBins'), source.indexOf('  // Fast water entrains'));
    return new Function(`
      var smokeFluidActive = true, isMobile = false, smokeObstDbgPaints = 0, smokeObstDbgStamps = 0;
      var smokeObstDbgSrc, SMOKE_WATER_OBSTACLE = 1, SMOKE_WATER_FLOW_MIN_VY = 55, bathMode = false;
      var TILE = 32, COLS = 100, SKY_ROWS = 4, cam = {x:0,y:0};
      var smokeFluidMarginWorldX = 0, smokeFluidMarginWorldY = 0;
      var smokeFluidDomainWorldW = 256, smokeFluidDomainWorldH = 192;
      var smokeFluidObstacleW = 768, smokeFluidObstacleH = 576;
      var smokeFluidObstacleCanvas = document.createElement('canvas');
      smokeFluidObstacleCanvas.width = smokeFluidObstacleW; smokeFluidObstacleCanvas.height = smokeFluidObstacleH;
      var smokeFluidObstacleCtx = smokeFluidObstacleCanvas.getContext('2d', {willReadFrequently:true});
      var smokeDriver = {setObstacleAlpha:function(){}}, jelloBodies = [];
      function tileAt(){return null;} function dominantVoidBackingKind(){return false;} function perfMark(){}
      var liquidCount = 0, liquidX, liquidY, liquidVY, liquidFrozen;
      ${state}
      ${paint}
      return {canvas:smokeFluidObstacleCanvas, paint:function(particles, pan, bath){
        liquidCount = particles.length; liquidX = new Float32Array(liquidCount);
        liquidY = new Float32Array(liquidCount); liquidVY = new Float32Array(liquidCount);
        liquidFrozen = new Uint8Array(liquidCount);
        particles.forEach(function(p,i){liquidX[i]=p[0];liquidY[i]=p[1];liquidVY[i]=p[2]||0;liquidFrozen[i]=p[3]||0;});
        cam.x=pan||0; bathMode=!!bath; smokeFluidPaintObstacle();
        return smokeFluidObstacleCtx.getImageData(0,0,768,576).data;
      }, repaint:function(){smokeFluidPaintObstacle();}};
    `)();
  }
  const smokeSource = current.slice(0, current.indexOf('  // ====== Smoke:'));
  const results = {};
  const particles = [];
  // A stretched, slow sheet near the old mask's 24-particle threshold.
  // Subpixel motion changes hard-bin counts despite constant fluid density.
  for (let y = 24; y < 168; y += 1.68) for (let x = 24; x < 232; x += 1.68) particles.push([x, y, 0]);
  const dense = [];
  for (let y = 24; y < 168; y += 1.25) for (let x = 24; x < 232; x += 1.25) dense.push([x, y, 0]);
  const sparse = particles.filter((_, i) => i % 20 === 0);
  for (const [name, source] of [['baseline', original], ['current', current]]) {
    const m = factory(source);
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 576;
    canvas.style.background = '#2d60a0'; document.body.appendChild(canvas);
    const label = document.createElement('div'); label.textContent = name; document.body.insertBefore(label, canvas);
    const smoke = new Function(smokeSource + '\nreturn SmokeFluid;')();
    if (!smoke.init(canvas, { SIM_RESOLUTION: 96, DYE_RESOLUTION: 192, SHADING: false })) throw Error('No smoke WebGL');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    function sampleSmoke() {
      smoke.setObstacleAlpha(m.canvas); smoke.displayPass();
      const bytes = new Uint8Array(768 * 576 * 4);
      gl.readPixels(0, 0, 768, 576, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      if (gl.getError()) throw Error('WebGL error');
      return bytes;
    }
    // A broad, smooth cloud. Any sharp interior cuts are from the mask.
    smoke.splat(.5, .5, 0, 0, {r:.3,g:.3,b:.3}, 100);
    let mask = m.paint(particles), smokePixels = sampleSmoke();
    let jumps = 0, maxJump = 0, maskLo = 255, maskHi = 0;
    for (let y = 120; y < 456; y++) for (let x = 120; x < 648; x++) {
      const i = (y * 768 + x) * 4 + 3;
      maskLo = Math.min(maskLo, mask[i]); maskHi = Math.max(maskHi, mask[i]);
      for (const d of [4, 768 * 4]) {
        const jump = Math.abs(smokePixels[i] - smokePixels[i + d]);
        maxJump = Math.max(maxJump, jump); if (jump > 8) jumps++;
      }
    }
    // Compare the same world points across sub-cell and whole-cell pans,
    // including a negative origin and a mask allocation resize.
    let panDiff = 0, panMax = 0, n = 0;
    for (const shift of [2, 6, -2]) {
      const pan = m.paint(particles, shift);
      for (let y = 120; y < 456; y++) for (let x = 120; x < 630; x++) {
        const diff = Math.abs(mask[(y * 768 + x + shift * 3) * 4 + 3] - pan[(y * 768 + x) * 4 + 3]);
        panDiff += diff; panMax = Math.max(panMax, diff); n++;
      }
    }
    function interiorRange(p, bath) {
      const data = m.paint(p, 0, bath); let lo = 255, hi = 0;
      for (let y = 120; y < 456; y++) for (let x = 120; x < 648; x++) {
        const a = data[(y * 768 + x) * 4 + 3]; lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
      return {lo,hi};
    }
    const pool = interiorRange(dense), spray = interiorRange(sparse);
    const fall = interiorRange(dense.map(p => [p[0],p[1],120]));
    const frozen = interiorRange(dense.map(p => [p[0],p[1],0,1]));
    const bath = interiorRange(dense, true), empty = interiorRange([]);
    // Crossing the falling-water speed gate should not switch a whole bin.
    const before = m.paint(dense.map(p => [p[0],p[1],54.9]));
    const after = m.paint(dense.map(p => [p[0],p[1],55.1]));
    let speedJump = 0;
    for (let i = 3; i < before.length; i += 4) speedJump = Math.max(speedJump, Math.abs(before[i] - after[i]));
    // Heavily compressed water must not overflow its density counter and
    // turn into a falling plume just because velocity sums exceed 255 entries.
    const compressed = [];
    for (let y = 80; y < 112; y += .2) for (let x = 96; x < 160; x += .2) compressed.push([x,y,20]);
    const compact = m.paint(compressed);
    const compactCenter = compact[(96 * 3 * 768 + 128 * 3) * 4 + 3];
    m.paint(dense); const t = performance.now();
    for (let i = 0; i < 30; i++) m.repaint();
    const repaintMs = (performance.now() - t) / 30;
    // Leave the reported fixture on screen for visual A/B inspection.
    m.paint(particles); sampleSmoke();
    results[name] = {jumps,maxJump,maskLo,maskHi,panMean:panDiff/n,panMax,pool,spray,fall,frozen,bath,empty,speedJump,compactCenter,repaintMs};
  }
  return results;
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME});
  try {
    const page = await browser.newPage({viewport:{width:800,height:1240}});
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const result = await page.evaluate(checkMasks, {original,current});
    console.log(JSON.stringify(result, null, 2));
    if (process.env.DUMP) {
      const dump = path.resolve(process.env.DUMP);
      assert(dump !== root && !dump.startsWith(root + path.sep), 'Screenshots stay outside the repository');
      await page.screenshot({path:dump});
    }
    assert(result.baseline.jumps > 100, 'Reproduce visible smoke-mask squares');
    assert.equal(result.current.jumps, 0, 'No sharp smoke cutouts inside continuous water');
    assert(result.current.panMax <= 2, 'Mask stays anchored when camera moves');
    assert(result.current.speedJump <= 2, 'Falling threshold changes continuously');
    assert.equal(result.current.pool.lo, 255, 'Dense pools remain smoke obstacles');
    assert(result.current.spray.hi < 128 && result.current.fall.hi < 128, 'Spray and falling water remain passable');
    for (const key of ['empty','bath','frozen']) assert.equal(result.current[key].hi, 0, key + ' leaves no water obstacle');
    assert.equal(result.current.compactCenter, 255, 'Compressed slow water remains solid to smoke');
    assert.deepEqual(errors, []);
    console.log('PASS: smoke cutouts, camera motion, speed transition, pool, spray, fall, compression and exclusions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
