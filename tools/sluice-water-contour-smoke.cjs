// Run with PLAYWRIGHT_MODULE and CHROME set if they are not on the default paths.
// DUMP may point outside the repository for screenshots. Test hooks are served
// only by this local harness, never included in the shipped game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const probe = `
window.__waterContourTest = {
  stop: function () {
    if (gameRafId) cancelAnimationFrame(gameRafId); gameRafId = 0;
    gamePaused = false; introPhase = 'done'; devMode = false;
    lightTune.enabled = 0;
    document.body.classList.add('gm-fs');
    document.body.appendChild(document.querySelector('.game-wrapper'));
    var css = document.createElement('style');
    css.textContent = '#game-intro,#game-pause,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}';
    document.head.appendChild(css); resize();
    if (liquidWGPU && liquidWGPU.renderActive) liquidWGPU.renderCtx.configure({
      device: liquidWGPU.device, format: liquidWGPU.renderFormat, alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });
    return { gpu: !!(liquidWGPU && liquidWGPU.renderActive), version: GAME_VERSION };
  },
  scene: function (surface, contact) {
    var opts = contact && typeof contact === 'object' ? contact : {};
    var row = surface ? SKY_ROWS : SKY_ROWS + 12, col = 80;
    this.row = row; this.col = col;
    for (var r = Math.max(0, row - 8); r <= row + 15; r++) for (var c = col - 12; c <= col + 24; c++) {
      var open = r >= row && r < row + 8 && c >= col && c < col + 12;
      // A projecting shelf and two stepped basin walls reproduce the report.
      if (r >= row + 2 && r < row + 4 && c < col + 5) open = false;
      if (r >= row + 6 && c >= col + 9) open = false;
      if (opts.cross) open = r >= row && r < row + 3 && c >= col && c < col + 3 && (r === row + 1 || c === col + 1);
      world[r][c] = open || r < SKY_ROWS ? null : { type: 'dirt', hp: ORES.dirt.hp };
    }
    // Sealed dry pocket, one tile away from the water.
    world[row + 4][col + 13] = null;
    terrainChunkCache = {}; terrainChunkCount = 0; terrainWarmupFrames = 10;
    surfacePonds = []; jelloBodies = [];
    liquidCount = 0; liquidOps.length = 0; liquidOpsOverflow = true; liquidMutationSeq++;
    for (var y = row * TILE + (opts.topGap || 8); y < (row + 8) * TILE; y += 1.2) {
      for (var x = col * TILE; x < (col + 12) * TILE; x += 1.2) {
        var gap = opts.gap === undefined ? (contact ? 2.2 : 0) : opts.gap;
        if (!liquidWorldSolidAt(x, y) && !liquidWorldSolidAt(x - gap, y) &&
            !liquidWorldSolidAt(x + gap, y) && !liquidWorldSolidAt(x, y - gap) &&
            !liquidWorldSolidAt(x, y + gap)) addLiquidParticle('water', x, y, 0, 0, 0);
      }
    }
    for (var i = 0; i < liquidCount; i++) {
      liquidDensity[i] = LIQUID_DENSITY; liquidFrozen[i] = 0;
    }
    cam.x = (col - 1) * TILE; cam.y = (row - 1) * TILE;
    if (opts.zoom) { worldScale = opts.zoom; screenW = viewW / worldScale; screenH = viewH / worldScale; }
    player.x = (col + 8) * TILE; player.y = row * TILE + 18;
    if (liquidWGPU && liquidWGPU.renderActive) {
      liquidWGPU.uploadParticles(); liquidWGPU.update(0);
    }
    return { count: liquidCount, row: row, col: col, scale: worldScale, dpr: dpr };
  },
  draw: function () { render(); },
  settle: async function () {
    for (var frame = 0; frame < 120; frame++) {
      liquidWGPU.update(1 / 60);
      if (frame % 15 === 14) await liquidWGPU.device.queue.onSubmittedWorkDone();
    }
  },
  mode: function (mode) {
    liquidWGPU.liquid.getTerrainRenderMask = mode === 'square' ? null : liquidTerrainRenderMask;
    liquidWGPU.setRenderParam('SURFACE_RENDER', mode === 'legacy' ? 0 : 1);
  },
  pixels: async function () {
    var gpu = liquidWGPU && liquidWGPU.renderActive;
    var w = canvas.width, h = canvas.height, bytes, stride = w * 4;
    if (gpu) {
      liquidWGPU.draw();
      var device = liquidWGPU.device;
      stride = Math.ceil(w * 4 / 256) * 256;
      var buffer = device.createBuffer({ size: stride * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      var enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: liquidWGPU.renderCtx.getCurrentTexture() }, { buffer: buffer, bytesPerRow: stride }, [w, h]);
      device.queue.submit([enc.finish()]); await buffer.mapAsync(GPUMapMode.READ);
      bytes = new Uint8Array(buffer.getMappedRange()).slice(); buffer.unmap(); buffer.destroy();
    } else {
      drawLiquidsWebGL(cam.x - 24, cam.x + screenW + 24, cam.y - 24, cam.y + screenH + 24);
      bytes = new Uint8Array(w * h * 4); liquidGL.readPixels(0, 0, w, h, liquidGL.RGBA, liquidGL.UNSIGNED_BYTE, bytes);
    }
    function alpha(x, y) {
      var sx = Math.floor((x - cam.x) * dpr * worldScale), sy = Math.floor((y - cam.y) * dpr * worldScale);
      if (!gpu) sy = h - sy - 1;
      return sx >= 0 && sx < w && sy >= 0 && sy < h ? bytes[sy * stride + sx * 4 + 3] : -1;
    }
    var m = liquidTerrainRenderMask();
    var maskBytes = m.ctx.getImageData(0, 0, m.canvas.width, m.canvas.height).data;
    function maskAlpha(x, y) { return maskBytes[(y * m.canvas.width + x) * 4]; }
    var blocked = 0, leaking = 0, cutaway = 0, wetCutaway = 0, wet = 0;
    // Probe the actual rasterized cave edge, including both kinds of corner.
    for (var y = (this.row + 1) * TILE; y < (this.row + 8) * TILE; y += 0.5) {
      for (var x = this.col * TILE; x < (this.col + 12) * TILE; x += 0.5) {
        var a = alpha(x, y); if (a < 0) continue;
        var mx = Math.floor(x - m.x), my = Math.floor(y - m.y);
        var solid = maskAlpha(mx, my);
        // Exclude the one-pixel antialias band and fractional screen sample
        // rounding. A fully opaque 3x3 neighbourhood must stay dry.
        if (solid === 255 && liquidWorldSolidAt(x, y) === false) {
          var opaque = true;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            if (maskAlpha(mx + dx, my + dy) !== 255) opaque = false;
          }
          if (opaque) { blocked++; if (a > 8) leaking++; }
        }
        if (solid === 0 && liquidWorldSolidAt(x, y)) { cutaway++; if (a > 100) wetCutaway++; }
        if (a > 100) wet++;
      }
    }
    var contacts = 0, contactGaps = 0, gapSamples = [];
    function maskAt(wx, wy) {
      var x = wx - m.x - 0.5, y = wy - m.y - 0.5;
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      return (maskAlpha(ix, iy) * (1 - fx) + maskAlpha(ix + 1, iy) * fx) * (1 - fy) +
        (maskAlpha(ix, iy + 1) * (1 - fx) + maskAlpha(ix + 1, iy + 1) * fx) * fy;
    }
    var scale = dpr * worldScale;
    var expectedAlpha = gpu ? liquidWGPU.renderParamsHost[11] * 255 : LIQUID_WATER_ALPHA * 255;
    for (var sy = 0; sy < h; sy++) for (var sx = 0; sx < w; sx++) {
      var wx = cam.x + (sx + 0.5) / scale, wy = cam.y + (sy + 0.5) / scale;
      if (wx < this.col * TILE - 4 || wx > (this.col + 12) * TILE + 4 ||
          wy < (this.row + 1) * TILE || wy > (this.row + 8) * TILE + 4 || maskAt(wx, wy) > 0.1) continue;
      if (Math.max(maskAt(wx - 5, wy), maskAt(wx + 5, wy), maskAt(wx, wy - 5), maskAt(wx, wy + 5)) < 128) continue;
      contacts++;
      var offset = (gpu ? sy : h - sy - 1) * stride + sx * 4 + 3;
      if (bytes[offset] < expectedAlpha * 0.98) {
        contactGaps++;
        if (gapSamples.length < 8) gapSamples.push({ x: wx - this.col * TILE, y: wy - this.row * TILE, alpha: bytes[offset], expected: expectedAlpha });
      }
    }
    var ceilingAir = 0;
    for (var ay = 2; ay < 10; ay++) for (var ax = 2 * TILE; ax < 10 * TILE; ax++) {
      if (alpha(this.col * TILE + ax, this.row * TILE + ay) > 0) ceilingAir++;
    }
    return { gapSamples: gapSamples, ceilingAir: ceilingAir, contacts: contacts, contactGaps: contactGaps, blocked: blocked, leaking: leaking, cutaway: cutaway, wetCutaway: wetCutaway, wet: wet,
      dry: alpha((this.col + 13.5) * TILE, (this.row + 4.5) * TILE), revision: m.revision };
  },
  cache: function () {
    var first = liquidTerrainRenderMask().revision;
    cam.x += 0.25; cam.y += 0.25;
    var pan = liquidTerrainRenderMask().revision;
    var r = this.row + 3, c = this.col + 4;
    world[r][c] = null; invalidateTerrainAround(r, c);
    var dig = liquidTerrainRenderMask().revision;
    world[r][c] = { type: 'dirt', hp: 1 };
    var restore = liquidTerrainRenderMask().revision;
    return { first: first, pan: pan, dig: dig, restore: restore };
  }
};
`;

async function main() {
  const bundle = process.env.SOURCE ? fs.readdirSync(path.join(root, 'js/sluice')).filter(n => /^\d{3}-.*\.js$/.test(n)).sort()
    .map(n => fs.readFileSync(path.join(root, 'js/sluice', n), 'utf8')).join('') : fs.readFileSync(path.join(root, 'js/sluice.js'), 'utf8');
  const end = bundle.lastIndexOf('})();'); assert(end > 0);
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/js/sluice.js') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.slice(0, end) + probe + bundle.slice(end)); return;
    }
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.m4a':'audio/mp4'})[path.extname(file)] || 'application/octet-stream');
    const stream = fs.createReadStream(file); stream.on('error', () => res.writeHead(404).end()); stream.pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined,
      args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling'] });
    for (const cpu of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const url = 'http://127.0.0.1:' + server.address().port;
      await page.goto(url + '/grand-motherload.html?dev=1&nosave=1&nopause=1' + (cpu ? '&cpuwater=1' : ''), { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__waterContourTest && window.gm && window.SluiceLoading && !window.SluiceLoading.active(), { timeout: 60000 });
      if (!cpu) await page.waitForFunction(() => window.LiquidWGPU && LiquidWGPU.last && LiquidWGPU.last.renderActive, { timeout: 60000 });
      const call = (fn, ...args) => page.evaluate(({ fn, args }) => window.__waterContourTest[fn](...args), { fn, args });
      console.log('Boot', await call('stop'));
      console.log('Scene', await call('scene'));
      await call('draw');
      const pixels = await call('pixels'); console.log(cpu ? 'CPU' : 'GPU', pixels);
      if (process.env.DUMP) {
        const dump = path.resolve(process.env.DUMP);
        assert(dump !== root && !dump.startsWith(root + path.sep)); fs.mkdirSync(dump, { recursive: true });
        await call('draw'); await page.screenshot({ path: path.join(dump, cpu ? 'water-cpu.png' : 'water-gpu.png') });
      }
      assert(pixels.wet > 1000, 'The basin still renders water');
      assert(pixels.blocked > 20, 'Fixture covers curved lips inside empty collision tiles');
      assert(pixels.leaking < pixels.blocked * 0.02, 'Water cannot paint square corners over the visible cave lip');
      if (!cpu) assert(pixels.wetCutaway > pixels.cutaway * 0.8, 'Water reaches rounded cutaways beyond collision tiles');
      if (pixels.dry >= 0) assert.equal(pixels.dry, 0, 'A sealed empty pocket stays dry');
      const cache = await call('cache'); console.log('Cache', cache);
      assert.equal(cache.pan, cache.first, 'Sub-tile camera movement reuses the bitmap');
      assert(cache.dig > cache.pan && cache.restore > cache.dig, 'Digging and restored terrain refresh the boundary immediately');
      if (!cpu) {
        await call('mode', 'legacy');
        const legacy = await call('pixels');
        assert(legacy.wet > 1000 && legacy.leaking === 0, 'Legacy GPU discs also respect the visible wall');
        await call('mode', 'square');
        const square = await call('pixels');
        assert(square.leaking > 20, 'The same fixture reproduces the old square-tile artifact');
        if (process.env.DUMP) {
          await call('draw'); await page.screenshot({ path: path.join(process.env.DUMP, 'water-before.png') });
        }
        await call('mode', 'surface');
        await call('scene', false, true); await call('draw');
        const contact = await call('pixels'); console.log('Separated contact row', contact);
        if (process.env.DUMP) {
          await call('draw'); await page.screenshot({ path: path.join(process.env.DUMP, 'water-contact.png') });
        }
        if (!process.env.CONTACT_BASELINE) assert.equal(contact.contactGaps, 0, 'A full basin reaches every wall without dark contact seams');
        await call('scene', false, { gap: 2.2, topGap: 18 });
        const air = await call('pixels');
        assert.equal(air.ceilingAir, 0, 'Contact wetting leaves a real air gap below the ceiling empty');
        await call('scene', false, { cross: true, gap: 2.2, zoom: 2.4 });
        const cross = await call('pixels'); console.log('Cross pocket', cross);
        if (!process.env.CONTACT_BASELINE) assert.equal(cross.contactGaps, 0, 'The narrow cross-shaped pocket has continuous wall contact');
        await call('settle');
        const settled = await call('pixels'); console.log('Settled cross pocket', settled);
        if (!process.env.CONTACT_BASELINE) assert.equal(settled.contactGaps, 0, 'Real collision and settling keep the pocket in contact');
        if (process.env.DUMP) {
          await call('draw'); await page.screenshot({ path: path.join(process.env.DUMP, 'water-cross.png') });
        }
      }
      await page.setViewportSize({ width: 700, height: 600 });
      await call('scene', true); await call('draw');
      const surface = await call('pixels');
      assert(surface.wet > 1000 && surface.leaking === 0, 'Resized surface pond retains its curved boundary');
      assert.deepEqual(errors, [], 'No browser or GPU validation errors');
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Water contour, corner contact, dry pocket, cache and renderer checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
