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
  var bathInteriorHalo = null;
  function bathInteriorLight(c, x, y, radius) {
    if (!bathInteriorHalo) {
      bathInteriorHalo = document.createElement('canvas');
      bathInteriorHalo.width = bathInteriorHalo.height = 128;
      var g = bathInteriorHalo.getContext('2d');
      var glow = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      glow.addColorStop(0, hearthArtColor(BLD.warmGlow, 0.28));
      glow.addColorStop(0.24, hearthArtColor(BLD.warmGlow, 0.16));
      glow.addColorStop(0.62, hearthArtColor(BLD.warmGlow, 0.045));
      glow.addColorStop(1, hearthArtColor(BLD.warmGlow, 0));
      g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
    }
    c.drawImage(bathInteriorHalo, x - radius, y - radius, radius * 2, radius * 2);
  }
  function bathInteriorTimber(c, x, y, w, h) {
    c.fillStyle = BLD.woodDeep; c.fillRect(x, y, w, h);
    c.fillStyle = BLD.woodDark; c.fillRect(x + 2, y + 2, w - 5, h - 5);
    c.fillStyle = hearthArtColor(BLD.woodBase, 0.65);
    c.fillRect(x + 2, y + 2, w - 5, 2); c.fillRect(x + 2, y + 4, 2, h - 8);
    c.fillStyle = hearthArtColor(BLD.woodDeep, 0.5);
    c.fillRect(x + w - 5, y + 4, 3, h - 7); c.fillRect(x + 4, y + h - 5, w - 8, 3);
  }
  function bathInteriorLantern(c, x, y, scale) {
    bathInteriorLight(c, x, y + 9 * scale, 148 * scale);
    c.save(); c.translate(x, y); c.scale(scale, scale);
    // A short wall bracket fixes the lamp to the lintel rather than the sky.
    c.fillStyle = BLD.metalDark; c.fillRect(-5, -19, 10, 17);
    c.fillStyle = BLD.metalLight; c.fillRect(-4, -18, 1, 14);
    hearthIronBolt(c, 0, -14, 1.8);
    c.fillStyle = BLD.outline;
    c.beginPath(); c.moveTo(-9, -4); c.lineTo(9, -4); c.lineTo(15, 4);
    c.lineTo(15, 21); c.lineTo(9, 29); c.lineTo(-9, 29);
    c.lineTo(-15, 21); c.lineTo(-15, 4); c.closePath(); c.fill();
    c.fillStyle = BLD.goldDark;
    c.beginPath(); c.ellipse(0, 12, 12, 16, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.goldBright;
    c.beginPath(); c.ellipse(-1.5, 11, 9, 14, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.warmGlow;
    c.beginPath(); c.ellipse(-3, 9, 5, 11, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = hearthArtColor(BLD.goldDark, 0.65); c.lineWidth = 1.3;
    for (var side = -1; side <= 1; side += 2) {
      c.beginPath(); c.moveTo(side * 5, -1);
      c.quadraticCurveTo(side * 11, 12, side * 5, 26); c.stroke();
    }
    c.fillStyle = BLD.metalDark; c.fillRect(-12, -5, 24, 5); c.fillRect(-10, 26, 20, 5);
    c.fillStyle = BLD.metalLight; c.fillRect(-11, -5, 20, 1);
    c.fillStyle = BLD.goldDark; c.fillRect(-5, 31, 10, 3);
    c.restore();
  }
  function bathInteriorNameboard(c, x, y, scale) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    // The stepped carved crown repeats the window casings on the exterior.
    c.fillStyle = BLD.woodDeep;
    c.beginPath(); c.moveTo(-125, 57); c.lineTo(-125, -3); c.lineTo(-113, -3);
    c.lineTo(-113, -11); c.lineTo(-30, -11); c.lineTo(0, -19);
    c.lineTo(30, -11); c.lineTo(113, -11); c.lineTo(113, -3);
    c.lineTo(125, -3); c.lineTo(125, 57); c.closePath(); c.fill();
    bathInteriorTimber(c, -120, -5, 240, 58);
    c.fillStyle = BLD.woodBase; c.fillRect(-113, -9, 226, 3);
    c.fillStyle = BLD.woodMid; c.fillRect(-112, -9, 222, 1);
    c.fillStyle = BLD.woodDeep; c.fillRect(-106, 3, 212, 42);
    c.strokeStyle = hearthArtColor(BLD.goldDark, 0.7); c.lineWidth = 1;
    c.strokeRect(-103, 6, 206, 36);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = BLD.goldPale; c.font = '23px ' + UI_FONT; c.fillText('Б А Н Я', 0, 20);
    c.fillStyle = BLD.woodPale; c.font = '8px ' + UI_FONT; c.fillText('THE BATHHOUSE', 0, 35);
    for (var side = -1; side <= 1; side += 2) {
      c.fillStyle = BLD.woodBase; c.fillRect(side * 114 - 2, 8, 4, 30);
      c.fillStyle = BLD.woodDeep; c.fillRect(side * 114 - 1, 16, 2, 14);
    }
    c.fillStyle = BLD.woodMid;
    c.beginPath(); c.moveTo(0, -15); c.lineTo(5, -11); c.lineTo(0, -7); c.lineTo(-5, -11); c.closePath(); c.fill();
    c.restore();
  }
  function bathDrawInteriorWall(view) {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    var c = ctx, x = view ? view.x : cam.x, top = view ? view.y : cam.y;
    var width = view ? view.w : screenW, height = view ? view.h : screenH, floor = F.fr * TILE;
    var bounds = bathToolBounds(), left = bounds.left + 18, right = bounds.right + 24;
    var mid = (curve.x0 + curve.x1) / 2, beamY = bounds.top - 26;
    c.save();
    c.fillStyle = BLD.woodDeep; c.fillRect(x, top, width, height);
    // Broad shiplap courses sit in quiet shadow behind the raised joinery.
    c.fillStyle = hearthArtColor(BLD.woodDark, 0.6); c.fillRect(x, top, width, floor - top);
    for (var row = Math.floor(top / 42); row * 42 < floor; row++) {
      var by = row * 42, tint = hearthArtHash(row * 43);
      c.fillStyle = hearthArtColor(BLD.woodBase, 0.06 + tint * 0.05);
      c.fillRect(x, by + 2, width, 38);
      c.fillStyle = hearthArtColor(BLD.woodDeep, 0.45); c.fillRect(x, by + 40, width, 2);
      c.fillStyle = hearthArtColor(BLD.woodMid, 0.10); c.fillRect(x, by + 2, width, 1);
      // Sparse grain follows the boards, never a full-height stripe pattern.
      for (var bx = Math.floor(x / 180) * 180; bx < x + width; bx += 180) {
        var seed = row * 91 + bx, gx = bx + 24 + hearthArtHash(seed) * 100;
        var gy = by + 12 + hearthArtHash(seed + 7) * 18;
        c.fillStyle = hearthArtColor(BLD.woodDeep, 0.18); c.fillRect(gx, gy, 20, 1);
        c.fillRect(gx + 13, gy + 3, 9, 1);
      }
    }
    // A shallow timber roof and pegged posts make the large upper wall a room.
    var rise = Math.max(0, Math.min(100, beamY - top - 24 / worldScale));
    c.fillStyle = hearthArtColor(BLD.woodDeep, 0.6);
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + width, top);
    c.lineTo(x + width, beamY); c.lineTo(right, beamY);
    c.lineTo(mid, beamY - rise); c.lineTo(left, beamY); c.lineTo(x, beamY); c.closePath(); c.fill();
    if (rise > 30) bathInteriorTimber(c, mid - 8, beamY - rise, 16, rise + 8);
    c.strokeStyle = BLD.woodDeep; c.lineWidth = 24; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(left, beamY); c.lineTo(mid, beamY - rise); c.lineTo(right, beamY); c.stroke();
    c.strokeStyle = BLD.woodDark; c.lineWidth = 16; c.stroke();
    c.strokeStyle = hearthArtColor(BLD.woodBase, 0.65); c.lineWidth = 2;
    c.beginPath(); c.moveTo(left, beamY - 6); c.lineTo(mid, beamY - rise - 6); c.lineTo(right, beamY - 6); c.stroke();
    bathInteriorTimber(c, left - 12, beamY, 24, floor - beamY + 18);
    bathInteriorTimber(c, right - 12, beamY, 24, floor - beamY + 18);
    bathInteriorTimber(c, left - 22, beamY - 7, right - left + 44, 28);
    for (var side = 0; side < 2; side++) {
      var px = side ? right : left, dir = side ? -1 : 1;
      c.strokeStyle = BLD.woodDeep; c.lineWidth = 17;
      c.beginPath(); c.moveTo(px, beamY + 74); c.quadraticCurveTo(px + dir * 26, beamY + 34, px + dir * 68, beamY + 18); c.stroke();
      c.strokeStyle = BLD.woodDark; c.lineWidth = 11; c.stroke();
      hearthIronBolt(c, px, beamY + 8, 2.5);
    }
    bathToolDrawRail(c, bounds);
    var detailScale = Math.max(0.65, 0.6 / worldScale), signY = curve.y0 - 104;
    var lintelY = signY + 17 * detailScale;
    bathInteriorTimber(c, left, lintelY, right - left, 15 * detailScale);
    // The lanterns and nameboard all mount to the same carved lintel.
    for (var k = 0; k < 2; k++) {
      var lx = curve.x0 + (curve.x1 - curve.x0) * (k ? 0.82 : 0.18);
      bathInteriorLantern(c, lx, lintelY + 6 * detailScale, detailScale * 1.35);
    }
    bathInteriorNameboard(c, mid, signY, detailScale);
    // Keep the old supply outlet exactly on its conserved emission point.
    var tapX = (F.tubs[0][0] + 2) * TILE, tapY = (F.fr - 4) * TILE;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = BLD.outline; c.lineWidth = 12;
    c.beginPath(); c.moveTo(left + 16, beamY + 26); c.lineTo(left + 16, tapY - 28);
    c.lineTo(tapX - 20, tapY - 28); c.quadraticCurveTo(tapX, tapY - 28, tapX, tapY - 8);
    c.lineTo(tapX, tapY); c.stroke();
    c.strokeStyle = BLD.goldDark; c.lineWidth = 8; c.stroke();
    c.strokeStyle = hearthArtColor(BLD.goldBright, 0.65); c.lineWidth = 1.5; c.stroke();
    for (var clamp = 0; clamp < 2; clamp++) {
      var cy = tapY - 50 - clamp * 72;
      if (cy < beamY + 30) continue;
      c.fillStyle = BLD.metalDark; c.fillRect(left + 8, cy, 16, 6);
      hearthIronBolt(c, left + 11, cy + 2, 1.4);
    }
    c.fillStyle = BLD.metalDark; c.fillRect(tapX - 8, tapY - 5, 16, 6);
    // The waiting landing remains level with the actual guest contacts.
    bathInteriorTimber(c, 19 * TILE, floor, 5 * TILE - 24, 18);
    c.fillStyle = BLD.woodMid; c.fillRect(19 * TILE, floor, 5 * TILE - 24, 2);
    c.fillStyle = BLD.woodDeep; c.fillRect(curve.x0, curve.y0 - 16, curve.x1 - curve.x0, curve.D + 24);
    bathDrawDryLiner(c, curve);
    c.restore();
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
    var previous = ctx, buttons = hearthButtons, copperC = bathThermal ? bathThermal.copperC : 20;
    c.save();
    try {
      ctx = c;
      var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
      c.save(); c.scale(0.7, 0.7); c.translate(-curve.x0 + 140, -curve.y0 + 270);
      bathDrawInteriorWall({ x: curve.x0 - 140, y: curve.y0 - 270, w: curve.x1 - curve.x0 + 280, h: 520 });
      c.restore();
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
      // Compact phone actions and the shared navigation readout.
      hearthButtons = [];
      hearthButton(c, { x: 0, y: 150, w: 140, h: 52 }, 'WATER / 200 L', 'warm', true);
      hearthButton(c, { x: 148, y: 150, w: 100, h: 52 }, 'GUEST 1 SOAKING', 'warm', false);
      hearthButton(c, { x: 0, y: 212, w: 72, h: 44 }, 'WATER / 106 L', 'warm', true);
      hearthText(c, '450 L / 40.0 C', 12, 270, 12, BLD.cream);
      hearthText(c, GAME_VERSION + ' / 50 FPS', 12, 282, 8, UIT_DIM);
    } finally { hearthButtons = buttons; if (bathThermal) bathThermal.copperC = copperC; c.restore(); ctx = previous; }
  }
