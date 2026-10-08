  /* ---- Local skin/terrain contacts, opt-in (?softterrain=1) ---- */
  var SOFT_TERRAIN = softProjectEnabled || new URLSearchParams(location.search).get('softterrain') === '1' ||
    (softPlayEnabled && softPlayMaterialTrial);
  var SOFT_TERRAIN_SKIN = 0.02;
  var softTerrainReport = { points: 0, edges: 0, sweeps: 0, corners: 0 };
  var softTerrainBottomProbe = new WeakMap();

  function softTerrainBody(b) { return SOFT_TERRAIN && !!b.surfaceSlime; }

  // Clip a segment against a closed tile. Open endpoints alone do not prove
  // that the skin between them is clear of a ledge or corner.
  function softTerrainInterval(ax, ay, bx, by, left, top) {
    var dx = bx - ax, dy = by - ay, lo = 0, hi = 1;
    var nx = 0, ny = 0;
    for (var axis = 0; axis < 2; axis++) {
      var p = axis ? ay : ax, d = axis ? dy : dx;
      var lower = axis ? top : left, upper = lower + TILE;
      if (Math.abs(d) < 1e-10) { if (p <= lower || p >= upper) return null; continue; }
      var a = (lower - p) / d, c = (upper - p) / d, sign = -1;
      if (a > c) { var swap = a; a = c; c = swap; sign = 1; }
      if (a > lo) { lo = a; nx = axis ? 0 : sign; ny = axis ? sign : 0; }
      hi = Math.min(hi, c);
      if (lo >= hi) return null;
    }
    return hi > 0 && lo < 1 ? { lo: lo, hi: hi, nx: nx, ny: ny } : null;
  }

  // A contact changes only its material point or its two supporting skin
  // nodes. Reconcile normal velocity at the contact and bound tangential
  // friction by the normal impulse. No whole-body velocity or pose target.
  function softTerrainProject(b, a, c, t, nx, ny, depth, h) {
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    if (!(depth > 0)) return;
    b._terrainStepHit = true;
    var wa = 1 - t, wc = t, den = wa * wa + wc * wc;
    var vx = (px[a] - ox[a]) * wa + (px[c] - ox[c]) * wc;
    var vy = (py[a] - oy[a]) * wa + (py[c] - oy[c]) * wc;
    var vn = vx * nx + vy * ny, normal = Math.max(0, -vn);
    var bounce = normal > JELLO_REST_VEL * h ? JELLO_BOUNCE : 0;
    var impulse = normal * (1 + bounce), tangent = -vx * ny + vy * nx;
    var friction = Math.max(-normal * 0.45, Math.min(normal * 0.45, tangent));
    var dvx = nx * impulse + ny * friction, dvy = ny * impulse - nx * friction;
    for (var k = 0; k < 2; k++) {
      var i = k ? c : a, w = (k ? wc : wa) / den;
      if (!w) continue;
      var mx = nx * depth * w, my = ny * depth * w;
      px[i] += mx; py[i] += my;
      ox[i] += mx - dvx * w; oy[i] += my - dvy * w;
    }
    if (typeof softPresentationBody === 'function' && softPresentationBody(b)) {
      // normal/impulse are Verlet displacements per solver substep.
      var realIH = JELLO_TIMESCALE / h;
      softPresentationContact(b, a, c, t, normal * realIH, impulse * realIH);
    }
  }

  function softTerrainFace(x, y, oldX, oldY, row, col) {
    var left = col * TILE, top = row * TILE, best = null, distance = Infinity;
    // Keep the original face order for equal-depth ties. Most probes have
    // one exposed face; build only a selected candidate, not five arrays.
    var depth = x - left, prior = oldX - left;
    if (!(prior > SOFT_TERRAIN_SKIN) && depth < distance && tileAt(row, col - 1) === null) {
      distance = depth; best = [-1, 0, depth, prior, row, col - 1];
    }
    depth = left + TILE - x; prior = left + TILE - oldX;
    if (!(prior > SOFT_TERRAIN_SKIN) && depth < distance && tileAt(row, col + 1) === null) {
      distance = depth; best = [1, 0, depth, prior, row, col + 1];
    }
    depth = y - top; prior = oldY - top;
    if (!(prior > SOFT_TERRAIN_SKIN) && depth < distance && tileAt(row - 1, col) === null) {
      distance = depth; best = [0, -1, depth, prior, row - 1, col];
    }
    depth = top + TILE - y; prior = top + TILE - oldY;
    if (!(prior > SOFT_TERRAIN_SKIN) && depth < distance && tileAt(row + 1, col) === null)
      best = [0, 1, depth, prior, row + 1, col];
    return best;
  }

  function softTerrainPoint(b, i, h) {
    var px = b.px, py = b.py, guardPX = b._guardPX, guardPY = b._guardPY;
    var x = px[i], y = py[i];
    if (!isFinite(x + y) || !guardPX) return false;
    var sx = guardPX[i], sy = guardPY[i];
    var oldRow = Math.floor(sy / TILE), rowAt = Math.floor(y / TILE);
    var oldCol = Math.floor(sx / TILE), colAt = Math.floor(x / TILE);
    // A point staying in one tile cannot enter through a tile face. Air is
    // done; a solid tile still needs the same resting penetration repair.
    var sameTile = oldRow === rowAt && oldCol === colAt;
    if (sameTile && tileAt(rowAt, colAt) === null) return true;
    var r0 = Math.min(oldRow, rowAt), r1 = Math.max(oldRow, rowAt);
    var c0 = Math.min(oldCol, colAt), c1 = Math.max(oldCol, colAt);
    var first = null, time = Infinity;
    for (var row = r0; !sameTile && row <= r1; row++) for (var col = c0; col <= c1; col++) {
      if (tileAt(row, col) === null) continue;
      var hit = softTerrainInterval(sx, sy, x, y, col * TILE, row * TILE);
      if (hit && hit.lo < time && (hit.nx || hit.ny)) { first = hit; time = hit.lo; }
    }
    if (first) {
      var nx = first.nx, ny = first.ny;
      var depth = -((x - sx) * nx + (y - sy) * ny) * (1 - time) + SOFT_TERRAIN_SKIN;
      softTerrainProject(b, i, i, 0, nx, ny, depth, h);
      softTerrainReport.points++; softTerrainReport.sweeps++;
    } else if (sameTile || jelloWorldSolidAt(x, y)) {
      var face = softTerrainFace(x, y, sx, sy, Math.floor(y / TILE), Math.floor(x / TILE));
      if (!face) return false;
      softTerrainProject(b, i, i, 0, face[0], face[1], face[2] + SOFT_TERRAIN_SKIN, h);
      softTerrainReport.points++;
    }
    return true;
  }

  function softTerrainEdges(b, h) {
    var px = b.px, py = b.py, guardPX = b._guardPX, guardPY = b._guardPY, ring = b.ring, ringN = b.ringN;
    if (!guardPX) return;
    for (var k = 0; k < ringN; k++) {
      var a = ring[k], c = ring[(k + 1) % ringN];
      var ax = px[a], ay = py[a], bx = px[c], by = py[c];
      var sax = guardPX[a], say = guardPY[a], sbx = guardPX[c], sby = guardPY[c];
      var r0 = Math.floor(Math.min(ay, by, say, sby) / TILE), r1 = Math.floor(Math.max(ay, by, say, sby) / TILE);
      var c0 = Math.floor(Math.min(ax, bx, sax, sbx) / TILE), c1 = Math.floor(Math.max(ax, bx, sax, sbx) / TILE);
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) {
        if (tileAt(row, col) === null) continue;
        // Corner eligibility depends only on this tile's four neighbors.
        // Query each once while retaining the same corner correction order.
        var leftOpen = tileAt(row, col - 1) === null, rightOpen = tileAt(row, col + 1) === null;
        if (leftOpen || rightOpen) {
          if (tileAt(row - 1, col) === null) {
            if (leftOpen) softTerrainCorner(b, a, c, col * TILE, row * TILE, h);
            if (rightOpen) softTerrainCorner(b, a, c, (col + 1) * TILE, row * TILE, h);
          }
          if (tileAt(row + 1, col) === null) {
            if (leftOpen) softTerrainCorner(b, a, c, col * TILE, (row + 1) * TILE, h);
            if (rightOpen) softTerrainCorner(b, a, c, (col + 1) * TILE, (row + 1) * TILE, h);
          }
        }
        ax = px[a]; ay = py[a]; bx = px[c]; by = py[c];
        var hit = softTerrainInterval(ax, ay, bx, by, col * TILE, row * TILE);
        if (!hit) continue;
        var t = (hit.lo + hit.hi) * 0.5, wa = 1 - t;
        var x = ax * wa + bx * t, y = ay * wa + by * t;
        var oldX = guardPX[a] * wa + guardPX[c] * t;
        var oldY = guardPY[a] * wa + guardPY[c] * t;
        var face = softTerrainFace(x, y, oldX, oldY, row, col);
        if (!face) continue;
        softTerrainProject(b, a, c, t, face[0], face[1], face[2] + SOFT_TERRAIN_SKIN, h);
        softTerrainReport.edges++;
        ax = px[a]; ay = py[a]; bx = px[c]; by = py[c];
      }
    }
  }

  // A moving skin edge can sweep across a convex corner while both end nodes
  // stay in air. Its signed distance polynomial is quadratic in substep time.
  // Solve its zeroes, then require a hit on the finite edge, not its extension.
  function softTerrainCorner(b, a, c, x, y, h) {
    var px = b.px, py = b.py, guardPX = b._guardPX, guardPY = b._guardPY;
    var ax = guardPX[a], ay = guardPY[a];
    var ex = guardPX[c] - ax, ey = guardPY[c] - ay;
    var dax = px[a] - ax, day = py[a] - ay;
    var dex = px[c] - guardPX[c] - dax, dey = py[c] - guardPY[c] - day;
    var cx = x - ax, cy = y - ay;
    var q0 = ex * cy - ey * cx;
    var q1 = dex * cy - dey * cx - ex * day + ey * dax;
    var q2 = -dex * day + dey * dax, roots = [];
    if (Math.abs(q2) < 1e-10) {
      if (Math.abs(q1) > 1e-10) roots.push(-q0 / q1);
    } else {
      var disc = q1 * q1 - 4 * q2 * q0;
      if (disc < 0) return;
      var sq = Math.sqrt(disc);
      roots.push((-q1 - sq) / (2 * q2), (-q1 + sq) / (2 * q2));
      roots.sort(function (u, v) { return u - v; });
    }
    for (var j = 0; j < roots.length; j++) {
      var time = roots[j];
      if (!(time > 1e-7 && time <= 1)) continue;
      var hx = ax + dax * time, hy = ay + day * time;
      var vx = ex + dex * time, vy = ey + dey * time, len2 = vx * vx + vy * vy;
      if (!(len2 > 1e-10)) continue;
      var t = ((x - hx) * vx + (y - hy) * vy) / len2;
      if (!(t > 1e-6 && t < 1 - 1e-6)) continue;
      var nx = -vy / Math.sqrt(len2), ny = vx / Math.sqrt(len2);
      var oldX = ax + ex * t, oldY = ay + ey * t;
      if ((oldX - x) * nx + (oldY - y) * ny < 0) { nx = -nx; ny = -ny; }
      var gap = (px[a] * (1 - t) + px[c] * t - x) * nx +
        (py[a] * (1 - t) + py[c] * t - y) * ny;
      if (gap >= SOFT_TERRAIN_SKIN) continue;
      softTerrainProject(b, a, c, t, nx, ny, SOFT_TERRAIN_SKIN - gap, h);
      softTerrainReport.corners++; softTerrainReport.edges++;
      return;
    }
  }

  function softTerrainSweepClear(b) {
    var px = b.px, py = b.py, guardPX = b._guardPX, guardPY = b._guardPY, n = b.n;
    if (!guardPX || b._terrainStepHit) return false;
    // A previously lowest node often still touches the floor. Its live
    // coordinates can disprove an open box before a full bounds scan.
    var probe = softTerrainBottomProbe.get(b);
    if (probe !== undefined && (jelloWorldSolidAt(px[probe], py[probe]) ||
        jelloWorldSolidAt(guardPX[probe], guardPY[probe]))) return false;
    var left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    var bottomPoint = 0;
    for (var i = 0; i < n; i++) {
      var x = px[i], y = py[i], sx = guardPX[i], sy = guardPY[i];
      if (!isFinite(x + y + sx + sy)) return false;
      if (y > bottom || sy > bottom) bottomPoint = i;
      left = Math.min(left, x, sx); right = Math.max(right, x, sx);
      top = Math.min(top, y, sy); bottom = Math.max(bottom, y, sy);
    }
    softTerrainBottomProbe.set(b, bottomPoint);
    var r0 = Math.floor(top / TILE), r1 = Math.floor(bottom / TILE);
    var c0 = Math.floor(left / TILE), c1 = Math.floor(right / TILE);
    for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) {
      if (tileAt(row, col) !== null) return false;
    }
    return true;
  }

  function softTerrainSolve(b, h) {
    if (!softTerrainBody(b) || b._guardRejectedStep) return;
    // Every swept skin segment lies in this box. An all-air box needs no
    // point/edge terrain queries; retain the independent self-contact test.
    if (softTerrainSweepClear(b) && !(typeof softIntentBody === 'function' && softIntentBody(b) && softContactSkinCrossed(b))) return;
    for (var pass = 0; pass < 6; pass++) {
      var before = softTerrainReport.points + softTerrainReport.edges;
      var selfBefore = softContactReport.selfContacts;
      for (var i = 0; i < b.n; i++) {
        if (!softTerrainPoint(b, i, h)) jelloCollidePointWorld(b, i, h);
      }
      softTerrainEdges(b, h);
      var intentSkin = typeof softIntentBody === 'function' && softIntentBody(b) && softContactSkinCrossed(b);
      if (!b._terrainStepHit && !intentSkin) break;
      // A floor correction can bring two pieces of skin together after the
      // ordinary rig/self-contact pass. Solve that contact in the same loop.
      softContactSkin(b);
      var fixed = jelloLimitOrientation(b);
      if (!fixed && before === softTerrainReport.points + softTerrainReport.edges &&
          selfBefore === softContactReport.selfContacts) break;
    }
    // Orientation is a positional constraint too. Close the last iteration
    // with terrain before the independent enclosure/topology validators run.
    if (b._terrainStepHit || (typeof softIntentBody === 'function' && softIntentBody(b) && softContactSkinCrossed(b))) {
      for (var p = 0; p < b.n; p++) {
        if (!softTerrainPoint(b, p, h)) jelloCollidePointWorld(b, p, h);
      }
      softTerrainEdges(b, h);
      // Two skin edges can cross at a wall/floor corner without inverting a
      // health triangle. Finish their local contact too, then recheck terrain.
      for (var close = 0; close < 6 && softTerrainSkinCrossed(b); close++) {
        softContactSkin(b);
        for (var q = 0; q < b.n; q++) {
          if (!softTerrainPoint(b, q, h)) jelloCollidePointWorld(b, q, h);
        }
        softTerrainEdges(b, h);
      }
      if (softTerrainSkinCrossed(b)) jelloRestoreResilienceSnapshot(b, 'skin');
    }
  }

  function softTerrainSkinCrossed(b) {
    return softContactSkinCrossed(b);
  }
