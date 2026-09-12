#!/usr/bin/env node
// Node 22+: node tools/perf/smoke-moving-boundary.cjs
// Uses the existing Chrome for Testing shim; creates no server or fixed debugging port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = process.env.DUMP || path.join('/tmp', `sluice-smoke-moving-${process.pid}.json`);
assert.equal(typeof WebSocket, 'function', 'This harness requires Node 22 or newer');
const source = fs.readFileSync(path.join(root, 'js/sluice/190-smoke-webgl.js'), 'utf8').split('  // ====== Smoke:')[0];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Finite cloud, no ongoing emissions, no density dissipation. Measure all dye
// with occlusion temporarily disabled so a hidden hole cannot pass as conserved
// smoke. Translation must also move the cloud, proving actual air coupling.
function testMovingSmoke(source) {
  const errors = [], report = [];
  console.error = (...args) => errors.push(args.join(' '));
  function check(ok, message) { if (!ok) throw Error(message); }
  for (const profile of [{}, { webgl1: true }, { webgl1: true, manual: true }]) {
    const results = {};
    for (const mode of ['none', 'eraser', 'moving', 'stationary', 'deforming', 'fast']) {
      const canvas = document.createElement('canvas');
      canvas.width = 384; canvas.height = 256;
      const getContext = canvas.getContext.bind(canvas);
      let gl, arrays = 0, fullscreen = 0;
      canvas.getContext = (kind, options) => {
        if (profile.webgl1 && kind === 'webgl2') return null;
        gl = getContext(kind, options);
        if (!gl) return gl;
        const ext = gl.getExtension.bind(gl);
        gl.getExtension = name => profile.manual && /texture_.*float_linear/.test(name) ? null : ext(name);
        const da = gl.drawArrays.bind(gl), de = gl.drawElements.bind(gl);
        gl.drawArrays = (...args) => { arrays++; return da(...args); };
        gl.drawElements = (...args) => { fullscreen++; return de(...args); };
        return gl;
      };
      // Test-only access to dye without visual occlusion; never shipped in the API.
      const instrumented = source.replace('      init: init,', `
        sample: function () {
          var active = movingActive, obstacle = obstacleSrcCanvas;
          movingActive = false; obstacleSrcCanvas = null;
          displayPass();
          movingActive = active; obstacleSrcCanvas = obstacle;
          var bytes = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          return bytes;
        }, init: init,`);
      const smoke = new Function(instrumented + '\nreturn SmokeFluid;')();
      try {
        check(smoke.init(canvas, { SIM_RESOLUTION: 96, DYE_RESOLUTION: 192,
          CURL: 14, DENSITY_DISSIPATION: 0, VELOCITY_DISSIPATION: .02, SHADING: false }), 'No WebGL');
        const b = { ringN: 48, ring: Array.from({ length: 48 }, (_, i) => i), px: new Float32Array(48), py: new Float32Array(48) };
        const mask = document.createElement('canvas'); mask.width = 384; mask.height = 256;
        const ctx = mask.getContext('2d');
        for (let x = .3; x < .8; x += .07) for (let y = .34; y < .67; y += .07)
          smoke.splat(x, y, 0, 0, { r: .035, g: .035, b: .035 }, .4);
        function measure() {
          const bytes = smoke.sample(); let sum = 0, mx = 0;
          for (let i = 0; i < bytes.length; i += 4) {
            sum += bytes[i]; mx += bytes[i] * (i / 4 % 384 + .5) / 384;
          }
          check(!gl.getError(), 'GL error: ' + JSON.stringify(profile) + mode);
          return { sum, x: mx / sum };
        }
        const start = measure();
        check(start.sum > 0, 'Reference cloud was blank');
        const callsStart = { arrays, fullscreen };
        for (let f = 0; f < 120; f++) {
          let cx = mode === 'stationary' ? 180 : 50 + f * 2.35;
          if (mode === 'fast') cx = 192 + Math.sin(f * .12) * 125;
          const deform = mode === 'deforming' ? 1 + Math.sin(f * .15) * .25 : 1;
          for (let i = 0; i < b.ringN; i++) {
            const a = i / b.ringN * Math.PI * 2;
            b.px[i] = cx + Math.cos(a) * 28 * deform;
            b.py[i] = 128 + Math.sin(a) * 28 / deform;
          }
          if (mode === 'eraser') {
            ctx.clearRect(0, 0, 384, 256); ctx.beginPath(); ctx.arc(cx, 128, 28, 0, Math.PI * 2); ctx.fill();
            smoke.setObstacleAlpha(mask);
          } else if (mode !== 'none') smoke.setMovingBodies([b], 0, 0, 384, 256, 1 / 60, 384, 256);
          smoke.step(1 / 60);
        }
        const end = measure();
        results[mode] = { retention: end.sum / start.sum, drift: end.x - start.x,
          arrays: arrays - callsStart.arrays, fullscreen: fullscreen - callsStart.fullscreen };
        // Removed bodies and scene resets must leave neither occlusion nor
        // stored velocity. Repeated resize must also restore the quad state.
        smoke.setMovingBodies([], 0, 0, 384, 256, 1 / 60, 384, 256);
        smoke.clear(); check(measure().sum === 0, 'Clear left dye');
        for (let i = 0; i < 3; i++) {
          smoke.resize(320 + i * 8, 256);
          smoke.setMovingBodies([b], 0, 0, 384, 256, 1 / 60, 300 + i * 8, 200);
          smoke.splat(.4, .3, 2, 4, { r: .1, g: .1, b: .1 }, .2);
          smoke.step(1 / 60); smoke.displayPass();
          check(!gl.getError(), 'Resize broke moving boundary');
        }
      } finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    check(results.none.retention > .99, 'Reference cloud decayed');
    check(results.eraser.retention < .55, 'Old eraser reproduction failed: ' + JSON.stringify({profile,results}));
    check(results.moving.retention > .82, 'Translating slime lost smoke');
    check(results.deforming.retention > .80, 'Deforming slime lost smoke');
    check(results.fast.retention > .65, 'Fast repeated crossings erased smoke');
    for (const mode of ['moving', 'deforming', 'fast'])
      check(results[mode].retention < 1.12, mode + ' artificially amplified smoke');
    check(results.stationary.retention > .99, 'Stationary slime consumed smoke');
    check(results.moving.drift > .015, 'Slime did not impart motion to smoke');
    check(results.moving.fullscreen === results.none.fullscreen, 'Added fullscreen passes');
    check(results.moving.arrays === 120, 'Boundary was not batched into one draw per frame');
    report.push({ profile, results });
  }
  check(!errors.length, errors.join('\n'));
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
      expression: `(${testMovingSmoke.toString()})(${JSON.stringify(source)})`,
      returnByValue: true, awaitPromise: true,
    } }));
    const result = await response;
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const report = { profiles: result.result.value };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    for (const p of report.profiles) console.log(JSON.stringify(p));
    console.log(`PASS: smoke retention, momentum transfer, deformation, fast drags, clear/resize and bounded draw cost on WebGL2/WebGL1/manual filtering. Results: ${output}`);
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
