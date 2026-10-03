// Read a locally exported gameplay trace. CPU buckets overlap; never sum them.
// Usage: node tools/perf/read-play-recording.mjs /absolute/path/recording.json
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
function distribution(values) {
  values = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / (values.length || 1),
    p50: values[Math.floor((values.length - 1) * .5)] ?? null,
    p95: values[Math.floor((values.length - 1) * .95)] ?? null,
    p99: values[Math.floor((values.length - 1) * .99)] ?? null, max: values.at(-1) ?? null };
}
export function summarizeRecording(trace) {
  assert.equal(trace.schema, 'sluice-performance-1');
  assert(trace.stride === trace.columns.length && trace.frameChunks.reduce((n, c) => n + c.length, 0) === trace.frameCount * trace.stride, 'Complete packed frames');
  const columns = new Map(trace.columns.map((name, i) => [name, i]));
  for (const name of ['atMs', 'intervalMs', 'cpuMs']) assert(columns.has(name), 'Required field ' + name);
  const cpuColumns = trace.columns.map((name, i) => ({name, i})).filter(({name}) => name?.startsWith('cpu.'));
  const transitions = (trace.events || []).filter(e => ['pause', 'resume', 'visibility', 'blur', 'focus'].includes(e.kind));
  const interrupted = (start, end) => transitions.some(e => e.atMs > start && e.atMs <= end);
  const metrics = {intervalMs: [], cpuMs: []};
  for (const name of ['recorderMs', 'observerMs']) if (columns.has(name)) metrics[name] = [];
  const hitches = [], cpu = Object.create(null), bins = new Map(), ids = new Set(), inactiveAt = [];
  let frame = 0, activeFrames = 0, previous = null, lastAt = 0;
  for (const chunk of trace.frameChunks) {
    assert.equal(chunk.length % trace.stride, 0);
    for (let offset = 0; offset < chunk.length; offset += trace.stride, frame++) {
      const get = name => columns.has(name) ? chunk[offset + columns.get(name)] : undefined;
      const at = get('atMs'), interval = get('intervalMs'); lastAt = Math.max(lastAt, at);
      const active = (columns.has('active') ? get('active') === 1 :
        (!columns.has('visible') || !!get('visible')) && !get('paused') && !get('view')) &&
        !interrupted(at - interval, at);
      const state = {frame, frameId: get('frameId'), seconds: at / 1000, intervalMs: interval,
        cpuMs: get('cpuMs'), view: get('view'), x: get('x'), y: get('y'), snow: get('snowActive'),
        slimes: get('awakeResidents'), microsteps: get('microsteps'), jet: !!get('jet'), holding: !!get('holding'), bath: !!get('bath')};
      if (state.frameId !== undefined) ids.add(state.frameId);
      const binKey = Math.floor(at / 1000);
      let bin = bins.get(binKey);
      if (!bin) { bin = {atMs: (binKey + 1) * 1000, frames: 0, intervalMs: 0, cpuMs: 0, maxIntervalMs: 0, interrupted: false, buckets: Object.create(null), state}; bins.set(binKey, bin); }
      if (!active) { bin.interrupted = true; inactiveAt.push(at); previous = null; continue; }
      activeFrames++; bin.frames++; bin.intervalMs += interval; bin.cpuMs += get('cpuMs');
      bin.maxIntervalMs = Math.max(bin.maxIntervalMs, interval); bin.state = state;
      for (const name in metrics) metrics[name].push(get(name));
      for (const {name, i} of cpuColumns) {
        const ms = chunk[offset + i]; cpu[name] = (cpu[name] || 0) + ms;
        bin.buckets[name.slice(4)] = (bin.buckets[name.slice(4)] || 0) + ms;
      }
      if (interval >= 40) hitches.push({...state, precedingFrame: previous});
      previous = state;
    }
  }
  // Rolling exports have frame history rather than recorder heartbeats. Use
  // active callback intervals for their means; reject interrupted/partial bins.
  const derived = [...bins.values()].filter(b => b.atMs <= lastAt && b.frames && b.intervalMs >= 900 && !b.interrupted && !interrupted(b.atMs - 1000, b.atMs))
    .map(b => ({atMs: b.atMs, durationMs: 1000, frames: b.frames, fps: b.frames * 1000 / b.intervalMs,
      cpuMs: b.cpuMs / b.frames, maxIntervalMs: b.maxIntervalMs,
      state: {visible: true, paused: false, snowActive: b.state.snow, awakeResidents: b.state.slimes,
        jet: b.state.jet, holding: b.state.holding, bath: b.state.bath},
      topCPU: Object.entries(b.buckets).map(([name, ms]) => ({name, ms: ms / b.frames})).sort((a, b) => b.ms - a.ms)}));
  const seconds = trace.seconds?.length ? trace.seconds : derived;
  const activeSeconds = seconds.filter(s => s.frames && s.durationMs >= 900 && s.state?.visible && !s.state.paused &&
    !s.state.loading && !s.state.manifest && !s.state.ledger &&
    !inactiveAt.some(at => at > s.atMs - s.durationMs && at <= s.atMs) &&
    !interrupted(s.atMs - s.durationMs, s.atMs));
  const worst = [...activeSeconds].sort((a, b) => a.fps - b.fps).slice(0, 12).map(s => ({seconds: s.atMs / 1000,
    fps: s.fps, cpuMs: s.cpuMs, maxIntervalMs: s.maxIntervalMs, snow: s.state.snowActive,
    awakeSlimes: s.state.awakeResidents, jet: s.state.jet, holding: s.state.holding, bath: s.state.bath,
    topCPU: (s.topCPU || []).slice(0, 5)}));
  const gpu = Object.create(null), gpuEncoders = Object.create(null), gpuByFrame = new Map();
  for (const sample of trace.gpu || []) {
    if (sample.frameId !== undefined && sample.name === 'liquid.frame') gpuByFrame.set(sample.frameId, sample);
    const passes = sample.passes || [], quanta = passes.filter(pass => pass.name === 'liquid.g2p').length;
    const grainTicks = passes.filter(pass => pass.name === 'snow.predict').length;
    const key = sample.name === 'liquid.frame' ? sample.name + ': ' + quanta + ' quanta / ' + grainTicks + ' grain ticks' : sample.name;
    const group = gpuEncoders[key] ||= {samples: 0, partial: 0, sums: [], spans: []};
    group.samples++; group.partial += !!sample.partial;
    if (sample.partial) continue;
    if (Number.isFinite(sample.ms)) group.sums.push(sample.ms);
    if (Number.isFinite(sample.spanMs)) group.spans.push(sample.spanMs);
    for (const pass of passes) { const name = sample.name + '/' + pass.name; (gpu[name] ||= []).push(pass.ms); }
  }
  const event = trace.slowdown;
  const slowFrame = value => value ? {frameId: value.frameId, seconds: value.atMs / 1000, cpuMs: value.cpuMs,
    snow: value.snowActive, awakeSlimes: value.awakeResidents, microsteps: value.microsteps,
    contacts: value.contacts, topCPU: value.phases?.slice(0, 3)} : null;
  const slowdown = event ? {frameId: event.frameId, kind: event.kind, severityMs: event.severity,
    gapMs: event.gapMs, outsideRetainedHistory: columns.has('frameId') ? !ids.has(event.frameId) : !!event.outsideHistory,
    current: slowFrame(event.current), precedingFrame: slowFrame(event.previous), baseline: event.reference || event.baseline || null,
    gpu: event.gpu || null, workload: event.workload || null} : null;
  const workload = (trace.workload || []).slice(-40).map(row => {
    const matched = row.frameId !== null ? gpuByFrame.get(row.frameId) : null;
    return {frameId: row.frameId, seconds: row.atMs / 1000, partial: !!row.partial,
      snowGuestVisits: row.snowGuestTotal, snowEscapeVisits: row.snowFallbackTotal,
      liquidEscapeVisits: row.liquidFallbackTotal, snowGuestPeak: row.snowGuestPeak,
      snowEscapePeak: row.snowFallbackPeak, collisionBatches: row.collisionBatches,
      snowBatches: row.snowCollisionBatches, copiedBytes: row.copyBytes,
      matchedGPU: matched ? {ms: matched.ms, partial: !!matched.partial} : null};
  });
  return {version: trace.version, durationSeconds: trace.durationMs / 1000, frames: trace.frameCount,
    activeFrames, reason: trace.reason, rolling: !!trace.metadata?.rolling,
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, distribution(v)])),
    worstSeconds: worst, secondSummarySource: trace.seconds?.length ? 'Recorder heartbeats' : 'Derived active callback intervals',
    largestHitches: hitches.sort((a, b) => b.intervalMs - a.intervalMs).slice(0, 20),
    cpuAverage: Object.entries(cpu).map(([name, total]) => ({name, ms: total / (activeFrames || 1)})).sort((a, b) => b.ms - a.ms).slice(0, 16),
    gpu: Object.entries(gpu).map(([name, values]) => ({name, samples: values.length, ...distribution(values)})).sort((a, b) => b.mean - a.mean).slice(0, 20),
    gpuEncoders: Object.entries(gpuEncoders).map(([name, group]) => ({name, samples: group.samples, partial: group.partial,
      passSumMs: group.sums.length ? distribution(group.sums) : null,
      spanSamples: group.spans.length, spanMs: group.spans.length ? distribution(group.spans) : null})),
    gpuLimitations: 'Sparse encoders exclude queue wait, WebGL smoke and composition. Span includes pass gaps. Older traces have no span; partial samples are excluded from cost distributions.',
    gpuStatus: trace.gpuStatus, workload, workloadLimitations: 'Queue visits repeat across substeps; peaks describe one batch, not unique particles across the frame. Match GPU costs only by frameId.',
    slowdown, observer: trace.observer || null,
    dropped: {events: trace.droppedEvents, gpu: trace.droppedGPU, buckets: trace.droppedBuckets}, notes: trace.metadata?.notes || []};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]; assert(file, 'Provide the exported recording JSON');
  console.log(JSON.stringify(summarizeRecording(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
}
