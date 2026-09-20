  /* ---- Active gel: travelling muscle waves and breakable terrain adhesion ---- */
  var SURFACE_SLIME_WAVE = 0.29;
  var SURFACE_SLIME_WAVE_SPEED = 6.4;
  var SURFACE_SLIME_GRIP_RANGE = 11;

  function surfaceSlimeMotorInit(b) {
    var m = b.surfaceSlime;
    m.phase = m.seed * Math.PI * 2; m.angle = 0; m.drive = false;
    m.detach = 0; m.climb = false; m.crest = 0; m.topGrip = false; m.anchors = new Array(b.n);
    m.waveCos = new Float32Array(b.n);
    m.materialAngle = 0; m.poseAngle = 0; m.reorient = true; m.power = 0;
    m.rng = ((m.seed * 1000000000) ^ Math.imul(m.id | 0, 2654435761)) >>> 0;
    m.gaitSpeed = 1; m.gaitAmplitude = 1; m.gaitLength = 2.8;
    surfaceSlimeChooseGait(m);
    b.muscleX = Float64Array.from(b.qx); b.muscleY = Float64Array.from(b.qy);
    b.muscleRest = Float32Array.from(b.sRest);
    b.materialSoftness = 3.5;
    b.materialDamping = 0.28;
  }

  function surfaceSlimeRandom(m) {
    m.rng = (Math.imul(m.rng, 1664525) + 1013904223) >>> 0;
    return m.rng / 4294967296;
  }

  function surfaceSlimeChooseGait(m) {
    m.gaitIn = 1.8 + surfaceSlimeRandom(m) * 3.2;
    m.targetSpeed = 0.82 + surfaceSlimeRandom(m) * 0.40;
    m.targetAmplitude = 0.84 + surfaceSlimeRandom(m) * 0.30;
    m.targetLength = 2.45 + surfaceSlimeRandom(m) * 0.65;
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
    var blend = 1 - Math.exp(-dt * 1.6);
    m.gaitSpeed += (m.targetSpeed - m.gaitSpeed) * blend;
    m.gaitAmplitude += (m.targetAmplitude - m.gaitAmplitude) * blend;
    m.gaitLength += (m.targetLength - m.gaitLength) * blend;
    m.detach = Math.max(0, m.detach - dt);
    m.crest = Math.max(0, m.crest - dt);
    var touched = b._plyMs && b._plyMs !== m.lastPlayerMs;
    m.lastPlayerMs = b._plyMs;
    if (b._grabbed || b._carried || touched) {
      surfaceSlimeDetach(b, 1.1);
    }
    if (!m.drive || m.reorient) m.poseAngle = m.materialAngle;
    if (m.detach > 0) { m.drive = false; return; }
    var wall = null, supported = false, crestTop = null;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      var near = surfaceSlimeTerrainNear(b.px[p], b.py[p], 12);
      if (!near) continue;
      if (near.ny < -0.5 || near.nx * m.dir < -0.7) supported = true;
      if (m.climb && near.c === m.wallCol && near.ny < -0.55 && !tileAt(near.r - 1, near.c) &&
          b.cy < near.y + m.radius * 0.6) crestTop = near.y;
      // A rim brushing a top corner is not a new vertical wall to climb.
      if ((b.px[p] - b.cx) * m.dir >= 0 && near.nx * m.dir < -0.7 &&
          near.r * TILE < b.cy + m.radius * 0.2) wall = near;
    }
    if (m.reorient) {
      // Keep tumbling in the air. The first new support becomes the base;
      // there is no return to the points that were underneath at birth.
      if (!supported && !m.wet) { m.drive = false; return; }
      m.poseAngle = m.materialAngle; m.reorient = false; m.angle = wall ? -m.dir * Math.PI / 2 : 0;
      m.anchors.fill(null);
    }
    if (m.timer <= 0 || m.state === 'tumble') {
      m.state = m.state === 'crawl' ? 'idle' : 'crawl';
      m.timer = m.state === 'crawl' ? 3.5 + surfaceSlimeRandom(m) * 5 : 0.35 + surfaceSlimeRandom(m) * 1.6;
      if (!m.climb) {
        if (Math.abs(b.cx - m.home) > TILE * 8) m.dir = b.cx < m.home ? 1 : -1;
        else if (m.state === 'crawl' && surfaceSlimeRandom(m) < 0.14) m.dir *= -1;
      }
    }
    if (wall && !m.crest && m.state !== 'idle') {
      m.climb = true; m.wallCol = wall.c;
      m.timer = Math.max(m.timer, 2);
    }
    if (m.climb) {
      // Round an exposed top corner by turning the same contact wave back
      // onto the horizontal surface. No centroid path or ledge teleport.
      var row = Math.floor(b.cy / TILE);
      var clearTop = !tileAt(row, m.wallCol) && !tileAt(row - 1, m.wallCol);
      if (crestTop !== null || (clearTop && b.cy < Math.floor((b.bboxB + 8) / TILE) * TILE - m.radius * 0.32)) {
        m.crestTop = crestTop === null ? Math.floor((b.bboxB + 8) / TILE) * TILE : crestTop;
        m.climb = false; m.crest = 3.5; m.topGrip = false;
        m.crestTurn = m.poseAngle; m.state = 'crawl'; m.timer = 4;
      }
      if (m.climb) m.state = 'climb';
    }
    if (!m.climb && m.state === 'crawl' && jelloSupportedBelowTile(b)) {
      var aheadX = b.cx + m.dir * (m.radius + 18);
      var aheadY = b.bboxB + 16;
      if (!wall && !tileAt(Math.floor(aheadY / TILE), Math.floor(aheadX / TILE))) m.dir *= -1;
    }
    m.drive = m.state === 'crawl' || m.climb || !!m.wet;
    b.sleeping = false; b.sleepFrames = 0;
  }

  function surfaceSlimeMuscleStep(b, h) {
    var m = b.surfaceSlime, dt = h / JELLO_TIMESCALE;
    var active = m.drive && !m.detach && !b._grabbed && !m.reorient;
    m.power += ((active ? 1 : 0) - m.power) * Math.min(1, dt * 5);
    var tempo = m.gaitSpeed * (1 + 0.07 * Math.sin(m.age * 0.91 + m.seed * 9));
    m.phase += (active ? SURFACE_SLIME_WAVE_SPEED * tempo : 2.6) * dt;
    var desiredAngle = m.climb ? -m.dir * Math.PI / 2 :
      m.crest && b.cy > m.crestTop - m.radius * 0.35 ? -m.dir * Math.PI / 4 : 0;
    m.angle += (desiredAngle - m.angle) * Math.min(1, dt * 4);
    var ca = Math.cos(m.angle), sa = Math.sin(m.angle);
    // Once the leading skin has a real handhold on top, curl around it.
    // The turn is relative to the current material pose, never back to birth.
    if (m.crest && m.topGrip) {
      m.poseAngle += skySlimeClamp(m.crestTurn - m.poseAngle, -dt * 1.7, dt * 1.7);
    }
    var bodyC = Math.cos(m.poseAngle), bodyS = Math.sin(m.poseAngle);
    var amplitude = m.radius * (0.045 * (1 - m.power) + SURFACE_SLIME_WAVE * m.gaitAmplitude * m.power);
    var sumX = 0, sumY = 0;
    for (var i = 0; i < b.n; i++) {
      var wx = bodyC * b.qx[i] - bodyS * b.qy[i];
      var wy = bodyS * b.qx[i] + bodyC * b.qy[i];
      // The contact frame chooses this stride's underside independently of
      // the material rotation. These can be entirely different skin points.
      var qx = ca * wx + sa * wy, qy = -sa * wx + ca * wy;
      var u = qx * m.dir / m.radius;
      var phase = m.phase + u * m.gaitLength;
      var cs = Math.cos(phase);
      var sn = Math.sin(phase) + 0.10 * Math.sin(phase * 2 + m.seed * 5);
      var skin = 0.42 + 0.58 * skySlimeClamp((qy / m.radius + 0.6) / 1.2, 0, 1);
      var dx = m.dir * amplitude * sn * skin;
      var dy = -amplitude * cs * skin * 0.85;
      // Spread along the support and gather across it, whichever material
      // side is touching. At a corner this makes a reaching lobe, not a jump.
      var stretch = 1 + m.power * (m.crest ? 0.30 : 0.16);
      var tx = qx * stretch + dx, ty = qy / stretch + dy;
      b.muscleX[i] = ca * tx - sa * ty;
      b.muscleY[i] = sa * tx + ca * ty;
      m.waveCos[i] = cs;
      sumX += b.muscleX[i]; sumY += b.muscleY[i];
    }
    // Internal muscles cannot manufacture translation in free space.
    sumX /= b.n; sumY /= b.n;
    for (i = 0; i < b.n; i++) { b.muscleX[i] -= sumX; b.muscleY[i] -= sumY; }
    for (var s = 0; s < b.springN; s++) {
      var a = b.sA[s], c = b.sB[s];
      var length = Math.hypot(b.muscleX[a] - b.muscleX[c], b.muscleY[a] - b.muscleY[c]);
      b.sRest[s] = skySlimeClamp(length, b.muscleRest[s] * 0.65, b.muscleRest[s] * 1.4);
    }
  }

  function surfaceSlimeAdhesionStep(b, h) {
    var m = b.surfaceSlime;
    if (!m.drive || m.detach > 0 || b._grabbed || b._carried) { m.anchors.fill(null); m.contacts = 0; return; }
    var contacts = 0;
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
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k], anchor = m.anchors[p];
      // Briefly bridge both faces at a crest, then release the old wall.
      if (anchor && ((m.climb ? anchor.nx * m.dir > -0.6 : (!m.crest || m.topGrip) && anchor.ny > -0.6) || !tileAt(anchor.r, anchor.c) || m.waveCos[p] > 0.25 ||
          Math.hypot(b.px[p] - anchor.x, b.py[p] - anchor.y) > 22)) anchor = null;
      if (!anchor && m.waveCos[p] < 0.1) {
        anchor = surfaceSlimeTerrainNear(b.px[p], b.py[p], SURFACE_SLIME_GRIP_RANGE);
        if (anchor && (m.climb ? anchor.nx * m.dir > -0.6 : (!m.crest || m.topGrip) && anchor.ny > -0.6)) anchor = null;
      }
      m.anchors[p] = anchor;
      if (!anchor) continue;
      contacts++;
      // Compliant, finite-strength bonds. The anchor is fixed on the terrain
      // until its material patch lifts. Muscles do the work between anchors.
      var gain = 1 / (1 + 0.0000015 / (h * h));
      var dx = (anchor.x - b.px[p]) * gain, dy = (anchor.y - b.py[p]) * gain;
      var cap = 320 * h / JELLO_TIMESCALE, length = Math.hypot(dx, dy);
      if (length > cap) { dx *= cap / length; dy *= cap / length; }
      b.px[p] += dx; b.py[p] += dy;
    }
    m.contacts = contacts;
  }
