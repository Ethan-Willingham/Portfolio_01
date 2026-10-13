/* Run: node tools/test-marly-model.cjs */
'use strict';
const assert = require('node:assert/strict');
require('../js/wss-marly-model.js');
const { create } = globalThis.WSSMarlyModel;

function run(model, seconds, dt = 1 / 60) {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) model.step(dt);
  return model.stats();
}

function conserved(s) {
  assert.ok(Math.abs(s.massResidualLiters) < 1e-8, `water residual ${s.massResidualLiters} L`);
  assert.ok(Math.abs(s.energyResidualJ) < 0.002, `shaft energy residual ${s.energyResidualJ} J`);
  assert.ok(s.tankLiters >= 0 && s.tankLiters <= s.tankCapacityLiters);
  assert.ok(Math.abs(s.deliveredLiters - s.tankLiters - s.overflowLiters) < 1e-8);
  assert.ok(s.hydraulicWorkJ <= s.riverWorkJ + 0.002, 'the pump cannot supply its own work');
  assert.ok(s.omega >= 0 && s.pistonFraction >= 0 && s.pistonFraction <= 1);
  assert.ok(!(s.inletOpen && s.outletOpen), 'the two check valves never open together');
  for (const [key, value] of Object.entries(s)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} is finite`);
  }
}

const closed = create({ gate: 0 });
const zero = run(closed, 60);
assert.equal(zero.wheelAngle, 0);
assert.equal(zero.deliveredLiters, 0);
assert.equal(zero.sourceLiters, 0);
assert.equal(zero.riverWorkJ, 0);
assert.equal(zero.hydraulicWorkJ, 0);
conserved(zero);

const brakedFromRest = create({ gate: 1, brake: true });
const held = run(brakedFromRest, 20);
assert.equal(held.wheelAngle, 0);
assert.equal(held.deliveredLiters, 0);
assert.equal(held.riverWorkJ, 0);
assert.ok(held.riverDistanceMeters > 0, 'the river can flow past a held wheel');
conserved(held);

const normal = create();
const start = run(normal, 8);
assert.ok(start.deliveredLiters > 8, 'visible discharge starts promptly');
assert.ok(start.rpm > 5 && start.rpm < 30);
const filled = run(normal, 52);
assert.equal(filled.tankLiters, filled.tankCapacityLiters);
assert.ok(filled.overflowLiters > 0);
assert.ok(filled.hydraulicWorkJ > 0);
assert.ok(filled.dissipatedWorkJ > 0);
conserved(filled);

// Delivery comes only from crank displacement, with exactly one swept volume
// per complete rotation. Expansion draws exactly the matching river volume.
const strokes = create();
for (let i = 0; i < 240 * 30; i++) {
  const before = strokes.stats();
  const after = strokes.step(1 / 240);
  const completeTurns = Math.floor(after.wheelAngle / (2 * Math.PI));
  const cycleAngle = after.wheelAngle % (2 * Math.PI);
  const partialStroke = cycleAngle > Math.PI ? 1 - after.pistonFraction : 0;
  const expected = after.sweptLiters * (completeTurns + partialStroke);
  assert.ok(Math.abs(after.deliveredLiters - expected) < 1e-8);
  if (after.wheelAngle === before.wheelAngle) {
    assert.equal(after.deliveredLiters, before.deliveredLiters);
    assert.equal(after.sourceLiters, before.sourceLiters);
  }
  conserved(after);
}

// Closing the river at several crank phases removes drive. Flywheel energy can
// finish some pumping, then the check valves retain all water in the upper tank.
for (const seconds of [1, 4, 6, 15, 30]) {
  const machine = create();
  const flowing = run(machine, seconds);
  machine.setGate(0);
  const settled = run(machine, 12);
  assert.equal(settled.omega, 0);
  assert.ok(settled.deliveredLiters >= flowing.deliveredLiters);
  const retained = run(machine, 5);
  assert.equal(retained.wheelAngle, settled.wheelAngle);
  assert.equal(retained.deliveredLiters, settled.deliveredLiters);
  assert.equal(retained.tankLiters, settled.tankLiters);
  conserved(retained);
  machine.setGate(0.7);
  const restarted = run(machine, 8);
  assert.ok(restarted.deliveredLiters > retained.deliveredLiters);
  conserved(restarted);
}

for (const seconds of [1, 4, 15, 30]) {
  const machine = create();
  run(machine, seconds);
  machine.setBrake(true);
  const stopped = run(machine, 1);
  assert.equal(stopped.omega, 0);
  const stillStopped = run(machine, 5);
  assert.equal(stillStopped.wheelAngle, stopped.wheelAngle);
  assert.equal(stillStopped.deliveredLiters, stopped.deliveredLiters);
  conserved(stillStopped);
  machine.setBrake(false);
  assert.ok(run(machine, 8).deliveredLiters > stillStopped.deliveredLiters);
}

const lowGate = run(create({ gate: 0.25 }), 8);
const highGate = run(create({ gate: 1 }), 8);
assert.ok(highGate.deliveredLiters > lowGate.deliveredLiters + 5);
assert.ok(highGate.wheelAngle > lowGate.wheelAngle);
const highLift = run(create({ delivery: 2 }), 60);
assert.ok(highLift.deliveredLiters < filled.deliveredLiters * 0.85, 'lifting higher increases mechanical load');
assert.ok(highLift.hydraulicWorkJ / highLift.deliveredLiters > filled.hydraulicWorkJ / filled.deliveredLiters * 1.8);
conserved(highLift);

// The identical fixed integration sequence runs independently of render cadence.
const reference = run(create(), 60);
for (const hz of [30, 120, 144]) {
  const comparison = run(create(), 60, 1 / hz);
  assert.deepEqual(comparison, reference, `identical state at ${hz} Hz`);
}
const irregular = create();
const pattern = [1 / 144, 1 / 73, 1 / 24, 1 / 97];
let elapsed = 0, index = 0;
while (elapsed < 60 - 1e-12) {
  const dt = Math.min(60 - elapsed, pattern[index++ % pattern.length]);
  irregular.step(dt);
  elapsed += dt;
}
assert.deepEqual(irregular.stats(), reference, 'irregular frame cadence does not alter the mechanism');
assert.deepEqual(create().step(60), reference, 'one long step runs the same fixed integration');

const controls = create();
controls.setGate(-10);
assert.equal(controls.stats().gate, 0);
controls.setGate(10);
assert.equal(controls.stats().gate, 1);
controls.setDelivery(10);
assert.equal(controls.stats().delivery, 2);
assert.throws(() => controls.step(-1), RangeError);
assert.throws(() => controls.step(Infinity), RangeError);
assert.throws(() => create({ params: { wheelInertiaKgM2: 0 } }), RangeError);
console.log('PASS: Marly displacement, water and energy conservation, valve retention, coast, brake, restart, gate/head controls and frame cadence.');
