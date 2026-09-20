// Boot preference migration, including blocked storage and later opt-outs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const flags = fs.readFileSync(path.join(root, 'js/sluice/010-constants.js'), 'utf8').split('  var TILE =')[0];
const options = fs.readFileSync(path.join(root, 'js/sluice/052-options.js'), 'utf8');
const key = 'sluice.opt.banya', marker = 'sluice.opt.banya-default';
function boot(values = {}, query = '', blocked = '') {
  const state = {
    window: { location: { search: query } }, isMobile: false,
    localStorage: {
      getItem(k) { if (blocked === 'read') throw Error('blocked'); return values[k] ?? null; },
      setItem(k, v) { if (blocked === 'write') throw Error('quota'); values[k] = v; }
    }
  };
  vm.createContext(state); vm.runInContext(flags, state); vm.runInContext(options, state);
  return state;
}
const fresh = {};
assert.equal(boot(fresh).ENABLE_BATH, true);
assert.equal(fresh[key], '1');
assert.equal(fresh[marker], 'open-v1');
const legacy = { [key]: '0', 'sluice.save': 'existing world', 'sluice.opt.gfx': 'balanced' };
assert.equal(boot(legacy).ENABLE_BATH, true);
assert.equal(legacy['sluice.save'], 'existing world');
assert.equal(legacy['sluice.opt.gfx'], 'balanced');
assert.equal(boot(legacy).ENABLE_BATH, true);
const opted = boot(legacy);
opted.window.SluiceOptions.set('banya', '0');
assert.equal(opted.ENABLE_BATH, false);
assert.equal(boot(legacy).ENABLE_BATH, false, 'later explicit off survives reload');
assert.equal(boot(legacy, '?bath=1').ENABLE_BATH, true);
assert.equal(legacy[key], '0', 'URL on is temporary');
assert.equal(boot(legacy, '?bath=10').ENABLE_BATH, false, 'URL must match exactly');
opted.window.SluiceOptions.set('banya', '1');
assert.equal(boot(legacy, '?bath=0').ENABLE_BATH, false);
assert.equal(legacy[key], '1', 'URL off is temporary');
assert.equal(boot(legacy).ENABLE_BATH, true);
assert.equal(boot({ [key]: '0' }, '', 'read').ENABLE_BATH, true);
assert.equal(boot({ [key]: '0' }, '', 'write').ENABLE_BATH, true);
assert.equal(boot({}, '?bath=0', 'read').ENABLE_BATH, false);
console.log('PASS fresh defaults, legacy migration, save preservation, later choices, URL overrides, blocked storage');
