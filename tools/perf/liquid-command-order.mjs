#!/usr/bin/env node
// Compare live liquid command orchestration with the pre-optimization source.
// This models queue ordering and uniform bytes, not GPU shader execution.
// Run: node tools/perf/liquid-command-order.mjs
// Override the comparison commit with BASE_REF=<ref>.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baseRef = process.env.BASE_REF || 'f392c72';
const baseline = path => execFileSync('git', ['show', `${baseRef}:${path}`], { cwd: root, encoding: 'utf8' });
const current = path => readFileSync(resolve(root, path), 'utf8');
const liquidPath = 'js/liquid-wgpu.js';
const sources = { before: baseline(liquidPath), after: current(liquidPath) };

function instrument(source) {
  const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(source.split(marker).length, 2, 'module export marker must be unique');
  return source.replace(marker, `${marker}
  window.liquidTest = {
    buildBuffers: buildBuffers, runFrame: runFrame,
    runGrid2: runGrid2, runG2P: runG2P,
    computeTerrainBounds: computeTerrainBounds,
    uploadTerrainMask: uploadTerrainMask,
    configure: function (v) {
      LIQUID_SPARSE = v.sparse;
      LIQUID_SPARSE_MIN_CELLS = 0;
      LIQUID_BATH_ON = v.bath;
      LIQUID_DECLUMP_ON = v.declump;
      LIQUID_CALM_LOCAL = 1;
      LIQUID_TIMESCALE = 1;
      LIQUID_FIXED_STEP = v.fixed;
      liquidStepAcc = 0;
    }
  };`);
}

function gpuStub() {
  const buffers = [];
  const trace = [];
  const writes = [];
  const counts = { encoders: 0, submits: 0, commandBuffers: 0 };
  const fault = { pass: null, finish: false };
  const bytes = buffer => buffer.bytes || Buffer.alloc(0);
  const uniformSnapshot = () => buffers
    .filter(b => /^liquid\.(gridParams|gameParams\.|simParams)/.test(b.label))
    .map(b => [b.label, createHash('sha256').update(bytes(b)).digest('hex')]);
  const queue = {
    writeBuffer(buffer, offset, data, dataOffset = 0, size) {
      const unit = data.BYTES_PER_ELEMENT || 1;
      const length = size === undefined ? data.byteLength - dataOffset * unit : size * unit;
      const src = Buffer.from(data.buffer || data, (data.byteOffset || 0) + dataOffset * unit, length);
      buffer.bytes ||= Buffer.alloc(buffer.size);
      src.copy(buffer.bytes, offset);
      writes.push({ label: buffer.label, offset, bytes: length });
    },
    submit(commandBuffers) {
      counts.submits++;
      counts.commandBuffers += commandBuffers.length;
      // queue.writeBuffer takes effect before subsequent submits. Encoded
      // dispatches read uniforms when submitted, never when recorded.
      for (const cb of commandBuffers) {
        for (const event of cb) {
          trace.push(event[0].startsWith('dispatch')
            ? [...event, uniformSnapshot()] : event);
        }
      }
    }
  };
  const device = {
    queue,
    createBuffer({ label, size }) {
      const buffer = { label, size };
      buffers.push(buffer);
      return buffer;
    },
    createCommandEncoder() {
      counts.encoders++;
      const commands = [];
      let open = false;
      let finished = false;
      return {
        beginComputePass({ label }) {
          assert.ok(!open && !finished, 'no overlapping passes or finished encoder reuse');
          if (fault.pass === label) throw new Error('injected encode failure');
          open = true;
          commands.push(['beginPass', label]);
          return {
            setPipeline(pipeline) { commands.push(['pipeline', pipeline]); },
            setBindGroup(slot, group) { commands.push(['bindGroup', slot, group]); },
            dispatchWorkgroups(...dims) { commands.push(['dispatch', ...dims]); },
            dispatchWorkgroupsIndirect(buffer, offset) { commands.push(['dispatchIndirect', buffer.label, offset]); },
            end() { assert.ok(open); open = false; commands.push(['endPass']); }
          };
        },
        copyBufferToBuffer(src, so, dst, offset, size) {
          assert.ok(!open && !finished, 'copies must stay outside compute passes');
          commands.push(['copy', src.label, so, dst.label, offset, size]);
        },
        clearBuffer(buffer) { commands.push(['clear', buffer.label]); },
        finish() {
          assert.ok(!open && !finished, 'finish requires a closed, unfinished encoder');
          if (fault.finish) throw new Error('injected finish failure');
          finished = true;
          return commands;
        }
      };
    }
  };
  function reset() {
    trace.length = 0;
    writes.length = 0;
    counts.encoders = counts.submits = counts.commandBuffers = 0;
  }
  return { device, queue, trace, writes, counts, fault, reset };
}

function fixture(source, config = { sparse: 0, bath: 0, declump: 1, fixed: 1 }) {
  const context = vm.createContext({
    window: {}, navigator: {}, console: { log() {}, warn() {}, error() {} },
    GPUBufferUsage: { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, INDIRECT: 8, UNIFORM: 16 }
  });
  vm.runInContext(instrument(source), context, { filename: liquidPath });
  const api = context.window.liquidTest;
  api.configure(config);
  const arrays = {};
  for (const key of ['x', 'y', 'vx', 'vy', 'g00', 'g01', 'g10', 'g11', 'density', 'aeration', 'type', 'origin', 'sleeping', 'frozen', 'restFrames']) {
    arrays[key] = new Float32Array(4);
  }
  arrays.x.set([64, 96, 64, 96]);
  arrays.y.set([64, 64, 96, 96]);
  const terrain = { solid: true, edit: false, calls: 0 };
  const liquid = {
    maxParticles: 4, cellSize: 4,
    arrays, getCount: () => 4, getMutationSeq: () => 0,
    fillTerrainSolid(col, row, w, h, out) {
      terrain.calls++;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out[y * w + x] = terrain.solid && (((x + col + y + row) % 3 === 0) !== terrain.edit) ? 1 : 0;
        }
      }
    },
    // Distinct game data makes slot selection and uniform bytes observable.
    getGameState: () => ({
      player: { active: true, x: 71, y: 83, dir: -1, vx: 15, vy: -8 },
      rocket: { active: true, intensity: 0.6, exDirX: 0.2, exDirY: -1 },
      guests: [{ x: 80, y: 90, hw: 12, hh: 10, mvx: 20, mvy: -10,
        pts: [68, 80, 20, -10, 92, 80, 20, -10, 92, 100, 20, -10, 68, 100, 20, -10] }]
    })
  };
  const instance = context.window.LiquidWGPU.create({ liquid });
  const gpu = gpuStub();
  instance.device = gpu.device;
  instance.queue = gpu.queue;
  api.buildBuffers(instance);
  instance.worldCols = 320;
  instance.worldTile = 16;
  instance.worldTotalRows = 800;
  instance.residentSeeded = true;
  instance.uploadedCount = 4;
  instance.lastUploadSeq = 0;
  instance.simActive = true;
  instance.renderActive = true;
  instance.readbackReady = false;
  for (const key of ['gridReady', 'p2gReady', 'grid2Ready', 'g2pReady', 'collideReady', 'declumpReady', 'sparseGridOK', 'sparseP2GOK', 'sparseGrid2OK']) instance[key] = true;
  const labels = prefix => new Proxy({}, { get: (_, key) => `${prefix}.${String(key)}` });
  for (const key of ['pipe', 'p2gPipe', 'grid2Pipe', 'g2pPipe', 'collidePipe']) instance[key] = labels(key);
  instance.bg = { grid: 'bg.grid' };
  for (const key of ['p2gBG', 'pressureBG', 'gridUpdateBG', 'gridBoundaryBG', 'g2pBG', 'collideBG', 'declumpBG', 'cellStateBG', 'cellStateBGSparse', 'declumpPipe', 'cellStatePipe', 'cellStatePipeSparse']) instance[key] = key;
  instance.gridUpdateBGs = Array.from({ length: 5 }, (_, n) => `gridUpdateBG.${n}`);
  instance.collideBGs = Array.from({ length: 5 }, (_, n) => `collideBG.${n}`);
  gpu.reset();
  return { api, instance, gpu, arrays, terrain };
}

let configurations = 0;
for (const sparse of [0, 1]) for (const bath of [0, 1]) for (const declump of [0, 1]) for (const fixed of [0, 1]) {
  const config = { sparse, bath, declump, fixed };
  const before = fixture(sources.before, config);
  const after = fixture(sources.after, config);
  for (let frame = 0; frame < 3; frame++) {
    for (const f of [before, after]) {
      f.gpu.reset();
      // Retuning must take effect on the next frame, including after a reseed.
      f.instance.setSimParam('GRAVITY', 810 + frame * 37);
      if (frame === 2) f.instance.residentSeeded = false;
      f.api.runFrame(f.instance, 1 / 30);
    }
    assert.deepEqual(after.gpu.trace, before.gpu.trace, `GPU command/uniform sequence: ${JSON.stringify(config)}, frame ${frame}`);
    assert.equal(after.gpu.counts.submits, before.gpu.counts.submits);
    assert.ok(after.gpu.counts.encoders < before.gpu.counts.encoders, 'live frame must reduce encoder count');
    assert.equal(after.gpu.writes.filter(w => w.label === 'liquid.simParams').length, 1, 'one SimParams upload per live frame');
    assert.equal(before.gpu.writes.filter(w => w.label === 'liquid.simParams').length, 12, 'fixture must execute four complete substeps');
    assert.equal(new Set(after.instance.gameParamsBufs.slice(0, 4).map(b => b.bytes.toString('hex'))).size, 4, 'moving guest must produce distinct substep uniforms');
    assert.equal(after.instance.frameEncoder, null);
  }
  const trace = after.gpu.trace;
  assert.equal(trace.filter(e => e[0] === 'beginPass' && e[1] === 'liquid.declump').length, declump ? 4 : 0);
  assert.equal(trace.filter(e => e[0] === 'pipeline' && e[1] === `grid2Pipe.${sparse ? 'heatNormalizeSparse' : 'heatNormalize'}`).length, bath ? 4 : 0);
  assert.equal(trace.filter(e => e[0] === 'copy' && e[1] === 'liquid.blockMeta').length, sparse ? 4 : 0);
  configurations++;
}

// Cache output equivalence, including first all-zero upload, repeated bytes,
// moved bounds, partial final words, shrink/grow, and live terrain edits.
const terrainBefore = fixture(sources.before);
const terrainAfter = fixture(sources.after);
const cases = [
  { tiles: 33, origin: 0, solid: false, edit: false, write: true },
  { tiles: 33, origin: 0, solid: false, edit: false, write: false },
  { tiles: 33, origin: 3, solid: false, edit: false, write: false },
  { tiles: 33, origin: 3, solid: true, edit: false, write: true },
  { tiles: 33, origin: 3, solid: true, edit: true, write: true },
  { tiles: 31, origin: 3, solid: true, edit: true, write: true },
  { tiles: 63, origin: 3, solid: true, edit: true, write: true },
  { tiles: 64, origin: 3, solid: true, edit: true, write: false },
  { tiles: 65, origin: 3, solid: true, edit: true, write: true },
  { tiles: 65, origin: 4, solid: true, edit: true, write: true },
  { tiles: 65, origin: 4, solid: true, edit: true, write: false }
];
for (const c of cases) {
  for (const f of [terrainBefore, terrainAfter]) {
    f.gpu.reset();
    f.terrain.solid = c.solid;
    f.terrain.edit = c.edit;
    f.instance.terrain = { originCol: c.origin, originRow: 0, w: c.tiles, h: 1, tiles: c.tiles };
    assert.equal(f.api.uploadTerrainMask(f.instance), c.tiles);
  }
  const length = Math.ceil(c.tiles / 32) * 4;
  assert.deepEqual(terrainAfter.instance.buf.terrainMask.bytes.subarray(0, length), terrainBefore.instance.buf.terrainMask.bytes.subarray(0, length), `terrain GPU bytes: ${JSON.stringify(c)}`);
  assert.equal(terrainAfter.gpu.writes.length, Number(c.write), `terrain transfer gate: ${JSON.stringify(c)}`);
}
assert.equal(terrainAfter.terrain.calls, cases.length, 'terrain hook must run even when transfer is skipped');
for (const f of [terrainBefore, terrainAfter]) {
  delete f.instance.liquid.fillTerrainSolid;
  f.api.uploadTerrainMask(f.instance);
}
assert.deepEqual(terrainAfter.instance.buf.terrainMask.bytes.subarray(0, 12), Buffer.alloc(12), 'missing terrain hook clears old solid bits');
assert.deepEqual(terrainAfter.instance.buf.terrainMask.bytes, terrainBefore.instance.buf.terrainMask.bytes, 'missing hook remains equivalent');

// Uniform refresh and standalone submission must resume after encode failure.
for (const failure of ['pass', 'finish']) {
  const f = fixture(sources.after);
  if (failure === 'pass') f.gpu.fault.pass = 'liquid.grid2';
  else f.gpu.fault.finish = true;
  f.instance.update(1 / 30);
  assert.equal(f.instance.frameEncoder, null, `${failure}: clear encoder in finally`);
  assert.equal(f.instance.simActive, false, `${failure}: CPU sim fallback`);
  assert.equal(f.instance.renderActive, false, `${failure}: CPU render fallback`);
  assert.equal(f.gpu.counts.submits, 0, `${failure}: incomplete frame must not submit`);
  f.gpu.fault.pass = null;
  f.gpu.fault.finish = false;
  f.gpu.reset();
  f.instance.setSimParam('GRAVITY', 1234);
  f.api.runGrid2(f.instance);
  assert.equal(f.gpu.counts.submits, 1, `${failure}: standalone stage submits`);
  assert.equal(f.gpu.writes.filter(w => w.label === 'liquid.simParams').length, 1);
  assert.equal(f.instance.simParamsBuf.bytes.readFloatLE(0), 1234, `${failure}: tuning refresh resumes`);
}

// Exhaustively check the 4x4 water-cushion occupancy space. Center samples
// visit every possible set of occupied cells; extra oil/outside particles
// and duplicate cells cover the scan's rejection and de-duplication paths.
function cushionFunction(source) {
  const start = source.indexOf('  function playerWaterCushion() {');
  assert.ok(start >= 0);
  const end = source.indexOf('\n  }', start) + '\n  }'.length;
  assert.ok(end > start);
  const state = { player: { x: 100, y: 100 }, PLAYER_W: 20, PLAYER_H: 24, liquidCount: 0, liquidType: [], liquidX: [], liquidY: [] };
  const context = vm.createContext(state);
  vm.runInContext(source.slice(start, end), context);
  return { state, run: context.playerWaterCushion };
}
const cushionPath = 'js/sluice/040-init-resize-resolution.js';
const cushions = [cushionFunction(baseline(cushionPath)), cushionFunction(current(cushionPath))];
for (let mask = 0; mask < 65536; mask++) {
  for (const { state } of cushions) {
    state.liquidType = [1, 0];
    state.liquidX = [100, -999];
    state.liquidY = [100, -999];
    for (let bit = 0; bit < 16; bit++) if (mask & (1 << bit)) {
      const x = 91 + ((bit % 4) + 0.5) * 38 / 4;
      const y = 91 + (Math.floor(bit / 4) + 0.5) * 42 / 4;
      state.liquidType.push(0, 0);
      state.liquidX.push(x, x);
      state.liquidY.push(y, y);
    }
    state.liquidCount = state.liquidType.length;
  }
  assert.equal(cushions[1].run(), cushions[0].run(), `water cushion occupancy mask ${mask}`);
}

console.log(`PASS: ${configurations} liquid configurations x 3 live frames preserve command/pass/copy order and uniform bytes.`);
console.log(`PASS: ${cases.length} terrain transitions, encode/finish fallback cleanup, and all 65,536 water-cushion occupancy masks.`);
console.log(`Baseline: ${baseRef}. Stub GPU coverage only; real WebGPU boot and visual checks remain required.`);
