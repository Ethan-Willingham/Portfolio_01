/* Read-only presentation of the combustion solver's cached concentration and flow. */
(function () {
  'use strict';

  var AMBIENT = .209;
  // The site's categorical coral, gold and sage. Depleted air is warmer.
  var COLORS = [[0, 185, 121, 109], [.08, 217, 151, 140], [.15, 223, 194, 136], [AMBIENT, 158, 199, 154]];
  var LEVELS = [.05, .10, .15, .19];
  var EDGES = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], []];
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function percentage(value) { return Number.isFinite(value) ? (100 * value).toFixed(2) + '%' : 'Waiting'; }
  function setText(element, value) { if (element.textContent !== value) element.textContent = value; }

  function create(toy, shell) {
    var stage = document.getElementById('toy-stage');
    var viewport = document.getElementById('toy-viewport');
    var canvas = document.getElementById('toy-oxygen-canvas');
    var panel = document.getElementById('toy-oxygen-legend');
    if (!stage || !canvas || !panel) return null;
    var context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    var toggleButton = document.getElementById('toy-oxygen-toggle');
    var instrumentsButton = document.getElementById('toy-oxygen-instruments-toggle');
    var instruments = document.getElementById('toy-oxygen-instruments');
    var valueNode = document.getElementById('toy-oxygen-value');
    var locationNode = document.getElementById('toy-oxygen-location');
    var helpNode = document.getElementById('toy-oxygen-help');
    var contourButton = document.getElementById('toy-oxygen-contours');
    var flowButton = document.getElementById('toy-oxygen-flow');
    var probe = document.getElementById('toy-oxygen-probe');
    var probeValue = document.getElementById('toy-oxygen-probe-value');
    var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    var fieldCanvas = document.createElement('canvas');
    var maskCanvas = document.createElement('canvas');
    var baseCanvas = document.createElement('canvas');
    var fieldContext = fieldCanvas.getContext('2d');
    var maskContext = maskCanvas.getContext('2d');
    var baseContext = baseCanvas.getContext('2d');
    var controller = null, snapshot = null, renderedRevision = null, renderedController = null;
    var enabled = false, contours = true, flow = true, disposed = false;
    var pixelRatio = 1, worldWidth = 1, worldHeight = 1;
    var raf = 0, lastFrame = 0, lastSampleWall = 0, lastSampleSeconds = 0, simulationRate = 1;
    var cursor = null, traces = [], traceSequence = 0;
    var bindings = [];
    function listen(target, name, callback, options) {
      target.addEventListener(name, callback, options);
      bindings.push(function () { target.removeEventListener(name, callback, options); });
    }
    function pressed(button, value) {
      button.setAttribute('aria-pressed', String(value));
      button.classList.toggle('is-on', value);
    }
    function cellAt(x, y) {
      if (!snapshot || x < 0 || y < 0 || x >= worldWidth || y >= worldHeight) return -1;
      return Math.min(snapshot.height - 1, Math.floor(y / worldHeight * snapshot.height)) * snapshot.width +
        Math.min(snapshot.width - 1, Math.floor(x / worldWidth * snapshot.width));
    }
    function airAt(x, y) {
      var index = cellAt(x, y);
      return index >= 0 && !(snapshot.solid && snapshot.solid[index]);
    }
    // Bilinear values use air cells only, so a wall never reads as zero oxygen.
    function sample(field, x, y) {
      if (!field || !airAt(x, y)) return null;
      var gx = clamp(x / worldWidth * snapshot.width - .5, 0, snapshot.width - 1);
      var gy = clamp(y / worldHeight * snapshot.height - .5, 0, snapshot.height - 1);
      var left = Math.floor(gx), top = Math.floor(gy), right = Math.min(snapshot.width - 1, left + 1), bottom = Math.min(snapshot.height - 1, top + 1);
      var fx = gx - left, fy = gy - top;
      var cells = [top * snapshot.width + left, top * snapshot.width + right, bottom * snapshot.width + left, bottom * snapshot.width + right];
      var weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      var total = 0, weight = 0;
      for (var i = 0; i < 4; i++) {
        if (snapshot.solid && snapshot.solid[cells[i]] || !Number.isFinite(field[cells[i]])) continue;
        total += field[cells[i]] * weights[i]; weight += weights[i];
      }
      return weight > 0 ? total / weight : null;
    }
    function color(value, pixels, offset) {
      var fraction = clamp(Number.isFinite(value) ? value : AMBIENT, 0, AMBIENT);
      var high = 1;
      while (high < COLORS.length - 1 && fraction > COLORS[high][0]) high++;
      var a = COLORS[high - 1], b = COLORS[high], t = (fraction - a[0]) / (b[0] - a[0]);
      pixels[offset] = a[1] + (b[1] - a[1]) * t;
      pixels[offset + 1] = a[2] + (b[2] - a[2]) * t;
      pixels[offset + 2] = a[3] + (b[3] - a[3]) * t;
      pixels[offset + 3] = 72 + 86 * Math.pow(1 - fraction / AMBIENT, .7);
    }
    function dimensions() {
      var camera = toy.camera ? toy.camera() : { scale: 1 };
      var desired = clamp((window.devicePixelRatio || 1) * (camera.scale || 1), 1, 2.5);
      // Bound both memory and fill cost while retaining crisp contour lines on Retina.
      desired = Math.min(desired, Math.sqrt(2600000 / (worldWidth * worldHeight)));
      desired = Math.round(desired * 8) / 8;
      var width = Math.max(1, Math.round(worldWidth * desired)), height = Math.max(1, Math.round(worldHeight * desired));
      if (canvas.width === width && canvas.height === height) return false;
      pixelRatio = desired; canvas.width = baseCanvas.width = width; canvas.height = baseCanvas.height = height;
      return true;
    }
    function drawContours(ctx) {
      var width = snapshot.width, height = snapshot.height, field = snapshot.oxygen;
      var dx = worldWidth / width, dy = worldHeight / height;
      var a, b, c, d, level, x0, y0, px, py;
      function intersection(edge) {
        var t;
        if (edge === 0) { t = (level - a) / (b - a); px = x0 + t * dx; py = y0; }
        else if (edge === 1) { t = (level - b) / (c - b); px = x0 + dx; py = y0 + t * dy; }
        else if (edge === 2) { t = (level - d) / (c - d); px = x0 + t * dx; py = y0 + dy; }
        else { t = (level - a) / (d - a); px = x0; py = y0 + t * dy; }
      }
      ctx.lineWidth = .8 / pixelRatio;
      ctx.strokeStyle = 'rgba(232,226,214,.52)';
      // Marching squares: each line is an interpolated, measured iso-concentration.
      for (var levelIndex = 0; levelIndex < LEVELS.length; levelIndex++) {
        level = LEVELS[levelIndex]; ctx.beginPath();
        for (var y = 0; y < height - 1; y++) for (var x = 0; x < width - 1; x++) {
          var index = y * width + x;
          if (snapshot.solid && (snapshot.solid[index] || snapshot.solid[index + 1] || snapshot.solid[index + width] || snapshot.solid[index + width + 1])) continue;
          a = field[index]; b = field[index + 1]; c = field[index + width + 1]; d = field[index + width];
          if (!Number.isFinite(a + b + c + d)) continue;
          var bits = (a < level ? 1 : 0) | (b < level ? 2 : 0) | (c < level ? 4 : 0) | (d < level ? 8 : 0);
          if (!bits || bits === 15) continue;
          var edges = EDGES[bits];
          if ((bits === 5 || bits === 10) && (a + b + c + d) * .25 < level) edges = EDGES[bits === 5 ? 10 : 5];
          x0 = (x + .5) * dx; y0 = (y + .5) * dy;
          for (var k = 0; k < edges.length; k += 2) {
            intersection(edges[k]); ctx.moveTo(px, py); intersection(edges[k + 1]); ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }
    }
    function rebuild() {
      fieldCanvas.width = maskCanvas.width = snapshot.width;
      fieldCanvas.height = maskCanvas.height = snapshot.height;
      var image = fieldContext.createImageData(snapshot.width, snapshot.height);
      var mask = maskContext.createImageData(snapshot.width, snapshot.height);
      for (var i = 0; i < snapshot.oxygen.length; i++) {
        var offset = i * 4;
        color(snapshot.oxygen[i], image.data, offset);
        if (snapshot.solid && snapshot.solid[i]) mask.data[offset + 3] = 255;
      }
      fieldContext.putImageData(image, 0, 0); maskContext.putImageData(mask, 0, 0);
      baseContext.setTransform(1, 0, 0, 1, 0, 0); baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      baseContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      baseContext.imageSmoothingEnabled = true; baseContext.imageSmoothingQuality = 'high';
      baseContext.drawImage(fieldCanvas, 0, 0, worldWidth, worldHeight);
      if (contours) drawContours(baseContext);
      // Hard geometry cuts preserve walls instead of smearing color through them.
      baseContext.globalCompositeOperation = 'destination-out'; baseContext.imageSmoothingEnabled = false;
      baseContext.drawImage(maskCanvas, 0, 0, worldWidth, worldHeight);
      baseContext.globalCompositeOperation = 'source-over';
      renderedRevision = snapshot.revision; renderedController = controller;
    }
    function reseed(trace) {
      for (var attempt = 0; attempt < 32; attempt++) {
        traceSequence++;
        // A low-discrepancy seed covers the actual air, with no decorative motion.
        var x = (traceSequence * .61803398875 % 1) * worldWidth;
        var y = (traceSequence * .75487766625 % 1) * worldHeight;
        if (!airAt(x, y)) continue;
        trace.x = x; trace.y = y; trace.life = 2 + traceSequence % 5; trace.age = 0; trace.points = [[x, y]];
        return;
      }
      trace.life = 0; trace.points = [];
    }
    function drawFlow(ctx, dt) {
      if (!snapshot.vx || !snapshot.vy || !flow) return;
      ctx.strokeStyle = 'rgba(245,241,234,.4)'; ctx.fillStyle = 'rgba(245,241,234,.65)';
      ctx.lineWidth = 1 / pixelRatio; ctx.lineCap = 'round';
      if (reducedMotion.matches) {
        // Reduced motion retains still vectors and the full concentration field.
        var spacing = Math.max(30, worldWidth / 28);
        for (var y = spacing * .5; y < worldHeight; y += spacing) for (var x = spacing * .5; x < worldWidth; x += spacing) {
          var vx = sample(snapshot.vx, x, y), vy = sample(snapshot.vy, x, y);
          if (vx === null || vy === null) continue;
          var speed = Math.hypot(vx, vy); if (speed < 1) continue;
          var length = Math.min(spacing * .38, 3 + Math.log1p(speed) * 1.7), ux = vx / speed, uy = vy / speed;
          var endX = x + ux * length, endY = y + uy * length;
          if (!airAt(endX, endY)) continue;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY);
          ctx.moveTo(endX - ux * 3 - uy * 2, endY - uy * 3 + ux * 2); ctx.lineTo(endX, endY); ctx.lineTo(endX - ux * 3 + uy * 2, endY - uy * 3 - ux * 2); ctx.stroke();
        }
        return;
      }
      var count = clamp(Math.round(worldWidth * worldHeight / 6500), 32, 100);
      while (traces.length < count) { var trace = {}; reseed(trace); traces.push(trace); }
      for (var i = 0; i < traces.length; i++) {
        var tracer = traces[i]; if (!(tracer.life > 0) || tracer.age > tracer.life || !airAt(tracer.x, tracer.y)) reseed(tracer);
        var vx = sample(snapshot.vx, tracer.x, tracer.y), vy = sample(snapshot.vy, tracer.x, tracer.y);
        if (vx === null || vy === null) continue;
        if (dt > 0) {
          // Midpoint integration follows the velocity sample, including curved wakes.
          var middleX = tracer.x + vx * dt * .5, middleY = tracer.y + vy * dt * .5;
          var middleVX = sample(snapshot.vx, middleX, middleY), middleVY = sample(snapshot.vy, middleX, middleY);
          var endX = tracer.x + (middleVX === null ? vx : middleVX) * dt;
          var endY = tracer.y + (middleVY === null ? vy : middleVY) * dt;
          if (!airAt(middleX, middleY) || !airAt(endX, endY)) { reseed(tracer); continue; }
          tracer.x = endX; tracer.y = endY; tracer.age += dt;
          tracer.points.push([endX, endY]); if (tracer.points.length > 9) tracer.points.shift();
        }
        if (Math.hypot(vx, vy) < 1 || tracer.points.length < 2) continue;
        ctx.beginPath(); ctx.moveTo(tracer.points[0][0], tracer.points[0][1]);
        for (var p = 1; p < tracer.points.length; p++) ctx.lineTo(tracer.points[p][0], tracer.points[p][1]);
        ctx.stroke(); ctx.beginPath(); ctx.arc(tracer.x, tracer.y, 1.05 / pixelRatio, 0, Math.PI * 2); ctx.fill();
      }
    }
    function updateProbe() {
      if (!cursor || !snapshot || !enabled || !controller) { probe.hidden = true; return; }
      var bounds = stage.getBoundingClientRect(), view = viewport.getBoundingClientRect();
      cursor.x = (cursor.clientX - bounds.left) / bounds.width * worldWidth;
      cursor.y = (cursor.clientY - bounds.top) / bounds.height * worldHeight;
      var value = sample(snapshot.oxygen, cursor.x, cursor.y);
      if (value === null) { probe.hidden = true; return; }
      setText(probeValue, percentage(value)); setText(valueNode, percentage(value)); setText(locationNode, 'At the pointer');
      probe.hidden = false;
      var left = cursor.clientX - view.left + 18, top = cursor.clientY - view.top - 40;
      if (left + probe.offsetWidth > view.width - 10) left = cursor.clientX - view.left - probe.offsetWidth - 18;
      probe.style.left = clamp(left, 8, Math.max(8, view.width - probe.offsetWidth - 8)) + 'px';
      probe.style.top = clamp(top, 8, Math.max(8, view.height - probe.offsetHeight - 8)) + 'px';
    }
    function readings() {
      var stats = controller && controller.stats ? controller.stats() : {};
      if (!cursor || probe.hidden) {
        setText(valueNode, percentage(stats.localOxygenFraction)); setText(locationNode, 'At the fire');
      }
      setText(document.getElementById('toy-i-oxygen'), percentage(stats.localOxygenFraction));
      var mass = stats.oxygenConsumedKg;
      setText(document.getElementById('toy-i-oxygen-used'), Number.isFinite(mass) ? mass < .001 ? (mass * 1e6).toFixed(1) + ' mg' : (mass * 1000).toFixed(2) + ' g' : 'Waiting');
      var heat = stats.heatReleaseW;
      setText(document.getElementById('toy-i-oxygen-heat'), Number.isFinite(heat) ? heat < 1000 ? Math.round(heat) + ' W' : (heat / 1000).toFixed(2) + ' kW' : 'Waiting');
      setText(helpNode, !snapshot ? 'Waiting for the concentration field.' : reducedMotion.matches ? 'Probe the air. Still arrows show its flow.' : 'Move over the air to measure it.');
    }
    function frame(now) {
      raf = 0;
      if (disposed || !enabled || !controller || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / 30) return;
      var state = toy.stats(), dt = state.paused || state.loading || now - lastSampleWall > 1000 ? 0 : Math.min(.05, Math.max(0, (now - lastFrame) / 1000)) * simulationRate;
      lastFrame = now;
      var current = controller.snapshot();
      if (!current || !current.oxygen || current.oxygen.length !== current.width * current.height) return;
      if (current.revision !== renderedRevision || renderedController !== controller) {
        var sampleDelta = current.seconds - lastSampleSeconds, wallDelta = (now - lastSampleWall) / 1000;
        if (wallDelta > .02 && wallDelta < 2 && sampleDelta >= 0) simulationRate = clamp(sampleDelta / wallDelta, 0, 2);
        lastSampleSeconds = current.seconds; lastSampleWall = now; snapshot = current;
        worldWidth = current.worldWidth; worldHeight = current.worldHeight;
        dimensions(); rebuild(); readings();
      } else if (dimensions()) rebuild();
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(baseCanvas, 0, 0);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawFlow(context, dt); updateProbe();
      if (cursor && !probe.hidden) {
        context.strokeStyle = 'rgba(245,241,234,.85)'; context.lineWidth = 1 / pixelRatio;
        var radius = 6 / pixelRatio, gap = 2 / pixelRatio; context.beginPath();
        context.moveTo(cursor.x - radius, cursor.y); context.lineTo(cursor.x - gap, cursor.y);
        context.moveTo(cursor.x + gap, cursor.y); context.lineTo(cursor.x + radius, cursor.y);
        context.moveTo(cursor.x, cursor.y - radius); context.lineTo(cursor.x, cursor.y - gap);
        context.moveTo(cursor.x, cursor.y + gap); context.lineTo(cursor.x, cursor.y + radius); context.stroke();
      }
    }
    function start() { if (!raf && enabled && controller && !document.hidden) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); } }
    function update() {
      if (disposed) return;
      var next = typeof toy.oxygen === 'function' ? toy.oxygen() : null;
      if (controller !== next) {
        controller = next; snapshot = null; renderedRevision = null; renderedController = null; traces = []; cursor = null;
        lastSampleWall = 0; lastSampleSeconds = 0; simulationRate = 1;
        context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
      }
      toggleButton.hidden = instruments.hidden = instrumentsButton.hidden = !controller;
      canvas.hidden = panel.hidden = !enabled || !controller;
      shell.classList.toggle('has-oxygen-overlay', enabled && !!controller);
      pressed(toggleButton, enabled && !!controller); pressed(instrumentsButton, enabled && !!controller);
      if (!enabled || !controller) { probe.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
      readings(); start();
    }
    function toggle(value) { enabled = value === undefined ? !enabled : !!value; update(); return enabled; }
    listen(toggleButton, 'click', function () { toggle(); });
    listen(instrumentsButton, 'click', function () { toggle(); });
    listen(contourButton, 'click', function () { contours = !contours; pressed(contourButton, contours); renderedRevision = null; start(); });
    listen(flowButton, 'click', function () { flow = !flow; traces = []; pressed(flowButton, flow); });
    listen(viewport, 'pointermove', function (event) {
      if (!enabled || event.target.closest('#toy-oxygen-legend, .toy-panel, .toy-scene-action')) { cursor = null; probe.hidden = true; return; }
      cursor = { clientX: event.clientX, clientY: event.clientY }; updateProbe();
    }, { passive: true });
    listen(viewport, 'pointerleave', function () { cursor = null; probe.hidden = true; readings(); });
    listen(document, 'visibilitychange', function () { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else start(); });
    listen(reducedMotion, 'change', function () { traces = []; readings(); start(); });
    function destroy() {
      disposed = true; if (raf) cancelAnimationFrame(raf); raf = 0;
      bindings.forEach(function (remove) { remove(); }); bindings = []; traces = []; snapshot = controller = null;
      canvas.hidden = panel.hidden = probe.hidden = true; shell.classList.remove('has-oxygen-overlay');
      fieldCanvas.width = maskCanvas.width = baseCanvas.width = 1;
    }
    listen(window, 'pagehide', function (event) { if (!event.persisted) destroy(); });
    update();
    return { toggle: toggle, enabled: function () { return enabled; }, available: function () { return !!controller; }, update: update, destroy: destroy,
      probe: function (x, y) { return snapshot ? sample(snapshot.oxygen, x, y) : null; },
      inspect: function () { return { enabled: enabled, available: !!controller, revision: renderedRevision, contours: contours, flow: flow, reducedMotion: reducedMotion.matches, width: canvas.width, height: canvas.height }; } };
  }
  window.WSSOxygenView = { create: create };
})();
