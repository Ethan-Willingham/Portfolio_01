  /* ====== WEATHER: clouds, precipitation, storms ====== */
  // Full dynamic above-ground weather. Three subsystems share one mood-driven
  // state machine:
  //   1. Clouds: cached continuous volumes, scattered in broad banks with
  //      open sky between them. Soft unions join billows BEFORE shading;
  //      depth drives opacity, surface slope and height drive diffuse light.
  //      One bank is one sprite, with no secondary outlines stamped over it.
  //      Day/night recolouring, world altitude, wind and the overcast veil
  //      share the existing weather state and tuning controls.
  //   2. Precip  — WORLD-anchored rain streaks / snow flakes, wind-skewed,
  //                pooled. Drops live at world positions (the field stays put
  //                while the camera moves) and die on the first solid tile,
  //                so precip lands on the ground but falls on down shafts.
  //   3. Storm   — coverage→1, dark clouds, heavy precip, full-screen lightning.
  //
  // Idiomatic to the engine: like the sky and the mountain strips, the heavy
  // noise bake is cached and rebuilt on a bucket, the per-frame cost is a few
  // dozen smoothed drawImage blits. BACKGROUND_STYLE.md §15 documents the
  // deviation from strict pixel-dither discipline (clouds are smooth-upscaled,
  // matching the GL sky) that "gorgeous, overdone" buys us.

  // ----- Feel / look levers (gm 'weather' group; see TUNING.md §5.4) -----
  // deckDensity / deckAltScale / deckThin keep their deck-era NAMES (the sky
  // presets in 380 dial them) but now shape the instanced-cloud field:
  // instance density, field altitudes, and high-altitude thinning toward space.
  var weatherTune = {
    enabled:    1,     // master on/off
    driftScale: 1.0,   // surfaceWind → cloud-drift multiplier
    baseDrift:  6,     // px/s gentle drift in dead calm
    precipRate: 1.0,   // precip particle-count multiplier
    precipSpeed:1.0,   // precip fall-speed multiplier
    lightning:  1,     // storms throw full-screen flashes
    rimGlow:    1.0,   // silver-lining edge brightness (bake)
    highlight:  1.0,   // sunlit-face brightness scale
    shadow:     1.0,   // cloud-base brightness scale (lower = moodier)
    contrast:   1.0,   // cloud internal contrast
    layerAlpha: 1.0,   // global cloud opacity
    softness:   1.0,   // cloud-edge feather (puff hardness; re-bakes on change)
    morphSpeed: 0.0,   // 0 = clouds hold their shape (drift only); >0 = slow billow morph
    precipMode: 0,     // 0 auto (snow in the cold spawn biome) / 1 force rain / 2 force snow
    veil:       1.0,   // overcast/storm stratus-sheet strength
    deckDensity:  1.0, // cloud-instance density across the whole field
    deckAltScale: 1.0, // multiplies every cloud altitude — the field rides higher / lower
    deckThin:     0.50 // fade rate toward space (higher = thinner up high, 0 = solid to the top)
  };

  // ----- Mood table: targets the sim eases toward -----
  //   cov   = cloud coverage 0..1   dark = storm-darkening 0..1
  //   pcp   = precip intensity 0..1  wind = extra wind bias 0..1   lit = lightning
  var WEATHER_MOODS = [
    { name: 'clear',    cov: 0.05, dark: 0.00, pcp: 0.00, wind: 0.00, lit: 0 },
    { name: 'fair',     cov: 0.30, dark: 0.04, pcp: 0.00, wind: 0.05, lit: 0 },
    { name: 'cloudy',   cov: 0.58, dark: 0.16, pcp: 0.00, wind: 0.15, lit: 0 },
    { name: 'overcast', cov: 0.90, dark: 0.40, pcp: 0.06, wind: 0.25, lit: 0 },
    { name: 'precip',   cov: 0.93, dark: 0.50, pcp: 0.58, wind: 0.42, lit: 0 },
    { name: 'storm',    cov: 1.00, dark: 0.72, pcp: 1.00, wind: 0.85, lit: 1 }
  ];
  // Markov transition weights (index → [idx, weight] pairs). Keeps fair/cloudy
  // skies dominant, storms reachable but transient.
  var WEATHER_NEXT = [
    [[0, 0.30], [1, 0.70]],                          // clear
    [[0, 0.25], [1, 0.35], [2, 0.40]],               // fair
    [[1, 0.35], [2, 0.30], [3, 0.35]],               // cloudy
    [[2, 0.35], [3, 0.25], [4, 0.40]],               // overcast
    [[3, 0.45], [4, 0.30], [5, 0.25]],               // precip
    [[4, 0.60], [3, 0.40]]                           // storm
  ];

  var weather = {
    mood: 1, moodT: 30,
    cov: 0.30, dark: 0.04, pcp: 0.0, wind: 0.0,    // live eased values
    tcov: 0.30, tdark: 0.04, tpcp: 0.0, twind: 0.0, // targets
    driftAccum: 0,                                   // wind-drift integral (world px; rows scale it)
    veilDrift: 0,
    morph: 0,                                        // billow morph phase
    flash: 0, flashT: 8, dbl: 0                      // lightning
  };
  var weatherForce = -1;   // dev override: -1 auto, else locked mood index

  // The current world is a single cold (permafrost) surface biome, so precip is
  // snow. When the horizontal town/biome expansion (015-regions.js) feeds
  // worldgen, key this to surface temperature instead.
  function weatherCold() { return true; }
  function weatherPrecipType() {
    if (weatherTune.precipMode === 1) return 'rain';
    if (weatherTune.precipMode === 2) return 'snow';
    return weatherCold() ? 'snow' : 'rain';
  }

  // ----- Value-noise base (wrapped in X; sprites zero their borders anyway) -----
  function wHash(ix, iy, seed) {
    var n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 0x9E3779B1);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function wSmooth(t) { return t * t * (3 - 2 * t); }
  function wClamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  // Value noise, lattice wrapped mod `px` in X (Y is free — the envelopes fade
  // top and bottom so it never needs to wrap).
  function wVal(gx, gy, px, seed) {
    var ix0 = Math.floor(gx), iy0 = Math.floor(gy);
    var fx = gx - ix0, fy = gy - iy0;
    var wx0 = ((ix0 % px) + px) % px;
    var wx1 = ((ix0 + 1) % px + px) % px;
    var iy1 = iy0 + 1;
    var v00 = wHash(wx0, iy0, seed), v10 = wHash(wx1, iy0, seed);
    var v01 = wHash(wx0, iy1, seed), v11 = wHash(wx1, iy1, seed);
    var sx = wSmooth(fx), sy = wSmooth(fy);
    var a = v00 + (v10 - v00) * sx;
    var b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  // Billow fbm in [0,1]. u ∈ [0,1) across tile width; ny in the same scale.
  // Periodic in u so the veil tile repeats seamlessly across the screen.
  function wBillow(u, ny, baseCells, seed, oct) {
    var amp = 0.55, sum = 0, norm = 0;
    for (var o = 0; o < oct; o++) {
      var period = baseCells << o;
      var n = wVal(u * period, ny * period, period, seed + o * 1013);
      n = Math.abs(n * 2 - 1);          // billow → puffy lobes
      sum += n * amp; norm += amp; amp *= 0.5;
    }
    return 1 - sum / norm;              // invert so masses are bright, creases dark
  }
  // Plain fbm in [0,1], periodic in u — used only to warp the billow domain.
  function wFbm(u, ny, baseCells, seed, oct) {
    var amp = 0.5, sum = 0, norm = 0;
    for (var o = 0; o < oct; o++) {
      var period = baseCells << o;
      sum += wVal(u * period, ny * period, period, seed + o * 757) * amp;
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  }
  // ----- Cloud sprite pool -----
  // Three scale families, each with eight deterministic silhouettes. The
  // generous transparent gutter prevents a clipped edge under any seed.
  var CLOUD_CLASSES = [
    { tw: 288, th: 80, worldW: 440, contrast: 0.66, alpha: 0.56, cirrus: true, baseSeed: 41011 },
    { tw: 288, th: 144, worldW: 285, contrast: 0.84, alpha: 0.98, cirrus: false, baseSeed: 52021 },
    { tw: 384, th: 176, worldW: 430, contrast: 0.88, alpha: 1.00, cirrus: false, baseSeed: 63031 }
  ];
  var CLOUD_VARIANTS = 8;          // seeds per class
  var cloudSprites = null;         // [class][variant] = { color, ctx, img, lum, den, ready, dirty }
  var cloudBakeCursor = 0;        // carry the queue position across morph invalidations
  var cloudBakeKey = -1;           // softness/rim bake-lever bucket → re-bake on change
  var cloudLightBucket = -999999;
  var cloudMorphBucket = -999999;

  // ----- The cloud FIELD — a continuous-altitude scatter you fly THROUGH -----
  // v26.38: the LANES this replaced (fixed altitudes + small jitter) still read
  // as horizontal rows of clouds, the same defect as the decks one level up.
  // Now ONE 2D hash lattice covers (x, altitude): rows of cells from just
  // above the ridge to the top of the weather (CLOUD_ROWS), and
  // slot (k, j) hashes whether it holds a cloud and WHERE inside the cell —
  // full-cell jitter in BOTH axes, so cloud altitude is CONTINUOUS and nothing
  // can line up. Every look property is a smooth function of the cloud's OWN
  // altitude (inline in the draw walk): near the ridge clouds are small, pale
  // and far (the valley-distance depth cue that used to be a special horizon
  // lane), the low-mid sky carries full-size cumulus, cirrus wisps take over
  // past ~1.7k via a dithered blend, and density thins toward space. Vertical
  // screen position tracks true world altitude (parallax 1) — you fly through
  // the field, sizes locked (the deck-era expand/contract bug stays dodged:
  // sprites have fixed world size). Horizontal MOTION (camera parallax hPar +
  // wind drift) is shared per ROW so cell enumeration stays consistent under
  // any camera x and unbounded drift accumulation; several motion planes read as
  // smooth depth while POSITIONS stay continuous. Coverage fills and empties
  // the same slots low-hash-first, so weather changes fade individual clouds.
  // Rows follow a geometric progression — short/narrow cells low (the sky is
  // bottom-heavy and the resting view needs the candidates), tall/wide cells
  // high (space thins out). Altitude stays continuous: full-height jitter
  // inside each row and the rows abut, so no boundary can show.
  var CLOUD_FIELD_SEED = 7372;
  var CLOUD_ROWS = (function () {
    var rows = [], lo = 70, h = 150, w = 290;
    while (lo < 3400) {
      rows.push({ lo: lo, h: h, w: w });
      lo += h; h = Math.round(h * 1.26); w = Math.round(w * 1.13);
    }
    return rows;   // Geometrically increasing cells, from the ridge to ~4k altitude
  })();
  var CLOUD_ALT_TOP = CLOUD_ROWS[CLOUD_ROWS.length - 1].lo + CLOUD_ROWS[CLOUD_ROWS.length - 1].h;

  // ----- Overcast stratus VEIL — one continuous sheet, eases in cov ≳ 0.7 -----
  // The deliberate "solid grey day" reading comes from a single soft repeating
  // tile stretched over the whole sky + a top-weighted gradient (denser aloft),
  // NOT from stacking strips. Fades with player altitude so a high climb
  // breaks out above the weather into clear sky.
  var VEIL_TW = 480, VEIL_TH = 288;
  var VEIL_WORLD_W = 1150;         // world px per horizontal repeat
  var VEIL_ALT_FADE0 = 2000, VEIL_ALT_FADE1 = 3600;   // player alt → veil gone
  var veilTile = null;             // { color, ctx, img, lum, den, ready, dirty }

  function weatherInitSprites() {
    cloudSprites = [];
    for (var ci = 0; ci < CLOUD_CLASSES.length; ci++) {
      var C = CLOUD_CLASSES[ci], row = [];
      for (var vi = 0; vi < CLOUD_VARIANTS; vi++) {
        var c = document.createElement('canvas');
        c.width = C.tw; c.height = C.th;
        var cx = c.getContext('2d');
        row.push({
          lum: new Uint8ClampedArray(C.tw * C.th),
          den: new Uint8ClampedArray(C.tw * C.th),
          color: c, ctx: cx, img: cx.createImageData(C.tw, C.th),
          ready: false, dirty: true, recolorDirty: false
        });
      }
      cloudSprites.push(row);
    }
    var v = document.createElement('canvas');
    v.width = VEIL_TW; v.height = VEIL_TH;
    var vctx = v.getContext('2d');
    veilTile = {
      lum: new Uint8ClampedArray(VEIL_TW * VEIL_TH),
      den: new Uint8ClampedArray(VEIL_TW * VEIL_TH),
      color: v, ctx: vctx, img: vctx.createImageData(VEIL_TW, VEIL_TH),
      pat: null, ready: false, dirty: true, recolorDirty: false
    };
  }

  // A cloud is a continuous depth field. Soft unions join the billows before
  // lighting, so a bank has one body instead of stacked translucent outlines.
  // Bake geometry once; daylight only recolours the cached light/opacity maps.
  function weatherBakeSprite(ci, vi) {
    var C = CLOUD_CLASSES[ci], S = cloudSprites[ci][vi];
    var tw = C.tw, th = C.th, seed = C.baseSeed + vi * 7919;
    var depth = new Float32Array(tw * th);
    var detail = new Float32Array(tw * th);
    var lobes = [], li, px, py, idx;
    var base = 0.70 + wHash(vi, 5, seed) * 0.07;
    var tower = 0.30 + wHash(vi, 7, seed) * 0.40;
    var count = C.cirrus ? 5 : 7;
    for (li = 0; li < count; li++) {
      var x = 0.16 + li / (count - 1) * 0.68;
      x += (wHash(li, 11, seed) - 0.5) * 0.065;
      var peak = Math.exp(-Math.pow((x - tower) / 0.25, 2));
      var ry = C.cirrus ? 0.07 + 0.06 * wHash(li, 13, seed) :
        0.10 + 0.19 * peak + 0.07 * wHash(li, 13, seed);
      lobes.push({ x: x, y: C.cirrus ? 0.48 + (x - 0.5) * 0.17 : base - ry * 0.73,
        rx: C.cirrus ? 0.14 : 0.115 + 0.060 * wHash(li, 17, seed), ry: ry,
        z: C.cirrus ? 0.15 : 0.24 + 0.15 * wHash(li, 19, seed) });
    }
    if (!C.cirrus) {
      // Smaller billows grow from the shoulders of the broad volumes. They
      // share the same depth union, so they add cloud detail without seams.
      for (li = 0; li < count; li++) {
        var parent = lobes[li];
        for (var child = 0; child < 3; child++) {
          var angle = 3.55 + child * 0.92 + wHash(li, child + 31, seed) * 0.42;
          var r = 0.26 + wHash(li, child + 41, seed) * 0.16;
          lobes.push({x: parent.x + Math.cos(angle) * parent.rx * 0.82,
            y: parent.y + Math.sin(angle) * parent.ry * 0.78,
            rx: parent.rx * r * 1.25, ry: parent.ry * r,
            z: parent.z * (0.57 + r * 0.30)});
        }
      }
    }
    var softness = 0.70 + weatherTune.softness * 0.30;
    var mz = weather.morph * 0.035;
    for (py = 0, idx = 0; py < th; py++) {
      var v = py / (th - 1);
      for (px = 0; px < tw; px++, idx++) {
        var u = px / (tw - 1);
        // Broad, low-amplitude erosion breaks perfect ellipses. Fine noise
        // is confined to the edge: interiors stay quiet at gameplay scale.
        var n = wFbm(u + mz, v * 0.53, 7, seed + 83, 3);
        var warp = (n - 0.5) * 0.105;
        var ux = u + warp * 0.55;
        var vy = v + warp;
        var z = 0;
        for (li = 0; li < lobes.length; li++) {
          var L = lobes[li];
          var dx = (ux - L.x) / L.rx, dy = (vy - L.y) / L.ry;
          var q = 1 - dx * dx - dy * dy;
          if (q <= 0) continue;
          var lz = Math.sqrt(q) * L.z;
          // Polynomial smooth maximum, with zero outside both volumes.
          var h = Math.max(0, 0.10 - Math.abs(z - lz)) / 0.10;
          z = Math.max(z, lz) + h * h * 0.025;
        }
        var taper = wSmooth(wClamp01(u / 0.08)) * wSmooth(wClamp01((1 - u) / 0.08)) *
          wSmooth(wClamp01(v / 0.08)) * wSmooth(wClamp01((1 - v) / 0.08));
        if (!C.cirrus) {
          // A soft condensation base, gently broken by wind. No ruler edge.
          var baseY = base + 0.025 + (wVal(u * 10, 3.7, 99991, seed + 91) - 0.5) * 0.055;
          taper *= 1 - wSmooth(wClamp01((v - baseY) / 0.105));
        }
        var billow = wBillow(u + mz, v * 0.55, 13, seed + 107, 3);
        var erosion = (0.78 - n) * 0.09 + (0.72 - billow) * 0.035;
        depth[idx] = Math.max(0, z - erosion) * taper;
        detail[idx] = n;
      }
    }
    for (py = 0, idx = 0; py < th; py++) {
      for (px = 0; px < tw; px++, idx++) {
        var d = depth[idx];
        if (d <= 0.001) { S.lum[idx] = 0; S.den[idx] = 0; continue; }
        var left = depth[py * tw + Math.max(0, px - 4)];
        var right = depth[py * tw + Math.min(tw - 1, px + 4)];
        var up = depth[Math.max(0, py - 4) * tw + px];
        var down = depth[Math.min(th - 1, py + 4) * tw + px];
        var nx = (left - right) * tw * 0.09;
        var ny = (up - down) * th * 0.09;
        var normal = (-nx * 0.35 - ny * 0.75 + 0.65) / Math.sqrt(nx * nx + ny * ny + 1);
        var crown = 1 - wSmooth(wClamp01((py / th - 0.30) / 0.50));
        var light = 0.38 + 0.34 * crown + 0.13 * Math.max(0, normal) + (detail[idx] - 0.5) * 0.16;
        // Transmission is broad and faint, never a bright contour around
        // every lobe. Dense interiors occlude the sun and the stars.
        var edge = Math.exp(-d * 16) * wSmooth(wClamp01(d / 0.07));
        light += weatherTune.rimGlow * edge * crown * 0.10;
        var alpha = (1 - Math.exp(-d * (C.cirrus ? 12 : 28) / softness));
        alpha *= wSmooth(wClamp01(d / (0.13 * softness)));
        S.lum[idx] = wClamp01(light) * 255;
        S.den[idx] = wClamp01(alpha) * 255;
      }
    }
    S.dirty = false;
    S.recolorDirty = true;
    S.ready = true;
  }

  // Bake the stratus veil tile: broad soft translucency variation (NOT
  // thresholded masses — it is a sheet), matte lighting, seamless in X.
  function weatherBakeVeil() {
    var T = veilTile, idx = 0;
    for (var py = 0; py < VEIL_TH; py++) {
      var ny = py / VEIL_TW;
      // seamless in Y too: crossfade the last rows back into the first
      var yFade = Math.min(1, (VEIL_TH - 1 - py) / 46);
      for (var px = 0; px < VEIL_TW; px++, idx++) {
        var u = px / VEIL_TW;
        var F = wBillow(u, ny, 3, 60607, 4);
        if (yFade < 1) {
          var F0 = wBillow(u, (py - VEIL_TH) / VEIL_TW, 3, 60607, 4);
          F = F0 + (F - F0) * yFade;
        }
        T.den[idx] = ((0.62 + 0.38 * F) * 242) | 0;
        T.lum[idx] = ((0.52 + 0.34 * F) * 255) | 0;
      }
    }
    T.dirty = false;
    T.recolorDirty = true;
    T.ready = true;
  }

  function wMix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  // Fixed cloud/precip colour anchors, parsed once from the SKY palette (170).
  // Lazy because SKY is defined in a later fragment; only read at draw time.
  var _wp = null;
  function weatherPalette() {
    if (_wp) return _wp;
    function a(hex) { var c = nightSkyHexRGB(hex); return [c.r, c.g, c.b]; }
    _wp = {
      sunsetHi: a(SKY.cloudSunsetHi), dayBase: a(SKY.cloudDayBase), duskBase: a(SKY.cloudDuskBase),
      sunHi: a(SKY.cloudSunHi), moonHi: a(SKY.cloudMoonHi), nightBase: a(SKY.cloudNightBase),
      stormHi: a(SKY.cloudStormHi), stormBase: a(SKY.cloudStormBase),
      rain: a(SKY.rainStreak), rainFg: a(SKY.rainStreakFg),
      snow: a(SKY.snowFlake), flash: a(SKY.lightningFlash)
    };
    return _wp;
  }
  function wRGBA(c, alpha) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + alpha.toFixed(3) + ')'; }
  // Recolour a baked lum/den pair to the current sky lighting. Cheap
  // (sprite-sized); runs when the lighting bucket changes, not every frame.
  function weatherRecolorTile(T, hi, sh, ct) {
    var data = T.img.data, lum = T.lum, den = T.den;
    for (var i = 0, p = 0; i < lum.length; i++, p += 4) {
      var a = den[i];
      if (a === 0) { data[p + 3] = 0; continue; }
      var l = lum[i] / 255;
      l = 0.5 + (l - 0.5) * ct;
      l = l < 0 ? 0 : (l > 1 ? 1 : l);
      data[p]     = (sh[0] + (hi[0] - sh[0]) * l) | 0;
      data[p + 1] = (sh[1] + (hi[1] - sh[1]) * l) | 0;
      data[p + 2] = (sh[2] + (hi[2] - sh[2]) * l) | 0;
      data[p + 3] = a;
    }
    T.ctx.putImageData(T.img, 0, 0);
    if (T.pat !== undefined) T.pat = null;   // patterns snapshot the canvas — stale now
    T.recolorDirty = false;
  }
  function weatherRecolorSprite(ci, vi, hi, sh) {
    weatherRecolorTile(cloudSprites[ci][vi], hi, sh, weatherTune.contrast * CLOUD_CLASSES[ci].contrast);
  }

  // ----- Precip pool (world-anchored, world px) -----
  // Drops live at WORLD positions (v24.126) — the field stays put while the
  // camera moves, and each drop dies on the first solid tile it meets, so
  // precip lands on the ground line yet falls freely down dug shafts and
  // holes. Render-only: drops never touch the liquid sim (the v24.125
  // resting-calm baseline stays locked). Positions + speeds are world px;
  // the draw projects through cam + dpr*worldScale like the cloud field.
  var PRECIP_CAP = 1100;
  var PRECIP_MARGIN = 140;     // off-view spawn/cull margin, world px
  var precipParts = null, precipActive = 0;
  function weatherInitPrecip() {
    precipParts = [];
    for (var i = 0; i < PRECIP_CAP; i++) {
      precipParts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, len: 0, sz: 1, ph: 0, wob: 0 });
    }
    precipActive = 0;
  }
  // side: 0 = seed above the view top (rain arriving from the sky);
  // ±1 = refill just past that screen edge at a random height, so lateral
  // flight re-stocks the leading edge without visible pop-in.
  function weatherSpawnDrop(p, snow, windV, side) {
    p.on = true;
    var surfY = SKY_ROWS * TILE;
    if (side) {
      p.x = (side > 0) ? cam.x + screenW + Math.random() * PRECIP_MARGIN
                       : cam.x - Math.random() * PRECIP_MARGIN;
      var yLo = Math.min(cam.y, surfY) - 60;
      var yHi = Math.min(cam.y + screenH, surfY);   // never seed below the surface line
      p.y = yLo + Math.random() * Math.max(20, yHi - yLo);
    } else {
      p.x = cam.x - PRECIP_MARGIN + Math.random() * (screenW + PRECIP_MARGIN * 2);
      p.y = Math.min(cam.y, surfY) - 12 - Math.random() * 80;
    }
    if (snow) {
      p.vy = (30 + Math.random() * 55) * weatherTune.precipSpeed;
      p.vx = windV * (0.5 + Math.random() * 0.5);
      p.sz = 1 + (Math.random() * 2.4) | 0;
      p.wob = 5 + Math.random() * 12;
      p.ph = Math.random() * 6.283;
      p.len = 0;
    } else {
      p.vy = (430 + Math.random() * 330) * weatherTune.precipSpeed;
      p.vx = windV * (1.4 + Math.random() * 0.8);
      p.len = 0.018 + Math.random() * 0.012;
      p.sz = Math.random() < 0.25 ? 2 : 1;
      p.wob = 0; p.ph = 0;
    }
  }

  // ----- Mood machine + per-frame integration -----
  function weatherSetMood(idx, snap) {
    idx = Math.max(0, Math.min(WEATHER_MOODS.length - 1, idx | 0));
    weather.mood = idx;
    var m = WEATHER_MOODS[idx];
    weather.tcov = m.cov; weather.tdark = m.dark; weather.tpcp = m.pcp; weather.twind = m.wind;
    if (snap) { weather.cov = m.cov; weather.dark = m.dark; weather.pcp = m.pcp; weather.wind = m.wind; }
  }
  function weatherRollMood() {
    var row = WEATHER_NEXT[weather.mood], r = Math.random(), acc = 0, pick = row[0][0];
    for (var i = 0; i < row.length; i++) { acc += row[i][1]; if (r <= acc) { pick = row[i][0]; break; } }
    weatherSetMood(pick, false);
    // calmer moods linger; wet moods pass through
    weather.moodT = (pick <= 1) ? (60 + Math.random() * 80) :
                    (pick >= 4) ? (24 + Math.random() * 46) : (38 + Math.random() * 52);
  }
  function weatherCycleMood() {
    weatherForce = (weatherForce + 1) % WEATHER_MOODS.length;
    weatherSetMood(weatherForce, false);
    weather.moodT = 9e9;
  }
  function weatherMoodName() {
    return (weatherForce >= 0 ? '[locked] ' : '') + WEATHER_MOODS[weather.mood].name;
  }

  // Dev boot lever (mirrors ?wdbg= for water): ?wmood=N locks the weather to
  // mood N (0 clear … 5 storm) from the first frame, values snapped — for
  // screenshot harnesses and cloud work. Parsed once on the first update.
  var weatherBootMood = -2;   // -2 unparsed, -1 none
  function weatherBootMoodCheck() {
    if (weatherBootMood !== -2) return;
    weatherBootMood = -1;
    try {
      var m = /[?&]wmood=(\d)/.exec(location.search);
      if (m) {
        weatherBootMood = +m[1];
        weatherForce = Math.min(weatherBootMood, WEATHER_MOODS.length - 1);
        weatherSetMood(weatherForce, true);
        weather.moodT = 9e9;
      }
    } catch (e) {}
  }

  function updateWeather(dt) {
    if (!weatherTune.enabled) return;
    if (!precipParts) weatherInitPrecip();
    weatherBootMoodCheck();
    // mood timing
    if (weatherForce < 0) {
      weather.moodT -= dt;
      if (weather.moodT <= 0) weatherRollMood();
    }
    // ease live values toward targets (different time constants)
    var ke = function (T) { return 1 - Math.exp(-dt / T); };
    weather.cov  += (weather.tcov  - weather.cov)  * ke(7);
    weather.dark += (weather.tdark - weather.dark) * ke(8);
    weather.pcp  += (weather.tpcp  - weather.pcp)  * ke(5);
    weather.wind += (weather.twind - weather.wind) * ke(6);
    if (weatherTune.morphSpeed > 0) weather.morph += dt * weatherTune.morphSpeed;

    // cloud drift — base breeze + surfaceWind, integrated ONCE; each field row
    // scales the shared integral by its own drift factor at draw (high clouds
    // crawl, low clouds scud) so relative motion stays deterministic.
    var sw = (typeof surfaceWind !== 'undefined') ? surfaceWind.current : 0;
    var windPxS = (weatherTune.baseDrift + Math.abs(sw) * 90 * (1 + weather.wind * 1.3)) *
                  (sw < 0 ? -1 : 1) * weatherTune.driftScale;
    if (sw === 0) windPxS = weatherTune.baseDrift * weatherTune.driftScale;
    weather.driftAccum += windPxS * dt;
    weather.veilDrift += windPxS * 0.30 * dt;

    // lightning (storm only)
    weather.flash *= Math.exp(-dt * 7.5);
    if (weather.flash < 0.003) weather.flash = 0;
    var stormy = WEATHER_MOODS[weather.mood].lit && weather.pcp > 0.6 && weatherTune.lightning;
    if (stormy) {
      weather.flashT -= dt;
      if (weather.flashT <= 0) {
        weather.flash = 0.8 + Math.random() * 0.5;
        weather.dbl = Math.random() < 0.5 ? 1 : 0;
        weather.flashT = 3.5 + Math.random() * 9;
      }
    }
    if (weather.dbl && weather.flash < 0.35 && weather.flash > 0) { weather.flash = 0.9; weather.dbl = 0; }

    // precip particles — world-anchored; new drops only spawn while the sky
    // is on screen (active ones keep falling, e.g. down an open shaft, and
    // drain out on their own collisions/culls)
    var skyVisible = (cam.y < SKY_ROWS * TILE + screenH * 0.4);
    var snow = (weatherPrecipType() === 'snow');
    var windV = (sw * 110 * (1 + weather.wind)) * (snow ? 0.7 : 1);   // world px/s
    var targetN = skyVisible ? Math.round(weather.pcp * weatherTune.precipRate * (snow ? 520 : 900)) : 0;
    if (targetN > PRECIP_CAP) targetN = PRECIP_CAP;
    // grow / shrink the active set gently
    var spawnBudget = Math.ceil(Math.abs(targetN - precipActive) * 0.12) + 2;
    for (var s = 0; s < spawnBudget && precipActive < targetN; s++) {
      for (var k = 0; k < precipParts.length; k++) {
        if (!precipParts[k].on) { weatherSpawnDrop(precipParts[k], snow, windV, 0); precipActive++; break; }
      }
    }
    var deactivate = (precipActive > targetN) ? Math.ceil((precipActive - targetN) * 0.10) + 1 : 0;
    var left = cam.x - PRECIP_MARGIN, right = cam.x + screenW + PRECIP_MARGIN;
    var below = cam.y + screenH + 80, above = cam.y - 320;
    var wobT = performance.now() / 1000;
    for (var j = 0; j < precipParts.length; j++) {
      var p = precipParts[j];
      if (!p.on) continue;
      p.y += p.vy * dt;
      p.x += p.vx * dt + (snow ? Math.sin(wobT * 1.7 + p.ph) * p.wob * dt : 0);
      var gone = 0, side = 0;
      // ground strike — tileAt is null only in open air, so a drop dies on
      // the ground line but sails on down dug shafts and holes
      if (tileAt((p.y / TILE) | 0, (p.x / TILE) | 0) !== null) gone = 1;
      else if (p.y > below || p.y < above) gone = 1;     // left the view vertically
      else if (p.x < left)  { gone = 1; side = 1; }      // camera ran right → refill right edge
      else if (p.x > right) { gone = 1; side = -1; }
      if (gone) {
        if (deactivate > 0 || precipActive > targetN) { p.on = false; precipActive--; deactivate--; }
        else weatherSpawnDrop(p, snow, windV, side);
      }
    }
  }

  // Draw every visible cloud in ONE row of the field. Far (high) rows are
  // drawn before near (low) ones by the caller.
  // One row of the field: shared row MOTION (hPar/drift → `shift`), continuous
  // per-cloud everything else. All randomness keys on (k, j*257 + off) so no
  // two uses collide and the field is deterministic forever.
  function weatherDrawFieldRow(j, cw, skyBottomPx, e, ws, surfaceY, altScale, thin, swell, globalA) {
    var R = CLOUD_ROWS[j];
    var jy = j * 257;
    var rowMid = R.lo + R.h * 0.5;
    var hParRow, driftRow;
    if (j === 0) {
      // the ridge row doubles as the valley-distance backdrop: far and slow
      hParRow = 0.88; driftRow = 0.30;
    } else {
      var tm = wClamp01((rowMid - 360) / 2800);
      hParRow = 0.52 + 0.42 * Math.pow(tm, 0.8);
      driftRow = 1.0 - 0.85 * Math.pow(tm, 0.9);
    }
    var shift = cam.x * (1 - hParRow) - weather.driftAccum * driftRow;
    var k0 = Math.floor((shift - 520) / R.w);
    var k1 = Math.floor((shift + cw / ws + 520) / R.w);
    for (var k = k0; k <= k1; k++) {
      var h0 = wHash(k, jy + 11, CLOUD_FIELD_SEED);
      // continuous altitude: anywhere inside this cell
      var alt = R.lo + wHash(k, jy + 29, CLOUD_FIELD_SEED) * R.h;
      var tA = wClamp01((alt - 150) / (CLOUD_ALT_TOP - 150));   // 0 low → 1 top of the field
      var dens = 1 - 0.35 * tA * tA;                    // the sky empties toward space (cell area already grows)
      // large-scale CLUSTER noise (~4-cell wavelength, correlated across
      // neighbouring rows): clouds bunch into banks with real gaps between the
      // groups. An even one-per-cell spread reads as countable cloud UNITS.
      var clus = wSmooth(wVal(k * 0.26, j * 1.7, 99991, CLOUD_FIELD_SEED + 13));
      var eEff = e * dens * (0.50 + 1.05 * clus);
      var fadeA = 1 - thin * Math.pow(tA, 1.2);         // deckThin: high clouds thin out
      if (fadeA <= 0.01) continue;
      var cirrusW = wSmooth(wClamp01((alt - 1550) / 450));
      var valley = 1 - wSmooth(wClamp01((alt - 70) / 160));
      var sBaseCum = 0.34 + 0.72 * wSmooth(wClamp01((alt - 60) / 280));
      var aFade = wClamp01((eEff - h0) / 0.07);         // clouds fade in low-hash first
      if (aFade <= 0.01) continue;
      // class by altitude with a dithered blend: big+mid low, mid-heavy middle,
      // cirrus from ~1.55k fully by ~2k
      var cls;
      if (wHash(k, jy + 59, CLOUD_FIELD_SEED) < cirrusW) cls = 0;
      else cls = (wHash(k, jy + 47, CLOUD_FIELD_SEED) < 0.55 - 0.30 * wClamp01((alt - 400) / 900)) ? 2 : 1;
      var vi = (wHash(k, jy + 23, CLOUD_FIELD_SEED) * 977 | 0) % CLOUD_VARIANTS;
      var S = cloudSprites[cls][vi];
      if (!S || !S.ready) continue;
      var C = CLOUD_CLASSES[cls];
      // size runs its whole small → big progression INSIDE the resting view
      // (tiny puffs at the ridge, full cumulus by ~330), so no height reads as
      // "the one size"; cirrus streaks widen with height instead. The jitter
      // is SMALL-BIASED (h²): mostly modest clouds, the odd giant — a sky of
      // same-sized clouds counts as units.
      var sBase = (cls === 0) ? 0.9 + 0.5 * wClamp01((alt - 1500) / 1800) : sBaseCum;
      var sj = wHash(k, jy + 67, CLOUD_FIELD_SEED);
      var scale = sBase * (0.70 + 0.65 * sj * sj) * swell;
      var wW = C.worldW * scale;
      // per-cloud aspect squash — same sprite reads squat or towering
      var wH = wW * (C.th / C.tw) * (0.86 + 0.28 * wHash(k, jy + 73, CLOUD_FIELD_SEED));
      var x0 = (k + 0.08 + 0.84 * wHash(k, jy + 41, CLOUD_FIELD_SEED)) * R.w;
      var sx = (x0 - shift) * ws - wW * ws * 0.5;
      var top = (surfaceY - alt * altScale - cam.y) * ws - wH * ws * 0.5;
      var wPx = wW * ws, hPx = wH * ws;
      // Cull only when the whole bank has left the view.
      if (top >= skyBottomPx || top + hPx <= 0 || sx + wPx <= 0 || sx >= cw) continue;
      // cores stay near-opaque: translucent cumulus TERRACE where they
      // overlap (repeated arc seams); merged solid masses read as one cloud
      var instA = wClamp01(globalA * fadeA * aFade * C.alpha * (1 - 0.18 * valley));
      ctx.globalAlpha = instA;
      // Keep the light direction consistent across the sky. Silhouette
      // variety comes from geometry, never a mirror of the baked lighting.
      ctx.drawImage(S.color, sx, top, wPx, hPx);
    }
  }

  // ----- Draw: clouds (called from drawNightSkyToScreen, sky-clipped) -----
  function drawWeatherClouds(cw, ch, skyBottomPx) {
    if (!weatherTune.enabled || PERF_DISABLE_WEATHER) return;
    if (weather.cov < 0.02 || cw <= 0 || ch <= 0) return;
    if (!cloudSprites) weatherInitSprites();

    // STAGE 1 — bake one dirty sprite per frame (the whole cast is ready in
    // ~25 frames at boot; a softness/rim lever move or morph re-runs it).
    var bakeKey = Math.round(weatherTune.softness * 8) * 97 + Math.round(weatherTune.rimGlow * 8);
    var morphB = Math.round(weather.morph * 4);
    if (bakeKey !== cloudBakeKey || morphB !== cloudMorphBucket) {
      cloudBakeKey = bakeKey;
      cloudMorphBucket = morphB;
      for (var mc = 0; mc < cloudSprites.length; mc++) {
        for (var mv = 0; mv < CLOUD_VARIANTS; mv++) cloudSprites[mc][mv].dirty = true;
      }
    }
    var baked = false;
    var bakeCount = CLOUD_CLASSES.length * CLOUD_VARIANTS;
    for (var bi = 0; bi < bakeCount; bi++) {
      var slot = (cloudBakeCursor + bi) % bakeCount;
      var bc = Math.floor(slot / CLOUD_VARIANTS), bv = slot % CLOUD_VARIANTS;
      if (cloudSprites[bc][bv].dirty) {
        weatherBakeSprite(bc, bv);
        cloudBakeCursor = (slot + 1) % bakeCount;
        baked = true;
        break;
      }
    }
    if (!baked && veilTile.dirty) weatherBakeVeil();

    // STAGE 2 — recolour on lighting-bucket change (amortised, 4 tiles/frame)
    var elev = (typeof computeSunElevation === 'function') ? computeSunElevation(timeOfDay) : 0;
    var sElev = Math.sin(elev);
    var dayW = Math.max(0, Math.min(1, (typeof atmosDayWeight !== 'undefined') ? atmosDayWeight : 0));
    var lightB = [Math.round(sElev * 24), Math.round(weather.dark * 24), Math.round(dayW * 24),
      weatherTune.highlight, weatherTune.shadow, weatherTune.contrast].join(':');
    if (lightB !== cloudLightBucket) {
      cloudLightBucket = lightB;
      var wp = weatherPalette();
      var lowSun = Math.max(0, Math.min(1, 1 - sElev * 2.4));   // 1 near the horizon
      // Sunlit crowns: white high in the sky → warm gold near the horizon (driven
      // by sun elevation so they catch dusk) → moon-silver at night.
      var dayHi = wMix(wp.sunHi, wp.sunsetHi, lowSun * dayW);
      var hi = wMix(wMix(wp.nightBase, wp.moonHi, 0.48), dayHi, dayW);
      // Shaded undersides: a cool grey high → dusky violet near the horizon →
      // deep blue at night. Kept darker + greyer than the sky so the cloud FORM
      // reads instead of blending in (the v1 sky-tinted shadow washed out).
      var dayShadow = wMix(wp.dayBase, wp.duskBase, lowSun);
      var sh = wMix(wp.nightBase, dayShadow, dayW);
      // Storm pulls both toward flat slate.
      var dk = weather.dark;
      hi = wMix(hi, wp.stormHi, dk * 0.5);
      sh = wMix(sh, wp.stormBase, dk * 0.6);
      for (var c = 0; c < 3; c++) { hi[c] *= weatherTune.highlight; sh[c] *= weatherTune.shadow; }
      _wLastHi = hi; _wLastSh = sh;
      for (var rc = 0; rc < cloudSprites.length; rc++) {
        for (var rv = 0; rv < CLOUD_VARIANTS; rv++) {
          if (cloudSprites[rc][rv].ready) cloudSprites[rc][rv].recolorDirty = true;
        }
      }
      if (veilTile.ready) veilTile.recolorDirty = true;
    }
    var recolorBudget = 4;
    var lastHi = _wLastHi, lastSh = _wLastSh;
    for (var qc = 0; qc < cloudSprites.length && recolorBudget > 0; qc++) {
      for (var qv = 0; qv < CLOUD_VARIANTS && recolorBudget > 0; qv++) {
        var Q = cloudSprites[qc][qv];
        if (Q.ready && Q.recolorDirty) { weatherRecolorSprite(qc, qv, lastHi, lastSh); recolorBudget--; }
      }
    }
    if (recolorBudget > 0 && veilTile.ready && veilTile.recolorDirty) {
      weatherRecolorTile(veilTile, lastHi, lastSh, weatherTune.contrast * 0.6);
    }

    var ws = dpr * worldScale;
    var surfaceY = SKY_ROWS * TILE;
    var globalA = weatherTune.layerAlpha;
    var altScale = weatherTune.deckAltScale, thin = weatherTune.deckThin;
    var e = weather.cov * 1.06 * weatherTune.deckDensity;   // field fill level
    var swell = 1 + weather.cov * 0.18;                     // heavy skies fatten each cloud
    var playerAlt = Math.max(0, surfaceY - (cam.y + (ch / ws) * 0.5));
    ctx.save();
    ctx.imageSmoothingEnabled = true;

    // Overcast/storm stratus veil — behind every cumulus, one continuous sheet.
    var veilA = wSmooth(wClamp01((weather.cov - 0.66) / 0.24)) * weatherTune.veil *
                wClamp01(1 - (playerAlt - VEIL_ALT_FADE0) / (VEIL_ALT_FADE1 - VEIL_ALT_FADE0));
    if (veilA > 0.01 && veilTile.ready) {
      var vwPx = VEIL_WORLD_W * ws;
      var vShift = (cam.x * 0.10 - weather.veilDrift) * ws;
      var vOff = ((vShift % vwPx) + vwPx) % vwPx;
      ctx.globalAlpha = wClamp01(veilA * globalA * 0.95);
      if (!veilTile.pat) veilTile.pat = ctx.createPattern(veilTile.color, 'repeat');
      veilTile.pat.setTransform(new DOMMatrix([vwPx / VEIL_TW, 0, 0, (skyBottomPx * 1.02) / VEIL_TH, -vOff, 0]));
      ctx.fillStyle = veilTile.pat;
      ctx.fillRect(0, 0, cw, skyBottomPx);
      // top-weighted density: the sheet is heavier aloft, lighter at the horizon
      var vg = ctx.createLinearGradient(0, 0, 0, skyBottomPx);
      var shC = _wLastSh || [70, 74, 86];
      vg.addColorStop(0, wRGBA(shC, wClamp01(veilA * globalA * 0.40)));
      vg.addColorStop(1, wRGBA(shC, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cw, skyBottomPx);
    }

    // Walk the field rows top (far) → bottom (near) so low clouds overlap on
    // top. Row-level screen culling keeps the walk to the 2-4 rows in view.
    var rowMargin = 520 * ws;   // worst-case half-sprite overhang, device px
    for (var j = CLOUD_ROWS.length - 1; j >= 0; j--) {
      var R = CLOUD_ROWS[j];
      var rowTopPx = (surfaceY - (R.lo + R.h) * altScale - cam.y) * ws - rowMargin;
      var rowBotPx = (surfaceY - R.lo * altScale - cam.y) * ws + rowMargin;
      if (rowTopPx >= skyBottomPx || rowBotPx <= 0) continue;
      weatherDrawFieldRow(j, cw, skyBottomPx, e, ws, surfaceY, altScale, thin, swell, globalA);
    }
    ctx.restore();
  }
  var _wLastHi = null, _wLastSh = null;

  // ----- Draw: precipitation + lightning (drops world-anchored; flash full-screen) -----
  function drawWeatherPrecip(cw, ch) {
    if (!weatherTune.enabled || PERF_DISABLE_WEATHER) return;
    var wp = weatherPalette();
    // lightning flash first (lights the whole scene), then the drops over it
    if (weather.flash > 0.003) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.85, weather.flash * 0.6);
      ctx.fillStyle = wRGBA(wp.flash, 1);
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    if (!precipParts || precipActive <= 0 || weather.pcp <= 0.01) return;
    var snow = (weatherPrecipType() === 'snow');
    var a = Math.max(0, Math.min(1, weather.pcp * 1.15));
    var ws = dpr * worldScale;                 // world px → device px
    var cx0 = cam.x, cy0 = cam.y;
    ctx.save();
    if (snow) {
      ctx.fillStyle = wRGBA(wp.snow, 0.85 * a);
      for (var i = 0; i < precipParts.length; i++) {
        var p = precipParts[i]; if (!p.on) continue;
        var d = Math.max(1, Math.round(p.sz * ws * 0.4));
        ctx.fillRect(((p.x - cx0) * ws) | 0, ((p.y - cy0) * ws) | 0, d, d);
      }
    } else {
      // rain: one batched path of skewed streaks
      ctx.strokeStyle = wRGBA(wp.rain, 0.42 * a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var j = 0; j < precipParts.length; j++) {
        var q = precipParts[j]; if (!q.on) continue;
        var sx = (q.x - cx0) * ws, sy = (q.y - cy0) * ws;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + q.vx * q.len * ws, sy + q.vy * q.len * ws);
      }
      ctx.stroke();
      // a few fatter foreground streaks for depth
      ctx.strokeStyle = wRGBA(wp.rainFg, 0.5 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var n = 0; n < precipParts.length; n++) {
        var w = precipParts[n]; if (!w.on || w.sz < 2) continue;
        var wx = (w.x - cx0) * ws, wy = (w.y - cy0) * ws;
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + w.vx * w.len * ws * 1.3, wy + w.vy * w.len * ws * 1.3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
