  // Fluid boundaries follow the drawn gel, rather than the inset lattice.
  // Keep the existing twenty-edge GPU budget. Each edge encloses its span
  // of the quadratic skin; its outward error is computed from the curve's
  // exact extrema, not an arbitrary enlargement of the body.
  function surfaceSlimeFluidGuest(body) {
    var b = surfaceSlimeRenderBody(body), m = body.surfaceSlime;
    if (m) m.fluidFrame = -1;
    if (!m || b.ringN < 3 || !isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) return null;
    jelloRingBake(b);
    var n = jelloRingBakeN, take = Math.min(20, n);
    m.fluidPath = surfaceSlimeSkinPath(); m.fluidView = b;
    var g = m.fluidGuest;
    if (!g || g.pts.length !== take * 4) {
      g = m.fluidGuest = { pts: new Float64Array(take * 4), skin: true,
        normals: new Float64Array(take * 3), sample: new Float64Array(take * 4) };
    }
    var sample = g.sample, lines = g.normals, pts = g.pts, sign = b.ringSign, folded = false;
    var ih = JELLO_TIMESCALE / (jelloStepH || JELLO_H);
    var physical = typeof softWorldBody === 'function' && softWorldBody(body);
    var fadeScale = physical ? 1 / softWorldWaterScale() : 1;
    var chamfer = JELLO_EDGE_STYLE >= 1 && body.ringN * 2 <= JELLO_MAX_POINTS;
    for (var k = 0; k < take; k++) {
      var s = k * n / take, i = Math.floor(s), t = s - i;
      var prev = (i + n - 1) % n, next = (i + 1) % n;
      var a = 0.5 * (1 - t) * (1 - t), c = 0.5 * t * t, mid = 1 - a - c;
      sample[k * 4] = jelloROX[prev] * a + jelloROX[i] * mid + jelloROX[next] * c;
      sample[k * 4 + 1] = jelloROY[prev] * a + jelloROY[i] * mid + jelloROY[next] * c;
      var vx = 0, vy = 0;
      for (var v = 0; v < 3; v++) {
        var baked = v === 0 ? prev : (v === 1 ? i : next), weight = v === 0 ? a : (v === 1 ? mid : c);
        var original = chamfer ? Math.floor(baked / 2) : baked;
        var cut = chamfer ? (baked % 2 ? 0.75 : 0.25) : 0;
        for (var side = 0; side < (chamfer ? 2 : 1); side++) {
          var node = body.ring[(original + side) % body.ringN];
          var ux = skySlimeClamp((body.px[node] - body.ox[node]) * ih, -600, 600);
          var uy = skySlimeClamp((body.py[node] - body.oy[node]) * ih, -600, 600);
          var fade = physical ? fadeScale : skySlimeClamp((Math.hypot(ux, uy) - 20) / 50, 0, 1);
          var w = weight * (chamfer ? (side ? cut : 1 - cut) : 1) * fade;
          vx += ux * w; vy += uy * w;
        }
      }
      sample[k * 4 + 2] = vx; sample[k * 4 + 3] = vy;
    }
    for (var edge = 0; edge < take; edge++) {
      var end = (edge + 1) % take, ax = sample[edge * 4], ay = sample[edge * 4 + 1];
      var dx = sample[end * 4] - ax, dy = sample[end * 4 + 1] - ay;
      var length = Math.hypot(dx, dy), nx = length > 1e-9 ? sign * dy / length : 0;
      if (length <= 1e-9) folded = true;
      var ny = length > 1e-9 ? -sign * dx / length : -1, outset = 0;
      var from = edge * n / take, to = (edge + 1) * n / take;
      for (var piece = Math.floor(from); piece < to; piece++) {
        var ci = piece % n, cp = (ci + n - 1) % n, cn = (ci + 1) % n;
        var q0 = ((jelloROX[cp] + jelloROX[ci]) * 0.5 - ax) * nx + ((jelloROY[cp] + jelloROY[ci]) * 0.5 - ay) * ny;
        var q1 = (jelloROX[ci] - ax) * nx + (jelloROY[ci] - ay) * ny;
        var q2 = ((jelloROX[ci] + jelloROX[cn]) * 0.5 - ax) * nx + ((jelloROY[ci] + jelloROY[cn]) * 0.5 - ay) * ny;
        var qa = q0 - 2 * q1 + q2, qb = 2 * (q1 - q0);
        var lo = Math.max(0, from - piece), hi = Math.min(1, to - piece);
        outset = Math.max(outset, (qa * lo + qb) * lo + q0, (qa * hi + qb) * hi + q0);
        if (qa < -1e-12) {
          var peak = -qb / (2 * qa);
          if (peak > lo && peak < hi) outset = Math.max(outset, (qa * peak + qb) * peak + q0);
        }
      }
      // The existing projection adds 0.5 px. Another 0.4 px keeps the
      // visible 0.9 px snow grain outside the gel, including roundoff.
      lines[edge * 3] = nx; lines[edge * 3 + 1] = ny;
      lines[edge * 3 + 2] = nx * ax + ny * ay + outset + 0.42;
    }
    var left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (var p = 0; p < take; p++) {
      var previous = (p + take - 1) % take, nx0 = lines[previous * 3], ny0 = lines[previous * 3 + 1];
      var nx1 = lines[p * 3], ny1 = lines[p * 3 + 1];
      var d0 = lines[previous * 3 + 2], d1 = lines[p * 3 + 2], det = nx0 * ny1 - ny0 * nx1;
      var x = sample[p * 4], y = sample[p * 4 + 1];
      // Find the shortest outward displacement satisfying both faces.
      // Intersecting the infinite lines alone creates long spikes where
      // almost parallel faces need slightly different curve clearances.
      var h0 = Math.max(0, d0 - nx0 * x - ny0 * y);
      var h1 = Math.max(0, d1 - nx1 * x - ny1 * y), dot = nx0 * nx1 + ny0 * ny1;
      if (dot < -0.95) folded = true;
      if (h0 * dot >= h1) { x += nx0 * h0; y += ny0 * h0; }
      else if (h1 * dot >= h0) { x += nx1 * h1; y += ny1 * h1; }
      else if (Math.abs(det) > 1e-9) {
        x += (h0 * ny1 - ny0 * h1) / det; y += (nx0 * h1 - h0 * nx1) / det;
      }
      else { var shift = Math.max(h0, h1); x += nx1 * shift; y += ny1 * shift; }
      if (!isFinite(x + y) || Math.hypot(x - sample[p * 4], y - sample[p * 4 + 1]) > Math.max(8, b.spacing * 2)) folded = true;
      pts[p * 4] = x; pts[p * 4 + 1] = y;
      pts[p * 4 + 2] = sample[p * 4 + 2]; pts[p * 4 + 3] = sample[p * 4 + 3];
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (folded) {
      // A folded cusp has incompatible local outward faces. Use a bounded
      // convex support envelope until it unfolds, still with twenty edges.
      // Exact quadratic extrema keep even this rare fallback close to the
      // outermost gel and prevent an unbounded miter from widening the grid.
      for (var f = 0; f < take; f++) {
        var angle = sign * f * Math.PI * 2 / take, fnx = Math.cos(angle), fny = Math.sin(angle), support = -Infinity;
        for (var cidx = 0; cidx < n; cidx++) {
          var cprev = (cidx + n - 1) % n, cnext = (cidx + 1) % n;
          var v0 = (jelloROX[cprev] + jelloROX[cidx]) * 0.5 * fnx + (jelloROY[cprev] + jelloROY[cidx]) * 0.5 * fny;
          var v1 = jelloROX[cidx] * fnx + jelloROY[cidx] * fny;
          var v2 = (jelloROX[cidx] + jelloROX[cnext]) * 0.5 * fnx + (jelloROY[cidx] + jelloROY[cnext]) * 0.5 * fny;
          var ca = v0 - 2 * v1 + v2, cb = 2 * (v1 - v0);
          support = Math.max(support, v0, v2);
          if (ca < -1e-12) { var extremum = -cb / (2 * ca); if (extremum > 0 && extremum < 1) support = Math.max(support, (ca * extremum + cb) * extremum + v0); }
        }
        lines[f * 3] = fnx; lines[f * 3 + 1] = fny; lines[f * 3 + 2] = support + 0.42;
      }
      left = top = Infinity; right = bottom = -Infinity;
      for (var fp = 0; fp < take; fp++) {
        var before = (fp + take - 1) % take;
        var fx0 = lines[before * 3], fy0 = lines[before * 3 + 1], fd0 = lines[before * 3 + 2];
        var fx1 = lines[fp * 3], fy1 = lines[fp * 3 + 1], fd1 = lines[fp * 3 + 2], determinant = fx0 * fy1 - fy0 * fx1;
        var fx = (fd0 * fy1 - fy0 * fd1) / determinant, fy = (fx0 * fd1 - fd0 * fx1) / determinant;
        var closest = 0, closestD2 = Infinity;
        for (var sv = 0; sv < take; sv++) { var distance2 = (fx - sample[sv * 4]) * (fx - sample[sv * 4]) + (fy - sample[sv * 4 + 1]) * (fy - sample[sv * 4 + 1]); if (distance2 < closestD2) { closestD2 = distance2; closest = sv; } }
        pts[fp * 4] = fx; pts[fp * 4 + 1] = fy;
        pts[fp * 4 + 2] = sample[closest * 4 + 2]; pts[fp * 4 + 3] = sample[closest * 4 + 3];
        left = Math.min(left, fx); right = Math.max(right, fx); top = Math.min(top, fy); bottom = Math.max(bottom, fy);
      }
    }
    if (!isFinite(left + right + top + bottom)) return null;
    for (var valid = 0; valid < pts.length; valid++) if (!isFinite(pts[valid])) return null;
    g.convex = sign;
    for (var corner = 0; corner < take; corner++) {
      var after = (corner + 1) % take, beforeCorner = (corner + take - 1) % take;
      var ex0 = pts[corner * 4] - pts[beforeCorner * 4], ey0 = pts[corner * 4 + 1] - pts[beforeCorner * 4 + 1];
      var ex1 = pts[after * 4] - pts[corner * 4], ey1 = pts[after * 4 + 1] - pts[corner * 4 + 1];
      if (sign * (ex0 * ey1 - ey0 * ex1) <= 1e-4) { g.convex = 0; break; }
    }
    g.x = (left + right) * 0.5; g.y = (top + bottom) * 0.5;
    g.hw = (right - left) * 0.5; g.hh = (bottom - top) * 0.5;
    m.fluidFrame = jelloFrameNo; m.fluidAccum = jelloAccum; m.fluidAge = m.age;
    return g;
  }

  function surfaceSlimeBuildFluidGuests() {
    surfaceSlimeGuests.length = 0;
    if (!ENABLE_JELLO || bathMode || gameOver || gameWon) return;
    for (var i = 0; i < jelloBodies.length && surfaceSlimeGuests.length < 6; i++) {
      var b = jelloBodies[i];
      if (!b.surfaceSlime || !jelloBodyOnCamera(b)) continue;
      var g = surfaceSlimeFluidGuest(b);
      if (g) surfaceSlimeGuests.push(g);
    }
  }

  function surfaceSlimeFluidCPU(b, localVelocity) {
    var m = b.surfaceSlime;
    var g = m && m.fluidFrame === jelloFrameNo && m.fluidAccum === jelloAccum && m.fluidAge === m.age ? m.fluidGuest : surfaceSlimeFluidGuest(b);
    if (!g) return;
    var pts = g.pts, n = pts.length / 4;
    for (var i = 0; i < liquidCount; i++) {
      var x = liquidX[i], y = liquidY[i];
      if (liquidFrozen[i] || Math.abs(x - g.x) > g.hw || Math.abs(y - g.y) > g.hh) continue;
      var inside = false, nearest = Infinity, qx = x, qy = y, vx = 0, vy = 0;
      for (var k = 0, prev = n - 1; k < n; prev = k++) {
        var ax = pts[k * 4], ay = pts[k * 4 + 1], bx = pts[prev * 4], by = pts[prev * 4 + 1];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        var dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
        var t = length2 > 0 ? skySlimeClamp(((x - ax) * dx + (y - ay) * dy) / length2, 0, 1) : 0;
        var px = ax + dx * t, py = ay + dy * t, distance2 = (px - x) * (px - x) + (py - y) * (py - y);
        if (distance2 < nearest) { nearest = distance2; qx = px; qy = py;
          vx = pts[k * 4 + 2] + (pts[prev * 4 + 2] - pts[k * 4 + 2]) * t;
          vy = pts[k * 4 + 3] + (pts[prev * 4 + 3] - pts[k * 4 + 3]) * t; }
      }
      if (!inside || nearest <= 1e-18) continue;
      var distance = Math.sqrt(nearest), nx = (qx - x) / distance, ny = (qy - y) / distance;
      var px = qx + nx * 0.5, py = qy + ny * 0.5;
      if (liquidWorldSolidAt(px, py)) continue;
      liquidX[i] = px; liquidY[i] = py;
      if (localVelocity) { var inward = Math.min(0, (liquidVX[i] - vx) * nx + (liquidVY[i] - vy) * ny); liquidVX[i] -= nx * inward; liquidVY[i] -= ny * inward; }
      else { liquidVX[i] = (b.vx || 0) * JELLO_TIMESCALE * 0.65; liquidVY[i] = (b.vy || 0) * JELLO_TIMESCALE * 0.65; }
      liquidSleeping[i] = 0; liquidRestFrames[i] = 0;
    }
  }
