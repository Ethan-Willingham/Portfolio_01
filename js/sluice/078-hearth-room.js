  /* ---- Bathhouse: room navigation and direct manipulation of the boiler ---- */
  var hearthView = 'bath';
  var bathBoilerHover = false;
  var hearthButtons = [], hearthDrag = null, hearthPress = null;
  var hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
  var hearthToolTime = 0, hearthToolPulse = 0, hearthQuenchSteam = 0;
  var hearthBinCoals = [];

  function hearthRoomReset() {
    hearthCancelDrag();
    hearthReset(); forgeResourcesReset();
    hearthView = 'bath'; hearthButtons = []; hearthPress = null;
    hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
    hearthToolTime = 0; hearthToolPulse = 0; hearthQuenchSteam = 0;
  }
  function hearthRoomSave() {
    return { beds: hearthSave(), stock: forgeResourcesSave(), job: Object.assign({}, hearthJob) };
  }
  function hearthRoomRestore(data, legacyFire) {
    hearthDrag = null; hearthPress = null; hearthClearBoilerHover();
    hearthReset(); forgeResourcesReset();
    hearthView = 'bath'; hearthButtons = [];
    hearthToolTime = 0; hearthToolPulse = 0; hearthQuenchSteam = 0;
    hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
    if (data) {
      hearthRestore(data.beds); forgeResourcesRestore(data.stock);
      var j = data.job;
      if (j && ['heating', 'hammer', 'quench', 'cooling', 'ready'].indexOf(j.stage) >= 0) {
        hearthJob = { stage: j.stage, heat: Math.max(0, Math.min(1, Number(j.heat) || 0)),
          hits: Math.max(0, Math.min(3, Math.floor(Number(j.hits) || 0))),
          quench: Math.max(0, Math.min(3, Number(j.quench) || 0)) };
      }
    } else if (legacyFire > 0) {
      // A paid-for old stove charge becomes fuel once, without charging again.
      var left = Math.min(240, legacyFire);
      while (left > 0) {
        var b = hearthAddChunk('boiler', 62 + hearthBeds.boiler.chunks.length * 39, 150);
        if (!b) break;
        b.fuel = Math.min(1, left / b.life); b.lit = true; b.heat = 0.85;
        b.volatile = null; hearthFuelState(b); hearthMass(b);
        left -= b.life;
      }
      hearthBeds.boiler.heat = 0.85;
      hearthMeasure(hearthBeds.boiler);
    }
  }
  function hearthRoomTick(dt) {
    // The retired forge remains in the save, including paid fuel and unfinished
    // work. Only the live boiler advances, so those old resources stay intact.
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.25);
    var bed = hearthBeds.boiler;
    bed.bank = Math.min(0.25, bed.bank + dt);
    while (bed.bank + 1e-10 >= HEARTH_STEP) {
      hearthStepBed(bed); bed.bank = Math.max(0, bed.bank - HEARTH_STEP);
    }
    hearthToolTime += dt;
    hearthToolPulse = Math.max(0, hearthToolPulse - dt * 3.6);
  }
  function hearthSetView(view) {
    if (view !== 'bath' && view !== 'boiler') return;
    hearthCancelDrag(); hearthView = view; hearthButtons = [];
    bathPtrDown = false;
    if (view === 'bath') { bathScrollT = 1e9; bathCamY = -1; }
  }
  function hearthLoadCoal(kind, x, y) {
    if (hearthBeds[kind].chunks.length >= HEARTH_CAP) { bathSetNotice('The grate is full. Rake out the spent ash.'); return null; }
    if (!forgeTake('coal', 1)) { bathSetNotice('Mine coal. The fuel locker keeps it when you return to town.'); return null; }
    var supplied = hearthDevSupplies();
    var b = hearthAddChunk(kind, x, y);
    if (!b) { if (!supplied) forgeGive('coal', 1); return null; }
    b.devSupplied = supplied;
    saveNow('hearth-coal');
    return b;
  }
  function hearthStrike() {
    var bed = hearthBeds.boiler;
    if (!bed.chunks.some(function (b) { return !b.ash && b.fuel > 0; })) {
      bathSetNotice('Put coal on the boiler grate first.'); return false;
    }
    if (!hearthHasTool('flint')) { bathSetNotice('Break stone to find flint. One piece lasts.'); return false; }
    if (!hearthHasTool('steel')) { bathSetNotice('The reusable steel striker hangs beside the boiler.'); return false; }
    if (!hearthIgnite('boiler')) { bathSetNotice('The coals are already lit. Work the bellows to feed the fire.'); return false; }
    hearthToolPulse = 1;
    sfxPlay('drill-bounce', { gain: 0.4 });
    bathSetNotice('A spark catches. Nearby coal will catch from the heat.');
    saveNow('hearth-spark');
    return true;
  }
  function hearthClearAsh(kind) {
    var bed = hearthBeds[kind], count = 0;
    for (var i = bed.chunks.length - 1; i >= 0; i--) {
      if (bed.chunks[i].ash && !bed.chunks[i].held) { hearthRemoveChunk(kind, bed.chunks[i].id); count++; }
    }
    bathSetNotice(count ? 'Spent ash falls into the pan.' : 'The rake removes only spent ash.');
    if (count) { bed.contacts = {}; sfxPlay('debris', { gain: 0.35 }); saveNow('hearth-ash'); }
  }
  function hearthRoomAction(action) {
    if (!bathMode || bathFading || gamePaused) return;
    if (action === 'kit') {
      if (!hearthDevSupplies()) return;
      hearthCancelDrag();
      var bed = hearthBeds.boiler;
      bed.chunks = bed.chunks.filter(function (b) { return !b.ash; });
      while (bed.chunks.length < 3) hearthLoadCoal('boiler', 110 + bed.chunks.length * 40, 160);
      for (var i = 0; i < bed.chunks.length; i++) hearthLightChunk(bed, bed.chunks[i]);
      bed.heat = 0.85; hearthMeasure(bed);
      bathHeat = 0.75; bathArmHeat(); bathAddWater();
      hearthSetView('bath');
      bathSetNotice('Test bath warming and filling. Add a guest, then tap its order to serve.');
    } else if (action === 'guest') {
      if (!hearthDevSupplies()) return;
      if (bathGuests.length >= bathGuestCap) { bathSetNotice('Both guest places are occupied. Serve a visitor first.'); return; }
      var guest = bathSpawnGuest();
      if (!guest) { bathSetNotice('The visitor limit is full. Let a visitor leave first.'); return; }
      if (bathGuestAccept(guest)) skySlimes.splice(skySlimes.indexOf(guest), 1);
      hearthSetView('bath');
      bathSetNotice('A test guest has arrived. Fill and warm the tub, then tap the order.');
    } else if (action === 'exit') { hearthCancelDrag(); bathExit(); }
    else if (action === 'bath' || action === 'boiler') hearthSetView(action);
    else if (action === 'coal' && hearthView === 'boiler') {
      var b = hearthLoadCoal(hearthView, 110 + Math.random() * 100, 12);
      if (b) sfxPlay('debris', { gain: 0.35 });
    } else if (action === 'pump' && hearthView === 'boiler') { hearthPump(hearthView); hearthToolPulse = 1; }
    else if (action === 'strike' && hearthView === 'boiler') hearthStrike();
    else if (action === 'ash' && hearthView === 'boiler') hearthClearAsh(hearthView);
    else if (action === 'water') bathAddWater();
  }
  function hearthRoomKey(e) {
    if (!bathMode || gamePaused) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    var k = e.key.toLowerCase();
    if (k === 'escape') {
      if (e.repeat) return true;
      if (hearthView !== 'boiler') return false;
      keys['Escape'] = false;
      if (!bathFading) hearthSetView('bath');
      return true;
    }
    if (k === '`' || k === '~') {
      if (!e.repeat && !bathFading) {
        hearthCancelDrag(); setDevMode(!devMode);
        bathSetNotice(devMode ? 'Dev mode: unlimited coal, water and flint.' : 'Dev mode off. Using your stored supplies.');
      }
      return true;
    }
    if (e.repeat || bathFading) return true;
    if (k === 't') hearthRoomAction('kit');
    else if (k === 'g') hearthRoomAction('guest');
    else if (hearthView !== 'bath') {
      if (k === 'c') hearthRoomAction('coal');
      else if (k === 'b') hearthRoomAction('pump');
      else if (k === 'f' && hearthView === 'boiler') hearthRoomAction('strike');
      else if (k === 'a') hearthRoomAction('ash');
    } else if (k === 'e' || k === 'enter') {
      for (var i = 0; i < bathGuests.length; i++) if (bathGuests[i].st === 'wait') { bathServe(bathGuests[i].s.id); break; }
    } else if (k === 'w') bathAddWater();
    return true;
  }

  // All hit boxes use CSS pixels. Firebox bodies stay in their own 320 x 210 space.
  function hearthNavHeight() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    return hearthDevSupplies() && w < 740 && !(w >= 480 && h < 500) ? 114 : 62;
  }
  function hearthRoomLayout() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var top = hearthNavHeight(), footer = h < 500 ? 58 : 82;
    var available = h - top - footer, split = w >= 620;
    var row, box, bench, controls = w >= 620 ? 76 : 130;
    if (w >= 520 && h < 500) {
      var leftW = w * 0.39 - 44, bh = Math.min(available - 46, leftW * 210 / 320), bw = bh * 320 / 210;
      var rx = w * 0.65, rw = w - rx - 18, cw = (rw - 10) / 2;
      return { w: w, h: h, top: top, footer: h - footer,
        box: { x: 24 + (leftW - bw) / 2, y: top + 28, w: bw, h: bh },
        bench: { x: w * 0.39 + 8, y: top + 24, w: w * 0.26 - 28, h: available - 38 },
        bin: { x: rx, y: top + 24, w: cw, h: 72 },
        pump: { x: rx + cw + 10, y: top + 24, w: cw, h: 72 },
        action: { x: rx, y: top + 108, w: cw, h: 44 },
        ash: { x: rx + cw + 10, y: top + 108, w: cw, h: 44 } };
    }
    if (split) {
      var sceneH = Math.max(72, available - controls - 38);
      var leftW = w * 0.72 - 52;
      var bh = Math.min(sceneH - 30, leftW * 210 / 320), bw = bh * 320 / 210;
      box = { x: 24 + (leftW - bw) / 2, y: top + 28, w: bw, h: bh };
      bench = { x: w * 0.72 + 18, y: top + 25, w: w * 0.28 - 42, h: sceneH - 20 };
      row = top + sceneH + 22;
    } else {
      var artH = available - controls - 52;
      var bh = Math.min((w - 64) * 210 / 320, artH * 0.55), bw = bh * 320 / 210;
      box = { x: (w - bw) / 2, y: top + 27, w: bw, h: bh };
      bench = { x: 28, y: box.y + bh + 27, w: w - 56, h: artH - bh - 30 };
      row = top + artH + 38;
    }
    var gap = 10, left = 18, inner = w - 36, half = (inner - gap) / 2;
    var bin, pump, action, ash;
    if (w >= 620) {
      var quarter = (inner - gap * 3) / 4;
      bin = { x: left, y: row, w: quarter, h: 72 };
      pump = { x: left + quarter + gap, y: row, w: quarter, h: 72 };
      action = { x: left + (quarter + gap) * 2, y: row, w: quarter, h: 72 };
      ash = { x: left + (quarter + gap) * 3, y: row, w: quarter, h: 72 };
    } else {
      bin = { x: left, y: row, w: half, h: 68 };
      pump = { x: left + half + gap, y: row, w: half, h: 68 };
      action = { x: left, y: row + 78, w: half, h: 44 };
      ash = { x: left + half + gap, y: row + 78, w: half, h: 44 };
    }
    return { w: w, h: h, top: top, footer: h - footer, box: box, bench: bench,
      bin: bin, pump: pump, action: action, ash: ash };
  }
  function hearthCSSPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / dpr / r.width,
      y: (e.clientY - r.top) * canvas.height / dpr / r.height };
  }
  function hearthContains(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function hearthCapture(e) { try { canvas.setPointerCapture(e.pointerId); } catch (ignore) {} }
  function hearthClearBoilerHover() {
    bathBoilerHover = false;
    if (canvas && canvas.style) canvas.style.cursor = '';
  }
  function hearthBoilerHoverAt(p) {
    var r = bathMode && hearthView === 'bath' && !bathFading && !gamePaused &&
      typeof bathBoilerScreenRect === 'function' ? bathBoilerScreenRect() : null;
    bathBoilerHover = !!(r && hearthContains(r, p.x, p.y));
    canvas.style.cursor = bathBoilerHover ? 'pointer' : '';
    return r;
  }
  function hearthPointerDown(e) {
    if (!bathMode || bathFading || gamePaused) return false;
    if (hearthDrag || hearthPress) return true;
    if (e.button > 0) return hearthView !== 'bath';
    var p = hearthCSSPoint(e), L = hearthRoomLayout(), kind = hearthView;
    for (var i = 0; i < hearthButtons.length; i++) {
      var button = hearthButtons[i];
      if (!hearthContains(button, p.x, p.y)) continue;
      if (button.action === 'coal') {
        var fresh = hearthLoadCoal(kind, 160, 24);
        if (fresh) {
          fresh.held = true;
          hearthDrag = { kind: kind, b: fresh, fresh: true, ox: 160, oy: 24, x: p.x, y: p.y,
            startX: p.x, startY: p.y, vx: 0, vy: 0, pointer: e.pointerId, time: performance.now() };
        }
      } else hearthPress = { action: button.action, pointer: e.pointerId, rect: button };
      hearthCapture(e); return true;
    }
    if (kind === 'bath') {
      var boiler = hearthBoilerHoverAt(p);
      if (!bathBoilerHover) return false;
      hearthPress = { action: 'boiler', pointer: e.pointerId, rect: boiler,
        startX: p.x, startY: p.y, moved: 0, clickSlop: 10 };
      bathPtrDown = false;
      hearthCapture(e);
      return true;
    }
    var box = L.box, bed = hearthBeds[kind];
    for (var n = bed.chunks.length - 1; n >= 0; n--) {
      var b = bed.chunks[n], sx = box.x + b.x * box.w / 320, sy = box.y + b.y * box.h / 210;
      if (!hearthInside(b, (p.x - box.x) * 320 / box.w, (p.y - box.y) * 210 / box.h,
        (e.pointerType === 'touch' ? 8 : 2) * 320 / box.w)) continue;
      b.held = true;
      hearthDrag = { kind: kind, b: b, fresh: false, ox: b.x, oy: b.y, x: p.x, y: p.y,
        startX: p.x, startY: p.y, vx: 0, vy: 0, pointer: e.pointerId, time: performance.now() };
      hearthCapture(e); return true;
    }
    return true;
  }
  function hearthPointerMove(e) {
    var p = hearthCSSPoint(e);
    if (hearthPress && hearthPress.pointer === e.pointerId) {
      if (hearthPress.clickSlop) {
        hearthPress.moved = Math.max(hearthPress.moved,
          Math.hypot(p.x - hearthPress.startX, p.y - hearthPress.startY));
        hearthBoilerHoverAt(p);
        if (hearthPress.moved > hearthPress.clickSlop) hearthClearBoilerHover();
      }
      return true;
    }
    var d = hearthDrag;
    if (!d || d.pointer !== e.pointerId) {
      if (e.pointerType !== 'touch' && !bathPtrDown) hearthBoilerHoverAt(p);
      else hearthClearBoilerHover();
      return !!hearthPress;
    }
    var now = performance.now(), dt = Math.max(0.016, (now - d.time) / 1000);
    d.vx = Math.max(-450, Math.min(450, (p.x - d.x) / dt));
    d.vy = Math.max(-450, Math.min(450, (p.y - d.y) / dt));
    d.x = p.x; d.y = p.y; d.time = now;
    return true;
  }
  function hearthCancelDrag() {
    var d = hearthDrag;
    if (d) {
      if (d.fresh) { hearthRemoveChunk(d.kind, d.b.id); if (!d.b.devSupplied) forgeGive('coal', 1); }
      else { d.b.x = d.ox; d.b.y = d.oy; d.b.vx = 0; d.b.vy = 0; d.b.held = false; }
      hearthDrag = null;
    }
    hearthPress = null;
    hearthClearBoilerHover();
  }
  function hearthPointerUp(e) {
    if (!bathMode) return false;
    if (hearthPress && hearthPress.pointer === e.pointerId) {
      var pr = hearthPress, p = hearthCSSPoint(e); hearthPress = null;
      var moved = pr.clickSlop ? Math.max(pr.moved, Math.hypot(p.x - pr.startX, p.y - pr.startY)) : 0;
      hearthClearBoilerHover();
      if ((!pr.clickSlop || moved <= pr.clickSlop) && hearthContains(pr.rect, p.x, p.y)) hearthRoomAction(pr.action);
      return true;
    }
    var d = hearthDrag;
    if (!d || d.pointer !== e.pointerId) return hearthView !== 'bath';
    if (gamePaused || bathFading) { hearthCancelDrag(); return true; }
    var q = hearthCSSPoint(e), box = hearthRoomLayout().box;
    var tap = d.fresh && Math.hypot(q.x - d.startX, q.y - d.startY) < 10;
    if (tap || hearthContains({ x: box.x - 12, y: box.y - 35, w: box.w + 24, h: box.h + 48 }, q.x, q.y)) {
      var releaseAge = Math.max(0, (performance.now() - d.time) / 1000 - 0.04);
      var releaseVelocity = Math.exp(-releaseAge * 18);
      d.b.x = tap ? 90 + Math.random() * 140 : Math.max(d.b.r, Math.min(320 - d.b.r, (q.x - box.x) * 320 / box.w));
      d.b.y = tap ? 12 : Math.max(-30, Math.min(210 - d.b.r, (q.y - box.y) * 210 / box.h));
      d.b.vx = tap ? (Math.random() - 0.5) * 50 : d.vx * releaseVelocity * 320 / box.w * 0.45;
      d.b.vy = tap ? 0 : d.vy * releaseVelocity * 210 / box.h * 0.45;
      d.b.spin = d.b.vx * 0.025; d.b.held = false; hearthDrag = null;
      sfxPlay('debris', { gain: 0.35 });
    } else if (d.fresh || (d.b.fuel >= 0.999 && d.b.heat < 0.05 && !d.b.ash)) {
      hearthRemoveChunk(d.kind, d.b.id); if (!d.b.devSupplied) forgeGive('coal', 1); hearthDrag = null;
    } else hearthCancelDrag();
    saveNow('hearth-place');
    return true;
  }

  function hearthText(c, text, x, y, size, color, align) {
    c.font = (size >= 14 ? 'bold ' : '') + size + 'px ' + UI_FONT;
    c.fillStyle = color || BLD.cream; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.fillText(text, Math.round(x), Math.round(y));
  }
  function hearthPlate(c, r, bright) {
    c.fillStyle = BLD.outline; c.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    c.fillStyle = bright ? UIMAT_PLATE_BASE : UIMAT_PLATE_SHADOW; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = UIMAT_PLATE_HIGHLIGHT; c.fillRect(r.x, r.y, r.w, 2); c.fillRect(r.x, r.y, 2, r.h);
    c.fillStyle = BLD.metalDark; c.fillRect(r.x + r.w - 2, r.y + 2, 2, r.h - 2);
    for (var i = 0; i < 2; i++) {
      c.fillStyle = BLD.metalLight; c.fillRect(r.x + 6 + i * (r.w - 14), r.y + 6, 3, 2);
      c.fillStyle = BLD.metalDark; c.fillRect(r.x + 7 + i * (r.w - 14), r.y + 8, 3, 1);
    }
  }
  function hearthButton(c, r, label, action, ready) {
    hearthPlate(c, r, ready);
    if (ready) { c.fillStyle = BLD.goldDark; c.fillRect(r.x + 12, r.y + r.h - 3, r.w - 24, 2); }
    var lines = [label];
    c.font = '11px ' + UI_FONT;
    if (c.measureText(label).width > r.w - 12) {
      var split = label.lastIndexOf(' ', Math.ceil(label.length * 0.62));
      if (split > 0) lines = [label.slice(0, split), label.slice(split + 1)];
    }
    for (var l = 0; l < lines.length; l++) hearthText(c, lines[l], r.x + r.w / 2, r.y + r.h / 2 + (l - (lines.length - 1) / 2) * 14, 11, ready ? BLD.cream : UIT_DIM, 'center');
    hearthButtons.push({ x: r.x, y: r.y, w: r.w, h: r.h, action: action });
  }
  function hearthDrawNav(c, view) {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var dev = hearthDevSupplies(), boiler = view === 'boiler';
    var shortDev = dev && w >= 480 && h < 500;
    hearthButtons = [];
    c.fillStyle = UIT_PANEL; c.fillRect(0, 0, w, hearthNavHeight());
    c.fillStyle = UIMAT_PLATE_HIGHLIGHT; c.fillRect(0, hearthNavHeight() - 2, w, 2);
    // Leave the first 56px clear for the shared native pause button.
    if (boiler) {
      hearthButton(c, { x: 64, y: 9, w: 112, h: 44 }, 'BACK TO BATH', 'bath', false);
      if (!shortDev && w >= 430) hearthText(c, 'BOILER', 194, 31, 13);
    } else if (!shortDev) {
      hearthText(c, dev ? 'BANYA / DEV' : 'BANYA', 64, 31, 14);
    }
    hearthButton(c, { x: w - 96, y: 9, w: 82, h: 44 }, 'LEAVE', 'exit', false);
    if (dev) {
      var inline = w >= 740 || shortDev;
      var dw = shortDev ? Math.min(128, (w - 310) / 2) : w >= 740 ? 156 : (w - 38) / 2;
      var dx = inline ? w - (dw * 2 + 122) : 14, dy = inline ? 9 : 62;
      hearthButton(c, { x: dx, y: dy, w: dw, h: 44 }, shortDev ? 'PREPARE [T]' : 'PREPARE BATH [T]', 'kit', true);
      hearthButton(c, { x: dx + dw + 10, y: dy, w: dw, h: 44 }, shortDev ? 'GUEST [G]' : 'ADD GUEST [G]', 'guest', true);
    }
  }
  function hearthWrap(c, text, x, y, width, color, maxLines) {
    c.font = '12px ' + UI_FONT;
    var words = text.split(' '), line = '', row = 0;
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (line && c.measureText(next).width > width) {
        hearthText(c, line, x, y + row * 18, 12, color); row++; line = words[i];
        if (row >= maxLines) return;
      } else line = next;
    }
    hearthText(c, line, x, y + row * 18, 12, color);
  }
  function hearthDrawTools(c, r) {
    // Instruments mount directly on the wall beside the integrated firebox.
    // Portrait phones place the dial and hooks side by side beneath the grate.
    var horizontal = r.w >= 230 && r.w > r.h * 1.15, gap = 12;
    var pw = Math.min(320, r.w), ph = Math.min(horizontal ? 150 : 340, r.h);
    var px = r.x + (r.w - pw) / 2, py = r.y + (r.h - ph) / 2;
    var gauge = horizontal ? { x: px, y: py, w: pw * 0.4, h: ph } :
      { x: px, y: py, w: pw, h: (ph - gap) * 0.58 };
    var hooks = horizontal ? { x: px + gauge.w + gap, y: py, w: pw - gauge.w - gap, h: ph } :
      { x: px, y: py + gauge.h + gap, w: pw, h: ph - gauge.h - gap };
    hearthPlate(c, gauge, false);
    var radius = Math.max(12, Math.min(72, (gauge.w - 24) / 2, (gauge.h - 37) / 2));
    var cx = gauge.x + gauge.w / 2, cy = gauge.y + (gauge.h - 25) / 2;
    c.fillStyle = BLD.outline; c.beginPath(); c.arc(cx, cy, radius + 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.goldDark; c.beginPath(); c.arc(cx, cy, radius + 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.goldPale; c.beginPath(); c.arc(cx, cy, radius - 2, Math.PI * 1.1, Math.PI * 1.75); c.lineWidth = 1; c.strokeStyle = BLD.goldPale; c.stroke();
    c.fillStyle = UIT_INSET_DK; c.beginPath(); c.arc(cx, cy, radius - 4, 0, Math.PI * 2); c.fill();
    for (var mark = 0; mark < 9; mark++) {
      var angle = Math.PI * (0.8 + mark / 8 * 1.4);
      c.strokeStyle = mark > 6 ? BLD.goldPale : BLD.metalPale; c.lineWidth = mark % 2 ? 1 : 2;
      c.beginPath(); c.moveTo(cx + Math.cos(angle) * radius * 0.65, cy + Math.sin(angle) * radius * 0.65);
      c.lineTo(cx + Math.cos(angle) * radius * 0.8, cy + Math.sin(angle) * radius * 0.8); c.stroke();
    }
    var needle = Math.PI * (0.8 + bathHeat * 1.4);
    c.strokeStyle = BLD.redBright; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(needle) * radius * 0.62, cy + Math.sin(needle) * radius * 0.62); c.stroke();
    c.fillStyle = BLD.goldPale; c.fillRect(cx - 2, cy - 2, 4, 4);
    hearthText(c, 'BATH ' + Math.round(20 + bathHeat * 28) + ' C', cx, gauge.y + gauge.h - 13, 11, BLD.cream, 'center');
    hearthPlate(c, hooks, false);
    var toolScale = Math.max(0.3, Math.min(1.3, (hooks.w - 26) / 108, (hooks.h - 28) / 64));
    var toolY = hooks.y + (hooks.h - 18) / 2;
    var flintX = hooks.x + hooks.w * 0.28, steelX = hooks.x + hooks.w * 0.72;
    for (var hook = 0; hook < 2; hook++) {
      var hx = hook ? steelX : flintX;
      c.fillStyle = BLD.outline; c.fillRect(hx - 4, toolY - 26 * toolScale, 8, 13 * toolScale);
      c.fillStyle = BLD.metalPale; c.fillRect(hx - 2, toolY - 26 * toolScale, 3, 10 * toolScale);
    }
    c.save(); c.translate(flintX, toolY); c.scale(toolScale, toolScale);
    c.fillStyle = hearthHasTool('flint') ? BLD.stonePale : BLD.stoneDark;
    c.strokeStyle = BLD.outline; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-19, 13); c.lineTo(-15, -8); c.lineTo(0, -21);
    c.lineTo(18, -1); c.lineTo(3, 20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = hearthHasTool('flint') ? BLD.stoneLight : BLD.stoneBase;
    c.beginPath(); c.moveTo(-15, -8); c.lineTo(0, -21); c.lineTo(3, 20); c.closePath(); c.fill();
    c.restore();
    c.save(); c.translate(steelX, toolY); c.scale(toolScale, toolScale);
    c.strokeStyle = BLD.outline; c.lineWidth = 10;
    c.beginPath(); c.moveTo(15, -15); c.lineTo(-10, -15); c.lineTo(-15, 14); c.lineTo(15, 14); c.stroke();
    c.strokeStyle = BLD.metalPale; c.lineWidth = 6; c.stroke(); c.restore();
    hearthText(c, 'FLINT', flintX, hooks.y + hooks.h - 12, 11, hearthHasTool('flint') ? BLD.cream : UIT_DIM, 'center');
    hearthText(c, 'STEEL', steelX, hooks.y + hooks.h - 12, 11, BLD.cream, 'center');
  }
  function hearthDrawRoom(c) {
    var L = hearthRoomLayout(), box = L.box, bed = hearthBeds.boiler;
    var t = hearthToolTime;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = BLD.woodDeep; c.fillRect(0, 0, L.w, L.h);
    // Broad quiet boards, heavy beams, and a flue give the fire a room to light.
    c.fillStyle = BLD.outline;
    for (var by = L.top + 12; by < L.h; by += 38) c.fillRect(0, by, L.w, 3);
    c.fillStyle = BLD.outline; c.fillRect(0, L.top, 18, L.h - L.top); c.fillRect(L.w - 18, L.top, 18, L.h - L.top);
    c.fillStyle = BLD.woodDark; c.fillRect(18, L.top, 4, L.h - L.top); c.fillRect(L.w - 22, L.top, 4, L.h - L.top);
    var floorY = Math.min(L.h - 75, L.bin.y + L.bin.h + 38);
    c.fillStyle = BLD.stoneDark; c.fillRect(0, floorY, L.w, L.h - floorY);
    c.fillStyle = BLD.outline; c.fillRect(0, floorY, L.w, 5);
    for (var slab = 0; slab < L.w; slab += 154) { c.fillStyle = BLD.stoneBase; c.fillRect(slab, floorY + 5, 151, 2); }
    c.fillStyle = UIMAT_PLATE_SHADOW; c.fillRect(box.x + box.w * 0.46, L.top, box.w * 0.18, 40);
    c.fillStyle = BLD.metalLight; c.fillRect(box.x + box.w * 0.46 + 4, L.top, 3, 38);
    hearthPlate(c, { x: box.x - 15, y: box.y - 14, w: box.w + 30, h: box.h + 33 }, true);
    c.fillStyle = BLD.metalDark; c.fillRect(box.x - 13, box.y + box.h + 18, box.w + 26, 10);
    hearthDrawFirebox(c, bed, box.x, box.y, box.w, box.h, t);
    // The actual grate is beneath the bodies, never a lattice over their faces.
    c.fillStyle = BLD.metalDark; c.fillRect(box.x - 1, box.y + box.h, box.w + 2, 7);
    for (var gx = box.x + 8; gx < box.x + box.w; gx += 18) {
      c.fillStyle = BLD.metalLight; c.fillRect(gx, box.y + box.h, 8, 2);
      c.fillStyle = BLD.outline; c.fillRect(gx + 8, box.y + box.h + 2, 6, 5);
    }
    hearthText(c, 'COAL-FIRED BOILER', box.x, L.top + 10, 11, BLD.cream);
    // The coal bunker is the source of every movable chunk.
    hearthPlate(c, L.bin, true);
    var columns = Math.max(2, Math.min(4, Math.floor((L.bin.w - 24) / 24)));
    var visible = Math.min(columns * 2, 7, forgeCount('coal'));
    for (var i = 0; i < visible; i++) {
      if (!hearthBinCoals[i]) hearthBinCoals[i] = { r: 13 + i % 3, seed: (i + 1) * 0.137, angle: i * 1.7, heat: 0, fuel: 1 };
      hearthDrawCoal(c, hearthBinCoals[i],
        L.bin.x + 22 + (i % columns) * 24, L.bin.y + 30 - Math.floor(i / columns) * 12, 0.85, t);
    }
    var coalLabel = hearthDevSupplies() ? (L.bin.w < 135 ? 'FREE COAL' : 'COAL: UNLIMITED') : 'COAL ' + forgeCount('coal');
    hearthText(c, coalLabel, L.bin.x + L.bin.w / 2, L.bin.y + 59, 11, BLD.cream, 'center');
    hearthButtons.push(Object.assign({ action: 'coal' }, L.bin));
    hearthPlate(c, L.pump, true);
    var pcx = L.pump.x + L.pump.w / 2, py = L.pump.y + 20, squeeze = bed.air * 9;
    c.fillStyle = BLD.woodMid; c.fillRect(pcx - 38, py - 5 + squeeze, 76, 5);
    c.fillStyle = BLD.woodDark; c.fillRect(pcx - 34, py + 19, 68, 5);
    c.fillStyle = BLD.woodBase;
    c.beginPath(); c.moveTo(pcx - 32, py + squeeze); c.lineTo(pcx + 30, py + squeeze);
    c.lineTo(pcx + 35, py + 9); c.lineTo(pcx + 30, py + 19); c.lineTo(pcx - 34, py + 19); c.closePath(); c.fill();
    c.strokeStyle = BLD.woodDeep; c.lineWidth = 2; c.beginPath(); c.moveTo(pcx - 29, py + 8 + squeeze * 0.4); c.lineTo(pcx + 29, py + 8 + squeeze * 0.4); c.stroke();
    hearthText(c, 'BELLOWS [B]', pcx, L.pump.y + 59, 11, BLD.cream, 'center');
    hearthButtons.push(Object.assign({ action: 'pump' }, L.pump));
    hearthDrawTools(c, L.bench);
    hearthButton(c, L.action, 'STRIKE FLINT [F]', 'strike', hearthHasTool('flint') && hearthHasTool('steel'));
    hearthButton(c, L.ash, 'RAKE ASH [A]', 'ash', bed.chunks.some(function (b) { return b.ash; }));
    var stats = (hearthHasTool('flint') ? 'FLINT READY' : 'MINE STONE FOR FLINT') +
      '   /   BATH ' + Math.round(20 + bathHeat * 28) + ' C';
    if (hearthDevSupplies()) stats = 'DEV: unlimited coal, water and flint';
    var bottomY = L.footer + 17;
    c.fillStyle = UIT_PANEL; c.fillRect(0, bottomY - 16, L.w, L.h - bottomY + 16);
    hearthText(c, stats, 18, bottomY, 11, BLD.cream);
    var hint = bathNoticeT > 0 ? bathNotice : !bed.chunks.length ?
      'Drag coal onto the grate, or tap the bunker. The fire heats the bath above.' : !hearthHasTool('flint') ?
      'Break stone to find flint. The reusable steel striker is already here.' :
      hearthBurnSummary(bed) + '. Spread coal for air; bellows feed the fire.';
    hearthWrap(c, hint, 18, bottomY + 22, L.w - 36, bathNoticeT > 0 ? BLD.goldPale : UIT_DIM, L.h < 500 ? 1 : 2);
    if (hearthDrag) {
      var d = hearthDrag;
      hearthDrawCoal(c, d.b, d.x, d.y, box.w / 320, t);
      c.strokeStyle = BLD.goldPale; c.lineWidth = 1; c.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
    }
    hearthDrawNav(c, 'boiler');
    // Nav resets hit regions; append the station controls after it.
    hearthButtons.push(Object.assign({ action: 'coal' }, L.bin), Object.assign({ action: 'pump' }, L.pump),
      Object.assign({ action: 'strike' }, L.action), Object.assign({ action: 'ash' }, L.ash));
  }

  function hearthRoomRender() {
    if (!bathMode || hearthView === 'bath') return false;
    // An opaque foreground covers the water/steam canvases while the boiler
    // owns the view. Their real simulation and the bath temperature keep running.
    var foreground = uiTopEnsure();
    if (foreground && uiTopCanvas) {
      foreground.setTransform(1, 0, 0, 1, 0, 0);
      foreground.clearRect(0, 0, uiTopCanvas.width, uiTopCanvas.height);
      hearthDrawRoom(foreground);
    } else hearthDrawRoom(ctx);
    return true;
  }
