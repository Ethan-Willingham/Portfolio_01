/*
 * A reduced river-driven wheel and single-acting piston pump, in SI units.
 *
 * The river is a maintained open boundary. Paddle drag supplies shaft torque;
 * there is no speed controller or prescribed crank motion. Ideal check valves
 * admit water as the cylinder expands and deliver exactly its displaced volume
 * as it contracts. The outlet head loads the crank through virtual work.
 *
 * An implicit midpoint step balances shaft work against flywheel kinetic energy,
 * hydraulic work and bearing/brake losses. The stopping branch accounts for the
 * shorter travel before rest. Static valve pressure never drives the crank back.
 */
(function (root) {
  'use strict';

  var TAU = 2 * Math.PI;
  var FIXED_DT = 1 / 240;
  var DEFAULTS = Object.freeze({
    densityKgM3: 1000,
    gravityMps2: 9.81,
    wheelRadiusMeters: 1.2,
    wheelInertiaKgM2: 150,
    paddleAreaM2: 0.1,
    paddleDragCoefficient: 1.15,
    fullRiverSpeedMps: 3.6,
    bearingDampingNms: 7,
    bearingFrictionNm: 4,
    brakeTorqueNm: 1200,
    pistonAreaM2: 0.025,
    pistonStrokeMeters: 0.32,
    chamberDeadVolumeM3: 0.00035,
    deliveryBaseHeightMeters: 4,
    tankAreaM2: 0.12,
    tankCapacityM3: 0.072
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function create(options) {
    options = options || {};
    var p = Object.assign({}, DEFAULTS, options.params || {});
    Object.keys(p).forEach(function (key) {
      if (!Number.isFinite(p[key]) || p[key] < 0) {
        throw new RangeError('Marly parameter must be finite and nonnegative: ' + key);
      }
    });
    ['wheelRadiusMeters', 'wheelInertiaKgM2', 'tankAreaM2', 'tankCapacityM3'].forEach(function (key) {
      if (p[key] === 0) throw new RangeError('Marly parameter must be positive: ' + key);
    });
    Object.freeze(p);
    var swept = p.pistonAreaM2 * p.pistonStrokeMeters;
    var gate = clamp(finite(options.gate, 0.7), 0, 1);
    var brake = !!options.brake;
    var delivery = clamp(finite(options.delivery, 1), 1, 2);
    var angle = 0, omega = 0, accumulator = 0, ticks = 0;
    var tank = 0, source = 0, delivered = 0, overflow = 0;
    var riverWork = 0, hydraulicWork = 0, dissipatedWork = 0;
    var riverDistance = 0, intakeFlow = 0, outletFlow = 0;
    var riverTorque = 0, pumpTorque = 0;

    function pistonFraction(theta) {
      return (1 - Math.cos(theta)) / 2;
    }

    function chamberVolume(theta) {
      return p.chamberDeadVolumeM3 + swept * pistonFraction(theta);
    }

    // Split at dead centres, so even a step crossing a valve change conserves water.
    function displacedVolume(start, end) {
      var volume = 0;
      while (start < end - 1e-15) {
        var boundary = (Math.floor((start + 1e-12) / Math.PI) + 1) * Math.PI;
        var next = Math.min(end, boundary);
        volume += Math.max(0, swept * (pistonFraction(start) - pistonFraction(next)));
        start = next;
      }
      return volume;
    }

    function riverSpeed() {
      return p.fullRiverSpeedMps * Math.sqrt(gate);
    }

    function dragTorque(speed) {
      var slip = riverSpeed() - p.wheelRadiusMeters * speed;
      return 0.5 * p.densityKgM3 * p.paddleDragCoefficient *
        p.paddleAreaM2 * gate * p.wheelRadiusMeters * slip * Math.abs(slip);
    }

    function resistanceTorque(speed) {
      return p.bearingDampingNms * speed + p.bearingFrictionNm +
        (brake ? p.brakeTorqueNm : 0);
    }

    function liftWork(volume) {
      var retained = Math.min(volume, p.tankCapacityM3 - tank);
      var excess = volume - retained;
      var baseHead = p.deliveryBaseHeightMeters * delivery;
      // Integral rho*g*head*dV, including the rising free surface and overflow.
      return p.densityKgM3 * p.gravityMps2 * (
        baseHead * volume + (2 * tank * retained + retained * retained) / (2 * p.tankAreaM2) +
        p.tankCapacityM3 / p.tankAreaM2 * excess
      );
    }

    function pressureTorque(theta) {
      var head = p.deliveryBaseHeightMeters * delivery + tank / p.tankAreaM2;
      return p.densityKgM3 * p.gravityMps2 * head * swept * Math.max(0, -Math.sin(theta)) / 2;
    }

    function fixedStep() {
      var oldOmega = omega;
      var oldChamber = chamberVolume(angle);
      var travel, midpointOmega, nextOmega;

      function residual(candidate) {
        var mid = (oldOmega + candidate) / 2;
        var distance = mid * FIXED_DT;
        var load = distance > 1e-15 ? liftWork(displacedVolume(angle, angle + distance)) / distance : pressureTorque(angle);
        return p.wheelInertiaKgM2 * (candidate - oldOmega) / FIXED_DT -
          dragTorque(mid) + resistanceTorque(mid) + load;
      }

      if (residual(0) > 0) {
        // Static friction and the closed outlet valve hold a stopped crank.
        nextOmega = 0;
        midpointOmega = oldOmega / 2;
        var availableTorque = dragTorque(midpointOmega) - resistanceTorque(midpointOmega);
        var initialEnergy = 0.5 * p.wheelInertiaKgM2 * oldOmega * oldOmega;
        var lowTravel = 0, highTravel = midpointOmega * FIXED_DT;
        for (var stopIteration = 0; stopIteration < 30; stopIteration++) {
          var candidateTravel = (lowTravel + highTravel) / 2;
          var remainingEnergy = initialEnergy + availableTorque * candidateTravel -
            liftWork(displacedVolume(angle, angle + candidateTravel));
          if (remainingEnergy > 0) lowTravel = candidateTravel;
          else highTravel = candidateTravel;
        }
        travel = (lowTravel + highTravel) / 2;
      } else {
        var low = 0;
        var high = oldOmega + Math.max(0, dragTorque(0)) * FIXED_DT / p.wheelInertiaKgM2;
        for (var iteration = 0; iteration < 30; iteration++) {
          var candidate = (low + high) / 2;
          if (residual(candidate) > 0) high = candidate;
          else low = candidate;
        }
        nextOmega = (low + high) / 2;
        midpointOmega = (oldOmega + nextOmega) / 2;
        travel = midpointOmega * FIXED_DT;
      }

      var outputVolume = displacedVolume(angle, angle + travel);
      var work = liftWork(outputVolume);
      var retained = Math.min(outputVolume, p.tankCapacityM3 - tank);
      angle += travel;
      omega = nextOmega;
      var inputVolume = Math.max(0, outputVolume + chamberVolume(angle) - oldChamber);
      source += inputVolume;
      delivered += outputVolume;
      tank += retained;
      overflow += outputVolume - retained;
      intakeFlow = inputVolume / FIXED_DT;
      outletFlow = outputVolume / FIXED_DT;
      riverTorque = dragTorque(midpointOmega);
      pumpTorque = travel > 1e-15 ? work / travel : pressureTorque(angle);
      riverWork += riverTorque * travel;
      hydraulicWork += work;
      dissipatedWork += resistanceTorque(midpointOmega) * travel;
      riverDistance += riverSpeed() * FIXED_DT;
      ticks++;
    }

    function stats() {
      var chamber = chamberVolume(angle);
      var kineticEnergy = 0.5 * p.wheelInertiaKgM2 * omega * omega;
      var moving = omega > 1e-5;
      var phase = !moving ? 'stopped' : Math.sin(angle) >= 0 ? 'intake' : 'delivery';
      return {
        elapsed: ticks * FIXED_DT,
        gate: gate,
        brake: brake,
        delivery: delivery,
        wheelAngle: angle,
        omega: omega,
        rpm: omega * 60 / TAU,
        revolutions: angle / TAU,
        pistonFraction: pistonFraction(angle),
        phase: phase,
        inletOpen: moving && phase === 'intake',
        outletOpen: moving && phase === 'delivery',
        flowLps: outletFlow * 1000,
        intakeFlowLps: intakeFlow * 1000,
        deliveredLiters: delivered * 1000,
        tankLiters: tank * 1000,
        tankCapacityLiters: p.tankCapacityM3 * 1000,
        overflowLiters: overflow * 1000,
        sourceLiters: source * 1000,
        chamberLiters: chamber * 1000,
        sweptLiters: swept * 1000,
        riverSpeedMps: riverSpeed(),
        riverDistanceMeters: riverDistance,
        deliveryHeightMeters: p.deliveryBaseHeightMeters * delivery + tank / p.tankAreaM2,
        riverTorqueNm: riverTorque,
        pumpTorqueNm: pumpTorque,
        riverWorkJ: riverWork,
        hydraulicWorkJ: hydraulicWork,
        dissipatedWorkJ: dissipatedWork,
        kineticEnergyJ: kineticEnergy,
        massResidualLiters: (p.chamberDeadVolumeM3 + source - chamber - tank - overflow) * 1000,
        energyResidualJ: riverWork - hydraulicWork - dissipatedWork - kineticEnergy
      };
    }

    return {
      params: p,
      step: function (dt) {
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Marly step requires a finite, nonnegative time.');
        accumulator += dt;
        var steps = Math.floor((accumulator + 1e-12) / FIXED_DT);
        for (var step = 0; step < steps; step++) fixedStep();
        accumulator = Math.max(0, accumulator - steps * FIXED_DT);
        return stats();
      },
      setGate: function (value) { gate = clamp(finite(value, gate), 0, 1); },
      setBrake: function (value) { brake = !!value; },
      setDelivery: function (value) { delivery = clamp(finite(value, delivery), 1, 2); },
      stats: stats
    };
  }

  root.WSSMarlyModel = { create: create, defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
