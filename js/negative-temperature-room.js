import { CONFIG, DEFAULT_SEED, healingLength, measure, protocol, suspectedAnnihilations } from './negative-temperature-model.js?v=4';
import { GPUSolver } from './negative-temperature-gpu.js?v=4';
import { withDeadline } from './negative-temperature-loading.js?v=4';

export const roomInfo = {
  apiVersion: 1, id: 'negative-temperature', title: 'Negative temperature',
  model: '2D conservative Gross-Pitaevskii equation, symmetric split-step Fourier, f32',
  representativeScaleMeters: null,
  scaleMeaning: 'Dimensionless healing length; no atom species or laboratory length is calibrated.',
  sources: ['https://arxiv.org/abs/1801.06951', 'https://arxiv.org/abs/1801.06952'],
};

const renderer = `
struct View {size:vec2f,exposure:f32,mode:f32,n:f32,side:f32,signs:f32,count:f32,span:f32};
@group(0) @binding(0) var<storage,read> psi:array<vec2f>;
@group(0) @binding(1) var<uniform> v:View;
@group(0) @binding(2) var<storage,read> vortices:array<vec4f>;
struct Vertex { @builtin(position) pos:vec4f, @location(0) uv:vec2f };
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{
  let xy=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
  var o:Vertex;o.pos=vec4f(xy[i],0.,1.);o.uv=xy[i];return o;
}
fn at(ij:vec2i)->vec2f{let n=i32(v.n);if(any(ij<vec2i(0))||any(ij>=vec2i(n))){return vec2f(0.);}return psi[u32(ij.y*n+ij.x)];}
// Reconstruct the complex field before taking its magnitude. Averaging density
// separately fills subcell zeros where neighboring complex samples cancel.
fn cubic(a:vec2f,b:vec2f,c:vec2f,d:vec2f,t:f32)->vec2f{
  return b+.5*t*(c-a+t*(2.*a-5.*b+4.*c-d+t*(3.*(b-c)+d-a)));
}
fn field(grid:vec2f)->vec2f{
  let ij=vec2i(floor(grid));let f=fract(grid);
  let a=cubic(at(ij+vec2i(-1,-1)),at(ij+vec2i(0,-1)),at(ij+vec2i(1,-1)),at(ij+vec2i(2,-1)),f.x);
  let b=cubic(at(ij+vec2i(-1,0)),at(ij),at(ij+vec2i(1,0)),at(ij+vec2i(2,0)),f.x);
  let c=cubic(at(ij+vec2i(-1,1)),at(ij+vec2i(0,1)),at(ij+vec2i(1,1)),at(ij+vec2i(2,1)),f.x);
  let d=cubic(at(ij+vec2i(-1,2)),at(ij+vec2i(0,2)),at(ij+vec2i(1,2)),at(ij+vec2i(2,2)),f.x);
  return cubic(a,b,c,d,f.y);
}
fn lab(l:f32,a:f32,b:f32)->vec3f{
  let z=vec3f(l+.3963377774*a+.2158037573*b,l-.1055613458*a-.0638541728*b,l-.0894841775*a-1.291485548*b);
  let q=z*z*z;return max(vec3f(0.),vec3f(4.0767416621*q.x-3.3077115913*q.y+.2309699292*q.z,-1.2684380046*q.x+2.6097574011*q.y-.3413193965*q.z,-.0041960863*q.x-.7034186147*q.y+1.707614701*q.z));
}
@fragment fn fragment(o:Vertex)->@location(0) vec4f{
  let xy=o.uv* v.size/min(v.size.x,v.size.y)*v.span;
  let grid=(xy/v.side+.5)*v.n;
  let ij=vec2i(floor(grid));let a=field(grid);let rho=dot(a,a);
  let phase=atan2(a.y,a.x);
  let chroma=select(.075,.12,v.mode>0.5&&v.mode<1.5);
  let color=lab(.77,chroma*cos(phase),chroma*sin(phase));
  let luminosity=1.6*pow(rho,1.25)*smoothstep(.015,.045,rho);
  var scene=vec3f(.004,.007,.006)+color*luminosity;
  // Equal-density contours, spaced by 0.1 in model density, with screen-pixel
  // antialiasing. The slope mask suppresses contour noise in a flat field.
  let pixelSlope=fwidth(rho);
  let densitySlope=pixelSlope*min(v.size.x,v.size.y)/(2.*v.span);
  let distance=abs(fract((rho-.035)/.1+.5)-.5)*.1;
  let stroke=max(pixelSlope*.55,.000001);
  let contour=(1.-smoothstep(stroke,stroke*1.8,distance))*smoothstep(.025,.07,densitySlope)*smoothstep(.06,.12,rho);
  if(v.mode<.5){scene*=1.-.36*contour;}
  if(v.mode>1.5 && rho>.08){
    // j = Im(conj(psi) grad psi); safe v = j/rho, no tracers.
    let gradx=(at(ij+vec2i(1,0))-at(ij-vec2i(1,0)))*v.n/(2.*v.side);
    let grady=(at(ij+vec2i(0,1))-at(ij-vec2i(0,1)))*v.n/(2.*v.side);
    let flow=vec2f(a.x*gradx.y-a.y*gradx.x,a.x*grady.y-a.y*grady.x)/max(rho,.08);
    let point=(fract(xy/3.+.5)-.5)*3.;let speed=length(flow);let dir=flow/max(speed,.001);
    let along=dot(point,dir);let across=abs(dot(point,vec2f(-dir.y,dir.x)));
    let line=(1.-smoothstep(.025,.09,across))*(1.-smoothstep(.35,.6,abs(along)))*smoothstep(.015,.06,speed);
    let head=(1.-smoothstep(.02,.08,max(0.,across-(.58-along)*.5)))*smoothstep(.2,.3,along)*(1.-smoothstep(.5,.58,along))*smoothstep(.015,.06,speed);
    scene=mix(scene,vec3f(.65,.56,.4),max(line,head)*.65);
  }
  if(v.signs>.5){for(var i=0u;i<u32(v.count);i++){
    let vortex=vortices[i];let d=length(xy-vortex.xy);
    let ring=(1.-smoothstep(.05,.12,abs(d-.68)));
    let c=select(vec3f(.2,.5,.68),vec3f(.75,.43,.24),vortex.z>0.);
    scene=mix(scene,c,ring*.8);
  }}
  return vec4f(scene*v.exposure,1.);
}`;

export function viewHalfSpan({ width, height }, parameters) {
  return Math.max(parameters.radiusX / width, parameters.radiusY / height) * Math.min(width, height) * 1.1;
}

export async function createRoom({ device, seed = DEFAULT_SEED, quality = 'medium', assetBaseURL, onProgress }) {
  if (!device) throw new Error('WebGPU is required for the live Gross-Pitaevskii model.');
  if (!['low', 'medium', 'high'].includes(quality)) throw new Error('Unknown quality tier.');
  if (!/^[0-9a-f]{1,64}$/i.test(seed)) throw new Error('Seed must be a fixed hex string.');
  // All tiers preserve the validated 512 grid and physical parameters.
  onProgress?.({ phase: 'compiling' });
  const p = { ...CONFIG }, solver = new GPUSolver(device, p, seed);
  const view = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const signs = device.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const module = device.createShaderModule({ code: renderer });
  const viewLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: 48 } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
  ] });
  let pipeline;
  try { pipeline = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout] }), vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } }); }
  catch (error) { solver.dispose(); view.destroy(); signs.destroy(); throw error; }
  const groups = solver.fields.map(buffer => device.createBindGroup({ layout: viewLayout, entries: [
    { binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: view } }, { binding: 2, resource: { buffer: signs } },
  ] }));
  let disposed = false, accumulator = 0, busy = false, diag = null, initialNorm = null, lastMeasurement = 0, lastStep = 0, baselineEnergy = null, estimatedAnnihilations = 0;
  let width = 1, height = 1, displayMode = 0, showSigns = false;
  const assetURL = new URL(assetBaseURL || '../assets/visualizer/negative-temperature/', import.meta.url).href;
  let pendingMeasurement = null, workerFailure = null;
  let worker;
  function disableWorker(error) {
    workerFailure = error.message; worker?.terminate(); worker = null;
    const pending = pendingMeasurement; pendingMeasurement = null;
    if (pending) { clearTimeout(pending.timer); pending.fallback(); }
  }
  try {
    worker = new Worker(new URL('./negative-temperature-diagnostics-worker.js?v=4', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const pending = pendingMeasurement; pendingMeasurement = null;
      if (!pending) return;
      clearTimeout(pending.timer);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.diagnostics);
    };
    worker.onerror = event => { event.preventDefault(); disableWorker(new Error(event.message || 'Diagnostic worker failed.')); };
    worker.onmessageerror = () => disableWorker(new Error('Diagnostic worker response could not be read.'));
  } catch (error) { disableWorker(error); }
  function measureInWorker(field, time) {
    if (!worker) return Promise.resolve(measure(field, p, time));
    return new Promise((resolve, reject) => {
      const fallback = () => { try { resolve(measure(field, p, time)); } catch (error) { reject(error); } };
      const timer = setTimeout(() => disableWorker(new Error('Diagnostic worker did not respond.')), 4000);
      pendingMeasurement = { resolve, reject, fallback, timer };
      // Retain the readback for the identical CPU calculation if the worker cannot reply.
      try { worker.postMessage({ field, parameters: p, time }); }
      catch (error) { disableWorker(error); }
    });
  }
  async function diagnostics() {
    if (busy || disposed) return diag;
    busy = true;
    try {
      const { field, time, steps } = await withDeadline(solver.readbackState(), 15000, 'The GPU did not return the superfluid field.'); if (disposed) return diag;
      const measured = await measureInWorker(field, time); if (disposed) return diag;
      if (initialNorm === null) initialNorm = measured.norm;
      const localTime = time % p.phraseDuration;
      if (protocol(time, p).amplitude > 0) baselineEnergy = null;
      if (localTime > p.stirStart + p.sweepDuration + p.withdrawalDuration && baselineEnergy === null) baselineEnergy = measured.energy;
      if (diag) estimatedAnnihilations += suspectedAnnihilations(diag.vortices, measured.vortices);
      diag = { ...measured, measuredStep: steps, measuredSimulationTime: time,
        normDrift: measured.norm / initialNorm - 1, conservativeEnergyDrift: baselineEnergy === null ? null : measured.energy / baselineEnergy - 1,
        estimatedAnnihilations, annihilationCaveat: 'Candidate opposite-sign disappearances within 3 units between samples; edge loss and motion can be missed.',
        temperature: null, temperatureStatus: 'Temperature not estimated',
        energyCaveat: 'Spectral kinetic energy. Moving paddles do work; imaginary preparation changes norm and energy. No real-time damping or normalization.',
      };
      const packed = new Float32Array(256 * 4); measured.vortices.slice(0, 256).forEach((v, i) => packed.set([v.x, v.y, v.sign, 0], i * 4));
      device.queue.writeBuffer(signs, 0, packed); lastMeasurement = performance.now(); lastStep = steps;
      return diag;
    } finally { busy = false; }
  }
  try {
    for (let i = 0; i < p.preparationSteps; i += 32) {
      const count = Math.min(32, p.preparationSteps - i);
      solver.advance(count, { imaginary: true });
      await withDeadline(device.queue.onSubmittedWorkDone(), 15000, 'The GPU stopped responding while preparing the field.');
      onProgress?.({ phase: 'preparing', completed: i + count, total: p.preparationSteps });
    }
    onProgress?.({ phase: 'measuring' });
    await diagnostics();
  } catch (e) { worker?.terminate(); solver.dispose(); view.destroy(); signs.destroy(); throw e; }
  return {
    resize(size) { width = Math.max(1, size.width); height = Math.max(1, size.height); },
    step({ dtSeconds }) {
      if (disposed || diag?.diagnosticError) return;
      accumulator += Math.min(0.1, Math.max(0, dtSeconds)) * p.solverUnitsPerSecond;
      const count = Math.min(32, Math.floor((accumulator + 1e-10) / p.dt));
      if (count) { solver.advance(count); accumulator -= count * p.dt; }
      if (performance.now() - lastMeasurement > (quality === 'low' ? 6000 : 3000) && solver.steps !== lastStep) diagnostics().catch(e => { diag = { ...diag, diagnosticError: e.message }; });
    },
    render({ encoder, targetView, width: w = width, height: h = height, exposure = 1 }) {
      if (disposed) return;
      device.queue.writeBuffer(view, 0, new Float32Array([w, h, exposure, displayMode, p.grid, p.side, showSigns ? 1 : 0, Math.min(256, diag?.vortices.length || 0), viewHalfSpan({ width: w, height: h }, p)]));
      const pass = encoder.beginRenderPass({ label: 'Superfluid linear density', colorAttachments: [{ view: targetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(pipeline); pass.setBindGroup(0, groups[solver.current]); pass.draw(3); pass.end();
    },
    snapshot() {
      return { apiVersion: 1, id: roomInfo.id, model: roomInfo.model, numericalStepCount: solver.steps,
        simulationTime: solver.time, simulationUnits: 'dimensionless: hbar = m = 1', quality, parameters: { ...p },
        seed, seedProvenance: 'Fixed offline hex seed, FNV-1a + Mulberry32 sets initial global phase only; deterministic paddles.',
        replayCaveat: 'Same solver sequence; floating-point evolution can diverge across devices.',
        preparation: { method: 'Grand-canonical imaginary-time split step at fixed chemical potential, no frame normalization', steps: solver.preparationSteps },
        dx: p.side / p.grid, healingLength: healingLength(p), healingLengthCells: healingLength(p) / (p.side / p.grid),
        phase: protocol(solver.time, p).phase, temperatureStatus: 'Temperature not estimated',
        diagnosticAgeSteps: solver.steps - lastStep, diagnosticAgeSeconds: (performance.now() - lastMeasurement) / 1000,
        diagnostics: diag, diagnosticsBackend: worker ? 'module worker' : 'main thread', diagnosticsFallbackReason: workerFailure, assetBaseURL: assetURL };
    },
    async debugReadback() { await diagnostics(); const { field, time, steps } = await solver.readbackState(); return { field, grid: p.grid, parameters: { ...p }, time, steps, diagnostics: diag }; },
    setDisplay({ mode = 'density', signs: enabled = false }) { displayMode = ({ density: 0, phase: 1, velocity: 2 })[mode] ?? 0; showSigns = enabled; },
    // Test/recording accelerator: exactly the same real-time solver sequence.
    async debugAdvance(count, onProgress) { const total = count; while (count > 0 && !disposed) { const batch = Math.min(32, count); solver.advance(batch); count -= batch; await withDeadline(device.queue.onSubmittedWorkDone(), 15000, 'The GPU stopped responding while stirring the field.'); onProgress?.({ completed: total - count, total }); } await diagnostics(); },
    dispose() { if (disposed) return; disposed = true; if (pendingMeasurement) { clearTimeout(pendingMeasurement.timer); pendingMeasurement.reject(new Error('Room disposed.')); pendingMeasurement = null; } worker?.terminate(); solver.dispose(); view.destroy(); signs.destroy(); },
  };
}
