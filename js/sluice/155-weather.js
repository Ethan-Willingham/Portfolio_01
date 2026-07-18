  /* ====== WEATHER: clouds, precipitation, storms ====== */
  // Full dynamic above-ground weather. Three subsystems share one mood-driven
  // state machine:
  //   1. Clouds  — INSTANCED cumulus sprites (v26.20, replaced the tiled deck
  //                strips that read as horizontal bands). A small pool of
  //                individually-baked cloud sprites (billow-fbm field × a
  //                cumulus envelope: wavy flat base, lumpy domed crown, baked
  //                volumetric top-light + silver rim) is scattered across
  //                world-anchored altitude LANES by a deterministic hash
  //                lattice — every cloud has its own position, variant, scale,
  //                flip and fade, so the sky has discrete, non-repeating
  //                clouds instead of strips. Sprites are RECOLOURED each
  //                lighting bucket from the live atmospheric-scatter cache
  //                (atmosHorizonRGB / atmosZenithRGB / atmosDayWeight in 150),
  //                so clouds catch the Volcanic sunset grade and go
  //                moon-silver at night for free, with zero shader risk.
  //                Overcast/storm additionally ease in ONE continuous high
  //                stratus VEIL (a soft sheet, not a strip stack). Drawn
  //                inside drawNightSkyToScreen (clipped to the sky), behind
  //                the mountains, drifting on surfaceWind.
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
  // instance density, lane altitudes, and high-lane thinning toward space.
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
    deckDensity:  1.0, // cloud-instance density across every lane
    deckAltScale: 1.0, // multiplies every lane altitude — clouds ride higher / lower
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
    laneDrift: null,                                 // per-lane wind drift (world px)
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
  // Domain-warped billow — the warp shears the noise into organic, lobed cloud
  // masses instead of uniform round blobs.
  var CLOUD_WARP = 0.14;
  function wCloudField(u, vv, cells, oct, seed) {
    var wx = (wFbm(u, vv, cells, seed + 555, 2) - 0.5) * CLOUD_WARP;
    var wy = (wFbm(u, vv, cells, seed + 911, 2) - 0.5) * CLOUD_WARP;
    return wBillow(u + wx, vv + wy, cells, seed, oct);
  }

  // ----- Cloud sprite pool -----
  // Three appearance CLASSES × CLOUD_VARIANTS seeds = the whole sky's cast.
  // Each sprite is ONE cloud (not a tile): field × cumulus envelope, thresholded
  // to a solid-core / soft-edge mass, with a baked top-light march + silver rim.
  // Per-instance flips + scales + alpha jitter keep repeats unreadable.
  //   aniso   — vertical noise-frequency multiplier (>1 = horizontally-streaked
  //             wisps; the cirrus class)
  //   dome    — crown height as a fraction of tile height
  //   baseV   — the flat cloud BASE line (fraction of tile height from the top)
  //   worldW  — on-screen footprint at scale 1 (world px; height follows tw:th)
  var CLOUD_CLASSES = [
    { tw: 240, th: 64,  cells: 5, oct: 4, aniso: 2.6, dome: 0.34, baseV: 0.60, worldW: 340,
      lightNS: 3, lightStep: 2, lightAbsorb: 0.24, contrast: 0.78, alpha: 0.66, cirrus: true,  baseSeed: 41011 },
    { tw: 208, th: 112, cells: 3, oct: 5, aniso: 1.0, dome: 0.64, baseV: 0.72, worldW: 218,
      lightNS: 6, lightStep: 3, lightAbsorb: 0.56, contrast: 0.96, alpha: 0.92, cirrus: false, baseSeed: 52021 },
    { tw: 320, th: 160, cells: 4, oct: 5, aniso: 1.0, dome: 0.72, baseV: 0.74, worldW: 350,
      lightNS: 10, lightStep: 3, lightAbsorb: 0.62, contrast: 1.06, alpha: 1.00, cirrus: false, baseSeed: 63031 }
  ];
  var CLOUD_VARIANTS = 4;          // seeds per class
  var cloudSprites = null;         // [class][variant] = { color, ctx, img, lum, den, ready, dirty }
  var cloudBakeKey = -1;           // softness/rim bake-lever bucket → re-bake on change
  var cloudLightBucket = -999999;
  var cloudMorphBucket = -999999;

  // ----- Altitude LANES — the world-anchored cloud field you fly THROUGH -----
  // Each lane is a horizontal register of POSSIBLE cloud slots (hash lattice,
  // cell width cellW): slot k holds a cloud iff hash(k) clears the live
  // coverage, so the same slots fill and empty smoothly as weather changes and
  // the field is infinite + non-repeating with zero storage. A lane's VERTICAL
  // screen position tracks its world altitude (parallax 1) — climbing slides
  // each lane down past you and you fly through the layers, size locked (the
  // deck-era expand/contract bug stays dodged: sprites have fixed world size).
  // Horizontal motion = per-lane camera parallax (hPar: higher = farther/
  // slower) + accumulated wind drift; alt jitter breaks any visible rows.
  //   s0..s1 — per-instance scale range   dens — lane fill bias vs coverage
  var CLOUD_LANES = [
    { alt: 160,  jit: 34,  cls: 1, cellW: 240, hPar: 0.46, drift: 1.00, s0: 0.55, s1: 0.85, dens: 1.02, seed: 101 },
    { alt: 248,  jit: 60,  cls: 2, cellW: 400, hPar: 0.55, drift: 0.88, s0: 0.85, s1: 1.20, dens: 0.94, seed: 202 },
    { alt: 430,  jit: 85,  cls: 1, cellW: 320, hPar: 0.64, drift: 0.74, s0: 0.75, s1: 1.10, dens: 0.95, seed: 303 },
    { alt: 660,  jit: 115, cls: 2, cellW: 440, hPar: 0.72, drift: 0.60, s0: 1.00, s1: 1.40, dens: 0.95, seed: 404 },
    { alt: 950,  jit: 145, cls: 1, cellW: 330, hPar: 0.79, drift: 0.47, s0: 0.80, s1: 1.15, dens: 0.95, seed: 505 },
    { alt: 1320, jit: 185, cls: 2, cellW: 440, hPar: 0.85, drift: 0.36, s0: 1.05, s1: 1.45, dens: 0.90, seed: 606 },
    { alt: 1780, jit: 225, cls: 0, cellW: 380, hPar: 0.89, drift: 0.26, s0: 0.85, s1: 1.25, dens: 0.85, seed: 707 },
    { alt: 2350, jit: 285, cls: 0, cellW: 420, hPar: 0.92, drift: 0.18, s0: 1.00, s1: 1.50, dens: 0.80, seed: 808 },
    { alt: 3050, jit: 345, cls: 0, cellW: 460, hPar: 0.94, drift: 0.12, s0: 1.10, s1: 1.60, dens: 0.72, seed: 909 }
  ];
  // The HORIZON lane — tiny far puffs hugging the ridgeline for the resting
  // view's depth cue. Drawn first (farthest), fades out on a climb (once you
  // are airborne the "distant weather on the horizon" framing stops applying).
  var CLOUD_HORIZON_LANE =
    { alt: 130,  jit: 26,  cls: 1, cellW: 190, hPar: 0.93, drift: 0.30, s0: 0.22, s1: 0.40, dens: 1.15, seed: 55 };

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

  // Bake ONE cloud sprite: cumulus envelope × warped billow field → density,
  // then a straight-up light march (exp self-shadow → bright crowns, shaded
  // base) + silver rim → luminance. Coverage-independent: weather changes
  // never re-bake; only softness/rim lever moves or morphing do.
  function weatherBakeSprite(ci, vi) {
    var C = CLOUD_CLASSES[ci], S = cloudSprites[ci][vi];
    var tw = C.tw, th = C.th;
    var seed = C.baseSeed + vi * 7919;
    var mz = weather.morph * 0.5;
    var feather = 0.06 + 0.055 * weatherTune.softness;
    var rim = weatherTune.rimGlow;
    // envelope silhouette params (per-sprite hashes)
    var u0 = 0.06 + 0.10 * wHash(vi, 1, seed);
    var u1 = 0.94 - 0.10 * wHash(vi, 2, seed);
    var d = new Float32Array(tw * th);
    var px, py, idx = 0;
    for (py = 0; py < th; py++) {
      var v = py / th;
      var vv = (py / tw) * C.aniso + mz;
      for (px = 0; px < tw; px++, idx++) {
        var u = px / tw;
        var edge = wSmooth(wClamp01(Math.min(u - u0, u1 - u) / 0.13));
        if (edge <= 0.002) { d[idx] = 0; continue; }
        var E;
        if (C.cirrus) {
          // wispy streak: a wavy centre-line with a soft gaussian belly
          var mid = 0.42 + (wVal(u * 5, 7.7, 9999, seed + 31) - 0.5) * 0.34;
          var g = (v - mid) / 0.30;
          E = edge * Math.exp(-g * g);
        } else {
          // cumulus: wavy flat base, lumpy domed crown
          var vb = C.baseV + (wVal(u * 7, 3.5, 9999, seed + 913) - 0.5) * 0.09;
          if (v >= vb) {
            E = edge * (1 - wSmooth(wClamp01((v - vb) / 0.07)));
          } else {
            var crown = 0.35 + 0.65 * wBillow(u, 0.31, 4, seed + 77, 3);
            var rise = (vb - v) / (C.dome * crown * (0.35 + 0.65 * edge));
            E = edge * (1 - wSmooth(wClamp01((rise - 0.72) / 0.28)));
            // cauliflower carve — bites notches out of the crown, fades to
            // nothing at the flat base so the underside stays coherent
            var ch2 = wClamp01((vb - v) / C.dome);
            var carve = wBillow(u, v * (C.tw / C.th) * 0.8, 6, seed + 241, 2);
            E *= 1 - 0.38 * ch2 * (1 - carve);
          }
        }
        if (E <= 0.003) { d[idx] = 0; continue; }
        var F = wCloudField(u, vv, C.cells, C.oct, seed);
        var dr = (F * E - 0.36) / feather;
        dr = wClamp01(dr);
        d[idx] = dr * dr * (3 - 2 * dr);   // smoothstep → solid cores, soft edges
      }
    }
    // light march + rim → lum/den bytes
    idx = 0;
    for (py = 0; py < th; py++) {
      for (px = 0; px < tw; px++, idx++) {
        var dd = d[idx];
        if (dd <= 0.003) { S.lum[idx] = 0; S.den[idx] = 0; continue; }
        var occ = 0;
        for (var k = 1; k <= C.lightNS; k++) {
          var py2 = py - k * C.lightStep;
          if (py2 < 0) break;
          occ += d[py2 * tw + px];
        }
        var light = Math.exp(-occ * C.lightAbsorb);
        var eg = wSmooth(wClamp01(dd / 0.14)) * (1 - wSmooth(wClamp01((dd - 0.14) / 0.5)));
        var lum = 0.27 + 0.65 * light + rim * 0.30 * eg;
        S.lum[idx] = (wClamp01(lum) * 255) | 0;
        S.den[idx] = (dd * 255) | 0;
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
  // the draw projects through cam + dpr*worldScale like the cloud lanes.
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

  function weatherEnsureLanes() {
    if (weather.laneDrift) return;
    weather.laneDrift = [];
    for (var i = 0; i < CLOUD_LANES.length; i++) weather.laneDrift.push(0);
    weather.hzDrift = 0;
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

    // cloud drift — base breeze + surfaceWind; accumulated per LANE (high
    // clouds crawl, low clouds scud — see CLOUD_LANES[i].drift).
    var sw = (typeof surfaceWind !== 'undefined') ? surfaceWind.current : 0;
    var windPxS = (weatherTune.baseDrift + Math.abs(sw) * 90 * (1 + weather.wind * 1.3)) *
                  (sw < 0 ? -1 : 1) * weatherTune.driftScale;
    if (sw === 0) windPxS = weatherTune.baseDrift * weatherTune.driftScale;
    weatherEnsureLanes();
    for (var i = 0; i < CLOUD_LANES.length; i++) {
      weather.laneDrift[i] += windPxS * CLOUD_LANES[i].drift * dt;
    }
    weather.hzDrift += windPxS * CLOUD_HORIZON_LANE.drift * dt;
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

  // Draw every visible cloud in ONE lane (the hash lattice walk). Far lanes
  // are drawn before near ones by the caller.
  function weatherDrawLane(L, laneDriftPx, laneA, cw, skyBottomPx, e, ws, surfaceY, altScale, swell) {
    if (laneA <= 0.01) return;
    var C = CLOUD_CLASSES[L.cls];
    var shift = cam.x * (1 - L.hPar) - laneDriftPx;     // world px, lane-parallax space
    var viewW = cw / ws;
    var k0 = Math.floor((shift - 460) / L.cellW);
    var k1 = Math.floor((shift + viewW + 460) / L.cellW);
    for (var k = k0; k <= k1; k++) {
      var h0 = wHash(k, 11, L.seed);
      var aFade = wClamp01((e * L.dens - h0) / 0.07);   // clouds fade in low-hash first
      if (aFade <= 0.01) continue;
      var vi = (wHash(k, 23, L.seed) * 977 | 0) % CLOUD_VARIANTS;
      var S = cloudSprites[L.cls][vi];
      if (!S || !S.ready) continue;
      var scale = (L.s0 + (L.s1 - L.s0) * wHash(k, 67, L.seed)) * swell;
      var wW = C.worldW * scale;
      var wH = wW * C.th / C.tw;
      var cX = (k + 0.5 + (wHash(k, 37, L.seed) - 0.5) * 0.72) * L.cellW;
      var alt = (L.alt + (wHash(k, 53, L.seed) - 0.5) * 2 * L.jit) * altScale;
      var sx = (cX - shift) * ws - wW * ws * 0.5;
      var top = (surfaceY - alt - cam.y) * ws - wH * ws * 0.5;
      var wPx = wW * ws, hPx = wH * ws;
      if (top >= skyBottomPx || top + hPx <= 0 || sx + wPx <= 0 || sx >= cw) continue;
      ctx.globalAlpha = wClamp01(laneA * aFade * C.alpha * (0.80 + 0.20 * wHash(k, 97, L.seed)));
      if (wHash(k, 83, L.seed) < 0.5) {
        ctx.save();
        ctx.translate(sx + wPx, top);
        ctx.scale(-1, 1);
        ctx.drawImage(S.color, 0, 0, wPx, hPx);
        ctx.restore();
      } else {
        ctx.drawImage(S.color, sx, top, wPx, hPx);
      }
    }
  }

  // ----- Draw: clouds (called from drawNightSkyToScreen, sky-clipped) -----
  function drawWeatherClouds(cw, ch, skyBottomPx) {
    if (!weatherTune.enabled || PERF_DISABLE_WEATHER) return;
    if (weather.cov < 0.02 || cw <= 0 || ch <= 0) return;
    if (!cloudSprites) weatherInitSprites();
    weatherEnsureLanes();

    // STAGE 1 — bake one dirty sprite per frame (the whole cast is ready in
    // ~13 frames at boot; a softness/rim lever move or morph re-runs it).
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
    for (var bc = 0; bc < cloudSprites.length && !baked; bc++) {
      for (var bv = 0; bv < CLOUD_VARIANTS && !baked; bv++) {
        if (cloudSprites[bc][bv].dirty) { weatherBakeSprite(bc, bv); baked = true; }
      }
    }
    if (!baked && veilTile.dirty) weatherBakeVeil();

    // STAGE 2 — recolour on lighting-bucket change (amortised, 4 tiles/frame)
    var elev = (typeof computeSunElevation === 'function') ? computeSunElevation(timeOfDay) : 0;
    var sElev = Math.sin(elev);
    var dayW = Math.max(0, Math.min(1, (typeof atmosDayWeight !== 'undefined') ? atmosDayWeight : 0));
    var lightB = Math.round(sElev * 16) * 100 + Math.round(weather.dark * 12) + Math.round(dayW * 6) * 4000;
    if (lightB !== cloudLightBucket) {
      cloudLightBucket = lightB;
      var wp = weatherPalette();
      var lowSun = Math.max(0, Math.min(1, 1 - sElev * 2.4));   // 1 near the horizon
      // Sunlit crowns: white high in the sky → warm gold near the horizon (driven
      // by sun elevation so they catch dusk) → moon-silver at night.
      var dayHi = wMix(wp.sunHi, [255, 222, 150], lowSun);
      var hi = wMix(wp.moonHi, dayHi, dayW);
      // Shaded undersides: a cool grey high → dusky violet near the horizon →
      // deep blue at night. Kept darker + greyer than the sky so the cloud FORM
      // reads instead of blending in (the v1 sky-tinted shadow washed out).
      var dayShadow = wMix([108, 122, 146], [122, 82, 102], lowSun);
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
    var lastHi = _wLastHi || [230, 230, 235], lastSh = _wLastSh || [40, 44, 60];
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
    var e = weather.cov * 1.06 * weatherTune.deckDensity;   // lane fill level
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

    // The horizon garnish lane (farthest), then the flight lanes high → low so
    // near/low clouds overlap on top.
    var hz = CLOUD_HORIZON_LANE;
    var hzA = globalA * 0.78 * (1 - wClamp01(playerAlt / 900));   // far puffs sit paler (aerial perspective)
    weatherDrawLane(hz, weather.hzDrift || 0, hzA, cw, skyBottomPx, e, ws, surfaceY, altScale, swell);
    var nL = CLOUD_LANES.length;
    for (var li = nL - 1; li >= 0; li--) {
      var laneA = globalA * (1 - (li / (nL - 1)) * thin);
      weatherDrawLane(CLOUD_LANES[li], weather.laneDrift[li], laneA, cw, skyBottomPx, e, ws, surfaceY, altScale, swell);
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
