// Normal browser playback and real controls in an owned Chrome for Testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, launchOptions} = require('./under-street/browser-support.cjs');

const root = path.resolve(__dirname, '..');
const output = process.env.DUMP || '/tmp/marly-machine-review';
fs.mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg'};
const server = http.createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});

(async () => {
  let browser, page;
  const reports = [], errors = [];
  function check(label, condition) { assert(condition, label); console.log('PASS ' + label); }
  async function sample() { return page.evaluate(() => __toy.machineState().definition.marlyReading); }
  async function ready() {
    await page.waitForFunction(() => window.__toy?.machineState()?.ready && !__toy.stats().loading && !!__toy.machineState().definition.marlyReading, null, {timeout:45000});
    await page.locator('#marly-canvas').waitFor({state:'visible'});
  }
  async function advance(seconds) {
    const target = (await sample()).elapsed + seconds;
    await page.waitForFunction(target => __toy.machineState().definition.marlyReading.elapsed >= target, target, {timeout:Math.max(30000, seconds * 6000)});
  }
  function finite(s) {
    ['wheelAngle', 'omega', 'deliveredLiters', 'tankLiters', 'massResidualLiters', 'elapsed'].forEach(key => assert(Number.isFinite(s[key]), key + ' is finite'));
    assert(Math.abs(s.massResidualLiters) < 1e-6, 'water inventory is conserved');
  }
  async function capture(name) {
    const state = await sample(); finite(state);
    const ui = await page.evaluate(() => {
      const box = el => {
        const r = el.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom};
      };
      const canvas = document.getElementById('marly-canvas');
      const ctx = canvas.getContext('2d'), pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 64) if (pixels[i + 3]) colors.add([pixels[i], pixels[i + 1], pixels[i + 2]].join(','));
      return {
        view:{width:innerWidth, height:innerHeight}, demo:box(document.querySelector('.marly-demo')), canvas:box(canvas), colors:colors.size,
        controls:['marly-river', 'marly-brake', 'marly-gate'].map(id => {
          const el = document.getElementById(id);
          return {id, ...box(el), disabled:el.disabled, label:el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent};
        }),
        readout:document.getElementById('marly-readout').textContent,
        status:document.getElementById('toy-status').textContent,
        pageWidth:document.documentElement.scrollWidth,
        pause:__toy.stats().paused,
        error:__toy.instruments().error || null,
        gpuError:window.__marlyGpuError || null
      };
    });
    check(name + ' draws a substantial apparatus', ui.canvas.width >= 250 && ui.canvas.height >= 130 && ui.colors > 15);
    check(name + ' keeps the apparatus in view', ui.canvas.x >= -.5 && ui.canvas.right <= ui.view.width + .5 && ui.canvas.y >= -.5 && ui.canvas.bottom <= ui.view.height + .5);
    check(name + ' fits the viewport without horizontal scrolling', ui.pageWidth <= ui.view.width + 1 && ui.demo.x >= -.5 && ui.demo.right <= ui.view.width + .5);
    for (const control of ui.controls) {
      check(name + ' ' + control.id + ' is named and reachable', !!control.label && !control.disabled && control.width >= 44 && control.height >= 44 && control.x >= -.5 && control.right <= ui.view.width + .5 && control.y >= -.5 && control.bottom <= ui.view.height + .5);
    }
    check(name + ' explains its live state', ui.readout.trim().length > 8 && !/Waiting for pressure/i.test(ui.status));
    assert.equal(ui.error, null); assert.equal(ui.gpuError, null);
    reports.push({name, state, ui});
    await page.screenshot({path:path.join(output, name + '.png')});
    console.log(name, JSON.stringify({elapsed:state.elapsed, omega:state.omega, delivered:state.deliveredLiters, tank:state.tankLiters, residual:state.massResidualLiters}));
    return state;
  }
  async function click(id, touch = false) {
    if (touch) await page.locator('#' + id).tap();
    else await page.locator('#' + id).click();
  }
  async function pause() {
    if (!(await page.evaluate(() => __toy.stats().paused))) await click('toy-pause');
    await page.waitForFunction(() => __toy.stats().paused);
  }
  async function restart() {
    await pause();
    await click('toy-restart');
    await ready();
    const state = await sample();
    check('restart returns the mechanism and delivery to their initial state', state.elapsed < 1 && state.deliveredLiters === 0);
    check('restart resumes playback', !(await page.evaluate(() => __toy.stats().paused)));
    await pause();
    return state;
  }
  async function gate(value) {
    const slider = page.locator('#marly-gate');
    const step = Number(await slider.getAttribute('step')) || 1;
    const minimum = Number(await slider.getAttribute('min')) || 0;
    assert.equal((value - minimum) % step, 0, 'requested gate setting matches the control step');
    await slider.focus();
    await page.keyboard.press('Home');
    for (let i = minimum; i < value; i += step) await page.keyboard.press('ArrowRight');
    assert.equal(Number(await slider.inputValue()), value, 'keyboard changes the river gate');
  }
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({...launchOptions, args:['--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run']});
    async function newPage(viewport, touch = false) {
      const p = await browser.newPage({viewport, deviceScaleFactor:1, isMobile:touch, hasTouch:touch});
      p.on('pageerror', error => errors.push(error.message));
      await p.route(/googletagmanager\.com|google-analytics\.com/, route => route.abort());
      return p;
    }
    const url = `http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=marly-machine`;
    page = await newPage({width:1440, height:900});
    await page.goto(url + '&paused=1'); await ready();
    await page.evaluate(() => __toy.liquid().device.addEventListener('uncapturederror', event => { window.__marlyGpuError = event.error.message; }));
    const initial = await capture('desktop-initial');
    await click('toy-pause'); await advance(8);
    const running = await capture('desktop-pumping');
    check('river autonomously turns the wheel and raises water', Math.abs(running.wheelAngle - initial.wheelAngle) > .5 && running.omega > .05 && running.deliveredLiters > initial.deliveredLiters && running.tankLiters > initial.tankLiters);

    await pause();
    const frozen = await sample(); await page.waitForTimeout(450);
    assert.deepEqual(await sample(), frozen, 'manual pause freezes the complete physical state');
    console.log('PASS manual pause freezes the complete physical state');
    await capture('desktop-paused'); await click('toy-pause');

    await click('marly-river');
    await page.waitForFunction(() => document.getElementById('marly-river').textContent.includes('Open'));
    await advance(12);
    const coast = await capture('river-closed');
    check('closing the river removes the drive and lets the wheel stop', Math.abs(coast.omega) < .03);
    const stoppedVolume = coast.deliveredLiters; await advance(2);
    check('a stopped river cannot keep delivering water', (await sample()).deliveredLiters - stoppedVolume < .01);
    await click('marly-river'); await advance(5);
    check('opening the river restarts the wheel', (await sample()).omega > .05);

    await click('marly-brake'); await advance(3);
    const braked = await capture('brake-held');
    check('the brake holds the shaft against the river', Math.abs(braked.omega) < .001);
    const brakedAngle = braked.wheelAngle; await advance(1);
    check('the held brake prevents wheel travel', Math.abs((await sample()).wheelAngle - brakedAngle) < .001);
    await page.locator('#marly-brake').focus(); await page.keyboard.press('Space');
    await advance(4);
    check('keyboard release of the brake resumes pumping', (await sample()).omega > .05 && (await sample()).deliveredLiters > braked.deliveredLiters);

    await restart(); await gate(25); await click('toy-pause'); await advance(8);
    const low = await capture('low-river');
    await restart(); await gate(100); await click('toy-pause'); await advance(8);
    const high = await capture('high-river');
    check('opening the gate increases real shaft speed and delivery', high.omega > low.omega && high.deliveredLiters > low.deliveredLiters);
    await restart();

    await page.setViewportSize({width:600, height:800}); await page.waitForTimeout(250);
    await capture('narrow-desktop');
    await page.evaluate(() => __toy.machine('moniac', {}));
    await page.waitForFunction(() => __toy.machineState()?.ready && __toy.machineState().definition.name === 'moniac');
    check('leaving the scene removes its private overlay', await page.locator('.marly-demo').count() === 0);
    await page.evaluate(() => __toy.machine('marly-machine', {})); await ready();
    check('loading another draft does not replace the completed Marly factory', await page.evaluate(() => !!__toy.machineState().definition.marly && document.querySelectorAll('.marly-demo').length === 1));
    await click('toy-pause'); await advance(3); await capture('returned-to-marly');
    await page.close();

    page = await newPage({width:844, height:390}, true);
    await page.goto(url); await ready(); await advance(5);
    await capture('landscape-touch');
    await click('marly-brake', true); await advance(3);
    check('touch applies the brake', Math.abs((await sample()).omega) < .001);
    await click('marly-brake', true); await advance(3);
    check('touch releases the brake', (await sample()).omega > .05);
    await click('marly-river', true);
    check('touch closes the river', (await page.locator('#marly-river').textContent()).includes('Open'));
    await click('marly-river', true);
    await page.setViewportSize({width:390, height:844}); await page.waitForTimeout(250);
    await capture('portrait-touch');
    await page.emulateMedia({reducedMotion:'reduce'}); await advance(2);
    await capture('reduced-motion');
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('PASS Marly behavior, volume conservation, controls, pause, reset, cleanup and responsive presentation. Artifacts: ' + output);
  } finally {
    fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({reports, errors}, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
