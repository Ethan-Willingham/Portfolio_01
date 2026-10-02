  /* ---- Fuel placement, hand-struck sparks and the travelling grate ---- */
  var hearthHand = { mode: 'fuel', material: 'coal', x: 0, y: 0, visible: false,
    rack: false, rackPage: 0, silos: false, preview: null, pointer: null, downX: 0, downY: 0, stroke: 0, sparks: [], rake: null, ashFall: [] };
  var hearthOverlayCanvas = null, hearthOverlayCtx = null;
  function hearthOverlayHide() { if (hearthOverlayCanvas) hearthOverlayCanvas.style.display = 'none'; }
  function hearthOverlayContext(fallback) {
    // GPU flames have their own DOM surface. Tools and trays must composite
    // above that surface, while the vessel and fuel stay beneath the fire.
    if (!hearthOverlayCanvas) {
      try {
        hearthOverlayCanvas = document.createElement('canvas');
        hearthOverlayCanvas.setAttribute('aria-hidden', 'true');
        hearthOverlayCtx = hearthOverlayCanvas.getContext('2d');
        if (!hearthOverlayCtx) { hearthOverlayCanvas = null; return fallback; }
        hearthOverlayCanvas.style.cssText = 'position:absolute;pointer-events:none;z-index:10;display:none;';
        canvas.parentNode.appendChild(hearthOverlayCanvas);
      } catch (e) { hearthOverlayCanvas = null; hearthOverlayCtx = null; return fallback; }
    }
    var r = canvas.getBoundingClientRect(), parent = canvas.parentNode.getBoundingClientRect();
    var layer = hearthOverlayCanvas, c = hearthOverlayCtx;
    if (layer.width !== canvas.width) layer.width = canvas.width;
    if (layer.height !== canvas.height) layer.height = canvas.height;
    layer.style.left = (r.left - parent.left) + 'px'; layer.style.top = (r.top - parent.top) + 'px';
    layer.style.width = r.width + 'px'; layer.style.height = r.height + 'px'; layer.style.display = 'block';
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, layer.width, layer.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }
  function hearthHandReset() {
    hearthHand.pointer = null; hearthHand.visible = false; hearthHand.rack = false; hearthHand.silos = false;
    hearthHand.rackPage = 0; hearthHand.preview = null; hearthHand.sparks = []; hearthHand.rake = null; hearthHand.ashFall = [];
  }
  function hearthSelectMaterial(id) {
    if (HEARTH_MATERIAL_ORDER.indexOf(id) < 0) return false;
    hearthCancelDrag(); bathToolReset(); hearthHand.material = id;
    hearthHand.mode = 'fuel'; hearthHand.rack = false; hearthHand.preview = null;
    bathNoticeT = 0; sfxPlay('ui-click'); return true;
  }
  function hearthHandPoint(p, touch) {
    // The preview and the realized piece share this exact point and hull.
    var box = hearthRoomLayout().box, ox = touch ? 0 : 14, oy = touch ? 0 : -16;
    return { x: (p.x + ox - box.x) * HEARTH_WIDTH / box.w,
      y: HEARTH_TOP + (p.y + oy - box.y) * HEARTH_HEIGHT / box.h,
      sx: p.x + ox, sy: p.y + oy };
  }
  function hearthHandPreview() {
    var h = hearthHand, next = hearthBeds.boiler.nextId;
    if (!h.preview || h.preview.id !== next || h.preview.material !== h.material)
      h.preview = hearthFuelPreview(h.material, 'boiler');
    return h.preview;
  }
  function hearthPlacementPointInside(p) { return hearthChamberContains(p.x,p.y,0); }
  function hearthPlacementValid(p) {
    if (!hearthPlacementPointInside(p)) return false;
    var body = hearthHandPreview();
    body.x = p.x; body.y = p.y; hearthWorldHull(body);
    // A drop creates this hull at the cursor even inside the existing pile.
    // The contact solver separates overlapping pieces on its next steps.
    return hearthChamberBodyContains(body,0.5);
  }
  function hearthPlaceSelected(p, touch) {
    var at = hearthHandPoint(p, touch);
    if (!hearthPlacementValid(at)) { bathSetNotice('Keep the whole preview inside the chamber.'); return false; }
    var body = hearthDropMaterial('boiler', at.x, at.y, hearthHand.material, hearthHandPreview());
    if (!body) { bathSetNotice('No ' + hearthMaterial(hearthHand.material).label.toLowerCase() + ' available, or the grate is full.'); return false; }
    body.vx = body.vy = body.spin = 0;
    hearthHand.preview = null; sfxPlay('debris', { gain: 0.35 }); saveNow('hearth-place'); return true;
  }
  function hearthSelectStriker() {
    hearthCancelDrag(); bathToolReset(); hearthHand.rack = false; hearthHand.mode = 'striker';
    bathSetNotice('Hold the flint above the fuel. Drag across it to cast sparks.');
  }
  function hearthCastSparks(p, dx, dy) {
    if (!hearthHasTool('flint') || !hearthHasTool('steel')) {
      bathSetNotice('Bring flint from mined stone. The steel striker is already here.'); return;
    }
    var box = hearthRoomLayout().box;
    var x = (p.x - box.x) * HEARTH_WIDTH / box.w, y = HEARTH_TOP + (p.y - box.y) * HEARTH_HEIGHT / box.h;
    if (!hearthChamberContains(x, y, 3)) return;
    var impulse = Math.min(1.8, Math.max(0.65, Math.hypot(dx, dy) / 18));
    for (var i = 0; i < 18 && hearthHand.sparks.length < 160; i++) {
      var seed = hearthSeed(hearthToolTime * 147 + i * 31);
      hearthHand.sparks.push({ x: x, y: y, ox: x, oy: y, vx: (seed - 0.5) * 125 + Math.sign(dx) * 20,
        vy: 45 + hearthSeed(seed * 113) * 95, life: 0.8 + seed * 0.5, energy: impulse });
    }
    hearthToolPulse = 1; sfxPlay('drill-bounce', { gain: 0.25 });
  }
  function hearthRakeStart() {
    if (hearthHand.rake) return;
    var inset = hearthChamberInset(HEARTH_FLOOR);
    hearthHand.rake = { time: 0, duration: 1.35, x: inset - 18, from: inset - 18,
      to: HEARTH_WIDTH - inset + 18, hit: {}, removed: 0 };
    hearthHand.rack = false; sfxPlay('debris', { gain: 0.25 });
  }
  function hearthHandTick(dt) {
    var h = hearthHand, bed = hearthBeds.boiler, steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
    for (var sub = 0; sub < steps; sub++) for (var i = h.sparks.length - 1; i >= 0; i--) {
      var s = h.sparks[i]; s.ox = s.x; s.oy = s.y; s.life -= step;
      s.vy += 520 * step; s.x += s.vx * step; s.y += s.vy * step;
      if (s.life <= 0 || !hearthChamberContains(s.x, s.y, 3)) { h.sparks.splice(i, 1); continue; }
      var hit = null;
      for (var j = 0; j < bed.chunks.length; j++) {
        var b = bed.chunks[j];
        if (!b.held && hearthInside(b, s.x, s.y, 2)) { hit = b; break; }
      }
      if (hit) { if (hearthIgniteAt('boiler', s.x, s.y, s.energy, hit)) saveNow('hearth-spark'); h.sparks.splice(i, 1); }
    }
    var rake = h.rake;
    if (rake) {
      var before = rake.x; rake.time = Math.min(rake.duration, rake.time + dt);
      var t = rake.time / rake.duration; rake.x = rake.from + (rake.to - rake.from) * (t * t * (3 - 2 * t));
      for (var i = 0; i < bed.chunks.length; i++) {
        var b = bed.chunks[i];
        if (b.held || rake.hit[b.id] || b.x + b.r < before - 18 || b.x - b.r > rake.x + 18 || b.y + b.r < HEARTH_FLOOR - 42) continue;
        rake.hit[b.id] = true;
        b.vx += 28; b.vy -= 55 + 25 * hearthSeed(b.id); b.spin += (hearthSeed(b.id + 71) - 0.5) * 1.8;
      }
      for (var i = bed.ash.length - 1; i >= 0; i--) {
        var g = bed.ash[i];
        if (g.x < before - 22 || g.x > rake.x + 22 || g.y < HEARTH_FLOOR - 34) continue;
        rake.removed += g.kg; bed.ash.splice(i, 1);
        if (h.ashFall.length < 72) h.ashFall.push({ x: g.x, y: HEARTH_FLOOR + 1, vy: 30, life: 0.6, seed: g.seed });
      }
      bed.ashLoad = Math.min(0.92, hearthAshMass(bed) / 0.025);
      if (rake.time === rake.duration) { h.rake = null; saveNow('hearth-rake'); }
    }
    for (var i = h.ashFall.length - 1; i >= 0; i--) {
      var g = h.ashFall[i]; g.life -= dt; g.vy += dt * 160; g.y += g.vy * dt;
      if (g.life <= 0) h.ashFall.splice(i, 1);
    }
  }
  function hearthDrawStriker(c, x, y, scale, stroke) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.fillStyle = BLD.outline; c.beginPath(); c.moveTo(-19, 7); c.lineTo(-10, -12); c.lineTo(7, -8);
    c.lineTo(14, 9); c.lineTo(-6, 16); c.closePath(); c.fill();
    c.fillStyle = BLD.stoneLight; c.beginPath(); c.moveTo(-14, 5); c.lineTo(-8, -8); c.lineTo(4, -5);
    c.lineTo(7, 7); c.lineTo(-4, 11); c.closePath(); c.fill();
    c.strokeStyle = BLD.outline; c.lineWidth = 8; c.beginPath();
    c.moveTo(10 + stroke * 8, -18); c.lineTo(24 + stroke * 8, -6); c.lineTo(14 + stroke * 8, 5); c.stroke();
    c.strokeStyle = BLD.metalLight; c.lineWidth = 4; c.stroke(); c.restore();
  }
  function hearthDrawGrateControl(c, r) {
    hearthPlate(c, r, true);
    var x = r.x + (r.w >= 110 ? 25 : r.w / 2), y = r.y + r.h / 2;
    var turn = hearthHand.rake ? hearthHand.rake.time / hearthHand.rake.duration * Math.PI * 2 : -0.7;
    c.save(); c.translate(x, y);
    c.strokeStyle = BLD.outline; c.lineWidth = 6;
    c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = BLD.metalLight; c.lineWidth = 2; c.stroke();
    c.rotate(turn); c.fillStyle = BLD.metalBase; c.fillRect(-12, -2, 26, 4);
    c.fillStyle = BLD.woodDark; c.fillRect(9, -6, 8, 12);
    c.fillStyle = hearthHand.rake ? BLD.goldPale : BLD.woodBase; c.fillRect(10, -5, 5, 9);
    c.restore();
    if (r.w >= 110) hearthText(c, 'GRATE', r.x + r.w - 8, y, 11, BLD.cream, 'right');
    hearthButtons.push(Object.assign({ action: 'ash' }, r));
  }
  function hearthFuelRackRect(L) {
    var w = Math.min(354, L.w - 24), h = (HEARTH_MATERIAL_ORDER.length > 6 ? 312 : 260) + (L.mobile ? 44 : 0);
    return { x: Math.max(12, Math.min(L.w - w - 12, L.bin.x)), y: Math.max(8, Math.min(L.h - h - 8, L.bin.y - h - 8)), w: w, h: h };
  }
  function hearthDrawFuelRack(c, L) {
    if (!hearthHand.rack) return;
    var r = hearthFuelRackRect(L); hearthPlate(c, r, true);
    hearthText(c, hearthDevSupplies() ? 'UNLIMITED MATERIALS' : 'FUEL & MINERALS', r.x + 12, r.y + 25, 11, BLD.cream);
    hearthButton(c, { x: r.x + r.w - 82, y: r.y + 4, w: 76, h: 44 }, L.mobile ? 'CLOSE' : 'TONGS', L.mobile ? 'close-tray' : 'hand', hearthHand.mode === 'hand');
    if (L.mobile) hearthButton(c, { x: r.x + 6, y: r.y + 48, w: r.w - 12, h: 44 }, 'TONGS / MOVE FUEL', 'hand', hearthHand.mode === 'hand');
    var down = L.mobile ? 44 : 0;
    var cw = (r.w - 24) / 3, first = hearthHand.rackPage * 6;
    for (var i = 0; i < 6 && first + i < HEARTH_MATERIAL_ORDER.length; i++) {
      var id = HEARTH_MATERIAL_ORDER[first + i], cell = { x: r.x + 6 + i % 3 * (cw + 3), y: r.y + 52 + down + Math.floor(i / 3) * 73, w: cw, h: 67 };
      var chosen = hearthHand.mode === 'fuel' && hearthHand.material === id;
      hearthPlate(c, cell, chosen);
      var sample = hearthFuelPreview(id, 'boiler');
      hearthDrawCoal(c, sample, cell.x + 23, cell.y + 21, 0.5, hearthToolTime);
      var stock = hearthDevSupplies() ? 'FREE' : String(hearthMaterialCount(id));
      hearthText(c, stock, cell.x + cell.w - 7, cell.y + 20, 11, BLD.cream, 'right');
      hearthText(c, hearthMaterial(id).label.toUpperCase(), cell.x + cell.w / 2, cell.y + 51, 11, chosen ? BLD.goldPale : BLD.cream, 'center');
      if (chosen) { c.fillStyle = BLD.goldBase; c.fillRect(cell.x + 6, cell.y + cell.h - 3, cell.w - 12, 2); }
      hearthButtons.push(Object.assign({ action: 'fuel:' + id }, cell));
    }
    var selected = hearthMaterial(hearthHand.material);
    hearthText(c, selected.role === 'additive' ? 'ADDITIVE / NO FUEL' : 'HEAT ' + selected.heat + '/5  BURN ' + selected.burn + '/5', r.x + 12, r.y + 211 + down, 11, BLD.goldPale);
    hearthWrap(c, selected.description, r.x + 12, r.y + 232 + down, r.w - 24, BLD.cream, 2);
    if (HEARTH_MATERIAL_ORDER.length > 6) {
      hearthButton(c, { x: r.x + 6, y: r.y + 264 + down, w: 76, h: 44 }, 'BACK', 'fuel-prev', first > 0);
      hearthText(c, (hearthHand.rackPage + 1) + ' / ' + Math.ceil(HEARTH_MATERIAL_ORDER.length / 6), r.x + r.w / 2, r.y + 286 + down, 11, BLD.cream, 'center');
      hearthButton(c, { x: r.x + r.w - 82, y: r.y + 264 + down, w: 76, h: 44 }, 'NEXT', 'fuel-next', first + 6 < HEARTH_MATERIAL_ORDER.length);
    }
  }
  function hearthDrawHand(c, L) {
    var h = hearthHand, box = L.box;
    c.save(); c.translate(box.x, box.y); c.scale(box.w / HEARTH_WIDTH, box.h / HEARTH_HEIGHT); c.translate(0, -HEARTH_TOP);
    c.lineWidth = 2.5;
    for (var i = 0; i < h.sparks.length; i++) {
      var s = h.sparks[i]; c.strokeStyle = s.life > 0.35 ? BLD.cream : BLD.goldBase;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); c.stroke();
    }
    if (h.rake) {
      var rx = h.rake.x;
      c.strokeStyle = BLD.outline; c.lineWidth = 6; c.beginPath(); c.moveTo(rx, HEARTH_FLOOR + 8); c.lineTo(rx, HEARTH_FLOOR - 30); c.stroke();
      c.strokeStyle = BLD.metalLight; c.lineWidth = 3; c.stroke();
      c.fillStyle = BLD.metalBase; c.fillRect(rx - 16, HEARTH_FLOOR - 22, 32, 5);
      for (var t = 0; t < 5; t++) c.fillRect(rx - 15 + t * 7, HEARTH_FLOOR - 32, 3, 14);
    }
    for (var i = 0; i < h.ashFall.length; i++) {
      var g = h.ashFall[i]; c.globalAlpha = Math.min(1, g.life * 3); c.fillStyle = BLD.stoneLight;
      c.fillRect(g.x, g.y, 3, 2);
    }
    c.restore();
    if (!h.visible || hearthDrag || h.rack || h.silos || bathTool.mode || gamePaused || bathFading) return;
    if (hearthButtons.some(function (b) { return hearthContains(b, h.x, h.y); })) return;
    if (h.mode === 'fuel') {
      var at = hearthHandPoint({ x: h.x, y: h.y }, bathToolTouchControls());
      if (!hearthPlacementPointInside(at)) return;
      var valid = hearthPlacementValid(at) && (hearthDevSupplies() || hearthMaterialCount(h.material) > 0);
      c.save();
      c.translate(box.x, box.y); c.scale(box.w / HEARTH_WIDTH, box.h / HEARTH_HEIGHT); c.translate(0, -HEARTH_TOP);
      hearthDrawFuelGhost(c, hearthHandPreview(), at.x, at.y, hearthToolTime, valid, HEARTH_WIDTH / box.w); c.restore();
      c.strokeStyle = valid ? BLD.cream : UIT_RED; c.lineWidth = 1;
      c.beginPath(); c.moveTo(at.sx - 4, at.sy); c.lineTo(at.sx + 4, at.sy); c.moveTo(at.sx, at.sy - 4); c.lineTo(at.sx, at.sy + 4); c.stroke();
    } else if (h.mode === 'striker' && hearthPlacementPointInside(hearthHandPoint({ x: h.x, y: h.y }, true))) {
      c.save(); c.globalAlpha = h.pointer === null ? 0.7 : 1;
      hearthDrawStriker(c, h.x, h.y, 0.9, Math.sin(h.stroke * 0.2)); c.restore();
    }
  }
  function hearthDrawLiquidRack(c, L) {
    if (!hearthHand.silos) return;
    var w = Math.min(354, L.w - 24), h = L.mobile ? 300 : 256;
    var r = { x: Math.max(12, Math.min(L.w - w - 12, L.water.x)), y: Math.max(L.mobile ? 8 : 56, Math.min(L.h - h - 12, L.water.y - h - 8)), w: w, h: h };
    hearthPlate(c, r, true); hearthText(c, 'LIQUID SILOS', r.x + 12, r.y + 14, 11, BLD.cream);
    if (L.mobile) hearthButton(c, { x: r.x + r.w - 82, y: r.y + 4, w: 76, h: 44 }, 'CLOSE', 'close-tray', true);
    var tanks = drawBathSilos(c, r.x + 8, r.y + (L.mobile ? 52 : 29), r.w - 16, L.mobile ? 66 : 114, { labels: true });
    for (var i = 0; i < tanks.length; i++) hearthButtons.push(Object.assign({ action: 'silo-' + i }, tanks[i]));
    var cols = L.mobile ? 3 : 5, cw = (r.w - 12 - (cols - 1) * 4) / cols;
    for (var type = 0; type < 5; type++) {
      var q = { x: r.x + 6 + type % cols * (cw + 4), y: r.y + (L.mobile ? 126 : 152) + Math.floor(type / cols) * 52, w: cw, h: L.mobile ? 48 : 44 };
      var active = bathSilos.selected === type;
      hearthButton(c, q, liquidCatalog[type].name.toUpperCase(), 'liquid:' + type, active);
    }
    var half = (r.w - 18) / 2;
    hearthButton(c, { x: r.x + 6, y: r.y + (L.mobile ? 240 : 204), w: half, h: L.mobile ? 52 : 44 }, 'STORE TANK', 'silo-store', true);
    hearthButton(c, { x: r.x + 12 + half, y: r.y + (L.mobile ? 240 : 204), w: half, h: L.mobile ? 52 : 44 }, 'TAKE BACK', 'silo-take', true);
  }
  function hearthDrawOverlays(c) {
    if (gamePaused || bathFading) { hearthOverlayHide(); return; }
    c = hearthOverlayContext(c);
    var L = hearthRoomLayout(), first = hearthButtons.length;
    hearthDrawHand(c, L); hearthDrawFuelRack(c, L); hearthDrawLiquidRack(c, L);
    if (L.mobile && (hearthHand.rack || hearthHand.silos)) hearthButtons = hearthButtons.slice(first);
  }
