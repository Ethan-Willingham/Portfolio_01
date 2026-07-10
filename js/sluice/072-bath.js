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
  var BANYA_W = 7 * TILE;               // 7 tiles wide (224 px)
  var banyaX = -1;                      // set by bathPickSite()
  var banyaDoorX0 = 0, banyaDoorX1 = 0;
  var BANYA_DOOR_Y0 = SKY_ROWS * TILE - 80;
  var BANYA_DOOR_Y1 = SKY_ROWS * TILE;
  function bathPickSite() {
    if (banyaX >= 0) return true;
    if (typeof surfacePonds === 'undefined' || typeof world === 'undefined' ||
        !world.length) return false;
    var rightEdge = 15;
    for (var i = 0; i < surfacePonds.length; i++) {
      var p = surfacePonds[i];
      if (p.cL < 70 && p.cR > rightEdge) rightEdge = p.cR;
    }
    var col = rightEdge + 3;
    if (col > 62) col = 62;
    banyaX = col * TILE;
    banyaDoorX0 = banyaX + 152;
    banyaDoorX1 = banyaX + 200;
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
        wy >= SKY_ROWS * TILE - 280 && wy <= SKY_ROWS * TILE) bathEnter();
  }

  // ---- Exterior: the tower on the town surface (world coords; called from
  // the surface-props pass in 140). -----------------------------------------
  function drawBanyaExterior() {
    if (!ENABLE_BATH || bathMode || !bathPickSite()) return;
    var gy = SKY_ROWS * TILE;                 // 128, the surface line
    var x = banyaX, w = BANYA_W;
    // Stone footing (three courses).
    ctx.fillStyle = '#6f6f6f'; ctx.fillRect(x - 4, gy - 40, w + 8, 40);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(x - 4, gy - 27, w + 8, 2); ctx.fillRect(x - 4, gy - 14, w + 8, 2);
    // Timber body (two floors of saloon planking).
    drawWoodPlanking(x, gy - 176, w, 136, 7);
    // Iron top floor, bolted on.
    drawRivetedPlate(x, gy - 228, w, 52);
    // Roof: shallow iron gable + flue stack.
    ctx.fillStyle = '#39424c';
    ctx.beginPath();
    ctx.moveTo(x - 12, gy - 228); ctx.lineTo(x + w / 2, gy - 272);
    ctx.lineTo(x + w + 12, gy - 228); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2c343c'; ctx.fillRect(x - 12, gy - 230, w + 24, 4);
    ctx.fillStyle = '#4a5560'; ctx.fillRect(x + w - 54, gy - 262, 16, 30);
    ctx.fillStyle = '#39424c'; ctx.fillRect(x + w - 57, gy - 266, 22, 5);
    // Sign board: «БАНЯ».
    ctx.fillStyle = '#241810'; ctx.fillRect(x + 42, gy - 214, 140, 30);
    ctx.strokeStyle = '#8a5427'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 43, gy - 213, 138, 28);
    ctx.fillStyle = '#e0b060';
    ctx.font = 'bold 21px "Commit Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('БАНЯ', x + 112, gy - 198);
    // Warm windows (timber floor pair + one iron porthole).
    var wt = performance.now() * 0.001;
    var flick = 0.92 + 0.08 * Math.sin(wt * 2.1);
    function winGlow(cx2, cy2) {
      ctx.fillStyle = 'rgba(255,184,92,0.10)';
      ctx.beginPath(); ctx.arc(cx2, cy2, 26, 0, 6.283); ctx.fill();
    }
    winGlow(x + 44, gy - 118); winGlow(x + 122, gy - 118);
    ctx.fillStyle = 'rgba(255,206,106,' + (0.85 * flick) + ')';
    ctx.fillRect(x + 30, gy - 134, 28, 32); ctx.fillRect(x + 108, gy - 134, 28, 32);
    ctx.strokeStyle = '#3d2820'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 30, gy - 134, 28, 32); ctx.strokeRect(x + 108, gy - 134, 28, 32);
    ctx.beginPath();
    ctx.moveTo(x + 44, gy - 134); ctx.lineTo(x + 44, gy - 102);
    ctx.moveTo(x + 30, gy - 118); ctx.lineTo(x + 58, gy - 118);
    ctx.moveTo(x + 122, gy - 134); ctx.lineTo(x + 122, gy - 102);
    ctx.moveTo(x + 108, gy - 118); ctx.lineTo(x + 136, gy - 118);
    ctx.stroke();
    winGlow(x + w / 2, gy - 202);
    ctx.fillStyle = 'rgba(255,206,106,' + (0.8 * flick) + ')';
    ctx.beginPath(); ctx.arc(x + w / 2, gy - 202, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#2c343c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x + w / 2, gy - 202, 10, 0, 6.283); ctx.stroke();
    // Door: dark opening + felt flap + lamp.
    ctx.fillStyle = '#14100e';
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, banyaDoorX1 - banyaDoorX0, 80);
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(banyaDoorX0, BANYA_DOOR_Y0, banyaDoorX1 - banyaDoorX0, 34);
    ctx.strokeStyle = '#6e3a2c'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(banyaDoorX0, BANYA_DOOR_Y0 + 34);
    ctx.quadraticCurveTo(banyaDoorX0 + 12, BANYA_DOOR_Y0 + 42, banyaDoorX0 + 24, BANYA_DOOR_Y0 + 34);
    ctx.quadraticCurveTo(banyaDoorX0 + 36, BANYA_DOOR_Y0 + 42, banyaDoorX1, BANYA_DOOR_Y0 + 34);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,184,92,0.12)';
    ctx.beginPath(); ctx.arc(banyaDoorX0 - 12, BANYA_DOOR_Y0 + 6, 20, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffce6a';
    ctx.fillRect(banyaDoorX0 - 15, BANYA_DOOR_Y0 + 2, 6, 8);
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
                      warp: bathWarp,
                      get mode() { return bathMode; } };
    try { canvas.addEventListener('pointerdown', bathPointer); } catch (e) {}
  }
