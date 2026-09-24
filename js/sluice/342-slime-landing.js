  /* ---- Coupled rig / resident landing ----
     The rig and the gel share the small-step contact solve. A landing loads
     the actual lattice; its elastic recovery supplies the rebound. There is
     no separate ride spring, stored launch, or post-solve bowl deformation. */

  // Local volume matters as well as the outline's total area. Without it,
  // internal cells collapse onto the floor while the outer ring stays full.
  // These signed cell constraints allow shear and lateral bulging but resist
  // compression throughout the material, including cells below the tracks.
  function surfaceSlimeSolveCells(b, h) {
    var x = b.px, y = b.py, dm = b.cellInv;
    var activation = Math.max(0.015, 1 - (b.surfaceSlime.motorBlend || 0));
    var alpha = 1e-8 / (activation * activation * h * h);
    for (var t = 0; t < b.cellN; t++) {
      var a = b.cellA[t], c = b.cellB[t], d = b.cellC[t], j = t * 4;
      var inv = dm[j] * dm[j + 3] - dm[j + 1] * dm[j + 2];
      var ratio = ((x[c] - x[a]) * (y[d] - y[a]) - (y[c] - y[a]) * (x[d] - x[a])) * inv;
      var ax = (y[c] - y[d]) * inv, ay = (x[d] - x[c]) * inv;
      var cx = (y[d] - y[a]) * inv, cy = (x[a] - x[d]) * inv;
      var dx = (y[a] - y[c]) * inv, dy = (x[c] - x[a]) * inv;
      var target = 1, blend = b.surfaceSlime.motorBlend || 0;
      if (blend > 0 && b.muscleX) {
        var mx = b.muscleX, my = b.muscleY;
        var muscleArea = ((mx[c] - mx[a]) * (my[d] - my[a]) -
          (my[c] - my[a]) * (mx[d] - mx[a])) * inv;
        target += (muscleArea - 1) * blend;
      }
      var dir = ratio < target ? 1 : -1;
      if (jelloWorldSolidAt(x[a] + Math.sign(ax) * dir * 0.8, y[a])) ax = 0;
      if (jelloWorldSolidAt(x[a], y[a] + Math.sign(ay) * dir * 0.8)) ay = 0;
      if (jelloWorldSolidAt(x[c] + Math.sign(cx) * dir * 0.8, y[c])) cx = 0;
      if (jelloWorldSolidAt(x[c], y[c] + Math.sign(cy) * dir * 0.8)) cy = 0;
      if (jelloWorldSolidAt(x[d] + Math.sign(dx) * dir * 0.8, y[d])) dx = 0;
      if (jelloWorldSolidAt(x[d], y[d] + Math.sign(dy) * dir * 0.8)) dy = 0;
      var lambda = (target - ratio - alpha * b.cellLambda[t]) /
        (ax * ax + ay * ay + cx * cx + cy * cy + dx * dx + dy * dy + alpha);
      b.cellLambda[t] += lambda;
      x[a] += ax * lambda; y[a] += ay * lambda;
      x[c] += cx * lambda; y[c] += cy * lambda;
      x[d] += dx * lambda; y[d] += dy * lambda;
    }
  }

  // Resist single-vertex creases while leaving the broad squash free. The
  // reference curvature follows the current affine deformation, so spreading
  // sideways is not pulled back toward a round rest shape. These small shape
  // corrections move history too; they cannot inject a second rebound impulse.
  function surfaceSlimeSkinMove(b, i, dx, dy) {
    if (jelloWorldSolidAt(b.px[i] + dx, b.py[i])) dx = 0;
    if (jelloWorldSolidAt(b.px[i] + dx, b.py[i] + dy)) dy = 0;
    b.px[i] += dx; b.ox[i] += dx;
    b.py[i] += dy; b.oy[i] += dy;
  }

  function surfaceSlimeSmoothSkin(b, h) {
    if (!surfaceSlimeRigOwns(b) && !(b._rigRenderT > 0)) return;
    if (!isFinite(b.shL00 + b.shL01 + b.shL10 + b.shL11)) return;
    var strength = 1 - Math.exp(-12 * h / JELLO_TIMESCALE);
    if (!b.skinDX) { b.skinDX = new Float64Array(b.n); b.skinDY = new Float64Array(b.n); }
    b.skinDX.fill(0); b.skinDY.fill(0);
    for (var k = 0; k < b.ringN; k++) {
      var a = b.ring[(k + b.ringN - 1) % b.ringN], c = b.ring[k], d = b.ring[(k + 1) % b.ringN];
      var qx = b.qx[c] - (b.qx[a] + b.qx[d]) * 0.5;
      var qy = b.qy[c] - (b.qy[a] + b.qy[d]) * 0.5;
      var ex = b.px[c] - (b.px[a] + b.px[d]) * 0.5 - b.shL00 * qx - b.shL01 * qy;
      var ey = b.py[c] - (b.py[a] + b.py[d]) * 0.5 - b.shL10 * qx - b.shL11 * qy;
      var length = Math.sqrt(ex * ex + ey * ey);
      var scale = length > 0 ? Math.min(0.5, length * strength / 1.5) / length : 0;
      var dx = ex * scale, dy = ey * scale;
      b.skinDX[c] -= dx; b.skinDY[c] -= dy;
      b.skinDX[a] += dx * 0.5; b.skinDY[a] += dy * 0.5;
      b.skinDX[d] += dx * 0.5; b.skinDY[d] += dy * 0.5;
    }
    // Apply one simultaneous sweep so ring traversal cannot favor a side.
    for (k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      surfaceSlimeSkinMove(b, p, b.skinDX[p], b.skinDY[p]);
    }
  }

  // Bound each contact projection before it can mirror an incident cell.
  // A pinched cell keeps its shape; finite contact compliance absorbs the
  // remaining overlap instead of transferring it into a hard rig correction.
  function surfaceSlimeSafeDown(b, p, move) {
    var x = b.px, y = b.py, dm = b.triDmInv;
    for (var t = 0; t < b.triN; t++) {
      var a = b.triA[t], c = b.triB[t], d = b.triC[t];
      if (p !== a && p !== c && p !== d) continue;
      var j = t * 4, inv = dm[j] * dm[j + 3] - dm[j + 1] * dm[j + 2];
      var ratio = ((x[c] - x[a]) * (y[d] - y[a]) - (y[c] - y[a]) * (x[d] - x[a])) * inv;
      var gradient = (p === a ? x[d] - x[c] : p === c ? x[a] - x[d] : x[c] - x[a]) * inv;
      if (gradient < 0) move = Math.min(move, Math.max(0, (ratio - 0.12) / -gradient));
    }
    return move;
  }

  function surfaceSlimeRigOwns(b) {
    return !!(surfaceRigFrame && surfaceRigFrame.bodies.indexOf(b) >= 0);
  }

  function surfaceSlimeRigBegin(dt, ny, gravity) {
    surfaceRigFrame = null;
    if (!ENABLE_JELLO || drilling || gameOver || gameWon || player.thrusting) return false;
    var feet = player.y + PLAYER_H, nextFeet = ny + PLAYER_H;
    var bodies = [], top = Infinity;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i];
      var wasLoaded = b._rigLoaded && player._surfaceRigSupported;
      b._rigLoaded = false;
      if (!b.surfaceSlime || b._grabbed || b._carried || b.frozen) continue;
      var left = Math.max(player.x + 2, b.bboxL + 2);
      var right = Math.min(player.x + PLAYER_W - 2, b.bboxR - 2);
      if (right <= left) continue;
      var sy = Infinity;
      for (var k = 0; k <= 4; k++) {
        var y = jelloRingCross(b, true, left + (right - left) * k / 4, false);
        if (isFinite(y)) sy = Math.min(sy, y - 0.8);
      }
      // Swept feet catch a thin, already compressed resident before terrain.
      // Keep the candidate through a nearby upward departure: a recovering
      // skin can catch up within this frame and must use the same soft contact.
      if (feet > (wasLoaded ? b.bboxB : sy + 5) || Math.max(feet, nextFeet) < sy - 12) continue;
      // A low ceiling limits the rig's rise, not its ownership of this skin.
      // The swept rig constraint leaves the remaining load in the gel.
      bodies.push(b); top = Math.min(top, sy);
    }
    if (!bodies.length) return false;
    surfaceRigFrame = { bodies: bodies, dt: dt, gravity: gravity,
      y: player.y, startY: player.y, vy: player.vy - gravity * dt, hits: 0, peak: player.vy,
      impact: !player._surfaceRigSupported, top: top };
    for (i = 0; i < bodies.length; i++) {
      bodies[i]._rigHits = 0;
      bodies[i]._rigRenderT = 0.5;
      surfaceSlimeDetach(bodies[i], 0.35);
      bodies[i]._plyMs = performance.now();
    }
    player.onJello = true;
    player.onGround = true;
    player.jelloImpactVy = 0;
    player.jelloGroundT = JELLO_GROUND_COYOTE;
    return true;
  }

  function surfaceSlimeRigMove(f, target) {
    var start = f.y, delta = target - start;
    var steps = Math.max(1, Math.ceil(Math.abs(delta) / (TILE * 0.25)));
    for (var i = 1; i <= steps; i++) {
      var next = start + delta * i / steps;
      if (!solidAt(player.x, next, PLAYER_W, PLAYER_H)) { f.y = next; continue; }
      var safe = f.y, blocked = next;
      for (var k = 0; k < 10; k++) {
        var middle = (safe + blocked) * 0.5;
        if (solidAt(player.x, middle, PLAYER_W, PLAYER_H)) blocked = middle;
        else safe = middle;
      }
      f.y = safe;
      if (delta > 0) f.floor = true;
      else { f.ceiling = true; player.onCeiling = true; }
      return;
    }
  }

  function surfaceSlimeRigStep(h, steps) {
    var f = surfaceRigFrame;
    if (!f) return;
    var dt = f.dt / steps, oldY = f.y;
    f.vy += f.gravity * dt;
    surfaceSlimeRigMove(f, f.y + f.vy * dt);
    for (var pass = 0; pass < 4; pass++) {
      for (var bi = 0; bi < f.bodies.length; bi++) {
        var b = f.bodies[bi];
        var invRig = 0.42 * Math.pow(b.surfaceSlime.radius / 24, 2) / b.n;
        for (var k = 0; k < 5; k++) {
          var sample = pass & 1 ? 4 - k : k;
          var x = player.x + 2 + (PLAYER_W - 4) * sample / 4;
          var top = Infinity, ia = -1, ib = -1, u = 0;
          for (var edge = 0; edge < b.ringN; edge++) {
            var a = b.ring[edge], c = b.ring[(edge + 1) % b.ringN];
            var xa = b.px[a], xc = b.px[c];
            if (x < Math.min(xa, xc) || x > Math.max(xa, xc) || Math.abs(xc - xa) < 1e-6) continue;
            var fraction = (x - xa) / (xc - xa);
            var sy = b.py[a] + (b.py[c] - b.py[a]) * fraction;
            if (sy < top) { top = sy; ia = a; ib = c; u = fraction; }
          }
          var depth = f.y + PLAYER_H + 0.8 - top;
          if (ia < 0 || depth <= 0 || top < f.y) continue;
          var wa = 1 - u, wb = u;
          // Finite skin compliance spreads deceleration over the compression.
          // A pinched cell must not become an infinitely rigid stop for the rig.
          var compliance = 0.00005 / (dt * dt);
          var skinVY = ((b.py[ia] - b.oy[ia]) * wa + (b.py[ib] - b.oy[ib]) * wb) * JELLO_TIMESCALE / h;
          var compression = Math.max(0, depth + (f.vy - skinVY) * 0.010 * depth / (depth + 2));
          var lambda = compression / (invRig + wa * wa + wb * wb + compliance);
          var ma = surfaceSlimeSafeDown(b, ia, lambda * wa);
          if (jelloWorldSolidAt(b.px[ia], b.py[ia] + ma)) ma = 0;
          b.py[ia] += ma;
          var mb = surfaceSlimeSafeDown(b, ib, lambda * wb);
          if (jelloWorldSolidAt(b.px[ib], b.py[ib] + mb)) mb = 0;
          b.py[ib] += mb;
          surfaceSlimeRigMove(f, f.y - invRig * lambda);
          // Coulomb friction grips the tracks without freezing lateral bulge.
          // The impulse is bounded by this contact's normal load and shared
          // with the rig, so a moving resident can carry it without a motor.
          var skinVX = ((b.px[ia] - b.ox[ia]) * wa + (b.px[ib] - b.ox[ib]) * wb) * JELLO_TIMESCALE / h;
          var friction = (skinVX - player.vx) / (invRig + wa * wa + wb * wb);
          var limit = lambda / dt * 0.55;
          friction = Math.max(-limit, Math.min(limit, friction));
          b.ox[ia] += wa * friction * h / JELLO_TIMESCALE;
          b.ox[ib] += wb * friction * h / JELLO_TIMESCALE;
          player.vx += invRig * friction;
          f.hits++; b._rigHits++;
        }
        surfaceSlimeSolveCells(b, h);
        surfaceSlimeSmoothSkin(b, h);
        jelloLimitOrientation(b);
        for (var p2 = 0; p2 < b.n; p2++) {
          if (jelloWorldSolidAt(b.px[p2], b.py[p2])) jelloCollidePointWorld(b, p2, h);
        }
      }
    }
    // Position constraints exchange momentum in the same step as deformation.
    f.vy = (f.y - oldY) / dt;
    player.y = f.y; player.vy = f.vy;
  }

  function surfaceSlimeRigEnd() {
    var f = surfaceRigFrame;
    if (!f) { player._surfaceRigSupported = false; return; }
    for (var bi = 0; bi < f.bodies.length; bi++) f.bodies[bi]._rigLoaded = f.bodies[bi]._rigHits > 0;
    player.renderY += f.y - f.startY;
    player._surfaceRigSupported = f.hits > 0;
    player.onJello = f.hits > 0;
    player.onGround = player.onJello || !!f.floor;
    if (f.hits) {
      player.coyoteT = Math.max(player.coyoteT, 0.08);
      resetFlightBank();
      if (f.impact && f.peak > 120) {
        recordLandingImpact(f.peak, f.top, 'jello', 1);
        jelloSfxWobble(Math.min(1, f.peak / 600));
      }
    }
  }
