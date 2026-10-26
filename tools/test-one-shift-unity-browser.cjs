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
  async function mouseLiftUntil(direction, label, predicate, timeout = 15000) {
    const deadline = Date.now() + timeout;
    await page.keyboard.down('x');
    try {
      let current;
      do {
        // Native relative pointer events, paced across rendered frames. No
        // controller calls or keyboard hydraulic fallback satisfy this test.
        for (let i = 0; i < 8; i++) {
          mouseY -= direction * 12;
          await page.mouse.move(mouseX, mouseY);
          await delay(20);
        }
        current = await state();
        if (predicate(current)) return current;
      } while (Date.now() < deadline);
      throw new Error(label + ' timed out: ' + JSON.stringify(current));
    } finally { await page.keyboard.up('x'); }
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
    check('REAL: Compiled player reports version 6 and SMAA', initial.buildVersion === 6 && initial.cameraAntialiasing === 'SubpixelMorphologicalAntiAliasing' && initial.pipelineMsaaSamples === 2);
    await page.waitForFunction(() => document.getElementById('warehouse-stats').dataset.buildVersion === '6' && Number(document.getElementById('warehouse-stats').dataset.fps) > 0);
    check('REAL: Small FPS counter receives completed player frames', await page.locator('#warehouse-stats').isVisible());
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
    const deliveryReady = await pollState('Truck parks and opens its receiving doors', current => current.receivingDoorsOpen, 30000);
    // The loader can resolve before MonoBehaviour.Start moves the parked
    // authoring pose into its arrival lane. Compare two running physics states.
    check('REAL: Delivery truck actually backs into the dock', physicsState.receivingTruckPosition[2] - deliveryReady.receivingTruckPosition[2] > 8);
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
    check('REAL: First E seats the player with controls gated by familiarisation', forkliftStates.training.forkliftTraining && forkliftStates.training.forkliftDriving && !forkliftStates.training.forkliftCaptured && forkliftStates.training.forkliftThrottle === 0);
    await capture('unity-real-forklift-training');
    forkliftStates.entered = await pressForFrames('e', 'Acknowledge forklift familiarisation', current => current.forkliftDriving && current.forkliftCaptured && !current.forkliftTraining);
    check('REAL: E acknowledges the first briefing and captures vehicle controls', forkliftStates.entered.forkliftDriving && !forkliftStates.entered.forkliftTraining);
    check('REAL: Driver starts in the rear chase view', forkliftStates.entered.forkliftCabView === false);
    await capture('unity-real-forklift-chase');
    forkliftStates.cab = await pressForFrames('c', 'Switch to forklift cab', current => current.forkliftCabView);
    await capture('unity-real-forklift-cab');
    forkliftStates.chase = await pressForFrames('c', 'Restore forklift chase camera', current => !current.forkliftCabView);
    check('REAL: C switches between the cab and chase cameras', forkliftStates.cab.forkliftCabView && !forkliftStates.chase.forkliftCabView);

    await page.keyboard.down('Shift');
    try {
      forkliftStates.approachDock = await keyUntil('w', 'Creep along the receiving aisle', current => current.forkliftPosition[2] > 9.6, 45000);
    } finally { await page.keyboard.up('Shift'); }
    await keyUntil('Space', 'Stop before the first pallet', current => Math.abs(current.forkliftSignedSpeed) < .04);
    await pollState('Release brake before mouse control', current => current.forkliftThrottle === 0);
    const beforeMouse = await state();
    const palletBeforeGuide = beforeMouse.receivingFirstPallet;
    await page.keyboard.down('x');
    try {
      const heldStill = await pollState('Hold X with the mouse still', current => current.forkliftForkViewActive && current.frameCount > beforeMouse.frameCount + 30);
      check('REAL: Held X alone neither drives nor raises the forklift', heldStill.forkliftThrottle === 0 && heldStill.forkliftMouseLiftInput === 0 && Math.abs(heldStill.forkliftLiftHeight - beforeMouse.forkliftLiftHeight) < .02 && distance(heldStill.forkliftPosition, beforeMouse.forkliftPosition) < .06);
      await capture('unity-real-fork-placement-through-mast');
      await page.keyboard.down('Shift');
      try { forkliftStates.inserted = await keyUntil('w', 'Position forks manually inside the first pallet', current => current.forkliftPosition[2] > 12.31, 30000); }
      finally { await page.keyboard.up('Shift'); }
      await keyUntil('Space', 'Stop with forks inserted', current => Math.abs(current.forkliftSignedSpeed) < .04);
      const inserted = await state();
      check('REAL: WASD remains manual while X reveals the actual pallet and forks', inserted.forkliftForkViewActive && inserted.forkliftForkViewTarget.length > 0 && inserted.forkliftMouseLiftInput === 0);
      await capture('unity-real-forks-in-pallet');
    } finally { await page.keyboard.up('x'); }
    forkliftStates.mousePickup = await mouseLiftUntil(1, 'Mouse up raises the pallet through contact', current => current.receivingFirstPallet[1] > palletBeforeGuide[1] + .10 && current.forkliftLiftHeight > .28);
    const releasedMouse = await pollState('Releasing X clears the hydraulic input', current => !current.forkliftAssistActive && current.forkliftLiftInput === 0);
    const restingMouse = await pollState('Forks hold after releasing X', current => current.frameCount > releasedMouse.frameCount + 30);
    check('REAL: Mouse up physically lifts the delivery pallet and release holds it', Math.abs(restingMouse.forkliftLiftHeight - releasedMouse.forkliftLiftHeight) < .03 && restingMouse.receivingFirstPallet[1] > palletBeforeGuide[1] + .08);
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
      check('REAL: Resume preserves the driver but requires fresh mouse capture', forkliftStates.resumed.forkliftDriving && !forkliftStates.resumed.forkliftCaptured && forkliftStates.resumed.forkliftThrottle === 0);
      await page.locator('#warehouse-canvas').focus();
      // Repeat the still-held key after Unity clears its input axes. Capturing
      // with a key down must wait for neutral instead of starting the engine.
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
  const context = await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:2});
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
    return urls.every(url => url.pathname.endsWith('.unityweb') && url.searchParams.get('v') === '6');
  }));
  check('Retina rendering starts within the Smooth pixel budget', await page.evaluate(() => {
    const canvas = document.getElementById('warehouse-canvas');
    return devicePixelRatio === 2 && unityConfig.matchWebGLToCanvasSize === false &&
      canvas.width === 1800 && canvas.height === 1125 && canvas.width * canvas.height <= 1920 * 1080;
  }));
  await page.evaluate(() => finishUnityLoad());
  await page.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  check('Loader promise alone cannot reveal an unprepared game',
    await page.locator('#warehouse-launcher').isVisible() && await page.locator('#warehouse-tools').isHidden());
  await page.evaluate(() => { unityConfig.onOneShiftPreparation(2, 7, 0); reportUnityProgress(1); });
  check('Preparation progress stays truthful after late download callbacks',
    await page.locator('#warehouse-progress').getAttribute('value') === '29' &&
    (await page.locator('#warehouse-load-status').innerText()) === 'Preparing graphics... 2 of 7' &&
    await page.locator('#warehouse-launcher').isVisible());
  await clearCalls(page);
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  check('Blur suspends both schedulers while graphics are preparing',
    JSON.stringify(await calls(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  await clearCalls(page);
  await page.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation completion while blurred cannot resume gameplay',
    await page.locator('#warehouse-launcher').isHidden() && (await calls(page)).length === 0);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  check('Prepared game resumes only when browser activity returns',
    JSON.stringify(await calls(page)) === JSON.stringify(['monitor:true','loop:resume','BrowserLifecycle:SetBrowserActive:1']));
  await page.evaluate(() => unityConfig.onOneShiftStats(17, 59.8, 22.4, 120));
  check('Version and FPS come from the compiled-player callback', await page.evaluate(() => {
    const stats = document.getElementById('warehouse-stats');
    return stats.textContent === 'v17 | 60 FPS' && stats.dataset.buildVersion === '17' &&
      stats.dataset.fps === '59.8' && stats.dataset.frameCount === '120' &&
      stats.dataset.longestFrameMs === '22.4' && stats.title === 'Longest frame: 22 ms';
  }));
  await page.evaluate(() => unityConfig.onOneShiftStats(6, 59.8, 22.4, 120));
  await clearCalls(page);
  await page.locator('#warehouse-pause').click();
  check('Pause suspends Unity before its schedulers', JSON.stringify(await calls(page)) === JSON.stringify(['BrowserLifecycle:SetBrowserActive:0','monitor:false','loop:pause']));
  check('Paused stats do not display the old running frame rate', await page.locator('#warehouse-stats').innerText() === 'v6 | Paused');
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
  await page.locator('#warehouse-quality').selectOption('sharp');
  check('Sharper adds detail without unrestricted Retina rendering', await page.evaluate(() => {
    const canvas = document.getElementById('warehouse-canvas');
    return canvas.width === 2160 && canvas.height === 1350 && canvas.width * canvas.height <= 2560 * 1440;
  }));
  await page.locator('#warehouse-pause').click();
  await clearCalls(page);
  await page.locator('#warehouse-quality').selectOption('smooth');
  await page.setViewportSize({width:3024,height:1964});
  await page.waitForFunction(() => document.getElementById('warehouse-canvas').width !== 1800);
  check('Large windows retain the pixel budget and aspect ratio', await page.evaluate(() => {
    const canvas = document.getElementById('warehouse-canvas');
    return canvas.width * canvas.height <= 1920 * 1080 &&
      Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) < .002;
  }));
  check('Changing picture quality and size cannot undo manual pause',
    await page.locator('#warehouse-paused').isVisible() && (await calls(page)).length === 0);
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(() => document.getElementById('warehouse-canvas').width === 1800);
  await page.locator('#warehouse-pause').click();
  await page.locator('#warehouse-close-help').click();
  await page.locator('#warehouse-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'warehouse-stage');
  check('Fullscreen keeps the complete game wrapper', await page.evaluate(() => document.fullscreenElement?.id === 'warehouse-stage'));
  await page.evaluate(() => document.exitFullscreen());

  const preparedFirst = await context.newPage();
  preparedFirst.on('pageerror', error => errors.push(error.message));
  await preparedFirst.route('**/OneShiftWeb.loader.js*', route => route.fulfill({contentType:'text/javascript', body:loader}));
  await preparedFirst.goto(url + '/one-shift.html');
  await preparedFirst.locator('#warehouse-play').click();
  await preparedFirst.waitForFunction(() => typeof finishUnityLoad === 'function');
  await preparedFirst.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation callback before loader promise keeps the launcher visible',
    await preparedFirst.locator('#warehouse-launcher').isVisible() && await preparedFirst.locator('#warehouse-tools').isHidden());
  await finish(preparedFirst);
  check('Preparation-first order reveals only after the loader resolves',
    await preparedFirst.locator('#warehouse-launcher').isHidden() && (await calls(preparedFirst)).includes('BrowserLifecycle:SetBrowserActive:1'));
  await preparedFirst.close();

  const mobile = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  const phone = await mobile.newPage();
  phone.on('pageerror', error => errors.push(error.message));
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
  await phone.evaluate(() => finishUnityLoad());
  await phone.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await clearCalls(phone);
  await phone.setViewportSize({width:390,height:844});
  await phone.waitForSelector('#warehouse-rotate', {state:'visible'});
  check('Rotating to portrait suspends preparation before readiness',
    await phone.locator('#warehouse-launcher').isVisible() && (await calls(phone)).includes('loop:pause'));
  await clearCalls(phone);
  await phone.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation finishing in portrait cannot bypass the orientation gate',
    await phone.locator('#warehouse-rotate').isVisible() && (await calls(phone)).length === 0);
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Returning to landscape resumes the prepared game', (await calls(phone)).includes('loop:resume'));
  await phone.locator('#warehouse-pause').click();
  await clearCalls(phone);
  await phone.setViewportSize({width:390,height:844});
  await phone.waitForSelector('#warehouse-rotate', {state:'visible'});
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForSelector('#warehouse-rotate', {state:'hidden'});
  check('Rotating cannot undo manual pause', await phone.locator('#warehouse-paused').isVisible() && !(await calls(phone)).includes('loop:resume'));

  const preparationFailure = await context.newPage();
  preparationFailure.on('pageerror', error => errors.push(error.message));
  await preparationFailure.route('**/OneShiftWeb.loader.js*', route => route.fulfill({contentType:'text/javascript', body:loader}));
  await preparationFailure.goto(url + '/one-shift.html');
  await preparationFailure.locator('#warehouse-play').click();
  await preparationFailure.waitForFunction(() => typeof finishUnityLoad === 'function');
  await preparationFailure.evaluate(() => finishUnityLoad());
  await preparationFailure.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await preparationFailure.keyboard.press('p');
  await clearCalls(preparationFailure);
  await preparationFailure.evaluate(() => unityConfig.onOneShiftPreparation(7, 7, 1));
  check('Preparation completion cannot undo a manual pause taken while loading',
    await preparationFailure.locator('#warehouse-paused').isVisible() && (await calls(preparationFailure)).length === 0);
  await preparationFailure.goto(url + '/one-shift.html');
  await preparationFailure.locator('#warehouse-play').click();
  await preparationFailure.waitForFunction(() => typeof finishUnityLoad === 'function');
  await preparationFailure.evaluate(() => finishUnityLoad());
  await preparationFailure.waitForFunction(() => unityCalls.includes('BrowserLifecycle:SetBrowserActive:1'));
  await clearCalls(preparationFailure);
  await preparationFailure.evaluate(() => {
    unityConfig.onOneShiftPreparation(3, 7, -1);
    unityConfig.onOneShiftPreparation(7, 7, 1);
  });
  check('Preparation failure offers retry and ignores a late readiness callback',
    await preparationFailure.locator('#warehouse-error').isVisible() &&
    (await preparationFailure.locator('#warehouse-error').innerText()).includes('prepare its graphics') &&
    await preparationFailure.locator('#warehouse-play').isEnabled() &&
    await preparationFailure.locator('#warehouse-tools').isHidden() &&
    !(await calls(preparationFailure)).includes('loop:resume'));
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
  check('In Progress keeps the warehouse at its original URL', (await card.locator('.article-item-description').innerText()).includes('receiving dock'));
  check('The card loads the new Unity warehouse thumbnail', await card.locator('img').evaluate(image => image.naturalWidth === 1200 && image.currentSrc.includes('one-shift-unity')));
  await card.screenshot({path:path.join(dump,'archive-card.png')});
  console.log(checks.length + ' checks passed. Captures: ' + dump);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
