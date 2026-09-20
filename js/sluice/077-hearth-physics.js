  /* ---- Fire room: bounded coal bodies and local heat, independent of the UI ---- */
  var HEARTH_STEP = 1 / 120, HEARTH_CAP = 18;
  var hearthBeds = { boiler: hearthMakeBed(false), forge: hearthMakeBed(true) };

  function hearthMakeBed(pilot) {
    return { chunks: [], sparks: [], pilot: !!pilot, nextId: 1, time: 0,
      heat: 0, power: 0, fuelSeconds: 0, air: 0, impact: 0, bank: 0, sparkId: 0 };
  }
  function hearthNumber(value, fallback, lo, hi) {
    return typeof value === 'number' && isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
  }
  function hearthSeed(id) {
    var n = Math.sin(id * 127.1 + 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function hearthAddChunk(kind, x, y) {
    var bed = hearthBeds[kind];
    if (!bed || bed.chunks.length >= HEARTH_CAP) return null;
    var id = bed.nextId++, seed = hearthSeed(id + (bed.pilot ? 193 : 0));
    var r = 13 + seed * 7;
    var b = { id: id, x: hearthNumber(x, 160, r, 320 - r),
      y: hearthNumber(y, 12, -80, 210 - r), vx: 0, vy: 0, r: r,
      angle: seed * Math.PI * 2, spin: 0, seed: seed,
      life: 48 + seed * 12, fuel: 1, heat: 0, lit: false, ash: false, held: false };
    bed.chunks.push(b); hearthMeasure(bed);
    return b;
  }
  function hearthRemoveChunk(kind, id) {
    var bed = hearthBeds[kind];
    if (!bed) return null;
    for (var i = 0; i < bed.chunks.length; i++) {
      if (bed.chunks[i].id !== id) continue;
      var b = bed.chunks.splice(i, 1)[0];
      b.held = false; hearthMeasure(bed); return b;
    }
    return null;
  }
  function hearthSparks(bed, x, y, count, strength) {
    for (var i = 0; i < count && bed.sparks.length < 64; i++) {
      var seed = hearthSeed(++bed.sparkId + 911);
      bed.sparks.push({ x: x, y: y, vx: (seed - 0.5) * 120 * strength,
        vy: -(45 + hearthSeed(bed.sparkId + 77) * 115) * strength,
        t: 0, life: 0.35 + seed * 0.7, r: 0.7 + seed * 1.1, heat: 1, seed: seed });
    }
  }
  function hearthLightChunk(bed, b) {
    if (b.ash || b.fuel <= 0 || b.held || b.lit) return false;
    b.lit = true; b.heat = Math.max(b.heat, 0.64);
    hearthSparks(bed, b.x, b.y - b.r * 0.6, 9, 1);
    return true;
  }
  function hearthIgnite(kind) {
    var bed = hearthBeds[kind], target = null;
    if (!bed) return false;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      if (b.held || b.ash || b.lit || b.fuel <= 0) continue;
      if (!target || b.y > target.y) target = b;
    }
    return target ? hearthLightChunk(bed, target) : false;
  }
  function hearthPump(kind) {
    var bed = hearthBeds[kind];
    if (!bed) return false;
    bed.air = Math.min(1, bed.air + 0.48);
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      if (b.lit && !b.held) hearthSparks(bed, b.x, b.y - b.r, 3, 1.2);
    }
    return true;
  }
  function hearthMeasure(bed) {
    var fuel = 0, output = 0;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      fuel += b.fuel * b.life;
      if (b.lit && !b.held) output += b.heat * Math.min(1, b.fuel * 12);
    }
    bed.fuelSeconds = fuel;
    // The forge concentrates one piece under the work. The wide boiler grate
    // needs three pieces for full output, or fewer with steady bellows work.
    bed.power = Math.min(1, output * (bed.pilot ? 0.80 + bed.air * 0.35 : 0.39 + bed.air * 0.19));
  }
  function hearthBounds(b, bed) {
    var hit = 0;
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) { hit = -b.vx; b.vx *= -0.12; } }
    if (b.x > 320 - b.r) { b.x = 320 - b.r; if (b.vx > 0) { hit = b.vx; b.vx *= -0.12; } }
    if (b.y > 210 - b.r) {
      b.y = 210 - b.r;
      if (b.vy > 0) { hit = Math.max(hit, b.vy); b.vy = b.vy > 45 ? -b.vy * 0.12 : 0; }
      b.vx *= 0.89; b.spin *= 0.88;
    }
    if (hit > 45) {
      bed.impact = Math.max(bed.impact, Math.min(1, hit / 360));
      if (b.lit) hearthSparks(bed, b.x, b.y, Math.min(5, Math.floor(hit / 70)), 0.7);
    }
  }
  function hearthContact(a, b, bed) {
    // Picking a piece up detaches it from the grate. Its stored bed coordinates
    // are only a cancellation bookmark, not an invisible support for the pile.
    if (a.held || b.held) return;
    var ia = 256 / (a.r * a.r), ib = 256 / (b.r * b.r);
    var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, ds = dx * dx + dy * dy;
    if (ds >= rr * rr) return;
    var d = Math.sqrt(ds), nx, ny;
    if (d < 0.00001) {
      var angle = hearthSeed(a.id * 31 + b.id * 17) * Math.PI * 2;
      nx = Math.cos(angle); ny = Math.sin(angle);
    } else { nx = dx / d; ny = dy / d; }
    var inv = ia + ib, correction = Math.max(0, rr - d - 0.015) * 0.87 / inv;
    a.x -= nx * correction * ia; a.y -= ny * correction * ia;
    b.x += nx * correction * ib; b.y += ny * correction * ib;
    var rvx = (b.held ? 0 : b.vx) - (a.held ? 0 : a.vx);
    var rvy = (b.held ? 0 : b.vy) - (a.held ? 0 : a.vy);
    var closing = rvx * nx + rvy * ny;
    if (closing >= 0) return;
    var impulse = -closing * (closing < -45 ? 1.10 : 1) / inv;
    a.vx -= nx * impulse * ia; a.vy -= ny * impulse * ia;
    b.vx += nx * impulse * ib; b.vy += ny * impulse * ib;
    var slip = -rvx * ny + rvy * nx;
    var friction = Math.max(-impulse * 0.38, Math.min(impulse * 0.38, -slip / inv));
    a.vx += ny * friction * ia; a.vy -= nx * friction * ia;
    b.vx -= ny * friction * ib; b.vy += nx * friction * ib;
    if (!a.held) a.spin = a.spin * 0.96 - friction * ia / a.r * 0.2;
    if (!b.held) b.spin = b.spin * 0.96 - friction * ib / b.r * 0.2;
    if (closing < -60) {
      bed.impact = Math.max(bed.impact, Math.min(1, -closing / 360));
      if (a.lit || b.lit) hearthSparks(bed, a.x + nx * a.r, a.y + ny * a.r, 2, 0.7);
    }
  }
  function hearthStepBed(bed) {
    var h = HEARTH_STEP, bodies = bed.chunks, i, j, b;
    bed.time += h; bed.air *= Math.exp(-h / 2.7); bed.impact *= Math.exp(-h * 7);
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.held) continue;
      b.vx = hearthNumber(b.vx, 0, -600, 600) * 0.999;
      b.vy = hearthNumber(b.vy, 0, -600, 600) + 520 * h;
      b.spin = hearthNumber(b.spin, 0, -12, 12) * 0.995;
      b.x += b.vx * h; b.y += b.vy * h; b.angle += b.spin * h;
      hearthBounds(b, bed);
    }
    // Contacts correct position without turning overlap into kinetic energy.
    // Eight bounded passes also untangle a load dropped directly onto a pile.
    for (var pass = 0; pass < 8; pass++) {
      for (i = 0; i < bodies.length; i++) {
        for (j = i + 1; j < bodies.length; j++) hearthContact(bodies[i], bodies[j], bed);
      }
      for (i = 0; i < bodies.length; i++) if (!bodies[i].held) hearthBounds(bodies[i], bed);
    }
    // Compute heating from one snapshot so array order cannot accelerate a fire.
    var targets = [];
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      var target = 0, response = 0.36;
      if (!b.held && !b.ash) {
        if (b.lit) { target = 0.90 + bed.air * 0.10; response = 1.8; }
        else {
          if (bed.pilot && b.y + b.r >= 194) { target = 0.86; response = 0.85; }
          for (j = 0; j < bodies.length; j++) {
            var other = bodies[j];
            if (j === i || !other.lit || other.held) continue;
            var dx = other.x - b.x, dy = other.y - b.y;
            var gap = Math.sqrt(dx * dx + dy * dy) - b.r - other.r;
            if (gap >= 26) continue;
            var local = other.heat * (1 - Math.max(0, gap) / 45);
            if (local > target) { target = local; response = 0.65 + bed.air * 0.4; }
          }
        }
      }
      targets.push([target, response]);
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.heat += (targets[i][0] - b.heat) * (1 - Math.exp(-targets[i][1] * h));
      if (b.held) continue;
      if (!b.ash && !b.lit && b.heat >= 0.68) hearthLightChunk(bed, b);
      if (!b.lit) continue;
      b.fuel = Math.max(0, b.fuel - h * (1 + bed.air * 0.85) / b.life);
      if (b.fuel <= 0) { b.fuel = 0; b.lit = false; b.ash = true; }
    }
    hearthMeasure(bed);
    bed.heat += (bed.power - bed.heat) * (1 - Math.exp(-h / (bed.power > bed.heat ? 2.6 : 9)));
    for (i = bed.sparks.length - 1; i >= 0; i--) {
      var s = bed.sparks[i];
      s.t += h;
      if (s.t >= s.life) { bed.sparks.splice(i, 1); continue; }
      s.vx *= 0.993; s.vy -= 12 * h;
      s.x += s.vx * h; s.y += s.vy * h; s.heat = 1 - s.t / s.life;
    }
  }
  function hearthTick(dt) {
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    // A suspended tab never retroactively burns its fuel or tunnels through a wall.
    dt = Math.min(dt, 0.25);
    var kinds = ['boiler', 'forge'];
    for (var k = 0; k < kinds.length; k++) {
      var bed = hearthBeds[kinds[k]];
      bed.bank = Math.min(0.25, bed.bank + dt);
      while (bed.bank + 1e-10 >= HEARTH_STEP) {
        hearthStepBed(bed); bed.bank = Math.max(0, bed.bank - HEARTH_STEP);
      }
    }
  }
  function hearthSave() {
    var result = { version: 1 }, kinds = ['boiler', 'forge'];
    for (var k = 0; k < kinds.length; k++) {
      var bed = hearthBeds[kinds[k]], chunks = [];
      for (var i = 0; i < bed.chunks.length; i++) {
        var b = bed.chunks[i];
        chunks.push({ id: b.id, x: b.x, y: b.y, vx: b.held ? 0 : b.vx, vy: b.held ? 0 : b.vy,
          r: b.r, angle: b.angle, spin: b.held ? 0 : b.spin, seed: b.seed,
          life: b.life, fuel: b.fuel, heat: b.heat, lit: b.lit, ash: b.ash });
      }
      result[kinds[k]] = { chunks: chunks, nextId: bed.nextId, time: bed.time,
        heat: bed.heat, air: bed.air };
    }
    return result;
  }
  function hearthRestore(data) {
    hearthReset();
    if (!data || typeof data !== 'object') return false;
    var kinds = ['boiler', 'forge'], restored = false;
    for (var k = 0; k < kinds.length; k++) {
      var src = data[kinds[k]], bed = hearthBeds[kinds[k]];
      if (!src || typeof src !== 'object' || !Array.isArray(src.chunks)) continue;
      restored = true;
      bed.time = hearthNumber(src.time, 0, 0, 1e9);
      bed.heat = hearthNumber(src.heat, 0, 0, 1); bed.air = hearthNumber(src.air, 0, 0, 1);
      var used = {};
      for (var i = 0; i < Math.min(HEARTH_CAP, src.chunks.length); i++) {
        var raw = src.chunks[i];
        if (!raw || typeof raw !== 'object') continue;
        var b = hearthAddChunk(kinds[k], raw.x, raw.y);
        var id = Math.floor(hearthNumber(raw.id, b.id, 1, 1e9));
        while (used[id]) id++;
        used[id] = true; b.id = id; bed.nextId = Math.max(bed.nextId, id + 1);
        b.seed = hearthNumber(raw.seed, b.seed, 0, 1);
        b.r = hearthNumber(raw.r, b.r, 13, 20);
        b.x = hearthNumber(raw.x, 160, b.r, 320 - b.r);
        b.y = hearthNumber(raw.y, 12, -80, 210 - b.r);
        b.vx = hearthNumber(raw.vx, 0, -600, 600); b.vy = hearthNumber(raw.vy, 0, -600, 600);
        b.angle = hearthNumber(raw.angle, 0, -1e6, 1e6); b.spin = hearthNumber(raw.spin, 0, -12, 12);
        b.life = hearthNumber(raw.life, 48 + b.seed * 12, 48, 60);
        b.fuel = hearthNumber(raw.fuel, 1, 0, 1); b.heat = hearthNumber(raw.heat, 0, 0, 1);
        b.ash = raw.ash === true || b.fuel <= 0;
        if (b.ash) b.fuel = 0;
        b.lit = raw.lit === true && !b.ash;
        b.held = false;
      }
      bed.nextId = Math.max(bed.nextId, Math.floor(hearthNumber(src.nextId, bed.nextId, 1, 1e9)));
      hearthMeasure(bed);
    }
    return restored;
  }
  function hearthReset() {
    hearthBeds.boiler = hearthMakeBed(false); hearthBeds.forge = hearthMakeBed(true);
  }
