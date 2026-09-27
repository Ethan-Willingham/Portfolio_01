// Bounded-effort laws and autonomous floor/wall/ledge geometry fixtures.
// CPU=1 node tools/test-soft-intent.mjs
// FPS=60 CASES=wall SECONDS=20 TRACE=1 DUMP=/tmp/my-run
// CAPTURE=1 saves actual resident-render PNGs over schematic terrain once per second.
// BUNDLE=/tmp/another-sluice.js selects a built snapshot; source is never patched here.
// Numerical safeguards do not establish the owner's preferred feel.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8291), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-intent';
const cpu = process.env.CPU === '1';
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const selected = (process.env.CASES || 'floor-right,floor-left,wall,ledge').split(',');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const fixtureBundle = bundle;
const tail = fixtureBundle.lastIndexOf('})();');
assert.ok(tail > 0 && bundle.includes('function softIntentThink('), 'built bundle contains the intent checkpoint');
const servedBundle = fixtureBundle.slice(0, tail) + '\nwindow.__intentTest = function(source) { return eval(source); };\n' + fixtureBundle.slice(tail);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-intent-browser-');
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
const game = source => evaluate(`__intentTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __intentTest === 'function'")) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1&softterrain=1&softmaterial=1&softintent=1${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, intent: SOFT_INTENT, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__intentPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  stage = 'isolated effort and traction invariants';
  const laws = await game(`(${lawFixture.toString()})()`);
  console.log('LAWS ' + JSON.stringify(laws));
  check('muscle effort changes no positions, histories, or render target', laws.sameKinematics);
  check('rest strain and rate remain bounded through effort and release', laws.maxStrain <= 0.1801 && laws.maxRestRate <= 0.651);
  check('rest effort returns to passive natural lengths after detachment', laws.passiveRestError < 0.0001);
  check('rotating body and support together preserves muscle rest lengths', laws.rotationError < 0.00001);
  check('internal effort cannot translate the center of mass in free space', laws.centerError < 1e-7);
  check('traction cannot exceed the shared body-weight force budget', laws.tractionForce <= laws.forceBudget + 1e-7 && laws.tractionForce > 0);
  check('traction is a finite force with unchanged histories', laws.tractionHistorySame && laws.tractionDisplacement <= laws.forceBudget * laws.dt * laws.dt + 1e-7);
  check('detached, carried, held, and wet residents release all traction', laws.releases.every(Boolean));
  check('ordinary non-resident bodies stay outside the new controller', !laws.ordinaryEnabled);
  laws.skin = await game(`(${skinLawFixture.toString()})()`);
  console.log('SKIN LAWS ' + JSON.stringify(laws.skin));
  check('local skin impulses dissipate approach without manufacturing energy', laws.skin.energyGain < 1e-9 && laws.skin.normalClosure < 1e-9);
  check('free skin impulses conserve linear and angular momentum', laws.skin.momentumError < 1e-9 && laws.skin.torqueError < 1e-8);
  check('skin projection respects terrain masks and a 2px material-node cap', laws.skin.fixedAxisChange === 0 && laws.skin.cap <= 2 + 1e-9);
  check('rotated and scaled crossed skins separate through local contacts', laws.skin.geometryFailures === 0);
  check('cached geometry updates when collinear-overlap policy changes', laws.skin.priorTouchClear && laws.skin.policyChangeFindsOverlap);
  for (const fps of rates) for (const name of selected) {
    stage = `${name}/${fps}`;
    const result = await game(`(${runFixture.toString()})(${JSON.stringify({ fps, name, seconds: Number(process.env.SECONDS || 20), trace: process.env.TRACE === '1', pairs: process.env.PAIRS !== '0', capture: process.env.CAPTURE === '1' })})`);
    if (result.images) {
      result.captures = result.images.map((frame, index) => {
        const filename = `${name}-${fps}-${String(index).padStart(2, '0')}.png`;
        fs.writeFileSync(path.join(dump, filename), Buffer.from(frame.png.split(',')[1], 'base64'));
        return { t: frame.t, file: filename };
      });
      delete result.images;
    }
    results.push(result);
    console.log('CASE ' + JSON.stringify(result));
    fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundleHash, boots, laws, results, browserErrors, failures }, null, 2));
  }
  check('every moving resident stays finite, unfolded, and out of terrain', results.every(r => r.finite && r.maxCrossings === 0 && r.maxOverlaps === 0 && r.minDet >= -1e-6 && r.embedded === 0 && r.segmentHits === 0 && r.enclosed === 0));
  check('local closure avoids rejected or frozen locomotion', results.every(r => r.guardRejects === 0 && r.maxFrozenSeconds <= 1 / r.fps + 1e-9));
  check('living bodies retain a sensible area', results.every(r => r.minArea > 0.40 && r.maxArea < 1.8));
  check('terrain traction produces actual progress in both directions', results.filter(r => /^floor-/.test(r.name)).every(r => r.progress > 4));
  check('no browser exceptions', browserErrors.length === 0);
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundleHash, boots, laws, results, browserErrors, failures }, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
} catch (error) {
  fs.writeFileSync(path.join(dump, 'interrupted.json'), JSON.stringify({ stage, error: String(error), bundleHash, cpu, boots, results, browserErrors }, null, 2));
  throw error;
} finally { cleanup(); }

function lawFixture() {
  resetJello(); SOFT_INTENT = SOFT_MATERIAL = true;
  var b = surfaceSlimeBuild((DECK_CENTER_COL - 18) * TILE, 300, { seed: 0.46, r: 24.3 });
  var m = b.surfaceSlime, st = softIntentInit(b), dt = 1 / 360, h = dt * JELLO_TIMESCALE;
  m.drive = st.supported = true; m.state = 'crawl'; m.detach = 0; st.tx = 1; st.ty = 0;
  function kinematics() { return JSON.stringify([Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy), Array.from(b.muscleX), Array.from(b.muscleY)]); }
  var initial = kinematics(), maxStrain = 0, maxRestRate = 0;
  for (var frame = 0; frame < 360 * 8; frame++) {
    var before = Array.from(b.sRest);
    softIntentMuscleStep(b, h);
    for (var s = 0; s < b.springN; s++) {
      maxStrain = Math.max(maxStrain, Math.abs(b.sRest[s] / b.muscleRest[s] - 1));
      maxRestRate = Math.max(maxRestRate, Math.abs(b.sRest[s] - before[s]) / b.muscleRest[s] / dt);
    }
  }
  var out = { sameKinematics: initial === kinematics(), maxStrain: maxStrain, maxRestRate: maxRestRate, dt: dt };
  var phase = st.phase, effort = st.effort, saved = Array.from(b.sRest);
  softIntentMuscleStep(b, h); var reference = Array.from(b.sRest);
  b.sRest.set(saved); st.phase = phase; st.effort = effort;
  var angle = 1.2; m.materialAngle = angle; st.tx = Math.cos(angle); st.ty = Math.sin(angle); st.nx = Math.sin(angle); st.ny = -Math.cos(angle);
  softIntentMuscleStep(b, h); out.rotationError = Math.max.apply(null, b.sRest.map(function(x, i) { return Math.abs(x - reference[i]); }));
  var x = 0, y = 0; for (var p = 0; p < b.n; p++) { x += b.px[p]; y += b.py[p]; }
  for (frame = 0; frame < 120; frame++) { softIntentMuscleStep(b, h); softMaterialSolve(b, h); }
  var xx = 0, yy = 0; for (p = 0; p < b.n; p++) { xx += b.px[p]; yy += b.py[p]; }
  out.centerError = Math.hypot(xx - x, yy - y) / b.n;
  m.detach = 100;
  for (frame = 0; frame < 360 * 6; frame++) softIntentMuscleStep(b, h);
  out.passiveRestError = Math.max.apply(null, b.sRest.map(function(x, i) { return Math.abs(x - b.muscleRest[i]); }));
  var originalTileAt = tileAt;
  tileAt = function() { return { type: 'foundation' }; };
  try {
    m.detach = 0; m.state = 'idle'; st.supported = true;
    m.anchors.fill(null);
    for (var k = 0; k < b.ringN; k++) {
      p = b.ring[k]; m.anchors[p] = { x: b.px[p] - 6, y: b.py[p], r: 1, c: 1, nx: 0, ny: -1, strength: 1, overload: 0 };
      b.ox[p] = b.px[p] - 0.4;
    }
    var oldX = Array.from(b.px), oldY = Array.from(b.py), history = JSON.stringify([Array.from(b.ox), Array.from(b.oy)]);
    softIntentAdhesion(b, h);
    out.tractionForce = st.gripForce; out.forceBudget = GRAVITY * b.n * SOFT_INTENT_GRIP_WEIGHT;
    out.tractionHistorySame = history === JSON.stringify([Array.from(b.ox), Array.from(b.oy)]);
    out.tractionDisplacement = 0;
    for (p = 0; p < b.n; p++) out.tractionDisplacement += Math.hypot(b.px[p] - oldX[p], b.py[p] - oldY[p]);
    out.releases = [];
    for (var mode of ['detach', '_carried', '_grabbed', 'wet']) {
      m.detach = 0; m.wet = 0; b._carried = b._grabbed = false;
      if (mode[0] === '_') b[mode] = true; else m[mode] = 1;
      m.anchors[0] = { x: b.px[0], y: b.py[0] };
      softIntentAdhesion(b, h);
      out.releases.push(m.contacts === 0 && m.anchors.every(function(a) { return !a; }) && st.gripForce === 0);
    }
  } finally { tileAt = originalTileAt; }
  out.ordinaryEnabled = softIntentBody({});
  return out;
}

function runFixture(spec) {
  var nativeRandom = Math.random, nativeNow = performance.now, clock = 100000, rng = 314159265;
  Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  performance.now = function() { return clock; };
  var dt = 1 / spec.fps, origin = DECK_CENTER_COL - 18, x = origin * TILE, floor = SKY_ROWS * TILE;
  var traces = [], wrapped = [], firstRejectedPose = null;
  var wall = spec.name === 'wall', ledge = spec.name === 'ledge', dir = spec.name === 'floor-left' ? -1 : 1;
  try {
    if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
    resetJello(); skySlimes.length = 0; skySlimeNext = 1e9; surfaceSlimesSeeded = true;
    SOFT_CONTACT = SOFT_HANDLING = SOFT_TERRAIN = SOFT_MATERIAL = SOFT_INTENT = true; SOFT_PAIRS = spec.pairs; softContactClear();
    Object.keys(keys).forEach(function(key) { keys[key] = false; });
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    Object.assign(player, JSON.parse(JSON.stringify(window.__intentPlayerInitial)));
    gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
    shopState = 'closed'; drilling = null; hitPauseT = 0; siphon.equipped = false;
    player.x = x - 350; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
    player.renderX = player.x; player.renderY = player.y; player.onGround = true;
    player.thrusting = false; player.thrustSpool = 0; player.onJello = false;
    for (var r = 0; r <= SKY_ROWS + 7; r++) for (var c = origin - 15; c <= origin + 15; c++) {
      world[r][c] = r >= SKY_ROWS || ((wall || ledge) && c >= origin + 1 && r >= SKY_ROWS - (wall ? 3 : 1)) ? { type: 'foundation', hp: ORES.foundation.hp } : null;
      invalidateTerrainAround(r, c);
    }
    for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
    var b = surfaceSlimeBuild(x, floor - 32, { id: 96001, seed: 0.46, hue: 133, home: x, r: 24.3 });
    cam.x = x - screenW / 2; cam.y = floor - screenH * 0.65;
    var m = b.surfaceSlime; m.detach = 100;
    for (var settle = 0; settle < 360; settle++) { clock += 1000 / 120; surfaceSlimeTick(1 / 120); updateJello(1 / 120); }
    b.ox.set(b.px); b.oy.set(b.py);
    m.detach = 0; m.state = 'crawl'; m.timer = 100; m.dir = m.goalDir = dir; m.goalX = x + dir * 300;
    if (spec.trace) {
      for (var fn of ['jelloIntegrate', 'softIntentAdhesion', 'softMaterialSolve', 'softContactSkin', 'softTerrainSolve', 'jelloLimitOrientation', 'jelloCollidePointWorld', 'jelloCollideRingEdges', 'jelloInversionHeal', 'jelloPerchHold', 'jelloDrivePostSubstep', 'jelloBodyInternalSubstep', 'jelloUpdateBody', 'jelloStrainLimit', 'jelloRestoreResilienceSnapshot', 'jelloResilienceStepEnd', 'jelloClampWorld', 'jelloClampVelocity']) {
        if (eval('typeof ' + fn) !== 'function') continue;
        (function(name, original) {
          var wrapper = function() {
            var target = arguments[0], was = target && target.ring ? softContactSkinCrossed(target) : false;
            if (name === 'jelloRestoreResilienceSnapshot' && !firstRejectedPose) firstRejectedPose = { frame: frame, reason: arguments[1], debug: target._intentDebug, ring: Array.from(target.ring), ringN: target.ringN, px: Array.from(target.px), py: Array.from(target.py), ox: Array.from(target.ox), oy: Array.from(target.oy), sx: Array.from(target._guardPX), sy: Array.from(target._guardPY), rejected: target._guardRejectedStep, terrain: target._terrainStepHit };
            var result = original.apply(null, arguments);
            if (target && target.ring && !was && softContactSkinCrossed(target))
              traces.push({ fn: name, frame: frame, rejected: target._guardRejectedStep, terrain: target._terrainStepHit, contacts: m.contacts, phase: m.phase });
            if (traces.length > 60) traces.shift();
            return result;
          };
          wrapped.push({ name: name, original: original }); eval(name + ' = wrapper');
        })(fn, eval(fn));
      }
    }
    var startX = b.cx, startY = b.cy;
    var out = { name: spec.name, fps: spec.fps, finite: true, minArea: Infinity, maxArea: 0, minDet: 1,
      maxCrossings: 0, maxOverlaps: 0, embedded: 0, segmentHits: 0, enclosed: 0, peakForce: 0, maxLift: 0, contacts: 0, path: 0, frozenFrames: 0, maxFrozenRun: 0, samples: [] };
    var lastX = b.cx, lastY = b.cy, frozenRun = 0, startRejects = b._guardRejects | 0;
    for (var frame = 0; frame < spec.seconds * spec.fps; frame++) {
      var beforeX = Array.from(b.px), beforeY = Array.from(b.py);
      clock += dt * 1000; surfaceSlimeTick(dt); updateJello(dt);
      var moved = 0;
      for (var node = 0; node < b.n; node++) moved = Math.max(moved, Math.hypot(b.px[node] - beforeX[node], b.py[node] - beforeY[node]));
      var frozen = moved < 1e-8 && m.drive && m.power > 0.1;
      if (frozen) { out.frozenFrames++; frozenRun++; } else frozenRun = 0;
      out.maxFrozenRun = Math.max(out.maxFrozenRun, frozenRun);
      out.path += Math.hypot(b.cx - lastX, b.cy - lastY); lastX = b.cx; lastY = b.cy;
      out.maxLift = Math.max(out.maxLift, startY - b.cy);
      out.contacts += m.contacts > 0 ? 1 : 0;
      out.peakForce = Math.max(out.peakForce, m.intent.peakGripForce);
      var area = 0, crossings = 0, overlaps = 0;
      for (var p = 0; p < b.n; p++) {
        out.finite = out.finite && isFinite(b.px[p] + b.py[p] + b.ox[p] + b.oy[p]);
        if (jelloWorldSolidAt(b.px[p], b.py[p])) {
          var row = Math.floor(b.py[p] / TILE), col = Math.floor(b.px[p] / TILE);
          if (Math.min(b.px[p] - col * TILE, (col + 1) * TILE - b.px[p], b.py[p] - row * TILE, (row + 1) * TILE - b.py[p]) > 0.05) out.embedded++;
        }
      }
      for (var k = 0; k < b.ringN; k++) {
        var a = b.ring[k], z = b.ring[(k + 1) % b.ringN];
        area += (b.px[a] - b.cx) * (b.py[z] - b.cy) - (b.py[a] - b.cy) * (b.px[z] - b.cx);
        for (var j = k + 2; j < b.ringN; j++) {
          if (k === 0 && j === b.ringN - 1) continue;
          var c = b.ring[j], d = b.ring[(j + 1) % b.ringN];
          if (cross(a, z, c) * cross(a, z, d) < -1e-8 && cross(c, d, a) * cross(c, d, z) < -1e-8) crossings++;
          var ux = b.px[z] - b.px[a], uy = b.py[z] - b.py[a], len = Math.hypot(ux, uy);
          if (len > 1e-6 && Math.abs(cross(a, z, c)) < len * 1e-7 && Math.abs(cross(a, z, d)) < len * 1e-7) {
            var tc = ((b.px[c] - b.px[a]) * ux + (b.py[c] - b.py[a]) * uy) / len;
            var td = ((b.px[d] - b.px[a]) * ux + (b.py[d] - b.py[a]) * uy) / len;
            if (Math.min(len, Math.max(tc, td)) - Math.max(0, Math.min(tc, td)) > len * 1e-7) overlaps++;
          }
        }
      }
      var eps = 0.05;
      for (k = 0; k < b.ringN; k++) {
        a = b.ring[k]; z = b.ring[(k + 1) % b.ringN];
        for (row = Math.max(0, Math.floor(Math.min(b.py[a], b.py[z]) / TILE)); row <= Math.floor(Math.max(b.py[a], b.py[z]) / TILE); row++)
          for (col = Math.floor(Math.min(b.px[a], b.px[z]) / TILE); col <= Math.floor(Math.max(b.px[a], b.px[z]) / TILE); col++) {
            if (!tileAt(row, col)) continue;
            var dx = b.px[z] - b.px[a], dy = b.py[z] - b.py[a], low = 0, high = 1;
            var pp = [-dx, dx, -dy, dy], qq = [b.px[a] - col * TILE - eps, (col + 1) * TILE - eps - b.px[a], b.py[a] - row * TILE - eps, (row + 1) * TILE - eps - b.py[a]];
            for (var s = 0; s < 4 && low < high; s++) {
              if (Math.abs(pp[s]) < 1e-10) { if (qq[s] < 0) high = -1; }
              else if (pp[s] < 0) low = Math.max(low, qq[s] / pp[s]); else high = Math.min(high, qq[s] / pp[s]);
            }
            if (low < high - 1e-8) out.segmentHits++;
          }
      }
      for (row = Math.max(0, Math.floor(b.bboxT / TILE)); row <= Math.floor(b.bboxB / TILE); row++)
        for (col = Math.floor(b.bboxL / TILE); col <= Math.floor(b.bboxR / TILE); col++) {
          if (!tileAt(row, col)) continue;
          [[0.5,0.5],[0.01,0.01],[0.99,0.01],[0.01,0.99],[0.99,0.99]].forEach(function(q) { if (jelloPointInRing(b, (col + q[0]) * TILE, (row + q[1]) * TILE)) out.enclosed++; });
        }
      var ratio = Math.abs(area) / (2 * b.restArea);
      out.minArea = Math.min(out.minArea, ratio); out.maxArea = Math.max(out.maxArea, ratio);
      out.maxCrossings = Math.max(out.maxCrossings, crossings); out.maxOverlaps = Math.max(out.maxOverlaps, overlaps);
      if (crossings && !out.firstCross) out.firstCross = { frame: frame, traces: traces.slice(-12), rejected: b._guardRejectedStep, terrain: b._terrainStepHit };
      for (var t = 0; t < b.triN; t++) {
        var ii = t * 4;
        out.minDet = Math.min(out.minDet, cross(b.triA[t], b.triB[t], b.triC[t]) * (b.triDmInv[ii] * b.triDmInv[ii + 3] - b.triDmInv[ii + 1] * b.triDmInv[ii + 2]));
      }
      if (spec.capture && frame % spec.fps === 0) {
        var simulationNow = performance.now;
        try {
          performance.now = nativeNow;
          var preview = document.createElement('canvas'); preview.width = 400; preview.height = 260;
          var liveContext = ctx;
          try {
            ctx = preview.getContext('2d'); ctx.fillStyle = '#303931'; ctx.fillRect(0, 0, 400, 260);
            ctx.setTransform(2, 0, 0, 2, 200 - b.cx * 2, 190 - floor * 2);
            ctx.fillStyle = '#77796b';
            for (var drawRow = Math.max(0, SKY_ROWS - 4); drawRow <= SKY_ROWS + 2; drawRow++)
              for (var drawCol = Math.floor(b.cx / TILE) - 4; drawCol <= Math.floor(b.cx / TILE) + 4; drawCol++)
                if (tileAt(drawRow, drawCol)) ctx.fillRect(drawCol * TILE, drawRow * TILE, TILE, TILE);
            jelloDrawBody(b);
          } finally { ctx = liveContext; }
          if (!out.images) out.images = [];
          out.images.push({ t: frame * dt, png: preview.toDataURL('image/png') });
        } finally { performance.now = simulationNow; }
      }
      if (frame % spec.fps === 0) out.samples.push({ t: frame * dt, x: b.cx - startX, y: b.cy - startY, climb: m.climb, state: m.state, supported: m.intent.supported, contacts: m.contacts, effort: m.power });
    }
    out.traces = traces; out.firstRejectedPose = firstRejectedPose; out.guardRejects = (b._guardRejects | 0) - startRejects; out.maxFrozenSeconds = out.maxFrozenRun / spec.fps;
    out.progress = (b.cx - startX) * dir; out.vertical = b.cy - startY; out.slips = m.intent.slips;
    return out;
    function cross(a, c, d) { return (b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) - (b.py[c] - b.py[a]) * (b.px[d] - b.px[a]); }
  } finally { for (var entry of wrapped) { var original = entry.original; eval(entry.name + ' = original'); } Math.random = nativeRandom; performance.now = nativeNow; }
}

function skinLawFixture() {
  var out = { cases: 0, energyGain: 0, momentumError: 0, torqueError: 0, cap: 0, fixedAxisChange: 0, normalClosure: 0 };
  var random = 77291;
  function rand() { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; }
  for (var mask = 1; mask < 64; mask++) for (var trial = 0; trial < 32; trial++) {
    var angle = rand() * Math.PI * 2, nx = Math.cos(angle), ny = Math.sin(angle), t = rand();
    var weights = [1, -(1 - t), -t], mx = [], my = [], den = 0, gradient = 0;
    for (var i = 0; i < 3; i++) {
      mx[i] = (mask >> (i * 2)) & 1; my[i] = (mask >> (i * 2 + 1)) & 1;
      den += weights[i] * weights[i] * (nx * nx * mx[i] + ny * ny * my[i]);
      gradient = Math.max(gradient, Math.abs(weights[i]) * Math.hypot(nx * mx[i], ny * my[i]));
    }
    if (den < 1e-8) continue;
    var depth = 0.01 + rand() * 8, length = 4 + rand() * 20;
    var b = { px: new Float64Array(3), py: new Float64Array(3), ox: new Float64Array(3), oy: new Float64Array(3) };
    b.px[1] = 100; b.py[1] = 200; b.px[2] = 100 - ny * length; b.py[2] = 200 + nx * length;
    b.px[0] = b.px[1] * (1 - t) + b.px[2] * t - nx * depth;
    b.py[0] = b.py[1] * (1 - t) + b.py[2] * t - ny * depth;
    var beforeX = Array.from(b.px), beforeY = Array.from(b.py), vx = [], vy = [], beforeEnergy = 0, beforePX = 0, beforePY = 0;
    for (i = 0; i < 3; i++) {
      vx[i] = (rand() - 0.5) * 4 * mx[i]; vy[i] = (rand() - 0.5) * 4 * my[i];
      b.ox[i] = b.px[i] - vx[i]; b.oy[i] = b.py[i] - vy[i];
      vx[i] = b.px[i] - b.ox[i]; vy[i] = b.py[i] - b.oy[i];
      beforeEnergy += vx[i] * vx[i] + vy[i] * vy[i]; beforePX += vx[i]; beforePY += vy[i];
    }
    softIntentSkinApply(b, { p: 0, a: 1, c: 2, nx: nx, ny: ny, t: t, mx: mx, my: my, den: den, gradient: gradient, depth: depth });
    var energy = 0, momentumX = 0, momentumY = 0, torque = 0, normal = 0;
    for (i = 0; i < 3; i++) {
      var ux = b.px[i] - b.ox[i], uy = b.py[i] - b.oy[i];
      energy += ux * ux + uy * uy; momentumX += ux; momentumY += uy;
      torque += b.px[i] * (uy - vy[i]) - b.py[i] * (ux - vx[i]);
      normal += weights[i] * (ux * nx + uy * ny);
      out.cap = Math.max(out.cap, Math.hypot(b.px[i] - beforeX[i], b.py[i] - beforeY[i]));
      if (!mx[i]) out.fixedAxisChange = Math.max(out.fixedAxisChange, Math.abs(b.px[i] - beforeX[i]), Math.abs(ux - vx[i]));
      if (!my[i]) out.fixedAxisChange = Math.max(out.fixedAxisChange, Math.abs(b.py[i] - beforeY[i]), Math.abs(uy - vy[i]));
    }
    out.energyGain = Math.max(out.energyGain, energy - beforeEnergy);
    out.normalClosure = Math.max(out.normalClosure, -normal);
    if (mask === 63) {
      out.momentumError = Math.max(out.momentumError, Math.hypot(momentumX - beforePX, momentumY - beforePY));
      out.torqueError = Math.max(out.torqueError, Math.abs(torque));
    }
    out.cases++;
  }
  var originalSolid = jelloWorldSolidAt, geometryFailures = 0;
  try {
    jelloWorldSolidAt = function() { return false; };
    for (var shape = 0; shape < 256; shape++) {
      var rotation = rand() * Math.PI * 2, ca = Math.cos(rotation), sa = Math.sin(rotation), stretch = 0.5 + rand() * 2;
      var points = [[0, 1.01 + rand()], [4,-1], [4,1], [-4,1]], previous = [[-4,-1],[4,-1],[4,1],[-4,1]];
      var body = { surfaceSlime: {}, n: 4, ring: [0,1,2,3], ringN: 4,
        px: new Float64Array(4), py: new Float64Array(4), ox: new Float64Array(4), oy: new Float64Array(4),
        _softPX: new Float64Array(4), _softPY: new Float64Array(4) };
      for (var vertex = 0; vertex < 4; vertex++) {
        var pos = points[vertex], old = previous[vertex];
        body.px[vertex] = 50 + stretch * (ca * pos[0] - sa * pos[1]);
        body.py[vertex] = 60 + stretch * (sa * pos[0] + ca * pos[1]);
        body._softPX[vertex] = 50 + stretch * (ca * old[0] - sa * old[1]);
        body._softPY[vertex] = 60 + stretch * (sa * old[0] + ca * old[1]);
        body.ox[vertex] = body.px[vertex]; body.oy[vertex] = body.py[vertex];
      }
      for (var solve = 0; solve < 16 && softContactSkinCrossed(body); solve++) softIntentSkinContact(body);
      if (softContactSkinCrossed(body)) geometryFailures++;
    }
  } finally { jelloWorldSolidAt = originalSolid; }
  out.geometryCases = 256; out.geometryFailures = geometryFailures;
  var collinear = { surfaceSlime: {}, ring: [0,1,2,3], ringN: 4,
    px: [3,0,1,-2], py: [0,0,0,0] };
  var wasIntent = SOFT_INTENT;
  SOFT_INTENT = false; out.priorTouchClear = !softContactSkinCrossed(collinear);
  SOFT_INTENT = true; out.policyChangeFindsOverlap = softContactSkinCrossed(collinear);
  SOFT_INTENT = wasIntent;
  return out;
}
