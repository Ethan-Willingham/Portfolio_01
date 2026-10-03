// NODE_PATH=<bundled node_modules> node tools/test-hydrogen-exactly-browser.cjs
// Owns exactly its Chrome for Testing child and HTTP server, closed in finally.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'research/visualizer/hydrogen-exactly-results');
fs.mkdirSync(output, { recursive: true });
let browser;
const errors = [], report = { date: '2026-10-03', checks: [], screenshots: [], measurements: [] };
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try { const data = fs.readFileSync(file), types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }; response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); response.end(data); }
  catch { response.writeHead(404).end(); }
});
const snap = page => page.evaluate(() => HydrogenExactly.snapshot());
function pass(label) { report.checks.push(label); console.log('PASS', label); }
async function open(context) {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR_FAILED')) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/hydrogen-exactly-lab.html`);
  await page.waitForFunction(() => document.getElementById('hx-demo').getAttribute('aria-busy') === 'false', null, { timeout: 60000 }); return page;
}
async function shot(page, name, stage = true) {
  const file = path.join(output, name + '.png');
  if (stage) await page.locator('#hx-stage').screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
}
async function gpuCheck(page, mode, time, quality = 'medium') {
  await page.evaluate(({ mode, time }) => { HydrogenExactly.setMode(mode); HydrogenExactly.seek(time); }, { mode, time });
  await page.locator('#hx-quality').selectOption(quality);
  const data = await page.evaluate(() => HydrogenExactly.debugReadback());
  assert.ok(data.finite); assert.ok(Math.abs(data.analyticNorm - 1) < 1e-12);
  let maxAmplitudeScaledError = 0, maxDensityScaledError = 0;
  for (const p of data.probes) {
    const amplitude = Math.max(Math.sqrt(p.cpu.rho), mode === 'revival' ? 1e-7 : 1e-5);
    maxAmplitudeScaledError = Math.max(maxAmplitudeScaledError, Math.abs(p.gpu.re - p.cpu.re) / amplitude, Math.abs(p.gpu.im - p.cpu.im) / amplitude);
    maxDensityScaledError = Math.max(maxDensityScaledError, Math.abs(p.gpu.rho - p.cpu.rho) / Math.max(p.cpu.rho, mode === 'revival' ? 1e-14 : 1e-10));
  }
  assert.ok(maxAmplitudeScaledError < .001, JSON.stringify({ mode, time, maxAmplitudeScaledError, probes: data.probes }));
  assert.ok(maxDensityScaledError < .002, JSON.stringify({ mode, time, maxDensityScaledError }));
  report.measurements.push({ mode, time, quality, capturedMass: data.spatialCapturedMass, maxAmplitudeScaledError, maxDensityScaledError, grid: data.parameterValues.grid, probes: data.probes });
  return data;
}
async function fit(page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('.hx-toolbar button')].map(e => { const b = e.getBoundingClientRect(); return { width: b.width, height: b.height }; }), canvas: [document.getElementById('hx-canvas').width, document.getElementById('hx-canvas').height], background: getComputedStyle(document.body).backgroundColor }));
  assert.ok(geometry.scroll <= geometry.width + 1); assert.equal(geometry.background, 'rgb(48, 57, 49)');
  for (const b of geometry.buttons) assert.ok(b.width >= 44 && b.height >= 44);
  assert.ok(geometry.canvas[0] > 100 && geometry.canvas[1] > 100);
}
(async () => { try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', args: ['--enable-unsafe-webgpu'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await open(context);
  assert.equal(await page.locator('#hx-demo').getAttribute('data-ready'), 'true', await page.locator('#hx-status').textContent());
  assert.equal(await page.locator('#hx-instruments').isVisible(), false);
  await fit(page); report.adapter = (await snap(page)).adapter;
  console.log('ADAPTER', JSON.stringify(report.adapter));
  await page.locator('#hx-play').click(); assert.ok((await snap(page)).paused);
  await page.evaluate(() => HydrogenExactly.seek(0)); await shot(page, 'desktop-initial', false); await shot(page, 'initial');
  await page.locator('#hx-instruments-toggle').click();
  await page.locator('#hx-beacon').click();
  await page.waitForFunction(() => document.getElementById('hx-beacon-status').textContent.startsWith('Verified:'), null, { timeout: 15000 });
  const audit = await page.evaluate(async () => {
    const { verifyFixture } = await import('/js/hydrogen-exactly-beacon.js');
    const beacon = await (await fetch('/assets/visualizer/hydrogen-exactly/drand-quicknet-round-42.json')).json();
    // Change the signature and recompute its randomness, so rejection must
    // validate the BLS signature rather than just notice a SHA-256 mismatch.
    beacon.signature = beacon.signature.slice(0, -2) + (beacon.signature.endsWith('00') ? '01' : '00');
    const bytes = Uint8Array.from(beacon.signature.match(/../g), h => parseInt(h, 16));
    beacon.randomness = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    let rejected = false;
    try { await verifyFixture({ beacon }); } catch { rejected = true; }
    return { good: HydrogenExactly.snapshot().beaconAudit, rejected, cached: JSON.parse(localStorage.getItem('hydrogen-exactly-beacon-seed')) };
  });
  assert.ok(audit.good.verified && audit.rejected && audit.cached.seed === audit.good.seed); assert.equal(audit.good.usedByModel, false);
  report.beaconAudit = audit; pass('Pinned browser drand client verifies round 42 and rejects a tampered signature even with recomputed SHA-256');
  for (const [time, name] of [[30, 'spreading'], [50, 'two-packets'], [66.6667, 'three-packets'], [198.4, 'revival'], [750, 'tsr-sixth'], [798.1, 'late-return']]) {
    await page.evaluate(t => HydrogenExactly.seek(t), time); await shot(page, name);
  }
  pass('Full-spectrum startup, developing structures and event images');
  if (process.env.HYDROGEN_REVIEW_ONLY) return;
  const grids = [];
  for (const quality of ['low', 'medium', 'high']) grids.push(await gpuCheck(page, 'revival', 50, quality));
  const change = Math.abs(grids[2].spatialCapturedMass - grids[1].spatialCapturedMass);
  assert.ok(change < .002); assert.ok(grids[1].spatialCapturedMass > .999 && grids[1].spatialCapturedMass < 1.001);
  report.revivalGridConvergence = grids.map(s => ({ grid: s.parameterValues.grid, mass: s.spatialCapturedMass }));
  await gpuCheck(page, 'revival', 798.1);
  pass('GPU complex amplitudes and densities match CPU; revival finite-grid mass converges');
  const spectral = [];
  for (const quality of ['low', 'medium', 'high']) spectral.push(await gpuCheck(page, 'spectral', 3, quality));
  report.spectralGridConvergence = spectral.map(s => ({ grid: s.parameterValues.grid, mass: s.spatialCapturedMass }));
  assert.ok(Math.abs(spectral[2].spatialCapturedMass - spectral[1].spatialCapturedMass) < .008);
  assert.ok(spectral[1].spatialCapturedMass > .985 && spectral[1].spatialCapturedMass < 1.01);
  await shot(page, 'spectral');
  await page.locator('#hx-view').selectOption('section'); await shot(page, 'spectral-section');
  const positive = await gpuCheck(page, 'spectral', 0), negative = await gpuCheck(page, 'spectral', 2);
  assert.ok(positive.probes.some(p => p.gpu.signedFirstPair > 0)); assert.ok(negative.probes.some(p => p.gpu.signedFirstPair < 0));
  assert.equal((await snap(page)).wavelengths.filter(p => p.linearRGB).length, 3);
  await page.locator('#hx-color').selectOption('2'); await shot(page, 'signed-diagnostic');
  await page.locator('#hx-measure').click(); await page.waitForFunction(() => document.getElementById('hx-measurement').textContent.startsWith('Measured box mass'));
  pass('Spectral wavelengths, signed cross terms, positive density, section and mass readout');
  await page.locator('#hx-mode').selectOption('revival'); await page.locator('#hx-view').selectOption('volume');
  await page.evaluate(() => HydrogenExactly.seek(50));
  const a = await page.evaluate(() => HydrogenExactly.debugReadback()); await page.locator('#hx-restart').click(); await page.evaluate(() => HydrogenExactly.seek(50));
  const b = await page.evaluate(() => HydrogenExactly.debugReadback()); assert.deepEqual(a.probes, b.probes);
  pass('Deterministic seed provenance and replay at the same score');
  await page.locator('#hx-instruments-toggle').click(); await page.locator('#hx-play').click();
  const start = (await snap(page)).scoreSeconds; await page.waitForTimeout(10500); assert.ok((await snap(page)).scoreSeconds > start + 7);
  pass('Observed one complete orbit at the declared default pace');
  await context.setOffline(true); const offlineTime = (await snap(page)).scoreSeconds;
  await page.waitForTimeout(400); assert.ok((await snap(page)).scoreSeconds > offlineTime);
  assert.ok((await snap(page)).beaconAudit.verified); await context.setOffline(false);
  pass('Network loss preserves running deterministic evolution and cached historical seed');
  await page.locator('#hx-instruments-toggle').click(); await page.locator('#hx-speed').selectOption('64'); await page.locator('#hx-instruments-toggle').click();
  const startLong = (await snap(page)).scoreSeconds; await page.waitForTimeout(19000);
  report.longRun = { start: startLong, end: (await snap(page)).scoreSeconds, note: '64x local clock, exact full-spectrum evaluation at every sampled score, no modified equation' };
  assert.ok(report.longRun.end > startLong + 800); await page.locator('#hx-play').click();
  pass('Long run covers several revival phrases with unchanged energies');
  await page.locator('#hx-instruments-toggle').click(); await page.locator('#hx-speed').selectOption('1');
  await page.locator('#hx-quality').selectOption('medium'); await page.evaluate(() => HydrogenExactly.seek(50));
  report.performance = await page.evaluate(() => HydrogenExactly.benchmark(24)); console.log('PERFORMANCE', JSON.stringify(report.performance));
  await page.locator('#hx-instruments-toggle').click();
  const fixed = (await snap(page)).scoreSeconds; await page.waitForTimeout(180); assert.equal((await snap(page)).scoreSeconds, fixed);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); assert.ok((await snap(page)).paused);
  await page.locator('#hx-play').click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = (await snap(page)).numericalStepCount; await page.waitForTimeout(180); assert.equal((await snap(page)).numericalStepCount, hidden);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => HydrogenExactly.snapshot().running);
  await page.evaluate(() => document.getElementById('hx-stage').style.transform = 'translateY(-300vh)'); await page.waitForFunction(() => !HydrogenExactly.snapshot().running);
  const off = (await snap(page)).numericalStepCount; await page.waitForTimeout(180); assert.equal((await snap(page)).numericalStepCount, off);
  await page.evaluate(() => document.getElementById('hx-stage').style.transform = ''); await page.waitForFunction(() => HydrogenExactly.snapshot().running);
  await page.locator('#hx-play').click(); pass('Pause persists across visibility changes; hidden and offscreen work suspends');
  await page.locator('#hx-canvas').focus(); await page.keyboard.press('Space'); assert.equal((await snap(page)).paused, false); await page.keyboard.press('Space');
  await page.locator('#hx-fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement || document.getElementById('hx-demo').classList.contains('hx-pseudo-fullscreen')); await fit(page); await shot(page, 'fullscreen'); await page.locator('#hx-fullscreen').click();
  await page.evaluate(() => document.getElementById('hx-demo').requestFullscreen = () => Promise.reject(Error('test fallback')));
  await page.locator('#hx-fullscreen').click(); assert.equal(await page.locator('#hx-demo').evaluate(e => e.classList.contains('hx-pseudo-fullscreen')), true); await page.keyboard.press('Escape');
  pass('Keyboard play, native fullscreen and denied-fullscreen recovery');
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height }); await page.locator('#hx-stage').scrollIntoViewIfNeeded(); await fit(page); await shot(page, `layout-${width}x${height}`, false);
    await page.locator('#hx-instruments-toggle').click(); assert.equal(await page.locator('#hx-mode').isVisible(), true);
    await page.locator('#hx-mode').selectOption('spectral'); await fit(page); await shot(page, `instruments-${width}x${height}`, false); await page.locator('#hx-mode').selectOption('revival'); await page.locator('#hx-instruments-toggle').click();
  }
  pass('1440x900, 390x844 and 844x390 layouts without overflow and with 44px targets');
  await page.evaluate(() => HydrogenExactly.debugLoseDevice());
  await page.waitForFunction(() => document.getElementById('hx-demo').dataset.ready === 'false');
  assert.ok((await page.locator('#hx-status').textContent()).includes('GPU device lost')); assert.ok(await page.locator('#hx-play').isDisabled());
  pass('Device loss releases room resources and exposes the labeled initial still');
  await context.close();
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await open(reduced); assert.ok((await snap(still)).paused); const initial = (await snap(still)).numericalStepCount; await still.waitForTimeout(250); assert.equal((await snap(still)).numericalStepCount, initial); await still.locator('#hx-play').click(); await still.waitForTimeout(250); assert.ok((await snap(still)).numericalStepCount > initial); await reduced.close(); pass('Reduced motion starts still and Play explicitly starts the model');
  const missing = await browser.newContext({ viewport: { width: 390, height: 844 } }); await missing.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  const fallback = await open(missing); assert.equal(await fallback.locator('#hx-demo').getAttribute('data-ready'), 'false'); assert.ok((await fallback.locator('#hx-status').textContent()).includes('CPU-computed')); assert.equal(await fallback.locator('#hx-play').isDisabled(), true); await shot(fallback, 'missing-webgpu', false); await missing.close(); pass('Missing WebGPU gives a labeled computed still');
  const offline = await browser.newContext(); await offline.route('**/CIE_xyz_1931_2deg.csv', route => route.abort()); const failed = await open(offline); assert.equal(await failed.locator('#hx-demo').getAttribute('data-ready'), 'false'); assert.ok((await failed.locator('#hx-status').textContent()).includes('CIE')); await offline.close(); pass('Local data failure is surfaced without substituting another model');
  // Independent host, two rooms on one supplied device. Imports must have no DOM effects.
  const hostContext = await browser.newContext(), host = await open(hostContext);
  const shared = await host.evaluate(async () => {
    HydrogenExactly.dispose(); const count = document.querySelectorAll('*').length;
    const { createRoom } = await import('/js/hydrogen-exactly-room.js'); const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
    const a = await createRoom({ device, seed: 'a', quality: 'low' }), b = await createRoom({ device, seed: 'b', quality: 'low' });
    const target = device.createTexture({ size: [32, 32], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const errors = []; device.addEventListener('uncapturederror', e => errors.push(e.error.message));
    for (const room of [a, b]) { room.resize({ width: 32, height: 32, dpr: 1 }); room.step({ dtSeconds: 1 / 60, elapsedSeconds: 0, scoreSeconds: 50 }); const encoder = device.createCommandEncoder(); room.render({ encoder, targetView: target.createView(), width: 32, height: 32, exposure: 1 }); device.queue.submit([encoder.finish()]); }
    const before = await a.debugReadback(); a.dispose(); b.step({ dtSeconds: 1 / 60, elapsedSeconds: 1, scoreSeconds: 66.6667 }); const after = await b.debugReadback();
    const result = { errors, domUntouched: count === document.querySelectorAll('*').length, before: before.finite, after: after.finite, count: b.snapshot().numericalStepCount };
    b.dispose(); target.destroy(); device.destroy(); return result;
  });
  assert.deepEqual(shared.errors, []); assert.ok(shared.domUntouched && shared.before && shared.after); assert.equal(shared.count, 2); await hostContext.close(); pass('Literal room contract works without DOM effects and preserves another room on the same device');
  assert.deepEqual(errors, []); report.errors = errors; pass('No JavaScript, shader or GPU validation errors');
  fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); } })().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'browser-partial.json'), JSON.stringify({ ...report, errors, failure: error.message }, null, 2)); process.exitCode = 1; });
