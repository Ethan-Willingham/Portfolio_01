  /* ---- Sky slimes: rock-crusted rubber-ball guests for the bathhouse ----
     Bulk motion is a hard elastic circle with swept-size substeps. The
     outline and eye have their own damped springs, so a bounce stays crisp
     without ever feeding render deformation back into collision energy.
     These are guests, independent of the parked underground NPC brains. */
  var skySlimes = [];
  var skySlimeNext = 7;
  var skySlimeSerial = 1;
  var skySlimeDust = [];
  var SKY_SLIME_MAX = 8;
  // More inertia against the rig, but slower ballistic arcs. Mass and
  // gravity are separate: these guests resist a shove without falling faster.
  var SKY_SLIME_GRAVITY = 300;
  var SKY_SLIME_MASS = 2.5; // radius-25 guest; the rig has mass 6
  // Shared warm stone ramp from PIXEL_ART.md.
  var SKY_SLIME_RAMP = ['#252320', '#3e3830', '#5a5248', '#7a706a', '#9e9488', '#c0b8b0'];
  var skySlimeRigLast = null;
  // Low, sloped shoulders follow the compact rig's hull. The same convex
  // shape is used on land and in flight, so contact height controls a shot.
  var SKY_SLIME_RIG_HULL = [0.40,0.18, 0.60,0.18, 1.25,0.80,
    0.94,0.98, 0.06,0.98, -0.25,0.80];
  var SKY_SLIME_RIG_RESTITUTION = 0.90;
  var SKY_SLIME_RIG_SIDE_RESTITUTION = 0.10;
  var SKY_SLIME_RIG_SIDE_YIELD = 130;
  var SKY_SLIME_RIG_FRICTION = 0.04;

  function skySlimeClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function skySlimeFresh(x, y) {
    var seed = Math.random();
    return {
      id: skySlimeSerial++, x: x, y: y, vx: 0, vy: 0,
      r: 22 + Math.random() * 5, oval: 1,
      eyeSize: 0.40 + Math.random() * 0.025, seed: seed,
      age: 0, bounces: 0, wet: 0, settled: false, entry: 1,
      bounce: 0.86 + Math.random() * 0.015,
      angle: (Math.random() - 0.5) * 0.24, spin: (Math.random() - 0.5) * 1.5,
      squash: 0, squashV: 0, eye: 0.85, eyeV: 0,
      pupilX: 0, pupilY: 0, pupilVX: 0, pupilVY: 0,
      visit: 'land', visitT: 0, hopIn: 1, wanderDir: Math.random() < 0.5 ? -1 : 1,
      glanceIn: 3 + seed * 5, glanceT: 0,
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
    skySlimeRigLast = null;
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
    s.oval = 1;
    s.bounce = s.bounce >= 0.86 ? skySlimeClamp(s.bounce, 0.86, 0.875) : 0.86 + s.seed * 0.015;
    s.eyeSize = skySlimeClamp(isFinite(s.eyeSize) ? s.eyeSize : 0.41, 0.40, 0.425);
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
    s._impactNX = nx; s._impactNY = ny;
    s.squashV += Math.min(4.2, speed * 0.007);
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
          var soft = tile !== 'wall' && (tile.type === 'dirt' || tile.type === 'sand');
          // A given surface keeps its restitution. Energy decays by e^2
          // each bounce; the material never gets less springy with age.
          var restitution = -vn < 18 ? 0 : s.bounce * (soft ? 0.88 : 1);
          var normalDV = -(1 + restitution) * vn;
          s.vx += normalDV * nx; s.vy += normalDV * ny;
          // Coulomb contact friction transfers slide into spin, conserving
          // the sphere's rolling inertia (I = 2/5 mr^2).
          var tx = -ny, ty = nx;
          var slip = s.vx * tx + s.vy * ty - s.spin * s.r;
          var friction = skySlimeClamp(-slip / 3.5, -normalDV * 0.17, normalDV * 0.17);
          s.vx += friction * tx; s.vy += friction * ty;
          s.spin -= friction / (0.4 * s.r);
          if (ny < -0.6) s._rollingDrag = soft ? 36 : 22;
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
        var impulse = -(1 + (relative < -18 ? 0.84 : 0)) * relative / sum;
        a.vx -= nx * impulse * invA; a.vy -= ny * impulse * invA;
        b.vx += nx * impulse * invB; b.vy += ny * impulse * invB;
        if (a.playing || b.playing) { skySlimePlayContact(a); skySlimePlayContact(b); }
        skySlimeImpact(a, -nx, -ny, -relative * 0.6);
        skySlimeImpact(b, nx, ny, -relative * 0.6);
      }
      a.settled = b.settled = false;
    }
  }

  function skySlimeExpression(s, h) {
    // A loose black disk inside a white plastic eye, not a flesh eyelid.
    // The disk lags changes in body velocity and rebounds off its cup.
    s.glanceIn = (isFinite(s.glanceIn) ? s.glanceIn : 4) - h;
    s.glanceT = Math.max(0, (s.glanceT || 0) - h);
    var near = typeof player !== 'undefined' && Math.hypot(player.x - s.x, player.y - s.y) < TILE * 6;
    if (s.glanceIn <= 0) {
      s.glanceIn = 5 + Math.random() * 7;
      if (near && s.settled && Math.random() < 0.45) s.glanceT = 0.7 + Math.random() * 0.7;
    }
    var ax = isFinite(s._eyeVX) ? (s.vx - s._eyeVX) / h : 0;
    var ay = isFinite(s._eyeVY) ? (s.vy - s._eyeVY) / h : 0;
    s._eyeVX = s.vx; s._eyeVY = s.vy;
    s.pupilVX += -skySlimeClamp(ax, -4000, 4000) * 0.04 * h;
    s.pupilVY += (28 - skySlimeClamp(ay, -4000, 4000) * 0.04) * h;
    if (s.glanceT > 0 && near) {
      var dx = player.x + PLAYER_W / 2 - s.x, dy = player.y + PLAYER_H / 2 - s.y;
      var len = Math.max(1, Math.hypot(dx, dy));
      s.pupilVX += (dx / len * 3 - s.pupilX) * 65 * h;
      s.pupilVY += (dy / len * 3 - s.pupilY) * 65 * h;
    }
    var drag = Math.exp(-2.4 * h);
    s.pupilVX *= drag; s.pupilVY *= drag;
    s.pupilX += s.pupilVX * h; s.pupilY += s.pupilVY * h;
    var limit = s.r * s.eyeSize * 0.47, len = Math.hypot(s.pupilX, s.pupilY);
    if (len > limit) {
      var nx = s.pupilX / len, ny = s.pupilY / len;
      s.pupilX = nx * limit; s.pupilY = ny * limit;
      var speed = s.pupilVX * nx + s.pupilVY * ny;
      if (speed > 0) { s.pupilVX -= 1.62 * speed * nx; s.pupilVY -= 1.62 * speed * ny; }
    }
    s.squashV += (-s.squash * 390 - s.squashV * 19) * h;
    s.squash = skySlimeClamp(s.squash + s.squashV * h, -0.055, 0.115);
  }

  function skySlimePlayContact(s) {
    s.playing = true; s.playRest = 0;
    s._interactT = 2.5; s.hopIn = Math.max(s.hopIn, 1.5);
  }

  function skySlimePlayer(s, rx, ry, rvx, rvy) {
    if (typeof bathMode !== 'undefined' && bathMode) return;
    if (s.x + s.r < rx - 6 || s.x - s.r > rx + PLAYER_W + 6 ||
        s.y + s.r < ry || s.y - s.r > ry + PLAYER_H + 1) return;
    // Closest point on the convex hull gives both separation and impulse
    // direction. Its lower shoulders meet a grounded ball below its center.
    // No minimum pop, target velocity, aiming, or airborne-only impulse.
    var hull = SKY_SLIME_RIG_HULL, best = Infinity, inside = true;
    var dx = 0, dy = 0, faceX = 0, faceY = 0;
    for (var i = 0; i < hull.length; i += 2) {
      var j = (i + 2) % hull.length;
      var ax = rx + hull[i] * PLAYER_W, ay = ry + hull[i + 1] * PLAYER_H;
      var ex = (hull[j] - hull[i]) * PLAYER_W, ey = (hull[j + 1] - hull[i + 1]) * PLAYER_H;
      var px = s.x - ax, py = s.y - ay, edge2 = ex * ex + ey * ey;
      if (ex * py - ey * px < 0) inside = false;
      var t = skySlimeClamp((px * ex + py * ey) / edge2, 0, 1);
      var qx = px - ex * t, qy = py - ey * t, d2 = qx * qx + qy * qy;
      if (d2 < best) {
        best = d2; dx = qx; dy = qy;
        var edge = Math.sqrt(edge2); faceX = ey / edge; faceY = -ex / edge;
      }
    }
    var radius = s.r + 0.5, dist = Math.sqrt(best);
    if (!inside && dist >= radius) return;
    var nx = inside || dist < 0.001 ? faceX : dx / dist;
    var ny = inside || dist < 0.001 ? faceY : dy / dist;
    var depth = radius + (inside ? dist : -dist) + 0.006;
    s.x += nx * depth; s.y += ny * depth;
    var relative = (s.vx - rvx) * nx + (s.vy - rvy) * ny;
    if (relative >= 0) return;
    var mass = SKY_SLIME_MASS * s.r * s.r / 625, invMass = 1 / mass, invRig = 1 / 6;
    // The bumper yields under a hard sideways load. Gentle touches and
    // square roof/belly strikes keep their spring; fast glances lose rebound.
    // Smooth compression response keeps stronger hits stronger. It changes
    // only restitution, never the normal, free-flight speed, or shot direction.
    var vertical2 = ny * ny;
    var sideLoad = -relative * Math.abs(nx) / SKY_SLIME_RIG_SIDE_YIELD;
    var sideLoad2 = sideLoad * sideLoad, sideLoad4 = sideLoad2 * sideLoad2;
    var cushion = (1 - vertical2 * vertical2) * sideLoad4 / (1 + sideLoad4);
    var restitution = SKY_SLIME_RIG_RESTITUTION -
      (SKY_SLIME_RIG_RESTITUTION - SKY_SLIME_RIG_SIDE_RESTITUTION) * cushion;
    var impulse = -(1 + (relative < -18 ? restitution : 0)) * relative / (invMass + invRig);
    s.vx += impulse * nx * invMass; s.vy += impulse * ny * invMass;
    player.vx = (player.vx || 0) - impulse * nx * invRig;
    player.vy = (player.vy || 0) - impulse * ny * invRig;
    // A brush can roll the ball off the hull. Friction exchanges tangent
    // momentum and spin with the same 2/5 mr^2 inertia as ground contact.
    var tx = -ny, ty = nx;
    var slip = (s.vx - rvx) * tx + (s.vy - rvy) * ty - s.spin * s.r;
    var friction = skySlimeClamp(-slip / (3.5 * invMass + invRig),
      -impulse * SKY_SLIME_RIG_FRICTION, impulse * SKY_SLIME_RIG_FRICTION);
    s.vx += friction * tx * invMass; s.vy += friction * ty * invMass;
    s.spin -= friction / (0.4 * mass * s.r);
    player.vx -= friction * tx * invRig; player.vy -= friction * ty * invRig;
    if (s.playing || Math.hypot(rvx, rvy) > 8) skySlimePlayContact(s);
    else { s._interactT = 2.5; s.hopIn = Math.max(s.hopIn, 1.5); }
    s.settled = false;
    skySlimeImpact(s, nx, ny, -relative);
  }

  function skySlimeSubmerged(s, surface, bottom) {
    function below(line) {
      var h = skySlimeClamp((s.y - line) / s.r, -1, 1);
      return (Math.acos(-h) + h * Math.sqrt(Math.max(0, 1 - h * h))) / Math.PI;
    }
    return Math.max(0, below(surface) - below(bottom));
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
      s.hopIn -= dt;
      if (s.playing) {
        // Flight remains ballistic for as long as the player keeps it going.
        // Navigation resumes only after physical rest and stepping away.
        var resting = (s._ground || s.wet > 0.18) && Math.hypot(s.vx, s.vy) < 12;
        s.playRest = resting && !(s._interactT > 0) ? (s.playRest || 0) + dt : 0;
        var nearby = Math.hypot(player.x + PLAYER_W / 2 - s.x, player.y + PLAYER_H / 2 - s.y) < TILE * 5;
        if (s.playRest < 1.5 || nearby) continue;
        s.playing = false; s.playRest = 0; s.hopIn = 0.6;
      }
      s.visitT += dt;
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
          s.y + s.r > SKY_ROWS * TILE - 20 && s.y < SKY_ROWS * TILE + 18 &&
          Math.hypot(s.vx, s.vy) < 70 && !(s._interactT > 0)) {
        if (bathGuestAccept(s)) { skySlimes.splice(i, 1); continue; }
        // A full room leaves newcomers waiting outside, keeping every
        // visitor visible and preserving the population cap.
        s.vx *= Math.exp(-6 * dt);
        continue;
      }
      if (s.hopIn > 0 || s._interactT > 0) continue;
      if (s.wet < 0.18 && (!s._ground || Math.abs(s.vy) > 10 || Math.abs(s.vx) > 35)) continue;
      var dir = s.visit === 'depart' ? s.departDir : s.visit === 'seek' ? (door > s.x ? 1 : -1) : s.wanderDir;
      if (s.visit === 'wander') {
        if (Math.random() < 0.28 || Math.abs(s.x - door) > TILE * 12) s.wanderDir = door > s.x ? 1 : -1;
        dir = s.wanderDir;
      }
      var ahead = tileAt(Math.floor((s.y + s.r - 12) / TILE), Math.floor((s.x + dir * (s.r + 20)) / TILE));
      var shoreHop = s.wet > 0.18 && ahead && Math.abs(s.vy) < 30;
      if (s.wet > 0.18 && !shoreHop) {
        s.vx += skySlimeClamp(dir * 80 - s.vx, -65 * dt, 65 * dt);
        continue;
      }
      // Preserve navigation hop height/range as gravity changes, with a
      // slower cadence. This never runs while the player is juggling a guest.
      var hopScale = Math.sqrt(SKY_SLIME_GRAVITY / 480);
      s.vx = dir * (s.visit === 'wander' ? 56 : 96) * hopScale;
      var rigSpeed = skySlimeRigLast ? (player.x - skySlimeRigLast.x) / dt : (player.vx || 0);
      var parkedRig = Math.abs(rigSpeed) < 25 &&
        (player.x + PLAYER_W / 2 - s.x) * dir > 0 &&
        Math.abs(player.x + PLAYER_W / 2 - s.x) < s.r + TILE * 2 &&
        Math.abs(player.y + PLAYER_H - s.y - s.r) < TILE;
      s.vy = (shoreHop ? -310 : parkedRig ? -290 : ahead ? -235 : -170) * hopScale;
      s.squashV = -2; s._ground = false; s.settled = false;
      s.hopIn = 0.9 + s.seed * 0.35;
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
    var steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    var rigX = player.x, rigY = player.y;
    var previous = skySlimeRigLast || { x: rigX - (player.vx || 0) * dt, y: rigY - (player.vy || 0) * dt };
    if (Math.hypot(rigX - previous.x, rigY - previous.y) > Math.max(100, dt * 1000)) previous = { x: rigX, y: rigY };
    var rigVX = (rigX - previous.x) / dt, rigVY = (rigY - previous.y) / dt;
    var impulseVX = player.vx || 0, impulseVY = player.vy || 0;
    skySlimeRigLast = { x: rigX, y: rigY };
    for (var i = 0; i < skySlimes.length; i++) {
      var s = skySlimes[i];
      s._liquidT -= dt;
      if (s._liquidT <= 0) {
        s._liquidT = Math.hypot(s.vx, s.vy) > 120 ? 0 : 1 / 30;
        var sample = typeof liquidSampleBall === 'function' ? liquidSampleBall(s.x, s.y, s.r) : null;
        s._water = sample;
        if (!sample && typeof liquidSampleCircle === 'function') {
          var fallback = liquidSampleCircle(s.x, s.y, s.r * 1.45);
          s._wetTarget = fallback ? skySlimeClamp(fallback.wet * 1.7, 0, 1) : 0;
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
        b._interactT = Math.max(0, (b._interactT || 0) - h);
        var wetBefore = b.wet;
        b.wet = b._water ? skySlimeSubmerged(b, b._water.surface, b._water.bottom) : b._wetTarget;
        if (wetBefore < 0.04 && b.wet >= 0.04 && b.vy > 100 && !b._splashT && typeof liquidToolImpulse === 'function') {
          liquidToolImpulse(b.x, b.y + b.r * 0.65, b.r * 1.65, b.vx * 0.15, -Math.min(125, b.vy * 0.22));
          b._splashT = 0.4;
        }
        b._splashT = Math.max(0, (b._splashT || 0) - h);
        b.entry = Math.max(0, b.entry - h * (b.bounces ? 0.8 : 0.035));
        // Archimedes lift uses submerged area; drag is relative to the
        // surrounding water and grows with speed. A shallow puddle damps
        // the landing; deeper water arrests a plunge and lets the ball bob.
        b.vy += SKY_SLIME_GRAVITY * (1 - b.wet / 0.72) * h;
        // The GPU mirror includes the wake this very ball just produced.
        // Couple only the slow ambient current, not its own delayed impact
        // jet, which otherwise feeds energy back into repeated water hops.
        var flowBlend = 1 - Math.exp(-h / 0.18);
        b._flowX = (b._flowX || 0) + ((b._water ? skySlimeClamp(b._water.vx, -60, 60) : 0) - (b._flowX || 0)) * flowBlend;
        b._flowY = (b._flowY || 0) + ((b._water ? skySlimeClamp(b._water.vy, -30, 30) : 0) - (b._flowY || 0)) * flowBlend;
        var flowX = b._flowX, flowY = b._flowY;
        var relativeSpeed = Math.hypot(b.vx - flowX, b.vy - flowY);
        var drag = Math.exp(-0.008 * h) / (1 + b.wet * (4.5 + relativeSpeed * 0.018) * h);
        b.vx = flowX + (b.vx - flowX) * drag; b.vy = flowY + (b.vy - flowY) * drag;
        b.vy = skySlimeClamp(b.vy, -1000, 1000);
        b.vx = skySlimeClamp(b.vx, -1000, 1000);
        b.x += b.vx * h; b.y += b.vy * h;
        skySlimeTerrain(b);
        var kRig = (step + 1) / steps;
        skySlimePlayer(b, previous.x + (rigX - previous.x) * kRig, previous.y + (rigY - previous.y) * kRig,
          rigVX + (player.vx || 0) - impulseVX, rigVY + (player.vy || 0) - impulseVY);
        skySlimeTerrain(b);
        if (b._ground && Math.abs(b.vy) < 12) {
          var rolling = (b._rollingDrag || 22) * h;
          b.vx -= skySlimeClamp(b.vx, -rolling, rolling);
          b.spin = b.vx / b.r;
        }
        b.settled = (b._ground || b.wet > 0.18) && Math.hypot(b.vx, b.vy) < 22;
        b.angle += b.spin * h;
        b.spin *= Math.exp(-(b.wet * 2 + 0.015) * h);
        skySlimeExpression(b, h);
      }
      skySlimeBodies();
      for (var contact = 0; contact < skySlimes.length; contact++) skySlimeTerrain(skySlimes[contact]);
    }
  }

  function skySlimeCrust(s) {
    if (s._crust) return s._crust;
    // Bake each guest's crust once. A circular cutout contains broad broken
    // plates and chipped edges; the texture rolls with the collision body.
    var sprite = document.createElement('canvas'); sprite.width = sprite.height = 128;
    var c = sprite.getContext('2d'), r = 60;
    c.translate(64, 64);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
    c.fillStyle = SKY_SLIME_RAMP[1]; c.fillRect(-64, -64, 128, 128);
    var random = (Math.floor(s.seed * 2147483646) + 1) >>> 0;
    function next() { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; }
    var sites = [];
    for (var row = -2; row <= 2; row++) for (var col = -2; col <= 2; col++) {
      sites.push({ x: col * 30 + (next() - 0.5) * 22,
        y: row * 30 + (next() - 0.5) * 22 });
    }
    for (var i = 0; i < sites.length; i++) {
      var site = sites[i], points = [{x:-80,y:-80},{x:80,y:-80},{x:80,y:80},{x:-80,y:80}];
      // Intersect bisector half-planes to make uneven, fitted crust plates.
      // Independent seams avoid a regular wheel/spoke pattern around the eye.
      for (var k = 0; k < sites.length && points.length; k++) {
        if (k === i) continue;
        var other = sites[k], nx = other.x - site.x, ny = other.y - site.y;
        var edge = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
        var clipped = [];
        for (var j = 0; j < points.length; j++) {
          var a = points[j], b = points[(j + 1) % points.length];
          var da = a.x * nx + a.y * ny - edge, db = b.x * nx + b.y * ny - edge;
          if (da <= 0) clipped.push(a);
          if ((da < 0) !== (db < 0)) {
            var t = da / (da - db);
            clipped.push({x:a.x + (b.x - a.x) * t,y:a.y + (b.y - a.y) * t});
          }
        }
        points = clipped;
      }
      if (!points.length) continue;
      var tone = 2 + Math.floor(next() * 3);
      c.beginPath(); c.moveTo(points[0].x, points[0].y);
      for (var p = 1; p < points.length; p++) c.lineTo(points[p].x, points[p].y);
      c.closePath(); c.fillStyle = SKY_SLIME_RAMP[tone]; c.fill();
      c.strokeStyle = SKY_SLIME_RAMP[1]; c.lineWidth = 1.4; c.stroke();
      c.beginPath(); c.moveTo(points[0].x + 0.7, points[0].y - 0.7);
      c.lineTo(points[1].x + 0.7, points[1].y - 0.7);
      c.strokeStyle = SKY_SLIME_RAMP[Math.min(5, tone + 1)]; c.lineWidth = 0.9; c.stroke();
    }
    for (var f = 0; f < 27; f++) {
      var a = next() * Math.PI * 2, d = Math.sqrt(next()) * 58;
      var x = Math.cos(a) * d, y = Math.sin(a) * d, size = 1.5 + next() * 2.5;
      c.fillStyle = SKY_SLIME_RAMP[next() < 0.5 ? 2 : 5];
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + size, y - 1);
      c.lineTo(x + size * 0.6, y + size * 0.55); c.closePath(); c.fill();
    }
    s._crust = sprite; return sprite;
  }

  function skySlimeDrawBody(s) {
    var squash = skySlimeClamp(s.squash || 0, -0.055, 0.115);
    var angle = Math.atan2(s._impactNY === undefined ? -1 : s._impactNY, s._impactNX || 0) + Math.PI / 2;
    ctx.save();
    var support = s.r * Math.hypot((1 + squash) * Math.sin(angle), Math.cos(angle) / (1 + squash));
    ctx.translate(s.x, s.y + (s._ground ? s.r - support : 0));
    ctx.rotate(angle); ctx.scale(1 + squash, 1 / (1 + squash)); ctx.rotate(-angle);
    ctx.save(); ctx.rotate(s.angle);
    ctx.drawImage(skySlimeCrust(s), -s.r * 64 / 60, -s.r * 64 / 60, s.r * 128 / 60, s.r * 128 / 60);
    ctx.restore();
    // Lighting stays in world space while the crust rolls underneath it.
    var shade = ctx.createLinearGradient(-s.r * 0.7, -s.r, s.r * 0.7, s.r);
    shade.addColorStop(0, 'rgba(192,184,176,0.16)');
    shade.addColorStop(0.45, 'rgba(37,35,32,0)');
    shade.addColorStop(1, 'rgba(37,35,32,0.48)');
    ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2);
    ctx.fillStyle = shade; ctx.fill();
    ctx.strokeStyle = SKY_SLIME_RAMP[0]; ctx.lineWidth = 1; ctx.stroke();
    // Classic craft googly eye: white round cup, loose black disk. No iris,
    // fleshy socket, eyelid, or constant tracking of the player.
    var ex = -s.r * 0.055, ey = -s.r * 0.08, er = s.r * s.eyeSize;
    ctx.fillStyle = SKY_SLIME_RAMP[0];
    ctx.beginPath(); ctx.arc(ex + 0.5, ey + 0.9, er + 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c0b8b0';
    ctx.beginPath(); ctx.arc(ex, ey, er + 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5f1ea';
    ctx.beginPath(); ctx.arc(ex, ey, er - 0.25, 0, Math.PI * 2); ctx.fill();
    var px = s.pupilX || 0, py = s.pupilY || 0;
    var d = Math.hypot(px, py), limit = er * 0.47;
    if (d > limit) { px *= limit / d; py *= limit / d; }
    ctx.fillStyle = SKY_SLIME_RAMP[0];
    ctx.beginPath(); ctx.arc(ex + px, ey + py, er * 0.44, 0, Math.PI * 2); ctx.fill();
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
