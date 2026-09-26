// Diagnostic A/B material-grip comparison. Uses a private Chrome for Testing child.
// node tools/test-soft-handling.mjs
// FPS=60 CASES=center-hold,edge-swing,side-flick DUMP=/tmp/my-run
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
const port = Number(process.env.PORT || 8241), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-handling';
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const selected = (process.env.CASES || 'center-hold,edge-swing,side-flick,stop-before-release,wall-drag,mouse-cancel,touch-cancel').split(',');
assert.ok(rates.every(fps => fps >= 20 && fps <= 240), 'FPS is between 20 and 240');
assert.ok(selected.every(name => /^(center-hold|edge-swing|side-flick|stop-before-release|wall-drag|mouse-cancel|touch-cancel)$/.test(name)), 'known CASES');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
const servedBundle = bundle.slice(0, end) + '\nwindow.__handlingTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-handling-browser-');
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
let ui, defaults;
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
const game = source => evaluate(`__handlingTest(${JSON.stringify(source)})`);
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1` });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate(`typeof __handlingTest === 'function' && __handlingTest("introPhase === 'done'")`)) break;
    await sleep(100);
  }
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__handlingPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  await game(`window.__runHandlingCase = function(spec) {
    var nativeRandom = Math.random, nativeNow = performance.now, nativeLaunch = jelloLaunchBody;
    var clock = 100000, rng = 314159265, launchCalls = 0, frames = [];
    Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    performance.now = function() { return clock; };
    jelloLaunchBody = function() { launchCalls++; return nativeLaunch.apply(null, arguments); };
    var b, dt = 1 / spec.fps, floor = SKY_ROWS * TILE, x = (DECK_CENTER_COL - 9) * TILE;
    var wallColumn = DECK_CENTER_COL - 5, wallX = wallColumn * TILE;
    try {
      if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
      resetJello(); skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;
      SOFT_CONTACT = true; SOFT_HANDLING = false; softContactClear();
      Object.keys(keys).forEach(function(key) { keys[key] = false; });
      dpad.left = dpad.right = dpad.up = dpad.down = false;
      Object.assign(player, JSON.parse(JSON.stringify(window.__handlingPlayerInitial)));
      gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
      shopState = 'closed'; drilling = null; hitPauseT = 0; siphon.equipped = false;
      player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
      player.thrusting = false; player.thrustSpool = 0; player._thrustWas = false;
      player.jelloGroundT = 0; player.jelloImpactVy = 0; player.jelloCarryVx = 0;
      player.onJello = false; player.onGround = true; player.airTime = 0;
      player.x = x - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
      player.renderX = player.x; player.renderY = player.y;
      for (var row = Math.max(0, SKY_ROWS - 12); row <= SKY_ROWS + 5; row++) {
        for (var col = DECK_CENTER_COL - 30; col <= DECK_CENTER_COL + 12; col++) {
          var wall = spec.name === 'wall-drag' && col === wallColumn && row >= SKY_ROWS - 12;
          world[row][col] = row >= SKY_ROWS || wall ? { type: 'stone', hp: 100 } : null;
          invalidateTerrainAround(row, col);
        }
      }
      for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
      b = surfaceSlimeBuild(x, floor - 36, { id: 94001, seed: 0.46, hue: 133, home: x, r: 24.3 });
      cam.x = x - screenW / 2; cam.y = floor - screenH * 0.67;
      // Identical settled material precedes each A/B input. Locomotion resumes
      // during the scenario; holding itself interrupts that ordinary brain.
      for (var settle = 0; settle < 240; settle++) { clock += 1000 / 120; updateJello(1 / 120); }
      SOFT_HANDLING = spec.experimental;
      var initial = snapshot(), initialHeight = b.bboxB - b.bboxT;
      var gripX = b.cx, gripY = b.cy;
      if (spec.name === 'edge-swing') {
        gripX += (b.bboxR - b.cx) * 0.70;
        while (!jelloPointInRing(b, gripX, gripY) && gripX > b.cx + 0.1) gripX = (gripX + b.cx) / 2;
      }
      var id = spec.name === 'touch-cancel' ? 41 : 'mouse';
      if (!surfaceSlimeGrabStart(gripX, gripY, id)) throw new Error('scenario failed to grab');
      var weights = surfaceSlimeGrip.weights, weightData = JSON.stringify(weights);
      var duration = spec.name === 'edge-swing' ? 1.3 : spec.name === 'side-flick' ? 0.85 :
        spec.name === 'stop-before-release' ? 1.5 : spec.name === 'wall-drag' ? 1.5 : 1.4;
      var releaseFrame = Math.round(duration * spec.fps), totalFrames = releaseFrame + Math.round(2 * spec.fps);
      var result = { name: spec.name, fps: spec.fps, mode: spec.experimental ? 'handling' : 'original',
        deterministicClock: performance.now() === clock, softContact: SOFT_CONTACT,
        initial: initial, grabbed: true, fixedMaterialPatch: true, finite: true, alive: true,
        maxNodeJump: 0, maxCenterJump: 0, heldMaxStretch: 0, heldMaxInternalSpeed: 0,
        heldFrozenVelocityFrames: 0, maxFrozenStoredSpeed: 0,
        heldMaxSpin: 0, afterMaxSpin: 0, minAreaRatio: 1, maxAreaRatio: 1,
        heldTerrainPointFrames: 0, afterTerrainPointFrames: 0, maxTerrainDepth: 0, heldWallContactFrames: 0,
        heldMaxRingCrossings: 0, afterMaxRingCrossings: 0,
        heldMaxSevereInversions: 0, afterMaxSevereInversions: 0,
        minTriangleDet: 1, maxHeldLift: 0, release: null, samples: [] };
      var previousX = Array.from(b.px), previousY = Array.from(b.py), previousCenter = { x: b.cx, y: b.cy };
      var captures = [0, Math.round(releaseFrame * 0.45), releaseFrame - 1, releaseFrame,
        releaseFrame + Math.round(0.12 * spec.fps), releaseFrame + Math.round(0.5 * spec.fps),
        releaseFrame + Math.round(1.2 * spec.fps)];
      for (var frame = 0; frame <= totalFrames; frame++) {
        var time = frame * dt;
        if (frame === releaseFrame) {
          var before = snapshot(), arrays = [b.px, b.py, b.ox, b.oy], callsBefore = launchCalls;
          var cancel = spec.name.endsWith('cancel');
          var ended = surfaceSlimeGrabEnd(id, cancel), after = snapshot();
          result.release = { time: time, cancel: cancel, ended: ended,
            clearsGrip: !surfaceSlimeGrip && !b._grabbed,
            sameArrayObjects: arrays[0] === b.px && arrays[1] === b.py && arrays[2] === b.ox && arrays[3] === b.oy,
            positionMaxChange: Math.max(arrayError(before.px, after.px), arrayError(before.py, after.py)),
            historyMaxChange: Math.max(arrayError(before.ox, after.ox), arrayError(before.oy, after.oy)),
            velocityMaxChange: velocityError(before, after),
            launchCalls: launchCalls - callsBefore, recoverTime: b._recoverT || 0,
            before: before.motion, after: after.motion };
        }
        if (captures.indexOf(frame) >= 0 && spec.capture) capture(time, frame < releaseFrame ? 'held' : 'released');
        if (frame === totalFrames) break;
        clock += dt * 1000;
        if (frame < releaseFrame) {
          var target = pointer(Math.min(duration, time + dt));
          surfaceSlimeGrabMove(gripX + target.x, gripY + target.y, id);
        }
        var previousSolveFrame = jelloFrameNo;
        update(dt); surfaceSlimeTick(dt); updateJello(dt);
        var held = frame < releaseFrame, health = geometry(), motion = momentum();
        result.finite = result.finite && health.finite;
        result.alive = result.alive && jelloBodies.indexOf(b) >= 0;
        result.minAreaRatio = Math.min(result.minAreaRatio, health.areaRatio);
        result.maxAreaRatio = Math.max(result.maxAreaRatio, health.areaRatio);
        result.minTriangleDet = Math.min(result.minTriangleDet, health.minDet);
        result.maxTerrainDepth = Math.max(result.maxTerrainDepth, health.terrainDepth);
        if (held) {
          result.heldMaxStretch = Math.max(result.heldMaxStretch, health.stretch);
          result.heldMaxInternalSpeed = Math.max(result.heldMaxInternalSpeed, motion.internalSpeed);
          result.heldMaxSpin = Math.max(result.heldMaxSpin, Math.abs(motion.spin));
          result.maxHeldLift = Math.max(result.maxHeldLift, initial.cy - b.cy);
          result.heldTerrainPointFrames += health.embedded;
          if (spec.name === 'wall-drag' && b.px.some(function(px, p) {
            return Math.abs(px - wallX) < 1 && b.py[p] < floor && b.py[p] > floor - TILE * 12;
          })) result.heldWallContactFrames++;
          result.heldMaxRingCrossings = Math.max(result.heldMaxRingCrossings, health.crossings);
          result.heldMaxSevereInversions = Math.max(result.heldMaxSevereInversions, health.severe);
          result.fixedMaterialPatch = result.fixedMaterialPatch && surfaceSlimeGrip &&
            surfaceSlimeGrip.weights === weights && JSON.stringify(weights) === weightData;
        } else {
          result.afterMaxSpin = Math.max(result.afterMaxSpin, Math.abs(motion.spin));
          result.afterTerrainPointFrames += health.embedded;
          result.afterMaxRingCrossings = Math.max(result.afterMaxRingCrossings, health.crossings);
          result.afterMaxSevereInversions = Math.max(result.afterMaxSevereInversions, health.severe);
        }
        result.maxCenterJump = Math.max(result.maxCenterJump, Math.hypot(b.cx - previousCenter.x, b.cy - previousCenter.y));
        var frameNodeJump = 0, frameCenterVX = 0, frameCenterVY = 0;
        for (var p = 0; p < b.n; p++) {
          frameNodeJump = Math.max(frameNodeJump, Math.hypot(b.px[p] - previousX[p], b.py[p] - previousY[p]));
          frameCenterVX += (b.px[p] - previousX[p]) / dt / b.n;
          frameCenterVY += (b.py[p] - previousY[p]) / dt / b.n;
        }
        result.maxNodeJump = Math.max(result.maxNodeJump, frameNodeJump);
        if (held && jelloFrameNo !== previousSolveFrame && frameNodeJump < 1e-7 && Math.hypot(motion.vx, motion.vy) > 1) {
          result.heldFrozenVelocityFrames++;
          result.maxFrozenStoredSpeed = Math.max(result.maxFrozenStoredSpeed, Math.hypot(motion.vx, motion.vy));
        }
        previousX = Array.from(b.px); previousY = Array.from(b.py); previousCenter = { x: b.cx, y: b.cy };
        if (frame % Math.max(1, Math.round(spec.fps / 20)) === 0) {
          result.samples.push({ t: time + dt, held: held, cx: b.cx, cy: b.cy,
            width: b.bboxR - b.bboxL, height: b.bboxB - b.bboxT,
            stretch: health.stretch, motion: motion, actualFrameVX: frameCenterVX, actualFrameVY: frameCenterVY,
            nodeFrameJump: frameNodeJump, solved: jelloFrameNo !== previousSolveFrame, areaRatio: health.areaRatio,
            crossings: health.crossings, minDet: health.minDet, terrain: health.embedded,
            pointer: held ? { x: surfaceSlimeGrip.x, y: surfaceSlimeGrip.y } : null });
        }
        if (!result.finite || !result.alive) break;
      }
      result.rejectedSteps = b._handRejects || 0;
      result.final = { cx: b.cx, cy: b.cy, height: b.bboxB - b.bboxT, motion: momentum(), health: geometry() };
      result.strip = spec.capture ? strip() : null;
      return result;
    } finally {
      if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
      Math.random = nativeRandom; performance.now = nativeNow; jelloLaunchBody = nativeLaunch;
    }
    function pointer(t) {
      var lift = Math.min(1, t / 0.55), y = -95 * (lift * lift * (3 - 2 * lift)), dx = 0;
      if (spec.name === 'edge-swing') dx = t <= 0.55 ? 0 : 95 * Math.sin((t - 0.55) * 4.6);
      if (spec.name === 'side-flick' || spec.name === 'stop-before-release') {
        var sweep = Math.max(0, Math.min(1, (t - 0.55) / 0.30)); dx = sweep * 100;
      }
      if (spec.name === 'wall-drag') dx = Math.max(0, Math.min(1, (t - 0.55) / 0.60)) * (wallX - gripX + 65);
      return { x: dx, y: y };
    }
    function momentum() {
      var cx = 0, cy = 0, vx = 0, vy = 0, scale = JELLO_TIMESCALE / (b._stepH || jelloStepH || JELLO_H);
      for (var i = 0; i < b.n; i++) { cx += b.px[i]; cy += b.py[i]; vx += (b.px[i] - b.ox[i]) * scale; vy += (b.py[i] - b.oy[i]) * scale; }
      cx /= b.n; cy /= b.n; vx /= b.n; vy /= b.n;
      var angular = 0, inertia = 0, internal = 0;
      for (i = 0; i < b.n; i++) {
        var x = b.px[i] - cx, y = b.py[i] - cy;
        angular += x * ((b.py[i] - b.oy[i]) * scale - vy) - y * ((b.px[i] - b.ox[i]) * scale - vx);
        inertia += x * x + y * y;
      }
      var spin = inertia > 1e-9 ? angular / inertia : 0;
      for (i = 0; i < b.n; i++) {
        var ux = (b.px[i] - b.ox[i]) * scale - vx + spin * (b.py[i] - cy);
        var uy = (b.py[i] - b.oy[i]) * scale - vy - spin * (b.px[i] - cx);
        internal += ux * ux + uy * uy;
      }
      return { vx: vx, vy: vy, px: vx * b.n, py: vy * b.n, angular: angular,
        spin: spin, internalSpeed: Math.sqrt(internal / b.n) };
    }
    function snapshot() {
      return { cx: b.cx, cy: b.cy, px: Array.from(b.px), py: Array.from(b.py),
        ox: Array.from(b.ox), oy: Array.from(b.oy), motion: momentum() };
    }
    function arrayError(a, c) { var e = 0; for (var i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - c[i])); return e; }
    function velocityError(a, c) {
      var e = 0; for (var i = 0; i < a.px.length; i++) e = Math.max(e,
        Math.abs((a.px[i] - a.ox[i]) - (c.px[i] - c.ox[i])), Math.abs((a.py[i] - a.oy[i]) - (c.py[i] - c.oy[i])));
      return e;
    }
    function geometry() {
      var area = 0, finite = true, embedded = 0, depth = 0, crossings = 0, minDet = 1, severe = 0, stretch = 0;
      for (var p = 0; p < b.n; p++) {
        finite = finite && isFinite(b.px[p] + b.py[p] + b.ox[p] + b.oy[p]);
        if (jelloWorldSolidAt(b.px[p], b.py[p])) {
          embedded++; var left = Math.floor(b.px[p] / TILE) * TILE, top = Math.floor(b.py[p] / TILE) * TILE;
          depth = Math.max(depth, Math.min(b.px[p] - left, left + TILE - b.px[p], b.py[p] - top, top + TILE - b.py[p]));
        }
      }
      for (var i = 0; i < b.ringN; i++) {
        var a = b.ring[i], c = b.ring[(i + 1) % b.ringN];
        area += b.px[a] * b.py[c] - b.px[c] * b.py[a];
        for (var j = i + 2; j < b.ringN; j++) {
          if (i === 0 && j === b.ringN - 1) continue;
          var d = b.ring[j], e = b.ring[(j + 1) % b.ringN];
          if (cross(a, c, d) * cross(a, c, e) < -1e-8 && cross(d, e, a) * cross(d, e, c) < -1e-8) crossings++;
        }
      }
      for (i = 0; i < b.triN; i++) {
        var a = b.triA[i], c = b.triB[i], d = b.triC[i], at = i * 4;
        var det = ((b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) - (b.py[c] - b.py[a]) * (b.px[d] - b.px[a])) *
          (b.triDmInv[at] * b.triDmInv[at + 3] - b.triDmInv[at + 1] * b.triDmInv[at + 2]);
        minDet = Math.min(minDet, det); if (det < -0.2) severe++;
      }
      for (i = 0; i < b.springN; i++) {
        var a = b.sA[i], c = b.sB[i];
        var rest = Math.hypot(b.rx[c] - b.rx[a], b.ry[c] - b.ry[a]);
        if (rest > 1e-6) stretch = Math.max(stretch, Math.hypot(b.px[c] - b.px[a], b.py[c] - b.py[a]) / rest);
      }
      return { finite: finite, embedded: embedded, terrainDepth: depth, crossings: crossings,
        minDet: minDet, severe: severe, stretch: stretch, areaRatio: Math.abs(area) * 0.5 / b.restArea };
    }
    function cross(a, c, d) { return (b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) - (b.py[c] - b.py[a]) * (b.px[d] - b.px[a]); }
    function capture(time, phase) {
      // Crop the actual game canvas. Do not replace the renderer with a diagram.
      render(); var image = document.createElement('canvas'); image.width = 400; image.height = 300;
      var draw = image.getContext('2d'), scale = worldScale * dpr;
      var left = initial.cx - 70, top = floor - 215;
      draw.drawImage(canvas, (left - cam.x) * scale, (top - cam.y) * scale, 320 * scale, 240 * scale, 0, 0, 400, 300);
      frames.push({ canvas: image, time: time, phase: phase });
    }
    function strip() {
      var image = document.createElement('canvas'); image.width = 400 * frames.length; image.height = 332;
      var draw = image.getContext('2d'); draw.fillStyle = '#303931'; draw.fillRect(0, 0, image.width, image.height);
      draw.fillStyle = '#f0eee5'; draw.font = '13px monospace';
      for (var i = 0; i < frames.length; i++) {
        draw.drawImage(frames[i].canvas, i * 400, 32);
        draw.fillText((spec.experimental ? 'Handling' : 'Original') + ' ' + frames[i].phase + ' ' + frames[i].time.toFixed(2) + 's', i * 400 + 8, 20);
      }
      return image.toDataURL('image/png');
    }
  };`);

  for (const fps of rates) for (const name of selected) for (const experimental of [false, true]) {
    const spec = { name, fps, experimental, capture: fps === 60 };
    const result = await game(`window.__runHandlingCase(${JSON.stringify(spec)})`);
    if (result.strip) {
      result.stripFile = `${name}-${fps}-${result.mode}.png`;
      fs.writeFileSync(path.join(dump, result.stripFile), Buffer.from(result.strip.split(',')[1], 'base64'));
    }
    delete result.strip; results.push(result);
    const { initial, samples, release, final, ...summary } = result;
    console.log('CASE ' + JSON.stringify({ ...summary, release: release && { positionChange: release.positionMaxChange,
      historyChange: release.historyMaxChange, launchCalls: release.launchCalls, spin: release.after.spin, vx: release.after.vx, vy: release.after.vy } }));
    fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, results, browserErrors, failures }, null, 2));
  }
  for (let index = 0; index < results.length; index += 2) {
    check(`${results[index].name}/${results[index].fps} starts from identical geometry and velocity`,
      JSON.stringify(results[index].initial) === JSON.stringify(results[index + 1].initial));
  }
  check('both handling modes retain the same contact solver', results.every(r => r.softContact));
  check('all deterministic cases keep finite, present bodies', results.every(r => r.deterministicClock && r.finite && r.alive));
  check('every grab retains its exact original material patch', results.every(r => r.fixedMaterialPatch));
  check('all release paths clear the grip and preserve array objects', results.every(r => r.release?.clearsGrip && r.release.sameArrayObjects));
  const experimental = results.filter(r => r.mode === 'handling');
  check('new release and cancellation preserve all node positions, histories and velocities exactly', experimental.every(r =>
    r.release.positionMaxChange === 0 && r.release.historyMaxChange === 0 && r.release.velocityMaxChange === 0 &&
    JSON.stringify(r.release.before) === JSON.stringify(r.release.after)));
  check('new release never calls the launch helper or starts a shape-recovery timer', experimental.every(r => r.release.launchCalls === 0 && r.release.recoverTime === 0));
  check('held bodies lift and retain real internal deformation', experimental.every(r => r.maxHeldLift > 25 && r.heldMaxStretch > 1.03 && r.heldMaxInternalSpeed > 1));
  check('off-center grip produces spin before release without a release kick', experimental.filter(r => r.name === 'edge-swing').every(r => r.heldMaxSpin > 0.05 && r.release.launchCalls === 0));
  check('new handling never crosses its skin or severely inverts the health mesh', experimental.every(r =>
    r.heldMaxRingCrossings === 0 && r.afterMaxRingCrossings === 0 && r.heldMaxSevereInversions === 0 && r.afterMaxSevereInversions === 0));
  check('new held and released nodes stay outside the floor and wall', experimental.every(r => r.heldTerrainPointFrames === 0 && r.afterTerrainPointFrames === 0));
  check('wall-drag actually loads the wall before release', experimental.filter(r => r.name === 'wall-drag').every(r => r.heldWallContactFrames > 5));
  check('a solved held frame cannot freeze every node while retaining stored translation', experimental.every(r => r.heldFrozenVelocityFrames === 0));
  check('new handling avoids catastrophic one-frame motion', experimental.every(r => r.maxNodeJump < 100 && r.maxCenterJump < 70));

  // Fresh navigation verifies the opt-in page and real mouse/touch event routing.
  // Persistence must be disabled by softplay itself, without a nosave parameter.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softplay=1&softhandling=1&nopause=1&tod=0.35` });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate("typeof __handlingTest === 'function' && !!document.getElementById('soft-contact-playtest')")) break;
    await sleep(100);
  }
  await game('cancelAnimationFrame(gameRafId); gameRafId = 0;');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  ui = await game(`(function() {
    var panel = document.getElementById('soft-contact-playtest');
    return { found: !!panel, savesDisabled: SAVE_DISABLED, contact: SOFT_CONTACT, handling: SOFT_HANDLING,
      buttons: panel ? Array.from(panel.querySelectorAll('button')).map(function(b) { return b.textContent; }) : [],
      options: panel ? Array.from(panel.querySelector('select').options).map(function(o) { return o.value; }) : [] };
  })()`);
  ui.interactions = [];
  check('handling opt-in page has both modes and all three arenas with saves off', ui.found && ui.savesDisabled && ui.contact && ui.handling &&
    ui.buttons.includes('New handling') && ui.buttons.includes('Original handling') &&
    ['free', 'ledge', 'pair'].every(value => ui.options.includes(value)));
  await game(`window.__handlingUICheck = function(before) {
    var b = window.__handlingUIBody, values = [Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)];
    if (before) { window.__handlingUIBefore = values; window.__handlingUIRefs = [b.px, b.py, b.ox, b.oy]; return true; }
    var error = 0;
    for (var a = 0; a < 4; a++) for (var p = 0; p < b.n; p++) error = Math.max(error, Math.abs(values[a][p] - window.__handlingUIBefore[a][p]));
    return { released: !surfaceSlimeGrip && !b._grabbed, arrayChange: error,
      sameArrays: window.__handlingUIRefs[0] === b.px && window.__handlingUIRefs[1] === b.py &&
        window.__handlingUIRefs[2] === b.ox && window.__handlingUIRefs[3] === b.oy,
      recoverTime: b._recoverT || 0, contact: SOFT_CONTACT, handling: SOFT_HANDLING };
  };`);
  for (const input of ['mouse', 'touch']) {
    const mobile = input === 'touch';
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await evaluate("window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
    await sleep(100);
    for (const experimental of [false, true]) for (const arena of ['free', 'ledge', 'pair']) {
      const prepared = await game(`(function() {
        var panel = document.getElementById('soft-contact-playtest');
        var label = ${JSON.stringify(experimental ? 'New handling' : 'Original handling')};
        var button = Array.from(panel.querySelectorAll('button')).find(function(b) { return b.textContent === label; });
        button.click();
        var select = panel.querySelector('select'); select.value = ${JSON.stringify(arena)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
        function scenePose() {
          return JSON.stringify({ rig: [player.x, player.y, player.vx, player.vy], bodies:
            jelloBodies.filter(function(body) { return !!body.surfaceSlime; }).map(function(body) {
              return [Array.from(body.px), Array.from(body.py), Array.from(body.ox), Array.from(body.oy)];
            }) });
        }
        var originalPose = scenePose();
        var bodies = jelloBodies.filter(function(body) { return !!body.surfaceSlime; });
        var b = bodies[0], tileColumn = Math.floor(b.cx / TILE);
        var originalTile = JSON.stringify(world[SKY_ROWS][tileColumn]);
        var repeat = Array.from(panel.querySelectorAll('button')).find(function(button) { return button.textContent === 'Repeat'; });
        surfaceSlimeGrabStart(b.cx, b.cy, 'repeat-test');
        world[SKY_ROWS][tileColumn] = null; invalidateTerrainAround(SKY_ROWS, tileColumn);
        keys.ArrowRight = keys.d = true; dpad.up = true;
        player.drillGlideT = 0.2; player.slideAssistT = 1; hitPauseT = 0.03;
        if (repeat) repeat.click();
        var repeatPoseMatches = scenePose() === originalPose;
        var repeatRestoresTile = JSON.stringify(world[SKY_ROWS][tileColumn]) === originalTile;
        var repeatClearsInput = !surfaceSlimeGrip && !keys.ArrowRight && !keys.d && !dpad.up &&
          player.drillGlideT === 0 && player.slideAssistT === 0 && hitPauseT === 0;
        bodies = jelloBodies.filter(function(body) { return !!body.surfaceSlime; });
        b = bodies[0]; window.__handlingUIBody = b;
        // Keep a fixed view during drag, as the deterministic harness does.
        cam.x = b.cx - screenW * 0.48; cam.y = b.cy - screenH * 0.57;
        render(); var rect = canvas.getBoundingClientRect();
        return { x: rect.left + (b.cx - cam.x) * worldScale,
          y: rect.top + (b.cy - cam.y) * worldScale, scale: worldScale, startY: b.cy,
          modeMatches: SOFT_HANDLING === ${experimental} && SOFT_CONTACT,
          pressed: button.getAttribute('aria-pressed') === 'true', count: bodies.length,
          repeatAvailable: !!repeat, repeatPoseMatches: repeatPoseMatches,
          repeatRestoresTile: repeatRestoresTile, repeatClearsInput: repeatClearsInput };
      })()`);
      const cancel = mobile || arena === 'ledge';
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: prepared.x, y: prepared.y }] });
      else await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const grabbed = await game('!!surfaceSlimeGrip && surfaceSlimeGrip.body === window.__handlingUIBody');
      if (grabbed) for (let frame = 1; frame <= 18; frame++) {
        const px = prepared.x + prepared.scale * 30 * frame / 18;
        const py = prepared.y - prepared.scale * 65 * frame / 18;
        if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: px, y: py }] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'left', buttons: 1 });
        await game('update(1/60); surfaceSlimeTick(1/60); updateJello(1/60);');
      }
      const lifted = await game(`(function() { for (var i = 0; i < 18; i++) { update(1/60); surfaceSlimeTick(1/60); updateJello(1/60); } render(); return ${prepared.startY} - window.__handlingUIBody.cy; })()`);
      await game('__handlingUICheck(true)');
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else if (cancel) await evaluate("window.dispatchEvent(new Event('blur'))");
      else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x + prepared.scale * 30,
        y: prepared.y - prepared.scale * 65, button: 'left', clickCount: 1 });
      const release = await game('__handlingUICheck(false)');
      // Clear browser mouse bookkeeping after blur without changing the case result.
      if (!mobile && cancel) await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const report = { input, mode: experimental ? 'handling' : 'original', arena, cancel,
        ...prepared, grabbed, lifted, release };
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      report.screenshot = `ui-${input}-${arena}-${report.mode}.png`;
      fs.writeFileSync(path.join(dump, report.screenshot), Buffer.from(screenshot.data, 'base64'));
      ui.interactions.push(report);
      console.log('UI ' + JSON.stringify(report));
    }
    if (mobile) {
      ui.mobile = await evaluate(`(function() {
        var panel = document.getElementById('soft-contact-playtest'), box = panel.getBoundingClientRect();
        return { width: innerWidth, height: innerHeight,
          fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
          controls: Array.from(panel.querySelectorAll('button,select')).map(function(el) {
            var r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { label: el.textContent || el.getAttribute('aria-label'), height: r.height, width: r.width,
              reachable: hit === el || el.contains(hit) };
          }) };
      })()`);
    }
  }
  check('real mouse and touch select both modes and grab all three arenas', ui.interactions.length === 12 &&
    ui.interactions.every(r => r.modeMatches && r.pressed && r.grabbed && r.count === (r.arena === 'pair' ? 2 : 1)));
  check('Repeat restores each arena pose, terrain and input state in both modes', ui.interactions.every(r =>
    r.repeatAvailable && r.repeatPoseMatches && r.repeatRestoresTile && r.repeatClearsInput));
  check('real pointer motion lifts the material and every input path releases', ui.interactions.every(r => r.lifted > 10 && r.release.released));
  check('real new-handling release and cancellation preserve node arrays without recovery', ui.interactions.filter(r => r.mode === 'handling').every(r =>
    r.release.sameArrays && r.release.arrayChange === 0 && r.release.recoverTime === 0));
  check('390 by 844 handling controls fit and remain reachable', ui.mobile.fits &&
    ui.mobile.controls.every(control => control.reachable && control.width > 0 && control.height >= 44));

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1` });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate("typeof __handlingTest === 'function' && __handlingTest(\"introPhase === 'done'\")")) break;
    await sleep(100);
  }
  defaults = await game("({ contact: SOFT_CONTACT, handling: SOFT_HANDLING, playtest: softPlayEnabled })");
  check('ordinary game keeps both experiments off', !defaults.contact && !defaults.handling && !defaults.playtest);
  check('no browser exceptions', browserErrors.length === 0);
  const notes = [
    'These are safety and continuity checks. Numerical results do not establish satisfying feel.',
    'Both A/B modes use SOFT_CONTACT=true. Only SOFT_HANDLING changes between matched initial states.',
    'Each deterministic trial settles the same seeded material for two seconds, then runs normal surfaceSlimeTick and updateJello.',
    'Linear momentum uses unit mass per node; angular momentum is measured about the node centroid. Spin is the least-squares rigid angular velocity.',
    'Internal speed removes rigid translation and rotation from the node velocities.',
    'Frozen-velocity checks require a real gel step, every node moving less than 1e-7 pixels over the frame, and stored center speed over one pixel per second. Unsimulated frames at 144 Hz are excluded.',
    'Stretch compares current spring-node distances with the original material coordinates, not animated spring rest lengths.',
    'Release snapshots are taken immediately before and after the release call, with no simulation step in between.',
    'Ring crossings inspect the physical outer ring. Severe inversion is a normalized health-triangle determinant below -0.20.',
    'Rendered strips and UI screenshots use the actual game renderer. No replacement shape or diagram is drawn.',
    'Every launch uses an owned Chrome for Testing process and private profile, closed in finally.'
  ];
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, notes, results, ui, defaults, browserErrors, failures }, null, 2));
  console.log(`Wrote ${results.length} cases and ${ui.interactions.length} UI interactions to ${path.join(dump, 'report.json')}`);
  assert.equal(failures.length, 0, failures.join('\n'));
} finally { cleanup(); }
