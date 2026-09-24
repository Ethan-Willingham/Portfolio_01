  // One bathhouse, two working areas. This layout owns the fire's display and
  // pointer transform, and reserves an unobscured viewport for the real basin.
  function hearthRoomLayout() {
    var w = canvas.width / dpr, h = canvas.height / dpr, nav = hearthNavHeight();
    var footer = h - bathHUDHeight(), available = Math.max(120, footer - nav);
    var landscape = w >= 520 && h < 500, wide = w >= 700 && !landscape;
    var ratio = HEARTH_WIDTH / HEARTH_HEIGHT, gap = 8, bh, bw, sh;
    var station, scene, box, bin, pump, action, ash;
    if (landscape) {
      station = { x: w * 0.4, y: nav, w: w * 0.6, h: available };
      scene = { x: 0, y: nav, w: station.x, h: available };
      bh = Math.min(available - 80, (station.w - 32) / ratio);
      bw = bh * ratio;
      box = { x: station.x + (station.w - bw) / 2, y: nav + 22, w: bw, h: bh };
    } else {
      // The grate grows horizontally; the basin receives the recovered height.
      bh = wide ? Math.min(224, available * 0.30, (w - 344) / ratio) : (w - 40) / ratio;
      bw = bh * ratio; sh = bh + (wide ? 74 : 84);
      station = { x: 0, y: footer - sh, w: w, h: sh };
      scene = { x: 0, y: nav, w: w, h: available - sh };
      box = { x: (w - bw) / 2, y: station.y + (wide ? 24 : 22), w: bw, h: bh };
    }
    if (wide) {
      var cw = Math.min(132, (w - bw) / 2 - 30), cy = station.y + (station.h - 96) / 2;
      var left = box.x - cw - 20, right = box.x + bw + 20;
      bin = { x: left, y: cy, w: cw, h: 44 };
      pump = { x: left, y: cy + 52, w: cw, h: 44 };
      action = { x: right, y: cy, w: cw, h: 44 };
      ash = { x: right, y: cy + 52, w: cw, h: 44 };
    } else {
      var cw = (station.w - 24 - gap * 3) / 4, cy = footer - 48;
      bin = { x: station.x + 12, y: cy, w: cw, h: 44 };
      pump = { x: bin.x + cw + gap, y: cy, w: cw, h: 44 };
      action = { x: pump.x + cw + gap, y: cy, w: cw, h: 44 };
      ash = { x: action.x + cw + gap, y: cy, w: cw, h: 44 };
    }
    return { w: w, h: h, top: nav, footer: footer, station: station, scene: scene,
      box: box, bin: bin, pump: pump, action: action, ash: ash,
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
    var label = pump ? (r.w < 90 ? 'AIR [B]' : 'BELLOWS [B]') :
      'COAL ' + (hearthDevSupplies() ? 'FREE' : forgeCount('coal'));
    if (r.h < 64) {
      if (r.w < 118) { hearthButton(c, r, label, pump ? 'pump' : 'coal', pump || forgeCount('coal') > 0); return; }
      hearthPlate(c, r, true);
      var ix = r.x + 27, iy = r.y + 22;
      if (pump) {
        c.fillStyle = BLD.woodDark; c.fillRect(ix - 15, iy + 5, 30, 3);
        c.fillStyle = BLD.woodMid; c.fillRect(ix - 16, iy - 9 + bed.air * 4, 32, 3);
        c.fillStyle = BLD.woodBase; c.beginPath();
        c.moveTo(ix - 13, iy - 6 + bed.air * 4); c.lineTo(ix + 12, iy - 6 + bed.air * 4);
        c.lineTo(ix + 16, iy); c.lineTo(ix + 12, iy + 5); c.lineTo(ix - 13, iy + 5); c.closePath(); c.fill();
      } else for (var i = 0; i < Math.min(2, forgeCount('coal')); i++) {
        if (!hearthBinCoals[i]) hearthBinCoals[i] = { r: 13 + i, seed: (i + 1) * 0.137, angle: i * 1.7, heat: 0, fuel: 1 };
        hearthDrawCoal(c, hearthBinCoals[i], ix - 6 + i * 12, iy, 0.7, hearthToolTime);
      }
      hearthText(c, label, r.x + 48 + (r.w - 48) / 2, iy, 11, BLD.cream, 'center');
      hearthButtons.push(Object.assign({ action: pump ? 'pump' : 'coal' }, r)); return;
    }
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
      if (L.wide && !bed.chunks.length) hearthText(c, 'LOAD COAL', L.bin.x + L.bin.w / 2, L.bin.y - 13, 11, BLD.cream, 'center');
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
