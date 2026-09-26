  /* ---- Conserved bath heat, copper exchange and condensed water vapor ----
     Reduced thermal grid coupled to the existing particle momentum solver.
     World motion is unchanged. Energy is kJ, time seconds, temperature C;
     one displayed litre is 100 particles. The fire solves a thin slice, so
     BATH_FIRE_SLICE_GAIN represents the rest of the furnace's depth. */
  var BATH_THERM_COLS = 12, BATH_THERM_ROWS = 6, BATH_THERM_N = 72;
  var BATH_FIRE_SLICE_GAIN = 160, BATH_COPPER_CAPACITY = 80;
  var BATH_THERM_CP = [4.18, 1.7, 3.9, 1.5, 0.8];
  var BATH_THERM_DENSITY = [1, 0.85, 1.05, 1.8, 2.7];
  var bathThermal = null;
  function bathThermalReset() {
    bathThermal = { energy: new Float64Array(72), capacity: new Float64Array(72),
      count: new Float32Array(72), water: new Float32Array(72),
      vx: new Float32Array(72), vy: new Float32Array(72), temperature: new Float32Array(72),
      surface: new Float32Array(12), surfaceCell: new Int16Array(12), covered: new Uint8Array(12),
      evapCredit: new Float64Array(12), steamRate: new Float32Array(12),
      gpu: new Float32Array(296), vapor: [], bubbles: [],
      sampleT: 0, simAcc: 0, vaporAcc: 0, bubbleAcc: 0, elapsed: 0,
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
    var i = bathThermalIndex(x, y);
    return i >= 0 && bathThermal.capacity[i] > 0 ? bathThermal.temperature[i] : 20;
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
      if (type < 0 || type >= 5 || y > curve.y0 + curve.depthAt(x) - 1) return;
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
    if (typeof mineralLiquidParked !== 'undefined') Object.keys(mineralLiquidParked).forEach(function (key) {
      var data = mineralLiquidParked[key];
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
      // A hot lower cell nucleates bubbles; its excess joins the surface
      // energy budget so latent heat, not a temperature clamp, spends it.
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
      for (var i = liquidCount - 1; i >= 0 && count < want; i--) {
        if (liquidType[i] !== 0 || bathThermalIndex(liquidX[i], liquidY[i]) !== cell) continue;
        removeLiquidParticle(i); count++;
      }
      if (count < want && typeof mineralLiquidParked !== 'undefined') Object.keys(mineralLiquidParked).forEach(function (key) {
        var data = mineralLiquidParked[key];
        for (var k = data.length - 3; k >= 0 && count < want; k -= 3) {
          if (data[k] !== 0 || bathThermalIndex(data[k + 1], data[k + 2]) !== cell) continue;
          var last = data.length - 3; data[k] = data[last]; data[k + 1] = data[last + 1]; data[k + 2] = data[last + 2]; data.length -= 3; count++;
        }
        if (!data.length) delete mineralLiquidParked[key];
      });
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
    if (!bathRoomReady || !isFinite(dt) || dt <= 0) return;
    var t = bathThermal; t.elapsed += dt; t.sampleT -= dt;
    if (t.sampleT <= 0) { bathThermalSample(); t.sampleT = 0.15; }
    t.simAcc = Math.min(0.5, t.simAcc + Math.max(0, dt));
    while (t.simAcc >= 0.05) { bathThermalStep(0.05); t.simAcc -= 0.05; }
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
    return Math.max(-18, Math.min(18, (t.temperature[i] - t.meanC) * 600 * 0.00035));
  }
  function bathThermalUpload() {
    var t = bathThermal, data = t.gpu; data.fill(0);
    if (bathMode && t.enabled) {
      data.set([t.x0, t.y0, t.dx, t.dy, 1, t.meanC, 0, 0]);
      for (var i = 0; i < 72; i++) data.set([t.temperature[i], t.count[i], t.surface[i % 12], 0], 8 + i * 4);
    }
    if (liquidWGPU && liquidWGPU.setBathThermal) liquidWGPU.setBathThermal(data);
  }
  function bathThermalVaporEmit(col, count, temperature) {
    var t = bathThermal;
    var n = Math.min(9, count * 3);
    for (var i = 0; i < n && t.vapor.length < 320; i++) {
      var x = t.x0 + (col + Math.random()) * t.dx;
      t.vapor.push({ x: x, y: t.surface[col] - 2, vx: (Math.random() - 0.5) * 5,
        vy: -8 - (temperature - 20) * 0.22, age: 0, life: 3.5 + Math.random() * 2,
        r: 5 + Math.random() * 5, phase: Math.random() * 6.283,
        mass: Math.min(1.8, Math.sqrt(count / n)), temp: temperature });
      if (temperature > 94 && t.bubbles.length < 50) t.bubbles.push({ x: x,
        y: t.y0 + t.dy * 5.5, r: 1 + Math.random() * 1.8, age: 0 });
    }
  }
  function bathThermalVaporTick(dt) {
    var t = bathThermal;
    for (var i = t.vapor.length - 1; i >= 0; i--) {
      var p = t.vapor[i]; p.age += dt;
      if (p.age >= p.life) { t.vapor.splice(i, 1); continue; }
      var cooling = Math.exp(-dt * 0.7); p.temp = 20 + (p.temp - 20) * cooling;
      p.vx += (Math.sin(p.phase + p.age * 1.4) * 5 + Math.sin(t.elapsed * 0.28) * 3 - p.vx) * dt * 0.8;
      p.vy += (-8 - (p.temp - 20) * 0.16 - p.vy) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 4;
    }
    for (var j = t.bubbles.length - 1; j >= 0; j--) {
      var b = t.bubbles[j]; b.age += dt; b.y -= dt * 44; b.x += Math.sin(b.age * 7) * dt * 4;
      if (b.age > 6 || b.y <= bathThermalSurface(b.x, t.y0)) t.bubbles.splice(j, 1);
    }
  }
  function bathThermalDraw(c) {
    var t = bathThermal; if (!bathMode) return;
    c.save(); c.lineWidth = 0.7; c.strokeStyle = 'rgba(208,228,229,0.35)';
    for (var b = 0; b < t.bubbles.length; b++) {
      var bubble = t.bubbles[b]; c.beginPath(); c.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2); c.stroke();
    }
    for (var i = 0; i < t.vapor.length; i++) {
      var p = t.vapor[i];
      // Water vapor is invisible at release. Droplet fog appears as it
      // cools in the room, then thins continuously as air entrains it.
      var opacity = Math.min(1, p.age / 0.45) * Math.pow(1 - p.age / p.life, 1.5) * 0.16 * p.mass;
      if (opacity <= 0) continue;
      var g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(225,235,234,' + opacity + ')');
      g.addColorStop(0.55, 'rgba(220,233,232,' + opacity * 0.45 + ')'); g.addColorStop(1, 'rgba(220,233,232,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 1.6, Math.sin(p.phase + p.age) * 0.15, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  function bathThermalWarm(c) {
    c.save(); var g = c.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, 'rgba(225,235,234,0.1)'); g.addColorStop(1, 'rgba(220,233,232,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(4, 4, 4, 6, 0.1, 0, Math.PI * 2); c.fill(); c.restore();
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
