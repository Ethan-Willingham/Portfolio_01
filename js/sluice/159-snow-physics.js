  /* ---- Snow weather feeding persistent WebGPU grain physics ---- */
  // Type 5 is dry snow, origin 3 is weather. No column banks, synthetic
  // plow wedges, terrain replacement or separate rig support simulation.
  var worldSnowEnabled = false;
  var snow = { field: particleWeatherState(), time: 0, tick: 0, credit: 0, primed: false, grains: [], parked: [],
    bed: new Map(), bedKey: null, airParked: {}, airCount: 0, coverage: null, sideCredit: 0, readbackGen: 0, active: 0, mass: 0, emitted: 0, recycled: 0, melted: 0, collected: 0, temperature: -4 };
  var snowSupportJob = null;

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
    snow.bed = new Map(); snow.bedKey = null; snowSupportJob = null;
    snow.airParked = {}; snow.airCount = snow.sideCredit = snow.readbackGen = 0; snow.coverage = null; snow.primed = false; snow.temperature = -4;
  }
  function snowActiveCap() { return SNOW_ACTIVE_CAP; }
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
    snow.active++;
    // Later flakes in this frame must see this grain, before the next
    // solver readback. Otherwise an entire returning plume can deposit
    // at the same point and spend seconds expanding out of that overlap.
    // A reconstruction in progress carries the grain into its new bed.
    if (snowSupported(x, y)) {
      snowInsertContact(snow.bed, x, y);
      if (snowSupportJob) snowSupportJob.inserted.push(x, y);
    }
    return true;
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
    if (!worldSnowEnabled || rain.climate.kind !== 'snow') return;
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
    var opening = Math.max(0, Math.min(1, (0.55 - weather.cov) / 0.35));
    // Dry overcast after a storm stays cold. Thaw follows the actual cloud
    // opening, not the end of precipitation or a timer attached to the rig.
    if (weather.pcp > 0.015 || snow.field.strength > 0.015) return -4;
    return -4 + opening * (6 + day * 3);
  }
  var snowSkyExposure = new Map();
  function snowOpenSky(x, y) {
    var col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (row < SKY_ROWS) return true;
    var key = row * COLS + col;
    if (snowSkyExposure.has(key)) return snowSkyExposure.get(key);
    var open = true;
    for (var r = row; r >= SKY_ROWS; r--) {
      if (liquidWorldSolidAt(x, r * TILE + 0.5)) { open = false; break; }
    }
    snowSkyExposure.set(key, open); return open;
  }
  function snowHeat(x, y) {
    // Water contact is the only local source of thaw. Tracks, exhaust,
    // foundations and proximity to the player supply no heat to snow.
    var wet = (rain.waterCells[rainCell(x, y)] || 0) >= 10 ? 5 : 0;
    return wet + (snow.temperature > 0 && snowOpenSky(x, y) ? snow.temperature * 0.007 : 0);
  }
  function snowMeltParticle(i) {
    // Change material IN PLACE, retaining the solver's current position and
    // velocity. WAKE is an ordered GPU identity op, not a stale CPU respawn.
    if (liquidType[i] !== 5 || rain.waterCount + rain.parked.length / 2 >= RAIN_STORAGE_CAP) return false;
    liquidType[i] = 0; liquidOrigin[i] = RAIN_ORIGIN;
    liquidG00[i] = liquidG01[i] = liquidG10[i] = liquidG11[i] = 0;
    liquidSleeping[i] = liquidRestFrames[i] = 0;
    if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(4, i, 0, RAIN_ORIGIN);
    else liquidOpsOverflow = true;
    liquidMutationSeq++; snow.melted++; snow.active--; rain.waterCount++;
    return true;
  }
  function snowContactRadius() { return LIQUID_CELL / Math.sqrt(LIQUID_SNOW_DENSITY) * 0.5; }
  var snowSupportPoints = new Float64Array(0);
  var snowSupportNext = new Int32Array(0), snowSupportQueue = new Int32Array(0);
  function snowSupportDistance() { return snowContactRadius() * 2 + 0.25; }
  var snowSupportCoordinates = new Float64Array(0);
  var snowSupportDirectHeads = new Int32Array(0), snowSupportDirectStamps = new Uint32Array(0);
  var snowSupportDirectEpoch = 0;
  function snowBuildSupport() {
    // A chain of touching grains rooted in terrain carries contact,
    // including while it slides or compacts. Velocity cannot make a pile
    // permeable to returning powder. Detached clouds have no terrain root.
    // Contact crosses bucket boundaries; bucket occupancy is not support.
    var reach = snowSupportDistance(), reach2 = reach * reach;
    var cell = Math.max(LIQUID_CELL, reach), width = Math.ceil(COLS * TILE / cell) + 1;
    var count = liquidCount, types = liquidType, xs = liquidX, ys = liquidY;
    var floor = Math.floor, solid = liquidWorldSolidAt, groundReach = snowContactRadius() + 0.3;
    // Every point/link/queue slot below is written before use. Retain only
    // scratch capacity between builds; logical counts never include its tail.
    if (snowSupportNext.length < count) {
      var capacity = Math.max(256, count, snowSupportNext.length * 2);
      snowSupportPoints = new Float64Array(capacity * 2);
      snowSupportNext = new Int32Array(capacity);
      snowSupportQueue = new Int32Array(capacity);
    }
    var heads = new Map(), bed = new Map(), points = snowSupportPoints, next = snowSupportNext, queue = snowSupportQueue;
    var pointCount = 0, queueCount = 0;
    // Only bounded, canonical bucket coordinates admit a cell-range proof.
    // Any unsupported snow point retains the complete original traversal.
    var pruneCells = cell >= 1 && cell <= 1048576 && reach >= 1 / 1024 &&
      reach <= cell && width >= 3 && width <= 67108864 && width === floor(width);
    // Whole-build admission precedes every terrain callback. Cached floor
    // results remain Number/Float64, including signed zero. Original Map
    // traversal is retained for borders, malformed or excessive rectangles.
    var direct = pruneCells && count >= 0 && count <= 2147483647 && count === floor(count) &&
      types instanceof Uint8Array && (xs instanceof Float32Array || xs instanceof Float64Array) &&
      (ys instanceof Float32Array || ys instanceof Float64Array) &&
      types.buffer instanceof ArrayBuffer && xs.buffer instanceof ArrayBuffer && ys.buffer instanceof ArrayBuffer &&
      types.length >= count && xs.length >= count && ys.length >= count;
    var coordinateCount = 0, minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    if (direct) {
      try {
        if (snowSupportCoordinates.length < count * 2) {
          var coordinateCapacity = Math.max(256, count, snowSupportCoordinates.length / 2 * 2);
          snowSupportCoordinates = new Float64Array(coordinateCapacity * 2);
        }
      } catch (coordinateAllocationError) { direct = false; }
    }
    if (direct) for (var preflight = 0; preflight < count; preflight++) {
      if (types[preflight] !== 5) continue;
      var px = xs[preflight], py = ys[preflight], pc = floor(px / cell), pr = floor(py / cell);
      if (!(px >= 0 && px <= 1048576 && py >= -1048576 && py <= 1048576 &&
          pc >= 1 && pc <= width - 2 && pr >= -1048576 && pr <= 1048576 &&
          Number.isSafeInteger(pr * width + pc))) { direct = false; break; }
      snowSupportCoordinates[coordinateCount * 2] = pc;
      snowSupportCoordinates[coordinateCount * 2 + 1] = pr; coordinateCount++;
      if (pc < minCol) minCol = pc; if (pc > maxCol) maxCol = pc;
      if (pr < minRow) minRow = pr; if (pr > maxRow) maxRow = pr;
    }
    var directBaseCol = minCol - 1, directBaseRow = minRow - 1;
    var directWidth = maxCol - minCol + 3, directHeight = maxRow - minRow + 3;
    var directArea = directWidth * directHeight;
    if (direct && !(coordinateCount > 0 && Number.isSafeInteger(directArea) && directArea <= 262144 &&
        Number.isSafeInteger((minRow - 1) * width + minCol - 1) &&
        Number.isSafeInteger((maxRow + 1) * width + maxCol + 1))) direct = false;
    if (direct && snowSupportDirectHeads.length < directArea) {
      try {
        var directCapacity = Math.min(262144, Math.max(256, directArea, snowSupportDirectHeads.length * 2));
        var newDirectHeads = new Int32Array(directCapacity);
        var newDirectStamps = new Uint32Array(directCapacity);
        snowSupportDirectHeads = newDirectHeads; snowSupportDirectStamps = newDirectStamps;
        snowSupportDirectEpoch = 0;
      } catch (directAllocationError) { direct = false; }
    }
    var directHeads = snowSupportDirectHeads, directStamps = snowSupportDirectStamps, epoch = 0;
    if (direct) {
      snowSupportDirectEpoch = (snowSupportDirectEpoch + 1) >>> 0;
      if (snowSupportDirectEpoch === 0) { directStamps.fill(0); snowSupportDirectEpoch = 1; }
      epoch = snowSupportDirectEpoch;
    }
    for (var i = 0; i < count; i++) {
      if (types[i] !== 5) continue;
      var x = xs[i], y = ys[i], n = pointCount++;
      points[n * 2] = x; points[n * 2 + 1] = y;
      var pointCol = direct ? snowSupportCoordinates[n * 2] : floor(x / cell);
      var pointRow = direct ? snowSupportCoordinates[n * 2 + 1] : floor(y / cell);
      if (pruneCells && !(x >= 0 && x <= 1048576 && y >= -1048576 && y <= 1048576 &&
          pointCol >= 0 && pointCol < width)) pruneCells = false;
      if (solid(x, y + groundReach)) {
        queue[queueCount++] = n; next[n] = -1;
      } else {
        var key = pointRow * width + pointCol;
        var directSlot = direct ? (pointRow - directBaseRow) * directWidth + pointCol - directBaseCol : 0;
        var head = direct ? (directStamps[directSlot] === epoch ? directHeads[directSlot] : undefined) : heads.get(key);
        next[n] = head === undefined ? -1 : head;
        if (direct) { directStamps[directSlot] = epoch; directHeads[directSlot] = n; }
        else heads.set(key, n);
      }
    }
    for (var q = 0; q < queueCount; q++) {
      var n = queue[q], x = points[n * 2], y = points[n * 2 + 1];
      var col = direct ? snowSupportCoordinates[n * 2] : floor(x / cell);
      var row = direct ? snowSupportCoordinates[n * 2 + 1] : floor(y / cell), key = row * width + col;
      var bucket = bed.get(key);
      if (!bucket) { bucket = []; bed.set(key, bucket); }
      bucket.push(x, y);
      var rMin = -1, rMax = 1, cMin = -1, cMax = 1;
      if (pruneCells && col > 0 && col < width - 1) {
        // 64 Number epsilons cover contact and endpoint rounding. Divide
        // these outward endpoints with the same positive bucket cell.
        var pad = 1.4210854715202004e-14 * (x + Math.abs(y) + cell + reach + 1);
        rMin = floor((y - reach - pad) / cell) - row;
        rMax = floor((y + reach + pad) / cell) - row;
        cMin = floor((x - reach - pad) / cell) - col;
        cMax = floor((x + reach + pad) / cell) - col;
        if (rMin < -1) rMin = -1; if (rMax > 1) rMax = 1;
        if (cMin < -1) cMin = -1; if (cMax > 1) cMax = 1;
      }
      for (var r = rMin; r <= rMax; r++) for (var c = cMin; c <= cMax; c++) {
        var nearKey = (row + r) * width + col + c;
        var directSlot = direct ? (row + r - directBaseRow) * directWidth + col + c - directBaseCol : 0;
        var current = direct ? (directStamps[directSlot] === epoch ? directHeads[directSlot] : undefined) : heads.get(nearKey), previous = -1;
        while (current !== undefined && current >= 0) {
          var following = next[current];
          var dx = x - points[current * 2], dy = y - points[current * 2 + 1];
          if (dx * dx + dy * dy <= reach2) {
            // Remove visited grains from candidate lists. Dense reached
            // buckets therefore do not get rescanned for every neighbour.
            if (previous < 0) {
              if (direct) { directStamps[directSlot] = epoch; directHeads[directSlot] = following; }
              else heads.set(nearKey, following);
            }
            else next[previous] = following;
            queue[queueCount++] = current;
          } else previous = current;
          current = following;
        }
      }
    }
    return bed;
  }
  // Ordinary GPU play rebuilds the same rooted bed over several frames.
  // The job copies one snapshot of the snow points, then runs the search
  // above (same point order, terrain roots, buckets, pruned neighbour range
  // and breadth-first order) within a small time slice per frame. Flakes
  // keep landing on the previous complete bed until the new one is ready,
  // so a 36,000-grain bed never stalls a single frame.
  var SNOW_SUPPORT_SLICE_MS = 0.6;
  var snowJobPoints = new Float64Array(0), snowJobCoords = new Float64Array(0);
  var snowJobNext = new Int32Array(0), snowJobQueue = new Int32Array(0);
  var snowJobHeads = new Int32Array(0), snowJobStamps = new Uint32Array(0), snowJobEpoch = 0;
  function snowSupportJobStart(key) {
    var reach = snowSupportDistance(), cell = Math.max(LIQUID_CELL, reach);
    var width = Math.ceil(COLS * TILE / cell) + 1, floor = Math.floor, count = liquidCount;
    if (snowJobNext.length < count) {
      var capacity = Math.max(256, count, snowJobNext.length * 2);
      snowJobPoints = new Float64Array(capacity * 2); snowJobCoords = new Float64Array(capacity * 2);
      snowJobNext = new Int32Array(capacity); snowJobQueue = new Int32Array(capacity);
    }
    var pruneCells = cell >= 1 && cell <= 1048576 && reach >= 1 / 1024 &&
      reach <= cell && width >= 3 && width <= 67108864 && width === floor(width);
    var direct = pruneCells, n = 0, minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (var i = 0; i < count; i++) {
      if (liquidType[i] !== 5) continue;
      var x = liquidX[i], y = liquidY[i], col = floor(x / cell), row = floor(y / cell);
      snowJobPoints[n * 2] = x; snowJobPoints[n * 2 + 1] = y;
      snowJobCoords[n * 2] = col; snowJobCoords[n * 2 + 1] = row; n++;
      if (pruneCells && !(x >= 0 && x <= 1048576 && y >= -1048576 && y <= 1048576 &&
          col >= 0 && col < width)) pruneCells = false;
      if (direct && !(x >= 0 && x <= 1048576 && y >= -1048576 && y <= 1048576 &&
          col >= 1 && col <= width - 2 && row >= -1048576 && row <= 1048576 &&
          Number.isSafeInteger(row * width + col))) direct = false;
      if (col < minCol) minCol = col; if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row; if (row > maxRow) maxRow = row;
    }
    var baseCol = minCol - 1, baseRow = minRow - 1, span = maxCol - minCol + 3, area = span * (maxRow - minRow + 3);
    if (direct && !(n > 0 && Number.isSafeInteger(area) && area <= 262144)) direct = false;
    if (direct && snowJobHeads.length < area) {
      snowJobHeads = new Int32Array(Math.min(262144, Math.max(256, area, snowJobHeads.length * 2)));
      snowJobStamps = new Uint32Array(snowJobHeads.length); snowJobEpoch = 0;
    }
    if (direct) {
      snowJobEpoch = (snowJobEpoch + 1) >>> 0;
      if (snowJobEpoch === 0) { snowJobStamps.fill(0); snowJobEpoch = 1; }
    }
    snowSupportJob = { key: key, count: n, cell: cell, width: width, reach: reach, reach2: reach * reach,
      groundReach: snowContactRadius() + 0.3, pruneCells: pruneCells, direct: direct, epoch: snowJobEpoch,
      baseCol: baseCol, baseRow: baseRow, span: span, heads: direct ? null : new Map(), bed: new Map(),
      phase: 0, cursor: 0, q: 0, queued: 0, inserted: [] };
  }
  function snowSupportJobStep(budgetMs) {
    var job = snowSupportJob;
    if (!job) return;
    var deadline = performance.now() + budgetMs, floor = Math.floor, solid = liquidWorldSolidAt;
    var points = snowJobPoints, coords = snowJobCoords, next = snowJobNext, queue = snowJobQueue;
    var heads = snowJobHeads, stamps = snowJobStamps, epoch = job.epoch, direct = job.direct, map = job.heads;
    var cell = job.cell, width = job.width, reach = job.reach, reach2 = job.reach2, work = 0;
    while (job.phase === 0 && job.cursor < job.count) {
      var n = job.cursor++, x = points[n * 2], y = points[n * 2 + 1];
      if (solid(x, y + job.groundReach)) { queue[job.queued++] = n; next[n] = -1; }
      else {
        var key = coords[n * 2 + 1] * width + coords[n * 2];
        var slot = direct ? (coords[n * 2 + 1] - job.baseRow) * job.span + coords[n * 2] - job.baseCol : 0;
        var head = direct ? (stamps[slot] === epoch ? heads[slot] : undefined) : map.get(key);
        next[n] = head === undefined ? -1 : head;
        if (direct) { stamps[slot] = epoch; heads[slot] = n; } else map.set(key, n);
      }
      if ((++work & 255) === 0 && performance.now() >= deadline) return;
    }
    job.phase = 1;
    while (job.q < job.queued) {
      var p = queue[job.q++], px = points[p * 2], py = points[p * 2 + 1];
      var col = coords[p * 2], row = coords[p * 2 + 1], cellKey = row * width + col;
      var bucket = job.bed.get(cellKey);
      if (!bucket) { bucket = []; job.bed.set(cellKey, bucket); }
      bucket.push(px, py);
      var rMin = -1, rMax = 1, cMin = -1, cMax = 1;
      if (job.pruneCells && col > 0 && col < width - 1) {
        var pad = 1.4210854715202004e-14 * (px + Math.abs(py) + cell + reach + 1);
        rMin = floor((py - reach - pad) / cell) - row;
        rMax = floor((py + reach + pad) / cell) - row;
        cMin = floor((px - reach - pad) / cell) - col;
        cMax = floor((px + reach + pad) / cell) - col;
        if (rMin < -1) rMin = -1; if (rMax > 1) rMax = 1;
        if (cMin < -1) cMin = -1; if (cMax > 1) cMax = 1;
      }
      for (var r = rMin; r <= rMax; r++) for (var c = cMin; c <= cMax; c++) {
        var nearKey = (row + r) * width + col + c;
        var nearSlot = direct ? (row + r - job.baseRow) * job.span + col + c - job.baseCol : 0;
        var current = direct ? (stamps[nearSlot] === epoch ? heads[nearSlot] : undefined) : map.get(nearKey), previous = -1;
        while (current !== undefined && current >= 0) {
          var following = next[current];
          var dx = px - points[current * 2], dy = py - points[current * 2 + 1];
          if (dx * dx + dy * dy <= reach2) {
            if (previous < 0) {
              if (direct) { stamps[nearSlot] = epoch; heads[nearSlot] = following; }
              else map.set(nearKey, following);
            }
            else next[previous] = following;
            queue[job.queued++] = current;
          } else previous = current;
          current = following;
        }
      }
      if ((++work & 63) === 0 && performance.now() >= deadline) return;
    }
    // Complete: publish, keeping grains admitted while the search ran.
    for (var k = 0; k < job.inserted.length; k += 2) snowInsertContact(job.bed, job.inserted[k], job.inserted[k + 1]);
    snow.bed = job.bed; snow.bedKey = job.key; snowSupportJob = null;
  }
  function snowInsertContact(bed, x, y) {
    var cell = Math.max(LIQUID_CELL, snowSupportDistance()), width = Math.ceil(COLS * TILE / cell) + 1;
    var key = Math.floor(y / cell) * width + Math.floor(x / cell), bucket = bed.get(key);
    if (!bucket) { bucket = []; bed.set(key, bucket); }
    bucket.push(x, y);
  }
  function snowTouchesBed(x, y, bed, reach) {
    var cell = Math.max(LIQUID_CELL, snowSupportDistance()), width = Math.ceil(COLS * TILE / cell) + 1;
    var col = Math.floor(x / cell), row = Math.floor(y / cell), reach2 = reach * reach;
    for (var r = -1; r <= 1; r++) for (var c = -1; c <= 1; c++) {
      var grains = bed.get((row + r) * width + col + c);
      if (!grains) continue;
      for (var i = 0; i < grains.length; i += 2) {
        var dx = x - grains[i], dy = y - grains[i + 1];
        if (dx * dx + dy * dy <= reach2) return true;
      }
    }
    return false;
  }
  function snowSupported(x, y, bed) {
    return liquidWorldSolidAt(x, y + snowContactRadius() + 0.3) ||
      snowTouchesBed(x, y, bed || snow.bed, snowSupportDistance());
  }
  function snowBedContact(x, y) {
    return snowTouchesBed(x, y, snow.bed, snowContactRadius() * 2);
  }
  // Heat comes only from wet cells or a thaw under open sky. With neither,
  // every thaw probability below is exactly zero.
  function snowThawPossible() {
    if (snow.temperature > 0) return true;
    for (var key in rain.waterCells) if (rain.waterCells[key] >= 10) return true;
    return false;
  }
  function snowScan(dt, maintenanceDt, deferBed) {
    if (maintenanceDt === undefined) maintenanceDt = dt;
    liquidToolSync();
    // Snapshots refresh only weather landing, storage and thaw bookkeeping.
    // Resident physical grains never transfer out of their contact solver.
    var gpu = liquidWGPU && liquidWGPU.simActive;
    var generation = gpu ? liquidWGPU.readbackApplyGen | 0 : 0;
    var fresh = !gpu || generation !== snow.readbackGen;
    if (gpu && fresh) snow.readbackGen = generation;
    var thaw = !!maintenanceDt && snowThawPossible(), active = 0;
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 5) continue;
      var x = liquidX[i], y = liquidY[i];
      if (maintenanceDt && !snowVisible(x, y) && snowStore(x, y, liquidVX[i], liquidVY[i])) { removeLiquidParticle(i); continue; }
      // Physical snow stays in the contact solver in flight and on land.
      // GPU readback is only for maintenance, never a motion-mode switch.
      if (thaw && Math.random() < 1 - Math.exp(-snowHeat(x, y) * maintenanceDt) && snowMeltParticle(i)) continue;
      active++;
    }
    snow.active = active;
    var budget = Math.min(600, snowActiveCap() - active, LIQUID_MAX_PARTICLES - liquidCount - 4096);
    for (var j = maintenanceDt ? snow.parked.length - 4 : -1; j >= 0; j -= 4) {
      var px = snow.parked[j], py = snow.parked[j + 1], remove = false;
      if (thaw && Math.random() < 1 - Math.exp(-snowHeat(px, py) * maintenanceDt) && rain.waterCount + rain.parked.length / 2 < RAIN_STORAGE_CAP) {
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
    // Do not leave removed/lofted grains in this frame's landing surface.
    // Maintenance does not query support; build only the final landing surface.
    // The same snapshot and particle set always produce the same bed.
    var bedKey = generation + ':' + liquidMutationSeq;
    if (!deferBed) { snow.bed = snowBuildSupport(); snow.bedKey = bedKey; snowSupportJob = null; }
    else if (bedKey !== snow.bedKey && !snowSupportJob) snowSupportJobStart(bedKey);
    snow.mass = snow.active + snow.parked.length / 4 + snow.grains.length + snow.airCount;
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
  function updateSnow(dt, intensity) {
    if (intensity === undefined) intensity = rain.intensity;
    // Migrate physical powder from older saves back to persistent grains.
    for (var old = snow.grains.length - 1; old >= 0; old--) {
      var grain = snow.grains[old];
      if (grain.physical && snowLand(grain, false)) {
        snow.grains[old] = snow.grains[snow.grains.length - 1]; snow.grains.pop();
      }
    }
    updateSnowAir(dt);
    snow.time += dt; snow.temperature = snowTemperature();
    snow.tick += dt;
    snowSkyExposure.clear();
    // Storage and thaw use a slower budget. Newly solved snapshots refresh
    // the landing surface for atmospheric flakes without moving any grains.
    var maintenanceDt = snow.tick >= 0.12 ? snow.tick : 0;
    // GPU snapshots are consumed on this maintenance clock, not on every
    // readback: wet residents request a readback every second frame, and
    // rebuilding the landing bed for each one cost 3 ms of CPU 30 to 60
    // times a second. The bed is rebuilt only when the snapshot or particle
    // set changed, as a search spread over frames.
    var gpuMirror = !!(liquidWGPU && liquidWGPU.simActive);
    var liveCPUContact = !gpuMirror && snow.active > 0 && snow.grains.length > 0;
    if (maintenanceDt || liveCPUContact) snowScan(dt, maintenanceDt, gpuMirror);
    if (gpuMirror) snowSupportJobStep(SNOW_SUPPORT_SLICE_MS);
    if (maintenanceDt) snow.tick = 0;
    var surf = SKY_ROWS * TILE, sky = cam.y < surf, rect = particleWeatherRect();
    var left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
    var width = Math.max(0, right - left), height = Math.max(0, bottom - top);
    particleWeatherField(snow.field, rect, snow.grains, SNOW_RATE / (1100 * 53), SNOW_FLAKE_CAP,
      intensity, surfaceWind.current * 35, [32, 53, 74], dt, snowSpawn, snowRetire);
    rainCatchLakes(dt, sky, left, right, snow.field.strength, SNOW_RATE);
    // Resolve the lowest falling grains first. Each landing immediately
    // becomes a contact for the grains above it; arbitrary storage order
    // could otherwise grow the bed through an unprocessed lower grain.
    snow.grains.sort(function (a, b) { return a.y - b.y; });
    for (var i = snow.grains.length - 1; i >= 0; i--) {
      var p = snow.grains[i], wind = surfaceWind.current * 35 + 12 * Math.sin(snow.time * 0.43 + p.y * 0.006);
      if (p.y > surf) wind *= 0.18;
      var air = snowAirAt(p.x, p.y);
      // Solve dv/dt = gravity + drag * (airVelocity - velocity). Different
      // grain sizes have different mass/area ratios and terminal speeds.
      // No prescribed arc, random launch impulse or minimum falling speed:
      // momentum crosses the apex continuously, even in a fading updraft.
      var fall = 32 + p.size * 42, drag = GRAVITY / fall;
      var keep = Math.exp(-drag * dt);
      p.vx = wind + air[0] + (p.vx - wind - air[0]) * keep;
      p.vy = air[1] + fall + (p.vy - air[1] - fall) * keep;
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 2));
      var remove = false;
      for (var step = 0; step < steps; step++) {
        var nx = p.x + p.vx * dt / steps, ny = p.y + p.vy * dt / steps;
        var key = rainCell(nx, ny + 2);
        var radius = snowContactRadius();
        var floor = liquidWorldSolidAt(nx, ny + radius);
        var bed = p.vy >= 0 && snowBedContact(nx, ny);
        var contact = floor || bed || liquidPointInMiner(nx, ny) || (rain.cells[key] || 0) > 1;
        if (contact) {
          if (floor || bed) {
            // Resolve the first touch, rather than parking at the start of
            // the last swept segment (which can still be two pixels away).
            var lo = 0, hi = 1;
            for (var bisect = 0; bisect < 8; bisect++) {
              var mid = (lo + hi) * 0.5;
              var tx = p.x + (nx - p.x) * mid, ty = p.y + (ny - p.y) * mid;
              if (liquidWorldSolidAt(tx, ty + radius) || (bed && snowBedContact(tx, ty))) hi = mid;
              else lo = mid;
            }
            p.x += (nx - p.x) * lo; p.y += (ny - p.y) * lo;
          }
          // Dry powder's landing is inelastic. Do not inject the incoming
          // normal momentum into pile pressure and turn it into a rebound.
          if ((floor || bed) && p.vy > 0) p.vy = 0;
          remove = snowLand(p, false); break;
        }
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
    var grains = Array.isArray(data.grains) ? data.grains : [], weatherCount = 0;
    for (var g = 0; g < Math.min(SNOW_MASS_CAP, grains.length) && snow.parked.length / 4 + snow.grains.length < SNOW_MASS_CAP; g++) {
      var p = grains[g];
      if (!Array.isArray(p) || p.length < 8 || !p.every(Number.isFinite) || !valid(p[0], p[1], p[2], p[3]) || !Number.isInteger(p[4]) || p[4] < 1 || p[4] > 12) continue;
      if (p[4] > 1) {
        // Older saves bundled several grains into one record. Expand only
        // within the shared material budget, including restored flight.
        for (var n = 0; n < p[4] && snow.parked.length / 4 + snow.grains.length < SNOW_MASS_CAP; n++)
          snowStore(p[0] + (n % 3) * 1.3, p[1] - Math.floor(n / 3) * 1.3, p[2], p[3]);
      } else if (p[5] || (data.field && weatherCount < SNOW_FLAKE_CAP)) {
        var grain = { x: p[0], y: p[1], vx: p[2], vy: p[3], size: Math.max(0, Math.min(1, p[6])), phase: p[7] };
        if (p[5]) grain.physical = true;
        else weatherCount++;
        if (!p[5] && p.length === 12 && Number.isInteger(p[8]) && p[8] >= 0 && p[8] <= 2 && Number.isInteger(p[9]) && Number.isInteger(p[10]) && p[11] >= 0 && p[11] <= 1) {
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
