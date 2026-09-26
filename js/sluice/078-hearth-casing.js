  // Shared foundry ironwork: the bath inset and working view use the same
  // aperture, cast rim, hinge barrels and removable ash drawer.
  function hearthChamfer(c, x, y, w, h, cut) {
    c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + w - cut, y);
    c.lineTo(x + w, y + cut); c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h); c.lineTo(x + cut, y + h);
    c.lineTo(x, y + h - cut); c.lineTo(x, y + cut); c.closePath();
  }
  function hearthIronBolt(c, x, y, radius) {
    c.fillStyle = BLD.outline; c.beginPath(); c.arc(x, y, radius + 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.metalBase; c.beginPath(); c.arc(x, y - 0.5, radius, 0, Math.PI * 2); c.fill();
    c.strokeStyle = BLD.metalLight; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x - radius * 0.6, y - radius * 0.5); c.lineTo(x + radius * 0.4, y - radius * 0.5); c.stroke();
    c.strokeStyle = BLD.outline;
    c.beginPath(); c.moveTo(x - radius * 0.5, y + radius * 0.4); c.lineTo(x + radius * 0.5, y - radius * 0.4); c.stroke();
  }
  // The basin itself is the curved ceiling. Below it, two refractory cheeks
  // taper through broad knees to a short, level grate, like a built-in furnace.
  function hearthCasingProfile(box, integrated) {
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var sides = [], physical = HEARTH_CHAMBER_PROFILE;
    for (var i = 0; i < physical.length; i++) sides.push([
      x + physical[i][0] * w / HEARTH_WIDTH, y + (physical[i][1] - HEARTH_TOP) * h / HEARTH_HEIGHT]);
    for (var i = physical.length - 1; i >= 0; i--) sides.push([
      x + w - physical[i][0] * w / HEARTH_WIDTH, y + (physical[i][1] - HEARTH_TOP) * h / HEARTH_HEIGHT]);
    var roof = [], ceiling = y;
    if (integrated) {
      var F = BATH_FLOORS[0], curve = bathTubCurve(F, F.tubs[0]);
      for (var i = 0; i <= 64; i++) {
        var p = bathRimPoint(curve, curve.x0 + (curve.x1 - curve.x0) * (0.94 - i / 64 * 0.88), 24);
        roof.push([(p.x - cam.x) * worldScale, (p.y - cam.y) * worldScale]);
        ceiling = Math.min(ceiling, roof[i][1]);
      }
      sides.unshift(roof[roof.length - 1]); sides.push(roof[0]);
    } else roof = [sides[sides.length - 1], sides[0]];
    return { sides: sides, roof: roof, ceiling: ceiling };
  }
  function hearthCasingPath(c, profile, closed) {
    var points = profile.sides;
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    if (closed) {
      for (var i = 0; i < profile.roof.length; i++) c.lineTo(profile.roof[i][0], profile.roof[i][1]);
      c.closePath();
    }
  }
  function hearthDrawCasing(c, box, bed, hover, integrated) {
    var s = Math.max(0.4, Math.min(1.15, box.w / HEARTH_WIDTH));
    var profile = hearthCasingProfile(box, integrated), points = profile.sides;
    hearthDrawFirebox(c, bed, box.x, box.y, box.w, box.h, hearthToolTime, { profile: profile });
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    // Stepped stone backing, dark cast iron and a fine worn edge. The open
    // mouth stays uninterrupted, with the copper tub forming its upper rim.
    hearthCasingPath(c, profile, !integrated);
    c.strokeStyle = BLD.outline; c.lineWidth = 26 * s; c.stroke();
    c.strokeStyle = BLD.stoneDark; c.lineWidth = 22 * s; c.stroke();
    c.strokeStyle = BLD.stoneBase; c.lineWidth = 19 * s; c.stroke();
    c.strokeStyle = BLD.outline; c.lineWidth = 16 * s; c.stroke();
    var iron = c.createLinearGradient(0, profile.ceiling, 0, box.y + box.h);
    iron.addColorStop(0, BLD.metalBase); iron.addColorStop(0.6, BLD.metalDark);
    iron.addColorStop(1, BLD.metalBase);
    c.strokeStyle = iron; c.lineWidth = 12 * s; c.stroke();
    c.strokeStyle = hover ? BLD.goldDark : BLD.metalLight; c.lineWidth = 1 * s; c.stroke();
    // Bolted joints follow the angled casting, with broad plates at the knees.
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
      var length = Math.hypot(dx, dy), count = Math.max(1, Math.floor(length / (76 * s)));
      for (var j = 0; j < count; j++) {
        var t = (j + 0.5) / count;
        hearthIronBolt(c, a[0] + dx * t, a[1] + dy * t, 2.1 * s);
      }
      if (i > 0) {
        c.save(); c.translate(a[0], a[1]); c.rotate(Math.atan2(dy, dx));
        c.fillStyle = BLD.outline; c.fillRect(-9 * s, -8 * s, 18 * s, 16 * s);
        c.fillStyle = BLD.metalDark; c.fillRect(-8 * s, -6 * s, 16 * s, 12 * s);
        c.fillStyle = BLD.metalBase; c.fillRect(-8 * s, -6 * s, 16 * s, s);
        hearthIronBolt(c, -4 * s, 0, 1.6 * s); hearthIronBolt(c, 4 * s, 0, 1.6 * s);
        c.restore();
      }
    }
    // A compact ash drawer sits directly beneath the real level coal bed.
    var inset = hearthChamberInset(HEARTH_FLOOR) * box.w / HEARTH_WIDTH;
    var gx = box.x + inset, gy = box.y + box.h + 10 * s, gw = box.w - inset * 2;
    c.fillStyle = BLD.outline; hearthChamfer(c, gx - 8 * s, gy, gw + 16 * s, 22 * s, 4 * s); c.fill();
    c.fillStyle = BLD.metalDark; c.fillRect(gx - 5 * s, gy + 3 * s, gw + 10 * s, 15 * s);
    c.fillStyle = BLD.metalBase; c.fillRect(gx - 5 * s, gy + 3 * s, gw + 10 * s, s);
    for (var vent = 8 * s; vent < gw - 6 * s; vent += 17 * s) {
      c.fillStyle = BLD.outline; c.fillRect(gx + vent, gy + 7 * s, 9 * s, 3 * s);
    }
    var mid = gx + gw / 2;
    c.fillStyle = BLD.metalDark; c.fillRect(mid - 23 * s, gy + 5 * s, 46 * s, 12 * s);
    c.strokeStyle = BLD.metalLight; c.lineWidth = 2 * s;
    c.beginPath(); c.moveTo(mid - 16 * s, gy + 6 * s); c.lineTo(mid - 16 * s, gy + 14 * s);
    c.lineTo(mid + 16 * s, gy + 14 * s); c.lineTo(mid + 16 * s, gy + 6 * s); c.stroke();
    c.restore();
  }
