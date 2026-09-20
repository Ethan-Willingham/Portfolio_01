  /* ---- Active gel: travelling muscle waves and breakable terrain adhesion ---- */
  var SURFACE_SLIME_WAVE = 0.29;
  var SURFACE_SLIME_WAVE_SPEED = 6.4;
  var SURFACE_SLIME_GRIP_RANGE = 11;

  function surfaceSlimeMotorInit(b) {
    var m = b.surfaceSlime;
    m.phase = m.seed * Math.PI * 2; m.angle = 0; m.drive = false;
    m.detach = 0; m.climb = false; m.crest = 0; m.anchors = new Array(b.n);
    m.waveCos = new Float32Array(b.n);
    b.muscleX = Float64Array.from(b.qx); b.muscleY = Float64Array.from(b.qy);
    b.muscleRest = Float32Array.from(b.sRest);
    b.materialSoftness = 3.5;
    b.materialDamping = 0.28;
  }

  function surfaceSlimeDetach(b, seconds) {
    var m = b && b.surfaceSlime;
    if (!m) return;
    m.detach = Math.max(m.detach || 0, seconds || 1.3);
    m.anchors.fill(null); m.contacts = 0; m.climb = false; m.crest = 0; m.drive = false;
    m.state = 'tumble'; m.timer = m.detach;
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
    m.detach = Math.max(0, m.detach - dt);
    m.crest = Math.max(0, m.crest - dt);
    var speed = Math.hypot(b.vx || 0, b.vy || 0) * JELLO_TIMESCALE;
    var touched = b._plyMs && b._plyMs !== m.lastPlayerMs;
    m.lastPlayerMs = b._plyMs;
    if (b._grabbed || b._carried || (touched && (m.climb || speed > 35))) {
      surfaceSlimeDetach(b, 1.1);
    }
    if (m.detach > 0) { m.drive = false; return; }
    if (m.timer <= 0 || m.state === 'tumble') {
      m.state = m.state === 'crawl' ? 'idle' : 'crawl';
      m.timer = m.state === 'crawl' ? 5 + m.seed * 4 : 0.8 + m.seed;
      if (!m.climb && Math.abs(b.cx - m.home) > TILE * 8) m.dir = b.cx < m.home ? 1 : -1;
    }
    var wall = null;
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k];
      if ((b.px[p] - b.cx) * m.dir < 0) continue;
      var near = surfaceSlimeTerrainNear(b.px[p], b.py[p], 12);
      // A rim brushing a top corner is not a new vertical wall to climb.
      if (near && near.nx * m.dir < -0.7 && near.r * TILE < b.cy + m.radius * 0.2) { wall = near; break; }
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
      if (clearTop && b.cy < Math.floor((b.bboxB + 8) / TILE) * TILE - m.radius * 0.32) {
        m.climb = false; m.crest = 1.5; m.state = 'crawl'; m.timer = 4;
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
    var active = m.drive && !m.detach && !b._grabbed;
    m.phase += (active ? SURFACE_SLIME_WAVE_SPEED : 2.6) * dt;
    var desiredAngle = m.climb ? -m.dir * Math.PI / 2 : 0;
    m.angle += (desiredAngle - m.angle) * Math.min(1, dt * 4);
    var ca = Math.cos(m.angle), sa = Math.sin(m.angle);
    var amplitude = m.radius * (active ? SURFACE_SLIME_WAVE : 0.065);
    var sumX = 0, sumY = 0;
    for (var i = 0; i < b.n; i++) {
      var qx = b.qx[i], qy = b.qy[i], u = qx * m.dir / m.radius;
      var phase = m.phase + u * 2.8;
      var sn = Math.sin(phase), cs = Math.cos(phase);
      // A lower patch moves forward while lifted, then contracts backward
      // while planted. A smaller wave travels through the crown as well.
      var skin = 0.42 + 0.58 * skySlimeClamp((qy / m.radius + 0.6) / 1.2, 0, 1);
      var tx = qx + m.dir * amplitude * sn * skin;
      var ty = qy - amplitude * cs * skin * 0.85;
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
    for (var k = 0; k < b.ringN; k++) {
      var p = b.ring[k], anchor = m.anchors[p];
      // Briefly bridge both faces at a crest, then release the old wall.
      if (anchor && ((m.climb ? anchor.nx * m.dir > -0.6 : !m.crest && anchor.ny > -0.6) || !tileAt(anchor.r, anchor.c) || m.waveCos[p] > 0.25 ||
          Math.hypot(b.px[p] - anchor.x, b.py[p] - anchor.y) > 22)) anchor = null;
      if (!anchor && m.waveCos[p] < 0.1) {
        anchor = surfaceSlimeTerrainNear(b.px[p], b.py[p], SURFACE_SLIME_GRIP_RANGE);
        if (anchor && (m.climb ? anchor.nx * m.dir > -0.6 : !m.crest && anchor.ny > -0.6)) anchor = null;
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
