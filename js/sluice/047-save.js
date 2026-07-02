  // ====== SAVE / PERSISTENCE (v1, persistent-profile model) ======
  // The game persists across sessions: money, upgrades, consumables, cargo,
  // the mutated world grid, economy state (player.market), trade goods, and
  // the day/night clock. Death is no longer a wipe: the rig is recovered at
  // the last docked town, carried cargo is lost, and a salvage fee (10% of
  // cash) is charged; world and upgrades survive. "New Game" (pause-screen
  // restart button) is the only full wipe.
  //
  // STORAGE: localStorage, two rotating slots (sluice.save.a / sluice.save.b)
  // with a monotonic counter; load picks the newest slot that parses. A save
  // is one JSON envelope; the world grid rides inside it as run-length-encoded
  // bytes in base64 (palette of tile types + 'air:<clearedKind>' entries for
  // dug-out cells, with side lists for damaged-hp and shiny exceptions).
  // Worldgen is NOT seeded (Math.random throughout), so the grid itself is
  // the source of truth; nothing is re-derived from generation on load.
  //
  // WHAT IS NOT SAVED (v1, by design):
  //   - Live sims: liquid particles (ponds re-stream from surfacePonds),
  //     smoke, explosions, combat entities (zones respawn fresh each boot).
  //     (Activated jello blobs used to be on this list — their origin cells
  //     are nulled at activation, so they just vanished on reload. They now
  //     persist via the additive `jello` envelope field: original cluster
  //     cells + type + centroid, rebuilt at rest pose by jelloRestoreBodies.
  //     Pose/velocity are not saved; a restored body settles and sleeps.)
  //   - Fog-of-war: lightingInit() re-floods from the sky through the saved
  //     tunnels, so connectivity reveal reconstructs itself exactly.
  //
  // SAVE TRIGGERS: docked-and-dirty poll (saveTick, called from the update
  // loop), a 5-minute background safety save, tab close / hide, and the
  // death-respawn flow. All writes are synchronous and ~tens of ms; they
  // only fire at docks, on a long timer, or at exit.

  var SAVE_KEY_A = 'sluice.save.a';
  var SAVE_KEY_B = 'sluice.save.b';
  // Bumped 1 -> 2 on the SINGLE_TOWN relaunch (2026-06-19). The world grid is
  // serialized at WORLD_COLS width and is the source of truth on load (worldgen
  // is not re-run), so a multi-town save (3188 wide) loaded into a single-town
  // world (320 wide) would corrupt out of bounds. A version mismatch is skipped
  // (treated as no save -> fresh world), so this cleanly retires old saves.
  var SAVE_VERSION = 2;
  // Dev lever: ?nosave=1 boots a FRESH world with persistence fully off
  // (no load at boot, no autosaves, no unload save). For testing worldgen
  // changes without wiping or racing the real save slots.
  var SAVE_DISABLED = false;
  try { SAVE_DISABLED = /[?&]nosave=1/.test(window.location.search); } catch (e) {}
  var saveLastMoney = -1;        // dirtiness signals
  var saveLastCargoN = -1;
  var saveLastDepth = -1;
  var saveLastUpgradeSum = -1;
  var saveCooldownT = 0;         // min seconds between docked autosaves
  var savePeriodicT = 0;         // background safety-save clock
  var saveCounter = 0;           // monotonic slot counter
  var saveQuotaWarned = false;
  var lastDockTown = 0;          // town index of the most recent docked save
  // v24.126: player-facing save surfacing. The console 'sys' bay (220) draws
  // a SAVE annunciator lamp from these: a steady info-blue pulse after each
  // successful write, a hard 1 Hz caution blink while writes are failing
  // (UI_STYLE.md sections 4.3 + 6). saveLastWallMs/saveLastOk feed the
  // pause-card status line (saveStatusLine, shown by showPauseOverlay in 020).
  var saveLampT = 0;             // seconds left of the info pulse
  var saveLampFailT = 0;         // seconds left of the caution blink
  var saveLastWallMs = 0;        // Date.now() of the last successful write
  var saveLastOk = true;         // false while the most recent write attempt failed

  function saveUpgradeSum() {
    var s = 0;
    for (var k in upgrades) s += upgrades[k] || 0;
    return s;
  }

  // ---- World grid <-> RLE bytes ----
  // Palette: solid cells key by tile.type; empty cells key by
  // 'air:<clearedKind>' ('air:' = never-solid / worldgen cave).
  function saveSerializeWorld() {
    var pal = [];
    var palMap = {};
    function palIdx(key) {
      var i = palMap[key];
      if (i === undefined) { i = pal.length; pal.push(key); palMap[key] = i; }
      return i;
    }
    var bytes = [];
    var hpx = [];   // [flatIdx, hp] for tiles drilled but not broken
    var shx = [];   // flatIdx list for shiny ore tiles
    var run = -1, runLen = 0;
    function flush() {
      if (runLen <= 0) return;
      bytes.push(run);
      var n = runLen;
      while (n >= 128) { bytes.push((n & 127) | 128); n >>= 7; }
      bytes.push(n);
      runLen = 0;
    }
    var flat = 0;
    for (var r = 0; r < TOTAL_ROWS; r++) {
      var row = world[r];
      for (var c = 0; c < WORLD_COLS; c++, flat++) {
        var cell = row ? row[c] : null;
        var idx;
        if (!cell) {
          var kind = terrainClearedKinds[r + ':' + c];
          idx = palIdx(kind ? ('air:' + kind) : 'air:');
        } else {
          // Typed jello rides the palette as 'jello#<jellyType>' (v24.154) so a
          // patch's colour survives save/load; plain 'jello' = legacy slime.
          idx = palIdx(cell.type === 'jello' && cell.jellyType ? 'jello#' + cell.jellyType : cell.type);
          var def = ORES[cell.type];
          if (def && cell.hp !== def.hp) hpx.push(flat, cell.hp);
          if (cell.shiny) shx.push(flat);
        }
        if (idx === run) { runLen++; }
        else { flush(); run = idx; runLen = 1; }
      }
    }
    flush();
    // bytes -> base64 (chunked so fromCharCode doesn't blow the arg limit)
    var bin = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
    }
    return { rows: TOTAL_ROWS, cols: WORLD_COLS, pal: pal, rle: btoa(bin), hpx: hpx, shx: shx };
  }

  function saveDecodeWorld(w) {
    var bin = atob(w.rle);
    var pal = w.pal;
    var grid = new Array(w.rows);
    var clearedKinds = {};
    var r = 0, c = 0;
    var row = new Array(w.cols);
    var i = 0, len = bin.length;
    while (i < len) {
      var idx = bin.charCodeAt(i++);
      var runLen = 0, shift = 0, b;
      do { b = bin.charCodeAt(i++); runLen |= (b & 127) << shift; shift += 7; } while (b & 128);
      var key = pal[idx];
      var isAir = key.length >= 4 && key.lastIndexOf('air:', 0) === 0;
      var kind = isAir ? key.slice(4) : '';
      for (var n = 0; n < runLen; n++) {
        if (isAir) {
          row[c] = null;
          if (kind) clearedKinds[r + ':' + c] = kind;
        } else if (key.lastIndexOf('jello#', 0) === 0) {
          // Typed jello palette entry (v24.154): 'jello#<jellyType>'.
          row[c] = { type: 'jello', hp: ORES.jello.hp, jellyType: key.slice(6), shiny: false };
        } else {
          row[c] = { type: key, hp: (ORES[key] ? ORES[key].hp : 1), shiny: false };
        }
        c++;
        if (c >= w.cols) { grid[r] = row; r++; c = 0; row = new Array(w.cols); }
      }
    }
    if (c > 0) grid[r] = row;   // ragged tail guard; should not happen
    // hp + shiny exceptions
    var hpx = w.hpx || [];
    for (var h = 0; h < hpx.length; h += 2) {
      var fr = Math.floor(hpx[h] / w.cols), fc = hpx[h] % w.cols;
      if (grid[fr] && grid[fr][fc]) grid[fr][fc].hp = hpx[h + 1];
    }
    var shx = w.shx || [];
    for (var s = 0; s < shx.length; s++) {
      var sr = Math.floor(shx[s] / w.cols), sc = shx[s] % w.cols;
      if (grid[sr] && grid[sr][sc]) grid[sr][sc].shiny = true;
    }
    return { grid: grid, clearedKinds: clearedKinds };
  }

  // ---- Envelope build / write / read ----
  function saveBuild() {
    return {
      v: SAVE_VERSION,
      n: ++saveCounter,
      profile: {
        money: money,
        upgrades: upgrades,
        teleporters: teleporters,
        balloons: balloons,
        bombsSmall: bombsSmall,
        bombsLarge: bombsLarge,
        reserveFuel: reserveFuel,
        oilGallons: oilGallons,
        depthRecord: depthRecord,
        timeOfDay: timeOfDay,
        moonPhase: moonPhase,
        lastDockTown: lastDockTown,
        // Great Seam + Mineral Ledger (295): additive v1 fields; old saves
        // simply lack them and saveApply falls back to the fresh defaults.
        ledgerData: ledgerData,
        seamComplete: seamComplete,
        tutorialDone: tutorialDone,   // onboarding radio (057): additive, old saves lack it
      },
      player: {
        x: player.x, y: player.y,
        fuel: player.fuel, hull: player.hull,
        market: player.market || null,
        tradeGoods: player.tradeGoods || {},
      },
      cargo: cargo,
      ponds: surfacePonds.map(function (p) { return { cL: p.cL, cR: p.cR, d: p.d || 1, filled: false }; }),   // v24.148 — d = lake depth
      world: saveSerializeWorld(),
      // Live jello bodies (additive; old saves lack it and load as "none", exactly
      // the pre-field behaviour). ~30 bytes per body, bodies are capped at 64.
      jello: (typeof jelloSaveBodies === 'function') ? jelloSaveBodies() : [],
    };
  }

  function saveNow(reason) {
    if (SAVE_DISABLED) return false;
    if (typeof localStorage === 'undefined') return false;
    try {
      var t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
      // Quitting while dead: apply the death penalty before persisting so a
      // reload cannot dodge it.
      if (gameOver) applyDeathPenalty();
      var blob = JSON.stringify(saveBuild());
      var key = (saveCounter % 2 === 0) ? SAVE_KEY_B : SAVE_KEY_A;
      localStorage.setItem(key, blob);
      saveLastMoney = money;
      saveLastCargoN = cargo.length;
      saveLastDepth = depthRecord;
      saveLastUpgradeSum = saveUpgradeSum();
      saveCooldownT = 10;
      savePeriodicT = 0;
      saveLampT = 3.0;          // console SAVE lamp: one steady info pulse
      saveLampFailT = 0;
      saveLastOk = true;
      saveLastWallMs = Date.now();
      if (typeof console !== 'undefined' && console.log) {
        var ms = t0 ? Math.round(((performance.now() - t0)) * 10) / 10 : '?';
        console.log('save: wrote ' + key + ' (' + Math.round(blob.length / 1024) + 'KB, ' + ms + 'ms, ' + (reason || 'manual') + ')');
      }
      return true;
    } catch (e) {
      saveLampFailT = 8;        // console SAVE lamp: caution blink on every failed write
      saveLampT = 0;
      saveLastOk = false;
      if (!saveQuotaWarned) {
        saveQuotaWarned = true;
        try { console.warn('save: write failed', e); } catch (_) {}
        try { showMsg('Save failed (storage full?)', true); } catch (_) {}
      }
      return false;
    }
  }

  function saveLoadEnvelope() {
    if (SAVE_DISABLED) return null;
    if (typeof localStorage === 'undefined') return null;
    var best = null;
    var keys = [SAVE_KEY_A, SAVE_KEY_B];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var env = JSON.parse(raw);
        if (!env || env.v !== SAVE_VERSION || !env.world) continue;
        if (!best || (env.n || 0) > (best.n || 0)) best = env;
      } catch (e) { /* corrupt slot: the other one may still be fine */ }
    }
    if (best) saveCounter = best.n || 0;
    return best;
  }

  // Apply a loaded envelope ON TOP of a fresh init(). init() already rebuilt
  // every transient system against a fresh random world; this swaps in the
  // saved grid + profile and re-derives the world-dependent caches.
  function saveApply(env) {
    var dec = saveDecodeWorld(env.world);
    world = dec.grid;
    terrainClearedKinds = dec.clearedKinds;
    // Worldgen side-outputs that must match the saved grid, not the fresh one.
    surfacePonds.length = 0;
    var ponds = env.ponds || [];
    for (var i = 0; i < ponds.length; i++) surfacePonds.push({ cL: ponds[i].cL, cR: ponds[i].cR, d: ponds[i].d || 1, filled: false });   // v24.148 — pre-deep saves default d=1
    // Profile
    var p = env.profile || {};
    money = p.money || 0;
    if (p.upgrades) upgrades = p.upgrades;
    if (upgrades.boosterLevel == null) upgrades.boosterLevel = 1;  // forward-compat
    teleporters = p.teleporters || 0;
    balloons = p.balloons || 0;
    bombsSmall = p.bombsSmall || 0;
    bombsLarge = p.bombsLarge || 0;
    reserveFuel = p.reserveFuel || 0;
    oilGallons = p.oilGallons || 0;
    depthRecord = p.depthRecord || 0;
    if (typeof p.timeOfDay === 'number') timeOfDay = p.timeOfDay;
    if (typeof p.moonPhase === 'number') moonPhase = p.moonPhase;
    lastDockTown = p.lastDockTown || 0;
    // Great Seam + Mineral Ledger (295): safe defaults so pre-seam saves load.
    ledgerData = p.ledgerData || {};
    seamComplete = !!p.seamComplete;
    tutorialDone = !!p.tutorialDone;   // onboarding radio (057): defaults false on old saves
    maxCargo = getMaxCargo();
    maxFuel = getMaxFuel();
    cargo = env.cargo || [];
    // Player: position + vitals + persistent sub-objects; movement transients
    // stay at init() defaults.
    var sp = env.player || {};
    if (typeof sp.x === 'number') player.x = sp.x;
    if (typeof sp.y === 'number') player.y = sp.y;
    player.fuel = Math.min(typeof sp.fuel === 'number' ? sp.fuel : maxFuel, maxFuel);
    player.hull = Math.min(typeof sp.hull === 'number' ? sp.hull : getMaxHull(), getMaxHull());
    if (sp.market) player.market = sp.market;
    if (sp.tradeGoods) player.tradeGoods = sp.tradeGoods;
    player.renderX = player.x;
    player.renderY = player.y;
    cam.snap = true;
    // Re-derive world-dependent caches against the swapped grid.
    lightingInit();
    terrainChunkCache = {};
    terrainChunkCount = 0;
    terrainWarmupFrames = 3;
    // Live jello bodies: rebuild the wanderers the grid can't carry (their tiles were
    // nulled at activation). Absent/empty field (old saves) leaves the world body-free.
    if (typeof jelloRestoreBodies === 'function') jelloRestoreBodies(env.jello);
    // Baseline the dirtiness signals so we don't immediately re-save.
    saveLastMoney = money;
    saveLastCargoN = cargo.length;
    saveLastDepth = depthRecord;
    saveLastUpgradeSum = saveUpgradeSum();
  }

  function saveWipe() {
    try {
      localStorage.removeItem(SAVE_KEY_A);
      localStorage.removeItem(SAVE_KEY_B);
    } catch (e) {}
    saveCounter = 0;
    saveLastMoney = -1;
    // New Game also starts a fresh ledger + a fresh seam (295). Without this
    // the in-memory seamComplete from the wiped save would lock the freshly
    // generated chamber out of its one-time extraction.
    ledgerData = {};
    seamComplete = false;
    tutorialDone = false;   // onboarding radio (057): a fresh run gets the radio again
    seamExtractTiles = null;
    seamCreditsOn = false;
    ledgerOpen = false;
  }

  // ---- Death -> respawn (replaces the old init() wipe) ----
  function applyDeathPenalty() {
    if (applyDeathPenalty._done) return;   // once per death
    applyDeathPenalty._done = true;
    cargo = [];
    var fee = Math.floor(money * 0.10);
    money -= fee;
    applyDeathPenalty._fee = fee;
  }

  function respawnFromDeath() {
    applyDeathPenalty();
    var fee = applyDeathPenalty._fee || 0;
    applyDeathPenalty._done = false;
    applyDeathPenalty._fee = 0;
    respawnAtTown(lastDockTown);
    saveNow('death');
    showMsg(fee > 0 ? 'Rig recovered. Salvage fee: $' + fee : 'Rig recovered');
  }

  // In-run R-key bailout: same economics as death (cargo lost + 10% fee) so
  // it cannot be used as a free teleporter, but it un-sticks a trapped rig.
  function bailoutToTown() {
    cargo = [];
    var fee = Math.floor(money * 0.10);
    money -= fee;
    respawnAtTown(lastDockTown);
    saveNow('bailout');
    showMsg(fee > 0 ? 'Recovered at town. Salvage fee: $' + fee : 'Recovered at town');
  }

  // Shared by death respawn and the in-run R-key bailout. Moves the rig to
  // the town's station deck, refills vitals, clears combat/death transients.
  // The world is NOT touched.
  function respawnAtTown(ti) {
    if (ti == null || ti < 0) ti = 0;
    player.x = (townStationCol(ti) - 4) * TILE + TILE / 2 - PLAYER_W / 2;
    player.y = DECK_ROW * TILE - PLAYER_H;
    player.vx = 0; player.vy = 0;
    player.jelloImpactVy = 0;   // a fatal slam's banked trampoline rebound must not survive the respawn
    player.fuel = getMaxFuel();
    player.hull = getMaxHull();
    player.thrustSpool = 0;
    player.angle = -Math.PI / 2;
    player.angVel = 0;
    player.rotFlightActive = false;
    player.drillGlideT = 0;
    player.drillGlideDir = null;
    player.drillCooldownT = 0;
    player.renderX = player.x;
    player.renderY = player.y;
    drilling = null;
    gameOver = false;
    deathInfo = null;
    deathPhaseT = 0;
    deathPlateY = -10000;
    deathPlateTargetY = -10000;
    deathSparks = [];
    deathLandedAt = -1;
    restartConfirmT = 0;
    explosions = [];
    liveBombs = [];
    damageFlashT = 0;
    roverMode = null;
    teleportFx = null;
    floaters = [];
    cam.snap = true;
  }

  // ---- Autosave poll (called once per frame from the update loop) ----
  function saveTick(dt) {
    // Lamp timers decay before the gameOver early-return so the annunciator
    // still settles on the death screen.
    if (saveLampT > 0) { saveLampT -= dt; if (saveLampT < 0) saveLampT = 0; }
    if (saveLampFailT > 0) { saveLampFailT -= dt; if (saveLampFailT < 0) saveLampFailT = 0; }
    if (saveCooldownT > 0) saveCooldownT -= dt;
    savePeriodicT += dt;
    if (gameOver || gameWon) return;
    var dirty = (money !== saveLastMoney) ||
                (cargo.length !== saveLastCargoN) ||
                (depthRecord !== saveLastDepth) ||
                (saveUpgradeSum() !== saveLastUpgradeSum);
    if (!dirty) return;
    // Docked save: on solid ground inside a town, shortly after anything
    // meaningful changed (a sale, a purchase, a new record).
    if (player.onGround && saveCooldownT <= 0) {
      var ti = (typeof playerTownIndex === 'function') ? playerTownIndex() : -1;
      if (ti >= 0) {
        lastDockTown = ti;
        saveNow('dock');
        return;
      }
    }
    // Background safety save (mid-expedition quit-and-resume).
    if (savePeriodicT > 300) saveNow('periodic');
  }

  // Persist on tab close / hide. Synchronous localStorage writes are allowed
  // here, and saveNow applies the death penalty first if the rig is dead.
  try {
    window.addEventListener('beforeunload', function () {
      if (saveLastMoney !== -1 || money > 0 || cargo.length > 0) saveNow('unload');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && (saveLastMoney !== -1 || money > 0)) saveNow('hide');
    });
  } catch (e) {}

  // One-line autosave status for the pause card (lowercase, matching the
  // card's "press resume to begin" voice). Coarse age only: the pause screen
  // stops the loop, so the text is a snapshot, not a ticking clock.
  function saveStatusLine() {
    if (SAVE_DISABLED) return 'autosave off (nosave test boot)';
    if (!saveLastOk) return 'save failing, browser storage may be full';
    if (!saveLastWallMs) return 'autosave on, saves when you dock at a town';
    var s = Math.max(0, Math.round((Date.now() - saveLastWallMs) / 1000));
    var ago = s < 5 ? 'just now'
            : s < 90 ? s + 's ago'
            : s < 5400 ? Math.round(s / 60) + 'm ago'
            : Math.round(s / 3600) + 'h ago';
    return 'autosave on, last saved ' + ago;
  }

  // Dev/bench handle (same spirit as window.gm / window.__sluiceAtlas).
  try {
    window.__sluiceSave = {
      now: function () { return saveNow('manual'); },
      wipe: saveWipe,
      info: function () {
        var a = null, b = null;
        try { a = (localStorage.getItem(SAVE_KEY_A) || '').length; } catch (e) {}
        try { b = (localStorage.getItem(SAVE_KEY_B) || '').length; } catch (e) {}
        return { counter: saveCounter, slotA: a, slotB: b, lastDockTown: lastDockTown,
                 lastSaveMs: saveLastWallMs, lampT: saveLampT, status: saveStatusLine() };
      },
      _test: {
        addMoney: function (n) { money += (n || 1000); return money; },
        getMoney: function () { return money; },
        clearCell: function (r, c) { var t = world[r] && world[r][c]; if (t) { world[r][c] = null; terrainClearedKinds[r + ':' + c] = 'dirt'; } return !!t; },
        cellType: function (r, c) { var t = world[r] && world[r][c]; return t ? t.type : null; },
        playerPos: function () { return { x: player.x, y: player.y, fuel: player.fuel, hull: player.hull }; },
      },
    };
  } catch (e) {}
