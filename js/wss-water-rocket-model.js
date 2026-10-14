/* A vertical, reduced-order model of a three-dimensional water bottle rocket.
 * SI units throughout. The renderer owns spray breakup and camera motion.
 * Water: Bernoulli outflow, P V^gamma gas expansion, variable carried mass.
 * Air: isentropic converging-nozzle blowdown, including choked pressure thrust.
 * Flight: Newton's law, gravity and signed quadratic drag. No launch impulse.
 * Assumptions: rigid 2 L bottle, dry ideal gas, isothermal charging, fixed upright
 * attitude, constant ambient air, no slosh, launch-tube impulse or wind.
 * Sources:
 * https://people.ohio.edu/urieli/thermo/property_tables/gas/adiabatic/rocket/rocket.html
 * https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-equations-summary/
 */
(function (root) {
  'use strict';

  var C = Object.freeze({
    bottleVolume: 0.002,
    dryMass: 0.145,
    nozzleDiameter: 0.009,
    nozzleArea: Math.PI * 0.009 * 0.009 / 4,
    bodyDiameter: 0.105,
    referenceArea: Math.PI * 0.105 * 0.105 / 4,
    dischargeCoefficient: 0.86,
    dragCoefficient: 0.42,
    waterDensity: 998,
    airDensity: 1.204,
    atmosphericPressure: 101325,
    ambientTemperature: 293.15,
    airGasConstant: 287.05,
    gamma: 1.4,
    gravity: 9.80665,
    pascalsPerPsi: 6894.757293168,
    compressorMassFlow: 0.0014,
    pumpStrokeMass: 0.00025,
    fixedStep: 0.001
  });
  var criticalRatio = Math.pow(2 / (C.gamma + 1), C.gamma / (C.gamma - 1));
  var effectiveNozzleArea = C.dischargeCoefficient * C.nozzleArea;

  function finiteOption(value, fallback, low, high) {
    return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
  }

  function create(options) {
    var state = {};
    var settings = { fillFraction: 0.35, targetPressurePsi: 60 };
    var accumulator, released, airborne, gasInvariant, launchGasVolume;
    var airStartMass, airStartPressure, airStartTemperature, airMinimumMass;
    var nextSample, eventId;

    function refreshMass() {
      state.waterMass = state.waterVolume * C.waterDensity;
      state.airVolume = C.bottleVolume - state.waterVolume;
      state.mass = C.dryMass + state.waterMass + state.airMass;
      state.weight = state.mass * C.gravity;
      state.pressurePa = Math.max(0, state.absolutePressurePa - C.atmosphericPressure);
    }

    function reset(nextOptions) {
      nextOptions = nextOptions || {};
      settings.fillFraction = finiteOption(nextOptions.fillFraction, settings.fillFraction, 0.15, 0.75);
      // Zero pressure is supported for the unpressurized comparison and tests.
      settings.targetPressurePsi = finiteOption(nextOptions.targetPressurePsi, settings.targetPressurePsi, 0, 90);
      var waterVolume = C.bottleVolume * settings.fillFraction;
      var airMass = C.atmosphericPressure * (C.bottleVolume - waterVolume) /
        (C.airGasConstant * C.ambientTemperature);
      Object.assign(state, {
        phase: 'ready',
        elapsed: 0,
        flightTime: 0,
        altitude: 0,
        velocity: 0,
        acceleration: 0,
        peakAltitude: 0,
        maxSpeed: 0,
        thrust: 0,
        peakThrust: 0,
        totalImpulse: 0,
        drag: 0,
        bottleVolume: C.bottleVolume,
        fillFraction: settings.fillFraction,
        targetPressurePsi: settings.targetPressurePsi,
        targetPressurePa: settings.targetPressurePsi * C.pascalsPerPsi,
        absolutePressurePa: C.atmosphericPressure,
        pressurePa: 0,
        launchPressurePa: 0,
        temperature: C.ambientTemperature,
        waterVolume: waterVolume,
        initialWaterMass: waterVolume * C.waterDensity,
        airMass: airMass,
        initialAirMass: airMass,
        injectedAirMass: 0,
        waterExpelledMass: 0,
        airExpelledMass: 0,
        waterExpelledVolume: 0,
        waterMassFlow: 0,
        airMassFlow: 0,
        exhaustVelocity: 0,
        exhaustPhase: 'none',
        exhaustEvents: [],
        flightSamples: []
        ,impactSpeed: 0,
        attitude: 0.035,
        angularVelocity: 0,
        contactTime: 0,
        reboundHeight: 0,
        reboundVelocity: 0
      });
      accumulator = 0;
      released = false;
      airborne = false;
      gasInvariant = 0;
      airStartMass = 0;
      nextSample = 0;
      eventId = 0;
      refreshMass();
      return state;
    }

    function charge() {
      if (state.phase !== 'ready' && state.phase !== 'armed') return false;
      if (state.pressurePa >= state.targetPressurePa - 1) {
        if (state.phase === 'ready') {state.phase = 'armed'; return true;}
        return false;
      }
      state.phase = 'charging';
      return true;
    }

    function pumpStroke() {
      if (state.phase !== 'charging') return false;
      var targetMass = (C.atmosphericPressure + state.targetPressurePa) * state.airVolume /
        (C.airGasConstant * C.ambientTemperature);
      var injected = Math.min(C.pumpStrokeMass, Math.max(0, targetMass - state.airMass));
      state.airMass += injected;
      state.injectedAirMass += injected;
      state.absolutePressurePa = state.airMass * C.airGasConstant * C.ambientTemperature / state.airVolume;
      refreshMass();
      if (state.airMass >= targetMass - 1e-14) state.phase = 'armed';
      return injected > 0;
    }

    function stopCharge() {
      if (state.phase !== 'charging') return false;
      state.phase = state.pressurePa > 1 ? 'armed' : 'ready';
      return true;
    }

    function sampleFlight() {
      var sample = {
        time: state.flightTime,
        altitude: state.altitude,
        velocity: state.velocity,
        pressurePa: state.pressurePa,
        waterVolume: state.waterVolume,
        thrust: state.thrust
      };
      // Normal flights take far fewer than 1500 samples. Bound long-running use.
      if (state.flightSamples.length >= 1500) state.flightSamples.shift();
      state.flightSamples.push(sample);
    }

    function launch() {
      if (state.phase !== 'armed') return false;
      released = true;
      launchGasVolume = C.bottleVolume - state.waterVolume;
      gasInvariant = state.absolutePressurePa * Math.pow(launchGasVolume, C.gamma);
      state.launchPressurePa = state.pressurePa;
      state.phase = 'powered';
      sampleFlight();
      nextSample = 0.04;
      return true;
    }

    function waterPressure(volume) {
      return gasInvariant / Math.pow(C.bottleVolume - volume, C.gamma);
    }

    function dischargeWater(h) {
      // Stop exactly at pressure equilibrium if the initial air cannot empty
      // the bottle. Residual water remains carried, rather than disappearing.
      var equilibriumVolume = Math.pow(gasInvariant / C.atmosphericPressure, 1 / C.gamma);
      var retainedWater = Math.max(0, C.bottleVolume - equilibriumVolume);
      var available = Math.max(0, state.waterVolume - retainedWater);
      var speed0 = Math.sqrt(2 * state.pressurePa / C.waterDensity);
      var midpointVolume = state.waterVolume - Math.min(available / 2, effectiveNozzleArea * speed0 * h / 2);
      var midpointPressure = Math.max(0, waterPressure(midpointVolume) - C.atmosphericPressure);
      var speed = Math.sqrt(2 * midpointPressure / C.waterDensity);
      var volume = Math.min(available, effectiveNozzleArea * speed * h);
      var mass = volume * C.waterDensity;
      state.waterVolume = Math.max(retainedWater, state.waterVolume - volume);
      state.waterExpelledMass += mass;
      state.waterExpelledVolume += volume;
      state.waterMassFlow = mass / h;
      state.exhaustVelocity = speed;
      state.thrust = state.waterMassFlow * speed;
      state.exhaustPhase = mass > 0 ? 'water' : 'none';
      state.absolutePressurePa = Math.max(C.atmosphericPressure, waterPressure(state.waterVolume));
      state.temperature = state.absolutePressurePa * (C.bottleVolume - state.waterVolume) /
        (state.airMass * C.airGasConstant);
      if (mass > 0) {
        state.exhaustEvents.push({
          id: ++eventId,
          kind: 'water',
          time: state.flightTime + h / 2,
          elapsed: state.elapsed + h / 2,
          altitude: state.altitude + state.velocity * h / 2,
          velocity: state.velocity,
          exhaustVelocity: speed,
          mass: mass,
          volume: volume
        });
      }
    }

    function airAt(mass) {
      var ratio = mass / airStartMass;
      return {
        pressure: airStartPressure * Math.pow(ratio, C.gamma),
        temperature: airStartTemperature * Math.pow(ratio, C.gamma - 1)
      };
    }

    function airNozzle(mass) {
      var gas = airAt(mass);
      var pressureRatio = Math.min(1, C.atmosphericPressure / gas.pressure);
      var exitRatio = Math.max(criticalRatio, pressureRatio);
      var exitPressure = gas.pressure * exitRatio;
      var exitTemperature = gas.temperature * Math.pow(exitRatio, (C.gamma - 1) / C.gamma);
      var speed = Math.sqrt(Math.max(0, 2 * C.gamma / (C.gamma - 1) * C.airGasConstant *
        (gas.temperature - exitTemperature)));
      var flow = effectiveNozzleArea * exitPressure / (C.airGasConstant * exitTemperature) * speed;
      return {
        flow: flow,
        speed: speed,
        thrust: flow * speed + effectiveNozzleArea * Math.max(0, exitPressure - C.atmosphericPressure)
      };
    }

    function dischargeAir(h) {
      if (!airStartMass) {
        airStartMass = state.airMass;
        airStartPressure = state.absolutePressurePa;
        airStartTemperature = state.temperature;
        airMinimumMass = airStartMass * Math.pow(C.atmosphericPressure / airStartPressure, 1 / C.gamma);
      }
      var initialFlow = airNozzle(state.airMass).flow;
      var midpointMass = Math.max((state.airMass + airMinimumMass) / 2, state.airMass - initialFlow * h / 2);
      var nozzle = airNozzle(midpointMass);
      var mass = Math.min(Math.max(0, state.airMass - airMinimumMass), nozzle.flow * h);
      state.airMass -= mass;
      state.airExpelledMass += mass;
      state.airMassFlow = mass / h;
      state.thrust = nozzle.flow > 0 ? nozzle.thrust * state.airMassFlow / nozzle.flow : 0;
      state.exhaustVelocity = nozzle.speed;
      state.exhaustPhase = mass > 0 ? 'air' : 'none';
      var gas = airAt(state.airMass);
      state.absolutePressurePa = Math.max(C.atmosphericPressure, gas.pressure);
      state.temperature = gas.temperature;
    }

    function dragAt(velocity) {
      return -0.5 * C.airDensity * C.dragCoefficient * C.referenceArea * velocity * Math.abs(velocity);
    }

    function integrate(h) {
      state.thrust = 0;
      state.waterMassFlow = 0;
      state.airMassFlow = 0;
      state.exhaustVelocity = 0;
      state.exhaustPhase = 'none';
      if (state.phase === 'charging') {
        var targetMass = (C.atmosphericPressure + state.targetPressurePa) * state.airVolume /
          (C.airGasConstant * C.ambientTemperature);
        var injected = Math.min(C.compressorMassFlow * h, Math.max(0, targetMass - state.airMass));
        state.airMass += injected;
        state.injectedAirMass += injected;
        state.absolutePressurePa = state.airMass * C.airGasConstant * C.ambientTemperature / state.airVolume;
        if (state.airMass >= targetMass - 1e-14) {
          state.absolutePressurePa = C.atmosphericPressure + state.targetPressurePa;
          state.phase = 'armed';
        }
        refreshMass();
      } else if (released && state.phase !== 'landed' && state.phase !== 'settling') {
        var previousMass = state.mass;
        if (state.pressurePa > 0.01) {
          if (state.waterVolume > 1e-12) dischargeWater(h);
          else dischargeAir(h);
        }
        refreshMass();
        var midpointMass = (previousMass + state.mass) / 2;
        var a0 = (state.thrust + dragAt(state.velocity)) / midpointMass - C.gravity;
        var midpointVelocity = state.velocity + a0 * h / 2;
        state.drag = dragAt(midpointVelocity);
        state.acceleration = (state.thrust + state.drag) / midpointMass - C.gravity;
        var nextVelocity = state.velocity + state.acceleration * h;
        var nextAltitude = state.altitude + (state.velocity + nextVelocity) * h / 2;
        var desiredAttitude = nextVelocity < -0.8 ? Math.PI : 0;
        var turn = 2.4 * Math.sin(desiredAttitude - state.attitude) *
          Math.min(1, Math.abs(nextVelocity) / 8) - 1.8 * state.angularVelocity;
        state.angularVelocity += turn * h;
        state.attitude += state.angularVelocity * h;
        if (airborne || nextAltitude > 0) state.maxSpeed = Math.max(state.maxSpeed, Math.abs(nextVelocity));
        state.peakThrust = Math.max(state.peakThrust, state.thrust);
        state.totalImpulse += state.thrust * h;
        state.flightTime += h;
        if (nextAltitude > 0) airborne = true;
        if (nextAltitude <= 0 && nextVelocity <= 0) {
          // The stand supplies a normal force until liftoff. The ground stops
          // the bottle on return; contact does not add rebound energy.
          state.altitude = 0;
          state.velocity = 0;
          state.acceleration = 0;
          if (airborne || state.thrust <= 0) {
            state.impactSpeed = Math.abs(nextVelocity);
            state.phase = airborne ? 'settling' : 'landed';
            state.contactTime = 0;
            state.reboundHeight = 0;
            state.reboundVelocity = airborne ? Math.min(2.2, state.impactSpeed * 0.08) : 0;
            state.thrust = 0;
            state.drag = 0;
          }
        } else {
          state.altitude = nextAltitude;
          state.velocity = nextVelocity;
          state.phase = state.thrust > 0 ? 'powered' : (state.velocity >= 0 ? 'coasting' : 'descending');
        }
        state.peakAltitude = Math.max(state.peakAltitude, state.altitude);
        if (state.flightTime + 1e-10 >= nextSample || state.phase === 'landed') {
          sampleFlight();
          nextSample += 0.04;
        }
      } else if (state.phase === 'settling') {
        state.contactTime += h;
        state.reboundVelocity -= C.gravity * h;
        state.reboundHeight = Math.max(0, state.reboundHeight + state.reboundVelocity * h);
        if (state.reboundHeight === 0) state.reboundVelocity = 0;
        // The bottle tips about its point of contact. This is a damped
        // rigid-body approximation, with no scripted upright reset.
        var lean = state.attitude >= 0 ? 1 : -1;
        var target = lean * Math.PI / 2;
        var torque = 14 * Math.sin(target - state.attitude) - 7 * state.angularVelocity;
        state.angularVelocity += torque * h;
        state.attitude += state.angularVelocity * h;
        if (state.contactTime > 1.8 && state.reboundHeight === 0 &&
            Math.abs(state.angularVelocity) < 0.08 && Math.abs(state.attitude - target) < 0.04) {
          state.attitude = target;
          state.angularVelocity = 0;
          state.phase = 'landed';
          sampleFlight();
        }
      }
      state.elapsed += h;
    }

    function step(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 60) throw new RangeError('step(dt) requires 0 to 60 seconds');
      state.exhaustEvents = [];
      accumulator += dt;
      var steps = Math.floor((accumulator + 1e-12) / C.fixedStep);
      accumulator -= steps * C.fixedStep;
      if (accumulator < 0 && accumulator > -1e-10) accumulator = 0;
      for (var i = 0; i < steps; i++) integrate(C.fixedStep);
      return state;
    }

    function snapshot() {
      return Object.assign({}, state, {
        exhaustEvents: state.exhaustEvents.map(function (entry) { return Object.assign({}, entry); }),
        flightSamples: state.flightSamples.map(function (entry) { return Object.assign({}, entry); })
      });
    }

    reset(options);
    return { state: state, step: step, charge: charge, pumpStroke: pumpStroke, stopCharge: stopCharge,
      launch: launch, reset: reset, snapshot: snapshot };
  }

  var api = { create: create, constants: C };
  root.WSSWaterRocketModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
