  /* ---- The siphon: separate fluid chambers and one passenger cradle ---- */
  var siphon = { equipped: false, mode: 'suck', tank: [0, 0, 0, 0, 0], selected: 0,
    capacity: 16000, passenger: null, pointer: null, aimX: 0, aimY: 0,
    power: 0, carry: 0, capture: 0, released: false, clock: 0, fx: [], notice: '', noticeT: 0 };
  var siphonButtons = [];
  function siphonReset() {
    siphon.equipped = false; siphon.tank = [0, 0, 0, 0, 0]; siphon.selected = 0;
    siphon.passenger = null; siphon.power = 0; siphon.fx = []; siphon.clock = 0;
    siphonStop();
  }
  function siphonStop() {
    siphon.pointer = null; siphon.capture = 0; siphon.carry = 0; siphon.released = false;
  }
  function siphonAvailable() {
    return introPhase === 'done' && !gamePaused && !gameOver && !gameWon && !shopOpen &&
      shopState === 'closed' && !ledgerOpen && !cargoManifestOpen && !itemWheel.open && !bathMode;
  }
  function siphonTotal() { return siphon.tank.reduce(function (sum, n) { return sum + n; }, 0); }
  function siphonNotice(text) { siphon.notice = text; siphon.noticeT = 2.5; }
  function siphonToggle() {
    siphonStop(); siphon.equipped = !siphon.equipped;
    siphon.aimX = viewW * 0.6; siphon.aimY = viewH * 0.5;
    if (siphon.equipped) siphonNotice(isMobile ? 'Choose IN or OUT, then hold on the world.' : 'Aim and hold: left draws in, right pours. R changes chamber.');
  }
  function siphonCycle() {
    for (var i = 1; i <= 5; i++) {
      var next = (siphon.selected + i) % 5;
      if (siphon.tank[next] > 0) { siphon.selected = next; return; }
    }
    siphon.selected = 0;
  }
  function siphonKey(e) {
    if (!siphonAvailable()) return false;
    var key = e.key.toLowerCase();
    if (key === 'f') { if (!e.repeat) siphonToggle(); return true; }
    if (key === 'r' && siphon.equipped) { if (!e.repeat) siphonCycle(); return true; }
    if (key === 'e' && !e.repeat && slimeGardenInteract()) return true;
    return false;
  }
  function siphonHit(button, x, y) {
    return x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h;
  }
  function siphonPointerDown(x, y, id, right) {
    if (!siphonAvailable()) return false;
    for (var b = 0; b < siphonButtons.length; b++) {
      var button = siphonButtons[b];
      if (!siphonHit(button, x, y)) continue;
      if (button.action === 'equip') siphonToggle();
      if (button.action === 'mode') { siphon.mode = siphon.mode === 'suck' ? 'pour' : 'suck'; siphonStop(); }
      if (button.action === 'cycle') siphonCycle();
      return true;
    }
    if (!siphon.equipped || isInDpadZone(x, y) || y > consoleRect().y * consoleScale() - 6) return false;
    if (siphon.pointer !== null) return true;
    siphon.pointer = id; siphon.aimX = x; siphon.aimY = y;
    if (id === 'mouse') siphon.mode = right ? 'pour' : 'suck';
    siphon.released = false;
    return true;
  }
  function siphonPointerMove(x, y, id) {
    if (id === siphon.pointer || (id === 'mouse' && siphon.pointer === null)) {
      siphon.aimX = x; siphon.aimY = y;
    }
    return id === siphon.pointer;
  }
  function siphonPointerUp(id) {
    if (id !== siphon.pointer) return false;
    siphonStop(); return true;
  }
  function siphonAim() {
    var cx = player.x + PLAYER_W * 0.5, cy = player.y + PLAYER_H * 0.5;
    var dx = siphon.aimX / worldScale + cam.x - cx;
    var dy = siphon.aimY / worldScale + cam.y - cy;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= length; dy /= length;
    var reach = Math.min(length, TILE * 4.8);
    // Clip against terrain from the miner out. The nozzle cannot vacuum a
    // pocket through its roof or project a jet through a wall.
    for (var d = 12; d <= reach; d += 4) {
      if (liquidWorldSolidAt(cx + dx * d, cy + dy * d)) { reach = Math.max(8, d - 5); break; }
    }
    var neck = Math.min(PLAYER_W * 0.65 + 8, Math.max(7, reach - 3));
    return { cx: cx, cy: cy, nx: cx + dx * neck, ny: cy + dy * neck,
      x: cx + dx * reach, y: cy + dy * reach, dx: dx, dy: dy, reach: reach };
  }
  function siphonTick(dt) {
    siphon.flow = 0;
    siphon.clock += dt;
    siphon.noticeT = Math.max(0, siphon.noticeT - dt);
    var active = siphon.equipped && siphonAvailable() && siphon.pointer !== null;
    if (!siphonAvailable()) siphonStop();
    siphon.power += ((active ? 1 : 0) - siphon.power) * (1 - Math.exp(-dt * (active ? 16 : 10)));
    for (var f = siphon.fx.length - 1; f >= 0; f--) {
      siphon.fx[f].t += dt;
      if (siphon.fx[f].t > siphon.fx[f].life) siphon.fx.splice(f, 1);
    }
    if (!active) return;
    var a = siphonAim();
    if (siphon.mode === 'suck') {
      if (siphonTotal() >= siphon.capacity && !siphon.passenger) siphonNotice(isMobile ? 'Tank full. Choose OUT to pour.' : 'Fluid tank full. Right mouse pours a chamber.');
      siphon.carry += 6200 * siphon.power * dt;
      var count = Math.min(Math.floor(siphon.carry), siphon.capacity - siphonTotal(), 700);
      siphon.carry -= Math.floor(siphon.carry);
      if (count > 0) {
        var taken = liquidToolExtract(a.x, a.y, 29, count);
        var total = 0;
        for (var t = 0; t < taken.length; t++) {
          siphon.tank[t] += taken[t]; total += taken[t];
          if (taken[t] && siphon.tank[siphon.selected] === 0) siphon.selected = t;
          if (taken[t]) for (var q = 0; q < Math.min(5, Math.ceil(taken[t] / 15)); q++) {
            if (siphon.fx.length > 140) break;
            siphon.fx.push({ x: a.x + (Math.random() - 0.5) * 36, y: a.y + (Math.random() - 0.5) * 30,
              tx: a.nx, ty: a.ny, type: t, t: 0, life: 0.18 + Math.random() * 0.15 });
          }
        }
        siphon.flow = total;
        if (!total && siphon.clock % 3 < dt) siphonNotice('Bring the intake closer to the liquid.');
      }
      if (!siphon.passenger) {
        siphon.capture += dt;
        if (siphon.capture > 0.5) {
          var caught = skySlimeCapture(a.x, a.y, 30);
          if (caught) { siphon.passenger = caught; siphonNotice('Passenger secured. Pour to set it in a bath.'); }
          siphon.capture = 0;
        }
      }
    } else if (siphon.passenger) {
      if (!siphon.released) {
        var p = siphon.passenger;
        var launch = PLAYER_W * 0.5 + p.r + 5;
        var rx = a.cx + a.dx * launch, ry = a.cy + a.dy * launch;
        var blocked = false;
        for (var k = 0; k < 12; k++) {
          var theta = k / 12 * Math.PI * 2;
          if (liquidWorldSolidAt(rx + Math.cos(theta) * p.r, ry + Math.sin(theta) * p.r)) blocked = true;
        }
        if (blocked || !liquidLineClear(a.nx, a.ny, rx, ry)) { siphonNotice('Aim into clear space to release the slime.'); return; }
        if (skySlimeRelease(p, rx, ry, a.dx * 130 + player.vx * 0.3, a.dy * 130)) {
          siphon.passenger = null; siphon.released = true;
          siphonNotice('Passenger released. Release the button before pouring liquid.');
        }
      }
    } else if (!siphon.released) {
      var type = siphon.selected;
      if (siphon.tank[type] < 1) { siphonNotice(isMobile ? 'Empty chamber. Tap TANK to switch.' : 'This chamber is empty. R selects another.'); return; }
      siphon.carry += 6200 * siphon.power * dt;
      var wanted = Math.min(Math.floor(siphon.carry), siphon.tank[type], 700);
      siphon.carry -= Math.floor(siphon.carry);
      // A fan narrow enough to feel like a hose, widening under gravity.
      var speed = Math.min(520, Math.max(210, a.reach * 3));
      var sent = liquidToolEmit(type, wanted, a.nx + a.dx * 5, a.ny + a.dy * 5,
        a.dx * speed + player.vx * 0.35, a.dy * speed + player.vy * 0.2);
      siphon.tank[type] -= sent;
      siphon.flow = sent;
      if (sent < wanted) siphonNotice('No room at the nozzle. Aim into open space.');
    }
  }
  function siphonDraw() {
    if (!siphon.equipped || !siphonAvailable()) return;
    var a = siphonAim(), angle = Math.atan2(a.dy, a.dx);
    ctx.save();
    // The hose has slack while idle and draws taut when the pump spools up.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.cx - 8, a.cy + 7);
    ctx.quadraticCurveTo(a.cx - 21, a.cy + 26 - siphon.power * 7, a.nx - a.dx * 12, a.ny - a.dy * 12);
    ctx.strokeStyle = BLD.outline; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = BLD.metalBase; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.translate(a.nx, a.ny); ctx.rotate(angle);
    ctx.fillStyle = BLD.outline; ctx.fillRect(-19, -7, 25, 14);
    ctx.fillStyle = BLD.metalBase; ctx.fillRect(-18, -5, 19, 10);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(-17, -5, 18, 2);
    ctx.fillStyle = BLD.goldBase; ctx.fillRect(-5, -6, 5, 12);
    ctx.fillStyle = BLD.outline; ctx.fillRect(1, -4, 5, 8);
    ctx.fillStyle = siphon.mode === 'suck' ? BLD.waterLight : liquidCatalog[siphon.selected].color;
    ctx.globalAlpha = 0.4 + siphon.power * 0.6; ctx.fillRect(-12, -3, 3, 6);
    ctx.restore();
    var col = siphon.mode === 'suck' ? BLD.waterLight : liquidCatalog[siphon.selected].color;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.28 + siphon.power * 0.3;
    ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(a.nx, a.ny); ctx.lineTo(a.x, a.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.x, a.y, 9 + siphon.power * 5, 0, Math.PI * 2); ctx.stroke();
    if (siphon.mode === 'suck' && siphon.power > 0.03) {
      for (var w = 0; w < 3; w++) {
        var progress = (siphon.clock * 1.9 + w / 3) % 1;
        var x = a.x + (a.nx - a.x) * progress, y = a.y + (a.ny - a.y) * progress;
        ctx.globalAlpha = Math.sin(progress * Math.PI) * siphon.power * 0.33;
        ctx.beginPath(); ctx.ellipse(x, y, 4, 18 * (1 - progress) + 3, angle, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < siphon.fx.length; i++) {
      var f = siphon.fx[i], t = f.t / f.life, ease = t * t;
      var fx = f.x + (a.nx - f.x) * ease, fy = f.y + (a.ny - f.y) * ease - Math.sin(t * Math.PI) * 9;
      ctx.fillStyle = liquidCatalog[f.type].color; ctx.globalAlpha = 1 - t * 0.55;
      ctx.beginPath(); ctx.ellipse(fx, fy, 2.3 * (1 - t * 0.5), 1.4, angle, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function siphonDrawButton(x, y, w, h, label, action, active) {
    ctx.fillStyle = active ? UIT_PANEL_SEL : UIMAT_PLATE_BASE; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? UIT_GOLD : UIMAT_PLATE_HIGHLIGHT; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = active ? UIT_GOLD : UIT_TEXT; ctx.font = 'bold 11px ' + UI_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + h / 2);
    siphonButtons.push({ x: x, y: y, w: w, h: h, action: action });
  }
  function siphonHUD() {
    siphonButtons = [];
    if (!siphonAvailable()) return;
    var x = 14, bottom = itemWheelButtonRect().y - 10, w = isMobile ? 206 : 302;
    if (isMobile && viewW < 520) {
      var padLeft = DPAD_CX - DPAD_SIZE * 0.85;
      w = Math.min(206, Math.max(156, padLeft - x - 10));
      if (x + w + 8 > padLeft) bottom = Math.min(bottom, DPAD_CY - DPAD_SIZE * 0.85 - 10);
    }
    w = Math.min(w, viewW - 28);
    var h = siphon.equipped ? (isMobile ? 132 : 126) : 42;
    var y = Math.max(56, bottom - h);
    ctx.save();
    if (!siphon.equipped) {
      siphonDrawButton(x, y, isMobile ? 106 : 126, 40, isMobile ? 'SIPHON' : 'F  SIPHON', 'equip', false);
      ctx.restore(); return;
    }
    ctx.fillStyle = UIT_PANEL; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.strokeStyle = UIMAT_PLATE_HIGHLIGHT; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    var bw = Math.floor((w - 16) / 3);
    siphonDrawButton(x + 4, y + 4, bw, 36, isMobile ? 'STOW' : 'F  STOW', 'equip', true);
    siphonDrawButton(x + 8 + bw, y + 4, bw, 36, siphon.mode === 'suck' ? 'IN' : 'OUT', 'mode', true);
    siphonDrawButton(x + 12 + bw * 2, y + 4, bw, 36, isMobile ? 'TANK' : 'R  TANK', 'cycle', false);
    var total = siphonTotal(), info = liquidCatalog[siphon.selected];
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '11px ' + UI_FONT;
    ctx.fillStyle = UIT_TEXT;
    ctx.fillText(info.name + '  ' + Math.round(siphon.tank[siphon.selected] / 100) + ' L', x + 10, y + 57);
    ctx.textAlign = 'right'; ctx.fillStyle = UIT_DIM;
    ctx.fillText(Math.round(total / 100) + '/160 L', x + w - 10, y + 57);
    ctx.fillStyle = UIT_INSET; ctx.fillRect(x + 10, y + 65, w - 20, 8);
    var barX = x + 10;
    for (var type = 0; type < 5; type++) {
      var length = siphon.tank[type] / siphon.capacity * (w - 20);
      ctx.fillStyle = liquidCatalog[type].color; ctx.fillRect(barX, y + 65, length, 8); barX += length;
    }
    ctx.textAlign = 'left'; ctx.fillStyle = siphon.passenger ? UIT_GOLD : UIT_DIM;
    ctx.fillText(siphon.passenger ? 'PASSENGER  1 / 1' : 'PASSENGER  empty', x + 10, y + 91);
    ctx.fillStyle = UIT_BODY; ctx.font = '10px ' + UI_FONT;
    var hint = isMobile ? 'Hold on the world to ' + (siphon.mode === 'suck' ? 'draw in' : 'pour') : 'LEFT draw in   RIGHT pour / release';
    if (isMobile && w < 200) {
      ctx.fillText('Hold on the world', x + 10, y + 109);
      ctx.fillText('to ' + (siphon.mode === 'suck' ? 'draw in' : 'pour'), x + 10, y + 123);
    } else ctx.fillText(hint, x + 10, y + 111);
    if (siphon.noticeT > 0) {
      var noticeW = Math.min(viewW - 28, isMobile ? w : 490), words = siphon.notice.split(' '), lines = [], line = '';
      ctx.font = '10px ' + UI_FONT;
      for (var wi = 0; wi < words.length; wi++) {
        var next = line ? line + ' ' + words[wi] : words[wi];
        if (ctx.measureText(next).width > noticeW - 18 && line) { lines.push(line); line = words[wi]; } else line = next;
      }
      if (line) lines.push(line);
      var noticeH = lines.length * 14 + 12;
      ctx.fillStyle = UIT_PANEL; ctx.fillRect(x - 1, y - noticeH - 5, noticeW, noticeH);
      ctx.fillStyle = UIT_TEXT;
      for (var li = 0; li < lines.length; li++) ctx.fillText(lines[li], x + 8, y - noticeH + 10 + li * 14);
    }
    ctx.restore();
  }
  function siphonSave() { return { tank: siphon.tank.slice(), selected: siphon.selected, passenger: siphon.passenger }; }
  function siphonRestore(data) {
    siphonReset();
    if (!data) return;
    var left = siphon.capacity;
    for (var i = 0; i < 5; i++) {
      var value = data.tank && data.tank[i];
      siphon.tank[i] = Math.min(left, Math.max(0, isFinite(value) ? Math.floor(value) : 0)); left -= siphon.tank[i];
    }
    siphon.selected = data.selected >= 0 && data.selected < 5 ? data.selected | 0 : 0;
    if (data.passenger && isFinite(data.passenger.r) && data.passenger.r >= 10 && data.passenger.r <= 50) siphon.passenger = data.passenger;
  }
  window.__siphon = { state: siphon, aim: siphonAim, equip: siphonToggle, save: siphonSave,
    restore: siphonRestore, total: siphonTotal, tick: siphonTick };
