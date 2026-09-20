  /* ---- The siphon: separate fluid chambers and one passenger cradle ---- */
  var siphon = { equipped: false, mode: 'suck', tank: [0, 0, 0, 0, 0], selected: 0,
    capacity: 16000, passenger: null, pointer: null, dump: null,
    power: 0, carry: 0, capture: 0, released: false, clock: 0, fx: [], notice: '', noticeT: 0 };
  var siphonButtons = [];
  function siphonReset() {
    siphon.equipped = false; siphon.mode = 'suck'; siphon.tank = [0, 0, 0, 0, 0]; siphon.selected = 0;
    siphon.passenger = null; siphon.dump = null; siphon.power = 0; siphon.fx = []; siphon.clock = 0;
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
    if (siphon.dump) return;
    var wasScooping = siphon.equipped && siphon.mode === 'suck';
    siphonStop(); siphon.mode = 'suck'; siphon.equipped = !wasScooping;
    if (siphon.equipped) siphonNotice('Scoop on. Drive or fly over liquid and settled slimes.');
  }
  function siphonDump() {
    if (!siphonAvailable() || siphon.dump) return;
    var total = siphonTotal();
    if (!total && !siphon.passenger) { siphonNotice('Tank empty. Scoop up a load first.'); return; }
    siphonStop(); siphon.mode = 'dump'; siphon.equipped = true;
    siphon.dump = { initial: total, sent: 0, kick: 0, age: 0, blocked: 0, carry: 0, started: false };
    siphonNotice('Dumping the whole load.');
  }
  function siphonReleasePassenger() {
    var p = siphon.passenger;
    if (!p) return true;
    var a = siphonAim(), dir = player.dir < 0 ? -1 : 1;
    var spots = [
      [a.cx, player.y + PLAYER_H + p.r + 3, player.vx * 0.3, 100],
      [a.cx + dir * (PLAYER_W * 0.5 + p.r + 8), player.y + PLAYER_H - p.r - 2, dir * 60 + player.vx * 0.3, -35],
      [a.cx - dir * (PLAYER_W * 0.5 + p.r + 8), player.y + PLAYER_H - p.r - 2, -dir * 45, -35]
    ];
    for (var i = 0; i < spots.length; i++) {
      var spot = spots[i], blocked = false;
      for (var k = 0; k < 16; k++) {
        var theta = k / 16 * Math.PI * 2;
        if (liquidWorldSolidAt(spot[0] + Math.cos(theta) * (p.r + 1), spot[1] + Math.sin(theta) * (p.r + 1))) blocked = true;
      }
      if (blocked || !liquidLineClear(a.nx, a.ny, spot[0], spot[1])) continue;
      if (skySlimeRelease(p, spot[0], spot[1], spot[2], spot[3])) { siphon.passenger = null; return true; }
    }
    return false;
  }
  function siphonDumpTick(dt) {
    var d = siphon.dump, a = siphonAim();
    d.age += dt;
    var total = siphonTotal(), sent = 0;
    if (total) {
      d.carry += siphon.capacity / 0.60 * dt;
      var wanted = Math.min(total, Math.floor(d.carry), 2048);
      d.carry -= Math.floor(d.carry);
      // On the ground, the opening fans out beside the tracks. As soon as
      // the rig lifts, the whole curtain falls from beneath its belly.
      var y = player.y + PLAYER_H + 2;
      if (liquidWorldSolidAt(a.cx, y)) y = a.ny;
      var counts = liquidToolDump(siphon.tank, wanted, a.cx, y,
        28 + 36 * Math.sqrt(d.initial / siphon.capacity), player.vx);
      for (var k = 0; k < 5; k++) { siphon.tank[k] -= counts[k]; sent += counts[k]; }
      d.sent += sent; siphon.flow = sent;
      if (sent) {
        // Recoil is earned only by real discharged volume. One empty click
        // cannot jump, and repeated clicks cannot recharge an active burst.
        var earned = 820 * Math.sqrt(d.sent / siphon.capacity);
        player.vy = Math.max(-840, player.vy - Math.max(0, earned - d.kick));
        d.kick = earned;
        player.onGround = false; player.onJello = false;
        player.drillGlideT = 0; player.drillGlideLockX = player.drillGlideLockY = null;
        drilling = null;
        player.tremor = Math.max(player.tremor || 0, 0.10 + 0.22 * Math.sqrt(d.initial / siphon.capacity));
        if (!d.started) {
          d.started = true;
          sfxPlay('jello-slap', { gain: 0.18 + 0.30 * Math.sqrt(d.initial / siphon.capacity), rate: 0.78 });
        }
      }
      d.blocked = sent ? 0 : d.blocked + dt;
    }
    var released = siphonReleasePassenger();
    if ((!siphonTotal() && released) || d.blocked > 0.45 || d.age > 2.5) {
      siphon.dump = null; siphon.equipped = false; siphon.mode = 'suck';
      siphonNotice(siphonTotal() ? 'No room for the rest. Move into open space and dump again.' :
        (!released ? 'The passenger needs more room to get out.' : 'Load released.'));
    }
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
    if (key === 'r' && (siphon.equipped || siphonTotal() > 0 || siphon.passenger)) { if (!e.repeat) siphonCycle(); return true; }
    return false;
  }
  function siphonHit(button, x, y) {
    return x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h;
  }
  function siphonPointerDown(x, y, id, right) {
    if (!siphonAvailable()) return false;
    if (id === 'mouse' && right) {
      siphonDump(); siphon.pointer = id;
      return true;
    }
    for (var b = 0; b < siphonButtons.length; b++) {
      var button = siphonButtons[b];
      if (!siphonHit(button, x, y)) continue;
      if (button.action === 'equip') siphonToggle();
      if (button.action === 'mode') siphonDump();
      if (button.action === 'cycle') siphonCycle();
      return true;
    }
    return false;
  }
  function siphonPointerMove(x, y, id) { return id === siphon.pointer; }
  function siphonPointerUp(id) {
    if (id !== siphon.pointer) return false;
    // Releasing the button never cuts a committed burst short.
    siphonStop(); return true;
  }
  function siphonAim() {
    var cx = player.x + PLAYER_W * 0.5, cy = player.y + PLAYER_H * 0.5;
    return { cx: cx, cy: cy, nx: cx, ny: player.y + PLAYER_H - 4,
      x: cx, y: player.y + PLAYER_H + 10, dx: 0, dy: 1, reach: 48 };
  }
  function siphonTick(dt) {
    siphon.flow = 0;
    siphon.clock += dt;
    siphon.noticeT = Math.max(0, siphon.noticeT - dt);
    var active = (siphon.equipped || siphon.dump) && siphonAvailable();
    if (!siphonAvailable()) siphonStop();
    siphon.power += ((active ? 1 : 0) - siphon.power) * (1 - Math.exp(-dt * (active ? 16 : 10)));
    for (var f = siphon.fx.length - 1; f >= 0; f--) {
      siphon.fx[f].t += dt;
      if (siphon.fx[f].t > siphon.fx[f].life) siphon.fx.splice(f, 1);
    }
    if (!active) return;
    var a = siphonAim();
    if (siphon.dump) { siphonDumpTick(dt); return; }
    if (siphon.mode === 'suck') {
      if (siphonTotal() >= siphon.capacity) siphonNotice('Tank full. DUMP releases the load and launches the rig.');
      siphon.carry += 6200 * siphon.power * dt;
      var count = Math.min(Math.floor(siphon.carry), siphon.capacity - siphonTotal(), 700);
      siphon.carry -= Math.floor(siphon.carry);
      if (count > 0) {
        var samples = [];
        var taken = liquidToolExtract(a.x, a.y, 42, count, { ry: 38, fromX: a.nx, fromY: a.ny, samples: samples });
        var total = 0;
        for (var t = 0; t < taken.length; t++) {
          siphon.tank[t] += taken[t]; total += taken[t];
          if (taken[t] && siphon.tank[siphon.selected] === 0) siphon.selected = t;
        }
        for (var q = 0; q < samples.length && siphon.fx.length < 140; q++) {
          var sample = samples[q];
          siphon.fx.push({ x: sample.x, y: sample.y, type: sample.type,
            t: 0, life: 0.18 + Math.random() * 0.15 });
        }
        siphon.flow = total;
      }
      if (!siphon.passenger) {
        siphon.capture += dt;
        if (siphon.capture > 0.5) {
          var caught = skySlimeCapture(a.x, a.y, 36);
          if (caught) { siphon.passenger = caught; siphonNotice('Passenger secured. Release it on the surface to visit the bathhouse.'); }
          siphon.capture = 0;
        }
      }
    }
  }

  function siphonDraw() {
    if ((!siphon.equipped && !siphon.dump) || !siphonAvailable()) return;
    var a = siphonAim();
    ctx.save(); ctx.lineCap = 'round';
    if (siphon.dump && siphon.dump.started && siphon.dump.age < 0.30) {
      var burst = siphon.dump.age / 0.30;
      ctx.strokeStyle = liquidCatalog[siphon.selected].color;
      ctx.lineWidth = 2.4 * (1 - burst); ctx.globalAlpha = 0.5 * (1 - burst);
      ctx.beginPath(); ctx.ellipse(a.nx, a.ny + 8 + burst * 14, 12 + burst * 35, 4 + burst * 10, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // No tool or reticle. Small curved gusts gather under the chassis.
    if (siphon.mode === 'suck' && siphonTotal() < siphon.capacity && siphon.power > 0.03) {
      ctx.strokeStyle = BLD.waterLight; ctx.lineWidth = 1.2;
      for (var w = 0; w < 7; w++) {
        var theta = Math.PI * (0.05 + w / 6 * 0.90);
        var ex = a.nx + Math.cos(theta) * 42;
        var ey = a.ny + Math.sin(theta) * 49;
        var reach = 1;
        for (var probe = 0.1; probe <= 1; probe += 0.1) {
          if (liquidWorldSolidAt(a.nx + (ex - a.nx) * probe, a.ny + (ey - a.ny) * probe)) {
            reach = Math.max(0, probe - 0.1); break;
          }
        }
        if (reach < 0.15) continue;
        ex = a.nx + (ex - a.nx) * reach; ey = a.ny + (ey - a.ny) * reach;
        var t = (siphon.clock * 2.1 + w * 0.27) % 1;
        var u = Math.min(1, t + 0.24);
        var bend = Math.cos(theta) * 8 * reach;
        ctx.globalAlpha = Math.sin(t * Math.PI) * siphon.power * 0.48;
        ctx.beginPath();
        for (var seg = 0; seg <= 5; seg++) {
          var z = t + (u - t) * seg / 5, ease = z * z;
          var px = ex + (a.nx - ex) * ease + Math.sin(z * Math.PI) * bend;
          var py = ey + (a.ny - ey) * z;
          if (!seg) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    for (var i = 0; i < siphon.fx.length; i++) {
      var f = siphon.fx[i], t = f.t / f.life, ease = t * t;
      var fx = f.x + (a.nx - f.x) * ease, fy = f.y + (a.ny - f.y) * ease - Math.sin(t * Math.PI) * 7;
      ctx.fillStyle = liquidCatalog[f.type].color; ctx.globalAlpha = 1 - t * 0.55;
      ctx.beginPath(); ctx.ellipse(fx, fy, 2.3 * (1 - t * 0.5), 1.4, -Math.PI / 2, 0, Math.PI * 2); ctx.fill();
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
    var expanded = siphon.equipped || siphon.dump || siphon.noticeT > 0 || siphonTotal() > 0 || siphon.passenger;
    var h = expanded ? (isMobile ? 132 : 126) : 42;
    var y = Math.max(56, bottom - h);
    ctx.save();
    if (!expanded) {
      siphonDrawButton(x, y, isMobile ? 106 : 126, 40, isMobile ? 'SCOOP' : 'F  SCOOP', 'equip', false);
      ctx.restore(); return;
    }
    ctx.fillStyle = UIT_PANEL; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.strokeStyle = UIMAT_PLATE_HIGHLIGHT; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    var bw = Math.floor((w - 16) / 3);
    siphonDrawButton(x + 4, y + 4, bw, 36, isMobile ? 'SCOOP' : 'F SCOOP', 'equip', siphon.equipped && siphon.mode === 'suck');
    siphonDrawButton(x + 8 + bw, y + 4, bw, 36, 'DUMP', 'mode', !!siphon.dump);
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
    var hint = siphon.dump ? 'Dumping all liquids. Lift off.' : (siphon.equipped ? 'Scooping below as you move' : 'DUMP all liquids + launch');
    if (isMobile && w < 200) {
      ctx.fillText(siphon.dump ? 'Dumping the load' : (siphon.equipped ? 'Scooping below' : 'DUMP all liquids'), x + 10, y + 109);
      ctx.fillText(siphon.dump ? 'Lift off' : (siphon.equipped ? 'Tap SCOOP to stop' : '+ launch the rig'), x + 10, y + 123);
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
  window.__siphon = { state: siphon, aim: siphonAim, equip: siphonToggle, dump: siphonDump, save: siphonSave,
    restore: siphonRestore, total: siphonTotal, tick: siphonTick };
