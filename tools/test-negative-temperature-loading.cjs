// Exercise initialization failures as well as native Chrome and WebKit startup.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'assets/visualizer/negative-temperature');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
const report = { date: '2026-10-03', cases: [] };
let browser;
async function open(browser, name, setup, live = false) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.log(name + ': ' + message.text()); });
  await page.addInitScript(() => {
    window.loadingProgress = [];
    document.addEventListener('negative-temperature-progress', () => loadingProgress.push(document.getElementById('nt-status').textContent), true);
  });
  if (setup) await setup(page);
  const start = Date.now();
  await page.goto(live ? 'https://ethanwillingham.com/negative-temperature-lab.html' : `http://127.0.0.1:${server.address().port}/negative-temperature-lab.html`);
  return { page, start, errors, name };
}
async function ready(test) {
  await test.page.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false', undefined, { timeout: 45000 });
  const state = await test.page.evaluate(() => ({ activity: NegativeTemperature.activity(), snapshot: NegativeTemperature.snapshot(), progress: loadingProgress, phase: document.getElementById('nt-phase').textContent, status: document.getElementById('nt-status').textContent }));
  assert.equal(state.activity.fallback, false, state.status);
  assert.equal(state.snapshot.numericalStepCount, 12000);
  assert.equal(state.snapshot.parameters.grid, 512);
  assert.equal(state.snapshot.parameters.dt, .004);
  const pixels = await test.page.evaluate(() => { const canvas = document.getElementById('nt-canvas'), box = canvas.getBoundingClientRect(); return { width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height }; });
  assert.ok(pixels.width >= 2 * pixels.cssWidth - 1 && pixels.height >= 2 * pixels.cssHeight - 1);
  assert.ok(state.progress.some(text => /Preparing the field, \d+%/.test(text)));
  assert.ok(state.progress.some(text => /Stirring the field, \d+%/.test(text)));
  assert.deepEqual(test.errors, []);
  state.hash = await test.page.evaluate(async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', (await NegativeTemperature.debugReadback()).field.buffer))).map(v => v.toString(16).padStart(2, '0')).join(''));
  const summary = { name: test.name, startupMs: Date.now() - test.start, backend: state.snapshot.diagnosticsBackend, fallbackReason: state.snapshot.diagnosticsFallbackReason, openingSteps: state.snapshot.numericalStepCount, hash: state.hash, pixels, progressUpdates: state.progress.length, errors: test.errors };
  report.cases.push(summary); console.log(JSON.stringify(summary)); return state;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    if (!process.argv.includes('--webkit-only')) {
    browser = await chromium.launch({ executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', headless: true, args: ['--enable-unsafe-webgpu'] });
    // Demonstrate the exact indefinite wait in the deployed v3 initialization.
    if (process.argv.includes('--baseline')) {
      const old = await open(browser, 'v3 worker never replies', page => page.addInitScript(() => {
        window.Worker = class { postMessage() {} terminate() {} };
      }), true);
      await old.page.waitForTimeout(7000);
      const state = await old.page.evaluate(() => ({ busy: document.getElementById('nt-piece').getAttribute('aria-busy'), phase: document.getElementById('nt-phase').textContent, status: document.getElementById('nt-status').textContent }));
      assert.equal(state.busy, 'true'); assert.equal(state.phase, 'Preparing the field');
      report.baseline = state; console.log('Reproduced v3 worker wait: ' + JSON.stringify(state)); await old.page.close();
    }
    const healthy = await open(browser, 'Chrome native, worker available');
    const first = await ready(healthy);
    assert.equal(first.snapshot.diagnosticsBackend, 'module worker');
    await healthy.page.locator('#nt-play').click();
    await healthy.page.waitForTimeout(1500);
    assert.ok(await healthy.page.evaluate(() => NegativeTemperature.snapshot().numericalStepCount) > 12000);
    await healthy.page.locator('#nt-play').click();
    await healthy.page.locator('#nt-fullscreen').click();
    await healthy.page.waitForFunction(() => !!document.fullscreenElement || document.getElementById('nt-piece').classList.contains('nt-fullscreen'));
    await healthy.page.locator('#nt-fullscreen').click();
    await healthy.page.screenshot({ path: path.join(output, 'loading-recovery.png'), fullPage: true });
    await healthy.page.close();
    for (const mode of ['silent', 'constructor']) {
      const test = await open(browser, 'Chrome worker ' + mode, page => page.addInitScript(mode => {
        window.Worker = class {
          constructor() { if (mode === 'constructor') throw new DOMException('Worker blocked', 'SecurityError'); }
          postMessage() {} terminate() {}
        };
      }, mode));
      const state = await ready(test);
      assert.equal(state.snapshot.diagnosticsBackend, 'main thread');
      assert.ok(state.snapshot.diagnosticsFallbackReason);
      assert.equal(state.hash, first.hash, 'Worker fallback must not change the simulated field.');
      await test.page.close();
    }
    const missing = await open(browser, 'Module fetch failure and reload recovery', page => page.route('**/js/negative-temperature-room.js?v=4', route => route.abort()));
    await missing.page.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false');
    assert.ok(await missing.page.locator('#nt-fallback').isVisible());
    assert.equal(await missing.page.locator('#nt-restart').textContent(), 'Reload');
    assert.ok(await missing.page.locator('#nt-restart').isEnabled());
    await missing.page.unroute('**/js/negative-temperature-room.js?v=4');
    await missing.page.locator('#nt-restart').click();
    await ready(missing); await missing.page.close();
    const gpu = await open(browser, 'Unanswered GPU request', page => page.addInitScript(() => {
      const originalTimeout = window.setTimeout;
      window.setTimeout = (callback, milliseconds, ...args) => originalTimeout(callback, milliseconds === 15000 ? 100 : milliseconds, ...args);
      Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: () => new Promise(() => {}) } });
    }));
    await gpu.page.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false');
    assert.ok((await gpu.page.locator('#nt-status').textContent()).includes('did not provide a GPU'));
    assert.ok(await gpu.page.locator('#nt-fallback').isVisible());
    report.cases.push({ name: gpu.name, boundedFailure: true, retryAvailable: await gpu.page.locator('#nt-restart').isEnabled() });
    await gpu.page.close();
    await browser.close(); browser = null;
    }
    browser = await webkit.launch({ headless: true });
    const safari = await open(browser, 'WebKit native, worker available');
    const safariState = await ready(safari);
    assert.equal(safariState.snapshot.diagnosticsBackend, 'module worker');
    await safari.page.locator('#nt-play').click(); await safari.page.waitForTimeout(1500);
    assert.ok(await safari.page.evaluate(() => NegativeTemperature.snapshot().numericalStepCount) > 12000);
    await safari.page.close();
    fs.writeFileSync(path.join(output, 'loading-validation.json'), JSON.stringify(report, null, 2));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
