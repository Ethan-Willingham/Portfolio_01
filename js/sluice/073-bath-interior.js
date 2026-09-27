  // The main bath shares one view with the working boiler below. Water and
  // the copper rim use the same world geometry. Upper purchased floors
  // retain their original tower view when the player scrolls up.
  function bathInteriorBottom() {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    return curve.y0 + curve.D + 28;
  }
  function bathMainRoomVisible() {
    var scene = hearthRoomLayout().scene;
    return cam.y + (scene.y + scene.h) / worldScale >= bathInteriorBottom() - 24;
  }
  function bathBoilerScreenRect() {
    return hearthRoomLayout().box;
  }
  function bathVesselPath(c, curve, outset, drop) {
    c.moveTo(curve.x0 - outset, curve.y0 - 16);
    for (var n = 0; n <= 96; n++) {
      var x = curve.x0 + (curve.x1 - curve.x0) * n / 96;
      c.lineTo(x + outset * (n / 48 - 1), curve.y0 + curve.depthAt(x) + drop);
    }
    c.lineTo(curve.x1 + outset, curve.y0 - 16); c.closePath();
  }
  function bathCopperWarmth(tempC) {
    // Stored copper energy sets this color, including its slow cooling after
    // the fuel burns out. Fire flicker and water temperature do not drive it.
    if (tempC === undefined) tempC = bathThermal ? bathThermal.copperC : 20;
    var warm = Math.max(0, Math.min(1, (tempC - 30) / 130));
    var glow = Math.max(0, Math.min(1, (tempC - 90) / 380));
    return { warm: warm * warm * (3 - 2 * warm), glow: glow * glow * (3 - 2 * glow) };
  }
  function bathCopperTint(c, curve, color, strength) {
    // The heated metal remains a continuous bowl. Keep some warmth up the
    // shoulders, with the strongest light across the underside over the fire.
    var tint = c.createLinearGradient(0, curve.y0, 0, curve.y0 + curve.D);
    tint.addColorStop(0, hearthArtColor(color, strength * 0.22));
    tint.addColorStop(0.48, hearthArtColor(color, strength * 0.62));
    tint.addColorStop(1, hearthArtColor(color, strength));
    return tint;
  }
  function bathDrawDryLiner(c, curve) {
    // This is the dry copper behind the liquid layer. A flat blue field made
    // a zero-litre tub look full before the hose had emitted any water.
    c.save(); c.beginPath(); bathVesselPath(c, curve, 0, 0); c.clip();
    var shade = c.createLinearGradient(0, curve.y0 - 16, 0, curve.y0 + curve.D);
    shade.addColorStop(0, BLD.woodDeep); shade.addColorStop(0.5, BLD.woodDark);
    shade.addColorStop(0.88, BLD.woodBase); shade.addColorStop(1, BLD.woodMid);
    c.fillStyle = shade; c.fillRect(curve.x0, curve.y0 - 16, curve.x1 - curve.x0, curve.D + 16);
    var heat = bathCopperWarmth();
    if (heat.warm > 0) {
      c.fillStyle = bathCopperTint(c, curve, BLD.redBright, heat.warm * 0.16);
      c.fillRect(curve.x0, curve.y0 - 16, curve.x1 - curve.x0, curve.D + 16);
    }
    if (heat.glow > 0) {
      c.fillStyle = bathCopperTint(c, curve, BLD.warmGlow, heat.glow * 0.24);
      c.fillRect(curve.x0, curve.y0 - 16, curve.x1 - curve.x0, curve.D + 16);
    }
    // Joined copper sheets and a few hammer marks read as a solid lining.
    // They stay fixed when the real water moves across them.
    for (var panel = 1; panel < 12; panel++) {
      var x = curve.x0 + (curve.x1 - curve.x0) * panel / 12;
      var bottom = curve.y0 + curve.depthAt(x);
      c.strokeStyle = hearthArtColor(BLD.woodDeep, 0.48); c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, curve.y0 - 16); c.lineTo(x, bottom); c.stroke();
      c.strokeStyle = hearthArtColor(BLD.woodPale, 0.16); c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x + 2, curve.y0 - 16); c.lineTo(x + 2, bottom); c.stroke();
      for (var mark = 0; mark < 4; mark++) {
        var px = x - 18 - hearthArtHash(panel * 53 + mark * 11) * 38;
        var py = curve.y0 + (bottom - curve.y0) * (0.18 + mark * 0.2);
        c.fillStyle = hearthArtColor(BLD.woodDeep, 0.14); c.fillRect(px, py, 4, 1.5);
        c.fillStyle = hearthArtColor(BLD.woodPale, 0.10); c.fillRect(px, py + 1.5, 3, 0.8);
      }
    }
    c.restore();
  }
  function bathDrawVessel(c) {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    var bottom = bathInteriorBottom(), left = cam.x - 2, width = screenW + 4;
    // The physical liner contains the water. Keep the sides visible so an
    // overflowing sheet can fall all the way to the floor before it is lost.
    c.fillStyle = BLD.woodDeep; c.fillRect(left, bottom - 11, width, screenH);
    // Offset outward along the true bowl normal. The water-facing edge stays
    // exactly on depthAt(), including the steep shoulders near each lip.
    bathRimBand(c, curve, 0, 24, BLD.outline);
    bathRimBand(c, curve, 1, 21, BLD.woodDeep);
    bathRimBand(c, curve, 2, 17, BLD.woodDark);
    bathRimBand(c, curve, 3, 11, BLD.woodMid);
    bathRimBand(c, curve, 3, 5, BLD.woodPale);
    bathRimBand(c, curve, 12, 14, BLD.woodBase);
    bathRimBand(c, curve, 18, 19, BLD.goldDark);
    var heat = bathCopperWarmth();
    if (heat.warm > 0) bathRimBand(c, curve, 2, 18, bathCopperTint(c, curve, BLD.redBright, heat.warm * 0.42));
    if (heat.glow > 0) bathRimBand(c, curve, 3, 17, bathCopperTint(c, curve, BLD.warmGlow, heat.glow * 0.70));
    // Broad hammered copper plates, with seam straps and paired iron rivets.
    for (var n = 1; n < 12; n++) {
      if (n === 6) continue; // The small compass seal replaces the center strap.
      var x = curve.x0 + (curve.x1 - curve.x0) * n / 12;
      var p = bathRimPoint(curve, x, 0);
      c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(-p.nx, p.ny));
      c.fillStyle = BLD.woodDeep; c.fillRect(-2, 6, 4, 15);
      c.fillStyle = BLD.woodLight; c.fillRect(-1, 6, 1, 14);
      hearthIronBolt(c, -6, 15, 1.8); hearthIronBolt(c, 6, 15, 1.8);
      c.restore();
    }
    bathDrawCopperGeometry(c, curve);
    for (var side = 0; side < 2; side++) {
      var x = side ? curve.x1 + 11 : curve.x0 - 11;
      c.fillStyle = BLD.outline; hearthChamfer(c, x - 20, curve.y0 - 20, 40, 11, 3); c.fill();
      c.fillStyle = BLD.woodDark; c.fillRect(x - 18, curve.y0 - 18, 36, 7);
      c.fillStyle = BLD.woodPale; c.fillRect(x - 17, curve.y0 - 18, 34, 1);
      hearthIronBolt(c, x - 12, curve.y0 - 14, 1.5); hearthIronBolt(c, x + 12, curve.y0 - 14, 1.5);
    }
  }
  // Quiet compass-work in the copper itself: a seven-circle center seal and
  // two overlapping-circle marks at the golden sections of the opening.
  function bathDrawCopperGeometry(c, curve) {
    var phi = (1 + Math.sqrt(5)) / 2, section = 1 / (phi * phi);
    var positions = [section, 0.5, 1 - section];
    for (var i = 0; i < positions.length; i++) {
      var p = bathRimPoint(curve, curve.x0 + (curve.x1 - curve.x0) * positions[i], 13);
      c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(-p.nx, p.ny));
      if (i === 1) {
        // Set flush into the existing rim, with a worn copper face and small
        // attachment rivets. The ornament never changes the water boundary.
        c.fillStyle = BLD.outline; c.beginPath(); c.arc(0, 0, 10.8, 0, Math.PI * 2); c.fill();
        c.fillStyle = BLD.woodDark; c.beginPath(); c.arc(0, 0, 9.8, 0, Math.PI * 2); c.fill();
        c.fillStyle = BLD.woodBase; c.beginPath(); c.arc(0, -0.35, 9.2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = hearthArtColor(BLD.woodPale, 0.55); c.lineWidth = 0.6;
        c.beginPath(); c.arc(0, -0.35, 8.6, 0, Math.PI * 2); c.stroke();
        hearthIronBolt(c, -15, 1, 1.5); hearthIronBolt(c, 15, 1, 1.5);
      }
      // A shallow dark cut with one light edge reads as engraving, not glow.
      for (var pass = 0; pass < 2; pass++) {
        var r = i === 1 ? 3.7 : 3.5, offset = pass ? -0.35 : 0.35;
        c.strokeStyle = hearthArtColor(pass ? BLD.woodPale : BLD.woodDeep, pass ? 0.5 : 0.65);
        c.lineWidth = pass ? 0.55 : 0.8; c.beginPath();
        if (i === 1) {
          c.moveTo(r, offset); c.arc(0, offset, r, 0, Math.PI * 2);
          for (var petal = 0; petal < 6; petal++) {
            var angle = petal * Math.PI / 3 - Math.PI / 2;
            var cx = Math.cos(angle) * r, cy = Math.sin(angle) * r + offset;
            c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, Math.PI * 2);
          }
        } else {
          c.moveTo(r / 2, offset); c.arc(-r / 2, offset, r, 0, Math.PI * 2);
          c.moveTo(r * 1.5, offset); c.arc(r / 2, offset, r, 0, Math.PI * 2);
        }
        c.stroke();
      }
      c.restore();
    }
  }
  function bathRimPoint(curve, x, offset) {
    var a = Math.max(curve.x0, x - 0.5), b = Math.min(curve.x1, x + 0.5);
    var slope = (curve.depthAt(b) - curve.depthAt(a)) / Math.max(0.001, b - a);
    var ny = 1 / Math.sqrt(1 + slope * slope), nx = -slope * ny;
    return { x: x + nx * offset, y: curve.y0 + curve.depthAt(x) + ny * offset, nx: nx, ny: ny };
  }
  function bathRimBand(c, curve, inner, outer, color) {
    c.fillStyle = color; c.beginPath();
    c.moveTo(curve.x0 - inner, curve.y0 - 16);
    for (var n = 0; n <= 96; n++) {
      var p = bathRimPoint(curve, curve.x0 + (curve.x1 - curve.x0) * n / 96, inner);
      c.lineTo(p.x, p.y);
    }
    c.lineTo(curve.x1 + inner, curve.y0 - 16);
    c.lineTo(curve.x1 + outer, curve.y0 - 16);
    for (var n = 96; n >= 0; n--) {
      var p = bathRimPoint(curve, curve.x0 + (curve.x1 - curve.x0) * n / 96, outer);
      c.lineTo(p.x, p.y);
    }
    c.lineTo(curve.x0 - outer, curve.y0 - 16);
    c.closePath(); c.fill();
  }
  function bathDrawInteriorWall() {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    var x = cam.x, top = cam.y, width = screenW, floor = F.fr * TILE;
    var wallTop = top + hearthNavHeight() / worldScale;
    ctx.fillStyle = BLD.woodDeep; ctx.fillRect(x, top, width, screenH);
    // Broad, quiet timber boards let the water and the curved copper edge lead.
    for (var bx = Math.floor(x / 48) * 48; bx < x + width; bx += 48) {
      ctx.fillStyle = hearthArtColor(BLD.woodDark, 0.38);
      ctx.fillRect(bx + 2, wallTop, 44, floor - wallTop);
      ctx.fillStyle = hearthArtColor(BLD.woodLight, 0.10);
      ctx.fillRect(bx + 3, wallTop, 1, floor - wallTop);
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(bx + 8, wallTop + 24, 2, 2);
    }
    var railY = curve.y0 - 90;
    ctx.fillStyle = BLD.woodDark; ctx.fillRect(x, railY, width, 6);
    ctx.fillStyle = BLD.woodMid; ctx.fillRect(x, railY, width, 1);
    ctx.fillStyle = BLD.woodDark; ctx.fillRect(x + 10, wallTop, 18, floor - wallTop);
    ctx.fillRect(x + width - 28, wallTop, 18, floor - wallTop);
    var detailScale = Math.max(0.65, 0.6 / worldScale);
    var signY = curve.y0 - 104;
    var mid = (curve.x0 + curve.x1) / 2;
    ctx.save(); ctx.translate(mid, signY); ctx.scale(detailScale, detailScale);
    ctx.fillStyle = BLD.outline; ctx.fillRect(-110, 0, 220, 58);
    ctx.strokeStyle = BLD.goldDark; ctx.lineWidth = 1; ctx.strokeRect(-106, 4, 212, 50);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = BLD.cream; ctx.font = '24px ' + UI_FONT; ctx.fillText('Б А Н Я', 0, 23);
    ctx.fillStyle = BLD.goldBase; ctx.font = '9px ' + UI_FONT; ctx.fillText('THE BATHHOUSE', 0, 44); ctx.restore();
    for (var side = 0; side < 2; side++) {
      var lx = curve.x0 + (curve.x1 - curve.x0) * (side ? 0.82 : 0.18);
      var ly = Math.max(wallTop + 22, Math.min(curve.y0 - 68, signY + 26));
      ctx.fillStyle = BLD.metalDark; ctx.fillRect(lx - 2, wallTop, 4, ly - wallTop);
      ctx.fillStyle = hearthArtColor(BLD.warmGlow, 0.035); ctx.beginPath(); ctx.arc(lx, ly, 108, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hearthArtColor(BLD.warmGlow, 0.045); ctx.beginPath(); ctx.arc(lx, ly, 66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BLD.outline; ctx.fillRect(lx - 13, ly - 12, 26, 32);
      ctx.fillStyle = BLD.goldDark; ctx.fillRect(lx - 10, ly - 9, 20, 26);
      ctx.fillStyle = BLD.warmGlow; ctx.fillRect(lx - 7, ly - 6, 14, 19);
      ctx.fillStyle = BLD.metalDark; ctx.fillRect(lx - 16, ly - 14, 32, 4);
    }
    // The supply spout aligns exactly with the conserved water emitter.
    var tapX = (F.tubs[0][0] + 2) * TILE, tapY = (F.fr - 4) * TILE;
    ctx.strokeStyle = BLD.outline; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(x + 20, tapY - 34); ctx.lineTo(tapX - 22, tapY - 34);
    ctx.lineTo(tapX, tapY - 16); ctx.lineTo(tapX, tapY); ctx.stroke();
    ctx.strokeStyle = BLD.goldDark; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = BLD.goldBase; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = BLD.metalDark; ctx.fillRect(tapX - 8, tapY - 5, 16, 6);
    // A dry timber landing for the waiting visitors, level with physics.
    ctx.fillStyle = BLD.woodDark; ctx.fillRect(19 * TILE, floor, 5 * TILE - 24, 18);
    ctx.fillStyle = BLD.woodLight; ctx.fillRect(19 * TILE, floor, 5 * TILE - 24, 3);
    ctx.fillStyle = BLD.woodDeep; ctx.fillRect(curve.x0, curve.y0 - 16, curve.x1 - curve.x0, curve.D + 24);
    bathDrawDryLiner(ctx, curve);
  }
  function bathDrawInterior() {
    var ws = dpr * worldScale;
    ctx.setTransform(ws, 0, 0, ws, -Math.round(cam.x * ws), -Math.round(cam.y * ws));
    bathDrawInteriorWall();
    var foreground = uiTopEnsure();
    if (foreground) {
      foreground.setTransform(1, 0, 0, 1, 0, 0);
      foreground.clearRect(0, 0, uiTopCanvas.width, uiTopCanvas.height);
      foreground.setTransform(ws, 0, 0, ws, -Math.round(cam.x * ws), -Math.round(cam.y * ws));
      bathDrawVessel(foreground);
    }
    drawLiquids(); bathWorldSmokeVisibility(true);
    var previous = ctx;
    try {
      if (foreground) ctx = foreground;
      ctx.setTransform(ws, 0, 0, ws, -Math.round(cam.x * ws), -Math.round(cam.y * ws));
      bathArrivalDraw(ctx);
      bathDrawGuests();
      if (typeof bathThermalDraw === 'function') bathThermalDraw(ctx);
      bathToolDraw(ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hearthButtons = [];
      hearthDrawStation(ctx);
      bathDrawServiceHUD();
      hearthDrawOverlays(ctx);
    } finally { ctx = previous; }
    return true;
  }
  function bathInteriorWarm(c) {
    var previous = ctx, copperC = bathThermal ? bathThermal.copperC : 20;
    c.save();
    try {
      ctx = c;
      var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
      c.translate(-curve.x0, -curve.y0);
      bathDrawDryLiner(c, curve);
      bathDrawVessel(c);
      if (bathThermal) bathThermal.copperC = 400;
      bathDrawDryLiner(c, curve);
      bathDrawVessel(c);
      if (bathThermal) bathThermal.copperC = copperC;
      bathArrivalWarm(c, curve);
      if (typeof bathThermalWarm === 'function') bathThermalWarm(c);
      var b = bathToolBounds(), x = (curve.x0 + curve.x1) / 2, y = curve.y0 - 50;
      ['claw', 'hose'].forEach(function (mode) {
        bathToolDraw(c, { mode: mode, x: x, y: y, railX: x, tilt: 0.2, jaw: 0.5, flow: 1,
          rope: [{ x: x, y: b.top }, { x: x + 12, y: y - 40 }, { x: x, y: y }] });
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
      hearthDrawCasing(c, { x: 24, y: 30, w: 208, h: 160 }, hearthBeds.boiler, false);
      hearthDrawStriker(c, 240, 60, 1, 0.5);
      drawBathSilos(c, 0, 0, 250, 110, { labels: true });
    } finally { if (bathThermal) bathThermal.copperC = copperC; c.restore(); ctx = previous; }
  }
