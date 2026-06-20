  // ====== RENDER: Parallax mountain layers ======
  //
  // Each layer is a deterministic series of peaks indexed by an integer.
  // Layer space is mapped to world space by:
  //
  //   worldX = layerX + cam.x * parallaxStrength
  //
  // so the layer drifts at (1 - parallaxStrength) the rate of the
  // foreground. parallaxStrength = 0 → moves 1:1 with the world (no
  // parallax), 1 → fully locked to the screen. Three layers stacked back
  // to front produce a sense of depth.
  //
  // Each peak has a randomised type (major / minor) and a 7-point silhouette
  // (outer shoulder → mid shoulder → sub-peak → peak → sub-peak → mid
  // shoulder → outer shoulder) so the ridge reads as jagged rather than
  // triangular. Major peaks above a height threshold get a snow cap with a
  // jagged snow line, a subtle moon-side rim highlight, and a darker
  // shadow polygon on the opposite slope.

  // Build the per-peak geometry. Returns 7 points (x,y) walking left→right
  // across the silhouette, plus metadata.
  function buildMountainPeak(idx, seed, step, baseY, cfg) {
    var hRoll    = tileHash01(idx, seed, 0xA710);
    var typeRoll = tileHash01(idx, seed, 0xA711);
    var isMajor  = (typeRoll > cfg.minorRatio);
    var minH = isMajor ? cfg.minHMajor : cfg.minHMinor;
    var maxH = isMajor ? cfg.maxHMajor : cfg.maxHMinor;
    var h = minH + hRoll * (maxH - minH);
    if (isMajor && tileHash01(idx, seed, 0xA712) > 0.80) h *= 1.30;

    var jx = (tileHash01(idx, seed, 0xA713) - 0.5) * step * 0.22;
    var peakX = idx * step + step * 0.5 + jx;

    // Stage 3 — per-peak asymmetric tilt (fault-block style). tilt ∈
    // [-0.7, +0.7]. Positive → right slope steeper (widR shrunk, widL
    // grown). Negative → left slope steeper. Symmetric pyramids are the
    // "kid drawing" failure mode; real mountains rise sharper on one
    // side. Most peaks get a small tilt; rare hash values produce dramatic
    // fault-block silhouettes.
    var tilt = (tileHash01(idx, seed, 0xA730) - 0.5) * 1.4;
    var asymStrength = 0.55;
    var widBase = step * (0.45 + tileHash01(idx, seed, 0xA714) * 0.16);
    var widL = widBase * (1 + tilt * asymStrength);
    widBase = step * (0.45 + tileHash01(idx, seed, 0xA715) * 0.16);
    var widR = widBase * (1 - tilt * asymStrength);

    // Stage 3 — wider sub-peak height variance (0.60..0.92 instead of
    // 0.76..0.88) so some peaks read as twin-peaks (sub near main) while
    // others show clear shoulders (sub lower). Breaks the templated look.
    var subLHFrac = 0.60 + tileHash01(idx, seed, 0xA719) * 0.32;
    var subRHFrac = 0.60 + tileHash01(idx, seed, 0xA71E) * 0.32;

    // 7-point silhouette. Y values are baseY - height (higher = lower Y).
    var oshL_x = peakX - widL;
    var oshL_y = baseY - h * (0.04 + tileHash01(idx, seed, 0xA716) * 0.16);
    var mshL_x = peakX - widL * (0.58 + tileHash01(idx, seed, 0xA717) * 0.16);
    var mshL_y = baseY - h * (0.40 + tileHash01(idx, seed, 0xA718) * 0.20);
    var subL_x = peakX - widL * (0.22 + tileHash01(idx, seed, 0xA71A) * 0.10);
    var subL_y = baseY - h * subLHFrac;

    var oshR_x = peakX + widR;
    var oshR_y = baseY - h * (0.04 + tileHash01(idx, seed, 0xA71B) * 0.16);
    var mshR_x = peakX + widR * (0.58 + tileHash01(idx, seed, 0xA71C) * 0.16);
    var mshR_y = baseY - h * (0.38 + tileHash01(idx, seed, 0xA71D) * 0.20);
    var subR_x = peakX + widR * (0.22 + tileHash01(idx, seed, 0xA71F) * 0.10);
    var subR_y = baseY - h * subRHFrac;

    return {
      idx: idx,
      isMajor: isMajor,
      h: h,
      tilt: tilt,
      pts: [
        [oshL_x, oshL_y],
        [mshL_x, mshL_y],
        [subL_x, subL_y],
        [peakX,  baseY - h],
        [subR_x, subR_y],
        [mshR_x, mshR_y],
        [oshR_x, oshR_y]
      ]
    };
  }

  // ====== Aerial-perspective tinting helper ======
  // Distant objects pick up the colour of the air column between viewer
  // and object — at sunset, far mountains warm toward the horizon RGB;
  // at noon they cool toward the high-elevation blue. Lerp the layer's
  // base hex toward the cached scatter colour by `amt`. amt scales with
  // dayWeight so we don't tint mountains during true night (mountains
  // stay dark per the night palette).
  function aerialTint(hexColor, amt) {
    if (!hexColor) return hexColor;
    var w = amt * (0.35 + 0.65 * atmosDayWeight);
    if (w <= 0.001) return hexColor;
    var h = hexColor.charAt(0) === '#' ? hexColor.substring(1) : hexColor;
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    var tr = atmosHorizonRGB.r, tg = atmosHorizonRGB.g, tb = atmosHorizonRGB.b;
    var or = Math.round(r + (tr - r) * w);
    var og = Math.round(g + (tg - g) * w);
    var ob = Math.round(b + (tb - b) * w);
    return 'rgb(' + or + ',' + og + ',' + ob + ')';
  }

  // ====== Stage-3 polygon mountain renderer ======
  //
  // Mountains are continuous polygons filled with ctx.fill(). The earlier
  // (v10.24) per-pixel column rasterizer produced visible vertical seams
  // whenever ws = dpr * worldScale wasn't a clean integer: each 1-world-
  // wide fillRect landed at a fractional device-pixel position, canvas
  // anti-aliased both edges, and adjacent columns' AA halves didn't sum
  // to a full pixel — leaving thin sky-show-through gaps. Polygon fill
  // has only one set of edges (the silhouette outline), so the interior
  // is solid and only the silhouette diagonal gets slight AA — which
  // reads as a soft hand-painted edge, not pixel-noise.
  //
  // Per-layer atmospheric-perspective discipline (BACKGROUND_STYLE §3):
  //   Far  — body polygon only. No snow, no shadow, no rim.
  //   Mid  — body + dark-side shadow + snow caps with moon-side rim +
  //          soft top-edge rim stroke in the FAR layer's colour, so the
  //          silhouette feathers into the layer behind it. Also hosts
  //          distant outpost lights.
  //   Near — body + 1-px BG.nearMtnRim outline stroke.

  function snowIntersect(pts, fromIdx, toIdx, snowY) {
    var step = (toIdx > fromIdx) ? 1 : -1;
    for (var i = fromIdx; i !== toIdx; i += step) {
      var a = pts[i], b = pts[i + step];
      if ((a[1] >= snowY && b[1] <= snowY) || (a[1] <= snowY && b[1] >= snowY)) {
        var denom = (b[1] - a[1]);
        var t = denom === 0 ? 0 : (snowY - a[1]) / denom;
        return a[0] + (b[0] - a[0]) * t;
      }
    }
    return null;
  }

  function drawSnowCap(peak, cfg) {
    var snowFrac = 0.50 + tileHash01(peak.idx, cfg.seed, 0xD710) * 0.22;
    var snowH = peak.h * snowFrac;
    if (snowH < cfg.snowMinH * 0.75) return;
    var pts = peak.pts;
    var peakY = pts[3][1];
    var snowY = peakY + (peak.h - snowH);

    var leftX  = snowIntersect(pts, 0, 3, snowY);
    var rightX = snowIntersect(pts, 6, 3, snowY);
    if (leftX === null || rightX === null) return;

    // Cap polygon: along the silhouette from left intersection up over
    // the peak to right intersection, then back along a jagged snow line.
    ctx.beginPath();
    ctx.moveTo(leftX, snowY);
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][1] < snowY) ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.lineTo(rightX, snowY);
    var segs = 6;
    for (var s = segs - 1; s >= 1; s--) {
      var fx = leftX + (rightX - leftX) * (s / segs);
      var jagY = snowY + (tileHash01(peak.idx, s + 17, 0xE712) - 0.35) * 3.6;
      ctx.lineTo(fx, jagY);
    }
    ctx.closePath();
    ctx.fillStyle = cfg.snowColor;
    ctx.fill();

    // Moon-side rim — thin highlight on the right side of the cap.
    if (cfg.snowRimColor) {
      ctx.strokeStyle = cfg.snowRimColor;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(pts[3][0], pts[3][1]);
      if (pts[4][1] < snowY) ctx.lineTo(pts[4][0], pts[4][1]);
      if (pts[5][1] < snowY) ctx.lineTo(pts[5][0], pts[5][1]);
      ctx.lineTo(rightX, snowY);
      ctx.stroke();
    }
  }

  // ====== Mountain layer bitmap cache (v13.17) ======
  // drawMountainLayer used to issue ~120 canvas path fills/strokes per
  // frame for ~35 STATIC peaks. Path rendering (tessellation) is the slow
  // canvas op — and the mountains never change, they only parallax-scroll.
  // So each layer is rendered ONCE into an offscreen strip canvas and
  // blitted (drawImage — near-free) per frame; the strip is rebuilt only
  // when the camera scrolls a peak out of the cached idx range, or on zoom.
  // Output is pixel-identical: the strip runs the exact same pass code.
  // The blinking outpost lights animate, so they're drawn live after the
  // blit. The aerial tint + moon-rim track the day/night cycle, so the
  // strip ALSO rebuilds when timeOfDay crosses a MTN_TIME_BUCKETS bucket
  // (v13.19) — at most one layer per frame, so the rebuild stays cheap.
  var MTN_CACHE_MARGIN = 4;          // extra peaks cached each side
  var MTN_TIME_BUCKETS = 600;        // day/night quantisation for rebuilds
  var mtnStripCache = {};            // keyed by cfg.seed (unique per layer)
  var mtnCacheFailed = false;        // permanent fallback to live drawing
  var mtnRebuiltThisFrame = false;   // caps strip rebuilds to 1 per frame

  // Aerial-perspective tint — returns a colour-tinted copy of cfg, or cfg
  // itself when the layer has no aerial amount.
  function aerialTintCfg(cfg) {
    if (!(cfg.aerialAmt && cfg.aerialAmt > 0)) return cfg;
    return {
      parallax: cfg.parallax, step: cfg.step, seed: cfg.seed,
      minorRatio: cfg.minorRatio,
      minHMajor: cfg.minHMajor, maxHMajor: cfg.maxHMajor,
      minHMinor: cfg.minHMinor, maxHMinor: cfg.maxHMinor,
      snowMinH: cfg.snowMinH, baseYOffset: cfg.baseYOffset,
      rimWidth: cfg.rimWidth, moonRimWidth: cfg.moonRimWidth,
      distantLights: cfg.distantLights,
      fillColor:    aerialTint(cfg.fillColor,    cfg.aerialAmt),
      shadowColor:  aerialTint(cfg.shadowColor,  cfg.aerialAmt),
      snowColor:    aerialTint(cfg.snowColor,    cfg.aerialAmt * 0.4),
      snowRimColor: aerialTint(cfg.snowRimColor, cfg.aerialAmt * 0.4),
      rimColor:     aerialTint(cfg.rimColor,     cfg.aerialAmt),
      moonRimColor: aerialTint(cfg.moonRimColor, cfg.aerialAmt * 0.6)
    };
  }

  // Build the peak array for an idx range; ox is added to every point's x.
  function buildLayerPeaks(cfg, baseY, idxFrom, idxTo, ox) {
    var peaks = [];
    for (var idx = idxFrom; idx <= idxTo; idx++) {
      var pk = buildMountainPeak(idx, cfg.seed, cfg.step, baseY, cfg);
      for (var pi = 0; pi < pk.pts.length; pi++) pk.pts[pi][0] += ox;
      peaks.push(pk);
    }
    return peaks;
  }

  // Mountain passes 1-5 (body / shadow / snow / rim / moon-rim) into `ctx`.
  // Pass 6 (blinking lights) is NOT here — it animates, so it's drawn live.
  function drawMtnPasses(cfg, peaks, baseY) {
    // ---- Pass 1: body silhouette, ONE POLYGON PER PEAK ----
    // v10.45 — was a single continuous polygon walking through all peaks.
    // With per-peak asymmetric tilt (v10.29), adjacent peaks can overlap
    // horizontally; a single polygon then self-intersects and Canvas's
    // nonzero fill rule leaves a bowtie hole. One closed polygon per peak
    // avoids it — overlapping peaks just paint the same colour twice.
    ctx.fillStyle = cfg.fillColor;
    for (var k = 0; k < peaks.length; k++) {
      var pts = peaks[k].pts;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], baseY + 12);
      for (var j = 0; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.lineTo(pts[6][0], baseY + 12);
      ctx.closePath();
      ctx.fill();
    }

    // ---- Pass 2: dark-side shadow on major peaks (mid layer only) ----
    if (cfg.shadowColor) {
      ctx.fillStyle = cfg.shadowColor;
      for (var s = 0; s < peaks.length; s++) {
        var sp = peaks[s];
        if (!sp.isMajor) continue;
        var sPts = sp.pts;
        ctx.beginPath();
        ctx.moveTo(sPts[1][0], sPts[1][1]);
        ctx.lineTo(sPts[2][0], sPts[2][1]);
        ctx.lineTo(sPts[3][0], sPts[3][1]);
        ctx.lineTo(sPts[3][0] - (sPts[3][0] - sPts[1][0]) * 0.35, sPts[3][1] + (sPts[1][1] - sPts[3][1]) * 0.55);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ---- Pass 3: snow caps on major peaks above the snow threshold ----
    if (cfg.snowColor && cfg.snowMinH) {
      for (var n = 0; n < peaks.length; n++) {
        var np = peaks[n];
        if (!np.isMajor || np.h < cfg.snowMinH) continue;
        drawSnowCap(np, cfg);
      }
    }

    // ---- Pass 4: top-edge rim stroke ----
    // §5: near layer = 1-px BG.nearMtnRim outline. Mid layer = soft top
    // edge in the FAR fill colour. Far layer = no rim. Per-peak polyline
    // (one moveTo per peak) so no connector strokes cross the valleys.
    if (cfg.rimColor) {
      ctx.strokeStyle = cfg.rimColor;
      ctx.lineWidth = cfg.rimWidth || 1;
      ctx.lineJoin = 'miter';
      for (var k2 = 0; k2 < peaks.length; k2++) {
        var pts2 = peaks[k2].pts;
        ctx.beginPath();
        ctx.moveTo(pts2[0][0], pts2[0][1]);
        for (var j2 = 1; j2 < pts2.length; j2++) {
          ctx.lineTo(pts2[j2][0], pts2[j2][1]);
        }
        ctx.stroke();
      }
    }

    // ---- Pass 5: sun/moon-facing body rim ----
    // A brighter line along the lit slope of every major peak.
    if (cfg.moonRimColor) {
      var sunE = computeSunElevation(timeOfDay);
      var lightOnRight = Math.cos(sunE) > 0;
      var rimA = 0.35 + 0.65 * Math.abs(Math.sin(sunE));
      ctx.save();
      ctx.globalAlpha = rimA;
      ctx.strokeStyle = cfg.moonRimColor;
      ctx.lineWidth = cfg.moonRimWidth || 1;
      ctx.lineJoin = 'miter';
      for (var mr = 0; mr < peaks.length; mr++) {
        var mrPk = peaks[mr];
        if (!mrPk.isMajor) continue;
        var mrPts = mrPk.pts;
        ctx.beginPath();
        if (lightOnRight) {
          ctx.moveTo(mrPts[3][0], mrPts[3][1]);  // peak
          ctx.lineTo(mrPts[4][0], mrPts[4][1]);  // sub-right
          ctx.lineTo(mrPts[5][0], mrPts[5][1]);  // mid-right
          ctx.lineTo(mrPts[6][0], mrPts[6][1]);  // outer-right shoulder
        } else {
          ctx.moveTo(mrPts[3][0], mrPts[3][1]);  // peak
          ctx.lineTo(mrPts[2][0], mrPts[2][1]);  // sub-left
          ctx.lineTo(mrPts[1][0], mrPts[1][1]);  // mid-left
          ctx.lineTo(mrPts[0][0], mrPts[0][1]);  // outer-left shoulder
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---- Pass 6: distant outpost lights — drawn LIVE every frame ----
  // Reuses the antenna-bulb language from BUILDING_STYLE §9 — abrupt 1 Hz
  // blink. Animated, so it can't be baked into the cached strip.
  function drawMtnLights(cfg, baseY) {
    if (!cfg.distantLights) return;
    var p = cfg.parallax, step = cfg.step, seed = cfg.seed;
    var firstIdx = Math.floor((cam.x * (1 - p) - step * 2) / step);
    var lastIdx  = Math.ceil((cam.x * (1 - p) + screenW + step * 2) / step);
    var ox = cam.x * p;
    var tNow = performance.now();
    for (var idx = firstIdx; idx <= lastIdx; idx++) {
      // v23.34 — was buildMountainPeak() per index (1 object + 8 sub-arrays)
      // just to read isMajor + the apex. Test isMajor cheaply first; only the
      // surviving blinking peaks compute the apex, using the SAME hash salts +
      // formula as buildMountainPeak's major branch so the painted light
      // positions stay byte-identical.
      if (tileHash01(idx, seed, 0xA711) <= cfg.minorRatio) continue;   // not major
      if (tileHash01(idx, seed, 0xF710) > 0.28) continue;
      var phase = Math.floor(tileHash01(idx, seed, 0xF711) * 4);
      var blinkOn = ((Math.floor(tNow / 500) + phase) & 1) === 0;
      if (!blinkOn) continue;
      var lightColor = (tileHash01(idx, seed, 0xF712) < 0.6) ? BG.distantLight : BG.distantWindow;
      var hRoll = tileHash01(idx, seed, 0xA710);
      var h = cfg.minHMajor + hRoll * (cfg.maxHMajor - cfg.minHMajor);
      if (tileHash01(idx, seed, 0xA712) > 0.80) h *= 1.30;
      var peakX = idx * step + step * 0.5 + (tileHash01(idx, seed, 0xA713) - 0.5) * step * 0.22;
      var pkX = Math.floor(peakX + ox);
      var pkY = Math.floor(baseY - h);
      ctx.fillStyle = lightColor;
      ctx.fillRect(pkX, pkY - 1, 1, 1);
    }
  }

  // Render one layer's static passes (1-5) into an offscreen strip canvas,
  // in the layer's LOGICAL coord space (peaks at idx*step, no parallax ox).
  function buildMtnStrip(cfg, baseY, idxFrom, idxTo, ws, reuse) {
    var step = cfg.step;
    var maxH = cfg.maxHMajor || 130;
    var stripWX0 = (idxFrom - 1) * step;       // strip's world-x origin
    var stripWY0 = baseY - maxH - 24;          // strip's world-y origin
    var stripWW  = (idxTo - idxFrom + 3) * step;
    var stripWH  = maxH + 48;
    var cw = Math.max(1, Math.ceil(stripWW * ws));
    var ch = Math.max(1, Math.ceil(stripWH * ws));
    var canvas = reuse || document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var sctx = canvas.getContext('2d');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, cw, ch);
    // world -> strip-device: same ws scale as the main world transform,
    // origin shifted so logical (stripWX0, stripWY0) maps to strip (0,0).
    sctx.setTransform(ws, 0, 0, ws, -stripWX0 * ws, -stripWY0 * ws);
    var peaks = buildLayerPeaks(cfg, baseY, idxFrom, idxTo, 0);
    var oldCtx = ctx;
    ctx = sctx;
    try { drawMtnPasses(cfg, peaks, baseY); }
    finally { ctx = oldCtx; }
    return { canvas: canvas, ws: ws, idxFrom: idxFrom, idxTo: idxTo,
             stripWX0: stripWX0, stripWY0: stripWY0,
             timeKey: Math.round(timeOfDay * MTN_TIME_BUCKETS) };
  }

  // Cached entry point — blits the layer's strip, rebuilding it only on a
  // scroll-out-of-range or zoom miss. Falls back to live drawing on error.
  function drawMountainLayer(cfg) {
    cfg = aerialTintCfg(cfg);
    var p = cfg.parallax, step = cfg.step;
    var baseY = (SKY_ROWS * TILE) + (cfg.baseYOffset || 0);
    var firstIdx = Math.floor((cam.x * (1 - p) - step * 2) / step);
    var lastIdx  = Math.ceil((cam.x * (1 - p) + screenW + step * 2) / step);
    var ws = dpr * worldScale;
    var timeKey = Math.round(timeOfDay * MTN_TIME_BUCKETS);

    if (mtnCacheFailed) {
      drawMtnPasses(cfg, buildLayerPeaks(cfg, baseY, firstIdx, lastIdx, cam.x * p), baseY);
      drawMtnLights(cfg, baseY);
      return;
    }

    var sc = mtnStripCache[cfg.seed];
    // Scroll/zoom staleness MUST rebuild now — the strip wouldn't cover the
    // visible peaks. Day/night staleness (aerial tint + moon-rim move with
    // timeOfDay) only needs the colours refreshed, so it's deferred to at
    // most one layer per frame, keeping the rebuild hitch tiny.
    var scrollStale = !sc || sc.ws !== ws || sc.idxFrom > firstIdx || sc.idxTo < lastIdx;
    var timeStale = sc && sc.timeKey !== timeKey;
    if (scrollStale || (timeStale && !mtnRebuiltThisFrame)) {
      try {
        sc = buildMtnStrip(cfg, baseY, firstIdx - MTN_CACHE_MARGIN,
                           lastIdx + MTN_CACHE_MARGIN, ws, sc && sc.canvas);
        mtnStripCache[cfg.seed] = sc;
        mtnRebuiltThisFrame = true;
      } catch (e) {
        mtnCacheFailed = true;
        drawMtnPasses(cfg, buildLayerPeaks(cfg, baseY, firstIdx, lastIdx, cam.x * p), baseY);
        drawMtnLights(cfg, baseY);
        return;
      }
    }

    // Blit the strip under the world transform: it's device-res, so the
    // dest world-size is canvas.width/ws — maps back to 1:1 device pixels.
    // The logical origin is parallax-shifted by cam.x*p.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc.canvas, sc.stripWX0 + cam.x * p, sc.stripWY0,
                  sc.canvas.width / ws, sc.canvas.height / ws);
    drawMtnLights(cfg, baseY);
  }

  function drawSkyMountains(worldLeft, worldRight, surfaceY) {
    mtnRebuiltThisFrame = false;   // v13.19 — reset the 1-rebuild-per-frame cap
    // Layer 0 — DISTANT LAND. A low, broad, heavily-hazed ridge FAR beyond the
    // mountains. Drawn first (furthest back) so the mountains overlap it and it
    // shows through the gaps between peaks as distant land at the horizon. This
    // gives the horizon depth + light instead of sky-meets-dark when the player
    // lifts off and looks back. Silhouette only (no snow / rim / shadow); the
    // strongest aerial wash of any layer so it nearly melts into the sky.
    drawMountainLayer({
      parallax: 0.90, step: 168, seed: 5501,
      minorRatio: 0.34,
      minHMajor: 18, maxHMajor: 40,
      minHMinor: 8,  maxHMinor: 18,
      fillColor:   BG.farLandFill,
      baseYOffset: 13,
      aerialAmt:   0.82
    });
    // Layer 1 — FAR. Silhouette only per §5. Closest in value/saturation
    // to the sky so it dissolves into the horizon.
    drawMountainLayer({
      parallax: 0.78, step: 96, seed: 31,
      minorRatio: 0.40,
      minHMajor: 50,  maxHMajor:  95,
      minHMinor: 22,  maxHMinor:  46,
      fillColor:   BG.farMtnFill,
      baseYOffset: 6,
      aerialAmt:   0.55
    });
    // Layer 2 — MID. Main visual focus. Snow caps +
    // soft top-edge stroke in the FAR fill colour so the silhouette
    // feathers into the layer behind it. Hosts the distant outpost lights.
    //
    // v10.46 — count and height reduced (was step 118 / maxHMajor 180).
    // Mountains read as too busy around the spawn town. Fewer, shorter
    // peaks let the surface compound breathe.
    drawMountainLayer({
      parallax: 0.50, step: 150, seed: 137,
      minorRatio: 0.50,
      minHMajor: 80,  maxHMajor: 130,
      minHMinor: 32,  maxHMinor:  62,
      snowMinH: 95,
      fillColor:    BG.midMtnFill,
      // v10.44 — shadowColor removed. The Pass-2 shadow polygon was a
      // 4-vertex shape on the upper-left slope intended as a depth cue,
      // but it was rendering as an obviously-darker triangle inside the
      // mountain body — visible as a geometric "inner peak" defect.
      // Mountains read fine as flat silhouettes at this distance per the
      // atmospheric-perspective research; the snow cap, moon-side rim,
      // and shape language carry the depth.
      snowColor:    BG.midMtnSnow,
      snowRimColor: BG.midMtnSnowRim,
      rimColor:     BG.farMtnRim,
      rimWidth:     0.6,
      // Moon-side rim — slightly brighter than fill so the right slope
      // of every major peak picks up implied lunar illumination. Reuses
      // BG.farMtnRim so it matches the layer-behind colour discipline.
      moonRimColor: BG.farMtnRim,
      moonRimWidth: 0.8,
      distantLights: true,
      baseYOffset: 2,
      aerialAmt:    0.30
    });
    // Layer 3 — NEAR. Sharpest, darkest. Carries the 1-px BG.nearMtnRim
    // outline per §5 (the only mountain layer that gets a proper rim).
    // v10.46 — count and height reduced (was step 78 / maxHMajor 105).
    drawMountainLayer({
      parallax: 0.22, step: 105, seed: 191,
      minorRatio: 0.45,
      minHMajor: 48,  maxHMajor:  80,
      minHMinor: 20,  maxHMinor:  38,
      snowMinH: 65,
      fillColor:    BG.nearMtnFill,
      rimColor:     BG.nearMtnRim,
      rimWidth:     1,
      // Near-layer moon rim — reuses nearMtnRim (slightly brighter than
      // nearMtnFill) so the right slope picks up moon light without
      // breaking the layer's value-range budget.
      moonRimColor: BG.nearMtnRim,
      moonRimWidth: 1,
      snowColor:    BG.midMtnSnow,
      snowRimColor: BG.midMtnSnowRim,
      baseYOffset: 0,
      aerialAmt:    0.10
    });

    // No horizon haze in v10.25 — the v10.24 dithered version landed as
    // chunky world-pixel-sized dots scattered through the sky, reading as
    // noise rather than atmosphere. Mountains alone provide enough horizon
    // separation. Haze will return in Stage 5 as a screen-space particle
    // pass (drift snow / dust) where the cells can be device-pixel-fine.
  }

