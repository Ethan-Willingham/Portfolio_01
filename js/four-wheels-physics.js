/* All Four Wheels. Positions are in artwork pixels; time is in seconds.
 * A cart and its shopper form one rigid body. Forces change velocity, never
 * heading directly. Steering is a force couple at the handle, so rotating
 * preserves linear momentum apart from small caster reactions. Each free caster
 * has a fixed swivel pivot, a trailing tire contact and its own swivel inertia.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const cross = (x, y, u, v) => x * v - y * u;
  const BODY = Object.freeze({ cartX: 14, halfLength: 17, halfWidth: 11, personX: -16, personRadius: 4, inertia: 470 });
  const WHEELS = [[1, -12], [27, -12], [1, 12], [27, 12]];
  const CASTER = Object.freeze({ trail: 5.5, halfLength: 4, halfWidth: 2, inertia: 0.16, bearingDamping: 1.2, axleOffset: 0.06 });
  const ROOM = Object.freeze({ left: 8, right: 472, top: 8, bottom: 292, width: 480, height: 300 });
  const CHECKPOINT_RADIUS = 20;

  function point(body, x, y) {
    const c = Math.cos(body.a), s = Math.sin(body.a);
    return { x: body.x + x * c - y * s, y: body.y + x * s + y * c };
  }

  function shopperTouchesCheckpoint(body, checkpoint) {
    const person = point(body, BODY.personX, 0);
    return Math.hypot(person.x - checkpoint.x, person.y - checkpoint.y) <= CHECKPOINT_RADIUS + BODY.personRadius + 1e-9;
  }

  function advanceGait(gait, body, dt, input = {}) {
    // The shopper travels around the handle during a turn even if the cart's
    // center is stationary. Measure that velocity, not just the basket speed.
    const c = Math.cos(body.a), s = Math.sin(body.a);
    const vx = body.vx - body.omega * BODY.personX * s;
    const vy = body.vy + body.omega * BODY.personX * c;
    const speed = Math.hypot(vx, vy), moving = speed > .8;
    // Two alternating footfalls per cycle: a walk at normal cart speed and
    // at most three steps a second at a fast jog. Integrating preserves phase.
    const cadence = moving ? Math.min(3, speed / (22 + speed * .1)) : 0;
    gait.phase = (gait.phase + cadence * Math.PI * dt) % TAU;
    const ease = 1 - Math.exp(-12 * dt);
    gait.stride += ((moving ? Math.min(2.8, speed / 18) : 0) - gait.stride) * ease;
    if (moving) {
      gait.forward = (vx * c + vy * s) / speed;
      gait.sideways = (-vx * s + vy * c) / speed;
    }
    gait.speed = speed;
    // Visual posture follows effort and travel at the shopper. The hands stay
    // on the handle; this moves the upper body above the unchanged footprint.
    const forward = vx * c + vy * s, sideways = -vx * s + vy * c;
    const push = clamp(input.push || 0, -1, 1), turn = clamp(input.turn || 0, -1, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const leanX = clamp(push * 1.9 + forward * .006 - brake * clamp(forward / 40, -1, 1) * 2.5, -2.5, 2.5);
    const leanY = clamp(-turn * 1.4 - body.omega * .55 + sideways * .025 - brake * clamp(sideways / 40, -1, 1) * 2.5, -2.8, 2.8);
    const settle = 1 - Math.exp(-8 * dt);
    gait.leanX = (gait.leanX || 0) + (leanX - (gait.leanX || 0)) * settle;
    gait.leanY = (gait.leanY || 0) + (leanY - (gait.leanY || 0)) * settle;
  }

  function corners(body) {
    return [[-3, -11], [31, -11], [31, 11], [-3, 11]].map(p => point(body, ...p));
  }

  function casterPose(body, wheel, i) {
    const pivot = point(body, ...WHEELS[i]), c = Math.cos(wheel.a), s = Math.sin(wheel.a);
    // The small alternating axle offset also gives rolling resistance a real
    // lever arm, breaking the unstable, perfectly backward caster equilibrium.
    const side = (i % 2 ? -1 : 1) * CASTER.axleOffset;
    return { pivot, x: pivot.x - CASTER.trail * c - side * s, y: pivot.y - CASTER.trail * s + side * c, a: wheel.a };
  }

  function casterCorners(body, wheel, i) {
    const pose = casterPose(body, wheel, i), l = CASTER.halfLength, h = CASTER.halfWidth;
    return [[-l, -h], [l, -h], [l, h], [-l, h]].map(p => point(pose, ...p));
  }

  function footprint(body, wheels) {
    const p = point(body, BODY.personX, 0), r = BODY.personRadius;
    return [...corners(body), ...wheels.flatMap((w, i) => casterCorners(body, w, i)),
      { x: p.x - r, y: p.y }, { x: p.x + r, y: p.y }, { x: p.x, y: p.y - r }, { x: p.x, y: p.y + r }];
  }

  function exitGeometry(exit) {
    const vertical = exit.side === 'left' || exit.side === 'right';
    const nx = exit.side === 'left' ? -1 : exit.side === 'right' ? 1 : 0;
    const ny = exit.side === 'top' ? -1 : exit.side === 'bottom' ? 1 : 0;
    const x = vertical ? ROOM[exit.side] : exit.center, y = vertical ? exit.center : ROOM[exit.side];
    return { ...exit, x, y, nx, ny, a: Math.atan2(ny, nx), vertical,
      low: exit.center - exit.width / 2, high: exit.center + exit.width / 2,
      approach: { x: x - nx * 58, y: y - ny * 58 }, outside: { x: x + nx * 70, y: y + ny * 70 } };
  }

  function roomWalls(exit, open) {
    const walls = [
      { side: 'left', x: -60, y: -60, w: 68, h: 420 },
      { side: 'right', x: 472, y: -60, w: 60, h: 420 },
      { side: 'top', x: 8, y: -60, w: 464, h: 68 },
      { side: 'bottom', x: 8, y: 292, w: 464, h: 60 }
    ];
    if (!open) return walls;
    return walls.flatMap(wall => {
      if (wall.side !== exit.side) return [wall];
      if (exit.vertical) return [{ ...wall, h: exit.low - wall.y }, { ...wall, y: exit.high, h: wall.y + wall.h - exit.high }];
      return [{ ...wall, w: exit.low - wall.x }, { ...wall, x: exit.high, w: wall.x + wall.w - exit.high }];
    });
  }

  // Separating-axis test, with a contact on the cart's face or leading corner.
  function boxContact(body, rect) {
    const center = point(body, BODY.cartX, 0);
    return polygonRectContact(corners(body), center, body.a, rect);
  }

  function polygonRectContact(poly, center, angle, rect) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const rcx = rect.x + rect.w / 2, rcy = rect.y + rect.h / 2;
    let best = Infinity, nx = 0, ny = 0;
    for (const axis of [[1, 0], [0, 1], [c, s], [-s, c]]) {
      let low = Infinity, high = -Infinity;
      for (const p of poly) { const d = p.x * axis[0] + p.y * axis[1]; low = Math.min(low, d); high = Math.max(high, d); }
      const mid = rcx * axis[0] + rcy * axis[1];
      const extent = Math.abs(axis[0]) * rect.w / 2 + Math.abs(axis[1]) * rect.h / 2;
      if (high <= mid - extent || low >= mid + extent) return null;
      // Translation distances, rather than intersection width, handle containment.
      const left = high - (mid - extent), right = mid + extent - low;
      const overlap = Math.min(left, right);
      if (overlap < best) {
        best = overlap;
        const sign = (center.x - rcx) * axis[0] + (center.y - rcy) * axis[1] >= 0 ? 1 : -1;
        nx = axis[0] * sign; ny = axis[1] * sign;
      }
    }
    let min = Infinity;
    for (const p of poly) min = Math.min(min, p.x * nx + p.y * ny);
    const face = poly.filter(p => p.x * nx + p.y * ny < min + 0.01);
    const px = face.reduce((a, p) => a + p.x, 0) / face.length;
    const py = face.reduce((a, p) => a + p.y, 0) / face.length;
    return { nx, ny, depth: best, x: clamp(px, rect.x, rect.x + rect.w), y: clamp(py, rect.y, rect.y + rect.h) };
  }

  function circleRect(x, y, radius, rect) {
    const qx = clamp(x, rect.x, rect.x + rect.w), qy = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
    if (d >= radius) return null;
    if (d > 0.001) return { nx: dx / d, ny: dy / d, depth: radius - d, x: qx, y: qy };
    const faces = [[x - rect.x, -1, 0], [rect.x + rect.w - x, 1, 0], [y - rect.y, 0, -1], [rect.y + rect.h - y, 0, 1]].sort((a, b) => a[0] - b[0]);
    const f = faces[0];
    return { nx: f[1], ny: f[2], depth: radius + f[0], x: x + f[1] * f[0], y: y + f[2] * f[0] };
  }

  function cartCircle(body, obj) {
    const c = Math.cos(body.a), s = Math.sin(body.a), dx = obj.x - body.x, dy = obj.y - body.y;
    const x = dx * c + dy * s, y = -dx * s + dy * c;
    const hit = circleRect(x, y, obj.radius, { x: -3, y: -11, w: 34, h: 22 });
    if (hit) {
      const p = point(body, hit.x, hit.y);
      // circleRect's normal points toward the object; this points toward cart.
      return { nx: -hit.nx * c + hit.ny * s, ny: -hit.nx * s - hit.ny * c, depth: hit.depth, x: p.x, y: p.y };
    }
    const person = point(body, BODY.personX, 0);
    const px = person.x - obj.x, py = person.y - obj.y, d = Math.hypot(px, py);
    const radius = BODY.personRadius + obj.radius;
    if (d >= radius) return null;
    const nx = d > 0.001 ? px / d : 1, ny = d > 0.001 ? py / d : 0;
    return { nx, ny, depth: radius - d, x: obj.x + nx * obj.radius, y: obj.y + ny * obj.radius };
  }

  function casterCircle(body, wheel, i, obj) {
    const pose = casterPose(body, wheel, i), c = Math.cos(pose.a), s = Math.sin(pose.a);
    const dx = obj.x - pose.x, dy = obj.y - pose.y;
    const hit = circleRect(dx * c + dy * s, -dx * s + dy * c, obj.radius,
      { x: -CASTER.halfLength, y: -CASTER.halfWidth, w: CASTER.halfLength * 2, h: CASTER.halfWidth * 2 });
    if (!hit) return null;
    const p = point(pose, hit.x, hit.y);
    return { nx: -hit.nx * c + hit.ny * s, ny: -hit.nx * s - hit.ny * c, depth: hit.depth, x: p.x, y: p.y };
  }

  class World {
    constructor(level, practice = false) {
      this.level = level; this.practice = practice;
      this.body = { x: level.start.x, y: level.start.y, a: level.start.a, vx: 0, vy: 0, omega: 0 };
      this.wheels = WHEELS.map(() => ({ a: level.start.a, omega: 0, roll: 0, speed: 0 }));
      this.gait = { phase: 0, stride: 0, forward: 1, sideways: 0, speed: 0, leanX: 0, leanY: 0 };
      this.time = 0; this.penalty = 0; this.messes = 0; this.gate = 0;
      this.status = 'running'; this.events = []; this.tracks = []; this.trackTime = 0;
      this.shelves = level.shelves.map((s, i) => ({ ...s, id: i, spilled: false, wobble: 0 }));
      this.objects = level.objects.map((o, i) => ({ ...o, id: i, vx: 0, vy: 0, a: i * 1.7, omega: 0, down: false, radius: o.kind === 'cone' ? 5.5 : 8, mass: o.kind === 'cone' ? 0.12 : 0.32 }));
      this.exit = exitGeometry(level.exit);
      this.closedWalls = roomWalls(this.exit, false); this.openWalls = roomWalls(this.exit, true);
      this.walls = this.exitOpen ? this.openWalls : this.closedWalls;
      this.boundaryContacts = []; this.exiting = false; this.exitEntered = false;
      this.wet = false;
    }

    emit(type, data = {}) { this.events.push({ type, ...data }); }
    get exitOpen() { return this.gate === this.level.gates.length; }
    boundaryContact(rect, hit, part) {
      if (!rect.side) return;
      const old = this.boundaryContacts.find(c => c.side === rect.side && c.part === part);
      const contact = { side: rect.side, part, x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, life: .32 };
      if (old) Object.assign(old, contact); else this.boundaryContacts.push(contact);
    }
    mess(kind, x, y) {
      const seconds = kind === 'cone' ? 2 : kind === 'box' ? 3 : 5;
      this.messes++; this.penalty += seconds;
      this.emit('mess', { kind, x, y, seconds });
    }

    impulse(hit, other) {
      const b = this.body, rx = hit.x - b.x, ry = hit.y - b.y;
      const ox = other ? other.vx : 0, oy = other ? other.vy : 0;
      const vx = b.vx - b.omega * ry - ox, vy = b.vy + b.omega * rx - oy;
      const vn = vx * hit.nx + vy * hit.ny;
      const oi = other ? 1 / other.mass : 0;
      const rn = cross(rx, ry, hit.nx, hit.ny);
      const denom = 1 + oi + rn * rn / BODY.inertia;
      let j = 0;
      if (vn < 0) {
        j = -(1.12) * vn / denom;
        b.vx += hit.nx * j; b.vy += hit.ny * j; b.omega += rn * j / BODY.inertia;
        if (other) { other.vx -= hit.nx * j * oi; other.vy -= hit.ny * j * oi; other.omega += cross(hit.x - other.x, hit.y - other.y, -hit.nx, -hit.ny) * j / (other.mass * 50); }
        const tx = -hit.ny, ty = hit.nx, rt = cross(rx, ry, tx, ty);
        const friction = clamp(-(vx * tx + vy * ty) / (1 + oi + rt * rt / BODY.inertia), -j * 0.24, j * 0.24);
        b.vx += tx * friction; b.vy += ty * friction; b.omega += rt * friction / BODY.inertia;
        if (other) { other.vx -= tx * friction * oi; other.vy -= ty * friction * oi; }
      }
      // Shared positional correction keeps cones light without pushing cart far.
      const correction = Math.max(0, hit.depth - 0.01) / (1 + oi);
      b.x += hit.nx * correction; b.y += hit.ny * correction;
      if (other) { other.x -= hit.nx * correction * oi; other.y -= hit.ny * correction * oi; }
      return j;
    }

    casterImpulse(hit, wheel, i, other) {
      const b = this.body, { pivot } = casterPose(b, wheel, i);
      const px = pivot.x - b.x, py = pivot.y - b.y, qx = hit.x - pivot.x, qy = hit.y - pivot.y;
      const nx = hit.nx, ny = hit.ny;
      const rp = cross(px, py, nx, ny), rq = cross(qx, qy, nx, ny);
      const oi = other ? 1 / other.mass : 0;
      const mass = 1 + oi + rp * rp / BODY.inertia + rq * rq / CASTER.inertia;
      const vx = b.vx - b.omega * py - wheel.omega * qy - (other ? other.vx : 0);
      const vy = b.vy + b.omega * px + wheel.omega * qx - (other ? other.vy : 0);
      const vn = vx * nx + vy * ny;
      const j = vn < 0 ? -1.08 * vn / mass : 0;
      b.vx += nx * j; b.vy += ny * j; b.omega += rp * j / BODY.inertia;
      wheel.omega += rq * j / CASTER.inertia;
      if (other) { other.vx -= nx * j * oi; other.vy -= ny * j * oi; }
      const correction = Math.max(0, hit.depth - .01) / mass;
      b.x += nx * correction; b.y += ny * correction;
      b.a = wrap(b.a + clamp(rp * correction / BODY.inertia, -.1, .1));
      wheel.a = wrap(wheel.a + clamp(rq * correction / CASTER.inertia, -.25, .25));
      if (other) { other.x -= nx * correction * oi; other.y -= ny * correction * oi; }
      return j;
    }

    casterForces(dt, rolling) {
      const b = this.body;
      this.wheels.forEach((w, i) => {
        const pose = casterPose(b, w, i), rx = pose.pivot.x - b.x, ry = pose.pivot.y - b.y;
        const vx = b.vx - b.omega * ry, vy = b.vy + b.omega * rx;
        const side = (i % 2 ? -1 : 1) * CASTER.axleOffset;
        const along = vx * Math.cos(w.a) + vy * Math.sin(w.a) - side * w.omega;
        // Rolling resistance at the offset axle acts on the fork. The tiny
        // lateral offset is mirrored across wheels, rather than random noise.
        const torque = (i % 2 ? -1 : 1) * CASTER.axleOffset * rolling / 4 * clamp(along, -1, 1);
        w.omega += torque * dt / CASTER.inertia; b.omega -= torque * dt / BODY.inertia;
        // Bearing drag exchanges angular momentum with the chassis; an idle
        // caster retains its orientation instead of returning to cart heading.
        const j = -(w.omega - b.omega) * (1 - Math.exp(-CASTER.bearingDamping * dt)) / (1 / CASTER.inertia + 1 / BODY.inertia);
        w.omega += j / CASTER.inertia; b.omega -= j / BODY.inertia;
      });
    }

    solveCasters() {
      const b = this.body;
      // Contact C = pivot P - trail * heading. Its lateral velocity is
      // V(P).normal - trail * swivelRate. Ground impulses remove that slip,
      // exchanging momentum with both the chassis and the independent fork.
      for (let pass = 0; pass < 4; pass++) this.wheels.forEach((w, i) => {
        const { pivot } = casterPose(b, w, i), rx = pivot.x - b.x, ry = pivot.y - b.y;
        const nx = -Math.sin(w.a), ny = Math.cos(w.a), lever = cross(rx, ry, nx, ny);
        const lateral = (b.vx - b.omega * ry) * nx + (b.vy + b.omega * rx) * ny - CASTER.trail * w.omega;
        const j = -lateral / (1 + lever * lever / BODY.inertia + CASTER.trail ** 2 / CASTER.inertia);
        b.vx += nx * j; b.vy += ny * j; b.omega += lever * j / BODY.inertia;
        w.omega -= CASTER.trail * j / CASTER.inertia;
      });
    }

    step(dt, input = {}) {
      if (this.status !== 'running') return;
      // Caller uses a 120 Hz fixed step. Clamp external steps to avoid tunneling.
      dt = clamp(dt, 0, 1 / 120);
      const b = this.body;
      this.time += dt;
      this.walls = this.exitOpen ? this.openWalls : this.closedWalls;
      this.boundaryContacts.forEach(c => { c.life -= dt; });
      this.boundaryContacts = this.boundaryContacts.filter(c => c.life > 0);
      const puddle = this.level.puddle;
      this.wet = !!puddle && ((b.x - puddle.x) / puddle.rx) ** 2 + ((b.y - puddle.y) / puddle.ry) ** 2 < 1;
      const push = clamp(input.push || 0, -1, 1), turn = clamp(input.turn || 0, -1, 1);
      const force = push * (push >= 0 ? 78 : 50);
      b.vx += Math.cos(b.a) * force * dt; b.vy += Math.sin(b.a) * force * dt;
      b.omega += turn * 8.8 * dt;
      b.omega *= Math.exp(-4.2 * dt);
      const speed = Math.hypot(b.vx, b.vy);
      const brake = clamp(input.brake || 0, 0, 1);
      const drag = this.wet ? 0.12 : 0.34;
      const rolling = this.wet ? 1.3 : 4.0;
      const reduction = Math.exp(-drag * dt) * Math.max(0, 1 - (rolling + brake * (this.wet ? 65 : 175)) * dt / Math.max(speed, 0.001));
      b.vx *= reduction; b.vy *= reduction;
      if (brake) b.omega *= Math.exp(-6 * brake * dt);
      // Air/rolling resistance rises smoothly above a comfortable walking run.
      const limit = Math.hypot(b.vx, b.vy);
      if (limit > 135) { b.vx *= 135 / limit; b.vy *= 135 / limit; }
      this.casterForces(dt, rolling);
      this.solveCasters();
      b.x += b.vx * dt; b.y += b.vy * dt; b.a = wrap(b.a + b.omega * dt);
      this.wheels.forEach(w => { w.a = wrap(w.a + w.omega * dt); });
      for (const o of this.objects) {
        const decay = Math.exp(-(o.kind === 'cone' ? 2.0 : 2.8) * dt);
        o.vx *= decay; o.vy *= decay; o.omega *= Math.exp(-3 * dt);
        o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.omega * dt;
        for (const rect of [...this.walls, ...this.shelves]) {
          const h = circleRect(o.x, o.y, o.radius, rect);
          if (!h) continue;
          o.x += h.nx * h.depth; o.y += h.ny * h.depth;
          const vn = o.vx * h.nx + o.vy * h.ny;
          if (vn < 0) { o.vx -= 1.18 * vn * h.nx; o.vy -= 1.18 * vn * h.ny; }
        }
      }
      for (let pass = 0; pass < 4; pass++) {
        for (const rect of [...this.walls, ...this.shelves]) {
          const hits = [boxContact(b, rect)];
          const person = point(b, BODY.personX, 0);
          hits.push(circleRect(person.x, person.y, BODY.personRadius, rect));
          for (let k = 0; k < hits.length; k++) {
            const h = hits[k];
            if (!h) continue;
            this.boundaryContact(rect, h, k === 0 ? 'cart' : 'shopper');
            const impact = this.impulse(h);
            if (impact > 9 && !rect.spilled && rect.id !== undefined) {
              rect.spilled = true; rect.wobble = 1;
              this.mess('shelf', h.x, h.y); this.emit('spill', { shelf: rect, x: h.x, y: h.y });
            } else if (impact > 14 && pass === 0 && !rect.side) this.emit('bump', { x: h.x, y: h.y, impact });
          }
          this.wheels.forEach((wheel, i) => {
            const pose = casterPose(b, wheel, i);
            const h = polygonRectContact(casterCorners(b, wheel, i), pose, wheel.a, rect);
            if (!h) return;
            this.boundaryContact(rect, h, 'wheel:' + i);
            const impact = this.casterImpulse(h, wheel, i);
            if (impact > 9 && !rect.spilled && rect.id !== undefined) {
              rect.spilled = true; rect.wobble = 1; this.mess('shelf', h.x, h.y); this.emit('spill', { shelf: rect, x: h.x, y: h.y });
            }
          });
        }
        for (const o of this.objects) {
          const h = cartCircle(b, o);
          if (h) {
            const impact = this.impulse(h, o);
            if (!o.down && impact > 1.8) { o.down = true; this.mess(o.kind, o.x, o.y); }
          }
          this.wheels.forEach((wheel, i) => {
            const contact = casterCircle(b, wheel, i, o);
            if (!contact) return;
            const impact = this.casterImpulse(contact, wheel, i, o);
            if (!o.down && impact > 1.8) { o.down = true; this.mess(o.kind, o.x, o.y); }
          });
        }
        for (let i = 0; i < this.objects.length; i++) for (let k = i + 1; k < this.objects.length; k++) {
          const a = this.objects[i], z = this.objects[k], dx = a.x - z.x, dy = a.y - z.y, d = Math.hypot(dx, dy);
          const overlap = a.radius + z.radius - d;
          if (overlap <= 0 || d < 0.001) continue;
          const nx = dx / d, ny = dy / d, total = 1 / a.mass + 1 / z.mass;
          a.x += nx * overlap / a.mass / total; a.y += ny * overlap / a.mass / total;
          z.x -= nx * overlap / z.mass / total; z.y -= ny * overlap / z.mass / total;
          const vn = (a.vx - z.vx) * nx + (a.vy - z.vy) * ny;
          if (vn < 0) {
            const j = -1.1 * vn / total;
            a.vx += nx * j / a.mass; a.vy += ny * j / a.mass;
            z.vx -= nx * j / z.mass; z.vy -= ny * j / z.mass;
            if (j > 1.8) for (const o of [a, z]) if (!o.down) { o.down = true; this.mess(o.kind, o.x, o.y); }
          }
        }
      }
      // A settled contact can have zero penetration and zero speed. The tiny
      // tolerance catches actual touching without requiring an impact impulse.
      for (const wall of this.walls) {
        const touch = { ...wall, x: wall.x - .04, y: wall.y - .04, w: wall.w + .08, h: wall.h + .08 };
        const cart = boxContact(b, touch), person = point(b, BODY.personX, 0);
        if (cart) this.boundaryContact(wall, cart, 'cart');
        const shopper = circleRect(person.x, person.y, BODY.personRadius, touch);
        if (shopper) this.boundaryContact(wall, shopper, 'shopper');
        this.wheels.forEach((wheel, i) => {
          const pose = casterPose(b, wheel, i), hit = polygonRectContact(casterCorners(b, wheel, i), pose, wheel.a, touch);
          if (hit) this.boundaryContact(wall, hit, 'wheel:' + i);
        });
      }
      this.solveCasters();
      this.wheels.forEach((w, i) => {
        const p = casterPose(b, w, i).pivot, rx = p.x - b.x, ry = p.y - b.y;
        const vx = b.vx - b.omega * ry, vy = b.vy + b.omega * rx;
        w.speed = vx * Math.cos(w.a) + vy * Math.sin(w.a) - (i % 2 ? -1 : 1) * CASTER.axleOffset * w.omega;
        w.roll += w.speed * dt;
      });
      advanceGait(this.gait, b, dt, input);
      for (const s of this.shelves) s.wobble *= Math.exp(-6 * dt);
      this.trackTime += dt;
      if (Math.hypot(b.vx, b.vy) > 35 && this.trackTime > 0.065) {
        this.trackTime = 0;
        for (const i of [0, 2]) { const p = casterPose(b, this.wheels[i], i); this.tracks.push({ x: p.x, y: p.y, a: p.a, life: 3 }); }
      }
      this.tracks.forEach(t => { t.life -= dt; }); this.tracks = this.tracks.filter(t => t.life > 0);
      const target = this.level.gates[this.gate];
      if (target && shopperTouchesCheckpoint(b, target)) { this.emit('gate', { index: this.gate, x: target.x, y: target.y }); this.gate++; }
      const e = this.exit, shape = footprint(b, this.wheels), tangent = e.vertical ? b.y : b.x;
      const distance = p => (p.x - e.x) * e.nx + (p.y - e.y) * e.ny;
      this.exiting = this.exitOpen && tangent >= e.low && tangent <= e.high && shape.some(p => distance(p) > 0);
      if (this.exiting) this.exitEntered = true;
      const cleared = this.exitOpen && this.exitEntered && shape.every(p => distance(p) > 8);
      this.walls = this.exitOpen ? this.openWalls : this.closedWalls;
      // An expired clock cannot be rescued by finishing on the same step.
      if (!this.practice && this.remaining <= 0) { this.status = 'lost'; this.emit('lost'); }
      else if (cleared) { this.status = 'won'; this.emit('won'); }
    }
    get remaining() { return Math.max(0, this.level.limit - this.time - this.penalty); }
    get result() {
      const elapsed = this.time + this.penalty;
      return { time: elapsed, driving: this.time, penalty: this.penalty, messes: this.messes, stars: this.messes === 0 && elapsed <= this.level.par ? 3 : this.messes <= 2 ? 2 : 1 };
    }
  }
  const api = { World, BODY, WHEELS, CASTER, ROOM, CHECKPOINT_RADIUS, shopperTouchesCheckpoint, point, advanceGait, corners, casterPose, casterCorners, footprint, exitGeometry, boxContact, circleRect, cartCircle, casterCircle, wrap, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CartPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
