  /* ---- Init ---- */

  // ----- Dev slime test pen (dev mode only) -----
  // An open-top pen ABOVE GROUND, a short fly LEFT of spawn: a stone platform on
  // the surface with two stone walls rising out of it, and a row of tile-sized
  // jello blobs sitting on top between them. Every blob is the SAME one-tile size
  // and the SAME default 'slime' physics, so they all interact identically, but
  // each is dressed as a wildly different MATERIAL via per-body render overrides:
  // hue, saturation, brightness, translucency, refraction (glassiness), shimmer
  // (inner caustics), gloss (sheen + glint), and rim (Fresnel edge glow). The
  // sim never sees these; only jelloDrawBody reads them. Auto-activated on spawn
  // so they are live + vivid the moment you arrive. Dev-only; never in normal
  // play. Toggle dev with ` then press R to regenerate.
  function injectJelloTestPen() {
    function setTile(rr, cc, t) {
      if (rr >= 0 && rr < TOTAL_ROWS && cc >= 0 && cc < COLS && world[rr]) world[rr][cc] = t;
    }
    function stone() { return { type: 'stone', hp: ORES.stone.hp }; }
    // Each entry is ONE slime's material: a distinct look, identical physics.
    // sat = saturation x, light = lightness offset (% pts), alpha = opacity,
    // refract = glassy lens, shimmer = inner caustics, gloss = sheen + glint,
    // rim = Fresnel edge glow. (Defaults if omitted: see jelloDrawBody.)
    var MATS = [
      { name: 'candy',    hue:   0, sat: 1.15, light:   4, alpha: 0.96, refract: 0.04, shimmer: 0.10, gloss: 1.7, rim: 0.9 },  // hard glossy cherry candy
      { name: 'frost',    hue: 150, sat: 0.50, light:  24, alpha: 0.92, refract: 0.00, shimmer: 0.05, gloss: 0.12, rim: 0.25 }, // pale matte frosted sugar
      { name: 'glass',    hue: 190, sat: 0.70, light:  10, alpha: 0.30, refract: 0.32, shimmer: 0.12, gloss: 0.7, rim: 1.3 },   // clear refractive crystal
      { name: 'chrome',   hue: 250, sat: 0.32, light:   6, alpha: 0.98, refract: 0.06, shimmer: 0.28, gloss: 1.8, rim: 1.0 },   // liquid-metal mirror sheen
      { name: 'neon',     hue: 110, sat: 1.50, light:   8, alpha: 0.72, refract: 0.08, shimmer: 0.42, gloss: 0.9, rim: 1.7 },   // electric glowing-edge neon
      { name: 'pearl',    hue:  32, sat: 0.85, light:  16, alpha: 0.85, refract: 0.14, shimmer: 0.75, gloss: 1.0, rim: 0.6 },   // iridescent pearlescent
      { name: 'gummy',    hue:  40, sat: 1.25, light:  -2, alpha: 0.58, refract: 0.18, shimmer: 0.12, gloss: 0.7, rim: 0.5 },   // classic translucent gummy
      { name: 'hologram', hue: 300, sat: 1.10, light:   6, alpha: 0.78, refract: 0.28, shimmer: 0.95, gloss: 1.4, rim: 1.1 }    // oil-slick holographic
    ];
    var N = MATS.length;
    var gap = 1, margin = 2;                    // air between blobs / from the walls
    var interiorW = margin * 2 + N + (N - 1) * gap;
    var penR = DECK_LEFT_COL - 8;              // interior right edge (short fly left of spawn)
    var penL = penR - (interiorW - 1);         // interior left edge
    var wallL = penL - 1, wallR = penR + 1;    // the two containing walls
    var floorRow = SKY_ROWS;                    // stone platform AT the surface
    var blobRow = floorRow - 1;                // blobs sit ON the platform, above ground
    var wallTop = floorRow - 5;                // walls rise 5 tiles above the platform
    // Drop any peppered surface pond overlapping the pen so the streaming water
    // sim never floods it (the pen sits just left of the deck-clear zone).
    for (var sp = surfacePonds.length - 1; sp >= 0; sp--) {
      var P = surfacePonds[sp];
      if (!(P.cR < wallL || P.cL > wallR)) surfacePonds.splice(sp, 1);
    }
    // Clear the above-ground interior (sky already, but be safe), lay the stone
    // platform, then raise the two walls out of it. Open top.
    for (var r = wallTop; r < floorRow; r++) {
      for (var c = penL; c <= penR; c++) setTile(r, c, null);
    }
    for (var fc = wallL; fc <= wallR; fc++) setTile(floorRow, fc, stone());
    for (var wr = wallTop; wr <= floorRow; wr++) { setTile(wr, wallL, stone()); setTile(wr, wallR, stone()); }
    // Above ground: one tile-sized blob per material, auto-activated so it is
    // live + vivid on spawn. The material rides on the tile (jelloMat); activation
    // copies it onto the body, so the SAME path also dresses the buried slimes
    // below. jellyType stays 'slime' so the SIM is identical across all of them.
    for (var i = 0; i < N; i++) {
      var bc = penL + margin + i * (gap + 1);
      setTile(blobRow, bc, { type: 'jello', jellyType: 'slime', hp: 999999, jelloMat: MATS[i] });
      activateJelloCluster(blobRow, bc);
    }
    // A few BURIED material-slimes 5 blocks below the platform: dig straight down
    // from the pen to expose them. They are NOT pre-activated, so they sit as
    // plain jello tiles until you mine beside one, then wake KEEPING their
    // material (the jelloMat the tile carries). Spread across the pen, 2 apart.
    var ugRow = SKY_ROWS + 5;
    var ugMats = [MATS[0], MATS[2], MATS[3], MATS[4], MATS[7]];  // candy, glass, chrome, neon, hologram
    for (var u = 0; u < ugMats.length; u++) {
      setTile(ugRow, penL + 3 + u * 3, { type: 'jello', jellyType: 'slime', hp: 999999, jelloMat: ugMats[u] });
    }
  }

  function init() {
    liquidParticles = [];
    liquidCount = 0;
    liquidOps.length = 0;          // v24.109 — stale mutation ops die with the old world
    liquidOpsOverflow = false;
    // v24.109 — force the GPU to re-sync to the (now empty) particle set on
    // the next frame. Without this the resident GPU buffers kept simulating
    // and drawing the OLD world's water after a restart until the first
    // add/remove happened to bump the seq.
    liquidMutationSeq++;
    liquidGridCount = 0;
    liquidSurfacePools = { water: null, oil: null };
    surfacePondBasins = [];
    liquidHashFrame++;
    if (liquidHashFrame === 0 || liquidHashFrame > 2000000000) {
      liquidHashStamp.fill(0);
      liquidHashFrame = 1;
    }
    oilGallons = 0;
    oilSuckFx = [];
    oilTankWarnTimer = 0;
    // Reset the day/night cycle so every run starts at the same time of day.
    // The ?tod= boot lever (020) wins when present — screenshot harnesses
    // need the override to survive this reset.
    timeOfDay = (TOD_BOOT >= 0) ? TOD_BOOT : TIME_OF_DAY_START;
    moonPhase = MOON_PHASE_START;
    generateWorld();
    // Dev-only: a small two-wall pen of vibrant tile-sized test slimes a short
    // fly LEFT of spawn (never injected in normal play). Carve BEFORE
    // lightingInit so the opening gets lit. Toggle dev with ` then press R.
    if (devMode) injectJelloTestPen();
    lightingInit();              // seed fog-of-war from the open sky (185-lighting.js)
    terrainChunkCache = {};
    terrainChunkCount = 0;
    terrainChunkUseTick = 0;
    terrainChunkRebuildsThisFrame = 0;
    terrainWarmupFrames = 3;
    terrainChunkRebuildBoostFrames = 0;
    introPhase = 'warmup';
    introHoldTimer = 0.2;
    introSettledFrames = 0;
    introWarmupFramesRun = 0;
    var ov = document.getElementById('game-intro');
    if (ov) { ov.style.transition = 'none'; ov.style.opacity = '1'; }
    terrainClearOverlays = [];
    terrainClearedKinds = {};
    money = 0;
    cargo = [];
    teleporters = 0;
    teleportFx = null;
    balloons = 0;
    bombsSmall = 0;
    bombsLarge = 0;
    reserveFuel = 0;
    explosions = [];
    liveBombs = [];
    combatInit();             // enemy turrets across the zones + the rig auto-turret (085-combat.js)
    damageFlashT = 0;
    shopScroll = 0;
    shopDrag = null;
    roverMode = null;
    upgrades = { drillLevel: 1, fuelLevel: 1, hullLevel: 1, cargoLevel: 1, heatLevel: 0, shieldLevel: 0, vertLevel: 0, pumpLevel: 0, boosterLevel: 1 };
    maxCargo = getMaxCargo();
    maxFuel = getMaxFuel();
    // Dev mode: spawn with a roomy cargo bay + a varied test haul so the
    // pump-pad auto-sell reveal can be felt without grinding (press 'Y' to
    // reload it on demand; see devLoadTestHaul in 060 + the 'Y' hotkey in 350).
    if (devMode) devLoadTestHaul();
    // Snap the camera straight to spawn on the first frame instead of lerping
    // in from the world origin. The boot scroll would otherwise freeze the
    // spawn lake off-screen on the way in (frozen liquid isn't rendered), so
    // it would never appear; snapping keeps it in-region and visible.
    cam.snap = true;
    player = {
      // Spawn on the shore just LEFT of the deck so the opening view frames the
      // surface lake -> shore -> town. stationCenterCol() = DECK_CENTER_COL - 2;
      // DECK_LEFT_COL-3 sits ~5 tiles left of that (outside the 2.2-tile shop
      // proximity radius) and 2 tiles right of the lake's edge (solid shore).
      x: (DECK_LEFT_COL - 3) * TILE + TILE / 2 - PLAYER_W / 2,
      y: DECK_ROW * TILE - PLAYER_H,
      vx: 0, vy: 0,
      fuel: maxFuel,
      hull: getMaxHull(),
      onGround: false,
      onCeiling: false,
      dir: 1,
      thrusting: false,
      refueling: false,
      squash: 0,
      // ---- New movement state for the world-class platformer feel ----
      // thrustSpool: 0..1 — smooths jet ignition so taps and holds both feel
      //   responsive without snapping vy on the very first frame
      // coyoteT: seconds since last grounded contact; lets a jet press just
      //   after walking off a ledge still "count" (prevents the "I pressed
      //   it but nothing happened" feel)
      // jetBufferT: seconds since the player most recently pressed jet —
      //   if they hit it slightly early before landing/contact, the buffer
      //   carries the intent forward
      // edgeMoveL/R/U/D: per-frame "just pressed" snapshots used for instant
      //   tap-kicks on directional input
      // airTime: how long since onGround was true; powers landing fx scaling
      // peakFallVy: tracks max downward velocity during the current air time
      //   so we can scale landing fx to the actual fall, not the post-impact vy
      thrustSpool: 0,
      thrustVecX: 0,
      thrustVecY: -1,
      flightTilt: 0,
      flightTiltVel: 0,
      angle: -Math.PI / 2,
      angVel: 0,
      flightGroundT: 0,
      flightCtrlT: 0,
      flightCtrlAlpha: 0,
      rotFlightActive: false,
      bodyTiltRender: 0,
      sideThrustCook: 0,
      sideThrusterDeploy: 0,
      sideThrusterT: 0,
      sideThrusterDir: 0,
      sideThrusterCharged: true,
      surfaceThrusterPending: false,
      surfaceThrusterGraceT: 0,
      wasUnderground: false,
      coyoteT: 0,
      jetBufferT: 0,
      edgeMoveL: false,
      edgeMoveR: false,
      edgeMoveU: false,
      edgeMoveD: false,
      lastMoveL: false,
      lastMoveR: false,
      lastMoveU: false,
      lastMoveD: false,
      airTime: 0,
      peakFallVy: 0,
      wasSideSlipping: false,
      // Drill bite-through glide. Position-targeted, NOT velocity-targeted:
      // on tile-break we set a target distance (one tile) and direction;
      // each frame we advance player.x/y along an eased curve directly,
      // checking solidAt before each step so the glide aborts cleanly if a
      // wall is in the way. Velocity, gravity, friction, and player input
      // are completely untouched by the glide — no fighting state.
      // Down direction skips the glide entirely; gravity handles it.
      drillGlideT: 0,
      drillGlideDur: 0,
      drillGlideDir: null,
      drillGlideDist: 0,
      drillGlideTraveled: 0,
      // Perpendicular-axis lock during the glide. For u/d drills we hold
      // x at the column center; for l/r drills we hold y at the row top.
      // Without this, ambient input or gravity could drift the rig off
      // the drill axis mid-glide and into adjacent geometry.
      drillGlideLockX: null,
      drillGlideLockY: null,
      // Brief rest between consecutive drills. Mostly matters for downward
      // chains where gravity drops the rig onto the next tile instantly —
      // without this, mining straight down feels like an uncontrolled fall.
      drillCooldownT: 0,
      // Render position trails the logical position with a quick lerp.
      // Snaps from corner-correction nudges catch up over a few frames
      // visually instead of teleporting the sprite.
      renderX: 0,
      renderY: 0,
      // v14.1 — Trade Board commodity inventory. Map of itemKey -> count.
      // Forward-compatible: the Board station writes here on a buy/sell;
      // the rest of the game does not read it yet (economy comes later).
      // Defaults to {} so older saves missing the field still load.
      tradeGoods: {},
      // True while the rig is resting on a jello blob (movement owns grounding).
      onJello: false,
    };
    if (!player.tradeGoods) player.tradeGoods = {};
    player.renderX = player.x;
    player.renderY = player.y;
    drilling = null;
    gameOver = false;
    deathInfo = null;
    gameWon = false;
    deathPhaseT = 0;
    deathPlateY = -10000;
    deathPlateTargetY = -10000;
    deathSparks = [];
    deathLandedAt = -1;
    shopDoorT = 0;
    shopOpen = false;
    restartConfirmT = 0;
    clearAllSmokeVisuals();
    drillAnim.angle = Math.PI * 0.45;
    drillAnim.targetAngle = Math.PI * 0.45;
    drillAnim.extension = 0;
    drillAnim.targetExtension = 0;
    drillAnim.pumpPhase = 0;
    drillAnim.coneSpin = 0;
    initSurfaceWind();
    depthRecord = 0;
    gameStartedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    lastLayer = null;
    layerBanner = null;
    drillBlockMsgCool = 0;
    magmaWarnTimer = 0;
    fuelWarnTimer = 0;
    cargoFullWarnTimer = 0;
    msgAlert = false;
    floaters = [];
    autoSellFlash = null;
    msgText = '';
    msgTimer = 0;
    if (typeof radioMsgReset === 'function') radioMsgReset();   // radio channel (058)
    // Dev harness (v24.108): ?pondtest=1 boots the rig on the shore of the
    // nearest surface pond, so pond streaming + the born-settled fill can be
    // screenshotted headlessly (and playtested) without hunting for a pond.
    // cam.snap above already snaps the camera to the teleported spawn.
    // v24.125 — ?wdbg=NAME:V,NAME:V queues water gm-lever sets for headless
    // A/B runs (no keyboard): names are water-group lever names, applied via
    // gm.set on the first liquid update (070). Pairs with ?pondtest=1.
    var wdbgM = window.location.search.match(/[?&]wdbg=([^&]+)/);
    if (wdbgM) pondTestWdbg = decodeURIComponent(wdbgM[1]);
    var ptModeM = window.location.search.match(/[?&]pondtest=([1234])/);
    if (surfacePonds && surfacePonds.length && ptModeM) {
      pondTestMode = true;
      pondTestKind = +ptModeM[1];   // v24.143 — 3 = shore spawn + timed breach (070);
                                    // v24.157 — 4 = shore spawn + PERMANENT hard stim
                                    // (the fly-in explosion repro: calm pinned at 0, the
                                    // lively dissipation floor must hold the EOS pump
                                    // bounded on a fresh fill indefinitely)
      var ptBest = surfacePonds[0], ptD = Infinity;
      for (var pti = 0; pti < surfacePonds.length; pti++) {
        var ptCx = (surfacePonds[pti].cL + surfacePonds[pti].cR + 1) * 0.5 * TILE;
        var ptd = Math.abs(ptCx - player.x);
        if (ptd < ptD) { ptD = ptd; ptBest = surfacePonds[pti]; }
      }
      if (ptModeM[1] === '2') {
        // v24.125 — ?pondtest=2: float the rig mid-pond (the owner's actual
        // idle pose; the bobbing hull is a continuous disturbance source the
        // shore spawn never exercises).
        player.x = (ptBest.cL + ptBest.cR + 1) * 0.5 * TILE - PLAYER_W * 0.5;
        player.y = (SKY_ROWS - 2) * TILE;
      } else {
        player.x = (ptBest.cL - 3) * TILE;
        player.y = SKY_ROWS * TILE - PLAYER_H - 2;
      }
      player.renderX = player.x;
      player.renderY = player.y;
    }
    // Dev harness (v24.132, mirrors ?pondtest=): ?alt=N boots the rig N world
    // px above the surface line (clamped into the sky), falling free — so the
    // horizon-limb ascent look can be screenshotted headlessly at any
    // altitude. Pairs with ?tod= (020) for the sunset/sunrise window. Not a
    // play lever: gravity owns the rig immediately, so shoot early.
    var altBootM = window.location.search.match(/[?&]alt=(\d+)/);
    if (altBootM) {
      // Negative y is legal airspace — the world grid ends at row 0 but
      // flight continues above it (space transition starts ~1000 px up).
      player.y = SKY_ROWS * TILE - PLAYER_H - Math.min(6000, +altBootM[1]);
      player.vy = 0;
      player.renderX = player.x;
      player.renderY = player.y;
    }
  }

  // Fuel capacity per tier. Front-loaded curve (v11.35) so the first
  // upgrade is meaningful and the player isn't stuck at a small tank.
  function getMaxFuel() {
    var lv = upgrades.fuelLevel;
    var caps = [0, 30, 55, 85, 120, 165, 220];
    if (lv >= caps.length) return caps[caps.length - 1];
    if (lv < 1) return caps[1];
    return caps[lv];
  }
  // v23.75 booster thrust multiplier per tier. 5 levels; tier 3 = 1.0 (the
  // climb-thrust anchor). v24.59: this ONLY scales the UNDERGROUND vertical climb
  // (see UG_VERT_* in 080); above-ground flight is fixed at FLIGHT_ABOVE_MULT and
  // does not read this. Each step clears the ~15% just-noticeable threshold.
  // Tunable; index = upgrades.boosterLevel.
  var BOOST_THRUST_MULT = [0, 0.70, 0.85, 1.00, 1.25, 1.55];
  function getBoosterThrustMult() {
    var lv = upgrades.boosterLevel || 1;
    if (lv >= BOOST_THRUST_MULT.length) return BOOST_THRUST_MULT[BOOST_THRUST_MULT.length - 1];
    if (lv < 1) return BOOST_THRUST_MULT[1];
    return BOOST_THRUST_MULT[lv];
  }
  // v24.64: sustained UNDERGROUND vertical climb speed (px/s) at the current
  // booster tier, i.e. the force-vs-gravity equilibrium of the UG_VERT_* climb in
  // 080. DUPLICATED from 080 (keep F / T / G in sync with UG_VERT_FORCE,
  // |UG_VERT_TERMINAL|, and the thrusting gravity GRAVITY_PLAYER*(1-GRAVITY_RELIEF)).
  // This is what lets the fuel-to-surface marker react to rocket upgrades.
  function getUndergroundClimbSpeed() {
    var F = 1100;   // UG_VERT_FORCE (080)
    var T = 560;    // |UG_VERT_TERMINAL| (080)
    var G = 532;    // gravity while thrusting = GRAVITY_PLAYER 760 * (1 - GRAVITY_RELIEF 0.30)
    var v = T * (1 - G / (F * getBoosterThrustMult()));
    return v > 40 ? v : 40;   // floor so a low tier never blows up the estimate
  }
  function getMaxHull() { return BASE_HULL + (upgrades.hullLevel - 1) * 60; }
  function getMaxCargo() { return 5 + (upgrades.cargoLevel - 1) * 4; }
  function getOilTankCapacity() {
    var lv = upgrades.pumpLevel || 0;
    if (lv <= 0) return 0;
    return [0, 24, 58, 120][Math.min(3, lv)];
  }
  function getOilPumpRange() {
    var lv = upgrades.pumpLevel || 0;
    if (lv <= 0) return 0;
    return [0, 76, 112, 152][Math.min(3, lv)];
  }
  function drillHitTime() {
    // Seconds for one drill hit (removes 1 HP). Higher drill tiers drill
    // faster per hit via DRILL_SPEED (see the constants block).
    var L = upgrades.drillLevel || 1;
    if (L < 1) L = 1;
    if (L >= DRILL_SPEED.length) L = DRILL_SPEED.length - 1;
    return DRILL_TIME / DRILL_SPEED[L];
  }

  function fallDamageForImpact(speed) {
    if (speed <= 340) return 0;
    if (speed <= 460) return (speed - 340) * 0.10;
    if (speed <= 560) return 12 + Math.pow((speed - 460) / 100, 1.45) * 42;
    return 90 + Math.pow((speed - 560) / 80, 1.7) * 260;
  }

  // v12.1 — Water breaks the fall. Returns 0..1 — how much a body of water
  // around the rig should cushion a landing impact. A coarse 4x4 coverage
  // grid over the rig's padded AABB is used instead of a raw particle
  // count, so detection is independent of pond particle density and stays
  // robust to the rig ejecting water out of its own silhouette as it
  // plunges (the ring of cells around the hull still reads as covered).
  function playerWaterCushion() {
    if (liquidCount <= 0 || !player) return 0;
    var pad = 9;
    var x0 = player.x - pad, y0 = player.y - pad;
    var regW = PLAYER_W + pad * 2, regH = PLAYER_H + pad * 2;
    var x1 = x0 + regW, y1 = y0 + regH;
    var invCW = 4 / regW, invCH = 4 / regH;        // 4x4 probe grid
    var mask = 0, covered = 0;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidType[i] !== 0) continue;           // water only — not oil
      var lx = liquidX[i];
      if (lx < x0 || lx > x1) continue;
      var ly = liquidY[i];
      if (ly < y0 || ly > y1) continue;
      var fc = (lx - x0) * invCW;
      var fr = (ly - y0) * invCH;
      var col = fc >= 4 ? 3 : fc | 0;
      var row = fr >= 4 ? 3 : fr | 0;
      var bit = 1 << (row * 4 + col);
      if (!(mask & bit)) {
        mask |= bit;
        if (++covered >= 16) break;                // fully covered — done
      }
    }
    // <=4 covered cells = a few stray splash droplets (no cushion); >=10 =
    // a real body of water (full cushion). Linear ramp between.
    if (covered <= 4) return 0;
    if (covered >= 10) return 1;
    return (covered - 4) / 6;
  }

  // v24.148 — per-frame submersion fraction for the rig WATER MEDIUM step
  // (080: drag + slow sink in the deep lakes). playerWaterCushion's scan is
  // O(liquidCount), so gate it: scan every frame only while inside a filled
  // lake's rect (cheap test) or while the cached value is still wet (keeps
  // swimming in player-made flood water responsive); otherwise a 16-frame
  // heartbeat probe catches flooded digs anywhere at ~zero average cost.
  var playerWaterFracV = 0;
  var playerWaterFracTk = 0;
  function playerWaterFrac() {
    playerWaterFracTk++;
    var need = playerWaterFracV > 0.01 || (playerWaterFracTk & 15) === 0;
    if (!need && typeof surfacePonds !== 'undefined' && surfacePonds.length && player) {
      var pl = player.x, pr = player.x + PLAYER_W, pt = player.y, pb = player.y + PLAYER_H;
      for (var i = 0; i < surfacePonds.length; i++) {
        var p = surfacePonds[i];
        if (!p.filled) continue;
        var d = p.d || 1;
        if (pr < (p.cL - 1) * TILE || pl > (p.cR + 2) * TILE) continue;
        if (pb < (SKY_ROWS - 1) * TILE || pt > (SKY_ROWS + d + 1) * TILE) continue;
        need = true;
        break;
      }
    }
    if (need) playerWaterFracV = playerWaterCushion();
    else playerWaterFracV = 0;
    return playerWaterFracV;
  }

  // ----- Fuel-to-surface estimate (A* pathfinding) -----
  // Searches from the rig's tile up to the surface, costing open air as
  // cheap "fly" moves and solid rock as much pricier "drill" moves. The
  // cheapest path's fuel cost is the estimate — so it accounts for
  // horizontal detours and any drilling, and collapses to the exact
  // vertical climb whenever a clear shaft is open above. Above ground it
  // is just straight-line distance to the deck. getFuelToSurface()
  // throttles + caches the search; the gauge
  // marker calls it every frame.
  var _ftsValue = 0;
  var _ftsTime = -1e9;
  function getFuelToSurface() {
    var now = performance.now();
    if (now - _ftsTime > 200) {
      _ftsTime = now;
      // Modest buffer — small enough that a clear shaft reads near-exact.
      _ftsValue = computeFuelToSurface() * 1.15;
    }
    return _ftsValue;
  }
  function computeFuelToSurface() {
    if (typeof player === 'undefined' || !player) return 0;
    var climbSpeed = getUndergroundClimbSpeed();     // px/sec sustained climb (reacts to rocket/booster tier)
    var fuelPerSec = FUEL_DRAIN + DRILL_FUEL * 0.5;  // ~1.55/sec while climbing
    var AIR_COST = (TILE / climbSpeed) * fuelPerSec; // fuel to fly through one tile
    // Drilling a tile ~2.5 hits, draining the drill + activity fuel, then
    // flying into the cleared cell — far pricier than open air.
    var DRILL_COST = AIR_COST + 2.5 * DRILL_TIME * (DRILL_FUEL + FUEL_DRAIN);

    var prow = Math.floor((player.y + PLAYER_H / 2) / TILE);
    var pcol = Math.floor((player.x + PLAYER_W / 2) / TILE);

    // At/above the surface — no rock to route around, so straight-line
    // distance to the deck is it.
    if (prow <= SKY_ROWS) {
      var dEarth = Math.abs(player.y - DECK_ROW * TILE);
      return (dEarth / climbSpeed) * fuelPerSec;
    }

    // ----- A* up to the surface — binary min-heap over parallel arrays -----
    var heapF = [], heapId = [];
    function heapPush(f, id) {
      var i = heapF.length;
      heapF.push(f); heapId.push(id);
      while (i > 0) {
        var p = (i - 1) >> 1;
        if (heapF[p] <= heapF[i]) break;
        var tf = heapF[p]; heapF[p] = heapF[i]; heapF[i] = tf;
        var ti = heapId[p]; heapId[p] = heapId[i]; heapId[i] = ti;
        i = p;
      }
    }
    function heapPopId() {
      var topId = heapId[0];
      var lf = heapF.pop(), li = heapId.pop();
      if (heapF.length > 0) {
        heapF[0] = lf; heapId[0] = li;
        var i = 0, n = heapF.length;
        for (;;) {
          var l = i * 2 + 1, r = l + 1, s = i;
          if (l < n && heapF[l] < heapF[s]) s = l;
          if (r < n && heapF[r] < heapF[s]) s = r;
          if (s === i) break;
          var tf = heapF[s]; heapF[s] = heapF[i]; heapF[i] = tf;
          var ti = heapId[s]; heapId[s] = heapId[i]; heapId[i] = ti;
          i = s;
        }
      }
      return topId;
    }

    var startId = prow * COLS + pcol;
    var gScore = new Map();
    var closed = new Set();
    gScore.set(startId, 0);
    heapPush((prow - SKY_ROWS) * AIR_COST, startId);
    var explored = 0, MAX_EXPLORE = 12000;
    var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
    while (heapF.length > 0) {
      var id = heapPopId();
      if (closed.has(id)) continue;
      closed.add(id);
      var row = (id / COLS) | 0;
      var col = id - row * COLS;
      if (row <= SKY_ROWS) return gScore.get(id);          // reached the surface
      if (++explored > MAX_EXPLORE) break;                 // search budget — bail
      var g = gScore.get(id);
      for (var d = 0; d < 4; d++) {
        var nr = row + DR[d], nc = col + DC[d];
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= TOTAL_ROWS) continue;
        var nid = nr * COLS + nc;
        if (closed.has(nid)) continue;
        var t = tileAt(nr, nc);
        var stepCost;
        if (t === null) {
          stepCost = AIR_COST;
        } else if (t === 'wall' || t.hp >= 999999 ||
                   t.type === 'foundation' || t.type === 'barrier' ||
                   t.type === 'bedrock') {
          continue;                                        // can't drill — route around
        } else {
          stepCost = DRILL_COST;
        }
        var ng = g + stepCost;
        var known = gScore.get(nid);
        if (known === undefined || ng < known) {
          gScore.set(nid, ng);
          heapPush(ng + Math.max(0, nr - SKY_ROWS) * AIR_COST, nid);
        }
      }
    }
    // Boxed in, or the search budget ran out — pad a plain vertical climb.
    return ((prow - SKY_ROWS) * TILE / climbSpeed) * fuelPerSec * 1.3;
  }

  /* ---- Resize ---- */
  // We render the canvas at native device pixels (sharp HUD + shop text).
  // The game world is drawn through a worldScale transform so tiles stay
  // an appropriate size on screen regardless of viewport width.
  var dpr = 1;
  var worldScale = 2;          // CSS-pixel scale for game-world rendering

  // Zoom toggle: two presets — a less-zoomed default and a closer inspection
  // option. Persists across reloads via localStorage.
  var zoomMode = 'out';        // 'in' or 'out'
  try {
    var saved = localStorage.getItem('sluice.zoom');
    if (saved === 'in' || saved === 'out') zoomMode = saved;
  } catch (e) { /* private mode etc — ignore */ }

  // Tile-count targets for each zoom preset. Smaller = more zoomed in.
  // v24.50 — out (the default) 30→20 so the world plays ~1.5× bigger out of the
  // box. Changing the VALUE (not the default mode) means a saved 'out' preference
  // also renders bigger. 'out' had been widened to 30 for sky inspection; the
  // closer 'in' (14) toggle is still there if you want to lean in further.
  var ZOOM_TILES = { in: 14, out: 30 };   // out: owner wants the WIDE view back (reverted v24.50's 30->20 "bigger play"); wider view also renders water crisper

  // worldScale animates smoothly toward targetWorldScale when the user
  // toggles zoom. resize() snaps both immediately (no animation on layout
  // changes — only on user-initiated zoom toggles).
  var targetWorldScale = 2;

  // Compute the ideal worldScale for the current viewport + zoom mode.
  // Pure function — does not mutate state.
  function computeTargetWorldScale() {
    var TARGET_TILES_ACROSS = ZOOM_TILES[zoomMode] || ZOOM_TILES.out;
    var idealScale = (viewW / (TARGET_TILES_ACROSS * TILE));
    if (isMobile) idealScale *= 0.9;
    return Math.max(1.2, Math.min(idealScale, 4.5));
  }

  // Zoom transition is animated by tweening from a captured "from" scale
  // to the current targetWorldScale over a fixed duration with an ease-in-
  // out cubic. The exponential lerp it replaces felt punchy-then-slow; a
  // duration-based ease has gentle start AND gentle end, which reads as
  // smoother to the eye even at the same overall speed.
  var zoomFromScale = 2;
  var zoomElapsed = 0;
  var zoomDuration = 0.55;     // seconds for a full zoom transition

  function setZoomMode(mode) {
    if (mode !== 'in' && mode !== 'out') return;
    if (mode === zoomMode) return;
    zoomMode = mode;
    try { localStorage.setItem('sluice.zoom', mode); } catch (e) {}
    // Capture the current scale as the start of a fresh tween, then update
    // the target. This makes mid-transition toggles feel right too —
    // they ease from wherever we currently are.
    zoomFromScale = worldScale;
    zoomElapsed = 0;
    targetWorldScale = computeTargetWorldScale();
  }
  function toggleZoom() {
    setZoomMode(zoomMode === 'in' ? 'out' : 'in');
  }

  // ease-in-out cubic — smooth start, smooth end, no overshoot
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function updateZoomLerp(dt) {
    if (worldScale === targetWorldScale) return;
    zoomElapsed += dt;
    var p = Math.min(1, zoomElapsed / zoomDuration);
    var eased = easeInOutCubic(p);
    worldScale = zoomFromScale + (targetWorldScale - zoomFromScale) * eased;
    if (p >= 1) {
      worldScale = targetWorldScale;
      syncTerrainChunkRenderScale();
    }
    screenW = viewW / worldScale;
    screenH = viewH / worldScale;
  }

  function terrainDesiredChunkRenderScale() {
    // Terrain chunks render at TERRAIN_RES_FACTOR x the world scale (ws),
    // rounded to a 0.5 step and clamped. See the Resolution config block.
    var drawScale = Math.max(1, (dpr || 1) * (worldScale || 1));
    var scale = Math.ceil(drawScale * TERRAIN_RES_FACTOR * 2) / 2;
    return Math.max(TERRAIN_CHUNK_RENDER_SCALE_MIN, Math.min(TERRAIN_CHUNK_RENDER_SCALE_MAX, scale));
  }

  function terrainChunkCacheLimit() {
    var scale = TERRAIN_CHUNK_RENDER_SCALE || TERRAIN_CHUNK_RENDER_SCALE_MIN;
    if (scale >= 2.75) return 96;
    if (scale >= 2.25) return 120;
    if (scale >= 1.75) return 150;
    return TERRAIN_CHUNK_CACHE_LIMIT;
  }

  function syncTerrainChunkRenderScale() {
    var nextScale = terrainDesiredChunkRenderScale();
    if (Math.abs(nextScale - TERRAIN_CHUNK_RENDER_SCALE) < 0.01) return;
    TERRAIN_CHUNK_RENDER_SCALE = nextScale;
    terrainChunkCache = {};
    terrainChunkCount = 0;
    terrainChunkUseTick = 0;
    if (introPhase !== 'done') terrainWarmupFrames = Math.max(terrainWarmupFrames || 0, 2);
    else terrainChunkRebuildBoostFrames = Math.max(terrainChunkRebuildBoostFrames || 0, 3);
  }

  var viewW = 0, viewH = 0;    // canvas size in CSS pixels
  /* ---- Resolution config ---------------------------------------------
   * Every knob that controls how sharp the game looks. See AGENTS.md
   * "Resolution" for the full write-up. The pipeline:
   *   nativeDPR  ->  capped by RES_PIXEL_BUDGET  ->  x RENDER_SCALE_*  =
   *   dpr  ->  canvas backing store. The world then draws at ws =
   *   dpr * worldScale.
   *
   *   RES_PIXEL_BUDGET     hard cap on main-canvas pixels per frame. Below
   *                        this the canvas is native-crisp; once a window
   *                        would exceed it, dpr is scaled down and the
   *                        browser upscales the whole frame (uniform
   *                        softness). Raise for a globally sharper image
   *                        at a straight, proportional GPU cost.
   *   RENDER_SCALE_*       extra global dpr multiplier per platform.
   *                        Below 1.0 trades sharpness for fps (the frame
   *                        renders smaller, then the browser upscales it).
   *                        Mobile 0.55 is aggressive for phone GPUs.
   *   TERRAIN_RES_FACTOR   terrain chunks bake into cached bitmaps at this
   *                        fraction of ws. 1.0 = blocks match the
   *                        foreground sprites; lower = softer blocks but
   *                        smaller/cheaper chunk bitmaps. Feeds
   *                        terrainDesiredChunkRenderScale, then clamped to
   *                        TERRAIN_CHUNK_RENDER_SCALE_MIN/MAX.
   *   SMOKE_RENDER_SCALE_* WebGL smoke canvas as a fraction of its domain.
   *                        Smoke is soft by nature, so it stays low.
   *
   * TUNING HISTORY — the solid-144fps desktop baseline is
   * RENDER_SCALE_DESKTOP 1.0 + TERRAIN_RES_FACTOR 0.62. v13.18 raised
   * TERRAIN_RES_FACTOR 0.62 -> 1.0 (full-res blocks) and that alone
   * cost ~19fps on the surface; v13.23 reverted it. RENDER_SCALE_DESKTOP
   * has only ever shipped at 0.9-1.0 — it was NOT the regression. Two
   * different levers; do not conflate them. Full write-up: AGENTS.md
   * "Resolution".
   * ------------------------------------------------------------------ */
  var RES_PIXEL_BUDGET     = 3000000;   // ~3 MP/frame main-canvas cap
  var RENDER_SCALE_DESKTOP = 1.0;       // global dpr multiplier (desktop)
  var RENDER_SCALE_MOBILE  = 0.55;      // global dpr multiplier (mobile)
  var TERRAIN_RES_FACTOR   = 0.62;      // chunk bitmaps at 0.62x ws — the 144fps state (v13.23, was 1.0 in v13.18-22)
  var SMOKE_RENDER_SCALE_DESKTOP = 0.6; // smoke WebGL canvas px scale
  var SMOKE_RENDER_SCALE_MOBILE  = 0.7;
  var TERRAIN_CHUNK_RENDER_SCALE_MIN = 1.5; // terrain auto-scale floor
  var TERRAIN_CHUNK_RENDER_SCALE_MAX = 3;   // ceiling — caps zoomed-in terrain sharpness
  var TERRAIN_CHUNK_RENDER_SCALE = TERRAIN_CHUNK_RENDER_SCALE_MIN; // live; set by syncTerrainChunkRenderScale
  function resize() {
    var wrap = canvas.parentElement;
    viewW = wrap.clientWidth;
    viewH = wrap.clientHeight;
    // Cap DPR by *total pixel work per frame*, not a fixed value. A flat
    // DPR cap (e.g. 1.5) means iPhone (native DPR 3) renders at 50% of
    // native resolution and looks visibly fuzzy in landscape fullscreen,
    // while desktop at DPR 2 on a 4K monitor still does 8+ MP/frame and
    // tanks fps. Targeting a fixed pixel budget gets us crisp mobile AND
    // capped desktop with one rule.
    //
    //   small viewport (phone)  : viewW*viewH small, full native DPR fits
    //   large viewport (4K)     : DPR scaled down so total stays ~3 MP/frame
    var nativeDpr = Math.max(1, window.devicePixelRatio || 1);
    var cssPixels = Math.max(1, viewW * viewH);
    var maxDpr = Math.sqrt(RES_PIXEL_BUDGET / cssPixels);   // see Resolution config
    // v11.79 — apply the platform render-scale (see RENDER_SCALE_*).
    var renderScale = isMobile ? RENDER_SCALE_MOBILE : RENDER_SCALE_DESKTOP;
    dpr = Math.max(1, Math.min(nativeDpr, maxDpr)) * renderScale;

    // Render at native device pixels for crispness
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    if (liquidGLCanvas) {
      liquidGLCanvas.width = canvas.width;
      liquidGLCanvas.height = canvas.height;
      if (typeof liquidGLPositionDOM === 'function') liquidGLPositionDOM();
    }
    // v23.53: keep the UI top canvas (z6) aligned to the new viewport.
    if (typeof uiTopCanvas !== 'undefined' && uiTopCanvas) {
      uiTopCanvas.width = canvas.width;
      uiTopCanvas.height = canvas.height;
      if (typeof uiTopPositionDOM === 'function') uiTopPositionDOM();
    }
    // v10.83 — keep the DOM-layered smoke canvas aligned to the new viewport.
    if (typeof smokeFluidUpdateDomain === 'function') smokeFluidUpdateDomain();
    if (typeof smokeFluidPositionDOM === 'function') smokeFluidPositionDOM();

    // World scale: snap immediately on layout changes (resize, rotate).
    // Only zoom-mode toggles trigger the smooth animation.
    targetWorldScale = computeTargetWorldScale();
    worldScale = targetWorldScale;

    // screenW/H are the dimensions of the *visible game world* in world pixels
    screenW = viewW / worldScale;
    screenH = viewH / worldScale;
    syncTerrainChunkRenderScale();

    // D-pad layout uses CSS-pixel coordinates so it stays a comfortable size.
    // Anchored to the BOTTOM-RIGHT — most players drive with their right thumb,
    // so reach is best on that side. The render and touch-zone code both read
    // DPAD_CX/DPAD_CY so flipping the anchor here propagates everywhere.
    // D-pad sizing: scale by the play area's pseudo-diagonal
    // sqrt(viewW * viewH), then trim ~30% in fullscreen so the larger
    // viewport doesn't push the d-pad to a size that feels oversized
    // relative to the player rig. Embedded mode keeps the original
    // proportional size.
    //
    //                                            mode          DPAD     BTN
    //   embedded portrait phone   390 ×  520  →  embedded  →   122 px   46
    //   embedded landscape phone  700 ×  520  →  embedded  →   163 px   62
    //   fullscreen portrait phone 390 ×  850  →  fullscreen →  108 px   41
    //   fullscreen landscape phone 844 × 390  →  fullscreen →  108 px   41
    //   fullscreen tablet         1024 × 768  →  fullscreen →  167 px   64
    //
    // Floor at 100 keeps the d-pad finger-friendly even on tiny canvases;
    // cap at 200 prevents a huge tablet from making it dominate the screen.
    if (isMobile) {
      var isFs = typeof document !== 'undefined' && document.body && document.body.classList.contains('gm-fs');
      if (isFs) {
        var dpadBase = Math.sqrt(viewW * viewH) * 0.27 * 0.7;  // ~30% smaller in fullscreen per playtest
        DPAD_SIZE = Math.max(100, Math.min(200, dpadBase));
      } else {
        DPAD_SIZE = Math.min(186, viewW * 0.30);                 // smaller when not fullscreen on mobile
      }
    } else {
      DPAD_SIZE = Math.min(170, viewW * 0.26);
    }
    DPAD_BTN = DPAD_SIZE * 0.38;
    DPAD_CX = viewW - DPAD_SIZE * 0.9;
    // Anchor the d-pad above the bottom console (toolbar/bays), not the
    // screen edge — otherwise its lower half is hidden behind the bays on
    // mobile. consoleHeight() + an 8 px gap clears it in every orientation.
    DPAD_CY = viewH - consoleHeight() - DPAD_SIZE * 0.9 - 8;
  }

