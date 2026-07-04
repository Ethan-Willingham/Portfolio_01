  // ====== RENDER: Main draw call ======

  // The live gel's vertical colour ramp (jelloDrawBody's translucent body layer),
  // sampled at t in [0..1]: piecewise-linear between the same three stops —
  // (hue, 80%, 76%, .40a) -> (hue, 84%, 58%, .54a) -> (hue-6, 80%, 36%, .68a) —
  // so buried jello tiles and activated bodies are the SAME material by
  // construction (v24.153). Change jelloDrawBody's stops? Mirror them here.
  function jelloTileRampCol(hue, alpha, t) {
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var h, s, l, a, u;
    if (t < 0.5) {
      u = t * 2;
      h = hue; s = 80 + 4 * u; l = 76 - 18 * u; a = (0.40 + 0.14 * u) * alpha;
    } else {
      u = (t - 0.5) * 2;
      h = hue - 6 * u; s = 84 - 4 * u; l = 58 - 22 * u; a = (0.54 + 0.14 * u) * alpha;
    }
    return 'hsla(' + h.toFixed(1) + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%,' + a.toFixed(3) + ')';
  }

  // v23.44 — the magma/mantle molten-rock tint had a fresh createLinearGradient
  // built for every visible magma tile, every frame. The stops are constant and
  // the gradient is exactly one tile tall, so cache one per biome (built on the
  // main ctx that render() always uses) and place it with a translate. Pixel-
  // identical. Lazy so it is only built once the player reaches that depth.
  var _magmaRockGradCache = null, _mantleRockGradCache = null;
  function magmaRockGrad(name) {
    if (name === 'mantle') {
      if (!_mantleRockGradCache) {
        _mantleRockGradCache = ctx.createLinearGradient(0, 0, 0, TILE);
        _mantleRockGradCache.addColorStop(0, '#4a0c10');
        _mantleRockGradCache.addColorStop(1, '#220406');
      }
      return _mantleRockGradCache;
    }
    if (!_magmaRockGradCache) {
      _magmaRockGradCache = ctx.createLinearGradient(0, 0, 0, TILE);
      _magmaRockGradCache.addColorStop(0, '#3a1410');
      _magmaRockGradCache.addColorStop(1, '#1a0604');
    }
    return _magmaRockGradCache;
  }

  // ===== Surface grass wind (v24.62) =====
  // The grass reacts to the miner's jet exhaust through a world-anchored 1-D wind
  // field: one damped spring per ~8 px of surface. The jet drives a target
  // lay-over into the cells under its footprint; each cell springs toward its
  // target with inertia, so the bend ramps in, OVERSHOOTS, trails as the rig
  // flies past, and keeps wobbling and settling for a beat after the jet is gone
  // (the old v24.59 version was stateless, so it snapped to the gaussian max and
  // vanished the instant the jet left). A faint ambient breeze keeps idle grass
  // drifting, and each blade adds its own gain + flutter so no two move alike.
  // Integrated in updateGrassWind(dt) from the loop, sampled per blade in render
  // via sampleGrassWind(). Tunable via the gm 'grass' group.
  var grassWindTune = {
    enabled:     true,
    // --- jet footprint: what the jet WANTS (instantaneous target) ---
    // v24.67: wash spreads much further from the jet (radius 2.4 -> 4.5, reach
    // 8 -> 11) so grass well to the sides of the rig still stirs.
    reach:       11,   // blast still ruffles grass within this many tiles below the nozzle
    radius:      4.5,  // footprint half-width on the surface, in tiles
    fanOut:      0.6,  // sideways push away from the footprint centre
    downwind:    0.9,  // extra drift along the exhaust's horizontal tilt
    // --- spring dynamics: HOW the grass responds ---
    // Tuned calmer/weightier (v24.66): higher damp kills the elastic bounce
    // (overshoot ~49% -> ~14%, just a whisper of settle after the jet leaves),
    // smaller bend/flutter/ambient keep the motion subtle.
    freq:        1.9,  // spring natural frequency (Hz): wobble speed
    damp:        0.5,  // damping ratio (<1 underdamped): higher = less bounce, quicker settle
    bend:        1.0,  // render gain: max lay-over as a multiple of the blade height
    flatten:     0.3,  // how much a laid-over blade shortens (0..1), scaled by its bend
    // --- per-blade life ---
    vary:        0.3,  // per-blade bend-gain variance
    flutter:     0.3,  // per-blade shimmer amplitude (rides on how fast the field is moving)
    flutterFreq: 3.0,  // base shimmer frequency (Hz)
    // --- ambient breeze: idle life ---
    ambient:     0.05, // ambient sway amplitude (subtle; set 0 to freeze idle grass)
    ambientFreq: 0.4,  // ambient temporal frequency (Hz)
    ambientWave: 7     // ambient spatial wavelength (tiles)
  };
  // World-anchored spring field, lazily sized to the world width. One cell per
  // GRASS_WIND_CELL px; gwFieldD = displacement (lay-over fraction), gwFieldV =
  // its velocity. grassWindTime accumulates dt for the flutter/ambient phases.
  var GRASS_WIND_CELL = 8;
  var gwFieldD = null, gwFieldV = null, gwFieldLen = 0;
  var grassWindTime = 0;
  var _gwS = { d: 0, v: 0 };                 // per-sample scratch (no alloc in the hot loop)
  var _gwFp = { active: false, cx: 0, strength: 0, dirX: 0, sigma: 1 };

  function grassWindEnsure() {
    if (gwFieldD) return;
    gwFieldLen = Math.ceil((WORLD_COLS * TILE) / GRASS_WIND_CELL) + 2;
    gwFieldD = new Float32Array(gwFieldLen);
    gwFieldV = new Float32Array(gwFieldLen);
  }

  // Grass only grows where the surface cell beneath it is solid. tileAt(SKY_ROWS,
  // col) is the topmost ground cell; null means dug out / pond pit / cave mouth, so
  // no blade is drawn there. Memoised on the last column (blades march left-to-right,
  // so the tileAt lookup runs about once per column, not once per blade).
  var _grassSupCol = 2147483647, _grassSupVal = false;
  function grassSupported(wx) {
    var col = Math.floor(wx / TILE);
    if (col !== _grassSupCol) {
      _grassSupCol = col;
      _grassSupVal = tileAt(SKY_ROWS, col) !== null;
    }
    return _grassSupVal;
  }

  // The jet's instantaneous target lay-over at world-x wx (0 outside the footprint).
  // The 0.55 falloff (v24.67, was 0.8) is a broader bell so the wider radius keeps
  // real presence out at the edges instead of vanishing right past the centre.
  function grassJetTarget(fp, wx) {
    if (!fp.active) return 0;
    var r = (wx - fp.cx) / fp.sigma;
    if (r < -3.5 || r > 3.5) return 0;
    var f = Math.exp(-r * r * 0.55) * fp.strength;
    return ((wx >= fp.cx ? 1 : -1) * grassWindTune.fanOut + fp.dirX * grassWindTune.downwind) * f;
  }

  // Integrate the wind field one step. Called from the game loop with the frame dt.
  function updateGrassWind(dt) {
    if (!grassWindTune.enabled) return;
    grassWindEnsure();
    if (dt > 1 / 30) dt = 1 / 30;            // cap so a frame hitch can't blow up the springs
    if (dt <= 0) return;
    grassWindTime += dt;

    var surfaceY = SKY_ROWS * TILE;

    // 1) Resolve the jet footprint (same geometry the v24.59 static version used).
    var fp = _gwFp;
    fp.active = false;
    if (rocketIntensity > 0.04) {
      var ed = rocketExhaustDir();
      var nz = playerLocalToWorld(PLAYER_W * 0.5, PLAYER_H - 1);
      if (ed.y > 0.12 && nz.y < surfaceY - 2) {
        var drop = (surfaceY - nz.y) / ed.y;
        var h = Math.max(0, 1 - drop / (Math.max(1, grassWindTune.reach) * TILE));
        fp.cx = nz.x + ed.x * drop;
        fp.strength = rocketIntensity * h * h;
        fp.dirX = Math.max(-1, Math.min(1, ed.x));
        fp.sigma = Math.max(8, grassWindTune.radius * TILE);
        fp.active = fp.strength > 0.01;
      }
    }

    // 2) Step the springs over the visible window + a screen of margin (so the
    //    settle finishes off-screen at normal flight speeds). Semi-implicit Euler.
    var omega = 2 * Math.PI * Math.max(0.05, grassWindTune.freq);
    var k = omega * omega;
    var c = 2 * Math.max(0, grassWindTune.damp) * omega;
    var ambAmp = grassWindTune.ambient;
    var ambW = (2 * Math.PI) / Math.max(1, grassWindTune.ambientWave * TILE);   // spatial
    var ambPh = grassWindTime * 2 * Math.PI * grassWindTune.ambientFreq;        // temporal
    var margin = screenW;
    var lo = Math.max(0, Math.floor((cam.x - margin) / GRASS_WIND_CELL));
    var hi = Math.min(gwFieldLen - 1, Math.ceil((cam.x + screenW + margin) / GRASS_WIND_CELL));
    for (var i = lo; i <= hi; i++) {
      var wx = i * GRASS_WIND_CELL;
      var T = grassJetTarget(fp, wx);
      if (ambAmp > 0) T += ambAmp * Math.sin(wx * ambW + ambPh);
      var d = gwFieldD[i], v = gwFieldV[i];
      v += (k * (T - d) - c * v) * dt;
      d += v * dt;
      if (d > 3) { d = 3; if (v > 0) v = 0; }            // clamp pathological swings
      else if (d < -3) { d = -3; if (v < 0) v = 0; }
      gwFieldD[i] = d;
      gwFieldV[i] = v;
    }
  }

  // Sample the field at world-x wx into _gwS {d, v} (linear interpolation, no alloc).
  function sampleGrassWind(wx) {
    _gwS.d = 0; _gwS.v = 0;
    if (!gwFieldD) return;
    var fx = wx / GRASS_WIND_CELL;
    var i0 = Math.floor(fx);
    if (i0 < 0 || i0 >= gwFieldLen - 1) return;
    var t = fx - i0;
    _gwS.d = gwFieldD[i0] * (1 - t) + gwFieldD[i0 + 1] * t;
    _gwS.v = gwFieldV[i0] * (1 - t) + gwFieldV[i0 + 1] * t;
  }

  // v23.50 — the UI overlay paints onto its OWN top canvas (z-index 6), above
  // the DOM-layered liquid (z4) + smoke (z5) effect canvases. The world draws on
  // the main canvas (z auto, BELOW the effects); without a dedicated top layer
  // the HUD/console/perf-overlay drew on the main canvas under the effects, so
  // water and smoke rendered straight through the gauges and the debug UI. A
  // sibling canvas lets the browser composite the layers natively (no per-frame
  // drawImage blit) while the UI always paints last. Mirrors the liquid/smoke
  // DOM-layer setup (see liquidGLEnsure).
  var uiTopCanvas = null, uiTopCtx = null, uiTopDisabled = false;
  function uiTopPositionDOM() {
    if (!uiTopCanvas) return;
    uiTopCanvas.style.left   = '0';
    uiTopCanvas.style.top    = '0';
    uiTopCanvas.style.width  = viewW + 'px';
    uiTopCanvas.style.height = viewH + 'px';
  }
  function uiTopEnsure() {
    if (uiTopDisabled) return null;
    if (!uiTopCanvas) {
      try {
        uiTopCanvas = document.createElement('canvas');
        uiTopCanvas.width = Math.max(1, canvas.width);
        uiTopCanvas.height = Math.max(1, canvas.height);
        uiTopCtx = uiTopCanvas.getContext('2d');
        if (!uiTopCtx) throw new Error('2D context unavailable for UI top canvas');
        uiTopCanvas.style.cssText =
          'position:absolute;left:0;top:0;pointer-events:none;z-index:6;display:block;';
        if (canvas && canvas.parentElement) canvas.parentElement.appendChild(uiTopCanvas);
        uiTopPositionDOM();
      } catch (e) {
        uiTopDisabled = true;
        uiTopCanvas = null;
        uiTopCtx = null;
        return null;
      }
    }
    // Keep the backing store aligned to the main canvas (resize / DPR change).
    if (uiTopCanvas.width !== canvas.width || uiTopCanvas.height !== canvas.height) {
      uiTopCanvas.width = Math.max(1, canvas.width);
      uiTopCanvas.height = Math.max(1, canvas.height);
      uiTopPositionDOM();
    }
    return uiTopCtx;
  }

  function render() {
    var _renderT0 = performance.now();
    // ---- Reset to native pixel space and clear ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ---- WORLD SPACE: scale by dpr * worldScale, translate by camera ----
    // The camera translation is rounded to the native pixel grid so the
    // chunk drawImage compositing lands on integer device pixels. Without
    // this, the bilinear filter (imageSmoothingEnabled true) blurs every
    // tile/feature edge into a 1-px soft seam that reads as a "gap"
    // between tiles. The world internally still tracks cam.x/y as floats
    // (smooth physics + follow); we only quantize the render transform.
    var ws = dpr * worldScale;
    // Combat screenshake: a tiny world-space offset (trauma-based, subtle,
    // reduced-motion-gated; defined in 085-combat.js). Applied to the world
    // transform only, so the HUD + native-space night sky stay steady.
    var _shk = (typeof combatShakeOffset === 'function') ? combatShakeOffset() : { x: 0, y: 0 };
    ctx.setTransform(ws, 0, 0, ws, -Math.round((cam.x - _shk.x) * ws), -Math.round((cam.y - _shk.y) * ws));
    // imageSmoothingEnabled true keeps gradients smooth
    ctx.imageSmoothingEnabled = true;

    // Visible world rect in world coords
    var worldLeft = cam.x;
    var worldTop = cam.y;
    var worldRight = cam.x + screenW;
    var worldBottom = cam.y + screenH;

    // ====== RENDER: Sky + atmosphere ======
    // Sky / atmosphere gradient. Anchored to fixed altitudes (in world px)
    // so the colors mean something spatial: deep space at the top, dark
    // upper atmosphere fading down to the warm horizon at the surface.
    var surfaceY = SKY_ROWS * TILE;
    if (worldTop < surfaceY) {
      // Night sky is painted in NATIVE pixel space (no world scale) so the
      // pre-rendered Milky Way texture stays crisp at 1:1 with no resampling
      // blur. Switch transform → paint → switch back to world transform.
      var skyBottomWorld = Math.min(surfaceY, worldBottom);
      var skyBottomPx = Math.round((skyBottomWorld - cam.y) * ws);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var _rTs = performance.now();
      if (!PERF_DISABLE_NIGHTSKY) drawNightSkyToScreen(skyBottomPx);
      perfMark('render.skyComposite', _rTs);
      ctx.setTransform(ws, 0, 0, ws, -Math.round((cam.x - _shk.x) * ws), -Math.round((cam.y - _shk.y) * ws));

      // Layered mountain silhouettes near the horizon
      if (!PERF_DISABLE_MOUNTAINS && worldBottom > surfaceY - TILE * 4) {
        _rTs = performance.now();
        drawSkyMountains(worldLeft, worldRight, surfaceY);
        perfMark('render.mountains', _rTs);
      }
    }

    // Underground bg — drawn per-layer for visual variety
    var _ugBg0 = performance.now();
    if (worldBottom > surfaceY) {
      var ugTop = Math.max(worldTop, surfaceY);
      var tBg = performance.now() / 1000;
      // Walk the on-screen town's layer stack and fill bands
      var _camStk = camLayerStack();
      for (var li = 0; li < _camStk.length; li++) {
        var L = _camStk[li];
        var bandTopY = surfaceY + L.minDepth * TILE;
        var bandBotY = surfaceY + L.maxDepth * TILE;
        if (bandBotY < ugTop) continue;
        if (bandTopY > worldBottom) break;
        var visTop = Math.max(bandTopY, ugTop);
        var visBot = Math.min(bandBotY, worldBottom);
        // Magma & mantle: dramatic animated background — deep red→orange
        // gradient with a slow heat pulse and floating embers. Replaces the
        // flat brown-black fill that used to make these layers look like
        // every other layer with red bits.
        if (L.name === 'magma' || L.name === 'mantle') {
          // Vertical heat gradient — biome-fill colour at the top from
          // BG.* palette, then transitioning to hotter colours toward the
          // bottom of the band. The hotter mid/bottom stops are *heat*
          // (not biome fill) so they stay as literals; if we promote them
          // to BG later we'd want `bgMagmaHot1` / `bgMagmaHot2` etc.
          var hg = ctx.createLinearGradient(0, bandTopY, 0, bandBotY);
          if (L.name === 'magma') {
            hg.addColorStop(0,    BG.bgMagma);
            hg.addColorStop(0.5,  '#4a1208');
            hg.addColorStop(1,    '#6e1c0a');
          } else {
            hg.addColorStop(0,    BG.bgMantle);
            hg.addColorStop(0.5,  '#5e0808');
            hg.addColorStop(1,    '#8a1010');
          }
          ctx.fillStyle = hg;
          ctx.fillRect(worldLeft, visTop, screenW, visBot - visTop);
          // Heat pulse — slow breathing orange wash
          var pulseHeat = 0.5 + 0.5 * Math.sin(tBg * 0.6);
          ctx.fillStyle = 'rgba(255,90,30,' + (0.05 + pulseHeat * 0.06).toFixed(3) + ')';
          ctx.fillRect(worldLeft, visTop, screenW, visBot - visTop);
          // Lava streak: a soft horizontal glow band that drifts slowly down
          var streakY = bandTopY + ((tBg * 18) % (bandBotY - bandTopY));
          if (streakY > visTop - 60 && streakY < visBot + 60) {
            var streakGrad = ctx.createLinearGradient(0, streakY - 40, 0, streakY + 40);
            streakGrad.addColorStop(0,   'rgba(255,120,40,0)');
            streakGrad.addColorStop(0.5, 'rgba(255,150,60,0.18)');
            streakGrad.addColorStop(1,   'rgba(255,120,40,0)');
            ctx.fillStyle = streakGrad;
            ctx.fillRect(worldLeft, Math.max(visTop, streakY - 40), screenW, 80);
          }
          // Floating embers — pseudo-random per visible cell, drifting upward
          drawEmbers(worldLeft, worldRight, visTop, visBot, L.name === 'mantle');
          // Magma/mantle keep the heat gradient + embers as their wall —
          // no biome wall pattern needed (and adding one would compete
          // with the heat treatment).
        } else {
          // v13.11 — the biome wall pattern IS the underground background
          // now: ONE fillRect per visible biome band, drawn BEHIND the
          // terrain chunks. The chunks erase their cave voids to
          // transparent (see drawSmoothVoids), so this wall shows through
          // every cave; the rock occludes it everywhere else. No per-chunk
          // contour mask, no parallax clip — terrain occlusion gives the
          // cave shape for free. The pattern rides its own matrix for the
          // X+Y parallax drift (imageSmoothing off so the speckle stays
          // crisp, matching the old per-chunk wall fill).
          var wallFill = PERF_DISABLE_CAVE_WALLS ? null : getBiomeWallFill(L.name);
          if (wallFill) {
            wallFill.setTransform(new DOMMatrix([1, 0, 0, 1,
              cam.x * (1 - BIOME_WALL_PARALLAX_X),
              cam.y * (1 - BIOME_WALL_PARALLAX_Y)]));
            ctx.fillStyle = wallFill;
            ctx.imageSmoothingEnabled = false;
            ctx.fillRect(worldLeft, visTop, screenW, visBot - visTop);
            ctx.imageSmoothingEnabled = true;
          } else {
            ctx.fillStyle = biomeBgColor(L.name);
            ctx.fillRect(worldLeft, visTop, screenW, visBot - visTop);
          }

          // Static foreground dirt cap: a solid topsoil lip (flat top, wavy
          // bottom) drawn over the topsoil wall's dead-straight top edge, so
          // the parallax background never visibly "ends" at the sky line.
          // Only when the surface is on screen; terrain occludes it everywhere
          // except the caves where the seam used to show.
          if (L.name === 'topsoil' && !PERF_DISABLE_CAVE_WALLS &&
              surfaceY <= worldBottom && worldTop <= surfaceY + SURFACE_CAP_MIN + SURFACE_CAP_WAVE) {
            drawSurfaceDirtCap(worldLeft, worldRight);
          }
        }
      }
    }
    perfMark('render.undergroundBg', _ugBg0);

    // ====== RENDER: Tiles + ores ======
    // ---- Draw tiles ----
    var startCol = Math.max(0, Math.floor(cam.x / TILE));
    var endCol = Math.min(COLS - 1, Math.floor((cam.x + screenW) / TILE));
    // ----- Tile rendering row range -----
    // Clamp to [0, TOTAL_ROWS-1] — the rows that could ever contain a tile.
    var startRowFull = Math.floor(cam.y / TILE);
    var endRowFull = Math.floor((cam.y + screenH) / TILE);
    var startRow = Math.max(0, startRowFull);
    var endRow = Math.min(TOTAL_ROWS - 1, endRowFull);

    var tNow = performance.now() / 1000;

    perfBuckets['render.sky'] = (perfBuckets['render.sky'] || 0) * 0.9 + (performance.now() - _renderT0) * 0.1;
    var _renderT1 = performance.now();
    if (!PERF_DISABLE_TERRAIN_CHUNKS) drawTerrainChunks(startRow, endRow, startCol, endCol);
    // v13.11 — cave walls are no longer a post-chunk pass. The biome wall
    // pattern is painted in the underground-bg pass BEHIND the chunks, and
    // the chunks erase their voids to transparent, so the rock simply
    // occludes the wall. No drawCaveWalls* call here any more.
    drawTerrainClearOverlays(startRow, endRow, startCol, endCol);
    perfBuckets['render.terrain'] = (perfBuckets['render.terrain'] || 0) * 0.9 + (performance.now() - _renderT1) * 0.1;
    var _renderT2 = performance.now();
    var _renderT2Tiles = _renderT2;

    for (var r = startRow; r <= endRow; r++) {
      var rowDepth = r - SKY_ROWS;
      var rowLayer = (rowDepth >= 0 && r < TOTAL_ROWS) ? getLayerForCam(rowDepth) : null;
      for (var c = startCol; c <= endCol; c++) {
        var tile = world[r] ? world[r][c] : null;
        if (tile) {
          var tx = c * TILE;
          var ty = r * TILE;

          // Earth station foundation: a poured-concrete panel per tile.
          // Each panel has a top wear surface, water-stained base, 3-tone
          // face variation, aggregate specks, and a small chance of
          // cracks, moss patches, weep holes, or exposed rebar — sells
          // weathered industrial concrete instead of clean repeating tiles.
          if (tile.type === 'foundation') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(tx, ty, TILE, TILE);
            ctx.clip();

            // 1-px mortar joint frame (stoneDark) — the panel face insets
            // by 1 px on left + right so two adjacent tiles share a 1-px
            // dark seam between them. No top or bottom inset (foundation
            // is a single row, so the band reads as continuous).
            ctx.fillStyle = BLD.stoneDark;
            ctx.fillRect(tx, ty, TILE, TILE);

            // Face tone — three variants for cross-tile variation
            var faceHash = tileHash01(r, c, 0xFA0);
            var faceColor = faceHash > 0.66 ? '#615d56'
                           : faceHash > 0.33 ? '#5a5650'
                                              : '#544f48';
            ctx.fillStyle = faceColor;
            ctx.fillRect(tx + 1, ty, TILE - 2, TILE);

            // Top wear surface (3 px lighter — foot traffic + sun bleach)
            ctx.fillStyle = '#6f6c66';
            ctx.fillRect(tx + 1, ty + 1, TILE - 2, 2);
            ctx.fillStyle = '#797670';
            ctx.fillRect(tx + 1, ty + 1, TILE - 2, 1);
            // Brightest 1-px rim along the very top
            ctx.fillStyle = '#8c8a85';
            ctx.fillRect(tx + 1, ty, TILE - 2, 1);

            // Bottom water-staining (darker base — moisture wicks up)
            ctx.fillStyle = '#403d36';
            ctx.fillRect(tx + 1, ty + TILE - 3, TILE - 2, 2);
            ctx.fillStyle = '#322f29';
            ctx.fillRect(tx + 1, ty + TILE - 1, TILE - 2, 1);

            // Aggregate specks (5 per panel — varied tones suggest pebbles
            // in poured concrete)
            for (var fh = 0; fh < 5; fh++) {
              var apX = tx + 2 + Math.floor(tileHash01(r, c, 0xFB0 + fh) * (TILE - 4));
              var apY = ty + 5 + Math.floor(tileHash01(r, c, 0xFC0 + fh) * (TILE - 10));
              var aColor = fh === 0 ? '#9c9994'           // bright
                          : fh === 1 ? '#7c7972'           // mid-light
                          : fh === 2 ? '#2a2826'           // dark
                          : fh === 3 ? '#666260'           // mid
                                      : '#403d36';          // dim
              ctx.fillStyle = aColor;
              ctx.fillRect(apX, apY, 1, 1);
            }

            // Diagonal hairline crack (~20% of panels)
            if (tileHash01(r, c, 0xFD0) > 0.80) {
              var crX = tx + 5 + Math.floor(tileHash01(r, c, 0xFD1) * (TILE - 14));
              var crY = ty + 6 + Math.floor(tileHash01(r, c, 0xFD2) * (TILE - 14));
              var crLen = 6 + Math.floor(tileHash01(r, c, 0xFD3) * 5);
              var crSlope = tileHash01(r, c, 0xFD4) > 0.5 ? 1 : -1;
              ctx.fillStyle = '#2a2826';
              for (var ci = 0; ci < crLen; ci++) {
                ctx.fillRect(crX + ci, crY + Math.floor(ci * 0.5) * crSlope + (ci % 3 === 1 ? crSlope : 0), 1, 1);
              }
            }

            // Moss / water stain patch (~12% of panels)
            if (tileHash01(r, c, 0xFE0) > 0.88) {
              var msX = tx + 4 + Math.floor(tileHash01(r, c, 0xFE1) * (TILE - 14));
              var msY = ty + 10 + Math.floor(tileHash01(r, c, 0xFE2) * (TILE - 18));
              ctx.fillStyle = 'rgba(45,60,28,0.35)';
              ctx.fillRect(msX, msY, 6, 4);
              ctx.fillRect(msX + 1, msY - 1, 4, 1);
              ctx.fillRect(msX + 1, msY + 4, 4, 1);
              ctx.fillStyle = 'rgba(30,40,18,0.45)';
              ctx.fillRect(msX + 2, msY + 1, 2, 2);
            }

            // Weep hole at the base (~10% of panels — drainage in real
            // concrete foundations)
            if (tileHash01(r, c, 0xFF0) > 0.90) {
              var whX = tx + 6 + Math.floor(tileHash01(r, c, 0xFF1) * (TILE - 14));
              var whY = ty + TILE - 6;
              ctx.fillStyle = '#1a1816';
              ctx.fillRect(whX, whY, 2, 2);
              ctx.fillStyle = BLD.rustDark;
              ctx.fillRect(whX + 1, whY + 2, 1, 1);             // tiny rust drip
            }

            // Exposed rebar — rust streak from inside (~5% of panels)
            if (tileHash01(r, c, 0xF80) > 0.95) {
              var rbX = tx + TILE - 4 + Math.floor(tileHash01(r, c, 0xF81) * 2);
              ctx.fillStyle = BLD.rustDark;
              ctx.fillRect(rbX, ty + 5, 1, TILE - 9);
              ctx.fillStyle = BLD.rustBase;
              ctx.fillRect(rbX, ty + 9, 1, 5);
            }

            ctx.restore();
            continue;
          }

          // Reinforced barrier rock — distinct industrial look so the
          // player immediately reads "this isn't ordinary stone." Dark
          // riveted plating with diagonal yellow caution stripes along
          // the top of the topmost row of barrier tiles.
          if (tile.type === 'barrier') {
            // Base — slate gradient
            var brGrad = ctx.createLinearGradient(0, ty, 0, ty + TILE);
            brGrad.addColorStop(0, '#3a414c');
            brGrad.addColorStop(0.5, '#2a2f38');
            brGrad.addColorStop(1, '#1a1d24');
            ctx.fillStyle = brGrad;
            ctx.fillRect(tx, ty, TILE, TILE);
            // Diagonal hatch — looks like cross-hatched reinforcement
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            for (var hh2 = -TILE; hh2 < TILE; hh2 += 6) {
              ctx.beginPath();
              ctx.moveTo(tx + hh2,        ty);
              ctx.lineTo(tx + hh2 + TILE, ty + TILE);
              ctx.stroke();
            }
            // Rivet bolts at corners
            ctx.fillStyle = '#0e1014';
            ctx.fillRect(tx + 3, ty + 3, 2, 2);
            ctx.fillRect(tx + TILE - 5, ty + 3, 2, 2);
            ctx.fillRect(tx + 3, ty + TILE - 5, 2, 2);
            ctx.fillRect(tx + TILE - 5, ty + TILE - 5, 2, 2);
            ctx.fillStyle = 'rgba(220,220,230,0.25)';
            ctx.fillRect(tx + 3, ty + 3, 1, 1);
            ctx.fillRect(tx + TILE - 5, ty + 3, 1, 1);
            // Caution stripes along the very TOP face of the barrier
            // band (only the topmost barrier row gets them) so it reads
            // as a warning when approached from above.
            var aboveTile = world[r - 1] ? world[r - 1][c] : null;
            var isTopOfBarrier = !aboveTile || aboveTile.type !== 'barrier';
            if (isTopOfBarrier) {
              for (var sx = 0; sx < TILE; sx += 6) {
                ctx.fillStyle = ((sx / 6) | 0) % 2 === 0 ? '#FFD200' : '#1a1208';
                ctx.fillRect(tx + sx, ty, 6, 3);
              }
            }
            // Subtle outline
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
            continue;
          }

          // ----- Jello (buried, un-activated) -----
          // The drill bounces off it; mining an adjacent cell wakes the
          // connected cluster into a live soft body (activateJelloCluster +
          // the JELLO SOFT BODIES banner). Drawn live here, never in the
          // cached chunk, so removal on activation needs no chunk-base rewrite.
          // Rendered in the LIVE BODY's material language (v24.153, owner:
          // buried jello must look the same before mining as after waking):
          // the exact translucent ramp jelloDrawBody's body layer uses, hue
          // from the tile's jellyType, the gradient anchored to the local
          // vertical RUN of jello so a patch reads as ONE mass (no per-tile
          // banding), and NO rim — the old opaque teal + bright cluster-edge
          // rim was a different material with an outline; the live gel has
          // neither. The old look is in git (v24.152 and earlier) if wanted.
          if (tile.type === 'jello') {
            var jlHue = 158;
            if (tile.jellyType && typeof JELLO_TYPES !== 'undefined' && JELLO_TYPES[tile.jellyType]) jlHue = JELLO_TYPES[tile.jellyType].hue;
            var jlA = (typeof JELLO_RENDER_ALPHA !== 'undefined') ? JELLO_RENDER_ALPHA : 0.8;
            // Vertical run extent (bounded scan — worldgen patches are small).
            var jlT0 = r, jlB0 = r;
            while (jlT0 > 0 && r - jlT0 < 8 && world[jlT0 - 1] && world[jlT0 - 1][c] && world[jlT0 - 1][c].type === 'jello') jlT0--;
            while (jlB0 - r < 8 && world[jlB0 + 1] && world[jlB0 + 1][c] && world[jlB0 + 1][c].type === 'jello') jlB0++;
            var jlSpan = jlB0 - jlT0 + 1;
            var jlGrad = ctx.createLinearGradient(0, ty, 0, ty + TILE);
            jlGrad.addColorStop(0, jelloTileRampCol(jlHue, jlA, (r - jlT0) / jlSpan));
            jlGrad.addColorStop(1, jelloTileRampCol(jlHue, jlA, (r - jlT0 + 1) / jlSpan));
            ctx.fillStyle = jlGrad;
            ctx.fillRect(tx, ty, TILE, TILE);
            continue;
          }

          // ----- Bedrock (Earth's bottom) -----
          // The unbreakable cap at the very bottom of the world. Distinct
          // from regular dark dirt: rough riveted slabs with a subtly molten
          // bottom (since it sits right on the deepest mantle).
          if (tile.type === 'bedrock') {
            var bkGrad = ctx.createLinearGradient(0, ty, 0, ty + TILE);
            bkGrad.addColorStop(0, '#2a201a');
            bkGrad.addColorStop(0.5, '#1a120e');
            bkGrad.addColorStop(1, '#0e0806');
            ctx.fillStyle = bkGrad;
            ctx.fillRect(tx, ty, TILE, TILE);
            // Cracked/rough texture — small per-tile pseudo-random pits
            var bkSeed = ((r * 73856093) ^ (c * 19349663)) >>> 0;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            for (var bp = 0; bp < 4; bp++) {
              var px1 = ((bkSeed >>> (bp * 4)) % TILE);
              var py1 = ((bkSeed >>> (bp * 4 + 2)) % TILE);
              ctx.fillRect(tx + px1, ty + py1, 2, 1);
            }
            // Faint warm glow along the very bottom (mantle bleeding through)
            ctx.fillStyle = 'rgba(180,40,20,0.25)';
            ctx.fillRect(tx, ty + TILE - 2, TILE, 2);
            // Top highlight
            ctx.fillStyle = 'rgba(255,210,140,0.10)';
            ctx.fillRect(tx, ty, TILE, 1);
            continue;
          }

          var ore = ORES[tile.type];
          if (tile.type === 'dirt') {
            continue;
          } else if (tile.type === 'stone') {
            continue;
          } else {
            if (drawEarlyOreAtlas(tx, ty, r, c, tile.type)) {
              if (tile.shiny) drawShinyTile(tx, ty, r, c, tNow);
              continue;
            }
            var oreN = openBlockNeighbors(r, c, tile.type);
            ctx.save();
            oreDepositPath(tx, ty, r, c, tile.type, oreN);
            ctx.clip();
            if (!drawEarlyOreBase(tx, ty, r, c, tile.type)) {
              ctx.fillStyle = ore.color;
              ctx.fillRect(tx, ty, TILE, TILE);
            }

            // Clipped highlight + shadow keep massive-nodule ores
            // embedded in the host instead of looking blocky. Per-tile
            // baseline ores (coal, bauxite) carry their own outline rings
            // on each primitive — there's no tile-spanning ore body to
            // outline. Skip the per-tile inset for them so the cluster's
            // visible host gaps don't show a 2-px grid at the tile edges.
            // (See MINERALS_BIBLE §6 Renderer dispatch table.)
            if (tile.type !== 'coal' && tile.type !== 'copper' && tile.type !== 'bauxite' && tile.type !== 'iron' && tile.type !== 'pyrite' && tile.type !== 'silver' && tile.type !== 'gold' && tile.type !== 'methaneice' && tile.type !== 'amber' && tile.type !== 'cinnabar' && tile.type !== 'uranium' && tile.type !== 'fossil' && tile.type !== 'obsidian' && tile.type !== 'emerald' && tile.type !== 'ruby' && tile.type !== 'tanzanite' && tile.type !== 'malachite' && tile.type !== 'galena' && tile.type !== 'magnetite' && tile.type !== 'rhodochrosite' && tile.type !== 'jade' && tile.type !== 'turquoise' && tile.type !== 'lapis' && tile.type !== 'cobalt' && tile.type !== 'amethyst' && tile.type !== 'peridot' && tile.type !== 'sulfur' && tile.type !== 'platinum' && tile.type !== 'diamond' && tile.type !== 'painite' && tile.type !== 'unobtanium' && tile.type !== 'opal') {
              ctx.fillStyle = 'rgba(255,255,255,0.06)';
              ctx.fillRect(tx, ty, TILE, 2);
              ctx.fillStyle = 'rgba(0,0,0,0.22)';
              ctx.fillRect(tx, ty + TILE - 2, TILE, 2);
              ctx.fillRect(tx + TILE - 2, ty, 2, TILE);
            }
            ctx.restore();
            if (tile.shiny) drawShinyTile(tx, ty, r, c, tNow);
          }

          // ===== Layer tints / special tile decorations =====
          if (rowLayer) {
            if (rowLayer.name === 'permafrost' && (tile.type === 'dirt' || tile.type === 'stone')) {
              // The frozen-ground treatment is baked into the terrain
              // chunk (drawPermafrostFrost). The live pass only adds
              // icicles hanging from a cave ceiling — a solid tile with
              // open space directly below it.
              if (isOpenCell(r + 1, c)) {
                drawPermafrostIcicles(tx, ty, r, c);
              }
            } else if (rowLayer.name === 'magma' || rowLayer.name === 'mantle') {
              if (tile.type === 'dirt' || tile.type === 'stone') {
                // Hot rock base — re-tint dirt/stone with a deep volcanic
                // gradient so the tile reads as molten rock rather than brown
                // earth with red specks. This static tint is ALSO baked into the
                // chunk (drawCachedLayerDecoration); the live redraw is what
                // covers the smooth void-erased cave edges. v23.44 — reuse a
                // cached gradient placed by translate (was a fresh gradient per
                // tile per frame); PERF_MAGMA_SKIP_LIVE_TINT skips it entirely to
                // A/B the redundant-draw win against the baked-only look.
                if (!PERF_MAGMA_SKIP_LIVE_TINT) {
                  ctx.fillStyle = magmaRockGrad(rowLayer.name);
                  ctx.translate(0, ty);
                  ctx.fillRect(tx, 0, TILE, TILE);
                  ctx.translate(0, -ty);
                }

                // Pulsing magma veins — per-tile phase so they breathe
                // independently. Intensity peaks around 0.9 and floors at 0.2.
                var pulse = 0.5 + 0.5 * Math.sin(tNow * 1.6 + (r * 7 + c * 13));
                var veinAlpha = 0.55 + pulse * 0.4;
                // Build a unique-ish crack pattern per tile by hashing r,c
                // into vertex offsets. Two intersecting vein paths feel more
                // like real cracked lava than a single stroke.
                var seed = ((r * 73856093) ^ (c * 19349663)) >>> 0;
                var ax = (seed % 8);                 // 0..7
                var ay = ((seed >>> 3) % 6) + 4;     // 4..9
                var bx = ((seed >>> 7) % 10) + 12;   // 12..21
                var by = ((seed >>> 11) % 8) + 6;    // 6..13
                var dx2 = ((seed >>> 15) % 8) + 22;  // 22..29
                var dy2 = ((seed >>> 19) % 10) + 18; // 18..27
                // Bright glowing core stroke
                ctx.strokeStyle = 'rgba(255,180,90,' + veinAlpha.toFixed(2) + ')';
                ctx.lineWidth = 1.4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(tx + ax, ty + ay);
                ctx.lineTo(tx + bx, ty + by);
                ctx.lineTo(tx + dx2, ty + dy2);
                ctx.stroke();
                // Outer warm halo around the veins
                ctx.strokeStyle = 'rgba(255,80,30,' + (veinAlpha * 0.45).toFixed(2) + ')';
                ctx.lineWidth = 3;
                ctx.stroke();
                // Tiny molten droplet at a vein junction
                ctx.fillStyle = 'rgba(255,220,140,' + Math.min(1, veinAlpha + 0.1).toFixed(2) + ')';
                ctx.beginPath();
                ctx.arc(tx + bx, ty + by, 1.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineCap = 'butt';
              }
            } else if (rowLayer.name === 'crystal' && (tile.type === 'dirt' || tile.type === 'stone')) {
              // Sparkly crystal tint
              ctx.fillStyle = 'rgba(160,180,255,0.18)';
              ctx.fillRect(tx, ty, TILE, TILE);
              // Tiny sparkle
              if (((r * 31 + c * 17) % 5) === 0) {
                var sp = (Math.sin(tNow * 3 + r + c) + 1) * 0.5;
                ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + sp * 0.6).toFixed(2) + ')';
                ctx.fillRect(tx + 8 + (c % 3) * 5, ty + 6 + (r % 3) * 5, 1.5, 1.5);
              }
            }
          }

          // ===== Per-ore visual flourishes =====
          if (tile.type !== 'dirt' && tile.type !== 'stone') {
            ctx.save();
            oreDepositPath(tx, ty, r, c, tile.type, oreN);
            ctx.clip();

          // Coal: fractured graphite facets with a restrained mineral glint.
          if (tile.type === 'coal') {
            drawEarlyOreDetails(tx, ty, r, c, tile.type, tNow);
          }
          // Copper: muted ribbons, dark matrix, and oxidized green specks.
          if (tile.type === 'copper') {
            drawEarlyOreDetails(tx, ty, r, c, tile.type, tNow);
          }
          // Bauxite: earthy bands packed with rounded pisolith grains.
          if (tile.type === 'bauxite') {
            drawEarlyOreDetails(tx, ty, r, c, tile.type, tNow);
          }
          // Iron: cool metallic bands with rust staining.
          if (tile.type === 'iron') {
            drawEarlyOreDetails(tx, ty, r, c, tile.type, tNow);
          }
          // v16.0/v16.2 Underworld ore redesign (archive/NIGHT_PLAN.md): six
          // headline ores rebuilt at coal-renderer quality. Each renderer
          // draws ONLY its mineral cluster — no painted host — directly on
          // the dirt/stone underlay, the way coal/copper read. Fully
          // static (no animation).
          // All headline + batch-2 ores now render host-through in
          // drawEarlyOreBase (coal/copper/silver/gold/gems/etc.). Diamond,
          // painite and unobtanium were the last placeholders on this legacy
          // drawGemScatter dispatch path; they moved to drawEarlyOreBase in
          // v24.15, so nothing per-ore is dispatched from the flourish block
          // any more — only the generic shine + damage cracks below run here.

          // Highlight for valuable ores (generic shine) — skip ores that
          // draw their full identity in drawEarlyOreBase.
          if (tile.type !== 'silver' && tile.type !== 'gold' && tile.type !== 'methaneice' && tile.type !== 'amber' && tile.type !== 'cinnabar' && tile.type !== 'fossil' && tile.type !== 'obsidian' && tile.type !== 'magnetite' && tile.type !== 'jade' && tile.type !== 'turquoise' && tile.type !== 'lapis' && tile.type !== 'cobalt' && tile.type !== 'amethyst' && tile.type !== 'sulfur' && tile.type !== 'rhodochrosite' && ore.value >= 90 && ore.value < 800) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(tx + 3, ty + 3, 6, 6);
          }
          if (ore.value >= 800 && tile.type !== 'uranium' && tile.type !== 'emerald' && tile.type !== 'ruby' && tile.type !== 'tanzanite' && tile.type !== 'peridot' && tile.type !== 'opal' && tile.type !== 'platinum' && tile.type !== 'diamond' && tile.type !== 'painite' && tile.type !== 'unobtanium') {
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(tx + TILE - 10, ty + 4, 4, 4);
            ctx.fillRect(tx + 6, ty + TILE - 10, 5, 5);
          }

          // Damage cracks
          var maxHp = ORES[tile.type].hp;
          if (tile.hp < maxHp) {
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + TILE * 0.3, ty + TILE * 0.2);
            ctx.lineTo(tx + TILE * 0.5, ty + TILE * 0.5);
            ctx.lineTo(tx + TILE * 0.4, ty + TILE * 0.8);
            ctx.stroke();
          }
            ctx.restore();
          }
        }
      }
    }

    // Surface grass line (drawn between sky and underground, above tiles' top edge)
    if (worldTop < surfaceY && worldBottom > surfaceY - 4) {
      var grassLeft = Math.floor(worldLeft / 4) * 4 - 16;
      var grassRight = worldRight + 12;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (var patchX = Math.floor(worldLeft / 28) * 28 - 28; patchX < worldRight + 28; patchX += 28) {
        var patchCol = Math.floor(patchX / 28);
        var patchSeed = tileHash01(0, patchCol, 0x6A540);
        var gapSeed = tileHash01(0, Math.floor(patchX / 84), 0x6A541);
        if (patchSeed < 0.46 || gapSeed < 0.18) continue;

        var patchW = 12 + tileHash01(1, patchCol, 0x6A542) * 20;
        var patchStart = patchX + tileHash01(2, patchCol, 0x6A543) * Math.max(1, 28 - patchW);
        var patchCenter = patchStart + patchW * 0.5;
        var patchH = 3 + patchSeed * 4;

        if (grassSupported(patchCenter)) {
          var soilGrad = ctx.createRadialGradient(patchCenter, surfaceY - 1, 1, patchCenter, surfaceY - 1, patchW * 0.62);
          soilGrad.addColorStop(0, 'rgba(74,94,45,0.34)');
          soilGrad.addColorStop(0.62, 'rgba(55,72,36,0.20)');
          soilGrad.addColorStop(1, 'rgba(55,72,36,0)');
          ctx.fillStyle = soilGrad;
          ctx.beginPath();
          ctx.ellipse(patchCenter, surfaceY - 1.4, patchW * 0.55, 2.2 + patchSeed * 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        for (var gx = patchStart; gx < patchStart + patchW; gx += 2.6) {
          if (!grassSupported(gx)) continue;   // no block beneath -> no blade
          var bladeCol = Math.floor(gx * 3);
          var bladeSeed = tileHash01(3, bladeCol, 0x6A551);
          if (bladeSeed < 0.18) continue;
          var edgeFade = Math.min(1, (gx - patchStart) / 5, (patchStart + patchW - gx) / 5);
          var bladeH = (2.2 + bladeSeed * 5.4 + patchH * 0.45) * (0.65 + edgeFade * 0.35);
          var lean = (tileHash01(4, bladeCol, 0x6A552) - 0.5) * (2.4 + patchSeed * 1.4);
          var baseY = surfaceY - 0.4 + tileHash01(5, bladeCol, 0x6A553) * 1.2;
          // Wind: sample the live spring field, add per-blade gain variance + a
          // shimmer that only flutters while the field is actually moving (|v|),
          // so settling grass shivers and resting grass stays calm.
          sampleGrassWind(gx);
          if (_gwS.d !== 0 || _gwS.v !== 0) {
            var bGain = 1 + (tileHash01(13, bladeCol, 0x6A560) - 0.5) * 2 * grassWindTune.vary;
            var bFlut = Math.sin(grassWindTime * 6.2832 * grassWindTune.flutterFreq * (0.7 + tileHash01(14, bladeCol, 0x6A561) * 0.6) + bladeCol * 0.7)
                      * grassWindTune.flutter * Math.min(1, Math.abs(_gwS.v) * 0.06);
            var bLay = _gwS.d * bGain + bFlut;
            lean += bLay * bladeH * grassWindTune.bend;
            bladeH *= 1 - grassWindTune.flatten * Math.min(1, Math.abs(bLay));
          }
          var tone = tileHash01(6, bladeCol, 0x6A554);
          ctx.strokeStyle = tone > 0.76 ? '#9a8f58' : (tone > 0.44 ? '#5f783f' : '#3d5b31');
          ctx.lineWidth = tone > 0.82 ? 0.85 : 0.72;
          ctx.globalAlpha = 0.72 + edgeFade * 0.24;
          ctx.beginPath();
          ctx.moveTo(gx, baseY);
          ctx.quadraticCurveTo(gx + lean * 0.35, baseY - bladeH * 0.58, gx + lean, baseY - bladeH);
          ctx.stroke();

          if (bladeSeed > 0.72) {
            var sideLean = -lean * 0.55 + (tileHash01(7, bladeCol, 0x6A555) - 0.5) * 1.8;
            ctx.strokeStyle = tone > 0.7 ? '#7b744b' : '#4d693b';
            ctx.lineWidth = 0.62;
            ctx.globalAlpha = 0.62 + edgeFade * 0.18;
            ctx.beginPath();
            ctx.moveTo(gx + 0.8, baseY);
            ctx.quadraticCurveTo(gx + sideLean * 0.28, baseY - bladeH * 0.45, gx + sideLean, baseY - bladeH * 0.74);
            ctx.stroke();
          }
        }

        if (patchSeed > 0.88 && grassSupported(patchCenter + (tileHash01(8, patchCol, 0x6A556) - 0.5) * patchW * 0.55)) {
          var seedHeadX = patchCenter + (tileHash01(8, patchCol, 0x6A556) - 0.5) * patchW * 0.55;
          var stemH = 7 + tileHash01(9, patchCol, 0x6A557) * 4;
          var stemDx = 0;   // wind lay-over of the tall seed stalk
          sampleGrassWind(seedHeadX);
          if (_gwS.d !== 0 || _gwS.v !== 0) {
            var sGain = 1 + (tileHash01(13, patchCol, 0x6A560) - 0.5) * 2 * grassWindTune.vary;
            var sFlut = Math.sin(grassWindTime * 6.2832 * grassWindTune.flutterFreq * (0.7 + tileHash01(14, patchCol, 0x6A561) * 0.6) + patchCol * 1.3)
                      * grassWindTune.flutter * Math.min(1, Math.abs(_gwS.v) * 0.06);
            var sLay = _gwS.d * sGain + sFlut;
            stemDx = sLay * stemH * grassWindTune.bend;
            stemH *= 1 - grassWindTune.flatten * Math.min(1, Math.abs(sLay)) * 0.6;
          }
          ctx.globalAlpha = 0.72;
          ctx.strokeStyle = '#786f49';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(seedHeadX, surfaceY - 0.5);
          ctx.quadraticCurveTo(seedHeadX + 1.2 + stemDx * 0.45, surfaceY - stemH * 0.55, seedHeadX + 0.2 + stemDx, surfaceY - stemH);
          ctx.stroke();
          ctx.fillStyle = '#a49562';
          ctx.beginPath();
          ctx.ellipse(seedHeadX + 0.2 + stemDx, surfaceY - stemH - 0.8, 1.0, 1.7, -0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      for (var gx2 = grassLeft; gx2 < grassRight; gx2 += 9) {
        if (tileHash01(10, Math.floor(gx2 / 9), 0x6A558) < 0.42) continue;
        var pebbleA = 0.10 + tileHash01(11, Math.floor(gx2 / 9), 0x6A559) * 0.08;
        ctx.fillStyle = 'rgba(40,26,16,' + pebbleA.toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(gx2 + tileHash01(12, Math.floor(gx2 / 9), 0x6A55A) * 5, surfaceY - 0.8, 1.4, 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    perfBuckets['render.tiles'] = (perfBuckets['render.tiles'] || 0) * 0.9 + (performance.now() - _renderT2Tiles) * 0.1;
    var _renderT2Ent = performance.now();

    // ====== RENDER: World entities (stations, player, effects) ======

    // ---- Surface trees (165): groves + snags across the wide surface.
    //      Drawn before the stations so canopies sit behind every building,
    //      in front of the terrain tiles + grass line. ----
    if (typeof drawTrees === 'function') drawTrees();

    // ---- Surface stations (one recoloured store per town) ----
    // Only towns that ACTUALLY EXIST in REGIONS (single-town = just town 0). Iterating
    // TOWN_DEPTHS.length drew all 4 town stations; with single-town, towns 1-3 fall back
    // to town 0's deck and stack there, so the deepest town's violet palette (TOWN_BLD[3]
    // "HOLLOW DEEP") ended up painted over town 0's saloon red-brown (TOWN_BLD[0]).
    for (var _tsi = 0; _tsi < REGIONS.length; _tsi++) {
      if (REGIONS[_tsi].kind === REGION_TOWN) drawStation(REGIONS[_tsi].townIndex);
    }
    // v15.1 — warm light spilling from the open shop door onto the deck
    drawShopDoorGlow();

    // ---- Open-air fireplace (between station + depot; own render so it survives station cull) ----
    drawSurfaceFireplace();
    // v11.46 — Fireplace smoke emission runs every frame regardless of
    // camera position. Combined with the wider smoke fluid domain
    // (overscan 1.6), the chimney keeps emitting into the sim even
    // when the player drives away.
    var _gpuFireT = devMode ? performance.now() : 0;
    tickFireplaceSmoke();
    if (devMode) gpuProbe('smoke.fire', _gpuFireT, smokeProbeGL());

    // ---- The Sluice (refinement station; own render so it survives station cull) ----
    if (ENABLE_REFINEMENT) drawSluice();   // refinement disabled: do not draw the sluice station prop

    // ---- Pump pad ----
    drawPumpPad();

    // ---- No Man's Zone caution banners (wind-blown blade flags at zone mouths) ----
    drawNmzBanners();
    if (typeof birdsDraw === 'function') birdsDraw();   // ambient surface birds (205-birds.js): in front of sky/mountains/stations, behind smoke + rig
    if (typeof drawTreeLeaves === 'function') drawTreeLeaves();   // leaf + chip wakes off the trees (165): over stations + birds, behind smoke + rig

    perfBuckets['render.entities'] = (perfBuckets['render.entities'] || 0) * 0.9 + (performance.now() - _renderT2Ent) * 0.1;
    var _renderT3 = performance.now();
    // ---- Liquids: surface water ponds + underground oil pockets ----
    var _gpuLiqT = devMode ? performance.now() : 0;
    drawLiquids();
    if (devMode) gpuProbe('liquid', _gpuLiqT, liquidGL);   // v12.13 — liquid GPU probe
    drawSurfacePondBasinOverlays(startCol, endCol);
    perfBuckets['render.liquids'] = (perfBuckets['render.liquids'] || 0) * 0.9 + (performance.now() - _renderT3) * 0.1;
    var _renderT4 = performance.now();

    // ---- Rover reentry flame trail (drawn BEHIND player so it streaks
    //      out the top of the rig as it falls)
    if (roverMode) drawRoverTrail();

    // ---- Smoke trail (drawn BEHIND player so the rig sits in front of
    //      its own exhaust plume) ----
    try { drawSmoke(); } catch (e) { if (!window.__drawSmokeErr) { window.__drawSmokeErr = String(e) + '\n' + (e.stack||''); console.error('drawSmoke threw:', e); } }
    perfBuckets['render.smoke'] = (perfBuckets['render.smoke'] || 0) * 0.9 + (performance.now() - _renderT4) * 0.1;
    var _renderT5 = performance.now();

    // ---- Exhaust mouth bridge: pins fluid smoke to the actual pipe opening ----
    var _rSb = performance.now();
    try { drawExhaustPipeSmokeBridge(); } catch (e) { if (!window.__pipeSmokeErr) { window.__pipeSmokeErr = String(e) + '\n' + (e.stack||''); console.error('drawExhaustPipeSmokeBridge threw:', e); } }
    perfMark('render.smokeBridge', _rSb);

    // ---- Rocket plume: smoke wake, ground wash, additive flame core ----
    var _rRp = performance.now();
    try { drawRocketPlume(); } catch (e) { if (!window.__rocketPlumeErr) { window.__rocketPlumeErr = String(e) + '\n' + (e.stack||''); console.error('drawRocketPlume threw:', e); } }
    perfMark('render.rocketPlume', _rRp);

    // ---- Player ground shadow (drawn BEFORE jello so the gel covers it,
    //      instead of the shadow showing through the translucent gel) ----
    try { drawPlayerShadow(); } catch (e) {}

    // ---- Jello soft bodies (drawn behind the rig so the rig stays read) ----
    var _rJl = performance.now();
    if (ENABLE_JELLO) {
      drawJelloBlobs();
      if (devMode) drawJelloCoupleVectors();
    }
    perfMark('render.jello', _rJl);

    // ---- Player ----
    var _rPl = performance.now();
    drawPlayer();
    perfMark('render.player', _rPl);

    // ---- Combat: enemy turrets, rig auto-turret, bullets + sparks (world space) ----
    // NMZ obstacle course (087) draws under the combat entities so enemies
    // and tracers read on top of the set-pieces. Typeof-guarded until it ships.
    try { if (typeof drawNmzCourse === 'function') drawNmzCourse(); } catch (e) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; if (!window.__courseDrawErr) { window.__courseDrawErr = String(e) + '\n' + (e.stack||''); console.error('drawNmzCourse threw:', e); } }
    try { drawCombat(); } catch (e) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; if (!window.__combatDrawErr) { window.__combatDrawErr = String(e) + '\n' + (e.stack||''); console.error('drawCombat threw:', e); } }

    // ---- Rover overlay: balloons, sparks, deflate puffs (in front of rig)
    if (roverMode) drawRoverFx();

    // ---- Explosions (in front of everything in world space) ----
    if (explosions.length) drawExplosions();

    // ---- Block-break debris FX (chips/grit/dust/flash, world space) ----
    try { drawMineFx(); } catch (e) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }

    // ---- Live (fuse-burning) bombs that have been dropped and are ticking
    //      down toward detonation (065 physics charges + fuse embers) ----
    if (liveBombs.length || bombSparks.length) drawLiveBombs();

    // ---- Mining crack telegraph (replaces the old yellow-spark + orange-blob placeholder) ----
    // Chiselled fractures grow from the contact face as the drill bites in; they
    // vanish on break, when the MINE BREAK FX shatter takes over.
    if (drilling) {
      var dtile2 = world[drilling.r] && world[drilling.r][drilling.c];
      if (dtile2) {
        var maxHp2 = (ORES[dtile2.type] && ORES[dtile2.type].hp) || 1;
        var dcyc = drillHitTime() > 0 ? 1 - drilling.timer / drillHitTime() : 0;
        if (dcyc < 0) dcyc = 0; if (dcyc > 1) dcyc = 1;
        var dprog = Math.min(1, ((maxHp2 - dtile2.hp) + dcyc) / maxHp2);
        if (dprog > 0.06) { try { mineDrawCracks(drilling.r, drilling.c, drilling.dirVec, dprog); } catch (e) {} }
      }
    }

    // ---- Teleport flash (after activating a teleporter) ----
    if (teleportFx && teleportFx.t > 0) {
      teleportFx.t -= 1 / 60;
      var lifeP = 1 - (teleportFx.t / teleportFx.maxT);     // 0 → 1
      // Source ring: collapse inward at the old location
      ctx.save();
      var srcA = Math.max(0, 1 - lifeP * 1.6);
      ctx.globalAlpha = srcA;
      ctx.strokeStyle = '#c8a4ff';
      ctx.lineWidth = 1.2;
      var srcR = 6 + lifeP * 22;
      ctx.beginPath();
      ctx.arc(teleportFx.srcX, teleportFx.srcY, srcR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(teleportFx.srcX, teleportFx.srcY, srcR * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      // Destination ring: expand outward at the new location
      var dstA = Math.max(0, 1 - lifeP);
      ctx.globalAlpha = dstA;
      var dstR = 4 + lifeP * 28;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(teleportFx.destX, teleportFx.destY, dstR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#c8a4ff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(teleportFx.destX, teleportFx.destY, dstR * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (teleportFx.t <= 0) teleportFx = null;
    }

    // ---- Floating mining text ("+$X Item") ----
    // World-space; drift up and fade out. Lifecycle managed here so we don't
    // need a separate update step.
    // v11.2 — when UI_NEW is on, drain the floater queue without
    // rendering any text. Sale/depth events still occur in game logic;
    // they're just invisible until stage 6 wires diegetic feedback.
    if (floaters.length) {
      var dt60 = 1 / 60;             // approximate frame time
      for (var fi = floaters.length - 1; fi >= 0; fi--) {
        var f = floaters[fi];
        f.t -= dt60;
        if (f.t <= 0) { floaters.splice(fi, 1); continue; }
        f.y += f.vy * dt60;
        f.vy *= 0.985;               // slow down rise
        // v11.2 suppressed floater text under the new UI pending a
        // diegetic-feedback pass. Ore-pickup floaters (show:true) are
        // exempt so mining always names the ore you just collected.
        if (UI_NEW && !f.show) continue;
        // Fade in fast, hold, fade out
        var lifeProg = 1 - (f.t / f.maxT);   // 0 → 1
        var alpha;
        if (lifeProg < 0.15) alpha = lifeProg / 0.15;
        else if (lifeProg > 0.6) alpha = Math.max(0, (1 - lifeProg) / 0.4);
        else alpha = 1;
        // Outline + fill for legibility against busy backgrounds
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 9px ' + UI_FONT;
        ctx.textAlign = 'center';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }

    // ---- Auto-sell flash above player ----
    if (autoSellFlash && autoSellFlash.t > 0) {
      autoSellFlash.t -= 1 / 60;
      var aOff = (1.2 - autoSellFlash.t) * 12;
      ctx.globalAlpha = Math.min(1, autoSellFlash.t / 0.6);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 10px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.fillText('+$' + autoSellFlash.value, player.x + PLAYER_W / 2, player.y - 10 - aOff);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      if (autoSellFlash.t <= 0) autoSellFlash = null;
    }

    // ====== RENDER: Darkness / fog-of-war overlay ======
    // World-space; on top of terrain + entities, beneath the UI. Hides every
    // cell without a path to the surface (see 185-lighting.js).
    drawDarknessOverlay(startRow, endRow, startCol, endCol);

    // ====== RENDER: Horizon atmosphere (haze veil + horizon limb) ======
    // Screen-space; over the world + fog, beneath precip + HUD. The veil
    // (parked since v24.53) fogged the whole ground on ascent; the LIMB
    // (v24.132) continues the already-rendered sky a short band past the
    // surface line, so the land edge dissolves into the lit atmospheric
    // limb instead of hard-cutting at the sunset glow (see 158). The sky's
    // own flat-earth horizon razor was fixed IN the shader (spherical
    // primary ray, v24.138, 150) — the v24.136 screen-space skirt that
    // band-aided it drew on top of the world-anchored cloud decks and was
    // removed the same day.
    drawHorizonHaze();
    drawHorizonLimb();

    // ====== RENDER: Weather precipitation + lightning ======
    // Drops are world-anchored with tile collision (155-weather.js), drawn
    // over the world but beneath the HUD. Runs while the sky is on screen OR
    // drops are still alive (rain that followed the player down an open shaft
    // drains out on its own; SPAWNING stays sky-gated in updateWeather, so
    // there's still no rain in a sealed shaft). Clouds draw earlier, inside
    // the sky pass.
    if (!PERF_DISABLE_WEATHER && (worldTop < surfaceY || precipActive > 0)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawWeatherPrecip(canvas.width, canvas.height);
    }

    perfBuckets['render.player+fx'] = (perfBuckets['render.player+fx'] || 0) * 0.9 + (performance.now() - _renderT5) * 0.1;
    var _renderT6 = performance.now();
    // ====== RENDER: UI overlay (HUD, damage, D-pad) ======
    //  UI SPACE: reset transform; draw in CSS-pixel coords scaled by dpr
    // v23.50 — redirect the whole UI overlay onto the top canvas (z6) so it
    // paints above the liquid + smoke DOM layers. ctx is restored to the main
    // canvas at the end of render(); falls back to the main ctx if the top
    // canvas is unavailable.
    var _uiCtx = uiTopEnsure();
    var _mainCtx = ctx;
    if (_uiCtx) {
      _uiCtx.setTransform(1, 0, 0, 1, 0, 0);
      _uiCtx.clearRect(0, 0, uiTopCanvas.width, uiTopCanvas.height);
      ctx = _uiCtx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // D-pad (mobile) — single overlay in the bottom-RIGHT corner. Most
    // players drive with their right thumb, so reach is best on that side.
    // Earlier builds drew this on the bottom-left, but that fought with the
    // station/shop interactions and made the game feel left-handed by default.
    if (isMobile) {
      // v25.33 — one mobile control: the full d-pad wheel, always. The split
      // flight pad (rotate L/R + thrust) is retired; the wheel drives flight too
      // (up = thrust, L/R = rotate). See processPointerDown (050) + moveU/L/R (080).
      drawDpad(DPAD_CX, DPAD_CY);
    }

    // ---- Damage flash (full-screen red vignette) ----
    // Triggered when a bomb (or any other source we hook in later) hurts
    // the rig. Drawn UNDER the HUD so the bars stay readable, but OVER
    // the world. Two layers: a soft red wash + a vignette gradient that
    // darkens the edges — the same "you took damage" cue you see in shooters.
    if (damageFlashT > 0 &&
        !(typeof window !== 'undefined' && window.SluiceOptions &&
          (window.SluiceOptions.damageFlash === false || window.SluiceOptions.lowFlash === true))) {
      // Player options (052-options.js): damage-flash toggle + photosensitive
      // low-flash mode both suppress the full-screen red wash.
      var dfA = Math.min(1, damageFlashT);
      // Edge vignette (darker red at the corners, transparent in the center)
      var vg = ctx.createRadialGradient(
        viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.25,
        viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75
      );
      vg.addColorStop(0, 'rgba(180,20,20,0)');
      vg.addColorStop(1, 'rgba(180,20,20,' + (0.65 * dfA).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, viewW, viewH);
      // Brief uniform tint on top to sell the impact
      ctx.fillStyle = 'rgba(255,40,40,' + (0.18 * dfA).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // HUD — v11.2 gated behind UI_NEW. Will be replaced by the
    // bottom-edge console primitive in stage 3.
    if (!UI_NEW) {
      var _rHUD = performance.now();
      drawHUD();
      perfMark('render.hud', _rHUD);
    } else {
      // v11.3 — Console primitive. Empty bay frames; instruments land in stage 4.
      var _rCon = performance.now();
      if (!PERF_DISABLE_CONSOLE) drawConsole();
      perfMark('render.console', _rCon);
      // v25.37 — the dock-sale payout reveal (placards + chips + telegraph)
      // draws HERE, in the full-screen HUD pass, every frame. It used to render
      // inside drawCashDisplay, but the v25.31 console instrument cache swaps
      // ctx to an offscreen console layer and repaints the CASH bay only when
      // its value signature changes: from there the reveal was trapped in the
      // bottom console strip AND froze between cash ticks. Hoisted out per the
      // "draw-side eases live outside a cached draw" rule (project_sluice_perf_pass).
      // It self-guards to a no-op when no sale is playing.
      drawSellReveal();
      // v11.10 — Item radial wheel (button always visible; wheel only when held)
      drawItemWheel();
      // v11.27 — top-left FPS + version overlay (replaces the legacy
      // bottom-right HUD readout that drawHUD used to render).
      drawTopLeftDebug();
    }

    // No Man's Zone exit arrow: edge-of-screen waypoint pointing to the safe
    // town exit + meters remaining while flying a gauntlet. Self-hides off-zone.
    drawNmzExitArrow();

    // Perf overlay (dev mode, or the mobile diagnostic flag) — survives the strip
    if (perfOverlayOn()) drawPerfOverlay();
    // In-game now-playing music readout (dev mode) — track name(s) + position
    if (devMode) drawNowPlaying();

    // Layer-crossing banner — gated; environmental cue replacement TBD
    if (!UI_NEW && layerBanner) drawLayerBanner();

    // Shop overlay — v11.12 walk-up shop renders when UI_NEW + proximity;
    // legacy modal still routes through shopOpen when UI_NEW is off.
    if (UI_NEW) {
      if (shopState !== 'closed') drawShopFloor();
    } else if (shopOpen) {
      drawShop();
    }

    // Mineral Ledger: full-screen collection catalogue (295), toggled via
    // ledgerToggle(). Guarded so the build stays coherent if 295 is absent.
    if (typeof drawLedger === 'function' && ledgerOpen) drawLedger();
    // Onboarding radio bubble (057), screen-space, above the HUD.
    if (typeof drawOnboarding === 'function') drawOnboarding();
    // General radio messages (058): showMsg's UI_NEW surface. Same plate
    // grammar as 057, stacks below the tutorial line when both are up.
    // Dispatched after the shop floor on purpose so purchase feedback
    // ("Need $X") stays readable inside the shop.
    if (typeof drawRadioMsg === 'function') drawRadioMsg();

    // v11.33 — Death screen plate (UI_NEW only). Always on top.
    if (UI_NEW && gameOver) {
      drawDeathScreen(lastFrameDt || 1 / 60);
    }
    // v24.142 — the plate raises over the live town for ~0.3s right after
    // the respawn tap. Self-gated on the gameOver falling edge (290); also
    // hosts the ?deathshot=CAUSE screenshot boot lever.
    if (typeof drawDeathPlateRaise === 'function') {
      drawDeathPlateRaise(lastFrameDt || 1 / 60);
    }

    // Great Seam extraction crescendo + EXPEDITION COMPLETE plate (295).
    // Self-gates on its own state, same dispatch model as drawDeathScreen.
    if (typeof drawSeamFx === 'function') drawSeamFx();

    // Centered message — gated; toasts/banners are forbidden in v11
    if (!UI_NEW && msgTimer > 0) {
      var alpha = Math.min(1, msgTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (msgAlert) {
        // Subtle top-of-screen banner. Cargo full happens a LOT, so this
        // intentionally sits below the HUD bar and out of the way of play
        // — visible enough to register, quiet enough not to be annoying.
        var alertText = msgText.toUpperCase();
        ctx.font = 'bold 12px ' + UI_FONT;
        var atw = ctx.measureText(alertText).width;
        var apad = 12;
        var apillW = atw + apad * 2;
        var apillH = 22;
        var apillX = (viewW - apillW) / 2;
        // Sit just under the HUD bar (60 desktop / 104 mobile, with a
        // small 8px gap). If the layer banner is visible, drop the alert
        // pill below it so they never overlap. The layer banner sits at
        // y=hudH+10 and is ~32px tall.
        var hudHeight = isMobile ? 104 : 60;
        var apillY = hudHeight + 8;
        if (layerBanner) apillY = hudHeight + 50;
        // Backing
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = 'rgba(40,8,8,1)';
        roundRect(ctx, apillX, apillY, apillW, apillH, 4, true);
        // Border (no pulse — just a steady soft red)
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = '#d05050';
        ctx.lineWidth = 1;
        roundRect(ctx, apillX, apillY, apillW, apillH, 4, false, true);
        // Text
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = '#ff9a9a';
        ctx.textAlign = 'center';
        ctx.fillText(alertText, viewW / 2, apillY + 15);
      } else {
        // Non-alert messages used to draw at viewH/2-30, which sat right on
        // top of the player rig and frequently collided with the layer
        // banner card at the top of the screen. Render them as a yellow
        // pill just under the HUD instead — same visual language as the
        // red alert pill, but in a different lane so the two never
        // overlap each other or the layer banner.
        ctx.font = 'bold 13px ' + UI_FONT;
        var nmText = msgText;
        var nmtw = ctx.measureText(nmText).width;
        var nmpad = 14;
        var nmpillW = nmtw + nmpad * 2;
        var nmpillH = 24;
        var nmpillX = (viewW - nmpillW) / 2;
        // Default: just under the HUD (taller on mobile). Push down if
        // layer banner is up, and push down again if an alert pill is also
        // showing so neither ever sits on top of the other.
        var hudHeight2 = isMobile ? 104 : 60;
        var nmpillY = hudHeight2 + 8;
        if (layerBanner) nmpillY = hudHeight2 + 50;
        if (msgAlert) nmpillY += 28;     // (defensive — msgAlert false here)
        // Backing
        ctx.globalAlpha = alpha * 0.78;
        ctx.fillStyle = 'rgba(34,26,8,1)';
        roundRect(ctx, nmpillX, nmpillY, nmpillW, nmpillH, 5, true);
        // Border
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = 'rgba(255,215,0,0.55)';
        ctx.lineWidth = 1;
        roundRect(ctx, nmpillX, nmpillY, nmpillW, nmpillH, 5, false, true);
        // Text
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText(nmText, viewW / 2, nmpillY + 16);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Game over — gated; will be replaced by the plate-descend
    // treatment from UI_STYLE.md §9.1 in stage 7
    if (!UI_NEW && gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = '#E0115F';
      ctx.font = 'bold 32px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.fillText('HULL DESTROYED', viewW / 2, viewH / 2 - 36);
      ctx.fillStyle = '#fff';
      ctx.font = '16px ' + UI_FONT;
      ctx.fillText('Max Depth: ' + depthRecord + 'm   Earned: $' + money, viewW / 2, viewH / 2);
      if (deathInfo && deathInfo.type === 'fall') {
        ctx.fillStyle = '#ffb3c8';
        ctx.font = '14px ' + UI_FONT;
        ctx.fillText('Landing speed: ' + (deathInfo.speed / TILE).toFixed(1) + ' blocks/sec', viewW / 2, viewH / 2 + 24);
      }
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px ' + UI_FONT;
      ctx.fillText(isMobile ? 'Tap to restart' : 'Press R twice to restart', viewW / 2, viewH / 2 + (deathInfo && deathInfo.type === 'fall' ? 58 : 36));
      ctx.textAlign = 'left';
    }

    perfBuckets['render.HUD'] = (perfBuckets['render.HUD'] || 0) * 0.9 + (performance.now() - _renderT6) * 0.1;
    // Restore the main canvas context (the UI phase may have redirected ctx to
    // the top canvas). World drawing next frame must land on the main canvas.
    ctx = _mainCtx;
  }

