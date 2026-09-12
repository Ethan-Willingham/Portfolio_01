  /* ---- Scene loading: freeze play while the destination becomes drawable ---- */
  var gameLoadingAssetsReady = false;
  var gameLoadingWorkPending = false;
  var gameLoadingGeneration = 0;
  var gameLoadingPauseReason = '';

  function clearLoadingInput() {
    for (var k in keys) keys[k] = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    touch.active = false;
    player.thrusting = false;
  }

  function beginSceneLoading(label) {
    gameLoadingGeneration++;
    introPhase = 'warmup';
    introSettledFrames = 0;
    introWarmupFramesRun = 0;
    terrainWarmupFrames = 3;
    clearLoadingInput();
    if (window.SluiceLoading) window.SluiceLoading.begin(label);
    if (window.SluiceAudio) window.SluiceAudio.setPaused(true);
  }

  // Two animation frames let the browser paint the opaque cover before any
  // synchronous world generation. Never perform that work in a click handler.
  function queueSceneLoading(label, work) {
    // The art bench builds on DOMContentLoaded and needs synchronous state.
    if (!window.SluiceLoading) {
      work();
      if (!gameRafId) gameRafId = requestAnimationFrame(function (t) { lastTime = t; loop(t); });
      return;
    }
    beginSceneLoading(label);
    gameLoadingWorkPending = true;
    var ticket = gameLoadingGeneration;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (ticket !== gameLoadingGeneration) return;
        try {
          work();
          gameLoadingWorkPending = false;
          if (!gameRafId) gameRafId = requestAnimationFrame(function (t) { lastTime = t; loop(t); });
        } catch (e) {
          gameLoadingWorkPending = false;
          window.__bootErr = String(e) + '\n' + (e.stack || '');
          if (window.SluiceLoading) window.SluiceLoading.fail();
          console.error('Scene preparation failed:', e);
        }
      });
    });
  }

  // Optional visual assets settle on success OR fallback. A broken font,
  // missing moon map or unavailable GPU must never strand the loading screen.
  function loadingBounded(promise, ms, onTimeout) {
    return new Promise(function (resolve) {
      var ended = false;
      function done() { if (ended) return; ended = true; clearTimeout(timer); resolve(); }
      var timer = setTimeout(function () { if (onTimeout) onTimeout(); done(); }, ms);
      Promise.resolve(promise).then(done, done);
    });
  }
  function abandonLoadingGPU(water) {
    if (!water || liquidWGPU !== water) return;
    var jello = jelloWGPU, smoke = smokeWGPU;
    liquidWGPU = jelloWGPU = smokeWGPU = null;
    function dispose() {
      water.failed = true;
      if (jello) { jello.failed = true; jello.simActive = false; }
      if (smoke) { smoke.failed = true; smoke.simActive = false; }
      try { if (smoke && smoke.dispose) smoke.dispose(); } catch (e) {}
      try { water.dispose(); } catch (e) {}
    }
    dispose();
    // Initialization may still be waiting for a device. Dispose again once
    // it and its dormant shared-device checks settle, including any canvas
    // allocated after the timeout. These promises never hold up the player.
    Promise.resolve(water.readyPromise).then(function () {
      return loadingBounded(Promise.all([
        jello && jello.readyPromise, smoke && smoke.readyPromise
      ]), 1000);
    }, function () {}).then(dispose, dispose);
  }

  function prepareLoadingAssets() {
    function fontReady(spec) {
      if (!document.fonts) return Promise.resolve();
      var font = document.fonts.load(spec).then(function () {
        // A very late successful font must invalidate cached fallback text.
        consoleBaySigs.length = 0;
      }, function () {});
      return loadingBounded(font, 5000);
    }
    var water = liquidWGPU;
    return Promise.all([
      fontReady('400 14px "Commit Mono"'),
      fontReady('700 24px "Commit Mono"'),
      loadingBounded(moonImagePromise, 5000),
      loadingBounded(water && water.readyPromise, 8000, function () { abandonLoadingGPU(water); })
    ]).then(function () {
      gameLoadingAssetsReady = true;
      introSettledFrames = 0;
      if (window.SluiceLoading) window.SluiceLoading.stage('Finishing the scene');
    });
  }

  function loadingCloudsReady() {
    if (PERF_DISABLE_NIGHTSKY || PERF_DISABLE_WEATHER || !weatherTune.enabled ||
        cam.y >= SKY_ROWS * TILE || weather.cov < 0.02) return true;
    if (!cloudSprites) return false;
    for (var c = 0; c < cloudSprites.length; c++) {
      for (var v = 0; v < cloudSprites[c].length; v++) {
        var sprite = cloudSprites[c][v];
        if (!sprite.ready || sprite.dirty || sprite.recolorDirty) return false;
      }
    }
    return !veilTile.dirty && !veilTile.recolorDirty;
  }

  // Called instead of gameplay, including while a focus pause is pending.
  // No rig physics, input, hazards, economy, autosave or clock ticks run here.
  function renderLoadingScene() {
    if (gameLoadingWorkPending || !gameLoadingAssetsReady || introPhase === 'revealing') return;
    clearLoadingInput();
    updateCamera();
    treesUpdate(0);
    updateWeather(0);
    updateSmoke(0);
    updateSurfacePondStreaming();
    updateLiquids(1 / 60);
    terrainWarmupFrames = 1;
    terrainChunkPendingThisFrame = 0;
    render();
    introWarmupFramesRun++;
    var ready = gameLoadingAssetsReady && terrainChunkPendingThisFrame === 0 && loadingCloudsReady();
    introSettledFrames = ready ? introSettledFrames + 1 : 0;
    if (introSettledFrames < 2 || introWarmupFramesRun < 4) return;
    terrainWarmupFrames = 0;
    introPhase = 'revealing';
    var ticket = gameLoadingGeneration;
    function reveal() {
      if (ticket !== gameLoadingGeneration) return;
      clearLoadingInput();
      introPhase = 'done';
      lastTime = performance.now();
      if (gameLoadingPauseReason && !PAUSE_DISABLED) {
        gamePaused = true;
        showPauseOverlay(gameLoadingPauseReason);
        gameLoadingPauseReason = '';
      }
      if (window.SluiceAudio) window.SluiceAudio.setPaused(gamePaused);
    }
    if (window.SluiceLoading) window.SluiceLoading.finish(reveal);
    else reveal();
  }

  // A distant recovery can evict every destination chunk. Cached recoveries
  // stay instant; cold ones get the same short scene warmup as arrival.
  function prepareRecoveryScene() {
    if (introPhase !== 'done') return;
    updateCamera();
    var r0 = Math.floor((Math.max(0, Math.floor(cam.y / TILE)) - 1) / TERRAIN_CHUNK_TILES);
    var r1 = Math.floor((Math.min(TOTAL_ROWS - 1, Math.floor((cam.y + screenH) / TILE)) + 1) / TERRAIN_CHUNK_TILES);
    var c0 = Math.floor((Math.max(0, Math.floor(cam.x / TILE)) - 1) / TERRAIN_CHUNK_TILES);
    var c1 = Math.floor((Math.min(COLS - 1, Math.floor((cam.x + screenW) / TILE)) + 1) / TERRAIN_CHUNK_TILES);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var chunk = terrainChunkCache[terrainChunkKey(r, c)];
        if (!chunk || !chunk.ready || chunk.dirty || Math.abs(chunk.scale - TERRAIN_CHUNK_RENDER_SCALE) > 0.01) {
          beginSceneLoading('Returning to town');
          return;
        }
      }
    }
  }
