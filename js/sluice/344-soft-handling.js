  /* ---- Opt-in material handling (?softhandling=1) ----
     The hand pulls one fixed material patch. Release only removes that force;
     translation, rotation and deformation keep their simulated velocities. */
  var SOFT_HANDLING = new URLSearchParams(location.search).get('softhandling') === '1' ||
    (softPlayEnabled && softPlayTerrainTrial);

  function softHandlingBody(b) { return SOFT_HANDLING && !!b.surfaceSlime; }

  function softHandlingStart(g) {
    g.physical = SOFT_HANDLING;
    if (!g.physical) return;
    g.cursorX = g.x; g.cursorY = g.y;
    g.stepX = g.stepY = g.handleVX = g.handleVY = 0;
  }

  // Consume the latest input over the actual simulated interval. Frames with
  // no gel tick keep the target pending instead of manufacturing a release kick.
  function softHandlingPrepare(steps, h) {
    var g = surfaceSlimeGrip;
    if (!g || !g.physical || !(steps > 0)) return;
    var dt = h / JELLO_TIMESCALE;
    g.stepX = (g.x - g.cursorX) / steps;
    g.stepY = (g.y - g.cursorY) / steps;
    g.handleVX = g.stepX / dt; g.handleVY = g.stepY / dt;
  }

  function softHandlingStep(b, h) {
    var g = surfaceSlimeGrip, dt = h / JELLO_TIMESCALE;
    g.cursorX += g.stepX; g.cursorY += g.stepY;
    var x = 0, y = 0, vx = 0, vy = 0, inverse = 0;
    var invPoint = 1 / SOFT_CONTACT_POINT_MASS;
    for (var i = 0; i < b.n; i++) {
      var w = g.weights[i];
      x += b.px[i] * w; y += b.py[i] * w;
      vx += (b.px[i] - b.ox[i]) / dt * w;
      vy += (b.py[i] - b.oy[i]) / dt * w;
      inverse += invPoint * w * w;
    }
    // Implicit spring/damper at the patch. These are the original grip's
    // whole-body gains, expressed as force with the same mass as rig contact.
    // Gravity remains active, and damping measures slip relative to the hand.
    var mass = b.n * SOFT_CONTACT_POINT_MASS;
    var stiffness = mass * 160, damping = mass * 22;
    var denominator = 1 + inverse * (stiffness * dt * dt + damping * dt);
    var fx = (-stiffness * (x - g.cursorX - g.dx) - damping * (vx - g.handleVX)) / denominator;
    var fy = (-stiffness * (y - g.cursorY - g.dy) - damping * (vy - g.handleVY)) / denominator;
    var force = Math.hypot(fx, fy), cap = mass * 7000;
    if (force > cap) { fx *= cap / force; fy *= cap / force; }
    for (i = 0; i < b.n; i++) {
      var amount = invPoint * g.weights[i] * dt * dt;
      b.px[i] += fx * amount; b.py[i] += fy * amount;
    }
    b._grabApplied = 1; b.sleeping = false; b.sleepFrames = 0; b._plyMs = performance.now();
  }

  // The guard rejects the entire displacement of an invalid substep. Its
  // accepted velocity is therefore zero, including for a peer rolled back by
  // the same event. Keeping either candidate or pre-step velocity would bank
  // invisible motion while the body is parked at an obstacle, then launch it
  // on release. Ordinary valid deformation and contact retain their history.
  function jelloGrabRejectStep(b) {
    var g = surfaceSlimeGrip;
    if (!g || !g.physical) return;
    for (var i = 0; i < b.n; i++) { b.ox[i] = b.px[i]; b.oy[i] = b.py[i]; }
    b._handRejects = (b._handRejects || 0) + 1;
  }
