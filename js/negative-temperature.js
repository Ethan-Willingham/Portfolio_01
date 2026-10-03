import { createRoom, viewHalfSpan } from './negative-temperature-room.js?v=5';
import { DEFAULT_SEED } from './negative-temperature-model.js?v=4';
import { withDeadline } from './negative-temperature-loading.js?v=4';

const $ = id => document.getElementById(id), piece = $('nt-piece'), canvas = $('nt-canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches, onscreen = true, running = false, disposed = false, room = null, device = null, context = null, target = null, presentation = null;
let frame = 0, lastTime = 0, ambientTime = 0, accumulator = 0, reading = 0, starting = false, fallback = false, gpuBusy = false;
const cleanup = [], timings = [], maxDPR = 2.5;
let pixelRatioCap = maxDPR;
const listen = (el, event, fn) => { el.addEventListener(event, fn); cleanup.push(() => el.removeEventListener(event, fn)); };
const fmt = (v, places = 3) => Number.isFinite(v) ? v.toFixed(places) : 'Unavailable';
function controls() { $('nt-play').textContent = paused ? 'Play' : 'Pause'; }
function fail(message) {
  if (fallback || disposed) return;
  fallback = true; paused = true; stop(); $('nt-fallback').hidden = false; canvas.hidden = true;
  $('nt-status').hidden = false; $('nt-status').textContent = `${message} Still recorded from this solver; no live simulation.`;
  $('nt-phase').textContent = 'Recorded solver image'; piece.setAttribute('aria-busy', 'false');
  $('nt-play').disabled = true; $('nt-restart').disabled = false;
  $('nt-restart').textContent = 'Reload'; $('nt-restart').onclick = () => location.reload();
  room?.dispose(); room = null; target?.destroy(); target = null; context?.unconfigure(); device?.destroy();
}
function resize() {
  if (!device || fallback || disposed) return;
  const box = canvas.getBoundingClientRect(), dpr = Math.min(pixelRatioCap, Math.max(2, devicePixelRatio || 1));
  const width = Math.max(1, Math.round(box.width * dpr)), height = Math.max(1, Math.round(box.height * dpr));
  if (canvas.width !== width || canvas.height !== height || !target) {
    canvas.width = width; canvas.height = height; target?.destroy();
    target = device.createTexture({ size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    room?.resize({ width, height, dpr });
    if (presentation) presentation.group = device.createBindGroup({ layout: presentation.layout, entries: [{ binding: 0, resource: target.createView() }] });
  }
  if (room) {
    const span = viewHalfSpan({ width: box.width, height: box.height }, room.snapshot().parameters);
    piece.querySelector('.nt-scale span').style.width = `${Math.min(box.width, box.height) * 10 / (2 * span)}px`;
  }
  draw();
}
function draw() {
  if (!room || !target || !presentation || fallback || disposed || document.hidden || !onscreen) return;
  const encoder = device.createCommandEncoder();
  room.render({ encoder, targetView: target.createView(), width: canvas.width, height: canvas.height, exposure: 1 });
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
  pass.setPipeline(presentation.pipeline); pass.setBindGroup(0, presentation.group); pass.draw(3); pass.end(); device.queue.submit([encoder.finish()]);
}
function readouts() {
  if (!room) return;
  const s = room.snapshot(), d = s.diagnostics;
  if (d?.diagnosticError) { fail(d.diagnosticError); return; }
  $('nt-phase').textContent = `${s.phase}${d?.clustered ? ' / Clustered state' : ''}`;
  if ($('nt-instruments').hidden) return;
  $('nt-configuration').textContent = JSON.stringify(s.parameters, null, 2);
  const pairs = [
    ['Norm N', fmt(d?.norm, 2)], ['Norm drift', `${fmt((d?.normDrift || 0) * 100, 4)}%`],
    ['Energy E', fmt(d?.energy, 2)], ['Temperature', 'Not estimated'],
    ['Vortices + / -', `${d?.positive ?? '?'} / ${d?.negative ?? '?'}`], ['Net winding', String(d?.circulation ?? '?')],
    ['Organization C2', fmt(d?.c2)], ['Largest sign group', String(d?.largestCluster ?? '?')],
    ['Candidate annihilations', String(d?.estimatedAnnihilations ?? '?')], ['Boundary norm fraction', d?.edgeNormFraction?.toExponential(2) ?? '?'],
    ['dx / dt', `${fmt(s.dx)} / ${fmt(s.parameters.dt)}`], ['Healing length / cells', `${fmt(s.healingLength)} / ${fmt(s.healingLengthCells, 2)}`],
    ['Solver time / steps', `${fmt(s.simulationTime, 2)} / ${s.numericalStepCount}`], ['Diagnostic age', `${s.diagnosticAgeSteps} steps`],
    ['Clock mapping', `${s.parameters.solverUnitsPerSecond} model units/s`], ['Grid / precision', `${s.parameters.grid} x ${s.parameters.grid} / f32`],
    ['Render pixels', `${canvas.width} x ${canvas.height}`],
  ];
  $('nt-readouts').replaceChildren(...pairs.map(([name, value]) => { const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; div.append(dt, dd); return div; }));
}
function active() { return !paused && !document.hidden && onscreen && !disposed && !starting && !fallback && !!room; }
function stop() { cancelAnimationFrame(frame); frame = 0; running = false; lastTime = 0; accumulator = 0; }
function updateLoop() { controls(); if (active() && !running) { running = true; lastTime = 0; frame = requestAnimationFrame(tick); } else if (!active()) stop(); }
function tick(time) {
  if (!active()) { stop(); return; }
  const dt = lastTime ? Math.min(0.1, (time - lastTime) / 1000) : 0; lastTime = time;
  // Bound queued work. Slow devices advance the same sequence more slowly.
  if (!gpuBusy) {
    accumulator += dt; let count = 0;
    while (accumulator >= 1 / 60 && count < 4) { ambientTime += 1 / 60; room.step({ dtSeconds: 1 / 60, elapsedSeconds: ambientTime, scoreSeconds: ambientTime }); accumulator -= 1 / 60; count++; }
    if (count === 4) accumulator = Math.min(accumulator, 1 / 60);
    const start = performance.now(); draw(); gpuBusy = true;
    withDeadline(device.queue.onSubmittedWorkDone(), 15000, 'The GPU stopped responding.').then(() => {
      timings.push(performance.now() - start); if (timings.length > 300) timings.shift(); gpuBusy = false;
      if (timings.length >= 60 && pixelRatioCap > 2 && [...timings.slice(-60)].sort((a,b)=>a-b)[30] > 24) { pixelRatioCap = 2; resize(); }
    }).catch(e => fail(e.message));
  }
  if (time - reading > 500) { readouts(); reading = time; }
  frame = requestAnimationFrame(tick);
}
async function restart() {
  if (starting || fallback || disposed) return;
  const seed = $('nt-seed').value.trim();
  if (!/^[0-9a-f]{1,64}$/i.test(seed)) { $('nt-seed').setCustomValidity('Enter 1 to 64 hexadecimal characters.'); $('nt-seed').reportValidity(); return; }
  $('nt-seed').setCustomValidity(''); starting = true; stop(); $('nt-restart').disabled = true; $('nt-play').disabled = true; piece.setAttribute('aria-busy', 'true');
  $('nt-status').hidden = false; $('nt-status').textContent = 'Preparing a condensate with imaginary-time evolution.';
  try {
    await withDeadline(device.queue.onSubmittedWorkDone(), 15000, 'The GPU did not become ready.'); room?.dispose(); room = null;
    room = await createRoom({ device, seed, quality: 'medium', assetBaseURL: new URL('../assets/visualizer/negative-temperature/', import.meta.url).href,
      onProgress({ phase, completed, total }) {
        if (disposed || fallback) throw new Error('Viewer closed.');
        $('nt-status').textContent = phase === 'preparing' ? `Preparing the field, ${Math.round(100 * completed / total)}%.` : phase === 'measuring' ? 'Reading the prepared field.' : 'Starting the superfluid.';
        $('nt-phase').textContent = phase === 'measuring' ? 'Reading the field' : 'Preparing the field';
        piece.dispatchEvent(new Event('negative-temperature-progress'));
      },
    });
    if (disposed || fallback) { room.dispose(); room = null; return; }
    $('nt-status').textContent = 'Advancing the first paddle sweep.';
    const p = room.snapshot().parameters;
    resize();
    await room.debugAdvance(Math.round(p.standaloneStartTime / p.dt), ({ completed, total }) => {
      if (disposed || fallback) return;
      $('nt-phase').textContent = 'Stirring';
      $('nt-status').textContent = `Stirring the field, ${Math.round(100 * completed / total)}%.`;
      piece.dispatchEvent(new Event('negative-temperature-progress'));
      if (!paused) draw();
    });
    if (disposed || fallback) { room?.dispose(); room = null; return; }
    ambientTime = 0; $('nt-status').hidden = true; $('nt-restart').disabled = false; $('nt-play').disabled = false; piece.setAttribute('aria-busy', 'false');
    room.setDisplay({ mode: $('nt-view').value, signs: $('nt-signs').checked }); resize(); readouts();
  } catch (e) { if (!disposed) fail(e.message); }
  finally { starting = false; updateLoop(); }
}
async function fullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (piece.classList.contains('nt-fullscreen')) piece.classList.remove('nt-fullscreen');
  else { try { await piece.requestFullscreen(); } catch { piece.classList.add('nt-fullscreen'); } }
  $('nt-fullscreen').textContent = document.fullscreenElement || piece.classList.contains('nt-fullscreen') ? 'Exit fullscreen' : 'Fullscreen'; resize();
}
function dispose() {
  if (disposed) return; disposed = true; stop(); cleanup.forEach(fn => fn()); observer.disconnect(); intersection.disconnect(); room?.dispose(); target?.destroy(); context?.unconfigure(); device?.destroy();
}
const observer = new ResizeObserver(resize); observer.observe(canvas);
const intersection = new IntersectionObserver(entries => { onscreen = entries[0].isIntersecting; if (onscreen) draw(); updateLoop(); }, { threshold: 0.02 }); intersection.observe(piece);
listen($('nt-play'), 'click', () => { paused = !paused; updateLoop(); });
listen($('nt-restart'), 'click', restart);
listen($('nt-instruments-button'), 'click', () => { const open = $('nt-instruments').hidden; $('nt-instruments').hidden = !open; $('nt-instruments-button').setAttribute('aria-expanded', String(open)); readouts(); });
for (const id of ['nt-view', 'nt-signs']) listen($(id), 'change', () => { room?.setDisplay({ mode: $('nt-view').value, signs: $('nt-signs').checked }); draw(); });
listen($('nt-seed'), 'input', () => $('nt-seed').setCustomValidity(''));
listen($('nt-fullscreen'), 'click', fullscreen);
listen(document, 'fullscreenchange', () => { $('nt-fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; resize(); });
listen(canvas, 'keydown', e => { if (e.code === 'Space') { e.preventDefault(); paused = !paused; updateLoop(); } if (e.key.toLowerCase() === 'f') fullscreen(); });
listen(document, 'keydown', e => { if (e.key === 'Escape' && piece.classList.contains('nt-fullscreen')) { piece.classList.remove('nt-fullscreen'); $('nt-fullscreen').textContent = 'Fullscreen'; resize(); } });
listen(document, 'visibilitychange', () => { if (!document.hidden) draw(); updateLoop(); });
listen(reduced, 'change', () => { if (reduced.matches) { paused = true; updateLoop(); } });
listen(window, 'pagehide', dispose);
listen($('nt-export'), 'click', () => {
  if (!room) return; const blob = new Blob([JSON.stringify(room.snapshot(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'negative-temperature-diagnostics.json'; a.click(); URL.revokeObjectURL(url);
});

window.NegativeTemperature = {
  snapshot: () => room?.snapshot() ?? null,
  activity: () => ({ paused, running, onscreen, starting, fallback, disposed, pixelRatioCap }),
  debugReadback: () => room.debugReadback(),
  async advance(steps) { paused = true; updateLoop(); await device.queue.onSubmittedWorkDone(); await room.debugAdvance(steps); draw(); readouts(); return room.snapshot(); },
  draw, dispose, timings: () => [...timings],
  debugLoseDevice() { device?.destroy(); },
};
try {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable.');
  const adapter = await withDeadline(navigator.gpu.requestAdapter(), 15000, 'The browser did not provide a GPU.'); if (!adapter) throw new Error('No WebGPU adapter is available.');
  if (disposed) throw new Error('Viewer closed.');
  device = await withDeadline(adapter.requestDevice(), 15000, 'The browser did not finish starting the GPU.');
  if (disposed) { device.destroy(); throw new Error('Viewer closed.'); }
  device.lost.then(info => { if (!disposed) fail(`The GPU device was lost (${info.reason}).`); });
  device.addEventListener('uncapturederror', e => { console.error('Superfluid GPU validation:', e.error.message); fail('The GPU could not run this solver.'); });
  const info = adapter.info;
  $('nt-adapter').textContent = `Adapter: ${[info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') || 'not reported'}. Timestamp queries ${adapter.features.has('timestamp-query') ? 'available, not used' : 'unavailable'}.`;
  context = canvas.getContext('webgpu'); const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format, alphaMode: 'opaque' });
  const module = device.createShaderModule({ code: `
@group(0) @binding(0) var scene:texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let a=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(a[i],0.,1.);}
fn srgb(x:vec3f)->vec3f{return select(1.055*pow(x,vec3f(1./2.4))-.055,12.92*x,x<=vec3f(.0031308));}
@fragment fn fragment(@builtin(position) xy:vec4f)->@location(0) vec4f {let linear=textureLoad(scene,vec2i(xy.xy),0).rgb;return vec4f(srgb(linear/(1.+linear)),1.);}` });
  const layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }] });
  presentation = { layout, pipeline: device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } }), group: null };
  const urlSeed = new URL(location.href).searchParams.get('seed'); $('nt-seed').value = urlSeed && /^[0-9a-f]{1,64}$/i.test(urlSeed) ? urlSeed : DEFAULT_SEED;
  await restart();
} catch (e) { if (!disposed) fail(e.message); }
controls();
