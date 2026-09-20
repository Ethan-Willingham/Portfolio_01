#!/usr/bin/env node
// Node 22+: node tools/perf/smoke-physics.cjs
// Readbacks and probe shaders exist only in this harness, never in the game.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = process.env.DUMP || path.join(os.tmpdir(), `sluice-smoke-physics-${process.pid}.json`);
assert.equal(typeof WebSocket, 'function', 'This harness requires Node 22 or newer');
const source = fs.readFileSync(path.join(root, 'js/sluice/190-smoke-webgl.js'), 'utf8').split('  // ====== Smoke:')[0];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function testPhysics(source) {
  const report = [], errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  function check(ok, label) { if (!ok) throw Error(label); }
  const zero = { HEAT: 0, COOLING: 0, BUOYANCY: 0, WEIGHT: 0, VISCOSITY: 0, EDGE_SPIN: 0 };
  for (const profile of [{}, { webgl1: true }, { webgl1: true, manual: true }]) {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 256;
    document.body.appendChild(canvas);
    const context = canvas.getContext.bind(canvas);
    const allocations = { createTexture: 0, createFramebuffer: 0, createProgram: 0 };
    let gl;
    canvas.getContext = (kind, opts) => {
      if (profile.webgl1 && kind === 'webgl2') return null;
      gl = context(kind, opts); if (!gl) return gl;
      const ext = gl.getExtension.bind(gl);
      gl.getExtension = name => profile.manual && /texture_.*float_linear/.test(name) ? null : ext(name);
      for (const key of Object.keys(allocations)) {
        const fn = gl[key].bind(gl);
        gl[key] = (...args) => { allocations[key]++; return fn(...args); };
      }
      return gl;
    };
    const instrumented = source.replace('      init: init,', `
      probe: function(mode) {
        if (!this._probeProgram) this._probeProgram = new Program(
          compileShader(gl.VERTEX_SHADER, BASE_VS),
          compileShader(gl.FRAGMENT_SHADER,
            'precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D field; uniform float mode; void main(){vec4 v=texture2D(field,vUv); float m=mode<0.5?v.r:(mode<1.5?v.a*0.25:length(v.xy)*0.005); gl_FragColor=mode<2.5?vec4(m,m,m,1.0):vec4(v.xy*0.005+0.5,0.0,1.0);}')
        );
        var p=this._probeProgram;p.bind();gl.disable(gl.BLEND);
        gl.uniform1i(p.uniforms.field,(mode<1.5?dye.read:velocity.read).attach(0));
        gl.uniform1f(p.uniforms.mode,mode);blit(null);
        var bytes=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
      },
      identity: function(){return [canvas,gl,dye.read.texture,dye.write.texture,velocity.read.texture,velocity.write.texture,pressure.read.texture,pressure.write.texture];},
      coverage: function(kind, amount) {
        movingActive=false;liquidActive=false;obstacleSrcCanvas=null;
        if(kind==='terrain') {
          var mask=document.createElement('canvas');mask.width=8;mask.height=8;
          var context=mask.getContext('2d');context.fillStyle='rgba(255,255,255,'+amount+')';context.fillRect(0,0,8,8);
          setObstacleAlpha(mask);
        } else if(kind==='moving') {
          if(!movingBoundary)movingBoundary=createFBO(8,8,ext.formatRGBA.internalFormat,ext.formatRGBA.format,ext.halfFloatTexType,gl.NEAREST);
          gl.bindFramebuffer(gl.FRAMEBUFFER,movingBoundary.fbo);gl.clearColor(0,0,0,amount);gl.clear(gl.COLOR_BUFFER_BIT);gl.clearColor(0,0,0,0);
          movingActive=true;
        } else if(kind==='liquid') {
          if(!liquidTexture)liquidTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,liquidTexture);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,0,Math.round(amount*255)]));liquidActive=true;
        }
      },
      init: init,`);
    const smoke = new Function(instrumented + '\nreturn SmokeFluid;')();
    const result = {};
    try {
      check(smoke.init(canvas, { SIM_RESOLUTION: 96, DYE_RESOLUTION: 192, CURL: 0,
        PRESSURE_ITERATIONS: 25, DENSITY_DISSIPATION: 0, VELOCITY_DISSIPATION: 0, SHADING: false }), 'WebGL boot');
      check(typeof smoke.setPhysics === 'function' && typeof smoke.getPhysics === 'function', 'Live physics API missing');
      function set(values) { smoke.setPhysics(Object.assign({}, zero, values), 0); }
      function steps(n) { for (let i = 0; i < n; i++) smoke.step(1 / 60); }
      function measure(mode = 0) {
        const bytes = smoke.probe(mode); let sum = 0, mx = 0, my = 0, energy = 0;
        for (let i = 0; i < bytes.length; i += 4) {
          const n = bytes[i]; sum += n; energy += n * n;
          mx += n * (i / 4 % 384 + .5); my += n * (Math.floor(i / 4 / 384) + .5);
        }
        check(gl.getError() === 0, 'GL error ' + JSON.stringify(profile));
        return { sum, energy, x: mx / sum, y: my / sum };
      }
      function seed() { smoke.splat(.5, .5, 0, 0, { r: .75, g: .2, b: .1 }, 1.2); }
      function bytesEqual(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }
      function angularMomentum() {
        const bytes = smoke.probe(3); let sum = 0;
        for (let i = 0; i < bytes.length; i += 4) {
          const x = i / 4 % 384 + .5 - 192, y = Math.floor(i / 4 / 384) + .5 - 128;
          sum += x * (bytes[i + 1] - 127.5) - y * (bytes[i] - 127.5);
        }
        return sum;
      }

      // Defaults must behave exactly like explicitly disabled new forces.
      smoke.clear(); seed(); steps(45); const defaultDye = smoke.probe(0);
      smoke.clear(); set({ COOLING: 1 }); seed(); steps(45);
      check(bytesEqual(defaultDye, smoke.probe(0)), 'Zero physics changed default RGB evolution');
      check(measure(1).sum === 0, 'Legacy emission injected heat');

      for (const mode of ['neutral', 'hot', 'heavy']) {
        smoke.clear(); set(mode === 'hot' ? { HEAT: 1, BUOYANCY: 180 } : mode === 'heavy' ? { WEIGHT: 180 } : {});
        seed(); const start = measure(); steps(120); const end = measure();
        result[mode] = { dy: end.y - start.y, dx: end.x - start.x, retention: end.sum / start.sum };
      }
      check(Math.abs(result.neutral.dy) < .05, 'Unforced smoke moved');
      check(result.hot.dy > 3, 'Temperature did not lift smoke: ' + JSON.stringify(result));
      check(result.heavy.dy < -3, 'Weight did not sink smoke: ' + JSON.stringify(result));

      for (const cooling of [0, 3]) {
        smoke.clear(); set({ HEAT: 2, COOLING: cooling }); seed();
        const heat = measure(1).sum, dye = measure().sum;
        check(heat > 0, 'Heat was not injected'); steps(60);
        result['cooling' + cooling] = { heat: measure(1).sum / heat, dye: measure().sum / dye };
      }
      check(result.cooling0.heat > .99 && result.cooling3.heat < .08, 'Independent cooling failed: ' + JSON.stringify(result));
      check(result.cooling3.dye > .99, 'Cooling incorrectly removed visible dye');

      // A pair of opposite jets gives a compact, nonuniform velocity field.
      for (const viscosity of [0, 30]) {
        smoke.clear(); set({ VISCOSITY: viscosity });
        smoke.splatVelocity(.46, .5, 0, 100, .018);
        smoke.splatVelocity(.54, .5, 0, -100, .018);
        steps(24); result['viscosity' + viscosity] = measure(2).energy;
      }
      check(result.viscosity0 > 0 && result.viscosity30 < result.viscosity0 * .9,
        'Viscosity did not dissipate narrow jets: ' + JSON.stringify(result));

      for (const spin of [0, 180, -180]) {
        smoke.clear(); set({ EDGE_SPIN: spin }); seed(); steps(30);
        result['spin' + spin] = measure(2).energy;
        result['angular' + spin] = angularMomentum();
      }
      check(result.spin0 === 0 && result.spin180 > 0 && result['spin-180'] > 0,
        'Concentration edges did not drive circulation: ' + JSON.stringify(result));
      check(result.angular180 * result['angular-180'] < 0, 'Changing spin sign did not reverse circulation');

      // Switching a recipe changes uniforms only. Existing dye, heat, pressure,
      // and velocity survive, and no texture, framebuffer, or shader is rebuilt.
      smoke.clear(); set({ HEAT: 2 }); seed();
      smoke.splatVelocity(.48, .5, 0, 8, .4); steps(8);
      const before = [smoke.probe(0), smoke.probe(1), smoke.probe(2)];
      const identity = smoke.identity(), allocated = JSON.stringify(allocations);
      smoke.setPhysics({ HEAT: 0, COOLING: 2, BUOYANCY: 120, WEIGHT: 50, VISCOSITY: 5, EDGE_SPIN: -40 }, .35);
      check(smoke.getPhysics().BUOYANCY === 120, 'Physics target not readable');
      check(identity.every((value, i) => value === smoke.identity()[i]), 'Switch replaced live GPU fields');
      check(before.every((value, i) => bytesEqual(value, smoke.probe(i))), 'Switch erased or changed live fields');
      steps(30); const after = measure();
      check(after.sum > 0 && measure(1).sum > 0, 'Transition lost the plume or stored heat');
      check(JSON.stringify(allocations) === allocated, 'Switch or transition allocated GPU resources');
      set({}); check(smoke.getPhysics().HEAT === 0, 'Resetting physics retained source heat');
      smoke.clear(); check(measure().sum === 0 && measure(1).sum === 0, 'Explicit clear left density or heat');

      // Coverage represents the visible fraction of a pixel. It must multiply
      // final opacity, even when dense dye would otherwise be almost opaque.
      smoke.clear(); set({ HEAT: 1 }); smoke.config.OPTICAL_DENSITY = 1;
      smoke.splat(.5, .5, 0, 0, { r: 4, g: 2, b: 1 }, 100);
      function centerPixel() {
        smoke.displayPass(); const pixel = new Uint8Array(4);
        gl.readPixels(192, 128, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        check(gl.getError() === 0, 'GL error in optical coverage'); return Array.from(pixel);
      }
      const unmasked = centerPixel(), storedDye = smoke.probe(0), storedHeat = smoke.probe(1);
      check(unmasked[3] > 240, 'Dense optical smoke was not opaque enough to exercise coverage');
      result.coverage = [];
      for (const kind of ['terrain', 'moving', 'liquid']) {
        for (const amount of [.2, .5, .8, 1]) {
          smoke.coverage(kind, amount); const pixel = centerPixel();
          const actualMask = kind === 'moving' ? amount : Math.round(amount * 255) / 255;
          const smooth = Math.max(0, Math.min(1, (actualMask - .35) / .5));
          const visibility = kind === 'terrain' ? 1 - smooth * smooth * (3 - 2 * smooth) : 1 - actualMask;
          const expectedAlpha = unmasked[3] * visibility;
          check(Math.abs(pixel[3] - expectedAlpha) <= 2,
            'Dense optical smoke ignored ' + kind + ' coverage ' + amount + ': ' + pixel[3] + ' versus ' + expectedAlpha);
          result.coverage.push({ kind, amount, alpha: pixel[3], expectedAlpha });
        }
      }
      smoke.coverage(null, 0);
      check(bytesEqual(storedDye, smoke.probe(0)) && bytesEqual(storedHeat, smoke.probe(1)), 'Optical display erased stored density or heat');
      smoke.config.OPTICAL_DENSITY = 0;
      smoke.resize(320, 240); set({ HEAT: 1, BUOYANCY: 60 }); seed(); steps(4);
      smoke.displayPass(); check(!gl.getError(), 'Resize failed with physics enabled');
      result.allocations = allocations;
      report.push({ profile, result });
    } finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
  check(!errors.length, errors.join('\n'));
  return report;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-physics-chrome-'));
  const chrome = spawn(process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : path.join(os.homedir(), '.local/bin/agent-chrome-for-testing')),
    ['--headless=new', '--use-angle=' + (process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan'), '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let launchError, socket;
  chrome.on('error', error => { launchError = error; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort'), deadline = Date.now() + 20000;
    while (!fs.existsSync(portFile)) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null || Date.now() > deadline) throw Error('Chrome for Testing did not become ready');
      await pause(50);
    }
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = tabs.find(tab => tab.type === 'page'); assert(page, 'Chrome page target missing');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Smoke physics regression timed out')), 120000);
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data); if (message.id !== 1) return;
        clearTimeout(timeout); if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result);
      });
      socket.addEventListener('close', () => { clearTimeout(timeout); reject(Error('Chrome connection closed')); }, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(${testPhysics.toString()})(${JSON.stringify(source)})`, returnByValue: true, awaitPromise: true,
    } }));
    const result = await response;
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const report = { profiles: result.result.value };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    for (const item of report.profiles) console.log(JSON.stringify(item));
    console.log(`PASS: thermal rise, density weight, independent cooling, viscosity, edge circulation, optical coverage, live field preservation and zero transition allocations on WebGL2/WebGL1/manual filtering. Results: ${output}`);
  } finally {
    socket?.close();
    if (chrome.exitCode === null && chrome.signalCode === null && chrome.pid) {
      const stopped = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGTERM');
      await Promise.race([stopped, pause(3000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await stopped; }
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
