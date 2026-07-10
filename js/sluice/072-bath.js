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
     v1 has no hose / guests / steam yet; this slice is the skeleton the
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
  var BATH_FLOORS = [
    { c0: 26, c1: 46, fr: 613, deep: 2, tubs: [[28,30],[32,34],[36,38],[40,42]], fill: [1,1,1,1] },
    { c0: 26, c1: 46, fr: 600, deep: 2, tubs: [[28,30],[32,34],[36,38],[40,42]], fill: [0,0,0,0] },
    { c0: 28, c1: 44, fr: 587, deep: 0, tubs: [], fill: [], sauna: true },
    { c0: 30, c1: 42, fr: 574, deep: 2, tubs: [[32,35],[37,40]], fill: [1,1] },
    { c0: 31, c1: 41, fr: 561, deep: 3, tubs: [[33,39]], fill: [2] }
  ];
  var BATH_TOP_ROW = 548;                       // F5 ceiling row
  var BATH_BOT_ROW = 613;                       // F1 floor slab row
  var BATH_VIEW_W = 25 * TILE;                  // width-fit: widest floor + shell
  var BATH_EXIT_X0 = 44 * TILE, BATH_EXIT_X1 = 47 * TILE;   // F1 right-wall door
  var BATH_EXIT_Y0 = 609 * TILE, BATH_EXIT_Y1 = 613 * TILE;

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
    for (r = BATH_TOP_ROW; r <= BATH_BOT_ROW; r++) {
      for (c = BATH_CX_COL - 14; c <= BATH_CX_COL + 14; c++) {
        world[r][c] = { type: 'foundation', hp: 999999 };
      }
    }
    for (f = 0; f < BATH_FLOORS.length; f++) {
      var F = BATH_FLOORS[f];
      for (r = F.fr - 12; r <= F.fr - 1; r++) {
        for (c = F.c0; c <= F.c1; c++) world[r][c] = null;
      }
      for (i = 0; i < F.tubs.length; i++) {
        var tb = F.tubs[i];
        for (r = F.fr - F.deep; r <= F.fr - 1; r++) {
          world[r][tb[0] - 1] = { type: 'foundation', hp: 999999 };
          world[r][tb[1] + 1] = { type: 'foundation', hp: 999999 };
        }
        if (F.fill[i]) {
          var wy0 = (F.fr - F.deep) * TILE + 12, wy1 = F.fr * TILE - 3;
          for (var wy = wy0; wy < wy1; wy += 1.6) {
            for (var wx = tb[0] * TILE + 3; wx < (tb[1] + 1) * TILE - 3; wx += 1.6) {
              addLiquidParticle('water', wx, wy, 0, 0, 0);
            }
          }
        }
      }
      if (F.sauna) {
        // Two stepped bench tiers along the left wall (solid, sittable).
        for (c = F.c0 + 1; c <= F.c0 + 7; c++) world[F.fr - 1][c] = { type: 'foundation', hp: 999999 };
        for (c = F.c0 + 1; c <= F.c0 + 4; c++) world[F.fr - 2][c] = { type: 'foundation', hp: 999999 };
      }
    }
    // The ONE B1 heat rect warms the CROWN POOL: the payoff at the top.
    // (B2's source list will heat more; until then the lower tubs run cold.)
    var P = BATH_FLOORS[4], pt = P.tubs[0];
    bathTune('BATH_SRC_X0', pt[0] * TILE);       bathTune('BATH_SRC_Y0', (P.fr - 1) * TILE);
    bathTune('BATH_SRC_X1', (pt[1] + 1) * TILE); bathTune('BATH_SRC_Y1', (P.fr + 1) * TILE);
    bathTune('BATH_ON', 1);
    bathRoomReady = true;
    try {
      console.log('[bath] tower carved: 5 floors, rows ' + BATH_TOP_ROW + '-' +
        BATH_BOT_ROW + '; crown pool heated. __bath.floor(1..5) scrolls there.');
    } catch (e) {}
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
    var d = inside ? 'none' : 'block';
    try { if (typeof uiTopCanvas !== 'undefined' && uiTopCanvas) uiTopCanvas.style.display = d; } catch (e) {}
    try { if (typeof smokeFluidCanvas !== 'undefined' && smokeFluidCanvas) smokeFluidCanvas.style.display = d; } catch (e) {}
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
      } else {
        bathMode = false;
        bathDoorArm = false;   // must step off the door before it re-arms
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
    return true;
  }

  // ---- Hook 2: updateCamera() top (080). The scene OWNS the zoom: fit the
  // tower WIDTH to the canvas (any window, any dpr) and scroll VERTICALLY
  // through the floors (wheel / drag / touch feed bathScrollT). Overriding
  // the global worldScale keeps the liquid overlay's view mapping in
  // perfect agreement with the main canvas transform, since both read
  // dpr * worldScale live. Restored on exit. -------------------------------
  var bathSavedScale = null;
  var bathScrollT = 1e9;          // scroll target (world y); huge = clamp to bottom
  var bathCamY = -1;              // smoothed camera y; -1 = snap on first pin
  var bathViewH = 0;              // visible height in world px (set per frame)
  function bathCamPin() {
    if (!bathMode) {
      if (bathSavedScale !== null) { worldScale = bathSavedScale; bathSavedScale = null; }
      return false;
    }
    if (bathSavedScale === null) bathSavedScale = worldScale;
    worldScale = canvas.width / dpr / BATH_VIEW_W;
    var iws = 1 / (dpr * worldScale);
    bathViewH = canvas.height * iws;
    var minY = BATH_TOP_ROW * TILE - 24;
    var maxY = (BATH_BOT_ROW + 1) * TILE + 24 - bathViewH;
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
    bathScrollT = (F.fr - 6) * TILE - bathViewH / 2;
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
    var f, i, F;
    for (f = 0; f < BATH_FLOORS.length; f++) {
      F = BATH_FLOORS[f];
      var ix = F.c0 * TILE, iy = (F.fr - 12) * TILE;
      var iw = (F.c1 - F.c0 + 1) * TILE, ih = 12 * TILE;
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
      lamp(ix + 40, iy + 116);
      lamp(ix + iw - 40, iy + 116);
      // Tubs: dark inner backdrop (water pops), stave walls, iron hoops.
      for (i = 0; i < F.tubs.length; i++) {
        var tb = F.tubs[i];
        var tx0 = (tb[0] - 1) * TILE, tx1 = (tb[1] + 2) * TILE;
        var ty = (F.fr - F.deep) * TILE;
        ctx.fillStyle = '#0e0a06';
        ctx.fillRect(tb[0] * TILE, ty, (tb[1] - tb[0] + 1) * TILE, F.deep * TILE);
        ctx.fillStyle = '#6e4526';
        ctx.fillRect(tx0, ty - 6, TILE, F.deep * TILE + 6);
        ctx.fillRect(tx1 - TILE, ty - 6, TILE, F.deep * TILE + 6);
        ctx.fillStyle = '#543319';
        ctx.fillRect(tx0 - 4, ty - 12, TILE + 8, 8);
        ctx.fillRect(tx1 - TILE - 4, ty - 12, TILE + 8, 8);
        ctx.fillStyle = '#4a5560';
        ctx.fillRect(tx0 - 2, ty + 12, tx1 - tx0 + 4, 5);
        if (F.deep > 1) ctx.fillRect(tx0 - 2, ty + F.deep * TILE - 18, tx1 - tx0 + 4, 5);
      }
      if (F.sauna) {
        // Bench tiers over the solid tiles, the kamenka stove with hot
        // rocks and an ember glow, and the ПАРИЛКА plaque.
        drawWoodPlanking(ix + TILE, (F.fr - 2) * TILE, 4 * TILE, TILE, 5);
        drawWoodPlanking(ix + TILE, (F.fr - 1) * TILE, 7 * TILE, TILE, 5);
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
        ctx.fillStyle = '#241810'; ctx.fillRect(ix + iw / 2 - 64, iy + 24, 128, 30);
        ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2;
        ctx.strokeRect(ix + iw / 2 - 63, iy + 25, 126, 28);
        ctx.fillStyle = '#e0b060';
        ctx.font = 'bold 15px "Commit Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ПАРИЛКА', ix + iw / 2, iy + 39);
      }
    }
    // «БАНЯ» sign on the bottom floor's back wall.
    var F1 = BATH_FLOORS[0];
    ctx.fillStyle = '#241810';
    ctx.fillRect(BATH_CX_COL * TILE - 88, (F1.fr - 11) * TILE, 176, 40);
    ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2;
    ctx.strokeRect(BATH_CX_COL * TILE - 87, (F1.fr - 11) * TILE + 1, 174, 38);
    ctx.fillStyle = '#e0b060';
    ctx.font = 'bold 24px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('БАНЯ', BATH_CX_COL * TILE, (F1.fr - 11) * TILE + 21);
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
    // Screen-space caption.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(224,176,96,0.75)';
    ctx.font = '13px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('scroll or drag to climb the tower · tap ВЫХОД (or ESC) to leave', canvas.width / 2, canvas.height - 26);
    ctx.textAlign = 'left';
    return true;
  }

  if (ENABLE_BATH) {
    window.bathTune = bathTune;
    window.__bath = { tune: bathTune, enter: bathEnter, exit: bathExit,
                      floor: bathScrollToFloor,
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
