/* ============================================================
   GLOBE.JS — Earth globe with satellite texture, day/night
   terminator, and sliders for hour, day, tilt, and epoch.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('globe-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var wrapper = canvas.parentElement;

  var TWO_PI = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* ---- Load satellite texture ---- */
  var texCanvas = document.createElement('canvas');
  var texCtx = texCanvas.getContext('2d', { willReadFrequently: true });
  var texData = null;
  var texW = 0, texH = 0;
  var textureReady = false;

  var earthImg = new Image();
  earthImg.crossOrigin = 'anonymous';
  earthImg.onload = function () {
    texW = earthImg.width;
    texH = earthImg.height;
    texCanvas.width = texW;
    texCanvas.height = texH;
    texCtx.drawImage(earthImg, 0, 0);
    texData = texCtx.getImageData(0, 0, texW, texH).data;
    textureReady = true;
  };
  earthImg.src = 'earth.jpg';

  function sampleTexture(lat, lon) {
    if (!textureReady) return [40, 80, 60]; // fallback green
    // Map lat/lon to UV
    var u = ((lon + 180) % 360) / 360;
    var v = (90 - lat) / 180;
    var px = Math.floor(u * texW) % texW;
    var py = Math.floor(v * texH);
    if (py < 0) py = 0;
    if (py >= texH) py = texH - 1;
    var idx = (py * texW + px) * 4;
    return [texData[idx], texData[idx + 1], texData[idx + 2]];
  }

  /* ---- Slider refs ---- */
  var hourSlider = document.getElementById('hour-slider');
  var daySlider = document.getElementById('day-slider');
  var tiltSlider = document.getElementById('tilt-slider');
  var epochSlider = document.getElementById('epoch-slider');
  var hourLabel = document.getElementById('hour-label');
  var dayLabel = document.getElementById('day-label');
  var tiltLabel = document.getElementById('tilt-label');
  var epochLabel = document.getElementById('epoch-label');
  var epochDesc = document.getElementById('epoch-desc');
  var hoverInfo = document.getElementById('hover-info');

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MDAYS  = [31,29,31,30,31,30,31,31,30,31,30,31];

  function dayToDate(d) {
    var day = Math.floor(d), cum = 0;
    for (var m = 0; m < 12; m++) {
      if (day < cum + MDAYS[m]) return (day - cum + 1) + ' ' + MONTHS[m];
      cum += MDAYS[m];
    }
    return '31 Dec';
  }

  /* ---- Epoch data ---- */
  var EPOCHS = [
    { val: 0,   label: '4.5 Gya', desc: 'Earth forms from accretion disk. Moon-forming impact. No stable axis yet.' },
    { val: 5,   label: '4.0 Gya', desc: 'Late Heavy Bombardment. Tilt stabilized by the Moon near 23\u00B0.' },
    { val: 10,  label: '3.5 Gya', desc: 'First life. Stromatolites. Faint young sun (70% current brightness).' },
    { val: 20,  label: '2.4 Gya', desc: 'Great Oxygenation Event. Snowball Earth episodes.' },
    { val: 30,  label: '1.5 Gya', desc: 'Boring billion. Stable climate. Eukaryotes emerge.' },
    { val: 40,  label: '540 Mya', desc: 'Cambrian explosion. Complex life. Obliquity ~23.5\u00B0.' },
    { val: 50,  label: '250 Mya', desc: 'Permian extinction. Pangaea. 95% of species lost.' },
    { val: 55,  label: '66 Mya',  desc: 'Chicxulub impact. End of dinosaurs. Mammals rise.' },
    { val: 60,  label: '2 Mya',   desc: 'Pleistocene ice ages. Milankovitch cycles dominate. Tilt: 22.1\u00B0\u201324.5\u00B0.' },
    { val: 65,  label: 'Today',   desc: 'Obliquity 23.44\u00B0. Currently decreasing at 0.013\u00B0/century.' },
    { val: 70,  label: '+600 My',  desc: 'Tidal braking slows Earth. Days lengthen to ~30 hours.' },
    { val: 75,  label: '+1.1 Gy',  desc: 'Sun 10% brighter. Oceans begin evaporating. End of complex life.' },
    { val: 80,  label: '+3.5 Gy',  desc: 'Runaway greenhouse. Surface temperature exceeds 100\u00B0C. Oceans gone.' },
    { val: 85,  label: '+5 Gy',    desc: 'Sun exhausts hydrogen. Becomes a red giant. Mercury and Venus consumed.' },
    { val: 90,  label: '+5.4 Gy',  desc: 'Red giant at maximum. Solar radius reaches Earth\'s orbit.' },
    { val: 95,  label: '+6 Gy',    desc: 'Sun sheds outer layers. Planetary nebula. White dwarf remnant.' },
    { val: 100, label: '+10 Gy',   desc: 'White dwarf cools. Heat death approaches. Darkness.' }
  ];

  function getEpochInfo(val) {
    for (var i = EPOCHS.length - 1; i >= 0; i--) {
      if (val >= EPOCHS[i].val) return EPOCHS[i];
    }
    return EPOCHS[0];
  }

  function getEpochTilt(val) {
    if (val <= 5) return 23;
    if (val < 60) return 23.4 + Math.sin(val * 0.8) * 0.7;
    if (val <= 65) return 23.44;
    if (val <= 70) return 23.44 + Math.sin((val - 65) * 0.5) * 1;
    return 23.44;
  }

  /* ---- State ---- */
  var W, H, R;
  var rotX = 0.3, rotY = -0.5;
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
    R = Math.min(W, H) * 0.4;
  }

  /* ---- 3D ---- */
  function project(lat, lon) {
    var phi = lat * DEG, theta = lon * DEG;
    var x0 = Math.cos(phi) * Math.sin(theta);
    var y0 = Math.sin(phi);
    var z0 = Math.cos(phi) * Math.cos(theta);
    var y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX);
    var z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
    var x1 = x0 * Math.cos(rotY) + z1 * Math.sin(rotY);
    var z2 = -x0 * Math.sin(rotY) + z1 * Math.cos(rotY);
    return { x: W / 2 + x1 * R, y: H / 2 - y1 * R, z: z2, vis: z2 > -0.01 };
  }

  function unproject(mx, my) {
    var sx = (mx - W / 2) / R, sy = -(my - H / 2) / R;
    var sz2 = 1 - sx * sx - sy * sy;
    if (sz2 < 0) return null;
    var sz = Math.sqrt(sz2);
    var x = sx * Math.cos(-rotY) + sz * Math.sin(-rotY);
    var z2 = -sx * Math.sin(-rotY) + sz * Math.cos(-rotY);
    var y = sy * Math.cos(-rotX) - z2 * Math.sin(-rotX);
    var z = sy * Math.sin(-rotX) + z2 * Math.cos(-rotX);
    return { lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG, lon: Math.atan2(x, z) / DEG };
  }

  /* ---- Sunlight ---- */
  function subsolarPoint(hour, dayOfYear, tilt) {
    var declination = tilt * DEG * Math.sin(TWO_PI * (dayOfYear - 81) / 365);
    var lon = -(hour - 12) * 15;
    return { lat: declination, lon: lon * DEG };
  }

  function sunlight(lat, lon, subLat, subLon) {
    var phi = lat * DEG, lam = lon * DEG;
    var dot = Math.sin(phi) * Math.sin(subLat) +
              Math.cos(phi) * Math.cos(subLat) * Math.cos(lam - subLon);
    if (dot > 0.05) return 1;
    if (dot < -0.05) return 0;
    return (dot + 0.05) / 0.1;
  }

  /* ---- Draw ---- */
  var STEP = 3; // higher resolution for texture

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var hour = hourSlider ? parseFloat(hourSlider.value) : 12;
    var day = daySlider ? parseInt(daySlider.value) : 172;
    var tilt = tiltSlider ? parseFloat(tiltSlider.value) : 23.44;
    var epoch = epochSlider ? parseFloat(epochSlider.value) : 65;
    var sub = subsolarPoint(hour, day, tilt);

    /* Atmosphere glow */
    var glow = ctx.createRadialGradient(W / 2, H / 2, R * 0.92, W / 2, H / 2, R * 1.25);
    glow.addColorStop(0, 'rgba(80,150,255,0.07)');
    glow.addColorStop(1, 'rgba(80,150,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    /* Atmosphere rim */
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R + 2, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(100,180,255,0.1)';
    ctx.lineWidth = 4;
    ctx.stroke();

    /* Render patches with texture */
    for (var lat = -90; lat < 90; lat += STEP) {
      for (var lon = -180; lon < 180; lon += STEP) {
        var cLat = lat + STEP / 2;
        var cLon = lon + STEP / 2;
        var center = project(cLat, cLon);
        if (!center.vis) continue;

        var corners = [
          project(lat, lon),
          project(lat, lon + STEP),
          project(lat + STEP, lon + STEP),
          project(lat + STEP, lon)
        ];
        var allVis = true;
        for (var c = 0; c < 4; c++) { if (!corners[c].vis) { allVis = false; break; } }
        if (!allVis) continue;

        /* Sample texture color */
        var col = sampleTexture(cLat, cLon);
        var r = col[0], g = col[1], b = col[2];

        /* Epoch scorching effect */
        if (epoch > 75) {
          var scorch = Math.min(1, (epoch - 75) / 20);
          r = Math.min(255, Math.round(r + scorch * (180 - r)));
          g = Math.round(g * (1 - scorch * 0.6));
          b = Math.round(b * (1 - scorch * 0.8));
        }

        /* Day/night shading */
        var sun = sunlight(cLat, cLon, sub.lat, sub.lon);
        var nightFactor = 0.12 + sun * 0.88;
        var depthShade = 0.5 + 0.5 * Math.max(0, center.z);

        var fr = Math.round(r * nightFactor * depthShade);
        var fg = Math.round(g * nightFactor * depthShade);
        var fb = Math.round(b * nightFactor * depthShade);

        /* City lights effect on night side (faint warm dots on land) */
        if (sun < 0.2 && textureReady) {
          var brightness = (r + g + b) / 3;
          if (brightness > 60 && brightness < 200) {
            // Land areas get a faint warm glow at night
            var glow2 = (1 - sun / 0.2) * 0.15;
            fr = Math.min(255, Math.round(fr + 40 * glow2));
            fg = Math.min(255, Math.round(fg + 30 * glow2));
            fb = Math.min(255, Math.round(fb + 10 * glow2));
          }
        }

        ctx.fillStyle = 'rgb(' + fr + ',' + fg + ',' + fb + ')';
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (var c = 1; c < 4; c++) ctx.lineTo(corners[c].x, corners[c].y);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* Grid lines */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.4;
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

    /* Tropics + Arctic circles */
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    [tilt, -tilt, 90 - tilt, -(90 - tilt)].forEach(function (sl) {
      if (sl < -90 || sl > 90) return;
      ctx.beginPath(); var s = false;
      for (var lon = -180; lon <= 180; lon += 3) {
        var p = project(sl, lon);
        if (p.vis) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); }
        else s = false;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    /* Equator */
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); var s = false;
    for (var lon = -180; lon <= 180; lon += 3) {
      var p = project(0, lon);
      if (p.vis) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); }
      else s = false;
    }
    ctx.stroke();

    /* Globe outline */
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Terminator line */
    ctx.strokeStyle = 'rgba(255,200,100,0.15)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    var started = false;
    for (var angle = 0; angle <= 360; angle += 2) {
      var a = angle * DEG;
      var tLat = Math.asin(Math.cos(sub.lat) * Math.sin(a));
      var tLon = sub.lon + Math.atan2(Math.cos(a), -Math.sin(sub.lat) * Math.sin(a));
      var p = project(tLat / DEG, tLon / DEG);
      if (p.vis) {
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      } else { started = false; }
    }
    ctx.stroke();

    /* Hover */
    if (hoverLat !== null) {
      var hp = project(hoverLat, hoverLon);
      if (hp.vis) {
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 4, 0, TWO_PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        var hSun = sunlight(hoverLat, hoverLon, sub.lat, sub.lon);
        var lbl = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') +
                  ', ' + Math.abs(Math.round(hoverLon)) + '\u00B0' + (hoverLon >= 0 ? 'E' : 'W') +
                  ' \u2022 ' + (hSun > 0.5 ? 'Day' : 'Night');
        ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim().split(',')[0];
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        var tx = hp.x + 12, ty = hp.y - 10;
        if (tx + 160 > W) tx = hp.x - 160;
        if (ty < 20) ty = hp.y + 20;
        ctx.fillText(lbl, tx, ty);
      }
    }

    /* Update labels */
    if (hourLabel) {
      var h = Math.floor(hour), m = Math.round((hour - h) * 60);
      hourLabel.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ' UTC';
    }
    if (dayLabel) dayLabel.textContent = dayToDate(day);
    if (tiltLabel) tiltLabel.textContent = tilt.toFixed(1) + '\u00B0';
    if (epochLabel) { var ei = getEpochInfo(epoch); epochLabel.textContent = ei.label; }
    if (epochDesc) { var ei = getEpochInfo(epoch); epochDesc.textContent = ei.desc; }
    if (hoverInfo) {
      if (hoverLat !== null) {
        var hSun = sunlight(hoverLat, hoverLon, sub.lat, sub.lon);
        hoverInfo.textContent = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') +
          ' \u2022 ' + (hSun > 0.5 ? 'Sunlit' : 'In shadow');
      } else {
        hoverInfo.textContent = 'drag to spin \u2022 hover for info';
      }
    }
  }

  /* ---- Loop ---- */
  function tick() {
    if (autoSpin && !dragging) rotY += 0.0015;
    draw();
    requestAnimationFrame(tick);
  }

  /* ---- Events ---- */
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
      rotY += (p.x - lastMX) * 0.007;
      rotX += (p.y - lastMY) * 0.007;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
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
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var p = pos(e);
    rotY += (p.x - lastMX) * 0.007;
    rotX += (p.y - lastMY) * 0.007;
    rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
    lastMX = p.x; lastMY = p.y;
    var c = unproject(p.x, p.y);
    if (c) { hoverLat = c.lat; hoverLon = c.lon; }
  }, { passive: false });
  canvas.addEventListener('touchend', function () { dragging = false; hoverLat = null; hoverLon = null; });

  /* Epoch slider auto-sets tilt */
  if (epochSlider) {
    epochSlider.addEventListener('input', function () {
      var val = parseFloat(this.value);
      var autoTilt = getEpochTilt(val);
      if (tiltSlider) {
        tiltSlider.value = autoTilt.toFixed(1);
        if (tiltLabel) tiltLabel.textContent = autoTilt.toFixed(1) + '\u00B0';
      }
    });
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();
