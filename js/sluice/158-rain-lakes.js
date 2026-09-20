  /* ---- Passing showers and finite, stone-lined rain lakes ---- */
  function rainAdvanceWeather(dt) {
    if (weatherForce >= 0) return; // Keep the existing weather test controls usable.
    var front = rain.climate;
    front.elapsed += dt;
    if (front.elapsed < front.duration) return;
    front.phase = (front.phase + 1) % 4;
    front.elapsed = 0;
    front.duration = [150 + Math.random() * 90, 20, 35 + Math.random() * 20, 20][front.phase];
    if (front.phase === 2) front.strength = 0.65 + Math.random() * 0.2;
    if (front.phase === 0) rain.primed = false;
  }

  function rainRoom(limit) {
    var total = rain.waterCount + rain.parked.length / 2 + rain.drops.length;
    return Math.max(0, Math.min(limit - (total - rain.lakeCount), RAIN_STORAGE_CAP - total));
  }

  function rainGenerateLakes() {
    // Three small basins, with one on either side of the town. The east basin
    // clears the bathhouse approach. Ordinary worlds keep their pond styles.
    var sites = [Math.floor(COLS * 0.13), DECK_LEFT_COL - 28, DECK_CENTER_COL + 27];
    for (var i = 0; i < sites.length; i++) {
      var left = sites[i], width = 6 + Math.floor(Math.random() * 3), right = left + width - 1, depth = 2;
      if (left < 2 || right >= COLS - 2) continue;
      for (var r = SKY_ROWS; r < SKY_ROWS + depth; r++) {
        world[r][left - 1] = { type: 'stone', hp: ORES.stone.hp };
        world[r][right + 1] = { type: 'stone', hp: ORES.stone.hp };
        for (var c = left; c <= right; c++) world[r][c] = null;
      }
      for (var c = left - 1; c <= right + 1; c++) world[SKY_ROWS + depth][c] = { type: 'stone', hp: ORES.stone.hp };
      surfacePonds.push({ cL: left, cR: right, d: depth, rainFed: true, filled: false });
      seedLakeShoreSlimes(left, right);
    }
  }

  function rainLakeAt(x, y) {
    if (y < SKY_ROWS * TILE) return null;
    var col = Math.floor(x / TILE);
    for (var p = 0; p < surfacePonds.length; p++) {
      var lake = surfacePonds[p];
      if (lake.rainFed && col >= lake.cL && col <= lake.cR && y < (SKY_ROWS + lake.d) * TILE) return lake;
    }
    return null;
  }

  function rainLakeLined(lake) {
    // A mined floor or wall stops the offscreen catchment approximation. Real
    // water still falls through the opening when the lake is simulated.
    for (var c = lake.cL - 1; c <= lake.cR + 1; c++) {
      var floor = tileAt(SKY_ROWS + lake.d, c);
      if (!floor || floor.type !== 'stone') return false;
    }
    for (var r = SKY_ROWS; r < SKY_ROWS + lake.d; r++) {
      var left = tileAt(r, lake.cL - 1), right = tileAt(r, lake.cR + 1);
      if (!left || !right || left.type !== 'stone' || right.type !== 'stone') return false;
    }
    return true;
  }

  function rainStoreInLake(lake, count) {
    var step = LIQUID_CELL * LIQUID_PDELTA, inset = step * 0.85;
    var left = lake.cL * TILE + inset, width = (lake.cR - lake.cL + 1) * TILE - inset * 2;
    var columns = Math.floor(width / step), floor = (SKY_ROWS + lake.d) * TILE;
    var occupied = (lake.rainCount || 0) + (lake.otherCount || 0);
    // Leave a little freeboard. Incoming visible drops can still overflow.
    var capacity = columns * Math.floor((lake.d * TILE - 4) / step);
    var room = RAIN_STORAGE_CAP - rain.waterCount - rain.parked.length / 2 - rain.drops.length;
    count = Math.max(0, Math.min(count, capacity - occupied, room));
    for (var n = 0; n < count; n++) {
      var index = occupied + n;
      rain.parked.push(left + (index % columns + 0.5) * width / columns,
        floor - inset - Math.floor(index / columns) * step);
    }
    lake.rainCount = (lake.rainCount || 0) + count;
    rain.lakeCount += count;
    return count;
  }

  function rainSeedLakes() {
    if (!worldRainEnabled) return;
    for (var i = 0; i < surfacePonds.length; i++) {
      var lake = surfacePonds[i];
      if (!lake.rainFed) continue;
      lake.rainCount = lake.otherCount = lake.rainCredit = 0;
      rainStoreInLake(lake, Math.floor(surfacePondNeed(lake) * 0.16));
    }
  }

  function rainCatchLakes(dt, sky, left, right) {
    if (rain.intensity <= 0) return;
    for (var i = 0; i < surfacePonds.length; i++) {
      var lake = surfacePonds[i];
      if (!lake.rainFed || !lake.catchable) continue;
      var x0 = lake.cL * TILE, x1 = (lake.cR + 1) * TILE;
      // Only the part beyond the emitted drop strip needs bookkeeping. This
      // lets lakes fill while mining without running offscreen fluid physics.
      var covered = sky ? Math.max(0, Math.min(x1, right) - Math.max(x0, left)) : 0;
      var width = x1 - x0 - covered;
      if (width <= 0) continue;
      lake.rainCredit = (lake.rainCredit || 0) + width * (760 / 1100) * rain.intensity * dt;
      var count = Math.floor(lake.rainCredit);
      if (!count) continue;
      lake.rainCredit -= count;
      rainStoreInLake(lake, count);
    }
  }
