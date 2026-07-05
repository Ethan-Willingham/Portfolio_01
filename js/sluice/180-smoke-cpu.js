  /* ---- Smoke: SPH-lite fallback sim STEP/SOLVE (Stam-style grid) ---- */

  function fluidConfigure() {
    if (isMobile) {
      FLUID_W = 64; FLUID_H = 48; FLUID_CELL = 8;
      FLUID_PRESSURE_ITERS = 10;
    } else {
      FLUID_W = 96; FLUID_H = 72; FLUID_CELL = 6;
      FLUID_PRESSURE_ITERS = 18;
    }
    FLUID_DENSITY_DECAY = 0.55;       // per-second exponential decay
    FLUID_TEMP_DECAY = 2.4;           // hot ember cools fast
    FLUID_BUOYANCY = 42;              // density-driven upward accel
    FLUID_VORT_EPS = 1.8;             // vorticity confinement strength
    FLUID_AMBIENT_DAMP = 0.18;        // ambient velocity damp / sec
  }

  function fluidEnsure() {
    if (fluidReady) return;
    fluidConfigure();
    var N = FLUID_W * FLUID_H;
    fluidU = new Float32Array(N);
    fluidV = new Float32Array(N);
    fluidU0 = new Float32Array(N);
    fluidV0 = new Float32Array(N);
    fluidD = new Float32Array(N);
    fluidD0 = new Float32Array(N);
    fluidS = new Float32Array(N);
    fluidS0 = new Float32Array(N);
    fluidT = new Float32Array(N);
    fluidObst = new Uint8Array(N);
    fluidP = new Float32Array(N);
    fluidDiv = new Float32Array(N);
    fluidCurl = new Float32Array(N);
    fluidScratch = new Float32Array(N);
    fluidCanvas = document.createElement('canvas');
    fluidCanvas.width = FLUID_W;
    fluidCanvas.height = FLUID_H;
    fluidCtx = fluidCanvas.getContext('2d');
    fluidImage = fluidCtx.createImageData(FLUID_W, FLUID_H);
    fluidGridX = 0;
    fluidGridY = 0;
    fluidShedPhase = 0;
    fluidReady = true;
  }

  function smokeResetPool() {
    fluidEnsure();
    fluidU.fill(0); fluidV.fill(0);
    fluidU0.fill(0); fluidV0.fill(0);
    fluidD.fill(0); fluidD0.fill(0);
    fluidS.fill(0); fluidS0.fill(0);
    fluidT.fill(0);
    fluidObst.fill(0);
    fluidP.fill(0); fluidDiv.fill(0); fluidCurl.fill(0);
    fluidShedPhase = 0;
  }

  function playerLocalToWorld(localX, localY) {
    // v23.82 — use the single eased body tilt (computed in update) so the
    // exhaust/smoke stay glued to the rig through the rotation->upright ease.
    var angle = player.bodyTiltRender || 0;
    var cx = PLAYER_W * 0.5;
    var cy = PLAYER_H * 0.56;
    var dx = localX - cx;
    var dy = localY - cy;
    var ca = Math.cos(angle);
    var sa = Math.sin(angle);
    return {
      x: player.renderX + cx + dx * ca - dy * sa,
      y: player.renderY + cy + dx * sa + dy * ca
    };
  }

  function playerIsUnderground() {
    return player && player.y + PLAYER_H * 0.65 > SKY_ROWS * TILE + 6;
  }

  function playerHasClearedSurface() {
    return player && player.y + PLAYER_H <= SKY_ROWS * TILE + 2;
  }

  function resetFlightBank() {
    player.flightTilt = 0;
    player.flightTiltVel = 0;
    player.thrustVecX = 0;
    player.thrustVecY = -1;
  }

  function playerInMiningPose() {
    return !!drilling || player.drillGlideT > 0 || player.drillCooldownT > 0;
  }

  // World-space exhaust mouth (rear top of rig). Mirrored by player.dir
  // and rotated by the flight bank so smoke stays glued to the sprite.
  function getExhaustWorldPos() {
    // The pipe mouth lives at local x≈4. Rendering mirrors the body when
    // facing left, moving the visible mouth to PLAYER_W-4, so we compensate.
    var localX = player.dir > 0 ? 4 : (PLAYER_W - 4);
    return playerLocalToWorld(localX, 0.7);
  }

  function fluidIX(x, y) { return x + y * FLUID_W; }

  function fluidShiftField(arr, dx, dy) {
    fluidScratch.set(arr);
    var W = FLUID_W, H = FLUID_H;
    for (var y = 0; y < H; y++) {
      var sy = y + dy;
      var validY = (sy >= 0 && sy < H);
      for (var x = 0; x < W; x++) {
        var sx = x + dx;
        if (validY && sx >= 0 && sx < W) {
          arr[x + y * W] = fluidScratch[sx + sy * W];
        } else {
          arr[x + y * W] = 0;
        }
      }
    }
  }

  function fluidUpdateGridOrigin() {
    // Center grid horizontally on the rig; bias upward so smoke has
    // most of its room *above* the exhaust pipe. Uses LOGICAL position
    // (player.x/y), not renderX/Y — keeping the simulation grid anchored
    // to the deterministic snapped position preserves the smoke's
    // pre-v3.5 look. Visible spawn points (getExhaustWorldPos, booster
    // nozzles, rocket plume) still use renderX/Y so they track the sprite.
    var rigCx = player.x + PLAYER_W / 2;
    var rigCy = player.y + PLAYER_H / 2;
    var halfW = FLUID_W * FLUID_CELL / 2;
    var liftBias = FLUID_H * FLUID_CELL * 0.32;
    var targetX = rigCx - halfW;
    var targetY = rigCy - FLUID_H * FLUID_CELL + liftBias;
    var snapX = Math.round(targetX / FLUID_CELL) * FLUID_CELL;
    var snapY = Math.round(targetY / FLUID_CELL) * FLUID_CELL;
    if (snapX === fluidGridX && snapY === fluidGridY) return;
    var dx = (snapX - fluidGridX) / FLUID_CELL;
    var dy = (snapY - fluidGridY) / FLUID_CELL;
    fluidGridX = snapX; fluidGridY = snapY;
    if (Math.abs(dx) >= FLUID_W || Math.abs(dy) >= FLUID_H) {
      fluidU.fill(0); fluidV.fill(0);
      fluidD.fill(0); fluidS.fill(0); fluidT.fill(0);
      return;
    }
    fluidShiftField(fluidU, dx, dy);
    fluidShiftField(fluidV, dx, dy);
    fluidShiftField(fluidD, dx, dy);
    fluidShiftField(fluidS, dx, dy);
    fluidShiftField(fluidT, dx, dy);
  }

  function fluidBuildObstacles() {
    var W = FLUID_W, H = FLUID_H, C = FLUID_CELL;
    for (var y = 0; y < H; y++) {
      var wy = fluidGridY + y * C + C * 0.5;
      var row = Math.floor(wy / TILE);
      for (var x = 0; x < W; x++) {
        var wx = fluidGridX + x * C + C * 0.5;
        var col = Math.floor(wx / TILE);
        var t = tileAt(row, col);
        fluidObst[fluidIX(x, y)] = (t && t !== null) ? 1 : 0;
      }
    }
  }

  // Bilinear-splat a value into a field at non-integer cell coords.
  function fluidSplat(arr, fx, fy, val) {
    var W = FLUID_W, H = FLUID_H;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = x0 + 1, y1 = y0 + 1;
    var sx = fx - x0, sy = fy - y0;
    function add(ix, iy, w) {
      if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
      if (fluidObst[ix + iy * W]) return;
      arr[ix + iy * W] += val * w;
    }
    add(x0, y0, (1 - sx) * (1 - sy));
    add(x1, y0, sx * (1 - sy));
    add(x0, y1, (1 - sx) * sy);
    add(x1, y1, sx * sy);
  }

  // Splat a Gaussian disc — used for source emission so the plume has a
  // soft edge instead of a single-cell hot spot.
  function fluidSplatDisc(arr, fx, fy, radCells, val) {
    var W = FLUID_W, H = FLUID_H;
    var r2 = radCells * radCells;
    var inv = 1.4 / Math.max(0.01, r2);
    var x0 = Math.max(0, Math.floor(fx - radCells - 1));
    var x1 = Math.min(W - 1, Math.ceil(fx + radCells + 1));
    var y0 = Math.max(0, Math.floor(fy - radCells - 1));
    var y1 = Math.min(H - 1, Math.ceil(fy + radCells + 1));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dxc = x - fx, dyc = y - fy;
        var d2 = dxc * dxc + dyc * dyc;
        if (d2 > r2) continue;
        if (fluidObst[x + y * W]) continue;
        arr[x + y * W] += val * Math.exp(-d2 * inv);
      }
    }
  }

  function fluidInjectSources(dt) {
    var ex = getExhaustWorldPos();
    var fx = (ex.x - fluidGridX) / FLUID_CELL;
    var fy = (ex.y - fluidGridY) / FLUID_CELL;
    var isActive = !!drilling;
    var moving = Math.abs(player.vx) > 8 || player.thrusting;
    if (fx >= 1 && fx < FLUID_W - 1 && fy >= 1 && fy < FLUID_H - 1) {
      if (!isActive && !moving) return;
      // Density emission rate (units per second). Active = thick column,
      // moving = light puff; idle diesel smoke is intentionally disabled.
      var dRate = isActive ? 55 : 16;
      var radCells = isActive ? 1.6 : 1.1;
      fluidSplatDisc(fluidD, fx, fy, radCells, dRate * dt);
      fluidSplatDisc(fluidT, fx, fy, radCells, dRate * dt * 1.5);
      // Karman-style cross-flow at the mouth + an upward kick.
      fluidShedPhase += dt * (3.5 + Math.abs(player.vx) * 0.04);
      var sideJ = Math.sin(fluidShedPhase) * 0.6;
      var srcU = (sideJ * 30 - player.dir * 25 * (isActive ? 1 : 0.4) - player.vx * 0.25);
      var srcV = -50 * (isActive ? 1 : 0.45);
      // Apply velocity as an impulse scaled by dt so frame-rate doesn't
      // change steady-state speed at the source.
      fluidSplat(fluidU, fx, fy, srcU * dt * 8);
      fluidSplat(fluidV, fx, fy, srcV * dt * 8);
    }
  }

  function fluidAddBuoyancy(dt) {
    var N = FLUID_W * FLUID_H;
    var damp = Math.exp(-FLUID_AMBIENT_DAMP * dt);
    for (var i = 0; i < N; i++) {
      if (fluidObst[i]) { fluidU[i] = 0; fluidV[i] = 0; continue; }
      // Lift = baseline buoyancy from any density + thermal boost from T.
      // Steam (S) is light; rises quickly. Diesel (D) gets boosted by T.
      var lift = fluidD[i] * (0.55 + Math.min(1, fluidT[i]) * 0.7) +
                 fluidS[i] * 1.4;
      fluidV[i] -= lift * FLUID_BUOYANCY * dt;
      fluidU[i] *= damp;
      fluidV[i] *= damp;
    }
  }

  // Push existing smoke above the surface horizontally so the surface wind
  // visibly carries already-emitted plumes, not just freshly-shed particles.
  function fluidApplySurfaceWind(dt) {
    var w = smokeTune.wind_x;
    if (!w) return;
    var W = FLUID_W, H = FLUID_H, C = FLUID_CELL;
    var surfaceY = SKY_ROWS * TILE;
    // Target horizontal velocity that the wind tries to drive smoke toward.
    // wind_x ranges roughly -4.4..4.4 — multiplier picked so a typical gust
    // visibly carries plumes across most of the screen in a few seconds.
    var targetU = w * WIND_FALLBACK;
    // Pull rate toward target (1/sec). High enough that existing smoke
    // genuinely accelerates to wind speed, not just nudges sideways.
    var pullRate = 4.5;
    var k = 1 - Math.exp(-pullRate * dt);
    // Plus a small additive force so even cells with no current velocity
    // still get a kick (helps freshly-spawned cells start moving).
    var addForce = w * 60 * dt;
    for (var y = 0; y < H; y++) {
      var wy = fluidGridY + y * C + C * 0.5;
      if (wy >= surfaceY) break;     // grid rows go top-down; below surface = no wind
      // Altitude scale: full wind right at the surface, fading slightly as
      // we approach the top of the grid (so smoke isn't ripped to infinity).
      var altMul = 1.0;
      for (var x = 0; x < W; x++) {
        var i = x + y * W;
        if (fluidObst[i]) continue;
        // Density-aware boost: where smoke actually exists, pull harder so
        // the plume reads as being carried by the wind rather than slowly
        // drifting through still air.
        var d = fluidD[i] + fluidS[i] + fluidT[i];
        var dBoost = 1 + Math.min(2.5, d * 0.35);
        fluidU[i] += (targetU - fluidU[i]) * k * dBoost * altMul;
        fluidU[i] += addForce * altMul;
      }
    }
  }

  function fluidVorticityConfinement(dt) {
    var W = FLUID_W, H = FLUID_H;
    var i;
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        i = fluidIX(x, y);
        fluidCurl[i] = 0.5 * (
          fluidV[fluidIX(x + 1, y)] - fluidV[fluidIX(x - 1, y)] -
          fluidU[fluidIX(x, y + 1)] + fluidU[fluidIX(x, y - 1)]
        );
      }
    }
    for (var y2 = 2; y2 < H - 2; y2++) {
      for (var x2 = 2; x2 < W - 2; x2++) {
        i = fluidIX(x2, y2);
        if (fluidObst[i]) continue;
        var Nx = 0.5 * (Math.abs(fluidCurl[fluidIX(x2 + 1, y2)]) -
                        Math.abs(fluidCurl[fluidIX(x2 - 1, y2)]));
        var Ny = 0.5 * (Math.abs(fluidCurl[fluidIX(x2, y2 + 1)]) -
                        Math.abs(fluidCurl[fluidIX(x2, y2 - 1)]));
        var len = Math.sqrt(Nx * Nx + Ny * Ny) + 1e-5;
        Nx /= len; Ny /= len;
        var w = fluidCurl[i];
        fluidU[i] += FLUID_VORT_EPS * Ny * w * dt;
        fluidV[i] -= FLUID_VORT_EPS * Nx * w * dt;
      }
    }
  }

  function fluidEnforceBoundaries() {
    var W = FLUID_W, H = FLUID_H;
    var N = W * H;
    for (var i = 0; i < N; i++) {
      if (fluidObst[i]) { fluidU[i] = 0; fluidV[i] = 0; }
    }
    // Open edges: copy the inner-row velocity outward so smoke leaves
    // cleanly instead of building a wall of pressure at the boundary.
    for (var x = 0; x < W; x++) {
      fluidU[fluidIX(x, 0)] = fluidU[fluidIX(x, 1)];
      fluidV[fluidIX(x, 0)] = fluidV[fluidIX(x, 1)];
      fluidU[fluidIX(x, H - 1)] = fluidU[fluidIX(x, H - 2)];
      fluidV[fluidIX(x, H - 1)] = fluidV[fluidIX(x, H - 2)];
    }
    for (var y = 0; y < H; y++) {
      fluidU[fluidIX(0, y)] = fluidU[fluidIX(1, y)];
      fluidV[fluidIX(0, y)] = fluidV[fluidIX(1, y)];
      fluidU[fluidIX(W - 1, y)] = fluidU[fluidIX(W - 2, y)];
      fluidV[fluidIX(W - 1, y)] = fluidV[fluidIX(W - 2, y)];
    }
  }

  function fluidProject() {
    var W = FLUID_W, H = FLUID_H;
    var h = 1 / Math.max(W, H);
    var i;
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        i = fluidIX(x, y);
        fluidDiv[i] = -0.5 * h * (
          fluidU[fluidIX(x + 1, y)] - fluidU[fluidIX(x - 1, y)] +
          fluidV[fluidIX(x, y + 1)] - fluidV[fluidIX(x, y - 1)]
        );
        fluidP[i] = 0;
      }
    }
    for (var k = 0; k < FLUID_PRESSURE_ITERS; k++) {
      for (var y2 = 1; y2 < H - 1; y2++) {
        for (var x2 = 1; x2 < W - 1; x2++) {
          i = fluidIX(x2, y2);
          if (fluidObst[i]) { fluidP[i] = 0; continue; }
          var pl = fluidObst[fluidIX(x2 - 1, y2)] ? fluidP[i] : fluidP[fluidIX(x2 - 1, y2)];
          var pr = fluidObst[fluidIX(x2 + 1, y2)] ? fluidP[i] : fluidP[fluidIX(x2 + 1, y2)];
          var pt = fluidObst[fluidIX(x2, y2 - 1)] ? fluidP[i] : fluidP[fluidIX(x2, y2 - 1)];
          var pb = fluidObst[fluidIX(x2, y2 + 1)] ? fluidP[i] : fluidP[fluidIX(x2, y2 + 1)];
          fluidP[i] = (fluidDiv[i] + pl + pr + pt + pb) * 0.25;
        }
      }
    }
    for (var y3 = 1; y3 < H - 1; y3++) {
      for (var x3 = 1; x3 < W - 1; x3++) {
        i = fluidIX(x3, y3);
        if (fluidObst[i]) continue;
        fluidU[i] -= 0.5 * (fluidP[fluidIX(x3 + 1, y3)] - fluidP[fluidIX(x3 - 1, y3)]) / h;
        fluidV[i] -= 0.5 * (fluidP[fluidIX(x3, y3 + 1)] - fluidP[fluidIX(x3, y3 - 1)]) / h;
      }
    }
  }

  function fluidAdvect(target, source, u, v, dt) {
    var W = FLUID_W, H = FLUID_H;
    // Velocity is stored in px/s; one cell = FLUID_CELL px. So advecting
    // by `dt0 = dt / FLUID_CELL` cell-units lines up with semi-Lagrangian
    // backtrace in cell space.
    var dt0 = dt / FLUID_CELL;
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var i = fluidIX(x, y);
        if (fluidObst[i]) { target[i] = 0; continue; }
        var fx = x - dt0 * u[i];
        var fy = y - dt0 * v[i];
        if (fx < 0.5) fx = 0.5; else if (fx > W - 1.5) fx = W - 1.5;
        if (fy < 0.5) fy = 0.5; else if (fy > H - 1.5) fy = H - 1.5;
        var i0 = Math.floor(fx), j0 = Math.floor(fy);
        var i1 = i0 + 1, j1 = j0 + 1;
        var s1 = fx - i0, s0 = 1 - s1;
        var t1 = fy - j0, t0 = 1 - t1;
        target[i] =
          s0 * (t0 * source[fluidIX(i0, j0)] + t1 * source[fluidIX(i0, j1)]) +
          s1 * (t0 * source[fluidIX(i1, j0)] + t1 * source[fluidIX(i1, j1)]);
      }
    }
  }

  function fluidDecay(dt) {
    var k = Math.exp(-FLUID_DENSITY_DECAY * dt);
    var kt = Math.exp(-FLUID_TEMP_DECAY * dt);
    var N = FLUID_W * FLUID_H;
    for (var i = 0; i < N; i++) {
      var d = fluidD[i] * k;
      var s = fluidS[i] * k;
      var t = fluidT[i] * kt;
      fluidD[i] = d < 0.001 ? 0 : d;
      fluidS[i] = s < 0.001 ? 0 : s;
      fluidT[i] = t < 0.001 ? 0 : t;
    }
  }

