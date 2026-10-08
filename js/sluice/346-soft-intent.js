  /* ---- Resident effort: local rest strain and finite terrain traction ----
     The brain chooses a direction. Springs spend effort and exposed skin
     contacts provide traction. No desired silhouette or body velocity is
     imposed, so loads, lost footing and interference can defeat that effort. */
  var SOFT_INTENT_STRAIN = 0.18;
  var SOFT_INTENT_REST_RATE = 0.65;
  var SOFT_INTENT_GRIP_RANGE = 3.6;
  var SOFT_INTENT_GRIP_WEIGHT = 2.2;

  function softIntentBody(b) { return SOFT_INTENT && !!b.surfaceSlime; }

  function softIntentInit(b) {
    var m = b.surfaceSlime;
    if (!m.intent) {
      m.intent = { tx: m.dir, ty: 0, nx: 0, ny: -1, effort: 0, phase: m.phase || 0,
        supported: false, lastX: b.cx, lastY: b.cy, stalled: 0,
        gripForce: 0, peakGripForce: 0, slips: 0,
        search: new Float32Array(b.n) };
      m.anchors.fill(null); m.contacts = 0;
    }
    return m.intent;
  }

  function softIntentThink(b, dt) {
    if (!softIntentBody(b) || !(dt > 0)) return;
    var m = b.surfaceSlime, intent = softIntentInit(b);
    surfaceSlimeMaterialFrame(b);
    m.detach = Math.max(0, m.detach - dt);
    m.edgePause = Math.max(0, m.edgePause - dt);
    m.edgeTurn = Math.max(0, m.edgeTurn - dt);
    var touched = b._plyMs && b._plyMs !== m.lastPlayerMs;
    m.lastPlayerMs = b._plyMs;
    if (b._grabbed || b._carried || touched) surfaceSlimeDetach(b, 0.85);
    if (m.detach > 0 || b._grabbed || b._carried) {
      intent.supported = false; m.drive = false; return;
    }
    var supported = false, wall = null, floorY = null;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k], near = surfaceSlimeTerrainNear(b.px[p], b.py[p], SOFT_INTENT_GRIP_RANGE + 1);
      var bond = m.anchors[p];
      if (bond && tileAt(bond.r, bond.c) && bond.nx * m.dir < -0.65) { wall = bond; supported = true; }
      if (!near || near.ny > 0.6) continue;
      if (near.ny < -0.55) { supported = true; floorY = near.y; }
      if (near.nx * m.dir < -0.65 && (b.px[p] - b.cx) * m.dir > 0 &&
          b.py[p] < b.cy + m.radius * 0.55) { wall = near; supported = true; }
    }
    intent.supported = supported;
    m.floorY = floorY;
    m.reorient = !supported;
    m.climb = !!wall;
    // Direction changes are decisions only. A creature already sliding,
    // falling or being crushed receives no velocity cancellation here.
    if (m.goalDir !== m.dir) {
      m.goalDir = m.dir; m.goalX = b.cx + m.dir * TILE * (3 + m.seed * 2);
    }
    if (m.state === 'crawl' && !wall && (m.goalX - b.cx) * m.dir < m.radius * 0.35) m.timer = 0;
    if (supported && (m.timer <= 0 || m.state === 'tumble')) {
      m.state = m.state === 'crawl' || m.state === 'climb' ? 'idle' : 'crawl';
      m.timer = m.state === 'idle' ? 1.2 + surfaceSlimeRandom(m) * 1.8 : 16 + surfaceSlimeRandom(m) * 10;
      if (m.state === 'crawl') {
        if (Math.abs(b.cx - m.home) > TILE * 8) m.dir = b.cx < m.home ? 1 : -1;
        else if (surfaceSlimeRandom(m) < 0.20) m.dir *= -1;
        m.goalDir = m.dir; m.goalX = b.cx + m.dir * TILE * (3 + surfaceSlimeRandom(m) * 3);
      }
    }
    if (wall && m.state !== 'idle') m.state = 'climb';
    else if (!wall && m.state === 'climb') m.state = 'crawl';
    if (!wall && floorY !== null && !m.wet && !m.edgeTurn) {
      var look = m.radius * 1.25;
      for (var ahead = 4; ahead <= look; ahead += 4) {
        if (jelloWorldSolidAt(b.cx + m.dir * ahead, floorY + 1)) continue;
        m.dir *= -1; m.edgePause = 0.45; m.edgeTurn = 1.5;
        m.goalDir = m.dir; m.goalX = b.cx + m.dir * TILE * 4;
        break;
      }
    }
    var progress = Math.hypot(b.cx - intent.lastX, b.cy - intent.lastY);
    intent.lastX = b.cx; intent.lastY = b.cy;
    intent.stalled = supported && m.state !== 'idle' && progress < dt * 0.12 ? intent.stalled + dt : 0;
    if (intent.stalled > 6) {
      m.dir *= -1; m.timer = 0; intent.stalled = 0;
      m.goalDir = m.dir; m.goalX = b.cx + m.dir * TILE * 4;
    }
    // Read the contact frame; never rotate the body into that frame.
    var tx = wall ? 0 : m.dir, ty = wall ? -1 : 0;
    var angle = Math.atan2(intent.ty, intent.tx), target = Math.atan2(ty, tx);
    var delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    angle += skySlimeClamp(delta, -dt * 5, dt * 5);
    intent.tx = Math.cos(angle); intent.ty = Math.sin(angle);
    intent.nx = intent.ty * m.dir; intent.ny = -intent.tx * m.dir;
    m.drive = supported && !m.wet;
    if (m.drive) { b.sleeping = false; b.sleepFrames = 0; }
  }

  function softIntentMuscleStep(b, h) {
    if (!softIntentBody(b) || !(h > 0)) return;
    var m = b.surfaceSlime, intent = softIntentInit(b), dt = h / JELLO_TIMESCALE;
    var active = intent.supported && m.drive && m.state !== 'idle' && !m.edgePause &&
      !m.detach && !b._grabbed && !b._carried && !m.wet;
    intent.effort += ((active ? 1 : 0) - intent.effort) * Math.min(1, dt * 2.4);
    m.power = intent.effort; m.motorBlend = 0;
    intent.phase += dt * 3.8 * (0.94 + m.seed * 0.12) * intent.effort;
    m.phase = intent.phase;
    var c = Math.cos(m.materialAngle), s = Math.sin(m.materialAngle);
    var tx = c * intent.tx + s * intent.ty, ty = -s * intent.tx + c * intent.ty;
    var nx = c * intent.nx + s * intent.ny, ny = -s * intent.nx + c * intent.ny;
    var invRadius = 1 / Math.max(1, m.radius), wavelength = 2.5;
    var qx = b.qx, qy = b.qy, sA = b.sA, sB = b.sB, springN = b.springN;
    var muscleRest = b.muscleRest, springRest = b.sRest, waveCos = m.waveCos;
    var effort = intent.effort, intentPhase = intent.phase, pointN = b.n;
    for (var p = 0; p < pointN; p++) {
      var u = (qx[p] * tx + qy[p] * ty) * invRadius;
      waveCos[p] = Math.cos(intentPhase + u * wavelength);
    }
    // Intent and the material frame are sampled once per outer update. Their
    // rest-mesh projections stay identical through its material microsteps.
    var projection = m.springProjection;
    if (!projection || projection.n !== springN) {
      projection = m.springProjection = { n: springN, along: new Float64Array(springN),
        across: new Float64Array(springN), length2: new Float64Array(springN),
        phase: new Float64Array(springN) };
    }
    var projectedAlong = projection.along, projectedAcross = projection.across;
    var projectedLength2 = projection.length2, projectedPhase = projection.phase;
    if (projection.tx !== tx || projection.ty !== ty || projection.nx !== nx || projection.ny !== ny ||
        projection.invRadius !== invRadius || projection.version !== b._contactRestVersion ||
        projection.qx !== qx || projection.qy !== qy || projection.sA !== sA || projection.sB !== sB) {
      projection.tx = tx; projection.ty = ty; projection.nx = nx; projection.ny = ny;
      projection.invRadius = invRadius; projection.version = b._contactRestVersion;
      projection.qx = qx; projection.qy = qy; projection.sA = sA; projection.sB = sB;
      for (var si = 0; si < springN; si++) {
        var qa = sA[si], qz = sB[si];
        var qdx = qx[qz] - qx[qa], qdy = qy[qz] - qy[qa];
        projectedLength2[si] = qdx * qdx + qdy * qdy;
        projectedAlong[si] = qdx * tx + qdy * ty;
        projectedAcross[si] = qdx * nx + qdy * ny;
        var qu = ((qx[qa] + qx[qz]) * tx + (qy[qa] + qy[qz]) * ty) * invRadius * 0.5;
        projectedPhase[si] = qu * wavelength;
      }
    }
    for (var spring = 0; spring < springN; spring++) {
      var rest = muscleRest[spring], length2 = projectedLength2[spring];
      var along = projectedAlong[spring], across = projectedAcross[spring];
      var phase = intentPhase + projectedPhase[spring];
      // A local, area-preserving strain metric combines longitudinal
      // shortening with shear. Its travelling shear lifts the advancing
      // skin while the contracting patch supplies terrain traction.
      var axial = 0.12 * effort * Math.cos(phase);
      var shear = -0.30 * effort * Math.sin(phase);
      var stretch = 1 + axial;
      var localX = along * stretch, localY = across / stretch + along * shear;
      var ratio = length2 > 1e-9 ? Math.sqrt((localX * localX + localY * localY) / length2) : 1;
      var target = rest * skySlimeClamp(ratio, 1 - SOFT_INTENT_STRAIN, 1 + SOFT_INTENT_STRAIN);
      var cap = rest * SOFT_INTENT_REST_RATE * dt;
      springRest[spring] += skySlimeClamp(target - springRest[spring], -cap, cap);
    }
  }

  function softIntentAdhesion(b, h) {
    if (!softIntentBody(b) || !(h > 0)) return;
    var m = b.surfaceSlime, intent = softIntentInit(b), dt = h / JELLO_TIMESCALE;
    intent.gripForce = 0;
    if (m.wet || !intent.supported || m.detach > 0 || b._grabbed || b._carried) {
      m.anchors.fill(null); m.contacts = 0; return;
    }
    var holding = m.state === 'idle' || m.edgePause > 0, wallBonds = 0;
    for (var q = 0; q < b.ringN; q++) { var bond = m.anchors[b.ring[q]]; if (bond && !bond.releasing && bond.nx * m.dir < -0.65) wallBonds++; }
    var contacts = 0, weight = 0, breakRange = m.radius * 0.36;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k], anchor = m.anchors[p];
      intent.search[p] -= dt;
      if (anchor && !holding && intent.effort > 0.01) {
        // Active mucus can shear along a face. Follow only the measured
        // tangential slip, never a planned step or destination.
        var dx = b.px[p] - anchor.x, dy = b.py[p] - anchor.y;
        var normalGap = dx * anchor.nx + dy * anchor.ny;
        anchor.x += dx - normalGap * anchor.nx; anchor.y += dy - normalGap * anchor.ny;
        var supportX = anchor.x - anchor.nx * anchor.gap;
        var supportY = anchor.y - anchor.ny * anchor.gap;
        anchor.r = Math.floor((supportY - anchor.ny * 0.7) / TILE);
        anchor.c = Math.floor((supportX - anchor.nx * 0.7) / TILE);
      }
      if (anchor && (!tileAt(anchor.r, anchor.c) ||
          Math.hypot(anchor.x - b.px[p], anchor.y - b.py[p]) > breakRange)) {
        m.anchors[p] = anchor = null; intent.search[p] = 0.12; intent.slips++;
      }
      if (anchor && !anchor.releasing && ((!holding && m.waveCos[p] > 0.15 &&
          (!m.climb || anchor.nx * m.dir > -0.65 || wallBonds > 2)) ||
          (m.climb && wallBonds > 1 && anchor.ny < -0.65))) {
        anchor.releasing = true;
        if (anchor.nx * m.dir < -0.65) wallBonds--;
      }
      if (!anchor && intent.search[p] <= 0 && (holding || m.climb || m.waveCos[p] < -0.1)) {
        intent.search[p] = 0.04;
        var near = surfaceSlimeTerrainNear(b.px[p], b.py[p], SOFT_INTENT_GRIP_RANGE);
        if (near && near.ny < 0.6 && !(m.climb && wallBonds > 1 && near.ny < -0.65)) {
          // Bond at the current skin position, so attaching adds no spring
          // energy. Active tangential slip updates the bond along its face.
          anchor = { x: b.px[p], y: b.py[p], r: near.r, c: near.c,
            nx: near.nx, ny: near.ny, gap: (b.px[p] - near.x) * near.nx + (b.py[p] - near.y) * near.ny, strength: 0, overload: 0, releasing: false };
          m.anchors[p] = anchor;
        }
      }
      if (!anchor) continue;
      anchor.strength = skySlimeClamp(anchor.strength + dt * (anchor.releasing ? -14 : 10), 0, 1);
      if (!(anchor.strength > 0)) { m.anchors[p] = null; continue; }
      weight += anchor.strength; contacts++;
    }
    m.contacts = contacts;
    if (!(weight > 0)) return;
    // This is an external force budget, measured in body weights, shared by
    // every foot. More skin nodes cannot secretly make a stronger creature.
    var budget = GRAVITY * b.n * SOFT_INTENT_GRIP_WEIGHT;
    var stiffness = 3600, damping = 85;
    var drive = GRAVITY * b.n * 1.30 * intent.effort / weight;
    var implicit = 1 / (1 + damping * dt + stiffness * dt * dt);
    for (k = 0; k < b.ringN; k++) {
      p = b.ring[k]; anchor = m.anchors[p];
      if (!anchor) continue;
      var vx = (b.px[p] - b.ox[p]) / dt, vy = (b.py[p] - b.oy[p]) / dt;
      var ax = ((anchor.x - b.px[p]) * stiffness - damping * vx) * implicit * anchor.strength;
      var ay = ((anchor.y - b.py[p]) * stiffness - damping * vy) * implicit * anchor.strength;
      // Active cortical shear acts only through a bonded patch and only
      // along its actual terrain face. This is bounded ground reaction,
      // not a command for the center of mass to reach a speed or position.
      var normal = intent.tx * anchor.nx + intent.ty * anchor.ny;
      ax += (intent.tx - normal * anchor.nx) * drive * anchor.strength;
      ay += (intent.ty - normal * anchor.ny) * drive * anchor.strength;
      var force = Math.hypot(ax, ay), cap = Math.min(budget / weight, GRAVITY * b.n * 0.60) * anchor.strength;
      if (force > cap) {
        ax *= cap / force; ay *= cap / force;
        anchor.overload += dt;
      } else anchor.overload = Math.max(0, anchor.overload - dt * 2);
      if (anchor.overload > 0.075) {
        m.anchors[p] = null; intent.search[p] = 0.16; intent.slips++; m.contacts--; continue;
      }
      intent.gripForce += Math.min(force, cap);
      // Verlet receives F dt^2, leaving history alone. This cannot teleport
      // a node to its anchor or cancel an arbitrarily large incoming impulse.
      b.px[p] += ax * dt * dt; b.py[p] += ay * dt * dt;
    }
    intent.peakGripForce = Math.max(intent.peakGripForce, intent.gripForce);
  }

  // Resolve moving-edge contact at its actual crossing time. A collinear
  // overlap has no crossing normal, so that degeneracy uses the smallest
  // local separation. Neither path prescribes the body outline or velocity.
  function softIntentSkinContact(b) {
    if (!b._softPX || !softContactSkinCrossed(b)) return;
    var px = b.px, py = b.py, ring = b.ring, count = b.ringN;
    for (var first = 0; first < count; first++) {
      var a = ring[first], c = ring[(first + 1) % count];
      for (var second = first + 2; second < count; second++) {
        if (first === 0 && second === count - 1) continue;
        var p = ring[second], q = ring[(second + 1) % count];
        if (!softContactEdgesCross(b, a, c, p, q)) continue;
        var best = null;
        candidate(a, c, p, q); candidate(c, a, p, q);
        candidate(p, q, a, c); candidate(q, p, a, c);
        if (!best) continue;
        softIntentSkinApply(b, best);
      }
    }
    if (softContactSkinCrossed(b)) softIntentSkinFallback(b);
    function candidate(v, other, e, f) {
      var oldX = b._softPX, oldY = b._softPY;
      var ex = oldX[f] - oldX[e], ey = oldY[f] - oldY[e];
      var rx = oldX[v] - oldX[e], ry = oldY[v] - oldY[e];
      var ax = px[e] - oldX[e], ay = py[e] - oldY[e];
      var dex = px[f] - oldX[f] - ax, dey = py[f] - oldY[f] - ay;
      var drx = px[v] - oldX[v] - ax, dry = py[v] - oldY[v] - ay;
      var q0 = ex * ry - ey * rx;
      var q1 = dex * ry - dey * rx + ex * dry - ey * drx;
      var q2 = dex * dry - dey * drx, roots = [];
      if (Math.abs(q2) < 1e-12) {
        if (Math.abs(q1) > 1e-12) roots.push(-q0 / q1);
      } else {
        var discriminant = q1 * q1 - 4 * q2 * q0;
        if (discriminant < 0) return;
        var square = Math.sqrt(discriminant);
        roots.push((-q1 - square) / (2 * q2), (-q1 + square) / (2 * q2));
      }
      roots.sort(function(u, w) { return u - w; });
      var time = -1, t = 0, nx = 0, ny = 0;
      for (var root = 0; root < roots.length; root++) {
        var when = roots[root];
        if (!(when >= -1e-8 && when <= 1 + 1e-8)) continue;
        when = skySlimeClamp(when, 0, 1);
        var hx = ex + dex * when, hy = ey + dey * when, length2 = hx * hx + hy * hy;
        if (!(length2 > 1e-10)) continue;
        var u = ((rx + drx * when) * hx + (ry + dry * when) * hy) / length2;
        if (!(u >= -1e-8 && u <= 1 + 1e-8)) continue;
        var side = -(q1 + 2 * q2 * when);
        if (when < 1e-7) side = ex * (oldY[other] - oldY[e]) - ey * (oldX[other] - oldX[e]);
        if (Math.abs(side) < 1e-10) continue;
        var sign = side < 0 ? -1 : 1;
        nx = -hy / Math.sqrt(length2) * sign; ny = hx / Math.sqrt(length2) * sign;
        t = skySlimeClamp(u, 0, 1); time = when; break;
      }
      if (time < 0) return;
      var gap = (px[v] - px[e] * (1 - t) - px[f] * t) * nx +
        (py[v] - py[e] * (1 - t) - py[f] * t) * ny;
      if (!(gap < 0.10)) return;
      var wa = 1 - t, wc = t, ids = [v, e, f], weights = [1, -wa, -wc];
      var mx = [], my = [], den = 0, gradient = 0;
      for (var node = 0; node < 3; node++) {
        var id = ids[node], weight = weights[node], sx = weight < 0 ? -1 : 1;
        mx[node] = jelloWorldSolidAt(px[id] + nx * sx * 0.5, py[id]) ? 0 : 1;
        my[node] = jelloWorldSolidAt(px[id], py[id] + ny * sx * 0.5) ? 0 : 1;
        den += weight * weight * (nx * nx * mx[node] + ny * ny * my[node]);
        gradient = Math.max(gradient, Math.abs(weight) * Math.hypot(nx * mx[node], ny * my[node]));
      }
      if (!(den > 1e-8)) return;
      var depth = 0.10 - gap, cost = depth * depth / den;
      if (best && (best.time < time - 1e-6 || (Math.abs(best.time - time) <= 1e-6 && best.cost <= cost))) return;
      best = { p: v, a: e, c: f, nx: nx, ny: ny, t: t, mx: mx, my: my, den: den, gradient: gradient, depth: depth, cost: cost, time: time };
    }
  }

  function softIntentSkinFallback(b) {
    if (!b._softPX || !softContactSkinCrossed(b)) return;
    var px = b.px, py = b.py, ring = b.ring, count = b.ringN;
    for (var first = 0; first < count; first++) {
      var a = ring[first], c = ring[(first + 1) % count];
      for (var second = first + 2; second < count; second++) {
        if (first === 0 && second === count - 1) continue;
        var p = ring[second], q = ring[(second + 1) % count];
        if (!softContactEdgesCross(b, a, c, p, q)) continue;
        var best = null;
        candidate(a, c, p, q); candidate(c, a, p, q);
        candidate(p, q, a, c); candidate(q, p, a, c);
        if (!best) continue;
        softIntentSkinApply(b, best);
      }
    }
    function candidate(v, other, e, f) {
      var ex = px[f] - px[e], ey = py[f] - py[e], len2 = ex * ex + ey * ey;
      if (!(len2 > 1e-10)) return;
      var t = ((px[v] - px[e]) * ex + (py[v] - py[e]) * ey) / len2;
      if (!(t >= 0 && t <= 1)) return;
      var invLength = 1 / Math.sqrt(len2), nx = -ey * invLength, ny = ex * invLength;
      if ((px[other] - px[e]) * nx + (py[other] - py[e]) * ny < 0) { nx = -nx; ny = -ny; }
      var gap = (px[v] - px[e]) * nx + (py[v] - py[e]) * ny;
      if (gap > 1e-7) return;
      var wa = 1 - t, wc = t, ids = [v, e, f], weights = [1, -wa, -wc];
      var mx = [], my = [], den = 0, gradient = 0;
      for (var node = 0; node < 3; node++) {
        var id = ids[node], weight = weights[node], sx = weight < 0 ? -1 : 1;
        mx[node] = jelloWorldSolidAt(px[id] + nx * sx * 0.5, py[id]) ? 0 : 1;
        my[node] = jelloWorldSolidAt(px[id], py[id] + ny * sx * 0.5) ? 0 : 1;
        den += weight * weight * (nx * nx * mx[node] + ny * ny * my[node]);
        gradient = Math.max(gradient, Math.abs(weight) * Math.hypot(nx * mx[node], ny * my[node]));
      }
      if (!(den > 1e-8)) return;
      var depth = 0.10 - gap, cost = depth * depth / den;
      if (best && best.cost <= cost) return;
      best = { p: v, a: e, c: f, nx: nx, ny: ny, t: t, mx: mx, my: my, den: den, gradient: gradient, depth: depth, cost: cost };
    }
  }

  function softIntentEdgesOverlap(b, p, q, a, c) {
    var px = b.px, py = b.py;
    if (Math.max(px[p], px[q]) < Math.min(px[a], px[c]) || Math.max(px[a], px[c]) < Math.min(px[p], px[q]) ||
        Math.max(py[p], py[q]) < Math.min(py[a], py[c]) || Math.max(py[a], py[c]) < Math.min(py[p], py[q])) return false;
    var ex = px[q] - px[p], ey = py[q] - py[p], length2 = ex * ex + ey * ey;
    if (!(length2 > 1e-10)) return false;
    var tolerance = Math.sqrt(length2) * 1e-7;
    if (Math.abs(ex * (py[a] - py[p]) - ey * (px[a] - px[p])) > tolerance ||
        Math.abs(ex * (py[c] - py[p]) - ey * (px[c] - px[p])) > tolerance) return false;
    var ta = ((px[a] - px[p]) * ex + (py[a] - py[p]) * ey) / length2;
    var tc = ((px[c] - px[p]) * ex + (py[c] - py[p]) * ey) / length2;
    return Math.min(1, Math.max(ta, tc)) - Math.max(0, Math.min(ta, tc)) > 1e-7;
  }

  // Position repair shifts history equally. Only the inward normal impulse
  // changes velocity; terrain masks supply any external reaction.
  function softIntentSkinApply(b, contact) {
    var px = b.px, py = b.py;
    var v = contact.p, e = contact.a, f = contact.c, nx = contact.nx, ny = contact.ny;
    var wa = 1 - contact.t, wc = contact.t;
    var vx = px[v] - b.ox[v] - (px[e] - b.ox[e]) * wa - (px[f] - b.ox[f]) * wc;
    var vy = py[v] - b.oy[v] - (py[e] - b.oy[e]) * wa - (py[f] - b.oy[f]) * wc;
    var impulse = Math.max(0, -(vx * nx + vy * ny)) / contact.den;
    var dl = Math.min(contact.depth / contact.den, 2 / contact.gradient);
    var ids = [v, e, f], weights = [1, -wa, -wc];
    for (var node = 0; node < 3; node++) {
      var id = ids[node], weight = weights[node], mx = contact.mx[node], my = contact.my[node];
      px[id] += nx * dl * weight * mx; py[id] += ny * dl * weight * my;
      b.ox[id] += nx * (dl - impulse) * weight * mx;
      b.oy[id] += ny * (dl - impulse) * weight * my;
    }
    softContactReport.selfContacts++;
  }
