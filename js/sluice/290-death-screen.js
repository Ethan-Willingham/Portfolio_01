  // Recovery screen: one summary and one native Return to town action.
  // Snapshot before a save can clear cargo or charge the existing 10% fee.
  var DEATH_INPUT_DELAY_S = 0.35;
  var deathManifest = null;
  var deathOverlay = document.getElementById('game-death');
  var deathReturnButton = document.getElementById('gm-death-return');
  var deathFocusPending = false;

  function buildDeathManifest() {
    var fee, balance;
    if (applyDeathPenalty._done) {
      fee = applyDeathPenalty._fee || 0;
      balance = (money || 0) + fee;
    } else {
      balance = money || 0;
      fee = Math.floor(balance * 0.10);
    }
    var total = 0;
    for (var i = 0; i < cargo.length; i++) total += cargoUnitValue(cargo[i]);
    return {
      cause: deathInfo && deathInfo.type || 'hull',
      depth: Math.max(0, Math.floor(player.y / TILE - SKY_ROWS + 1)),
      count: cargo.length,
      total: total,
      fee: fee,
      remitted: balance - fee
    };
  }

  function deathCauseText(cause) {
    if (cause === 'fall') return 'Hard landing';
    if (cause === 'fuel') return 'Out of fuel';
    if (cause === 'magma' || cause === 'burned') return 'Overheated';
    if (cause === 'water' || cause === 'drowned') return 'Flooded';
    if (cause === 'bomb') return 'Caught in a blast';
    return 'Hull destroyed';
  }

  function deathRecover() {
    if (!gameOver || gamePaused || mobileLandscapeBlocked ||
        deathPhaseT < DEATH_INPUT_DELAY_S ||
        (window.SluiceLoading && window.SluiceLoading.active())) return;
    if (deathOverlay) deathOverlay.hidden = true;
    for (var k in keys) keys[k] = false;
    touch.active = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    gpReleaseAll();
    respawnFromDeath();
    deathManifest = null;
    deathFocusPending = false;
    canvas.focus({ preventScroll: true });
  }

  // Own all gameplay keys while the report is up. Repeats cannot turn a
  // held thrust key into recovery. Escape still opens the normal pause menu.
  function deathKeyDown(e) {
    if (!UI_NEW || !gameOver || gamePaused || e.key === 'Escape' ||
        e.ctrlKey || e.metaKey || e.altKey) return false;
    e.preventDefault();
    if (e.key === 'Tab') {
      if (deathReturnButton) deathReturnButton.focus({ preventScroll: true });
    } else if (!e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R')) {
      deathRecover();
    }
    return true;
  }

  if (deathReturnButton) deathReturnButton.addEventListener('click', deathRecover);

  // Keep the existing screenshot lever. The summary has no reveal sequence;
  // deathskip remains accepted by old review URLs without requiring a skip.
  var DEATHSHOT = (function () {
    var match = location.search.match(/[?&]deathshot=([a-z]+)/);
    return match ? match[1] : null;
  })();
  function syncDeathScreen() {
    if (!UI_NEW) return;
    if (DEATHSHOT && !syncDeathScreen._shot && !gameOver && player) {
      syncDeathScreen._shot = true;
      if (!cargo.length) {
        var seed = [['gold', 2], ['silver', 3], ['iron', 5], ['coal', 8], ['amber', 1]];
        for (var i = 0; i < seed.length; i++) {
          for (var j = 0; j < seed[i][1]; j++) cargo.push({ type: seed[i][0], shiny: false });
        }
        cargo.push({ type: 'gold', shiny: true });
      }
      if (money <= 0) money = 8920;
      endGame({ type: DEATHSHOT, speed: 2150, heat: 2400 });
    }
    if (gameOver) return;
    if (deathOverlay) deathOverlay.hidden = true;
    deathManifest = null;
    deathFocusPending = false;
    deathPhaseT = 0;
  }

  // Desaturating veil (q) and edge vignette (v) under the death plate.
  // Shared with the shader warm-up (046).
  function drawDeathVeil(q, v) {
    if (q > 0.01) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,' + (0.62 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(30,38,48,' + (0.11 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (v > 0.01) {
      var vignette = ctx.createRadialGradient(viewW / 2, viewH * 0.5, viewW * 0.2, viewW / 2, viewH * 0.5, viewW * 0.78);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,' + v.toFixed(3) + ')');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawDeathScreen(dt) {
    if (!UI_NEW || !gameOver || !deathOverlay) return;
    if (!deathManifest) deathManifest = buildDeathManifest();
    var m = deathManifest;
    var opening = deathOverlay.hidden;
    if (opening) {
      document.getElementById('gm-death-cause').textContent = deathCauseText(m.cause) + ' at ' + m.depth + ' m.';
      document.getElementById('gm-death-cargo').textContent = m.count ? '$' + m.total.toLocaleString() : 'Empty hold';
      document.getElementById('gm-death-fee').textContent = '$' + m.fee.toLocaleString();
      document.getElementById('gm-death-balance').textContent = '$' + m.remitted.toLocaleString();
      deathOverlay.hidden = false;
      deathFocusPending = true;
    }
    deathPhaseT += dt;
    deathReturnButton.disabled = deathPhaseT < DEATH_INPUT_DELAY_S;
    document.getElementById('gm-death-shortcut').textContent = gpConnected ? 'A to return' : isMobile ? '' : 'Enter or R';
    if (deathFocusPending && !deathReturnButton.disabled && !gamePaused && !mobileLandscapeBlocked) {
      deathReturnButton.focus({ preventScroll: true });
      deathFocusPending = false;
    }
    // Focus returns to the recovery action after closing the pause menu or
    // returning to landscape, without changing a deliberate manual pause.
    if (!gamePaused && !mobileLandscapeBlocked && !deathReturnButton.disabled && document.activeElement === canvas) {
      deathReturnButton.focus({ preventScroll: true });
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDeathVeil(0.45, 0);
    ctx.restore();
  }

  function drawShopFloor() {
    if (!UI_NEW || shopState === 'closed') return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (USE_NEW_SHOP_UI) {
      // v26.18 — the UI kit paints its own fizzed-world backdrop (blur +
      // dim + vignette over the playfield only, console untouched); the
      // old flat dim would double-darken it. The board page fills opaque.
      newShopDraw();
    } else {
      // Legacy walk-up shop: camera-push dim over the playfield, NOT the
      // console (v11.26: the toolbar must stay fully lit while shopping).
      var ch = consoleHeight();
      var roomBottom = viewH - ch;
      var dim = 0.62 * (shopEnterT < 1 ? shopEnterT : 1);
      ctx.fillStyle = 'rgba(0,0,0,' + dim.toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, roomBottom);
      if (shopState === 'floor') drawShopRoom();
      else drawShopSubPage();
    }
    ctx.restore();
  }

  // Pointer dispatch for shop interior. Floor: hit-test station rects; click
  // pushes shopState. Sub-page: hit-test back-arrow only; click pops to
  // 'floor'. Returns true if the shop consumed the input.
  function handleShopInteriorPointerDown(x, y, id) {
    if (USE_NEW_SHOP_UI) return newShopPointerDown(x, y, id);
    if (shopState === 'floor') {
      // LEAVE SHOP button — places the rig down on the deck between the
      // shop and the fireplace, clears all velocity so the player can
      // start fresh. Also closes the door immediately.
      var lb = shopLeaveBtnRect();
      if (x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) {
        shopState = 'closed';
        shopDoorT = 0;
        if (typeof player !== 'undefined' && player) {
          // Spawn between shop and fireplace. Shop center = stationCenterCol
          // * TILE + TILE/2; fireplace is +150 from that. Halfway is +75.
          var stationCx = nearestTownStationCol() * TILE + TILE / 2;
          player.x = stationCx + 75 - PLAYER_W / 2;
          player.y = DECK_ROW * TILE - PLAYER_H;
          player.vx = 0; player.vy = 0;
          player.thrusting = false;
          if (typeof player.thrustSpool !== 'undefined') player.thrustSpool = 0;
          if (typeof player.dir !== 'undefined') player.dir = 1;
          if (typeof player.renderX !== 'undefined') { player.renderX = player.x; player.renderY = player.y; }
        }
        return true;
      }
      var rects = shopStationRects();
      var ids = ['workshop', 'shelf', 'board'];
      for (var i = 0; i < ids.length; i++) {
        var st = rects[ids[i]];
        if (x >= st.x && x <= st.x + st.w && y >= st.y && y <= st.y + st.h) {
          shopState = st.id;
          // Reset entrance animations so each push plays the intro
          if (st.id === 'shelf') shopShelfModalEnterT = 0;
          if (st.id === 'workshop') shopWorkshopModalEnterT = 0;
          return true;
        }
      }
      return true;   // click on shop floor, not on a station — eat it
    } else {
      var b = shopBackArrowRect();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        shopState = 'floor';
        return true;
      }
      // SHELF sub-page BUY levers
      if (shopState === 'shelf' && SHELF_BUY_RECTS && SHELF_BUY_RECTS.length) {
        for (var bi = 0; bi < SHELF_BUY_RECTS.length; bi++) {
          var br = SHELF_BUY_RECTS[bi];
          if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
            var moneyBefore = money;
            buildShopItems();
            var item = null;
            for (var si = 0; si < shopItems.length; si++) {
              if (shopItems[si].key === br.key) { item = shopItems[si]; break; }
            }
            if (item) buyUpgrade(item);
            var success = (money < moneyBefore) || (devMode && item);
            fireShelfBuyFx(br, success);
            return true;
          }
        }
      }
      // WORKSHOP sub-page BUY buttons
      if (shopState === 'workshop' && WORKSHOP_BUY_RECTS && WORKSHOP_BUY_RECTS.length) {
        for (var wbi = 0; wbi < WORKSHOP_BUY_RECTS.length; wbi++) {
          var wbr = WORKSHOP_BUY_RECTS[wbi];
          if (x >= wbr.x && x <= wbr.x + wbr.w && y >= wbr.y && y <= wbr.y + wbr.h) {
            if (!wbr.canBuy) {
              fireWorkshopBuyFx(wbr, false);
              return true;
            }
            var moneyBefore2 = money;
            buildShopItems();
            var item2 = null;
            for (var si2 = 0; si2 < shopItems.length; si2++) {
              if (shopItems[si2].key === wbr.key) { item2 = shopItems[si2]; break; }
            }
            if (item2) buyUpgrade(item2);
            var success2 = (money < moneyBefore2) || (devMode && item2);
            fireWorkshopBuyFx(wbr, success2);
            return true;
          }
        }
      }
      return true;   // sub-page eats clicks elsewhere too
    }
  }
  function updateShopHover(x, y) {
    if (USE_NEW_SHOP_UI) { newShopPointerMove(x, y); return; }
    if (shopState === 'floor') {
      shopHoverShelfItem = null;
      var ids = ['leave', 'workshop', 'shelf', 'board'];
      var newHover = null;
      for (var i = 0; i < ids.length; i++) {
        var hr = shopWorkAreaRect(ids[i]);
        if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
          newHover = ids[i]; break;
        }
      }
      shopHoverStation = newHover;
    } else if (shopState === 'shelf') {
      shopHoverStation = null;
      shopHoverWorkshopItem = null;
      var newHover2 = null;
      for (var j = 0; j < SHELF_BUY_RECTS.length; j++) {
        var br = SHELF_BUY_RECTS[j];
        if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
          newHover2 = br.key; break;
        }
      }
      shopHoverShelfItem = newHover2;
    } else if (shopState === 'workshop') {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      var newHover3 = null;
      for (var k = 0; k < WORKSHOP_BUY_RECTS.length; k++) {
        var wbr2 = WORKSHOP_BUY_RECTS[k];
        if (x >= wbr2.x && x <= wbr2.x + wbr2.w && y >= wbr2.y && y <= wbr2.y + wbr2.h) {
          newHover3 = wbr2.key; break;
        }
      }
      shopHoverWorkshopItem = newHover3;
    } else {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      shopHoverWorkshopItem = null;
    }
  }

