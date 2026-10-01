  /* ---- Local forces on the resident skin ----
     Exhaust applies momentum to exposed material, never a target outline.
     Water drag follows the measured local flow. The existing hydrostatic
     lift and moving fluid boundaries remain the displacement channel. */
  var SOFT_WORLD_JET_ACCEL = 3600;
  var SOFT_WORLD_WATER_NORMAL = 8;
  var SOFT_WORLD_WATER_TANGENT = 2;
  var softWorldBodies = [], softWorldBodyN = 0;
  var softWorldReactionX = 0, softWorldReactionY = 0, softWorldJetBudget = 0;
  var softWorldWaterBins = new Map(), softWorldWaterCache = null;
  var softWorldBuoyancy = new WeakMap();
  var softWorldReadbackGPU = null, softWorldReadbackUser = 0, softWorldReadbackFrames = 0;
  var softWorldWaterN = new Float64Array(4096);
  var softWorldWaterVX = new Float64Array(4096), softWorldWaterVY = new Float64Array(4096);
  var softWorldSampleX = 0, softWorldSampleY = 0, softWorldSampleWet = 0;

  function softWorldBody(b) { return typeof SOFT_WORLD !== 'undefined' && SOFT_WORLD && !!b.surfaceSlime; }

  function softWorldWaterScale() {
    return typeof LIQUID_TIMESCALE === 'number' && LIQUID_TIMESCALE > 0 && isFinite(LIQUID_TIMESCALE) ? LIQUID_TIMESCALE : 1;
  }

  function softWorldReadbackPrepare() {
    var gpu = typeof liquidWGPU !== 'undefined' && liquidWGPU && liquidWGPU.simActive ? liquidWGPU : null;
    var user = typeof LIQUID_DBG_READBACK === 'number' ? LIQUID_DBG_READBACK : 20;
    user = Math.max(2, Math.min(120, user | 0));
    var wet = false;
    if (typeof SOFT_WORLD !== 'undefined' && SOFT_WORLD && ENABLE_JELLO &&
        !bathMode && !gamePaused && !gameOver && !gameWon && gpu && gpu.setSimParam) {
      for (var i = 0; i < jelloBodies.length; i++) {
        var b = jelloBodies[i];
        if (b.surfaceSlime && (b.surfaceSlime.wet || b.bathBuoy) && jelloBodyOnCamera(b)) { wet = true; break; }
      }
    }
    // Restore the live user's setting, not the value when immersion began.
    // Switching GPU instances also releases the old request. Ordinary dry
    // frames never call setSimParam unless releasing a preceding wet request.
    if (softWorldReadbackGPU && (!wet || softWorldReadbackGPU !== gpu)) {
      softWorldReadbackGPU.setSimParam('DBG_READBACK_EVERY', user);
      softWorldReadbackGPU = null;
    }
    // Wet residents sample local flow about 30 times per second: every
    // second frame at 60 Hz, every fourth at 120 Hz. A per-frame count
    // doubled the mirror copies on high-refresh displays.
    var frames = Math.max(2, Math.min(user, Math.round(1 / (30 * simNominal))));
    if (wet && (softWorldReadbackGPU !== gpu || softWorldReadbackUser !== user || softWorldReadbackFrames !== frames)) {
      gpu.setSimParam('DBG_READBACK_EVERY', frames);
      softWorldReadbackGPU = gpu; softWorldReadbackUser = user; softWorldReadbackFrames = frames;
    }
  }

  function softWorldFrame(active, nActive, dt) {
    softWorldBodies = active; softWorldBodyN = nActive;
    softWorldReactionX = 0; softWorldReactionY = 0;
    softWorldJetBudget = JELLO_JET_REACT_CAP * GRAVITY * Math.max(0, dt);
    if (!(typeof SOFT_WORLD !== 'undefined' && SOFT_WORLD)) return;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var bi = 0; bi < nActive; bi++) {
      var b = active[bi];
      if (!softWorldBody(b)) continue;
      // Hydrostatic lift can change without any current. Compare the actual
      // force fraction on the current nodes, including when all water vanished.
      // This is independent of the asynchronous drag cache: an unchanged stale
      // bathBuoy sample may wake once, but cannot keep waking the same sleeper.
      var buoyancy = 0, bb = b.bathBuoy;
      if (bb && bb.lift > 0) for (var i = 0; i < b.n; i++) {
        if (b.py[i] > bb.line && b.px[i] >= bb.x0 && b.px[i] <= bb.x1) {
          buoyancy += Math.min(1, (b.py[i] - bb.line) * 0.045) * bb.lift / b.n;
        }
      }
      var previous = softWorldBuoyancy.get(b) || 0;
      softWorldBuoyancy.set(b, buoyancy);
      if (b.sleeping && Math.abs(buoyancy - previous) > 0.005) {
        b.sleeping = false; b.sleepFrames = 0; b._solve = true;
      }
      x0 = Math.min(x0, Math.floor((b.bboxL - 20) / 8));
      x1 = Math.max(x1, Math.floor((b.bboxR + 20) / 8));
      y0 = Math.min(y0, Math.floor((b.bboxT - 20) / 8));
      y1 = Math.max(y1, Math.floor((b.bboxB + 20) / 8));
    }
    var gpu = typeof liquidWGPU !== 'undefined' && liquidWGPU && liquidWGPU.simActive ? liquidWGPU : null;
    // An old asynchronous mirror is not a continuing source of momentum.
    // GPU ages use the liquid clock. Expire drag after 0.1 REAL seconds.
    var age = gpu && typeof gpu.getReadbackAge === 'function' ? gpu.getReadbackAge() / softWorldWaterScale() : Infinity;
    if (x0 > x1 || !liquidCount || (gpu && (!(age >= 0 && age <= 0.1) ||
        !(typeof gpu.readbackApplyGen === 'number' && isFinite(gpu.readbackApplyGen))))) {
      softWorldWaterBins.clear(); softWorldWaterCache = null; return;
    }
    var cache = softWorldWaterCache;
    var reuse = gpu && cache && cache.gpu === gpu && cache.gen === gpu.readbackApplyGen &&
      cache.seq === liquidMutationSeq && cache.count === liquidCount &&
      cache.x === liquidX && cache.y === liquidY && cache.vx === liquidVX && cache.vy === liquidVY &&
      cache.types === liquidType && cache.frozen === liquidFrozen &&
      cache.x0 === x0 && cache.x1 === x1 && cache.y0 === y0 && cache.y1 === y1;
    if (!reuse) {
      softWorldWaterBins.clear();
      var slots = 0, left = x0 * 8, right = (x1 + 1) * 8, top = y0 * 8, bottom = (y1 + 1) * 8;
      for (var p = 0; p < liquidCount; p++) {
        var wx = liquidX[p], wy = liquidY[p];
        if (!(wx >= left && wx < right && wy >= top && wy < bottom)) continue;
        if (liquidType[p] !== 0 || liquidFrozen[p]) continue;
        var vx = liquidVX[p], vy = liquidVY[p];
        if (!isFinite(vx + vy)) continue;
        var cx = Math.floor(wx / 8), cy = Math.floor(wy / 8);
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        var key = cy * 65536 + cx, slot = softWorldWaterBins.get(key);
        if (slot === undefined) {
          if (slots >= softWorldWaterN.length) continue;
          slot = slots++; softWorldWaterBins.set(key, slot);
          softWorldWaterN[slot] = 0; softWorldWaterVX[slot] = 0; softWorldWaterVY[slot] = 0;
        }
        softWorldWaterN[slot]++;
        softWorldWaterVX[slot] += vx; softWorldWaterVY[slot] += vy;
      }
      softWorldWaterCache = gpu ? { gpu: gpu, gen: gpu.readbackApplyGen, seq: liquidMutationSeq,
        count: liquidCount, x: liquidX, y: liquidY, vx: liquidVX, vy: liquidVY,
        types: liquidType, frozen: liquidFrozen,
        x0: x0, x1: x1, y0: y0, y1: y1 } : null;
    }
    // The water may arrive at a sleeping resident while the player is far away.
    for (bi = 0; bi < nActive; bi++) {
      b = active[bi];
      if (!softWorldBody(b) || !b.sleeping) continue;
      for (var k = 0; k < b.ringN; k++) {
        var i = b.ring[k]; softWorldWaterSample(b.px[i], b.py[i]);
        if (softWorldSampleWet > 0.05 && softWorldSampleX * softWorldSampleX + softWorldSampleY * softWorldSampleY > 16) {
          b.sleeping = false; b.sleepFrames = 0; b._solve = true; break;
        }
      }
    }
  }

  function softWorldWaterSample(x, y) {
    softWorldSampleX = 0; softWorldSampleY = 0; softWorldSampleWet = 0;
    if (!softWorldWaterBins.size || jelloWorldSolidAt(x, y)) return;
    var gx = x / 8 - 0.5, gy = y / 8 - 0.5;
    var ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    var mass = 0, full = 64 / Math.pow(LIQUID_CELL * LIQUID_PDELTA, 2);
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 2; c++) {
        var slot = softWorldWaterBins.get((iy + r) * 65536 + ix + c);
        if (slot === undefined) continue;
        var w = (c ? fx : 1 - fx) * (r ? fy : 1 - fy);
        var n = softWorldWaterN[slot];
        mass += n * w;
        softWorldSampleX += softWorldWaterVX[slot] * w;
        softWorldSampleY += softWorldWaterVY[slot] * w;
      }
    }
    if (mass > 1e-8) {
      // Liquid velocities are per liquid-clock second; skin histories below
      // are converted to real seconds. Keep the coupling in real px/s.
      var scale = softWorldWaterScale() / mass;
      softWorldSampleX *= scale; softWorldSampleY *= scale;
      softWorldSampleWet = Math.min(1, mass / (full * 0.45));
    }
  }

  function softWorldStep(b, h) {
    if (!softWorldBody(b) || !(h > 0 && b.ringN >= 3)) return;
    if (!softWorldWaterBins.size && !jelloJetOn) return;
    var realDt = h / JELLO_TIMESCALE, inverse = 1 / realDt;
    var ring = b.ring, sign = b.ringSign || 1;
    if (softWorldWaterBins.size) for (var k = 0; k < b.ringN; k++) {
      var i = ring[k], prev = ring[(k + b.ringN - 1) % b.ringN], next = ring[(k + 1) % b.ringN];
      var tx = b.px[next] - b.px[prev], ty = b.py[next] - b.py[prev], length = Math.hypot(tx, ty);
      if (!(length > 1e-9)) continue;
      var nx = ty / length * sign, ny = -tx / length * sign;
      softWorldWaterSample(b.px[i] + nx * 3, b.py[i] + ny * 3);
      if (softWorldSampleWet > 0) {
        var rx = (b.px[i] - b.ox[i]) * inverse - softWorldSampleX;
        var ry = (b.py[i] - b.oy[i]) * inverse - softWorldSampleY;
        var normal = rx * nx + ry * ny;
        var normalDamp = 1 - Math.exp(-SOFT_WORLD_WATER_NORMAL * softWorldSampleWet * realDt);
        var tangentDamp = 1 - Math.exp(-SOFT_WORLD_WATER_TANGENT * softWorldSampleWet * realDt);
        // Both eigenvalues lie in [0,1]: drag can only reduce velocity
        // relative to the sampled water. It cannot overshoot the flow.
        b.ox[i] += (rx * tangentDamp + nx * normal * (normalDamp - tangentDamp)) * realDt;
        b.oy[i] += (ry * tangentDamp + ny * normal * (normalDamp - tangentDamp)) * realDt;
      }
    }
    if (!jelloJetOn || !player || gameOver || gameWon) return;
    var best = 0, bestX = 0, bestY = 0;
    var spacing = b.spacing || TILE / JELLO_NPT;
    // Rig contact and handling use the same equal point mass. The two
    // endpoint kicks sum to dv, so the rig receives dv * pointMass / rigMass.
    var massRatio = SOFT_CONTACT_POINT_MASS / SOFT_CONTACT_RIG_MASS;
    for (k = 0; k < b.ringN; k++) {
      i = ring[k]; next = ring[(k + 1) % b.ringN];
      tx = b.px[next] - b.px[i]; ty = b.py[next] - b.py[i]; length = Math.hypot(tx, ty);
      if (!(length > 1e-9)) continue;
      nx = ty / length * sign; ny = -tx / length * sign;
      var facing = -(nx * jelloJetDX + ny * jelloJetDY);
      if (!(facing > 0)) continue;
      var x = (b.px[i] + b.px[next]) * 0.5, y = (b.py[i] + b.py[next]) * 0.5;
      var qx = x - jelloJetOX, qy = y - jelloJetOY;
      var axial = qx * jelloJetDX + qy * jelloJetDY;
      if (!(axial > 0 && axial < JELLO_JET_LEN)) continue;
      var radial = Math.abs(qx * -jelloJetDY + qy * jelloJetDX);
      var radius = Math.min(JELLO_JET_RANGE, JELLO_JET_R0 + axial * JELLO_JET_TAN);
      if (!(radial < radius) || !softWorldJetVisible(b, k, x, y)) continue;
      var weight = (1 - radial / radius) * (1 - axial / JELLO_JET_LEN) * facing;
      var speed = (((b.px[i] - b.ox[i]) + (b.px[next] - b.ox[next])) * jelloJetDX +
        ((b.py[i] - b.oy[i]) + (b.py[next] - b.oy[next])) * jelloJetDY) * 0.5 * inverse;
      // Pressure vanishes when the contacted surface travels with the jet.
      var dv = SOFT_WORLD_JET_ACCEL * weight * length / spacing * realDt * Math.max(0, Math.min(1, 1 - speed / 600));
      var reaction = dv * massRatio;
      if (reaction > softWorldJetBudget) { dv *= softWorldJetBudget / reaction; reaction = softWorldJetBudget; }
      if (!(dv > 1e-9)) continue;
      softWorldJetBudget -= reaction;
      var impulse = dv * realDt * 0.5;
      b.ox[i] -= jelloJetDX * impulse; b.oy[i] -= jelloJetDY * impulse;
      b.ox[next] -= jelloJetDX * impulse; b.oy[next] -= jelloJetDY * impulse;
      softWorldReactionX -= jelloJetDX * reaction; softWorldReactionY -= jelloJetDY * reaction;
      if (weight > best) { best = weight; bestX = x; bestY = y; }
    }
    if (best > 0) {
      b.sleeping = false; b.sleepFrames = 0; b._plyMs = performance.now();
      b._ripJetOn = 1; b._ripJetX = bestX; b._ripJetY = bestY;
      if (b.surfaceSlime.climb && typeof surfaceSlimeDetach === 'function') surfaceSlimeDetach(b);
      if (typeof slimeAudioJet === 'function') slimeAudioJet(b, bestX, bestY, best);
    }
  }

  function softWorldJetVisible(target, edge, x, y) {
    var dx = x - jelloJetOX, dy = y - jelloJetOY, distance = Math.hypot(dx, dy);
    var steps = Math.ceil(distance / 4);
    for (var p = 1; p < steps; p++) {
      var t = p / steps;
      if (jelloWorldSolidAt(jelloJetOX + dx * t, jelloJetOY + dy * t)) return false;
    }
    for (var bi = 0; bi < softWorldBodyN; bi++) {
      var b = softWorldBodies[bi];
      if (b.bboxR < Math.min(x, jelloJetOX) || b.bboxL > Math.max(x, jelloJetOX) ||
          b.bboxB < Math.min(y, jelloJetOY) || b.bboxT > Math.max(y, jelloJetOY)) continue;
      for (var k = 0; k < b.ringN; k++) {
        if (b === target && k === edge) continue;
        var a = b.ring[k], c = b.ring[(k + 1) % b.ringN];
        var ex = b.px[c] - b.px[a], ey = b.py[c] - b.py[a];
        var den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var ax = b.px[a] - jelloJetOX, ay = b.py[a] - jelloJetOY;
        var u = (ax * dy - ay * dx) / den, hit = (ax * ey - ay * ex) / den;
        if (hit > 0.001 && hit < 0.999 && u >= 0 && u <= 1) return false;
      }
    }
    return true;
  }

  function softWorldFinish() {
    if (!(typeof SOFT_WORLD !== 'undefined' && SOFT_WORLD) || !player || gameOver || gameWon) return;
    player.vx += softWorldReactionX; player.vy += softWorldReactionY;
    softWorldReactionX = 0; softWorldReactionY = 0;
  }

  function softWorldWaterCPU(b) {
    if (!softWorldBody(b)) return;
    var inverse = JELLO_TIMESCALE / ((jelloStepH || JELLO_H) * softWorldWaterScale());
    for (var i = 0; i < liquidCount; i++) {
      var x = liquidX[i], y = liquidY[i];
      if (liquidFrozen[i] || x < b.bboxL || x > b.bboxR || y < b.bboxT || y > b.bboxB || !jelloPointInRing(b, x, y)) continue;
      var near = jelloNearestOnRing(b, x, y), dx = near.x - x, dy = near.y - y;
      var distance = Math.hypot(dx, dy);
      if (!(distance > 1e-9)) continue;
      var nx = dx / distance, ny = dy / distance;
      var px = near.x + nx * 1.2, py = near.y + ny * 1.2;
      if (liquidWorldSolidAt(px, py)) continue;
      // Find the material edge at this nearest boundary point. The old CPU
      // fallback used whole-body velocity and erased tangential currents.
      var best = Infinity, edgeVX = 0, edgeVY = 0;
      for (var k = 0; k < b.ringN; k++) {
        var a = b.ring[k], c = b.ring[(k + 1) % b.ringN];
        var ex = b.px[c] - b.px[a], ey = b.py[c] - b.py[a], e2 = ex * ex + ey * ey;
        var t = e2 > 0 ? Math.max(0, Math.min(1, ((near.x - b.px[a]) * ex + (near.y - b.py[a]) * ey) / e2)) : 0;
        var qx = b.px[a] + t * ex - near.x, qy = b.py[a] + t * ey - near.y;
        var d2 = qx * qx + qy * qy;
        if (d2 >= best) continue;
        best = d2;
        edgeVX = ((b.px[a] - b.ox[a]) * (1 - t) + (b.px[c] - b.ox[c]) * t) * inverse;
        edgeVY = ((b.py[a] - b.oy[a]) * (1 - t) + (b.py[c] - b.oy[c]) * t) * inverse;
      }
      var inward = Math.min(0, (liquidVX[i] - edgeVX) * nx + (liquidVY[i] - edgeVY) * ny);
      liquidX[i] = px; liquidY[i] = py;
      liquidVX[i] -= nx * inward; liquidVY[i] -= ny * inward;
      liquidSleeping[i] = 0; liquidRestFrames[i] = 0;
    }
  }
