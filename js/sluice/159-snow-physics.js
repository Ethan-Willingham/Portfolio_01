  /* ---- Snow: drifting grains, compressible banks, conserved meltwater ---- */
  // Resting snow uses sparse four-pixel columns, not thousands of awake fluid
  // particles. Mass is measured in whole water particles. Packing changes its
  // volume, never its mass; only disturbed material returns to ballistic grains.
  var worldSnowEnabled = false;
  var SNOW_CELL = 4, SNOW_RATE = 115, SNOW_MAX_DEPTH = 88;
  var SNOW_FLAKE_CAP = 1800, SNOW_POWDER_CAP = 384;
  var SNOW_BANK_CAP = 8192, SNOW_MASS_CAP = 60000;
  var SNOW_SETTLE_OFFSETS = [0, -1, 1, -2, 2];
  var snow = { time: 0, tick: 0, credit: 0, outsideCredit: 0, primed: false,
    banks: [], cells: {}, grains: [], mass: 0, emitted: 0, melted: 0, collected: 0,
    escaped: 0, powder: 0, packed: 0, temperature: -4, rigDepth: 0,
    rigX: null, rigY: null, pass: 0 };

  function snowNewWorldEnabled() {
    var q = /[?&]snow=([01])(?:&|$)/.exec(window.location.search || '');
    if (q) return q[1] === '1';
    if (/[?&]rain=[01](?:&|$)/.test(window.location.search || '')) return false;
    return !!(window.SluiceOptions && window.SluiceOptions.particleSnow);
  }
  function snowReset(enabled) {
    worldSnowEnabled = enabled === true;
    snow.time = snow.tick = snow.credit = snow.outsideCredit = 0;
    snow.mass = snow.emitted = snow.melted = snow.collected = snow.escaped = snow.powder = snow.packed = snow.pass = 0;
    snow.banks.length = snow.grains.length = 0;
    snow.cells = {}; snow.primed = false; snow.rigX = snow.rigY = null; snow.rigDepth = 0;
    snow.temperature = -4;
  }
  function snowKey(col, row) { return row * Math.ceil(COLS * TILE / SNOW_CELL) + col; }
  function snowVolume(pack) { return 11 - 7.5 * pack; }
  function snowHeight(bank) { return bank.mass * snowVolume(bank.pack) / SNOW_CELL; }
  function snowBank(col, row, create) {
    if (col < 1 || col >= Math.floor(COLS * TILE / SNOW_CELL) - 1 || row < 0 || row >= TOTAL_ROWS) return null;
    var key = snowKey(col, row), bank = snow.cells[key];
    if (!bank && create && snow.banks.length < SNOW_BANK_CAP) {
      bank = { key: key, col: col, row: row, mass: 0, pack: 0, melt: 0 };
      snow.cells[key] = bank; snow.banks.push(bank);
    }
    return bank;
  }
  function snowDeposit(col, row, mass, pack) {
    if (!(mass > 0)) return false;
    var bank = snowBank(col, row, true);
    if (!bank || snowHeight(bank) >= SNOW_MAX_DEPTH) return false;
    bank.pack = (bank.pack * bank.mass + pack * mass) / (bank.mass + mass);
    bank.mass += mass;
    return true;
  }
  function snowSettle(x, row, count, pack, spread) {
    var center = Math.floor(x / SNOW_CELL), placed = 0;
    for (var n = 0; n < count; n++) {
      var offset = count > 1 ? SNOW_SETTLE_OFFSETS[n % 5] * (spread || 1) : 0;
      var col = center + offset, bx = (col + 0.5) * SNOW_CELL;
      if (!liquidWorldSolidAt(bx, row * TILE + 1) || liquidWorldSolidAt(bx, row * TILE - 1)) continue;
      if (snowDeposit(col, row, 1, pack)) placed++;
    }
    return placed;
  }
  function snowSupportRow(x, y, maxRows) {
    var start = Math.max(0, Math.floor(y / TILE)), col = Math.floor(x / TILE);
    for (var row = start; row < Math.min(TOTAL_ROWS, start + maxRows); row++) {
      if (liquidWorldSolidAt(x, row * TILE + 1)) return row;
    }
    return -1;
  }
  function snowAt(x, y, reach) {
    var col = Math.floor(x / SNOW_CELL), start = Math.max(0, Math.floor((y - reach) / TILE));
    for (var row = start; row <= Math.min(TOTAL_ROWS - 1, Math.floor((y + SNOW_MAX_DEPTH + reach) / TILE)); row++) {
      var bank = snowBank(col, row, false);
      if (!bank || bank.mass <= 0) continue;
      var base = row * TILE, top = base - snowHeight(bank);
      if (y + reach >= top && y - reach <= base + 1) return bank;
    }
    return null;
  }
  function snowSeedWorld() {
    if (!worldSnowEnabled) return;
    // A thin, uneven dusting makes the material available on the first drive.
    // Lake water stays liquid; no decorative ice lid changes its collision.
    for (var col = 1; col < COLS * TILE / SNOW_CELL - 1; col++) {
      var x = (col + 0.5) * SNOW_CELL, tile = tileAt(SKY_ROWS, Math.floor(x / TILE));
      if (!tile || tile.type === 'foundation' || !liquidWorldSolidAt(x, SKY_ROWS * TILE + 1)) continue;
      var mass = 1 + (wHash(Math.floor(col / 4), 0, 731) > 0.45 ? 1 : 0);
      if (snowDeposit(col, SKY_ROWS, mass, 0)) { snow.mass += mass; snow.emitted += mass; }
    }
  }

  function snowAddGrain(x, y, vx, vy, mass, powder) {
    if (snow.grains.length >= SNOW_FLAKE_CAP + SNOW_POWDER_CAP || (powder && snow.powder >= SNOW_POWDER_CAP)) return false;
    snow.grains.push({ x: x, y: y, vx: vx, vy: vy, mass: mass, powder: powder ? 1 : 0,
      size: Math.random(), phase: Math.random() * Math.PI * 2, age: 0 });
    if (powder) snow.powder++;
    return true;
  }
  function snowLift(bank, count, vx, vy) {
    count = Math.min(bank.mass, Math.max(0, Math.floor(count)), 12);
    if (!count) return 0;
    var x = (bank.col + 0.5) * SNOW_CELL, y = bank.row * TILE - snowHeight(bank) - 1;
    if (!snowAddGrain(x, y, vx, vy, count, true)) return 0;
    bank.mass -= count;
    return count;
  }
  function snowMelt(x, y, count, vx, vy) {
    // Commit the state change only after the water has a destination. Solver
    // pressure cannot silently destroy snow or mint a second copy of its mass.
    var gpu = liquidWGPU && liquidWGPU.simActive;
    count = Math.max(0, Math.min(Math.floor(count), rainRoom(gpu ? RAIN_WATER_CAP : RAIN_CPU_CAP)));
    if (!count || liquidWorldSolidAt(x, y)) return 0;
    var visible = x >= cam.x - 220 && x <= cam.x + screenW + 220 &&
      y >= cam.y - 220 && y <= cam.y + screenH + 220;
    if (visible) count = Math.min(count, Math.max(0, LIQUID_MAX_PARTICLES - liquidCount - 4096));
    var made = 0;
    for (; made < count; made++) {
      if (visible) {
        if (addLiquidParticle(0, x + (made % 2) * 0.65, y - Math.floor(made / 2) * 1.25, vx || 0, vy || 0, RAIN_ORIGIN) < 0) break;
        rain.waterCount++;
      } else rain.parked.push(x, y);
      var lake = rainLakeAt(x, y);
      if (lake) { lake.rainCount = (lake.rainCount || 0) + 1; rain.lakeCount++; }
    }
    snow.mass -= made; snow.melted += made;
    return made;
  }

  function snowTemperature() {
    var day = scatDayWeight(computeSunElevation(timeOfDay));
    // Cold fronts lay down powder. The milder air behind them thaws it over
    // the following dry spell, with sunlight accelerating the change.
    var wet = weatherForce >= 0 ? WEATHER_MOODS[weatherForce].pcp > 0.05 : rain.climate.phase === 2 || rain.climate.phase === 1;
    return wet ? -5 + day : 1.5 + day * 3;
  }
  function snowBankTick(dt) {
    snow.pass++;
    for (var n = snow.banks.length - 1; n >= 0; n--) {
      var bank = snow.banks[n], x = (bank.col + 0.5) * SNOW_CELL, base = bank.row * TILE;
      if (bank.mass <= 0) {
        delete snow.cells[bank.key]; snow.banks[n] = snow.banks[snow.banks.length - 1]; snow.banks.pop(); continue;
      }
      if (!liquidWorldSolidAt(x, base + 1)) {
        // Mining or a blast removes the support, so the actual bank falls.
        snowLift(bank, 12, (Math.random() - 0.5) * 25, 25);
        continue;
      }
      var tile = tileAt(bank.row, Math.floor(x / TILE));
      var heat = Math.max(0, snow.temperature) * 0.035 + (tile && tile.type === 'foundation' ? 0.14 : 0.002);
      var rigDX = x - (player.x + PLAYER_W * 0.5), rigDY = base - player.y - PLAYER_H;
      var close = Math.abs(rigDX) < 65 && rigDY > -8 && rigDY < 35;
      if (close) heat += 0.2 * (1 - Math.abs(rigDX) / 65);
      if ((rain.cells[rainCell(x, base - 2)] || 0) >= 4) heat += 4;
      var jet = player.thrusting && player.jetForce > 1 && !gameOver && !gameWon && rigDY >= -4 && rigDY < 135 && Math.abs(rigDX) < 15 + rigDY * 0.5;
      if (jet) {
        heat += (1 - rigDY / 150) * (player.thrustSpool || 0) * 3;
        snowLift(bank, 1 + Math.floor((player.thrustSpool || 0) * 4),
          (rigDX < 0 ? -1 : 1) * (70 + Math.random() * 100), -50 - Math.random() * 110);
      }
      bank.melt = Math.min(bank.mass, bank.melt + heat * dt);
      if (bank.melt >= 1) {
        var lost = snowMelt(x, base - 1.6, Math.min(4, Math.floor(bank.melt)), 0, 0);
        bank.mass -= lost; bank.melt -= lost;
      }
      // Slow sintering settles undisturbed powder without deleting water.
      bank.pack += Math.max(0, 0.75 - bank.pack) * dt * (snow.temperature > 0 ? 0.002 : 0.0005);
      var dir = (snow.pass + bank.col) % 2 ? 1 : -1;
      var neighborX = x + dir * SNOW_CELL, neighbor = snowBank(bank.col + dir, bank.row, false);
      var height = snowHeight(bank), otherHeight = neighbor ? snowHeight(neighbor) : 0;
      var excess = height - otherHeight - (3.5 + bank.pack * 5);
      if (bank.mass > 1 && excess > 0.5) {
        var move = Math.min(bank.mass - 1, 12, Math.max(1, Math.floor(excess * SNOW_CELL /
          (snowVolume(bank.pack) + snowVolume(neighbor ? neighbor.pack : bank.pack)))));
        if (liquidWorldSolidAt(neighborX, base + 1)) {
          // A higher ledge is a wall, not somewhere to bury displaced snow.
          if (!liquidWorldSolidAt(neighborX, base - 1) && snowDeposit(bank.col + dir, bank.row, move, bank.pack)) bank.mass -= move;
        } else snowLift(bank, move, dir * 28, -8);
      }
    }
  }

  function snowFootBank(px, py) {
    var best = null;
    for (var i = 0; i < PLAYER_FOOT_OFFSETS.length; i++) {
      var bank = snowAt(px + PLAYER_FOOT_OFFSETS[i], py + PLAYER_H, 10);
      if (!bank || snowHeight(bank) < 0.8 || !liquidWorldSolidAt((bank.col + 0.5) * SNOW_CELL, bank.row * TILE + 1)) continue;
      if (!best || bank.row < best.row) best = bank;
    }
    return best;
  }
  function snowRestFeet(bank) { return bank.row * TILE - Math.min(9, snowHeight(bank) * 0.35); }
  function snowFootSupport(px, py) {
    if (!worldSnowEnabled || bathMode || player.lastMoveD) return false;
    var bank = snowFootBank(px, py);
    return !!bank && Math.abs(py + PLAYER_H - snowRestFeet(bank)) < (player.onSnow ? 9 : 5);
  }
  function snowRigCatch(px, oldY, newY, wasSupported) {
    if (!worldSnowEnabled || bathMode || player.vy < 0 || drilling || player.onJello || player.lastMoveD) return null;
    var bank = snowFootBank(px, newY);
    if (!bank) return null;
    var rest = snowRestFeet(bank);
    if (oldY + PLAYER_H > rest + 10 || newY + PLAYER_H < rest - (wasSupported ? 12 : 0)) return null;
    var result = rest - PLAYER_H;
    if (solidAt(px, result, PLAYER_W, PLAYER_H)) return null;
    snow.rigDepth = snowHeight(bank);
    return result;
  }
  function snowRigDrag(dt) {
    if (!worldSnowEnabled || bathMode) return;
    var bank = snowFootBank(player.x, player.y);
    if (!bank || player.y + PLAYER_H < bank.row * TILE - snowHeight(bank) - 2) return;
    var depth = snowHeight(bank);
    player.vx *= Math.exp(-Math.min(1.6, depth / 25) * dt);
  }
  function snowLanding(speed) {
    var cushion = Math.min(0.8, snow.rigDepth / 60);
    recordLandingImpact(speed, player.y + PLAYER_H, 'snow', cushion);
    snowBlast(player.x + PLAYER_W * 0.5, player.y + PLAYER_H, Math.min(52, 15 + speed * 0.035));
    var damage = FALL_IMPACT_FX ? fallDamageForImpact(speed) * (1 - cushion) : 0;
    if (damage > 0) {
      player.hull -= damage; damageFlashT = Math.max(damageFlashT, Math.min(1, damage / 90));
      sfxPlay('land-damage', { gain: 0.6 });
      if (player.hull <= 0) endGame({ type: 'fall', speed: speed, damage: damage });
    } else sfxPlay('land-soft', { gain: 0.5 });
  }
  function snowRigPlow(dt) {
    var moved = snow.rigX === null ? 0 : player.x - snow.rigX;
    snow.rigX = player.x; snow.rigY = player.y;
    if (Math.abs(moved) > 80 || gameOver || gameWon) return;
    var feet = player.y + PLAYER_H, dir = player.vx < 0 ? -1 : 1;
    for (var col = Math.floor(player.x / SNOW_CELL); col <= Math.floor((player.x + PLAYER_W) / SNOW_CELL); col++) {
      var bank = snowAt((col + 0.5) * SNOW_CELL, feet, 4);
      if (!bank || feet < bank.row * TILE - snowHeight(bank) - 1) continue;
      var before = bank.pack;
      bank.pack += (0.92 - bank.pack) * (1 - Math.exp(-dt * 14));
      if (before < 0.5 && bank.pack >= 0.5) snow.packed++;
      if (player.lastMoveD) {
        // Down reaches the terrain under the powder using the normal drill.
        snowLift(bank, 6, (col * SNOW_CELL < player.x + PLAYER_W * 0.5 ? -1 : 1) * 55, -40);
        continue;
      }
      if (Math.abs(moved) < 0.03) continue;
      var clearance = Math.max(3, bank.row * TILE - feet + 3);
      var keep = Math.floor(clearance * SNOW_CELL / snowVolume(bank.pack));
      var amount = Math.min(8, Math.max(0, bank.mass - keep));
      if (!amount) continue;
      var forward = dir > 0 ? player.x + PLAYER_W + 6 : player.x - 6;
      var row = snowSupportRow(forward, feet - 12, 5), movedMass = 0;
      // Most snow rolls into the bow bank; a small fraction breaks into powder.
      var roll = Math.floor(amount * 0.7);
      if (row >= 0 && row * TILE - feet < 16 && !liquidWorldSolidAt(forward, row * TILE - 1)) {
        // A track-wide wedge rolls ahead of the hull, not one needle column.
        movedMass = snowSettle(forward + dir * 12, row, roll, 0.25, 2);
      }
      bank.mass -= movedMass;
      snowLift(bank, amount - movedMass, dir * (45 + Math.abs(player.vx) * 0.38), -45 - Math.random() * 65);
    }
  }
  function snowBlast(x, y, radius) {
    if (!worldSnowEnabled || bathMode) return;
    for (var i = 0; i < snow.banks.length; i++) {
      var bank = snow.banks[i], bx = (bank.col + 0.5) * SNOW_CELL, by = bank.row * TILE - snowHeight(bank) * 0.5;
      var dx = bx - x, dy = by - y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      var strength = 1 - dist / radius;
      snowLift(bank, Math.ceil(bank.mass * strength), dx / Math.max(1, dist) * 220 * strength, -80 - 180 * strength);
    }
  }
  function snowScoop(x, y, radius, ry, fromX, fromY, count) {
    if (!worldSnowEnabled || bathMode || count <= 0) return 0;
    var taken = 0;
    for (var i = 0; i < snow.banks.length && taken < count; i++) {
      var bank = snow.banks[i], bx = (bank.col + 0.5) * SNOW_CELL, by = bank.row * TILE - snowHeight(bank) * 0.5;
      var dx = (bx - x) / radius, dy = (by - y) / ry;
      if (dx * dx + dy * dy > 1 || !liquidLineClear(fromX, fromY, bx, by)) continue;
      var amount = Math.min(bank.mass, count - taken);
      bank.mass -= amount; taken += amount;
    }
    for (var j = snow.grains.length - 1; j >= 0 && taken < count; j--) {
      var p = snow.grains[j], gx = (p.x - x) / radius, gy = (p.y - y) / ry;
      if (gx * gx + gy * gy > 1 || !liquidLineClear(fromX, fromY, p.x, p.y)) continue;
      var grab = Math.min(p.mass, count - taken);
      p.mass -= grab; taken += grab;
      if (!p.mass) { if (p.powder) snow.powder--; snow.grains[j] = snow.grains[snow.grains.length - 1]; snow.grains.pop(); }
    }
    // The rig's warm tank receives water, at exactly the snow's water mass.
    snow.mass -= taken; snow.collected += taken;
    return taken;
  }

  function snowSpawn(top, left, width, prime) {
    if (snow.mass >= SNOW_MASS_CAP || snow.grains.length - snow.powder >= SNOW_FLAKE_CAP) return;
    var x = left + Math.random() * width;
    var y = prime ? top + Math.random() * Math.max(0, SKY_ROWS * TILE - top - 8) : top;
    if (liquidWorldSolidAt(x, y)) return;
    if (snowAddGrain(x, y, surfaceWind.current * 28, 35 + Math.random() * 32, 1, false)) {
      snow.mass++; snow.emitted++;
    }
  }
  function snowOutside(dt, sky, left, right) {
    // The unseen surface uses the same snowfall rate without airborne physics.
    // Sampling the uncovered width avoids double-counting the visible strip.
    var covered = sky ? Math.max(0, right - left) : 0;
    snow.outsideCredit += Math.max(0, COLS * TILE - covered) * SNOW_RATE / 1100 * rain.intensity * dt;
    var count = Math.min(80, Math.floor(snow.outsideCredit), SNOW_MASS_CAP - snow.mass);
    snow.outsideCredit = Math.min(80, snow.outsideCredit - count);
    for (var i = 0; i < count; i++) {
      var x = 3 + Math.random() * (COLS * TILE - covered - 6);
      if (sky && x >= left) x += covered;
      if (x >= COLS * TILE - 3 || rainLakeAt(x, SKY_ROWS * TILE + 1)) continue;
      var row = snowSupportRow(x, SKY_ROWS * TILE, 16);
      if (row >= 0 && snowDeposit(Math.floor(x / SNOW_CELL), row, 1, 0)) { snow.mass++; snow.emitted++; }
    }
  }
  function updateSnow(dt) {
    snow.time += dt; snow.temperature = snowTemperature();
    snowRigPlow(dt);
    snow.tick += dt;
    while (snow.tick >= 0.05) { snowBankTick(0.05); snow.tick -= 0.05; }
    var surf = SKY_ROWS * TILE, sky = cam.y < surf && cam.y + screenH > surf - 2000;
    var left = Math.max(3, cam.x - 140), right = Math.min(COLS * TILE - 3, cam.x + screenW + 140);
    var width = Math.max(0, right - left), top = Math.max(surf - 2200, Math.min(cam.y - 18, surf - 150));
    rainCatchLakes(dt, sky, left, right);
    snowOutside(dt, sky, left, right);
    var rate = SNOW_RATE * Math.min(1.7, width / 1100) * rain.intensity;
    if (sky && !snow.primed && rain.intensity > 0) {
      var initial = Math.min(700, Math.round(rate * (surf - top) / 60));
      for (var n = 0; n < initial; n++) snowSpawn(top, left, width, true);
      snow.primed = true;
    }
    snow.credit = sky && rain.intensity > 0 ? Math.min(40, snow.credit + rate * dt) : 0;
    var births = Math.min(Math.floor(snow.credit), SNOW_FLAKE_CAP - snow.grains.length + snow.powder);
    for (var b = 0; b < births; b++) snowSpawn(top, left, width, false);
    snow.credit -= births;
    for (var i = snow.grains.length - 1; i >= 0; i--) {
      var p = snow.grains[i]; p.age += dt;
      var wind = surfaceWind.current * 35 + 12 * Math.sin(snow.time * 0.43 + p.y * 0.006);
      if (p.y > surf) wind *= 0.18;
      if (p.powder) { p.vx += (wind - p.vx) * Math.min(1, dt * 1.1); p.vy = Math.min(240, p.vy + 360 * dt); }
      else {
        var flutter = Math.sin(snow.time * (1.4 + p.size) + p.phase) * (13 + p.size * 16);
        p.vx += (wind + flutter - p.vx) * Math.min(1, dt * 1.5);
        p.vy += (32 + p.size * 42 + Math.sin(snow.time * 1.7 + p.phase) * 9 - p.vy) * Math.min(1, dt * 2);
      }
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 3));
      var remove = false;
      for (var s = 0; s < steps; s++) {
        var nx = p.x + p.vx * dt / steps, ny = p.y + p.vy * dt / steps;
        if ((rain.cells[rainCell(nx, ny)] || 0) >= 4) {
          var melted = snowMelt(p.x, p.y, p.mass, p.vx * 0.3, 30);
          p.mass -= melted;
          if (!p.mass) remove = true;
          break;
        }
        if (liquidPointInMiner(nx, ny)) {
          // The warm hull sheds flakes. Cold powder kicked by the tracks fans
          // out around it instead of sticking inside the moving collider.
          var side = nx < player.x + PLAYER_W * 0.5 ? -1 : 1;
          p.x = side < 0 ? player.x - 3 : player.x + PLAYER_W + 3;
          p.vx = player.vx * 0.4 + side * 35; p.vy = -12;
          break;
        }
        var bank = snowAt(nx, ny, 0), solid = liquidWorldSolidAt(nx, ny + 1);
        if ((bank && p.vy >= 0) || solid) {
          var row = bank ? bank.row : Math.floor((ny + 1) / TILE);
          if (!solid || p.vy >= 0 && p.y <= row * TILE + 1) {
            p.mass -= snowSettle(nx, row, p.mass, p.powder ? 0.15 : 0, 1);
            remove = p.mass === 0;
          }
          if (!remove) { p.vx = -p.vx * 0.35; p.vy = Math.abs(p.vy) * 0.3; }
          break;
        }
        p.x = nx; p.y = ny;
      }
      if (!remove && (p.x < 2 || p.x >= COLS * TILE - 2 || p.y >= TOTAL_ROWS * TILE)) {
        snow.mass -= p.mass; snow.escaped += p.mass; remove = true;
      }
      // Distant grains settle at the first actual support, never disappear
      // when the camera moves. Open shafts remain open all the way down.
      if (!remove && (p.x < cam.x - screenW || p.x > cam.x + screenW * 2 || p.y > cam.y + screenH + 200)) {
        var support = snowSupportRow(p.x, p.y, TOTAL_ROWS);
        if (support >= 0) {
          var lake = rainLakeAt(p.x, support * TILE - 2);
          if (lake && lake.rainCount > 0) {
            var waterY = (SKY_ROWS + lake.d) * TILE - Math.max(2, lake.rainCount * 1.5625 / ((lake.cR - lake.cL + 1) * TILE));
            p.mass -= snowMelt(p.x, waterY, p.mass, 0, 0);
          } else p.mass -= snowSettle(p.x, support, p.mass, p.powder ? 0.15 : 0, 1);
          remove = p.mass === 0;
        }
      }
      if (remove) { if (p.powder) snow.powder--; snow.grains[i] = snow.grains[snow.grains.length - 1]; snow.grains.pop(); }
    }
  }

  function snowSave() {
    if (!worldSnowEnabled) return null;
    return { banks: snow.banks.filter(function (b) { return b.mass > 0; }).map(function (b) {
      return [b.col, b.row, b.mass, Math.round(b.pack * 1000) / 1000, b.melt];
    }), grains: snow.grains.map(function (p) { return [p.x, p.y, p.vx, p.vy, p.mass, p.powder, p.size, p.phase]; }) };
  }
  function snowRestore(data) {
    if (!worldSnowEnabled || !data) return;
    var banks = Array.isArray(data.banks) ? data.banks : [];
    for (var i = 0; i < Math.min(SNOW_BANK_CAP, banks.length); i++) {
      var b = banks[i];
      if (!Array.isArray(b) || b.length < 4 || !b.every(Number.isFinite) || !Number.isInteger(b[0]) ||
          !Number.isInteger(b[1]) || !Number.isInteger(b[2]) || b[2] <= 0 || b[2] > 128 || b[3] < 0 || b[3] > 1 ||
          b[2] * snowVolume(b[3]) / SNOW_CELL > SNOW_MAX_DEPTH + 3) continue;
      if (snow.mass + b[2] > SNOW_MASS_CAP || snowBank(b[0], b[1], false)) continue;
      var bank = snowBank(b[0], b[1], true);
      if (!bank) continue;
      bank.mass = b[2]; bank.pack = b[3]; bank.melt = Math.max(0, Math.min(bank.mass, b[4] || 0)); snow.mass += b[2];
    }
    var grains = Array.isArray(data.grains) ? data.grains : [];
    for (var j = 0; j < Math.min(SNOW_FLAKE_CAP + SNOW_POWDER_CAP, grains.length); j++) {
      var p = grains[j];
      if (!Array.isArray(p) || p.length < 8 || !p.every(Number.isFinite) || p[0] < 2 || p[0] >= COLS * TILE - 2 ||
          p[1] < -20000 || p[1] >= TOTAL_ROWS * TILE || Math.abs(p[2]) > 1000 || Math.abs(p[3]) > 1000 ||
          !Number.isInteger(p[4]) || p[4] <= 0 || p[4] > 12 || snow.mass + p[4] > SNOW_MASS_CAP) continue;
      if (snowAddGrain(p[0], p[1], p[2], p[3], p[4], p[5] === 1)) {
        var grain = snow.grains[snow.grains.length - 1]; grain.size = Math.max(0, Math.min(1, p[6])); grain.phase = p[7];
        snow.mass += p[4];
      }
    }
    snow.emitted = snow.mass; snow.primed = true;
  }
  window.__particleSnow = { stats: function () {
    var packedMass = 0, maxDepth = 0;
    for (var i = 0; i < snow.banks.length; i++) { packedMass += snow.banks[i].mass; maxDepth = Math.max(maxDepth, snowHeight(snow.banks[i])); }
    return { enabled: worldSnowEnabled, mass: snow.mass, groundMass: packedMass, banks: snow.banks.length,
      airborne: snow.grains.length, powder: snow.powder, emitted: snow.emitted, melted: snow.melted,
      collected: snow.collected, escaped: snow.escaped, packed: snow.packed, maxDepth: maxDepth, temperature: snow.temperature };
  } };
