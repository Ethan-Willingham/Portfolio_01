  /* ---- Reproducible soft-contact playground (?softplay=1) ----
     Disposable world: each replay starts with the same resident and rig pose.
     The ordinary game keeps the restored baseline until this trial is chosen. */
  var softPlayEnabled = new URLSearchParams(location.search).get('softplay') === '1';
  var softPlayTerrainTrial = new URLSearchParams(location.search).has('softterrain');
  var softPlayHandling = new URLSearchParams(location.search).has('softhandling') || softPlayTerrainTrial;
  if (softPlayEnabled && softPlayHandling) SOFT_CONTACT = true;
  var softPlayReady = false;
  var softPlayCase = softPlayTerrainTrial ? 'ledge' : softPlayHandling ? 'free' : 'center';
  var softPlayDrive = 0;
  var softPlayTime = 0;
  var softPlayButtons = [];
  var softPlayTerrain = null;

  function softPlayRestoreTerrain() {
    var row, col;
    if (!softPlayTerrain) {
      softPlayTerrain = [];
      for (row = Math.max(0, SKY_ROWS - 6); row <= SKY_ROWS + 3; row++) {
        for (col = DECK_CENTER_COL - (softPlayHandling ? 24 : 14); col <= DECK_CENTER_COL + 6; col++) {
          softPlayTerrain.push({ row: row, col: col, tile: JSON.stringify(world[row][col] || null) });
        }
      }
    }
    for (var i = 0; i < softPlayTerrain.length; i++) {
      var entry = softPlayTerrain[i];
      world[entry.row][entry.col] = JSON.parse(entry.tile);
      invalidateTerrainAround(entry.row, entry.col);
    }
  }

  function softPlayReset() {
    if (!softPlayEnabled || introPhase !== 'done') return;
    surfaceSlimeGrabEnd(undefined, true);
    resetJello(); skySlimeReset(); skySlimeNext = 1e9;
    softPlayRestoreTerrain();
    var origin = DECK_CENTER_COL - (softPlayHandling ? 16 : 4);
    if (softPlayHandling) {
      // A level test apron west of town keeps the obstacles clear of buildings.
      // Foundation tiles use the existing solid face renderer above ground too.
      for (var col = origin - 7; col <= origin + 8; col++) {
        world[SKY_ROWS][col] = { type: 'foundation', hp: ORES.foundation.hp };
        invalidateTerrainAround(SKY_ROWS, col);
      }
    }
    if (softPlayHandling && softPlayCase === 'ledge') {
      for (var row = SKY_ROWS - 3; row < SKY_ROWS; row++) {
        world[row][origin + 6] = { type: 'foundation', hp: ORES.foundation.hp };
        invalidateTerrainAround(row, origin + 6);
      }
      world[SKY_ROWS - 1][origin + 3] = { type: 'foundation', hp: ORES.foundation.hp };
      invalidateTerrainAround(SKY_ROWS - 1, origin + 3);
    }
    surfaceSlimesSeeded = true;
    softContactClear();
    Object.keys(keys).forEach(function (key) { keys[key] = false; });
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    softPlayDrive = 0; softPlayTime = 0;
    var x = origin * TILE, floor = SKY_ROWS * TILE;
    player.x = x - 220; player.y = floor - PLAYER_H;
    player.vx = player.vy = 0; player.onJello = false;
    player.onGround = true; player.thrusting = false; player.thrustSpool = 0;
    player.jelloImpactVy = player.jelloGroundT = player.jelloCarryVx = 0;
    player._jDeepLast = player._jStuckT = 0;
    player.fuel = maxFuel; player.hull = getMaxHull();
    gameOver = false; gameWon = false; drilling = null; hitPauseT = 0;
    player.drillGlideT = 0; player.slideTargetX = null; player.slideAssistT = 0;
    resetFlightBank();
    var b = surfaceSlimeBuild(x, floor - 35, { id: 9001, seed: 0.42, hue: 133 });
    if (softPlayHandling && softPlayCase === 'pair') {
      surfaceSlimeBuild(x + 64, floor - 35, { id: 9002, seed: 0.61, hue: 284 });
    }
    cam.x = x - screenW * 0.5; cam.y = floor - screenH * 0.62;
    // Settle only the material before releasing the normal resident brain.
    for (var i = 0; i < 240; i++) updateJello(1 / 120);
    if (softPlayHandling) {
      player.x = x - 110; player.y = floor - PLAYER_H;
    } else if (softPlayCase === 'push-left' || softPlayCase === 'push-right') {
      softPlayDrive = softPlayCase === 'push-left' ? 1 : -1;
      player.x = b.cx - PLAYER_W / 2 - softPlayDrive * 90;
      player.y = floor - PLAYER_H;
      player.vx = softPlayDrive * 160;
      softPlayTime = 0.8;
    } else {
      var offset = softPlayCase === 'left' ? -14 : softPlayCase === 'right' ? 14 : 0;
      player.x = b.cx - PLAYER_W / 2 + offset;
      player.y = b.bboxT - PLAYER_H - 65;
      player.vx = 0; player.vy = 220; player.onGround = false;
    }
    player.renderX = player.x; player.renderY = player.y;
    cam.snap = true;
    for (i = 0; i < softPlayButtons.length; i++) {
      var entry = softPlayButtons[i];
      var on = entry.mode === (softPlayTerrainTrial ? SOFT_TERRAIN : softPlayHandling ? SOFT_HANDLING : SOFT_CONTACT);
      entry.button.setAttribute('aria-pressed', on ? 'true' : 'false');
      entry.button.style.background = on ? 'var(--accent)' : 'var(--bg-raised)';
      entry.button.style.color = on ? 'var(--bg-raised)' : 'var(--text)';
    }
    canvas.focus({ preventScroll: true });
  }

  function softPlayTick(dt) {
    if (!softPlayEnabled || introPhase !== 'done') return;
    if (!softPlayReady) {
      softPlayReady = true;
      var panel = document.createElement('div');
      panel.id = 'soft-contact-playtest';
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', softPlayTerrainTrial ? 'Soft slime terrain comparison' : softPlayHandling ? 'Soft slime handling comparison' : 'Soft slime contact comparison');
      panel.style.cssText = 'position:absolute;top:10px;left:62px;right:52px;z-index:6;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;background:var(--bg-raised);border:1px solid var(--rule-strong);font:12px var(--font-mono);color:var(--text);';
      var title = document.createElement('span'); title.textContent = softPlayTerrainTrial ? 'SLIME TERRAIN' : softPlayHandling ? 'SLIME HANDLING' : 'SLIME PLAYTEST';
      title.style.marginRight = '6px'; panel.appendChild(title);
      function button(label, action) {
        var el = document.createElement('button'); el.type = 'button'; el.textContent = label;
        el.style.cssText = 'min-height:44px;padding:6px 10px;border:1px solid var(--rule-strong);background:var(--bg-raised);color:var(--text);font:inherit;cursor:pointer;';
        el.addEventListener('click', action); panel.appendChild(el); return el;
      }
      function choose(mode) {
        if (softPlayTerrainTrial) SOFT_TERRAIN = mode;
        else if (softPlayHandling) SOFT_HANDLING = mode;
        else SOFT_CONTACT = mode;
        softPlayReset();
      }
      softPlayButtons.push({ mode: true, button: button(softPlayTerrainTrial ? 'New terrain' : softPlayHandling ? 'New handling' : 'New contacts', function () { choose(true); }) });
      softPlayButtons.push({ mode: false, button: button(softPlayTerrainTrial ? 'Prior terrain' : softPlayHandling ? 'Original handling' : 'Original', function () { choose(false); }) });
      var select = document.createElement('select'); select.setAttribute('aria-label', 'Interaction');
      select.style.cssText = 'min-height:44px;max-width:100%;padding:6px;background:var(--bg-raised);color:var(--text);border:1px solid var(--rule-strong);font:inherit;';
      var cases = softPlayHandling ? [['free','Lift and throw'],['ledge','Ledge and wall'],['pair','Two slimes']] :
        [['center','Centered drop'],['left','Left edge drop'],['right','Right edge drop'],['push-left','Push from left'],['push-right','Push from right']];
      for (var i = 0; i < cases.length; i++) {
        var option = document.createElement('option'); option.value = cases[i][0]; option.textContent = cases[i][1]; select.appendChild(option);
      }
      select.value = softPlayCase;
      select.addEventListener('change', function () { softPlayCase = select.value; softPlayReset(); });
      panel.appendChild(select); button('Repeat', softPlayReset);
      var help = document.createElement('span');
      help.textContent = softPlayTerrainTrial ? 'Pull across the ledge or slide against the wall, then let go. Saves are off.' :
        softPlayHandling ? 'Grab different spots, pull, swing, and let go. Saves are off.' :
        'Drive, fly, or drag the slime. Saves are off.';
      help.style.cssText = 'color:var(--text-dim);flex-basis:100%;line-height:1.5;'; panel.appendChild(help);
      canvas.parentElement.appendChild(panel);
      softPlayReset();
    }
    if (softPlayTime > 0 && !gamePaused && !gameOver && !gameWon && !bathMode &&
        shopState === 'closed' && !ledgerOpen && !cargoManifestOpen) {
      softPlayTime -= dt;
      keys.ArrowLeft = softPlayTime > 0 && softPlayDrive < 0;
      keys.ArrowRight = softPlayTime > 0 && softPlayDrive > 0;
    }
  }
