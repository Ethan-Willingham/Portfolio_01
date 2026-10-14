'use strict';
const assert = require('node:assert/strict');
const { create, constants: C } = require('../js/wss-water-rocket-model.js');

function close(actual, expected, tolerance, description) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${description}: ${actual} vs ${expected}`);
}
function charged(options) {
  const model = create(options);
  assert.equal(model.launch(), false, 'the empty charging sequence cannot launch');
  assert.equal(model.charge(), true);
  for (let i = 0; i < 1000 && model.state.phase === 'charging'; i++) model.step(0.02);
  assert.equal(model.state.phase, 'armed');
  close(model.state.pressurePa, model.state.targetPressurePa, 1e-8, 'compressor reaches target');
  close(model.state.waterMass, model.state.initialWaterMass, 1e-12, 'charging does not expel water');
  close(model.state.airMass, model.state.initialAirMass + model.state.injectedAirMass, 1e-12, 'charging air budget');
  return model;
}
function flight(options) {
  const model = charged(options);
  assert.equal(model.launch(), true);
  close(model.state.velocity, 0, 0, 'release adds no velocity');
  let eventMass = 0;
  let eventMomentum = 0;
  let lastEvent = 0;
  let airPhase = false;
  let lastPressure = model.state.pressurePa;
  const seen = new Set();
  for (let i = 0; i < 3000 && model.state.phase !== 'landed'; i++) {
    model.step(0.01);
    const s = model.state;
    seen.add(s.phase);
    airPhase ||= s.exhaustPhase === 'air';
    assert.ok(s.pressurePa <= lastPressure + 1e-7, 'released pressure cannot rise');
    lastPressure = s.pressurePa;
    close(s.waterMass + s.waterExpelledMass, s.initialWaterMass, 2e-11, 'water budget at every frame');
    close(s.airMass + s.airExpelledMass, s.initialAirMass + s.injectedAirMass, 2e-11, 'air budget at every frame');
    for (const key of ['altitude', 'velocity', 'mass', 'pressurePa', 'waterVolume', 'temperature', 'thrust']) {
      assert.ok(Number.isFinite(s[key]), `${key} stays finite`);
    }
    assert.ok(s.altitude >= 0 && s.altitude < 300, 'flight stays above ground and within plausible bounds');
    assert.ok(s.waterVolume >= 0 && s.waterVolume <= C.bottleVolume);
    assert.ok(s.mass >= C.dryMass);
    for (const event of s.exhaustEvents) {
      assert.ok(event.id > lastEvent, 'exhaust events have unique sequence ids');
      lastEvent = event.id;
      assert.ok(event.mass > 0 && event.exhaustVelocity > 0);
      eventMass += event.mass;
      eventMomentum += event.mass * event.exhaustVelocity;
    }
  }
  assert.equal(model.state.phase, 'landed', 'all supported launches return to ground');
  close(model.state.altitude, 0, 0, 'landing plane');
  close(model.state.velocity, 0, 0, 'ground stops the bottle');
  if (model.state.peakAltitude > 0.1) assert.ok(Math.abs(model.state.attitude) > 1.5, 'the bottle tips onto its side after contact');
  assert.ok(model.state.impactSpeed >= 0, 'ground contact records the impact speed');
  close(eventMass, model.state.waterExpelledMass, 2e-11, 'render events account for every expelled water parcel');
  assert.ok(eventMomentum <= model.state.totalImpulse + 1e-10, 'water momentum fits total thrust impulse');
  return { model, airPhase, seen };
}

const defaultFlight = flight();
const defaultPeak = defaultFlight.model.state.peakAltitude;
assert.ok(defaultFlight.model.state.peakAltitude > 15, 'default setup produces a substantial flight');
assert.ok(defaultFlight.airPhase, 'air-only thrust follows the water exhaust');
assert.ok(defaultFlight.seen.has('coasting') && defaultFlight.seen.has('descending'), 'ballistic ascent and descent occur');
close(defaultFlight.model.state.waterVolume, 0, 1e-12, 'default rocket empties its water');
close(defaultFlight.model.state.pressurePa, 0, 0.011, 'air blowdown reaches atmospheric equilibrium');

// Independently verify P V^gamma during the sealed-air water phase.
const expansion = charged();
expansion.launch();
const initialPV = expansion.state.absolutePressurePa * Math.pow(expansion.state.airVolume, C.gamma);
const launchAir = expansion.state.airMass;
for (let i = 0; i < 20; i++) {
  expansion.step(0.005);
  assert.ok(expansion.state.waterVolume > 0);
  close(expansion.state.absolutePressurePa * Math.pow(expansion.state.airVolume, C.gamma), initialPV, 1e-10, 'adiabatic expansion');
  close(expansion.state.airMass, launchAir, 0, 'air is trapped behind water');
}

// Fixed substeps give identical trajectories despite a different frame partition.
const partitionA = charged();
const partitionB = charged();
partitionA.launch();
partitionB.launch();
for (let i = 0; i < 180; i++) partitionA.step(1 / 60);
for (let i = 0; i < 75; i++) { partitionB.step(0.003); partitionB.step(0.037); }
for (const key of ['altitude', 'velocity', 'pressurePa', 'waterVolume', 'waterExpelledMass', 'totalImpulse', 'flightTime']) {
  close(partitionA.state[key], partitionB.state[key], 1e-10, `frame partition: ${key}`);
}

// Pausing is the absence of step(), and a zero-duration step cannot advance it.
const paused = partitionA.snapshot();
partitionA.step(0);
for (const key of ['altitude', 'velocity', 'pressurePa', 'waterVolume', 'elapsed', 'flightTime']) {
  close(partitionA.state[key], paused[key], 0, `pause: ${key}`);
}
paused.flightSamples[0].altitude = 999;
assert.notEqual(partitionA.state.flightSamples[0].altitude, 999, 'snapshot arrays do not mutate the live model');

const low = flight({ targetPressurePsi: 20 }).model.state;
const high = flight({ targetPressurePsi: 90 }).model.state;
assert.ok(high.peakAltitude > low.peakAltitude + 20, 'more pressure increases flight height');
const overfilled = flight({ fillFraction: 0.75, targetPressurePsi: 20 }).model.state;
assert.ok(overfilled.waterVolume > 0, 'weak pressure with little trapped air leaves water onboard');
assert.ok(overfilled.peakAltitude < low.peakAltitude, 'overfilling changes the resulting flight');
for (const fillFraction of [0.15, 0.75]) {
  for (const targetPressurePsi of [20, 90]) flight({ fillFraction, targetPressurePsi });
}
const zero = flight({ targetPressurePsi: 0 }).model.state;
close(zero.peakAltitude, 0, 0, 'no pressure means no lift');
close(zero.totalImpulse, 0, 0, 'no pressure means no thrust impulse');
close(zero.maxSpeed, 0, 0, 'the stand prevents downward motion before liftoff');
close(zero.waterExpelledMass, 0, 0, 'no prescribed jet when unpressurized');

const reuse = defaultFlight.model;
const stableState = reuse.state;
reuse.reset({ fillFraction: 0.5, targetPressurePsi: 40 });
assert.equal(reuse.state, stableState, 'reset keeps the public state object stable');
assert.equal(reuse.state.phase, 'ready');
assert.equal(reuse.state.flightSamples.length, 0);
close(reuse.state.waterVolume, 0.001, 0, 'reset applies new fill');
reuse.reset();
close(reuse.state.targetPressurePsi, 40, 0, 'reset preserves chosen settings');
const handPump = create({targetPressurePsi:90});
handPump.charge();
handPump.pumpStroke();
handPump.stopCharge();
assert.equal(handPump.state.phase,'armed','one pump stroke leaves a releasable bottle');
assert.ok(handPump.state.pressurePa>0,'one physical pump stroke adds air');
const heldPressure=handPump.state.pressurePa;
handPump.step(1);
close(handPump.state.pressurePa,heldPressure,1e-8,'letting go stops pumping');
assert.throws(() => reuse.step(NaN), RangeError);
assert.throws(() => reuse.step(-1), RangeError);

console.log(`Water rocket model passed: peaks ${low.peakAltitude.toFixed(1)} m at 20 psi, ${defaultPeak.toFixed(1)} m at 60 psi, ${high.peakAltitude.toFixed(1)} m at 90 psi. Mass budgets, expansion, settings, frame partition and landing checked.`);
