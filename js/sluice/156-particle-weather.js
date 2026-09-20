  /* ---- One moving weather field shared by the whole outdoor world ---- */
  function particleWeatherRect() {
    return { left: Math.max(3, cam.x - 160), right: Math.min(COLS * TILE - 3, cam.x + screenW + 160),
      top: cam.y - 160, bottom: Math.min(SKY_ROWS * TILE - 8, cam.y + screenH + 160) };
  }
  function particleWeatherState() { return { time: 0, wind: 0, seen: {}, tick: 0, rect: null, level: -1 }; }
  function particleWeatherHash(c, r, salt) {
    var n = Math.imul(c, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(salt, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function particleWeatherField(state, rect, parts, density, cap, intensity, wind, speeds, dt, spawn, retire) {
    state.time += dt; state.wind += wind * dt; state.tick += dt;
    // A fixed world lattice moves with the air. Intensity selects the same
    // scattered fraction everywhere, including places never visited. No
    // top-edge curtain, camera-shaped refill strips or frozen old storms.
    var level = Math.max(0, Math.min(1, intensity)) * Math.min(1,
      cap * 0.72 / Math.max(1, density * (screenW + 320) * (screenH + 320)));
    var old = state.rect;
    if (state.tick < 0.1 && old && Math.abs(rect.left - old.left) < 32 && Math.abs(rect.right - old.right) < 32 &&
        Math.abs(rect.top - old.top) < 32 && Math.abs(rect.bottom - old.bottom) < 32 && Math.abs(level - state.level) < 0.005) return;
    state.tick = 0; state.rect = rect; state.level = level;
    var active = {};
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i], outside = p.x < rect.left - 32 || p.x > rect.right + 32 || p.y < rect.top - 32 || p.y > rect.bottom + 32;
      // Physical powder and shaft water keep their own life after contact.
      if (!p.physical && p.y < SKY_ROWS * TILE - 10 && ((p.weatherRank !== undefined && p.weatherRank >= level) || outside)) {
        retire(p); parts[i] = parts[parts.length - 1]; parts.pop();
      } else if (p.weatherKey !== undefined) active[p.weatherKey] = 1;
    }
    if (density <= 0 || level <= 0 || rect.bottom <= rect.top || rect.right <= rect.left) { state.seen = {}; return; }
    var pitch = Math.sqrt(speeds.length / density), seen = {};
    for (var layer = 0; layer < speeds.length; layer++) {
      var speed = speeds[layer], offsetY = state.time * speed, salt = 31 + layer * 11;
      var c0 = Math.floor((rect.left - state.wind - 24) / pitch), c1 = Math.floor((rect.right - state.wind + 24) / pitch);
      var r0 = Math.floor((rect.top - offsetY - 6) / pitch), r1 = Math.floor((rect.bottom - offsetY + 6) / pitch);
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
        var rank = particleWeatherHash(c, r, salt);
        if (rank >= level) continue;
        var key = layer + ':' + c + ':' + r;
        var size = layer / (speeds.length - 1), phase = particleWeatherHash(c, r, salt + 3) * Math.PI * 2;
        var x = (c + particleWeatherHash(c, r, salt + 1)) * pitch + state.wind;
        var y = (r + particleWeatherHash(c, r, salt + 2)) * pitch + offsetY;
        if (speed < 100) { x -= Math.cos(state.time * (1.4 + size) + phase) * (13 + size * 16) / (1.4 + size); y -= Math.cos(state.time * 1.7 + phase) * 9 / 1.7; }
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue;
        if (state.seen[key] || active[key]) { seen[key] = 1; continue; }
        var born = spawn(x, y, size, phase);
        if (born) { born.weatherKey = key; born.weatherRank = rank; seen[key] = 1; }
      }
    }
    // Remember consumed flakes until their source leaves, preserving the
    // rig's wake and preventing a scooped or landed particle from duplicating.
    state.seen = seen;
  }
  function particleWeatherSave(state) {
    return { time: state.time, wind: state.wind, seen: Object.keys(state.seen) };
  }
  function particleWeatherRestore(data) {
    var state = particleWeatherState();
    if (!data || !Number.isFinite(data.time) || data.time < 0 || !Number.isFinite(data.wind)) return state;
    state.time = data.time; state.wind = data.wind;
    if (Array.isArray(data.seen)) for (var i = 0; i < Math.min(30000, data.seen.length); i++) {
      var key = data.seen[i];
      if (typeof key === 'string' && /^[0-2]:-?\d{1,10}:-?\d{1,10}$/.test(key)) state.seen[key] = 1;
    }
    return state;
  }
