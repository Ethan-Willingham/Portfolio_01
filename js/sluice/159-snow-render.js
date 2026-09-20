  /* ---- Snow optics: slowly tumbling atmospheric flakes ---- */
  function snowColors() {
    var wp = weatherPalette(), arc = computeSunElevation(timeOfDay);
    var day = scatDayWeight(arc), dusk = Math.max(0, 1 - Math.abs(Math.sin(arc)) * 5);
    var light = wMix(wp.moonHi, wp.snow, 0.25 + day * 0.65);
    light = wMix(light, wp.sunsetHi, dusk * 0.16);
    var shade = wMix(wp.nightBase, wp.dayBase, 0.25 + day * 0.58);
    return { top: wRGBA(light, 1), body: wRGBA(wMix(shade, light, 0.77), 1),
      packed: wRGBA(wMix(shade, light, 0.51), 1), shade: wRGBA(wMix(shade, light, 0.36), 1),
      far: wRGBA(light, 0.47), flake: wRGBA(light, 0.78), near: wRGBA(light, 0.95) };
  }
  function snowRenderRGB() {
    var day = scatDayWeight(computeSunElevation(timeOfDay));
    return [0.48 + 0.43 * day, 0.61 + 0.33 * day, 0.73 + 0.23 * day];
  }
  function drawSnowflakes() {
    if (!worldSnowEnabled || bathMode || PERF_DISABLE_WEATHER || !weatherTune.enabled) return;
    var colors = snowColors(), ws = dpr * worldScale;
    ctx.save();
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
    for (var band = 0; band < 3; band++) {
      ctx.fillStyle = band === 0 ? colors.far : band === 1 ? colors.flake : colors.near;
      ctx.beginPath();
      for (var i = 0; i < snow.grains.length; i++) {
        var p = snow.grains[i];
        if (Math.min(2, Math.floor(p.size * 3)) !== band || p.x < cam.x - 8 || p.x > cam.x + screenW + 8 || p.y < cam.y - 8 || p.y > cam.y + screenH + 8) continue;
        // Projected area changes as each flake tumbles. After contact, the
        // shared solver renders this mass using its own particle pass.
        var face = 0.45 + 0.55 * Math.abs(Math.sin(snow.time * (1.1 + p.size) + p.phase));
        var size = 0.65 + p.size * 1.35;
        var x = Math.round(p.x * ws) / ws, y = Math.round(p.y * ws) / ws;
        ctx.rect(x - size * 0.5, y - size * face * 0.5, size, Math.max(0.55, size * face));
        if (band === 2) {
          ctx.rect(x - size * 0.23, y - size * 0.7, size * 0.46, size * 1.4);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }
  function shaderWarmSnow() {
    var enabled = worldSnowEnabled, grains = snow.grains;
    try {
      worldSnowEnabled = true; snow.grains = [];
      for (var n = 0; n < 12; n++) snow.grains.push({ x: cam.x + 40 + n * 9, y: cam.y + 70, size: (n % 3) * 0.4, phase: n });
      drawSnowflakes();
    } finally { worldSnowEnabled = enabled; snow.grains = grains; }
  }
