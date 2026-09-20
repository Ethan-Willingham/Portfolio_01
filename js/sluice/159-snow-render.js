  /* ---- Snow optics: lit powder banks and slowly tumbling flakes ---- */
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
  function drawSnowCover() {
    if (!worldSnowEnabled || bathMode || PERF_DISABLE_WEATHER || !weatherTune.enabled) return;
    var colors = snowColors();
    ctx.save();
    var ws = dpr * worldScale;
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
    // Adjacent columns share the same edge height. The bed stays coherent
    // while mass slumps sideways or compresses beneath the tracks.
    for (var layer = 0; layer < 4; layer++) {
      ctx.fillStyle = layer === 0 ? colors.shade : layer === 1 ? colors.body : layer === 2 ? colors.packed : colors.top;
      ctx.beginPath();
      for (var i = 0; i < snow.banks.length; i++) {
        var b = snow.banks[i], x = b.col * SNOW_CELL, base = b.row * TILE, height = snowHeight(b);
        if (b.mass <= 0 || x + SNOW_CELL < cam.x || x > cam.x + screenW || base < cam.y || base - height > cam.y + screenH) continue;
        var left = snowBank(b.col - 1, b.row, false), right = snowBank(b.col + 1, b.row, false);
        var lh = left && left.mass ? (height + snowHeight(left)) * 0.5 : Math.min(1, height * 0.3);
        var rh = right && right.mass ? (height + snowHeight(right)) * 0.5 : Math.min(1, height * 0.3);
        var yl = base - lh, yr = base - rh;
        if (layer === 2 && b.pack < 0.45) continue;
        if (layer === 3) {
          // Broken soft crowns, not a bright outline around every column.
          var grain = wHash(b.col, b.row, 391);
          if (b.pack > 0.7 || grain < 0.28) continue;
          var lip = Math.min(1.4, height * 0.2);
          ctx.moveTo(x, yl); ctx.lineTo(x + SNOW_CELL, yr);
          ctx.lineTo(x + SNOW_CELL, yr + lip); ctx.lineTo(x, yl + lip);
        } else {
          var lower = layer === 2 ? Math.min(base, Math.max(yl, yr) + 2.5) :
            layer === 1 ? base - Math.min(3, Math.min(lh, rh) * 0.18) : base;
          ctx.moveTo(x, yl); ctx.lineTo(x + SNOW_CELL, yr);
          ctx.lineTo(x + SNOW_CELL, lower); ctx.lineTo(x, lower);
        }
        ctx.closePath();
      }
      ctx.fill();
    }
    // Packed tread grooves and a few fixed crystals share the material's
    // light. No animated glitter noise, glow pass, or terrain cache rebuild.
    ctx.fillStyle = colors.shade;
    ctx.beginPath();
    for (var j = 0; j < snow.banks.length; j++) {
      var bank = snow.banks[j], bx = bank.col * SNOW_CELL, by = bank.row * TILE - snowHeight(bank);
      if (bank.mass <= 0 || bank.pack < 0.68 || bank.col % 3 || bx < cam.x || bx > cam.x + screenW || by < cam.y || by > cam.y + screenH) continue;
      ctx.rect(bx + 0.7, by + 1.3, 2, 0.7);
    }
    ctx.fill(); ctx.restore();
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
        // Projected area changes as each flake tumbles. Powder fragments have
        // more volume than individual flakes and retain their physical mass.
        var face = 0.45 + 0.55 * Math.abs(Math.sin(snow.time * (1.1 + p.size) + p.phase));
        var size = p.powder ? Math.min(3.7, 1.2 + Math.sqrt(p.mass) * 0.55) : 0.65 + p.size * 1.35;
        var x = Math.round(p.x * ws) / ws, y = Math.round(p.y * ws) / ws;
        ctx.rect(x - size * 0.5, y - size * face * 0.5, size, Math.max(0.55, size * face));
        if (band === 2 || p.powder) {
          ctx.rect(x - size * 0.23, y - size * 0.7, size * 0.46, size * 1.4);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }
  function shaderWarmSnow() {
    var enabled = worldSnowEnabled, banks = snow.banks, cells = snow.cells, grains = snow.grains;
    try {
      worldSnowEnabled = true; snow.banks = []; snow.cells = {}; snow.grains = [];
      var row = Math.max(0, Math.floor((cam.y + 100) / TILE)), col = Math.floor((cam.x + 60) / SNOW_CELL);
      for (var n = 0; n < 12; n++) {
        var b = snowBank(col + n, row, true);
        if (b) { b.mass = 3 + n % 4; b.pack = (n % 3) * 0.4; }
        snow.grains.push({ x: cam.x + 40 + n * 9, y: cam.y + 70, size: (n % 3) * 0.4,
          mass: 1 + n % 5, phase: n, powder: n % 2 });
      }
      drawSnowCover(); drawSnowflakes();
    } finally { worldSnowEnabled = enabled; snow.banks = banks; snow.cells = cells; snow.grains = grains; }
  }
