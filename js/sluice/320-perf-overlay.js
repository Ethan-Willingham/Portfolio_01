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
  function perfPanelPaintIssues(issues) {
    var list = perfPanel.issues, nodes = perfPanel.issueNodes, kept = {};
    var focusedIssue = document.activeElement;
    if (!focusedIssue || focusedIssue.parentNode !== list) focusedIssue = null;
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i], item = nodes[issue.id]; kept[issue.id] = true;
      if (!item) {
        item = document.createElement('button'); item.type = 'button'; item.className = 'gm-perf-issue';
        ['title', 'severity', 'note'].forEach(function (name) {
          var span = document.createElement('span'); span.className = 'gm-perf-issue-' + name; item.appendChild(span);
        });
        item.setAttribute('data-perf-issue', issue.id); nodes[issue.id] = item;
      }
      // A button keeps its category identity when the severity ordering changes.
      if (list.children[i] !== item) list.insertBefore(item, list.children[i] || null);
      item.setAttribute('data-major', issue.severity >= 50 ? 'critical' : 'major');
      item.setAttribute('aria-pressed', String(perfLive.selectedIssue === issue.id));
      perfPanelText(item.children[0], issue.title);
      perfPanelText(item.children[1], issue.severity >= 50 ? 'Critical' : 'Major');
      var metric = issue.kind === 'gpu' ? 'GPU' : issue.kind === 'gap' ? 'gap' : 'CPU';
      perfPanelText(item.children[2], issue.severity.toFixed(1) + ' ms ' + metric + ' worst · ' + issue.occurrences + ' flagged ' + (issue.occurrences === 1 ? 'frame' : 'frames'));
    }
    for (var id in nodes) if (!kept[id]) { nodes[id].remove(); delete nodes[id]; }
    // Chromium can drop focus when an existing button moves in the DOM.
    if (focusedIssue && focusedIssue.isConnected && document.activeElement !== focusedIssue) focusedIssue.focus({ preventScroll: true });
    perfPanelText(perfPanel.issueCount, String(issues.length));
    perfPanel.issueEmpty.hidden = !!issues.length;
    perfPanel.clear.disabled = !issues.length;
  }
  function perfPanelPaintRaw(snapshot, stats, workload, liquidRow, status, event, selected) {
    perfPanelText(perfPanel.cpu, (selected ? 'Recorded frame: ' : 'Live: ') + stats.cpu.toFixed(2) + ' ms CPU · ' + stats.p99.toFixed(1) + ' ms ' + (selected ? 'gap' : 'p99 gap'));
    perfPanelList(perfPanel.cpuRows, stats.phases, 3, function (r) { return perfPanelName(r.name) + '  ' + r.ms.toFixed(2) + ' ms'; });
    perfPanelText(perfPanel.load, Math.round(snapshot.snowActive).toLocaleString() + ' snow active · ' + snapshot.awakeResidents + '/' + snapshot.residents + ' slimes awake');
    perfPanelText(perfPanel.steps, snapshot.microsteps + ' microsteps · ' + snapshot.contacts + ' contacts · mirror simulation lag ' + (snapshot.readbackAgeMs < 0 ? 'unavailable' : Math.round(snapshot.readbackAgeMs) + ' ms'));
    if (liquidRow) {
      var age = performance.now() - liquidRow.at;
      perfPanelText(perfPanel.gpu, 'Liquid GPU sample ' + liquidRow.ms.toFixed(2) + ' ms · #' + liquidRow.frameId +
        (selected ? ' · recorded frame' : ' · ' + (age / 1000).toFixed(1) + ' s old') +
        (liquidRow.partial ? ' · partial' : '') + (!selected && age > 3000 ? ' · stale' : ''));
      perfPanelList(perfPanel.gpuRows, perfPanelGPU(liquidRow), 2, function (r) { return r.name + '  ' + r.ms.toFixed(2) + ' ms'; });
    } else {
      perfPanelText(perfPanel.gpu, selected ? 'No GPU timestamp sample for this recorded frame.' : status && status.supported ? 'GPU sample pending' : 'GPU timestamps unavailable');
      perfPanelList(perfPanel.gpuRows, [], 0, function () { return ''; });
    }
    if (workload && workload.atMs !== undefined) {
      var matched = liquidRow && liquidRow.frameId === workload.frameId;
      perfPanelText(perfPanel.queues, 'Snow queues ' + workload.snowGuestPeak + ' guest / ' + workload.snowFallbackPeak + ' escape peak · #' + workload.frameId +
        (selected ? ' · recorded frame' : ' · ' + ((workload.ageMs || 0) / 1000).toFixed(1) + ' s old') +
        (matched ? ' · GPU matched' : ' · separate sample') + (workload.partial || (!selected && !workload.valid) ? ' · stale / partial' : ''));
      perfPanel.queues.title = 'Peak particles in one collision batch, not unique particles across the frame. ' + workload.snowCollisionBatches + ' snow batches; ' + workload.snowGuestTotal + ' guest visits; ' + workload.snowFallbackTotal + ' escape visits.';
    } else perfPanelText(perfPanel.queues, selected ? 'No collision queue sample for this recorded frame.' : 'Snow collision queues pending');
    if (event) {
      var frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
      var row = frame.phases[0];
      perfPanelText(perfPanel.spike, (selected ? 'Inspected' : 'Worst') + ' event #' + event.frameId + ': ' + event.severity.toFixed(1) + ' ms');
      perfPanelText(perfPanel.spikeCost, '#' + frame.frameId + ' CPU ' + frame.cpuMs.toFixed(2) + ' ms' + (row ? ' · ' + perfPanelName(row.name) + ' ' + row.ms.toFixed(2) + ' ms' : ''));
      perfPanelText(perfPanel.spikeLoad, Math.round(frame.snowActive).toLocaleString() + ' snow · ' + frame.awakeResidents + ' awake slimes · ' + frame.microsteps + ' microsteps');
    } else {
      perfPanelText(perfPanel.spike, 'No major issue recorded'); perfPanelText(perfPanel.spikeCost, ''); perfPanelText(perfPanel.spikeLoad, '');
    }
    perfPanelGraph(performance.now());
    perfPanelPaintDetails(snapshot, stats, workload, event, selected);
  }
  function perfPanelPaint() {
    if (!perfPanel || !perfLive.enabled || !perfLive.count) return;
    var t0 = performance.now(), snapshot = perfLiveSnapshot(), stats = perfPanelWindow(t0);
    var issues = perfLiveIssueList(), selected = perfLiveGetSelectedIssue();
    var paused = gamePaused || mobileLandscapeBlocked, inactive = paused || document.hidden || snapshot.view;
    perfPanelText(perfPanel.fps, paused ? 'Paused' : stats.fps ? Math.round(stats.fps) + ' FPS' : 'Waiting');
    perfPanel.fps.classList.toggle('perf-over-budget', !inactive && !!stats.frames && stats.fps < perfLiveTargetFPS * 0.95);
    perfPanel.fps.classList.toggle('perf-critical', !inactive && !!stats.frames && stats.fps < 60);
    perfPanelText(perfPanel.budget, (selected ? 'Saved issue' : paused ? 'Capture paused' : document.hidden ? 'Hidden tab' : snapshot.view ? 'Menu / loading' : 'Target ' + perfLiveTargetFPS + ' FPS') + (playPerfActive ? ' · recording' : ''));
    var explanation = perfLiveLiveDiagnosis(stats);
    if (inactive) explanation = { title: paused ? 'Capture paused' : document.hidden ? 'Tab hidden' : 'Waiting for gameplay',
      summary: 'Saved issues remain available. Live measurements continue when you return to play.', certainty: 'Not measuring play', evidence: [] };
    perfPanelText(perfPanel.diagnosis, explanation.title);
    perfPanelText(perfPanel.summary, explanation.summary);
    perfPanelText(perfPanel.certainty, explanation.certainty);
    perfPanel.liveView.hidden = !!selected; perfPanel.inspection.hidden = !selected;
    perfPanel.root.setAttribute('data-perf-view', selected ? 'issue' : 'live');
    var event = selected ? selected.event : perfLive.pinned || perfLive.worst, inspected = null, frame = null;
    if (selected && event) {
      frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
      inspected = perfLiveExplainIssue(event);
      perfPanel.inspection.setAttribute('data-perf-issue', selected.id);
      perfPanelText(perfPanel.inspectionTitle, selected.title);
      perfPanelText(perfPanel.inspectionSummary, inspected.summary);
      perfPanelText(perfPanel.inspectionCertainty, inspected.certainty);
      perfPanelText(perfPanel.inspectionMeta, 'Worst recorded: ' + selected.severity.toFixed(1) + ' ms. Game CPU: ' + frame.cpuMs.toFixed(1) + ' ms. Retained for this session.');
    } else perfPanel.inspection.removeAttribute('data-perf-issue');
    perfPanelPaintIssues(issues);
    perfPanel.save.disabled = perfLive.saving || !perfLive.count;
    perfPanelText(perfPanel.save, perfLive.saving ? 'Saving' : 'Save 30s');
    if (perfLive.details) {
      perfPanel.inspectionEvidence.hidden = !selected;
      perfPanelList(perfPanel.inspectionEvidence, inspected ? inspected.evidence : [], 8, function (r) { return r; });
      var rawStats = selected ? { cpu: frame.cpuMs, p99: event.gapMs || frame.intervalMs || 0,
        raw: frame.buckets || {}, phases: frame.phases || [], frames: 1 } : stats;
      var liquidRow = selected ? (event.gpu || []).filter(function (r) { return r.name === 'liquid.frame' && r.frameId === frame.frameId; })[0] : perfLive.latestGPU['liquid.frame'];
      var workload = selected ? event.workload || null : liquidWGPU && liquidWGPU.getDiagnostics ? liquidWGPU.getDiagnostics() : null;
      perfPanelPaintRaw(selected ? frame : snapshot, rawStats, workload, liquidRow,
        window.__sluiceGPUTrace ? window.__sluiceGPUTrace.status() : null, event, !!selected);
    }
    // Machine-readable live context stays small. Full recorded frames and GPU
    // pass inventories are available only when Details is opened or exported.
    perfPanelText(perfPanel.live, JSON.stringify({ version: GAME_VERSION, frameId: snapshot.frameId,
      fps: stats.fps, cpuMs: stats.cpu, p99GapMs: stats.p99, diagnosis: explanation,
      selectedIssue: perfLive.selectedIssue, issues: issues.map(function (r) {
        return { id: r.id, title: r.title, severity: r.severity, occurrences: r.occurrences, frameId: r.frameId };
      }), observerMs: perfLive.observerMs, paintMs: perfLive.paintMs }));
    perfLive.paintMs = performance.now() - t0;
  }
  function perfPanelPaintDetails(snapshot, stats, workload, event, selected) {
    var rows = [];
    rows.push('Build ' + GAME_VERSION + ' · callback target ' + perfLiveTargetFPS + ' FPS');
    rows.push('Panel observer ' + perfLive.observerMs.toFixed(3) + ' ms/frame; last paint ' + perfLive.paintMs.toFixed(2) + ' ms (5 Hz). GPU timestamp overhead is separate.');
    rows.push('Visible residents ' + snapshot.visibleResidents + '; outer ticks ' + snapshot.outerTicks + '; terrain rebuilds ' + snapshot.terrainRebuilds);
    rows.push('Snow ' + snapshot.snowAirborne + ' airborne / ' + snapshot.snowParked + ' parked; shared liquid storage ' + snapshot.liquids);
    rows.push(selected ? 'Recorded CPU frame. These rows are disjoint.' : 'CPU phase means, last active second. These rows are disjoint.');
    stats.phases.forEach(function (r) { rows.push(perfPanelName(r.name) + ': ' + r.ms.toFixed(3) + ' ms'); });
    rows.push('Slime solver children (already inside Slime solver):');
    ['jello.internal', 'jello.contact', 'jello.tail'].forEach(function (key) { rows.push(key + ': ' + (stats.raw[key] || 0).toFixed(3) + ' ms'); });
    rows.push('Snow CPU children (already inside Snow CPU):');
    ['snow.airCPU', 'snow.scanCPU', 'snow.supportCPU', 'snow.flakesCPU'].forEach(function (key) { rows.push(key + ': ' + (stats.raw[key] || 0).toFixed(3) + ' ms'); });
    if (event) {
      var frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
      rows.push((selected ? 'Inspected' : 'Worst') + ' event #' + event.frameId + ', ' + ((performance.now() - event.at) / 1000).toFixed(1) + ' s ago. CPU frame #' + frame.frameId + ':');
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
      save: node('save'), clear: node('clear'), detailsButton: node('details'),
      liveView: node('live-view'), diagnosis: node('diagnosis'), summary: node('summary'), certainty: node('certainty'),
      issues: node('issues'), issueNodes: Object.create(null), issueCount: node('issue-count'), issueEmpty: node('issue-empty'),
      inspection: node('inspection'), inspectionTitle: node('inspection-title'), inspectionSummary: node('inspection-summary'),
      inspectionCertainty: node('inspection-certainty'), inspectionMeta: node('inspection-meta'),
      inspectionEvidence: node('inspection-evidence'), back: node('back'),
      details: node('detail-body'), detailText: node('detail-text'), live: node('diagnostics-live') };
    var style = getComputedStyle(root);
    perfPanel.colors = { text: style.getPropertyValue('--perf-text').trim() || UIT_BODY,
      dim: style.getPropertyValue('--perf-dim').trim() || UIT_DIM,
      gold: style.getPropertyValue('--perf-amber').trim() || UIT_GOLD,
      warn: style.getPropertyValue('--perf-red').trim() || UIT_RED };
    perfPanel.save.addEventListener('click', perfLiveDownload);
    perfPanel.clear.addEventListener('click', function () { perfLiveClearIssues(); perfPanelPaint(); });
    perfPanel.back.addEventListener('click', function () { perfLiveSelectIssue(null); perfPanelPaint(); });
    perfPanel.issues.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-perf-issue]');
      if (button && perfPanel.issues.contains(button)) { perfLiveSelectIssue(button.getAttribute('data-perf-issue')); perfPanelPaint(); }
    });
    perfPanel.detailsButton.addEventListener('click', function () {
      perfLive.details = !perfLive.details; perfPanel.details.hidden = !perfLive.details;
      perfPanel.detailsButton.setAttribute('aria-expanded', String(perfLive.details));
      perfPanelPaint();
    });
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'keydown'].forEach(function (kind) {
      root.addEventListener(kind, function (e) {
        if (kind === 'keydown' && (e.key === 'F9' || e.key === 'Escape' || e.key === '`' || e.key === '~')) return;
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
