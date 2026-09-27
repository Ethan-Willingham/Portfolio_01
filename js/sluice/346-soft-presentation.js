  /* ---- Material-attached resident presentation ----
     Every transform below reads the live lattice. The pupil is a small inertial
     particle inside the eye cup. None of these observers changes a body node,
     a constraint, a velocity history, or the collision silhouette. */
  function softPresentationBody(b) { return SOFT_PRESENTATION && !!b.surfaceSlime; }
  var softPresentationMatrix = new Float64Array(4);

  function softPresentationInit(b) {
    var m = b.surfaceSlime, state = m.presentation;
    if (state) return state;
    state = m.presentation = { nodes: [], patches: [], qxx: 0, qxy: 0, qyy: 0,
      initialized: false, vx: 0, vy: 0, x: b.px[0], y: b.py[0],
      compression: 0, extension: 0 };
    // The six spokes immediately around the eye measure local material strain.
    // Rest coordinates stay fixed when locomotion changes muscle rest lengths.
    for (var s = 0; s < b.springN; s++) {
      var p = b.sA[s] === 0 ? b.sB[s] : (b.sB[s] === 0 ? b.sA[s] : -1);
      if (p < 0 || state.nodes.indexOf(p) >= 0) continue;
      state.nodes.push(p);
      var x = b.rx[p] - b.rx[0], y = b.ry[p] - b.ry[0];
      state.qxx += x * x; state.qxy += x * y; state.qyy += y * y;
    }
    var det = state.qxx * state.qyy - state.qxy * state.qxy;
    if (det > 1e-12) {
      state.i00 = state.qyy / det; state.i01 = -state.qxy / det; state.i11 = state.qxx / det;
    } else { state.i00 = state.i01 = state.i11 = 0; }
    // One highlight and three inclusions attach to actual rest-mesh triangles.
    // A bent lobe moves its own highlight independently of the centre and rim.
    var angles = [3.98, 0.72, 1.57, 2.42];
    for (var n = 0; n < angles.length; n++) {
      var best = 0, distance = Infinity;
      for (var k = 0; k < b.ringN; k++) {
        var a = b.ring[k], c = b.ring[(k + 1) % b.ringN];
        var mx = (b.rx[a] + b.rx[c]) * 0.5 - b.rx[0];
        var my = (b.ry[a] + b.ry[c]) * 0.5 - b.ry[0];
        var length = Math.hypot(mx, my) || 1;
        var error = 1 - (mx * Math.cos(angles[n]) + my * Math.sin(angles[n])) / length;
        if (error < distance) { best = k; distance = error; }
      }
      a = b.ring[best]; c = b.ring[(best + 1) % b.ringN];
      var ax = b.rx[a] - b.rx[0], ay = b.ry[a] - b.ry[0];
      var cx = b.rx[c] - b.rx[0], cy = b.ry[c] - b.ry[0];
      var weight = n ? 0.25 : 0.3;
      var targetX = b.rx[0] + (ax + cx) * weight;
      var targetY = b.ry[0] + (ay + cy) * weight;
      var patch = null;
      for (var ti = 0; ti < b.triN; ti++) {
        var o = b.triA[ti], i = b.triB[ti], j = b.triC[ti];
        var ux = b.rx[i] - b.rx[o], uy = b.ry[i] - b.ry[o];
        var vx = b.rx[j] - b.rx[o], vy = b.ry[j] - b.ry[o];
        var determinant = ux * vy - uy * vx;
        if (Math.abs(determinant) < 1e-8) continue;
        var dx = targetX - b.rx[o], dy = targetY - b.ry[o];
        var wi = (dx * vy - dy * vx) / determinant;
        var wj = (ux * dy - uy * dx) / determinant;
        if (wi < -1e-6 || wj < -1e-6 || wi + wj > 1 + 1e-6) continue;
        patch = { o: o, a: i, c: j, wa: wi, wc: wj,
          i00: vy / determinant, i01: -vx / determinant,
          i10: -uy / determinant, i11: ux / determinant };
        break;
      }
      // Legacy/custom bodies without a health mesh still have a material fan.
      if (!patch) {
        determinant = ax * cy - ay * cx;
        patch = { o: 0, a: a, c: c, wa: weight, wc: weight,
          i00: determinant ? cy / determinant : 0, i01: determinant ? -cx / determinant : 0,
          i10: determinant ? -ay / determinant : 0, i11: determinant ? ax / determinant : 0 };
      }
      state.patches.push(patch);
    }
    return state;
  }

  function softPresentationEyeMatrix(b, state, out) {
    var xx = 0, xy = 0, yx = 0, yy = 0;
    for (var k = 0; k < state.nodes.length; k++) {
      var i = state.nodes[k], qx = b.rx[i] - b.rx[0], qy = b.ry[i] - b.ry[0];
      var dx = b.px[i] - b.px[0], dy = b.py[i] - b.py[0];
      xx += dx * qx; xy += dx * qy; yx += dy * qx; yy += dy * qy;
    }
    out[0] = xx * state.i00 + xy * state.i01;
    out[1] = xx * state.i01 + xy * state.i11;
    out[2] = yx * state.i00 + yy * state.i01;
    out[3] = yx * state.i01 + yy * state.i11;
    if (!isFinite(out[0] + out[1] + out[2] + out[3]) || !state.nodes.length) {
      out[0] = out[3] = 1; out[1] = out[2] = 0;
    }
  }

  function softPresentationTick(b, dt, lookX, lookY) {
    if (!softPresentationBody(b) || !(dt > 0) || !isFinite(dt)) return false;
    var m = b.surfaceSlime, r = m.radius;
    if (!(r > 0) || !isFinite(r + b.px[0] + b.py[0])) return false;
    var state = softPresentationInit(b), e = m.eye;
    if (!e) e = m.eye = { x: 0, y: 0.065, vx: 0, vy: 0,
      anchorX: b.px[0], anchorY: b.py[0], bodyVX: 0, bodyVY: 0,
      glance: 0.5 + (m.seed || 0) * 2, gazeX: 0, gazeY: 0 };
    var ih = JELLO_TIMESCALE / (jelloStepH || JELLO_H);
    var vx = (b.px[0] - b.ox[0]) * ih, vy = (b.py[0] - b.oy[0]) * ih;
    var teleported = Math.hypot(b.px[0] - state.x, b.py[0] - state.y) > r * 8;
    if (!isFinite(vx + vy)) vx = vy = 0;
    if (state.initialized && !teleported) {
      // Use solver velocity, so draw interpolation and camera motion cannot
      // invent acceleration. Reactions follow deformation at the central node.
      e.vx -= skySlimeClamp(vx - state.vx, -240, 240) / r * 0.2;
      e.vy -= skySlimeClamp(vy - state.vy, -240, 240) / r * 0.2;
    }
    if (teleported) { e.vx = e.vy = 0; }
    state.vx = vx; state.vy = vy; state.x = b.px[0]; state.y = b.py[0]; state.initialized = true;
    // Keep the accepted eye's observer coherent if the comparison is switched
    // live. These are visual history fields, never the solver's histories.
    e.anchorX = b.px[0] * 0.75 + b.cx * 0.25; e.anchorY = b.py[0] * 0.75 + b.cy * 0.25;
    e.bodyVX = vx * 0.75 + (b.vx || 0) * JELLO_TIMESCALE * 0.25;
    e.bodyVY = vy * 0.75 + (b.vy || 0) * JELLO_TIMESCALE * 0.25;
    e.glance -= dt;
    if (e.glance <= 0) {
      var glanceAngle = Math.random() * Math.PI * 2, glanceLength = 0.02 + Math.random() * 0.075;
      e.gazeX = Math.cos(glanceAngle) * glanceLength; e.gazeY = Math.sin(glanceAngle) * glanceLength;
      e.glance = 0.7 + Math.random() * 3.4;
    }
    var gx = e.gazeX, gy = e.gazeY + 0.045;
    if (lookX !== null && lookY !== null && isFinite(lookX) && isFinite(lookY)) {
      var d = Math.hypot(lookX, lookY) || 1;
      gx = lookX / d * 0.09; gy = lookY / d * 0.09 + 0.025;
    }
    dt = Math.min(dt, 0.05);
    var steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (var n = 0; n < steps; n++) {
      e.vx += (gx - e.x) * 19 * h; e.vy += ((gy - e.y) * 19 + 0.45) * h;
      var drag = Math.exp(-2.8 * h); e.vx *= drag; e.vy *= drag;
      e.x += e.vx * h; e.y += e.vy * h;
      var length = Math.hypot(e.x, e.y);
      if (length > 0.175) {
        var nx = e.x / length, ny = e.y / length;
        e.x = nx * 0.175; e.y = ny * 0.175;
        var outward = e.vx * nx + e.vy * ny;
        if (outward > 0) { e.vx -= nx * outward * 1.56; e.vy -= ny * outward * 1.56; }
      }
    }
    softPresentationEyeMatrix(b, state, softPresentationMatrix);
    var f = softPresentationMatrix;
    var area = Math.abs(f[0] * f[3] - f[1] * f[2]);
    var norm = (f[0] * f[0] + f[1] * f[1] + f[2] * f[2] + f[3] * f[3]) * 0.5;
    state.compression = skySlimeClamp(1 - area, 0, 1);
    state.extension = skySlimeClamp(Math.sqrt(Math.max(0, norm)) - 1, 0, 2);
    return true;
  }

  function softPresentationDrawEye(b) {
    if (!softPresentationBody(b) || !b.surfaceSlime.presentation) return false;
    var m = b.surfaceSlime;
    softPresentationEyeMatrix(b, m.presentation, softPresentationMatrix);
    var f = softPresentationMatrix;
    // The cup follows local stretch, while its loose pupil stays world-oriented.
    // sqrt(F F^T) removes rigid rotation without imposing an upright gel pose.
    var a = f[0] * f[0] + f[1] * f[1], d = f[2] * f[2] + f[3] * f[3];
    var c = f[0] * f[2] + f[1] * f[3];
    var determinant = Math.sqrt(Math.max(0.0001, a * d - c * c));
    var divisor = Math.sqrt(Math.max(0.0001, a + d + 2 * determinant));
    var sx = skySlimeClamp(1 + ((a + determinant) / divisor - 1) * 0.42, 0.72, 1.24);
    var sy = skySlimeClamp(1 + ((d + determinant) / divisor - 1) * 0.42, 0.72, 1.24);
    var shear = skySlimeClamp(c / divisor * 0.42, -0.18, 0.18);
    ctx.save(); ctx.translate(b.px[0], b.py[0]); ctx.transform(sx, shear, shear, sy, 0, 0);
    surfaceSlimeFace(m, m.radius); ctx.restore();
    return true;
  }

  function softPresentationDrawInterior(b) {
    if (!softPresentationBody(b) || !b.surfaceSlime.presentation) return false;
    var m = b.surfaceSlime, patches = m.presentation.patches, r = m.radius;
    for (var n = 0; n < patches.length; n++) {
      var p = patches[n], ax = b.px[p.a] - b.px[p.o], ay = b.py[p.a] - b.py[p.o];
      var cx = b.px[p.c] - b.px[p.o], cy = b.py[p.c] - b.py[p.o];
      var f00 = ax * p.i00 + cx * p.i10, f01 = ax * p.i01 + cx * p.i11;
      var f10 = ay * p.i00 + cy * p.i10, f11 = ay * p.i01 + cy * p.i11;
      var x = b.px[p.o] + ax * p.wa + cx * p.wc, y = b.py[p.o] + ay * p.wa + cy * p.wc;
      if (!isFinite(x + y + f00 + f01 + f10 + f11)) continue;
      ctx.save(); ctx.translate(x, y); ctx.transform(f00, f10, f01, f11, 0, 0);
      if (n === 0) {
        var sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
        sheen.addColorStop(0, 'rgba(245,241,234,0.6)'); sheen.addColorStop(1, 'rgba(245,241,234,0)');
        ctx.fillStyle = sheen; ctx.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
        ctx.fillStyle = 'rgba(245,241,234,0.45)'; ctx.beginPath();
        ctx.ellipse(0, -r * 0.05, r * 0.2, r * 0.065, -0.35, 0, Math.PI * 2); ctx.fill();
      } else {
        // A thin material patch transmits more light. A compressed patch reads
        // denser, directly from its Jacobian, without any timed impact flash.
        var area = Math.abs(f00 * f11 - f01 * f10);
        ctx.fillStyle = 'rgba(245,241,234,' + skySlimeClamp(0.18 * area, 0.09, 0.28) + ')';
        ctx.beginPath(); ctx.arc(0, 0, r * (0.037 + n * 0.013), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    return true;
  }

  function softPresentationContact(b, a, c, t, approachSpeed, deltaSpeed) {
    if (!softPresentationBody(b) || b.frozen ||
        !(approachSpeed > 95 && deltaSpeed > 35) || !isFinite(approachSpeed + deltaSpeed) ||
        !(a >= 0 && a < b.n && c >= 0 && c < b.n && a === Math.floor(a) && c === Math.floor(c)) || !isFinite(t) ||
        typeof slimeAudioState !== 'function') return;
    // A speed-equivalent measure of removed normal motion determines audibility, including when
    // the center is pinned but the contacted material is moving. Existing audio
    // arbitration supplies distance falloff, pools, pitch, and shared cooldowns.
    var resolved = Math.min(approachSpeed, deltaSpeed);
    var energySpeed = Math.sqrt(Math.max(0, resolved * (2 * approachSpeed - resolved)));
    var strength = skySlimeClamp((energySpeed - 65) / 360, 0, 1);
    var sound = slimeAudioState(b);
    if (strength > sound.hit) {
      t = skySlimeClamp(t, 0, 1);
      sound.hit = strength;
      sound.x = b.px[a] * (1 - t) + b.px[c] * t;
      sound.y = b.py[a] * (1 - t) + b.py[c] * t;
    }
  }
