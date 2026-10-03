// Regression for the visible opening and the ambient-to-solver clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets/visualizer/negative-temperature');
const errors = [];
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', headless: true, args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/negative-temperature-lab.html`);
    await page.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false');
    const report = { date: '2026-10-03', adapter: 'Apple M1 Pro / Metal', opening: await page.evaluate(() => NegativeTemperature.snapshot()) };
    assert.equal(report.opening.parameters.solverUnitsPerSecond, 3);
    assert.ok(report.opening.numericalStepCount >= 4800);
    assert.equal(report.opening.phase, 'Stirring');
    const first = await page.evaluate(async () => {
      const state = await NegativeTemperature.debugReadback();
      return { time: state.time, field: Array.from(state.field) };
    });
    await page.screenshot({ path: path.join(output, 'opening-v2.png'), fullPage: true });
    await page.waitForTimeout(5000);
    report.fiveSeconds = await page.evaluate(() => NegativeTemperature.snapshot());
    const later = await page.evaluate(async () => {
      const state = await NegativeTemperature.debugReadback();
      return { time: state.time, field: Array.from(state.field) };
    });
    const density = a => a.reduce((out, value, i) => { if (i % 2 === 0) out.push(value * value + a[i + 1] * a[i + 1]); return out; }, []);
    const a = density(first.field), b = density(later.field);
    report.densityChangeRMS = Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / a.length);
    report.activeClockAdvance = later.time - first.time;
    assert.ok(report.activeClockAdvance > 10, 'The live clock must advance meaningfully in five seconds.');
    assert.ok(report.densityChangeRMS > 0.03, 'Opening density must visibly change, beyond global phase rotation.');
    await page.screenshot({ path: path.join(output, 'opening-motion-v2.png'), fullPage: true });
    await page.locator('#nt-play').click();
    const paused = await page.evaluate(() => NegativeTemperature.snapshot().numericalStepCount);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => NegativeTemperature.snapshot().numericalStepCount), paused);
    const restart = async () => {
      await page.locator('#nt-restart').click();
      await page.waitForFunction(() => !NegativeTemperature.activity().starting);
      assert.equal(await page.evaluate(() => NegativeTemperature.snapshot().numericalStepCount), 4800);
      return page.evaluate(async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', (await NegativeTemperature.debugReadback()).field.buffer))).map(v => v.toString(16).padStart(2, '0')).join(''));
    };
    report.restartHash = await restart();
    assert.equal(await restart(), report.restartHash);
    report.payoff = await page.evaluate(() => NegativeTemperature.advance(10200));
    assert.ok(report.payoff.diagnostics.clustered);
    assert.ok(report.payoff.diagnostics.positive >= 4 && report.payoff.diagnostics.negative >= 4);
    await page.screenshot({ path: path.join(output, 'payoff-v2.png'), fullPage: true });
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.nt-toolbar button')].every(el => el.getBoundingClientRect().height >= 44)));
    }
    const still = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await still.goto(`http://127.0.0.1:${server.address().port}/negative-temperature-lab.html`);
    await still.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false');
    assert.equal(await still.locator('#nt-play').textContent(), 'Play');
    assert.equal(await still.evaluate(() => NegativeTemperature.snapshot().numericalStepCount), 4800);
    await still.waitForTimeout(200);
    assert.equal(await still.evaluate(() => NegativeTemperature.snapshot().numericalStepCount), 4800);
    // The room's ordinary fixed-clock path must keep up with the faster mapping.
    report.roomClock = await page.evaluate(async () => {
      const { createRoom } = await import('./js/negative-temperature-room.js?v=2');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
      const room = await createRoom({ device, seed: '180106951' });
      try {
        for (let i = 0; i < 60; i++) room.step({ dtSeconds: 1 / 60, elapsedSeconds: i / 60, scoreSeconds: i / 60 });
        await device.queue.onSubmittedWorkDone();
        return room.snapshot().numericalStepCount;
      } finally { room.dispose(); device.destroy(); }
    });
    assert.equal(report.roomClock, 300);
    assert.deepEqual(errors, []);
    report.errors = errors;
    fs.writeFileSync(path.join(output, 'opening-validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ openingSteps: report.opening.numericalStepCount, activeClockAdvance: report.activeClockAdvance, densityChangeRMS: report.densityChangeRMS, restartHash: report.restartHash, roomStepsPerSecond: report.roomClock, clusteredAtTime150: report.payoff.diagnostics.clustered, errors }));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
