  // ----- Performance overlay (dev mode only) -----
  // v23.42: peak airborne |vx| observed this session (EXPANSION_PLAN P0.1
  // flight-speed measurement; persists until reload).
  var perfPeakAirVx = 0;
  // v23.43 — plain-English tooltips for the perf panel, for reading it without
  // a profiler background. Hovering a row shows the matching PERF_TIPS entry
  // (keyed by the row's label); rows with no specific tip fall back to their
  // section's PERF_SECTION_TIPS entry (matched by header prefix).
  var PERF_TIPS = {
    'Verdict': 'HEALTHY = hitting the display refresh cap. CPU-BOUND = JavaScript is the bottleneck. GPU-BOUND = drawing / fill-rate is. MICROSTUTTER = the average is fine but frames hitch.',
    'Cause': 'The single biggest contributor to the current verdict.',
    'Hitches': 'How many recent frames ran far longer than normal. Each one is a visible stutter.',
    'Smoothness': 'jank% = the share of stuttery frames. 1%-low = the fps of your worst 1% of frames, which is what you actually feel.',
    'FPS': 'Frames per second now, with the rolling average in parentheses. Capped at your monitor refresh rate.',
    'CPU frame': 'Time JavaScript spent building this frame. p99 and max are the worst recent frames.',
    'GPU/idle': 'Time left after the CPU work: GPU drawing + screen compositing + waiting for vsync. Large here while fps is low means GPU-bound.',
    'Upd/Rnd/Smk': 'This frame split into update / render / smoke milliseconds. Each is also its own row in TOP BUCKETS.',
    'WebGPU GPU': 'How long the GPU spent on the water + smoke simulations. Watch it climb when those get heavy.',
    'Heap': 'JavaScript memory: in use / allocated / browser limit. Steady is healthy; a constant climb suggests a leak.',
    'Speed vx': 'The rig current sideways speed, and whether it is on the ground or in the air.',
    'Peak air': 'The fastest sideways air speed seen this session. Fly full-tilt sideways to max it out.',
    'NMZ @ 90s': 'How far that peak speed travels in 90 seconds, in tiles, used to size the No Man Zone expansion.',
    'Smoke idle-skip': 'Optimization: stops simulating smoke once the plume has fully faded. OFF runs it every frame (the slower A/B baseline).',
    'Smoke obstacle-dirty': 'Optimization: rebuilds the smoke collision mask only when the view or terrain changed. OFF rebuilds it every frame.',
    'Magma skip-live-tint': 'Magma rock tint is baked into the terrain chunk AND redrawn live each frame. ON skips the live redraw (cheaper); check the magma cave edges still look right.',
    'tiles': 'The live per-tile pass: ore art, the magma molten-rock tint + lava veins, permafrost icicles, edge insets. This is what climbs in the magma + frost bands.',
    'terrain chunks': 'Blitting the cached terrain chunks + rebuilding any that scrolled into view. Spikes when you teleport or fall fast (lots of new chunks).',
    '  bg+embers': 'The underground background for the current biome: wall pattern, or for magma/mantle the heat gradient + drifting embers. Part of the sky phase above.',
    'Disabled': 'Subsystems switched off with PERF ISO (the H key) to isolate their cost. "none" means everything is running.',
    'delta B-A': 'B minus A for fps, p99 and jank. Green = B is faster and smoother than the baseline you captured.',
    'Jello solver': 'Which soft-body solver is running (press M to cycle). Amber = the old PBD baseline; green = the newer XPBD / FEM.'
  };
  var PERF_SECTION_TIPS = {
    'DIAGNOSIS': 'The headline health check. Read this first: it says whether you are fast, CPU-bound, GPU-bound, or just stuttering, and the main cause.',
    'WORST FRAME': 'The single slowest recent frame and what cost the most on it. A big number here is the stutter you just felt.',
    'JELLO COUPLING': 'Diagnoses why the rig drifts while standing on a jello blob. Only shown while you are on one.',
    'FRAME': 'This frame time budget. At 60Hz you get 16.7ms per frame; staying under it means smooth.',
    'FLIGHT SPEED': 'Measures how fast the rig flies sideways, used to size the No Man Zone expansion.',
    'BACKENDS': 'Which engine draws each system. Green WebGPU / cyan WebGL = GPU-accelerated; amber Canvas = the slower CPU path.',
    'OPT TOGGLES': 'The optimizations you can turn on/off live. Green = on (fast path). Press K to cycle the smoke ones for A/B testing.',
    'A/B COMPARE': 'Press [ to snapshot a baseline, change something, then press ] to compare. The delta tells you if it actually helped.',
    'BENCH': 'Press O for a repeatable 8-second auto-fly that averages the numbers, so two configs compare under an identical load.',
    'WORLD': 'Terrain chunk cache and canvas size. Rebuilds-per-frame spikes when you teleport or fly fast.',
    'PARTICLES': 'Live counts for smoke, water and jello. More active particles means more work per frame.',
    'DEV KEYS': 'Keyboard shortcuts available while dev mode is on.',
    'TOP': 'The most expensive measured code blocks this frame (average / peak ms). These are your prime optimization targets.',
    'RENDER': 'render.total split into its draw-pipeline phases (avg / peak ms). Whichever phase climbs is the one to chase. tiles + bg+embers are the magma/frost cost.'
  };
  function perfTip(label, header) {
    if (label && PERF_TIPS[label]) return PERF_TIPS[label];
    if (header) {
      for (var key in PERF_SECTION_TIPS) {
        if (Object.prototype.hasOwnProperty.call(PERF_SECTION_TIPS, key) && header.indexOf(key) === 0) {
          return PERF_SECTION_TIPS[key];
        }
      }
    }
    return null;
  }
  // Draw a wrapped tooltip box to the LEFT of the panel (the panel hugs the
  // right edge), clamped to stay on screen.
  function drawPerfTooltip(panelLeft, anchorY, title, body) {
    var tw = 226, padT = 7, lh = 14;
    ctx.font = '11px ' + UI_FONT;
    ctx.textBaseline = 'alphabetic';
    var maxW = tw - padT * 2;
    var words = body.split(' '), lines = [], cur = '';
    for (var w = 0; w < words.length; w++) {
      var test = cur ? cur + ' ' + words[w] : words[w];
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[w]; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    var th = padT * 2 + lh + lines.length * lh;
    var tx = panelLeft - tw - 8;
    if (tx < 8) tx = 8;
    var ty = anchorY - 6;
    if (ty + th > viewH - 6) ty = viewH - 6 - th;
    if (ty < 6) ty = 6;
    ctx.fillStyle = 'rgba(12,14,18,0.97)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = 'rgba(255,210,120,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd47a';
    ctx.fillText(title, tx + padT, ty + padT + 9);
    ctx.fillStyle = '#cdd4dc';
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], tx + padT, ty + padT + 9 + (li + 1) * lh);
    }
  }
  // ===== In-game "now playing" music readout (dev mode) =====================
  // Lists every currently-audible track from the SluiceAudio engine with its
  // position and length, and shows ALL of them when several are layered (the
  // underground stems, or combat over a bed). Top-left, below the version plate.
  function npFmtTime(s) {
    s = Math.max(0, s || 0);
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function npPretty(n) {
    var m;
    if ((m = /^town(\d+)$/.exec(n))) return 'Town ' + m[1];
    if ((m = /^travel(\d+)$/.exec(n))) return 'Travel ' + m[1];
    if ((m = /^combat(\d+)$/.exec(n))) return 'Combat ' + m[1];
    if ((m = /^ug-l(\d+)$/.exec(n))) return 'Underground L' + m[1];
    return n;
  }
  function drawNowPlaying() {
    if (typeof SluiceAudio === 'undefined' || !SluiceAudio || !SluiceAudio.nowPlaying) return;
    var list = SluiceAudio.nowPlaying() || [];
    var mode = (SluiceAudio.musicMode && SluiceAudio.musicMode()) || null;
    if (!list.length && !mode) return;                   // nothing playing, nothing queued
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var pad = 7, lh = 15, headH = 16, barH = 3, rowGap = 4;
    var bx = 4, by = 30, boxW = 250;
    var rows = list.length || 1;
    var boxH = pad + headH + rows * (lh + barH + rowGap) - rowGap + pad;
    ctx.fillStyle = 'rgba(8,10,14,0.66)';
    roundRect(ctx, bx, by, boxW, boxH, 4, true);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '11px ' + UI_FONT;
    ctx.fillStyle = 'rgba(238,202,104,0.96)';
    ctx.fillText('NOW PLAYING' + (mode ? '  (' + mode + ')' : ''), bx + pad, by + pad + 10);
    var y = by + pad + headH;
    if (!list.length) {
      ctx.fillStyle = 'rgba(200,205,215,0.6)';
      ctx.font = '12px ' + UI_FONT;
      ctx.fillText('(silent gap)', bx + pad, y + 11);
    } else {
      for (var i = 0; i < list.length; i++) {
        var tr = list[i];
        ctx.font = '12px ' + UI_FONT;
        ctx.textAlign = 'left'; ctx.fillStyle = '#e8eaef';
        ctx.fillText(npPretty(tr.name) + (tr.loop ? '  ∞' : ''), bx + pad, y + 11);
        ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(238,202,104,0.9)';
        ctx.fillText(npFmtTime(tr.t) + ' / ' + npFmtTime(tr.dur), bx + boxW - pad, y + 11);
        ctx.textAlign = 'left';
        var yb = y + lh, bw = boxW - pad * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(bx + pad, yb, bw, barH);
        var frac = tr.dur > 0 ? Math.max(0, Math.min(1, tr.t / tr.dur)) : 0;
        ctx.fillStyle = 'rgba(238,202,104,0.8)'; ctx.fillRect(bx + pad, yb, bw * frac, barH);
        y += lh + barH + rowGap;
      }
    }
    ctx.restore();
  }
  function drawPerfOverlay() {
    // v23.42: track peak airborne horizontal speed for the P0.1 flight-width
    // measurement (this panel runs every frame in dev mode).
    if (player && !player.onGround) {
      var _absVx = Math.abs(player.vx);
      if (_absVx > perfPeakAirVx) perfPeakAirVx = _absVx;
    }
    // ========= v10.75 — comprehensive debug overlay =========
    // Sections: FRAME • MEMORY • WORLD • PARTICLES • SKY • PLAYER •
    //           CAMERA • TOP BUCKETS. Headers in gold; numbers right-
    //           aligned next to their labels for easy scanning.

    // ---- Bucket list (sort once, used by TOP section) ----
    var bucketEntries = [];
    for (var bk in perfBuckets) {
      if (Object.prototype.hasOwnProperty.call(perfBuckets, bk)) {
        bucketEntries.push([bk, perfBuckets[bk]]);
      }
    }
    bucketEntries.sort(function (a, b) { return b[1] - a[1]; });
    var TOP_N = 8;

    // ---- Cheap summary stats ----
    var fs = perfFrameStats();
    var memStr = '—';
    if (typeof performance !== 'undefined' && performance.memory) {
      var mu = performance.memory.usedJSHeapSize / 1048576;
      var mt = performance.memory.totalJSHeapSize / 1048576;
      var ml = performance.memory.jsHeapSizeLimit / 1048576;
      memStr = mu.toFixed(0) + ' / ' + mt.toFixed(0) + ' / ' + ml.toFixed(0) + ' MB';
    }
    var smokePx = (smokeFluidCanvas) ? (smokeFluidCanvas.width + '×' + smokeFluidCanvas.height) : '—';
    var twinklerCount = (nightSkyTwinklers && nightSkyTwinklers.length) || 0;

    // ---- Build lines (string + colour) ----
    // Item types: '§' header, 'k' key/value (optional 4th = value colour),
    // '-' spacer, 'g' frame-time sparkline (taller row), 'd' dev-key row
    // (item[1] = up to two [key, desc] pairs laid out in two columns).
    var L = [];
    function H(t) { L.push(['§', t]); }                 // gold header
    function K(k, v, col) { L.push(['k', k, v, col]); }  // key:value (+colour)
    function R() { L.push(['-', '']); }                  // small spacer
    function G() { L.push(['g', '']); }                  // frame-graph row
    function D(p) { L.push(['d', p]); }                  // dev-key row (2 cols)

    // v14.21 — DIAGNOSIS first: the headline verdict + named cause, the
    // hitch tally, and the frame-time sparkline. Everything else (FRAME /
    // WORLD / PARTICLES / TOP BUCKETS) follows unchanged.
    var diag = perfDiagnose();
    var realMs0 = perfFps > 0 ? 1000 / perfFps : 0;
    // Hitch tally — scan the raw frame ring for frames over the same
    // threshold the loop uses to capture hitches.
    var _ringHT = Math.max(perfFrameMs * 1.6, perfFrameMs + 4);
    var _spikeN = 0, _spikeWorst = 0;
    for (var _ri = 0; _ri < perfFrameRingFilled; _ri++) {
      var _rv = perfFrameRing[_ri];
      if (_rv > _ringHT) { _spikeN++; if (_rv > _spikeWorst) _spikeWorst = _rv; }
    }
    H('DIAGNOSIS');
    K('Verdict', diag.verdict, diag.colour);
    K('Cause',   diag.cause);
    if (_spikeN > 0) {
      K('Hitches', _spikeN + ' spike' + (_spikeN === 1 ? '' : 's') +
                   ', worst ' + _spikeWorst.toFixed(1) + 'ms', '#ffcc44');
    } else {
      K('Hitches', 'none', '#66ff66');
    }
    // v14.22 — Smoothness: jank % + 1%-low fps. Average fps hides frequent
    // small spikes; this row surfaces them. Green <3% jank, amber <10%, red
    // above.
    var _jankStats = perfJankStats();
    var _jankCol = _jankStats.jankPct < 3 ? '#66ff66'
                 : _jankStats.jankPct < 10 ? '#ffcc44' : '#ff6666';
    K('Smoothness', _jankStats.jankPct.toFixed(0) + '% jank · 1%-low ' +
                    Math.round(_jankStats.low1) + 'fps', _jankCol);
    G();
    // v14.21 — WORST FRAME: the captured hitch + its top-6 raw buckets, so a
    // spike's culprit is visible after the EMA has smoothed it away. Shown
    // only while the hitch is recent (<10s); otherwise one green line.
    var _nowP = performance.now();
    if (perfHitch.buckets && (_nowP - perfHitch.at) < 10000) {
      H('WORST FRAME');
      var _ago = Math.max(0, (_nowP - perfHitch.at) / 1000);
      K('Frame', perfHitch.ms.toFixed(1) + 'ms  (' + _ago.toFixed(1) + 's ago)', '#ff6666');
      for (var _hi = 0; _hi < perfHitch.buckets.length; _hi++) {
        K('  ' + perfHitch.buckets[_hi][0],
          perfHitch.buckets[_hi][1].toFixed(1));
      }
    } else {
      H('WORST FRAME');
      K('Recent', 'none in last 10s', '#66ff66');
    }

    // v23.4 — JELLO COUPLING: live readout of WHY the rig moves while on a cube
    // (diagnosing the "skate along an edge"). Pure instrumentation, captured by the
    // player/jello hooks (see jelloDbg). RED marks a value that can move the rig.
    // v23.42 — only shown while actually riding jello (this is a coupling debug,
    // dead weight on the panel the 99% of the time the rig is not on a blob).
    if (player && player.onJello) {
    H('JELLO COUPLING');
    var _jcIn = jelloDbg.input > 0 ? 'RIGHT' : (jelloDbg.input < 0 ? 'LEFT' : 'none');
    K('Input',           _jcIn, jelloDbg.input !== 0 ? '#66ff66' : '#888888');
    K('On jello',        player.onJello ? 'YES' : 'no', player.onJello ? '#66ccff' : '#888888');
    K('Rig vx',          player.vx.toFixed(1) + ' px/s', Math.abs(player.vx) > 4 ? '#ffcc44' : '#66ff66');
    K('Cube COM vx',     jelloDbg.carryReal.toFixed(1) + (Math.abs(jelloDbg.carryReal) > JELLO_CARRY_MIN ? '  RIDES' : '  (deadzoned)'),
                         Math.abs(jelloDbg.carryReal) > JELLO_CARRY_MIN ? '#ff6666' : '#66ff66');
    K('Carry -> rig.x',  jelloDbg.effCarry.toFixed(1) + ' px/s', Math.abs(jelloDbg.effCarry) > 1 ? '#ff6666' : '#66ff66');
    K('Dismount inject', jelloDbg.injected.toFixed(1) + ' px/s', Math.abs(jelloDbg.injected) > 1 ? '#ff6666' : '#66ff66');
    K('Rig shoves cube', 'plow ' + jelloDbg.plowPts + ' / shear ' + jelloDbg.shearPts,
                         (jelloDbg.plowPts + jelloDbg.shearPts) > 0 ? '#ffcc44' : '#66ff66');
    K('Rig flings cube', '' + jelloDbg.flings + (jelloDbg.flings > 0 ? '  LAUNCHING' : ''),
                         jelloDbg.flings > 0 ? '#ff6666' : '#66ff66');
    }

    H('FRAME');
    // v11.76 — CPU vs GPU split. 'CPU frame' is JS work per frame; 'Interval'
    // is the real 1000/fps; 'GPU/idle' is the gap = GPU execution + compositing
    // + vsync wait. A large gap while fps sits BELOW the display refresh = the
    // frame is GPU/fill-rate bound. Gap near 0 (or fps pinned at the refresh
    // cap) = CPU bound / healthy — read the bucket list below.
    var realMs = perfFps > 0 ? 1000 / perfFps : 0;
    var gpuGap = realMs > perfFrameMs ? realMs - perfFrameMs : 0;
    K('FPS',       perfFps + ' (' + (fs.avg > 0 ? (1000 / fs.avg).toFixed(0) : '0') + ' avg)');
    K('CPU frame', perfFrameMs.toFixed(2) + ' ms (p99 ' + fs.p99.toFixed(1) + ', max ' + fs.max.toFixed(1) + ')');
    K('GPU/idle',  gpuGap.toFixed(2) + ' ms');
    // v23.42 — Update / Render / Smoke condensed to one line (each is also its
    // own bucket in TOP BUCKETS below); dropped the Interval line (= 1000/fps).
    K('Upd/Rnd/Smk', perfUpdateMs.toFixed(1) + ' / ' + perfRenderMs.toFixed(1) + ' / ' + perfSmokeMs.toFixed(1) + ' ms');
    // v14.15 — WebGPU GPU time (the smoke + water sims). onSubmittedWorkDone
    // drain; always shown in dev mode (no sync, no FPS skew). Hidden only
    // when there is no WebGPU device at all (everything on CPU / WebGL).
    var _hasWGPU = !!((liquidWGPU && liquidWGPU.device) ||
                      (smokeWGPU && smokeWGPU.device));
    if (_hasWGPU) K('WebGPU GPU', gpuWebGPUMs.toFixed(2) + ' ms drain (smoke+water)');
    // v12.4 — gl.finish-drained GPU time for the remaining WebGL
    // subsystems. v13.13 — opt-in ('G'); the finish() sync skews FPS.
    // v14.15 — covers the SKY now; the smoke / liquid lines appear only if
    // those subsystems are on their pre-WebGPU fallback paths (the buckets
    // stay empty otherwise, so those lines self-hide).
    if (gpuProbeEnabled) {
      K('Sky GPU',   (gpuBuckets['sky'] || 0).toFixed(2) + ' now / ' +
                     (gpuBucketsPeak['sky'] || 0).toFixed(2) + ' peak ms');
      var _smGpu = (gpuBuckets['smoke.update'] || 0) + (gpuBuckets['smoke.fire'] || 0) +
                   (gpuBuckets['smoke.draw'] || 0);
      if (_smGpu > 0.001) {
        var _smPk = (gpuBucketsPeak['smoke.update'] || 0) + (gpuBucketsPeak['smoke.fire'] || 0) +
                    (gpuBucketsPeak['smoke.draw'] || 0);
        K('Smoke GPU (GL)', _smGpu.toFixed(1) + ' now / ' + _smPk.toFixed(1) + ' peak ms');
      }
      if ((gpuBuckets['liquid'] || 0) > 0.001) {
        K('Liquid GPU (GL)', (gpuBuckets['liquid'] || 0).toFixed(2) + ' now / ' +
                             (gpuBucketsPeak['liquid'] || 0).toFixed(2) + ' peak ms');
      }
    } else {
      K('Sky GPU', 'off — press G (gl.finish skews FPS)');
    }
    K('Heap',      memStr);
    if (perfIso !== 0) K('PERF ISO', PERF_ISO_NAMES[perfIso] + '  (H cycles)');
    if (PERF_STRESS > 1) K('STRESS', 'x' + PERF_STRESS + '  (FPS real, ms x' + PERF_STRESS + ')');

    // ===== v23.42 FLIGHT SPEED (temporary; EXPANSION_PLAN P0.1) =====
    // Sustained horizontal flight speed is emergent from the thrust + drag
    // model, not a single constant, so it must be observed. Fly full-tilt
    // sideways and read 'Peak air'; 'NMZ @ 90s' converts it straight to the
    // No Man's Zone width (90 seconds of flight) the expansion must lock.
    H('FLIGHT SPEED');
    var _onGround = player && player.onGround;
    var _vxNow = player ? Math.abs(player.vx) : 0;
    K('Speed vx', _vxNow.toFixed(0) + ' px/s  (' + (_onGround ? 'ground' : 'AIR') + ')',
                  _onGround ? '#9aa5b1' : '#66ff66');
    K('Peak air', perfPeakAirVx.toFixed(0) + ' px/s', '#66ccff');
    var _nmzTiles = Math.round(perfPeakAirVx * 90 / TILE);
    K('NMZ @ 90s', _nmzTiles + ' tiles (' + Math.round(perfPeakAirVx * 90) + ' px)', '#ffd47a');

    // ----- v17.76 — BACKENDS: at-a-glance compute/render backend per
    // subsystem, so the live build makes it obvious whether smoke, sky,
    // water and jello run on WebGPU, WebGL or Canvas 2D. Smoke + water
    // mirror the live detection the PARTICLES section uses below; sky reads
    // skyGLLastDrew (its atmospheric raymarch shader vs the ImageData
    // fallback); jello is always CPU Verlet drawn on the 2D canvas. -----
    H('BACKENDS');
    var _bkCol = function (s) {
      return s.indexOf('WebGPU') === 0 ? '#66ff66'   // GPU compute = green
           : s.indexOf('WebGL')  === 0 ? '#66ccff'   // GL shader   = cyan
           : '#ffcc44';                              // Canvas/idle = amber
    };
    var _smokeBk = smokeWGPUDriving   ? 'WebGPU'
                 : smokeFluidActive   ? 'WebGL'
                 : smokeFluidDisabled ? 'Canvas (SPH)'
                 : 'idle (no smoke yet)';
    var _skyBk   = skyGLLastDrew ? 'WebGL'
                 : (skyGL === false ? 'Canvas (no WebGL)' : 'Canvas');
    var _waterBk = (liquidWGPU && liquidWGPU.simActive)
                 ? ('WebGPU' + (liquidWGPU.renderActive ? '' : ' (sim only)'))
                 : 'Canvas (CPU)';
    var _jelloBk = 'Canvas (CPU)';
    K('Smoke', _smokeBk, _bkCol(_smokeBk));
    K('Sky',   _skyBk,   _bkCol(_skyBk));
    K('Water', _waterBk, _bkCol(_waterBk));
    K('Jello', _jelloBk + '  (' + jelloCount + ' pts)', _bkCol(_jelloBk));

    // v23.39 — OPT TOGGLES: live state of the Stage-1 smoke optimizations ('K'
    // cycles, or the gm 'perf.*' levers / L panel) plus any subsystem currently
    // disabled via PERF ISO / PERF_DISABLE_*. Green = optimization running /
    // subsystem on; amber = the slower A/B comparison state.
    H('OPT TOGGLES  (K cycles smoke opt)');
    K('Smoke idle-skip',      PERF_SMOKE_IDLE_SKIP ? 'ON' : 'OFF (every frame)',
                              PERF_SMOKE_IDLE_SKIP ? '#66ff66' : '#ffcc44');
    K('Smoke obstacle-dirty', PERF_SMOKE_OBSTACLE_DIRTY ? 'ON' : 'OFF (every frame)',
                              PERF_SMOKE_OBSTACLE_DIRTY ? '#66ff66' : '#ffcc44');
    K('Magma skip-live-tint', PERF_MAGMA_SKIP_LIVE_TINT ? 'ON (baked only)' : 'off (redraw live)',
                              PERF_MAGMA_SKIP_LIVE_TINT ? '#66ccff' : '#9aa5b1');
    var _disabled = [];
    if (PERF_DISABLE_SMOKE_FLUID)    _disabled.push('smoke');
    if (PERF_DISABLE_ROCKET)         _disabled.push('rocket');
    if (PERF_DISABLE_EXHAUST_BRIDGE) _disabled.push('exhaust');
    if (PERF_DISABLE_WATER)          _disabled.push('water');
    if (PERF_DISABLE_CAVE_WALLS)     _disabled.push('cavewalls');
    if (PERF_DISABLE_TERRAIN_CHUNKS) _disabled.push('terrain');
    if (PERF_DISABLE_NIGHTSKY)       _disabled.push('nightsky');
    if (PERF_DISABLE_MOUNTAINS)      _disabled.push('mountains');
    if (PERF_DISABLE_CONSOLE)        _disabled.push('console');
    K('Disabled', _disabled.length ? _disabled.join(', ') : 'none',
                  _disabled.length ? '#ffcc44' : '#66ff66');

    // v23.40 — A/B COMPARE: '[' grabs slot A (baseline), ']' grabs slot B.
    // Each row is config + fps/p99/jank at capture; the delta is B-A, green
    // when B is faster + smoother, red when worse, amber when mixed.
    H('A/B COMPARE  ([ A   ] B)');
    if (!perfAB.a && !perfAB.b) {
      K('Slots', 'press [ for A, ] for B', '#888888');
    } else {
      var _fmtAB = function (s) {
        return s ? ('i' + s.idle + ' o' + s.obs + '   ' + s.fps + 'fps  p99 ' +
                    s.p99.toFixed(1) + '  jk ' + s.jank.toFixed(0) + '%') : '—';
      };
      K('A', _fmtAB(perfAB.a), perfAB.a ? '#ddd' : '#888888');
      K('B', _fmtAB(perfAB.b), perfAB.b ? '#ddd' : '#888888');
      if (perfAB.a && perfAB.b) {
        var dF = perfAB.b.fps - perfAB.a.fps;
        var dP = perfAB.b.p99 - perfAB.a.p99;
        var dJ = perfAB.b.jank - perfAB.a.jank;
        // fps higher = better; p99 + jank lower = better.
        var _better = (dF >= 0) + (dP <= 0) + (dJ <= 0);
        var _worse  = (dF <= 0) + (dP >= 0) + (dJ >= 0);
        var dCol = _better >= 2 && dF >= 0 ? '#66ff66'
                 : _worse  >= 2 && dF <= 0 ? '#ff6666' : '#ffcc44';
        K('delta B-A', (dF >= 0 ? '+' : '') + dF + 'fps  ' +
                       (dP >= 0 ? '+' : '') + dP.toFixed(1) + ' p99  ' +
                       (dJ >= 0 ? '+' : '') + dJ.toFixed(0) + ' jk', dCol);
      }
    }

    // v23.41 — BENCH: the deterministic auto-fly run. While running, shows
    // progress; for 15s after it finishes, shows the windowed report (averages
    // over the whole run, not the instantaneous EMA).
    if (benchState.running) {
      H('BENCH  (running — hands off)');
      K('Progress', benchState.t.toFixed(1) + ' / ' + benchState.dur.toFixed(0) + 's   ' +
                    benchState.frames + ' frames', '#ffcc44');
      K('Config', benchState.startCfg);
    } else if (benchState.result && (performance.now() - benchState.resultAt) < 15000) {
      var _br = benchState.result;
      H('BENCH RESULT  (O reruns)');
      K('Window', _br.dur.toFixed(1) + 's  ' + _br.frames + ' frames', '#66ccff');
      K('Config', _br.cfg);
      K('Avg',    _br.avgFps.toFixed(1) + 'fps  (' + _br.avgMs.toFixed(2) + 'ms)');
      K('Frame',  'min ' + _br.min.toFixed(1) + '  max ' + _br.max.toFixed(1) + '  p99 ' + _br.p99.toFixed(1));
      K('Jank',   _br.jank.toFixed(1) + '%', _br.jank < 3 ? '#66ff66' : _br.jank < 10 ? '#ffcc44' : '#ff6666');
      for (var _bi = 0; _bi < Math.min(5, _br.top.length); _bi++) {
        K('  ' + _br.top[_bi][0], _br.top[_bi][1].toFixed(2) + 'ms');
      }
    }

    H('WORLD');
    K('Cache',     Object.keys(terrainChunkCache).length + ' / ' + terrainChunkCacheLimit() +
                   '  @' + TERRAIN_CHUNK_RENDER_SCALE.toFixed(1) + 'x');
    K('Rebuilds',  perfChunkRebuilds + ' / frame');
    K('Canvas',    canvas.width + '×' + canvas.height + '  (dpr ' + dpr.toFixed(2) + ')');
    K('Zoom',      zoomMode + '  ws=' + (dpr * worldScale).toFixed(2));

    H('PARTICLES');
    // v14.15 — true smoke backend. smokeFluidActive is set on BOTH the WebGPU
    // and the WebGL path, so test smokeWGPUDriving first.
    var _smokeBackend = smokeWGPUDriving ? 'WebGPU'
                      : smokeFluidActive ? 'WebGL'
                      : smokeFluidDisabled ? 'SPH' : 'none';
    K('Smoke sim',  _smokeBackend + '  ' + smokePx);
    // v23.42 — water lines only while liquid is live, condensed to 2 rows.
    if (liquidCount > 0) {
      var _liqBackend = (liquidWGPU && liquidWGPU.simActive)
                        ? ('WebGPU' + (liquidWGPU.renderActive ? ' sim+draw' : ' sim only')) : 'CPU';
      K('Liquid',    _liqBackend + '  ' + liquidCount + 'p / ' + liquidGridCount + 'g');
      K('Liq state', liquidStatAwake + ' awk / ' + liquidStatSleeping + ' slp / ' + liquidStatFrozen + ' frz');
    }
    K('Sparks/Twink', rocketSparks.length + ' / ' + twinklerCount);
    // Jello solver always shown (drives the M-key solver A/B); colour-coded
    // amber = v1/PBD baseline, green = the new XPBD / FEM. The census + load
    // only when blobs actually exist (v23.42 — dead weight otherwise).
    var _jSolv = JELLO_SOLVER;
    var _jSolvName = _jSolv === 'pbd' ? 'PBD ' + JELLO_VERSION + ' (old)'
                   : _jSolv === 'xpbd' ? 'XPBD (new)' : 'FEM (new)';
    K('Jello solver', _jSolvName, _jSolv === 'pbd' ? '#ffcc44' : '#66ff66');
    // Which FEEL preset is live (U cycles; index 0 = the boot defaults). The
    // owner had no way to tell which feel a screenshot showed before this.
    if (typeof JELLO_FEELS !== 'undefined') K('Jello feel', JELLO_FEELS[jelloFeelIdx].name + '  (U)');
    if (jelloBodies.length) {
      var _jAwake = 0, _jSleep = 0, _jFrozen = 0, _jSpr = 0, _jRing = 0, _jTri = 0;
      for (var _jb = 0; _jb < jelloBodies.length; _jb++) {
        var _jbB = jelloBodies[_jb];
        if (_jbB.frozen) _jFrozen++;
        else if (_jbB.sleeping) _jSleep++;
        else _jAwake++;
        _jSpr += _jbB.springN; _jRing += _jbB.ringN; _jTri += (_jbB.triN || 0);
      }
      K('Jello',      jelloBodies.length + ' bod / ' + jelloCount + ' pts / ' + jelloSplats.length + ' splat');
      K('Jello mesh', _jRing + 'r ' + _jSpr + 's ' + _jTri + 't  (' + _jAwake + ' awk/' + _jSleep + ' slp/' + _jFrozen + ' frz)');
      K('Jello load', jelloLastSubs + ' sub / ' + Math.round(Math.sqrt(jelloMaxVsq)) + ' vmax / ' + jelloContactsThisFrame + ' contact');
    }

    // v21.47 — DEV KEYS: the dev-mode-only hotkeys, two per row, so the debug
    // shortcuts are discoverable in-game instead of living only in AGENTS.md.
    // All of these fire only while dev mode is on (this whole panel is too).
    // Placed above TOP BUCKETS so the long bucket dump never pushes the
    // reference off the bottom of the screen.
    H('DEV KEYS');
    var _devKeys = [
      ['`', 'dev mode'],      ['G', 'sky GPU'],
      ['H', 'perf-ISO A/B'],  ['K', 'smoke opt A/B'],
      ['[ ]', 'A/B capture'], ['O', 'benchmark run'],
      ['L', 'tuning panel'],  ['M', 'jello solver'],
      ['J', 'jello pts'],     ['C', 'drop jello'],
      ['V', 'clear jello']
    ];
    for (var _dk = 0; _dk < _devKeys.length; _dk += 2) {
      var _dkRow = [_devKeys[_dk]];
      if (_devKeys[_dk + 1]) _dkRow.push(_devKeys[_dk + 1]);
      D(_dkRow);
    }

    H('TOP ' + TOP_N + ' BUCKETS (avg / peak)');
    // v14.21 — each row shows the smoothed avg and the peak-hold value; a
    // peak past one frame interval is ambered, past two is reddened, so a
    // bucket that spikes hard but rarely is still flagged.
    var _budget = realMs0 > 0 ? realMs0 : 16.7;
    for (var i5 = 0; i5 < Math.min(TOP_N, bucketEntries.length); i5++) {
      var nm = bucketEntries[i5][0];
      var ms = bucketEntries[i5][1];
      var pkMs = perfBucketsPk[nm] || 0;
      var bcol = pkMs > _budget * 2 ? '#ff6666'
               : pkMs > _budget ? '#ffcc44' : null;
      K((i5 + 1) + '. ' + nm, ms.toFixed(1) + ' / ' + pkMs.toFixed(1) + ' ms', bcol);
    }

    // v23.63 — RENDER breakdown, pinned at the BOTTOM of the panel with a FIXED
    // row set so nothing pops in and out (every phase is always listed, 0.00
    // when idle). render.total split into its draw-pipeline phases in order,
    // each avg / peak ms. undergroundBg is measured inside the sky phase, so it
    // is shown indented under it, not added on. Watch 'tiles' (per-tile rock
    // tint + veins + icicles + ores) and 'bg+embers' (magma heat + embers) in
    // the magma/frost bands; 'terrain chunks' is the cache blit + rebuilds.
    H('RENDER  (' + (perfBuckets['render.total'] || 0).toFixed(1) + 'ms total)');
    var _rPhases = [
      ['sky',           'render.sky'],
      ['  bg+embers',   'render.undergroundBg'],
      ['terrain chunks','render.terrain'],
      ['tiles',         'render.tiles'],
      ['entities',      'render.entities'],
      ['liquids',       'render.liquids'],
      ['smoke',         'render.smoke'],
      ['player+fx',     'render.player+fx'],
      ['HUD',           'render.HUD']
    ];
    var _rBud = realMs0 > 0 ? realMs0 : 16.7;
    for (var _rp = 0; _rp < _rPhases.length; _rp++) {
      var _rAvg = perfBuckets[_rPhases[_rp][1]] || 0;
      var _rPk  = perfBucketsPk[_rPhases[_rp][1]] || 0;
      var _rCol = _rPk > _rBud * 0.5 ? '#ff6666'
                : _rPk > _rBud * 0.25 ? '#ffcc44' : '#9aa5b1';
      K(_rPhases[_rp][0], _rAvg.toFixed(2) + ' / ' + _rPk.toFixed(2) + ' ms', _rCol);
    }

    // ---- Layout ----
    // v14.21 — the 'g' frame-graph row is taller than a text row, so the box
    // height is the SUM of each row's height (lineH for text, graphH for the
    // graph) rather than L.length * lineH, and the draw loop advances a
    // running y cursor by the same per-row height.
    var pad    = 6;
    var boxW   = 280;
    var by     = isMobile ? 70 : 46;
    var lineH  = 13;
    var graphH = 32;
    // v23.42 — shrink-to-fit. With jello + liquid + a recent hitch/bench all
    // live the panel can still outgrow the viewport; count the rows at default
    // sizes and, if the box would run off the bottom, scale line/graph/font down
    // so the whole panel always stays on screen.
    var _nGraph = 0, _nText = 0;
    for (var ih = 0; ih < L.length; ih++) { if (L[ih][0] === 'g') _nGraph++; else _nText++; }
    var _availH = viewH - by - 8 - pad * 2;
    var _wantH  = _nText * lineH + _nGraph * graphH;
    if (_wantH > _availH && _wantH > 0) {
      var _fitK = _availH / _wantH;
      lineH = Math.max(8, lineH * _fitK);
      graphH = graphH * _fitK;
    }
    var _fontPx = Math.max(8, Math.round(lineH - 2));
    var rowH = function (it) { return it[0] === 'g' ? graphH : lineH; };
    var contentH = _nText * lineH + _nGraph * graphH;
    var boxH = pad * 2 + contentH;
    var bx   = viewW - boxW - 8;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = 'rgba(255,210,120,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    ctx.font = _fontPx + 'px ' + UI_FONT;
    ctx.textBaseline = 'alphabetic';

    var labelX = bx + pad;
    var valueX = bx + boxW - pad;
    var rowY = by + pad;                 // top of the current row
    // v23.43 — record each row's y-span + label + section so a hover can find
    // the row under the cursor and show its tooltip after the loop.
    var hitRows = [], curHeader = '';
    for (var i = 0; i < L.length; i++) {
      var item = L[i];
      var h = rowH(item);
      if (item[0] === '§') curHeader = item[1];
      hitRows.push([rowY, rowY + h, item[0] === 'k' ? item[1] : '', curHeader]);
      if (item[0] === '§') {
        var ty = rowY + lineH - 3;
        ctx.fillStyle = '#ffd47a';
        ctx.textAlign = 'left';
        ctx.fillText('— ' + item[1] + ' —', labelX, ty);
      } else if (item[0] === 'k') {
        var ty2 = rowY + lineH - 3;
        // Default value colour; the FPS row is health-coloured; an explicit
        // colour on item[3] (e.g. the verdict) wins.
        var col = '#ddd';
        if (item[1] === 'FPS') {
          col = perfFps < 30 ? '#ff6666' : perfFps < 50 ? '#ffcc44' : '#66ff66';
        }
        if (item[3]) col = item[3];
        // The DIAGNOSIS verdict colours the label too, so the headline reads
        // at a glance; every other row keeps the muted grey label.
        ctx.fillStyle = (item[1] === 'Verdict' && item[3]) ? item[3] : '#9aa5b1';
        ctx.textAlign = 'left';
        ctx.fillText(item[1], labelX, ty2);
        ctx.fillStyle = col;
        ctx.textAlign = 'right';
        ctx.fillText(item[2], valueX, ty2);
      } else if (item[0] === 'g') {
        // ---- Frame-time sparkline ----
        // perfFrameRing is a ring buffer; walk it oldest→newest. The graph's
        // full height maps to max(3 × interval, 33) ms. A faint baseline sits
        // at the vsync interval; bars are green ≤1.15×, amber ≤2×, red above.
        var gx = bx + pad;
        var gy = rowY + 1;
        var gw = boxW - pad * 2;
        var gh = graphH - 2;
        var interval = realMs0 > 0 ? realMs0 : 16.7;
        var fullMs = Math.max(3 * interval, 33);
        var n = perfFrameRingFilled;
        if (n > 0) {
          var bw = gw / n;
          for (var gi = 0; gi < n; gi++) {
            // Oldest sample first: start at the next-write index and wrap.
            var idx = (perfFrameRingIdx - n + gi + perfFrameRing.length * 2) %
                      perfFrameRing.length;
            var fv = perfFrameRing[idx];
            var bh = Math.max(1, Math.min(1, fv / fullMs) * gh);
            ctx.fillStyle = fv > interval * 2 ? '#ff6666'
                          : fv > interval * 1.15 ? '#ffcc44' : '#66ff66';
            ctx.fillRect(gx + gi * bw, gy + gh - bh,
                         Math.max(1, bw - 0.5), bh);
          }
        }
        // Baseline at the vsync interval (1000 / best fps).
        var capMs = perfFpsCap > 0 ? 1000 / perfFpsCap : interval;
        var baseY = gy + gh - Math.min(1, capMs / fullMs) * gh;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx, baseY + 0.5);
        ctx.lineTo(gx + gw, baseY + 0.5);
        ctx.stroke();
      } else if (item[0] === 'd') {
        // ---- Dev-key reference row: up to two [key, desc] pairs across two
        // even columns, key in gold, description in muted grey. monospace, so
        // a fixed 13px inset clears the single-char key glyph. ----
        var tyd = rowY + lineH - 3;
        var pairsD = item[1];
        var colWD = (boxW - pad * 2) / 2;
        ctx.textAlign = 'left';
        for (var pdi = 0; pdi < pairsD.length; pdi++) {
          var cxD = labelX + pdi * colWD;
          ctx.fillStyle = '#ffd47a';
          ctx.fillText(pairsD[pdi][0], cxD, tyd);
          ctx.fillStyle = '#9aa5b1';
          ctx.fillText(pairsD[pdi][1], cxD + 13, tyd);
        }
      }
      rowY += h;
    }
    ctx.textAlign = 'left';

    // v23.43 — hover tooltip. When the mouse is over a row of the panel, draw a
    // plain-English explanation of that metric (or its section) to the left of
    // the panel. Mouse + panel share CSS-pixel space, so this is a direct test.
    if (mouseCursor && mouseCursor.x >= bx && mouseCursor.x <= bx + boxW &&
        mouseCursor.y >= by && mouseCursor.y <= by + boxH) {
      for (var _hr = 0; _hr < hitRows.length; _hr++) {
        var _r = hitRows[_hr];
        if (mouseCursor.y >= _r[0] && mouseCursor.y < _r[1]) {
          var _tip = perfTip(_r[2], _r[3]);
          if (_tip) drawPerfTooltip(bx, mouseCursor.y, _r[2] || _r[3], _tip);
          break;
        }
      }
    }
  }

  // Shop layout constants (kept in sync with handleShopClick)
  var SHOP_LAYOUT = {
    boxW: 0, boxX: 0, boxY: 0, boxH: 0,
    sellY: 0, refuelY: 0, itemsStartY: 0, itemH: 0
  };

