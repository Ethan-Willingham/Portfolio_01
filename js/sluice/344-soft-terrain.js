  /* ---- Local skin/terrain contacts, opt-in (?softterrain=1) ---- */
  var SOFT_TERRAIN = new URLSearchParams(location.search).get('softterrain') === '1' ||
    (softPlayEnabled && softPlayMaterialTrial);
  var SOFT_TERRAIN_SKIN = 0.02;
  var softTerrainReport = { points: 0, edges: 0, sweeps: 0, corners: 0 };

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
    if (!(depth > 0)) return;
    b._terrainStepHit = true;
    var wa = 1 - t, wc = t, den = wa * wa + wc * wc;
    var vx = (b.px[a] - b.ox[a]) * wa + (b.px[c] - b.ox[c]) * wc;
    var vy = (b.py[a] - b.oy[a]) * wa + (b.py[c] - b.oy[c]) * wc;
    var vn = vx * nx + vy * ny, normal = Math.max(0, -vn);
    var bounce = normal > JELLO_REST_VEL * h ? JELLO_BOUNCE : 0;
    var impulse = normal * (1 + bounce), tangent = -vx * ny + vy * nx;
    var friction = Math.max(-normal * 0.45, Math.min(normal * 0.45, tangent));
    var dvx = nx * impulse + ny * friction, dvy = ny * impulse - nx * friction;
    for (var k = 0; k < 2; k++) {
      var i = k ? c : a, w = (k ? wc : wa) / den;
      if (!w) continue;
      var mx = nx * depth * w, my = ny * depth * w;
      b.px[i] += mx; b.py[i] += my;
      b.ox[i] += mx - dvx * w; b.oy[i] += my - dvy * w;
    }
  }

  function softTerrainFace(x, y, oldX, oldY, row, col) {
    var left = col * TILE, top = row * TILE, best = null, distance = Infinity;
    var faces = [[-1, 0, x - left, oldX - left, row, col - 1],
      [1, 0, left + TILE - x, left + TILE - oldX, row, col + 1],
      [0, -1, y - top, oldY - top, row - 1, col],
      [0, 1, top + TILE - y, top + TILE - oldY, row + 1, col]];
    for (var i = 0; i < 4; i++) {
      var f = faces[i];
      if (tileAt(f[4], f[5]) !== null || f[3] > SOFT_TERRAIN_SKIN) continue;
      if (f[2] < distance) { distance = f[2]; best = f; }
    }
    return best;
  }

  function softTerrainPoint(b, i, h) {
    var x = b.px[i], y = b.py[i];
    if (!isFinite(x + y) || !b._guardPX) return false;
    var sx = b._guardPX[i], sy = b._guardPY[i];
    var r0 = Math.floor(Math.min(sy, y) / TILE), r1 = Math.floor(Math.max(sy, y) / TILE);
    var c0 = Math.floor(Math.min(sx, x) / TILE), c1 = Math.floor(Math.max(sx, x) / TILE);
    var first = null, time = Infinity;
    for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) {
      if (tileAt(row, col) === null) continue;
      var hit = softTerrainInterval(sx, sy, x, y, col * TILE, row * TILE);
      if (hit && hit.lo < time && (hit.nx || hit.ny)) { first = hit; time = hit.lo; }
    }
    if (first) {
      var nx = first.nx, ny = first.ny;
      var depth = -((x - sx) * nx + (y - sy) * ny) * (1 - time) + SOFT_TERRAIN_SKIN;
      softTerrainProject(b, i, i, 0, nx, ny, depth, h);
      softTerrainReport.points++; softTerrainReport.sweeps++;
    } else if (jelloWorldSolidAt(x, y)) {
      var face = softTerrainFace(x, y, sx, sy, Math.floor(y / TILE), Math.floor(x / TILE));
      if (!face) return false;
      softTerrainProject(b, i, i, 0, face[0], face[1], face[2] + SOFT_TERRAIN_SKIN, h);
      softTerrainReport.points++;
    }
    return true;
  }

  function softTerrainEdges(b, h) {
    if (!b._guardPX) return;
    for (var k = 0; k < b.ringN; k++) {
      var a = b.ring[k], c = b.ring[(k + 1) % b.ringN];
      var ax = b.px[a], ay = b.py[a], bx = b.px[c], by = b.py[c];
      var sax = b._guardPX[a], say = b._guardPY[a], sbx = b._guardPX[c], sby = b._guardPY[c];
      var r0 = Math.floor(Math.min(ay, by, say, sby) / TILE), r1 = Math.floor(Math.max(ay, by, say, sby) / TILE);
      var c0 = Math.floor(Math.min(ax, bx, sax, sbx) / TILE), c1 = Math.floor(Math.max(ax, bx, sax, sbx) / TILE);
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) {
        if (tileAt(row, col) === null) continue;
        for (var corner = 0; corner < 4; corner++) {
          var right = corner & 1, bottom = corner >> 1;
          if (tileAt(row, col + (right ? 1 : -1)) !== null ||
              tileAt(row + (bottom ? 1 : -1), col) !== null) continue;
          softTerrainCorner(b, a, c, (col + right) * TILE, (row + bottom) * TILE, h);
        }
        ax = b.px[a]; ay = b.py[a]; bx = b.px[c]; by = b.py[c];
        var hit = softTerrainInterval(ax, ay, bx, by, col * TILE, row * TILE);
        if (!hit) continue;
        var t = (hit.lo + hit.hi) * 0.5, wa = 1 - t;
        var x = ax * wa + bx * t, y = ay * wa + by * t;
        var oldX = b._guardPX[a] * wa + b._guardPX[c] * t;
        var oldY = b._guardPY[a] * wa + b._guardPY[c] * t;
        var face = softTerrainFace(x, y, oldX, oldY, row, col);
        if (!face) continue;
        softTerrainProject(b, a, c, t, face[0], face[1], face[2] + SOFT_TERRAIN_SKIN, h);
        softTerrainReport.edges++;
        ax = b.px[a]; ay = b.py[a]; bx = b.px[c]; by = b.py[c];
      }
    }
  }

  // A moving skin edge can sweep across a convex corner while both end nodes
  // stay in air. Its signed distance polynomial is quadratic in substep time.
  // Solve its zeroes, then require a hit on the finite edge, not its extension.
  function softTerrainCorner(b, a, c, x, y, h) {
    var ax = b._guardPX[a], ay = b._guardPY[a];
    var ex = b._guardPX[c] - ax, ey = b._guardPY[c] - ay;
    var dax = b.px[a] - ax, day = b.py[a] - ay;
    var dex = b.px[c] - b._guardPX[c] - dax, dey = b.py[c] - b._guardPY[c] - day;
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
      var gap = (b.px[a] * (1 - t) + b.px[c] * t - x) * nx +
        (b.py[a] * (1 - t) + b.py[c] * t - y) * ny;
      if (gap >= SOFT_TERRAIN_SKIN) continue;
      softTerrainProject(b, a, c, t, nx, ny, SOFT_TERRAIN_SKIN - gap, h);
      softTerrainReport.corners++; softTerrainReport.edges++;
      return;
    }
  }

  function softTerrainSolve(b, h) {
    if (!softTerrainBody(b) || b._guardRejectedStep) return;
    for (var pass = 0; pass < 6; pass++) {
      var before = softTerrainReport.points + softTerrainReport.edges;
      var selfBefore = softContactReport.selfContacts;
      for (var i = 0; i < b.n; i++) {
        if (!softTerrainPoint(b, i, h)) jelloCollidePointWorld(b, i, h);
      }
      softTerrainEdges(b, h);
      if (!b._terrainStepHit) break;
      // A floor correction can bring two pieces of skin together after the
      // ordinary rig/self-contact pass. Solve that contact in the same loop.
      softContactSkin(b);
      var fixed = jelloLimitOrientation(b);
      if (!fixed && before === softTerrainReport.points + softTerrainReport.edges &&
          selfBefore === softContactReport.selfContacts) break;
    }
    // Orientation is a positional constraint too. Close the last iteration
    // with terrain before the independent enclosure/topology validators run.
    if (b._terrainStepHit) {
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
