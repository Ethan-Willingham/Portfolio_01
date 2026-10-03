  /* ---- Opt-in resident contact experiment ----
     One skin contact exchanges momentum between the rig and local gel nodes.
     Rest shape, muscle targets, material parameters and world contacts belong
     to the restored baseline. ?softcontact=1 selects this path for residents. */
  var softContactParams = new URLSearchParams(location.search);
  var SOFT_CONTACT = softProjectEnabled || softContactParams.get('softcontact') === '1' ||
    (softContactParams.get('softplay') === '1' && softContactParams.get('softcontact') !== '0');
  var softContactFrame = null;
  var softContactOrigin = null;
  var softContactSupport = null;
  var softContactDraw = null;
  var SOFT_CONTACT_RIG_MASS = 3.0;
  var SOFT_CONTACT_POINT_MASS = 0.09;
  var SOFT_CONTACT_FRICTION = 0.45;
  var softContactReport = { contacts: 0, selfContacts: 0, impulse: 0, friction: 0, penetration: 0 };

  function softContactBody(b) { return SOFT_CONTACT && !!b.surfaceSlime; }

  function softContactClear() {
    softContactFrame = softContactOrigin = softContactSupport = softContactDraw = null;
  }

  function softContactSnapshot(b) {
    if (!softContactBody(b)) return;
    if (!b._softPX || b._softPX.length !== b.px.length) {
      b._softPX = new Float64Array(b.px.length); b._softPY = new Float64Array(b.py.length);
    }
    b._softPX.set(b.px); b._softPY.set(b.py);
  }

  // A skin can touch itself after folding against the floor. Point/edge
  // contact keeps the two surfaces on their previous sides without imposing
  // a target outline.
  function softContactSkin(b) {
    if (typeof softIntentBody === 'function' && softIntentBody(b)) return softIntentSkinContact(b);
    if (!b._softPX || !softContactSkinCrossed(b)) return;
    var px = b.px, py = b.py, oldX = b._softPX, oldY = b._softPY;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      for (var e = 0; e < b.ringN; e++) {
        var a = b.ring[e], c = b.ring[(e + 1) % b.ringN];
        if (p === a || p === c) continue;
        var ex = px[c] - px[a], ey = py[c] - py[a], len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        var t = ((px[p] - px[a]) * ex + (py[p] - py[a]) * ey) / (len * len);
        if (t <= 0 || t >= 1) continue;
        var before = (oldX[c] - oldX[a]) * (oldY[p] - oldY[a]) -
          (oldY[c] - oldY[a]) * (oldX[p] - oldX[a]);
        var side = before < 0 ? -1 : 1;
        var nx = -ey / len * side, ny = ex / len * side;
        var d = (px[p] - px[a]) * nx + (py[p] - py[a]) * ny;
        if (d >= 0) continue;
        // A changing line normal alone is not self-contact. One of this
        // vertex's incident skin segments must actually cross the edge.
        var prev = b.ring[(k + b.ringN - 1) % b.ringN], next = b.ring[(k + 1) % b.ringN];
        if (!softContactEdgesCross(b, p, prev, a, c) && !softContactEdgesCross(b, p, next, a, c)) continue;
        var wa = 1 - t, wc = t;
        var mxP = jelloWorldSolidAt(px[p] + nx * 0.5, py[p]) ? 0 : 1;
        var myP = jelloWorldSolidAt(px[p], py[p] + ny * 0.5) ? 0 : 1;
        var mxA = jelloWorldSolidAt(px[a] - nx * 0.5, py[a]) ? 0 : 1;
        var myA = jelloWorldSolidAt(px[a], py[a] - ny * 0.5) ? 0 : 1;
        var mxC = jelloWorldSolidAt(px[c] - nx * 0.5, py[c]) ? 0 : 1;
        var myC = jelloWorldSolidAt(px[c], py[c] - ny * 0.5) ? 0 : 1;
        var den = nx * nx * (mxP + mxA * wa * wa + mxC * wc * wc) +
          ny * ny * (myP + myA * wa * wa + myC * wc * wc);
        if (den < 1e-8) continue;
        var dl = (0.10 - d) / den;
        var vx = px[p] - b.ox[p] - (px[a] - b.ox[a]) * wa - (px[c] - b.ox[c]) * wc;
        var vy = py[p] - b.oy[p] - (py[a] - b.oy[a]) * wa - (py[c] - b.oy[c]) * wc;
        var impulse = Math.max(0, -(vx * nx + vy * ny)) / den;
        px[p] += nx * dl * mxP; py[p] += ny * dl * myP;
        px[a] -= nx * dl * wa * mxA; py[a] -= ny * dl * wa * myA;
        px[c] -= nx * dl * wc * mxC; py[c] -= ny * dl * wc * myC;
        b.ox[p] += nx * (dl - impulse) * mxP; b.oy[p] += ny * (dl - impulse) * myP;
        b.ox[a] -= nx * (dl - impulse) * wa * mxA; b.oy[a] -= ny * (dl - impulse) * wa * myA;
        b.ox[c] -= nx * (dl - impulse) * wc * mxC; b.oy[c] -= ny * (dl - impulse) * wc * myC;
        softContactReport.selfContacts++;
      }
    }
  }

  // A correction below requires a proper skin crossing. Most contact passes
  // have none, and several visit exactly the same ring before anything moves
  // it. Remember only a proven clear pose, comparing the actual coordinates
  // so every solver, grab and terrain correction invalidates it automatically.
  // Previous-position history cannot create a crossing in an unchanged ring.
  function softContactSkinCrossed(b) {
    var ring = b.ring, n = b.ringN, px = b.px, py = b.py;
    var clearX = b._softClearX, clearY = b._softClearY;
    var intentMode = typeof softIntentBody === 'function' && softIntentBody(b);
    if (clearX && clearX.length === n && !!b._softClearIntent === intentMode) {
      var same = true;
      for (var k = 0; k < n; k++) {
        var p = ring[k];
        if (px[p] !== clearX[k] || py[p] !== clearY[k]) { same = false; break; }
      }
      if (same) return false;
    }
    for (var a = 0; a < n; a++) {
      var p0 = ring[a], p1 = ring[(a + 1) % n];
      var left = Math.min(px[p0], px[p1]), right = Math.max(px[p0], px[p1]);
      var top = Math.min(py[p0], py[p1]), bottom = Math.max(py[p0], py[p1]);
      for (var c = a + 2; c < n; c++) {
        if (a === 0 && c === n - 1) continue;
        var q0 = ring[c], q1 = ring[(c + 1) % n];
        // Strictly disjoint bounds also exclude collinear intent overlap.
        // Touching bounds retain the existing proper-crossing/overlap test.
        if ((px[q0] < left && px[q1] < left) || (px[q0] > right && px[q1] > right) ||
            (py[q0] < top && py[q1] < top) || (py[q0] > bottom && py[q1] > bottom)) continue;
        if (softContactEdgesCross(b, p0, p1, q0, q1)) return true;
      }
    }
    if (!clearX || clearX.length !== n) {
      clearX = b._softClearX = new Float64Array(n);
      clearY = b._softClearY = new Float64Array(n);
    }
    b._softClearIntent = intentMode;
    for (var i = 0; i < n; i++) { clearX[i] = px[ring[i]]; clearY[i] = py[ring[i]]; }
    return false;
  }

  function softContactEdgesCross(b, p, q, a, c) {
    if (p === a || p === c || q === a || q === c) return false;
    var ex = b.px[c] - b.px[a], ey = b.py[c] - b.py[a];
    var dp = ex * (b.py[p] - b.py[a]) - ey * (b.px[p] - b.px[a]);
    var dq = ex * (b.py[q] - b.py[a]) - ey * (b.px[q] - b.px[a]);
    var vx = b.px[q] - b.px[p], vy = b.py[q] - b.py[p];
    var da = vx * (b.py[a] - b.py[p]) - vy * (b.px[a] - b.px[p]);
    var dc = vx * (b.py[c] - b.py[p]) - vy * (b.px[c] - b.px[p]);
    return (dp * dq < 0 && da * dc < 0) ||
      (typeof softIntentBody === 'function' && softIntentBody(b) && softIntentEdgesOverlap(b, p, q, a, c));
  }

  function softContactCapture() {
    if (!SOFT_CONTACT) return;
    softContactOrigin = { x: player.x, y: player.y };
  }

  function softContactPrepare(dt) {
    if (!SOFT_CONTACT || !softContactOrigin) return;
    var pending = softContactFrame;
    var start = pending && !pending.started ? { x: pending.x, y: pending.y } : softContactOrigin;
    softContactFrame = { x: start.x, y: start.y,
      dx: player.x - start.x, dy: player.y - start.y,
      vx: player.vx, vy: player.vy, dt: dt + (pending && !pending.started ? pending.dt : 0), started: false, support: false,
      hit: false, endX: player.x, endY: player.y };
    softContactOrigin = null;
  }

  // Axis sweeps retain terrain collision during any contact deflection.
  function softContactMove(rig, dx, dy) {
    var count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
    dx /= count; dy /= count;
    for (var i = 0; i < count; i++) {
      if (!solidAt(rig.x + dx, rig.y, PLAYER_W, PLAYER_H)) rig.x += dx;
      else { rig.vx = 0; dx = 0; }
      if (!solidAt(rig.x, rig.y + dy, PLAYER_W, PLAYER_H)) rig.y += dy;
      else { if (dy > 0) rig.onGround = true; rig.vy = 0; dy = 0; }
    }
  }

  function softContactStep(active, count, h, steps) {
    if (!SOFT_CONTACT || !player || bathMode || gameOver || gameWon) return;
    var f = softContactFrame;
    if (!f || !(steps > 0)) return;
    if (!f.started) {
      f.started = true;
      // Preserve any hard-circle correction made after normal movement.
      f.step = 0;
      f.rig = { x: f.x + player.x - f.endX, y: f.y + player.y - f.endY,
        vx: player.vx, vy: player.vy, onGround: player.onGround };
      f.vx = player.vx; f.vy = player.vy;
      f.endX = player.x; f.endY = player.y;
      softContactReport.contacts = softContactReport.selfContacts = softContactReport.impulse = softContactReport.friction = softContactReport.penetration = 0;
    }
    var rig = f.rig;
    if (f.step++ % Math.max(1, Math.round(JELLO_H / h)) === 0) { f.previousX = rig.x; f.previousY = rig.y; }
    var realH = h / JELLO_TIMESCALE, frameH = f.dt / steps;
    softContactMove(rig, f.dx / steps + (rig.vx - f.vx) * frameH,
      f.dy / steps + (rig.vy - f.vy) * frameH);
    f.support = false;
    // Sample the rounded hull and flat track base. Forces distribute to the
    // actual skin edge's two material nodes.
    for (var pass = 0; pass < 4; pass++) {
      for (var bi = 0; bi < count; bi++) {
        var b = active[bi];
        if (!softContactBody(b) || b.frozen) continue;
        softContactSkin(b);
        jelloRingBBox(b);
        var hull = rigContactHull(rig.x, rig.y);
        if (b._cbR < hull.l - 4 || b._cbL > hull.r + 4 ||
            b._cbB < hull.t - 4 || b._cbT > hull.b + 4) continue;
        // The reverse vertex/face test matters: a narrow fold can enter the
        // hull without enclosing any of its perimeter samples.
        for (var rk = 0; rk < b.ringN; rk++) {
          var p = b.ring[rk], px = b.px[p], py = b.py[p];
          var contact = rigHullQuery(rigContactHull(rig.x, rig.y), px, py);
          if (!(contact.distance < 0)) continue;
          softContactProject(b, p, p, 0, -contact.nx, -contact.ny,
            -contact.distance, contact.y, realH, f);
        }
        var hullN = hull.n;
        for (var side = 0; side < hullN; side++) {
          hull = rigContactHull(rig.x, rig.y);
          var next = (side + 1) % hullN;
          var samples = Math.max(1, Math.ceil(Math.hypot(hull.x[next] - hull.x[side],
            hull.y[next] - hull.y[side]) / 3));
          for (var sample = 0; sample < samples; sample++) {
            var u = sample / samples;
            // Contact moves the rig during this sweep. Refresh its translated
            // perimeter before each sample, as with the reverse vertex test.
            hull = rigContactHull(rig.x, rig.y);
            var sx = hull.x[side] + (hull.x[next] - hull.x[side]) * u;
            var sy = hull.y[side] + (hull.y[next] - hull.y[side]) * u;
            if (!jelloPointInRing(b, sx, sy)) continue;
            softContactSolve(b, sx, sy, realH, f);
          }
        }
        // Contact and the baseline's orientation constraint must converge
        // together. Leaving contact as the final mover can mirror a thin
        // edge cell until the next material tick, even with a clear hull.
        jelloLimitOrientation(b);
        for (var wi = 0; wi < b.n; wi++) {
          if (jelloWorldSolidAt(b.px[wi], b.py[wi])) jelloCollidePointWorld(b, wi, h);
        }
        softContactSkin(b);
      }
    }
  }

  function softContactSolve(b, sx, sy, dt, f) {
    var best = Infinity, a = 0, c = 0, t = 0, qx = 0, qy = 0;
    for (var k = 0; k < b.ringN; k++) {
      var i = b.ring[k], j = b.ring[(k + 1) % b.ringN];
      var ex = b.px[j] - b.px[i], ey = b.py[j] - b.py[i];
      var den = ex * ex + ey * ey;
      var u = den > 1e-10 ? skySlimeClamp(((sx - b.px[i]) * ex + (sy - b.py[i]) * ey) / den, 0, 1) : 0;
      var x = b.px[i] + ex * u, y = b.py[i] + ey * u;
      var d2 = (x - sx) * (x - sx) + (y - sy) * (y - sy);
      if (d2 < best) { best = d2; a = i; c = j; t = u; qx = x; qy = y; }
    }
    var depth = Math.sqrt(best);
    if (!(depth > 0.000001)) return;
    var nx = (qx - sx) / depth, ny = (qy - sy) / depth;
    softContactProject(b, a, c, t, nx, ny, depth, sy, dt, f);
  }

  function softContactProject(b, a, c, t, nx, ny, depth, sy, dt, f) {
    var rig = f.rig;
    var wa = 1 - t, wc = t, invPoint = 1 / SOFT_CONTACT_POINT_MASS;
    var invRig = 1 / SOFT_CONTACT_RIG_MASS;
    var rx = solidAt(rig.x + nx * 0.5, rig.y, PLAYER_W, PLAYER_H) ? 0 : invRig;
    var ry = solidAt(rig.x, rig.y + ny * 0.5, PLAYER_W, PLAYER_H) ? 0 : invRig;
    var effective = rx * nx * nx + ry * ny * ny + invPoint * (wa * wa + wc * wc);
    var avx = (b.px[a] - b.ox[a]) / dt, avy = (b.py[a] - b.oy[a]) / dt;
    var cvx = (b.px[c] - b.ox[c]) / dt, cvy = (b.py[c] - b.oy[c]) / dt;
    var rvx = rig.vx - avx * wa - cvx * wc, rvy = rig.vy - avy * wa - cvy * wc;
    // No restitution kick or banked landing speed. The baseline gel's own
    // springs recover the deformation this unilateral contact produces.
    var lambda = Math.min(depth + 0.03, 2) / effective;
    var dx = nx * lambda, dy = ny * lambda;
    rig.x += dx * rx; rig.y += dy * ry;
    rig.vx += dx * rx / dt; rig.vy += dy * ry / dt;
    b.px[a] -= dx * invPoint * wa; b.py[a] -= dy * invPoint * wa;
    b.px[c] -= dx * invPoint * wc; b.py[c] -= dy * invPoint * wc;
    var normalImpulse = lambda / dt;
    // Friction is bounded by the normal impulse. A glancing impact can roll
    // the body because its impulse acts on the contacted patch, not its center.
    var tx = -ny, ty = nx, tangent = rvx * tx + rvy * ty;
    var tangentMass = invRig + invPoint * (wa * wa + wc * wc);
    var jt = skySlimeClamp(-tangent / tangentMass,
      -normalImpulse * SOFT_CONTACT_FRICTION, normalImpulse * SOFT_CONTACT_FRICTION);
    var ivx = tx * jt, ivy = ty * jt;
    rig.vx += ivx * rx; rig.vy += ivy * ry;
    b.ox[a] += ivx * invPoint * wa * dt; b.oy[a] += ivy * invPoint * wa * dt;
    b.ox[c] += ivx * invPoint * wc * dt; b.oy[c] += ivy * invPoint * wc * dt;
    if (ny < -0.5 && sy > rig.y + PLAYER_H * 0.65) { f.support = true; f.supportBody = b; }
    if (!f.hit && ny < -0.5 && f.vy > 120) recordLandingImpact(f.vy, sy, 'jello', 1);
    f.hit = true;
    if (-(rvx * nx + rvy * ny) > 35 || Math.abs(f.vx) > 25) b._plyMs = performance.now();
    b.sleeping = false; b.sleepFrames = 0;
    if (typeof softPresentationBody === 'function' && softPresentationBody(b)) {
      // dt is already real seconds here; include any masked friction coupling
      // in the measured change of relative normal speed.
      var afterRVX = rig.vx - ((b.px[a] - b.ox[a]) * wa + (b.px[c] - b.ox[c]) * wc) / dt;
      var afterRVY = rig.vy - ((b.py[a] - b.oy[a]) * wa + (b.py[c] - b.oy[c]) * wc) / dt;
      softPresentationContact(b, a, c, t, -(rvx * nx + rvy * ny),
        (afterRVX - rvx) * nx + (afterRVY - rvy) * ny);
    }
    softContactReport.contacts++;
    softContactReport.impulse += normalImpulse;
    softContactReport.friction += Math.abs(jt);
    softContactReport.penetration = Math.max(softContactReport.penetration, depth);
  }

  function softContactFinish() {
    var f = softContactFrame;
    if (!SOFT_CONTACT || !f || !f.started) return;
    if (f.hit) {
      player.x = f.rig.x; player.y = f.rig.y;
      player.vx += f.rig.vx - f.vx; player.vy += f.rig.vy - f.vy;
    }
    if (f.support && !player.thrusting) {
      player.onGround = true; player.onJello = true;
      player.coyoteT = Math.max(player.coyoteT, 0.08);
      resetFlightBank();
    }
    softContactSupport = f.support ? f.supportBody : null;
    if (f.hit) { player.jelloImpactVy = 0; player.jelloCarryVx = 0; }
    // Match the existing 120 Hz skin interpolation at every trial frame.
    // Drawing never changes collision positions or feeds motion into the solve.
    softContactDraw = { x: f.previousX, y: f.previousY, endX: player.x, endY: player.y };
    softContactInterpolate();
    softContactFrame = null;
  }

  function softContactInterpolate() {
    if (!softContactDraw) return;
    var d = softContactDraw, alpha = skySlimeClamp(jelloAccum / JELLO_H, 0, 1);
    player.renderX = d.x + (d.endX - d.x) * alpha;
    player.renderY = d.y + (d.endY - d.y) * alpha;
  }

  // Display frames can outnumber gel ticks. Retain a real supporting contact
  // between ticks only while the feet remain on that skin, without a pose hold.
  function softContactIdle() {
    if (!SOFT_CONTACT || !softContactFrame) return;
    softContactInterpolate();
    var b = softContactSupport;
    if (!b || player.thrusting || jelloBodies.indexOf(b) < 0) return;
    var hull = rigContactHull();
    for (var side = 0; side < hull.n; side++) {
      if (hull.ny[side] <= 0.5) continue;
      var next = (side + 1) % hull.n;
      for (var sample = 1; sample < 4; sample++) {
        var u = sample / 4;
        var x = hull.x[side] + (hull.x[next] - hull.x[side]) * u;
        var footY = hull.y[side] + (hull.y[next] - hull.y[side]) * u;
        var y = Infinity, vy = 0;
        for (var k = 0; k < b.ringN; k++) {
          var a = b.ring[k], c = b.ring[(k + 1) % b.ringN], ex = b.px[c] - b.px[a];
          if (Math.abs(ex) < 1e-8) continue;
          var t = (x - b.px[a]) / ex;
          if (t < 0 || t > 1) continue;
          var edgeY = b.py[a] + (b.py[c] - b.py[a]) * t;
          if (edgeY < y) {
            y = edgeY;
            vy = ((b.py[a] - b.oy[a]) * (1 - t) + (b.py[c] - b.oy[c]) * t) / jelloStepH * JELLO_TIMESCALE;
          }
        }
        if (Math.abs(footY - y) <= 1.5 && player.vy - vy >= -1) {
          player.onGround = true; player.onJello = true;
          player.coyoteT = Math.max(player.coyoteT, 0.08);
          return;
        }
      }
    }
  }
