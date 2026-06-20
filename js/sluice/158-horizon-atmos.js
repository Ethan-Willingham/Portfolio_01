  /* ====== HORIZON ATMOSPHERE: aerial-perspective haze ====== */
  //
  // Above ground, the sky is painted only DOWN TO the surface line and clipped
  // there (see render() in 140 + drawNightSkyToScreen in 150). So the moment
  // the player lifts off and the surface slides down the screen, the view is a
  // hard horizon: sky + sun above the line, dark ground (terrain + fog-of-war)
  // below it, meeting on a crisp edge. That edge reads as "the bottom half is
  // black" — the defect this fragment fixes.
  //
  // Real aerial perspective veils the receding ground in atmosphere — hazier
  // and paler the farther (higher) you are — so the ground dissolves into the
  // sky instead of hard-cutting to black. This is a SCREEN-SPACE wash drawn
  // after the world (over terrain + fog, under the precip + HUD). Its colour is
  // the LIVE atmospheric-scatter horizon (atmosHorizonRGB, maintained in 150),
  // so the veil always matches the sky — bright/warm by day, dusky at night —
  // exactly like the mountain aerial tint (aerialTint, 160).
  //
  // The strength keys off how far the surface line has slid BELOW the resting
  // camera framing (CAMERA_SURFACE_FRAC), not an absolute altitude — so it's
  // zoom-independent, the resting surface stays untouched, and the veil only
  // exists while a chunk of ground is actually visible below the horizon.
  //
  // The distant-land parallax layer lands in this same fragment (piece 2).

  // DISABLED by owner request (v24.53): fogging the ground just because the
  // player gained altitude read as strange on every ascent. The veil is parked
  // here, not deleted — flip enabled:1 (or the gm 'haze' group) to preview it.
  // A future "fog in the No Man's Land" idea is a DIFFERENT system: zone-
  // triggered, not this altitude ramp, so it will be built fresh rather than by
  // re-enabling this.
  var hazeTune = {
    enabled:  0,      // OFF — no aerial-perspective ground veil on ascent (see note above)
    startPad: 0.04,   // veil starts this far below the resting framing (frac of screen h)
    maxA:     0.72,   // peak veil alpha at the horizon line, at full lean
    floorA:   0.45,   // veil alpha at the screen bottom, as a fraction of peak
    feather:  0.05    // sky-side feather above the horizon line (frac of canvas h)
  };

  // Screen-space aerial haze over the ground below the horizon. No-op while
  // resting on (or below) the surface; eases in as the player climbs.
  function drawHorizonHaze() {
    if (!hazeTune.enabled) return;
    var cw = canvas.width, ch = canvas.height;
    if (cw <= 0 || ch <= 0) return;
    var ws = dpr * worldScale;
    var surfaceY = SKY_ROWS * TILE;
    var sy = (surfaceY - cam.y) * ws;            // surface line, device px
    if (sy >= ch) return;                         // ground is below the screen — all sky
    var startFrac = (typeof CAMERA_SURFACE_FRAC === 'number' ? CAMERA_SURFACE_FRAC : 0.55) + hazeTune.startPad;
    var syFrac = sy / ch;
    if (syFrac <= startFrac) return;              // resting at/near the surface — pristine
    // Lean factor: 0 just below the resting framing → 1 once the horizon has
    // slid (just past) the screen bottom. Pure function of screen position,
    // so flying back down reverses it smoothly.
    var lean = (syFrac - startFrac) / (1.05 - startFrac);
    if (lean > 1) lean = 1;

    var hz = atmosHorizonRGB || { r: 30, g: 34, b: 50 };
    var pre = 'rgba(' + (hz.r | 0) + ',' + (hz.g | 0) + ',' + (hz.b | 0) + ',';
    var peak = lean * hazeTune.maxA;
    var bottomA = peak * hazeTune.floorA;
    var feather = ch * hazeTune.feather;
    var top = sy - feather;
    if (top < 0) top = 0;

    var g = ctx.createLinearGradient(0, top, 0, ch);
    var linePos = (ch > top) ? (sy - top) / (ch - top) : 0;
    linePos = linePos < 0 ? 0 : (linePos > 1 ? 1 : linePos);
    g.addColorStop(0, pre + '0)');                                       // into the sky → clear
    if (linePos > 0.002 && linePos < 0.998) g.addColorStop(linePos, pre + peak.toFixed(3) + ')');
    g.addColorStop(1, pre + bottomA.toFixed(3) + ')');                    // nearer ground → lighter veil

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, cw, ch - top);
    ctx.restore();
  }

  /* ====== HORIZON LIMB (v24.132): the sky continues below the ground edge ====== */
  //
  // The GL sky raymarch (renderSkyGL, 150) computes the FULL canvas every
  // frame — including the rows BELOW its in-shader horizon, where view rays
  // strike the planet and return the true "distant land seen through maximum
  // air" colours: the bright Mie band hugging the limb, darkening with
  // depression angle, with the Volcanic sunset grade, the sun-azimuth glow
  // and the anti-twilight all baked in. drawNightSkyToScreen then CLIPS the
  // sky at the surface line and all of that is discarded — so ascending at
  // dusk shows the graded sunset blaze guillotined against unlit dirt. That
  // hard cut is the defect (owner, 2026-06-10).
  //
  // Fix: composite the DISCARDED below-line slice of the already-rendered
  // sky back over the ground. Alpha is 1.0 exactly at the line — it is the
  // same texture continuing, so the seam is invisible by construction — and
  // fades to 0 over a band whose height grows from zero as the player
  // climbs (same zoom-independent screen-fraction lean as the parked veil
  // above). The land edge dissolves into the planet's lit atmospheric limb:
  // a setting sun melts into it, a low moon's corona silvers it, and night
  // blacks it out on its own (the shader's below-horizon output is near-
  // black after civil twilight) — no per-time-of-day branches needed.
  //
  // This is NOT the v24.53 altitude fog (vetoed: it washed the WHOLE
  // visible ground in one flat veil colour). The limb is horizon-local,
  // carries real image detail rather than flat fog, decays within ~a tenth
  // of the screen, and costs one small offscreen composite per frame — no
  // extra GPU raymarching, no new palette colours (BACKGROUND_STYLE §4-safe;
  // architecture documented in §16).
  //
  // Invariants:
  //  - The limb's alpha at the surface line is ALWAYS 1.0 while active; the
  //    ascent ease-in comes from the band HEIGHT growing, never from
  //    thinning the line alpha (a thinned line re-exposes the hard edge as
  //    a ghost seam at (1 - alpha)).
  //  - Resting framing (syFrac <= start) draws nothing — the surface view
  //    stays pristine, per the v24.53 lesson.
  //  - PERF_DISABLE_NIGHTSKY (perf-iso H) silences it together with the sky
  //    pass that feeds it.
  var limbTune = {
    enabled:  1,      // master switch for the limb composite
    startPad: 0.03,   // activates this far below the resting framing (frac of ch)
    fullAt:   0.85,   // syFrac where the band reaches full height
    band:     0.13,   // max band height (frac of ch)
    shapePos: 0.42,   // downward-fade mid-stop position within the band
    shapeA:   0.42    // limb alpha remaining at the mid-stop (falloff shape)
  };
  var limbBuf = null, limbBufCtx = null;
  function drawHorizonLimb() {
    if (!limbTune.enabled || PERF_DISABLE_NIGHTSKY) return;
    var cw = canvas.width, ch = canvas.height;
    if (cw <= 0 || ch <= 0) return;
    var sy = Math.round((SKY_ROWS * TILE - cam.y) * dpr * worldScale);  // surface line, device px
    if (sy <= 0 || sy >= ch - 1) return;          // line off-screen — all ground or all sky below
    var syFrac = sy / ch;
    var start = (typeof CAMERA_SURFACE_FRAC === 'number' ? CAMERA_SURFACE_FRAC : 0.40) + limbTune.startPad;
    if (syFrac <= start) return;                  // resting at/near the surface — pristine
    var lean = (syFrac - start) / Math.max(0.05, limbTune.fullAt - start);
    if (lean > 1) lean = 1;
    lean = lean * lean * (3 - 2 * lean);          // ease the onset so liftoff doesn't pop
    var bandH = Math.round(ch * limbTune.band * lean);
    if (bandH < 2) return;

    // Source = whichever texture painted the sky this frame. Both are
    // full-canvas mappings; the GL canvas runs at a reduced internal
    // resolution (SKY_GL_RES_SCALE), so scale the source rect to match.
    var src = (skyGLLastDrew && skyGLCanvas && skyGLCanvas.width > 1) ? skyGLCanvas
            : (nightSkyGradientTex || null);
    if (!src || src.height < 2) return;
    var sxScale = src.width / cw, syScale = src.height / ch;
    var srcY = sy * syScale;
    var srcH = bandH * syScale;
    if (srcY + srcH > src.height) srcH = src.height - srcY;   // clamp the band foot
    if (srcH <= 0) return;
    var dstH = Math.max(1, Math.round(srcH / syScale));

    // Reused grow-only scratch buffer (device px).
    if (!limbBuf) { limbBuf = document.createElement('canvas'); }
    if (limbBuf.width < cw || limbBuf.height < dstH) {
      if (limbBuf.width  < cw)   limbBuf.width  = cw;
      if (limbBuf.height < dstH) limbBuf.height = dstH;
      limbBufCtx = null;                          // canvas resize wiped the ctx state
    }
    if (!limbBufCtx) limbBufCtx = limbBuf.getContext('2d');
    var b = limbBufCtx;
    b.save();
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, cw, dstH);
    b.globalCompositeOperation = 'source-over';
    b.imageSmoothingEnabled = true;               // match the main sky upscale (v11.78)
    b.drawImage(src, 0, srcY, cw * sxScale, srcH, 0, 0, cw, dstH);
    // Carve the downward fade out of the slice. destination-out: the stop
    // alpha is how much gets ERASED — 0 at the line (keep everything, the
    // alpha-1.0 invariant), 1 at the band foot (ground fully through).
    b.globalCompositeOperation = 'destination-out';
    var fade = b.createLinearGradient(0, 0, 0, dstH);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    var mid = limbTune.shapePos;
    if (mid > 0.02 && mid < 0.98) {
      var midErase = 1 - Math.max(0, Math.min(1, limbTune.shapeA));
      fade.addColorStop(mid, 'rgba(0,0,0,' + midErase.toFixed(3) + ')');
    }
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    b.fillStyle = fade;
    b.fillRect(0, 0, cw, dstH);
    b.restore();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(limbBuf, 0, 0, cw, dstH, 0, sy, cw, dstH);
    ctx.restore();
  }
