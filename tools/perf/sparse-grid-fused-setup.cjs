// No optional sparse pipeline may become visible before both compilation and
// validation finish. Unsupported/failed setup preserves the original kernels.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const c = { GPUShaderStage: { COMPUTE: 4 } }; c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/liquid-wgpu.js', 'utf8').replace('  window.LiquidWGPU =', '  window.__gridSetup=buildSparseGridFusion;\n  window.LiquidWGPU ='), c);
function fixture(limit = 16, validation = null, ready = true, throwClear = false) {
  const pending = [], shaders = [], groups = []; let open = 0;
  const device = {
    limits: { maxStorageBuffersPerShaderStage: limit },
    pushErrorScope() { assert.equal(open, 0); open++; },
    popErrorScope() { assert.equal(open, 1); open--; return Promise.resolve(validation); },
    createBindGroupLayout(d) { return d; }, createPipelineLayout(d) { return d; },
    createShaderModule(d) { shaders.push(d.code); return d; },
    createBindGroup(d) { if (throwClear && d.entries.length === 13) throw new Error('clear group failed'); groups.push(d); return d; },
    createComputePipelineAsync(d) { return new Promise((resolve, reject) => { pending.push({ resolve, reject, label: d.label }); }); }
  };
  const i = { device, sparseCapable: true, gridReady: true, grid2Ready: ready, grid2Pipe: { heatClearSparse: {} }, paramsBuf: {},
    buf: Object.fromEntries(['blockBitmap', 'blockMeta', 'snowGrainDispatch', 'blockList', 'cellCount', 'cellMass', 'cellOilMass', 'cellAeration', 'cellVX', 'cellVY', 'cellDVX', 'cellDVY', 'cellVelX', 'cellVelY', 'cellHeat'].map(k => [k, {}])) };
  c.__gridSetup(i); assert.equal(open, 0);
  return { i, pending, shaders, groups, finish() { for (const p of pending) p.resolve({ label: p.label }); return i.sparseGridFusionReady; } };
}
(async function () {
  let cases = 0;
  for (const limit of [10, 12, 16]) {
    const f = fixture(limit); assert.equal(f.i.snowIndexResetFusion, null); assert.equal(f.i.sparseClearFusion, null);
    assert.equal(f.pending.length, limit >= 12 ? 2 : 1); assert.equal(await f.finish(), true);
    assert.ok(f.i.snowIndexResetFusion); assert.equal(!!f.i.sparseClearFusion, limit >= 12);
    assert.equal(f.groups[0].entries.length, 3);
    if (limit >= 12) { assert.equal(f.groups[1].entries.length, 13); assert.ok(f.shaders[1].includes('oil[i+2097152u]')); }
    c.__gridSetup(f.i); assert.equal(f.pending.length, limit >= 12 ? 2 : 1, 'setup is requested once'); cases++;
  }
  const early = fixture(16, null, false); assert.equal(early.pending.length, 0); assert.equal(early.i.sparseGridFusionStarted, undefined);
  early.i.grid2Ready = true; c.__gridSetup(early.i); assert.equal(await early.finish(), true); cases++;
  const validation = fixture(16, { message: 'layout invalid' }); assert.equal(await validation.finish(), false); assert.equal(validation.i.snowIndexResetFusion, null); assert.equal(validation.i.sparseClearFusion, null); assert.match(validation.i.sparseGridFusionError, /layout invalid/); cases++;
  const rejected = fixture(); rejected.pending[0].reject(new Error('compile failed')); rejected.pending[1].resolve({}); assert.equal(await rejected.i.sparseGridFusionReady, false); assert.equal(rejected.i.snowIndexResetFusion, null); assert.equal(rejected.i.sparseClearFusion, null); cases++;
  const disposed = fixture(); disposed.i.sparseGridFusionRequest = null; assert.equal(await disposed.finish(), false); assert.equal(disposed.i.snowIndexResetFusion, null); cases++;
  const synchronous = fixture(16, null, true, true); synchronous.pending[0].reject(new Error('later compile failure')); await new Promise(setImmediate); assert.match(synchronous.i.sparseGridFusionError, /clear group failed/); assert.equal(synchronous.i.sparseClearFusion, null); cases++;
  console.log(JSON.stringify({ passed: true, cases, fallback: 'original dispatches until validated' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
