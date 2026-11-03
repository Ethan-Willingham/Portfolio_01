'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const model = require('../js/one-shift-inbound-model.js');
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
function good(result) { assert.equal(result.ok, true, result.message); }
function bad(result) { assert.equal(result.ok, false, result.message); }
function conservation(state) {
  assert.equal(state.scenario.ordered, state.received + state.damaged + state.remaining);
  assert.equal(state.inventory.reduce((sum, row) => sum + row.quantity, 0), state.received + state.damaged);
  assert.equal(state.journal.filter(row => row.lines).reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + line.quantity + line.damaged, 0), 0), state.received + state.damaged);
}
check('browser and Node expose the same standalone API', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/one-shift-inbound-model.js'),'utf8'), context);
  assert.equal(context.window.InboundPracticeModel.catalog.length, 8);
  assert.equal(context.window.InboundPracticeModel.create('basic').received, 0);
});
check('fixtures and receipt data are isolated between sessions', () => {
  for (const scenario of model.catalog) {
    assert.equal(scenario.bin, 'REC-02');
    assert.equal(model.create(scenario.id).location, scenario.channel === 'web' ? '' : 'REC-02');
  }
  const first = model.create('asn'), second = model.create('asn');
  first.scenario.manifest[0].quantity = 99;
  assert.equal(second.scenario.manifest[0].quantity, 3);
  assert.equal(model.catalog.find(row => row.id === 'asn').manifest[0].quantity, 3);
});
check('basic receipts are exact and do not silently close the order', () => {
  const state = model.create('basic');
  good(model.receive(state, {quantity:2}));
  assert.equal(state.remaining, 2);
  good(model.receive(state, {quantity:'2'}));
  assert.equal(state.finished, false);
  assert.equal(state.status, 'Receiving');
  assert.equal(state.inventory[0].location, 'REC-02');
  bad(model.receive(state, {quantity:1}));
  conservation(state);
});
check('invalid quantities leave all state unchanged', () => {
  for (const quantity of ['', ' ', null, undefined, false, -1, 1.5, NaN, Infinity, 'two', {}, 0, Number.MAX_SAFE_INTEGER + 1]) {
    const state = model.create('basic'), before = JSON.stringify(state);
    bad(model.receive(state, {quantity}));
    assert.equal(JSON.stringify(state), before);
  }
});
check('blank and invalid damaged counts are rejected without posting', () => {
  for (const damaged of ['', null, -1, 0.5, NaN]) {
    const state = model.create('web');
    good(model.setLocation(state, 'REC-01'));
    bad(model.receive(state, {quantity:1, damaged}));
    assert.equal(state.receipts.length, 0);
  }
});
check('partial deliveries cannot create units that have not arrived', () => {
  const state = model.create('partial');
  bad(model.receive(state, {quantity:6}));
  good(model.receive(state, {quantity:3}));
  assert.equal(state.received, 3);
  assert.equal(state.remaining, 3);
  bad(model.receive(state, {quantity:1}));
  good(model.complete(state));
  assert.equal(state.remaining, 3);
  assert.equal(state.received, 3);
  conservation(state);
});
check('lot receipts require values and preserve separate batches', () => {
  const state = model.create('lot');
  bad(model.receive(state, {quantity:2, core:' '}));
  good(model.receive(state, {quantity:2, core:'LOT-204'}));
  good(model.receive(state, {quantity:2, core:'LOT-205'}));
  assert.deepEqual(state.inventory.map(row => row.core), ['LOT-204','LOT-205']);
  conservation(state);
});
check('date receipts reject impossible dates and retain valid tracking values', () => {
  const state = model.create('date');
  for (const core of ['', '2027-02-29', '2027-04-31', '2027-13-01', 'June 30', '2027-6-3']) bad(model.receive(state, {quantity:1, core}));
  good(model.receive(state, {quantity:1, core:'2028-02-29'}));
  good(model.receive(state, {quantity:2, core:'2027-06-30'}));
  assert.equal(state.inventory.length, 2);
  conservation(state);
});
check('serial scans receive exactly one known unit and reject repeats', () => {
  const state = model.create('serial');
  bad(model.receive(state, {quantity:2, core:'SN-1001'}));
  bad(model.receive(state, {core:'SN-9999'}));
  good(model.receive(state, {core:'sn-1001'}));
  bad(model.receive(state, {core:'SN-1001'}));
  assert.equal(state.received, 1);
  good(model.receive(state, {core:'SN-1002'}));
  assert.equal(state.inventory.length, 2);
  conservation(state);
});
check('ASN selection is read-only and receipt commits all lines once', () => {
  const state = model.create('asn');
  bad(model.receive(state));
  bad(model.selectContainer(state, 'UNKNOWN'));
  good(model.selectContainer(state, 'ASN-1001'));
  assert.equal(state.received, 0);
  good(model.setLocation(state, 'REC-02'));
  good(model.receive(state));
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].lines.length, 2);
  assert.equal(state.received, 5);
  assert.equal(state.inventory[1].core, 'LOT-204');
  assert.ok(state.inventory.every(row => row.location === 'REC-02'));
  bad(model.selectContainer(state, 'ASN-1001'));
  bad(model.receive(state));
  conservation(state);
});
check('web requires a manually selected receiving location', () => {
  const state = model.create('web');
  assert.equal(state.location, '');
  bad(model.receive(state, {quantity:1}));
  bad(model.setLocation(state, 'A01-01'));
  bad(model.setLocation(state, 'DAMAGE'));
  good(model.setLocation(state, 'rec-02'));
  good(model.receive(state, {quantity:1}));
  assert.equal(state.inventory[0].location, 'REC-02');
});
check('good and damaged quantities reconcile without adding damaged stock to receiving', () => {
  const state = model.create('web');
  good(model.setLocation(state, 'REC-01'));
  bad(model.receive(state, {quantity:4, damaged:1}));
  good(model.receive(state, {quantity:3, damaged:1}));
  assert.equal(state.remaining, 0);
  assert.equal(state.inventory.find(row => row.location === 'REC-01').quantity, 3);
  assert.equal(state.inventory.find(row => row.location === 'DAMAGE').quantity, 1);
  conservation(state);
});
check('damage-only receipt is valid and cannot exceed the remaining order', () => {
  const state = model.create('web');
  bad(model.receive(state, {quantity:0, damaged:4, location:'REC-01'}));
  good(model.receive(state, {quantity:0, damaged:1, location:'REC-01'}));
  assert.equal(state.received, 0);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].location, 'DAMAGE');
  assert.equal(state.remaining, 3);
  bad(model.receive(state, {quantity:0, damaged:1}));
  good(model.receive(state, {quantity:3, damaged:0}));
  conservation(state);
});
check('web cannot turn the damaged unit into good stock, even across receipts', () => {
  const state = model.create('web');
  good(model.setLocation(state, 'REC-01'));
  const before = JSON.stringify(state);
  bad(model.receive(state, {quantity:4, damaged:0}));
  assert.equal(JSON.stringify(state), before);
  good(model.receive(state, {quantity:2, damaged:0}));
  bad(model.receive(state, {quantity:2, damaged:0}));
  bad(model.receive(state, {quantity:0, damaged:2}));
  good(model.receive(state, {quantity:1, damaged:1}));
  assert.equal(state.received, 3);
  assert.equal(state.damaged, 1);
  assert.equal(state.remaining, 0);
  conservation(state);
});
check('changing receiving location preserves previous receipt locations', () => {
  const state = model.create('web');
  good(model.receive(state, {quantity:2, location:'REC-01'}));
  good(model.receive(state, {quantity:1, damaged:1, location:'REC-02'}));
  assert.deepEqual(state.inventory.map(row => [row.location,row.quantity]), [['REC-01',2],['REC-02',1],['DAMAGE',1]]);
  conservation(state);
});
check('retrying an identified receipt cannot duplicate inventory', () => {
  const state = model.create('basic');
  good(model.receive(state, {quantity:1, requestId:'click-1'}));
  bad(model.receive(state, {quantity:1, requestId:'click-1'}));
  assert.equal(state.received, 1);
  conservation(state);
});
check('Undo reverses inventory and journal amounts and permits corrected entry', () => {
  const state = model.create('web');
  bad(model.undoLast(state));
  good(model.receive(state, {quantity:3, damaged:1, location:'REC-01'}));
  good(model.undoLast(state));
  assert.equal(state.received, 0);
  assert.equal(state.damaged, 0);
  assert.equal(state.remaining, 4);
  assert.equal(state.inventory.length, 0);
  good(model.receive(state, {quantity:2, damaged:1}));
  conservation(state);
});
check('Undo also reverses an entire ASN atomically', () => {
  const state = model.create('asn');
  good(model.selectContainer(state, 'ASN-1001'));
  good(model.receive(state));
  good(model.undoLast(state));
  assert.equal(state.containerReceived, false);
  assert.equal(state.selectedContainer, false);
  assert.equal(state.remaining, 5);
  bad(model.receive(state));
  good(model.selectContainer(state, 'ASN-1001'));
  good(model.receive(state));
  conservation(state);
});
check('closing uses the correct integration status and locks later changes', () => {
  for (const integrated of [false,true]) {
    const state = model.create('close', {integrated});
    assert.equal(state.received, state.scenario.ordered);
    assert.equal(state.finished, false);
    good(model.complete(state));
    assert.equal(state.status, integrated ? 'Unassigned' : 'Receiving Complete');
    const before = JSON.stringify(state);
    bad(model.complete(state));
    bad(model.receive(state, {quantity:1}));
    bad(model.undoLast(state));
    bad(model.setLocation(state, 'REC-02'));
    assert.equal(JSON.stringify(state), before);
    conservation(state);
  }
});
check('zero-receipt completion changes no stock', () => {
  const state = model.create('basic');
  good(model.complete(state));
  assert.equal(state.received, 0);
  assert.equal(state.remaining, 4);
  assert.equal(state.inventory.length, 0);
  conservation(state);
});
console.log(checks + ' inbound model checks passed.');
