// Standalone host. The room owns no DOM, canvas configuration or animation loop.
import { createRoom } from './hydrogen-exactly-room.js?v=6';
import { DISPLAY } from './hydrogen-exactly-shaders.js?v=6';
import * as M from './hydrogen-exactly-math.js?v=2';
const $ = id => document.getElementById(id);
const demo = $('hx-demo'), canvas = $('hx-canvas'), status = $('hx-status');
const controller = new AbortController(), options = { signal: controller.signal };
const seed = '00000000000000000000000000000030';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches, visible = !document.hidden, intersecting = true, disposed = false, running = false;
let device, room, context, scene, display, displayBinding, background, observer, resizeObserver, raf = 0, initializationFailed = false;
let score = 0, speed = 1, exposure = 1, lastFrame = 0, accumulator = 0, lastReadout = 0, createdAt = 0;
let frameCosts = [], slowWindows = 0, nextQuality = 'medium', busy = false, mode = 'revival', updateEvery = 1, updateFrame = 0;
const adapterInfo = {};
let beaconAudit = null;
let cameraYaw = 0.1, cameraTilt = 0.92, drag = null, viewRaf = 0, viewDirty = false;
let inspection = null, inspectionRevision = 0, inspectionRaf = 0, inspectionTimer = 0, picking = false, lastPickAt = 0, renderSerial = 0;
let pinnedLayer = null, pinAnchor = null, pinnedLayerVisible = null, lastPresenceSerial = -1;
const layerTip = $('hx-layer-tip');
const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));
function canSelectLayer() { return !!room && !disposed && !busy && demo.dataset.ready === 'true' && $('hx-view').value === 'volume'; }
function canInspect() { return canSelectLayer() && visible && intersecting; }
function clearInspection() {
  inspection = null; inspectionRevision++; if (!pinnedLayer) layerTip.hidden = true;
  cancelAnimationFrame(inspectionRaf); clearTimeout(inspectionTimer); inspectionRaf = 0; inspectionTimer = 0;
  // Pointer exit can cancel a pending presence check on an otherwise still view.
  if (pinnedLayer) requestInspection();
}
function fillLayerInfo(element, layer) {
  if (element.dataset.layer === String(layer.index) && element.dataset.mode === layer.mode) return;
  element.dataset.layer = layer.index; element.dataset.mode = layer.mode;
  element.querySelector('[data-layer-title]').textContent = `Density layer ${layer.index + 1} of 6`;
  element.querySelector('[data-layer-relative]').textContent = layer.index ? `${layer.relativeDensity} times the outermost layer's density, and 3 times layer ${layer.index}.` : 'The lowest displayed density. Fainter probability tails extend beyond this surface.';
  element.querySelector('[data-layer-meaning]').textContent = 'All six layers describe the same electron. Higher density means a greater chance of finding it in an equally small region.';
  element.querySelector('[data-layer-value]').textContent = `Surface density: ${layer.densityPerNmCubed.toExponential(2)} per nm³. This is density, not a percentage enclosed.`;
}
function placeLayerTip(point) {
  const box = canvas.getBoundingClientRect(), card = layerTip.getBoundingClientRect();
  let x = point.x - box.left + 18, y = point.y - box.top + 18;
  if (point.kind === 'touch') { x = (box.width - card.width) / 2; y = 82; }
  else if (point.kind === 'keyboard') { x = box.width - card.width - 16; y = box.height - card.height - 68; }
  else { if (x + card.width > box.width - 12) x = point.x - box.left - card.width - 18; if (y + card.height > box.height - 12) y = point.y - box.top - card.height - 18; }
  layerTip.style.left = `${Math.max(12, Math.min(x, box.width - card.width - 12))}px`;
  layerTip.style.top = `${Math.max(12, Math.min(y, box.height - card.height - 12))}px`;
}
function placePinnedTip() {
  if (!pinnedLayer || !pinAnchor) return;
  const box = canvas.getBoundingClientRect();
  const kind = box.height < 300 && box.width > 650 ? 'keyboard' : pinAnchor.kind;
  placeLayerTip({ x: box.left + box.width * pinAnchor.u, y: box.top + box.height * pinAnchor.v, kind });
}
function selectionUI() {
  layerTip.dataset.pinned = String(!!pinnedLayer);
  layerTip.setAttribute('role', pinnedLayer ? 'group' : 'tooltip');
  $('hx-clear-layer').hidden = !pinnedLayer; $('hx-layer-selection').hidden = !pinnedLayer;
  for (const button of $('hx-density-guide').querySelectorAll('button')) button.setAttribute('aria-pressed', String(+button.dataset.densityLayer === pinnedLayer?.index));
  $('hx-inspection-hint').textContent = pinnedLayer ? `Layer ${pinnedLayer.index + 1} pinned` : 'Hover to inspect. Click or tap to pin.';
}
function selectionMessage(text) {
  const label = $('hx-layer-selection');
  if (label.textContent !== text) label.textContent = text;
}
function clearPinnedLayer(redraw = true) {
  if (layerTip.contains(document.activeElement)) canvas.focus({ preventScroll: true });
  pinnedLayer = null; pinAnchor = null; pinnedLayerVisible = null; lastPresenceSerial = -1;
  room?.setPresentation({ selectedLayer: null }); clearInspection(); selectionUI();
  if (redraw) render();
}
function pinLayer(layer, point) {
  clearInspection(); pinnedLayer = layer; pinnedLayerVisible = null; lastPresenceSerial = -1;
  const box = canvas.getBoundingClientRect();
  pinAnchor = point ? { u: (point.x - box.left) / box.width, v: (point.y - box.top) / box.height, kind: point.kind } : { u: 1, v: 1, kind: 'keyboard' };
  room.setPresentation({ selectedLayer: layer.index }); fillLayerInfo(layerTip, layer);
  selectionMessage('Pinned. Checking the current view.');
  layerTip.dataset.visible = 'unknown'; layerTip.hidden = false; selectionUI(); placePinnedTip(); render();
}
function requestInspection() {
  if ((!inspection && !pinnedLayer) || !canInspect() || (drag && !pinnedLayer) || picking || inspectionRaf || inspectionTimer) return;
  if (pinnedLayer && !inspection?.pin && lastPresenceSerial === renderSerial) return;
  const delay = inspection?.pin ? 0 : Math.max(0, 110 - (performance.now() - lastPickAt));
  if (delay) { inspectionTimer = setTimeout(() => { inspectionTimer = 0; requestInspection(); }, delay); return; }
  const inspect = async () => {
    inspectionRaf = 0;
    if ((!inspection && !pinnedLayer) || !canInspect() || (drag && !pinnedLayer)) return;
    const point = inspection, revision = inspectionRevision, serial = renderSerial, box = canvas.getBoundingClientRect();
    const selected = point?.pin ? null : pinnedLayer;
    picking = true; lastPickAt = performance.now();
    try {
      if (selected) {
        const presence = await room.readLayerPresence();
        if (revision !== inspectionRevision || selected !== pinnedLayer || !canInspect()) return;
        if (presence?.mode === selected.mode) {
          pinnedLayerVisible = presence.visibleLayers.includes(selected.index); lastPresenceSerial = serial;
          layerTip.dataset.visible = String(pinnedLayerVisible); layerTip.dataset.score = presence.scoreSeconds;
          selectionMessage(pinnedLayerVisible ? 'Pinned. This layer is highlighted.' : 'Pinned. This layer is not visible in the current view. It will highlight when it returns.');
          placePinnedTip();
        }
        return;
      }
      const layer = await room.pickLayer({ u: (point.x - box.left) / box.width, v: (point.y - box.top) / box.height });
      if (revision !== inspectionRevision || !canInspect() || drag) return;
      if (point.pin) { if (layer) pinLayer(layer, point); else clearPinnedLayer(); return; }
      if (!layer) { layerTip.hidden = true; return; }
      fillLayerInfo(layerTip, layer); layerTip.dataset.score = layer.scoreSeconds; layerTip.hidden = false; placeLayerTip(point);
    } catch { if (revision === inspectionRevision && !pinnedLayer) layerTip.hidden = true; }
    finally { picking = false; if ((inspection || pinnedLayer) && (revision !== inspectionRevision || serial !== renderSerial)) requestInspection(); }
  };
  // Submit an explicit click pick before the next animation render when idle.
  if (inspection?.pin) void inspect(); else inspectionRaf = requestAnimationFrame(inspect);
}
function inspectPoint(e, pin = false) {
  if (!canInspect() || (!pin && (pinnedLayer || inspection?.pin))) return;
  inspection = { x: e.clientX, y: e.clientY, kind: e.pointerType === 'touch' ? 'touch' : 'mouse', pin }; inspectionRevision++;
  if (pin) { cancelAnimationFrame(inspectionRaf); clearTimeout(inspectionTimer); inspectionRaf = 0; inspectionTimer = 0; }
  requestInspection();
}
function updateLayerGuide() {
  const active = !!room && !disposed && demo.dataset.ready === 'true' && $('hx-view').value === 'volume';
  $('hx-density-guide').hidden = !active; $('hx-inspection-hint').hidden = !active;
  selectionUI();
  for (const button of $('hx-density-guide').querySelectorAll('button')) button.disabled = !active;
  if (!active) clearInspection();
  if (pinnedLayer && !active) {
    pinnedLayerVisible = null; layerTip.dataset.visible = 'unknown';
    selectionMessage('Pinned. Switch to Density contours to see this highlight.');
    placePinnedTip();
  }
}
function canRotate() { return !!room && !disposed && !busy && demo.dataset.ready === 'true' && $('hx-view').value !== 'section'; }
function endDrag() {
  const pointer = drag?.pointerId; drag = null; delete canvas.dataset.dragging;
  if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
}
function cameraInteraction() {
  const active = canRotate(); canvas.dataset.rotatable = String(active);
  $('hx-rotation-hint').hidden = !active; $('hx-reset-view').disabled = !active;
  if (!active) endDrag();
  updateLayerGuide();
}
function setCamera(yaw, tilt) {
  if (!canRotate()) return;
  if (![yaw, tilt].every(Number.isFinite)) throw new Error('Camera angles must be finite.');
  cameraYaw = wrapAngle(yaw); cameraTilt = wrapAngle(tilt);
  room.setPresentation({ yaw: cameraYaw, tilt: cameraTilt }); viewDirty = true;
  // One pending redraw coalesces pointer events and also works while paused.
  if (!viewRaf) viewRaf = requestAnimationFrame(() => {
    viewRaf = 0;
    if (viewDirty && canRotate() && visible && intersecting) render();
  });
}
function resetView() { setCamera(0.1, 0.92); }
function tokenRGB(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const c = document.createElement('canvas').getContext('2d'); c.fillStyle = value; c.fillRect(0, 0, 1, 1);
  return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
}
function playLabel() { $('hx-play').textContent = paused ? 'Play' : 'Pause'; $('hx-play').setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation'); }
function signal(message) { status.textContent = message; status.hidden = false; }
function fallback(message) {
  clearPinnedLayer(false);
  demo.dataset.ready = 'false'; demo.setAttribute('aria-busy', 'false'); signal(message);
  $('hx-mode-label').textContent = 'Computed initial section'; $('hx-encoding-label').textContent = 'CPU still, t = 0';
  $('hx-caption').textContent = '13 circular states, n = 24 to 36'; $('hx-scale').textContent = 'Characteristic radius 47.6 nm';
  for (const element of demo.querySelectorAll('input, select, #hx-events button, #hx-play, #hx-restart, #hx-measure')) element.disabled = true;
  $('hx-play').textContent = 'Still';
  cameraInteraction();
}
function stop() { running = false; cancelAnimationFrame(raf); cancelAnimationFrame(viewRaf); raf = 0; viewRaf = 0; accumulator = 0; lastFrame = 0; }
function schedule() {
  if (disposed || !room || paused || !visible || !intersecting || running || busy) return;
  running = true; lastFrame = 0; raf = requestAnimationFrame(frame);
}
function render() {
  if (!device || !scene || disposed) return;
  viewDirty = false;
  const encoder = device.createCommandEncoder();
  room.render({ encoder, targetView: scene.createView(), width: canvas.width, height: canvas.height, exposure });
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
  pass.setPipeline(display); pass.setBindGroup(0, displayBinding); pass.draw(3); pass.end(); device.queue.submit([encoder.finish()]);
  renderSerial++; requestInspection();
}
function resize() {
  if (!room || disposed) return;
  const box = $('hx-stage').getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 2), factor = Math.min(1, 1800 / (Math.max(box.width, box.height) * dpr));
  const width = Math.max(1, Math.floor(box.width * dpr * factor)), height = Math.max(1, Math.floor(box.height * dpr * factor));
  if (scene && width === canvas.width && height === canvas.height) return;
  clearInspection();
  canvas.width = width; canvas.height = height; scene?.destroy();
  scene = device.createTexture({ size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  displayBinding = device.createBindGroup({ layout: display.getBindGroupLayout(0), entries: [{ binding: 0, resource: scene.createView() }, { binding: 1, resource: device.createSampler({ minFilter: 'linear', magFilter: 'linear' }) }, { binding: 2, resource: { buffer: background } }] });
  room.resize({ width, height, dpr }); placePinnedTip(); render();
}
function updateReadouts() {
  if (!room) return;
  const s = room.snapshot();
  $('hx-clock').textContent = `${Math.floor(score / 60)}:${String(Math.floor(score % 60)).padStart(2, '0')}`;
  $('hx-time').max = Math.max(mode === 'spectral' ? 60 : 900, Math.ceil(score / 300) * 300);
  $('hx-time').value = score; $('hx-time-output').value = `${score.toFixed(1)} s`;
  $('hx-norm').textContent = s.analyticNorm.toFixed(6);
  $('hx-overlap').textContent = s.autocorrelation.toFixed(3);
  $('hx-fidelity').textContent = s.rotationAdjustedOverlap === null ? 'Not used' : s.rotationAdjustedOverlap.toFixed(3);
  const ps = s.simulationTimeSeconds * 1e12;
  $('hx-physical-time').textContent = mode === 'spectral' ? `${(ps * 1000).toFixed(2)} fs` : `${ps.toFixed(2)} ps`;
  if (mode === 'spectral') {
    const t = s.simulationTime, cc = M.phases(M.SPECTRAL, t);
    const a = M.eigenstate(M.SPECTRAL[0], 0, 0, 3), b = M.eigenstate(M.SPECTRAL[1], 0, 0, 3);
    const cross = 2 * a[0] * b[0] * (cc[0][0] * cc[1][0] + cc[0][1] * cc[1][1]);
    $('hx-signed').textContent = `At (0, 0, 3) a0: signed 2p / 3s term ${cross.toExponential(3)} a0^-3; complete positive density ${M.wavefunction(M.SPECTRAL, 0, 0, 3, t).rho.toExponential(3)} a0^-3. Red marks positive sign; muted blue-gray marks negative sign in the diagnostic view.`;
  }
  $('hx-runtime').textContent = `${s.parameterValues.grid} cubed, ${s.parameterValues.raySteps} ray samples. f32 evaluation; f16 display storage. Local replay; deterministic coefficients, no random seed draw. ${adapterInfo.description || adapterInfo.device || 'WebGPU adapter'}.`;
}
function frame(now) {
  if (!running || disposed) return;
  const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0; lastFrame = now; accumulator += delta;
  let count = 0;
  while (accumulator >= 1 / 30 && count < 2) {
    accumulator -= 1 / 30; score += speed / 30; count++;
  }
  if (count && ++updateFrame % updateEvery === 0) {
    // Analytic evolution has no integration history. Evaluate only the final clock
    // tick needed for this frame, while preserving the fixed 1/30 ambient clock.
    room.step({ dtSeconds: 1 / 30, elapsedSeconds: (now - createdAt) / 1000, scoreSeconds: score });
    render(); frameCosts.push(delta * 1000);
    if (frameCosts.length >= 120) {
      frameCosts.sort((a, b) => a - b);
      slowWindows = frameCosts[60] > 65 ? slowWindows + 1 : 0; frameCosts = [];
      if (slowWindows >= 2) {
        if (updateEvery === 1) { updateEvery = 2; signal('Density is evaluated less often on this device. The analytic state still follows the same local clock.'); }
        else if (nextQuality !== 'low') { nextQuality = 'low'; room.setQuality('low'); $('hx-quality').value = 'low'; signal('Sampling reduced to 64 cubed for this device. The state list and physical time scale are unchanged.'); }
        slowWindows = 0;
      }
    }
  }
  if (now - lastReadout > 250) { updateReadouts(); lastReadout = now; }
  raf = requestAnimationFrame(frame);
}
function seek(seconds) {
  score = Math.max(0, Number(seconds)); accumulator = 0;
  room?.step({ dtSeconds: 1 / 30, elapsedSeconds: Math.max(0, (performance.now() - createdAt) / 1000), scoreSeconds: score }); render(); updateReadouts();
}
function toggleInstruments() {
  const open = $('hx-instruments').hidden;
  $('hx-instruments').hidden = !open; $('hx-instruments-toggle').setAttribute('aria-expanded', String(open));
}
async function fullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (demo.classList.contains('hx-pseudo-fullscreen')) { demo.classList.remove('hx-pseudo-fullscreen'); document.body.style.overflow = ''; }
  else {
    try { await demo.requestFullscreen(); }
    catch { demo.classList.add('hx-pseudo-fullscreen'); document.body.style.overflow = 'hidden'; }
  }
  fullscreenLabel(); resize();
}
function fullscreenLabel() {
  const full = !!document.fullscreenElement || demo.classList.contains('hx-pseudo-fullscreen');
  $('hx-fullscreen').textContent = full ? 'Exit fullscreen' : 'Fullscreen'; $('hx-fullscreen').setAttribute('aria-label', full ? 'Exit fullscreen' : 'Enter fullscreen');
}
function setMode(value) {
  clearPinnedLayer(false); $('hx-layer-detail').hidden = true;
  mode = value; room.setMode(value); score = 0; accumulator = 0;
  $('hx-spectrum').hidden = value !== 'spectral'; $('hx-events').hidden = value === 'spectral';
  for (const option of $('hx-color').options) option.disabled = value !== 'spectral' && ['1','2'].includes(option.value);
  $('hx-event-note').hidden = value === 'spectral'; $('hx-time').max = value === 'spectral' ? 60 : 900;
  $('hx-mode-label').textContent = value === 'spectral' ? 'Low-n superposition' : 'Circular packet';
  $('hx-encoding-label').textContent = value === 'spectral' ? 'Spectral-frequency false color' : 'Density false color, cyan to gold';
  $('hx-caption').textContent = value === 'spectral' ? '2p_z + 3s + 4s + 5s, equal amplitudes' : '13 circular states, n = 24 to 36';
  $('hx-scale').textContent = value === 'spectral' ? 'n = 5 extent scale 1.32 nm' : 'Characteristic radius 47.6 nm';
  $('hx-speed').options[0].textContent = value === 'spectral' ? '1x, 24 atomic time units per second' : '1x, 10 seconds per orbit';
  for (const option of $('hx-speed').options) option.disabled = value === 'spectral' && +option.value > 4;
  if (value === 'spectral' && speed > 4) { speed = 1; $('hx-speed').value = '1'; }
  $('hx-model-note').textContent = value === 'spectral' ? 'All six cross terms are included in the density. Three visible pairs use CIE hues; the other three are infrared. Actual dipole emission obeys selection rules. No emitted light is simulated.' : 'E_n = -1 / (2n²). One orbit is 10 display seconds; the approximate revival scale is 200 s. Finite-grid box mass is measured only on demand.';
  $('hx-color').value = value === 'spectral' ? '1' : '3'; $('hx-measurement').textContent = 'Analytic norm is the integral over all space. A finite render box captures less.';
  room.step({ dtSeconds: 1 / 30, elapsedSeconds: 0, scoreSeconds: 0 }); render(); updateReadouts();
}
$('hx-play').addEventListener('click', () => { paused = !paused; playLabel(); if (paused) stop(); else schedule(); }, options);
$('hx-instruments-toggle').addEventListener('click', toggleInstruments, options);
$('hx-restart').addEventListener('click', () => seek(0), options);
$('hx-reset-view').addEventListener('click', resetView, options);
$('hx-clear-layer').addEventListener('click', () => clearPinnedLayer(), options);
for (const name of ['click', 'focusin']) $('hx-density-guide').addEventListener(name, e => {
  const button = e.target.closest('button[data-density-layer]'); if (!button || !canSelectLayer()) return;
  fillLayerInfo($('hx-layer-detail'), room.densityLayers()[+button.dataset.densityLayer]); $('hx-layer-detail').hidden = false;
  if (name === 'click') pinLayer(room.densityLayers()[+button.dataset.densityLayer]);
}, options);
$('hx-fullscreen').addEventListener('click', fullscreen, options);
$('hx-mode').addEventListener('change', e => setMode(e.target.value), options);
$('hx-view').addEventListener('change', e => { room.setPresentation({ section: e.target.value === 'section', soft: e.target.value === 'soft' }); cameraInteraction(); render(); }, options);
$('hx-color').addEventListener('change', e => { room.setPresentation({ overlay: e.target.value }); $('hx-encoding-label').textContent = ['Probability density', 'Spectral-frequency false color', 'Signed 2p / 3s diagnostic', 'Density false color, cyan to gold'][+e.target.value]; render(); }, options);
$('hx-quality').addEventListener('change', e => { nextQuality = e.target.value; room.setQuality(nextQuality); render(); updateReadouts(); }, options);
$('hx-speed').addEventListener('change', e => { speed = +e.target.value; }, options);
$('hx-exposure').addEventListener('input', e => { exposure = +e.target.value; render(); }, options);
$('hx-time').addEventListener('input', e => seek(e.target.value), options);
$('hx-events').addEventListener('click', e => {
  const button = e.target.closest('button[data-time]'); if (!button) return;
  seek(button.dataset.time);
  const p = M.ringProfile(score), f = room.snapshot().rotationAdjustedOverlap;
  $('hx-event-note').textContent = `${score.toFixed(1)} s: ${p.peaks.length} prominent equatorial maxima; rotation-adjusted overlap ${f.toFixed(3)}. ${score === 750 ? 'The cited Tsr / 6 time is not a strong superrevival for this finite packet.' : 'Peak threshold is 22% of the cut maximum. The volume is the same evolving wavefunction.'}`;
}, options);
$('hx-measure').addEventListener('click', async () => {
  if (busy || !room) return; busy = true; stop(); $('hx-measure').disabled = true;
  try { const s = await room.debugReadback(); $('hx-measurement').textContent = `Measured box mass ${s.spatialCapturedMass.toFixed(6)} at display time ${s.scoreSeconds.toFixed(1)} s (${s.parameterValues.grid} cubed). Analytic norm ${s.analyticNorm.toFixed(6)}. This measurement belongs to that sampled frame.`; }
  catch (error) { $('hx-measurement').textContent = error.message; }
  finally { busy = false; $('hx-measure').disabled = false; schedule(); }
}, options);
$('hx-beacon').addEventListener('click', async () => {
  $('hx-beacon').disabled = true; $('hx-beacon-status').textContent = 'Checking the bundled signature against the pinned quicknet chain.';
  try {
    const { verifyFixture } = await import('./hydrogen-exactly-beacon.js');
    const result = await verifyFixture({ signal: controller.signal });
    if (disposed) return;
    beaconAudit = result;
    try { localStorage.setItem('hydrogen-exactly-beacon-seed', JSON.stringify(result)); } catch { /* Storage is optional. */ }
    $('hx-beacon-status').textContent = 'Verified: bundled quicknet round 42, including its BLS signature. Historical seed cached locally; it is unused by the deterministic hydrogen model.';
  } catch (error) { if (!disposed) $('hx-beacon-status').textContent = `Beacon audit failed: ${error.message}. The deterministic wavefunction continues independently.`; }
  finally { if (!disposed) $('hx-beacon').disabled = false; }
}, options);
document.addEventListener('fullscreenchange', () => { fullscreenLabel(); resize(); }, options);
canvas.addEventListener('pointerdown', e => {
  if (!canRotate() || !visible || !intersecting || !e.isPrimary || e.button !== 0 || drag) return;
  clearInspection(); e.preventDefault(); canvas.focus({ preventScroll: true });
  drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }; canvas.dataset.dragging = 'true';
  canvas.setPointerCapture(e.pointerId);
}, options);
canvas.addEventListener('pointermove', e => {
  if (!drag) { if (e.pointerType !== 'touch' && !e.buttons) inspectPoint(e); return; }
  if (drag.pointerId !== e.pointerId || !canRotate()) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= 6) return;
  drag.moved = true;
  const scale = 4 / Math.min(canvas.clientWidth, canvas.clientHeight);
  setCamera(cameraYaw + (e.clientX - drag.x) * scale, cameraTilt + (e.clientY - drag.y) * scale);
  drag.x = e.clientX; drag.y = e.clientY;
}, options);
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, e => {
  if (drag?.pointerId !== e.pointerId) return;
  const tap = name === 'pointerup' && !drag.moved;
  endDrag(); if (tap) inspectPoint(e, true); else requestInspection();
}, options);
canvas.addEventListener('pointerleave', () => { if (!inspection?.pin && inspection?.kind !== 'touch') clearInspection(); }, options);
document.addEventListener('pointerdown', e => { if (e.target !== canvas) clearInspection(); }, options);
window.addEventListener('scroll', clearInspection, { ...options, passive: true });
document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (!visible) { clearInspection(); endDrag(); stop(); } else { if (viewDirty) setCamera(cameraYaw, cameraTilt); schedule(); requestInspection(); } }, options);
demo.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (pinnedLayer) { e.preventDefault(); clearPinnedLayer(); } else clearInspection(); return; }
  if (e.target.matches('input,select,button')) return;
  if (e.target === canvas && canRotate()) {
    const step = e.shiftKey ? 0.3 : 0.12;
    const turns = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (turns[e.key]) { e.preventDefault(); setCamera(cameraYaw + turns[e.key][0], cameraTilt + turns[e.key][1]); return; }
    if (e.key === 'Home') { e.preventDefault(); resetView(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); $('hx-play').click(); }
  if (e.key.toLowerCase() === 'f') fullscreen();
  if (e.key.toLowerCase() === 'i') toggleInstruments();
  if (e.key.toLowerCase() === 'r') seek(0);
}, options);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && demo.classList.contains('hx-pseudo-fullscreen')) fullscreen(); }, options);
function dispose() {
  if (disposed) return; clearPinnedLayer(false); endDrag(); disposed = true; stop(); cameraInteraction(); controller.abort(); observer?.disconnect(); resizeObserver?.disconnect(); room?.dispose(); scene?.destroy(); background?.destroy(); context?.unconfigure(); device?.destroy();
}
window.addEventListener('pagehide', dispose, options);
playLabel();
async function init() {
  try {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable. This still is a CPU-computed equatorial density section at t = 0, not a running simulation.');
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error('No WebGPU adapter. Showing a CPU-computed equatorial density section at t = 0.');
    Object.assign(adapterInfo, { vendor: adapter.info?.vendor, device: adapter.info?.device, description: adapter.info?.description, architecture: adapter.info?.architecture, isFallbackAdapter: adapter.info?.isFallbackAdapter, timestampQueriesAvailable: adapter.features.has('timestamp-query') });
    device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', e => { console.error('Hydrogen WebGPU:', e.error.message); signal(`GPU validation error: ${e.error.message}`); paused = true; playLabel(); stop(); }, options);
    device.lost.then(info => {
      if (!disposed && !initializationFailed) {
        stop(); paused = true; room?.dispose(); scene?.destroy(); background?.destroy(); context?.unconfigure();
        fallback(`GPU device lost: ${info.message}. Showing the CPU-computed initial density section.`);
      }
    });
    room = await createRoom({ device, seed, quality: 'medium' });
    createdAt = performance.now();
    room.setPresentation({ tint: tokenRGB('--accent') });
    context = canvas.getContext('webgpu'); if (!context) throw new Error('WebGPU canvas is unavailable.');
    const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ code: DISPLAY });
    display = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
    background = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(background, 0, new Float32Array([...tokenRGB('--bg-raised'), 0]));
    const spectral = room.snapshot(); room.setMode('spectral');
    for (const pair of room.snapshot().wavelengths) {
      const div = document.createElement('div'); div.className = 'hx-line';
      const rgb = pair.linearRGB;
      if (rgb) { const swatch = document.createElement('span'); swatch.className = 'hx-swatch'; swatch.style.background = `color(srgb-linear ${rgb.join(' ')})`; div.append(swatch); }
      div.append(document.createTextNode(`${M.SPECTRAL[pair.a].n} / ${M.SPECTRAL[pair.b].n}: ${pair.wavelengthNm.toFixed(3)} nm${rgb ? ' vacuum' : ' (infrared)'}`)); $('hx-lines').append(div);
    }
    room.setMode(spectral.mode);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe($('hx-stage'));
    observer = new IntersectionObserver(entries => { intersecting = entries[0].isIntersecting; if (!intersecting) { clearInspection(); endDrag(); stop(); } else { if (viewDirty) setCamera(cameraYaw, cameraTilt); schedule(); requestInspection(); } }); observer.observe($('hx-stage'));
    demo.dataset.ready = 'true'; demo.setAttribute('aria-busy', 'false'); status.hidden = true;
    cameraInteraction();
    resize(); seek(0); schedule();
    // Small explicit diagnostics surface for model and lifecycle browser checks.
    window.HydrogenExactly = {
      snapshot: () => ({ ...room.snapshot(), paused, running, visible, intersecting, cameraDragging: !!drag, pinnedLayer: pinnedLayer?.index ?? null, pinnedLayerVisible, adapter: adapterInfo, renderWidth: canvas.width, renderHeight: canvas.height, evaluationCadenceDivider: updateEvery, beaconAudit }),
      seek, setMode: value => { $('hx-mode').value = value; setMode(value); },
      setCamera: ({ yaw, tilt }) => setCamera(yaw, tilt), resetView,
      pickLayer: point => room.pickLayer(point),
      readLayerPresence: () => room.readLayerPresence(), clearPinnedLayer: () => clearPinnedLayer(),
      debugReadback: async () => { const resume = !paused; busy = true; stop(); try { return await room.debugReadback(); } finally { busy = false; if (resume) schedule(); } },
      benchmark: async count => { busy = true; stop(); try { return await room.benchmark(count); } finally { busy = false; schedule(); } },
      debugLoseDevice: () => device.destroy(), dispose
    };
  } catch (error) {
    initializationFailed = true;
    stop(); room?.dispose(); scene?.destroy(); background?.destroy(); context?.unconfigure(); device?.destroy();
    fallback(`${error.message} Showing the CPU-computed initial density section at t = 0.`);
  }
}
init();
