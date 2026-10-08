  /* ---- Local surface contact between soft residents ----
     The fast particle solver carries ordinary loads. If stretched skins
     interleave between particles, a node pushes on the actual opposite edge. The weighted reaction
     enters that edge's two nodes; bulk compression and recovery belong to the
     material. No centre separation, phasing, or pile-wide velocity target. */
  var SOFT_PAIRS_FRICTION = 0.42;
  var softPairsReport = { contacts: 0, impulse: 0, depth: 0 };

  function softPairsBody(b) { return SOFT_PAIRS && !!b.surfaceSlime; }
  function softPairsManaged(a, b) { return softPairsBody(a) && softPairsBody(b); }

  var softPairsBodies = new Array(4), softPairsNodes = new Int32Array(4);
  var softPairsWeights = new Float64Array(4), softPairsMX = new Float64Array(4), softPairsMY = new Float64Array(4);

  function softPairsProject(A, p, B, a, c, t, nx, ny, depth, h) {
    softPairsPatch(A, p, p, 0, B, a, c, t, nx, ny, depth, h);
  }

  function softPairsPatch(A, p, q, u, B, a, c, t, nx, ny, depth, h) {
    var bodies = softPairsBodies, nodes = softPairsNodes, weights = softPairsWeights;
    var mx = softPairsMX, my = softPairsMY, kx = 0, ky = 0, vx = 0, vy = 0, maxGradient = 0;
    bodies[0] = bodies[1] = A; bodies[2] = bodies[3] = B;
    nodes[0] = p; nodes[1] = q; nodes[2] = a; nodes[3] = c;
    weights[0] = 1 - u; weights[1] = u; weights[2] = t - 1; weights[3] = -t;
    for (var k = 0; k < 4; k++) {
      var b = bodies[k], i = nodes[k], w = weights[k], side = w < 0 ? -1 : 1;
      if (!w) { mx[k] = my[k] = 0; continue; }
      mx[k] = jelloWorldSolidAt(b.px[i] + nx * side * 0.5, b.py[i]) ? 0 : 1;
      my[k] = jelloWorldSolidAt(b.px[i], b.py[i] + ny * side * 0.5) ? 0 : 1;
      kx += w * w * mx[k]; ky += w * w * my[k];
      maxGradient = Math.max(maxGradient, Math.abs(w) * Math.hypot(nx * mx[k], ny * my[k]));
      vx += w * (b.px[i] - b.ox[i]); vy += w * (b.py[i] - b.oy[i]);
    }
    var den = nx * nx * kx + ny * ny * ky;
    if (!(den > 1e-8 && maxGradient > 1e-8)) return;
    var approach = -(vx * nx + vy * ny);
    var normal = Math.max(0, approach) / den;
    var move = Math.min(depth / den, 2 / maxGradient);
    var tx = -ny, ty = nx, tangentDen = tx * tx * kx + ty * ty * ky;
    // Sequential orthogonal projections in the actual masked mass metric.
    // Each removes energy. A final normal projection closes the coupling
    // introduced when only one coordinate of a terrain-bound point can move.
    vx += nx * normal * kx; vy += ny * normal * ky;
    var friction = tangentDen > 1e-9 ? skySlimeClamp(-(vx * tx + vy * ty) / tangentDen,
      -normal * SOFT_PAIRS_FRICTION, normal * SOFT_PAIRS_FRICTION) : 0;
    vx += tx * friction * kx; vy += ty * friction * ky;
    normal += Math.max(0, -(vx * nx + vy * ny)) / den;
    for (k = 0; k < 4; k++) {
      b = bodies[k]; i = nodes[k]; w = weights[k];
      if (!w) continue;
      var dx = nx * move * w * mx[k], dy = ny * move * w * my[k];
      b.px[i] += dx; b.py[i] += dy;
      b.ox[i] += dx - (nx * normal + tx * friction) * w * mx[k];
      b.oy[i] += dy - (ny * normal + ty * friction) * w * my[k];
    }
    A.sleeping = B.sleeping = false; A._solve = B._solve = true;
    A.sleepFrames = B.sleepFrames = 0;
    if (typeof softPresentationBody === 'function' && (softPresentationBody(A) || softPresentationBody(B))) {
      // Observe actual closure after normal, tangent and final normal solves.
      var afterNormal = 0;
      for (var audioK = 0; audioK < 4; audioK++) {
        var audioBody = bodies[audioK], audioNode = nodes[audioK];
        afterNormal += weights[audioK] * ((audioBody.px[audioNode] - audioBody.ox[audioNode]) * nx +
          (audioBody.py[audioNode] - audioBody.oy[audioNode]) * ny);
      }
      var realIH = JELLO_TIMESCALE / h, resolved = (afterNormal + approach) * realIH;
      softPresentationContact(A, p, q, u, approach * realIH, resolved);
      softPresentationContact(B, a, c, t, approach * realIH, resolved);
    }
    A._cHits++; B._cHits++; A._pairTouched = B._pairTouched = true;
    softPairsReport.contacts++;
    softPairsReport.impulse += normal * SOFT_CONTACT_POINT_MASS * JELLO_TIMESCALE / h;
    softPairsReport.depth = Math.max(softPairsReport.depth, depth);
  }

  // Stretched skins can cross between vertices while every vertex remains
  // outside the other ring. Resolve the two intersecting material patches.
  function softPairsEdges(A, B, h) {
    var bLeft = Infinity, bRight = -Infinity, bTop = Infinity, bBottom = -Infinity;
    for (var bounds = 0; bounds < B.ringN; bounds++) {
      var boundNode = B.ring[bounds], boundX = B.px[boundNode], boundY = B.py[boundNode];
      bLeft = Math.min(bLeft, boundX); bRight = Math.max(bRight, boundX);
      bTop = Math.min(bTop, boundY); bBottom = Math.max(bBottom, boundY);
    }
    for (var i = 0; i < A.ringN; i++) {
      var p = A.ring[i], q = A.ring[(i + 1) % A.ringN];
      var px = A.px[p], py = A.py[p], qx = A.px[q], qy = A.py[q];
      var right = Math.max(px,qx), left = Math.min(px,qx), bottom = Math.max(py,qy), top = Math.min(py,qy);
      if (right <= bLeft || left >= bRight || bottom <= bTop || top >= bBottom) continue;
      var ex = qx - px, ey = qy - py;
      for (var j = 0; j < B.ringN; j++) {
        var a = B.ring[j], c = B.ring[(j + 1) % B.ringN];
        var ax = B.px[a], ay = B.py[a], cx = B.px[c], cy = B.py[c];
        if (right <= Math.min(ax,cx) || left >= Math.max(ax,cx) ||
            bottom <= Math.min(ay,cy) || top >= Math.max(ay,cy)) continue;
        var fx = cx - ax, fy = cy - ay;
        var det = ex * fy - ey * fx;
        if (Math.abs(det) < 1e-10) continue;
        var u = ((ax-px)*fy-(ay-py)*fx)/det, t = ((ax-px)*ey-(ay-py)*ex)/det;
        if (!(u > 0 && u < 1 && t > 0 && t < 1)) continue;
        var length = Math.hypot(fx,fy), nx = fy/length, ny = -fx/length;
        var oldAX = A._softPX || A.ox, oldAY = A._softPY || A.oy;
        var oldBX = B._softPX || B.ox, oldBY = B._softPY || B.oy;
        var oldGap = (oldAX[p]*(1-u)+oldAX[q]*u-oldBX[a]*(1-t)-oldBX[c]*t)*nx +
          (oldAY[p]*(1-u)+oldAY[q]*u-oldBY[a]*(1-t)-oldBY[c]*t)*ny;
        if (oldGap < 0) { nx = -nx; ny = -ny; }
        softPairsPatch(A,p,q,u,B,a,c,t,nx,ny,0.5,h);
        // A patch can move this A edge and the current B edge. Refresh A
        // immediately; the next candidate still reads B's current nodes.
        px = A.px[p]; py = A.py[p]; qx = A.px[q]; qy = A.py[q];
        right = Math.max(px,qx); left = Math.min(px,qx); bottom = Math.max(py,qy); top = Math.min(py,qy);
        ex = qx - px; ey = qy - py;
        // Only B's two patch nodes can move. Expand its conservative bounds
        // immediately before rejecting any later A edge.
        bLeft = Math.min(bLeft, B.px[a], B.px[c]); bRight = Math.max(bRight, B.px[a], B.px[c]);
        bTop = Math.min(bTop, B.py[a], B.py[c]); bBottom = Math.max(bBottom, B.py[a], B.py[c]);
      }
    }
  }

  function softPairsOneWay(A, B, h, reverse) {
    var margin = 0.10;
    for (var k = 0; k < A.ringN; k++) {
      var p = A.ring[reverse ? A.ringN - 1 - k : k], x = A.px[p], y = A.py[p];
      if (x < B._cbL - margin || x > B._cbR + margin || y < B._cbT - margin || y > B._cbB + margin) continue;
      if (!jelloPointInRing(B, x, y)) continue;
      var inside = true, best = Infinity, edge = -1, weight = 0, qx = 0, qy = 0;
      for (var e = 0; e < B.ringN; e++) {
        var a = B.ring[e], c = B.ring[(e + 1) % B.ringN];
        var ex = B.px[c] - B.px[a], ey = B.py[c] - B.py[a], den = ex * ex + ey * ey;
        if (!(den > 1e-10)) continue;
        var t = skySlimeClamp(((x - B.px[a]) * ex + (y - B.py[a]) * ey) / den, 0, 1);
        var sx = B.px[a] + ex * t, sy = B.py[a] + ey * t;
        var dx = x - sx, dy = y - sy, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; edge = e; weight = t; qx = sx; qy = sy; }
      }
      if (edge < 0 || (!inside && best >= margin * margin)) continue;
      a = B.ring[edge]; c = B.ring[(edge + 1) % B.ringN];
      var d = Math.sqrt(best), nx, ny;
      if (d > 1e-8) { nx = (x - qx) / d; ny = (y - qy) / d; if (inside) { nx = -nx; ny = -ny; } }
      else {
        ex = B.px[c] - B.px[a]; ey = B.py[c] - B.py[a];
        var length = Math.sqrt(ex * ex + ey * ey);
        nx = ey / length * B.ringSign; ny = -ex / length * B.ringSign;
      }
      softPairsProject(A, p, B, a, c, weight, nx, ny, inside ? margin + d : margin - d, h);
    }
  }

  function softPairsStep(active, count, h) {
    if (!SOFT_PAIRS || count < 2) return 0;
    var start = softPairsReport.contacts;
    for (var pass = 0; pass < 4; pass++) {
      for (var clear = 0; clear < count; clear++) active[clear]._pairTouched = false;
      var before = softPairsReport.contacts, reverse = !!((jelloFrameNo + pass) & 1);
      for (var i = 0; i < count; i++) {
        var ai = reverse ? count - 1 - i : i, A = active[ai];
        if (!softPairsBody(A)) continue;
        for (var j = i + 1; j < count; j++) {
          var B = active[reverse ? count - 1 - j : j];
          if (!softPairsBody(B) || (!A._solve && !B._solve)) continue;
          jelloRingBBox(A); jelloRingBBox(B);
          var margin = 0.1;
          if (A._cbR + margin < B._cbL || A._cbL - margin > B._cbR ||
              A._cbB + margin < B._cbT || A._cbT - margin > B._cbB) continue;
          softPairsOneWay(A, B, h, reverse);
          jelloRingBBox(A); jelloRingBBox(B);
          softPairsOneWay(B, A, h, !reverse);
          softPairsEdges(A, B, h);
        }
      }
      if (before === softPairsReport.contacts) break;
      // Pair contact and the existing orientation/terrain constraints converge
      // together. Keep the contact patch local even under a held pile load.
      for (i = 0; i < count; i++) {
        A = active[i];
        if (!softPairsBody(A) || !A._solve || !A._pairTouched) continue;
        jelloLimitOrientation(A); softContactSkin(A);
        for (var p = 0; p < A.n; p++) {
          if (jelloWorldSolidAt(A.px[p], A.py[p]) && !softTerrainPoint(A, p, h)) jelloCollidePointWorld(A, p, h);
        }
        softTerrainEdges(A, h);
      }
    }
    return softPairsReport.contacts - start;
  }
