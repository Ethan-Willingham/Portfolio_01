  /* ---- Mineral springs and persistent liquid storage ---- */
  // Pockets are finite. Off-camera poured liquid is parked at its real position,
  // freeing the particle budget for the next lake without losing a filled bath.
  var mineralDeposits = [];
  var mineralLiquidParked = {};
  var mineralLiquidClock = 0;
  function mineralLiquidReset() {
    mineralDeposits = [];
    mineralLiquidParked = {};
    mineralLiquidClock = 0;
  }
  function mineralLiquidBin(x, y) {
    return Math.floor(x / 256) + ':' + Math.floor(y / 256);
  }
  function mineralLiquidPark(type, x, y) {
    var key = mineralLiquidBin(x, y);
    if (!mineralLiquidParked[key]) mineralLiquidParked[key] = [];
    mineralLiquidParked[key].push(type, Math.round(x * 4) / 4, Math.round(y * 4) / 4);
  }
  function mineralLiquidParkedSampleRect(x0, y0, x1, y1) {
    var counts = [0, 0, 0, 0, 0];
    for (var bx = Math.floor(x0 / 256); bx <= Math.floor(x1 / 256); bx++) {
      for (var by = Math.floor(y0 / 256); by <= Math.floor(y1 / 256); by++) {
        var data = mineralLiquidParked[bx + ':' + by];
        if (!data) continue;
        for (var i = 0; i < data.length; i += 3) {
          if (data[i + 1] >= x0 && data[i + 1] <= x1 && data[i + 2] >= y0 && data[i + 2] <= y1) counts[data[i]]++;
        }
      }
    }
    return counts;
  }
  function mineralLiquidGenerate(migrating) {
    var center = townCenterCol(0);
    var depths = [12, 26, 42, 80, 124, 168, 216, 244, 292, 328, 365];
    var types = [0, 0, 2, 2, 2, 2, 3, 3, 4, 4, 4];
    for (var n = 0; n < depths.length; n++) {
      var c = center + (n % 2 ? -14 : 9) + Math.floor((Math.random() - 0.5) * 12);
      var r = SKY_ROWS + depths[n];
      if (c < 2 || c + 5 >= COLS || r + 3 >= BEDROCK_ROW) continue;
      var safe = false;
      // Old mines often have open shafts at the first candidate. Search the
      // same depth band for intact host rock instead of silently losing a tier.
      for (var attempt = 0; attempt < 64 && !safe; attempt++) {
        if (attempt) c = center + (attempt % 2 ? -1 : 1) * (6 + Math.floor(attempt / 2) * 5);
        if (c < 2 || c + 5 >= COLS) continue;
        safe = true;
        for (var sy = r; sy <= r + 2; sy++) for (var sx = c - 1; sx <= c + 4; sx++) {
          var cell = world[sy] && world[sy][sx];
          if (cell && (cell.type === 'bedrock' || cell.type === 'foundation' || cell.type === 'barrier' || cell.type === 'greatseam' || cell.type === 'jello')) safe = false;
          if (migrating && !cell) safe = false;
        }
      }
      if (!safe) continue;
      for (var rr = r; rr < r + 2; rr++) {
        world[rr][c - 1] = { type: 'stone', hp: ORES.stone.hp };
        world[rr][c + 4] = { type: 'stone', hp: ORES.stone.hp };
        for (var cc = c; cc < c + 4; cc++) world[rr][cc] = null;
      }
      for (var fc = c - 1; fc <= c + 4; fc++) world[r + 2][fc] = { type: 'stone', hp: ORES.stone.hp };
      mineralDeposits.push({ c: c, r: r, type: types[n], seeded: false });
    }
  }
  function mineralLiquidParkedExtractRect(x0, y0, x1, y1, type, maxCount) {
    var removed = 0;
    for (var bx = Math.floor(x0 / 256); bx <= Math.floor(x1 / 256) && removed < maxCount; bx++) {
      for (var by = Math.floor(y0 / 256); by <= Math.floor(y1 / 256) && removed < maxCount; by++) {
        var key = bx + ':' + by, data = mineralLiquidParked[key];
        if (!data) continue;
        for (var i = data.length - 3; i >= 0 && removed < maxCount; i -= 3) {
          if (data[i] !== type || data[i + 1] < x0 || data[i + 1] >= x1 || data[i + 2] < y0 || data[i + 2] >= y1) continue;
          var last = data.length - 3;
          data[i] = data[last]; data[i + 1] = data[last + 1]; data[i + 2] = data[last + 2]; data.length -= 3;
          removed++;
        }
        if (!data.length) delete mineralLiquidParked[key];
      }
    }
    return removed;
  }
  function mineralLiquidTick(dt) {
    mineralLiquidClock -= dt;
    if (mineralLiquidClock > 0) return;
    mineralLiquidClock = 0.35;
    var margin = 240;
    var x0 = cam.x - margin, x1 = cam.x + viewW / worldScale + margin;
    var y0 = cam.y - margin, y1 = cam.y + viewH / worldScale + margin;
    // All operations use the same ordered swap-remove journal as the GPU.
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidOrigin[i] !== 0) continue;
      var x = liquidX[i], y = liquidY[i];
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      mineralLiquidPark(liquidType[i], x, y);
      removeLiquidParticle(i);
    }
    var budget = Math.min(3600, Math.max(0, LIQUID_MAX_PARTICLES - liquidCount - 512));
    for (var bx = Math.floor(x0 / 256); bx <= Math.floor(x1 / 256) && budget > 0; bx++) {
      for (var by = Math.floor(y0 / 256); by <= Math.floor(y1 / 256) && budget > 0; by++) {
        var key = bx + ':' + by, data = mineralLiquidParked[key];
        if (!data) continue;
        // Only restore particles inside the residency rectangle. Restoring an
        // entire intersecting bin would bounce its outside edge in and out.
        for (var j = data.length - 3; j >= 0 && budget > 0; j -= 3) {
          var px = data[j + 1], py = data[j + 2];
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          if (addLiquidParticle(data[j], px, py, 0, 0, 0) < 0) break;
          var end = data.length - 3;
          data[j] = data[end]; data[j + 1] = data[end + 1]; data[j + 2] = data[end + 2];
          data.length -= 3;
          budget--;
        }
        if (!data.length) delete mineralLiquidParked[key];
      }
    }
    for (var d = 0; d < mineralDeposits.length; d++) {
      var p = mineralDeposits[d], dx = (p.c + 2) * TILE, dy = (p.r + 1) * TILE;
      if (p.seeded || dx < x0 || dx > x1 || dy < y0 || dy > y1) continue;
      p.seeded = true;
      // ~4300 real particles at the solver's 1.25 px rest spacing. Park first,
      // then stream them through the same budget as carried and poured fluid.
      for (var fy = p.r * TILE + 8; fy < (p.r + 2) * TILE - 2; fy += 1.25) {
        for (var fx = p.c * TILE + 2; fx < (p.c + 4) * TILE - 2; fx += 1.25) mineralLiquidPark(p.type, fx, fy);
      }
    }
  }
  function mineralLiquidSave() {
    liquidToolSync();
    var parked = {};
    Object.keys(mineralLiquidParked).forEach(function (key) { parked[key] = mineralLiquidParked[key].slice(); });
    for (var i = 0; i < liquidCount; i++) {
      if (liquidOrigin[i] !== 0) continue;
      var key = mineralLiquidBin(liquidX[i], liquidY[i]);
      if (!parked[key]) parked[key] = [];
      parked[key].push(liquidType[i], Math.round(liquidX[i] * 4) / 4, Math.round(liquidY[i] * 4) / 4);
    }
    return { deposits: mineralDeposits, parked: parked };
  }
  function mineralLiquidRestore(data) {
    mineralLiquidReset();
    if (!data) { mineralLiquidGenerate(true); return; }
    mineralDeposits = Array.isArray(data.deposits) ? data.deposits : [];
    var source = data.parked || {};
    Object.keys(source).forEach(function (key) {
      var values = source[key];
      if (!Array.isArray(values)) return;
      for (var i = 0; i + 2 < values.length; i += 3) {
        var t = values[i], x = values[i + 1], y = values[i + 2];
        if (t >= 0 && t <= 4 && isFinite(x) && isFinite(y) && x >= 0 && x < COLS * TILE && y > -20000 && y < TOTAL_ROWS * TILE) mineralLiquidPark(t | 0, x, y);
      }
    });
  }
