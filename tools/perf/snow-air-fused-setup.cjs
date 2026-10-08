// Optional shader setup must retain the original solve until validated, and
// leave it active for unsupported limits, validation failure, or disposal.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/liquid-wgpu.js', 'utf8');
const context = { GPUShaderStage: { COMPUTE: 4 } }; context.window = context;
vm.createContext(context);
vm.runInContext(source.replace('  window.LiquidWGPU =', '  window.__airSetup={buildSnowBoundaryFused,runSnowBoundary,snowPressureFusedShader};\n  window.LiquidWGPU ='), context);
const api = context.__airSetup;
function fixture(lanes = 1024, storage = 32768, validation = null, throwGroup = false) {
  let resolve, reject, open = 0, scopes = 0, shader = '', groups;
  const pipeline = new Promise((a, b) => { resolve = a; reject = b; });
  const device = {
    limits: { maxComputeWorkgroupStorageSize: storage, maxComputeInvocationsPerWorkgroup: lanes, maxComputeWorkgroupSizeX: lanes },
    pushErrorScope() { assert.equal(open, 0); open++; scopes++; },
    popErrorScope() { assert.equal(open, 1); open--; return Promise.resolve(validation); },
    createBindGroupLayout(d) { return d; }, createPipelineLayout(d) { return d; },
    createShaderModule(d) { shader = d.code; return d; },
    createComputePipelineAsync() { return pipeline; },
    createBindGroup(d) { if (throwGroup) throw new Error('bind group failed'); groups = d; return d; }
  };
  const instance = { device, buf: { snowAirField: {}, snowAirPressure0: {}, snowAirPressure1: {} }, snowGrainHost: [0, 0, 0, 0, 0, 0, 0, 1], uploadedCount: 1024,
    snowBoundaryPipes: Object.fromEntries(['clear', 'splat', 'prepare', 'pressure', 'finish'].map(k => [k, { label: k }])), snowBoundaryBG: [{}, {}] };
  api.buildSnowBoundaryFused(instance);
  assert.equal(open, 0, 'validation scope closes before asynchronous completion');
  function dispatches() {
    const labels = []; let active;
    instance.frameEncoder = { beginComputePass() { return { setPipeline(p) { active = p.label; }, setBindGroup() {}, dispatchWorkgroups() { labels.push(active); }, end() {} }; } };
    api.runSnowBoundary(instance); return labels;
  }
  return { instance, resolve, reject, dispatches, shader: () => shader, scopes: () => scopes, groups: () => groups };
}
(async function () {
  let cases = 0;
  for (const lanes of [256, 384, 512, 1024]) {
    const f = fixture(lanes), chosen = lanes >= 1024 ? 1024 : lanes >= 512 ? 512 : 256;
    assert.equal(f.instance.snowBoundaryFused, null); assert.equal(f.dispatches().length, 64);
    f.resolve({ label: 'fused' }); assert.equal(await f.instance.snowBoundaryFusedReady, true);
    assert.equal(f.instance.snowBoundaryFused.lanes, chosen); assert.equal(f.dispatches().length, 5);
    assert.ok(f.shader().includes('workgroup_size(' + chosen + ')'));
    assert.ok(f.shader().includes('array<vec4f,' + 4096 / chosen + '>'));
    assert.deepEqual(Array.from(f.groups().entries, x => x.binding), [4, 5, 6]); cases++;
  }
  const unsupported = fixture(256, 16384); assert.equal(unsupported.scopes(), 0); assert.equal(await unsupported.instance.snowBoundaryFusedReady, false); assert.equal(unsupported.dispatches().length, 64); cases++;
  const rejected = fixture(); rejected.reject(new Error('compile failed')); assert.equal(await rejected.instance.snowBoundaryFusedReady, false); assert.match(rejected.instance.snowBoundaryFusedError, /compile failed/); assert.equal(rejected.dispatches().length, 64); cases++;
  const invalid = fixture(1024, 32768, { message: 'validation failed' }); invalid.resolve({ label: 'invalid' }); assert.equal(await invalid.instance.snowBoundaryFusedReady, false); assert.match(invalid.instance.snowBoundaryFusedError, /validation failed/); assert.equal(invalid.instance.snowBoundaryFused, null); cases++;
  const disposed = fixture(); disposed.instance.snowBoundaryFusedRequest = null; disposed.resolve({ label: 'stale' }); assert.equal(await disposed.instance.snowBoundaryFusedReady, false); assert.equal(disposed.instance.snowBoundaryFused, null); cases++;
  const syncError = fixture(1024, 32768, null, true); syncError.reject(new Error('later compilation failure')); await new Promise(setImmediate); assert.match(syncError.instance.snowBoundaryFusedError, /bind group failed/); assert.equal(syncError.dispatches().length, 64); cases++;
  console.log(JSON.stringify({ passed: true, cases, fallback: '60 original iterations until validated' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
