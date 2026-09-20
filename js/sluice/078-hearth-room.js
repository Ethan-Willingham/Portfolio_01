  /* ---- Fire room: coal in the hand, a working boiler, and a small forge ---- */
  var hearthView = 'boiler';
  var hearthButtons = [], hearthDrag = null, hearthPress = null;
  var hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
  var hearthToolTime = 0, hearthToolPulse = 0, hearthQuenchSteam = 0;
  var hearthBinCoals = [];

  function hearthRoomReset() {
    hearthCancelDrag();
    hearthReset(); forgeResourcesReset();
    hearthView = 'boiler'; hearthButtons = []; hearthPress = null;
    hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
    hearthToolTime = 0; hearthToolPulse = 0; hearthQuenchSteam = 0;
  }
  function hearthRoomSave() {
    return { beds: hearthSave(), stock: forgeResourcesSave(), job: Object.assign({}, hearthJob) };
  }
  function hearthRoomRestore(data, legacyFire) {
    hearthDrag = null; hearthPress = null;
    hearthReset(); forgeResourcesReset();
    hearthView = 'boiler'; hearthButtons = [];
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
        left -= b.life;
      }
      hearthBeds.boiler.heat = 0.85;
      hearthMeasure(hearthBeds.boiler);
    }
  }
  function hearthRoomTick(dt) {
    hearthTick(dt);
    hearthToolTime += dt;
    hearthToolPulse = Math.max(0, hearthToolPulse - dt * 3.6);
    hearthQuenchSteam = Math.max(0, hearthQuenchSteam - dt / 3);
    var j = hearthJob, bed = hearthBeds.forge;
    if (j.stage === 'heating' || j.stage === 'hammer') {
      var hot = bed.heat;
      j.heat += (hot - j.heat) * (1 - Math.exp(-dt * (hot > j.heat ? 0.18 : 0.045)));
      if (j.stage === 'heating' && j.heat >= 0.65) {
        j.stage = 'hammer'; saveNow('forge-hot');
      } else if (j.stage === 'hammer' && j.heat < 0.40) j.stage = 'heating';
    }
    if (j.stage === 'cooling') {
      j.quench += dt; j.heat = Math.max(0, j.heat - dt * 0.4);
      if (j.quench >= 3) { j.stage = 'ready'; saveNow('forge-quenched'); }
    }
  }
  function hearthSetView(view) {
    if (['bath', 'boiler', 'forge'].indexOf(view) < 0) return;
    hearthCancelDrag(); hearthView = view; hearthButtons = [];
    bathPtrDown = false;
  }
  function hearthLoadCoal(kind, x, y) {
    if (hearthBeds[kind].chunks.length >= 18) { bathSetNotice('The grate is full. Rake out the spent ash.'); return null; }
    if (!forgeTake('coal', 1)) { bathSetNotice('Mine coal. The fuel locker keeps it when you return to town.'); return null; }
    var b = hearthAddChunk(kind, x, y);
    if (!b) { forgeGive('coal', 1); return null; }
    saveNow('hearth-coal');
    return b;
  }
  function hearthStrike() {
    var bed = hearthBeds.boiler;
    if (!bed.chunks.some(function (b) { return !b.ash && b.fuel > 0; })) {
      bathSetNotice('Put coal on the boiler grate first.'); return false;
    }
    if (!forgeCount('flint')) { bathSetNotice('Break stone to find flint. One piece lasts.'); return false; }
    if (!forgeCount('steel')) { bathSetNotice('Make a steel striker at the forge: two iron and a coal fire.'); return false; }
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
    if (count) { sfxPlay('debris', { gain: 0.35 }); saveNow('hearth-ash'); }
  }
  function hearthForgeAction() {
    var j = hearthJob;
    if (j.stage === 'empty') {
      if (forgeCount('steel') > 0) { bathSetNotice('Your steel striker is finished. It can light every boiler fire.'); return false; }
      if (!forgeTake('iron', 2)) { bathSetNotice('Bring two iron to make a reusable steel striker.'); return false; }
      j.stage = 'heating'; j.heat = 0; j.hits = 0;
      bathSetNotice('Iron is in the forge. Add coal and work the bellows until it glows.');
      sfxPlay('footstep-metal', { gain: 0.5 });
    } else if (j.stage === 'heating') {
      bathSetNotice('The iron needs more heat. Add coal and pump the bellows.'); return false;
    } else if (j.stage === 'hammer') {
      if (hearthToolPulse > 0.5) return false;
      j.hits++; hearthToolPulse = 1;
      sfxPlay('drill-break-metal', { gain: 0.65 });
      if (j.hits >= 3) { j.stage = 'quench'; bathSetNotice('The striker is shaped. Quench it with 2 L from your water tank.'); }
    } else if (j.stage === 'quench') {
      if (bathWaterCount() < 200) { bathSetNotice('Quenching needs 2 L. Scoop water into the rig tank.'); return false; }
      var stored = Math.min(200, bathSupplies[0]);
      bathSupplies[0] -= stored; siphon.tank[0] -= 200 - stored;
      j.stage = 'cooling'; j.quench = 0; hearthQuenchSteam = 1;
      sfxPlay('liquid-enter', { gain: 0.4 });
    } else if (j.stage === 'ready') {
      forgeGive('steel', 1);
      hearthJob = { stage: 'empty', heat: 0, hits: 0, quench: 0 };
      bathSetNotice('Steel striker made. Use it with flint to light the boiler. Both tools are reusable.');
      sfxPlay('ui-confirm');
    } else return false;
    saveNow('forge-work');
    return true;
  }
  function hearthRoomAction(action) {
    if (!bathMode || bathFading || gamePaused) return;
    if (action === 'kit') {
      if (typeof devMode === 'undefined' || !devMode) return;
      forgeStock.coal = Math.max(24, forgeStock.coal); forgeStock.iron = Math.max(4, forgeStock.iron);
      forgeStock.flint = Math.max(1, forgeStock.flint); siphon.tank[0] = Math.max(15200, siphon.tank[0]);
      bathSetNotice('Test supplies added. The forge can now make your steel striker.');
      saveNow('hearth-dev-kit');
    } else if (action === 'exit') { hearthCancelDrag(); bathExit(); }
    else if (action === 'bath' || action === 'boiler' || action === 'forge') hearthSetView(action);
    else if (action === 'coal') {
      var b = hearthLoadCoal(hearthView, 110 + Math.random() * 100, 12);
      if (b) sfxPlay('debris', { gain: 0.35 });
    } else if (action === 'pump') { hearthPump(hearthView); hearthToolPulse = 1; }
    else if (action === 'strike') hearthStrike();
    else if (action === 'ash') hearthClearAsh(hearthView);
    else if (action === 'work') hearthForgeAction();
    else if (action === 'water') bathAddWater();
  }
  function hearthRoomKey(e) {
    if (!bathMode || gamePaused) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    var k = e.key.toLowerCase();
    if (k === 'escape') return false;
    if (e.repeat || bathFading) return true;
    if (k === '1') hearthSetView('bath');
    else if (k === '2') hearthSetView('boiler');
    else if (k === '3') hearthSetView('forge');
    else if (k === 't') hearthRoomAction('kit');
    else if (hearthView !== 'bath') {
      if (k === 'c') hearthRoomAction('coal');
      else if (k === 'b') hearthRoomAction('pump');
      else if (k === 'f' && hearthView === 'boiler') hearthRoomAction('strike');
      else if (k === 'a') hearthRoomAction('ash');
      else if ((k === 'e' || k === 'enter') && hearthView === 'forge') hearthRoomAction('work');
    } else if (k === 'e' || k === 'enter') {
      for (var i = 0; i < bathGuests.length; i++) if (bathGuests[i].st === 'wait') { bathServe(bathGuests[i].s.id); break; }
    } else if (k === 'w') bathAddWater();
    return true;
  }

  // All hit boxes use CSS pixels. Firebox bodies stay in their own 320 x 210 space.
  function hearthRoomLayout() {
    var w = canvas.width / dpr, h = canvas.height / dpr, wide = w >= 740;
    if (w >= 560 && h < 550) {
      var ch = Math.max(68, Math.min(h - 210, (w * 0.49 - 48) * 210 / 320));
      var cw = ch * 320 / 210, rx = w * 0.5 + 10, rw = w - rx - 18;
      return { w: w, h: h, wide: false, compact: true,
        box: { x: (w * 0.5 - cw) / 2, y: 121, w: cw, h: ch },
        bin: { x: rx, y: 114, w: rw * 0.52 - 5, h: 66 },
        pump: { x: rx + rw * 0.52 + 5, y: 114, w: rw * 0.48 - 5, h: 66 },
        action: { x: rx, y: 194, w: rw * 0.66 - 5, h: 48 },
        ash: { x: rx + rw * 0.66 + 5, y: 194, w: rw * 0.34 - 5, h: 48 },
        bench: { x: rx, y: 100, w: rw, h: 90 } };
    }
    var small = h < 510;
    var bh = Math.max(78, Math.min(wide ? (w * 0.58 - 76) * 210 / 320 : (w - 56) * 210 / 320, h - (wide ? 286 : 358)));
    var bw = bh * 320 / 210, x = wide ? Math.max(36, (w * 0.61 - bw) / 2) : (w - bw) / 2;
    var y = small ? 114 : 126;
    var row = y + bh + 28, left = wide ? x : 18, rowW = wide ? bw : w - 36;
    var sideX = x + bw + 48;
    return { w: w, h: h, wide: wide, small: small, box: { x: x, y: y, w: bw, h: bh },
      bin: { x: left, y: row, w: rowW * 0.54 - 5, h: small ? 64 : 76 },
      pump: { x: left + rowW * 0.54 + 5, y: row, w: rowW * 0.46 - 5, h: small ? 64 : 76 },
      action: wide ? { x: sideX, y: y + bh - 4, w: w - sideX - 30, h: 48 } : { x: 18, y: row + (small ? 76 : 88), w: (w - 44) * 0.68, h: 48 },
      ash: wide ? { x: sideX, y: y + bh + 58, w: w - sideX - 30, h: 44 } : { x: 26 + (w - 44) * 0.68, y: row + (small ? 76 : 88), w: (w - 44) * 0.32 - 8, h: 48 },
      bench: { x: wide ? sideX : w / 2 - 50, y: wide ? y + 50 : y + bh - 100, w: wide ? w - sideX - 30 : 100, h: wide ? bh - 60 : 80 } };
  }
  function hearthCSSPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / dpr / r.width,
      y: (e.clientY - r.top) * canvas.height / dpr / r.height };
  }
  function hearthContains(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function hearthCapture(e) { try { canvas.setPointerCapture(e.pointerId); } catch (ignore) {} }
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
    if (kind === 'bath') return false;
    var box = L.box, bed = hearthBeds[kind];
    for (var n = bed.chunks.length - 1; n >= 0; n--) {
      var b = bed.chunks[n], sx = box.x + b.x * box.w / 320, sy = box.y + b.y * box.h / 210;
      if (Math.hypot(p.x - sx, p.y - sy) > Math.max(22, b.r * box.w / 320 + 4)) continue;
      b.held = true;
      hearthDrag = { kind: kind, b: b, fresh: false, ox: b.x, oy: b.y, x: p.x, y: p.y,
        startX: p.x, startY: p.y, vx: 0, vy: 0, pointer: e.pointerId, time: performance.now() };
      hearthCapture(e); return true;
    }
    return true;
  }
  function hearthPointerMove(e) {
    var d = hearthDrag;
    if (!d || d.pointer !== e.pointerId) return !!hearthPress;
    var p = hearthCSSPoint(e), now = performance.now(), dt = Math.max(0.016, (now - d.time) / 1000);
    d.vx = Math.max(-450, Math.min(450, (p.x - d.x) / dt));
    d.vy = Math.max(-450, Math.min(450, (p.y - d.y) / dt));
    d.x = p.x; d.y = p.y; d.time = now;
    return true;
  }
  function hearthCancelDrag() {
    var d = hearthDrag;
    if (d) {
      if (d.fresh) { hearthRemoveChunk(d.kind, d.b.id); forgeGive('coal', 1); }
      else { d.b.x = d.ox; d.b.y = d.oy; d.b.vx = 0; d.b.vy = 0; d.b.held = false; }
      hearthDrag = null;
    }
    hearthPress = null;
  }
  function hearthPointerUp(e) {
    if (!bathMode) return false;
    if (hearthPress && hearthPress.pointer === e.pointerId) {
      var pr = hearthPress, p = hearthCSSPoint(e); hearthPress = null;
      if (hearthContains(pr.rect, p.x, p.y)) hearthRoomAction(pr.action);
      return true;
    }
    var d = hearthDrag;
    if (!d || d.pointer !== e.pointerId) return hearthView !== 'bath';
    if (gamePaused || bathFading) { hearthCancelDrag(); return true; }
    var q = hearthCSSPoint(e), box = hearthRoomLayout().box;
    var tap = d.fresh && Math.hypot(q.x - d.startX, q.y - d.startY) < 10;
    if (tap || hearthContains({ x: box.x - 12, y: box.y - 35, w: box.w + 24, h: box.h + 48 }, q.x, q.y)) {
      d.b.x = tap ? 90 + Math.random() * 140 : Math.max(d.b.r, Math.min(320 - d.b.r, (q.x - box.x) * 320 / box.w));
      d.b.y = tap ? 12 : Math.max(-30, Math.min(210 - d.b.r, (q.y - box.y) * 210 / box.h));
      d.b.vx = tap ? (Math.random() - 0.5) * 50 : d.vx * 320 / box.w * 0.45;
      d.b.vy = tap ? 0 : d.vy * 210 / box.h * 0.45;
      d.b.spin = d.b.vx * 0.025; d.b.held = false; hearthDrag = null;
      sfxPlay('debris', { gain: 0.35 });
    } else if (d.fresh || (d.b.fuel >= 0.999 && d.b.heat < 0.05 && !d.b.ash)) {
      hearthRemoveChunk(d.kind, d.b.id); forgeGive('coal', 1); hearthDrag = null;
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
    var w = canvas.width / dpr;
    hearthButtons = [];
    c.fillStyle = UIT_PANEL; c.fillRect(0, 0, w, 94);
    hearthText(c, 'BANYA / FIRE & WATER', 18, 23, w < 400 ? 12 : 14);
    hearthButton(c, { x: w - 94, y: 3, w: 82, h: 40 }, 'LEAVE', 'exit', false);
    if (w > 640 && typeof devMode !== 'undefined' && devMode) {
      hearthButton(c, { x: w - 250, y: 3, w: 144, h: 40 }, 'TEST SUPPLIES [T]', 'kit', true);
    }
    var names = ['BATH', 'BOILER', 'FORGE'], views = ['bath', 'boiler', 'forge'], tw = (w - 36) / 3;
    for (var i = 0; i < 3; i++) {
      var r = { x: 14 + i * (tw + 4), y: 49, w: tw - 4, h: 40 };
      hearthButton(c, r, names[i] + (w > 560 ? '  [' + (i + 1) + ']' : ''), views[i], view === views[i]);
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
  function hearthDrawTools(c, r, kind) {
    var cx = r.x + r.w / 2, cy = r.y + 60;
    if (kind === 'forge') {
      // One anvil silhouette, a hot blank, and a hammer with a weighted swing.
      var size = Math.min(2.2, (r.h - 10) / 157, r.w / 225);
      c.save(); c.translate(cx, r.y + r.h / 2); c.scale(size, size);
      c.fillStyle = BLD.woodDark; c.fillRect(-93, 48, 192, 12);
      c.fillStyle = BLD.woodLight; c.fillRect(-93, 48, 192, 2);
      c.fillStyle = BLD.woodDeep; c.fillRect(-86, 60, 9, 32); c.fillRect(82, 60, 9, 32);
      c.fillStyle = BLD.woodDeep; c.fillRect(-38, 27, 76, 48);
      c.fillStyle = BLD.woodDark; c.fillRect(-36, 29, 71, 8);
      c.fillStyle = BLD.metalDark;
      c.beginPath(); c.moveTo(-73, -14); c.lineTo(-39, -26); c.lineTo(53, -26); c.lineTo(53, -10);
      c.lineTo(22, 2); c.lineTo(18, 17); c.lineTo(38, 28); c.lineTo(-40, 28); c.lineTo(-17, 16);
      c.lineTo(-22, -3); c.closePath(); c.fill();
      c.fillStyle = BLD.metalLight; c.fillRect(-38, -27, 91, 5);
      c.fillStyle = BLD.metalBase; c.fillRect(-19, -14, 38, 22);
      if (hearthJob.stage !== 'empty' && hearthJob.stage !== 'heating' && hearthJob.stage !== 'cooling') {
        c.fillStyle = hearthJob.heat > 0.65 ? BLD.goldPale : hearthJob.heat > 0.3 ? BLD.redBright : BLD.metalPale;
        var blankW = 28 + hearthJob.hits * 6;
        c.fillRect(-blankW / 2, -34, blankW, 7);
        if (hearthJob.hits >= 3) c.fillRect(blankW / 2 - 5, -34, 5, 15);
      }
      c.save(); c.translate(52, -6); c.rotate(-0.65 + Math.sin(hearthToolPulse * Math.PI) * 0.95);
      c.fillStyle = BLD.woodMid; c.fillRect(-3, -69, 7, 62);
      c.fillStyle = BLD.metalDark; c.fillRect(-17, -79, 34, 20);
      c.fillStyle = BLD.metalLight; c.fillRect(-16, -79, 31, 4); c.restore();
      if (hearthToolPulse > 0.3 && hearthJob.hits > 0) {
        for (var s = 0; s < 12; s++) {
          var a = s * 2.4, t = 1 - hearthToolPulse;
          c.fillStyle = s % 2 ? BLD.warmGlow : BLD.goldPale;
          c.fillRect(Math.cos(a) * t * 130, -30 - Math.abs(Math.sin(a)) * t * 120 + t * t * 75, 3, 2);
        }
      }
      // The quench pail sits beside the stump, with a metal rim and water.
      c.fillStyle = BLD.metalDark; c.fillRect(60, 13, 35, 34);
      c.fillStyle = BLD.metalBase; c.fillRect(62, 15, 7, 30);
      c.fillStyle = BLD.metalLight; c.fillRect(59, 11, 38, 4);
      c.fillStyle = BLD.waterBase; c.fillRect(63, 15, 30, 3);
      c.fillStyle = BLD.waterLight; c.fillRect(65, 15, 18, 1);
      c.strokeStyle = BLD.metalLight; c.lineWidth = 2;
      c.beginPath(); c.arc(77, 13, 14, Math.PI, Math.PI * 2); c.stroke();
      c.restore();
    } else {
      // A real boiler vessel, connected supply pipe and temperature dial give
      // the fire a visible purpose before the player returns to the tub.
      var tankH = Math.min(190, r.h - 110), tankW = Math.min(130, tankH * 0.8);
      var tx = cx - tankW / 2, ty = r.y - 24;
      c.strokeStyle = BLD.metalDark; c.lineWidth = 17;
      c.beginPath(); c.moveTo(r.x - 35, ty + tankH - 14); c.lineTo(tx, ty + tankH - 14); c.lineTo(tx, ty + 25); c.stroke();
      c.strokeStyle = BLD.goldDark; c.lineWidth = 10; c.stroke();
      c.strokeStyle = BLD.goldBright; c.lineWidth = 2; c.stroke();
      c.fillStyle = BLD.metalDark;
      c.beginPath(); c.ellipse(cx, ty + 8, tankW / 2 + 3, 16, 0, 0, Math.PI * 2); c.fill();
      c.fillRect(tx - 3, ty + 8, tankW + 6, tankH - 8);
      c.beginPath(); c.ellipse(cx, ty + tankH, tankW / 2 + 3, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = BLD.metalBase; c.fillRect(tx + 3, ty + 8, tankW - 9, tankH - 2);
      c.fillStyle = BLD.metalLight; c.fillRect(tx + 7, ty + 8, 5, tankH - 4);
      c.fillStyle = BLD.metalDark; c.fillRect(tx + tankW - 25, ty + 8, 24, tankH - 3);
      c.fillStyle = BLD.metalBase; c.fillRect(tx + tankW - 5, ty + 8, 2, tankH - 3);
      for (var band = 0; band < 2; band++) {
        var bandY = ty + 25 + band * (tankH - 48);
        c.fillStyle = BLD.metalDark; c.fillRect(tx - 5, bandY, tankW + 10, 9);
        c.fillStyle = BLD.metalLight; c.fillRect(tx - 5, bandY, tankW + 10, 2);
        for (var riv = tx + 2; riv < tx + tankW; riv += 24) { c.fillStyle = BLD.metalPale; c.fillRect(riv, bandY + 3, 3, 2); }
      }
      var gaugeY = ty + tankH * 0.5;
      c.fillStyle = BLD.goldDark; c.beginPath(); c.arc(cx, gaugeY, 30, 0, Math.PI * 2); c.fill();
      c.fillStyle = UIT_INSET_DK; c.beginPath(); c.arc(cx, gaugeY, 25, 0, Math.PI * 2); c.fill();
      for (var mark = 0; mark < 7; mark++) {
        var a = Math.PI * (0.8 + mark / 6 * 1.4);
        c.strokeStyle = mark > 4 ? BLD.goldPale : BLD.metalPale; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * 18, gaugeY + Math.sin(a) * 18);
        c.lineTo(cx + Math.cos(a) * 22, gaugeY + Math.sin(a) * 22); c.stroke();
      }
      var needle = Math.PI * (0.8 + bathHeat * 1.4);
      c.strokeStyle = BLD.redBright; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, gaugeY);
      c.lineTo(cx + Math.cos(needle) * 18, gaugeY + Math.sin(needle) * 18); c.stroke();
      c.fillStyle = BLD.goldPale; c.fillRect(cx - 2, gaugeY - 2, 4, 4);
      // The flint and the C-shaped striker hang on the boiler's tool board.
      cy = r.y + r.h - 88;
      hearthPlate(c, { x: cx - 74, y: cy - 34, w: 148, h: 92 }, false);
      c.fillStyle = forgeCount('flint') ? BLD.stonePale : BLD.stoneDark;
      c.beginPath(); c.moveTo(cx - 55, cy + 13); c.lineTo(cx - 47, cy - 9); c.lineTo(cx - 29, cy - 20);
      c.lineTo(cx - 13, cy - 1); c.lineTo(cx - 32, cy + 21); c.closePath(); c.fill();
      c.strokeStyle = forgeCount('steel') ? BLD.metalPale : BLD.metalBase; c.lineWidth = 7;
      c.beginPath(); c.moveTo(cx + 44, cy - 14); c.lineTo(cx + 19, cy - 14); c.lineTo(cx + 14, cy + 14); c.lineTo(cx + 44, cy + 14); c.stroke();
      hearthText(c, 'FLINT', cx - 34, cy + 39, 11, forgeCount('flint') ? BLD.cream : UIT_DIM, 'center');
      hearthText(c, 'STEEL', cx + 31, cy + 39, 11, forgeCount('steel') ? BLD.cream : UIT_DIM, 'center');
    }
  }
  function hearthForgeLabel() {
    var j = hearthJob;
    if (j.stage === 'empty') return forgeCount('steel') ? 'STRIKER FINISHED' : 'LOAD 2 IRON  [E]';
    if (j.stage === 'heating') return 'HEATING IRON ' + Math.min(99, Math.floor(j.heat / 0.65 * 100)) + '%';
    if (j.stage === 'hammer') return 'HAMMER ' + j.hits + '/3  [E]';
    if (j.stage === 'quench') return 'QUENCH / 2 L  [E]';
    if (j.stage === 'cooling') return 'COOLING...';
    return 'TAKE STRIKER  [E]';
  }
  function hearthDrawRoom(c) {
    var L = hearthRoomLayout(), box = L.box, kind = hearthView, bed = hearthBeds[kind];
    var t = hearthToolTime;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = BLD.woodDeep; c.fillRect(0, 0, L.w, L.h);
    // Broad quiet boards, heavy beams, and a flue give the fire a room to light.
    c.fillStyle = BLD.outline;
    for (var by = 109; by < L.h; by += 38) c.fillRect(0, by, L.w, 3);
    c.fillStyle = BLD.outline; c.fillRect(0, 94, 18, L.h - 94); c.fillRect(L.w - 18, 94, 18, L.h - 94);
    c.fillStyle = BLD.woodDark; c.fillRect(18, 94, 4, L.h - 94); c.fillRect(L.w - 22, 94, 4, L.h - 94);
    var floorY = Math.min(L.h - 75, L.bin.y + L.bin.h + 38);
    c.fillStyle = BLD.stoneDark; c.fillRect(0, floorY, L.w, L.h - floorY);
    c.fillStyle = BLD.outline; c.fillRect(0, floorY, L.w, 5);
    for (var slab = 0; slab < L.w; slab += 154) { c.fillStyle = BLD.stoneBase; c.fillRect(slab, floorY + 5, 151, 2); }
    c.fillStyle = UIMAT_PLATE_SHADOW; c.fillRect(box.x + box.w * 0.46, 92, box.w * 0.18, 40);
    c.fillStyle = BLD.metalLight; c.fillRect(box.x + box.w * 0.46 + 4, 92, 3, 38);
    hearthPlate(c, { x: box.x - 15, y: box.y - 14, w: box.w + 30, h: box.h + 33 }, true);
    c.fillStyle = BLD.metalDark; c.fillRect(box.x - 13, box.y + box.h + 18, box.w + 26, 10);
    hearthDrawFirebox(c, bed, box.x, box.y, box.w, box.h, t);
    // The actual grate is beneath the bodies, never a lattice over their faces.
    c.fillStyle = BLD.metalDark; c.fillRect(box.x - 1, box.y + box.h, box.w + 2, 7);
    for (var gx = box.x + 8; gx < box.x + box.w; gx += 18) {
      c.fillStyle = BLD.metalLight; c.fillRect(gx, box.y + box.h, 8, 2);
      c.fillStyle = BLD.outline; c.fillRect(gx + 8, box.y + box.h + 2, 6, 5);
    }
    hearthText(c, kind === 'boiler' ? '01 / COAL-FIRED BOILER' : '02 / BANKED FORGE', box.x, 108, 11, BLD.cream);
    // The coal bunker is the source of every movable chunk.
    hearthPlate(c, L.bin, true);
    var visible = Math.min(7, forgeCount('coal'));
    for (var i = 0; i < visible; i++) {
      if (!hearthBinCoals[i]) hearthBinCoals[i] = { r: 13 + i % 3, seed: (i + 1) * 0.137, angle: i * 1.7, heat: 0, fuel: 1 };
      hearthDrawCoal(c, hearthBinCoals[i],
        L.bin.x + 26 + (i % 4) * 24, L.bin.y + 30 - Math.floor(i / 4) * 12, 0.85, t);
    }
    hearthText(c, 'COAL ' + forgeCount('coal'), L.bin.x + 12, L.bin.y + 59, 12);
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
    if (L.wide) {
      hearthText(c, kind === 'forge' ? 'MAKE THE FIRST SPARK' : 'HEAT FOR THE BATH', L.bench.x, 111, 13, BLD.goldPale);
      hearthDrawTools(c, L.bench, kind);
      hearthText(c, kind === 'forge' ? 'IRON ' + forgeCount('iron') + '  /  WATER ' + Math.floor(bathWaterCount() / 100) + ' L' :
        'TUB ' + Math.floor(bathWater / 100) + ' L  /  ' + Math.round(20 + bathHeat * 28) + ' C', L.bench.x, L.action.y - 24, 12);
    }
    if (kind === 'forge' && (hearthJob.stage === 'heating' || (!L.wide && hearthJob.stage !== 'empty'))) {
      // Heat the blank in the fire first; on wider screens it then moves to
      // the anvil. The workpiece stays visible at every phone size, too.
      c.fillStyle = BLD.metalBase; c.fillRect(box.x + box.w * 0.25, box.y + 33, box.w * 0.5, 3);
      c.fillStyle = hearthJob.heat > 0.65 ? BLD.goldPale : hearthJob.heat > 0.3 ? BLD.redBright : BLD.metalPale;
      c.fillRect(box.x + box.w * 0.5 - 24, box.y + 27, 48, 8);
    }
    hearthButton(c, L.action, kind === 'forge' ? hearthForgeLabel() : 'STRIKE FLINT [F]', kind === 'forge' ? 'work' : 'strike',
      kind === 'forge' ? (hearthJob.stage !== 'heating' && hearthJob.stage !== 'cooling') : forgeCount('flint') > 0 && forgeCount('steel') > 0);
    hearthButton(c, L.ash, 'RAKE ASH', 'ash', bed.chunks.some(function (b) { return b.ash; }));
    if (hearthQuenchSteam > 0 && kind === 'forge') {
      c.save(); c.globalAlpha = hearthQuenchSteam * 0.3; c.fillStyle = BLD.cream;
      for (var st = 0; st < 7; st++) {
        var rise = ((t * 0.55 + st * 0.14) % 1);
        c.beginPath(); c.ellipse(L.action.x + L.action.w / 2 + Math.sin(st + rise * 5) * 18,
          L.action.y - rise * 95, 9 + rise * 17, 4 + rise * 9, 0, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    var stats = kind === 'forge' ? 'Iron ' + forgeCount('iron') + '   Water ' + Math.floor(bathWaterCount() / 100) + ' L   Steel ' + forgeCount('steel') :
      'Flint ' + forgeCount('flint') + '   Steel ' + forgeCount('steel') + '   Bath ' + Math.round(20 + bathHeat * 28) + ' C';
    var bottomY = L.compact || L.small ? L.h - 39 : Math.max(L.action.y + L.action.h + 26, L.h - 62);
    c.fillStyle = UIT_PANEL; c.fillRect(0, bottomY - 16, L.w, L.h - bottomY + 16);
    hearthText(c, stats, 18, bottomY, 11, BLD.cream);
    var hint = bathNoticeT > 0 ? bathNotice : kind === 'forge' ?
      'A banked ember starts the forge. Heat iron, hammer it, then quench the striker.' :
      'Drag coal onto the grate, or tap the bunker. Flint and steel light it. Bellows feed it.';
    hearthWrap(c, hint, 18, bottomY + 22, L.w - 36, bathNoticeT > 0 ? BLD.goldPale : UIT_DIM, L.compact || L.small ? 1 : 2);
    if (hearthDrag) {
      var d = hearthDrag;
      hearthDrawCoal(c, d.b, d.x, d.y, Math.max(0.9, box.w / 320), t);
      c.strokeStyle = BLD.goldPale; c.lineWidth = 1; c.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
    }
    hearthDrawNav(c, kind);
    // Nav resets hit regions; append the station controls after it.
    hearthButtons.push(Object.assign({ action: 'coal' }, L.bin), Object.assign({ action: 'pump' }, L.pump),
      Object.assign({ action: kind === 'forge' ? 'work' : 'strike' }, L.action), Object.assign({ action: 'ash' }, L.ash));
  }

  function hearthRoomRender() {
    if (!bathMode || hearthView === 'bath') return false;
    // An opaque foreground covers the water/steam canvases while the workbench
    // owns the view. Their real simulation and the bath temperature keep running.
    var foreground = uiTopEnsure();
    if (foreground && uiTopCanvas) {
      foreground.setTransform(1, 0, 0, 1, 0, 0);
      foreground.clearRect(0, 0, uiTopCanvas.width, uiTopCanvas.height);
      hearthDrawRoom(foreground);
    } else hearthDrawRoom(ctx);
    return true;
  }
