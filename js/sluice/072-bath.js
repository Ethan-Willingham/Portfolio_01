  /* ==== BANYA (v25.77): the other half of the game, first stone ==========
     Enabled by default (ENABLE_BATH, ?bath=0 disables). Live service rules:
     docs/game/BATHHOUSE_SERVICE.md; 074-bath-service.js owns the visitors.
     (section 0 pivot, B-D11, stages B6/B8). This fragment owns BOTH halves
     of the B6 slice:

     EXTERIOR: a tall banya tower drawn on the town surface (deck-relative
     siting, v25.78). Entry works like the shop (v26.31): a felt CURTAIN
     gathers open theater-tieback style as the rig approaches (bathDoorT,
     the shopDoorT ramp; curtain art v26.37), and getting in is deliberate:
     click/tap the tower whenever it is on screen (processPointerDown in
     050, beside isPointOnShop), or park at the door and press Enter/E.
     The old walk-in auto-enter is gone.

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
  var bathFloorsOwned = [true, false, false, false, false];   // persisted with the bathhouse
  var bathBuyFlash = [0, 0, 0, 0, 0];           // "not enough money" red blink until (ms)
  var BATH_TOP_ROW = 558;                       // F5 ceiling row (8-row floors)
  var BATH_BOT_ROW = 613;                       // F1 floor slab row
  var BATH_VIEW_W = 29 * TILE;                  // width-fit + headroom for the F2 peek
  var BATH_EXIT_X0 = 43 * TILE, BATH_EXIT_X1 = 46 * TILE;   // F1 right-wall door
  var BATH_EXIT_Y0 = 606 * TILE, BATH_EXIT_Y1 = 610 * TILE;

  var bathMode = false;        // true while inside the scene
  var bathRoomReady = false;   // room carved; fill and heat are supplied by the player
  var bathDoorT = 0;           // door-open progress 0..1 (shopDoorT pattern)
  var bathTransitionSerial = 0;
  var bathFading = false;      // transition lock
  var bathFadeEl = null;       // DOM fade overlay
  var bathPromptT = 0;         // pulse clock for the door hint

  function bathTune(name, v) {
    // Physics lanes go through setSimParam, the heat-tint look through
    // setRenderParam; unknown names are a no-op in each, so route to both.
    if (liquidWGPU && liquidWGPU.setSimParam)    liquidWGPU.setSimParam(name, v);
    if (liquidWGPU && liquidWGPU.setRenderParam) liquidWGPU.setRenderParam(name, v);
  }

  /* ==== TRUE SCALE (v26.06): the pool behaves k x bigger than it looks =
     Dynamic similarity, not levers. The read of "size" in fluid motion is
     the Froude number: big water plays the SAME shapes SLOWER (time goes
     as sqrt of length; movie miniatures are filmed overcranked for
     exactly this reason). One knob k = the implied size multiplier:
       water:  LIQUID_TIMESCALE / sqrt(k). The engine's banked-substep
               timescale replays identical per-substep physics at a
               slower wall clock, so waves, splashes, convection and heat
               transport all scale together, bit-faithfully.
       guests: real fall accel JELLO_GRAVITY / k and every brain impulse
               x 1/sqrt(k): the same trajectory SHAPES, stretched sqrt(k)
               in time. A giant slime moves like a giant.
       steam:  the smoke clock follows at 1/sqrt(k) (in bathSteamPush).
     Scene-scoped: pushed on enter, restored exactly on exit. Live dial:
     __bath.scale(k). ============================================= */
  var bathScaleK = 6;
  var bathScaleSaved = null;
  function bathScalePush() {
    if (bathScaleSaved || typeof JELLO_GRAVITY === 'undefined') return;
    var wts = 1.55;
    try {
      if (typeof gm !== 'undefined' && gm && gm.get) {
        var t = gm.get('water.TIMESCALE');
        if (typeof t === 'number' && isFinite(t) && t > 0) wts = t;
      }
    } catch (e) {}
    bathScaleSaved = { jg: JELLO_GRAVITY, wts: wts };
    bathScaleSetWaterTs(wts / Math.sqrt(bathScaleK));
    JELLO_GRAVITY = bathScaleSaved.jg / bathScaleK;
  }
  function bathScalePop() {
    if (!bathScaleSaved) return;
    bathScaleSetWaterTs(bathScaleSaved.wts);
    JELLO_GRAVITY = bathScaleSaved.jg;
    bathScaleSaved = null;
  }
  // Through the gm lever when it exists (so the owner's tuning panel and
  // gm.get always show the live truth), setSimParam directly otherwise.
  function bathScaleSetWaterTs(v) {
    try {
      if (typeof gm !== 'undefined' && gm && gm.set) { gm.set('water.TIMESCALE', v); return; }
    } catch (e) {}
    bathTune('TIMESCALE', v);
  }
  function bathScaleSet(k) {
    k = (typeof k === 'number' && isFinite(k) && k >= 1) ? k : 1;
    var inside = !!bathScaleSaved;
    if (inside) { bathScalePop(); bathSteamPop(); }
    bathScaleK = k;
    if (inside) { bathSteamPush(); bathScalePush(); }
    return bathScaleK;
  }
  // Every guest impulse runs through here, so the sqrt(k) stretch is one
  // multiply: same hop arcs, giant timing.
  function bathScaleV() {
    return bathScaleSaved ? 1 / Math.sqrt(bathScaleK) : 1;
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
    // Newly opened tubs are dry. Only water brought in the rig fills them.
    if (f === 0) bathArmHeat();
  }

  function bathArmHeat() {
    var F = BATH_FLOORS[0], tb = F.tubs[0];
    var curve = bathTubCurve(F, tb);
    var cx = (curve.x0 + curve.x1) / 2, by = curve.y0 + curve.depthAt(cx);
    bathTune('BATH_SRC_X0', cx - 68); bathTune('BATH_SRC_X1', cx + 68);
    bathTune('BATH_SRC_Y0', by - 30); bathTune('BATH_SRC_Y1', by + 12);
    bathTune('BATH_SRC_T', Math.max(0, bathHeat) * 1.55); bathTune('BATH_SRC_RATE', bathFire > 0 ? 0.05 : 0);
    bathTune('BATH_ON', bathHeat > 0.01 && bathWater > 0 ? 1 : 0); bathTune('BATH_BUOY', 240); bathTune('BATH_COOL', 0.28);
    bathHotTub = { F: F, tb: tb, ventX: cx, ventHalf: 68 };
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
    if (bathRoomReady) bathFillFloor(f);
    saveNow('bath-floor');
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
    if (bathFading || (toInside && !ENABLE_BATH)) return;
    bathFading = true;
    var ticket = ++bathTransitionSerial;
    var el = bathFadeEnsure();
    el.style.opacity = '1';
    setTimeout(function () {
      if (ticket !== bathTransitionSerial) return;
      if (toInside && !ENABLE_BATH) toInside = false;
      if (toInside) {
        bathCarveRoom();
        bathScrollT = 1e9;   // enter at the BOTTOM floor
        bathCamY = -1;       // snap, no cross-tower pan on the first frame
        bathMode = true;
        hearthSetView('boiler');
        forgeStockCargo();
        bathDoorT = 1;       // step back out through an open door
        // Steam era (v25.85): drop the world's stale smoke, retune the
        // fluid for steam. Existing sky visitors keep their service states.
        try { if (typeof clearAllSmokeVisuals === 'function') clearAllSmokeVisuals(); } catch (e2) {}
        bathSteamPush();
        bathScalePush();
        bathArmHeat();
        siphonStop();
      } else {
        hearthCancelDrag();
        bathMode = false;
        bathScalePop();
        bathSteamPop();
        bathGuestColliders.length = 0;   // no stale fluid boundaries outside
      }
      bathLayerVis(toInside);
      el.style.opacity = '0';
      setTimeout(function () { if (ticket === bathTransitionSerial) bathFading = false; }, 240);
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
    if (!ENABLE_BATH && !bathMode) return false;
    bathPromptT += dt;
    if (!bathMode) {
      if (!bathPickSite()) return false;
      // v26.31 (owner): entry works like the shop. The felt curtain
      // gathers open as the rig approaches (same ramp rates as shopDoorT,
      // 350) and getting in is DELIBERATE: tap/click the tower (050) or
      // park at the door and press Enter/E/P (the shop's drive-up keys).
      // The old walk-in auto-enter swallowed drive-bys.
      var dcx = (banyaDoorX0 + banyaDoorX1) / 2;
      var dcy = (BANYA_DOOR_Y0 + BANYA_DOOR_Y1) / 2;
      var nearDoor = Math.abs((player.x + PLAYER_W / 2) - dcx) < TILE * 4 &&
                     Math.abs((player.y + PLAYER_H / 2) - dcy) < TILE * 4;
      if (nearDoor) bathDoorT = Math.min(1, bathDoorT + dt / 0.35);
      else          bathDoorT = Math.max(0, bathDoorT - dt / 0.45);
      var over = player.x < banyaDoorX1 && player.x + PLAYER_W > banyaDoorX0 &&
                 player.y < BANYA_DOOR_Y1 && player.y + PLAYER_H > BANYA_DOOR_Y0;
      var grounded = !(typeof player.onGround === 'boolean' && !player.onGround);
      var pressEnter = !!(keys['Enter'] || keys['e'] || keys['E'] ||
                          keys['p'] || keys['P']);
      if (over && grounded && pressEnter && !bathFading) {
        keys['Enter'] = false; keys['e'] = false; keys['E'] = false;
        keys['p'] = false; keys['P'] = false;
        bathEnter();
      }
      return false;
    }
    if (keys['Escape']) { keys['Escape'] = false; bathExit(); }
    bathSteamTick(dt);
    if (keys['e'] || keys['E'] || keys['Enter']) {
      keys['e'] = false; keys['E'] = false; keys['Enter'] = false;
      for (var gi = 0; gi < bathGuests.length; gi++) {
        if (bathGuests[gi].st === 'wait') { bathServe(bathGuests[gi].s.id); break; }
      }
    }
    return true;
  }

  /* ==== BANYA PHYSICS (v25.85): steam + the first guest ==================
     STEAM: the smoke backend runs in STEAM MODE while inside (the world is
     paused, so there is no conflict): shorter-lived dye, low curl so it
     billows instead of swirling, emitted from the water surface of every
     HOT tub (fill mode 2) and left to pool under the rafters. Values are
     scaled from the live smokeTune fields and restored exactly on exit, so
     the world's smoke look is untouched whatever its tuning.
     GUESTS: the clay sky visitors are shared with the surface. Service,
     hop paths, buoyancy, fluid colliders, and permanent splash loss live
     in 074-bath-service.js. No independent indoor guest spawner remains.
     ======================================================================= */
  var bathDbg = { steamCalls: 0, steamActive: 0, steamInView: 0, steamSplats: 0 };
  var bathSteamSaved = null;
  var bathSteamAcc = 0;
  // v26.00 FOG + THERMALS (the owner's picture, verbatim: "thin fog just
  // above the water on a lake, but some of it accumulating to mushroom up
  // since there is heat involved, and as it rises it sucks from the
  // immediate surrounding layer of fog").
  //   fog:      a calm blanket hugging the WHOLE surface: many tiny
  //             near-still splats a second, edge to edge, barely lifting.
  //   thermals: every few seconds a spot gathers and RISES for ~1.5s.
  //             The column is mostly MOMENTUM: zero-dye velocity splats
  //             pull the existing fog inward at the base (entrainment,
  //             the "sucking") and drive it upward, so the mushroom is
  //             built from the blanket itself, plus a little dye of its
  //             own. Ramped in and out; nothing pops.
  // All dials on __bath.steamTune.
  var bathSteam = {
    rate: 230, amt: 0.016, rise: 0.3,                      // the fog blanket
    thermEvery: 1.1, thermDur: 1.0, thermAmt: 0.02,
    thermRise: 1.15, thermR: 0.016, suck: 1.0
  };
  var bathSteamCol = { r: 0, g: 0, b: 0 };
  var bathSteamTherms = [];    // live thermals {x, t, dur, wig, ph}
  var bathSteamThermT = 1.2;
  // v26.01: the LIVE water surface. The fog must hug the actual water,
  // not the fill line: a plunge, a wave, a drained tub all move it. Every
  // few frames, bucket the liquid engine's CPU mirror over the hot tub
  // into 12 px columns, keep the highest particle per column, and median-
  // filter with the neighbors so one stray droplet cannot yank the fog
  // up. Empty buckets (and the pre-mirror boot) fall back to the fill
  // line. The mirror refreshes every LIQUID_READBACK_EVERY (20) frames,
  // so the fog trails a splash by ~a third of a second: watchable, calm.
  var bathSurf = { tick: 0, x0: 0, n: 0, ys: null, raw: null };
  function bathSurfRefresh(wl) {
    bathSurf.tick--;
    if (bathSurf.tick > 0 && bathSurf.ys) return;
    bathSurf.tick = 8;
    if (!bathHotTub || typeof liquidCount === 'undefined' ||
        typeof liquidX === 'undefined' || !liquidCount) return;
    var htb = bathHotTub.tb;
    var x0 = htb[0] * TILE, x1 = (htb[1] + 1) * TILE;
    var n = Math.ceil((x1 - x0) / 12);
    if (!bathSurf.ys || bathSurf.n !== n) {
      bathSurf.ys = new Float32Array(n);
      bathSurf.raw = new Float32Array(n);
      bathSurf.n = n;
    }
    bathSurf.x0 = x0;
    var yLo = wl - 90, yHi = wl + 110, i, b;
    for (b = 0; b < n; b++) bathSurf.raw[b] = 0;
    var fro = (typeof liquidFrozen !== 'undefined') ? liquidFrozen : null;
    for (i = 0; i < liquidCount; i++) {
      if (fro && fro[i]) continue;
      var px = liquidX[i];
      if (px < x0 || px >= x1) continue;
      var py = liquidY[i];
      if (py < yLo || py > yHi) continue;
      b = ((px - x0) / 12) | 0;
      if (!bathSurf.raw[b] || py < bathSurf.raw[b]) bathSurf.raw[b] = py;
    }
    for (b = 0; b < n; b++) {
      var a1 = bathSurf.raw[b > 0 ? b - 1 : b] || wl;
      var a2 = bathSurf.raw[b] || wl;
      var a3 = bathSurf.raw[b < n - 1 ? b + 1 : b] || wl;
      var m = Math.max(Math.min(a1, a2), Math.min(Math.max(a1, a2), a3));
      bathSurf.ys[b] = m < wl - 60 ? wl - 60 : (m > wl + 90 ? wl + 90 : m);
    }
  }
  function bathSurfY(x, wl) {
    if (!bathSurf.ys) return wl;
    var b = ((x - bathSurf.x0) / 12) | 0;
    if (b < 0 || b >= bathSurf.n) return wl;
    return bathSurf.ys[b] || wl;
  }
  function bathSteamPush() {
    if (typeof smokeTune === 'undefined' || bathSteamSaved) return;
    bathSteamSaved = {
      dd: smokeTune.sim_density_dissipation,
      vd: smokeTune.sim_velocity_dissipation,
      curl: smokeTune.sim_curl,
      ts: smokeTune.sim_time_scale
    };
    // Scale, never set: polarity-proof against whatever the smoke tuning is.
    // Longer-lived dye so plumes can climb the room, a touch more curl so
    // risen steam wanders (past 1.2x it amplifies grid-frequency wiggles
    // and the steam turns blocky), a livelier clock.
    smokeTune.sim_density_dissipation = bathSteamSaved.dd * 0.47;
    smokeTune.sim_curl = bathSteamSaved.curl * 1.12;
    // The steam clock follows the true-scale stretch (v26.06): a giant
    // pool's steam climbs slowly relative to its size.
    smokeTune.sim_time_scale = bathSteamSaved.ts * 1.35 / Math.sqrt(bathScaleK);
    // v25.98: run the steam sim FINER while inside. The world is paused,
    // so the whole physics budget is the room's: ~2x the velocity grid
    // (curl detail lives there) and near-full-res dye. Desktop WebGPU
    // only; pop recomputes the standard resolution from the canvas.
    if (typeof smokeWGPUDriving !== 'undefined' && smokeWGPUDriving &&
        typeof smokeWGPUResDims === 'function' && !isMobile &&
        typeof smokeFluidWidth === 'number' && smokeFluidWidth > 0) {
      var bsSim = smokeWGPUResDims(288, smokeFluidWidth, smokeFluidHeight);
      var bsDye = smokeWGPUResDims(
        Math.min(Math.min(smokeFluidWidth, smokeFluidHeight), 1080),
        smokeFluidWidth, smokeFluidHeight);
      try {
        smokeWGPU.resize(bsSim.w, bsSim.h, bsDye.w, bsDye.h);
        bathSteamSaved.res = true;
      } catch (e) {}
    }
  }
  function bathSteamPop() {
    if (!bathSteamSaved || typeof smokeTune === 'undefined') return;
    smokeTune.sim_density_dissipation = bathSteamSaved.dd;
    smokeTune.sim_velocity_dissipation = bathSteamSaved.vd;
    smokeTune.sim_curl = bathSteamSaved.curl;
    smokeTune.sim_time_scale = bathSteamSaved.ts;
    if (bathSteamSaved.res && typeof smokeWGPUApplyRes === 'function' &&
        typeof smokeFluidWidth === 'number') {
      try { smokeWGPUApplyRes(smokeFluidWidth, smokeFluidHeight); } catch (e) {}
    }
    bathSteamSaved = null;
    bathSteamTherms.length = 0;
  }
  var bathHotTub = null;
  function bathSteamSplat(wx, wy, vx, vy, amt, r) {
    var uv = smokeFluidWorldToUV(wx, wy);
    if (!uv.inView) return;
    bathDbg.steamInView++;
    smokeMarkActive();
    bathSteamCol.r = amt * 0.92;
    bathSteamCol.g = amt * 0.97;
    bathSteamCol.b = amt * 1.05;
    smokeDriver.splat(uv.uvX, uv.uvY, vx, vy, bathSteamCol, r);
    bathDbg.steamSplats++;
  }
  // The veil's density along the surface: three drifting waves summed, a
  // poor man's Perlin. Smooth in x, slow in t, so the curtain of steam is
  // denser here and thinner there and the pattern WANDERS, never pops.
  function bathSteamVeilW(x, t) {
    var w = 0.52
      + 0.30 * Math.sin(x * 0.026 + t * 0.9)
      + 0.20 * Math.sin(x * 0.019 - t * 0.6 + 1.7)
      + 0.14 * Math.sin(x * 0.060 + t * 1.7 + 4.2);
    return w < 0.12 ? 0.12 : (w > 1 ? 1 : w);
  }
  function bathSteamTick(dt) {
    if (bathHeat < 0.35 || bathWater < 500) return;
    bathDbg.steamCalls++;
    if (typeof smokeDriver === 'undefined' || !smokeDriver) return;
    if (typeof smokeFluidActive === 'undefined' || !smokeFluidActive) return;
    bathDbg.steamActive++;
    var tnow = performance.now() / 1000;
    // Room draft: a slow coherent side-to-side breath shared by all steam.
    var draft = 0.13 * Math.sin(tnow * 0.23) + 0.06 * Math.sin(tnow * 0.71);
    // The live surface first: every emission height below rides it.
    if (bathHotTub) {
      bathSurfRefresh((bathHotTub.F.fr - bathHotTub.F.lip) * TILE + 10);
    }
    // Layer 1: THE FOG BLANKET. Many tiny near-still splats a second,
    // edge to edge, hugging the LIVE waterline, barely lifting: a calm
    // thin fog on the water, its thickness wandering with the field,
    // its shape following every wave and plunge.
    bathSteamAcc += dt * bathSteam.rate;
    var units = bathSteamAcc | 0; bathSteamAcc -= units;
    if (units > 8) units = 8;
    for (var u = 0; u < units; u++) {
      for (var f = 0; f < BATH_FLOORS.length; f++) {
        if (!bathFloorsOwned[f]) continue;
        var F = BATH_FLOORS[f];
        for (var i = 0; i < F.tubs.length; i++) {
          if (F.fill[i] !== 2) continue;
          var tb = F.tubs[i];
          var wl = (F.fr - F.lip) * TILE + 10;
          var x0 = tb[0] * TILE + 12, x1 = (tb[1] + 1) * TILE - 12;
          var sx = x0 + Math.random() * (x1 - x0);
          var w = 0.7 + 0.3 * bathSteamVeilW(sx, tnow);
          bathSteamSplat(sx, bathSurfY(sx, wl) - 5,
            draft + (Math.random() - 0.5) * 0.2,
            bathSteam.rise * (0.5 + Math.random() * 0.8) * w,
            bathSteam.amt * w * (0.8 + Math.random() * 0.4),
            0.016 + Math.random() * 0.012);
        }
      }
    }
    if (!bathHotTub) return;
    var HF = bathHotTub.F;
    var hwl = (HF.fr - HF.lip) * TILE + 10;
    var htb = bathHotTub.tb;
    // Layer 2: THERMALS. Every few seconds a spot on the surface gathers
    // and rises. The column is mostly MOMENTUM: zero-dye velocity splats
    // at the fog layer flanking the base pull the blanket INWARD (the
    // entrainment the owner asked for), an updraft splat lifts what
    // gathered, and a modest dye trickle seeds the core. The mushroom is
    // made of the fog it swallowed.
    bathSteamThermT -= dt;
    if (bathSteamThermT <= 0 && bathSteamTherms.length < 4) {
      bathSteamThermT = bathSteam.thermEvery * (0.6 + Math.random() * 0.9);
      var tx;
      if (bathHotTub.ventX && Math.random() < 0.6) {
        tx = bathHotTub.ventX + (Math.random() - 0.5) * bathHotTub.ventHalf * 1.8;
      } else {
        tx = htb[0] * TILE + 26 +
             Math.random() * ((htb[1] - htb[0] + 1) * TILE - 52);
      }
      bathSteamTherms.push({
        x: tx, t: 0,
        dur: bathSteam.thermDur * (0.7 + Math.random() * 0.7),
        wig: 1.5 + Math.random() * 2.5,
        ph: Math.random() * 6.28
      });
    }
    for (var q = bathSteamTherms.length - 1; q >= 0; q--) {
      var T = bathSteamTherms[q];
      T.t += dt;
      if (T.t > T.dur) { bathSteamTherms.splice(q, 1); continue; }
      var tfr = T.t / T.dur;
      // Strength ramps in over ~0.35s, lets go over the back half.
      var ts = Math.min(T.t / 0.35, 1) * (1 - 0.45 * tfr);
      var cx = T.x + Math.sin(T.t * T.wig + T.ph) * 4;
      var csy = bathSurfY(cx, hwl);
      // Entrainment: momentum-only splats in the fog layer either side
      // of the base, velocity pointing INTO the column, each riding the
      // live surface height under it.
      var gap = 22 + 8 * tfr;
      bathSteamCol.r = 0; bathSteamCol.g = 0; bathSteamCol.b = 0;
      var uvL = smokeFluidWorldToUV(cx - gap, bathSurfY(cx - gap, hwl) - 7);
      if (uvL.inView) {
        smokeMarkActive();
        smokeDriver.splat(uvL.uvX, uvL.uvY,
          bathSteam.suck * ts, bathSteam.suck * ts * 0.15,
          bathSteamCol, 0.020);
      }
      var uvR = smokeFluidWorldToUV(cx + gap, bathSurfY(cx + gap, hwl) - 7);
      if (uvR.inView) {
        smokeMarkActive();
        smokeDriver.splat(uvR.uvX, uvR.uvY,
          -bathSteam.suck * ts, bathSteam.suck * ts * 0.15,
          bathSteamCol, 0.020);
      }
      // The updraft at the base: lifts the fog the entrainment gathered.
      var uvU = smokeFluidWorldToUV(cx, csy - 9);
      if (uvU.inView) {
        smokeMarkActive();
        smokeDriver.splat(uvU.uvX, uvU.uvY,
          0, bathSteam.thermRise * ts * 1.3,
          bathSteamCol, 0.016);
      }
      // A modest dye trickle seeding the core, so the column reads even
      // where the blanket was thin.
      bathSteamSplat(cx, csy - 7 - tfr * 9,
        (Math.random() - 0.5) * 0.3,
        bathSteam.thermRise * ts * (0.7 + Math.random() * 0.3),
        bathSteam.thermAmt * ts * (0.8 + Math.random() * 0.4),
        bathSteam.thermR * (0.7 + 0.6 * tfr));
    }
  }

  // The fog reacts to a plunge with a white poof and a momentum shove
  // that parts the blanket (guests are not smoke obstacles, so the steam
  // layer cannot see the body on its own).
  function bathSplashPoof(ix, iy, k) {
    if (typeof smokeDriver === 'undefined' || !smokeDriver) return;
    if (typeof smokeFluidActive === 'undefined' || !smokeFluidActive) return;
    for (var s = -1; s <= 1; s += 2) {
      var uv = smokeFluidWorldToUV(ix + s * 20, iy - 8);
      if (uv.inView) {
        smokeMarkActive();
        bathSteamCol.r = 0; bathSteamCol.g = 0; bathSteamCol.b = 0;
        smokeDriver.splat(uv.uvX, uv.uvY, s * 1.7 * k, -0.2, bathSteamCol, 0.028);
      }
      bathSteamSplat(ix + s * 12, iy - 10, s * 0.6 * k, 1.1 * k,
        0.05 * k, 0.024);
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
    var maxY = (BATH_BOT_ROW + 1) * TILE + 12 - bathViewH + 96 / worldScale;
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

  // ---- Pointer: outside, tapping the tower enters via processPointerDown
  // (050, beside the shop's isPointOnShop, so the d-pad exclusion and shop
  // gates apply once). Inside, DRAG (mouse or finger) scrolls the tower, the
  // wheel scrolls it, and a TAP (movement under 10 css px) on the ВЫХОД door
  // leaves. One code path for touch and mouse via pointer events. -----------
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
    if (!ENABLE_BATH || bathFading || gamePaused) return;
    if (hearthPointerDown(e)) return;
    if (bathMode) {
      bathPtrDown = true; bathPtrX = e.clientX; bathPtrY = e.clientY;
      bathPtrMoved = 0;
    }
    // Outside: entering by tap lives in processPointerDown (050).
  }
  // World-coord hit test for the tower, the shop's isPointOnShop pattern:
  // generous bbox (the flared first eave is the widest part at cx +-104),
  // no proximity gate. If the tower is on screen and you click it, you
  // bathe. Called from processPointerDown (050) so the d-pad exclusion and
  // the shop-state/game-over gates apply in one place.
  function isPointOnBanya(wx, wy) {
    if (!ENABLE_BATH || bathMode || bathFading || !bathPickSite()) return false;
    var cx = banyaX + BANYA_W / 2;
    var gy = SKY_ROWS * TILE;
    return wx >= cx - 110 && wx <= cx + 110 && wy >= gy - 480 && wy <= gy;
  }
  function bathPointerMove(e) {
    if (bathMode && hearthPointerMove(e)) return;
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
    if (bathMode && hearthPointerUp(e)) return;
    var wasDown = bathPtrDown;
    bathPtrDown = false;
    if (!bathMode || !wasDown || bathFading) return;
    if (bathPtrMoved >= 10) return;   // it was a drag, not a tap
    var p = bathClientToWorld(e);
    if (!p) return;
    var rct = canvas.getBoundingClientRect();
    var cssX = (e.clientX - rct.left) * (canvas.width / dpr / rct.width);
    var cssY = (e.clientY - rct.top) * (canvas.height / dpr / rct.height);
    if (gamePaused || bathServicePointer(cssX, cssY) || bathOrderPointer(p.x, p.y)) return;
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
    if (hearthView !== 'bath') return;
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

    // Door (v26.39, owner: "way more attention and detail"): the FELT
    // CURTAIN detail pass. Two halves gather open theater-tieback style
    // on bathDoorT (smoothstepped): fuller along the pelmet-hidden rod,
    // a swag bowing toward center to a pinch at 0.66 height, a skirt
    // kicking back with a slight hem lift. PIXEL_ART.md applied: ONE
    // hue-shifted FELT ramp (cool-plum shadow end, warm highlight,
    // saturation peaking at base), FOUR fold bands per half at uneven
    // fractions with per-band bow/pinch jitter (anti-banding), seams
    // embossed as dark+light line pairs (no coloring-book outlines),
    // shadows as explicit ramp[0] pixels, a wavy hem (dark selout) that
    // sways under a pixel, a warm rim on the inner edge scaling with
    // the hall light, a BRASS tieback (left-biased glint, top-left
    // light) with a hanging tassel, and jamb AO where the fabric tucks
    // into the frame. The hall behind gets floorboard seams in the lamp
    // pool; the pelmet gains a top light, gather stripes, under-scallop
    // shadow and brass drop tassels; a pale nalichnik casing + crown
    // frames the door in the tower's own window language (win()).
    var dw = banyaDoorX1 - banyaDoorX0;
    var dh = BANYA_DOOR_Y1 - BANYA_DOOR_Y0;
    var cxD = (banyaDoorX0 + banyaDoorX1) / 2;
    var FELT0 = '#3a1f1e', FELT1 = '#572d26', FELT2 = '#8a4a3a',
        FELT3 = '#a55f42', FELT4 = '#c17a4e';
    var BRS0 = '#5c3010', BRS1 = '#a06020', BRS2 = '#e8b040';
    ctx.fillStyle = '#14100e';
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, dw, dh);
    if (bathDoorT > 0.04) {
      for (var dry = 2; dry < dh - 2; dry += 2) {
        var df = dry / (dh - 3), dwarm = df * df;   // quadratic: top stays dark
        ctx.fillStyle = 'rgba(' + ((148 + 88 * dwarm) | 0) + ',' +
          ((66 + 78 * dwarm) | 0) + ',' + ((26 + 40 * dwarm) | 0) + ',' +
          (bathDoorT * (0.05 + 0.4 * dwarm)).toFixed(3) + ')';
        ctx.fillRect(banyaDoorX0 + 1, BANYA_DOOR_Y0 + dry, dw - 2, 2);
      }
      // The oil lamp's pool, with floorboard seams catching the light.
      ctx.fillStyle = 'rgba(236,176,98,' + (bathDoorT * 0.30).toFixed(3) + ')';
      ctx.fillRect(banyaDoorX0 + 3, BANYA_DOOR_Y0 + dh - 7, dw - 6, 4);
      ctx.fillStyle = 'rgba(90,46,20,' + (bathDoorT * 0.55).toFixed(3) + ')';
      ctx.fillRect(banyaDoorX0 + 4, BANYA_DOOR_Y0 + dh - 9, dw - 8, 1);
      ctx.fillRect(banyaDoorX0 + 4, BANYA_DOOR_Y0 + dh - 5, dw - 8, 1);
    }
    // Fabric geometry. Distances run from the door CENTER toward the
    // jamb; -1 at closed overlaps the halves a pixel so no light leaks.
    var ct = bathDoorT * bathDoorT * (3 - 2 * bathDoorT);
    var cHalf = dw / 2;
    var cdT  = -1 + 14 * ct;          // inner edge along the rod
    var cdTi = -1 + 19 * ct;          // the tieback pinch (nearest the jamb)
    var cdB  = -1 + 16 * ct;          // hem corner (skirt kicks back in)
    var yTie = BANYA_DOOR_Y0 + dh * 0.66;
    var yBot = BANYA_DOOR_Y0 + dh - 5 * ct;
    // Four fold bands at uneven fractions of the remaining width (base
    // widest, per the flat-face rule); jitter breaks concentric edges.
    var bandFr  = [0, 0.20, 0.56, 0.82];
    var bandCol = [FELT3, FELT2, FELT1, FELT0];
    function bandD(d, bk) { return d + bandFr[bk] * (cHalf - d); }
    // Inner-edge trace, rod to hem corner. Each band bows a touch more
    // and pins its tieback a pixel off its neighbours; the open swag
    // breathes about a third of a pixel so tied fabric never sits dead.
    function curtainEdge(dir, bk, asMove, off) {
      var dT = bandD(cdT, bk) - off, dTi = bandD(cdTi, bk) - off,
          dB = bandD(cdB, bk) - off;
      var bow = (5 + 0.8 * bk) * ct + 0.35 * ct * Math.sin(t * 0.8 + dir * 1.7);
      var yT2 = yTie + ((bk * 7) % 5) - 2;
      if (asMove) ctx.moveTo(cxD + dir * dT, BANYA_DOOR_Y0);
      else        ctx.lineTo(cxD + dir * dT, BANYA_DOOR_Y0);
      ctx.quadraticCurveTo(cxD + dir * ((dT + dTi) / 2 - bow),
        (BANYA_DOOR_Y0 + yT2) / 2 + 4, cxD + dir * dTi, yT2);
      ctx.quadraticCurveTo(cxD + dir * (dTi + 1.5),
        (yT2 + yBot) / 2, cxD + dir * dB, yBot);
    }
    // Wavy hem from the band's hem corner back to the jamb floor line;
    // the wave phase drifts slowly, so the hem sways.
    function curtainHem(dir, bk) {
      var jx = cxD + dir * cHalf, fy = BANYA_DOOR_Y0 + dh;
      var hx = cxD + dir * bandD(cdB, bk), hy = yBot;
      for (var hs = 1; hs <= 3; hs++) {
        var nx = hx + (jx - hx) * hs / 3;
        var ny = hy + (fy - hy) * hs / 3;
        var mx = hx + (jx - hx) * (hs - 0.5) / 3;
        var my = hy + (fy - hy) * (hs - 0.5) / 3;
        ctx.quadraticCurveTo(mx,
          my - (1.6 + 0.8 * Math.sin(mx * 0.55 + dir * 2.1 + t * 1.15)),
          nx, ny);
      }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(banyaDoorX0, BANYA_DOOR_Y0, dw, dh); ctx.clip();
    for (var cs = 0; cs < 2; cs++) {
      var cDir = cs === 0 ? -1 : 1;
      var jxS = cxD + cDir * cHalf;
      // Band fills, lit inner band first, deep jamb band last.
      for (var cb = 0; cb < 4; cb++) {
        ctx.fillStyle = bandCol[cb];
        ctx.beginPath();
        ctx.moveTo(jxS, BANYA_DOOR_Y0);
        curtainEdge(cDir, cb, false, 0);
        curtainHem(cDir, cb);
        ctx.closePath();
        ctx.fill();
      }
      // Embossed fold seams: a ramp[0] crease plus a 1px lit line on
      // the brighter side (value-step seams, not outlines).
      ctx.lineWidth = 1.2;
      for (var sm = 1; sm < 4; sm++) {
        ctx.strokeStyle = FELT0;
        ctx.beginPath(); curtainEdge(cDir, sm, true, 0); ctx.stroke();
        if (sm < 3) {
          ctx.strokeStyle = sm === 1 ? FELT4 : FELT3;
          ctx.beginPath(); curtainEdge(cDir, sm, true, 1.3); ctx.stroke();
        }
      }
      // Hem selout in ramp[0] (the fabric's shadow side).
      ctx.strokeStyle = FELT0; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cxD + cDir * cdB, yBot);
      curtainHem(cDir, 0);
      ctx.stroke();
      // Warm rim on the inner edge: the hall's lamp catching the felt.
      ctx.strokeStyle = 'rgba(255,196,124,' + (0.12 + 0.32 * ct).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); curtainEdge(cDir, 0, true, 0); ctx.stroke();
      // Brass tieback across the bunch + a hanging tassel.
      if (ct > 0.55) {
        var cAl = (ct - 0.55) / 0.45;
        var tbw = cHalf - cdTi + 1;
        var tbx = cDir < 0 ? cxD - cHalf : cxD + cdTi - 1;
        ctx.globalAlpha = cAl;
        ctx.fillStyle = BRS0; ctx.fillRect(tbx, yTie - 3, tbw, 6);
        ctx.fillStyle = BRS1; ctx.fillRect(tbx, yTie - 2, tbw, 3);
        ctx.fillStyle = BRS2; ctx.fillRect(tbx + 1, yTie - 2, 2, 1);
        var tsx = Math.round(cxD + cDir * (cdTi + (cHalf - cdTi) * 0.5));
        ctx.fillStyle = FELT0; ctx.fillRect(tsx, yTie + 3, 1, 3);
        ctx.fillStyle = BRS1; ctx.fillRect(tsx - 1, yTie + 6, 3, 3);
        ctx.fillStyle = BRS2; ctx.fillRect(tsx - 1, yTie + 6, 1, 1);
        ctx.fillStyle = BRS0;
        ctx.fillRect(tsx - 1, yTie + 9, 1, 4);
        ctx.fillRect(tsx + 1, yTie + 9, 1, 4);
        ctx.fillStyle = BRS1; ctx.fillRect(tsx, yTie + 9, 1, 5);
        ctx.globalAlpha = 1;
      }
    }
    // AO where the fabric tucks into the frame (explicit ramp[0]).
    ctx.fillStyle = FELT0;
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, 1, dh);
    ctx.fillRect(banyaDoorX1 - 1, BANYA_DOOR_Y0, 1, dh);
    ctx.restore();
    // Felt pelmet over the lintel: top light, gather stripes, scallop
    // with an under-shadow, and brass drop tassels at the dips.
    ctx.fillStyle = FELT2;
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, dw, 32);
    ctx.fillStyle = FELT3;
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, dw, 1);
    ctx.fillStyle = FELT1;
    for (var pgx = banyaDoorX0 + 7; pgx < banyaDoorX1 - 3; pgx += 10)
      ctx.fillRect(pgx, BANYA_DOOR_Y0 + 3, 1, 26);
    ctx.strokeStyle = FELT0; ctx.lineWidth = 1;      // scallop cast shadow
    ctx.beginPath();
    ctx.moveTo(banyaDoorX0, BANYA_DOOR_Y0 + 34);
    ctx.quadraticCurveTo(banyaDoorX0 + 11, BANYA_DOOR_Y0 + 42, banyaDoorX0 + 22, BANYA_DOOR_Y0 + 34);
    ctx.quadraticCurveTo(banyaDoorX0 + 33, BANYA_DOOR_Y0 + 42, banyaDoorX1, BANYA_DOOR_Y0 + 34);
    ctx.stroke();
    ctx.strokeStyle = FELT1; ctx.lineWidth = 3;      // the scallop edge
    ctx.beginPath();
    ctx.moveTo(banyaDoorX0, BANYA_DOOR_Y0 + 32);
    ctx.quadraticCurveTo(banyaDoorX0 + 11, BANYA_DOOR_Y0 + 40, banyaDoorX0 + 22, BANYA_DOOR_Y0 + 32);
    ctx.quadraticCurveTo(banyaDoorX0 + 33, BANYA_DOOR_Y0 + 40, banyaDoorX1, BANYA_DOOR_Y0 + 32);
    ctx.stroke();
    ctx.fillStyle = BRS1;                            // drop tassels at the dips
    ctx.fillRect(banyaDoorX0 + 10, BANYA_DOOR_Y0 + 37, 2, 4);
    ctx.fillRect(banyaDoorX0 + 32, BANYA_DOOR_Y0 + 37, 2, 4);
    ctx.fillStyle = BRS2;
    ctx.fillRect(banyaDoorX0 + 10, BANYA_DOOR_Y0 + 37, 1, 1);
    ctx.fillRect(banyaDoorX0 + 32, BANYA_DOOR_Y0 + 37, 1, 1);
    // Nalichnik casing: the pale carved door surround, in the same
    // language as the tower's window casings: side boards standing on
    // the step, a head board, and the little crown peak.
    ctx.fillStyle = '#d68a5a';
    ctx.fillRect(banyaDoorX0 - 5, BANYA_DOOR_Y0 - 4, 4, dh - 2);
    ctx.fillRect(banyaDoorX1 + 1, BANYA_DOOR_Y0 - 4, 4, dh - 2);
    ctx.fillRect(banyaDoorX0 - 5, BANYA_DOOR_Y0 - 8, dw + 10, 5);
    ctx.beginPath();
    ctx.moveTo(cxD - 8, BANYA_DOOR_Y0 - 8);
    ctx.lineTo(cxD, BANYA_DOOR_Y0 - 14);
    ctx.lineTo(cxD + 8, BANYA_DOOR_Y0 - 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a5427';                      // carved shadow lines
    ctx.fillRect(banyaDoorX0 - 2, BANYA_DOOR_Y0 - 4, 1, dh - 2);
    ctx.fillRect(banyaDoorX1 + 1, BANYA_DOOR_Y0 - 4, 1, dh - 2);
    ctx.fillRect(banyaDoorX0 - 5, BANYA_DOOR_Y0 - 4, dw + 10, 1);
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

    // Warm spill on the door step while the curtain is open (drawShopDoorGlow
    // pattern at plinth size; subtle, the door is the invitation).
    if (bathDoorT > 0.01) {
      var sp = bathDoorT * bathDoorT * (3 - 2 * bathDoorT);   // smoothstep
      var sdx = (banyaDoorX0 + banyaDoorX1) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var spillRows = [
        { dy: -6, hw: 14, a: 0.10, c: '255,214,138' },
        { dy: -4, hw: 20, a: 0.08, c: '252,176,88' },
        { dy: -2, hw: 26, a: 0.05, c: '246,156,70' }
      ];
      for (var spi = 0; spi < spillRows.length; spi++) {
        var srw = spillRows[spi];
        ctx.fillStyle = 'rgba(' + srw.c + ',' + (srw.a * sp).toFixed(3) + ')';
        ctx.fillRect(sdx - srw.hw, gy + srw.dy, srw.hw * 2, 2);
      }
      ctx.restore();
    }

    // Entry hint once the door has swung open (tap the tower or press E).
    if (bathDoorT > 0.35 && !bathMode) {
      var pa = 0.55 + 0.35 * Math.sin(bathPromptT * 4);
      ctx.fillStyle = 'rgba(224,176,96,' + pa + ')';
      ctx.font = '12px "Commit Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('enter', (banyaDoorX0 + banyaDoorX1) / 2, BANYA_DOOR_Y0 - 20);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ---- Hook 3: render() top (140). Draws the whole TOWER scene, floor by
  // floor, and consumes the frame. The liquid layer is a separate DOM
  // canvas above this one, so calling drawLiquids() keeps the water live. --
  function bathRenderScene() {
    if (!bathMode) return false;
    if (hearthRoomRender()) return true;
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
          // The fire room boiler feeds this copper heat exchanger. Its glow
          // follows stored bath heat; no unrelated gas flames under the tub.
          if (FG.fill[fti] === 2) {
            var vcx = (crv2.x0 + crv2.x1) / 2;
            uiFg.strokeStyle = BLD.goldDark; uiFg.lineWidth = 6;
            uiFg.beginPath();
            uiFg.moveTo(fx0 + 8, botY - 16); uiFg.lineTo(vcx - 64, botY - 16);
            for (var hx = vcx - 64; hx <= vcx + 64; hx += 8) {
              uiFg.lineTo(hx, crv2.y0 + crv2.depthAt(hx) + 10);
            }
            uiFg.lineTo(fx1 - 8, botY - 16); uiFg.stroke();
            uiFg.globalAlpha = Math.min(1, bathHeat); uiFg.strokeStyle = BLD.warmGlow; uiFg.lineWidth = 2;
            uiFg.stroke(); uiFg.globalAlpha = 1;
          }
          uiFg.fillStyle = '#2b2b2b';
          uiFg.fillRect(fx0 + 6, botY - 22, 3, 3);
          uiFg.fillRect(fx1 - 10, botY - 30, 3, 3);
        }
      }
    }
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
    var bathDrawContext = ctx;
    try {
      if (uiFg) ctx = uiFg;
      ctx.setTransform(_bws, 0, 0, _bws, -Math.round(cam.x * _bws), -Math.round(cam.y * _bws));
      bathDrawGuests();
      bathDrawServiceHUD();
    } finally { ctx = bathDrawContext; }
    return true;
  }

  {
    // Install listeners even when a saved option starts the bathhouse off.
    window.bathTune = bathTune;
    window.__bath = { tune: bathTune, enter: bathEnter, exit: bathExit,
                      floor: bathScrollToFloor,
                      buy: bathBuyFloor,
                      guest: function () { return !!bathSpawnGuest(); },
                      scale: bathScaleSet,
                      steamTune: bathSteam,
                      dbg: function () { return { guests: bathGuests.map(function (g) {
                        return { id: g.s.id, state: g.st, soak: g.soak, paid: g.paid };
                      }), served: bathServed, water: bathWaterCount(), coal: bathCoalCount() }; },
                      night: function (v) { bathNightOverride = (v === undefined || v === null) ? -1 : +v; },
                      warp: bathWarp,
                      get mode() { return bathMode; },
                      get doorT() { return bathDoorT; } };
    try {
      canvas.addEventListener('pointerdown', bathPointer);
      canvas.addEventListener('pointermove', bathPointerMove);
      canvas.addEventListener('pointerup', bathPointerUp);
      canvas.addEventListener('pointercancel', function () { bathPtrDown = false; hearthCancelDrag(); });
      canvas.addEventListener('wheel', bathWheelScroll, { passive: false });
    } catch (e) {}
  }
