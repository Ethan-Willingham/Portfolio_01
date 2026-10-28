'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const {classifyUnityConsole} = require('./one-shift-unity-console.cjs');
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
  window.unityRequestedMode = window.warehouseRequestedMode;
  window.unityCalls = [];
  window.reportUnityProgress = progress;
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
async function finish(page) {
  await page.evaluate(() => { unityConfig.onOneShiftPreparation(7, 7, 1); finishUnityLoad(); });
  await page.waitForSelector('#warehouse-tools', {state:'visible'});
}
async function realSmoke(browser, url) {
  const sharp = require('sharp');
  const context = await browser.newContext({viewport:{width:1280,height:720}, deviceScaleFactor:Number(process.env.SHIFT_TEST_DPR || 2)});
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
    window.warehousePointerEvents = [];
    ['pointerlockchange','pointerlockerror'].forEach(type => document.addEventListener(type, () => {
      warehousePointerEvents.push({type,at:performance.now(),locked:document.pointerLockElement?.id || '',focused:document.activeElement?.id || ''});
    }));
    document.addEventListener('load', event => {
      if (event.target.tagName !== 'SCRIPT' || !event.target.src.includes('OneShiftWeb.loader.js')) return;
      const factory = window.createUnityInstance;
      if (typeof factory !== 'function') return;
      window.createUnityInstance = function (...args) {
        return factory.apply(this, args).then(instance => { window.actualUnity = instance; return instance; });
      };
    }, true);
  });
  if (process.argv.includes('--display')) await page.addInitScript(() => {
    window.warehouseBadTextureTargets = [];
    const original = WebGL2RenderingContext.prototype.bindTexture;
    WebGL2RenderingContext.prototype.bindTexture = function(target, texture) {
      if (![3553,34067,32879,35866].includes(target) && warehouseBadTextureTargets.length < 20)
        warehouseBadTextureTargets.push({target,stack:new Error().stack});
      return original.call(this, target, texture);
    };
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
    await page.screenshot({path:file, clip:box, scale:'css', timeout:60000});
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
  async function pollState(label, predicate, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let latest;
    do {
      latest = await state();
      if (predicate(latest)) return latest;
      await delay(100);
    } while (Date.now() < deadline);
    throw new Error(label + ' timed out: ' + JSON.stringify(latest));
  }
  async function keyUntil(key, label, predicate, timeout) {
    await page.keyboard.down(key);
    try { return await pollState(label, predicate, timeout); }
    finally { await page.keyboard.up(key); }
  }
  async function pressForFrames(key, label, predicate = () => true) {
    const before = await state();
    return keyUntil(key, label, current => current.frameCount >= before.frameCount + 3 && predicate(current));
  }
  let mouseX = 600, mouseY = 400;
  async function moveLeverTo(target, tolerance = .025) {
    // Calibrate by reading the actual lever after native relative mouse events.
    // CSS pixels, device pixels and Unity's input-axis sensitivity can differ.
    const deadline = Date.now() + 12000;
    let current = await state();
    while (Math.abs(current.forkliftSlider - target) > tolerance) {
      if (Date.now() > deadline) throw new Error('Lever did not reach ' + target + ': ' + JSON.stringify(current));
      if (!current.forkliftAssistActive) throw new Error('Held lever was interrupted: ' + JSON.stringify(current));
      const difference = target - current.forkliftSlider;
      mouseY -= Math.sign(difference) * Math.min(12, Math.max(1, Math.abs(difference) * 80));
      await page.mouse.move(mouseX, mouseY);
      await delay(35);
      current = await state();
    }
    return current;
  }
  async function mouseLiftUntil(direction, label, predicate, timeout = 15000) {
    await page.keyboard.down('ShiftLeft');
    try {
      await pollState('Open the centred hydraulic lever', current => current.forkliftAssistActive && Math.abs(current.forkliftSlider) < .01);
      await moveLeverTo(direction * .72);
      // The pointer now stays still. A displaced lever requests persistent
      // speed, so neither keyboard hydraulics nor repeated mouse motion help.
      return await pollState(label, predicate, timeout);
    } finally { await page.keyboard.up('ShiftLeft'); }
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
    await page.locator('#warehouse-sandbox').click();
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
    check('REAL: Compiled sandbox player reports version 9 and SMAA', initial.buildVersion === 9 && initial.cameraAntialiasing === 'SubpixelMorphologicalAntiAliasing' && initial.pipelineMsaaSamples === 2);
    check('REAL: Compiled player applies the bounded twelve-fixture shadow budget',
      initial.fixtureShadowAtlas === 1024 && initial.fixtureShadowLow === 128 && initial.fixtureShadowHigh === 512 &&
      Array.isArray(initial.fixtureShadowTiers) && initial.fixtureShadowTiers.length === 12 &&
      initial.fixtureShadowTiers.filter(tier => tier === 2).length === 3 &&
      initial.fixtureShadowTiers.filter(tier => tier === 0).length === 9);
    await page.waitForFunction(() => document.getElementById('warehouse-stats').dataset.buildVersion === '9' && Number(document.getElementById('warehouse-stats').dataset.fps) > 0);
    check('REAL: Player frame telemetry stays available without cluttering the default view', await page.locator('#warehouse-stats').isHidden());
    check('REAL: Warehouse begins with a four-pallet delivery and closed receiving doors', initial.receivingTotal === 4 && initial.receivingPhase === 'Arriving' && !initial.receivingDoorsOpen);
    check('REAL: Walking and running use the faster starting speeds', Math.abs(initial.playerWalkSpeed - 2.8) < .01 && Math.abs(initial.playerRunSpeed - 5.4) < .01);
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
    // Native WheelCollider creation can replace values assigned before the
    // first physics step. Inspect the exported player after it has run, rather
    // than accepting prefab values or the loader's first reported frame.
    const physicsState = await pollState('Wait for running forklift physics', current =>
      current.frameCount >= initial.frameCount + 15 && !current.browserSuspended &&
      current.timeScale > 0 && current.forkliftGrounded >= 3);
    check('REAL: Exported physics uses the calibrated 0.005 second timestep',
      Number.isFinite(physicsState.fixedDeltaTime) && Math.abs(physicsState.fixedDeltaTime - .005) < .000001);
    const expectedSprungMasses = [798.2456, 798.2456, 1011.7544, 1011.7544];
    check('REAL: Running tires retain their complete-truck supported masses',
      Array.isArray(physicsState.forkliftSprungMasses) && physicsState.forkliftSprungMasses.length === 4 &&
      physicsState.forkliftSprungMasses.every((mass, index) => Number.isFinite(mass) && Math.abs(mass - expectedSprungMasses[index]) < 2));
    if (process.argv.includes('--display')) {
      const messageStart = messages.length;
      const buffer = () => page.locator('#warehouse-canvas').evaluate(c => [c.width,c.height]);
      async function openSettings() {
        await page.keyboard.press('Escape');
        await page.locator('#warehouse-paused [data-screen="settings"]').click();
      }
      async function resumeFrames(label) {
        const before = await state();
        await page.locator('#warehouse-menu-back').click();
        await page.locator('#warehouse-resume').click();
        await pollState(label, current => !current.browserSuspended && current.frameCount >= before.frameCount + 40);
        await delay(250);
      }
      await openSettings();
      const originalBuffer = await buffer();
      await page.locator('#warehouse-fullscreen').click();
      await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
      await delay(200);
      check('DISPLAY: Fullscreen preserves the paused Unity drawing buffer', JSON.stringify(await buffer()) === JSON.stringify(originalBuffer));
      await page.locator('#warehouse-fullscreen').click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await delay(200);
      await resumeFrames('Resume after a paused fullscreen round trip');
      await capture('unity-display-windowed');
      await openSettings();
      await page.locator('#warehouse-fullscreen').click();
      await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
      await resumeFrames('Render the actual warehouse in fullscreen');
      await capture('unity-display-fullscreen');
      await openSettings();
      await page.locator('#warehouse-fullscreen').click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await resumeFrames('Return from fullscreen to the original window');
      await capture('unity-display-returned');
      const graphicsWarnings = messages.slice(messageStart).filter(message => message.type === 'error' || /INVALID_(?:OPERATION|ENUM|VALUE|FRAMEBUFFER_OPERATION)|GL_INVALID|RuntimeError|memory access out of bounds|WebGL context lost/i.test(message.text));
      if (graphicsWarnings.length) console.error(JSON.stringify(graphicsWarnings.slice(0,8)));
      check('DISPLAY: Fullscreen transitions resume without graphics or page failures', graphicsWarnings.length === 0 && failures.length === 0);
      console.log(checks.length + ' display checks passed. Captures: ' + dump);
      return;
    }
    let morning = initial;
    const dawnDeadline = Date.now() + 120000;
    while (morning.hour < 7 && Date.now() < dawnDeadline) { await delay(750); morning = await state(); }
    check('REAL: Sunrise advances into the working day', morning.hour >= 7 && morning.hour < 9 && morning.frameCount > initial.frameCount);
    await capture('unity-real-morning');
    const renderStart = await state();
    const renderClock = performance.now();
    await delay(5000);
    const renderEnd = await state();
    const renderSeconds = (performance.now() - renderClock) / 1000;
    const performanceReport = {seconds:renderSeconds, frames:renderEnd.frameCount - renderStart.frameCount,
      framesPerSecond:(renderEnd.frameCount - renderStart.frameCount) / renderSeconds,
      viewport:await page.evaluate(() => { const c = document.getElementById('warehouse-canvas'); return {width:c.width,height:c.height,devicePixelRatio}; })};
    fs.writeFileSync(path.join(dump, 'unity-real-performance.json'), JSON.stringify(performanceReport, null, 2));
    console.log('PERFORMANCE ' + JSON.stringify(performanceReport));
    check('REAL: Smooth mode bounds the actual Retina drawing buffer', performanceReport.viewport.width * performanceReport.viewport.height <= 1920 * 1080);
    const deliveryReady = await pollState('Truck completes the service-road route and opens its receiving doors', current => current.receivingDoorsOpen, 120000);
    // The loader can resolve before MonoBehaviour.Start moves the parked
    // authoring pose into its arrival lane. Compare two running physics states.
    check('REAL: Delivery truck travels from the service road into the dock', distance(physicsState.receivingTruckPosition, deliveryReady.receivingTruckPosition) > 8);
    check('REAL: Opening the doors leaves all four pallets for the player to unload', deliveryReady.receivingUnloaded === 0 && deliveryReady.receivingStored === 0);
    await capture('unity-real-delivery-ready');
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
    const orientation = await context.newCDPSession(page);
    try {
      await orientation.send('Emulation.setTouchEmulationEnabled', {enabled:true,maxTouchPoints:1});
      await page.setViewportSize({width:390,height:844});
      await page.waitForSelector('#warehouse-rotate', {state:'visible'});
      check('REAL: Portrait touch gate covers the paused player and its menu', await page.locator('#warehouse-menu').isHidden() && (await state()).browserSuspended);
      await page.setViewportSize({width:844,height:390});
      await page.waitForSelector('#warehouse-rotate', {state:'hidden'});
      const landscapePaused = await state();
      check('REAL: Returning to landscape cannot undo manual pause', await page.locator('#warehouse-paused').isVisible() && landscapePaused.browserSuspended && landscapePaused.frameCount === stopped.frameCount);
    } finally {
      await orientation.send('Emulation.setTouchEmulationEnabled', {enabled:false});
      await page.setViewportSize({width:1280,height:720});
      await orientation.detach();
    }
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
    await page.keyboard.down('w');
    await delay(400);
    await page.keyboard.up('w');
    const uncaptured = await state();
    check('REAL: Escape opens the menu, releases capture and stops movement', distance(uncaptured.playerPosition, released.playerPosition) < .05 && uncaptured.browserSuspended && await page.locator('#warehouse-paused').isVisible());
    await page.locator('#warehouse-resume').click();
    await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
    await pollState('Resume walking controls after neutral frames', current => !current.browserSuspended && current.frameCount >= uncaptured.frameCount + 3);
    const recaptured = await holdKey('w', 600);
    check('REAL: Resume restores mouse and walking controls after Escape', distance(recaptured.playerPosition, uncaptured.playerPosition) > .3);

    // Exercise the compiled forklift through the same keyboard and mouse
    // controls as a player. ReportState is read-only; no test teleports or
    // controller method calls bypass the interaction and physics paths.
    const forkliftStates = {};
    forkliftStates.walkingReset = await pressForFrames('r', 'Reset walking position', current => distance(current.playerPosition, initial.playerPosition) < .3);
    check('REAL: Yellow forklift exists as a settled physical vehicle',
      forkliftStates.walkingReset.forkliftPosition?.length === 3 &&
      forkliftStates.walkingReset.forkliftGrounded >= 3 &&
      forkliftStates.walkingReset.forkliftUp[1] > .95);
    const parkingPosition = forkliftStates.walkingReset.forkliftPosition;
    const groundDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    forkliftStates.approach = await keyUntil('w', 'Walk within forklift reach', current =>
      groundDistance(current.playerPosition, current.forkliftPosition) < 2.25);
    forkliftStates.training = await pressForFrames('e', 'Open forklift familiarisation', current => current.forkliftTraining);
    check('REAL: First E starts hands-on familiarisation on the parked forklift', forkliftStates.training.forkliftTraining && forkliftStates.training.forkliftTrainingStep === 'brake' && forkliftStates.training.forkliftDriving && forkliftStates.training.forkliftThrottle === 0);
    await pollState('Release entry key and capture the driver controls', current => current.forkliftCaptured);
    await delay(350);
    forkliftStates.entryNeutral = await state();
    check('REAL: Walking-to-driver handoff retains native capture through neutral frames', forkliftStates.entryNeutral.forkliftCaptured && !forkliftStates.entryNeutral.browserSuspended && await page.evaluate(() => document.pointerLockElement?.id === 'warehouse-canvas'));
    await capture('unity-real-forklift-training');
    forkliftStates.trainingBrake = await keyUntil('Space', 'Perform the training brake check', current => current.forkliftTrainingStep === 'lift');
    await page.keyboard.down('ShiftLeft');
    try {
      await pollState('Open hydraulic lever for familiarisation', current => current.forkliftAssistActive);
      await moveLeverTo(.72);
      forkliftStates.trainingLift = await pollState('Lift the actual empty forks for familiarisation', current => current.forkliftTrainingStep === 'center');
      const movingLeverFrame = forkliftStates.trainingLift.frameCount;
      forkliftStates.trainingFlow = await pollState('Stationary off-centre lever keeps the forks moving', current => current.frameCount >= movingLeverFrame + 18);
      check('REAL: A stationary off-centre lever requests persistent hydraulic speed', forkliftStates.trainingFlow.forkliftMouseLiftInput > .1 && forkliftStates.trainingFlow.forkliftLiftHeight > forkliftStates.trainingLift.forkliftLiftHeight + .01);
      forkliftStates.trainingCentered = await moveLeverTo(0, .04);
      const centreFrame = forkliftStates.trainingCentered.frameCount;
      forkliftStates.trainingHeld = await pollState('Hold the centred lever before releasing it', current => current.frameCount > centreFrame + 18);
      check('REAL: Centre deadzone holds the hydraulic height while Shift remains held', forkliftStates.trainingHeld.forkliftMouseLiftInput === 0 && Math.abs(forkliftStates.trainingHeld.forkliftLiftHeight - forkliftStates.trainingCentered.forkliftLiftHeight) < .03);
    } finally { await page.keyboard.up('ShiftLeft'); }
    forkliftStates.entered = await pollState('Release the centred lever to finish familiarisation', current => current.forkliftDriving && current.forkliftCaptured && !current.forkliftTraining);
    check('REAL: Brake, lift, centre and release complete hands-on familiarisation', forkliftStates.entered.forkliftTrainingStep === 'complete' && forkliftStates.entered.forkliftThrottle === 0);
    await keyUntil('z', 'Lower empty forks to the original pickup height', current => current.forkliftLiftHeight < .09);
    check('REAL: Driver starts in the rear chase view', forkliftStates.entered.forkliftCabView === false);
    await capture('unity-real-forklift-chase');
    forkliftStates.cab = await pressForFrames('c', 'Switch to forklift cab', current => current.forkliftCabView);
    await capture('unity-real-forklift-cab');
    forkliftStates.chase = await pressForFrames('c', 'Restore forklift chase camera', current => !current.forkliftCabView);
    check('REAL: C switches between the cab and chase cameras', forkliftStates.cab.forkliftCabView && !forkliftStates.chase.forkliftCabView);

    await page.keyboard.down('b');
    try {
      forkliftStates.approachDock = await keyUntil('w', 'Creep along the receiving aisle', current => current.forkliftPosition[2] > 9.6, 45000);
    } finally { await page.keyboard.up('b'); }
    await keyUntil('Space', 'Stop before the first pallet', current => Math.abs(current.forkliftSignedSpeed) < .04);
    await pollState('Release brake before mouse control', current => current.forkliftThrottle === 0);
    const beforeMouse = await state();
    const palletBeforeGuide = beforeMouse.receivingFirstPallet;
    await page.keyboard.down('ShiftLeft');
    try {
      const heldStill = await pollState('Hold Left Shift with the mouse still', current => current.forkliftForkViewActive && current.frameCount > beforeMouse.frameCount + 30);
      check('REAL: Left Shift opens a centred lever without driving or lifting', heldStill.forkliftThrottle === 0 && heldStill.forkliftMouseLiftInput === 0 && Math.abs(heldStill.forkliftSlider) < .01 && Math.abs(heldStill.forkliftLiftHeight - beforeMouse.forkliftLiftHeight) < .02 && distance(heldStill.forkliftPosition, beforeMouse.forkliftPosition) < .06);
      check('REAL: The actual HTML hydraulic lever appears only while held', await page.locator('#warehouse-hydraulics').isVisible() && await page.locator('#warehouse-fork-speed').innerText() === 'Neutral');
      await capture('unity-real-fork-placement-through-mast');
      await page.keyboard.down('b');
      try { forkliftStates.inserted = await keyUntil('w', 'Position forks manually inside the first pallet', current => current.forkliftPosition[2] > 12.31, 30000); }
      finally { await page.keyboard.up('b'); }
      await keyUntil('Space', 'Stop with forks inserted', current => Math.abs(current.forkliftSignedSpeed) < .04);
      const inserted = await state();
      check('REAL: WASD remains manual while Left Shift reveals the actual pallet and forks', inserted.forkliftForkViewActive && inserted.forkliftForkViewTarget.length > 0 && inserted.forkliftMouseLiftInput === 0);
      await capture('unity-real-forks-in-pallet');
    } finally { await page.keyboard.up('ShiftLeft'); }
    forkliftStates.mousePickup = await mouseLiftUntil(1, 'Mouse up raises the pallet through contact', current => current.receivingFirstPallet[1] > palletBeforeGuide[1] + .10 && current.forkliftLiftHeight > .28);
    const releasedMouse = await pollState('Releasing Left Shift recentres and clears the hydraulic input', current => !current.forkliftAssistActive && current.forkliftLiftInput === 0 && current.forkliftSlider === 0);
    // The loaded mast, chain and carriage are physical joints. Bound their
    // release transient separately from the subsequent steady hold, rather
    // than treating the instant the valve closes as a settled rigid height.
    const restingMouse = await pollState('Loaded forks settle after the valve closes', current => current.frameCount >= releasedMouse.frameCount + 60);
    const heldMouse = await pollState('Loaded forks retain their settled height', current => current.frameCount >= restingMouse.frameCount + 60);
    check('REAL: Mouse up physically lifts the delivery pallet and release holds it',
      Math.abs(restingMouse.forkliftLiftHeight - releasedMouse.forkliftLiftHeight) <= .06 &&
      Math.abs(heldMouse.forkliftLiftHeight - restingMouse.forkliftLiftHeight) < .02 &&
      heldMouse.forkliftLiftInput === 0 && heldMouse.forkliftSlider === 0 &&
      heldMouse.receivingFirstPallet[1] > palletBeforeGuide[1] + .08);
    await capture('unity-real-first-pallet-lifted');
    forkliftStates.unloaded = await keyUntil('s', 'Reverse the pallet into the warehouse', current => current.receivingUnloaded > 0 && current.forkliftPosition[2] < 7, 30000);
    await keyUntil('Space', 'Stop with the pallet on the forks', current => Math.abs(current.forkliftSignedSpeed) < .04);
    forkliftStates.mouseSetdown = await mouseLiftUntil(-1, 'Mouse down lowers the pallet to the receiving floor', current => current.forkliftLiftHeight < .09 && current.receivingFirstPallet[1] < .08);
    const floorPallet = forkliftStates.mouseSetdown.receivingFirstPallet;
    forkliftStates.withdraw = await keyUntil('s', 'Withdraw from the grounded pallet', current => current.forkliftPosition[2] < 4.5, 15000);
    await keyUntil('Space', 'Stop after unloading', current => Math.abs(current.forkliftSignedSpeed) < .04);
    check('REAL: Set-down cargo stays on the warehouse floor after fork withdrawal', distance((await state()).receivingFirstPallet, floorPallet) < .12);
    await capture('unity-real-first-pallet-unloaded');
    await keyUntil('r', 'Return forklift to its bay for control checks', current => current.forkliftParked && groundDistance(current.forkliftPosition, parkingPosition) < .1, 25000);
    await pressForFrames('f', 'Release parking after recovery', current => !current.forkliftParked);

    forkliftStates.handlingPark = await pressForFrames('f', 'Park for hydraulic controls', current => current.forkliftParked);
    const loweredHeight = forkliftStates.handlingPark.forkliftLiftHeight;
    forkliftStates.raised = await keyUntil('q', 'Raise the physical forks', current => current.forkliftLiftHeight > loweredHeight + .45);
    check('REAL: Q raises the physical fork carriage', forkliftStates.raised.forkliftLiftInput > .5 && forkliftStates.raised.forkliftLiftHeight > loweredHeight + .45);
    forkliftStates.liftReleased = await pollState('Release hydraulic lever', current => current.forkliftLiftInput === 0);
    const releaseFrame = forkliftStates.liftReleased.frameCount;
    forkliftStates.liftHeld = await pollState('Hold raised fork height', current => current.frameCount >= releaseFrame + 25);
    check('REAL: Releasing Q holds the carriage', Math.abs(forkliftStates.liftHeld.forkliftLiftHeight - forkliftStates.liftReleased.forkliftLiftHeight) < .06);
    await capture('unity-real-forklift-raised');
    // Tilt while raised so the fork tips have clearance above the floor.
    forkliftStates.tilted = await keyUntil('t', 'Tilt the mast forward', current => current.forkliftTiltDegrees > 2);
    check('REAL: T tilts the physical mast forward', forkliftStates.tilted.forkliftTiltInput > .5);
    forkliftStates.tiltBack = await keyUntil('g', 'Tilt the mast back to level', current => current.forkliftTiltDegrees < .35);
    check('REAL: G tilts the physical mast back', forkliftStates.tiltBack.forkliftTiltInput < -.5);
    await pollState('Release tilt control', current => current.forkliftTiltInput === 0);
    forkliftStates.lowered = await keyUntil('z', 'Lower the physical forks', current => current.forkliftLiftHeight < loweredHeight + .04);
    check('REAL: Z lowers the physical fork carriage', forkliftStates.lowered.forkliftLiftInput < -.5);
    await pressForFrames('f', 'Release parking for driving', current => !current.forkliftParked);

    forkliftStates.forward = await keyUntil('w', 'Accelerate the forklift forward', current =>
      current.forkliftSignedSpeed > .85 && groundDistance(current.forkliftPosition, forkliftStates.entered.forkliftPosition) > .25);
    check('REAL: W drives the physical forklift forward', forkliftStates.forward.forkliftThrottle > .5 && forkliftStates.forward.forkliftSignedSpeed > .85);
    forkliftStates.braked = await keyUntil('Space', 'Stop the forklift with the service brake', current => Math.abs(current.forkliftSignedSpeed) < .06);
    check('REAL: Space brakes the moving forklift to a stop', Math.abs(forkliftStates.braked.forkliftSignedSpeed) < .06);
    forkliftStates.reverse = await keyUntil('s', 'Reverse the forklift', current =>
      current.forkliftSignedSpeed < -.6 && groundDistance(current.forkliftPosition, forkliftStates.braked.forkliftPosition) > .15);
    check('REAL: S reverses through the vehicle powertrain', forkliftStates.reverse.forkliftThrottle < -.5 && forkliftStates.reverse.forkliftSignedSpeed < -.6);
    forkliftStates.reverseStop = await keyUntil('Space', 'Brake after reversing', current => Math.abs(current.forkliftSignedSpeed) < .06);
    forkliftStates.rearSteer = await keyUntil('d', 'Turn the rear steering wheels', current => current.forkliftSteer < -35);
    check('REAL: Right steering turns the rear wheels in the correct opposite direction', forkliftStates.rearSteer.forkliftSteer < -35);
    await page.keyboard.down('d');
    try {
      forkliftStates.turn = await keyUntil('w', 'Drive through a rear-steered turn', current =>
        current.forkliftSignedSpeed > .45 && Math.abs(current.forkliftPosition[0] - forkliftStates.rearSteer.forkliftPosition[0]) > .08);
    } finally { await page.keyboard.up('d'); }
    check('REAL: Steering changes the moving truck path', Math.abs(forkliftStates.turn.forkliftPosition[0] - forkliftStates.rearSteer.forkliftPosition[0]) > .08);
    forkliftStates.turnStop = await keyUntil('Space', 'Brake after turning', current => Math.abs(current.forkliftSignedSpeed) < .06);
    forkliftStates.recovered = await keyUntil('r', 'Explicitly recover to the parking bay', current =>
      current.forkliftParked && groundDistance(current.forkliftPosition, parkingPosition) < .1, 25000);
    check('REAL: Holding R explicitly restores the stopped truck to its parking bay', forkliftStates.recovered.forkliftParked && groundDistance(forkliftStates.recovered.forkliftPosition, parkingPosition) < .1);
    await pollState('Release recovery input', current => current.forkliftCaptured);
    forkliftStates.unparked = await pressForFrames('f', 'Release forklift parking brake', current => !current.forkliftParked);

    await page.keyboard.down('w');
    await page.keyboard.down('q');
    try {
      forkliftStates.beforePause = await pollState('Accelerate before held-input pause', current => current.forkliftSignedSpeed > .5 && current.forkliftThrottle > .5 && current.forkliftLiftInput > .5);
      await page.keyboard.press('p');
      forkliftStates.paused = await state();
      check('REAL: Pausing while driving clears held throttle and capture', forkliftStates.paused.browserSuspended && forkliftStates.paused.timeScale === 0 && forkliftStates.paused.forkliftThrottle === 0 && !forkliftStates.paused.forkliftCaptured);
      check('REAL: Pausing clears held hydraulic levers', forkliftStates.paused.forkliftLiftInput === 0 && forkliftStates.paused.forkliftTiltInput === 0);
      await delay(300);
      forkliftStates.pausedLater = await state();
      check('REAL: Paused forklift physics and rendering stay frozen',
        forkliftStates.pausedLater.frameCount === forkliftStates.paused.frameCount &&
        distance(forkliftStates.pausedLater.forkliftPosition, forkliftStates.paused.forkliftPosition) < .0001);
      check('REAL: Paused hydraulic bodies stay frozen', Math.abs(forkliftStates.pausedLater.forkliftLiftHeight - forkliftStates.paused.forkliftLiftHeight) < .0001);
      await page.keyboard.press('p');
      forkliftStates.resumed = await pollState('Resume forklift simulation', current => !current.browserSuspended && current.frameCount > forkliftStates.paused.frameCount);
      check('REAL: Resume preserves the driver and rejects held controls', forkliftStates.resumed.forkliftDriving && forkliftStates.resumed.forkliftThrottle === 0);
      await page.evaluate(() => dispatchEvent(new Event('blur')));
      forkliftStates.activityReleased = await state();
      check('REAL: Inactivity releases the automatically resumed mouse capture', !forkliftStates.activityReleased.forkliftCaptured && forkliftStates.activityReleased.browserSuspended);
      await page.evaluate(() => dispatchEvent(new Event('focus')));
      await page.locator('#warehouse-canvas').focus();
      // Browser focus return does not recapture the pointer. Repeat held keys
      // after the input reset; the fresh click must still wait for neutral.
      await page.keyboard.down('w');
      await page.keyboard.down('q');
      await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
      const resumeFrame = forkliftStates.resumed.frameCount;
      forkliftStates.heldOnRecapture = await pollState('Observe neutral gate after recapture', current => current.frameCount >= resumeFrame + 5);
      check('REAL: A held throttle cannot drive immediately after recapture', forkliftStates.heldOnRecapture.forkliftThrottle === 0 && !forkliftStates.heldOnRecapture.forkliftCaptured);
      check('REAL: Held hydraulics cannot resume after recapture', forkliftStates.heldOnRecapture.forkliftLiftInput === 0);
    } finally { await page.keyboard.up('w'); await page.keyboard.up('q'); }
    forkliftStates.neutral = await pollState('Release held throttle to enable driving', current => current.forkliftCaptured && current.forkliftThrottle === 0);
    forkliftStates.freshThrottle = await keyUntil('w', 'Drive after a fresh throttle press', current => current.forkliftThrottle > .5 && current.forkliftSignedSpeed > .6);
    check('REAL: Releasing and pressing throttle restores normal driving', forkliftStates.neutral.forkliftCaptured && forkliftStates.freshThrottle.forkliftSignedSpeed > .6);
    forkliftStates.exitStop = await state();
    forkliftStates.exited = await pressForFrames('e', 'E brakes and steps out of the moving forklift', current => !current.forkliftDriving);
    check('REAL: E brakes, restores walking and leaves the forklift parked', !forkliftStates.exited.forkliftDriving && forkliftStates.exited.forkliftParked && Math.abs(forkliftStates.exited.forkliftSignedSpeed) < .3 && groundDistance(forkliftStates.exited.playerPosition, forkliftStates.exited.forkliftPosition) < 3);
    forkliftStates.walkingAgain = await keyUntil('w', 'Walk after leaving the forklift', current => distance(current.playerPosition, forkliftStates.exited.playerPosition) > .3);
    check('REAL: Walking controls work after leaving the truck', distance(forkliftStates.walkingAgain.playerPosition, forkliftStates.exited.playerPosition) > .3);
    await pressForFrames('r', 'Return to entrance for yard access', current => distance(current.playerPosition, initial.playerPosition) < .3);
    // The entrance view faces east. Strafe north to a clear cross-aisle,
    // then walk east to the separate yard doorway, avoiding the parked truck.
    await keyUntil('a', 'Walk north along the warehouse floor', current => current.playerPosition[2] > 6, 15000);
    const yardDoorApproach = await keyUntil('w', 'Reach the yard doorway aisle', current => current.playerPosition[0] > 8.45, 15000);
    forkliftStates.yard = await keyUntil('a', 'Walk through the yard door and down the ramp', current => current.playerPosition[2] > 39, 25000);
    check('REAL: The separate yard door and ramp reach the parking lot', forkliftStates.yard.playerPosition[1] < -1.1);
    // The authored entrance view is slightly angled toward the forklift.
    // Measure the actual walking direction so the return follows the ramp's
    // centre line instead of assuming an exactly cardinal camera heading.
    const northSlope = (forkliftStates.yard.playerPosition[0] - yardDoorApproach.playerPosition[0]) /
      (forkliftStates.yard.playerPosition[2] - yardDoorApproach.playerPosition[2]);
    await keyUntil('s', 'Walk around the front of the parked road truck', current => current.playerPosition[0] < -15, 20000);
    await keyUntil('d', 'Walk alongside the original eighteen-wheeler', current => current.playerPosition[2] < 25, 15000);
    await capture('unity-real-parking-lot');
    await keyUntil('a', 'Return around the front of the parked road truck', current => current.playerPosition[2] > 39, 15000);
    await keyUntil('w', 'Align the return path with the yard doorway', current =>
      current.playerPosition[0] + northSlope * (11 - current.playerPosition[2]) > 8.6, 20000);
    forkliftStates.fromYard = await keyUntil('d', 'Walk back up the ramp into the warehouse', current => current.playerPosition[2] < 10.6, 25000);
    check('REAL: The yard route returns to the warehouse without reset or jumping', Math.abs(forkliftStates.fromYard.playerPosition[1] - initial.playerPosition[1]) < .1);
    fs.writeFileSync(path.join(dump, 'unity-real-forklift-states.json'), JSON.stringify(forkliftStates, null, 2));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#warehouse-paused', {state:'visible'});
    await page.locator('#warehouse-help').click();
    await page.locator('[data-help-tab="forklift"]').click();
    check('REAL: Controls open from the pause menu while gameplay stays frozen', await page.locator('#warehouse-help-forklift').isVisible() && (await state()).browserSuspended);
    await page.screenshot({path:path.join(dump,'unity-real-controls.png'),scale:'css'});
    await page.locator('#warehouse-close-help').click();
    await page.locator('#warehouse-paused [data-screen="settings"]').click();
    await page.locator('#warehouse-show-stats').check();
    await page.locator('#warehouse-fullscreen').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
    check('REAL: Actual player enters wrapper fullscreen', await page.locator('#warehouse-canvas').isVisible());
    await page.evaluate(() => document.exitFullscreen());
    await page.locator('#warehouse-menu-back').click();
    await page.locator('#warehouse-resume').click();
    check('REAL: Optional performance readout can be enabled from Settings', await page.locator('#warehouse-stats').isVisible());
    await capture('unity-real-final');
    const {startupProbeWarnings,unusedShaderWarnings,shaderFailures} = classifyUnityConsole(messages, prefix);
    fs.writeFileSync(path.join(dump,'unity-real-states.json'), JSON.stringify({initial,nightState,physicsState,morning,stopped,still,resumed,blurred,blurredLater,walkingStart,walked,reset,released,uncaptured,recaptured,activeCallbacks,pausedCallbacks}, null, 2));
    if (startupProbeWarnings.length) console.log('KNOWN STARTUP WARNINGS: ' + startupProbeWarnings.length + ' Unity internal-format probes (retained in console report)');
    if (unusedShaderWarnings.length) console.log('UNUSED ENGINE SHADERS: ' + unusedShaderWarnings.map(message => message.text.trim().split(' shader ')[0]).join(', ') + ' (retained in console report)');
    if (shaderFailures.length || failures.length) console.error(JSON.stringify({shaderFailures:shaderFailures.slice(0,5),failures}, null, 2));
    check('REAL: No shader/runtime/request failures', shaderFailures.length === 0 && failures.length === 0);
    console.log(checks.length + ' REAL build checks passed. Captures: ' + dump);
  } catch (error) {
    await page.screenshot({path:path.join(dump,'unity-real-failure.png'), scale:'css', timeout:5000}).catch(() => {});
    throw error;
  } finally {
    const pointerEvents = await page.evaluate(() => window.warehousePointerEvents || []).catch(() => []);
    const badTextureTargets = await page.evaluate(() => window.warehouseBadTextureTargets || []).catch(() => []);
    fs.writeFileSync(path.join(dump,'unity-real-console.json'), JSON.stringify({messages,failures,requests,pointerEvents,badTextureTargets}, null, 2));
  }
}
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const real = process.argv.includes('--real') || process.argv.includes('--display');
  browser = await chromium.launch({headless:true, ...(real ? {channel:process.env.SHIFT_BROWSER_CHANNEL || 'chromium'} : {}), args:[...(real ? ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] : []),'--enable-unsafe-swiftshader']});
  if (real) { await realSmoke(browser, url); return; }

  const context = await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:2});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/OneShiftWeb.loader.js*', route => { requests++; return route.fulfill({contentType:'text/javascript', body:loader}); });
  const lifecycle = async p => (await calls(p)).filter(call => !call.includes(':UICommand:'));
  const command = async (p, action) => (await calls(p)).some(call => call.includes(':UICommand:') && JSON.parse(call.split(':UICommand:')[1]).action === action);
  async function mockPage(ctx = context) {
    const p = await ctx.newPage();
    p.on('pageerror', error => errors.push(error.message));
    await p.route('**/OneShiftWeb.loader.js*', route => route.fulfill({contentType:'text/javascript', body:loader}));
    await p.goto(url + '/one-shift.html');
    return p;
  }
  async function startMock(p) {
    await p.locator('#warehouse-play').click();
    await p.waitForFunction(() => typeof finishUnityLoad === 'function');
  }
  async function noOverflow(p, selector) {
    return p.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().bottom <= innerHeight + 1);
  }
  await page.goto(url + '/one-shift.html');
  await page.evaluate(() => document.fonts.ready);
  check('Unity is not downloaded before choosing to play', requests === 0);
  check('Title uses the current game name', (await page.title()) === 'The Warehouse Simulator');
  check('Original saved game remains directly linked', await page.locator('.warehouse-classic a').getAttribute('href') === 'one-shift-classic.html');
  check('Title fits the viewport', await noOverflow(page, '#warehouse-launcher'));
  await page.screenshot({path:path.join(dump,'launcher-desktop.png'), scale:'css'});
  await page.locator('#warehouse-main-menu [data-screen="settings"]').click();
  check('Settings are available without downloading the game', await page.locator('#warehouse-menu').isVisible() && requests === 0);
  await page.keyboard.press('Escape');
  check('Escape closes title settings without starting the player', await page.locator('#warehouse-menu').isHidden() && requests === 0);
  await startMock(page);
  check('Download progress reflects Unity measured file fraction', await page.locator('#warehouse-progress').getAttribute('value') === '47');
  await page.waitForFunction(() => document.getElementById('warehouse-load-elapsed').textContent !== '0s elapsed');
  check('Loading shows truthful elapsed active time between callbacks', /^\d+s elapsed$/.test(await page.locator('#warehouse-load-elapsed').innerText()));
  check('Career mode is selected before creating the engine', await page.evaluate(() => unityRequestedMode === 'career'));
  check('Compressed fallback URLs share release v9', await page.evaluate(() => {
    return ['dataUrl','frameworkUrl','codeUrl'].map(key => new URL(unityConfig[key], location.href)).every(url => url.pathname.endsWith('.unityweb') && url.searchParams.get('v') === '9');
  }));
  check('Retina rendering starts within the Smooth pixel budget', await page.evaluate(() => {
    const c = document.getElementById('warehouse-canvas');
    return devicePixelRatio === 2 && unityConfig.matchWebGLToCanvasSize === false && c.width === 1800 && c.height === 1125 && c.width * c.height <= 1920 * 1080;
  }));
  await page.evaluate(() => reportUnityProgress(.9));
  check('Completed download becomes indeterminate engine startup, never a stuck 100%', await page.locator('#warehouse-progress').getAttribute('value') === null && await page.locator('#warehouse-loading').getAttribute('data-phase') === 'engine');
  await page.evaluate(() => finishUnityLoad());
  await page.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  check('Loader promise alone cannot reveal an unprepared game', await page.locator('#warehouse-launcher').isVisible() && await page.locator('#warehouse-tools').isHidden());
  await page.evaluate(() => { unityConfig.onOneShiftPreparation(2, 7, 0); reportUnityProgress(1); });
  check('Preparation stays separate from late download callbacks', await page.locator('#warehouse-progress').getAttribute('value') === '29' && await page.locator('#warehouse-load-status').innerText() === 'Morning light');
  await page.evaluate(() => unityConfig.onWarehousePreparation({completed:2,total:7,fraction:.36,label:'Morning light',detail:'Rendering the office windows'}));
  check('Finer preparation reports show actual intermediate work', await page.locator('#warehouse-progress').getAttribute('value') === '36' && await page.locator('#warehouse-load-detail').innerText() === 'Rendering the office windows');
  await page.screenshot({path:path.join(dump,'launcher-preparing.png'), scale:'css'});
  await page.evaluate(() => unityConfig.onWarehousePreparation({completed:2,total:7,fraction:.3,label:'Morning light',detail:'Rendering the office windows'}));
  check('Late fine preparation reports cannot move progress backwards', await page.locator('#warehouse-progress').getAttribute('value') === '36');
  await clearCalls(page);
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  check('Blur suspends both schedulers while preparation runs', JSON.stringify(await lifecycle(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  const elapsedBeforeBlur = await page.locator('#warehouse-load-elapsed').innerText();
  await new Promise(resolve => setTimeout(resolve, 1100));
  check('Elapsed loading time excludes browser inactivity', await page.locator('#warehouse-load-elapsed').innerText() === elapsedBeforeBlur);
  await clearCalls(page);
  await page.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation completion while blurred cannot resume gameplay', await page.locator('#warehouse-launcher').isHidden() && (await lifecycle(page)).length === 0);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  check('Prepared game resumes only when browser activity returns', JSON.stringify(await lifecycle(page)) === JSON.stringify(['monitor:true','loop:resume','BrowserLifecycle:SetBrowserActive:1']));
  await page.evaluate(() => unityConfig.onOneShiftStats(9, 59.8, 22.4, 120));
  check('Version and FPS come from compiled-player frames', await page.evaluate(() => {
    const s = document.getElementById('warehouse-stats');
    return s.textContent === 'v9 | 60 FPS' && s.dataset.buildVersion === '9' && s.dataset.fps === '59.8' && s.dataset.frameCount === '120' && s.dataset.longestFrameMs === '22.4' && s.title === 'Longest frame: 22 ms';
  }));
  check('Performance readout stays out of the default play view', await page.locator('#warehouse-stats').isHidden());
  await clearCalls(page);
  await page.locator('#warehouse-pause').click();
  check('Pause suspends Unity before its schedulers', JSON.stringify(await lifecycle(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  check('Pause sends the UI bridge its menu state', await command(page, 'menu'));
  check('Pause dialog is centred in the viewport', await page.locator('#warehouse-menu').evaluate(el => { const r = el.getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - innerWidth / 2) < 1 && Math.abs(r.y + r.height / 2 - innerHeight / 2) < 1; }));
  await page.screenshot({path:path.join(dump,'launcher-paused.png'), scale:'css'});
  await clearCalls(page);
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  check('Focus changes preserve manual pause', (await lifecycle(page)).length === 0 && await page.locator('#warehouse-paused').isVisible());
  await page.locator('#warehouse-paused [data-screen="settings"]').click();
  await page.locator('#warehouse-quality').selectOption('sharp');
  await page.locator('#warehouse-show-stats').check();
  check('Picture quality defers the drawing-buffer change while Unity is paused', await page.evaluate(() => {
    const c = document.getElementById('warehouse-canvas'); return c.width === 1800 && c.height === 1125 && document.getElementById('warehouse-quality').value === 'sharp';
  }));
  await clearCalls(page);
  await page.locator('#warehouse-quality').selectOption('smooth');
  await page.setViewportSize({width:3024,height:1964});
  check('Resizing a paused window preserves the last valid drawing buffer', await page.evaluate(() => {
    const c = document.getElementById('warehouse-canvas'); return c.width === 1800 && c.height === 1125;
  }));
  check('Changing picture quality and size cannot undo manual pause', await page.locator('#warehouse-menu').isVisible() && (await lifecycle(page)).length === 0);
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#warehouse-menu-back').click();
  await page.locator('#warehouse-help').click();
  await page.locator('[data-help-tab="forklift"]').click();
  check('Forklift help describes left Shift, neutral and variable speed', (await page.locator('#warehouse-help-forklift').innerText()).includes('farther the lever is from centre') && (await page.locator('#warehouse-help-forklift').innerText()).includes('Left Shift'));
  await page.screenshot({path:path.join(dump,'launcher-controls.png'), scale:'css'});
  await page.keyboard.press('ArrowRight');
  check('Help tabs have working keyboard navigation', await page.locator('[data-help-tab="work"]').getAttribute('aria-selected') === 'true');
  await page.locator('#warehouse-close-help').click();
  await clearCalls(page);
  await page.locator('#warehouse-resume').click();
  check('Resume restarts the schedulers before Unity', JSON.stringify(await lifecycle(page)) === JSON.stringify(['monitor:true','loop:resume','BrowserLifecycle:SetBrowserActive:1']));
  check('Mouse capture resumes only after the active engine handoff', (await calls(page)).findIndex(call => call.endsWith('{"action":"resume"}')) > (await calls(page)).indexOf('BrowserLifecycle:SetBrowserActive:1'));
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  check('The trusted Resume click directly obtains browser pointer lock', await page.evaluate(() => document.pointerLockElement?.id === 'warehouse-canvas'));
  await page.setViewportSize({width:3024,height:1964});
  await page.waitForFunction(() => document.getElementById('warehouse-canvas').width !== 1800);
  check('Active large windows retain the pixel budget and aspect ratio', await page.evaluate(() => {
    const c = document.getElementById('warehouse-canvas'); return c.width * c.height <= 1920 * 1080 && Math.abs(c.width / c.height - innerWidth / innerHeight) < .002;
  }));
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => document.pointerLockElement === null);
  await clearCalls(page);
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  check('Denied mouse capture clears input without starting a pause', JSON.stringify(await lifecycle(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','BrowserLifecycle:SetBrowserActive:1']) && await page.locator('#warehouse-menu').isHidden());
  await page.evaluate(() => {
    window.mockCapturePointer = () => document.getElementById('warehouse-canvas').requestPointerLock();
    document.getElementById('warehouse-canvas').addEventListener('click', window.mockCapturePointer);
  });
  await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  await clearCalls(page);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => document.pointerLockElement === null);
  check('An intentional controller pointer release cannot open Pause or reset the driver', await page.locator('#warehouse-menu').isHidden() && (await lifecycle(page)).length === 0);
  await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  check('Pointer ownership can transfer back without changing engine activity', await page.locator('#warehouse-menu').isHidden() && (await lifecycle(page)).length === 0);
  await page.evaluate(() => document.getElementById('warehouse-canvas').removeEventListener('click', window.mockCapturePointer));
  await page.evaluate(() => {
    window.mockEngineEscapeEvents = [];
    ['keydown','keyup'].forEach(type => document.addEventListener(type, event => {
      if (event.code === 'Escape') window.mockEngineEscapeEvents.push(type);
    }));
  });
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape');
  check('Actual Escape from pointer lock still opens the pause menu', await page.locator('#warehouse-paused').isVisible() && await page.evaluate(() => document.pointerLockElement === null));
  check('Holding Escape cannot toggle the menu repeatedly or reach Unity', await page.locator('#warehouse-paused').isVisible() && await page.evaluate(() => mockEngineEscapeEvents.length === 0));
  await page.keyboard.up('Escape');
  check('Handled Escape cannot queue a delayed engine capture release', await page.evaluate(() => mockEngineEscapeEvents.length === 0));
  await page.keyboard.press('Escape');
  check('Escape resumes the menu exactly once without reaching the engine', await page.locator('#warehouse-menu').isHidden() && await page.evaluate(() => mockEngineEscapeEvents.length === 0));
  await clearCalls(page);
  await page.evaluate(() => { document.getElementById('warehouse-stage').style.transform = 'translateX(-200vw)'; });
  await page.waitForFunction(() => unityCalls.includes('loop:pause'));
  check('Leaving the viewport suspends the engine', (await lifecycle(page)).includes('BrowserLifecycle:SetBrowserActive:0'));
  await page.evaluate(() => { document.getElementById('warehouse-stage').style.transform = ''; });
  await page.waitForFunction(() => unityCalls.includes('loop:resume'));
  await page.keyboard.press('p');
  check('P keyboard shortcut pauses the warehouse', await page.locator('#warehouse-paused').isVisible());
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  check('Escape opens the menu when the mouse is released', await page.locator('#warehouse-paused').isVisible());
  await page.locator('#warehouse-return-title').click();
  check('Title screen retains the current business session', await page.locator('#warehouse-launcher').isVisible() && (await page.locator('#warehouse-play').innerText()).includes('Resume business') && requests === 1);
  await clearCalls(page);
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  check('Returning to the title keeps the simulation paused through focus changes', (await lifecycle(page)).length === 0);
  await page.locator('#warehouse-play').click();
  check('Resume returns to the same player without another download', await page.locator('#warehouse-launcher').isHidden() && requests === 1 && (await lifecycle(page)).includes('loop:resume'));
  await page.evaluate(() => {
    document.getElementById('warehouse-canvas').style.background = 'url(assets/one-shift-unity/preview.png) center / cover';
    unityConfig.onWarehouseHUD({clock:'07:14',location:'Receiving dock',objective:'Unload the first delivery',detail:'Unload the trailer   1/4 unloaded   0/4 stored',hintKey:'E',hint:'Stop and step out',driving:true,forkHeight:1.2,hydraulics:true,hydraulicInput:.6,forkSpeed:.5,training:'center'});
  });
  check('HTML HUD uses the authoritative objective and context', await page.locator('#warehouse-objective').innerText() === 'Unload the first delivery' && await page.locator('#warehouse-hint-key').innerText() === 'E');
  check('Legacy status spacing becomes readable HUD separators', await page.locator('#warehouse-objective-detail').innerText() === 'Unload the trailer / 1/4 unloaded / 0/4 stored');
  check('Hydraulic lever shows direction and actual signed speed while held', await page.locator('#warehouse-hydraulics').isVisible() && await page.locator('#warehouse-fork-speed').innerText() === '+50% raise' && await page.locator('#warehouse-lever-knob').evaluate(el => el.style.top) === '20%');
  await page.screenshot({path:path.join(dump,'shell-hydraulics-fixture.png'), scale:'css'});
  await page.evaluate(() => unityConfig.onWarehouseHUD({driving:true,forkHeight:1.2,hydraulics:true,hydraulicInput:0,forkSpeed:0}));
  check('Hydraulic neutral is visibly centred and stopped', await page.locator('#warehouse-fork-speed').innerText() === 'Neutral' && await page.locator('#warehouse-lever-knob').evaluate(el => el.style.top) === '50%');
  await page.evaluate(() => unityConfig.onWarehouseHUD({driving:true,forkHeight:1.2,hydraulics:false,hydraulicInput:0,forkSpeed:0}));
  check('Releasing hydraulic control removes the lever', await page.locator('#warehouse-hydraulics').isHidden());
  const office = {open:true,title:'Dispatch desk',summary:'One open delivery. Your supplier orders are listed below.',cash:2480,inventory:[{id:'case-a',name:'Packing tape',quantity:12,unit:'cases'}],orders:[{id:'tape',name:'Packing tape',detail:'12 cases arrive at the parcel shelf.',price:180,action:'Place order',enabled:true}],contracts:[{id:'corner',name:'Corner Supply',detail:'Deliver 6 cases of packing tape.',price:240,action:'Accept order',enabled:true,status:'Ready to accept'}],ledger:[{label:'Opening balance',amount:2480}],message:''};
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  check('Office computer opens with authoritative stock and cash', await page.locator('#warehouse-computer').isVisible() && await page.locator('#warehouse-computer-cash').innerText() === '$2,480' && (await page.locator('#warehouse-inventory').innerText()).includes('12 cases'));
  check('Computer suspends the warehouse while it is in use', (await lifecycle(page)).slice(-3).join('|') === 'BrowserLifecycle:SetBrowserActive:0|monitor:false|loop:pause');
  await page.locator('[data-desk-tab="purchases"]').click();
  await clearCalls(page);
  await page.locator('#warehouse-orders button').click();
  check('Supplier purchase sends only the selected authoritative item ID', (await calls(page)).some(call => call.endsWith('{"action":"order","id":"tape"}')));
  check('Purchase button rejects repeated clicks while awaiting the ledger reply', await page.locator('#warehouse-orders button').isDisabled());
  office.cash = 2300; office.message = 'Packing tape ordered.';
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  check('Ledger reply refreshes cash and restores purchase controls', await page.locator('#warehouse-computer-cash').innerText() === '$2,300' && await page.locator('#warehouse-orders button').isEnabled());
  await page.locator('#warehouse-orders button').click();
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  check('An unchanged authoritative reply also releases a pending action', await page.locator('#warehouse-orders button').isEnabled());
  await page.screenshot({path:path.join(dump,'shell-office-fixture.png'), scale:'css'});
  await page.locator('[data-desk-tab="customers"]').click();
  await page.locator('#warehouse-contracts button').click();
  check('Customer orders use their separate contract action', await command(page, 'contract'));
  office.contracts[0] = {...office.contracts[0],action:'Ship order',enabled:false,status:'Accepted',secondaryAction:'Release order',secondaryCommand:'cancel-contract',secondaryEnabled:true};
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  check('Accepted orders can be released while shipment is unavailable', await page.locator('#warehouse-contracts button[data-action="contract"]').isDisabled() && await page.locator('#warehouse-contracts button[data-action="cancel-contract"]').isEnabled());
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:{...value,contracts:[...value.contracts,
    {id:'northbank',name:'Northbank Supplies',detail:'1 pallet / 36 cases of cleaning supplies',price:910,action:'Accept order',enabled:false,status:'Available'},
    {id:'marsh',name:'Marsh and Field',detail:'1 pallet / 40 cases of dry pantry goods',price:1020,action:'Accept order',enabled:false,status:'Available'}],
    message:'Accepted Corner Mart. Receive the stock, load the oldest matching pallet into the trailer, then dispatch here.'}}), office);
  check('Office transaction notice stays visible beneath a full customer-order list', await page.locator('#warehouse-computer').evaluate(el => {
    const dialog = el.getBoundingClientRect(), footer = el.querySelector('footer').getBoundingClientRect();
    return footer.top >= dialog.top && footer.bottom <= dialog.bottom - 6;
  }));
  await page.screenshot({path:path.join(dump,'shell-office-orders-fixture.png'),scale:'css'});
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  await page.setViewportSize({width:1440,height:900});
  await clearCalls(page);
  await page.locator('#warehouse-contracts button[data-action="cancel-contract"]').click();
  check('Release sends the same order ID and prevents repeated actions until reply', (await calls(page)).some(call => call.endsWith('{"action":"cancel-contract","id":"corner"}')) && await page.locator('#warehouse-contracts button[data-action="cancel-contract"]').isDisabled());
  office.contracts[0] = {...office.contracts[0],action:'Accept order',enabled:true,status:'Ready to accept',secondaryAction:'',secondaryCommand:'',secondaryEnabled:false};
  await page.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), office);
  check('Release reply restores the available order without a stale secondary action', await page.locator('#warehouse-contracts button[data-action="contract"]').isEnabled() && await page.locator('#warehouse-contracts button[data-action="cancel-contract"]').count() === 0);
  await page.locator('[data-desk-tab="ledger"]').click();
  check('Ledger tab displays actual transaction amounts', (await page.locator('#warehouse-ledger').innerText()).includes('$2,480'));
  await clearCalls(page);
  await page.keyboard.press('Escape');
  check('Leaving the computer resumes scheduling before its camera-return command', (await calls(page)).findIndex(call => call.endsWith('{"action":"computer-close"}')) > (await calls(page)).indexOf('BrowserLifecycle:SetBrowserActive:1') && !await command(page, 'resume') && await page.locator('#warehouse-computer').isHidden());
  await page.locator('#warehouse-pause').click();
  await page.locator('#warehouse-paused [data-screen="settings"]').click();
  await page.locator('#warehouse-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
  check('Fullscreen keeps the complete game wrapper', await page.evaluate(() => document.fullscreenElement?.id === 'warehouse-stage'));
  await page.evaluate(() => document.exitFullscreen());
  await page.keyboard.press('p');

  const modes = await mockPage();
  check('Fresh title separates the empty business from the equipped sandbox', (await modes.locator('#warehouse-play').innerText()).includes('Start business') && (await modes.locator('#warehouse-sandbox').innerText()).includes('Fresh session'));
  await startMock(modes); await finish(modes);
  await modes.locator('#warehouse-pause').click();
  await modes.locator('#warehouse-return-title').click();
  await modes.locator('#warehouse-sandbox').click();
  check('Changing an existing session requires a concrete reset choice', await modes.locator('#warehouse-new-session').isVisible() && (await modes.locator('#warehouse-new-session').innerText()).includes('ends it') && await modes.evaluate(() => unityRequestedMode === 'career'));
  await modes.locator('#warehouse-cancel-new-session').click();
  check('Keeping the session preserves its engine and mode', await modes.locator('#warehouse-launcher').isVisible() && await modes.evaluate(() => unityRequestedMode === 'career'));
  await modes.locator('#warehouse-sandbox').click();
  await modes.locator('#warehouse-confirm-new-session').click();
  await modes.waitForURL('**/one-shift.html?mode=sandbox');
  check('A deliberate new session reloads to the title without downloading automatically', await modes.locator('#warehouse-launcher').isVisible() && await modes.evaluate(() => typeof window.unityConfig === 'undefined'));
  await modes.locator('#warehouse-sandbox').click();
  await modes.waitForFunction(() => typeof finishUnityLoad === 'function');
  check('Sandbox is selected before its fresh engine is created', await modes.evaluate(() => unityRequestedMode === 'sandbox'));
  await finish(modes);
  await modes.locator('#warehouse-pause').click(); await modes.locator('#warehouse-return-title').click();
  check('Resume names the currently loaded mode', (await modes.locator('#warehouse-play').innerText()).includes('Resume sandbox'));
  await modes.locator('#warehouse-play').click();
  check('Resume cannot silently change Sandbox into Career', await modes.evaluate(() => unityRequestedMode === 'sandbox') && await modes.locator('#warehouse-launcher').isHidden());
  await modes.close();

  const career = {
    open:true,mode:'career',company:'Latchford Distribution',title:'Latchford Distribution',summary:'Independent trade supplies / 0 orders delivered',
    cash:600,completedOrders:0,stage:'Start your distribution business',stageDetail:'The office computer is through the glass doorway. Order three cartons of packing tape.',suggestedTab:'purchases',
    inventory:[{id:'tape',name:'Packing tape',quantity:0,unit:'cartons'},{id:'towels',name:'Shop towels',quantity:0,unit:'cartons'},{id:'gloves',name:'Work gloves',quantity:0,unit:'cartons'}],
    orders:[
      {id:'tape',name:'Packing tape',detail:'3 cartons / 36 rolls per carton. Driver delivers to the front porch.',price:120,action:'Send purchase order',enabled:true},
      {id:'towels',name:'Shop towels',detail:"Finish Miller Motor Works' first order to open this supplier.",price:160,action:'Send purchase order',enabled:false},
      {id:'gloves',name:'Work gloves',detail:"Finish Miller Motor Works' first order to open this supplier.",price:180,action:'Send purchase order',enabled:false}
    ],
    contracts:[{id:'tape',name:'Miller Motor Works',detail:'Receive 3 cartons in the highlighted packing tape bay first.',price:210,action:'Accept and book collection',enabled:false,status:'Stock needed'}],
    upgrades:[
      {id:'racks',name:'Pallet racks',detail:'Complete three customer orders to expand into pallet handling.',price:300,action:'Buy and install',enabled:false,owned:false},
      {id:'forklift',name:'Used forklift',detail:'Complete three customer orders to expand into pallet handling.',price:650,action:'Buy and install',enabled:false,owned:false},
      {id:'fish',name:'Singing fish',detail:'A reward after your first completed customer order.',price:95,action:'Buy and install',enabled:false,owned:false},
      {id:'flames',name:'Forklift flame kit',detail:'Buy the forklift before fitting its flame kit.',price:65,action:'Buy and install',enabled:false,owned:false}
    ],
    ledger:[{label:'Opening working capital',amount:600}],message:'The lease is paid. Start with a small packing-tape purchase order.'
  };
  const desk = await mockPage(); await startMock(desk); await finish(desk);
  await clearCalls(desk);
  await desk.evaluate(() => unityConfig.onWarehouseHUD({clock:'8:10 AM',holding:true,carryDistance:1.6,hintKey:'E / Click',hint:'Put down Packing tape / carton 003. Wheel: distance. Hold right mouse: rotate.',notice:'Stock checked in. The customer order is ready at the computer.',computer:{open:false,transitioning:false}}));
  check('Held cartons show practical authoritative distance and rotation controls', await desk.locator('#warehouse-carry').isVisible() && await desk.locator('#warehouse-carry-distance').innerText() === '1.6 m' && (await desk.locator('#warehouse-carry').innerText()).includes('Right mouse'));
  check('A stock notice stays clear of the held-carton action hint', await desk.evaluate(() => document.getElementById('warehouse-notice').getBoundingClientRect().bottom + 8 < document.getElementById('warehouse-context').getBoundingClientRect().top));
  await desk.setViewportSize({width:420,height:780});
  check('Carton controls wrap inside a narrow desktop window without covering its action', await desk.evaluate(() => {
    const carry=document.getElementById('warehouse-carry').getBoundingClientRect(), hint=document.getElementById('warehouse-context').getBoundingClientRect();
    return carry.left>=15 && carry.right<=innerWidth-15 && hint.bottom+5<carry.top;
  }));
  await desk.setViewportSize({width:1440,height:900});
  await desk.evaluate(() => unityConfig.onWarehouseHUD({holding:false,computer:{open:false,transitioning:true,transitionDirection:'in',transitionProgress:.5}}));
  check('The physical approach remains active without revealing the computer early', await desk.locator('#warehouse-computer').isHidden() && (await lifecycle(desk)).length === 0 && await desk.locator('#warehouse-stage').evaluate(el => el.classList.contains('is-computer-transitioning')));
  await desk.evaluate(value => unityConfig.onWarehouseHUD({clock:'8:10 AM',computer:value}), career);
  await desk.locator('.warehouse-monitor-screen').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  check('The completed camera approach opens the career application with real cash and zero stock', await desk.locator('#warehouse-computer').isVisible() && await desk.locator('#warehouse-computer-cash').innerText() === '$600' && await desk.locator('#warehouse-computer-title').innerText() === 'Latchford Distribution' && (await desk.locator('#warehouse-inventory').innerText()).includes('0 cartons'));
  check('The opening application follows the authoritative suggested task', await desk.locator('[data-desk-tab="purchases"]').getAttribute('aria-selected') === 'true');
  check('The first-day supplier list keeps later products visible with their actual unlock condition', await desk.locator('#warehouse-orders button:enabled').count() === 1 && await desk.locator('#warehouse-orders [data-id="tape"]').isEnabled() && (await desk.locator('#warehouse-orders').innerText()).includes("Finish Miller Motor Works' first order"));
  await desk.screenshot({path:path.join(dump,'career-computer-suppliers.png'),scale:'css'});
  await desk.locator('[data-desk-tab="overview"]').click();
  check('Overview presents the first-day goal and completed-order count', await desk.locator('#warehouse-business-stage').innerText() === career.stage && await desk.locator('#warehouse-completed-orders').innerText() === '0');
  await desk.screenshot({path:path.join(dump,'career-computer-overview.png'),scale:'css'});
  await desk.evaluate(value => unityConfig.onWarehouseHUD({computer:{...value,revision:2}}), career);
  check('Transaction snapshots do not pull the player away from the tab they chose', await desk.locator('[data-desk-tab="overview"]').getAttribute('aria-selected') === 'true');
  await desk.locator('#warehouse-computer-minimize').click();
  check('The desktop is usable while the warehouse remains paused', await desk.locator('#warehouse-desktop-home').isVisible() && await desk.locator('#warehouse-business').isHidden());
  await desk.screenshot({path:path.join(dump,'career-computer-desktop.png'),scale:'css'});
  await desk.locator('#warehouse-dispatch-task').click();
  check('The taskbar restores the existing business window and selected page', await desk.locator('#warehouse-business').isVisible() && await desk.locator('[data-desk-tab="overview"]').getAttribute('aria-selected') === 'true');
  await desk.locator('[data-desk-tab="upgrades"]').click();
  check('Equipment and decoration use authoritative unlock rules', await desk.locator('#warehouse-upgrades button').count() === 4 && await desk.locator('#warehouse-upgrades button').evaluateAll(buttons => buttons.every(button => button.disabled)));
  career.completedOrders = 1; career.cash = 690; career.upgrades[2].enabled = true; career.upgrades[2].detail = 'A singing fish for the dispatch office.';
  await desk.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), career);
  await clearCalls(desk);
  await desk.locator('#warehouse-upgrades [data-id="fish"]').click();
  check('An unlocked upgrade sends one ID and waits for the authoritative reply', (await calls(desk)).filter(call => call.endsWith('{"action":"upgrade","id":"fish"}')).length === 1 && await desk.locator('#warehouse-upgrades [data-id="fish"]').isDisabled());
  career.cash = 595; career.upgrades[2].owned = true; career.upgrades[2].enabled = false; career.upgrades[2].action = 'Installed';
  await desk.evaluate(value => unityConfig.onWarehouseHUD({computer:value}), career);
  check('Installed upgrades remain unavailable for duplicate purchase', await desk.locator('#warehouse-upgrades [data-id="fish"]').isDisabled() && await desk.locator('#warehouse-upgrades [data-id="fish"]').innerText() === 'Installed');
  await desk.screenshot({path:path.join(dump,'career-computer-upgrades.png'),scale:'css'});
  await desk.setViewportSize({width:1280,height:600});
  check('Long office pages provide real content scrolling', await desk.locator('.warehouse-desk-body').evaluate(el => { el.scrollTop=el.scrollHeight; return el.scrollTop>0; }));
  await desk.locator('[data-desk-tab="purchases"]').click();
  check('Changing business pages starts at the new page heading', await desk.locator('.warehouse-desk-body').evaluate(el => el.scrollTop===0));
  await clearCalls(desk);
  await desk.locator('#warehouse-computer-close').click();
  await desk.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  check('Close obtains native capture before the runtime-controlled return', await command(desk, 'computer-close') && !await command(desk, 'resume') && await desk.locator('#warehouse-computer').isHidden());
  await desk.evaluate(() => unityConfig.onWarehouseHUD({computer:{open:false,transitioning:true,transitionDirection:'out',transitionProgress:.3}}));
  await clearCalls(desk);
  await desk.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  check('Camera return obeys browser activity without reopening the application', (await lifecycle(desk)).includes('loop:pause') && (await lifecycle(desk)).includes('loop:resume') && await desk.locator('#warehouse-computer').isHidden());
  await desk.evaluate(() => unityConfig.onWarehouseHUD({computer:{open:false,transitioning:false}}));
  check('Completed camera return restores the ordinary HUD', await desk.locator('#warehouse-stage').evaluate(el => !el.classList.contains('is-computer-transitioning')));
  await desk.close();

  const preparedFirst = await mockPage();
  await startMock(preparedFirst);
  await preparedFirst.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation callback before the promise keeps the launcher visible', await preparedFirst.locator('#warehouse-launcher').isVisible() && await preparedFirst.locator('#warehouse-tools').isHidden());
  await finish(preparedFirst);
  check('Preparation-first order reveals only after the loader resolves', await preparedFirst.locator('#warehouse-launcher').isHidden());
  await preparedFirst.close();

  const mobile = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  const phone = await mockPage(mobile);
  check('Touch portrait is gated before loading', await phone.locator('#warehouse-rotate').isVisible() && await phone.evaluate(() => typeof window.createUnityInstance === 'undefined'));
  await phone.screenshot({path:path.join(dump,'launcher-portrait.png'), scale:'css'});
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Landscape exposes a usable title menu', await phone.locator('#warehouse-play').isVisible() && await noOverflow(phone, '#warehouse-launcher'));
  await phone.screenshot({path:path.join(dump,'launcher-landscape.png'), scale:'css'});
  await startMock(phone);
  await phone.evaluate(() => finishUnityLoad());
  await phone.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await clearCalls(phone);
  await phone.setViewportSize({width:390,height:844});
  await phone.waitForSelector('#warehouse-rotate', {state:'visible'});
  check('Portrait suspends preparation before readiness', await phone.locator('#warehouse-launcher').isVisible() && (await lifecycle(phone)).includes('loop:pause'));
  await clearCalls(phone);
  await phone.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation finishing in portrait cannot bypass its gate', await phone.locator('#warehouse-rotate').isVisible() && (await lifecycle(phone)).length === 0);
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Returning to landscape resumes the prepared game', (await lifecycle(phone)).includes('loop:resume'));
  await phone.locator('#warehouse-pause').click();
  await clearCalls(phone);
  await phone.setViewportSize({width:390,height:844});
  await phone.waitForSelector('#warehouse-rotate', {state:'visible'});
  check('Rotate gate remains above previously open dialogs', await phone.locator('#warehouse-menu').isHidden());
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Rotating restores the menu without undoing manual pause', await phone.locator('#warehouse-paused').isVisible() && !(await lifecycle(phone)).includes('loop:resume'));
  await phone.locator('#warehouse-help').click();
  await phone.locator('[data-help-tab="forklift"]').click();
  check('Landscape controls scroll without horizontal overflow', await noOverflow(phone, '#warehouse-menu'));
  await phone.screenshot({path:path.join(dump,'launcher-controls-landscape.png'), scale:'css'});
  await phone.keyboard.press('p');
  await phone.evaluate(value => unityConfig.onWarehouseHUD({clock:'8:10 AM',computer:value}), {...career,cash:600,completedOrders:0,suggestedTab:'purchases'});
  check('Landscape office fits the viewport', await noOverflow(phone, '#warehouse-computer'));
  await phone.locator('.warehouse-monitor-screen').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  await phone.screenshot({path:path.join(dump,'shell-office-landscape-fixture.png'), scale:'css'});
  await mobile.close();

  const preparationFailure = await mockPage();
  await startMock(preparationFailure);
  await preparationFailure.evaluate(() => finishUnityLoad());
  await preparationFailure.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await preparationFailure.keyboard.press('p');
  await clearCalls(preparationFailure);
  await preparationFailure.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation cannot undo manual pause taken while loading', await preparationFailure.locator('#warehouse-paused').isVisible() && (await lifecycle(preparationFailure)).length === 0);
  await preparationFailure.goto(url + '/one-shift.html');
  await startMock(preparationFailure);
  await preparationFailure.evaluate(() => finishUnityLoad());
  await preparationFailure.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await clearCalls(preparationFailure);
  await preparationFailure.evaluate(() => { unityConfig.onOneShiftPreparation(3, 7, -1); unityConfig.onOneShiftPreparation(7, 7, 1); });
  check('Preparation failure offers retry and rejects late readiness', await preparationFailure.locator('#warehouse-error').isVisible() && await preparationFailure.locator('#warehouse-play').isEnabled() && await preparationFailure.locator('#warehouse-tools').isHidden() && !(await lifecycle(preparationFailure)).includes('loop:resume'));
  await preparationFailure.close();

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
  check('In Progress keeps the warehouse at its original URL', await card.count() === 1);
  check('The card loads the Unity warehouse thumbnail', await card.locator('img').evaluate(image => image.naturalWidth > 0 && image.currentSrc.includes('one-shift-unity')));
  await card.screenshot({path:path.join(dump,'archive-card.png'), scale:'css'});
  console.log(checks.length + ' checks passed. Captures: ' + dump);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
