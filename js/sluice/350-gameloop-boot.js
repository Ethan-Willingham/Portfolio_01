  /* ---- Audio hooks ----
     Phase B wiring between the game and the standalone SluiceAudio engine
     (js/audio.js, loaded by sluice.html). audioUpdate(dt) is called once per
     frame from the game loop; it polls game state and pushes context changes
     to the engine. Wrapped in try/catch so an audio bug can never break the
     loop. NOTE: this lives in the SAME fragment as loop() on purpose, at IIFE
     top level. It used to be its own fragment (356) but that landed inside a
     boot scope that spans the 350 boundary (350 ends net +1 brace), making
     audioUpdate a nested, unreachable function -> "audioUpdate is not defined"
     -> the loop threw every frame -> black screen (v23.65/66). Keep it here.

     Current-game mapping (towns + No Man's Zone expansion not built yet):
       above ground  -> 'towns'  : the 8 town themes cycle (so all are heard)
       underground   -> 'underground' : depth picks the bed track (l1/l2/l3) + danger override
       death         -> the lament one-shot, fired once on the gameOver edge
       day/night     -> night thins/darkens the above-ground music
       fast fall     -> the filter dips for a muffled plunge */
  var _audio = { mode: null, gameOver: false, falling: false, danger: false, depthRows: -1, tod: -1,
                 alertFuel: false, alertHull: false, wet: false, liqT: 0 };

  function audioUpdate(dt) {
    if (typeof SluiceAudio === 'undefined' || !SluiceAudio) return;
    try {
      // death: fire once on the transition into game-over; while dead, leave
      // the soundscape to death() (it stopped the beds + ducked).
      if (gameOver && !_audio.gameOver) {
        // The crunch that precedes the lament (SFX_BIBLE §10: death's SFX
        // side is hull-hit + land-damage; the music side is death()).
        sfxPlay('hull-hit'); sfxPlay('land-damage');
        SluiceAudio.death(); _audio.mode = null; _audio.danger = false;
      }
      _audio.gameOver = gameOver;
      if (gameOver) return;

      // surface vs underground, with a hysteresis band so it does not flap
      // when the player hovers at the lip of a shaft.
      var down = (SKY_ROWS + 50) * TILE;                  // ~50 blocks deep: underground music takes over
      var up   = (SKY_ROWS + 48) * TILE;                  // ~48 blocks: back to surface music (hysteresis)
      var underground = (_audio.mode === 'underground') ? (player.y > up) : (player.y > down);
      var mode = underground ? 'underground' : 'towns';
      if (mode !== _audio.mode) { SluiceAudio.setMusic(mode); _audio.mode = mode; _audio.depthRows = -1; }

      // Low-fuel / low-hull stings (Affect): ONE sting per excursion below
      // the 30% warning band — the console lamp + the L4 danger music are
      // the visual / musical twins (§13: never audio-only) — re-armed only
      // after recovering past 40% so gauge jitter can't re-fire it.
      var fuelFrac = maxFuel ? (player.fuel / maxFuel) : 1;
      var maxH = (typeof getMaxHull === 'function') ? getMaxHull() : 0;
      var hullFrac = maxH ? (player.hull / maxH) : 1;
      if (fuelFrac < 0.30 && !_audio.alertFuel) { _audio.alertFuel = true; sfxPlay('alert-fuel'); }
      else if (fuelFrac > 0.40) _audio.alertFuel = false;
      if (hullFrac < 0.30 && !_audio.alertHull) { _audio.alertHull = true; sfxPlay('alert-hull'); }
      else if (hullFrac > 0.40) _audio.alertHull = false;

      if (underground) {
        var rows = Math.max(0, Math.floor(player.y / TILE) - SKY_ROWS);
        if (rows !== _audio.depthRows) { SluiceAudio.setDepth(rows); _audio.depthRows = rows; }
        var danger = (fuelFrac < 0.30) || (hullFrac < 0.30);
        if (danger !== _audio.danger) { SluiceAudio.setDanger(danger); _audio.danger = danger; }
      } else {
        if (_audio.danger) { SluiceAudio.setDanger(false); _audio.danger = false; }
        // day/night: 1 at noon (bright/full), 0 at midnight (thin/dark).
        var day = 0.5 + 0.5 * Math.sin((timeOfDay - 0.25) * 6.2831853);
        if (Math.abs(day - _audio.tod) > 0.02) { SluiceAudio.setTimeOfDay(day); _audio.tod = day; }
      }

      // fast fall: muffled rush while plunging, opens back up on landing.
      var falling = (player.vy > 320) && !player.onGround;
      if (falling !== _audio.falling) { SluiceAudio.fall(falling); _audio.falling = falling; }

      // Ambience bed (SFX engine, js/audio.js sfx.ambience): a depth-keyed
      // diegetic room tone + sparse one-shot emitter, separate from music.
      // Zones: station (shop open) > surface day/night > shallow/mid/deep/
      // magma by depth band. Cheap string compare gates the crossfade.
      if (SluiceAudio.sfx && SluiceAudio.sfx.ambience) {
        var zone;
        if (shopOpen || (typeof shopState !== 'undefined' && shopState !== 'closed')) zone = 'station';
        else if (!underground) {
          zone = (day > 0.35) ? 'surface-day' : 'surface-night';
          // Weather overlay (155 mood machine): a storm always takes the bed
          // (wind + the engine's thunder emitter carry a blizzard too); the
          // rain bed only when precip actually falls as RAIN — snowfall is
          // hush-quiet, so the current cold world keeps the day/night beds.
          if (typeof weather !== 'undefined' && weather && typeof WEATHER_MOODS !== 'undefined') {
            var wMood = WEATHER_MOODS[weather.mood] ? WEATHER_MOODS[weather.mood].name : '';
            if (wMood === 'storm') zone = 'storm';
            else if (wMood === 'precip' &&
                     typeof weatherPrecipType === 'function' && weatherPrecipType() === 'rain') zone = 'rain';
          }
        }
        else {
          var zRows = Math.max(0, Math.floor(player.y / TILE) - SKY_ROWS);
          zone = (zRows < 120) ? 'shallow' : (zRows < 400) ? 'mid' : (zRows < 900) ? 'deep' : 'magma';
        }
        if (zone !== _audio.zone) { SluiceAudio.sfx.ambience.setZone(zone); _audio.zone = zone; }
      }

      // Rig engine voice (the player is a vehicle, SFX_BIBLE §10): a deep
      // idle hum while parked, the drive loop while rolling, pitch by speed.
      // sfxLoop is a per-frame drive — the engine watchdog self-silences it
      // the moment these calls stop (pause, shop, death, rover ride).
      var inShop = shopOpen || (typeof shopState !== 'undefined' && shopState !== 'closed');
      if (!inShop && !roverMode && player.onGround) {
        var spd = Math.abs(player.vx);
        if (spd > 26) {
          sfxLoop('rig-drive', {
            gain: Math.min(1, (spd - 20) / 130),
            pitch: 0.85 + 0.45 * Math.min(1, spd / 240)
          });
        } else {
          sfxLoop('rig-hum', { gain: 1 });
        }
      }

      // Liquid enter / exit (poll ~20 Hz): playerWaterCushion() is the same
      // 0..1 coverage signal the fall-cushion uses (water-only is correct —
      // oil pockets aren't generated yet, P0.4). Wide hysteresis so surface
      // chop and the rig's own splash can't flap the splash one-shots.
      _audio.liqT -= dt;
      if (_audio.liqT <= 0) {
        _audio.liqT = 0.05;
        var cov = (typeof playerWaterCushion === 'function') ? playerWaterCushion() : 0;
        if (!_audio.wet && cov >= 0.6) {
          _audio.wet = true;
          sfxPlay('liquid-enter', { gain: 0.6 + 0.4 * Math.min(1, Math.abs(player.vy) / 360) });
        } else if (_audio.wet && cov <= 0.12) {
          _audio.wet = false;
          sfxPlay('liquid-exit');
        }
      }
    } catch (e) { /* never break the game loop over audio */ }
  }

  /* ---- Game Loop ---- */
  function loop(time) {
    // v17.82 — if a pause landed between scheduling and firing this frame,
    // bail without rescheduling so the loop dies and the chips idle. resumeGame
    // re-kicks it. (pauseGame also cancels the pending handle; this is backup.)
    if (gamePaused) { gameRafId = 0; return; }
    var dt = (time - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = time;
    lastFrameDt = dt;
    // v14.21 — fresh raw-bucket slate each frame; perfMark fills it, the
    // hitch capture below snapshots it. The EMA perfBuckets persists.
    perfBucketsRaw = {};

    // Stage 5a — advance the day/night cycle. Pure modulo wrap; pause /
    // restart logic can be layered later if we ever want it.
    if (!SUN.paused) timeOfDay += dt / DAY_CYCLE_SECONDS;
    if (timeOfDay >= 1) { timeOfDay -= 1; moonPhase = (moonPhase + 0.125) % 1; }
    if (timeOfDay < 0)  timeOfDay += 1;

    // Intro sequence: warmup → hold → fade out overlay.
    if (introPhase !== 'done') {
      if (introPhase === 'warmup') {
        terrainWarmupFrames = Math.max(0, terrainWarmupFrames - 1);
        introWarmupFramesRun++;
        // terrainChunkRebuildsThisFrame reflects the prior frame's rebuild
        // count (it's reset at the start of the next drawTerrainChunks).
        // Once we see two consecutive frames where the renderer didn't need
        // to build any new chunks, the visible world is fully populated.
        if (terrainChunkRebuildsThisFrame === 0) introSettledFrames++;
        else introSettledFrames = 0;
        var minWarmup = 4;
        var maxWarmup = 90;  // hard ceiling — never get stuck on the overlay
        var settled = (introSettledFrames >= 2 && introWarmupFramesRun >= minWarmup);
        if (terrainWarmupFrames === 0 && (settled || introWarmupFramesRun >= maxWarmup)) {
          introPhase = 'hold';
          introHoldTimer = 0.25;
        }
      } else if (introPhase === 'hold') {
        introHoldTimer -= dt;
        if (introHoldTimer <= 0) {
          introPhase = 'done';
          var ov = document.getElementById('game-intro');
          if (ov) { ov.style.transition = ''; ov.style.opacity = '0'; }
        }
      }
    }
    // v17.84 — once the intro has settled and the world has rendered, drop into
    // the pause menu so the game waits for the player. Fires once; the world
    // still renders THIS frame (we're past the loop's top guard), then the tail
    // won't reschedule because gamePaused is now true.
    if (startInPause && !PAUSE_DISABLED && !bootPauseFired && introPhase === 'done') {
      bootPauseFired = true;
      gamePaused = true;
      showPauseOverlay('press resume to begin');
    }
    if (terrainChunkRebuildBoostFrames > 0) terrainChunkRebuildBoostFrames--;
    if (dt > 1 / 45) fluidPerfStress = Math.min(2, fluidPerfStress + dt * 4);
    else if (dt < 1 / 55) fluidPerfStress = Math.max(0, fluidPerfStress - dt * 1.5);

    // Restart confirmation. R is always available, but requires a second
    // press so an accidental tap doesn't wipe the run.
    if (restartConfirmT > 0) {
      restartConfirmT -= dt;
      if (restartConfirmT < 0) restartConfirmT = 0;
    }
    if (keys['r'] || keys['R']) {
      keys['r'] = keys['R'] = false;
      if (restartConfirmT > 0) {
        // Persistent-profile model (047-save.js): R is no longer a wipe.
        // Dead -> respawn at the last docked town (death penalty applies).
        // Alive -> bailout to town with the same economics (cargo + 10% fee)
        // so a stuck rig always has an out. Dev mode keeps the old full
        // re-init (fresh world) for testing; the save survives until the
        // next autosave because dev runs don't dock-save.
        if (typeof radioMsgCut === 'function') radioMsgCut();   // prompt answered, drop the line
        if (devMode) init();
        else if (gameOver) respawnFromDeath();
        else bailoutToTown();
      } else {
        restartConfirmT = 3.0;
        // dur pins the radio line (058) to the confirm window so the
        // prompt never outlives the timer it describes.
        showMsg(gameOver ? 'Press R again to recover the rig' : 'Press R again: return to town (lose cargo, 10% fee)', true, { dur: 3.0 });
      }
    }

    // Touch keeps the old game-over/win restart affordance.
    // v11.33 — UI_NEW death screen: any tap/click after the plate has
    // fully descended (~2s after death) restarts. Pre-plate clicks are
    // ignored so the player can't skip the death animation.
    if ((gameOver || gameWon) && touch.active) {
      if (UI_NEW && gameOver) {
        if (deathPhaseT >= DEATH_PRE_PLATE_S + DEATH_PLATE_SLIDE_S * 0.85) {
          touch.active = false;
          // v24.142 — first tap completes the salvage manifest instantly
          // (290 deathManifestSkip); the next one recovers the rig.
          if (!(typeof deathManifestSkip === 'function' && deathManifestSkip())) {
            respawnFromDeath();   // persistent-profile model: recover, don't wipe
          }
        } else {
          touch.active = false;   // consume tap but don't restart yet
        }
      } else {
        touch.active = false;
        if (gameOver) respawnFromDeath();
        else init();   // gameWon path (inert flag) keeps the legacy restart
      }
    }

    // Shop toggle via keyboard. [E] is the documented key (shown in the
    // proximity prompt); [P] is kept as a hidden alias for muscle memory
    // from earlier builds. Both behave identically. Disabled while the
    // credits sequence is running so a stray E doesn't pop the shop.
    // v11.12 — In UI_NEW, the shop is always-open via proximity (§15.1).
    // E/P keys remain only as a legacy fallback when UI_NEW is off.
    if (!UI_NEW && !gameWon && (keys['p'] || keys['P'] || keys['e'] || keys['E'])) {
      keys['p'] = keys['P'] = keys['e'] = keys['E'] = false;
      if (shopOpen) shopOpen = false;
      else if (playerNearShop()) { shopOpen = true; shopScroll = 0; }
    }
    // v11.10 — Item wheel via [Q] (hold to open, release to fire). Open on
    // first detection of Q-down; cursor drives selection through mouseMove.
    if (!gameWon && UI_NEW && (keys['q'] || keys['Q']) && !itemWheel.open) {
      openItemWheel('kb');
      // Seed hover from current cursor position so the wheel isn't blank
      updateItemWheelHover(mouseCursor.x, mouseCursor.y);
    }
    // While a kb-driven wheel is open, keep hover synced to the cursor each frame
    if (itemWheel.open && itemWheel.pointerId === 'kb') {
      updateItemWheelHover(mouseCursor.x, mouseCursor.y);
    }
    // Teleporter via keyboard ('T')
    if (!gameWon && (keys['t'] || keys['T'])) {
      keys['t'] = keys['T'] = false;
      activateTeleporter();
    }
    // Rover balloons via keyboard ('B')
    if (!gameWon && (keys['b'] || keys['B'])) {
      keys['b'] = keys['B'] = false;
      activateRoverDrop();
    }
    // Bombs: [1] = small, [2] = large. Disabled while in credits.
    if (!gameWon && keys['1']) {
      keys['1'] = false;
      activateBomb('small');
    }
    if (!gameWon && keys['2']) {
      keys['2'] = false;
      activateBomb('large');
    }
    // Zoom toggle ('Z')
    if (keys['z'] || keys['Z']) {
      keys['z'] = keys['Z'] = false;
      toggleZoom();
    }
    // ESC backs out of the new shop one level (sub-page -> hub -> closed),
    // mirroring the corner button: press it twice from a sub-page to leave.
    if (keys['Escape'] && UI_NEW && shopState !== 'closed') {
      keys['Escape'] = false;
      nsBackOrExit();
    }
    // ESC closes shop (legacy modal)
    if (keys['Escape'] && shopOpen) { keys['Escape'] = false; shopOpen = false; }

    // Dev-mode toggle: backtick / tilde. Persisted via localStorage so it
    // survives reloads. While on, all shop purchases are free.
    if (keys['`'] || keys['~']) {
      keys['`'] = keys['~'] = false;
      setDevMode(!devMode);
      showMsg(devMode ? 'DEV MODE ON — purchases free' : 'Dev mode off');
    }
    // v13.13 — 'G' toggles the gl.finish GPU probe. Dev mode only; off by
    // default because the sync skews the measured framerate. v14.15 — this
    // probe now covers only the WebGL sky; the WebGPU smoke + water GPU
    // time shows on the always-on 'WebGPU GPU' panel line regardless of G.
    if (keys['g'] || keys['G']) {
      keys['g'] = keys['G'] = false;
      if (devMode) {
        gpuProbeEnabled = !gpuProbeEnabled;
        showMsg(gpuProbeEnabled ? 'Sky GPU probe ON — FPS reads low (gl.finish)' : 'Sky GPU probe off');
      }
    }
    // v13.14 — 'H' cycles the PERF ISO A/B isolation (dev mode only): each
    // press disables the next subsystem so the surface-GPU hog can be found
    // empirically. Read the top-left FPS at each step.
    if (keys['h'] || keys['H']) {
      keys['h'] = keys['H'] = false;
      if (devMode) {
        perfIso = (perfIso + 1) % PERF_ISO_NAMES.length;
        PERF_DISABLE_SMOKE_FLUID    = (perfIso === 1);
        PERF_DISABLE_ROCKET         = (perfIso === 2);
        PERF_DISABLE_NIGHTSKY       = (perfIso === 3);
        PERF_DISABLE_MOUNTAINS      = (perfIso === 4);
        PERF_DISABLE_CONSOLE        = (perfIso === 5);
        PERF_DISABLE_TERRAIN_CHUNKS = (perfIso === 6);
        PERF_DISABLE_WATER          = (perfIso === 7);
        showMsg('PERF ISO: ' + PERF_ISO_NAMES[perfIso]);
      }
    }
    // v23.39 — 'K' cycles the two Stage-1 smoke optimizations through their 4
    // on/off combinations (dev mode only) so each, and the pair, can be A/B'd
    // in flight. Also flippable via the gm 'perf.*' levers; state shows on the
    // overlay OPT TOGGLES row. Logs the config + outgoing perf to the console.
    if (keys['k'] || keys['K']) {
      keys['k'] = keys['K'] = false;
      if (devMode) {
        perfSmokeOptCycle = (perfSmokeOptCycle + 1) % 4;
        PERF_SMOKE_IDLE_SKIP      = (perfSmokeOptCycle === 0 || perfSmokeOptCycle === 2);
        PERF_SMOKE_OBSTACLE_DIRTY = (perfSmokeOptCycle === 0 || perfSmokeOptCycle === 1);
        showMsg('SMOKE OPT: idle-skip ' + (PERF_SMOKE_IDLE_SKIP ? 'ON' : 'OFF') +
                ' / obstacle-dirty ' + (PERF_SMOKE_OBSTACLE_DIRTY ? 'ON' : 'OFF'));
        if (typeof perfLogConfig === 'function') perfLogConfig('K toggle');
      }
    }
    // v23.40 — '[' / ']' capture the live perf stats into A/B slots (dev mode
    // only). The overlay A/B COMPARE section shows both + the B-A delta, so the
    // effect of a toggle flip is a measured number instead of an eyeball guess.
    if (keys['[']) {
      keys['['] = false;
      if (devMode && typeof perfCaptureAB === 'function') { perfCaptureAB('a'); showMsg('A/B: captured baseline A'); }
    }
    if (keys[']']) {
      keys[']'] = false;
      if (devMode && typeof perfCaptureAB === 'function') { perfCaptureAB('b'); showMsg('A/B: captured compare B'); }
    }
    // v23.41 — 'O' runs the deterministic benchmark (dev mode only): a fixed
    // 8s scripted auto-fly with windowed averages reported to the overlay +
    // console. Press again while running to abort.
    if (keys['o'] || keys['O']) {
      keys['o'] = keys['O'] = false;
      if (devMode && typeof benchStart === 'function') {
        if (benchState.running) { benchAbort(); showMsg('BENCH aborted'); }
        else if (shopState === 'closed' && !gameOver) { benchStart(); showMsg('BENCH: 8s auto-fly run — hands off'); }
        else showMsg('BENCH: close the shop first (and not while dead)');
      }
    }
    // v17.86 — 'J' toggles the jello particle-debug overlay (dev mode only):
    // bright yellow dots over every jello particle (blue = frozen), so the
    // particle cloud can be compared against the rendered gel skin.
    if (keys['j'] || keys['J']) {
      keys['j'] = keys['J'] = false;
      if (devMode && typeof JELLO_DEBUG_PARTICLES !== 'undefined') {
        JELLO_DEBUG_PARTICLES = JELLO_DEBUG_PARTICLES ? 0 : 1;
        showMsg(JELLO_DEBUG_PARTICLES ? 'Jello particle debug ON' : 'Jello particle debug off');
      }
    }
    // v25.27 — 'I' cycles the jello EDGE STYLE (dev mode only): CLASSIC (hard
    // edge) -> SOFT (chamfer + fringe) -> FUZZY (+hair coat) -> PLUSH (max
    // fuzz), so the skin treatment can be A/B'd live on a dropped pen (pairs
    // with C to drop cubes).
    if (keys['i'] || keys['I']) {
      keys['i'] = keys['I'] = false;
      if (devMode && typeof JELLO_EDGE_STYLE !== 'undefined') {
        JELLO_EDGE_STYLE = (JELLO_EDGE_STYLE + 1) % 4;
        showMsg('Jello edge: ' + ['CLASSIC (sharp)', 'SOFT fringe', 'FUZZY', 'PLUSH (max fuzz)'][JELLO_EDGE_STYLE] + ' (I cycles)');
      }
    }
    // 'M' cycles the jello solver (dev mode only): pbd (v1) -> xpbd -> fem -> pbd. The
    // whole pipeline except the constraint solve is shared, so this A/Bs them live.
    if (keys['m'] || keys['M']) {
      keys['m'] = keys['M'] = false;
      if (devMode && typeof JELLO_SOLVER !== 'undefined') {
        var _si = (JELLO_SOLVERS.indexOf(JELLO_SOLVER) + 1) % JELLO_SOLVERS.length;
        JELLO_SOLVER = JELLO_SOLVERS[_si];
        showMsg('Jello solver: ' + JELLO_SOLVER.toUpperCase() + (JELLO_SOLVER === 'pbd' ? ' (v1, old)' : ' (new)'));
      }
    }
    // 'U' cycles the jello FEEL presets (dev mode only): GLOOP (shipped v1) ->
    // TETRIS SNAP -> FIRM JIGGLE -> BOUNCY GUM -> LIVE PUDDING. Named lever
    // bundles aimed at the snappy real-time soft-body feel (see JELLO_FEELS in
    // 340-jello.js); pairs with 'C' (drop cubes) + 'V' (clear) + the L panel
    // for fine-tuning the winner.
    if (keys['u'] || keys['U']) {
      keys['u'] = keys['U'] = false;
      if (devMode && typeof jelloCycleFeel === 'function') {
        showMsg('Jello feel: ' + jelloCycleFeel() + ' (U cycles)');
      }
    }
    // 'N' force-cycles the weather mood (dev mode only): clear → fair → cloudy →
    // overcast → precip → storm → (locks; auto resumes when it wraps past storm).
    // Lets the whole weather system be A/B'd live without waiting on the sim.
    if (keys['n'] || keys['N']) {
      keys['n'] = keys['N'] = false;
      if (devMode && typeof weatherCycleMood === 'function') {
        weatherCycleMood();
        showMsg('Weather: ' + weatherMoodName());
      }
    }
    // 'Y' reloads the dev auto-sell test haul (dev mode only): refills the cargo
    // bay with the varied spread from devLoadTestHaul (060) so the pump-pad
    // reveal can be replayed instantly — roll onto the pad afterward to sell.
    if (keys['y'] || keys['Y']) {
      keys['y'] = keys['Y'] = false;
      if (devMode && typeof devLoadTestHaul === 'function') {
        devLoadTestHaul();
        showMsg('Test haul loaded (Y) — roll onto the pump pad to sell');
      }
    }
    // 'C' (dev, v25.16): drop ONE tile-sized cube in a RANDOM colour near the
    // rig (jelloDevSpawnOne: falls in from overhead when there's room, else
    // pops into an open pocket beside the rig; no pen, works in any tunnel). The old
    // walled-pen SHAPE-SET drop (jelloDevSpawnTiles, v24.123-v25.15) is off the
    // key; it still serves the headless harness via __jello.spawn. 'V' clears
    // all bodies + lifts any standing harness pen. Gated on ENABLE_JELLO so a
    // flag-off dev boot says WHY nothing dropped instead of silently building
    // invisible ghost bodies (update + draw are flag-gated, the key was not).
    if (keys['c'] || keys['C']) {
      keys['c'] = keys['C'] = false;
      if (devMode && ENABLE_JELLO) {
        showMsg(jelloDevSpawnOne() ? 'Jello cube dropped (C for another, V clears)'
                                   : 'No room for a cube (rig is boxed in)');
      }
      else if (devMode) showMsg('Jello is disabled (boot with ?jello=1)');
      // Normal play: 'C' opens the MINERAL LEDGER (295-collection-ledger.js).
      else if (typeof ledgerToggle === 'function') ledgerToggle();
    }
    if (keys['v'] || keys['V']) {
      keys['v'] = keys['V'] = false;
      if (devMode) {
        resetJello();
        if (typeof jelloDevArenaClear === 'function') jelloDevArenaClear();
        showMsg('Jello + test pen cleared');
      }
    }
    // v24.122 — 'X' cycles the WATER DEBUG kit (dev mode only): overlay
    // watch mode first, then ONE firecracker suspect disabled per press
    // (sleep, idle-skip, fixed dt, brake, sweep), then the dt-spike
    // injector, then off. Same levers as the gm water.DBG_* group, so the
    // L panel tracks it; see waterDbgCycle in 070-collision-liquids.js.
    if (keys['x'] || keys['X']) {
      keys['x'] = keys['X'] = false;
      if (devMode && typeof waterDbgCycle === 'function') {
        showMsg(waterDbgCycle());
      }
    }
    // v14.17 — 'L' toggles the GM TUNING panel (dev mode only): a DOM overlay
    // of live sliders for every GM_LEVERS entry. Built lazily on first use by
    // gmTuningPanelToggle() (see the GM TUNING PANEL section). Wrapped in a
    // guard so a missing facade can never break the input loop.
    if (keys['l'] || keys['L']) {
      keys['l'] = keys['L'] = false;
      if (devMode && typeof gmTuningPanelToggle === 'function') {
        gmTuningPanelToggle();
      }
    }
    // While dev mode is on, top up money so you can spam-buy in the shop
    // without thinking about it. The buyUpgrade path also short-circuits
    // the cost check, but keeping the wallet visibly full is friendlier.
    // Also keep hull + fuel maxed out — unlimited health + fuel in dev mode
    // (endGame is also short-circuited above so you can't die).
    if (devMode) {
      // Leave money alone while the pump-pad sell reveal is animating so its
      // cash-window count-up can ramp from $0; restore the full dev wallet once
      // the reveal + its lingering cards/chips have cleared.
      if (money < 999999 && !sellReveal && !srFloats.length && !srParts.length) money = 999999;
      if (player && !gameOver) {
        var _devMaxH = (typeof getMaxHull === 'function') ? getMaxHull() : 100;
        var _devMaxF = (typeof getMaxFuel === 'function') ? getMaxFuel() : maxFuel;
        if (player.hull < _devMaxH) player.hull = _devMaxH;
        if (player.fuel < _devMaxF) player.fuel = _devMaxF;
      }
    }

    // v11.12 — Proximity-driven shop state (UI_STYLE.md §15.1). Always-open
    // model: no toggle, no E key. Walking into the shop area sets state
    // 'floor'; walking out returns to 'closed'. Sub-pages persist while
    // inside; walking out from a sub-page also closes (rare in practice).
    if (UI_NEW && !gameOver && !gameWon) {
      // v11.38 — Door animates open near the shop; pressing UP anywhere
      // in the generous entry zone immediately teleports the rig into
      // the shop. No more drift-out-by-accident: while inside any shop
      // state the player can't move (frozen via update() guard below),
      // and LEAVE puts the rig down between the shop and the fireplace.
      var nearDoor = playerNearShopDoor();
      if (nearDoor) shopDoorT = Math.min(1, shopDoorT + dt / 0.35);
      else          shopDoorT = Math.max(0, shopDoorT - dt / 0.45);
      // v15.1 — warm doorway light-spill ramp (drawShopDoorGlow).
      if (playerInShopEntryArea()) shopGlowT = Math.min(1, shopGlowT + dt / 0.22);
      else                         shopGlowT = Math.max(0, shopGlowT - dt / 0.32);
      // v15.1 — Drive-up entry: parked on the deck in front of the shop,
      // press Enter or E (players reflexively try both; P too). The old
      // press-UP trick is gone. Clicking/tapping the building works from
      // anywhere it is on screen (see processPointerDown).
      var pressEnter = !!(keys['Enter'] || keys['e'] || keys['E'] ||
                          keys['p'] || keys['P']);
      if (shopState === 'closed' && pressEnter && playerInShopEntryArea()) {
        enterShopFloor();
      }
      if (shopState !== 'closed') shopEnterT = Math.min(1, shopEnterT + dt / 0.3);
      else if (shopEnterT > 0)    shopEnterT = Math.max(0, shopEnterT - dt / 0.2);
    }
    // v11.34 / v23.27 — hide DOM-layered effect canvases whenever a
    // fullscreen UI element covers the playfield: shop, death screen, or
    // win screen. This includes the live WebGPU liquid canvas as well as
    // the older WebGL fallback.
    syncDomEffectLayerVisibility();

    var _t0 = performance.now();
    update(dt);
    var _t1 = performance.now();
    try { updateCombat(dt); } catch (e) { if (!window.__combatErr) { window.__combatErr = String(e) + '\n' + (e.stack||''); console.error('updateCombat threw:', e); } }
    try { saveTick(dt); } catch (e) { if (!window.__saveErr) { window.__saveErr = String(e) + '\n' + (e.stack||''); console.error('saveTick threw:', e); } }
    // Optional systems land as their fragments ship; typeof-guarded so the
    // loop never depends on them: NMZ obstacle course (087), onboarding radio
    // (057), general radio messages (058), gamepad bridge (055).
    try { if (typeof nmzCourseTick === 'function') nmzCourseTick(dt); } catch (e) { if (!window.__courseErr) { window.__courseErr = String(e) + '\n' + (e.stack||''); console.error('nmzCourseTick threw:', e); } }
    try { if (typeof onboardingTick === 'function') onboardingTick(dt); } catch (e) { if (!window.__onboardErr) { window.__onboardErr = String(e) + '\n' + (e.stack||''); console.error('onboardingTick threw:', e); } }
    try { if (typeof radioMsgTick === 'function') radioMsgTick(dt); } catch (e) { if (!window.__radioErr) { window.__radioErr = String(e) + '\n' + (e.stack||''); console.error('radioMsgTick threw:', e); } }
    try { if (typeof gamepadTick === 'function') gamepadTick(dt); } catch (e) { if (!window.__padErr) { window.__padErr = String(e) + '\n' + (e.stack||''); console.error('gamepadTick threw:', e); } }
    if (typeof audioUpdate === 'function') audioUpdate(dt);   // SluiceAudio (defined at top of this fragment); typeof-guarded as belt-and-suspenders
    if (typeof birdsUpdate === 'function') birdsUpdate(dt);   // ambient surface birds (205-birds.js); early-outs to zero cost when no flock is near
    // Tick the on-screen toast message timer in the loop (not inside update)
    // so it keeps counting down even while the shop is open or the game is
    // over. Otherwise "Small charge stocked!" sticks on screen for as long
    // as the player browses the shop.
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer < 0) msgTimer = 0;
    }
    // Damage flash decays continuously regardless of game state
    if (damageFlashT > 0) {
      damageFlashT -= dt * 1.4;
      if (damageFlashT < 0) damageFlashT = 0;
    }
    updateZoomLerp(dt);
    updateCamera();

    // Always integrate the visual systems even if update() bailed early
    // (e.g. while drilling holds the player still, or the shop is open).
    // Smoke must run after camera/zoom updates because the GL smoke domain
    // maps world coordinates through the same camera that render() will use.
    var _t2 = performance.now();
    var _ts;
    _ts = performance.now(); updateSurfaceWind(dt);        perfMark('update.wind',     _ts);
    _ts = performance.now(); try { updateGrassWind(dt); } catch (e) { if (!window.__grassWindErr) { window.__grassWindErr = String(e) + '\n' + (e.stack||''); console.error('updateGrassWind threw:', e); } } perfMark('update.grassWind', _ts);
    _ts = performance.now(); try { treesUpdate(dt); } catch (e) { if (!window.__treesErr) { window.__treesErr = String(e) + '\n' + (e.stack||''); console.error('treesUpdate threw:', e); } } perfMark('update.trees', _ts);
    _ts = performance.now(); try { updateWeather(dt); } catch (e) { if (!window.__weatherErr) { window.__weatherErr = String(e) + '\n' + (e.stack||''); console.error('updateWeather threw:', e); } } perfMark('update.weather', _ts);
    _ts = performance.now();
    try { updateSmoke(dt); } catch (e) { if (!window.__smokeErr) { window.__smokeErr = String(e) + '\n' + (e.stack||''); console.error('updateSmoke threw:', e); } }
    perfMark('update.smoke', _ts);
    var _t3 = performance.now();
    _ts = performance.now(); updateDrillAnim(dt);          perfMark('update.drillAnim', _ts);
    _ts = performance.now(); updateExplosions(dt);         perfMark('update.explosions', _ts);
    _ts = performance.now(); try { updateMineFx(dt); } catch (e) {} perfMark('update.mineFx', _ts);
    _ts = performance.now(); updateTerrainClearOverlays(dt); perfMark('update.clearOverlays', _ts);
    _ts = performance.now(); updateLiveBombs(dt);          perfMark('update.liveBombs', _ts);
    _ts = performance.now(); try { updateSurfacePondStreaming(); } catch (e) {} perfMark('update.pondStream', _ts);
    _ts = performance.now(); updateLiquids(dt);            perfMark('update.liquids', _ts);
    _ts = performance.now(); if (ENABLE_JELLO) updateJello(dt); perfMark('update.jello', _ts);
    var _t4 = performance.now();
    // v11.80 — render PERF_STRESS times so the true frame cost surfaces past
    // a vsync cap. Default 1 = normal; ?stress=N multiplies it.
    for (var _sk = 0; _sk < PERF_STRESS; _sk++) render();
    var _t5 = performance.now();
    perfBuckets['update.main'] = (perfBuckets['update.main'] || 0) * 0.9 + (_t1 - _t0) * 0.1;
    perfBuckets['render.total'] = (perfBuckets['render.total'] || 0) * 0.9 + (_t5 - _t4) * 0.1;

    // v14.15 — sample WebGPU GPU drain (smoke + water). Non-intrusive, so
    // it runs every perf-overlay frame; all of this frame's GPU work is
    // submitted by now (update ran the sims, render ran the canvas draws).
    // v25.9 — also runs on the mobile perf-overlay path so the phone panel
    // shows the GPU drain (the onSubmittedWorkDone probe does not skew fps).
    if (perfOverlayOn()) probeWebGPUGpu();

    // Perf metrics (smoothed via rolling window)
    perfUpdateMs = perfUpdateMs * 0.9 + (_t1 - _t0) * 0.1;
    perfSmokeMs  = perfSmokeMs  * 0.9 + (_t3 - _t2) * 0.1;
    perfRenderMs = perfRenderMs * 0.9 + (_t5 - _t4) * 0.1;
    perfFrameMs  = perfFrameMs  * 0.9 + (_t5 - _t0) * 0.1;
    perfPushFrame(_t5 - _t0);
    perfChunkRebuilds = terrainChunkRebuildsThisFrame;
    perfFrameSamples.push(_t5);
    while (perfFrameSamples.length > 1 && perfFrameSamples[0] < _t5 - 1000) perfFrameSamples.shift();
    perfFps = perfFrameSamples.length > 1 ? perfFrameSamples.length - 1 : 0;
    // v14.21 — observed best fps (no decay): the vsync cap the panel scores
    // "healthy" against. Captured after perfFps is computed above.
    perfFpsCap = Math.max(perfFpsCap, perfFps);
    // v14.21 — hitch capture. A hitch is a frame well past the smoothed CPU
    // cost; record the worst one and a top-6 raw-bucket snapshot so the
    // overlay can attribute it. Replace the stored hitch when a worse one
    // arrives, or when the current record is older than 10s.
    var ft = _t5 - _t0;
    var _hT = Math.max(perfFrameMs * 1.6, perfFrameMs + 4);   // hitch threshold
    if (ft > _hT && (ft > perfHitch.ms || (_t5 - perfHitch.at) > 10000)) {
      perfHitch.ms = ft; perfHitch.at = _t5;
      perfHitch.buckets = perfSnapshotRaw();
    }
    // v23.41 — feed the windowed benchmark this frame's total ms + dt; it
    // aggregates + drives the scripted auto-fly while a run is active (no-op
    // otherwise).
    if (typeof benchTick === 'function') benchTick(ft, dt);

    // v17.84 — never reschedule while paused (covers the boot pause, which sets
    // gamePaused mid-frame after the top guard has already passed).
    gameRafId = gamePaused ? 0 : requestAnimationFrame(loop);
  }

  /* ---- Boot ---- */
  window.addEventListener('error', function (e) {
    if (!window.__bootErr) window.__bootErr = (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '');
    try { console.error('GM error:', e.message, 'at', (e.filename || '?') + ':' + (e.lineno || '?')); } catch (_) {}
  });
  // v10.68 — sun panel removed. Values locked in the SUN object up
  // top; tweak there if you need to.

  try {
    resize();
    window.addEventListener('resize', resize);
    setupInput();
    // v14.30 — ?cpuwater=1 forces the CPU water even on HTTPS, so the
    // WebGPU-vs-CPU water A/B can be flipped on one device via the URL.
    var _wantWGPULiquid = USE_WEBGPU_LIQUID &&
      !/[?&]cpuwater=1/i.test((window.location && window.location.search) || '');
    liquidWGPU = (_wantWGPULiquid && window.LiquidWGPU) ? window.LiquidWGPU.create(liquidWGPUOpts()) : null;
    // v14.8 — WebGPU smoke port, Stage 1. Created dormant; it shares the
    // liquid module's GPUDevice (one WebGPU device for the whole game).
    // v14.28+ — smoke stays on WebGL (USE_WEBGPU_SMOKE off); only the water
    // uses WebGPU, for the big-pond A/B test.
    smokeWGPU = (USE_WEBGPU_SMOKE && window.SmokeWGPU) ? window.SmokeWGPU.create({ liquid: liquidWGPU }) : null;
    // WebGPU jello port, Stage 1 (js/jello-wgpu.js). Created DORMANT whenever the
    // liquid device exists so the boot self-test reports on real hardware every
    // session (the smoke flag-gated pattern never exercised its tests). The CPU
    // drives all live bodies until Stage 3 wires the islanded offload behind
    // USE_WEBGPU_JELLO.
    jelloWGPU = (window.JelloWGPU && liquidWGPU) ? window.JelloWGPU.create({ liquid: liquidWGPU }) : null;

