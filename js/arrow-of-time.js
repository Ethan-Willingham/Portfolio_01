// Example standalone host. The room owns neither this DOM nor this animation loop.
import { createRoom } from './arrow-of-time-room.js?v=5';
import { prepare, PRESETS, IMAGE_SCALE } from './arrow-of-time-model.js?v=5';
import { checkedShader, fullscreenTriangleWGSL } from './arrow-of-time-gpu.js?v=5';
import { createDrawingEditor, linearInk } from './arrow-of-time-editor.js?v=5';
const $ = id => document.getElementById(id), piece = $('aot-piece'), canvas = $('aot-canvas'), stage = canvas.parentElement;
const motion = matchMedia('(prefers-reduced-motion: reduce)'), listeners = new AbortController();
let room, device, context, scene, sceneView, displayPipeline, displayGroup, adapterInfo, raf = 0, inView = true, manualPause = motion.matches, disposed = false;
let frameTime = 0, clockDebt = 0, activeClock = 0, lastMeasurement = 0, lastUI = 0, needsDraw = true, busy = false;
let fallbackDrawing = null;
let seekRequested = null, seeking = false, measureAfterSeek = false, inkA = linearInk('#24edff'), inkB = linearInk('#8f5cff'), inkC = linearInk('#ff42b3'), inkD = linearInk('#ffce50'), background = linearInk('#090d20'), zoomValue = 6;
let tickBudget = 6, renderDprCap = 3, slowFrames = 0;
const fixedDt = 1 / 60, requestedQuality = new URL(location.href).searchParams.get('quality');
const quality = ['medium','high','ultra'].includes(requestedQuality) ? requestedQuality : 'ultra';
function listen(target, event, handler) { target.addEventListener(event, handler, { signal: listeners.signal }); }
function available() { return room && !manualPause && inView && document.visibilityState !== 'hidden' && !busy && !disposed; }
function updatePlay() { $('aot-play').textContent = manualPause ? 'Play' : 'Pause'; $('aot-play').setAttribute('aria-label', manualPause ? 'Play the spin lattice' : 'Pause the spin lattice'); }
function ui() {
  if (!room) return; const s = room.snapshot();
  const messages = { arrival: 'An image, before it comes apart.', forward: 'The image is coming apart.', turning: 'The rule is about to run backward.', inverse: 'The same rule, in reverse.', checking: 'Comparing every spin in both layers.', returned: 'Every spin has returned.', resetting: 'A new authored image.', seeking: 'Moving through the rendered sequence.', failed: 'The numerical check stopped the piece.' };
  $('aot-phase').textContent = messages[s.phase]; $('aot-caption-detail').textContent = s.phase === 'returned' ? `${s.returnResult.comparedSpins.toLocaleString()} spins, exact` : s.phase === 'inverse' ? `${s.orbitStep.toLocaleString()} inverse steps to return` : 'Every spin keeps its history.';
  if (!seeking) $('aot-timeline').value = s.timelinePosition;
  const position = seeking && seekRequested !== null ? seekRequested : s.timelinePosition, seconds = Math.round(position / 24);
  $('aot-position').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} / 6:00`;
  $('aot-timeline').setAttribute('aria-valuetext', `${position === 0 ? 'Opening image' : position === 8640 ? 'Exact return' : position <= 4320 ? 'Dissolving' : 'Returning'}, ${Math.round(100*position/8640)} percent, step ${position.toLocaleString()} of 8,640`);
  if (!$('aot-instruments').hidden) {
    const rows = [['Energy E / J', s.energyJ.toLocaleString()], ['Energy drift / J', s.energyDriftJ.toString()], ['E / (N J)', s.energyPerSite.toFixed(6)], ['Magnetization, x', s.magnetization.toFixed(4)], ['Flippable sites, x', `${(100 * s.flippableFraction).toFixed(2)}%`], ['Coarse entropy estimator', `${s.coarseEntropyEstimator.toFixed(3)} bits / site`], ['Neighbor correlation, x', s.nearestNeighborCorrelation.toFixed(4)], ['Mean line run, x', `${s.meanLineRunCells?.toFixed(2) || 'unbounded'} cells`], ['Executed / orbit step', `${s.numericalStepCount.toLocaleString()} / ${s.orbitStep.toLocaleString()}`], ['Direction / phase', `${s.direction === 1 ? 'forward' : 'inverse'} / ${s.phase}`], ['Until reversal / return', `${s.stepsUntilReversal.toLocaleString()} / ${s.stepsUntilReturn.toLocaleString()}`], ['Full return comparison', s.returnResult ? s.returnResult.exact ? 'Exact, both layers' : 'Mismatch' : 'Pending this cycle'], ['Configuration', s.configurationId], ['Diagnostic age', s.measurementAvailable ? `${s.diagnosticAgeSteps} steps` : 'Waiting for measurement'], ['Integer checksum', s.checksum], ['Cycle / lattice', `${s.cycle + 1} / ${s.parameters.width} × ${s.parameters.height}`]];
    $('aot-readouts').replaceChildren(...rows.map(([label, value]) => { const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; div.append(dt, dd); return div; }));
    $('aot-preset').value = s.presetIndex < 0 ? 'custom' : PRESETS[s.presetIndex];
  }
  if (s.error) fail(s.error);
}
function resize() {
  if (!device || !displayPipeline || !room || disposed) return;
  const rect = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, renderDprCap);
  const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
  if (scene && canvas.width === width && canvas.height === height) return;
  canvas.width = width; canvas.height = height; scene?.destroy();
  scene = device.createTexture({ size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }); sceneView = scene.createView();
  displayGroup = device.createBindGroup({ layout: displayPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: sceneView }] });
  room.resize({ width, height, dpr }); needsDraw = true; requestDraw();
}
function draw() {
  if (!room || !scene || disposed) return;
  const encoder = device.createCommandEncoder(); room.render({ encoder, targetView: sceneView, width: canvas.width, height: canvas.height, exposure: 1, inkA, inkB, inkC, inkD, background });
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] }); pass.setPipeline(displayPipeline); pass.setBindGroup(0, displayGroup); pass.draw(3); pass.end(); device.queue.submit([encoder.finish()]); needsDraw = false;
}
function requestDraw() { if (!raf && !disposed && room && inView && document.visibilityState !== 'hidden') raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0; if (disposed) return;
  if (available() && frameTime && now - frameTime > 45) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames >= 90) {
    if (tickBudget > 2) tickBudget = 2;
    else if (renderDprCap > 2) { renderDprCap = Math.max(2, renderDprCap - .25); resize(); }
    slowFrames = 0;
  }
  if (available()) {
    const elapsed = frameTime ? Math.min(.1, (now - frameTime) / 1000) : fixedDt; clockDebt = Math.min(.1, clockDebt + elapsed);
    let work = 0; while (clockDebt + 1e-9 >= fixedDt && work < tickBudget) { activeClock += fixedDt; room.step({ dtSeconds: fixedDt, elapsedSeconds: activeClock, scoreSeconds: activeClock }); clockDebt -= fixedDt; work++; }
    needsDraw = true;
    if (now - lastMeasurement > 1500) { lastMeasurement = now; void room.measure().catch(e => fail(e.message)); }
  }
  frameTime = now;
  if (needsDraw && inView && document.visibilityState !== 'hidden') draw();
  if (now - lastUI > 250) { ui(); lastUI = now; }
  if (available()) requestDraw();
}
function suspendOrResume() { frameTime = 0; clockDebt = 0; if (raf) cancelAnimationFrame(raf); raf = 0; if (available() || needsDraw) requestDraw(); }
function still(message) {
  const target = $('aot-still'), width = quality === 'ultra' ? 2048 : quality === 'high' ? 1024 : 768, height = quality === 'ultra' ? 1536 : quality === 'high' ? 768 : 512;
  const s = prepare(width,height,fallbackDrawing ? 'custom' : 'moth',fallbackDrawing), ctx = target.getContext('2d'); target.width = width; target.height = height;
  const data = ctx.createImageData(width,height), inks = [inkA,inkB,inkC,inkD];
  const srgb = v => 255*(v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const u = (col/width-.5)/IMAGE_SCALE+.5, v = (row/height-.5)/IMAGE_SCALE+.5;
    const t = Math.max(0,Math.min(1,(v-.23)*2.1+(u-.5)*.65))*3;
    const lo = Math.min(2,Math.floor(t)), blend = t-lo, i = (row * width + col) * 4;
    for(let channel=0;channel<3;channel++){const ink=inks[lo][channel]*(1-blend)+inks[lo+1][channel]*blend;data.data[i+channel]=srgb(s.x[row*width+col]===-1 ? ink : background[channel]);}data.data[i+3]=255;
  }
  target.style.transform = `scale(${zoomValue})`;
  ctx.putImageData(data, 0, 0); target.hidden = false; canvas.style.visibility = 'hidden'; $('aot-still-label').hidden = false; $('aot-loading').hidden = true;
  $('aot-error').textContent = message; $('aot-error').hidden = false; $('aot-phase').textContent = 'An authored initial state, held still.'; $('aot-caption-detail').textContent = 'No GPU evolution is running.';
  $('aot-adapter').textContent = message; piece.setAttribute('aria-busy', 'false'); $('aot-play').disabled = true; $('aot-restart').disabled = true; $('aot-record').disabled = true; $('aot-timeline').disabled = true; $('aot-render-drawing').disabled = true;
}
function fail(message) { if (disposed) return; manualPause = true; if (raf) cancelAnimationFrame(raf); raf = 0; room?.dispose(); room = null; scene?.destroy(); scene = null; still(message); }
listen($('aot-play'), 'click', () => { manualPause = !manualPause; updatePlay(); ui(); suspendOrResume(); });
listen($('aot-instruments-toggle'), 'click', () => { const panel = $('aot-instruments'); panel.hidden = !panel.hidden; $('aot-instruments-toggle').setAttribute('aria-expanded', String(!panel.hidden)); if(panel.hidden)piece.scrollIntoView({block:'start',behavior:'instant'}); ui(); });
async function restart(id, drawing = null) { if (!room || busy) return; busy = true; suspendOrResume(); try { fallbackDrawing = id === 'custom' ? drawing || fallbackDrawing : null; await room.restart(id, drawing); activeClock = 0; needsDraw = true; ui(); } catch (e) { fail(e.message); } finally { busy = false; suspendOrResume(); } }
listen($('aot-restart'), 'click', () => restart($('aot-preset').value));
listen($('aot-preset'), 'change', e => restart(e.target.value));
listen($('aot-draw-toggle'), 'click', () => {
  const editor=$('aot-editor');editor.hidden=!editor.hidden;$('aot-draw-toggle').setAttribute('aria-expanded',String(!editor.hidden));
  if(!editor.hidden){manualPause=true;updatePlay();suspendOrResume();editor.scrollIntoView({block:'nearest',behavior:'instant'});}else piece.scrollIntoView({block:'start',behavior:'instant'});
});
createDrawingEditor({canvas:$('aot-drawing'),firstInk:$('aot-ink-a'),secondInk:$('aot-ink-b'),thirdInk:$('aot-ink-c'),fourthInk:$('aot-ink-d'),background:$('aot-background'),clear:$('aot-clear'),eraser:$('aot-eraser'),template:$('aot-template'),render:$('aot-render-drawing'),note:$('aot-drawing-note'),signal:listeners.signal,
  onPalette(a,b,c,d,bg){inkA=a;inkB=b;inkC=c;inkD=d;background=bg;stage.style.background=$('aot-background').value;needsDraw=true;if(!room&&!$('aot-still').hidden)still($('aot-error').textContent);requestDraw();},
  async onRender(drawing){manualPause=true;updatePlay();await restart('custom',drawing);$('aot-preset').value='custom';$('aot-editor').hidden=true;$('aot-draw-toggle').setAttribute('aria-expanded','false');piece.scrollIntoView({block:'start',behavior:'instant'});}
});
listen($('aot-timeline'), 'input', async event => {
  seekRequested=Number(event.target.value);manualPause=true;updatePlay();if(seeking)return;
  seeking=true;busy=true;suspendOrResume();
  try {while(seekRequested!==null && room && !disposed){const position=seekRequested;seekRequested=null;await room.seek(position);needsDraw=true;ui();requestDraw();}}
  catch(error){fail(error.message);}finally{seeking=false;busy=false;ui();suspendOrResume();if(measureAfterSeek){measureAfterSeek=false;refreshSeekMeasurements();}}
});
function refreshSeekMeasurements(){if(room)void room.measure().then(ui).catch(error=>fail(error.message));}
listen($('aot-timeline'),'change',()=>{if(seeking)measureAfterSeek=true;else refreshSeekMeasurements();});
listen($('aot-rate'), 'change', e => { room?.setRate(Number(e.target.value)); ui(); });
function setZoom(value) { zoomValue = Math.max(.4,Math.min(16,Number(value)));room?.setZoom(zoomValue);$('aot-zoom').value=zoomValue;$('aot-zoom-value').textContent=`${zoomValue.toFixed(1)}×`;if(!room)$('aot-still').style.transform=`scale(${zoomValue})`;needsDraw=true;requestDraw(); }
listen($('aot-zoom'), 'input', e => setZoom(e.target.value));
listen($('aot-fit'), 'click', () => {const {width,height}=stage.getBoundingClientRect(),s=room?.snapshot().parameters||{width:quality==='ultra'?2048:quality==='high'?1024:768,height:quality==='ultra'?1536:quality==='high'?768:512};const fit=Math.min(width/(s.height*IMAGE_SCALE*.90),height/(s.height*IMAGE_SCALE))*.92,cover=Math.max(width/s.width,height/s.height);setZoom(Math.round(fit/cover*10)/10);});
listen($('aot-record'), 'click', async () => {
  if (!room || busy) return; const parameters = room.snapshot().parameters; const data = await room.debugReadback(), file = { ...data.replay, packedX: data.packedX, packedY: data.packedY, checksum: data.checksum, parameters, host: { activeClock, clockDebt, manualPause, tickBudget, renderDprCap, inkA, inkB, inkC, inkD, background } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'arrow-of-time-state.json'; a.click(); URL.revokeObjectURL(url);
});
async function fullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (piece.classList.contains('aot-fullscreen')) { piece.classList.remove('aot-fullscreen'); document.body.style.overflow = ''; }
  else { try { if (!piece.requestFullscreen) throw new Error('Native fullscreen unavailable'); await piece.requestFullscreen(); } catch { piece.classList.add('aot-fullscreen'); document.body.style.overflow = 'hidden'; } }
  $('aot-fullscreen').textContent = document.fullscreenElement || piece.classList.contains('aot-fullscreen') ? 'Exit fullscreen' : 'Fullscreen'; resize();
}
listen($('aot-fullscreen'), 'click', fullscreen);
listen(document, 'fullscreenchange', () => { $('aot-fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; resize(); });
listen(document, 'keydown', e => { if (e.key === 'Escape' && piece.classList.contains('aot-fullscreen')) fullscreen(); });
listen(document, 'visibilitychange', suspendOrResume);
listen(motion, 'change', e => { if (e.matches) { manualPause = true; updatePlay(); suspendOrResume(); } });
const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
const intersectionObserver = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; suspendOrResume(); }, { threshold: .05 }); intersectionObserver.observe(stage);
function dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(raf); listeners.abort(); resizeObserver.disconnect(); intersectionObserver.disconnect(); room?.dispose(); scene?.destroy(); context?.unconfigure(); device?.destroy(); }
listen(window, 'pagehide', dispose);
try {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. This is a still of the exact CPU-prepared initial state.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) throw new Error('No WebGPU adapter is available. Showing the CPU-prepared initial state.');
  const features = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
  device = await adapter.requestDevice({ requiredFeatures: features }); adapterInfo = { ...adapter.info.toJSON?.(), vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter || false, timestampQueries: features.length > 0 };
  listen(device, 'uncapturederror', e => { console.error('Arrow of time GPU validation:', e.error.message); fail(e.error.message); });
  device.lost.then(info => { if (!disposed) fail(`The GPU device was lost (${info.reason}). Showing the CPU initial state. Reload to resume.`); });
  room = await createRoom({ device, seed: '00000000', quality }); room.setZoom(zoomValue);
  context = canvas.getContext('webgpu'); if (!context) throw new Error('WebGPU canvas initialization failed.');
  const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format, alphaMode: 'opaque' });
  const displayShader = await checkedShader(device, fullscreenTriangleWGSL + `
@group(0) @binding(0) var scene:texture_2d<f32>;
fn srgb(v:vec3f)->vec3f {return select(12.92*v,1.055*pow(max(v,vec3f(0)),vec3f(1./2.4))-.055,v>vec3f(.0031308));}
@fragment fn fragment(@builtin(position) p:vec4f)->@location(0) vec4f {
 let radiance=textureLoad(scene,vec2i(p.xy),0).rgb;
 // Bounded unit exposure is an identity tone map below one, with clipping only above one.
 return vec4f(srgb(clamp(radiance,vec3f(0),vec3f(1))),1);}`, 'Arrow of time display transfer');
  displayPipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: displayShader, entryPoint: 'vertex' }, fragment: { module: displayShader, entryPoint: 'fragment', targets: [{ format }] } });
  $('aot-adapter').textContent = `${adapterInfo.description || adapterInfo.device || adapterInfo.architecture || 'WebGPU adapter'}; ${room.snapshot().parameters.width} × ${room.snapshot().parameters.height}, packed integer dynamics. ${adapterInfo.timestampQueries ? 'GPU timestamp queries available.' : 'GPU timestamps unavailable.'}`;
  $('aot-play').disabled = false; $('aot-restart').disabled = false; $('aot-record').disabled = false; $('aot-timeline').disabled = false; $('aot-render-drawing').disabled = false; $('aot-loading').hidden = true; piece.setAttribute('aria-busy', 'false'); updatePlay(); resize(); ui(); requestDraw();
  // Read-only diagnostics for reproducible browser verification and external hosts.
  window.ArrowOfTime = { snapshot: () => ({ ...room?.snapshot(), manualPause, inView, hidden: document.visibilityState === 'hidden', loopRunning: !!raf, activeClock, tickBudget, renderDprCap, adapter: adapterInfo, seeking, inkA, inkB, inkC, inkD, background }), debugReadback: () => room.debugReadback(), dispose };
} catch (e) { fail(e.message); }
