  /* Bath steam is a small, independent incompressible air field. Evaporated
     water feeds a reservoir, then enters the field continuously. Pressure,
     advection and thermal buoyancy form the wisps; there are no bubble sprites
     or scripted puff paths. The world smoke and liquid clocks stay untouched. */
  var bathVapor = null;
  function bathThermalVaporEmit(col, count, temperature) {
    var t = bathThermal, p = null;
    for (var i = 0; i < t.vapor.length; i++) if (t.vapor[i].col === col) { p = t.vapor[i]; break; }
    if (!p) { p = { col: col, mass: 0, heat: 0 }; t.vapor.push(p); }
    p.surfaceY = t.surface[col];
    p.mass += count * 0.01;
    p.heat += count * 0.01 * Math.max(0, temperature - 20);
  }
  function bathVaporClear() {
    bathVapor = null;
    if (typeof bathThermal !== 'undefined') bathThermal.vapor.length = 0;
  }
  function bathVaporEnsure() {
    if (bathVapor && bathVapor.owner === bathThermal) return bathVapor;
    var t = bathThermal, cell = typeof isMobile !== 'undefined' && isMobile ? 11 : 8;
    var w = Math.ceil((t.dx * 12 + 96) / cell), h = Math.ceil((t.dy * 6 + 320) / cell);
    var n = w * h;
    bathVapor = { owner: t, w: w, h: h, cell: cell, x: t.x0 - 48, y: t.y0 - 300,
      u: new Float32Array(n), v: new Float32Array(n), u0: new Float32Array(n), v0: new Float32Array(n),
      mist: new Float32Array(n), mist0: new Float32Array(n), heat: new Float32Array(n), heat0: new Float32Array(n),
      pressure: new Float32Array(n), pressure0: new Float32Array(n), div: new Float32Array(n),
      curl: new Float32Array(n), solid: new Uint8Array(n), acc: 0, awake: 0,
      emittedKg: 0, steps: 0, peak: 0, dirty: true, canvas: null, context: null, image: null,
      curve: typeof bathTubCurve === 'function' ? bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]) : null };
    return bathVapor;
  }
  function bathVaporSample(a, x, y, f) {
    x = Math.max(0, Math.min(f.w - 1.001, x)); y = Math.max(0, Math.min(f.h - 1.001, y));
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * f.w + ix;
    return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) +
      (a[i + f.w] * (1 - fx) + a[i + f.w + 1] * fx) * fy;
  }
  function bathVaporAdvect(dst, src, f, dt, decay) {
    var w = f.w, h = f.h;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x;
      dst[i] = f.solid[i] ? 0 : bathVaporSample(src, x - f.u0[i] * dt, y - f.v0[i] * dt, f) * decay;
    }
  }
  function bathVaporStep(f, dt) {
    var t = bathThermal, w = f.w, h = f.h, n = w * h;
    f.solid.fill(0);
    // The measured water surface is the air field's moving lower boundary.
    for (var x = 0; x < w; x++) {
      var worldX = f.x + (x + 0.5) * f.cell, col = Math.floor((worldX - t.x0) / t.dx);
      var boundary = Infinity;
      if (f.curve && worldX >= f.curve.x0 && worldX <= f.curve.x1)
        boundary = f.curve.y0 + f.curve.depthAt(worldX);
      if (col >= 0 && col < 12 && t.surfaceCell[col] >= 0) boundary = Math.min(boundary, t.surface[col]);
      var row = Math.max(0, Math.ceil((boundary - f.y) / f.cell));
      for (var y = row; y < h; y++) f.solid[y * w + x] = 1;
    }
    for (var p = t.vapor.length - 1; p >= 0; p--) {
      var source = t.vapor[p], c = source.col;
      if (source.mass < 1e-7) { t.vapor.splice(p, 1); continue; }
      var surfaceY = t.surfaceCell[c] >= 0 ? t.surface[c] : source.surfaceY;
      var temp = source.heat / source.mass;
      // At bathing temperatures each real liquid particle contains several
      // seconds of vapor. Release its mass smoothly instead of flashing a puff.
      var rate = 0.0004 * Math.pow(Math.max(0, temp - 8) / 12, 2);
      var releaseTime = Math.max(0.65, Math.min(30, 0.01 / Math.max(0.00001, rate)));
      var kg = source.mass * (1 - Math.exp(-dt / releaseTime));
      source.mass -= kg; source.heat = source.mass * temp; f.emittedKg += kg;
      var xa = Math.max(1, Math.floor((t.x0 + c * t.dx - f.x) / f.cell));
      var xb = Math.min(w - 2, Math.ceil((t.x0 + (c + 1) * t.dx - f.x) / f.cell));
      var sy = Math.max(1, Math.min(h - 2, Math.floor((surfaceY - f.y) / f.cell) - 1));
      var amount = kg * 1000 / Math.max(1, xb - xa + 1);
      for (var sx = xa; sx <= xb; sx++) {
        var at = sy * w + sx;
        f.mist[at] += amount;
        f.heat[at] += amount * temp * 0.12;
        f.u[at] += ((t.vx[t.surfaceCell[c]] || 0) / f.cell - f.u[at]) * Math.min(0.12, amount * 0.08);
      }
      f.awake = 14;
    }
    for (var i = 0; i < n; i++) {
      if (f.solid[i]) { f.u[i] = f.v[i] = f.mist[i] = f.heat[i] = 0; continue; }
      var airWarmth = f.heat[i] / Math.max(0.0001, f.mist[i]) / 0.12;
      var vaporShare = Math.min(1, f.mist[i] * 12);
      f.v[i] -= Math.min(120, airWarmth * 600 / 293.15) * vaporShare * dt / f.cell;
    }
    // Curl confinement restores rotational motion lost to this bounded grid.
    // It derives entirely from the current airflow, with no timed oscillation.
    for (var cy = 1; cy < h - 1; cy++) for (var cx = 1; cx < w - 1; cx++) {
      var k = cy * w + cx;
      f.curl[k] = (f.v[k + 1] - f.v[k - 1] - f.u[k + w] + f.u[k - w]) * 0.5;
    }
    for (var vy = 1; vy < h - 1; vy++) for (var vx = 1; vx < w - 1; vx++) {
      var z = vy * w + vx;
      if (f.solid[z]) continue;
      var nx = Math.abs(f.curl[z + 1]) - Math.abs(f.curl[z - 1]);
      var ny = Math.abs(f.curl[z + w]) - Math.abs(f.curl[z - w]);
      var len = Math.sqrt(nx * nx + ny * ny) + 0.0001;
      f.u[z] += ny / len * f.curl[z] * dt * 1.8;
      f.v[z] -= nx / len * f.curl[z] * dt * 1.8;
    }
    f.pressure.fill(0); f.pressure0.fill(0); f.div.fill(0);
    for (var dy = 1; dy < h - 1; dy++) for (var dx = 1; dx < w - 1; dx++) {
      var d = dy * w + dx; if (f.solid[d]) continue;
      f.div[d] = ((f.solid[d + 1] ? 0 : f.u[d + 1]) - (f.solid[d - 1] ? 0 : f.u[d - 1]) +
        (f.solid[d + w] ? 0 : f.v[d + w]) - (f.solid[d - w] ? 0 : f.v[d - w])) * 0.5;
    }
    for (var iter = 0; iter < 14; iter++) {
      var a = f.pressure, b = f.pressure0;
      for (var py = 1; py < h - 1; py++) for (var px = 1; px < w - 1; px++) {
        var q = py * w + px; if (f.solid[q]) { b[q] = 0; continue; }
        b[q] = ((f.solid[q - 1] ? a[q] : a[q - 1]) + (f.solid[q + 1] ? a[q] : a[q + 1]) +
          (f.solid[q - w] ? a[q] : a[q - w]) + (f.solid[q + w] ? a[q] : a[q + w]) - f.div[q]) * 0.25;
      }
      f.pressure = b; f.pressure0 = a;
    }
    for (var gy = 1; gy < h - 1; gy++) for (var gx = 1; gx < w - 1; gx++) {
      var g = gy * w + gx; if (f.solid[g]) continue;
      var pressure = f.pressure;
      f.u[g] -= ((f.solid[g + 1] ? pressure[g] : pressure[g + 1]) - (f.solid[g - 1] ? pressure[g] : pressure[g - 1])) * 0.5;
      f.v[g] -= ((f.solid[g + w] ? pressure[g] : pressure[g + w]) - (f.solid[g - w] ? pressure[g] : pressure[g - w])) * 0.5;
      if (f.solid[g - 1] || f.solid[g + 1]) f.u[g] = 0;
      if (f.solid[g + w]) f.v[g] = Math.min(0, f.v[g]);
    }
    f.u0.set(f.u); f.v0.set(f.v); f.mist0.set(f.mist); f.heat0.set(f.heat);
    bathVaporAdvect(f.u, f.u0, f, dt, Math.exp(-dt * 0.16));
    bathVaporAdvect(f.v, f.v0, f, dt, Math.exp(-dt * 0.16));
    bathVaporAdvect(f.mist, f.mist0, f, dt, Math.exp(-dt * 0.32));
    bathVaporAdvect(f.heat, f.heat0, f, dt, Math.exp(-dt * 0.8));
    f.awake -= dt; f.steps++; f.dirty = true;
  }
  function bathThermalVaporTick(dt) {
    if (!bathMode || !isFinite(dt) || dt <= 0) return;
    if (!bathThermal.vapor.length && (!bathVapor || bathVapor.awake <= 0)) return;
    var f = bathVaporEnsure(); f.acc = Math.min(0.1, f.acc + dt);
    while (f.acc >= 1 / 30) { bathVaporStep(f, 1 / 30); f.acc -= 1 / 30; }
  }
  function bathVaporImpulse(x, y, strength) {
    var f = bathVapor; if (!f || f.awake <= 0) return;
    for (var cy = 1; cy < f.h - 1; cy++) for (var cx = 1; cx < f.w - 1; cx++) {
      var dx = f.x + cx * f.cell - x, dy = f.y + cy * f.cell - y, r2 = dx * dx + dy * dy;
      if (r2 > 10000) continue;
      var i = cy * f.w + cx, weight = (1 - r2 / 10000) * strength / f.cell;
      f.u[i] += (dx < 0 ? -1 : 1) * 22 * weight; f.v[i] -= 8 * weight;
    }
  }
  function bathThermalDraw(c) {
    var f = bathVapor; if (!bathMode || !f || f.awake <= 0 || f.owner !== bathThermal) return;
    if (!f.canvas) {
      f.canvas = document.createElement('canvas'); f.canvas.width = f.w; f.canvas.height = f.h;
      f.context = f.canvas.getContext('2d'); f.image = f.context.createImageData(f.w, f.h);
    }
    if (f.dirty) {
      var pixels = f.image.data; f.peak = 0;
      for (var i = 0; i < f.mist.length; i++) {
        // Newly released hot vapor is clear. Cooling condenses a translucent
        // fog, and mixing with room air gradually evaporates that fog again.
        var condensate = Math.max(0, 1 - f.heat[i] / Math.max(0.0001, f.mist[i]) / 9);
        var edge = Math.min(1, (i % f.w) / 5, (f.w - 1 - i % f.w) / 5, Math.floor(i / f.w) / 6);
        var opacity = Math.min(0.72, (1 - Math.exp(-f.mist[i] * condensate * 2.4)) * edge);
        f.peak = Math.max(f.peak, opacity);
        var at = i * 4; pixels[at] = 225; pixels[at + 1] = 235; pixels[at + 2] = 234; pixels[at + 3] = Math.round(opacity * 255);
      }
      f.context.putImageData(f.image, 0, 0); f.dirty = false;
    }
    c.save(); c.imageSmoothingEnabled = true;
    c.drawImage(f.canvas, f.x, f.y, f.w * f.cell, f.h * f.cell); c.restore();
  }
  function bathThermalWarm(c) {
    // Compile the smoothed canvas upload/draw path under the loading cover.
    var tile = document.createElement('canvas'); tile.width = tile.height = 2;
    var tc = tile.getContext('2d'); tc.fillStyle = 'rgba(225,235,234,0.12)'; tc.fillRect(0, 0, 2, 2);
    c.save(); c.imageSmoothingEnabled = true; c.drawImage(tile, 0, 0, 8, 8); c.restore();
  }
