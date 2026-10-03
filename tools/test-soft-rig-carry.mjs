// Real resident material and keyboard flight, in an owned Chrome for Testing.
// DUMP=/tmp/sluice-rig-carry node tools/test-soft-rig-carry.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8347), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-rig-carry';
fs.mkdirSync(dump, { recursive: true });
const source = process.env.BUNDLE ? fs.readFileSync(process.env.BUNDLE, 'utf8') :
  fs.readdirSync(path.join(root, 'js/sluice')).filter(name => /^\d{3}-.*\.js$/.test(name)).sort()
    .map(name => fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8')).join('');
const end = source.lastIndexOf('})();');
assert(end > 0);
const bundle = source.slice(0, end) + '\nwindow.__carryTest = function(s) { return eval(s); };\n' + source.slice(end);
const contact = { Math, Float64Array, URLSearchParams, location: { search: '' }, softProjectEnabled: true,
  skySlimeClamp: (x, low, high) => Math.max(low, Math.min(high, x)) };
vm.createContext(contact);
vm.runInContext(fs.readFileSync(path.join(root, 'js/sluice/342-soft-contact.js'), 'utf8'), contact);
function measure(b, dt) {
  let x = 0, y = 0, energy = 0, angular = 0;
  for (let i = 0; i < b.n; i++) {
    const vx = (b.px[i] - b.ox[i]) / dt, vy = (b.py[i] - b.oy[i]) / dt;
    x += vx; y += vy; energy += vx * vx + vy * vy;
    angular += b.px[i] * vy - b.py[i] * vx;
  }
  return { x, y, energy, angular };
}
for (const dt of [1 / 120, 1 / 720]) for (const spin of [-2, 0, 2]) for (const load of [0, 0.01, 100000]) {
  const b = { n: 12, px: [], py: [], ox: [], oy: [] };
  for (let i = 0; i < b.n; i++) {
    const angle = i * Math.PI * 2 / b.n, x = Math.cos(angle) * 24, y = Math.sin(angle) * 18;
    b.px.push(x); b.py.push(y);
    // Translation, spin and a separate extension/compression mode.
    b.ox.push(x - (80 - spin * y + 0.7 * x) * dt);
    b.oy.push(y - (-100 + spin * x - 0.7 * y) * dt);
  }
  const before = measure(b, dt), pose = JSON.stringify([b.px, b.py]);
  contact.softContactRoll(b, load, dt);
  const after = measure(b, dt);
  assert.equal(JSON.stringify([b.px, b.py]), pose, 'rolling grip cannot change shape or position');
  assert(Math.abs(before.x - after.x) < 1e-7 && Math.abs(before.y - after.y) < 1e-7, 'linear momentum preserved');
  assert(after.energy <= before.energy + 1e-6, 'rolling grip cannot add kinetic energy');
  assert(Math.abs(after.angular) <= Math.abs(before.angular) + 1e-6, 'rotation cannot reverse or grow');
  assert(Math.abs(after.angular - before.angular) * contact.SOFT_CONTACT_POINT_MASS <=
    load * contact.SOFT_CONTACT_ROLL_RADIUS + 1e-6, 'moment is bounded by contact load');
  if (!load) assert.deepEqual(after, before, 'separated/unloaded gel retains every velocity');
}
console.log('PASS rolling grip preserves shape and linear momentum, dissipates energy, and respects contact load');
const profile = fs.mkdtempSync('/tmp/sluice-carry-browser-');
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(file === path.join(root, 'js/sluice.js') ? bundle : fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
const pending = new Map(), errors = [], results = [];
let chrome, socket, sequence = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
  return reply.result?.value;
}
const game = text => evaluate(`__carryTest(${JSON.stringify(text)})`);
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json())
      .find(tab => tab.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    await sleep(100);
  }
  assert(endpoint, 'owned browser started');
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request?.timer);
      message.error ? request?.reject(message.error) : request?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      errors.push(message.params.args.map(arg => arg.value || arg.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&_rafTimer=1` });
  let boot;
  for (let attempt = 0; attempt < 600; attempt++) {
    if (await evaluate("typeof __carryTest === 'function'")) {
      boot = await game(`({ intro: introPhase, assets: gameLoadingAssetsReady, work: gameLoadingWorkPending,
        errors: window.SluiceLoading ? SluiceLoading.report() : null })`);
      if (boot.intro === 'done') break;
      if (boot.assets && !boot.work && boot.intro === 'warmup')
        await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; renderLoadingScene();');
    }
    await sleep(50);
  }
  assert.equal(boot?.intro, 'done', JSON.stringify(boot));
  assert(await game('SAVE_DISABLED && SOFT_CONTACT && SOFT_MATERIAL && SOFT_INTENT'), 'ordinary resident model booted');
  console.log('PASS ordinary WebGPU game boot with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0;
    window.__carryPlayer = JSON.parse(JSON.stringify(player));
    window.__runCarry = function(spec) {
      var nativeRandom = Math.random, nativeNow = performance.now, clock = 100000, random = 314159265;
      Math.random = function() { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
      performance.now = function() { return clock; };
      try {
        resetJello(); softContactClear(); skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;
        Object.assign(player, JSON.parse(JSON.stringify(window.__carryPlayer)));
        Object.keys(keys).forEach(function(key) { keys[key] = false; });
        dpad.left = dpad.right = dpad.up = dpad.down = false;
        gamePaused = gameOver = gameWon = shopOpen = ledgerOpen = cargoManifestOpen = bathMode = false;
        shopState = 'closed'; drilling = null; hitPauseT = 0; devMode = false;
        var floor = SKY_ROWS * TILE, x = (DECK_CENTER_COL - 9) * TILE, dt = 1 / spec.fps;
        for (var row = 0; row <= SKY_ROWS + 5; row++) {
          for (var col = DECK_CENTER_COL - 26; col <= DECK_CENTER_COL + 10; col++) {
            world[row][col] = row >= SKY_ROWS ? { type: 'stone', hp: 100 } : null;
            invalidateTerrainAround(row, col);
          }
        }
        if (spec.kind === 'ceiling') for (var col = DECK_CENTER_COL - 26; col <= DECK_CENTER_COL + 10; col++)
          world[SKY_ROWS - 3][col] = { type: 'stone', hp: 100 };
        if (spec.kind === 'wall') for (var row = 0; row < SKY_ROWS; row++)
          world[row][DECK_CENTER_COL - 7] = { type: 'stone', hp: 100 };
        for (var li = liquidCount - 1; li >= 0; li--) removeLiquidParticle(li);
        player.x = x - PLAYER_W / 2; player.y = floor - PLAYER_H;
        player.vx = player.vy = 0; player.renderX = player.x; player.renderY = player.y;
        player.onGround = true; player.onJello = false; player.thrusting = false;
        player.thrustSpool = 0; player._thrustWas = false; player.jelloCarryVx = 0;
        player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
        player.hull = 100000; player.fuel = 100000;
        var roof = rigContactHull().t;
        var b = surfaceSlimeBuild(x + spec.offset, roof - (spec.kind === 'ceiling' ? 19 : 24),
          { id: 91001, seed: 0.46, hue: 133, home: x, r: spec.radius || 24.3 });
        surfaceSlimeDetach(b, 0.85);
        cam.x = x - screenW / 2; cam.y = floor - screenH * 0.6;
        var result = { fps: spec.fps, offset: spec.offset, radius: spec.radius || 24.3, kind: spec.kind || 'vertical',
          rise: 0, maxOffset: 0, maxPenetration: 0, samples: [], contactFrames: 0, finite: true, offAt: null,
          terrainPoints: 0, minArea: 1 };
        var initialArea = b.restArea;
        var initialY = b.cy, liftY;
        for (var frame = 0; frame < spec.fps * (spec.kind === 'ceiling' ? 5 : 3); frame++) {
          var time = frame * dt; clock += dt * 1000;
          keys[' '] = !spec.touch && time >= 0.35;
          dpad.up = !!spec.touch && time >= 0.35;
          keys.ArrowRight = spec.kind === 'lateral' && time >= 1.2 && time < 1.35 ||
            spec.kind === 'release' && time >= 1.5 || spec.kind === 'wall' && time >= 1.2;
          update(dt); surfaceSlimeTick(dt); updateJello(dt);
          if (time >= 0.35 && liftY === undefined) liftY = b.cy;
          var offset = b.cx - (player.x + PLAYER_W / 2);
          result.maxOffset = Math.max(result.maxOffset, Math.abs(offset));
          result.rise = Math.max(result.rise, initialY - b.cy);
          result.finite = result.finite && Number.isFinite(b.cx + b.cy + player.x + player.y + player.vx + player.vy);
          if (solidAt(player.x, player.y, PLAYER_W, PLAYER_H)) result.terrainPoints++;
          if (softContactReport.contacts) result.contactFrames++;
          if (result.offAt === null && (Math.abs(offset) > 36 || b.cy > rigContactHull().t + 20)) result.offAt = time;
          var area = 0;
          for (var p = 0; p < b.ringN; p++) {
            var q = b.ring[p], next = b.ring[(p + 1) % b.ringN];
            result.maxPenetration = Math.max(result.maxPenetration,
              -rigHullQuery(rigContactHull(), b.px[q], b.py[q]).distance);
            area += (b.px[q] - b.cx) * (b.py[next] - b.cy) - (b.py[q] - b.cy) * (b.px[next] - b.cx);
          }
          for (p = 0; p < b.n; p++) if (jelloWorldSolidAt(b.px[p], b.py[p])) result.terrainPoints++;
          result.minArea = Math.min(result.minArea, Math.abs(area) * 0.5 / initialArea);
          if (frame % Math.max(1, Math.round(spec.fps / 10)) === 0)
            result.samples.push({ time: time, offset: offset, cy: b.cy, rigY: player.y, contacts: softContactReport.contacts });
        }
        result.finalOffset = b.cx - (player.x + PLAYER_W / 2);
        result.rigRise = floor - PLAYER_H - player.y;
        result.liftRise = liftY - b.cy;
        result.rigTravel = player.x + PLAYER_W / 2 - x;
        return result;
      } finally { Math.random = nativeRandom; performance.now = nativeNow; }
    };`);
  for (const fps of (process.env.FPS || '30,60,144').split(',').map(Number)) {
    for (const offset of (process.env.OFFSETS || '0,-4,4,-8,8').split(',').map(Number)) {
      const result = await game(`__runCarry(${JSON.stringify({ fps, offset })})`);
      results.push(result);
      console.log(JSON.stringify({ ...result, samples: undefined }));
      assert(result.finite, 'finite airborne contact');
    }
  }
  for (const spec of [
    { fps: 60, offset: 0, kind: 'lateral' }, { fps: 60, offset: 0, kind: 'release' },
    { fps: 60, offset: 0, kind: 'ceiling' }, { fps: 60, offset: 0, kind: 'wall' },
    { fps: 60, offset: 0, radius: 22 }, { fps: 60, offset: 0, radius: 27 }
  ]) {
    const result = await game(`__runCarry(${JSON.stringify(spec)})`);
    results.push(result); console.log(JSON.stringify({ ...result, samples: undefined }));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await game('isMobile = true;');
  await evaluate("window.dispatchEvent(new Event('resize'))");
  const mobile = await game(`__runCarry({ fps: 60, offset: 4, touch: true })`);
  mobile.kind = 'touch-landscape'; results.push(mobile);
  console.log(JSON.stringify({ ...mobile, samples: undefined }));
  await game('cam.x = player.x - screenW / 2; cam.y = player.y - screenH / 2; render();');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(dump, 'carry-landscape.png'), Buffer.from(screenshot.data, 'base64'));
  for (const result of results) {
    assert(result.finite && result.terrainPoints === 0, 'finite gel outside terrain');
    assert(result.maxPenetration < 0.5 && result.minArea > 0.9, 'contact retains intact gel');
    if (result.kind === 'release') {
      assert(result.offAt !== null && Math.abs(result.finalOffset) > 50, 'hard lateral movement releases the slime');
    } else if (Math.abs(result.offset) <= 4 && result.kind !== 'ceiling' && result.kind !== 'wall') {
      assert.equal(result.offAt, null, 'centered and slightly offset slimes stay supported');
      assert(result.liftRise > 40 && Math.abs(result.finalOffset) < 8, 'slime rises with the miner');
      if (result.kind === 'lateral') assert(result.rigTravel > 10, 'gentle sideways flight carries the slime');
    }
  }
  console.log('PASS sustained vertical/sideways carry, supported size range, natural release and landscape touch');
  assert.deepEqual(errors, [], 'no browser errors');
  fs.writeFileSync(path.join(dump, 'report.json'), JSON.stringify({ results, errors }, null, 2));
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  try { socket?.close(); } catch {}
  chrome?.kill();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
