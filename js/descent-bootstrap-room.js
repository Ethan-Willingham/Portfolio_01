// Explicit interim room, never registered as the hydrogen source agent's room.
export const BOHR_METERS = 5.29177210544e-11;
export const ATOMIC_TIME_SECONDS = 2.4188843265864e-17;
export const BEAT_SECONDS = 36;
export const MODEL_TIME_PER_SECOND = (16 * Math.PI / 3) / BEAT_SECONDS;
export const roomInfo = {
  apiVersion: 1, id: 'descent-bootstrap', title: 'Hydrogen interim study',
  model: 'Ideal nonrelativistic Coulomb hydrogen, normalized 1s + 2p_z analytic superposition',
  representativeScaleMeters: 4.125 * BOHR_METERS,
  scaleMeaning: 'Mean electron radius of this 25% 1s, 75% 2p state; not the image field width',
  sources: ['https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0', 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/']
};
export function density(x, y, z, phase) {
  const r = Math.hypot(x, y, z);
  const a = .5 * Math.exp(-r) / Math.sqrt(Math.PI);
  const b = Math.sqrt(.75) * z * Math.exp(-r / 2) / (4 * Math.sqrt(2 * Math.PI));
  return a * a + b * b + 2 * a * b * Math.cos(phase);
}
export function projectedDensity(x, z, phase, samples = 96) {
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += density(x, -16 + 32 * (i + .5) / samples, z, phase);
  return sum * 32 / samples;
}
export const DENSITY_WGSL = `
fn density(p: vec3f, phase: f32) -> f32 {
  let r = length(p);
  let a = 0.5 * exp(-r) / sqrt(3.141592653589793);
  let b = sqrt(0.75) * p.z * exp(-r * 0.5) / (4.0 * sqrt(6.283185307179586));
  return max(0.0, a*a + b*b + 2.0*a*b*cos(phase));
}`;
export async function createRoom({ device, seed, quality = 'medium' }) {
  if (!device) throw new Error('The analytic GPU study requires a host WebGPU device');
  let ticks = 0, elapsed = 0, disposed = false, size = { width: 1, height: 1, dpr: 1 };
  const phaseOrigin = (parseInt(seed.slice(0, 8), 16) >>> 0) / 4294967296 * 2 * Math.PI;
  const samples = { low: 40, medium: 64, high: 96 }[quality];
  const uniforms = device.createBuffer({ label: 'Descent hydrogen uniforms', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shader = device.createShaderModule({ label: 'Descent analytic hydrogen projection', code: `
struct Params { geometry: vec4f, tint: vec4f }
@group(0) @binding(0) var<uniform> u: Params;
${DENSITY_WGSL}
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(p[i],0,1);
}
@fragment fn fragment(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let coord = (pixel.xy / u.geometry.xy * 2.0 - 1.0) * vec2f(u.geometry.x/u.geometry.y, -1.0) * 10.0;
  var projection = 0.0;
  for (var i = 0; i < ${samples}; i++) {
    let depth = -16.0 + 32.0 * (f32(i) + 0.5) / ${samples}.0;
    projection += density(vec3f(coord.x, depth, coord.y), u.geometry.z);
  }
  projection *= 32.0/${samples}.0;
  // Density is the observable. This soft power is presentation only.
  let radiance = pow(max(0.0, projection), 0.68) * 7.0;
  return vec4f(u.tint.rgb * radiance * u.geometry.w, 1);
}` });
  const pipeline = await device.createRenderPipelineAsync({ label: 'Descent hydrogen linear target', layout: 'auto', vertex: { module: shader, entryPoint: 'vertex' }, fragment: { module: shader, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } });
  const binding = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] });
  // Palette stays a density encoding, not spectral emission. UI tint is read
  // by the page host; default here is linear cream for independent use.
  let tint = [.72, .61, .44];
  const phase = () => phaseOrigin + 2 * Math.PI * elapsed / BEAT_SECONDS;
  return {
    resize(next) { if (disposed) throw new Error('Disposed hydrogen room'); size = { ...next }; },
    step({ dtSeconds, elapsedSeconds }) { if (disposed) throw new Error('Disposed hydrogen room'); ticks++; elapsed = elapsedSeconds ?? elapsed + dtSeconds; },
    render({ encoder, targetView, width, height, exposure }) {
      if (disposed || width !== size.width || height !== size.height) throw new Error('Hydrogen render requires resize first');
      device.queue.writeBuffer(uniforms, 0, new Float32Array([width, height, phase(), exposure, ...tint, 0]));
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(pipeline); pass.setBindGroup(0, binding); pass.draw(3); pass.end();
    },
    setPresentationTint(value) { tint = value; },
    restoreAnalyticTime({ stepCount, elapsedSeconds }) { ticks = stepCount; elapsed = elapsedSeconds; },
    snapshot() {
      return {
        apiVersion: 1, id: roomInfo.id, model: roomInfo.model, numericalStepCount: ticks,
        simulationTime: elapsed * MODEL_TIME_PER_SECOND, simulationTimeUnits: 'atomic time units',
        elapsedSeconds: elapsed, timeAxisMeaning: `One atomic unit is ${ATOMIC_TIME_SECONDS} s; a density beat is slowed to ${BEAT_SECONDS} watching seconds`,
        parameters: { basis: [{ n: 1, l: 0, m: 0, probability: .25 }, { n: 2, l: 1, m: 0, probability: .75 }], Hamiltonian: 'Infinite-mass point proton; no spin, fine structure, radiation or external field', projectionSamples: samples },
        quality, seedProvenance: { seed, source: 'Supplied by Descent; seed fixes relative starting phase' },
        diagnostics: { basisNorm: 1, fidelityToInitial: .25*.25 + .75*.75 + 2*.25*.75*Math.cos(2*Math.PI*elapsed/BEAT_SECONDS), meanRadiusBohr: 4.125, phaseRadians: phase() % (2*Math.PI) },
        diagnosticAgeSeconds: 0, diagnosticOrigin: 'Closed-form expectations in the orthonormal two-state basis',
        scale: { meters: 4.125 * BOHR_METERS, meaning: roomInfo.scaleMeaning, source: roomInfo.sources[0] },
        fieldHeightMeters: 20 * BOHR_METERS,
        colorMeaning: 'Single cream density encoding; this probability distribution emits no modeled light',
        replay: 'Analytic relative phases; identical mathematical state for equal seed/time, sampled GPU images may differ',
        routeEvent: { pending: false, complete: true, label: 'Periodic two-state density beat' }
      };
    },
    async debugReadback() {
      const points = [[0,0,0], [1,.5,2], [-2,1,-3], [.5,-1,4], [3,2,-1], [1,0,-2], [4,0,0], [.01,.02,.03]];
      const input = device.createBuffer({ label: 'Descent readback points', size: points.length*16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const output = device.createBuffer({ label: 'Descent readback density', size: points.length*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const staging = device.createBuffer({ label: 'Descent readback staging', size: points.length*4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const p = phase();
      try {
        device.queue.writeBuffer(input, 0, new Float32Array(points.flatMap(x => [...x, p])));
        const module = device.createShaderModule({ code: `${DENSITY_WGSL}
@group(0) @binding(0) var<storage,read> points: array<vec4f>;
@group(0) @binding(1) var<storage,read_write> values: array<f32>;
@compute @workgroup_size(8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&values)) { values[id.x] = density(points[id.x].xyz, points[id.x].w); }
}` });
        const compute = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
        const bg = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } }] });
        const encoder = device.createCommandEncoder(); const pass = encoder.beginComputePass();
        pass.setPipeline(compute); pass.setBindGroup(0,bg); pass.dispatchWorkgroups(1); pass.end();
        encoder.copyBufferToBuffer(output,0,staging,0,points.length*4); device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
        return { origin: 'GPU f32 compute, unfiltered analytic density', phase: p, points, values, cpuReference: points.map(x => density(...x,p)) };
      } finally { input.destroy(); output.destroy(); staging.destroy(); }
    },
    dispose() { if (disposed) return; disposed = true; uniforms.destroy(); }
  };
}
