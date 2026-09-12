// Real WebGPU compression/release regression. Test hooks are served locally only.
// PLAYWRIGHT_MODULE and CHROME override local runtime paths. BASE_REF selects A/B.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const baseRef = process.env.BASE_REF || 'd7cab43';
const previous = cp.execFileSync('git', ['show', baseRef + ':js/liquid-wgpu.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 });
const current = fs.readFileSync(path.join(root, 'js/liquid-wgpu.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'js/sluice.js'), 'utf8');
const contourProbe = fs.readFileSync(path.join(root, 'tools/sluice-water-contour-smoke.cjs'), 'utf8').match(/const probe = `([\s\S]*?)`;/)[1];
const probe = contourProbe + `
window.__compression = {
  seed: function (n, width, spacing, density) {
    var row = SKY_ROWS + 12, col = 80;
    var cx = (col + 5) * TILE, cy = (row + 4) * TILE;
    for (var r = row - 8; r < row + 18; r++) for (var c = col - 8; c < col + 22; c++) world[r][c] = null;
    terrainChunkCache = {}; terrainChunkCount = 0; terrainWarmupFrames = 10;
    surfacePonds = []; jelloBodies = [];
    liquidCount = 0; liquidOps.length = 0; liquidOpsOverflow = true; liquidMutationSeq++;
    for (var i = 0; i < n; i++) {
      var x, y;
      if (spacing) { x = (i % width - width / 2) * spacing; y = (Math.floor(i / width) - Math.floor(n / width) / 2) * spacing; }
      else {
        var a = ((Math.imul(i + 1, 1664525) + 1013904223) >>> 0) / 4294967296;
        var b = ((Math.imul(i + 11, 22695477) + 1) >>> 0) / 4294967296;
        x = (a - 0.5) * width; y = (b - 0.5) * width;
      }
      addLiquidParticle('water', cx + x, cy + y, 0, 0, 0);
      liquidDensity[i] = density || 24; liquidFrozen[i] = 0; liquidSleeping[i] = 0;
    }
    cam.x = cx - 150; cam.y = cy - 130;
    player.x = cx + 250; player.y = cy - 150;
    worldScale = 2.4; screenW = viewW / worldScale; screenH = viewH / worldScale;
    liquidWGPU.uploadParticles();
    this.cx = cx; this.cy = cy;
    return { count: liquidCount, width: width };
  },
  stats: async function () {
    var inst = liquidWGPU, dev = inst.device, size = inst.uploadedCount * 16;
    var buf = dev.createBuffer({ size: size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    var enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(inst.buf.pos, 0, buf, 0, size);
    dev.queue.submit([enc.finish()]); await buf.mapAsync(GPUMapMode.READ);
    var a = new Float32Array(buf.getMappedRange()); var maxSpeed = 0, energy = 0, radius = 0, nonfinite = 0;
    var stacks = new Map(), largestStack = 0, sumX = 0, sumY = 0, inSolid = 0;
    for (var i = 0; i < a.length; i += 4) {
      if (!isFinite(a[i] + a[i + 1] + a[i + 2] + a[i + 3])) nonfinite++;
      var speed2 = a[i + 2] * a[i + 2] + a[i + 3] * a[i + 3];
      maxSpeed = Math.max(maxSpeed, Math.sqrt(speed2)); energy += speed2;
      radius += (a[i] - this.cx) * (a[i] - this.cx) + (a[i + 1] - this.cy) * (a[i + 1] - this.cy);
      sumX += a[i] - this.cx; sumY += a[i + 1] - this.cy;
      if (liquidWorldSolidAt(a[i], a[i + 1])) inSolid++;
      var key = a[i] + ':' + a[i + 1], stack = (stacks.get(key) || 0) + 1;
      stacks.set(key, stack); largestStack = Math.max(largestStack, stack);
    }
    var n = a.length / 4;
    var result = { count: n, nonfinite: nonfinite, inSolid: inSolid, maxSpeed: maxSpeed, rmsSpeed: Math.sqrt(energy / n), rmsRadius: Math.sqrt(radius / n), spread: Math.sqrt(Math.max(0, radius / n - (sumX * sumX + sumY * sumY) / (n * n))), largestStack: largestStack };
    buf.unmap(); buf.destroy(); return result;
  },
  pocket: function (jets) {
    this.seed(6000, 48);
    var cx = this.cx, cy = this.cy;
    // Open-topped, two-tile cup with the real two-nozzle downward plume.
    for (var r = cy / TILE - 3; r <= cy / TILE + 1; r++) for (var c = cx / TILE - 2; c <= cx / TILE + 1; c++) {
      if (r === cy / TILE + 1 || c === cx / TILE - 2 || c === cx / TILE + 1) world[r][c] = { type: 'dirt', hp: ORES.dirt.hp };
    }
    liquidWGPU.liquid.getGameState = function () { return {
      rocket: { active: !!jets, intensity: jets ? 1 : 0, exDirX: 0, exDirY: 1, nozzles: [{x:cx - 8,y:cy - 42},{x:cx + 8,y:cy - 42}] },
      explosions: [], guests: null, player: null
    }; };
  },
  sheet: async function (isolated, dense, spray) {
    var spacing = dense ? 1.25 : 1.8;
    this.seed(isolated ? 1 : 4096, isolated ? 1 : 64, spacing, isolated || dense ? 4 : 4 * 1.25 * 1.25 / (spacing * spacing));
    if (spray) {
      this.seed(600, 110);
      for (var i = 0; i < liquidCount; i++) {
        liquidDensity[i] = 2;
        liquidVX[i] = Math.sin(i * 1.37) * 100; liquidVY[i] = -150 - (i % 7) * 8;
      }
    }
    liquidWGPU.buildGrid();
    // The live G2P pass records the pre-step position used by the render
    // neighbour lookup. This static sheet has not moved or run G2P yet.
    var aux = liquidWGPU.staging.aux;
    for (var i = 0; i < liquidCount; i++) { aux[i * 4 + 2] = liquidX[i]; aux[i * 4 + 3] = liquidY[i]; }
    liquidWGPU.queue.writeBuffer(liquidWGPU.buf.aux, 0, aux, 0, liquidCount * 4);
    liquidWGPU.draw();
    var dev = liquidWGPU.device, w = canvas.width, h = canvas.height;
    var stride = Math.ceil(w * 4 / 256) * 256;
    var buf = dev.createBuffer({ size: stride * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    var enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: liquidWGPU.renderCtx.getCurrentTexture() }, { buffer: buf, bytesPerRow: stride }, [w, h]);
    dev.queue.submit([enc.finish()]); await buf.mapAsync(GPUMapMode.READ);
    var a = new Uint8Array(buf.getMappedRange()); var holes = 0, pixels = 0, minAlpha = 255, wetPixels = 0, pixelHash = 2166136261;
    var extent = dense ? 30 : 40;
    for (var y = -extent; y < extent; y += 0.25) for (var x = -extent; x < extent; x += 0.25) {
      var sx = Math.floor((this.cx + x - cam.x) * dpr * worldScale), sy = Math.floor((this.cy + y - cam.y) * dpr * worldScale);
      var alpha = a[sy * stride + sx * 4 + 3]; minAlpha = Math.min(minAlpha, alpha); pixels++;
      for (var channel = 0; channel < 4; channel++) pixelHash = Math.imul(pixelHash ^ a[sy * stride + sx * 4 + channel], 16777619) >>> 0;
      if (alpha > 0) wetPixels++;
      if (alpha < liquidWGPU.renderParamsHost[11] * 255 * 0.95) holes++;
    }
    buf.unmap(); buf.destroy(); return { holes: holes, pixels: pixels, minAlpha: minAlpha, wetPixels: wetPixels, pixelHash: pixelHash };
  }
};
`;

async function run(page, url, label) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '/grand-motherload.html?dev=1&nosave=1&nopause=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__compression && window.SluiceLoading && !SluiceLoading.active() && window.LiquidWGPU && LiquidWGPU.last && LiquidWGPU.last.renderActive, null, { timeout: 60000 });
  await page.evaluate(() => __waterContourTest.stop());
  console.log(label + ' booted');
  const result = await page.evaluate(async () => {
    const inst = LiquidWGPU.last, dev = inst.device;
    const profile = async (frames, width, ordinary) => {
      const timed = dev.features.has('timestamp-query');
      const qs = timed && dev.createQuerySet({ type: 'timestamp', count: 4096 });
      const labels = [], original = dev.createCommandEncoder.bind(dev);
      let frame = 0;
      if (timed) dev.createCommandEncoder = descriptor => {
        const enc = original(descriptor);
        for (const method of ['beginComputePass', 'beginRenderPass']) {
          const begin = enc[method].bind(enc);
          enc[method] = desc => {
            const index = labels.length * 2; labels.push({ name: desc.label || method, frame });
            if (index >= 4096) throw Error('Timestamp capacity');
            return begin({ ...desc, timestampWrites: { querySet: qs, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 } });
          };
        }
        return enc;
      };
      const t0 = performance.now();
      for (frame = 0; frame < frames; frame++) {
        if (ordinary) __compression.seed(4096, 64, 1.25, 4);
        else __compression.seed(18000, width);
        inst.update(1 / 60); inst.draw();
        await dev.queue.onSubmittedWorkDone();
      }
      const elapsed = (performance.now() - t0) / frames;
      dev.createCommandEncoder = original;
      const stages = {};
      if (timed) {
        const size = labels.length * 16;
        const resolve = dev.createBuffer({ size, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        const read = dev.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const enc = original(); enc.resolveQuerySet(qs, 0, labels.length * 2, resolve, 0); enc.copyBufferToBuffer(resolve, 0, read, 0, size);
        dev.queue.submit([enc.finish()]); await read.mapAsync(GPUMapMode.READ);
        const times = new BigUint64Array(read.getMappedRange());
        const byFrame = Array.from({ length: frames }, () => ({}));
        for (let i = 0; i < labels.length; i++) {
          const { name, frame } = labels[i], ms = Number(times[i * 2 + 1] - times[i * 2]) / 1e6;
          byFrame[frame][name] = (byFrame[frame][name] || 0) + ms;
          byFrame[frame].total = (byFrame[frame].total || 0) + ms;
        }
        for (const name of Object.keys(byFrame[0])) stages[name] = byFrame.map(f => f[name] || 0).sort((a, b) => a - b)[Math.floor(frames / 2)];
        read.unmap(); read.destroy(); resolve.destroy(); qs.destroy();
      }
      return { elapsed, stages };
    };
    for (let warm = 0; warm < 12; warm++) {
      __compression.seed(18000, 24);
      inst.update(1 / 60); inst.draw(); await dev.queue.onSubmittedWorkDone();
    }
    const compressed = await profile(12, 24);
    const extreme = await profile(12, 8);
    const ordinary = await profile(12, 0, true);
    const ordinaryState = await __compression.stats();
    __compression.seed(18000, 24);
    const initial = await __compression.stats();
    const release = [];
    for (let f = 0; f < 90; f++) {
      inst.update(1 / 60);
      await dev.queue.onSubmittedWorkDone();
      if ([5, 29, 89].includes(f)) release.push(await __compression.stats());
    }
    __compression.seed(1024, 0);
    for (let f = 0; f < 60; f++) { inst.update(1 / 60); await dev.queue.onSubmittedWorkDone(); }
    const coincident = await __compression.stats();
    __compression.pocket(true);
    for (let f = 0; f < 1200; f++) {
      inst.update(1 / 60);
      if (f % 15 === 14) await dev.queue.onSubmittedWorkDone();
    }
    const held = await __compression.stats();
    inst.liquid.getGameState = () => ({ rocket: { active: false }, player: null, guests: null, explosions: [] });
    const longRelease = [];
    for (let f = 0; f < 600; f++) {
      inst.update(1 / 60);
      if (f % 15 === 14) await dev.queue.onSubmittedWorkDone();
      if ([29, 119, 599].includes(f)) longRelease.push(await __compression.stats());
    }
    const bead = await __compression.sheet(true);
    const body = await __compression.sheet(false, true);
    const spray = await __compression.sheet(false, false, true);
    const sheet = await __compression.sheet();
    return { adapter: inst.adapter.info.description, compressed, extreme, ordinary, ordinaryState, initial, release, coincident, held, longRelease, bead, body, spray, sheet };
  });
  assert.deepEqual(errors, []);
  assert(result.release.every(s => s.nonfinite === 0 && s.count === result.initial.count), 'Release conserves particles and stays finite');
  console.log(label, JSON.stringify(result));
  if (process.env.DUMP) {
    const dump = path.resolve(process.env.DUMP);
    assert(dump !== root && !dump.startsWith(root + path.sep)); fs.mkdirSync(dump, { recursive: true });
    await page.evaluate(() => __waterContourTest.draw());
    await page.screenshot({ path: path.join(dump, label + '-sheet.png') });
  }
  return result;
}

async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/js/sluice.js') {
      const end = bundle.lastIndexOf('})();');
      res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.slice(0, end) + probe + bundle.slice(end)); return;
    }
    if (pathname === '/js/liquid-wgpu.js') {
      let source = req.headers['x-water-source'] === 'baseline' ? previous : current;
      source = source.replace('adapter.requestDevice({ requiredLimits: requiredLimits })', "adapter.requestDevice({ requiredLimits: requiredLimits, requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] })");
      res.setHeader('Content-Type', 'text/javascript'); res.end(source); return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    const stream = fs.createReadStream(file); stream.on('error', () => res.writeHead(404).end()); stream.pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling'] });
    const results = {};
    for (const label of ['baseline', 'current']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 }, extraHTTPHeaders: { 'x-water-source': label } });
      results[label] = await run(page, 'http://127.0.0.1:' + server.address().port, label); await page.close();
    }
    // The owner rejected merging loose water into a solid sheet. Dense
    // bodies stay continuous; sparse groups retain the prior particle art.
    assert.equal(results.current.body.holes, 0, 'Dense water has no interior grid gaps');
    for (const kind of ['sheet', 'spray', 'bead']) assert.equal(results.current[kind].pixelHash, results.baseline[kind].pixelHash, kind + ' retains the pre-regression particle rendering');
    assert(results.baseline.bead.wetPixels > 0, 'Isolated droplets remain visible');
    assert.equal(results.current.bead.wetPixels, results.baseline.bead.wetPixels, 'Isolated droplets retain their compact footprint');
    assert.equal(results.baseline.coincident.largestStack, 1024, 'Baseline reproduces permanently coincident particles');
    assert.equal(results.current.coincident.largestStack, 1, 'Coincident stacks separate into individual water particles');
    assert(results.current.longRelease.every(s => s.count === 6000 && s.nonfinite === 0 && s.inSolid === 0), 'Long-held water is conserved, finite and outside terrain');
    assert(results.current.longRelease.at(-1).largestStack <= 2, 'Long-held water recovers without persistent stacks');
    for (const key of ['rmsSpeed', 'spread']) assert(Math.abs(results.current.ordinaryState[key] / results.baseline.ordinaryState[key] - 1) < 0.01, 'Ordinary water retains ' + key);
    const a = results.baseline.release[0], b = results.current.release[0];
    for (const key of ['maxSpeed', 'rmsSpeed', 'rmsRadius']) assert(Math.abs(b[key] / a[key] - 1) < 0.15, 'Initial pressure burst retains ' + key);
    assert(results.current.release[2].rmsRadius > results.current.initial.rmsRadius * 10, 'Compressed water still expands freely on release');
    if (results.baseline.extreme.stages['liquid.declump']) assert(results.current.extreme.stages['liquid.declump'] < results.baseline.extreme.stages['liquid.declump'] * 0.65, 'Extreme compression cuts anti-clump GPU time');
    if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(results, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
