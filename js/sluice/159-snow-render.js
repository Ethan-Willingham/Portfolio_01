  /* ---- Snow optics: one grain from sky to ground ---- */
  function snowRenderRGB() {
    var day = scatDayWeight(computeSunElevation(timeOfDay));
    return [0.86 + 0.12 * day, 0.86 + 0.115 * day, 0.845 + 0.11 * day];
  }
  function snowDrawEnabled() {
    return worldSnowEnabled && !bathMode && !PERF_DISABLE_WEATHER && weatherTune.enabled;
  }
  function snowCanvasColor() {
    var rgb = snowRenderRGB();
    return 'rgb(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ')';
  }
  // GPU and WebGL draw airborne flakes in the SAME pass as material 5.
  // This is only the Canvas fallback, using the same grain as its snow pile.
  function drawSnowflakes() {
    if (!snowDrawEnabled() || (liquidWGPU && liquidWGPU.renderActive) || (liquidGL && liquidGLProgram)) return;
    var ws = dpr * worldScale, radius = LIQUID_SNOW_DIAMETER * 0.5;
    ctx.save();
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
    liquidCanvasClipTerrain();
    ctx.fillStyle = snowCanvasColor();
    for (var i = 0; i < snow.grains.length; i++) {
      var p = snow.grains[i];
      if (p.x < cam.x - 8 || p.x > cam.x + screenW + 8 || p.y < cam.y - 8 || p.y > cam.y + screenH + 8) continue;
      ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }
  function shaderWarmSnow() {
    // Shared snow shaders are compiled with the liquid renderer. Prime its
    // small atmospheric upload too, without touching simulation particles.
    if (liquidWGPU && liquidWGPU.renderActive) liquidWGPU.draw();
    else drawSnowflakes();
  }
