  /* ---- Bathhouse: direct manipulation of the integrated boiler ---- */
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
        var b = hearthAddChunk('boiler', HEARTH_WIDTH / 2 - 98 + hearthBeds.boiler.chunks.length * 39, 150);
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
    hearthFireTick(dt);
    hearthToolTime += dt;
    hearthToolPulse = Math.max(0, hearthToolPulse - dt * 3.6);
  }
  function hearthSetView(view) {
    if (view !== 'bath' && view !== 'boiler') return;
    bathToolReset();
    hearthCancelDrag(); hearthView = 'bath'; hearthButtons = [];
    bathPtrDown = false;
    // Old callers naming the boiler still land in the single shared room.
    bathScrollT = 1e9; bathCamY = -1;
  }
  function hearthDropX() {
    var chunks = hearthBeds.boiler.chunks, mid = HEARTH_WIDTH / 2, best = mid, score = -Infinity;
    // Keep a starter cluster close enough to catch; later taps seek a low
    // nearby part of the wider bed instead of building one central tower.
    var count = chunks.filter(function (b) { return !b.held; }).length;
    if (count < 3) return mid + (count - 1) * 44;
    for (var x = 48; x < HEARTH_WIDTH - 48; x += 48) {
      var crown = HEARTH_FLOOR;
      for (var i = 0; i < chunks.length; i++) {
        var b = chunks[i];
        if (!b.held && Math.abs(b.x - x) < b.r + 30) crown = Math.min(crown, b.y - b.r);
      }
      var open = crown - Math.abs(x - mid) * 0.18;
      if (open > score) { score = open; best = x; }
    }
    return best;
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
    // One stroke sweeps the leftmost quarter. Residue remains physical until
    // the player clears it, and each stroke immediately reopens grate air.
    bed.ash.sort(function(a,b){return a.x-b.x;});
    var swept=bed.ash.splice(0,Math.ceil(bed.ash.length/4)); count+=swept.length;
    bed.ashLoad=Math.min(0.92,hearthAshMass(bed)/0.025);bed.sweep=0.4;
    bathSetNotice(count ? (bed.ash.length ? 'Ash swept into the pan. Sweep again to clear the grate.' : 'The grate is clear.') : 'The rake removes only spent ash.');
    if (count) { bed.contacts = {}; sfxPlay('debris', { gain: 0.35 }); saveNow('hearth-ash'); }
  }
  function hearthRoomAction(action) {
    if (!bathMode || bathFading || gamePaused) return;
    if (action === 'kit') {
      if (!hearthDevSupplies()) return;
      hearthCancelDrag();
      var bed = hearthBeds.boiler;
      bed.chunks = bed.chunks.filter(function (b) { return !b.ash; });
      while (bed.chunks.length < 3) hearthLoadCoal('boiler', HEARTH_WIDTH / 2 - 40 + bed.chunks.length * 40, 160);
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
    else if (action === 'coal') {
      var b = hearthLoadCoal('boiler', hearthDropX(), HEARTH_TOP + 24);
      if (b) sfxPlay('debris', { gain: 0.35 });
    } else if (action === 'pump') { hearthPump('boiler'); hearthToolPulse = 1; }
    else if (action === 'strike') hearthStrike();
    else if (action === 'ash') hearthClearAsh('boiler');
    else if (action === 'water') bathAddWater();
    else if (hearthView === 'bath') bathToolAction(action);
  }
  function hearthRoomKey(e) {
    if (!bathMode || gamePaused) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    var k = e.key.toLowerCase();
    if (k === 'escape') {
      if (hearthDrag || hearthPress) { hearthCancelDrag(); keys['Escape'] = false; return true; }
      return false;
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
    else if (k === 'c') hearthRoomAction('coal');
    else if (k === 'b') hearthRoomAction('pump');
    else if (k === 'f') hearthRoomAction('strike');
    else if (k === 'a') hearthRoomAction('ash');
    else if (k === 'e' || k === 'enter') {
      for (var i = 0; i < bathGuests.length; i++) if (bathGuests[i].st === 'wait') { bathServe(bathGuests[i].s.id); break; }
    } else if (k === 'w') bathAddWater();
    else if (k === '1') bathToolSelect('claw');
    else if (k === '2') bathToolSelect('hose');
    else if (k === ' ') bathToolAction(bathTool.mode === 'claw' ? 'tool-grip' : 'tool-valve');
    return true;
  }

  // Hit boxes use CSS pixels; bodies keep chamber coordinates above the y=210 grate.
  // Navigation is mounted on the wall and consumes no band of the viewport.
  function hearthNavHeight() { return 0; }
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
    canvas.style.cursor = bathBoilerHover ? 'grab' : '';
    return r;
  }
  function hearthPointerDown(e) {
    if (!bathMode || bathFading || gamePaused) return false;
    if (hearthDrag || hearthPress || bathTool.pointer !== null) return true;
    bathToolRememberInput(e);
    if (e.button > 0) return false;
    var p = hearthCSSPoint(e), L = hearthRoomLayout(), kind = 'boiler';
    for (var i = 0; i < hearthButtons.length; i++) {
      var button = hearthButtons[i];
      if (!hearthContains(button, p.x, p.y)) continue;
      if (button.action === 'coal') {
        var fresh = hearthLoadCoal(kind, HEARTH_WIDTH / 2, 24);
        if (fresh) {
          fresh.held = true;
          hearthDrag = { kind: kind, b: fresh, fresh: true, ox: HEARTH_WIDTH / 2, oy: 24, x: p.x, y: p.y,
            startX: p.x, startY: p.y, vx: 0, vy: 0, pointer: e.pointerId, time: performance.now() };
        }
      } else hearthPress = { action: button.action, pointer: e.pointerId, rect: button };
      hearthCapture(e); return true;
    }
    // The grate owns only its screen area. The basin remains available to
    // guests and ceiling tools while coal is tended below it.
    if (!hearthContains(L.station, p.x, p.y)) return bathToolPointerDown(e);
    var box = L.box, bed = hearthBeds[kind];
    for (var n = bed.chunks.length - 1; n >= 0; n--) {
      var b = bed.chunks[n];
      if (!hearthInside(b, (p.x - box.x) * HEARTH_WIDTH / box.w, HEARTH_TOP + (p.y - box.y) * HEARTH_HEIGHT / box.h,
        (e.pointerType === 'touch' ? 8 : 2) * HEARTH_WIDTH / box.w)) continue;
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
    if (!d || d.pointer !== e.pointerId) return false;
    if (gamePaused || bathFading) { hearthCancelDrag(); return true; }
    var q = hearthCSSPoint(e), box = hearthRoomLayout().box;
    var tap = d.fresh && Math.hypot(q.x - d.startX, q.y - d.startY) < 10;
    if (tap || hearthContains({ x: box.x - 12, y: box.y - 35, w: box.w + 24, h: box.h + 48 }, q.x, q.y)) {
      var releaseAge = Math.max(0, (performance.now() - d.time) / 1000 - 0.04);
      var releaseVelocity = Math.exp(-releaseAge * 18);
      d.b.x = tap ? hearthDropX() : Math.max(d.b.r, Math.min(HEARTH_WIDTH - d.b.r, (q.x - box.x) * HEARTH_WIDTH / box.w));
      d.b.y = tap ? HEARTH_TOP + 24 : Math.max(HEARTH_TOP+10, Math.min(210 - d.b.r, HEARTH_TOP + (q.y - box.y) * HEARTH_HEIGHT / box.h));
      d.b.vx = tap ? (Math.random() - 0.5) * 50 : d.vx * releaseVelocity * HEARTH_WIDTH / box.w * 0.45;
      d.b.vy = tap ? 0 : d.vy * releaseVelocity * HEARTH_HEIGHT / box.h * 0.45;
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
    var L = hearthRoomLayout(), w = L.landscape ? L.scene.w : L.w;
    // The native pause button occupies x=8..52. These individual wall plates
    // stay clear of it without laying an opaque strip over the bathhouse.
    hearthButton(c, { x: w - 86, y: 8, w: 74, h: 44 }, 'LEAVE', 'exit', false);
    if (hearthDevSupplies()) {
      var dw = L.landscape ? (w - 24) / 2 : Math.min(132, (w - 170) / 2);
      var dx = L.landscape ? 8 : w - 102 - dw * 2, dy = L.landscape ? 60 : 8;
      hearthButton(c, { x: dx, y: dy, w: dw, h: 44 }, 'PREPARE [T]', 'kit', true);
      hearthButton(c, { x: dx + dw + 8, y: dy, w: dw, h: 44 }, 'GUEST [G]', 'guest', true);
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
