  // ====== NMZ OBSTACLE COURSE ======
  // The No Man's Zone flight course (EXPANSION_PLAN follow-up to 085's sparse
  // wreckage): structured, readable set-pieces filling the under-deck flight
  // band so threading them is the fast, skillful, rewarding route across a
  // zone. Four set-piece types (gate walls, pylon slaloms, tether balloons,
  // wreck arches) plus gold BOOST RINGS placed on the natural racing line
  // through each piece; flying a ring grants a speed burst + a fuel refund,
  // so the hard line pays. Everything lives under the flak deck (085's
  // flakDeckY); flying over a gate cap means entering flak airspace, which is
  // the priced choice by design.
  //
  // Wiring: 350-gameloop calls nmzCourseTick(dt) after combat update each
  // frame; 140-render-maindraw calls drawNmzCourse() in world space right
  // before drawCombat (course renders behind the combat entities). Both call
  // sites are typeof-guarded, so this fragment is purely additive.
  //
  // Collision is SWEPT: the rig at 390-530 px/s would tunnel a 16px pylon in
  // one 60fps step, so the player's motion this frame (previous -> current
  // position, tracked here) is substepped at 8px and each substep is an AABB
  // overlap + minimal-axis push-out. Hull damage scales with the speed killed
  // into the face (0 below 120 px/s, up to HIT_DMG_MAX at 450+), with the same
  // feedback the enemy bullets use (damageFlashT + hitPauseT + addTrauma +
  // sparks, endGame on a fatal slam).

  // ----- Tunables -----
  // Set-piece spacing in columns by zone number (NMZ1 nearest the start town
  // is the sparsest, NMZ3 the densest). The live SPACING_MULT lever scales it;
  // a lever change queues a rebuild on the next tick.
  //   zone 1: ~70 cols between pieces (calm intro gauntlet)
  //   zone 2: ~55 cols
  //   zone 3: ~40 cols (endgame corridor, near-continuous weave)
  var COURSE_SPACING = [70, 55, 40];
  var COURSE_APRON = 8;             // cols left clear at each zone edge (no piece spawns there)
  var COURSE_DECK_GAP = 20;         // px a gate wall stops short of the flak deck
  var COURSE_POND_MARGIN = 3;       // tiles of clearance kept around a pond (mirrors 085 obstacles)

  var COURSE_RING_R = 26;           // px boost-ring radius (collect within this of the ring centre)
  var COURSE_RING_RESPAWN = 12;     // s before a collected ring comes back
  var COURSE_RING_FRESH = 2.0;      // s of brighter pulse on a fresh / just-respawned ring
  var COURSE_BOOST_DUR = 1.6;       // s the speed burst holds
  var COURSE_BOOST_CAP = 530;       // px/s hard cap on boosted |vx|
  var COURSE_BOOST_FLOOR = 240;     // px/s minimum kick on collect (a hovering rig still feels it)

  var COURSE_CABLE_DMG = 4;         // hull damage for clipping a tether cable
  var COURSE_BALLOON_RESPAWN = 20;  // s before a popped balloon / snapped cable returns

  var COURSE_HIT_MIN = 120;         // px/s into-face speed below which a slam is free
  var COURSE_HIT_MAX = 450;         // px/s into-face speed at which damage reaches HIT_DMG_MAX
  var COURSE_SUBSTEP = 8;           // px swept-collision substep length

  // Live levers ('course' gm group, registered at build time like 085's flak).
  var courseTune = {
    SPACING_MULT: 1,                // scales COURSE_SPACING (queues a rebuild)
    RING_BOOST: 0.35,               // speed burst fraction (+35%)
    RING_FUEL: 4,                   // fuel units refunded per ring
    HIT_DMG_MAX: 10,                // hull damage at a full-speed slam
  };

  // ----- State -----
  var coursePieces = [];            // meta per set-piece: { type, zone, x0, x1 } (sorted by x0)
  var courseSolids = [];            // static AABBs: { x, y, w, h, kind, slotEdge, seed } (sorted by x)
  var courseSolidMaxW = 0;          // widest solid (collision window half-width)
  var courseBalloons = [];          // { ax, bx, by, spawnY, rx, ry, num, state, t, respawnT, seed }
                                    //   state: 0 alive | 1 deflating (popped) | 2 floating (cable snapped) | 3 gone
  var courseRings = [];             // { x, y, alive, respawnT, freshT, seed }
  var courseFx = [];                // collect FX: { x, y, t, maxT }
  var courseBoostT = 0;             // remaining boost seconds
  var courseClock = 0;              // local seconds accumulator (shimmer, sway)
  var coursePrevX = 0, coursePrevY = 0, coursePrevValid = false;
  var courseBuiltFor = null;        // enemyTurrets ref at build time: combatInit() makes a new
                                    // array every boot/restart, so a ref change = rebuild signal
  var courseRebuildQueued = false;  // set by the SPACING_MULT lever

  // ----- Deterministic per-zone PRNG (mulberry32) -----
  // Seeded per zone so the three zones lay out differently; the boot salt
  // makes each run's course fresh (rebuild per boot, no persistence).
  var courseBootSalt = 0;
  function courseRand(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----- gm levers ('course' group) -----
  // Mirrors 085's flakGmRegister: writes straight into GM_LEVERS (declared in
  // 360, same IIFE scope) because this fragment loads before the facade's
  // helpers exist. Called from courseBuild(), which runs at first tick, well
  // after 360 built the registry. One-shot guarded.
  var courseGmDone = false;
  function courseGmRegister() {
    if (courseGmDone) return;
    try {
      if (typeof GM_LEVERS === 'undefined' || !GM_LEVERS) return;
      var ranges = {
        SPACING_MULT: { min: 0.4, max: 2.5, step: 0.05 },
        RING_BOOST:   { min: 0,   max: 1,   step: 0.05 },
        RING_FUEL:    { min: 0,   max: 20,  step: 1 },
        HIT_DMG_MAX:  { min: 0,   max: 40,  step: 1 },
      };
      Object.keys(ranges).forEach(function (key) {
        GM_LEVERS['course.' + key] = {
          group: 'course',
          label: key,
          get: function () { return courseTune[key]; },
          set: function (v) {
            courseTune[key] = v;
            if (key === 'SPACING_MULT') courseRebuildQueued = true;   // layout lever: relay the course
          },
          min: ranges[key].min,
          max: ranges[key].max,
          step: ranges[key].step,
          def: courseTune[key],
          live: true,
        };
      });
      courseGmDone = true;
    } catch (e) {}
  }

  // ----- Generation -----
  function coursePushRing(x, y) {
    courseRings.push({ x: x, y: y, alive: true, respawnT: 0, freshT: COURSE_RING_FRESH, seed: Math.random() * 1000 });
  }

  // a. GATE WALL: full-height riveted wall from the ground up to COURSE_DECK_GAP
  // below the flak deck, split by ONE open slot 64-96px tall at a random height.
  // Two solids (below-slot + above-slot); the upper one carries the cap + star.
  // Racing line: through the slot, so the ring sits dead-centre in it, with an
  // approach ring at slot height before the wall and an exit ring after.
  function courseBuildGate(rand, groundY, deckY, cx) {
    var w = 18;
    var wallTop = deckY + COURSE_DECK_GAP;
    var band = groundY - wallTop;                       // full wall height
    var slotH = 64 + rand() * 32;                       // 64-96
    // Slot bottom offset above ground, clamped so BOTH wall segments keep at
    // least ~8px of height (the deck lever can shrink the band at runtime).
    var ob = 18 + rand() * Math.max(0, band - slotH - 26);
    if (ob + slotH > band - 8) ob = Math.max(8, band - 8 - slotH);
    var slotBot = groundY - ob;
    var slotTop = slotBot - slotH;
    var x = cx - w / 2;
    // Lower segment: slot at its top edge.
    if (groundY - slotBot > 6) {
      courseSolids.push({ x: x, y: slotBot, w: w, h: groundY - slotBot, kind: 'wall', slotEdge: 'top', seed: rand() * 1000 });
    }
    // Upper segment: slot at its bottom edge; wears the cap + red star.
    if (slotTop - wallTop > 6) {
      courseSolids.push({ x: x, y: wallTop, w: w, h: slotTop - wallTop, kind: 'wall', slotEdge: 'bottom', seed: rand() * 1000 });
    }
    var slotCY = (slotTop + slotBot) / 2;
    coursePushRing(cx - 96, slotCY);                    // approach, lined up on the slot
    coursePushRing(cx, slotCY);                         // the slot itself
    coursePushRing(cx + 96, slotCY - 8);                // exit carry
    return { x0: x - 100, x1: x + w + 100 };
  }

  // b. PYLON SLALOM: 3-5 tall pylons alternating up-from-ground (55-75% of the
  // band) and down-from-deck (30-50%), spaced so the only fast line is an
  // S-path around the tips. Rings sit on the apexes (just past each tip).
  function courseBuildSlalom(rand, groundY, deckY, cx) {
    var n = 3 + Math.floor(rand() * 3);                 // 3-5
    var band = groundY - deckY;
    var gap = 72 + rand() * 26;                         // px between pylon centres
    var x0 = cx - (n - 1) * gap / 2;
    var up = rand() < 0.5;                              // which end starts the weave
    var ringsLeft = 4;                                  // 2-4 rings per piece (cap 4)
    for (var i = 0; i < n; i++) {
      var w = 16 + rand() * 6;                          // 16-22
      var px = x0 + i * gap - w / 2;
      if (up) {
        var h = band * (0.55 + rand() * 0.20);          // rises 55-75% of the band
        courseSolids.push({ x: px, y: groundY - h, w: w, h: h, kind: 'pylonUp', seed: rand() * 1000 });
        if (ringsLeft > 0) { coursePushRing(px + w / 2, groundY - h - 32); ringsLeft--; }
      } else {
        var hh = band * (0.30 + rand() * 0.20);         // hangs 30-50% of the band
        courseSolids.push({ x: px, y: deckY, w: w, h: hh, kind: 'pylonDown', seed: rand() * 1000 });
        if (ringsLeft > 0) { coursePushRing(px + w / 2, deckY + hh + 32); ringsLeft--; }
      }
      up = !up;
    }
    return { x0: x0 - 60, x1: x0 + (n - 1) * gap + 60 };
  }

  // c. TETHER BALLOONS: 2-3 anchored barrage balloons at staggered heights.
  // The CABLE (anchor to balloon) is the hazard (4 dmg + snap); the balloon
  // itself pops harmlessly with a deflate spiral. Both respawn after 20s.
  // Racing line: the gaps between cables, so a ring sits in each gap at the
  // average of the flanking balloon heights.
  function courseBuildBalloons(rand, groundY, deckY, cx) {
    var n = 2 + (rand() < 0.5 ? 1 : 0);                 // 2-3
    var band = groundY - deckY;
    var gap = 100 + rand() * 40;
    var x0 = cx - (n - 1) * gap / 2;
    var prevY = 0;
    for (var i = 0; i < n; i++) {
      var ax = x0 + i * gap;
      var by = groundY - band * (0.40 + rand() * 0.40); // staggered 40-80% of the band
      courseBalloons.push({
        ax: ax, bx: ax, by: by, spawnY: by,
        rx: 14, ry: 10,
        num: 1 + Math.floor(rand() * 9),
        state: 0, t: 0, respawnT: 0,
        seed: rand() * 1000,
      });
      if (i > 0) coursePushRing(ax - gap / 2, (by + prevY) / 2);   // thread the gap
      prevY = by;
    }
    coursePushRing(x0 + (n - 1) * gap + 70, groundY - band * 0.45);  // exit carry
    return { x0: x0 - 40, x1: x0 + (n - 1) * gap + 110 };
  }

  // d. WRECK ARCH: a crashed freighter hull spanning low over the ground,
  // leaving a 70-90px tunnel under it and clear air above it up to the deck.
  // The greedy line is under, the safe line is over. ONE solid (the hull slab);
  // the centre support spar is drawn as a dark background silhouette only, so
  // the tunnel stays a true open lane (a solid support would seal it).
  function courseBuildArch(rand, groundY, deckY, cx) {
    var tunnelH = 70 + rand() * 20;                     // 70-90 clearance under the hull
    var thick = 36 + rand() * 10;                       // 36-46 hull body
    var span = 130 + rand() * 40;                       // 130-170 wide
    var x = cx - span / 2;
    courseSolids.push({ x: x, y: groundY - tunnelH - thick, w: span, h: thick, kind: 'arch', seed: rand() * 1000 });
    coursePushRing(cx - span / 2 - 70, groundY - tunnelH / 2);    // approach at tunnel height
    coursePushRing(cx, groundY - tunnelH / 2);                    // inside the tunnel
    return { x0: x - 90, x1: x + span + 90 };
  }

  // Walk every No Man's Zone and lay set-pieces along it: spaced by zone
  // (COURSE_SPACING * SPACING_MULT cols, +/-15% jitter), never over a surface
  // pond (same colOverPond helper the 085 obstacles use), never in the first
  // or last COURSE_APRON cols, type varied (no immediate repeats), seeded per
  // zone so the three zones lay out differently.
  function courseBuild() {
    if (!ENABLE_NMZ) return;   // No Man's Zones disabled: build no obstacle course
    coursePieces = [];
    courseSolids = [];
    courseBalloons = [];
    courseRings = [];
    courseFx = [];
    courseBoostT = 0;
    courseSolidMaxW = 0;
    coursePrevValid = false;
    courseBootSalt = (Math.random() * 0x7fffffff) | 0;
    var groundY = SKY_ROWS * TILE;
    var deckY = flakDeckY();
    if (REGIONS && REGIONS.length) {
      for (var ri = 0; ri < REGIONS.length; ri++) {
        var rg = REGIONS[ri];
        if (rg.kind !== REGION_NOMANS) continue;
        var zone = nmzZoneNumber(rg);
        var rand = courseRand(courseBootSalt + zone * 7919);
        var spacing = COURSE_SPACING[Math.min(COURSE_SPACING.length, zone) - 1] * courseTune.SPACING_MULT;
        if (spacing < 14) spacing = 14;
        var endC = rg.c1 - COURSE_APRON - 14;           // room for the widest piece
        var c = rg.c0 + COURSE_APRON + rand() * 10;
        var lastType = -1;
        while (c < endC) {
          var type = Math.floor(rand() * 4);
          if (type === lastType) type = (type + 1) % 4; // vary: never the same piece twice running
          // Approx piece spans in cols (for the pond check): gate 8, slalom 14,
          // balloons 12, arch 8. Check the whole footprint + margin.
          var spanCols = (type === 1) ? 14 : (type === 2) ? 12 : 8;
          var pond = false;
          for (var pc = Math.floor(c) - 1; pc <= Math.floor(c) + spanCols + 1 && !pond; pc++) {
            if (colOverPond(pc, COURSE_POND_MARGIN)) pond = true;
          }
          if (pond) { c += 6 + rand() * 8; continue; }  // skim past the lake, keep it an open lane
          var cx = (c + spanCols / 2) * TILE;
          var ext;
          if (type === 0)      ext = courseBuildGate(rand, groundY, deckY, cx);
          else if (type === 1) ext = courseBuildSlalom(rand, groundY, deckY, cx);
          else if (type === 2) ext = courseBuildBalloons(rand, groundY, deckY, cx);
          else                 ext = courseBuildArch(rand, groundY, deckY, cx);
          coursePieces.push({ type: type, zone: zone, x0: ext.x0, x1: ext.x1 });
          lastType = type;
          c += spacing * (0.85 + rand() * 0.30);
        }
      }
    }
    // Sort by x so tick/draw can window by the camera / player column range.
    courseSolids.sort(function (a, b) { return a.x - b.x; });
    courseRings.sort(function (a, b) { return a.x - b.x; });
    coursePieces.sort(function (a, b) { return a.x0 - b.x0; });
    for (var si = 0; si < courseSolids.length; si++) {
      if (courseSolids[si].w > courseSolidMaxW) courseSolidMaxW = courseSolids[si].w;
    }
    courseBuiltFor = (typeof enemyTurrets !== 'undefined') ? enemyTurrets : null;
    courseRebuildQueued = false;
    courseGmRegister();
  }

  // Binary search: first index in the x-sorted array with .x >= xMin.
  function courseLowerBound(arr, xMin) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid].x < xMin) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // ----- Collision feedback -----
  // The same player-damage feedback the enemy bullets use (085's enemy-bullet
  // hit block): hull, damageFlashT, hitPauseT, addTrauma, sparks, endGame.
  function courseHitFeedback(dmg, hx, hy, awayAng) {
    spawnCombatSpark(hx, hy, awayAng, 1.2, 9, '#ffd9a0', 180);
    if (dmg <= 0 || player.hull == null || player.hull <= 0) return;
    // The world-side clang + the rig-side crunch on the SAME frame (the
    // crash pairing from SFX_PROMPT_SYSTEM §5 obstacle-hit).
    sfxPlay('obstacle-hit', { pan: sfxPanAt(hx), gain: Math.min(1, 0.5 + dmg / 25) });
    sfxPlay('hull-hit');
    player.hull -= dmg;
    damageFlashT = Math.max(damageFlashT, 0.22 + dmg / 60);
    hitPauseT = Math.max(hitPauseT, 0.03);
    addTrauma(Math.min(0.55, 0.2 + dmg / 30));
    if (player.hull <= 0) { player.hull = 0; endGame({ type: 'crash' }); }
  }

  // Swept solid collision: substep the motion segment (prev -> current, set by
  // update() before this runs) at COURSE_SUBSTEP px; at each substep test the
  // rig AABB against the x-windowed solids; on overlap push out along the
  // minimal axis, kill the into-face velocity, damage by the speed killed.
  function courseCollideSolids() {
    if (!courseSolids.length) return;
    var sx = coursePrevX, sy = coursePrevY;
    var ex = player.x, ey = player.y;
    var mx = ex - sx, my = ey - sy;
    var dist = Math.sqrt(mx * mx + my * my);
    if (dist > 600) { return; }                         // teleport (T key / respawn): skip, prev re-anchors below
    var steps = Math.max(1, Math.ceil(dist / COURSE_SUBSTEP));
    for (var i = 1; i <= steps; i++) {
      var f = i / steps;
      var px = sx + mx * f, py = sy + my * f;
      var j0 = courseLowerBound(courseSolids, px - courseSolidMaxW - 4);
      for (var j = j0; j < courseSolids.length; j++) {
        var o = courseSolids[j];
        if (o.x > px + PLAYER_W + 4) break;             // sorted: nothing further can touch
        if (px + PLAYER_W <= o.x || px >= o.x + o.w || py + PLAYER_H <= o.y || py >= o.y + o.h) continue;
        // Overlap at this substep: resolve along the minimal axis.
        var penL = (px + PLAYER_W) - o.x, penR = (o.x + o.w) - px;
        var penU = (py + PLAYER_H) - o.y, penD = (o.y + o.h) - py;
        var minX = penL < penR ? penL : penR;
        var minY = penU < penD ? penU : penD;
        var impact = 0, hx, hy, away;
        if (minX <= minY) {
          if (penL < penR) { px -= penL; if (player.vx > 0) { impact = player.vx; player.vx = 0; } away = Math.PI; hx = o.x; }
          else { px += penR; if (player.vx < 0) { impact = -player.vx; player.vx = 0; } away = 0; hx = o.x + o.w; }
          hy = py + PLAYER_H * 0.5;
        } else {
          if (penU < penD) { py -= penU; if (player.vy > 0) { impact = player.vy; player.vy = 0; } away = -Math.PI / 2; hy = o.y; }
          else { py += penD; if (player.vy < 0) { impact = -player.vy; player.vy = 0; } away = Math.PI / 2; hy = o.y + o.h; }
          hx = px + PLAYER_W * 0.5;
        }
        player.x = px; player.y = py;                   // truncate the rest of this frame's motion
        var dmg = 0;
        if (impact > COURSE_HIT_MIN) {
          var t = Math.min(1, (impact - COURSE_HIT_MIN) / (COURSE_HIT_MAX - COURSE_HIT_MIN));
          dmg = Math.round(courseTune.HIT_DMG_MAX * t);
        }
        if (impact > 60) courseHitFeedback(dmg, hx, hy, away);
        return;                                         // one resolved hit per frame is plenty at 60fps
      }
    }
  }

  // Thin cable (line segment) vs the rig AABB: slab-clip the segment against
  // the box (Liang-Barsky); true if any part of the segment is inside.
  function courseSegBoxHit(x1, y1, x2, y2, bx, by, bw, bh) {
    var dx = x2 - x1, dy = y2 - y1;
    var t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x1 - bx, bx + bw - x1, y1 - by, by + bh - y1];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        var r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  // ----- Tick -----
  function nmzCourseTick(dt) {
    if (!ENABLE_NMZ) return;   // No Man's Zones disabled: inert no-op
    // Build lazily once the region table exists; rebuild whenever combatInit()
    // repopulated the zones (it allocates a fresh enemyTurrets array each
    // boot/restart, so the ref change is the per-boot signal) or the spacing
    // lever asked for a relay.
    if (typeof REGIONS === 'undefined' || !REGIONS || !REGIONS.length) return;
    if (courseBuiltFor === null || courseRebuildQueued ||
        (typeof enemyTurrets !== 'undefined' && enemyTurrets !== courseBuiltFor)) {
      courseBuild();
    }
    // Freeze with the rest of the world (mirror updateCombat's guards).
    if (gameOver || gameWon || shopOpen) { coursePrevValid = false; return; }
    if (UI_NEW && typeof shopState !== 'undefined' && shopState !== 'closed') { coursePrevValid = false; return; }
    if (hitPauseT > 0) return;
    if (!player || player.hull == null) return;
    if (dt > 0.05) dt = 0.05;
    courseClock += dt;
    if (!coursePrevValid) { coursePrevX = player.x; coursePrevY = player.y; coursePrevValid = true; }

    var playerAlive = player.hull > 0;
    var groundY = SKY_ROWS * TILE;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;

    // ---- Solid set-pieces: swept AABB ----
    if (playerAlive) courseCollideSolids();

    // ---- Balloons: sway, cable hazard, pop, deflate/float anims, respawn ----
    for (var bi = 0; bi < courseBalloons.length; bi++) {
      var b = courseBalloons[bi];
      if (b.state === 0) {
        b.bx = b.ax + Math.sin(courseClock * 0.6 + b.seed) * 6;    // lazy drift on the tether
        if (playerAlive && Math.abs(b.bx - pcx) < 240) {
          // Balloon body: harmless pop (deflate spiral) on rig contact.
          var bdx = pcx - b.bx, bdy = pcy - b.by;
          if ((bdx * bdx) / (b.rx + 9) / (b.rx + 9) + (bdy * bdy) / (b.ry + 9) / (b.ry + 9) < 1) {
            b.state = 1; b.t = 0; b.respawnT = COURSE_BALLOON_RESPAWN;
            spawnCombatSpark(b.bx, b.by, -Math.PI / 2, Math.PI, 6, '#9a9a64', 90);
          }
          // Cable: the hazard. Clip it -> 4 dmg + snap, balloon floats away.
          else if (courseSegBoxHit(b.ax, groundY, b.bx, b.by + b.ry, player.x, player.y, PLAYER_W, PLAYER_H)) {
            b.state = 2; b.t = 0; b.respawnT = COURSE_BALLOON_RESPAWN;
            courseHitFeedback(COURSE_CABLE_DMG, pcx, pcy, Math.atan2(pcy - b.by, pcx - b.bx));
          }
        }
      } else if (b.state === 1) {
        // Deflate spiral: corkscrew away shrinking (drawn from t), then gone.
        b.t += dt;
        b.bx += Math.cos(b.t * 14 + b.seed) * 90 * dt;
        b.by -= 40 * dt;
        if (b.t > 1.1) b.state = 3;
      } else if (b.state === 2) {
        // Snapped cable: the balloon drifts up and away.
        b.t += dt;
        b.bx += Math.sin(b.t * 1.2 + b.seed) * 18 * dt;
        b.by -= 34 * dt;
        if (b.t > 2.6) b.state = 3;
      } else {
        b.respawnT -= dt;
        if (b.respawnT <= 0) { b.state = 0; b.t = 0; b.bx = b.ax; b.by = b.spawnY; }
      }
    }

    // ---- Boost rings: respawn timers, collection, the burst ----
    for (var ki = 0; ki < courseRings.length; ki++) {
      var rng = courseRings[ki];
      if (!rng.alive) {
        rng.respawnT -= dt;
        if (rng.respawnT <= 0) { rng.alive = true; rng.freshT = COURSE_RING_FRESH; }
        continue;
      }
      if (rng.freshT > 0) rng.freshT -= dt;
      if (!playerAlive || Math.abs(rng.x - pcx) > 60) continue;
      var rdx = pcx - rng.x, rdy = pcy - rng.y;
      if (rdx * rdx + rdy * rdy < COURSE_RING_R * COURSE_RING_R) {
        rng.alive = false;
        rng.respawnT = COURSE_RING_RESPAWN;
        courseBoostT = COURSE_BOOST_DUR;
        // Immediate kick so a slow pass still feels the burst; the per-frame
        // multiplier below sustains it. Direction follows current travel.
        var dirx = (player.vx < 0 || (player.vx === 0 && player.dir < 0)) ? -1 : 1;
        if (Math.abs(player.vx) < COURSE_BOOST_FLOOR) player.vx = dirx * COURSE_BOOST_FLOOR;
        if (typeof getMaxFuel === 'function' && player.fuel != null) {
          player.fuel = Math.min(getMaxFuel(), player.fuel + courseTune.RING_FUEL);
        }
        courseFx.push({ x: rng.x, y: rng.y, t: 0, maxT: 0.5 });
        sfxPlay('ring-collect', { pan: sfxPanAt(rng.x) });   // atonal — never fights the music key
        spawnCombatSpark(rng.x, rng.y, 0, Math.PI, 10, '#f5d680', 160);
        spawnFloater(rng.x, rng.y - 18, '+BOOST', '#e9b54a', true);
      }
    }
    // The burst itself: a vx multiplier applied here each frame while it
    // holds, hard-capped (the game's own integrator re-clamps every update(),
    // so this reads as a steady +RING_BOOST ride, not a compounding runaway).
    if (courseBoostT > 0) {
      courseBoostT -= dt;
      var sp = Math.abs(player.vx);
      if (sp > 30) {
        var boosted = Math.min(COURSE_BOOST_CAP, sp * (1 + courseTune.RING_BOOST));
        player.vx = (player.vx < 0) ? -boosted : boosted;
      }
    }

    // ---- Collect FX ----
    for (var fi = courseFx.length - 1; fi >= 0; fi--) {
      courseFx[fi].t += dt;
      if (courseFx[fi].t >= courseFx[fi].maxT) courseFx.splice(fi, 1);
    }

    coursePrevX = player.x;
    coursePrevY = player.y;
  }

  // ----- Render -----
  // World space, camera transform already applied (called from 140 right
  // before drawCombat, so the course sits behind turrets/drones/bullets).
  // Everything culls to the camera window; solids window via binary search.
  function drawNmzCourse() {
    if (!ENABLE_NMZ) return;   // No Man's Zones disabled: draw nothing
    if (!courseSolids.length && !courseBalloons.length && !courseRings.length && !courseFx.length) return;
    var viewL = cam.x - 80, viewR = cam.x + screenW + 80;
    var groundY = SKY_ROWS * TILE;

    var j0 = courseLowerBound(courseSolids, viewL - courseSolidMaxW);
    for (var j = j0; j < courseSolids.length; j++) {
      var o = courseSolids[j];
      if (o.x > viewR) break;
      if (o.kind === 'wall') drawCourseWall(o);
      else if (o.kind === 'arch') drawCourseArch(o, groundY);
      else drawCoursePylon(o);
    }
    for (var bi = 0; bi < courseBalloons.length; bi++) {
      var b = courseBalloons[bi];
      if (b.state === 3 || b.bx < viewL - 40 || b.bx > viewR + 40) continue;
      drawCourseBalloon(b, groundY);
    }
    for (var ki = 0; ki < courseRings.length; ki++) {
      var r = courseRings[ki];
      if (!r.alive || r.x < viewL || r.x > viewR) continue;
      drawCourseRing(r);
    }
    for (var fi = 0; fi < courseFx.length; fi++) {
      var fx = courseFx[fi];
      if (fx.x < viewL || fx.x > viewR) continue;
      var p = fx.t / fx.maxT;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * (1 - p);
      ctx.strokeStyle = BLD.goldBright;
      ctx.lineWidth = 2.5 * (1 - p) + 0.5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, COURSE_RING_R + p * 46, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Deterministic 0..1 hash off a solid's seed (rust streak placement).
  function courseHash(seed, i) {
    var v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  // Five-point red star (the wall-cap motif, BUILDING_STYLE red + outline).
  function drawCourseStar(cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = (i % 2 === 0) ? r : r * 0.42;
      if (i === 0) ctx.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      else ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    ctx.closePath();
  }

  // Caution-gold chevron band along a horizontal edge (slot mouth / arch lip):
  // gold field with dark diagonal teeth, the BUILDING_STYLE warning livery.
  function drawCourseChevrons(x, y, w, h) {
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(x, y, w, h);
    // Dark slanted teeth across the gold band.
    ctx.fillStyle = BLD.outline;
    for (var sxp = x + 2; sxp < x + w - 2; sxp += 9) {
      ctx.beginPath();
      ctx.moveTo(sxp, y + h);
      ctx.lineTo(sxp + h, y);
      ctx.lineTo(sxp + h + 3.5, y);
      ctx.lineTo(sxp + 3.5, y + h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // GATE WALL segment: riveted cold iron, seam bands, rust streaks; the upper
  // segment wears the wide cap + red star, both segments wear chevrons on the
  // slot mouth so the open slot reads from a distance.
  function drawCourseWall(o) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(o.x, o.y, 2.5, o.h);                      // left-lit edge
    // Riveted seam bands every ~26px.
    ctx.fillStyle = BLD.metalDark;
    for (var by = o.y + 13; by < o.y + o.h - 6; by += 26) {
      ctx.fillRect(o.x, by, o.w, 2);
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(o.x + 3, by - 1.6, 1.6, 1.6);
      ctx.fillRect(o.x + o.w - 4.6, by - 1.6, 1.6, 1.6);
      ctx.fillStyle = BLD.metalDark;
    }
    // Rust streaks bleeding down from seams (translucent warm brown).
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = BLD.woodDark;
    for (var ri = 0; ri < 3; ri++) {
      var rx = o.x + 2 + courseHash(o.seed, ri) * (o.w - 5);
      var ry = o.y + courseHash(o.seed, ri + 7) * o.h * 0.6;
      ctx.fillRect(rx, ry, 1.6, 10 + courseHash(o.seed, ri + 13) * 18);
    }
    ctx.globalAlpha = 1;
    // Caution chevrons on the slot mouth.
    if (o.slotEdge === 'top') drawCourseChevrons(o.x - 2, o.y, o.w + 4, 6);
    else if (o.slotEdge === 'bottom') {
      drawCourseChevrons(o.x - 2, o.y + o.h - 6, o.w + 4, 6);
      // Cap slab + red star on the upper segment.
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(o.x - 4, o.y - 7, o.w + 8, 8);
      ctx.fillStyle = BLD.metalDark;
      ctx.fillRect(o.x - 3, o.y - 6, o.w + 6, 6);
      ctx.fillStyle = BLD.metalLight;
      ctx.fillRect(o.x - 3, o.y - 6, o.w + 6, 1.4);
      drawCourseStar(o.x + o.w / 2, o.y - 13, 6.5);
      ctx.fillStyle = BLD.redBase; ctx.fill();
      ctx.strokeStyle = BLD.outline; ctx.lineWidth = 1.2; ctx.stroke();
      drawCourseStar(o.x + o.w / 2 - 1, o.y - 14, 3.2);
      ctx.fillStyle = BLD.redBright; ctx.fill();
    }
  }

  // PYLON: riveted iron mast; up-pylons taper slightly to a gold-collared tip,
  // down-pylons are the same mirrored. The bevel stays within ~3px of the AABB
  // so the visual matches the hitbox through the weave.
  function drawCoursePylon(o) {
    var up = (o.kind === 'pylonUp');
    var tipY = up ? o.y : o.y + o.h;          // free end
    var rootY = up ? o.y + o.h : o.y;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(o.x, o.y, 2, o.h);
    // Banding + rivets.
    ctx.fillStyle = BLD.metalDark;
    for (var by = o.y + 16; by < o.y + o.h - 8; by += 30) ctx.fillRect(o.x, by, o.w, 2);
    // Root flare (a wider foot where it meets ground / deck).
    ctx.fillStyle = BLD.outline;
    if (up) ctx.fillRect(o.x - 3, rootY - 7, o.w + 6, 7);
    else ctx.fillRect(o.x - 3, rootY, o.w + 6, 7);
    ctx.fillStyle = BLD.metalDark;
    if (up) ctx.fillRect(o.x - 2, rootY - 6, o.w + 4, 6);
    else ctx.fillRect(o.x - 2, rootY + 1, o.w + 4, 5);
    // Gold tip collar + a small blinking lamp on the free end (the apex cue:
    // the racing line bends right here).
    ctx.fillStyle = BLD.goldBase;
    if (up) ctx.fillRect(o.x - 1, tipY, o.w + 2, 4);
    else ctx.fillRect(o.x - 1, tipY - 4, o.w + 2, 4);
    var blink = 0.5 + 0.5 * Math.sin(courseClock * 3 + o.seed);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + 0.5 * blink;
    ctx.fillStyle = BLD.goldPale;
    ctx.beginPath(); ctx.arc(o.x + o.w / 2, up ? tipY - 2 : tipY + 2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Rust streak.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(o.x + 3 + courseHash(o.seed, 1) * (o.w - 7), o.y + o.h * 0.25, 1.5, 14);
    ctx.globalAlpha = 1;
  }

  // WRECK ARCH: a crashed freighter hull section spanning the lane. The slab
  // is the solid; a dark support spar is drawn BEHIND the play plane (it would
  // seal the tunnel if it were solid), and chevrons mark the tunnel lip.
  function drawCourseArch(o, groundY) {
    var cx = o.x + o.w / 2;
    // Background support spar (silhouette tones, reads as depth not hazard).
    ctx.fillStyle = '#241c14';
    ctx.fillRect(cx - 6, o.y + o.h - 2, 12, groundY - (o.y + o.h) + 2);
    ctx.fillStyle = '#1c150f';
    ctx.fillRect(cx - 6, o.y + o.h - 2, 3, groundY - (o.y + o.h) + 2);
    // Hull slab: outlined iron with rounded sheer ends.
    ctx.fillStyle = BLD.outline;
    ctx.beginPath();
    ctx.moveTo(o.x - 1, o.y + 6);
    ctx.quadraticCurveTo(o.x - 1, o.y - 1, o.x + 10, o.y - 1);
    ctx.lineTo(o.x + o.w - 10, o.y - 1);
    ctx.quadraticCurveTo(o.x + o.w + 1, o.y - 1, o.x + o.w + 1, o.y + 6);
    ctx.lineTo(o.x + o.w + 1, o.y + o.h + 1);
    ctx.lineTo(o.x - 1, o.y + o.h + 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, 4);            // top sheen
    // Plating ribs + rivets.
    ctx.fillStyle = BLD.metalDark;
    for (var px = o.x + 18; px < o.x + o.w - 10; px += 26) {
      ctx.fillRect(px, o.y + 2, 2, o.h - 4);
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(px - 1.6, o.y + 6, 1.6, 1.6);
      ctx.fillRect(px - 1.6, o.y + o.h - 8, 1.6, 1.6);
      ctx.fillStyle = BLD.metalDark;
    }
    // Torn ends: a few dark bites out of the sheer line.
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(o.x + 1, o.y + o.h - 7, 7, 7);
    ctx.fillRect(o.x + o.w - 9, o.y + o.h - 9, 8, 9);
    // Red star stencil amidships + rust bleeding off the ribs.
    drawCourseStar(cx - 20, o.y + o.h * 0.5, 5.5);
    ctx.fillStyle = BLD.redDark; ctx.fill();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = BLD.woodDark;
    for (var ri = 0; ri < 4; ri++) {
      ctx.fillRect(o.x + 8 + courseHash(o.seed, ri) * (o.w - 16), o.y + o.h - 2, 1.6, 6 + courseHash(o.seed, ri + 5) * 10);
    }
    ctx.globalAlpha = 1;
    // Tunnel-lip chevrons on the underside edges (the greedy line's doorframe).
    drawCourseChevrons(o.x, o.y + o.h - 5, 22, 5);
    drawCourseChevrons(o.x + o.w - 22, o.y + o.h - 5, 22, 5);
  }

  // TETHER BALLOON: dull olive barrage blimp with a stenciled number, tail
  // fins, and the 2px hazard cable down to its ground anchor. Popped balloons
  // corkscrew away shrinking (state 1); a snapped cable lets it drift off
  // (state 2, no cable drawn).
  function drawCourseBalloon(b, groundY) {
    var oliveDark = '#3e3e28', oliveBase = '#6a6a42', oliveLight = '#8a8a58';
    var scale = 1;
    if (b.state === 1) scale = Math.max(0.1, 1 - b.t / 1.1);          // deflating
    var alpha = (b.state === 2) ? Math.max(0, 1 - b.t / 2.6) : 1;     // drifting off
    // Cable (only while the tether is intact). The hazard, so it must read:
    // dark core + a faint warm glint sliding down it.
    if (b.state === 0) {
      ctx.strokeStyle = '#15100a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.ax, groundY); ctx.lineTo(b.bx, b.by + b.ry); ctx.stroke();
      var gt = (courseClock * 0.4 + b.seed) % 1;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = BLD.goldDark;
      ctx.lineWidth = 1;
      var gy1 = b.by + b.ry + (groundY - b.by - b.ry) * gt;
      var gx1 = b.bx + (b.ax - b.bx) * gt;
      ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx1 + (b.ax - b.bx) * 0.08, gy1 + (groundY - b.by) * 0.08); ctx.stroke();
      ctx.globalAlpha = 1;
      // Ground anchor stub.
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(b.ax - 4, groundY - 4, 8, 4);
      ctx.fillStyle = BLD.metalDark;
      ctx.fillRect(b.ax - 3, groundY - 3, 6, 3);
    }
    if (alpha <= 0 || scale <= 0.12) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.bx, b.by);
    if (b.state === 1) ctx.rotate(b.t * 9);                           // the deflate spin
    ctx.scale(scale, scale);
    // Envelope: outlined dull-olive lozenge.
    ctx.fillStyle = BLD.outline;
    ctx.beginPath(); ctx.ellipse(0, 0, b.rx + 1.4, b.ry + 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = oliveBase;
    ctx.beginPath(); ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = oliveLight;
    ctx.beginPath(); ctx.ellipse(-3, -3, b.rx * 0.5, b.ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = oliveDark;
    ctx.beginPath(); ctx.ellipse(2, 4, b.rx * 0.6, b.ry * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    // Tail fins.
    ctx.fillStyle = BLD.outline;
    ctx.beginPath(); ctx.moveTo(-b.rx + 2, -2); ctx.lineTo(-b.rx - 6, -7); ctx.lineTo(-b.rx - 4, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-b.rx + 2, 2); ctx.lineTo(-b.rx - 6, 7); ctx.lineTo(-b.rx - 4, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = oliveDark;
    ctx.beginPath(); ctx.moveTo(-b.rx + 3, -1.5); ctx.lineTo(-b.rx - 4.5, -5.5); ctx.lineTo(-b.rx - 3, 0); ctx.closePath(); ctx.fill();
    // Stenciled number.
    ctx.fillStyle = BLD.cream;
    ctx.font = '7px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.num), 1, 0.5);
    ctx.restore();
  }

  // BOOST RING: warm gold, slow rotating shimmer arc, brighter pulse while
  // fresh. The FUN beacon, so it glows additively but stays in the gold family.
  function drawCourseRing(r) {
    var pulse = 0.5 + 0.5 * Math.sin(courseClock * 4 + r.seed);
    var fresh = r.freshT > 0 ? r.freshT / COURSE_RING_FRESH : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft halo.
    ctx.globalAlpha = 0.10 + 0.08 * pulse + 0.15 * fresh;
    var g = ctx.createRadialGradient(r.x, r.y, COURSE_RING_R * 0.4, r.x, r.y, COURSE_RING_R * 1.5);
    g.addColorStop(0, 'rgba(233,181,74,0)');
    g.addColorStop(0.6, 'rgba(233,181,74,0.55)');
    g.addColorStop(1, 'rgba(233,181,74,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r.x, r.y, COURSE_RING_R * 1.5, 0, Math.PI * 2); ctx.fill();
    // Main band.
    ctx.globalAlpha = 0.55 + 0.25 * pulse + 0.2 * fresh;
    ctx.strokeStyle = BLD.goldBright;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, COURSE_RING_R, 0, Math.PI * 2); ctx.stroke();
    // Rotating shimmer arc (the slow sweep that says "alive").
    var a0 = courseClock * 0.9 + r.seed;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = BLD.goldPale;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, COURSE_RING_R, a0, a0 + 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x, r.y, COURSE_RING_R, a0 + Math.PI, a0 + Math.PI + 0.5); ctx.stroke();
    // Fresh pulse: an extra ring blooming outward right after (re)spawn.
    if (fresh > 0) {
      ctx.globalAlpha = fresh * 0.5;
      ctx.strokeStyle = BLD.goldPale;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, COURSE_RING_R + (1 - fresh) * 14, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Dev/local-only course inspector (guarded like 085's __combat).
  try {
    if (window.location && /[?&]dev=|localhost|127\.0\.0\.1|192\.168\./.test(window.location.href)) {
      window.__course = {
        pieces: function () { return coursePieces; },
        rings: function () { return courseRings; },
        rebuild: function () { courseBuild(); return coursePieces.length; },
        solids: function () { return courseSolids; },
        balloons: function () { return courseBalloons; },
        state: function () {
          return {
            pieces: coursePieces.length, solids: courseSolids.length,
            rings: courseRings.length, balloons: courseBalloons.length,
            boostT: Number(courseBoostT.toFixed(3)), fx: courseFx.length,
          };
        },
      };
    }
  } catch (e) {}
