// Direct upper bounds preserve exactly the guarded snow invocation domain.
// Real GPU field/particle coverage is in liquid-sparse-fields-gpu.mjs.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const current = fs.readFileSync('js/liquid-wgpu.js', 'utf8').replace(/\r\n/g, '\n');
const original = execFileSync('git', ['show', '4219c6f6c5e2bf86316d5e14ac156720f0184598:js/liquid-wgpu.js'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).replace(/\r\n/g, '\n');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a > 0 && b > a); return source.slice(a, b);
}
for (const [start, end] of [['  var WGSL_SNOW_GRAINS =', '  // Correct the nozzle field'], ['  var WGSL_SNOW_GATHER =', '  function buildSnowGrainPipeline']]) {
  const shader = section(current, start, end);
  assert.equal(shader, section(original, start, end), 'active shader arithmetic remains unchanged');
  assert.ok(!/workgroupBarrier|storageBarrier|textureBarrier/.test(shader), 'extra idle lanes introduce no workgroup barrier path');
}
for (const guard of [
  'if(id.x>=snowSpatial.w){return;}sortedBefore[id.x]=pos[sortedIdx[id.x]];',
  'if(id.x>=snowSpatial.w){return;}contactParticle(sortedIdx[id.x],false,id.x);',
  'if(id.x>=snowSpatial.w){return;}contactParticle(sortedIdx[id.x],true,id.x);'
]) assert.ok(current.includes(guard), 'every spatial entry guards before its first particle access');
const snowCounter = section(current, '  function snowCountKernel(', '  /* ---- v15.0');
assert.equal(snowCounter.split('atomicAdd(&snowDispatch[3], 1u)').length - 1, 1);
assert.ok(snowCounter.includes('atomicStore(&snowDispatch[3],0u)'));
assert.ok(section(current, '  function countKernel(', '  function snowCountKernel(').includes('if (i >= gp.count) { return; }'));
const encoding = section(current, '  function runSnowGrains(', '  function runFrame(');
assert.ok(!encoding.includes('dispatchWorkgroupsIndirect(instance.buf.snowGrainDispatch'));
assert.ok(encoding.includes("pass.setPipeline(instance.snowGrainPipe[spatial ? kind+'Spatial' : kind]);\n    pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));"));
let cases = 0;
for (const total of [0, 1, 2, 31, 32, 33, 255, 256, 257, 511, 512, 513, 1024, 4096, 8829, 40000]) {
  for (const count of new Set([0, 1, total - 1, total, 255, 256, 257].filter(n => n >= 0 && n <= total))) {
    const direct = [], indirect = [];
    for (let id = 0; id < Math.ceil(total / 256) * 256; id++) if (id < count) direct.push(id);
    for (let id = 0; id < Math.ceil(count / 256) * 256; id++) if (id < count) indirect.push(id);
    assert.deepEqual(direct, indirect); cases++;
  }
}
console.log(JSON.stringify({ passed: true, cases, shaderArithmetic: 'unchanged', activeInvocations: 'identical' }));
