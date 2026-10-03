  /* Plain explanations and bounded session warnings. Counts never infer causes. */
  function perfLiveCPUName(name) {
    if (name === 'snow.cpu') return { key: 'cpu-snow', name: 'Snow processing' };
    if (/^update\.(jello|fluidSkin|residents|slimeNpc|slimeAudio)$/.test(name)) return { key: 'cpu-slimes', name: 'Slime physics' };
    if (name === 'update.liquids') return { key: 'cpu-water', name: 'Water and snow submission' };
    if (/^render\./.test(name)) return { key: 'cpu-drawing', name: 'Drawing the game' };
    if (name === 'update.bathhouse') return { key: 'cpu-bath', name: 'Bathhouse simulation' };
    if (name === 'update.main') return { key: 'cpu-rig', name: 'Rig physics' };
    if (name === 'update.smoke') return { key: 'cpu-smoke', name: 'Smoke processing' };
    var names = { 'update.aux': 'Camera and controls', 'update.wind': 'Wind', 'update.grassWind': 'Grass wind',
      'update.trees': 'Tree simulation', 'update.boulders': 'Rock simulation', 'update.weather': 'Weather',
      'update.audio': 'Audio', 'update.explosions': 'Explosions', 'update.mineFx': 'Mining debris',
      'update.liveBombs': 'Bombs', 'update.pondStream': 'Pond loading' };
    return { key: 'cpu-other', name: names[name] || 'Other game work' };
  }
  function perfLiveGPUName(name) {
    if (/snow/.test(name)) return { key: 'gpu-snow', name: /contact|collide/.test(name) ? 'Snow collisions' : 'Snow simulation' };
    if (/smoke/.test(name)) return { key: 'gpu-smoke', name: 'Smoke simulation' };
    if (/fire|hearth/.test(name)) return { key: 'gpu-fire', name: 'Fire simulation' };
    if (/render|draw/i.test(name)) return { key: 'gpu-drawing', name: 'Drawing particles' };
    return { key: 'gpu-water', name: 'Water and snow simulation' };
  }
  function perfLiveGPUExplanation(row) {
    if (!row || row.partial || row.invalidTimestamp || row.invalid || !Number.isFinite(row.ms) || row.ms <= perfLiveBudget) return null;
    var totals = {}, best = null;
    (row.passes || []).forEach(function (pass) {
      if (!pass.emptyTimestamp && Number.isFinite(pass.ms) && pass.ms >= 0) totals[pass.name] = (totals[pass.name] || 0) + pass.ms;
    });
    for (var name in totals) if (!best || totals[name] > best.ms) best = { name: name, ms: totals[name] };
    var leading = best && best.ms >= row.ms * 0.35;
    var label = perfLiveGPUName(leading ? best.name : row.name);
    return { key: label.key, title: label.name + (/collisions$/.test(label.name) ? ' are expensive' : ' is expensive'), certainty: 'GPU sampled',
      summary: (leading ? label.name + ' took ' + best.ms.toFixed(1) : 'Sampled GPU passes took ' + row.ms.toFixed(1)) + ' ms. The 120 FPS budget is 8.3 ms.',
      evidence: ['Sampled GPU passes: ' + row.ms.toFixed(2) + ' ms.',
        'Sampled frame #' + row.frameId + (best ? '; largest pass ' + best.name + ': ' + best.ms.toFixed(2) + ' ms.' : '.'),
        'GPU samples omit browser drawing and can miss a short stall. CPU and GPU work overlap.'] };
  }
  function perfLiveExplainFrame(frame, gpuRows) {
    if (!frame) return { key: 'waiting', title: 'Waiting for play', summary: 'Play to start measuring.', evidence: [], certainty: 'Within budget' };
    var cpu = Number(frame.cpuMs) || 0, phases = frame.phases || perfLivePhases(frame.buckets || {}, cpu);
    var top = phases[0], interval = Number(frame.intervalMs) || 0;
    if (cpu > perfLiveBudget) {
      var leading = top && top.ms >= cpu * 0.35, label = perfLiveCPUName(leading ? top.name : 'other game work');
      return { key: label.key, title: leading ? label.name + ' is expensive' : 'Too much game work', certainty: 'CPU measured',
        summary: (leading ? label.name + ' took ' + top.ms.toFixed(1) + ' ms of ' : 'Game work took ') + cpu.toFixed(1) + ' ms. The 120 FPS budget is 8.3 ms.',
        evidence: ['Measured game work: ' + cpu.toFixed(2) + ' ms.', top ? 'Largest measured cost: ' + perfLiveCPUName(top.name).name + ', ' + top.ms.toFixed(2) + ' ms.' : 'No individual cost was measured.',
          'These CPU phases do not overlap. CPU time excludes panel work and does not measure GPU execution.'] };
    }
    if (!gpuRows) gpuRows = perfLive.gpu;
    var bestGPU = null;
    if (frame.frameId !== null && frame.frameId !== undefined) gpuRows.forEach(function (row) {
      if (row.frameId !== frame.frameId) return;
      var explanation = perfLiveGPUExplanation(row);
      if (explanation && (!bestGPU || row.ms > bestGPU.ms)) bestGPU = { ms: row.ms, explanation: explanation };
    });
    if (bestGPU) return bestGPU.explanation;
    if (interval > perfLiveBudget * 1.15) return { key: 'unexplained', title: 'Frame pacing is slow', certainty: 'Cause unknown',
      summary: 'Measured game work took ' + cpu.toFixed(1) + ' ms. That does not explain the ' + interval.toFixed(1) + ' ms frame gap.',
      evidence: ['Arrival gap: ' + interval.toFixed(2) + ' ms; preceding game work: ' + cpu.toFixed(2) + ' ms.',
        'No complete, expensive GPU sample matches this frame. Browser scheduling and drawing are not measured here.',
        'Snow and slime counts provide context, not a measured cause.'] };
    return { key: 'healthy', title: 'Game work is within budget', certainty: 'Within budget',
      summary: 'Measured game work took ' + cpu.toFixed(1) + ' ms. The 120 FPS budget is 8.3 ms.', evidence: [] };
  }
  function perfLiveLiveDiagnosis(stats) {
    if (!stats.frames) return perfLiveExplainFrame(null, []);
    var frame = { frameId: null, cpuMs: stats.cpu, phases: stats.phases, intervalMs: stats.fps ? 1000 / stats.fps : 0 };
    var diagnosis = perfLiveExplainFrame(frame, []);
    if (diagnosis.certainty === 'CPU measured') return diagnosis;
    var now = performance.now(), best = null;
    for (var name in perfLive.latestGPU) {
      var row = perfLive.latestGPU[name];
      var age = now - row.at;
      if (!Number.isFinite(age) || age < 0 || age > 3000) continue;
      var explanation = perfLiveGPUExplanation(row);
      if (explanation && (!best || row.ms > best.ms)) best = { ms: row.ms, explanation: explanation };
    }
    if (best) {
      best.explanation.summary = 'Latest GPU sample: ' + best.explanation.summary;
      return best.explanation;
    }
    return diagnosis;
  }
  function perfLiveIssueFrame(event) {
    var frame = event.kind === 'gap' && event.previous ? event.previous : event.current;
    return Object.assign({}, frame, { intervalMs: event.gapMs || frame.intervalMs });
  }
  function perfLiveExplainIssue(event) {
    var frame = perfLiveIssueFrame(event);
    if (event.kind === 'gpu') {
      var source = (event.gpu || []).filter(function (row) { return row.frameId === frame.frameId && (!event.sourceGPU || row.name === event.sourceGPU); })[0];
      var measured = perfLiveGPUExplanation(source);
      if (measured) return measured;
    }
    return perfLiveExplainFrame(frame, event.gpu || []);
  }
  function perfLiveRememberIssue(event) {
    if (event.severity < 25 || perfLive.saving) return;
    var explanation = perfLiveExplainIssue(event);
    var id = explanation.key;
    if (id === 'healthy' || id === 'waiting') id = 'unexplained';
    var issue = null;
    for (var i = 0; i < perfLive.issues.length; i++) if (perfLive.issues[i].id === id) { issue = perfLive.issues[i]; break; }
    var sourceFrameId = perfLiveIssueFrame(event).frameId;
    if (issue) {
      if (issue.lastSourceFrameId !== sourceFrameId) { issue.occurrences++; issue.lastSourceFrameId = sourceFrameId; }
      issue.lastAt = event.at;
      if (event.severity <= issue.severity) return issue;
    } else {
      // There are fourteen fixed CPU/GPU/pacing groups. Keep a hard cap too.
      if (perfLive.issues.length >= perfLive.issueLimit) return null;
      issue = { id: id, occurrences: 1, lastSourceFrameId: sourceFrameId, firstAt: event.at, lastAt: event.at };
      perfLive.issues.push(issue);
    }
    Object.assign(issue, { title: explanation.title, summary: explanation.summary, certainty: explanation.certainty,
      severity: event.severity, major: true, at: event.at, frameId: event.frameId, kind: event.kind, event: event });
    return issue;
  }
  function perfLiveFrameIndex(frameId) {
    var first = (perfLive.write - perfLive.count + perfLive.capacity) % perfLive.capacity, low = 0, high = perfLive.count - 1;
    while (low <= high) {
      var mid = (low + high) >> 1, index = (first + mid) % perfLive.capacity;
      var id = perfLive.data[index * perfLiveStride + 30];
      if (id === frameId) return { index: index, order: mid };
      if (id < frameId) low = mid + 1; else high = mid - 1;
    }
    return null;
  }
  function perfLiveObserveGPU(row) {
    if (!perfLive.enabled || !perfLive.data || perfLive.saving || !perfLiveGPUExplanation(row)) return;
    var found = perfLiveFrameIndex(row.frameId);
    if (!found) return;
    var offset = found.index * perfLiveStride;
    if (!perfLive.data[offset + 33] || perfLive.issueReadyAt === null || perfLive.data[offset] < perfLive.issueReadyAt) return;
    var frame = perfLiveRow(found.index), gap = null;
    if (found.order + 1 < perfLive.count) {
      var nextIndex = (found.index + 1) % perfLive.capacity, nextOffset = nextIndex * perfLiveStride;
      if (perfLive.data[nextOffset + 33]) gap = perfLive.data[nextOffset + 1];
    }
    // This tag describes measured GPU work. A CPU stall or contextual arrival
    // gap must not inflate the GPU cost or its severity badge.
    var severity = row.ms;
    if (severity < 25) return;
    var event = { kind: 'gpu', frameId: row.frameId, at: frame.atMs, severity: severity,
      gapMs: gap, current: frame, previous: null, reference: perfLiveReference(frame.atMs), gpu: [row], sourceGPU: row.name };
    perfLive.workload.forEach(function (sample) { perfLiveAttach(event, sample, true); });
    perfLiveRememberIssue(event);
  }
  function perfLiveIssueList() {
    return perfLive.issues.slice().sort(function (a, b) { return b.severity - a.severity; });
  }
  function perfLiveGetSelectedIssue() { return perfLive.inspectedIssue; }
  function perfLiveSelectIssue(id) {
    perfLive.selectedIssue = null; perfLive.inspectedIssue = null;
    for (var i = 0; i < perfLive.issues.length; i++) if (perfLive.issues[i].id === id) {
      perfLive.selectedIssue = id; perfLive.inspectedIssue = Object.assign({}, perfLive.issues[i]); break;
    }
    if (typeof perfPanelPaint === 'function') perfPanelPaint();
    return perfLive.inspectedIssue;
  }
  function perfLiveClearIssues() {
    perfLive.issues = []; perfLive.selectedIssue = null; perfLive.inspectedIssue = null;
    perfLiveClearPin();
  }
  function perfLiveExportEvent(event, started) {
    if (!event) return null;
    var result = Object.assign({}, event, { atMs: event.at - started, outsideHistory: event.at < started });
    if (event.gpu) result.gpu = event.gpu.map(function (row) { return Object.assign({}, row, { atMs: row.at - started }); });
    if (event.workload) result.workload = Object.assign({}, event.workload, { pageAtMs: event.workload.atMs,
      atMs: event.workload.at - started, pageCompletedAtMs: event.workload.completedAtMs, completedAtMs: event.workload.completedAtMs - started });
    ['current', 'previous'].forEach(function (key) {
      if (event[key]) result[key] = Object.assign({}, event[key], { pageAtMs: event[key].atMs, atMs: event[key].atMs - started });
    });
    return result;
  }
  function perfLiveExportIssue(issue, started) {
    if (!issue) return null;
    return Object.assign({}, issue, { atMs: issue.at - started, firstAtMs: issue.firstAt - started,
      lastAtMs: issue.lastAt - started, outsideHistory: issue.at < started, event: perfLiveExportEvent(issue.event, started) });
  }
  Object.assign(window.__sluicePerformance, { issues: perfLiveIssueList, inspectIssue: perfLiveSelectIssue, clearIssues: perfLiveClearIssues });
