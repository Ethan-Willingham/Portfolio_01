// Run: node tools/test-sluice-paydirt.cjs
// Exercise the production economy, save migration and one-time pan ownership.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var ores = read('010-constants.js').match(/var ORES = \{[\s\S]*?\n  \};/);
assert(ores, 'Read actual ore values from the game');
var notices = [], saves = [], ledger = [];
var c = {
  Math: Math, Number: Number, JSON: JSON, SKY_ROWS: 4,
  upgrades: { cargoLevel: 1 }, money: 0,
  showMsg: function(message) { notices.push(message); },
  saveNow: function(reason) { saves.push(reason); return true; },
  ledgerRecordOre: function(ore) { ledger.push(ore); }
};
vm.createContext(c);
vm.runInContext(ores[0] + read('171-pay-dirt.js'), c);
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function ready() {
  var i = 0;
  while (c.paydirt.pending && c.paydirt.pending.status === 'washing' && i++ < 1000) c.paydirtAdvance(0.05);
  assert.equal(c.paydirt.pending.status, 'ready');
}
function resultCounts(pan) {
  var result = {};
  pan.results.forEach(function(row) { result[row.id] = row.count; });
  return result;
}
function addCounts(a, b) {
  Object.keys(b).forEach(function(key) { a[key] = (a[key] || 0) + b[key]; });
  return a;
}

c.paydirtReset();
assert.equal(c.PAYDIRT_TYPES.length, 12);
assert.equal(c.paydirtCapacity(), 600);
c.PAYDIRT_TYPES.forEach(function(type) {
  assert.equal(c.paydirtForTile(type.kind, c.SKY_ROWS + type.minDepth, 12).id, type.id);
  assert.equal(c.paydirtForTile(type.kind, c.SKY_ROWS + type.maxDepth - 1, 12).id, type.id);
  assert.equal(type.loot.filter(function(row) { return row.rarity === 'rare'; }).length, 1);
  assert.equal(type.loot.filter(function(row) { return row.rarity === 'exceptional'; }).length, 1);
  assert(type.loot.reduce(function(sum, row) { return sum + row.weight; }, 0) <= 10000);
});
assert.equal(c.paydirtCollect('gold', 20, 12), 0, 'Ore uses the existing cargo path');
assert.equal(c.paydirtCollect('foundation', 4, 12), 0);
for (var i = 0; i < 600; i++) assert.equal(c.paydirtCollect('dirt', 4, 12), 1);
assert.equal(c.paydirtUsed(), 600);
for (i = 0; i < 10; i++) assert.equal(c.paydirtCollect('stone', 4, 12), 0);
assert.equal(c.paydirtUsed(), 600, 'A full bin cannot overcollect');
assert.equal(notices.filter(function(message) { return /Earth bin full/.test(message); }).length, 1, 'Full notice does not spam every discarded tile');
c.upgrades.cargoLevel = 2;
assert.equal(c.paydirtCapacity(), 800);
assert.equal(c.paydirtCollect('stone', 4, 12), 1, 'Cargo upgrades extend only the separate bulk capacity');
assert.equal(c.paydirtDeposit(), 601);
assert.equal(c.paydirtUsed(), 0);
assert.equal(c.paydirtStored(), 601);
assert.equal(c.paydirtDeposit(), 0, 'Repeated docking never duplicates stock');
assert.equal(c.paydirtStart('unknown'), null);
assert.equal(c.paydirtStart('topsoil', -1), null);
assert.equal(c.paydirtStart('topsoil', NaN), null);
assert.equal(c.paydirtStart('topsoil', Infinity), null);

c.paydirt.seed = 987654;
var before = c.paydirtSave();
var whole = plain(c.paydirtStart('topsoil'));
assert.equal(whole.count, 600, 'A full stored material stack washes in one action');
assert.equal(whole.duration, 18);
assert.equal(c.paydirt.stored.topsoil, 0);
assert.equal(c.paydirtStart('river-gravel'), null, 'The occupied pan prevents a second batch');
assert.equal(c.paydirtClaim(), null, 'Unfinished material has no payout');
var moneyBefore = c.money;
assert.equal(c.paydirtAdvance(Infinity), false);
assert.equal(c.paydirtAdvance(-1), false);
c.paydirtAdvance(0.05);
var mid = c.paydirtSave();
c.paydirtRestore(mid);
assert.equal(c.paydirt.pending.elapsed, 0.05);
assert.deepEqual(resultCounts(c.paydirt.pending), resultCounts(whole), 'Reload cannot reroll a reserved batch');
assert.equal(c.paydirt.pending.value, whole.value);
ready();
var claimed = c.paydirtClaim();
assert.equal(c.money - moneyBefore, whole.value);
assert.deepEqual(resultCounts(claimed), resultCounts(whole));
assert.equal(c.paydirtClaim(), null, 'Repeated input cannot claim the same pan twice');
assert.equal(c.paydirt.washed.topsoil, 600);

c.paydirtRestore(before);
var first = plain(c.paydirtStart('topsoil', 217));
ready(); c.paydirtClaim();
var second = plain(c.paydirtStart('topsoil'));
assert.deepEqual(addCounts(resultCounts(first), resultCounts(second)), resultCounts(whole), 'Splitting batches cannot fish for a different sequence');
assert.equal(first.value + second.value, whole.value);

var stationBefore = c.paydirtStored();
c.paydirtCollect('dirt', 4, 12);
c.paydirtLoseHeld();
assert.equal(c.paydirtUsed(), 0);
assert.equal(c.paydirtStored(), stationBefore, 'Death preserves station stock');
assert(c.paydirt.pending, 'Death preserves a running or finished pan');
ready();
c.paydirtClaim();

// A repeatable large sample demonstrates rare retention and the table budget.
c.paydirtReset(); c.paydirt.seed = 1729;
c.paydirt.stored['crystal-grit'] = 20000;
var jackpot = c.paydirtStart('crystal-grit');
assert(jackpot.results.some(function(row) { return row.rarity === 'rare'; }));
assert(jackpot.results.some(function(row) { return row.rarity === 'exceptional'; }));
var value = jackpot.results.reduce(function(sum, row) { return sum + row.value * row.count; }, 0);
assert.equal(value, jackpot.value);
ready(); c.paydirtClaim();
assert(c.paydirt.finds['crystal-grit-rare'].count > 0);
assert(c.paydirt.finds['crystal-grit-exceptional'].count > 0);
var saved = c.paydirtSave();
c.paydirtRestore(saved);
assert.deepEqual(plain(c.paydirt.finds), saved.finds, 'Permanent specimens survive reload');
c.paydirtLoseHeld();
assert.deepEqual(plain(c.paydirt.finds), saved.finds, 'Permanent specimens survive recovery');

c.paydirtRestore({ held: { topsoil: -20, shale: NaN }, stored: { topsoil: Infinity, shale: 3.7 } });
assert.equal(c.paydirtUsed(), 0);
assert.equal(c.paydirtStored(), 3);
c.paydirtRestore(null);
assert.equal(c.paydirtUsed() + c.paydirtStored(), 0, 'Old saves gain empty bins without resetting the game');
assert.equal(c.paydirt.pending, null);
assert.deepEqual(plain(c.paydirt.finds), {});

var mining = read('080-update-camera.js'), explosions = read('060-shop-logic.js'), save = read('047-save.js');
assert(mining.includes('paydirtCollect(oreType, drilling.r, drilling.c)'));
assert(explosions.includes('paydirtCollect(oreType, cell.r, cell.c)'));
assert(/if \(playerOnPumpPad\(\)\)\s*\{\s*paydirtDeposit\(\)/.test(mining), 'Rubble-only hauls deposit on the real pump pad');
assert(save.includes('paydirt: paydirtSave()') && save.includes('paydirtRestore(env.paydirt)'));
assert.equal((save.match(/paydirtLoseHeld\(\)/g) || []).length, 2, 'Death and bailout both lose only carried earth');
assert(saves.includes('sluice-start') && saves.includes('sluice-claim') && saves.includes('sluice-deposit'));
console.log('Sluice paydirt checks passed: collection, capacity, all 12 strata, deposits, deterministic batches, persistence, rare finds, death and mining hooks.');
console.log(JSON.stringify(c.PAYDIRT_TYPES.map(function(type) {
  return { material: type.name, dollarsPerScoop: Math.round(type.loot.reduce(function(sum, row) { return sum + row.value * row.chance; }, 0) * 100) / 100 };
}), null, 2));
