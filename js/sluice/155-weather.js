  /* ====== WEATHER: clouds, precipitation, storms ====== */
  // Full dynamic above-ground weather. Three subsystems share one mood-driven
  // state machine:
  //   1. Clouds  — INSTANCED cumulus sprites (v26.20, replaced the tiled deck
  //                strips that read as horizontal bands). A small pool of
  //                individually-baked cloud sprites (billow-fbm field × a
  //                LOBED cumulus mound: overlapping elliptical lobes with one
  //                dominant tower, tapered rounded ends, wavy flat base, baked
  //                volumetric top-light + silver rim) is scattered across
  //                one continuous 2D hash field over (x, altitude) — every
  //                cloud has its own position, height, variant, scale, flip
  //                and fade, nothing sits in a row, and the sky has discrete,
  //                non-repeating clouds instead of strips. Sprites are RECOLOURED each
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
    { tw: 208, th: 112, cells: 3, oct: 5, aniso: 1.0, dome: 0.64, baseV: 0.72, worldW: 218, lobes0: 3, lobes1: 4,
      lightNS: 6, lightStep: 3, lightAbsorb: 0.56, contrast: 0.96, alpha: 0.97, cirrus: false, baseSeed: 52021 },
    { tw: 320, th: 160, cells: 4, oct: 5, aniso: 1.0, dome: 0.72, baseV: 0.74, worldW: 350, lobes0: 4, lobes1: 6,
      lightNS: 10, lightStep: 3, lightAbsorb: 0.62, contrast: 1.06, alpha: 1.00, cirrus: false, baseSeed: 63031 }
  ];
  var CLOUD_VARIANTS = 8;          // seeds per class
  var cloudSprites = null;         // [class][variant] = { color, ctx, img, lum, den, ready, dirty }
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
  // any camera x and unbounded drift accumulation; ~14 motion planes read as
  // smooth depth while POSITIONS stay continuous. Coverage fills and empties
  // the same slots low-hash-first, so weather changes fade individual clouds.
  // Rows follow a geometric progression — short/narrow cells low (the sky is
  // bottom-heavy and the resting view needs the candidates), tall/wide cells
  // high (space thins out). Altitude stays continuous: full-height jitter
  // inside each row and the rows abut, so no boundary can show.
  var CLOUD_FIELD_SEED = 7351;
  var CLOUD_ROWS = (function () {
    var rows = [], lo = 60, h = 120, w = 200;
    while (lo < 3400) {
      rows.push({ lo: lo, h: h, w: w });
      lo += h; h = Math.round(h * 1.26); w = Math.round(w * 1.13);
    }
    return rows;   // 10 rows, 60 → ~4250 world px above the surface
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
    var px, py, u, idx = 0;
    // ---- Silhouette: a MOUND of overlapping elliptical LOBES (one dominant
    // tower + smaller flanks, all hashed per sprite), not a slab. The lobes
    // give a convex lumpy outline with tapered rounded ends and a base that
    // exists only under the mass — the slab-era sprites read as rectangles.
    // topAllow[px] = crown height the lobes permit above the base line;
    // baseSoft[px] = base presence, fading past the outermost lobes.
    var topAllow = null, baseSoft = null;
    if (!C.cirrus) {
      topAllow = new Float32Array(tw);
      baseSoft = new Float32Array(tw);
      var totW = 0.88 - 0.22 * wHash(vi, 4, seed);           // whole-sprite width varies per seed
      var uc = 0.5 + (wHash(vi, 6, seed) - 0.5) * 0.10;      // slight off-centre mass
      var nl = C.lobes0 + ((wHash(vi, 3, seed) * (C.lobes1 - C.lobes0 + 1)) | 0);
      var dom = (nl * (0.30 + 0.40 * wHash(vi, 5, seed))) | 0;
      var hCap = C.baseV - 0.04;                             // never clip the tower at the tile top
      for (var li = 0; li < nl; li++) {
        var ft = (nl > 1) ? li / (nl - 1) : 0.5;
        var cx = uc + (ft - 0.5) * totW * (0.82 + 0.16 * wHash(vi, 7 + li, seed));
        var isDom = (li === dom);
        var r = totW * (isDom ? 0.30 + 0.08 * wHash(vi, 20 + li, seed)
                              : 0.15 + 0.10 * wHash(vi, 20 + li, seed));
        var hh = C.dome * (isDom ? 0.88 + 0.24 * wHash(vi, 40 + li, seed)
                                 : 0.38 + 0.42 * wHash(vi, 40 + li, seed));
        if (hh > hCap) hh = hCap;
        var pA = Math.max(0, Math.round((cx - r) * tw)), pB = Math.min(tw - 1, Math.round((cx + r) * tw));
        for (px = pA; px <= pB; px++) {
          var dd2 = (px / tw - cx) / r;
          var cap = hh * Math.sqrt(Math.max(0, 1 - dd2 * dd2));
          if (cap > topAllow[px]) topAllow[px] = cap;
        }
      }
      for (px = 0; px < tw; px++) {
        baseSoft[px] = wSmooth(wClamp01(topAllow[px] / (C.dome * 0.30)));
      }
    }
    var d = new Float32Array(tw * th);
    for (py = 0; py < th; py++) {
      var v = py / th;
      var vv = (py / tw) * C.aniso + mz;
      for (px = 0; px < tw; px++, idx++) {
        u = px / tw;
        var E;
        if (C.cirrus) {
          // wispy streak: wavy centre-line, lumpy belly, ends PINCHED to
          // nothing (the constant-width era read as long rectangles)
          var u0 = 0.05 + 0.08 * wHash(vi, 1, seed);
          var u1 = 0.95 - 0.08 * wHash(vi, 2, seed);
          var tSpan = (u - u0) / (u1 - u0);
          if (tSpan <= 0 || tSpan >= 1) { d[idx] = 0; continue; }
          var pinch = Math.pow(Math.sin(Math.PI * tSpan), 0.55);
          var mid = 0.42 + (wVal(u * 5, 7.7, 9999, seed + 31) - 0.5) * 0.34;
          var wdt = 0.30 * (0.40 + 0.60 * wBillow(u, 0.71, 4, seed + 57, 2)) * pinch;
          if (wdt < 0.015) { d[idx] = 0; continue; }
          var g = (v - mid) / wdt;
          E = pinch * Math.exp(-g * g);
        } else {
          var ta = topAllow[px];
          if (ta <= 0.004) { d[idx] = 0; continue; }
          var vb = C.baseV + (wVal(u * 7, 3.5, 9999, seed + 913) - 0.5) * 0.09;
          if (v >= vb) {
            E = baseSoft[px] * (1 - wSmooth(wClamp01((v - vb) / 0.07)));
          } else {
            // the lobes carry the shape; billow only ruffles the crown line
            var crown = 0.72 + 0.28 * wBillow(u, 0.31, 4, seed + 77, 3);
            var rise = (vb - v) / (ta * crown);
            E = baseSoft[px] * (1 - wSmooth(wClamp01((rise - 0.70) / 0.30)));
            // cauliflower carve — bites notches out of the crown, fades to
            // nothing at the flat base so the underside stays coherent
            var ch2 = wClamp01((vb - v) / C.dome);
            var carve = wBillow(u, v * (C.tw / C.th) * 0.8, 6, seed + 241, 2);
            E *= 1 - 0.34 * ch2 * (1 - carve);
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
  // per-cloud everything else. All randomness keys on (k, j*101 + off) so no
  // two uses collide and the field is deterministic forever.
  function weatherDrawFieldRow(j, cw, skyBottomPx, e, ws, surfaceY, altScale, thin, swell, globalA) {
    var R = CLOUD_ROWS[j];
    var jy = j * 101;
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
      var aFade = wClamp01((e * dens - h0) / 0.07);     // clouds fade in low-hash first
      if (aFade <= 0.01) continue;
      var fadeA = 1 - thin * Math.pow(tA, 1.2);         // deckThin: high clouds thin out
      if (fadeA <= 0.01) continue;
      // class by altitude with a dithered blend: big+mid low, mid-heavy middle,
      // cirrus from ~1.55k fully by ~2k
      var cls;
      var cirrusW = wSmooth(wClamp01((alt - 1550) / 450));
      if (wHash(k, jy + 59, CLOUD_FIELD_SEED) < cirrusW) cls = 0;
      else cls = (wHash(k, jy + 47, CLOUD_FIELD_SEED) < 0.55 - 0.30 * wClamp01((alt - 400) / 900)) ? 2 : 1;
      var vi = (wHash(k, jy + 23, CLOUD_FIELD_SEED) * 977 | 0) % CLOUD_VARIANTS;
      var S = cloudSprites[cls][vi];
      if (!S || !S.ready) continue;
      var C = CLOUD_CLASSES[cls];
      // size runs its whole small → big progression INSIDE the resting view
      // (tiny puffs at the ridge, full cumulus by ~330), so no height reads as
      // "the one size"; cirrus streaks widen with height instead
      var valley = 1 - wSmooth(wClamp01((alt - 70) / 160));
      var sBase = (cls === 0) ? 0.9 + 0.5 * wClamp01((alt - 1500) / 1800)
                              : 0.34 + 0.72 * wSmooth(wClamp01((alt - 60) / 280));
      var scale = sBase * (0.72 + 0.56 * wHash(k, jy + 67, CLOUD_FIELD_SEED)) * swell;
      var wW = C.worldW * scale;
      // per-cloud aspect squash — same sprite reads squat or towering
      var wH = wW * (C.th / C.tw) * (0.86 + 0.28 * wHash(k, jy + 73, CLOUD_FIELD_SEED));
      var x0 = (k + 0.08 + 0.84 * wHash(k, jy + 41, CLOUD_FIELD_SEED)) * R.w;
      var sx = (x0 - shift) * ws - wW * ws * 0.5;
      var top = (surfaceY - alt * altScale - cam.y) * ws - wH * ws * 0.5;
      var wPx = wW * ws, hPx = wH * ws;
      // cull with side margins wide enough for a composite companion stamp
      if (top >= skyBottomPx || top + hPx <= 0 || sx + wPx * 1.7 <= 0 || sx - wPx * 0.7 >= cw) continue;
      // cores stay near-opaque: translucent cumulus TERRACE where they
      // overlap (repeated arc seams); merged solid masses read as one cloud
      var instA = wClamp01(globalA * fadeA * aFade * C.alpha * (1 - 0.28 * valley) *
                           (0.90 + 0.10 * wHash(k, jy + 97, CLOUD_FIELD_SEED)));
      // ~45% of cumulus are COMPOSITES: a second, smaller variant stamped
      // beside the main mass with their bases aligned — combinatorial variety
      // from the same pool, so repeats stop being findable
      var hComp = wHash(k, jy + 71, CLOUD_FIELD_SEED);
      if (cls !== 0 && hComp < 0.45) {
        var S2 = cloudSprites[cls][(vi + 1 + ((hComp * 16) | 0)) % CLOUD_VARIANTS];
        if (S2 && S2.ready) {
          var sc2 = 0.48 + 0.22 * wHash(k, jy + 79, CLOUD_FIELD_SEED);
          var w2 = wPx * sc2, h2 = hPx * sc2;
          var side = (wHash(k, jy + 89, CLOUD_FIELD_SEED) < 0.5) ? -1 : 1;
          var dx2 = side * wPx * (0.36 + 0.20 * wHash(k, jy + 91, CLOUD_FIELD_SEED));
          var dy2 = C.baseV * (hPx - h2);   // bases share the same air-mass line
          ctx.globalAlpha = instA * 0.9;
          ctx.drawImage(S2.color, sx + dx2, top + dy2, w2, h2);
        }
      }
      ctx.globalAlpha = instA;
      if (wHash(k, jy + 83, CLOUD_FIELD_SEED) < 0.5) {
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
    var rowMargin = 340 * ws;   // worst-case half-sprite overhang, device px
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
