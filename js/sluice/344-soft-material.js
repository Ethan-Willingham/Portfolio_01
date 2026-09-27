  /* ---- Local elastic material comparison (?softmaterial=1) ----
     The existing spring web stores strain energy. No fitted silhouette or
     pose-velocity target is part of this material law. Muscles still change
     their own rest lengths and work against the existing terrain grips. */
  var SOFT_MATERIAL = softProjectEnabled || new URLSearchParams(location.search).get('softmaterial') === '1';
  var SOFT_MATERIAL_COMPLIANCE = 0.002;
  var SOFT_MATERIAL_VOLUME = 0.002;
  var SOFT_MATERIAL_HARDEN = 4;
  var SOFT_MATERIAL_DAMP = 8;

  function softMaterialBody(b) { return SOFT_MATERIAL && !!b.surfaceSlime; }

  function softMaterialSolve(b, h) {
    jelloResetLambdas(b);
    var alpha = SOFT_MATERIAL_COMPLIANCE / (h * h);
    for (var s = 0; s < b.springN; s++) {
      var a = b.sA[s], c = b.sB[s], rest = b.sRest[s];
      var dx = b.px[c] - b.px[a], dy = b.py[c] - b.py[a];
      var length = Math.sqrt(dx * dx + dy * dy);
      if (!(length > 1e-9 && rest > 1e-9)) continue;
      var strain = (length - rest) / rest;
      var hard = SOFT_MATERIAL_HARDEN * strain * strain;
      var root = Math.sqrt(1 + hard);
      var C = (length - rest) * root;
      var gradient = (1 + 2 * hard) / root;
      // C encodes quadratic plus quartic strain energy. Its derivative must
      // appear in both the effective mass and the applied correction.
      var dl = (-C - alpha * b.sLambda[s]) / (2 * gradient * gradient + alpha);
      b.sLambda[s] += dl;
      var move = dl * gradient / length, mx = dx * move, my = dy * move;
      b.px[a] -= mx; b.py[a] -= my;
      b.px[c] += mx; b.py[c] += my;
    }
    softMaterialVolume(b, h);
  }

  function softMaterialVolume(b, h) {
    var n = b.ringN;
    if (!(n >= 3 && b.restArea > 0)) return;
    if (!b._materialGX || b._materialGX.length !== n) {
      b._materialGX = new Float64Array(n); b._materialGY = new Float64Array(n);
    }
    var gx = b._materialGX, gy = b._materialGY;
    var x0 = b.px[b.ring[0]], y0 = b.py[b.ring[0]], area = 0, den = 0;
    var sign = b.ringSign;
    for (var k = 0; k < n; k++) {
      var a = b.ring[k], prev = b.ring[(k + n - 1) % n], next = b.ring[(k + 1) % n];
      area += (b.px[a] - x0) * (b.py[next] - y0) - (b.py[a] - y0) * (b.px[next] - x0);
      gx[k] = 0.5 * (b.py[next] - b.py[prev]) * sign;
      gy[k] = 0.5 * (b.px[prev] - b.px[next]) * sign;
      den += gx[k] * gx[k] + gy[k] * gy[k];
    }
    if (!(den > 1e-9)) return;
    var alpha = SOFT_MATERIAL_VOLUME / (h * h);
    var C = sign * area * 0.5 - b.restArea * JELLO_INFLATE;
    var dl = (-C - alpha * b.volLambda) / (den + alpha);
    b.volLambda += dl;
    // Freeze every gradient before moving any node. Reading changed neighbors
    // during this pass would turn internal pressure into a net force and torque.
    for (k = 0; k < n; k++) {
      var p = b.ring[k];
      b.px[p] += dl * gx[k]; b.py[p] += dl * gy[k];
    }
  }

  function softMaterialDamp(b, h) {
    var fraction = 1 - Math.exp(-SOFT_MATERIAL_DAMP * h / JELLO_TIMESCALE);
    for (var s = 0; s < b.springN; s++) {
      var a = b.sA[s], c = b.sB[s];
      var dx = b.px[c] - b.px[a], dy = b.py[c] - b.py[a];
      var length = Math.sqrt(dx * dx + dy * dy);
      if (!(length > 1e-9)) continue;
      var nx = dx / length, ny = dy / length;
      var vx = (b.px[c] - b.ox[c]) - (b.px[a] - b.ox[a]);
      var vy = (b.py[c] - b.oy[c]) - (b.py[a] - b.oy[a]);
      var impulse = 0.5 * fraction * (vx * nx + vy * ny);
      // Equal/opposite central impulses dissipate edge strain rate while
      // preserving linear and angular momentum, including rigid spin.
      b.ox[a] -= nx * impulse; b.oy[a] -= ny * impulse;
      b.ox[c] += nx * impulse; b.oy[c] += ny * impulse;
    }
  }

  function softMaterialAreaContact(b, a, c, d, inverse) {
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    // Use the corrected triangle, not the normal before its positional repair.
    // An active area barrier stops compression velocity without a rebound kick.
    var ax = (py[c] - py[d]) * inverse, ay = (px[d] - px[c]) * inverse;
    var cx = (py[d] - py[a]) * inverse, cy = (px[a] - px[d]) * inverse;
    var dx = (py[a] - py[c]) * inverse, dy = (px[c] - px[a]) * inverse;
    if (jelloWorldSolidAt(px[a] + Math.sign(ax) * 0.7, py[a])) ax = 0;
    if (jelloWorldSolidAt(px[a], py[a] + Math.sign(ay) * 0.7)) ay = 0;
    if (jelloWorldSolidAt(px[c] + Math.sign(cx) * 0.7, py[c])) cx = 0;
    if (jelloWorldSolidAt(px[c], py[c] + Math.sign(cy) * 0.7)) cy = 0;
    if (jelloWorldSolidAt(px[d] + Math.sign(dx) * 0.7, py[d])) dx = 0;
    if (jelloWorldSolidAt(px[d], py[d] + Math.sign(dy) * 0.7)) dy = 0;
    var den = ax * ax + ay * ay + cx * cx + cy * cy + dx * dx + dy * dy;
    var inward = ax * (px[a] - ox[a]) + ay * (py[a] - oy[a]) +
      cx * (px[c] - ox[c]) + cy * (py[c] - oy[c]) +
      dx * (px[d] - ox[d]) + dy * (py[d] - oy[d]);
    if (!(den > 1e-12 && inward < 0)) return;
    var impulse = -inward / den;
    ox[a] -= ax * impulse; oy[a] -= ay * impulse;
    ox[c] -= cx * impulse; oy[c] -= cy * impulse;
    ox[d] -= dx * impulse; oy[d] -= dy * impulse;
  }
