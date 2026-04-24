/* ============================================================
   GLOBE.JS
   Interactive 3D globe: hours of daylight by latitude.
   Day-of-year slider. Click/touch drag to rotate.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('globe-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var wrapper = canvas.parentElement;
  var slider = document.getElementById('day-slider');
  var dateLabel = document.getElementById('date-label');
  var hoverInfo = document.getElementById('hover-info');

  var AXIAL_TILT = 23.4397 * Math.PI / 180;
  var TWO_PI = Math.PI * 2;
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MDAYS  = [31,29,31,30,31,30,31,31,30,31,30,31];

  /* Color ramp: dark blue (0h) to warm white (24h) */
  var STOPS = [
    { t: 0,    r: 12,  g: 18,  b: 55  },
    { t: 0.15, r: 18,  g: 42,  b: 90  },
    { t: 0.3,  r: 25,  g: 80,  b: 115 },
    { t: 0.45, r: 50,  g: 145, b: 130 },
    { t: 0.6,  r: 140, g: 190, b: 90  },
    { t: 0.75, r: 220, g: 210, b: 70  },
    { t: 0.88, r: 250, g: 245, b: 165 },
    { t: 1,    r: 255, g: 255, b: 235 }
  ];

  function lerpColor(hours) {
    var t = Math.max(0, Math.min(1, hours / 24));
    var i = 0;
    for (var k = 1; k < STOPS.length; k++) {
      if (t <= STOPS[k].t) { i = k - 1; break; }
    }
    var a = STOPS[i], b = STOPS[i + 1];
    var f = (t - a.t) / (b.t - a.t);
    return 'rgb(' +
      Math.round(a.r + (b.r - a.r) * f) + ',' +
      Math.round(a.g + (b.g - a.g) * f) + ',' +
      Math.round(a.b + (b.b - a.b) * f) + ')';
  }

  function solarDeclination(day) {
    return AXIAL_TILT * Math.sin(TWO_PI * (day - 81) / 365);
  }

  function daylightHours(lat, day) {
    var decl = solarDeclination(day);
    var latRad = lat * Math.PI / 180;
    var cosHA = -Math.tan(latRad) * Math.tan(decl);
    if (cosHA < -1) return 24;
    if (cosHA > 1) return 0;
    return (2 * Math.acos(cosHA) / TWO_PI) * 24;
  }

  function dayToDate(day) {
    var d = Math.floor(day), cum = 0;
    for (var m = 0; m < 12; m++) {
      if (d < cum + MDAYS[m]) return (d - cum + 1) + ' ' + MONTHS[m];
      cum += MDAYS[m];
    }
    return '31 Dec';
  }

  /* State */
  var W, H, R;
  var rotX = 0.35, rotY = 0;
  var dayOfYear = 172; /* ~summer solstice */
  var dragging = false, lastMX = 0, lastMY = 0;
  var autoSpin = true;
  var hoverLat = null, hoverLon = null;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    var rect = wrapper.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.38;
  }

  /* 3D projection */
  function project(lat, lon) {
    var phi = lat * Math.PI / 180;
    var theta = lon * Math.PI / 180;
    var x0 = Math.cos(phi) * Math.sin(theta);
    var y0 = Math.sin(phi);
    var z0 = Math.cos(phi) * Math.cos(theta);
    var y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX);
    var z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
    var x1 = x0 * Math.cos(rotY) + z1 * Math.sin(rotY);
    var z2 = -x0 * Math.sin(rotY) + z1 * Math.cos(rotY);
    return { x: W/2 + x1 * R, y: H/2 - y1 * R, z: z2, vis: z2 > -0.05 };
  }

  /* Inverse projection for hover */
  function unproject(mx, my) {
    var sx = (mx - W/2) / R, sy = -(my - H/2) / R;
    var sz2 = 1 - sx*sx - sy*sy;
    if (sz2 < 0) return null;
    var sz = Math.sqrt(sz2);
    var x = sx * Math.cos(-rotY) + sz * Math.sin(-rotY);
    var z2 = -sx * Math.sin(-rotY) + sz * Math.cos(-rotY);
    var y = sy * Math.cos(-rotX) - z2 * Math.sin(-rotX);
    var z = sy * Math.sin(-rotX) + z2 * Math.cos(-rotX);
    return { lat: Math.asin(Math.max(-1,Math.min(1,y))) * 180/Math.PI, lon: Math.atan2(x,z) * 180/Math.PI };
  }

  /* Drawing */
  var LATSTEP = 4, LONSTEP = 4;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    /* Subtle glow */
    var glow = ctx.createRadialGradient(W/2, H/2, R*0.9, W/2, H/2, R*1.35);
    glow.addColorStop(0, 'rgba(60,140,120,0.08)');
    glow.addColorStop(1, 'rgba(60,140,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    /* Filled patches */
    for (var lat = -90; lat < 90; lat += LATSTEP) {
      for (var lon = -180; lon < 180; lon += LONSTEP) {
        var cLat = lat + LATSTEP/2, cLon = lon + LONSTEP/2;
        var center = project(cLat, cLon);
        if (!center.vis) continue;

        var corners = [
          project(lat, lon),
          project(lat, lon + LONSTEP),
          project(lat + LATSTEP, lon + LONSTEP),
          project(lat + LATSTEP, lon)
        ];
        var allVis = true;
        for (var c = 0; c < 4; c++) { if (!corners[c].vis) { allVis = false; break; } }
        if (!allVis) continue;

        ctx.fillStyle = lerpColor(daylightHours(cLat, dayOfYear));
        ctx.globalAlpha = 0.45 + 0.55 * Math.max(0, center.z);

        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (var c = 1; c < 4; c++) ctx.lineTo(corners[c].x, corners[c].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* Grid lines */
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;

    for (var lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); var s = false;
      for (var lon = -180; lon <= 180; lon += 3) {
        var p = project(lat, lon);
        if (p.vis) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); }
        else s = false;
      }
      ctx.stroke();
    }
    for (var lon = -180; lon < 180; lon += 30) {
      ctx.beginPath(); var s = false;
      for (var lat = -90; lat <= 90; lat += 3) {
        var p = project(lat, lon);
        if (p.vis) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); }
        else s = false;
      }
      ctx.stroke();
    }

    /* Tropics + arctic circles (dashed) */
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    [23.44, -23.44, 66.56, -66.56].forEach(function (sl) {
      ctx.beginPath(); var s = false;
      for (var lon = -180; lon <= 180; lon += 3) {
        var p = project(sl, lon);
        if (p.vis) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); }
        else s = false;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    /* Outline */
    ctx.beginPath();
    ctx.arc(W/2, H/2, R, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Hover crosshair */
    if (hoverLat !== null) {
      var hp = project(hoverLat, hoverLon);
      if (hp.vis) {
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 4, 0, TWO_PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        var hh = daylightHours(hoverLat, dayOfYear);
        var lbl = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') + '  ' + hh.toFixed(1) + 'h';
        ctx.font = '13px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim().split(',')[0];
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        var tx = hp.x + 10, ty = hp.y - 10;
        if (tx + 100 > W) tx = hp.x - 100;
        if (ty < 20) ty = hp.y + 20;
        ctx.fillText(lbl, tx, ty);
      }
    }

    /* Labels */
    if (dateLabel) dateLabel.textContent = dayToDate(dayOfYear);
    if (hoverInfo) {
      if (hoverLat !== null) {
        var h = daylightHours(hoverLat, dayOfYear);
        hoverInfo.textContent = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') + '  \u2022  ' + h.toFixed(1) + 'h daylight';
      } else {
        hoverInfo.textContent = 'hover the globe';
      }
    }
  }

  /* Loop */
  var lastTime = 0;
  function tick(ts) {
    if (autoSpin && !dragging) rotY += 0.002;
    draw();
    requestAnimationFrame(tick);
  }

  /* Pointer events */
  function pos(e) {
    var r = canvas.getBoundingClientRect(), src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  canvas.addEventListener('mousedown', function (e) {
    dragging = true; autoSpin = false;
    var p = pos(e); lastMX = p.x; lastMY = p.y;
  });
  canvas.addEventListener('mousemove', function (e) {
    var p = pos(e);
    if (dragging) {
      rotY += (p.x - lastMX) * 0.008;
      rotX += (p.y - lastMY) * 0.008;
      rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
      lastMX = p.x; lastMY = p.y;
    }
    var c = unproject(p.x, p.y);
    if (c) { hoverLat = c.lat; hoverLon = c.lon; }
    else { hoverLat = null; hoverLon = null; }
  });
  canvas.addEventListener('mouseup', function () { dragging = false; });
  canvas.addEventListener('mouseleave', function () { dragging = false; hoverLat = null; hoverLon = null; });

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault(); dragging = true; autoSpin = false;
    var p = pos(e); lastMX = p.x; lastMY = p.y;
    var c = unproject(p.x, p.y);
    if (c) { hoverLat = c.lat; hoverLon = c.lon; }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var p = pos(e);
    rotY += (p.x - lastMX) * 0.008;
    rotX += (p.y - lastMY) * 0.008;
    rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
    lastMX = p.x; lastMY = p.y;
    var c = unproject(p.x, p.y);
    if (c) { hoverLat = c.lat; hoverLon = c.lon; }
  }, { passive: false });
  canvas.addEventListener('touchend', function () { dragging = false; hoverLat = null; hoverLon = null; });

  /* Slider */
  if (slider) slider.addEventListener('input', function () { dayOfYear = parseInt(this.value, 10); });

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();
