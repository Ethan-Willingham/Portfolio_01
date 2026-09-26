  // One bathhouse, two working areas. This layout owns the fire's display and
  // pointer transform, and reserves an unobscured viewport for the real basin.
  function hearthRoomLayout() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var landscape = w >= 520 && h < 500, wide = w >= 700 && !landscape;
    var ratio = HEARTH_WIDTH / HEARTH_HEIGHT, gap = 8, bh, bw, sh;
    var station, scene, box, bin, pump, action, ash, tools, water, meter;
    if (landscape) {
      station = { x: w * 0.4, y: 0, w: w * 0.6, h: h };
      scene = { x: 0, y: 0, w: station.x, h: h };
      bh = Math.min(h - 190, (station.w - 40) / ratio);
      bw = bh * ratio;
      box = { x: station.x + (station.w - bw) / 2, y: 22, w: bw, h: bh };
    } else {
      // Nothing is reserved above or below the room. Instruments live beside
      // the firebox on desktop, or in two compact rows with it on a phone.
      bh = wide ? Math.min(208, h * 0.26, (w - 344) / ratio) : Math.max(44, Math.min((w - 40) / ratio, h * 0.55 - 186));
      bw = bh * ratio; sh = wide ? Math.max(242, bh + 74) : bh + 186;
      station = { x: 0, y: h - sh, w: w, h: sh };
      scene = { x: 0, y: 0, w: w, h: station.y };
      box = { x: (w - bw) / 2, y: station.y + (wide ? (sh - bh - 26) / 2 : 22), w: bw, h: bh };
    }
    if (!wide && !landscape) {
      // Keep the taper inside the tub's shoulders on narrow, tall screens.
      var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
      var fit = Math.min(scene.w / BATH_VIEW_W, Math.max(40, scene.h) / (curve.D + 148));
      bw = Math.max(44 * ratio, Math.min(bw, (curve.x1 - curve.x0) * fit * 0.64));
      box.x = (w - bw) / 2; box.w = bw; box.h = bw / ratio;
    }
    if (!landscape && bathMode && h >= 500) {
      // Build the entire silhouette from the actual copper shoulders. The
      // lower physical slice and upper brickwork are parts of this one ellipse.
      var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
      var shoulder = bathRimPoint(curve, curve.x0 + (curve.x1 - curve.x0) * 0.06, 24);
      var outerX = (shoulder.x - cam.x) * worldScale;
      var outerW = ((curve.x0 + curve.x1 - shoulder.x) - shoulder.x) * worldScale;
      var outerY = (shoulder.y - cam.y) * worldScale;
      // Keep the physical slice at least one touch target tall on narrow phones.
      var outerH = Math.max(88, outerW / (HEARTH_PHI * HEARTH_PHI));
      box = { x: outerX + outerW * HEARTH_BOWL_ENTRY, y: outerY + outerH * HEARTH_BOWL_CUT,
        w: outerW * HEARTH_BOWL_SPAN, h: outerH * (1 - HEARTH_BOWL_CUT),
        bowl: { x: outerX, y: outerY, w: outerW, h: outerH } };
      bw = box.w; bh = box.h;
    }
    if (wide) {
      var cw = Math.min(144, (w - bw) / 2 - 20), cy = Math.max(station.y, box.y + box.h - 194);
      var left = box.x - cw - 12, right = box.x + bw + 12, half = (cw - gap) / 2;
      bin = { x: left, y: cy, w: cw, h: 44 };
      pump = { x: left, y: cy + 50, w: cw, h: 44 };
      action = { x: right, y: cy, w: cw, h: 44 };
      ash = { x: right, y: cy + 50, w: cw, h: 44 };
      tools = [
        { x: left, y: cy + 100, w: half, h: 44 },
        { x: left + half + gap, y: cy + 100, w: half, h: 44 },
        { x: left, y: cy + 150, w: half, h: 44 },
        { x: left + half + gap, y: cy + 150, w: half, h: 44 }
      ];
      water = { x: right, y: cy + 100, w: cw, h: 44 };
      meter = { x: right, y: cy + 150, w: cw, h: 44 };
    } else {
      var cw = (station.w - 24 - gap * 3) / 4, cy = box.y + box.h + 18;
      bin = { x: station.x + 12, y: cy, w: cw, h: 44 };
      pump = { x: bin.x + cw + gap, y: cy, w: cw, h: 44 };
      action = { x: pump.x + cw + gap, y: cy, w: cw, h: 44 };
      ash = { x: action.x + cw + gap, y: cy, w: cw, h: 44 };
      tools = [];
      for (var i = 0; i < 4; i++) tools.push({ x: bin.x + i * (cw + gap), y: cy + 50, w: cw, h: 44 });
      water = { x: bin.x, y: cy + 100, w: cw * 2 + gap, h: 44 };
      meter = { x: action.x, y: water.y, w: water.w, h: 44 };
    }
    if (bathMode && typeof hearthCasingProfile === 'function') hearthChamberSetLayout(box,!landscape);
    return { w: w, h: h, top: 0, footer: h, station: station, scene: scene,
      box: box, bin: bin, pump: pump, action: action, ash: ash,
      tools: tools, water: water, meter: meter,
      wide: wide, side: false, landscape: landscape };
  }
  function hearthStationReadout(bed) {
    var weight = 0, fuel = 0, air = 0, count = 0;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i]; if (b.ash) continue;
      var share = b.fuelShare || 1;
      weight += share; fuel += b.fuel * share; air += b.oxygen; count++;
    }
    return 'FUEL ' + Math.round(fuel / Math.max(0.001, weight) * 100) + '% / AIR ' +
      Math.round(air / Math.max(1, count) * 100) + '% / ASH ' + Math.round(bed.ashLoad * 100) + '%';
  }
  function hearthDrawFuelControl(c, r, pump) {
    var bed = hearthBeds.boiler;
    hearthPlate(c, r, true);
    var ix = r.x + Math.min(26, r.w * 0.25), iy = r.y + r.h / 2;
    if (pump) {
      c.fillStyle = BLD.woodDark; c.fillRect(ix - 15, iy + 5, 30, 3);
      c.fillStyle = BLD.woodMid; c.fillRect(ix - 16, iy - 9 + bed.air * 4, 32, 3);
      c.fillStyle = BLD.woodBase; c.beginPath(); c.moveTo(ix - 13, iy - 6 + bed.air * 4);
      c.lineTo(ix + 12, iy - 6 + bed.air * 4); c.lineTo(ix + 16, iy); c.lineTo(ix + 12, iy + 5); c.closePath(); c.fill();
      if (r.w >= 110) hearthText(c, 'BELLOWS', r.x + r.w - 7, iy, 11, BLD.cream, 'right');
      else hearthText(c, 'AIR', r.x + r.w - 5, iy, 11, BLD.cream, 'right');
      hearthButtons.push(Object.assign({ action: 'pump' }, r)); return;
    }
    hearthDrawCoal(c, hearthHandPreview(), ix, iy - 2, 0.48, hearthToolTime);
    var def = hearthMaterial(hearthHand.material), unlimited = hearthDevSupplies();
    var count = unlimited ? (r.w >= 124 ? 'UNLIMITED' : 'FREE') : hearthMaterialCount(hearthHand.material);
    var label = r.w >= 124 ? (unlimited ? 'MATERIALS' : def.label.toUpperCase()) : 'FUEL';
    hearthText(c, label, r.x + r.w - 7, iy - 8, 11, BLD.cream, 'right');
    hearthText(c, count + '  >', r.x + r.w - 7, iy + 9, 11, BLD.goldPale, 'right');
    hearthButtons.push(Object.assign({ action: 'fuels' }, r));
  }
  function hearthDrawStation(c) {
    var L = hearthRoomLayout(), r = L.station, box = L.box, bed = hearthBeds.boiler;
    c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = BLD.woodDeep; c.fillRect(r.x, r.y, r.w, r.h);
    hearthDrawCasing(c, box, bed, bathBoilerHover, !L.landscape);
    hearthDrawFuelControl(c, L.bin, false);
    hearthDrawFuelControl(c, L.pump, true);
    hearthPlate(c, L.action, hearthHand.mode === 'striker');
    hearthDrawStriker(c, L.action.x + (L.action.w < 110 ? L.action.w / 2 : 26), L.action.y + 23, 0.7, hearthToolPulse);
    if (L.action.w >= 110) hearthText(c, 'STRIKER', L.action.x + L.action.w - 8, L.action.y + 23, 11, BLD.cream, 'right');
    hearthButtons.push(Object.assign({ action: 'strike' }, L.action));
    hearthDrawGrateControl(c, L.ash);
    if (L.wide || L.side) {
      hearthText(c, hearthStationReadout(bed), r.x + r.w / 2, r.y + r.h - 9, L.side ? 10 : 11, UIT_DIM, 'center');
      if (L.wide && !bed.chunks.length) { var hint = { x: L.bin.x, y: L.bin.y - 26, w: L.bin.w, h: 20 }; hearthPlate(c, hint, false); hearthText(c, 'CLICK TO DROP', hint.x + hint.w / 2, hint.y + 10, 11, BLD.cream, 'center'); }
    } else {
      // Keep the sloping ironwork continuous behind the compact readings.
      var readY = L.h >= 500 ? L.h - 12 : r.y + 8;
      hearthText(c, hearthStationReadout(bed), r.x + r.w / 2, readY, 10, UIT_DIM, 'center');
    }
    if (hearthDrag) {
      var d = hearthDrag;
      hearthDrawCoal(c, d.b, d.x, d.y, box.w / HEARTH_WIDTH, hearthToolTime);
      c.strokeStyle = BLD.goldPale; c.lineWidth = 1;
      hearthCasingPath(c, hearthCasingProfile(box, !L.landscape), false); c.stroke();
    }
    c.restore();
  }
