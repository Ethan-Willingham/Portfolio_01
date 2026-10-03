import { MODEL, PRESETS, PRESET_VERSION, prepare, compare, measure, pack, checksum, IMAGE_SCALE } from './arrow-of-time-model.js?v=5';
import { createQ2RGPU } from './arrow-of-time-gpu.js?v=5';
export const roomInfo = {
  apiVersion: 1, id: 'arrow-of-time', title: 'Arrow of time', model: MODEL,
  representativeScaleMeters: null, scaleMeaning: 'Abstract lattice cells; no physical length is assigned.',
  sources: ['https://arxiv.org/html/1903.11761v1', 'https://arxiv.org/abs/1703.10527']
};
export async function createRoom({ device, seed, quality = 'medium', assetBaseURL }) {
  if (!device) throw new Error('Arrow of time requires WebGPU. The standalone page offers a labeled CPU-generated still.');
  if (!['low', 'medium', 'high', 'ultra'].includes(quality)) throw new RangeError('Unknown room quality.');
  const [width, height] = quality === 'ultra' ? [2048, 1536] : quality === 'high' ? [1024, 768] : quality === 'low' ? [256, 256] : [768, 512], stepsPerPhrase = 4320;
  const assets = new URL(assetBaseURL || '../assets/visualizer/arrow-of-time/', import.meta.url).href;
  let referenceEnergy = 0;
  let initial, gpu, customDrawing = null, timeline = null, justSeeked = false, usedSeeking = false, preset = 0, cycle = 0, totalSteps = 0, orbitStep = 0, forwardSteps = 0, inverseSteps = 0;
  let phase = 'arrival', direction = 1, holdSeconds = 8, accumulator = 0, activeSeconds = 0, rate = 24, zoom = 1;
  let disposed = false, epoch = 0, pending = null, last = {}, returnResult = null, lastReturn = null, measuredAtStep = 0;
  async function initialize() {
    initial = prepare(width, height, customDrawing ? 'custom' : PRESETS[preset], customDrawing);
    const nextGpu = await createQ2RGPU(device, initial);
    if (disposed) { nextGpu.dispose(); return; }
    gpu = nextGpu;
    try {
      timeline = gpu.prepareTimeline(stepsPerPhrase);
      const preparedReturn = await gpu.readback();
      if (!compare(preparedReturn, initial).exact) throw new Error('Prepared sequence did not return exactly.');
    } catch (error) { gpu.dispose(); throw error; }
    if (disposed) return;
    timeline.exactReturn = true;
    const m = measure(initial); referenceEnergy = m.energyTwiceJ;
    last = { ...m, energyDriftJ: 0, checksum: checksum(pack(initial.x, width, height), pack(initial.y, width, height)), measurementAvailable: true };
    measuredAtStep = totalSteps;
  }
  await initialize();
  function controls() { return { cycle, presetIndex: preset, phase, direction, totalSteps, orbitStep, forwardSteps, inverseSteps, holdSeconds, accumulator, activeSeconds, rate, zoom, usedSeeking }; }
  async function read(measureReturn = false) {
    if (pending) return measureReturn ? pending.then(() => read(true)) : pending;
    const token = epoch, captured = controls(), reference = initial, source = gpu;
    const promise = source.readback().then(state => {
      if (disposed || epoch !== token) return state;
      const m = measure(state), reduction = state.integerReduction;
      if (m.energyTwiceJ !== reduction.energyTwiceJ) throw new Error('GPU and CPU energy reductions disagree.');
      measuredAtStep = captured.totalSteps;
      last = { ...m, energyDriftJ: (m.energyTwiceJ - measureInitialEnergy()) / 2, checksum: state.checksum, measurementAvailable: true };
      if (measureReturn) {
        returnResult = { ...compare(state, reference), cycle: captured.cycle, forwardSteps: captured.forwardSteps, inverseSteps: captured.inverseSteps, checksum: state.checksum, usedSeeking: captured.usedSeeking, method: captured.usedSeeking ? 'Full comparison of both layers after timeline seeking.' : 'Full comparison of both computed time layers; no frame replay.' };
        lastReturn = returnResult;
        if (!returnResult.exact) { phase = 'failed'; throw new Error('Exact return failed.'); }
        phase = 'returned'; holdSeconds = 12;
      }
      return { ...state, control: captured };
    }).finally(() => { if (pending === promise) pending = null; });
    pending = promise;
    return promise;
  }
  function measureInitialEnergy() { return referenceEnergy; }
  function step({ dtSeconds }) {
    if (disposed || phase === 'failed') return;
    const dt = Math.max(0, Math.min(.1, dtSeconds)); activeSeconds += dt;
    if (phase === 'checking' || phase === 'resetting' || phase === 'seeking') return;
    if (['arrival', 'turning', 'returned'].includes(phase)) {
      holdSeconds = Math.max(0, holdSeconds - dt);
      if (holdSeconds > 0) return;
      if (phase === 'arrival') phase = 'forward';
      else if (phase === 'turning') { phase = 'inverse'; direction = -1; }
      else {
        phase = 'resetting'; epoch++; gpu.dispose(); if (!customDrawing) preset = (preset + 1) % PRESETS.length; usedSeeking = false; justSeeked = false; cycle++;
        orbitStep = 0; forwardSteps = 0; inverseSteps = 0; returnResult = null; accumulator = 0; direction = 1;
        void initialize().then(() => { if (!disposed) { phase = 'arrival'; holdSeconds = 8; } }).catch(e => { phase = 'failed'; last.error = e.message; }); return;
      }
    }
    accumulator += dt * rate;
    const remaining = direction === 1 ? stepsPerPhrase - orbitStep : orbitStep;
    const count = Math.min(64, Math.floor(accumulator + 1e-8), remaining);
    if (count) { justSeeked = false; gpu.update(count, direction); accumulator -= count; totalSteps += count; orbitStep += count * direction; if (direction === 1) forwardSteps += count; else inverseSteps += count; }
    if (direction === 1 && orbitStep === stepsPerPhrase) { phase = 'turning'; holdSeconds = 2; accumulator = 0; }
    if (direction === -1 && orbitStep === 0) { phase = 'checking'; accumulator = 0; void read(true).catch(e => { phase = 'failed'; last.error = e.message; }); }
  }
  return {
    resize() {}, step,
    render(args) { const visibility = justSeeked ? 1 : phase === 'returned' ? Math.min(1, holdSeconds / 2) : phase === 'arrival' && cycle > 0 ? Math.min(1, (8 - holdSeconds) / 2) : 1; const moving = phase === 'forward' && forwardSteps > 0 || phase === 'inverse' && inverseSteps > 0; const blend = moving && !justSeeked ? Math.max(0, Math.min(1, accumulator)) : 1; if (!disposed && phase !== 'resetting') gpu.render({ ...args, zoom, visibility, blend }); },
    snapshot() { return { ...roomInfo, quality, seed: seed || null, seedProvenance: 'Host seed recorded but unused; authored constructors or user drawing; deterministic preparation, no random source.',
      parameters: { J: 1, width, height, forwardStepsScheduled: stepsPerPhrase, updatesPerAmbientSecond: rate, presetVersion: PRESET_VERSION, imageScale: IMAGE_SCALE, zoom, storage: '32 spins per u32, row aligned', display: 'Mean of both time layers, eased between adjacent computed states', assets },
      numericalStepCount: totalSteps, simulationTime: orbitStep, simulationTimeUnits: 'Q2R integer steps from authored state', configurationId: initial.configurationId,
      ...controls(), presetIndex: customDrawing ? -1 : preset, timelineReady: !!timeline?.exactReturn, timelinePosition: direction === 1 ? orbitStep : 2 * stepsPerPhrase - orbitStep, timelineLength: 2 * stepsPerPhrase, timelineCheckpointCount: timeline?.checkpoints || 0, timelineBytes: timeline?.bytes || 0, timelinePreparationSteps: timeline?.computedSteps || 0, stepsUntilReversal: direction === 1 ? stepsPerPhrase - orbitStep : 0, stepsUntilReturn: direction === -1 ? orbitStep : 2 * stepsPerPhrase - orbitStep,
      ...last, diagnosticStep: measuredAtStep, diagnosticAgeSteps: measuredAtStep === null ? null : totalSteps - measuredAtStep, diagnosticPending: !!pending, returnResult, lastReturn,
      criticality: 'Not established. Energy proximity is only an equilibrium Ising reference.', memoryBytes: gpu.bufferBytes }; },
    async debugReadback() { const state = await read(); return { ...state, x: [...state.x], y: [...state.y], packedX: [...state.packedX], packedY: [...state.packedY], replay: { apiVersion: 1, id: roomInfo.id, model: MODEL, quality, seed: seed || null, seedProvenance: 'unused host seed', configurationId: initial.configurationId, width, height, presetVersion: PRESET_VERSION, ...state.control } }; },
    async measure() { await read(); },
    setRate(value) { if (![24, 96, 768].includes(value)) throw new RangeError('Unsupported playback pacing.'); rate = value; },
    setZoom(value) { zoom = Math.max(.4, Math.min(16, Number(value) || 1)); },
    async seek(position) {
      if (disposed || !timeline?.exactReturn) throw new Error('The timeline is not ready.');
      if (!Number.isInteger(position) || position < 0 || position > 2 * stepsPerPhrase) throw new RangeError('Timeline position is out of bounds.');
      phase = 'seeking'; epoch++; if (pending) await pending;
      last = { ...last, measurementAvailable: false }; measuredAtStep = null;
      direction = position <= stepsPerPhrase ? 1 : -1; orbitStep = direction === 1 ? position : 2 * stepsPerPhrase - position;
      totalSteps += gpu.seekTimeline(orbitStep, direction); usedSeeking = true; justSeeked = true; accumulator = 0;
      forwardSteps = Math.min(position, stepsPerPhrase); inverseSteps = Math.max(0, position - stepsPerPhrase); returnResult = null;
      phase = position === 0 ? 'arrival' : position === stepsPerPhrase ? 'turning' : position === 2 * stepsPerPhrase ? 'checking' : direction === 1 ? 'forward' : 'inverse';
      holdSeconds = position === 0 ? 8 : position === stepsPerPhrase ? 2 : 0;
      if (phase === 'checking') await read(true);
    },
    async restart(configuration = customDrawing ? 'custom' : PRESETS[preset], drawing = null) {
      const index = PRESETS.indexOf(configuration); if (index < 0 && configuration !== 'custom') throw new RangeError('Unknown configuration.');
      phase = 'resetting'; epoch++; if (pending) await pending; gpu.dispose(); customDrawing = configuration === 'custom' ? drawing || customDrawing : null; preset = Math.max(0, index); usedSeeking = false; justSeeked = false; cycle = 0; totalSteps = 0; orbitStep = 0; forwardSteps = 0; inverseSteps = 0; activeSeconds = 0; accumulator = 0; direction = 1; returnResult = null; lastReturn = null;
      await initialize(); measureInitialEnergy(); phase = 'arrival'; holdSeconds = 8;
    },
    dispose() { if (disposed) return; disposed = true; epoch++; gpu.dispose(); }
  };
}
