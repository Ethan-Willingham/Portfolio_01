  /* ==== BANYA (v25.77): the other half of the game, first stone ==========
     Flag-gated (ENABLE_BATH, ?bath=1). Plan: docs/game/BATHHOUSE_PLAN.md
     (section 0 pivot, B-D11, stages B6/B8). This fragment owns BOTH halves
     of the B6 slice:

     EXTERIOR: a tall banya tower drawn on the town surface (cols 26-32,
     left of the station, near the first pond). Walk the rig into the door,
     or click/tap the building while near it, to enter.

     INTERIOR: its own SCENE, built as an off-map pocket room deep in the
     bedrock fill (rows 600-613, far below the 400 m mineable town). Entering
     is a camera teleport + mode swap: update()/updateCamera()/render() all
     yield via the three bath* hooks, the rig freezes where it was, and the
     room draws with its own lantern light. The liquid + smoke sims tick from
     the LOOP (350), not update(), so the room's water keeps simulating and
     the camera-derived active region wakes it automatically. Tub 1 is heated
     by the ONE B1 source rect (repointed here from the old pond demo), so
     the first thing you see is genuinely hot, convecting, warm-tinted water.

     Dev helpers: window.__bath.warp() (rig to the door), .enter(), .exit();
     window.bathTune for all BATH_* physics/look levers (see B1 notes).
     v25.85: STEAM lives (scene-local steam mode + hot-tub emission) and
     stage board hangs those on.
     ======================================================================= */

  // ---- Exterior placement (world px; groundY = SKY_ROWS * TILE = 128) ----
  // The site is picked AFTER worldgen: surface lakes vary per seed and can
  // reach well past col 26 (found the hard way: the tower stood in a lake,
  // its lower half hidden under the water overlay canvas). Rule: 3 cols
  // right of the rightmost left-half pond, clamped left of the deck apron.
  var BANYA_W = 5 * TILE;               // v25.79: skinny tiered tower (160 px base)
  var banyaX = -1;                      // set by bathPickSite()
  var banyaDoorX0 = 0, banyaDoorX1 = 0;
  var BANYA_DOOR_Y0 = SKY_ROWS * TILE - 80;
  var BANYA_DOOR_Y1 = SKY_ROWS * TILE;
  function bathPickSite() {
    if (banyaX >= 0) return true;
    if (typeof surfacePonds === 'undefined' || typeof world === 'undefined' ||
        !world.length) return false;
    // v25.78: the banya must be VISIBLE FROM SPAWN, no commands, no hunting
    // (owner). Candidates sit deck-relative: just right of the depot pad
    // first, then just left of the station cluster; a lake-safe far-left
    // rule stays as the last resort. A slot loses only if a pond overlaps
    // its 7-col footprint (+1 col of shore each side).
    function pondFree(c0) {
      for (var i = 0; i < surfacePonds.length; i++) {
        var p = surfacePonds[i];
        if (p.cR >= c0 - 2 && p.cL <= c0 + 8) return false;
      }
      return c0 >= 2 && c0 + 8 < COLS;
    }
    var col = -1;
    var cands = [DECK_CENTER_COL + 15, DECK_CENTER_COL - 30];
    for (var k = 0; k < cands.length; k++) {
      if (pondFree(cands[k])) { col = cands[k]; break; }
    }
    if (col < 0) {
      var rightEdge = 15;
      for (var j = 0; j < surfacePonds.length; j++) {
        var q = surfacePonds[j];
        if (q.cL < 70 && q.cR > rightEdge) rightEdge = q.cR;
      }
      col = Math.min(rightEdge + 3, 62);
    }
    banyaX = col * TILE;
    banyaDoorX0 = banyaX + 100;
    banyaDoorX1 = banyaX + 144;
    try { console.log('[bath] banya sited at cols ' + col + '-' + (col + 6)); } catch (e) {}
    return true;
  }

  // ---- The pocket TOWER (world tiles; deep in the inert bedrock fill) ----
  // v25.83 interior revamp (owner): five floors you SCROLL through, entered
  // at the bottom: F1 four tubs, F2 four tubs (dry, the hose era fills
  // them), F3 the sauna (ПАРИЛКА), F4 two wide tubs, F5 one big hot crown
  // pool (the B1 heat rect lives there: the payoff for climbing). Floors
  // taper with the exterior. One floor = 13 rows (12 interior + slab).
  // Camera fits the tower WIDTH; wheel / drag / touch scrolls vertically.
  // tubs = water spans [c0,c1]; walls are added at span edges +-1.
  // fill: 0 = dry, 1 = cold water, 2 = full + the heat source.
  var BATH_CX_COL = 36;
  // v25.84 (owner): two tubs per bath floor; every floor above F1 starts
  // LOCKED (grayed out + a purchase button priced in game money); the LEFT
  // edge is shared by every floor so the ELEVATOR shaft (cols 27-29) runs
  // truly vertical with doors on every floor. Slime traffic through it
  // lands with B7; until then owned floors' doors cycle ambiently and
  // locked doors stay shut. fill: 1 = cold water on unlock, 2 = water +
  // the B1 heat source (the crown pool).
  // v25.86 (owner): floors are COZY now (7 interior rows + slab, was 12+1)
  // and each bath floor holds ONE BOWL tub: stepped tile bowls (shallow at
  // the edges, deep in the middle) whose vessel is drawn from the mine's
  // FIRST ores: stone body, copper rim, iron rivets, coal + copper chips.
  // v25.88 (owner): tubs RECESS into the floor: a 1-row lip above the
  // walking slab and a 3-row shaft below it, so the vessel reads low and
  // simple while holding 3+ tiles of REAL water depth (deep water is calm
  // water; the shallow popcorn problem dies here, no sim-scale tricks).
  var BATH_FLOORS = [
    { c0: 27, c1: 45, fr: 610, lip: 1, sink: 3, tubs: [[32,41]], fill: [2], price: 0 },
    { c0: 27, c1: 45, fr: 599, lip: 1, sink: 3, tubs: [[32,41]], fill: [1], price: 2000 },
    { c0: 27, c1: 43, fr: 588, lip: 0, sink: 0, tubs: [], fill: [], sauna: true, price: 8000 },
    { c0: 27, c1: 41, fr: 577, lip: 1, sink: 3, tubs: [[30,39]], fill: [1], price: 20000 },
    { c0: 27, c1: 39, fr: 566, lip: 1, sink: 3, tubs: [[31,38]], fill: [1], price: 50000 }
  ];
  // One tub curve, ONE source of truth (v25.90): each column's sunk depth
  // comes from a parabola, so the carved cavity IS the curve (stepped at
  // tile resolution) and the drawn hole threads the same columns' bottom
  // midpoints: always inside the water, so no phantom notches can show.
  // v25.91: the bowl is a CATENARY (the hanging-chain curve, the vessel
  // curve of Gaudi's arches and fine pottery) proportioned by the golden
  // section: opening width : depth = phi^2 (~2.618). The drawn curve is
  // the MASTER; the carve digs every column DEEPER than the curve needs,
  // so each point of the visible curve is inside water by construction:
  // the water meets the curve, the slack hides behind the stone plate.
  var BATH_CAT_C = 2.0;                       // catenary tightness
  function bathTubCurve(F, tb) {
    var x0 = tb[0] * TILE, x1 = (tb[1] + 1) * TILE;
    var W = x1 - x0;
    var D = W / 2.618;
    var maxD = (F.lip + F.sink) * TILE - 12;
    if (D > maxD) D = maxD;
    var y0 = (F.fr - F.lip) * TILE + 12;      // the lip waterline plane
    var ch = Math.cosh(BATH_CAT_C) - 1;
    return {
      x0: x0, x1: x1, y0: y0, D: D,
      depthAt: function (x) {
        var t = ((x - x0) / W) * 2 - 1;
        if (t < -1) t = -1; else if (t > 1) t = 1;
        return D * (1 - (Math.cosh(BATH_CAT_C * t) - 1) / ch);
      }
    };
  }
  var bathFloorsOwned = [true, false, false, false, false];   // session-only for now
  var bathBuyFlash = [0, 0, 0, 0, 0];           // "not enough money" red blink until (ms)
  var BATH_TOP_ROW = 558;                       // F5 ceiling row (8-row floors)
  var BATH_BOT_ROW = 613;                       // F1 floor slab row
  var BATH_VIEW_W = 29 * TILE;                  // width-fit + headroom for the F2 peek
  var BATH_EXIT_X0 = 43 * TILE, BATH_EXIT_X1 = 46 * TILE;   // F1 right-wall door
  var BATH_EXIT_Y0 = 606 * TILE, BATH_EXIT_Y1 = 610 * TILE;

  var bathMode = false;        // true while inside the scene
  var bathRoomReady = false;   // room carved + water spawned + heat armed
  var bathDoorArm = true;      // walk-in re-arms only after leaving the rect
  var bathFading = false;      // transition lock
  var bathFadeEl = null;       // DOM fade overlay
  var bathPromptT = 0;         // pulse clock for the door hint

  function bathTune(name, v) {
    // Physics lanes go through setSimParam, the heat-tint look through
    // setRenderParam; unknown names are a no-op in each, so route to both.
    if (liquidWGPU && liquidWGPU.setSimParam)    liquidWGPU.setSimParam(name, v);
    if (liquidWGPU && liquidWGPU.setRenderParam) liquidWGPU.setRenderParam(name, v);
  }

  // ---- Tower construction (one-shot, on first enter) ----------------------
  function bathCarveRoom() {
    if (bathRoomReady) return;
    if (typeof world === 'undefined' || !world[BATH_BOT_ROW]) return;
    var r, c, f, i;
    // Solid block first (replacing tile objects wholesale is safe: the
    // shared frozen fill prototypes are never mutated, only de-referenced),
    // then carve each floor's cavity out of it.
    for (r = BATH_TOP_ROW; r <= BATH_BOT_ROW + 1; r++) {
      for (c = BATH_CX_COL - 14; c <= BATH_CX_COL + 14; c++) {
        world[r][c] = { type: 'foundation', hp: 999999 };
      }
    }
    for (f = 0; f < BATH_FLOORS.length; f++) {
      var F = BATH_FLOORS[f];
      for (r = F.fr - 7; r <= F.fr - 1; r++) {
        for (c = F.c0; c <= F.c1; c++) world[r][c] = null;
      }
      for (i = 0; i < F.tubs.length; i++) {
        var tb = F.tubs[i];
        // RECESSED bowl (v25.88): a 1-row lip above the walking floor and
        // an open shaft sunk F.sink rows into the slab, with the bottom
        // corners stepped in so the cavity bottoms out bowl-ish. Sealed on
        // all sides by the surrounding slab block.
        var crv = bathTubCurve(F, tb);
        for (var cc = tb[0] - 1; cc <= tb[1] + 1; cc++) {
          var isRim = (cc < tb[0] || cc > tb[1]);
          if (isRim && F.lip > 0) world[F.fr - 1][cc] = { type: 'foundation', hp: 999999 };
          var needY = 0;
          if (!isRim) {
            var dL = crv.depthAt(cc * TILE), dR = crv.depthAt((cc + 1) * TILE);
            var dC = crv.depthAt(cc * TILE + TILE / 2);
            needY = crv.y0 + Math.max(dL, dR, dC) + 10;   // curve + margin
          }
          for (r = F.fr; r <= F.fr + F.sink; r++) {
            if (isRim) { world[r][cc] = { type: 'foundation', hp: 999999 }; continue; }
            var open = (r * TILE) < needY;                // cell top above need
            world[r][cc] = open ? null : { type: 'foundation', hp: 999999 };
          }
        }
      }
      if (F.sauna) {
        // Two stepped bench tiers right of the elevator (solid, sittable).
        for (c = F.c0 + 4; c <= F.c0 + 10; c++) world[F.fr - 1][c] = { type: 'foundation', hp: 999999 };
        for (c = F.c0 + 4; c <= F.c0 + 7; c++) world[F.fr - 2][c] = { type: 'foundation', hp: 999999 };
      }
      if (bathFloorsOwned[f]) bathFillFloor(f);
    }
    bathRoomReady = true;
    try {
      console.log('[bath] tower carved: 5 floors; F1 open, buy the rest in-scene. ' +
        '__bath.floor(1..5) scrolls, __bath.buy(2..5) purchases.');
    } catch (e) {}
  }

  // Fill a floor's tubs with water (on unlock). fill mode 2 also arms the
  // ONE B1 heat rect there (the crown pool) and turns the channel on.
  function bathFillFloor(f) {
    var F = BATH_FLOORS[f];
    for (var i = 0; i < F.tubs.length; i++) {
      if (!F.fill[i]) continue;
      var tb = F.tubs[i];
      var wy0 = (F.fr - F.lip) * TILE + 10, wy1 = (F.fr + F.sink + 1) * TILE - 3;
      for (var wy = wy0; wy < wy1; wy += 1.3) {
        for (var wx = tb[0] * TILE + 3; wx < (tb[1] + 1) * TILE - 3; wx += 1.3) {
          if (world[(wy / TILE) | 0][(wx / TILE) | 0]) continue;   // bowl body
          addLiquidParticle('water', wx, wy, 0, 0, 0);
        }
      }
      if (F.fill[i] === 2) {
        // Heat the SHAFT FLOOR so hot water visibly lifts through the
        // cold column above it (the owner's "hot lifts into the cold").
        // ONE-SIDED heat (v25.92): warming only the left reach of the bowl
        // drives a circulation CELL: up the hot side, across the surface,
        // down the far side. Uniform bottom heat just stratifies.
        // v25.95 THE HOT SPRING VENT: real springs are fed by an inlet,
        // not a heated floor. A concentrated source at the bowl's bottom
        // centre makes ONE coherent scalding jet (T -> 2.0) that rises,
        // mushrooms at the surface, and drives a tub-wide circulation:
        // large-scale, visibly alive.
        var ventCx = ((tb[0] + tb[1] + 1) / 2) * TILE;
        bathTune('BATH_SRC_X0', ventCx - 14);
        bathTune('BATH_SRC_Y0', (F.fr + F.sink - 1) * TILE);
        bathTune('BATH_SRC_X1', ventCx + 14);
        bathTune('BATH_SRC_Y1', (F.fr + F.sink + 1) * TILE);
        bathTune('BATH_SRC_T', 2.0);
        bathTune('BATH_SRC_RATE', 0.12);
        bathTune('BATH_ON', 1);
        bathTune('BATH_BUOY', 380);
        bathHotTub = { F: F, tb: tb, ventX: ventCx };
      }
    }
  }

  // Purchase-button rect for a locked floor (world px). One source of truth
  // for the renderer AND the tap hit-test.
  function bathBuyRect(f) {
    var F = BATH_FLOORS[f];
    var cxp = ((F.c0 + F.c1 + 1) / 2) * TILE;
    return { x: cxp - 110, y: (F.fr - 7) * TILE + 3.5 * TILE - 30, w: 220, h: 60 };
  }
  function bathFmtMoney(n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Purchase a locked floor with game money; red-blink the price if short.
  function bathBuyFloor(f) {
    if (f < 1 || f > 4 || bathFloorsOwned[f]) return false;
    var F = BATH_FLOORS[f];
    if (typeof money !== 'number' || money < F.price) {
      bathBuyFlash[f] = performance.now() + 900;
      return false;
    }
    money -= F.price;
    bathFloorsOwned[f] = true;
    bathFillFloor(f);
    try { console.log('[bath] floor ' + (f + 1) + ' purchased for $' + F.price); } catch (e) {}
    return true;
  }

  // ---- Transition ---------------------------------------------------------
  function bathFadeEnsure() {
    if (bathFadeEl) return bathFadeEl;
    bathFadeEl = document.createElement('div');
    bathFadeEl.id = 'bath-fade';
    bathFadeEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;' +
      'pointer-events:none;z-index:40;transition:opacity 0.22s ease';
    document.body.appendChild(bathFadeEl);
    return bathFadeEl;
  }
  function bathLayerVis(inside) {
    // The HUD/toast layer (uiTopCanvas, z:6, 140) and the smoke canvas (z:5,
    // 190) sit ABOVE the main canvas in the DOM, so the scene cannot paint
    // over them: hide both while inside. The liquid canvas (z:4) stays, it
    // IS the tub water. Restored on exit.
    // v25.88: uiTop stays VISIBLE inside too; the scene clears it per
    // frame and draws the tub-vessel foreground there (above the water).
    // v25.85: the smoke canvas STAYS visible inside; it carries the STEAM.
    // Stale world smoke is dropped by clearAllSmokeVisuals() on enter.
  }
  function bathSwap(toInside) {
    if (bathFading || !ENABLE_BATH) return;
    bathFading = true;
    var el = bathFadeEnsure();
    el.style.opacity = '1';
    setTimeout(function () {
      if (toInside) {
        bathCarveRoom();
        bathScrollT = 1e9;   // enter at the BOTTOM floor
        bathCamY = -1;       // snap, no cross-tower pan on the first frame
        bathMode = true;
        // Steam era (v25.85): drop the world's stale smoke, retune the
        // fluid for steam, and book the first guest's arrival.
        try { if (typeof clearAllSmokeVisuals === 'function') clearAllSmokeVisuals(); } catch (e2) {}
        bathSteamPush();
        if (!bathGuests.length) bathGuestTimer = 1.6;
      } else {
        bathMode = false;
        bathDoorArm = false;   // must step off the door before it re-arms
        bathSteamPop();
      }
      bathLayerVis(toInside);
      el.style.opacity = '0';
      setTimeout(function () { bathFading = false; }, 240);
    }, 240);
  }
  function bathEnter() { if (!bathMode) bathSwap(true); }
  function bathExit()  { if (bathMode)  bathSwap(false); }
  function bathWarp() {
    if (typeof player === 'undefined' || !bathPickSite()) return false;
    player.x = banyaDoorX0 - 60;
    player.y = SKY_ROWS * TILE - PLAYER_H - 2;
    if (player.vx !== undefined) player.vx = 0;
    if (player.vy !== undefined) player.vy = 0;
    return true;
  }

  // ---- Hook 1: update() top (080). Returns true while the scene owns the
  // frame (world logic freezes; liquids/smoke tick from the loop). ---------
  function bathFrame(dt) {
    if (!ENABLE_BATH) return false;
    bathPromptT += dt;
    if (!bathMode) {
      if (!bathPickSite()) return false;
      var over = player.x < banyaDoorX1 && player.x + PLAYER_W > banyaDoorX0 &&
                 player.y < BANYA_DOOR_Y1 && player.y + PLAYER_H > BANYA_DOOR_Y0;
      if (over && bathDoorArm && !bathFading) bathEnter();
      else if (!over) bathDoorArm = true;
      return false;
    }
    if (keys['Escape']) { keys['Escape'] = false; bathExit(); }
    bathSteamTick(dt);
    bathGuestTick(dt);
    return true;
  }

  /* ==== BANYA PHYSICS (v25.85): steam + the first guest ==================
     STEAM: the smoke backend runs in STEAM MODE while inside (the world is
     paused, so there is no conflict): shorter-lived dye, low curl so it
     billows instead of swirling, emitted from the water surface of every
     HOT tub (fill mode 2) and left to pool under the rafters. Values are
     scaled from the live smokeTune fields and restored exactly on exit, so
     the world's smoke look is untouched whatever its tuning.
     GUEST: one slime customer (a real ENABLE_JELLO soft body, dissolve-
     immune via b.guest) spawns by the elevator, hops to tub 1, plunges in
     with a real splash of spawned droplets, and SOAKS: one-way buoyancy
     against the analytic waterline (b.bathBuoy, applied in jelloIntegrate;
     the water is never force-coupled back, plan B-D5). The waterline is
     analytic for now; the hose era reads the live level instead.
     ======================================================================= */
  var bathDbg = { steamCalls: 0, steamActive: 0, steamInView: 0, steamSplats: 0 };
  var bathSteamSaved = null;
  var bathSteamAcc = 0;
  // Owner-dialable steam (v25.88): the old values sat in place and bloomed
  // white (tiny rise velocity + heavy dye accumulating at one spot).
  var bathSteam = { rate: 24, amt: 0.05, rise: 0.06 };
  var bathSteamCol = { r: 0, g: 0, b: 0 };
  function bathSteamPush() {
    if (typeof smokeTune === 'undefined' || bathSteamSaved) return;
    bathSteamSaved = {
      dd: smokeTune.sim_density_dissipation,
      vd: smokeTune.sim_velocity_dissipation,
      curl: smokeTune.sim_curl
    };
    // Scale, never set: polarity-proof against whatever the smoke tuning is.
    smokeTune.sim_density_dissipation = bathSteamSaved.dd * 0.985;
    smokeTune.sim_curl = bathSteamSaved.curl * 0.35;
  }
  function bathSteamPop() {
    if (!bathSteamSaved || typeof smokeTune === 'undefined') return;
    smokeTune.sim_density_dissipation = bathSteamSaved.dd;
    smokeTune.sim_velocity_dissipation = bathSteamSaved.vd;
    smokeTune.sim_curl = bathSteamSaved.curl;
    bathSteamSaved = null;
  }
  var bathHotTub = null;
  function bathSteamTick(dt) {
    bathDbg.steamCalls++;
    if (typeof smokeDriver === 'undefined' || !smokeDriver) return;
    if (typeof smokeFluidActive === 'undefined' || !smokeFluidActive) return;
    bathDbg.steamActive++;
    bathSteamAcc += dt * bathSteam.rate;
    var units = bathSteamAcc | 0; bathSteamAcc -= units;
    if (units > 4) units = 4;
    for (var u = 0; u < units; u++) {
      for (var f = 0; f < BATH_FLOORS.length; f++) {
        if (!bathFloorsOwned[f]) continue;
        var F = BATH_FLOORS[f];
        for (var i = 0; i < F.tubs.length; i++) {
          if (F.fill[i] !== 2) continue;
          var tb = F.tubs[i];
          var wl = (F.fr - F.lip) * TILE + 10;
          var sx = tb[0] * TILE + 10 + Math.random() * ((tb[1] - tb[0] + 1) * TILE - 20);
          if (bathHotTub && bathHotTub.ventX && Math.random() < 0.55) {
            sx = bathHotTub.ventX + (Math.random() - 0.5) * 70;   // over the boil
          }
          var euv = smokeFluidWorldToUV(sx, wl - 18);
          if (!euv.inView) continue;
          bathDbg.steamInView++;
          smokeMarkActive();
          var amt = bathSteam.amt * (0.7 + Math.random() * 0.6);
          bathSteamCol.r = amt * 0.92;
          bathSteamCol.g = amt * 0.97;
          bathSteamCol.b = amt * 1.05;
          smokeDriver.splat(euv.uvX, euv.uvY,
            (Math.random() - 0.5) * 0.010,
            bathSteam.rise * (0.7 + Math.random() * 0.6),
            bathSteamCol, 0.012 + Math.random() * 0.008);
          bathDbg.steamSplats++;
        }
      }
    }
  }

  var bathGuests = [];
  var bathGuestTimer = -1;
  var bathGuestCap = 2;
  var bathFloats = [];        // rising "+$" payment texts {x, y, t, s}
  function bathDespawnGuest(gi) {
    var g = bathGuests[gi];
    if (g && g.b) {
      var di = jelloBodies.indexOf(g.b);
      if (di >= 0) jelloBodies.splice(di, 1);
      if (typeof jelloTotalPoints === 'function') jelloCount = jelloTotalPoints();
    }
    bathGuests.splice(gi, 1);
  }
  function bathImpulse(b, ivx, ivy) {
    // Verlet velocity add: v = (p - o) / h, so o -= dv * h.
    var n = b.n;
    for (var i = 0; i < n; i++) { b.ox[i] -= ivx * JELLO_H; b.oy[i] -= ivy * JELLO_H; }
    b.sleeping = false; b.sleepFrames = 0;
  }
  function bathSpawnGuest() {
    if (!ENABLE_JELLO || typeof jelloBuildBody !== 'function' || !bathRoomReady) return null;
    var F = BATH_FLOORS[0];
    var b = jelloBuildBody([{ r: F.fr - 1, c: 28 }], 'slime');
    if (!b) return null;
    b.guest = true;
    b.sleeping = false; b.sleepFrames = 0;
    var tb = F.tubs[0];
    bathGuests.push({
      b: b, st: 'walk', t: 0, cd: 0.7,
      cx: ((tb[0] + tb[1] + 1) / 2) * TILE,
      x0: tb[0] * TILE + 6, x1: (tb[1] + 1) * TILE - 6,
      line: (F.fr - F.lip) * TILE + 12,
      fy: F.fr * TILE, px: 0, py: 0, stall: 0,
      soakT: 14 + Math.random() * 18,
      homeX: 28 * TILE + 16
    });
    try { console.log('[bath] a guest arrives (guest slimes never dissolve).'); } catch (e) {}
    return b;
  }
  function bathGuestTick(dt) {
    if (bathGuestTimer > 0) {
      bathGuestTimer -= dt;
      if (bathGuestTimer <= 0 && bathGuests.length < bathGuestCap) {
        bathSpawnGuest();
        bathGuestTimer = 9 + Math.random() * 9;   // the queue keeps coming
      } else if (bathGuestTimer <= 0) {
        bathGuestTimer = 4;
      }
    }
    for (var fi2 = bathFloats.length - 1; fi2 >= 0; fi2--) {
      bathFloats[fi2].t += dt;
      if (bathFloats[fi2].t > 1.3) bathFloats.splice(fi2, 1);
    }
    for (var i = 0; i < bathGuests.length; i++) {
      var g = bathGuests[i], b = g.b;
      if (!b || b._melting) continue;
      g.t += dt; g.cd -= dt;
      // "Standing" is POSITIONAL, never velocity: a wedged body churns
      // with high phantom solver velocity while pinned (deadlocked the old
      // velocity gate). Two ways to count as standing: bottom near the
      // slab, OR simply STALLED anywhere (friction-pinned on a tub wall
      // face was the second deadlock): no positional progress for half a
      // second means hop again, wherever you are.
      var mvd = Math.abs(b.cx - g.px) + Math.abs(b.cy - g.py);
      g.px = b.cx; g.py = b.cy;
      if (mvd < 1.6) g.stall += dt; else g.stall = 0;
      var standing = (b.bboxB >= g.fy - 14 && b.bboxB <= g.fy + 6) || g.stall > 0.5;
      // Landed in ANY tub's water, whatever state the brain thought it was
      // in: start soaking (walkers can trip into a bath; that is a feature).
      if (g.st !== 'soak' && b.cy > g.line - 26) {
        var HF0 = BATH_FLOORS[0];
        for (var ti0 = 0; ti0 < HF0.tubs.length; ti0++) {
          var ts0 = HF0.tubs[ti0];
          var wx0 = ts0[0] * TILE + 6, wx1 = (ts0[1] + 1) * TILE - 6;
          if (b.cx > wx0 && b.cx < wx1) {
            g.st = 'soak'; g.cd = 1.2;
            b.bathBuoy = { line: g.line + 10, x0: wx0, x1: wx1, lift: 2.1, drag: 0.965 };
            for (var sp0 = 0; sp0 < 18; sp0++) {
              addLiquidParticle('water', b.cx + (Math.random() - 0.5) * 50, g.line - 5,
                (Math.random() - 0.5) * 110, -40 - Math.random() * 100, 0);
            }
            break;
          }
        }
      }
      if (g.st === 'walk') {
        if (g.cd <= 0 && standing) {
          var dx = g.cx - b.cx;
          if (Math.abs(dx) < 130) {
            bathImpulse(b, dx > 0 ? 150 : -150, -325);
            g.st = 'plunge'; g.cd = 1.1;
          } else {
            bathImpulse(b, dx > 0 ? 120 : -120, -215);
            g.cd = 0.85;
          }
        }
      } else if (g.st === 'plunge') {
        // Any tub on the home floor counts: guests pick whichever they
        // land in (the overshoot into tub 2 was too charming to forbid).
        var landed = null;
        var HF = BATH_FLOORS[0];
        for (var ti = 0; ti < HF.tubs.length; ti++) {
          var tspan = HF.tubs[ti];
          var lx0 = tspan[0] * TILE + 6, lx1 = (tspan[1] + 1) * TILE - 6;
          if (b.cx > lx0 && b.cx < lx1 && b.cy > g.line - 26) { landed = { x0: lx0, x1: lx1 }; break; }
        }
        if (landed) {
          g.st = 'soak';
          b.bathBuoy = { line: g.line + 6, x0: landed.x0, x1: landed.x1, lift: 1.75, drag: 0.965 };
          for (var s = 0; s < 26; s++) {
            addLiquidParticle('water', b.cx + (Math.random() - 0.5) * 60, g.line - 6,
              (Math.random() - 0.5) * 170, -50 - Math.random() * 130, 0);
          }
        } else {
          // Assisted climb: a small steady up-and-over push while airborne,
          // so the rim is a scramble, not a brick wall.
          bathImpulse(b, (g.cx > b.cx ? 250 : -250) * dt, -420 * dt);
          if (g.cd <= 0) { g.st = 'walk'; g.cd = 0.3; }   // recover, retry
        }
      } else if (g.st === 'soak') {
        g.soakT -= dt;
        if (g.soakT <= 0) {
          // Done: LEAP out toward home (the physics moment the owner asked
          // for), then waddle to the elevator and pay on the way out.
          b.bathBuoy = null;
          bathImpulse(b, b.cx > g.homeX ? -200 : 200, -430);
          g.st = 'leave'; g.cd = 1.0;
        } else if (g.cd <= 0) {
          bathImpulse(b, 0, -26);   // a contented bob
          g.cd = 2.6 + Math.random() * 2.2;
        }
      } else if (g.st === 'leave') {
        if (g.cd <= 0 && standing) {
          var dxh = g.homeX - b.cx;
          if (Math.abs(dxh) < 34) {
            if (typeof money === 'number') money += 25;
            bathFloats.push({ x: b.cx, y: b.cy - 40, t: 0, s: '+$25' });
            bathDespawnGuest(i); i--;
            continue;
          }
          bathImpulse(b, dxh > 0 ? 120 : -120, -215);
          g.cd = 0.85;
        }
      }
    }
  }

  // ---- Hook 2: updateCamera() top (080). The scene OWNS the zoom: fit the
  // tower WIDTH to the canvas (any window, any dpr) and scroll VERTICALLY
  // through the floors (wheel / drag / touch feed bathScrollT). Overriding
  // the global worldScale keeps the liquid overlay's view mapping in
  // perfect agreement with the main canvas transform, since both read
  // dpr * worldScale live. Restored on exit. -------------------------------
  var bathSaved = null;          // { ws, sw, sh } world view state, restored on exit
  var bathScrollT = 1e9;          // scroll target (world y); huge = clamp to bottom
  var bathCamY = -1;              // smoothed camera y; -1 = snap on first pin
  var bathViewH = 0;              // visible height in world px (set per frame)
  function bathCamPin() {
    if (!bathMode) {
      if (bathSaved) {
        worldScale = bathSaved.ws; screenW = bathSaved.sw; screenH = bathSaved.sh;
        bathSaved = null;
      }
      return false;
    }
    if (!bathSaved) bathSaved = { ws: worldScale, sw: screenW, sh: screenH };
    worldScale = canvas.width / dpr / BATH_VIEW_W;
    var iws = 1 / (dpr * worldScale);
    bathViewH = canvas.height * iws;
    // The scene owns the WHOLE canvas, so the shared view globals must
    // match: jello's draw cull and the smoke fluid's domain sizing read
    // screenW/screenH, and the stale world values (console strip excluded,
    // old zoom) culled an on-camera guest and shrank the steam domain
    // (found the hard way). Restored with worldScale on exit.
    screenW = canvas.width * iws;
    screenH = bathViewH;
    var minY = BATH_TOP_ROW * TILE - 24;
    var maxY = (BATH_BOT_ROW + 1) * TILE + 12 - bathViewH;
    if (maxY < minY) maxY = minY;
    if (bathScrollT < minY) bathScrollT = minY;
    if (bathScrollT > maxY) bathScrollT = maxY;
    if (bathCamY < 0) bathCamY = bathScrollT;
    bathCamY += (bathScrollT - bathCamY) * 0.22;
    cam.x = BATH_CX_COL * TILE - canvas.width * iws / 2;
    cam.y = bathCamY;
    return true;
  }
  function bathScrollToFloor(n) {   // dev + future UI: centre floor n (1..5)
    var F = BATH_FLOORS[Math.max(1, Math.min(5, n)) - 1];
    bathScrollT = (F.fr - 4) * TILE + 16 - bathViewH / 2;
  }

  // ---- Pointer: outside, tap the tower (near it) to enter. Inside, DRAG
  // (mouse or finger) scrolls the tower, the wheel scrolls it, and a TAP
  // (movement under 10 css px) on the ВЫХОД door leaves. One code path for
  // touch and mouse via pointer events. -------------------------------------
  var bathPtrDown = false, bathPtrX = 0, bathPtrY = 0, bathPtrMoved = 0;
  function bathClientToWorld(e) {
    var rct = canvas.getBoundingClientRect();
    if (!rct.width || !rct.height) return null;
    var ws = dpr * worldScale;
    return {
      x: cam.x + (e.clientX - rct.left) * (canvas.width / rct.width) / ws,
      y: cam.y + (e.clientY - rct.top) * (canvas.height / rct.height) / ws
    };
  }
  function bathPointer(e) {
    if (!ENABLE_BATH || bathFading) return;
    if (bathMode) {
      bathPtrDown = true; bathPtrX = e.clientX; bathPtrY = e.clientY;
      bathPtrMoved = 0;
      return;
    }
    // Outside: the whole tower is the button, but only when the rig is near.
    if (!bathPickSite()) return;
    var p = bathClientToWorld(e);
    if (!p) return;
    var dx = (player.x + PLAYER_W / 2) - (banyaX + BANYA_W / 2);
    if (Math.abs(dx) > 9 * TILE) return;
    if (p.x >= banyaX - 8 && p.x <= banyaX + BANYA_W + 8 &&
        p.y >= SKY_ROWS * TILE - 480 && p.y <= SKY_ROWS * TILE) bathEnter();
  }
  function bathPointerMove(e) {
    if (!bathMode || !bathPtrDown) return;
    var dy = e.clientY - bathPtrY;
    bathPtrMoved += Math.abs(dy) + Math.abs(e.clientX - bathPtrX);
    bathPtrX = e.clientX; bathPtrY = e.clientY;
    // Content follows the finger: dragging DOWN shows higher floors' worth
    // of tower above, i.e. the camera moves opposite the pointer.
    var rct = canvas.getBoundingClientRect();
    if (rct.height) bathScrollT -= dy * (canvas.height / rct.height) / (dpr * worldScale);
  }
  function bathPointerUp(e) {
    var wasDown = bathPtrDown;
    bathPtrDown = false;
    if (!bathMode || !wasDown || bathFading) return;
    if (bathPtrMoved >= 10) return;   // it was a drag, not a tap
    var p = bathClientToWorld(e);
    if (!p) return;
    // Purchase buttons on locked floors take priority over the exit door.
    for (var bf = 1; bf <= 4; bf++) {
      if (bathFloorsOwned[bf]) continue;
      var R = bathBuyRect(bf);
      if (p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) {
        bathBuyFloor(bf);
        return;
      }
    }
    if (p.x >= BATH_EXIT_X0 && p.x <= BATH_EXIT_X1 &&
        p.y >= BATH_EXIT_Y0 && p.y <= BATH_EXIT_Y1) bathExit();
  }
  function bathWheelScroll(e) {
    if (!bathMode) return;
    e.preventDefault();
    bathScrollT += (e.deltaY || 0) / Math.max(worldScale, 0.001);
  }

  // ---- Exterior: the tiered tower (v25.79, owner direction) ---------------
  // A skinny, tall, TIERED silhouette: four shrinking timber tiers with
  // flared iron skirt roofs, a tented top, copper cap and a red star. The
  // reference is the wooden tiered towers of the Russian North (Kizhi
  // style), which read pagoda-like from a distance while staying Russian.
  // Paper lanterns hang from every eave tip and light with the real sun:
  // off at noon, fading in through dusk, full at night (bathNightK).
  var bathNightOverride = -1;   // dev: __bath.night(0..1); -1 = follow the sun
  function bathNightK() {
    if (bathNightOverride >= 0) return bathNightOverride;
    if (typeof timeOfDay !== 'number') return 0;
    // Sun elevation: timeOfDay 0.25 = sunrise, 0.75 = sunset (020-state).
    var elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
    var k = (0.08 - elev) / 0.2;
    return k < 0 ? 0 : (k > 1 ? 1 : k);
  }
  function drawBanyaExterior() {
    if (!ENABLE_BATH || bathMode || !bathPickSite()) return;
    var gy = SKY_ROWS * TILE;                 // 128, the surface line
    var x = banyaX, w = BANYA_W, cx = x + w / 2;
    var night = bathNightK();
    var t = performance.now() * 0.001;
    var flick = 0.9 + 0.1 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
    var lit = night > 0.02;

    function lantern(lx, ly) {
      ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 9); ctx.stroke();
      if (lit) {
        ctx.fillStyle = 'rgba(255,184,92,' + (0.05 * night) + ')';
        ctx.beginPath(); ctx.arc(lx, ly + 16, 30, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,184,92,' + (0.10 * night) + ')';
        ctx.beginPath(); ctx.arc(lx, ly + 16, 15, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,206,106,' + (0.35 + 0.6 * night * flick) + ')';
      } else {
        ctx.fillStyle = '#6b5a44';
      }
      ctx.beginPath(); ctx.ellipse(lx, ly + 16, 5.5, 7, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx - 5, ly + 16); ctx.lineTo(lx + 5, ly + 16); ctx.stroke();
      ctx.fillStyle = '#54381f';
      ctx.fillRect(lx - 3, ly + 7, 6, 3);
      ctx.fillRect(lx - 2, ly + 22, 4, 2);
    }
    function win(wx, wy, ww, wh) {
      // Nalichnik: the pale carved casing Russian windows wear, with a
      // little crown peak over the lintel.
      ctx.fillStyle = '#d68a5a';
      ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2 - 7, wy - 3); ctx.lineTo(wx + ww / 2, wy - 9);
      ctx.lineTo(wx + ww / 2 + 7, wy - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a5427';
      ctx.fillRect(wx - 3, wy + wh + 1, ww + 6, 2);
      if (lit) {
        ctx.fillStyle = 'rgba(255,184,92,' + (0.10 * night) + ')';
        ctx.beginPath(); ctx.arc(wx + ww / 2, wy + wh / 2, ww, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,206,106,' + (0.25 + 0.6 * night * flick) + ')';
      } else {
        ctx.fillStyle = '#26303f';
      }
      ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = '#3d2820'; ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
    }
    function eave(yB, half) {
      var yT = yB - 13;
      ctx.fillStyle = '#39424c';
      ctx.beginPath();
      ctx.moveTo(cx - half, yB - 9);            // flared left tip
      ctx.lineTo(cx - half + 22, yB);
      ctx.lineTo(cx + half - 22, yB);
      ctx.lineTo(cx + half, yB - 9);            // flared right tip
      ctx.lineTo(cx + half - 30, yT);
      ctx.lineTo(cx - half + 30, yT);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2c343c';
      ctx.fillRect(cx - half + 28, yT, half * 2 - 56, 3);
      ctx.strokeStyle = '#b5723a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - half + 22, yB); ctx.lineTo(cx + half - 22, yB);
      ctx.stroke();
      // Carved fringe board (prichelina): pale sawtooth lacework hanging
      // off the drip edge, the classic Russian eave trim at pixel size.
      ctx.fillStyle = '#d68a5a';
      for (var fx = cx - half + 24; fx < cx + half - 28; fx += 8) {
        ctx.beginPath();
        ctx.moveTo(fx, yB + 1); ctx.lineTo(fx + 4, yB + 6); ctx.lineTo(fx + 8, yB + 1);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(cx - half + 26, yB + 7, half * 2 - 52, 6);
      lantern(cx - half + 4, yB - 7);
      lantern(cx + half - 4, yB - 7);
    }

    // Stone plinth + door step.
    ctx.fillStyle = '#6f6f6f'; ctx.fillRect(x - 6, gy - 20, w + 12, 20);
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(x - 6, gy - 11, w + 12, 2);
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(banyaDoorX0 - 6, gy - 6, (banyaDoorX1 - banyaDoorX0) + 12, 6);

    // Four tiers, bottom-up: planking body (darkening wash with height),
    // then the flared eave with its pair of lanterns.
    drawWoodPlanking(cx - 80, gy - 118, 160, 98, 4);
    drawWoodPlanking(cx - 66, gy - 208, 132, 84, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(cx - 66, gy - 208, 132, 84);
    drawWoodPlanking(cx - 52, gy - 288, 104, 74, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(cx - 52, gy - 288, 104, 74);
    drawWoodPlanking(cx - 38, gy - 356, 76, 62, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(cx - 38, gy - 356, 76, 62);

    // Windows before the eaves so glow halos sit over the wood cleanly.
    win(cx - 40, gy - 194, 22, 30); win(cx + 18, gy - 194, 22, 30);
    win(cx - 11, gy - 274, 22, 30);
    win(cx - 8, gy - 344, 16, 26);

    eave(gy - 118, 104);
    eave(gy - 208, 88);
    eave(gy - 288, 72);
    eave(gy - 356, 58);

    // Tent roof + copper cap + the red star (glows at night).
    ctx.fillStyle = '#39424c';
    ctx.beginPath();
    ctx.moveTo(cx - 46, gy - 365); ctx.lineTo(cx, gy - 436);
    ctx.lineTo(cx + 46, gy - 365); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2c343c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, gy - 434); ctx.lineTo(cx - 38, gy - 372);
    ctx.moveTo(cx, gy - 434); ctx.lineTo(cx + 38, gy - 372);
    ctx.stroke();
    ctx.fillStyle = '#b5723a';
    ctx.beginPath(); ctx.arc(cx, gy - 436, 9, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - 2, gy - 458, 4, 14);
    if (lit) {
      ctx.fillStyle = 'rgba(226,75,74,' + (0.20 * night) + ')';
      ctx.beginPath(); ctx.arc(cx, gy - 466, 17, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = lit ? '#e24b4a' : '#a32d2d';
    ctx.beginPath();
    for (var si = 0; si < 10; si++) {
      var ang = -Math.PI / 2 + si * Math.PI / 5;
      var rr = (si % 2 === 0) ? 7 : 3;
      var sxp = cx + Math.cos(ang) * rr, syp = gy - 466 + Math.sin(ang) * rr;
      if (si === 0) ctx.moveTo(sxp, syp); else ctx.lineTo(sxp, syp);
    }
    ctx.closePath(); ctx.fill();

    // Vertical «БАНЯ» board hanging under the first eave (stacked letters).
    ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 62, gy - 118); ctx.lineTo(cx - 62, gy - 112); ctx.stroke();
    if (lit) {
      ctx.fillStyle = 'rgba(255,184,92,' + (0.07 * night) + ')';
      ctx.fillRect(cx - 84, gy - 116, 44, 96);
    }
    ctx.fillStyle = '#241810'; ctx.fillRect(cx - 76, gy - 112, 28, 88);
    ctx.strokeStyle = '#b5723a'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - 75, gy - 111, 26, 86);
    ctx.fillStyle = lit ? '#f0c66a' : '#e0b060';
    ctx.font = 'bold 16px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Б', cx - 62, gy - 100);
    ctx.fillText('А', cx - 62, gy - 78);
    ctx.fillText('Н', cx - 62, gy - 56);
    ctx.fillText('Я', cx - 62, gy - 34);

    // Door: dark opening + felt flap + step lantern.
    ctx.fillStyle = '#14100e';
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, banyaDoorX1 - banyaDoorX0, 80);
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, banyaDoorX1 - banyaDoorX0, 32);
    ctx.strokeStyle = '#6e3a2c'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(banyaDoorX0, BANYA_DOOR_Y0 + 32);
    ctx.quadraticCurveTo(banyaDoorX0 + 11, BANYA_DOOR_Y0 + 40, banyaDoorX0 + 22, BANYA_DOOR_Y0 + 32);
    ctx.quadraticCurveTo(banyaDoorX0 + 33, BANYA_DOOR_Y0 + 40, banyaDoorX1, BANYA_DOOR_Y0 + 32);
    ctx.stroke();
    // Iron door handle + hinge plates on the jamb.
    ctx.strokeStyle = '#8a95a0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(banyaDoorX1 - 8, BANYA_DOOR_Y0 + 52, 3, 0, 6.283); ctx.stroke();
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(banyaDoorX0 + 1, BANYA_DOOR_Y0 + 40, 3, 6);
    ctx.fillRect(banyaDoorX0 + 1, BANYA_DOOR_Y0 + 62, 3, 6);
    lantern(banyaDoorX0 - 11, BANYA_DOOR_Y0 - 2);

    // Lived-in props: a bench on the GROUND beside the tower, and a rain
    // barrel on the plinth right of the door.
    ctx.fillStyle = '#54381f';
    ctx.fillRect(x - 48, gy - 9, 3, 9); ctx.fillRect(x - 24, gy - 9, 3, 9);
    ctx.fillStyle = '#b96b48'; ctx.fillRect(x - 52, gy - 12, 34, 4);
    ctx.fillStyle = '#2c1408'; ctx.fillRect(x - 52, gy - 8, 34, 1);
    ctx.fillStyle = '#6e4526'; ctx.fillRect(cx + 68, gy - 40, 16, 20);
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(cx + 67, gy - 36, 18, 2); ctx.fillRect(cx + 67, gy - 26, 18, 2);
    ctx.fillStyle = '#1f4f9e';
    ctx.beginPath(); ctx.ellipse(cx + 76, gy - 40, 7, 2.5, 0, 0, 6.283); ctx.fill();

    // Walk-in hint when the rig is near.
    var near = Math.abs((player.x + PLAYER_W / 2) - (banyaX + BANYA_W / 2)) < 9 * TILE;
    if (near && !bathMode) {
      var pa = 0.55 + 0.35 * Math.sin(bathPromptT * 4);
      ctx.fillStyle = 'rgba(224,176,96,' + pa + ')';
      ctx.font = '12px "Commit Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('enter', (banyaDoorX0 + banyaDoorX1) / 2, BANYA_DOOR_Y0 - 10);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ---- Hook 3: render() top (140). Draws the whole TOWER scene, floor by
  // floor, and consumes the frame. The liquid layer is a separate DOM
  // canvas above this one, so calling drawLiquids() keeps the water live. --
  function bathRenderScene() {
    if (!bathMode) return false;
    // Own the WHOLE canvas: the world viewport excludes the console strip,
    // so without this full-screen clear the strip keeps last frame's stale
    // console pixels (found the hard way). Then rebuild the world transform
    // (no screenshake in here) and draw in world coords.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120d08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var _bws = dpr * worldScale;
    ctx.setTransform(_bws, 0, 0, _bws,
      -Math.round(cam.x * _bws), -Math.round(cam.y * _bws));
    var lt = performance.now() * 0.001;
    function lamp(lx, ly) {
      var fl = 0.9 + 0.1 * Math.sin(lt * 3 + lx);
      ctx.fillStyle = 'rgba(255,184,92,0.05)';
      ctx.beginPath(); ctx.arc(lx, ly, 88, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,184,92,0.09)';
      ctx.beginPath(); ctx.arc(lx, ly, 44, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#54381f'; ctx.fillRect(lx - 3, ly - 26, 6, 18);
      ctx.fillStyle = 'rgba(255,206,106,' + fl + ')';
      ctx.beginPath(); ctx.arc(lx, ly, 5, 0, 6.283); ctx.fill();
    }
    // The elevator: one aligned shaft (cols 27-29), a door per floor. Owned
    // floors' doors slide open ambiently (staggered phases); locked floors
    // stay shut with a dead indicator lamp. Slime traffic arrives with B7.
    function elevator(F, fi, owned) {
      var ex = 27 * TILE + 8, ew = 3 * TILE - 16, eh = 3 * TILE - 12;
      var ey = F.fr * TILE - eh;
      ctx.fillStyle = '#39424c'; ctx.fillRect(ex - 8, ey - 16, ew + 16, eh + 16);
      ctx.fillStyle = '#4a5560'; ctx.fillRect(ex - 5, ey - 11, ew + 10, eh + 11);
      ctx.fillStyle = owned ? '#e8b53a' : '#57504a';
      ctx.beginPath(); ctx.arc(ex + ew / 2 - 10, ey - 5, 3.5, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#cfd6dd';
      ctx.font = 'bold 10px "Commit Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(fi + 1), ex + ew / 2 + 12, ey - 5);
      ctx.fillStyle = '#0d0a07'; ctx.fillRect(ex, ey, ew, eh);
      var openK = 0;
      if (owned) {
        var ph = Math.sin(lt * 0.7 + fi * 2.3);
        openK = ph > 0 ? ph * ph * ph * ph : 0;
      }
      if (openK > 0.02) {
        ctx.strokeStyle = '#2c343c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ex + ew / 2, ey); ctx.lineTo(ex + ew / 2, ey + 24); ctx.stroke();
      }
      var half = ew / 2, slide = half * 0.94 * openK;
      ctx.save();
      ctx.beginPath(); ctx.rect(ex, ey, ew, eh); ctx.clip();
      ctx.fillStyle = '#6f7b86';
      ctx.fillRect(ex - slide, ey, half - 1, eh);
      ctx.fillRect(ex + half + 1 + slide, ey, half - 1, eh);
      ctx.fillStyle = '#5a6570';
      ctx.fillRect(ex - slide + half - 4, ey, 3, eh);
      ctx.fillRect(ex + half + 1 + slide, ey, 3, eh);
      ctx.restore();
    }
    var f, i, F;
    for (f = 0; f < BATH_FLOORS.length; f++) {
      F = BATH_FLOORS[f];
      var ix = F.c0 * TILE, iy = (F.fr - 7) * TILE;
      var iw = (F.c1 - F.c0 + 1) * TILE, ih = 7 * TILE;
      if (iy > cam.y + bathViewH + 200 || iy + ih < cam.y - 200) continue;
      // Back wall planking, pushed back by a wash (the sauna runs warmer).
      drawWoodPlanking(ix, iy, iw, ih, 8);
      ctx.fillStyle = F.sauna ? 'rgba(34,12,4,0.30)' : 'rgba(10,6,3,0.42)';
      ctx.fillRect(ix, iy, iw, ih);
      // Side pillars hugging this floor's shell (they step with the taper).
      ctx.fillStyle = '#241810';
      ctx.fillRect(ix - TILE - 6, iy - TILE, TILE + 6, ih + 2 * TILE);
      ctx.fillRect(ix + iw, iy - TILE, TILE + 6, ih + 2 * TILE);
      // The slab underfoot: plank beam with a dark wash + top edge.
      drawWoodPlanking(ix - TILE, F.fr * TILE, iw + 2 * TILE, TILE, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(ix - TILE, F.fr * TILE, iw + 2 * TILE, TILE);
      ctx.fillStyle = '#54381f';
      ctx.fillRect(ix - TILE, F.fr * TILE, iw + 2 * TILE, 4);
      lamp(ix + 40, iy + 62);
      lamp(ix + iw - 40, iy + 62);
      // v25.88: the vessel itself is drawn on the FOREGROUND layer (above
      // the water canvas) so the water's square corners hide behind its
      // curve. Here on the room canvas: only the dark sub-floor band the
      // recessed shafts sink through.
      if (F.tubs.length) {
        ctx.fillStyle = '#1a120b';
        ctx.fillRect(ix - TILE, F.fr * TILE + 8, iw + 2 * TILE, (F.sink + 1) * TILE - 8);
      }
      if (F.sauna) {
        // Bench tiers over the solid tiles, the kamenka stove with hot
        // rocks and an ember glow, and the ПАРИЛКА plaque.
        drawWoodPlanking(ix + 4 * TILE, (F.fr - 2) * TILE, 4 * TILE, TILE, 5);
        drawWoodPlanking(ix + 4 * TILE, (F.fr - 1) * TILE, 7 * TILE, TILE, 5);
        var kx = (F.c1 - 3) * TILE, ky = (F.fr - 3) * TILE;
        ctx.fillStyle = '#4a5560'; ctx.fillRect(kx, ky, 2 * TILE, 3 * TILE);
        ctx.fillStyle = '#39424c'; ctx.fillRect(kx - 4, ky - 6, 2 * TILE + 8, 8);
        ctx.fillStyle = '#1c130c'; ctx.fillRect(kx + 8, ky + 40, 2 * TILE - 16, 26);
        ctx.fillStyle = 'rgba(255,122,42,0.10)';
        ctx.beginPath(); ctx.arc(kx + TILE, ky + 50, 46, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#ff7a2a';
        ctx.beginPath(); ctx.arc(kx + TILE, ky + 53, 9, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#3a3f46';
        ctx.beginPath(); ctx.arc(kx + 20, ky + 10, 7, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(kx + 36, ky + 5, 8, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(kx + 50, ky + 11, 6, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#241810'; ctx.fillRect(ix + iw / 2 - 64, iy + 8, 128, 28);
        ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2;
        ctx.strokeRect(ix + iw / 2 - 63, iy + 9, 126, 26);
        ctx.fillStyle = '#e0b060';
        ctx.font = 'bold 15px "Commit Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ПАРИЛКА', ix + iw / 2, iy + 22);
      }
      elevator(F, f, bathFloorsOwned[f]);
      // Locked floors: gray the whole floor down, then the purchase button.
      if (!bathFloorsOwned[f]) {
        ctx.fillStyle = 'rgba(82,76,70,0.40)';
        ctx.fillRect(ix - TILE - 6, iy - TILE, iw + 2 * TILE + 12, ih + 2 * TILE);
        ctx.fillStyle = 'rgba(12,9,7,0.38)';
        ctx.fillRect(ix - TILE - 6, iy - TILE, iw + 2 * TILE + 12, ih + 2 * TILE);
        var R = bathBuyRect(f);
        var canBuy = (typeof money === 'number') && money >= F.price;
        var flash = performance.now() < bathBuyFlash[f];
        ctx.fillStyle = canBuy ? '#2e4a2e' : '#3a2f28';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(R.x, R.y, R.w, R.h, 10);
        else ctx.rect(R.x, R.y, R.w, R.h);
        ctx.fill();
        ctx.strokeStyle = flash ? '#e24b4a' : '#e0b060'; ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#f0dfae';
        ctx.font = 'bold 17px "Commit Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('КУПИТЬ ЭТАЖ ' + (f + 1), R.x + R.w / 2, R.y + 20);
        ctx.fillStyle = flash ? '#ff8a80' : (canBuy ? '#b8e0a0' : '#c9b090');
        ctx.font = 'bold 15px "Commit Mono", monospace';
        ctx.fillText('$' + bathFmtMoney(F.price), R.x + R.w / 2, R.y + 43);
      }
    }
    // «БАНЯ» sign on the bottom floor's back wall.
    var F1 = BATH_FLOORS[0];
    ctx.fillStyle = '#241810';
    ctx.fillRect(BATH_CX_COL * TILE - 78, (F1.fr - 7) * TILE + 8, 156, 34);
    ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2;
    ctx.strokeRect(BATH_CX_COL * TILE - 77, (F1.fr - 7) * TILE + 9, 154, 32);
    ctx.fillStyle = '#e0b060';
    ctx.font = 'bold 21px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('БАНЯ', BATH_CX_COL * TILE, (F1.fr - 7) * TILE + 25);
    // FOREGROUND (v25.88): the tub vessels live on the uiTop canvas, ABOVE
    // the water layer, as a stone plate with a smooth-U hole cut out: the
    // water shows through the hole and its square tile-corners hide behind
    // the plate, so the bowl finally reads as a curved vessel.
    var uiFg = (typeof uiTopEnsure === 'function') ? uiTopEnsure() : null;
    if (uiFg && typeof uiTopCanvas !== 'undefined' && uiTopCanvas) {
      uiFg.setTransform(1, 0, 0, 1, 0, 0);
      uiFg.clearRect(0, 0, uiTopCanvas.width, uiTopCanvas.height);
      uiFg.setTransform(_bws, 0, 0, _bws,
        -Math.round(cam.x * _bws), -Math.round(cam.y * _bws));
      for (var ff = 0; ff < BATH_FLOORS.length; ff++) {
        var FG = BATH_FLOORS[ff];
        if (!bathFloorsOwned[ff]) continue;   // vessels appear on purchase
        var fgy = (FG.fr - 7) * TILE;
        if (fgy > cam.y + bathViewH + 200 || fgy + 7 * TILE < cam.y - 200) continue;
        for (var fti = 0; fti < FG.tubs.length; fti++) {
          var ftb = FG.tubs[fti];
          var fx0 = (ftb[0] - 1) * TILE, fx1 = (ftb[1] + 2) * TILE;
          var lipY = (FG.fr - FG.lip) * TILE, botY = (FG.fr + FG.sink + 1) * TILE;
          var crv2 = bathTubCurve(FG, ftb);
          uiFg.fillStyle = '#8b887c';
          uiFg.beginPath();
          uiFg.rect(fx0 - 4, lipY - 6, (fx1 - fx0) + 8, botY - lipY + 4);
          uiFg.moveTo(crv2.x0, lipY - 6);
          for (var sx2 = crv2.x0; sx2 <= crv2.x1; sx2 += 8) {
            uiFg.lineTo(sx2, crv2.y0 + crv2.depthAt(sx2));
          }
          uiFg.lineTo(crv2.x1, crv2.y0 + crv2.depthAt(crv2.x1));
          uiFg.lineTo(crv2.x1, lipY - 6);
          uiFg.closePath();
          uiFg.fill('evenodd');
          uiFg.fillStyle = '#b5723a';
          uiFg.fillRect(fx0 - 4, lipY - 8, TILE + 10, 6);
          uiFg.fillRect(fx1 - TILE - 6, lipY - 8, TILE + 10, 6);
          // The spring vent at the bowl's lowest point: slot + warm glow.
          var vcx = (crv2.x0 + crv2.x1) / 2;
          var vby = crv2.y0 + crv2.depthAt(vcx);
          uiFg.fillStyle = 'rgba(255,140,60,0.20)';
          uiFg.beginPath(); uiFg.arc(vcx, vby + 6, 30, 0, 6.283); uiFg.fill();
          uiFg.fillStyle = '#5a4630';
          uiFg.fillRect(vcx - 16, vby - 2, 32, 8);
          uiFg.fillStyle = '#b5723a';
          uiFg.fillRect(vcx - 16, vby - 4, 32, 3);
          uiFg.fillStyle = '#2b2b2b';
          uiFg.fillRect(fx0 + 6, botY - 22, 3, 3);
          uiFg.fillRect(fx1 - 10, botY - 30, 3, 3);
        }
      }
    }
    // Payment floats: little "+$25" thanks rising off departing guests.
    for (var pf = 0; pf < bathFloats.length; pf++) {
      var FF = bathFloats[pf];
      ctx.fillStyle = 'rgba(232,181,58,' + (1 - FF.t / 1.3).toFixed(3) + ')';
      ctx.font = 'bold 15px "Commit Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(FF.s, FF.x, FF.y - FF.t * 26);
    }
    // The guests (jello renders on the main canvas; the world render that
    // normally draws them is skipped in bathMode, so the scene calls it).
    if (ENABLE_JELLO && typeof drawJelloBlobs === 'function') drawJelloBlobs();
    // Exit door + «ВЫХОД».
    ctx.fillStyle = '#0c0906';
    ctx.fillRect(BATH_EXIT_X0, BATH_EXIT_Y0, BATH_EXIT_X1 - BATH_EXIT_X0, BATH_EXIT_Y1 - BATH_EXIT_Y0);
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(BATH_EXIT_X0, BATH_EXIT_Y0, BATH_EXIT_X1 - BATH_EXIT_X0, 34);
    ctx.fillStyle = '#8a7a5a';
    ctx.font = '11px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('ВЫХОД', (BATH_EXIT_X0 + BATH_EXIT_X1) / 2, BATH_EXIT_Y0 - 8);
    // The live water (separate DOM canvas above; camera already pinned).
    if (typeof drawLiquids === 'function') drawLiquids();
    // The STEAM: the smoke display pass also lives in the world render
    // path this scene skips, so the scene drives it too (found the hard
    // way: dye was injected and stepped but never painted).
    if (typeof drawSmoke === 'function') drawSmoke();
    // Screen-space caption.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(224,176,96,0.75)';
    ctx.font = '13px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('scroll or drag to climb the tower · tap ВЫХОД (or ESC) to leave', canvas.width / 2, canvas.height - 26);
    // Wallet, top right, so buying a floor has visible consequence.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(240,223,174,0.9)';
    ctx.font = 'bold 14px "Commit Mono", monospace';
    ctx.fillText('$' + bathFmtMoney(typeof money === 'number' ? money : 0), canvas.width - 16, 30);
    ctx.textAlign = 'left';
    return true;
  }

  if (ENABLE_BATH) {
    window.bathTune = bathTune;
    window.__bath = { tune: bathTune, enter: bathEnter, exit: bathExit,
                      floor: bathScrollToFloor,
                      buy: bathBuyFloor,
                      guest: function () { return !!bathSpawnGuest(); },
                      steamTune: bathSteam,
                      dbg: function () { var g = bathGuests[0]; return JSON.stringify({ steam: bathDbg, uv: (typeof smokeFluidWorldToUV === 'function' ? smokeFluidWorldToUV(1100, 19560) : null), camY: Math.round(cam.y), guests: bathGuests.length, bodies: (typeof jelloBodies !== 'undefined' ? jelloBodies.length : -1), g: g ? { st: g.st, cx: Math.round(g.b.cx || -1), cy: Math.round(g.b.cy || -1), bb: [Math.round(g.b.bboxL), Math.round(g.b.bboxT), Math.round(g.b.bboxR), Math.round(g.b.bboxB)], vy: Math.round(g.b.vy || 0), slp: !!g.b.sleeping, tgt: Math.round(g.cx) } : null, solid: (function () { var out = []; for (var cc = 28; cc <= 33; cc++) { var t612 = world[612][cc], t613 = world[613][cc]; out.push(cc + ':' + (t612 ? t612.type[0] : '.') + (t613 ? t613.type[0] : '.')); } out.push('jws@' + (g ? Math.round(g.b.cx) : 0) + ',' + (g ? Math.round(g.b.bboxB + 4) : 0) + '=' + (g && typeof jelloWorldSolidAt === 'function' ? jelloWorldSolidAt(g.b.cx, g.b.bboxB + 4) : '?')); return out.join(' '); })() }); },
                      night: function (v) { bathNightOverride = (v === undefined || v === null) ? -1 : +v; },
                      warp: bathWarp,
                      get mode() { return bathMode; } };
    try {
      canvas.addEventListener('pointerdown', bathPointer);
      canvas.addEventListener('pointermove', bathPointerMove);
      canvas.addEventListener('pointerup', bathPointerUp);
      canvas.addEventListener('pointercancel', function () { bathPtrDown = false; });
      canvas.addEventListener('wheel', bathWheelScroll, { passive: false });
    } catch (e) {}
  }
