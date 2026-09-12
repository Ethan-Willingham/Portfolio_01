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
  // jagged snow line and softly changing sun/moon-facing highlights.

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

  // Cache only geometry. Light is evaluated every frame, so there are no
  // time buckets, bitmap replacements, or layer-by-layer colour updates.
  // Each peak has its own fallback paths. This avoids re-rasterizing a large
  // compound path when WebGL is unavailable. Rim paths have no valley connectors.
  var MTN_CACHE_MARGIN = 4;
  var mtnPathCache = {};
  var mtnLight = null;
  var mtnHexCache = {};

  function mtnEase(lo, hi, value) {
    var t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }

  function mtnRGB(hex) {
    return mtnHexCache[hex] || (mtnHexCache[hex] = nightSkyHexRGB(hex));
  }

  function mtnMix(a, b, weight) {
    return { r: a.r + (b.r - a.r) * weight,
             g: a.g + (b.g - a.g) * weight,
             b: a.b + (b.b - a.b) * weight };
  }

  function mtnCSS(c) {
    // Preserve fractional colour until Canvas rasterization.
    return 'rgb(' + c.r.toFixed(3) + ',' + c.g.toFixed(3) + ',' + c.b.toFixed(3) + ')';
  }

  function updateMountainLight(now) {
    var arc = computeSunElevation(timeOfDay);
    var sunY = Math.sin(arc), sunX = Math.cos(arc);
    var day = scatDayWeight(arc);
    var moon = (1 - Math.cos(moonPhase * Math.PI * 2)) * 0.5;
    var sunUp = mtnEase(-0.10, 0.16, sunY);
    var moonUp = mtnEase(-0.10, 0.16, -sunY) * (1 - day) * (0.12 + moon * 0.22);
    var right = mtnEase(-0.55, 0.55, sunX);
    var grade = SKY_SUNSET_GRADE;
    var twilight = Math.pow(1 - mtnEase(0, Math.max(0.001, grade.twi), Math.abs(sunY)),
                            Math.max(0.1, grade.twiShape));
    var warmth = twilight * Math.min(1, Math.max(0, grade.drama));
    var gold = grade.stops[0], peach = grade.stops[1];
    var warm = { r: (gold[0] * 0.7 + peach[0] * 0.3) * 255,
                 g: (gold[1] * 0.7 + peach[1] * 0.3) * 255,
                 b: (gold[2] * 0.7 + peach[2] * 0.3) * 255 };
    var air = mtnMix(atmosHorizonRGB, warm, warmth * 0.22);

    // The sky's shared RGB cache is integer-valued. A short, time-based
    // filter removes its one-channel stairs without delaying sun direction.
    // Initialize immediately on first view or after an underground/pause gap.
    var blend = !mtnLight || now - mtnLight.now > 1000 ? 1 :
                1 - Math.exp(-Math.max(0, now - mtnLight.now) / 160);
    if (mtnLight) air = mtnMix(mtnLight.air, air, blend);
    mtnLight = {
      now: now, air: air, day: day, moon: moonUp, warm: warm, warmth: warmth,
      right: sunUp * (0.22 + 0.78 * right) + moonUp * (1 - 0.78 * right),
      left: sunUp * (1 - 0.78 * right) + moonUp * (0.22 + 0.78 * right)
    };
  }

  function mountainColors(cfg) {
    var light = mtnLight;
    var aerial = (cfg.aerialAmt || 0) * (0.35 + 0.65 * light.day);
    var fill = mtnMix(mtnRGB(cfg.fillColor), light.air, aerial);
    var snow = cfg.snowColor && mtnMix(mtnRGB(BG.midMtnFill), mtnRGB(cfg.snowColor),
                                     0.20 + 0.72 * light.day + 0.20 * light.moon);
    if (snow) {
      snow = mtnMix(snow, light.warm, light.warmth * 0.38);
      snow = mtnMix(snow, light.air, aerial * 0.4);
    }
    var snowRim = snow && mtnMix(snow, mtnRGB(cfg.snowRimColor || cfg.snowColor),
                                0.18 + 0.30 * light.day);
    if (snowRim) snowRim = mtnMix(snowRim, light.warm, light.warmth * 0.30);
    var rim = cfg.rimColor && mtnMix(mtnRGB(cfg.rimColor), light.air, aerial);
    var litRim = cfg.moonRimColor &&
                mtnMix(mtnRGB(cfg.moonRimColor), light.air, aerial * 0.6);
    if (litRim) litRim = mtnMix(litRim, light.warm, light.warmth * 0.16);
    return { fill: mtnCSS(fill), snow: snow && mtnCSS(snow), rim: rim && mtnCSS(rim),
             left: litRim && mtnCSS(mtnMix(rim || fill, litRim, light.left)),
             right: litRim && mtnCSS(mtnMix(rim || fill, litRim, light.right)),
             snowLeft: snowRim && mtnCSS(mtnMix(snow, snowRim, light.left)),
             snowRight: snowRim && mtnCSS(mtnMix(snow, snowRim, light.right)) };
  }

  function snowIntersect(pts, fromIdx, toIdx, snowY) {
    var step = (toIdx > fromIdx) ? 1 : -1;
    for (var i = fromIdx; i !== toIdx; i += step) {
      var a = pts[i], b = pts[i + step];
      if ((a[1] >= snowY && b[1] <= snowY) || (a[1] <= snowY && b[1] >= snowY)) {
        var denom = b[1] - a[1];
        var t = denom === 0 ? 0 : (snowY - a[1]) / denom;
        return a[0] + (b[0] - a[0]) * t;
      }
    }
    return null;
  }

  function mtnSlope(path, pts, direction, snowY, snowX) {
    path.moveTo(pts[3][0], pts[3][1]);
    for (var i = 3 + direction; i >= 0 && i < 7; i += direction) {
      if (snowY !== undefined && pts[i][1] >= snowY) break;
      path.lineTo(pts[i][0], pts[i][1]);
    }
    if (snowY !== undefined) path.lineTo(snowX, snowY);
  }

  function buildMtnPeakPaths(cfg, baseY, idxFrom, idxTo, PathType) {
    var MakePath = PathType || Path2D;
    var paths = { body: new MakePath(), rim: new MakePath(), snow: new MakePath(),
                  left: new MakePath(), right: new MakePath(),
                  snowLeft: new MakePath(), snowRight: new MakePath(),
                  idxFrom: idxFrom, idxTo: idxTo, baseY: baseY };
    for (var idx = idxFrom; idx <= idxTo; idx++) {
      var peak = buildMountainPeak(idx, cfg.seed, cfg.step, baseY, cfg);
      var pts = peak.pts;
      paths.body.moveTo(pts[0][0], baseY + 12);
      for (var j = 0; j < pts.length; j++) paths.body.lineTo(pts[j][0], pts[j][1]);
      paths.body.lineTo(pts[6][0], baseY + 12);
      paths.body.closePath();
      paths.rim.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) paths.rim.lineTo(pts[k][0], pts[k][1]);
      if (!peak.isMajor) continue;
      mtnSlope(paths.left, pts, -1);
      mtnSlope(paths.right, pts, 1);
      if (!cfg.snowColor || !cfg.snowMinH || peak.h < cfg.snowMinH) continue;
      var snowH = peak.h * (0.50 + tileHash01(idx, cfg.seed, 0xD710) * 0.22);
      if (snowH < cfg.snowMinH * 0.75) continue;
      var snowY = baseY - snowH;
      var leftX = snowIntersect(pts, 0, 3, snowY);
      var rightX = snowIntersect(pts, 6, 3, snowY);
      if (leftX === null || rightX === null) continue;
      paths.snow.moveTo(leftX, snowY);
      for (var n = 0; n < pts.length; n++) {
        if (pts[n][1] < snowY) paths.snow.lineTo(pts[n][0], pts[n][1]);
      }
      paths.snow.lineTo(rightX, snowY);
      for (var s = 5; s >= 1; s--) {
        paths.snow.lineTo(leftX + (rightX - leftX) * s / 6,
                         snowY + (tileHash01(idx, s + 17, 0xE712) - 0.35) * 3.6);
      }
      paths.snow.closePath();
      mtnSlope(paths.snowLeft, pts, -1, snowY, leftX);
      mtnSlope(paths.snowRight, pts, 1, snowY, rightX);
    }
    return paths;
  }

  function buildMtnPaths(cfg, baseY, idxFrom, idxTo) {
    var paths = { peaks: [], visible: [], idxFrom: idxFrom, idxTo: idxTo, baseY: baseY };
    for (var idx = idxFrom; idx <= idxTo; idx++) {
      var peak = buildMtnPeakPaths(cfg, baseY, idx, idx);
      var points = buildMountainPeak(idx, cfg.seed, cfg.step, baseY, cfg).pts;
      peak.leftX = points[0][0]; peak.rightX = points[6][0];
      paths.peaks.push(peak);
    }
    return paths;
  }

  function drawMtnPaths(peaks, name, stroke) {
    for (var i = 0; i < peaks.length; i++) {
      if (stroke) ctx.stroke(peaks[i][name]);
      else ctx.fill(peaks[i][name]);
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

  function drawMountainLayer(cfg) {
    var p = cfg.parallax, step = cfg.step;
    var baseY = SKY_ROWS * TILE + (cfg.baseYOffset || 0);
    var firstIdx = Math.floor((cam.x * (1 - p) - step * 2) / step);
    var lastIdx = Math.ceil((cam.x * (1 - p) + screenW + step * 2) / step);
    var paths = mtnPathCache[cfg.seed];
    if (!paths || paths.idxFrom > firstIdx || paths.idxTo < lastIdx || paths.baseY !== baseY) {
      paths = buildMtnPaths(cfg, baseY, firstIdx - MTN_CACHE_MARGIN, lastIdx + MTN_CACHE_MARGIN);
      mtnPathCache[cfg.seed] = paths;
    }
    var colors = mountainColors(cfg);
    var visible = paths.visible;
    visible.length = 0;
    var viewLeft = cam.x * (1 - p), viewRight = viewLeft + screenW;
    for (var i = 0; i < paths.peaks.length; i++) {
      var peak = paths.peaks[i];
      // Include the miter extent at both edges; cache margins are not visible art.
      if (peak.rightX + 16 >= viewLeft && peak.leftX - 16 <= viewRight) visible.push(peak);
    }
    ctx.save();
    ctx.translate(cam.x * p, 0);
    ctx.lineJoin = 'miter';
    ctx.fillStyle = colors.fill;
    drawMtnPaths(visible, 'body', false);
    if (colors.snow) {
      ctx.fillStyle = colors.snow;
      drawMtnPaths(visible, 'snow', false);
    }
    if (colors.rim) {
      ctx.strokeStyle = colors.rim;
      ctx.lineWidth = cfg.rimWidth || 1;
      drawMtnPaths(visible, 'rim', true);
    }
    if (colors.left) {
      ctx.lineWidth = cfg.moonRimWidth || 1;
      ctx.strokeStyle = colors.left; drawMtnPaths(visible, 'left', true);
      ctx.strokeStyle = colors.right; drawMtnPaths(visible, 'right', true);
    }
    if (colors.snowLeft) {
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = colors.snowLeft; drawMtnPaths(visible, 'snowLeft', true);
      ctx.strokeStyle = colors.snowRight; drawMtnPaths(visible, 'snowRight', true);
    }
    ctx.restore();
    drawMtnLights(cfg, baseY);
  }

  function drawSkyMountains(worldLeft, worldRight, surfaceY) {
    updateMountainLight(performance.now());
    var layers = mountainLayers();
    if (typeof drawMountainsGL === 'function' && drawMountainsGL(layers)) return;
    for (var i = 0; i < layers.length; i++) drawMountainLayer(layers[i]);
  }

  function mountainLayers() {
    // Layer 0 — DISTANT LAND. A low, broad, heavily-hazed ridge FAR beyond the
    // mountains. Drawn first (furthest back) so the mountains overlap it and it
    // shows through the gaps between peaks as distant land at the horizon. This
    // gives the horizon depth + light instead of sky-meets-dark when the player
    // lifts off and looks back. Silhouette only (no snow / rim / shadow); the
    // strongest aerial wash of any layer so it nearly melts into the sky.
    return [{
      parallax: 0.90, step: 168, seed: 5501,
      minorRatio: 0.34,
      minHMajor: 18, maxHMajor: 40,
      minHMinor: 8,  maxHMinor: 18,
      fillColor:   BG.farLandFill,
      baseYOffset: 13,
      aerialAmt:   0.82
    },
    // Layer 1 — FAR. Silhouette only per §5. Closest in value/saturation
    // to the sky so it dissolves into the horizon.
    {
      parallax: 0.78, step: 96, seed: 31,
      minorRatio: 0.40,
      minHMajor: 50,  maxHMajor:  95,
      minHMinor: 22,  maxHMinor:  46,
      fillColor:   BG.farMtnFill,
      baseYOffset: 6,
      aerialAmt:   0.55
    },
    // Layer 2 — MID. Main visual focus. Snow caps +
    // soft top-edge stroke in the FAR fill colour so the silhouette
    // feathers into the layer behind it. Hosts the distant outpost lights.
    //
    // v10.46 — count and height reduced (was step 118 / maxHMajor 180).
    // Mountains read as too busy around the spawn town. Fewer, shorter
    // peaks let the surface compound breathe.
    {
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
      // Sun/moon-facing rim, smoothly shared between both slopes. Reuses
      // BG.farMtnRim so it matches the layer-behind colour discipline.
      moonRimColor: BG.farMtnRim,
      moonRimWidth: 0.8,
      distantLights: true,
      baseYOffset: 2,
      aerialAmt:    0.30
    },
    // Layer 3 — NEAR. Sharpest, darkest. Carries the 1-px BG.nearMtnRim
    // outline per §5 (the only mountain layer that gets a proper rim).
    // v10.46 — count and height reduced (was step 78 / maxHMajor 105).
    {
      parallax: 0.22, step: 105, seed: 191,
      minorRatio: 0.45,
      minHMajor: 48,  maxHMajor:  80,
      minHMinor: 20,  maxHMinor:  38,
      snowMinH: 65,
      fillColor:    BG.nearMtnFill,
      rimColor:     BG.nearMtnRim,
      rimWidth:     1,
      // Near-layer moon rim — reuses nearMtnRim (slightly brighter than
      // nearMtnFill) so the lit slope picks up moon light without
      // breaking the layer's value-range budget.
      moonRimColor: BG.nearMtnRim,
      moonRimWidth: 1,
      snowColor:    BG.midMtnSnow,
      snowRimColor: BG.midMtnSnowRim,
      baseYOffset: 0,
      aerialAmt:    0.10
    }];

    // No horizon haze in v10.25 — the v10.24 dithered version landed as
    // chunky world-pixel-sized dots scattered through the sky, reading as
    // noise rather than atmosphere. Mountains alone provide enough horizon
    // separation. Haze will return in Stage 5 as a screen-space particle
    // pass (drift snow / dust) where the cells can be device-pixel-fine.
  }
