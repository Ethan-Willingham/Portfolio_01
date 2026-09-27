// Browser integration of material presentation and physical contact audio events.
// node tools/test-soft-presentation-browser.mjs
// CPU=0 exercises hardware graphics; default CPU=1 is deterministic software rendering.
// BUNDLE=/path/to/snapshot.js DUMP=/tmp/review-output selects an exact snapshot/output.
// Before integration, optionally provide PRESENTATION_FRAGMENT and PRESENTATION_HOOKS.
// Audio checks capture mixer event requests. They do not listen to rendered audio.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8293), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-presentation-browser';
const cpu = process.env.CPU !== '0';
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
let bundle = fs.readFileSync(bundlePath, 'utf8');
const sourceBundleHash = createHash('sha256').update(bundle).digest('hex');
if (process.env.PRESENTATION_FRAGMENT) {
  const fragment = fs.readFileSync(process.env.PRESENTATION_FRAGMENT, 'utf8');
  const tail = bundle.lastIndexOf('})();');
  assert.ok(tail > 0 && fragment.includes('function softPresentationTick('), 'valid draft and game bundle');
  // A later function declaration replaces an already integrated draft privately.
  bundle = bundle.slice(0, tail) + '\n' + fragment + '\nSOFT_PRESENTATION = true;\n' + bundle.slice(tail);
}
if (process.env.PRESENTATION_HOOKS) {
  const hooks = JSON.parse(fs.readFileSync(process.env.PRESENTATION_HOOKS, 'utf8'));
  for (const hook of hooks) {
    if (bundle.includes(hook.after)) continue;
    assert.equal(bundle.split(hook.before).length - 1, 1, hook.path + ' exact browser hook');
    bundle = bundle.replace(hook.before, hook.after);
  }
}
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('function softPresentationTick('), 'build presentation stage first, or provide the draft fragment');
const probe = `
window.__presentationTest = function(source) { return eval(source); };
window.__presentationWarm = { interior: 0, eye: 0 };
var presentationTestInterior = softPresentationDrawInterior, presentationTestEye = softPresentationDrawEye;
softPresentationDrawInterior = function(b) {
  var handled = presentationTestInterior(b);
  if (handled && window.__shaderWarm && !window.__shaderWarm.done) window.__presentationWarm.interior++;
  return handled;
};
softPresentationDrawEye = function(b) {
  var handled = presentationTestEye(b);
  if (handled && window.__shaderWarm && !window.__shaderWarm.done) window.__presentationWarm.eye++;
  return handled;
};
`;
const servedBundle = bundle.slice(0, end) + '\n' + probe + '\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-presentation-browser-');
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
const pending = new Map(), browserErrors = [];
let renderResult, audioResult;
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
const game = source => evaluate(`__presentationTest(${JSON.stringify(source)})`);
async function awaitBoot() {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __presentationTest === 'function'")) {
      boot.last = await game(`({ intro: introPhase, assets: gameLoadingAssetsReady, work: gameLoadingWorkPending,
        terrainPending: terrainChunkPendingThisFrame, clouds: loadingCloudsReady(), frame: gameRafId,
        fence: gameLoadingFence ? { frames: gameLoadingFence.frames, gpuDone: gameLoadingFence.gpuDone, gl: gameLoadingFence.gl.length } : null,
        warm: window.__shaderWarm, hidden: document.hidden,
        loading: window.SluiceLoading ? SluiceLoading.report().tasks.filter(function(t) { return t.state === 'running'; }) : [] })`);
      if (boot.last.intro === 'done') {
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
  watchdog = setTimeout(() => { console.error('FAIL presentation browser test exceeded three minutes during ' + stage); cleanup(); process.exit(1); }, 180000);
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softnext=1&softstage=4&nosave=1&nopause=1&tod=0.35${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_PRESENTATION"), 'game boots with presentation enabled and saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);


  stage = 'physical contact event routing';
  audioResult = await game('(' + audioFixture.toString() + ')()');
  stage = 'actual renderer gallery';
  renderResult = await game(`(function() {
    var sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 580;
    document.body.replaceChildren(sheet); document.body.style.margin = '0';
    var main = ctx; ctx = sheet.getContext('2d');
    ctx.fillStyle = '#303931'; ctx.fillRect(0, 0, 1200, 580);
    var b = surfaceSlimeBuild(0, 0, { id: -1, seed: 0.4, hue: 133, r: 25 });
    var baseX = Float64Array.from(b.px), baseY = Float64Array.from(b.py);
    var poses = [[1,1,0],[1.35,0.7,0],[0.8,1.3,0.3],[0.95,1,0]];
    var names = ['Rest', 'Compression', 'Shear', 'Local bend'];
    function physicalState(body) {
      return JSON.stringify([body.px,body.py,body.ox,body.oy,body.rx,body.ry,body.sRest,
        body.triDmInv,body.cx,body.cy,body.vx,body.vy,body.restArea]);
    }
    var report = { drawReadOnly: true, tickReadOnly: true, patches: [], shaderWarm: window.__shaderWarm,
      warmCalls: window.__presentationWarm, poses: [] };
    for (var row = 0; row < 2; row++) {
      SOFT_PRESENTATION = !!row;
      for (var i = 0; i < poses.length; i++) {
        b.px.set(baseX); b.py.set(baseY);
        shaderWarmDeform(b, baseX, baseY, 0, 0, poses[i][0], poses[i][1], poses[i][2]);
        if (i === 3) for (var k = 0; k < b.n; k++) {
          var amount = Math.max(0, -baseX[k] / 25); b.py[k] -= 8 * amount * amount;
        }
        jelloUpdateBody(b, JELLO_H);
        var beforeTick = physicalState(b);
        if (row) softPresentationTick(b, 1 / 60, 100, -50);
        report.tickReadOnly = report.tickReadOnly && beforeTick === physicalState(b);
        var before = physicalState(b);
        ctx.save(); ctx.translate(155 + i * 290, 170 + row * 265); ctx.scale(3.5,3.5);
        surfaceSlimeDraw(b); ctx.restore();
        report.drawReadOnly = report.drawReadOnly && before === physicalState(b);
        report.poses.push({ mode: row ? 'new' : 'prior', name: names[i] });
        ctx.fillStyle = '#e8e2d6'; ctx.font = '18px Commit Mono'; ctx.textAlign = 'center';
        ctx.fillText(names[i], 155 + i * 290, 285 + row * 265);
      }
      ctx.fillStyle = '#d4c4a0'; ctx.font = '20px Commit Mono'; ctx.textAlign = 'left';
      ctx.fillText(row ? 'Material presentation' : 'Prior presentation', 30, 40 + row * 265);
    }
    report.patches = b.surfaceSlime.presentation.patches;
    report.localMeshPatches = report.patches.filter(function(p) { return p.o !== 0; }).length;
    ctx = main;
    return report;
  })()`);
  assert.ok(renderResult.drawReadOnly && renderResult.tickReadOnly, 'presentation leaves all physical state exact');
  assert.equal(renderResult.localMeshPatches, 4, 'all inclusions bind actual local material triangles');
  assert.equal(renderResult.shaderWarm.errors.length, 0, 'warm-up succeeds');
  assert.ok(renderResult.warmCalls.interior >= 6 && renderResult.warmCalls.eye >= 6, 'loading exercises the new material and eye draws');
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1200, height: 580, scale: 1 } });
  fs.writeFileSync(path.join(dump, 'presentation-poses.png'), Buffer.from(capture.data, 'base64'));
  assert.ok(audioResult.pinnedCenter && audioResult.pinnedReported, 'moving patch impacts while its center is stationary');
  assert.equal(audioResult.pinnedEvents, 1, 'pinned patch contact reaches the existing mixer once');
  assert.equal(audioResult.pinnedCooldownEvents, 1, 'the same body obeys its existing cooldown');
  assert.equal(audioResult.pileEvents, 1, 'eight simultaneous body impacts select one pile event');
  assert.equal(audioResult.pileCooldownEvents, 1, 'pile cooldown suppresses repeats');
  assert.ok(audioResult.pileCleared, 'suppressed pile events are discarded');
  assert.equal(audioResult.pausedEvents, 0, 'pause silences physical contacts');
  assert.equal(audioResult.resumeEvents, 0, 'resume does not replay contacts');
  assert.equal(audioResult.freshEvents, 1, 'a fresh post-cooldown contact still sounds');
  assert.equal(audioResult.rigEvents, 1, 'real rig contact reaches the same mixer');
  assert.ok(audioResult.sounds.every(sound => sound.name === 'jello-slap' && Number.isFinite(sound.options.gain + sound.options.rate + sound.options.pan)), 'all impact requests use the existing finite slap route');
  assert.equal(browserErrors.length, 0, 'no browser exceptions');
  writeReport();
  console.log(JSON.stringify({ drawReadOnly: renderResult.drawReadOnly, tickReadOnly: renderResult.tickReadOnly,
    warmCalls: renderResult.warmCalls, eventValidation: audioResult, screenshot: path.join(dump, 'presentation-poses.png') }));
} catch (error) {
  writeReport({ failure: String(error), stage });
  throw error;
} finally { cleanup(); }

function writeReport(extra = {}) {
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ bundlePath, sourceBundleHash, bundleHash,
    injectedDraft: process.env.PRESENTATION_FRAGMENT || null, injectedHooks: process.env.PRESENTATION_HOOKS || null,
    cpu, boots, renderResult, audioResult, browserErrors,
    notes: ['Audio validation captures event requests; it does not listen to the sounds.',
      'Warm-up completion checks drawing coverage, not GPU timing or frame pacing.',
      'The gallery deforms actual render bodies; these poses are not a physical-motion acceptance test.'], ...extra }, null, 2));
}

function audioFixture() {
  var saved = { bodies: jelloBodies, count: jelloCount, serial: skySlimeSerial,
    playerX: player.x, playerY: player.y, camX: cam.x, camY: cam.y,
    paused: gamePaused, over: gameOver, won: gameWon, shop: shopOpen, shopState: shopState,
    ledger: ledgerOpen, cargo: cargoManifestOpen, gap: slimeAudioGap, play: sfxPlay };
  var sounds = [], result = {}, h = JELLO_H / 3;
  try {
    jelloBodies = []; jelloCount = 0;
    gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = false;
    shopState = 'closed'; slimeAudioGap = 0;
    var x = DECK_CENTER_COL * TILE, y = SKY_ROWS * TILE - 130;
    cam.x = x - screenW / 2; cam.y = y - screenH / 2;
    player.x = x - PLAYER_W / 2; player.y = y - PLAYER_H / 2;
    sfxPlay = function(name, options) { sounds.push({ name: name, options: options }); };
    function resident(offset) {
      return surfaceSlimeBuild(x + (offset || 0), y, { seed: 0.4, hue: 133, r: 25 });
    }
    function terrainHit(b) {
      var i = b.ring[Math.floor(b.ringN / 4)];
      b.oy[i] = b.py[i] - 240 * h / JELLO_TIMESCALE;
      softTerrainProject(b, i, i, 0, 0, -1, 0.2, h);
    }
    var pinned = resident(), centerX = pinned.px[0], centerY = pinned.py[0];
    pinned.vx = pinned.vy = 0;
    terrainHit(pinned);
    result.pinnedCenter = pinned.px[0] === centerX && pinned.py[0] === centerY && pinned.vx === 0 && pinned.vy === 0;
    result.pinnedReported = !!pinned._sound && pinned._sound.hit > 0;
    slimeAudioUpdate(1 / 60); result.pinnedEvents = sounds.length;
    terrainHit(pinned); slimeAudioUpdate(1 / 60); result.pinnedCooldownEvents = sounds.length;
    jelloBodies = []; jelloCount = 0; slimeAudioGap = 0;
    var pile = [];
    for (var n = 0; n < 8; n++) pile.push(resident((n - 3.5) * 8));
    function pileHit() {
      for (var i = 0; i < pile.length; i += 2) {
        var A = pile[i], B = pile[i + 1], a = A.ring[0], b = B.ring[Math.floor(B.ringN / 2)];
        A.ox[a] = A.px[a] - 160 * h / JELLO_TIMESCALE;
        B.ox[b] = B.px[b] + 160 * h / JELLO_TIMESCALE;
        softPairsPatch(A, a, a, 0, B, b, b, 0, -1, 0, 0.2, h);
      }
    }
    var before = sounds.length; pileHit(); slimeAudioUpdate(1 / 60);
    result.pileEvents = sounds.length - before;
    pileHit(); slimeAudioUpdate(1 / 60);
    result.pileCooldownEvents = sounds.length - before;
    result.pileCleared = pile.every(function(b) { return b._sound && b._sound.hit === 0; });
    slimeAudioGap = 0; pile.forEach(function(b) { b._sound.cool = 0; });
    gamePaused = true; before = sounds.length; pileHit(); slimeAudioUpdate(1 / 60);
    result.pausedEvents = sounds.length - before;
    gamePaused = false; slimeAudioUpdate(1);
    result.resumeEvents = sounds.length - before;
    pileHit(); slimeAudioUpdate(1 / 60); result.freshEvents = sounds.length - before;
    jelloBodies = []; jelloCount = 0; slimeAudioGap = 0;
    var body = resident(), index = body.ring[0], dt = h / JELLO_TIMESCALE;
    var frame = { rig: { x: x - 60, y: y, vx: 240, vy: 0 }, vx: 240, vy: 0, hit: false };
    before = sounds.length;
    softContactProject(body, index, index, 0, -1, 0, 1, y, dt, frame);
    slimeAudioUpdate(1 / 60); result.rigEvents = sounds.length - before;
    result.sounds = sounds;
    return result;
  } finally {
    jelloBodies = saved.bodies; jelloCount = saved.count; skySlimeSerial = saved.serial;
    player.x = saved.playerX; player.y = saved.playerY; cam.x = saved.camX; cam.y = saved.camY;
    gamePaused = saved.paused; gameOver = saved.over; gameWon = saved.won; shopOpen = saved.shop;
    shopState = saved.shopState; ledgerOpen = saved.ledger; cargoManifestOpen = saved.cargo;
    slimeAudioGap = saved.gap; sfxPlay = saved.play;
  }
}
