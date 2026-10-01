// Read a locally exported gameplay trace. CPU buckets overlap; never sum them.
// Usage: node tools/perf/read-play-recording.mjs /absolute/path/recording.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = process.argv[2]; assert(file, 'Provide the exported recording JSON');
const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(trace.schema, 'sluice-performance-1');
assert(trace.stride === trace.columns.length && trace.frameChunks.reduce((n, c) => n + c.length, 0) === trace.frameCount * trace.stride, 'Complete packed frames');
const index = name => trace.columns.indexOf(name);
const metrics = { intervalMs: [], cpuMs: [], recorderMs: [] };
const hitches = [], cpu = {};
let frameId = 0;
for (const chunk of trace.frameChunks) {
  assert.equal(chunk.length % trace.stride, 0);
  for (let offset = 0; offset < chunk.length; offset += trace.stride, frameId++) {
    const get = name => chunk[offset + index(name)];
    if (get('visible') && !get('paused')) for (const name in metrics) metrics[name].push(get(name));
    for (let i = 0; i < trace.columns.length; i++) {
      const name = trace.columns[i]; if (name?.startsWith('cpu.')) cpu[name] = (cpu[name] || 0) + chunk[offset + i];
    }
    if (get('intervalMs') >= 40) hitches.push({ frame: frameId, seconds: get('atMs') / 1000,
      intervalMs: get('intervalMs'), cpuMs: get('cpuMs'), view: get('view'), x: get('x'), y: get('y'),
      snow: get('snowActive'), slimes: get('awakeResidents'), microsteps: get('microsteps'), jet: !!get('jet'), holding: !!get('holding') });
  }
}
function distribution(values) {
  values.sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / (values.length || 1),
    p50: values[Math.floor((values.length - 1) * .5)] ?? null,
    p95: values[Math.floor((values.length - 1) * .95)] ?? null,
    p99: values[Math.floor((values.length - 1) * .99)] ?? null, max: values.at(-1) ?? null };
}
// A short pause may start and finish between two snapshots. Use its events,
// rather than just the state at the end of the bin, to exclude that interval.
const transitions = trace.events.filter(e => ['pause', 'resume', 'visibility', 'blur'].includes(e.kind));
const active = trace.seconds.filter(s => s.frames && s.durationMs >= 900 && s.state.visible && !s.state.paused &&
  !transitions.some(e => e.atMs > s.atMs - s.durationMs && e.atMs <= s.atMs));
const worst = [...active].sort((a, b) => a.fps - b.fps).slice(0, 12).map(s => ({ seconds: s.atMs / 1000,
  fps: s.fps, cpuMs: s.cpuMs, maxIntervalMs: s.maxIntervalMs, snow: s.state.snowActive,
  awakeSlimes: s.state.awakeResidents, jet: s.state.jet, holding: s.state.holding, bath: s.state.bath,
  topCPU: s.topCPU.slice(0, 5) }));
const gpu = {}, gpuEncoders = {};
for (const sample of trace.gpu) {
  const quanta = sample.passes.filter(pass => pass.name === 'liquid.g2p').length;
  const grainTicks = sample.passes.filter(pass => pass.name === 'snow.predict').length;
  const key = sample.name === 'liquid.frame' ? sample.name + ': ' + quanta + ' quanta / ' + grainTicks + ' grain ticks' : sample.name;
  const group = gpuEncoders[key] ||= { samples: 0, partial: 0, sums: [], spans: [] };
  group.samples++; group.partial += !!sample.partial;
  if (sample.partial) continue;
  if (Number.isFinite(sample.ms)) group.sums.push(sample.ms);
  if (Number.isFinite(sample.spanMs)) group.spans.push(sample.spanMs);
  for (const pass of sample.passes) {
    const name = sample.name + '/' + pass.name; (gpu[name] ||= []).push(pass.ms);
  }
}
console.log(JSON.stringify({ version: trace.version, durationSeconds: trace.durationMs / 1000,
  frames: trace.frameCount, reason: trace.reason, metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, distribution(v)])),
  worstSeconds: worst, largestHitches: hitches.sort((a, b) => b.intervalMs - a.intervalMs).slice(0, 20),
  cpuAverage: Object.entries(cpu).map(([name, total]) => ({ name, ms: total / trace.frameCount })).sort((a, b) => b.ms - a.ms).slice(0, 16),
  gpu: Object.entries(gpu).map(([name, values]) => ({ name, samples: values.length, ...distribution(values) })).sort((a, b) => b.mean - a.mean).slice(0, 20),
  gpuEncoders: Object.entries(gpuEncoders).map(([name, group]) => ({ name, samples: group.samples, partial: group.partial,
    passSumMs: group.sums.length ? distribution(group.sums) : null,
    spanSamples: group.spans.length, spanMs: group.spans.length ? distribution(group.spans) : null })),
  gpuLimitations: 'Sparse encoders exclude queue wait, WebGL smoke and composition. Span includes pass gaps. Older traces have no span; partial samples are excluded from cost distributions.',
  gpuStatus: trace.gpuStatus, dropped: { events: trace.droppedEvents, gpu: trace.droppedGPU, buckets: trace.droppedBuckets },
  notes: trace.metadata.notes }, null, 2));
