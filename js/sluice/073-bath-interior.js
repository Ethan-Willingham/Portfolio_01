  // The main bath is one room. Its water, rim and boiler share world geometry;
  // only the wall dressing expands with the viewport. Upper purchased floors
  // retain their original tower view when the player scrolls up.
  function bathBoilerWorldRect() {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    return { x: (curve.x0 + curve.x1) / 2 - 144,
      y: curve.y0 + curve.D + 22, w: 288, h: 106 };
  }
  function bathInteriorBottom() {
    var r = bathBoilerWorldRect();
    return r.y + r.h + 18;
  }
  function bathMainRoomVisible() {
    return cam.y + (canvas.height / dpr - bathHUDHeight() - 12) / worldScale >= bathInteriorBottom() - 24;
  }
  function bathBoilerScreenRect() {
    var r = bathBoilerWorldRect(), w = Math.max(44, r.w * worldScale), h = Math.max(44, r.h * worldScale);
    if (!bathMainRoomVisible()) return { x: -1000, y: -1000, w: 0, h: 0 };
    return { x: (r.x + r.w / 2 - cam.x) * worldScale - w / 2,
      y: (r.y + r.h / 2 - cam.y) * worldScale - h / 2, w: w, h: h };
  }
  function bathVesselPath(c, curve, outset, drop) {
    c.moveTo(curve.x0 - outset, curve.y0 - 16);
    for (var n = 0; n <= 96; n++) {
      var x = curve.x0 + (curve.x1 - curve.x0) * n / 96;
      c.lineTo(x + outset * (n / 48 - 1), curve.y0 + curve.depthAt(x) + drop);
    }
    c.lineTo(curve.x1 + outset, curve.y0 - 16); c.closePath();
  }
  function bathDrawVessel(c) {
    var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
    var bottom = bathInteriorBottom(), left = cam.x - 2, width = screenW + 4;
    // Hide tile-shaped water outside the catenary. The vessel itself is a
    // curved shell, not a rectangular slab surrounding a curved opening.
    c.fillStyle = BLD.woodDeep; c.beginPath();
    c.rect(left, curve.y0 - 16, width, bottom - curve.y0 + 20);
    bathVesselPath(c, curve, 0, 0); c.fill('evenodd');
    c.fillStyle = BLD.stoneDark; c.fillRect(left, bottom - 11, width, screenH);
    c.fillStyle = BLD.stoneBase; c.fillRect(left, bottom - 11, width, 3);
    c.fillStyle = BLD.outline;
    c.beginPath(); bathVesselPath(c, curve, 28, 28); bathVesselPath(c, curve, 0, 0); c.fill('evenodd');
    c.fillStyle = BLD.stoneLight;
    c.beginPath(); bathVesselPath(c, curve, 24, 24); bathVesselPath(c, curve, 0, 0); c.fill('evenodd');
    c.strokeStyle = BLD.goldDark; c.lineWidth = 6; c.beginPath();
    for (var n = 0; n <= 96; n++) {
      var x = curve.x0 + (curve.x1 - curve.x0) * n / 96;
      if (!n) c.moveTo(x, curve.y0); else c.lineTo(x, curve.y0 + curve.depthAt(x));
    }
    c.stroke(); c.strokeStyle = BLD.cream; c.lineWidth = 1; c.stroke();
    // Bolts follow the same hanging-chain curve as the liner.
    for (var n = 1; n < 24; n++) {
      var x = curve.x0 + (curve.x1 - curve.x0) * n / 24;
      var y = curve.y0 + curve.depthAt(x) + 13;
      c.fillStyle = BLD.metalDark; c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = BLD.metalPale; c.fillRect(x - 2, y - 2, 3, 1);
      c.fillStyle = BLD.outline; c.fillRect(x - 2, y, 4, 1);
    }
    for (var side = 0; side < 2; side++) {
      var x = side ? curve.x1 - 2 : curve.x0 - 28;
      c.fillStyle = BLD.outline; c.fillRect(x - 2, curve.y0 - 20, 34, 10);
      c.fillStyle = BLD.goldDark; c.fillRect(x, curve.y0 - 19, 30, 7);
      c.fillStyle = BLD.goldPale; c.fillRect(x, curve.y0 - 19, 30, 2);
    }
    bathDrawIntegratedBoiler(c, curve);
  }
  function bathDrawIntegratedBoiler(c, curve) {
    var r = bathBoilerWorldRect(), hot = Math.max(0, Math.min(1, hearthBeds.boiler.power));
    // The masonry shoulders meet the underside of the tub. This is the
    // actual boiler bed, also rendered in the close view, with the same coal.
    c.fillStyle = BLD.outline; c.fillRect(r.x - 34, r.y - 13, r.w + 68, r.h + 24);
    c.fillStyle = BLD.stoneDark; c.fillRect(r.x - 30, r.y - 10, r.w + 60, r.h + 17);
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 5; col++) {
        c.fillStyle = row % 2 ? BLD.stoneBase : BLD.stoneDark;
        c.fillRect(r.x - 26 + col * 68, r.y - 6 + row * 29, 65, 25);
      }
    }
    c.fillStyle = bathBoilerHover ? BLD.goldBase : BLD.metalBase;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = bathBoilerHover ? BLD.goldPale : BLD.metalLight;
    c.lineWidth = bathBoilerHover ? 3 : 1; c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    c.fillStyle = BLD.outline; c.fillRect(r.x + 43, r.y + 12, r.w - 86, r.h - 28);
    hearthDrawFirebox(c, hearthBeds.boiler, r.x + 47, r.y + 15, r.w - 94, r.h - 35, hearthToolTime);
    // Iron guard bars keep the glowing coal visible through the hatch.
    c.fillStyle = BLD.metalDark;
    for (var bar = 0; bar < 6; bar++) c.fillRect(r.x + 55 + bar * 33, r.y + 18, 3, r.h - 34);
    c.fillStyle = BLD.metalLight; c.fillRect(r.x + 16, r.y + 28, 9, 47);
    c.fillStyle = BLD.outline; c.fillRect(r.x + r.w - 30, r.y + 40, 18, 7);
    c.fillStyle = BLD.goldPale; c.fillRect(r.x + r.w - 28, r.y + 40, 14, 3);
    c.fillStyle = hot > 0.05 ? BLD.warmGlow : BLD.metalDark;
    c.fillRect(r.x + r.w - 25, r.y + 20, 7, 7);
    for (var corner = 0; corner < 4; corner++) {
      c.fillStyle = BLD.metalPale;
      c.fillRect(r.x + (corner % 2 ? r.w - 8 : 5), r.y + (corner > 1 ? r.h - 8 : 5), 3, 3);
    }
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
    var detailScale = Math.max(1, 0.8 / worldScale);
    var signY = Math.min(curve.y0 - 152, wallTop + 38 / worldScale);
    var mid = (curve.x0 + curve.x1) / 2;
    ctx.save(); ctx.translate(mid, signY); ctx.scale(detailScale, detailScale);
    ctx.fillStyle = BLD.outline; ctx.fillRect(-110, 0, 220, 58);
    ctx.strokeStyle = BLD.goldDark; ctx.lineWidth = 1; ctx.strokeRect(-106, 4, 212, 50);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = BLD.cream; ctx.font = '24px ' + UI_FONT; ctx.fillText('Б А Н Я', 0, 23);
    ctx.fillStyle = BLD.goldBase; ctx.font = '9px ' + UI_FONT; ctx.fillText('THE BATHHOUSE', 0, 44); ctx.restore();
    for (var side = 0; side < 2; side++) {
      var lx = curve.x0 + (curve.x1 - curve.x0) * (side ? 0.82 : 0.18);
      var ly = Math.max(wallTop + 22, Math.min(curve.y0 - 108, signY + 34));
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
    ctx.fillStyle = BLD.metalDark; ctx.beginPath(); bathVesselPath(ctx, curve, 0, 0); ctx.fill();
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
    drawLiquids(); drawSmoke();
    var previous = ctx;
    try {
      if (foreground) ctx = foreground;
      ctx.setTransform(ws, 0, 0, ws, -Math.round(cam.x * ws), -Math.round(cam.y * ws));
      bathDrawGuests();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var hit = bathBoilerScreenRect();
      var label = bathBoilerHover ? 'OPEN BOILER' : 'BOILER';
      var labelWidth = bathBoilerHover ? 118 : 74;
      ctx.fillStyle = UIT_PANEL; ctx.fillRect(hit.x + (hit.w - labelWidth) / 2, hit.y + hit.h - 1, labelWidth, 18);
      hearthText(ctx, label, hit.x + hit.w / 2, hit.y + hit.h + 9, 10, bathBoilerHover ? BLD.goldPale : BLD.cream, 'center');
      bathDrawServiceHUD();
    } finally { ctx = previous; }
    return true;
  }
  function bathInteriorWarm(c) {
    var previous = ctx;
    c.save();
    try {
      ctx = c;
      var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
      c.translate(-curve.x0, -curve.y0);
      bathDrawVessel(c);
    } finally { c.restore(); ctx = previous; }
  }
