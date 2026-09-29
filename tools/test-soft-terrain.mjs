// Diagnostic A/B terrain-contact comparison. Uses a private Chrome for Testing child.
// node tools/test-soft-terrain.mjs
// BASELINE_ONLY=1 FPS=60 CASES=floor-pressure,wall-slide DUMP=/tmp/my-run
// CPU=1 uses software graphics and CPU water/fire for the dry geometry and UI fixtures.
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
const port = Number(process.env.PORT || 8251), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-terrain';
const cpu = process.env.CPU === '1';
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
const baselineOnly = process.env.BASELINE_ONLY === '1';
const skipUI = baselineOnly || process.env.SKIP_UI === '1';
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const selected = (process.env.CASES || 'floor-pressure,wall-slide,ledge-pull,unsupported-drape').split(',');
assert.ok(rates.every(fps => fps >= 20 && fps <= 240), 'FPS is between 20 and 240');
assert.ok(selected.every(name => /^(floor-pressure|wall-slide|ledge-pull|unsupported-drape)$/.test(name)), 'known CASES');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
assert.ok(baselineOnly || bundle.includes('SOFT_TERRAIN'), 'build terrain experiment or run BASELINE_ONLY=1');
const terrainShim = bundle.includes('SOFT_TERRAIN') ? '' : '\nvar SOFT_TERRAIN = false;\n';
const servedBundle = bundle.slice(0, end) + terrainShim + '\nwindow.__terrainTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-terrain-browser-');
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
const boots = [];
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  clearTimeout(watchdog);
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + ' during ' + stage)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    if (stage === 'initial page navigation') console.log(new Date().toISOString() + ' SEND ' + method);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__terrainTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __terrainTest === 'function'")) {
      boot.last = await game(`({ intro: introPhase, assets: gameLoadingAssetsReady, work: gameLoadingWorkPending,
        terrainPending: terrainChunkPendingThisFrame, clouds: loadingCloudsReady(), frame: gameRafId,
        fence: gameLoadingFence ? { frames: gameLoadingFence.frames, gpuDone: gameLoadingFence.gpuDone, gl: gameLoadingFence.gl.length } : null,
        warm: window.__shaderWarm, hidden: document.hidden,
        loading: window.SluiceLoading ? SluiceLoading.report().tasks.filter(function(t) { return t.state === 'running'; }) : [] })`);
      if (boot.last.intro === 'done') {
        if (panel) await game('softPlayTick(0);');
        boot.elapsedMs = performance.now() - started;
        console.log('BOOT completed ' + JSON.stringify(boot));
        return true;
      }
      if (cpu && boot.last.assets && !boot.last.work && boot.last.intro === 'warmup') {
        // Exercise the actual loading renderer when headless rAF is not progressing.
        // Never override introPhase or mark any readiness gate complete ourselves.
        await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; renderLoadingScene();');
        boot.manualFrames++;
      }
    }
    await sleep(50);
  }
  boot.elapsedMs = performance.now() - started;
  console.log('BOOT incomplete ' + JSON.stringify(boot));
  return false;
}

try {
  console.log('BOOT snapshot ' + bundleHash + ' cpu=' + cpu);
  stage = 'browser startup';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', ...(cpu ? ['--disable-gpu', '--disable-software-rasterizer'] :
      ['--enable-unsafe-webgpu', '--use-angle=metal']), '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', fs.openSync(path.join(dump, 'chrome.log'), 'w')] });
  watchdog = setTimeout(() => { console.error('FAIL comparison exceeded three minutes during ' + stage); cleanup(); process.exit(1); }, 180000);
  let endpoint;
  const startupBegan = performance.now();
  for (let attempt = 0; performance.now() - startupBegan < 25000; attempt++) {
    assert.equal(chrome.exitCode, null, 'owned browser stays alive during startup');
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(endpoint, 'testing browser started');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP socket open exceeded ten seconds')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', event => { clearTimeout(timer); reject(new Error('CDP socket failed: ' + event.message)); }, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request?.timer);
      if (stage === 'initial page navigation') console.log(new Date().toISOString() + ' RECEIVE ' + message.id);
      message.error ? request?.reject(message.error) : request?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      browserErrors.push(message.params.args.map(value => value.value || value.description));
    }
  });
  console.log('BOOT browser connected'); stage = 'initial page navigation';
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1&softterrain=1${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__terrainPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  await game(`window.__runTerrainCase = function(spec) {
    var nativeRandom = Math.random, nativeNow = performance.now;
    var clock = 100000, rng = 314159265, frames = [];
    Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    performance.now = function() { return clock; };
    var b, dt = 1 / spec.fps, origin = DECK_CENTER_COL - 18, floor = SKY_ROWS * TILE;
    var x = origin * TILE, wallColumn = origin + 2, wallX = wallColumn * TILE;
    var drape = spec.name === 'unsupported-drape', pedestalCol = drape ? origin : origin + 2;
    var pedestalTop = floor - TILE, pedestalLeft = pedestalCol * TILE, pedestalRight = pedestalLeft + TILE;
    var releaseTime = spec.name === 'floor-pressure' ? 3.0 : spec.name === 'wall-slide' ? 4.0 : spec.name === 'ledge-pull' ? 2.2 : 2.0;
    var removeSupportTime = drape ? 1.1 : Infinity;
    try {
      if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
      resetJello(); skySlimes.length = 0; skySlimeNext = 1e9; surfaceSlimesSeeded = true;
      SOFT_CONTACT = SOFT_HANDLING = true; SOFT_TERRAIN = false; softContactClear();
      Object.keys(keys).forEach(function(key) { keys[key] = false; });
      dpad.left = dpad.right = dpad.up = dpad.down = false;
      Object.assign(player, JSON.parse(JSON.stringify(window.__terrainPlayerInitial)));
      gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
      shopState = 'closed'; drilling = null; hitPauseT = 0; siphon.equipped = false;
      player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
      player.thrusting = false; player.thrustSpool = 0; player._thrustWas = false;
      player.jelloGroundT = 0; player.jelloImpactVy = 0; player.jelloCarryVx = 0;
      player.onJello = false; player.onGround = true; player.airTime = 0;
      player.x = x - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
      player.renderX = player.x; player.renderY = player.y;
      for (var row = 0; row <= SKY_ROWS + 7; row++) {
        for (var col = origin - 15; col <= origin + 15; col++) {
          var obstacle = (spec.name === 'wall-slide' && col === wallColumn) ||
            ((spec.name === 'ledge-pull' || drape) && col === pedestalCol && row === SKY_ROWS - 1);
          world[row][col] = row >= SKY_ROWS || obstacle ? { type: 'foundation', hp: ORES.foundation.hp } : null;
          invalidateTerrainAround(row, col);
        }
      }
      for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
      var startX = drape ? pedestalLeft + TILE * 0.64 : x;
      b = surfaceSlimeBuild(startX, (drape ? pedestalTop : floor) - 36,
        { id: 95001, seed: 0.46, hue: 133, home: startX, r: 24.3 });
      cam.x = x - screenW / 2; cam.y = floor - screenH * 0.65;
      for (var settle = 0; settle < (drape ? 0 : 240); settle++) { clock += 1000 / 120; updateJello(1 / 120); }
      SOFT_TERRAIN = spec.experimental;
      if (typeof softTerrainReport !== 'undefined') Object.keys(softTerrainReport).forEach(function(key) { softTerrainReport[key] = 0; });
      var initial = snapshot(), gripX = b.cx, gripY = b.cy;
      if (drape) {
        gripX -= (b.cx - b.bboxL) * 0.60;
        while (!jelloPointInRing(b, gripX, gripY) && Math.abs(gripX - b.cx) > 0.1) gripX = (gripX + b.cx) / 2;
      }
      if (!surfaceSlimeGrabStart(gripX, gripY, 'mouse')) throw new Error('scenario failed to grab');
      var weights = surfaceSlimeGrip.weights, weightData = JSON.stringify(weights);
      var releaseFrame = Math.round(releaseTime * spec.fps), totalFrames = releaseFrame + Math.round(1.8 * spec.fps);
      var result = { name: spec.name, fps: spec.fps, mode: spec.experimental ? 'terrain' : 'prior',
        deterministicClock: performance.now() === clock, contact: SOFT_CONTACT, handling: SOFT_HANDLING,
        initial: initial, fixedPatch: true, finite: true, alive: true, maxNodeJump: 0,
        terrainPointFrames: 0, segmentTileCrossings: 0, enclosedTileProbes: 0, maxTerrainDepth: 0,
        maxRingCrossings: 0, maxInvertedTriangles: 0, maxSevereInversions: 0, minTriangleDet: 1,
        contactFrames: 0, floorContactFrames: 0, wallContactFrames: 0, pedestalContactFrames: 0,
        tangentStuckFrames: 0, frozenVelocityFrames: 0, maxFrozenStoredSpeed: 0,
        maxDrapeDepth: 0, maxHeldHeight: 0, supportRemoval: null,
        stationaryTail: { frames: 0, storedVX: 0, storedVY: 0, actualVX: 0, actualVY: 0, maxNodeJump: 0 },
        phases: {}, release: null, firstViolation: null, samples: [] };
      var priorX = Array.from(b.px), priorY = Array.from(b.py), priorTarget = pointer(0);
      var captures = [0, Math.round(releaseFrame * 0.35), Math.round(releaseFrame * 0.65), releaseFrame - 1,
        releaseFrame, releaseFrame + Math.round(0.25 * spec.fps), releaseFrame + Math.round(1.2 * spec.fps)];
      for (var frame = 0; frame <= totalFrames; frame++) {
        var elapsed = frame * dt;
        if (drape && !result.supportRemoval && elapsed + 1e-9 >= removeSupportTime) {
          result.supportRemoval = { time: elapsed, cy: b.cy, bodyBottom: b.bboxB, before: geometry() };
          world[SKY_ROWS - 1][pedestalCol] = null; invalidateTerrainAround(SKY_ROWS - 1, pedestalCol);
        }
        if (frame === releaseFrame) {
          var before = snapshot(), arrays = [b.px, b.py, b.ox, b.oy];
          var ended = surfaceSlimeGrabEnd('mouse', false), after = snapshot();
          result.release = { time: elapsed, ended: ended, clearsGrip: !surfaceSlimeGrip && !b._grabbed,
            sameObjects: arrays[0] === b.px && arrays[1] === b.py && arrays[2] === b.ox && arrays[3] === b.oy,
            unchangedNodes: JSON.stringify(before) === JSON.stringify(after), recoverTime: b._recoverT || 0,
            before: before.motion, after: after.motion };
        }
        if (spec.capture && captures.indexOf(frame) >= 0) capture(elapsed, frame < releaseFrame ? 'held' : 'released');
        if (frame === totalFrames) break;
        var held = frame < releaseFrame, target = pointer(Math.min(releaseTime, elapsed + dt));
        clock += dt * 1000;
        if (held) surfaceSlimeGrabMove(gripX + target.x, gripY + target.y, 'mouse');
        var previousSolveFrame = jelloFrameNo;
        update(dt); surfaceSlimeTick(dt); updateJello(dt);
        var health = geometry(), motion = momentum(), nodeJump = 0, actualVX = 0, actualVY = 0;
        for (var p = 0; p < b.n; p++) {
          nodeJump = Math.max(nodeJump, Math.hypot(b.px[p] - priorX[p], b.py[p] - priorY[p]));
          actualVX += (b.px[p] - priorX[p]) / dt / b.n; actualVY += (b.py[p] - priorY[p]) / dt / b.n;
        }
        var solved = jelloFrameNo !== previousSolveFrame, phaseName = held ? target.phase : 'released';
        var phase = result.phases[phaseName];
        if (!phase) phase = result.phases[phaseName] = { firstX: b.cx, firstY: b.cy, lastX: b.cx, lastY: b.cy,
          minX: b.cx, maxX: b.cx, minY: b.cy, maxY: b.cy, contacts: 0, frames: 0, rejectsAtStart: b._guardRejects || 0 };
        phase.lastX = b.cx; phase.lastY = b.cy; phase.minX = Math.min(phase.minX, b.cx); phase.maxX = Math.max(phase.maxX, b.cx);
        phase.minY = Math.min(phase.minY, b.cy); phase.maxY = Math.max(phase.maxY, b.cy); phase.frames++;
        phase.rejectsAtEnd = b._guardRejects || 0; phase.contacts += health.contacts ? 1 : 0;
        if (!result.firstViolation && (health.embedded || health.segmentHits || health.enclosed || health.crossings || health.inverted)) {
          result.firstViolation = { t: elapsed + dt, held: held, phase: phaseName, health: health,
            snapshot: snapshot(), rejected: b._guardRejects || 0, reason: b._guardRejectReason || '' };
        }
        result.finite = result.finite && health.finite; result.alive = result.alive && jelloBodies.indexOf(b) >= 0;
        result.maxNodeJump = Math.max(result.maxNodeJump, nodeJump);
        result.terrainPointFrames += health.embedded; result.segmentTileCrossings += health.segmentHits;
        result.enclosedTileProbes += health.enclosed; result.maxTerrainDepth = Math.max(result.maxTerrainDepth, health.depth);
        result.maxRingCrossings = Math.max(result.maxRingCrossings, health.crossings);
        result.maxInvertedTriangles = Math.max(result.maxInvertedTriangles, health.inverted);
        result.maxSevereInversions = Math.max(result.maxSevereInversions, health.severe);
        result.minTriangleDet = Math.min(result.minTriangleDet, health.minDet);
        result.contactFrames += health.contacts ? 1 : 0; result.floorContactFrames += health.floor ? 1 : 0;
        result.wallContactFrames += health.wall ? 1 : 0; result.pedestalContactFrames += health.pedestal ? 1 : 0;
        if (held && elapsed > releaseTime - 0.4) {
          result.stationaryTail.frames++;
          result.stationaryTail.storedVX += motion.vx; result.stationaryTail.storedVY += motion.vy;
          result.stationaryTail.actualVX += actualVX; result.stationaryTail.actualVY += actualVY;
          result.stationaryTail.maxNodeJump = Math.max(result.stationaryTail.maxNodeJump, nodeJump);
        }
        if (held) {
          result.maxHeldHeight = Math.max(result.maxHeldHeight, b.bboxB - b.bboxT);
          result.fixedPatch = result.fixedPatch && !!surfaceSlimeGrip && surfaceSlimeGrip.weights === weights && JSON.stringify(weights) === weightData;
          if (health.pedestal) for (var k = 0; k < b.ringN; k++) {
            var node = b.ring[k];
            if (b.px[node] > pedestalRight + 0.5 || b.px[node] < pedestalLeft - 0.5)
              result.maxDrapeDepth = Math.max(result.maxDrapeDepth, b.py[node] - pedestalTop);
          }
          var tangentTravel = spec.name === 'wall-slide' ? Math.abs(target.y - priorTarget.y) : Math.abs(target.x - priorTarget.x);
          if (solved && health.contacts && nodeJump < 0.01 && tangentTravel > dt) result.tangentStuckFrames++;
          if (solved && nodeJump < 1e-7 && Math.hypot(motion.vx, motion.vy) > 1) {
            result.frozenVelocityFrames++; result.maxFrozenStoredSpeed = Math.max(result.maxFrozenStoredSpeed, Math.hypot(motion.vx, motion.vy));
          }
        }
        if (frame % Math.max(1, Math.round(spec.fps / 20)) === 0) result.samples.push({ t: elapsed + dt, held: held,
          phase: phaseName, cx: b.cx, cy: b.cy, width: b.bboxR - b.bboxL, height: b.bboxB - b.bboxT,
          motion: motion, actualVX: actualVX, actualVY: actualVY, nodeJump: nodeJump, solved: solved,
          health: health, rejects: b._guardRejects || 0, reason: b._guardRejectReason || '' });
        priorX = Array.from(b.px); priorY = Array.from(b.py); priorTarget = target;
        if (!result.finite || !result.alive) break;
      }
      var tail = result.stationaryTail;
      if (tail.frames) { tail.storedVX /= tail.frames; tail.storedVY /= tail.frames; tail.actualVX /= tail.frames; tail.actualVY /= tail.frames; }
      result.guardRejects = b._guardRejects || 0; result.handRejects = b._handRejects || 0;
      result.terrainCounters = typeof softTerrainReport !== 'undefined' ? JSON.parse(JSON.stringify(softTerrainReport)) : null;
      result.final = { cx: b.cx, cy: b.cy, motion: momentum(), health: geometry() };
      result.strip = spec.capture ? strip() : null;
      return result;
    } finally {
      if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
      Math.random = nativeRandom; performance.now = nativeNow;
    }
    function pointer(t) {
      if (spec.name === 'floor-pressure') {
        var press = Math.min(1, t / 0.5), right = Math.max(0, Math.min(1, (t - 0.5) / 0.9));
        var left = Math.max(0, Math.min(1, (t - 1.5) / 0.9));
        return { x: right * 90 - left * 120, y: press * 45,
          phase: t < 0.5 ? 'press' : t < 1.5 ? 'slide-right' : 'slide-left' };
      }
      if (spec.name === 'wall-slide') {
        var approach = Math.min(1, t / 0.9), up = Math.max(0, Math.min(1, (t - 1.0) / 0.9));
        var down = Math.max(0, Math.min(1, (t - 2.0) / 0.9));
        return { x: (wallX - gripX + 32) * approach, y: -18 * Math.min(1, t / 0.6) - up * 35 + down * 42,
          phase: t < 1 ? 'press' : t < 2 ? 'slide-up' : 'slide-down' };
      }
      if (spec.name === 'ledge-pull') {
        var lift = Math.min(1, t / 0.5), across = Math.max(0, Math.min(1, (t - 0.5) / 0.9));
        var lower = Math.max(0, Math.min(1, (t - 1.1) / 0.7));
        return { x: across * 100, y: -lift * 55 + lower * 38,
          phase: t < 0.5 ? 'lift' : t < 1.1 ? 'pull' : 'lower' };
      }
      return { x: Math.min(1, t / 0.65) * 12, y: Math.min(1, t / 0.65) * 8,
        phase: t < removeSupportTime ? 'drape' : 'unsupported' };
    }
    function momentum() {
      var cx = 0, cy = 0, vx = 0, vy = 0, scale = JELLO_TIMESCALE / (b._stepH || jelloStepH || JELLO_H);
      for (var i = 0; i < b.n; i++) { cx += b.px[i]; cy += b.py[i]; vx += (b.px[i] - b.ox[i]) * scale; vy += (b.py[i] - b.oy[i]) * scale; }
      cx /= b.n; cy /= b.n; vx /= b.n; vy /= b.n;
      var angular = 0, inertia = 0;
      for (i = 0; i < b.n; i++) {
        var dx = b.px[i] - cx, dy = b.py[i] - cy;
        angular += dx * ((b.py[i] - b.oy[i]) * scale - vy) - dy * ((b.px[i] - b.ox[i]) * scale - vx);
        inertia += dx * dx + dy * dy;
      }
      return { vx: vx, vy: vy, angular: angular, spin: inertia > 1e-9 ? angular / inertia : 0 };
    }
    function snapshot() { return { cx: b.cx, cy: b.cy, px: Array.from(b.px), py: Array.from(b.py), ox: Array.from(b.ox), oy: Array.from(b.oy), motion: momentum() }; }
    function geometry() {
      var out = { finite: true, embedded: 0, segmentHits: 0, enclosed: 0, depth: 0, crossings: 0,
        inverted: 0, severe: 0, minDet: 1, contacts: 0, floor: 0, wall: 0, pedestal: 0 };
      var eps = 0.05;
      for (var p = 0; p < b.n; p++) {
        out.finite = out.finite && isFinite(b.px[p] + b.py[p] + b.ox[p] + b.oy[p]);
        if (jelloWorldSolidAt(b.px[p], b.py[p])) {
          var c = Math.floor(b.px[p] / TILE), r = Math.floor(b.py[p] / TILE);
          var depth = Math.min(b.px[p] - c * TILE, (c + 1) * TILE - b.px[p], b.py[p] - r * TILE, (r + 1) * TILE - b.py[p]);
          if (depth > eps) out.embedded++;
          out.depth = Math.max(out.depth, depth);
        }
      }
      for (var i = 0; i < b.ringN; i++) {
        var a = b.ring[i], z = b.ring[(i + 1) % b.ringN];
        for (var j = i + 2; j < b.ringN; j++) {
          if (i === 0 && j === b.ringN - 1) continue;
          var c = b.ring[j], d = b.ring[(j + 1) % b.ringN];
          if (cross(a, z, c) * cross(a, z, d) < -1e-8 && cross(c, d, a) * cross(c, d, z) < -1e-8) out.crossings++;
        }
        var left = Math.floor(Math.min(b.px[a], b.px[z]) / TILE), right = Math.floor(Math.max(b.px[a], b.px[z]) / TILE);
        var top = Math.max(0, Math.floor(Math.min(b.py[a], b.py[z]) / TILE)), bottom = Math.floor(Math.max(b.py[a], b.py[z]) / TILE);
        for (var row = top; row <= bottom; row++) for (var col = left; col <= right; col++) {
          if (!tileAt(row, col)) continue;
          var clip = clipTile(b.px[a], b.py[a], b.px[z], b.py[z], col * TILE + eps, row * TILE + eps,
            (col + 1) * TILE - eps, (row + 1) * TILE - eps);
          if (clip) {
            out.segmentHits++;
            var mx = b.px[a] + (b.px[z] - b.px[a]) * clip, my = b.py[a] + (b.py[z] - b.py[a]) * clip;
            out.depth = Math.max(out.depth, Math.min(mx - col * TILE, (col + 1) * TILE - mx, my - row * TILE, (row + 1) * TILE - my));
          }
        }
        // Measure actual near-skin contact, independently of solver counters.
        for (var q = 0; q <= 2; q++) {
          var sx = b.px[a] + (b.px[z] - b.px[a]) * q / 2, sy = b.py[a] + (b.py[z] - b.py[a]) * q / 2;
          var r0 = Math.max(0, Math.floor((sy - 1.25) / TILE)), r1 = Math.floor((sy + 1.25) / TILE);
          var c0 = Math.floor((sx - 1.25) / TILE), c1 = Math.floor((sx + 1.25) / TILE);
          for (var rr = r0; rr <= r1; rr++) for (var cc = c0; cc <= c1; cc++) {
            if (!tileAt(rr, cc)) continue;
            var x0 = cc * TILE, y0 = rr * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
            var topHit = !tileAt(rr - 1, cc) && sx >= x0 - 0.1 && sx <= x1 + 0.1 && Math.abs(sy - y0) <= 1.25;
            var sideHit = ((!tileAt(rr, cc - 1) && Math.abs(sx - x0) <= 1.25) ||
              (!tileAt(rr, cc + 1) && Math.abs(sx - x1) <= 1.25)) && sy >= y0 - 0.1 && sy <= y1 + 0.1;
            if (topHit || sideHit) out.contacts++;
            if (topHit && y0 === floor) out.floor++;
            if (sideHit && cc === wallColumn && spec.name === 'wall-slide') out.wall++;
            if ((topHit || sideHit) && cc === pedestalCol && rr === SKY_ROWS - 1 && spec.name !== 'wall-slide') out.pedestal++;
          }
        }
      }
      var left = Math.floor(b.bboxL / TILE), right = Math.floor(b.bboxR / TILE);
      var top = Math.max(0, Math.floor(b.bboxT / TILE)), bottom = Math.floor(b.bboxB / TILE);
      for (var row = top; row <= bottom; row++) for (var col = left; col <= right; col++) {
        if (!tileAt(row, col)) continue;
        var probes = [[0.5,0.5],[0.01,0.01],[0.99,0.01],[0.01,0.99],[0.99,0.99]];
        for (var q = 0; q < probes.length; q++) if (jelloPointInRing(b, (col + probes[q][0]) * TILE, (row + probes[q][1]) * TILE)) out.enclosed++;
      }
      for (var t = 0; t < b.triN; t++) {
        var a = b.triA[t], c = b.triB[t], d = b.triC[t], j = t * 4;
        var det = cross(a, c, d) * (b.triDmInv[j] * b.triDmInv[j + 3] - b.triDmInv[j + 1] * b.triDmInv[j + 2]);
        out.minDet = Math.min(out.minDet, det); if (det < -1e-6) out.inverted++; if (det < -0.20) out.severe++;
      }
      return out;
    }
    function cross(a, c, d) { return (b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) - (b.py[c] - b.py[a]) * (b.px[d] - b.px[a]); }
    function clipTile(ax, ay, bx, by, x0, y0, x1, y1) {
      var dx = bx - ax, dy = by - ay, low = 0, high = 1;
      var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
      for (var k = 0; k < 4; k++) {
        if (Math.abs(p[k]) < 1e-10) { if (q[k] < 0) return null; continue; }
        var t = q[k] / p[k];
        if (p[k] < 0) low = Math.max(low, t); else high = Math.min(high, t);
        if (low >= high - 1e-8) return null;
      }
      return (low + high) * 0.5;
    }
    function capture(time, phase) {
      render(); var image = document.createElement('canvas'); image.width = 420; image.height = 300;
      var draw = image.getContext('2d'), scale = worldScale * dpr, left = x - 75, top = floor - 185;
      draw.drawImage(canvas, (left - cam.x) * scale, (top - cam.y) * scale, 280 * scale, 200 * scale, 0, 0, 420, 300);
      frames.push({ canvas: image, time: time, phase: phase });
    }
    function strip() {
      var image = document.createElement('canvas'); image.width = 420 * frames.length; image.height = 332;
      var draw = image.getContext('2d'); draw.fillStyle = '#303931'; draw.fillRect(0, 0, image.width, image.height);
      draw.fillStyle = '#f0eee5'; draw.font = '13px monospace';
      for (var i = 0; i < frames.length; i++) { draw.drawImage(frames[i].canvas, i * 420, 32);
        draw.fillText((spec.experimental ? 'Terrain' : 'Prior') + ' ' + frames[i].phase + ' ' + frames[i].time.toFixed(2) + 's', i * 420 + 8, 20); }
      return image.toDataURL('image/png');
    }
  };`);

  for (const fps of rates) for (const name of selected) for (const experimental of baselineOnly ? [false] : [false, true]) {
    stage = `${name}/${fps}/${experimental ? 'terrain' : 'prior'}`; console.log('START ' + stage);
    const result = await game(`window.__runTerrainCase(${JSON.stringify({ name, fps, experimental, capture: fps === 60 || process.env.CAPTURE === '1' })})`);
    if (result.strip) {
      result.stripFile = `${name}-${fps}-${result.mode}.png`;
      fs.writeFileSync(path.join(dump, result.stripFile), Buffer.from(result.strip.split(',')[1], 'base64'));
    }
    delete result.strip; results.push(result);
    const { initial, samples, supportRemoval, final, release, firstViolation, ...summary } = result;
    console.log('CASE ' + JSON.stringify({ ...summary, release: release?.after }));
    fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, baselineOnly, results, browserErrors, failures }, null, 2));
  }
  if (!baselineOnly) for (let i = 0; i < results.length; i += 2) {
    check(`${results[i].name}/${results[i].fps} starts from identical settled nodes and histories`, JSON.stringify(results[i].initial) === JSON.stringify(results[i + 1].initial));
  }
  check('all trials keep handling and rig-contact enabled', results.every(r => r.contact && r.handling));
  check('all trials keep finite, present bodies and fixed grip patches', results.every(r => r.deterministicClock && r.finite && r.alive && r.fixedPatch));
  check('release preserves every node and history exactly with no recovery timer', results.every(r => r.release?.clearsGrip && r.release.sameObjects && r.release.unchangedNodes && r.release.recoverTime === 0));
  const experimental = results.filter(r => r.mode === 'terrain');
  if (!baselineOnly) {
    check('new terrain excludes nodes, entire skin segments and enclosed tile probes', experimental.every(r =>
      r.terrainPointFrames === 0 && r.segmentTileCrossings === 0 && r.enclosedTileProbes === 0));
    check('new terrain keeps uncrossed skin and no inverted material health triangles', experimental.every(r => r.maxRingCrossings === 0 && r.maxInvertedTriangles === 0));
    check('new terrain avoids frozen nodes carrying stored translation', experimental.every(r => r.frozenVelocityFrames === 0));
    check('floor contact permits substantial tangential travel in both directions', experimental.filter(r => r.name === 'floor-pressure').every(r =>
      r.phases['slide-right'].lastX - r.phases['slide-right'].firstX > 20 &&
      r.phases['slide-left'].lastX - r.phases['slide-left'].firstX < -20));
    check('wall contact permits upward and downward reversal', experimental.filter(r => r.name === 'wall-slide').every(r =>
      r.phases['slide-up'].lastY - r.phases['slide-up'].firstY < -8 &&
      r.phases['slide-down'].lastY - r.phases['slide-down'].firstY > 8));
    check('stationary contact does not bank invisible bulk normal velocity', experimental.filter(r =>
      r.name === 'floor-pressure' || r.name === 'wall-slide').every(r => r.stationaryTail.frames > r.fps * 0.3 &&
        Math.abs(r.name === 'wall-slide' ? r.stationaryTail.storedVX - r.stationaryTail.actualVX :
          r.stationaryTail.storedVY - r.stationaryTail.actualVY) < 20));
    check('new terrain avoids catastrophic one-frame movement', experimental.every(r => r.maxNodeJump < 100));
  }
  check('floor-pressure actually loads the floor', results.filter(r => r.name === 'floor-pressure').every(r => r.floorContactFrames > r.fps));
  check('wall-slide actually stays against a wall', results.filter(r => r.name === 'wall-slide').every(r => r.wallContactFrames > r.fps * 0.5));
  check('ledge-pull actually touches the ledge', results.filter(r => r.name === 'ledge-pull').every(r => r.pedestalContactFrames > 2));
  check('drape removes actual support after contact', results.filter(r => r.name === 'unsupported-drape').every(r => r.supportRemoval && r.pedestalContactFrames > 2));

  let freeAir = null;
  if (!baselineOnly) {
    stage = 'free-air identity';
    freeAir = await game(`(function() {
      var reports = [];
      var nativeRandom = Math.random, nativeNow = performance.now;
      try {
        for (var scenario = 0; scenario < 2; scenario++) for (var mode = 0; mode < 2; mode++) {
          var clock = 100000, rng = 123456;
          Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
          performance.now = function() { return clock; };
          if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
          resetJello(); SOFT_CONTACT = SOFT_HANDLING = true; SOFT_TERRAIN = !!mode; softContactClear();
          var col = DECK_CENTER_COL - 18, x = col * TILE, y = 220;
          for (var r = 0; r < SKY_ROWS + 18; r++) for (var c = col - 12; c <= col + 12; c++) {
            world[r][c] = null; invalidateTerrainAround(r, c);
          }
          player.x = x - 250; player.y = y; player.vx = player.vy = 0; player.onGround = player.onJello = false;
          player.thrusting = false; player.thrustSpool = 0;
          cam.x = x - screenW / 2; cam.y = y - screenH / 2;
          var b = surfaceSlimeBuild(x, y, { id: 95003, seed: 0.46, hue: 133, home: x, r: 24.3 });
          if (scenario) surfaceSlimeGrabStart(b.cx + 10, b.cy, 'free-air');
          else jelloLaunchBody(b, 65, -60, { h: jelloStepH });
          var fingerprints = [], materials = [];
          for (var frame = 0; frame < 48; frame++) {
            clock += 1000 / 60;
            if (scenario) surfaceSlimeGrabMove(x + 10 + 20 * Math.sin(frame / 20), y - frame * 0.35, 'free-air');
            update(1/60); surfaceSlimeTick(1/60); updateJello(1/60);
            var data = JSON.stringify([Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)]);
            var hash = 2166136261;
            for (var i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619) >>> 0;
            fingerprints.push(hash);
            materials.push([JELLO_XPBD_COMPLIANCE, JELLO_XPBD_SHEAR_COMPLIANCE, JELLO_XPBD_VOL_COMPLIANCE,
              JELLO_XPBD_SHAPE, JELLO_INT_DAMP, JELLO_XSPH, b.materialSoftness, b.materialDamping,
              b.surfaceSlime.phase, b.surfaceSlime.motorBlend, b.surfaceSlime.state]);
          }
          reports.push({ scenario: scenario ? 'held' : 'free-flight', terrain: !!mode,
            fingerprints: fingerprints, materials: materials });
        }
      } finally {
        if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
        Math.random = nativeRandom; performance.now = nativeNow;
      }
      return reports;
    })()`);
    for (let i = 0; i < freeAir.length; i += 2) {
      check(`terrain toggle leaves ${freeAir[i].scenario} trajectories exactly identical without terrain`,
        JSON.stringify(freeAir[i].fingerprints) === JSON.stringify(freeAir[i + 1].fingerprints));
      check(`terrain toggle leaves ${freeAir[i].scenario} material and motor state unchanged`,
        JSON.stringify(freeAir[i].materials) === JSON.stringify(freeAir[i + 1].materials));
    }
  }
  if (!skipUI) {
  stage = 'UI navigation';
  // Fresh navigation verifies the opt-in page and real mouse/touch event routing.
  // Persistence must be disabled by softplay itself, without a nosave parameter.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softplay=1&softterrain=1&nopause=1&tod=0.35${extraParams}` });
  assert.ok(await awaitBoot(true), 'playtest page completes its real loading gates');
  await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0;');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  ui = await game(`(function() {
    var panel = document.getElementById('soft-contact-playtest');
    return { found: !!panel, savesDisabled: SAVE_DISABLED, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN,
      buttons: panel ? Array.from(panel.querySelectorAll('button')).map(function(b) { return b.textContent; }) : [],
      options: panel ? Array.from(panel.querySelector('select').options).map(function(o) { return o.value; }) : [] };
  })()`);
  ui.interactions = [];
  check('terrain opt-in page has both modes and all three arenas with saves off', ui.found && ui.savesDisabled && ui.contact && ui.handling && ui.terrain &&
    ui.buttons.includes('New terrain') && ui.buttons.includes('Prior terrain') &&
    ['free', 'ledge', 'pair'].every(value => ui.options.includes(value)));
  await game(`window.__terrainUICheck = function(before) {
    var b = window.__terrainUIBody, values = [Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)];
    if (before) { window.__terrainUIBefore = values; window.__terrainUIRefs = [b.px, b.py, b.ox, b.oy]; return true; }
    var error = 0;
    for (var a = 0; a < 4; a++) for (var p = 0; p < b.n; p++) error = Math.max(error, Math.abs(values[a][p] - window.__terrainUIBefore[a][p]));
    return { released: !surfaceSlimeGrip && !b._grabbed, arrayChange: error,
      sameArrays: window.__terrainUIRefs[0] === b.px && window.__terrainUIRefs[1] === b.py &&
        window.__terrainUIRefs[2] === b.ox && window.__terrainUIRefs[3] === b.oy,
      recoverTime: b._recoverT || 0, contact: SOFT_CONTACT, handling: SOFT_HANDLING };
  };`);
  for (const input of ['mouse', 'touch']) {
    const mobile = input === 'touch';
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await evaluate("window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
    await sleep(100);
    for (const experimental of [false, true]) for (const arena of ['free', 'ledge', 'pair']) {
      stage = `UI/${input}/${arena}/${experimental ? 'terrain' : 'prior'}`;
      const prepared = await game(`(function() {
        var panel = document.getElementById('soft-contact-playtest');
        var label = ${JSON.stringify(experimental ? 'New terrain' : 'Prior terrain')};
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
        b = bodies[0]; window.__terrainUIBody = b;
        // Keep a fixed view during drag, as the deterministic harness does.
        cam.x = b.cx - screenW * 0.48; cam.y = b.cy - screenH * 0.57;
        render(); var rect = canvas.getBoundingClientRect();
        return { x: rect.left + (b.cx - cam.x) * worldScale,
          y: rect.top + (b.cy - cam.y) * worldScale, scale: worldScale, startY: b.cy,
          modeMatches: SOFT_TERRAIN === ${experimental} && SOFT_CONTACT && SOFT_HANDLING,
          pressed: button.getAttribute('aria-pressed') === 'true', count: bodies.length,
          repeatAvailable: !!repeat, repeatPoseMatches: repeatPoseMatches,
          repeatRestoresTile: repeatRestoresTile, repeatClearsInput: repeatClearsInput };
      })()`);
      const cancel = mobile || arena === 'ledge';
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: prepared.x, y: prepared.y }] });
      else await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const grabbed = await game('!!surfaceSlimeGrip && surfaceSlimeGrip.body === window.__terrainUIBody');
      if (grabbed) for (let frame = 1; frame <= 18; frame++) {
        const px = prepared.x + prepared.scale * 30 * frame / 18;
        const py = prepared.y - prepared.scale * 65 * frame / 18;
        if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: px, y: py }] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'left', buttons: 1 });
        await game('update(1/60); surfaceSlimeTick(1/60); updateJello(1/60);');
      }
      const lifted = await game(`(function() { for (var i = 0; i < 18; i++) { update(1/60); surfaceSlimeTick(1/60); updateJello(1/60); } render(); return ${prepared.startY} - window.__terrainUIBody.cy; })()`);
      await game('__terrainUICheck(true)');
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else if (cancel) await evaluate("window.dispatchEvent(new Event('blur'))");
      else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x + prepared.scale * 30,
        y: prepared.y - prepared.scale * 65, button: 'left', clickCount: 1 });
      const release = await game('__terrainUICheck(false)');
      // Clear browser mouse bookkeeping after blur without changing the case result.
      if (!mobile && cancel) await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const report = { input, mode: experimental ? 'terrain' : 'prior', arena, cancel,
        ...prepared, grabbed, lifted, release };
      const screenshot = cpu ? { data: (await game("render(); canvas.toDataURL('image/png')")).split(',')[1] } :
        await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      report.captureKind = cpu ? 'native-game-canvas' : 'browser-viewport';
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
  check('real new-terrain release and cancellation preserve node arrays without recovery', ui.interactions.filter(r => r.mode === 'terrain').every(r =>
    r.release.sameArrays && r.release.arrayChange === 0 && r.release.recoverTime === 0));
  check('390 by 844 terrain controls fit and remain reachable', ui.mobile.fits &&
    ui.mobile.controls.every(control => control.reachable && control.width > 0 && control.height >= 44));

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1${extraParams}` });
  assert.ok(await awaitBoot(), 'ordinary game completes its real loading gates');
  defaults = await game("({ contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, pairs: SOFT_PAIRS, intent: SOFT_INTENT, world: SOFT_WORLD, presentation: SOFT_PRESENTATION, playtest: softPlayEnabled })");
  check('ordinary game enables all eight resident physics paths without the playtest', defaults.contact && defaults.handling && defaults.terrain && defaults.material && defaults.pairs && defaults.intent && defaults.world && defaults.presentation && !defaults.playtest);
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softnext=0&nosave=1&nopause=1${extraParams}` });
  assert.ok(await awaitBoot(), 'explicit reference game completes its real loading gates');
  defaults.reference = await game("({ contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, pairs: SOFT_PAIRS, intent: SOFT_INTENT, world: SOFT_WORLD, presentation: SOFT_PRESENTATION, playtest: softPlayEnabled })");
  check('softnext=0 preserves the ordinary reference with all eight paths off', Object.values(defaults.reference).every(value => value === false));
  }
  check('no browser exceptions', browserErrors.length === 0);
  const notes = [
    'Numerical safety and continuity checks do not establish satisfying feel.',
    'SOFT_CONTACT and SOFT_HANDLING remain true in both comparison modes. Only SOFT_TERRAIN changes.',
    'Every matched trial starts from exactly the same body, before enabling terrain changes. Drape starts above the pedestal so both modes first encounter a legal airborne shape; other fixtures settle for two seconds.',
    'Skin/tile checks independently clip each entire ring segment against solid tile interiors inset by 0.05 pixels; legal endpoints alone cannot pass a crossing segment.',
    'Tile enclosure checks the center and four inset corners; near-contact diagnostics sample the physical skin within 1.25 pixels of exposed tile faces.',
    'Health triangles are the existing overlapping health mesh. Every negative determinant is recorded; severe inversion means below -0.20.',
    'Frozen-motion diagnostics exclude unsimulated frames. Tangential stuck frames require a real solve, actual terrain contact, a moving tangential cursor, and less than 0.01 pixel movement of every node.',
    'The stationary tail compares stored center velocity with actual center travel over the final 0.4 seconds of a held gesture.',
    'Drape removes a real supporting tile while the original material patch remains held, then releases without modifying node histories.',
    'Free-air fixtures compare all per-frame node/history fingerprints and material/motor state with and without terrain enabled.',
    'CPU mode uses the existing _rafTimer test hook because graphics-disabled Chrome does not present native animation frames. Game timers are cancelled before deterministic fixtures.',
    'CPU mode uses native 2D rendering and manually advances the actual loading renderer after its assets settle, without overriding any readiness gate; boot diagnostics record those frames.',
    'All images use the real game renderer. Owned Chrome for Testing is closed in finally.'
  ];
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, baselineOnly, cpu, boots, notes, results, freeAir, ui, defaults, browserErrors, failures }, null, 2));
  console.log(`Wrote ${results.length} terrain cases to ${path.join(dump, 'report.json')}`);
  assert.equal(failures.length, 0, failures.join('\n'));
} catch (error) {
  fs.writeFileSync(path.join(dump, 'interrupted.json'), JSON.stringify({ stage, error: String(error), bundleHash, cpu, boots, results, browserErrors }, null, 2));
  throw error;
} finally { cleanup(); }
