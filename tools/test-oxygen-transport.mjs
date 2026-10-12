// Spatial oxygen regression in the ordinary demo host and its real GPU airflow.
// Owns one Chrome for Testing child and closes that exact process in finally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.DUMP || '/tmp/oxygen-transport-review');
const phase = process.env.PHASE || 'all';
assert.ok(['all', 'fixtures', 'candle', 'chimney', 'other', 'mobile'].includes(phase), 'known test phase');
const sourceSHA256 = Object.fromEntries(['js/wss-oxygen.js', 'js/wss-fire.js', 'js/sluice/190-smoke-webgl.js', 'js/wss-drafts-fire-smoke.js', 'js/wss-drafts-materials.js', 'js/wss-sauna.js', 'js/wss-oxygen-view.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oxygen-browser-'));
fs.mkdirSync(output, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
let child, socket, serial = 0;
const pending = new Map(), errors = [], reports = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method + ' ' + (params.expression || '').slice(0, 160))); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function until(expression, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    const failure = await evaluate('window.__toy?.buildState?.().error || window.__toy?.oxygen?.()?.stats().error || null');
    if (failure) throw Error(label + ': ' + failure);
    await delay(100);
  }
  throw Error('Timed out: ' + label + '; ' + JSON.stringify(await evaluate('({host:window.__toy?.stats(), build:window.__toy?.buildState?.(), oxygen:window.__toy?.oxygen?.()?.stats(), fire:window.__toy?.fire?.()?.stats()})')));
}
async function advance(seconds) {
  const target = await evaluate('__toy.oxygen().stats().seconds') + seconds;
  await until(`__toy.oxygen().stats().seconds >= ${target}`, 'oxygen clock', Math.max(90000, seconds * 8000));
}
async function pauseSettled() {
  await evaluate('__toy.pause(true)');
  await delay(250); // Finish the already submitted GPU sample without taking a new step.
}
async function scene(id, options = {}) {
  await evaluate('__toy.pause(true)');
  await evaluate(`__toy.machine(${JSON.stringify(id)},${JSON.stringify(options)})`);
  await until(`__toy.machineState()?.ready && !__toy.stats().loading && __toy.machineState().definition.name === ${JSON.stringify(id)}`, id + ' machine readiness');
  await until('!!__toy.oxygen?.()', id + ' asynchronous oxygen controller');
  await evaluate('__toy.pause(false)');
  await advance(.5);
  const stats = await evaluate('__toy.stats()');
  assert.equal(stats.waterState, 'on', id + ' uses native GPU water');
  assert.ok(stats.smoke, id + ' uses the real airflow solver');
}
async function directBoot(id) {
  await send('Page.navigate', { url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${id}` });
  await until(`!!window.__toy && __toy.machineState()?.ready && !!__toy.oxygen?.() && !__toy.stats().loading && __toy.machineState().definition.name === ${JSON.stringify(id)}`, id + ' direct URL dependencies');
  await advance(.5);
}
async function measure(name, screenshot = false) {
  await evaluate('__toy.oxygen().capture(); true');
  const result = await evaluate(`(() => {
    const oxygen = __toy.oxygen(), s = oxygen.snapshot(), d = __toy.machineState().definition;
    const f = d.fire || d.draftBurner;
    function region(rect) {
      let total = 0, massKg = 0, count = 0, minimum = .209, maximum = 0;
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        const wx = (x + .5) * s.worldWidth / s.width, wy = (y + .5) * s.worldHeight / s.height, at = y * s.width + x;
        if (s.solid[at] || wx < rect.x || wx >= rect.x + rect.width || wy < rect.y || wy >= rect.y + rect.height) continue;
        const v = s.oxygen[at]; total += v; count++; minimum = Math.min(minimum, v); maximum = Math.max(maximum, v);
        if (s.oxygenMassKg) massKg += s.oxygenMassKg[at];
      }
      return { mean: count ? total / count : null, massKg:s.oxygenMassKg ? massKg : null, minimum, maximum, count };
    }
    let finite = true, inRange = true, speed = 0, solidCells = 0, minimum = Infinity, maximum = -Infinity, maxOutgoingFaceRate = 0, donorLimitedCells120Hz = 0;
    for (let i = 0; i < s.oxygen.length; i++) {
      finite = finite && Number.isFinite(s.oxygen[i]) && Number.isFinite(s.vx[i]) && Number.isFinite(s.vy[i]);
      // Concentration divides two independently transported Float32 fields.
      // Allow five parts per million absolute arithmetic drift, while the
      // independent mass-ledger and wall tests still require conservation.
      inRange = inRange && s.oxygen[i] >= -1e-7 && s.oxygen[i] <= .209 + 5e-6;
      minimum = Math.min(minimum, s.oxygen[i]); maximum = Math.max(maximum, s.oxygen[i]);
      if (s.solid[i]) solidCells++; else speed = Math.max(speed, Math.hypot(s.vx[i], s.vy[i]));
      if (!s.solid[i]) {
        const x = i % s.width, y = Math.floor(i / s.width), sx = s.width / s.worldWidth, sy = s.height / s.worldHeight;
        const outgoing = Math.max(s.vx[i], 0) * sx + Math.max(-s.vy[i], 0) * sy +
          (x > 0 ? Math.max(-s.vx[i - 1], 0) * sx : 0) +
          (y + 1 < s.height ? Math.max(s.vy[i + s.width], 0) * sy : 0);
        maxOutgoingFaceRate = Math.max(maxOutgoingFaceRate, outgoing);
        if (outgoing / 120 > .8) donorLimitedCells120Hz++;
      }
    }
    return { scene:d.name, oxygen:oxygen.stats(), fire:__toy.fire()?.stats() || null,
      near:region({x:f.x-24,y:f.y-24,width:48,height:48}),
      far:region({x:f.x-40,y:136,width:80,height:48}),
      chamber:region(d.vessels[0]?.rect || {x:0,y:0,width:s.worldWidth,height:s.worldHeight}),
      outside:region({x:72,y:80,width:104,height:240}),
      field:{width:s.width,height:s.height,seconds:s.seconds,revision:s.revision,finite,inRange,minimum,maximum,speed,solidCells,
        maxOutgoingFaceRate,maxDonorFraction120Hz:maxOutgoingFaceRate/120,donorLimitedCells120Hz},
      action:document.querySelector('.toy-scene-action[data-control="primary"]')?.getAttribute('aria-label') };
  })()`);
  reports.push({ name, ...result });
  assert.equal(result.oxygen.error, null, name + ' oxygen controller healthy');
  assert.equal(result.fire?.error || null, null, name + ' native fire healthy');
  assert.ok(result.field.finite && result.field.inRange, name + ' all transported cells finite and within oxygen bounds: ' + JSON.stringify(result.field));
  assert.ok(result.field.width >= 90 && result.field.height >= 50, name + ' resolves a spatial concentration field');
  for (const key of ['oxygenConsumedKg', 'oxygenInventoryKg', 'initialOxygenKg', 'oxygenSuppliedKg', 'oxygenEscapedKg', 'oxygenResidualKg', 'localOxygenFraction', 'heatReleaseW', 'seconds', 'fuelRemainingKg']) {
    assert.ok(Number.isFinite(result.oxygen[key]), name + ' finite ' + key);
  }
  const scale = Math.max(result.oxygen.initialOxygenKg, result.oxygen.oxygenSuppliedKg, 1e-8);
  assert.ok(Math.abs(result.oxygen.oxygenResidualKg) < scale * .0001 + 1e-10, name + ' conserved oxygen inventory, supply, escape and consumption');
  if (result.oxygen.seconds > 0) {
    assert.ok(Number.isFinite(result.oxygen.transportStepSeconds) && result.oxygen.transportStepSeconds > 0, name + ' adaptive transport uses a finite timestep');
    assert.ok(Number.isFinite(result.oxygen.maxDonorFraction) && result.oxygen.maxDonorFraction <= .75001, name + ' current projected airflow satisfies the adaptive donor Courant bound');
    assert.ok(Number.isInteger(result.oxygen.transportSubsteps) && result.oxygen.transportSubsteps > 0, name + ' adaptive transport records actual substeps');
  }
  console.log(name, JSON.stringify({ seconds:result.oxygen.seconds, local:result.oxygen.localOxygenFraction, near:result.near.mean, far:result.far.mean, release:result.oxygen.heatReleaseW, residual:result.oxygen.oxygenResidualKg }));
  if (screenshot) {
    if (await evaluate('__toy.oxygenView?.enabled()')) {
      await until('__toy.oxygenView.inspect().revision === __toy.oxygen().snapshot().revision', 'overlay paints the measured cached snapshot');
    }
    const shot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  return result;
}
async function primaryPoint() {
  const point = await evaluate(`(() => {const b = document.querySelector('.toy-scene-action[data-control="primary"]'),r = b?.getBoundingClientRect();return b && !b.hidden && r ? {x:r.x+r.width/2,y:r.y+r.height/2} : null;})()`);
  assert.ok(point, 'real primary control is visible');
  return point;
}
async function primary() {
  const point = await primaryPoint();
  await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', clickCount:1, ...point });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...point });
}
async function overlay(value) {
  assert.ok(await evaluate('typeof __toy.oxygenView?.toggle === "function"'), 'oxygen overlay has an ordinary host control');
  await evaluate(`__toy.oxygenView.toggle(${value})`);
}
async function fixedSteps(count) {
  for (let i = 0; i < count; i += 20) {
    const chunk = Math.min(20, count - i);
    await evaluate(`(() => {for (let i = 0; i < ${chunk}; i++) __toy.smoke().fluid.step(1 / 60);})()`);
  }
  await evaluate('__toy.oxygen().capture(); true');
}
async function cameraInventory() {
  return evaluate(`(async () => {
    const oxygen = __toy.oxygen(); oxygen.capture(); const s = oxygen.snapshot(), stats = oxygen.stats();
    async function digest(array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', array))).map(v => v.toString(16).padStart(2, '0')).join(''); }
    const hashes = await Promise.all([s.oxygen, s.oxygenMassKg, s.carrierVolumeM3, s.vx, s.vy, s.solid].map(digest));
    return {domain:__toy.smoke().domain,width:s.width,height:s.height,seconds:stats.seconds,
      consumed:stats.oxygenConsumedKg,inventory:stats.oxygenInventoryKg,hashes};
  })()`);
}
async function cameraInvariant() {
  const original = await evaluate('__toy.camera()');
  const before = await cameraInventory();
  assert.equal(before.domain.x, 0); assert.equal(before.domain.y, 0);
  assert.deepEqual(await evaluate('({w:__toy.smoke().domain.w,h:__toy.smoke().domain.h})'), await evaluate('({w:__toy.world().w,h:__toy.world().h})'), 'combustion airflow uses the full physical apparatus domain');
  await evaluate('__toy.setCamera({zoom:1.75,panX:80,panY:-40})');
  assert.deepEqual(await cameraInventory(), before, 'pan and zoom cannot move, reset or consume oxygen');
  await send('Emulation.setDeviceMetricsOverride', {width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await delay(150); await evaluate('__toy.resize()');
  assert.deepEqual(await cameraInventory(), before, 'viewport and toolbar height changes only crop the physical oxygen field');
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`__toy.setCamera(${JSON.stringify({zoom:original.zoom,panX:original.panX,panY:original.panY})})`);
  await delay(150);
  assert.deepEqual(await cameraInventory(), before, 'returning to the original view preserves every oxygen, gas mass and airflow cell');
  reports.push({name:'paused-camera-invariance',before});
}
// The production shader receives a known velocity and wall texture. This tests
// transport and reactions independently of differences between live trajectories.
function solverFixture(kind) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha:false, antialias:false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw Error('Float WebGL fixture unavailable');
  const width = 32, height = 32, W = 64, H = 64;
  const owned = [];
  function target() {
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, new Float32Array(width * height * 4));
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const t = { texture, fbo, width, height }; owned.push(t); return t;
  }
  function pair() { return { width, height, read:target(), write:target(), swap() { const t = this.read; this.read = this.write; this.write = t; } }; }
  const vao = gl.createVertexArray(), vertices = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const bridge = { gl, velocity:pair(), dye:pair(), obstacle:target(), wetActive:false,
    draw(t) { gl.bindVertexArray(vao); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.width, t.height); gl.drawArrays(gl.TRIANGLES, 0, 6); } };
  let hook, model;
  const fluid = { setGasTransport(value) { hook = value; return bridge; } };
  const wall = new Float32Array(width * height * 4), velocity = new Float32Array(wall.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (kind === 'wall' && (x === 0 || x === width - 1 || y === 0 || y === height - 1 || x === 16)) wall[i + 3] = 1;
    velocity[i] = kind === 'still' ? 0 : 4;
  }
  function upload(t, values) { gl.bindTexture(gl.TEXTURE_2D, t.texture); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, values); }
  upload(bridge.obstacle, wall);
  function step(count) {
    for (let i = 0; i < count; i++) { upload(bridge.velocity.read, velocity); hook(1 / 60, bridge); }
    model.capture();
  }
  function sample() {
    const s = model.snapshot(), stats = model.stats();
    let deficit = 0, centroid = 0, rightMin = .209;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = y * width + x; if (s.solid[at]) continue;
      const missing = Math.max(0, .209 - s.oxygen[at]); deficit += missing; centroid += (x + .5) * W / width * missing;
      if (x > 16) rightMin = Math.min(rightMin, s.oxygen[at]);
    }
    return { stats, deficit, centroid:centroid / Math.max(deficit, 1e-12), rightMin, oxygen:Array.from(s.oxygen), vx:Array.from(s.vx), vy:Array.from(s.vy) };
  }
  try {
    model = WSSOxygen.create({ fluid, width:W, height:H, scaleWidth:W, resolution:height,
      source:{x:16,y:28,width:8,height:8}, maxPowerW:1000, fuelMassKg:1 });
    model.prepare({ sourceC:900, smothered:false }); step(20);
    const reacted = sample(); model.setBurnerEnabled(false); step(60); const moved = sample();
    return { kind, reacted, moved, glError:gl.getError() };
  } finally {
    model?.destroy();
    for (const t of owned) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.fbo); }
    gl.deleteBuffer(vertices); gl.deleteVertexArray(vao); gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
async function cleanup() {
  for (const item of pending.values()) clearTimeout(item.timer);
  pending.clear(); try { socket?.close(); } catch {}
  server.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = new Promise(resolve => child.once('exit', resolve)); child.kill();
    const force = setTimeout(() => child.kill('SIGKILL'), 2000); await done; clearTimeout(force);
  }
  fs.rmSync(profile, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
}
function saveReports() {
  fs.writeFileSync(path.join(output, phase === 'all' ? 'measurements.json' : phase + '-measurements.json'), JSON.stringify({ phase, sourceSHA256, reports, errors }, null, 2) + '\n');
}
process.on('SIGINT', async () => { saveReports(); await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { saveReports(); await cleanup(); process.exit(143); });

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  child = spawn('/Users/ethan/.local/bin/agent-chrome-for-testing', [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio:'ignore' });
  let debug;
  for (let i = 0; i < 150; i++) {
    try { debug = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
    if (debug) break; await delay(100);
  }
  assert.ok(debug, 'owned Chrome for Testing starts');
  const tab = (await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(t => t.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id); if (!p) return;
      pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls:['*googletagmanager.com*', '*google-analytics.com*'] });
  await send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await send('Page.navigate', { url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=chimney-draw` });
  await until('!!window.__toy && __toy.machineState()?.ready && !!__toy.oxygen?.() && !__toy.stats().loading', 'initial combustion and transport readiness');

  if (phase === 'all' || phase === 'fixtures') {
  await pauseSettled(); await overlay(false);
  const fixture = await evaluate('(' + solverFixture.toString() + ')("moving")');
  await overlay(true);
  const fixtureViewed = await evaluate('(' + solverFixture.toString() + ')("moving")');
  assert.deepEqual(fixtureViewed, fixture, 'identical prescribed steps produce identical physics with overlay visible');
  const stillFixture = await evaluate('(' + solverFixture.toString() + ')("still")');
  const wallFixture = await evaluate('(' + solverFixture.toString() + ')("wall")');
  fs.writeFileSync(path.join(output, 'shader-fixtures.json'), JSON.stringify({ fixture, fixtureViewed, stillFixture, wallFixture }, null, 2) + '\n');
  for (const f of [fixture, stillFixture, wallFixture]) {
    assert.equal(f.glError, 0, f.kind + ' production oxygen shader has no GL error');
    assert.equal(f.moved.stats.error, null, f.kind + ' finite shader fixture');
    assert.ok(f.reacted.stats.oxygenConsumedKg > 0, f.kind + ' real reaction consumes oxygen');
    assert.equal(f.moved.stats.oxygenConsumedKg, f.reacted.stats.oxygenConsumedKg, f.kind + ' passive transport consumes no oxygen');
    assert.ok(Math.abs(f.moved.stats.oxygenResidualKg) < f.moved.stats.initialOxygenKg * .0001, f.kind + ' conservative shader ledger');
  }
  assert.ok(fixture.moved.centroid > stillFixture.moved.centroid + 2, 'prescribed airflow advects oxygen depletion farther than molecular diffusion alone');
  assert.ok(wallFixture.moved.rightMin > .20899, 'closed production mask prevents oxygen depletion crossing the wall');
  reports.push({ name:'prescribed-shader-fixtures', fixture, stillFixture, wallFixture });
  await overlay(false);
  }

  if (phase === 'all' || phase === 'candle') {
  await scene('candle-in-jar'); await advance(5);
  const sealed = await measure('desktop-candle-sealed');
  assert.ok(sealed.oxygen.oxygenConsumedKg > 0, 'sealed candle consumes actual transported oxygen');
  assert.ok(sealed.near.minimum < .205 && sealed.far.mean > sealed.near.minimum + .002, 'oxygen depletion is spatial around the flame');
  assert.ok(sealed.outside.mean > .207, 'sealed jar walls protect unrelated room oxygen from the flame');
  assert.ok(sealed.field.speed > 0, 'oxygen moves with a nonzero sampled real airflow');
  await pauseSettled();
  await evaluate('__toy.oxygen().capture(); true');
  const frozen = await evaluate('({stats:__toy.oxygen().stats(),field:Array.from(__toy.oxygen().snapshot().oxygen)})');
  await overlay(true); await delay(350);
  const viewed = await evaluate('({stats:__toy.oxygen().stats(),field:Array.from(__toy.oxygen().snapshot().oxygen)})');
  assert.deepEqual(viewed, frozen, 'overlay toggling reads cached oxygen and cannot consume or transport it');
  await cameraInvariant();
  const beforePassive = await measure('desktop-candle-oxygen-overlay', true);
  await overlay(false);
  await evaluate('__toy.oxygen().setBurnerEnabled(false)');
  await fixedSteps(300);
  const wall = await measure('desktop-candle-passive-sealed');
  assert.ok(Number.isFinite(wall.chamber.massKg), 'cached per-cell oxygen mass supports physical chamber conservation checks');
  assert.ok(Math.abs(wall.chamber.massKg - beforePassive.chamber.massKg) < beforePassive.chamber.massKg * .0001, 'actual sealed jar walls have zero net oxygen mass flux during passive transport');
  assert.equal(wall.oxygen.oxygenConsumedKg, frozen.stats.oxygenConsumedKg, 'disabling the burner stops reaction without stopping airflow');
  await primary(); await fixedSteps(300);
  const ventilated = await measure('desktop-candle-passive-opened');
  assert.ok(ventilated.chamber.massKg > wall.chamber.massKg, 'opening the real lid lets airflow transport fresh oxygen mass into the previously sealed chamber');
  await evaluate('__toy.pause(false)');
  await scene('candle-in-jar', { opened:true }); await advance(5);
  const openCandle = await measure('desktop-candle-open');
  assert.ok(openCandle.oxygen.oxygenSuppliedKg > 0, 'open jar actually imports ambient oxygen');
  assert.ok(openCandle.oxygen.oxygenConsumedKg > 0 && openCandle.oxygen.heatReleaseW > 1, 'open candle consumes transported oxygen and releases heat');

  await scene('candle-in-jar');
  await until('__toy.oxygen().stats().extinguished', 'sealed candle oxygen starvation and finite wick cooling', 180000);
  const extinguished = await measure('desktop-candle-extinguished', true);
  assert.ok(extinguished.oxygen.oxygenConsumedKg > 0 && !extinguished.fire.burning, 'sealed oxygen depletion eventually stops the real candle reaction');
  assert.ok(extinguished.oxygen.incomingOxygenFraction < .18 && extinguished.oxygen.fuelRemainingKg > .001, 'sealed candle goes out after incoming oxygen depletion while wax remains');
  const extinguishedAt = extinguished.oxygen.seconds;
  const spentOxygen = extinguished.oxygen.oxygenConsumedKg;
  await primary(); await advance(5);
  const openedCold = await measure('desktop-candle-opened-after-extinction');
  assert.equal(openedCold.oxygen.oxygenConsumedKg, spentOxygen, 'fresh air cannot spontaneously reignite an extinguished cold wick');
  assert.equal(openedCold.fire.burning, false, 'candle stays out after the lid is lifted');
  await scene('candle-in-jar', { opened:true });
  const openTarget = extinguishedAt + 5;
  await until(`__toy.oxygen().stats().seconds >= ${openTarget}`, 'open control at the observed sealed extinction age', 180000);
  const sustained = await measure('desktop-candle-open-control-sustained');
  assert.ok(sustained.fire.burning && !sustained.oxygen.extinguished && sustained.oxygen.heatReleaseW > 1, 'real ventilation sustains the open control beyond the sealed candle extinction age');
  assert.ok(sustained.oxygen.incomingOxygenFraction > extinguished.oxygen.incomingOxygenFraction, 'ventilation maintains more incoming oxygen at the observed sealed extinction age');
  }

  if (phase === 'all' || phase === 'chimney') {
  await scene('chimney-draw'); await advance(10);
  const open = await measure('desktop-chimney-open');
  await pauseSettled();
  const beforeClose = await evaluate('Array.from(__toy.oxygen().snapshot().oxygen)');
  await primary();
  assert.deepEqual(await evaluate('Array.from(__toy.oxygen().snapshot().oxygen)'), beforeClose, 'closing inlet changes geometry without a fake immediate oxygen decrement');
  await overlay(true); await evaluate('__toy.pause(false)'); await advance(15);
  const closed = await measure('desktop-chimney-closed-overlay', true);
  assert.ok(closed.oxygen.localOxygenFraction < open.oxygen.localOxygenFraction, 'closed inlet reduces local transported oxygen');
  assert.ok(closed.oxygen.heatReleaseW < open.oxygen.heatReleaseW, 'oxygen-limited reaction reduces heat release');
  assert.equal(closed.fire.quenchEvents, 0, 'oxygen restriction does not fake water quenching');
  await primary(); await advance(15);
  const reopened = await measure('desktop-chimney-reopened-overlay', true);
  assert.ok(reopened.oxygen.localOxygenFraction > closed.oxygen.localOxygenFraction, 'reopening transports fresh oxygen back to the fire');
  assert.ok(reopened.oxygen.heatReleaseW > closed.oxygen.heatReleaseW, 'reopening sustains the hot fuel reaction');
  await overlay(false);
  }

  if (phase === 'all' || phase === 'other') {
  for (const id of ['douse-fire', 'fire-brigade', 'slime-sauna', 'oil-slick-fire']) {
    await directBoot(id); await advance(2);
    const burner = await measure('desktop-' + id);
    assert.ok(burner.oxygen.oxygenConsumedKg > 0 && burner.oxygen.fuelRemainingKg >= 0, id + ' shares real spatial oxygen consumption');
    if (id === 'douse-fire') {
      const point = await primaryPoint();
      await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', buttons:1, clickCount:1, ...point });
      try { await until('__toy.fire().stats().quenchEvents > 0', 'real held-pour water quench'); }
      finally { await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', buttons:0, clickCount:1, ...point }); }
      const wet = await measure('desktop-douse-fire-water-quench');
      assert.ok(wet.fire.sourceToWaterJ > 0, 'native water retains conserved source heat transfer');
    }
  }
  for (const id of ['heron-air-smoke', 'sewer-gas-trap']) {
    await evaluate(`__toy.machine(${JSON.stringify(id)},{})`);
    await until(`__toy.machineState()?.ready && !__toy.stats().loading && __toy.machineState().definition.name === ${JSON.stringify(id)}`, id + ' passive readiness');
    assert.equal(await evaluate('__toy.oxygen()'), null, id + ' passive tracers have no fake combustion');
  }
  }

  if (phase === 'all' || phase === 'mobile') {
  await send('Emulation.setDeviceMetricsOverride', { width:844, height:390, deviceScaleFactor:2, mobile:true });
  await send('Emulation.setTouchEmulationEnabled', { enabled:true });
  await scene('chimney-draw'); await advance(4); await pauseSettled(); await overlay(true);
  await measure('mobile-chimney-oxygen-overlay', true);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'landscape overlay does not overflow the viewport');
  await scene('candle-in-jar'); await advance(4); await pauseSettled(); await overlay(true);
  await measure('mobile-candle-oxygen-overlay', true);
  }
  assert.deepEqual(errors, [], 'no JavaScript or shader errors across all combustion and passive scenes');
  console.log('PASS oxygen transport test phase: ' + phase);
  console.log('Artifacts ' + output);
} finally {
  saveReports();
  await cleanup();
}
