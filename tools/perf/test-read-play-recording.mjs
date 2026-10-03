// Untimed reader acceptance checks. Synthetic traces, no browser or GPU.
import assert from 'node:assert/strict';
import {summarizeRecording} from './read-play-recording.mjs';
function trace(columns, rows, extra = {}) {
  const packed = rows.map(row => columns.map(name => row[name] || 0));
  return {schema: 'sluice-performance-1', version: 'reader-fixture', durationMs: rows.at(-1).atMs,
    frameCount: rows.length, columns, stride: columns.length,
    frameChunks: [packed.slice(0, 113).flat(), packed.slice(113).flat()],
    seconds: [], events: [], gpu: [], metadata: {}, ...extra};
}
const rows = Array.from({length: 420}, (_, i) => {
  const atMs = i * 10, active = i >= 2 && !(atMs >= 1200 && atMs < 1600);
  return {atMs, frameId: i + 1, active: +active, visible: 1, paused: 0,
    intervalMs: atMs === 2200 ? 200 : 10, cpuMs: active ? 6 : 999,
    observerMs: active ? .02 : 99, snowActive: 3500, awakeResidents: 3,
    microsteps: 4, 'cpu.update.jello': active ? 4 : 700,
    'cpu.render.total': active ? 2 : 200};
});
// Reordered columns and an unrelated extra field must not change attribution.
const columns = ['frameId', 'snowActive', 'atMs', 'cpu.update.jello', 'active', 'cpuMs',
  'intervalMs', 'paused', 'visible', 'observerMs', 'awakeResidents', 'microsteps', 'cpu.render.total', 'unrelated'];
const rolling = trace(columns, rows, {metadata: {rolling: true},
  slowdown: {frameId: -1, kind: 'gap', severity: 300, gapMs: 300,
    current: {frameId: -1, atMs: -100, cpuMs: 4}}, observer: {frameMs: .02, panelPaintMs: .4},
  gpu: [{name: 'liquid.frame', frameId: 221, atMs: 2200, ms: 2.5, spanMs: 3,
    passes: [{name: 'snow.predict', ms: .5}, {name: 'snow.escape', ms: 2}]},
    {name: 'liquid.frame', frameId: 333, ms: 400, partial: true, passes: [{name: 'snow.escape', ms: 400}]}],
  workload: [{frameId: 221, atMs: 2200, snowGuestTotal: 2000, snowGuestPeak: 100,
    snowFallbackTotal: 400, snowFallbackPeak: 20, collisionBatches: 20, snowCollisionBatches: 20, copyBytes: 160}]});
const report = summarizeRecording(rolling);
assert.equal(report.activeFrames, rows.filter(r => r.active).length);
assert.equal(report.metrics.cpuMs.mean, 6);
assert.equal(report.metrics.observerMs.max, .02);
assert.equal(report.cpuAverage.find(r => r.name === 'cpu.update.jello').ms, 4);
assert.equal(report.largestHitches.length, 1);
assert.equal(report.largestHitches[0].frameId, 221);
assert.equal(report.largestHitches[0].precedingFrame.frameId, 220);
assert.equal(report.worstSeconds[0].seconds, 3);
assert(!report.worstSeconds.some(s => s.seconds === 2), 'Menu frames exclude that whole second');
assert.equal(report.slowdown.outsideRetainedHistory, true);
assert.equal(report.slowdown.current.seconds, -.1);
assert.equal(report.workload[0].matchedGPU.ms, 2.5);
assert.equal(report.workload[0].snowEscapeVisits, 400);
assert.equal(report.gpu.find(r => r.name.endsWith('/snow.escape')).mean, 2);
assert.equal(report.observer.panelPaintMs, .4);
const manualRows = [
  {atMs: 0, intervalMs: 10, cpuMs: 4, visible: 1, 'cpu.update.jello': 3},
  {atMs: 100, intervalMs: 100, cpuMs: 999, visible: 1, paused: 1, 'cpu.update.jello': 700},
  {atMs: 200, intervalMs: 100, cpuMs: 999, visible: 1, view: 2, 'cpu.update.jello': 700},
  {atMs: 500, intervalMs: 400, cpuMs: 999, visible: 1, 'cpu.update.jello': 700},
  {atMs: 600, intervalMs: 100, cpuMs: 999, visible: 0, 'cpu.update.jello': 700},
  {atMs: 1100, intervalMs: 10, cpuMs: 4, visible: 1, 'cpu.update.jello': 3}
];
const manual = summarizeRecording(trace(['view', 'atMs', 'intervalMs', 'cpuMs', 'visible', 'paused', 'cpu.update.jello'], manualRows,
  {events: [{kind: 'pause', atMs: 250}, {kind: 'resume', atMs: 400}],
   seconds: [{atMs: 1000, durationMs: 1000, frames: 20, fps: 20, cpuMs: 999,
     maxIntervalMs: 400, state: {visible: true, paused: false}, topCPU: []},
     {atMs: 2000, durationMs: 1000, frames: 100, fps: 100, cpuMs: 4,
      maxIntervalMs: 10, state: {visible: true, paused: false}, topCPU: []}]}));
assert.equal(manual.activeFrames, 2);
assert.equal(manual.metrics.cpuMs.mean, 4);
assert.equal(manual.cpuAverage[0].ms, 3);
assert.equal(manual.largestHitches.length, 0);
assert.equal(manual.worstSeconds.length, 1);
assert.equal(manual.worstSeconds[0].fps, 100);
assert(!('observerMs' in manual.metrics), 'Older traces need no new fields');
const interrupted = summarizeRecording({...rolling, events: [{kind: 'pause', atMs: 2550}, {kind: 'resume', atMs: 2570}]});
assert(!interrupted.worstSeconds.some(s => s.seconds === 3), 'Pause between frame states rejects the second');
assert.equal(interrupted.metrics.cpuMs.max, 6);
assert.throws(() => summarizeRecording({...rolling, stride: rolling.stride + 1}), /Complete packed frames/);
console.log(JSON.stringify({passed: true, cases: 4, rollingAndLegacy: true, interruptedBins: true,
  activeAttribution: true, previousFrameContext: true, noBrowser: true, noGPU: true}));
