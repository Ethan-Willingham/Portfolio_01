  /* ---- Shared rig contact silhouette ---- */
  // A head-height rounded crown joins a wide flat track base. Small attachments (pipe,
  // lamp and moving drill) do not enlarge the body contact surface.
  // The narrow crown leaves room for continuously rising sides inside the
  // painted cab. Every side normal lifts material; there is no vertical skirt.
  var RIG_HULL_LOCAL = [];
  for (var rigCurveI = 0; rigCurveI <= 9; rigCurveI++) {
    var rigCurveAngle = (162 - rigCurveI * 144 / 9) * Math.PI / 180;
    RIG_HULL_LOCAL.push(11.5 + Math.cos(rigCurveAngle) * 2.4,
      9 - Math.sin(rigCurveAngle) * 2.4);
  }
  RIG_HULL_LOCAL.push(18.5, 24.0, 3.5, 24.0);
  var rigHullCache = { n: RIG_HULL_LOCAL.length / 2, x: new Float64Array(12), y: new Float64Array(12),
    nx: new Float64Array(12), ny: new Float64Array(12) };
  var rigHullResult = { distance: 0, x: 0, y: 0, nx: 0, ny: 0 };

  function rigContactHull(x, y) {
    if (x === undefined) x = player.x;
    if (y === undefined) y = player.y;
    var scale = playerBodyScale(), sx = scale.x, sy = scale.y;
    var tilt = player.bodyTiltRender || 0, dip = playerFxLandOffset(), dir = player.dir < 0 ? -1 : 1;
    var h = rigHullCache;
    if (h.ox === x && h.oy === y && h.sx === sx && h.sy === sy && h.tilt === tilt && h.dip === dip && h.dir === dir) return h;
    h.ox = x; h.oy = y; h.sx = sx; h.sy = sy; h.tilt = tilt; h.dip = dip; h.dir = dir;
    var co = Math.cos(tilt), si = Math.sin(tilt), cx = PLAYER_W * 0.5, cy = PLAYER_H * 0.56;
    h.l = h.t = Infinity; h.r = h.b = -Infinity;
    for (var i = 0; i < h.n; i++) {
      var lx = RIG_HULL_LOCAL[i * 2], ly = RIG_HULL_LOCAL[i * 2 + 1];
      // Suspension moves the cab alone; the lower track points stay planted.
      if (ly < 18) ly += dip;
      lx = cx + (lx - cx) * dir * sx;
      ly = PLAYER_H + (ly - PLAYER_H) * sy;
      var dx = lx - cx, dy = ly - cy;
      h.x[i] = x + cx + dx * co - dy * si;
      h.y[i] = y + cy + dx * si + dy * co;
      h.l = Math.min(h.l, h.x[i]); h.r = Math.max(h.r, h.x[i]);
      h.t = Math.min(h.t, h.y[i]); h.b = Math.max(h.b, h.y[i]);
    }
    for (i = 0; i < h.n; i++) {
      var j = (i + 1) % h.n, ex = h.x[j] - h.x[i], ey = h.y[j] - h.y[i], len = Math.hypot(ex, ey);
      h.nx[i] = ey / len * dir; h.ny[i] = -ex / len * dir;
    }
    return h;
  }

  // Signed nearest distance handles rounded particle contacts at the crown
  // and corners. The reusable result must be consumed before another query.
  function rigHullQuery(h, x, y) {
    var best = Infinity, inside = true, q = rigHullResult;
    for (var i = 0; i < h.n; i++) {
      var j = (i + 1) % h.n, ex = h.x[j] - h.x[i], ey = h.y[j] - h.y[i];
      var dx = x - h.x[i], dy = y - h.y[i];
      if (dx * h.nx[i] + dy * h.ny[i] > 0) inside = false;
      var u = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (ex * ex + ey * ey)));
      var px = h.x[i] + ex * u, py = h.y[i] + ey * u;
      var d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < best) { best = d2; q.x = px; q.y = py; q.nx = h.nx[i]; q.ny = h.ny[i]; }
    }
    var dist = Math.sqrt(best);
    q.distance = inside ? -dist : dist;
    if (!inside && dist > 0.000001) { q.nx = (x - q.x) / dist; q.ny = (y - q.y) / dist; }
    return q;
  }

  function rigHullContains(h, x, y, radius) {
    radius = radius || 0;
    if (x < h.l - radius || x > h.r + radius || y < h.t - radius || y > h.b + radius) return false;
    return rigHullQuery(h, x, y).distance <= radius;
  }
