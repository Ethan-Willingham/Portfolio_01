  /* ---- Active gel: travelling muscle waves and breakable terrain adhesion ---- */
  var SURFACE_SLIME_WAVE = 0.32;
  var SURFACE_SLIME_WAVE_SPEED = 3.0;
  var SURFACE_SLIME_GRIP_RANGE = 11;

  function surfaceSlimeMotorInit(b) {
    var m = b.surfaceSlime;
    m.phase = m.seed * Math.PI * 2; m.angle = 0; m.drive = false;
    m.detach = 0; m.climb = false; m.crest = 0; m.topGrip = false; m.anchors = new Array(b.n);
    m.waveCos = new Float32Array(b.n);
    m.materialAngle = 0; m.poseAngle = 0; m.reorient = true; m.power = 0;
    m.edgePause = 0; m.edgeTurn = 0; m.floorY = null; m.strideDir = m.dir;
    m.motorBlend = 0; m.stretch = 1;
    m.goalX = b.cx + m.dir * TILE * (3 + m.seed * 2);
    m.goalDir = m.dir;
    m.rng = ((m.seed * 1000000000) ^ Math.imul(m.id | 0, 2654435761)) >>> 0;
    m.gaitSpeed = 1; m.gaitAmplitude = 1; m.gaitLength = 2.8;
    surfaceSlimeChooseGait(m);
    b.muscleX = Float64Array.from(b.qx); b.muscleY = Float64Array.from(b.qy);
    b.muscleRest = Float32Array.from(b.sRest);
    m.baseX = new Float64Array(b.n); m.baseY = new Float64Array(b.n); m.waveLimit = 1;
    m.lastMuscleX = Float64Array.from(b.qx); m.lastMuscleY = Float64Array.from(b.qy);
    b.materialSoftness = 3.5;
    b.materialDamping = 0.65;
  }

  function surfaceSlimeRandom(m) {
    m.rng = (Math.imul(m.rng, 1664525) + 1013904223) >>> 0;
    return m.rng / 4294967296;
  }

  function surfaceSlimeChooseGait(m) {
    m.gaitIn = 6 + surfaceSlimeRandom(m) * 5;
    m.targetSpeed = 0.92 + surfaceSlimeRandom(m) * 0.16;
    m.targetAmplitude = 0.90 + surfaceSlimeRandom(m) * 0.16;
    m.targetLength = 2.6 + surfaceSlimeRandom(m) * 0.35;
  }

  function surfaceSlimeMaterialFrame(b) {
    // Fit the current rotation of the material, never a world-up target.
    // Any point can become a foot after a roll; material identity is retained.
    var m = b.surfaceSlime, real = 0, imag = 0;
    for (var i = 0; i < b.n; i++) {
      var x = b.px[i] - b.cx, y = b.py[i] - b.cy;
      real += b.qx[i] * x + b.qy[i] * y;
      imag += b.qx[i] * y - b.qy[i] * x;
    }
    var angle = Math.atan2(imag, real), delta = angle - m.materialAngle;
    m.materialAngle += Math.atan2(Math.sin(delta), Math.cos(delta));
  }

  function surfaceSlimeDetach(b, seconds) {
    var m = b && b.surfaceSlime;
    if (!m) return;
    m.detach = Math.max(m.detach || 0, seconds || 1.3);
    m.anchors.fill(null); m.contacts = 0; m.climb = false; m.crest = 0; m.topGrip = false; m.drive = false;
    m.state = 'tumble'; m.timer = m.detach; m.reorient = true; m.power = 0;
    m.floorY = null; m.edgePause = 0;
    m.motorBlend = 0;
    b.sleeping = false; b.sleepFrames = 0;
  }

  function surfaceSlimeTerrainNear(x, y, reach) {
    var left = Math.floor((x - reach) / TILE), right = Math.floor((x + reach) / TILE);
    var top = Math.floor((y - reach) / TILE), bottom = Math.floor((y + reach) / TILE);
    var best = null, bestD = reach * reach;
    for (var r = top; r <= bottom; r++) for (var c = left; c <= right; c++) {
      if (!tileAt(r, c)) continue;
      var x0 = c * TILE, x1 = x0 + TILE, y0 = r * TILE, y1 = y0 + TILE;
      var qx = skySlimeClamp(x, x0, x1), qy = skySlimeClamp(y, y0, y1);
      var dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
      if (!(d2 < bestD) || d2 < 0.00001) continue;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      // Interior faces cannot become hidden handholds inside a solid wall.
      if (jelloWorldSolidAt(qx + nx * 0.6, qy + ny * 0.6)) continue;
      bestD = d2; best = { x: qx + nx * 0.6, y: qy + ny * 0.6, nx: nx, ny: ny, r: r, c: c };
    }
    return best;
  }

  function surfaceSlimeThink(b, dt) {
    var m = b.surfaceSlime;
    surfaceSlimeMaterialFrame(b);
    m.gaitIn -= dt;
    if (m.gaitIn <= 0) surfaceSlimeChooseGait(m);
    var blend = 1 - Math.exp(-dt * 0.55);
    m.gaitSpeed += (m.targetSpeed - m.gaitSpeed) * blend;
    m.gaitAmplitude += (m.targetAmplitude - m.gaitAmplitude) * blend;
    m.gaitLength += (m.targetLength - m.gaitLength) * blend;
    m.detach = Math.max(0, m.detach - dt);
    m.crest = Math.max(0, m.crest - dt);
    m.edgePause = Math.max(0, m.edgePause - dt);
    m.edgeTurn = Math.max(0, m.edgeTurn - dt);
    var touched = b._plyMs && b._plyMs !== m.lastPlayerMs;
    m.lastPlayerMs = b._plyMs;
    if (b._grabbed || b._carried || touched) {
      surfaceSlimeDetach(b, 1.1);
    }
    if (m.motorBlend < 0.02 || m.reorient) m.poseAngle = m.materialAngle;
    if (m.detach > 0) { m.drive = false; return; }
    var wall = null, supported = false, crestTop = null, floorY = null;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      var near = surfaceSlimeTerrainNear(b.px[p], b.py[p], 12);
      if (!near) continue;
      if (near.ny < -0.5 || near.nx * m.dir < -0.7) supported = true;
      if (near.ny < -0.8 && Math.abs(b.px[p] - b.cx) < m.radius * 1.4) floorY = near.y;
      if (m.climb && near.c === m.wallCol && near.ny < -0.55 && !tileAt(near.r - 1, near.c) &&
          b.cy < near.y + m.radius * 1.05) crestTop = near.y;
      // A rim brushing a top corner is not a new vertical wall to climb.
      if ((b.px[p] - b.cx) * m.dir >= 0 && near.nx * m.dir < -0.7 &&
          near.r * TILE < b.cy + m.radius * 0.2) wall = near;
    }
    if (floorY !== null) m.floorY = floorY;
    if (m.reorient) {
      // Keep tumbling in the air. The first new support becomes the base;
      // there is no return to the points that were underneath at birth.
      if (!supported && !m.wet) { m.drive = false; return; }
      m.poseAngle = m.materialAngle; m.reorient = false; m.angle = wall ? -m.dir * Math.PI / 2 : 0;
      m.anchors.fill(null);
    }
    if (m.goalDir !== m.dir) {
      m.goalDir = m.dir;
      m.goalX = b.cx + m.dir * TILE * (3 + m.seed * 2);
    }
    if (!m.climb && !m.crest && m.state === 'crawl' && (m.goalX - b.cx) * m.dir < m.radius * 0.4) m.timer = 0;
    if (m.timer <= 0 || m.state === 'tumble') {
      m.state = (m.state === 'crawl' || m.state === 'climb') ? 'idle' : 'crawl';
      m.timer = m.state === 'crawl' ? 16 + surfaceSlimeRandom(m) * 10 : 1.2 + surfaceSlimeRandom(m) * 1.8;
      if (!m.climb && m.state === 'crawl') {
        if (Math.abs(b.cx - m.home) > TILE * 8) m.dir = b.cx < m.home ? 1 : -1;
        else if (surfaceSlimeRandom(m) < 0.20) m.dir *= -1;
        m.goalX = b.cx + m.dir * TILE * (3 + surfaceSlimeRandom(m) * 3);
        m.goalDir = m.dir;
      }
    }
    if (wall && !m.crest && m.state !== 'idle') {
      m.climb = true; m.wallCol = wall.c;
    }
    if (m.climb) {
      // Round an exposed top corner by turning the same contact wave back
      // onto the horizontal surface. No centroid path or ledge teleport.
      var row = Math.floor(b.cy / TILE);
      var clearTop = !tileAt(row, m.wallCol) && !tileAt(row - 1, m.wallCol);
      if (crestTop !== null || (clearTop && b.cy < Math.floor((b.bboxB + 8) / TILE) * TILE - m.radius * 0.32)) {
        m.crestTop = crestTop === null ? Math.floor((b.bboxB + 8) / TILE) * TILE : crestTop;
        m.climb = false; m.crest = 8; m.topGrip = false;
        m.crestTurn = m.poseAngle; m.state = 'crawl'; m.timer = Math.max(m.timer, 10);
      }
      if (m.climb && m.state !== 'idle') m.state = 'climb';
    }
    if (!m.climb && !m.crest && !m.wet && !wall && !m.edgeTurn && m.floorY !== null &&
        m.floorY > b.cy && m.floorY - b.cy < m.radius * 1.8) {
      // Probe the actual support plane, not the bouncing lowest skin point.
      // Check every intervening column so a narrow shaft is not skipped by
      // a long look-ahead. Keep the center of mass on this bank while turning.
      var look = m.radius * 1.6 + Math.max(0, b.vx * JELLO_TIMESCALE * m.dir) * 0.22;
      for (var ahead = 4; ahead <= look; ahead += 4) {
        if (jelloWorldSolidAt(b.cx + m.dir * ahead, m.floorY + 2)) continue;
        m.dir *= -1; m.edgePause = 0.7; m.edgeTurn = 1.8;
        m.goalX = b.cx + m.dir * TILE * (3 + surfaceSlimeRandom(m) * 2);
        m.goalDir = m.dir;
        m.state = 'crawl'; m.timer = Math.max(m.timer, 16);
        break;
      }
    }
    // A resting snail still holds the wall. Drive means a living supported
    // shape; power below determines whether its foot is taking a stride.
    m.drive = supported || m.state === 'crawl' || m.climb || m.edgePause > 0 || !!m.wet;
    b.sleeping = false; b.sleepFrames = 0;
  }

  function surfaceSlimeMuscleStep(b, h) {
    var m = b.surfaceSlime, dt = h / JELLO_TIMESCALE;
    m.lastMuscleX.set(b.muscleX); m.lastMuscleY.set(b.muscleY);
    var active = m.drive && m.state !== 'idle' && !m.edgePause && !m.detach && !b._grabbed && !m.reorient;
    m.power += ((active ? 1 : 0) - m.power) * Math.min(1, dt * 2.4);
    m.motorBlend += ((m.drive && !m.detach && !m.reorient ? 1 : 0) - m.motorBlend) * Math.min(1, dt * 2.4);
    m.strideDir += (m.dir - m.strideDir) * Math.min(1, dt * 2.4);
    var tempo = m.gaitSpeed * (1 + 0.035 * Math.sin(m.age * 0.4 + m.seed * 9));
    var restingTempo = m.climb || m.edgePause ? 0 : 0.8;
    m.phase += (restingTempo * (1 - m.power) + SURFACE_SLIME_WAVE_SPEED * tempo * (m.climb ? 0.82 : 1) * m.power) * dt;
    var desiredAngle = m.climb ? -m.dir * Math.PI / 2 :
      m.crest && b.cy > m.crestTop - m.radius * 0.35 ? -m.dir * Math.PI / 4 : 0;
    m.angle += (desiredAngle - m.angle) * Math.min(1, dt * 2);
    var ca = Math.cos(m.angle), sa = Math.sin(m.angle);
    // Once the leading skin has a real handhold on top, curl around it.
    // The turn is relative to the current material pose, never back to birth.
    if (m.crest && m.topGrip) {
      m.poseAngle += skySlimeClamp(m.crestTurn - m.poseAngle, -dt, dt);
    }
    var bodyC = Math.cos(m.poseAngle), bodyS = Math.sin(m.poseAngle);
    var amplitude = m.radius * (0.045 * (1 - m.power) + SURFACE_SLIME_WAVE * m.gaitAmplitude * m.power);
    var desiredStretch = 1 + (m.climb ? 0.28 : m.power * (m.crest ? 0.30 : 0.24));
    m.stretch += (desiredStretch - m.stretch) * Math.min(1, dt * 2.4);
    var sumX = 0, sumY = 0;
    for (var i = 0; i < b.n; i++) {
      var wx = bodyC * b.qx[i] - bodyS * b.qy[i];
      var wy = bodyS * b.qx[i] + bodyC * b.qy[i];
      // The contact frame chooses this stride's underside independently of
      // the material rotation. These can be entirely different skin points.
      var qx = ca * wx + sa * wy, qy = -sa * wx + ca * wy;
      var u = qx * m.strideDir / m.radius;
      var phase = m.phase + u * m.gaitLength;
      var cs = Math.cos(phase);
      var sn = Math.sin(phase) + 0.10 * Math.sin(phase * 2 + m.seed * 5);
      // Longitudinal contraction stays monotone across the body. Varying it
      // through the depth as well used to twist the contact cells inside out.
      var dx = m.strideDir * amplitude * sn * 0.70;
      // Bend each cross-section together. A shared transverse wave preserves
      // material order through the depth instead of driving the foot and back
      // past one another. The same wave remains visible along the whole rim.
      var dy = -amplitude * cs * 0.85;
      // Spread along the support and gather across it, whichever material
      // side is touching. At a corner this makes a reaching lobe, not a jump.
      var stretch = m.stretch;
      m.baseX[i] = ca * qx * stretch - sa * qy / stretch;
      m.baseY[i] = sa * qx * stretch + ca * qy / stretch;
      var tx = qx * stretch + dx, ty = qy / stretch + dy;
      b.muscleX[i] = ca * tx - sa * ty;
      b.muscleY[i] = sa * tx + ca * ty;
      m.waveCos[i] = cs;
      sumX += b.muscleX[i]; sumY += b.muscleY[i];
    }
    // Internal muscles cannot manufacture translation in free space.
    sumX /= b.n; sumY /= b.n;
    for (i = 0; i < b.n; i++) { b.muscleX[i] -= sumX; b.muscleY[i] -= sumY; }
    surfaceSlimeLimitWave(b, dt);
    for (var s = 0; s < b.springN; s++) {
      var a = b.sA[s], c = b.sB[s];
      var length = Math.hypot(b.muscleX[a] - b.muscleX[c], b.muscleY[a] - b.muscleY[c]);
      b.sRest[s] = skySlimeClamp(length, b.muscleRest[s] * 0.60, b.muscleRest[s] * 1.5);
    }
  }

  function surfaceSlimeDampMotion(b, h) {
    var m = b.surfaceSlime;
    if (m.detach || m.reorient || b._grabbed || b._carried || !m.contacts || m.motorBlend < 0.05) return;
    // Viscous muscle damping follows the slowly travelling target instead of
    // letting elastic skin ring at hundreds of pixels per second between
    // grips. Keep bulk momentum intact; external touches disable this motor.
    var vx = 0, vy = 0;
    for (var p = 0; p < b.n; p++) { vx += b.px[p] - b.ox[p]; vy += b.py[p] - b.oy[p]; }
    vx /= b.n; vy /= b.n;
    var damp = 1 - Math.exp(-80 * h / JELLO_TIMESCALE * m.motorBlend);
    for (p = 0; p < b.n; p++) {
      var targetX = vx + b.muscleX[p] - m.lastMuscleX[p];
      var targetY = vy + b.muscleY[p] - m.lastMuscleY[p];
      b.ox[p] += ((b.px[p] - b.ox[p]) - targetX) * damp;
      b.oy[p] += ((b.py[p] - b.oy[p]) - targetY) * damp;
    }
  }

  function surfaceSlimeLimitWave(b, dt) {
    // A travelling wave must never ask the material to turn inside out.
    // Along the path from the stretched rest pose to the wave, each signed
    // cell area is a quadratic. Its first root gives a continuous amplitude
    // limit with 20% area reserve, before the emergency fold healer is needed.
    var m = b.surfaceSlime, limit = 1, inverse = b.triDmInv;
    for (var t = 0; t < b.triN; t++) {
      var a = b.triA[t], c = b.triB[t], d = b.triC[t];
      var x1 = m.baseX[c] - m.baseX[a], y1 = m.baseY[c] - m.baseY[a];
      var x2 = m.baseX[d] - m.baseX[a], y2 = m.baseY[d] - m.baseY[a];
      var dx1 = b.muscleX[c] - b.muscleX[a] - x1, dy1 = b.muscleY[c] - b.muscleY[a] - y1;
      var dx2 = b.muscleX[d] - b.muscleX[a] - x2, dy2 = b.muscleY[d] - b.muscleY[a] - y2;
      var inv = inverse[t * 4] * inverse[t * 4 + 3] - inverse[t * 4 + 1] * inverse[t * 4 + 2];
      var A = (dx1 * dy2 - dy1 * dx2) * inv;
      var B = (x1 * dy2 + dx1 * y2 - y1 * dx2 - dy1 * x2) * inv;
      var C = (x1 * y2 - y1 * x2) * inv - 0.20;
      if (Math.abs(A) < 0.0000001) {
        if (B < 0) limit = Math.min(limit, -C / B);
      } else {
        var disc = B * B - 4 * A * C;
        if (disc > 0) {
          var root = Math.sqrt(disc), r1 = (-B - root) / (2 * A), r2 = (-B + root) / (2 * A);
          if (r1 > 0) limit = Math.min(limit, r1);
          if (r2 > 0) limit = Math.min(limit, r2);
        }
      }
    }
    limit = skySlimeClamp(limit * 0.98, 0, 1);
    m.waveLimit = Math.min(limit, m.waveLimit + dt * 0.3);
    for (var p = 0; p < b.n; p++) {
      b.muscleX[p] = m.baseX[p] + (b.muscleX[p] - m.baseX[p]) * m.waveLimit;
      b.muscleY[p] = m.baseY[p] + (b.muscleY[p] - m.baseY[p]) * m.waveLimit;
    }
  }

  function surfaceSlimeAdhesionStep(b, h) {
    var m = b.surfaceSlime;
    // Buoyant residents release their foot instead of pinning themselves to
    // the pond floor with the same bonds that hold them on a dry wall.
    if (m.wet || (!m.drive && m.motorBlend < 0.02) || m.detach > 0 || b._grabbed || b._carried) { m.anchors.fill(null); m.contacts = 0; return; }
    var dt = h / JELLO_TIMESCALE;
    var contacts = 0, holding = m.state === 'idle' || m.edgePause > 0;
    if (m.crest && !m.topGrip) {
      var topPoints = 0, materialX = 0, materialY = 0;
      for (var a = 0; a < m.anchors.length; a++) {
        var grip = m.anchors[a];
        if (grip && grip.ny < -0.6 && Math.abs(grip.y - m.crestTop) < 3) {
          topPoints++; materialX += b.qx[a]; materialY += b.qy[a];
        }
      }
      if (topPoints >= 2) {
        m.topGrip = true;
        // The skin already holding the ledge becomes the new underside.
        // A previously rolled body may need a different amount of curl.
        var c = Math.cos(m.poseAngle), s = Math.sin(m.poseAngle);
        var gx = c * materialX - s * materialY, gy = s * materialX + c * materialY;
        m.crestTurn = m.poseAngle + Math.atan2(gx, gy);
      }
    }
    // Count only surviving bonds before releasing a foot patch. Overlapping
    // patches keep the gel attached throughout each snail-like pedal wave.
    var attached = 0;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k], anchor = m.anchors[p];
      if (anchor && ((m.climb ? anchor.nx * m.dir > -0.6 : (!m.crest || m.topGrip) && anchor.ny > -0.6) ||
          !tileAt(anchor.r, anchor.c) || Math.hypot(b.px[p] - anchor.x, b.py[p] - anchor.y) > 22)) m.anchors[p] = null;
      else if (anchor && !anchor.releasing && anchor.strength > 0.65) attached++;
    }
    for (k = 0; k < b.ringN; k++) {
      var p = b.ring[k], anchor = m.anchors[p];
      // Briefly bridge both faces at a crest, then release the old wall.
      if (anchor && !anchor.releasing && anchor.strength > 0.65 && !holding && m.waveCos[p] > 0.45 && attached > (m.climb ? 2 : 1)) {
        anchor.releasing = true; attached--;
      }
      if (!anchor && (holding || m.waveCos[p] < 0.25)) {
        anchor = surfaceSlimeTerrainNear(b.px[p], b.py[p], SURFACE_SLIME_GRIP_RANGE);
        if (anchor && (m.climb ? anchor.nx * m.dir > -0.6 : (!m.crest || m.topGrip) && anchor.ny > -0.6)) anchor = null;
        if (anchor) anchor.strength = 0;
      }
      m.anchors[p] = anchor;
      if (!anchor) continue;
      anchor.strength = skySlimeClamp(anchor.strength + dt * (anchor.releasing ? -5 : 6), 0, 1);
      if (anchor.releasing && anchor.strength <= 0) { m.anchors[p] = null; continue; }
      contacts++;
      // Compliant, finite-strength bonds. The anchor is fixed on the terrain
      // until its material patch lifts. Muscles do the work between anchors.
      var strength = anchor.strength * anchor.strength * (3 - 2 * anchor.strength);
      var gain = strength / (1 + 0.000003 / (h * h));
      var dx = (anchor.x - b.px[p]) * gain, dy = (anchor.y - b.py[p]) * gain;
      var cap = 100 * dt * strength, length = Math.hypot(dx, dy);
      if (length > cap) { dx *= cap / length; dy *= cap / length; }
      b.px[p] += dx; b.py[p] += dy;
    }
    m.contacts = contacts;
  }
