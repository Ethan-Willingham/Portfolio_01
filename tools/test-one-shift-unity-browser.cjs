'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.SHIFT_DUMP || path.join(os.tmpdir(), 'one-shift-unity-browser');
fs.mkdirSync(dump, {recursive: true});
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const body = fs.readFileSync(file); res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Content-Length':body.length}); res.end(body); }
  catch { res.writeHead(404).end(); }
});
const loader = `window.createUnityInstance = function(canvas, config, progress) {
  window.unityConfig = config;
  window.unityCalls = [];
  progress(.42);
  return new Promise(function(resolve) {
    window.finishUnityLoad = function() {
      resolve({Module:{pauseMainLoop:function(){unityCalls.push('loop:pause')},resumeMainLoop:function(){unityCalls.push('loop:resume')},SetRefreshMonitorActive:function(active){unityCalls.push('monitor:'+active)}},
        SendMessage:function(target,method,value){unityCalls.push(target+':'+method+':'+value)},Quit:function(){return Promise.resolve()}});
    };
  });
};`;
const checks = [];
function check(name, value) { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); }
const calls = page => page.evaluate(() => window.unityCalls.slice());
async function clearCalls(page) { await page.evaluate(() => { window.unityCalls.length = 0; }); }
async function finish(page) { await page.evaluate(() => window.finishUnityLoad()); await page.waitForSelector('#warehouse-tools', {state:'visible'}); }
async function realSmoke(browser, url) {
  const sharp = require('sharp');
  const context = await browser.newContext({viewport:{width:1280,height:720}});
  const page = await context.newPage();
  const messages = [], failures = [], requests = [];
  const prefix = 'ONE_SHIFT_STATE ';
  page.on('console', message => {
    messages.push({type:message.type(), text:message.text()});
    if (message.type() === 'error') console.error('BROWSER ' + message.text());
  });
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
  page.on('request', request => { if (request.url().includes('/Build/')) requests.push(request.url()); });
  // Observe the actual loader's returned instance; never replace Unity or its callbacks.
  await page.addInitScript(() => {
    document.addEventListener('load', event => {
      if (event.target.tagName !== 'SCRIPT' || !event.target.src.includes('OneShiftWeb.loader.js')) return;
      const factory = window.createUnityInstance;
      if (typeof factory !== 'function') return;
      window.createUnityInstance = function (...args) {
        return factory.apply(this, args).then(instance => { window.actualUnity = instance; return instance; });
      };
    }, true);
  });
  async function state() {
    const emitted = page.waitForEvent('console', {predicate:message => message.text().includes(prefix), timeout:15000});
    await page.evaluate(() => actualUnity.SendMessage('BrowserLifecycle', 'ReportState', ''));
    const message = (await emitted).text();
    const report = JSON.parse(message.slice(message.indexOf(prefix) + prefix.length).trim());
    console.log('STATE ' + JSON.stringify(report));
    fs.writeFileSync(path.join(dump,'unity-real-latest-state.json'), JSON.stringify(report, null, 2));
    return report;
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
  async function capture(name) {
    const file = path.join(dump, name + '.png');
    const box = await page.locator('#warehouse-canvas').boundingBox();
    await page.screenshot({path:file, clip:box, timeout:60000});
    return file;
  }
  async function holdKey(key, milliseconds) {
    const before = await state();
    await page.keyboard.down(key);
    await delay(milliseconds);
    let after = await state();
    const deadline = Date.now() + 20000;
    while (after.frameCount < before.frameCount + 3 && Date.now() < deadline) {
      await delay(250);
      after = await state();
    }
    await page.keyboard.up(key);
    return after;
  }
  async function animationCallbacks() {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Tracing.start', {categories:'devtools.timeline', transferMode:'ReturnAsStream'});
    await delay(800);
    const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const {stream} = await finished;
    let source = '';
    for (;;) {
      const chunk = await cdp.send('IO.read', {handle:stream});
      source += chunk.data;
      if (chunk.eof) break;
    }
    await cdp.send('IO.close', {handle:stream});
    await cdp.detach();
    return JSON.parse(source).traceEvents.filter(event => event.name === 'FireAnimationFrame').length;
  }
  try {
    await page.goto(process.env.SHIFT_TEST_URL || process.env.SHIFT_REAL_URL || url + '/one-shift.html');
    check('REAL: Build is not fetched before Play', requests.length === 0);
    await page.locator('#warehouse-play').click();
    await page.waitForFunction(() => window.actualUnity && document.getElementById('warehouse-launcher').hidden, null, {timeout:180000});
    check('REAL: Unity exposes native scheduler controls', await page.evaluate(() => typeof actualUnity.Module.pauseMainLoop === 'function' && typeof actualUnity.Module.resumeMainLoop === 'function'));
    check('REAL: Unity exposes its refresh-monitor scheduler control', await page.evaluate(() => typeof actualUnity.Module.SetRefreshMonitorActive === 'function'));
    check('REAL: All four compiled build files loaded', ['.loader.js','.data.unityweb','.framework.js.unityweb','.wasm.unityweb'].every(suffix => requests.some(request => request.includes(suffix))));
    check('REAL: Unity canvas uses WebGL 2', await page.evaluate(() => { const gl = document.getElementById('warehouse-canvas').getContext('webgl2'); return gl && gl.getParameter(gl.VERSION).includes('WebGL 2'); }));
    console.log('RENDERER ' + await page.evaluate(() => {
      const gl = document.getElementById('warehouse-canvas').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
    await page.bringToFront();
    await page.locator('#warehouse-canvas').focus();
    const initial = await state();
    check('REAL: Initial clock starts before sunrise', initial.hour >= 4.5 && initial.hour < 6);
    check('REAL: All three lighting rows start on', initial.rowOn.length === 3 && initial.rowOn.every(Boolean));
    // The loader resolves during Unity's grayscale splash. Wait for colored
    // scene pixels so its logo cannot satisfy the rendered-geometry check.
    let night, coloredFraction = 0;
    const sceneDeadline = Date.now() + 30000;
    do {
      await delay(1000);
      night = await capture('unity-real-night');
      const {data, info} = await sharp(night).extract({left:220,top:170,width:840,height:420}).removeAlpha().raw().toBuffer({resolveWithObject:true});
      let colored = 0;
      for (let i = 0; i < data.length; i += info.channels) if (Math.abs(data[i]-data[i+1]) + Math.abs(data[i+1]-data[i+2]) > 10) colored++;
      coloredFraction = colored / (info.width * info.height);
    } while (coloredFraction < .08 && Date.now() < sceneDeadline);
    check('REAL: Warehouse geometry replaces the Unity splash', coloredFraction > .08);
    const nightState = await state();
    check('REAL: Night scene was captured before sunrise', nightState.hour < 6);
    let morning = initial;
    const dawnDeadline = Date.now() + 120000;
    while (morning.hour < 7 && Date.now() < dawnDeadline) { await delay(750); morning = await state(); }
    check('REAL: Sunrise advances into the working day', morning.hour >= 7 && morning.hour < 9 && morning.frameCount > initial.frameCount);
    await capture('unity-real-morning');
    const activeCallbacks = await animationCallbacks();
    check('REAL: Trace sees active engine animation callbacks', activeCallbacks > 0);

    await page.locator('#warehouse-pause').click();
    const stopped = await state();
    check('REAL: Pause freezes time and reports suspension', stopped.browserSuspended && stopped.timeScale === 0);
    await delay(1500);
    const still = await state();
    check('REAL: Paused engine schedules no new frames', still.frameCount === stopped.frameCount && still.hour === stopped.hour);
    const pausedCallbacks = await animationCallbacks();
    check('REAL: Pause stops every engine animation callback', pausedCallbacks === 0);
    await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
    const retained = await state();
    check('REAL: Focus changes cannot undo manual pause', retained.browserSuspended && retained.frameCount === stopped.frameCount);
    await page.screenshot({path:path.join(dump,'unity-real-paused.png')});
    await page.locator('#warehouse-resume').click();
    await delay(1200);
    const resumed = await state();
    check('REAL: Resume advances the same warehouse', !resumed.browserSuspended && resumed.timeScale > 0 && resumed.frameCount > still.frameCount && resumed.hour > still.hour);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const blurred = await state();
    await delay(750);
    const blurredLater = await state();
    check('REAL: Browser inactivity stops rendering and simulation', blurred.browserSuspended && blurredLater.frameCount === blurred.frameCount && blurredLater.hour === blurred.hour);
    await page.evaluate(() => dispatchEvent(new Event('focus')));
    await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
    const walkingStart = await state();
    const walked = await holdKey('w', 900);
    check('REAL: Keyboard input moves the player', distance(walked.playerPosition, walkingStart.playerPosition) > .3);
    const reset = await holdKey('r', 400);
    check('REAL: R returns to the entrance', distance(reset.playerPosition, initial.playerPosition) < .3);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement);
    await delay(150);
    const released = await state();
    const uncaptured = await holdKey('w', 500);
    check('REAL: Escape releases capture and stops movement input', distance(uncaptured.playerPosition, released.playerPosition) < .05 && !uncaptured.browserSuspended);
    await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
    const recaptured = await holdKey('w', 600);
    check('REAL: Clicking the warehouse restores movement after Escape', distance(recaptured.playerPosition, uncaptured.playerPosition) > .3);
    await page.keyboard.press('Escape');
    await page.locator('#warehouse-fullscreen').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
    check('REAL: Actual player enters wrapper fullscreen', await page.locator('#warehouse-canvas').isVisible());
    await page.evaluate(() => document.exitFullscreen());
    await capture('unity-real-final');
    // Unity's format-capability probes can emit this exact warning before the
    // graphics device is created, even for an empty scene (Unity issue 16927).
    // Keep it in the report; render-time GL warnings remain failures.
    const deviceCreated = messages.findIndex(message => message.text.includes('Creating OpenGL ES 3.0 graphics device'));
    const startupProbeWarnings = messages.filter((message, index) => index < deviceCreated && message.type === 'warning' && message.text === 'WebGL: INVALID_ENUM: getInternalformatParameter: invalid internalformat');
    // The current URP asset disables RenderGraph and runtime debug display.
    // These three bundled shaders serve those inactive paths, but the engine
    // may still report their WebGL incompatibility during shader discovery.
    const unusedShaders = ['Hidden/CoreSRP/CoreCopy', 'Hidden/Universal Render Pipeline/StencilDitherMaskSeed', 'Hidden/Universal/HDRDebugView'];
    const firstState = messages.findIndex(message => message.text.includes(prefix));
    const unusedShaderWarnings = messages.filter((message, index) => index < firstState && message.type === 'log' && unusedShaders.some(name => message.text.trim() === name + ' shader is not supported on this GPU (none of subshaders/fallbacks are suitable)'));
    const shaderFailures = messages.filter(message => !startupProbeWarnings.includes(message) && !unusedShaderWarnings.includes(message) && (message.type === 'error' || /shader.*(?:error|failed|unsupported|not supported)|INVALID_(?:OPERATION|ENUM|VALUE)|GL_INVALID|RuntimeError|memory access out of bounds|WebGL context lost/i.test(message.text)));
    fs.writeFileSync(path.join(dump,'unity-real-states.json'), JSON.stringify({initial,nightState,morning,stopped,still,resumed,blurred,blurredLater,walkingStart,walked,reset,released,uncaptured,recaptured,activeCallbacks,pausedCallbacks}, null, 2));
    if (startupProbeWarnings.length) console.log('KNOWN STARTUP WARNINGS: ' + startupProbeWarnings.length + ' Unity internal-format probes (retained in console report)');
    if (unusedShaderWarnings.length) console.log('UNUSED ENGINE SHADERS: ' + unusedShaderWarnings.map(message => message.text.trim().split(' shader ')[0]).join(', ') + ' (retained in console report)');
    if (shaderFailures.length || failures.length) console.error(JSON.stringify({shaderFailures:shaderFailures.slice(0,5),failures}, null, 2));
    check('REAL: No shader/runtime/request failures', shaderFailures.length === 0 && failures.length === 0);
    console.log(checks.length + ' REAL build checks passed. Captures: ' + dump);
  } finally {
    fs.writeFileSync(path.join(dump,'unity-real-console.json'), JSON.stringify({messages,failures,requests}, null, 2));
  }
}
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const real = process.argv.includes('--real');
  browser = await chromium.launch({headless:true, ...(real ? {channel:process.env.SHIFT_BROWSER_CHANNEL || 'chromium'} : {}), args:[...(real ? ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] : []),'--enable-unsafe-swiftshader']});
  if (process.argv.includes('--real')) { await realSmoke(browser, url); return; }
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/OneShiftWeb.loader.js*', route => { requests++; return route.fulfill({contentType:'text/javascript', body:loader}); });
  await page.goto(url + '/one-shift.html');
  await page.evaluate(() => document.fonts.ready);
  check('Unity is not downloaded before choosing to play', requests === 0);
  check('Original saved game remains directly linked', await page.locator('.warehouse-classic a').getAttribute('href') === 'one-shift-classic.html');
  await page.screenshot({path:path.join(dump,'launcher-desktop.png')});
  await page.locator('#warehouse-play').click();
  await page.waitForFunction(() => typeof finishUnityLoad === 'function');
  check('Progress reports the actual loader callback', await page.locator('#warehouse-progress').getAttribute('value') === '42');
  check('Compressed fallback URLs share the release version', await page.evaluate(() => {
    const urls = ['dataUrl','frameworkUrl','codeUrl'].map(key => new URL(unityConfig[key], location.href));
    return urls.every(url => url.pathname.endsWith('.unityweb') && url.searchParams.get('v')) && new Set(urls.map(url => url.searchParams.get('v'))).size === 1;
  }));
  await finish(page);
  await clearCalls(page);
  await page.locator('#warehouse-pause').click();
  check('Pause suspends Unity before its schedulers', JSON.stringify(await calls(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  await clearCalls(page);
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  check('Focus changes preserve manual pause', (await calls(page)).length === 0 && await page.locator('#warehouse-paused').isVisible());
  await page.locator('#warehouse-resume').click();
  check('Resume restarts the schedulers before Unity', JSON.stringify(await calls(page)) === JSON.stringify(['monitor:true','loop:resume','BrowserLifecycle:SetBrowserActive:1']));
  await clearCalls(page);
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  check('Window blur suspends the engine', JSON.stringify(await calls(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await clearCalls(page);
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  check('Denied mouse capture clears input without starting a pause', JSON.stringify(await calls(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','BrowserLifecycle:SetBrowserActive:1']) && await page.locator('#warehouse-paused').isHidden());
  await clearCalls(page);
  await page.evaluate(() => { document.getElementById('warehouse-stage').style.transform = 'translateX(-200vw)'; });
  await page.waitForFunction(() => unityCalls.includes('loop:pause'));
  check('Leaving the viewport suspends the engine', (await calls(page)).includes('BrowserLifecycle:SetBrowserActive:0'));
  await page.evaluate(() => { document.getElementById('warehouse-stage').style.transform = ''; });
  await page.waitForFunction(() => unityCalls.includes('loop:resume'));
  await page.keyboard.press('p');
  check('P keyboard shortcut pauses the warehouse', await page.locator('#warehouse-paused').isVisible());
  await page.keyboard.press('p');
  await page.locator('#warehouse-help').click();
  check('Controls include switch and rack interaction', (await page.locator('#warehouse-controls').innerText()).includes('rack'));
  await page.locator('#warehouse-close-help').click();
  await page.locator('#warehouse-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
  check('Fullscreen keeps the complete game wrapper', await page.evaluate(() => document.fullscreenElement?.id === 'warehouse-stage'));
  await page.evaluate(() => document.exitFullscreen());

  const mobile = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  const phone = await mobile.newPage();
  let mobileRequests = 0;
  await phone.route('**/OneShiftWeb.loader.js*', route => { mobileRequests++; return route.fulfill({contentType:'text/javascript', body:loader}); });
  await phone.goto(url + '/one-shift.html');
  check('Touch portrait is gated before loading', await phone.locator('#warehouse-rotate').isVisible() && mobileRequests === 0);
  await phone.screenshot({path:path.join(dump,'launcher-portrait.png')});
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Landscape exposes the launcher', await phone.locator('#warehouse-rotate').isHidden());
  await phone.screenshot({path:path.join(dump,'launcher-landscape.png')});
  await phone.locator('#warehouse-play').click();
  await phone.waitForFunction(() => typeof finishUnityLoad === 'function');
  await finish(phone);
  await phone.locator('#warehouse-pause').click();
  await clearCalls(phone);
  await phone.setViewportSize({width:390,height:844});
  await phone.waitForSelector('#warehouse-rotate', {state:'visible'});
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Rotating cannot undo manual pause', await phone.locator('#warehouse-paused').isVisible() && !(await calls(phone)).includes('loop:resume'));

  const failure = await context.newPage();
  await failure.route('**/OneShiftWeb.loader.js*', route => route.abort());
  await failure.goto(url + '/one-shift.html');
  await failure.locator('#warehouse-play').click();
  await failure.waitForSelector('#warehouse-error', {state:'visible'});
  check('Download failure offers a working reload action', await failure.locator('#warehouse-play').isEnabled() && (await failure.locator('#warehouse-play').innerText()).includes('Reload'));
  check('Launcher lifecycle has no uncaught errors', errors.length === 0);
  await page.goto(url + '/one-shift-classic.html');
  await page.waitForFunction(() => !!window.__oneShift, {timeout:20000});
  check('Preserved illustrated game still boots', await page.evaluate(() => !!OneShift.app.sim));
  const sharedLayout = await page.evaluate(() => OneShift.saves.layoutURL(OneShift.app.sim.s));
  await page.goto(sharedLayout.replace('/one-shift-classic.html', '/one-shift.html'));
  await page.waitForURL('**/one-shift-classic.html#layout=*');
  await page.waitForFunction(() => !!window.__oneShift);
  check('Existing shared layout links open their original game', page.url().includes('/one-shift-classic.html#layout='));
  await page.goto(url + '/archive.html');
  const card = page.locator('a.article-item[href="one-shift.html"]');
  await card.scrollIntoViewIfNeeded();
  await card.locator('img').evaluate(image => image.decode());
  check('In Progress keeps the warehouse at its original URL', (await card.locator('.article-item-description').innerText()).includes('three wall switches'));
  check('The card loads the new Unity warehouse thumbnail', await card.locator('img').evaluate(image => image.naturalWidth === 1200 && image.currentSrc.includes('one-shift-unity')));
  await card.screenshot({path:path.join(dump,'archive-card.png')});
  console.log(checks.length + ' checks passed. Captures: ' + dump);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
