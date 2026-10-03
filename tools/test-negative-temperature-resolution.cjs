// Verify finer FFTs and the paddle protocol, with an owned browser and server.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/?') || req.url === '/') return res.end('<!doctype html><title>Superfluid checks</title>');
  const file = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', headless: true, args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/${process.argv.includes('--render-only') ? '?render-only' : ''}`);
    await page.exposeFunction('progress', message => console.log(message));
    const report = await page.evaluate(async () => {
      const { GPUSolver } = await import('./js/negative-temperature-gpu.js?v=3');
      const { CONFIG, initialField, measure, cpuStep } = await import('./js/negative-temperature-model.js?v=3');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
      const errors = [];
      device.addEventListener('uncapturederror', e => errors.push(e.error.message));
      const report = { adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter }, precision: 'f32', runs: [], errors };
      const rms = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0) / a.length);
      const norm = a => a.reduce((sum, v) => sum + v * v, 0);
      const smallParameters = { ...CONFIG, grid: 32, side: 16, dt: .02, wallHeight: 0, paddleAmplitude: 0 };
      const smallInput = new Float32Array(2 * 32 * 32);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const k = 2 * (j * 32 + i), phase = 2 * Math.PI * (2 * i - j) / 32, amplitude = .8 * (1 + .1 * Math.cos(2 * Math.PI * i / 32));
        smallInput[k] = amplitude * Math.cos(phase); smallInput[k + 1] = amplitude * Math.sin(phase);
      }
      const small = new GPUSolver(device, smallParameters, '180106951');
      try {
        small.upload(smallInput); small.advance(20, { forcing: false });
        const cpu = Float64Array.from(smallInput);
        for (let i = 0; i < 20; i++) cpuStep(cpu, smallParameters, i * smallParameters.dt);
        report.cpuGPU20StepsRMS = rms(cpu, await small.readback());
      } finally { small.dispose(); }
      for (const dt of (location.search.includes('render-only') ? [] : [0.004, 0.002])) {
        const grid = 512, p = { ...CONFIG, grid, dt }, gpu = new GPUSolver(device, p, '180106951');
        try {
          const input = initialField(p, '180106951');
          const roundTripRMS = rms(input, await gpu.fftRoundTrip(input));
          const fft = await gpu.benchmark('fft');
          gpu.upload(input);
          const step = await gpu.benchmark('step');
          await progress(`Grid ${grid} dt ${dt}: FFT RMS ${roundTripRMS}, full step median ${step.median.toFixed(3)} ms, p95 ${step.p95.toFixed(3)} ms`);
          const wave = new Float32Array(2 * grid * grid);
          const frequency = 0.5 * (2 * Math.PI / p.side) ** 2 * 5 + p.g * 0.64;
          for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
            const k = 2 * (j * grid + i), phase = 2 * Math.PI * (2 * i - j) / grid;
            wave[k] = .8 * Math.cos(phase); wave[k + 1] = .8 * Math.sin(phase);
          }
          const flat = new GPUSolver(device, { ...p, wallHeight: 0, paddleAmplitude: 0 }, '180106951');
          let planeWaveRMS, normDrift100Steps;
          try {
            flat.upload(wave); flat.advance(100, { forcing: false });
            const evolved = await flat.readback(), angle = frequency * p.dt * 100;
            const exact = wave.map((v, k) => k % 2 ? wave[k - 1] * -Math.sin(angle) + v * Math.cos(angle) : v * Math.cos(angle) + wave[k + 1] * Math.sin(angle));
            planeWaveRMS = rms(evolved, exact); normDrift100Steps = norm(evolved) / norm(wave) - 1;
          } finally { flat.dispose(); }
          gpu.upload(input); gpu.time = 0; gpu.steps = 0;
          for (let i = 0; i < p.preparationSteps; i += 128) { gpu.advance(Math.min(128, p.preparationSteps - i), { imaginary: true }); await device.queue.onSubmittedWorkDone(); }
          const ground = measure(await gpu.readback(), p, 0), history = [];
          const targets = dt === .004 ? [48, 100, 150, 250, 400, 540] : [48, 100, 150];
          for (const time of targets) {
            let remaining = Math.round(time / p.dt) - gpu.steps;
            while (remaining) { const count = Math.min(128, remaining); gpu.advance(count); await device.queue.onSubmittedWorkDone(); remaining -= count; }
            const diagnostics = measure(await gpu.readback(), p, gpu.time);
            history.push({ time: gpu.time, steps: gpu.steps, normDrift: diagnostics.norm / ground.norm - 1, ...diagnostics });
            await progress(`Grid ${grid} dt ${dt} time ${time}: ${diagnostics.positive}/${diagnostics.negative}, C2 ${diagnostics.c2}, groups ${diagnostics.componentSizes.slice(0, 12).join(',')}`);
          }
          report.runs.push({ parameters: p, roundTripRMS, planeWaveRMS, normDrift100Steps, fft, step, ground, history });
        } finally { gpu.dispose(); }
      }
      const { createRoom } = await import('./js/negative-temperature-room.js?v=3');
      const room = await createRoom({ device, seed: '180106951' });
      const other = await createRoom({ device, seed: '1234' });
      other.dispose();
      const width = 2716, height = 1224;
      const target = device.createTexture({ size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const read = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      try {
        room.resize({ width, height, dpr: 2 });
        const times = [];
        for (let i = 0; i < 29; i++) {
          await device.queue.onSubmittedWorkDone(); const start = performance.now();
          const encoder = device.createCommandEncoder(); room.render({ encoder, targetView: target.createView(), width, height, exposure: 1 });
          device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone();
          if (i >= 4) times.push(performance.now() - start);
        }
        times.sort((a,b) => a-b);
        report.render = { width, height, median: times[12], p95: times[23], units: 'ms, queue completion including CPU submission', samples: 25 };
        const half = x => { const sign=x&32768?-1:1,e=(x>>10)&31,m=x&1023;return sign*(e?2**(e-15)*(1+m/1024):2**-14*m/1024); };
        const pixel = async exposure => {
          const encoder = device.createCommandEncoder(); room.render({ encoder, targetView: target.createView(), width, height, exposure });
          encoder.copyTextureToBuffer({ texture: target, origin: [width/2, height/2] }, { buffer: read, bytesPerRow: 256 }, { width: 1, height: 1 });
          device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
          const value = Array.from(new Uint16Array(read.getMappedRange()).slice(0,4), half); read.unmap(); return value;
        };
        const one = await pixel(1), two = await pixel(2);
        report.remainingRoomUsableAfterOtherDispose = one[0] > .1;
        report.linearExposureRatio = two.slice(0,3).map((v,i) => v/one[i]);
      } finally { room.dispose(); target.destroy(); read.destroy(); }
      device.destroy(); return report;
    });
    assert.deepEqual(report.errors, []);
    assert.ok(report.cpuGPU20StepsRMS < 2e-5);
    assert.ok(report.remainingRoomUsableAfterOtherDispose);
    assert.ok(report.linearExposureRatio.every(value => Math.abs(value-2)<.01));
    for (const run of report.runs) {
      assert.ok(run.roundTripRMS < 2e-6);
      assert.ok(run.planeWaveRMS < 5e-5);
      assert.ok(Math.abs(run.normDrift100Steps) < 1e-4);
      assert.ok(run.history.every(s => Number.isFinite(s.energy) && s.positive >= 1 && s.negative >= 1 && s.vortices.length < 80));
    }
    fs.writeFileSync(path.join(root, `assets/visualizer/negative-temperature/${process.argv.includes('--render-only') ? 'render-resolution-validation' : 'resolution-validation'}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ render: report.render, sharedDeviceOwnership: report.remainingRoomUsableAfterOtherDispose, exposureRatio: report.linearExposureRatio, errors: report.errors }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
