/* All Four Wheels. Positions are in artwork pixels; time is in seconds.
 * A cart and its shopper form one rigid body. Forces change velocity, never
 * heading directly. Steering is a force couple at the handle, so rotating
 * preserves linear momentum. The four casters follow their contact velocities.
 * No directional tire grip: lateral and longitudinal rolling drag are equal.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const cross = (x, y, u, v) => x * v - y * u;
  const BODY = Object.freeze({ cartX: 14, halfLength: 17, halfWidth: 11, personX: -16, personRadius: 7, inertia: 470 });
  const WHEELS = [[1, -12], [27, -12], [1, 12], [27, 12]];

  function point(body, x, y) {
    const c = Math.cos(body.a), s = Math.sin(body.a);
    return { x: body.x + x * c - y * s, y: body.y + x * s + y * c };
  }

  function corners(body) {
    return [[-3, -11], [31, -11], [31, 11], [-3, 11]].map(p => point(body, ...p));
  }

  // Separating-axis test, with a contact on the cart's face or leading corner.
  function boxContact(body, rect) {
    const poly = corners(body);
    const c = Math.cos(body.a), s = Math.sin(body.a);
    const center = point(body, BODY.cartX, 0);
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

  class World {
    constructor(level, practice = false) {
      this.level = level; this.practice = practice;
      this.body = { x: level.start.x, y: level.start.y, a: level.start.a, vx: 0, vy: 0, omega: 0 };
      this.wheels = WHEELS.map(() => ({ a: level.start.a, roll: 0 }));
      this.time = 0; this.penalty = 0; this.messes = 0; this.gate = 0; this.park = 0;
      this.status = 'running'; this.events = []; this.tracks = []; this.trackTime = 0;
      this.shelves = level.shelves.map((s, i) => ({ ...s, id: i, spilled: false, wobble: 0 }));
      this.objects = level.objects.map((o, i) => ({ ...o, id: i, vx: 0, vy: 0, a: i * 1.7, omega: 0, down: false, radius: o.kind === 'cone' ? 5.5 : 8, mass: o.kind === 'cone' ? 0.12 : 0.32 }));
      this.walls = [{ x: -60, y: -60, w: 60 + 8, h: 420 }, { x: 472, y: -60, w: 60, h: 420 }, { x: 8, y: -60, w: 464, h: 68 }, { x: 8, y: 292, w: 464, h: 60 }];
      this.wet = false;
    }

    emit(type, data = {}) { this.events.push({ type, ...data }); }
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

    step(dt, input = {}) {
      if (this.status !== 'running') return;
      // Caller uses a 120 Hz fixed step. Clamp external steps to avoid tunneling.
      dt = clamp(dt, 0, 1 / 120);
      const b = this.body;
      this.time += dt;
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
      b.x += b.vx * dt; b.y += b.vy * dt; b.a = wrap(b.a + b.omega * dt);
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
          for (const h of hits) {
            if (!h) continue;
            const impact = this.impulse(h);
            if (impact > 9 && !rect.spilled && rect.id !== undefined) {
              rect.spilled = true; rect.wobble = 1;
              this.mess('shelf', h.x, h.y); this.emit('spill', { shelf: rect, x: h.x, y: h.y });
            } else if (impact > 14 && pass === 0) this.emit('bump', { x: h.x, y: h.y, impact });
          }
        }
        for (const o of this.objects) {
          const h = cartCircle(b, o);
          if (!h) continue;
          const impact = this.impulse(h, o);
          if (!o.down && impact > 1.8) { o.down = true; this.mess(o.kind, o.x, o.y); }
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
      this.wheels.forEach((w, i) => {
        const p = point(b, ...WHEELS[i]), rx = p.x - b.x, ry = p.y - b.y;
        const vx = b.vx - b.omega * ry, vy = b.vy + b.omega * rx, v = Math.hypot(vx, vy);
        if (v > 0.8) w.a = wrap(w.a + wrap(Math.atan2(vy, vx) - w.a) * (1 - Math.exp(-14 * dt)));
        w.roll += v * dt;
      });
      for (const s of this.shelves) s.wobble *= Math.exp(-6 * dt);
      this.trackTime += dt;
      if (Math.hypot(b.vx, b.vy) > 35 && this.trackTime > 0.065) {
        this.trackTime = 0;
        for (const i of [0, 2]) { const p = point(b, ...WHEELS[i]); this.tracks.push({ ...p, a: this.wheels[i].a, life: 3 }); }
      }
      this.tracks.forEach(t => { t.life -= dt; }); this.tracks = this.tracks.filter(t => t.life > 0);
      const target = this.level.gates[this.gate];
      if (target && Math.hypot(b.x - target.x, b.y - target.y) < 22) { this.emit('gate', { index: this.gate, x: target.x, y: target.y }); this.gate++; }
      const goal = this.level.goal;
      const person = point(b, BODY.personX, 0);
      const footprint = [...corners(b), { x: person.x - 7, y: person.y - 7 }, { x: person.x + 7, y: person.y + 7 }];
      const inside = footprint.every(p => p.x > goal.x - goal.w / 2 + 2 && p.x < goal.x + goal.w / 2 - 2 && p.y > goal.y - goal.h / 2 + 2 && p.y < goal.y + goal.h / 2 - 2);
      this.parkReady = this.gate === this.level.gates.length && inside && Math.abs(wrap(b.a - goal.a)) < 0.4 && Math.hypot(b.vx, b.vy) < 12 && Math.abs(b.omega) < 0.4;
      this.park = this.parkReady ? this.park + dt : 0;
      // An expired clock cannot be rescued by finishing on the same step.
      if (!this.practice && this.remaining <= 0) { this.status = 'lost'; this.emit('lost'); }
      else if (this.park > 0.55) { this.status = 'won'; this.emit('won'); }
    }
    get remaining() { return Math.max(0, this.level.limit - this.time - this.penalty); }
    get result() {
      const elapsed = this.time + this.penalty;
      return { time: elapsed, driving: this.time, penalty: this.penalty, messes: this.messes, stars: this.messes === 0 && elapsed <= this.level.par ? 3 : this.messes <= 2 ? 2 : 1 };
    }
  }
  const api = { World, BODY, WHEELS, point, corners, boxContact, circleRect, cartCircle, wrap, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CartPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
