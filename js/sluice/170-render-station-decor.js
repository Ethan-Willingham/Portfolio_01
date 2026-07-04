  // ====== RENDER: Station + decor drawing functions ======

  // ----- Building style: Frontier Soviet (v2 — outlined illustrated) -----
  // Inspired by hand-painted pixel-art saloons reused as bureaucratic
  // checkpoints: warm red-brown plank wood, stone foundation, arched
  // false-front facade with a gold КОМЕНДАТУРА sign and a red star above,
  // propaganda posters flanking a double door, smokestack and antenna
  // poking past the arch. Every major shape gets a 1-px near-black outline
  // (the single biggest stylistic move vs. the v1 flat-shape rebuild).
  var BLD = {
    // Wood — saturated saloon-red plank
    woodDeep:   '#2c1408',   // deepest shadow
    woodDark:   '#6e3719',   // shadow / batten
    woodBase:   '#a0533a',   // plank face
    woodMid:    '#b96b48',   // mid highlight
    woodLight:  '#d68a5a',   // sun-bleach
    woodPale:   '#e9a87a',   // sharp highlight
    // Stone — slate foundation
    stoneDark:  '#3a3834',
    stoneBase:  '#5a5854',
    stoneLight: '#8a8884',
    stonePale:  '#b0aea8',
    // Metal — cold blue-grey iron
    metalDark:  '#1f2933',
    metalBase:  '#4a5560',
    metalLight: '#7a8590',
    metalPale:  '#a4afba',
    // Gold — sign letters
    goldDark:   '#8a6320',
    goldBase:   '#c98e2a',
    goldBright: '#e9b54a',
    goldPale:   '#f5d680',
    // Red — propaganda
    redDeep:    '#5a1108',
    redDark:    '#8a1a10',
    redBase:    '#c8341c',
    redBright:  '#e85c40',
    // Outline — near-black silhouette
    outline:    '#1a0a05',
    // Atmosphere
    warmGlow:   '#fbc55a',
    cream:      '#e6d5a8',
    // Water — the Sluice wash (3 added colours; the warm + metal palette had no
    // blue, and flowing water is the literal core of the refinement station, so
    // this is the BUILDING_STYLE §2 "obvious meaning" exception).
    waterBase:  '#3a6e88',   // deep wash water in the channel
    waterLight: '#7db4cc',   // mid shimmer / scrolling highlight
    waterFoam:  '#cfeef4'    // bright froth + foam crest (near-white cyan)
  };

  // Per-town station palettes (multi-town stores). Index = townIndex (0 = Town 1
  // DRYWELL). Town 0 keeps the base BLD look; the others recolor the WOOD family
  // only, so each store reads distinct while the red star + gold sign stay the
  // recognizable station motif. drawStation swaps BLD to TOWN_BLD[ti] around the
  // cached draw (each town caches its own coloured sprite).
  function _stationPalette(wood) {
    var p = {}; for (var k in BLD) p[k] = BLD[k];
    p.woodDeep = wood[0]; p.woodDark = wood[1]; p.woodBase = wood[2];
    p.woodMid = wood[3]; p.woodLight = wood[4]; p.woodPale = wood[5];
    return p;
  }
  var TOWN_BLD = [
    BLD,                                                                                  // 0 DRYWELL    — saloon red-brown (base)
    _stationPalette(['#1c1410', '#38302a', '#5a4e44', '#726458', '#8c7c6e', '#a89684']),  // 1 IRONHEAD    — iron / charcoal forge
    _stationPalette(['#141a1e', '#2e3a42', '#4a5a64', '#5e6e78', '#7a8c96', '#9aacb6']),  // 2 COLD SPRING — blue-grey driftwood
    _stationPalette(['#18101e', '#342540', '#4e3a62', '#624a78', '#80689c', '#9c84b8'])   // 3 HOLLOW DEEP — eerie violet timber
  ];

  // ====== Background palette — Frontier Soviet sky + landscape ======
  //
  // Locked palette for everything that lives BEHIND the play plane: sky
  // gradient, stars, distant mountains, underground biome backgrounds.
  // Derived from BLD's metal blue-grey family so the sky reads as the
  // same world as the foreground iron and stonework.
  //
  // Read BACKGROUND_STYLE.md before painting any background. Same
  // discipline pattern as BLD/BUILDING_STYLE.md — no ad-hoc rgba strings
  // in render code, every colour comes from one of these constants.

  var SKY = {
    // Night-sky gradient (top → horizon). Cool, deep, derived from metalDark.
    skyDeepest: '#0a0d16',   // top of sky — deep night, slightly cooler than metalDark
    skyDark:    '#141a26',   // upper-mid sky
    skyBase:    '#1c2433',   // mid sky
    skyLow:     '#252c3c',   // lower sky
    skyHorizon: '#2c3142',   // just above the horizon — slight purple-grey lift

    // Star tiers — each tier is the SAME hue family at different brightness.
    // Designed so even tier-3 (brightest) doesn't break the value budget for
    // backgrounds (max V ≈ 95). Pure #ffffff is reserved as a "look here"
    // signal and never appears in the sky proper.
    starDim:    '#5a6478',   // tier-1 baked dim background dust stars
    starMid:    '#9aa5b8',   // tier-2 medium stars
    starBright: '#d4dce8',   // tier-3 bright stars (cool white, not pure white)
    starWarm:   '#d6a878',   // rare amber-tinted star (echoes goldPale, dimmed)
    starBlue:   '#a8b8d8',   // rare blue-shifted star

    // Reserved sky-only flashes. These appear nowhere else in the world.
    starHot:    '#e8eef8',   // brightest possible star core — sky reserved
    auroraGreen: '#6fb89a',  // future Stage 6 aurora ribbon — sky reserved
    auroraViolet:'#9a7fb8',  // future Stage 6 aurora ribbon — sky reserved

    // Weather — cloud lighting anchors + precipitation. Clouds are RECOLOURED
    // each lighting bucket: the sunlit face + base are derived LIVE from the
    // atmospheric-scatter cache (so they catch the Volcanic sunset), then lerped
    // toward these fixed anchors for night (moonlight) and storm (flat slate).
    // See BACKGROUND_STYLE.md §15.
    cloudSunHi:     '#f6f1e8',  // midday sunlit cloud face — the one allowed cloud value-pop
    cloudMoonHi:    '#b0c0de',  // moonlit cloud face at night — cool silver
    cloudNightBase: '#1e2538',  // cloud underside at night — deep blue-grey
    cloudStormHi:   '#787c88',  // storm sunlit face, pulled toward flat slate
    cloudStormBase: '#363942',  // storm underside — dark slate
    rainStreak:     '#bacee8',  // rain streak — far/thin
    rainStreakFg:   '#cedef4',  // rain streak — near/fat
    snowFlake:      '#ecf2fa',  // snow flake
    lightningFlash: '#96aad2',  // full-screen lightning flash tint

    // Deep-space 5-stop palette — mirrors the surface stops above but
    // pulled toward near-black with almost no vertical variation.
    // Atmospheric scattering disappears as the player climbs out of the
    // atmosphere, so the deep-space gradient is nearly flat. Lerped
    // against the surface stops by `computeSkyBiomeT(cam.y)` to drive
    // the Stage-4a altitude transition.
    spaceDeepest: '#02030a',
    spaceDark:    '#04051a',
    spaceBase:    '#060728',
    spaceLow:     '#080a32',
    spaceHorizon: '#0a0c38',

    nebulaCool: '#3a4878',   // faint painted nebula band — heavily desaturated blue
    nebulaWarm: '#6a4a58'    // faint painted nebula band — desaturated rose
  };

  var BG = {
    // Distant mountain layers — each obeys the value/saturation budget in
    // BACKGROUND_STYLE.md §3. Far is closest to sky, near is closest to
    // outline. Snow is reserved sky-side for the mid layer's snow caps.
    farLandFill:   '#2e3446',   // distant-land ridge — FURTHEST of all, a hair above skyHorizon so it
                                // reads as land dissolving into the horizon (heavy aerial wash on top)
    farMtnFill:    '#2a2f40',   // furthest mountain layer — barely separated from skyHorizon
    farMtnRim:     '#363b4c',   // subtle top-edge highlight (no hard outline at this distance)
    midMtnFill:    '#1c1f30',   // mid layer — main snow-cap tier
    midMtnShadow:  '#0e1020',   // mid-layer shadow polygon (dark slope)
    midMtnSnow:    '#c8d0dc',   // snow cap fill — cool not-pure-white
    midMtnSnowRim: '#e0e6ee',   // moon-side rim highlight on snow
    nearMtnFill:   '#0a0c14',   // near layer — almost outline-black
    nearMtnRim:    '#181a26',   // near-layer top edge

    // Distant Soviet outpost lights — blink slowly on the far ridges,
    // reusing the antenna-bulb language. Tiny dots, sky-reserved.
    distantLight:  '#e85c40',   // matches BLD.redBright — same red as the antenna bulb
    distantWindow: '#fbc55a',   // matches BLD.warmGlow — same warmth as station windows

    // Underground biome backgrounds (Stage 4 — keys here so the constants
    // are ready when we paint the layers). Each is the BIOME FILL behind
    // the tile chunks; biome cast-light hues stay in MINERALS_BIBLE §9.4.
    bgTopsoil:     '#5a3e22',   // warm earth — v10.41 lightened from #3a2818 (user wanted topsoil bg lighter)
    bgBedrock:     '#423f38',   // neutral grey-brown — v16.4 lightened (was #2c2820) so near-black oil pools read against the bedrock cave background
    bgPermafrost:  '#162032',   // cold cyan-tinted darkness
    bgFossil:      '#332a20',   // warm sand shadow
    bgDeepcrust:   '#0a0c12',   // near-black with a hint of blue
    bgMagma:       '#280a04',   // deep red-brown (matches existing magma fill)
    bgCrystal:     '#170a26',   // deep purple
    bgMantle:      '#360608',   // deep blood-red

    // Per-biome grain accents — one slightly-different colour per biome,
    // sprinkled at 1-px world resolution by per-coord hash so the bg stops
    // reading as a flat single colour. Each is calibrated to be subtle
    // (low value/saturation delta from the biome fill, like soil grain or
    // stone facets catching light) rather than a competing accent. v0
    // single-tone; can be extended to a second darker tone per biome if
    // needed.
    bgTopsoilGrain:    '#4e3624',   // warm sandy highlight
    bgBedrockGrain:    '#3e3a2c',   // stone facet highlight
    bgPermafrostGrain: '#243250',   // ice glint
    bgFossilGrain:     '#473a2a',   // sand grain
    bgDeepcrustGrain:  '#161824',   // barely-visible blue-grey
    bgMagmaGrain:      '#3c1408',   // dim ember speck (subordinate to the heat pulse + lava streak)
    bgCrystalGrain:    '#28143c',   // crystal facet hint
    bgMantleGrain:     '#4a0a0c',   // dim hot speck

    // Biome-thematic feature accents — small recognisable shapes scattered
    // sparsely so each biome reads as "ice" / "gems" / "fossils" etc, not
    // just a colour shift. Reserved per biome; appears nowhere else.
    bgPermafrostFeature: '#88b8d8',  // ice cyan
    bgCrystalFeature:    '#a868d8',  // gem magenta

    // v10.37 — Terraria-style block-wall colours. The wall is a
    // CONSTRUCTED brick plane (not loose material), distinct in shape
    // language from the organic foreground tiles. Each biome has its own
    // wall colour, ~half the value of the regular bgX so the wall reads
    // as a darker plane "behind" the play layer. Top-left of each block
    // gets a 1-px highlight in the regular bgX (which is lighter than
    // wallX), bottom-right gets a 1-px shadow in wallMortar. The contrast
    // sells the block-with-depth read without adding more colours.
    wallTopsoil:    '#36240e',  // v10.41 lightened from #1c1208 to match the lighter bgTopsoil
    wallBedrock:    '#2b2925',  // v16.4 lightened (was #15140e) with bgBedrock — oil renders near-black, so the bedrock cave wall must not be near-black too
    wallPermafrost: '#0c1220',
    wallFossil:    '#1a1410',
    wallDeepcrust:  '#040508',
    wallCrystal:    '#0c0518',
    wallMortar:     '#06050a',  // shared dark mortar across all biomes

    // Atmospheric haze — single horizon wash, drawn over the lowest sky
    // band to soften the seam where mountains meet sky. Cool blue-purple
    // instead of the previous warm sunset orange (wrong time-of-day).
    horizonHaze:   '#3c3858'
  };

  // Map a LAYER name to its biome background fill. Centralises the Stage-2
  // (4b) biome-distinct underground colours so voidColorForLayer and the
  // underground band render share one source of truth. Replaces the v0
  // LAYERS[i].bg lookup, which used near-black values across the board and
  // made every layer read as "the same dirt with different ore."
  //
  // Each value here is calibrated per MINERALS_BIBLE §9.4 — biome should
  // be readable from a thin cave-gap glimpse, not just from a full screen
  // of unmined tiles.
  function biomeBgColor(layerName) {
    switch (layerName) {
      case 'topsoil':    return BG.bgTopsoil;
      case 'bedrock':    return BG.bgBedrock;
      case 'permafrost': return BG.bgPermafrost;
      case 'barrier':    return BG.bgPermafrost;   // sits at the permafrost/fossil seam, reads as permafrost
      case 'fossil':     return BG.bgFossil;
      case 'deepcrust':  return BG.bgDeepcrust;
      case 'magma':      return BG.bgMagma;
      case 'crystal':    return BG.bgCrystal;
      case 'mantle':     return BG.bgMantle;
    }
    return BG.bgBedrock;
  }

  // Per-biome grain config — picks the BG.*Grain colour and a density
  // threshold in [0, 255]. Densities are tuned so the dots read as
  // "subtle texture" not "noisy fill". Magma and mantle stay at low
  // density because their layer already has the heat-pulse + ember
  // animation doing the texture work; deepcrust stays low because the
  // deepest cave should read as nearly empty space.
  // ====== Underground biome wall patterns (Terraria-style) ======
  //
  // v10.34 — proper textured background plane. Each biome has a small
  // tileable canvas (32×32 world pixels) baked at first sight; the wall
  // fills the whole visible biome band by tiling that canvas via
  // drawImage. Drawn at a horizontal parallax (P_X = 0.7) so the wall
  // slides at 70% of camera speed and reads as a separate background
  // plane behind the tile world. Y stays 1:1 with the world so biome
  // bands align to the player's actual depth.
  //
  // The wall pattern bakes ALL the biome-thematic detail in: pebbles +
  // dirt clumps for topsoil, stone facets + cracks for bedrock, icicles
  // + frost for permafrost, fossil rings + strata for fossil, jagged
  // cracks for deepcrust, gem clusters + sparkles for crystal. The
  // sparse-grain + sparse-features approach from v10.30/31/33 was
  // replaced by this — too sparse to read as background texture.

  var BIOME_WALL_TILE_PX = 64;          // pattern tile size in world pixels
  var BIOME_WALL_PARALLAX_X = 0.55;     // wall slides at 55% of camera X speed
  var BIOME_WALL_PARALLAX_Y = 0.70;     // wall slides at 70% of camera Y speed (~30% Y lag)
  var biomeWallCache = {};

  function getBiomeWallPattern(layerName) {
    if (biomeWallCache[layerName]) return biomeWallCache[layerName];
    var c = null;
    switch (layerName) {
      case 'topsoil':    c = buildTopsoilWallPattern(); break;
      case 'bedrock':    c = buildBedrockWallPattern(); break;
      case 'permafrost': c = buildPermafrostWallPattern(); break;
      case 'barrier':    c = buildPermafrostWallPattern(); break;  // barrier sits in permafrost zone
      case 'fossil':     c = buildFossilWallPattern(); break;
      case 'deepcrust':  c = buildDeepcrustWallPattern(); break;
      case 'crystal':    c = buildCrystalWallPattern(); break;
      // magma + mantle: no pattern — their heat treatment IS the wall
    }
    if (c) biomeWallCache[layerName] = c;
    return c;
  }

  // v11.77 — a reusable CanvasPattern per biome, built once from the 64×64
  // wall canvas. v13.11 — the underground-bg pass fills each biome band
  // with this pattern (parallax on its own matrix); terrain chunks erase
  // their voids so it shows through as the cave wall.
  var biomeWallFillCache = {};
  function getBiomeWallFill(layerName) {
    if (Object.prototype.hasOwnProperty.call(biomeWallFillCache, layerName)) {
      return biomeWallFillCache[layerName];
    }
    var img = getBiomeWallPattern(layerName);
    var fill = img ? ctx.createPattern(img, 'repeat') : null;
    biomeWallFillCache[layerName] = fill;
    return fill;
  }

  // ===== Surface dirt cap — a static foreground topsoil lip with a wavy bottom
  // The biome wall pattern (the parallax background seen through caves) used to
  // stop at a dead-straight line at surfaceY, right where the sky starts — an
  // obvious "the background layer just ends here" seam through any near-surface
  // shaft. This draws a solid FOREGROUND dirt band over that top edge: flat
  // along the surface, WAVY along the bottom, in the foreground terrain's own
  // topsoil colours (TILE_MATERIALS.dirt.topsoil) so it reads as the same
  // ground the player digs. It is STATIC — locked to the world surface (no
  // parallax drift, wavy shape is a pure function of world X), so it always
  // sits exactly over the seam and hides it while the parallax wall recedes
  // below its wavy underside. Drawn in the undergroundBg pass IN FRONT OF the
  // wall but BEHIND the terrain chunks, so it shows only through caves near the
  // surface — exactly where the seam used to show. See BACKGROUND_STYLE.md §10.
  var SURFACE_CAP_MIN  = TILE * 1.2;   // min depth of the cap below surfaceY
  var SURFACE_CAP_WAVE = TILE * 2.4;   // wavy underside swing (avg depth ~2.4 tiles, range ~1.2–3.6)
  function surfaceCapShape(wx) {        // 0..1 undulation for the wavy underside
    var n = 0.5
      + 0.26 * Math.sin(wx * 0.017)
      + 0.15 * Math.sin(wx * 0.041 + 1.3)
      + 0.09 * Math.sin(wx * 0.095 + 2.7)
      + 0.05 * Math.sin(wx * 0.180 + 0.6);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  // v23.34 — reused scratch for drawSurfaceDirtCap's contour points; it runs
  // every frame and was allocating two arrays the full visible width wide.
  var dirtCapXs = [], dirtCapYs = [];
  function drawSurfaceDirtCap(worldLeft, worldRight) {
    var surfaceY = SKY_ROWS * TILE;
    var M = TILE_MATERIALS.dirt.topsoil;
    // Day/night: the topsoil colours are sunlit, so darken them toward a
    // night-shadow tone as the sun drops, the same way the mountains track
    // the cycle. dayW is 1 in full day (original colours) and 0 at night.
    var dayW = scatDayWeight(computeSunElevation(timeOfDay));
    var lit = 0.32 + 0.68 * dayW;
    function capCol(hex) {
      var h = hex.charAt(0) === '#' ? hex.substring(1) : hex;
      var r = Math.round(parseInt(h.substring(0, 2), 16) * lit);
      var g = Math.round(parseInt(h.substring(2, 4), 16) * lit);
      var b = Math.round(parseInt(h.substring(4, 6), 16) * lit + (1 - dayW) * 5);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    var cTop = capCol(M.top), cMid = capCol(M.mid), cBot = capCol(M.bot);
    var cWarm = capCol(M.warm), cGrit = capCol(M.grit), cCool = capCol(M.cool);
    // Wavy underside contour, world-locked (f(worldX), no parallax) so the cap
    // is nailed to the surface and never drifts off the seam. Sampled finely
    // with NO y-rounding: the old step-4 + Math.round() quantised the contour
    // into a chunky staircase that read as stretched blocks along the slopes.
    var step = 2, x0 = worldLeft - step, x1 = worldRight + step;
    var xs = dirtCapXs, ys = dirtCapYs, maxY = surfaceY;
    xs.length = 0; ys.length = 0;
    for (var x = x0; x <= x1; x += step) {
      var y = surfaceY + SURFACE_CAP_MIN + surfaceCapShape(x) * SURFACE_CAP_WAVE;
      xs.push(x); ys.push(y);
      if (y > maxY) maxY = y;
    }
    ctx.save();
    // Clip to the cap: flat top at surfaceY, wavy bottom along the contour.
    ctx.beginPath();
    ctx.moveTo(x0, surfaceY - 1);
    ctx.lineTo(x1, surfaceY - 1);
    for (var i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], ys[i]);
    ctx.closePath();
    ctx.clip();
    // Solid foreground dirt: topsoil at the surface, to mid, to shaded base.
    var grd = ctx.createLinearGradient(0, surfaceY, 0, maxY);
    grd.addColorStop(0,    cTop);
    grd.addColorStop(0.22, cMid);
    grd.addColorStop(1,    cBot);
    ctx.fillStyle = grd;
    ctx.fillRect(x0, surfaceY - 1, x1 - x0, maxY - surfaceY + 2);
    // Sparse grain (warm flecks + dark grit), world-locked so it never shimmers.
    for (var gx = Math.floor(x0 / 7) * 7; gx < x1; gx += 7) {
      for (var gy = surfaceY + 2; gy < maxY; gy += 7) {
        var h = ((gx * 73856093) ^ (gy * 19349663)) & 1023;
        if (h < 70)      { ctx.fillStyle = cGrit; ctx.fillRect(gx, gy, 1, 1); }
        else if (h < 125){ ctx.fillStyle = cWarm; ctx.fillRect(gx, gy, 1, 1); }
      }
    }
    // Shaded rim along the wavy underside, the dirt's shadowed cut edge where
    // the receding parallax wall takes over below. A smooth stroke that FOLLOWS
    // the curve (was axis-aligned fillRects that stair-stepped on the slopes).
    ctx.strokeStyle = cCool;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (var k = 1; k < xs.length; k++) ctx.lineTo(xs[k], ys[k]);
    ctx.stroke();
    ctx.restore();
  }

  function newBiomeWallCanvas() {
    var c = document.createElement('canvas');
    c.width = BIOME_WALL_TILE_PX;
    c.height = BIOME_WALL_TILE_PX;
    return c;
  }

  // v10.40 — dropped the v10.37 brick-grid structure. The block edges
  // (lighter top-left highlight, darker bottom-right shadow) made the
  // wall read as "chocolate squares" — too prominent. New pattern is a
  // solid dark wall colour with very sparse noise dots:
  //   ~15 darker mortar-coloured specks (subtle shadow texture)
  //   ~6 brighter biome-bg-coloured accent specks
  // No grid, no obvious structure. The accent specks are visible enough
  // for parallax drift to register clearly when the camera moves — old
  // uniform-inside-each-block design had nothing for the eye to track.
  function buildSubtleWallPattern(seed, wallColor, brightAccent) {
    var c = newBiomeWallCanvas();
    var g = c.getContext('2d');
    var T = BIOME_WALL_TILE_PX;

    g.fillStyle = wallColor;
    g.fillRect(0, 0, T, T);

    var rand = nightSkyRand(seed);

    // v10.41 — noise count reduced further per "even more subtle" request
    g.fillStyle = BG.wallMortar;
    for (var i = 0; i < 6; i++) {
      var dx = 2 + ((rand() * (T - 4)) | 0);
      var dy = 2 + ((rand() * (T - 4)) | 0);
      g.fillRect(dx, dy, 1, 1);
    }

    g.fillStyle = brightAccent;
    for (var j = 0; j < 3; j++) {
      var lx = 2 + ((rand() * (T - 4)) | 0);
      var ly = 2 + ((rand() * (T - 4)) | 0);
      g.fillRect(lx, ly, 1, 1);
    }

    return c;
  }

  function buildTopsoilWallPattern()    { return buildSubtleWallPattern(0x70150100, BG.wallTopsoil,    BG.bgTopsoil);    }
  function buildBedrockWallPattern()    { return buildSubtleWallPattern(0xBED20CC1, BG.wallBedrock,    BG.bgBedrock);    }
  // v16.3 — Permafrost frost wall. A deep glacial-blue background pane
  // with buried ice glints and a few faint embedded frost crystals. Low-
  // frequency detail (BACKGROUND_STYLE §2) so it reads as a receding
  // background plane, distinct from the foreground frozen ground.
  function buildPermafrostWallPattern() {
    var c = newBiomeWallCanvas();
    var g = c.getContext('2d');
    var T = BIOME_WALL_TILE_PX;
    g.fillStyle = BG.wallPermafrost;
    g.fillRect(0, 0, T, T);
    var rand = nightSkyRand(0x1CE0AB51);
    // Darker mortar specks — subtle shadow texture.
    g.fillStyle = BG.wallMortar;
    for (var i = 0; i < 6; i++) {
      g.fillRect(2 + ((rand() * (T - 4)) | 0), 2 + ((rand() * (T - 4)) | 0), 1, 1);
    }
    // Buried ice glints — sparse brighter cyan specks so the wall is not
    // a dead black field.
    for (var j = 0; j < 8; j++) {
      g.fillStyle = rand() < 0.5 ? BG.bgPermafrostGrain : BG.bgPermafrostFeature;
      g.fillRect(2 + ((rand() * (T - 4)) | 0), 2 + ((rand() * (T - 4)) | 0), 1, 1);
    }
    // 3 faint embedded frost crystals — tiny pale crosses, low contrast.
    g.fillStyle = 'rgba(136,184,216,0.28)';
    for (var k = 0; k < 3; k++) {
      var kx = 8 + ((rand() * (T - 16)) | 0);
      var ky = 8 + ((rand() * (T - 16)) | 0);
      var ks = 2 + ((rand() * 2) | 0);
      g.fillRect(kx - ks, ky, ks * 2 + 1, 1);
      g.fillRect(kx, ky - ks, 1, ks * 2 + 1);
    }
    return c;
  }
  function buildFossilWallPattern()     { return buildSubtleWallPattern(0xF0551155, BG.wallFossil,     BG.bgFossil);     }
  function buildDeepcrustWallPattern()  { return buildSubtleWallPattern(0xDEEEEEC1, BG.wallDeepcrust,  BG.bgDeepcrust);  }
  function buildCrystalWallPattern()    { return buildSubtleWallPattern(0xCC75AA10, BG.wallCrystal,    BG.bgCrystal);    }

  // v13.11 — drawCaveWallsParallaxed was REMOVED. Cave walls are no longer
  // a masked post-chunk pass: the biome wall pattern is painted in the
  // underground-bg pass behind the chunks (see the undergroundBg loop) and
  // the terrain rock occludes it. Chunks erase their voids to transparent —
  // see drawSmoothVoids. ~200 complex contour fills/frame are now gone.

  // ----- Outline pattern helpers -----
  // Stroke a 1-px outline around an axis-aligned rect, drawn AFTER the fill
  // so it overlays the edge pixels (so total footprint stays at w × h).
  function strokeRect1(x, y, w, h, color) {
    ctx.fillStyle = color || BLD.outline;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y + 1, 1, h - 2);
    ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  }

  // ----- Material primitives -----
  // All composed by drawStation (and future buildings). World-pixel coords.

  function drawWoodPlanking(x, y, w, h, plankSpacing) {
    plankSpacing = plankSpacing || 6;
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x, y, w, h);
    // Vertical plank seams (darker batten lines)
    ctx.fillStyle = BLD.woodDark;
    for (var wsx = x + plankSpacing; wsx < x + w; wsx += plankSpacing) {
      ctx.fillRect(wsx, y, 1, h);
    }
    // Per-plank shading: every other plank gets a 1-px highlight stripe
    // and one mid-tone stripe, suggesting cylindrical board curvature.
    ctx.fillStyle = BLD.woodMid;
    for (var wsx2 = x + 1; wsx2 < x + w; wsx2 += plankSpacing) {
      ctx.fillRect(wsx2, y + 2, 1, h - 4);
    }
    ctx.fillStyle = BLD.woodLight;
    for (var wsx3 = x + 2; wsx3 < x + w; wsx3 += plankSpacing) {
      ctx.fillRect(wsx3, y + 3, 1, h - 6);
    }
    // Top sun-bleach + bottom shadow
    ctx.fillStyle = BLD.woodPale;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x, y + h - 1, w, 1);
    // Subtle nail dots, deterministic positions
    ctx.fillStyle = BLD.woodDeep;
    for (var nx = x + 3; nx < x + w; nx += plankSpacing) {
      ctx.fillRect(nx, y + 2, 1, 1);
      ctx.fillRect(nx, y + h - 3, 1, 1);
    }
  }

  // Tall column of brick-stacked irregular stones — used for chimneys and
  // narrow vertical stonework. Rows alternate seam positions for the
  // brick-offset look; individual stones get tiny per-stone shading pips
  // so the silhouette doesn't read as one flat slab.
  function drawStackedStoneColumn(x, y, w, h) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.stoneBase;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    var rowH = 5;
    var rowIdx = 0;
    for (var ry = y + 1; ry < y + h - 1; ry += rowH) {
      var thisH = Math.min(rowH, y + h - 1 - ry);
      if (thisH < 2) break;
      // Horizontal mortar (top of this row, not the first)
      if (rowIdx > 0) {
        ctx.fillStyle = BLD.stoneDark;
        ctx.fillRect(x + 1, ry - 1, w - 2, 1);
      }
      // Vertical seams — 1 stone per row alternates with 2 stones per row,
      // offset so seams in adjacent rows never line up
      ctx.fillStyle = BLD.stoneDark;
      if (rowIdx % 2 === 0) {
        ctx.fillRect(x + Math.floor(w * 0.45), ry, 1, thisH);
      } else {
        ctx.fillRect(x + Math.floor(w * 0.28), ry, 1, thisH);
        ctx.fillRect(x + Math.floor(w * 0.68), ry, 1, thisH);
      }
      // Per-row deterministic shading — gives each stone its own face read
      var hk = (rowIdx * 7919 + 13) % 13;
      if (hk < 4) {
        ctx.fillStyle = BLD.stoneLight;
        ctx.fillRect(x + 2 + (hk % 3), ry, w > 8 ? 2 : 1, 1);
      } else if (hk < 8) {
        ctx.fillStyle = BLD.stonePale;
        ctx.fillRect(x + 2 + (hk % 4), ry + 1, 1, 1);
      } else if (hk < 11) {
        ctx.fillStyle = BLD.stoneDark;
        ctx.fillRect(x + w - 3 - (hk % 2), ry + thisH - 2, 1, 1);
      }
      // Occasional second highlight pip on wide stones
      if (rowIdx % 3 === 0 && w > 10) {
        ctx.fillStyle = BLD.stonePale;
        ctx.fillRect(x + w - 4, ry + 2, 1, 1);
      }
      rowIdx++;
    }
  }

  // Stone corbel — flared shelf with crisp horizontal banding. Used as the
  // transition from a narrow chimney to its wider crown / iron cap.
  function drawStoneCorbel(x, y, w, h) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.stoneBase;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Top highlight band (the corbel face catches light from above)
    ctx.fillStyle = BLD.stoneLight;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    // Bottom shadow band
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    // 2 internal vertical block seams
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x + Math.floor(w * 0.3), y + 1, 1, h - 2);
    ctx.fillRect(x + Math.floor(w * 0.7), y + 1, 1, h - 2);
    // Specular pips
    ctx.fillStyle = BLD.stonePale;
    ctx.fillRect(x + 3, y + 1, 1, 1);
    ctx.fillRect(x + w - 4, y + 1, 1, 1);
  }

  function drawStoneFoundation(x, y, w, h) {
    // Base
    ctx.fillStyle = BLD.stoneBase;
    ctx.fillRect(x, y, w, h);
    // Irregular slab pattern: divide width into 3-4 stones, with vertical
    // mortar gaps at semi-random positions for that hand-laid look.
    var seams = [Math.floor(w * 0.27), Math.floor(w * 0.51), Math.floor(w * 0.78)];
    ctx.fillStyle = BLD.stoneDark;
    for (var si = 0; si < seams.length; si++) {
      ctx.fillRect(x + seams[si], y + 1, 1, h - 1);
    }
    // Top edge highlight
    ctx.fillStyle = BLD.stoneLight;
    ctx.fillRect(x, y, w, 1);
    // Per-slab face dapple — tiny highlight + shadow pixels per slab
    ctx.fillStyle = BLD.stonePale;
    ctx.fillRect(x + 3, y + 2, 1, 1);
    ctx.fillRect(x + seams[0] + 4, y + 2, 1, 1);
    ctx.fillRect(x + seams[1] + 5, y + 1, 1, 1);
    ctx.fillRect(x + seams[2] + 4, y + 2, 1, 1);
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x + 6, y + h - 2, 1, 1);
    ctx.fillRect(x + seams[1] - 2, y + h - 2, 1, 1);
    ctx.fillRect(x + w - 5, y + h - 2, 1, 1);
    // Bottom shadow
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, y + h - 1, w, 1);
  }

  function drawRivetedPlate(x, y, w, h) {
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(x, y, w, h);
    // Vertical seam
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x + Math.floor(w / 2), y, 1, h);
    // Highlight strip down the left of each half
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillRect(x + Math.floor(w / 2) + 1, y + 1, 1, h - 2);
    // Rivets at corners — bright dot + dark shadow
    ctx.fillStyle = BLD.metalPale;
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x + w - 2, y + 1, 1, 1);
    ctx.fillRect(x + 1, y + h - 2, 1, 1);
    ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  }

  function drawRedStar(cx, cy, r, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt || 0);
    // Outline pass — slightly bigger 5-pt star in outline color
    ctx.fillStyle = BLD.outline;
    ctx.beginPath();
    for (var oi = 0; oi < 10; oi++) {
      var oang = -Math.PI / 2 + oi * Math.PI / 5;
      var orr = (oi % 2 === 0) ? r + 0.7 : (r + 0.7) * 0.42;
      var ox = Math.cos(oang) * orr;
      var oy = Math.sin(oang) * orr;
      if (oi === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
    }
    ctx.closePath();
    ctx.fill();
    // Fill pass
    ctx.fillStyle = BLD.redBase;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = (i % 2 === 0) ? r : r * 0.42;
      var sx = Math.cos(ang) * rr;
      var sy = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    // Highlight wedge — bright triangle on the top-left half
    ctx.fillStyle = BLD.redBright;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(-r * 0.28, -r * 0.1);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRustStreak(x, y0, y1, intensity) {
    intensity = intensity || 0.4;
    ctx.fillStyle = 'rgba(110,53,23,' + intensity.toFixed(2) + ')';
    ctx.fillRect(x, y0, 1, y1 - y0);
    ctx.fillStyle = 'rgba(217,125,58,' + (intensity * 0.7).toFixed(2) + ')';
    ctx.fillRect(x, y0 + (y1 - y0) * 0.3, 1, (y1 - y0) * 0.2);
  }

  // Tall thin iron smokestack — body + cap + elbow joint at base. Vents
  // continuously via SmokeFluid when on-screen.
  function drawSmokestack(x, y, w, h, emit) {
    // Body
    drawRivetedPlate(x, y, w, h);
    strokeRect1(x, y, w, h, BLD.outline);
    // Cap (wider, with outline)
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x - 1, y - 2, w + 2, 3);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 2, y - 3, w + 4, 1);
    ctx.fillRect(x - 2, y - 3, 1, 4);
    ctx.fillRect(x + w + 1, y - 3, 1, 4);
    // Soot lip
    ctx.fillStyle = '#0e0a06';
    ctx.fillRect(x - 1, y - 1, w + 2, 1);
    // Elbow joint at base
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(x - 2, y + h - 1, w + 4, 3);
    strokeRect1(x - 2, y + h - 1, w + 4, 3, BLD.outline);
    // Emit smoke if alive
    if (emit && smokeFluidActive && !gameOver && !gameWon) {
      var euv = smokeFluidWorldToUV(x + w / 2, y - 3);
      if (euv.inView) {
        var pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.0017);
        smokeMarkActive();   // v23.32 — invariant: every dye splat wakes the idle-skipped sim
        smokeDriver.splat(euv.uvX, euv.uvY, 0, -0.018 * pulse, { r: 0.16, g: 0.14, b: 0.12 }, 0.013);
      }
    }
  }

  function drawAntenna(baseX, baseY, height, time) {
    // Pole — outlined
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(baseX, baseY - height, 2, height);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(baseX, baseY - height, 1, height);
    // Bulb — 1 Hz abrupt blink
    var on = (Math.floor(time) % 2) === 0;
    if (on) {
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(baseX - 1, baseY - height - 3, 4, 4);
      ctx.fillStyle = BLD.redBase;
      ctx.fillRect(baseX, baseY - height - 2, 2, 2);
      ctx.fillStyle = BLD.redBright;
      ctx.fillRect(baseX, baseY - height - 2, 1, 1);
      ctx.fillStyle = 'rgba(232,92,64,0.35)';
      ctx.fillRect(baseX - 2, baseY - height - 4, 6, 6);
    } else {
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(baseX - 1, baseY - height - 3, 4, 4);
      ctx.fillStyle = BLD.redDeep;
      ctx.fillRect(baseX, baseY - height - 2, 2, 2);
    }
  }

  // Gold sign board with dark Cyrillic letters. The text is drawn via canvas
  // fillText; falls back to system monospace if Cyrillic glyphs aren't present.
  function drawSignBoard(x, y, w, h, text) {
    // Outline + dark frame
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x, y, w, h);
    // Gold inner fill with bevel
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = BLD.goldPale;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);              // top bevel
    ctx.fillStyle = BLD.goldDark;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);          // bottom shadow
    // Text — dark engraved letters
    ctx.font = 'bold 7px ' + UI_FONT;
    ctx.fillStyle = BLD.woodDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // v11.37 — Wooden double doors that animate open. `openT` (0..1) is
  // the door's open progress: 0 = both halves shut centered, 1 = each
  // half slid into the wall. Driven by shopDoorT module state — the
  // door opens as the player approaches and a warm interior glow
  // shines through, with a small "fly up" arrow inviting entry.
  function drawDoubleDoor(x, y, w, h, time, openT) {
    openT = openT || 0;
    var halfW = Math.floor(w / 2);
    var slide = Math.floor(halfW * openT * 0.85);

    // Outline + dark recessed interior backing
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(x, y, w, h);

    // v15.1 — Open door reads as a warm shadow: a dim, lamp-lit room
    // glimpsed through the doorway, NOT a beacon. Light pools low (a warm
    // floorboard catching a lamp); the upper room stays in shade. The old
    // yellow "fly up" chevron is gone — an open door is its own invitation
    // and drawShopDoorGlow() pools warm light on the deck outside.
    if (openT > 0.04) {
      var ix = x + 1, iw = w - 2, iy = y + 1, ih = h - 2;
      for (var ry = 0; ry < ih; ry++) {
        var f = (ih > 1) ? ry / (ih - 1) : 1;   // 0 = lintel, 1 = floor
        var warm = f * f;                       // quadratic — top stays dark
        var ia = openT * (0.05 + 0.4 * warm);
        var cr = (148 + 88 * warm) | 0;
        var cg = (66 + 78 * warm) | 0;
        var cb = (26 + 40 * warm) | 0;
        ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + ia.toFixed(3) + ')';
        ctx.fillRect(ix, iy + ry, iw, 1);
      }
      // Warm pool on the floorboard deep inside — the lamp's reach.
      var poolY = y + h - 6;
      ctx.fillStyle = 'rgba(236,176,98,' + (openT * 0.30).toFixed(3) + ')';
      ctx.fillRect(ix + 2, poolY, iw - 4, 4);
      ctx.fillStyle = 'rgba(255,206,128,' + (openT * 0.20).toFixed(3) + ')';
      ctx.fillRect(ix + 4, poolY + 1, iw - 8, 2);
    }

    // Door halves sliding outward
    drawDoorHalfPanel(x - slide, y, halfW, h, time, true);
    drawDoorHalfPanel(x + halfW + slide, y, halfW, h, time, false);
  }

  function drawDoorHalfPanel(px, py, pw, ph, time, isLeft) {
    // Outer outline (only on the outer side; inner side is the seam)
    ctx.fillStyle = BLD.outline;
    if (isLeft) {
      ctx.fillRect(px - 1, py, 1, ph);
    } else {
      ctx.fillRect(px + pw, py, 1, ph);
    }
    ctx.fillRect(px, py - 1, pw, 1);
    ctx.fillRect(px, py + ph, pw, 1);

    // Wooden body
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(px, py, pw, ph);
    // Inlay
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(px + 1, py + 2, pw - 2, ph - 4);
    // Bevel
    ctx.fillStyle = BLD.woodLight;
    ctx.fillRect(px + 1, py + 2, pw - 2, 1);
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(px + 1, py + ph - 3, pw - 2, 1);

    // Window — outer side of each half (away from seam)
    var winX = isLeft ? px + 1 : px + pw - 6;
    var winY = py + 3;
    var pulse = 0.7 + 0.3 * Math.sin(time * 0.4);
    var glowAlpha = (0.55 + 0.25 * pulse).toFixed(2);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(winX, winY - 1, 5, 6);
    ctx.fillStyle = 'rgba(251,197,90,' + glowAlpha + ')';
    ctx.fillRect(winX + 1, winY, 3, 4);
    // Mullions
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(winX + 2, winY, 1, 4);
    ctx.fillRect(winX + 1, winY + 1, 3, 1);

    // Brass handle on the INNER (seam-facing) edge
    ctx.fillStyle = BLD.goldBright;
    var handleX = isLeft ? px + pw - 2 : px + 1;
    ctx.fillRect(handleX, py + Math.floor(ph * 0.55), 1, 1);
  }

  // v15.1 — Warm light spilling from the open shop door onto the deck.
  // The diegetic entry affordance that replaced the yellow chevron: when
  // the rig is parked in the shop entry zone, the open doorway pools warm
  // light around it. Drawn live (not baked into the cached station) so it
  // tracks the player; world-space, called right after drawStation().
  function drawShopDoorGlow() {
    if (shopGlowT <= 0.01) return;
    var d = getShopDoorRect();
    var dcx = d.x + Math.floor(d.w / 2);
    var deckY = DECK_ROW * TILE;
    var t = shopGlowT * shopGlowT * (3 - 2 * shopGlowT);   // smoothstep
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft warm pool on the deck — stepped rows, brightest + tightest at
    // the threshold, fanning out and dimming. Warm hue throughout.
    var rows = [
      { dy: -3, hw: 5,  a: 0.22, c: '255,214,138' },
      { dy: -2, hw: 9,  a: 0.20, c: '255,196,112' },
      { dy: -1, hw: 14, a: 0.16, c: '252,176,88'  },
      { dy:  0, hw: 19, a: 0.12, c: '246,156,70'  },
      { dy:  1, hw: 24, a: 0.07, c: '238,138,58'  }
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      ctx.fillStyle = 'rgba(' + r.c + ',' + (r.a * t).toFixed(3) + ')';
      ctx.fillRect(dcx - r.hw, deckY + r.dy, r.hw * 2, 1);
    }
    ctx.restore();
  }

  // Propaganda poster — a small red rectangle with a cream border, a red
  // star, and an abstract icon. At this scale text isn't readable, so we
  // suggest "poster" with the star + icon composition.
  function drawPropagandaPoster(x, y, w, h, kind) {
    // Outline + cream border
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(x, y, w, h);
    // Red field inset
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Cream bevel inside the red field
    ctx.fillStyle = BLD.redBright;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = BLD.redDeep;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    if (kind === 'star') {
      // Big star top, two cream stripes below (suggesting Cyrillic text)
      drawRedStar(x + w / 2, y + h * 0.35, 3, 0);
      ctx.fillStyle = BLD.cream;
      ctx.fillRect(x + 2, y + h - 5, w - 4, 1);
      ctx.fillRect(x + 3, y + h - 3, w - 6, 1);
    } else {
      // Portrait silhouette: head + shoulders bust in cream
      ctx.fillStyle = BLD.cream;
      // Head
      ctx.fillRect(x + w / 2 - 2, y + 2, 4, 4);
      // Mustache hint (dark line under head)
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(x + w / 2 - 1, y + 5, 3, 1);
      // Shoulders
      ctx.fillStyle = BLD.cream;
      ctx.fillRect(x + 2, y + 7, w - 4, 3);
      // Two cream subtitle stripes
      ctx.fillRect(x + 2, y + h - 4, w - 4, 1);
      ctx.fillRect(x + 3, y + h - 2, w - 6, 1);
    }
  }

  // Porch awning — wooden plank roof with a thin metal cap. Supported by
  // two posts. Slightly wider than the building body to project forward.
  function drawPorchAwning(x, y, w, h) {
    // Outline
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    // Plank body
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x, y, w, h);
    // Vertical batten lines
    ctx.fillStyle = BLD.woodDeep;
    for (var px = x + 5; px < x + w; px += 5) {
      ctx.fillRect(px, y + 1, 1, h - 2);
    }
    // Top metal cap
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x, y, w, 1);
    // Bottom shadow rim under awning (where it overhangs the wall)
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x, y + h - 1, w, 1);
  }

  // Arched false-front silhouette — fills a curved top facade. Returns the
  // path so the caller can clip to it for content rendering.
  function fillArchedFacade(x, y, w, h, archH) {
    archH = archH || 6;
    // Body rect (below the arch)
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x, y + archH, w, h - archH);
    // Arched cap — three stepped rows of fill
    var midX = x + w / 2;
    for (var ay = 0; ay < archH; ay++) {
      var tt = ay / archH;
      var inset = Math.round((1 - Math.sqrt(1 - tt * tt)) * (w * 0.18));
      ctx.fillRect(x + inset, y + ay, w - inset * 2, 1);
    }
    // Apply plank texture on top — re-paint wood detail across whole facade
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + archH, w, h - archH);
    // Arch top region: also include arched silhouette in clip
    for (var cy = 0; cy < archH; cy++) {
      var ct = cy / archH;
      var cinset = Math.round((1 - Math.sqrt(1 - ct * ct)) * (w * 0.18));
      ctx.rect(x + cinset, y + cy, w - cinset * 2, 1);
    }
    ctx.clip();
    drawWoodPlanking(x, y, w, h, 6);
    ctx.restore();
    // Outline around the arched silhouette
    ctx.fillStyle = BLD.outline;
    for (var oy = 0; oy < archH; oy++) {
      var ot = oy / archH;
      var oinset = Math.round((1 - Math.sqrt(1 - ot * ot)) * (w * 0.18));
      ctx.fillRect(x + oinset, y + oy, 1, 1);                       // left edge
      ctx.fillRect(x + w - oinset - 1, y + oy, 1, 1);               // right edge
    }
    // Top arch cap
    var topInset = Math.round((1 - Math.sqrt(1 - 0)) * (w * 0.18));
    ctx.fillRect(x + topInset, y, w - topInset * 2, 1);
    // Sides below arch
    ctx.fillRect(x, y + archH, 1, h - archH);
    ctx.fillRect(x + w - 1, y + archH, 1, h - archH);
    ctx.fillRect(x, y + h - 1, w, 1);                                // bottom
  }

  function drawOilLamp(x, y, time) {
    var flicker = 0.95 + 0.05 * Math.sin(time * 50 + Math.sin(time * 7));
    // Lamp body — outlined
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 2, y - 1, 5, 6);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(x - 1, y, 3, 4);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x - 1, y, 1, 4);
    // Glow halo
    var halo = ctx.createRadialGradient(x + 0.5, y + 2, 0, x + 0.5, y + 2, 10);
    halo.addColorStop(0, 'rgba(251,197,90,' + (0.65 * flicker).toFixed(2) + ')');
    halo.addColorStop(0.5, 'rgba(251,197,90,0.20)');
    halo.addColorStop(1, 'rgba(251,197,90,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 10, y - 8, 22, 22);
    // Bright center
    ctx.fillStyle = 'rgba(255,230,160,' + (0.95 * flicker).toFixed(2) + ')';
    ctx.fillRect(x, y + 1, 1, 2);
  }

  function drawOilDrum(x, y) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, 8, 10);
    drawRivetedPlate(x, y, 6, 8);
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x, y, 6, 1);
    ctx.fillStyle = BLD.redBase;
    ctx.fillRect(x, y + 4, 6, 1);
    ctx.fillStyle = BLD.redBright;
    ctx.fillRect(x, y + 4, 1, 1);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 2, y + 8, 1, 1);
  }

  function drawCrate(x, y, w, h) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.woodLight;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x, y + h - 1, w, 1);
    // Diagonal cross bracing
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x + Math.floor(w / 2) - 1, y + 1, 2, h - 2);
    ctx.fillRect(x + 1, y + Math.floor(h / 2) - 1, w - 2, 2);
  }

  // Wooden outdoor chair — 10 wide × 14 tall. Plank seat + slatted back with
  // a small red star on the lower slat (regime motif). Sits with feet on
  // groundY. Used flanking the open-air fireplace.
  function drawChair(x, groundY) {
    var w = 10;
    var seatY = groundY - 7;        // top of seat plank
    var backH = 7;                  // back rises 7 px above seat top
    // Back frame — top crossbar + 2 side posts (outlined silhouette)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, seatY - backH, w, 2);
    ctx.fillRect(x, seatY - backH, 1, backH);
    ctx.fillRect(x + w - 1, seatY - backH, 1, backH);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x + 1, seatY - backH + 1, w - 2, 1);
    // Lower decorative slat (star slat)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 1, seatY - 3, w - 2, 2);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x + 1, seatY - 3, w - 2, 1);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x + 1, seatY - 2, w - 2, 1);
    drawRedStar(x + w / 2, seatY - 2, 1.4, 0);
    // Seat (2 tall plank)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, seatY, w, 2);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x + 1, seatY + 1, w - 2, 1);
    ctx.fillStyle = BLD.woodLight;
    ctx.fillRect(x + 1, seatY, w - 2, 1);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x + Math.floor(w / 2), seatY, 1, 2);
    // Legs (4) — outer pair full height, inner pair slightly shorter
    var legTop = seatY + 2;
    var legH = groundY - legTop;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, legTop, 1, legH);
    ctx.fillRect(x + w - 1, legTop, 1, legH);
    ctx.fillRect(x + 2, legTop, 1, legH - 1);
    ctx.fillRect(x + w - 3, legTop, 1, legH - 1);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x + 1, legTop, 1, legH - 1);
    ctx.fillRect(x + w - 2, legTop, 1, legH - 1);
    // Front cross-stretcher between inner legs
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(x + 3, groundY - 3, w - 6, 1);
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x - 1, groundY - 1, w + 2, 2);
  }

  // Animated layered flames inside a firebox. Cool outer red shell wraps a
  // warm bright core; heights flicker via sine waves at different
  // frequencies so adjacent tongues don't sync. (x, y, w, h) is the
  // interior cavity rect — flames fill it from the bottom up.
  function drawHearthFire(x, y, w, h, time) {
    var cx_f = x + w / 2;
    // Outermost dim red shell (slow, widest)
    ctx.fillStyle = BLD.redDark;
    for (var i0 = 0; i0 < 4; i0++) {
      var px0 = x + 1 + i0 * Math.max(1, Math.floor((w - 2) / 4));
      var fh0 = h - 2 + Math.sin(time * 6 + i0 * 1.7) * 1.2;
      if (fh0 > 0) ctx.fillRect(Math.floor(px0), Math.floor(y + h - fh0), 2, Math.ceil(fh0));
    }
    // Red layer
    ctx.fillStyle = BLD.redBase;
    for (var i1 = 0; i1 < 3; i1++) {
      var px1 = x + 2 + i1 * Math.max(1, Math.floor((w - 4) / 3));
      var fh1 = h - 4 + Math.sin(time * 8 + i1 * 1.3) * 1.4;
      if (fh1 > 0) ctx.fillRect(Math.floor(px1), Math.floor(y + h - fh1), 2, Math.ceil(fh1));
    }
    // Orange layer
    ctx.fillStyle = BLD.redBright;
    for (var i2 = 0; i2 < 2; i2++) {
      var px2 = x + 3 + i2 * Math.max(1, Math.floor((w - 6) / 2));
      var fh2 = h - 5 + Math.sin(time * 10 + i2 * 0.9) * 1.7;
      if (fh2 > 0) ctx.fillRect(Math.floor(px2), Math.floor(y + h - fh2), 2, Math.ceil(fh2));
    }
    // Yellow hot core
    ctx.fillStyle = BLD.warmGlow;
    var coreH = (h - 7) + Math.sin(time * 12) * 1.2;
    if (coreH > 0) ctx.fillRect(Math.floor(cx_f - 1), Math.floor(y + h - coreH), 2, Math.ceil(coreH));
    // White-hot embers at base
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(Math.floor(cx_f - 1), Math.floor(y + h - 2), 2, 2);
    // Tiny floating spark (cycles position deterministically)
    var ePhase = Math.floor(time * 4) % 5;
    ctx.fillStyle = BLD.warmGlow;
    ctx.fillRect(Math.floor(x + 2 + (ePhase % 3)), Math.floor(y + h - 1 - ePhase), 1, 1);
  }

  // Single 5x5 wood-log end (cylindrical log seen end-on). Used in stacks
  // next to the fireplace.
  function drawLogEnd(x, y) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 1, y, 3, 1);
    ctx.fillRect(x, y + 1, 5, 3);
    ctx.fillRect(x + 1, y + 4, 3, 1);
    ctx.fillStyle = BLD.woodBase;
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(x + 2, y + 1, 1, 1);
    ctx.fillRect(x + 2, y + 3, 1, 1);
    ctx.fillRect(x + 1, y + 2, 1, 1);
    ctx.fillRect(x + 3, y + 2, 1, 1);
    ctx.fillStyle = BLD.woodLight;
    ctx.fillRect(x + 2, y + 2, 1, 1);
  }

  // Rust-red iron strap with bolt heads — wraps stonework like a chimney or
  // mantle to bind it together. The red-painted-iron-over-stone reading is
  // exactly the Frontier Soviet "regime addition over older work" motif.
  function drawRustyIronBand(x, y, w, h) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = BLD.redBase;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = BLD.metalPale;
    for (var rx = x + 2; rx < x + w - 2; rx += 4) {
      ctx.fillRect(rx, y + 1, 1, 1);
    }
  }


  // Iron support post — capital (wider top) + riveted body with bolts +
  // base flange (wider bottom). Holds up the gas-station canopy. Stands
  // from `groundY` up by `height` world px. Main body is 6 wide; capitals
  // and base extend to 10 wide.
  function drawSupportPost(x, groundY, height) {
    var topY = groundY - height;
    // Body (6 wide riveted iron)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, topY + 3, 8, height - 6);
    drawRivetedPlate(x, topY + 3, 6, height - 6);
    // Bolts down the body (alternating)
    ctx.fillStyle = BLD.metalPale;
    for (var by = topY + 9; by < groundY - 6; by += 12) {
      ctx.fillRect(x + 1, by, 1, 1);
      ctx.fillRect(x + 4, by, 1, 1);
    }
    // Subtle rust streak down one side
    drawRustStreak(x + 6, topY + 8, groundY - 8, 0.28);
    // Capital (wider at top) — 10 wide × 3 tall, sits at top of body
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 3, topY, 12, 4);
    drawRivetedPlate(x - 2, topY, 10, 3);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x - 2, topY, 10, 1);                    // top rim highlight
    // Base flange (wider at bottom) — 10 wide × 3 tall, sits at ground
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 3, groundY - 4, 12, 4);
    drawRivetedPlate(x - 2, groundY - 3, 10, 3);
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x - 2, groundY - 1, 10, 1);             // shadow at the foot
  }

  // Wide flat gas-station canopy — wooden plank top with a red trim strip
  // along the bottom edge (the "fueling station" silhouette). Outlined.
  // COLD STORAGE since the v24.138 depot v2 (drawDepotCanopy is the live
  // canopy); kept per the windsock precedent — swap back by calling it
  // from drawPumpPadContent.
  function drawCanopy(x, y, w, h) {
    var woodH = Math.max(4, h - 4);
    var redH = h - woodH;
    // Outline around the whole canopy
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    // Wood plank top
    drawWoodPlanking(x, y, w, woodH, 6);
    // Red trim along the bottom edge
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x, y + woodH, w, redH);
    ctx.fillStyle = BLD.redBase;
    ctx.fillRect(x, y + woodH, w, 1);
    ctx.fillStyle = BLD.redDeep;
    ctx.fillRect(x, y + h - 1, w, 1);
    // Thin iron drip-edge a pixel below the canopy
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x, y + h, w, 1);
  }

  // Downward chevron painted on the ground inside the parking pad. Bobs
  // gently when the player is NOT on the pad (drawing attention to where
  // to park); stays still and turns cream when the player IS on it.
  function drawParkingArrow(centerX, padY, time, active) {
    var bob = active ? 0 : Math.sin(time * 2) * 1.2;
    var size = 6;
    var aY = padY - 14 + bob;
    ctx.save();
    // Outline pass
    ctx.strokeStyle = BLD.outline;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - size, aY);
    ctx.lineTo(centerX, aY + size);
    ctx.lineTo(centerX + size, aY);
    ctx.stroke();
    // Inner stroke (color)
    ctx.strokeStyle = active ? BLD.cream : BLD.goldBright;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - size, aY);
    ctx.lineTo(centerX, aY + size);
    ctx.lineTo(centerX + size, aY);
    ctx.stroke();
    ctx.restore();
  }

  // Yellow + black diagonal hazard stripes — used by depot pads, ore
  // conveyor mouths, danger zones. Scrolls slowly when `active`.
  function drawHazardStripes(x, y, w, h, time, active) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    var offset = active ? (time * 14) % 8 : 0;
    for (var hsx = -8; hsx < w + 8; hsx += 8) {
      ctx.fillStyle = BLD.goldBase;
      ctx.fillRect(x + hsx + offset, y, 4, h);
      ctx.fillStyle = BLD.outline;
      ctx.fillRect(x + hsx + offset + 4, y, 4, h);
    }
    ctx.restore();
  }

  // Cylindrical fuel tank — tall riveted body with a red star + horizontal
  // stripes painted on, a small top vent, a pressure gauge near top-right,
  // and a pipe fitting on the left side connecting to the pump.
  function drawFuelTank(x, groundY, w, h, time) {
    var top = groundY - h;
    // Outline silhouette
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
    // Body — tan / off-white with cylindrical shading
    var bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, '#8a857a');
    bodyGrad.addColorStop(0.4, BLD.stonePale);
    bodyGrad.addColorStop(0.6, BLD.stonePale);
    bodyGrad.addColorStop(1, '#6b685e');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, top, w, h);
    // Top rim cap (darker arc)
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x, top, w, 2);
    ctx.fillStyle = BLD.stonePale;
    ctx.fillRect(x + 1, top + 1, w - 2, 1);
    // Bottom rim
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, top + h - 1, w, 1);
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x, top + h - 2, w, 1);
    // Horizontal red stripes (top + middle band of painted stripes)
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x + 2, top + 6, w - 4, 1);
    ctx.fillRect(x + 2, top + 10, w - 4, 1);
    // Red star painted centered, slightly off-center vertically
    drawRedStar(x + w / 2, top + h * 0.5, 4, 0);
    // Vertical seam (cylinder mid-line)
    ctx.fillStyle = BLD.stoneDark;
    ctx.fillRect(x + Math.floor(w / 2), top + 2, 1, h - 4);
    // Rivets along each side
    ctx.fillStyle = BLD.outline;
    for (var rry = top + 4; rry < top + h - 4; rry += 6) {
      ctx.fillRect(x + 1, rry, 1, 1);
      ctx.fillRect(x + w - 2, rry, 1, 1);
    }
    // Top vent stack (small pipe sticking up)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + w - 6, top - 8, 4, 8);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(x + w - 5, top - 7, 2, 7);
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x + w - 6, top - 8, 4, 2);
    // Pressure gauge near top
    var gx = x + w - 6, gy = top + 5;
    ctx.fillStyle = BLD.outline;
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLD.cream;
    ctx.beginPath();
    ctx.arc(gx, gy, 2, 0, Math.PI * 2);
    ctx.fill();
    // Needle (gentle wobble)
    var na = 0.4 + 0.15 * Math.sin(time * 1.5);
    ctx.strokeStyle = BLD.redBase;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(na) * 1.6, gy + Math.sin(na) * 1.6);
    ctx.stroke();
  }


  // Pay-out terminal — slim vertical cabinet with green LCD, gold coin slot,
  // and a receipt paper slot. COLD STORAGE since the v24.138 depot v2 (the
  // cashier BOOTH is the pay point now); kept per the windsock precedent.
  function drawPayoutTerminal(x, groundY, time, active) {
    var W = 16, H = 36;
    var top = groundY - H;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, top - 1, W + 2, H + 2);
    drawRivetedPlate(x, top, W, H);
    // "PAY OUT" label (tiny)
    ctx.font = 'bold 3px ' + UI_FONT;
    ctx.fillStyle = BLD.cream;
    ctx.textAlign = 'center';
    ctx.fillText('PAY OUT', x + W / 2, top + 4);
    ctx.textAlign = 'left';
    // Green LCD screen
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 1, top + 6, W - 2, 7);
    ctx.fillStyle = '#0a1a12';
    ctx.fillRect(x + 2, top + 7, W - 4, 5);
    // Digits — green segmented
    ctx.font = 'bold 4px ' + UI_FONT;
    ctx.fillStyle = active ? '#5cffb0' : '#3a8060';
    ctx.textAlign = 'center';
    ctx.fillText('01280', x + W / 2, top + 11);
    ctx.textAlign = 'left';
    // Gold ₽ coin
    var cx2 = x + W / 2, cy2 = top + 18;
    ctx.fillStyle = BLD.outline;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLD.goldBase;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLD.goldPale;
    ctx.fillRect(cx2 - 1, cy2 - 1, 1, 1);
    ctx.font = 'bold 4px ' + UI_FONT;
    ctx.fillStyle = BLD.outline;
    ctx.textAlign = 'center';
    ctx.fillText('P', cx2, cy2 + 1.5);
    ctx.textAlign = 'left';
    // Receipt slot at bottom (cream paper sticking out)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 2, top + H - 10, W - 4, 6);
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(x + 3, top + H - 9, W - 6, 4);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 5, top + H - 8, 1, 1);
    ctx.fillRect(x + 8, top + H - 7, 1, 1);
    ctx.fillRect(x + 5, top + H - 6, 1, 1);
  }

  // Old-school cream-bodied gas pump — brass globe finial, large round
  // mechanical gauge with a red needle, green-digit odometer screen, red
  // label panel with a fuel-droplet icon, curving hose hanging on a brass
  // nozzle hook. `active` lights up the globe, animates the needle, and
  // brightens the odometer digits. 16 × 36 wide × tall.
  function drawFuelPump(x, groundY, time, active) {
    var W = 16, H = 36;
    var top = groundY - H;

    // ----- Brass globe finial on top -----
    var stemX = x + Math.floor(W / 2) - 1;
    // Brass stem mounting
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(stemX - 1, top - 2, 4, 3);
    ctx.fillStyle = BLD.goldDark;
    ctx.fillRect(stemX, top - 1, 2, 2);
    // Globe orb (4×4 with outline)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(stemX - 2, top - 6, 6, 4);
    ctx.fillStyle = active ? BLD.warmGlow : '#b07a3a';
    ctx.fillRect(stemX - 1, top - 5, 4, 2);
    ctx.fillRect(stemX, top - 6, 2, 1);
    ctx.fillRect(stemX, top - 3, 2, 1);
    // Globe highlight
    ctx.fillStyle = active ? '#ffe6a8' : '#d49555';
    ctx.fillRect(stemX - 1, top - 5, 1, 1);
    // Active glow halo
    if (active) {
      ctx.fillStyle = 'rgba(251,197,90,0.25)';
      ctx.fillRect(stemX - 4, top - 8, 10, 8);
    }

    // ----- Outline silhouette around the body -----
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, top - 1, W + 2, H + 2);

    // ----- Main cream body -----
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(x, top, W, H);
    // Inner bevel — top + left highlight
    ctx.fillStyle = '#f3e2bc';
    ctx.fillRect(x + 1, top + 1, W - 2, 1);
    ctx.fillRect(x + 1, top + 1, 1, H - 2);
    // Inner bevel — bottom + right shadow
    ctx.fillStyle = '#b9a780';
    ctx.fillRect(x + 1, top + H - 2, W - 2, 1);
    ctx.fillRect(x + W - 2, top + 2, 1, H - 3);

    // ----- Round mechanical gauge -----
    var gcx = x + Math.floor(W / 2);
    var gcy = top + 8;
    // Outer brass ring + outline
    ctx.fillStyle = BLD.outline;
    ctx.beginPath();
    ctx.arc(gcx, gcy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLD.goldDark;
    ctx.beginPath();
    ctx.arc(gcx, gcy, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLD.goldBase;
    ctx.beginPath();
    ctx.arc(gcx, gcy, 4.2, 0, Math.PI * 2);
    ctx.fill();
    // Cream face
    ctx.fillStyle = BLD.cream;
    ctx.beginPath();
    ctx.arc(gcx, gcy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Tick marks at compass points
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(gcx - 0.5, gcy - 3.5, 1, 1);            // 12
    ctx.fillRect(gcx + 2.5, gcy - 0.5, 1, 1);            // 3
    ctx.fillRect(gcx - 0.5, gcy + 2.5, 1, 1);            // 6
    ctx.fillRect(gcx - 3.5, gcy - 0.5, 1, 1);            // 9
    // Mid ticks (smaller)
    ctx.fillStyle = '#5a574f';
    ctx.fillRect(gcx + 1.5, gcy - 2.5, 1, 1);
    ctx.fillRect(gcx + 1.5, gcy + 1.5, 1, 1);
    ctx.fillRect(gcx - 2.5, gcy - 2.5, 1, 1);
    ctx.fillRect(gcx - 2.5, gcy + 1.5, 1, 1);
    // Red needle — sweeps when active, points down when idle
    var needleSweep = active ? (-Math.PI / 2 + Math.PI * 1.4 * (0.5 + 0.5 * Math.sin(time * 1.6))) : (Math.PI / 2);
    ctx.strokeStyle = BLD.redBase;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gcx, gcy);
    ctx.lineTo(gcx + Math.cos(needleSweep) * 3, gcy + Math.sin(needleSweep) * 3);
    ctx.stroke();
    // Needle pivot dot
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(gcx - 0.5, gcy - 0.5, 1, 1);

    // ----- Mechanical odometer screen (the digit readout) -----
    var odoY = top + 16;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 2, odoY, W - 4, 6);
    ctx.fillStyle = '#0a1a12';
    ctx.fillRect(x + 3, odoY + 1, W - 6, 4);
    // Digits
    ctx.font = 'bold 3px ' + UI_FONT;
    ctx.fillStyle = active ? '#5cffb0' : '#3a8060';
    ctx.textAlign = 'center';
    ctx.fillText('01.234', x + W / 2, odoY + 4);
    ctx.textAlign = 'left';

    // ----- Red label panel with fuel droplet -----
    var labelY = top + 23;
    var labelH = 8;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 1, labelY, W - 2, labelH);
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x + 2, labelY + 1, W - 4, labelH - 2);
    ctx.fillStyle = BLD.redBase;
    ctx.fillRect(x + 2, labelY + 1, W - 4, 1);
    ctx.fillStyle = BLD.redDeep;
    ctx.fillRect(x + 2, labelY + labelH - 2, W - 4, 1);
    // Fuel droplet icon centered
    var dpx = x + Math.floor(W / 2);
    var dpy = labelY + 4;
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(dpx, dpy - 2, 1, 1);                    // tip
    ctx.fillRect(dpx - 1, dpy - 1, 3, 1);                // shoulders
    ctx.fillRect(dpx - 1, dpy, 3, 1);                    // body
    ctx.fillRect(dpx, dpy + 1, 1, 1);                    // bottom point
    // Highlight
    ctx.fillStyle = '#fffdf0';
    ctx.fillRect(dpx - 1, dpy, 1, 1);

    // ----- Dark base strip -----
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 1, top + H - 3, W - 2, 3);
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(x + 1, top + H - 3, W - 2, 2);

    // ----- Hose curving from the right side down to a brass nozzle on a hook -----
    var hoseStartX = x + W;
    var hoseStartY = top + 22;
    var hookX = x + W + 4;
    var hookY = groundY - 12;
    // Hose outline
    ctx.strokeStyle = BLD.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hoseStartX, hoseStartY);
    ctx.quadraticCurveTo(x + W + 8, hoseStartY + 6, hookX + 1, hookY);
    ctx.stroke();
    // Hose fill (dark rubber)
    ctx.strokeStyle = '#221814';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hoseStartX, hoseStartY);
    ctx.quadraticCurveTo(x + W + 8, hoseStartY + 6, hookX + 1, hookY);
    ctx.stroke();

    // ----- Brass nozzle hanging on the hook -----
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(hookX - 1, hookY, 6, 5);
    ctx.fillStyle = BLD.goldDark;
    ctx.fillRect(hookX, hookY + 1, 4, 3);
    ctx.fillStyle = BLD.goldBase;
    ctx.fillRect(hookX, hookY + 1, 4, 1);
    ctx.fillStyle = BLD.goldPale;
    ctx.fillRect(hookX, hookY + 1, 1, 1);
    // Nozzle hook bracket
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(hookX + 4, hookY - 2, 1, 4);
  }

  // Cashier booth — the depot's pay point (replaces the floating pay-out
  // terminal). Three-era stratification per BUILDING_STYLE §4: stone base,
  // wood-plank walls, iron stovepipe. КАССА service window with a warm
  // interior glow + a transaction shelf where the money changes hands.
  // The stovepipe draws but NEVER emits — the fireplace is the compound's
  // only active smoke source (station-smokestack precedent). The canopy
  // slab rests on this booth, so it doubles as the right-end support.
  function drawCashBooth(x, groundY, w, h, time) {
    var top = groundY - h;
    // Stovepipe FIRST — the wall and the canopy slab overlap its shaft, so
    // only the capped head shows above the roof line.
    drawSmokestack(x + w - 8, groundY - 78, 4, 34, false);
    // Silhouette outline
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, top - 1, w + 2, h + 1);
    // Wood walls + stone base
    drawWoodPlanking(x, top, w, h - 7, 6);
    drawStoneFoundation(x, groundY - 7, w, 7);
    // КАССА label painted on the planks under the roof line
    ctx.font = 'bold 4px ' + UI_FONT;
    ctx.fillStyle = BLD.goldBright;
    ctx.textAlign = 'center';
    ctx.fillText('КАССА', x + w / 2, top + 6);
    ctx.textAlign = 'left';
    // Service window — outlined frame, warm-lit glass with a mullion cross
    var wx = x + 5, wy = top + 9, ww = 16, wh = 13;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
    ctx.fillStyle = BLD.warmGlow;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = BLD.goldBase;                  // lower panes sit deeper
    ctx.fillRect(wx, wy + Math.floor(wh / 2), ww, Math.ceil(wh / 2));
    ctx.fillStyle = BLD.outline;                   // mullion cross
    ctx.fillRect(wx + Math.floor(ww / 2), wy, 1, wh);
    ctx.fillRect(wx, wy + Math.floor(wh / 2), ww, 1);
    // Soft warm spill from the glass
    var halo = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, 14);
    halo.addColorStop(0, 'rgba(251,197,90,0.28)');
    halo.addColorStop(1, 'rgba(251,197,90,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(wx - 12, wy - 10, ww + 24, wh + 20);
    // Transaction shelf below the window
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(wx - 2, wy + wh + 1, ww + 4, 3);
    ctx.fillStyle = BLD.woodLight;
    ctx.fillRect(wx - 1, wy + wh + 1, ww + 2, 2);
    ctx.fillStyle = BLD.woodPale;
    ctx.fillRect(wx - 1, wy + wh + 1, ww + 2, 1);
    // Tariff board on the lower wall — the posted fuel price list (red
    // header band + three illegible price rows; fills the bare planks
    // below the shelf with something a real АЗС would actually post)
    var tx = x + 6, ty = wy + wh + 7, tw = 14, th = 11;
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
    ctx.fillStyle = BLD.cream;
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = BLD.redDark;
    ctx.fillRect(tx, ty, tw, 3);
    ctx.fillStyle = BLD.redBright;
    ctx.fillRect(tx + 1, ty + 1, 4, 1);
    ctx.fillStyle = BLD.stoneDark;                 // price rows
    ctx.fillRect(tx + 1, ty + 5, 8, 1);
    ctx.fillRect(tx + 11, ty + 5, 2, 1);
    ctx.fillRect(tx + 1, ty + 7, 6, 1);
    ctx.fillRect(tx + 11, ty + 7, 2, 1);
    ctx.fillRect(tx + 1, ty + 9, 7, 1);
    ctx.fillRect(tx + 11, ty + 9, 2, 1);
  }

  // Flat modernist canopy slab — thin iron roof sheet over a deep fascia
  // band that carries the ЗАПРАВКА board (inset flush, not floating above).
  // The classic Soviet АЗС silhouette: one slab, one column, the booth
  // holding up the other end.
  function drawDepotCanopy(x, y, w, signCx) {
    var slabH = 3, fasciaH = 15;
    var h = slabH + fasciaH;
    // Outline around the whole slab
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    // Thin iron roof sheet, sun-catch on the top rim
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(x, y, w, slabH);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x, y, w, 1);
    // Standing seams along the sheet
    ctx.fillStyle = BLD.metalDark;
    for (var ssx = x + 10; ssx < x + w - 4; ssx += 14) ctx.fillRect(ssx, y + 1, 1, slabH - 1);
    // Deep fascia band — kept CLEAN (corrugation ticks read as barcode
    // noise at game zoom; the station taught us flat canonical wins)
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(x, y + slabH, w, fasciaH);
    ctx.fillStyle = BLD.metalBase;                 // seam where sheet meets fascia
    ctx.fillRect(x, y + slabH, w, 1);
    // Bolt specs at the slab ends
    ctx.fillStyle = BLD.metalPale;
    ctx.fillRect(x + 2, y + slabH + 2, 1, 1);
    ctx.fillRect(x + w - 3, y + slabH + 2, 1, 1);
    // ЗАПРАВКА board inset flush in the fascia
    drawSignBoard(signCx - 44, y + slabH + 1, 88, 13, '★ ЗАПРАВКА ★');
  }


  // ----- The surface station (the "shop") -----
  // ---- v11.84 — Town structure sprite cache --------------------------------
  // The Earth town's three structures (КОМЕНДАТУРА station, open-air stone
  // fireplace, ЗАПРАВКА fuel depot) were each rebuilt from ~40-50 canvas
  // primitives on EVERY frame, even though they sit at fixed world positions
  // and only the camera scrolls past them. That overdraw made the town the
  // last sub-90fps spot on Android. Each structure is now rendered once into
  // an offscreen canvas and blitted as a single sprite. The sprite re-renders
  // only when the zoom scale changes or a capped ~20fps animation tick
  // advances (antenna blink, hearth flame, lamp flicker, pump readout), and
  // the three rebuilds are phase-staggered so they never land on one frame.
  var TOWN_ANIM_FPS = 20;
  var townStructureCaches = {};
  function drawCachedStructure(id, phaseMs, ax, ay, aw, ah, dynKey, contentFn) {
    // Cull on the world-space bounding box — skip blit + rebuild entirely.
    if (ax + aw < cam.x || ax > cam.x + screenW) return;
    if (ay + ah < cam.y || ay > cam.y + screenH) return;
    var ws = dpr * worldScale;
    var cw = Math.max(1, Math.ceil(aw * ws));
    var ch = Math.max(1, Math.ceil(ah * ws));
    var animFrame = Math.floor((performance.now() + phaseMs) * TOWN_ANIM_FPS / 1000);
    var key = Math.round(ws * 256) + '|' + animFrame + '|' + dynKey;
    var slot = townStructureCaches[id];
    if (!slot) {
      slot = townStructureCaches[id] = { canvas: document.createElement('canvas'), cctx: null, key: '' };
      slot.cctx = slot.canvas.getContext('2d');
    }
    if (slot.key !== key || slot.canvas.width !== cw || slot.canvas.height !== ch) {
      if (slot.canvas.width !== cw) slot.canvas.width = cw;
      if (slot.canvas.height !== ch) slot.canvas.height = ch;
      var cctx = slot.cctx;
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.clearRect(0, 0, cw, ch);
      // Map world coords -> cache pixels: the AABB top-left lands at the cache
      // origin, scaled to device-pixel resolution (ws) so the sprite blits
      // 1:1 with no resample blur. Content fns draw in their normal world
      // coords; the transform shifts + scales them into the cache.
      cctx.setTransform(ws, 0, 0, ws, -ax * ws, -ay * ws);
      cctx.imageSmoothingEnabled = true;
      var oldCtx = ctx;
      ctx = cctx;
      // Hardened (v24.81): a buggy content fn must never abort the frame or leave
      // the global ctx pointing at this offscreen cache (which renders the whole
      // rest of the frame off-screen = a black screen). Swallow + ALWAYS restore
      // ctx; the attempt is still cached so it can't re-throw every frame.
      try { contentFn(); }
      catch (eStruct) { if (typeof devMode !== 'undefined' && devMode) console.error('cached structure "' + id + '" draw error:', eStruct); }
      finally { ctx = oldCtx; }
      slot.key = key;
    }
    // Blit under the active world transform. Dest size = cache px / ws, so the
    // sprite's internal ws-scaling cancels the transform's ws-scaling -> 1:1.
    ctx.drawImage(slot.canvas, ax, ay, cw / ws, ch / ws);
  }

  // v11.84 — `drawStation` is a thin caching wrapper; the primitive draw
  // lives in drawStationContent (cached via drawCachedStructure above).
  function drawStation(ti) {
    if (ti == null) ti = 0;
    var cx = townStationCol(ti) * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;
    var savedBLD = BLD;
    BLD = TOWN_BLD[ti] || savedBLD;
    drawCachedStructure('station' + ti, 0,
      cx - 74, groundY - 114, 148, 122,
      'd' + Math.round((shopDoorT || 0) * 32) + 't' + ti,
      function () { drawStationContent(ti); });
    BLD = savedBLD;
  }
  function drawStationContent(ti) {
    if (ti == null) ti = 0;
    // КОМЕНДАТУРА — old Western false-front saloon repurposed as a Soviet
    // commandant's office. See helpers above for the visual vocabulary.
    //
    // Building bounds (world px, anchored to ground):
    //   y = groundY-86 .. groundY-46   false-front facade (arched top, sign mid)
    //   y = groundY-52 .. groundY-46   porch awning (overhangs the body)
    //   y = groundY-46 .. groundY-8    wooden body (posters + double door)
    //   y = groundY-8  .. groundY      stone foundation
    // Width: 88 px body; awning + foundation extend a few px past.
    var cx = townStationCol(ti) * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;

    var bx = cx - 48;
    var W = 96;
    var by = groundY - 86;     // top of arched facade
    var t = performance.now() / 1000;

    // Ground-cast shadow under the foundation
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(bx - 8, groundY - 3, W + 16, 5);

    // Smokestack + antenna BEHIND the facade (drawn first so the facade overlaps)
    // Station smokestack still draws (silhouette stays) but no longer
    // emits — the open-air fireplace is the compound's only active smoke
    // source now. Pass `true` to re-enable.
    drawSmokestack(bx + W - 18, by - 4, 5, 18, false);
    drawAntenna(bx + 14, by + 4, 22, t);

    // ----- False-front facade (arched top, plank body) -----
    var fx = bx + 4, fy = by, fw = W - 8, fh = 40;
    fillArchedFacade(fx, fy, fw, fh, 8);

    // Inner trim border (darker rim 2 px inside the silhouette)
    ctx.fillStyle = BLD.woodDeep;
    ctx.fillRect(fx + 2, fy + 11, fw - 4, 1);                       // top inner trim
    ctx.fillRect(fx + 2, fy + fh - 3, fw - 4, 1);                   // bottom inner trim
    ctx.fillRect(fx + 2, fy + 11, 1, fh - 14);                      // left inner
    ctx.fillRect(fx + fw - 3, fy + 11, 1, fh - 14);                 // right inner

    // Red star centered above the sign on the arch
    drawRedStar(fx + fw / 2, fy + 7, 5, 0);

    // Gold sign board with КОМЕНДАТУРА
    var sx = fx + 6, sy = fy + 20, sw = fw - 12, sh = 13;
    drawSignBoard(sx, sy, sw, sh, 'КОМЕНДАТУРА');

    // ----- Wood body (under the facade, behind the awning) -----
    drawWoodPlanking(bx + 2, by + fh, W - 4, 38, 6);

    // ----- Porch awning (slightly wider than body, metal cap on top) -----
    var awnX = bx - 2, awnY = by + fh, awnW = W + 4, awnH = 6;
    drawPorchAwning(awnX, awnY, awnW, awnH);
    // Awning support posts at each end
    var postH = groundY - (awnY + awnH);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(awnX + 1, awnY + awnH, 2, postH);
    ctx.fillRect(awnX + awnW - 3, awnY + awnH, 2, postH);
    ctx.fillStyle = BLD.woodDark;
    ctx.fillRect(awnX + 1, awnY + awnH, 1, postH);
    ctx.fillRect(awnX + awnW - 3, awnY + awnH, 1, postH);

    // ----- Double doors (center) -----
    var doorW = 18, doorH = 26;
    var doorX = bx + Math.floor(W / 2) - Math.floor(doorW / 2);
    var doorY = groundY - 8 - doorH;
    drawDoubleDoor(doorX, doorY, doorW, doorH, t, shopDoorT);

    // ----- Propaganda posters flanking the door -----
    var pW = 16, pH = 18;
    var pY = groundY - 8 - pH - 2;
    drawPropagandaPoster(bx + 10, pY, pW, pH, 'star');
    drawPropagandaPoster(bx + W - 10 - pW, pY, pW, pH, 'face');

    // ----- Hanging oil lamp under the awning, just left of the door -----
    drawOilLamp(doorX - 6, awnY + awnH + 2, t);

    // ----- Stone foundation under the station only (compound is disabled). -----
    drawStoneFoundation(bx - 4, groundY - 8, W + 8, 8);

    // ----- Subtle rust streaks down the facade -----
    drawRustStreak(bx + 20, by + 12, by + fh - 4, 0.30);
    drawRustStreak(bx + W - 24, by + 16, by + fh - 8, 0.24);

    // ----- Decor: oil drum + crate on the left side only -----
    // Right-side decor removed so the fuel depot (now to the right of the
    // station) has the 2-tile clearance required by BUILDING_STYLE §15.
    drawCrate(bx - 14, groundY - 7, 7, 7);
    drawOilDrum(bx - 22, groundY - 8);
  }

  // Open-air stone fireplace BETWEEN the КОМЕНДАТУРА station and the
  // gas-station depot — Frontier Soviet outdoor smoking spot, occupying
  // the slot previously held by the windsock tower.
  // Tall stacked-stone chimney bound with rust-red iron straps, arched
  // firebox with animated flames, wood-log stack and iron fire tools at
  // the base, two wooden chairs flanking it for the crew to sit and warm
  // up. Emits real wood smoke from the chimney top. Drawn as its own
  // top-level render call (not nested in drawStation) so the station's
  // cull doesn't take it off when the player drives far right.
  function drawSurfaceFireplace() {
    var cx = stationCenterCol() * TILE + TILE / 2 + 150;
    var groundY = DECK_ROW * TILE;
    drawCachedStructure('fireplace', 17,
      cx - 42, groundY - 106, 84, 114, '',
      drawSurfaceFireplaceContent);
  }
  function drawSurfaceFireplaceContent() {
    var cs = stationCenterCol() * TILE + TILE / 2;
    var cx = cs + 150;                              // between station + depot, 65 px from station, 75 px from depot canopy
    var groundY = DECK_ROW * TILE;
    var t = performance.now() / 1000;

    // Geometry (bottom-up): hearth → mantle → chimney → corbel → iron cap.
    var hearthW = 28, hearthH = 22;
    var mantleW = 36, mantleH = 6;
    var chimneyW = 14, chimneyH = 60;
    var corbelW = 20, corbelH = 4;
    var capW = 24, capH = 8;
    var hearthX = cx - Math.floor(hearthW / 2);
    var hearthY = groundY - hearthH;
    var mantleX = cx - Math.floor(mantleW / 2);
    var mantleY = hearthY - mantleH;
    var chimneyX = cx - Math.floor(chimneyW / 2);
    var chimneyY = mantleY - chimneyH;
    var corbelX = cx - Math.floor(corbelW / 2);
    var corbelY = chimneyY - corbelH;
    var capX = cx - Math.floor(capW / 2);
    var capY = corbelY - capH;

    // Ground shadow under the hearth
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(hearthX - 4, groundY - 2, hearthW + 8, 4);

    // ----- Chimney (stacked irregular stones — brick-offset rows) -----
    drawStackedStoneColumn(chimneyX, chimneyY, chimneyW, chimneyH);

    // ----- Mantle (wider transition slab where the chimney meets the hearth) -----
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(mantleX, mantleY, mantleW, mantleH);
    ctx.fillStyle = BLD.stoneBase;
    ctx.fillRect(mantleX + 1, mantleY + 1, mantleW - 2, mantleH - 2);
    ctx.fillStyle = BLD.stoneLight;
    ctx.fillRect(mantleX + 1, mantleY + 1, mantleW - 2, 1);
    // Mantle vent slots — three small dark openings centered on the front
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(mantleX + Math.floor(mantleW / 2) - 4, mantleY + 3, 1, 2);
    ctx.fillRect(mantleX + Math.floor(mantleW / 2) - 1, mantleY + 3, 1, 2);
    ctx.fillRect(mantleX + Math.floor(mantleW / 2) + 2, mantleY + 3, 1, 2);

    // ----- Hearth (stacked stone, slightly chunkier than the chimney) -----
    drawStackedStoneColumn(hearthX, hearthY, hearthW, hearthH);

    // ----- Stone corbel (flared crown between chimney and iron cap) -----
    drawStoneCorbel(corbelX, corbelY, corbelW, corbelH);

    // ----- Rust-red iron bands (bolt the stone column together) -----
    drawRustyIronBand(chimneyX - 1, chimneyY + 12, chimneyW + 2, 3);
    drawRustyIronBand(chimneyX - 1, chimneyY + chimneyH - 22, chimneyW + 2, 3);
    drawRustyIronBand(mantleX - 1, mantleY - 2, mantleW + 2, 3);

    // ----- Iron cap (vented grille) -----
    // Two-row vent slot design + corner bolts + center bolt. The cap sits
    // ON the stone corbel, so it reads as a removable iron lid bolted to
    // the chimney crown rather than part of the masonry.
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(capX, capY, capW, capH);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(capX + 1, capY + 1, capW - 2, capH - 2);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(capX + 1, capY + 1, capW - 2, 1);   // top edge highlight
    ctx.fillStyle = BLD.metalDark;
    ctx.fillRect(capX + 1, capY + capH - 2, capW - 2, 1);  // bottom shadow
    // Slot vents (3 horizontal openings)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(capX + 3, capY + 3, capW - 6, 1);
    ctx.fillRect(capX + 3, capY + 5, capW - 6, 1);
    // Corner + center bolts on the top edge
    ctx.fillStyle = BLD.metalPale;
    ctx.fillRect(capX + 2, capY + 1, 1, 1);
    ctx.fillRect(capX + capW - 3, capY + 1, 1, 1);
    ctx.fillRect(capX + Math.floor(capW / 2), capY + 1, 1, 1);

    // ----- Firebox opening (arched cavity carved into the hearth) -----
    var fbW = 18, fbH = 14;
    var fbX = cx - Math.floor(fbW / 2);
    var fbY = hearthY + hearthH - fbH - 1;
    // Dark interior cavity
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(fbX, fbY, fbW, fbH);
    // Arch edges (rounded top via corner pixel kept off)
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(fbX, fbY + 1, 1, fbH - 1);
    ctx.fillRect(fbX + fbW - 1, fbY + 1, 1, fbH - 1);
    ctx.fillRect(fbX + 1, fbY, fbW - 2, 1);
    ctx.fillRect(fbX + 1, fbY + 1, 1, 1);
    ctx.fillRect(fbX + fbW - 2, fbY + 1, 1, 1);
    // Animated flames
    drawHearthFire(fbX + 2, fbY + 2, fbW - 4, fbH - 4, t);
    // Iron grate across the bottom of the firebox
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(fbX, fbY + fbH - 3, fbW, 1);
    ctx.fillRect(fbX, fbY + fbH - 1, fbW, 1);
    for (var gx = fbX + 1; gx < fbX + fbW; gx += 2) {
      ctx.fillRect(gx, fbY + fbH - 3, 1, 3);
    }

    // ----- Wood log stack (LEFT of hearth, on the ground) -----
    // 2 logs on the bottom row + 1 stacked on top — small pyramid pile
    var logBaseY = groundY - 4;
    var logStackX = hearthX - 9;
    drawLogEnd(logStackX, logBaseY);
    drawLogEnd(logStackX + 5, logBaseY);
    drawLogEnd(logStackX + 2, logBaseY - 4);

    // ----- Fire tools (RIGHT of hearth) — poker + shovel leaning together -----
    var toolX = hearthX + hearthW + 1;
    // Poker — vertical iron rod with hook top
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(toolX, groundY - 14, 1, 14);
    ctx.fillRect(toolX, groundY - 15, 3, 1);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(toolX, groundY - 11, 1, 7);
    // Shovel — angled rod, T-handle, flat scoop at the bottom
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(toolX + 2, groundY - 14, 1, 14);
    ctx.fillRect(toolX + 2, groundY - 16, 3, 2);
    ctx.fillRect(toolX + 2, groundY - 3, 3, 3);
    ctx.fillStyle = BLD.metalBase;
    ctx.fillRect(toolX + 3, groundY - 2, 1, 1);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(toolX + 2, groundY - 11, 1, 7);

    // ----- Chairs flanking the fireplace -----
    drawChair(hearthX - 23, groundY);
    drawChair(hearthX + hearthW + 7, groundY);

    // v11.46 — Wood-smoke emission moved out to tickFireplaceSmoke()
    // which runs every frame from render() regardless of whether the
    // chimney is on screen. So smoke keeps flowing into the fluid sim
    // when the player drives away.
  }

  // v11.46 — ALWAYS-ON fireplace smoke emission. Called every frame
  // from render, NOT gated by drawSurfaceFireplace's on-screen cull.
  // The fluid sim's domain is now wide enough (overscan 1.6) that the
  // chimney is in the simulation domain from anywhere on the surface,
  // so smoke continuously emits and persists in the sim while the
  // player is away.
  function emitFireplaceSmokeUnit() {
    var FT = fireplaceTune;
    if (!FT || !FT.enabled || !smokeFluidActive || gameOver || gameWon) return;
    // Chimney world coords (mirror drawSurfaceFireplace geometry)
    var cs = stationCenterCol() * TILE + TILE / 2;
    var cx = cs + 150;
    var groundY = DECK_ROW * TILE;
    var hearthH = 22, mantleH = 6, chimneyH = 60, corbelH = 4, capH = 8;
    var capY = groundY - hearthH - mantleH - chimneyH - corbelH - capH;
    var t = performance.now() / 1000;

    var euv = smokeFluidWorldToUV(cx, capY - 2);
    if (!euv.inView) return;   // out of fluid domain — sim can't hold smoke here
    smokeMarkActive();   // v23.32 — chimney is emitting dye; keep the idle-skipped sim awake

    var pulse = 1 - FT.pulse_depth + FT.pulse_depth *
                (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * FT.pulse_rate));
    var sway = Math.sin(t * 2 * Math.PI * FT.sway_freq) * FT.sway_amp;
    var chimneyWind = surfaceWind ? surfaceWind.current : 0;
    var windAbs = Math.abs(chimneyWind);
    var windFloor = WIND_CALM * 1.5;
    var windCeil = Math.max(windFloor + 0.001, WIND_GUST);
    var windK = Math.max(0, Math.min(1, (windAbs - windFloor) / (windCeil - windFloor)));
    var windSmokeK = Math.sqrt(windK);
    var windWhiteK = windSmokeK * (0.25 + windSmokeK * 0.75);
    var windSide = chimneyWind * windSmokeK * (1.0 + windSmokeK * 1.4);
    var windVolume = 1 + windSmokeK * 1.25;
    var windRadius = 1 + windSmokeK * 1.55;
    var windRise = 1 + windSmokeK * 0.35;
    var jr = (Math.random() - 0.5) * 2 * FT.color_jitter;
    var jg = (Math.random() - 0.5) * 2 * FT.color_jitter;
    var jb = (Math.random() - 0.5) * 2 * FT.color_jitter;
    var baseR = Math.max(0, FT.color_r + jr);
    var baseG = Math.max(0, FT.color_g + jg);
    var baseB = Math.max(0, FT.color_b + jb);
    var dyeCap = 0.026;
    var col = {
      r: Math.min(dyeCap, (baseR + (0.0114 - baseR) * windWhiteK) * pulse * windVolume),
      g: Math.min(dyeCap, (baseG + (0.0118 - baseG) * windWhiteK) * pulse * windVolume),
      b: Math.min(dyeCap, (baseB + (0.0126 - baseB) * windWhiteK) * pulse * windVolume),
    };
    smokeDriver.splat(euv.uvX, euv.uvY, sway + windSide, FT.velY * pulse * windRise, col, FT.radius * windRadius);
    // v11.87 — mobile fireplace: one splat per emit unit. Every splat is a
    // full GPU pass over the dye field; the desktop plume's wind-shed (1-2),
    // bloom and buoyancy splats 3-5x that cost — emitted continuously, that
    // was the ~11ms that dragged the town to 40fps on Android. The single
    // main splat still reads as a chimney plume once the sim advects it up.
    if (isMobile) return;
    if (windSmokeK > 0.03) {
      var extraCount = windSmokeK > 0.72 ? 2 : 1;
      for (var wi = 0; wi < extraCount; wi++) {
        var extraLift = 3 + wi * (5 + windSmokeK * 6) + Math.random() * 3;
        var extraSide = chimneyWind * (0.55 + wi * 1.15) + (Math.random() - 0.5) * (2.5 + windSmokeK * 4);
        var xuv = smokeFluidWorldToUV(cx + extraSide, capY - 2 - extraLift);
        if (xuv.inView) {
          var extraAmt = (0.34 + windSmokeK * 0.52) * (wi ? 0.76 : 1);
          var xcol = {
            r: Math.min(dyeCap, col.r * extraAmt + 0.0032 * windSmokeK),
            g: Math.min(dyeCap, col.g * extraAmt + 0.0036 * windSmokeK),
            b: Math.min(dyeCap, col.b * extraAmt + 0.0042 * windSmokeK),
          };
          smokeDriver.splat(
            xuv.uvX, xuv.uvY,
            sway * 0.35 + windSide * (1.25 + wi * 0.35),
            FT.velY * pulse * windRise * (0.58 + wi * 0.14),
            xcol,
            FT.radius * (0.95 + windSmokeK * 1.65 + wi * 0.35)
          );
        }
      }
    }
    if (FT.bloom_enabled) {
      var beuv = smokeFluidWorldToUV(cx, capY - 2 - FT.bloom_lift);
      if (beuv.inView) {
        var bloomWind = 1 + windSmokeK * 1.45;
        var bcol = {
          r: Math.min(dyeCap, col.r * FT.bloom_amount * bloomWind),
          g: Math.min(dyeCap, col.g * FT.bloom_amount * bloomWind),
          b: Math.min(dyeCap, col.b * FT.bloom_amount * bloomWind),
        };
        smokeDriver.splat(beuv.uvX, beuv.uvY, sway * 0.6 + windSide * 1.15, FT.bloom_velY * pulse * windRise, bcol, FT.bloom_radius * (1 + windSmokeK * 1.55));
      }
    }
    if (FT.buoyancy_enabled && FT.buoyancy_strength > 0) {
      smokeDriver.splat(
        euv.uvX, euv.uvY,
        windSide * 0.35, FT.buoyancy_strength * (1 + windSmokeK * 0.95),
        { r: 0, g: 0, b: 0 },
        FT.buoyancy_radius * (1 + windSmokeK * 1.45)
      );
    }
  }

  // v11.58 — Frame-rate-independent fireplace emission. The plume is built
  // from discrete per-call splats, so emitting exactly once per frame made
  // a 30 fps phone build only half the smoke of a 60 fps iPhone. Pace
  // emission off real elapsed time instead — ~60 units/sec on any device.
  var smokeFireplaceEmitAccum = 0;
  var smokeFireplaceLastT = 0;
  function tickFireplaceSmoke() {
    var FT = fireplaceTune;
    if (!FT || !FT.enabled || !smokeFluidActive || gameOver || gameWon) {
      smokeFireplaceLastT = 0;
      return;
    }
    var nowMs = performance.now();
    var fdt = smokeFireplaceLastT ? (nowMs - smokeFireplaceLastT) / 1000 : 1 / 60;
    smokeFireplaceLastT = nowMs;
    if (fdt > 0.1) fdt = 0.1;          // ignore tab-away / hitch spikes
    smokeFireplaceEmitAccum += fdt * 60;
    var steps = Math.floor(smokeFireplaceEmitAccum);
    smokeFireplaceEmitAccum -= steps;
    if (steps > 4) steps = 4;          // clamp catch-up burst
    for (var i = 0; i < steps; i++) emitFireplaceSmokeUnit();
  }


  // ----- Frontier Soviet gas station (refuel + auto-deposit) -----
  // ONE unified gas-station silhouette: a wide flat canopy over a small
  // pump island, with the parking zone clearly marked in the middle.
  // The fuel pump (left) and payout terminal (right) double as canopy
  // supports — keeps the whole installation visually integrated instead
  // of reading as two separate machines.
  //
  // Layout (88 wide × ~80 tall):
  //   ╔═══════════════════════╗   sign on canopy
  //   ╠═══════════════════════╣   canopy (red-trimmed)
  //   ║      ⬇ chevron       ║   bobbing parking marker, hanging lamp
  //   ⛽   |───park here───|   📦   pump | parking pad | payout terminal
  //   ─── hazard-striped pad ───
  //
  // The pumpPadRect hit zone sits exactly under the parking arrow so the
  // player can see where to drive. Refuel + auto-deposit both arm here.
  // v25.37 — restored the ORIGINAL pre-depot gas station VERBATIM from the
  // archived alpha history (v24.138, commit a5f2d12: the exact code the
  // v24.139 ЗАПРАВКА depot v2 replaced). The owner preferred this simpler
  // bay: a "floating" wood-shelf canopy on two iron posts over a spaced pump
  // + pay-out terminal, sky showing through the gaps, hanging oil lamp +
  // REFUEL · DEPOSIT under the shelf. The v2 depot helpers (drawDepotCanopy /
  // drawCashBooth / drawFuelTank) stay defined as cold storage. Hit zone
  // (pumpPadRect) untouched — refuel + auto-deposit still arm there.
  function drawPumpPad() {
    var pad = pumpPadRect();
    var groundY = DECK_ROW * TILE;
    var depotX = pad.x - 40;     // leftPostX — innerGap+pumpW+outerGap+postW left of the pad
    var W = pad.w + 80;          // postW+outerGap+pumpW+innerGap + pad + innerGap+termW+outerGap+postW
    drawCachedStructure('pumppad', 33,
      depotX - 18, groundY - 86, W + 36, 94,
      (playerOnPumpPad() ? '1' : '0') + (player.refueling ? '1' : '0'),
      drawPumpPadContent);
  }
  function drawPumpPadContent() {
    var pad = pumpPadRect();
    var groundY = DECK_ROW * TILE;
    var t = performance.now() / 1000;
    var active = playerOnPumpPad();

    // Layout — components are SPACED (not packed) so the gas-station bay
    // reads as open. Sky shows through inter-component gaps which sells
    // the drive-up feel:
    //   leftPost(6) → 8 gap → pump(16) → 10 gap → pad(64) → 10 gap → terminal(16) → 8 gap → rightPost(6)
    var pumpW = 16;
    var termW = 16;
    var postW = 6;
    var innerGap = 10;
    var outerGap = 8;
    var pumpX = pad.x - innerGap - pumpW;
    var termX = pad.x + pad.w + innerGap;
    var leftPostX = pumpX - outerGap - postW;
    var rightPostX = termX + termW + outerGap;
    var depotX = leftPostX;
    var W = (rightPostX + postW) - leftPostX;     // 6+8+16+10+64+10+16+8+6 = 144
    var padCenterX = pad.x + pad.w / 2;

    var canopyY = groundY - 64;
    var canopyH = 12;
    var postH = groundY - canopyY;                 // posts run from canopy to ground

    // ---------- Support posts (drawn FIRST so canopy overlaps them at the top) ----------
    drawSupportPost(leftPostX + postW / 2, groundY, postH);
    drawSupportPost(rightPostX + postW / 2, groundY, postH);

    // ---------- Old-school fuel pump (left of pad, with 10 px gap) ----------
    drawFuelPump(pumpX, groundY, t, active);

    // ---------- Payout terminal (right of pad, with 10 px gap) ----------
    drawPayoutTerminal(termX, groundY, t, active);

    // ---------- Parking pad — hazard-striped floor only, no stone base ----------
    drawHazardStripes(pad.x, groundY - 4, pad.w, 4, t, active);
    // Iron rails along the pad top + sides
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(pad.x, groundY - 5, pad.w, 1);
    ctx.fillRect(pad.x, groundY - 4, 1, 4);
    ctx.fillRect(pad.x + pad.w - 1, groundY - 4, 1, 4);
    // Soft warm wash inside the parking zone when active
    if (active) {
      var glow = ctx.createLinearGradient(0, groundY - 24, 0, groundY);
      glow.addColorStop(0, 'rgba(251,197,90,0)');
      glow.addColorStop(1, 'rgba(251,197,90,0.32)');
      ctx.fillStyle = glow;
      ctx.fillRect(pad.x, groundY - 24, pad.w, 24);
    }

    // ---------- Canopy — overhangs the posts by 8 px each side ----------
    var canopyOverhang = 8;
    var canopyX = depotX - canopyOverhang;
    var canopyW = W + canopyOverhang * 2;          // 144 + 16 = 160
    drawCanopy(canopyX, canopyY, canopyW, canopyH);

    // ---------- Sign on top of the canopy ----------
    var signW = 88, signH = 13;
    var signX = Math.floor(padCenterX - signW / 2);
    var signY = canopyY - signH - 2;
    drawSignBoard(signX, signY, signW, signH, '★ ЗАПРАВКА ★');
    // English subtitle — anchor the centered "·" exactly at padCenterX so
    // it lines up under the hanging lamp. "REFUEL" (6 chars) and "DEPOSIT"
    // (7 chars) have unequal widths, so a plain `textAlign:'center'` would
    // push the dot a couple of px off-center.
    ctx.font = 'bold 5px ' + UI_FONT;
    ctx.fillStyle = BLD.cream;
    ctx.textAlign = 'left';
    var leftWidth = ctx.measureText('REFUEL ').width;
    var dotWidth = ctx.measureText('·').width;
    var subStartX = padCenterX - leftWidth - dotWidth / 2;
    ctx.fillText('REFUEL · DEPOSIT', subStartX, canopyY + canopyH + 8);

    // ---------- Hanging lamp directly above the "·" between the words ----------
    drawOilLamp(padCenterX, canopyY + canopyH + 4, t);

    // ---------- Bobbing parking arrow above the pad ----------
    drawParkingArrow(padCenterX, groundY - 8, t, active);

    // ---------- Refuel particles when actively refueling ----------
    if (player.refueling) {
      for (var pi = 0; pi < 3; pi++) {
        var pxp = player.x + PLAYER_W / 2 + (Math.random() - 0.5) * 8;
        var pyp = player.y + PLAYER_H * 0.5 + Math.random() * 6 - 4;
        ctx.fillStyle = 'rgba(120,255,180,' + (0.4 + Math.random() * 0.4).toFixed(2) + ')';
        ctx.fillRect(pxp, pyp, 1.5, 1.5);
      }
    }
  }

  // Reusable UI font (defined near constants at top)

