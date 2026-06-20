  /* ---- Collision ---- */
  // Return the tile data at world tile-coords (r, c). Returns:
  //   - 'wall'  for off-the-sides or below the Earth bottom (an absolute boundary)
  //   - tile object (with .type, .hp) for solid tiles
  //   - null     for open space (above the Earth surface)
  // Used by collision.
  function tileAt(r, c) {
    // Off the sides is always solid wall.
    if (c < 0 || c >= COLS) return 'wall';
    // Below the Earth world is solid wall (can't escape that way).
    if (r >= TOTAL_ROWS) return 'wall';
    // Above the Earth surface — open sky (lets the player fly up).
    if (r < 0) return null;
    return world[r][c];
  }
  // Return ONLY the tile object at (r, c), or null. Unlike tileAt, this
  // never returns the 'wall' sentinel — out-of-bounds becomes null. Useful
  // for callers that just want to know "is there an ore I can drill here?"
  // and don't care about world-edge walls (those are handled by collision).
  function getTileObj(r, c) {
    var t = tileAt(r, c);
    if (t === 'wall' || t === null) return null;
    return t;
  }

  function solidAt(px, py, w, h) {
    var c1 = Math.floor(px / TILE);
    var c2 = Math.floor((px + w - 1) / TILE);
    var r1 = Math.floor(py / TILE);
    var r2 = Math.floor((py + h - 1) / TILE);
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        var t = tileAt(r, c);
        if (t === 'wall' || t !== null) return true;
      }
    }
    return false;
  }

  // ----- Surface fireplace chimney cap — a one-way landing ledge -----
  // The rig can perch on the flat iron cap atop the city fireplace's
  // chimney. Geometry mirrors drawSurfaceFireplace().
  // Cap top sits hearth22 + mantle6 + chimney60 + corbel4 + cap8 = 100 px
  // above the station deck.
  var chimneyCapDropT = 0;       // >0 = dropping through the cap (Down pressed)
  function chimneyCapTopY() { return DECK_ROW * TILE - 100; }
  function playerOverChimneyCap(px) {
    var pcx = px + PLAYER_W / 2;
    var ccx = stationCenterCol() * TILE + TILE / 2 + 150;
    return pcx >= ccx - 12 && pcx <= ccx + 12;   // 24-px iron cap
  }
  function playerRestingOnChimneyCap(px, py) {
    return playerOverChimneyCap(px) &&
           Math.abs(py + PLAYER_H - chimneyCapTopY()) <= 2;
  }
  // If the rig is descending onto the cap this frame, return the y it
  // should rest at; else null. One-way — only catches downward motion, so
  // the chimney never blocks the rig from the sides or below. Suppressed
  // while dropping through (press Down to fall off, Terraria-style).
  function chimneyCapCatch(px, oldY, newY) {
    if (chimneyCapDropT > 0 || player.vy < 0 || !playerOverChimneyCap(px)) return null;
    var capY = chimneyCapTopY();
    if (oldY + PLAYER_H <= capY + 1 && newY + PLAYER_H >= capY) return capY - PLAYER_H;
    return null;
  }

  // v23.33 — hoisted out of playerHasFootSupport; the offsets are constant.
  var PLAYER_FOOT_OFFSETS = [4, PLAYER_W / 2, PLAYER_W - 4];
  function playerHasFootSupport(px, py) {
    // Perched on the fireplace chimney cap counts as foot support —
    // unless the player is dropping through it.
    if (chimneyCapDropT <= 0 && playerRestingOnChimneyCap(px, py)) {
      return true;
    }
    var footY = py + PLAYER_H + 1;
    var row = Math.floor(footY / TILE);
    var feet = PLAYER_FOOT_OFFSETS;
    for (var i = 0; i < feet.length; i++) {
      var col = Math.floor((px + feet[i]) / TILE);
      var t = tileAt(row, col);
      if (t === 'wall' || t !== null) return true;
    }
    return false;
  }

  // ============================================================
  //  LIQUIDS: SURFACE WATER + UNDERGROUND OIL
  // ============================================================
  //
  // ALGORITHM — APIC particle-grid fluid
  // --------------------------------------------------------------
  // A weakly-compressible APIC (Affine Particle-In-Cell) fluid, the
  // same scheme as saharan's "Water" demo (github.com/saharan/works
  // /tree/main/water, oimo.io/works/water). Fluid is carried by
  // PARTICLES; each step their mass + momentum is splatted onto a
  // background GRID, pressure and forces are resolved on the grid,
  // and the result is read back to the particles. Each particle also
  // carries an affine velocity matrix (liquidG00..G11 — "C" in APIC)
  // so rotation and shear survive the grid round-trip instead of
  // smearing out into mush.
  //
  //   Pipeline, once per sim step (see updateLiquids):
  //     1. liquidUpdateActiveRegion  classify awake / sleeping / frozen
  //     2. updateOilSuction          pump pulls oil toward the rig
  //     3. liquidP2G                 particle -> grid (mass, momentum, aeration)
  //     4. liquidApplyGridPressure   density -> pressure -> grid velocity push
  //     5. liquidUpdateGrid          gravity, walls, friction, miner eject
  //     6. liquidG2P                 grid -> particle velocity + affine matrix
  //     7. liquidMoveParticle        integrate position, collide vs world tiles
  //
  // Steps 3-6 mirror saharan's p2g() / updateGrid() / g2p(). Steps 1,
  // 2, 7 and the rocket/bomb/miner force layers are game-specific:
  // the original is a fixed tank with no terrain and no scrolling.
  //
  // STATUS — this CPU sim is the FALLBACK + self-test reference, not
  // the live solver
  // --------------------------------------------------------------
  // Since v14.0 the LIVE water/oil solver is WebGPU compute in
  // js/liquid-wgpu.js (a bit-faithful port of steps 3-6 below). This
  // JS code runs only when WebGPU is unavailable, and otherwise serves
  // as the bit-exact CPU reference the boot self-tests diff the GPU
  // kernels against. So perf of THIS path matters only on the fallback.
  // (Historical note, now obsolete: an earlier banner here said the
  // fix for this port being slow at ~25k particles was to move the hot
  // path into WASM SIMD. That predates the GPU port. The real fix WAS
  // the GPU — do not chase WASM. The fallback's ~5-8x gap vs saharan's
  // compiled-C++/WASM demo is the platform, not a port bug; the
  // mitigations below keep the fallback usable, the GPU carries the
  // real load.)
  //
  // STABILITY (v24.169-186) — the giant-particle / runaway fix lives
  // partly here too (edit² with liquid-wgpu.js): the clamped EOS is a
  // limit-cycle oscillator that, under hard stress, lets particles
  // collapse into over-dense knots it turns into a perpetual bounce
  // engine. The cure is LIQUID_DENS_CAP (bounds the impulse) + the
  // anti-clump min-separation pass (GPU WGSL_DECLUMP, stops the
  // over-packing persisting) + RAW/SUBSTEP/GRAVITY (calm baseline).
  // Damping/viscosity only MASK it. See TUNING.md §2.10.
  //
  // MITIGATIONS — keep most particles out of the hot loop
  // --------------------------------------------------------------
  //   frozen   — outside camera + LIQUID_ACTIVE_MARGIN; skipped by
  //              every stage. Most particles in a big pool are frozen.
  //   sleeping — settled in place (LIQUID_SLEEP_FRAMES of sub-
  //              LIQUID_SLEEP_VSQ motion); skipped by pressure / G2P /
  //              move. NOTE: still processed by P2G — a settled pool's
  //              mass must stay on the grid or awake fluid sinks
  //              through it. So P2G cost scales with awake + sleeping.
  //   adaptive skip — when nothing is awake and the player is calm the
  //              whole pipeline is skipped, with a LIQUID_SIM_FORCE_EVERY
  //              frame heartbeat to catch latent wakes.
  // The dev-panel "Liq state" line shows the awake/sleeping/frozen
  // split so the cost can be attributed.
  //
  // TUNABLES — every knob, all in the constants block at the top of
  // the file (grep "var LIQUID_CELL"):
  // --------------------------------------------------------------
  //  Grid / particles:
  //   LIQUID_CELL ............ grid cell size in world px (smaller = finer, costlier)
  //   LIQUID_MAX_PARTICLES ... hard particle cap; sizes every typed array
  //   LIQUID_MAX_CELLS ....... hash-grid cell cap (= MAX_PARTICLES * 9)
  //   LIQUID_PDELTA .......... particle spacing; DENSITY = 1 / PDELTA^2
  //   LIQUID_DENSITY/_INV_DENSITY  rest density the pressure term targets
  //   LIQUID_HASH_BITS/_SIZE/_MASK  open-addressed cell-lookup table size
  //   LIQUID_STENCIL_OX/_OY .. 3x3 quadratic B-spline stencil offsets
  //  Water feel:
  //   LIQUID_PRESSURE_STIFF .. incompressibility stiffness (higher = springier)
  //   LIQUID_DAMPING ......... per-step velocity bleed (1 = none; kills MPM jitter)
  //   LIQUID_WATER_MOTION_SCALE  global scale on water particle motion
  //   LIQUID_GRAVITY ......... downward accel, px/s^2
  //   LIQUID_FLOOR_FRICTION/_WALL_FRICTION  drag vs solid tiles below / beside
  //   LIQUID_WALL_BOUNCE_IN/_EDGE  reflection coeff for cells in / next to solids
  //  Oil feel — same knobs, separate oil pool:
  //   LIQUID_OIL_PRESSURE_STIFF, _DAMPING, _GRAVITY, _FLOOR_FRICTION,
  //   _WALL_FRICTION, _WALL_BOUNCE_IN, _WALL_BOUNCE_EDGE
  //  Aeration — white foam where fluid churns (water + oil sets):
  //   LIQUID_[OIL_]AERATION_THRESHOLD  density below which fluid reads aerated
  //   LIQUID_[OIL_]AERATION_COEFF .... how fast churn adds foam
  //   LIQUID_[OIL_]AERATION_BLUR ..... neighbour blend of the foam field
  //   LIQUID_[OIL_]AERATION_DAMP ..... per-step foam decay
  //  Render:
  //   LIQUID_WATER_R/G/B, _FOAM_R/G/B, _ALPHA   water base/foam colour + opacity
  //   LIQUID_OIL_R/G/B, _ALPHA ................ oil colour + opacity
  //   LIQUID_WATER_PARTICLE_SIZE/_OIL_PARTICLE_SIZE  render kernel radius
  //   LIQUID_PARTICLE_SIZE .... active default render size (= water size)
  //  Surface pools — standing water/oil at the world surface:
  //   LIQUID_SURFACE_PARTICLE_MAX ........... cap on surface-origin particles
  //   LIQUID_SURFACE_WATER_TARGET/_OIL_TARGET  desired surface particle counts
  //   LIQUID_SURFACE_WATER_PARTICLES_PER_TILE  spawn density per surface tile
  //  Miner interaction — fluid cannot sit in or on the rig:
  //   LIQUID_PLAYER_EJECT .... force pushing fluid out of the miner AABB
  //   LIQUID_MINER_HULL_*/_TRACK_*  miner silhouette rects, player-local px
  //   LIQUID_MINER_CX/_CY .... eject centre
  //  Active region / sleep / skip — the mitigations above:
  //   LIQUID_ACTIVE_MARGIN ... freeze margin around the camera, in screens
  //   LIQUID_SLEEP_FRAMES .... low-motion frames before a particle sleeps
  //   LIQUID_SLEEP_VSQ ....... velocity^2 below which a particle is "still"
  //   LIQUID_WAKE_CELL_VSQ ... local cell velocity^2 that re-wakes a sleeper
  //   LIQUID_SIM_FORCE_EVERY . heartbeat: force a full step every N frames
  //   LIQUID_SIM_PLAYER_VEL_GATE  player speed below which it counts as calm
  //  Economy:
  //   LIQUID_OIL_VALUE ....... dollars per gallon of oil sold
  //   LIQUID_OIL_PER_PARTICLE  gallons one oil particle is worth
  // ============================================================
  function liquidGetCell(gx, gy) {
    // Composite unique key for (gx, gy) — valid range ±4096.
    var key = (gx + 4096) + (gy + 4096) * 8192;
    // Knuth multiplicative hash → slot index. Math.imul for 32-bit overflow.
    var slot = (Math.imul(key, 2654435761) >>> 0) & LIQUID_HASH_MASK;
    var stamp = liquidHashFrame;
    while (liquidHashStamp[slot] === stamp) {
      if (liquidHashKeys[slot] === key) return liquidHashVals[slot];
      slot = (slot + 1) & LIQUID_HASH_MASK;
    }
    if (liquidGridCount >= LIQUID_MAX_CELLS) return -1;
    var idx = liquidGridCount++;
    liquidHashStamp[slot] = stamp;
    liquidHashKeys[slot] = key;
    liquidHashVals[slot] = idx;
    liquidGridKeys[idx] = key;
    liquidCellGX[idx] = gx;
    liquidCellGY[idx] = gy;
    liquidCellMass[idx] = 0;
    liquidCellOilMass[idx] = 0;
    liquidCellAeration[idx] = 0;
    liquidCellVX[idx] = 0;
    liquidCellVY[idx] = 0;
    liquidCellDVX[idx] = 0;
    liquidCellDVY[idx] = 0;
    return idx;
  }

  function liquidClearGrid() {
    liquidGridCount = 0;
    // Bump the stamp so all hash slots are treated empty without re-zeroing.
    liquidHashFrame++;
    if (liquidHashFrame === 0 || liquidHashFrame > 2000000000) {
      liquidHashStamp.fill(0);
      liquidHashFrame = 1;
    }
  }

  // v10.99 — returns the number of awake (non-frozen, non-sleeping)
  // particles. Fused with the active-region update so we only walk
  // the particle array once instead of twice.
  function liquidUpdateActiveRegion() {
    var activeMargin = LIQUID_ACTIVE_MARGIN;
    var marginX = screenW * activeMargin;
    var marginY = screenH * activeMargin;
    var l = cam.x - marginX;
    var r = cam.x + screenW + marginX;
    var t = cam.y - marginY;
    var b = cam.y + screenH + marginY;
    // v24.115 — never CUT a filled surface pond (CPU-mode twin of the
    // getView extension in 020-state: a region edge inside a connected
    // body of water makes the live side churn against the frozen side).
    if (surfacePonds) {
      var pTop = (SKY_ROWS - 3) * TILE;
      for (var pi = 0; pi < surfacePonds.length; pi++) {
        var pd = surfacePonds[pi];
        if (!pd.filled) continue;
        // v24.148 — depth-aware: a deep lake's body must NEVER be cut by
        // the region either (same vacuum-wave bug as v24.118, vertically).
        var pBot = (SKY_ROWS + (pd.d || 1) + 2) * TILE;
        var pl = (pd.cL - 2) * TILE, pr = (pd.cR + 3) * TILE;
        if (pr <= l || pl >= r) continue;
        if (pBot <= t || pTop >= b) continue;
        if (pl < l) l = pl;
        if (pr > r) r = pr;
        if (pTop < t) t = pTop;
        if (pBot > b) b = pBot;
      }
    }
    var awake = 0, sleeping = 0, frozen = 0, fastN = 0;
    for (var i = 0; i < liquidCount; i++) {
      var x = liquidX[i];
      var y = liquidY[i];
      var nowFrozen = (x < l || x > r || y < t || y > b) ? 1 : 0;
      if (liquidFrozen[i] && !nowFrozen) {
        // v11.43 — zero velocity on wake so off-screen particles don't
        // shoot out at the player when they re-enter the active region.
        liquidVX[i] = 0;
        liquidVY[i] = 0;
        liquidSleeping[i] = 0;
        liquidRestFrames[i] = 0;
        liquidOrphanDwell[i] = 0;   // v24.175 — thawed particle starts fresh, not a stale stray
      }
      liquidFrozen[i] = nowFrozen;
      if (nowFrozen) frozen++;
      else if (liquidSleeping[i]) sleeping++;
      else {
        awake++;
        // v24.145 — fast-mover tally for the state machine (CPU-path twin
        // of the applyReadback tally in liquid-wgpu.js).
        var fvx = liquidVX[i], fvy = liquidVY[i];
        if (fvx * fvx + fvy * fvy > LIQUID_FAST_VSQ) fastN++;
      }
    }
    liquidStatAwake = awake;
    liquidStatSleeping = sleeping;
    liquidStatFrozen = frozen;
    liquidFastCount = fastN;
    return awake;
  }

  // ---- Surface-pond streaming (v24.11) ----
  // The world is peppered with 1-deep stone-lined pond PITS (surfacePonds[],
  // carved at worldgen). Filling them all at full density would blow the
  // particle budget AND starve the underground liquids, so we STREAM them: only
  // the pool(s) overlapping the camera's liquid active region hold water; the
  // rest are dry pits. Spacing (gap > the ~81-tile active region) keeps ~1 full
  // pool live at a time. Hysteresis — fill at the active edge, drain only past a
  // wider edge — stops fill/drain thrashing at a boundary. Runs each frame just
  // before updateLiquids (cam.x is already current from updateCamera).
  function surfacePondNeed(pond) {
    // v24.148 — deep lakes: full density over the whole body (width x depth
    // tiles). Old saves carry depth-less ponds: d defaults to 1.
    return (pond.cR - pond.cL + 1) * (pond.d || 1) * LIQUID_SURFACE_WATER_PARTICLES_PER_TILE;
  }
  // ALL-OR-NOTHING fill: a wide pool is ~21600 particles, so if the budget
  // can't hold the WHOLE pool we spawn NONE (and retry next frame once a drain
  // frees room). Half-filling left a dry right half — "water only in half the
  // lake" — because addLiquidParticle bails at the cap mid-grid. Returns true
  // only if the pool was actually filled.
  //
  // BORN SETTLED (v24.106): the same 400/tile budget is now placed at the
  // sim's REST spacing (LIQUID_CELL * LIQUID_PDELTA = 1.25 px) from the pit
  // floor UP, so the pool appears already at rest density at its settled
  // water line. The old TILE/20 lattice filled the whole tile at ~61% of
  // rest density; gravity then compacted it ~a third of a tile and the
  // surface sloshed for seconds. Since the sim region follows the camera,
  // that settle was pinned to the player's approach ("the lake is always
  // settling when I roll up"). Spawning at rest density removes the
  // transient entirely; the settled level is unchanged.
  function fillSurfacePond(pond) {
    var need = surfacePondNeed(pond);
    if (liquidCount + need > LIQUID_MAX_PARTICLES) return false;
    var wo = liquidSurfaceOriginForType('water');
    var step = LIQUID_CELL * LIQUID_PDELTA;     // rest spacing, density = 1/PDELTA^2
    // v24.115 — inset the lattice from the walls/floor by the collide probe
    // radius, so edge particles are not born interpenetrating the stone
    // (each fill otherwise starts with a positional-correction punch at
    // both walls).
    var inset = LIQUID_CELL * LIQUID_PDELTA * 0.85;
    var wx0 = pond.cL * TILE + inset, wx1 = (pond.cR + 1) * TILE - inset;
    var pondD = pond.d || 1;                    // v24.148 — deep lakes (old saves: 1)
    var floorY = (SKY_ROWS + pondD) * TILE;     // pit floor under d rows of water
    var placed = 0;
    var rowCap = Math.floor((wx1 - wx0) / step);
    for (var wy = floorY - inset; placed < need && wy > floorY - TILE * (pondD + 1); wy -= step) {
      var remaining = need - placed;
      if (remaining < rowCap) {
        // Final partial row: spread it across the full width so the surface
        // stays level instead of piling the remainder at the left edge.
        var spread = (wx1 - wx0) / remaining;
        for (var k = 0; k < remaining; k++) {
          addLiquidParticle('water', wx0 + (k + 0.5) * spread, wy, 0, 0, wo);
          placed++;
        }
      } else {
        for (var wx = wx0 + step * 0.5; wx < wx1 && placed < need; wx += step) {
          addLiquidParticle('water', wx, wy, 0, 0, wo);
          placed++;
        }
      }
    }
    return true;
  }
  function drainSurfacePond(pond) {
    var so = liquidSurfaceOriginForType('water');     // surface-water origin (1)
    var wx0 = pond.cL * TILE, wx1 = (pond.cR + 1) * TILE;
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 0 || liquidOrigin[i] !== so) continue;   // surface water only (not oil / dynamic)
      if (liquidX[i] < wx0 || liquidX[i] >= wx1) continue;           // only this pond's column span
      removeLiquidParticle(i);
    }
  }
  // Drop any surface-pond water (origin 1) that is NOT inside a currently-filled
  // pool. A 1-deep pool only has 1-tall walls, so the player splashing through
  // one can fling water OVER the wall onto the shore; that escaped water never
  // drains, accumulates against the LIQUID_MAX_PARTICLES cap, and then later
  // pools fill only partway ("water in half the lake"). v24.107 rules:
  //   - Visibility guard: never delete water inside the drain hysteresis
  //     envelope around the camera, so droplets the player is looking at
  //     never vanish; they are collected once well off-screen.
  //   - Surface band only: water deliberately drained DOWN a shaft (the dig
  //     wake's "water chasing you down" behaviour) keeps its origin flag and
  //     must survive; the sweep only collects litter near the surface row.
  var liquidStrayTick = 0;
  function sweepStraySurfaceWater() {
    var so = liquidSurfaceOriginForType('water');
    var guard = LIQUID_ACTIVE_MARGIN + 0.4;
    var gx0 = cam.x - screenW * guard, gx1 = cam.x + screenW * (1 + guard);
    var gy0 = cam.y - screenH * guard, gy1 = cam.y + screenH * (1 + guard);
    var yMax = (SKY_ROWS + 3) * TILE;
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 0 || liquidOrigin[i] !== so) continue;
      var x = liquidX[i], y = liquidY[i];
      if (y >= yMax) continue;                                   // canal/shaft water survives
      if (x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1) continue; // in or near view: leave it
      var inPool = false;
      for (var p = 0; p < surfacePonds.length; p++) {
        var pond = surfacePonds[p];
        if (!pond.filled) continue;
        if (x >= pond.cL * TILE && x < (pond.cR + 1) * TILE) { inPool = true; break; }
      }
      if (!inPool) removeLiquidParticle(i);
    }
  }
  function updateSurfacePondStreaming() {
    if (!surfacePonds || !surfacePonds.length) return;
    var fillEdge = screenW * LIQUID_ACTIVE_MARGIN;                 // fill as the pool enters the sim window
    var dropEdge = screenW * (LIQUID_ACTIVE_MARGIN + 0.4);         // drain only once well outside (hysteresis)
    var camL = cam.x, camR = cam.x + screenW;
    var p, pond, px0, px1;
    var drained = false;
    // Pass 1 — DRAIN pools that left the window first, so their budget is freed
    // BEFORE any fill. (Spacing keeps ~1 pool live in normal play, but a teleport
    // can jump straight onto a new pool while the old is still filled; draining
    // first means a wide pool — up to ~21600 particles — never doubles up over
    // the LIQUID_MAX_PARTICLES cap mid-pass.)
    for (p = 0; p < surfacePonds.length; p++) {
      pond = surfacePonds[p];
      if (!pond.filled) continue;
      px0 = pond.cL * TILE; px1 = (pond.cR + 1) * TILE;
      if (px1 <= camL - dropEdge || px0 >= camR + dropEdge) {
        drainSurfacePond(pond);
        pond.filled = false;
        drained = true;
      }
    }
    // Pass 2: sweep escaped strays. Runs right after any drain (the budget is
    // about to be re-spent on a fill), on a slow ~2s cadence so shore litter
    // can't accumulate across a long session, and immediately when surface
    // water has crept past ~half the budget so the fill below isn't starved
    // (which would truncate it into a half-empty lake). The sweep itself
    // never touches water in or near the visible window.
    liquidStrayTick++;
    // v24.120 debug kit — NO_SWEEP exempts the sweep entirely (its REMOVE
    // ops yank support out from under neighbours; if the firecrackers stop
    // with this on, the sweep is the culprit). The tick keeps counting so
    // toggling back on doesn't fire an immediate catch-up sweep.
    if (!LIQUID_DBG_NO_SWEEP && (drained || liquidStrayTick >= 120 || liquidCount > LIQUID_MAX_PARTICLES * 0.6)) {   // v24.149 — was a hardcoded 20000 (= half the OLD budget)
      liquidStrayTick = 0;
      sweepStraySurfaceWater();
    }
    // Pass 3 — FILL pools that entered the window (all-or-nothing; only flag
    // filled if the whole pool actually fit the budget).
    for (p = 0; p < surfacePonds.length; p++) {
      pond = surfacePonds[p];
      if (pond.filled) continue;
      px0 = pond.cL * TILE; px1 = (pond.cR + 1) * TILE;
      if (px1 > camL - fillEdge && px0 < camR + fillEdge) {
        if (fillSurfacePond(pond)) pond.filled = true;
      }
    }
  }

  // Tests a world-space point against the miner's *visual* silhouette
  // (hull + tracks rects), mirroring local-x when the miner faces left.
  // Cheap — two AABB tests after a subtract.
  function liquidPointInMiner(x, y) {
    if (!player || gameWon) return false;
    var lx = x - player.x;
    var ly = y - player.y;
    if (player.dir < 0) lx = PLAYER_W - lx;
    if (lx >= LIQUID_MINER_HULL_L && lx <= LIQUID_MINER_HULL_R
        && ly >= LIQUID_MINER_HULL_T && ly <= LIQUID_MINER_HULL_B) return true;
    if (lx >= LIQUID_MINER_TRACK_L && lx <= LIQUID_MINER_TRACK_R
        && ly >= LIQUID_MINER_TRACK_T && ly <= LIQUID_MINER_TRACK_B) return true;
    return false;
  }

  function liquidGridWorldSolid(gx, gy) {
    // Tile-only for the grid boundary bounce. The miner is handled by the
    // wake function (eject); making it a "solid" here caused the boundary
    // bounce to wipe out the eject impulse, parking water on the hull.
    var x = (gx + 0.5) * LIQUID_CELL;
    var y = (gy + 0.5) * LIQUID_CELL;
    return liquidWorldSolidAt(x, y);
  }

  function liquidP2G(stepDt) {
    liquidClearGrid();
    var invCell = 1 / LIQUID_CELL;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i]) continue;
      var px = liquidX[i];
      var py = liquidY[i];
      liquidPrevX[i] = px;
      liquidPrevY[i] = py;
      var lx = px * invCell;
      var ly = py * invCell;
      liquidLX[i] = lx;
      liquidLY[i] = ly;
      var pvx = liquidVX[i] * stepDt * invCell;
      var pvy = liquidVY[i] * stepDt * invCell;
      liquidPVX[i] = pvx;
      liquidPVY[i] = pvy;

      var gx = Math.floor(lx);
      var gy = Math.floor(ly);
      var dx = gx + 0.5 - lx;
      var dy = gy + 0.5 - ly;
      liquidGX[i] = gx;
      liquidGY[i] = gy;
      liquidDX[i] = dx;
      liquidDY[i] = dy;

      var wx0 = (dx + 0.5) * (dx + 0.5) * 0.5;
      var wx1 = 0.75 - dx * dx;
      var wx2 = (dx - 0.5) * (dx - 0.5) * 0.5;
      var wy0 = (dy + 0.5) * (dy + 0.5) * 0.5;
      var wy1 = 0.75 - dy * dy;
      var wy2 = (dy - 0.5) * (dy - 0.5) * 0.5;

      var g00 = liquidG00[i];
      var g01 = liquidG01[i];
      var g10 = liquidG10[i];
      var g11 = liquidG11[i];
      var cvx = pvx + g00 * dx + g01 * dy;
      var cvy = pvy + g10 * dx + g11 * dy;
      var aer = liquidAeration[i];
      var base = i * 9;
      var oilWeight = liquidType[i] === 1 ? 1 : 0;

      // v10.94 — split the inner stencil into water and oil paths.
      // Water particles (the vast majority) skip the OilMass write
      // (which was += 0 for them). Saves up to 9 typed-array writes
      // per water particle = ~270k writes/frame in a full pool.
      // Also folded the `+ -1 *` / `+ 0 *` literals down to plain
      // subtractions / drops so JIT sees clean adds.
      var w, c;
      var rowY;
      if (oilWeight) {
        // Oil path — keep oil mass tracking
        rowY = gy - 1;
        w = wx0 * wy0; liquidW[base + 0] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 0] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00 - g01); liquidCellVY[c] += w * (cvy - g10 - g11); }
        w = wx1 * wy0; liquidW[base + 1] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 1] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g01); liquidCellVY[c] += w * (cvy - g11); }
        w = wx2 * wy0; liquidW[base + 2] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 2] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00 - g01); liquidCellVY[c] += w * (cvy + g10 - g11); }
        rowY = gy;
        w = wx0 * wy1; liquidW[base + 3] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 3] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00); liquidCellVY[c] += w * (cvy - g10); }
        w = wx1 * wy1; liquidW[base + 4] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 4] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * cvx; liquidCellVY[c] += w * cvy; }
        w = wx2 * wy1; liquidW[base + 5] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 5] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00); liquidCellVY[c] += w * (cvy + g10); }
        rowY = gy + 1;
        w = wx0 * wy2; liquidW[base + 6] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 6] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00 + g01); liquidCellVY[c] += w * (cvy - g10 + g11); }
        w = wx1 * wy2; liquidW[base + 7] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 7] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g01); liquidCellVY[c] += w * (cvy + g11); }
        w = wx2 * wy2; liquidW[base + 8] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 8] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellOilMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00 + g01); liquidCellVY[c] += w * (cvy + g10 + g11); }
      } else {
        // Water path — skip the OilMass write entirely.
        rowY = gy - 1;
        w = wx0 * wy0; liquidW[base + 0] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 0] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00 - g01); liquidCellVY[c] += w * (cvy - g10 - g11); }
        w = wx1 * wy0; liquidW[base + 1] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 1] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g01); liquidCellVY[c] += w * (cvy - g11); }
        w = wx2 * wy0; liquidW[base + 2] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 2] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00 - g01); liquidCellVY[c] += w * (cvy + g10 - g11); }
        rowY = gy;
        w = wx0 * wy1; liquidW[base + 3] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 3] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00); liquidCellVY[c] += w * (cvy - g10); }
        w = wx1 * wy1; liquidW[base + 4] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 4] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * cvx; liquidCellVY[c] += w * cvy; }
        w = wx2 * wy1; liquidW[base + 5] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 5] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00); liquidCellVY[c] += w * (cvy + g10); }
        rowY = gy + 1;
        w = wx0 * wy2; liquidW[base + 6] = w; c = liquidGetCell(gx - 1, rowY); liquidNbrs[base + 6] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx - g00 + g01); liquidCellVY[c] += w * (cvy - g10 + g11); }
        w = wx1 * wy2; liquidW[base + 7] = w; c = liquidGetCell(gx,     rowY); liquidNbrs[base + 7] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g01); liquidCellVY[c] += w * (cvy + g11); }
        w = wx2 * wy2; liquidW[base + 8] = w; c = liquidGetCell(gx + 1, rowY); liquidNbrs[base + 8] = c;
        if (c >= 0) { liquidCellMass[c] += w; liquidCellAeration[c] += w * aer; liquidCellVX[c] += w * (cvx + g00 + g01); liquidCellVY[c] += w * (cvy + g10 + g11); }
      }
    }

    for (var ci = 0; ci < liquidGridCount; ci++) {
      if (liquidCellMass[ci] > 0) liquidCellAeration[ci] /= liquidCellMass[ci];
    }
  }

  function liquidApplyGridPressure() {
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i] || liquidSleeping[i]) continue;
      var base = i * 9;
      var density = 0;
      var aeration = 0;
      // Gather — single pass over cached neighbor indices.
      for (var s = 0; s < 9; s++) {
        var c = liquidNbrs[base + s];
        if (c < 0) continue;
        var w = liquidW[base + s];
        density += w * liquidCellMass[c];
        aeration += w * liquidCellAeration[c];
      }

      // v24.182 — clamp the density blow-up before it feeds the pressure (the
      // anti-runaway cap; see LIQUID_DENS_CAP in 010-constants).
      if (density > LIQUID_DENS_CAP) density = LIQUID_DENS_CAP;
      liquidDensity[i] = density;
      var oil = liquidType[i] === 1;
      var aerDamp = oil ? LIQUID_OIL_AERATION_DAMP : LIQUID_AERATION_DAMP;
      var aerBlur = oil ? LIQUID_OIL_AERATION_BLUR : LIQUID_AERATION_BLUR;
      liquidAeration[i] = aerDamp * (liquidAeration[i] + (aeration - liquidAeration[i]) * aerBlur);
      var stiff = oil ? LIQUID_OIL_PRESSURE_STIFF : LIQUID_PRESSURE_STIFF;
      var pressure = (density / LIQUID_DENSITY - 1) * stiff;
      if (pressure < 0 || density <= 0) pressure = 0;
      var volume = density > 0 ? 1 / density : 0;
      var coeff = volume * 4 * -pressure;
      var coeffx = coeff * liquidDX[i];
      var coeffy = coeff * liquidDY[i];

      // Scatter — same cached cells.
      if (coeff !== 0) {
        // v10.95 — folded `+ -1 *` / `+ 1 *` constant noise to plain
        // arithmetic, matches the v10.94 P2G cleanup. Pre-computed
        // `cxm = coeffx - coeff`, `cxp = coeffx + coeff`, `cym/cyp`
        // so each cell visits two adds + one mul + one write per axis.
        var cxm = coeffx - coeff, cxp = coeffx + coeff;
        var cym = coeffy - coeff, cyp = coeffy + coeff;
        var c0 = liquidNbrs[base + 0]; if (c0 >= 0) { var w0 = liquidW[base + 0]; liquidCellDVX[c0] -= w0 * cxm;     liquidCellDVY[c0] -= w0 * cym; }
        var c1 = liquidNbrs[base + 1]; if (c1 >= 0) { var w1 = liquidW[base + 1]; liquidCellDVX[c1] -= w1 * coeffx;  liquidCellDVY[c1] -= w1 * cym; }
        var c2 = liquidNbrs[base + 2]; if (c2 >= 0) { var w2 = liquidW[base + 2]; liquidCellDVX[c2] -= w2 * cxp;     liquidCellDVY[c2] -= w2 * cym; }
        var c3 = liquidNbrs[base + 3]; if (c3 >= 0) { var w3 = liquidW[base + 3]; liquidCellDVX[c3] -= w3 * cxm;     liquidCellDVY[c3] -= w3 * coeffy; }
        var c4 = liquidNbrs[base + 4]; if (c4 >= 0) { var w4 = liquidW[base + 4]; liquidCellDVX[c4] -= w4 * coeffx;  liquidCellDVY[c4] -= w4 * coeffy; }
        var c5 = liquidNbrs[base + 5]; if (c5 >= 0) { var w5 = liquidW[base + 5]; liquidCellDVX[c5] -= w5 * cxp;     liquidCellDVY[c5] -= w5 * coeffy; }
        var c6 = liquidNbrs[base + 6]; if (c6 >= 0) { var w6 = liquidW[base + 6]; liquidCellDVX[c6] -= w6 * cxm;     liquidCellDVY[c6] -= w6 * cyp; }
        var c7 = liquidNbrs[base + 7]; if (c7 >= 0) { var w7 = liquidW[base + 7]; liquidCellDVX[c7] -= w7 * coeffx;  liquidCellDVY[c7] -= w7 * cyp; }
        var c8 = liquidNbrs[base + 8]; if (c8 >= 0) { var w8 = liquidW[base + 8]; liquidCellDVX[c8] -= w8 * cxp;     liquidCellDVY[c8] -= w8 * cyp; }
      }
    }
  }

  function liquidApplyPlayerGridWake(c, stepDt) {
    if (!player || gameWon || LIQUID_DBG_NO_PLAYER) return;   // v24.167 diagnostic: rig invisible to water
    var gx = (liquidCellGX[c] + 0.5) * LIQUID_CELL;
    var gy = (liquidCellGY[c] + 0.5) * LIQUID_CELL;
    // Compute local coords (mirrored when facing left).
    var lx = gx - player.x;
    var ly = gy - player.y;
    var mirrored = player.dir < 0;
    if (mirrored) lx = PLAYER_W - lx;
    var inHull = (lx >= LIQUID_MINER_HULL_L && lx <= LIQUID_MINER_HULL_R
                  && ly >= LIQUID_MINER_HULL_T && ly <= LIQUID_MINER_HULL_B);
    var inTrack = (lx >= LIQUID_MINER_TRACK_L && lx <= LIQUID_MINER_TRACK_R
                   && ly >= LIQUID_MINER_TRACK_T && ly <= LIQUID_MINER_TRACK_B);
    if (inHull || inTrack) {
      // Eject along the nearest-face normal of the containing rect — water
      // on top gets straight up, water on the side gets sideways. Far
      // faster exit than a radial-from-center push (which fires water back
      // into the miner from the opposite face).
      var rL, rT, rR, rB;
      if (inHull) {
        rL = LIQUID_MINER_HULL_L; rT = LIQUID_MINER_HULL_T;
        rR = LIQUID_MINER_HULL_R; rB = LIQUID_MINER_HULL_B;
      } else {
        rL = LIQUID_MINER_TRACK_L; rT = LIQUID_MINER_TRACK_T;
        rR = LIQUID_MINER_TRACK_R; rB = LIQUID_MINER_TRACK_B;
      }
      var dL = lx - rL;
      var dR = rR - lx;
      var dT = ly - rT;
      var dB = rB - ly;
      var nx = -1, ny = 0, minD = dL;
      if (dR < minD) { minD = dR; nx = 1; ny = 0; }
      if (dT < minD) { minD = dT; nx = 0; ny = -1; }
      if (dB < minD) { minD = dB; nx = 0; ny = 1; }
      if (mirrored) nx = -nx;
      // v24.125 — the silhouette coupling, two modes by rig speed (deadzone
      // 8 px/s, full eject at 60 px/s). MOVING: the nearest-face eject
      // clears water the miner plows through (its original job), scaled by
      // speed. STATIC: in-silhouette cells PIN to the hull velocity — they
      // hold splat mass but contain no particles and sit outside the
      // terrain boundary handling, so under gravity they free-fall forever
      // and G2P feeds that back as a perpetual jet at the hull base. The
      // old unconditional 720 px/s² eject masked that with its own jet
      // (~143 px/s along the floor) — between them, THE resting-pond
      // firecracker pump: the jet's waves wake-burst sleeping clusters
      // pond-wide. edit² liquid-wgpu gridWake (GameParams counts.zw carry
      // the rig velocity; the kernel computes the same gate).
      var pvm = Math.abs(player.vx) + Math.abs(player.vy);
      var ejs = (pvm - 8) / 52;
      if (ejs <= 0) {
        // Below the deadzone pin to EXACT zero — a grounded/floating rig
        // can idle with a small residual vx/vy (contact physics), and
        // pinning cells to that re-injects a few px/s forever.
        liquidCellVX[c] = 0;
        liquidCellVY[c] = 0;
        return;
      }
      if (ejs > 1) ejs = 1;
      var eject = LIQUID_PLAYER_EJECT * ejs * stepDt / LIQUID_CELL;
      liquidCellVX[c] += nx * eject;
      liquidCellVY[c] += ny * eject;
      return;
    }
    // No drag ring outside the silhouette. The silhouette eject already
    // handles displacement when the miner plows through water; a velocity-
    // lerp toward the player just makes water ride along on top instead
    // of slipping off, which is exactly the bug we don't want.
  }

  function liquidApplyRocketGridWake(c, stepDt) {
    if (rocketIntensity <= 0.02 || !player || !player.thrusting) return;
    var ed = rocketExhaustDir();
    var nozzles = rocketNozzles();
    var gx = (liquidCellGX[c] + 0.5) * LIQUID_CELL;
    var gy = (liquidCellGY[c] + 0.5) * LIQUID_CELL;
    var wakeVX = 0;
    var wakeVY = 0;
    for (var ni = 0; ni < nozzles.length; ni++) {
      var base = nozzles[ni];
      var dx = gx - base.x;
      var dy = gy - base.y;
      var along = dx * ed.x + dy * ed.y;
      if (along < -4 || along > TILE * 5.5) continue;
      var alongPos = Math.max(0, along);
      var perp = Math.abs(dx * -ed.y + dy * ed.x);
      var cone = 13 + alongPos * 0.22;
      if (perp > cone) continue;
      if (!liquidLineClear(base.x, base.y, gx, gy)) continue;
      var mouthBoost = alongPos < 18 ? 1.35 : 1;
      var falloff = (1 - alongPos / (TILE * 5.5)) * (1 - perp / cone) * mouthBoost;
      var force = 560 * rocketIntensity * falloff * stepDt / LIQUID_CELL;
      wakeVX += ed.x * force;
      wakeVY += ed.y * force;
    }
    liquidCellVX[c] += wakeVX;
    liquidCellVY[c] += wakeVY;
  }

  function liquidApplyExplosionGridWake(c, stepDt) {
    if (!explosions.length) return;
    var gx = (liquidCellGX[c] + 0.5) * LIQUID_CELL;
    var gy = (liquidCellGY[c] + 0.5) * LIQUID_CELL;
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      if (ex.t > 0.22) continue;
      var dx = gx - ex.cx;
      var dy = gy - ex.cy;
      var d2 = dx * dx + dy * dy;
      var r = ex.r * 1.15;
      if (d2 > r * r || d2 <= 0.0001) continue;
      var d = Math.sqrt(d2);
      var k = 1 - d / r;
      var blast = (ex.large ? 1050 : 660) * k * stepDt / LIQUID_CELL;
      liquidCellVX[c] += dx / d * blast;
      liquidCellVY[c] += dy / d * blast - 90 * k * stepDt / LIQUID_CELL;
    }
  }

  // v24.115 — read-only twin of liquidGetCell: returns the cell index or
  // -1, never inserts (the grid-viscosity neighbour lookup must not
  // allocate cells).
  function liquidPeekCell(gx, gy) {
    var key = (gx + 4096) + (gy + 4096) * 8192;
    var slot = (Math.imul(key, 2654435761) >>> 0) & LIQUID_HASH_MASK;
    var stamp = liquidHashFrame;
    while (liquidHashStamp[slot] === stamp) {
      if (liquidHashKeys[slot] === key) return liquidHashVals[slot];
      slot = (slot + 1) & LIQUID_HASH_MASK;
    }
    return -1;
  }

  function liquidUpdateGrid(stepDt) {
    // v10.95 — pre-compute the 5 oil-vs-water lerp deltas + gravScale
    // once per call instead of per cell. Behaviour-neutral.
    // v10.96 — reverted the player-wake bbox gate from v10.95; it
    // affected water behaviour visibly and added <0.1ms of perf.
    var OIL_GRAV_DLT  = LIQUID_OIL_GRAVITY - LIQUID_GRAVITY;
    var OIL_BIN_DLT   = LIQUID_OIL_WALL_BOUNCE_IN - LIQUID_WALL_BOUNCE_IN;
    var OIL_BEDG_DLT  = LIQUID_OIL_WALL_BOUNCE_EDGE - LIQUID_WALL_BOUNCE_EDGE;
    var OIL_FFR_DLT   = LIQUID_OIL_FLOOR_FRICTION - LIQUID_FLOOR_FRICTION;
    var OIL_WFR_DLT   = LIQUID_OIL_WALL_FRICTION - LIQUID_WALL_FRICTION;
    var gravScale = stepDt * stepDt / LIQUID_CELL;
    // v24.115 phase 1 — resolve the RAW velocity of every massy cell into
    // the DV arrays (consumed exactly here, so they are free as scratch).
    // The viscosity blend in phase 2 must read UN-blended neighbours,
    // exactly like the GPU kernel's recompute-from-accumulators gather;
    // blending in-place in one pass would mix blended and raw neighbours.
    for (var c = 0; c < liquidGridCount; c++) {
      if (liquidCellMass[c] > 0) {
        var invm = 1 / liquidCellMass[c];
        var oilK = liquidCellOilMass[c] * invm;
        var grav = (LIQUID_GRAVITY + OIL_GRAV_DLT * oilK) * gravScale;
        liquidCellDVX[c] = (liquidCellVX[c] + liquidCellDVX[c]) * invm;
        liquidCellDVY[c] = (liquidCellVY[c] + liquidCellDVY[c]) * invm + grav;
      } else {
        liquidCellDVX[c] = 0;
        liquidCellDVY[c] = 0;
      }
    }
    // phase 2 — grid viscosity (anti-phase oscillation cancels, uniform
    // flow passes through), then wakes + boundary on the blended velocity.
    for (var c2 = 0; c2 < liquidGridCount; c2++) {
      if (liquidCellMass[c2] > 0) {
        var vX = liquidCellDVX[c2];
        var vY = liquidCellDVY[c2];
        var cgx = liquidCellGX[c2];
        var cgy = liquidCellGY[c2];
        // v24.145 — liquidGridViscEff is the calm-blended viscosity
        // (lerp(VISC_LIVE, LIQUID_GRID_VISC lever, calm), liquidStateTick):
        // lively splashes read as water, settling ponds keep the proven
        // v24.118 0.45 smoothing. The GPU gets the same blended value via
        // setSimParam('GRID_VISC') each frame.
        if (liquidGridViscEff > 0) {
          var sX = 0, sY = 0, sN = 0, nc;
          nc = liquidPeekCell(cgx - 1, cgy);
          if (nc >= 0 && liquidCellMass[nc] > 0) { sX += liquidCellDVX[nc]; sY += liquidCellDVY[nc]; sN++; }
          nc = liquidPeekCell(cgx + 1, cgy);
          if (nc >= 0 && liquidCellMass[nc] > 0) { sX += liquidCellDVX[nc]; sY += liquidCellDVY[nc]; sN++; }
          nc = liquidPeekCell(cgx, cgy - 1);
          if (nc >= 0 && liquidCellMass[nc] > 0) { sX += liquidCellDVX[nc]; sY += liquidCellDVY[nc]; sN++; }
          nc = liquidPeekCell(cgx, cgy + 1);
          if (nc >= 0 && liquidCellMass[nc] > 0) { sX += liquidCellDVX[nc]; sY += liquidCellDVY[nc]; sN++; }
          if (sN > 0) {
            vX += (sX / sN - vX) * liquidGridViscEff;
            vY += (sY / sN - vY) * liquidGridViscEff;
          }
        }
        liquidCellVX[c2] = vX;
        liquidCellVY[c2] = vY;
        var oilK2 = liquidCellOilMass[c2] / liquidCellMass[c2];
        var bounceIn = LIQUID_WALL_BOUNCE_IN + OIL_BIN_DLT * oilK2;
        var bounceEdge = LIQUID_WALL_BOUNCE_EDGE + OIL_BEDG_DLT * oilK2;
        var floorFriction = LIQUID_FLOOR_FRICTION + OIL_FFR_DLT * oilK2;
        var wallFriction = LIQUID_WALL_FRICTION + OIL_WFR_DLT * oilK2;
        liquidApplyPlayerGridWake(c2, stepDt);
        liquidApplyRocketGridWake(c2, stepDt);
        liquidApplyExplosionGridWake(c2, stepDt);
        var selfSolid = liquidGridWorldSolid(cgx, cgy);
        if (selfSolid) {
          liquidCellVX[c2] *= -bounceIn;
          liquidCellVY[c2] *= -bounceIn;
        } else {
          var leftSolid = liquidGridWorldSolid(cgx - 1, cgy);
          var rightSolid = liquidGridWorldSolid(cgx + 1, cgy);
          var upSolid = liquidGridWorldSolid(cgx, cgy - 1);
          var downSolid = liquidGridWorldSolid(cgx, cgy + 1);
          var bEdge = -bounceEdge;
          if (leftSolid && liquidCellVX[c2] < 0) liquidCellVX[c2] *= bEdge;
          if (rightSolid && liquidCellVX[c2] > 0) liquidCellVX[c2] *= bEdge;
          if (upSolid && liquidCellVY[c2] < 0) liquidCellVY[c2] *= bEdge;
          if (downSolid && liquidCellVY[c2] > 0) liquidCellVY[c2] *= bEdge;
          // Surface friction. Floor brakes lateral motion; walls brake
          // vertical motion. Stops the "shoot-along-the-surface" jet that
          // pressure scatter creates on flat floors with no drag.
          if (downSolid) liquidCellVX[c2] *= floorFriction;
          if (leftSolid || rightSolid) liquidCellVY[c2] *= wallFriction;
        }
      } else {
        liquidCellVX[c2] = 0;
        liquidCellVY[c2] = 0;
      }
    }
  }

  function liquidG2P(stepDt) {
    var minX = 1 + 1e-3;
    var maxX = COLS * TILE / LIQUID_CELL - minX;
    var minY = -400 * TILE / LIQUID_CELL;
    var maxY = (TOTAL_ROWS + 1) * TILE / LIQUID_CELL;
    var invStep = 1 / stepDt;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i]) continue;
      var base = i * 9;
      if (liquidSleeping[i]) {
        if (LIQUID_DBG_NO_SLEEP) {
          // v24.120 debug kit — sleep disabled: force-wake instead of
          // scanning, so an already-dozing pond un-sleeps live.
          liquidSleeping[i] = 0;
          liquidRestFrames[i] = 0;
        } else {
          // Scan all 9 stencil cells — disturbances directly under the particle
          // (e.g. miner ejection in cells below us) need to wake it too, not
          // just disturbances at the particle's exact center cell.
          var wakeMax = 0;
          for (var ws = 0; ws < 9; ws++) {
            var wc = liquidNbrs[base + ws];
            if (wc < 0) continue;
            var wvx = liquidCellVX[wc];
            var wvy = liquidCellVY[wc];
            var wmag = wvx * wvx + wvy * wvy;
            if (wmag > wakeMax) wakeMax = wmag;
          }
          // v24.150 — while LIVELY (calm < 0.5) the wake bar drops ~8x so
          // long low-amplitude swells recruit sleepers and big waves can
          // cross the whole lake (saharan's tank: nothing sleeps, the
          // whole body participates). Settled keeps the strict v24.125
          // bar. edit2 liquid-wgpu.js (kernel + reference).
          var wakeBar = LIQUID_WAKE_CELL_VSQ;
          if (LIQUID_CALM < 0.5) wakeBar = LIQUID_WAKE_CELL_VSQ * 0.12;
          if (wakeMax < wakeBar) continue;
          liquidSleeping[i] = 0;
          liquidRestFrames[i] = 0;
        }
      }
      var vx = 0;
      var vy = 0;
      var gv00 = 0;
      var gv01 = 0;
      var gv10 = 0;
      var gv11 = 0;
      // v10.97 — unrolled 9-iter gather, hardcoded stencil ox/oy.
      // Skips the many `0 * w` multiplies the s=0..8 loop did when
      // ox or oy was 0 (center column/row of the 3×3 stencil), and
      // drops 18 typed-array reads (LIQUID_STENCIL_OX/OY × 9).
      var ci, wi, vxi, vyi, wvxi, wvyi;
      // s=0  ox=-1 oy=-1
      ci = liquidNbrs[base + 0];
      if (ci >= 0) { wi = liquidW[base + 0]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 -= wvxi; gv01 -= wvxi; gv10 -= wvyi; gv11 -= wvyi; }
      // s=1  ox=0  oy=-1
      ci = liquidNbrs[base + 1];
      if (ci >= 0) { wi = liquidW[base + 1]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv01 -= wvxi; gv11 -= wvyi; }
      // s=2  ox=+1 oy=-1
      ci = liquidNbrs[base + 2];
      if (ci >= 0) { wi = liquidW[base + 2]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 += wvxi; gv01 -= wvxi; gv10 += wvyi; gv11 -= wvyi; }
      // s=3  ox=-1 oy=0
      ci = liquidNbrs[base + 3];
      if (ci >= 0) { wi = liquidW[base + 3]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 -= wvxi; gv10 -= wvyi; }
      // s=4  ox=0  oy=0  (center, no gradient contribution)
      ci = liquidNbrs[base + 4];
      if (ci >= 0) { wi = liquidW[base + 4]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; vx += wi * vxi; vy += wi * vyi; }
      // s=5  ox=+1 oy=0
      ci = liquidNbrs[base + 5];
      if (ci >= 0) { wi = liquidW[base + 5]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 += wvxi; gv10 += wvyi; }
      // s=6  ox=-1 oy=+1
      ci = liquidNbrs[base + 6];
      if (ci >= 0) { wi = liquidW[base + 6]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 -= wvxi; gv01 += wvxi; gv10 -= wvyi; gv11 += wvyi; }
      // s=7  ox=0  oy=+1
      ci = liquidNbrs[base + 7];
      if (ci >= 0) { wi = liquidW[base + 7]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv01 += wvxi; gv11 += wvyi; }
      // s=8  ox=+1 oy=+1
      ci = liquidNbrs[base + 8];
      if (ci >= 0) { wi = liquidW[base + 8]; vxi = liquidCellVX[ci]; vyi = liquidCellVY[ci]; wvxi = wi * vxi; wvyi = wi * vyi; vx += wvxi; vy += wvyi; gv00 += wvxi; gv01 += wvxi; gv10 += wvyi; gv11 += wvyi; }
      var ddx = liquidDX[i];
      var ddy = liquidDY[i];
      gv00 = 4 * (gv00 + vx * ddx);
      gv01 = 4 * (gv01 + vx * ddy);
      gv10 = 4 * (gv10 + vy * ddx);
      gv11 = 4 * (gv11 + vy * ddy);

      var oil = liquidType[i] === 1;
      if (!oil) {
        // v24.152 — calm-blended transfer scale (raw 1.0 while lively).
        vx *= liquidMotionEff;
        vy *= liquidMotionEff;
        gv00 *= liquidMotionEff;
        gv01 *= liquidMotionEff;
        gv10 *= liquidMotionEff;
        gv11 *= liquidMotionEff;
      }

      var npx = Math.max(minX, Math.min(maxX, liquidLX[i] + vx));
      var npy = Math.max(minY, Math.min(maxY, liquidLY[i] + vy));
      vx = npx - liquidLX[i];
      vy = npy - liquidLY[i];

      var densityRatio = liquidDensity[i] * LIQUID_INV_DENSITY;
      var aerThreshold = oil ? LIQUID_OIL_AERATION_THRESHOLD : LIQUID_AERATION_THRESHOLD;
      // v23.33 — aeration accumulator only fires below threshold; defer the
      // sqrt (and its delta-v terms) into the branch instead of every particle.
      if (densityRatio < aerThreshold) {
        var ax = vx - liquidPVX[i];
        var ay = vy - liquidPVY[i];
        var alen = Math.sqrt(ax * ax + ay * ay);
        var aerCoeff = oil ? LIQUID_OIL_AERATION_COEFF : LIQUID_AERATION_COEFF;
        liquidAeration[i] = Math.min(1, liquidAeration[i] + alen * (1 - densityRatio / aerThreshold) * aerCoeff);
      }

      liquidX[i] = npx * LIQUID_CELL;
      liquidY[i] = npy * LIQUID_CELL;
      // Global per-substep damping bleeds energy so pools settle and
      // MPM oscillations die out instead of feeding back.
      // v24.152 — water uses the calm-blended value (near-raw while lively).
      var damp = oil ? LIQUID_OIL_DAMPING : liquidDampEff;
      var newVX = vx * LIQUID_CELL * invStep * damp;
      var newVY = vy * LIQUID_CELL * invStep * damp;
      // v24.112 rest brake — extra low-speed damping so the standing
      // pressure-noise floor decays to true rest and the sleep gate can
      // latch; real flows above the threshold are untouched. Two stages:
      // gentle under 25 px/s, hard under 10 px/s (the pressure-cycle pump
      // otherwise sustains a ~12 px/s shimmer forever). edit2:
      // liquid-wgpu.js (module consts + WGSL G2P + reference).
      var vBrk = newVX * newVX + newVY * newVY;
      if (!LIQUID_DBG_NO_BRAKE && vBrk < LIQUID_REST_BRAKE_VSQ) {
        var bfR = (vBrk < LIQUID_REST_BRAKE_HARD_VSQ) ? LIQUID_REST_BRAKE_HARD : LIQUID_REST_BRAKE;
        // v24.145 — the brake is a REST device: scaled by the calm ramp so
        // stimulated water flows undamped (the slush fix) and only settling
        // water is ground to stillness. calm=1 reduces to the exact v24.112
        // factors. edit2 liquid-wgpu.js (WGSL G2P + stage-5 reference).
        var bfC = 1 + (bfR - 1) * LIQUID_CALM;
        newVX *= bfC;
        newVY *= bfC;
      }
      // v24.173 — speed-gated burst damp + hard velocity clamp (water only).
      // Bleed energy from FAST water so a stir settles (Old Faithful) while
      // resting water (vBrk below the gate) is untouched, then cap the speed
      // so an over-compressed ejection can't run away into the "explosion
      // fest". Carried linear velocity only = MLS-MPM-consistent (never the
      // move/affine = energy pump). vBrk is the pre-brake speed^2; the burst
      // gate (LO=100 px/s) sits well above the rest-brake band (25 px/s) so
      // the two never overlap. edit2 liquid-wgpu.js (WGSL g2p + reference).
      if (!oil) {
        if (LIQUID_BURST_DAMP < 1) {
          var bdLo = LIQUID_BURST_GATE_LO * LIQUID_BURST_GATE_LO;
          if (vBrk > bdLo) {
            var bdHi = LIQUID_BURST_GATE_HI * LIQUID_BURST_GATE_HI;
            var bdT = (vBrk - bdLo) / (bdHi - bdLo);
            if (bdT > 1) bdT = 1;
            var bdF = 1 + (LIQUID_BURST_DAMP - 1) * bdT;
            newVX *= bdF;
            newVY *= bdF;
          }
        }
        if (LIQUID_MAX_VEL > 0) {
          var mvMax2 = LIQUID_MAX_VEL * LIQUID_MAX_VEL;
          var mvSp2 = newVX * newVX + newVY * newVY;
          if (mvSp2 > mvMax2) {
            var mvSc = LIQUID_MAX_VEL / Math.sqrt(mvSp2);
            newVX *= mvSc;
            newVY *= mvSc;
          }
        }
      }
      liquidVX[i] = newVX;
      liquidVY[i] = newVY;
      liquidG00[i] = gv00;
      liquidG01[i] = gv01;
      liquidG10[i] = gv10;
      liquidG11[i] = gv11;
      // Sleep tracking — if the particle has barely moved for many frames,
      // mark it sleeping so future substeps skip ApplyGridPressure + G2P.
      // (debug kit: NO_SLEEP routes everything to the reset branch.)
      // v24.150 — latch only while SETTLING (calm >= 0.5): lively water
      // never freezes mid-wave. edit2 liquid-wgpu.js (kernel + reference).
      if (!LIQUID_DBG_NO_SLEEP && LIQUID_CALM >= 0.5 && newVX * newVX + newVY * newVY < LIQUID_SLEEP_VSQ) {
        var rf = liquidRestFrames[i] + 1;
        if (rf > LIQUID_SLEEP_FRAMES) {
          liquidSleeping[i] = 1;
          rf = LIQUID_SLEEP_FRAMES;
          // v24.112 — drop residual foam at the sleep transition; sleeping
          // particles skip the decay passes, so it would freeze as speckles.
          liquidAeration[i] = 0;
        }
        liquidRestFrames[i] = rf;
      } else {
        liquidRestFrames[i] = 0;
      }
    }
  }

  function liquidSolidAt(x, y, r) {
    // v10.100 GOLD — once-per-particle proximity check before the 4
    // miner sub-tests. For the 99% of particles nowhere near the
    // rig, this short-circuits 4 liquidPointInMiner calls (each
    // ~10 ops) into a single bbox compare. With 30k awake particles
    // calling solidAt per frame, that saves ~1ms easily.
    var nearMiner = false;
    if (player && !gameWon) {
      var pxL = player.x - r;
      var pxR = player.x + PLAYER_W + r;
      var pyT = player.y - r;
      var pyB = player.y + PLAYER_H + r;
      if (x >= pxL && x <= pxR && y >= pyT && y <= pyB) nearMiner = true;
    }
    if (nearMiner) {
      if (liquidWorldSolidAt(x,     y + r) || liquidPointInMiner(x,     y + r)) return true;
      if (liquidWorldSolidAt(x - r, y    ) || liquidPointInMiner(x - r, y    )) return true;
      if (liquidWorldSolidAt(x + r, y    ) || liquidPointInMiner(x + r, y    )) return true;
      if (liquidWorldSolidAt(x,     y - r) || liquidPointInMiner(x,     y - r)) return true;
    } else {
      if (liquidWorldSolidAt(x,     y + r)) return true;
      if (liquidWorldSolidAt(x - r, y    )) return true;
      if (liquidWorldSolidAt(x + r, y    )) return true;
      if (liquidWorldSolidAt(x,     y - r)) return true;
    }
    return false;
  }

  function liquidLineClear(x0, y0, x1, y1) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(dist / 14));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = x0 + dx * t;
      var y = y0 + dy * t;
      if (liquidWorldSolidAt(x, y)) return false;
    }
    return true;
  }

  function oilIntakeWorldPos() {
    var localX = player.dir > 0 ? PLAYER_W + 4 : -4;
    return playerLocalToWorld(localX, PLAYER_H * 0.52);
  }

  function removeLiquidParticle(i) {
    var last = liquidCount - 1;
    if (i < 0 || i > last) return;
    // v24.109 — log the remove for the GPU op replay (see liquidOps in 020).
    // The GPU replays the same swap-remove against its OWN resident rows.
    if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(2, i);
    else liquidOpsOverflow = true;
    if (i !== last) {
      liquidType[i] = liquidType[last];
      liquidX[i] = liquidX[last];
      liquidY[i] = liquidY[last];
      liquidVX[i] = liquidVX[last];
      liquidVY[i] = liquidVY[last];
      liquidG00[i] = liquidG00[last];
      liquidG01[i] = liquidG01[last];
      liquidG10[i] = liquidG10[last];
      liquidG11[i] = liquidG11[last];
      liquidDensity[i] = liquidDensity[last];
      liquidAeration[i] = liquidAeration[last];
      liquidOrigin[i] = liquidOrigin[last];
      liquidPrevX[i] = liquidPrevX[last];
      liquidPrevY[i] = liquidPrevY[last];
      liquidLX[i] = liquidLX[last];
      liquidLY[i] = liquidLY[last];
      liquidPVX[i] = liquidPVX[last];
      liquidPVY[i] = liquidPVY[last];
      liquidGX[i] = liquidGX[last];
      liquidGY[i] = liquidGY[last];
      liquidDX[i] = liquidDX[last];
      liquidDY[i] = liquidDY[last];
      liquidOrphanDwell[i] = liquidOrphanDwell[last];
      liquidSleeping[i] = liquidSleeping[last];
      liquidFrozen[i] = liquidFrozen[last];
      liquidRestFrames[i] = liquidRestFrames[last];
      // liquidW / liquidNbrs are regenerated every P2G pass — no swap needed.
    }
    liquidMutationSeq++;   // v14.2 — flag the WebGPU solver to re-seed
    liquidCount--;
  }

  function updateOilSuction(dt) {
    if (!ENABLE_OIL) return;   // oil disabled: no intake (touches only the pump loop, never the shared water/oil solver)
    if ((upgrades.pumpLevel || 0) <= 0 || gameOver || gameWon) return;
    var cap = getOilTankCapacity();
    if (cap <= 0) return;
    var intake = oilIntakeWorldPos();
    var range = getOilPumpRange();
    var canTake = oilGallons < cap - 0.01;
    // v14.2 — track whether the pump moved any particle this frame; if so,
    // the WebGPU solver must re-seed so the velocity nudge reaches the GPU.
    var oilTouched = false;
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (liquidType[i] !== 1) continue;
      var dx = intake.x - liquidX[i];
      var dy = intake.y - liquidY[i];
      var d2 = dx * dx + dy * dy;
      if (d2 > range * range) continue;
      var d = Math.sqrt(d2) || 1;
      if (!liquidLineClear(liquidX[i], liquidY[i], intake.x, intake.y)) continue;
      if (!canTake) {
        oilTankWarnTimer -= dt;
        if (oilTankWarnTimer <= 0) {
          showMsg('Oil tank full, sell at station', true);
          oilTankWarnTimer = 2.0;
        }
        continue;
      }
      var pull = (540 + upgrades.pumpLevel * 190) * (1 - d / range);
      if (pull < 70) pull = 70;
      liquidVX[i] += dx / d * pull * dt;
      liquidVY[i] += dy / d * pull * dt;
      oilTouched = true;
      liquidAeration[i] = Math.min(1, liquidAeration[i] + 0.08);
      // Pump touched it — wake immediately so it gets simulated.
      liquidSleeping[i] = 0;
      liquidRestFrames[i] = 0;
      // v24.109 — log the nudge for the GPU op replay (see liquidOps in
      // 020): writes only vx/vy/aeration + the wake on the GPU row, so the
      // pump's pull reaches the resident sim without a full re-upload.
      if (liquidOps.length < LIQUID_OPS_MAX) {
        liquidOps.push(3, i, liquidVX[i], liquidVY[i], liquidAeration[i], liquidType[i], liquidOrigin[i]);
      } else liquidOpsOverflow = true;
      if (d < 11) {
        var room = cap - oilGallons;
        var take = Math.min(room, LIQUID_OIL_PER_PARTICLE);
        oilGallons += take;
        oilSuckFx.push({ x: liquidX[i], y: liquidY[i], tx: intake.x, ty: intake.y, t: 0.18, maxT: 0.18 });
        if (oilSuckFx.length > 44) oilSuckFx.shift();
        removeLiquidParticle(i);
        if (take > 0 && Math.floor((oilGallons - take) / 2) !== Math.floor(oilGallons / 2)) {
          spawnFloater(intake.x, intake.y - 4, 'Oil +' + oilGallons.toFixed(1) + ' gal', '#17110a');
        }
        canTake = oilGallons < cap - 0.01;
      }
    }
    if (oilTouched) liquidMutationSeq++;
  }

  // v10.89 — module-scope nudges so we don't allocate an 8-element
  // array of 2-element arrays on every awake particle every frame.
  // At 30k awake particles that was ~240k tiny allocations/sec from
  // this one literal, all GC pressure.
  var LIQ_NUDGES = [[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  function liquidMoveParticle(i, dt) {
    var r = LIQUID_CELL * LIQUID_PDELTA * 0.85;
    var bounce = liquidType[i] === 1 ? LIQUID_BOUNCE_OIL : LIQUID_BOUNCE_WATER;
    var x = liquidX[i], y = liquidY[i];
    var vx = liquidVX[i], vy = liquidVY[i];
    if (!isFinite(x) || !isFinite(y) || !isFinite(vx) || !isFinite(vy)) return false;

    // v10.89 — only run the second collision probe when the first
    // actually hit (and we rolled back). Pre-v10.89 it ran every
    // frame on every particle = 4 wasted tile lookups per common-
    // case particle, doubling liquidMoveParticle cost when a pool
    // wakes up. Common case is now exactly one solidAt probe.
    if (liquidSolidAt(x, y, r)) {
      x = liquidPrevX[i] || x;
      y = liquidPrevY[i] || y;
      vx *= -bounce;
      vy *= -bounce;
      liquidAeration[i] = Math.min(1, liquidAeration[i] + 0.12);
      if (liquidSolidAt(x, y, r)) {
        var nudges = LIQ_NUDGES;
        for (var ni = 0; ni < 8; ni++) {
          var n = nudges[ni];
          var nx0 = x + n[0] * r * 0.9;
          var ny0 = y + n[1] * r * 0.9;
          if (!liquidSolidAt(nx0, ny0, r)) {
            x = nx0;
            y = ny0;
            break;
          }
        }
      }
    }
    if (x < r) { x = r; vx = Math.abs(vx) * bounce; }
    var maxX = COLS * TILE - r;
    if (x > maxX) { x = maxX; vx = -Math.abs(vx) * bounce; }
    var maxY = (TOTAL_ROWS + 2) * TILE;
    if (y > maxY) {
      y = (TOTAL_ROWS + 1) * TILE;
      vy = -Math.abs(vy) * bounce;
    }
    liquidX[i] = x; liquidY[i] = y;
    liquidVX[i] = vx; liquidVY[i] = vy;
    return isFinite(x) && isFinite(y) && isFinite(vx) && isFinite(vy);
  }

  // v10.99 — adaptive sim skip state.
  // When the pool is fully settled (no awake particles), the player
  // isn't moving, and nothing's actively perturbing things, the
  // sim's output for the next frame would be a no-op. Skip the
  // entire pipeline. Heartbeat every N frames anyway so any latent
  // wake (e.g. a tile mined off-screen) eventually surfaces.
  var liquidSimSkipFrames = 0;
  var liquidPendingDt = 0;
  var LIQUID_SIM_FORCE_EVERY = 12;          // ~200ms heartbeat at 60fps
  var LIQUID_SIM_PLAYER_VEL_GATE = 8;       // px/s — below this player counts as calm

  // ---- v24.150 ORPHAN WAKE ----
  // A sleeping particle whose support has drained away must be woken
  // (nothing else will: a drain is gentle, so no cell near it ever clears
  // the wake bar, and it hangs frozen mid-air as a fat blob while the
  // rest of the water leaves — the owner's "large particles freeze in
  // place as the rest drains out"). Every ~30 frames, bucket the mirror
  // into 16 px cells; any sleeper whose 3x3 neighbourhood holds fewer
  // than 24 particles is an orphan (v24.152: was 8 — the surviving blobs
  // were 10-60 particle clusters; a body cell holds ~160 at rest and a
  // real puddle hundreds, so genuine water is untouchable). WAKE ops ride the
  // sanctioned mutation channel so the GPU stays in sync; the seq bump is
  // flagged as housekeeping so liquidStateTick does NOT read it as a
  // stimulus (orphan wakes must never hold a lake lively).
  var liquidOrphanTick = 0;
  var liquidOrphanSeqSkip = 0;
  function liquidOrphanWakeTick() {
    liquidOrphanTick++;
    if (liquidOrphanTick < 30 || !liquidCount) return;
    liquidOrphanTick = 0;
    var bx = new Map();
    var i, k;
    for (i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i]) continue;
      k = ((liquidX[i] / 16) | 0) * 100003 + ((liquidY[i] / 16) | 0);
      bx.set(k, (bx.get(k) || 0) + 1);
    }
    // Downward iteration: evaporation swap-removes from the tail (the
    // moved particle was already visited), the sweep's own pattern.
    var woke = 0;
    for (i = liquidCount - 1; i >= 0; i--) {
      if (liquidFrozen[i]) continue;
      var cx = (liquidX[i] / 16) | 0, cy = (liquidY[i] / 16) | 0;
      var n = 0;
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          n += bx.get((cx + ox) * 100003 + (cy + oy)) || 0;
        }
      }
      // v24.158 — EVAPORATION, now SLEEP-INDEPENDENT. The owner's "every
      // particle becomes this size / frozen in mid-air" was AWAKE strays:
      // a particle wedged against terrain jitters ~4-5 px/s, too fast to
      // ever sleep (the 3 px/s gate) yet too slow to fall, so the old
      // sleep-gated evaporation never touched it and they ACCUMULATED as
      // fat awake discs. Now any non-frozen particle in a tiny cluster
      // (<24 in its 3x3 of 16px; a real puddle holds hundreds, a lake
      // surface ~900) that is also SLOW (<6 px/s, the velocity guard so
      // flowing/splashing water is never eaten) soaks away. Sleep state is
      // irrelevant — stuck-awake and settled-asleep strays both go. REMOVE
      // ops are counted into the housekeeping skip so the state machine
      // never reads evaporation as a stimulus.
      if (n < 24) {
        var evx = liquidVX[i], evy = liquidVY[i];
        // v24.175 — count how long this particle has stayed an isolated stray.
        var dwell = liquidOrphanDwell[i] + 1;
        if (dwell > 250) dwell = 250;
        liquidOrphanDwell[i] = dwell;
        // Slow strays soak away immediately (the v24.158 < 6 px/s rule). A
        // FAST lone particle that has persisted past the dwell threshold is the
        // stuck "giant excited orphan" (on the pond surface or alone on dirt,
        // never settling in saharan-raw) — evaporate it regardless of speed.
        // A transient spew droplet is clustered (n high -> never enters here)
        // or lands/merges before the threshold, so the spew is spared.
        if (evx * evx + evy * evy < 36 || dwell >= LIQUID_ORPHAN_DWELL_TICKS) {
          removeLiquidParticle(i);
          liquidOrphanSeqSkip++;
        }
        continue;
      }
      liquidOrphanDwell[i] = 0;   // v24.175 — n>=24: part of real water, reset the stray timer
      // v24.153 — HANG TEST (sleeping particles only; an awake one is
      // already being simulated and will fall on its own): a thick sheet
      // asleep under an overhang is neighbour-supported but has nothing
      // UNDER it; if the cell below holds zero particles AND no solid
      // tile, wake it so sheets peel from their unsupported edges and
      // drain toward level instead of fossilizing mid-air.
      if (!liquidSleeping[i]) continue;
      var belowN = bx.get(cx * 100003 + (cy + 1)) || 0;
      if (belowN > 0) continue;
      if (liquidWorldSolidAt(liquidX[i], liquidY[i] + 16)) continue;
      liquidSleeping[i] = 0;
      liquidRestFrames[i] = 0;
      if (liquidOps.length < LIQUID_OPS_MAX) {
        liquidOps.push(4, i, liquidType[i], liquidOrigin[i]);
      } else liquidOpsOverflow = true;
      woke++;
    }
    if (woke) {
      liquidMutationSeq++;
      liquidOrphanSeqSkip++;
    }
  }

  // ---- v24.145 WATER STATE MACHINE (rationale at the const block in 020) ----
  // Runs once per frame at the top of updateLiquids, BEFORE the GPU delegate,
  // so both solver paths share one state. Classifies this frame's stimuli,
  // drives the calm ramp + the host-blended grid viscosity, and owns the
  // whole-body freeze latch + thaw.
  function liquidStateTick(dt) {
    if (!isFinite(dt) || dt < 0) dt = 0;
    // v24.169 — SAHARAN-RAW: bypass the entire calm machinery and run zero
    // dissipation (the re-port experiment; rationale at LIQUID_RAW in 020).
    // calm=0 makes the calm-scaled brake reduce to identity on both paths;
    // no-sleep disables sleep CPU+kernel; damp/motion/visc forced to
    // saharan values; freeze off. If a resting lake goes calm here, the
    // dissipation WAS the energy injector and this becomes the new default.
    if (LIQUID_RAW) {
      liquidStimSeq = liquidMutationSeq;
      LIQUID_CALM = 0;
      // v24.170 — settling dissipation = VELOCITY damping (the particle still
      // moves the FULL gathered velocity each step — MLS-MPM-consistent — but
      // the velocity it CARRIES to the next step is bled by RAW_DAMP). The
      // motion/transfer scale was wrong: scaling the move (<1) breaks transfer
      // consistency and PUMPS energy (rest mean climbed 1.9->5.4). Velocity
      // damping bleeds injected energy so a burst settles (Old Faithful) while
      // rest stays calm. Motion scale stays 1.0 (full APIC, saharan).
      liquidDampEff = LIQUID_RAW_DAMP;
      liquidMotionEff = 1.0;
      // v24.183 — grid viscosity is the EOS-limit-cycle killer (cancels the
      // anti-phase compress/eject oscillation at the grid). RAW forced it to 0
      // for saharan purity, but under hard stress the field runs away (mean
      // velocity 300+, re-saturating the speed cap every step, which no
      // per-particle velocity damping can beat). LIQUID_RAW_VISC (default 0 =
      // saharan) lets it back in, live-tunable, so a stressed field settles.
      liquidGridViscEff = LIQUID_RAW_VISC;
      liquidFrozenAll = false;
      liquidFreezeHoldT = 0;
      liquidCalmHoldT = 0;
      LIQUID_DBG_NO_SLEEP = 1;
      liquidStateName = 'raw';
      if (liquidWGPU && liquidWGPU.setSimParam) {
        liquidWGPU.setSimParam('CALM', 0);
        liquidWGPU.setSimParam('GRID_VISC', LIQUID_RAW_VISC);
        liquidWGPU.setSimParam('DAMPING', LIQUID_RAW_DAMP);
        liquidWGPU.setSimParam('WATER_MOTION_SCALE', 1.0);
        liquidWGPU.setSimParam('DBG_FLAGS', 1);   // bit1 = no-sleep (kernel)
      }
      return;
    }
    // -- stimulus classification --
    // HARD drops calm to lively: dig-wake/suction ops, rig above the speed
    // gate, explosions, rocket wash. SOFT only thaws + holds the settle
    // timer: streamed fills/drains/sweeps (ADD/REMOVE ops), so a pond
    // arriving on screen stays serene instead of sloshing awake.
    var hard = false, soft = false;
    if (liquidMutationSeq !== liquidStimSeq) {
      var seqDelta = liquidMutationSeq - liquidStimSeq;
      liquidStimSeq = liquidMutationSeq;
      // v24.150 — orphan-wake housekeeping bumps (liquidOrphanWakeTick)
      // are NOT stimuli: a lake shedding stray droplets must still settle
      // and freeze. Only consume silently when the orphan tick accounts
      // for EVERY bump this frame; any extra bump means real gameplay ops
      // rode along, so classify normally (a coinciding dig is hard anyway).
      if (liquidOrphanSeqSkip > 0 && seqDelta <= liquidOrphanSeqSkip) {
        liquidOrphanSeqSkip = 0;
      } else {
        liquidOrphanSeqSkip = 0;
        soft = true;
        // Ops pushed since the last consume are still in the array here (the
        // GPU drains / the CPU clears them later this same frame). Strides:
        // ADD 7, REMOVE 2, POKE 7, WAKE 4 (020 liquidOps layout).
        var oi = 0, on = liquidOps.length;
        while (oi < on) {
          var oc = liquidOps[oi];
          if (oc === 1) oi += 7;
          else if (oc === 2) oi += 2;
          else if (oc === 3 || oc === 4) { hard = true; break; }
          else break;   // unknown op code — stop scanning, stay soft
        }
      }
    }
    // Rig motion is a stimulus only when SUSTAINED (~4 frames above the
    // gate): real swimming/driving holds for seconds, while a single
    // GC-hitch frame spikes |vy| through gravity*dt and would otherwise
    // pointlessly thaw a sleeping pond several times a minute.
    if (!LIQUID_DBG_NO_PLAYER && player && !gameWon &&
        (Math.abs(player.vx) >= LIQUID_SIM_PLAYER_VEL_GATE ||
         Math.abs(player.vy) >= LIQUID_SIM_PLAYER_VEL_GATE * 4)) {
      liquidPlayerFastFrames++;
      if (liquidPlayerFastFrames >= 4) hard = true;
    } else {
      liquidPlayerFastFrames = 0;
    }
    // v24.157 — ?pondtest=4: permanent hard stim (the fly-in explosion
    // repro: calm pinned at 0 forever, raw-lively physics on a fresh
    // fill; the dissipation floor must hold the EOS pump bounded).
    if (pondTestKind === 4) hard = true;
    if (explosions.length || (rocketIntensity > 0.02 && player && player.thrusting)) hard = true;
    if (hard || soft) {
      liquidStimT = 0;
      liquidFreezeHoldT = 0;
      if (liquidFrozenAll) {
        liquidFrozenAll = false;        // thaw — stepping resumes this frame
        liquidPendingDt = 0;            // never deliver banked time as a kick
        liquidSimSkipFrames = 0;
      }
    } else if (liquidStimT < 9999) liquidStimT += dt;
    // -- calm ramp --
    // Fast-water hold: a dig's ops fire once, but the drain it opens flows
    // for many seconds; while a meaningful particle fraction still moves
    // above LIQUID_FAST_VSQ the body stays lively, so flow is never braked
    // into a mid-flow freeze. STIM_MAX is the escape hatch (the brakeless
    // EOS limit cycle could otherwise hold fastCount up forever).
    var fastHold = liquidFastCount > Math.max(LIQUID_FREEZE_AWAKE_MIN, liquidCount * 0.004);
    var wantCalm = liquidStimT > LIQUID_STIM_HOLD && (!fastHold || liquidStimT > LIQUID_STIM_MAX);
    if (hard) {
      LIQUID_CALM = 0;                  // a real hit snaps the body lively at once
    } else if (wantCalm && LIQUID_CALM < 1) {
      LIQUID_CALM += dt / LIQUID_CALM_RAMP;
      if (LIQUID_CALM > 1) LIQUID_CALM = 1;
    }
    // fround-quantize so the f64 module mirrors == the f32 uniform lane the
    // GPU kernel reads (keeps the in-file reference's math in lockstep).
    LIQUID_CALM = Math.fround(LIQUID_CALM);
    liquidGridViscEff = LIQUID_VISC_LIVE + (LIQUID_GRID_VISC - LIQUID_VISC_LIVE) * LIQUID_CALM;
    // v24.152 — the slosh fix: damping + motion scale blend toward raw
    // while lively (see the const block in 020). The gm levers stay the
    // pristine SETTLED targets; the module mirrors carry the blend.
    liquidDampEff = LIQUID_DAMP_LIVE + (LIQUID_DAMPING - LIQUID_DAMP_LIVE) * LIQUID_CALM;
    liquidMotionEff = LIQUID_MOTION_LIVE + (LIQUID_WATER_MOTION_SCALE - LIQUID_MOTION_LIVE) * LIQUID_CALM;
    if (liquidWGPU && liquidWGPU.setSimParam) {
      liquidWGPU.setSimParam('CALM', LIQUID_CALM);
      // The module's mirrors carry the BLENDED values (the gm levers'
      // pristine targets stay in 010/020); a lever change is re-blended
      // here next frame, so the one-frame overwrite is invisible.
      liquidWGPU.setSimParam('GRID_VISC', liquidGridViscEff);
      liquidWGPU.setSimParam('DAMPING', liquidDampEff);
      liquidWGPU.setSimParam('WATER_MOTION_SCALE', liquidMotionEff);
    }
    // -- calm-hold timer (v24.164): seconds calm has held at 1 with no
    // stimulus. Drives the FORCE FREEZE below. Reset by any stimulus or a
    // calm drop; only advances in a velocity trough so the popcorn's awake
    // spikes don't keep resetting it.
    if (hard || soft || LIQUID_CALM < 1) liquidCalmHoldT = 0;
    else liquidCalmHoldT += dt;
    // -- whole-body freeze latch --
    // Frozen water is a freeze-frame: updateLiquids and updateLiquidsGPU
    // return before stepping, so no heartbeat, no merged catch-up, no
    // pressure cycle — it cannot pop. Sleep state persists through thaw,
    // so a soft thaw (off-screen drain) re-freezes cheaply. TWO ways in:
    //   (a) the original latch — fully converged (awake census at the floor);
    //   (b) v24.164 FORCE FREEZE — the body has been calm this long but the
    //       clamped-EOS limit cycle keeps the awake count above the floor
    //       forever (the deep-lake popcorn), so freeze regardless of awake
    //       count. Both require a velocity TROUGH (!fastHold) so the frozen
    //       snapshot is near-flat.
    if (LIQUID_FREEZE && !liquidFrozenAll && liquidCount > 0 && !hard && !soft &&
        LIQUID_CALM >= 1) {
      var awakeNow = (liquidWGPU && liquidWGPU.simActive) ? liquidWGPU.awakeCount : liquidStatAwake;
      if (typeof awakeNow !== 'number') awakeNow = -1;
      var awakeCap = Math.max(LIQUID_FREEZE_AWAKE_MIN, liquidCount * LIQUID_FREEZE_AWAKE_FRAC);
      // (a) converged path (gentle lakes): low awake census in a velocity
      //     trough — the original v24.146 latch.
      var converged = !fastHold && (awakeNow >= 0 && awakeNow <= awakeCap);
      // (b) FORCE path (v24.164): a DEEP lake's clamped-EOS limit cycle is
      //     so violent it NEVER troughs (measured: 30k/39k particles stay
      //     >24 px/s at calm=1), so converged is unreachable. After this
      //     long calm we freeze REGARDLESS of fast/awake count. The churn
      //     is VELOCITY (particles vibrating in place), not displacement —
      //     a dense lake's positions stay ~uniform — so locking the
      //     positions + killing the vibration yields a flat still lake.
      var forced = (liquidCalmHoldT >= LIQUID_FORCE_FREEZE_T);
      if (converged || forced) {
        liquidFreezeHoldT += dt;
        if (liquidFreezeHoldT >= LIQUID_FREEZE_HOLD) {
          liquidFrozenAll = true;
          liquidPendingDt = 0;
          liquidStepAcc = 0;
        }
      } else {
        liquidFreezeHoldT = 0;
      }
    }
    liquidStateName = liquidFrozenAll ? 'frozen'
      : (LIQUID_CALM >= 1 ? 'settled' : (LIQUID_CALM > 0.02 ? 'settling' : 'live'));
  }

  // v14.4 — GPU-path adaptive idle-skip: skip the GPU SIM step when the
  // water is settled and nothing is disturbing it (awakeCount is the GPU's
  // own sleep tally from the readback mirror; -1 until the first readback,
  // read as "not idle"). This skips only the sim — the renderer draws
  // every frame, so on-screen water is never affected.
  //
  // v14.9 — reverted v14.6's camera-visibility gate. v14.6 also called
  // liquidUpdateActiveRegion() here to freeze off-screen water and hid the
  // WebGPU canvas when nothing was in view; that mis-fired and hid the
  // water entirely on the deployed build. The marginal perf it bought is
  // not worth a vanished-water regression, so the gate is gone.
  // v24.120 water debug kit — scratch state for the dt injectors + the
  // DBG_DRAW meter (levers + docs: LIQUID_DBG_* in 020). Inert at 0.
  var liquidDbgSpikeTick = 0;     // frames since the last injected dt spike
  var liquidDbgSpikeFlash = 0;    // frames left to flag SPIKE on the meter
  var liquidDbgHeartbeat = 0;     // frames left to flag a merged idle-skip catch-up step
  var liquidDbgSkipped = 0;       // sim frames idle-skipped in the current 1 s window
  var liquidDbgSkipRate = 0;      // last completed window's skip count (meter: skip n/s)
  var liquidDbgRateTick = 0;
  var liquidDbgLastDtMs = 16.7;   // dt actually fed to the sim (ms, post merge/injection)
  var liquidDbgStatTick = 0;      // meter stat-refresh cadence
  var liquidDbgN = 0, liquidDbgMean = 0, liquidDbgMax = 0, liquidDbgFast = 0;
  var liquidDbgPrevSleep = -1;    // last sampled sleeping count (wake-burst detector)
  var liquidDbgBursts = [];       // recent wake bursts {n, f}; f = frames since seen

  // v24.122 — dev hotkey 'X' (350) cycles this kit one suspect at a time:
  // OFF -> WATCH (overlay only) -> NO SLEEP -> NO IDLE-SKIP -> FIXED DT ->
  // NO BRAKE -> NO SWEEP -> DT SPIKE -> OFF. Exactly one mechanism is
  // disabled per step, so the firecracker culprit can be isolated by
  // tapping X while staring at a pond. Applies through gm.set so the GPU
  // bitmask (SimParams coll.w) and the readback cadence stay in sync and
  // the L-panel sliders track the hotkey.
  var waterDbgMode = 0;
  var WATER_DBG_MODE_NAMES = [
    'WATER DBG off',
    'WATER DBG 1/7: WATCH (overlay only, all systems live)',
    'WATER DBG 2/7: NO SLEEP (sleep/wake cycle off)',
    'WATER DBG 3/7: NO IDLE-SKIP (heartbeat catch-up off)',
    'WATER DBG 4/7: FIXED DT (sim clock pinned to 1/60)',
    'WATER DBG 5/7: NO BRAKE (rest brake off, shimmer rises)',
    'WATER DBG 6/7: NO SWEEP (stray sweep off)',
    'WATER DBG 7/7: DT SPIKE (one +80ms frame every 1.5s)'
  ];
  function waterDbgCycle() {
    if (!(typeof window !== 'undefined' && window.gm && window.gm.set)) return 'gm facade missing';
    waterDbgMode = (waterDbgMode + 1) % WATER_DBG_MODE_NAMES.length;
    var m = waterDbgMode;
    function S(name, v) { try { window.gm.set('water.' + name, v); } catch (_) {} }
    S('DBG_DRAW', m === 0 ? 0 : 2);
    S('DBG_READBACK_EVERY', m === 0 ? 20 : 6);
    S('DBG_NO_SLEEP', m === 2 ? 1 : 0);
    S('DBG_NO_IDLESKIP', m === 3 ? 1 : 0);
    S('DBG_FIXED_DT', m === 4 ? 1 : 0);
    S('DBG_NO_BRAKE', m === 5 ? 1 : 0);
    S('DBG_NO_SWEEP', m === 6 ? 1 : 0);
    S('DBG_DT_SPIKE', m === 7 ? 80 : 0);
    return WATER_DBG_MODE_NAMES[m];
  }

  var liquidGPULastSeq = 0;
  function updateLiquidsGPU(dt) {
    if (!isFinite(dt) || dt <= 0.0005) return;
    var awake = liquidWGPU.awakeCount;
    if (typeof awake !== 'number') awake = -1;
    // v17.89 — keep the dev-panel "Liq state" line live on the GPU path. The
    // CPU liquidUpdateActiveRegion that normally sets these is skipped under
    // WebGPU (updateLiquids returns early at simActive), so without this the
    // panel froze on a stale startup snapshot that no longer summed to
    // liquidCount. The readback tallies all three together, so once awakeCount
    // is known (>= 0) the split is valid and sums to the live particle count.
    if (awake >= 0) {
      liquidStatAwake = awake;
      liquidStatSleeping = liquidWGPU.sleepingCount;
      liquidStatFrozen = liquidWGPU.frozenCount;
      // v24.145 — fast-mover tally from the same readback; feeds the state
      // machine's "still really flowing" hold (liquidStateTick).
      if (typeof liquidWGPU.fastCount === 'number') liquidFastCount = liquidWGPU.fastCount;
    }
    // Dev probe (?pondtest=1): one stat line every ~5s so headless runs can
    // chart sleep convergence without the dev overlay.
    if (pondTestMode) {
      pondTestProbeTick++;
      // v24.143 — the breach scenario needs a faster chart (drain dynamics
      // play out in seconds); rest poses keep the relaxed 5 s cadence.
      if (pondTestProbeTick >= (pondTestKind === 3 ? 150 : 300)) {
        pondTestProbeTick = 0;
        try {
          // Density structure of the first filled pond: boundary-vacuum
          // diagnosis (mirror densities, ~20-frame readback lag is fine).
          var dProbe = '';
          var pondP = null;
          for (var pp = 0; pp < surfacePonds.length; pp++) {
            if (surfacePonds[pp].filled) { pondP = surfacePonds[pp]; break; }
          }
          if (pondP) {
            var soP = liquidSurfaceOriginForType('water');
            var ex0 = pondP.cL * TILE + TILE, ex1 = (pondP.cR + 1) * TILE - TILE;
            var fyP = (SKY_ROWS + (pondP.d || 1)) * TILE - 4;   // v24.148 — floor band at the lake's real floor
            var eS = 0, eN = 0, mS = 0, mN = 0, fS = 0, fN = 0;
            for (var qi = 0; qi < liquidCount; qi++) {
              if (liquidType[qi] !== 0 || liquidOrigin[qi] !== soP) continue;
              var qd = liquidDensity[qi];
              if (liquidY[qi] >= fyP) { fS += qd; fN++; }
              if (liquidX[qi] < ex0 || liquidX[qi] >= ex1) { eS += qd; eN++; }
              else { mS += qd; mN++; }
            }
            dProbe = ' DENS edge=' + (eN ? (eS / eN).toFixed(2) : '-') +
              ' mid=' + (mN ? (mS / mN).toFixed(2) : '-') +
              ' floor=' + (fN ? (fS / fN).toFixed(2) : '-');
            // Mirror-speed stats (the churn ground truth, ~20-frame lag).
            var vS = 0, vMax = 0, vU3 = 0, vN = 0;
            for (var vi = 0; vi < liquidCount; vi++) {
              if (liquidType[vi] !== 0 || liquidOrigin[vi] !== soP) continue;
              var vv = Math.sqrt(liquidVX[vi] * liquidVX[vi] + liquidVY[vi] * liquidVY[vi]);
              vS += vv; vN++;
              if (vv > vMax) vMax = vv;
              if (vv < 3) vU3++;
            }
            if (vN) {
              dProbe += ' SPD mean=' + (vS / vN).toFixed(1) + ' max=' + vMax.toFixed(0) +
                ' under3=' + (100 * vU3 / vN).toFixed(0) + '%';
            }
            // v24.125 — firecracker forensics: where do the fast movers sit?
            // FASTNEARSLEEP counts >40 px/s water particles with a sleeping
            // particle within 2 cells (the sleep-boundary-oscillator
            // signature; sleepers splat mass but skip the pressure scatter,
            // so awake water pressing on a sleeping cluster gets shoved
            // one-sidedly). FASTDY is the fast movers' mean height above the
            // pond floor in px (negative = above). Mirror data, ~readback lag.
            var fcN = 0, fcNear = 0, fcYSum = 0, fcXSum = 0;
            var fcTopV = 0, fcTopDx = 0, fcTopDy = 0, fcTopVx = 0, fcTopVy = 0;
            var fcRigX = player ? player.x + PLAYER_W * 0.5 : 0;
            var fcR2 = (LIQUID_CELL * 2) * (LIQUID_CELL * 2);
            for (var fci = 0; fci < liquidCount; fci++) {
              if (liquidType[fci] !== 0 || liquidOrigin[fci] !== soP) continue;
              if (liquidFrozen[fci] || liquidSleeping[fci]) continue;
              var fcv = liquidVX[fci] * liquidVX[fci] + liquidVY[fci] * liquidVY[fci];
              if (fcv < 1600) continue;
              fcN++;
              fcYSum += liquidY[fci] - fyP;
              fcXSum += Math.abs(liquidX[fci] - fcRigX);
              if (fcv > fcTopV) {
                fcTopV = fcv;
                fcTopDx = liquidX[fci] - fcRigX;
                fcTopDy = liquidY[fci] - fyP;
                fcTopVx = liquidVX[fci];
                fcTopVy = liquidVY[fci];
              }
              for (var fcj = 0; fcj < liquidCount; fcj++) {
                if (!liquidSleeping[fcj]) continue;
                var fdx2 = liquidX[fci] - liquidX[fcj];
                var fdy2 = liquidY[fci] - liquidY[fcj];
                if (fdx2 * fdx2 + fdy2 * fdy2 < fcR2) { fcNear++; break; }
              }
            }
            dProbe += ' FASTNEARSLEEP=' + fcNear + '/' + fcN;
            if (fcN) {
              dProbe += ' FASTDY=' + (fcYSum / fcN).toFixed(0) +
                ' FASTDXRIG=' + (fcXSum / fcN).toFixed(0) +
                ' FASTTOP=dx' + fcTopDx.toFixed(0) + ',dy' + fcTopDy.toFixed(0) +
                ',v' + fcTopVx.toFixed(0) + '/' + fcTopVy.toFixed(0);
            }
            // v24.125 — under-rig pinch forensics: the column under the
            // floating hull (|x - rigX| < 20). Geometry: world y of the
            // hull + track bottoms vs the first solid row below the rig
            // (the squeeze gap), then the column's count / max |vy| / min
            // particle y (closest approach to the hull bottom).
            if (player) {
              var urHullB = player.y + LIQUID_MINER_HULL_B;
              var urTrackB = player.y + LIQUID_MINER_TRACK_B;
              var urCol = Math.floor(fcRigX / TILE);
              var urFloorY = -1;
              for (var urR = Math.floor(player.y / TILE); urR < Math.floor(player.y / TILE) + 8; urR++) {
                if (liquidWorldSolidAt(urCol * TILE + TILE * 0.5, urR * TILE + TILE * 0.5)) {
                  urFloorY = urR * TILE; break;
                }
              }
              var urN = 0, urMaxVy = 0, urMinY = 1e9;
              for (var uri = 0; uri < liquidCount; uri++) {
                if (liquidType[uri] !== 0 || liquidOrigin[uri] !== soP) continue;
                if (Math.abs(liquidX[uri] - fcRigX) > 20) continue;
                if (liquidY[uri] < player.y) continue;
                urN++;
                var urvy = Math.abs(liquidVY[uri]);
                if (urvy > urMaxVy) urMaxVy = urvy;
                if (liquidY[uri] < urMinY) urMinY = liquidY[uri];
              }
              dProbe += ' pv=' + player.vx.toFixed(1) + '/' + player.vy.toFixed(1) +
                ' RIG: hullB=' + urHullB.toFixed(0) + ' trackB=' + urTrackB.toFixed(0) +
                ' floorY=' + urFloorY + ' gap=' + (urFloorY >= 0 ? (urFloorY - urTrackB).toFixed(1) : '?') +
                ' colN=' + urN + ' colMaxVy=' + urMaxVy.toFixed(0) +
                ' colTopY=' + (urN ? (urMinY - urTrackB).toFixed(1) : '?');
            }
            // Burst ring (maintained by the DBG_DRAW meter — enable via
            // ?wdbg=DBG_DRAW:1 so headless probe lines carry the signature).
            if (LIQUID_DBG_DRAW) {
              dProbe += ' BURSTS:';
              if (!liquidDbgBursts.length) dProbe += 'none';
              for (var pbi = 0; pbi < liquidDbgBursts.length; pbi++) {
                dProbe += ' -' + liquidDbgBursts[pbi].n + '@' + (liquidDbgBursts[pbi].f / 60).toFixed(1) + 's';
              }
            }
          }
          // v24.143 — pondtest=3 drainage measurement: particle split across
          // the breach line (pond side vs pit side, readback-lagged mirror).
          // Healthy = pit fills toward equalization, then the whole body
          // re-settles; sick = an early plateau (mid-flow freeze) or endless
          // wake bursts (the pressure-pop limit cycle).
          if (pondTestKind === 3 && pondTestBreachPond) {
            var brX = (pondTestBreachPond.cR + 1) * TILE;
            var pitN = 0, pondN = 0;
            for (var bqi = 0; bqi < liquidCount; bqi++) {
              if (liquidType[bqi] !== 0) continue;
              if (liquidX[bqi] > brX) pitN++; else pondN++;
            }
            dProbe += ' PIT n=' + pitN + ' pond=' + pondN;
          }
          console.log('POND: count=' + liquidCount + ' awake=' + liquidStatAwake +
            ' sleeping=' + liquidStatSleeping + ' frozen=' + liquidStatFrozen +
            ' state=' + liquidStateName + ' calm=' + LIQUID_CALM.toFixed(2) +
            ' fast=' + liquidFastCount +
            ' seq=' + liquidMutationSeq + ' ops=' + liquidOps.length + dProbe);
        } catch (_) {}
      }
    }
    // v24.145 — whole-body freeze (GPU path): no liquidWGPU.update at all,
    // so no kernels, no banked catch-up dt, no readback churn. The probe +
    // stat sync above still run; liquidStateTick owns the thaw. Ops that
    // arrive while frozen thaw the body via the state tick (same frame or
    // the next), and are consumed by the first post-thaw update.
    if (LIQUID_FREEZE && liquidFrozenAll) {
      liquidPendingDt = 0;
      liquidSimSkipFrames = 0;
      liquidDbgSkipped++;
      for (var fxg = oilSuckFx.length - 1; fxg >= 0; fxg--) {
        oilSuckFx[fxg].t -= dt;
        if (oilSuckFx[fxg].t <= 0) oilSuckFx.splice(fxg, 1);
      }
      return;
    }
    var seqNow = liquidMutationSeq;
    var mutated = (seqNow !== liquidGPULastSeq);
    liquidGPULastSeq = seqNow;
    var playerCalm = !player ||
      (Math.abs(player.vx) < LIQUID_SIM_PLAYER_VEL_GATE &&
       Math.abs(player.vy) < LIQUID_SIM_PLAYER_VEL_GATE * 4);
    var noPerturb = !explosions.length &&
      !(rocketIntensity > 0.02 && player && player.thrusting);
    // Idle = every particle asleep, no add/remove this frame, player calm,
    // nothing perturbing the water — the GPU sim step would be a no-op, so
    // skip it. A LIQUID_SIM_FORCE_EVERY heartbeat still forces a real step.
    if (!LIQUID_DBG_NO_IDLESKIP && awake === 0 && !mutated && playerCalm && noPerturb && liquidCount > 0) {
      liquidSimSkipFrames++;
      if (liquidSimSkipFrames < LIQUID_SIM_FORCE_EVERY) {
        liquidPendingDt += dt;
        liquidDbgSkipped++;
        for (var fxs = oilSuckFx.length - 1; fxs >= 0; fxs--) {
          oilSuckFx[fxs].t -= dt;
          if (oilSuckFx[fxs].t <= 0) oilSuckFx.splice(fxs, 1);
        }
        return;
      }
    }
    liquidSimSkipFrames = 0;
    var stepDt = dt;
    if (liquidPendingDt > 0) {
      stepDt += liquidPendingDt;
      if (stepDt > 0.05) stepDt = 0.05;
      liquidPendingDt = 0;
      // debug meter — a merged catch-up step lands ~3x a normal frame's dt
      // in one go (compression error scales with stepDt^2); flag it.
      if (stepDt > dt * 1.5) liquidDbgHeartbeat = 45;
    }
    liquidDbgLastDtMs = stepDt * 1000;
    liquidWGPU.update(stepDt);
  }

  function updateLiquids(dt) {
    // v24.125 — apply queued ?wdbg= lever sets once the gm facade is up
    // (boot ordering: 040 parses the URL before 360 registers the levers).
    if (pondTestWdbg && typeof window !== 'undefined' && window.gm && window.gm.set) {
      var wparts = pondTestWdbg.split(',');
      for (var wpi = 0; wpi < wparts.length; wpi++) {
        var wkv = wparts[wpi].split(':');
        if (wkv.length === 2) {
          try { window.gm.set('water.' + wkv[0].trim(), parseFloat(wkv[1])); } catch (_) {}
        }
      }
      console.log('WDBG applied: ' + pondTestWdbg);
      pondTestWdbg = '';
    }
    // v24.143 — ?pondtest=3 BREACH: let the pond settle (~20 s), then dig
    // its right wall open into a fresh 3x4 pit, reproducing the owner's
    // actual gameplay loop (dig -> drain -> flow -> should re-settle)
    // headlessly. Goes through the real dig path (markTerrainCleared), so
    // dig-wake ops, lighting, trees etc. all fire exactly as in play. The
    // POND probe below reports the pit/pond particle split as the drainage
    // measurement.
    if (pondTestKind === 3 && pondTestBreachT < 1e8) {
      pondTestBreachT += dt;
      if (pondTestBreachT >= 20) {
        pondTestBreachT = 1e9;   // fire once
        var bbP = null, bbD = Infinity;
        for (var bpi = 0; bpi < surfacePonds.length; bpi++) {
          var bpd = surfacePonds[bpi];
          if (!bpd.filled) continue;
          var bcx = (bpd.cL + bpd.cR + 1) * 0.5 * TILE;
          var bdd = Math.abs(bcx - (player ? player.x : bcx));
          if (bdd < bbD) { bbD = bdd; bbP = bpd; }
        }
        if (bbP) {
          pondTestBreachPond = bbP;
          var bw = bbP.cR + 1;          // the pond's right wall column
          var bD = bbP.d || 1;          // v24.148 — deep lakes
          // Open the TOP 3 wall rows (drains the lake's upper slice) into a
          // pit dug 2 rows deeper than the lake floor, so a real head
          // exists for the whole drain.
          var bCells = [];
          for (var brw = SKY_ROWS; brw <= Math.min(SKY_ROWS + 2, SKY_ROWS + bD - 1); brw++) bCells.push([brw, bw]);
          for (var brr = SKY_ROWS; brr <= SKY_ROWS + bD + 2; brr++) {
            for (var brc = bw + 1; brc <= bw + 3; brc++) bCells.push([brr, brc]);
          }
          var bDug = 0;
          for (var bci = 0; bci < bCells.length; bci++) {
            var brW = bCells[bci][0], bcW = bCells[bci][1];
            var btl = world[brW] && world[brW][bcW];
            if (!btl) continue;
            world[brW][bcW] = null;
            markTerrainCleared(brW, bcW, btl);
            bDug++;
          }
          console.log('BREACH: opened wall col=' + bw + ' + 3x4 pit (' + bDug + ' tiles dug)');
        }
      }
    }
    // v24.145 — drive the water state machine (calm ramp + freeze latch)
    // before either solver path runs; uses the REAL frame dt, not the
    // debug-kit injected one (state timers are wall-clock).
    liquidStateTick(dt);
    // v24.150 — orphan wake (housekeeping; skipped while the whole body is
    // frozen — a frozen lake has no draining support to lose).
    if (!(LIQUID_FREEZE && liquidFrozenAll)) liquidOrphanWakeTick();
    // v24.120 water debug kit — dt injectors run BEFORE the GPU delegate so
    // both paths feel them. FIXED_DT pins the sim clock to 1/60 regardless
    // of real frame time (compression error scales with stepDt^2, so an
    // irregular clock alone can pop a calm pond; GC hitches look exactly
    // like that). DT_SPIKE injects one deliberately fat frame every ~1.5 s
    // to reproduce the same coupling on demand.
    if (LIQUID_DBG_FIXED_DT) dt = 1 / 60;
    if (LIQUID_DBG_DT_SPIKE > 0) {
      liquidDbgSpikeTick++;
      if (liquidDbgSpikeTick >= 90) {
        liquidDbgSpikeTick = 0;
        dt += LIQUID_DBG_DT_SPIKE / 1000;
        liquidDbgSpikeFlash = 45;
      }
    } else liquidDbgSpikeTick = 0;
    if (liquidDbgSpikeFlash > 0) liquidDbgSpikeFlash--;
    if (liquidDbgHeartbeat > 0) liquidDbgHeartbeat--;
    liquidDbgRateTick++;
    if (liquidDbgRateTick >= 60) {
      liquidDbgRateTick = 0;
      liquidDbgSkipRate = liquidDbgSkipped;
      liquidDbgSkipped = 0;
    }
    liquidDbgLastDtMs = dt * 1000;
    // WebGPU solver delegate — dormant until the GPU port goes live
    // (simActive flips on at Stage 8); until then the CPU solver runs.
    if (liquidWGPU && liquidWGPU.simActive) { updateLiquidsGPU(dt); return; }
    // v24.109 — the GPU consumes liquidOps; on the CPU path nothing does
    // (the CPU arrays ARE the live state), so drop them here.
    liquidOps.length = 0;
    liquidOpsOverflow = false;
    if (PERF_DISABLE_WATER) return;   // v11.75 — optimization-session toggle
    if (!liquidCount && !oilSuckFx.length) return;
    if (!isFinite(dt) || dt <= 0.0005) return;
    if (dt > 0.05) dt = 0.05;
    // v24.145 — whole-body freeze: time does not pass for frozen water. No
    // stepping, no banked catch-up dt (the old idle-skip heartbeat fired a
    // merged step every ~200 ms at full sleep, re-kicking the EOS forever).
    // liquidStateTick owns the thaw; FX tails still decay.
    if (LIQUID_FREEZE && liquidFrozenAll) {
      liquidPendingDt = 0;
      liquidSimSkipFrames = 0;
      liquidDbgSkipped++;
      for (var fxf = oilSuckFx.length - 1; fxf >= 0; fxf--) {
        oilSuckFx[fxf].t -= dt;
        if (oilSuckFx[fxf].t <= 0) oilSuckFx.splice(fxf, 1);
      }
      return;
    }
    // steps + stepDt are derived after the sleep/pending merge below (v24.10).
    var steps = 1;
    var stepDt = dt;
    var awakeCount = liquidUpdateActiveRegion();

    // ---- v10.99 GOLD: adaptive sim skip ----
    var playerCalm = !player ||
      (Math.abs(player.vx) < LIQUID_SIM_PLAYER_VEL_GATE &&
       Math.abs(player.vy) < LIQUID_SIM_PLAYER_VEL_GATE * 4);
    var noPerturb = !explosions.length &&
      !(rocketIntensity > 0.02 && player && player.thrusting);
    if (!LIQUID_DBG_NO_IDLESKIP && awakeCount === 0 && playerCalm && noPerturb) {
      liquidSimSkipFrames++;
      if (liquidSimSkipFrames < LIQUID_SIM_FORCE_EVERY) {
        liquidPendingDt += dt;
        liquidDbgSkipped++;
        for (var fxs = oilSuckFx.length - 1; fxs >= 0; fxs--) {
          oilSuckFx[fxs].t -= dt;
          if (oilSuckFx[fxs].t <= 0) oilSuckFx.splice(fxs, 1);
        }
        return;
      }
    }
    liquidSimSkipFrames = 0;
    // v24.10 — merge any dt accumulated while the sim slept, then split the
    // total into N small sub-steps. Equilibrium column compression ∝ stepDt²,
    // so small sub-steps keep a DEEP pool at ~rest density instead of
    // over-compressing then detonating into "popcorn" (matches the GPU
    // runFrame substepping + saharan's Water demo). Same total time advances.
    var totalDt = dt;
    if (liquidPendingDt > 0) {
      totalDt += liquidPendingDt;
      liquidPendingDt = 0;
      if (totalDt > dt * 1.5) liquidDbgHeartbeat = 45;   // debug meter: merged catch-up step
    }
    if (totalDt > 0.05) totalDt = 0.05;
    liquidDbgLastDtMs = totalDt * 1000;
    if (LIQUID_FIXED_STEP) {
      // v24.124 fixed-quantum substepping — constant stepDt, remainder
      // banked (rationale at the lever block in 010-constants; edit²
      // liquid-wgpu runFrame). steps === 0 just banks this frame's dt;
      // the fx tail below still runs.
      liquidStepAcc += totalDt;
      steps = Math.floor(liquidStepAcc / LIQUID_SUBSTEP_DT);
      if (steps > LIQUID_MAX_SUBSTEPS) steps = LIQUID_MAX_SUBSTEPS;
      liquidStepAcc -= steps * LIQUID_SUBSTEP_DT;
      if (liquidStepAcc > LIQUID_SUBSTEP_DT * 2) liquidStepAcc = LIQUID_SUBSTEP_DT * 2;
      stepDt = LIQUID_SUBSTEP_DT;
    } else {
      steps = Math.ceil(totalDt / LIQUID_SUBSTEP_DT);
      if (steps < 1) steps = 1;
      if (steps > LIQUID_MAX_SUBSTEPS) steps = LIQUID_MAX_SUBSTEPS;
      stepDt = totalDt / steps;
      if (stepDt <= 0.0005) return;
    }

    var _lts;
    for (var s = 0; s < steps; s++) {
      _lts = performance.now(); updateOilSuction(stepDt);   perfMark('liquids.oilSuck', _lts);
      _lts = performance.now(); liquidP2G(stepDt);          perfMark('liquids.P2G', _lts);
      _lts = performance.now(); liquidApplyGridPressure();  perfMark('liquids.pressure', _lts);
      _lts = performance.now(); liquidUpdateGrid(stepDt);   perfMark('liquids.gridUpdate', _lts);
      _lts = performance.now(); liquidG2P(stepDt);          perfMark('liquids.G2P', _lts);
      _lts = performance.now();
      // Skip frozen (off-screen) AND sleeping (settled, no motion) particles
      // — they don't need collision sweeps. The other pipeline stages
      // (P2G, pressure, G2P) already do this; the move loop was the only
      // hot loop hitting every particle unconditionally. For a typical
      // pond where most water has settled into a sleeping pile at the
      // bottom, this drops move-cost from "all N particles × 16 world
      // probes (and up to 9× that when a particle is stuck)" to "only
      // the active swimmers", which is a small fraction of N.
      for (var mi = liquidCount - 1; mi >= 0; mi--) {
        if (liquidFrozen[mi] || liquidSleeping[mi]) continue;
        if (!liquidMoveParticle(mi, stepDt)) removeLiquidParticle(mi);
      }
      perfMark('liquids.move', _lts);
    }
    for (var fx = oilSuckFx.length - 1; fx >= 0; fx--) {
      oilSuckFx[fx].t -= dt;
      if (oilSuckFx[fx].t <= 0) oilSuckFx.splice(fx, 1);
    }
  }

  function liquidGLCompile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'liquid shader compile failed');
    }
    return sh;
  }

  function liquidGLConsoleClipPath() {
    // v11.42 — Switched back to a simple bottom inset clip. CSS
    // polygon(evenodd, ...) with multiple disjoint rectangles produces
    // a self-intersecting shape, not multiple holes — which is what
    // was causing water to get clipped in weird places mid-screen.
    // inset(0 0 Npx 0) clips a clean bottom strip only.
    return effectCanvasInsetClip(/*bottomMargin=*/36);
  }
  function effectCanvasInsetClip(bottomMargin) {
    if (typeof bottomMargin !== 'number') bottomMargin = 88;
    return 'inset(0px 0px ' + bottomMargin + 'px 0px)';
  }
  function liquidGLPositionDOM() {
    if (!liquidGLCanvas) return;
    // Liquid canvas covers the main viewport 1:1 — coords inside its
    // shader are already cam-relative pixels (see drawLiquidsWebGL).
    liquidGLCanvas.style.left   = '0';
    liquidGLCanvas.style.top    = '0';
    liquidGLCanvas.style.width  = viewW + 'px';
    liquidGLCanvas.style.height = viewH + 'px';
    // v11.25 — clip out the bottom console area so water doesn't bleed
    // through the HUD.
    liquidGLCanvas.style.clipPath = liquidGLConsoleClipPath();
  }

  function uiCoversDomEffectLayers() {
    return !!(UI_NEW && ((shopState !== 'closed') || gameOver || gameWon));
  }

  function setDomEffectLayerHidden(layer, hidden) {
    if (!layer || !layer.style) return;
    var display = hidden ? 'none' : 'block';
    if (layer.style.display !== display) layer.style.display = display;
  }

  function syncDomEffectLayerVisibility() {
    var hidden = uiCoversDomEffectLayers();
    setDomEffectLayerHidden(smokeFluidCanvas, hidden);
    setDomEffectLayerHidden(liquidGLCanvas, hidden);
    if (liquidWGPU && liquidWGPU.renderCanvas) {
      setDomEffectLayerHidden(liquidWGPU.renderCanvas, hidden);
    }
    return hidden;
  }

  function liquidGLEnsure() {
    if (liquidGLDisabled) return false;
    if (liquidGL) return true;
    try {
      liquidGLCanvas = document.createElement('canvas');
      liquidGLCanvas.width = canvas.width;
      liquidGLCanvas.height = canvas.height;
      liquidGL = liquidGLCanvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
      if (!liquidGL) throw new Error('WebGL unavailable for liquid renderer');
      // v10.90 — same DOM-layer trick we used for smoke (v10.83). The
      // drawImage(liquidGLCanvas) blit forces a cross-context GPU sync
      // every frame; layering the canvas as a sibling DOM element with
      // CSS positioning lets the browser composite it natively (no
      // sync). z-index:4 = below smoke (5) but above the main canvas.
      liquidGLCanvas.style.cssText =
        'position:absolute;left:0;top:0;pointer-events:none;z-index:4;display:block;';
      if (canvas && canvas.parentElement) {
        canvas.parentElement.appendChild(liquidGLCanvas);
      }
      liquidGLPositionDOM();
      var gl = liquidGL;
      var vs = liquidGLCompile(gl, gl.VERTEX_SHADER,
        'attribute vec2 a_pos;\n' +
        'attribute float a_size;\n' +
        'attribute vec4 a_color;\n' +
        'uniform vec2 u_resolution;\n' +
        'varying vec4 v_color;\n' +
        'void main(){\n' +
        '  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;\n' +
        '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);\n' +
        '  gl_PointSize = a_size;\n' +
        '  v_color = a_color;\n' +
        '}\n');
      var fs = liquidGLCompile(gl, gl.FRAGMENT_SHADER,
        'precision mediump float;\n' +
        'varying vec4 v_color;\n' +
        'void main(){\n' +
        '  vec2 uv = gl_PointCoord * 2.0 - 1.0;\n' +
        '  float a = clamp(1.0 - dot(uv, uv), 0.0, 1.0);\n' +
        '  if (a <= 0.0) discard;\n' +
        '  gl_FragColor = vec4(v_color.rgb, v_color.a * a);\n' +
        '}\n');
      liquidGLProgram = gl.createProgram();
      gl.attachShader(liquidGLProgram, vs);
      gl.attachShader(liquidGLProgram, fs);
      gl.linkProgram(liquidGLProgram);
      if (!gl.getProgramParameter(liquidGLProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(liquidGLProgram) || 'liquid program link failed');
      }
      liquidGLLocPos = gl.getAttribLocation(liquidGLProgram, 'a_pos');
      liquidGLLocSize = gl.getAttribLocation(liquidGLProgram, 'a_size');
      liquidGLLocColor = gl.getAttribLocation(liquidGLProgram, 'a_color');
      liquidGLLocResolution = gl.getUniformLocation(liquidGLProgram, 'u_resolution');
      liquidGLBuffer = gl.createBuffer();
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return true;
    } catch (e) {
      liquidGLDisabled = true;
      liquidGL = null;
      return false;
    }
  }

  function drawLiquidsWebGL(left, right, top, bottom) {
    if (!liquidGLEnsure()) return false;
    var gl = liquidGL;
    if (liquidGLCanvas.width !== canvas.width || liquidGLCanvas.height !== canvas.height) {
      liquidGLCanvas.width = canvas.width;
      liquidGLCanvas.height = canvas.height;
    }
    var _rlc0 = performance.now();
    // v10.91 — hot-loop polish for 30k-particle pools.
    //   - Hoist all LIQUID_* into locals (no prop reads in loop)
    //   - Skip frozen particles up front (cheaper than the 4-axis bbox)
    //   - Inline the Math.min/max clamps as ternaries
    //   - Cache cam.x/y, dpr*worldScale, point-size base
    //   - Pre-compute foam delta so per-particle is a single FMA
    var dpws = dpr * worldScale;
    var camX = cam.x, camY = cam.y;
    var sizeBase = LIQUID_CELL * LIQUID_PDELTA * 0.85 * 2 * dpws;
    var sizeBaseWater = sizeBase * LIQUID_WATER_PARTICLE_SIZE;
    var sizeBaseOil   = sizeBase * LIQUID_OIL_PARTICLE_SIZE;
    var wR = LIQUID_WATER_R, wG = LIQUID_WATER_G, wB = LIQUID_WATER_B, wA = LIQUID_WATER_ALPHA;
    var fR = LIQUID_WATER_FOAM_R - wR;
    var fG = LIQUID_WATER_FOAM_G - wG;
    var fB = LIQUID_WATER_FOAM_B - wB;
    var oR = LIQUID_OIL_R, oG = LIQUID_OIL_G, oB = LIQUID_OIL_B, oA = LIQUID_OIL_ALPHA;
    var data = liquidGLData;
    var n = liquidCount;
    var count = 0;
    for (var i = 0; i < n; i++) {
      if (liquidFrozen[i]) continue;
      var px = liquidX[i];
      if (px < left || px > right) continue;
      var py = liquidY[i];
      if (py < top || py > bottom) continue;
      var d = liquidDensity[i] * LIQUID_INV_DENSITY + 0.5;
      if (d > 1.5) d = 1.5;
      var typ = liquidType[i];
      var pointSize = (typ === 1 ? sizeBaseOil : sizeBaseWater) * d;
      if (pointSize < 1.15) pointSize = 1.15;
      var o = count * 7;
      data[o    ] = (px - camX) * dpws;
      data[o + 1] = (py - camY) * dpws;
      data[o + 2] = pointSize;
      if (typ === 0) {
        var a = liquidAeration[i];
        if (a < 0) a = 0; else if (a > 1) a = 1;
        data[o + 3] = wR + a * fR;
        data[o + 4] = wG + a * fG;
        data[o + 5] = wB + a * fB;
        data[o + 6] = wA;
      } else {
        data[o + 3] = oR;
        data[o + 4] = oG;
        data[o + 5] = oB;
        data[o + 6] = oA;
      }
      count++;
    }
    perfMark('render.liquidsCPU', _rlc0);
    var _rlu0 = performance.now();
    // v10.90 — always clear, even when count=0. As a DOM-layered
    // canvas the previous frame's pixels persist on screen until we
    // overwrite them; pre-v10.90 the drawImage path effectively
    // re-cleared every frame via overdraw.
    gl.viewport(0, 0, liquidGLCanvas.width, liquidGLCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!count) { perfMark('render.liquidsGPU', _rlu0); return true; }
    gl.useProgram(liquidGLProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, liquidGLBuffer);
    var _rlb0 = performance.now();
    gl.bufferData(gl.ARRAY_BUFFER, liquidGLData.subarray(0, count * 7), gl.STREAM_DRAW);
    perfMark('render.liquidsBufferData', _rlb0);
    var stride = 7 * 4;
    gl.uniform2f(liquidGLLocResolution, liquidGLCanvas.width, liquidGLCanvas.height);
    gl.enableVertexAttribArray(liquidGLLocPos);
    gl.enableVertexAttribArray(liquidGLLocSize);
    gl.enableVertexAttribArray(liquidGLLocColor);
    gl.vertexAttribPointer(liquidGLLocPos, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(liquidGLLocSize, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribPointer(liquidGLLocColor, 4, gl.FLOAT, false, stride, 3 * 4);
    gl.drawArrays(gl.POINTS, 0, count);
    perfMark('render.liquidsGPU', _rlu0);
    // v10.90 — no drawImage. The browser composites liquidGLCanvas as
    // a DOM layer over the main canvas, no cross-context blit cost.
    return true;
  }

  function drawLiquids() {
    if (syncDomEffectLayerVisibility()) return;

    // WebGPU renderer delegate — live from Stage 8 (renderActive). The
    // GPU draws the particles straight from its buffers onto
    // liquidWGPUCanvas; this path then hides the CPU renderer's
    // liquidGLCanvas (both sit at z-index 4 — if the CPU canvas were left
    // visible its last, now-stale frame would show through) and still
    // draws the oil-intake streaks on the main ctx.
    if (liquidWGPU && liquidWGPU.renderActive) {
      // v14.9 — reverted v14.6's "hide the WebGPU canvas when no water is
      // on screen" gate; it mis-fired and hid the water entirely. The
      // renderer just draws straight from the GPU buffer every frame.
      liquidWGPU.draw();
      if (liquidGLCanvas && liquidGLCanvas.style.display !== 'none') {
        liquidGLCanvas.style.display = 'none';
      }
      if (oilSuckFx.length) {
        ctx.save();
        ctx.lineCap = 'round';
        for (var gwfi = 0; gwfi < oilSuckFx.length; gwfi++) {
          var gwf = oilSuckFx[gwfi];
          var gwa = Math.max(0, gwf.t / gwf.maxT);
          ctx.strokeStyle = 'rgba(230,170,70,' + (0.52 * gwa).toFixed(3) + ')';
          ctx.lineWidth = 1.2 + gwa * 1.4;
          ctx.beginPath();
          ctx.moveTo(gwf.x, gwf.y);
          ctx.lineTo(gwf.tx, gwf.ty);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (LIQUID_DBG_DRAW) drawLiquidDebugOverlay();
      return;
    }
    // CPU renderer path. If the GPU renderer was live and then faulted
    // back to the CPU (renderActive went false mid-run), un-hide
    // liquidGLCanvas — the Stage-8 GPU path hid it above.
    if (liquidGLCanvas && liquidGLCanvas.style.display === 'none') {
      liquidGLCanvas.style.display = 'block';
    }
    if (PERF_DISABLE_WATER) return;   // v11.75 — optimization-session toggle
    if (!liquidCount && !oilSuckFx.length) return;
    var left = cam.x - 24;
    var right = cam.x + screenW + 24;
    var top = cam.y - 24;
    var bottom = cam.y + screenH + 24;

    if (drawLiquidsWebGL(left, right, top, bottom)) {
      if (oilSuckFx.length) {
        ctx.save();
        ctx.lineCap = 'round';
        for (var wfi = 0; wfi < oilSuckFx.length; wfi++) {
          var wf = oilSuckFx[wfi];
          var wa = Math.max(0, wf.t / wf.maxT);
          ctx.strokeStyle = 'rgba(230,170,70,' + (0.52 * wa).toFixed(3) + ')';
          ctx.lineWidth = 1.2 + wa * 1.4;
          ctx.beginPath();
          ctx.moveTo(wf.x, wf.y);
          ctx.lineTo(wf.tx, wf.ty);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (LIQUID_DBG_DRAW) drawLiquidDebugOverlay();
      return;
    }

    ctx.save();
    for (var pass = 0; pass < 2; pass++) {
      var type = pass === 0 ? 'water' : 'oil';
      ctx.fillStyle = type === 'water' ? 'rgba(93,199,238,0.70)' : 'rgba(13,10,5,0.92)';
      var typeId = pass === 0 ? 0 : 1;
      for (var i = 0; i < liquidCount; i++) {
        if (liquidType[i] !== typeId) continue;
        if (liquidX[i] < left || liquidX[i] > right || liquidY[i] < top || liquidY[i] > bottom) continue;
        var d = liquidDensity[i] * LIQUID_INV_DENSITY;
        var sizeMul = typeId === 1 ? LIQUID_OIL_PARTICLE_SIZE : LIQUID_WATER_PARTICLE_SIZE;
        var pointSize = LIQUID_CELL * LIQUID_PDELTA * 0.85 * Math.min(d + 0.5, 1.5) * 2 * sizeMul;
        var rr = Math.max(0.65, pointSize * 0.5);
        ctx.fillRect(liquidX[i] - rr, liquidY[i] - rr, rr * 2, rr * 2);
        if (liquidAeration[i] > 0.08) {
          ctx.fillStyle = type === 'water'
            ? 'rgba(220,250,255,' + Math.min(0.78, liquidAeration[i]).toFixed(3) + ')'
            : 'rgba(230,190,110,' + Math.min(0.52, liquidAeration[i] * 0.7).toFixed(3) + ')';
          var fr = Math.max(0.45, rr * 0.32);
          ctx.fillRect(liquidX[i] - rr * 0.25 - fr, liquidY[i] - rr * 0.35 - fr, fr * 2, fr * 2);
          ctx.fillStyle = type === 'water' ? 'rgba(93,199,238,0.70)' : 'rgba(13,10,5,0.92)';
        }
      }
    }

    if (oilSuckFx.length) {
      ctx.lineCap = 'round';
      for (var fi = 0; fi < oilSuckFx.length; fi++) {
        var f = oilSuckFx[fi];
        var a = Math.max(0, f.t / f.maxT);
        ctx.strokeStyle = 'rgba(230,170,70,' + (0.52 * a).toFixed(3) + ')';
        ctx.lineWidth = 1.2 + a * 1.4;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.tx, f.ty);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (LIQUID_DBG_DRAW) drawLiquidDebugOverlay();
  }

  // ----- v24.120 WATER DEBUG OVERLAY (lever: water.DBG_DRAW) ------------
  // Live instrument for the resting-pond firecracker hunt. Drawn in world
  // space on the main ctx (same layer as the oil-intake streaks).
  //   DBG_DRAW >= 1 — stat meter (counts / speeds / wake-burst log / dt +
  //                   idle-skip state) + the sim region box (red dashes;
  //                   a mirror of getView in 020, incl. the v24.115
  //                   filled-pond extension) + filled-pond extents (cyan).
  //   DBG_DRAW >= 2 — per-particle state dots: sleeping cyan, awake amber,
  //                   frozen magenta; red + bigger when |v| > 40 px/s (a
  //                   pop). On the WebGPU path the mirror arrays refresh
  //                   only on readback (water.DBG_READBACK_EVERY, default
  //                   20 frames), so dots + speed stats move in steps;
  //                   drop that lever to ~5 for a snappier sample.
  // The wake-burst log is THE period instrument: each "-N" entry is N
  // particles leaving sleep between consecutive samples, with seconds-ago
  // timestamps, so the firecracker period can be read straight off it.
  function drawLiquidDebugOverlay() {
    var s = 1 / worldScale;   // ~ one CSS px in world units
    ctx.save();

    // Stat refresh — every 10 draws (the GPU mirror only moves per
    // readback anyway; no point paying a 20k-sqrt pass per frame).
    liquidDbgStatTick++;
    if (liquidDbgStatTick >= 10) {
      liquidDbgStatTick = 0;
      var n = 0, sum = 0, mxv = 0, fast = 0;
      for (var i = 0; i < liquidCount; i++) {
        if (liquidType[i] !== 0 || liquidFrozen[i]) continue;
        var vv = Math.sqrt(liquidVX[i] * liquidVX[i] + liquidVY[i] * liquidVY[i]);
        n++; sum += vv;
        if (vv > mxv) mxv = vv;
        if (vv > 40) fast++;
      }
      liquidDbgN = n;
      liquidDbgMean = n ? sum / n : 0;
      liquidDbgMax = mxv;
      liquidDbgFast = fast;
      // Wake-burst detector — a drop in the sleeping tally between samples
      // means that many particles woke at once (the firecracker signature).
      if (liquidDbgPrevSleep >= 0) {
        var dSl = liquidDbgPrevSleep - liquidStatSleeping;
        if (dSl >= Math.max(12, liquidCount * 0.005)) {
          liquidDbgBursts.unshift({ n: dSl, f: 0 });
          if (liquidDbgBursts.length > 5) liquidDbgBursts.length = 5;
        }
      }
      liquidDbgPrevSleep = liquidStatSleeping;
    }
    for (var ba = liquidDbgBursts.length - 1; ba >= 0; ba--) {
      liquidDbgBursts[ba].f++;
      if (liquidDbgBursts[ba].f > 480) liquidDbgBursts.splice(ba, 1);
    }

    // Sim region box + filled-pond extents.
    var sw = viewW / worldScale, sh = viewH / worldScale;
    var mxr = sw * LIQUID_ACTIVE_MARGIN, myr = sh * LIQUID_ACTIVE_MARGIN;
    var rx0 = cam.x - mxr, ry0 = cam.y - myr;
    var rx1 = cam.x + sw + mxr, ry1 = cam.y + sh + myr;
    var pTop = (SKY_ROWS - 3) * TILE, pBot = (SKY_ROWS + 3) * TILE;
    if (typeof surfacePonds !== 'undefined' && surfacePonds) {
      for (var pi = 0; pi < surfacePonds.length; pi++) {
        var pd = surfacePonds[pi];
        if (!pd.filled) continue;
        var pl = (pd.cL - 2) * TILE, pr = (pd.cR + 3) * TILE;
        if (pr <= rx0 || pl >= rx1) continue;
        if (pBot <= ry0 || pTop >= ry1) continue;
        if (pl < rx0) rx0 = pl;
        if (pr > rx1) rx1 = pr;
        if (pTop < ry0) ry0 = pTop;
        if (pBot > ry1) ry1 = pBot;
      }
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.lineWidth = 1.4 * s;
      ctx.strokeStyle = 'rgba(120,230,255,0.8)';
      for (var pj = 0; pj < surfacePonds.length; pj++) {
        var pq = surfacePonds[pj];
        if (!pq.filled) continue;
        ctx.strokeRect(pq.cL * TILE, pTop, (pq.cR + 1 - pq.cL) * TILE, pBot - pTop);
      }
      ctx.strokeStyle = 'rgba(255,90,90,0.9)';
      ctx.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      ctx.setLineDash([]);
    }

    // Particle state dots.
    if (LIQUID_DBG_DRAW >= 2) {
      var dl = cam.x - 8, drr = cam.x + sw + 8, dtp = cam.y - 8, dbt = cam.y + sh + 8;
      var dot = Math.max(1.1, 1.5 * s);
      for (var k = 0; k < liquidCount; k++) {
        var px = liquidX[k], py = liquidY[k];
        if (px < dl || px > drr || py < dtp || py > dbt) continue;
        var spd2 = liquidVX[k] * liquidVX[k] + liquidVY[k] * liquidVY[k];
        if (spd2 > 1600) {                       // > 40 px/s — a pop
          ctx.fillStyle = 'rgba(255,46,46,0.95)';
          ctx.fillRect(px - dot * 1.6, py - dot * 1.6, dot * 3.2, dot * 3.2);
        } else if (liquidFrozen[k]) {
          ctx.fillStyle = 'rgba(255,80,255,0.9)';
          ctx.fillRect(px - dot * 0.5, py - dot * 0.5, dot, dot);
        } else if (liquidSleeping[k]) {
          ctx.fillStyle = 'rgba(70,210,255,0.8)';
          ctx.fillRect(px - dot * 0.5, py - dot * 0.5, dot, dot);
        } else {
          ctx.fillStyle = 'rgba(255,184,60,0.9)';
          ctx.fillRect(px - dot * 0.5, py - dot * 0.5, dot, dot);
        }
      }
    }

    // Meter text block.
    var lines = [];
    lines.push('WATER DBG  n=' + liquidDbgN + '  awake=' + liquidStatAwake +
      '  sleep=' + liquidStatSleeping + '  frz=' + liquidStatFrozen);
    // v24.145 — the state machine at a glance (liquidStateTick).
    lines.push('state ' + liquidStateName + '  calm ' + LIQUID_CALM.toFixed(2) +
      '  fast ' + liquidFastCount + (liquidFrozenAll ? '  FROZEN' : ''));
    lines.push('v: mean ' + liquidDbgMean.toFixed(1) + '  max ' + liquidDbgMax.toFixed(0) +
      '  >40px/s: ' + liquidDbgFast);
    // v24.181 — DENSITY forensics: the render sizes by density, so this is the
    // real axis for the "giant particles". mean = avg density ratio (rest ~1.0-1.3);
    // >=1 = % at the full-size render cap; MAX = the fattest particle's density;
    // nb = water particles within 8 px of it (1 = a true lone giant, high = a
    // dense clump); v = its speed; FRZ/SLP = stuck-with-stale-density flags.
    var fdSum = 0, fdN = 0, fdGe1 = 0, fdMax = 0, fdMX = 0, fdMY = 0, fdMV = 0, fdMs = 0;
    for (var fdk = 0; fdk < liquidCount; fdk++) {
      if (liquidType[fdk] !== 0) continue;
      var fdn = liquidDensity[fdk] * LIQUID_INV_DENSITY;
      fdSum += fdn; fdN++;
      if (fdn >= 1.0) fdGe1++;
      if (fdn > fdMax) { fdMax = fdn; fdMX = liquidX[fdk]; fdMY = liquidY[fdk]; fdMV = Math.sqrt(liquidVX[fdk] * liquidVX[fdk] + liquidVY[fdk] * liquidVY[fdk]); fdMs = liquidFrozen[fdk] ? 2 : (liquidSleeping[fdk] ? 1 : 0); }
    }
    var fdNb = 0;
    for (var fd2 = 0; fd2 < liquidCount; fd2++) {
      if (liquidType[fd2] !== 0) continue;
      var fddx = liquidX[fd2] - fdMX, fddy = liquidY[fd2] - fdMY;
      if (fddx * fddx + fddy * fddy < 64) fdNb++;
    }
    lines.push('dn mean ' + (fdN ? (fdSum / fdN).toFixed(2) : '-') + ' >=1 ' + (fdN ? (100 * fdGe1 / fdN).toFixed(0) : '-') +
      '% MAX ' + fdMax.toFixed(2) + ' nb' + fdNb + ' v' + fdMV.toFixed(0) + (fdMs === 2 ? ' FRZ' : (fdMs === 1 ? ' SLP' : '')));
    var bl = 'wake bursts:';
    if (!liquidDbgBursts.length) bl += ' none';
    for (var bb = 0; bb < liquidDbgBursts.length; bb++) {
      bl += '  -' + liquidDbgBursts[bb].n + ' ' + (liquidDbgBursts[bb].f / 60).toFixed(1) + 's';
    }
    lines.push(bl);
    var dtLine = 'dt ' + liquidDbgLastDtMs.toFixed(1) + 'ms ' +
      (LIQUID_FIXED_STEP ? 'fixstep' : 'split') + '  skip ' + liquidDbgSkipRate + '/s';
    if (liquidDbgHeartbeat > 0) dtLine += '  HEARTBEAT';
    if (liquidDbgSpikeFlash > 0) dtLine += '  SPIKE';
    lines.push(dtLine);
    var onL = '';
    if (LIQUID_DBG_NO_SLEEP) onL += ' NOSLEEP';
    if (LIQUID_DBG_NO_BRAKE) onL += ' NOBRAKE';
    if (LIQUID_DBG_NO_IDLESKIP) onL += ' NOIDLE';
    if (LIQUID_DBG_NO_SWEEP) onL += ' NOSWEEP';
    if (LIQUID_DBG_FIXED_DT) onL += ' FIXDT';
    if (LIQUID_DBG_DT_SPIKE > 0) onL += ' SPIKE+' + LIQUID_DBG_DT_SPIKE + 'ms';
    if (onL) lines.push('ON:' + onL);

    var fontPx = 11 * s;
    var lineH = 14 * s;
    var x0 = cam.x + 10 * s;
    var y0 = cam.y + 96 * s;
    // v24.184 — the L tuning panel opens over the top-left and hides this meter.
    // When it's open, shift the meter to just right of the panel so v: mean (and
    // the dn line) stay readable while you drag water levers.
    if (typeof gmPanelVisible !== 'undefined' && gmPanelVisible &&
        typeof gmPanelEl !== 'undefined' && gmPanelEl && gmPanelEl.offsetWidth) {
      x0 = cam.x + (gmPanelEl.offsetWidth + 16) * s;
    }
    ctx.font = fontPx.toFixed(2) + 'px ' + (typeof UI_FONT !== 'undefined' ? UI_FONT : 'monospace');
    var wMax = 0;
    for (var li = 0; li < lines.length; li++) {
      var tw = ctx.measureText(lines[li]).width;
      if (tw > wMax) wMax = tw;
    }
    ctx.fillStyle = 'rgba(8,12,16,0.72)';
    ctx.fillRect(x0 - 6 * s, y0 - lineH, wMax + 12 * s, lines.length * lineH + 10 * s);
    for (var lj = 0; lj < lines.length; lj++) {
      var fresh = lj === 2 && liquidDbgBursts.length && liquidDbgBursts[0].f < 60;
      ctx.fillStyle = fresh ? '#ffb347' : '#9fd8ef';
      ctx.fillText(lines[lj], x0, y0 + lj * lineH);
    }
    ctx.restore();
  }

  // v10.93 — cache each pond's basin overlay to an offscreen canvas.
  // Pre-v10.93 this rendered ~25 tiles × ~5 rows × 3 ponds = ~375
  // expensive drawVoidBackingMaterial calls + path clips PER FRAME.
  // The basin geometry never changes at runtime (pond layout is set
  // at world gen) and the backing material is deterministic per
  // (r, c), so a one-time cache + drawImage per pond is identical
  // visually for ~1/300 the cost.
  function buildPondBasinCache(pool) {
    if (!pool || !pool.curved) return null;
    var widthTiles = pool.right - pool.left + 1;
    var heightTiles = pool.maxDepth + 2;
    var w = widthTiles * TILE;
    var h = heightTiles * TILE;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    var ox = pool.left * TILE;       // world x of cache origin
    var oy = pool.top  * TILE;       // world y of cache origin
    // Save the real ctx; swap to the offscreen one so the existing
    // drawing helpers (which use the module-scope `ctx`) write into
    // the cache. Translate so world coords map into cache coords.
    var prev = ctx;
    ctx = g;
    g.setTransform(1, 0, 0, 1, -ox, -oy);
    for (var col = pool.left; col <= pool.right; col++) {
      var midX = (col + 0.5) * TILE;
      if (!surfaceBasinSupportAt(pool, midX)) continue;
      var depth = Math.max(1, pool.depths[col - pool.left] || pool.maxDepth || 1);
      var x0 = col * TILE;
      var x1 = (col + 1) * TILE;
      var bottomY = (pool.top + depth + 1) * TILE;
      var kind = dominantVoidBackingKind(pool.top, col) || 'dirt';
      g.save();
      g.beginPath();
      g.moveTo(x0, bottomY);
      g.lineTo(x0, surfaceBasinFloorY(pool, x0));
      for (var sx = x0 + 6; sx < x1; sx += 6) g.lineTo(sx, surfaceBasinFloorY(pool, sx));
      g.lineTo(x1, surfaceBasinFloorY(pool, x1));
      g.lineTo(x1, bottomY);
      g.closePath();
      g.clip();
      for (var r = pool.top; r <= pool.top + pool.maxDepth + 1; r++) {
        if (r < SKY_ROWS || r >= TOTAL_ROWS) continue;
        drawVoidBackingMaterial(kind, x0, r * TILE, r, col, getLayerForCam(r - SKY_ROWS));
      }
      g.restore();
      g.strokeStyle = kind === 'stone' ? 'rgba(240,240,220,0.16)' : 'rgba(230,150,85,0.16)';
      g.lineWidth = 1.25;
      g.beginPath();
      g.moveTo(x0, surfaceBasinFloorY(pool, x0));
      for (var ex = x0 + 6; ex < x1; ex += 6) g.lineTo(ex, surfaceBasinFloorY(pool, ex));
      g.lineTo(x1, surfaceBasinFloorY(pool, x1));
      g.stroke();
    }
    ctx = prev;
    return { canvas: c, ox: ox, oy: oy, w: w, h: h };
  }

  function drawSurfacePondBasinOverlays(startCol, endCol) {
    if (!surfacePondBasins.length) return;
    for (var i = 0; i < surfacePondBasins.length; i++) {
      var pool = surfacePondBasins[i];
      if (!pool || pool.right < startCol - 1 || pool.left > endCol + 1) continue;
      if (!pool._basinTex) pool._basinTex = buildPondBasinCache(pool);
      var t = pool._basinTex;
      if (!t) continue;
      ctx.drawImage(t.canvas, t.ox, t.oy, t.w, t.h);
    }
  }

  // Rover physics — runs in place of normal player update while balloons
  // are deployed. Player is invincible, has no controls, and free-falls
  // with augmented gravity. On vertical collision: bounce. Bounces decay
  // until the rig is essentially at rest, then balloons deflate one at a
  // time and normal play resumes.
  function updateRover(dt) {
    var R = roverMode;
    R.phaseT += dt;

    // ---- Phase: inflate ----
    if (R.phase === 'inflate') {
      // Grow each balloon from r=0.5 to its targetR over inflateDur, with
      // a slight overshoot near the end so they look pneumatic.
      var p = Math.min(1, R.phaseT / R.inflateDur);
      var grow = p < 0.85 ? p / 0.85 : (1 + Math.sin((p - 0.85) / 0.15 * Math.PI) * 0.12);
      for (var i = 0; i < R.balloons.length; i++) {
        var b = R.balloons[i];
        b.r = 0.5 + (b.targetR - 0.5) * grow;
      }
      // No movement during inflate
      player.vx = 0;
      player.vy = 0;
      if (p >= 1) {
        R.phase = 'falling';
        R.phaseT = 0;
        // Tiny initial downward kick so the fall starts visibly
        player.vy = 80;
      }
      return;
    }

    // ---- Phase: falling / bouncing — same physics, different bookkeeping ----
    // Augmented gravity for that "we are committed to gravity" feel. Cap is
    // higher than normal so we can actually pick up serious speed and get
    // reentry flames going.
    var gMul = 2.6;
    var fallCap = 1100;
    player.vy += GRAVITY * gMul * dt;
    if (player.vy > fallCap) player.vy = fallCap;

    // Track peak speed for HUD/effects
    if (player.vy > R.maxFallSpeed) R.maxFallSpeed = player.vy;

    // Reentry trail history — a ring of recent positions used to draw the
    // streaking flame trail behind the rig at high speed.
    if (Math.abs(player.vy) > 280) {
      R.reentryHistory.push({
        x: player.x + PLAYER_W / 2,
        y: player.y + PLAYER_H / 2,
        v: Math.abs(player.vy),
        t: 0.4,                    // fade lifetime
      });
      if (R.reentryHistory.length > 40) R.reentryHistory.shift();
    }
    // Decay existing trail entries
    for (var rh = R.reentryHistory.length - 1; rh >= 0; rh--) {
      R.reentryHistory[rh].t -= dt;
      if (R.reentryHistory[rh].t <= 0) R.reentryHistory.splice(rh, 1);
    }

    // ----- Drop assist (Spelunky 2 pattern) -----
    // It's hard to land a falling rover into a 1-block-wide shaft because
    // the AABB has only ~5px of leeway each side and the rover has no
    // active horizontal control. When a small sideways nudge would let
    // the rover slip into a vertical shaft directly below, ease toward
    // the shaft's center so the player doesn't have to thread the needle
    // by luck. Self-gates: only fires when the rover would actually
    // bounce *here* but be passable next door.
    if (player.vy > 0) {
      var ROVER_DROP_PROBE = TILE * 1.5;     // how far below to look
      var ROVER_DROP_RADIUS = TILE * 0.6;    // max horizontal search dist
      var ROVER_DROP_RATE = 22;              // 1/sec ease rate (per-frame ~37%)
      var rigCxA = player.x + PLAYER_W / 2;
      var pcCenter = Math.floor(rigCxA / TILE);
      var probeY = player.y + ROVER_DROP_PROBE;
      // Only assist when the rover is heading toward an obstruction at the
      // probe row. If the probe row is already clear, no help needed.
      if (solidAt(player.x, probeY, PLAYER_W, PLAYER_H)) {
        var bestDx = null;
        var bestAbs = ROVER_DROP_RADIUS;
        for (var dcA = -1; dcA <= 1; dcA++) {
          if (dcA === 0) continue;
          var pcA = pcCenter + dcA;
          if (pcA < 0 || pcA >= COLS) continue;
          // Center the AABB on the candidate column
          var candidateX = pcA * TILE + (TILE - PLAYER_W) / 2;
          var dxA = candidateX - player.x;
          if (Math.abs(dxA) > bestAbs) continue;
          // Candidate is viable if AABB would be passable there at probeY
          if (!solidAt(candidateX, probeY, PLAYER_W, PLAYER_H)) {
            bestDx = dxA;
            bestAbs = Math.abs(dxA);
          }
        }
        if (bestDx !== null) {
          var ease = bestDx * Math.min(1, ROVER_DROP_RATE * dt);
          // Never push the rover sideways into a wall at its current y
          if (!solidAt(player.x + ease, player.y, PLAYER_W, PLAYER_H)) {
            player.x += ease;
          }
        }
      }
    }

    // Try to move on Y. Balloons cushion impact — the rover bounces off
    // ANY solid tile (dirt, ore, platform, world floor) without damage and
    // without breaking through. To actually get DEEP with the drop, you
    // need to first dig a tunnel and then deploy the balloons inside it.
    var ny = player.y + player.vy * dt;

    if (player.vy > 0) {
      // Sweep in small steps so a high-velocity frame doesn't tunnel past
      // a single-tile gap. We're going fast, so we need this.
      var sweep = ny - player.y;
      var steps = Math.max(1, Math.ceil(sweep / (TILE * 0.5)));
      var stepDy = sweep / steps;
      var hitImpassable = false;
      var stoppedY = ny;
      for (var stp = 1; stp <= steps; stp++) {
        var testY = player.y + stepDy * stp;
        if (solidAt(player.x, testY, PLAYER_W, PLAYER_H)) {
          hitImpassable = true;
          stoppedY = player.y + stepDy * (stp - 1);
          break;
        }
      }
      if (hitImpassable) {
        player.y = stoppedY;
        player.onGround = true;
        // BOUNCE — flip vy, dampen by speed.
        var impactSpeed = Math.abs(player.vy);
        R.lastBounceVy = impactSpeed;
        R.bounceCount++;
        var damping = 0.5;
        if (impactSpeed > 600) damping = 0.62;
        else if (impactSpeed > 300) damping = 0.55;
        else if (impactSpeed < 120) damping = 0.35;
        player.vy = -impactSpeed * damping;
        // Debris fan at the contact point
        var sxBase = player.x + PLAYER_W / 2;
        var syBase = player.y + PLAYER_H;
        var sparkCount = Math.min(28, Math.floor(impactSpeed / 18));
        for (var sk = 0; sk < sparkCount; sk++) {
          var ang = (Math.random() - 0.5) * Math.PI - Math.PI / 2;
          var spd = 80 + Math.random() * Math.min(280, impactSpeed * 0.4);
          R.sparks.push({
            x: sxBase + (Math.random() - 0.5) * 16,
            y: syBase,
            vx: Math.cos(ang) * spd * 0.7,
            vy: Math.sin(ang) * spd,
            t: 0.7 + Math.random() * 0.5,
            maxT: 1.1,
            dust: Math.random() < 0.4,
          });
        }
        player.squash = Math.min(1, impactSpeed / 700);
        if (Math.abs(player.vy) < 90) {
          player.vy = 0;
          player.onGround = true;
          R.phase = 'deflate';
          R.phaseT = 0;
          R.deflateInterval = 0.12;
          R.deflateNext = 0;
        } else {
          R.phase = 'bouncing';
        }
      } else {
        player.y = ny;
        player.onGround = false;
      }
    } else {
      // Going UP (during a bounce). If we smack a ceiling, just stop —
      // no bounce-off-ceilings, that would feel weird.
      if (!solidAt(player.x, ny, PLAYER_W, PLAYER_H)) {
        player.y = ny;
      } else {
        player.vy = 0;
      }
    }

    // X drift: balloons sway gently with no real horizontal control. We
    // also nudge the player toward the column center to avoid a wedged-on-
    // a-tile-edge bounce that looks weird.
    player.vx *= 0.92;            // dampen any lateral motion
    player.x += player.vx * dt;
    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.x + PLAYER_W > COLS * TILE) {
      player.x = COLS * TILE - PLAYER_W;
      player.vx = 0;
    }

    // Update spark physics
    for (var sp = R.sparks.length - 1; sp >= 0; sp--) {
      var s = R.sparks[sp];
      s.t -= dt;
      if (s.t <= 0) { R.sparks.splice(sp, 1); continue; }
      s.vy += 700 * dt;            // sparks fall under gravity
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    // Per-balloon jiggle — gives each one a tiny independent wobble so the
    // cluster looks lively. Doesn't affect physics, purely visual.
    for (var bi2 = 0; bi2 < R.balloons.length; bi2++) {
      R.balloons[bi2].phase += dt * 4;
    }

    // ---- Phase: deflate ----
    if (R.phase === 'deflate') {
      R.deflateNext -= dt;
      if (R.deflateNext <= 0 && R.deflateOrder.length > 0) {
        var idx = R.deflateOrder.shift();
        R.balloons[idx].popped = true;
        R.balloons[idx].popT = 0;
        R.deflateNext = R.deflateInterval;
        sfxPlay('rover-pop');   // one pop per balloon; pool + jitter carry the variety
      }
      // Animate pop debris
      for (var pi = 0; pi < R.balloons.length; pi++) {
        if (R.balloons[pi].popped) R.balloons[pi].popT += dt;
      }
      // Once all popped AND last pop debris has faded, end mode
      if (R.deflateOrder.length === 0) {
        var allFaded = true;
        for (var pj = 0; pj < R.balloons.length; pj++) {
          if (R.balloons[pj].popT < 0.5) { allFaded = false; break; }
        }
        if (allFaded) {
          roverMode = null;
          showMsg('Touchdown!');
        }
      }
    }
  }

