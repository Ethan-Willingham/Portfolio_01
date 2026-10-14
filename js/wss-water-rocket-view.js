/* Water rocket launch plate. All visible liquid is sampled from the shared
 * native WebGPU water solver; this view never invents a water parcel. */
(function () {
  'use strict';

  var GRAVITY = 9.80665;
  var PSI = 6894.757293;
  var MONO = '"Commit Mono", monospace';
  var BODY = '"Segoe UI", sans-serif';
  var SERIF = 'century_supra_a, Georgia, serif';
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function finite(n, fallback) { return Number.isFinite(n) ? n : fallback; }
  function alpha(hex, opacity) {
    var value = hex.replace('#', '').trim();
    if (value.length !== 6) return hex;
    return 'rgba(' + parseInt(value.slice(0, 2), 16) + ',' + parseInt(value.slice(2, 4), 16) + ',' + parseInt(value.slice(4, 6), 16) + ',' + opacity + ')';
  }
  function niceStep(range) {
    var raw = range / 5, exponent = Math.pow(10, Math.floor(Math.log10(raw))), fraction = raw / exponent;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
  }
  function create(canvas) {
    var ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    var style = getComputedStyle(canvas);
    function token(name, fallback) { return style.getPropertyValue(name).trim() || fallback; }
    var c = {
      bg: token('--bg', '#303931'), deep: token('--bg-raised', '#1e2420'),
      text: token('--text', '#e8e2d6'), bright: token('--text-bright', '#f5f1ea'),
      faint: token('--text-faint', '#a4a293'), dim: token('--text-dim', '#b8b2a2'),
      rule: token('--rule', '#4a544b'), line: token('--line-mid', '#767d71'),
      gold: token('--accent', '#d4c4a0'), sage: '#9ec79a', pine: '#6f9a6c',
      water: '#8fb3c7', coral: '#d9978c', copper: '#cf9f78'
    };
    var width = 0, height = 0, dpr = 0, disposed = false;
    var lastElapsed = null, lastPhase = null, cameraRange = 2.4;
    var scene = null;

    function line(x1, y1, x2, y2, color, weight) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color; ctx.lineWidth = weight || 1; ctx.stroke();
    }
    function circle(x, y, r, fill, stroke, weight) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = weight || 1; ctx.stroke(); }
    }
    function label(text, x, y, size, color, align, font) {
      ctx.font = (size || 10) + 'px ' + (font || MONO);
      ctx.fillStyle = color || c.faint; ctx.textAlign = align || 'left';
      ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y);
    }
    function rounded(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
    function bottlePath() {
      ctx.beginPath(); ctx.moveTo(-31, -250);
      ctx.bezierCurveTo(-43, -249, -47, -242, -47, -226);
      ctx.lineTo(-47, -96); ctx.bezierCurveTo(-47, -70, -32, -57, -15, -39);
      ctx.lineTo(-15, -19); ctx.lineTo(15, -19); ctx.lineTo(15, -39);
      ctx.bezierCurveTo(32, -57, 47, -70, 47, -96);
      ctx.lineTo(47, -226); ctx.bezierCurveTo(47, -242, 43, -249, 31, -250);
      ctx.closePath();
    }
    // A revolved cross-section keeps the visible fill close to the volume.
    var slices = [], cumulative = [], volumeTotal = 0;
    for (var iy = -19; iy >= -250; iy--) {
      var radius = iy > -39 ? 15 : iy > -96 ? 15 + 32 * Math.sin((-iy - 39) / 57 * Math.PI / 2) : iy < -226 ? 47 - 16 * Math.pow((-iy - 226) / 24, 2) : 47;
      volumeTotal += radius * radius; slices.push(iy); cumulative.push(volumeTotal);
    }
    function fillLevel(fraction) {
      var requested = clamp(fraction, 0, 1) * volumeTotal;
      for (var i = 0; i < cumulative.length; i++) if (cumulative[i] >= requested) return slices[i];
      return -250;
    }
    function trackTime(state) {
      var now = finite(state.elapsed, state.flightTime || 0);
      if ((state.phase === 'ready' && lastPhase !== 'ready') ||
          (lastElapsed !== null && now < lastElapsed)) cameraRange = 2.4;
      lastPhase = state.phase;
      return now;
    }
    function landscape(ground, ppm) {
      var farY = ground - Math.min(59, height * .10);
      // Quiet survey contours become a recognisable horizon when the camera
      // pulls back. They are scenery, never used as a distance measurement.
      for (var layer = 0; layer < 4; layer++) {
        ctx.beginPath();
        for (var x = -12; x <= width + 12; x += 6) {
          var y = farY + layer * 12 + Math.sin(x / (120 + layer * 12) + .8) * (13 - layer * 1.5) +
            Math.cos(x / 59 + layer * .7) * 5 + Math.sin(x / 230 + 3) * 12;
          if (x === -12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = alpha(c.line, .12 + layer * .025); ctx.lineWidth = .8; ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, ground + 2); ctx.lineTo(width, ground + 2);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath();
      ctx.fillStyle = alpha(c.deep, .18); ctx.fill();
      line(24, ground + 2, width - 24, ground + 2, alpha(c.gold, .25));
      for (var j = 0; j < 22; j++) {
        var xx = 32 + j * (width - 64) / 21;
        line(xx, ground + 2, xx - 6, ground + 8, alpha(c.gold, .16), .7);
      }
      if (height > 350) {
        label('LAUNCH PLANE', 29, ground + 29, 9, c.faint);
        label('0.0', width - 29, ground + 29, 9, c.faint, 'right');
      }
    }
    function background(state, options, ground, ppm, rocketX, readyScale) {
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
      var wash = ctx.createLinearGradient(0, 0, width, height);
      wash.addColorStop(0, alpha(c.deep, .54)); wash.addColorStop(.55, alpha(c.bg, 0)); wash.addColorStop(1, alpha(c.gold, .035));
      ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
      var isResting = state.phase === 'ready' || state.phase === 'charging' || state.phase === 'armed';
      var glow = ctx.createRadialGradient(rocketX, ground - 168 * readyScale, 10, rocketX, ground - 168 * readyScale, Math.min(width, height) * .66);
      glow.addColorStop(0, alpha(c.gold, .06)); glow.addColorStop(1, alpha(c.gold, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      var grid = width < 600 ? 40 : 56;
      ctx.fillStyle = alpha(c.text, .10);
      for (var x = 24; x < width; x += grid) for (var y = 28; y < ground - 18; y += grid) ctx.fillRect(x, y, 1, 1);
      if (isResting) {
        var centerY = ground - 159 * readyScale, radius = 182 * readyScale;
        circle(rocketX, centerY, radius, null, alpha(c.gold, .14), .8);
        circle(rocketX, centerY, radius + 8, null, alpha(c.gold, .06), .6);
        for (var a = 0; a < 60; a++) {
          var angle = a * Math.PI / 30, length = a % 5 === 0 ? 8 : 3;
          line(rocketX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius,
            rocketX + Math.cos(angle) * (radius + length), centerY + Math.sin(angle) * (radius + length),
            alpha(c.gold, a % 5 === 0 ? .23 : .13), .7);
        }
        ctx.save(); ctx.setLineDash([3, 7]);
        line(rocketX, 43, rocketX, ground + 14, alpha(c.gold, .18), .75);
        ctx.restore();
        var progress = clamp(state.pressurePa / (90 * PSI), 0, 1);
        if (progress > 0) {
          ctx.beginPath(); ctx.arc(rocketX, centerY, radius + 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.strokeStyle = alpha(c.gold, .55); ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      landscape(ground, ppm);
      var plateY = height > 440 ? 31 : 23;
      if (width > 680) label('VERTICAL FLIGHT', width - 28, plateY, 9, c.faint, 'right');
      if (!isResting && state.phase !== 'landed' && state.phase !== 'settling') label('Rocket enlarged in flight', 28, height - 21, 9, c.faint);
    }
    function ruler(state, options, ground, ppm) {
      var unitScale = options.unit === 'imperial' ? 3.280839895 : 1;
      var suffix = options.unit === 'imperial' ? 'ft' : 'm';
      var displayedRange = (ground - 58) / ppm * unitScale;
      var tick = niceStep(displayedRange), x = width - (width < 560 ? 31 : 49);
      line(x, 67, x, ground, alpha(c.gold, .30), 1);
      label(suffix, x + 1, 52, 10, c.gold, 'center');
      for (var value = 0; value <= displayedRange + .0001; value += tick / 5) {
        var y = ground - value / unitScale * ppm;
        if (y < 65) continue;
        var major = Math.abs(value / tick - Math.round(value / tick)) < .001;
        line(x - (major ? 9 : 4), y, x + 3, y, alpha(c.gold, major ? .6 : .25), .8);
        if (major) {
          label(value < 1 && value > 0 ? value.toFixed(1) : String(Math.round(value * 10) / 10), x - 15, y + 3, 9, c.faint, 'right');
          if (value > 0) line(24, y, x - 30, y, alpha(c.gold, .055), .7);
        }
      }
      var previous = finite(options.previousPeak, 0);
      if (previous > .05) {
        var previousY = ground - previous * ppm;
        if (previousY > 76 && previousY < ground - 15) {
          ctx.save(); ctx.setLineDash([3, 5]);
          line(26, previousY, x - 12, previousY, alpha(c.water, .30), .8); ctx.restore();
          label('PREVIOUS ' + Math.round(previous * unitScale) + ' ' + suffix, 28, previousY - 7, 9, c.water);
        }
      }
      if (state.peakAltitude > .6 && (state.phase === 'descending' || state.phase === 'landed')) {
        var peakY = ground - state.peakAltitude * ppm;
        line(scene.rocketX - 56, peakY, scene.rocketX + 67, peakY, alpha(c.gold, .65), 1);
        circle(scene.rocketX, peakY, 3.5, c.bg, c.gold, 1.2);
        label('APOGEE', scene.rocketX + 74, peakY - 7, 9, c.gold);
        label((state.peakAltitude * unitScale).toFixed(1) + ' ' + suffix, scene.rocketX + 74, peakY + 10, 12, c.text);
      }
    }
    function pad(x, y, size, state) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
      // Foot pump, hose, release collar and a three-legged launch fixture.
      ctx.strokeStyle = alpha(c.copper, .75); ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.bezierCurveTo(-65, 18, -134, 12, -127, -29); ctx.stroke();
      ctx.strokeStyle = alpha(c.bright, .15); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-8, -9); ctx.bezierCurveTo(-65, 16, -134, 10, -127, -30); ctx.stroke();
      rounded(-143, -52, 32, 35, 3); ctx.fillStyle = c.deep; ctx.fill(); ctx.strokeStyle = c.line; ctx.lineWidth = 1.2; ctx.stroke();
      line(-127, -53, -127, -90, c.line, 4);
      line(-143, -90, -111, -90, c.copper, 5);
      line(-151, -14, -105, -14, c.line, 5);
      circle(-127, -37, 9, c.bg, alpha(c.gold, .8), 1);
      var gaugeAngle = -.78 * Math.PI + clamp(state.pressurePa / (90 * PSI), 0, 1) * 1.56 * Math.PI;
      line(-127, -37, -127 + Math.sin(gaugeAngle) * 6, -37 - Math.cos(gaugeAngle) * 6, c.gold, 1.2);
      circle(-127, -37, 1.3, c.gold);
      ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(-47, 18); ctx.lineTo(-35, 18); ctx.lineTo(0, -8);
      ctx.lineTo(35, 18); ctx.lineTo(47, 18); ctx.lineTo(10, -15); ctx.closePath();
      ctx.fillStyle = c.line; ctx.fill(); ctx.strokeStyle = alpha(c.text, .45); ctx.lineWidth = 1; ctx.stroke();
      rounded(-24, -13, 48, 10, 2); ctx.fillStyle = c.copper; ctx.fill();
      line(-20, -10, 20, -10, alpha(c.bright, .50), 1);
      rounded(-56, 18, 112, 5, 2); ctx.fillStyle = c.deep; ctx.fill();
      ctx.restore();
    }
    function rocket(x, y, size, state, options, resting) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
      ctx.translate(0, -160); ctx.rotate(finite(state.attitude, 0)); ctx.translate(0, 160);
      var waterFraction = clamp(finite(state.waterVolume, 0) / finite(state.bottleVolume, .002), 0, 1);
      var surface = fillLevel(waterFraction);
      // Back fin, then two broad translucent side fins.
      ctx.beginPath(); ctx.moveTo(-5, -129); ctx.lineTo(-15, -17); ctx.lineTo(0, 2); ctx.lineTo(15, -17); ctx.lineTo(5, -129); ctx.closePath();
      ctx.fillStyle = c.pine; ctx.fill();
      var finGradient = ctx.createLinearGradient(-77, -95, 77, 0);
      finGradient.addColorStop(0, c.coral); finGradient.addColorStop(.45, c.copper); finGradient.addColorStop(.5, c.pine); finGradient.addColorStop(1, c.sage);
      for (var side = -1; side <= 1; side += 2) {
        ctx.beginPath(); ctx.moveTo(side * 43, -118); ctx.lineTo(side * 78, -39);
        ctx.lineTo(side * 77, -4); ctx.lineTo(side * 29, -30); ctx.lineTo(side * 29, -76); ctx.closePath();
        ctx.fillStyle = finGradient; ctx.fill(); ctx.strokeStyle = alpha(c.text, .42); ctx.lineWidth = 1; ctx.stroke();
        line(side * 43, -106, side * 68, -32, alpha(c.bright, .40), 1);
        line(side * 68, -32, side * 68, -17, alpha(c.bright, .28), 1);
      }
      bottlePath();
      var glass = ctx.createLinearGradient(-47, 0, 47, 0);
      glass.addColorStop(0, alpha(c.text, .19)); glass.addColorStop(.16, alpha(c.sage, .10));
      glass.addColorStop(.45, alpha(c.deep, .10)); glass.addColorStop(.86, alpha(c.text, .10)); glass.addColorStop(1, alpha(c.text, .22));
      ctx.fillStyle = glass; ctx.fill();
      ctx.save(); bottlePath(); ctx.clip();
      var native = options.nativeWater, resident = Math.min(options.residentWater || 0, native ? native.count : 0);
      if (resident) {
        ctx.fillStyle = alpha(c.water, .75);
        for (var wi = 0; wi < resident; wi++) {
          var nx = native.x[wi], ny = native.y[wi];
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
          var bx = -44 + (nx - 100) * 88 / 120;
          var by = -19 - (348 - ny) * 231 / 145;
          ctx.beginPath(); ctx.arc(bx, by, 1.75, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (var rib = -225; rib < -75; rib += 29) {
        ctx.beginPath(); ctx.moveTo(-47, rib); ctx.bezierCurveTo(-18, rib + 6, 20, rib + 6, 47, rib);
        ctx.strokeStyle = alpha(c.bright, .17); ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-47, rib + 2); ctx.bezierCurveTo(-18, rib + 8, 20, rib + 8, 47, rib + 2);
        ctx.strokeStyle = alpha(c.deep, .16); ctx.stroke();
      }
      var highlight = ctx.createLinearGradient(-43, 0, -27, 0);
      highlight.addColorStop(0, alpha(c.bright, .02)); highlight.addColorStop(.5, alpha(c.bright, .35)); highlight.addColorStop(1, alpha(c.bright, .015));
      ctx.fillStyle = highlight; rounded(-43, -238, 16, 158, 8); ctx.fill();
      line(38, -232, 38, -104, alpha(c.bright, .26), 1.4);
      ctx.restore();
      bottlePath(); ctx.strokeStyle = alpha(c.text, .72); ctx.lineWidth = 1.4; ctx.stroke();
      // A warm paper nose cone makes the bottle legible at flight scale.
      ctx.beginPath(); ctx.moveTo(0, -317); ctx.bezierCurveTo(-9, -307, -36, -278, -44, -250);
      ctx.quadraticCurveTo(0, -239, 44, -250); ctx.bezierCurveTo(36, -278, 9, -307, 0, -317); ctx.closePath();
      var cone = ctx.createLinearGradient(-43, 0, 44, 0);
      cone.addColorStop(0, c.dim); cone.addColorStop(.32, c.text); cone.addColorStop(.57, c.bright); cone.addColorStop(1, c.gold);
      ctx.fillStyle = cone; ctx.fill(); ctx.strokeStyle = alpha(c.bright, .8); ctx.lineWidth = 1; ctx.stroke();
      line(0, -310, -3, -251, alpha(c.bg, .2), .8);
      ctx.beginPath(); ctx.moveTo(-41, -253); ctx.quadraticCurveTo(0, -242, 41, -253);
      ctx.strokeStyle = c.copper; ctx.lineWidth = 3.5; ctx.stroke();
      label('02', 0, -190, 35, alpha(c.text, .88), 'center', SERIF);
      label('LITRES', 0, -175, 7, c.dim, 'center');
      rounded(-17, -27, 34, 14, 2); ctx.fillStyle = c.copper; ctx.fill();
      for (var thread = -25; thread < -13; thread += 4) line(-17, thread, 17, thread, alpha(c.deep, .45), 1);
      rounded(-10, -14, 20, 11, 2); ctx.fillStyle = c.line; ctx.fill();
      line(-7, -4, 7, -4, c.deep, 3);
      if (resting && width > 510 && height > 390) {
        var right = Math.min(159, (width - x - 80) / size);
        var airY = Math.min(-123, surface - 25);
        line(55, airY, 76, airY, alpha(c.gold, .55), .8);
        line(76, airY, 91, airY - 12, alpha(c.gold, .55), .8);
        line(91, airY - 12, right, airY - 12, alpha(c.gold, .55), .8);
        circle(55, airY, 2, c.gold);
        label('AIR', right, airY - 21, 9 / Math.max(.85, size), c.gold, 'right');
        if (waterFraction > .01) {
          var waterY = surface + (-33 - surface) * .4;
          line(43, waterY, 77, waterY, alpha(c.water, .70), .8);
          line(77, waterY, 92, waterY + 12, alpha(c.water, .70), .8);
          line(92, waterY + 12, right, waterY + 12, alpha(c.water, .70), .8);
          circle(43, waterY, 2, c.water);
          label('WATER', right, waterY + 28, 9 / Math.max(.85, size), c.water, 'right');
        }
      }
      ctx.restore();
    }
    function nativeExhaust(native, resident, birthAltitudes, state, ground, ppm, rocketX) {
      if (!native || !native.count) return;
      var radius = clamp(ppm * .08, .65, 1.7);
      ctx.fillStyle = alpha(c.water, .48);
      for (var i = Math.max(0, resident); i < native.count; i++) {
        var nx = native.x[i], ny = native.y[i];
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
        var altitude = (348 - ny) / 4;
        // The native 2D contact solve can occasionally send a droplet upward
        // with numerical energy. Water left this downward nozzle at its birth
        // altitude, so keep only parcels inside a modest splash envelope.
        if (altitude > Math.max(finite(birthAltitudes && birthAltitudes[i], 0), .5) + .8) continue;
        // The native 2D fluid domain is a local launch-pad cross-section.
        // Compress its horizontal display scale under the height-following
        // camera so a small splash does not masquerade as a wide field.
        var x = rocketX + (nx - 360) / 4 * ppm * .06, y = ground - altitude * ppm;
        if (x < -5 || x > width + 5 || y < -5 || y > ground + 5) continue;
        circle(x, y, radius, c.water);
      }
    }
    function trail(state, ground, ppm, rocketX) {
      if (!state.flightSamples || state.flightSamples.length < 2) return;
      var samples = state.flightSamples, lastY = ground + 100;
      for (var i = 0; i < samples.length; i++) {
        var sample = samples[i], altitude = finite(sample.altitude, sample.y || 0);
        var y = ground - altitude * ppm;
        if (y < 66 || Math.abs(lastY - y) < 10) continue;
        circle(rocketX, y, 1.5, alpha(c.gold, .32)); lastY = y;
      }
    }
    function render(state, options) {
      if (disposed || !state) return;
      options = options || {};
      var bounds = canvas.getBoundingClientRect();
      var nextW = Math.max(1, Math.round(options.width || bounds.width));
      var nextH = Math.max(1, Math.round(options.height || bounds.height));
      var nextDpr = Math.min(2, window.devicePixelRatio || 1);
      if (nextW !== width || nextH !== height || nextDpr !== dpr) {
        width = nextW; height = nextH; dpr = nextDpr;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var now = trackTime(state), elapsedStep = lastElapsed === null ? 0 : clamp(now - lastElapsed, 0, .1);
      lastElapsed = now;
      var resting = state.phase === 'ready' || state.phase === 'charging' || state.phase === 'armed';
      var ground = height - (height > 440 ? 78 : 45);
      var readySize = Math.min(1.12, (height - 147) / 317, (width - 150) / 360);
      readySize = Math.max(.29, readySize);
      var activeSize = Math.max(.23, readySize * Math.exp(-Math.max(0, state.altitude) / 3.8));
      var rocketSize = resting ? readySize : activeSize;
      var currentAltitude = Math.max(0, finite(state.altitude, 0));
      // Keep the launch plane and actual peak in frame. Zoom is a camera-only
      // transformation: tick positions and water trajectories use the same ppm.
      var minRange = 2.4;
      var desiredRange = Math.max(minRange, finite(state.peakAltitude, currentAltitude) * 1.23, currentAltitude * 1.26);
      if (resting) cameraRange = minRange;
      else cameraRange += (desiredRange - cameraRange) * (1 - Math.exp(-elapsedStep * 8));
      var available = ground - Math.max(87, rocketSize * 317 + 30);
      cameraRange = Math.max(cameraRange, currentAltitude * (ground - 65) / Math.max(50, available));
      var ppm = (ground - 66) / Math.max(.5, cameraRange);
      var rocketX = width * (width < 600 ? .50 : .52);
      var rocketY = ground - currentAltitude * ppm;
      if (state.phase === 'settling' || state.phase === 'landed') {
        var angle = finite(state.attitude, 0);
        var lowestLocal = -160 + 160 * Math.abs(Math.cos(angle)) + 78 * Math.abs(Math.sin(angle));
        rocketY = ground - rocketSize * lowestLocal - finite(state.reboundHeight, 0) * ppm;
      }
      scene = { rocketX: rocketX, ground: ground, ppm: ppm };
      background(state, options, ground, ppm, rocketX, readySize);
      ruler(state, options, ground, ppm);
      trail(state, ground, ppm, rocketX);
      var padSize = resting ? readySize : Math.max(.3, Math.min(readySize, ppm / 125));
      pad(rocketX, ground, padSize, state);
      nativeExhaust(options.nativeWater, options.residentWater, options.waterBirthAltitudes, state, ground, ppm, rocketX);
      rocket(rocketX, rocketY, rocketSize, state, options, resting);
      if (resting && height > 440) {
        label('BOTTLE SECTION', rocketX, ground - 337 * readySize, 9, c.faint, 'center');
      } else if (!resting && state.phase !== 'landed') {
        var speed = finite(state.velocity, 0), metric = options.unit !== 'imperial';
        var tagX = rocketX - Math.max(52, rocketSize * 96);
        var tagY = clamp(rocketY - rocketSize * 140, 100, ground - 55);
        line(tagX - 11, tagY - 10, tagX - 11, tagY + 9, alpha(c.gold, .65), 1);
        label((currentAltitude * (metric ? 1 : 3.280839895)).toFixed(1) + (metric ? ' m' : ' ft'), tagX - 20, tagY - 4, 13, c.text, 'right');
        label((Math.abs(speed) * (metric ? 1 : 3.280839895)).toFixed(1) + (metric ? ' m/s' : ' ft/s'), tagX - 20, tagY + 13, 9, c.faint, 'right');
      }
      if (state.phase === 'landed' && height > 330) {
        label('FLIGHT COMPLETE', rocketX, ground + 44, 10, c.gold, 'center');
      }
      return {
        pump: {x: clamp(rocketX - 127 * readySize, 74, width - 80), y: clamp(ground - 98 * readySize, 88, height - 58)},
        latch: {x: clamp(rocketX + 78 * readySize, 80, width - 84), y: clamp(ground - 15 * readySize, 90, height - 54)},
        fill: {x: clamp(rocketX + 116 * readySize, 115, width - 115), y: clamp(ground - 171 * readySize, 100, height - 110)},
        next: {x: clamp(rocketX + 230 * readySize, 80, width - 80), y: clamp(ground - 108 * readySize, 100, height - 60)}
      };
    }
    function destroy() { disposed = true; scene = null; }
    return { render: render, destroy: destroy };
  }
  window.WSSWaterRocketView = { create: create };
}());
