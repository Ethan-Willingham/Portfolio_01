  /* ====== WEATHER: clouds, precipitation, storms ====== */
  // Full dynamic above-ground weather. Three subsystems share one mood-driven
  // state machine:
  //   1. Clouds  — cached billow-fbm cloud bands, 2-3 parallax layers, baked
  //                volumetric lighting (top-light + silver-lining rim) RECOLOURED
  //                each lighting bucket from the live atmospheric-scatter cache
  //                (atmosHorizonRGB / atmosZenithRGB / atmosDayWeight in 150).
  //                So clouds catch the Volcanic sunset grade and go moon-silver
  //                at night for free, with zero shader risk. Drawn screen-locked
  //                inside drawNightSkyToScreen (clipped to the sky), behind the
  //                mountains, drifting on surfaceWind.
  //   2. Precip  — WORLD-anchored rain streaks / snow flakes, wind-skewed,
  //                pooled. Drops live at world positions (the field stays put
  //                while the camera moves) and die on the first solid tile,
  //                so precip lands on the ground but falls on down shafts.
  //   3. Storm   — coverage→1, dark clouds, heavy precip, full-screen lightning.
  //
  // Idiomatic to the engine: like the sky and the mountain strips, the heavy
  // noise bake is cached and rebuilt on a bucket, the per-frame cost is a few
  // smoothed drawImage blits. BACKGROUND_STYLE.md §15 documents the deviation
  // from strict pixel-dither discipline (clouds are smooth-upscaled, matching
  // the GL sky) that "gorgeous, overdone" buys us.

  // ----- Feel / look levers (gm 'weather' group; see TUNING.md §5.4) -----
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
    softness:   1.0,   // coverage-edge feather (puff hardness)
    morphSpeed: 0.0,   // 0 = clouds hold their shape (drift only); >0 = slow billow morph
    precipMode: 0,     // 0 auto (snow in the cold spawn biome) / 1 force rain / 2 force snow
    // ---- Cloud DECK shape (v24.48) — the world-anchored CLOUD_DECKS stack
    // replaced the old screen band (cloudTop/cloudHeight, removed). These three
    // reshape the whole stack LIVE at draw time (no rebuild), so the sky presets
    // can dial it: thin high cirrus, low ceilings, towering stacks, etc.
    deckDensity:  1.0, // global cloud opacity across every deck
    deckAltScale: 1.0, // multiplies every deck altitude — clouds ride higher / lower
    deckThin:     0.66 // fade rate toward space (higher = thinner up high, 0 = solid to the top)
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
    drift: [0, 0, 0],                               // per-layer x drift (px)
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

  // ----- Periodic billow-fbm (seamless in X so cloud tiles tile cleanly) -----
  function wHash(ix, iy, seed) {
    var n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 0x9E3779B1);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function wSmooth(t) { return t * t * (3 - 2 * t); }
  // Value noise, lattice wrapped mod `px` in X (Y is free — the band fades top
  // and bottom so it never needs to wrap).
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
  // Billow fbm in [0,1]. u ∈ [0,1) across tile width; ny = py/TW (square cells).
  // Periodic in u so the cloud tile repeats seamlessly across the screen.
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
  // masses instead of uniform round blobs. Both terms are periodic in u, so the
  // tile still wraps seamlessly. `mz` is the morph offset (0 unless morphing).
  function wCloudField(u, ny, L, mz) {
    var n2 = ny + mz;
    var wx = (wFbm(u, n2, L.cells, L.seed + 555, 2) - 0.5) * CLOUD_WARP;
    var wy = (wFbm(u, n2, L.cells, L.seed + 911, 2) - 0.5) * CLOUD_WARP;
    return wBillow(u + wx, n2 + wy, L.cells, L.seed, CLOUD_OCT);
  }

  // ----- Cloud layer caches -----
  // Far → near. Bigger `cells` = smaller / more numerous puffs (further away).
  // `scrW` = on-screen tile width as a fraction of canvas width; kept modest so
  // the upscale stays gentle (the v1 blur came from a 200px tile blown up ~10x).
  // envC/envW place each layer's band within the tile (far high+thin, near
  // low+tall) to stack depth; all sit in the upper sky so flying never clips.
  var CLOUD_LAYERS = [
    { cells: 4, seed: 7001, envC: 0.32, envW: 0.66, scrW: 0.42, drift: 0.42, dense: 1.00, contrast: 0.88 },
    { cells: 3, seed: 3307, envC: 0.50, envW: 0.72, scrW: 0.58, drift: 0.66, dense: 1.12, contrast: 0.98 },
    { cells: 2, seed: 9209, envC: 0.66, envW: 0.78, scrW: 0.74, drift: 1.00, dense: 1.24, contrast: 1.08 }
  ];
  // Higher-res tiles than v1 (was 200x130) so the on-screen upscale is ~2-4x,
  // not ~10x. The fbm FIELD is baked ONCE (coverage-independent) so the higher
  // resolution costs nothing per weather change — only the cheap shade re-runs.
  var CLOUD_TW = 480, CLOUD_TH = 288, CLOUD_OCT = 5, CLOUD_WARP = 0.12;
  // Top-light march: NS density samples straight up the field give bright sunlit
  // crowns fading to a shadowed base — the volume cue that reads as "3D cloud".
  var CLOUD_LIGHT_NS = 7, CLOUD_LIGHT_STEP = 3, CLOUD_LIGHT_ABSORB = 0.42;
  var cloudTiles = null;
  var cloudLightBucket = -999999;
  var cloudMorphBucket = -999999;

  // ----- Cloud DECKS (v24.47) — world-anchored altitude bands you fly THROUGH -----
  // v1 drew the three baked tiles in ONE fixed screen band (top half of the
  // viewport). That wasted clouds behind the mountains, and the band faded out
  // on a climb — so flying up you passed the clouds once and the sky went empty.
  //
  // Now the same three baked tiles (the `tile` index below) are STAMPED at a
  // stack of fixed WORLD altitudes. Each deck's VERTICAL screen position tracks
  // its world altitude (parallax 1), so climbing slides each deck down past you
  // — you fly THROUGH the layers. Horizontal motion gets per-deck parallax
  // (hPar: higher = farther/slower) + wind drift. Crucially each deck is drawn
  // at a FIXED WORLD SIZE (worldW × worldH), so cloud SIZE never changes with
  // altitude — the screen-band v1 was pinned precisely to dodge the old
  // expand/contract bug (BACKGROUND_STYLE §15); fixed world size dodges it too.
  //
  // The stack runs from just above the ridgeline (so nothing is wasted behind
  // the mountains) up toward space, thinning (alpha) as it climbs. Built lazily
  // because CLOUD_LAYERS (the tile bakes) must exist first.
  var CLOUD_DECK_BASE   = 170;   // lowest deck altitude (world px above surface) — clears the mountains
  var CLOUD_DECK_N      = 10;    // number of decks stacked surface → near-space
  var CLOUD_DECK_GAP0   = 120;   // first gap between decks (world px)
  var CLOUD_DECK_GROWTH = 1.34;  // each gap this much larger than the last (dense low, sparse high)
  var CLOUD_DECKS = null;
  function buildCloudDecks() {
    var decks = [], alt = CLOUD_DECK_BASE, gap = CLOUD_DECK_GAP0, n = Math.max(1, CLOUD_DECK_N | 0);
    for (var i = 0; i < n; i++) {
      var f = (n > 1) ? i / (n - 1) : 0;                 // 0 at the bottom → 1 at the top of the stack
      decks.push({
        tile:   i % CLOUD_LAYERS.length,                 // cycle the 3 baked appearances for variety
        alt:    Math.round(alt),                         // world px above the surface
        hPar:   0.55 + f * 0.40,                         // horizontal parallax: 0.55 low/near → 0.95 high/far
        worldW: 560 + i * 52,                            // fixed world footprint (no expand/contract)
        worldH: 165 + i * 9,
        f:      f,                                       // 0 (low) → 1 (top of stack); drives live thinning at draw
        drift:  1 - f * 0.80                             // high clouds crawl, low clouds scud
      });
      alt += gap; gap *= CLOUD_DECK_GROWTH;
    }
    return decks;
  }
  function weatherEnsureDecks() {
    if (CLOUD_DECKS) return;
    CLOUD_DECKS = buildCloudDecks();
    weather.deckDrift = [];
    for (var i = 0; i < CLOUD_DECKS.length; i++) weather.deckDrift.push(0);
  }

  function weatherInitTiles() {
    cloudTiles = [];
    for (var i = 0; i < CLOUD_LAYERS.length; i++) {
      var c = document.createElement('canvas');
      c.width = CLOUD_TW; c.height = CLOUD_TH;
      var cx = c.getContext('2d');
      cloudTiles.push({
        field: new Float32Array(CLOUD_TW * CLOUD_TH),   // raw warped-billow, baked once
        lum: new Uint8ClampedArray(CLOUD_TW * CLOUD_TH),
        den: new Uint8ClampedArray(CLOUD_TW * CLOUD_TH),
        color: c, ctx: cx, img: cx.createImageData(CLOUD_TW, CLOUD_TH),
        pat: null,   // repeating CanvasPattern snapshot of `color` (rebuilt after every recolour)
        ready: false, fieldDirty: true, shadeDirty: true, recolorDirty: true, coverBucket: -1
      });
    }
  }

  // STAGE 1 (rare — once per layer, or when morphing): bake the raw warped-billow
  // field. This is the expensive fbm work; it is coverage-INDEPENDENT, so a
  // weather change never re-runs it (only the cheap shade pass below).
  function weatherBakeField(li) {
    var L = CLOUD_LAYERS[li], T = cloudTiles[li], f = T.field;
    var mz = weather.morph * 0.5, idx = 0;
    for (var py = 0; py < CLOUD_TH; py++) {
      var ny = py / CLOUD_TW;
      for (var px = 0; px < CLOUD_TW; px++, idx++) {
        f[idx] = wCloudField(px / CLOUD_TW, ny, L, mz);
      }
    }
    T.fieldDirty = false;
    T.shadeDirty = true;
  }

  // STAGE 2 (on coverage change): from the baked field, derive density (alpha)
  // and a baked luminance = ambient + sun·(top-light self-shadow) + silver rim.
  function weatherShadeLayer(li) {
    var L = CLOUD_LAYERS[li], T = cloudTiles[li], f = T.field;
    var cov = Math.max(0, Math.min(1, weather.cov)) * L.dense;
    var thresh = 0.86 - cov * 0.42;   // HIGH so only field PEAKS become cloud → discrete masses with clear-sky gaps (not a flat haze sheet)
    var feather = 0.05 + 0.06 * weatherTune.softness;   // defined-but-soft edges
    var halfW = L.envW * 0.5;
    var envTop = L.envC - halfW, envBot = L.envC + halfW;
    var rim = weatherTune.rimGlow;
    var idx = 0;
    for (var py = 0; py < CLOUD_TH; py++) {
      var ef = py / CLOUD_TH;
      var env = wSmooth(Math.max(0, Math.min(1, (ef - envTop) / halfW))) *
                wSmooth(Math.max(0, Math.min(1, (envBot - ef) / halfW)));
      // The deck fill samples the tile as a repeating pattern, which wraps in Y
      // as well as X — keep the wrap rows empty so the bottom row can never
      // bleed into a deck's top edge.
      if (py === 0 || py === CLOUD_TH - 1) env = 0;
      for (var px = 0; px < CLOUD_TW; px++, idx++) {
        if (env <= 0.001) { T.lum[idx] = 0; T.den[idx] = 0; continue; }
        // env biases the THRESHOLD (clouds thin toward the band edges) instead of
        // dimming density, so cloud cores within the band stay fully OPAQUE.
        var threshEff = thresh + (1 - env) * 0.62;
        var dRaw = (f[idx] - threshEff) / feather;
        dRaw = dRaw < 0 ? 0 : (dRaw > 1 ? 1 : dRaw);
        var d = dRaw * dRaw * (3 - 2 * dRaw);           // smoothstep → solid cores, soft edges
        if (d <= 0.003) { T.lum[idx] = 0; T.den[idx] = 0; continue; }
        // top-light: accumulate cloud density directly above → exp self-shadow,
        // so crowns are bright and the underside falls into soft shadow.
        var occ = 0;
        for (var k = 1; k <= CLOUD_LIGHT_NS; k++) {
          var py2 = py - k * CLOUD_LIGHT_STEP;
          if (py2 < 0) break;
          var u2 = (f[py2 * CLOUD_TW + px] - thresh) / feather;
          if (u2 > 0) occ += (u2 > 1 ? 1 : u2);
        }
        var light = Math.exp(-occ * CLOUD_LIGHT_ABSORB);
        // silver lining: thin density edges glow
        var edge = wSmooth(Math.max(0, Math.min(1, d / 0.14))) *
                   (1 - wSmooth(Math.max(0, Math.min(1, (d - 0.14) / 0.5))));
        var lum = 0.30 + 0.62 * light + rim * 0.30 * edge;
        lum = lum < 0 ? 0 : (lum > 1 ? 1 : lum);
        T.lum[idx] = (lum * 255) | 0;
        T.den[idx] = (d * 255) | 0;
      }
    }
    T.shadeDirty = false;
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
  // Recolour a baked layer to the current sky lighting. Cheap (tile-sized); runs
  // when the lighting bucket or the structure changes, not every frame.
  function weatherRecolorLayer(li, hi, sh) {
    var T = cloudTiles[li], L = CLOUD_LAYERS[li];
    var data = T.img.data, lum = T.lum, den = T.den;
    var ct = weatherTune.contrast * L.contrast;
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
    T.pat = null;   // patterns snapshot the canvas at createPattern — stale now
    T.recolorDirty = false;
  }

  // ----- Precip pool (world-anchored, world px) -----
  // Drops live at WORLD positions (v24.126) — the field stays put while the
  // camera moves, and each drop dies on the first solid tile it meets, so
  // precip lands on the ground line yet falls freely down dug shafts and
  // holes. Render-only: drops never touch the liquid sim (the v24.125
  // resting-calm baseline stays locked). Positions + speeds are world px;
  // the draw projects through cam + dpr*worldScale like the cloud decks.
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

    // cloud drift — base breeze + surfaceWind; accumulated per DECK (high
    // clouds crawl, low clouds scud — see CLOUD_DECKS[i].drift).
    var sw = (typeof surfaceWind !== 'undefined') ? surfaceWind.current : 0;
    var windPxS = (weatherTune.baseDrift + Math.abs(sw) * 90 * (1 + weather.wind * 1.3)) *
                  (sw < 0 ? -1 : 1) * weatherTune.driftScale;
    if (sw === 0) windPxS = weatherTune.baseDrift * weatherTune.driftScale;
    weatherEnsureDecks();
    for (var i = 0; i < CLOUD_DECKS.length; i++) {
      weather.deckDrift[i] += windPxS * CLOUD_DECKS[i].drift * dt;
    }

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

  // ----- Draw: clouds (called from drawNightSkyToScreen, sky-clipped) -----
  function drawWeatherClouds(cw, ch, skyBottomPx) {
    if (!weatherTune.enabled || PERF_DISABLE_WEATHER) return;
    if (weather.cov < 0.02 || cw <= 0 || ch <= 0) return;
    // No global altitude fade any more — the decks ARE the altitude response:
    // climbing slides each deck down past you and reveals the higher ones,
    // thinning toward space. Underground the sky pass never calls this, and the
    // sky clip in drawNightSkyToScreen trims any deck that dips below the horizon.
    if (!cloudTiles) weatherInitTiles();
    weatherEnsureDecks();

    // STAGE 1 — bake one dirty FIELD per frame. The field is coverage-independent,
    // so this only runs at first show (3 frames) or when morphing (opt-in).
    var morphB = Math.round(weather.morph * 4);
    if (morphB !== cloudMorphBucket) {
      cloudMorphBucket = morphB;
      if (weatherTune.morphSpeed > 0) for (var m = 0; m < cloudTiles.length; m++) cloudTiles[m].fieldDirty = true;
    }
    for (var b = 0; b < cloudTiles.length; b++) {
      if (cloudTiles[b].fieldDirty) { weatherBakeField(b); break; }
    }
    // STAGE 2 — coverage bucket → re-shade (cheap); one dirty layer per frame.
    var covB = Math.round(weather.cov * 14);
    for (var i = 0; i < cloudTiles.length; i++) {
      if (cloudTiles[i].coverBucket !== covB) { cloudTiles[i].shadeDirty = true; cloudTiles[i].coverBucket = covB; }
    }
    for (var s = 0; s < cloudTiles.length; s++) {
      if (cloudTiles[s].shadeDirty && !cloudTiles[s].fieldDirty) { weatherShadeLayer(s); break; }
    }

    // lighting colours from the live atmospheric-scatter cache (150)
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
      for (var r = 0; r < cloudTiles.length; r++) {
        if (cloudTiles[r].ready) weatherRecolorLayer(r, hi, sh);
      }
    } else {
      for (var rr = 0; rr < cloudTiles.length; rr++) {
        if (cloudTiles[rr].ready && cloudTiles[rr].recolorDirty) {
          // a freshly baked layer needs its colour even mid-bucket — reuse last
          weatherRecolorLayer(rr, _wLastHi || [230, 230, 235], _wLastSh || [40, 44, 60]);
        }
      }
    }

    // ----- Stamp the decks, high/far → low/near so nearer decks overlap on top.
    // Each deck is a baked tile placed at a fixed WORLD altitude (surfaceY-alt),
    // so its vertical screen position tracks true altitude (parallax 1) and you
    // fly THROUGH it. Footprint is a fixed WORLD size (worldW × worldH) → cloud
    // size never drifts with altitude (no expand/contract). Horizontal = camera
    // parallax (far/high decks barely shift) + accumulated wind drift, tiled.
    //
    // Tiling rides a repeating CanvasPattern (one transformed fillRect per
    // deck), NOT abutted drawImage stamps: the noise wraps seamlessly, but a
    // stamp's bilinear edge filters against transparency instead of the
    // neighbouring repeat, which drew a hard vertical seam line every wPx
    // (v24.127 fix). Same idiom as the biome wall fills in 140.
    var ws = dpr * worldScale;
    var surfaceY = SKY_ROWS * TILE;
    var globalA = weatherTune.layerAlpha * weatherTune.deckDensity;
    var altScale = weatherTune.deckAltScale, thin = weatherTune.deckThin;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (var di = CLOUD_DECKS.length - 1; di >= 0; di--) {
      var D = CLOUD_DECKS[di];
      var T = cloudTiles[D.tile];
      if (!T || !T.ready) continue;
      var deckA = 1 - D.f * thin;                                 // live thinning toward space
      if (deckA <= 0.01) continue;
      var hPx = D.worldH * ws;
      var topPx = (surfaceY - D.alt * altScale - cam.y) * ws - hPx * 0.5;   // deck top, device px
      if (topPx >= skyBottomPx || topPx + hPx <= 0) continue;     // below the horizon clip / above screen → cull
      var wPx = Math.max(48, D.worldW * ws);
      var shiftPx = cam.x * (1 - D.hPar) * ws - weather.deckDrift[di];
      var off = ((shiftPx % wPx) + wPx) % wPx;
      ctx.globalAlpha = Math.max(0, Math.min(1, globalA * deckA));
      if (!T.pat) T.pat = ctx.createPattern(T.color, 'repeat');
      T.pat.setTransform(new DOMMatrix([wPx / CLOUD_TW, 0, 0, hPx / CLOUD_TH, -off, topPx]));
      ctx.fillStyle = T.pat;
      ctx.fillRect(0, topPx, cw, hPx);
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
