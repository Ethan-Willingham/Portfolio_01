  /* ---- Snow weather feeding the shared MLS-MPM particle solver ---- */
  // Type 5 is dry snow, origin 3 is weather. No column banks, synthetic
  // plow wedges, terrain replacement or separate rig support simulation.
  var worldSnowEnabled = false;
  var snow = { field: particleWeatherState(), time: 0, tick: 0, credit: 0, primed: false, grains: [], parked: [],
    cells: {}, bed: {}, support: {}, airParked: {}, airCount: 0, coverage: null, sideCredit: 0, readbackGen: 0, active: 0, mass: 0, emitted: 0, recycled: 0, melted: 0, collected: 0, temperature: -4 };

  function snowNewWorldEnabled() {
    var q = /[?&]snow=([01])(?:&|$)/.exec(window.location.search || '');
    if (q) return q[1] === '1';
    if (/[?&]rain=[01](?:&|$)/.test(window.location.search || '')) return false;
    return !!(window.SluiceOptions && window.SluiceOptions.particleSnow);
  }
  function snowReset(enabled) {
    worldSnowEnabled = enabled === true;
    snow.time = snow.tick = snow.credit = snow.active = snow.mass = 0;
    snow.emitted = snow.recycled = snow.melted = snow.collected = 0;
    snow.grains.length = snow.parked.length = 0;
    snowAirReset(); snow.field = particleWeatherState();
    snow.cells = {}; snow.bed = {}; snow.support = {}; snow.airParked = {}; snow.airCount = snow.sideCredit = snow.readbackGen = 0; snow.coverage = null; snow.primed = false; snow.temperature = -4;
  }
  function snowActiveCap() { return liquidWGPU && liquidWGPU.simActive ? SNOW_ACTIVE_CAP : SNOW_CPU_CAP; }
  function snowVisible(x, y) {
    return x > cam.x - 180 && x < cam.x + screenW + 180 && y > cam.y - 180 && y < cam.y + screenH + 180;
  }
  function snowStore(x, y, vx, vy) {
    if (snow.parked.length >= SNOW_MASS_CAP * 4) return false;
    snow.parked.push(x, y, vx || 0, vy || 0); return true;
  }
  function snowParticle(x, y, vx, vy) {
    if (!snowVisible(x, y)) return snowStore(x, y, vx, vy);
    if (snow.active >= snowActiveCap() || liquidCount >= LIQUID_MAX_PARTICLES - 4096) return snowStore(x, y, vx, vy);
    if (addLiquidParticle(5, x, y, vx, vy, RAIN_ORIGIN) < 0) return false;
    snow.active++; return true;
  }
  function snowLand(p, parked) {
    if (p.physical) return parked ? snowStore(p.x, p.y, p.vx, p.vy) : snowParticle(p.x, p.y, p.vx, p.vy);
    // Deposited material owns its mass permanently. Only excess unlanded
    // weather can return to the atmosphere when the deposition budget fills.
    if (snow.active + snow.parked.length / 4 >= SNOW_MASS_CAP - SNOW_FLAKE_CAP) {
      snow.mass--; snow.recycled++; return true;
    }
    return parked ? snowStore(p.x, p.y, p.vx, p.vy) : snowParticle(p.x, p.y, p.vx, p.vy);
  }
  function snowSeedWorld() {
    if (!worldSnowEnabled) return;
    // A thin dusting, laid at the new material's rest spacing. These are
    // ordinary solver particles, including the initially parked ones.
    var spacing = LIQUID_CELL / Math.sqrt(LIQUID_SNOW_DENSITY), base = SKY_ROWS * TILE;
    for (var x = 3; x < COLS * TILE - 3; x += spacing) {
      var tile = tileAt(SKY_ROWS, Math.floor(x / TILE));
      if (!tile || tile.type === 'foundation' || !liquidWorldSolidAt(x, base + 1)) continue;
      var layers = 2 + (wHash(Math.floor(x / 16), 0, 731) > 0.45 ? 1 : 0);
      for (var row = 0; row < layers; row++) {
        if (snowStore(x + (row % 2) * spacing * 0.5, base - 1.2 - (row + wHash(Math.floor(x / spacing), row, 733) * 0.35) * spacing, 0, 0)) {
          snow.mass++; snow.emitted++;
        }
      }
    }
  }
  function snowTemperature() {
    var day = scatDayWeight(computeSunElevation(timeOfDay));
    var cold = weatherForce >= 0 ? WEATHER_MOODS[weatherForce].pcp > 0.05 : rain.climate.phase === 2 || rain.climate.phase === 1;
    return cold || weather.pcp > 0.015 || snow.field.strength > 0.015 ? -5 + day : 1.5 + day * 3;
  }
  function snowHeat(x, y) {
    // Cold airborne powder stays snow, even beside the exhaust. Melt only
    // material at the surface or below, where water reads as local thaw.
    if (y < SKY_ROWS * TILE - 24) return 0;
    var heat = Math.max(0, snow.temperature) * 0.007;
    var tile = tileAt(Math.floor((y + 4) / TILE), Math.floor(x / TILE));
    if (tile && tile.type === 'foundation') heat += 0.24;
    var dx = Math.abs(x - player.x - PLAYER_W * 0.5), dy = y - player.y - PLAYER_H;
    if (dx < 32 && dy > -30 && dy < 20) heat += 0.015;
    if (player.thrusting && player.jetForce > 1 && !gameOver && !gameWon && dy > -6 && dy < 80 && dx < 10 + dy * 0.09) heat += 0.85;
    if ((rain.cells[rainCell(x, y)] || 0) >= 10) heat += 5;
    return heat;
  }
  function snowMeltParticle(i) {
    // Change material IN PLACE, retaining the solver's current position and
    // velocity. WAKE is an ordered GPU identity op, not a stale CPU respawn.
    if (liquidType[i] !== 5 || rain.waterCount + rain.parked.length / 2 >= RAIN_STORAGE_CAP) return false;
    liquidType[i] = 0; liquidOrigin[i] = RAIN_ORIGIN;
    liquidSleeping[i] = liquidRestFrames[i] = 0;
    if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(4, i, 0, RAIN_ORIGIN);
    else liquidOpsOverflow = true;
    liquidMutationSeq++; snow.melted++; snow.active--; rain.waterCount++;
    return true;
  }
  function snowSupported(x, y, cells, cache) {
    // Occupancy alone is not a floor. Follow each settled six-pixel column
    // down to terrain, memoizing its result for this snapshot. A lifted
    // sheet has open air underneath and must not catch more falling snow.
    var cx = (Math.floor(x / 6) + 0.5) * 6, row = Math.floor(y / 6);
    var path = [], supported = false;
    while (row * 6 < TOTAL_ROWS * TILE) {
      var key = rainCell(cx, row * 6 + 3);
      if (cache[key] !== undefined) { supported = cache[key]; break; }
      path.push(key);
      if (liquidWorldSolidAt(cx, row * 6 + 8)) { supported = true; break; }
      if ((cells[rainCell(cx, row * 6 + 9)] || 0) < 3) break;
      row++;
    }
    for (var i = 0; i < path.length; i++) cache[path[i]] = supported;
    return supported;
  }
  function snowScan(dt, maintenanceDt) {
    if (maintenanceDt === undefined) maintenanceDt = dt;
    liquidToolSync();
    // The GPU draws its current positions directly. Only hand grains to
    // CPU flight from that same solved frame, never an older mirror that
    // would visibly rewind them. CPU fallback already owns live positions.
    var gpu = liquidWGPU && liquidWGPU.simActive;
    var generation = gpu ? liquidWGPU.readbackApplyGen | 0 : 0;
    var fresh = !gpu || (generation !== snow.readbackGen && liquidWGPU.getReadbackAge() < 1 / 240);
    if (gpu && fresh) snow.readbackGen = generation;
    var cells = {}, active = 0, tops = {}, occupied = {}, support = {};
    for (var si = 0; si < liquidCount; si++) {
      if (liquidType[si] !== 5) continue;
      var bucket = rainCell(liquidX[si], liquidY[si]);
      if (liquidVX[si] * liquidVX[si] + liquidVY[si] * liquidVY[si] < 256)
        occupied[bucket] = (occupied[bucket] || 0) + 1;
      if (!snowAir.active || liquidY[si] < SKY_ROWS * TILE - 36 || liquidY[si] > SKY_ROWS * TILE + 16) continue;
      var column = Math.floor(liquidX[si] / 3);
      tops[column] = tops[column] === undefined ? liquidY[si] : Math.min(tops[column], liquidY[si]);
    }
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 5) continue;
      var x = liquidX[i], y = liquidY[i];
      if (maintenanceDt && !snowVisible(x, y) && snowStore(x, y, liquidVX[i], liquidVY[i])) { removeLiquidParticle(i); continue; }
      // A separated grain becomes light airborne powder again. Leaving it
      // in the dense liquid solver makes it accelerate like a water drop.
      // Keep its mass and position, carrying the jet's momentum into flight.
      // Let an upward-moving, loosened jet plume separate close to the
      // ground. Quiet pile edges keep their support in the dense solver.
      var air = snowAirAt(x, y);
      var disturbance = Math.abs(air[0]) + Math.abs(air[1]) + air[2];
      var scour = fresh && y <= tops[Math.floor(x / 3)] + 2.8 && air[2] > 18 &&
        Math.random() < 1 - Math.exp(-Math.min(18, (air[2] - 18) * 0.09) * dt);
      // A jet elsewhere in the world must not amplify incidental motion.
      var lofted = disturbance > 40 && liquidVY[i] < -12 && liquidDensity[i] < LIQUID_SNOW_DENSITY * 1.2;
      // Use actual bed support instead of a fixed height above the town.
      // A height gate makes dense powder collect along that same plane.
      if (fresh && (scour || lofted || !snowSupported(x, y, occupied, support)) &&
          (rain.cells[rainCell(x, y)] || 0) <= 1 &&
          !liquidPointInMiner(x, y) && !liquidWorldSolidAt(x, y + (scour ? 0 : lofted ? 4 : 8)) && snow.grains.length < SNOW_FLAKE_CAP) {
        // Sub-grid turbulence gives each released grain its own impulse,
        // rather than preserving the dense solver's smooth travelling crest.
        var phase = Math.random() * Math.PI * 2, scatter = Math.random();
        // Include small ground-skimming hops as well as high throws. The
        // scouring channel releases the grain; it is not a levitation layer.
        var kick = scour || lofted ? (12 + scatter * scatter * 280) * Math.min(1, disturbance / 180) : 0;
        var gustVX = liquidVX[i] + Math.cos(phase) * kick * 0.65;
        if (gustVX * snowAir.trail < 0) gustVX *= 1 - Math.abs(snowAir.trail) * 0.85;
        snow.grains.push({ x: x, y: y, vx: gustVX,
          vy: (scour ? Math.min(0, liquidVY[i]) : liquidVY[i]) - kick, size: 0.3 + Math.random() * 0.7,
          phase: phase, physical: true });
        removeLiquidParticle(i); continue;
      }
      if (maintenanceDt && Math.random() < 1 - Math.exp(-snowHeat(x, y) * maintenanceDt) && snowMeltParticle(i)) continue;
      var key = rainCell(x, y); cells[key] = (cells[key] || 0) + 1; active++;
    }
    snow.active = active;
    var budget = Math.min(600, snowActiveCap() - active, LIQUID_MAX_PARTICLES - liquidCount - 4096);
    for (var j = maintenanceDt ? snow.parked.length - 4 : -1; j >= 0; j -= 4) {
      var px = snow.parked[j], py = snow.parked[j + 1], remove = false;
      if (Math.random() < 1 - Math.exp(-snowHeat(px, py) * maintenanceDt) && rain.waterCount + rain.parked.length / 2 < RAIN_STORAGE_CAP) {
        rain.parked.push(px, py); snow.melted++; remove = true;
      } else if (budget > 0 && snowVisible(px, py) && !liquidWorldSolidAt(px, py)) {
        if (addLiquidParticle(5, px, py, snow.parked[j + 2], snow.parked[j + 3], RAIN_ORIGIN) >= 0) {
          budget--; snow.active++; remove = true;
        }
      }
      if (remove) {
        var tail = snow.parked.length - 4;
        for (var k = 0; k < 4; k++) snow.parked[j + k] = snow.parked[tail + k];
        snow.parked.length -= 4;
      }
    }
    // Atmospheric snow keeps the storm's identity. Thawing a stored sky
    // flake here created water high overhead, then rain on the return trip.
    // Only deposited or rig-contact material can thaw, including stored snow.
    snow.cells = cells; snow.bed = occupied; snow.support = {}; snow.mass = snow.active + snow.parked.length / 4 + snow.grains.length + snow.airCount;
  }
  function snowScoop(x, y, radius, ry, fromX, fromY, count) {
    // Landed snow is already extracted by the ordinary liquid tool. This
    // handles only slow weather flakes before their first solver contact.
    if (!worldSnowEnabled || count <= 0) return 0;
    var taken = 0;
    for (var i = snow.grains.length - 1; i >= 0 && taken < count; i--) {
      var p = snow.grains[i], dx = (p.x - x) / radius, dy = (p.y - y) / ry;
      if (dx * dx + dy * dy > 1 || !liquidLineClear(fromX, fromY, p.x, p.y)) continue;
      snow.grains[i] = snow.grains[snow.grains.length - 1]; snow.grains.pop(); taken++;
    }
    snow.collected += taken; snow.mass -= taken; return taken;
  }
  function snowSpawn(x, y, size, phase) {
    if (snow.mass >= SNOW_MASS_CAP || snow.grains.length >= SNOW_FLAKE_CAP || liquidWorldSolidAt(x, y)) return null;
    if (size === undefined) size = Math.random();
    var p = { x: x, y: y, vx: surfaceWind.current * 35, vy: 32 + size * 42,
      size: size, phase: phase === undefined ? Math.random() * Math.PI * 2 : phase };
    snow.grains.push(p); snow.mass++; snow.emitted++; return p;
  }
  function snowRetire(p) { snow.mass--; snow.recycled++; }
  function updateSnow(dt) {
    updateSnowAir(dt);
    snow.time += dt; snow.temperature = snowTemperature();
    snow.tick += dt;
    // Release continuously while the wake is active. Storage and thaw can
    // stay on their slower budget without emitting powder in 120ms batches.
    var maintenanceDt = snow.tick >= 0.12 ? snow.tick : 0;
    // Outside the wake, the sparse GPU mirror and maintenance clocks can
    // have different phases. Consume fresh snapshots when they arrive too.
    var freshGPU = liquidWGPU && liquidWGPU.simActive &&
      (liquidWGPU.readbackApplyGen | 0) !== snow.readbackGen && liquidWGPU.getReadbackAge() < 1 / 240;
    if (snowAir.active || maintenanceDt || freshGPU) snowScan(dt, maintenanceDt);
    if (maintenanceDt) snow.tick = 0;
    var surf = SKY_ROWS * TILE, sky = cam.y < surf, rect = particleWeatherRect();
    var left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
    var width = Math.max(0, right - left), height = Math.max(0, bottom - top);
    particleWeatherField(snow.field, rect, snow.grains, SNOW_RATE / (1100 * 53), SNOW_FLAKE_CAP,
      rain.intensity, surfaceWind.current * 35, [32, 53, 74], dt, snowSpawn, snowRetire);
    rainCatchLakes(dt, sky, left, right, snow.field.strength);
    for (var i = snow.grains.length - 1; i >= 0; i--) {
      var p = snow.grains[i], wind = surfaceWind.current * 35 + 12 * Math.sin(snow.time * 0.43 + p.y * 0.006);
      if (p.y > surf) wind *= 0.18;
      var flutter = Math.sin(snow.time * (1.4 + p.size) + p.phase) * (13 + p.size * 16);
      var fall = 32 + p.size * 42 + Math.sin(snow.time * 1.7 + p.phase) * 9;
      var air = snowAirAt(p.x, p.y);
      // Flakes settle RELATIVE to the air. Relaxing toward raw jet velocity
      // cancels their fall even in a weak crosswind, exposing the MAC box as
      // a shelf of stalled snow. Add the jet disturbance to the ambient drift
      // and settling speed; only a real updraft can hold a flake aloft.
      // Surface scouring only breaks contact with the bed. Applying it to
      // already-free flakes makes an invisible shelf above the terrain.
      var liftVY = air[1];
      var entrain = Math.min(1, Math.sqrt(air[0] * air[0] + liftVY * liftVY) / 80);
      p.vx += (wind + flutter + air[0] - p.vx) * (1 - Math.exp(-(1.5 + 10.5 * entrain) * dt));
      // A released grain carries its turbulent kick through the coarse air
      // cells instead of snapping straight back onto the common flow line.
      p.vy += (fall + liftVY - p.vy) * (1 - Math.exp(-(2 + (p.physical ? 3 : 10) * entrain) * dt));
      // Updrafts can throw powder upward, but descending grains never hang
      // in a slow settling phase. Use the same size/phase fall as sky snow.
      if (p.physical && p.vy >= 0) p.vy = fall + liftVY < 0 ? fall + liftVY : Math.max(fall, p.vy);
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 2));
      var remove = false;
      for (var step = 0; step < steps; step++) {
        var nx = p.x + p.vx * dt / steps, ny = p.y + p.vy * dt / steps;
        var key = rainCell(nx, ny + 2);
        var contact = liquidWorldSolidAt(nx, ny + 2) || liquidPointInMiner(nx, ny) ||
          ((!p.physical || p.vy >= 0) && (snow.bed[key] || 0) >= 3 && snowSupported(nx, ny + 2, snow.bed, snow.support)) || (rain.cells[key] || 0) > 1;
        if (contact) { remove = snowLand(p, false); break; }
        p.x = nx; p.y = ny;
      }
      if (!remove && !snowVisible(p.x, p.y) && (p.physical || p.y > surf - 10)) {
        remove = p.physical ? snowStore(p.x, p.y, p.vx, p.vy) : snowLand(p, true);
      }
      if (p.x < 2 || p.x >= COLS * TILE - 2 || p.y >= TOTAL_ROWS * TILE) {
        p.x = Math.max(2, Math.min(COLS * TILE - 2, p.x)); p.y = Math.min(TOTAL_ROWS * TILE - 2, p.y);
        if (!remove) { p.vx = p.vy = 0; remove = snowLand(p, true); }
      }
      if (remove) { snow.grains[i] = snow.grains[snow.grains.length - 1]; snow.grains.pop(); }
    }
  }
  function snowSave() {
    if (!worldSnowEnabled) return null;
    liquidToolSync();
    var particles = snow.parked.slice();
    for (var i = 0; i < liquidCount; i++) if (liquidType[i] === 5) particles.push(liquidX[i], liquidY[i], liquidVX[i], liquidVY[i]);
    var pack = function (p) {
      var row = [p.x, p.y, p.vx, p.vy, 1, p.physical ? 1 : 0, p.size, p.phase];
      if (p.weatherKey !== undefined) row = row.concat(p.weatherKey.split(':').map(Number), p.weatherRank);
      return row;
    };
    return { version: 2, particles: particles, grains: snow.grains.map(pack), airParked: [], field: particleWeatherSave(snow.field) };
  }
  function snowRestore(data) {
    if (!worldSnowEnabled || !data) return;
    var valid = function (x, y, vx, vy) {
      return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(vx) && Number.isFinite(vy) &&
        x >= 1 && x < COLS * TILE && y >= -20000 && y < TOTAL_ROWS * TILE && Math.abs(vx) <= 1200 && Math.abs(vy) <= 1200;
    };
    var particles = Array.isArray(data.particles) ? data.particles : [];
    for (var i = 0; i + 3 < particles.length && snow.parked.length < SNOW_MASS_CAP * 4; i += 4) {
      if (valid(particles[i], particles[i + 1], particles[i + 2], particles[i + 3])) snowStore(particles[i], particles[i + 1], particles[i + 2], particles[i + 3]);
    }
    // Migrate the short-lived column saves without losing their water mass.
    var banks = Array.isArray(data.banks) ? data.banks : [], seen = {};
    for (var b = 0; b < Math.min(8192, banks.length); b++) {
      var bank = banks[b];
      if (!Array.isArray(bank) || bank.length < 4 || !bank.every(Number.isFinite) || !Number.isInteger(bank[0]) || !Number.isInteger(bank[1]) ||
          !Number.isInteger(bank[2]) || bank[2] <= 0 || bank[2] > 128 || bank[3] < 0 || bank[3] > 1) continue;
      var bx = bank[0] * 4, by = bank[1] * TILE, key = bank[0] + ':' + bank[1];
      if (seen[key] || !valid(bx + 2, by - 2, 0, 0)) continue;
      seen[key] = true;
      for (var m = 0; m < bank[2]; m++) snowStore(bx + 0.7 + (m % 3) * 1.3, by - 1.3 - Math.floor(m / 3) * 1.3, 0, 0);
    }
    var grains = Array.isArray(data.grains) ? data.grains : [];
    for (var g = 0; g < Math.min(SNOW_FLAKE_CAP + 384, grains.length); g++) {
      var p = grains[g];
      if (!Array.isArray(p) || p.length < 8 || !p.every(Number.isFinite) || !valid(p[0], p[1], p[2], p[3]) || !Number.isInteger(p[4]) || p[4] < 1 || p[4] > 12) continue;
      if (p[5] || p[4] > 1) {
        for (var n = 0; n < p[4]; n++) snowStore(p[0] + (n % 3) * 1.3, p[1] - Math.floor(n / 3) * 1.3, p[2], p[3]);
      } else if (data.field && snow.grains.length < SNOW_FLAKE_CAP && snow.parked.length / 4 + snow.grains.length < SNOW_MASS_CAP) {
        var grain = { x: p[0], y: p[1], vx: p[2], vy: p[3], size: Math.max(0, Math.min(1, p[6])), phase: p[7] };
        if (p.length === 12 && Number.isInteger(p[8]) && p[8] >= 0 && p[8] <= 2 && Number.isInteger(p[9]) && Number.isInteger(p[10]) && p[11] >= 0 && p[11] <= 1) {
          grain.weatherKey = p[8] + ':' + p[9] + ':' + p[10]; grain.weatherRank = p[11];
        }
        snow.grains.push(grain);
      }
    }
    // Old cached sky is transient weather, not deposited material. Do not
    // revive frozen strips from a previous version or another storm phase.
    snow.field = particleWeatherRestore(data.field);
    snow.time = snow.field.time;
    snow.mass = snow.parked.length / 4 + snow.grains.length + snow.airCount; snow.emitted = snow.mass; snow.primed = true;
  }
  window.__particleSnow = { stats: function () {
    var active = 0, moving = 0;
    for (var i = 0; i < liquidCount; i++) if (liquidType[i] === 5) { active++; if (Math.abs(liquidVX[i]) + Math.abs(liquidVY[i]) > 30) moving++; }
    return { enabled: worldSnowEnabled, model: 'shared-particles', active: active, parked: snow.parked.length / 4,
      mass: active + snow.parked.length / 4 + snow.grains.length + snow.airCount, airborne: snow.grains.length, parkedAirborne: snow.airCount, moving: moving,
      airflow: { active: snowAir.active, ms: snowAir.ms, peak: snowAir.peak },
      emitted: snow.emitted, recycled: snow.recycled, melted: snow.melted, collected: snow.collected, temperature: snow.temperature };
  } };
