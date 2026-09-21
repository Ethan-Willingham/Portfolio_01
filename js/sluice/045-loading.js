  /* ---- Scene loading: freeze play while the destination becomes drawable ---- */
  var gameLoadingWorldDetail = '';
  var gameLoadingAssetsReady = false;
  var gameLoadingWorkPending = false;
  var gameLoadingGeneration = 0;
  var gameLoadingPauseReason = '';
  var gameLoadingFirstReadyAt = 0;
  var gameLoadingFence = null;
  var gameLoadingStableFrames = 0;

  function loadingTask(id, state, detail, counts) {
    if (window.SluiceLoading) window.SluiceLoading.task(id, state, detail, counts);
  }

  function clearLoadingFence() {
    if (gameLoadingFence) {
      for (var i = 0; i < gameLoadingFence.gl.length; i++) {
        var item = gameLoadingFence.gl[i];
        try { item.gl.deleteSync(item.sync); } catch (e) {}
      }
    }
    gameLoadingFence = null;
  }

  function clearLoadingInput() {
    for (var k in keys) keys[k] = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    touch.active = false;
    player.thrusting = false;
  }

  function beginSceneLoading(label, hasWork) {
    gameLoadingGeneration++;
    introPhase = 'warmup';
    introSettledFrames = 0;
    introWarmupFramesRun = 0;
    gameLoadingFirstReadyAt = 0;
    gameLoadingStableFrames = 0;
    clearLoadingFence();
    terrainWarmupFrames = 3;
    clearLoadingInput();
    if (window.SluiceLoading) {
      window.SluiceLoading.begin(label, gameLoadingAssetsReady ? 'scene' : 'boot', hasWork);
      window.SluiceLoading.environment({ version: GAME_VERSION, graphics: window.gm ? gm.activePreset : 'initializing',
        canvas: canvas.width + 'x' + canvas.height, water: liquidWGPU && liquidWGPU.simActive ? 'WebGPU' : 'CPU or initializing' });
    }
    if (!hasWork) loadingTask('scene', 'running', 'Preparing terrain, clouds, water, and scenery at the destination.');
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
    beginSceneLoading(label, true);
    loadingTask('world', 'running', label + '. Generating terrain and placing the rig.');
    gameLoadingWorkPending = true;
    var ticket = gameLoadingGeneration;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (ticket !== gameLoadingGeneration) return;
        try {
          work();
          loadingTask('world', 'done', (gameLoadingWorldDetail || 'Mine prepared') + '. ' + COLS + ' columns x ' + TOTAL_ROWS + ' rows.');
          gameLoadingWorldDetail = '';
          gameLoadingWorkPending = false;
          if (!gameRafId) gameRafId = requestAnimationFrame(function (t) { lastTime = t; loop(t); });
        } catch (e) {
          gameLoadingWorkPending = false;
          window.__bootErr = String(e) + '\n' + (e.stack || '');
          if (window.SluiceLoading) window.SluiceLoading.fail(e);
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

  // Each optional gate reports whether the real asset settled or a fallback won.
  // Late promise completion never overwrites the recorded timeout outcome.
  function loadingAsset(id, promise, ms, verify, onTimeout) {
    return new Promise(function (resolve) {
      var ended = false;
      function done(error, timeout) {
        if (ended) return;
        ended = true; clearTimeout(timer);
        if (timeout && onTimeout) onTimeout();
        var outcome = verify();
        loadingTask(id, error || !outcome.ok ? 'fallback' : 'done',
          (timeout ? 'Timed out after ' + ms / 1000 + ' s. ' : error ? String(error) + '. ' : '') + outcome.detail);
        resolve();
      }
      var timer = setTimeout(function () { done('timeout', true); }, ms);
      Promise.resolve(promise).then(function () { done(null, false); }, function (e) { done(e, false); });
    });
  }
  function prepareLoadingAssets() {
    function fontReady(id, spec) {
      loadingTask(id, 'running', 'Loading and checking ' + spec + '.');
      var loaded = false;
      var font = document.fonts ? document.fonts.load(spec).then(function (faces) {
        loaded = faces.length > 0;
        consoleBaySigs.length = 0;
      }) : Promise.resolve();
      return loadingAsset(id, font, 5000, function () {
        return { ok: loaded, detail: loaded ? spec + ' available.' : 'Using the browser monospace fallback.' };
      });
    }
    var water = liquidWGPU;
    loadingTask('moon', 'running', 'Loading and decoding assets/images/moon.jpg.');
    loadingTask('water', 'running', 'Waiting for the water backend and its startup checks.');
    loadingTask('fire', 'running', 'Compiling and warming the combustion solver.');
    return Promise.all([
      loadingAsset('fire', hearthFireReady, 8000, function () {
        var ready = hearthFireGPU && hearthFireGPU.available;
        return { ok: !!ready, detail: ready ? 'WebGPU combustion ready.' : 'Using the CPU fire fallback.' };
      }, hearthFireCancel),
      fontReady('font-regular', '400 14px "Commit Mono"'),
      fontReady('font-bold', '700 24px "Commit Mono"'),
      loadingAsset('moon', moonImagePromise, 5000, function () {
        return { ok: moonImageReady, detail: moonImageReady ? 'Moon image decoded: ' + moonTexW + 'x' + moonTexH + '.' : 'Using the procedural moon disc.' };
      }),
      loadingAsset('water', water && water.readyPromise, 8000, function () {
        var gpu = water && liquidWGPU === water && water.simActive && !water.failed;
        var cpuRequested = /[?&]cpuwater=1/i.test(location.search) || !USE_WEBGPU_LIQUID;
        if (window.SluiceLoading) window.SluiceLoading.environment({ water: gpu ? 'WebGPU' : 'CPU' });
        return { ok: gpu || cpuRequested, detail: gpu ? 'WebGPU water solver ready.' : cpuRequested ? 'CPU water solver selected.' : 'WebGPU unavailable. Using the CPU water solver.' };
      }, function () { abandonLoadingGPU(water); })
    ]).then(function () {
      gameLoadingAssetsReady = true;
      introSettledFrames = 0;
      loadingTask('scene', 'running', 'Preparing terrain, clouds, water, and scenery at the destination.');
    });
  }

  function loadingCacheCounts() {
    var ready = 0, total = 0;
    var r0 = Math.floor((Math.max(0, Math.floor(cam.y / TILE)) - 1) / TERRAIN_CHUNK_TILES);
    var r1 = Math.floor((Math.min(TOTAL_ROWS - 1, Math.floor((cam.y + screenH) / TILE)) + 1) / TERRAIN_CHUNK_TILES);
    var c0 = Math.floor((Math.max(0, Math.floor(cam.x / TILE)) - 1) / TERRAIN_CHUNK_TILES);
    var c1 = Math.floor((Math.min(COLS - 1, Math.floor((cam.x + screenW) / TILE)) + 1) / TERRAIN_CHUNK_TILES);
    if (!PERF_DISABLE_TERRAIN_CHUNKS) for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      total++;
      var chunk = terrainChunkCache[terrainChunkKey(r, c)];
      if (chunk && chunk.ready && !chunk.dirty && Math.abs(chunk.scale - TERRAIN_CHUNK_RENDER_SCALE) <= 0.01) ready++;
    }
    var clouds = 0, cloudTotal = 0;
    if (!PERF_DISABLE_NIGHTSKY && !PERF_DISABLE_WEATHER && weatherTune.enabled && cam.y < SKY_ROWS * TILE && weather.cov >= 0.02 && cloudSprites) {
      for (var i = 0; i < cloudSprites.length; i++) for (var j = 0; j < cloudSprites[i].length; j++) {
        cloudTotal++;
        var sprite = cloudSprites[i][j];
        if (sprite.ready && !sprite.dirty && !sprite.recolorDirty) clouds++;
      }
      cloudTotal++;
      if (!veilTile.dirty && !veilTile.recolorDirty) clouds++;
    }
    return ready + '/' + total + ' terrain chunks; ' + clouds + '/' + cloudTotal + ' cloud images; ' + Math.min(6, introSettledFrames) + '/6 complete frames.';
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

  function startLoadingFence() {
    var fence = gameLoadingFence = { gpuDone: true, gl: [], at: performance.now(), frames: 0, warnings: [], total: 0, completed: 0 };
    loadingTask('fence', 'running', 'Waiting for submitted graphics work to finish.');
    var water = liquidWGPU;
    if (water && water.queue && !water.failed) {
      fence.gpuDone = false; fence.total++;
      try {
        loadingBounded(water.queue.onSubmittedWorkDone().catch(function (e) { fence.warnings.push('WebGPU: ' + e); }), 2000, function () { fence.warnings.push('WebGPU queue wait exceeded 2 s.'); }).then(function () { fence.gpuDone = true; fence.completed++; });
      } catch (e) { fence.gpuDone = true; fence.completed++; fence.warnings.push(String(e)); }
    }
    var contexts = [smokeProbeGL(), rigExhaustGL(), skyGL, mtnGPU && !mtnGPUFailed ? mtnGPU.gl : null];
    for (var i = 0; i < contexts.length; i++) {
      var gl = contexts[i];
      if (!gl || !gl.fenceSync || gl.isContextLost()) continue;
      try {
        var sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) { fence.gl.push({ gl: gl, sync: sync }); fence.total++; }
        gl.flush();
      } catch (e) {}
    }
  }
  function loadingFenceReady() {
    var fence = gameLoadingFence;
    fence.frames++;
    for (var i = fence.gl.length - 1; i >= 0; i--) {
      var item = fence.gl[i], status;
      try { status = item.gl.clientWaitSync(item.sync, 0, 0); } catch (e) {}
      if (status !== item.gl.TIMEOUT_EXPIRED || performance.now() - fence.at > 2000) {
        if (status !== item.gl.ALREADY_SIGNALED && status !== item.gl.CONDITION_SATISFIED) fence.warnings.push('WebGL queue wait failed or exceeded 2 s.');
        fence.completed++;
        try { item.gl.deleteSync(item.sync); } catch (e) {}
        fence.gl.splice(i, 1);
      }
    }
    var ready = fence.gpuDone && !fence.gl.length && fence.frames >= 2;
    loadingTask('fence', ready ? (fence.warnings.length ? 'fallback' : 'done') : 'running',
      fence.completed + '/' + fence.total + ' graphics queues settled; ' + Math.min(2, fence.frames) + '/2 presentation frames.' +
      (fence.warnings.length ? ' ' + fence.warnings.join(' ') : ''), { done: fence.completed, total: fence.total, unit: 'queues' });
    return ready;
  }

  // Called instead of gameplay, including while a focus pause is pending.
  // No rig physics, input, hazards, economy, autosave or clock ticks run here.
  function renderLoadingScene() {
    if (gameLoadingWorkPending || !gameLoadingAssetsReady || introPhase === 'revealing') return;
    clearLoadingInput();
    if (!gameLoadingFence) {
      var warmStart = performance.now();
      updateCamera();
      treesUpdate(0);
      updateWeather(0);
      // Exercise the real advection/pressure passes while input is held. A zero
      // dt used to leave the first actual smoke simulation to the player's turn.
      updateSmoke(1 / 60);
      updateSurfacePondStreaming();
      updateLiquids(1 / 60);
      terrainWarmupFrames = 1;
      terrainChunkPendingThisFrame = 0;
      render();
      // First-use GPU programs compile here, under the cover (046).
      if (prepareShaderWarmup()) {
        introSettledFrames = 0; gameLoadingStableFrames = 0;
        loadingTask('scene', 'running', loadingCacheCounts());
        return;
      }
      // A surface-only warmup misses the art first exposed during takeoff.
      // Prepare the same viewport's planet and moon behind the loading cover.
      colourPlanetSurface(buildPlanetSurface(canvas.width, canvas.height));
      prepareMoonPhaseDisc();
      introWarmupFramesRun++;
      var ready = gameLoadingAssetsReady && terrainChunkPendingThisFrame === 0 && loadingCloudsReady();
      introSettledFrames = ready ? introSettledFrames + 1 : 0;
      if (ready && !gameLoadingFirstReadyAt) gameLoadingFirstReadyAt = performance.now();
      gameLoadingStableFrames = ready && performance.now() - warmStart <= 8 ? gameLoadingStableFrames + 1 : 0;
      loadingTask('scene', 'running', loadingCacheCounts());
      // Require complete cache frames without expensive warmup work. A busy or
      // slower device gets a bounded fallback after readiness, never an endless
      // demand for a frame rate its selected preset cannot sustain.
      if (introSettledFrames < 6 || (gameLoadingStableFrames < 6 &&
          performance.now() - gameLoadingFirstReadyAt < 2000)) return;
      loadingTask('scene', weatherBakeWorkerFailed ? 'fallback' : 'done', loadingCacheCounts() + ' Planet and moon prepared.' +
        (weatherBakeWorkerFailed ? ' Cloud worker unavailable; images built on the main thread.' : ''));
      if (window.SluiceLoading) window.SluiceLoading.environment({ cloudWorker: weatherBakeWorkerFailed ? 'main-thread fallback' : 'available',
        graphics: window.gm ? gm.activePreset : 'default', canvas: canvas.width + 'x' + canvas.height });
      startLoadingFence();
      if (window.SluiceLoading) window.SluiceLoading.stage('Preparing the first frame');
      return;
    }
    // Stop submitting while the completed scene drains, then give the browser
    // two presentation opportunities. Never use a blocking GPU finish here.
    if (!loadingFenceReady()) return;
    clearLoadingFence();
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
