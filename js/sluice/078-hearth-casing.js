  // Shared foundry ironwork: curved refractory bowl, cast rim and ash drawer.
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
  // The basin itself is the curved ceiling. Smooth cheeks sweep into a broad
  // level grate so fuel can spread into a low bed instead of a narrow pile.
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
      if (box.bowl) {
        // Continue the same ellipse all the way to the copper, without a
        // second hand-shaped shoulder curve or a kink at the physical slice.
        var bowl = box.bowl, left = [], right = [];
        for (var n = 0; n < 16; n++) {
          var angle = Math.PI / 6 * n / 16;
          var inset = bowl.w * HEARTH_BOWL_INSET * (1 - Math.cos(angle));
          var py = bowl.y + bowl.h * Math.sin(angle);
          left.push([bowl.x + inset, py]); right.push([bowl.x + bowl.w - inset, py]);
        }
        sides = left.concat(sides, right.reverse());
      } else {
        // Meet the sampled physical curve with the same tangent. The upper
        // cheeks sweep into the tub shoulders without an angular elbow.
        var lowerSlope = (physical[1][1] - physical[0][1]) * h / HEARTH_HEIGHT /
          ((physical[1][0] - physical[0][0]) * w / HEARTH_WIDTH);
        function shoulderCurve(shoulder, foot, direction) {
          var dx = (foot[0] - shoulder[0]) * direction, dy = foot[1] - shoulder[1];
          var rise = Math.max(0, Math.min(dy * 0.42, dx * lowerSlope * 0.7));
          var c1 = [shoulder[0] + dx * direction * 0.35, shoulder[1] + dy * 0.32];
          var c2 = [foot[0] - rise / lowerSlope * direction, foot[1] - rise], path = [];
          for (var n = 0; n < 16; n++) {
            var t = n / 16, u = 1 - t;
            path.push([u*u*u*shoulder[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*foot[0],
              u*u*u*shoulder[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*foot[1]]);
          }
          return path;
        }
        var left = shoulderCurve(roof[roof.length - 1], sides[0], 1);
        var right = shoulderCurve(roof[0], sides[sides.length - 1], -1);
        sides = left.concat(sides, right.reverse());
      }
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
    // Space rivets along the curve by distance, independent of the collision
    // samples. A few flush straps join the casting without adding hard corners.
    var lengths = [0];
    for (var i = 1; i < points.length; i++) lengths.push(lengths[i - 1] +
      Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    var total = lengths[lengths.length - 1], count = Math.max(4, Math.floor(total / (72 * s)));
    for (var j = 0, segment = 1; j < count; j++) {
      var distance = total * (j + 0.5) / count;
      while (segment < points.length - 1 && lengths[segment] < distance) segment++;
      var a = points[segment - 1], b = points[segment];
      var t = (distance - lengths[segment - 1]) / Math.max(0.001, lengths[segment] - lengths[segment - 1]);
      var px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      if (j % 5 === 2) {
        c.save(); c.translate(px, py); c.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
        c.fillStyle = BLD.outline; c.fillRect(-7 * s, -8 * s, 14 * s, 16 * s);
        c.fillStyle = BLD.metalDark; c.fillRect(-6 * s, -6 * s, 12 * s, 12 * s);
        c.fillStyle = BLD.metalBase; c.fillRect(-6 * s, -6 * s, 12 * s, s);
        hearthIronBolt(c, 0, 0, 2.1 * s); c.restore();
      } else hearthIronBolt(c, px, py, 2.1 * s);
    }
    // The ash drawer spans the wider, level coal bed.
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
