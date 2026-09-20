  /* ---- Sky slimes: warm clay meteor guests for the bathhouse ----
     Bulk motion is a hard elastic circle with swept-size substeps. The
     outline and eye have their own damped springs, so a bounce stays crisp
     without ever feeding render deformation back into collision energy.
     These are guests, independent of the parked underground NPC brains. */
  var skySlimes = [];
  var skySlimeNext = 7;
  var skySlimeSerial = 1;
  var skySlimeDust = [];
  var SKY_SLIME_MAX = 8;
  var SKY_SLIME_GRAVITY = 480;
  var SKY_SLIME_RAMP = ['#563b32', '#82503b', '#af754c', '#cf9f78', '#e0bd8e', '#ede0c0'];

  function skySlimeClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function skySlimeFresh(x, y) {
    var seed = Math.random();
    return {
      id: skySlimeSerial++, x: x, y: y, vx: 0, vy: 0,
      r: 22 + Math.random() * 5, oval: 0.94 + Math.random() * 0.12,
      eyeSize: 0.32 + Math.random() * 0.1, seed: seed,
      age: 0, bounces: 0, wet: 0, settled: false, entry: 1,
      bounce: 0.79 + Math.random() * 0.035,
      angle: (Math.random() - 0.5) * 0.24, spin: (Math.random() - 0.5) * 1.5,
      squash: 0, squashV: 0, eye: 0.85, eyeV: 0,
      pupilX: 0, pupilY: 0, pupilVX: 0, pupilVY: 0,
      visit: 'land', visitT: 0, hopIn: 1, wanderDir: Math.random() < 0.5 ? -1 : 1,
      blink: 0, blinkIn: 1.4 + Math.random() * 2.8,
      _trail: [], _trailT: 0, _liquidT: 0, _wetTarget: 0,
      _ground: false, _impactT: 0, _sleepT: 0
    };
  }

  function skySlimeSpawn(x, y) {
    if (skySlimes.length + (typeof bathGuests !== 'undefined' ? bathGuests.length : 0) +
        (typeof siphon !== 'undefined' && siphon.passenger ? 1 : 0) >= SKY_SLIME_MAX) return null;
    var automatic = !isFinite(x);
    var landX = automatic ? (typeof skySlimeLandingX === 'function' ? skySlimeLandingX() :
      (DECK_LEFT_COL - 18) * TILE) : x;
    landX = skySlimeClamp(landX, TILE * 3, (COLS - 3) * TILE);
    var sx = automatic ? landX + 105 + Math.random() * 55 : landX;
    var sy = isFinite(y) ? y : SKY_ROWS * TILE - 380 - Math.random() * 90;
    var s = skySlimeFresh(sx, sy);
    s.vy = 125 + Math.random() * 32;
    // A diagonal arrival is legible against the vertical town silhouettes.
    var fallTime = (Math.sqrt(s.vy * s.vy + 2 * SKY_SLIME_GRAVITY *
      Math.max(40, SKY_ROWS * TILE - s.r - sy)) - s.vy) / SKY_SLIME_GRAVITY;
    s.vx = automatic ? (landX - sx) / Math.max(0.4, fallTime) : (Math.random() - 0.5) * 95;
    skySlimes.push(s);
    return s;
  }

  function skySlimeReset() {
    skySlimes.length = 0;
    skySlimeDust.length = 0;
    skySlimeNext = 7;
    skySlimeSerial = 1;
  }

  function skySlimeRecord(s) {
    var out = {};
    // Identity and the visit state travel with a carried guest.
    Object.keys(s).forEach(function (key) {
      if (key.charAt(0) !== '_' && key !== 'pearlProgress' && key !== 'gardenLot' && s[key] !== undefined) out[key] = s[key];
    });
    return JSON.parse(JSON.stringify(out));
  }

  function skySlimeSave() {
    return { next: skySlimeNext, serial: skySlimeSerial, slimes: skySlimes.map(skySlimeRecord) };
  }

  function skySlimeHydrate(data) {
    if (!data || !isFinite(data.x) || !isFinite(data.y)) return null;
    var s = skySlimeFresh(data.x, data.y);
    Object.keys(data).forEach(function (key) {
      if (key.charAt(0) !== '_' && key !== '__proto__' && key !== 'constructor') s[key] = data[key];
    });
    s.r = skySlimeClamp(isFinite(s.r) ? s.r : 25, 22, 27);
    s.vx = skySlimeClamp(isFinite(s.vx) ? s.vx : 0, -700, 700);
    s.vy = skySlimeClamp(isFinite(s.vy) ? s.vy : 0, -700, 700);
    s.oval = skySlimeClamp(isFinite(s.oval) ? s.oval : 1, 0.94, 1.06);
    s.eyeSize = skySlimeClamp(isFinite(s.eyeSize) ? s.eyeSize : 0.38, 0.32, 0.42);
    s.id = Math.max(1, Math.floor(isFinite(s.id) ? s.id : skySlimeSerial++));
    skySlimeSerial = Math.max(skySlimeSerial, s.id + 1);
    delete s.pearlProgress; delete s.gardenLot;
    if (['land', 'wander', 'seek', 'depart', 'inside'].indexOf(s.visit) < 0) s.visit = 'land';
    return s;
  }

  function skySlimeRestore(data) {
    skySlimes.length = 0;
    skySlimeDust.length = 0;
    skySlimeSerial = data && isFinite(data.serial) ? Math.max(1, data.serial) : 1;
    skySlimeNext = data && isFinite(data.next) ? skySlimeClamp(data.next, 3, 100) : 7;
    var list = Array.isArray(data) ? data : data && data.slimes;
    if (!Array.isArray(list)) return;
    for (var i = 0; i < Math.min(SKY_SLIME_MAX, list.length); i++) {
      var s = skySlimeHydrate(list[i]);
      if (s) skySlimes.push(s);
    }
  }

  function skySlimeCapture(x, y, radius) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < skySlimes.length; i++) {
      var s = skySlimes[i], dx = s.x - x, dy = s.y - y, d = dx * dx + dy * dy;
      if (s.age < 1.5 || s.entry > 0.12 || Math.hypot(s.vx, s.vy) > 95 ||
          (!s._ground && !s.settled && s.wet < 0.18)) continue;
      if (typeof liquidLineClear === 'function' && !liquidLineClear(x, y, s.x, s.y)) continue;
      if (d < (radius + s.r) * (radius + s.r) && d < bestD) { best = i; bestD = d; }
    }
    if (best < 0) return null;
    return skySlimeRecord(skySlimes.splice(best, 1)[0]);
  }

  function skySlimeRelease(data, x, y, vx, vy) {
    if (skySlimes.length >= SKY_SLIME_MAX || !isFinite(x + y)) return null;
    var s = skySlimeHydrate(data || { x: x, y: y });
    if (!s) return null;
    s.x = skySlimeClamp(x, s.r + 1, COLS * TILE - s.r - 1);
    s.y = y;
    // A full-size guest cannot spawn inside the nozzle's supporting ledge.
    // Find clearance above the intended release, preserving horizontal aim.
    for (var k = 0; k < 14 && solidAt(s.x - s.r, s.y - s.r,
      s.r * 2, s.r * 2); k++) s.y -= 8;
    s.vx = skySlimeClamp(isFinite(vx) ? vx : 70, -280, 280);
    s.vy = skySlimeClamp(isFinite(vy) ? vy : -110, -280, 280);
    s.age = Math.max(3, s.age);
    s.entry = 0; s.settled = false; s.bounces = 0;
    s.squash = -0.1; s.squashV = 1.6;
    skySlimes.push(s);
    return s;
  }

  function skySlimeImpact(s, nx, ny, speed) {
    if (speed < 25 || s._impactT > 0) return;
    s._impactT = 0.065;
    s.bounces++;
    s.squashV += Math.min(11, speed * 0.014);
    s.pupilVX += nx * Math.min(50, speed * 0.1);
    s.pupilVY += ny * Math.min(70, speed * 0.13);
    s.blink = Math.max(s.blink, 0.09 + s.seed * 0.045);
    s.entry *= 0.12;
    if (speed < 75 || s.wet > 0.28) return;
    var count = Math.min(11, 3 + Math.floor(speed / 70));
    for (var i = 0; i < count; i++) {
      if (skySlimeDust.length >= 90) skySlimeDust.shift();
      var tangent = (Math.random() - 0.5) * speed * 0.33;
      var lift = 15 + Math.random() * Math.min(95, speed * 0.2);
      skySlimeDust.push({ x: s.x - nx * s.r, y: s.y - ny * s.r,
        vx: -ny * tangent + nx * lift, vy: nx * tangent + ny * lift,
        life: 0.34 + Math.random() * 0.26, max: 0.6, r: 0.9 + Math.random() * 1.6 });
    }
  }

  function skySlimeTerrain(s) {
    s._ground = false;
    // Two projection sweeps resolve adjoining floor/wall corners without
    // the diagonal drift that a tile-center repulsion creates on flat soil.
    for (var pass = 0; pass < 2; pass++) {
      var c0 = Math.floor((s.x - s.r) / TILE), c1 = Math.floor((s.x + s.r) / TILE);
      var r0 = Math.floor((s.y - s.r) / TILE), r1 = Math.floor((s.y + s.r) / TILE);
      for (var rr = r0; rr <= r1; rr++) for (var cc = c0; cc <= c1; cc++) {
        var tile = tileAt(rr, cc);
        if (!tile || (tile !== 'wall' && tile.type === 'jello')) continue;
        var qx = skySlimeClamp(s.x, cc * TILE, (cc + 1) * TILE);
        var qy = skySlimeClamp(s.y, rr * TILE, (rr + 1) * TILE);
        var dx = s.x - qx, dy = s.y - qy, d2 = dx * dx + dy * dy;
        if (d2 >= s.r * s.r) continue;
        var nx, ny, overlap;
        if (d2 > 0.000001) {
          var dist = Math.sqrt(d2); nx = dx / dist; ny = dy / dist; overlap = s.r - dist;
        } else {
          // Only restores/spawning can start with the center inside a tile.
          var left = s.x - cc * TILE, right = (cc + 1) * TILE - s.x;
          var top = s.y - rr * TILE, bottom = (rr + 1) * TILE - s.y;
          var nearest = Math.min(left, right, top, bottom);
          nx = nearest === left ? -1 : nearest === right ? 1 : 0;
          ny = nx ? 0 : nearest === top ? -1 : 1;
          overlap = s.r + nearest;
        }
        s.x += nx * (overlap + 0.006); s.y += ny * (overlap + 0.006);
        if (ny < -0.6) s._ground = true;
        var vn = s.vx * nx + s.vy * ny;
        if (vn < 0) {
          var restitution = -vn < 34 ? 0 : Math.max(0.54, s.bounce - Math.min(0.2, s.bounces * 0.027));
          if (s.wet > 0.12) restitution *= 1 - Math.min(0.65, s.wet * 0.65);
          s.vx -= (1 + restitution) * vn * nx;
          s.vy -= (1 + restitution) * vn * ny;
          if (ny < -0.6) {
            s.vx *= -vn > 34 ? 0.84 : 0.96;
            s.spin = s.vx / Math.max(1, s.r) * 0.36;
          }
          skySlimeImpact(s, nx, ny, -vn);
        }
      }
    }
    // The separation skin can exceed a very small high-refresh gravity
    // step. Keep foot support through that gap, so rest/capture never
    // alternates on successive frames at 120 Hz and above.
    if (!s._ground && s.vy >= 0 && s.vy < 12) {
      var foot = tileAt(Math.floor((s.y + s.r + 0.08) / TILE), Math.floor(s.x / TILE));
      if (foot && (foot === 'wall' || foot.type !== 'jello')) s._ground = true;
    }
  }

  function skySlimeBodies() {
    for (var i = 0; i < skySlimes.length; i++) for (var j = i + 1; j < skySlimes.length; j++) {
      var a = skySlimes[i], b = skySlimes[j], dx = b.x - a.x, dy = b.y - a.y;
      var min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      var d = Math.sqrt(d2), nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
      var invA = 1 / (a.r * a.r), invB = 1 / (b.r * b.r), sum = invA + invB;
      var overlap = min - d + 0.01;
      a.x -= nx * overlap * invA / sum; a.y -= ny * overlap * invA / sum;
      b.x += nx * overlap * invB / sum; b.y += ny * overlap * invB / sum;
      var relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        var impulse = -(1 + (relative < -34 ? 0.71 : 0)) * relative / sum;
        a.vx -= nx * impulse * invA; a.vy -= ny * impulse * invA;
        b.vx += nx * impulse * invB; b.vy += ny * impulse * invB;
        skySlimeImpact(a, -nx, -ny, -relative * 0.6);
        skySlimeImpact(b, nx, ny, -relative * 0.6);
      }
      a.settled = b.settled = false;
    }
  }

  function skySlimeExpression(s, h) {
    var danger = 0;
    if (s.vy > 70) {
      var reach = s.r + s.vy * (0.13 + s.seed * 0.065);
      var px = s.x + s.vx * 0.12;
      for (var probe = s.r; probe < reach; probe += TILE * 0.5) {
        if (tileAt(Math.floor((s.y + probe) / TILE), Math.floor(px / TILE))) { danger = 1; break; }
      }
    }
    s.blinkIn -= h;
    if (s.blinkIn <= 0) {
      s.blink = 0.1 + Math.random() * 0.065;
      s.blinkIn = 2 + Math.random() * 4.4;
    }
    s.blink = Math.max(0, s.blink - h);
    var eyeTarget = s.blink > 0 ? 0.08 : danger ? 0.17 + s.seed * 0.1 :
      s.wet > 0.18 ? 0.65 + 0.05 * Math.sin(s.age * 0.9 + s.seed * 8) :
      s.settled ? 0.7 : 0.87 + Math.sin(s.age * 1.7 + s.seed * 11) * 0.045;
    s.eyeV += ((eyeTarget - s.eye) * 150 - s.eyeV * 18) * h;
    s.eye = skySlimeClamp(s.eye + s.eyeV * h, 0.07, 1.05);
    var tx = Math.sin(s.age * 0.85 + s.seed * 23) * 1.8 - s.vx * 0.008;
    var ty = s.vy * 0.005 + Math.sin(s.age * 1.3 + s.seed * 17) * 0.55;
    if (typeof player !== 'undefined' && Math.abs(player.x - s.x) < TILE * 6 && s.settled) {
      tx = skySlimeClamp((player.x + PLAYER_W * 0.5 - s.x) * 0.035, -3.5, 3.5);
      ty = skySlimeClamp((player.y + PLAYER_H * 0.5 - s.y) * 0.035, -2, 2.5);
    }
    s.pupilVX += ((tx - s.pupilX) * 92 - s.pupilVX * 9) * h;
    s.pupilVY += ((ty - s.pupilY) * 92 - s.pupilVY * 9) * h;
    s.pupilX = skySlimeClamp(s.pupilX + s.pupilVX * h, -5, 5);
    s.pupilY = skySlimeClamp(s.pupilY + s.pupilVY * h, -5, 5);
    s.squashV += (-s.squash * 255 - s.squashV * 13) * h;
    s.squash = skySlimeClamp(s.squash + s.squashV * h, -0.13, 0.24);
  }

  function skySlimeLandingX() {
    if (typeof bathPickSite === 'function' && bathPickSite()) {
      // Land on the dry approach within sight of the tower. Natural ponds
      // remain water sources, not construction lots.
      var door = (banyaDoorX0 + banyaDoorX1) * 0.5;
      for (var k = 0; k < 16; k++) {
        var x = door - TILE * (3 + Math.random() * 7);
        if (tileAt(SKY_ROWS, Math.floor(x / TILE))) return x;
      }
      return door - TILE * 2;
    }
    return (DECK_LEFT_COL - 5) * TILE;
  }

  function skySlimeVisitTick(dt) {
    if (typeof ENABLE_BATH === 'undefined' || !ENABLE_BATH || !bathPickSite()) return;
    var door = (banyaDoorX0 + banyaDoorX1) * 0.5;
    for (var i = skySlimes.length - 1; i >= 0; i--) {
      var s = skySlimes[i];
      s.visitT += dt; s.hopIn -= dt;
      if (s.visit === 'land') {
        if (s.age > 4 && s.entry < 0.05 && (s.settled || s.wet > 0.18)) {
          s.visit = 'wander'; s.visitT = 0; s.hopIn = 0.6;
        }
        continue;
      }
      if (s.visit === 'wander' && s.visitT > 7 + s.seed * 6) {
        s.visit = 'seek'; s.visitT = 0;
      }
      if (s.visit === 'depart' && (s.visitT > 14 || Math.abs(s.x - s.departX) > TILE * 9)) {
        skySlimes.splice(i, 1); continue;
      }
      if (s.visit === 'seek' && Math.abs(s.x - door) < 30 &&
          s.y + s.r > SKY_ROWS * TILE - 20 && s.y < SKY_ROWS * TILE + 18) {
        if (bathGuestAccept(s)) { skySlimes.splice(i, 1); continue; }
        // A full room leaves newcomers waiting outside, keeping every
        // visitor visible and preserving the population cap.
        s.vx *= Math.exp(-6 * dt);
        continue;
      }
      if (s.hopIn > 0 || (!s._ground && s.wet < 0.18)) continue;
      var dir = s.visit === 'depart' ? s.departDir : s.visit === 'seek' ? (door > s.x ? 1 : -1) : s.wanderDir;
      if (s.visit === 'wander') {
        if (Math.random() < 0.28 || Math.abs(s.x - door) > TILE * 12) s.wanderDir = door > s.x ? 1 : -1;
        dir = s.wanderDir;
      }
      var ahead = tileAt(Math.floor((s.y + s.r - 12) / TILE), Math.floor((s.x + dir * (s.r + 20)) / TILE));
      s.vx = dir * (s.visit === 'wander' ? 56 : 96);
      s.vy = ahead ? -235 : s.wet > 0.18 ? -145 : -170;
      s.squashV = -2; s._ground = false; s.settled = false;
      s.hopIn = s.wet > 0.18 ? 0.6 : 0.9 + s.seed * 0.35;
    }
  }

  function skySlimeTick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    // A deep mining trip never fills the surface with unseen arrivals.
    var indoor = typeof bathGuests !== 'undefined' ? bathGuests.length : 0;
    var carried = typeof siphon !== 'undefined' && siphon && siphon.passenger ? 1 : 0;
    if (player && player.y < (SKY_ROWS + 6) * TILE && skySlimes.length + carried + indoor < SKY_SLIME_MAX) {
      skySlimeNext -= dt;
      if (skySlimeNext <= 0) { skySlimeSpawn(); skySlimeNext = 28 + Math.random() * 18; }
    }
    skySlimeVisitTick(dt);
    for (var di = skySlimeDust.length - 1; di >= 0; di--) {
      var dust = skySlimeDust[di]; dust.life -= dt;
      if (dust.life <= 0) { skySlimeDust.splice(di, 1); continue; }
      dust.vy += 160 * dt; dust.x += dust.vx * dt; dust.y += dust.vy * dt;
    }
    var steps = Math.max(1, Math.ceil(dt * 180)), h = dt / steps;
    for (var i = 0; i < skySlimes.length; i++) {
      var s = skySlimes[i];
      s._liquidT -= dt;
      if (s._liquidT <= 0 && typeof liquidSampleCircle === 'function') {
        s._liquidT = 0.1;
        // Water is displaced from the collision disk. Sample its surrounding
        // annulus and normalize that area, so buoyancy remains after contact.
        var sample = liquidSampleCircle(s.x, s.y, s.r * 1.45);
        s._wetTarget = sample ? skySlimeClamp(sample.wet * 1.7, 0, 1) : 0;
        s.liquidType = sample ? sample.type : 0;
        if (s._wetTarget > 0.12 && s.wet < 0.07 && s.vy > 85 &&
            typeof liquidToolImpulse === 'function') {
          liquidToolImpulse(s.x, s.y + s.r * 0.3, s.r * 1.9, s.vx * 0.28, -Math.min(190, s.vy * 0.43));
          s.squashV += Math.min(4, s.vy * 0.008);
        }
      }
      s._trailT += dt;
      if (s.entry > 0.025 && s._trailT > 0.018) {
        s._trailT = 0;
        s._trail.push({ x: s.x, y: s.y, life: 0.5, r: s.r * (0.7 + s.entry * 0.1) });
        if (s._trail.length > 26) s._trail.shift();
      }
      for (var ti = s._trail.length - 1; ti >= 0; ti--) {
        s._trail[ti].life -= dt;
        if (s._trail[ti].life <= 0) s._trail.splice(ti, 1);
      }
    }
    for (var step = 0; step < steps; step++) {
      for (var si = 0; si < skySlimes.length; si++) {
        var b = skySlimes[si];
        b.age += h; b._impactT = Math.max(0, b._impactT - h);
        b.wet += (b._wetTarget - b.wet) * Math.min(1, h * 8);
        b.entry = Math.max(0, b.entry - h * (b.bounces ? 0.8 : 0.035));
        b.vy += SKY_SLIME_GRAVITY * (1 - Math.min(1.2, b.wet * 1.95)) * h;
        var drag = Math.exp(-(0.025 + b.wet * 3.2) * h);
        b.vx *= drag; b.vy *= drag;
        b.vy = skySlimeClamp(b.vy, -700, 660);
        b.vx = skySlimeClamp(b.vx, -550, 550);
        b.x += b.vx * h; b.y += b.vy * h;
        skySlimeTerrain(b);
        if (b._ground && Math.abs(b.vy) < 12) {
          b.vx *= Math.exp(-8 * h);
          if (Math.abs(b.vx) < 0.4) b.vx = 0;
        }
        b.settled = (b._ground || b.wet > 0.18) && Math.hypot(b.vx, b.vy) < 22;
        b.angle += b.spin * h;
        b.spin *= Math.exp(-(b._ground ? 5 : b.wet > 0.18 ? 3 : 0.5) * h);
        skySlimeExpression(b, h);
      }
      skySlimeBodies();
    }
  }

  function skySlimePath(s, rx, ry) {
    ctx.beginPath();
    var count = 44;
    for (var i = 0; i <= count; i++) {
      var a = i / count * Math.PI * 2;
      var wobble = 1 + Math.sin(a * 3 + s.seed * 23) * 0.022 + Math.sin(a * 5 + s.seed * 11) * 0.011;
      var x = Math.cos(a) * rx * wobble, y = Math.sin(a) * ry * wobble;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function skySlimeDrawBody(s) {
    var stretch = Math.min(0.09, Math.abs(s.vy) / 7000);
    var rx = s.r * s.oval * (1 + s.squash - stretch);
    var ry = s.r / s.oval * (1 - s.squash + stretch);
    ctx.save();
    // Contact squash is pinned at the floor, rather than floating upward.
    ctx.translate(s.x, s.y + (s._ground ? s.r - ry : 0));
    ctx.rotate(Math.sin(s.angle) * 0.15);
    skySlimePath(s, rx, ry);
    ctx.fillStyle = SKY_SLIME_RAMP[1]; ctx.fill();
    ctx.save(); ctx.clip();
    var body = ctx.createLinearGradient(-rx * 0.75, -ry, rx * 0.6, ry);
    body.addColorStop(0, SKY_SLIME_RAMP[4]); body.addColorStop(0.22, SKY_SLIME_RAMP[3]);
    body.addColorStop(0.58, SKY_SLIME_RAMP[2]); body.addColorStop(1, SKY_SLIME_RAMP[1]);
    ctx.fillStyle = body; ctx.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
    // Broad off-center sheen and sparse pores keep the clay tangible.
    ctx.globalAlpha = 0.27; ctx.fillStyle = SKY_SLIME_RAMP[5];
    ctx.beginPath(); ctx.ellipse(-rx * 0.32, -ry * 0.5, rx * 0.32, ry * 0.11, -0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.28; ctx.fillStyle = SKY_SLIME_RAMP[0];
    for (var p = 0; p < 7; p++) {
      var a = s.seed * 29 + p * 2.39996, dist = 0.53 + (p % 3) * 0.11;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * rx * dist, Math.sin(a) * ry * dist,
        0.75 + p % 2 * 0.35, 0.55, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    skySlimePath(s, rx, ry); ctx.strokeStyle = SKY_SLIME_RAMP[0]; ctx.lineWidth = 1.15; ctx.stroke();
    if (s.entry > 0.08) {
      ctx.globalAlpha = s.entry * 0.48;
      ctx.strokeStyle = SKY_SLIME_RAMP[5]; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.99, ry * 0.99, 0, 0.06, Math.PI * 0.96); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // One large, independently sprung googly eye. The socket barely turns
    // with the body, while the loose pupil keeps the sense of weight.
    var ex = -rx * 0.055, ey = -ry * 0.08, er = s.r * s.eyeSize;
    ctx.fillStyle = SKY_SLIME_RAMP[0];
    ctx.beginPath(); ctx.ellipse(ex + 0.6, ey + 1.4, er + 1.5, er + 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKY_SLIME_RAMP[3];
    ctx.beginPath(); ctx.ellipse(ex, ey, er + 1.1, er + 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(ex, ey, er, Math.max(0.65, er * s.eye), 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#ede0c0'; ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
    ctx.fillStyle = '#cbb994';
    ctx.beginPath(); ctx.ellipse(ex + 1.2, ey + er * 0.73, er, er * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    var px = ex + skySlimeClamp(s.pupilX, -er * 0.32, er * 0.32);
    var py = ey + skySlimeClamp(s.pupilY, -er * 0.32, er * 0.32);
    ctx.fillStyle = '#563b32'; ctx.beginPath(); ctx.arc(px, py, er * 0.49, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#282b25'; ctx.beginPath(); ctx.arc(px + 0.2, py + 0.35, er * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5f1ea'; ctx.beginPath(); ctx.arc(px - er * 0.13, py - er * 0.18, er * 0.115, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = SKY_SLIME_RAMP[0]; ctx.lineWidth = 0.85;
    ctx.beginPath(); ctx.ellipse(ex, ey, er, Math.max(0.65, er * s.eye), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function skySlimeDraw() {
    ctx.save();
    for (var i = 0; i < skySlimes.length; i++) {
      var s = skySlimes[i];
      if (!isFinite(s.x + s.y) || s.x + 120 < cam.x || s.x - 120 > cam.x + screenW ||
          s.y + 70 < cam.y || s.y - 250 > cam.y + screenH) continue;
      if (s.wet < 0.18) {
        var shadowRow = Math.floor((s.y + s.r + 0.1) / TILE), shadowCol = Math.floor(s.x / TILE);
        for (var sh = 0; sh < 9; sh++) {
          if (tileAt(shadowRow + sh, shadowCol)) {
            var floorY = (shadowRow + sh) * TILE;
            var shadowNear = 1 - skySlimeClamp((floorY - s.y - s.r) / 230, 0, 1);
            ctx.globalAlpha = shadowNear * 0.24;
            ctx.fillStyle = '#282b25'; ctx.beginPath();
            ctx.ellipse(s.x, floorY + 0.6, s.r * (0.45 + shadowNear * 0.42),
              1.4 + shadowNear * 1.1, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; break;
          }
        }
      }
      var trail = s._trail;
      // Fill each wake once. Overlapping translucent line caps produce a
      // string of visible beads, especially against the pale daytime sky.
      if (trail.length > 1) {
        var first = trail[0], last = trail[trail.length - 1];
        for (var layer = 0; layer < 2; layer++) {
          ctx.filter = layer ? 'blur(0.6px)' : 'blur(2.8px)';
          var wake = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
          wake.addColorStop(0, layer ? 'rgba(237,224,192,0)' : 'rgba(207,159,120,0)');
          wake.addColorStop(0.45, layer ? 'rgba(223,194,136,0.10)' : 'rgba(207,159,120,0.08)');
          wake.addColorStop(1, layer ? 'rgba(237,224,192,0.50)' : 'rgba(207,159,120,0.31)');
          ctx.fillStyle = wake; ctx.beginPath();
          for (var edge = 0; edge < 2; edge++) {
            for (var wt = 0; wt < trail.length; wt++) {
              var t = edge ? trail.length - 1 - wt : wt;
              var point = trail[t], before = trail[Math.max(0, t - 1)], after = trail[Math.min(trail.length - 1, t + 1)];
              var dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx, dy) || 1;
              var fade = skySlimeClamp(point.life / 0.5, 0, 1);
              var width = point.r * (layer ? 0.22 : 1.03) * fade *
                (1 + Math.sin(t * 0.65 + s.seed * 13) * 0.09) * (edge ? -1 : 1);
              var wx = point.x - dy / length * width, wy = point.y + dx / length * width;
              if (!edge && wt === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
            }
          }
          ctx.closePath(); ctx.fill();
        }
        ctx.filter = 'none';
      }
      ctx.globalAlpha = 1;
      skySlimeDrawBody(s);
    }
    for (var di = 0; di < skySlimeDust.length; di++) {
      var dust = skySlimeDust[di];
      ctx.globalAlpha = Math.min(0.65, dust.life / dust.max);
      ctx.fillStyle = SKY_SLIME_RAMP[3];
      ctx.fillRect(dust.x - dust.r, dust.y - dust.r, dust.r * 2, dust.r * 1.3);
    }
    ctx.restore();
  }
