// Diagnostic A/B rig-contact comparison. Uses a private Chrome for Testing child.
// node tools/test-soft-contact.mjs
// FPS=60 SPEEDS=350 CASES=drop-center,drop-left,push-right DUMP=/tmp/my-run
// BUNDLE=/tmp/another-sluice.js selects a snapshot; otherwise the built bundle is read once.
// Broad health assertions intentionally do not assert that numerical metrics establish feel.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8231), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-contact';
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const speeds = (process.env.SPEEDS || '150,350,650').split(',').map(Number);
const selected = (process.env.CASES || 'drop-center,drop-left,drop-right,push-left,push-right').split(',');
assert.ok(rates.every(fps => fps >= 20 && fps <= 240), 'FPS is between 20 and 240');
assert.ok(speeds.every(speed => speed > 0 && speed <= 1000), 'SPEEDS are positive and bounded');
assert.ok(selected.every(name => /^(drop-(center|left|right)|push-(left|right))$/.test(name)), 'known CASES');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('function softContactBody('), 'built bundle contains contact experiment');
const servedBundle = bundle.slice(0, end) + '\nwindow.__contactTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-contact-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const filename = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!filename.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    const data = filename === path.join(root, 'js/sluice.js') ? servedBundle : fs.readFileSync(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
let chrome, socket, watchdog, sequence = 0, cleaned = false;
const pending = new Map(), browserErrors = [], failures = [], results = [];
let noContact, continuity, inactive, ui;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  clearTimeout(watchdog);
  try { socket?.close(); } catch {}
  chrome?.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__contactTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  watchdog = setTimeout(() => { console.error('FAIL comparison exceeded eight minutes'); cleanup(); process.exit(1); }, 480000);
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
      endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(endpoint, 'testing browser started');
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      message.error ? request?.reject(message.error) : request?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      browserErrors.push(message.params.args.map(value => value.value || value.description));
    }
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1` });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate(`typeof __contactTest === 'function' && __contactTest("introPhase === 'done'")`)) break;
    await sleep(100);
  }
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && typeof SOFT_CONTACT === 'boolean'"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__contactPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  await game(`window.__runContactCase = function(spec) {
    var nativeRandom = Math.random, nativeNow = performance.now, clock = 100000, randomState = 314159265;
    Math.random = function() { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    performance.now = function() { return clock; };
    var deterministicClock = performance.now() === clock;
    var frames = [], b, floor = SKY_ROWS * TILE, x = (DECK_CENTER_COL - 9) * TILE, dt = 1 / spec.fps;
    try {
      if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
      resetJello(); skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;
      SOFT_CONTACT = false; softContactFrame = null; softContactOrigin = null;
      if (typeof softContactSupport !== 'undefined') softContactSupport = null;
      if (typeof softContactDraw !== 'undefined') softContactDraw = null;
      Object.keys(softContactReport).forEach(function(key) { softContactReport[key] = 0; });
      Object.keys(keys).forEach(function(key) { keys[key] = false; });
      dpad.left = dpad.right = dpad.up = dpad.down = false;
      Object.assign(player, JSON.parse(JSON.stringify(window.__contactPlayerInitial)));
      gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = false;
      shopState = 'closed'; bathMode = false; drilling = null; hitPauseT = 0;
      player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
      player.thrusting = false; player.thrustSpool = 0; player._thrustWas = false;
      player.jelloGroundT = 0; player.jelloImpactVy = 0; player.jelloCarryVx = 0;
      player.onJello = false; player.onGround = true; player.airTime = 0;
      player.hull = 100000; player.fuel = Math.max(100, player.fuel);
      for (var row = Math.max(0, SKY_ROWS - 9); row <= SKY_ROWS + 5; row++) {
        for (var col = DECK_CENTER_COL - 26; col <= DECK_CENTER_COL + 10; col++) {
          world[row][col] = row >= SKY_ROWS ? { type: 'stone', hp: 100 } : null;
          invalidateTerrainAround(row, col);
        }
      }
      for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
      b = surfaceSlimeBuild(x, floor - 36, { id: 91001, seed: 0.46, hue: 133, home: x, r: 24.3 });
      if (!b) throw new Error('resident was not constructed');
      player.x = x - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
      player.renderX = player.x; player.renderY = player.y;
      cam.x = x - screenW / 2; cam.y = floor - screenH * 0.6;
      // Keep all baseline locomotion and material code live during settling.
      // The same seed, virtual clock, inputs, and settle duration precede both modes.
      for (var settle = 0; settle < spec.fps * 1.5; settle++) {
        clock += dt * 1000; surfaceSlimeTick(dt); updateJello(dt);
      }
      var initialX = b.cx, initialY = b.cy, initialHeight = b.bboxB - b.bboxT;
      var initialArea = ringArea(b), direction = spec.name.endsWith('left') ? -1 : 1;
      var drop = spec.name.indexOf('drop-') === 0, passive = !!spec.noContact;
      SOFT_CONTACT = spec.experimental; softContactFrame = null; softContactOrigin = null;
      if (typeof softContactSupport !== 'undefined') softContactSupport = null;
      if (typeof softContactDraw !== 'undefined') softContactDraw = null;
      Object.keys(softContactReport).forEach(function(key) { softContactReport[key] = 0; });
      if (drop) {
        var offset = spec.name === 'drop-center' ? 0 : direction * b.surfaceSlime.radius * 0.55;
        player.x = b.cx + offset - PLAYER_W / 2;
        // Position from the rested skin, not the construction height.
        var actualTop = jelloRingCross(b, true, player.x + PLAYER_W / 2, false);
        if (!isFinite(actualTop)) actualTop = b.bboxT;
        player.y = actualTop - PLAYER_H - 5; player.vx = 0; player.vy = spec.speed;
        player.onGround = false;
      } else {
        player.x = direction > 0 ? b.bboxL - PLAYER_W - 10 : b.bboxR + 10;
        player.y = floor - PLAYER_H; player.vx = direction * 150; player.vy = 0;
        player.onGround = true;
      }
      if (passive) { player.x = b.cx - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0; }
      player.onJello = false; player.renderX = player.x; player.renderY = player.y;
      var result = { name: spec.name, mode: spec.experimental ? 'contact' : 'baseline', fps: spec.fps,
        requestedSpeed: spec.speed, deterministicClock: deterministicClock,
        finite: true, alive: true, maxRigJump: 0, maxNodeJump: 0, maxCenterJump: 0,
        maxPenetration: 0, maxSkinInsideHull: 0, maxVisualPenetration: 0,
        maxSolvedPenetration: 0, maxSolvedSkinInsideHull: 0,
        maxPendingPenetration: 0, maxPendingSkinInsideHull: 0, maxPendingPenetrationExcess: 0,
        terrainPointFrames: 0, maxTerrainDepth: 0, maxInvertedTriangles: 0,
        maxSevereInvertedTriangles: 0, minTriangleDet: 1,
        maxRingCrossings: 0, minAreaRatio: 1, maxAreaRatio: 1,
        minHeight: initialHeight, maxHeight: initialHeight, maxRigUpSpeed: 0,
        groundedFrames: 0, contactFrames: 0, maxReportedContact: 0,
        selfContactCorrections: 0, firstSelfContact: null,
        firstContactTime: null, firstContactVy: null, peakBodyRealSpeed: 0,
        zeroStepFrames: 0, zeroStepPendingFrames: 0, supportLostOnZeroStep: 0,
        closingSupportLostOnZeroStep: 0,
        supportLossEvents: [], firstCross: null,
        initial: { cx: b.cx, cy: b.cy, top: b.bboxT, height: initialHeight, area: initialArea,
          rigX: player.x, rigY: player.y, state: b.surfaceSlime.state }, samples: [] };
      var prevX = Array.from(b.px), prevY = Array.from(b.py), prevRigX = player.x, prevRigY = player.y;
      var lastSolvedRigX = player.x, lastSolvedRigY = player.y;
      var prevCx = b.cx, prevCy = b.cy, firstContact = null, captureIndex = 0;
      var captureOffsets = [0, 0.05, 0.10, 0.20, 0.40, 0.80];
      var duration = spec.seconds || (drop ? 2.5 : 3.0), fingerprints = [];
      result.material = materialState();
      var initialMaterial = JSON.stringify(result.material);
      result.materialUnchangedFrames = 0; result.firstMaterialChange = null;
      for (var frame = 0; frame < Math.ceil(spec.fps * duration); frame++) {
        var elapsed = frame * dt; clock += dt * 1000;
        if (spec.pause && frame === Math.round(spec.fps * 0.75)) {
          var frozenPose = JSON.stringify([Array.from(b.px), Array.from(b.py), player.x, player.y]);
          gamePaused = true; shopState = 'main';
          for (var wait = 0; wait < 180; wait++) {
            clock += 1000 / 60; update(1 / 60); surfaceSlimeTick(1 / 60); updateJello(1 / 60);
          }
          result.pauseFrozen = frozenPose === JSON.stringify([Array.from(b.px), Array.from(b.py), player.x, player.y]);
          result.pauseClearsPending = softContactFrame === null && softContactOrigin === null;
          gamePaused = false; shopState = 'closed';
        }
        if (!drop && !passive) {
          // Drive, release, then reverse: repeated freely interrupted contact.
          var command = elapsed < 1.0 ? direction : elapsed < 1.7 ? 0 : -direction;
          keys.ArrowRight = command > 0; keys.ArrowLeft = command < 0;
        }
        var approachVy = player.vy, physicsFrameBefore = jelloFrameNo, supportedBefore = player.onJello;
        var supportBodyBefore = typeof softContactSupport !== 'undefined' && !!softContactSupport;
        var feetBefore = player.y + PLAYER_H;
        update(dt); surfaceSlimeTick(dt); updateJello(dt);
        if (SOFT_CONTACT && jelloFrameNo !== physicsFrameBefore && softContactReport.selfContacts > 0) {
          result.selfContactCorrections += softContactReport.selfContacts;
          if (result.firstSelfContact === null) result.firstSelfContact = { time: elapsed, frame: frame, count: softContactReport.selfContacts };
        }
        if (jelloFrameNo === physicsFrameBefore) {
          result.zeroStepFrames++;
          if (softContactFrame && !softContactFrame.started) result.zeroStepPendingFrames++;
          if (supportedBefore && !player.onJello) {
            result.supportLostOnZeroStep++;
            var heights = [];
            for (var foot = 1; foot < 4; foot++) {
              var footX = player.x + PLAYER_W * foot / 4;
              heights.push(footState(b, footX, player.y + PLAYER_H));
            }
            var stillClosing = !player.thrusting && heights.some(function(foot) {
              return foot.feetMinusSkin !== null && Math.abs(foot.feetMinusSkin) <= 1.5 && foot.relativeVy >= 0;
            });
            if (stillClosing) result.closingSupportLostOnZeroStep++;
            if (result.supportLossEvents.length < 10) {
              result.supportLossEvents.push({ time: elapsed, rigX: player.x, rigY: player.y,
                vyBefore: approachVy, vy: player.vy, feetBefore: feetBefore, feet: player.y + PLAYER_H,
                bodyVy: b.vy * JELLO_TIMESCALE, underfoot: heights,
                supportBodyBefore: supportBodyBefore,
                supportBodyAfter: typeof softContactSupport !== 'undefined' && !!softContactSupport,
                supportIsThisBody: typeof softContactSupport !== 'undefined' && softContactSupport === b,
                thrusting: player.thrusting, stillClosing: stillClosing, report: Object.assign({}, softContactReport) });
            }
          }
        }
        if (passive) {
          fingerprints.push(fingerprint());
          var currentMaterial = materialState();
          if (JSON.stringify(currentMaterial) === initialMaterial) result.materialUnchangedFrames++;
          else if (!result.firstMaterialChange) result.firstMaterialChange = { time: elapsed, frame: frame, material: currentMaterial };
        }
        var penetration = rigDepth(b, player.x, player.y), skinInside = skinDepth(b, player.x, player.y);
        var visible = typeof surfaceSlimeRenderBody === 'function' ? surfaceSlimeRenderBody(b) : b;
        var visual = rigDepth(visible, player.renderX, player.renderY);
        var reportContact = SOFT_CONTACT && softContactReport ? softContactReport.contacts : 0;
        var contacting = penetration > 0.001 || skinInside > 0.001 || player.onJello || reportContact > 0;
        if (contacting && firstContact === null) {
          firstContact = elapsed; result.firstContactTime = elapsed; result.firstContactVy = approachVy;
        }
        if (contacting) result.contactFrames++;
        result.maxReportedContact = Math.max(result.maxReportedContact, reportContact);
        result.maxPenetration = Math.max(result.maxPenetration, penetration);
        result.maxSkinInsideHull = Math.max(result.maxSkinInsideHull, skinInside);
        result.maxVisualPenetration = Math.max(result.maxVisualPenetration, visual);
        if (jelloFrameNo !== physicsFrameBefore) {
          result.maxSolvedPenetration = Math.max(result.maxSolvedPenetration, penetration);
          result.maxSolvedSkinInsideHull = Math.max(result.maxSolvedSkinInsideHull, skinInside);
          lastSolvedRigX = player.x; lastSolvedRigY = player.y;
        } else {
          var pendingTravel = Math.hypot(player.x - lastSolvedRigX, player.y - lastSolvedRigY);
          result.maxPendingPenetration = Math.max(result.maxPendingPenetration, penetration);
          result.maxPendingSkinInsideHull = Math.max(result.maxPendingSkinInsideHull, skinInside);
          result.maxPendingPenetrationExcess = Math.max(result.maxPendingPenetrationExcess,
            Math.max(penetration, skinInside) - pendingTravel);
        }
        result.maxRigJump = Math.max(result.maxRigJump, Math.hypot(player.x - prevRigX, player.y - prevRigY));
        result.maxCenterJump = Math.max(result.maxCenterJump, Math.hypot(b.cx - prevCx, b.cy - prevCy));
        if (firstContact !== null) result.maxRigUpSpeed = Math.max(result.maxRigUpSpeed, -player.vy);
        if (player.onGround && player.onJello) result.groundedFrames++;
        result.peakBodyRealSpeed = Math.max(result.peakBodyRealSpeed, Math.hypot(b.vx, b.vy) * JELLO_TIMESCALE);
        result.finite = result.finite && isFinite(player.x + player.y + player.vx + player.vy);
        for (var point = 0; point < b.n; point++) {
          result.finite = result.finite && isFinite(b.px[point] + b.py[point] + b.ox[point] + b.oy[point]);
          result.maxNodeJump = Math.max(result.maxNodeJump, Math.hypot(b.px[point] - prevX[point], b.py[point] - prevY[point]));
          if (jelloWorldSolidAt(b.px[point], b.py[point])) result.terrainPointFrames++;
          result.maxTerrainDepth = Math.max(result.maxTerrainDepth, b.py[point] - floor);
          prevX[point] = b.px[point]; prevY[point] = b.py[point];
        }
        var ratio = ringArea(b) / initialArea;
        result.minAreaRatio = Math.min(result.minAreaRatio, ratio); result.maxAreaRatio = Math.max(result.maxAreaRatio, ratio);
        var crossingPairs = crossings(b);
        result.maxRingCrossings = Math.max(result.maxRingCrossings, crossingPairs.length);
        var orientation = inverted(b);
        result.maxInvertedTriangles = Math.max(result.maxInvertedTriangles, orientation.count);
        result.maxSevereInvertedTriangles = Math.max(result.maxSevereInvertedTriangles, orientation.severe);
        result.minTriangleDet = Math.min(result.minTriangleDet, orientation.minDet);
        if (crossingPairs.length && !result.firstCross) {
          result.firstCross = { time: elapsed, frame: frame, count: crossingPairs.length, pairs: crossingPairs,
            report: Object.assign({}, softContactReport), rig: { x: player.x, y: player.y, vx: player.vx,
              vy: player.vy, renderX: player.renderX, renderY: player.renderY, onGround: player.onGround,
              onJello: player.onJello }, minDet: orientation.minDet,
            state: b.surfaceSlime.state, phase: b.surfaceSlime.phase, motorBlend: b.surfaceSlime.motorBlend,
            gripCount: b.surfaceSlime.contacts, climbing: b.surfaceSlime.climb,
            cx: b.cx, cy: b.cy, floor: floor, ring: Array.from(b.ring).slice(0, b.ringN).map(function(point) {
              return { point: point, x: b.px[point], y: b.py[point],
                vx: (b.px[point] - b.ox[point]) * JELLO_TIMESCALE / jelloStepH,
                vy: (b.py[point] - b.oy[point]) * JELLO_TIMESCALE / jelloStepH };
            }) };
          result.firstCrossImage = closeUp(elapsed);
        }
        result.minHeight = Math.min(result.minHeight, b.bboxB - b.bboxT);
        result.maxHeight = Math.max(result.maxHeight, b.bboxB - b.bboxT);
        if (frame % Math.max(1, Math.round(spec.fps / 20)) === 0) result.samples.push({ t: elapsed,
          rigX: player.x, rigY: player.y, rigVx: player.vx, rigVy: player.vy, cx: b.cx, cy: b.cy,
          width: b.bboxR - b.bboxL, height: b.bboxB - b.bboxT, penetration: penetration,
          onJello: player.onJello, state: b.surfaceSlime.state, areaRatio: ratio });
        if (spec.capture && firstContact !== null && captureIndex < captureOffsets.length &&
            elapsed - firstContact + dt * 0.5 >= captureOffsets[captureIndex]) {
          captureFrame(elapsed - firstContact); captureIndex++;
        }
        prevRigX = player.x; prevRigY = player.y; prevCx = b.cx; prevCy = b.cy;
        if (!result.finite || gameOver || jelloBodies.indexOf(b) < 0) break;
      }
      result.alive = jelloBodies.indexOf(b) >= 0;
      result.travelX = b.cx - initialX; result.travelY = b.cy - initialY;
      result.compression = initialHeight - result.minHeight;
      result.groundedSeconds = result.groundedFrames / spec.fps;
      result.hullDamage = 100000 - player.hull;
      result.final = { cx: b.cx, cy: b.cy, rigX: player.x, rigY: player.y,
        rigVx: player.vx, rigVy: player.vy, height: b.bboxB - b.bboxT, state: b.surfaceSlime.state };
      result.strip = frames.length ? strip() : null;
      result.finalMaterial = materialState();
      if (passive) result.physicsFingerprints = fingerprints;
      return result;
    } finally {
      Math.random = nativeRandom; performance.now = nativeNow;
      keys.ArrowLeft = keys.ArrowRight = false;
    }
    function ringArea(body) {
      var area = 0;
      for (var k = 0; k < body.ringN; k++) {
        var a = body.ring[k], c = body.ring[(k + 1) % body.ringN];
        area += body.px[a] * body.py[c] - body.px[c] * body.py[a];
      }
      return area * 0.5;
    }
    function materialState() {
      return { solver: JELLO_SOLVER, timestep: JELLO_H, substeps: JELLO_XPBD_SUBSTEPS,
        timescale: JELLO_TIMESCALE, gravity: JELLO_GRAVITY, damping: JELLO_DAMPING,
        internalDamping: JELLO_INT_DAMP, pressure: JELLO_PRESSURE, viscosity: JELLO_XSPH,
        edgeCompliance: JELLO_XPBD_COMPLIANCE, shearCompliance: JELLO_XPBD_SHEAR_COMPLIANCE,
        volumeCompliance: JELLO_XPBD_VOL_COMPLIANCE, shape: JELLO_XPBD_SHAPE,
        shapeStiffness: JELLO_SHAPE_STIFF, shapeBeta: JELLO_SHAPE_BETA,
        floorFriction: JELLO_FLOOR_FRICTION, wallFriction: JELLO_WALL_FRICTION,
        contactFriction: JELLO_CONTACT_FRICTION, contactDamping: JELLO_CONTACT_DAMP,
        contactRadius: JELLO_CONTACT_R_FRAC, wave: SURFACE_SLIME_WAVE,
        waveSpeed: SURFACE_SLIME_WAVE_SPEED, gripRange: SURFACE_SLIME_GRIP_RANGE,
        materialSoftness: b.materialSoftness, restArea: b.restArea, nodes: b.n, ringNodes: b.ringN };
    }
    function footState(body, x, feet) {
      var top = Infinity, vx = 0, vy = 0;
      for (var k = 0; k < body.ringN; k++) {
        var a = body.ring[k], c = body.ring[(k + 1) % body.ringN];
        var ax = body.px[a], cx = body.px[c];
        if (!(ax <= x && cx >= x || cx <= x && ax >= x)) continue;
        var u = Math.abs(cx - ax) < 1e-8 ? (body.py[a] < body.py[c] ? 0 : 1) : (x - ax) / (cx - ax);
        var y = body.py[a] + (body.py[c] - body.py[a]) * u;
        if (y >= top) continue;
        top = y;
        vx = ((body.px[a] - body.ox[a]) * (1 - u) + (body.px[c] - body.ox[c]) * u) * JELLO_TIMESCALE / jelloStepH;
        vy = ((body.py[a] - body.oy[a]) * (1 - u) + (body.py[c] - body.oy[c]) * u) * JELLO_TIMESCALE / jelloStepH;
      }
      return { x: x, skinY: isFinite(top) ? top : null, feetMinusSkin: isFinite(top) ? feet - top : null,
        skinVx: isFinite(top) ? vx : null, skinVy: isFinite(top) ? vy : null,
        relativeVy: isFinite(top) ? player.vy - vy : null };
    }
    function fingerprint() {
      var data = JSON.stringify([Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy),
        Array.from(b.sRest), b.materialDamping, b.surfaceSlime.phase, b.surfaceSlime.motorBlend,
        b.surfaceSlime.state, b.surfaceSlime.contacts, b.surfaceSlime.power]);
      var hash = 2166136261;
      for (var k = 0; k < data.length; k++) hash = Math.imul(hash ^ data.charCodeAt(k), 16777619) >>> 0;
      return hash;
    }
    function rigDepth(body, rx, ry) {
      var depth = 0;
      for (var side = 0; side < 4; side++) for (var sample = 0; sample <= 8; sample++) {
        var u = sample / 8, sx = rx + (side === 1 ? PLAYER_W : side === 3 ? 0 : u * PLAYER_W);
        var sy = ry + (side === 0 ? 0 : side === 2 ? PLAYER_H : u * PLAYER_H);
        if (!jelloPointInRing(body, sx, sy)) continue;
        var near = jelloNearestOnRing(body, sx, sy);
        depth = Math.max(depth, Math.hypot(near.x - sx, near.y - sy));
      }
      return depth;
    }
    function skinDepth(body, rx, ry) {
      var depth = 0;
      for (var k = 0; k < body.ringN; k++) {
        var p = body.ring[k], sx = body.px[p], sy = body.py[p];
        if (sx > rx && sx < rx + PLAYER_W && sy > ry && sy < ry + PLAYER_H) {
          depth = Math.max(depth, Math.min(sx - rx, rx + PLAYER_W - sx, sy - ry, ry + PLAYER_H - sy));
        }
      }
      return depth;
    }
    function crossings(body) {
      var pairs = [], rn = body.ringN;
      function orient(a, b, c) { return (body.px[b] - body.px[a]) * (body.py[c] - body.py[a]) - (body.py[b] - body.py[a]) * (body.px[c] - body.px[a]); }
      for (var a = 0; a < rn; a++) for (var c = a + 2; c < rn; c++) {
        if (a === 0 && c === rn - 1) continue;
        var i = body.ring[a], j = body.ring[(a + 1) % rn], k = body.ring[c], l = body.ring[(c + 1) % rn];
        if (orient(i, j, k) * orient(i, j, l) < -1e-7 && orient(k, l, i) * orient(k, l, j) < -1e-7) {
          pairs.push({ edgeA: [i, j], edgeB: [k, l] });
        }
      }
      return pairs;
    }
    function inverted(body) {
      if (!body.triN || !body.triDmInv) return { count: body._invN || 0, severe: 0, minDet: 1 };
      var count = 0, severe = 0, minDet = 1;
      for (var tri = 0; tri < body.triN; tri++) {
        var a = body.triA[tri], c = body.triB[tri], d = body.triC[tri], q = tri * 4, inv = body.triDmInv;
        var x1 = body.px[c] - body.px[a], x2 = body.px[d] - body.px[a];
        var y1 = body.py[c] - body.py[a], y2 = body.py[d] - body.py[a];
        var f00 = x1 * inv[q] + x2 * inv[q + 2], f01 = x1 * inv[q + 1] + x2 * inv[q + 3];
        var f10 = y1 * inv[q] + y2 * inv[q + 2], f11 = y1 * inv[q + 1] + y2 * inv[q + 3];
        var det = f00 * f11 - f01 * f10;
        minDet = Math.min(minDet, det);
        if (det < -0.02) count++;
        if (det < -0.20) severe++;
      }
      return { count: count, severe: severe, minDet: minDet };
    }
    function captureFrame(relativeTime) {
      render();
      var image = document.createElement('canvas'); image.width = 360; image.height = 276;
      var draw = image.getContext('2d'), scale = dpr * worldScale;
      var left = initialX - 90, top = floor - 130;
      draw.drawImage(canvas, (left - cam.x) * scale, (top - cam.y) * scale,
        180 * scale, 138 * scale, 0, 0, 360, 276);
      frames.push({ canvas: image, time: relativeTime });
    }
    function closeUp(time) {
      render();
      var image = document.createElement('canvas'); image.width = 720; image.height = 514;
      var draw = image.getContext('2d'), scale = dpr * worldScale;
      var centerX = (b.cx + player.x + PLAYER_W / 2) / 2;
      var left = centerX - 120, top = floor - 145;
      draw.fillStyle = '#303931'; draw.fillRect(0, 0, image.width, image.height);
      draw.drawImage(canvas, (left - cam.x) * scale, (top - cam.y) * scale,
        240 * scale, 160 * scale, 0, 34, 720, 480);
      draw.fillStyle = '#f0eee5'; draw.font = '14px monospace';
      draw.fillText(spec.name + ' ' + spec.fps + ' Hz, first skin crossing at ' + time.toFixed(3) + ' s', 10, 22);
      return image.toDataURL('image/png');
    }
    function strip() {
      var image = document.createElement('canvas'); image.width = 360 * frames.length; image.height = 310;
      var draw = image.getContext('2d'); draw.fillStyle = '#303931'; draw.fillRect(0, 0, image.width, image.height);
      draw.fillStyle = '#f0eee5'; draw.font = '14px monospace';
      for (var frame = 0; frame < frames.length; frame++) {
        draw.drawImage(frames[frame].canvas, 360 * frame, 34);
        draw.fillText((spec.experimental ? 'Contact' : 'Baseline') + ' +' + frames[frame].time.toFixed(3) + ' s', 360 * frame + 10, 22);
      }
      return image.toDataURL('image/png');
    }
  };`);

  const cases = [];
  for (const fps of rates) for (const name of selected) {
    for (const speed of name.startsWith('drop-') ? speeds : [150]) for (const experimental of [false, true]) {
      cases.push({ name, fps, speed, experimental,
        capture: fps === 60 && ((name === 'drop-center' && speed === 350) || name === 'push-right') });
    }
  }
  for (const spec of cases) {
    const result = await game(`window.__runContactCase(${JSON.stringify(spec)})`);
    if (result.firstCrossImage) {
      const filename = `${result.name}-${result.requestedSpeed}-${result.fps}-${result.mode}-first-cross.png`;
      fs.writeFileSync(path.join(dump, filename), Buffer.from(result.firstCrossImage.split(',')[1], 'base64'));
      result.firstCross.imageFile = filename;
    }
    delete result.firstCrossImage;
    if (result.strip) {
      const filename = `${result.name}-${result.requestedSpeed}-${result.fps}-${result.mode}.png`;
      fs.writeFileSync(path.join(dump, filename), Buffer.from(result.strip.split(',')[1], 'base64'));
      result.stripFile = filename;
    }
    delete result.strip;
    results.push(result);
    const { samples, firstCross, supportLossEvents, ...summary } = result;
    console.log('CASE ' + JSON.stringify(summary));
    fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, results, browserErrors, failures }, null, 2));
  }
  for (let index = 0; index < results.length; index += 2) {
    const a = results[index], b = results[index + 1];
    check(`${a.name}/${a.requestedSpeed}/${a.fps} starts from identical settled geometry`, JSON.stringify(a.initial) === JSON.stringify(b.initial));
  }
  check('all runs used the deterministic simulation clock', results.every(result => result.deterministicClock));
  check('all bodies and rigs remain finite and present', results.every(result => result.finite && result.alive));
  check('no catastrophic one-frame displacement', results.every(result => result.maxRigJump < 180 && result.maxNodeJump < 160 && result.maxCenterJump < 100));
  check('no body ends underneath the floor', results.every(result => result.final.cy <= results[0].initial.cy + 80));
  check('experimental contacts were exercised', results.filter(result => result.mode === 'contact').some(result => result.maxReportedContact > 0));
  const experimental = results.filter(result => result.mode === 'contact');
  check('solved experimental rig and skin penetration stay below two pixels', experimental.every(result => result.maxSolvedPenetration < 2 && result.maxSolvedSkinInsideHull < 2));
  check('between-tick penetration stays within pending travel plus two pixels', experimental.every(result => result.maxPendingPenetrationExcess < 2));
  check('experimental rendered rig and skin penetration stay below two pixels', experimental.every(result => result.maxVisualPenetration < 2));
  check('experimental skin never crosses itself', experimental.every(result => result.maxRingCrossings === 0));
  check('experimental points never penetrate terrain', experimental.every(result => result.terrainPointFrames === 0 && result.maxTerrainDepth <= 0));
  check('experimental health triangles never severely invert', experimental.every(result => result.maxSevereInvertedTriangles === 0));

  noContact = [];
  for (const experimental of [false, true]) {
    const result = await game(`window.__runContactCase(${JSON.stringify({ name: 'no-contact', fps: 60, speed: 0, experimental, noContact: true, seconds: 8 })})`);
    if (result.firstCrossImage) {
      const filename = `no-contact-${result.mode}-first-cross.png`;
      fs.writeFileSync(path.join(dump, filename), Buffer.from(result.firstCrossImage.split(',')[1], 'base64'));
      result.firstCross.imageFile = filename;
    }
    delete result.firstCrossImage;
    noContact.push(result);
  }
  const firstSelf = noContact[1].firstSelfContact;
  const prefixFrames = firstSelf ? firstSelf.frame : noContact[1].physicsFingerprints.length;
  const prefixMatches = JSON.stringify(noContact[0].physicsFingerprints.slice(0, prefixFrames)) ===
    JSON.stringify(noContact[1].physicsFingerprints.slice(0, prefixFrames));
  noContact[1].identityBeforeSelfContact = { prefixFrames, seconds: prefixFrames / 60, matches: prefixMatches };
  check('uncontacted trajectory matches until the first actual skin self-contact, for at least one second', prefixMatches && prefixFrames >= 60);
  check('all material and locomotion coefficients stay exactly unchanged through eight seconds',
    JSON.stringify(noContact[0].material) === JSON.stringify(noContact[1].material) &&
    noContact.every(result => result.materialUnchangedFrames === 480 && !result.firstMaterialChange &&
      JSON.stringify(result.material) === JSON.stringify(result.finalMaterial)));
  console.log('NO RIG CONTACT ' + JSON.stringify({ prefixFrames, prefixSeconds: prefixFrames / 60, prefixMatches,
    firstSelfContact: firstSelf, baselineCrossings: noContact[0].maxRingCrossings,
    experimentCrossings: noContact[1].maxRingCrossings, selfContactCorrections: noContact[1].selfContactCorrections }));
  check('no-contact identity comparison includes ordinary autonomous motion',
    Math.abs(noContact[0].travelX) > 1 && noContact.every(result => result.maxPenetration === 0 && result.maxReportedContact === 0));
  continuity = await game(`window.__runContactCase(${JSON.stringify({ name: 'drop-center', fps: 240, speed: 150, experimental: true, pause: true, seconds: 2 })})`);
  if (continuity.firstCrossImage) {
    fs.writeFileSync(path.join(dump, 'continuity-first-cross.png'), Buffer.from(continuity.firstCrossImage.split(',')[1], 'base64'));
    continuity.firstCross.imageFile = 'continuity-first-cross.png';
    delete continuity.firstCrossImage;
  }
  check('240 Hz exercises pending motion between physics ticks', continuity.zeroStepFrames > 0 && continuity.zeroStepPendingFrames > 0);
  check('nonseparating supported rig retains grounding between physics ticks', continuity.closingSupportLostOnZeroStep === 0);
  check('three-second frozen menu preserves pose and clears pending rig sweep', continuity.pauseFrozen && continuity.pauseClearsPending);
  check('resume and zero-step frames keep finite motion without a large jump', continuity.finite && continuity.alive && continuity.maxRigJump < 30 && continuity.maxNodeJump < 30);
  console.log('CONTINUITY ' + JSON.stringify({ zeroStepFrames: continuity.zeroStepFrames,
    pendingFrames: continuity.zeroStepPendingFrames, supportLostOnZeroStep: continuity.supportLostOnZeroStep,
    closingSupportLostOnZeroStep: continuity.closingSupportLostOnZeroStep,
    pauseFrozen: continuity.pauseFrozen, maxRigJump: continuity.maxRigJump, maxNodeJump: continuity.maxNodeJump }));

  inactive = await game(`(function() {
    var reports = [], dt = 1 / 60, floor = SKY_ROWS * TILE, x = (DECK_CENTER_COL - 9) * TILE;
    for (var mode = 0; mode < 2; mode++) {
      SOFT_CONTACT = true; resetJello(); surfaceSlimesSeeded = true; softContactClear();
      keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = false;
      player.x = x - 260; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
      player.onGround = true; player.onJello = false; player.thrusting = false; player.thrustSpool = 0;
      player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
      drilling = null; hitPauseT = 0; gamePaused = gameOver = gameWon = false; shopState = 'closed';
      var b = mode === 0 ? surfaceSlimeBuild(x, floor - 36, { id: 93001, seed: 0.46, r: 24.3 }) : null;
      cam.x = x - screenW / 2; cam.y = floor - screenH * 0.6;
      if (b) for (var settle = 0; settle < 90; settle++) updateJello(dt);
      cam.x = x + 10000; cam.y = floor - screenH * 0.6;
      var report = { kind: mode === 0 ? 'off-camera' : 'zero-bodies', maxPreparedDt: 0,
        maxRetainedDt: 0, elapsed: 8, returnJump: 0, maxReturnJump: 0, finite: true };
      keys.ArrowRight = true;
      for (var frame = 0; frame < 480; frame++) {
        keys.ArrowRight = Math.floor(frame / 60) % 2 === 0;
        keys.ArrowLeft = !keys.ArrowRight;
        update(dt); surfaceSlimeTick(dt);
        if (softContactFrame) report.maxPreparedDt = Math.max(report.maxPreparedDt, softContactFrame.dt);
        updateJello(dt);
        if (softContactFrame) report.maxRetainedDt = Math.max(report.maxRetainedDt, softContactFrame.dt);
      }
      keys.ArrowRight = keys.ArrowLeft = false;
      if (!b) b = surfaceSlimeBuild(x, floor - 36, { id: 93002, seed: 0.46, r: 24.3 });
      cam.x = x - screenW / 2; cam.y = floor - screenH * 0.6;
      player.x = b.cx - PLAYER_W / 2; player.y = b.bboxT - PLAYER_H - 8;
      player.vx = 0; player.vy = 150; player.onGround = false; player.onJello = false;
      player.renderX = player.x; player.renderY = player.y;
      for (frame = 0; frame < 30; frame++) {
        var beforeX = player.x, beforeY = player.y;
        update(dt); surfaceSlimeTick(dt); updateJello(dt);
        var jump = Math.hypot(player.x - beforeX, player.y - beforeY);
        if (frame === 0) report.returnJump = jump;
        report.maxReturnJump = Math.max(report.maxReturnJump, jump);
        report.finite = report.finite && isFinite(player.x + player.y + player.vx + player.vy) &&
          Array.from(b.px).concat(Array.from(b.py)).every(isFinite);
      }
      reports.push(report);
    }
    keys.ArrowRight = keys.ArrowLeft = false;
    return reports;
  })()`);
  check('inactive scenes discard rig sweeps rather than accumulating eight seconds of travel',
    inactive.every(result => result.maxPreparedDt <= 1 / 60 + 1e-8 && result.maxRetainedDt === 0));
  check('returning to an active resident or recreating one never replays old travel',
    inactive.every(result => result.finite && result.returnJump < 10 && result.maxReturnJump < 20));
  console.log('INACTIVE ' + JSON.stringify(inactive));

  // Fresh navigation tests the actual opt-in page and its existing UI event handlers.
  // No nosave parameter here: the playtest itself must disable persistence.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softplay=1&nopause=1&tod=0.35` });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate("!!document.getElementById('soft-contact-playtest')")) break;
    await sleep(100);
  }
  await game('cancelAnimationFrame(gameRafId); gameRafId = 0;');
  ui = await game(`(function() {
    var panel = document.getElementById('soft-contact-playtest');
    if (!panel) return { found: false };
    var buttons = Array.from(panel.querySelectorAll('button'));
    function click(label) { var b = buttons.find(function(button) { return button.textContent === label; }); if (!b) return false; b.click(); return true; }
    var r = { found: true, savesDisabled: SAVE_DISABLED, options: panel.querySelector('select').options.length };
    r.original = click('Original') && !SOFT_CONTACT && buttons.find(function(b) { return b.textContent === 'Original'; }).getAttribute('aria-pressed') === 'true';
    r.experimental = click('New contacts') && SOFT_CONTACT && buttons.find(function(b) { return b.textContent === 'New contacts'; }).getAttribute('aria-pressed') === 'true';
    var select = panel.querySelector('select');
    select.value = 'right'; select.dispatchEvent(new Event('change', { bubbles: true }));
    r.selectWorks = softPlayCase === 'right';
    var b = jelloBodies.find(function(body) { return !!body.surfaceSlime; });
    var start = { rigX: player.x, rigY: player.y, cx: b.cx, cy: b.cy };
    r.repeatButton = click('Repeat');
    b = jelloBodies.find(function(body) { return !!body.surfaceSlime; });
    r.repeatPoseError = Math.max(Math.abs(start.rigX - player.x), Math.abs(start.rigY - player.y), Math.abs(start.cx - b.cx), Math.abs(start.cy - b.cy));
    r.singleResident = jelloBodies.filter(function(body) { return !!body.surfaceSlime; }).length === 1;
    var tileRow = SKY_ROWS, tileCol = DECK_CENTER_COL - 4;
    var originalTile = JSON.stringify(world[tileRow][tileCol] || null);
    world[tileRow][tileCol] = null; invalidateTerrainAround(tileRow, tileCol);
    player.drillGlideT = 0.24; player.slideTargetX = player.x + 100; player.slideAssistT = 1;
    player.thrusting = true; player.thrustSpool = 1; hitPauseT = 0.03;
    keys.ArrowRight = keys.d = keys.w = true; dpad.left = dpad.up = true;
    click('Repeat');
    r.repeatRestoresTile = originalTile !== 'null' && JSON.stringify(world[tileRow][tileCol] || null) === originalTile;
    r.repeatClearsTransientMotion = player.drillGlideT === 0 && player.slideTargetX === null &&
      player.slideAssistT === 0 && !player.thrusting && player.thrustSpool === 0 && hitPauseT === 0 &&
      !keys.ArrowRight && !keys.d && !keys.w && !dpad.left && !dpad.up;
    render(); return r;
  })()`);
  check('opt-in comparison UI disables saves and switches both modes', ui.found && ui.savesDisabled && ui.original && ui.experimental);
  check('all five interactions are selectable and Repeat recreates the pose', ui.options === 5 && ui.selectWorks && ui.repeatButton && ui.singleResident && ui.repeatPoseError < 0.001);
  check('Repeat restores dug terrain and clears prior movement inputs and drill motion', ui.repeatRestoresTile && ui.repeatClearsTransientMotion);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(250);
  await game('cam.snap = true; updateCamera(); render();');
  ui.mobile = await evaluate(`(function() {
    var panel = document.getElementById('soft-contact-playtest'), box = panel.getBoundingClientRect();
    function rect(el) {
      var b = el.getBoundingClientRect(), style = getComputedStyle(el);
      var hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { label: el.textContent || el.getAttribute('aria-label'), left: b.left, top: b.top,
        right: b.right, bottom: b.bottom, width: b.width, height: b.height,
        visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0,
        hitTarget: hit === el || el.contains(hit) };
    }
    return { width: innerWidth, height: innerHeight, panel: rect(panel),
      controls: Array.from(panel.querySelectorAll('button,select')).map(rect),
      fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5 };
  })()`);
  check('390 by 844 comparison controls fit and remain reachable', ui.mobile.width === 390 && ui.mobile.height === 844 &&
    ui.mobile.fits && ui.mobile.controls.every(control => control.visible && control.hitTarget && control.width > 0 &&
      control.height >= 44 && control.left >= 0 && control.top >= 0 && control.right <= 390.5 && control.bottom <= 844.5));
  const mobileImage = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dump, 'soft-contact-mobile.png'), Buffer.from(mobileImage.data, 'base64'));
  ui.mobile.screenshot = 'soft-contact-mobile.png';
  check('no browser exceptions', browserErrors.length === 0);
  const notes = [
    'Penetration, compression, rebound, folds, grounding, and travel are diagnostics, not claims of satisfying feel.',
    'maxPenetration samples rig perimeter inside the physical ring; maxSkinInsideHull samples skin vertices inside the rig.',
    'maxVisualPenetration separately compares interpolated skin with eased rig render position.',
    'Solved-frame overlap is separate from unsimulated rig travel between gel ticks; pending penetration is bounded by that travel plus the two-pixel contact tolerance.',
    'Grounding asserts only a prior support whose underfoot gap stays within 1.5 pixels and whose local skin is closing relative to the rig. Genuine separation remains diagnostic.',
    'Triangle counts inspect the existing overlapping health mesh, not a newly triangulated physical volume.',
    'Severe health-triangle inversion means normalized deformation determinant below -0.20; shallow inversion is still recorded separately.',
    'The same live baseline material and locomotion run in both modes. No pointer, water, or hard-circle behavior is retuned.',
    'The no-rig-contact fingerprint prefix must match until the first reported actual skin self-contact, with at least one second of identical motion. Material coefficients are checked unchanged on all 480 frames.',
    'Each push holds its direction for one second, coasts until 1.7 seconds, then reverses; all trials begin from measured settled skin.'
  ];
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, notes, results, noContact, continuity, inactive, ui, browserErrors, failures }, null, 2));
  console.log(`Wrote ${results.length} cases to ${path.join(dump, 'report.json')}`);
  assert.equal(failures.length, 0, failures.join('\n'));
} finally { cleanup(); }
