#!/usr/bin/env node
// Transfer conservation and six-material GPU identity regression.
// node tools/perf/liquid-materials.mjs
// node tools/perf/liquid-materials.mjs --gpu
// --gpu uses the owner's safe Chrome-for-Testing shim, a private profile,
// and an owned HTTP server. It never touches the personal browser.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') + '/';
const source = file => fs.readFileSync(root + file, 'utf8');
function getFunction(text, name) {
  const start = text.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name + ' exists in the production fragment');
  return text.slice(start, text.indexOf('\n  }', start) + 4);
}
const state = {
  console, Math, Number, isFinite, liquidWGPU: null, snowScoop: () => 0, snow: { collected: 0 },
  LIQUID_MAX_PARTICLES: 3000, LIQUID_OPS_MAX: 100000,
  LIQUID_MAX_VEL: 740, LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5,
  LIQUID_DENSITY: 4, TILE: 32, liquidCount: 0, liquidMutationSeq: 0,
  liquidOps: [], liquidOpsOverflow: false,
  liquidWorldSolidAt: (x, y) => x >= 90 && x <= 100
};
for (const key of ['Type', 'Origin', 'X', 'Y', 'VX', 'VY', 'G00', 'G01', 'G10', 'G11',
  'Density', 'Aeration', 'Sleeping', 'Frozen', 'RestFrames', 'PrevX', 'PrevY',
  'LX', 'LY', 'PVX', 'PVY', 'GX', 'GY', 'DX', 'DY']) {
  state['liquid' + key] = new Float64Array(3000);
}
const context = vm.createContext(state);
vm.runInContext(
  getFunction(source('js/sluice/030-worldgen.js'), 'addLiquidParticle') +
  getFunction(source('js/sluice/070-collision-liquids.js'), 'removeLiquidParticle') +
  getFunction(source('js/sluice/070-collision-liquids.js'), 'liquidLineClear') +
  source('js/sluice/071-liquid-catalog.js'), context
);
// Extracting a mixed puddle and pouring it back must conserve EACH material.
for (let type = 0; type < 5; type++) {
  for (let n = 0; n < 80; n++) {
    context.addLiquidParticle(type, 10 + (n % 10) * 1.25,
      10 + Math.floor(n / 10) * 1.25, 0, 0, 0);
  }
}
const sample = () => Array.from(context.liquidSampleRect(0, 0, 80, 80));
const before = sample();
const taken = Array.from(context.liquidToolExtract(15, 15, 30, 127));
assert.equal(taken.reduce((a, b) => a + b), 127);
assert.equal(context.liquidCount, 273);
assert.deepEqual(sample().map((count, i) => count + taken[i]), before);
for (let type = 0; type < 5; type++) {
  assert.equal(context.liquidToolEmit(type, taken[type], 45, 30, 100, 10), taken[type]);
}
assert.equal(context.liquidCount, 400);
assert.deepEqual(sample(), before);
// An embedded nozzle must keep the entire attempted pour in its tank.
assert.equal(context.liquidToolEmit(4, 200, 95, 30, 0, 100), 0);
assert.equal(context.liquidCount, 400);
// The far-side particle is in range but separated by a wall.
context.addLiquidParticle(4, 130, 15, 0, 0, 0);
const unobstructed = context.liquidToolExtract(80, 15, 80, 2048);
assert.equal(unobstructed[4], 80);
assert.equal(context.liquidCount, 1);
assert.equal(context.liquidX[0], 130);
assert.equal(context.liquidExtractRect(100, 0, 160, 40, 4, 1500), 1);
assert.equal(context.liquidCount, 0);
// The under-rig ellipse takes nearby puddles, but its line of sight must
// start at the chassis, not at the ellipse centre on the far side of a wall.
context.addLiquidParticle(2, 115, 15, 0, 0, 0);
assert.deepEqual(Array.from(context.liquidToolExtract(115, 15, 42, 20,
  { ry: 38, fromX: 80, fromY: 15 })), [0, 0, 0, 0, 0]);
assert.equal(context.liquidCount, 1);
context.liquidExtractRect(100, 0, 160, 40, 2, 20);
context.addLiquidParticle(0, 30, 8, 0, 0, 0);
context.addLiquidParticle(3, 30, 40, 0, 0, 0);
assert.deepEqual(Array.from(context.liquidToolExtract(30, 40, 42, 20,
  { ry: 20, fromX: 30, fromY: 20 })), [0, 0, 0, 1, 0]);
assert.equal(context.liquidY[0], 8, 'liquid above the scoop stays put');
context.liquidExtractRect(0, 0, 80, 80, 0, 20);
context.mineralLiquidParkedSampleRect = () => [10, 0, 20, 30, 40];
assert.deepEqual(sample(), [10, 0, 20, 30, 40]);
console.log('PASS: mixed-liquid transfer conservation, blocked nozzle, wall line of sight, bounded harvest and parked sampling.');

if (process.argv.includes('--gpu')) await checkGPU();

async function checkGPU() {
  const port = Number(process.env.PORT || 8256);
  const debugPort = port + 1000;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-liquid-materials-'));
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
  const chrome = spawn(process.env.CHROME || path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'
  ], { stdio: 'ignore' });
  let ws, sequence = 0;
  const pending = new Map(), errors = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const stop = () => { try { ws?.close(); } catch {} chrome.kill(); server.kill(); };
  process.on('exit', stop);
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
      pending.set(id, result => { clearTimeout(timer); resolve(result); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  try {
    let endpoint;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
        if (endpoint) break;
      } catch {}
      await sleep(200);
    }
    assert.ok(endpoint, 'Chrome for Testing exposes its private CDP endpoint');
    ws = new WebSocket(endpoint);
    await new Promise(resolve => { ws.onopen = resolve; });
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        pending.get(message.id)?.(message.result);
        pending.delete(message.id);
      } else if (message.method === 'Runtime.exceptionThrown') {
        errors.push(message.params.exceptionDetails.text);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
      }
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__materialShaderErrors = [];
      if (window.GPUDevice) {
        var original = GPUDevice.prototype.createShaderModule;
        GPUDevice.prototype.createShaderModule = function (descriptor) {
          var module = original.call(this, descriptor);
          module.getCompilationInfo().then(function (info) {
            info.messages.forEach(function (message) {
              if (message.type === 'error') window.__materialShaderErrors.push(message.message);
            });
          });
          return module;
        };
      }
    ` });
    await send('Page.navigate', {
      url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&pondtest=2&nopause=1`
    });
    const ready = await evaluate(`(async function () {
      for (var attempt = 0; attempt < 100; attempt++) {
        var l = window.LiquidWGPU && LiquidWGPU.last;
        var loading = window.SluiceLoading && SluiceLoading.active();
        if (!loading && l && l.simActive && l.renderActive && l.liquid.getCount() > 100) return true;
        await new Promise(function (resolve) { setTimeout(resolve, 500); });
      }
      return false;
    })()`);
    assert.ok(ready, 'loading warmup completes and a real GPU pond is live');
    await sleep(8000);
    const seeded = await evaluate(`(function () {
      var l = window.LiquidWGPU && LiquidWGPU.last;
      if (!l || !l.simActive || !l.renderActive || !l.surfReady) return null;
      l.syncReadback();
      var a = l.liquid.arrays, n = l.liquid.getCount();
      // Advance the host mutation identity so an older pending readback
      // cannot overwrite the deliberately changed material fixture.
      var originalSequence = l.liquid.getMutationSeq;
      l.liquid.getMutationSeq = function () { return originalSequence() + 1; };
      // Keep this solver fixture outside the surface-pond litter collector.
      for (var i = 0; i < n; i++) { a.type[i] = i % 6; a.origin[i] = 3; }
      l.residentSeeded = false;
      return n;
    })()`);
    assert.ok(seeded > 100, 'live pond fixture must contain particles');
    await sleep(7000);
    const result = await evaluate(`(function () {
      var l = LiquidWGPU.last, a = l.liquid.arrays, n = l.liquid.getCount();
      var types = [0, 0, 0, 0, 0, 0], bad = 0, nonfinite = 0;
      for (var i = 0; i < n; i++) {
        types[a.type[i]]++;
        if (a.type[i] !== i % 6) bad++;
        if (!isFinite(a.x[i]) || !isFinite(a.y[i]) || !isFinite(a.vx[i]) || !isFinite(a.vy[i])) nonfinite++;
      }
      return { count: n, types: types, bad: bad, nonfinite: nonfinite,
        sim: l.simActive, render: l.renderActive, surface: l.surfReady,
        pigment: !!l.surfPigmentTex, shaders: window.__materialShaderErrors };
    })()`);
    assert.deepEqual(errors, [], 'no game runtime errors');
    assert.deepEqual(result.shaders, [], 'all actual GPU shaders compile');
    assert.ok(result.sim && result.render && result.surface && result.pigment, 'GPU physics and material surface path stay live');
    assert.equal(result.count, seeded, 'GPU fixture conserves particles');
    assert.equal(result.bad, 0, 'every material survives packing, G2P, sleep flags, collision and readback');
    assert.equal(result.nonfinite, 0, 'all mixed-liquid positions and velocities remain finite');
    assert.ok(result.types.every(count => count > 0), 'all five liquids and snow coexist');
    console.log(`PASS: real WebGPU shaders and ${result.count} mixed particles retain identity: ${result.types.join(', ')}.`);
  } finally {
    stop();
    process.removeListener('exit', stop);
    await sleep(750);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  }
}
