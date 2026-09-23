  /* ---- Coal rigid bodies: the visible convex hull IS the contact geometry. ---- */
  var hearthHullCache = new WeakMap();
  var HEARTH_FLOOR = 210, HEARTH_TOP = -110, HEARTH_HEIGHT = 320, HEARTH_FRICTION = 0.72;

  function hearthHull(body) {
    var cached = hearthHullCache.get(body);
    if (cached) return cached;
    var seed = (Number(body.seed) || 0) * 9001 + (Number(body.id) || 0) * 71;
    var points = [], i, cross = function (a, b, c) {
      return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    };
    if (body.shape) { cached = hearthPolygon(body.shape); hearthHullCache.set(body,cached); return cached; }
    var count = 8 + Math.floor(hearthSeed(seed + 13) * 3);
    var aspect = 0.66 + hearthSeed(seed + 93) * 0.28;
    for (i = 0; i < count; i++) {
      var angle = (i + (hearthSeed(seed + i * 19) - 0.5) * 0.3) * Math.PI * 2 / count;
      var r = 0.78 + hearthSeed(seed + i * 37) * 0.22;
      points.push([Math.cos(angle) * r, Math.sin(angle) * r * aspect]);
    }
    points.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var lower = [], upper = [];
    for (i = 0; i < points.length; i++) {
      while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) lower.pop();
      lower.push(points[i]);
    }
    for (i = points.length - 1; i >= 0; i--) {
      while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) upper.pop();
      upper.push(points[i]);
    }
    lower.pop(); upper.pop();
    var vertices = lower.concat(upper), area = 0, cx = 0, cy = 0, extent = 0;
    for (i = 0; i < vertices.length; i++) {
      var a = vertices[i], b = vertices[(i + 1) % vertices.length], cr = a[0] * b[1] - a[1] * b[0];
      area += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
    }
    cx /= 3 * area; cy /= 3 * area;
    for (i = 0; i < vertices.length; i++) {
      vertices[i][0] -= cx; vertices[i][1] -= cy;
      extent = Math.max(extent, Math.hypot(vertices[i][0], vertices[i][1]));
    }
    for (i = 0; i < vertices.length; i++) { vertices[i][0] /= extent; vertices[i][1] /= extent; }
    var inertia = 0; area = 0;
    for (i = 0; i < vertices.length; i++) {
      a = vertices[i]; b = vertices[(i + 1) % vertices.length]; cr = a[0] * b[1] - a[1] * b[0];
      area += cr;
      inertia += cr * (a[0] * a[0] + a[0] * b[0] + b[0] * b[0] + a[1] * a[1] + a[1] * b[1] + b[1] * b[1]);
    }
    cached = { vertices: vertices, area: area / 2, inertia: inertia / (6 * area) };
    hearthHullCache.set(body, cached);
    return cached;
  }
  function hearthMass(b) {
    var hull = hearthHull(b);
    if (!b.massRef) b.massRef = hull.area * b.baseR * b.baseR / 1500;
    var mass = b.massRef * (0.16 + b.fuel * 0.84);
    b.invMass = 1 / mass;
    b.invInertia = 1 / (mass * hull.inertia * b.r * b.r);
  }
  function hearthWorldHull(b) {
    var local = hearthHull(b).vertices, points = b.vertices || (b.vertices = []);
    points.length = local.length;
    var co = Math.cos(b.angle) * b.r, si = Math.sin(b.angle) * b.r;
    for (var i = 0; i < local.length; i++) {
      var v = points[i] || (points[i] = [0, 0]);
      v[0] = b.x + local[i][0] * co - local[i][1] * si;
      v[1] = b.y + local[i][0] * si + local[i][1] * co;
    }
    return points;
  }
  function hearthInside(b, x, y, margin) {
    var vs = hearthWorldHull(b);
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i], v = vs[(i + 1) % vs.length], dx = v[0] - a[0], dy = v[1] - a[1];
      if ((x - a[0]) * dy - (y - a[1]) * dx > (margin || 0) * Math.hypot(dx, dy)) return false;
    }
    return true;
  }
  function hearthFaceSeparation(a, b) {
    var best = { gap: -Infinity, edge: 0, nx: 0, ny: 0 };
    for (var i = 0; i < a.length; i++) {
      var p = a[i], q = a[(i + 1) % a.length], dx = q[0] - p[0], dy = q[1] - p[1];
      var len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len, distance = Infinity;
      for (var j = 0; j < b.length; j++) distance = Math.min(distance, (b[j][0] - p[0]) * nx + (b[j][1] - p[1]) * ny);
      if (distance > best.gap) best = { gap: distance, edge: i, nx: nx, ny: ny };
    }
    return best;
  }
  function hearthClip(points, nx, ny, offset) {
    if (points.length < 2) return points;
    var a = points[0], b = points[1], da = a[0] * nx + a[1] * ny - offset, db = b[0] * nx + b[1] * ny - offset;
    var out = [];
    if (da <= 0) out.push(a);
    if (db <= 0) out.push(b);
    if (da * db < 0) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    return out;
  }
  function hearthManifold(a, b, margin) {
    if (a.held || b.held || Math.abs(a.x - b.x) > a.r + b.r + margin || Math.abs(a.y - b.y) > a.r + b.r + margin) return null;
    var av = a.vertices, bv = b.vertices;
    var sa = hearthFaceSeparation(av, bv);
    if (sa.gap > margin) return null;
    var sb = hearthFaceSeparation(bv, av);
    if (sb.gap > margin) return null;
    var flip = sb.gap > sa.gap + 0.02, face = flip ? sb : sa, ref = flip ? bv : av, inc = flip ? av : bv;
    var p = ref[face.edge], q = ref[(face.edge + 1) % ref.length], nx = face.nx, ny = face.ny;
    var edge = 0, dot = Infinity;
    for (var i = 0; i < inc.length; i++) {
      var u = inc[i], v = inc[(i + 1) % inc.length], dx = v[0] - u[0], dy = v[1] - u[1];
      var d = (dy * nx - dx * ny) / Math.hypot(dx, dy);
      if (d < dot) { dot = d; edge = i; }
    }
    var tx = -ny, ty = nx;
    var clipped = hearthClip([inc[edge], inc[(edge + 1) % inc.length]], -tx, -ty, -p[0] * tx - p[1] * ty);
    clipped = hearthClip(clipped, tx, ty, q[0] * tx + q[1] * ty);
    var contacts = [];
    for (i = 0; i < clipped.length; i++) {
      var cp = clipped[i], gap = (cp[0] - p[0]) * nx + (cp[1] - p[1]) * ny;
      if (gap <= margin) contacts.push({ x: cp[0] - nx * gap * 0.5, y: cp[1] - ny * gap * 0.5, depth: -gap });
    }
    return { a: a, b: b, nx: flip ? -nx : nx, ny: flip ? -ny : ny, points: contacts };
  }
  function hearthContacts(bed, margin) {
    var chunks = bed.chunks, out = [], i, j;
    for (i = 0; i < chunks.length; i++) if (!chunks[i].held) hearthWorldHull(chunks[i]);
    for (i = 0; i < chunks.length; i++) {
      var b = chunks[i];
      if (b.held) continue;
      for (var wall = 0; wall < 3; wall++) {
        var nx = wall === 0 ? -1 : wall === 1 ? 1 : 0, ny = wall === 2 ? 1 : 0;
        var limit = wall === 1 ? 320 : wall === 2 ? HEARTH_FLOOR : 0, points = [];
        for (j = 0; j < b.vertices.length; j++) {
          var p = b.vertices[j], depth = p[0] * nx + p[1] * ny - limit;
          if (depth >= -margin) points.push({ x: p[0], y: p[1], depth: depth });
        }
        points.sort(function (a, b) { return b.depth - a.depth; });
        if (points.length) out.push({ a: b, b: null, nx: nx, ny: ny, wall: wall, points: points.slice(0, 2) });
      }
      for (j = i + 1; j < chunks.length; j++) {
        var contact = hearthManifold(b, chunks[j], margin);
        if (contact && contact.points.length) out.push(contact);
      }
    }
    return out;
  }
  function hearthApplyImpulse(c, p, x, y) {
    var a = c.a, b = c.b;
    a.vx -= x * a.invMass; a.vy -= y * a.invMass;
    a.spin -= (p.ax * y - p.ay * x) * a.invInertia;
    if (b) {
      b.vx += x * b.invMass; b.vy += y * b.invMass;
      b.spin += (p.bx * y - p.by * x) * b.invInertia;
    }
  }
  function hearthRelative(c, p, nx, ny) {
    var a = c.a, b = c.b;
    return ((b ? b.vx - b.spin * p.by : 0) - a.vx + a.spin * p.ay) * nx +
      ((b ? b.vy + b.spin * p.bx : 0) - a.vy - a.spin * p.ax) * ny;
  }
  function hearthSolve(bed) {
    var contacts = hearthContacts(bed, 0.45), old = bed.contacts || {}, cache = {}, i, j, c, p;
    for (i = 0; i < contacts.length; i++) {
      c = contacts[i];
      var key = c.a.id + ':' + (c.b ? c.b.id : 'w' + c.wall), previous = old[key] || [];
      for (j = 0; j < c.points.length; j++) {
        p = c.points[j]; p.ax = p.x - c.a.x; p.ay = p.y - c.a.y;
        p.bx = c.b ? p.x - c.b.x : 0; p.by = c.b ? p.y - c.b.y : 0;
        var an = p.ax * c.ny - p.ay * c.nx, bn = p.bx * c.ny - p.by * c.nx;
        var at = p.ax * c.nx + p.ay * c.ny, bt = p.bx * c.nx + p.by * c.ny;
        var mass = c.a.invMass + (c.b ? c.b.invMass : 0);
        p.normalMass = 1 / (mass + an * an * c.a.invInertia + (c.b ? bn * bn * c.b.invInertia : 0));
        p.tangentMass = 1 / (mass + at * at * c.a.invInertia + (c.b ? bt * bt * c.b.invInertia : 0));
        var closing = hearthRelative(c, p, c.nx, c.ny);
        p.bounce = closing < -55 ? -closing * 0.08 : 0;
        p.normal = 0; p.tangent = 0;
        // Match nearby persistent contact points, only once each. Support and
        // static friction survive from step to step without freezing a body.
        for (var k = 0; k < previous.length; k++) {
          var prior = previous[k];
          if (!prior.used && Math.hypot(prior.x - p.x, prior.y - p.y) < 3 && prior.nx * c.nx + prior.ny * c.ny > 0.98) {
            p.normal = prior.normal * 0.85; p.tangent = prior.tangent * 0.85; prior.used = true; break;
          }
        }
        if (closing < -70) {
          bed.impact = Math.max(bed.impact, Math.min(1, -closing / 360));
          if (c.a.lit || (c.b && c.b.lit)) hearthSparks(bed, p.x, p.y, 2, 0.7);
        }
      }
      cache[key] = c.points;
    }
    for (i = 0; i < contacts.length; i++) {
      c = contacts[i];
      for (j = 0; j < c.points.length; j++) {
        p = c.points[j]; hearthApplyImpulse(c, p, c.nx * p.normal - c.ny * p.tangent, c.ny * p.normal + c.nx * p.tangent);
      }
    }
    for (var pass = 0; pass < 14; pass++) for (i = 0; i < contacts.length; i++) {
      c = contacts[i];
      for (j = 0; j < c.points.length; j++) {
        p = c.points[j];
        var delta = (p.bounce - hearthRelative(c, p, c.nx, c.ny)) * p.normalMass;
        var next = Math.max(0, p.normal + delta); delta = next - p.normal; p.normal = next;
        hearthApplyImpulse(c, p, c.nx * delta, c.ny * delta);
        delta = -hearthRelative(c, p, -c.ny, c.nx) * p.tangentMass;
        var friction = HEARTH_FRICTION * p.normal;
        next = Math.max(-friction, Math.min(friction, p.tangent + delta)); delta = next - p.tangent; p.tangent = next;
        hearthApplyImpulse(c, p, -c.ny * delta, c.nx * delta);
        p.nx = c.nx; p.ny = c.ny; p.used = false;
      }
    }
    bed.contacts = cache;
    // Solved impulses measure supported weight, including loads transmitted
    // through a stack. Accumulate before positional correction replaces them.
    for (i = 0; i < bed.chunks.length; i++) bed.chunks[i].load = 0;
    for (i = 0; i < contacts.length; i++) {
      c = contacts[i];
      for (j = 0; j < c.points.length; j++) {
        var force = c.points[j].normal / HEARTH_STEP;
        c.a.load += force; if (c.b) c.b.load += force;
      }
    }
    // Split positional correction includes torque, but adds no kinetic energy.
    // Rebuild the manifolds after each pass as faces rotate into their seats.
    for (pass = 0; pass < 5; pass++) {
      contacts = hearthContacts(bed, 0);
      for (i = 0; i < contacts.length; i++) {
        c = contacts[i];
        for (j = 0; j < c.points.length; j++) {
          p = c.points[j];
          var a = c.a, b = c.b, ra = (p.x - a.x) * c.ny - (p.y - a.y) * c.nx;
          var rb = b ? (p.x - b.x) * c.ny - (p.y - b.y) * c.nx : 0;
          var inv = a.invMass + ra * ra * a.invInertia + (b ? b.invMass + rb * rb * b.invInertia : 0);
          var correction = Math.min(5, Math.max(0, p.depth - 0.025) * 0.55) / inv / c.points.length;
          a.x -= c.nx * correction * a.invMass; a.y -= c.ny * correction * a.invMass; a.angle -= ra * correction * a.invInertia;
          if (b) { b.x += c.nx * correction * b.invMass; b.y += c.ny * correction * b.invMass; b.angle += rb * correction * b.invInertia; }
        }
      }
    }
  }
