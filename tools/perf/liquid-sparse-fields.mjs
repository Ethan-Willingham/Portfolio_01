#!/usr/bin/env node
// Check real command orchestration, including standalone and dense paths.
// Real shader/buffer invariants are covered by liquid-sparse-fields-gpu.mjs.
// AFTER=/path/candidate.js selects a source before it is adopted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(process.env.AFTER || path.join(root, 'js/liquid-wgpu.js'), 'utf8');
const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
assert.equal(source.split(marker).length, 2);
function loadAPI(text) {
  const context = vm.createContext({ window: {}, navigator: {}, console });
  vm.runInContext(text.replace(marker, `${marker}
  window.sparseFieldsTest = {
    buildGrid, runP2G, runGrid2, runSparseEndClear,
    sparse(value) { LIQUID_SPARSE = value; }
  };`), context);
  return context.window.sparseFieldsTest;
}
const api = loadAPI(source);
const commands = [];
const pipelineNames = prefix => new Proxy({}, { get: (_, name) => prefix + '.' + String(name) });
function encoder() {
  let open = false;
  return {
    beginComputePass({ label }) {
      assert.equal(open, false, 'passes do not overlap');
      open = true;
      let pipeline;
      return {
        setPipeline(p) { pipeline = p; }, setBindGroup() {},
        dispatchWorkgroups() { commands.push({ label, pipeline }); },
        dispatchWorkgroupsIndirect() { commands.push({ label, pipeline }); },
        end() { assert.ok(open); open = false; }
      };
    },
    copyBufferToBuffer() { assert.equal(open, false, 'copies remain outside passes'); },
    finish() { assert.equal(open, false); return {}; }
  };
}
const instance = {
  device: { createCommandEncoder: encoder }, queue: { submit() {} },
  grid: { w: 128, h: 128, cells: 16384 }, uploadedCount: 513,
  gridReady: true, p2gReady: true, grid2Ready: true,
  sparseGridOK: true, sparseP2GOK: true, sparseGrid2OK: true,
  buf: pipelineNames('buf'), bg: { grid: {}, snowCount: {} },
  pipe: pipelineNames('grid'), p2gPipe: pipelineNames('p2g'),
  grid2Pipe: pipelineNames('grid2'), frameEncoder: encoder(),
  frameSparseFieldsClear: false
};
const fields = new Set(['p2g.clearSparse', 'grid2.clearGrid2Sparse', 'grid2.heatClearSparse']);
function check(operation, fieldClears, countClears, message) {
  commands.length = 0;
  operation();
  assert.equal(commands.filter(c => fields.has(c.pipeline)).length, fieldClears, message);
  if (countClears !== undefined) {
    assert.equal(commands.filter(c => c.pipeline === 'grid.clearCountSparse').length, countClears, message + ': count clear');
  }
}

api.sparse(1);
api.runP2G(instance);
check(() => api.buildGrid(instance, true, true), 3, 1, 'first snow grid consumes liquid fields');
check(() => api.buildGrid(instance, true, true), 0, 1, 'second snow grid preserves known zeros');
check(() => api.buildGrid(instance, true, true), 0, 1, 'third snow grid preserves known zeros');
check(() => api.runSparseEndClear(instance), 0, 1, 'last snow stage still clears counts');
api.runP2G(instance);
check(() => api.buildGrid(instance, true, true), 3, 1, 'P2G invalidates earlier zero fields');
api.runGrid2(instance, 0, true);
check(() => api.buildGrid(instance, true, true), 3, 1, 'grid2 invalidates earlier zero fields');

// A water-only quantum still needs its final field clear, even following snow.
api.runP2G(instance);
api.runGrid2(instance, 0, true);
check(() => api.runSparseEndClear(instance), 3, 1, 'water-only final clear');

// Standalone test/debug stages must ignore even a deliberately stale flag.
instance.frameEncoder = null;
instance.frameSparseFieldsClear = true;
check(() => api.buildGrid(instance, true, true), 3, 1, 'standalone grid');
check(() => api.runSparseEndClear(instance), 3, 1, 'standalone final clear');

// Sparse veto and dense mode keep the original dense clear commands.
for (const mode of ['disabled', 'veto']) {
  api.sparse(mode === 'veto' ? 1 : 0);
  instance.sparseVeto = mode === 'veto';
  instance.frameEncoder = encoder();
  instance.frameSparseFieldsClear = true;
  check(() => api.buildGrid(instance, true, true), 0, 0, mode + ': dense grid');
  assert.equal(commands.filter(c => c.pipeline === 'grid.clearCells').length, 1);
  check(() => api.runP2G(instance), 0, 0, mode + ': P2G');
  assert.equal(commands.filter(c => c.pipeline === 'p2g.clear').length, 1);
  check(() => api.runGrid2(instance, 0, true), 0, 0, mode + ': grid2');
  assert.equal(commands.filter(c => c.pipeline === 'grid2.clearDV').length, 1);
}

// The retained dispatches keep the same order and pass labels. This compares
// the actual prior module against the candidate rather than a copied chain.
const reference = process.env.BEFORE ? fs.readFileSync(process.env.BEFORE, 'utf8') :
  execFileSync('git', ['show', (process.env.BEFORE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598') + ':js/liquid-wgpu.js'],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
function chain(tool) {
  tool.sparse(1);
  const body = { ...instance, sparseVeto: false, frameSparseFieldsClear: false, frameEncoder: encoder() };
  commands.length = 0;
  for (let quantum = 0; quantum < 2; quantum++) {
    tool.buildGrid(body, quantum > 0);
    tool.runP2G(body);
    tool.runGrid2(body, quantum, true);
    for (let grain = 0; grain < 3; grain++) tool.buildGrid(body, true, true);
  }
  tool.runSparseEndClear(body);
  return commands.slice();
}
const prior = chain(loadAPI(reference)), optimized = chain(api);
assert.equal(prior.length - optimized.length, 18, 'only eighteen redundant field dispatches removed');
assert.deepEqual(optimized.filter(c => !fields.has(c.pipeline)), prior.filter(c => !fields.has(c.pipeline)),
  'every retained dispatch keeps its pipeline, pass and ordering');
console.log('PASS: sparse field invalidation, repeated snow grids, water-only, standalone, dense and veto paths');
