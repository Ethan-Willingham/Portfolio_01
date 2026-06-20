
  // ====== AMBIENT BIRDS (tiny surface boids) ======
  //
  // Pooled flock system: up to BIRDS_MAX birds in BIRDS_FLOCKS flocks that
  // wheel around fixed roost points spread across the world surface. Classic
  // boids (separation + alignment + cohesion) plus a soft spring onto a
  // wheeling ring around the roost, so each flock loosely orbits its home
  // patch of sky. The rig is a predator: birds inside BIRDS_FLEE_R get a flee
  // force scaled by rig speed (strong when the rig is fast, mild when it just
  // hovers), and a sonic boom (player.fx.boomN, bumped by the transonic
  // ladder in 080) hard-scatters every active bird and spooks its flock for a
  // couple of seconds (no cohesion, raised speed cap), after which the flock
  // re-forms on its own.
  //
  // Perf model: a flock simulates only while the camera is horizontally
  // within ~BIRDS_ACTIVE_SCREENS screens of its roost AND part of the sky
  // band is on screen; otherwise the whole system early-outs at the top of
  // birdsUpdate. All state lives in preallocated arrays (one-time alloc on
  // first update), so steady state allocates nothing. Worst case is ~4 flocks
  // x 7 birds with O(n^2) separation inside each flock (~84 pairs total),
  // comfortably under the 0.3 ms budget.
  //
  // Hooks: birdsUpdate(dt) from the 350 main loop (next to audioUpdate) and
  // birdsDraw() from the 140 world-entities region. birdsDraw runs with the
  // world transform active, so it draws in world px and the birds correctly
  // sit in front of the sky/mountains and behind the smoke trail + rig.

  // ----- Tunables -----
  var BIRDS_MAX = 28;             // hard pool cap (BIRDS_FLOCKS * BIRDS_PER_FLOCK)
  var BIRDS_FLOCKS = 4;           // max simultaneously active flocks
  var BIRDS_PER_FLOCK = 7;        // birds per flock slot (live count is 5 to 7 per roost)
  var BIRDS_BAND_TILES = 25;      // flight band height above the surface line, in tiles
  var BIRDS_ROOST_MAX = 40;       // roost table cap (4 towns x 2 + ~19 spaced fits easily)
  var BIRDS_ROOST_STEP_MIN = 140; // min spacing between open-country roosts, in tiles
  var BIRDS_ROOST_STEP_VAR = 60;  // extra hash-jittered spacing on top of the min, in tiles
  var BIRDS_ACTIVE_SCREENS = 1.5; // activation range from camera center, in screens (horizontal)
  var BIRDS_RING_R = 86;          // wheeling ring radius around the roost, px
  var BIRDS_RING_K = 1.6;         // spring strength pulling birds onto the ring
  var BIRDS_TANG_F = 26;          // tangential push that keeps the wheel circulating
  var BIRDS_SEP_R = 14;           // separation radius, px
  var BIRDS_SEP_F = 90;           // separation strength at full overlap, px/s^2
  var BIRDS_ALI_F = 1.4;          // alignment pull toward the flock mean velocity, 1/s
  var BIRDS_COH_F = 0.5;          // cohesion pull toward the flock centroid, 1/s^2
  var BIRDS_BOB_F = 30;           // vertical bobbing acceleration amplitude, px/s^2
  var BIRDS_BOB_HZ = 2.2;         // vertical bobbing angular rate, rad/s
  var BIRDS_SPD_MIN = 60;         // min cruise speed, px/s (birds never hover)
  var BIRDS_SPD_MAX = 110;        // max cruise speed, px/s (the rig always reads faster)
  var BIRDS_SPD_SPOOK = 175;      // raised speed cap while spooked or actively fleeing
  var BIRDS_FLEE_R = 150;         // predator (rig) flee radius, px
  var BIRDS_FLEE_F = 520;         // flee acceleration at full rig speed, px/s^2
  var BIRDS_BOOM_IMP = 260;       // hard scatter impulse on a sonic boom, px/s
  var BIRDS_SPOOK_T = 2.5;        // seconds a boom keeps a flock spooked (no cohesion)
  var BIRDS_FLAP_HZ = 5;          // 2-frame wing flap alternation rate, flips/s
  var BIRDS_SCAN_T = 0.35;        // seconds between roost activation scans

  // ----- State (preallocated on first update; no steady-state allocs) -----
  var birdsInited = false;
  var birdsRoostN = 0;
  var birdsRoostX = null;         // Float64Array(BIRDS_ROOST_MAX), world px
  var birdsRoostY = null;
  var birdsX = null, birdsY = null, birdsVX = null, birdsVY = null; // Float64Array(BIRDS_MAX)
  var birdsPh = null;             // per-bird flap phase accumulator
  var birdsFActive = [];          // per-flock: simulating right now
  var birdsFRoost = [];           // per-flock: index into the roost table (-1 = none)
  var birdsFCount = [];           // per-flock: live bird count (5 to 7)
  var birdsFSpook = [];           // per-flock: seconds of spook remaining
  var birdsFDir = [];             // per-flock: wheel direction (+1 / -1)
  var birdsScanT = 0;             // countdown to the next activation scan
  var birdsT = 0;                 // accumulated sim time (drives bobbing)
  var birdsLastBoomN = 0;         // last seen player.fx.boomN (diffed for scatters)

  // ----- Helpers -----
  // Cheap deterministic hash in [0,1), keyed on an integer. Keeps roost
  // placement and per-bird jitter stable across sessions without RNG state.
  function birdsHash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // One-time lazy init: allocate the pools and seed the roost table. Towns
  // get two roosts each (one either side of center, where the player lingers)
  // and the open country gets one every BIRDS_ROOST_STEP_MIN..+VAR tiles.
  function birdsInit() {
    birdsInited = true;
    birdsRoostX = new Float64Array(BIRDS_ROOST_MAX);
    birdsRoostY = new Float64Array(BIRDS_ROOST_MAX);
    birdsX = new Float64Array(BIRDS_MAX);
    birdsY = new Float64Array(BIRDS_MAX);
    birdsVX = new Float64Array(BIRDS_MAX);
    birdsVY = new Float64Array(BIRDS_MAX);
    birdsPh = new Float64Array(BIRDS_MAX);
    var surfY = SKY_ROWS * TILE;
    var n = 0;
    // Town-biased roosts (guarded; town helpers live in 015-regions.js)
    if (typeof townCenterCol === 'function' && typeof TOWN_DEPTHS !== 'undefined') {
      // SINGLE_TOWN has only town 0 in REGIONS; townCenterCol(1..3) would fall
      // back to the same deck and pile roosts on one spot, so iterate real towns.
      var _townN = SINGLE_TOWN ? 1 : TOWN_DEPTHS.length;
      for (var ti = 0; ti < _townN && n < BIRDS_ROOST_MAX - 1; ti++) {
        var cc = townCenterCol(ti);
        var side = 26 + birdsHash(ti * 7 + 1) * 22;     // 26 to 48 tiles off center
        birdsRoostX[n] = (cc - side) * TILE;
        birdsRoostY[n] = surfY - TILE * (9 + birdsHash(ti * 7 + 2) * 8);
        n++;
        birdsRoostX[n] = (cc + side * 0.8) * TILE;
        birdsRoostY[n] = surfY - TILE * (8 + birdsHash(ti * 7 + 3) * 9);
        n++;
      }
    }
    // Spaced open-country roosts across the whole surface, deterministic
    // from world column so every session agrees on where the birds live.
    var c = 70 + ((birdsHash(991) * 60) | 0);
    while (c < COLS - 70 && n < BIRDS_ROOST_MAX) {
      birdsRoostX[n] = c * TILE;
      birdsRoostY[n] = surfY - TILE * (8 + birdsHash(c) * 9);
      n++;
      c += BIRDS_ROOST_STEP_MIN + ((birdsHash(c * 3 + 5) * BIRDS_ROOST_STEP_VAR) | 0);
    }
    birdsRoostN = n;
    for (var f = 0; f < BIRDS_FLOCKS; f++) {
      birdsFActive[f] = false;
      birdsFRoost[f] = -1;
      birdsFCount[f] = BIRDS_PER_FLOCK;
      birdsFSpook[f] = 0;
      birdsFDir[f] = 1;
    }
    birdsLastBoomN = (player && player.fx && typeof player.fx.boomN === 'number') ? player.fx.boomN : 0;
  }

  // Spawn flock slot f wheeling around roost r: birds placed around the ring
  // with tangential velocity so the wheel is already turning on arrival.
  function birdsFlockSpawn(f, r) {
    birdsFActive[f] = true;
    birdsFRoost[f] = r;
    birdsFSpook[f] = 0;
    birdsFDir[f] = (birdsHash(r * 13 + 3) < 0.5) ? -1 : 1;
    birdsFCount[f] = 5 + ((birdsHash(r * 13 + 4) * 3) | 0); // 5 to 7
    var base = f * BIRDS_PER_FLOCK;
    var rx = birdsRoostX[r], ry = birdsRoostY[r];
    for (var i = 0; i < birdsFCount[f]; i++) {
      var b = base + i;
      var a = (i / birdsFCount[f]) * Math.PI * 2 + birdsHash(r * 31 + i) * 0.9;
      var rad = BIRDS_RING_R * (0.7 + birdsHash(r * 37 + i) * 0.6);
      birdsX[b] = rx + Math.cos(a) * rad;
      birdsY[b] = ry + Math.sin(a) * rad;
      var spd = BIRDS_SPD_MIN + birdsHash(r * 41 + i) * (BIRDS_SPD_MAX - BIRDS_SPD_MIN);
      birdsVX[b] = -Math.sin(a) * spd * birdsFDir[f];
      birdsVY[b] = Math.cos(a) * spd * birdsFDir[f];
      birdsPh[b] = birdsHash(r * 43 + i) * 2;
    }
  }

  // Activation scan (throttled): drop flocks whose roost left the active
  // range (with a hysteresis pad so the boundary doesn't thrash) and fill
  // free flock slots from unassigned in-range roosts.
  function birdsScan() {
    var camCX = cam.x + screenW * 0.5;
    var range = screenW * BIRDS_ACTIVE_SCREENS;
    var f, r;
    for (f = 0; f < BIRDS_FLOCKS; f++) {
      if (birdsFActive[f] && Math.abs(birdsRoostX[birdsFRoost[f]] - camCX) > range + screenW * 0.25) {
        birdsFActive[f] = false;
        birdsFRoost[f] = -1;
      }
    }
    for (r = 0; r < birdsRoostN; r++) {
      if (Math.abs(birdsRoostX[r] - camCX) > range) continue;
      var taken = false;
      for (f = 0; f < BIRDS_FLOCKS; f++) { if (birdsFActive[f] && birdsFRoost[f] === r) { taken = true; break; } }
      if (taken) continue;
      var free = -1;
      for (f = 0; f < BIRDS_FLOCKS; f++) { if (!birdsFActive[f]) { free = f; break; } }
      if (free < 0) break;
      birdsFlockSpawn(free, r);
    }
  }

  // ----- Per-frame update (called from the 350 loop) -----
  function birdsUpdate(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;                  // clamp tab-back dt spikes
    var surfY = SKY_ROWS * TILE;
    if (cam.y >= surfY) return;                // sky band off screen: zero cost
    if (!birdsInited) birdsInit();
    if (!birdsRoostN) return;
    birdsT += dt;
    birdsScanT -= dt;
    if (birdsScanT <= 0) { birdsScanT = BIRDS_SCAN_T; birdsScan(); }

    // Predator inputs: rig center, rig speed, and the sonic-boom diff.
    var px = player.x + PLAYER_W * 0.5;
    var py = player.y + PLAYER_H * 0.5;
    var rigSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    var fleeScale = 0.25 + 0.75 * Math.min(1, rigSpd / 420);
    var boomed = false;
    var bn = (player.fx && typeof player.fx.boomN === 'number') ? player.fx.boomN : birdsLastBoomN;
    if (bn !== birdsLastBoomN) { birdsLastBoomN = bn; boomed = true; }

    var bandTop = surfY - BIRDS_BAND_TILES * TILE;
    var bandBot = surfY - TILE * 1.2;          // stay a hair above the grass line
    var fleeR2 = BIRDS_FLEE_R * BIRDS_FLEE_R;
    var sepR2 = BIRDS_SEP_R * BIRDS_SEP_R;

    for (var f = 0; f < BIRDS_FLOCKS; f++) {
      if (!birdsFActive[f]) continue;
      var n = birdsFCount[f];
      var base = f * BIRDS_PER_FLOCK;
      if (boomed) birdsFSpook[f] = BIRDS_SPOOK_T;
      else if (birdsFSpook[f] > 0) { birdsFSpook[f] -= dt; if (birdsFSpook[f] < 0) birdsFSpook[f] = 0; }
      var spooked = birdsFSpook[f] > 0;

      // Flock centroid + mean velocity in one pass (cohesion + alignment)
      var cxs = 0, cys = 0, mvx = 0, mvy = 0;
      for (var k = 0; k < n; k++) {
        var bk = base + k;
        cxs += birdsX[bk]; cys += birdsY[bk];
        mvx += birdsVX[bk]; mvy += birdsVY[bk];
      }
      var inv = 1 / n;
      cxs *= inv; cys *= inv; mvx *= inv; mvy *= inv;

      var rx = birdsRoostX[birdsFRoost[f]];
      var ry = birdsRoostY[birdsFRoost[f]];
      var dir = birdsFDir[f];
      var ringW = spooked ? 0.15 : 1;          // spooked flocks mostly ignore home

      for (var i = 0; i < n; i++) {
        var b = base + i;
        var x = birdsX[b], y = birdsY[b];
        var ax = 0, ay = 0;

        // Separation (pairwise inside the flock; n <= 7, ~21 pairs)
        for (var j = 0; j < n; j++) {
          if (j === i) continue;
          var ox = x - birdsX[base + j], oy = y - birdsY[base + j];
          var od2 = ox * ox + oy * oy;
          if (od2 < sepR2 && od2 > 0.0001) {
            var od = Math.sqrt(od2);
            var push = (BIRDS_SEP_R - od) / BIRDS_SEP_R * BIRDS_SEP_F / od;
            ax += ox * push; ay += oy * push;
          }
        }

        // Alignment toward the flock mean velocity
        ax += (mvx - birdsVX[b]) * BIRDS_ALI_F;
        ay += (mvy - birdsVY[b]) * BIRDS_ALI_F;

        // Cohesion toward the centroid (off while spooked; flocks re-form after)
        if (!spooked) {
          ax += (cxs - x) * BIRDS_COH_F;
          ay += (cys - y) * BIRDS_COH_F;
        }

        // Soft spring onto the roost wheeling ring + tangential circulation
        var dxr = x - rx, dyr = y - ry;
        var dr = Math.sqrt(dxr * dxr + dyr * dyr) + 0.0001;
        var ringPull = (dr - BIRDS_RING_R) * BIRDS_RING_K * ringW / dr;
        ax += -dxr * ringPull + (-dyr / dr) * dir * BIRDS_TANG_F;
        ay += -dyr * ringPull + (dxr / dr) * dir * BIRDS_TANG_F;

        // Gentle vertical bob, per-bird phase
        ay += Math.sin(birdsT * BIRDS_BOB_HZ + b * 1.7) * BIRDS_BOB_F;

        // Flee the rig inside the predator radius, scaled by rig speed
        var fxd = x - px, fyd = y - py;
        var fd2 = fxd * fxd + fyd * fyd;
        var fleeing = fd2 < fleeR2;
        if (fleeing && fd2 > 0.0001) {
          var fd = Math.sqrt(fd2);
          var fw = (1 - fd / BIRDS_FLEE_R) * BIRDS_FLEE_F * fleeScale / fd;
          ax += fxd * fw; ay += fyd * fw;
        }

        var vx = birdsVX[b] + ax * dt;
        var vy = birdsVY[b] + ay * dt;

        // Sonic boom: hard scatter impulse straight away from the rig,
        // with a slight upward bias so the flock breaks skyward.
        if (boomed) {
          var sd = Math.sqrt(fd2) + 0.0001;
          vx += (fxd / sd) * BIRDS_BOOM_IMP;
          vy += (fyd / sd) * BIRDS_BOOM_IMP - 40;
        }

        // Speed clamp: never hover, never outrun the rig
        var capS = (spooked || fleeing) ? BIRDS_SPD_SPOOK : BIRDS_SPD_MAX;
        var s2 = vx * vx + vy * vy;
        if (s2 > capS * capS) {
          var s = Math.sqrt(s2);
          vx *= capS / s; vy *= capS / s;
        } else if (s2 < BIRDS_SPD_MIN * BIRDS_SPD_MIN && s2 > 0.0001) {
          var s3 = Math.sqrt(s2);
          vx *= BIRDS_SPD_MIN / s3; vy *= BIRDS_SPD_MIN / s3;
        }

        x += vx * dt;
        y += vy * dt;

        // Keep birds inside the surface flight band (soft bounce), and off
        // the ocean edges of the world.
        if (y > bandBot) { y = bandBot; if (vy > 0) vy = -vy * 0.5; }
        else if (y < bandTop) { y = bandTop; if (vy < 0) vy = -vy * 0.5; }
        if (x < TILE * 2) { x = TILE * 2; if (vx < 0) vx = -vx; }
        else if (x > (COLS - 2) * TILE) { x = (COLS - 2) * TILE; if (vx > 0) vx = -vx; }

        birdsX[b] = x; birdsY[b] = y;
        birdsVX[b] = vx; birdsVY[b] = vy;
        birdsPh[b] += dt * (BIRDS_FLAP_HZ + (b % 3) * 0.7); // slight per-bird flap spread
      }
    }
  }

  // ----- Draw (called from the 140 world-entities region, world transform on) -----
  function birdsDraw() {
    if (!birdsInited) return;
    var surfY = SKY_ROWS * TILE;
    if (cam.y >= surfY) return;
    var any = false;
    for (var f0 = 0; f0 < BIRDS_FLOCKS; f0++) { if (birdsFActive[f0]) { any = true; break; } }
    if (!any) return;
    var left = cam.x - 8, right = cam.x + screenW + 8;
    var top = cam.y - 8, bot = cam.y + screenH + 8;
    // Single muted dark slate, the near-scenery silhouette tone. Reuses
    // BG.nearMtnRim (#181a26, BACKGROUND_STYLE.md section 3 near-background
    // band) so the birds sit in the same value family as the close ridges.
    ctx.fillStyle = (typeof BG !== 'undefined' && BG.nearMtnRim) ? BG.nearMtnRim : '#181a26';
    for (var f = 0; f < BIRDS_FLOCKS; f++) {
      if (!birdsFActive[f]) continue;
      var n = birdsFCount[f];
      var base = f * BIRDS_PER_FLOCK;
      for (var i = 0; i < n; i++) {
        var b = base + i;
        var x = birdsX[b], y = birdsY[b];
        if (x < left || x > right || y < top || y > bot) continue;
        var ix = Math.round(x), iy = Math.round(y);
        // 2-frame flap: shallow V (wings up) alternating with a flat dash.
        // Plain 1 px world rects; at this scale fillRect pixels match the
        // pixel-art look, no anti-aliasing tricks needed.
        if ((Math.floor(birdsPh[b]) & 1) === 0) {
          ctx.fillRect(ix - 1, iy - 1, 1, 1);
          ctx.fillRect(ix + 1, iy - 1, 1, 1);
          ctx.fillRect(ix, iy, 1, 1);
        } else {
          ctx.fillRect(ix - 1, iy, 3, 1);
        }
      }
    }
  }
