  /* Local staggered-grid air solver for snow entrainment.
     Velocity advection + pressure projection, driven by the actual nozzles.
     No snow is emitted here: this field moves the existing particle mass. */
  var snowAir = { w: 64, h: 48, cell: 8, x: 0, y: 0, active: false, life: 0,
    revision: 0, time: 0, ms: 0, peak: 0, divergenceBefore: 0, divergenceAfter: 0 };
  (function () {
    var n = snowAir.w * snowAir.h;
    ['u', 'v', 'tu', 'tv', 'pressure', 'divergence'].forEach(function (key) { snowAir[key] = new Float32Array(n); });
    snowAir.solid = new Uint8Array(n);
    snowAir.field = new Float32Array(n * 4);
  })();
  function snowAirReset() {
    snowAir.active = false; snowAir.life = snowAir.time = snowAir.peak = 0;
    snowAir.u.fill(0); snowAir.v.fill(0); snowAir.field.fill(0); snowAir.revision++;
  }
  function snowAirBilerp(a, x, y) {
    x = Math.max(0, Math.min(snowAir.w - 1.001, x)); y = Math.max(0, Math.min(snowAir.h - 1.001, y));
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * snowAir.w + ix;
    return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + snowAir.w] * (1 - fx) + a[i + snowAir.w + 1] * fx) * fy;
  }
  function snowAirShift(x, y) {
    var a = snowAir, w = a.w, h = a.h, dx = Math.round((x - a.x) / a.cell), dy = Math.round((y - a.y) / a.cell);
    if (!dx && !dy) return;
    a.tu.fill(0); a.tv.fill(0);
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      var sc = c + dx, sr = r + dy;
      if (sc < 0 || sc >= w || sr < 0 || sr >= h) continue;
      a.tu[r * w + c] = a.u[sr * w + sc]; a.tv[r * w + c] = a.v[sr * w + sc];
    }
    a.u.set(a.tu); a.v.set(a.tv); a.x = x; a.y = y;
  }
  function snowAirWalls() {
    var a = snowAir, w = a.w;
    for (var y = 1; y < a.h; y++) for (var x = 1; x < w; x++) {
      var i = y * w + x;
      if (a.solid[i] || a.solid[i - 1]) a.u[i] = 0;
      if (a.solid[i] || a.solid[i - w]) a.v[i] = 0;
    }
  }
  function snowAirProject() {
    var a = snowAir, w = a.w, h = a.h, p = a.pressure, s = a.solid, d = a.divergence;
    p.fill(0); var before = 0, after = 0, count = 0;
    snowAirWalls();
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      if (s[i]) { d[i] = 0; continue; }
      d[i] = a.u[i + 1] - a.u[i] + a.v[i + w] - a.v[i];
      before += d[i] * d[i]; count++;
    }
    // Red/black Gauss-Seidel, zero-pressure open border and zero normal
    // flow on solid faces. The Poisson stencil matches the MAC divergence.
    for (var iteration = 0; iteration < 28; iteration++) for (var parity = 0; parity < 2; parity++) {
      for (var ry = 1; ry < h - 1; ry++) for (var rx = 1 + ((ry + parity) & 1); rx < w - 1; rx += 2) {
        var j = ry * w + rx;
        if (s[j]) continue;
        var sum = 0, n = 0;
        if (!s[j - 1]) { sum += p[j - 1]; n++; }
        if (!s[j + 1]) { sum += p[j + 1]; n++; }
        if (!s[j - w]) { sum += p[j - w]; n++; }
        if (!s[j + w]) { sum += p[j + w]; n++; }
        p[j] = n ? (sum - d[j]) / n : 0;
      }
    }
    for (var fy = 1; fy < h; fy++) for (var fx = 1; fx < w; fx++) {
      var k = fy * w + fx;
      if (!s[k] && !s[k - 1]) a.u[k] -= p[k] - p[k - 1];
      if (!s[k] && !s[k - w]) a.v[k] -= p[k] - p[k - w];
    }
    for (var ay = 1; ay < h - 1; ay++) for (var ax = 1; ax < w - 1; ax++) {
      var q = ay * w + ax;
      if (s[q]) continue;
      var div = a.u[q + 1] - a.u[q] + a.v[q + w] - a.v[q]; after += div * div;
    }
    a.divergenceBefore = Math.sqrt(before / Math.max(1, count));
    a.divergenceAfter = Math.sqrt(after / Math.max(1, count));
  }
  function updateSnowAir(dt) {
    var a = snowAir;
    if (!worldSnowEnabled || bathMode) { if (a.active) snowAirReset(); return; }
    var firing = player.thrusting && rocketIntensity > 0.02 && !gameOver && !gameWon;
    if (firing) a.life = 3; else a.life = Math.max(0, a.life - dt);
    if (a.life <= 0) { if (a.active) snowAirReset(); return; }
    var start = performance.now(), w = a.w, h = a.h, cell = a.cell;
    var ox = Math.floor((player.x + PLAYER_W * 0.5 - w * cell * 0.5) / cell) * cell;
    var oy = Math.floor((player.y - 112) / cell) * cell;
    if (!a.active) { a.x = ox; a.y = oy; a.u.fill(0); a.v.fill(0); }
    else snowAirShift(ox, oy);
    a.active = true; a.time += dt;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var wx = ox + (x + 0.5) * cell, wy = oy + (y + 0.5) * cell;
      a.solid[y * w + x] = liquidWorldSolidAt(wx, wy) || liquidPointInMiner(wx, wy) ? 1 : 0;
    }
    var nozzles = firing ? rocketNozzles() : [], dir = rocketExhaustDir();
    var steps = Math.max(1, Math.ceil(Math.min(dt, 0.05) / (1 / 90))), step = Math.min(dt, 0.05) / steps;
    for (var sub = 0; sub < steps; sub++) {
      // Advect each velocity component from its own staggered face position.
      var keep = Math.exp(-0.75 * step), travel = step / cell;
      for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
        var i = r * w + c;
        var crossV = snowAirBilerp(a.v, c - 0.5, r + 0.5);
        var crossU = snowAirBilerp(a.u, c + 0.5, r - 0.5);
        a.tu[i] = snowAirBilerp(a.u, c - a.u[i] * travel, r - crossV * travel) * keep;
        a.tv[i] = snowAirBilerp(a.v, c - crossU * travel, r - a.v[i] * travel) * keep;
      }
      a.u.set(a.tu); a.v.set(a.tv);
      // Finite nozzle inlet. The pressure solve turns its downward momentum
      // into wall jets; advection carries their shear and returning eddies.
      for (var n = 0; n < nozzles.length; n++) {
        var nz = nozzles[n];
        var c0 = Math.max(1, Math.floor((nz.x - ox - 50) / cell)), c1 = Math.min(w - 2, Math.ceil((nz.x - ox + 50) / cell));
        var r0 = Math.max(1, Math.floor((nz.y - oy - 50) / cell)), r1 = Math.min(h - 2, Math.ceil((nz.y - oy + 50) / cell));
        for (var nr = r0; nr <= r1; nr++) for (var nc = c0; nc <= c1; nc++) {
          var ni = nr * w + nc;
          if (a.solid[ni]) continue;
          var dx = ox + (nc + 0.5) * cell - nz.x, dy = oy + (nr + 0.5) * cell - nz.y;
          var along = dx * dir.x + dy * dir.y, across = dx * -dir.y + dy * dir.x;
          if (along < 0 || along > 40 || !liquidLineClear(nz.x, nz.y, nz.x + dx, nz.y + dy)) continue;
          var inlet = Math.exp(-across * across / 90) * Math.pow(1 - along / 40, 2);
          var force = (1 - Math.exp(-32 * step * inlet)) * rocketIntensity;
          a.u[ni] += (dir.x * 1100 + player.vx * 0.25 - a.u[ni]) * force;
          a.v[ni] += (dir.y * 1100 + player.vy * 0.15 - a.v[ni]) * force;
        }
      }
      snowAirProject();
    }
    a.peak = 0;
    for (var by = 0; by < h; by++) for (var bx = 0; bx < w; bx++) {
      var bi = by * w + bx, f = bi * 4;
      var ux = a.solid[bi] ? 0 : (a.u[bi] + a.u[by * w + Math.min(w - 1, bx + 1)]) * 0.5;
      var vy = a.solid[bi] ? 0 : (a.v[bi] + a.v[Math.min(h - 1, by + 1) * w + bx]) * 0.5;
      // Blend the exported disturbance into ambient air over four cells.
      // The finite solve's rectangle is not a physical boundary. Exporting
      // zero at its outer samples gives CPU and GPU the same continuous edge.
      var edge = Math.max(0, Math.min(1, Math.min(bx, by, w - 1 - bx, h - 1 - by) / 4));
      edge = edge * edge * (3 - 2 * edge);
      ux *= edge; vy *= edge;
      // The 8px air grid cannot resolve grain-scale turbulent lift at the
      // ground. Strong tangential flow scours exposed powder into the wall
      // jet; the resolved eddies then carry it. Keep this entrainment speed
      // separate from the projected velocity, bounded and local to a floor.
      // No lift inside solids, under ceilings, or in still air.
      var surface = 0;
      if (!a.solid[bi]) for (var below = 1; below <= 3 && by + below < h; below++) {
        if (a.solid[bi + below * w]) { surface = (4 - below) / 3; break; }
      }
      var lift = Math.min(420, Math.max(0, Math.abs(ux) - 28) * 2.6) * surface;
      a.field[f] = ux; a.field[f + 1] = vy; a.field[f + 2] = a.solid[bi] ? 0 : 1; a.field[f + 3] = lift;
      a.peak = Math.max(a.peak, Math.sqrt(ux * ux + vy * vy));
    }
    a.revision++; a.ms = performance.now() - start;
  }
  var snowAirSample = [0, 0, 0];
  function snowAirAt(x, y) {
    var a = snowAir, out = snowAirSample; out[0] = out[1] = out[2] = 0;
    if (!a.active) return out;
    var gx = (x - a.x) / a.cell - 0.5, gy = (y - a.y) / a.cell - 0.5;
    if (gx < 0 || gy < 0 || gx >= a.w - 1 || gy >= a.h - 1) return out;
    var ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    for (var r = 0; r < 2; r++) for (var c = 0; c < 2; c++) {
      var i = ((iy + r) * a.w + ix + c) * 4, weight = (c ? fx : 1 - fx) * (r ? fy : 1 - fy);
      out[0] += a.field[i] * weight; out[1] += a.field[i + 1] * weight;
      out[2] += a.field[i + 3] * weight;
    }
    return out;
  }
  function snowAirCoupleCPU(dt) {
    if (!snowAir.active || !Number.isFinite(dt) || dt <= 0.0005) return;
    dt = Math.min(0.05, dt) * LIQUID_TIMESCALE;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidType[i] !== 5 || liquidFrozen[i]) continue;
      var air = snowAirAt(liquidX[i], liquidY[i]);
      var liftVY = air[1] - air[2];
      var speed = Math.sqrt(air[0] * air[0] + liftVY * liftVY);
      if (speed < 2) continue;
      var exposure = Math.max(0.06, Math.min(1, (4.2 - liquidDensity[i]) / 3));
      var drag = 1 - Math.exp(-22 * exposure * dt);
      liquidVX[i] += (air[0] - liquidVX[i]) * drag;
      liquidVY[i] += (liftVY - liquidVY[i]) * drag;
      liquidSleeping[i] = liquidRestFrames[i] = 0;
    }
  }
