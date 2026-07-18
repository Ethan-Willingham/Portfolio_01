  /* ---- Input ---- */
  function setupInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) !== -1) e.preventDefault();
      // Escape toggles the pause screen during normal play. If a shop/modal is
      // open, leave Escape to the game loop's shop-close handler (it polls keys[]);
      // only own Escape when nothing else does. !e.repeat so holding the key can't
      // flicker pause/resume. pauseGame/resumeGame are hoisted below in setupInput.
      // v26.31 — the RUNNING banya scene defers the same way (bathFrame
      // polls keys[] and exits); before this, Escape inside the bath PAUSED
      // the frozen world instead of leaving, despite the scene caption
      // promising ESC. While paused the handler still owns Escape (the
      // bath's poll is frozen, so deferring there would dead-key resume).
      if (e.key === 'Escape' && !e.repeat) {
        var shopUp = (UI_NEW && shopState !== 'closed') || shopOpen ||
                     (typeof bathMode !== 'undefined' && bathMode && !gamePaused);
        if (!shopUp) {
          keys['Escape'] = false;   // consumed here — don't double-handle in the loop
          if (gamePaused) resumeGame(); else pauseGame();
        }
      }
    });
    window.addEventListener('keyup', function (e) {
      keys[e.key] = false;
      // v11.10 — release [Q] fires the wheel's hovered slot
      if ((e.key === 'q' || e.key === 'Q') && itemWheel.open && itemWheel.pointerId === 'kb') {
        closeItemWheel(true);
      }
    });

    // ----- Bug fix: jetpack stuck on after clicking off the canvas -----
    // If the window/tab loses focus while a key is held, the OS never
    // delivers the corresponding `keyup` event, so the key entry stays
    // `true` forever and the rig keeps thrusting (or moving) on its own
    // until the player presses-and-releases that key again. Clear all
    // input state any time we lose focus or visibility — also drop any
    // touch-d-pad state for the same reason.
    function clearAllInput() {
      for (var k in keys) keys[k] = false;
      dpad.left = dpad.right = dpad.up = dpad.down = false;
      touch.active = false;
      player.thrusting = false;
      // Forget any in-flight multi-touch state too — otherwise the next
      // touch after returning to the tab might look like a continuation
      // of a touch the OS already cancelled, and the d-pad would lock on.
      dpadTouchId = null;
      shopTapCandidate = null;
      shopDrag = null;
      if (itemWheel.open) closeItemWheel(false);
    }
    // v17.82 — pause the game when the window loses focus (or the tab is
    // hidden). This is NOT just a state freeze: pauseGame cancels the pending
    // animation frame so the rAF loop stops scheduling entirely, which lets
    // the CPU/GPU drop to idle instead of redrawing the same frame ~120×/sec
    // forever. The loop is re-kicked (exactly once) by resumeGame.
    function pauseGame(reason) {
      if (PAUSE_DISABLED) return;   // ?nopause=1 harness lever (020)
      if (gamePaused) return;
      gamePaused = true;
      bootPauseFired = true;   // a manual/focus pause also satisfies the boot pause
      if (gameRafId) { cancelAnimationFrame(gameRafId); gameRafId = 0; }
      // Show the menu BEFORE clearing input so a hiccup in clearAllInput can
      // never leave the loop stopped with no visible way to resume.
      showPauseOverlay(reason);
      clearAllInput();
    }
    function resumeGame() {
      if (!gamePaused) return;
      gamePaused = false;
      var ov = document.getElementById('game-pause');
      if (ov) { ov.classList.remove('is-visible'); ov.setAttribute('aria-hidden', 'true'); }
      // Reset the clock so the long paused gap doesn't arrive as one giant dt
      // on the first resumed frame (loop clamps to 0.1s, but this is cleaner).
      lastTime = performance.now();
      if (gameRafId) cancelAnimationFrame(gameRafId);
      gameRafId = requestAnimationFrame(loop);
    }
    // Auto-pause triggers: window blur (visible-but-unfocused — the case the
    // browser does NOT throttle on its own) and tab hide. Both route through
    // pauseGame, which still clears input the way the old handlers did.
    // EXCEPTION: entering/exiting fullscreen fires a transient window blur that
    // is NOT the user leaving the game. sluice.html stamps window.__sluiceFsGuardUntil
    // for the duration of a fullscreen transition; skip the auto-pause while it's
    // active so going fullscreen no longer pops the pause menu. (visibilitychange
    // is left unguarded — fullscreen never hides the document, so a real tab-hide
    // still pauses.)
    function fsTransitionActive() {
      var until = window.__sluiceFsGuardUntil || 0;
      return until && performance.now() < until;
    }
    window.addEventListener('blur', function () {
      if (fsTransitionActive()) return;
      pauseGame('window lost focus');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseGame('window lost focus');
    });
    // Pause-menu buttons. Resume continues; Restart wipes the run then resumes
    // so the freshly-init'd world starts animating again.
    var _gmResumeBtn = document.getElementById('gm-resume-btn');
    if (_gmResumeBtn) _gmResumeBtn.addEventListener('click', function () { resumeGame(); });
    var _gmRestartBtn = document.getElementById('gm-restart-btn');
    if (_gmRestartBtn) _gmRestartBtn.addEventListener('click', function () {
      // Persistent-profile model (047-save.js): the pause-screen Restart is
      // the ONLY full wipe, so it confirms and erases the save first.
      var ok = true;
      try { ok = window.confirm('Start a NEW GAME? Your saved progress will be erased.'); } catch (e) {}
      if (!ok) return;
      saveWipe();
      init();
      resumeGame();
    });
    // v17.83 — manual pause button (top-left, under the version/FPS readout).
    // stopPropagation so the press can't also register as a game click.
    var _gmPauseBtn = document.getElementById('gm-pause-btn');
    if (_gmPauseBtn) _gmPauseBtn.addEventListener('click', function (e) { e.stopPropagation(); pauseGame(); });

    // Touch
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    // touchcancel fires when the browser interrupts a gesture (e.g. a
    // system overlay taking focus). Treat it the same as touchend so the
    // d-pad doesn't get stuck pressed.
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Mouse fallback for non-mobile
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Mouse wheel — only consumed when the shop is open (so page scrolling
    // outside of an open shop still works). passive:false because we call
    // preventDefault inside the handler when the shop is open.
    canvas.addEventListener('wheel', handleShopWheel, { passive: false });
  }

  function canvasPos(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // Multi-touch tracking. We need to be able to:
  //  - hold the d-pad with one finger and tap a HUD button (or shop) with another
  //  - keep the d-pad responding to its OWN finger when other fingers move
  // To pull this off we remember which touch identifier is currently driving
  // the d-pad. dpad updates only respond to that specific touch.
  var dpadTouchId = null;

  // v26.20 — a press that lands ON the shop building but INSIDE the d-pad zone
  // is ambiguous: a sustained HOLD means "drive/thrust" (must not open the
  // shop, per isInDpadZone), but a quick TAP means "enter the shop". We can
  // only tell the two apart on release, so a candidate press is parked here and
  // resolved in processPointerUp (short + low-movement release still on the
  // building => enter). This is what restores tap-to-enter on short landscape
  // phones where the whole building sits under the d-pad disc.
  var shopTapCandidate = null;

  function handleTouchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var p = canvasPos(t.clientX, t.clientY);
      processPointerDown(p.x, p.y, t.identifier);
    }
  }
  function handleTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var p = canvasPos(t.clientX, t.clientY);
      processPointerMove(p.x, p.y, t.identifier);
    }
  }
  function handleTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      processPointerUp(e.changedTouches[i].identifier);
    }
  }
  function handleMouseDown(e) {
    var p = canvasPos(e.clientX, e.clientY);
    processPointerDown(p.x, p.y, 'mouse');
  }
  function handleMouseMove(e) {
    var p = canvasPos(e.clientX, e.clientY);
    mouseCursor.x = p.x; mouseCursor.y = p.y;
    if (itemWheel.open && itemWheel.pointerId === 'mouse') {
      updateItemWheelHover(p.x, p.y);
    }
    if (UI_NEW && shopState !== 'closed') updateShopHover(p.x, p.y);
    if (!touch.active) return;
    processPointerMove(p.x, p.y, 'mouse');
  }
  function handleMouseUp() { processPointerUp('mouse'); }

  function processPointerDown(x, y, id) {
    touch.active = true;
    touch.x = x;
    touch.y = y;
    touch.startX = x;
    touch.startY = y;

    // v11.56 — Item wheel: click-toggle, not hold-release. While the wheel
    // is open a tap resolves at once — on a wedge it fires that item, on
    // the ITEMS button or empty space it just dismisses. While closed, a
    // tap on the ITEMS button opens the wheel (and it stays open).
    if (UI_NEW && itemWheel.open) {
      if (pointInItemWheelButton(x, y)) {
        closeItemWheel(false);
      } else {
        updateItemWheelHover(x, y);
        closeItemWheel(itemWheel.hover >= 0);
      }
      return;
    }
    if (UI_NEW && pointInItemWheelButton(x, y)) {
      openItemWheel(id);
      return;
    }

    // v11.13 — Walk-up shop interior owns all input while open.
    if (UI_NEW && shopState !== 'closed') {
      handleShopInteriorPointerDown(x, y, id);
      return;
    }

    // Shop-open path takes precedence over HUD chips so the player can
    // freely scroll/tap inside the shop without accidentally firing a bomb
    // by tapping near where its HUD chip used to be.
    if (shopOpen) {
      handleShopPointerDown(x, y, id);
      return;
    }

    // Zoom toggle button (top-right HUD) takes precedence over everything
    // else so tapping it doesn't accidentally open the shop or activate
    // the d-pad.
    var zb = drawHUD._zoomBtn;
    if (zb && x >= zb.x && x <= zb.x + zb.w && y >= zb.y && y <= zb.y + zb.h) {
      toggleZoom();
      return;
    }
    // Teleporter button (just left of zoom)
    var tb = drawHUD._teleBtn;
    if (tb && tb.w > 0 && x >= tb.x && x <= tb.x + tb.w && y >= tb.y && y <= tb.y + tb.h) {
      activateTeleporter();
      return;
    }
    // Balloon button (left of teleporter)
    var bb = drawHUD._balloonBtn;
    if (bb && bb.w > 0 && x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h) {
      activateRoverDrop();
      return;
    }
    // Small bomb chip
    var sb = drawHUD._bombSmallBtn;
    if (sb && sb.w > 0 && x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
      activateBomb('small');
      return;
    }
    // Large bomb chip
    var lb = drawHUD._bombLargeBtn;
    if (lb && lb.w > 0 && x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) {
      activateBomb('large');
      return;
    }

    // v15.1 — Click / tap the shop building to enter. isPointOnShop is a
    // generous whole-building hit target (+ margin). The shop is drawn in
    // world space, so translate the canvas point through the camera. No
    // proximity gate: if the building is on screen and you click it, you
    // shop. The keyboard path (Enter/E) keeps the drive-up requirement.
    if (UI_NEW && shopState === 'closed' && !gameOver && !gameWon &&
        !isInDpadZone(x, y)) {
      var wx = x / worldScale + cam.x;
      var wy = y / worldScale + cam.y;
      if (isPointOnShop(wx, wy)) { enterShopFloor(); return; }
      // v26.31 — the banya tower enters the same way (072-bath.js owns the
      // hit test + fade; inert unless ENABLE_BATH).
      if (typeof isPointOnBanya === 'function' && isPointOnBanya(wx, wy)) {
        bathEnter(); return;
      }
    }

    // Anything else inside the d-pad zone becomes a d-pad touch. We
    // remember the touch identifier so subsequent touchmove/touchend
    // events for OTHER fingers (e.g. tapping a HUD chip) don't clobber
    // the d-pad state.
    // v25.33 — one mobile control: the full d-pad wheel drives ground AND
    // flight. The old split flight pad (rotate L/R bottom-left + thrust
    // bottom-right) is retired. The wheel's up = thrust, left/right = rotate,
    // and a diagonal (up + L/R) thrusts and rotates at once. It always fed the
    // same moveU/moveL/moveR as the pad (see 080), so flight feel is unchanged.
    if (isInDpadZone(x, y)) {
      // v26.20 — if this press also lands on the shop building, remember it as a
      // tap candidate. We still claim it as a d-pad touch below (so a HOLD drives
      // immediately and feels identical), but processPointerUp will re-interpret
      // a quick, low-movement release as "enter the shop" instead. This is the
      // only shop-entry path on a short landscape phone, where the building sits
      // entirely under the d-pad and the press-down path (above) is suppressed.
      if (UI_NEW && shopState === 'closed' && !gameOver && !gameWon) {
        var swx = x / worldScale + cam.x, swy = y / worldScale + cam.y;
        if (isPointOnShop(swx, swy)) {
          shopTapCandidate = { id: id, x: x, y: y, t: performance.now() };
        }
      }
      dpadTouchId = id;
      updateDpad(x, y);
    }
  }

  // Bounding box of the station building in world coords (matches drawStation).
  function isPointOnShop(wx, wy) {
    // Earth station: 96 wide × 86 tall (false-front arch + body + foundation).
    // Generous left/right margin (~6 px) so it's easy to tap on mobile.
    var cx = nearestTownStationCol() * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;
    var bx = cx - 48;
    var by = groundY - 86;
    if (wx >= bx - 6 && wx <= bx + 102 && wy >= by - 4 && wy <= groundY) return true;
    return false;
  }

  function isInDpadZone(x, y) {
    // Single dpad anchored to the bottom-right corner (see resize() for the
    // DPAD_CX/DPAD_CY definitions). Returning true here suppresses the
    // shop-tap-DOWN fallback so players can HOLD the d-pad while parked next to
    // the building without the shop opening underneath. (A quick TAP on the
    // building is still honored on release via shopTapCandidate, so this only
    // gates the press-down path.)
    //
    // The d-pad is drawn (140) and driven (updateDpad) ONLY on mobile, so on
    // desktop there is nothing to hold: suppressing a real mouse click there
    // just ate legitimate shop clicks. v26.20 — bail on desktop.
    if (!isMobile) return false;
    // Match the ACTUAL d-pad footprint: updateDpad's touch radius and the drawn
    // disc are both DPAD_SIZE * 0.85. The old full-DPAD_SIZE circle reached ~18%
    // past the visible ring, and on a short landscape viewport that oversized
    // ring swallowed the whole station building, killing tap-to-enter.
    var lDx = x - DPAD_CX, lDy = y - DPAD_CY;
    var r = DPAD_SIZE * 0.85;
    return (lDx * lDx + lDy * lDy) < r * r;
  }

  function processPointerMove(x, y, id) {
    touch.x = x;
    touch.y = y;
    // v26.20 — a drag past a small threshold means this press became a
    // drive/aim gesture, not a tap-to-enter; drop the shop-tap candidate.
    if (shopTapCandidate && id === shopTapCandidate.id) {
      var tdx = x - shopTapCandidate.x, tdy = y - shopTapCandidate.y;
      if (tdx * tdx + tdy * tdy > 14 * 14) shopTapCandidate = null;
    }
    if (itemWheel.open && id === itemWheel.pointerId) {
      updateItemWheelHover(x, y);
      return;
    }
    if (UI_NEW && USE_NEW_SHOP_UI && shopState !== 'closed') {
      newShopPointerMove(x, y);
      newShopPointerDrag(x, y, id);
      return;
    }
    if (shopOpen) {
      handleShopPointerMove(x, y, id);
      return;
    }
    // Only the d-pad's "owning" touch can drive the d-pad. Other fingers
    // moving around (e.g. while a HUD chip is being held) won't disturb it.
    // For mouse, dpadTouchId === 'mouse' once a mouse-drag began inside
    // the d-pad; that's still the owning pointer.
    if (id !== undefined && id === dpadTouchId) {
      updateDpad(x, y);
    }
  }
  function processPointerUp(id) {
    // The item wheel is fully click-driven (handled on pointer-down), so
    // pointer-up no longer commits or closes it.
    if (UI_NEW && USE_NEW_SHOP_UI && shopState !== 'closed') {
      newShopPointerUp(id);
      return;
    }
    if (shopOpen) {
      handleShopPointerUp(id);
      return;
    }
    // Only releasing the d-pad's owning touch clears the d-pad. Other
    // fingers lifting (button taps, etc.) leave movement intact.
    if (id === undefined || id === dpadTouchId) {
      dpadTouchId = null;
      dpad.left = dpad.right = dpad.up = dpad.down = false;
    }
    // v26.20 — resolve a shop-tap candidate: a quick, low-movement release still
    // on the building enters the shop even though the press began inside the
    // d-pad zone. A sustained HOLD blows the time budget (or a drag blows the
    // move budget, see processPointerMove) and never reaches here, so the d-pad
    // hold-to-drive gesture stays suppressed exactly as before. Runs AFTER the
    // d-pad clear above so driving stops before the shop opens.
    if (shopTapCandidate && shopTapCandidate.id === id) {
      var held = performance.now() - shopTapCandidate.t;
      if (held <= 350 && UI_NEW && shopState === 'closed' && !gameOver && !gameWon) {
        var cwx = shopTapCandidate.x / worldScale + cam.x;
        var cwy = shopTapCandidate.y / worldScale + cam.y;
        if (isPointOnShop(cwx, cwy)) enterShopFloor();
      }
      shopTapCandidate = null;
    }
    // touch.active mirrors "is the mouse currently held" semantics on
    // desktop. Always clear on mouse-up; on touch, only clear when no
    // touches remain (we can't know that here, but it's set true on
    // every down anyway so this is a soft truth).
    if (id === 'mouse' || id === undefined) touch.active = false;
  }

  function updateDpad(x, y) {
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    if (!isMobile) return;
    // Single dpad anchored to the bottom-right corner. Detection is
    // ANGLE-based: each cardinal owns a wide 70°-wide arc, and only a
    // narrow band straddling each 45° corner lights BOTH adjacent
    // cardinals. This keeps deliberate diagonals (jetpack up+strafe)
    // available while making a normal cardinal press very hard to
    // contaminate with its neighbour. The old axis-deadzone scheme left
    // the pure-cardinal zone only ~25° wide near the ring's outer edge,
    // so a slightly-off press flipped on an adjacent arrow constantly.
    var dx = x - DPAD_CX;
    var dy = y - DPAD_CY;
    var R = DPAD_SIZE * 0.85;        // outer touch radius (matches the visual ring)
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= R) return;           // touch isn't in the d-pad zone

    // Centre-hub deadzone — stops "phantom" inputs when the finger hovers
    // over the hub. Scales with the d-pad.
    if (dist < R * 0.22) return;

    // A cardinal is active when the touch angle is within (45° + DIAG_HALF)
    // of that cardinal's axis. Adjacent cardinals therefore both fire only
    // inside a 2*DIAG_HALF band centred on each diagonal.
    var ang = Math.atan2(dy, dx);    // 0 = right, +PI/2 = down (screen coords)
    var DIAG_HALF = Math.PI / 18;    // 10° — half-width of each diagonal band
    var reach = Math.PI / 4 + DIAG_HALF;
    function axisGap(axis) {
      var g = Math.abs(ang - axis);
      return g > Math.PI ? Math.PI * 2 - g : g;
    }
    if (axisGap(0)            < reach) dpad.right = true;
    if (axisGap(Math.PI)      < reach) dpad.left  = true;
    if (axisGap(Math.PI / 2)  < reach) dpad.down  = true;
    if (axisGap(-Math.PI / 2) < reach) dpad.up    = true;
  }

  function playerNearSurface() {
    return player.y < SKY_ROWS * TILE + TILE * 2;
  }

  // The shop building sits on the surface foundation to the left of center.
  // Player must be standing on the foundation and roughly under/next to it.
  // Station center column is two tiles left of the foundation center.
  // Town-1 compound anchor (fireplace, pump pad, chimney cap stay at home).
  // Shop ENTRY is per-town via nearestTownStationCol() so the store opens in
  // whichever town you stand in; the Board already prices that town.
  function stationCenterCol() { return DECK_CENTER_COL - 2; }
  function playerNearShop() {
    var deckTopY = DECK_ROW * TILE;
    if (player.y + PLAYER_H >= deckTopY - 2 && player.y + PLAYER_H <= deckTopY + 4) {
      var stationCenterX = nearestTownStationCol() * TILE + TILE / 2;
      if (Math.abs((player.x + PLAYER_W / 2) - stationCenterX) < TILE * 2.2) return true;
    }
    return false;
  }

  // v11.37 — Door rect for the Earth station shop. Coords match the
  // drawDoubleDoor() call inside drawStation().
  function getShopDoorRect() {
    var cx = nearestTownStationCol() * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;
    var doorW = 18, doorH = 26;
    return { x: cx - Math.floor(doorW / 2), y: groundY - 8 - doorH, w: doorW, h: doorH };
  }
  // True if the player rig is anywhere near the door — used to animate
  // the door open/close. Generous range so the door starts opening while
  // the player is still approaching.
  function playerNearShopDoor() {
    var d = getShopDoorRect();
    var pcx = player.x + PLAYER_W / 2;
    var pcy = player.y + PLAYER_H / 2;
    var dcx = d.x + d.w / 2;
    var dcy = d.y + d.h / 2;
    return Math.abs(pcx - dcx) < TILE * 4 && Math.abs(pcy - dcy) < TILE * 4;
  }
  // v11.40 — Strict entry zone: player must be ON THE GROUND (feet at
  // deck level, not flying) AND horizontally inside the shop's building
  // footprint. Then pressing UP enters. This prevents drive-bys and
  // fly-bys from accidentally triggering the shop.
  function playerInShopEntryArea() {
    var deckTopY = DECK_ROW * TILE;
    var stationCx = nearestTownStationCol() * TILE + TILE / 2;
    var pbot = player.y + PLAYER_H;
    // Feet must be on (or within 2px of) the deck — i.e. grounded
    if (Math.abs(pbot - deckTopY) > 2) return false;
    // Belt-and-suspenders: respect onGround flag if available
    if (typeof player.onGround === 'boolean' && !player.onGround) return false;
    // Must be horizontally INSIDE the shop building footprint (~96 wide
    // centered = ±48 from station center)
    var pcx = player.x + PLAYER_W / 2;
    if (Math.abs(pcx - stationCx) > 48) return false;
    return true;
  }

  // v15.1 — Enter the shop floor. Shared by the click/tap path
  // (processPointerDown -> isPointOnShop) and the drive-up Enter/E path.
  // Freezes the rig so it does not drift on exit, and consumes the
  // trigger keys so they do not immediately re-fire.
  function enterShopFloor() {
    if (shopState !== 'closed') return;
    shopState = 'floor';
    // The low panel thunk (SFX_BIBLE §2.11: ui-open serves open AND close;
    // nsExitShop replays it pitched down). Engine-guarded shim from 080.
    sfxPlay('ui-open');
    shopEnterT = 0; shopExitT = 0;
    shopDoorT = 1;
    if (typeof player !== 'undefined' && player) {
      player.vx = 0; player.vy = 0;
      player.thrusting = false;
      if (typeof player.thrustSpool !== 'undefined') player.thrustSpool = 0;
    }
    keys['ArrowUp'] = false; keys['w'] = false; keys['W'] = false;
    keys[' '] = false; keys['Space'] = false; keys['Spacebar'] = false;
    keys['Enter'] = false; keys['e'] = false; keys['E'] = false;
    keys['p'] = false; keys['P'] = false;
  }

  // Drive-through pump pad: a strip of the foundation to the right of the shop.
  function pumpPadRect() {
    // Anchored 8 tiles right of deck center: this puts the gas-station's
    // left edge 216 px right of the station's right edge, which is the
    // minimum that seats the open-air fireplace between station and depot
    // with the full 64 px clearance on each side per BUILDING_STYLE §15.
    // (Was 7 tiles when the slot held the narrow windsock tower.)
    var startX = (DECK_CENTER_COL + 8) * TILE;
    return { x: startX, y: DECK_ROW * TILE - 6, w: TILE * 2, h: 6 };
  }
  function playerOnPumpPad() {
    var pcx = player.x + PLAYER_W / 2;
    if (!player.onGround) return false;
    var pad = pumpPadRect();
    if (pcx >= pad.x && pcx <= pad.x + pad.w &&
        player.y + PLAYER_H >= DECK_ROW * TILE - 2 &&
        player.y + PLAYER_H <= DECK_ROW * TILE + 2) {
      return true;
    }
    return false;
  }

