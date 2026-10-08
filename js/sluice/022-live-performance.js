  /* Bounded local history for the live performance panel. No particle scans. */
  var perfLive = { enabled: false, frameId: 0, started: 0, write: 0, count: 0,
    capacity: 8192, data: null, buckets: [], bucketIndex: {}, events: [], gpu: [],
    workload: [], latestGPU: {}, previous: null, worst: null, pinned: null,
    observerMs: 0, paintMs: 0, paintAt: -Infinity, collectAt: -Infinity,
    interrupted: true, saving: false, droppedBuckets: 0, details: false,
    issues: [], issueLimit: 16, selectedIssue: null, inspectedIssue: null,
    activeMs: 0, issueReadyAt: null };
  var perfLiveFields = playPerfFields.slice(0, 30).concat(['frameId', 'visibleResidents', 'observerMs', 'active']);
  var perfLiveStride = perfLiveFields.length + playPerfBucketLimit;
  var perfLiveTargetFPS = 144;
  var perfLiveBudget = 1000 / perfLiveTargetFPS;
  var perfLivePhaseNames = ['update.main', 'update.aux', 'update.wind', 'update.grassWind',
    'update.trees', 'update.boulders', 'update.weather', 'update.smoke', 'update.audio',
    'update.drillAnim', 'update.explosions', 'update.mineFx', 'update.clearOverlays',
    'update.liveBombs', 'update.bathhouse', 'update.pondStream', 'update.slimeNpc',
    'update.residents', 'update.jello', 'update.fluidSkin', 'update.rain', 'update.liquids',
    'update.slimeAudio', 'render.sky', 'render.lightPrepare', 'render.terrain',
    'render.tiles', 'render.entities', 'render.liquids', 'render.smoke',
    'render.player+fx', 'render.HUD'];
  function perfLivePhases(raw, cpu) {
    var result = [], total = 0;
    for (var i = 0; i < perfLivePhaseNames.length; i++) {
      var name = perfLivePhaseNames[i], ms = raw[name] || 0;
      // Snow is measured inside rain/weather particle bookkeeping.
      if (name === 'update.rain') {
        var snowMs = raw['snow.cpu'] || 0;
        if (snowMs > 0) { result.push({ name: 'snow.cpu', ms: snowMs }); total += snowMs; }
        ms = Math.max(0, ms - snowMs);
      }
      if (name === 'update.bathhouse') {
        var bathParts = ['bath.syncReadback', 'bath.streaming', 'bath.scoop', 'bath.visitors', 'bath.guests', 'bath.audio'];
        for (var p = 0; p < bathParts.length; p++) {
          var partMs = raw[bathParts[p]] || 0;
          if (partMs > 0) { result.push({ name: bathParts[p], ms: partMs }); total += partMs; ms -= partMs; }
        }
        ms = Math.max(0, ms);
      }
      if (ms > 0) { result.push({ name: name, ms: ms }); total += ms; }
    }
    if (cpu !== undefined) result.push({ name: 'other game work', ms: Math.max(0, cpu - total) });
    result.sort(function (a, b) { return b.ms - a.ms; });
    return result;
  }
  function perfLiveSync() {
    var enabled = perfOverlayOn();
    var changed = enabled !== perfLive.enabled;
    if (changed) {
      perfLive.enabled = enabled; perfLive.interrupted = true; perfLive.previous = null;
      if (enabled) {
        if (!perfLive.data) perfLive.data = new Float32Array(perfLive.capacity * perfLiveStride);
        perfLive.started = performance.now(); perfLive.write = perfLive.count = 0;
        perfLive.events = []; perfLive.gpu = []; perfLive.workload = []; perfLive.latestGPU = {};
        perfLive.worst = null; perfLive.pinned = null; perfLive.collectAt = -Infinity;
        perfLive.activeMs = 0; perfLive.issueReadyAt = null;
      }
    }
    var gpuActive = (enabled || playPerfActive) && introPhase === 'done' && !gamePaused && !mobileLandscapeBlocked;
    if (window.__sluiceGPUTrace) window.__sluiceGPUTrace.setActive(gpuActive);
    if (liquidWGPU && liquidWGPU.setDiagnosticsActive) liquidWGPU.setDiagnosticsActive(gpuActive);
    if (changed && typeof perfPanelSync === 'function') perfPanelSync();
    return enabled || playPerfActive || playPerfAuto;
  }
  function perfLiveBegin() {
    perfLive.frameId++;
    return perfLiveSync();
  }
  function perfLiveInterrupt() {
    perfLive.interrupted = true; perfLive.previous = null;
    if (perfLive.enabled && typeof perfPanelPaint === 'function') setTimeout(perfPanelPaint, 0);
  }
  function perfLiveEvent(kind, detail) {
    if (!perfLive.enabled) return;
    var now = performance.now();
    perfLive.events.push({ at: now, kind: kind, detail: detail });
    while (perfLive.events.length > 1200 || (perfLive.events.length && perfLive.events[0].at < now - 30000)) perfLive.events.shift();
  }
  function perfLiveAttach(event, row, workload) {
    if (!event) return;
    var frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
    if (!frame || frame.frameId !== row.frameId) return;
    if (workload) event.workload = row;
    else {
      if (!event.gpu) event.gpu = [];
      if (!event.gpu.some(function (r) { return r.name === row.name && r.at === row.at; })) event.gpu.push(row);
      if (event.gpu.length > 8) event.gpu.shift();
    }
  }
  function perfLiveGPUCollect() {
    var trace = playPerfTrace, source = window.__sluiceGPUTrace, now = performance.now();
    var rows = source ? source.drain() : [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      perfLiveAttach(perfLive.worst, row, false); perfLiveAttach(perfLive.pinned, row, false);
      perfLive.issues.forEach(function (issue) { perfLiveAttach(issue.event, row, false); });
      if (perfLive.inspectedIssue) perfLiveAttach(perfLive.inspectedIssue.event, row, false);
      if (perfLive.enabled) {
        perfLive.gpu.push(row); perfLive.latestGPU[row.name] = row;
        perfLiveObserveGPU(row);
      }
      if (trace && row.at >= trace.started && (!trace.ended || row.at <= trace.ended)) {
        if (trace.gpu.length < 8000) trace.gpu.push(Object.assign({}, row, { atMs: row.at - trace.started }));
        else trace.droppedGPU++;
      }
    }
    while (perfLive.gpu.length > 256 || (perfLive.gpu.length && perfLive.gpu[0].at < now - 30000)) perfLive.gpu.shift();
    if (trace && source) trace.gpuStatus = source.status();
    var counters = liquidWGPU && liquidWGPU.getDiagnostics ? liquidWGPU.getDiagnostics() : null;
    if (counters && counters.frameId !== null && counters.atMs !== undefined && (!perfLive.workload.length || perfLive.workload[perfLive.workload.length - 1].frameId !== counters.frameId)) {
      var sample = Object.assign({}, counters, { at: counters.atMs });
      perfLiveAttach(perfLive.worst, sample, true); perfLiveAttach(perfLive.pinned, sample, true);
      perfLive.issues.forEach(function (issue) { perfLiveAttach(issue.event, sample, true); });
      if (perfLive.inspectedIssue) perfLiveAttach(perfLive.inspectedIssue.event, sample, true);
      if (perfLive.enabled) perfLive.workload.push(sample);
      if (trace && sample.at >= trace.started && (!trace.ended || sample.at <= trace.ended)) {
        if (!trace.workload) trace.workload = [];
        if (!trace.workload.length || trace.workload[trace.workload.length - 1].frameId !== sample.frameId) trace.workload.push(Object.assign({}, sample, { pageAtMs: sample.atMs, atMs: sample.at - trace.started, pageCompletedAtMs: sample.completedAtMs, completedAtMs: sample.completedAtMs - trace.started }));
      }
    }
    while (perfLive.workload.length > 64 || (perfLive.workload.length && perfLive.workload[0].at < now - 30000)) perfLive.workload.shift();
  }
  function perfLiveRow(index) {
    var offset = index * perfLiveStride, row = perfLive.data, result = {}, raw = {};
    for (var i = 0; i < perfLiveFields.length; i++) result[perfLiveFields[i]] = row[offset + i];
    for (i = 0; i < perfLive.buckets.length; i++) raw[perfLive.buckets[i]] = row[offset + perfLiveFields.length + i];
    result.buckets = raw; result.phases = perfLivePhases(raw, result.cpuMs);
    return result;
  }
  function perfLiveReference(time) {
    var result = { frames: 0, cpuMs: 0, snowActive: 0, awakeResidents: 0, microsteps: 0 };
    for (var i = 0; i < perfLive.count; i++) {
      var index = (perfLive.write - 1 - i + perfLive.capacity) % perfLive.capacity, offset = index * perfLiveStride;
      if (perfLive.data[offset] < time - 1000) break;
      if (perfLive.data[offset] >= time) continue;
      if (!perfLive.data[offset + 33]) continue;
      result.frames++; result.cpuMs += perfLive.data[offset + 3];
      result.snowActive += perfLive.data[offset + 18]; result.awakeResidents += perfLive.data[offset + 22];
      result.microsteps += perfLive.data[offset + 24];
    }
    var count = result.frames || 1;
    result.cpuMs /= count; result.snowActive /= count; result.awakeResidents /= count; result.microsteps /= count;
    return result;
  }
  function perfLiveFrame(time, interval, cpu, view) {
    if (!perfLive.enabled || !perfLive.data) return;
    var t0 = performance.now(), offset = perfLive.write * perfLiveStride, row = perfLive.data;
    row.fill(0, offset, offset + perfLiveStride);
    var residents = 0, awake = 0, visible = 0, inputMask = 0;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i]; if (!b.surfaceSlime) continue;
      residents++; if (!b.sleeping && !b.frozen) awake++;
      if (jelloBodyOnCamera(b)) visible++;
    }
    for (i = 0; i < playPerfKeys.length; i++) if (keys[playPerfKeys[i]] || keys[playPerfKeys[i].toUpperCase()]) inputMask |= 1 << i;
    var active = !view && !gamePaused && !mobileLandscapeBlocked && !document.hidden && introPhase === 'done';
    row[offset] = time; row[offset + 1] = interval; row[offset + 2] = interval;
    row[offset + 3] = cpu; row[offset + 5] = player.x; row[offset + 6] = player.y;
    row[offset + 7] = player.vx || 0; row[offset + 8] = player.vy || 0;
    row[offset + 9] = cam.x; row[offset + 10] = cam.y; row[offset + 11] = player.thrusting ? 1 : 0;
    row[offset + 12] = surfaceSlimeGrip ? 1 : 0; row[offset + 13] = bathMode ? 1 : 0;
    row[offset + 14] = gamePaused ? 1 : 0; row[offset + 15] = document.hidden ? 0 : 1;
    row[offset + 16] = document.hasFocus() ? 1 : 0; row[offset + 17] = liquidCount;
    row[offset + 18] = snow.active; row[offset + 19] = snow.grains.length;
    row[offset + 20] = snow.parked.length / 4; row[offset + 21] = residents; row[offset + 22] = awake;
    row[offset + 23] = view ? 0 : jelloRecordedOuterTicks; row[offset + 24] = view ? 0 : jelloRecordedMicrosteps;
    row[offset + 25] = !view && jelloRecordedMicrosteps ? jelloContactsThisFrame : 0;
    row[offset + 26] = terrainChunkRebuildsThisFrame;
    row[offset + 27] = liquidWGPU && liquidWGPU.getReadbackAge ? liquidWGPU.getReadbackAge() * 1000 : -1;
    row[offset + 28] = inputMask; row[offset + 29] = view || 0;
    row[offset + 30] = perfLive.frameId; row[offset + 31] = visible;
    row[offset + 33] = active && !perfLive.interrupted ? 1 : 0;
    if (row[offset + 33]) perfLive.activeMs += Math.max(0, interval);
    if (perfLive.issueReadyAt === null && perfLive.activeMs >= 2000) perfLive.issueReadyAt = time;
    for (var name in perfBucketsRaw) {
      var slot = perfLive.bucketIndex[name];
      if (slot === undefined) {
        if (perfLive.buckets.length >= playPerfBucketLimit) { perfLive.droppedBuckets++; continue; }
        slot = perfLive.buckets.length; perfLive.buckets.push(name); perfLive.bucketIndex[name] = slot;
      }
      row[offset + perfLiveFields.length + slot] = perfBucketsRaw[name];
    }
    // Interval describes the gap BEFORE this callback. Preserve its predecessor
    // instead of attributing it to CPU work that has not happened yet.
    var severity = Math.max(row[offset + 33] ? interval : 0, active ? cpu : 0);
    var newWorst = !perfLive.worst || severity > perfLive.worst.severity;
    if (!perfLive.saving && active && perfLive.issueReadyAt !== null && severity > perfLiveBudget * 1.5 &&
        (newWorst || severity >= 25)) {
      var kind = cpu > (row[offset + 33] ? interval : 0) ? 'cpu' : 'gap';
      var referenceEnd = kind === 'gap' && perfLive.previous !== null ? row[perfLive.previous * perfLiveStride] : time;
      var event = { frameId: perfLive.frameId, at: time, severity: severity,
        kind: kind,
        gapMs: row[offset + 33] ? interval : null, reference: perfLiveReference(referenceEnd), current: perfLiveRow(perfLive.write),
        previous: perfLive.previous !== null ? perfLiveRow(perfLive.previous) : null };
      perfLive.gpu.forEach(function (r) { perfLiveAttach(event, r, false); });
      perfLive.workload.forEach(function (r) { perfLiveAttach(event, r, true); });
      if (newWorst) perfLive.worst = event;
      if (severity >= 25) perfLiveRememberIssue(event);
      if (kind === 'gap' && cpu >= 25) {
        // The callback after a long arrival can also contain an independent
        // CPU stall. Retain both measurements instead of losing the smaller.
        var cpuEvent = { frameId: perfLive.frameId, at: time, severity: cpu, kind: 'cpu',
          gapMs: row[offset + 33] ? interval : null, reference: perfLiveReference(time),
          current: event.current, previous: event.previous };
        perfLive.gpu.forEach(function (r) { perfLiveAttach(cpuEvent, r, false); });
        perfLive.workload.forEach(function (r) { perfLiveAttach(cpuEvent, r, true); });
        perfLiveRememberIssue(cpuEvent);
      }
    }
    perfLive.previous = active ? perfLive.write : null; perfLive.interrupted = !active;
    perfLive.write = (perfLive.write + 1) % perfLive.capacity;
    perfLive.count = Math.min(perfLive.capacity, perfLive.count + 1);
    while (perfLive.count && row[((perfLive.write - perfLive.count + perfLive.capacity) % perfLive.capacity) * perfLiveStride] < time - 30000) perfLive.count--;
    var paintedMs = 0;
    if (performance.now() - perfLive.collectAt >= 200) {
      perfLive.collectAt = performance.now(); perfLiveGPUCollect();
      if (typeof perfPanelPaint === 'function') {
        var paintAt = performance.now(); perfPanelPaint(); paintedMs = performance.now() - paintAt;
      }
    }
    row[offset + 32] = Math.max(0, performance.now() - t0 - paintedMs);
    perfLive.observerMs = perfLive.observerMs * 0.9 + row[offset + 32] * 0.1;
    if (perfLive.worst && perfLive.worst.frameId === perfLive.frameId) perfLive.worst.current.observerMs = row[offset + 32];
  }
  function perfLivePin() {
    perfLive.pinned = perfLive.worst;
    perfLive.gpu.forEach(function (r) { perfLiveAttach(perfLive.pinned, r, false); });
    perfLive.workload.forEach(function (r) { perfLiveAttach(perfLive.pinned, r, true); });
    if (typeof perfPanelPaint === 'function') perfPanelPaint();
    return perfLive.pinned;
  }
  function perfLiveClearPin() {
    perfLive.pinned = null; perfLive.worst = null;
    if (typeof perfPanelPaint === 'function') perfPanelPaint();
  }
  function perfLiveSnapshot() {
    if (!perfLive.count) return null;
    return perfLiveRow((perfLive.write - 1 + perfLive.capacity) % perfLive.capacity);
  }
  function perfLiveStatus() {
    return { enabled: perfLive.enabled, frameId: perfLive.frameId, frames: perfLive.count,
      paused: gamePaused || mobileLandscapeBlocked, visible: !document.hidden, loading: introPhase !== 'done',
      lastFrameAgeMs: perfLive.count ? performance.now() - perfLive.data[((perfLive.write - 1 + perfLive.capacity) % perfLive.capacity) * perfLiveStride] : null,
      seconds: perfLive.count ? Math.min(30, (performance.now() - perfLive.data[((perfLive.write - perfLive.count + perfLive.capacity) % perfLive.capacity) * perfLiveStride]) / 1000) : 0,
      worst: perfLive.pinned || perfLive.worst, pinned: !!perfLive.pinned,
      issues: perfLiveIssueList(), selectedIssue: perfLive.selectedIssue, inspection: perfLiveGetSelectedIssue(),
      observerMs: perfLive.observerMs, paintMs: perfLive.paintMs,
      gpuStatus: window.__sluiceGPUTrace ? window.__sluiceGPUTrace.status() : null,
      gpu: Object.keys(perfLive.latestGPU).map(function (key) { return perfLive.latestGPU[key]; }),
      workload: liquidWGPU && liquidWGPU.getDiagnostics ? liquidWGPU.getDiagnostics() : null };
  }
  function perfLiveCapture() {
    if (!perfLive.count) return null;
    var captureAt = performance.now();
    var first = (perfLive.write - perfLive.count + perfLive.capacity) % perfLive.capacity;
    var started = perfLive.data[first * perfLiveStride], chunks = [], columns = perfLiveFields.slice();
    for (var i = 0; i < playPerfBucketLimit; i++) columns.push(perfLive.buckets[i] ? 'cpu.' + perfLive.buckets[i] : null);
    for (i = 0; i < perfLive.count; i += playPerfChunkSize) {
      var n = Math.min(playPerfChunkSize, perfLive.count - i), chunk = new Float32Array(n * perfLiveStride);
      for (var j = 0; j < n; j++) {
        var source = ((first + i + j) % perfLive.capacity) * perfLiveStride;
        chunk.set(perfLive.data.subarray(source, source + perfLiveStride), j * perfLiveStride);
        chunk[j * perfLiveStride] -= started;
      }
      chunks.push(Array.from(chunk));
    }
    var ended = perfLive.data[((perfLive.write - 1 + perfLive.capacity) % perfLive.capacity) * perfLiveStride];
    var event = perfLive.pinned || perfLive.worst;
    event = perfLiveExportEvent(event, started);
    var gpu = perfLive.gpu.filter(function (r) { return r.at >= started && r.at <= ended; }).map(function (r) { return Object.assign({}, r, { atMs: r.at - started }); });
    var capture = { schema: 'sluice-performance-1', version: GAME_VERSION,
      startedUTC: new Date(performance.timeOrigin + started).toISOString(), durationMs: ended - started,
      reason: 'Last 30 seconds', metadata: { rolling: true, targetFPS: perfLiveTargetFPS,
        url: location.href, userAgent: navigator.userAgent,
        options: window.SluiceOptions || null, lastState: playPerfState(),
        notes: ['Callback intervals describe arrival gaps, not displayed frames.',
          'CPU buckets overlap. Exclusive phase rows replace parents with their children.',
          'GPU rows and workload samples match only when frameId matches.',
          'GPU pass timings exclude WebGL and composition; never add CPU and GPU times.',
          'Particle counts use an asynchronous mirror. Export itself can affect play.'] },
      initialState: null, initialSavedGame: null, frameCount: perfLive.count,
      columns: columns, stride: perfLiveStride, frameChunks: chunks, seconds: [],
      events: perfLive.events.filter(function (r) { return r.at >= started && r.at <= ended; }).map(function (r) { return { atMs: r.at - started, kind: r.kind, detail: r.detail }; }),
      gpu: gpu, gpuStatus: window.__sluiceGPUTrace ? window.__sluiceGPUTrace.status() : null,
      workload: perfLive.workload.filter(function (r) { return r.at >= started && r.at <= ended; }).map(function (r) { return Object.assign({}, r, { pageAtMs: r.atMs, atMs: r.at - started, pageCompletedAtMs: r.completedAtMs, completedAtMs: r.completedAtMs - started }); }),
      slowdown: event, issues: perfLiveIssueList().map(function (issue) { return perfLiveExportIssue(issue, started); }),
      selectedIssue: perfLiveExportIssue(perfLiveGetSelectedIssue(), started),
      droppedEvents: 0, droppedGPU: 0, droppedBuckets: perfLive.droppedBuckets,
      observer: { frameMs: perfLive.observerMs, panelPaintMs: perfLive.paintMs, exportSnapshotMs: performance.now() - captureAt } };
    return capture;
  }
  function perfLiveDownload() {
    if (perfLive.saving || !perfLive.count) return;
    perfLive.saving = true;
    function finish(error) {
      perfLive.saving = false;
      if (error) { perfLiveEvent('export-error', { message: String(error) }); console.warn('Performance export failed:', error); }
      perfPanelPaint();
    }
    // Snapshot after the click; serialize in chunks between game callbacks.
    setTimeout(function () {
      try {
        var capture = perfLiveCapture();
        if (!capture) { finish(); return; }
        var chunks = capture.frameChunks; delete capture.frameChunks;
        var parts = [JSON.stringify(capture).slice(0, -1) + ',"frameChunks":['], index = 0;
        function next() {
          try {
            if (index < chunks.length) {
              if (index) parts.push(','); parts.push(JSON.stringify(chunks[index++]));
              setTimeout(next, 0); return;
            }
            parts.push(']}');
            var url = URL.createObjectURL(new Blob(parts, { type: 'application/json' })), link = document.createElement('a');
            link.href = url; link.download = 'sluice-last30-' + GAME_VERSION + '-' + capture.startedUTC.replace(/[:.]/g, '-') + '.json';
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            finish();
          } catch (e) { finish(e); }
        }
        next();
      } catch (e) { finish(e); }
    }, 0);
  }
  Object.assign(window.__sluicePerformance, { liveStatus: perfLiveStatus, liveSnapshot: perfLiveSnapshot,
    rollingCapture: perfLiveCapture, pin: perfLivePin, clearPin: perfLiveClearPin, saveRecent: perfLiveDownload });
