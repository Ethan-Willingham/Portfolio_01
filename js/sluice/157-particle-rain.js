  /* ---- Particle rain: a bounded, collectable water cycle ---- */
  // Airborne drops use ballistic motion, then hand ONE particle to the ordinary
  // water solver on contact. No decorative rain layer or multiplied water mass.
  // Origin 3 belongs exclusively to rain; ponds, poured water and minerals are
  // never recycled. Scooping rain transfers it into ordinary persistent water.
  var worldRainEnabled = false;
  var RAIN_ORIGIN = 3;
  var RAIN_DROP_CAP = 1800;
  var RAIN_WATER_CAP = 6000;
  var RAIN_CPU_CAP = 2400;
  var RAIN_DAMP_CAP = 256;
  var RAIN_PLOW_CAP = 96;
  var rain = { time: 0, credit: 0, scan: 0, scanDt: 0, cursor: 0, waterCount: 0,
    drops: [], impacts: [], parked: [], cells: {}, intensity: 0.8,
    plow: { x0: 0, x1: 0, y0: 0, y1: 0, freshUntil: 0, until: 0 },
    damp: [], dampCells: {}, emitted: 0, landed: 0, recycled: 0, absorbed: 0, primed: false };

  function rainNewWorldEnabled() {
    var q = /[?&]rain=([01])(?:&|$)/.exec(window.location.search || '');
    return q ? q[1] === '1' : !!(window.SluiceOptions && window.SluiceOptions.particleRain);
  }
  function rainReset(enabled) {
    worldRainEnabled = enabled === true;
    rain.time = rain.credit = rain.scan = rain.scanDt = rain.cursor = rain.waterCount = 0;
    rain.emitted = rain.landed = rain.recycled = rain.absorbed = 0;
    rain.drops.length = rain.impacts.length = rain.parked.length = rain.damp.length = 0;
    rain.dampCells = {};
    rain.plow.freshUntil = rain.plow.until = 0;
    rain.cells = {}; rain.primed = false; rain.intensity = 0.8;
    if (typeof precipParts !== 'undefined') { precipParts = null; precipActive = 0; }
    // Reset the wet mood too when making a normal world after a rain world.
    weatherSetMood(worldRainEnabled ? 4 : (weatherForce >= 0 ? weatherForce : 1), true);
  }
  function rainWeather() {
    // Slow fronts plus faster gusts avoid a perfectly uniform particle curtain.
    rain.intensity = 0.72 + 0.18 * Math.sin(rain.time * 0.071) + 0.09 * Math.sin(rain.time * 0.31);
    weather.mood = 4;
    weather.tcov = 0.97; weather.tdark = 0.61;
    weather.tpcp = rain.intensity; weather.twind = 0.62;
  }
  function rainCell(x, y) { return Math.floor(y / 6) * (Math.ceil(COLS * TILE / 6) + 1) + Math.floor(x / 6); }

  function rainUpdatePlow() {
    if (!player || !player.onGround || gameOver || gameWon || Math.abs(player.vx) < 12) return;
    var p = rain.plow, right = player.vx > 0, feet = player.y + PLAYER_H;
    // Only the advancing track gets a small pocket. Soil behind the rig and
    // beyond the bow wave keeps draining even during sustained driving.
    p.x0 = right ? player.x + PLAYER_W - 4 : player.x - 48;
    p.x1 = right ? player.x + PLAYER_W + 48 : player.x + 4;
    p.y0 = feet - 18; p.y1 = feet + 4;
    p.freshUntil = rain.time + 0.12;
    p.until = rain.time + 0.45;
  }
  function rainPlowHolds(i) {
    var p = rain.plow, x = liquidX[i], y = liquidY[i];
    if (rain.time >= p.until || x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) return false;
    // Once the rig stops, let the moving wake finish, then resume soaking.
    // Tiny solver jitter is not motion. No particle timers or extra readbacks.
    return rain.time < p.freshUntil || liquidVX[i] * liquidVX[i] + liquidVY[i] * liquidVY[i] > 144;
  }

  function rainDampEdge(r, c, face, x, y) {
    // Merge nearby absorption into a tiny face cache, never one FX per drop.
    var along = face < 2 ? x - c * TILE : y - r * TILE;
    var segment = Math.max(0, Math.min(3, Math.floor(along / 8)));
    var key = (r * COLS + c) * 16 + face * 4 + segment;
    var mark = rain.dampCells[key];
    if (!mark) {
      if (rain.damp.length >= RAIN_DAMP_CAP) return;
      mark = { key: key, r: r, c: c, face: face, segment: segment,
        born: rain.time, stamp: rain.time, strength: 0,
        shade: materialPalette('dirt', materialLayer(getLayerAt(r, c))).cool };
      rain.dampCells[key] = mark; rain.damp.push(mark);
    }
    mark.strength = Math.min(1, mark.strength * Math.max(0, 1 - (rain.time - mark.stamp) / 6) + 0.12);
    mark.stamp = rain.time;
  }
  function rainSoakAt(x, y, visible) {
    // Only the first few pixels touching a dirt face drain. Water above that
    // film still falls and flows through the real solver. Four cheap probes
    // include shaft walls; no neighbor search or extra GPU readback.
    for (var face = 0; face < 4; face++) {
      var px = x + (face === 2 ? 6 : face === 3 ? -6 : 0);
      var py = y + (face === 0 ? 6 : face === 1 ? -6 : 0);
      var r = Math.floor(py / TILE), c = Math.floor(px / TILE), t = tileAt(r, c);
      if (!t || t.type !== 'dirt' || t.pondBasin || !liquidWorldSolidAt(px, py)) continue;
      if (visible) rainDampEdge(r, c, face, x, y);
      rain.absorbed++;
      return true;
    }
    return false;
  }

  // One slow scan maintains contact occupancy and streams rain outside the
  // solver's camera window. Saved rain uses this same bounded coordinate list.
  function rainScan(dt) {
    var cells = {}, count = 0, held = 0, margin = 220;
    // Exponential removal gives the same drainage per second at any frame
    // rate. Individual subpixel particles disappear over several scans, so
    // a puddle subsides instead of an entire tile's water blinking away.
    var soakChance = 1 - Math.exp(-5.5 * (dt || 0));
    var x0 = cam.x - margin, x1 = cam.x + screenW + margin;
    var y0 = cam.y - margin, y1 = cam.y + screenH + margin;
    for (var d = rain.damp.length - 1; d >= 0; d--) {
      var mark = rain.damp[d], tile = tileAt(mark.r, mark.c);
      if (rain.time - mark.stamp < 6 && tile && tile.type === 'dirt') continue;
      delete rain.dampCells[mark.key];
      rain.damp[d] = rain.damp[rain.damp.length - 1]; rain.damp.pop();
    }
    for (var i = liquidCount - 1; i >= 0; i--) {
      var x = liquidX[i], y = liquidY[i];
      if (liquidOrigin[i] === RAIN_ORIGIN) {
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          if (rain.parked.length < RAIN_WATER_CAP * 2) rain.parked.push(x, y);
          removeLiquidParticle(i);
          continue;
        }
        // Protect enough water for a little crest, never an entire puddle.
        var plowed = held < RAIN_PLOW_CAP && rainPlowHolds(i);
        if (plowed) held++;
        if (!plowed && Math.random() < soakChance && rainSoakAt(x, y, true)) {
          removeLiquidParticle(i);
          continue;
        }
        count++;
      }
      // All liquid surfaces receive raindrops, including mineral baths.
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        var key = rainCell(x, y);
        cells[key] = (cells[key] || 0) + 1;
      }
    }
    var budget = Math.min(600, Math.max(0, LIQUID_MAX_PARTICLES - liquidCount - 4096));
    for (var j = rain.parked.length - 2; j >= 0; j -= 2) {
      var px = rain.parked[j], py = rain.parked[j + 1];
      // Parked rain drains as well, including spills left behind the camera.
      if (Math.random() < soakChance && rainSoakAt(px, py, false)) {
        rain.parked[j] = rain.parked[rain.parked.length - 2];
        rain.parked[j + 1] = rain.parked[rain.parked.length - 1];
        rain.parked.length -= 2;
        continue;
      }
      if (budget <= 0) continue;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      if (liquidWorldSolidAt(px, py)) continue;
      if (addLiquidParticle(0, px, py, 0, 0, RAIN_ORIGIN) < 0) break;
      rain.parked[j] = rain.parked[rain.parked.length - 2];
      rain.parked[j + 1] = rain.parked[rain.parked.length - 1];
      rain.parked.length -= 2; budget--; count++;
    }
    rain.cells = cells; rain.waterCount = count;
  }

  function rainRecycle(count) {
    // A finite atmospheric reservoir: reclaim offscreen rain first, then spread
    // evaporation across live rain. Never touch any other origin or material.
    var parked = Math.min(count, rain.parked.length / 2);
    rain.parked.length -= parked * 2; count -= parked; rain.recycled += parked;
    var attempts = liquidCount;
    while (count > 0 && attempts-- > 0 && liquidCount) {
      rain.cursor %= liquidCount;
      var i = rain.cursor++;
      if (liquidOrigin[i] !== RAIN_ORIGIN || rainPlowHolds(i)) continue;
      removeLiquidParticle(i); rain.waterCount--; rain.recycled++; count--;
      rain.cursor--;
    }
  }

  function rainSpawn(top, left, width, seed) {
    var x = left + Math.random() * width;
    var y = seed ? top + Math.random() * Math.max(0, SKY_ROWS * TILE - top - 12) : top;
    if (liquidWorldSolidAt(x, y)) return;
    var size = Math.random();
    rain.drops.push({ x: x, y: y, vx: surfaceWind.current * 95,
      vy: 480 + size * 330, size: size, age: 0 });
    rain.emitted++;
  }
  function rainImpact(x, y, wet, size) {
    if (rain.impacts.length >= 220 || Math.random() > 0.62) return;
    rain.impacts.push({ x: x, y: y, wet: wet, size: size, t: 0 });
  }
  function rainLand(p, x, y, wet, hit) {
    if (liquidCount >= LIQUID_MAX_PARTICLES - 4096) return false;
    // Use the last unobstructed point. The solver owns the splash, settling,
    // mixing, scoop transfer and rig interaction from here onward.
    if (addLiquidParticle(0, x, y, p.vx * 0.55, Math.min(260, p.vy), RAIN_ORIGIN) < 0) return false;
    rain.waterCount++; rain.landed++;
    if (hit) rainImpact(x, y + 2, wet, p.size);
    return true;
  }

  function updateParticleRain(dt) {
    if (!worldRainEnabled || bathMode || PERF_DISABLE_WATER || PERF_DISABLE_WEATHER || !weatherTune.enabled) return;
    dt = Math.min(0.05, Math.max(0, dt));
    rain.time += dt;
    rainUpdatePlow();
    rain.scan -= dt; rain.scanDt += dt;
    if (rain.scan <= 0) { rainScan(rain.scanDt); rain.scanDt = 0; rain.scan = 0.16; }
    var gpu = liquidWGPU && liquidWGPU.simActive;
    var limit = gpu ? RAIN_WATER_CAP : RAIN_CPU_CAP;
    var surf = SKY_ROWS * TILE;
    var sky = cam.y < surf && cam.y + screenH > surf - 2200;
    var left = Math.max(3, cam.x - 130), right = Math.min(COLS * TILE - 3, cam.x + screenW + 130);
    var width = Math.max(0, right - left);
    var top = Math.max(surf - 2400, Math.min(cam.y - 24, surf - 180));
    var rate = (gpu ? 760 : 280) * Math.min(1.7, width / 1100) * rain.intensity;
    if (sky && !rain.primed && width > 0) {
      // Only prime open sky. Never seed below ground or inside a sealed cave.
      var initial = Math.max(0, Math.min(700, Math.round(rate * (surf - top) / 650),
        limit - rain.waterCount - rain.parked.length / 2 - rain.drops.length,
        LIQUID_MAX_PARTICLES - liquidCount - 4096 - rain.drops.length));
      for (var s = 0; s < initial; s++) rainSpawn(top, left, width, true);
      rain.primed = true;
    }
    var total = rain.waterCount + rain.parked.length / 2 + rain.drops.length;
    var incoming = sky ? Math.ceil(rate * dt) : 0;
    if (total + incoming > limit) rainRecycle(Math.min(80, total + incoming - limit));
    var room = Math.max(0, limit - rain.waterCount - rain.parked.length / 2 - rain.drops.length);
    rain.credit = sky ? Math.min(80, rain.credit + rate * dt) : 0;
    var births = Math.min(Math.floor(rain.credit), RAIN_DROP_CAP - rain.drops.length, room,
      Math.max(0, LIQUID_MAX_PARTICLES - liquidCount - 4096 - rain.drops.length));
    for (var b = 0; b < births; b++) rainSpawn(top, left, width, false);
    rain.credit -= births;
    var wind = surfaceWind.current * 110 + 42 * Math.sin(rain.time * 0.43) + 22 * Math.sin(rain.time * 1.17);
    for (var i = rain.drops.length - 1; i >= 0; i--) {
      var p = rain.drops[i];
      p.age += dt;
      var air = p.y < surf;
      var localWind = air ? wind + 22 * Math.sin(p.x * 0.006 + rain.time * 0.8) : 0;
      p.vx += (localWind - p.vx) * Math.min(1, dt * (air ? 1.8 : 4));
      p.vy += (480 + p.size * 330 - p.vy) * Math.min(1, dt * 3);
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), p.vy) * dt / 3));
      var dx = p.vx * dt / steps, dy = p.vy * dt / steps, remove = false;
      for (var k = 0; k < steps; k++) {
        var nx = p.x + dx, ny = p.y + dy;
        var solid = liquidWorldSolidAt(nx, ny + 1.5);
        var wet = (rain.cells[rainCell(nx, ny)] || 0) >= 4;
        var rig = player && liquidPointInMiner(nx, ny);
        if (solid || wet || rig) {
          remove = rainLand(p, p.x, p.y, wet, true);
          // If the shared solver is full, retain this drop until it can enter.
          break;
        }
        p.x = nx; p.y = ny;
      }
      // Hand off shaft water at the viewport edge so the usual liquid streamer
      // carries it onward. No viewport-bottom deletion of water over a mine.
      if (!remove && p.y > cam.y + screenH + 50 && p.y >= surf && !liquidWorldSolidAt(p.x, p.y)) {
        remove = rainLand(p, p.x, p.y, false, false);
      }
      if (!remove && (p.x < 2 || p.x > COLS * TILE - 2 || p.x < cam.x - screenW ||
          p.x > cam.x + screenW * 2 || p.y < cam.y - screenH * 2 || p.age > 20)) {
        remove = true; rain.recycled++;
      }
      if (remove) { rain.drops[i] = rain.drops[rain.drops.length - 1]; rain.drops.pop(); }
    }
    for (var f = rain.impacts.length - 1; f >= 0; f--) {
      rain.impacts[f].t += dt;
      if (rain.impacts[f].t > 0.34) {
        rain.impacts[f] = rain.impacts[rain.impacts.length - 1]; rain.impacts.pop();
      }
    }
  }

  function drawRainDamp() {
    if (!worldRainEnabled || PERF_DISABLE_WATER || PERF_DISABLE_WEATHER || !weatherTune.enabled) return;
    // Draw on the soil before scenery and fog. Two feathered bands darken
    // existing terrain, with a tiny receding glint where the water went in.
    // No gradients, new canvases, terrain-cache rebuilds or simulated FX.
    var wp = weatherPalette();
    ctx.save();
    for (var i = 0; i < rain.damp.length; i++) {
      var m = rain.damp[i], age = rain.time - m.stamp;
      var wet = m.strength * Math.max(0, 1 - age / 6) * Math.min(1, (rain.time - m.born) * 4);
      var tx = m.c * TILE, ty = m.r * TILE;
      if (wet <= 0 || tx + TILE < cam.x || tx > cam.x + screenW || ty + TILE < cam.y || ty > cam.y + screenH) continue;
      var horizontal = m.face < 2, dir = m.face === 0 || m.face === 2 ? 1 : -1;
      var along = m.segment * 8, jitter = tileHash01(m.r, m.c, m.segment + m.face * 17);
      var x = horizontal ? tx + along : tx + (dir > 0 ? 0 : TILE);
      var y = horizontal ? ty + (dir > 0 ? 0 : TILE) : ty + along;
      ctx.fillStyle = m.shade;
      for (var band = 0; band < 2; band++) {
        var depth = (band ? 2 : 4 + jitter * 3) * (0.5 + wet * 0.5);
        ctx.globalAlpha = wet * (band ? 0.14 : 0.07);
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x + 0.5, y + dir * 0.8); ctx.lineTo(x + 7.5, y + dir * 0.8);
          ctx.lineTo(x + 6.5, y + dir * depth); ctx.lineTo(x + 2, y + dir * depth * 0.7);
        } else {
          ctx.moveTo(x + dir * 0.8, y + 0.5); ctx.lineTo(x + dir * 0.8, y + 7.5);
          ctx.lineTo(x + dir * depth, y + 6.5); ctx.lineTo(x + dir * depth * 0.7, y + 2);
        }
        ctx.closePath(); ctx.fill();
      }
      var glint = Math.max(0, 1 - age / 0.65) * wet;
      if (glint <= 0) continue;
      ctx.globalAlpha = glint * 0.18;
      ctx.strokeStyle = wRGBA(wp.rain, 1); ctx.lineWidth = 0.6;
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(x + 2, y + dir); ctx.lineTo(x + 2 + 3 * glint, y + dir); }
      else { ctx.moveTo(x + dir, y + 2); ctx.lineTo(x + dir, y + 2 + 3 * glint); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticleRain() {
    if (!worldRainEnabled || PERF_DISABLE_WATER || PERF_DISABLE_WEATHER || !weatherTune.enabled) return;
    var ws = dpr * worldScale, wp = weatherPalette();
    ctx.save();
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
    ctx.lineCap = 'round';
    // Three optical size bands, each a single batched path. Trails run BEHIND
    // the particle, so the bright head never draws through the impact surface.
    for (var band = 0; band < 3; band++) {
      ctx.lineWidth = (0.45 + band * 0.34) / Math.max(0.7, worldScale);
      ctx.strokeStyle = wRGBA(band === 2 ? wp.rainFg : wp.rain, 0.22 + band * 0.14);
      ctx.beginPath();
      for (var i = 0; i < rain.drops.length; i++) {
        var p = rain.drops[i];
        if (Math.min(2, Math.floor(p.size * 3)) !== band) continue;
        var shutter = 0.009 + p.size * 0.012;
        ctx.moveTo(p.x - p.vx * shutter, p.y - p.vy * shutter);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // Small impact crowns and expanding, foreshortened surface rings. These
    // are optical cues only; they never create extra water particles.
    ctx.lineWidth = 0.65 / Math.max(0.7, worldScale);
    for (var age = 0; age < 3; age++) {
      ctx.strokeStyle = wRGBA(wp.rainFg, 0.42 - age * 0.12);
      ctx.beginPath();
      for (var j = 0; j < rain.impacts.length; j++) {
        var f = rain.impacts[j], t = f.t;
        if (Math.min(2, Math.floor(t / 0.34 * 3)) !== age) continue;
        var spread = 1 + t * (19 + f.size * 15);
        var hop = Math.max(0, t * 42 - t * t * 155);
        if (f.wet) {
          ctx.moveTo(f.x + spread, f.y);
          ctx.ellipse(f.x, f.y, spread, Math.max(0.3, spread * 0.18), 0, 0, Math.PI * 2);
        }
        if (hop > 0) {
          ctx.moveTo(f.x - spread, f.y - hop);
          ctx.lineTo(f.x - spread * 0.7, f.y - hop - 1.6);
          ctx.moveTo(f.x + spread, f.y - hop);
          ctx.lineTo(f.x + spread * 0.7, f.y - hop - 1.6);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function rainSave() {
    if (!worldRainEnabled) return { enabled: false };
    liquidToolSync();
    var water = rain.parked.slice(0, RAIN_WATER_CAP * 2);
    for (var i = 0; i < liquidCount && water.length < RAIN_WATER_CAP * 2; i++) {
      if (liquidOrigin[i] === RAIN_ORIGIN) water.push(Math.round(liquidX[i] * 4) / 4, Math.round(liquidY[i] * 4) / 4);
    }
    return { enabled: true, water: water };
  }
  function rainParkedInRect(x0, y0, x1, y1, take) {
    if (!worldRainEnabled) return 0;
    var count = 0;
    for (var i = rain.parked.length - 2; i >= 0; i -= 2) {
      var x = rain.parked[i], y = rain.parked[i + 1];
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      count++;
      if (take > 0) {
        rain.parked[i] = rain.parked[rain.parked.length - 2];
        rain.parked[i + 1] = rain.parked[rain.parked.length - 1];
        rain.parked.length -= 2;
        if (count >= take) break;
      }
    }
    return count;
  }
  function rainRestore(data) {
    for (var n = liquidCount - 1; n >= 0; n--) if (liquidOrigin[n] === RAIN_ORIGIN) removeLiquidParticle(n);
    rainReset(!!(data && data.enabled === true));
    if (!worldRainEnabled || !Array.isArray(data.water)) return;
    for (var i = 0; i + 1 < data.water.length && rain.parked.length < RAIN_WATER_CAP * 2; i += 2) {
      var x = data.water[i], y = data.water[i + 1];
      if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y) &&
          x > 0 && x < COLS * TILE && y > -20000 && y < TOTAL_ROWS * TILE) rain.parked.push(x, y);
    }
  }
  function shaderWarmRain() {
    var enabled = worldRainEnabled, drops = rain.drops, impacts = rain.impacts, damp = rain.damp;
    try {
      worldRainEnabled = true;
      rain.drops = []; rain.impacts = [];
      for (var i = 0; i < 3; i++) {
        rain.drops.push({ x: cam.x + 40 + i * 12, y: cam.y + 60, vx: 90, vy: 650, size: i * 0.4 });
        rain.impacts.push({ x: cam.x + 80, y: cam.y + 100, size: 0.7, wet: true, t: 0.04 + i * 0.11 });
      }
      drawParticleRain();
      rain.damp = [];
      for (var face = 0; face < 4; face++) rain.damp.push({ r: Math.floor(cam.y / TILE) + 2,
        c: Math.floor(cam.x / TILE) + 2, face: face, segment: face, born: rain.time - 1,
        stamp: rain.time, strength: 1, shade: TILE_MATERIALS.dirt.topsoil.cool });
      ctx.save();
      var ws = dpr * worldScale;
      ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
      drawRainDamp();
      ctx.restore();
    } finally { worldRainEnabled = enabled; rain.drops = drops; rain.impacts = impacts; rain.damp = damp; }
  }
  window.__particleRain = {
    stats: function () { return { enabled: worldRainEnabled, airborne: rain.drops.length,
      water: rain.waterCount, parked: rain.parked.length / 2, emitted: rain.emitted,
      landed: rain.landed, recycled: rain.recycled, absorbed: rain.absorbed,
      dampEdges: rain.damp.length, intensity: rain.intensity,
      backend: liquidWGPU && liquidWGPU.simActive ? 'webgpu' : 'cpu' }; }
  };
