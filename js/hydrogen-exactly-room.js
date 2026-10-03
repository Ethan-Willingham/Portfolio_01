import * as M from './hydrogen-exactly-math.js';
import { COMPUTE, PROBES, RENDER } from './hydrogen-exactly-shaders.js';

export const roomInfo = {
  apiVersion: 1, id: 'hydrogen-exactly', title: 'Hydrogen Exactly', model: M.MODEL,
  representativeScaleMeters: 900 * M.A0,
  scaleMeaning: 'n0^2 a0, the characteristic circular n0=30 radius; snapshot overrides this in spectral mode',
  sources: ['https://arxiv.org/html/quant-ph/9510029v1', 'https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0', 'https://physics.nist.gov/cgi-bin/cuu/Value?ryd', 'https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer']
};
export class HydrogenInitializationError extends Error { constructor(message) { super(message); this.name = 'HydrogenInitializationError'; } }
const tiers = { low: [64, 64], medium: [128, 96], high: [160, 128] };
const half = v => {
  const sign = (v & 0x8000) ? -1 : 1, e = (v >> 10) & 31, m = v & 1023;
  return sign * (e ? (e === 31 ? (m ? NaN : Infinity) : 2 ** (e - 15) * (1 + m / 1024)) : 2 ** -14 * m / 1024);
};
export async function createRoom({ device, seed, quality = 'medium', assetBaseURL } = {}) {
  if (!device || device.limits.maxTextureDimension3D < 64) throw new HydrogenInitializationError('WebGPU with 3D storage textures is required. The still below is a CPU evaluation of the same wavefunction.');
  if (!tiers[quality]) throw new HydrogenInitializationError('Unknown quality tier.');
  const base = assetBaseURL || new URL('../assets/visualizer/hydrogen-exactly/', import.meta.url).href;
  const abort = new AbortController();
  let response;
  try { response = await fetch(new URL('CIE_xyz_1931_2deg.csv', base), { signal: abort.signal }); }
  catch (error) { throw new HydrogenInitializationError(`Could not load the bundled CIE observer table: ${error.message}`); }
  if (!response.ok) throw new HydrogenInitializationError('The bundled CIE observer table could not be loaded.');
  const cie = M.parseCIE(await response.text());
  const colors = M.spectralPairs(M.SPECTRAL, cie);
  let mode = 'revival', overlay = 0, section = false, tilt = 0.92, yaw = 0.1;
  let grid = Math.min(tiers[quality][0], device.limits.maxTextureDimension3D), raySteps = tiers[quality][1];
  let width = 1, height = 1, time = 0, score = 0, steps = 0, disposed = false, field, renderBinding, computeBinding;
  let dirty = true, tint = [0.72, 0.61, 0.39], diagnosticTime = -1, fidelity = { fidelity: 1, rotation: 0 };
  let lastMeasurement = null;
  const uniform = device.createBuffer({ label: 'Hydrogen f64-reduced phases', size: 576, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const data = new Float32Array(144);
  async function shader(code) {
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(m => m.type === 'error');
    if (errors.length) throw new HydrogenInitializationError(errors.map(m => `Shader line ${m.lineNum}: ${m.message}`).join('\n'));
    return module;
  }
  device.pushErrorScope('validation');
  let computeModule, probeModule, renderModule;
  try { computeModule = await shader(COMPUTE); probeModule = await shader(PROBES); renderModule = await shader(RENDER); }
  catch (error) { await device.popErrorScope(); uniform.destroy(); throw error; }
  let compute, probePipeline, renderPipeline;
  try {
    compute = await device.createComputePipelineAsync({ label: 'Hydrogen full-spectrum density', layout: 'auto', compute: { module: computeModule, entryPoint: 'volume' } });
    probePipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: probeModule, entryPoint: 'probe' } });
    renderPipeline = await device.createRenderPipelineAsync({ label: 'Hydrogen linear volume', layout: 'auto', vertex: { module: renderModule, entryPoint: 'vertex' }, fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } });
  } catch (error) { await device.popErrorScope(); uniform.destroy(); throw new HydrogenInitializationError(error.message); }
  const initializationError = await device.popErrorScope();
  if (initializationError) { uniform.destroy(); throw new HydrogenInitializationError(initializationError.message); }
  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  function allocate() {
    field?.destroy();
    field = device.createTexture({ label: `Hydrogen ${grid} cubed scaled density`, size: [grid, grid, grid], dimension: '3d', format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    computeBinding = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: field.createView() }] });
    renderBinding = device.createBindGroup({ layout: renderPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: field.createView() }, { binding: 2, resource: sampler }] });
    dirty = true; lastMeasurement = null;
  }
  allocate();
  function upload(exposure = 1) {
    const states = M.statesFor(mode), phases = M.phases(states, time), side = M.domainFor(mode);
    data.fill(0);
    data.set([grid, side, mode === 'spectral' ? 1 : 0, overlay], 0);
    data.set([width, height, tilt, section ? 1 : 0], 4);
    data.set([yaw, raySteps, exposure, mode === 'revival' ? 0.14 : 0.26], 8);
    data.set([...tint, 0], 12);
    states.forEach((s, i) => {
      data.set([...phases[i], 0, 0], 16 + i * 4);
      const log = mode === 'revival' ? M.circularLogNorm(s.n) : M.radialLogNorm(s.n, s.l) + 0.5 * Math.log((s.l ? 3 : 1) / (4 * Math.PI));
      data.set([s.n, s.l, s.m, log], 68 + i * 4);
    });
    colors.forEach((p, i) => data.set([...(p.linearRGB || [0, 0, 0]), 0], 120 + i * 4));
    device.queue.writeBuffer(uniform, 0, data);
  }
  function computePass(encoder) {
    const pass = encoder.beginComputePass(); pass.setPipeline(compute); pass.setBindGroup(0, computeBinding); pass.dispatchWorkgroups(Math.ceil(grid / 4), Math.ceil(grid / 4), Math.ceil(grid / 4)); pass.end();
  }
  function update() {
    if (disposed) return;
    upload();
    if (dirty) { const encoder = device.createCommandEncoder(); computePass(encoder); device.queue.submit([encoder.finish()]); dirty = false; }
  }
  const room = {
    resize({ width: w, height: h }) { width = Math.max(1, Math.round(w)); height = Math.max(1, Math.round(h)); },
    step({ dtSeconds, elapsedSeconds, scoreSeconds }) {
      if (disposed) return;
      if (![dtSeconds, elapsedSeconds, scoreSeconds].every(Number.isFinite)) throw new Error('Hydrogen clock values must be finite.');
      score = Math.max(0, scoreSeconds); time = M.solverTime(score, mode); steps++;
      dirty = true; update();
      if (Math.abs(score - diagnosticTime) >= 0.25 || diagnosticTime < 0) {
        fidelity = mode === 'revival' ? M.shapeFidelity(M.REVIVAL, time, 512) : { fidelity: null, rotation: null };
        diagnosticTime = score;
      }
    },
    render({ encoder, targetView, width: w, height: h, exposure = 1 }) {
      if (disposed) return;
      width = w; height = h; upload(exposure);
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(renderPipeline); pass.setBindGroup(0, renderBinding); pass.draw(3); pass.end();
    },
    setMode(value) { if (!['revival', 'spectral'].includes(value)) throw new Error('Unknown hydrogen mode.'); mode = value; overlay = value === 'spectral' ? 1 : 0; score = 0; time = 0; diagnosticTime = -1; dirty = true; lastMeasurement = null; update(); },
    setPresentation(value = {}) { if (value.section !== undefined) section = !!value.section; if (value.overlay !== undefined) overlay = +value.overlay; if (value.tilt !== undefined) tilt = +value.tilt; if (value.tint) tint = [...value.tint]; dirty = true; update(); },
    setQuality(value) { if (!tiers[value]) throw new Error('Unknown quality.'); quality = value; grid = Math.min(tiers[value][0], device.limits.maxTextureDimension3D); raySteps = tiers[value][1]; allocate(); update(); },
    snapshot() {
      return {
        ...roomInfo, numericalStepCount: steps, simulationTime: time, simulationTimeUnits: 'hbar/Eh (atomic time)', simulationTimeSeconds: time * M.ATOMIC_TIME,
        scoreSeconds: score, mode, quality, seed: seed || null, seedProvenance: 'Deterministic analytic initial coefficients; seed is recorded but unused. No random draws or beacon claim.',
        parameterValues: { states: M.statesFor(mode), n0: mode === 'revival' ? 30 : null, sigma: mode === 'revival' ? 1.5 : null, atomicUnitsPerDisplaySecond: mode === 'revival' ? M.TCL / 10 : 24, domainHalfSideA0: M.domainFor(mode), grid, raySteps, section, overlay, tilt },
        representativeScaleMeters: M.scaleFor(mode), scaleMeaning: mode === 'revival' ? 'n0^2 a0, characteristic circular radius' : 'n_max^2 a0, characteristic extent of the highest n=5 basis state',
        analyticNorm: M.statesFor(mode).reduce((s, j) => s + j.c_real ** 2 + j.c_imag ** 2, 0),
        autocorrelation: M.autocorrelation(M.statesFor(mode), time), rotationAdjustedOverlap: fidelity.fidelity, bestRotationRadians: fidelity.rotation,
        diagnosticAgeSeconds: diagnosticTime < 0 ? null : Math.abs(score - diagnosticTime), spatialCapturedMass: lastMeasurement?.mass ?? null,
        spatialMeasurementScoreSeconds: lastMeasurement?.scoreSeconds ?? null, spatialMeasurementAgeSeconds: lastMeasurement ? Math.abs(score - lastMeasurement.scoreSeconds) : null,
        unavailableMeasurements: lastMeasurement ? [] : ['Finite-grid captured mass requires debugReadback; analytic norm is not box mass.'],
        wavelengths: mode === 'spectral' ? colors : [{ a: 29, b: 30, wavelengthNm: M.wavelength(29, 30), band: 'infrared', linearRGB: null }],
        precision: 'JS f64 phase reduction and normalization; WGSL f32 evaluation; domain-scaled density and color in f16 presentation texture',
        allocatedVolumeBytes: grid ** 3 * 8, modelApproximation: '13 or 4 states, fixed infinite-mass nucleus, no relativity or radiative corrections',
        synchronization: 'Local piece clock. Pauses freeze score. Restart replays t=0. No worldwide synchronization.', disposed
      };
    },
    async debugReadback() {
      if (disposed) throw new Error('Room is disposed.');
      update();
      const state = room.snapshot(), side = M.domainFor(mode);
      const points = (mode === 'revival' ? [[-900, 0, 0], [900, 0, 0], [640, 640, 25], [-500, 600, 170], [0, 0, 0], [1200, -100, 60]] : [[0, 0, 3], [0, 0, -3], [3, 4, 0], [12, -8, 2], [0, 0, 0], [30, 0, 20]]);
      const positions = device.createBuffer({ size: points.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const results = device.createBuffer({ size: points.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const read = device.createBuffer({ size: points.length * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const bytesPerRow = Math.ceil(grid * 8 / 256) * 256;
      const volumeRead = device.createBuffer({ size: bytesPerRow * grid * grid, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const input = new Float32Array(points.length * 4); points.forEach((p, i) => input.set(p, i * 4)); device.queue.writeBuffer(positions, 0, input);
      try {
        const binding = device.createBindGroup({ layout: probePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: positions } }, { binding: 2, resource: { buffer: results } }] });
        const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(); pass.setPipeline(probePipeline); pass.setBindGroup(0, binding); pass.dispatchWorkgroups(1); pass.end();
        encoder.copyBufferToBuffer(results, 0, read, 0, points.length * 16);
        encoder.copyTextureToBuffer({ texture: field }, { buffer: volumeRead, bytesPerRow, rowsPerImage: grid }, [grid, grid, grid]);
        device.queue.submit([encoder.finish()]);
        await Promise.all([read.mapAsync(GPUMapMode.READ), volumeRead.mapAsync(GPUMapMode.READ)]);
        const gpu = new Float32Array(read.getMappedRange().slice(0)), voxels = new Uint16Array(volumeRead.getMappedRange());
        let sum = 0, finite = true;
        for (let z = 0; z < grid; z++) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
          const rho = half(voxels[(z * grid + y) * bytesPerRow / 2 + x * 4 + 3]); sum += rho; if (!Number.isFinite(rho) || rho < 0) finite = false;
        }
        const mass = sum * (2 / grid) ** 3;
        lastMeasurement = { mass, scoreSeconds: state.scoreSeconds };
        return { ...state, spatialCapturedMass: mass, spatialMeasurementScoreSeconds: state.scoreSeconds, spatialMeasurementAgeSeconds: 0, unavailableMeasurements: [], finite, probes: points.map((p, i) => ({ positionA0: p, gpu: { re: gpu[i * 4], im: gpu[i * 4 + 1], rho: gpu[i * 4 + 2], signedFirstPair: gpu[i * 4 + 3] }, cpu: M.wavefunction(M.statesFor(state.mode), ...p, state.simulationTime) })), voxelWidthA0: 2 * side / grid };
      } finally { for (const buffer of [positions, results, read, volumeRead]) buffer.destroy(); }
    },
    async benchmark(count = 12) {
      // Completion latency, including submit and queue wait. Not CPU submission time alone.
      const target = device.createTexture({ size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const computeMs = [], renderMs = [];
      try {
        for (let i = 0; i < count + 3; i++) {
          upload(); let encoder = device.createCommandEncoder(); computePass(encoder);
          let t = performance.now(); device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone(); if (i >= 3) computeMs.push(performance.now() - t);
          encoder = device.createCommandEncoder(); room.render({ encoder, targetView: target.createView(), width, height, exposure: 1 });
          t = performance.now(); device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone(); if (i >= 3) renderMs.push(performance.now() - t);
        }
        const stats = a => { a.sort((x, y) => x - y); return { median: a[Math.floor(a.length / 2)], p95: a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)], samples: a.length }; };
        return { computeMs: stats(computeMs), renderMs: stats(renderMs), grid, width, height, precision: room.snapshot().precision, method: 'GPU queue completion latency with three warmups, includes submit and wait overhead' };
      } finally { target.destroy(); }
    },
    dispose() { if (disposed) return; disposed = true; abort.abort(); field.destroy(); uniform.destroy(); }
  };
  update();
  return room;
}
