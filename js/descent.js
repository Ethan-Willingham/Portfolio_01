import { VERSION, ROUTE, ROOMS, BOOTSTRAP, FIXED_DT, PLAYBACK_RATES, ModuleRegistry, RoomManager, RouteClock, AmbientClock, CostSamples, scaleLabel, routeCompleteness, deriveRoomSeed } from './descent-host.js?v=4';
import { offlineSeed, validSeed, verifyBeaconSeed, fetchBeaconSeed } from './descent-seed.js';
import { configureRoom, exposureFor, parametersOf, roomPresentation } from './descent-room-adapters.js?v=4';

const $ = id => document.getElementById(`descent-${id}`);
const piece = document.getElementById('descent');
const canvas = $('canvas');
const STORAGE = 'descent-v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const lifetime = new AbortController();
const registry = new ModuleRegistry();
const ambient = new AmbientClock();
const costs = new CostSamples();
const measured = {};
let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORAGE)); if (saved?.version !== 1 || !validSeed(saved.seed?.seed)) saved = null; } catch (_) { /* private storage may be unavailable */ }
let seed = saved?.seed ?? offlineSeed();
// A cached string does not establish cryptographic verification on this load.
if (seed.beacon) seed = { ...seed, source: 'Cached beacon seed, verification pending' };
let manualPaused = reducedMotion.matches || saved?.paused === true;
let automatic = !reducedMotion.matches && saved?.automatic !== false;
let playbackRate = !reducedMotion.matches && PLAYBACK_RATES.includes(saved?.playbackRate) ? saved.playbackRate : 1;
const PRESENTATION_REVISION = 3;
let quality = saved?.presentationRevision === PRESENTATION_REVISION && ['low','medium','high'].includes(saved?.quality) ? saved.quality : 'high';
let preferences = {hydrogenMode:['spectral','revival'].includes(saved?.preferences?.hydrogenMode)?saved.preferences.hydrogenMode:'spectral'};
let clock = new RouteClock(saved?.clock);
let roomId = ROOMS.some(r=>r.id===saved?.roomId) ? saved.roomId : null;
if (saved?.roomId && !roomId) { saved.visit = null; clock = new RouteClock(); }
let manager, device, adapter, context, presenter, displayUniform, displayBind, presentationTarget;
let loading = false, hidden = document.hidden, offscreen = false, deviceLost = false, disposed = false;
let raf = 0, dirty = true, lastUi = 0, lastSave = 0, renderCount = 0, replayRemaining = 0, replayTotal = 0;
let replayExpected = null, replayValidation = null;
let gpuQueuePending = false, lastGpuQueueMs = 0, roomWorkPending = null;
let requestedReplay = saved?.visit ?? null;
let roomRequest = 0, beaconRequest = null, beaconTimer = null, renderDpr = 2, slowFrames = 0;
let replayMeaning = 'Every visit starts from a recorded seed. Floating-point replay can differ across devices.';
let seedError = null;
const roomCosts = {};
function active() { return !manualPaused && !hidden && !offscreen && !loading && !deviceLost && !disposed && !roomWorkPending && (!!manager?.active || (automatic && roomId !== BOOTSTRAP.id)); }
function message(title, detail) { $('message').hidden = !title; $('message-title').textContent = title ?? ''; $('message-detail').textContent = detail ?? ''; }
function setBusy(value) { loading = value; piece.setAttribute('aria-busy', String(value)); ambient.reset(); }
function currentCosts() { return roomCosts[roomId] ??= new CostSamples(); }
function textRow(label, value) {
  const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label;
  dd.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value); return [dt,dd];
}
function dependencyText() {
  const state = routeCompleteness(registry, measured);
  if (state.missing.length) return `Route incomplete: ${state.modulesReady} of ${ROUTE.length} modules available. Showing an explicitly labeled interim study when a route room is unavailable.`;
  if (!state.complete) return 'About nine minutes through three rooms, with dark rests. Instruments opens direct room choices.';
  return 'Three rooms reporting live state. About nine minutes per journey, with dark rests.';
}
function updateUI(force = false) {
  const now = performance.now(); if (!force && now - lastUi < 500) return; lastUi = now;
  $('pause').textContent = manualPaused ? 'Play' : 'Pause';
  $('pause').disabled = !device || deviceLost;
  $('speed').textContent = `Speed: ${playbackRate}x`;
  $('speed').setAttribute('aria-label', `Playback speed ${playbackRate}x. Change to ${PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate)+1)%PLAYBACK_RATES.length]}x.`);
  for(const id of ['room','position','auto','quality','hydrogen-mode','speed','next'])$(id).disabled=!device||deviceLost;
  $('auto').checked = automatic; $('quality').value = quality;
  $('instruments').setAttribute('aria-expanded', String(!$('panel').hidden));
  if (document.activeElement !== $('position')) $('position').value = String(Math.floor(clock.position));
  const p = Math.floor(clock.position); $('position-label').textContent = `${Math.floor(p/60)}:${String(p%60).padStart(2,'0')} / about 9:00`;
  $('progress').style.width = `${clock.position/(ROUTE.length*180)*100}%`;
  $('seed-origin').textContent = `${seedError?`Beacon unavailable: ${seedError}. Kept the existing seed. `:''}${seed.source}${seed.round ? `, round ${seed.round}` : ''}. ${seed.derivation}`;
  $('replay').textContent = replayRemaining ? `Replaying seed progress: ${replayTotal-replayRemaining} of ${replayTotal} fixed steps. ${manualPaused ? 'Play to continue.' : ''}` : replayMeaning;
  if (!beaconRequest) $('notice').textContent = !device ? 'Calculated still. Live rooms require WebGPU.' : `${dependencyText()}${playbackRate > 1 ? ` Fast forward, up to ${playbackRate}x as this device allows.` : ''}`;
  $('dependencies').replaceChildren(...ROUTE.map(r => {
    const e = registry.entries.get(r.id), p = document.createElement('p');
    p.textContent = `${r.title}: ${e?.status === 'ready' ? e.info.model : `unavailable, js/${r.file}. ${e?.error ?? 'Not loaded'}`}`; return p;
  }));
  let s = null; try { s = manager?.snapshot(); } catch (e) { failRoom(e.message); return; }
  if (!s || !manager?.active) return;
  const info = manager.active.info;
  const presentation = roomPresentation(roomId,s);
  $('hydrogen-control').hidden = roomId !== 'hydrogen-exactly'; $('hydrogen-mode').value = preferences.hydrogenMode;
  $('number').textContent = roomId === BOOTSTRAP.id ? 'Interim study / route pending' : `${String(ROUTE.findIndex(r=>r.id===roomId)+1).padStart(2,'0')} / ${String(ROUTE.length).padStart(2,'0')}`;
  $('caption-title').textContent = ROOMS.find(r=>r.id===roomId)?.title ?? info.title;
  $('scale').textContent = scaleLabel(info,s);
  const description = presentation.explanation;
  $('explanation').textContent = `${description} Navigation between rooms is editorial; these are distinct models.`;
  const sources = [...new Set([...info.sources, s.scale?.source].filter(Boolean))];
  $('sources').replaceChildren(...sources.map((url,i) => {
    const a = document.createElement('a'); try { const u = new URL(url); if (!['http:','https:'].includes(u.protocol)) return document.createTextNode('Invalid source URL'); a.href = u.href; a.textContent = `Model reference (${u.hostname.replace(/^www\./,'')})`; } catch (_) { a.textContent = 'Unavailable source'; } return a;
  }));
  const rows = [textRow('Model',s.model), textRow('Solver time',`${s.simulationTime ?? 'Unavailable'} ${presentation.units ?? '(units not supplied)'}`), textRow('Integer progress',s.numericalStepCount ?? s.stepCount ?? s.steps ?? 'Unavailable'), textRow('Clock meaning',presentation.clock ?? 'Not supplied by room'), textRow('Diagnostic age',s.diagnosticAgeSeconds == null ? 'Not supplied by room' : `${s.diagnosticAgeSeconds} seconds`), textRow('Color meaning',presentation.colors ?? 'Not supplied by room')];
  for (const [name,value] of Object.entries(presentation.observables)) rows.push(textRow(name,value ?? 'Unavailable'));
  $('diagnostics').replaceChildren(...rows.flat());
  if (!$('panel').hidden) $('snapshot').textContent = JSON.stringify({ room: s, host: snapshot() },null,2);
}
function failRoom(detail) {
  manager?.release(); replayRemaining = 0; ambient.reset();
  $('caption-title').textContent = ROOMS.find(r=>r.id===roomId)?.title ?? 'Room unavailable';
  $('number').textContent = 'Unavailable';
  $('scale').textContent = 'Scale unavailable until this room supplies a calibrated snapshot.';
  $('explanation').textContent = `${ROOMS.find(r=>r.id===roomId)?.title ?? 'Room'} could not initialize. ${detail}`;
  $('sources').replaceChildren(); $('diagnostics').replaceChildren();
  message(`${ROOMS.find(r=>r.id===roomId)?.title ?? 'Room'} unavailable`,detail); dirty = true; updateUI();
}
function snapshot() {
  return {
    version: VERSION, roomId, paused: manualPaused, automatic, playbackRate, hidden, offscreen, loading, deviceLost,
    seed, quality, preferences, clock: clock.snapshot(), roomTicks: manager?.active?.ticks ?? 0,
    replayRemaining, replayMeaning, replayValidation, fixedDtSeconds: FIXED_DT, renderCount,
    adapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter ?? null } : null,
    resolution: { width: canvas.width, height: canvas.height, dpr: renderDpr, dprCap: 2, maxPixels: 8388608, adaptiveScale: 1, policy: '2x supersampling within device dimensions and pixel budget; no load-driven downscale' },
    resources: manager?.resources() ?? null, budgetPolicy: 'One active room; no prewarming or overlapping targets',
    droppedAmbientSeconds: ambient.droppedSeconds, cpuCosts: costs.snapshot(), roomCpuCosts: Object.fromEntries(Object.entries(roomCosts).map(([id,s])=>[id,s.snapshot()])),
    integration: routeCompleteness(registry,measured), modules: registry.snapshot(),
    initializationError:manager?.lastError??null,gpuQueuePending,lastGpuQueueMs,roomWorkPending:!!roomWorkPending,
    room: manager?.snapshot() ?? null, loopPending: !!raf
  };
}
function persist() {
  if (disposed || deviceLost) return;
  const a = manager?.active; let s = null;
  try { s = manager?.snapshot(); } catch (_) { /* invalid diagnostics are not saved */ }
  const visit = a ? { id: a.id, ticks: a.ticks+replayRemaining, scoreOrigin: a.scoreOrigin, seed: a.seed, parameters: parametersOf(s), model: s?.model ?? null,
    numericalStepCount: replayRemaining ? replayExpected?.numericalStepCount ?? null : s?.numericalStepCount ?? null,
    simulationTime: replayRemaining ? replayExpected?.simulationTime ?? null : s?.simulationTime ?? null } : null;
  try { localStorage.setItem(STORAGE,JSON.stringify({ version: 1, presentationRevision: PRESENTATION_REVISION, roomId, seed, quality, preferences, paused: manualPaused, automatic, playbackRate, clock: clock.snapshot(), visit })); } catch (_) { /* storage denial never stops watching */ }
}
function displayTint() {
  const color = getComputedStyle(piece).getPropertyValue('--accent').trim();
  const match = color.match(/^#([0-9a-f]{6})$/i); if (!match) return [.72,.61,.44];
  return match[1].match(/../g).map(x => { const c = parseInt(x,16)/255; return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4; });
}
async function openRoom(id, { restore = null, retry = false } = {}) {
  const ticket = ++roomRequest; roomId = id; $('room').value = id;
  setBusy(true); roomWorkPending = null; replayRemaining = 0; replayExpected = null; replayValidation = null; message('A dark rest',`Opening ${ROOMS.find(r=>r.id===id)?.title ?? id}.`); dirty = true;
  try {
    if (retry) await registry.load(id,true);
    // Use the first 64 bits of the derived SHA-256 for every room and record
    // that truncation in each visit.
    const roomSeed = restore?.seed ?? (await deriveRoomSeed(seed.seed,id,clock.cycle)).slice(0,16);
    if (ticket !== roomRequest || disposed) return;
    device.pushErrorScope('validation');
    displayBind=null; presentationTarget=null;
    const ok = await manager.select(id,roomSeed);
    const error = await device.popErrorScope();
    if (ticket !== roomRequest || disposed) return;
    if (!ok || error) { failRoom(error?.message ?? manager.lastError?.message ?? 'Room initialization failed'); return; }
    const a = manager.active; a.scoreOrigin = restore?.scoreOrigin ?? clock.total;
    configureRoom(id,a.room,preferences);
    if (id === BOOTSTRAP.id) a.room.setPresentationTint(displayTint());
    const s = manager.snapshot();
    const compatible = restore && restore.id === id && restore.model === s.model && JSON.stringify(restore.parameters) === JSON.stringify(parametersOf(s)) && Number.isSafeInteger(restore.ticks) && restore.ticks >= 0;
    if (compatible && id === BOOTSTRAP.id) {
      a.room.restoreAnalyticTime({ stepCount: restore.ticks, elapsedSeconds: restore.ticks*FIXED_DT }); a.ticks = restore.ticks;
      replayMeaning = `Restored analytic time at ${restore.ticks} integer steps. GPU display sampling is device-dependent.`;
    } else if (compatible && restore.ticks <= 43200) {
      replayRemaining = restore.ticks; replayTotal = restore.ticks;
      replayExpected = {numericalStepCount:restore.numericalStepCount ?? null,simulationTime:restore.simulationTime ?? null};
      replayMeaning = 'Restored by seed replay, not a GPU checkpoint. Cross-device floating-point agreement is approximate.';
    } else if (restore) replayMeaning = 'Saved model, parameters or replay budget changed. Restarted this room honestly from its saved seed; no GPU checkpoint was restored.';
    else replayMeaning = 'New visit from a seed derived from room and route cycle. No previous GPU state is retained.';
    message(null); dirty = true;
  } catch (e) { if (ticket === roomRequest) failRoom(e.message); }
  finally { if (ticket === roomRequest) { setBusy(false); updateUI(true); wake(); persist(); } }
}
function chooseRoom(id) {
  if (!device || disposed || deviceLost) return Promise.resolve();
  automatic = false; const index = ROUTE.findIndex(r=>r.id===id);
  if (index >= 0) { clock.index = index; clock.age = 4; clock.extension = 0; }
  return openRoom(id);
}
function waitForRoomWork(a) {
  if (typeof a.room.waitForIdle !== 'function' || !manager.snapshot()?.busy) return;
  const work = { active: a }; roomWorkPending = work;
  // An asynchronous sweep must finish before another fixed step can consume
  // its time. This keeps fast batches from overrunning an asynchronous room update.
  Promise.resolve(a.room.waitForIdle()).catch(e => {
    if (!disposed && roomWorkPending === work) failRoom(e.message);
  }).finally(() => {
    if (roomWorkPending === work) { roomWorkPending = null; ambient.reset(); wake(); }
  });
}
function nextRoom() {
  if (!device || disposed || deviceLost) return;
  const index = ROUTE.findIndex(r => r.id === roomId), next = (index + 1) % ROUTE.length;
  if (index >= 0 && next === 0) clock.cycle++;
  clock.index = next; clock.age = 4; clock.extension = 0; ambient.reset();
  void openRoom(ROUTE[next].id);
}
function tick() {
  if (!active()) return false;
  const a = manager?.active;
  if (replayRemaining && a) {
    const before = performance.now(); manager.step(a.scoreOrigin + a.ticks*FIXED_DT); currentCosts().add('seedReplayStep',performance.now()-before); replayRemaining--; waitForRoomWork(a);
    if (!replayRemaining && replayExpected?.numericalStepCount != null) {
      const s=manager.snapshot();
      const matches=s.numericalStepCount===replayExpected.numericalStepCount && Math.abs(s.simulationTime-replayExpected.simulationTime)<1e-8;
      replayValidation={matches,expected:replayExpected,actual:{numericalStepCount:s.numericalStepCount,simulationTime:s.simulationTime}};
      replayMeaning=matches?'Seed replay matched the saved numerical count and solver time. Floating-point state may differ across adapters.':'Replayed the saved host steps, but adaptive or asynchronous solver progress differs. This is a new seeded replay, not the saved GPU state.';
    }
    dirty = true; return true;
  }
  if (a && (!automatic || clock.phase !== 'rest')) {
    const before = performance.now(); manager.step(clock.total); currentCosts().add('simulationStep',performance.now()-before); waitForRoomWork(a); dirty = true;
  }
  if (automatic && roomId !== BOOTSTRAP.id) {
    const phase = clock.phase;
    const s=a?manager.snapshot():null;
    const changed = clock.tick(FIXED_DT,s?{...s,routeEvent:roomPresentation(roomId,s).event}:null);
    if (clock.phase === 'rest' && phase !== 'rest') { manager.release(); displayBind = null; presentationTarget = null; dirty = true; }
    if (changed) { void openRoom(ROUTE[clock.index].id); return false; }
  } else clock.total += FIXED_DT;
  return true;
}
function resize() {
  if (!manager || disposed) return;
  const r = $('view').getBoundingClientRect();
  const limit = device.limits.maxTextureDimension2D;
  const dpr = Math.min(2, limit/Math.max(1,r.width), limit/Math.max(1,r.height), Math.sqrt(8388608/Math.max(1,r.width*r.height)));
  renderDpr = dpr;
  const width = Math.max(1,Math.round(r.width*dpr));
  const height = Math.max(1,Math.round(r.height*dpr));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width; canvas.height = height; manager.resize({ width,height,dpr });
  displayBind = null; presentationTarget = null; dirty = true; wake();
}
function draw() {
  if (!device || !context || disposed || deviceLost || loading || hidden || offscreen || gpuQueuePending) return;
  const encoder = device.createCommandEncoder({ label: 'Descent room and final display' });
  const start = performance.now(); const a = manager.active;
  if (a) manager.render(encoder,exposureFor(roomId),roomId === 'soap-film' ? {filmFill:{x:.92,y:.88}} : {});
  currentCosts().add('renderEncoding',performance.now()-start);
  const presentStart = performance.now();
  if (a && presentationTarget !== a.target) {
    displayBind = device.createBindGroup({ layout: presenter.getBindGroupLayout(0), entries: [{ binding: 0, resource: a.view }, { binding: 1, resource: { buffer: displayUniform } }] }); presentationTarget = a.target;
  }
  const fade = !automatic || roomId === BOOTSTRAP.id ? 1 : clock.fade;
  device.queue.writeBuffer(displayUniform,0,new Float32Array([fade,0,0,0]));
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0,g: 0,b: 0,a: 1 }, loadOp: 'clear',storeOp: 'store' }] });
  if (a) { pass.setPipeline(presenter); pass.setBindGroup(0,displayBind); pass.draw(3); }
  pass.end(); device.queue.submit([encoder.finish()]);
  gpuQueuePending=true;const submittedAt=performance.now();
  device.queue.onSubmittedWorkDone().then(()=>{
    lastGpuQueueMs=performance.now()-submittedAt;costs.add('frameQueueCompletion',lastGpuQueueMs);
  }).catch(()=>{/* device loss and validation handlers report failures */}).finally(()=>{gpuQueuePending=false;wake();});
  costs.add('displayAndSubmit',performance.now()-presentStart); renderCount++; dirty = false;
  if (a) measured[roomId] = manager.snapshot();
}
function frame(now) {
  raf = 0;
  try {
    const start = performance.now();
    if (gpuQueuePending) ambient.last=now;
    else ambient.frame(now,active(),tick,{rate:playbackRate,budgetMs:playbackRate > 1 ? 12 : Infinity});
    if (dirty || active()) draw();
    const cpuMs = performance.now()-start;
    costs.add('frameCpu',cpuMs);
    if (active()) {
      slowFrames = Math.max(cpuMs,lastGpuQueueMs) > 18 ? slowFrames+1 : Math.max(0,slowFrames-1);
      if (slowFrames > 90) {
        if (ambient.maxSteps > 1) ambient.maxSteps--;
        // Preserve spatial detail under load. Only the watching clock slows.
        slowFrames = 0;
      }
    }
    updateUI(); if (now-lastSave > 5000) { persist(); lastSave = now; }
  } catch (e) { failRoom(e.message); setBusy(false); }
  if (active()) raf = requestAnimationFrame(frame);
}
function wake() { if (!raf && !disposed && !hidden && !offscreen && device && !deviceLost && (active() || dirty)) raf = requestAnimationFrame(frame); }
function suspend() { ambient.reset(); if (raf) cancelAnimationFrame(raf); raf = 0; persist(); updateUI(true); }
function togglePause() { manualPaused = !manualPaused; ambient.reset(); dirty = true; updateUI(true); persist(); wake(); }
async function fullscreen() {
  const pseudo = piece.classList.contains('descent-pseudo-fs');
  if (document.fullscreenElement === piece) await document.exitFullscreen();
  else if (pseudo) { piece.classList.remove('descent-pseudo-fs'); document.body.classList.remove('descent-fs-open'); }
  else { try { await piece.requestFullscreen(); } catch (_) { piece.classList.add('descent-pseudo-fs'); document.body.classList.add('descent-fs-open'); } }
  updateFullscreen(); resize();
}
function updateFullscreen() { const on = document.fullscreenElement === piece || piece.classList.contains('descent-pseudo-fs'); $('fullscreen').textContent = on ? 'Exit fullscreen' : 'Fullscreen'; $('fullscreen').setAttribute('aria-pressed',String(on)); }
function on(target,event,fn) { target.addEventListener(event,fn,{ signal: lifetime.signal }); }
on($('pause'),'click',togglePause);
on($('speed'),'click',() => {
  playbackRate = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate)+1)%PLAYBACK_RATES.length]; ambient.reset(); dirty = true; updateUI(true); persist(); wake();
});
on($('next'),'click',nextRoom);
function togglePanel(id, button, otherId, otherButton) {
  $(id).hidden = !$(id).hidden;
  if (!$(id).hidden) { $(otherId).hidden = true; $(otherButton).setAttribute('aria-expanded','false'); }
  $(button).setAttribute('aria-expanded',String(!$(id).hidden)); updateUI(true);
}
on($('instruments'),'click',() => togglePanel('panel','instruments','about-panel','about'));
on($('about'),'click',() => togglePanel('about-panel','about','panel','instruments'));
on($('restart'),'click',() => {
  if (!device || deviceLost) { location.reload(); return; }
  clock = new RouteClock(); ambient.reset();
  const id=automatic && routeCompleteness(registry,measured).modulesReady === ROUTE.length ? ROUTE[0].id : roomId;
  void openRoom(id,{retry:registry.entries.get(id)?.status==='unavailable'});
});
on($('room'),'change',() => { void chooseRoom($('room').value); });
on($('quality'),'change',() => { quality = $('quality').value; manager.quality = quality; void openRoom(roomId); });
on($('hydrogen-mode'),'change',() => { preferences.hydrogenMode=$('hydrogen-mode').value; void openRoom(roomId); });
on($('position'),'input',() => { const p = +$('position').value; $('position-label').textContent = `${Math.floor(p/60)}:${String(p%60).padStart(2,'0')} / about 9:00`; });
on($('position'),'change',() => { if (!device || deviceLost) return; clock.seek(+$('position').value); automatic = !reducedMotion.matches; void openRoom(ROUTE[clock.index].id); });
on($('auto'),'change',() => { automatic = $('auto').checked; if (automatic && device && roomId === BOOTSTRAP.id) void openRoom(ROUTE[clock.index].id); dirty = true; updateUI(true); wake(); persist(); });
on($('apply-seed'),'click',() => { try { seed = offlineSeed($('seed').value.trim()); seedError=null; $('seed').setCustomValidity(''); clock.cycle = 0; if (device && !deviceLost) void openRoom(roomId); } catch (e) { $('seed').setCustomValidity(e.message); $('seed').reportValidity(); } });
on($('beacon'),'click',async () => {
  if (beaconRequest) return;
  beaconRequest = new AbortController(); beaconTimer = setTimeout(()=>beaconRequest?.abort(),8000);
  $('beacon').disabled = true; $('notice').textContent = 'Fetching and verifying a quicknet beacon. The current seed keeps running.';
  try { const next = await fetchBeaconSeed({ signal: beaconRequest.signal }); if (disposed) return; seed = next; seedError=null; $('seed').value = seed.seed; clock.cycle = 0; if (device && !deviceLost) await openRoom(roomId); }
  catch (e) { if (!disposed) { seedError=e.message; updateUI(true); } }
  finally { clearTimeout(beaconTimer); beaconTimer = null; beaconRequest = null; $('beacon').disabled = false; $('notice').textContent = dependencyText(); persist(); }
});
on($('fullscreen'),'click',() => { void fullscreen(); });
on(document,'fullscreenchange',() => { updateFullscreen(); resize(); });
on(canvas,'keydown',e => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } if (e.key.toLowerCase() === 'f') void fullscreen(); });
on(document,'keydown',e => {
  if (e.key !== 'Escape') return;
  if (!$('panel').hidden || !$('about-panel').hidden) {
    const button = !$('panel').hidden ? 'instruments' : 'about';
    $('panel').hidden = true; $('about-panel').hidden = true;
    $('about').setAttribute('aria-expanded','false'); updateUI(true); $(button).focus();
  } else if (piece.classList.contains('descent-pseudo-fs')) void fullscreen();
});
on(document,'visibilitychange',() => { hidden = document.hidden; if (hidden) suspend(); else { dirty = true; wake(); } });
on(reducedMotion,'change',() => { if (reducedMotion.matches) { manualPaused = true; automatic = false; playbackRate = 1; suspend(); dirty = true; wake(); } });
const observer = new IntersectionObserver(entries => { offscreen = !entries[0].isIntersecting; if (offscreen) suspend(); else { dirty = true; wake(); } },{ threshold: 0 }); observer.observe($('view'));
const resizeObserver = new ResizeObserver(resize); resizeObserver.observe($('view'));
function dispose() {
  if (disposed) return; persist(); disposed = true; ++roomRequest; suspend(); lifetime.abort(); observer.disconnect(); resizeObserver.disconnect();
  beaconRequest?.abort(); clearTimeout(beaconTimer); manager?.dispose(); displayUniform?.destroy(); context?.unconfigure(); device?.destroy();
}
on(window,'pagehide',e => { if (e.persisted) { hidden = true; suspend(); } else dispose(); });
on(window,'pageshow',() => { if (!disposed) { hidden = document.hidden; dirty = true; wake(); } });

async function init() {
  $('seed').value = seed.seed; $('quality').value = quality;
  const probing = registry.probe();
  try {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser');
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter is available');
    device = await adapter.requestDevice({ label: 'Descent shared device', requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
    device.lost.then(info => {
      if (disposed) return; deviceLost = true; suspend(); manager?.dispose();
      message('The graphics device was lost',`${info.message || info.reason}. Restart reloads the recorded seed. No GPU checkpoint is claimed.`); updateUI(true);
    });
    on(device,'uncapturederror',event => { event.preventDefault(); failRoom(event.error.message); });
    context = canvas.getContext('webgpu'); if (!context) throw new Error('A WebGPU canvas context is unavailable');
    const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device,format,alphaMode: 'opaque' });
    const module = device.createShaderModule({ label: 'Descent single display transform', code: `
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var<uniform> fade: vec4f;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[i],0,1);
}
@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let linear = max(vec3f(0),textureLoad(scene,vec2i(p.xy),0).rgb) * fade.x;
  let mapped = linear/(vec3f(1)+linear);
  let srgb = select(mapped*12.92,1.055*pow(mapped,vec3f(1.0/2.4))-vec3f(0.055),mapped > vec3f(0.0031308));
  return vec4f(srgb,1);
}` });
    presenter = await device.createRenderPipelineAsync({ layout: 'auto',vertex: { module,entryPoint: 'vertex' },fragment: { module,entryPoint: 'fragment',targets: [{ format }] },primitive: { topology: 'triangle-list' } });
    displayUniform = device.createBuffer({ label: 'Descent display fade',size: 16,usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    manager = new RoomManager({ device,registry,quality }); resize();
    await probing;
    if (!roomId) { roomId = routeCompleteness(registry,measured).modulesReady === ROUTE.length ? ROUTE[0].id : BOOTSTRAP.id; if (roomId === BOOTSTRAP.id) automatic = false; }
    if (reducedMotion.matches) { automatic = false; manualPaused = true; }
    await openRoom(roomId,{ restore: requestedReplay }); requestedReplay = null;
  } catch (e) {
    await probing; manager?.dispose(); displayUniform?.destroy(); context?.unconfigure(); device?.destroy(); device = null;
    canvas.hidden = true; $('still').hidden = false; message(null); setBusy(false);
    $('caption-title').textContent = 'Hydrogen / calculated still'; $('number').textContent = 'CPU analytic projection / zero phase';
    $('scale').textContent = 'Mean radius 0.218 nm; 25% 1s and 75% 2p. Calculated in the ideal Coulomb model.';
    $('explanation').textContent = `${e.message}. This still was calculated on the CPU from the analytic hydrogen interim model. The three-room journey requires live WebGPU modules.`;
    $('sources').replaceChildren(); const a = document.createElement('a'); a.href = 'https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0'; a.textContent = 'Bohr radius (NIST)'; $('sources').append(a);
    $('room').disabled = true; $('position').disabled = true; $('auto').disabled = true; $('quality').disabled = true;
    updateUI(true);
  }
  if (seed.beacon && !disposed) {
    try { const verified = await verifyBeaconSeed(seed.beacon); if (seed.beacon?.round === verified.round) { seed = verified; updateUI(true); persist(); } }
    catch (_) { seed = offlineSeed(seed.seed); replayMeaning = 'Cached beacon failed verification. Its bytes are used only as an offline seed.'; updateUI(true); }
  }
}
// A read-only snapshot and explicit inspection methods are useful to the owner
// and browser checks. Playback speed changes fixed-step scheduling, not equations.
window.Descent = Object.freeze({ snapshot, selectRoom: chooseRoom, async debugReadback() { return manager?.active ? manager.active.room.debugReadback() : null; }, dispose });
void init();
