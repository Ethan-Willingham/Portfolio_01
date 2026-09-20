  /* ---- Direct play: a compliant material grip, never a position teleport ---- */
  var surfaceSlimeGrip = null;

  function surfaceSlimeGrabStart(wx, wy, id) {
    if (surfaceSlimeGrip || !ENABLE_JELLO || bathMode || gamePaused || gameOver ||
        gameWon || siphon.equipped || shopState !== 'closed') return false;
    for (var i = jelloBodies.length - 1; i >= 0; i--) {
      var b = jelloBodies[i];
      if (!b.surfaceSlime || !jelloPointInRing(b, wx, wy)) continue;
      var nearest = 0, distance = Infinity;
      for (var k = 0; k < b.n; k++) {
        var d = Math.hypot(b.px[k] - wx, b.py[k] - wy);
        if (d < distance) { distance = d; nearest = k; }
      }
      var weights = [], total = 0;
      for (k = 0; k < b.n; k++) {
        var w = Math.exp(-Math.pow(Math.hypot(b.rx[k] - b.rx[nearest], b.ry[k] - b.ry[nearest]) / 16, 2));
        weights.push(w); total += w;
      }
      var ax = 0, ay = 0;
      for (k = 0; k < b.n; k++) { weights[k] /= total; ax += b.px[k] * weights[k]; ay += b.py[k] * weights[k]; }
      surfaceSlimeGrip = { body: b, id: id, weights: weights, x: wx, y: wy,
        dx: ax - wx, dy: ay - wy, vx: 0, vy: 0, t: performance.now(), motion: 0 };
      surfaceSlimeDetach(b);
      b._grabbed = true; b._recoverT = 0; b.sleeping = false; b.sleepFrames = 0;
      jelloClearActorIntent(b); b.surfaceSlime.state = 'tumble';
      return true;
    }
    return false;
  }

  function surfaceSlimeGrabMove(wx, wy, id) {
    var g = surfaceSlimeGrip;
    if (!g || id !== g.id) return false;
    var now = performance.now(), dt = Math.max(0.008, (now - g.t) / 1000);
    var gain = 1 - Math.exp(-dt / 0.035);
    g.vx += ((wx - g.x) / dt - g.vx) * gain;
    g.vy += ((wy - g.y) / dt - g.vy) * gain;
    if (Math.hypot(wx - g.x, wy - g.y) > 0.5) g.motion = now;
    g.x = wx; g.y = wy; g.t = now;
    return true;
  }

  function surfaceSlimeGrabEnd(id, cancel) {
    var g = surfaceSlimeGrip;
    if (!g || (id !== undefined && id !== g.id)) return false;
    var b = g.body;
    b._grabbed = false; b._grabApplied = 0; b._recoverT = 1.2;
    if (!cancel && performance.now() - g.motion < 100 && Math.hypot(g.vx, g.vy) > 50) {
      jelloLaunchBody(b, g.vx * 0.7, g.vy * 0.7, { h: jelloStepH || JELLO_H, maxSpeed: 450 });
    }
    b._plyMs = performance.now(); surfaceSlimeGrip = null;
    return true;
  }

  function jelloGrabSubstep(b, h) {
    var g = surfaceSlimeGrip;
    if (!g || g.body !== b || !b._grabbed) return;
    var ts = JELLO_TIMESCALE, x = 0, y = 0, vx = 0, vy = 0;
    for (var i = 0; i < b.n; i++) {
      var w = g.weights[i];
      x += b.px[i] * w; y += b.py[i] * w;
      vx += (b.px[i] - b.ox[i]) * ts / h * w;
      vy += (b.py[i] - b.oy[i]) * ts / h * w;
    }
    var ax = (g.x + g.dx - x) * 160 - vx * 22;
    var ay = (g.y + g.dy - y) * 160 - vy * 22 - JELLO_GRAVITY;
    var force = Math.hypot(ax, ay), cap = 7000;
    if (force > cap) { ax *= cap / force; ay *= cap / force; }
    // Distribute force over a fixed patch of material. The rest of the body
    // follows through its springs; pressure and world contacts remain active.
    for (i = 0; i < b.n; i++) {
      var amount = g.weights[i] * b.n * h * h / (ts * ts);
      b.px[i] += ax * amount; b.py[i] += ay * amount;
    }
    b._grabApplied = 1; b.sleeping = false; b.sleepFrames = 0; b._plyMs = performance.now();
  }

  function surfaceSlimeRockContact(s, h) {
    if (!ENABLE_JELLO) return;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (!b.surfaceSlime || b.frozen || s.x + s.r < b.bboxL || s.x - s.r > b.bboxR ||
          s.y + s.r < b.bboxT || s.y - s.r > b.bboxB) continue;
      var q = jelloNearestOnRing(b, s.x, s.y), qx = q.x, qy = q.y;
      var dx = s.x - qx, dy = s.y - qy, d = Math.hypot(dx, dy);
      var inside = jelloPointInRing(b, s.x, s.y);
      if (!inside && d >= s.r) continue;
      var nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
      if (inside) { nx *= -1; ny *= -1; }
      var overlap = inside ? s.r + d : s.r - d;
      var separation = Math.min(overlap, 320 * h);
      s.x += nx * separation; s.y += ny * separation;
      var rel = (s.vx - b.vx * JELLO_TIMESCALE) * nx + (s.vy - b.vy * JELLO_TIMESCALE) * ny;
      if (rel >= 0) continue;
      var rockMass = SKY_SLIME_MASS * s.r * s.r / 625, gelMass = b.n * 0.09;
      var impulse = Math.min(450, -rel) * 1.3 / (1 / rockMass + 1 / gelMass);
      s.vx += nx * impulse / rockMass; s.vy += ny * impulse / rockMass;
      var weights = [], sum = 0;
      for (var p = 0; p < b.n; p++) {
        var w = Math.max(0, 1 - Math.hypot(b.px[p] - qx, b.py[p] - qy) / (s.r * 1.6));
        weights.push(w); sum += w;
      }
      var step = (jelloStepH || JELLO_H) / JELLO_TIMESCALE;
      for (p = 0; p < b.n && sum > 0; p++) {
        var dv = impulse / gelMass * b.n * weights[p] / sum;
        b.ox[p] += nx * dv * step; b.oy[p] += ny * dv * step;
      }
      surfaceSlimeDetach(b, 0.9);
      b.sleeping = false; b.sleepFrames = 0; b._plyMs = performance.now();
      skySlimePlayContact(s);
    }
  }

  window.addEventListener('blur', function () { surfaceSlimeGrabEnd(undefined, true); });
  window.addEventListener('mouseup', function () { surfaceSlimeGrabEnd('mouse', false); });
