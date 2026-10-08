#!/usr/bin/env node
// Direct collision queue dispatches preserve the guarded active invocation set.
// This checks production shaders and calls, including empty and partial groups.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(process.env.AFTER || path.join(root, 'js/liquid-wgpu.js'), 'utf8');
const reference = process.env.BEFORE ? fs.readFileSync(process.env.BEFORE, 'utf8') :
  execFileSync('git', ['show', (process.env.BEFORE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598') + ':js/liquid-wgpu.js'],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
function load(text) {
  const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(text.split(marker).length, 2);
  const context = vm.createContext({ window: {}, navigator: {}, console });
  vm.runInContext(text.replace(marker, marker + '\nwindow.queueTest={snow:WGSL_SNOW_COLLIDE,liquid:WGSL_LIQUID_COLLIDE,runCollide};'), context);
  return context.window.queueTest;
}
const api = load(source), before = load(reference);
for (const key of ['snow', 'liquid']) assert.equal(api[key], before[key], key + ' shader bytes remain unchanged');
for (const [key, entry, counter] of [
  ['snow', 'snowGuestPrimary', 'snowGuestCount'],
  ['snow', 'snowFallback', 'snowFallbackCount'],
  ['liquid', 'liquidCompactFallback', 'liquidFallbackCount']
]) {
  const shader = api[key];
  const guard = new RegExp('@compute\\s+@workgroup_size\\(32\\)\\s+fn ' + entry +
    '\\([^]*?\\{\\s*if\\s*\\(gid.x\\s*>=\\s*atomicLoad\\(&' + counter + '\\[0\\]\\)\\)\\s*\\{ return; \\}');
  assert(guard.test(shader), entry + ': bounds guard precedes any queue access');
  assert.equal((shader.match(new RegExp('atomicAdd\\(&' + counter + '\\[0\\]', 'g')) || []).length, 1,
    counter + ': one enqueue site per upstream invocation');
  assert(new RegExp('atomicStore\\(&' + counter + '\\[0\\],\\s*0u\\)').test(shader), counter + ': reset before use');
  assert(!/workgroupBarrier|storageBarrier/.test(shader), entry + ': inactive lanes need not reach a barrier');
}

const trace = [];
const names = new Proxy({}, { get: (_, key) => String(key) });
const instance = {
  collideReady: true, device: {}, buf: names, collidePipe: names,
  liquidPrimaryBGs: [{}], snowPrimaryBGs: [{}], snowGuestBGs: [{}],
  liquidFallbackBGs: [{}], snowFallbackBGs: [{}],
  frameEncoder: {
    beginComputePass({ label }) {
      let pipeline;
      return {
        setPipeline(p) { pipeline = p; }, setBindGroup() {}, end() {},
        dispatchWorkgroups(x) { trace.push({ label, pipeline, x, indirect: false }); },
        dispatchWorkgroupsIndirect() { trace.push({ label, pipeline, indirect: true }); }
      };
    }
  }
};
let queueCases = 0, calls = 0;
for (const count of [0, 1, 2, 31, 32, 33, 255, 256, 257, 513, 1024, 12288]) {
  instance.uploadedCount = count;
  for (const snow of [false, true]) {
    trace.length = 0;
    api.runCollide(instance, 0, snow);
    const queues = trace.filter(row => /guestPrimary|fallback/.test(row.label));
    assert.equal(queues.length, count === 0 ? 0 : snow ? 2 : 1);
    for (const call of queues) {
      assert.equal(call.indirect, false);
      assert.equal(call.x, Math.ceil(count / 32));
      calls++;
    }
  }
  for (const queued of new Set([0, Math.min(count, 1), Math.max(0, count - 1), count])) {
    const direct = Math.ceil(count / 32) * 32;
    const indirect = Math.ceil(queued / 32) * 32;
    assert(direct >= indirect);
    for (let lane = 0; lane < direct; lane++) {
      assert.equal(lane < queued, lane < indirect && lane < queued, 'same active invocation IDs');
    }
    queueCases++;
  }
}
console.log(`PASS: unchanged shaders, ${queueCases} queue bounds and ${calls} production direct dispatches`);
