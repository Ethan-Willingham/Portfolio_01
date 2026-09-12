  // ===== Cargo manifest: inspect the current haul, without changing it =====
  // The console hatch and I open this page. It owns input and freezes the
  // mine while open; the pause overlay remains the owner on focus loss.
  var cargoManifestOpen = false;
  var cargoManifestPage = 0;
  var cargoManifestHover = null;
  var cargoManifestWheelDelta = 0;
  var cargoManifestWheelAt = 0;

  function cargoManifestCanOpen() {
    return !gamePaused && !gameOver && !gameWon && !shopOpen &&
      shopState === 'closed' && !ledgerOpen && !itemWheel.open &&
      !(typeof bathMode !== 'undefined' && bathMode) &&
      !seamCreditsOn && !seamExtractTiles && introPhase === 'done';
  }

  function cargoManifestClearInput() {
    for (var key in keys) keys[key] = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    touch.active = false;
    dpadTouchId = null;
    shopTapCandidate = null;
    shopDrag = null;
    restartConfirmT = 0;
    if (player) player.thrusting = false;
    if (itemWheel.open) closeItemWheel(false);
    var drill = drillSfx();
    try {
      if (drill && drill.stop) drill.stop();
      if (typeof SluiceAudio !== 'undefined' && SluiceAudio) {
        if (SluiceAudio.flight) SluiceAudio.flight({ spool: 0, climb: 0, fx: player ? player.fx : {}, dt: 0 });
        if (SluiceAudio.fall) SluiceAudio.fall(false);
      }
      // Re-arm the edge so a still-falling rig restores its filter on exit.
      if (typeof _audio !== 'undefined' && _audio) _audio.falling = false;
    } catch (e) { /* an audio device failure must not block the inspector */ }
    drillSfxActive = false;
    drillSfxMat = null;
    drillSfxStopT = 0;
  }

  function cargoManifestToggle() {
    if (!cargoManifestOpen && !cargoManifestCanOpen()) return false;
    cargoManifestOpen = !cargoManifestOpen;
    cargoManifestPage = 0;
    cargoManifestHover = null;
    cargoManifestWheelDelta = 0;
    cargoManifestClearInput();
    canvas.style.cursor = '';
    return cargoManifestOpen;
  }

  // consoleBayLayout is logical; all pointer handlers use CSS pixels.
  function cargoManifestButtonRect() {
    if (!UI_NEW) return null;
    var scale = consoleScale();
    for (var i = 0; i < consoleBayLayout.length; i++) {
      var L = consoleBayLayout[i];
      if (L.bay.id !== 'cargo') continue;
      return { x: Math.floor(L.bx * scale), y: Math.floor(L.by * scale),
        w: Math.ceil(L.bw * scale), h: Math.ceil(L.bh * scale) };
    }
    return null;
  }

  function cargoManifestContains(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function cargoManifestRows() {
    var groups = {}, rows = [];
    var oreOrder = ledgerOreList();
    for (var i = 0; i < cargo.length; i++) {
      var unit = cargo[i], type = cargoType(unit), shiny = cargoShiny(unit);
      var key = type + ':' + (shiny ? 'shiny' : 'regular');
      var row = groups[key];
      if (!row) {
        var def = ORES[type];
        row = groups[key] = { key: key, type: type, shiny: shiny,
          label: def ? def.label || type : 'Unknown mineral', quantity: 0,
          unitSlots: cargoUnitSlots(unit), slots: 0,
          unitValue: cargoUnitValue(unit), total: 0,
          specimenIndex: Math.max(0, oreOrder.indexOf(type)) };
        rows.push(row);
      }
      row.quantity++;
      row.slots += cargoUnitSlots(unit);
      row.total += cargoUnitValue(unit);
    }
    rows.sort(function (a, b) {
      return a.specimenIndex - b.specimenIndex || Number(a.shiny) - Number(b.shiny);
    });
    return rows;
  }

  function cargoManifestSummary(rows) {
    rows = rows || cargoManifestRows();
    var total = 0;
    for (var i = 0; i < rows.length; i++) total += rows[i].total;
    return { quantity: cargo.length, slots: cargoUsed(), capacity: maxCargo, total: total };
  }

  function cargoManifestLayout(rows) {
    rows = rows || cargoManifestRows();
    var compact = viewH < 420;
    var short = viewH < 300;
    var margin = compact ? 8 : 16;
    var w = Math.max(200, Math.min(880, viewW - margin * 2));
    var pad = w < 440 ? 14 : 18;
    var wide = w >= 600;
    var headerH = wide ? (compact ? 82 : 100) : (compact ? 64 : 84);
    var rowH = wide ? (compact ? 60 : 72) : (short ? 74 : 94);
    var gap = 6, footerH = 78;
    var perPage = Math.max(1, Math.min(Math.max(1, rows.length),
      Math.floor((viewH - margin * 2 - headerH - footerH + gap) / (rowH + gap))));
    var pages = Math.max(1, Math.ceil(rows.length / perPage));
    cargoManifestPage = Math.max(0, Math.min(pages - 1, cargoManifestPage));
    var listH = perPage * rowH + (perPage - 1) * gap;
    var h = headerH + listH + footerH;
    var x = Math.floor((viewW - w) / 2), y = Math.floor((viewH - h) / 2);
    var footY = y + headerH + listH;
    return { x: x, y: y, w: w, h: h, pad: pad, wide: wide, short: short, compact: compact,
      listX: x + pad, listY: y + headerH, listW: w - pad * 2, listH: listH,
      rowH: rowH, gap: gap, perPage: perPage, pages: pages, footerY: footY,
      close: { x: x + w - pad - 44, y: y + (compact ? 8 : 18), w: 44, h: 44 },
      prev: { x: x + pad, y: footY + 28, w: 80, h: 44 },
      next: { x: x + w - pad - 80, y: footY + 28, w: 80, h: 44 } };
  }

  function cargoManifestHitAt(x, y, L) {
    if (cargoManifestContains(L.close, x, y)) return 'close';
    if (cargoManifestContains(L.prev, x, y)) return 'prev';
    if (cargoManifestContains(L.next, x, y)) return 'next';
    if (!cargoManifestContains(L, x, y)) return 'backdrop';
    return null;
  }

  function cargoManifestMovePage(direction) {
    var L = cargoManifestLayout();
    cargoManifestPage = Math.max(0, Math.min(L.pages - 1, cargoManifestPage + direction));
  }

  function cargoManifestPointerDown(x, y) {
    if (!cargoManifestOpen) return false;
    var hit = cargoManifestHitAt(x, y, cargoManifestLayout());
    if (hit === 'close' || hit === 'backdrop') cargoManifestToggle();
    else if (hit === 'prev') cargoManifestMovePage(-1);
    else if (hit === 'next') cargoManifestMovePage(1);
    return true;
  }

  function cargoManifestPointerMove(x, y) {
    if (!cargoManifestOpen) return false;
    cargoManifestHover = cargoManifestHitAt(x, y, cargoManifestLayout());
    canvas.style.cursor = cargoManifestHover ? 'pointer' : '';
    return true;
  }

  function cargoManifestKeyDown(key) {
    if (!cargoManifestOpen) return false;
    if (key === 'Escape' || key === 'i' || key === 'I' || key === 'x' || key === 'X') cargoManifestToggle();
    else if (key === 'ArrowLeft' || key === 'PageUp') cargoManifestMovePage(-1);
    else if (key === 'ArrowRight' || key === 'PageDown') cargoManifestMovePage(1);
    else if (key === 'Home') cargoManifestPage = 0;
    else if (key === 'End') cargoManifestPage = cargoManifestLayout().pages - 1;
    return true;
  }

  function cargoManifestWheel(delta) {
    if (!cargoManifestOpen) return false;
    var now = performance.now();
    if (now - cargoManifestWheelAt < 220) return true;
    cargoManifestWheelDelta += delta;
    if (Math.abs(cargoManifestWheelDelta) >= 70) {
      cargoManifestMovePage(cargoManifestWheelDelta > 0 ? 1 : -1);
      cargoManifestWheelDelta = 0;
      cargoManifestWheelAt = now;
    }
    return true;
  }

  function drawCargoManifest() {
    if (!cargoManifestOpen) return;
    var rows = cargoManifestRows(), summary = cargoManifestSummary(rows);
    var L = cargoManifestLayout(rows);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ukFizzDraw(1);
    ctx.fillStyle = 'rgba(9,11,16,0.5)';
    ctx.fillRect(0, viewH - consoleHeight(), viewW, consoleHeight());
    ukPanelBox(L.x, L.y, L.w, L.h);
    nsText('CARGO HOLD', L.listX, L.y + (L.compact ? 14 : 23), L.w < 440 ? 18 : 24, UIT_TEXT);
    ukButton(L.close, 'X', 'ghost', cargoManifestHover === 'close', 0, 14);
    var summaryText = summary.quantity.toLocaleString() + (summary.quantity === 1 ? ' item' : ' items') +
      ' / ' + summary.slots.toLocaleString() + '/' + summary.capacity.toLocaleString() + ' slots';
    ukMono(summaryText, L.listX, L.y + (L.compact ? 50 : 65), 11, UIT_BODY);
    if (L.wide) {
      ukMono('MINERAL', L.listX + 56, L.listY - 10, 11, UIT_DIM);
      ukMono('QTY', L.listX + L.listW - 246, L.listY - 10, 11, UIT_DIM, 'right');
      ukMono('EACH', L.listX + L.listW - 128, L.listY - 10, 11, UIT_DIM, 'right');
      ukMono('TOTAL', L.listX + L.listW - 12, L.listY - 10, 11, UIT_DIM, 'right');
    }

    var first = cargoManifestPage * L.perPage;
    var end = Math.min(rows.length, first + L.perPage);
    for (var i = first; i < end; i++) {
      var row = rows[i];
      var x = L.listX, y = L.listY + (i - first) * (L.rowH + L.gap);
      ukInset(x, y, L.listW, L.rowH);
      var sx = x + 12, sy = y + (L.wide ? Math.floor((L.rowH - TILE) / 2) : 8);
      if (ORES[row.type]) {
        drawLedgerSpecimen(sx, sy, row.type, row.specimenIndex);
        if (row.shiny) drawShinyTile(sx, sy, 4001 + row.specimenIndex * 37, 4007 + row.specimenIndex * 53, 0);
      } else {
        ukMono('?', sx + TILE / 2, sy + 23, 19, UIT_DIM, 'center');
      }
      ctx.strokeStyle = row.shiny ? UIT_GOLD : UIT_EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 0.5, sy - 0.5, TILE + 1, TILE + 1);
      var ty = y + (L.wide ? 24 : L.short ? 18 : 23);
      ukMono(row.label, x + 56, ty, 13, UIT_TEXT, 'left', true);
      ukMono((row.shiny ? 'Shiny' : 'Regular') + ' / ' + row.unitSlots +
        (row.unitSlots === 1 ? ' slot each' : ' slots each'), x + 56, ty + 17, 11, row.shiny ? UIT_MONEY : UIT_DIM);
      if (L.wide) {
        ukMono(row.quantity.toLocaleString(), x + L.listW - 246, y + 34, 13, UIT_BODY, 'right');
        ukMono('$' + row.unitValue.toLocaleString(), x + L.listW - 128, y + 34, 13, UIT_BODY, 'right');
        ukMono('$' + row.total.toLocaleString(), x + L.listW - 12, y + 34, 14, UIT_MONEY, 'right');
      } else {
        var metaY = y + (L.short ? 51 : 64);
        ukMono('Qty ' + row.quantity.toLocaleString(), x + 12, metaY, 11, UIT_BODY);
        ukMono('Each $' + row.unitValue.toLocaleString(), x + L.listW - 12, metaY, 11, UIT_BODY, 'right');
        ukMono(row.slots.toLocaleString() + ' slots', x + 12, metaY + 17, 11, UIT_DIM);
        ukMono('Total $' + row.total.toLocaleString(), x + L.listW - 12, metaY + 17, 11, UIT_MONEY, 'right');
      }
    }
    if (!rows.length) {
      ukInset(L.listX, L.listY, L.listW, L.listH);
      var ey = L.listY + Math.floor(L.listH / 2);
      ukMono('Your hold is empty.', L.x + L.w / 2, ey - 3, 13, UIT_TEXT, 'center');
      ukMono('Mine a mineral to see its value here.', L.x + L.w / 2, ey + 18, 11, UIT_DIM, 'center');
    }

    ukMono('HAUL VALUE', L.listX, L.footerY + 20, 11, UIT_DIM);
    ukMono('$' + summary.total.toLocaleString(), L.listX + L.listW, L.footerY + 21, 16, UIT_MONEY, 'right', true);
    ukButton(L.prev, 'PREV', cargoManifestPage > 0 ? 'ghost' : 'locked', cargoManifestHover === 'prev', 0, 11);
    ukButton(L.next, 'NEXT', cargoManifestPage < L.pages - 1 ? 'ghost' : 'locked', cargoManifestHover === 'next', 0, 11);
    ukMono((cargoManifestPage + 1) + ' / ' + L.pages, L.x + L.w / 2, L.prev.y + 27, 12, UIT_BODY, 'center');
    ctx.restore();
  }
