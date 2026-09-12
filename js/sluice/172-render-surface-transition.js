  // ===== Surface cut bank =====
  // Sparse roots and a soft soil shadow over a recessed earth face. The
  // face loses light and definition with depth until the existing cave wall
  // takes over. No outlined lower silhouette or floating foreground slab.
  // X follows two depth planes; Y always stays pinned to the world surface.
  var SURFACE_TRANSITION_DEPTH = TILE * 5;
  var SURFACE_TRANSITION_STRIP = 384;
  var SURFACE_BANK_EDGE_DEPTH = 12;
  var surfaceTransitionCache = new Map();

  function surfaceBankNoise(x, scale, seed) {
    var u = x / scale, i = Math.floor(u), t = u - i;
    t = t * t * (3 - 2 * t);
    return tileHash01(i, seed, 713) * (1 - t) + tileHash01(i + 1, seed, 713) * t;
  }

  function surfaceBankRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  // The rear bank sits slightly below the playable ground. Broad uneven
  // shoulders and smaller broken edges replace the ruler-straight horizon.
  // Keep its lowest point within the mountains' existing 12px lower skirt.
  function surfaceBankEdge(x) {
    return 1 + surfaceBankNoise(x, 117, 401) * 4 +
      surfaceBankNoise(x, 37, 407) * 5 + surfaceBankNoise(x, 9, 431) * 1.5;
  }

  function clipSurfaceBank(worldLeft, worldRight, bottom) {
    var ox = cam.x * 0.30, surfaceY = SKY_ROWS * TILE;
    // Sample in the bank's own coordinates so the same contour scrolls
    // with its texture. The wall and both detail planes share this mask.
    var left = Math.floor((worldLeft - ox) / 2) * 2 - 2;
    var right = Math.ceil((worldRight - ox) / 2) * 2 + 2;
    ctx.beginPath();
    ctx.moveTo(left + ox, surfaceY + surfaceBankEdge(left));
    for (var x = left + 2; x <= right; x += 2) {
      ctx.lineTo(x + ox, surfaceY + surfaceBankEdge(x));
    }
    ctx.lineTo(right + ox, bottom);
    ctx.lineTo(left + ox, bottom);
    ctx.closePath();
    ctx.clip();
  }

  function surfaceBankEase(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function buildSurfaceBankStrip(index, near) {
    var w = SURFACE_TRANSITION_STRIP, h = near ? 64 : SURFACE_TRANSITION_DEPTH;
    var left = index * w;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d');
    var day = cx.createImageData(w, h), night = cx.createImageData(w, h);
    var light = surfaceBankRGB(near ? BG.surfaceHumus : BG.surfaceBankLight);
    var shade = surfaceBankRGB(BG.surfaceBankShade);
    var dark = surfaceBankRGB(near ? BG.surfaceRootShade : BG.surfaceBankNight);
    var wall = surfaceBankRGB(BG.wallTopsoil);
    for (var x = 0; x < w; x++) {
      var wx = left + x;
      var broad = surfaceBankNoise(wx, 130, 29);
      var broken = surfaceBankNoise(wx, 23, 41);
      var lip = 4 + surfaceBankNoise(wx, 53, 67) * 7 +
        surfaceBankNoise(wx, 9, 93) * 5 + tileHash01(Math.floor(wx / 2), 51, 19) * 2;
      var warp = broad * 19 + broken * 5;
      var reach = 94 + broad * 38 + broken * 14;
      var edge = surfaceBankEdge(wx);
      for (var y = 0; y < h; y++) {
        var at = (y * w + x) * 4;
        var grain = tileHash01(wx, y, 101) - 0.5;
        var alpha, value, skyLight;
        if (near) {
          // A slight contact shadow shares the earth face beneath it.
          // An opaque mat plus a dark lower rim read as a separate slab,
          // especially at night. Feather this small shadow through the
          // same material instead of introducing a second colour band.
          alpha = 0.30 * (1 - surfaceBankEase(0, lip + 8, y));
          value = grain * 3;
          skyLight = 0.8;
        } else {
          // Uneven bedding is interrupted by broad erosion patches. Seams
          // are short shaded recesses, never parallel stripes across a pit.
          var depth = y + warp;
          var bed = depth / 19, band = Math.floor(bed), f = bed - band;
          var patch = surfaceBankNoise(wx + band * 31, 37, band + 211);
          var seam = (1 - surfaceBankEase(0.02, 0.19, f)) * Math.max(0, patch - 0.35) * 18;
          var facet = surfaceBankNoise(wx + y * 1.7, 32, 163) - 0.5;
          value = facet * 10 + grain * 3 - seam;
          skyLight = Math.exp(-Math.max(0, y - edge) / 44) * (0.72 + broad * 0.22);
          alpha = 1 - surfaceBankEase(reach - 52, reach, y);
        }
        for (var ch = 0; ch < 3; ch++) {
          var base = near ? light[ch] : shade[ch] * 0.48 + wall[ch] * 0.52;
          day.data[at + ch] = base + (light[ch] - base) * skyLight + value;
          night.data[at + ch] = base + (dark[ch] - base) * skyLight + value * 0.45;
        }
        day.data[at + 3] = night.data[at + 3] = Math.round(alpha * 255);
      }
    }
    if (near) {
      // Roots belong to this shallow rear bank, never the collision plane.
      // Enumerate beyond each strip so branches crossing a cache boundary
      // are drawn identically on both sides. All choices use world hashes.
      var rootDay = document.createElement('canvas'); rootDay.width = w; rootDay.height = h;
      var rootNight = document.createElement('canvas'); rootNight.width = w; rootNight.height = h;
      var rd = rootDay.getContext('2d'), rn = rootNight.getContext('2d');
      rd.putImageData(day, 0, 0); rn.putImageData(night, 0, 0);
      for (var cell = Math.floor((left - 40) / 26); cell <= Math.floor((left + w + 40) / 26); cell++) {
        if (tileHash01(cell, 317, 51) < 0.38) continue;
        var rx = cell * 26 + tileHash01(cell, 13, 95) * 18 - left;
        var length = 14 + Math.pow(tileHash01(cell, 47, 83), 2) * 35;
        var lean = (tileHash01(cell, 31, 97) - 0.5) * 15;
        for (var pass = 0; pass < 2; pass++) {
          var rc = pass ? rn : rd;
          rc.strokeStyle = pass ? BG.surfaceRootShade : BG.surfaceRoot;
          rc.globalAlpha = pass ? 0.50 : 0.65;
          rc.lineCap = 'round'; rc.lineJoin = 'round';
          rc.beginPath(); rc.moveTo(rx, 7);
          rc.lineTo(rx + lean * 0.25 - 1, length * 0.43);
          rc.lineTo(rx + lean * 0.8 + 1, length * 0.76);
          rc.lineTo(rx + lean, length);
          rc.lineWidth = 0.8; rc.stroke();
          rc.beginPath(); rc.moveTo(rx + lean * 0.25 - 1, length * 0.43);
          rc.lineTo(rx - 4 + lean * 0.15, length * 0.59);
          rc.lineTo(rx - 6, length * 0.71);
          if (length > 31) {
            rc.moveTo(rx + lean * 0.8 + 1, length * 0.76);
            rc.lineTo(rx + lean + 5, length * 0.86);
          }
          rc.lineWidth = 0.45; rc.stroke();
        }
      }
      day = rd.getImageData(0, 0, w, h); night = rn.getImageData(0, 0, w, h);
    }
    return { canvas: c, ctx: cx, day: day.data, night: night.data,
      pixels: cx.createImageData(w, h), light: -1 };
  }

  function getSurfaceBankStrip(index, near, light) {
    var key = (near ? 'n' : 'f') + index;
    var entry = surfaceTransitionCache.get(key);
    if (!entry) {
      entry = buildSurfaceBankStrip(index, near);
    } else {
      surfaceTransitionCache.delete(key);
    }
    surfaceTransitionCache.set(key, entry);
    // Bounded LRU: travel across the whole world cannot retain every bank.
    if (surfaceTransitionCache.size > 16) surfaceTransitionCache.delete(surfaceTransitionCache.keys().next().value);
    if (entry.light !== light) {
      var t = light / 64, dst = entry.pixels.data, a = entry.night, b = entry.day;
      for (var i = 0; i < dst.length; i += 4) {
        dst[i] = a[i] + (b[i] - a[i]) * t;
        dst[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
        dst[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * t;
        dst[i + 3] = a[i + 3];
      }
      entry.ctx.putImageData(entry.pixels, 0, 0);
      entry.light = light;
    }
    return entry.canvas;
  }

  function drawSurfaceTransition(worldLeft, worldRight) {
    var surfaceY = SKY_ROWS * TILE;
    if (cam.y > surfaceY + SURFACE_TRANSITION_DEPTH || cam.y + screenH < surfaceY) return;
    var light = Math.round(scatDayWeight(computeSunElevation(timeOfDay)) * 64);
    ctx.save();
    // The caller owns the visible biome band; never tint another biome or
    // the sky, even when the camera is zoomed out across several layers.
    ctx.beginPath(); ctx.rect(worldLeft, surfaceY, worldRight - worldLeft, SURFACE_TRANSITION_DEPTH); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    var transform = ctx.getTransform();
    for (var plane = 0; plane < 2; plane++) {
      var near = plane === 1;
      var ox = cam.x * (near ? 0.10 : 0.30);
      var first = Math.floor((worldLeft - ox) / SURFACE_TRANSITION_STRIP);
      var last = Math.floor((worldRight - ox) / SURFACE_TRANSITION_STRIP);
      for (var index = first; index <= last; index++) {
        var sprite = getSurfaceBankStrip(index, near, light);
        // Shared boundaries must land on the SAME device pixel. Fractional
        // zoom/camera positions otherwise alpha-antialias each canvas edge
        // separately and leave a dark hairline between contiguous strips.
        var start = index * SURFACE_TRANSITION_STRIP + ox;
        var x0 = (Math.round(start * transform.a + transform.e) - transform.e) / transform.a;
        var x1 = (Math.round((start + SURFACE_TRANSITION_STRIP) * transform.a + transform.e) - transform.e) / transform.a;
        ctx.drawImage(sprite, x0, surfaceY, x1 - x0, sprite.height);
      }
    }
    ctx.restore();
  }
