  /* ---- Bath-born surface slimes ----
     These residents use the shared XPBD lattice, terrain/rig contacts, jets,
     pressure, and inter-body solve. The brain supplies muscle intents only.
     Underground NPCs keep their independent, normally disabled switch. */
  var SURFACE_SLIME_STARTERS = 5;
  var surfaceSlimesSeeded = false;
  var surfaceSlimeGuests = [];
  var surfaceSlimeHues = [133, 284, 190, 32, 333];

  function surfaceSlimeBuild(x, y, identity) {
    if (!ENABLE_JELLO || !isFinite(x + y) || jelloCount + 61 > JELLO_MAX_POINTS) return null;
    identity = identity || {};
    var seed = isFinite(identity.seed) ? skySlimeClamp(identity.seed, 0, 1) : Math.random();
    var radius = 24 + seed * 5;
    var b = jelloBuildDisc(x, y, radius, 'slime');
    if (!b) return null;
    b.surfaceSlime = {
      id: isFinite(identity.id) ? identity.id : skySlimeSerial++, seed: seed,
      home: isFinite(identity.home) ? identity.home : x,
      hue: isFinite(identity.hue) ? identity.hue : surfaceSlimeHues[Math.floor(seed * 5) % 5],
      age: 0, state: 'idle', timer: 0.6 + seed * 2, dir: seed < 0.5 ? -1 : 1,
      blink: 0, blinkIn: 1.5 + seed * 4, look: 0, wet: 0, sense: 0, hop: 0,
      radius: radius, lastX: x, stall: 0
    };
    skySlimeSerial = Math.max(skySlimeSerial, b.surfaceSlime.id + 1);
    b.hue = b.surfaceSlime.hue;
    // Author the REST mesh, including its little foot lobes. Rendering and
    // contacts share this shape; there is no circular invisible collider.
    for (var p = 0; p < b.n; p++) {
      var u = (b.rx[p] - x) / radius, v = (b.ry[p] - y) / radius;
      var foot = Math.max(0, v) * (0.07 + 0.1 * Math.cos(u * 8));
      b.px[p] = b.ox[p] = b.rx[p] = x + u * radius * (1.13 + v * 0.13);
      b.py[p] = b.oy[p] = b.ry[p] = y + radius * (v * (v > 0 ? 0.65 : 0.9) + foot);
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
    b.tileH *= 0.82;
    jelloComputeRest(b); jelloInstallSpringHealthMesh(b); jelloShadeAnchors(b);
    jelloUpdateBody(b, JELLO_H);
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
      m.age += dt; m.timer -= dt; m.hop = Math.max(0, m.hop - dt);
      m.blink = Math.max(0, m.blink - dt); m.blinkIn -= dt;
      if (m.blinkIn <= 0) { m.blink = 0.16; m.blinkIn = 2.5 + Math.random() * 4; }
      var rigDX = player.x + PLAYER_W / 2 - b.cx;
      var rigDY = player.y + PLAYER_H / 2 - b.cy;
      var nearRig = Math.hypot(rigDX, rigDY) < 145;
      m.look += ((nearRig ? skySlimeClamp(rigDX / 85, -1, 1) : m.dir * 0.4) - m.look) * Math.min(1, dt * 5);
      m.sense -= dt;
      if (m.sense <= 0) {
        m.sense = 0.12;
        var water = typeof liquidSampleBall === 'function' ? liquidSampleBall(b.cx, b.cy, m.radius) : null;
        m.wet = water && water.bottom > b.bboxT && water.surface < b.bboxB ? 1 : 0;
        b.bathBuoy = m.wet ? { line: water.surface, x0: b.bboxL - 12, x1: b.bboxR + 12, lift: 2.2, drag: 0.985 } : null;
      }
      var supported = jelloSupportedBelowTile(b);
      var speed = Math.hypot(b.vx || 0, b.vy || 0) * JELLO_TIMESCALE;
      // Let an external shove or launch play out before muscles take over.
      var beingPlayed = b._grabbed || b._carried || speed > 115 ||
        (b._plyMs && performance.now() - b._plyMs < 650);
      if (beingPlayed) {
        jelloClearActorIntent(b); m.state = 'tumble'; m.timer = 0.65;
      } else {
        if (m.timer <= 0 || m.state === 'tumble') {
          m.state = m.state === 'walk' ? 'idle' : 'walk';
          m.timer = m.state === 'walk' ? 2.2 + m.seed * 3 : 1.2 + Math.random() * 2;
          if (Math.abs(b.cx - m.home) > TILE * 8) m.dir = b.cx < m.home ? 1 : -1;
          else if (Math.random() < 0.35) m.dir *= -1;
        }
        var edgeX = b.cx + m.dir * (m.radius + 22);
        // Avoid voluntary shaft dives. Physical pushes still obey gravity.
        var edge = !tileAt(Math.floor((b.bboxB + 14) / TILE), Math.floor(edgeX / TILE));
        var wall = jelloWorldSolidAt(edgeX, b.cy);
        if (supported && edge && !m.wet) m.dir *= -1;
        m.stall = Math.abs(b.cx - m.lastX) < dt * 3 && m.state === 'walk' ? m.stall + dt : 0;
        m.lastX = b.cx;
        if ((supported || (m.wet && wall)) && m.hop <= 0 && (wall || m.stall > 0.8 || (m.state === 'walk' && m.timer < 0.4))) {
          m.state = 'crouch'; m.timer = 0.2; m.hop = 2.2 + m.seed;
        }
        var crouch = m.state === 'crouch';
        if (crouch && m.timer < 0.04) {
          jelloClearActorIntent(b);
          jelloLaunchBody(b, m.dir * 70, -175 - m.seed * 30, { h: jelloStepH || JELLO_H });
          m.state = 'hop'; m.timer = 0.5;
        }
        if (m.state !== 'hop') {
          var walk = m.state === 'walk' || m.wet;
          jelloSetActorIntent(b, {
            moveX: walk ? m.dir : 0, moveY: null,
            speed: m.wet ? 105 : 75 + m.seed * 40,
            accel: supported || m.wet ? 600 : 100, follow: supported || m.wet ? 6 : 0.5,
            poseX: crouch ? 1.2 : walk ? 1.06 : 1,
            poseY: crouch ? 0.8 : walk ? 0.94 : 1,
            wobble: walk ? 0.095 : 0.025, phaseSpeed: walk ? 15 + m.seed * 4 : 4,
            poseFollow: 12, state: m.state
          });
        }
      }
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

  function surfaceSlimeFace(m, r, surprise) {
    var eyeY = -r * 0.16, look = (m.look || 0) * r * 0.07;
    ctx.fillStyle = '#252e29'; ctx.strokeStyle = '#252e29'; ctx.lineCap = 'round';
    for (var side = -1; side <= 1; side += 2) {
      var x = side * r * 0.31 + look;
      if (m.blink > 0 || m.state === 'crouch') {
        ctx.lineWidth = r * 0.07; ctx.beginPath();
        ctx.moveTo(x - r * 0.065, eyeY); ctx.quadraticCurveTo(x, eyeY - r * 0.07, x + r * 0.065, eyeY); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(x, eyeY, r * 0.065, r * (surprise ? 0.12 : 0.095), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    if (surprise) ctx.ellipse(look, r * 0.08, r * 0.08, r * 0.11, 0, 0, Math.PI * 2);
    else { ctx.moveTo(-r * 0.16 + look, r * 0.025); ctx.quadraticCurveTo(look, r * 0.24, r * 0.16 + look, r * 0.025); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(222,185,207,0.40)';
    for (side = -1; side <= 1; side += 2) {
      ctx.beginPath(); ctx.ellipse(side * r * 0.48 + look, r * 0.025, r * 0.1, r * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function surfaceSlimeDraw(b) {
    var m = b.surfaceSlime;
    if (!m || !isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) return;
    jelloRingBake(b);
    var path = jelloCachedRingPath(b), r = m.radius, hue = m.hue;
    var h = Math.max(1, b.bboxB - b.bboxT), w = Math.max(1, b.bboxR - b.bboxL);
    ctx.save();
    if (jelloSupportedBelowTile(b)) {
      ctx.fillStyle = 'rgba(30,36,32,0.18)'; ctx.beginPath();
      ctx.ellipse(b.cx, b.bboxB + 3, w * 0.43, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.clip(path);
    var gel = ctx.createLinearGradient(b.cx, b.bboxT - 4, b.cx + r * 0.25, b.bboxB + 4);
    gel.addColorStop(0, 'hsla(' + hue + ',42%,81%,0.97)');
    gel.addColorStop(0.45, 'hsla(' + hue + ',38%,66%,0.94)');
    gel.addColorStop(1, 'hsla(' + (hue + 9) + ',34%,40%,0.98)');
    ctx.fillStyle = gel; ctx.fillRect(b.bboxL - 12, b.bboxT - 12, w + 24, h + 24);
    // Fit the face and internal highlights to the physical mesh, so impacts
    // stretch, rotate and compress their features with the body.
    jelloShadeMatrix(b);
    ctx.translate(b.cx, b.cy);
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
    surfaceSlimeFace(m, r, m.state === 'tumble' && Math.hypot(b.vx, b.vy) * JELLO_TIMESCALE > 140);
    ctx.restore(); ctx.restore();
  }

  // Bath departure animation uses the new material immediately upon the
  // completed soak. Its physical resident is created at the surface door.
  function surfaceSlimeDrawGuest(s) {
    var r = s.r, pulse = Math.sin(s.age * 8) * 0.035;
    var hue = surfaceSlimeHues[Math.floor(s.seed * 5) % 5];
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1.12 + pulse, 0.88 - pulse);
    ctx.beginPath(); ctx.moveTo(-r, r * 0.25);
    ctx.bezierCurveTo(-r * 1.1, -r * 1.05, r * 0.9, -r * 1.2, r, r * 0.2);
    ctx.bezierCurveTo(r * 1.18, r * 0.83, r * 0.25, r * 0.7, 0, r * 0.65);
    ctx.bezierCurveTo(-r * 0.45, r * 0.82, -r * 1.18, r * 0.75, -r, r * 0.25);
    var gel = ctx.createLinearGradient(0, -r, 0, r);
    gel.addColorStop(0, 'hsl(' + hue + ',42%,81%)'); gel.addColorStop(1, 'hsl(' + hue + ',34%,44%)');
    ctx.fillStyle = gel; ctx.fill(); surfaceSlimeFace({ blink: s.blink, look: 0 }, r, false);
    ctx.restore();
  }

  function surfaceSlimeSave() {
    return { seeded: surfaceSlimesSeeded, residents: jelloBodies.filter(function (b) { return !!b.surfaceSlime; }).map(function (b) {
      var m = b.surfaceSlime;
      return { id: m.id, seed: m.seed, hue: m.hue, home: m.home, x: b.cx, y: b.cy };
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
