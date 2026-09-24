  /* ---- Ceiling tools: one captured pointer, a travelling hoist, real water ---- */
  var bathTool = { mode: '', x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
    railX: 0, tilt: 0, tiltV: 0, jaw: 1, pointer: null, held: null,
    valve: false, spraying: false, touchInput: null, flow: 0, output: 0, bank: 0,
    shower: false, rope: [], grab: false, grabT: 0 };

  function bathToolBounds() {
    var F = BATH_FLOORS[0], c = bathTubCurve(F, F.tubs[0]);
    var top = c.y0 - 182;
    if (typeof cam !== 'undefined' && bathMode && worldScale > 0)
      top = cam.y + (hearthRoomLayout().scene.y + 28) / worldScale;
    return { left: 19.5 * TILE, right: c.x1 + 48, top: top,
      bottom: c.y0 + c.D - 24, curve: c, floor: F.fr * TILE };
  }
  function bathToolRelease(quiet) {
    var t = bathTool;
    if (t.held) {
      if (quiet) { t.held.s.vx = 0; t.held.s.vy = 0; }
      t.held = null;
      if (!quiet) sfxPlay('ui-click');
    }
    t.grab = false; t.grabT = 0;
  }
  function bathToolCancel() {
    var t = bathTool, id = t.pointer;
    t.pointer = null; t.valve = false; t.spraying = false; t.flow = 0; t.output = 0; t.bank = 0;
    t.tx = t.x; t.ty = t.y; t.vx = t.vy = 0;
    bathToolRelease(true);
    if (id !== null) try { canvas.releasePointerCapture(id); } catch (ignore) {}
  }
  function bathToolReset() {
    bathToolCancel(); bathTool.mode = ''; bathTool.rope = [];
  }
  function bathToolSelect(mode) {
    if (!bathMode || hearthView !== 'bath' || bathFading || gamePaused) return;
    var t = bathTool, next = t.mode === mode ? '' : mode;
    bathToolReset(); bathPtrDown = false; hearthClearBoilerHover();
    t.mode = next;
    bathScrollT = 1e9; bathCamY = -1;
    var b = bathToolBounds();
    t.x = t.tx = (b.curve.x0 + b.curve.x1) / 2;
    t.y = t.ty = b.curve.y0 - 64; t.railX = t.x;
    t.tilt = t.tiltV = 0; t.jaw = 1;
    bathNoticeT = 0;
    sfxPlay('ui-click');
  }
  function bathToolAction(action) {
    if (action === 'claw' || action === 'hose') bathToolSelect(action);
    else if (action === 'tool-grip' && bathTool.mode === 'claw') {
      if (bathTool.held) { bathToolRelease(false); saveNow('bath-drop'); }
      else { bathTool.grab = true; bathTool.grabT = 0.65; sfxPlay('ui-click'); }
    }
    else if (action === 'tool-valve' && bathTool.mode === 'hose') { bathTool.valve = !bathTool.valve; sfxPlay('ui-click'); }
    else if (action === 'tool-spray' && bathTool.mode === 'hose') { bathTool.shower = !bathTool.shower; sfxPlay('ui-click'); }
  }
  function bathToolAim(e) {
    var p = bathClientToWorld(e);
    if (!p) return;
    var b = bathToolBounds();
    bathTool.tx = Math.max(b.left, Math.min(b.right, p.x));
    bathTool.ty = Math.max(b.top + 46, Math.min(b.bottom, p.y));
  }
  function bathToolRememberInput(e) {
    bathTool.touchInput = e.pointerType === 'touch' || e.pointerType === 'pen';
  }
  function bathToolTouchControls() {
    return bathTool.touchInput === null ? typeof isMobile !== 'undefined' && isMobile : bathTool.touchInput;
  }
  function bathToolPointerInRoom(e) {
    var p = hearthCSSPoint(e);
    return hearthContains(hearthRoomLayout().scene, p.x, p.y) &&
      !hearthButtons.some(function (b) { return hearthContains(b, p.x, p.y); }) &&
      !(p.x >= 8 && p.x <= 52 && p.y >= 3 && p.y <= 47);
  }
  function bathToolPointerDown(e) {
    var t = bathTool;
    if (!bathMode || hearthView !== 'bath' || !t.mode || gamePaused || bathFading) return false;
    if (t.pointer !== null || e.button > 0) return true;
    if (!bathToolPointerInRoom(e)) return false;
    bathToolRememberInput(e);
    t.pointer = e.pointerId;
    bathPtrDown = false; hearthClearBoilerHover();
    bathToolAim(e); hearthCapture(e);
    if (!bathToolTouchControls()) {
      if (t.mode === 'claw') bathToolAction('tool-grip');
      else t.spraying = true;
    }
    return true;
  }
  function bathToolPointerMove(e) {
    var t = bathTool;
    if (!bathMode || hearthView !== 'bath' || !t.mode || gamePaused || bathFading) return false;
    if (t.pointer !== null) {
      if (t.pointer === e.pointerId) bathToolAim(e);
      return true;
    }
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || hearthPress || hearthDrag || !bathToolPointerInRoom(e)) return false;
    bathToolRememberInput(e); bathToolAim(e); hearthClearBoilerHover();
    return true;
  }
  function bathToolPointerUp(e) {
    if (bathTool.pointer === null) return false;
    if (bathTool.pointer === e.pointerId) {
      bathToolAim(e); bathTool.pointer = null; bathTool.spraying = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (ignore) {}
      saveNow('bath-tool');
    }
    return true;
  }
  function bathToolHint() {
    var touch = bathToolTouchControls();
    if (bathTool.mode === 'claw') return touch ?
      'Drag to move. Tap GRAB to pick up a slime, then DROP to let go.' :
      'Move the mouse to aim. Click to grab a slime; click again to drop it.';
    if (bathTool.mode === 'hose') return bathWaterCount() + bathPour < 1 ?
      'Hose empty. Bring scooped water in your tank.' : touch ?
      'Drag to aim. Tap POUR to start the water; STOP turns it off.' :
      'Move the mouse to aim. Hold click to pour; release to stop.';
    return 'Drag coal into the boiler below. Use CLAW or HOSE above the bath.';
  }
  function bathToolDrawControls(c, slots) {
    var t = bathTool;
    hearthButton(c, slots[0], t.mode === 'claw' ? 'CLAW ON' : 'CLAW', 'claw', t.mode === 'claw');
    hearthButton(c, slots[1], t.mode === 'hose' ? 'HOSE ON' : 'HOSE', 'hose', t.mode === 'hose');
    if (t.mode === 'claw') {
      var grip = { x: slots[2].x, y: slots[2].y, w: slots[3].x + slots[3].w - slots[2].x, h: 44 };
      hearthButton(c, grip, t.held ? 'DROP SLIME' : 'GRAB SLIME', 'tool-grip', !!t.held);
    } else if (t.mode === 'hose') {
      hearthButton(c, slots[2], t.valve ? 'STOP' : 'POUR', 'tool-valve', t.valve);
      hearthButton(c, slots[3], t.shower ? 'SHOWER' : 'JET', 'tool-spray', false);
    }
  }
  function bathToolRopeStep(h, b) {
    var t = bathTool, rope = t.rope, n = 18, ax = t.railX, ay = b.top;
    if (!rope.length) for (var i = 0; i <= n; i++) {
      var x = ax + (t.x - ax) * i / n, y = ay + (t.y - ay) * i / n;
      rope.push({ x: x, y: y, ox: x, oy: y });
    }
    for (var i = 1; i < n; i++) {
      var p = rope[i], x = p.x, y = p.y;
      p.x += (p.x - p.ox) * 0.97; p.y += (p.y - p.oy) * 0.97 + 300 * h * h;
      p.ox = x; p.oy = y;
    }
    var length = (Math.hypot(t.x - ax, t.y - ay) + (t.mode === 'hose' ? 40 : 3)) / n;
    for (var pass = 0; pass < 8; pass++) {
      rope[0].x = ax; rope[0].y = ay; rope[n].x = t.x; rope[n].y = t.y;
      for (var i = 0; i < n; i++) {
        var a = rope[i], p = rope[i + 1], dx = p.x - a.x, dy = p.y - a.y;
        var d = Math.max(0.01, Math.hypot(dx, dy)), k = (d - length) / d;
        if (i > 0) { a.x += dx * k * 0.5; a.y += dy * k * 0.5; }
        if (i + 1 < n) { p.x -= dx * k * 0.5; p.y -= dy * k * 0.5; }
      }
    }
    rope[0].x = ax; rope[0].y = ay; rope[n].x = t.x; rope[n].y = t.y;
  }
  function bathToolTick(dt) {
    var t = bathTool; t.output = 0;
    if (!bathMode || hearthView !== 'bath' || !t.mode || bathFading || gamePaused) return;
    var b = bathToolBounds(), steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (var n = 0; n < steps; n++) {
      t.vx += ((t.tx - t.x) * 150 - t.vx * 23) * h;
      t.vy += ((t.ty - t.y) * 150 - t.vy * 23) * h;
      var speed = Math.hypot(t.vx, t.vy), limit = 620;
      if (speed > limit) { t.vx *= limit / speed; t.vy *= limit / speed; }
      t.x += t.vx * h; t.y += t.vy * h;
      // The head collides with the same curved copper liner as the particles.
      var q = bathToolProject(t.x, t.y, t.vx, t.vy, t.mode === 'claw' ? 21 : 16);
      t.x = q[0]; t.y = q[1]; t.vx = q[2]; t.vy = q[3];
      t.railX += (t.x - t.railX) * (1 - Math.exp(-h * 14));
      var tiltTarget = Math.max(-0.85, Math.min(0.85, t.vx / 350));
      t.tiltV += ((tiltTarget - t.tilt) * 80 - t.tiltV * 12) * h;
      t.tilt += t.tiltV * h;
      bathToolRopeStep(h, b);
    }
    if (t.mode === 'claw' && !t.held && t.grab) {
      var best = null, distance = Infinity;
      for (var i = 0; i < bathGuests.length; i++) {
        var g = bathGuests[i], d = Math.hypot(g.s.x - t.x, g.s.y - (t.y + 30));
        if (!g.paid && d < g.s.r + 27 && d < distance) { best = g; distance = d; }
      }
      if (best) {
        t.held = best; best.manual = true; best.hop = null; best.st = 'play';
        best.s.settled = false; sfxPlay('ui-confirm');
      }
    }
    t.grabT = Math.max(0, t.grabT - dt);
    if (!t.grabT || t.held) t.grab = false;
    t.jaw += ((t.held || t.grab ? 0 : 1) - t.jaw) * (1 - Math.exp(-dt * 14));
    var running = t.mode === 'hose' && (t.valve || t.spraying);
    t.flow += ((running ? 1 : 0) - t.flow) * (1 - Math.exp(-dt * (running ? 9 : 20)));
    if (t.mode !== 'hose' || t.flow < 0.02) return;
    t.bank = Math.min(400, t.bank + dt * (t.shower ? 2000 : 3200) * t.flow);
    var available = Math.floor(bathPour + bathWaterCount());
    var wanted = Math.min(Math.floor(t.bank), available, Math.max(0, BATH_MAX_WATER - bathWater));
    t.bank -= Math.floor(t.bank);
    var emitted = 0, lanes = t.shower ? 5 : 1;
    for (var lane = 0; lane < lanes; lane++) {
      var angle = t.tilt + (lane - (lanes - 1) / 2) * 0.17;
      var dx = Math.sin(angle), dy = Math.cos(angle), speed = t.shower ? 175 : 430;
      var amount = Math.floor(wanted / lanes) + (lane < wanted % lanes ? 1 : 0);
      emitted += liquidToolEmit(0, amount, t.x + dx * 25 + (lane - (lanes - 1) / 2) * 4,
        t.y + dy * 25, dx * speed + t.vx * 0.22, dy * speed + t.vy * 0.12);
    }
    // Debit only accepted particles. Queued ADD WATER is already paid for.
    var queued = Math.min(bathPour, emitted); bathPour -= queued;
    if (emitted > queued) bathTakeWater(emitted - queued);
    t.output = emitted;
    if (emitted) {
      bathHeat *= bathWater / Math.max(1, bathWater + emitted);
      for (var i = 0; i < bathGuests.length; i++) {
        var g = bathGuests[i], dx = Math.sin(t.tilt), dy = Math.cos(t.tilt);
        var along = (g.s.x - t.x) * dx + (g.s.y - t.y) * dy;
        var across = Math.abs((g.s.x - t.x) * dy - (g.s.y - t.y) * dx);
        if (!g.paid && along > 15 && along < 260 && across < g.s.r + 14 + (t.shower ? along * 0.3 : 0)) {
          g.manual = true; g.hop = null;
        }
      }
    }
    if (!available) { t.valve = false; t.flow = 0; }
  }
  function bathToolProject(x, y, vx, vy, r) {
    var b = bathToolBounds(), c = b.curve;
    x = Math.max(b.left + r, Math.min(b.right - r, x));
    y = Math.max(b.top + 28 + r, y);
    if (x >= c.x0 && x <= c.x1) return bathProjectWater(x, y, vx, vy, r);
    if (y > b.floor - r) { y = b.floor - r; vy = Math.min(0, vy); vx *= 0.9; }
    return [x, y, vx, vy];
  }
  function bathToolGuestTick(g, dt) {
    var s = g.s, t = bathTool, held = t.held === g;
    var b = bathToolBounds(), c = b.curve, line = bathWaterline();
    var steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (var n = 0; n < steps; n++) {
      var inBowl = s.x > c.x0 + s.r && s.x < c.x1 - s.r;
      var wet = inBowl && bathWater > 0 ? Math.max(0, Math.min(1, (s.y + s.r - line) / (2 * s.r))) : 0;
      s.vy += 300 * (1 - 1.9 * wet) * h;
      if (held) {
        s.vx += ((t.x - s.x) * 180 - s.vx * 22) * h;
        s.vy += ((t.y + s.r + 8 - s.y) * 180 - s.vy * 22) * h;
      }
      s.vx *= Math.exp(-h * (0.45 + wet * 2.8)); s.vy *= Math.exp(-h * wet * 2.4);
      // The hose pushes guests along its live stream; their boundary pushes water.
      if (t.mode === 'hose' && t.output > 0) {
        var dx = Math.sin(t.tilt), dy = Math.cos(t.tilt);
        var along = (s.x - t.x) * dx + (s.y - t.y) * dy;
        var across = Math.abs((s.x - t.x) * dy - (s.y - t.y) * dx);
        if (along > 15 && along < 260 && across < s.r + 14 + (t.shower ? along * 0.3 : 0)) {
          s.vx += dx * 220 * t.flow * h; s.vy += dy * 220 * t.flow * h;
        }
      }
      s.vx = Math.max(-650, Math.min(650, s.vx)); s.vy = Math.max(-650, Math.min(650, s.vy));
      var q = bathToolProject(s.x + s.vx * h, s.y + s.vy * h, s.vx, s.vy, s.r);
      s.x = q[0]; s.y = q[1]; s.vx = q[2]; s.vy = q[3];
      s.wet = wet;
    }
    // Keep two guests from occupying the same fluid boundary.
    for (var i = 0; i < bathGuests.length; i++) {
      var other = bathGuests[i]; if (other === g) continue;
      var dx = s.x - other.s.x, dy = s.y - other.s.y, d = Math.hypot(dx, dy), gap = s.r + other.s.r;
      if (d > 0.01 && d < gap) {
        var q = bathToolProject(s.x + dx / d * (gap - d), s.y + dy / d * (gap - d), s.vx, s.vy, s.r);
        s.x = q[0]; s.y = q[1];
      }
    }
    if (!held && s.wet > 0.25) {
      g.st = 'soak';
      if (bathCanServe()) { g.served = true; g.soak = Math.min(BATH_VISIT.seconds, g.soak + dt); }
      if (g.soak >= BATH_VISIT.seconds) { g.manual = false; bathFinishGuest(g); }
    } else g.st = held || s.wet > 0 || Math.hypot(s.vx, s.vy) > 10 ? 'play' : 'wait';
    s.settled = !held && Math.hypot(s.vx, s.vy) < 3;
    return true;
  }
  function bathToolCollider() {
    if (!bathMode || hearthView !== 'bath' || !bathTool.mode || bathFading) return;
    var t = bathTool, r = t.mode === 'claw' ? 17 : 12;
    bathGuestColliders.push({ x: t.x, y: t.y, hw: r, hh: r, vx: t.vx, vy: t.vy, pts: null });
    if (t.mode === 'claw') for (var side = -1; side <= 1; side += 2) {
      var x = side * (13 + t.jaw * 18), y = 36;
      bathGuestColliders.push({ x: t.x + x * Math.cos(t.tilt) + y * Math.sin(t.tilt),
        y: t.y - x * Math.sin(t.tilt) + y * Math.cos(t.tilt),
        hw: 7, hh: 7, vx: t.vx, vy: t.vy, pts: null });
    }
  }
  function bathToolDraw(c, preview) {
    var t = preview || bathTool;
    if (!t.mode) return;
    var b = bathToolBounds(), rope = t.rope;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.fillStyle = BLD.outline; c.fillRect(b.left - 14, b.top - 17, b.right - b.left + 28, 18);
    c.fillStyle = BLD.metalBase; c.fillRect(b.left - 12, b.top - 15, b.right - b.left + 24, 12);
    c.fillStyle = BLD.metalPale; c.fillRect(b.left - 12, b.top - 15, b.right - b.left + 24, 2);
    for (var x = b.left; x < b.right; x += 64) { c.fillStyle = BLD.outline; c.fillRect(x, b.top - 12, 3, 3); }
    c.fillStyle = BLD.outline; c.fillRect(t.railX - 23, b.top - 21, 46, 31);
    c.fillStyle = BLD.goldDark; c.fillRect(t.railX - 20, b.top - 18, 40, 25);
    c.fillStyle = BLD.goldPale; c.fillRect(t.railX - 19, b.top - 18, 38, 2);
    for (var side = -1; side <= 1; side += 2) {
      c.fillStyle = BLD.metalDark; c.beginPath(); c.arc(t.railX + side * 14, b.top - 10, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = BLD.metalPale; c.beginPath(); c.arc(t.railX + side * 14, b.top - 10, 2, 0, Math.PI * 2); c.fill();
    }
    if (rope.length) {
      c.beginPath(); c.moveTo(rope[0].x, rope[0].y);
      for (var i = 1; i < rope.length; i++) c.lineTo(rope[i].x, rope[i].y);
      c.strokeStyle = BLD.outline; c.lineWidth = t.mode === 'hose' ? 12 : 6; c.stroke();
      c.strokeStyle = t.mode === 'hose' ? BLD.woodDark : BLD.metalPale;
      c.lineWidth = t.mode === 'hose' ? 8 : 3; c.stroke();
      if (t.mode === 'hose') { c.strokeStyle = BLD.goldDark; c.lineWidth = 2; c.stroke(); }
      else for (var i = 1; i < rope.length; i++) {
        var a = rope[i - 1], p = rope[i], length = Math.hypot(p.x - a.x, p.y - a.y);
        for (var k = 0; k < length; k += 9) {
          c.strokeStyle = BLD.metalLight; c.lineWidth = 1.5; c.beginPath();
          c.ellipse(a.x + (p.x - a.x) * k / length, a.y + (p.y - a.y) * k / length, 3, 5,
            -Math.atan2(p.x - a.x, p.y - a.y), 0, Math.PI * 2); c.stroke();
        }
      }
    }
    c.translate(t.x, t.y); c.rotate(-t.tilt);
    c.fillStyle = BLD.outline; c.fillRect(-15, -13, 30, 26);
    c.fillStyle = BLD.metalBase; c.fillRect(-12, -11, 24, 22);
    c.fillStyle = BLD.metalPale; c.fillRect(-11, -11, 22, 3);
    c.fillStyle = BLD.goldBase; c.fillRect(-8, -3, 16, 7);
    if (t.mode === 'claw') {
      var spread = 16 + t.jaw * 18;
      for (var side = -1; side <= 1; side += 2) {
        c.beginPath(); c.moveTo(side * 11, 4); c.lineTo(side * spread, 21);
        c.lineTo(side * (spread - 3), 41); c.lineTo(side * (spread - 14), 48);
        c.strokeStyle = BLD.outline; c.lineWidth = 10; c.stroke();
        c.strokeStyle = BLD.metalLight; c.lineWidth = 6; c.stroke();
        c.strokeStyle = BLD.goldPale; c.lineWidth = 1; c.stroke();
      }
    } else {
      c.fillStyle = BLD.outline; c.fillRect(-10, 8, 20, 18);
      c.fillStyle = BLD.goldDark; c.fillRect(-8, 9, 16, 14);
      c.fillStyle = BLD.goldPale; c.fillRect(-8, 21, 16, 2);
      c.fillStyle = BLD.metalDark; c.fillRect(-7, 24, 14, 3);
      c.fillStyle = t.flow > 0.05 ? BLD.waterLight : BLD.metalDark;
      c.fillRect(-3, -1, 6, 5);
    }
    c.restore();
  }

  // CPU fallback uses the same circular moving boundaries as the GPU registry.
  function bathToolProjectLiquid(x, y, vx, vy, r) {
    for (var i = 0; i < bathGuestColliders.length; i++) {
      var g = bathGuestColliders[i], dx = x - g.x, dy = y - g.y;
      var distance = Math.hypot(dx, dy), radius = g.hw + r;
      if (distance >= radius) continue;
      var nx = distance > 0.001 ? dx / distance : 0;
      var ny = distance > 0.001 ? dy / distance : -1;
      x = g.x + nx * radius; y = g.y + ny * radius;
      var inward = Math.min(0, (vx - g.vx) * nx + (vy - g.vy) * ny);
      vx -= nx * inward; vy -= ny * inward;
    }
    return [x, y, vx, vy];
  }
