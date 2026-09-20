  // Mineral liquids keep identity while sharing the existing MLS-MPM pressure
  // field. Quantities everywhere are actual particles, including tank transfer.
  // Palette twin: mineralRGB in liquid-wgpu.js.
  var liquidCatalog = [
    { id: 0, key: 'water', name: 'Water', color: '#64b4cc', rgb: [0.39, 0.71, 0.80], feel: 'Clear and quick', depth: 'Surface lakes' },
    { id: 1, key: 'oil', name: 'Oil', color: '#342717', rgb: [0.20, 0.15, 0.09], feel: 'Heavy and slick', depth: 'Legacy deposits' },
    { id: 2, key: 'brine', name: 'Brine', color: '#91c9ad', rgb: [0.57, 0.79, 0.68], feel: 'Dense mineral wash', depth: 'Shallow salt pockets' },
    { id: 3, key: 'nectar', name: 'Nectar', color: '#de9c4d', rgb: [0.87, 0.61, 0.30], feel: 'Thick golden ribbons', depth: 'Warm amber pockets' },
    { id: 4, key: 'lumen', name: 'Lumen', color: '#ad87cc', rgb: [0.68, 0.53, 0.80], feel: 'Soft violet currents', depth: 'Deep mineral pockets' }
  ];
  var liquidToolCandidates = [];
  var liquidToolRemovalIndices = [];

  function liquidToolSync() {
    // Take the last ready GPU snapshot BEFORE mutations. Continuous suction
    // otherwise invalidates every readback and leaves the CPU mirror stale.
    if (liquidWGPU && liquidWGPU.simActive && liquidWGPU.syncReadback) liquidWGPU.syncReadback();
  }

  function liquidToolExtract(x, y, radius, maxCount, intake) {
    var counts = [0, 0, 0, 0, 0];
    if (!isFinite(x) || !isFinite(y) || !(radius > 0) || !(maxCount > 0)) return counts;
    liquidToolSync();
    var cap = Math.min(2048, Math.floor(maxCount));
    var r2 = radius * radius;
    var ry = intake && intake.ry > 0 ? intake.ry : radius;
    var fromX = intake ? intake.fromX : x, fromY = intake ? intake.fromY : y;
    var candidates = liquidToolCandidates;
    candidates.length = 0;
    for (var i = 0; i < liquidCount; i++) {
      var dx = liquidX[i] - x, dy = liquidY[i] - y;
      var d2 = dx * dx + dy * dy * r2 / (ry * ry);
      if (d2 > r2 || !liquidLineClear(fromX, fromY, liquidX[i], liquidY[i])) continue;
      candidates.push({ index: i, distance: d2 });
    }
    candidates.sort(function (a, b) { return a.distance - b.distance; });
    var indices = liquidToolRemovalIndices;
    indices.length = 0;
    for (var c = 0; c < Math.min(cap, candidates.length); c++) {
      indices.push(candidates[c].index);
      var picked = candidates[c].index;
      counts[liquidType[picked]]++;
      if (intake && intake.samples && intake.samples.length < 8 && c % 12 === 0) {
        intake.samples.push({ x: liquidX[picked], y: liquidY[picked], type: liquidType[picked] });
      }
    }
    // Descending original indices remain valid under the solver's swap-remove.
    indices.sort(function (a, b) { return b - a; });
    for (var n = 0; n < indices.length; n++) removeLiquidParticle(indices[n]);
    counts[0] += snowScoop(x, y, radius, ry, fromX, fromY, cap - indices.length);
    if (indices.length) liquidToolWake(x, y, radius + TILE);
    return counts;
  }

  function liquidToolEmit(type, count, x, y, vx, vy) {
    type = Number(type);
    if (!liquidCatalog[type] || !isFinite(x) || !isFinite(y) || !isFinite(vx) || !isFinite(vy)) return 0;
    if (liquidWorldSolidAt(x, y)) return 0;
    liquidToolSync();
    var cap = Math.min(2048, Math.max(0, Math.floor(count)), LIQUID_MAX_PARTICLES - liquidCount);
    if (!cap) return 0;
    var speed = Math.sqrt(vx * vx + vy * vy);
    var alongX = speed > 0.1 ? vx / speed : 0;
    var alongY = speed > 0.1 ? vy / speed : 1;
    var step = LIQUID_CELL * LIQUID_PDELTA;
    var cols = Math.min(14, Math.max(3, Math.ceil(Math.sqrt(cap * 0.65))));
    var added = 0;
    for (var i = 0; i < cap; i++) {
      var side = ((i % cols) - (cols - 1) * 0.5) * step;
      var forward = Math.floor(i / cols) * step;
      var px = x - alongY * side + alongX * forward;
      var py = y + alongX * side + alongY * forward;
      // The packet is laid at rest spacing and clipped against real terrain.
      // A blocked nozzle keeps its liquid in the tank.
      if (liquidWorldSolidAt(px, py) || !liquidLineClear(x, y, px, py)) continue;
      if (addLiquidParticle(type, px, py, vx, vy, 0) >= 0) added++;
    }
    if (added) liquidToolWake(x, y, TILE * 2);
    return added;
  }

  // A wide, interleaved discharge, laid at rest spacing. Unlike separate
  // per-chamber pours, mixed loads never spawn different liquids atop each other.
  function liquidToolDump(tank, maxCount, x, y, width, rigVX) {
    var counts = [0, 0, 0, 0, 0], total = 0;
    for (var t = 0; t < 5; t++) total += tank[t];
    var cap = Math.min(2048, Math.floor(maxCount), total, LIQUID_MAX_PARTICLES - liquidCount);
    if (!(cap > 0)) return counts;
    liquidToolSync();
    var step = LIQUID_CELL * LIQUID_PDELTA;
    var cols = Math.max(12, Math.ceil(width / step));
    for (var i = 0; i < cap; i++) {
      var row = Math.floor(i / cols), side = (i % cols) - (cols - 1) * 0.5;
      var dx = side * step * (1 + row * 0.018);
      var px = x + dx, py = y + row * step;
      if (liquidWorldSolidAt(px, py) || !liquidLineClear(x, y, px, py) || liquidPointInMiner(px, py)) continue;
      var type = -1, score = Infinity;
      for (var k = 0; k < 5; k++) {
        if (counts[k] >= tank[k]) continue;
        var next = (counts[k] + 0.5) / tank[k];
        if (next < score) { score = next; type = k; }
      }
      if (type < 0) break;
      if (addLiquidParticle(type, px, py, rigVX * 0.45 + dx * 3.4, 610 + Math.abs(dx) * 0.8, 0) >= 0) counts[type]++;
    }
    var sent = counts.reduce(function (n, v) { return n + v; }, 0);
    if (sent) liquidToolWake(x, y, TILE * 2);
    return counts;
  }

  function liquidSampleRect(x0, y0, x1, y1) {
    var counts = [0, 0, 0, 0, 0];
    for (var i = 0; i < liquidCount; i++) {
      var px = liquidX[i], py = liquidY[i];
      if (px >= x0 && px < x1 && py >= y0 && py < y1) counts[liquidType[i]]++;
    }
    if (typeof mineralLiquidParkedSampleRect === 'function') {
      var parked = mineralLiquidParkedSampleRect(x0, y0, x1, y1);
      for (var k = 0; k < counts.length; k++) counts[k] += parked[k] || 0;
    }
    if (typeof rainParkedInRect === 'function') counts[0] += rainParkedInRect(x0, y0, x1, y1, 0);
    return counts;
  }

  function liquidExtractRect(x0, y0, x1, y1, type, maxCount) {
    if (!liquidCatalog[type] || !(maxCount > 0)) return 0;
    liquidToolSync();
    var cap = Math.floor(maxCount), removed = 0;
    for (var i = liquidCount - 1; i >= 0 && removed < cap; i--) {
      if (liquidType[i] !== type) continue;
      var px = liquidX[i], py = liquidY[i];
      if (px < x0 || px >= x1 || py < y0 || py >= y1) continue;
      removeLiquidParticle(i);
      removed++;
    }
    if (removed < cap && typeof mineralLiquidParkedExtractRect === 'function') {
      removed += mineralLiquidParkedExtractRect(x0, y0, x1, y1, type, cap - removed);
    }
    if (type === 0 && removed < cap && typeof rainParkedInRect === 'function') {
      removed += rainParkedInRect(x0, y0, x1, y1, cap - removed);
    }
    if (removed) liquidToolWake((x0 + x1) * 0.5, (y0 + y1) * 0.5, Math.max(x1 - x0, y1 - y0));
    return removed;
  }

  function liquidSampleCircle(x, y, radius) {
    var counts = [0, 0, 0, 0, 0], total = 0, dominant = 0, best = 0;
    var r2 = radius * radius;
    for (var i = 0; i < liquidCount; i++) {
      var dx = liquidX[i] - x, dy = liquidY[i] - y;
      if (dx * dx + dy * dy > r2) continue;
      counts[liquidType[i]]++;
      total++;
    }
    for (var k = 0; k < counts.length; k++) if (counts[k] > best) { dominant = k; best = counts[k]; }
    var spacing = LIQUID_CELL * LIQUID_PDELTA;
    return { counts: counts, total: total, type: dominant, wet: Math.min(1, total * spacing * spacing / Math.max(1, Math.PI * r2)) };
  }

  // Read the waterline beside a solid visitor, whose own collider has
  // displaced all particles from its interior. Sparse spray is not a pool.
  function liquidSampleBall(x, y, radius) {
    var rowH = 4, span = radius * 1.8, top = y - span;
    var rows = Math.ceil(span * 2 / rowH), bins = new Array(rows);
    for (var b = 0; b < rows; b++) bins[b] = 0;
    var inner = radius + 2, outer = radius * 1.75;
    var vx = 0, vy = 0, count = 0;
    for (var i = 0; i < liquidCount; i++) {
      var dx = Math.abs(liquidX[i] - x), row = Math.floor((liquidY[i] - top) / rowH);
      if (dx < inner || dx > outer || row < 0 || row >= rows) continue;
      bins[row]++;
      vx += liquidVX[i]; vy += liquidVY[i]; count++;
    }
    var spacing = LIQUID_CELL * LIQUID_PDELTA;
    var dense = Math.max(3, (outer - inner) * 2 * rowH / (spacing * spacing) * 0.22);
    var first = -1, last = -1, start = -1, best = 0;
    for (var j = 0; j <= rows; j++) {
      if (j < rows && bins[j] >= dense) { if (start < 0) start = j; continue; }
      if (start >= 0 && j - start > best) { first = start; last = j - 1; best = j - start; }
      start = -1;
    }
    return { surface: first < 0 ? Infinity : top + first * rowH,
      bottom: last < 0 || last === rows - 1 ? Infinity : top + (last + 1) * rowH,
      vx: count ? Math.max(-160, Math.min(160, vx / count)) : 0,
      vy: count ? Math.max(-160, Math.min(160, vy / count)) : 0 };
  }

  function liquidToolImpulse(x, y, radius, vx, vy) {
    if (!(radius > 0) || !isFinite(vx) || !isFinite(vy)) return 0;
    liquidToolSync();
    var r2 = radius * radius, affected = 0;
    for (var i = 0; i < liquidCount; i++) {
      var dx = liquidX[i] - x, dy = liquidY[i] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2 || !liquidLineClear(x, y, liquidX[i], liquidY[i])) continue;
      var falloff = 1 - Math.sqrt(d2) / radius;
      liquidVX[i] += vx * falloff;
      liquidVY[i] += vy * falloff;
      var v2 = liquidVX[i] * liquidVX[i] + liquidVY[i] * liquidVY[i];
      var maxV = Math.max(1, LIQUID_MAX_VEL);
      if (v2 > maxV * maxV) {
        var sc = maxV / Math.sqrt(v2);
        liquidVX[i] *= sc; liquidVY[i] *= sc;
      }
      liquidSleeping[i] = 0;
      liquidFrozen[i] = 0;
      liquidRestFrames[i] = 0;
      if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(3, i, liquidVX[i], liquidVY[i], liquidAeration[i], liquidType[i], liquidOrigin[i]);
      else liquidOpsOverflow = true;
      affected++;
    }
    if (affected) liquidMutationSeq++;
    return affected;
  }

  function liquidToolWake(x, y, radius) {
    var woke = 0, r2 = radius * radius;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i] || !liquidSleeping[i]) continue;
      var dx = liquidX[i] - x, dy = liquidY[i] - y;
      if (dx * dx + dy * dy > r2) continue;
      liquidSleeping[i] = 0;
      liquidRestFrames[i] = 0;
      if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(4, i, liquidType[i], liquidOrigin[i]);
      else liquidOpsOverflow = true;
      woke++;
    }
    if (woke) liquidMutationSeq++;
  }

  var liquidSkyGuestCache = [];
  function liquidSkyGuestShapes() {
    var out = liquidSkyGuestCache;
    if (typeof skySlimes === 'undefined') { out.length = 0; return out; }
    var count = Math.min(8, skySlimes.length);
    for (var i = 0; i < count; i++) {
      var b = skySlimes[i];
      var g = out[i] || { pts: [] };
      var rx = b.rx || b.r, ry = b.ry || b.r;
      g.x = b.x; g.y = b.y; g.hw = rx; g.hh = ry;
      g.mvx = b.vx || 0; g.mvy = b.vy || 0;
      g.pts.length = 64;
      for (var k = 0; k < 16; k++) {
        var a = k * Math.PI * 2 / 16;
        g.pts[k * 4] = b.x + Math.cos(a) * rx;
        g.pts[k * 4 + 1] = b.y + Math.sin(a) * ry;
        g.pts[k * 4 + 2] = g.mvx;
        g.pts[k * 4 + 3] = g.mvy;
      }
      out[i] = g;
    }
    out.length = count;
    return out;
  }

  function liquidSkyBoundariesCPU() {
    if (typeof skySlimes === 'undefined' || !skySlimes.length) return;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i]) continue;
      for (var j = 0; j < skySlimes.length; j++) {
        var b = skySlimes[j], rx = (b.rx || b.r) + 1.1, ry = (b.ry || b.r) + 1.1;
        var dx = liquidX[i] - b.x, dy = liquidY[i] - b.y;
        if (Math.abs(dx) >= rx || Math.abs(dy) >= ry) continue;
        var q = dx * dx / (rx * rx) + dy * dy / (ry * ry);
        if (q >= 1) continue;
        var inv = 1 / Math.sqrt(Math.max(q, 0.0001));
        var nx = b.x + dx * inv, ny = b.y + dy * inv;
        if (q < 0.0001) { nx = b.x; ny = b.y - ry; }
        // A moving boundary must not squeeze its displaced water into rock.
        if (liquidWorldSolidAt(nx, ny)) continue;
        liquidX[i] = nx; liquidY[i] = ny;
        var speed = Math.sqrt((b.vx || 0) * (b.vx || 0) + (b.vy || 0) * (b.vy || 0));
        if (speed > 8) {
          liquidVX[i] = (b.vx || 0) * 0.65;
          liquidVY[i] = (b.vy || 0) * 0.65;
          liquidSleeping[i] = 0; liquidRestFrames[i] = 0;
        } else { liquidVX[i] = 0; liquidVY[i] = 0; }
      }
    }
  }
