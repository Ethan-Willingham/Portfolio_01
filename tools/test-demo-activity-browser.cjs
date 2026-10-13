// NODE_PATH=/path/to/node_modules node tools/test-demo-activity-browser.cjs
// Owns one Chrome for Testing browser and closes it in finally.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
function instrumentation() {
  window.__demoChecks = []; window.__audioContexts = []; window.__gpuSubmits = 0;
  let api;
  Object.defineProperty(window, 'DemoActivity', { configurable: true, get: () => api, set(value) {
    const create = value.create;
    value.create = (element, options) => {
      const controller = create(element, options), row = { element, controller, frames: 0, ticks: 0, times: [] };
      __demoChecks.push(row);
      const frame = controller.requestFrame, interval = controller.setInterval;
      controller.requestFrame = fn => frame(t => { row.frames++; row.times.push(t); if (row.times.length > 8) row.times.shift(); fn(t); });
      controller.setInterval = (fn, delay) => interval(() => { row.ticks++; fn(); }, delay);
      return controller;
    }; api = value;
  } });
  const Audio = window.AudioContext;
  if (Audio) window.AudioContext = class extends Audio { constructor(...args) { super(...args); __audioContexts.push(this); } };
  if (navigator.gpu) {
    const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await request(...args); if (!adapter) return adapter;
      const getDevice = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (...args) => {
        const device = await getDevice(...args), submit = device.queue.submit.bind(device.queue);
        device.queue.submit = commands => { __gpuSubmits++; return submit(commands); };
        return device;
      }; return adapter;
    };
  }
}
const cases = [
  ['particles.html', '.p-canvas'], ['daylight-globe.html', '#globe-container'],
  ['hunting-game.html', '#hunt-canvas'], ['four-wheels.html', '#cart-canvas', '#cart-start'],
  ['one-shift.html', '#shift-canvas'], ['archive/water-smoke-slime/water-smoke-slime.html', '#toy-stage'],
  ['negative-temperature-lab.html', '#nt-piece'], ['hydrogen-exactly-lab.html', '#hx-demo'], ['undertow-lab.html', '#undertow-stage'],
  ['grand-motherload.html?dev=1&nosave=1', '#game-canvas'],
  ['archive/mri/mri.html', '#slice-canvas', '#play-btn'],
  ['archive/best-photographs/best-photographs.html', '#flip-canvas'],
  ['audio-lab.html', '#meter'],
  ['warehouse.html', '.plate'], ['archive/weather/weather.html', '#wxCanvas'],
  ...['mine','sunset','leaving','endcap','economy','autosell','death','nmz-banner'].map(name => [name+'-lab.html', name==='sunset'?'#glcanvas':name==='leaving'?'#stage':name==='economy'?'#chart':'#c'])
];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, child, profile;
  try {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-activity-browser-'));
    child = spawn(process.env.TEST_CHROME || '/Users/ethan/.local/bin/agent-chrome-for-testing', ['--remote-debugging-port=0', '--user-data-dir='+profile, '--headless=new', '--no-first-run', '--enable-unsafe-webgpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'], { stdio: ['ignore','ignore','pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(Error('Testing browser did not start')), 30000);
      child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('Testing browser exited: '+code)); });
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = browser.contexts()[0];
    await context.addInitScript(instrumentation);
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    const background = await context.newPage();
    for (const [name, selector, start] of cases.filter(c => !process.env.ONLY || process.env.ONLY.split(',').some(value => c[0].includes(value)))) {
      console.log('START '+name);
      const page = await context.newPage(), errors = [];
      await page.setViewportSize({ width: 1280, height: 900 });
      page.on('pageerror', error => errors.push(error.message));
      await page.bringToFront();
      await page.goto(`http://127.0.0.1:${server.address().port}/${name}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; });
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      if (start && await page.locator(start).getAttribute('aria-pressed') !== 'true') await page.locator(start).click({ timeout: 90000 });
      if(name.startsWith('grand-motherload'))await page.waitForFunction(()=>window.SluiceLoading&&!SluiceLoading.active(),null,{timeout:90000});
      await page.waitForFunction(() => __demoChecks.some(row => row.controller.active() && row.frames+row.ticks > 4), null, { timeout: 90000 });
      await page.waitForTimeout(150);
      assert.deepEqual(errors, [], name+' boot');
      await background.bringToFront();

      await page.waitForFunction(() => __demoChecks.every(row => !row.controller.active()));
      await page.waitForTimeout(200); // Let one already-submitted GPU command finish.
      const idle = await page.evaluate(() => ({ frames: __demoChecks.reduce((n,row)=>n+row.frames,0), ticks: __demoChecks.reduce((n,row)=>n+row.ticks,0), gpu: __gpuSubmits }));
      await page.waitForTimeout(450);
      assert.deepEqual(await page.evaluate(() => ({ frames: __demoChecks.reduce((n,row)=>n+row.frames,0), ticks: __demoChecks.reduce((n,row)=>n+row.ticks,0), gpu: __gpuSubmits })), idle, name+' background work');
      const before = idle.frames+idle.ticks;
      await page.bringToFront();
      await page.waitForFunction(before => __demoChecks.reduce((n,row) => n+(row.frames+row.ticks),0) > before+2, before);
      // Scroll every demo below a temporary blank viewport. The live page and
      // its application state remain intact, just as with a long introduction.
      await page.evaluate(() => { const spacer=document.createElement('div');spacer.id='activity-test-spacer';spacer.style.height='200vh';document.body.prepend(spacer);window.scrollTo(0,0); });
      await page.waitForTimeout(150);
      await page.evaluate(() => { for(const element of new Set(__demoChecks.filter(row=>row.controller.active()).map(row=>row.element))){element.dataset.activityTransform=element.style.transform;element.style.transform='translateY(200vh)';} });
      await page.waitForFunction(() => __demoChecks.every(row => !row.controller.active()));
      await page.waitForTimeout(200);
      const offscreen = await page.evaluate(() => ({ frames: __demoChecks.reduce((n,row)=>n+row.frames,0), ticks: __demoChecks.reduce((n,row)=>n+row.ticks,0), gpu: __gpuSubmits }));
      await page.waitForTimeout(450);
      assert.deepEqual(await page.evaluate(() => ({ frames: __demoChecks.reduce((n,row)=>n+row.frames,0), ticks: __demoChecks.reduce((n,row)=>n+row.ticks,0), gpu: __gpuSubmits })), offscreen, name+' offscreen work');
      await page.evaluate(() => {document.getElementById('activity-test-spacer').remove();for(const row of __demoChecks){if('activityTransform' in row.element.dataset){row.element.style.transform=row.element.dataset.activityTransform;delete row.element.dataset.activityTransform;}}});
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      await page.waitForFunction(before => __demoChecks.reduce((n,row) => n+(row.frames+row.ticks),0) > before+2, offscreen.frames+offscreen.ticks);
      assert.deepEqual(errors, [], name+' resume');
      console.log('PASS '+name+': background and offscreen frames, timers and GPU submissions stop; both resume');
      const manual = name.startsWith('four-wheels') ? ['#cart-pause', '#cart-game', 'paused'] : name.startsWith('hunting-game') ? ['#hunt-pause', '#hunt-game', 'paused'] : null;
      if(manual){
        await page.locator(manual[0]).click();
        assert.equal(await page.locator(manual[1]).getAttribute('data-phase'),manual[2]);
        await background.bringToFront();await page.waitForTimeout(100);await page.bringToFront();await page.waitForTimeout(100);
        assert.equal(await page.locator(manual[1]).getAttribute('data-phase'),manual[2],name+' retains manual pause');
        console.log('PASS '+name+': returning preserves intentional pause');
      }
      await page.close();
    }
  } finally { if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => { const timeout=setTimeout(resolve,2000); child.once('exit',()=>{clearTimeout(timeout);resolve();}); }); } if (profile) fs.rmSync(profile,{recursive:true,force:true}); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
