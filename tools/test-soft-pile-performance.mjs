// Repeatable real-browser CPU benchmark for awake resident slime piles.
// BUNDLE=/tmp/baseline.js DUMP=/tmp/pile-baseline node tools/test-soft-pile-performance.mjs
// COMPARE=/tmp/pile-baseline/report.json checks every trajectory against the saved run.
// MODES=default,contact,terrain,material COUNTS=1,8 CASES=separated,pile,held FRAMES=180 REPEATS=2 PROFILE=1
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8281), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-pile-performance';
const cpu = true;
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
const modes = (process.env.MODES || 'default,material').split(',');
const counts = (process.env.COUNTS || '1,8').split(',').map(Number);
const cases = (process.env.CASES || 'separated,pile,held').split(',');
const frames = Number(process.env.FRAMES || 180);
const repeats = Number(process.env.REPEATS || 2);
const comparison = process.env.COMPARE ? JSON.parse(fs.readFileSync(process.env.COMPARE, 'utf8')) : null;
const doProfile = process.env.PROFILE !== '0';
assert.ok(modes.every(mode => ['default', 'contact', 'terrain', 'material'].includes(mode)), 'known MODES');
assert.ok(cases.every(name => ['separated', 'pile', 'held'].includes(name)), 'known CASES');
assert.ok(counts.every(count => Number.isInteger(count) && count > 0 && count <= 16), 'COUNTS between 1 and 16');
assert.ok(Number.isInteger(frames) && frames > 0 && frames <= 1200, 'FRAMES between 1 and 1200');
assert.ok(Number.isInteger(repeats) && repeats > 0 && repeats <= 10, 'REPEATS between 1 and 10');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
assert.ok(bundle.includes('SOFT_MATERIAL'), 'build material experiment first');
const servedBundle = bundle.slice(0, end) + '\nwindow.__pileTest = function(source) { return eval(source); };\n' + bundle.slice(end);
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
let cpuProfile;
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
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__pileTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __pileTest === 'function'")) {
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
  watchdog = setTimeout(() => { console.error('FAIL benchmark exceeded five minutes during ' + stage); cleanup(); process.exit(1); }, 300000);
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
    window.__pilePlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  for (let repeat = 0; repeat < repeats; repeat++) for (const mode of modes) for (const count of counts) for (const name of cases) {
    if (count === 1 && name !== 'separated') continue;
    stage = `${mode}/${count}/${name}/${repeat}`;
    console.log('START ' + stage);
    const result = await game(`(${runFixture.toString()})(${JSON.stringify({ mode, count, name, frames, repeat })})`);
    results.push(result); writeReport();
    console.log('CASE ' + JSON.stringify(result));
  }
  if (doProfile) {
    stage = 'CPU sampling profile';
    await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 100 }); await send('Profiler.start');
    const result = await game(`(${runFixture.toString()})(${JSON.stringify({ mode: modes.at(-1), count: Math.max(...counts), name: 'held', frames, repeat: 0 })})`);
    const profiled = await send('Profiler.stop'); cpuProfile = profiled.profile;
    fs.writeFileSync(path.join(dump, 'pile.cpuprofile'), JSON.stringify(cpuProfile));
    const byId = new Map(cpuProfile.nodes.map(n => [n.id, n]));
    const times = new Map();
    cpuProfile.samples.forEach((id, i) => {
      const node = byId.get(id), key = node.callFrame.functionName + ':' + node.callFrame.lineNumber;
      if (!times.has(key)) times.set(key, { name: node.callFrame.functionName, ms: 0, line: node.callFrame.lineNumber + 1 });
      times.get(key).ms += cpuProfile.timeDeltas[i] / 1000;
    });
    const top = [...times.values()].sort((a,b) => b.ms - a.ms).slice(0,25);
    cpuProfile = { result, top }; console.log('PROFILE ' + JSON.stringify(top));
  }
  check('all bodies finite, present and active throughout', results.every(r => r.finite && r.minimumBodies === r.count && r.minimumActive === r.count));
  check('held fixtures remain held for every measured frame', results.filter(r => r.name === 'held').every(r => r.heldFrames === r.frames));
  check('pile fixtures produce body contacts', results.filter(r => r.count > 1 && r.name !== 'separated').every(r => r.contactsPerFrame > 0));
  const matched = new Map();
  for (const result of results) {
    const key = `${result.mode}/${result.count}/${result.name}`;
    if (matched.has(key)) check(key + ' repeated trajectory matches byte for byte', result.trajectoryHash === matched.get(key));
    else matched.set(key, result.trajectoryHash);
  }
  if (comparison) {
    for (const result of results) {
      const prior = comparison.results.find(r => r.mode === result.mode && r.count === result.count && r.name === result.name && r.repeat === result.repeat && r.frames === result.frames);
      check(`${result.mode}/${result.count}/${result.name}/${result.repeat} matches reference trajectory`, !!prior && prior.initialHash === result.initialHash && prior.trajectoryHash === result.trajectoryHash);
    }
  }
  check('no browser exceptions', browserErrors.length === 0);
  writeReport(); assert.equal(failures.length, 0, failures.join('\n'));
} catch (error) {
  fs.writeFileSync(path.join(dump, 'interrupted.json'), JSON.stringify({ stage, error: String(error), bundleHash, cpu, boots, results, browserErrors }, null, 2)); throw error;
} finally { cleanup(); }

function writeReport() {
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, bundleHash, cpu, boots, results, cpuProfile, browserErrors, failures, comparisonBundleHash: comparison?.bundleHash,
    notes: ['Physics updateJello CPU time, excludes rendering and surface-brain time. Not a full-game FPS measurement.',
      'Simulation uses a deterministic clock and seeded random; timing uses the captured native browser clock.',
      'Every body is explicitly kept awake to measure loaded simulation, rather than sleep behavior.',
      'Piles settle against a three-tile-wide enclosure; held fixture presses its uppermost slime down through the pile.',
      'SHA256 trajectory digest contains the raw Float64 bytes of every node position and Verlet history after every measured frame.'] }, null, 2));
}

async function runFixture(spec) {
  var nativeRandom = Math.random, nativeNow = performance.now, realNow = performance.now.bind(performance), clock = 100000, rng = 314159265;
  Math.random = function() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  performance.now = function() { return clock; };
  var dt = 1 / 60, origin = DECK_CENTER_COL - 18, x = origin * TILE, floor = SKY_ROWS * TILE;
  var bodies = [], timings = [], contacts = 0, activeMinimum = spec.count, bodyMinimum = spec.count, maxContacts = 0, finite = true;
  var trajectory, trajectoryOffset = 0;
  var hash = 2166136261, bytes = new Uint8Array(8), value = new Float64Array(bytes.buffer), initialHash;
  try {
    if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
    resetJello(); jelloFrameNo = 0; skySlimes.length = 0; skySlimeNext = 1e9; surfaceSlimesSeeded = true;
    SOFT_CONTACT = spec.mode !== 'default'; SOFT_HANDLING = spec.mode !== 'default';
    SOFT_TERRAIN = spec.mode === 'terrain' || spec.mode === 'material'; SOFT_MATERIAL = spec.mode === 'material'; softContactClear();
    Object.keys(keys).forEach(function(key) { keys[key] = false; }); dpad.left = dpad.right = dpad.up = dpad.down = false;
    Object.assign(player, JSON.parse(JSON.stringify(window.__pilePlayerInitial)));
    gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
    shopState = 'closed'; drilling = null; hitPauseT = 0; siphon.equipped = false;
    player.x = x - 250; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
    player.renderX = player.x; player.renderY = player.y; player.onGround = true;
    player.thrusting = false; player.thrustSpool = 0; player.onJello = false;
    for (var r = 0; r <= SKY_ROWS + 7; r++) for (var c = origin - 15; c <= origin + 35; c++) {
      var wall = spec.name !== 'separated' && (c === origin - 1 || c === origin + 3) && r >= SKY_ROWS - 8;
      world[r][c] = r >= SKY_ROWS || wall ? { type: 'foundation', hp: ORES.foundation.hp } : null;
      invalidateTerrainAround(r, c);
    }
    for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
    cam.x = x - 100; cam.y = floor - screenH * 0.65;
    for (var i = 0; i < spec.count; i++) {
      var bx = x + 23 + (spec.name === 'separated' ? (i % 8) * 70 : (i % 2) * 40);
      var by = floor - 27 - Math.floor(i / (spec.name === 'separated' ? 8 : 2)) * (spec.name === 'separated' ? 75 : 38);
      var b = surfaceSlimeBuild(bx, by, { id: 96001+i, seed: 0.2 + (i % 5) * 0.15, hue: 133, home: bx, r: 24.3 });
      if (!b) throw new Error('failed to create slime ' + i);
      surfaceSlimeDetach(b, 20); bodies.push(b);
    }
    var held = bodies[bodies.length - 1], gx = held.cx, gy = held.cy;
    if (spec.name === 'held' && !surfaceSlimeGrabStart(gx, gy, 'fixture')) throw new Error('failed to grab pile');
    updateHash(); initialHash = (hash >>> 0).toString(16); hash = 2166136261;
    trajectory = new Float64Array(spec.frames * bodies.reduce(function(sum, b) { return sum + b.n * 4; }, 0));
    var warmup = 60, total = warmup + spec.frames, heldFrames = 0, maxGuardRejects = 0;
    for (var frame = 0; frame < total; frame++) {
      for (var n = 0; n < bodies.length; n++) { bodies[n].sleeping = false; bodies[n].sleepFrames = 0; }
      if (spec.name === 'held') surfaceSlimeGrabMove(gx + Math.sin(frame * dt * 2) * 16, gy + Math.min(1, frame / 90) * 80, 'fixture');
      clock += dt * 1000;
      update(dt); surfaceSlimeTick(dt);
      var before = realNow(); updateJello(dt); var elapsed = realNow() - before;
      if (frame >= warmup) {
        timings.push(elapsed); updateHash();
        contacts += jelloContactsThisFrame; maxContacts = Math.max(maxContacts, jelloContactsThisFrame);
        activeMinimum = Math.min(activeMinimum, jelloActive.length); bodyMinimum = Math.min(bodyMinimum, jelloBodies.length);
        if (surfaceSlimeGrip) heldFrames++;
        for (n = 0; n < bodies.length; n++) maxGuardRejects = Math.max(maxGuardRejects, bodies[n]._guardRejects || 0);
      }
    }
    timings.sort(function(a,b) { return a-b; });
    var digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', trajectory.buffer))).map(function(v) { return v.toString(16).padStart(2, '0'); }).join('');
    return { mode: spec.mode, count: spec.count, name: spec.name, repeat: spec.repeat, frames: spec.frames, initialHash: initialHash,
      trajectoryHash: digest, trajectoryBytes: trajectory.byteLength, finite: finite, minimumBodies: bodyMinimum, minimumActive: activeMinimum,
      meanMs: timings.reduce(function(a,b) { return a+b; },0)/timings.length,
      medianMs: timings[Math.floor(timings.length*.5)], p95Ms: timings[Math.floor(timings.length*.95)], maxMs: timings[timings.length-1],
      contactsPerFrame: contacts/spec.frames, maxContacts: maxContacts, heldFrames: heldFrames, maxGuardRejects: maxGuardRejects,
      endBounds: bodies.map(function(b) { return [b.cx,b.cy,b.bboxR-b.bboxL,b.bboxB-b.bboxT]; }) };
  } finally {
    if (surfaceSlimeGrip) surfaceSlimeGrabEnd(undefined, true);
    Math.random = nativeRandom; performance.now = nativeNow;
  }
  function updateHash() {
    for (var bi = 0; bi < bodies.length; bi++) {
      var b = bodies[bi];
      for (var i = 0; i < b.n; i++) {
        var fields = [b.px[i], b.py[i], b.ox[i], b.oy[i]];
        for (var f = 0; f < fields.length; f++) {
          finite = finite && isFinite(fields[f]); value[0] = fields[f];
          if (trajectory) trajectory[trajectoryOffset++] = fields[f];
          for (var k = 0; k < 8; k++) hash = Math.imul(hash ^ bytes[k], 16777619);
        }
      }
    }
  }
}
