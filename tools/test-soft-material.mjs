// Diagnostic A/B material-response comparison. Uses a private Chrome for Testing child.
// node tools/test-soft-material.mjs
// BASELINE_ONLY=1 FPS=60 CASES=low-drop,high-drop DUMP=/tmp/my-run
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
const port = Number(process.env.PORT || 8267), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-material';
const cpu = process.env.CPU === '1';
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
const baselineOnly = process.env.BASELINE_ONLY === '1';
const skipUI = baselineOnly || process.env.SKIP_UI === '1';
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const selected = (process.env.CASES || 'low-drop,high-drop,offcenter-pull,wall-pressure,ledge-pull,active-movement').split(',');
assert.ok(rates.every(fps => fps >= 20 && fps <= 240), 'FPS is between 20 and 240');
assert.ok(selected.every(name => /^(low-drop|high-drop|offcenter-pull|wall-pressure|ledge-pull|active-movement)$/.test(name)), 'known CASES');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
assert.ok(bundle.includes('SOFT_MATERIAL'), 'build material experiment first');
const servedBundle = bundle.slice(0, end) + '\nwindow.__materialTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-material-browser-');
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
const game = source => evaluate(`__materialTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __materialTest === 'function'")) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1&softterrain=1&softmaterial=1${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__materialPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  for (const fps of rates) for (const name of selected) for (const experimental of baselineOnly ? [false] : [false, true]) {
    stage = `${name}/${fps}/${experimental ? 'material' : 'prior'}`;
    console.log('START ' + stage);
    const result = await game(`(${runFixture.toString()})(${JSON.stringify({ fps, name, experimental, capture: fps === 60 || process.env.CAPTURE === '1' })})`);
    if (result.strip) {
      result.stripFile = `${name}-${fps}-${result.mode}.png`;
      fs.writeFileSync(path.join(dump, result.stripFile), Buffer.from(result.strip.split(',')[1], 'base64'));
    }
    delete result.strip; results.push(result);
    const { initial, samples, ...summary } = result;
    console.log('CASE ' + JSON.stringify(summary));
    writeReport();
  }
  for (let i = 0; i + 1 < results.length && !baselineOnly; i += 2)
    check(`${results[i].name}/${results[i].fps} starts from identical nodes and histories`, JSON.stringify(results[i].initial) === JSON.stringify(results[i + 1].initial));
  check('contact, handling and terrain remain fixed on for both materials', results.every(r => r.contact && r.handling && r.terrain));
  check('all bodies stay finite and present', results.every(r => r.finite && r.alive));
  check('release changes no positions, histories, or recovery timer', results.every(r => !r.release || r.release.unchanged && r.release.cleared && r.release.recovery === 0));
  const experimental = results.filter(r => r.mode === 'material');
  if (!baselineOnly) {
    check('new material keeps uncrossed skin and non-inverted health triangles', experimental.every(r => r.maxCrossings === 0 && r.minDet >= -1e-6));
    check('new material remains outside terrain', experimental.every(r => r.embeddedFrames === 0 && r.segmentHits === 0 && r.enclosedProbes === 0));
    check('new material keeps sensible area and bounded motion', experimental.every(r => r.minArea > 0.40 && r.maxArea < 1.8 && r.maxNodeJump < 100));
  }
  stage = 'isolated damping invariants';
  const damping = await game(`(${dampingFixture.toString()})()`);
  check('damping preserves bulk momentum and angular momentum', damping.cases.every(r => r.momentumError < 1e-6 && r.angularError < 1e-6));
  check('damping leaves rigid translation and rotation unchanged', damping.cases.filter(r => r.name !== 'deformation').every(r => r.maxVelocityChange < 1e-8));
  check('damping reduces deformation energy and moves no positions', damping.cases.every(r => r.samePositions && r.after.energy <= r.before.energy + 1e-7) && damping.cases.find(r => r.name === 'deformation').after.energy < damping.cases.find(r => r.name === 'deformation').before.energy);
  check('ordinary non-resident body is outside material experiment', !damping.ordinaryEnabled);
  const law = await game(`(${materialLawFixture.toString()})()`);
  check('volume projection creates no net force or torque', law.centerError < 1e-8 && law.torqueError < 1e-7);
  check('identical material strain uses the same law across held, released and active states', law.stateIdentical);
  const areaContact = await game(`(${areaContactFixture.toString()})()`);
  check('area contact removes inward strain without energy increase or position changes', areaContact.before.rate < 0 && Math.abs(areaContact.after.rate) < 1e-8 && areaContact.after.energy <= areaContact.before.energy + 1e-8 && areaContact.samePositions);
  check('unmasked area-contact impulse preserves linear and angular momentum', areaContact.momentumError < 1e-7 && areaContact.angularError < 1e-7);
  if (!skipUI) await runUI();
  check('no browser exceptions', browserErrors.length === 0);
  writeReport({ damping, law, areaContact, ui, defaults });
  console.log(`Wrote ${results.length} material cases to ${path.join(dump, 'report.json')}`);
  assert.equal(failures.length, 0, failures.join('\n'));
} catch (error) {
  fs.writeFileSync(path.join(dump, 'interrupted.json'), JSON.stringify({ stage, error: String(error), bundleHash, cpu, boots, results, browserErrors }, null, 2));
  throw error;
} finally { cleanup(); }

function writeReport(extra = {}) {
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, cpu, boots, results, browserErrors, failures,
    notes: ['These are safety and continuity checks; the metrics do not establish satisfying feel.',
      'Only SOFT_MATERIAL changes between matched cases. Contact, handling and terrain stay on.',
      'Passive cases use the existing detach state to suppress locomotion intent; rest-length changes are measured because the existing resting muscle wave can remain active. Active movement runs the resident brain unchanged.',
      'CPU mode advances the actual loading renderer without overriding any readiness gates; captures use the real game canvas.',
      'Pair damping invariants are measured on the actual resident body, with no contacts, gravity or other solver work.'], ...extra }, null, 2));
}

function runFixture(spec) {
  var nativeRandom = Math.random, nativeNow = performance.now, clock = 100000, rng = 314159265;
  Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  performance.now = function() { return clock; };
  var b, dt = 1 / spec.fps, origin = DECK_CENTER_COL - 18, x = origin * TILE, floor = SKY_ROWS * TILE;
  var active = spec.name === 'active-movement', drop = /drop$/.test(spec.name), held = !active && !drop;
  var wall = spec.name === 'wall-pressure', ledge = spec.name === 'ledge-pull', frames = [];
  try {
    if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
    resetJello(); skySlimes.length = 0; skySlimeNext = 1e9; surfaceSlimesSeeded = true;
    SOFT_CONTACT = SOFT_HANDLING = SOFT_TERRAIN = true; SOFT_MATERIAL = false; softContactClear();
    Object.keys(keys).forEach(function(key) { keys[key] = false; });
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    Object.assign(player, JSON.parse(JSON.stringify(window.__materialPlayerInitial)));
    gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
    shopState = 'closed'; drilling = null; hitPauseT = 0; siphon.equipped = false;
    player.x = x - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
    player.renderX = player.x; player.renderY = player.y; player.onGround = true;
    player.thrusting = false; player.thrustSpool = 0; player.onJello = false;
    for (var r = 0; r <= SKY_ROWS + 7; r++) for (var c = origin - 15; c <= origin + 15; c++) {
      world[r][c] = r >= SKY_ROWS || (c === origin + 2 && (wall || ledge && r === SKY_ROWS - 1)) ? { type: 'foundation', hp: ORES.foundation.hp } : null;
      invalidateTerrainAround(r, c);
    }
    for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
    b = surfaceSlimeBuild(x, floor - 36, { id: 95001, seed: 0.46, hue: 133, home: x, r: 24.3 });
    cam.x = x - screenW / 2; cam.y = floor - screenH * 0.65;
    for (var settle = 0; settle < 240; settle++) { clock += 1000 / 120; updateJello(1 / 120); }
    if (drop) {
      var lift = spec.name === 'high-drop' ? 180 : 55;
      for (var p = 0; p < b.n; p++) { b.py[p] -= lift; b.oy[p] -= lift; }
      jelloUpdateBody(b, jelloStepH || JELLO_H); surfaceSlimeSnapshot(b);
    }
    if (!active) surfaceSlimeDetach(b, 20);
    SOFT_MATERIAL = spec.experimental;
    var gripX = b.cx + (spec.name === 'offcenter-pull' ? 12 : 0), gripY = b.cy;
    var out = { name: spec.name, fps: spec.fps, mode: spec.experimental ? 'material' : 'prior',
      contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, initial: pose(),
      finite: true, alive: true, firstFloorContact: null, minArea: Infinity, maxArea: 0, minHeight: Infinity, maxWidth: 0,
      maxCrossings: 0, minDet: 1, embeddedFrames: 0, segmentHits: 0, enclosedProbes: 0,
      maxNodeJump: 0, peakEnergy: 0, tailEnergy: 0, tailInternalEnergy: 0, tailActualEnergy: 0, tailCount: 0, motorFrames: 0, maxRestChange: 0, firstViolation: null, samples: [] };
    if (held && !surfaceSlimeGrabStart(gripX, gripY, 'fixture')) throw new Error('failed to grab material');
    var restWidth = Math.max.apply(null, b.rx) - Math.min.apply(null, b.rx), restHeight = Math.max.apply(null, b.ry) - Math.min.apply(null, b.ry);
    var releaseFrame = Math.round(1.8 * spec.fps), total = Math.round((active ? 6 : 4.5) * spec.fps);
    var previousX = Array.from(b.px), previousY = Array.from(b.py), startX = b.cx, initialRest = Array.from(b.sRest);
    var captureTimes = [0, 0.25, 0.6, 1.2, 1.8, 2.2, 4.2].map(function(t) { return Math.round(t * spec.fps); });
    for (var frame = 0; frame <= total; frame++) {
      var t = frame * dt;
      if (held && frame === releaseFrame) {
        var before = pose(); surfaceSlimeGrabEnd('fixture', false);
        out.release = { unchanged: JSON.stringify(before) === JSON.stringify(pose()), cleared: !surfaceSlimeGrip && !b._grabbed, recovery: b._recoverT || 0 };
      }
      if (spec.capture && captureTimes.indexOf(frame) >= 0) capture(t);
      if (frame === total) break;
      if (held && frame < releaseFrame) {
        var ramp = Math.min(1, (t + dt) / 0.9), dx = ramp * (wall ? 95 : ledge ? 100 : 50);
        var dy = wall ? -35 * Math.sin(Math.min(1, t / 1.6) * Math.PI) : ledge ? -55 * Math.min(1, t / 0.45) + 35 * Math.max(0, Math.min(1, (t - 0.9) / 0.6)) : -90 * ramp;
        surfaceSlimeGrabMove(gripX + dx, gripY + dy, 'fixture');
      }
      clock += dt * 1000; update(dt); surfaceSlimeTick(dt); updateJello(dt);
      var h = health(), m = motion(), jump = 0;
      for (p = 0; p < b.n; p++) jump = Math.max(jump, Math.hypot(b.px[p] - previousX[p], b.py[p] - previousY[p]));
      if (out.firstFloorContact === null && b.bboxB >= floor - 0.2) out.firstFloorContact = t + dt;
      out.finite = out.finite && h.finite; out.alive = out.alive && jelloBodies.indexOf(b) >= 0;
      out.minArea = Math.min(out.minArea, h.area); out.maxArea = Math.max(out.maxArea, h.area);
      out.minHeight = Math.min(out.minHeight, b.bboxB - b.bboxT); out.maxWidth = Math.max(out.maxWidth, b.bboxR - b.bboxL);
      out.maxCrossings = Math.max(out.maxCrossings, h.crossings); out.minDet = Math.min(out.minDet, h.minDet);
      out.embeddedFrames += h.embedded; out.segmentHits += h.segmentHits; out.enclosedProbes += h.enclosed;
      out.maxNodeJump = Math.max(out.maxNodeJump, jump); out.peakEnergy = Math.max(out.peakEnergy, m.energy);
      if (t > (active ? 5 : 3.5)) { out.tailEnergy += m.energy; out.tailInternalEnergy += m.internalEnergy; out.tailActualEnergy += m.actualEnergy; out.tailCount++; }
      if (b.surfaceSlime.drive) out.motorFrames++;
      for (var si = 0; si < b.springN; si++) out.maxRestChange = Math.max(out.maxRestChange, Math.abs(b.sRest[si] - initialRest[si]));
      if (!out.firstViolation && (!h.finite || h.crossings || h.minDet < -1e-6 || h.embedded || h.segmentHits || h.enclosed)) out.firstViolation = { t: t, health: h };
      if (frame % Math.max(1, Math.round(spec.fps / 20)) === 0) out.samples.push({ t: t + dt, cx: b.cx, cy: b.cy,
        width: b.bboxR - b.bboxL, height: b.bboxB - b.bboxT, health: h, motion: m, motor: !!b.surfaceSlime.drive });
      previousX = Array.from(b.px); previousY = Array.from(b.py);
    }
    out.travel = b.cx - startX; out.tailEnergy /= Math.max(1, out.tailCount); out.tailInternalEnergy /= Math.max(1, out.tailCount); out.tailActualEnergy /= Math.max(1, out.tailCount);
    out.compressionRatio = out.minHeight / restHeight; out.spreadRatio = out.maxWidth / restWidth;
    var tailSamples = out.samples.filter(function(s) { return s.t > (active ? 5 : 3.5); });
    out.settling = { tailHeightRange: Math.max.apply(null, tailSamples.map(function(s) { return s.height; })) - Math.min.apply(null, tailSamples.map(function(s) { return s.height; })),
      tailWidthRange: Math.max.apply(null, tailSamples.map(function(s) { return s.width; })) - Math.min.apply(null, tailSamples.map(function(s) { return s.width; })) };
    out.guardRejects = b._guardRejects || 0; out.final = { health: health(), motion: m };
    if (frames.length) {
      var strip = document.createElement('canvas'); strip.width = 320 * frames.length; strip.height = 284;
      var draw = strip.getContext('2d'); draw.fillStyle = '#303931'; draw.fillRect(0, 0, strip.width, strip.height);
      draw.fillStyle = '#f0eee5'; draw.font = '12px monospace';
      frames.forEach(function(f, i) { draw.drawImage(f.image, i * 320, 24); draw.fillText(out.mode + ' ' + f.t.toFixed(2) + 's', i * 320 + 6, 17); });
      out.strip = strip.toDataURL('image/png');
    }
    return out;
  } finally { if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true); Math.random = nativeRandom; performance.now = nativeNow; }
  function pose() { return [Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)]; }
  function motion() {
    var scale = JELLO_TIMESCALE / (b._stepH || jelloStepH || JELLO_H), vx = 0, vy = 0, energy = 0, angular = 0, inertia = 0;
    var actualVX = 0, actualVY = 0, actualEnergy = 0;
    for (var i = 0; i < b.n; i++) {
      var ux = (b.px[i] - b.ox[i]) * scale, uy = (b.py[i] - b.oy[i]) * scale;
      var dx = b.px[i] - b.cx, dy = b.py[i] - b.cy;
      vx += ux; vy += uy; energy += (ux * ux + uy * uy) / 2;
      angular += dx * uy - dy * ux; inertia += dx * dx + dy * dy;
      if (previousX) {
        var ax = (b.px[i] - previousX[i]) / dt, ay = (b.py[i] - previousY[i]) / dt;
        actualVX += ax; actualVY += ay; actualEnergy += (ax * ax + ay * ay) / 2;
      }
    }
    vx /= b.n; vy /= b.n; energy /= b.n;
    return { vx: vx, vy: vy, energy: energy, spin: angular / Math.max(1e-9, inertia),
      internalEnergy: Math.max(0, energy - (vx * vx + vy * vy) / 2 - angular * angular / Math.max(1e-9, 2 * inertia * b.n)),
      actualVX: actualVX / b.n, actualVY: actualVY / b.n, actualEnergy: actualEnergy / b.n };
  }
  function cross(a, c, d) { return (b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) - (b.py[c] - b.py[a]) * (b.px[d] - b.px[a]); }
  function health() {
    var out = { finite: true, area: 0, embedded: 0, segmentHits: 0, enclosed: 0, crossings: 0, minDet: 1 }, eps = 0.05;
    for (var p = 0; p < b.n; p++) {
      out.finite = out.finite && isFinite(b.px[p] + b.py[p] + b.ox[p] + b.oy[p]);
      if (jelloWorldSolidAt(b.px[p], b.py[p])) {
        var col = Math.floor(b.px[p] / TILE), row = Math.floor(b.py[p] / TILE);
        if (Math.min(b.px[p] - col * TILE, (col + 1) * TILE - b.px[p], b.py[p] - row * TILE, (row + 1) * TILE - b.py[p]) > eps) out.embedded++;
      }
    }
    for (var k = 0; k < b.ringN; k++) {
      var a = b.ring[k], z = b.ring[(k + 1) % b.ringN];
      out.area += (b.px[a] - b.cx) * (b.py[z] - b.cy) - (b.px[z] - b.cx) * (b.py[a] - b.cy);
      for (var j = k + 2; j < b.ringN; j++) {
        if (k === 0 && j === b.ringN - 1) continue;
        var c = b.ring[j], d = b.ring[(j + 1) % b.ringN];
        if (cross(a, z, c) * cross(a, z, d) < -1e-8 && cross(c, d, a) * cross(c, d, z) < -1e-8) out.crossings++;
      }
      for (var row = Math.max(0, Math.floor(Math.min(b.py[a], b.py[z]) / TILE)); row <= Math.floor(Math.max(b.py[a], b.py[z]) / TILE); row++)
        for (var col = Math.floor(Math.min(b.px[a], b.px[z]) / TILE); col <= Math.floor(Math.max(b.px[a], b.px[z]) / TILE); col++) {
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
    out.area = Math.abs(out.area) / (2 * b.restArea);
    for (row = Math.max(0, Math.floor(b.bboxT / TILE)); row <= Math.floor(b.bboxB / TILE); row++)
      for (col = Math.floor(b.bboxL / TILE); col <= Math.floor(b.bboxR / TILE); col++) {
        if (!tileAt(row, col)) continue;
        [[0.5,0.5],[0.01,0.01],[0.99,0.01],[0.01,0.99],[0.99,0.99]].forEach(function(q) { if (jelloPointInRing(b, (col + q[0]) * TILE, (row + q[1]) * TILE)) out.enclosed++; });
      }
    for (var t = 0; t < b.triN; t++) {
      var ii = t * 4, det = cross(b.triA[t], b.triB[t], b.triC[t]) * (b.triDmInv[ii] * b.triDmInv[ii + 3] - b.triDmInv[ii + 1] * b.triDmInv[ii + 2]);
      out.minDet = Math.min(out.minDet, det);
    }
    return out;
  }
  function capture(t) {
    render(); var image = document.createElement('canvas'); image.width = 320; image.height = 260;
    var scale = worldScale * dpr;
    image.getContext('2d').drawImage(canvas, (x - 70 - cam.x) * scale, (floor - 240 - cam.y) * scale, 260 * scale, 260 * scale, 0, 0, 320, 260);
    frames.push({ image: image, t: t });
  }
}

function dampingFixture() {
  if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
  resetJello(); SOFT_MATERIAL = true;
  var b = surfaceSlimeBuild((DECK_CENTER_COL - 18) * TILE, 300, { id: 95002, seed: 0.46, r: 24.3 });
  var cases = [], h = 1 / 180;
  for (var name of ['translation', 'rotation', 'deformation']) {
    for (var i = 0; i < b.n; i++) {
      var x = b.px[i] - b.cx, y = b.py[i] - b.cy;
      var vx = name === 'translation' ? 2 : -y * 0.07 + 0.4, vy = name === 'translation' ? -3 : x * 0.07 - 0.2;
      if (name === 'deformation') { vx += x * 0.1; vy -= y * 0.12; }
      b.ox[i] = b.px[i] - vx; b.oy[i] = b.py[i] - vy;
    }
    var before = metric(), pose = JSON.stringify([Array.from(b.px), Array.from(b.py)]), old = [Array.from(b.ox), Array.from(b.oy)];
    softMaterialDamp(b, h);
    var after = metric(), change = 0;
    for (i = 0; i < b.n; i++) change = Math.max(change, Math.hypot(b.ox[i] - old[0][i], b.oy[i] - old[1][i]));
    cases.push({ name: name, before: before, after: after, maxVelocityChange: change,
      momentumError: Math.hypot(after.px - before.px, after.py - before.py), angularError: Math.abs(after.angular - before.angular),
      samePositions: pose === JSON.stringify([Array.from(b.px), Array.from(b.py)]) });
  }
  var ordinary = jelloBuildDisc((DECK_CENTER_COL - 18) * TILE, 200, 24, 'slime');
  return { cases: cases, ordinaryEnabled: softMaterialBody(ordinary) };
  function metric() {
    var px = 0, py = 0, angular = 0, energy = 0;
    for (var i = 0; i < b.n; i++) {
      var vx = b.px[i] - b.ox[i], vy = b.py[i] - b.oy[i]; px += vx; py += vy;
      angular += (b.px[i] - b.cx) * vy - (b.py[i] - b.cy) * vx; energy += (vx * vx + vy * vy) / 2;
    }
    return { px: px, py: py, angular: angular, energy: energy };
  }
}

async function runUI() {
  stage = 'UI navigation';
  // Fresh navigation verifies the opt-in page and real mouse/touch event routing.
  // Persistence must be disabled by softplay itself, without a nosave parameter.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softplay=1&softmaterial=1&nopause=1&tod=0.35${extraParams}` });
  assert.ok(await awaitBoot(true), 'playtest page completes its real loading gates');
  await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0;');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  ui = await game(`(function() {
    var panel = document.getElementById('soft-contact-playtest');
    return { found: !!panel, savesDisabled: SAVE_DISABLED, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL,
      buttons: panel ? Array.from(panel.querySelectorAll('button')).map(function(b) { return b.textContent; }) : [],
      options: panel ? Array.from(panel.querySelector('select').options).map(function(o) { return o.value; }) : [] };
  })()`);
  ui.interactions = [];
  check('material opt-in page has both modes and all three arenas with saves off', ui.found && ui.savesDisabled && ui.contact && ui.handling && ui.terrain && ui.material &&
    ui.buttons.includes('New material') && ui.buttons.includes('Prior material') &&
    ['free', 'drop', 'ledge'].every(value => ui.options.includes(value)));
  await game(`window.__materialUICheck = function(before) {
    var b = window.__materialUIBody, values = [Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)];
    if (before) { window.__materialUIBefore = values; window.__materialUIRefs = [b.px, b.py, b.ox, b.oy]; return true; }
    var error = 0;
    for (var a = 0; a < 4; a++) for (var p = 0; p < b.n; p++) error = Math.max(error, Math.abs(values[a][p] - window.__materialUIBefore[a][p]));
    return { released: !surfaceSlimeGrip && !b._grabbed, arrayChange: error,
      sameArrays: window.__materialUIRefs[0] === b.px && window.__materialUIRefs[1] === b.py &&
        window.__materialUIRefs[2] === b.ox && window.__materialUIRefs[3] === b.oy,
      recoverTime: b._recoverT || 0, contact: SOFT_CONTACT, handling: SOFT_HANDLING };
  };`);
  for (const input of ['mouse', 'touch']) {
    const mobile = input === 'touch';
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await evaluate("window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
    await sleep(100);
    for (const experimental of [false, true]) for (const arena of ['free', 'drop', 'ledge']) {
      stage = `UI/${input}/${arena}/${experimental ? 'material' : 'prior'}`;
      const prepared = await game(`(function() {
        var panel = document.getElementById('soft-contact-playtest');
        var label = ${JSON.stringify(experimental ? 'New material' : 'Prior material')};
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
        b = bodies[0]; window.__materialUIBody = b;
        // Keep a fixed view during drag, as the deterministic harness does.
        cam.x = b.cx - screenW * 0.48; cam.y = b.cy - screenH * 0.57;
        render(); var rect = canvas.getBoundingClientRect();
        return { x: rect.left + (b.cx - cam.x) * worldScale,
          y: rect.top + (b.cy - cam.y) * worldScale, scale: worldScale, startY: b.cy,
          modeMatches: SOFT_MATERIAL === ${experimental} && SOFT_CONTACT && SOFT_HANDLING && SOFT_TERRAIN,
          pressed: button.getAttribute('aria-pressed') === 'true', count: bodies.length,
          repeatAvailable: !!repeat, repeatPoseMatches: repeatPoseMatches,
          repeatRestoresTile: repeatRestoresTile, repeatClearsInput: repeatClearsInput };
      })()`);
      const cancel = mobile || arena === 'ledge';
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: prepared.x, y: prepared.y }] });
      else await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const grabbed = await game('!!surfaceSlimeGrip && surfaceSlimeGrip.body === window.__materialUIBody');
      if (grabbed) for (let frame = 1; frame <= 18; frame++) {
        const px = prepared.x + prepared.scale * 30 * frame / 18;
        const py = prepared.y - prepared.scale * 65 * frame / 18;
        if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: px, y: py }] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'left', buttons: 1 });
        await game('update(1/60); surfaceSlimeTick(1/60); updateJello(1/60);');
      }
      const lifted = await game(`(function() { for (var i = 0; i < 18; i++) { update(1/60); surfaceSlimeTick(1/60); updateJello(1/60); } render(); return ${prepared.startY} - window.__materialUIBody.cy; })()`);
      await game('__materialUICheck(true)');
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else if (cancel) await evaluate("window.dispatchEvent(new Event('blur'))");
      else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x + prepared.scale * 30,
        y: prepared.y - prepared.scale * 65, button: 'left', clickCount: 1 });
      const release = await game('__materialUICheck(false)');
      // Clear browser mouse bookkeeping after blur without changing the case result.
      if (!mobile && cancel) await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const report = { input, mode: experimental ? 'material' : 'prior', arena, cancel,
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
    ui.interactions.every(r => r.modeMatches && r.pressed && r.grabbed && r.count === 1));
  check('Repeat restores each arena pose, terrain and input state in both modes', ui.interactions.every(r =>
    r.repeatAvailable && r.repeatPoseMatches && r.repeatRestoresTile && r.repeatClearsInput));
  check('real pointer motion lifts the material and every input path releases', ui.interactions.every(r => r.lifted > 10 && r.release.released));
  check('real new-material release and cancellation preserve node arrays without recovery', ui.interactions.filter(r => r.mode === 'material').every(r =>
    r.release.sameArrays && r.release.arrayChange === 0 && r.release.recoverTime === 0));
  check('390 by 844 material controls fit and remain reachable', ui.mobile.fits &&
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

function materialLawFixture() {
  resetJello(); SOFT_MATERIAL = true;
  var b = surfaceSlimeBuild((DECK_CENTER_COL - 18) * TILE, 300, { id: 95004, seed: 0.46, r: 24.3 });
  for (var p = 0; p < b.n; p++) {
    var x = b.px[p] - b.cx, y = b.py[p] - b.cy;
    b.px[p] = b.ox[p] = b.cx + x * (0.8 + 0.04 * Math.sin(p));
    b.py[p] = b.oy[p] = b.cy + y * (0.72 + 0.025 * Math.cos(p * 2));
  }
  var startX = Array.from(b.px), startY = Array.from(b.py), h = 1 / 180;
  jelloResetLambdas(b); softMaterialVolume(b, h);
  var dx = 0, dy = 0, torque = 0;
  for (p = 0; p < b.n; p++) {
    var ux = b.px[p] - startX[p], uy = b.py[p] - startY[p];
    dx += ux; dy += uy; torque += (startX[p] - b.cx) * uy - (startY[p] - b.cy) * ux;
  }
  var states = [];
  for (var mode = 0; mode < 3; mode++) {
    b.px.set(startX); b.py.set(startY); b.ox.set(startX); b.oy.set(startY);
    b._grabbed = mode === 0; b._recoverT = mode === 1 ? 1.2 : 0;
    b.surfaceSlime.drive = mode === 2; b.surfaceSlime.motorBlend = mode === 2 ? 1 : 0;
    softMaterialSolve(b, h); softMaterialDamp(b, h);
    states.push(JSON.stringify([Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)]));
  }
  return { centerError: Math.hypot(dx, dy), torqueError: Math.abs(torque), stateIdentical: states.every(function(s) { return s === states[0]; }) };
}

function areaContactFixture() {
  resetJello(); SOFT_MATERIAL = true;
  var b = surfaceSlimeBuild((DECK_CENTER_COL - 18) * TILE, 100, { id: 95005, seed: 0.46, r: 24.3 });
  var nodes = [b.triA[0], b.triB[0], b.triC[0]], inverse = b.triDmInv[0] * b.triDmInv[3] - b.triDmInv[1] * b.triDmInv[2];
  var gx = [], gy = [];
  for (var k = 0; k < 3; k++) {
    var c = nodes[(k + 1) % 3], d = nodes[(k + 2) % 3];
    gx[k] = (b.py[c] - b.py[d]) * inverse; gy[k] = (b.px[d] - b.px[c]) * inverse;
    var p = nodes[k];
    if (jelloWorldSolidAt(b.px[p] + Math.sign(gx[k]) * 0.7, b.py[p]) || jelloWorldSolidAt(b.px[p], b.py[p] + Math.sign(gy[k]) * 0.7)) throw new Error('area contact invariant requires unmasked free air');
  }
  for (var p = 0; p < b.n; p++) {
    b.ox[p] = b.px[p] - 0.3 + (b.py[p] - b.cy) * 0.01;
    b.oy[p] = b.py[p] + 0.2 - (b.px[p] - b.cx) * 0.01;
  }
  for (k = 0; k < 3; k++) { b.ox[nodes[k]] += gx[k] * 2; b.oy[nodes[k]] += gy[k] * 2; }
  var before = metric(), pose = JSON.stringify([Array.from(b.px), Array.from(b.py)]);
  softMaterialAreaContact(b, nodes[0], nodes[1], nodes[2], inverse);
  var after = metric();
  return { before: before, after: after, momentumError: Math.hypot(before.px - after.px, before.py - after.py), angularError: Math.abs(before.angular - after.angular), samePositions: pose === JSON.stringify([Array.from(b.px), Array.from(b.py)]) };
  function metric() {
    var px = 0, py = 0, angular = 0, energy = 0, rate = 0;
    for (var i = 0; i < b.n; i++) {
      var vx = b.px[i] - b.ox[i], vy = b.py[i] - b.oy[i];
      px += vx; py += vy; energy += (vx * vx + vy * vy) / 2;
      angular += (b.px[i] - b.cx) * vy - (b.py[i] - b.cy) * vx;
    }
    for (var k = 0; k < 3; k++) rate += gx[k] * (b.px[nodes[k]] - b.ox[nodes[k]]) + gy[k] * (b.py[nodes[k]] - b.oy[nodes[k]]);
    return { px: px, py: py, angular: angular, energy: energy, rate: rate };
  }
}
