#!/usr/bin/env node
// Node 22+: BASE_REF=f392c72 DUMP=/tmp/smoke-results.json node tools/perf/smoke-equivalence.cjs
// Uses the existing Chrome for Testing shim; creates no server or fixed debugging port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const baseRef = process.env.BASE_REF || 'f392c72';
const fragment = 'js/sluice/190-smoke-webgl.js';
const output = process.env.DUMP || path.join('/tmp', `sluice-smoke-equivalence-${process.pid}.json`);
assert.equal(typeof WebSocket, 'function', 'This harness requires Node 22 or newer');
function extract(source) {
  const end = source.indexOf('  // ====== Smoke:');
  assert(end > 0, 'SmokeFluid closure boundary missing');
  return source.slice(0, end);
}
const original = extract(execFileSync('git', ['show', `${baseRef}:${fragment}`], { cwd: root, encoding: 'utf8' }));
const optimized = extract(fs.readFileSync(path.join(root, fragment), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs entirely inside the browser. The small grids make exact regression checks
// quick; timings include readback and are not a benchmark of game frame rates.
function compareSmoke(original, optimized) {
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  function run(source, profile) {
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 128; document.body.appendChild(canvas);
    const nativeGet = canvas.getContext.bind(canvas);
    let gl, liveTextures = 0, liveFramebuffers = 0, bufferUploadBytes = 0;
    const counts = {}, snapshots = [];
    canvas.getContext = function (type, opts) {
      if (profile.webgl1 && type === 'webgl2') return null;
      gl = nativeGet(type, opts);
      if (!gl) return null;
      const nativeExt = gl.getExtension.bind(gl);
      gl.getExtension = name => profile.manual && /texture_.*float_linear/.test(name) ? null : nativeExt(name);
      const names = ['activeTexture', 'bindTexture', 'viewport', 'uniform1i', 'uniform1f', 'uniform2f', 'uniform3f',
        'useProgram', 'bindFramebuffer', 'drawElements', 'drawArrays', 'texImage2D', 'texSubImage2D',
        'bufferData', 'bufferSubData', 'createTexture', 'deleteTexture', 'createFramebuffer', 'deleteFramebuffer'];
      for (const name of names) {
        const fn = gl[name].bind(gl);
        gl[name] = (...args) => {
          counts[name] = (counts[name] || 0) + 1;
          if (name === 'createTexture') liveTextures++;
          if (name === 'deleteTexture') liveTextures--;
          if (name === 'createFramebuffer') liveFramebuffers++;
          if (name === 'deleteFramebuffer') liveFramebuffers--;
          if (name === 'bufferData' && typeof args[1] !== 'number') bufferUploadBytes += args[1].byteLength;
          if (name === 'bufferSubData') bufferUploadBytes += args.length > 4 ? args[4] * args[2].BYTES_PER_ELEMENT : args[2].byteLength;
          return fn(...args);
        };
      }
      return gl;
    };
    try {
      const smoke = new Function(source + '\nreturn SmokeFluid;')();
      if (!smoke.init(canvas, { SIM_RESOLUTION: 64, DYE_RESOLUTION: 128, SHADING: profile.shading,
        PRESSURE_ITERATIONS: profile.iters })) throw Error('Smoke context unavailable: ' + JSON.stringify(profile));
      const obstacle = document.createElement('canvas');
      obstacle.width = 96; obstacle.height = 64;
      const ctx = obstacle.getContext('2d'), vertices = new Float32Array(8192);
      vertices.set([-1, -1, 1, -1, -1, -0.7, 1, -1, 1, -0.7, -1, -0.7]);
      function snapshot(frame) {
        smoke.displayPass();
        const bytes = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        let hash = 2166136261, nonzero = 0;
        for (const b of bytes) { hash = Math.imul(hash ^ b, 16777619) >>> 0; if (b) nonzero++; }
        snapshots.push({ frame, hash, nonzero, bytes });
        const err = gl.getError();
        if (err) throw Error(`WebGL error ${err} at frame ${frame}`);
      }
      const started = performance.now();
      for (let i = 0; i < 48; i++) {
        if (i === 24) { smoke.resize(160, 144); obstacle.width = 80; obstacle.height = 72; }
        if (profile.mask === 'quads') smoke.paintObstacleQuads(vertices, i === 22 ? 0 : 6, obstacle.width, obstacle.height);
        else {
          ctx.clearRect(0, 0, obstacle.width, obstacle.height);
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.fillRect(0, obstacle.height * .83, obstacle.width, obstacle.height * .17);
          ctx.beginPath(); ctx.arc(obstacle.width * .64, obstacle.height * .35, 4 + i % 3, 0, Math.PI * 2);
          ctx.fill(); smoke.setObstacleAlpha(obstacle);
        }
        if (i === 12) smoke.clearObstacle();
        if (i === 16) smoke.clear();
        if (i % 3 === 0) smoke.scroll(.002, -.001);
        smoke.config.wind_x = Math.sin(i * .3) * .1; smoke.config.wind_above_y = .4;
        smoke.splat(.4 + Math.sin(i * .16) * .04, .35 + Math.cos(i * .08) * .025,
          2 + Math.sin(i * .5), 6, { r: .18, g: .12, b: .09 }, .18);
        smoke.splatVelocity(.6, .28, Math.sin(i * .7) * 1.3, .8, .24);
        smoke.step(i % 7 === 0 ? 1 / 30 : 1 / 60);
        if ([0, 7, 15, 23, 24, 31, 47].includes(i)) snapshot(i);
      }
      gl.finish();
      const durationMs = performance.now() - started;
      for (let i = 0; i < 4; i++) smoke.resize(100 + i * 7, 100 + i * 3);
      return { counts, bufferUploadBytes, snapshots, durationMs, afterFiveResizes: { liveTextures, liveFramebuffers } };
    } finally {
      if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    }
  }
  const profiles = [
    { webgl1: false, manual: false, shading: false, iters: 17, mask: 'canvas' },
    { webgl1: false, manual: false, shading: true, iters: 13, mask: 'quads' },
    { webgl1: true, manual: false, shading: true, iters: 25, mask: 'quads' },
    { webgl1: true, manual: true, shading: false, iters: 17, mask: 'canvas' },
  ];
  const report = [];
  for (const profile of profiles) {
    const baseline = run(original, profile), current = run(optimized, profile), checkpoints = [];
    for (let i = 0; i < baseline.snapshots.length; i++) {
      const a = baseline.snapshots[i], b = current.snapshots[i];
      if (a.bytes.length !== b.bytes.length) throw Error('Render dimensions differ');
      for (let j = 0; j < a.bytes.length; j++) {
        if (a.bytes[j] !== b.bytes[j]) throw Error(`Pixel mismatch: ${JSON.stringify(profile)}, frame ${a.frame}, byte ${j}: ${a.bytes[j]} -> ${b.bytes[j]}`);
      }
      checkpoints.push({ frame: a.frame, hash: a.hash, nonzero: a.nonzero, comparedBytes: a.bytes.length });
    }
    if (!checkpoints.some(c => c.nonzero > 0)) throw Error('Smoke rendered no visible pixels');
    delete baseline.snapshots; delete current.snapshots;
    report.push({ profile, checkpoints, baseline, current });
  }
  if (errors.length) throw Error(errors.join('\n'));
  return report;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-smoke-chrome-'));
  const chrome = spawn(path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'),
    ['--headless=new', '--use-angle=metal', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let launchError, socket;
  chrome.on('error', error => { launchError = error; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20000;
    while (!fs.existsSync(portFile)) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null || Date.now() > deadline) throw Error('Chrome for Testing did not become ready');
      await pause(50);
    }
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = tabs.find(tab => tab.type === 'page');
    assert(page, 'Chrome page target missing');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Smoke regression check timed out')), 120000);
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) reject(Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      socket.addEventListener('close', () => { clearTimeout(timeout); reject(Error('Chrome connection closed')); }, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(${compareSmoke.toString()})(${JSON.stringify(original)},${JSON.stringify(optimized)})`,
      returnByValue: true, awaitPromise: true,
    } }));
    const result = await response;
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const report = { baseRef, profiles: result.result.value };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    for (const { profile, baseline, current } of report.profiles) {
      console.log(`${JSON.stringify(profile)}: sampler calls ${baseline.counts.uniform1i} -> ${current.counts.uniform1i}, uploaded vertex bytes ${baseline.bufferUploadBytes} -> ${current.bufferUploadBytes}`);
    }
    console.log(`PASS: byte-identical smoke at 28 checkpoints across WebGL2/WebGL1, shading, manual filtering, masks, scroll, clear, and resize. Results: ${output}`);
  } finally {
    socket?.close();
    if (chrome.exitCode === null && chrome.signalCode === null && chrome.pid) {
      const stopped = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      await Promise.race([stopped, pause(3000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await stopped; }
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
