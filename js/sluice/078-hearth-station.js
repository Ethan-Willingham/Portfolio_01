  // One bathhouse, two working areas. This layout owns the fire's display and
  // pointer transform, and reserves an unobscured viewport for the real basin.
  function hearthRoomLayout() {
    var w = canvas.width / dpr, h = canvas.height / dpr, nav = hearthNavHeight();
    var footer = h - bathHUDHeight(), available = Math.max(120, footer - nav);
    var landscape = w >= 520 && h < 500;
    var sh = landscape ? available : Math.min(340, Math.max(176, available * 0.5));
    var station = { x: landscape ? w * 0.4 : 0, y: landscape ? nav : footer - sh,
      w: landscape ? w * 0.6 : w, h: sh };
    var scene = { x: 0, y: nav, w: landscape ? station.x : w,
      h: landscape ? available : available - sh };
    var wide = w >= 700 && !landscape, side = !landscape && w < 700 && h < 650;
    var bh, bw, box, bin, pump, action, ash, gap = 8;
    if (landscape) {
      var cw = Math.min(76, (station.w - 160) / 2), ch = 44;
      var right = station.x + station.w - cw * 2 - gap - 12;
      var leftW = right - station.x - 18;
      bh = Math.min(sh - 48, (leftW - 24) * HEARTH_HEIGHT / HEARTH_WIDTH);
      bw = bh * HEARTH_WIDTH / HEARTH_HEIGHT;
      box = { x: station.x + (leftW - bw) / 2, y: station.y + (sh - bh) / 2 + 5, w: bw, h: bh };
      var cy = station.y + (sh - ch * 2 - gap) / 2 + 6;
      bin = { x: right, y: cy, w: cw, h: ch };
      pump = { x: right + cw + gap, y: cy, w: cw, h: ch };
      action = { x: right, y: cy + ch + gap, w: cw, h: ch };
      ash = { x: right + cw + gap, y: cy + ch + gap, w: cw, h: ch };
    } else if (wide || side) {
      bh = Math.min(sh - 76, (side ? w - 176 : w * 0.42) * HEARTH_HEIGHT / HEARTH_WIDTH);
      bw = bh * HEARTH_WIDTH / HEARTH_HEIGHT;
      box = { x: (w - bw) / 2, y: station.y + 27, w: bw, h: bh };
      var cw = side ? 64 : Math.min(174, (w - bw) / 2 - 42), ch = side ? 44 : 68;
      var left = side ? 12 : box.x - cw - 30, right = side ? w - cw - 12 : box.x + bw + 30;
      var cy = station.y + (sh - ch * 2 - gap) / 2;
      bin = { x: left, y: cy, w: cw, h: ch };
      pump = { x: left, y: cy + ch + gap, w: cw, h: ch };
      action = { x: right, y: cy, w: cw, h: ch };
      ash = { x: right, y: cy + ch + gap, w: cw, h: ch };
    } else {
      bh = Math.min(sh - 94, (station.w - 68) * HEARTH_HEIGHT / HEARTH_WIDTH);
      bw = bh * HEARTH_WIDTH / HEARTH_HEIGHT;
      box = { x: station.x + (station.w - bw) / 2, y: station.y + 27, w: bw, h: bh };
      var cw = (station.w - 24 - gap * 3) / 4, cy = footer - 50;
      bin = { x: station.x + 12, y: cy, w: cw, h: 44 };
      pump = { x: bin.x + cw + gap, y: cy, w: cw, h: 44 };
      action = { x: pump.x + cw + gap, y: cy, w: cw, h: 44 };
      ash = { x: action.x + cw + gap, y: cy, w: cw, h: 44 };
    }
    return { w: w, h: h, top: nav, footer: footer, station: station, scene: scene,
      box: box, bin: bin, pump: pump, action: action, ash: ash,
      wide: wide, side: side, landscape: landscape };
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
    var label = pump ? (r.w < 90 ? 'AIR [B]' : 'BELLOWS [B]') :
      'COAL ' + (hearthDevSupplies() ? 'FREE' : forgeCount('coal'));
    if (r.h < 64) { hearthButton(c, r, label, pump ? 'pump' : 'coal', pump || forgeCount('coal') > 0); return; }
    hearthPlate(c, r, true);
    var cx = r.x + r.w / 2, cy = r.y + 22;
    if (pump) {
      var squeeze = bed.air * 7;
      c.fillStyle = BLD.woodMid; c.fillRect(cx - 30, cy - 10 + squeeze, 60, 4);
      c.fillStyle = BLD.woodDark; c.fillRect(cx - 28, cy + 10, 56, 4);
      c.fillStyle = BLD.woodBase; c.beginPath();
      c.moveTo(cx - 26, cy - 6 + squeeze); c.lineTo(cx + 24, cy - 6 + squeeze);
      c.lineTo(cx + 29, cy + 3); c.lineTo(cx + 24, cy + 10); c.lineTo(cx - 26, cy + 10); c.closePath(); c.fill();
      c.strokeStyle = BLD.woodDeep; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx - 23, cy + squeeze * 0.4); c.lineTo(cx + 23, cy + squeeze * 0.4); c.stroke();
    } else {
      var count = Math.min(5, forgeCount('coal'));
      for (var i = 0; i < count; i++) {
        if (!hearthBinCoals[i]) hearthBinCoals[i] = { r: 13 + i % 3, seed: (i + 1) * 0.137, angle: i * 1.7, heat: 0, fuel: 1 };
        hearthDrawCoal(c, hearthBinCoals[i], cx + (i - (count - 1) / 2) * 19, cy, 0.8, hearthToolTime);
      }
    }
    hearthText(c, label, cx, r.y + r.h - 15, 11, BLD.cream, 'center');
    hearthButtons.push(Object.assign({ action: pump ? 'pump' : 'coal' }, r));
  }
  function hearthDrawStation(c) {
    var L = hearthRoomLayout(), r = L.station, box = L.box, bed = hearthBeds.boiler;
    c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = BLD.woodDeep; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = BLD.woodDark; c.fillRect(r.x + 8, r.y, r.w - 16, 2);
    // The copper heat saddle joins the firebox to the basin above it.
    var mid = box.x + box.w / 2, neck = Math.min(132, box.w * 0.55);
    c.fillStyle = BLD.outline; c.fillRect(mid - neck / 2 - 2, r.y, neck + 4, 22);
    c.fillStyle = BLD.woodDark; c.fillRect(mid - neck / 2, r.y, neck, 20);
    c.fillStyle = BLD.woodLight; c.fillRect(mid - neck / 2, r.y + 1, neck, 1);
    hearthDrawCasing(c, box, bed, bathBoilerHover);
    hearthDrawFuelControl(c, L.bin, false);
    hearthDrawFuelControl(c, L.pump, true);
    hearthButton(c, L.action, L.action.w < 90 ? 'FLINT [F]' : 'STRIKE FLINT [F]', 'strike', hearthHasTool('flint') && hearthHasTool('steel'));
    hearthButton(c, L.ash, L.ash.w < 90 ? 'ASH [A]' : 'SWEEP ASH [A]', 'ash', bed.ash.length > 0 || bed.chunks.some(function (b) { return b.ash; }));
    if (L.wide || L.side) {
      hearthText(c, hearthStationReadout(bed), r.x + r.w / 2, r.y + r.h - 9, L.side ? 10 : 11, UIT_DIM, 'center');
      if (L.wide) hearthText(c, hearthBurnSummary(bed).split('  /  ')[0], L.bin.x + L.bin.w / 2, L.bin.y - 13, 11, BLD.cream, 'center');
    } else {
      // Compact instruments share the saddle line; the chamber stays clear.
      c.fillStyle = BLD.woodDeep; c.fillRect(r.x + 8, r.y, r.w - 16, 15);
      hearthText(c, hearthStationReadout(bed), r.x + r.w / 2, r.y + 8, 10, UIT_DIM, 'center');
    }
    if (hearthDrag) {
      var d = hearthDrag;
      hearthDrawCoal(c, d.b, d.x, d.y, box.w / HEARTH_WIDTH, hearthToolTime);
      c.strokeStyle = BLD.goldPale; c.lineWidth = 1;
      c.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
    }
    c.restore();
  }
