  /* ---- Snow weather feeding the shared MLS-MPM particle solver ---- */
  // Type 5 is dry snow, origin 3 is weather. No column banks, synthetic
  // plow wedges, terrain replacement or separate rig support simulation.
  var worldSnowEnabled = false;
  var snow = { time: 0, tick: 0, credit: 0, primed: false, grains: [], parked: [],
    cells: {}, airParked: {}, airCount: 0, coverage: null, sideCredit: 0, active: 0, mass: 0, emitted: 0, melted: 0, collected: 0, temperature: -4 };

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
    snow.cells = {}; snow.airParked = {}; snow.airCount = snow.sideCredit = 0; snow.coverage = null; snow.primed = false; snow.temperature = -4;
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
    // Stored sky is cold powder too. During a warm front it thaws into the
    // existing offscreen water store, subject to the same water budget.
    var airThaw = 1 - Math.exp(-Math.max(0, snow.temperature) * 0.007 * dt);
    if (airThaw > 0) Object.keys(snow.airParked).forEach(function (key) {
      var bucket = snow.airParked[key];
      for (var a = bucket.length - 1; a >= 0; a--) {
        if (rain.waterCount + rain.parked.length / 2 >= RAIN_STORAGE_CAP) break;
        if (Math.random() >= airThaw) continue;
        rain.parked.push(bucket[a].x, bucket[a].y); snow.melted++; snow.airCount--;
        bucket[a] = bucket[bucket.length - 1]; bucket.pop();
      }
      if (!bucket.length) delete snow.airParked[key];
    });
    snow.cells = cells; snow.mass = snow.active + snow.parked.length / 4 + snow.grains.length + snow.airCount;
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
  function snowParkAir(p) {
    var key = Math.floor(p.x / 128);
    if (!snow.airParked[key]) snow.airParked[key] = [];
    snow.airParked[key].push(p); snow.airCount++;
  }
  function snowInRect(p, rect) {
    return p.x >= rect.left && p.x < rect.right && p.y >= rect.top && p.y < rect.bottom;
  }
  function snowStreamAir(rect) {
    // Keep the same objects and velocities. In particular, leaving the camera
    // must not turn a slow airborne flake into a heavy landed solver particle.
    for (var i = snow.grains.length - 1; i >= 0; i--) {
      var p = snow.grains[i];
      if (snowVisible(p.x, p.y)) continue;
      if (p.y >= SKY_ROWS * TILE - 10) {
        if (!snowStore(p.x, p.y, p.vx, p.vy)) continue;
      } else snowParkAir(p);
      snow.grains[i] = snow.grains[snow.grains.length - 1]; snow.grains.pop();
    }
    // Column buckets avoid scanning the entire world's stored snowfall.
    for (var c = Math.floor(rect.left / 128); c <= Math.floor(rect.right / 128); c++) {
      var bucket = snow.airParked[c];
      if (!bucket) continue;
      for (var j = bucket.length - 1; j >= 0 && snow.grains.length < SNOW_FLAKE_CAP; j--) {
        if (!snowInRect(bucket[j], rect)) continue;
        snow.grains.push(bucket[j]); snow.airCount--;
        bucket[j] = bucket[bucket.length - 1]; bucket.pop();
      }
      if (!bucket.length) delete snow.airParked[c];
    }
  }
  function snowSpawn(x, y) {
    if (snow.mass >= SNOW_MASS_CAP || snow.grains.length >= SNOW_FLAKE_CAP || snow.active >= snowActiveCap()) return;
    if (liquidWorldSolidAt(x, y)) return;
    var size = Math.random();
    snow.grains.push({ x: x, y: y, vx: surfaceWind.current * 28, vy: 32 + size * 42,
      size: size, phase: Math.random() * Math.PI * 2 });
    snow.mass++; snow.emitted++;
  }
  function snowFillSky(left, right, top, bottom, density) {
    if (right <= left || bottom <= top || density <= 0) return;
    var rect = { left: left, right: right, top: top, bottom: bottom };
    var need = (right - left) * (bottom - top) * density;
    // Restored flakes already occupy this air. Revisiting a strip must not
    // add another full layer on top of them.
    for (var i = 0; i < snow.grains.length; i++) if (snowInRect(snow.grains[i], rect)) need--;
    need = Math.min(Math.floor(Math.max(0, need) + Math.random()), SNOW_FLAKE_CAP - snow.grains.length,
      SNOW_MASS_CAP - snow.mass);
    for (var n = 0; n < need; n++) snowSpawn(left + Math.random() * (right - left), top + Math.random() * (bottom - top));
  }
  function snowRevealSky(rect, density) {
    var old = snow.coverage;
    if (!old || !snow.primed) {
      if (!snow.primed) snowFillSky(rect.left, rect.right, rect.top, rect.bottom, density);
    } else {
      var left = Math.max(rect.left, old.left), right = Math.min(rect.right, old.right);
      if (right <= left || rect.bottom <= old.top || rect.top >= old.bottom) {
        snowFillSky(rect.left, rect.right, rect.top, rect.bottom, density);
      } else {
        // Disjoint strips of the new rectangle. The overlap (including the
        // rig's cleared wake) is never reseeded or translated with the camera.
        snowFillSky(rect.left, left, rect.top, rect.bottom, density);
        snowFillSky(right, rect.right, rect.top, rect.bottom, density);
        snowFillSky(left, right, rect.top, Math.min(rect.bottom, old.top), density);
        snowFillSky(left, right, Math.max(rect.top, old.bottom), rect.bottom, density);
      }
    }
    snow.coverage = rect;
    if (density > 0) snow.primed = true;
  }
  function updateSnow(dt) {
    updateSnowAir(dt);
    snow.time += dt; snow.temperature = snowTemperature();
    snow.tick += dt;
    if (snow.tick >= 0.12) { snowScan(snow.tick); snow.tick = 0; }
    var surf = SKY_ROWS * TILE, sky = cam.y < surf && cam.y + screenH > surf - 2000;
    var left = Math.max(3, cam.x - 160), right = Math.min(COLS * TILE - 3, cam.x + screenW + 160);
    var top = Math.max(surf - 2200, cam.y - 160), bottom = Math.min(surf - 8, cam.y + screenH + 160);
    var rect = { left: left, right: right, top: top, bottom: bottom };
    var width = Math.max(0, right - left), height = Math.max(0, bottom - top);
    snowStreamAir(rect);
    // Flux / mean fall speed gives grains per square world pixel. Reserve
    // headroom for wind, the jet wake and flakes falling down open shafts.
    var density = Math.min(SNOW_RATE / (1100 * 53), SNOW_FLAKE_CAP * 0.75 / Math.max(1, width * height)) * rain.intensity;
    snowRevealSky(rect, sky ? density : 0);
    rainCatchLakes(dt, sky, left, right);
    var rate = density * width * 53;
    snow.credit = sky && height > 0 ? Math.min(80, snow.credit + rate * dt) : 0;
    var births = Math.floor(snow.credit);
    for (var b = 0; b < births; b++) snowSpawn(left + Math.random() * width, top);
    snow.credit -= births;
    // Wind also brings snowfall through the upwind edge while standing still.
    var windX = surfaceWind.current * 35;
    snow.sideCredit = sky && height > 0 ? Math.min(80, snow.sideCredit + Math.abs(windX) * height * density * dt) : 0;
    var sideBirths = Math.floor(snow.sideCredit);
    for (var side = 0; side < sideBirths; side++) snowSpawn(windX >= 0 ? left : right - 0.01, top + Math.random() * height);
    snow.sideCredit -= sideBirths;
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
      var entrain = Math.min(1, Math.sqrt(air[0] * air[0] + air[1] * air[1]) / 80);
      p.vx += (wind + flutter + air[0] - p.vx) * (1 - Math.exp(-(1.5 + 10.5 * entrain) * dt));
      p.vy += (fall + air[1] - p.vy) * (1 - Math.exp(-(2 + 10 * entrain) * dt));
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
    var pack = function (p) { return [p.x, p.y, p.vx, p.vy, 1, 0, p.size, p.phase]; };
    var airParked = [];
    Object.keys(snow.airParked).forEach(function (key) {
      snow.airParked[key].forEach(function (p) { airParked.push(pack(p)); });
    });
    return { version: 2, particles: particles, grains: snow.grains.map(pack), airParked: airParked, coverage: snow.coverage };
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
    var airParked = Array.isArray(data.airParked) ? data.airParked : [];
    for (var a = 0; a < airParked.length && snow.parked.length / 4 + snow.grains.length + snow.airCount < SNOW_MASS_CAP; a++) {
      var ap = airParked[a];
      if (!Array.isArray(ap) || ap.length !== 8 || !ap.every(Number.isFinite) ||
          !valid(ap[0], ap[1], ap[2], ap[3]) || ap[4] !== 1 || ap[5] !== 0) continue;
      snowParkAir({ x: ap[0], y: ap[1], vx: ap[2], vy: ap[3], size: Math.max(0, Math.min(1, ap[6])), phase: ap[7] });
    }
    var coverage = data.coverage;
    if (coverage && [coverage.left, coverage.right, coverage.top, coverage.bottom].every(Number.isFinite)) {
      snow.coverage = { left: coverage.left, right: coverage.right, top: coverage.top, bottom: coverage.bottom };
    }
    snow.mass = snow.parked.length / 4 + snow.grains.length + snow.airCount; snow.emitted = snow.mass; snow.primed = true;
  }
  window.__particleSnow = { stats: function () {
    var active = 0, moving = 0;
    for (var i = 0; i < liquidCount; i++) if (liquidType[i] === 5) { active++; if (Math.abs(liquidVX[i]) + Math.abs(liquidVY[i]) > 30) moving++; }
    return { enabled: worldSnowEnabled, model: 'shared-particles', active: active, parked: snow.parked.length / 4,
      mass: active + snow.parked.length / 4 + snow.grains.length + snow.airCount, airborne: snow.grains.length, parkedAirborne: snow.airCount, moving: moving,
      airflow: { active: snowAir.active, ms: snowAir.ms, peak: snowAir.peak },
      emitted: snow.emitted, melted: snow.melted, collected: snow.collected, temperature: snow.temperature };
  } };
