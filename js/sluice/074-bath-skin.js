  /* ---- Wet crust: local peeling and the exposed, uneven gel boundary ---- */
  var bathSkinFlakes = [];

  function bathSkinInit(g, saved) {
    var plates = skySlimeCrustPlates(g.s);
    g.skin = plates.map(function (plate, i) {
      var src = saved && saved[i];
      var wet = src ? skySlimeClamp(Number(src.wet) || 0, 0, 1) : g.soak / BATH_VISIT.seconds;
      var peel = src ? skySlimeClamp(Number(src.peel) || 0, 0, 1) : bathSkinPeel(plate, wet);
      return { wet: wet, peel: peel };
    });
    g.s._bathSkin = g.skin;
    g.s._bathMorph = g.skin.reduce(function (sum, patch) { return sum + patch.peel; }, 0) / Math.max(1, g.skin.length);
  }
  function bathSkinPeel(plate, wet) {
    return skySlimeClamp((wet - 0.05 - plate.tough * 0.16) / (0.32 + plate.tough * 0.30), 0, 1);
  }
  function bathSkinTick(g, dt, earning) {
    if (!g.skin) bathSkinInit(g);
    var s = g.s, plates = skySlimeCrustPlates(s), ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    var total = 0, line = s._bathLine === undefined ? bathWaterline() : s._bathLine;
    for (var i = 0; i < g.skin.length; i++) {
      var patch = g.skin[i], plate = plates[i], before = patch.peel;
      if (earning && patch.peel < 1) {
        var y = s.y + (plate.x * sa + plate.y * ca) * s.r / 60;
        var immersed = skySlimeClamp((y - line + 3) / 6, 0, 1);
        // Soaked cracks wick water into the upper coat. The submerged plates
        // loosen first; their individual thickness leaves islands of hard skin.
        var wick = 0.30 + 0.90 * skySlimeClamp((g.soak / BATH_VISIT.seconds - 0.12) / 0.60, 0, 1);
        patch.wet = Math.min(1, patch.wet + dt / BATH_VISIT.seconds * (wick + immersed * (1.8 - wick)));
        patch.peel = Math.max(before, bathSkinPeel(plate, patch.wet));
        if (before < 1 && patch.peel >= 1 && bathMode) bathSkinDetach(s, plate);
      }
      total += patch.peel;
    }
    s._bathMorph = total / Math.max(1, g.skin.length);
  }
  function bathGuestSoakTick(g, dt) {
    var held = bathTool.held === g;
    var earning = !g.paid && !held && g.s.wet > 0.25 && bathCanServe();
    if (earning) { g.served = true; g.soak = Math.min(BATH_VISIT.seconds, g.soak + dt); }
    bathSkinTick(g, dt, earning);
    if (!g.paid && g.soak >= BATH_VISIT.seconds && g.s._bathMorph >= 0.999) bathFinishGuest(g);
  }
  function bathSkinDetach(s, plate) {
    var ca = Math.cos(s.angle), sa = Math.sin(s.angle), scale = s.r / 60;
    var dx = (plate.x * ca - plate.y * sa) * scale, dy = (plate.x * sa + plate.y * ca) * scale;
    if (bathSkinFlakes.length >= 72) bathSkinFlakes.shift();
    bathSkinFlakes.push({ x: s.x + dx, y: s.y + dy, vx: s.vx * 0.25 + dx * 1.4,
      vy: s.vy * 0.15 + dy * 0.6 - 8, angle: s.angle, spin: (plate.tough - 0.5) * 3,
      tone: plate.tone, life: 7, points: plate.points.map(function (p) {
        return { x: (p.x - plate.x) * scale * 0.7, y: (p.y - plate.y) * scale * 0.7 };
      }) });
  }
  function bathSkinFlakeTick(dt) {
    if (!bathSkinFlakes.length) return;
    var c = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]), line = bathWaterline();
    for (var i = bathSkinFlakes.length - 1; i >= 0; i--) {
      var f = bathSkinFlakes[i]; f.life -= dt;
      if (f.life <= 0) { bathSkinFlakes.splice(i, 1); continue; }
      var wet = bathWater > 0 && f.y > line && f.x > c.x0 && f.x < c.x1;
      f.vy += (wet ? 18 : SKY_SLIME_GRAVITY) * dt;
      f.vx *= Math.exp(-dt * (wet ? 2.5 : 0.2)); f.vy *= Math.exp(-dt * (wet ? 2 : 0.1));
      var q = bathToolProject(f.x + f.vx * dt, f.y + f.vy * dt, f.vx, f.vy, 2);
      f.x = q[0]; f.y = q[1]; f.vx = q[2]; f.vy = q[3]; f.angle += f.spin * dt;
    }
  }
  function bathSkinDrawFlakes(c) {
    for (var i = 0; i < bathSkinFlakes.length; i++) {
      var f = bathSkinFlakes[i];
      c.save(); c.globalAlpha *= Math.min(1, f.life); c.translate(f.x, f.y); c.rotate(f.angle);
      c.beginPath();
      for (var j = 0; j < f.points.length; j++) {
        var p = f.points[j]; if (!j) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y * 0.45);
      }
      c.closePath(); c.fillStyle = SKY_SLIME_RAMP[f.tone]; c.fill();
      c.strokeStyle = SKY_SLIME_RAMP[1]; c.lineWidth = 0.6; c.stroke(); c.restore();
    }
  }
  function bathGuestContour(s) {
    var plates = s._bathSkin ? skySlimeCrustPlates(s) : null, pts = [], ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    for (var n = 0; n < 32; n++) {
      var a = n / 32 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), soft = s.bathed ? 1 : 0;
      if (plates && !s.bathed) {
        var x = (dx * ca + dy * sa) * 57, y = (-dx * sa + dy * ca) * 57, best = Infinity;
        for (var i = 0; i < plates.length; i++) {
          var pdx = x - plates[i].x, pdy = y - plates[i].y, d = pdx * pdx + pdy * pdy;
          if (d < best) { best = d; soft = skySlimeClamp((s._bathSkin[i].peel - 0.45) / 0.55, 0, 1); }
        }
      }
      var radial = s.r * (1 + soft * (-0.06 + 0.045 * Math.sin(a * 3 + s.seed * 6.28) +
        0.025 * Math.cos(a * 5 - s.seed * 9) + (1 - (s._bathMorph || 0)) *
        (0.09 * Math.sin(s.age * 3.2 + a * 2) + Math.max(0, dy) * 0.07)));
      pts.push({ x: s.x + dx * radial, y: s.y + dy * radial });
    }
    return pts;
  }
  function bathGuestBoundary(s, oldContour, dt) {
    var contour = bathGuestContour(s), pts = [], hw = 0, hh = 0;
    for (var i = 0; i < contour.length; i++) {
      var p = contour[i], old = oldContour && oldContour[i];
      pts.push(p.x, p.y, old ? skySlimeClamp((p.x - old.x) / dt, -650, 650) : s.vx,
        old ? skySlimeClamp((p.y - old.y) / dt, -650, 650) : s.vy);
      hw = Math.max(hw, Math.abs(p.x - s.x)); hh = Math.max(hh, Math.abs(p.y - s.y));
    }
    return { x: s.x, y: s.y, hw: hw, hh: hh, vx: s.vx, vy: s.vy, mvx: s.vx, mvy: s.vy, pts: pts };
  }
