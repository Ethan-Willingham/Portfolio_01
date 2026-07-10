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

  // ---- The pocket room (world tiles; deep in the inert bedrock fill) ----
  var BATH_ROOM_R0 = 600, BATH_ROOM_R1 = 613;   // ceiling row / floor row
  var BATH_ROOM_C0 = 20,  BATH_ROOM_C1 = 51;    // left wall col / right wall col
  var BATH_TUB_WALLS = [26, 31, 38, 43];        // tub 1 = 26..31, tub 2 = 38..43
  var BATH_EXIT_X0 = 48 * TILE, BATH_EXIT_X1 = 50 * TILE;   // exit door rect
  var BATH_EXIT_Y0 = 609 * TILE, BATH_EXIT_Y1 = 613 * TILE;
  var BATH_CAM_CX = 36 * TILE;                  // camera pin centre
  var BATH_CAM_CY = 607 * TILE + 8;             // slight down bias: tubs + floor

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

  // ---- Room construction (one-shot, on first enter) ----------------------
  function bathCarveRoom() {
    if (bathRoomReady) return;
    if (typeof world === 'undefined' || !world[BATH_ROOM_R1]) return;
    // Shell + cavity. Replacing tile objects wholesale is safe (the shared
    // frozen fill prototypes are never mutated, only de-referenced).
    for (var r = BATH_ROOM_R0; r <= BATH_ROOM_R1; r++) {
      for (var c = BATH_ROOM_C0; c <= BATH_ROOM_C1; c++) {
        var edge = (r === BATH_ROOM_R0 || r === BATH_ROOM_R1 ||
                    c === BATH_ROOM_C0 || c === BATH_ROOM_C1);
        world[r][c] = edge ? { type: 'foundation', hp: 999999 } : null;
      }
    }
    // Tub side walls (2 tiles tall, sitting on the floor row).
    for (var i = 0; i < BATH_TUB_WALLS.length; i++) {
      for (var r2 = 611; r2 <= 612; r2++) {
        world[r2][BATH_TUB_WALLS[i]] = { type: 'foundation', hp: 999999 };
      }
    }
    // Water: tub 1 (cols 27-30) full + HOT, tub 2 (cols 39-42) half + cold.
    var sp = 4.8, x, y;
    for (y = 611 * TILE + 3; y < 613 * TILE - 3; y += sp) {
      for (x = 27 * TILE + 3; x < 31 * TILE - 3; x += sp) {
        addLiquidParticle('water', x, y, 0, 0, 0);
      }
    }
    for (y = 612 * TILE + 2; y < 613 * TILE - 3; y += sp) {
      for (x = 39 * TILE + 3; x < 43 * TILE - 3; x += sp) {
        addLiquidParticle('water', x, y, 0, 0, 0);
      }
    }
    // Repoint the ONE B1 heat-source rect at tub 1's floor band. This
    // supersedes the v25.56 pond demo (same lanes, better home).
    bathTune('BATH_SRC_X0', 27 * TILE); bathTune('BATH_SRC_Y0', 612 * TILE);
    bathTune('BATH_SRC_X1', 31 * TILE); bathTune('BATH_SRC_Y1', 613 * TILE + TILE);
    bathTune('BATH_ON', 1);
    bathRoomReady = true;
    try {
      console.log('[bath] room carved at rows ' + BATH_ROOM_R0 + '-' + BATH_ROOM_R1 +
        ', tub 1 heated. __bath.enter()/.exit()/.warp(); levers via bathTune.');
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
  // whole room to the canvas every frame (any window size, any dpr), and
  // restore the player's worldScale on exit. Overriding the global keeps
  // the liquid overlay's view mapping in perfect agreement with the main
  // canvas transform, since both read dpr * worldScale live. --------------
  var BATH_VIEW_W = 34 * TILE;    // room + shell walls (cols 20-52 and change)
  var BATH_VIEW_H = 15 * TILE;    // rows 600-614 incl. the floor boards
  var bathSavedScale = null;
  function bathCamPin() {
    if (!bathMode) {
      if (bathSavedScale !== null) { worldScale = bathSavedScale; bathSavedScale = null; }
      return false;
    }
    if (bathSavedScale === null) bathSavedScale = worldScale;
    worldScale = Math.min(canvas.width / dpr / BATH_VIEW_W,
                          canvas.height / dpr / BATH_VIEW_H);
    var iws = 1 / (dpr * worldScale);
    cam.x = BATH_CAM_CX - canvas.width * iws / 2;
    cam.y = BATH_CAM_CY - canvas.height * iws / 2;
    return true;
  }

  // ---- Click / tap: enter from outside (near the door), exit on the room's
  // door. One handler, mouse + touch. --------------------------------------
  function bathPointer(e) {
    if (!ENABLE_BATH || bathFading) return;
    var rct = canvas.getBoundingClientRect();
    if (!rct.width || !rct.height) return;
    var ws = dpr * worldScale;
    var wx = cam.x + (e.clientX - rct.left) * (canvas.width / rct.width) / ws;
    var wy = cam.y + (e.clientY - rct.top) * (canvas.height / rct.height) / ws;
    if (bathMode) {
      if (wx >= BATH_EXIT_X0 && wx <= BATH_EXIT_X1 &&
          wy >= BATH_EXIT_Y0 && wy <= BATH_EXIT_Y1) bathExit();
      return;
    }
    // Outside: the whole tower is the button, but only when the rig is near.
    if (!bathPickSite()) return;
    var dx = (player.x + PLAYER_W / 2) - (banyaX + BANYA_W / 2);
    if (Math.abs(dx) > 9 * TILE) return;
    if (wx >= banyaX - 8 && wx <= banyaX + BANYA_W + 8 &&
        wy >= SKY_ROWS * TILE - 480 && wy <= SKY_ROWS * TILE) bathEnter();
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
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(cx - half + 26, yB + 1, half * 2 - 52, 7);
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
    drawWoodPlanking(cx - 66, gy - 208, 132, 76, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(cx - 66, gy - 208, 132, 76);
    drawWoodPlanking(cx - 52, gy - 288, 104, 66, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(cx - 52, gy - 288, 104, 66);
    drawWoodPlanking(cx - 38, gy - 356, 76, 54, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(cx - 38, gy - 356, 76, 54);

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
    ctx.moveTo(cx - 46, gy - 369); ctx.lineTo(cx, gy - 436);
    ctx.lineTo(cx + 46, gy - 369); ctx.closePath(); ctx.fill();
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
    lantern(banyaDoorX0 - 11, BANYA_DOOR_Y0 - 2);

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

  // ---- Hook 3: render() top (140). Draws the whole scene and consumes the
  // frame. The liquid layer is a separate DOM canvas above this one, so
  // calling drawLiquids() here keeps the tub water live. -------------------
  function bathRenderScene() {
    if (!bathMode) return false;
    // Own the WHOLE canvas: the world viewport excludes the console strip,
    // so without this full-screen clear the strip keeps last frame's stale
    // console pixels (found the hard way). Then rebuild the world transform
    // (no screenshake in here) and draw the room in world coords.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120d08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var _bws = dpr * worldScale;
    ctx.setTransform(_bws, 0, 0, _bws,
      -Math.round(cam.x * _bws), -Math.round(cam.y * _bws));
    var iws2 = 1 / _bws;
    var vx0 = cam.x - 8, vw = canvas.width * iws2 + 16;
    var vy0 = cam.y - 8, vh = canvas.height * iws2 + 16;
    // Back wall: planking pushed back by a dark wash.
    drawWoodPlanking(BATH_ROOM_C0 * TILE + TILE, BATH_ROOM_R0 * TILE + TILE,
                     (BATH_ROOM_C1 - BATH_ROOM_C0 - 1) * TILE,
                     (BATH_ROOM_R1 - BATH_ROOM_R0 - 1) * TILE, 8);
    ctx.fillStyle = 'rgba(10,6,3,0.42)';
    ctx.fillRect(BATH_ROOM_C0 * TILE + TILE, BATH_ROOM_R0 * TILE + TILE,
                 (BATH_ROOM_C1 - BATH_ROOM_C0 - 1) * TILE,
                 (BATH_ROOM_R1 - BATH_ROOM_R0 - 1) * TILE);
    // Ceiling beam + floor boards.
    ctx.fillStyle = '#1c130c';
    ctx.fillRect(vx0, BATH_ROOM_R0 * TILE - 8, vw, TILE + 8);
    drawWoodPlanking(vx0, BATH_ROOM_R1 * TILE, vw, TILE + 10, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(vx0, BATH_ROOM_R1 * TILE, vw, TILE + 10);
    ctx.fillStyle = '#0d0906';
    ctx.fillRect(vx0, BATH_ROOM_R1 * TILE + TILE + 10, vw, vh);
    // Side pillars at the shell walls.
    ctx.fillStyle = '#241810';
    ctx.fillRect(BATH_ROOM_C0 * TILE - 8, BATH_ROOM_R0 * TILE, TILE + 8, (BATH_ROOM_R1 - BATH_ROOM_R0 + 1) * TILE);
    ctx.fillRect(BATH_ROOM_C1 * TILE, BATH_ROOM_R0 * TILE, TILE + 8, (BATH_ROOM_R1 - BATH_ROOM_R0 + 1) * TILE);
    // «БАНЯ» wall sign.
    ctx.fillStyle = '#241810'; ctx.fillRect(1056, 19260, 192, 44);
    ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2; ctx.strokeRect(1057, 19261, 190, 42);
    ctx.fillStyle = '#e0b060';
    ctx.font = 'bold 26px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('БАНЯ', 1152, 19283);
    // Oil lamps (bracket + flame + layered halo; flat, no filters).
    var lt = performance.now() * 0.001;
    function lamp(lx, ly) {
      var f = 0.9 + 0.1 * Math.sin(lt * 3 + lx);
      ctx.fillStyle = 'rgba(255,184,92,0.05)';
      ctx.beginPath(); ctx.arc(lx, ly, 88, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,184,92,0.09)';
      ctx.beginPath(); ctx.arc(lx, ly, 44, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#54381f'; ctx.fillRect(lx - 3, ly - 26, 6, 18);
      ctx.fillStyle = 'rgba(255,206,106,' + f + ')';
      ctx.beginPath(); ctx.arc(lx, ly, 5, 0, 6.283); ctx.fill();
    }
    lamp(792, 19330); lamp(1450, 19330);
    // Tubs: dark inner backdrop (water pops against it), stave walls, hoops.
    function tub(wc0, wc1) {
      var tx0 = wc0 * TILE, tx1 = (wc1 + 1) * TILE;
      ctx.fillStyle = '#0e0a06';
      ctx.fillRect(tx0 + TILE, 611 * TILE, (wc1 - wc0 - 1) * TILE, 2 * TILE);
      ctx.fillStyle = '#6e4526';
      ctx.fillRect(tx0, 611 * TILE - 6, TILE, 2 * TILE + 6);
      ctx.fillRect(tx1 - TILE, 611 * TILE - 6, TILE, 2 * TILE + 6);
      ctx.fillStyle = '#543319';
      ctx.fillRect(tx0 - 4, 611 * TILE - 12, TILE + 8, 8);
      ctx.fillRect(tx1 - TILE - 4, 611 * TILE - 12, TILE + 8, 8);
      ctx.fillStyle = '#4a5560';
      ctx.fillRect(tx0 - 2, 611 * TILE + 14, tx1 - tx0 + 4, 6);
      ctx.fillRect(tx0 - 2, 612 * TILE + 10, tx1 - tx0 + 4, 6);
    }
    tub(26, 31); tub(38, 43);
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
    ctx.fillText('tap the door (or ESC) to leave the banya', canvas.width / 2, canvas.height - 26);
    ctx.textAlign = 'left';
    return true;
  }

  if (ENABLE_BATH) {
    window.bathTune = bathTune;
    window.__bath = { tune: bathTune, enter: bathEnter, exit: bathExit,
                      night: function (v) { bathNightOverride = (v === undefined || v === null) ? -1 : +v; },
                      warp: bathWarp,
                      get mode() { return bathMode; } };
    try { canvas.addEventListener('pointerdown', bathPointer); } catch (e) {}
  }
