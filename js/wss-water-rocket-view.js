/* Water rocket launch plate. This view never advances the flight solver.
 * Every spray parcel represents water in the solver's exhaustEvents. */
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
    var parcels = [], lastEventId = -1, lastEventTime = -1, lastFlightTime = 0;
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
    function consumeExhaust(state) {
      var now = finite(state.elapsed, state.flightTime || 0);
      if (state.flightTime < lastFlightTime - .0001 || (state.phase === 'ready' && lastPhase !== 'ready') || (lastElapsed !== null && now < lastElapsed)) {
        parcels.length = 0; lastEventId = -1; lastEventTime = -1;
        cameraRange = 2.4;
      }
      var events = state.exhaustEvents || [];
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.kind !== 'water' || !(event.mass > 0)) continue;
        if (event.id != null ? event.id <= lastEventId : event.time <= lastEventTime) continue;
        lastEventId = event.id == null ? lastEventId : event.id;
        lastEventTime = event.time;
        // The three streaks partition this actual emitted mass. The small
        // symmetric spread depicts jet breakup, not a horizontal rocket force.
        var spread = Math.min(2.1, event.exhaustVelocity * .041);
        var scatter = Math.sin((event.id == null ? event.time * 1000 : event.id) * 127.1) * 43758.5453;
        scatter -= Math.floor(scatter);
        for (var k = -1; k <= 1; k++) {
          parcels.push({ time: finite(event.elapsed, now - Math.max(0, state.flightTime - event.time)),
            y: event.altitude, vy: event.velocity - event.exhaustVelocity,
            vx: k * spread * (.12 + .88 * scatter), mass: event.mass / 3,
            slot: k, id: event.id == null ? event.time * 1000 : event.id });
        }
      }
      // Water is no longer drawn once the parcel reaches the launch plane.
      parcels = parcels.filter(function (p) {
        var age = Math.max(0, now - p.time);
        return p.y + p.vy * age - .5 * GRAVITY * age * age >= -.015 && age < 15;
      });
      lastFlightTime = state.flightTime || 0; lastPhase = state.phase;
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
      if (!isResting) label('Rocket enlarged in flight', 28, height - 21, 9, c.faint);
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
      if (waterFraction > .0001) {
        var water = ctx.createLinearGradient(0, surface, 0, -16);
        water.addColorStop(0, alpha(c.water, .74)); water.addColorStop(.3, alpha(c.water, .49)); water.addColorStop(1, alpha(c.water, .30));
        ctx.beginPath(); ctx.moveTo(-55, surface);
        for (var wx = -55; wx <= 55; wx += 2) {
          var wave = Math.sin(wx / 21 + state.elapsed * 1.8) * (resting ? 1.05 : .35);
          ctx.lineTo(wx, surface + wave);
        }
        ctx.lineTo(55, 0); ctx.lineTo(-55, 0); ctx.closePath(); ctx.fillStyle = water; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-49, surface);
        ctx.bezierCurveTo(-20, surface - 2, 19, surface + 2, 49, surface);
        ctx.strokeStyle = alpha(c.bright, .77); ctx.lineWidth = 1.4; ctx.stroke();
        // Refracted bands remain inside the actual water volume.
        ctx.strokeStyle = alpha(c.water, .25); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-37, surface + 11); ctx.bezierCurveTo(-30, surface + 22, -26, -56, -12, -33); ctx.stroke();
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
    function exhaust(now, ground, ppm, rocketX) {
      ctx.save(); ctx.lineCap = 'round';
      for (var i = 0; i < parcels.length; i++) {
        var p = parcels[i], age = Math.max(0, now - p.time);
        var altitude = p.y + p.vy * age - .5 * GRAVITY * age * age;
        var x = rocketX + p.vx * age * ppm, y = ground - altitude * ppm;
        var oldAge = Math.max(0, age - (age < .024 ? .004 : .001));
        var previousY = p.y + p.vy * oldAge - .5 * GRAVITY * oldAge * oldAge;
        if (y < -10 || y > ground + 2 || x < 0 || x > width) continue;
        // Mass controls opacity and width, so tiny integration steps never
        // produce a full-strength jet on their own.
        var strength = clamp(p.mass * 1800, .08, .7);
        ctx.strokeStyle = alpha(p.slot === 0 ? c.bright : c.water, strength);
        ctx.lineWidth = clamp(Math.cbrt(p.mass * 1e6) * .12, .6, 2.2);
        ctx.beginPath(); ctx.moveTo(rocketX + p.vx * oldAge * ppm, ground - previousY * ppm);
        ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();
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
      var now = consumeExhaust(state), elapsedStep = lastElapsed === null ? 0 : clamp(now - lastElapsed, 0, .1);
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
      scene = { rocketX: rocketX, ground: ground, ppm: ppm };
      background(state, options, ground, ppm, rocketX, readySize);
      ruler(state, options, ground, ppm);
      trail(state, ground, ppm, rocketX);
      var padSize = resting ? readySize : Math.max(.3, Math.min(readySize, ppm / 125));
      pad(rocketX, ground, padSize, state);
      exhaust(now, ground, ppm, rocketX);
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
    }
    function destroy() { disposed = true; parcels.length = 0; scene = null; }
    return { render: render, destroy: destroy };
  }
  window.WSSWaterRocketView = { create: create };
}());
