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
    core_jitter: 2.3,
    core_pulse_amp: 0.28,
    core_pulse_freq: 26.5,
    core_inner_r: 1.67, core_inner_g: 0.22, core_inner_b: 1.71,
    core_mid_r: 0.68,   core_mid_g: 0.89,   core_mid_b: 1.9,
    core_outer_r: 1.92,  core_outer_g: 1.94,  core_outer_b: 1.22,
    core_alpha: 0.34,
    shock_enabled: true,
    shock_count: 5,
    shock_size: 1.5,
    shock_brightness: 0.17,
    shock_pulse_freq: 60,
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
  var sideThrusterPuffs = [];

  // ----- Flight FX state (RCS blips, ignition pop, vapor cone, boom rings, landing dust) -----
  // Consumes the player.fx event counters from the flight integrator (080); the
  // counters only ever increment, so we diff them against this local snapshot.
  var FLIGHT_FLAME_SHORTEN = 0.28;   // flame length shed at full airspeed response (0..1)
  var FLIGHT_FLAME_WIDEN = 0.42;     // flame width gain at full airspeed response (0..1)
  var FLIGHT_FLAME_BEND_MAX = 0.5;   // crosswind tail push at full response, fraction of flame length
  var FLIGHT_FLAME_BEND_V0 = 0.5;    // speed01 (|v| / flight2.SOFT_CAP) where the airspeed response starts
  var FLIGHT_FLAME_BEND_V1 = 1.4;    // speed01 where the airspeed response reaches full strength
  var flightFxSeen = { sync: false, ignite: 0, boom: 0, vapor: 0, land: 0 };
  var flightRcsPuffs = [];     // tiny cool-white attitude-thruster blips
  var flightRcsLastTurn = 0;   // last player.turnDir, for start/flip edge detection
  var flightRcsCooldown = 0;   // seconds until the next RCS burst may fire (rate cap)
  var flightIgniteT = 0;       // remaining ignition-pop flame overshoot (s)
  var flightBlowoutT = 0;      // remaining post-boom flame blowout (s)
  var flightRings = [];        // expanding rings (ignition smoke + boom shock share one pool)
  var flightVapors = [];       // one-shot transonic vapor-cone discs

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
      if (rocketInJello(px, py)) return d;   // a slime stops the exhaust too -> wash + flame land ON it, not below
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

  function rocketExhaustDir() {
    if (player.rotFlightActive) {
      // Free-rotate flight (v23.70): exhaust fires opposite the thrust heading.
      var a = player.angle || 0;
      return { x: -Math.cos(a), y: -Math.sin(a) };
    }
    var angle = player.flightTilt || 0;
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
    sideThrusterPuffs.length = 0;
    rocketSparkCarry = 0;
    rocketWakeCarry = 0;
    rocketWashCarry = 0;
    rocketIntensity = 0;
    flightRcsPuffs.length = 0;
    flightRings.length = 0;
    flightVapors.length = 0;
    flightRcsLastTurn = 0;
    flightRcsCooldown = 0;
    flightIgniteT = 0;
    flightBlowoutT = 0;
    flightFxSeen.sync = false;   // re-adopt the fx counters on the next frame, no stale replays
  }

  function spawnSideThrusterPuff(dir) {
    var local = player.dir > 0 ? { x: 2.2, y: 16.2 } : { x: PLAYER_W - 2.2, y: 16.2 };
    var base = playerLocalToWorld(local.x, local.y);
    var outDir = dir || 1;
    for (var i = 0; i < 7; i++) {
      var sp = 28 + Math.random() * 42;
      var spread = (Math.random() - 0.5) * 26;
      sideThrusterPuffs.push({
        x: base.x + outDir * (Math.random() * 2.0),
        y: base.y + (Math.random() - 0.5) * 2.0,
        vx: outDir * sp + player.vx * 0.04,
        vy: spread + player.vy * 0.02,
        age: 0,
        life: 0.24 + Math.random() * 0.12,
        size: 1.2 + Math.random() * 1.7
      });
    }
    while (sideThrusterPuffs.length > 80) sideThrusterPuffs.shift();
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

  // ----- Flight FX helpers -----
  // Rotate a player-local direction into world space with the same eased body
  // tilt the exhaust attach uses, so emissions ride the rotated hull.
  function flightLocalDir(dx, dy) {
    var a = player.bodyTiltRender || 0;
    var ca = Math.cos(a);
    var sa = Math.sin(a);
    return { x: dx * ca - dy * sa, y: dx * sa + dy * ca };
  }

  // Read-only peek at the weather mood (155): precip intensity wins, otherwise
  // cloud cover stands in for humidity. Returns 1 when no signal is readable
  // so the vapor cone still shows on builds without the weather system.
  function flightHumidity01() {
    if (typeof weather !== 'undefined' && weather && isFinite(weather.pcp)) {
      var h = Math.max(weather.pcp, (weather.cov || 0) * 0.7);
      return h < 0 ? 0 : (h > 1 ? 1 : h);
    }
    return 1;
  }

  function spawnFlightRcsBurst(turn) {
    // A real attitude thruster sits on the hull side OPPOSITE the turn, near
    // the nose, and pushes the nose around the pivot; the blips puff outward
    // from that corner. Local nose corners are y near 0 (top of the hull).
    var side = -turn;
    var base = playerLocalToWorld(side < 0 ? 1.5 : PLAYER_W - 1.5, 2.5);
    var out = flightLocalDir(side, -0.2);
    var n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (var i = 0; i < n; i++) {
      var sp = 30 + Math.random() * 26;
      flightRcsPuffs.push({
        x: base.x + out.x * i * 1.5,
        y: base.y + out.y * i * 1.5,
        vx: out.x * sp + player.vx * 0.75,
        vy: out.y * sp + player.vy * 0.75,
        age: 0,
        life: 0.10 + Math.random() * 0.05,
        size: 1.5 + Math.random()
      });
    }
    while (flightRcsPuffs.length > 24) flightRcsPuffs.shift();
  }

  // One pool serves both ring looks: shock 1 = bright sonic-boom ring,
  // shock 0 = small gray ignition smoke ring. delay staggers birth (age < 0).
  function spawnFlightRing(x, y, vx, vy, r0, r1, life, w, shock, delay) {
    flightRings.push({
      x: x, y: y, vx: vx, vy: vy,
      r0: r0, r1: r1,
      age: -(delay || 0), life: life,
      w: w, shock: shock
    });
    while (flightRings.length > 12) flightRings.shift();
  }

  // Landing dust rides the existing wash pool so the wash pass ages + draws it
  // with the same dusty look; only spawn parameters differ.
  function spawnLandingDust(x, y, side, speedScale, sizeScale) {
    var T = rocketTune;
    rocketWash.push({
      x: x + side * (2 + Math.random() * 6),
      y: y - 1 + (Math.random() - 0.5) * 2,
      vx: side * (55 + Math.random() * 90) * speedScale,
      vy: (-12 - Math.random() * 26) * speedScale,
      age: 0,
      life: rocketTuneNum(T.wash_life, 0.4) * (0.7 + Math.random() * 0.5),
      size: rocketTuneNum(T.wash_size, 2.2) * sizeScale * (0.75 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
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
        flightFxSeen.boom = fx.boomN || 0;
        flightFxSeen.vapor = fx.vaporN || 0;
        flightFxSeen.land = fx.landN || 0;
        flightFxSeen.sync = true;
      }

      // RCS rotation blips: fire when the turn input starts or flips, rate
      // capped so a stick wiggle cannot spam (2-3 puffs per burst, bursts at
      // most every 0.4s, so roughly 6 puffs/s worst case).
      if (flightRcsCooldown > 0) flightRcsCooldown -= dt;
      var turn = player.rotFlightActive ? (player.turnDir || 0) : 0;
      if (turn !== 0 && turn !== flightRcsLastTurn && flightRcsCooldown <= 0) {
        spawnFlightRcsBurst(turn);
        flightRcsCooldown = 0.4;
      }
      flightRcsLastTurn = turn;

      // Ignition pop: brief core-flame overshoot + small smoke rings that
      // roll off the nozzles with the exhaust.
      if (fx.igniteN !== flightFxSeen.ignite) {
        flightFxSeen.ignite = fx.igniteN;
        flightIgniteT = 0.07;
        var nzI = rocketNozzles();
        var edI = rocketExhaustDir();
        var nRing = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (var ri = 0; ri < nRing; ri++) {
          var nzr = nzI[ri % 2];
          spawnFlightRing(nzr.x, nzr.y,
            edI.x * 26 + player.vx * 0.5, edI.y * 26 + player.vy * 0.5,
            2, 9 + ri * 3, 0.24 + ri * 0.05, 1.4, 0, ri * 0.035);
        }
      }

      // Vapor cone: a single one-shot disc perpendicular to the velocity,
      // fired near the sound barrier. Mostly rides with the rig, then fades.
      if (fx.vaporN !== flightFxSeen.vapor) {
        flightFxSeen.vapor = fx.vaporN;
        var cV = playerLocalToWorld(PLAYER_W * 0.5, PLAYER_H * 0.56);
        flightVapors.push({
          x: cV.x, y: cV.y,
          vx: player.vx * 0.9, vy: player.vy * 0.9,
          ang: Math.atan2(player.vy, player.vx),
          age: 0, life: 0.22,
          a0: 0.4 * (0.5 + 0.5 * flightHumidity01())
        });
        while (flightVapors.length > 6) flightVapors.shift();
      }

      // Sonic boom: two staggered shock rings centered on the rig, plus a
      // brief flame blowout as if the rig outran its own exhaust.
      if (fx.boomN !== flightFxSeen.boom) {
        flightFxSeen.boom = fx.boomN;
        var cB = playerLocalToWorld(PLAYER_W * 0.5, PLAYER_H * 0.56);
        spawnFlightRing(cB.x, cB.y, 0, 0, 10, 90, 0.35, 2, 1, 0);
        spawnFlightRing(cB.x, cB.y, 0, 0, 10, 68, 0.32, 2, 1, 0.06);
        flightBlowoutT = 0.08;
      }

      // Landing dust: hard hits (landVy > 420) kick a wide 10-puff fan out of
      // the feet; soft touchdowns get a small 3-puff settle.
      if (fx.landN !== flightFxSeen.land) {
        flightFxSeen.land = fx.landN;
        var feet = playerLocalToWorld(PLAYER_W * 0.5, PLAYER_H - 1);
        var lvy = fx.landVy || 0;
        if (lvy > 420) {
          var kHard = Math.min(1.8, 0.9 + lvy / 900);
          for (var li = 0; li < 10; li++) {
            spawnLandingDust(feet.x, feet.y, li % 2 ? 1 : -1, kHard, 1.6);
          }
        } else {
          for (var lj = 0; lj < 3; lj++) {
            spawnLandingDust(feet.x, feet.y, lj % 2 ? 1 : -1, 0.45, 0.9);
          }
        }
      }
    }

    if (flightIgniteT > 0) flightIgniteT -= dt;
    if (flightBlowoutT > 0) flightBlowoutT -= dt;

    // Advance the pools (forward in-place compaction, same pattern as above).
    var rcsN = flightRcsPuffs.length, rcsW = 0;
    for (var rp = 0; rp < rcsN; rp++) {
      var rpp = flightRcsPuffs[rp];
      rpp.age += dt;
      if (rpp.age > rpp.life) continue;
      rpp.vx *= Math.exp(-6.0 * dt);
      rpp.vy *= Math.exp(-6.0 * dt);
      rpp.x += rpp.vx * dt;
      rpp.y += rpp.vy * dt;
      flightRcsPuffs[rcsW++] = rpp;
    }
    flightRcsPuffs.length = rcsW;

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

    var vpN = flightVapors.length, vpW = 0;
    for (var vp = 0; vp < vpN; vp++) {
      var vap = flightVapors[vp];
      vap.age += dt;
      if (vap.age > vap.life) continue;
      vap.x += vap.vx * dt;
      vap.y += vap.vy * dt;
      flightVapors[vpW++] = vap;
    }
    flightVapors.length = vpW;
  }

  function updateRocketPlume(dt) {
    if (dt > 0.05) dt = 0.05;
    var T = rocketTune;
    if (!T || !T.enabled) {
      rocketIntensity *= Math.exp(-rocketTuneNum(T && T.ramp_down, 3.5) * dt);
      if (rocketIntensity < 0.001) rocketIntensity = 0;
    } else {
      var emitting = !!(player.thrusting && player.fuel > 0 && !gameOver && !gameWon);
      var target = emitting ? 1 : 0;
      var rate = emitting ? rocketTuneNum(T.ramp_up, 9.0) : rocketTuneNum(T.ramp_down, 3.5);
      rocketIntensity += (target - rocketIntensity) * Math.min(1, rate * dt);
    }

    // Inject rocket exhaust into the smoke fluid sim from the actual paired
    // nozzles, so smoke/liquid response starts at the rocket mouths.
    if (rocketIntensity > 0.02) {
      var nozzlesFluid = rocketNozzles();
      var exhaustDir = rocketExhaustDir();
      var thrustStr = rocketIntensity * rocketIntensity;
      var columnDepth = TILE * 24;
      var steps = 10;
      if (smokeFluidActive && typeof SmokeFluid !== 'undefined') {
        for (var ni = 0; ni < nozzlesFluid.length; ni++) {
          var nz = nozzlesFluid[ni];
          for (var si = 0; si < steps; si++) {
            var frac = si / (steps - 1);
            var wx = nz.x + exhaustDir.x * frac * columnDepth;
            var wy = nz.y + exhaustDir.y * frac * columnDepth;
            var uv = smokeFluidWorldToUV(wx, wy);
            if (!uv.inView) continue;
            var falloff = (1 - frac * 0.6) * 0.62;
            var mouthBoost = frac < 0.001 ? 1.55 : 1;
            // Cone shape: readable right at the nozzle, wider lower down.
            var rad = 0.026 + frac * frac * 0.15;
            smokeDriver.splat(uv.uvX, uv.uvY,
              (exhaustDir.x * 10 + (Math.random() - 0.5) * 0.8) * thrustStr * falloff * mouthBoost,
              -exhaustDir.y * 18.0 * thrustStr * falloff * mouthBoost,
              { r: 0, g: 0, b: 0 },
              rad);
          }
        }
      } else if (fluidU) {
        for (var ni2 = 0; ni2 < nozzlesFluid.length; ni2++) {
          var nz2 = nozzlesFluid[ni2];
          for (var si2 = 0; si2 < steps; si2++) {
            var frac2 = si2 / (steps - 1);
            var wx2 = nz2.x + exhaustDir.x * frac2 * columnDepth;
            var wy2 = nz2.y + exhaustDir.y * frac2 * columnDepth;
            var gx = (wx2 - fluidGridX) / FLUID_CELL;
            var gy = (wy2 - fluidGridY) / FLUID_CELL;
            if (gx < 1 || gx >= FLUID_W - 1 || gy < 1 || gy >= FLUID_H - 1) continue;
            var falloff2 = (1 - frac2 * 0.6) * 0.62;
            var mouthBoost2 = frac2 < 0.001 ? 1.55 : 1;
            var coneRad = 3.2 + frac2 * frac2 * 7;
            fluidSplatDisc(fluidV, gx, gy, coneRad, exhaustDir.y * 200 * thrustStr * falloff2 * mouthBoost2 * dt);
            fluidSplatDisc(fluidU, gx, gy, coneRad * 0.6, exhaustDir.x * 140 * thrustStr * falloff2 * mouthBoost2 * dt);
          }
        }
      }
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

    var puffN = sideThrusterPuffs.length, puffW = 0;
    for (var spf = 0; spf < puffN; spf++) {
      var puff = sideThrusterPuffs[spf];
      puff.age += dt;
      if (puff.age > puff.life) continue;
      puff.vx *= Math.exp(-5.2 * dt);
      puff.vy *= Math.exp(-4.4 * dt);
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      if (rocketInSolid(puff.x, puff.y)) continue;
      sideThrusterPuffs[puffW++] = puff;
    }
    sideThrusterPuffs.length = puffW;

    // Flight FX (RCS blips, ignition pop, vapor cone, boom rings, landing
    // dust) diff the player.fx counters and advance their pools here so they
    // share the plume's per-frame entry point.
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
        var grown2 = ws.size + washGrowth * ws.age;
        ctx.fillStyle = washRgbaPrefix + Math.max(0, Math.min(1, washAlpha * f2 * f2)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(ws.x, ws.y, grown2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 2b: side attitude-thruster puffs -----
    if (sideThrusterPuffs.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var pf = 0; pf < sideThrusterPuffs.length; pf++) {
        var puff = sideThrusterPuffs[pf];
        if (puff.x + 16 < cam.x || puff.x - 16 > cam.x + screenW) continue;
        if (puff.y + 16 < cam.y || puff.y - 16 > cam.y + screenH) continue;
        var pFade = 1 - puff.age / puff.life;
        var pSize = puff.size + puff.age * 9.5;
        ctx.fillStyle = 'rgba(190,195,185,' + (0.28 * pFade * pFade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(puff.x, puff.y, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 2c: RCS attitude blips (faint cool white, barely there) -----
    if (flightRcsPuffs.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var rc = 0; rc < flightRcsPuffs.length; rc++) {
        var rcp = flightRcsPuffs[rc];
        if (rcp.x + 12 < cam.x || rcp.x - 12 > cam.x + screenW) continue;
        if (rcp.y + 12 < cam.y || rcp.y - 12 > cam.y + screenH) continue;
        var rcF = 1 - rcp.age / rcp.life;
        ctx.fillStyle = 'rgba(206,216,226,' + (0.34 * rcF * rcF).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(rcp.x, rcp.y, rcp.size + rcp.age * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ----- Pass 3: core flame (additive) -----
    if (rocketIntensity > 0.02) {
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
      var taper = rocketTuneNum(T.core_width_taper, 0.18);
      var jit = rocketTuneNum(T.core_jitter, 1.6);
      var alpha = rocketTuneNum(T.core_alpha, 0.92);
      // v23.76 — booster tier shapes the exhaust. Tier 3 keeps today's live
      // rocketTune core exactly (the anchor); other tiers shift hue + size so the
      // booster tier reads at a glance.
      var _bl = upgrades.boosterLevel || 1;
      var _szf = [1, 0.82, 0.91, 1.0, 1.12, 1.26][_bl] || 1;
      len *= _szf; ww *= _szf;
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
      var ffCap = (typeof flight2 !== 'undefined' && flight2 && flight2.SOFT_CAP) ? flight2.SOFT_CAP : 400;
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
      if (flightIgniteT > 0) { len *= 1.35; ww *= 1.35; }   // ignition pop overshoot
      if (flightBlowoutT > 0) len *= 0.4;   // post-boom blowout, the rig outran its exhaust

      for (var n = 0; n < nozzles.length; n++) {
        var nz = nozzles[n];
        if (nz.x + len < cam.x || nz.x - len > cam.x + screenW) continue;
        if (nz.y - 20 > cam.y + screenH) continue;
        // Clip flame length so it never punches through solid tiles below.
        var coreLen = len;
        var impactDist = rocketFindImpactAlong(nz.x, nz.y, exhaustDir.x, exhaustDir.y, len);
        if (impactDist !== null) coreLen = Math.max(2, impactDist - 1);
        var jitter = (Math.random() - 0.5) * jit;
        var nx = nz.x + perpX * jitter;
        var ny = nz.y + perpY * jitter;
        // Relative-wind tail offsets grow roughly quadratically along the
        // flame so the root stays glued to the nozzle while the tip takes the
        // full bend. All zero below the airspeed threshold.
        var bTipX = ffBendX * coreLen, bTipY = ffBendY * coreLen;
        var b35X = bTipX * 0.12, b35Y = bTipY * 0.12;
        var b85X = bTipX * 0.72, b85Y = bTipY * 0.72;
        var endX = nx + exhaustDir.x * coreLen + bTipX;
        var endY = ny + exhaustDir.y * coreLen + bTipY;
        var midX = nx + exhaustDir.x * coreLen * 0.55 + bTipX * 0.3;
        var midY = ny + exhaustDir.y * coreLen * 0.55 + bTipY * 0.3;
        var grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, Math.max(2, coreLen * 0.6));
        grad.addColorStop(0,    rocketRgba(ci_r, ci_g, ci_b, alpha));
        grad.addColorStop(0.4,  rocketRgba(cm_r, cm_g, cm_b, alpha * 0.62));
        grad.addColorStop(1,    rocketRgba(co_r, co_g, co_b, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(nx - perpX * ww, ny - perpY * ww);
        ctx.bezierCurveTo(
          nx + exhaustDir.x * coreLen * 0.35 - perpX * ww + b35X,
          ny + exhaustDir.y * coreLen * 0.35 - perpY * ww + b35Y,
          nx + exhaustDir.x * coreLen * 0.85 - perpX * ww * taper + b85X,
          ny + exhaustDir.y * coreLen * 0.85 - perpY * ww * taper + b85Y,
          endX, endY);
        ctx.bezierCurveTo(
          nx + exhaustDir.x * coreLen * 0.85 + perpX * ww * taper + b85X,
          ny + exhaustDir.y * coreLen * 0.85 + perpY * ww * taper + b85Y,
          nx + exhaustDir.x * coreLen * 0.35 + perpX * ww + b35X,
          ny + exhaustDir.y * coreLen * 0.35 + perpY * ww + b35Y,
          nx + perpX * ww, ny + perpY * ww);
        ctx.closePath();
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
          var shockPulse = 0.7 + 0.3 * Math.sin(t * rocketTuneNum(T.shock_pulse_freq, 18) * 2 * Math.PI + n * 1.3);
          for (var d = 0; d < nShock; d++) {
            var f = (d + 1) / (nShock + 1);
            var sx = nx + exhaustDir.x * coreLen * f * 0.55;
            var sy = ny + exhaustDir.y * coreLen * f * 0.55;
            ctx.fillStyle = 'rgba(255,240,200,' + Math.max(0, Math.min(1, shockBright * shockPulse)).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(sx, sy, shockSize, 0, Math.PI * 2);
            ctx.fill();
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

    // ----- Pass 5: expanding rings (ignition smoke + sonic-boom shock) -----
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
        ctx.lineWidth = ring.w * (1 - 0.6 * rgT);   // full stroke first, thinning as it runs
        ctx.strokeStyle = ring.shock
          ? 'rgba(235,242,250,' + (0.55 * (1 - rgT)).toFixed(3) + ')'
          : 'rgba(150,150,148,' + (0.38 * (1 - rgT)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, rgR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ----- Pass 6: transonic vapor cones (one-shot discs across the flight path) -----
    if (flightVapors.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var vpi = 0; vpi < flightVapors.length; vpi++) {
        var vap = flightVapors[vpi];
        if (vap.x + 80 < cam.x || vap.x - 80 > cam.x + screenW) continue;
        if (vap.y + 80 < cam.y || vap.y - 80 > cam.y + screenH) continue;
        var vpT = vap.age / vap.life;
        if (vpT > 1) vpT = 1;
        var vpR = 15 + 9 * vpT;   // slight expansion over the fade
        var vpA = vap.a0 * (1 - vpT);
        ctx.save();
        ctx.translate(vap.x, vap.y);
        ctx.rotate(vap.ang);
        ctx.scale(1, 2.2);   // ellipse long axis perpendicular to the velocity
        var vGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, vpR);
        vGrad.addColorStop(0, 'rgba(245,250,255,' + vpA.toFixed(3) + ')');
        vGrad.addColorStop(0.75, 'rgba(245,250,255,' + (vpA * 0.55).toFixed(3) + ')');
        vGrad.addColorStop(1, 'rgba(245,250,255,0)');
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.arc(0, 0, vpR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }


