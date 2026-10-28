'use strict';
// Real compiled-player walkthrough. ReportState and the existing HUD callback
// are observed without changing the simulation. Every movement, look adjustment
// and transaction uses the normal keyboard, mouse and rendered office controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.SHIFT_OFFICE_DUMP || path.join(os.tmpdir(), 'one-shift-front-office-browser');
fs.mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { const body = fs.readFileSync(file); response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(body); }
  catch { response.writeHead(404).end(); }
});
const checks = [], states = [], messages = [], failures = [];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const angleDelta = (to, from) => ((to - from + 540) % 360) - 180;
const groundDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
let browser, page;
function check(label, condition) { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true, channel:process.env.SHIFT_BROWSER_CHANNEL || 'chrome',
    args:['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]});
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
          return report.apply(this, arguments);
        };
        return factory.apply(this, args).then(instance => { window.actualUnity = instance; return instance; });
      };
    }, true);
  });
  const prefix = 'ONE_SHIFT_STATE ';
  async function state(label) {
    const emitted = page.waitForEvent('console', {predicate:message => message.text().includes(prefix), timeout:15000});
    await page.evaluate(() => actualUnity.SendMessage('BrowserLifecycle', 'ReportState', ''));
    const line = (await emitted).text();
    const value = JSON.parse(line.slice(line.indexOf(prefix) + prefix.length).trim());
    states.push({label:label || '', at:Date.now(), ...value});
    fs.writeFileSync(path.join(output, 'latest-state.json'), JSON.stringify(value, null, 2));
    if (label) console.log(label + ' ' + JSON.stringify({position:value.playerPosition,yaw:value.playerYaw,hour:value.hour,frontDoorOpen:value.frontDoorOpen,parcelsArrived:value.parcelsArrived,parcelsReceived:value.parcelsReceived,carryingParcel:value.carryingParcel,computerOpen:value.computerOpen,cash:value.businessCash,deliveryBooked:value.businessDeliveryBooked,activeOrder:value.businessActiveOrder}));
    return value;
  }
  async function poll(label, predicate, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let current;
    do { current = await state(); if (predicate(current)) return current; await delay(120); }
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
    try { await poll(label, current => current.frameCount >= before.frameCount + 3 && predicate(current)); }
    finally { await page.keyboard.up('e'); }
    await delay(100);
    return state(label);
  }
  async function deskSnapshot() {
    return page.evaluate(() => JSON.parse(JSON.stringify(window.warehouseObservedHUD.computer)));
  }
  const stockQuantities = desk => JSON.stringify(desk.inventory.map(item => [item.id,item.quantity]));

  await page.goto(process.env.SHIFT_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/one-shift.html');
  await page.locator('#warehouse-sandbox').click();
  await page.waitForFunction(() => window.actualUnity && document.getElementById('warehouse-launcher').hidden, null, {timeout:240000});
  await page.bringToFront();
  await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await poll('Warehouse begins rendering', current => current.frameCount > 30 && !current.browserSuspended && current.timeScale > 0);
  // Unity can queue its browser pointer-lock request during the frame after
  // the first click. A fresh trusted click fulfills that pending request.
  await page.locator('#warehouse-canvas').click({position:{x:600,y:400}});
  await delay(200);
  console.log('POINTER_LOCK ' + await page.evaluate(() => document.pointerLockElement?.id || 'none'));
  const initial = await state('INITIAL');
  check('Actual version 9 sandbox exposes office and business observations', initial.buildVersion === 9 && typeof initial.frontDoorOpen === 'boolean' && Number.isFinite(initial.playerYaw) && Number.isFinite(initial.businessCash));
  check('The front door starts closed and the desk starts empty', !initial.frontDoorOpen && initial.parcelsReceived === 0 && !initial.carryingParcel);
  check('Walkthrough starts at the authored warehouse entrance', groundDistance(initial.playerPosition, [-4.6,0,-5.4]) < .2);

  let mouseX = 600, mouseY = 400, degreesPerPixel = .18, pitch = 0;
  async function relativeMouse(dx, dy) {
    mouseX += dx; mouseY += dy;
    await page.mouse.move(mouseX, mouseY);
    await delay(90);
  }
  const beforeCalibration = await state();
  await relativeMouse(80, 0);
  const afterCalibration = await state();
  const measured = angleDelta(afterCalibration.playerYaw, beforeCalibration.playerYaw) / 80;
  check('Native relative mouse input turns the actual player', Number.isFinite(measured) && measured > .02 && measured < 3);
  degreesPerPixel = measured;
  console.log('MOUSE_DEGREES_PER_PIXEL ' + degreesPerPixel);
  // The first click can contribute a mouse delta before lock is acquired.
  // Establish a known pitch using the controller's normal 85-degree look stop,
  // then look back up through native mouse motion. No reset or teleport is used.
  await relativeMouse(0, 1000);
  await relativeMouse(0, -85 / degreesPerPixel);
  pitch = 0;

  async function yawTo(target) {
    for (let pass = 0; pass < 8; pass++) {
      const current = await state();
      const error = angleDelta(target, current.playerYaw);
      if (Math.abs(error) < 1.2) return;
      const pixels = Math.max(-500, Math.min(500, error / degreesPerPixel));
      const parts = Math.max(1, Math.ceil(Math.abs(pixels) / 90));
      for (let i = 0; i < parts; i++) await relativeMouse(pixels / parts, 0);
    }
    const current = await state();
    assert.ok(Math.abs(angleDelta(target, current.playerYaw)) < 2, 'Mouse steering reaches requested view: ' + current.playerYaw + ' vs ' + target);
  }
  async function pitchTo(target) {
    const pixels = (target - pitch) / degreesPerPixel;
    const parts = Math.max(1, Math.ceil(Math.abs(pixels) / 80));
    for (let i = 0; i < parts; i++) await relativeMouse(0, pixels / parts);
    pitch = target;
  }
  async function aimAt(point) {
    const current = await state();
    const p = current.playerPosition;
    await yawTo(Math.atan2(point[0] - p[0], point[2] - p[2]) * 180 / Math.PI);
    await pitchTo(Math.atan2(p[1] + 1.65 - point[1], groundDistance(p, point)) * 180 / Math.PI);
    await delay(100);
  }
  async function walkTo(x, z, label, tolerance = .16) {
    await pitchTo(0);
    const goal = [x,0,z], deadline = Date.now() + 30000;
    let previous = await state(), stuck = 0;
    while (groundDistance(previous.playerPosition, goal) > tolerance && Date.now() < deadline) {
      const p = previous.playerPosition;
      const distance = groundDistance(p, goal);
      await yawTo(Math.atan2(x - p[0], z - p[2]) * 180 / Math.PI);
      await page.keyboard.down('w');
      await delay(Math.max(40, Math.min(300, (distance - tolerance * .5) / 2.8 * 1000)));
      await page.keyboard.up('w');
      await delay(60);
      const current = await state();
      if (groundDistance(current.playerPosition, previous.playerPosition) < .025) stuck++; else stuck = 0;
      assert.ok(stuck < 6, label + ' blocked at ' + JSON.stringify(current.playerPosition));
      previous = current;
    }
    check(label, groundDistance(previous.playerPosition, goal) <= tolerance + .04);
    return state(label);
  }

  // The parked forklift blocks the direct route. Walk around its north end,
  // then use the actual 1.5 m internal office doorway.
  await walkTo(-4.6, -1.8, 'Walk around the parked forklift');
  await walkTo(5.37, -1.8, 'Cross the warehouse to the office');
  await walkTo(5.37, -4.8, 'Pass through the internal office doorway');
  await walkTo(5.37, -7.0, 'Walk beside the parcel desk');
  await walkTo(6.5, -8.4, 'Approach the closed front door');
  await aimAt([9.8,1.22,-8.908]);
  await capture('office-single-computer-and-parcel-desk');
  await aimAt([6.5,1.3,-10]);
  await capture('front-door-closed');
  const opened = await use('Open the front door with E', current => current.frontDoorOpen);
  check('E opens the physical front door', opened.frontDoorOpen);
  await delay(800);
  await walkTo(6.5, -11.3, 'Walk through the front door onto the porch');
  await walkTo(6.5, -23.2, 'Walk down the front ramp to the business park');
  const outdoors = await state('OUTDOORS');
  check('The ramp reaches the lower parking lot', outdoors.playerPosition[1] < -1.1 && outdoors.playerPosition[1] > -1.5);
  await yawTo(0); await pitchTo(-12);
  await capture('warehouse-front-and-office');
  await yawTo(180); await pitchTo(-8);
  await capture('business-park-and-parcel-van');
  await pitchTo(72);
  await capture('first-person-worker-body');
  await walkTo(6.5, -11.3, 'Walk back up the accessible ramp');
  const arrived = await poll('Small parcels arrive through elapsed active play', current => current.parcelsArrived, 60000);
  check('Small parcels arrive independently of the pallet delivery', arrived.parcelsArrived && arrived.parcelsReceived === 0 && arrived.receivingTotal === 4);
  await aimAt([7.9,.695,-11.05]);
  await capture('parcel-delivery-on-porch');
  const picked = await use('Pick up a small parcel with E', current => current.carryingParcel);
  check('The player carries a parcel rather than receiving it automatically', picked.carryingParcel && picked.parcelsReceived === 0);
  await capture('carrying-parcel');
  await walkTo(6.5, -8.0, 'Carry the parcel back through the front door');
  await walkTo(7.75, -7.3, 'Carry the parcel to the left side of the dispatch desk');
  await aimAt([7.75,.815,-8.6]);
  await capture('parcel-at-office-desk');
  const received = await use('Receive the parcel at the desk with E', current => !current.carryingParcel && current.parcelsReceived === 1);
  check('The desk receives exactly the manually carried parcel', received.parcelsReceived === 1 && !received.carryingParcel);
  await aimAt([7.35,.93,-8.8]);
  await capture('parcel-received-on-desk');

  // The same desk holds the single business computer. Approach it on foot,
  // aim at the real monitor collider, then use the ordinary E interaction.
  await walkTo(9.8, -7.3, 'Walk along the dispatch desk to its computer');
  await aimAt([9.8,1.22,-8.908]);
  await page.waitForFunction(() => document.getElementById('warehouse-hint').textContent === 'Use warehouse computer');
  check('The physical monitor offers the computer interaction in reach', await page.locator('#warehouse-hint-key').innerText() === 'E');
  await capture('office-computer-in-world');
  await page.keyboard.down('e');
  try { await page.waitForSelector('#warehouse-computer', {state:'visible',timeout:10000}); }
  finally { await page.keyboard.up('e'); }
  const computerOpened = await state('COMPUTER_OPEN');
  check('E opens the actual office computer and releases mouse capture', computerOpened.computerOpen && computerOpened.browserSuspended && computerOpened.timeScale === 0 && await page.evaluate(() => document.pointerLockElement === null));
  await delay(350);
  const computerStill = await state('COMPUTER_STILL');
  check('Browsing the computer freezes warehouse frames and parcel state', computerStill.frameCount === computerOpened.frameCount && computerStill.hour === computerOpened.hour && computerStill.parcelsReceived === 1);
  const initialDesk = await deskSnapshot();
  check('Office cash and stock are supplied by the compiled game ledger', initialDesk.cash === computerOpened.businessCash && initialDesk.inventory.length === 3 && computerOpened.businessConservesCases);
  check('Small-parcel receipt cannot create pallet inventory', computerOpened.businessReceivedCases === 0 && initialDesk.inventory.every(item => item.quantity === 0));
  await capture('office-computer-stock');
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  const focusAtDesk = await state('COMPUTER_FOCUS_RETURN');
  check('Focus changes cannot close or resume the office computer', focusAtDesk.computerOpen && focusAtDesk.browserSuspended && focusAtDesk.frameCount === computerStill.frameCount && await page.locator('#warehouse-computer').isVisible());

  await page.locator('[data-desk-tab="purchases"]').click();
  const offer = initialDesk.orders.find(item => item.enabled);
  assert.ok(offer && offer.price > 0, 'The opening business has an available supplier quote');
  // A native double click must book only one pallet. The first reply disables
  // all supplier purchases because an actual delivery now owns the queue.
  await page.locator('#warehouse-orders button[data-action="order"][data-id="' + offer.id + '"]').dblclick();
  const purchased = await poll('Supplier purchase posts to the real ledger', current => current.businessDeliveryBooked && current.businessCash === computerOpened.businessCash - offer.price);
  const purchasedDesk = await deskSnapshot();
  check('Supplier double click debits exactly one quoted pallet and books delivery', purchased.businessCash === computerOpened.businessCash - offer.price && purchased.businessDeliveryBooked && purchasedDesk.cash === purchased.businessCash);
  check('A pending delivery disables every supplier purchase', await page.locator('#warehouse-orders button[data-action="order"]').evaluateAll(buttons => buttons.length === 3 && buttons.every(button => button.disabled)));
  check('Booking stock does not replace existing cargo or invent received cases', stockQuantities(purchasedDesk) === stockQuantities(initialDesk) && purchased.receivingTotal === computerOpened.receivingTotal && purchased.businessReceivedCases === computerOpened.businessReceivedCases && purchased.businessPurchasedCases === computerOpened.businessPurchasedCases && purchased.businessConservesCases);
  check('The supplier ledger contains one matching debit', purchasedDesk.ledger.length === initialDesk.ledger.length + 1 && purchasedDesk.ledger.filter(entry => entry.amount === -offer.price && entry.label.includes(offer.name)).length === 1);
  await capture('office-computer-supplier-booking');

  await page.locator('[data-desk-tab="customers"]').click();
  const request = purchasedDesk.contracts.find(item => item.enabled);
  assert.ok(request, 'An available customer order is offered');
  await page.locator('#warehouse-contracts button[data-action="contract"][data-id="' + request.id + '"]').click();
  const accepted = await poll('Accept the chosen retailer order', current => current.businessActiveOrder === request.id);
  const acceptedDesk = await deskSnapshot();
  const acceptedOrder = acceptedDesk.contracts.find(item => item.id === request.id);
  check('Accepting a customer order reserves no invented stock or payment', accepted.businessCash === purchased.businessCash && stockQuantities(acceptedDesk) === stockQuantities(purchasedDesk) && JSON.stringify(acceptedDesk.ledger) === JSON.stringify(purchasedDesk.ledger) && accepted.businessShippedCases === purchased.businessShippedCases && accepted.businessConservesCases);
  check('An unfilled accepted order offers release while dispatch remains unavailable', acceptedOrder.status === 'Accepted' && !acceptedOrder.enabled && acceptedOrder.secondaryCommand === 'cancel-contract' && acceptedOrder.secondaryEnabled && await page.locator('#warehouse-contracts button[data-action="cancel-contract"][data-id="' + request.id + '"]').isEnabled());
  await capture('office-computer-accepted-order');
  await page.locator('#warehouse-contracts button[data-action="cancel-contract"][data-id="' + request.id + '"]').click();
  const releasedOrder = await poll('Release the unfilled customer order', current => current.businessActiveOrder === '');
  const releasedDesk = await deskSnapshot();
  check('Releasing the order leaves cash, inventory, cases and ledger unchanged', releasedOrder.businessCash === accepted.businessCash && stockQuantities(releasedDesk) === stockQuantities(acceptedDesk) && JSON.stringify(releasedDesk.ledger) === JSON.stringify(acceptedDesk.ledger) && releasedOrder.businessReceivedCases === accepted.businessReceivedCases && releasedOrder.businessShippedCases === accepted.businessShippedCases && releasedOrder.businessConservesCases);
  check('Released order is available again and the stale release action is gone', releasedDesk.contracts.find(item => item.id === request.id).enabled && await page.locator('#warehouse-contracts button[data-action="cancel-contract"]').count() === 0);
  await page.locator('[data-desk-tab="ledger"]').click();
  check('Rendered ledger shows the real supplier transaction', (await page.locator('#warehouse-ledger').innerText()).includes(offer.name));
  await capture('office-computer-ledger');

  // Native UI pointer travel must not become a queued look delta on capture.
  await page.mouse.move(240, 180);
  await page.mouse.move(1050, 570);
  await page.locator('#warehouse-computer-close').click();
  await page.waitForSelector('#warehouse-computer', {state:'hidden'});
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas', null, {timeout:10000});
  const closedDesk = await poll('Close computer and resume the same warehouse', current => !current.computerOpen && !current.browserSuspended && current.frameCount >= releasedOrder.frameCount + 15);
  check('Closing the computer restores mouse control without another canvas click', !closedDesk.computerOpen && closedDesk.businessCash === purchased.businessCash && closedDesk.businessDeliveryBooked);
  check('Closing the computer discards modal pointer movement without changing the view', Math.abs(angleDelta(closedDesk.playerYaw, computerOpened.playerYaw)) < .5);
  await page.keyboard.down('s');
  await delay(300);
  await page.keyboard.up('s');
  const walkedFromDesk = await state('WALKED_FROM_DESK');
  check('Fresh movement works after leaving the computer', groundDistance(walkedFromDesk.playerPosition, closedDesk.playerPosition) > .25);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.pointerLockElement);
  await page.waitForSelector('#warehouse-paused', {state:'visible'});
  const paused = await state('PAUSED');
  await delay(1200);
  const still = await state('STILL_PAUSED');
  check('Pause freezes clock, camera frames and parcel progress', paused.browserSuspended && paused.timeScale === 0 &&
    still.frameCount === paused.frameCount && still.hour === paused.hour && still.parcelsReceived === paused.parcelsReceived && !still.carryingParcel);
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  const pausedAfterFocus = await state('MANUAL_PAUSE_FOCUS_RETURN');
  check('Browser focus cannot undo a manual pause after computer use', pausedAfterFocus.browserSuspended && pausedAfterFocus.frameCount === still.frameCount && await page.locator('#warehouse-paused').isVisible());
  await page.mouse.move(1050, 570);
  await page.mouse.move(240, 180);
  await page.locator('#warehouse-resume').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'warehouse-canvas');
  const resumed = await poll('Resume the same office session', current => !current.browserSuspended && current.frameCount >= still.frameCount + 15);
  check('Resume retains the open door, received parcel and business booking', resumed.frontDoorOpen && resumed.parcelsReceived === 1 && resumed.businessDeliveryBooked && resumed.businessCash === purchased.businessCash);
  check('Resume discards menu pointer movement without turning the player', Math.abs(angleDelta(resumed.playerYaw, still.playerYaw)) < .5);
  fs.writeFileSync(path.join(output, 'office-ledger-snapshots.json'), JSON.stringify({initialDesk,purchasedDesk,acceptedDesk,releasedDesk}, null, 2));
  check('No browser page errors or failed asset requests', failures.length === 0);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({checks,failures,mouseDegreesPerPixel:degreesPerPixel,states}, null, 2));
  console.log(checks.length + ' office walkthrough checks passed. Captures: ' + output);
})().catch(async error => {
  console.error(error);
  failures.push(error.stack || error.message);
  if (page) { try { await page.screenshot({path:path.join(output, 'failure.png'), timeout:60000}); } catch {} }
  process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(output, 'console.json'), JSON.stringify(messages, null, 2));
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states, null, 2));
  fs.writeFileSync(path.join(output, 'failures.json'), JSON.stringify(failures, null, 2));
  if (browser) await browser.close();
  server.close();
});
