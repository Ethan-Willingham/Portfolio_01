  /* ---- Snow weather feeding the shared MLS-MPM particle solver ---- */
  // Type 5 is dry snow, origin 3 is weather. No column banks, synthetic
  // plow wedges, terrain replacement or separate rig support simulation.
  var worldSnowEnabled = false;
  var snow = { time: 0, tick: 0, credit: 0, primed: false, grains: [], parked: [],
    cells: {}, active: 0, mass: 0, emitted: 0, melted: 0, collected: 0, temperature: -4 };

  function snowNewWorldEnabled() {
    var q = /[?&]snow=([01])(?:&|$)/.exec(window.location.search || '');
    if (q) return q[1] === '1';
    if (/[?&]rain=[01](?:&|$)/.test(window.location.search || '')) return false;
    return !!(window.SluiceOptions && window.SluiceOptions.particleSnow);
  }
  function snowReset(enabled) {
    worldSnowEnabled = enabled === true;
    snow.time = snow.tick = snow.credit = snow.active = snow.mass = 0;
    snow.emitted = snow.melted = snow.collected = 0;
    snow.grains.length = snow.parked.length = 0;
    snowAirReset();
    snow.cells = {}; snow.primed = false; snow.temperature = -4;
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
    if (snow.active >= snowActiveCap() || liquidCount >= LIQUID_MAX_PARTICLES - 4096) return false;
    if (addLiquidParticle(5, x, y, vx, vy, RAIN_ORIGIN) < 0) return false;
    snow.active++; return true;
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
    return cold ? -5 + day : 1.5 + day * 3;
  }
  function snowHeat(x, y) {
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
  function snowScan(dt) {
    liquidToolSync();
    var cells = {}, active = 0;
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 5) continue;
      var x = liquidX[i], y = liquidY[i];
      if (!snowVisible(x, y) && snowStore(x, y, liquidVX[i], liquidVY[i])) { removeLiquidParticle(i); continue; }
      if (Math.random() < 1 - Math.exp(-snowHeat(x, y) * dt) && snowMeltParticle(i)) continue;
      var key = rainCell(x, y); cells[key] = (cells[key] || 0) + 1; active++;
    }
    snow.active = active;
    var budget = Math.min(600, snowActiveCap() - active, LIQUID_MAX_PARTICLES - liquidCount - 4096);
    for (var j = snow.parked.length - 4; j >= 0; j -= 4) {
      var px = snow.parked[j], py = snow.parked[j + 1], remove = false;
      if (Math.random() < 1 - Math.exp(-snowHeat(px, py) * dt) && rain.waterCount + rain.parked.length / 2 < RAIN_STORAGE_CAP) {
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
    snow.cells = cells; snow.mass = snow.active + snow.parked.length / 4 + snow.grains.length;
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
  function snowSpawn(top, left, width, prime) {
    if (snow.mass >= SNOW_MASS_CAP || snow.grains.length >= SNOW_FLAKE_CAP || snow.active >= snowActiveCap()) return;
    var x = left + Math.random() * width;
    var y = prime ? top + Math.random() * Math.max(0, SKY_ROWS * TILE - top - 8) : top;
    if (liquidWorldSolidAt(x, y)) return;
    snow.grains.push({ x: x, y: y, vx: surfaceWind.current * 28, vy: 35 + Math.random() * 32,
      size: Math.random(), phase: Math.random() * Math.PI * 2 });
    snow.mass++; snow.emitted++;
  }
  function updateSnow(dt) {
    updateSnowAir(dt);
    snow.time += dt; snow.temperature = snowTemperature();
    snow.tick += dt;
    if (snow.tick >= 0.12) { snowScan(snow.tick); snow.tick = 0; }
    var surf = SKY_ROWS * TILE, sky = cam.y < surf && cam.y + screenH > surf - 2000;
    var left = Math.max(3, cam.x - 100), right = Math.min(COLS * TILE - 3, cam.x + screenW + 100);
    var width = Math.max(0, right - left), top = Math.max(surf - 2200, Math.min(cam.y - 18, surf - 150));
    rainCatchLakes(dt, sky, left, right);
    var rate = SNOW_RATE * Math.min(1.7, width / 1100) * rain.intensity;
    if (sky && !snow.primed && rain.intensity > 0) {
      var initial = Math.min(2100, Math.round(rate * (surf - top) / 60));
      for (var n = 0; n < initial; n++) snowSpawn(top, left, width, true);
      snow.primed = true;
    }
    snow.credit = sky && rain.intensity > 0 ? Math.min(80, snow.credit + rate * dt) : 0;
    var births = Math.min(Math.floor(snow.credit), SNOW_FLAKE_CAP - snow.grains.length);
    for (var b = 0; b < births; b++) snowSpawn(top, left, width, false);
    snow.credit -= births;
    for (var i = snow.grains.length - 1; i >= 0; i--) {
      var p = snow.grains[i], wind = surfaceWind.current * 35 + 12 * Math.sin(snow.time * 0.43 + p.y * 0.006);
      if (p.y > surf) wind *= 0.18;
      var flutter = Math.sin(snow.time * (1.4 + p.size) + p.phase) * (13 + p.size * 16);
      p.vx += (wind + flutter - p.vx) * Math.min(1, dt * 1.5);
      p.vy += (32 + p.size * 42 + Math.sin(snow.time * 1.7 + p.phase) * 9 - p.vy) * Math.min(1, dt * 2);
      var air = snowAirAt(p.x, p.y);
      if (Math.abs(air[0]) + Math.abs(air[1]) > 2) {
        var airDrag = 1 - Math.exp(-12 * dt);
        p.vx += (air[0] - p.vx) * airDrag; p.vy += (air[1] - p.vy) * airDrag;
      }
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 2));
      var remove = false;
      for (var step = 0; step < steps; step++) {
        var nx = p.x + p.vx * dt / steps, ny = p.y + p.vy * dt / steps;
        var key = rainCell(nx, ny + 2);
        var contact = liquidWorldSolidAt(nx, ny + 2) || liquidPointInMiner(nx, ny) || (snow.cells[key] || 0) > 0 || (rain.cells[key] || 0) > 1;
        if (contact) { remove = snowParticle(p.x, p.y, p.vx, p.vy); break; }
        p.x = nx; p.y = ny;
      }
      if (!remove && !snowVisible(p.x, p.y) && p.y > surf - 10) remove = snowStore(p.x, p.y, p.vx, p.vy);
      if (p.x < 2 || p.x >= COLS * TILE - 2 || p.y >= TOTAL_ROWS * TILE) {
        p.x = Math.max(2, Math.min(COLS * TILE - 2, p.x)); p.y = Math.min(TOTAL_ROWS * TILE - 2, p.y);
        if (!remove) remove = snowStore(p.x, p.y, 0, 0);
      }
      if (remove) { snow.grains[i] = snow.grains[snow.grains.length - 1]; snow.grains.pop(); }
    }
  }
  function snowSave() {
    if (!worldSnowEnabled) return null;
    liquidToolSync();
    var particles = snow.parked.slice();
    for (var i = 0; i < liquidCount; i++) if (liquidType[i] === 5) particles.push(liquidX[i], liquidY[i], liquidVX[i], liquidVY[i]);
    return { version: 2, particles: particles, grains: snow.grains.map(function (p) { return [p.x, p.y, p.vx, p.vy, 1, 0, p.size, p.phase]; }) };
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
      } else if (snow.grains.length < SNOW_FLAKE_CAP && snow.parked.length / 4 + snow.grains.length < SNOW_MASS_CAP) {
        snow.grains.push({ x: p[0], y: p[1], vx: p[2], vy: p[3], size: Math.max(0, Math.min(1, p[6])), phase: p[7] });
      }
    }
    snow.mass = snow.parked.length / 4 + snow.grains.length; snow.emitted = snow.mass; snow.primed = true;
  }
  window.__particleSnow = { stats: function () {
    var active = 0, moving = 0;
    for (var i = 0; i < liquidCount; i++) if (liquidType[i] === 5) { active++; if (Math.abs(liquidVX[i]) + Math.abs(liquidVY[i]) > 30) moving++; }
    return { enabled: worldSnowEnabled, model: 'shared-particles', active: active, parked: snow.parked.length / 4,
      mass: active + snow.parked.length / 4 + snow.grains.length, airborne: snow.grains.length, moving: moving,
      airflow: { active: snowAir.active, ms: snowAir.ms, peak: snowAir.peak },
      emitted: snow.emitted, melted: snow.melted, collected: snow.collected, temperature: snow.temperature };
  } };
