// NODE_PATH=/path/to/node_modules node tools/test-arrow-of-time-browser.cjs
// The harness owns this HTTP server and the exact Chrome for Testing child process.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..'), out = process.env.ARROW_CHECK_OUTPUT || path.join(os.tmpdir(), 'arrow-of-time-checks');
fs.mkdirSync(out, { recursive: true });
const errors = [], results = { numerical: [], performance: [], screenshots: [], browser: [] }; let browser;
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try { const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }; res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); } catch { res.writeHead(404).end(); }
});
async function open(context, query = '') {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/arrow-of-time-lab.html${query}`); await page.waitForFunction(() => document.querySelector('#aot-piece').getAttribute('aria-busy') === 'false'); return page;
}
async function fit(page) {
  const box = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('.aot-toolbar button')].map(b => { const r = b.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right }; }) }));
  assert.ok(box.scroll <= box.width + 1, 'horizontal overflow'); for (const b of box.buttons) { assert.ok(b.width >= 44 && b.height >= 44); assert.ok(b.right <= box.width + 1); }
}
async function snapshot(page) { return page.evaluate(() => ArrowOfTime.snapshot()); }
async function screenshot(page, name) { const file = path.join(out, name + '.png'); await page.screenshot({ path: file }); results.screenshots.push(file); }
async function numerical(page) {
  return page.evaluate(async () => {
    const M = await import('/js/arrow-of-time-model.js'), G = await import('/js/arrow-of-time-gpu.js');
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
    const validation = []; device.addEventListener('uncapturederror', e => validation.push(e.error.message)); const records = [], perf = [];
    try {
      for (const [w, h] of [[2, 2], [30, 6], [32, 8], [34, 10], [66, 4], [256, 256], [512, 512]]) {
        const authored = M.prepare(w, h); if (w < 100) { for (let i = 0; i < authored.y.length; i++) if ((i * i + 3 * i) % 7 < 3) authored.y[i] *= -1; }
        const gpu = await G.createQ2RGPU(device, authored); let cpu = authored;
        try {
          for (let k = 1; k <= 24; k++) { gpu.update(1); cpu = M.evolve(cpu); const r = await gpu.readback(); if (!M.compare(r, cpu).exact) throw Error(`CPU/GPU mismatch ${w}x${h}, step ${k}`); if (r.integerReduction.energyTwiceJ !== M.energyTwice(cpu)) throw Error('Integer energy mismatch'); if (M.energyTwice(cpu) !== M.energyTwice(authored)) throw Error('Energy drift'); if (M.checksum(r.packedX,r.packedY)!==M.checksum(M.pack(cpu.x,w,h),M.pack(cpu.y,w,h))) throw Error('Packed checksum mismatch'); for (const key of ['x','y']) { const expected=M.pack(cpu[key],w,h), actual=key==='x'?r.packedX:r.packedY; for(let i=0;i<expected.length;i++) if(expected[i]!==actual[i]) throw Error('Full packed word mismatch'); } }
          gpu.update(24, -1); const r = await gpu.readback(); if (!M.compare(r, authored).exact) throw Error('Inverse GPU return mismatch');
          if (w >= 256) { gpu.update(4320); gpu.update(4320, -1); const long = await gpu.readback(); if (!M.compare(long, authored).exact) throw Error('Long inverse return failed'); records.push({ size: `${w}x${h}`, longForward: 4320, longInverse: 4320, comparedSpins: w * h * 2, exact: true, checksum: long.checksum }); }
          records.push({ size: `${w}x${h}`, cpuGpuStepsCompared: 24, inverseSteps: 24, energyDriftTwiceJ: 0, tolerance: 0 });
          if (w >= 256) {
            const target = device.createTexture({ size: [1440, 600], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT }), view = target.createView();
            const timestamp = device.features.has('timestamp-query'), query = timestamp ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
            const resolve = timestamp ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
            const read = timestamp ? device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
            for (const mode of ['compute', 'render']) {
              const timings = [], wall = []; for (let i = 0; i < 32; i++) {
                const start = performance.now(), e = device.createCommandEncoder(), writes = query ? { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
                if (mode === 'compute') gpu.encodeSteps(e, 24, 1, writes);
                else gpu.render({ encoder: e, targetView: view, width: 1440, height: 600, exposure: 1, timestampWrites: writes });
                if (query) { e.resolveQuerySet(query, 0, 2, resolve, 0); e.copyBufferToBuffer(resolve, 0, read, 0, 16); }
                device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); wall.push(performance.now() - start);
                if (query) { await read.mapAsync(GPUMapMode.READ); const t = new BigUint64Array(read.getMappedRange()); timings.push(Number(t[1] - t[0]) / 1e6 / (mode === 'compute' ? 24 : 1)); read.unmap(); }
              }
              const summary = a => { a = a.slice(4).sort((a, b) => a - b); return { median: a[Math.floor(a.length / 2)], p95: a[Math.ceil(a.length * .95) - 1] }; };
              perf.push({ size: `${w}x${h}`, mode, precision: 'u32 packed spins / u32 block sums / rgba16float scene', updateRate: 24, gpuMilliseconds: timestamp ? summary(timings) : null, submitAndCompletionMilliseconds: summary(wall), gpuScope: mode === 'render' ? 'fragment render pass only, hierarchy is included in wall time' : 'per microscopic step, batch of 24', adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, device: adapter.info.device, isFallbackAdapter: adapter.info.isFallbackAdapter } });
            }
            target.destroy(); query?.destroy(); resolve?.destroy(); read?.destroy();
          }
        } finally { gpu.dispose(); }
      }
      if (validation.length) throw Error(validation.join('\n')); return { records, perf };
    } finally { device.destroy(); }
  });
}
(async () => {
 try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), args: ['--enable-unsafe-webgpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }), page = await open(context);
  const problem = await page.locator('#aot-error').textContent(); assert.equal(problem, '', 'Initialization error: ' + problem); assert.ok(await page.evaluate(() => !!window.ArrowOfTime));
  assert.equal((await snapshot(page)).numericalStepCount, 0); assert.equal(await page.locator('#aot-play').textContent(), 'Play');
  await screenshot(page, 'startup-1440'); await page.locator('.aot-stage').screenshot({ path: path.join(out, 'initial-scene.png') }); await fit(page);
  if (process.env.ARROW_LAYOUT_ONLY) { for(const [width,height] of [[390,844],[844,390],[1440,900]]) { await page.setViewportSize({width,height}); await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); }); await page.waitForFunction(() => scrollY===0); await fit(page); if(width===844) {const bounds=await page.locator('.aot-toolbar').boundingBox();assert.ok(bounds.y+bounds.height<=height+1,'Landscape controls below fold');} await screenshot(page,`layout-${width}x${height}`); } assert.deepEqual(errors,[]); console.log('PASS top-of-page layout inspection'); return; }
  if (process.env.ARROW_RUNTIME_ONLY) {
    await page.locator('#aot-play').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => ArrowOfTime.snapshot().activeClock>.15);
    await page.evaluate(() => document.querySelector('#aot-piece').style.transform='translateY(300vh)'); await page.waitForFunction(() => !ArrowOfTime.snapshot().inView); const sleeping=await snapshot(page); await page.waitForTimeout(200); assert.equal((await snapshot(page)).activeClock,sleeping.activeClock);
    await page.evaluate(() => document.querySelector('#aot-piece').style.transform=''); await page.waitForFunction(() => ArrowOfTime.snapshot().inView); await page.locator('#aot-play').click();
    await page.locator('#aot-restart').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase==='arrival'); assert.equal((await snapshot(page)).manualPause,true);
    await page.setViewportSize({width:844,height:390}); await page.evaluate(() => {document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);}); await page.waitForFunction(() => scrollY===0); await fit(page); const b=await page.locator('.aot-toolbar').boundingBox();assert.ok(b.y+b.height<=390);
    assert.deepEqual(errors,[]); console.log('PASS keyboard, final room initialization, stage suspension, paused restart and landscape controls'); return;
  }
  results.environment={browser:browser.version(),platform:process.platform};
  const n = await numerical(page); results.numerical.push(...n.records); results.performance.push(...n.perf); console.log(JSON.stringify(n, null, 2));
  if (process.env.ARROW_QUICK) { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); return; }
  await page.locator('#aot-instruments-toggle').click(); await page.locator('#aot-rate').selectOption('768'); await page.locator('#aot-play').click();
  await page.waitForFunction(() => ArrowOfTime.snapshot().orbitStep >= 2200, { timeout: 30000 });
  await page.locator('#aot-play').click(); const paused = await snapshot(page); await page.waitForTimeout(250); assert.equal((await snapshot(page)).numericalStepCount, paused.numericalStepCount);
  await page.locator('#aot-instruments-toggle').click(); await screenshot(page, 'developing-1440');
  await page.locator('#aot-play').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase === 'returned', { timeout: 30000 }); await page.locator('#aot-play').click();
  const returned = await snapshot(page); assert.equal(returned.returnResult.exact, true); assert.equal(returned.returnResult.forwardSteps, 4320); assert.equal(returned.returnResult.inverseSteps, 4320); assert.equal(returned.energyDriftJ, 0);
  await page.waitForFunction(() => document.querySelector('#aot-phase').textContent === 'Every spin has returned.'); await screenshot(page, 'return-1440'); await page.locator('.aot-stage').screenshot({ path: path.join(out, 'returned-scene.png') }); const initialPixels=PNG.sync.read(fs.readFileSync(path.join(out,'initial-scene.png'))), returnedPixels=PNG.sync.read(fs.readFileSync(path.join(out,'returned-scene.png'))); assert.equal(initialPixels.width,returnedPixels.width); assert.equal(initialPixels.height,returnedPixels.height); const interiorBytes=(initialPixels.height-1)*initialPixels.width*4; assert.ok(initialPixels.data.subarray(0,interiorBytes).equals(returnedPixels.data.subarray(0,interiorBytes)), 'Instantaneous rendered return differs inside canvas; adjacent progress hairline excluded'); results.browser.push('Returned scene pixels exactly equal startup, excluding adjacent progress hairline'); const startupBuffer = fs.readFileSync(path.join(out, 'startup-1440.png')); assert.ok(startupBuffer.length > 10000);
  await page.locator('#aot-instruments-toggle').click(); await page.locator('#aot-zoom').fill('4'); assert.equal((await snapshot(page)).parameters.zoom, 4); await page.locator('#aot-zoom').fill('1');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#aot-record').click(); const download = await downloadPromise; await download.saveAs(path.join(out, 'replay.json')); const record = JSON.parse(fs.readFileSync(path.join(out, 'replay.json'))); assert.equal(record.packedX.length, 2048); assert.equal(record.orbitStep, 0); await page.evaluate(async record => { const M=await import('/js/arrow-of-time-model.js'),G=await import('/js/arrow-of-time-gpu.js'),s=M.decodeReplay(record),a=await navigator.gpu.requestAdapter(),d=await a.requestDevice(),g=await G.createQ2RGPU(d,s); try { g.update(73); g.update(73,-1); if(!M.compare(await g.readback(),s).exact) throw Error('Exported seed/state replay failed'); } finally {g.dispose();d.destroy();} },record);
  await page.locator('#aot-instruments-toggle').click();
  // Observe two further physical phrases at accelerated wall pacing, with all exact steps.
  await page.locator('#aot-play').click();
  await page.waitForFunction(() => ArrowOfTime.snapshot().lastReturn?.cycle === 1, null, { timeout: 60000 });
  await page.waitForFunction(() => ArrowOfTime.snapshot().lastReturn?.cycle === 2, null, { timeout: 60000 });
  await page.locator('#aot-play').click(); results.browser.push({ severalPhrases: 3, lastReturn: (await snapshot(page)).lastReturn, totalSteps: (await snapshot(page)).numericalStepCount });
  await page.locator('#aot-restart').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase === 'arrival'); assert.equal((await snapshot(page)).manualPause, true); assert.equal((await snapshot(page)).orbitStep, 0);
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) { await page.setViewportSize({ width, height }); await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); }); await page.waitForFunction(() => scrollY===0); await fit(page); await screenshot(page, `layout-${width}x${height}`); await page.locator('#aot-instruments-toggle').click(); await fit(page); await page.locator('#aot-instruments-toggle').click(); }
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await snapshot(page); await page.waitForTimeout(200); assert.equal((await snapshot(page)).numericalStepCount, hidden.numericalStepCount);
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }); assert.equal((await snapshot(page)).manualPause, true);
  await page.locator('#aot-play').click(); await page.evaluate(() => document.querySelector('#aot-piece').style.transform = 'translateY(300vh)'); await page.waitForFunction(() => !ArrowOfTime.snapshot().inView); const offscreen = await snapshot(page); await page.waitForTimeout(250); assert.equal((await snapshot(page)).activeClock, offscreen.activeClock);
  await page.evaluate(() => document.querySelector('#aot-piece').style.transform = ''); await page.waitForFunction(() => ArrowOfTime.snapshot().inView); await page.locator('#aot-play').click();
  await page.evaluate(() => { document.querySelector('#aot-piece').requestFullscreen = () => Promise.reject(Error('test fallback')); }); await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => document.querySelector('#aot-piece').classList.contains('aot-fullscreen')); await fit(page); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#aot-piece').classList.contains('aot-fullscreen')); await page.evaluate(() => delete document.querySelector('#aot-piece').requestFullscreen);
  await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement); await fit(page); await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
  await context.close();
  const fallback = await browser.newContext({ viewport: { width: 390, height: 844 } }); await fallback.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined })); const fp = await open(fallback); assert.ok(await fp.locator('#aot-still').isVisible()); assert.ok(await fp.locator('#aot-play').isDisabled()); await fit(fp); await screenshot(fp, 'missing-webgpu'); await fallback.close();
  const normal = await browser.newContext({ viewport: { width: 844, height: 390 } }); await normal.addInitScript(() => { const request = GPUAdapter.prototype.requestDevice; GPUAdapter.prototype.requestDevice = async function(...args) { const d=await request.apply(this,args); window.__arrowTestDevice=d; return d; }; }); const np = await open(normal); assert.equal(await np.locator('#aot-play').textContent(), 'Pause'); await np.waitForFunction(() => ArrowOfTime.snapshot().activeClock > .2); await np.evaluate(() => { Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange')); }); const activeHidden=await snapshot(np); await np.waitForTimeout(250); assert.equal((await snapshot(np)).activeClock,activeHidden.activeClock); await np.evaluate(() => { delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange')); }); await np.waitForFunction(() => ArrowOfTime.snapshot().activeClock > .3); await np.evaluate(() => __arrowTestDevice.destroy()); await np.waitForFunction(() => !document.querySelector('#aot-still').hidden); assert.ok((await np.locator('#aot-error').textContent()).includes('device was lost')); await normal.close();
  assert.deepEqual(errors, []); results.browser.push('pause/resume, reduced motion, restart, replay export, zoom, responsive layouts, visibility, offscreen suspension, native and fallback fullscreen, missing WebGPU, device loss, auto-start, no validation errors');
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log('PASS browser checks. Artifacts: ' + out);
 } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
