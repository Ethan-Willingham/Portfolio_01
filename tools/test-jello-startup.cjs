// Exercise the shipped boot gate without allocating a browser or GPU device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const boot = fs.readFileSync(path.join(root, 'js/sluice/350-gameloop-boot.js'), 'utf8');
const start = boot.indexOf('    var _wantWGPUJello =');
assert.ok(start >= 0, 'GPU-jello boot gate must exist');
const gate = boot.slice(start);

function fixture(options = {}) {
  const calls = [];
  const water = options.water === undefined ? { readyPromise: Promise.resolve(false) } : options.water;
  const diagnostic = { simActive: false };
  const context = {
    USE_WEBGPU_JELLO: !!options.enabled,
    devMode: !!options.dev,
    ENABLE_JELLO: true,
    liquidWGPU: water,
    jelloWGPU: null,
    window: {
      location: { search: options.search || '' },
      JelloWGPU: options.backend === false ? null : {
        create(args) { calls.push(args); return diagnostic; }
      }
    }
  };
  vm.runInNewContext(gate, context);
  assert.equal(context.ENABLE_JELLO, true, 'boot gate must preserve live CPU slimes');
  if (calls.length) {
    assert.equal(calls[0].liquid, water, 'diagnostic must share the water instance');
    assert.equal(context.jelloWGPU, diagnostic);
  } else assert.equal(context.jelloWGPU, null);
  return calls.length;
}

assert.equal(fixture(), 0, 'ordinary players must skip dormant GPU work');
assert.equal(fixture({ dev: true }), 1, 'developer sessions retain the diagnostic');
assert.equal(fixture({ enabled: true }), 1, 'the GPU feature flag retains initialization');
assert.equal(fixture({ search: '?jellogpucheck=1' }), 1);
assert.equal(fixture({ search: '?nosave=1&jellogpucheck=1&bath=1' }), 1);
for (const search of ['?jellogpucheck=0', '?jellogpucheck=10', '?otherjellogpucheck=1']) {
  assert.equal(fixture({ search }), 0, 'only the exact diagnostic switch may opt in');
}
assert.equal(fixture({ dev: true, water: null }), 0, 'missing water must skip the shared-device diagnostic');
assert.equal(fixture({ dev: true, backend: false }), 0, 'missing optional backend must leave CPU slimes available');
console.log('PASS ordinary, developer, explicit, feature-flag and missing-backend boots');

(async () => {
  const context = { window: {}, console: { log() {}, warn() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/jello-wgpu.js'), 'utf8'), context);
  const pendingWater = { available: false, device: null, readyPromise: Promise.resolve(false) };
  const diagnostic = context.window.JelloWGPU.create({ liquid: pendingWater });
  assert.equal(await diagnostic.readyPromise, false, 'unavailable water must settle with a CPU fallback');
  assert.equal(diagnostic.failed, true);
  assert.equal(diagnostic.simActive, false);
  console.log('PASS opted-in diagnostic preserves unavailable-water fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
