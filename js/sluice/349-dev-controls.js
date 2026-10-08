  /* ---- Developer scene controls, created only after dev mode is enabled ---- */
  var gmDevControlsEl = null, gmDevButtons = {};
  var devWaterHeld = false, devWaterPointer = null, devWaterKey = null;
  var devWaterCredit = 0, devControlsUIClock = 0;
  var devSmokeEnabled = true;

  function devControlsAvailable() {
    return !!devMode && introPhase === 'done' && !gamePaused && !mobileLandscapeBlocked &&
      !gmPanelVisible && !bathMode && !gameOver && !gameWon && !shopOpen &&
      shopState === 'closed' && !ledgerOpen && !cargoManifestOpen && !itemWheel.open;
  }
  function gmDevButton(id, label, onPress) {
    var el = document.createElement('button');
    el.id = id; el.type = 'button'; el.textContent = label;
    el.style.cssText = 'min-width:44px;min-height:44px;padding:6px;cursor:pointer;' +
      'background:var(--d-bg-raised);color:var(--d-text);border:1px solid var(--d-rule-strong);' +
      'font:11px/1.3 var(--d-mono);letter-spacing:0.3px;user-select:none;touch-action:manipulation;';
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    ['keydown', 'keyup'].forEach(function (type) {
      el.addEventListener(type, function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.stopPropagation();
          // A miner key held before focus moved here still needs its release.
          if (type === 'keyup') keys[e.key] = false;
        }
      });
    });
    el.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (devControlsAvailable() && onPress) onPress();
    });
    gmDevControlsEl.appendChild(el); gmDevButtons[id] = el;
    return el;
  }
  function devWaterStop() {
    var el = gmDevButtons && gmDevButtons.gmWaterBtn, pointer = devWaterPointer;
    devWaterHeld = false; devWaterPointer = devWaterKey = null; devWaterCredit = 0;
    if (el) {
      el.setAttribute('aria-pressed', 'false');
      el.style.borderColor = 'var(--d-rule-strong)';
      if (pointer !== null && el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
    }
  }
  function devWaterStart() {
    if (!devControlsAvailable() || PERF_DISABLE_WATER || PERF_SNOW_ONLY) return false;
    devWaterHeld = true;
    gmDevButtons.gmWaterBtn.setAttribute('aria-pressed', 'true');
    gmDevButtons.gmWaterBtn.style.borderColor = 'var(--d-accent)';
    return true;
  }
  function gmDevControlsBuild() {
    gmDevControlsEl = document.createElement('div');
    gmDevControlsEl.id = 'gmDevControls';
    gmDevControlsEl.setAttribute('role', 'group');
    gmDevControlsEl.setAttribute('aria-label', 'Developer scene controls');
    gmDevControlsEl.style.cssText = 'position:fixed;left:8px;top:max(76px,calc(42% - 120px));' +
      'width:min(232px,calc(100vw - 16px));max-height:calc(100dvh - 156px);overflow:auto;' +
      'display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;box-sizing:border-box;' +
      'z-index:100000;background:var(--d-bg);border:1px solid var(--d-rule);pointer-events:auto;';
    gmDevButton('gmTuneBtn', 'TUNE', gmTuningPanelToggle);
    gmDevButton('gmSlimeBtn', '+ SLIME', devDropSlimeOverhead);
    gmDevButton('gmClearSlimesBtn', 'CLEAR SLIMES', devClearSlimes);
    gmDevButton('gmSlimeGroupBtn', '6 SQUISHY + 2 SOFT', devSpawnSlimeGroup);
    gmDevButton('gmClearFluidsBtn', 'CLEAR SNOW / LIQUID', devClearFluids);
    gmDevButton('gmSnowBtn', 'SNOW OFF', devToggleSnow);
    var water = gmDevButton('gmWaterBtn', 'HOLD WATER');
    water.title = 'Hold to spray water from the miner. Release to stop.';
    water.setAttribute('aria-pressed', 'false'); water.style.touchAction = 'none';
    water.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (e.button !== 0 || devWaterHeld || !devWaterStart()) return;
      devWaterPointer = e.pointerId;
      water.setPointerCapture(e.pointerId);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      water.addEventListener(type, function (e) {
        e.preventDefault(); e.stopPropagation();
        if (e.pointerId === devWaterPointer) devWaterStop();
      });
    });
    water.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat && !devWaterHeld && devWaterStart()) devWaterKey = e.key;
    });
    water.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.key === devWaterKey) devWaterStop();
    });
    water.addEventListener('blur', devWaterStop);
    gmDevButton('gmDayNightBtn', 'SET NIGHT', devToggleDayNight);
    gmDevButton('gmSmokeBtn', 'SMOKE ON', devToggleSmoke);
    document.body.appendChild(gmDevControlsEl);
    window.addEventListener('blur', devWaterStop);
    document.addEventListener('visibilitychange', function () { if (document.hidden) devWaterStop(); });
  }
  function gmDevStateButton(id, label, pressed) {
    var el = gmDevButtons[id];
    if (el.textContent !== label) el.textContent = label;
    var value = pressed ? 'true' : 'false';
    if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
  }
  function devSnowIsOn() {
    return worldRainEnabled && worldSnowEnabled && weatherPrecipType() === 'snow' && weather.tpcp > 0.015;
  }
  function gmTuningButtonSync() {
    if (typeof document === 'undefined' || !document.body) return;
    var visible = devControlsAvailable();
    if (!visible) devWaterStop();
    if (!gmDevControlsEl) {
      if (!visible) return;
      gmDevControlsBuild();
    }
    var display = visible ? 'grid' : 'none';
    if (gmDevControlsEl.style.display !== display) gmDevControlsEl.style.display = display;
    gmDevStateButton('gmSnowBtn', devSnowIsOn() ? 'SNOW ON' : 'SNOW OFF', devSnowIsOn());
    gmDevStateButton('gmSmokeBtn', devSmokeEnabled ? 'SMOKE ON' : 'SMOKE OFF', devSmokeEnabled);
    var day = computeSunY(timeOfDay) > 0;
    gmDevStateButton('gmDayNightBtn', day ? 'SET NIGHT' : 'SET DAY', !day);
  }
  window.gmTuningButtonSync = gmTuningButtonSync;

  // Search enough empty space for the entire skin, including the larger soft
  // residents. Reserve all eight positions before a batch changes the world.
  function devSlimeDropSpot(radius, reserved) {
    var headC = Math.floor((player.x + PLAYER_W * 0.5) / TILE), headR = Math.floor(player.y / TILE);
    var offsets = [0, 2, -2, 4, -4, 6, -6, 8, -8];
    for (var up = 3; up <= 40; up++) {
      for (var oi = 0; oi < offsets.length; oi++) {
        var c = headC + offsets[oi], r = headR - up;
        var x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
        var l = x - radius - 3, right = x + radius + 3, t = y - radius - 3, bottom = y + radius + 3;
        if (l < TILE || right > (COLS - 1) * TILE) continue;
        var blocked = false;
        for (var rr = Math.floor(t / TILE); rr <= Math.floor(bottom / TILE) && !blocked; rr++) {
          for (var cc = Math.floor(l / TILE); cc <= Math.floor(right / TILE); cc++) {
            if (tileAt(rr, cc) !== null) { blocked = true; break; }
          }
        }
        for (var bi = 0; bi < jelloBodies.length && !blocked; bi++) {
          var b = jelloBodies[bi];
          if (b.bboxR > l && b.bboxL < right && b.bboxB > t && b.bboxT < bottom) blocked = true;
        }
        for (var si = 0; si < reserved.length && !blocked; si++) {
          var s = reserved[si];
          if (s.right > l && s.l < right && s.bottom > t && s.t < bottom) blocked = true;
        }
        if (!blocked) return { r: r, c: c, x: x, y: y, l: l, right: right, t: t, bottom: bottom };
      }
    }
    return null;
  }
  function devBuildSquishy(spot) {
    var b = jelloBuildBody([{ r: spot.r, c: spot.c }], 'slime');
    if (b) { b.hue = Math.floor(Math.random() * 360); spawnJelloSplat(spot.x, spot.y, 5, 60, 0.8, null); }
    return b;
  }
  function devDropSlimeOverhead() {
    if (!devControlsAvailable() || !player || !ENABLE_JELLO) return;
    if (jelloCount + (JELLO_NPT + 1) * (JELLO_NPT + 1) > JELLO_MAX_POINTS) { showMsg('Slime limit reached'); return; }
    var spot = devSlimeDropSpot(TILE * 0.5, []);
    if (!spot) { showMsg('No room for a slime here'); return; }
    JELLO_MAX_BODIES = Math.max(JELLO_MAX_BODIES, jelloBodies.length + 1);
    var b = devBuildSquishy(spot);
    showMsg(b ? 'Slime dropped (' + jelloBodies.length + ' live)' : 'Slime limit reached');
  }
  function devSpawnSlimeGroup() {
    if (!devControlsAvailable() || !player || !ENABLE_JELLO) return;
    var need = 6 * (JELLO_NPT + 1) * (JELLO_NPT + 1) + 2 * 61;
    if (jelloCount + need > JELLO_MAX_POINTS) { showMsg('No room in the slime budget for the group'); return; }
    var spots = [];
    for (var i = 0; i < 8; i++) {
      var spot = devSlimeDropSpot(i < 6 ? TILE * 0.5 : 27, spots);
      if (!spot) { showMsg('Need more open space for all eight slimes'); return; }
      spots.push(spot);
    }
    JELLO_MAX_BODIES = Math.max(JELLO_MAX_BODIES, jelloBodies.length + 8);
    for (var n = 0; n < 8; n++) {
      if (n < 6) devBuildSquishy(spots[n]);
      else surfaceSlimeBuild(spots[n].x, spots[n].y);
    }
    // Explicit spawning replaces the automatic dev starter seed.
    surfaceSlimesSeeded = surfaceSlimeDevSeeded = true;
    showMsg('Spawned 6 squishies and 2 soft slimes');
  }
  function devClearSlimes() {
    if (!devControlsAvailable()) return;
    resetJello();
    surfaceSlimesSeeded = surfaceSlimeDevSeeded = true;
    surfaceSlimeGuests.length = 0;
    skySlimes.length = skySlimeDust.length = 0;
    skySlimeNext = SKY_SLIME_FIRST_DELAY;
    bathGuests.length = bathGuestColliders.length = bathFloats.length = bathSkinFlakes.length = 0;
    siphon.passenger = null;
    // Include unopened buried slime tiles, while retaining the terrain cache's
    // ordinary invalidation path. No terrain scan runs during normal play.
    for (var r = 0; r < world.length; r++) {
      var row = world[r];
      if (!row) continue;
      for (var c = 0; c < row.length; c++) if (row[c] && row[c].type === 'jello') jelloDevClearTile(r, c);
    }
    showMsg('All slimes removed');
  }
  function devClearFluids() {
    if (!devControlsAvailable()) return;
    devWaterStop(); liquidToolSync();
    // Use the same mutation journal as scooping. Pending GPU readbacks must
    // replay these removals rather than bringing cleared particles back.
    while (liquidCount) removeLiquidParticle(liquidCount - 1);
    liquidClearGrid();
    mineralLiquidParked = {};
    for (var d = 0; d < mineralDeposits.length; d++) mineralDeposits[d].seeded = true;
    for (var p = 0; p < surfacePonds.length; p++) surfacePonds[p].devEmpty = true;
    rainReset(false, false); rain.primed = true; snow.primed = true;
    weatherForce = 0; weatherSetMood(0, true);
    siphon.tank.fill(0); siphon.dump = null; siphonStop();
    bathSupplies.fill(0); bathSilos.pending.fill(0); bathSilos.pendingHeat.fill(0);
    for (var i = 0; i < bathSilos.tanks.length; i++) bathSilos.tanks[i].count = 0;
    bathWater = bathPour = 0; bathWaterlineCache = null;
    bathWetFloor.length = 0; bathLostWater = bathDrainT = 0;
    bathThermal.pendingInlets.length = 0; bathThermal.pendingKJ = 0;
    bathThermal.sampleT = 0; bathThermal.sampleWater = -1;
    bathArrivalReset(); bathVaporClear();
    gmTuningButtonSync(); showMsg('All snow and liquid removed');
  }
  function devToggleSnow() {
    if (!devControlsAvailable()) return;
    if (devSnowIsOn()) { weatherForce = 0; weatherSetMood(0, true); }
    else {
      worldRainEnabled = worldSnowEnabled = true;
      rain.primed = snow.primed = true;
      rain.climate.kind = 'snow'; rain.climate.phase = 2;
      weatherTune.enabled = true; weatherTune.precipMode = 2;
      weatherForce = 4; weatherSetMood(4, true);
    }
    gmTuningButtonSync();
  }
  function devToggleDayNight() {
    if (!devControlsAvailable()) return;
    timeOfDay = computeSunY(timeOfDay) > 0 ? 0 : 0.5;
    gmTuningButtonSync();
  }
  function devToggleSmoke() {
    if (!devControlsAvailable()) return;
    devSmokeEnabled = !devSmokeEnabled;
    if (!devSmokeEnabled) clearAllSmokeVisuals();
    syncDomEffectLayerVisibility(); gmTuningButtonSync();
  }
  function devControlsTick(dt) {
    if (!devMode && !gmDevControlsEl) return;
    devControlsUIClock += dt;
    if (devControlsUIClock >= 0.25) { devControlsUIClock = 0; gmTuningButtonSync(); }
    if (!devWaterHeld) return;
    if (!devControlsAvailable() || PERF_DISABLE_WATER || PERF_SNOW_ONLY) { devWaterStop(); return; }
    // Twelve lanes at rest spacing form a wide, fast jet. The existing shared
    // storage cap bounds residency; holding has no duration or tank limit.
    devWaterCredit += Math.min(0.05, Math.max(0, dt)) * 7200;
    var due = Math.floor(devWaterCredit); devWaterCredit -= due;
    var count = Math.min(due, LIQUID_MAX_PARTICLES - liquidCount);
    var dir = player.dir < 0 ? -1 : 1, step = LIQUID_CELL * LIQUID_PDELTA;
    var x0 = player.x + PLAYER_W * 0.5 + dir * (PLAYER_W * 0.5 + 8);
    var y0 = player.y + PLAYER_H * 0.42;
    for (var i = 0; i < count; i++) {
      var x = x0 + dir * Math.floor(i / 12) * step, y = y0 + (i % 12 - 5.5) * step;
      if (x < 2 || x > COLS * TILE - 2 || liquidWorldSolidAt(x, y)) break;
      addLiquidParticle(0, x, y, dir * 620 + player.vx, -140 + player.vy, 0);
    }
  }
