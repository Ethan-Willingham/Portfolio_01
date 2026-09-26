  /* ---- Resident gel: one material under every kind of load ----
     A resident has no pose clock, upright frame, terrain magnets or route.
     Its rest mesh supplies elasticity, its cells preserve volume, and actual
     contacts supply traction. The eye can be curious without steering the gel. */
  var SURFACE_SLIME_VISCOSITY = 22; // deformation decay per real second

  function surfaceSlimeMaterialInit(b) {
    b.materialSoftness = 3.5;
    b.skinLambda = new Float64Array(b.ringN);
    b.surfaceSlime.contacts = 0;
    b.surfaceSlime.supported = false;
  }

  function surfaceSlimeDisturb(b) {
    if (!b || !b.surfaceSlime) return;
    // Waking changes no rest length, pressure, stiffness or velocity.
    b.sleeping = false; b.sleepFrames = 0;
    b.surfaceSlime.restTime = 0;
  }

  function surfaceSlimeObserve(b) {
    var m = b.surfaceSlime, contacts = 0;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      if (jelloWorldSolidAt(b.px[p], b.py[p] + 1.5)) contacts++;
    }
    // Mining a sleeping resident's support must let it fall immediately.
    // Changing water support also wakes it without supplying an impulse.
    if ((m.supported && !contacts) || m.wasWet !== m.wet) surfaceSlimeDisturb(b);
    m.supported = contacts > 0; m.contacts = contacts; m.wasWet = m.wet;
    // Observational labels for diagnostics only. None drives the solver.
    m.state = b._grabbed ? 'held' : m.wet ? 'floating' : !contacts ? 'airborne' :
      b.sleeping ? 'resting' : 'settling';
  }

  function surfaceSlimeDampMotion(b, h) {
    // Separate rigid translation and rotation from deformational velocity.
    // Damping the residual dissipates wobble while preserving BOTH linear
    // and angular momentum. Neighbour velocity averaging erased a throw's
    // spin; damping toward an animated target imposed the crawler's motion.
    var cx = 0, cy = 0, vx = 0, vy = 0;
    for (var p = 0; p < b.n; p++) {
      cx += b.px[p]; cy += b.py[p];
      vx += b.px[p] - b.ox[p]; vy += b.py[p] - b.oy[p];
    }
    cx /= b.n; cy /= b.n; vx /= b.n; vy /= b.n;
    var angular = 0, inertia = 0;
    for (p = 0; p < b.n; p++) {
      var x = b.px[p] - cx, y = b.py[p] - cy;
      angular += x * (b.py[p] - b.oy[p] - vy) - y * (b.px[p] - b.ox[p] - vx);
      inertia += x * x + y * y;
    }
    var spin = inertia > 1e-9 ? angular / inertia : 0;
    var decay = 1 - Math.exp(-SURFACE_SLIME_VISCOSITY * h / JELLO_TIMESCALE);
    for (p = 0; p < b.n; p++) {
      var rigidX = vx - spin * (b.py[p] - cy);
      var rigidY = vy + spin * (b.px[p] - cx);
      b.ox[p] += ((b.px[p] - b.ox[p]) - rigidX) * decay;
      b.oy[p] += ((b.py[p] - b.oy[p]) - rigidY) * decay;
    }
  }

  function surfaceSlimeTerrainContact(b, p, x, y, nx, ny, depth, vx, vy, h) {
    // Coulomb friction must constrain displacement as well as velocity.
    // Merely zeroing the velocity lets the elastic position projections
    // move a stopped foot again on every step, causing unforced creep.
    var tx = -ny, ty = nx, slip = vx * tx + vy * ty;
    var limit = Math.max(0, depth) * 0.85;
    var friction = Math.abs(slip) <= limit ? slip :
      Math.sign(slip) * Math.min(Math.abs(slip), Math.max(0, depth) * 0.6);
    var fx = x - tx * friction, fy = y - ty * friction;
    if (!jelloWorldSolidAt(fx, fy)) { x = fx; y = fy; slip -= friction; }
    var approach = vx * nx + vy * ny;
    var normal = approach < -JELLO_REST_VEL * h ? -approach * JELLO_BOUNCE : Math.max(0, approach);
    b.px[p] = x; b.py[p] = y;
    b.ox[p] = x - tx * slip - nx * normal;
    b.oy[p] = y - ty * slip - ny * normal;
  }
