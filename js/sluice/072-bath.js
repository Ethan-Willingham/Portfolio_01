  /* ==== BANYA (v25.77): the other half of the game, first stone ==========
     Enabled by default (ENABLE_BATH, ?bath=0 disables). Live service rules:
     docs/game/BATHHOUSE_SERVICE.md; 074-bath-service.js owns the visitors.
     (section 0 pivot, B-D11, stages B6/B8). This fragment owns BOTH halves
     of the B6 slice:

     EXTERIOR: a tall banya tower drawn on the town surface (deck-relative
     siting, v25.78). Entry works like the shop: red velvet curtains
     gather back at the sides as the rig approaches (bathDoorT, the shopDoorT ramp),
     and getting in is deliberate:
     click/tap the tower whenever it is on screen (processPointerDown in
     050, beside isPointOnShop), or park at the door and press Enter/E.
     The old walk-in auto-enter is gone.

     INTERIOR: its own SCENE, built as an off-map pocket room deep in the
     bedrock fill (rows 600-613, far below the 400 m mineable town). Entering
     is a camera teleport + mode swap: update()/updateCamera()/render() all
     yield via the three bath* hooks, the rig freezes where it was, and the
     room draws with its own lantern light. The liquid + smoke sims tick from
     the LOOP (350), not update(), so the room's water keeps simulating and
     the camera-derived active region wakes it automatically. The bath starts
     empty and cold. Real fuel heats its copper liner, then the actual water.
     Conserved energy, evaporation and condensed vapor live in 074-bath-thermal.

     Dev helpers: window.__bath.warp() (rig to the door), .enter(), .exit();
     window.bathTune retains the legacy solver levers for dev harnesses.
     ======================================================================= */

  // ---- Exterior placement (world px; groundY = SKY_ROWS * TILE = 128) ----
  // The site is picked AFTER worldgen: surface lakes vary per seed and can
  // reach well past col 26 (found the hard way: the tower stood in a lake,
  // its lower half hidden under the water overlay canvas). Rule: 3 cols
  // right of the rightmost left-half pond, clamped left of the deck apron.
  var BANYA_W = 5 * TILE;               // v25.79: skinny tiered tower (160 px base)
  var banyaX = -1;                      // set by bathPickSite()
  var bathFoundationReady = false;
  var banyaDoorX0 = 0, banyaDoorX1 = 0;
  var BANYA_DOOR_Y0 = SKY_ROWS * TILE - 80;
  var BANYA_DOOR_Y1 = SKY_ROWS * TILE;
  function bathPickSite() {
    if (banyaX >= 0) {
      if (ENABLE_BATH && !bathFoundationReady) bathLayFoundation();
      return true;
    }
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
    if (ENABLE_BATH) bathLayFoundation();
    try { console.log('[bath] banya sited at cols ' + col + '-' + (col + 6)); } catch (e) {}
    return true;
  }

  function bathLayFoundation() {
    var row = world[SKY_ROWS];
    if (!row || banyaX < 0) return;
    var col = Math.floor(banyaX / TILE), left = col - 2, right = col + 6;
    // Continue the nearby town apron through the bench and past the tower.
    // Older worlds can site the banya across a lake; keep that plinth local.
    if (left > DECK_RIGHT_COL && left <= DECK_RIGHT_COL + 8) left = DECK_RIGHT_COL + 1;
    if (right < DECK_LEFT_COL && right >= DECK_LEFT_COL - 8) right = DECK_LEFT_COL - 1;
    for (var c = Math.max(0, left); c <= Math.min(COLS - 1, right); c++) {
      var pond = false;
      for (var p = 0; p < surfacePonds.length; p++) {
        if (c >= surfacePonds[p].cL - 1 && c <= surfacePonds[p].cR + 1) { pond = true; break; }
      }
      if (pond || (row[c] && row[c].type === 'foundation')) continue;
      row[c] = { type: 'foundation', hp: 999999 };
      delete terrainClearedKinds[SKY_ROWS + ':' + c];
      invalidateTerrainAround(SKY_ROWS, c);
      // A returning rig can be parked in a shallow excavation in this row.
      if (player && player.x + PLAYER_W > c * TILE && player.x < (c + 1) * TILE &&
          player.y + PLAYER_H > SKY_ROWS * TILE && player.y < (SKY_ROWS + 1) * TILE) {
        player.y = player.renderY = SKY_ROWS * TILE - PLAYER_H;
        player.vy = 0;
      }
    }
    bathFoundationReady = true;
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
    { c0: 20, c1: 53, fr: 610, lip: 1, sink: 5, tubs: [[24,49]], fill: [2], price: 0 },
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
  var bathCollisionCache = [];
  function bathCollisionCurves() {
    if(!bathRoomReady)return [];
    return bathCollisionCache;
  }
  function bathSyncCollision() {
    bathCollisionCache = bathRoomReady ? BATH_FLOORS.filter(function(F){return F.tubs.length;}).map(function(F){return bathTubCurve(F,F.tubs[0]);}) : [];
    if(liquidWGPU && liquidWGPU.setBathBowls)liquidWGPU.setBathBowls(bathCollisionCurves().map(function(c){return [c.x0,c.x1,c.y0,c.D];}));
  }
  function bathCurveSlope(c,x) {
    var t=Math.max(-1,Math.min(1,(x-c.x0)/(c.x1-c.x0)*2-1));
    return -c.D*4*Math.sinh(2*t)/((c.x1-c.x0)*(Math.cosh(2)-1));
  }
  function bathSolidAt(x,y) {
    if(!bathRoomReady || y<(BATH_TOP_ROW-1)*TILE)return false;
    var curves=bathCollisionCurves();
    for(var i=0;i<curves.length;i++){
      var c=curves[i];if(x<c.x0 || x>c.x1 || y<c.y0-16 || y>c.y0+c.D+32)continue;
      var slope=bathCurveSlope(c,x);if(y>=c.y0+c.depthAt(x)-3*Math.sqrt(1+slope*slope))return true;
    }return false;
  }
  function bathProjectWater(x,y,vx,vy,r) {
    var curves=bathCollisionCurves();
    for(var i=0;i<curves.length;i++){
      var c=curves[i];if(x<c.x0 || x>c.x1 || y<c.y0-16 || y>c.y0+c.D+32)continue;
      for(var pass=0;pass<4;pass++){
        var slope=bathCurveSlope(c,x),len=Math.sqrt(1+slope*slope),depth=(y-c.y0-c.depthAt(x))/len+r+3;
        if(depth<=0)break;var nx=slope/len,ny=-1/len,speed=Math.min(0,vx*nx+vy*ny);
        x+=nx*depth;y+=ny*depth;vx-=nx*speed;vy-=ny*speed;
      }
    }return [x,y,vx,vy];
  }
  var bathFloorsOwned = [true, false, false, false, false];   // persisted with the bathhouse
  var bathBuyFlash = [0, 0, 0, 0, 0];           // "not enough money" red blink until (ms)
  var BATH_TOP_ROW = 558;                       // F5 ceiling row (8-row floors)
  var BATH_BOT_ROW = 616;                       // F1 floor slab row
  var BATH_VIEW_W = 36 * TILE;                  // width-fit + headroom for the F2 peek
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

  // The bath uses the same world units, gravity and liquid clock as outdoors.
  // Compatibility levers remain harmless for old dev harnesses and saves.
  var bathScaleK = 1, bathScaleSaved = null;
  function bathScalePush() { bathScaleK = 1; }
  function bathScalePop() { bathScaleSaved = null; }
  function bathScaleSet(k) { return bathScaleK = 1; }
  function bathScaleV() { return 1; }

  // ---- Tower construction (one-shot, on first enter) ----------------------
  function bathClearRimSteps() {
    // Old rooms have square terrain blocks above the curved copper lips.
    // Remove only those obsolete blocks so overflow clears the visible rim.
    for (var f = 0; f < BATH_FLOORS.length; f++) {
      var F = BATH_FLOORS[f], row = world[F.fr - 1];
      if (!F.lip || !row) continue;
      for (var t = 0; t < F.tubs.length; t++) for (var side = 0; side < 2; side++) {
        var col = side ? F.tubs[t][1] + 1 : F.tubs[t][0] - 1;
        if (!row[col] || row[col].type !== 'foundation') continue;
        row[col] = null; invalidateTerrainAround(F.fr - 1, col);
      }
    }
  }
  function bathCarveRoom() {
    if (bathRoomReady) { bathClearRimSteps(); bathSyncCollision(); return; }
    if (typeof world === 'undefined' || !world[BATH_BOT_ROW]) return;
    var r, c, f, i;
    // Solid block first (replacing tile objects wholesale is safe: the
    // shared frozen fill prototypes are never mutated, only de-referenced),
    // then carve each floor's cavity out of it.
    for (r = BATH_TOP_ROW; r <= BATH_BOT_ROW + 1; r++) {
      for (c = 18; c <= 55; c++) {
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
          var needY = 0;
          if (!isRim) {
            var dL = crv.depthAt(cc * TILE), dR = crv.depthAt((cc + 1) * TILE);
            var dC = crv.depthAt(cc * TILE + TILE / 2);
            needY = crv.y0 + Math.max(dL, dR, dC) + 1;    // curve plus one pixel of liner clearance
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
    bathSyncCollision();
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
    var F = BATH_FLOORS[0], tb = F.tubs[0], curve = bathTubCurve(F, tb);
    bathHotTub = { F: F, tb: tb, ventX: (curve.x0 + curve.x1) / 2, ventHalf: (curve.x1 - curve.x0) / 3 };
    // The conserved thermal field supplies both solvers. Disable the old
    // independent rectangular heater, universal lift and artificial tint.
    bathTune('BATH_ON', 0); bathTune('BATH_BUOY', 0); bathTune('BATH_TINT_STR', 0);
    if (typeof bathThermalUpload === 'function') bathThermalUpload();
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
  function bathWorldSmokeVisibility(inside) {
    // Outdoor exhaust is a separate DOM layer. It must not masquerade as
    // bath steam, including a backend initialized after entering the room.
    var layers = [smokeFluidCanvas, rigExhaustCanvas];
    for (var i = 0; i < layers.length; i++) if (layers[i]) {
      var visibility = inside ? 'hidden' : '';
      if (layers[i].style.visibility !== visibility) layers[i].style.visibility = visibility;
    }
  }
  function bathLayerVis(inside) {
    bathWorldSmokeVisibility(inside);
    var pauseButton = document.getElementById('gm-pause-btn');
    if (pauseButton) pauseButton.style.top = inside ? '3px' : '';
    if (typeof window.gmTuningButtonSync === 'function') window.gmTuningButtonSync();
    // The HUD/toast layer (uiTopCanvas, z:6, 140) and the smoke canvas (z:5,
    // 190) sit ABOVE the main canvas in the DOM, so the scene cannot paint
    // over them: hide both while inside. The liquid canvas (z:4) stays, it
    // IS the tub water. Restored on exit.
    // v25.88: uiTop stays VISIBLE inside too; the scene clears it per
    // frame and draws the tub-vessel foreground there (above the water).
    // Stale world smoke is dropped on entry. Condensed bath vapor draws
    // on the foreground canvas, independent of the outdoor smoke engine.
  }
  function bathSwap(toInside) {
    if (bathFading || (toInside && !ENABLE_BATH)) return;
    bathToolReset();
    surfaceSlimeGrabEnd(undefined, true);
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
        hearthSetView('bath');
        forgeStockCargo();
        bathDoorT = 1;       // step back out through an open door
        // Drop stale outdoor smoke. Existing sky visitors keep their states;
        // dedicated thermal vapor never retunes the world smoke solver.
        try { if (typeof clearAllSmokeVisuals === 'function') clearAllSmokeVisuals(); } catch (e2) {}
        bathSteamPush();
        bathScalePush();
        bathArmHeat();
        siphonStop();
        bathCamPin();
        bathArrivalBegin();
        // Restore the saved tub behind the cover, without the old staged fill.
        bathArrivalReset();
        mineralLiquidTick(0);
      } else {
        hearthCancelDrag(); hearthClearBoilerHover();
        bathMode = false;
        bathArrivalReset();
        bathScalePop();
        bathSteamPop();
        bathGuestColliders.length = 0;   // no stale fluid boundaries outside
        cam.snap = true;
      }
      bathLayerVis(toInside);
      beginSceneLoading(toInside ? 'Entering bathhouse' : 'Returning outside');
      if (!gameRafId) gameRafId = requestAnimationFrame(loop);
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
      // Entry works like the shop. The velvet curtains gather back
      // as the rig approaches (same ramp rates as shopDoorT,
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
    if (keys['Escape']) {
      keys['Escape'] = false;
      bathExit();
    }
    bathSteamTick(dt);
    if (keys['e'] || keys['E'] || keys['Enter']) {
      keys['e'] = false; keys['E'] = false; keys['Enter'] = false;
      for (var gi = 0; gi < bathGuests.length; gi++) {
        if (bathGuests[gi].st === 'wait') { bathServe(bathGuests[gi].s.id); break; }
      }
    }
    return true;
  }

  // Steam is condensed water vapor from actual evaporation, rendered by
  // the thermal system. It never borrows the world smoke solver or its clock.
  var bathDbg = { steamCalls: 0, steamActive: 0, steamInView: 0, steamSplats: 0 };
  var bathSteam = {}, bathSteamSaved = null, bathHotTub = null;
  function bathSteamPush() {}
  function bathSteamPop() { if (typeof bathVaporClear === 'function') bathVaporClear(); }
  function bathSteamTick(dt) { if (typeof bathThermalVaporTick === 'function') bathThermalVaporTick(dt); }
  function bathSurfY(x, fallback) {
    return typeof bathThermalSurface === 'function' ? bathThermalSurface(x, fallback) : fallback;
  }

  // A guest parts existing vapor; cold splashes cannot manufacture steam.
  function bathSplashPoof(ix, iy, k) {
    if (typeof bathVaporImpulse === 'function') bathVaporImpulse(ix, iy, k);
  }
  // ---- Hook 2: updateCamera() top (080). The scene OWNS the zoom: fit the
  // tower WIDTH to the canvas (any window, any dpr) and scroll VERTICALLY
  // through the floors (wheel / drag / touch feed bathScrollT). Overriding
  // the global worldScale keeps the liquid overlay's view mapping in
  // perfect agreement with the main canvas transform, since both read
  // dpr * worldScale live. Restored on exit. -------------------------------
  var bathSaved = null;          // { ws, sw, sh } world view state, restored on exit
  var bathScrollT = 1e9;          // scroll target (world y); huge = clamp to bottom
  var bathCamY = -1;              // current camera y; view changes and scrolling are immediate
  var bathViewportKey = '';
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
    var width = canvas.width / dpr, height = canvas.height / dpr;
    var nav = hearthNavHeight(), layout = hearthRoomLayout(), scene = layout.scene;
    // Reserve the fixed controls before fitting the entire ground-floor tub.
    var main = BATH_FLOORS[0], mainCurve = bathTubCurve(main,main.tubs[0]);
    var mainHeight = bathInteriorBottom() - mainCurve.y0 + 120;
    // The guest landing and the vessel share the desktop framing everywhere.
    worldScale = Math.min(scene.w / BATH_VIEW_W, Math.max(40, scene.h) / mainHeight);
    if (layout.compact) {
      var belowLip = layout.shoulderDepth + layout.outerWorldW / (HEARTH_PHI * HEARTH_PHI);
      worldScale = Math.min(scene.w / BATH_VIEW_W, layout.bodyWidth / layout.outerWorldW,
        Math.max(44, height - 128) / belowLip);
    }
    var viewportKey = width + ':' + height + ':' + nav + ':' + scene.h;
    if (bathViewportKey !== viewportKey) {
      bathToolCancel(); bathTool.rope = [];
      hearthCancelDrag();
      bathViewportKey = viewportKey; bathScrollT = 1e9; bathCamY = -1;
    }
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
    var maxY = bathInteriorBottom() - (scene.y + scene.h) / worldScale;
    // Short windows crop spare timber above the bowl rather than replacing
    // the room with a second layout. Keep the real furnace below the copper.
    if (layout.compact) {
      maxY = mainCurve.y0 - 88 / worldScale;
    }
    if (maxY < minY) minY = maxY;
    // A single-room bath has nothing to scroll to. Do not reveal the retired
    // tower artwork on a stray wheel gesture. Purchased upper floors remain reachable.
    if (!bathFloorsOwned.slice(1).some(function (owned) { return owned; })) bathScrollT = maxY;
    if (bathScrollT < minY) bathScrollT = minY;
    if (bathScrollT > maxY) bathScrollT = maxY;
    bathCamY = bathScrollT;
    var centerX = 37 * TILE;
    cam.x = centerX - (scene.x + scene.w / 2) / worldScale;
    cam.y = bathCamY;
    return true;
  }
  function bathScrollToFloor(n) {   // dev + future UI: centre floor n (1..5)
    if (n === 1) { bathScrollT = 1e9; bathCamY = -1; return; }
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
    if (bathMode && bathTool.mode) return;
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
    if (bathToolPointerMove(e)) return;
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
    if (bathToolPointerUp(e)) return;
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
    if (gamePaused || bathServicePointer(cssX, cssY) || bathGuestPointer(p.x, p.y)) return;
    // Main-room walls do not expose the hidden legacy floor purchase targets.
    if (bathMainRoomVisible()) return;
    // Purchase buttons on locked floors take priority over the exit door.
    for (var bf = 1; bf <= 4; bf++) {
      if (bathFloorsOwned[bf]) continue;
      var R = bathBuyRect(bf);
      if (p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) {
        bathBuyFloor(bf);
        return;
      }
    }
    if (!bathMainRoomVisible() && p.x >= BATH_EXIT_X0 && p.x <= BATH_EXIT_X1 &&
        p.y >= BATH_EXIT_Y0 && p.y <= BATH_EXIT_Y1) bathExit();
  }
  function bathWheelScroll(e) {
    if (!bathMode) return;
    e.preventDefault();
    if (hearthView !== 'bath' || bathTool.mode) return;
    bathScrollT += (e.deltaY || 0) / Math.max(worldScale, 0.001);
  }

  // ---- Exterior: the tiered tower (v25.79, owner direction) ---------------
  // A skinny, tall, TIERED silhouette: four shrinking timber tiers with
  // flared painted-iron skirt roofs, a tented top, copper cap and a red star.
  // The reference is the wooden tiered towers of the Russian North (Kizhi
  // style), which read pagoda-like from a distance while staying Russian.
  // Paper lanterns hang from every eave tip and light with the real sun:
  // off at noon, fading in through dusk, full at night (bathNightK).
  var bathNightOverride = -1;   // dev: __bath.night(0..1); -1 = follow the sun
  var bathExteriorHalo = null;
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
    // Include hanging lights and the bench, even when only a roof is visible.
    if (cx + 140 < cam.x || cx - 140 > cam.x + screenW ||
        gy + 2 < cam.y || gy - 485 > cam.y + screenH) return;
    var night = bathNightK();
    var t = performance.now() * 0.001;
    var flick = 0.9 + 0.1 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
    var lit = night > 0.02;

    function warmHalo(hx, hy, radius) {
      if (!lit) return;
      // Bake the soft falloff once. Live lights share one small sprite rather
      // than rebuilding gradients or drawing conspicuous concentric discs.
      if (!bathExteriorHalo) {
        bathExteriorHalo = document.createElement('canvas');
        bathExteriorHalo.width = bathExteriorHalo.height = 64;
        var haloCtx = bathExteriorHalo.getContext('2d');
        var haloGrad = haloCtx.createRadialGradient(32, 32, 1, 32, 32, 32);
        haloGrad.addColorStop(0, BLD.warmGlow + '36');
        haloGrad.addColorStop(0.35, BLD.warmGlow + '18');
        haloGrad.addColorStop(1, BLD.warmGlow + '00');
        haloCtx.fillStyle = haloGrad; haloCtx.fillRect(0, 0, 64, 64);
      }
      var haloAlpha = ctx.globalAlpha;
      ctx.globalAlpha *= night;
      ctx.drawImage(bathExteriorHalo, hx - radius, hy - radius, radius * 2, radius * 2);
      ctx.globalAlpha = haloAlpha;
    }
    function lantern(lx, ly) {
      lx = Math.round(lx); ly = Math.round(ly);
      ctx.fillStyle = BLD.metalDark;
      ctx.fillRect(lx, ly, 1, 9);
      warmHalo(lx, ly + 16, 28);
      // Stepped paper shell, dark end caps and ribs wrapping the round body.
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(lx - 3, ly + 8, 6, 16);
      ctx.fillRect(lx - 5, ly + 11, 10, 10);
      ctx.fillRect(lx - 6, ly + 13, 12, 6);
      ctx.fillStyle = BLD.goldDark;
      ctx.fillRect(lx - 2, ly + 10, 4, 12);
      ctx.fillRect(lx - 4, ly + 12, 8, 8);
      ctx.fillRect(lx - 5, ly + 14, 10, 4);
      ctx.fillStyle = BLD.woodMid;
      ctx.fillRect(lx - 2, ly + 11, 3, 10);
      ctx.fillRect(lx - 4, ly + 13, 6, 6);
      if (lit) {
        var lampAlpha = ctx.globalAlpha;
        ctx.globalAlpha *= night * flick;
        ctx.fillStyle = BLD.goldBright;
        ctx.fillRect(lx - 2, ly + 11, 3, 10);
        ctx.fillRect(lx - 4, ly + 13, 6, 6);
        ctx.globalAlpha = lampAlpha;
      }
      ctx.fillStyle = BLD.woodLight;
      ctx.fillRect(lx - 3, ly + 13, 1, 5);
      if (lit) {
        var edgeAlpha = ctx.globalAlpha;
        ctx.globalAlpha *= night;
        ctx.fillStyle = BLD.goldPale;
        ctx.fillRect(lx - 3, ly + 13, 1, 5);
        ctx.globalAlpha = edgeAlpha;
      }
      ctx.fillStyle = BLD.goldDark;
      ctx.fillRect(lx - 4, ly + 15, 8, 1);
      ctx.fillRect(lx + 1, ly + 12, 1, 8);
      ctx.fillStyle = BLD.metalBase;
      ctx.fillRect(lx - 3, ly + 8, 6, 2);
      ctx.fillRect(lx - 2, ly + 22, 4, 1);
      ctx.fillStyle = BLD.metalLight;
      ctx.fillRect(lx - 3, ly + 8, 3, 1);
    }
    function casing(wx, wy, ww, wh, doorway) {
      // One carved timber vocabulary for the windows and entrance. Raised
      // edges catch the same top-left light; the cuts stay warm and recessed.
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(wx - 5, wy - 5, ww + 10, 5);
      ctx.fillRect(wx - 5, wy, 4, wh);
      ctx.fillRect(wx + ww + 1, wy, 4, wh);
      ctx.fillStyle = BLD.woodMid;
      ctx.fillRect(wx - 4, wy - 4, ww + 8, 3);
      ctx.fillRect(wx - 4, wy - 1, 3, wh + 1);
      ctx.fillRect(wx + ww + 1, wy - 1, 3, wh + 1);
      ctx.fillStyle = BLD.woodLight;
      ctx.fillRect(wx - 4, wy - 4, ww + 7, 1);
      ctx.fillRect(wx - 4, wy - 1, 1, wh);
      ctx.fillRect(wx + ww + 1, wy - 1, 1, wh);
      ctx.fillStyle = BLD.woodDark;
      ctx.fillRect(wx - 2, wy + 2, 1, wh - 3);
      ctx.fillRect(wx + ww + 3, wy + 2, 1, wh - 3);
      var crown = wx + ww / 2;
      for (var cr = 0; cr < 5; cr++) {
        ctx.fillStyle = BLD.woodDark;
        ctx.fillRect(crown - cr - 1, wy - 10 + cr, cr * 2 + 2, 1);
        ctx.fillStyle = BLD.woodLight;
        ctx.fillRect(crown - cr - 1, wy - 11 + cr, cr * 2 + 1, 1);
      }
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(crown - 1, wy - 7, 2, 2);
      if (!doorway) {
        ctx.fillStyle = BLD.woodDeep;
        ctx.fillRect(wx - 6, wy + wh, ww + 12, 5);
        ctx.fillStyle = BLD.woodMid;
        ctx.fillRect(wx - 5, wy + wh + 1, ww + 10, 2);
        ctx.fillStyle = BLD.woodLight;
        ctx.fillRect(wx - 5, wy + wh, ww + 9, 1);
        ctx.fillStyle = BLD.woodDark;
        ctx.fillRect(wx - 3, wy + wh + 4, 3, 2);
        ctx.fillRect(wx + ww, wy + wh + 4, 3, 2);
      }
    }
    function win(wx, wy, ww, wh, phase) {
      warmHalo(wx + ww / 2, wy + wh / 2, ww);
      casing(wx, wy, ww, wh, false);
      ctx.fillStyle = BLD.metalDark;
      ctx.fillRect(wx, wy, ww, wh);
      if (lit) {
        var pulse = 0.94 + 0.06 * Math.sin(t * 1.9 + phase);
        ctx.fillStyle = 'rgba(255,206,106,' + ((0.25 + 0.6 * night) * pulse) + ')';
        ctx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      } else {
        // A small sky reflection leaves the glass darker than its casing.
        ctx.fillStyle = BLD.metalBase;
        ctx.fillRect(wx + 2, wy + 2, ww - 4, 3);
        ctx.fillRect(wx + 2, wy + 5, 3, 5);
        ctx.fillStyle = BLD.metalLight;
        ctx.fillRect(wx + 3, wy + 2, 4, 1);
      }
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      ctx.fillRect(wx, wy + Math.floor(wh * 0.53), ww, 2);
      strokeRect1(wx, wy, ww, wh, BLD.woodDeep);
      ctx.fillStyle = BLD.woodBase;
      ctx.fillRect(wx + ww / 2 - 1, wy + 1, 1, wh - 2);
      ctx.fillRect(wx + 1, wy + Math.floor(wh * 0.53), ww - 2, 1);
    }
    function eave(yB, half) {
      var yT = yB - 13;
      // Weathered oxide paint shares the station canopy's red-brown ramp.
      // Keep the right return and the folded lip dark so metal reads apart
      // from the timber, even when both belong to the same warm family.
      ctx.fillStyle = BLD.redDark;
      ctx.beginPath();
      ctx.moveTo(cx - half, yB - 9);            // flared left tip
      ctx.lineTo(cx - half + 22, yB);
      ctx.lineTo(cx + half - 22, yB);
      ctx.lineTo(cx + half, yB - 9);            // flared right tip
      ctx.lineTo(cx + half - 30, yT);
      ctx.lineTo(cx - half + 30, yT);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = BLD.outline; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = BLD.redDeep;
      ctx.beginPath();
      ctx.moveTo(cx + half - 30, yT);
      ctx.lineTo(cx + half, yB - 9);
      ctx.lineTo(cx + half - 22, yB);
      ctx.lineTo(cx + half - 38, yB - 3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = BLD.redDeep;
      ctx.fillRect(cx - half + 28, yT, half * 2 - 56, 3);
      ctx.fillRect(cx - half + 22, yB - 3, half * 2 - 44, 3);
      ctx.fillStyle = BLD.woodBase;
      ctx.fillRect(cx - half + 23, yB - 4, half * 2 - 46, 1);
      // Standing seams follow the shallow pitch instead of floating as ticks.
      for (var ex = cx - half + 42; ex < cx + half - 34; ex += 22) {
        var lean = (ex - cx) / Math.max(1, half - 30) * 3;
        ctx.strokeStyle = BLD.redDeep; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ex, yT + 3);
        ctx.lineTo(ex + lean, yB - 4); ctx.stroke();
        ctx.strokeStyle = BLD.woodBase;
        ctx.beginPath(); ctx.moveTo(ex - 1, yT + 3);
        ctx.lineTo(ex + lean - 1, yB - 5); ctx.stroke();
      }
      ctx.strokeStyle = BLD.redDeep; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - half + 22, yB); ctx.lineTo(cx + half - 22, yB);
      ctx.stroke();
      // A continuous carved fascia supports the little stepped pendants.
      // Keep the teeth quieter than the window casings and doorway.
      var fasciaX = cx - half + 24, fasciaW = half * 2 - 48;
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(fasciaX, yB, fasciaW, 5);
      ctx.fillStyle = BLD.woodBase;
      ctx.fillRect(fasciaX + 1, yB + 1, fasciaW - 2, 3);
      ctx.fillStyle = BLD.woodMid;
      ctx.fillRect(fasciaX + 1, yB + 1, fasciaW - 3, 1);
      for (var fx = fasciaX + 3; fx < fasciaX + fasciaW - 6; fx += 10) {
        ctx.fillStyle = BLD.woodDark;
        ctx.fillRect(fx, yB + 4, 5, 2);
        ctx.fillRect(fx + 1, yB + 6, 3, 2);
        ctx.fillStyle = BLD.woodMid;
        ctx.fillRect(fx, yB + 3, 1, 3);
      }
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(fasciaX + 2, yB + 8, fasciaW - 4, 3);
      lantern(cx - half + 4, yB - 7);
      lantern(cx + half - 4, yB - 7);
    }
    function tier(half, top, height) {
      var tx = cx - half, ty = gy - top, tw = half * 2;
      // Quiet board faces, sparse grain and real corner posts. Suppress the
      // shared helper's bright stripes so the casings own the lightest timber.
      drawWoodPlanking(tx, ty, tw, height, 12);
      for (var board = tx + 1, bi = 0; board < tx + tw - 16; board += 12, bi++) {
        ctx.fillStyle = BLD.woodBase;
        ctx.fillRect(board + 1, ty + 3, 1, height - 6);
        if (bi % 3 !== 0) ctx.fillRect(board, ty + 2, 1, height - 4);
        if (bi % 4 === 1) {
          var grainY = ty + 22 + (bi * 13 % Math.max(1, height - 42));
          ctx.fillStyle = BLD.woodDark;
          ctx.fillRect(board + 5, grainY, 2, 4);
          ctx.fillStyle = BLD.woodMid;
          ctx.fillRect(board + 4, grainY + 3, 1, 3);
        }
      }
      ctx.fillStyle = BLD.woodDark;
      ctx.fillRect(tx + tw - 17, ty + 1, 16, height - 2);
      ctx.fillStyle = BLD.woodBase;
      ctx.fillRect(tx + tw - 12, ty + 2, 1, height - 4);
      ctx.fillRect(tx + tw - 5, ty + 2, 1, height - 4);
      // The head beam's underside and bottom rail join the vertical posts.
      ctx.fillStyle = BLD.woodDark;
      ctx.fillRect(tx + 1, ty + 1, tw - 2, 11);
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(tx + 1, ty + 1, tw - 2, 5);
      ctx.fillStyle = BLD.woodDark;
      ctx.fillRect(tx + 2, ty + 12, 5, height - 14);
      ctx.fillRect(tx + tw - 22, ty + 12, 6, height - 14);
      ctx.fillRect(tx + 1, ty + height - 7, tw - 2, 6);
      ctx.fillStyle = BLD.woodMid;
      ctx.fillRect(tx + 2, ty + 13, 2, height - 21);
      ctx.fillRect(tx + tw - 22, ty + 13, 1, height - 21);
      ctx.fillRect(tx + 2, ty + height - 7, tw - 19, 1);
      ctx.fillStyle = BLD.woodDeep;
      ctx.fillRect(tx + 6, ty + 13, 1, height - 20);
      ctx.fillRect(tx + tw - 17, ty + 13, 1, height - 20);
      // Small joinery pegs belong to the framing, rather than every plank.
      ctx.fillRect(tx + 4, ty + height - 4, 2, 2);
      ctx.fillRect(tx + tw - 21, ty + height - 4, 2, 2);
      strokeRect1(tx, ty, tw, height, BLD.outline);
    }

    // Stone plinth + door step.
    drawStoneFoundation(x - 6, gy - 20, w + 12, 20);
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x + w - 13, gy - 19, 18, 18);
    ctx.fillStyle = BLD.stoneLight;
    ctx.fillRect(x - 5, gy - 20, w - 8, 1);
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x - 6, gy - 10, w + 12, 1);
    ctx.fillStyle = BLD.stoneBase;
    ctx.fillRect(banyaDoorX0 - 6, gy - 6, (banyaDoorX1 - banyaDoorX0) + 12, 6);
    ctx.fillStyle = BLD.stoneLight;
    ctx.fillRect(banyaDoorX0 - 6, gy - 6, (banyaDoorX1 - banyaDoorX0) + 12, 1);

    // Four tiers, bottom-up, with quiet framing and a shaded right side.
    tier(80, 118, 98);
    tier(66, 208, 84);
    tier(52, 288, 74);
    tier(38, 356, 62);

    // Windows before the eaves so glow halos sit over the wood cleanly.
    win(cx - 40, gy - 182, 22, 30, 0.4); win(cx + 18, gy - 182, 22, 30, 2.1);
    win(cx - 11, gy - 264, 22, 30, 3.8);
    win(cx - 8, gy - 332, 16, 26, 5.2);

    eave(gy - 118, 104);
    eave(gy - 208, 88);
    eave(gy - 288, 72);
    eave(gy - 356, 58);

    // Tent roof, folded sheet courses, copper cap and a fixed red star.
    ctx.fillStyle = BLD.redDark;
    ctx.beginPath();
    ctx.moveTo(cx - 46, gy - 365); ctx.lineTo(cx, gy - 436);
    ctx.lineTo(cx + 46, gy - 365); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = BLD.outline; ctx.lineWidth = 1; ctx.stroke();
    // Broad lit and shaded returns keep the red roof separate from timber.
    ctx.fillStyle = BLD.woodBase;
    ctx.beginPath();
    ctx.moveTo(cx, gy - 434); ctx.lineTo(cx - 22, gy - 365);
    ctx.lineTo(cx - 45, gy - 365); ctx.closePath(); ctx.fill();
    ctx.fillStyle = BLD.redDeep;
    ctx.beginPath();
    ctx.moveTo(cx, gy - 434); ctx.lineTo(cx + 46, gy - 365);
    ctx.lineTo(cx + 9, gy - 365); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = BLD.redDeep; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, gy - 432); ctx.lineTo(cx - 22, gy - 368);
    ctx.moveTo(cx + 1, gy - 432); ctx.lineTo(cx + 9, gy - 368);
    ctx.stroke();
    ctx.strokeStyle = BLD.woodMid;
    ctx.beginPath();
    ctx.moveTo(cx - 1, gy - 433); ctx.lineTo(cx - 44, gy - 365);
    ctx.moveTo(cx - 1, gy - 432); ctx.lineTo(cx - 23, gy - 368);
    ctx.stroke();
    for (var course = 1; course <= 3; course++) {
      var roofY = gy - 436 + course * 18;
      var roofK = course * 18 / 71;
      ctx.strokeStyle = BLD.woodDark; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - 45 * roofK + 2, roofY);
      ctx.lineTo(cx - 22 * roofK, roofY + 1); ctx.stroke();
      ctx.strokeStyle = BLD.redDeep;
      ctx.beginPath(); ctx.moveTo(cx - 22 * roofK, roofY + 1);
      ctx.lineTo(cx + 44 * roofK - 1, roofY + 1); ctx.stroke();
      ctx.fillStyle = BLD.woodMid;
      ctx.fillRect(Math.round(cx - 42 * roofK + 2), roofY - 1, 3, 1);
    }
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(cx - 4, gy - 445, 8, 1);
    ctx.fillRect(cx - 7, gy - 444, 14, 3);
    ctx.fillRect(cx - 9, gy - 441, 18, 6);
    ctx.fillRect(cx - 3, gy - 459, 6, 15);
    ctx.fillStyle = BLD.goldDark;
    ctx.fillRect(cx - 6, gy - 443, 12, 3);
    ctx.fillRect(cx - 8, gy - 440, 16, 4);
    ctx.fillRect(cx - 2, gy - 458, 4, 15);
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(cx - 5, gy - 443, 5, 1);
    ctx.fillRect(cx - 7, gy - 440, 6, 2);
    ctx.fillRect(cx - 2, gy - 458, 1, 13);
    ctx.fillStyle = BLD.goldPale;
    ctx.fillRect(cx - 5, gy - 443, 2, 1);
    drawRedStar(cx, gy - 466, 7, -0.08);

    // Vertical «БАНЯ» board hanging under the first eave (stacked letters).
    ctx.strokeStyle = BLD.metalDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 62, gy - 118); ctx.lineTo(cx - 62, gy - 112); ctx.stroke();
    if (lit) {
      ctx.fillStyle = 'rgba(255,184,92,' + (0.07 * night) + ')';
      ctx.fillRect(cx - 84, gy - 116, 44, 96);
    }
    ctx.fillStyle = BLD.woodDeep; ctx.fillRect(cx - 76, gy - 112, 28, 88);
    strokeRect1(cx - 76, gy - 112, 28, 88, BLD.outline);
    ctx.fillStyle = BLD.woodMid;
    ctx.fillRect(cx - 75, gy - 111, 26, 1);
    ctx.fillRect(cx - 75, gy - 111, 1, 86);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(cx - 50, gy - 110, 1, 85);
    ctx.fillRect(cx - 74, gy - 26, 25, 1);
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(cx - 73, gy - 109, 2, 2);
    ctx.fillRect(cx - 53, gy - 109, 2, 2);
    ctx.fillStyle = lit ? BLD.goldPale : BLD.goldBright;
    ctx.font = 'bold 16px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Б', cx - 62, gy - 100);
    ctx.fillText('А', cx - 62, gy - 78);
    ctx.fillText('Н', cx - 62, gy - 56);
    ctx.fillText('Я', cx - 62, gy - 34);

    // Heavy stage velvet: soft fold shoulders, small gathers at the rod,
    // and weighted skirts below the ties. The cloth rests when fully open.
    var dw = banyaDoorX1 - banyaDoorX0;
    var dh = BANYA_DOOR_Y1 - BANYA_DOOR_Y0;
    var ct = bathDoorT * bathDoorT * (3 - 2 * bathDoorT);
    var clothY = BANYA_DOOR_Y0 + 5, hemY = BANYA_DOOR_Y1 - 6;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, dw, dh);
    // Recessed hall and a lit threshold, readable even in daylight.
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(banyaDoorX0 + 3, clothY + 14, dw - 6, dh - 25);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(banyaDoorX0 + 3, hemY - 10, dw - 6, 10);
    ctx.fillStyle = BLD.woodMid;
    ctx.fillRect(banyaDoorX0 + 3, hemY - 1, dw - 6, 2);
    var clothH = hemY - clothY, pullY, topW, pullW, hemW;
    // All shading follows the drape. Broad shoulders around narrow crests
    // describe the velvet's rounded folds without a glossy highlight.
    function velvetBand(from, to, color, opacity) {
      var alpha = ctx.globalAlpha;
      ctx.globalAlpha *= opacity === undefined ? 1 : opacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(topW * from, 0); ctx.lineTo(topW * to, 0);
      ctx.bezierCurveTo((topW + ct) * to, clothH * 0.23,
        (pullW + ct) * to, clothH * 0.44, pullW * to, pullY);
      // The lower bundle opens just below the tie, then falls almost
      // straight under its own weight instead of curling out at the foot.
      ctx.bezierCurveTo((pullW + 3 * ct) * to, pullY + 9,
        (hemW + 0.4 * ct) * to, clothH - 8, hemW * to, clothH);
      ctx.quadraticCurveTo(hemW * (from + to) / 2, clothH + 1.5, hemW * from, clothH);
      ctx.bezierCurveTo((hemW + 0.4 * ct) * from, clothH - 8,
        (pullW + 3 * ct) * from, pullY + 9, pullW * from, pullY);
      ctx.bezierCurveTo((pullW + ct) * from, clothH * 0.44,
        (topW + ct) * from, clothH * 0.23, topW * from, 0);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = alpha;
    }
    for (var side = 0; side < 2; side++) {
      // Small differences in the gathers avoid a mirrored cutout.
      topW = dw / 2 - (side === 0 ? 5.5 : 6.5) * ct;
      pullW = dw / 2 - (side === 0 ? 16.3 : 16.8) * ct;
      hemW = dw / 2 - (side === 0 ? 14 : 13.4) * ct;
      pullY = clothH * (side === 0 ? 0.61 : 0.635);
      ctx.save();
      ctx.translate(side === 0 ? banyaDoorX0 : banyaDoorX1, clothY);
      ctx.scale(side === 0 ? 1 : -1, 1);
      velvetBand(0, 1, BLD.redDark);
      var nap = side === 0 ? 1 : 0.82;
      velvetBand(0.13, 0.39, BLD.redBase, 0.20 * nap);
      velvetBand(0.17, 0.32, BLD.redBase, 0.24 * nap);
      velvetBand(0.20, 0.26, BLD.redBase, 0.22 * nap);
      velvetBand(0.49, 0.86, BLD.redBase, 0.24 * nap);
      velvetBand(0.54, 0.76, BLD.redBase, 0.30 * nap);
      velvetBand(0.59, 0.68, BLD.redBase, 0.25 * nap);
      velvetBand(0, 0.07, BLD.redDeep, 0.75);
      velvetBand(0.40, 0.47, BLD.redDeep, 0.65);
      velvetBand(0.91, 1, BLD.redDeep);
      // Pleat pockets under the rod anchor the folds to the hanging cloth.
      ctx.fillStyle = BLD.redDeep;
      ctx.fillRect(0, 0, topW, 2);
      for (var pleat = 0; pleat < 3; pleat++) {
        var pleatX = topW * (0.10 + pleat * 0.36);
        ctx.beginPath(); ctx.moveTo(pleatX, 1);
        ctx.lineTo(pleatX + 1.5, 1);
        ctx.lineTo(pleatX + 0.8, 5 + pleat % 2);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = BLD.redDeep; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, clothH);
      ctx.quadraticCurveTo(hemW / 2, clothH + 1.5, hemW, clothH); ctx.stroke();
      // A shallow cord follows the bundle instead of reading as a metal bar.
      if (ct > 0.65) {
        ctx.globalAlpha = (ct - 0.65) / 0.35;
        ctx.lineWidth = 2; ctx.strokeStyle = BLD.goldDark;
        ctx.beginPath(); ctx.moveTo(0, pullY - 1);
        ctx.quadraticCurveTo(pullW / 2, pullY + 2, pullW + 0.5, pullY); ctx.stroke();
        ctx.lineWidth = 0.8; ctx.strokeStyle = BLD.goldBase;
        ctx.beginPath(); ctx.moveTo(0, pullY - 1.5);
        ctx.quadraticCurveTo(pullW / 2, pullY + 1, pullW + 0.5, pullY - 0.5); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(banyaDoorX0 - 2, BANYA_DOOR_Y0 + 1, dw + 4, 2);
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(banyaDoorX0 - 3, BANYA_DOOR_Y0, 3, 4);
    ctx.fillRect(banyaDoorX1, BANYA_DOOR_Y0, 3, 4);
    casing(banyaDoorX0, BANYA_DOOR_Y0, dw, dh - 6, true);
    lantern(banyaDoorX0 - 11, BANYA_DOOR_Y0 - 2);

    // Lived-in props: a bench on the GROUND beside the tower, and a rain
    // barrel on the plinth right of the door.
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x - 48, gy - 9, 3, 9); ctx.fillRect(x - 24, gy - 9, 3, 9);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x - 48, gy - 8, 1, 8); ctx.fillRect(x - 24, gy - 8, 1, 8);
    ctx.fillStyle = BLD.outline; ctx.fillRect(x - 53, gy - 13, 36, 5);
    ctx.fillStyle = BLD.woodMid; ctx.fillRect(x - 52, gy - 12, 34, 3);
    ctx.fillStyle = BLD.woodLight; ctx.fillRect(x - 52, gy - 12, 33, 1);
    ctx.fillStyle = BLD.woodDark; ctx.fillRect(x - 22, gy - 11, 4, 2);
    ctx.fillStyle = BLD.woodDeep; ctx.fillRect(x - 52, gy - 9, 34, 1);

    // Staves turn around a shaded cylinder; hoops sit proud of the wood.
    var barrelX = cx + 68;
    ctx.fillStyle = BLD.outline; ctx.fillRect(barrelX, gy - 40, 16, 20);
    ctx.fillStyle = BLD.woodDark; ctx.fillRect(barrelX + 1, gy - 39, 14, 18);
    ctx.fillStyle = BLD.woodBase; ctx.fillRect(barrelX + 2, gy - 39, 6, 18);
    ctx.fillStyle = BLD.woodMid; ctx.fillRect(barrelX + 2, gy - 38, 1, 16);
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(barrelX + 7, gy - 38, 1, 17);
    ctx.fillRect(barrelX + 12, gy - 38, 2, 17);
    ctx.fillStyle = BLD.woodBase; ctx.fillRect(barrelX + 14, gy - 38, 1, 17);
    for (var hoop = 0; hoop < 2; hoop++) {
      var hoopY = gy - 36 + hoop * 10;
      ctx.fillStyle = BLD.metalDark; ctx.fillRect(barrelX - 1, hoopY, 18, 3);
      ctx.fillStyle = BLD.metalBase; ctx.fillRect(barrelX, hoopY, 16, 1);
      ctx.fillStyle = BLD.metalLight; ctx.fillRect(barrelX, hoopY, 5, 1);
    }
    ctx.fillStyle = BLD.outline;
    ctx.beginPath(); ctx.ellipse(barrelX + 8, gy - 40, 8, 3, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = BLD.waterBase;
    ctx.beginPath(); ctx.ellipse(barrelX + 8, gy - 40, 6, 1.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = BLD.waterLight; ctx.fillRect(barrelX + 4, gy - 41, 5, 1);
    ctx.fillStyle = BLD.woodMid; ctx.fillRect(barrelX + 1, gy - 40, 1, 2);

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

    // Entry hint once the curtains have opened (tap the tower or press E).
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
    if (bathMainRoomVisible()) return bathDrawInterior();
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
          // The copper's stored heat survives the fire going out, then cools.
          if (FG.fill[fti] === 2) {
            var vcx = (crv2.x0 + crv2.x1) / 2;
            uiFg.strokeStyle = BLD.goldDark; uiFg.lineWidth = 6;
            uiFg.beginPath();
            uiFg.moveTo(fx0 + 8, botY - 16); uiFg.lineTo(vcx - 64, botY - 16);
            for (var hx = vcx - 64; hx <= vcx + 64; hx += 8) {
              uiFg.lineTo(hx, crv2.y0 + crv2.depthAt(hx) + 10);
            }
            uiFg.lineTo(fx1 - 8, botY - 16); uiFg.stroke();
            var copper = bathCopperWarmth();
            uiFg.globalAlpha = copper.warm * 0.25 + copper.glow * 0.75; uiFg.strokeStyle = BLD.warmGlow; uiFg.lineWidth = 2;
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
    bathWorldSmokeVisibility(true);
    var bathDrawContext = ctx;
    try {
      if (uiFg) ctx = uiFg;
      ctx.setTransform(_bws, 0, 0, _bws, -Math.round(cam.x * _bws), -Math.round(cam.y * _bws));
      bathArrivalDraw(ctx);
      bathDrawGuests();
      if (typeof bathThermalDraw === 'function') bathThermalDraw(ctx);
      hearthButtons = [];
      hearthDrawStation(ctx);
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
      canvas.addEventListener('pointercancel', function (e) { if (bathTool.pointer === e.pointerId) bathToolCancel(); bathPtrDown = false; hearthCancelDrag(); hearthClearBoilerHover(); });
      canvas.addEventListener('pointerleave', hearthClearBoilerHover);
      canvas.addEventListener('lostpointercapture', function (e) { if (bathTool.pointer === e.pointerId) bathToolCancel(); });
      window.addEventListener('blur', bathToolCancel);
      document.addEventListener('visibilitychange', function () { if (document.hidden) bathToolCancel(); });
      canvas.addEventListener('wheel', bathWheelScroll, { passive: false });
    } catch (e) {}
  }
