  // ====== ORBITAL LAND: the world beneath the atmospheric horizon ======
  // A cached, low-resolution surface shares the sky shader's sphere and
  // camera. Ascent reveals it behind weather and every world layer.
  // Changing the clock only recolours the same invented coastlines.
  var planetSurface = null;

  function planetNoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = tileHash01(ix, iy, 0x51A7), b = tileHash01(ix + 1, iy, 0x51A7);
    var c = tileHash01(ix, iy + 1, 0x51A7), d = tileHash01(ix + 1, iy + 1, 0x51A7);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  function buildPlanetSurface(cw, ch) {
    // Three CSS pixels per art pixel, bounded on Retina displays too.
    var w = Math.min(480, Math.max(120, Math.ceil(cw / Math.max(1, dpr) / 3)));
    var h = Math.max(1, Math.round(w * ch / cw));
    var key = w + ':' + h + ':' + cw / ch + ':' + SUN.fovY_deg + ':' + SUN.pitch_deg;
    if (planetSurface && planetSurface.key === key) return planetSurface;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), img = g.createImageData(w, h), count = w * h;
    var P = { key: key, canvas: c, ctx: g, img: img, lightKey: '',
      material: new Uint8Array(count), relief: new Float32Array(count),
      nx: new Float32Array(count), ny: new Float32Array(count), nz: new Float32Array(count),
      air: new Float32Array(count), cloud: new Float32Array(count), top: h };
    var t = Math.tan(SUN.fovY_deg * Math.PI / 360);
    var pitch = SUN.pitch_deg * Math.PI / 180, cp = Math.cos(pitch), sp = Math.sin(pitch);
    var radius = SKY_PLANET_RADIUS, ro = radius + SKY_OBSERVER_ALTITUDE, aspect = cw / ch;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var vx = ((x + 0.5) / w * 2 - 1) * t * aspect;
        var vy = (1 - (y + 0.5) / h * 2) * t;
        var ry = cp * vy + sp, rz = -sp * vy + cp;
        var len = Math.sqrt(vx * vx + ry * ry + rz * rz);
        var dx = vx / len, dy = ry / len, dz = rz / len;
        var b = ro * dy, disc = b * b - ro * ro + radius * radius;
        if (dy >= 0 || disc <= 0) continue;
        var distance = -b - Math.sqrt(disc);
        var nx = dx * distance / radius, ny = (ro + dy * distance) / radius;
        var nz = dz * distance / radius;
        P.nx[i] = nx; P.ny[i] = ny; P.nz[i] = nz;
        // Domain warping makes broad bays and peninsulas. The small octave
        // roughens coasts without turning the land into scattered speckles.
        var u = nx * 250 + 4.8, v = nz * 250 + 2.0;
        var wu = u + (planetNoise(u * 0.7 + 9, v * 0.7) - 0.5) * 0.9;
        var wv = v + (planetNoise(u * 0.7, v * 0.7 + 17) - 0.5) * 0.9;
        var land = planetNoise(wu, wv) * 0.72 + planetNoise(wu * 2.2, wv * 2.2) * 0.21 +
          planetNoise(wu * 5.1, wv * 5.1) * 0.07;
        P.material[i] = land > 0.53 ? 2 : 1;
        P.relief[i] = land;
        // Sparse distant cloud streaks are separate from local flight weather.
        P.cloud[i] = Math.max(0, (planetNoise(u * 1.2 + v * 0.6 + 31, v * 3.2) - 0.66) * 1.3);
        var grazing = Math.max(0, -(nx * dx + ny * dy + nz * dz));
        P.air[i] = Math.exp(-grazing * 24);
        // The limb alone fades into the existing atmospheric glow.
        var edge = Math.min(1, grazing / 0.055);
        img.data[i * 4 + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
        P.top = Math.min(P.top, y);
      }
    }
    planetSurface = P;
    return P;
  }

  function colourPlanetSurface(P) {
    var clock = Math.round(timeOfDay * 2400) / 2400;
    var air = atmosHorizonRGB;
    var key = clock + ':' + Math.round(moonPhase * 1000) + ':' + SUN.altitude_deg + ':' + SUN.azimuth_deg +
      ':' + Math.round(air.r / 4) + ':' + Math.round(air.g / 4) + ':' + Math.round(air.b / 4);
    if (P.lightKey === key) return;
    P.lightKey = key;
    var arc = computeSunElevation(clock);
    var altitude = Math.sin(arc) * SUN.altitude_deg * Math.PI / 180;
    var azimuth = Math.cos(arc) * SUN.azimuth_deg * Math.PI / 180;
    var sx = Math.cos(altitude) * Math.sin(azimuth), sy = Math.sin(altitude);
    var sz = Math.cos(altitude) * Math.cos(azimuth);
    var day = scatDayWeight(arc);
    var dusk = Math.pow(Math.max(0, 1 - Math.abs(sy) / 0.32), 2) * day;
    var moon = (1 - Math.cos(moonPhase * Math.PI * 2)) * 0.5;
    var oceanNight = nightSkyHexRGB(SKY.planetOceanNight), ocean = nightSkyHexRGB(SKY.planetOcean);
    var landNight = nightSkyHexRGB(SKY.planetLandNight), land = nightSkyHexRGB(SKY.planetLand);
    var coast = nightSkyHexRGB(SKY.planetCoast), cloud = nightSkyHexRGB(SKY.planetCloud);
    var warm = nightSkyHexRGB(SKY.planetDusk);
    var bytes = P.img.data;
    for (var i = P.top * P.canvas.width; i < P.material.length; i++) {
      if (!P.material[i]) continue;
      var isLand = P.material[i] === 2, night = isLand ? landNight : oceanNight;
      var base = isLand ? land : ocean;
      var light = Math.max(0, P.nx[i] * sx + P.ny[i] * sy + P.nz[i] * sz);
      var lit = day * (0.58 + 0.42 * Math.min(1, light / 0.75));
      var relief = isLand ? Math.floor(P.relief[i] * 12) / 12 : 0.5;
      var shore = isLand && P.relief[i] < 0.56 ? 0.32 : 0;
      var haze = P.air[i] * 0.70;
      var warmth = dusk * (0.12 + 0.08 * sx * P.nx[i] * 12);
      var cloudA = P.cloud[i] * (0.35 + day * 0.65);
      var at = i * 4;
      // Fixed channel access avoids dynamic property lookups in the hot pixel loop.
      // Keep the operation order and rounding identical to the original painter.
      var targetR = base.r + (coast.r - base.r) * shore;
      targetR *= 0.90 + relief * 0.20;
      var valueR = night.r * (0.82 + moon * 0.18) + (targetR - night.r) * lit;
      valueR += (warm.r - valueR) * warmth;
      valueR += (cloud.r * (0.24 + lit * 0.76) - valueR) * cloudA;
      valueR += (air.r - valueR) * haze;
      bytes[at] = Math.round(valueR);
      var targetG = base.g + (coast.g - base.g) * shore;
      targetG *= 0.90 + relief * 0.20;
      var valueG = night.g * (0.82 + moon * 0.18) + (targetG - night.g) * lit;
      valueG += (warm.g - valueG) * warmth;
      valueG += (cloud.g * (0.24 + lit * 0.76) - valueG) * cloudA;
      valueG += (air.g - valueG) * haze;
      bytes[at + 1] = Math.round(valueG);
      var targetB = base.b + (coast.b - base.b) * shore;
      targetB *= 0.90 + relief * 0.20;
      var valueB = night.b * (0.82 + moon * 0.18) + (targetB - night.b) * lit;
      valueB += (warm.b - valueB) * warmth;
      valueB += (cloud.b * (0.24 + lit * 0.76) - valueB) * cloudA;
      valueB += (air.b - valueB) * haze;
      bytes[at + 2] = Math.round(valueB);
    }
    P.ctx.putImageData(P.img, 0, 0);
  }

  function drawPlanetSurface(cw, ch, skyBottomPx) {
    // No allocation until ascent can expose the shader's planetary horizon.
    if (skyBottomPx / ch < 0.62) return;
    var P = buildPlanetSurface(cw, ch);
    colourPlanetSurface(P);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    var top = P.top / P.canvas.height * ch;
    if (top < ch) ctx.drawImage(P.canvas, 0, P.top, P.canvas.width, P.canvas.height - P.top,
      0, top, cw, ch - top);
    ctx.restore();
  }
