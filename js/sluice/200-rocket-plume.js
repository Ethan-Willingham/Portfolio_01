  // ====== ROCKET PLUME ======
  // Independent from the diesel exhaust fluid sim. Procedural flame core,
  // additive sparks, normal-blend smoke wake, and a ground-impact wash that
  // fans out when the nozzle is close to terrain.
  var rocketTune = {
    enabled: true,
    ramp_up: 30,
    ramp_down: 20,
    core_length: 40,
    core_length_min: 37,
    core_width: 3,
    core_width_taper: 0.04,
    core_jitter: 0.7,
    core_pulse_amp: 0.065,
    core_pulse_freq: 8.5,
    core_inner_r: 1.67, core_inner_g: 0.22, core_inner_b: 1.71,
    core_mid_r: 0.68,   core_mid_g: 0.89,   core_mid_b: 1.9,
    core_outer_r: 1.92,  core_outer_g: 1.94,  core_outer_b: 1.22,
    core_alpha: 0.34,
    shock_enabled: true,
    shock_count: 5,
    shock_size: 1.5,
    shock_brightness: 0.17,
    shock_pulse_freq: 7,
    wash_enabled: true,
    wash_distance: 155,
    wash_rate: 840,
    wash_speed: 160,
    wash_speed_jitter: 0.4,
    wash_lift: 35,
    wash_life: 0.4,
    wash_size: 2.2,
    wash_growth: 10,
    wash_drag: 1.9,
    wash_lobes: 4,
    wash_lobe_spread: 0.55,
    wash_rot_speed: 1.8,
    wash_top_light: 0.45,
    wash_shadow: 0.35,
    wash_top_r: 1, wash_top_g: 0.85, wash_top_b: 0.55,
    wash_r: 0.67, wash_g: 0.7,  wash_b: 0.7,
    wash_alpha: 0.29,
    wash_streak_enabled: true,
    wash_streak_alpha: 0.35,
    wash_streak_length: 0.06,
    wash_impact_enabled: true,
    wash_impact_size: 28,
    wash_impact_alpha: 0.85,
    wash_impact_r: 1, wash_impact_g: 0.65, wash_impact_b: 0.25,
    wash_impact_pulse_freq: 14,
    spark_rate: 0,
    spark_max: 510,
    spark_speed: 680,
    spark_speed_jitter: 0.3,
    spark_spread: 1.06,
    spark_life: 1.45,
    spark_size: 1.55,
    spark_drag: 2.85,
    spark_gravity: 240,
    spark_r: 0.07, spark_g: 0.55, spark_b: 0.56,
    spark_alpha: 0.61,
    wake_rate: 0,
    wake_max: 70,
    wake_speed: 40,
    wake_spread: 0.36,
    wake_life: 0.5,
    wake_size: 1.2,
    wake_growth: 0.2,
    wake_drag: 0.1,
    wake_buoyancy: 68,
    wake_r: 1.76, wake_g: 0.85, wake_b: 1.36,
    wake_alpha: 0.91,
  };
  window.rocketTune = rocketTune;

  var rocketIntensity = 0;
  var rocketSparks = [];
  var rocketSparkCarry = 0;
  var rocketWake = [];
  var rocketWakeCarry = 0;
  var rocketWash = [];
  var rocketWashCarry = 0;

  // ----- Flight FX state (ignition pressure curls, landing dust) -----
  // Consumes the player.fx event counters from the flight integrator (080); the
  // counters only ever increment, so we diff them against this local snapshot.
  var FLIGHT_FLAME_SHORTEN = 0.16;   // flame length shed at full airspeed response (0..1)
  var FLIGHT_FLAME_WIDEN = 0.18;     // flame width gain at full airspeed response (0..1)
  var FLIGHT_FLAME_BEND_MAX = 0.24;   // crosswind tail push at full response, fraction of flame length
  var FLIGHT_FLAME_BEND_V0 = 0.5;    // speed01 (|v| / flyTune.speed) where the airspeed response starts
  var FLIGHT_FLAME_BEND_V1 = 1.4;    // speed01 where the airspeed response reaches full strength
  var flightFxSeen = { sync: false, ignite: 0, land: 0 };
  var FLIGHT_IGNITE_DURATION = 0.14;
  var flightIgniteCooldown = 0; // prevents a stack of pressure puffs on rapid taps
  var flightIgniteT = 0;       // remaining ignition-pop flame overshoot (s)
  var flightRings = [];        // short-lived, directional ignition pressure curls

  function rocketTuneNum(v, fb) { v = Number(v); return isFinite(v) ? v : fb; }
  function rocketChan(v) { return Math.max(0, Math.min(255, Math.round(rocketTuneNum(v, 0) * 255))); }
  function rocketRgba(r, g, b, a) {
    return 'rgba(' + rocketChan(r) + ',' + rocketChan(g) + ',' + rocketChan(b) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }


  function rocketFindImpactAlong(wx, wy, dirX, dirY, maxDist) {
    var step = 4;
    for (var d = step; d <= maxDist; d += step) {
      var px = wx + dirX * d;
      var py = wy + dirY * d;
      if (tileAt(Math.floor(py / TILE), Math.floor(px / TILE)) !== null) return d;
      if (rocketInJello(px, py) || rocketInSkySlime(px, py)) return d;   // a slime stops the exhaust too -> wash + flame land ON it, not below
    }
    return null;
  }

  function rocketInSolid(wx, wy) {
    return tileAt(Math.floor(wy / TILE), Math.floor(wx / TILE)) !== null;
  }
  // True if the world point is inside any LIVE jello blob. A slime is a soft body, not a
  // solid tile, so the tile probe above tunnels straight through it; this lets the exhaust
  // impact (the ground-wash dust + the flame-core length) land ON a slime instead of on the
  // ground below it. bbox broad-phase keeps it cheap, and it's a no-op when no jello is live.
  function rocketInJello(wx, wy) {
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.ringN < 3) continue;
      if (wx < b.bboxL || wx > b.bboxR || wy < b.bboxT || wy > b.bboxB) continue;
      if (jelloPointInRing(b, wx, wy)) return true;
    }
    return false;
  }

  function rocketInSkySlime(wx, wy) {
    if (typeof skySlimes === 'undefined') return false;
    for (var i = 0; i < skySlimes.length; i++) {
      var s = skySlimes[i], dx = wx - s.x, dy = wy - s.y;
      if (dx * dx + dy * dy < s.r * s.r) return true;
    }
    return false;
  }

  function rocketExhaustDir() {
    // Use the same eased angle as the nozzle anchors and the drawn chassis.
    var angle = player.bodyTiltRender || 0;
    return { x: -Math.sin(angle), y: Math.cos(angle) };
  }

  function rocketNozzles() {
    // Anchored in player-local space so the plume follows the banked chassis,
    // not just the unrotated collision box.
    return [
      playerLocalToWorld(7.0, PLAYER_H - 1),
      playerLocalToWorld(14.8, PLAYER_H - 1)
    ];
  }

  function clearRocketPlume() {
    rocketSparks.length = 0;
    rocketWake.length = 0;
    rocketWash.length = 0;
    rocketSparkCarry = 0;
    rocketWakeCarry = 0;
    rocketWashCarry = 0;
    rocketIntensity = 0;
    flightRings.length = 0;
    flightIgniteT = 0;
    flightIgniteCooldown = 0;
    resetLandingFeedback();
    flightFxSeen.sync = false;   // re-adopt the fx counters on the next frame, no stale replays
  }



  function spawnRocketSpark(nx, ny, exhaustDir) {
    var T = rocketTune;
    var spread = rocketTuneNum(T.spark_spread, 0.10);
    var speed = rocketTuneNum(T.spark_speed, 540);
    var jit = rocketTuneNum(T.spark_speed_jitter, 0.35);
    var ed = exhaustDir || rocketExhaustDir();
    var ang = Math.atan2(ed.y, ed.x) + (Math.random() - 0.5) * 2 * spread;
    var v = speed * (1 - jit + Math.random() * jit * 2);
    rocketSparks.push({
      x: nx, y: ny,
      vx: Math.cos(ang) * v + player.vx * 0.05,
      vy: Math.sin(ang) * v,
      age: 0,
      life: rocketTuneNum(T.spark_life, 0.35) * (0.7 + Math.random() * 0.6),
      size: rocketTuneNum(T.spark_size, 1.6) * (0.8 + Math.random() * 0.6),
    });
    var cap = Math.max(8, rocketTuneNum(T.spark_max, 200) | 0);
    while (rocketSparks.length > cap) rocketSparks.shift();
  }

  function spawnRocketWake(nx, ny, exhaustDir) {
    var T = rocketTune;
    var spread = rocketTuneNum(T.wake_spread, 0.42);
    var speed = rocketTuneNum(T.wake_speed, 130);
    var ed = exhaustDir || rocketExhaustDir();
    var ang = Math.atan2(ed.y, ed.x) + (Math.random() - 0.5) * 2 * spread;
    rocketWake.push({
      x: nx + (Math.random() - 0.5) * 3,
      y: ny + Math.random() * 2,
      vx: Math.cos(ang) * speed + player.vx * 0.05,
      vy: Math.sin(ang) * speed,
      age: 0,
      life: rocketTuneNum(T.wake_life, 1.7) * (0.7 + Math.random() * 0.6),
      size: rocketTuneNum(T.wake_size, 4.2) * (0.7 + Math.random() * 0.6),
      phase: Math.random() * Math.PI * 2,
    });
    var capW = Math.max(8, rocketTuneNum(T.wake_max, 280) | 0);
    while (rocketWake.length > capW) rocketWake.shift();
  }

  function spawnRocketWash(x, y, side, impact) {
    var T = rocketTune;
    var sp = rocketTuneNum(T.wash_speed, 380) * (0.55 + Math.random() * 0.55) * impact;
    // Bias wash speed by rocket pointing direction so a banked rocket fans
    // exhaust along the bank, not symmetrically around the rig.
    var edWash = rocketExhaustDir();
    var dirBiasW = Math.max(-1, Math.min(1, edWash.x));
    var sideMulW = 1 + side * dirBiasW * 0.95;
    if (sideMulW < 0.05) sideMulW = 0.05;
    rocketWash.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y - 0.5 + (Math.random() - 0.5) * 1.0,
      vx: side * sp * sideMulW,
      vy: -10 - Math.random() * 22,
      age: 0,
      life: rocketTuneNum(T.wash_life, 0.95) * (0.65 + Math.random() * 0.55),
      size: rocketTuneNum(T.wash_size, 5.0) * (0.65 + Math.random() * 0.55),
      phase: Math.random() * Math.PI * 2,
    });
    while (rocketWash.length > 240) rocketWash.shift();
  }


  // Compact pressure-puff pool. Keep the existing event interface for callers.
  // The birth angle stays fixed as the puff drifts away from the moving rig.
  function spawnFlightRing(x, y, vx, vy, r0, r1, life, w, shock, delay) {
    flightRings.push({
      x: x, y: y, vx: vx, vy: vy,
      r0: r0, r1: r1,
      age: -(delay || 0), life: life,
      w: w, shock: shock, angle: player.bodyTiltRender || 0
    });
    while (flightRings.length > 12) flightRings.shift();
  }

  // Short, low contact wisps. Independent of rocket-wash tuning so a
  // stronger booster cannot turn a normal landing into an exhaust burst.
  function spawnLandingDust(x, y, side, strength) {
    rocketWash.push({
      x: x + side * (PLAYER_W * 0.38 + Math.random() * 2),
      y: y - 1.2,
      vx: side * (18 + Math.random() * 22) * (0.5 + strength),
      vy: -3 - Math.random() * 5,
      age: 0,
      life: 0.16 + strength * 0.10 + Math.random() * 0.04,
      size: 1.1 + strength * 0.8 + Math.random() * 0.3,
      landing: true,
      phase: Math.random() * Math.PI * 2
    });
    while (rocketWash.length > 240) rocketWash.shift();
  }

  // ----- Flight FX update: diff the fx event counters + advance the pools -----
  function updateFlightFx(dt) {
    var fx = player.fx;
    if (fx) {
      if (!flightFxSeen.sync) {
        // First frame after boot/restart: adopt the counters without firing so
        // a restored or restarted session does not replay stale events.
        flightFxSeen.ignite = fx.igniteN || 0;
        flightFxSeen.land = fx.landN || 0;
        flightFxSeen.sync = true;
      }

      // A short, eased flare and one restrained pressure curl per nozzle.
      // Record the event even when the visible jet is gated off (menus/drilling).
      if (fx.igniteN !== flightFxSeen.ignite) {
        flightFxSeen.ignite = fx.igniteN;
        if (rocketJetActive()) {
          flightIgniteT = FLIGHT_IGNITE_DURATION;
          if (flightIgniteCooldown <= 0) {
            flightIgniteCooldown = 0.20;
            var nzI = rocketNozzles();
            var edI = rocketExhaustDir();
            for (var ri = 0; ri < nzI.length; ri++) {
              var nzr = nzI[ri];
              spawnFlightRing(nzr.x + edI.x * 3, nzr.y + edI.y * 3,
                edI.x * 32 + player.vx * 0.18, edI.y * 32 + player.vy * 0.18,
                1.8, 7.5, 0.26, 0.75, 0, 0);
            }
          }
        }
      }

      // Tiny drops stay quiet. Wet ground and gel already have their own
      // contact effects; only dry impacts emit these two to six low wisps.
      if (fx.landN !== flightFxSeen.land) {
        flightFxSeen.land = fx.landN;
        var lvy = fx.landVy || 0;
        if (lvy > 150 && fx.landSurface !== 'jello' && !(fx.landCushion > 0.05)) {
          var landStrength = Math.min(1, (lvy - 150) / 500);
          var pairs = 1 + Math.floor(landStrength * 2);
          for (var li = 0; li < pairs * 2; li++) {
            spawnLandingDust(fx.landX, fx.landY, li % 2 ? 1 : -1, landStrength);
          }
        }
      }
    }

    flightIgniteT = Math.max(0, flightIgniteT - dt);
    flightIgniteCooldown = Math.max(0, flightIgniteCooldown - dt);

    // Advance the pools (forward in-place compaction, same pattern as above).

    var rgN = flightRings.length, rgW = 0;
    for (var rg = 0; rg < rgN; rg++) {
      var ring = flightRings[rg];
      ring.age += dt;
      if (ring.age > ring.life) continue;
      if (ring.age > 0) {
        ring.x += ring.vx * dt;
        ring.y += ring.vy * dt;
      }
      flightRings[rgW++] = ring;
    }
    flightRings.length = rgW;
  }

  // The flame and its voice share the live trigger. Spool and smoke can
  // coast after release, but neither means the nozzle is still firing.
  function rocketJetActive() {
    return !!(rocketTune && rocketTune.enabled && !PERF_DISABLE_ROCKET &&
      player.lastMoveU && player.thrusting && player.fuel > 0 &&
      !gameOver && !gameWon && !shopOpen && shopState === 'closed' &&
      !ledgerOpen && !cargoManifestOpen && !roverMode &&
      !drilling && !(player.drillGlideT > 0));
  }
  function rocketJetVisible() {
    return rocketJetActive() && rocketIntensity > 0.02;
  }

  // Push existing smoke with air, never dye. Both fluid instances receive
  // the same world-space jet after their camera scroll and before projection.
  // Acceleration and Gaussian widths are in world pixels, independent of
  // frame rate, zoom and the solver's grid resolution.
  function rocketSmokeCouple(driver, dt) {
    if (!rocketJetVisible() || dt <= 0) return;
    var dims, aspect;
    if (driver) {
      dims = driver.simW > 0 && driver.simH > 0 ? { w: driver.simW, h: driver.simH } :
        smokeWGPUResDims(driver.config.SIM_RESOLUTION, smokeFluidWidth, smokeFluidHeight);
      aspect = smokeFluidWidth / smokeFluidHeight;
    } else if (!fluidU) return;
    var strength = 1800 * rocketIntensity * rocketIntensity * Math.min(dt, 0.05);
    function impulse(x, y, ax, ay, radius) {
      if (rocketInSolid(x, y) || rocketInJello(x, y) || rocketInSkySlime(x, y)) return;
      if (driver) {
        var uv = smokeFluidWorldToUV(x, y);
        if (!uv.inView) return;
        var rad = 100 * Math.pow(radius / smokeFluidDomainWorldH, 2) / Math.max(1, aspect);
        var vx = ax * strength * dims.w / smokeFluidDomainWorldW;
        var vy = -ay * strength * dims.h / smokeFluidDomainWorldH;
        if (driver.splatVelocity) driver.splatVelocity(uv.uvX, uv.uvY, vx, vy, rad);
        else driver.splat(uv.uvX, uv.uvY, vx, vy, SMOKE_ZERO_COL, rad);
      } else {
        var gx = (x - fluidGridX) / FLUID_CELL, gy = (y - fluidGridY) / FLUID_CELL;
        fluidSplatDisc(fluidU, gx, gy, radius / FLUID_CELL, ax * strength);
        fluidSplatDisc(fluidV, gx, gy, radius / FLUID_CELL, ay * strength);
      }
    }
    var nozzles = rocketNozzles(), dir = rocketExhaustDir();
    var distances = [5, 18, 36, 60, 90, 124], reach = TILE * 4;
    for (var ni = 0; ni < nozzles.length; ni++) {
      var nz = nozzles[ni];
      var hit = rocketFindImpactAlong(nz.x, nz.y, dir.x, dir.y, reach);
      for (var i = 0; i < distances.length; i++) {
        var d = distances[i], radius = 4 + d * 0.12;
        if (hit !== null) radius = Math.min(radius, (hit - d) * 0.45);
        if (radius < 1) break;
        var falloff = Math.pow(1 - d / (reach + 20), 2);
        impulse(nz.x + dir.x * d, nz.y + dir.y * d, dir.x * falloff, dir.y * falloff, radius);
      }
      // At an impact, redirect some flow along the surface. Sample the local
      // solid normal so a tilted jet meeting a floor still washes sideways.
      if (hit !== null) {
        var hx = nz.x + dir.x * hit, hy = nz.y + dir.y * hit;
        var nx = Number(rocketInSolid(hx - 4, hy)) - Number(rocketInSolid(hx + 4, hy));
        var ny = Number(rocketInSolid(hx, hy - 4)) - Number(rocketInSolid(hx, hy + 4));
        var normalLength = Math.hypot(nx, ny);
        if (normalLength) { nx /= normalLength; ny /= normalLength; }
        else { nx = -dir.x; ny = -dir.y; }
        var wash = 0.55 * Math.pow(1 - hit / (reach + 20), 2);
        for (var side = -1; side <= 1; side += 2) {
          var tx = -ny * side, ty = nx * side;
          var bx = hx + nx * 7, by = hy + ny * 7;
          if (rocketFindImpactAlong(bx, by, tx, ty, 12) !== null) continue;
          impulse(bx + tx * 12, by + ty * 12, tx * wash, ty * wash, 5);
        }
      }
    }
  }

  function updateRocketPlume(dt) {
    if (dt > 0.05) dt = 0.05;
    var T = rocketTune;
    if (!T || !T.enabled) {
      rocketIntensity *= Math.exp(-rocketTuneNum(T && T.ramp_down, 3.5) * dt);
      if (rocketIntensity < 0.001) rocketIntensity = 0;
    } else {
      var emitting = rocketJetActive();
      var target = emitting ? 1 : 0;
      var rate = emitting ? rocketTuneNum(T.ramp_up, 9.0) : rocketTuneNum(T.ramp_down, 3.5);
      rocketIntensity += (target - rocketIntensity) * Math.min(1, rate * dt);
    }

    if (T && T.enabled && rocketIntensity > 0.02) {
      var nozzles = rocketNozzles();
      var exhaustDir2 = rocketExhaustDir();

      if (T.spark_enabled) {
        var sparkRate = rocketTuneNum(T.spark_rate, 320) * rocketIntensity;
        rocketSparkCarry += sparkRate * dt;
        var nS = Math.min(40, Math.floor(rocketSparkCarry));
        rocketSparkCarry -= nS;
        for (var s = 0; s < nS; s++) {
          var nz = nozzles[s % 2];
          spawnRocketSpark(nz.x, nz.y, exhaustDir2);
        }
      }

      if (T.wake_enabled) {
        var wakeRate = rocketTuneNum(T.wake_rate, 80) * rocketIntensity;
        rocketWakeCarry += wakeRate * dt;
        var nW = Math.min(20, Math.floor(rocketWakeCarry));
        rocketWakeCarry -= nW;
        for (var wi = 0; wi < nW; wi++) {
          var nzw = nozzles[wi % 2];
          spawnRocketWake(nzw.x, nzw.y, exhaustDir2);
        }
      }

      if (T.wash_enabled) {
        var washDist = rocketTuneNum(T.wash_distance, 220);
        var centerNozzle = playerLocalToWorld(PLAYER_W / 2, PLAYER_H - 1);
        var impactDist = rocketFindImpactAlong(centerNozzle.x, centerNozzle.y, exhaustDir2.x, exhaustDir2.y, washDist);
        if (impactDist !== null) {
          var impactX = centerNozzle.x + exhaustDir2.x * Math.max(0, impactDist - 1);
          var impactY = centerNozzle.y + exhaustDir2.y * Math.max(0, impactDist - 1);
          var impact = Math.max(0, 1 - impactDist / washDist);
          impact = impact * impact;
          var washPerpX = -exhaustDir2.y;
          var washPerpY = exhaustDir2.x;
          var washRate = rocketTuneNum(T.wash_rate, 220) * rocketIntensity * impact;
          rocketWashCarry += washRate * dt;
          var nWa = Math.min(84, Math.floor(rocketWashCarry));
          rocketWashCarry -= nWa;
          for (var wa = 0; wa < nWa; wa++) {
            var sd = wa % 2 ? 1 : -1;
            var spread = sd * (3 + Math.random() * 4);
            spawnRocketWash(impactX + washPerpX * spread, impactY + washPerpY * spread, sd, impact);
          }
        } else {
          rocketWashCarry = 0;
        }
      }
    } else {
      rocketSparkCarry = 0;
      rocketWakeCarry = 0;
      rocketWashCarry = 0;
    }

    // v23.33 — forward in-place compaction (was backward splice-per-dead, O(n^2)
    // when a burst dies at once). Same survivors, same draw order, O(n).
    var sparkDrag = rocketTuneNum(T && T.spark_drag, 1.2);
    var sparkGrav = rocketTuneNum(T && T.spark_gravity, 60);
    var sparkN = rocketSparks.length, sparkW = 0;
    for (var i = 0; i < sparkN; i++) {
      var p = rocketSparks[i];
      p.age += dt;
      if (p.age > p.life) continue;
      p.vy += sparkGrav * dt;
      p.vx *= Math.exp(-sparkDrag * dt);
      p.vy *= Math.exp(-sparkDrag * 0.25 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (rocketInSolid(p.x, p.y)) continue;
      rocketSparks[sparkW++] = p;
    }
    rocketSparks.length = sparkW;

    var wakeDrag = rocketTuneNum(T && T.wake_drag, 0.55);
    var wakeBuoy = rocketTuneNum(T && T.wake_buoyancy, -42);
    var wakeN = rocketWake.length, wakeW = 0;
    for (var j = 0; j < wakeN; j++) {
      var w = rocketWake[j];
      w.age += dt;
      if (w.age > w.life) continue;
      w.vx *= Math.exp(-wakeDrag * dt);
      w.vy = w.vy + wakeBuoy * dt;
      w.vy *= Math.exp(-wakeDrag * 0.3 * dt);
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      if (rocketInSolid(w.x, w.y)) continue;
      rocketWake[wakeW++] = w;
    }
    rocketWake.length = wakeW;

    var washDragX = rocketTuneNum(T && T.wash_drag, 1.6);
    var washN = rocketWash.length, washW = 0;
    for (var k = 0; k < washN; k++) {
      var ws = rocketWash[k];
      ws.age += dt;
      if (ws.age > ws.life) continue;
      ws.vx *= Math.exp(-washDragX * dt);
      ws.vy *= Math.exp(-washDragX * 0.5 * dt);
      ws.x += ws.vx * dt;
      ws.y += ws.vy * dt;
      if (rocketInSolid(ws.x, ws.y)) continue;
      rocketWash[washW++] = ws;
    }
    rocketWash.length = washW;

    // Flight FX (ignition pop rings, landing dust) diff the player.fx
    // counters and advance their pools here so they share the plume's
    // per-frame entry point.
    updateFlightFx(dt);
  }

  // v23.76 — per-tier booster exhaust colours (channel space, *255 clamped like
  // rocketTune). Index = upgrades.boosterLevel; tier 3 is intentionally absent
  // (it uses today's live rocketTune core unchanged, the anchor). T1-2 are a
  // dim/amber ember; T4-5 a hot blue-white. i/m/o = inner/mid/outer gradient.
  var BOOST_FLAME = [
    null,
    { i: [1.50, 0.55, 0.15], m: [1.20, 0.45, 0.12], o: [0.90, 0.35, 0.10] }, // 1 scrap (dim orange)
    { i: [1.85, 0.95, 0.30], m: [1.60, 0.70, 0.20], o: [1.20, 0.50, 0.15] }, // 2 stock (amber)
    null,                                                                    // 3 = today (rocketTune)
    { i: [1.40, 1.60, 1.95], m: [0.70, 1.10, 1.90], o: [0.40, 0.70, 1.70] }, // 4 overclock (blue-white)
    { i: [1.70, 1.85, 1.99], m: [0.90, 1.40, 1.99], o: [0.50, 0.90, 1.95] }  // 5 afterburner (hot blue-white)
  ];
  // All flame layers and compression cells follow one continuous centreline.
  // Root displacement and root slope are zero; only the tail catches the wind.
  function rocketFlamePoint(nz, ed, len, width, bend, phase, f, side, reach, scale, taper) {
    var wave = phase - f * 9;
    var ripple = width * 0.32 * Math.max(0, Math.min(2, rocketTuneNum(rocketTune.core_jitter, 0.7)));
    var offset = len * bend * f * f + ripple * f * f * Math.sin(wave);
    var slope = 2 * bend * f + ripple / len * (2 * f * Math.sin(wave) - 9 * f * f * Math.cos(wave));
    var tx = ed.x - ed.y * slope, ty = ed.y + ed.x * slope;
    var norm = Math.sqrt(tx * tx + ty * ty);
    var u = Math.min(1, f / reach);
    var half = width * scale * (0.58 + 0.8 * Math.sin(u * Math.PI * 0.85)) *
      Math.pow(1 - u, 0.8 + taper);
    return {
      x: nz.x + ed.x * len * f - ed.y * offset - ty / norm * half * side,
      y: nz.y + ed.y * len * f + ed.x * offset + tx / norm * half * side
    };
  }

  function rocketFlamePath(nz, ed, len, width, bend, phase, reach, scale, taper, clip) {
    var end = Math.min(reach, clip);
    var steps = 20;
    ctx.beginPath();
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i <= steps; i++) {
        var f = end * (side < 0 ? i : steps - i) / steps;
        var p = rocketFlamePoint(nz, ed, len, width, bend, phase, f, side, reach, scale, taper);
        if (side < 0 && i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.closePath();
  }

  // Probe the curved envelope, not a straight ray, so a banked flame cannot
  // bend through a shaft wall or a slime. Bounded to 96 samples per nozzle.
  function rocketFlameClearance(nz, ed, len, width, bend, phase, taper) {
    var steps = Math.min(96, Math.max(8, Math.ceil(len / 2)));
    for (var i = 0; i <= steps; i++) {
      var f = i / steps;
      for (var side = -1; side <= 1; side++) {
        var p = rocketFlamePoint(nz, ed, len, width, bend, phase, f, side, 1, 1.18, taper);
        if (rocketInSolid(p.x, p.y) || rocketInJello(p.x, p.y) || rocketInSkySlime(p.x, p.y)) return Math.max(0, (i - 1) / steps);
      }
    }
    return 1;
  }

  function drawRocketPlume() {
    if (PERF_DISABLE_ROCKET) return;   // v12.9 — rocket-plume toggle
    var T = rocketTune;
    if (!T || !T.enabled) return;

    // ----- Pass 1: smoke wake (normal blend) -----
    if (T.wake_enabled && rocketWake.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      var wakeAlpha = rocketTuneNum(T.wake_alpha, 0.42);
      var wakeGrowth = rocketTuneNum(T.wake_growth, 7.5);
      var wR = T.wake_r, wG = T.wake_g, wB = T.wake_b;
      // v23.33 — channels constant across the pass; hoist them, vary only alpha.
      var wakeRgbaPrefix = 'rgba(' + rocketChan(wR) + ',' + rocketChan(wG) + ',' + rocketChan(wB) + ',';
      for (var i = 0; i < rocketWake.length; i++) {
        var w = rocketWake[i];
        if (w.x + 60 < cam.x || w.x - 60 > cam.x + screenW) continue;
        if (w.y + 60 < cam.y || w.y - 60 > cam.y + screenH) continue;
        var fade = 1 - w.age / w.life;
        var sm = fade * fade * (3 - 2 * fade);
        var grown = w.size + wakeGrowth * w.age;
        ctx.fillStyle = wakeRgbaPrefix + Math.max(0, Math.min(1, wakeAlpha * sm)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(w.x + Math.sin(w.phase + w.age * 4) * 1.0, w.y, grown, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 2: ground wash (normal blend, drawn after wake so it sits on top) -----
    if (T.wash_enabled && rocketWash.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      var washAlpha = rocketTuneNum(T.wash_alpha, 0.55);
      var washGrowth = rocketTuneNum(T.wash_growth, 9.0);
      var sR = T.wash_r, sG = T.wash_g, sB = T.wash_b;
      // v23.33 — channels constant across the pass; hoist them, vary only alpha.
      var washRgbaPrefix = 'rgba(' + rocketChan(sR) + ',' + rocketChan(sG) + ',' + rocketChan(sB) + ',';
      for (var j = 0; j < rocketWash.length; j++) {
        var ws = rocketWash[j];
        if (ws.x + 60 < cam.x || ws.x - 60 > cam.x + screenW) continue;
        if (ws.y + 60 < cam.y || ws.y - 60 > cam.y + screenH) continue;
        var f2 = 1 - ws.age / ws.life;
        var grown2 = ws.size + (ws.landing ? 3 : washGrowth) * ws.age;
        ctx.fillStyle = washRgbaPrefix + Math.max(0, Math.min(1, (ws.landing ? 0.18 : washAlpha) * f2 * f2)).toFixed(3) + ')';
        ctx.beginPath();
        if (ws.landing) ctx.ellipse(ws.x, ws.y, grown2, grown2 * 0.48, 0, 0, Math.PI * 2);
        else ctx.arc(ws.x, ws.y, grown2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 3: core flame (additive) -----
    if (rocketJetVisible()) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var nozzles = rocketNozzles();
      var lenMin = rocketTuneNum(T.core_length_min, 28);
      var lenMax = rocketTuneNum(T.core_length, 110);
      var len = lenMin + (lenMax - lenMin) * rocketIntensity;
      var t = performance.now() * 0.001;
      var pulse = 1 + Math.sin(t * rocketTuneNum(T.core_pulse_freq, 26) * 2 * Math.PI) * rocketTuneNum(T.core_pulse_amp, 0.18);
      len *= Math.max(0.05, pulse);
      var ww = rocketTuneNum(T.core_width, 9);
      var taper = Math.max(0, rocketTuneNum(T.core_width_taper, 0.18));
      var alpha = rocketTuneNum(T.core_alpha, 0.92);
      // v23.76 — booster tier shapes the exhaust. Tier 3 keeps today's live
      // rocketTune core exactly (the anchor); other tiers shift hue + size so the
      // booster tier reads at a glance.
      var _bl = upgrades.boosterLevel || 1;
      var _szf = [1, 0.82, 0.91, 1.0, 1.12, 1.26][_bl] || 1;
      len = Math.max(2, len * _szf); ww = Math.max(0.2, ww * _szf);
      var ci_r = T.core_inner_r, ci_g = T.core_inner_g, ci_b = T.core_inner_b;
      var cm_r = T.core_mid_r,   cm_g = T.core_mid_g,   cm_b = T.core_mid_b;
      var co_r = T.core_outer_r, co_g = T.core_outer_g, co_b = T.core_outer_b;
      if (_bl !== 3 && BOOST_FLAME[_bl]) {
        var _bf = BOOST_FLAME[_bl];
        ci_r = _bf.i[0]; ci_g = _bf.i[1]; ci_b = _bf.i[2];
        cm_r = _bf.m[0]; cm_g = _bf.m[1]; cm_b = _bf.m[2];
        co_r = _bf.o[0]; co_g = _bf.o[1]; co_b = _bf.o[2];
      }
      var exhaustDir = rocketExhaustDir();
      var perpX = -exhaustDir.y;
      var perpY = exhaustDir.x;

      // ----- Flight FX: flame as an airspeed instrument + event transients -----
      // Past FLIGHT_FLAME_BEND_V0 the flame reads the airspeed: slightly
      // shorter and wider, with the tail blown by the crosswind component of
      // the relative wind (the axial component is dropped so straight cruise
      // keeps the clean shortened look). Subtle by design.
      var ffSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      var ffCap = flyTune.speed || 400;
      var ffT = (ffSpd / ffCap - FLIGHT_FLAME_BEND_V0) / (FLIGHT_FLAME_BEND_V1 - FLIGHT_FLAME_BEND_V0);
      if (ffT < 0) ffT = 0; else if (ffT > 1) ffT = 1;
      ffT = ffT * ffT * (3 - 2 * ffT);
      var ffBendX = 0, ffBendY = 0;
      if (ffT > 0) {
        len *= 1 - FLIGHT_FLAME_SHORTEN * ffT;
        ww *= 1 + FLIGHT_FLAME_WIDEN * ffT;
        if (ffSpd > 1) {
          var ffWx = -player.vx / ffSpd, ffWy = -player.vy / ffSpd;
          var ffAx = ffWx * exhaustDir.x + ffWy * exhaustDir.y;
          ffBendX = (ffWx - exhaustDir.x * ffAx) * FLIGHT_FLAME_BEND_MAX * ffT;
          ffBendY = (ffWy - exhaustDir.y * ffAx) * FLIGHT_FLAME_BEND_MAX * ffT;
        }
      }
      var ignite = flightIgniteT / FLIGHT_IGNITE_DURATION;
      ignite = ignite * ignite * (3 - 2 * ignite);
      len *= 1 + 0.18 * ignite;
      ww *= 1 + 0.12 * ignite;

      for (var n = 0; n < nozzles.length; n++) {
        var nz = nozzles[n];
        if (nz.x + len < cam.x || nz.x - len > cam.x + screenW) continue;
        if (nz.y - 20 > cam.y + screenH) continue;
        var nx = nz.x, ny = nz.y;
        var phase = t * 17 + n * 0.8;
        var bend = ffBendX * perpX + ffBendY * perpY;
        // core_jitter now sets a small flowing tail ripple, never root shake.
        var flameWidth = ww;
        var clip = rocketFlameClearance(nz, exhaustDir, len, flameWidth, bend, phase, taper);
        if (clip <= 0) continue;
        var end = rocketFlamePoint(nz, exhaustDir, len, flameWidth, bend, phase, 1, 0, 1, 1, taper);
        // Soft envelope, coloured body, and a narrow hot throat. Axial ramps
        // retain structure in both flight directions instead of a radial blob.
        var outer = ctx.createLinearGradient(nx, ny, end.x, end.y);
        outer.addColorStop(0, rocketRgba(co_r, co_g, co_b, alpha * 0.28));
        outer.addColorStop(0.25, rocketRgba(cm_r, cm_g, cm_b, alpha * 0.40));
        outer.addColorStop(1, rocketRgba(co_r, co_g, co_b, 0));
        ctx.fillStyle = outer;
        rocketFlamePath(nz, exhaustDir, len, flameWidth, bend, phase, 1, 1.18, taper, clip);
        ctx.fill();

        var body = ctx.createLinearGradient(nx, ny, end.x, end.y);
        body.addColorStop(0, rocketRgba(ci_r, ci_g, ci_b, alpha * 1.35));
        body.addColorStop(0.30, rocketRgba(cm_r, cm_g, cm_b, alpha * 0.90));
        body.addColorStop(0.85, rocketRgba(co_r, co_g, co_b, alpha * 0.12));
        body.addColorStop(1, rocketRgba(co_r, co_g, co_b, 0));
        ctx.fillStyle = body;
        rocketFlamePath(nz, exhaustDir, len, flameWidth, bend, phase, 1, 0.78, taper, clip);
        ctx.fill();

        var throat = ctx.createLinearGradient(nx, ny, nx + exhaustDir.x * len * 0.65, ny + exhaustDir.y * len * 0.65);
        throat.addColorStop(0, rocketRgba(1, 0.94, 0.80, alpha * 1.55));
        throat.addColorStop(0.3, rocketRgba(ci_r, ci_g, ci_b, alpha * 1.15));
        throat.addColorStop(1, rocketRgba(ci_r, ci_g, ci_b, 0));
        ctx.fillStyle = throat;
        rocketFlamePath(nz, exhaustDir, len, flameWidth, bend, phase, 0.65, 0.32, taper, clip);
        ctx.fill();

        if (_bl >= 4) {
          // v23.76 — afterburner halo: a soft additive bloom at the nozzle for
          // the top booster tiers (a clear "maxed" structural read).
          var haloR = ww * (_bl === 5 ? 3.4 : 2.6);
          var halo = ctx.createRadialGradient(nx, ny, 0, nx, ny, haloR);
          halo.addColorStop(0, 'rgba(150,200,255,' + (0.22 * rocketIntensity).toFixed(3) + ')');
          halo.addColorStop(1, 'rgba(150,200,255,0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(nx, ny, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (T.shock_enabled) {
          var nShock = Math.max(1, rocketTuneNum(T.shock_count, 3) | 0);
          if (_bl !== 3) nShock = _bl;  // tier 3 keeps today's count; tiers 1/2/4/5 -> that many
          var shockBright = rocketTuneNum(T.shock_brightness, 0.65);
          var shockSize = rocketTuneNum(T.shock_size, 2.4);
          var shockPulse = 0.88 + 0.12 * Math.sin(t * rocketTuneNum(T.shock_pulse_freq, 7) * 2 * Math.PI + n * 0.8);
          for (var d = 0; d < nShock; d++) {
            var f = 0.10 + d * 0.105;
            if (f + 0.035 >= clip || f > 0.58) break;
            var cell = rocketFlamePoint(nz, exhaustDir, len, flameWidth, bend, phase, f, 0, 1, 1, taper);
            var next = rocketFlamePoint(nz, exhaustDir, len, flameWidth, bend, phase, f + 0.01, 0, 1, 1, taper);
            var cellW = Math.min(ww * 0.40, shockSize * 0.65) * (1 - f);
            var cellL = Math.min(len * 0.036, cellW * 2.2);
            ctx.save();
            ctx.translate(cell.x, cell.y);
            ctx.rotate(Math.atan2(next.y - cell.y, next.x - cell.x));
            ctx.fillStyle = rocketRgba(ci_r, ci_g, ci_b, shockBright * shockPulse * (1 - f));
            ctx.beginPath();
            ctx.moveTo(-cellL, 0);
            ctx.quadraticCurveTo(0, -cellW * 0.45, 0, -cellW);
            ctx.quadraticCurveTo(0, -cellW * 0.45, cellL, 0);
            ctx.quadraticCurveTo(0, cellW * 0.45, 0, cellW);
            ctx.quadraticCurveTo(0, cellW * 0.45, -cellL, 0);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }

    // ----- Pass 4: sparks (additive) -----
    if (T.spark_enabled && rocketSparks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sparkAlpha = rocketTuneNum(T.spark_alpha, 0.85);
      var pR = T.spark_r, pG = T.spark_g, pB = T.spark_b;
      // v23.33 — channels constant across the pass; hoist them, vary only alpha.
      var sparkRgbaPrefix = 'rgba(' + rocketChan(pR) + ',' + rocketChan(pG) + ',' + rocketChan(pB) + ',';
      for (var k = 0; k < rocketSparks.length; k++) {
        var p = rocketSparks[k];
        if (p.x + 20 < cam.x || p.x - 20 > cam.x + screenW) continue;
        if (p.y + 20 < cam.y || p.y - 20 > cam.y + screenH) continue;
        var fs = 1 - p.age / p.life;
        var sz = p.size * (0.6 + 0.4 * fs);
        ctx.fillStyle = sparkRgbaPrefix + Math.max(0, Math.min(1, sparkAlpha * fs)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 5: dissolving ignition pressure curls -----
    if (flightRings.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var rgi = 0; rgi < flightRings.length; rgi++) {
        var ring = flightRings[rgi];
        if (ring.age < 0) continue;   // staggered ring not born yet
        if (ring.x + ring.r1 < cam.x || ring.x - ring.r1 > cam.x + screenW) continue;
        if (ring.y + ring.r1 < cam.y || ring.y - ring.r1 > cam.y + screenH) continue;
        var rgT = ring.age / ring.life;
        if (rgT > 1) rgT = 1;
        var rgE = 1 - (1 - rgT) * (1 - rgT);   // ease-out radius growth
        var rgR = ring.r0 + (ring.r1 - ring.r0) * rgE;
        var rgFade = Math.sin(Math.min(1, rgT * 5) * Math.PI * 0.5) * (1 - rgT) * (1 - rgT);
        ctx.save();
        ctx.translate(ring.x, ring.y);
        ctx.rotate(ring.angle || 0);
        ctx.lineCap = 'round';
        // Two open, flattened curls drift down the exhaust axis. Their broad
        // faint skirt dissolves first, leaving no expanding target-circle edge.
        for (var pass = 0; pass < 2; pass++) {
          ctx.lineWidth = ring.w * (pass ? 0.65 : 2.4) * (1 - 0.4 * rgT);
          ctx.strokeStyle = 'rgba(183,186,171,' + (rgFade * (pass ? 0.25 : 0.07)).toFixed(3) + ')';
          ctx.beginPath();
          ctx.ellipse(0, 0, rgR, rgR * (0.28 + rgT * 0.16), 0, Math.PI * 0.10, Math.PI * 0.91);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, rgR, rgR * (0.28 + rgT * 0.16), 0, Math.PI * 1.17, Math.PI * 1.86);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }

  }
