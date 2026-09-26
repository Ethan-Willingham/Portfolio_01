  /* ---- Bath liquid stores: separate identities, conserved dispensing ---- */
  // Quantities use the shared liquid solver's particles (100 particles / litre).
  // A silo accepts one identity at a time. Empty silos can be reassigned.
  var BATH_SILO_CAPACITY = 32000, BATH_SILO_COUNT = 3, BATH_LIQUID_AMBIENT = 20;
  var bathSilos = { selected: 0, siteX: -1, foundation: false, tanks: [], pending: [0, 0, 0, 0, 0], pendingHeat: [0, 0, 0, 0, 0] };

  function bathSiloAmount(n) { return isFinite(n) ? Math.max(0, Math.min(1000000000, Math.floor(Number(n)))) : 0; }
  function bathSiloLiquid(type) {
    return Number.isInteger(type) && type >= 0 && type < 5 &&
      typeof liquidCatalog !== 'undefined' && !!liquidCatalog[type];
  }
  function bathSiloTemperature(temp) {
    return isFinite(temp) ? Math.max(-30, Math.min(250, Number(temp))) : BATH_LIQUID_AMBIENT;
  }
  function bathSiloReset() {
    bathSilos.selected = 0; bathSilos.siteX = -1; bathSilos.foundation = false; bathSilos.tanks.length = 0;
    for (var i = 0; i < BATH_SILO_COUNT; i++) bathSilos.tanks.push({ type: i === 0 ? 0 : -1, count: 0, temp: BATH_LIQUID_AMBIENT });
    bathSilos.pending = [0, 0, 0, 0, 0]; bathSilos.pendingHeat = [0, 0, 0, 0, 0];
  }
  function bathSiloTank(index) {
    if (!bathSilos.tanks.length) bathSiloReset();
    return Number.isInteger(index) ? bathSilos.tanks[index] : null;
  }
  function bathSiloSelectLiquid(type) {
    if (!bathSiloLiquid(type)) return false;
    bathSilos.selected = type;
    return true;
  }
  function bathSiloSelect(index) {
    var tank = bathSiloTank(index);
    return !!tank && bathSiloSelectLiquid(tank.type);
  }
  function bathSiloPut(index, type, count, temp) {
    var tank = bathSiloTank(index);
    if (!tank || !bathSiloLiquid(type) || tank.count > 0 && tank.type !== type) return 0;
    var accepted = Math.min(bathSiloAmount(count), BATH_SILO_CAPACITY - tank.count);
    if (!accepted) return 0;
    tank.temp = (tank.temp * tank.count + bathSiloTemperature(temp) * accepted) / (tank.count + accepted);
    tank.type = type; tank.count += accepted;
    return accepted;
  }
  function bathSiloRigTemperature(type) {
    // Rig samples currently enter at ambient temperature. This optional hook
    // keeps a future tank-energy model separate from storage and dispensing.
    return typeof bathThermalRigTemperature === 'function' ? bathSiloTemperature(bathThermalRigTemperature(type)) : BATH_LIQUID_AMBIENT;
  }
  function bathSiloDeposit(index, type, maxCount) {
    if (!bathSiloLiquid(type) || typeof siphon === 'undefined') return 0;
    var available = bathSiloAmount(siphon.tank[type]);
    var moved = bathSiloPut(index, type, Math.min(available, maxCount === undefined ? available : bathSiloAmount(maxCount)), bathSiloRigTemperature(type));
    siphon.tank[type] -= moved;
    return moved;
  }
  function bathSiloDepositRig() {
    var moved = 0;
    if (typeof siphon === 'undefined') return moved;
    for (var type = 0; type < 5; type++) for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < BATH_SILO_COUNT && siphon.tank[type] > 0; i++) {
        var tank = bathSiloTank(i);
        if (pass === 0 ? tank.type !== type : tank.count > 0) continue;
        moved += bathSiloDeposit(i, type);
      }
    }
    return moved;
  }
  function bathSiloWithdraw(index, maxCount) {
    var tank = bathSiloTank(index);
    if (!tank || !tank.count || typeof siphon === 'undefined') return 0;
    var total = 0;
    for (var i = 0; i < siphon.tank.length; i++) total += bathSiloAmount(siphon.tank[i]);
    var moved = Math.min(tank.count, Math.max(0, siphon.capacity - total), maxCount === undefined ? tank.count : bathSiloAmount(maxCount));
    if (!moved) return 0;
    if (typeof bathThermalRigReceive === 'function') bathThermalRigReceive(tank.type, moved, tank.temp);
    siphon.tank[tank.type] = bathSiloAmount(siphon.tank[tank.type]) + moved;
    tank.count -= moved;
    return moved;
  }
  function bathSiloImportSupplies() {
    if (typeof bathSupplies === 'undefined') return;
    for (var type = 0; type < 5; type++) {
      if (!bathSiloLiquid(type)) continue;
      // Fill matching vessels first, then use empty vessels. Legacy overflow
      // remains in its original supply bin, so migration never discards it.
      for (var pass = 0; pass < 2; pass++) for (var i = 0; i < BATH_SILO_COUNT; i++) {
        var tank = bathSiloTank(i);
        if (pass === 0 ? tank.type !== type : tank.count > 0) continue;
        var moved = bathSiloPut(i, type, bathSiloAmount(bathSupplies[type]), BATH_LIQUID_AMBIENT);
        bathSupplies[type] -= moved;
      }
    }
  }
  function bathLiquidCount(type) {
    if (!bathSiloLiquid(type)) return 0;
    var total = bathSiloAmount(bathSilos.pending[type]);
    for (var i = 0; i < BATH_SILO_COUNT; i++) {
      var tank = bathSiloTank(i);
      if (tank.type === type) total += tank.count;
    }
    if (typeof siphon !== 'undefined') total += bathSiloAmount(siphon.tank[type]);
    if (typeof bathSupplies !== 'undefined') total += bathSiloAmount(bathSupplies[type]);
    return total;
  }
  function bathSiloQueue(type, count, temp) {
    if (!bathSiloLiquid(type)) return 0;
    count = bathSiloAmount(count);
    bathSilos.pending[type] += count;
    bathSilos.pendingHeat[type] += count * bathSiloTemperature(temp);
    return count;
  }
  function bathSiloReserve(type, count) {
    if (!bathSiloLiquid(type)) return 0;
    var needed = bathSiloAmount(count), moved = 0;
    for (var i = 0; i < BATH_SILO_COUNT && moved < needed; i++) {
      var tank = bathSiloTank(i);
      if (tank.type !== type) continue;
      var take = Math.min(tank.count, needed - moved);
      moved += bathSiloQueue(type, take, tank.temp); tank.count -= take;
    }
    if (typeof bathSupplies !== 'undefined' && moved < needed) {
      var stored = Math.min(bathSiloAmount(bathSupplies[type]), needed - moved);
      moved += bathSiloQueue(type, stored, BATH_LIQUID_AMBIENT); bathSupplies[type] -= stored;
    }
    if (typeof siphon !== 'undefined' && moved < needed) {
      var carried = Math.min(bathSiloAmount(siphon.tank[type]), needed - moved);
      moved += bathSiloQueue(type, carried, bathSiloRigTemperature(type)); siphon.tank[type] -= carried;
    }
    return moved;
  }
  function bathSiloEmit(type, count, x, y, vx, vy) {
    if (!bathSiloLiquid(type)) return 0;
    count = Math.min(2048, bathSiloAmount(count));
    if (!count) return 0;
    if (typeof hearthDevSupplies === 'function' && hearthDevSupplies()) {
      var virtualCount = Math.min(count, bathSiloAmount(liquidToolEmit(type, count, x, y, vx, vy)));
      if (virtualCount && typeof bathThermalOnPour === 'function') bathThermalOnPour(type, virtualCount, BATH_LIQUID_AMBIENT, x, y);
      return virtualCount;
    }
    bathSiloReserve(type, Math.max(0, count - bathSilos.pending[type]));
    var available = bathSilos.pending[type], amount = Math.min(count, available);
    if (!amount) return 0;
    var temp = bathSiloTemperature(bathSilos.pendingHeat[type] / available);
    var emitted = Math.min(amount, bathSiloAmount(liquidToolEmit(type, amount, x, y, vx, vy)));
    bathSilos.pending[type] -= emitted;
    bathSilos.pendingHeat[type] = bathSilos.pending[type] * temp;
    if (emitted && typeof bathThermalOnPour === 'function') bathThermalOnPour(type, emitted, temp, x, y);
    return emitted;
  }
  function bathSiloSave() {
    return { version: 1, selected: bathSilos.selected, siteX: bathSilos.siteX,
      tanks: bathSilos.tanks.map(function (tank) { return { type: tank.type, count: tank.count, temp: tank.temp }; }),
      pending: bathSilos.pending.slice(), pendingHeat: bathSilos.pendingHeat.slice() };
  }
  function bathSiloRestore(data, legacyPendingWater) {
    bathSiloReset();
    if (data && data.version >= 1) {
      if (bathSiloLiquid(data.selected)) bathSilos.selected = data.selected;
      if (isFinite(data.siteX) && data.siteX >= 0) bathSilos.siteX = Number(data.siteX);
      for (var type = 0; type < 5; type++) {
        var pending = bathSiloAmount(data.pending && data.pending[type]);
        var heat = data.pendingHeat && data.pendingHeat[type];
        bathSiloQueue(type, pending, pending && isFinite(heat) ? heat / pending : BATH_LIQUID_AMBIENT);
      }
      var list = Array.isArray(data.tanks) ? data.tanks : [];
      for (var i = 0; i < list.length; i++) {
        var src = list[i];
        if (!src || !bathSiloLiquid(src.type)) continue;
        var amount = bathSiloAmount(src.count), placed = i < BATH_SILO_COUNT ? bathSiloPut(i, src.type, amount, src.temp) : 0;
        if (!amount && i < BATH_SILO_COUNT) bathSilos.tanks[i].type = src.type;
        // Oversized or retired vessels remain dispensable in their own queue.
        bathSiloQueue(src.type, amount - placed, src.temp);
      }
    }
    // The old fill command can still reserve water into bathPour alongside
    // typed silo queues. Its separately debited stock must migrate too.
    bathSiloQueue(0, legacyPendingWater, BATH_LIQUID_AMBIENT);
    bathSiloImportSupplies();
  }

  function bathSilosExteriorRect() {
    if (!ENABLE_BATH || !bathPickSite()) return null;
    if (!bathSilos.tanks.length) bathSiloReset();
    var width = 208, height = 146, gy = SKY_ROWS * TILE;
    var first = Math.ceil((banyaX + BANYA_W + 32) / TILE), span = Math.ceil(width / TILE);
    if (bathSilos.siteX < first * TILE || bathSilos.siteX + width >= COLS * TILE) bathSilos.siteX = -1;
    if (bathSilos.siteX < 0) {
      var row = world[SKY_ROWS];
      if (!row) return null;
      for (var col = first; col + span < COLS - 1; col++) {
        if (col <= DECK_RIGHT_COL + 3 && col + span >= DECK_LEFT_COL - 2) continue;
        var clear = true;
        for (var p = 0; p < surfacePonds.length; p++) {
          if (surfacePonds[p].cR + 1 >= col && surfacePonds[p].cL - 1 <= col + span) { clear = false; break; }
        }
        if (!clear) continue;
        for (var c = col; c <= col + span; c++) {
          if (!row[c] || row[c].type === 'water' || row[c].type === 'oil') { clear = false; break; }
        }
        if (clear) { bathSilos.siteX = col * TILE; break; }
      }
    }
    return bathSilos.siteX < 0 ? null : { x: bathSilos.siteX, y: gy - height, w: width, h: height };
  }
  function bathSilosLayFoundation() {
    var r = bathSilosExteriorRect();
    if (!r || bathSilos.foundation) return;
    var row = world[SKY_ROWS];
    for (var col = Math.floor(r.x / TILE); col <= Math.floor((r.x + r.w) / TILE); col++) {
      if (row[col] && row[col].type === 'foundation') continue;
      row[col] = { type: 'foundation', hp: 999999 };
      delete terrainClearedKinds[SKY_ROWS + ':' + col];
      invalidateTerrainAround(SKY_ROWS, col);
      if (player && player.x + PLAYER_W > col * TILE && player.x < (col + 1) * TILE &&
          player.y + PLAYER_H > SKY_ROWS * TILE && player.y < (SKY_ROWS + 1) * TILE) {
        player.y = player.renderY = SKY_ROWS * TILE - PLAYER_H; player.vy = 0;
      }
    }
    bathSilos.foundation = true;
  }
  function isPointOnBathSilos(wx, wy) {
    if (!ENABLE_BATH || bathMode || bathFading) return false;
    var r = bathSilosExteriorRect();
    return !!r && wx >= r.x - 6 && wx <= r.x + r.w + 6 && wy >= r.y - 4 && wy <= r.y + r.h;
  }
  function drawBathSilosExterior() {
    if (!ENABLE_BATH || bathMode) return;
    var r = bathSilosExteriorRect();
    if (!r) return;
    bathSilosLayFoundation();
    var gy = r.y + r.h;
    ctx.save();
    // A low copper manifold carries the three outlets back to the bath.
    ctx.strokeStyle = BLD.outline; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(banyaX + BANYA_W - 2, gy - 22);
    ctx.lineTo(r.x - 12, gy - 22); ctx.lineTo(r.x - 12, gy - 13); ctx.lineTo(r.x + r.w - 14, gy - 13); ctx.stroke();
    ctx.strokeStyle = BLD.woodDark; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = BLD.woodLight; ctx.lineWidth = 1; ctx.stroke();
    drawStoneFoundation(r.x - 6, gy - 8, r.w + 12, 8);
    drawBathSilos(ctx, r.x, r.y, r.w, r.h - 8, { labels: false });
    ctx.restore();
  }

  // Drawing stays independent of the room/camera. The caller supplies screen
  // or world coordinates and owns interaction through the returned rectangles.
  function drawBathSilo(c, index, x, y, w, h, options) {
    options = options || {};
    var tank = bathSiloTank(index), type = tank && tank.type;
    var info = bathSiloLiquid(type) ? liquidCatalog[type] : null;
    var selected = options.selected === undefined ? info && bathSilos.selected === type : options.selected;
    var bodyY = y + h * 0.13, bodyH = h * 0.72, cap = Math.min(w * 0.18, h * 0.05);
    var level = tank ? Math.min(1, tank.count / BATH_SILO_CAPACITY) : 0;
    c.save();
    c.fillStyle = BLD.outline; c.fillRect(x + w * 0.14, y + h * 0.80, w * 0.16, h * 0.20); c.fillRect(x + w * 0.70, y + h * 0.80, w * 0.16, h * 0.20);
    c.fillStyle = BLD.metalBase; c.fillRect(x + w * 0.18, y + h * 0.81, w * 0.08, h * 0.17); c.fillRect(x + w * 0.74, y + h * 0.81, w * 0.08, h * 0.17);
    c.fillStyle = BLD.outline; c.beginPath(); c.ellipse(x + w / 2, bodyY, w / 2, cap, 0, Math.PI, 0); c.lineTo(x + w, bodyY + bodyH); c.ellipse(x + w / 2, bodyY + bodyH, w / 2, cap, 0, 0, Math.PI); c.closePath(); c.fill();
    c.fillStyle = BLD.metalBase; c.fillRect(x + 2, bodyY, w - 4, bodyH);
    c.fillStyle = BLD.metalDark; c.fillRect(x + w * 0.72, bodyY, w * 0.26 - 2, bodyH);
    c.fillStyle = BLD.metalLight; c.fillRect(x + w * 0.18, bodyY, Math.max(2, w * 0.10), bodyH);
    c.fillStyle = BLD.metalBase; c.beginPath(); c.ellipse(x + w / 2, bodyY, w / 2 - 2, Math.max(0.5, cap - 1), 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = BLD.metalLight; c.lineWidth = 1; c.beginPath(); c.ellipse(x + w / 2, bodyY, w / 2 - 3, Math.max(0.5, cap - 2), 0, Math.PI, Math.PI * 2); c.stroke();
    c.fillStyle = BLD.outline; c.fillRect(x + w * 0.36, y, w * 0.28, h * 0.10);
    c.fillStyle = BLD.metalBase; c.fillRect(x + w * 0.40, y + 2, w * 0.20, h * 0.10 - 2);
    for (var strap = 0; strap < 2; strap++) {
      var sy = bodyY + bodyH * (strap ? 0.85 : 0.16);
      c.fillStyle = BLD.outline; c.fillRect(x, sy - 1, w, 5);
      c.fillStyle = BLD.metalLight; c.fillRect(x + 1, sy, w - 2, 2);
      c.fillStyle = BLD.metalPale; c.fillRect(x + w * 0.10, sy, 2, 2); c.fillRect(x + w * 0.86, sy, 2, 2);
    }
    var gx = x + w * 0.72, gy = bodyY + bodyH * 0.28, gw = Math.max(4, w * 0.12), gh = bodyH * 0.48;
    c.fillStyle = BLD.outline; c.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
    c.fillStyle = BLD.metalDark; c.fillRect(gx, gy, gw, gh);
    if (info && level > 0) { c.fillStyle = info.color; c.fillRect(gx, gy + gh * (1 - level), gw, gh * level); }
    c.globalAlpha = 0.45; c.fillStyle = BLD.metalPale; c.fillRect(gx, gy, 1, gh); c.globalAlpha = 1;
    c.fillStyle = BLD.metalPale; for (var mark = 1; mark < 4; mark++) c.fillRect(gx + gw + 2, gy + gh * mark / 4, 3, 1);
    var valveY = bodyY + bodyH + cap * 0.7;
    c.strokeStyle = BLD.outline; c.lineWidth = 7; c.beginPath(); c.moveTo(x + w * 0.50, valveY); c.lineTo(x + w * 0.50, y + h * 0.95); c.lineTo(x + w * 0.87, y + h * 0.95); c.stroke();
    c.strokeStyle = BLD.goldDark; c.lineWidth = 4; c.stroke();
    c.strokeStyle = selected ? BLD.goldPale : BLD.metalLight; c.lineWidth = 2;
    c.beginPath(); c.arc(x + w * 0.5, valveY, Math.max(4, w * 0.12), 0, Math.PI * 2); c.moveTo(x + w * 0.38, valveY); c.lineTo(x + w * 0.62, valveY); c.stroke();
    if (options.labels !== false && w >= 48) {
      var plateY = bodyY + bodyH * 0.30, plateW = w * 0.61;
      c.fillStyle = BLD.outline; c.fillRect(x + w * 0.05, plateY, plateW, bodyH * 0.34);
      c.strokeStyle = selected ? BLD.goldBase : BLD.metalLight; c.lineWidth = 1; c.strokeRect(x + w * 0.05 + 1, plateY + 1, plateW - 2, bodyH * 0.34 - 2);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = BLD.cream; c.font = Math.max(8, Math.min(11, w * 0.10)) + 'px ' + UI_FONT;
      c.fillText(info ? info.name.toUpperCase() : 'EMPTY', x + w * 0.355, plateY + bodyH * 0.11, plateW - 6);
      c.fillStyle = info ? info.color : BLD.metalPale; c.font = Math.max(9, Math.min(14, w * 0.13)) + 'px ' + UI_FONT;
      c.fillText((tank ? Math.floor(tank.count / 100) : 0) + ' L', x + w * 0.355, plateY + bodyH * 0.24, plateW - 6);
    }
    c.restore();
    return { x: x, y: y, w: w, h: h, index: index, type: type, action: 'silo-' + index };
  }
  function drawBathSilos(c, x, y, w, h, options) {
    var gap = Math.min(12, w * 0.035), siloW = (w - gap * 2) / BATH_SILO_COUNT, hits = [];
    for (var i = 0; i < BATH_SILO_COUNT; i++) hits.push(drawBathSilo(c, i, x + i * (siloW + gap), y, siloW, h, options));
    return hits;
  }

  window.__bathSilos = { state: bathSilos, capacity: BATH_SILO_CAPACITY, reset: bathSiloReset,
    select: bathSiloSelect, selectLiquid: bathSiloSelectLiquid, count: bathLiquidCount,
    deposit: bathSiloDeposit, depositRig: bathSiloDepositRig, withdraw: bathSiloWithdraw,
    emit: bathSiloEmit, save: bathSiloSave, restore: bathSiloRestore };
