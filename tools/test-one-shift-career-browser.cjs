'use strict';
// Native first-day walkthrough of the compiled career player. The two report
// methods and HUD callback are read-only observations. No state is teleported,
// spawned, purchased or changed through script injection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {classifyUnityConsole} = require('./one-shift-unity-console.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.SHIFT_CAREER_DUMP || path.join(os.tmpdir(), 'one-shift-career-browser');
const keepFailedOpen = process.env.SHIFT_CAREER_KEEP_FAILED_OPEN === '1';
const diagnosticPort = Number(process.env.SHIFT_CAREER_CDP_PORT || 9229);
fs.mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
const checks = [], states = [], messages = [], failures = [], deskSnapshots = [], phaseEvents = [];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const angleDelta = (to, from) => ((to - from + 540) % 360) - 180;
const groundDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const rotationDifference = (a, b) => Math.max(...a.map((value, i) => Math.abs(angleDelta(value, b[i]))));
const pitchOf = value => angleDelta(value.career.cameraRotation[0], 0);
const speedOf = box => Math.hypot(...box.velocity);
const boxAt = (value, sequence) => value.career.boxes.find(box => box.sequence === sequence);
let browser, page, currentStage = 'Opening browser';
function check(label, condition) { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); }
function observe(label, condition) {
  if(condition){check(label,true);return;}
  // Keep a non-blocking visual defect in the failed result while still testing
  // the physical trading cycle. This never turns a failed run into a pass.
  failures.push(label);console.error('FAIL ' + label);
}
function stage(label) { currentStage = label; phaseEvents.push({label,at:Date.now()}); console.log('STAGE ' + label); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true, channel:process.env.SHIFT_BROWSER_CHANNEL || 'chrome',
    args:['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
      ...(keepFailedOpen ? ['--remote-debugging-port=' + diagnosticPort] : [])]});
  const context = await browser.newContext({viewport:{width:1280,height:720}, deviceScaleFactor:1});
  page = await context.newPage();
  page.on('console', message => messages.push({type:message.type(),text:message.text()}));
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
  await page.addInitScript(() => {
    document.addEventListener('load', event => {
      if (event.target.tagName !== 'SCRIPT' || !event.target.src.includes('OneShiftWeb.loader.js')) return;
      const factory = window.createUnityInstance;
      if (typeof factory !== 'function') return;
      window.createUnityInstance = function(...args) {
        const report = args[1].onWarehouseHUD;
        args[1].onWarehouseHUD = function(payload) {
          window.warehouseObservedHUD = typeof payload === 'string' ? JSON.parse(payload) : payload;
          const computer=window.warehouseObservedHUD.computer;
          if(computer){
            const history=window.warehouseObservedTransitions || (window.warehouseObservedTransitions=[]);
            history.push({at:performance.now(),open:computer.open,transitioning:computer.transitioning,progress:computer.transitionProgress,direction:computer.transitionDirection});
            if(history.length>2000)history.shift();
          }
          return report.apply(this, arguments);
        };
        return factory.apply(this, args).then(instance => { window.actualUnity = instance; return instance; });
      };
    }, true);
  });
  async function report(method, prefix) {
    const emitted = page.waitForEvent('console', {predicate:message => message.text().includes(prefix), timeout:15000});
    await page.evaluate(method => actualUnity.SendMessage('BrowserLifecycle', method, ''), method);
    const line = (await emitted).text();
    return JSON.parse(line.slice(line.indexOf(prefix) + prefix.length).trim());
  }
  async function state(label) {
    const world = await report('ReportState', 'ONE_SHIFT_STATE ');
    const career = await report('ReportCareerState', 'WAREHOUSE_CAREER ');
    const value = {...world, career};
    states.push({label:label || '', at:Date.now(), ...value});
    fs.writeFileSync(path.join(output, 'latest-state.json'), JSON.stringify(value, null, 2));
    if (label) console.log(label + ' ' + JSON.stringify({position:value.playerPosition,yaw:value.playerYaw,
      camera:career.cameraRotation,cash:career.cash,purchased:career.purchased,received:career.received,
      shipped:career.shipped,holding:career.holdingSequence,courier:career.courierState,objective:career.objective}));
    return value;
  }
  async function poll(label, predicate, timeout = 20000, interval = 110) {
    const deadline = Date.now() + timeout;
    let current;
    do { current = await state(); if (predicate(current)) return current; await delay(interval); }
    while (Date.now() < deadline);
    throw new Error(label + ' timed out: ' + JSON.stringify(current));
  }
  async function capture(name) {
    const box = await page.locator('#warehouse-canvas').boundingBox();
    await page.screenshot({path:path.join(output, name + '.png'), clip:box, scale:'css', timeout:60000});
  }
  async function use(label, predicate) {
    const before = await state();
    await page.keyboard.down('e');
    try { await poll(label, value => value.frameCount >= before.frameCount + 2 && predicate(value)); }
    finally { await page.keyboard.up('e'); }
    await delay(110);
    return state(label);
  }
  async function deskSnapshot(label) {
    const value = await page.evaluate(() => JSON.parse(JSON.stringify(window.warehouseObservedHUD.computer)));
    deskSnapshots.push({label, ...value});
    return value;
  }
  async function pointerOwned() { return page.evaluate(() => document.pointerLockElement?.id === 'warehouse-canvas'); }

  await page.goto(process.env.SHIFT_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/one-shift.html');
  check('The default title offers a new business and a separate Sandbox',
    (await page.locator('#warehouse-play').innerText()).includes('Start business') && await page.locator('#warehouse-sandbox').isVisible());
  await page.locator('#warehouse-play').click();
  await page.waitForFunction(() => window.actualUnity && document.getElementById('warehouse-launcher').hidden, null, {timeout:240000});
  // Observe first-use work without altering Unity's scheduler or frame clock.
  // Ignore intervals while a modal, title or browser activity gate is active.
  await page.evaluate(() => {
    const probe = window.careerPerformance = {startedAt:Date.now(),timeOrigin:performance.timeOrigin,activeFrames:0,maxActiveFrameGapMs:0,frameGaps:[],longTasks:[],stopped:false};
    probe.observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) probe.longTasks.push({at:performance.timeOrigin+entry.startTime,duration:entry.duration});
    });
    probe.observer.observe({type:'longtask',buffered:false});
    let previous=performance.now(),previousActive=false;
    function frame(now) {
      if(probe.stopped)return;
      const active=document.getElementById('warehouse-stage').dataset.browserActive!=='false' &&
        document.getElementById('warehouse-launcher').hidden && !document.getElementById('warehouse-menu').open && !document.getElementById('warehouse-computer').open;
      if(active&&previousActive){
        const ms=now-previous;probe.activeFrames++;probe.maxActiveFrameGapMs=Math.max(probe.maxActiveFrameGapMs,ms);
        if(ms>50)probe.frameGaps.push({at:performance.timeOrigin+now,ms});
      }
      previous=now;previousActive=active;probe.raf=requestAnimationFrame(frame);
    }
    probe.raf=requestAnimationFrame(frame);
  });
  await page.bringToFront();
  await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await poll('Career begins rendering', value => value.frameCount > 30 && !value.browserSuspended && value.timeScale > 0);
  // Unity's first request can be queued until its next trusted browser event.
  // This click is only the initial capture; close/resume must work without one.
  if (!(await pointerOwned())) await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  await delay(250);
  const initial = await state('INITIAL');
  check('Version 9 starts the actual empty career with $600', initial.buildVersion === 9 && initial.career.mode === 'career' && initial.career.cash === 600);
  check('An empty career contains no cartons, racks, forklift or dock truck', initial.career.boxes.length === 0 &&
    initial.career.activeForklifts === 0 && initial.career.activeRackBays === 0 && !initial.career.dockTruckActive &&
    !initial.career.racks && !initial.career.forklift && initial.receivingTotal === 0);
  check('Opening capital and empty stock conserve exactly', initial.career.purchased === 0 && initial.career.received === 0 &&
    initial.career.shipped === 0 && initial.career.completedOrders === 0 && initial.career.conserves);
  check('The first goal points to starting the distribution business', initial.career.objective === 'Start your distribution business');
  await capture('career-empty-warehouse');

  let mouseX = 600, mouseY = 400, degreesPerPixel = .18;
  async function relativeMouse(dx, dy) {
    mouseX += dx; mouseY += dy;
    await page.mouse.move(mouseX, mouseY);
    await delay(100);
  }
  const beforeCalibration = await state();
  await relativeMouse(80, 0);
  const afterCalibration = await state();
  degreesPerPixel = angleDelta(afterCalibration.playerYaw, beforeCalibration.playerYaw) / 80;
  check('Native mouse movement controls the compiled walking camera', Number.isFinite(degreesPerPixel) && degreesPerPixel > .02 && degreesPerPixel < 3);
  console.log('MOUSE_DEGREES_PER_PIXEL ' + degreesPerPixel);
  async function yawTo(target) {
    for (let pass = 0; pass < 8; pass++) {
      const current = await state(), error = angleDelta(target, current.playerYaw);
      if (Math.abs(error) < 1.2) return;
      const pixels = Math.max(-500, Math.min(500, error / degreesPerPixel));
      const parts = Math.max(1, Math.ceil(Math.abs(pixels) / 80));
      for (let i = 0; i < parts; i++) await relativeMouse(pixels / parts, 0);
    }
    const current = await state();
    assert.ok(Math.abs(angleDelta(target, current.playerYaw)) < 2, 'Native yaw reaches ' + target + ', got ' + current.playerYaw);
  }
  async function pitchTo(target) {
    for (let pass = 0; pass < 8; pass++) {
      const current = await state(), error = target - pitchOf(current);
      if (Math.abs(error) < .8) return;
      const pixels = Math.max(-350, Math.min(350, error / degreesPerPixel));
      const parts = Math.max(1, Math.ceil(Math.abs(pixels) / 70));
      for (let i = 0; i < parts; i++) await relativeMouse(0, pixels / parts);
    }
    const current = await state();
    assert.ok(Math.abs(target - pitchOf(current)) < 1.5, 'Native pitch reaches ' + target + ', got ' + pitchOf(current));
  }
  async function aimAt(point) {
    const current = await state(), camera = current.career.cameraPosition;
    await yawTo(Math.atan2(point[0] - camera[0], point[2] - camera[2]) * 180 / Math.PI);
    await pitchTo(Math.atan2(camera[1] - point[1], groundDistance(camera, point)) * 180 / Math.PI);
    await delay(120);
  }
  async function walkTo(x, z, label, tolerance = .17) {
    let previous = await state(), stuck = 0;
    const held = previous.career.holdingSequence;
    // A slight downward view gives the carried carton room under door lintels.
    await pitchTo(held ? 8 : 0);
    const goal = [x,0,z], deadline = Date.now() + 40000;
    while (groundDistance(previous.playerPosition, goal) > tolerance && Date.now() < deadline) {
      const p = previous.playerPosition, remaining = groundDistance(p, goal);
      await yawTo(Math.atan2(x - p[0], z - p[2]) * 180 / Math.PI);
      await page.keyboard.down('w');
      try { await delay(Math.max(40, Math.min(280, (remaining - tolerance * .5) / 2.8 * 1000))); }
      finally { await page.keyboard.up('w'); }
      await delay(70);
      const current = await state();
      if (held) assert.equal(current.career.holdingSequence, held, label + ' keeps the physical carton in hand');
      if (groundDistance(current.playerPosition, previous.playerPosition) < .025) stuck++; else stuck = 0;
      assert.ok(stuck < 7, label + ' blocked at ' + JSON.stringify(current.playerPosition));
      previous = current;
    }
    check(label, groundDistance(previous.playerPosition, goal) <= tolerance + .05);
    return state(label);
  }
  async function openComputer(label, observeTransition = false) {
    await aimAt([9.8,1.22,-8.908]);
    await page.waitForFunction(() => document.getElementById('warehouse-hint').textContent === 'Use warehouse computer');
    const before = await state();
    await page.keyboard.down('e');
    let entering;
    try {
      entering = await poll('Camera starts its physical computer approach', value => value.career.transitioning && value.career.transitionProgress > .12 && value.career.transitionProgress < .85, 5000, 20);
    } finally { await page.keyboard.up('e'); }
    if (observeTransition) {
      check('The office camera moves before its desktop becomes visible', !entering.career.computerOpen &&
        !(await page.locator('#warehouse-computer').isVisible()) && distance(entering.career.cameraPosition, before.career.cameraPosition) > .002);
      check('Camera presentation advances with warehouse physics suspended', entering.frameCount > before.frameCount && entering.timeScale === 0);
    }
    await page.waitForSelector('#warehouse-computer', {state:'visible',timeout:10000});
    const opened = await state(label);
    check(label, opened.career.computerOpen && !opened.career.transitioning && opened.browserSuspended && opened.timeScale === 0 && !(await pointerOwned()));
    if (observeTransition) {
      check('The camera reaches the actual monitor view', distance(opened.career.cameraPosition, [9.8,1.22,-8.26]) < .025);
      await delay(400);
      const still = await state();
      check('The open desktop freezes simulation and frame scheduling', still.frameCount === opened.frameCount && still.hour === opened.hour &&
        still.career.cash === opened.career.cash && JSON.stringify(still.career.boxes) === JSON.stringify(opened.career.boxes));
    }
    return {before,opened,desk:await deskSnapshot(label)};
  }
  async function closeComputer(saved, label, observeTransition = false) {
    await page.mouse.move(230, 160);
    await page.mouse.move(1060, 565);
    const before=await state();
    await page.evaluate(()=>{window.warehouseObservedTransitions=[];});
    const pointer = await page.locator('#warehouse-computer-close').boundingBox();
    await page.locator('#warehouse-computer-close').click();
    if (pointer) { mouseX = pointer.x + pointer.width / 2; mouseY = pointer.y + pointer.height / 2; }
    await page.waitForSelector('#warehouse-computer', {state:'hidden'});
    const returned = await poll(label, value => !value.career.transitioning && !value.career.computerOpen && !value.browserSuspended && value.frameCount >= before.frameCount + 8);
    await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas', null, {timeout:10000});
    // Do not send any further click here. The trusted bezel button must capture
    // the pointer and leave the same camera ready for walking at the endpoint.
    await delay(250);
    const settled = await state(label);
    check(label, !settled.career.computerOpen && !settled.career.transitioning && await pointerOwned());
    if (observeTransition) {
      const trace=await page.evaluate(()=>window.warehouseObservedTransitions);
      fs.writeFileSync(path.join(output,'computer-return-transition.json'),JSON.stringify(trace,null,2));
      observe('The trusted Close action renders an intermediate return-camera state', trace.some(item=>item.direction==='out' && item.transitioning && item.progress>0 && item.progress<1));
      check('Closing the desktop restores position and view despite modal pointer travel',
        distance(settled.career.cameraPosition, saved.career.cameraPosition) < .04 &&
        rotationDifference(settled.career.cameraRotation, saved.career.cameraRotation) < .6 &&
        groundDistance(settled.playerPosition, saved.playerPosition) < .02 && returned.frameCount > before.frameCount);
    }
    return settled;
  }
  async function setCarryDistance(target) {
    let current = await state();
    assert.ok(current.career.holding, 'Distance adjustment requires the actual held carton');
    for (let i = 0; i < 16 && Math.abs(current.career.holdDistance - target) > .12; i++) {
      await page.mouse.wheel(0, current.career.holdDistance > target ? 120 : -120);
      await delay(100);
      current = await state();
    }
    assert.ok(Math.abs(current.career.holdDistance - target) < .3, 'Native wheel reaches carry distance ' + target + ', got ' + current.career.holdDistance);
    return current;
  }
  async function pickCarton(sequence, label, click = false) {
    const before = await state(), carton = boxAt(before, sequence);
    assert.ok(carton && !carton.transit, 'The chosen carton exists outside carrier transit');
    await aimAt(carton.position);
    await page.waitForFunction(() => document.getElementById('warehouse-hint').textContent.startsWith('Pick up '));
    if (click) {
      await page.mouse.down();
      try { await poll(label, value => value.career.holdingSequence === sequence); }
      finally { await page.mouse.up(); }
    } else await use(label, value => value.career.holdingSequence === sequence);
    await setCarryDistance(1.05);
    const held = await state(label);
    check(label, held.career.holding && held.career.holdingSequence === sequence && held.career.conserves);
    return held;
  }
  async function putCarton(point, sequence, label, mustStore) {
    await aimAt(point);
    // Push the swept hold target toward the support surface. The collider stops
    // it on that surface; the test never moves or snaps the body itself.
    await setCarryDistance(2.35);
    await delay(350);
    await use(label + ' release', value => !value.career.holding);
    const settled = await poll(label, value => {
      const box = boxAt(value, sequence);
      return box && !value.career.holding && speedOf(box) < .15 && (!mustStore || box.stored);
    }, 12000);
    check(label, !settled.career.holding && settled.career.conserves && (!mustStore || boxAt(settled, sequence).received));
    return settled;
  }
  async function floorToPorch(label) {
    await walkTo(5.37, -1.8, label + ': cross to the office');
    await walkTo(5.37, -4.8, label + ': pass the internal doorway');
    await walkTo(5.37, -7.0, label + ': pass beside the desk');
    await walkTo(6.5, -8.0, label + ': line up with the front door');
    await walkTo(6.5, -11.3, label + ': pass onto the porch');
  }
  async function porchToFloor(label) {
    await walkTo(6.5, -8.0, label + ': carry through the front door');
    await walkTo(5.37, -7.0, label + ': pass beside the desk');
    await walkTo(5.37, -4.8, label + ': reach the internal doorway');
    await walkTo(5.37, -1.8, label + ': return to the warehouse floor');
  }

  stage('First purchase and camera handoff');
  // Enter through the real north office doorway, rather than through its wall.
  await walkTo(-4.6, -1.8, 'Walk north across the empty warehouse');
  await walkTo(5.37, -1.8, 'Approach the office doorway from the warehouse');
  await walkTo(5.37, -4.8, 'Walk through the internal office doorway');
  await walkTo(5.37, -7.0, 'Walk beside the dispatch desk');
  await walkTo(9.8, -7.3, 'Approach the single business computer');
  await capture('career-computer-in-world');
  const firstDesk = await openComputer('Open the business desktop with E', true);
  check('The first desktop presents the starter supplier and real opening balance', firstDesk.desk.company === 'Latchford Distribution' &&
    firstDesk.desk.cash === 600 && firstDesk.desk.suggestedTab === 'purchases' && firstDesk.desk.completedOrders === 0 &&
    firstDesk.desk.inventory.every(item => item.quantity === 0));
  check('Only the three-carton starter purchase is initially available', firstDesk.desk.orders.find(item => item.id === 'tape').price === 120 &&
    firstDesk.desk.orders.find(item => item.id === 'tape').enabled && firstDesk.desk.orders.filter(item => item.enabled).length === 1 &&
    firstDesk.desk.contracts.every(item => !item.enabled) && firstDesk.desk.upgrades.every(item => !item.enabled && !item.owned));
  await capture('career-first-desktop');
  await page.locator('#warehouse-orders button[data-action="order"][data-id="tape"]').dblclick();
  const bought = await poll('Starter purchase reaches the authoritative ledger', value => value.career.cash === 480 && value.career.purchased === 3 && value.career.deliveryPending);
  const boughtDesk = await deskSnapshot('Starter purchase');
  check('A supplier double click buys exactly three cartons for one $120 debit', bought.career.boxes.length === 3 && bought.career.received === 0 &&
    bought.career.shipped === 0 && bought.career.conserves && boughtDesk.ledger.length === firstDesk.desk.ledger.length + 1 &&
    boughtDesk.ledger.filter(entry => entry.amount === -120).length === 1);
  check('Inbound cartons cannot be promised to a customer before physical putaway', boughtDesk.contracts.every(item => !item.enabled) &&
    boughtDesk.inventory.every(item => item.quantity === 0) && boughtDesk.orders.every(item => !item.enabled));
  check('The purchase changes the next task to meeting the driver', bought.career.objective === 'Meet your delivery driver');
  await closeComputer(firstDesk.before, 'Return from the computer to the same view', true);

  stage('Pause preserves the pending delivery');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#warehouse-paused', {state:'visible'});
  const paused = await state('PAUSED');
  await delay(600);
  const still = await state('STILL_PAUSED');
  check('Manual pause freezes the pending delivery, clock, bodies and render loop', still.browserSuspended && still.timeScale === 0 &&
    still.frameCount === paused.frameCount && still.hour === paused.hour && still.career.cash === 480 &&
    still.career.courierState === paused.career.courierState && JSON.stringify(still.career.boxes) === JSON.stringify(paused.career.boxes));
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  const focusReturn = await state();
  check('Returning browser focus cannot undo the deliberate pause', focusReturn.frameCount === still.frameCount && await page.locator('#warehouse-paused').isVisible());
  const resumeBox = await page.locator('#warehouse-resume').boundingBox();
  await page.locator('#warehouse-resume').click();
  if (resumeBox) { mouseX = resumeBox.x + resumeBox.width / 2; mouseY = resumeBox.y + resumeBox.height / 2; }
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  await poll('Resume the actual pending delivery', value => !value.browserSuspended && value.frameCount > still.frameCount + 8);

  stage('Receive the delivery through the front door');
  await walkTo(6.5, -8.4, 'Walk from the desk to the front door');
  await aimAt([6.5,1.3,-10]);
  await use('Open the physical front door with E', value => value.frontDoorOpen);
  await delay(750);
  await walkTo(6.5, -11.3, 'Step onto the porch to meet the driver');
  // The carrier's hands project ahead of its body as it turns across the
  // landing. Wait beside the doorway, clear of that real carton sweep.
  await walkTo(6.5, -10.7, 'Leave room for the courier to turn onto the porch');
  await yawTo(180);
  await capture('career-delivery-approach');
  const delivered = await poll('The courier physically delivers all three cartons', value => !value.career.deliveryPending &&
    value.career.boxes.length === 3 && value.career.boxes.every(box => !box.transit && speedOf(box) < .3), 180000, 350);
  check('Delivery leaves real porch cartons with nothing received automatically', delivered.career.cash === 480 && delivered.career.received === 0 &&
    delivered.career.boxes.every(box => !box.received && !box.stored && box.position[0] > 7.5 && box.position[0] < 9 && box.position[2] < -10) && delivered.career.conserves);
  check('The next goal explains physical putaway', delivered.career.objective === 'Put your cartons away');
  await walkTo(6.5, -11.3, 'Approach the completed delivery on the porch');
  await aimAt(delivered.career.boxes[0].position);
  await capture('career-three-cartons-on-porch');

  // Lift the highest carton first, so the test does not pull a supporting
  // carton out from below another body on the delivery shelf.
  const receivingOrder = delivered.career.boxes.slice().sort((a,b) => Math.abs(b.position[1] - a.position[1]) > .05 ?
    b.position[1] - a.position[1] : a.position[0] - b.position[0]).map(box => box.sequence);
  const floorSpots = [[-4.1,.2,-2.22],[-3.1,.2,-2.22],[-3.6,.2,-1.35]];
  for (let index = 0; index < receivingOrder.length; index++) {
    stage('Put away carton ' + (index + 1) + ' of 3');
    if (index) await floorToPorch('Return for carton ' + (index + 1));
    const sequence = receivingOrder[index];
    const picked = await pickCarton(sequence, 'Pick up delivered carton ' + sequence + ' with ' + (index === 1 ? 'the primary mouse button' : 'E'), index === 1);
    if (index === 0) {
      check('Pickup leaves the carton unreceived and shows its contextual controls', picked.career.received === 0 &&
        await page.locator('#warehouse-carry').isVisible() && (await page.locator('#warehouse-carry').innerText()).includes('Right mouse'));
      const near = await state();
      await page.mouse.wheel(0, -120); await delay(160);
      const farther = await state();
      check('The native mouse wheel changes the actual held distance within its limits', farther.career.holdDistance > near.career.holdDistance + .1 &&
        farther.career.holdDistance <= 2.401 && farther.career.holdDistance >= 1);
      await setCarryDistance(1.05);
      await pitchTo(0);
      await delay(300);
      const beforeRotate = await state();
      await page.mouse.down({button:'right'});
      try { await relativeMouse(50, 0); await delay(300); }
      finally { await page.mouse.up({button:'right'}); }
      const rotated = await state();
      check('Right mouse rotates the physical carton while holding the camera still', rotated.career.holdingSequence === sequence &&
        rotationDifference(rotated.career.cameraRotation, beforeRotate.career.cameraRotation) < .8 &&
        rotationDifference(boxAt(rotated, sequence).rotation, boxAt(beforeRotate, sequence).rotation) > 3);
      await page.mouse.down({button:'right'});
      try { await relativeMouse(-50, 0); await delay(200); }
      finally { await page.mouse.up({button:'right'}); }
      await capture('career-native-carton-controls');
    }
    await porchToFloor('Carton ' + sequence);
    await walkTo(floorSpots[index][0], -.2, 'Carry carton ' + sequence + ' to its marked floor bay');
    await putCarton(floorSpots[index], sequence, 'Set carton ' + sequence + ' on the stock-bay floor', true);
    const stored = await state();
    check('Carton ' + sequence + ' is received exactly once by physical support in its bay', stored.career.received === index + 1 &&
      stored.career.purchased === 3 && stored.career.shipped === 0 && stored.career.cash === 480 && stored.career.conserves);
  }
  const storedAll = await state('ALL_STORED');
  check('All three cartons are stored before the customer goal becomes available', storedAll.career.boxes.every(box => box.stored && box.received) &&
    storedAll.career.objective === 'Book a customer collection');
  await aimAt([-3.6,.25,-1.8]);
  await capture('career-three-cartons-stored');

  stage('Accept the first real customer collection');
  await walkTo(5.37, -1.8, 'Return to the office for the customer order');
  await walkTo(5.37, -4.8, 'Enter the office with the stock stored');
  await walkTo(5.37, -7.0, 'Walk beside the desk for the customer order');
  await walkTo(9.8, -7.3, 'Reach the computer with received stock');
  await poll('Delivery driver finishes the visit before another van can be booked', value => value.career.courierState === 'Idle', 90000, 350);
  const customerDesk = await openComputer('Open customer orders after physical putaway');
  const tape = customerDesk.desk.inventory.find(item => item.id === 'tape');
  const customer = customerDesk.desk.contracts.find(item => item.id === 'tape');
  check('The computer sees exactly three received cartons and the $210 local order', tape.quantity === 3 && tape.unit.startsWith('cartons') && customer.enabled && customer.price === 210);
  await page.locator('[data-desk-tab="customers"]').click();
  await page.locator('#warehouse-contracts button[data-action="contract"][data-id="tape"]').dblclick();
  const accepted = await poll('Book the real collection van', value => value.career.activeOrder !== '' && value.career.boxes.every(box => box.reserved));
  const acceptedDesk = await deskSnapshot('Accepted first customer');
  check('Acceptance reserves the same three cartons without payment or duplicate debit', accepted.career.cash === 480 && accepted.career.received === 3 &&
    accepted.career.shipped === 0 && accepted.career.completedOrders === 0 && accepted.career.boxes.length === 3 &&
    accepted.career.conserves && JSON.stringify(acceptedDesk.ledger) === JSON.stringify(customerDesk.desk.ledger));
  check('A booked collection disables competing customer and supplier transactions', acceptedDesk.contracts.every(item => !item.enabled) && acceptedDesk.orders.every(item => !item.enabled));
  await capture('career-collection-booked');
  await closeComputer(customerDesk.before, 'Return to physically load the customer cartons');

  stage('Load the collection van');
  await walkTo(5.37, -7.0, 'Leave the desk for the stock bay');
  await walkTo(5.37, -4.8, 'Leave the office through the internal doorway');
  await walkTo(5.37, -1.8, 'Return to the marked stock');
  await walkTo(-3.6, -.2, 'Approach the stored cartons for collection');
  const vanReady = await poll('The pickup van parks and opens its loading ramp', value => value.career.loadingReady === true && value.career.courierState === 'WaitingForLoading', 180000, 350);
  check('The parked collection has three real loading positions', Array.isArray(vanReady.career.loadingSpots) && vanReady.career.loadingSpots.length >= 3 &&
    Array.isArray(vanReady.career.vanPosition) && groundDistance(vanReady.career.vanPosition, [3,-1.3325,-28.2]) < .2);
  const loadingSpots = vanReady.career.loadingSpots.slice(0,3).map(point => [point.x,point.y,point.z]).sort((a,b) => a[2] - b[2]);
  // Take the nearest northern carton first so it cannot block a farther one.
  const shippingOrder = storedAll.career.boxes.slice().sort((a,b) => b.position[2] - a.position[2]).map(box => box.sequence);
  for (let index = 0; index < shippingOrder.length; index++) {
    stage('Load carton ' + (index + 1) + ' of 3');
    if (index) {
      await walkTo(3, -23.3, 'Leave the loading ramp for carton ' + (index + 1));
      await walkTo(3, -22.65, 'Walk clear of the waiting driver');
      await walkTo(6.5, -22.65, 'Return along the front walk');
      await walkTo(6.5, -11.3, 'Walk up the front access ramp');
      await porchToFloor('Collection carton ' + (index + 1));
      await walkTo(-3.6, -.2, 'Reach the remaining stock');
    }
    const sequence = shippingOrder[index], current = await state(), carton = boxAt(current, sequence);
    await walkTo(carton.position[0], carton.position[2] + 1.35, 'Approach reserved carton ' + sequence);
    await pickCarton(sequence, 'Lift the actual reserved carton ' + sequence);
    await floorToPorch('Reserved carton ' + sequence);
    await walkTo(6.5, -22.65, 'Carry carton ' + sequence + ' down the front ramp');
    // The driver waits at (5.8,-23.45). Use the clear pavement in front of
    // them instead of trying to carry a physical carton through their body.
    await walkTo(3, -22.65, 'Carry carton ' + sequence + ' around the waiting driver');
    await walkTo(3, -23.3, 'Carry carton ' + sequence + ' to the van ramp');
    const spot = loadingSpots[index];
    await walkTo(3, Math.min(-25.5, spot[2] + 1.2), 'Carry carton ' + sequence + ' into the open van');
    await putCarton(spot, sequence, 'Lower carton ' + sequence + ' onto the van floor', false);
    const loaded = await poll('The van recognizes supported carton ' + sequence, value => value.career.loadedCount >= index + 1, 12000);
    check('Loading carton ' + sequence + ' preserves its identity and defers payment', boxAt(loaded, sequence).reserved &&
      loaded.career.cash === 480 && loaded.career.shipped === 0 && loaded.career.completedOrders === 0 && loaded.career.conserves);
    if (index === shippingOrder.length - 1) {
      await capture('career-loaded-collection-van');
      await delay(600);
      const inside = await state();
      check('The van waits while the player remains in its loading area', inside.career.cash === 480 && inside.career.shipped === 0 && inside.career.activeOrder === accepted.career.activeOrder);
    }
  }
  await walkTo(3, -23.3, 'Step out of the loaded van and clear its ramp');
  await walkTo(3, -22.65, 'Walk clear of the driver before departure');
  await walkTo(6.5, -22.65, 'Stand safely beside the departing collection');
  await aimAt([3,.2,-28.2]);
  const leaving = await poll('The loaded van starts its real departure', value => ['DepartureWarning','DrivingOut'].includes(value.career.courierState), 30000, 120);
  check('Payment remains pending while the loaded van is departing', leaving.career.cash === 480 && leaving.career.shipped === 0 && leaving.career.conserves);
  await capture('career-collection-departure');
  const paid = await poll('The completed departure pays the first customer order', value => value.career.completedOrders === 1 && value.career.cash === 690, 180000, 350);
  check('The first full physical order pays exactly $210 and conserves all stock', paid.career.purchased === 3 && paid.career.received === 3 &&
    paid.career.shipped === 3 && paid.career.boxes.length === 0 && paid.career.activeOrder === '' && paid.career.conserves);
  check('The completed delivery leads to the next purchase goal', paid.career.objective === 'Place your next purchase order');

  stage('Verify the repeat trade and unlocked first reward');
  await walkTo(6.5, -11.3, 'Return up the ramp after the paid collection');
  await walkTo(6.5, -8.0, 'Reenter the office after the first completed order');
  await walkTo(9.8, -7.3, 'Return to the computer with earned working cash');
  const finalDesk = await openComputer('Review the completed order in the business desktop');
  check('The real ledger records one purchase and one customer payment', finalDesk.desk.cash === 690 && finalDesk.desk.completedOrders === 1 &&
    finalDesk.desk.ledger.filter(entry => entry.amount === -120).length === 1 && finalDesk.desk.ledger.filter(entry => entry.amount === 210).length === 1 &&
    finalDesk.desk.inventory.every(item => item.quantity === 0));
  check('The next three carton suppliers unlock while pallet equipment still requires experience', ['tape','towels','gloves'].every(id => finalDesk.desk.orders.find(item => item.id === id).enabled) &&
    !finalDesk.desk.upgrades.find(item => item.id === 'racks').enabled && !finalDesk.desk.upgrades.find(item => item.id === 'forklift').enabled &&
    finalDesk.desk.upgrades.find(item => item.id === 'fish').enabled && !finalDesk.desk.upgrades.find(item => item.id === 'flames').enabled);
  await page.locator('[data-desk-tab="ledger"]').click();
  await capture('career-first-order-paid-ledger');
  await page.locator('[data-desk-tab="upgrades"]').click();
  await capture('career-first-order-upgrades');
  await page.locator('[data-desk-tab="purchases"]').click();
  await page.locator('#warehouse-orders button[data-action="order"][data-id="towels"]').dblclick();
  const repeat = await poll('A new supplier books the second trade', value => value.career.cash === 530 && value.career.purchased === 7 && value.career.deliveryPending);
  const repeatDesk = await deskSnapshot('Second purchase');
  check('A repeat order buys four shop-towel cartons for exactly $160', repeat.career.boxes.length === 4 && repeat.career.boxes.every(box => box.product === 'towels') &&
    repeat.career.received === 3 && repeat.career.shipped === 3 && repeat.career.completedOrders === 1 && repeat.career.conserves &&
    repeatDesk.ledger.filter(entry => entry.amount === -160).length === 1);
  check('The repeat trade again requires delivery and physical putaway', repeatDesk.inventory.every(item => item.quantity === 0) &&
    repeatDesk.contracts.every(item => !item.enabled) && repeat.career.objective === 'Meet your delivery driver');
  await capture('career-repeat-purchase');
  const diagnostics = classifyUnityConsole(messages);
  fs.writeFileSync(path.join(output, 'console-diagnostics.json'), JSON.stringify(diagnostics, null, 2));
  if (diagnostics.startupProbeWarnings.length) console.log('KNOWN STARTUP WARNINGS: ' + diagnostics.startupProbeWarnings.length + ' Unity internal-format probes (retained in console report)');
  if (diagnostics.unusedShaderWarnings.length) console.log('UNUSED ENGINE SHADERS: ' + diagnostics.unusedShaderWarnings.length + ' startup discoveries (retained in console report)');
  if (diagnostics.shaderFailures.length) console.error(JSON.stringify(diagnostics.shaderFailures, null, 2));
  check('No browser errors or failed player assets occurred', failures.length === 0 && diagnostics.shaderFailures.length === 0);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({checks,failures,mouseDegreesPerPixel:degreesPerPixel,final:repeat}, null, 2));
  console.log(checks.length + ' native career walkthrough checks passed. Captures: ' + output);
})().catch(async error => {
  console.error('FAILED STAGE ' + currentStage);
  console.error(error);
  failures.push(error.stack || error.message);
  if (page) { try { await page.screenshot({path:path.join(output, 'failure.png'), timeout:60000}); } catch {} }
  process.exitCode = 1;
}).finally(async () => {
  if(page&&!page.isClosed()){
    try{
      const performanceReport=await page.evaluate(()=>{
        const probe=window.careerPerformance;if(!probe)return null;
        probe.stopped=true;cancelAnimationFrame(probe.raf);probe.observer.disconnect();
        return {startedAt:probe.startedAt,endedAt:Date.now(),activeFrames:probe.activeFrames,maxActiveFrameGapMs:probe.maxActiveFrameGapMs,frameGaps:probe.frameGaps,longTasks:probe.longTasks};
      });
      fs.writeFileSync(path.join(output,'first-use-performance.json'),JSON.stringify({phases:phaseEvents,...performanceReport},null,2));
    }catch{}
  }
  fs.writeFileSync(path.join(output, 'console.json'), JSON.stringify(messages, null, 2));
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states, null, 2));
  fs.writeFileSync(path.join(output, 'desk-snapshots.json'), JSON.stringify(deskSnapshots, null, 2));
  fs.writeFileSync(path.join(output, 'failures.json'), JSON.stringify({stage:currentStage,failures,checks}, null, 2));
  if(keepFailedOpen&&failures.length&&browser){
    console.log('Failed browser retained for native inspection at http://127.0.0.1:' + diagnosticPort + '. Send a line to stdin to close it.');
    process.stdin.resume();
    await new Promise(resolve => { process.stdin.once('data', resolve); browser.once('disconnected', resolve); });
    process.stdin.pause();
  }
  if (browser) await browser.close();
  server.close();
});
