  /* ---- Conserved bath heat, copper exchange and condensed water vapor ----
     Reduced thermal grid coupled to the existing particle momentum solver.
     World motion is unchanged. Energy is kJ, time seconds, temperature C;
     one displayed litre is 100 particles. The fire solves a thin slice, so
     BATH_FIRE_SLICE_GAIN represents the rest of the furnace's depth. */
  var BATH_THERM_COLS = 12, BATH_THERM_ROWS = 6, BATH_THERM_N = 72;
  var BATH_FIRE_SLICE_GAIN = 160, BATH_COPPER_CAPACITY = 80;
  var BATH_THERM_CP = [4.18, 1.7, 3.9, 1.5, 0.8];
  var BATH_THERM_DENSITY = [1, 0.85, 1.05, 1.8, 2.7];
  var bathThermal = null, bathThermalUploadTarget = null, bathThermalUploadActive = false;
  function bathThermalReset() {
    bathThermal = { energy: new Float64Array(72), capacity: new Float64Array(72),
      count: new Float32Array(72), water: new Float32Array(72),
      vx: new Float32Array(72), vy: new Float32Array(72), temperature: new Float32Array(72),
      flowX: new Float64Array(72), flowY: new Float64Array(72),
      flowWeightX: new Float64Array(72), flowWeightY: new Float64Array(72),
      flowPressure: new Float64Array(72), flowDivergence: new Float64Array(72),
      flowOut: new Float64Array(72), flowEnergy: new Float64Array(72),
      surface: new Float32Array(12), surfaceCell: new Int16Array(12), covered: new Uint8Array(12),
      evapCredit: new Float64Array(12), steamRate: new Float32Array(12),
      gpu: new Float32Array(296), vapor: [],
      sampleT: 0, sampleWater: -1, insideLast: false, simAcc: 0, elapsed: 0,
      copperC: 20, meanC: 20, totalCapacity: 0, evaporatedKg: 0,
      inputKJ: 0, inletKJ: 0, outflowKJ: 0, airLossKJ: 0, latentKJ: 0, vaporSensibleKJ: 0, inputKW: 0, migrationC: 0,
      pendingKJ: 0, pendingInlets: [], typeCount: new Float64Array(5), x0: 0, y0: 0, dx: 1, dy: 1, enabled: false };
    bathThermal.temperature.fill(20); bathThermal.surfaceCell.fill(-1);
  }
  bathThermalReset();
  function bathThermalTemperature() { return bathThermal.meanC; }
  function bathThermalIndex(x, y) {
    var t = bathThermal, col = Math.floor((x - t.x0) / t.dx), row = Math.floor((y - t.y0) / t.dy);
    return !isFinite(col) || !isFinite(row) || col < 0 || col >= 12 || row < 0 || row >= 6 ? -1 : row * 12 + col;
  }
  function bathThermalTemperatureAt(x, y) {
    var t = bathThermal, i = bathThermalIndex(x, y);
    if (i < 0 || t.capacity[i] <= 0) return 20;
    // Cell values describe their centres. Interpolate only occupied water,
    // so the curved copper and empty air cannot introduce cold square edges.
    var gx = (x - t.x0) / t.dx - 0.5, gy = (y - t.y0) / t.dy - 0.5;
    var x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    var sum = 0, weight = 0;
    for (var oy = 0; oy < 2; oy++) for (var ox = 0; ox < 2; ox++) {
      var cx = x0 + ox, cy = y0 + oy;
      if (cx < 0 || cx >= 12 || cy < 0 || cy >= 6) continue;
      var k = cy * 12 + cx; if (t.count[k] <= 0) continue;
      var w = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
      sum += t.temperature[k] * w; weight += w;
    }
    return weight > 0 ? sum / weight : t.temperature[i];
  }
  function bathThermalSurface(x, fallback) {
    var t = bathThermal, col = Math.floor((x - t.x0) / t.dx);
    return col >= 0 && col < 12 && t.surfaceCell[col] >= 0 ? t.surface[col] : fallback;
  }
  function bathThermalOnPour(type, count, tempC, x, y) {
    if (!(type >= 0 && type < 5) || Math.floor(type) !== type || !(count > 0) || !isFinite(count) || !isFinite(tempC)) return;
    var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
    if (!isFinite(x) || x < curve.x0 || x > curve.x1 || tempC <= 20) return;
    bathThermal.pendingInlets.push({ type: type, count: count, delta: Math.min(100, tempC) - 20, expires: bathThermal.elapsed + 4 });
  }
  function bathThermalSample() {
    var t = bathThermal, F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    t.x0 = curve.x0; t.y0 = curve.y0 - 16; t.dx = (curve.x1 - curve.x0) / 12; t.dy = (curve.D + 20) / 6;
    var previousEnergy = t.pendingKJ, previousCapacity = t.totalCapacity;
    t.pendingKJ = 0;
    for (var n = 0; n < 72; n++) previousEnergy += t.energy[n];
    t.capacity.fill(0); t.count.fill(0); t.water.fill(0); t.vx.fill(0); t.vy.fill(0);
    t.surface.fill(0); t.surfaceCell.fill(-1); t.covered.fill(0);
    var cap = 0, counts = new Float64Array(5);
    function sample(type, x, y, vx, vy) {
      // Most particles belong to the outdoor world. Reject that world before
      // evaluating the curved liner or touching the thermal cell arrays.
      if (type < 0 || type >= 5 || x < t.x0 || x >= curve.x1 ||
          y < t.y0 || y >= t.y0 + t.dy * 6 || y > curve.y0 + curve.depthAt(x) - 1) return;
      var k = bathThermalIndex(x, y); if (k < 0) return;
      var c = 0.01 * BATH_THERM_DENSITY[type] * BATH_THERM_CP[type];
      t.capacity[k] += c; cap += c; counts[type]++; t.count[k]++; t.vx[k] += vx || 0; t.vy[k] += vy || 0;
      if (type !== 0) return;
      t.water[k]++;
      var col = k % 12;
      if (!t.surface[col] || y < t.surface[col]) t.surface[col] = y;
    }
    liquidToolSync();
    for (var p = 0; p < liquidCount; p++) sample(liquidType[p], liquidX[p], liquidY[p], liquidVX[p], liquidVY[p]);
    // Parked water carries the same thermal budget while the player mines.
    bathThermalParkedEach(function (data) {
      for (var k = 0; k < data.length; k += 3) sample(data[k], data[k + 1], data[k + 2], 0, 0);
    });
    // Credit warm inlet energy only when that material actually reaches
    // the basin. A hot drop on the floor cannot heat the bath remotely.
    var arrivals = new Float64Array(5), inletKJ = 0;
    for (var typ = 0; typ < 5; typ++) arrivals[typ] = Math.max(0, counts[typ] - t.typeCount[typ]);
    t.typeCount.set(counts);
    for (var inlet = 0; inlet < t.pendingInlets.length; inlet++) {
      var src = t.pendingInlets[inlet]; if (src.expires < t.elapsed) continue;
      var admitted = Math.min(src.count, arrivals[src.type]);
      inletKJ += admitted * 0.01 * BATH_THERM_DENSITY[src.type] * BATH_THERM_CP[src.type] * src.delta;
      src.count -= admitted; arrivals[src.type] -= admitted;
    }
    t.pendingInlets = t.pendingInlets.filter(function (src) { return src.count > 0 && src.expires >= t.elapsed; });
    if (t.migrationC > 0 && cap > 0) { previousEnergy = cap * (t.migrationC - 20); t.migrationC = 0; }
    // Cold inflow adds capacity without energy. Removed/spilled fluid takes
    // its mean sensible energy; moving cells remap the remaining budget.
    if (previousCapacity > 0 && cap < previousCapacity) {
      var outflow = previousEnergy * (1 - cap / previousCapacity);
      previousEnergy -= outflow; t.outflowKJ += outflow;
    }
    t.inletKJ += inletKJ;
    previousEnergy += inletKJ;
    var remapped = 0;
    for (var i = 0; i < 72; i++) {
      t.energy[i] = t.capacity[i] * Math.max(0, t.temperature[i] - 20); remapped += t.energy[i];
      if (t.count[i]) { t.vx[i] /= t.count[i]; t.vy[i] /= t.count[i]; }
    }
    for (var j = 0; j < 72; j++) t.energy[j] = remapped > 0 ? t.energy[j] * previousEnergy / remapped : cap > 0 ? previousEnergy * t.capacity[j] / cap : 0;
    t.totalCapacity = cap; t.enabled = cap > 0;
    // Require a body of surface water, not a stray airborne splash.
    for (var col = 0; col < 12; col++) for (var row = 0; row < 6; row++) {
      var idx = row * 12 + col;
      // A separate oil/mineral layer shields water beneath it from the
      // room air. Sparse airborne droplets do not count as a surface lid.
      if (t.count[idx] >= 20 && t.water[idx] < t.count[idx] * 0.5) t.covered[col] = 1;
      if (t.water[idx] < 10) continue;
      t.surfaceCell[col] = idx;
      t.surface[col] = Math.max(t.y0 + row * t.dy, Math.min(t.y0 + (row + 1) * t.dy, t.surface[col] || bathWaterline()));
      break;
    }
  }
  function bathThermalParkedEach(visit) {
    if (typeof mineralLiquidParked === 'undefined') return;
    var t = bathThermal;
    // Same 256-pixel x:y keys as mineralLiquidBin. Looking up the basin's
    // few bins avoids walking every stored spring, lake and snow region.
    for (var bx = Math.floor(t.x0 / 256); bx <= Math.floor((t.x0 + t.dx * 12) / 256); bx++) {
      for (var by = Math.floor(t.y0 / 256); by <= Math.floor((t.y0 + t.dy * 6) / 256); by++) {
        var key = bx + ':' + by, data = mineralLiquidParked[key];
        if (data && visit(data, key) === false) return;
      }
    }
  }
  function bathThermalMixPair(a, b, dt, vertical) {
    var t = bathThermal, ca = t.capacity[a], cb = t.capacity[b];
    if (ca <= 0 || cb <= 0) return;
    var ta = t.energy[a] / ca, tb = t.energy[b] / cb;
    var speed = vertical ? Math.abs(t.vy[a]) + Math.abs(t.vy[b]) : Math.abs(t.vx[a]) + Math.abs(t.vx[b]);
    // Molecular exchange plus unresolved mixing from measured fluid motion.
    // Warm water beneath cold water also mixes as a buoyant unstable column.
    var rate = 0.025 + speed * 0.5 / (vertical ? t.dy : t.dx) + (vertical ? Math.max(0, tb - ta) * 0.007 : 0);
    var q = (tb - ta) * Math.min(ca, cb) * Math.min(0.22, dt * rate);
    t.energy[a] += q; t.energy[b] -= q;
  }
  function bathThermalAdvect(dt) {
    var t = bathThermal;
    if (!bathMode || !(dt > 0)) return;
    var fx = t.flowX, fy = t.flowY, wx = t.flowWeightX, wy = t.flowWeightY;
    var pressure = t.flowPressure, divergence = t.flowDivergence;
    fx.fill(0); fy.fill(0); wx.fill(0); wy.fill(0); divergence.fill(0);
    var moving = false;
    for (var y = 0; y < 6; y++) for (var x = 0; x < 12; x++) {
      var i = y * 12 + x, ca = t.capacity[i];
      if (ca <= 0) continue;
      if (x < 11 && t.capacity[i + 1] > 0) {
        var capX = Math.min(ca, t.capacity[i + 1]);
        wx[i] = capX / (t.dx * t.dx);
        fx[i] = (t.vx[i] + t.vx[i + 1]) * 0.5 * capX / t.dx;
        divergence[i] += fx[i]; divergence[i + 1] -= fx[i];
        if (Math.abs(fx[i]) > 1e-8) moving = true;
      }
      if (y < 5 && t.capacity[i + 12] > 0) {
        var capY = Math.min(ca, t.capacity[i + 12]);
        wy[i] = capY / (t.dy * t.dy);
        fy[i] = (t.vy[i] + t.vy[i + 12]) * 0.5 * capY / t.dy;
        divergence[i] += fy[i]; divergence[i + 12] -= fy[i];
        if (Math.abs(fy[i]) > 1e-8) moving = true;
      }
    }
    if (!moving) return;
    // The sampled velocities are noisy and the thermal grid is much coarser
    // than the liquid solver. Remove their compressible component first.
    // Closed faces at air/copper then carry a circulation, not fictitious
    // inflow that concentrates heat in the last row of the basin.
    pressure.fill(0);
    for (var iteration = 0; iteration < 120; iteration++) {
      var error = 0;
      for (var n = 0; n < 72; n++) {
        if (t.capacity[n] <= 0) continue;
        var col = n % 12, row = Math.floor(n / 12), diagonal = 0, neighbors = 0;
        if (col > 0) { diagonal += wx[n - 1]; neighbors += wx[n - 1] * pressure[n - 1]; }
        if (col < 11) { diagonal += wx[n]; neighbors += wx[n] * pressure[n + 1]; }
        if (row > 0) { diagonal += wy[n - 12]; neighbors += wy[n - 12] * pressure[n - 12]; }
        if (row < 5) { diagonal += wy[n]; neighbors += wy[n] * pressure[n + 12]; }
        if (diagonal <= 0) continue;
        var next = (neighbors - divergence[n]) / diagonal;
        var change = next - pressure[n]; pressure[n] += change * 1.45;
        error = Math.max(error, Math.abs(change) * diagonal);
      }
      if (error < 1e-8) break;
    }
    t.flowOut.fill(0); t.flowEnergy.fill(0);
    for (var a = 0; a < 72; a++) {
      if (wx[a] > 0) {
        fx[a] += wx[a] * (pressure[a] - pressure[a + 1]);
        t.flowOut[fx[a] >= 0 ? a : a + 1] += Math.abs(fx[a]);
      }
      if (wy[a] > 0) {
        fy[a] += wy[a] * (pressure[a] - pressure[a + 12]);
        t.flowOut[fy[a] >= 0 ? a : a + 12] += Math.abs(fy[a]);
      }
    }
    // One shared CFL scale preserves the closed circulation while limiting
    // every donor to less than half its heat capacity in this time step.
    var step = dt;
    for (var donor = 0; donor < 72; donor++) if (t.flowOut[donor] > 0) {
      step = Math.min(step, t.capacity[donor] * 0.45 / t.flowOut[donor]);
    }
    for (var src = 0; src < 72; src++) {
      if (wx[src] > 0) {
        var fromX = fx[src] >= 0 ? src : src + 1;
        var qx = fx[src] * step * t.energy[fromX] / t.capacity[fromX];
        t.flowEnergy[src] -= qx; t.flowEnergy[src + 1] += qx;
      }
      if (wy[src] > 0) {
        var fromY = fy[src] >= 0 ? src : src + 12;
        var qy = fy[src] * step * t.energy[fromY] / t.capacity[fromY];
        t.flowEnergy[src] -= qy; t.flowEnergy[src + 12] += qy;
      }
    }
    for (var cell = 0; cell < 72; cell++) t.energy[cell] += t.flowEnergy[cell];
  }
  function bathThermalStep(dt) {
    var t = bathThermal, bed = hearthBeds.boiler;
    var reportedKW = Number(bed.thermalKW);
    var kw = (isFinite(reportedKW) ? Math.max(0, reportedKW) : 0) * BATH_FIRE_SLICE_GAIN;
    t.inputKW = kw; t.inputKJ += kw * dt;
    t.copperC += kw * dt / BATH_COPPER_CAPACITY;
    var copperLoss = (Math.max(0, t.copperC - 20) * 0.10 +
      5.67e-11 * 1.1 * (Math.pow(t.copperC + 273.15, 4) - Math.pow(293.15, 4))) * dt;
    t.copperC -= copperLoss / BATH_COPPER_CAPACITY; t.airLossKJ += copperLoss;
    var bottom = [], weight = 0;
    for (var col = 0; col < 12; col++) for (var row = 5; row >= 0; row--) {
      var i = row * 12 + col; if (t.capacity[i] <= 0) continue;
      var w = 0.45 + 0.55 * Math.sin((col + 0.5) / 12 * Math.PI);
      bottom.push([i, w]); weight += w; break;
    }
    for (var b = 0; b < bottom.length; b++) {
      var cell = bottom[b][0], capacity = t.capacity[cell], waterC = 20 + t.energy[cell] / capacity;
      var exchange = (t.copperC - waterC) * 6 * bottom[b][1] / weight * dt;
      // Exact equilibrium bound prohibits an exchange from reversing the
      // temperature difference, including very small or nearly empty baths.
      var bound = (t.copperC - waterC) / (1 / capacity + 1 / BATH_COPPER_CAPACITY);
      exchange = bound >= 0 ? Math.min(exchange, bound) : Math.max(exchange, bound);
      t.energy[cell] += exchange; t.copperC -= exchange / BATH_COPPER_CAPACITY;
    }
    bathThermalAdvect(dt);
    for (var y = 0; y < 6; y++) for (var x = 0; x < 12; x++) {
      var k = y * 12 + x;
      if (x < 11) bathThermalMixPair(k, k + 1, dt, false);
      if (y < 5) bathThermalMixPair(k, k + 12, dt, true);
    }
    t.steamRate.fill(0);
    for (var c = 0; c < 12; c++) {
      var s = t.surfaceCell[c]; if (s < 0 || t.capacity[s] <= 0) continue;
      var temperature = 20 + t.energy[s] / t.capacity[s];
      var loss = Math.min(t.energy[s], Math.max(0, temperature - 20) * 0.022 * dt);
      t.energy[s] -= loss; t.airLossKJ += loss;
      // Warm-water evaporation is limited by available sensible energy.
      // At 100 C all further energy pays latent heat instead of superheating.
      var evaporate = t.covered[c] ? 0 : 0.0004 * Math.pow(Math.max(0, temperature - 28) / 12, 2) * dt;
      var overBoil = Math.max(0, t.energy[s] - t.capacity[s] * 80);
      evaporate += overBoil / 2257;
      evaporate = Math.min(evaporate, t.energy[s] / 2257, t.water[s] * 0.01 * 0.05);
      t.evapCredit[c] = Math.min(0.25, t.evapCredit[c] + evaporate);
    }
    bathThermalEvaporate();
    var energy = 0;
    for (var n = 0; n < 72; n++) {
      // Excess lower-cell heat joins the surface energy budget so latent
      // heat, not a temperature clamp, spends it.
      var excess = Math.max(0, t.energy[n] - t.capacity[n] * 80), surface = t.surfaceCell[n % 12];
      if (excess > 0 && surface >= 0 && surface !== n) { t.energy[n] -= excess; t.energy[surface] += excess; }
    }
    for (var ti = 0; ti < 72; ti++) {
      t.temperature[ti] = t.capacity[ti] > 0 ? 20 + t.energy[ti] / t.capacity[ti] : 20;
      energy += t.energy[ti];
    }
    t.meanC = t.totalCapacity > 0 ? 20 + energy / t.totalCapacity : 20;
    bathHeat = Math.max(0, Math.min(80 / 28, (t.meanC - 20) / 28));
  }
  function bathThermalEvaporate() {
    var t = bathThermal;
    for (var col = 0; col < 12; col++) {
      var cell = t.surfaceCell[col]; if (cell < 0) { t.evapCredit[col] = 0; continue; }
      var want = Math.min(12, Math.floor(t.evapCredit[col] / 0.01));
      if (!want) continue;
      var count = 0, tempC = 20 + t.energy[cell] / Math.max(0.0001, t.capacity[cell]);
      // Debit vaporization and the removed parcel's sensible heat together.
      var perParticle = 22.57 + 0.0418 * Math.max(0, tempC - 20);
      want = Math.min(want, Math.floor(t.energy[cell] / perParticle));
      if (!want) continue;
      function takeLive() {
        var cx = t.x0 + col * t.dx, cy = t.y0 + Math.floor(cell / 12) * t.dy;
        for (var i = liquidCount - 1; i >= 0 && count < want; i--) {
          if (liquidType[i] !== 0 || liquidX[i] < cx || liquidX[i] >= cx + t.dx ||
              liquidY[i] < cy || liquidY[i] >= cy + t.dy) continue;
          removeLiquidParticle(i); count++;
        }
      }
      function takeParked() {
        bathThermalParkedEach(function (data, key) {
          for (var k = data.length - 3; k >= 0 && count < want; k -= 3) {
            if (data[k] !== 0 || bathThermalIndex(data[k + 1], data[k + 2]) !== cell) continue;
            var last = data.length - 3; data[k] = data[last]; data[k + 1] = data[last + 1]; data[k + 2] = data[last + 2]; data.length -= 3; count++;
          }
          if (!data.length) delete mineralLiquidParked[key];
          return count < want;
        });
      }
      // Offscreen bath water is normally parked. Consume it directly, so
      // each vapor event does not first scan the visible outdoor liquid.
      if (bathMode) { takeLive(); if (count < want) takeParked(); }
      else { takeParked(); if (count < want) takeLive(); }
      if (!count) continue;
      t.evapCredit[col] = Math.max(0, t.evapCredit[col] - count * 0.01);
      t.energy[cell] = Math.max(0, t.energy[cell] - count * perParticle);
      t.capacity[cell] = Math.max(0, t.capacity[cell] - count * 0.0418);
      t.totalCapacity = Math.max(0, t.totalCapacity - count * 0.0418);
      t.water[cell] = Math.max(0, t.water[cell] - count); t.count[cell] = Math.max(0, t.count[cell] - count);
      t.typeCount[0] = Math.max(0, t.typeCount[0] - count);
      t.evaporatedKg += count * 0.01; t.latentKJ += count * 22.57;
      t.vaporSensibleKJ += count * (perParticle - 22.57);
      t.steamRate[col] += count; bathWater = Math.max(0, bathWater - count);
      if (bathMode) bathThermalVaporEmit(col, count, tempC);
    }
  }
  function bathThermalTick(dt) {
    if (!isFinite(dt) || dt <= 0) return;
    if (!bathRoomReady) { bathThermalUpload(); return; }
    var t = bathThermal, bed = hearthBeds.boiler;
    t.elapsed += dt;
    var entered = bathMode && !t.insideLast; t.insideLast = bathMode;
    var pending = t.pendingInlets.length > 0 || (typeof bathPour === 'number' && bathPour > 0);
    if (typeof bathSilos !== 'undefined' && bathSilos.pending) {
      for (var p = 0; p < bathSilos.pending.length; p++) if (bathSilos.pending[p] > 0) { pending = true; break; }
    }
    // A never-filled or emptied cold bath needs no world census while mining.
    // Pending pours and legacy warmth still arm sampling on the next tick.
    if (!bathMode && !t.enabled && bathWater <= 0 && !pending &&
        !(bed.thermalKW > 0) && t.copperC <= 20 && t.meanC <= 20 && t.migrationC <= 20) {
      t.sampleT = 0; t.sampleWater = bathWater; bathThermalUpload(); return;
    }
    t.sampleT -= dt;
    if (entered || t.sampleT <= 0 || bathWater !== t.sampleWater) {
      bathThermalSample(); t.sampleT = bathMode ? 0.15 : 1;
    }
    // Mass snapshots can be less frequent outside; energy and evaporation
    // retain their 20 Hz clock and draw from the same persistent reservoirs.
    t.simAcc = Math.min(0.5, t.simAcc + Math.max(0, dt));
    while (t.simAcc >= 0.05) { bathThermalStep(0.05); t.simAcc -= 0.05; }
    t.sampleWater = bathWater;
    bathThermalUpload();
  }
  function bathThermalActive() {
    var t = bathThermal;
    if (!bathMode || !t.enabled) return false;
    for (var i = 0; i < 72; i++) if (t.count[i] > 4 && Math.abs(t.temperature[i] - t.meanC) > 1.2) return true;
    return false;
  }
  function bathThermalForce(x, y, type) {
    var t = bathThermal;
    if (!bathMode || !t.enabled || type < 0 || type >= 5) return 0;
    var i = bathThermalIndex(x, y);
    if (i < 0 || t.count[i] < 4 || y < bathThermalSurface(x, t.y0) - 4) return 0;
    // Boussinesq density difference: hot rises relative to the bulk, cool
    // sinks. Uniform warm water does not become an upward fountain.
    return Math.max(-18, Math.min(18, (bathThermalTemperatureAt(x, y) - t.meanC) * 600 * 0.00035));
  }
  function bathThermalUpload() {
    var t = bathThermal, target = liquidWGPU, active = bathMode && t.enabled;
    if (!target || !target.setBathThermal) { bathThermalUploadTarget = null; bathThermalUploadActive = false; return; }
    if (!active) {
      // Clear once on exit/reset, then leave the outdoor solver untouched.
      if (bathThermalUploadTarget === target && bathThermalUploadActive) target.setBathThermal(null);
      bathThermalUploadTarget = target; bathThermalUploadActive = false;
      return;
    }
    var data = t.gpu; data.fill(0);
    data.set([t.x0, t.y0, t.dx, t.dy, 1, t.meanC, 0, 0]);
    for (var i = 0; i < 72; i++) data.set([t.temperature[i], t.count[i], t.surface[i % 12], 0], 8 + i * 4);
    target.setBathThermal(data); bathThermalUploadTarget = target; bathThermalUploadActive = true;
  }
  function bathThermalSave() {
    var t = bathThermal;
    return { version: 1, energy: Array.from(t.energy), capacity: Array.from(t.capacity),
      temperature: Array.from(t.temperature), copperC: t.copperC, meanC: t.meanC,
      evaporatedKg: t.evaporatedKg, latentKJ: t.latentKJ, vaporSensibleKJ: t.vaporSensibleKJ, inletKJ: t.inletKJ, outflowKJ: t.outflowKJ, airLossKJ: t.airLossKJ, inputKJ: t.inputKJ };
  }
  function bathThermalRestore(data, legacyHeat) {
    bathThermalReset(); var t = bathThermal;
    if (!data || data.version !== 1 || !Array.isArray(data.energy) || data.energy.length !== 72) {
      t.migrationC = 20 + Math.max(0, Math.min(1, legacyHeat || 0)) * 28; t.meanC = t.migrationC; return;
    }
    function valid(v, max) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, v)) : 0; }
    for (var i = 0; i < 72; i++) {
      t.capacity[i] = valid(data.capacity && data.capacity[i], 5000);
      t.energy[i] = valid(data.energy[i], t.capacity[i] * 100);
      t.temperature[i] = t.capacity[i] ? 20 + t.energy[i] / t.capacity[i] : 20;
      t.totalCapacity += t.capacity[i];
    }
    t.copperC = Math.max(20, valid(data.copperC, 1000));
    var sum = t.energy.reduce(function (a, b) { return a + b; }, 0);
    t.meanC = t.totalCapacity > 0 ? 20 + sum / t.totalCapacity : 20;
    t.evaporatedKg = valid(data.evaporatedKg, 1e9); t.latentKJ = valid(data.latentKJ, 1e12);
    t.inletKJ = valid(data.inletKJ, 1e12); t.outflowKJ = valid(data.outflowKJ, 1e12);
    t.vaporSensibleKJ = valid(data.vaporSensibleKJ, 1e12);
    t.airLossKJ = valid(data.airLossKJ, 1e12); t.inputKJ = valid(data.inputKJ, 1e12);
  }
