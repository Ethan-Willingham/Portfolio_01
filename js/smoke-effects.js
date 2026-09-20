/* Portable exhaust shapes. Owns bounded particles, never a canvas or game state.
 * Hosts supply world coordinates, a solid-point query, and an optional smoke puff.
 * All motion uses simulation time. Nothing advances inside draw(). */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;
  function hash(n) { var v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  function rgba(hex, a) {
    return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' +
      parseInt(hex.slice(5, 7), 16) + ',' + Math.max(0, Math.min(1, a)) + ')';
  }
  function create(limit) {
    var particles = [], sources = new Map(), serial = 0, puffBudget = 0;
    limit = limit || 180;
    function clear() { particles.length = 0; sources.clear(); serial = 0; }
    function emit(recipe, key, x, y, dx, dy, age, tuning, scale, throttle, strength, radius) {
      if (!recipe.effect) {
        var previous = sources.get(key);
        if (previous) { previous.x = x; previous.y = y; }
        return;
      }
      var e = recipe.effect;
      var source = sources.get(key);
      if (!source || source.recipe !== recipe.id || age < source.age) {
        source = { recipe: recipe.id, age: age, bucket: -1, x: x, y: y };
        sources.set(key, source);
      }
      source.x = x; source.y = y; source.age = age;
      var bucket = Math.floor(age * Math.min(30, e.rate * (0.7 + throttle * 0.3)));
      if (bucket === source.bucket) return;
      source.bucket = bucket;
      var id = ++serial, seed = hash(id + key.length * 19);
      var side = (seed - 0.5) * 2 * e.spread;
      var speed = e.speed * Math.sqrt(Math.max(0.2, strength)) * tuning.motion * scale.lift;
      var size = tuning.size * Math.sqrt(scale.rad) * radius;
      var p = { id: id, key: key, kind: e.kind, effect: e, colors: recipe.colors,
        color: recipe.colors[id % recipe.colors.length], seed: seed,
        x: x + dx * 6, y: y + dy * 6, ox: x, oy: y, dx: dx, dy: dy,
        vx: dx * speed - dy * side * speed, vy: dy * speed + dx * side * speed,
        age: 0, life: e.life * (0.8 + hash(id * 3) * 0.4),
        r: e.radius * size * (0.8 + hash(id * 5) * 0.4),
        mass: tuning.mass * scale.dye * throttle, motion: tuning.motion,
        angle: seed * TAU, spin: (hash(id * 7) - 0.5) * 1.8,
        lane: id % 3, history: [], split: false };
      if (e.kind === 'silk') {
        p.seed = p.lane / 3; p.life = e.life; p.r = e.radius * size;
      }
      if (particles.length >= limit) particles.shift();
      particles.push(p);
    }
    function puff(p, host) {
      if (!host.puff || puffBudget <= 0) return;
      puffBudget--;
      var c = p.kind === 'pearls' ? '#b2b5aa' : p.color;
      host.puff(p.x, p.y, p.vx * 0.06, -p.vy * 0.06,
        { r: parseInt(c.slice(1, 3), 16) / 255 * 0.38,
          g: parseInt(c.slice(3, 5), 16) / 255 * 0.38,
          b: parseInt(c.slice(5, 7), 16) / 255 * 0.38 }, Math.max(0.008, p.r * 0.0018));
    }
    function step(dt, host) {
      if (!dt) return;
      host = host || {}; dt = Math.min(dt, 0.05); puffBudget = 4;
      var children = [];
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i], e = p.effect, u = p.age / p.life;
        p.age += dt;
        var prevX = p.x, prevY = p.y;
        if (p.kind === 'return') {
          var target = sources.get(p.key) || { x: p.ox, y: p.oy };
          var t = Math.min(1, p.age / p.life), a = 1 - t;
          var width = (50 + p.seed * 65) * p.motion, height = (160 + p.seed * 110) * p.motion;
          var sign = p.id % 2 ? 1 : -1;
          var c1x = p.ox + p.dx * height - p.dy * width * sign;
          var c1y = p.oy + p.dy * height + p.dx * width * sign;
          var c2x = target.x + p.dx * height + p.dy * width * sign;
          var c2y = target.y + p.dy * height - p.dx * width * sign;
          p.x = a * a * a * p.ox + 3 * a * a * t * c1x + 3 * a * t * t * c2x + t * t * t * target.x;
          p.y = a * a * a * p.oy + 3 * a * a * t * c1y + 3 * a * t * t * c2y + t * t * t * target.y;
        } else {
          // Local curl varies with position and seed. New emitters never sweep
          // every packet together with the old nozzle-wide sine oscillator.
          var curl = Math.sin(p.y * 0.018 + p.seed * 9) * Math.cos(p.x * 0.012 - p.age * 0.4);
          var drift = p.kind === 'silk' ? 31 : p.kind === 'sparks' || p.kind === 'pearls' ? 2 : 9;
          p.vx += curl * drift * p.motion * dt;
          p.vy += e.gravity * dt;
          if (p.kind !== 'sparks' && p.kind !== 'pearls') p.vx *= Math.exp(-dt * 0.24);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.kind === 'silk') {
            p.x += -p.dy * Math.cos(p.age * 3.5 + p.lane * TAU / 3) * 25 * dt * p.motion;
            p.y += p.dx * Math.cos(p.age * 3.5 + p.lane * TAU / 3) * 25 * dt * p.motion;
          }
        }
        p.angle += p.spin * dt;
        var hit = false;
        if (host.solid) {
          // Swept point collision keeps fast sparks from skipping thin walls.
          var steps = Math.max(1, Math.ceil(Math.hypot(p.x - prevX, p.y - prevY) / 4));
          for (var s = 1; s <= steps; s++) {
            if (host.solid(prevX + (p.x - prevX) * s / steps, prevY + (p.y - prevY) * s / steps)) { hit = true; break; }
          }
        }
        if (hit || p.age >= p.life) {
          if (hit) { p.x = prevX; p.y = prevY; }
          if (p.kind === 'bubbles' || p.kind === 'pearls' || p.kind === 'lanterns') puff(p, host);
          particles.splice(i, 1); continue;
        }
        if (p.kind === 'pixels' && u > 0.52 && !p.split) {
          p.split = true;
          for (var q = 0; q < 4; q++) {
            children.push(Object.assign({}, p, { id: ++serial, r: p.r * 0.43,
              x: p.x + ((q & 1) ? 1 : -1) * p.r * 0.5,
              y: p.y + ((q & 2) ? 1 : -1) * p.r * 0.5,
              vx: p.vx + ((q & 1) ? 13 : -13), vy: p.vy + ((q & 2) ? 8 : -8), history: [] }));
          }
          particles.splice(i, 1); continue;
        }
        if (e.trail) {
          p.history.push({ x: p.x, y: p.y });
          if (p.history.length > e.trail) p.history.shift();
        }
      }
      particles.push.apply(particles, children);
      if (particles.length > limit) particles.splice(0, particles.length - limit);
    }
    function mist(ctx, x, y, radius, color, opacity) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.1, radius));
      g.addColorStop(0, rgba(color, opacity));
      g.addColorStop(0.55, rgba(color, opacity * 0.45));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    function trail(ctx, p, alpha) {
      for (var k = 1; k < p.history.length; k++) {
        var t = k / p.history.length, a = p.history[k - 1], b = p.history[k];
        ctx.strokeStyle = rgba(p.color, alpha * t * 0.65);
        ctx.lineWidth = Math.max(0.4, p.r * (p.kind === 'return' ? 1.6 : 1) * t);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    function draw(ctx) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var lanes = new Map();
      particles.forEach(function (p) {
        if (p.kind !== 'silk') return;
        var key = p.key + ':' + p.lane;
        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push(p);
      });
      lanes.forEach(function (nodes) {
        if (nodes.length < 3) return;
        var left = [], right = [];
        for (var n = 0; n < nodes.length; n++) {
          var p = nodes[n], before = nodes[Math.max(0, n - 1)], after = nodes[Math.min(nodes.length - 1, n + 1)];
          var len = Math.hypot(after.x - before.x, after.y - before.y) || 1;
          var nx = -(after.y - before.y) / len, ny = (after.x - before.x) / len;
          var width = p.r * Math.sin(Math.PI * p.age / p.life);
          left.push({ x: p.x + nx * width, y: p.y + ny * width });
          right.push({ x: p.x - nx * width, y: p.y - ny * width });
        }
        function curve(points) {
          for (var n = 1; n < points.length; n++) {
            var prev = points[n - 1], next = points[n];
            ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + next.x) / 2, (prev.y + next.y) / 2);
          }
          var end = points[points.length - 1]; ctx.lineTo(end.x, end.y);
        }
        var color = nodes[0].color, opacity = Math.min(0.8, nodes[0].mass);
        ctx.fillStyle = rgba(color, opacity * 0.65);
        ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y); curve(left);
        right.reverse(); ctx.lineTo(right[0].x, right[0].y); curve(right); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(color, opacity * 0.85); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y); curve(left); ctx.stroke();
      });
      particles.forEach(function (p) {
        if (p.kind === 'silk') return;
        var u = p.age / p.life, fade = Math.min(1, p.age * 8) * Math.pow(1 - u, 0.65);
        var alpha = Math.min(1, p.mass * 1.65) * fade;
        var r = p.r * (0.65 + Math.min(1, p.age * 1.5) * 0.5);
        if (p.effect.trail) trail(ctx, p, alpha);
        ctx.save(); ctx.translate(p.x, p.y);
        if (p.kind === 'rings') {
          r *= 0.45 + p.age * 0.42;
          ctx.rotate(Math.atan2(p.dy, p.dx) + Math.PI / 2);
          var layers = [[13, 0.07], [7, 0.18], [3.5, 0.38], [1.4, 0.25]];
          layers.forEach(function (layer) {
            ctx.lineWidth = layer[0] * (0.8 + u);
            ctx.strokeStyle = rgba(p.color, alpha * layer[1]);
            ctx.beginPath(); ctx.ellipse(0, 0, r, r * (0.4 + u * 0.14), Math.sin(p.angle) * 0.12, 0, TAU); ctx.stroke();
          });
          for (var k = 0; k < 20; k++) {
            var a = k * TAU / 20 + p.angle * 0.3;
            var ripple = 1 + Math.sin(a * 3 + p.age * 1.4) * u * 0.1;
            mist(ctx, Math.cos(a) * r * ripple, Math.sin(a) * r * 0.45 * ripple, r * 0.24, p.color, alpha * 0.4);
          }
        } else if (p.kind === 'bubbles' || p.kind === 'pearls') {
          var g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r);
          if (p.kind === 'pearls') {
            g.addColorStop(0, rgba('#b7c8ce', alpha)); g.addColorStop(0.14, rgba('#768a8d', alpha));
            g.addColorStop(0.4, rgba('#263336', alpha)); g.addColorStop(0.8, rgba('#0d191b', alpha));
            g.addColorStop(1, rgba('#718584', alpha * 0.8));
          } else {
            g.addColorStop(0, rgba(p.color, alpha * 0.02)); g.addColorStop(0.82, rgba(p.color, alpha * 0.07));
            g.addColorStop(0.96, rgba(p.color, alpha * 0.5)); g.addColorStop(1, rgba(p.color, 0));
          }
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          if (p.kind === 'bubbles') p.colors.forEach(function (c, i) {
            ctx.strokeStyle = rgba(c, alpha * 0.85); ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.94, i * TAU / 3 + p.angle, (i + 0.7) * TAU / 3 + p.angle); ctx.stroke();
          });
          ctx.strokeStyle = rgba('#f0e5ce', alpha * 0.8); ctx.lineWidth = Math.max(1, r * 0.075);
          ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 3.6, 4.65); ctx.stroke();
        } else if (p.kind === 'sparks') {
          mist(ctx, 0, 0, r * 3, p.color, alpha * 0.22);
          ctx.fillStyle = rgba(u < 0.25 ? '#f5dfac' : p.color, alpha);
          ctx.beginPath(); ctx.arc(0, 0, Math.max(0.5, r * (1 - u)), 0, TAU); ctx.fill();
        } else if (p.kind === 'pixels') {
          var size = Math.max(2, Math.round(r));
          ctx.fillStyle = rgba(p.color, alpha * 0.5); ctx.fillRect(-size, -size, size * 2, size * 2);
          ctx.fillStyle = rgba(p.color, alpha * 0.4); ctx.fillRect(-size, -size, size * 2, 2);
        } else if (p.kind === 'return') {
          mist(ctx, 0, 0, r * Math.sin(u * Math.PI), p.color, alpha * 0.4);
        } else if (p.kind === 'lanterns') {
          ctx.rotate(p.angle); ctx.scale(0.8 + Math.sin(u * Math.PI) * 0.5, 1);
          var glow = ctx.createRadialGradient(0, r * 0.3, 0, 0, 0, r * 1.4);
          glow.addColorStop(0, rgba('#f0bf65', alpha * 0.8)); glow.addColorStop(0.5, rgba(p.color, alpha * 0.25)); glow.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = glow; ctx.beginPath();
          ctx.moveTo(-r * 0.7, r * 0.6); ctx.bezierCurveTo(-r * 1.2, -r, r * 1.2, -r, r * 0.7, r * 0.6); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgba(p.color, alpha * 0.7); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.6); ctx.quadraticCurveTo(0, -r * 1.8, r * 0.7, r * 0.6); ctx.stroke();
          mist(ctx, 0, r * 0.35, r * 0.22, '#f4d790', alpha);
        } else if (p.kind === 'garden') {
          ctx.rotate(p.angle * 0.15);
          var grow = Math.min(1, p.age / 1.7), length = r * (0.6 + grow);
          for (var branch = 0; branch < 7; branch++) {
            var a = branch * TAU / 7 + hash(p.id + branch) * 0.24;
            var x = 0, y = 0;
            ctx.strokeStyle = rgba(p.colors[branch % p.colors.length], alpha * 0.8); ctx.lineWidth = 3.4 * (1 - u) + 0.7;
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (var k = 1; k <= 5; k++) {
              a += (hash(p.id * 11 + branch * 6 + k) - 0.5) * 1.1;
              x += Math.cos(a) * length / 5; y += Math.sin(a) * length / 5;
              ctx.lineTo(x, y);
              if (k > 1) {
                ctx.moveTo(x + Math.cos(a + 0.7) * length * 0.15, y + Math.sin(a + 0.7) * length * 0.15);
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke(); mist(ctx, x, y, r * 0.36, p.color, alpha * 0.5);
          }
        } else if (p.kind === 'storm') {
          for (var cloud = 0; cloud < 7; cloud++) {
            var a = cloud * TAU / 7, size = r * (0.65 + hash(p.id + cloud) * 0.35);
            mist(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.3, size, p.colors[1], alpha * 0.65);
          }
          // A slow rise and fall lights the veins; there is no full-screen flash.
          var light = Math.pow(Math.max(0, Math.sin(u * Math.PI)), 4);
          for (var branch = 0; branch < 3; branch++) {
            var angle = branch * TAU / 3 + p.seed * TAU;
            ctx.strokeStyle = rgba(p.colors[0], alpha * light); ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (var k = 1; k <= 5; k++) {
              var len = k * r * 0.17, jog = (hash(p.id + branch * 5 + k) - 0.5) * r * 0.3;
              ctx.lineTo(Math.cos(angle) * len - Math.sin(angle) * jog, Math.sin(angle) * len + Math.cos(angle) * jog);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      });
      ctx.restore();
    }
    return { emit: emit, step: step, draw: draw, clear: clear,
      stats: function () { return { particles: particles.length, limit: limit, sources: sources.size }; } };
  }
  root.SmokeEffects = { version: 1, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
