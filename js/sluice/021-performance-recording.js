  /* ---- Local recording of ordinary gameplay ---- */
  // Packed frames avoid per-frame JSON/object allocation. Existing CPU buckets
  // overlap and include command submission, not GPU execution. Never sum them.
  var playPerfActive = false, playPerfTrace = null, playPerfUI = null;
  var playPerfAuto = /[?&]perfrec=1(?:&|$)/.test(location.search);
  var playPerfLimit = 72000, playPerfChunkSize = 1024, playPerfBucketLimit = 96;
  var playPerfFields = ['atMs', 'intervalMs', 'arrivalMs', 'cpuMs', 'recorderMs',
    'x', 'y', 'vx', 'vy', 'cameraX', 'cameraY', 'jet', 'holding', 'bath', 'paused',
    'visible', 'focus', 'liquids', 'snowActive', 'snowAirborne', 'snowParked',
    'residents', 'awakeResidents', 'outerTicks', 'microsteps', 'contacts',
    'terrainRebuilds', 'readbackAgeMs', 'inputMask', 'view'];
  var playPerfStride = playPerfFields.length + playPerfBucketLimit;
  var playPerfKeys = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ' ', 'f', 'q', 'e'];
  var playPerfInputCodes = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Escape|Backquote|Shift(Left|Right))$/;
  var playPerfPointerAt = 0, playPerfObserver = null, playPerfSaving = false;

  function playPerfEvent(kind, detail) {
    var trace = playPerfTrace;
    if (!playPerfActive || !trace) return;
    if (trace.events.length >= 12000) { trace.droppedEvents++; return; }
    trace.events.push({ atMs: performance.now() - trace.started, kind: kind, detail: detail });
  }
  function playPerfState() {
    var residents = 0, awake = 0, visible = 0, points = 0, bodies = [];
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i];
      if (!b.surfaceSlime) continue;
      residents++; points += b.n;
      if (!b.sleeping && !b.frozen) awake++;
      if (jelloBodyOnCamera(b)) visible++;
      bodies.push({ id: b.surfaceSlime.id, x: b.cx, y: b.cy, vx: b.vx, vy: b.vy,
        sleeping: !!b.sleeping, frozen: !!b.frozen, grabbed: !!b._grabbed, points: b.n,
        bounds: [b.bboxL, b.bboxT, b.bboxR, b.bboxB] });
    }
    var gpu = liquidWGPU;
    return { x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      cameraX: cam.x, cameraY: cam.y, jet: !!player.thrusting,
      holding: !!surfaceSlimeGrip, bath: !!bathMode, paused: !!gamePaused,
      loading: introPhase !== 'done', manifest: !!cargoManifestOpen, ledger: !!ledgerOpen,
      visible: !document.hidden, focus: document.hasFocus(), shop: shopState,
      liquids: liquidCount, snowActive: snow.active, snowAirborne: snow.grains.length,
      snowParked: snow.parked.length / 4, snowMass: snow.mass,
      residents: residents, awakeResidents: awake, visibleResidents: visible,
      residentPoints: points, softBodies: jelloBodies.length, slimes: bodies,
      outerTicks: jelloRecordedOuterTicks, microsteps: jelloRecordedMicrosteps,
      contacts: jelloRecordedMicrosteps ? jelloContactsThisFrame : 0, terrainRebuilds: terrainChunkRebuildsThisFrame,
      readbackAgeMs: gpu && gpu.getReadbackAge ? gpu.getReadbackAge() : null,
      liquidAwake: gpu ? gpu.awakeCount : null, liquidSleeping: gpu ? gpu.sleepingCount : null,
      gpuSimulation: !!(gpu && gpu.simActive),
      weather: { snow: worldSnowEnabled, rain: worldRainEnabled, precipitation: weather.pcp,
        timeOfDay: timeOfDay, wind: surfaceWind.current, airflow: snowAir.active },
      canvas: { width: canvas.width, height: canvas.height, dpr: devicePixelRatio,
        preset: window.gm ? gm.activePreset : null },
      heapBytes: performance.memory ? performance.memory.usedJSHeapSize : null };
  }
  function playPerfPause(paused, reason) {
    if (!playPerfActive) return;
    playPerfEvent(paused ? 'pause' : 'resume', { reason: reason || null });
    playPerfTrace.binInterrupted = true;
    playPerfTrace.lastAt = null;
  }
  function playPerfGPUCollect() {
    var trace = playPerfTrace, gpu = window.__sluiceGPUTrace;
    if (!trace || !gpu) return;
    var rows = gpu.drain();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.at < trace.started || (trace.ended && row.at > trace.ended)) continue;
      row.atMs = row.at - trace.started;
      if (trace.gpu.length < 8000) trace.gpu.push(row); else trace.droppedGPU++;
    }
    trace.gpuStatus = gpu.status();
  }
  function playPerfPublish(bin) {
    var trace = playPerfTrace;
    if (!trace || !playPerfUI) return;
    var duration = ((trace.ended || performance.now()) - trace.started) / 1000;
    var state = bin ? bin.state : trace.initialState;
    var live = { schema: 1, version: GAME_VERSION, recording: playPerfActive,
      seconds: Math.round(duration), frames: trace.frameCount, fps: bin ? bin.fps : 0,
      cpuMs: bin ? bin.cpuMs : 0, maxIntervalMs: bin ? bin.maxIntervalMs : 0,
      worstActiveFps: trace.worstActiveFps, state: state,
      topCPU: bin ? bin.topCPU : [], gpu: trace.gpu.slice(-6), gpuStatus: trace.gpuStatus,
      droppedEvents: trace.droppedEvents, reason: trace.reason || null };
    document.getElementById('gm-performance-live').textContent = JSON.stringify(live);
    var clock = Math.floor(duration / 60) + ':' + ('0' + Math.floor(duration % 60)).slice(-2);
    playPerfUI.status.textContent = (playPerfActive ? 'Recording ' : 'Recorded ') + clock +
      (state.paused ? ' · paused' : ' · ' + Math.round(live.fps) + ' FPS');
    playPerfUI.toggle.textContent = playPerfActive ? 'Stop and save' : 'Record play';
    playPerfUI.download.hidden = playPerfActive || !trace.frameCount;
    playPerfUI.toggle.disabled = playPerfSaving;
  }
  function playPerfHeartbeat(final) {
    var trace = playPerfTrace;
    if (!trace) return;
    playPerfGPUCollect();
    if (!playPerfActive) return;
    var now = performance.now(), windowMs = now - trace.binAt;
    var t0 = performance.now(), state = playPerfState(), types = {};
    for (var i = 0; i < liquidCount; i++) {
      var type = liquidType[i]; types[type] = (types[type] || 0) + 1;
    }
    state.particleTypes = types;
    var top = Object.keys(trace.binBuckets).map(function (name) {
      return { name: name, ms: trace.binFrames ? trace.binBuckets[name] / trace.binFrames : 0 };
    }).sort(function (a, b) { return b.ms - a.ms; }).slice(0, 10);
    var bin = { atMs: now - trace.started, durationMs: windowMs, frames: trace.binFrames,
      fps: windowMs ? trace.binFrames * 1000 / windowMs : 0,
      cpuMs: trace.binFrames ? trace.binCPU / trace.binFrames : 0,
      recorderMs: trace.binFrames ? trace.binRecorder / trace.binFrames : 0,
      maxIntervalMs: trace.binMax, topCPU: top, state: state };
    // Paused/hidden bins remain in the trace, but are excluded from this label.
    if (trace.binFrames && !trace.binInterrupted && windowMs >= 900 && state.visible && !state.paused) {
      trace.worstActiveFps = trace.worstActiveFps === null ? bin.fps : Math.min(trace.worstActiveFps, bin.fps);
    }
    trace.seconds.push(bin);
    trace.binAt = now; trace.binFrames = trace.binCPU = trace.binRecorder = trace.binMax = 0;
    trace.binBuckets = {}; trace.binInterrupted = state.paused || !state.visible;
    playPerfPublish(bin);
    bin.snapshotMs = performance.now() - t0;
    if (final !== true && now - trace.started >= 600000) playPerfStop('Ten-minute limit', false);
  }
  function playPerfStart() {
    if (playPerfActive || playPerfSaving || introPhase !== 'done') return false;
    var saved = null;
    // Read the latest existing save without invoking saveBuild (which advances
    // the save counter). It is context, not a deterministic input replay.
    try { saved = saveLoadEnvelope(); } catch (e) {}
    var now = performance.now();
    playPerfTrace = { schema: 'sluice-performance-1', version: GAME_VERSION,
      started: now, startedUTC: new Date().toISOString(), ended: null,
      metadata: { userAgent: navigator.userAgent, url: location.href,
        screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio },
        options: window.SluiceOptions ? JSON.parse(JSON.stringify(window.SluiceOptions)) : null,
        notes: ['CPU buckets overlap; do not add them.',
          'GPU samples time recorded passes, not queue wait, WebGL, or browser composition.',
          'Particle state uses the asynchronous CPU mirror.',
          'Inputs and saved context aid reproduction; this is not deterministic replay.'] },
      initialState: playPerfState(), initialSavedGame: saved,
      chunks: [], frameCount: 0, buckets: [], bucketIndex: {}, seconds: [], events: [], gpu: [],
      droppedEvents: 0, droppedGPU: 0, droppedBuckets: 0, worstActiveFps: null,
      binAt: now, binFrames: 0, binCPU: 0, binRecorder: 0, binMax: 0,
      binBuckets: {}, binInterrupted: gamePaused || document.hidden, lastAt: null };
    playPerfPointerAt = 0;
    if (window.__sluiceGPUTrace) { window.__sluiceGPUTrace.drain(); window.__sluiceGPUTrace.setActive(true); }
    playPerfActive = true;
    if (window.PerformanceObserver) {
      try {
        playPerfObserver = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (e) { playPerfEvent('longtask', { startMs: e.startTime - now, durationMs: e.duration }); });
        });
        playPerfObserver.observe({ entryTypes: ['longtask'] });
      } catch (e) { playPerfObserver = null; }
    }
    playPerfEvent('start', { paused: gamePaused, visible: !document.hidden });
    if (playPerfUI) playPerfUI.root.hidden = false;
    playPerfPublish(null);
    return true;
  }
  function playPerfStop(reason, save) {
    if (!playPerfActive) return;
    playPerfEvent('stop', { reason: reason || 'Stopped' });
    playPerfHeartbeat(true);
    playPerfActive = false;
    playPerfTrace.ended = performance.now(); playPerfTrace.reason = reason || 'Stopped';
    if (window.__sluiceGPUTrace) window.__sluiceGPUTrace.setActive(false);
    if (playPerfObserver) { playPerfObserver.disconnect(); playPerfObserver = null; }
    playPerfPublish(playPerfTrace.seconds[playPerfTrace.seconds.length - 1]);
    if (save) playPerfDownload();
  }
  function playPerfDownload() {
    if (playPerfActive || !playPerfTrace || playPerfSaving) return;
    playPerfSaving = true;
    if (playPerfUI) { playPerfUI.status.textContent = 'Saving recording'; playPerfUI.toggle.disabled = true; playPerfUI.download.disabled = true; }
    var trace = playPerfTrace, waitUntil = performance.now() + 1500;
    function ready() {
      playPerfGPUCollect();
      if (window.__sluiceGPUTrace && window.__sluiceGPUTrace.status().pending && performance.now() < waitUntil) { setTimeout(ready, 50); return; }
      var columns = playPerfFields.slice();
      for (var i = 0; i < playPerfBucketLimit; i++) columns.push(trace.buckets[i] ? 'cpu.' + trace.buckets[i] : null);
      var header = { schema: trace.schema, version: trace.version, startedUTC: trace.startedUTC,
        durationMs: trace.ended - trace.started, reason: trace.reason, metadata: trace.metadata,
        initialState: trace.initialState, initialSavedGame: trace.initialSavedGame,
        frameCount: trace.frameCount, columns: columns, stride: playPerfStride,
        seconds: trace.seconds, events: trace.events, gpu: trace.gpu, gpuStatus: trace.gpuStatus,
        droppedEvents: trace.droppedEvents, droppedGPU: trace.droppedGPU, droppedBuckets: trace.droppedBuckets };
      var parts = [JSON.stringify(header).slice(0, -1) + ',"frameChunks":['], chunkNo = 0;
      function chunk() {
        if (chunkNo < trace.chunks.length) {
          var count = Math.min(playPerfChunkSize, trace.frameCount - chunkNo * playPerfChunkSize);
          if (chunkNo) parts.push(',');
          parts.push(JSON.stringify(Array.from(trace.chunks[chunkNo].subarray(0, count * playPerfStride))));
          chunkNo++; setTimeout(chunk, 0); return;
        }
        parts.push(']}');
        var url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
        var link = document.createElement('a'); link.href = url;
        link.download = 'sluice-performance-' + trace.version + '-' + trace.startedUTC.replace(/[:.]/g, '-') + '.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        playPerfSaving = false;
        if (playPerfUI) { playPerfUI.download.disabled = false; playPerfPublish(trace.seconds[trace.seconds.length - 1]); }
      }
      chunk();
    }
    ready();
  }
  function playPerfFrame(time, interval, cpu, view) {
    if (!playPerfActive) {
      if (playPerfAuto) { playPerfAuto = false; playPerfStart(); }
      return;
    }
    var trace = playPerfTrace, t0 = performance.now(), index = trace.frameCount;
    if (index >= playPerfLimit) { playPerfStop('Frame limit', false); return; }
    var chunkNo = Math.floor(index / playPerfChunkSize), offset = (index % playPerfChunkSize) * playPerfStride;
    if (!trace.chunks[chunkNo]) trace.chunks[chunkNo] = new Float32Array(playPerfChunkSize * playPerfStride);
    var row = trace.chunks[chunkNo], residents = 0, awake = 0, inputMask = 0;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i]; if (!b.surfaceSlime) continue;
      residents++; if (!b.sleeping && !b.frozen) awake++;
    }
    for (i = 0; i < playPerfKeys.length; i++) if (keys[playPerfKeys[i]] || keys[playPerfKeys[i].toUpperCase()]) inputMask |= 1 << i;
    var arrival = trace.lastAt === null ? 0 : time - trace.lastAt; trace.lastAt = time;
    row[offset] = time - trace.started; row[offset + 1] = interval; row[offset + 2] = arrival;
    row[offset + 3] = cpu; row[offset + 5] = player.x; row[offset + 6] = player.y;
    row[offset + 7] = player.vx || 0; row[offset + 8] = player.vy || 0;
    row[offset + 9] = cam.x; row[offset + 10] = cam.y; row[offset + 11] = player.thrusting ? 1 : 0;
    row[offset + 12] = surfaceSlimeGrip ? 1 : 0; row[offset + 13] = bathMode ? 1 : 0;
    row[offset + 14] = gamePaused ? 1 : 0; row[offset + 15] = document.hidden ? 0 : 1;
    row[offset + 16] = document.hasFocus() ? 1 : 0; row[offset + 17] = liquidCount;
    row[offset + 18] = snow.active; row[offset + 19] = snow.grains.length;
    row[offset + 20] = snow.parked.length / 4; row[offset + 21] = residents; row[offset + 22] = awake;
    row[offset + 23] = view ? 0 : jelloRecordedOuterTicks; row[offset + 24] = view ? 0 : jelloRecordedMicrosteps;
    row[offset + 25] = !view && jelloRecordedMicrosteps ? jelloContactsThisFrame : 0; row[offset + 26] = terrainChunkRebuildsThisFrame;
    row[offset + 27] = liquidWGPU && liquidWGPU.getReadbackAge ? liquidWGPU.getReadbackAge() : -1;
    row[offset + 28] = inputMask;
    row[offset + 29] = view || 0;
    for (var name in perfBucketsRaw) {
      var slot = trace.bucketIndex[name];
      if (slot === undefined) {
        if (trace.buckets.length >= playPerfBucketLimit) { trace.droppedBuckets++; continue; }
        slot = trace.buckets.length; trace.buckets.push(name); trace.bucketIndex[name] = slot;
      }
      var ms = perfBucketsRaw[name];
      row[offset + playPerfFields.length + slot] = ms;
      trace.binBuckets[name] = (trace.binBuckets[name] || 0) + ms;
    }
    trace.frameCount++; trace.binFrames++; trace.binCPU += cpu;
    trace.binMax = Math.max(trace.binMax, interval, arrival);
    if (gamePaused || document.hidden) trace.binInterrupted = true;
    var cost = performance.now() - t0; row[offset + 4] = cost; trace.binRecorder += cost;
  }
  window.__sluicePerformance = {
    start: playPerfStart, stop: function () { playPerfStop('Stopped', false); }, download: playPerfDownload,
    status: function () { var node = document.getElementById('gm-performance-live'); return node && node.textContent ? JSON.parse(node.textContent) : { recording: false }; },
    // Chunked reads also let a local test/assistant retrieve the retained trace.
    frameChunk: function (n) {
      if (!playPerfTrace || n !== Math.floor(n) || n < 0 || n >= playPerfTrace.chunks.length) return null;
      var count = Math.min(playPerfChunkSize, playPerfTrace.frameCount - n * playPerfChunkSize);
      return { fields: playPerfFields.slice(), buckets: playPerfTrace.buckets.slice(), stride: playPerfStride,
        frames: Array.from(playPerfTrace.chunks[n].subarray(0, count * playPerfStride)) };
    }
  };
  Object.defineProperty(window.__sluicePerformance, 'frameId', { get: function () { return playPerfTrace ? playPerfTrace.frameCount : null; } });
  (function () {
    var root = document.getElementById('gm-perf-recorder'); if (!root) return;
    playPerfUI = { root: root, status: document.getElementById('gm-perf-status'),
      toggle: document.getElementById('gm-perf-toggle'), download: document.getElementById('gm-perf-download') };
    root.hidden = !playPerfAuto;
    function toggle() {
      playPerfAuto = false;
      if (playPerfActive) playPerfStop('Stopped', true); else playPerfStart();
      try { canvas.focus({ preventScroll: true }); } catch (e) {}
    }
    playPerfUI.toggle.addEventListener('click', toggle);
    playPerfUI.download.addEventListener('click', playPerfDownload);
    root.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'F9' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); root.hidden = false; toggle(); return;
      }
      if (!e.repeat && playPerfInputCodes.test(e.code) && !/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || ''))
        playPerfEvent('keydown', { code: e.code });
    });
    window.addEventListener('keyup', function (e) { if (playPerfInputCodes.test(e.code)) playPerfEvent('keyup', { code: e.code }); });
    ['pointerdown', 'pointerup', 'pointercancel', 'pointermove'].forEach(function (kind) {
      canvas.addEventListener(kind, function (e) {
        if (!playPerfActive) return;
        var now = performance.now();
        if (kind === 'pointermove' && now - playPerfPointerAt < 100) return;
        if (kind === 'pointermove') playPerfPointerAt = now;
        var rect = canvas.getBoundingClientRect();
        playPerfEvent(kind, { x: e.clientX - rect.left, y: e.clientY - rect.top,
          width: rect.width, height: rect.height, buttons: e.buttons, pointer: e.pointerType });
      }, { passive: true });
    });
    canvas.addEventListener('wheel', function (e) { playPerfEvent('wheel', { x: e.deltaX, y: e.deltaY }); }, { passive: true });
    root.parentNode.addEventListener('click', function (e) {
      var button = e.target.closest('button'); if (button && !root.contains(button)) playPerfEvent('control', { id: button.id, text: button.textContent.trim().slice(0, 80) });
    });
    ['focus', 'blur', 'resize'].forEach(function (kind) { window.addEventListener(kind, function () { playPerfEvent(kind, null); if (playPerfTrace && kind === 'blur') playPerfTrace.binInterrupted = true; }); });
    document.addEventListener('visibilitychange', function () { playPerfEvent('visibility', { visible: !document.hidden }); if (playPerfTrace) playPerfTrace.binInterrupted = true; });
    window.addEventListener('error', function (e) { playPerfEvent('error', { message: e.message, file: e.filename, line: e.lineno }); });
    window.addEventListener('unhandledrejection', function (e) { playPerfEvent('rejection', { message: String(e.reason) }); });
    setInterval(playPerfHeartbeat, 1000);
  })();
