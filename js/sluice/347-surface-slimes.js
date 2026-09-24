  /* ---- Bath-born surface slimes ----
     These residents use the shared XPBD lattice, terrain/rig contacts, jets,
     pressure, and inter-body solve. Travelling muscles work against skin grips.
     Underground NPCs keep their independent, normally disabled switch. */
  var SURFACE_SLIME_STARTERS = 5;
  var surfaceSlimesSeeded = false;
  var surfaceSlimeGuests = [];
  var surfaceSlimeHues = [133, 284, 190, 32, 333];

  function surfaceSlimeBuild(x, y, identity) {
    if (!ENABLE_JELLO || !isFinite(x + y) || jelloCount + 61 > JELLO_MAX_POINTS) return null;
    identity = identity || {};
    var seed = isFinite(identity.seed) ? skySlimeClamp(identity.seed, 0, 1) : Math.random();
    // Unhardening keeps the incoming visitor's size. Older resident saves
    // have no radius; use the same 22..27 range as skySlimeFresh for those
    // and the five playtest residents. The 0.94 core below sheds the shell.
    var radius = typeof identity.r === 'number' && isFinite(identity.r) ?
      skySlimeClamp(identity.r, 22, 27) : 22 + seed * 5;
    var b = jelloBuildDisc(x, y, radius, 'slime');
    if (!b) return null;
    b.surfaceSlime = {
      id: isFinite(identity.id) ? identity.id : skySlimeSerial++, seed: seed,
      home: isFinite(identity.home) ? identity.home : x,
      hue: isFinite(identity.hue) ? identity.hue : surfaceSlimeHues[Math.floor(seed * 5) % 5],
      age: 0, state: 'idle', timer: 0.6 + seed * 2, dir: seed < 0.5 ? -1 : 1,
      blink: 0, blinkIn: 1.5 + seed * 4, wet: 0, sense: 0,
      radius: radius
    };
    skySlimeSerial = Math.max(skySlimeSerial, b.surfaceSlime.id + 1);
    b.hue = b.surfaceSlime.hue;
    // A radial rest mesh has no feet or preferred top. Small, seed-specific
    // irregularities belong to the gel itself and rotate when it rolls.
    for (var p = 0; p < b.n; p++) {
      var u = b.rx[p] - x, v = b.ry[p] - y, angle = Math.atan2(v, u);
      var radial = 0.94 * (1 + 0.045 * Math.sin(angle * 3 + seed * 6.28) +
        0.025 * Math.cos(angle * 5 - seed * 9));
      b.px[p] = b.ox[p] = b.rx[p] = x + u * radial;
      b.py[p] = b.oy[p] = b.ry[p] = y + v * radial;
    }
    for (var si = 0; si < b.springN; si++) {
      var a = b.sA[si], c = b.sB[si];
      b.sRest[si] = Math.hypot(b.rx[a] - b.rx[c], b.ry[a] - b.ry[c]);
    }
    var area = 0;
    for (var k = 0; k < b.ringN; k++) {
      var i = b.ring[k], j = b.ring[(k + 1) % b.ringN];
      area += (b.rx[i] - x) * (b.ry[j] - y) - (b.rx[j] - x) * (b.ry[i] - y);
    }
    b.restArea = Math.abs(area) * 0.5;
    b.tileW *= 0.94; b.tileH *= 0.94;
    jelloComputeRest(b); jelloInstallSpringHealthMesh(b);
    surfaceSlimeInstallMesh(b); jelloShadeAnchors(b);
    jelloUpdateBody(b, JELLO_H);
    surfaceSlimeMotorInit(b);
    return b;
  }

  function surfaceSlimeSeed() {
    if (surfaceSlimesSeeded || !ENABLE_JELLO || bathMode) return;
    surfaceSlimesSeeded = true;
    // Keep the first pair in view of the starting rig, with three more
    // along the dry town approaches. Never fill a pond to place a resident.
    var offsets = [-4, 4, -10, 15, 23];
    for (var n = 0; n < SURFACE_SLIME_STARTERS; n++) {
      var col = DECK_CENTER_COL + offsets[n];
      for (var seek = 0; seek < 24; seek++) {
        if (tileAt(SKY_ROWS, col) && !tileAt(SKY_ROWS - 1, col) &&
            tileAt(SKY_ROWS, col - 1) && tileAt(SKY_ROWS, col + 1)) break;
        col += offsets[n] < 0 ? -1 : 1;
      }
      surfaceSlimeBuild((col + 0.5) * TILE, SKY_ROWS * TILE - 38,
        { seed: 0.08 + n * 0.19, hue: surfaceSlimeHues[n] });
    }
  }

  function surfaceSlimeTick(dt) {
    surfaceSlimeGuests.length = 0;
    if (surfaceSlimeGrip && (bathMode || gamePaused || gameOver || gameWon ||
        shopState !== 'closed' || jelloBodies.indexOf(surfaceSlimeGrip.body) < 0)) surfaceSlimeGrabEnd(undefined, true);
    if (!ENABLE_JELLO || bathMode || gameOver || gameWon || !(dt > 0)) return;
    surfaceSlimeSeed();
    dt = Math.min(dt, 0.05);
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i], m = b.surfaceSlime;
      if (!m || !jelloBodyOnCamera(b)) continue;
      m.age += dt; m.timer -= dt;
      m.blink = Math.max(0, m.blink - dt); m.blinkIn -= dt;
      if (m.blinkIn <= 0) { m.blink = 0.16; m.blinkIn = 2.5 + Math.random() * 4; }
      var rigDX = player.x + PLAYER_W / 2 - b.cx;
      var rigDY = player.y + PLAYER_H / 2 - b.cy;
      var nearRig = Math.hypot(rigDX, rigDY) < 145;
      surfaceSlimeEyeTick(m, b.px[0] * 0.75 + b.cx * 0.25,
        b.py[0] * 0.75 + b.cy * 0.25, m.radius, dt,
        nearRig ? rigDX : null, nearRig ? rigDY : null);
      m.sense -= dt;
      if (m.sense <= 0) {
        m.sense = 0.12;
        var water = typeof liquidSampleBall === 'function' ? liquidSampleBall(b.cx, b.cy, m.radius) : null;
        m.wet = water && water.bottom > b.bboxT && water.surface < b.bboxB ? 1 : 0;
        b.bathBuoy = m.wet ? { line: water.surface, x0: b.bboxL - 12, x1: b.bboxR + 12, lift: 2.2, drag: 0.985 } : null;
      }
      surfaceSlimeThink(b, dt);
      // The same deforming boundary goes to the water solver. Speeds are
      // converted from solver time to real time, with resting noise removed.
      if (surfaceSlimeGuests.length < 6) {
        var take = Math.min(20, b.ringN), pts = [], ih = JELLO_TIMESCALE / (jelloStepH || JELLO_H);
        for (var k = 0; k < take; k++) {
          var p = b.ring[Math.floor(k * b.ringN / take)];
          var vx = skySlimeClamp((b.px[p] - b.ox[p]) * ih, -600, 600);
          var vy = skySlimeClamp((b.py[p] - b.oy[p]) * ih, -600, 600);
          var fade = skySlimeClamp((Math.hypot(vx, vy) - 20) / 50, 0, 1);
          pts.push(b.px[p], b.py[p], vx * fade, vy * fade);
        }
        surfaceSlimeGuests.push({ x: b.cx, y: b.cy, hw: (b.bboxR - b.bboxL) / 2 + 3,
          hh: (b.bboxB - b.bboxT) / 2 + 3, vx: 0, vy: 0, pts: pts });
      }
    }
  }

  // A loose pupil moves inside a circular cup. Coordinates are radius-normalized
  // and world-oriented: rolling the gel never makes its eye upside down.
  function surfaceSlimeEyeTick(m, x, y, r, dt, lookX, lookY) {
    var e = m.eye;
    if (!e) e = m.eye = { x: 0, y: 0.065, vx: 0, vy: 0,
      anchorX: x, anchorY: y, bodyVX: 0, bodyVY: 0,
      glance: 0.5 + (m.seed || 0) * 2, gazeX: 0, gazeY: 0 };
    if (!(dt > 0)) return;
    e.glance -= dt;
    if (e.glance <= 0) {
      var a = Math.random() * Math.PI * 2, d = 0.02 + Math.random() * 0.075;
      e.gazeX = Math.cos(a) * d; e.gazeY = Math.sin(a) * d;
      e.glance = 0.7 + Math.random() * 3.4;
    }
    var dx = x - e.anchorX, dy = y - e.anchorY;
    // A camera-independent material anchor sees local wobbles and impacts.
    // Teleports and restoring a save must not launch the pupil.
    var teleported = Math.hypot(dx, dy) > r * 8;
    var vx = teleported ? 0 : dx / dt, vy = teleported ? 0 : dy / dt;
    var dvx = teleported ? 0 : skySlimeClamp(vx - e.bodyVX, -180, 180);
    var dvy = teleported ? 0 : skySlimeClamp(vy - e.bodyVY, -180, 180);
    // Apply acceleration as a velocity impulse, independent of render rate.
    e.vx -= dvx / r * 0.22; e.vy -= dvy / r * 0.22;
    e.anchorX = x; e.anchorY = y; e.bodyVX = vx; e.bodyVY = vy;
    var gx = e.gazeX, gy = e.gazeY + 0.045;
    if (lookX !== null && lookY !== null && isFinite(lookX) && isFinite(lookY)) {
      var lookD = Math.hypot(lookX, lookY) || 1;
      gx = lookX / lookD * 0.09; gy = lookY / lookD * 0.09 + 0.025;
    }
    var steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps, limit = 0.175;
    for (var n = 0; n < steps; n++) {
      e.vx += (gx - e.x) * 19 * h;
      e.vy += ((gy - e.y) * 19 + 0.45) * h;
      var drag = Math.exp(-2.8 * h); e.vx *= drag; e.vy *= drag;
      e.x += e.vx * h; e.y += e.vy * h;
      var length = Math.hypot(e.x, e.y);
      if (length > limit) {
        var nx = e.x / length, ny = e.y / length;
        e.x = nx * limit; e.y = ny * limit;
        var outward = e.vx * nx + e.vy * ny;
        if (outward > 0) { e.vx -= nx * outward * 1.56; e.vy -= ny * outward * 1.56; }
      }
    }
  }

  function surfaceSlimeFace(m, r) {
    var e = m.eye || { x: 0, y: 0.065 }, cup = r * 0.355, pupil = r * 0.145;
    ctx.save();
    ctx.fillStyle = 'rgba(30,36,32,0.23)';
    ctx.beginPath(); ctx.arc(r * 0.018, r * 0.045, cup * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8b2a2';
    ctx.beginPath(); ctx.arc(0, 0, cup * 1.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5f1ea';
    ctx.beginPath(); ctx.arc(0, 0, cup, 0, Math.PI * 2); ctx.fill();
    // Closing the lid is brief and soft; the loose pupil keeps simulating.
    var open = m.blink > 0 ? Math.max(0.08, Math.abs(m.blink - 0.08) / 0.08) : 1;
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, cup, cup * open, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#252e29';
    ctx.beginPath(); ctx.arc(e.x * r, e.y * r, pupil, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(245,241,234,0.82)';
    ctx.beginPath(); ctx.arc(e.x * r - pupil * 0.25, e.y * r - pupil * 0.3, pupil * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (open < 1) {
      ctx.fillStyle = 'hsla(' + (m.hue || 133) + ',38%,66%,0.98)';
      ctx.beginPath(); ctx.arc(0, 0, cup * 0.98, 0, Math.PI * 2);
      ctx.ellipse(0, 0, cup, cup * open, 0, 0, Math.PI * 2); ctx.fill('evenodd');
      ctx.strokeStyle = 'hsla(' + (m.hue || 133) + ',30%,45%,0.8)';
      ctx.lineWidth = r * 0.035; ctx.beginPath();
      ctx.ellipse(0, 0, cup * 0.94, Math.max(r * 0.025, cup * open), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(245,241,234,0.65)'; ctx.lineWidth = r * 0.035;
    ctx.beginPath(); ctx.arc(-r * 0.014, -r * 0.014, cup * 0.8, 3.65, 4.7); ctx.stroke();
    ctx.restore();
  }

  function surfaceSlimeDrawEye(b) {
    var m = b.surfaceSlime;
    // Left stretch (sqrt(M M^T)) keeps the cup round under pure rotation but
    // lets a squeeze in any direction deform it a little with the central gel.
    var a = b.shM00 * b.shM00 + b.shM01 * b.shM01;
    var d = b.shM10 * b.shM10 + b.shM11 * b.shM11;
    var c = b.shM00 * b.shM10 + b.shM01 * b.shM11;
    var determinant = Math.sqrt(Math.max(0.0001, a * d - c * c));
    var divisor = Math.sqrt(Math.max(0.0001, a + d + 2 * determinant));
    var sx = skySlimeClamp(1 + ((a + determinant) / divisor - 1) * 0.42, 0.78, 1.2);
    var sy = skySlimeClamp(1 + ((d + determinant) / divisor - 1) * 0.42, 0.78, 1.2);
    var shear = skySlimeClamp(c / divisor * 0.42, -0.15, 0.15);
    ctx.save();
    ctx.translate(b.px[0] * 0.75 + b.cx * 0.25, b.py[0] * 0.75 + b.cy * 0.25);
    ctx.transform(sx, shear, shear, sy, 0, 0);
    surfaceSlimeFace(m, m.radius);
    ctx.restore();
  }

  function surfaceSlimeSnapshot(b) {
    var m = b.surfaceSlime;
    if (!m.previousX) { m.previousX = new Float64Array(b.n); m.previousY = new Float64Array(b.n); }
    m.previousX.set(b.px); m.previousY.set(b.py); m.renderFrame = jelloFrameNo;
  }

  function surfaceSlimeRenderBody(b) {
    var m = b.surfaceSlime;
    if (!m || !m.previousX || m.renderFrame !== jelloFrameNo || b._grabbed || b._rigRenderT > 0 || surfaceSlimeRigOwns(b)) return b;
    var view = m.renderBody;
    if (!view) {
      view = m.renderBody = Object.create(b);
      view.px = new Float64Array(b.n); view.py = new Float64Array(b.n);
    }
    // The solver ticks at 120 Hz. Display its two latest poses one tick behind
    // real time, so 144 Hz and variable-rate screens never repeat a skin frame.
    // Physics, contacts, grabs, saves and water continue to use the live body.
    var alpha = skySlimeClamp(jelloAccum / JELLO_H, 0, 1), x = 0, y = 0;
    view.bboxL = view.bboxT = Infinity; view.bboxR = view.bboxB = -Infinity;
    for (var p = 0; p < b.n; p++) {
      var px = m.previousX[p] + (b.px[p] - m.previousX[p]) * alpha;
      var py = m.previousY[p] + (b.py[p] - m.previousY[p]) * alpha;
      view.px[p] = px; view.py[p] = py; x += px; y += py;
      view.bboxL = Math.min(view.bboxL, px); view.bboxR = Math.max(view.bboxR, px);
      view.bboxT = Math.min(view.bboxT, py); view.bboxB = Math.max(view.bboxB, py);
    }
    view.cx = x / b.n; view.cy = y / b.n; view.shFrame = -1;
    return view;
  }

  function surfaceSlimeDraw(b) {
    b = surfaceSlimeRenderBody(b);
    var m = b.surfaceSlime;
    if (!m || !isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) return;
    jelloRingBake(b);
    // Round the actual moving skin vertices into a continuous gel surface.
    // No extra draw-time wave: the contour follows the colliding soft body.
    var path = new Path2D(), count = jelloRingBakeN;
    path.moveTo((jelloROX[count - 1] + jelloROX[0]) * 0.5, (jelloROY[count - 1] + jelloROY[0]) * 0.5);
    for (var k = 0; k < count; k++) {
      var next = (k + 1) % count;
      path.quadraticCurveTo(jelloROX[k], jelloROY[k],
        (jelloROX[k] + jelloROX[next]) * 0.5, (jelloROY[k] + jelloROY[next]) * 0.5);
    }
    path.closePath();
    var r = m.radius, hue = m.hue;
    var h = Math.max(1, b.bboxB - b.bboxT), w = Math.max(1, b.bboxR - b.bboxL);
    ctx.save();
    if (!m.climb && jelloSupportedBelowTile(b)) {
      ctx.fillStyle = 'rgba(30,36,32,0.18)'; ctx.beginPath();
      ctx.ellipse(b.cx, b.bboxB + 3, w * 0.43, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.clip(path);
    var gel = ctx.createLinearGradient(b.cx, b.bboxT - 4, b.cx + r * 0.25, b.bboxB + 4);
    gel.addColorStop(0, 'hsla(' + hue + ',42%,81%,0.97)');
    gel.addColorStop(0.45, 'hsla(' + hue + ',38%,66%,0.94)');
    gel.addColorStop(1, 'hsla(' + (hue + 9) + ',34%,40%,0.98)');
    ctx.fillStyle = gel; ctx.fillRect(b.bboxL - 12, b.bboxT - 12, w + 24, h + 24);
    // Internal highlights stay attached to the gel as it rolls. The eye below
    // has a circular cup rather than a permanently upright face.
    jelloShadeMatrix(b);
    ctx.save(); ctx.translate(b.cx, b.cy);
    ctx.transform(b.shM00, b.shM10, b.shM01, b.shM11, 0, 0);
    var sheen = ctx.createRadialGradient(-r * 0.35, -r * 0.48, 0, -r * 0.35, -r * 0.48, r * 0.55);
    sheen.addColorStop(0, 'rgba(245,241,234,0.6)'); sheen.addColorStop(1, 'rgba(245,241,234,0)');
    ctx.fillStyle = sheen; ctx.fillRect(-r, -r, r * 1.5, r * 1.3);
    ctx.fillStyle = 'rgba(245,241,234,0.45)';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.53, r * 0.2, r * 0.065, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(245,241,234,0.18)';
    for (var n = 0; n < 3; n++) {
      ctx.beginPath(); ctx.arc((n - 1) * r * 0.43, r * (0.34 + Math.sin(n * 3 + m.seed * 8) * 0.12), r * (0.05 + n * 0.013), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    surfaceSlimeDrawEye(b);
    ctx.restore(); ctx.restore();
  }

  // Bath departure animation uses the new material immediately upon the
  // completed soak. Its physical resident is created at the surface door.
  function surfaceSlimeDrawGuest(s) {
    var r = s.r, pulse = Math.sin(s.age * 5.3 + s.seed * 7) * 0.035;
    var hue = surfaceSlimeHues[Math.floor(s.seed * 5) % 5];
    var m = s._softEye;
    if (!m) m = s._softEye = { seed: s.seed, hue: hue, blink: s.blink || 0, age: s.age };
    surfaceSlimeEyeTick(m, s.x, s.y, r, Math.max(0, Math.min(0.05, s.age - m.age)), null, null);
    m.age = s.age; m.blink = s.blink || 0;
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1 + pulse, 1 - pulse);
    ctx.beginPath();
    for (var n = 0; n <= 40; n++) {
      var angle = n / 40 * Math.PI * 2;
      var radial = r * 0.94 * (1 + 0.045 * Math.sin(angle * 3 + s.seed * 6.28) +
        0.025 * Math.cos(angle * 5 - s.seed * 9));
      var x = Math.cos(angle) * radial, y = Math.sin(angle) * radial;
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    var gel = ctx.createLinearGradient(0, -r, 0, r);
    gel.addColorStop(0, 'hsl(' + hue + ',42%,81%)'); gel.addColorStop(1, 'hsl(' + hue + ',34%,44%)');
    ctx.fillStyle = gel; ctx.fill(); surfaceSlimeFace(m, r);
    ctx.restore();
  }

  function surfaceSlimeSave() {
    return { seeded: surfaceSlimesSeeded, residents: jelloBodies.filter(function (b) { return !!b.surfaceSlime; }).map(function (b) {
      var m = b.surfaceSlime;
      return { id: m.id, seed: m.seed, r: m.radius, hue: m.hue, home: m.home, x: b.cx, y: b.cy };
    }) };
  }

  function surfaceSlimeWaterCPU() {
    // The fallback uses the same actual contour as the GPU guest channel.
    // Only overlapping particles pay for a ring query; mass never changes.
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (!b.surfaceSlime || b.frozen) continue;
      for (var i = 0; i < liquidCount; i++) {
        var x = liquidX[i], y = liquidY[i];
        if (liquidFrozen[i] || x < b.bboxL || x > b.bboxR || y < b.bboxT || y > b.bboxB ||
            !jelloPointInRing(b, x, y)) continue;
        var near = jelloNearestOnRing(b, x, y), dx = near.x - x, dy = near.y - y;
        var length = Math.hypot(dx, dy) || 1;
        var nx = near.x + dx / length * 1.2, ny = near.y + dy / length * 1.2;
        if (liquidWorldSolidAt(nx, ny)) continue;
        liquidX[i] = nx; liquidY[i] = ny;
        liquidVX[i] = (b.vx || 0) * JELLO_TIMESCALE * 0.65;
        liquidVY[i] = (b.vy || 0) * JELLO_TIMESCALE * 0.65;
        liquidSleeping[i] = 0; liquidRestFrames[i] = 0;
      }
    }
  }

  function surfaceSlimeRestore(data) {
    surfaceSlimeGuests.length = 0;
    surfaceSlimesSeeded = !!(data && data.seeded);
    if (!ENABLE_JELLO || !data || !Array.isArray(data.residents)) return;
    var seen = {};
    data.residents.slice(0, JELLO_MAX_BODIES).forEach(function (s) {
      if (!s || !isFinite(s.x + s.y) || s.x < 0 || s.x > COLS * TILE ||
          s.y < -TILE * 32 || s.y > TOTAL_ROWS * TILE || seen[s.id]) return;
      seen[s.id] = true; surfaceSlimeBuild(s.x, s.y, s);
    });
  }
