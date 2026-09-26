  /* ---- Visible return of saved bath liquid ----
     Pending drops stay in the ordinary parked store. Saving, evaporation,
     scooping and leaving midway all retain the same single source of mass. */
  var bathArrival = null;
  function bathArrivalReset() { bathArrival = null; }
  function bathArrivalContains(r, x, y) {
    return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  }
  function bathArrivalEach(r, visit) {
    for (var bx = Math.floor(r.x0 / 256); bx <= Math.floor(r.x1 / 256); bx++) {
      for (var by = Math.floor(r.y0 / 256); by <= Math.floor(r.y1 / 256); by++) {
        var key = bx + ':' + by, data = mineralLiquidParked[key];
        if (data) visit(data, key);
      }
    }
  }
  function bathArrivalBegin() {
    var rooms = [];
    for (var f = 0; f < BATH_FLOORS.length; f++) {
      var F = BATH_FLOORS[f];
      for (var b = 0; b < F.tubs.length; b++) {
        var tub = F.tubs[b];
        rooms.push({ x0: tub[0] * TILE, x1: (tub[1] + 1) * TILE,
          y0: (F.fr - F.lip - 1) * TILE, y1: (F.fr + F.sink + 1) * TILE,
          floor: f, curve: bathTubCurve(F, tub), top: Infinity, bottom: -Infinity,
          left: Infinity, right: -Infinity, total: 0, remaining: 0,
          age: 0, phase: 0, tail: 0, emitted: 0, types: [0, 0, 0, 0, 0] });
      }
    }
    liquidToolSync();
    // A quick return may still have live water. Repark it through the normal
    // ordered journal, so all entries get the same reveal without duplication.
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidOrigin[i] !== 0 || liquidType[i] > 4) continue;
      for (var j = 0; j < rooms.length; j++) if (bathArrivalContains(rooms[j], liquidX[i], liquidY[i])) {
        mineralLiquidPark(liquidType[i], liquidX[i], liquidY[i]); removeLiquidParticle(i); break;
      }
    }
    rooms.forEach(function (r) {
      bathArrivalEach(r, function (data) {
        for (var p = 0; p < data.length; p += 3) {
          var x = data[p + 1], y = data[p + 2];
          if (!bathArrivalContains(r, x, y)) continue;
          r.total++; r.types[data[p]]++;
          r.top = Math.min(r.top, y); r.bottom = Math.max(r.bottom, y);
          r.left = Math.min(r.left, x); r.right = Math.max(r.right, x);
        }
      });
      r.remaining = r.total;
      r.duration = 1.65 + 0.6 * Math.min(1, Math.sqrt(r.total / 45000));
      r.type = r.types.indexOf(Math.max.apply(null, r.types));
    });
    bathArrival = rooms.filter(function (r) { return r.total > 0; });
    if (!bathArrival.length) bathArrival = null;
    mineralLiquidClock = 0;
  }
  function bathArrivalHolds(x, y) {
    if (!bathMode || !bathArrival) return false;
    for (var i = 0; i < bathArrival.length; i++) {
      var r = bathArrival[i];
      if (r.remaining > 0 && bathArrivalContains(r, x, y)) return true;
    }
    return false;
  }
  function bathArrivalVisibleWater(total) {
    if (!bathMode || !bathArrival) return total;
    var pending = 0;
    for (var i = 0; i < bathArrival.length; i++) {
      var r = bathArrival[i]; if (r.floor !== 0 || !r.remaining) continue;
      pending += mineralLiquidParkedSampleRect(r.x0, r.y0, r.x1, r.y1)[0];
    }
    return Math.max(0, total - pending);
  }
  function bathArrivalFront(r, x) {
    var center = (r.left + r.right) * 0.5, half = Math.max(1, (r.right - r.left) * 0.5);
    return r.bottom + 8 * Math.abs((x - center) / half) - r.phase * (r.bottom - r.top + 8);
  }
  function bathArrivalSurface(r) {
    // Locate dense, visible water for the few arrival beads. The CPU mirror
    // updates less often than GPU water, so never trace its edge as a contour.
    var curve = r.curve, cols = 48, rows = 64, dx = (curve.x1 - curve.x0) / cols;
    var y0 = curve.y0 - 16, dy = (curve.D + 20) / rows;
    var counts = r.surfaceCounts || (r.surfaceCounts = new Uint16Array(cols * rows));
    var tops = r.surfaceTops || (r.surfaceTops = new Float32Array(cols * rows));
    var surface = r.surface || (r.surface = new Float32Array(cols));
    counts.fill(0); tops.fill(Infinity); surface.fill(NaN);
    for (var i = 0; i < liquidCount; i++) {
      var x = liquidX[i], y = liquidY[i];
      var col = Math.floor((x - curve.x0) / dx), row = Math.floor((y - y0) / dy);
      if (col < 0 || col >= cols || row < 0 || row >= rows || liquidType[i] > 4) continue;
      var k = row * cols + col;
      counts[k]++; tops[k] = Math.min(tops[k], y);
    }
    for (var c = 0; c < cols; c++) for (var b = 0; b < rows; b++) {
      var idx = b * cols + c;
      if (counts[idx] < 6) continue;
      surface[c] = tops[idx]; break;
    }
    return surface;
  }
  function bathArrivalSurfaceY(r, x) {
    var surface = r.surface;
    if (!surface) return bathArrivalFront(r, x);
    var u = (x - r.curve.x0) / (r.curve.x1 - r.curve.x0) * 48 - 0.5;
    var a = Math.max(0, Math.min(47, Math.floor(u))), b = Math.min(47, a + 1);
    if (!isFinite(surface[a]) || !isFinite(surface[b])) return NaN;
    return surface[a] + (surface[b] - surface[a]) * Math.max(0, Math.min(1, u - a));
  }
  function bathArrivalTick(dt) {
    if (!bathMode) { bathArrivalReset(); return; }
    if (!bathArrival || bathFading || gamePaused || !(dt > 0)) return;
    var step = Math.min(dt, 0.05);
    var budget = Math.min(Math.ceil(28000 * step), Math.max(0, LIQUID_MAX_PARTICLES - liquidCount - 512));
    for (var i = 0; i < bathArrival.length; i++) {
      var r = bathArrival[i];
      if (!r.remaining) { r.tail += step; continue; }
      if (r.x1 < cam.x || r.x0 > cam.x + screenW || r.y1 < cam.y || r.y0 > cam.y + screenH) continue;
      if (budget <= 0) continue;
      r.age += step;
      var t = Math.min(1, r.age / r.duration);
      r.phase = t * t * (3 - 2 * t);
      var remaining = 0;
      bathArrivalEach(r, function (data, key) {
        for (var p = data.length - 3; p >= 0; p -= 3) {
          var x = data[p + 1], y = data[p + 2];
          if (!bathArrivalContains(r, x, y)) continue;
          if (budget <= 0 || x < cam.x - 240 || x > cam.x + screenW + 240 ||
              y < cam.y - 240 || y > cam.y + screenH + 240 ||
              (r.phase < 1 && y < bathArrivalFront(r, x))) { remaining++; continue; }
          // Small inward currents make a rounded crest; the shared solver
          // handles settling and contact at the original saved coordinates.
          var vx = ((r.left + r.right) * 0.5 - x) / Math.max(1, (r.right - r.left) * 0.5) * 9;
          if (addLiquidParticle(data[p], x, y, vx, -5, 0) < 0) { remaining++; budget = 0; continue; }
          var last = data.length - 3;
          data[p] = data[last]; data[p + 1] = data[last + 1]; data[p + 2] = data[last + 2]; data.length -= 3;
          budget--; r.emitted++;
        }
        if (!data.length) delete mineralLiquidParked[key];
      });
      r.remaining = remaining;
    }
    bathArrival = bathArrival.filter(function (r) { return r.remaining > 0 || r.tail < 0.65; });
    if (!bathArrival.length) bathArrival = null;
  }
  function bathArrivalDraw(c, specimen) {
    var rooms = specimen || bathArrival;
    if (!rooms || (!specimen && (!bathMode || bathFading))) return;
    for (var n = 0; n < rooms.length; n++) {
      var r = rooms[n]; if (!r.emitted || r.tail >= 0.65) continue;
      if (!specimen && (r.x1 < cam.x || r.x0 > cam.x + screenW || r.y1 < cam.y || r.y0 > cam.y + screenH)) continue;
      if (!specimen) bathArrivalSurface(r);
      var fade = Math.min(1, r.age * 3) * Math.max(0, 1 - r.tail / 0.65);
      var curve = r.curve, span = r.right - r.left;
      c.save();
      // Beads stay inside the real curved copper liner.
      c.beginPath(); c.moveTo(curve.x0, curve.y0 - 16); c.lineTo(curve.x1, curve.y0 - 16);
      for (var x = curve.x1; x >= curve.x0; x -= (curve.x1 - curve.x0) / 64) c.lineTo(x, curve.y0 + curve.depthAt(x) - 3);
      c.closePath(); c.clip();
      // Each small glint appears once during the physical return. No cycling
      // outline or repeating spray sits on top of the real liquid surface.
      c.fillStyle = BLD.waterFoam;
      for (var b = 0; b < 16; b++) {
        var u = (b * 0.61803398875) % 1, flight = (r.age - u * r.duration) / 0.55;
        if (flight <= 0 || flight >= 1) continue;
        var bx = r.left + span * u + Math.sin(r.age * 2 + b) * 3;
        var by = bathArrivalSurfaceY(r, bx) - Math.sin(flight * Math.PI) * (4 + u * 5);
        if (!isFinite(by)) continue;
        c.globalAlpha = fade * Math.sin(flight * Math.PI) * 0.35;
        c.beginPath(); c.ellipse(bx, by, 0.65 + u * 0.65, 1.2 + u * 0.8, 0.15, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  }
  function bathArrivalWarm(c, curve) {
    bathArrivalDraw(c, [{ curve: curve, left: curve.x0 + 50, right: curve.x1 - 50,
      top: curve.y0 + 25, bottom: curve.y0 + curve.D - 5, phase: 0.55,
      age: 1, duration: 2, tail: 0.1, emitted: 100, type: 0 }]);
  }
