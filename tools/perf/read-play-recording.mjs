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
const active = trace.seconds.filter(s => s.frames && s.durationMs >= 900 && s.state.visible && !s.state.paused);
const worst = [...active].sort((a, b) => a.fps - b.fps).slice(0, 12).map(s => ({ seconds: s.atMs / 1000,
  fps: s.fps, cpuMs: s.cpuMs, maxIntervalMs: s.maxIntervalMs, snow: s.state.snowActive,
  awakeSlimes: s.state.awakeResidents, jet: s.state.jet, holding: s.state.holding, bath: s.state.bath,
  topCPU: s.topCPU.slice(0, 5) }));
const gpu = {};
for (const sample of trace.gpu) for (const pass of sample.passes) {
  const name = sample.name + '/' + pass.name; (gpu[name] ||= []).push(pass.ms);
}
console.log(JSON.stringify({ version: trace.version, durationSeconds: trace.durationMs / 1000,
  frames: trace.frameCount, reason: trace.reason, metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, distribution(v)])),
  worstSeconds: worst, largestHitches: hitches.sort((a, b) => b.intervalMs - a.intervalMs).slice(0, 20),
  cpuAverage: Object.entries(cpu).map(([name, total]) => ({ name, ms: total / trace.frameCount })).sort((a, b) => b.ms - a.ms).slice(0, 16),
  gpu: Object.entries(gpu).map(([name, values]) => ({ name, samples: values.length, ...distribution(values) })).sort((a, b) => b.mean - a.mean).slice(0, 20),
  gpuStatus: trace.gpuStatus, dropped: { events: trace.droppedEvents, gpu: trace.droppedGPU, buckets: trace.droppedBuckets },
  notes: trace.metadata.notes }, null, 2));
