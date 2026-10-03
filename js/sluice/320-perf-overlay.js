  /* Compact live evidence. Detailed inventories stay behind one button. */
  var perfPanel = null;
  function perfPanelSync() {
    if (!perfPanel) return;
    if (perfPanel.root.hidden === perfLive.enabled) perfPanel.root.hidden = !perfLive.enabled;
    if (perfLive.enabled && playPerfUI && playPerfUI.root.parentNode !== perfPanel.details) {
      perfPanel.details.appendChild(playPerfUI.root); playPerfUI.root.hidden = false;
    } else if (!perfLive.enabled && playPerfUI && playPerfUI.root.parentNode === perfPanel.details) {
      perfPanel.root.parentNode.appendChild(playPerfUI.root);
      playPerfUI.root.hidden = !playPerfActive;
    }
  }
  function drawPerfOverlay() {
    // The DOM panel paints at 5 Hz after the measured game call. No full-height
    // bitmap blit, layout or text sorting on each rendered frame.
  }
  function perfPanelText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }
  function perfPanelName(name) {
    var names = { 'update.jello': 'Slime solver', 'update.fluidSkin': 'Slime fluid skin',
      'update.residents': 'Slime movement', 'update.liquids': 'Liquid submission',
      'snow.cpu': 'Snow CPU', 'update.rain': 'Rain bookkeeping',
      'other game work': 'Other game work', 'render.HUD': 'HUD',
      'update.main': 'Rig update', 'update.aux': 'Camera / auxiliary' };
    return names[name] || name.replace(/^update\./, '').replace(/^render\./, 'Draw ').replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  function perfPanelList(node, rows, limit, formatter) {
    while (node.children.length > rows.length || node.children.length > limit) node.lastChild.remove();
    for (var i = 0; i < rows.length && i < limit; i++) {
      var item = node.children[i];
      if (!item) { item = document.createElement('li'); node.appendChild(item); }
      perfPanelText(item, formatter(rows[i]));
    }
  }
  function perfPanelWindow(now) {
    var raw = {}, intervals = [], cpu = 0, count = 0;
    for (var i = 0; i < perfLive.count; i++) {
      var index = (perfLive.write - 1 - i + perfLive.capacity) % perfLive.capacity;
      var offset = index * perfLiveStride, data = perfLive.data;
      if (data[offset] < now - 1000) break;
      if (!data[offset + 33]) continue;
      cpu += data[offset + 3]; intervals.push(data[offset + 1]); count++;
      for (var j = 0; j < perfLive.buckets.length; j++) {
        var name = perfLive.buckets[j]; raw[name] = (raw[name] || 0) + data[offset + perfLiveFields.length + j];
      }
    }
    for (var key in raw) raw[key] /= count || 1;
    intervals.sort(function (a, b) { return a - b; });
    var sum = 0; for (i = 0; i < intervals.length; i++) sum += intervals[i];
    return { cpu: cpu / (count || 1), fps: sum ? 1000 * count / sum : 0,
      p99: intervals.length ? intervals[Math.min(intervals.length - 1, Math.ceil(intervals.length * 0.99) - 1)] : 0,
      raw: raw, phases: perfLivePhases(raw, cpu / (count || 1)), frames: count };
  }
  function perfPanelGPU(row) {
    var totals = {}, result = [];
    for (var i = 0; i < row.passes.length; i++) {
      var pass = row.passes[i]; if (pass.emptyTimestamp) continue;
      totals[pass.name] = (totals[pass.name] || 0) + pass.ms;
    }
    for (var name in totals) result.push({ name: name, ms: totals[name] });
    result.sort(function (a, b) { return b.ms - a.ms; }); return result;
  }
  function perfPanelGraph(now) {
    var canvasGraph = perfPanel.graph, width = Math.max(1, Math.round(canvasGraph.clientWidth));
    var scale = Math.min(2, window.devicePixelRatio || 1), height = 48;
    if (canvasGraph.width !== width * scale || canvasGraph.height !== height * scale) {
      canvasGraph.width = width * scale; canvasGraph.height = height * scale;
    }
    var c = canvasGraph.getContext('2d'); c.setTransform(scale, 0, 0, scale, 0, 0); c.clearRect(0, 0, width, height);
    var bins = 200, gaps = new Float32Array(bins), costs = new Float32Array(bins), max = 25;
    for (var i = 0; i < perfLive.count; i++) {
      var index = (perfLive.write - 1 - i + perfLive.capacity) % perfLive.capacity, offset = index * perfLiveStride;
      var at = perfLive.data[offset]; if (at < now - 20000) break;
      if (!perfLive.data[offset + 33]) continue;
      var bin = Math.min(bins - 1, Math.max(0, Math.floor((at - now + 20000) / 100)));
      gaps[bin] = Math.max(gaps[bin], perfLive.data[offset + 1]);
      costs[bin] = Math.max(costs[bin], perfLive.data[offset + 3]);
      max = Math.max(max, gaps[bin], costs[bin]);
    }
    var colors = perfPanel.colors;
    for (i = 0; i < bins; i++) {
      var h = gaps[i] / max * (height - 2);
      c.fillStyle = gaps[i] > perfLiveBudget * 1.15 ? colors.warn : colors.dim;
      c.fillRect(i * width / bins, height - h, Math.max(1, width / bins), h);
    }
    c.strokeStyle = colors.text; c.beginPath();
    for (i = 0; i < bins; i++) {
      var y = height - costs[i] / max * (height - 2);
      if (!i) c.moveTo(0, y); else c.lineTo(i * width / bins, y);
    }
    c.stroke(); c.strokeStyle = colors.gold; c.setLineDash([3, 3]); c.beginPath();
    var budgetY = height - perfLiveBudget / max * (height - 2);
    c.moveTo(0, budgetY); c.lineTo(width, budgetY); c.stroke(); c.setLineDash([]);
    perfPanelText(perfPanel.graphScale, '20s · gap bars / CPU line · max ' + max.toFixed(0) + ' ms');
  }
  function perfPanelPaint() {
    if (!perfPanel || !perfLive.enabled || !perfLive.count) return;
    var t0 = performance.now(), snapshot = perfLiveSnapshot(), stats = perfPanelWindow(t0);
    perfPanelText(perfPanel.fps, stats.fps ? Math.round(stats.fps) + ' FPS' : 'Waiting for play');
    perfPanel.fps.classList.toggle('perf-over-budget', !!stats.frames && stats.fps < 114);
    var context = gamePaused || mobileLandscapeBlocked ? 'Paused' : document.hidden ? 'Hidden tab' : snapshot.view ? 'Menu / loading' : 'Target 120 FPS · 8.33 ms';
    perfPanelText(perfPanel.budget, context + (playPerfActive ? ' · recording' : ''));
    perfPanelText(perfPanel.cpu, stats.cpu.toFixed(2) + ' ms CPU · ' + stats.p99.toFixed(1) + ' ms p99 gap');
    perfPanelList(perfPanel.cpuRows, stats.phases, 3, function (r) { return perfPanelName(r.name) + '  ' + r.ms.toFixed(2) + ' ms'; });
    perfPanelText(perfPanel.load, Math.round(snapshot.snowActive).toLocaleString() + ' snow active · ' + snapshot.awakeResidents + '/' + snapshot.residents + ' slimes awake');
    perfPanelText(perfPanel.steps, snapshot.microsteps + ' microsteps · ' + snapshot.contacts + ' contacts · mirror lag ' + (snapshot.readbackAgeMs < 0 ? 'unavailable' : Math.round(snapshot.readbackAgeMs) + ' ms'));
    var source = window.__sluiceGPUTrace, status = source ? source.status() : null, liquidRow = null;
    for (var name in perfLive.latestGPU) if (name === 'liquid.frame') liquidRow = perfLive.latestGPU[name];
    if (liquidRow) {
      var age = t0 - liquidRow.at;
      perfPanelText(perfPanel.gpu, 'Liquid GPU sample ' + liquidRow.ms.toFixed(2) + ' ms · #' + liquidRow.frameId + ' · ' + (age / 1000).toFixed(1) + ' s old' + (liquidRow.partial ? ' · partial' : '') + (age > 3000 ? ' · stale' : ''));
      perfPanelList(perfPanel.gpuRows, perfPanelGPU(liquidRow), 2, function (r) { return r.name + '  ' + r.ms.toFixed(2) + ' ms'; });
    } else {
      perfPanelText(perfPanel.gpu, status && status.supported ? 'GPU sample pending' : 'GPU timestamps unavailable');
      perfPanelList(perfPanel.gpuRows, [], 0, function () { return ''; });
    }
    var workload = liquidWGPU && liquidWGPU.getDiagnostics ? liquidWGPU.getDiagnostics() : null;
    if (workload && workload.atMs !== undefined) {
      var matched = liquidRow && liquidRow.frameId === workload.frameId;
      perfPanelText(perfPanel.queues, 'Snow queues ' + workload.snowGuestPeak + ' guest / ' + workload.snowFallbackPeak + ' escape peak · #' + workload.frameId + ' · ' + ((workload.ageMs || 0) / 1000).toFixed(1) + ' s old' + (matched ? ' · GPU matched' : ' · separate sample') + (workload.valid ? '' : ' · stale / partial'));
      perfPanel.queues.title = 'Peak particles in one collision batch, not unique particles across the frame. ' + workload.snowCollisionBatches + ' snow batches; ' + workload.snowGuestTotal + ' guest visits; ' + workload.snowFallbackTotal + ' escape visits. Age ' + Math.round(workload.ageMs || 0) + ' ms.';
    } else perfPanelText(perfPanel.queues, 'Snow collision queues pending');
    var event = perfLive.pinned || perfLive.worst;
    if (event) {
      var previous = event.previous;
      perfPanelText(perfPanel.spike, (perfLive.pinned ? 'Pinned ' : 'Worst ') + '#' + event.frameId + ': ' + (event.kind === 'cpu' ? event.current.cpuMs.toFixed(1) + ' ms CPU' : event.gapMs.toFixed(1) + ' ms arrival gap'));
      var frame = event.kind === 'gap' && previous ? previous : event.current;
      var row = frame.phases[0];
      perfPanelText(perfPanel.spikeCost, '#' + frame.frameId + ' CPU ' + frame.cpuMs.toFixed(2) + ' ms' + (row ? ' · ' + perfPanelName(row.name) + ' ' + row.ms.toFixed(2) + ' ms' : ''));
      var change = event.reference && event.reference.frames ? frame.cpuMs - event.reference.cpuMs : null;
      perfPanelText(perfPanel.spikeLoad, Math.round(frame.snowActive).toLocaleString() + ' snow · ' + frame.awakeResidents + ' awake slimes · ' + frame.microsteps + ' microsteps' + (change === null ? '' : ' · CPU ' + (change >= 0 ? '+' : '') + change.toFixed(2) + ' ms vs prior second'));
      perfPanel.clear.hidden = false;
    } else {
      perfPanelText(perfPanel.spike, 'No slowdown pinned');
      perfPanelText(perfPanel.spikeCost, 'Worst spike stays here until cleared.');
      perfPanelText(perfPanel.spikeLoad, '');
      perfPanel.clear.hidden = true;
    }
    perfPanel.pin.disabled = !event; perfPanel.save.disabled = perfLive.saving || !perfLive.count;
    perfPanelText(perfPanel.save, perfLive.saving ? 'Saving' : 'Save 30s');
    perfPanel.pin.textContent = perfLive.pinned ? 'Pinned' : 'Pin worst';
    perfPanelGraph(t0);
    if (perfLive.details) perfPanelPaintDetails(snapshot, stats, workload);
    perfPanelText(perfPanel.live, JSON.stringify({ version: GAME_VERSION, frameId: snapshot.frameId,
      fps: stats.fps, cpuMs: stats.cpu, p99GapMs: stats.p99, state: snapshot,
      worst: event, pinned: !!perfLive.pinned, gpu: liquidRow, workload: workload,
      observerMs: perfLive.observerMs, paintMs: perfLive.paintMs }));
    perfLive.paintMs = performance.now() - t0;
  }
  function perfPanelPaintDetails(snapshot, stats, workload) {
    var rows = [];
    rows.push('Build ' + GAME_VERSION + ' · callback target 120 FPS');
    rows.push('Panel observer ' + perfLive.observerMs.toFixed(3) + ' ms/frame; last paint ' + perfLive.paintMs.toFixed(2) + ' ms (5 Hz). GPU timestamp overhead is separate.');
    rows.push('Visible residents ' + snapshot.visibleResidents + '; outer ticks ' + snapshot.outerTicks + '; terrain rebuilds ' + snapshot.terrainRebuilds);
    rows.push('Snow ' + snapshot.snowAirborne + ' airborne / ' + snapshot.snowParked + ' parked; shared liquid storage ' + snapshot.liquids);
    rows.push('CPU phase means, last active second. These rows are disjoint.');
    stats.phases.forEach(function (r) { rows.push(perfPanelName(r.name) + ': ' + r.ms.toFixed(3) + ' ms'); });
    rows.push('Slime solver children (already inside Slime solver):');
    ['jello.internal', 'jello.contact', 'jello.tail'].forEach(function (key) { rows.push(key + ': ' + (stats.raw[key] || 0).toFixed(3) + ' ms'); });
    rows.push('Snow CPU children (already inside Snow CPU):');
    ['snow.airCPU', 'snow.scanCPU', 'snow.supportCPU', 'snow.flakesCPU'].forEach(function (key) { rows.push(key + ': ' + (stats.raw[key] || 0).toFixed(3) + ' ms'); });
    var event = perfLive.pinned || perfLive.worst;
    if (event) {
      var frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
      rows.push((perfLive.pinned ? 'Pinned' : 'Worst') + ' event #' + event.frameId + ', ' + ((performance.now() - event.at) / 1000).toFixed(1) + ' s ago. CPU frame #' + frame.frameId + ':');
      frame.phases.forEach(function (r) { rows.push(perfPanelName(r.name) + ': ' + r.ms.toFixed(3) + ' ms'); });
      if (event.reference && event.reference.frames) rows.push('Prior-second means: CPU ' + event.reference.cpuMs.toFixed(2) + ' ms; snow ' + Math.round(event.reference.snowActive) + '; awake slimes ' + event.reference.awakeResidents.toFixed(1) + '; microsteps ' + event.reference.microsteps.toFixed(1));
      var matched = event.gpu || perfLive.gpu.filter(function (r) { return r.frameId === frame.frameId; });
      rows.push(matched.length ? 'GPU samples for this CPU frame:' : 'No GPU timestamp sample for this exact CPU frame.');
      matched.forEach(function (r) { rows.push(r.name + ': ' + r.ms.toFixed(3) + ' ms' + (r.partial ? ' (partial)' : '')); perfPanelGPU(r).forEach(function (p) { rows.push('  ' + p.name + ': ' + p.ms.toFixed(3) + ' ms'); }); });
    }
    rows.push('GPU sampled passes exclude WebGL and browser composition. CPU and GPU overlap; do not add them.');
    for (var name in perfLive.latestGPU) {
      var gpu = perfLive.latestGPU[name];
      rows.push(name + ' #' + gpu.frameId + ': ' + gpu.ms.toFixed(3) + ' ms; ' + ((performance.now() - gpu.at) / 1000).toFixed(1) + ' s old' + (gpu.partial ? '; partial' : ''));
    }
    if (workload && workload.atMs !== undefined) rows.push('Queue visits #' + workload.frameId + ': snow guest ' + workload.snowGuestTotal + ', snow escape ' + workload.snowFallbackTotal + ', liquid escape ' + workload.liquidFallbackTotal + '; ' + workload.collisionBatches + ' batches; ' + workload.copyBytes + ' bytes copied. Visits repeat across substeps.');
    var springs = 0, triangles = 0;
    for (var i = 0; i < jelloBodies.length; i++) { springs += jelloBodies[i].springN || 0; triangles += jelloBodies[i].triN || 0; }
    rows.push('Slime mesh: ' + jelloBodies.length + ' bodies / ' + jelloCount + ' points / ' + springs + ' springs / ' + triangles + ' triangles');
    rows.push('Backends: liquid ' + (liquidWGPU && liquidWGPU.simActive ? 'WebGPU' : 'unavailable / diagnostic CPU') + '; smoke ' + (smokeWGPUDriving ? 'WebGPU' : smokeFluidActive ? 'WebGL' : 'Canvas') + '; jello ' + JELLO_SOLVER);
    rows.push('Canvas ' + canvas.width + ' x ' + canvas.height + '; DPR ' + dpr.toFixed(2) + '; zoom ' + worldScale.toFixed(2));
    rows.push('Terrain cache ' + Object.keys(terrainChunkCache).length + '/' + terrainChunkCacheLimit());
    if (performance.memory) rows.push('Heap ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB used / ' + Math.round(performance.memory.totalJSHeapSize / 1048576) + ' MB allocated');
    rows.push('Isolation ' + PERF_ISO_NAMES[perfIso] + '; smoke idle skip ' + PERF_SMOKE_IDLE_SKIP + '; obstacle dirty ' + PERF_SMOKE_OBSTACLE_DIRTY);
    rows.push('Keys: F9 record/save; H isolate; K smoke options; [ / ] A/B snapshots; O flight benchmark; L tuning; G synchronous WebGL probe (changes timing).');
    rows.push('A/B snapshots use different live states, not a controlled causal test.');
    if (perfAB.a || perfAB.b) rows.push('A/B snapshots: ' + JSON.stringify(perfAB));
    if (benchState.running) rows.push('Flight benchmark running.');
    if (window.SluiceAudio && window.SluiceAudio.nowPlaying) {
      var music = window.SluiceAudio.nowPlaying();
      if (music) rows.push('Audio: ' + JSON.stringify(music));
    }
    perfPanelText(perfPanel.detailText, rows.join('\n'));
  }
  (function () {
    var root = document.getElementById('gm-perf-panel'); if (!root) return;
    function node(id) { return document.getElementById('gm-perf-' + id); }
    perfPanel = { root: root, fps: node('fps'), budget: node('budget'), cpu: node('cpu'),
      cpuRows: node('cpu-rows'), gpu: node('gpu'), gpuRows: node('gpu-rows'),
      load: node('load'), steps: node('steps'), queues: node('queues'),
      graph: node('graph'), graphScale: node('graph-scale'),
      spike: node('spike'), spikeCost: node('spike-cost'), spikeLoad: node('spike-load'),
      pin: node('pin'), save: node('save'), clear: node('clear'), detailsButton: node('details'),
      details: node('detail-body'), detailText: node('detail-text'), live: node('diagnostics-live') };
    var style = getComputedStyle(root);
    perfPanel.colors = { text: style.getPropertyValue('--d-text').trim() || '#e8e2d6',
      dim: style.getPropertyValue('--d-text-dim').trim() || '#b8b2a2',
      gold: style.getPropertyValue('--d-accent').trim() || '#d4c4a0',
      warn: style.getPropertyValue('--d-warn').trim() || '#d99090' };
    perfPanel.pin.addEventListener('click', perfLivePin);
    perfPanel.save.addEventListener('click', perfLiveDownload);
    perfPanel.clear.addEventListener('click', perfLiveClearPin);
    perfPanel.detailsButton.addEventListener('click', function () {
      perfLive.details = !perfLive.details; perfPanel.details.hidden = !perfLive.details;
      perfPanel.detailsButton.setAttribute('aria-expanded', String(perfLive.details));
      perfPanelPaint();
    });
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'keydown'].forEach(function (kind) {
      root.addEventListener(kind, function (e) {
        if (kind === 'keydown' && (e.key === 'F9' || e.key === 'Escape' || e.key === '`')) return;
        e.stopPropagation();
      });
    });
    root.addEventListener('click', function () { try { canvas.focus({ preventScroll: true }); } catch (e) {} });
  })();

  // Shop layout constants (kept in sync with handleShopClick).
  var SHOP_LAYOUT = {
    boxW: 0, boxX: 0, boxY: 0, boxH: 0,
    sellY: 0, refuelY: 0, itemsStartY: 0, itemH: 0
  };
