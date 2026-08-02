  /* =====================================================================
     SLIME NPCS (v26.69). The wild-slime brain: every activated world slime
     (buried finds, lake-shore perchers, the dev C-key cube) becomes a live
     critter that idles, wanders in little hops, startles away from a fast
     rig, and treats open water as a destination instead of a hazard. In
     water it cycles real behavior states: a plunge, a splashing-around
     phase, a relaxed float at the waterline, then a paddle to the bank and
     a shake-off.

     The brain drives bodies ONLY through shipped seams, never the solver:
     - the actor-intent seam (jelloSetActorIntent: velocity servo, one-shot
       hop impulses, pose squash + wobble). Topology-independent by design.
     - b.bathBuoy, the banya's one-way waterline buoyancy inside
       jelloIntegrate. The brain owns line/x0/x1 per frame while wet.
     - the guest-collider channel (getGameState().guests): a wet slime's
       deforming ring becomes a moving boundary in the GPU water solver, so
       crowns, cavities and bob ripples EMERGE from the kernels (the banya
       v26.04 law). Velocity conversion uses the toy-proven
       (p - o) * JELLO_TIMESCALE / h idiom, with the resting dead-band so a
       relaxed floater reads as static terrain and never stirs the pool.
     - liquidWakeForDig for entry wakes, throttled hard because every WAKE
       op bumps the mutation seq and starves the CPU mirror readback.

     Water sensing prefers GEOMETRY (surfacePonds spans + the SKY_ROWS
     waterline) and falls back to a mirror-particle histogram for dug shaft
     pools. The mirror lags ~20 frames; the waterline is low-passed with a
     dead-band per the toy lessons (a surface that chases the body's own
     splash is an energy pump).

     NPC slimes never dissolve (the b.npc skip in jelloWaterDissolveFrame);
     the poof era is retired for creatures. Nothing here persists in saves:
     brains re-attach fresh on load from the plain body list.
     ===================================================================== */

  var SLIME_NPC = false;             // master switch. PARKED OFF by owner call (2026-08-02):
                                     // the brains stay shipped and testable (gm slime.NPC = 1
                                     // live, ?npc=1 per boot) but wild slimes default to plain
                                     // soft bodies. With brains off, bodies have no b.npc, so
                                     // the v25.53 water dissolve applies to them again.
  var SLIME_HOP_VY = 330;            // hop impulse, solver px/s (real = x JELLO_TIMESCALE)
  var SLIME_HOP_VX = 130;            // air-steer servo target, solver px/s
  var SLIME_HOP_CD = 1.15;           // seconds between wander hops (temperament-scaled)
  var SLIME_WANDER_R = 6;            // wander target distance, tiles
  var SLIME_STARTLE_D = 88;          // rig distance that can startle, px
  var SLIME_STARTLE_V = 220;         // rig speed that startles, real px/s
  var SLIME_SOAK_MIN = 9;           // total seconds in the water before leaving
  var SLIME_SOAK_MAX = 26;
  var SLIME_SPLASH_T = 5.5;          // seconds per splashing-around bout
  var SLIME_RELAX_T = 11;            // seconds per relaxed float
  var SLIME_BUOY_LIFT = 1.75;        // relaxed-float lift (banya-calibrated)
  var SLIME_BUOY_DRAG = 0.965;
  var SLIME_WET_MIN = 12;            // mirror particles inside the bbox = "in water"
  var SLIME_WAKE_CD = 2.2;           // min seconds between water wakes per body

  var slimeNpcGuests = [];           // fixed 8-slot registry for getGameState
  var slimeNpcGuestOwner = [];       // body per slot (stable lanes, toy lesson)
  var slimeNpcGuestsAny = false;     // any live lane this frame (020 passes null otherwise)
  var slimeNpcSenseClock = 0;        // mirror pass runs every other frame
  var slimeNpcWasOn = false;         // edge-detects a mid-session kill switch
  var slimeNpcCount = 0;             // live brains this frame (debug probe; the perf entry is update.slimeNpc)
  (function () {
    for (var i = 0; i < 8; i++) { slimeNpcGuests.push({ pts: null }); slimeNpcGuestOwner.push(null); }
  })();
  try {
    if (/[?&]npc=1/.test(location.search)) SLIME_NPC = true;
    else if (/[?&]npc=0/.test(location.search)) SLIME_NPC = false;
  } catch (e) {}

  function slimeNpcAttach(b) {
    // Temperament is deterministic per body (hue-seeded): 0 = mellow,
    // 1 = playful. It scales hop cadence, soak lengths and how much of a
    // soak is spent splashing vs floating.
    var seed = (((b.hue || 0) * 2654435761) >>> 0) % 997;
    b.npc = {
      st: 'idle', t: 0, cd: 0.6 + (seed % 13) * 0.35,   // staggered, so a bank of slimes never moves in sync
      tmp: seed / 997,
      dir: (seed & 1) ? 1 : -1,
      tgtX: b.cx,
      lastX: b.cx, lastY: b.cy, stall: 0,
      wet: 0, line: 0, hasLine: false,
      soakT: 0, wakeCd: 0,
      // Land life comes first: a fresh-woken slime hops around ashore
      // before it ever heads for the water on purpose (and a bank of
      // slimes never plunges as one).
      swimCd: 8 + (seed % 7) * 3.2,
      hopFlip: 0, oscT: 0, slot: -1
    };
    return b.npc;
  }

  // Positional standing test, the banya recipe: near-solid support below, OR
  // simply stalled anywhere for half a second (a wedged body churns with high
  // phantom solver velocity, so velocity gates deadlock).
  function slimeNpcStanding(b, m, dt) {
    var mvd = Math.abs(b.cx - m.lastX) + Math.abs(b.cy - m.lastY);
    m.lastX = b.cx; m.lastY = b.cy;
    if (mvd < 1.6) m.stall += dt; else m.stall = 0;
    return jelloSupportedBelowTile(b) || m.stall > 0.5;
  }

  // ---- Water sensing --------------------------------------------------
  // Geometry first: a filled surface pond is a known rectangle with its
  // waterline at the SKY_ROWS row. The mirror histogram only decides
  // wetness and covers dug shaft pools the geometry cannot see.
  function slimeNpcPondAt(x) {
    if (typeof surfacePonds === 'undefined' || !surfacePonds) return null;
    for (var i = 0; i < surfacePonds.length; i++) {
      var p = surfacePonds[i];
      if (p.filled && x > p.cL * TILE - 8 && x < (p.cR + 1) * TILE + 8) return p;
    }
    return null;
  }

  function slimeNpcSense(list, n) {
    var hasMirror = typeof liquidCount !== 'undefined' && liquidCount > 0;
    var i, b, m;
    for (i = 0; i < n; i++) { list[i].npc._wetNew = 0; list[i].npc._topNew = 1e9; }
    if (hasMirror) {
      var lx = liquidX, ly = liquidY, lt = liquidType;
      for (var pi = 0; pi < liquidCount; pi++) {
        if (lt[pi] !== 0) continue;                       // water only
        var wx = lx[pi], wy = ly[pi];
        for (i = 0; i < n; i++) {
          b = list[i];
          if (wx < b.bboxL - 6 || wx > b.bboxR + 6) continue;
          m = b.npc;
          if (wy > b.bboxT - 4 && wy < b.bboxB + 6) m._wetNew++;
          // Topmost water in the body's own column band, for shaft pools.
          if (wy < m._topNew && wy > b.bboxT - 160 && wy < b.bboxB + 64) m._topNew = wy;
        }
      }
    }
    for (i = 0; i < n; i++) {
      b = list[i]; m = b.npc;
      m.wet = m._wetNew;
      var pond = slimeNpcPondAt(b.cx);
      var line;
      if (pond) {
        line = SKY_ROWS * TILE;                            // exact, no noise
      } else if (m._wetNew >= 4 && m._topNew < 1e9) {
        line = m._topNew;                                  // mirror estimate
      } else {
        m.hasLine = false;
        continue;
      }
      if (!m.hasLine) { m.line = line; m.hasLine = true; }
      else {
        var dl = line - m.line;                            // low-pass + dead-band:
        if (dl > 2 || dl < -2) m.line += dl * 0.08;        // never chase a splash
      }
    }
  }

  // ---- Guest colliders ------------------------------------------------
  // Wet or about-to-land bodies become moving fluid boundaries. Stable
  // slots (a body keeps its GPU lane while eligible), ring resampled to
  // <= 20 verts, faces carry REAL velocities via the toy-proven
  // (p - o) * JELLO_TIMESCALE / h conversion, capped at 600 px/s. Below a
  // 25 px/s max-face-speed dead-band the ring reports zero velocity, so a
  // resting floater is static terrain and cannot stir the pool (fades back
  // in by 75 px/s).
  function slimeNpcBuildGuests(list, n) {
    var si, b, m;
    for (si = 0; si < 8; si++) {
      var ob = slimeNpcGuestOwner[si];
      // Release a lane when its body stops being eligible OR stops existing
      // (sanitize splice, world rebuild, save restore). Without the liveness
      // check a despawned wet body's last ring would sit in the pool forever
      // as an invisible frozen boundary. 8 x indexOf over <= 64 bodies.
      if (ob && (ob.npc == null || !ob.npc._guestable || jelloBodies.indexOf(ob) < 0)) {
        slimeNpcGuestOwner[si] = null; slimeNpcGuests[si].pts = null;
        if (ob.npc) ob.npc.slot = -1;
      }
    }
    var h = (typeof jelloStepH === 'number' && jelloStepH > 0) ? jelloStepH : (1 / 240);
    var ts = (typeof JELLO_TIMESCALE === 'number' && JELLO_TIMESCALE > 0) ? JELLO_TIMESCALE : 0.5;
    var ih = ts / h;
    for (var i = 0; i < n; i++) {
      b = list[i]; m = b.npc;
      if (!m._guestable || m.slot >= 0) continue;
      for (si = 0; si < 8; si++) {
        if (!slimeNpcGuestOwner[si]) { slimeNpcGuestOwner[si] = b; m.slot = si; break; }
      }
    }
    var any = false;
    for (si = 0; si < 8; si++) {
      b = slimeNpcGuestOwner[si];
      if (!b) { slimeNpcGuests[si].pts = null; continue; }
      m = b.npc;
      if (!(b.ringN >= 3) || !b.ring) { slimeNpcGuests[si].pts = null; continue; }
      var rn = b.ringN | 0;
      var take = rn < 20 ? rn : 20;
      var pts = new Array(take * 4);
      var maxV = 0, k, ri, pvx, pvy;
      for (k = 0; k < take; k++) {
        ri = b.ring[((k * rn) / take) | 0];
        pvx = (b.px[ri] - b.ox[ri]) * ih;
        pvy = (b.py[ri] - b.oy[ri]) * ih;
        // v26.72: cap raised 600 -> 900 with the faster terminal (700 real).
        // A 600 cap would saturate the guest sweep's splash input and eat
        // the plunge energy the fall retune exists to deliver.
        if (pvx > 900) pvx = 900; else if (pvx < -900) pvx = -900;
        if (pvy > 900) pvy = 900; else if (pvy < -900) pvy = -900;
        var sp = Math.abs(pvx) + Math.abs(pvy);
        if (sp > maxV) maxV = sp;
        pts[k * 4] = b.px[ri]; pts[k * 4 + 1] = b.py[ri];
        pts[k * 4 + 2] = pvx; pts[k * 4 + 3] = pvy;
      }
      var fade = maxV < 25 ? 0 : (maxV > 75 ? 1 : (maxV - 25) / 50);
      if (fade < 1) for (k = 0; k < take * 4; k += 4) { pts[k + 2] *= fade; pts[k + 3] *= fade; }
      var ghw = (b.bboxR - b.bboxL) / 2 + 3;
      var ghh = (b.bboxB - b.bboxT) / 2 + 3;
      var g = slimeNpcGuests[si];
      g.x = (b.bboxL + b.bboxR) / 2; g.y = (b.bboxT + b.bboxB) / 2;
      g.hw = ghw < 8 ? 8 : (ghw > 64 ? 64 : ghw);
      g.hh = ghh < 8 ? 8 : (ghh > 64 ? 64 : ghh);
      g.pts = pts;
      any = true;
    }
    return any;
  }

  // ---- The state machine ---------------------------------------------
  function slimeNpcThink(b, dt) {
    var m = b.npc;
    m.t += dt; m.cd -= dt; m.wakeCd -= dt; m.swimCd -= dt;
    var inWater = m.hasLine && m.wet >= SLIME_WET_MIN && b.cy > m.line - 20;
    var nearWater = m.hasLine && b.cy > m.line - 170;
    m._guestable = inWater || (nearWater && !jelloSupportedBelowTile(b));
    var standing = slimeNpcStanding(b, m, dt);
    var vyReal = b.vy * (typeof JELLO_TIMESCALE === 'number' ? JELLO_TIMESCALE : 0.5);

    // Water is a hard interrupt from any land state. A slime that only
    // STUMBLES in while its swim cooldown runs takes a token dip and
    // scrambles right back out; a deliberate swim gets the full soak.
    if (inWater && m.st !== 'plunge' && m.st !== 'splash' && m.st !== 'relax' && m.st !== 'exitwater') {
      m.soakT = m.swimCd > 0 ? 1.6 + m.tmp * 2
                             : SLIME_SOAK_MIN + (SLIME_SOAK_MAX - SLIME_SOAK_MIN) * m.tmp;
      m.st = vyReal > 140 ? 'plunge' : (m.tmp > 0.45 ? 'splash' : 'relax');
      m.t = 0; m.cd = 0.4;
      if (m.wakeCd <= 0) {                 // wake the pond so it can react
        m.wakeCd = SLIME_WAKE_CD;
        try { liquidWakeForDig((b.cy / TILE) | 0, (b.cx / TILE) | 0); } catch (e) {}
      }
    }

    // Every wet state keeps the buoy current (the window rides the body;
    // the line is the sensed waterline). Splash sits a little deeper.
    // v26.72: during the plunge the buoy WAITS until the dive has spent
    // its energy (bathBuoy's drag killed a 700 px/s entry almost the same
    // frame, so the body never plowed and the crown never formed). The
    // guest boundary carries the full entry velocity into the solver; the
    // float engages once the body has actually gone deep.
    if (m.st === 'splash' || m.st === 'relax' ||
        (m.st === 'plunge' && (m.t > 0.35 || vyReal < 120))) {
      if (m.hasLine) {
        b.bathBuoy = {
          line: m.line + (m.st === 'splash' ? 12 : 6),
          x0: b.bboxL - 48, x1: b.bboxR + 48,
          lift: m.st === 'splash' ? 1.35 : SLIME_BUOY_LIFT,
          drag: m.st === 'splash' ? 0.985 : SLIME_BUOY_DRAG
        };
      }
      m.soakT -= dt;
      // Dry sanity: pool drained (or the sensing lost it) for real.
      if (m.wet === 0 && m.t > 1.2) {
        b.bathBuoy = null;
        m.st = 'idle'; m.t = 0; m.cd = 0.5;
        jelloSetActorIntent(b, { moveX: 0, jump: 0, wobble: 0.05, phaseSpeed: 2.4, poseX: 1, poseY: 1 });
        return;
      }
    }

    switch (m.st) {
      case 'doze':
        // Actor cleared on entry; the body may sleep for real. Wake on the
        // rig coming close, on water, or when the nap runs out.
        var pdx = (typeof player !== 'undefined' && player) ? player.x - b.cx : 1e9;
        var pdy = (typeof player !== 'undefined' && player) ? player.y - b.cy : 1e9;
        if (m.cd <= 0 || inWater || (pdx * pdx + pdy * pdy) < 160 * 160) {
          m.st = 'idle'; m.t = 0; m.cd = 0.3 + Math.random() * 0.7;
        }
        return;                              // no intent while dozing

      case 'idle':
        jelloSetActorIntent(b, {
          moveX: 0, speed: 0,
          wobble: 0.05, phaseSpeed: 2.2 + m.tmp * 1.6,
          poseX: 1, poseY: 1, poseFollow: 6, state: 'idle'
        });
        if (m.cd <= 0) {
          var roll = Math.random();
          if (roll < 0.5 + m.tmp * 0.3) {
            // Pick a wander target. A playful slime that can see a pond
            // heads for the water on purpose.
            m.st = 'wander'; m.t = 0;
            m.dir = Math.random() < 0.5 ? -1 : 1;
            // While the swim cooldown runs, wandering leans inland, so a
            // bank slime dips occasionally instead of yo-yoing at the rim.
            if (m.swimCd > 0 && slimeNpcPondAt(b.cx + m.dir * TILE * 4) && Math.random() < 0.75) m.dir = -m.dir;
            var pondT = slimeNpcPondAt(b.cx + m.dir * TILE * 8) || slimeNpcPondAt(b.cx - m.dir * TILE * 8);
            if (pondT && m.swimCd <= 0 && Math.random() < 0.15 + m.tmp * 0.35) {
              var pcx = ((pondT.cL + pondT.cR + 1) / 2) * TILE;
              m.dir = pcx > b.cx ? 1 : -1;
              m.tgtX = pcx;
            } else {
              m.tgtX = b.cx + m.dir * TILE * (2 + Math.random() * SLIME_WANDER_R);
            }
            m.cd = 0.2; m.hopFlip = 0;
          } else {
            m.st = 'doze'; m.t = 0; m.cd = 6 + Math.random() * 10;
            jelloClearActorIntent(b);
          }
        }
        break;

      case 'wander':
        var dx = m.tgtX - b.cx;
        var arrived = Math.abs(dx) < TILE * 0.8;
        if (arrived || m.t > 14) {
          m.st = 'idle'; m.t = 0; m.cd = 1.5 + Math.random() * 4;
          jelloSetActorIntent(b, { moveX: 0, wobble: 0.05, phaseSpeed: 2.4 });
          break;
        }
        m.dir = dx > 0 ? 1 : -1;
        if (standing && m.cd <= 0) {
          // A solid at head height directly ahead means a taller hop.
          var aheadX = b.cx + m.dir * (TILE * 0.9);
          var blocked = jelloWorldSolidAt(aheadX, b.cy) || jelloWorldSolidAt(aheadX, b.cy - TILE * 0.5);
          if (m.stall > 0.5) { m.hopFlip++; if (m.hopFlip > 2) { m.tgtX = b.cx - m.dir * TILE * 4; m.hopFlip = 0; } }
          jelloSetActorIntent(b, {
            moveX: m.dir * 0.75, speed: SLIME_HOP_VX, accel: 1400, follow: 10,
            jump: SLIME_HOP_VY * (blocked ? 1.35 : 0.85 + Math.random() * 0.3),
            wobble: 0.09, phaseSpeed: 6,
            poseX: 1, poseY: 1, poseFollow: 8, state: 'wander'
          });
          m.cd = (SLIME_HOP_CD - m.tmp * 0.45) * (0.85 + Math.random() * 0.4);
        } else if (!standing) {
          // Air-steer toward the target between hops; gravity owns vertical.
          jelloSetActorIntent(b, { moveX: m.dir * 0.75, speed: SLIME_HOP_VX, accel: 900, follow: 8, state: 'wander' });
        } else {
          jelloSetActorIntent(b, { moveX: 0, speed: 0, state: 'wander' });
        }
        // A fast rig closing in flips wander into a startled bound away.
        if (typeof player !== 'undefined' && player) {
          var sdx = b.cx - player.x, sdy = b.cy - player.y;
          var pv = Math.sqrt((player.vx || 0) * (player.vx || 0) + (player.vy || 0) * (player.vy || 0));
          if (sdx * sdx + sdy * sdy < SLIME_STARTLE_D * SLIME_STARTLE_D && pv > SLIME_STARTLE_V && standing && m.cd < SLIME_HOP_CD * 0.5) {
            m.dir = sdx >= 0 ? 1 : -1;
            m.tgtX = b.cx + m.dir * TILE * 7;
            jelloSetActorIntent(b, { moveX: m.dir, speed: SLIME_HOP_VX * 1.4, accel: 1800, jump: SLIME_HOP_VY * 1.25, wobble: 0.14, phaseSpeed: 9, state: 'startle' });
            m.cd = SLIME_HOP_CD;
          }
        }
        break;

      case 'plunge':
        // Falling in: let the guest boundary plow the crown, keep the body
        // soft and tucked. Hand off once the entry settles.
        jelloSetActorIntent(b, { moveX: 0, speed: 0, wobble: 0.06, phaseSpeed: 3, poseX: 0.92, poseY: 1.08, poseFollow: 7, state: 'plunge' });
        if (m.t > 0.55) { m.st = m.tmp > 0.45 ? 'splash' : 'relax'; m.t = 0; m.cd = 0.3; }
        break;

      case 'splash':
        // Splashing around: quick alternating strokes and little surface
        // hops. The oscillating ring velocity is what churns the water;
        // no authored splash anywhere.
        m.oscT -= dt;
        if (m.oscT <= 0) { m.dir = -m.dir; m.oscT = 0.45 + Math.random() * 0.45; }
        var hop = 0;
        if (m.cd <= 0 && b.cy < m.line + 26) {
          hop = 120 + Math.random() * 120;
          m.cd = 0.5 + Math.random() * 0.6;
          if (m.wakeCd <= 0) {
            m.wakeCd = SLIME_WAKE_CD;
            try { liquidWakeForDig((m.line / TILE) | 0, (b.cx / TILE) | 0); } catch (e) {}
          }
        }
        jelloSetActorIntent(b, {
          moveX: m.dir * 0.9, speed: 95, accel: 1100, follow: 9,
          jump: hop, wobble: 0.17, phaseSpeed: 8.5,
          poseX: 1.05, poseY: 0.95, poseFollow: 8, state: 'splash'
        });
        if (m.t > SLIME_SPLASH_T * (0.7 + m.tmp * 0.6)) {
          m.st = 'relax'; m.t = 0; m.cd = 1.5;
        }
        if (m.soakT <= 0) { m.st = 'exitwater'; m.t = 0; m.cd = 0.3; }
        break;

      case 'relax':
        // The float: buoyancy holds the line, the ring goes still (the
        // dead-band makes it static terrain to the pool), just a slow
        // breathing wobble and the odd contented bob.
        var bob = 0;
        if (m.cd <= 0) { bob = 26 + Math.random() * 14; m.cd = 2.6 + Math.random() * 2.2; }
        jelloSetActorIntent(b, {
          moveX: 0, speed: 0, jump: bob,
          wobble: 0.045, phaseSpeed: 1.7 + m.tmp * 0.8,
          poseX: 1.06, poseY: 0.94, poseFollow: 4, state: 'relax'
        });
        if (m.t > SLIME_RELAX_T * (0.6 + Math.random() * 0.8)) {
          if (m.soakT > 0 && Math.random() < 0.35 + m.tmp * 0.4) { m.st = 'splash'; m.t = 0; m.cd = 0.4; }
          else { m.st = 'exitwater'; m.t = 0; m.cd = 0.3; }
        }
        break;

      case 'exitwater':
        // Paddle to the nearer bank, scramble out (small steady up-and-over
        // pushes while airborne, the banya rim-climb trick), then shake off.
        var pondE = slimeNpcPondAt(b.cx);
        var bankX;
        if (pondE) {
          var mid = ((pondE.cL + pondE.cR + 1) / 2) * TILE;
          bankX = b.cx < mid ? pondE.cL * TILE - TILE * 1.5 : (pondE.cR + 1) * TILE + TILE * 1.5;
        } else {
          bankX = b.cx + (m.dir || 1) * TILE * 5;
        }
        var dxe = bankX - b.cx;
        m.dir = dxe > 0 ? 1 : -1;
        var out = m.wet < 4 && b.cy < m.line - 4;
        if (out) {
          b.bathBuoy = null;
          m.st = 'shake'; m.t = 0; m.cd = 0.55;
          // Dried off means done swimming for a while: land life gets its
          // turn before this slime deliberately heads back to the water.
          m.swimCd = 25 + 50 * (1 - m.tmp);
          break;
        }
        if (m.hasLine) {
          b.bathBuoy = { line: m.line + 4, x0: b.bboxL - 48, x1: b.bboxR + 48, lift: 1.9, drag: 0.972 };
        }
        var climb = 0;
        if (m.cd <= 0 && (standing || b.cy < m.line + 14)) {
          climb = SLIME_HOP_VY * 1.05;
          m.cd = 0.7 + Math.random() * 0.4;
        }
        jelloSetActorIntent(b, {
          moveX: m.dir, speed: 120, accel: 1300, follow: 10,
          jump: climb, wobble: 0.1, phaseSpeed: 6.5, poseX: 1, poseY: 1, state: 'exitwater'
        });
        if (m.t > 12) { m.st = 'relax'; m.t = 0; m.cd = 1; }   // could not get out; float and retry later
        break;

      case 'shake':
        // Out of the pool: one quick wet-dog shiver, then back to land life.
        jelloSetActorIntent(b, { moveX: 0, speed: 0, wobble: 0.2, phaseSpeed: 13, poseX: 1, poseY: 1, state: 'shake' });
        if (m.cd <= 0) {
          m.st = 'wander'; m.t = 0; m.cd = 0.3;
          m.tgtX = b.cx + m.dir * TILE * (3 + Math.random() * 4);
        }
        break;

      default:
        m.st = 'idle'; m.t = 0; m.cd = 0.5;
    }
  }

  function slimeNpcTick(dt) {
    if (!ENABLE_JELLO || !SLIME_NPC) {
      // Mid-session kill switch (gm slime.NPC = 0): sweep the residue ONCE
      // so the brains die clean. Live actor intents would keep servoing and
      // block sleep forever, a stale bathBuoy would hold a floater at a
      // line no one updates, and owned guest lanes would feed the GPU a
      // frozen boundary every frame.
      if (slimeNpcWasOn) {
        slimeNpcWasOn = false;
        slimeNpcCount = 0;
        slimeNpcGuestsAny = false;
        if (typeof jelloBodies !== 'undefined') {
          for (var ci = 0; ci < jelloBodies.length; ci++) {
            var cb = jelloBodies[ci];
            if (cb && cb.npc) {
              try { jelloClearActorIntent(cb); } catch (e) {}
              cb.bathBuoy = null;
              cb.npc.slot = -1; cb.npc._guestable = false;
              cb.npc.st = 'idle'; cb.npc.cd = 0.5;
            }
          }
        }
        for (var cs = 0; cs < 8; cs++) { slimeNpcGuestOwner[cs] = null; slimeNpcGuests[cs].pts = null; }
      }
      return;
    }
    slimeNpcWasOn = true;
    if (typeof jelloBodies === 'undefined' || !jelloBodies.length) { slimeNpcCount = 0; slimeNpcGuestsAny = false; return; }
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    var list = [], i, b;
    for (i = 0; i < jelloBodies.length; i++) {
      b = jelloBodies[i];
      if (b.guest || b.devFixture || b._melting) continue;
      if (!b.npc) slimeNpcAttach(b);
      if (b.frozen || b.n <= 0) {
        // Off-camera bodies get zero solver time; drop their buoy so a
        // reloaded pond never fights a stale window, and park the brain.
        if (b.npc.st !== 'doze' && b.npc.st !== 'idle') { b.npc.st = 'idle'; b.npc.cd = 0.5; b.bathBuoy = null; }
        if (b.npc.slot >= 0) { slimeNpcGuestOwner[b.npc.slot] = null; slimeNpcGuests[b.npc.slot].pts = null; b.npc.slot = -1; }
        b.npc._guestable = false;
        continue;
      }
      list.push(b);
    }
    slimeNpcCount = list.length;
    if (!list.length) { slimeNpcGuestsAny = slimeNpcBuildGuests(list, 0); return; }
    // The mirror pass is O(liquidCount x bodies); every other frame is
    // plenty for state sensing (the mirror itself refreshes ~20 frames).
    // Dozing bodies only need to notice arriving water eventually, so they
    // drop to a 1-in-8 cadence and weak phones skip most of the work.
    slimeNpcSenseClock = (slimeNpcSenseClock + 1) & 7;
    if (slimeNpcSenseClock & 1) {
      var sense = [];
      for (i = 0; i < list.length; i++) {
        if (list[i].npc.st !== 'doze' || slimeNpcSenseClock === 1) sense.push(list[i]);
      }
      if (sense.length) slimeNpcSense(sense, sense.length);
    }
    for (i = 0; i < list.length; i++) slimeNpcThink(list[i], dt);
    slimeNpcGuestsAny = slimeNpcBuildGuests(list, list.length);
  }
