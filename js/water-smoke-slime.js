/* ============================================================
 * water-smoke-slime.js — a standalone physics toy
 * ------------------------------------------------------------
 * Three engines from Sluice (the mining game on this site), one
 * shared box, one collision grid the visitor draws into:
 *
 *   WATER — js/liquid-wgpu.js (loaded as its own script, byte-
 *     identical to the game's copy). GPU MLS-MPM fluid solver,
 *     WebGPU compute, ~120 Hz substeps, sparse active-block
 *     grid. This file plays the HOST role the game plays in
 *     js/sluice/020-state.js: it owns the CPU mirror arrays +
 *     the mutation-op stream and hands the module the same
 *     hooks (getView / fillTerrainSolid / getGameState /
 *     takeOps). The module is NOT modified for this page.
 *
 *   SMOKE — the SmokeFluid WebGL sim (Pavel-Dobryakov-style
 *     advection / pressure projection / vorticity confinement),
 *     copied verbatim from the closure at the top of
 *     js/sluice/190-smoke-webgl.js. Obstacles arrive as NDC
 *     quads rasterised from the shared wall grid + slime rings.
 *
 *   SLIME — the jello soft-body solver (XPBD small steps,
 *     colored constraints, shape matching, unified per-substep
 *     body-body contact, water dissolve), copied verbatim from
 *     js/sluice/340-jello.js. The game couplings (player rig,
 *     terrain activation, dev arena, sfx) are replaced in the
 *     OVERRIDES section after the copy: a later function
 *     declaration wins at hoist time, so the solver text itself
 *     stays untouched.
 *
 * Everything collides with ONE thing: an 8 px solidity grid.
 * tileAt() probes it for the slimes, fillTerrainSolid() packs
 * it for the water kernels, and the smoke obstacle mask is
 * rasterised from the same runs. Draw a line and all three
 * engines feel it.
 *
 * Assembled 2026-07-21 from the game source at v26.52.
 *
 * v3.7 transport contract: guest poses and every ring velocity are world
 * px and world px/s. liquid-wgpu.js alone converts them to grid-cell
 * displacement per fixed water substep, interpolates the pose for each
 * batched substep, caps travel before integration, and sweeps the resulting
 * particle path against terrain. Do not pre-convert these host values.
 *
 * v3.8 overlap contract: the eight selected slime bodies keep stable guest
 * slots while their wet-cell rankings fluctuate. Touching rings are one
 * collision union in liquid-wgpu.js, never a sequential list of solids.
 *
 * v3.9 flow contract: keep the fixed 1/120-second solver and every stability
 * guard, repair the shared engine's live damping/motion setters, remove the
 * demo host's extra per-step body drag, cut its grid viscosity, and relax
 * separated-droplet air drag.
 *
 * v3.10 controls: the particle proof-dot pass has a visible toggle, and the
 * water consistency slider moves from the old compounded-drag feel to the
 * v3.9 raw-motion tune without touching pressure, gravity, collision, or the
 * fixed-step stability contract.
 *
 * v3.11 visibility contract: the normal droplet pass reads actual rendered
 * field coverage, so fast sheets cannot fall between the surface and droplet
 * paths. A guarded orphan sweep also retires small isolated clusters that do
 * not rejoin water, instead of simulating them forever.
 *
 * v3.12 honest-footprint contract: dense water uses a compact field support
 * instead of wide per-particle halos, while thin water stays visible through
 * the coverage droplet pass. Both paths clip against collision terrain.
 *
 * v4.0 surface-carry contract: the pointer owns one continuous coordinate on
 * the visible boundary. It receives the full pointer displacement after every
 * solver substep, with no proxy or speed ceiling. The hidden solver may deform
 * the remaining body, but it never becomes the visible material. The generic
 * actor-intent seam drives later locomotion and pose changes without referring
 * to the body's internal discretization.
 *
 * v4.5 lively-rest contract: full simulation time, particle footprint, global
 * momentum, and airborne spray never change. The water control adjusts only a
 * smooth low-speed, low-shear neighbour filter. Shallow numerical dregs calm;
 * coherent slosh and deliberate impacts stay live in the same pool.
 * ============================================================ */
(function () {
  'use strict';

  var TOY_VERSION = 'v4.5';   // shown in the corner readout; bump with the
                              // ?v= stamp on this file's script tag so a
                              // stale cache is visible at a glance

  // ---- Environment ---------------------------------------------------
  var stage = document.getElementById('toy-stage');
  var viewport = document.getElementById('toy-viewport');
  var canvas = document.getElementById('toy-canvas');
  if (!stage || !viewport || !canvas) return;

  var isMobile = (('ontouchstart' in window) && Math.min(screen.width, screen.height) < 820) ||
                 /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  // ---- World box (fixed at boot; the viewport scales it responsively) --
  // World px == stage CSS px. Physics, drawing and every engine speak
  // world px; resizes after boot only rescale the stage transform.
  var availW = Math.max(320, Math.min(viewport.clientWidth || 960, 1120));
  var portrait = window.innerHeight > window.innerWidth * 1.15;
  var worldW = Math.round(availW);
  var worldH = portrait
    ? Math.round(Math.max(420, Math.min(window.innerHeight * 0.58, worldW * 1.30)))
    : Math.round(Math.max(400, Math.min(worldW * 0.60, window.innerHeight * 0.74)));

  stage.style.width = worldW + 'px';
  stage.style.height = worldH + 'px';
  canvas.width = Math.round(worldW * dpr);
  canvas.height = Math.round(worldH * dpr);
  var ctx = canvas.getContext('2d');

  var fitScale = 1;
  function fitStage() {
    var w = viewport.clientWidth || worldW;
    fitScale = Math.min(1, w / worldW);
    stage.style.transform = fitScale === 1 ? 'none' : 'scale(' + fitScale + ')';
    viewport.style.height = Math.round(worldH * fitScale) + 'px';
  }
  window.addEventListener('resize', fitStage);

  // ---- Game-compat globals -------------------------------------------
  // The engine copies below were written against the game's IIFE scope.
  // These are the names they reach for, pinned to the toy's fixed-camera
  // world. TILE is the collision-grid cell: 8 px (the game runs 32; every
  // consumer takes it as a runtime value, and 8 px makes drawn lines feel
  // like a marker instead of bricks).
  var TILE = 8;
  var COLS = Math.ceil(worldW / TILE);
  var TOTAL_ROWS = Math.ceil(worldH / TILE);
  var SKY_ROWS = 0;
  var GRAVITY = 600;                    // real px/s^2 (the game's world gravity)
  var cam = { x: 0, y: 0 };
  var worldScale = 1;
  var viewW = worldW, viewH = worldH;
  var screenW = worldW, screenH = worldH;
  var player = null;
  var gameOver = false, gameWon = false, devMode = false;
  var UI_NEW = true, shopState = 'closed';
  var PLAYER_W = 0, PLAYER_H = 0;
  var rocketIntensity = 0;
  function perfMark() {}
  function markTerrainCleared() {}
  function sfxPlay() {}
  function rocketExhaustDir() { return { x: 0, y: 1 }; }
  function playerLocalToWorld() { return { x: 0, y: 0 }; }

  // ---- Instrument state ------------------------------------------------
  var gravMul = 1;     // 0..2   — water + slime gravity, smoke lift
  var timeMul = 1;     // 0.05..1 — one slow-motion clock for all three engines
  var brushR = 16;     // px     — wall/erase/pour/puff radius, slime size seed
  var waterFeel = 0.55; // 0..1, calmer dregs to longer-lived slosh
  var debugParticles = true;

  /* ==== THE SHARED WALL GRID ============================================
   * One Uint8Array, one probe. tileAt(r,c) is the exact single choke point
   * the jello solver collides through (jelloWorldSolidAt calls it);
   * fillTerrainSolid packs the same bytes for the water kernels; the smoke
   * obstacle quads rasterise the same runs. The 1-cell border is permanent:
   * the box is a terrarium, nothing leaves it. ==== */
  var gridW = COLS, gridH = TOTAL_ROWS;
  var walls = new Uint8Array(gridW * gridH);
  var wallsVersion = 0;             // bumped on any edit (smoke + render caches key off it)
  var WALL_TILE = { type: 'stone', hp: 9 };

  function tileAt(r, c) {
    if (c < 0 || c >= gridW || r >= gridH) return WALL_TILE;   // sides + below: solid
    if (r < 0) return WALL_TILE;                               // above: solid (closed box)
    return walls[r * gridW + c] ? WALL_TILE : null;
  }

  function addBorder() {
    var r, c;
    for (c = 0; c < gridW; c++) { walls[c] = 1; walls[(gridH - 1) * gridW + c] = 1; }
    for (r = 0; r < gridH; r++) { walls[r * gridW] = 1; walls[r * gridW + gridW - 1] = 1; }
    wallsVersion++;
  }

  function isBorderCell(r, c) {
    return r === 0 || c === 0 || r === gridH - 1 || c === gridW - 1;
  }

  // Circle paint. Border cells never erase. Waking is part of painting:
  // settled water and sleeping slimes must feel the ground change under
  // them (the game routes this through its dig path; the toy does it here).
  function paintWalls(wx, wy, rad, solid) {
    var changed = false;
    var r0 = Math.max(0, Math.floor((wy - rad) / TILE));
    var r1 = Math.min(gridH - 1, Math.floor((wy + rad) / TILE));
    var c0 = Math.max(0, Math.floor((wx - rad) / TILE));
    var c1 = Math.min(gridW - 1, Math.floor((wx + rad) / TILE));
    var rr = rad + TILE * 0.35;
    for (var r = r0; r <= r1; r++) {
      var cy = (r + 0.5) * TILE;
      for (var c = c0; c <= c1; c++) {
        var cx = (c + 0.5) * TILE;
        var dx = cx - wx, dy = cy - wy;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (!solid && isBorderCell(r, c)) continue;
        var idx = r * gridW + c;
        var v = solid ? 1 : 0;
        if (walls[idx] !== v) { walls[idx] = v; changed = true; }
      }
    }
    if (changed) {
      wallsVersion++;
      wakeLiquidNear(wx, wy, rad + 96);
      wakeJelloNear(wx, wy, rad + 80);
    }
    return changed;
  }

  function paintWallsSeg(x0, y0, x1, y1, rad, solid) {
    var dx = x1 - x0, dy = y1 - y0;
    var d = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(d / (rad * 0.6)));
    for (var i = 0; i <= steps; i++) {
      paintWalls(x0 + dx * (i / steps), y0 + dy * (i / steps), rad, solid);
    }
  }

  function wakeJelloNear(wx, wy, rad) {
    if (typeof jelloBodies === 'undefined') return;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i];
      if (b.bboxR < wx - rad || b.bboxL > wx + rad ||
          b.bboxB < wy - rad || b.bboxT > wy + rad) continue;
      b.sleeping = false; b.sleepFrames = 0; b.frozen = false;
    }
  }

  /* ---- Wall rendering (cached offscreen layer) ------------------------
   * Chunky mineral cells in the site's stone tones, a light top edge where
   * a cell faces air, a darker seam below. Re-baked only when wallsVersion
   * moves. ---- */
  var wallsCanvas = document.createElement('canvas');
  wallsCanvas.width = canvas.width;
  wallsCanvas.height = canvas.height;
  var wallsCtx = wallsCanvas.getContext('2d');
  var wallsBakedVersion = -1;
  var WALL_SHADES = ['#454f46', '#414a42', '#48524a', '#3e4740'];
  var WALL_EDGE = '#5d6a5e';
  var WALL_SEAM = '#333b34';

  function cellHash(r, c) {
    var h = (r * 73856093) ^ (c * 19349663);
    return (h >>> 2) & 3;
  }

  function bakeWalls() {
    if (wallsBakedVersion === wallsVersion) return;
    wallsBakedVersion = wallsVersion;
    wallsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wallsCtx.clearRect(0, 0, worldW, worldH);
    for (var r = 0; r < gridH; r++) {
      var off = r * gridW;
      for (var c = 0; c < gridW; c++) {
        if (!walls[off + c]) continue;
        var x = c * TILE, y = r * TILE;
        wallsCtx.fillStyle = WALL_SHADES[cellHash(r, c)];
        wallsCtx.fillRect(x, y, TILE, TILE);
        if (r > 0 && !walls[off - gridW + c]) {           // air above: lit edge
          wallsCtx.fillStyle = WALL_EDGE;
          wallsCtx.fillRect(x, y, TILE, 1.5);
        }
        if (r < gridH - 1 && !walls[off + gridW + c]) {   // air below: seam
          wallsCtx.fillStyle = WALL_SEAM;
          wallsCtx.fillRect(x, y + TILE - 1.5, TILE, 1.5);
        }
      }
    }
  }

  /* ==== WATER HOST ======================================================
   * The exact host contract js/sluice/020-state.js hands LiquidWGPU.create:
   * persistent typed arrays (stable refs), a mutation-op stream the GPU
   * replays against its resident buffers, and per-frame hooks. The solver
   * itself lives in js/liquid-wgpu.js, untouched.
   *
   * Since the game's v25.44 honey fix its calm machinery ships parked at
   * zero (LIQUID_CALM_MAX = 0 in 020-state.js), so "production water feel"
   * is a one-time push of CALM 0 / GRID_VISC 0 / DAMPING 1 / MOTION 1
   * after the device is ready, not a per-frame state machine. ==== */
  var LIQUID_MAX_PARTICLES = isMobile ? 40000 : 100000;
  var LIQUID_DENSITY_REST = 4;              // mirrors the module's 1/PDELTA^2
  var LIQUID_OPS_MAX = 300000;

  var liquidType = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidVX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidVY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidG00 = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidG01 = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidG10 = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidG11 = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidDensity = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidAeration = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidOrigin = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidSleeping = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidFrozen = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidRestFrames = new Uint16Array(LIQUID_MAX_PARTICLES);
  var liquidOrphanDwell = new Uint8Array(LIQUID_MAX_PARTICLES);
  var LIQUID_ORPHAN_DWELL_TICKS = 8;  // 8 half-second sweeps = 4 s for fast spray
  var liquidOrphanTick = 0;

  var liquidCount = 0;
  var liquidMutationSeq = 0;
  var liquidOps = [];
  var liquidOpsOverflow = false;

  // Faithful port of addLiquidParticle from js/sluice/030-worldgen.js.
  function addLiquidParticle(type, x, y, vx, vy, origin) {
    if (liquidCount >= LIQUID_MAX_PARTICLES) return -1;
    var id = liquidCount++;
    liquidMutationSeq++;
    liquidType[id] = type === 'oil' ? 1 : 0;
    liquidOrigin[id] = origin || 0;
    liquidX[id] = x;
    liquidY[id] = y;
    liquidVX[id] = vx || 0;
    liquidVY[id] = vy || 0;
    liquidG00[id] = 0; liquidG01[id] = 0; liquidG10[id] = 0; liquidG11[id] = 0;
    liquidDensity[id] = LIQUID_DENSITY_REST;
    liquidAeration[id] = 0;
    liquidSleeping[id] = 0;
    liquidFrozen[id] = 0;
    liquidRestFrames[id] = 0;
    liquidOrphanDwell[id] = 0;
    if (liquidOps.length < LIQUID_OPS_MAX) {
      liquidOps.push(1, x, y, vx || 0, vy || 0, liquidType[id], liquidOrigin[id]);
    } else liquidOpsOverflow = true;
    return id;
  }

  function removeLiquidParticle(i) {
    var last = liquidCount - 1;
    if (i < 0 || i > last) return;
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
      liquidSleeping[i] = liquidSleeping[last];
      liquidFrozen[i] = liquidFrozen[last];
      liquidRestFrames[i] = liquidRestFrames[last];
      liquidOrphanDwell[i] = liquidOrphanDwell[last];
    }
    liquidMutationSeq++;
    liquidCount--;
  }

  /* Small isolated clusters should either merge back into visible water or
   * leave the simulation. Every 30 frames, use the async CPU mirror to count
   * support in the same 16 px neighbourhood as Sluice. Slow isolated residue
   * retires immediately; moving spray gets four seconds to land or rejoin.
   * Real streams and pools reset their dwell because they have ample support. */
  function retireLiquidOrphans() {
    liquidOrphanTick++;
    if (liquidOrphanTick < 30 || !liquidCount) return;
    liquidOrphanTick = 0;
    var buckets = new Map();
    var i, key;
    for (i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i]) continue;
      key = ((liquidX[i] / 16) | 0) * 100003 + ((liquidY[i] / 16) | 0);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    for (i = liquidCount - 1; i >= 0; i--) {
      if (liquidFrozen[i]) continue;
      var cx = (liquidX[i] / 16) | 0;
      var cy = (liquidY[i] / 16) | 0;
      var nearby = 0;
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          nearby += buckets.get((cx + ox) * 100003 + (cy + oy)) || 0;
        }
      }
      if (nearby >= 24) {
        liquidOrphanDwell[i] = 0;
        continue;
      }
      var dwell = liquidOrphanDwell[i] + 1;
      if (dwell > 250) dwell = 250;
      liquidOrphanDwell[i] = dwell;
      var vx = liquidVX[i], vy = liquidVY[i];
      if (vx * vx + vy * vy < 36 || dwell >= LIQUID_ORPHAN_DWELL_TICKS) {
        removeLiquidParticle(i);
      }
    }
  }

  // Waking is a real op (type 4) so the change reaches the GPU-resident rows.
  function wakeLiquidNear(wx, wy, rad) {
    var r2 = rad * rad, n = 0;
    for (var i = 0; i < liquidCount; i++) {
      var dx = liquidX[i] - wx, dy = liquidY[i] - wy;
      if (dx * dx + dy * dy > r2) continue;
      liquidSleeping[i] = 0; liquidFrozen[i] = 0; liquidRestFrames[i] = 0;
      if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(4, i, liquidType[i], liquidOrigin[i]);
      else liquidOpsOverflow = true;
      n++;
    }
    if (n) liquidMutationSeq++;
  }

  // ---- Water-cell map (the CPU mirror bucketed onto the wall grid) ----
  // One pass over the mirror positions per frame. Three consumers: the
  // slime buoyancy tick (local waterline per body), the smoke obstacle
  // (wet cells deflect plumes), and guest selection (the wettest slimes
  // get the moving-boundary slots). The mirror lags the GPU by up to ~20
  // frames, which none of these can see.
  var waterCellCount = new Uint16Array(gridW * gridH);
  var waterCellVX = new Float32Array(gridW * gridH);   // velocity SUMS; divide by count to average
  var waterCellVY = new Float32Array(gridW * gridH);
  var waterColSurf = new Float32Array(gridW);          // per-column free-surface Y (Infinity = dry column)
  var WATER_CELL_WET = 10;      // ~1/4 rest density for an 8px cell: real water, not spray
  var WATER_CELL_REST = 41;     // rest density per 8px cell (the sim's 655 per 32px tile)
  var waterCellsAny = false;

  function buildWaterCells() {
    waterCellsAny = false;
    waterCellCount.fill(0);
    waterCellVX.fill(0);
    waterCellVY.fill(0);
    if (waterState !== 'on' || liquidCount === 0) { waterColSurf.fill(Infinity); return; }
    for (var i = 0; i < liquidCount; i++) {
      var c = (liquidX[i] / TILE) | 0;
      var r = (liquidY[i] / TILE) | 0;
      if (c < 0 || c >= gridW || r < 0 || r >= gridH) continue;
      var idx = r * gridW + c;
      waterCellCount[idx]++;
      waterCellVX[idx] += liquidVX[i];
      waterCellVY[idx] += liquidVY[i];
    }
    // Free-surface height per column: the topmost wet cell with a wet cell
    // under it (a 2-run, so a stray splash droplet is not a surface). The
    // guest boundaries evacuate water from INSIDE a submerged slime, so
    // density is unusable for submergence there; the free surface is not,
    // because that hole is always below it.
    //
    // RATE-LIMITED: a plunging slime throws its own splash upward, and a
    // surface that chases the splash reads the dive too deep and the exit
    // too shallow — an energy pump (measured: bodies breached to the lid
    // with growing amplitude). Real pours raise a column ~3 px/s; splash
    // chase needs ~300. Capping surface motion at SURF_RATE px/s keeps
    // every legitimate fill and kills the feedback. A column changing
    // wet<->dry snaps instantly (fresh pours must engage at once).
    var surfStep = SURF_RATE * (1 / 60);   // build runs per frame; frame dt bounded by the sim clamp
    for (var sc = 0; sc < gridW; sc++) {
      var surf = Infinity;
      for (var sr = 0; sr < gridH - 1; sr++) {
        if (waterCellCount[sr * gridW + sc] >= WATER_CELL_WET &&
            waterCellCount[(sr + 1) * gridW + sc] >= WATER_CELL_WET * 0.6) {
          surf = sr * TILE;
          break;
        }
      }
      var prev = waterColSurf[sc];
      if (surf === Infinity || prev === Infinity) {
        waterColSurf[sc] = surf;
      } else {
        var dstep = surf - prev;
        if (dstep > surfStep) dstep = surfStep; else if (dstep < -surfStep) dstep = -surfStep;
        waterColSurf[sc] = prev + dstep;
      }
    }
    waterCellsAny = true;
  }

  // ---- Pokes and wakes the water feels --------------------------------
  // toyWakes ride the game's explosion channel (a bounded radial impulse
  // in the grid kernel). The poke pointer and the wettest live slimes ride
  // the guest channel (exact moving boundaries, up to 8).
  var toyWakes = [];        // {cx, cy, r, blastScale, t0}
  var pokeGuest = null;     // {x, y, hw, hh, pts}
  // Stable GPU boundary slots. Wet-cell counts fluctuate as the surface
  // rasterizer and soft-body ring breathe, so sorting the guest array every
  // frame made touching slimes exchange identities in GameParams. The GPU
  // then solved the same geometry in a different order and the trapped water
  // visibly filled, cleared, and snapped back. Keep selected bodies in their
  // existing slot; wetness only decides membership when more than eight are
  // eligible. Holes are preserved with inactive placeholders below.
  var liquidGuestSlots = new Array(8);

  function pushWake(cx, cy, r, blast) {
    toyWakes.push({ cx: cx, cy: cy, r: r, blastScale: blast, t0: performance.now() });
    wakeLiquidNear(cx, cy, r + 60);
  }

  function buildGuests() {
    // Slime silhouettes as moving fluid boundaries: the same registration
    // the game's bathhouse guests use (072-bath.js v26.05) — the ordered
    // boundary ring resampled to <= 20 verts, each carrying its Verlet
    // velocity, so poured water piles on a slime instead of passing through.
    // Eight slots since engine v26.09 (GS_MAX_GUESTS). The eight wettest
    // eligible bodies are selected, but a selected body's slot is stable.
    var order = [];
    if (typeof jelloBodies !== 'undefined' && jelloBodies.length) {
      order = jelloBodies.filter(function (b0) {
        return b0 && !b0._melting && b0.ringN >= 3 && b0.ring &&
          isFinite(b0.bboxL + b0.bboxR + b0.bboxT + b0.bboxB);
      }).sort(function (a, bb2) {
        return (bb2._wetCells || 0) - (a._wetCells || 0);
      });
      if (order.length > 8) order.length = 8;
    }
    // Clear bodies that left the wettest-eight set, then put new entrants
    // into real empty slots. Existing members never move just because their
    // wet-cell ranking changed.
    for (var si = 0; si < liquidGuestSlots.length; si++) {
      if (order.indexOf(liquidGuestSlots[si]) < 0) liquidGuestSlots[si] = null;
    }
    for (var oi = 0; oi < order.length; oi++) {
      if (liquidGuestSlots.indexOf(order[oi]) >= 0) continue;
      for (var sf = 0; sf < liquidGuestSlots.length; sf++) {
        if (!liquidGuestSlots[sf]) { liquidGuestSlots[sf] = order[oi]; break; }
      }
    }

    var pokeSlot = -1;
    if (pokeGuest) {
      // POKE is an ephemeral boundary. Give it a free slot without shifting
      // any slime; at full capacity it temporarily owns the last slot, which
      // matches the old seven-slimes-plus-pointer limit while held.
      for (var ps = 0; ps < liquidGuestSlots.length; ps++) {
        if (!liquidGuestSlots[ps]) { pokeSlot = ps; break; }
      }
      if (pokeSlot < 0) pokeSlot = liquidGuestSlots.length - 1;
    }

    var out = new Array(8);
    var any = false;
    for (var os = 0; os < out.length; os++) out[os] = { pts: null };
    if (pokeSlot >= 0) { out[pokeSlot] = pokeGuest; any = true; }
    if (order.length) {
      // Real velocity = (p - o) * TIMESCALE / H (the same live conversion
      // jelloWaterCoupleTick uses). The first draft used 1/H flat, which
      // DOUBLED every reported face velocity (TS = 0.5): harmless while
      // faces only pinned grid cells, but fatal once the v26.11 sweep
      // started handing particles the face velocity directly — a 300 px/s
      // bob tossed crown droplets at 600 and the fountain never ended.
      var gts = (typeof JELLO_TIMESCALE === 'number' && JELLO_TIMESCALE >= 0.02) ? JELLO_TIMESCALE : 0.5;
      var gH = (typeof jelloStepH === 'number' && jelloStepH > 0) ? jelloStepH : (1 / 240);
      var ih = gts / gH;
      for (var i = 0; i < liquidGuestSlots.length; i++) {
        var b = liquidGuestSlots[i];
        if (!b || i === pokeSlot) continue;
        var rn = b.ringN | 0;
        var take = rn < 20 ? rn : 20;
        var pts = new Array(take * 4);
        var vMax = 0, mvxSum = 0, mvySum = 0;
        for (var k = 0; k < take; k++) {
          var ri = b.ring[((k * rn) / take) | 0];
          var pvx = (b.px[ri] - b.ox[ri]) * ih;
          var pvy = (b.py[ri] - b.oy[ri]) * ih;
          // Match the water solver's vector speed cap before the boundary
          // reaches either the grid or particle sweep. The shared engine
          // repeats this centrally for every host, but keeping the toy's
          // source honest makes the dead-band below read the same velocity.
          var spd = Math.sqrt(pvx * pvx + pvy * pvy);
          if (spd > 600) {
            var psc = 600 / spd;
            pvx *= psc; pvy *= psc; spd = 600;
          }
          if (spd > vMax) vMax = spd;
          mvxSum += pvx; mvySum += pvy;
          pts[k * 4] = b.px[ri];
          pts[k * 4 + 1] = b.py[ri];
          pts[k * 4 + 2] = pvx;
          pts[k * 4 + 3] = pvy;
        }
        // DEAD-BAND: a resting slime must read as STATIC terrain, or the
        // water can never sleep against it. XPBD rest-jiggle leaks
        // 10-30 px/s of face-velocity noise; the grid kernel pins cells
        // to those faces, so the noise stirred the pool forever (the
        // observed endless shimmer + spray + relaunch loop). Below the
        // band the ring reports zero velocity; above it, true motion
        // fades in and sheds real ripples/crowns exactly as before.
        var vScale = (vMax - 25) / 50;
        if (vScale < 0) vScale = 0; else if (vScale > 1) vScale = 1;
        if (vScale < 1) {
          for (var kz = 0; kz < take; kz++) {
            pts[kz * 4 + 2] *= vScale;
            pts[kz * 4 + 3] *= vScale;
          }
        }
        // Half-extents clamp: the banya's 34 was sized for tub guests and
        // CUT the ring test off beyond 34 px on the toy's bigger slimes,
        // so water clipped straight through their outer rims. 64 covers
        // the largest disc (r 46 + render outset) with margin.
        var ghw = (b.bboxR - b.bboxL) / 2 + 3;
        var ghh = (b.bboxB - b.bboxT) / 2 + 3;
        out[i] = {
          x: (b.bboxL + b.bboxR) / 2, y: (b.bboxT + b.bboxB) / 2,
          hw: ghw < 8 ? 8 : (ghw > 64 ? 64 : ghw),
          hh: ghh < 8 ? 8 : (ghh > 64 ? 64 : ghh),
          mvx: mvxSum / take, mvy: mvySum / take,   // v26.10 lateral-eviction lanes
          pts: pts
        };
        any = true;
      }
    }
    return any ? out : null;
  }

  function getGameStateToy() {
    var ex = [];
    var now = performance.now();
    for (var i = toyWakes.length - 1; i >= 0; i--) {
      if (now - toyWakes[i].t0 > 150) toyWakes.splice(i, 1);
    }
    for (var j = 0; j < toyWakes.length && ex.length < 8; j++) ex.push(toyWakes[j]);
    if (typeof jelloSplashWakes !== 'undefined' && jelloSplashWakes.length) {
      for (var wi = 0; wi < jelloSplashWakes.length && ex.length < 8; wi++) {
        var wk = jelloSplashWakes[wi];
        if (now - wk.t0 > 220) continue;
        ex.push({ cx: wk.cx, cy: wk.cy, r: wk.r, blastScale: wk.blast });
      }
    }
    return {
      player: null,
      rocket: { active: false, intensity: 0, exDirX: 0, exDirY: 0, nozzles: null },
      explosions: ex,
      guests: buildGuests()
    };
  }

  // ---- Module boot ------------------------------------------------------
  var liquidWGPU = null;
  var waterState = 'booting';   // 'booting' | 'on' | 'off'

  function bootLiquid() {
    if (!(window.LiquidWGPU && navigator.gpu && window.isSecureContext)) {
      waterState = 'off';
      clearLiquid();
      onEnginesSettled();
      return;
    }
    liquidWGPU = window.LiquidWGPU.create({
      mainCanvas: canvas,
      liquid: {
        maxParticles: LIQUID_MAX_PARTICLES,
        getCount: function () { return liquidCount; },
        getMutationSeq: function () { return liquidMutationSeq; },
        takeOps: function () {
          if (liquidOpsOverflow) {
            liquidOpsOverflow = false;
            liquidOps.length = 0;
            return null;
          }
          return liquidOps;
        },
        arrays: {
          type: liquidType, x: liquidX, y: liquidY, vx: liquidVX, vy: liquidVY,
          g00: liquidG00, g01: liquidG01, g10: liquidG10, g11: liquidG11,
          density: liquidDensity, aeration: liquidAeration,
          origin: liquidOrigin, sleeping: liquidSleeping,
          frozen: liquidFrozen, restFrames: liquidRestFrames
        },
        world: { COLS: COLS, TILE: TILE, TOTAL_ROWS: TOTAL_ROWS },
        getView: function () {
          return {
            camX: 0, camY: 0,
            dpr: dpr, worldScale: 1,
            canvasW: canvas.width, canvasH: canvas.height,
            viewW: worldW, viewH: worldH,
            regionMinX: -TILE * 2, regionMinY: -TILE * 8,
            regionMaxX: worldW + TILE * 2, regionMaxY: worldH + TILE * 2
          };
        },
        fillTerrainSolid: function (originCol, originRow, w, h, out) {
          var k = 0;
          for (var r = 0; r < h; r++) {
            var gr = originRow + r;
            if (gr < 0) {                                    // above the box: solid lid
              for (var ca = 0; ca < w; ca++) out[k++] = 1;
              continue;
            }
            if (gr >= gridH) {                               // below: solid
              for (var cb = 0; cb < w; cb++) out[k++] = 1;
              continue;
            }
            var rowOff = gr * gridW;
            for (var c = 0; c < w; c++) {
              var gc = originCol + c;
              out[k++] = (gc < 0 || gc >= gridW) ? 1 : walls[rowOff + gc];
            }
          }
        },
        updateOilSuction: function () {},
        getGameState: getGameStateToy
      }
    });
    if (liquidWGPU && liquidWGPU.readyPromise) {
      liquidWGPU.readyPromise.then(function () {
        if (liquidWGPU.simActive) {
          waterState = 'on';
          if (liquidWGPU.setSimParam) {
            // v3.9/v3.10: DAMPING and WATER_MOTION_SCALE used to update legacy
            // scalars while the GPU read boot-frozen material-table values.
            // Its effective 0.992 * 0.97 keep-factor compounded at roughly
            // 186 substeps per wall second, retaining under 0.1% of carried
            // momentum after one second. The fixed setter lets this host use
            // the intended raw 1.0 / 1.0 transfer. v4.5 keeps bulk water raw
            // and adds only the local quiet-shear filter in applyWaterFeel;
            // the pressure limiter, density cap, anti-clump, CFL cap, and
            // swept collision continue to own stability.
            applyWaterFeel();
            liquidWGPU.setSimParam('AERATION_COEFF', 5);
            // Fresh CPU mirror for the slime coupling: the default cadence
            // (every 20 runFrames) is built for oil suction; the per-point
            // density/velocity sampling wants ~3-frame-old water.
            liquidWGPU.setSimParam('DBG_READBACK_EVERY', isMobile ? 4 : 2);
          }
          if (liquidWGPU.setRenderParam) {
            // The toy's water palette: the game default is a bright azure
            // tuned for cave dark; on the site's green this deeper lake
            // blue sits with the palette (A/B'd via headless shots).
            liquidWGPU.setRenderParam('WATER_R', 0.13);
            liquidWGPU.setRenderParam('WATER_G', 0.34);
            liquidWGPU.setRenderParam('WATER_B', 0.52);
            liquidWGPU.setRenderParam('WATER_FOAM_R', 0.66);
            liquidWGPU.setRenderParam('WATER_FOAM_G', 0.78);
            liquidWGPU.setRenderParam('WATER_FOAM_B', 0.82);
            liquidWGPU.setRenderParam('WATER_ALPHA', 0.86);
            // v3.12: keep a lone field peak below visibility and give dense
            // water only enough support to bridge about two rest spacings.
            // Thin sheets belong to the fixed-size droplet pass, not a wide
            // halo that makes ledges swell and terrain collision look false.
            liquidWGPU.setRenderParam('SURFACE_THRESH', 1.8);
            liquidWGPU.setRenderParam('SURFACE_RSCALE', 0.9);
            // Per-particle proof dots remain on by default. v3.10 exposes
            // the existing extra render pass as a visible toolbar toggle.
            applyParticleDebug();
          }
          applyGravity();
          applyTimescale();
        } else {
          waterState = 'off';
          clearLiquid();
        }
        onEnginesSettled();
      }).catch(function () { waterState = 'off'; clearLiquid(); onEnginesSettled(); });
    } else {
      waterState = 'off';
      onEnginesSettled();
    }
  }

  // ---- Per-frame update / draw (mirrors updateLiquidsGPU / drawLiquids) --
  var liquidGPULastSeq = -1;
  var liquidPendingDt = 0;
  var liquidSimSkipFrames = 0;
  var liquidIdleDrawFrames = 0;

  function updateLiquidToy(dt) {
    if (!liquidWGPU || !liquidWGPU.simActive) return;
    var seqNow = liquidMutationSeq;
    var mutated = seqNow !== liquidGPULastSeq;
    liquidGPULastSeq = seqNow;
    if (liquidCount === 0 && !mutated) { liquidPendingDt = 0; return; }
    var awake = liquidWGPU.awakeCount;
    var quiet = awake === 0 && !mutated && !toyWakes.length && !pokeGuest;
    if (quiet && liquidCount > 0) {
      liquidSimSkipFrames++;
      if (liquidSimSkipFrames < 45) {       // heartbeat: one real step ~0.75 s
        liquidPendingDt += dt;
        return;
      }
    }
    liquidSimSkipFrames = 0;
    var stepDt = dt;
    if (liquidPendingDt > 0) {
      stepDt += liquidPendingDt;
      if (stepDt > 0.05) stepDt = 0.05;
      liquidPendingDt = 0;
    }
    liquidWGPU.update(stepDt);
  }

  function drawLiquidToy() {
    if (!liquidWGPU || !liquidWGPU.renderActive) return;
    if (liquidCount > 0) {
      liquidWGPU.draw();
      liquidIdleDrawFrames = 10;
    } else if (liquidIdleDrawFrames > 0) {
      liquidWGPU.draw();
      liquidIdleDrawFrames--;
    }
  }

  // ---- Spawning ---------------------------------------------------------
  function spawnWaterJet(wx, wy, rad, vx, vy, n) {
    if (waterState === 'off') return;
    for (var i = 0; i < n; i++) {
      if (liquidCount >= LIQUID_MAX_PARTICLES - 8) return;
      var a = Math.random() * 6.2831853;
      var rr = Math.sqrt(Math.random()) * rad;
      var px = wx + Math.cos(a) * rr;
      var py = wy + Math.sin(a) * rr;
      if (tileAt(Math.floor(py / TILE), Math.floor(px / TILE)) !== null) continue;
      addLiquidParticle('water', px, py,
        (vx || 0) + (Math.random() - 0.5) * 26,
        (vy || 0) + (Math.random() - 0.5) * 26, 0);
    }
  }

  // Rest-spacing block fill (1.25 px pitch = the sim's rest density), used
  // by scene pools so they arrive nearly settled instead of as a dropped slab.
  function fillPoolRect(x0, y0, x1, y1) {
    if (waterState === 'off') return;
    var pitch = 1.25;
    for (var y = y0 + pitch * 0.5; y < y1; y += pitch) {
      var jr = (Math.random() - 0.5) * 0.22;
      for (var x = x0 + pitch * 0.5; x < x1; x += pitch) {
        if (liquidCount >= LIQUID_MAX_PARTICLES - 8) return;
        if (tileAt(Math.floor(y / TILE), Math.floor(x / TILE)) !== null) continue;
        addLiquidParticle('water', x + jr, y + (Math.random() - 0.5) * 0.22, 0, 0, 0);
      }
    }
  }

  function clearLiquid() {
    liquidCount = 0;
    liquidOrphanDwell.fill(0);
    liquidOrphanTick = 0;
    liquidMutationSeq++;
    liquidOps.length = 0;
    liquidOpsOverflow = true;    // force one full GPU re-upload (of nothing)
    toyWakes.length = 0;
  }

  /* ==== SMOKE ENGINE ====================================================
   * Copied VERBATIM from js/sluice/190-smoke-webgl.js (the SmokeFluid
   * closure, lines 3-899 at game v26.07). A self-contained WebGL fluid
   * sim: curl / vorticity / divergence / pressure / gradient-subtract /
   * advection passes, splat injection, an rgba obstacle mask, and a
   * display pass onto its own canvas. Do not edit this block; the toy's
   * driver lives right after it.
   *
   * Physics changes go in the GAME source first, then re-sync:
   *   node tools/toy-engine-sync.mjs --write
   * The pre-commit hook runs --check and refuses drift. ==== */
  /* >>> ENGINE SYNC: BEGIN smoke-engine (verbatim js/sluice/190-smoke-webgl.js closure) <<< */
  var SmokeFluid = (function () {
    'use strict';
  
    // --- module state (singleton) -----------------------------------
    var canvas = null;
    var gl = null;
    var ext = null;
    var ready = false;
  
    var config = {
      SIM_RESOLUTION: 256,
      DYE_RESOLUTION: 1024,
      DENSITY_DISSIPATION: 1.6,
      VELOCITY_DISSIPATION: 0.4,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 25,
      CURL: 26,
      SPLAT_RADIUS: 0.22,
      SHADING: true,
    };
  
    var dye, velocity, divergence, curl, pressure;
    var copyProgram, clearProgram, splatProgram, advectionProgram,
        divergenceProgram, curlProgram, vorticityProgram, pressureProgram,
        gradientSubtractProgram, scrollProgram;
    var displayMaterial;
    var blit;
    var blitQuadVBO = null;  // v10.88 — exposed so other helpers can restore the buffer state
    var obstacleTexture = null;
    var obstacleSrcCanvas = null;
  
    // --- WebGL context / format negotiation -------------------------
    function getWebGLContext (cnv) {
      var params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false };
      var glCtx = cnv.getContext('webgl2', params);
      var isWebGL2 = !!glCtx;
      if (!isWebGL2) glCtx = cnv.getContext('webgl', params) || cnv.getContext('experimental-webgl', params);
      if (!glCtx) return null;
  
      var halfFloat;
      var supportLinearFiltering;
      if (isWebGL2) {
        glCtx.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = glCtx.getExtension('OES_texture_float_linear');
      } else {
        halfFloat = glCtx.getExtension('OES_texture_half_float');
        supportLinearFiltering = glCtx.getExtension('OES_texture_half_float_linear');
      }
      glCtx.clearColor(0.0, 0.0, 0.0, 0.0);
  
      var halfFloatTexType = isWebGL2 ? glCtx.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
      var formatRGBA, formatRG, formatR;
      if (isWebGL2) {
        formatRGBA = getSupportedFormat(glCtx, glCtx.RGBA16F, glCtx.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(glCtx, glCtx.RG16F,   glCtx.RG,   halfFloatTexType);
        formatR    = getSupportedFormat(glCtx, glCtx.R16F,    glCtx.RED,  halfFloatTexType);
      } else {
        formatRGBA = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
        formatR    = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
      }
      return { gl: glCtx, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering, isWebGL2 } };
    }
  
    function getSupportedFormat (glCtx, internalFormat, format, type) {
      if (!supportRenderTextureFormat(glCtx, internalFormat, format, type)) {
        switch (internalFormat) {
          case glCtx.R16F:  return getSupportedFormat(glCtx, glCtx.RG16F,   glCtx.RG,   type);
          case glCtx.RG16F: return getSupportedFormat(glCtx, glCtx.RGBA16F, glCtx.RGBA, type);
          default: return null;
        }
      }
      return { internalFormat, format };
    }
  
    function supportRenderTextureFormat (glCtx, internalFormat, format, type) {
      var texture = glCtx.createTexture();
      glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.NEAREST);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.NEAREST);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
      glCtx.texImage2D(glCtx.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      var fbo = glCtx.createFramebuffer();
      glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, fbo);
      glCtx.framebufferTexture2D(glCtx.FRAMEBUFFER, glCtx.COLOR_ATTACHMENT0, glCtx.TEXTURE_2D, texture, 0);
      return glCtx.checkFramebufferStatus(glCtx.FRAMEBUFFER) === glCtx.FRAMEBUFFER_COMPLETE;
    }
  
    // --- Shader / Program helpers -----------------------------------
    function compileShader (type, source, keywords) {
      source = addKeywords(source, keywords);
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.error('shader compile failed:', gl.getShaderInfoLog(shader));
      return shader;
    }
  
    function addKeywords (source, keywords) {
      if (!keywords) return source;
      var s = '';
      keywords.forEach(function (k) { s += '#define ' + k + '\n'; });
      return s + source;
    }
  
    function createProgram (vertexShader, fragmentShader) {
      var program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.error('program link failed:', gl.getProgramInfoLog(program));
      return program;
    }
  
    function getUniforms (program) {
      var uniforms = [];
      var n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) {
        var name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return uniforms;
    }
  
    function Program (vs, fs) {
      this.program = createProgram(vs, fs);
      this.uniforms = getUniforms(this.program);
    }
    Program.prototype.bind = function () { gl.useProgram(this.program); };
  
    function Material (vs, fsSource) {
      this.vertexShader = vs;
      this.fragmentShaderSource = fsSource;
      this.programs = {};
      this.activeProgram = null;
      this.uniforms = [];
    }
    Material.prototype.setKeywords = function (keywords) {
      var key = keywords.join(',');
      var p = this.programs[key];
      if (!p) {
        var fs = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
        p = createProgram(this.vertexShader, fs);
        this.programs[key] = p;
      }
      if (p === this.activeProgram) return;
      this.uniforms = getUniforms(p);
      this.activeProgram = p;
    };
    Material.prototype.bind = function () { gl.useProgram(this.activeProgram); };
  
    // --- Shader sources (verbatim from Pavel) -----------------------
    var BASE_VS = '\n' +
      'precision highp float;\n' +
      'attribute vec2 aPosition;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform vec2 texelSize;\n' +
      'void main () {\n' +
      '  vUv = aPosition * 0.5 + 0.5;\n' +
      '  vL = vUv - vec2(texelSize.x, 0.0);\n' +
      '  vR = vUv + vec2(texelSize.x, 0.0);\n' +
      '  vT = vUv + vec2(0.0, texelSize.y);\n' +
      '  vB = vUv - vec2(0.0, texelSize.y);\n' +
      '  gl_Position = vec4(aPosition, 0.0, 1.0);\n' +
      '}\n';
  
    var COPY_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'void main () { gl_FragColor = texture2D(uTexture, vUv); }\n';
  
    var CLEAR_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform float value;\n' +
      'void main () { gl_FragColor = value * texture2D(uTexture, vUv); }\n';
  
    var SPLAT_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uTarget;\n' +
      'uniform float aspectRatio;\n' +
      'uniform vec3 color;\n' +
      'uniform vec2 point;\n' +
      'uniform float radius;\n' +
      'void main () {\n' +
      '  vec2 p = vUv - point.xy;\n' +
      '  p.x *= aspectRatio;\n' +
      '  vec3 splat = exp(-dot(p, p) / radius) * color;\n' +
      '  vec3 base = texture2D(uTarget, vUv).xyz;\n' +
      '  gl_FragColor = vec4(base + splat, 1.0);\n' +
      '}\n';
  
    var ADVECTION_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uSource;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform vec2 texelSize;\n' +
      'uniform vec2 dyeTexelSize;\n' +
      'uniform float dt;\n' +
      'uniform float dissipation;\n' +
      'uniform float useObstacle;\n' +
      'uniform float u_wind_x;\n' +
      'uniform float u_wind_above_y;\n' +
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {\n' +
      '  vec2 st = uv / tsize - 0.5;\n' +
      '  vec2 iuv = floor(st);\n' +
      '  vec2 fuv = fract(st);\n' +
      '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);\n' +
      '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);\n' +
      '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);\n' +
      '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);\n' +
      '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);\n' +
      '}\n' +
      'void main () {\n' +
      '  if (useObstacle > 0.5 && texture2D(uObstacle, vUv).a > 0.5) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float windDrift = (vUv.y >= u_wind_above_y) ? dt * u_wind_x : 0.0;\n' +
      '#ifdef MANUAL_FILTERING\n' +
      '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize - vec2(windDrift, 0.0);\n' +
      '  vec4 result = bilerp(uSource, coord, dyeTexelSize);\n' +
      '#else\n' +
      '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize - vec2(windDrift, 0.0);\n' +
      '  vec4 result = texture2D(uSource, coord);\n' +
      '#endif\n' +
      '  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float decay = 1.0 + dissipation * dt;\n' +
      '  gl_FragColor = result / decay;\n' +
      '}\n';
  
    var DIVERGENCE_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '  float L = texture2D(uVelocity, vL).x;\n' +
      '  float R = texture2D(uVelocity, vR).x;\n' +
      '  float T = texture2D(uVelocity, vT).y;\n' +
      '  float B = texture2D(uVelocity, vB).y;\n' +
      '  vec2 C = texture2D(uVelocity, vUv).xy;\n' +
      '  if (vL.x < 0.0) { L = -C.x; }\n' +
      '  if (vR.x > 1.0) { R = -C.x; }\n' +
      '  if (vT.y > 1.0) { T = -C.y; }\n' +
      '  if (vB.y < 0.0) { B = -C.y; }\n' +
      '  float div = 0.5 * (R - L + T - B);\n' +
      '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var CURL_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '  float L = texture2D(uVelocity, vL).y;\n' +
      '  float R = texture2D(uVelocity, vR).y;\n' +
      '  float T = texture2D(uVelocity, vT).x;\n' +
      '  float B = texture2D(uVelocity, vB).x;\n' +
      '  float vorticity = R - L - T + B;\n' +
      '  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var VORTICITY_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uCurl;\n' +
      'uniform float curl;\n' +
      'uniform float dt;\n' +
      'void main () {\n' +
      '  float L = texture2D(uCurl, vL).x;\n' +
      '  float R = texture2D(uCurl, vR).x;\n' +
      '  float T = texture2D(uCurl, vT).x;\n' +
      '  float B = texture2D(uCurl, vB).x;\n' +
      '  float C = texture2D(uCurl, vUv).x;\n' +
      '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));\n' +
      '  force /= length(force) + 0.0001;\n' +
      '  force *= curl * C;\n' +
      '  force.y *= -1.0;\n' +
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '  velocity += force * dt;\n' +
      '  velocity = min(max(velocity, -1000.0), 1000.0);\n' +
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}\n';
  
    var PRESSURE_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uDivergence;\n' +
      'void main () {\n' +
      '  float L = texture2D(uPressure, vL).x;\n' +
      '  float R = texture2D(uPressure, vR).x;\n' +
      '  float T = texture2D(uPressure, vT).x;\n' +
      '  float B = texture2D(uPressure, vB).x;\n' +
      '  float C = texture2D(uPressure, vUv).x;\n' +
      '  float divergence = texture2D(uDivergence, vUv).x;\n' +
      '  float pressure = (L + R + B + T - divergence) * 0.25;\n' +
      '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var GRADIENT_SUBTRACT_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform float useObstacle;\n' +
      'void main () {\n' +
      '  if (useObstacle > 0.5 && texture2D(uObstacle, vUv).a > 0.5) {\n' +
      '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float L = texture2D(uPressure, vL).x;\n' +
      '  float R = texture2D(uPressure, vR).x;\n' +
      '  float T = texture2D(uPressure, vT).x;\n' +
      '  float B = texture2D(uPressure, vB).x;\n' +
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '  velocity.xy -= vec2(R - L, T - B);\n' +
      '  velocity = min(max(velocity, -1000.0), 1000.0);\n' +
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}\n';
  
    // Display shader: render dye as RGBA with optional shading, then
    // multiply by an obstacle mask (transparent inside obstacles).
    var SCROLL_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform vec2 offset;\n' +
      'void main () {\n' +
      '  vec2 uv = vUv + offset;\n' +
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '  } else {\n' +
      '    gl_FragColor = texture2D(uTexture, uv);\n' +
      '  }\n' +
      '}\n';
  
    var DISPLAY_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform vec2 texelSize;\n' +
      'uniform float useObstacle;\n' +
      'void main () {\n' +
      '  vec3 cc = texture2D(uTexture, vUv).rgb;\n' +
      '  vec3 lc = texture2D(uTexture, vL).rgb;\n' +
      '  vec3 rc = texture2D(uTexture, vR).rgb;\n' +
      '  vec3 tc = texture2D(uTexture, vT).rgb;\n' +
      '  vec3 bc = texture2D(uTexture, vB).rgb;\n' +
      '  vec3 c = cc * 0.56 + (lc + rc + tc + bc) * 0.11;\n' +
      '#ifdef SHADING\n' +
      '  float dx = length(rc) - length(lc);\n' +
      '  float dy = length(tc) - length(bc);\n' +
      '  vec3 n = normalize(vec3(dx, dy, length(texelSize)));\n' +
      '  vec3 l = vec3(0.0, 0.0, 1.0);\n' +
      '  float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);\n' +
      '  c *= diffuse;\n' +
      '#endif\n' +
      '  float obstacle = useObstacle > 0.5 ? texture2D(uObstacle, vUv).a : 0.0;\n' +
      '  c *= 1.0 - smoothstep(0.35, 0.85, obstacle);\n' +
      '  float a = max(c.r, max(c.g, c.b));\n' +
      '  gl_FragColor = vec4(c, a);\n' +
      '}\n';
  
    // --- FBO helpers ------------------------------------------------
    function createFBO (w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture: texture,
        fbo: fbo,
        width: w,
        height: h,
        texelSizeX: 1.0 / w,
        texelSizeY: 1.0 / h,
        attach: function (id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }
  
    function createDoubleFBO (w, h, internalFormat, format, type, param) {
      var fbo1 = createFBO(w, h, internalFormat, format, type, param);
      var fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () { return fbo1; },
        set read (v) { fbo1 = v; },
        get write () { return fbo2; },
        set write (v) { fbo2 = v; },
        swap: function () { var t = fbo1; fbo1 = fbo2; fbo2 = t; }
      };
    }
  
    function getResolution (resolution) {
      var aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
      var min = Math.round(resolution);
      var max = Math.round(resolution * aspectRatio);
      if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
      return { width: min, height: max };
    }
  
    function initFramebuffers () {
      var simRes = getResolution(config.SIM_RESOLUTION);
      var dyeRes = getResolution(config.DYE_RESOLUTION);
      var texType = ext.halfFloatTexType;
      var rgba = ext.formatRGBA;
      var rg   = ext.formatRG;
      var r    = ext.formatR;
      var filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);
      dye        = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      velocity   = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat,   rg.format,   texType, filtering);
      divergence = createFBO      (simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
      curl       = createFBO      (simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
      pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
    }
  
    // --- Obstacle texture (alpha mask uploaded each frame) ----------
    function ensureObstacleTexture () {
      if (obstacleTexture) return;
      obstacleTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      // The solver still thresholds alpha for collision, but a filtered
      // mask keeps the 8 px cells from appearing as square cutouts.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // 1x1 transparent default — no obstacles until setObstacleAlpha runs.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    }

    // v10.87 — WebGL-native obstacle painter. Replaces the
    // canvas + texImage2D upload path that was costing 5ms/frame on
    // mobile (cross-context sync barrier). JS builds a Float32Array
    // of triangle verts in NDC and we draw them straight into the
    // obstacle texture via a framebuffer. One drawArrays, zero
    // cross-context blit, ~0ms total.
    var obstacleFB = null;
    var obstacleQuadProgram = null;
    var obstacleQuadVBO = null;
    var obstacleQuadAttrLoc = -1;
    var OBS_QUAD_VS = [
      'precision highp float;',
      'attribute vec2 aQuadPos;',
      'void main(){ gl_Position = vec4(aQuadPos, 0.0, 1.0); }'
    ].join('\n');
    var OBS_QUAD_FS = [
      'precision highp float;',
      'void main(){ gl_FragColor = vec4(1.0); }'  // alpha=1 = solid obstacle
    ].join('\n');

    function ensureObstacleFB (w, h) {
      ensureObstacleTexture();
      if (!obstacleFB || obstacleFB.w !== w || obstacleFB.h !== h) {
        gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        if (!obstacleFB) {
          obstacleFB = { fbo: gl.createFramebuffer(), w: 0, h: 0 };
        }
        obstacleFB.w = w; obstacleFB.h = h;
        gl.bindFramebuffer(gl.FRAMEBUFFER, obstacleFB.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, obstacleTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      if (!obstacleQuadProgram) {
        obstacleQuadProgram = createProgram(
          compileShader(gl.VERTEX_SHADER, OBS_QUAD_VS),
          compileShader(gl.FRAGMENT_SHADER, OBS_QUAD_FS)
        );
        obstacleQuadAttrLoc = gl.getAttribLocation(obstacleQuadProgram, 'aQuadPos');
      }
      if (!obstacleQuadVBO) obstacleQuadVBO = gl.createBuffer();
    }

    function paintObstacleQuads (verts, vertCount, w, h) {
      if (!ready) return;
      ensureObstacleFB(w, h);
      obstacleSrcCanvas = obstacleFB;  // truthy = obstacle enabled
      gl.bindFramebuffer(gl.FRAMEBUFFER, obstacleFB.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (vertCount > 0) {
        gl.disable(gl.BLEND);
        gl.useProgram(obstacleQuadProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, obstacleQuadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(obstacleQuadAttrLoc);
        gl.vertexAttribPointer(obstacleQuadAttrLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, vertCount);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // v10.88 — CRITICAL: restore the fullscreen-quad buffer + attrib
      // 0 pointer that blit() set up once at init and assumed would
      // stay bound. Without this every subsequent step()/displayPass()
      // draws from our obstacle vertex data, killing all smoke.
      if (blitQuadVBO) {
        gl.bindBuffer(gl.ARRAY_BUFFER, blitQuadVBO);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
      }
    }
  
    // Bind the obstacle to a given texture unit. `obstacle.attach`-style
    // shim to match the FBO contract used in shader uniform setters.
    function attachObstacle (id) {
      ensureObstacleTexture();
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      return id;
    }
  
    // --- public API -------------------------------------------------
    function init (cnv, options) {
      if (ready) return true;
      canvas = cnv;
      if (options) {
        for (var k in options) if (k in config) config[k] = options[k];
      }
      var ctx = getWebGLContext(canvas);
      if (!ctx || !ctx.ext.formatRGBA) {
        console.warn('SmokeFluid: WebGL context unavailable');
        return false;
      }
      gl = ctx.gl;
      ext = ctx.ext;
  
      // Lower DYE_RESOLUTION on devices without linear filtering on
      // float textures — same heuristic Pavel used.
      if (!ext.supportLinearFiltering) {
        config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);
      }
  
      var baseVS = compileShader(gl.VERTEX_SHADER, BASE_VS);
      var advectionFS = compileShader(gl.FRAGMENT_SHADER, ADVECTION_FS, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']);
  
      scrollProgram           = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, SCROLL_FS));
      copyProgram             = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, COPY_FS));
      clearProgram            = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, CLEAR_FS));
      splatProgram            = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, SPLAT_FS));
      advectionProgram        = new Program(baseVS, advectionFS);
      divergenceProgram       = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, DIVERGENCE_FS));
      curlProgram             = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, CURL_FS));
      vorticityProgram        = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, VORTICITY_FS));
      pressureProgram         = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, PRESSURE_FS));
      gradientSubtractProgram = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, GRADIENT_SUBTRACT_FS));
      displayMaterial         = new Material(baseVS, DISPLAY_FS);
      var keys = [];
      if (config.SHADING) keys.push('SHADING');
      displayMaterial.setKeywords(keys);
  
      // Fullscreen quad VBO + index buffer.
      blit = (function () {
        // v10.88 — stash the fullscreen-quad VBO so paintObstacleQuads
        // (and any future helpers) can restore it after binding their
        // own buffer. Pre-v10.88 the init-once setup got silently
        // clobbered the moment paintObstacleQuads bound a different
        // ARRAY_BUFFER, killing every subsequent blit on mobile.
        blitQuadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, blitQuadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        return function (target, clear) {
          if (target == null) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          } else {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
          }
          if (clear) {
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        };
      })();
  
      initFramebuffers();
      ready = true;
      return true;
    }
  
    function isReady () { return ready; }
  
    function clear () {
      if (!ready) return;
      // Force-zero all fields by running the clear shader with value 0.
      gl.disable(gl.BLEND);
      clearProgram.bind();
      gl.uniform1f(clearProgram.uniforms.value, 0.0);
      gl.uniform1i(clearProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write); dye.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write); dye.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write); velocity.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write); velocity.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      blit(pressure.write); pressure.swap();
    }
  
    function step (dt) {
      if (!ready) return;
      if (dt <= 0) return;
      var useObstacle = obstacleSrcCanvas ? 1.0 : 0.0;
      var pressureDecay = config.PRESSURE;
      if (pressureDecay < 0) pressureDecay = 0;
      else if (pressureDecay > 0.99) pressureDecay = 0.99;
  
      gl.disable(gl.BLEND);
  
      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);
  
      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();
  
      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);
  
      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, pressureDecay);
      blit(pressure.write);
      pressure.swap();
  
      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
      for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }
  
      gradientSubtractProgram.bind();
      gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      gl.uniform1i(gradientSubtractProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(gradientSubtractProgram.uniforms.useObstacle, useObstacle);
      blit(velocity.write);
      velocity.swap();
  
      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var velId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velId);
      gl.uniform1i(advectionProgram.uniforms.uSource, velId);
      gl.uniform1i(advectionProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(advectionProgram.uniforms.useObstacle, useObstacle);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      // No wind on velocity pass — keeps the pressure solve clean.
      gl.uniform1f(advectionProgram.uniforms.u_wind_x, 0.0);
      gl.uniform1f(advectionProgram.uniforms.u_wind_above_y, 0.0);
      blit(velocity.write);
      velocity.swap();

      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1i(advectionProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(advectionProgram.uniforms.useObstacle, useObstacle);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      // Wind drifts dye above the surface only. u_wind_x is in UV/sec units.
      // u_wind_above_y is the UV Y threshold (uvY = 1 - syN, so above-surface
      // = large uvY values near 1.0). Passed in from the game each step() call.
      gl.uniform1f(advectionProgram.uniforms.u_wind_x, config.wind_x || 0.0);
      gl.uniform1f(advectionProgram.uniforms.u_wind_above_y, config.wind_above_y != null ? config.wind_above_y : 0.0);
      blit(dye.write);
      dye.swap();
    }
  
    // Inject velocity without copying the dye field through a second pass.
    // Falling water uses this to entrain the air around it.
    function splatVelocity (uvX, uvY, dx, dy, splatRadius) {
      if (!ready) return;
      var rad = splatRadius != null ? splatRadius : config.SPLAT_RADIUS;
      var aspect = canvas.width / canvas.height;
      var radius = correctRadius(rad / 100.0, aspect);
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, aspect);
      gl.uniform2f(splatProgram.uniforms.point, uvX, uvY);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
      gl.uniform1f(splatProgram.uniforms.radius, radius);
      blit(velocity.write);
      velocity.swap();
    }

    // Inject density (color) and velocity at uvX,uvY in [0,1].
    function splat (uvX, uvY, dx, dy, color, splatRadius) {
      if (!ready) return;
      splatVelocity(uvX, uvY, dx, dy, splatRadius);
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(dye.write);
      dye.swap();
    }
  
    function correctRadius (r, aspect) {
      if (aspect > 1) r *= aspect;
      return r;
    }
  
    // Upload alpha channel of `srcCanvas` as the obstacle mask. The
    // canvas should be at the same effective resolution as the dye field
    // — use a small offscreen canvas mirroring the visible viewport. The
    // smoke shaders treat alpha > 0.5 as solid.
    function setObstacleAlpha (srcCanvas) {
      if (!ready) return;
      obstacleSrcCanvas = srcCanvas || null;
      if (!srcCanvas) return;
      ensureObstacleTexture();
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  
    function clearObstacle () {
      obstacleSrcCanvas = null;
    }
  
    // Shift the dye + velocity fields so the simulation stays anchored
    // in world space when the camera pans. Caller passes camera delta in
    // simulation-domain fractional units. The game convention has +y down,
    // while the dye/velocity textures use Y-up UVs (uvY = 1 - syN), so we
    // negate the Y component when feeding the shader.
    function scroll (dxCamFrac, dyCamFrac) {
      if (!ready) return;
      if (!dxCamFrac && !dyCamFrac) return;
      if (Math.abs(dxCamFrac) > 1.5 || Math.abs(dyCamFrac) > 1.5) return; // teleport — let it flash clear
      var ox = dxCamFrac;
      var oy = -dyCamFrac;
      gl.disable(gl.BLEND);
      scrollProgram.bind();
      gl.uniform2f(scrollProgram.uniforms.offset, ox, oy);
      gl.uniform1i(scrollProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write);
      dye.swap();
      gl.uniform1i(scrollProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write);
      velocity.swap();
    }
  
    // Display pass — render dye to the WebGL canvas. Split out from
    // render() so the caller can time it separately from the cross-
    // context drawImage blit. v10.81.
    function displayPass () {
      if (!ready) return;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      displayMaterial.bind();
      if (displayMaterial.uniforms.texelSize)
        gl.uniform2f(displayMaterial.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
      if (displayMaterial.uniforms.uObstacle != null) {
        gl.uniform1i(displayMaterial.uniforms.uObstacle, attachObstacle(1));
        gl.uniform1f(displayMaterial.uniforms.useObstacle, obstacleSrcCanvas ? 1.0 : 0.0);
      }
      blit(null);
      gl.disable(gl.BLEND);
    }

    function getCanvas () { return canvas; }

    // Composite the GL canvas into a 2D context. Caller passes the
    // destination rect in the 2D ctx's current transform space.
    function render (ctx2d, dx, dy, dw, dh, sx, sy, sw, sh) {
      if (!ready) return;
      displayPass();
      // Now blit the GL canvas into the 2D context.
      if (ctx2d) {
        if (sx != null && sy != null && sw != null && sh != null) {
          ctx2d.drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
          ctx2d.drawImage(canvas, dx, dy, dw, dh);
        }
      }
    }
  
    function resize (w, h) {
      if (!ready) return;
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      initFramebuffers();
    }
  
    // expose
    return {
      init: init,
      step: step,
      splat: splat,
      splatVelocity: splatVelocity,
      clear: clear,
      scroll: scroll,
      render: render,
      displayPass: displayPass,    // v10.81 — for split timing
      getCanvas: getCanvas,        // v10.81 — for direct drawImage with own timing
      resize: resize,
      setObstacleAlpha: setObstacleAlpha,
      paintObstacleQuads: paintObstacleQuads,  // v10.87 — WebGL-native obstacle paint
      clearObstacle: clearObstacle,
      isReady: isReady,
      config: config,
    };
  })();
  /* >>> ENGINE SYNC: END smoke-engine <<< */

  /* ==== SMOKE DRIVER (toy host) =========================================
   * Replaces the game's smokeFluid* driver: fixed domain (the whole box,
   * no world-lock scroll), obstacles as NDC quads rasterised straight
   * from the wall grid's horizontal runs plus a triangle fan per slime
   * ring, and an idle gate so a dissipated field costs nothing. ==== */
  var smokeCanvas = null;
  var smokeActive = false;
  var smokeAwakeT = 0;
  var smokeWasAwake = false;
  var smokeObW = isMobile ? 384 : 768;
  var smokeObH = 0;
  var smokeQuadVerts = null;
  var smokePaintedVersion = -1;
  var smokePaintedJello = false;
  var SMOKE_IDLE_HOLD = 15;
  var SMOKE_COL = { r: 0.20, g: 0.185, b: 0.165 };   // warm gray, light enough to read on the dark box
  var SMOKE_WATER_FLOW_MIN_VY = 55;
  // Keep the waterfall legible without pinning the whole plume to it.
  var SMOKE_WATER_FLOW_FORCE = 0.16;
  // The falling column entrains a wider sleeve of surrounding air.
  var SMOKE_WATER_FLOW_RADIUS = 0.085;
  var smokeWaterFlowTick = 0;
  var smokeWaterFlowCandidates = [];
  var smokeWaterFlowSelected = [];
  var smokeWaterFlowNext = [];
  var smokeWaterFlowBinsW = Math.ceil(gridW / 2);
  var smokeWaterFlowBinsH = Math.ceil(gridH / 2);
  var smokeWaterFlowCount = new Uint16Array(smokeWaterFlowBinsW * smokeWaterFlowBinsH);
  var smokeWaterFlowVX = new Float32Array(smokeWaterFlowCount.length);
  var smokeWaterFlowVY = new Float32Array(smokeWaterFlowCount.length);
  var smokeWaterFlowSplats = 0;

  function bootSmoke() {
    if (typeof WebGLRenderingContext === 'undefined') return;
    smokeCanvas = document.createElement('canvas');
    var pxScale = isMobile ? 0.7 : 0.6;
    smokeCanvas.width = Math.max(64, Math.round(worldW * pxScale));
    smokeCanvas.height = Math.max(64, Math.round(worldH * pxScale));
    smokeCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:5;';
    stage.appendChild(smokeCanvas);
    smokeObH = Math.max(64, Math.round(smokeObW * worldH / worldW));
    var shortAxis = Math.min(worldW, worldH);
    var dye = Math.round(shortAxis * 0.62);
    if (dye < 384) dye = 384;
    if (dye > 672) dye = 672;
    var opts = isMobile
      ? { SIM_RESOLUTION: 96, DYE_RESOLUTION: 256, DENSITY_DISSIPATION: 0.3,
          VELOCITY_DISSIPATION: 0.04, CURL: 14, SPLAT_RADIUS: 0.18, SHADING: true }
      : { SIM_RESOLUTION: 160, DYE_RESOLUTION: dye, DENSITY_DISSIPATION: 0.3,
          VELOCITY_DISSIPATION: 0.02, CURL: 14, SPLAT_RADIUS: 0.18, SHADING: false };
    var ok = false;
    try { ok = !!SmokeFluid.init(smokeCanvas, opts); } catch (e) { ok = false; }
    if (!ok) {
      smokeCanvas.style.display = 'none';
      smokeCanvas = null;
      return;
    }
    smokeActive = true;
  }

  function smokePuff(wx, wy, dvx, dvy, col, rad) {
    if (!smokeActive) return;
    smokeAwakeT = SMOKE_IDLE_HOLD;
    SmokeFluid.splat(wx / worldW, 1 - wy / worldH, dvx, dvy, col || SMOKE_COL, rad || 0.013);
  }

  function smokeCellObstacle(idx) {
    if (walls[idx]) return true;
    var n = waterCellCount[idx];
    if (n < WATER_CELL_WET) return false;
    // Slow pool water is a boundary. A falling stream is handled as moving
    // air below, so treating it as a solid square would erase the plume.
    return waterCellVY[idx] / n <= SMOKE_WATER_FLOW_MIN_VY;
  }

  // Wall runs + slime rings -> NDC triangles into the obstacle mask.
  function smokeRepaintObstacle() {
    var maxVerts = gridH * 24 + 4096;
    if (!smokeQuadVerts || smokeQuadVerts.length < maxVerts) {
      smokeQuadVerts = new Float32Array(maxVerts);
    }
    var v = smokeQuadVerts;
    var n = 0;
    var invW = 1 / worldW, invH = 1 / worldH;
    // A cell is an obstacle if it is drawn wall OR standing water (the
    // mirror-bucketed count): plumes bank off pools and streams.
    for (var r = 0; r < gridH; r++) {
      var off = r * gridW;
      var c = 0;
      while (c < gridW) {
        if (!smokeCellObstacle(off + c)) { c++; continue; }
        var c0 = c;
        while (c < gridW && smokeCellObstacle(off + c)) c++;
        if (n + 12 > v.length) break;
        var u0 = (c0 * TILE) * invW * 2 - 1;
        var u1 = (c * TILE) * invW * 2 - 1;
        var t0 = 1 - 2 * (r * TILE) * invH;
        var t1 = 1 - 2 * ((r + 1) * TILE) * invH;
        v[n++] = u0; v[n++] = t0;
        v[n++] = u1; v[n++] = t0;
        v[n++] = u0; v[n++] = t1;
        v[n++] = u1; v[n++] = t0;
        v[n++] = u1; v[n++] = t1;
        v[n++] = u0; v[n++] = t1;
      }
    }
    var sawJello = false;
    if (typeof jelloBodies !== 'undefined') {
      for (var bi = 0; bi < jelloBodies.length; bi++) {
        var b = jelloBodies[bi];
        if (!b || b.ringN < 3 || !b.ring) continue;
        if (!isFinite(b.cx + b.cy)) continue;
        sawJello = true;
        var cxU = (b.cx * invW) * 2 - 1;
        var cyV = 1 - 2 * (b.cy * invH);
        var prev = b.ring[b.ringN - 1];
        var pu = (b.px[prev] * invW) * 2 - 1;
        var pv = 1 - 2 * (b.py[prev] * invH);
        for (var k = 0; k < b.ringN; k++) {
          if (n + 6 > v.length) break;
          var ri = b.ring[k];
          var cu = (b.px[ri] * invW) * 2 - 1;
          var cv = 1 - 2 * (b.py[ri] * invH);
          v[n++] = cxU; v[n++] = cyV;
          v[n++] = pu;  v[n++] = pv;
          v[n++] = cu;  v[n++] = cv;
          pu = cu; pv = cv;
        }
      }
    }
    SmokeFluid.paintObstacleQuads(v, n / 2, smokeObW, smokeObH);
    smokePaintedVersion = wallsVersion;
    smokePaintedJello = sawJello;
  }

  var smokeObstacleTick = 0;
  function smokeWaterFlowCouple() {
    smokeWaterFlowTick++;
    if (smokeWaterFlowTick < 4 || !waterCellsAny || !SmokeFluid.splatVelocity) return;
    smokeWaterFlowTick = 0;
    smokeWaterFlowCount.fill(0);
    smokeWaterFlowVX.fill(0);
    smokeWaterFlowVY.fill(0);
    // The shared water map is 8 px. Aggregate 2x2 cells so a thinning
    // stream does not blink off whenever particles straddle cell edges.
    for (var wi = 0; wi < waterCellCount.length; wi++) {
      var wn = waterCellCount[wi];
      if (!wn) continue;
      var wc = wi % gridW, wr = (wi / gridW) | 0;
      var wbi = (wr >> 1) * smokeWaterFlowBinsW + (wc >> 1);
      smokeWaterFlowCount[wbi] += wn;
      smokeWaterFlowVX[wbi] += waterCellVX[wi];
      smokeWaterFlowVY[wbi] += waterCellVY[wi];
    }
    var candidates = smokeWaterFlowCandidates;
    candidates.length = 0;
    for (var idx = 0; idx < smokeWaterFlowCount.length; idx++) {
      var n = smokeWaterFlowCount[idx];
      if (n >= 1 && smokeWaterFlowVY[idx] / n > SMOKE_WATER_FLOW_MIN_VY) candidates.push(idx);
    }
    candidates.sort(function (a, b) {
      return smokeWaterFlowVY[b] / smokeWaterFlowCount[b] -
        smokeWaterFlowVY[a] / smokeWaterFlowCount[a];
    });
    var previous = smokeWaterFlowSelected;
    var selected = smokeWaterFlowNext;
    selected.length = 0;
    for (var pk = 0; pk < previous.length && selected.length < 5; pk++) {
      var held = previous[pk];
      var heldN = smokeWaterFlowCount[held];
      if (heldN < 1 || smokeWaterFlowVY[held] / heldN <= SMOKE_WATER_FLOW_MIN_VY) continue;
      selected.push(held);
    }
    for (var ck = 0; ck < candidates.length && selected.length < 5; ck++) {
      var pick = candidates[ck];
      var pickX = pick % smokeWaterFlowBinsW;
      var pickY = (pick / smokeWaterFlowBinsW) | 0;
      var nearPick = false;
      for (var sk = 0; sk < selected.length; sk++) {
        var prior = selected[sk];
        if (Math.abs(pickX - prior % smokeWaterFlowBinsW) <= 1 &&
            Math.abs(pickY - ((prior / smokeWaterFlowBinsW) | 0)) <= 1) {
          nearPick = true; break;
        }
      }
      if (!nearPick) selected.push(pick);
    }
    smokeWaterFlowSelected = selected;
    smokeWaterFlowNext = previous;
    var limit = selected.length;
    for (var k = 0; k < limit; k++) {
      var ci = selected[k];
      var count = smokeWaterFlowCount[ci];
      var col = ci % smokeWaterFlowBinsW, row = (ci / smokeWaterFlowBinsW) | 0;
      var avx = smokeWaterFlowVX[ci] / count;
      var avy = smokeWaterFlowVY[ci] / count;
      var fx = Math.max(-65, Math.min(65, avx * SMOKE_WATER_FLOW_FORCE));
      var fy = -Math.min(80, (avy - SMOKE_WATER_FLOW_MIN_VY) * SMOKE_WATER_FLOW_FORCE);
      var radius = SMOKE_WATER_FLOW_RADIUS + Math.min(0.018, count * 0.0012);
      SmokeFluid.splatVelocity((col * 2 + 1) * TILE / worldW,
        1 - (row * 2 + 1) * TILE / worldH, fx, fy, radius);
      smokeWaterFlowSplats++;
    }
  }

  function smokeFrame(dt) {
    if (!smokeActive) return;
    if (smokeAwakeT <= 0) {
      if (smokeWasAwake) {
        smokeWasAwake = false;
        try { SmokeFluid.clear(); SmokeFluid.displayPass(); } catch (e) {}
      }
      return;
    }
    smokeWasAwake = true;
    smokeAwakeT -= dt;
    var jelloMoving = false;
    if (typeof jelloBodies !== 'undefined') {
      for (var i = 0; i < jelloBodies.length; i++) {
        var b = jelloBodies[i];
        if (b && !b.sleeping && !b.frozen) { jelloMoving = true; break; }
      }
    }
    smokeObstacleTick++;
    var jelloChanged = jelloMoving || (smokePaintedJello !== (jelloBodies && jelloBodies.length > 0));
    if (smokePaintedVersion !== wallsVersion ||
        (jelloChanged && (smokeObstacleTick & 1) === 0) ||
        (waterCellsAny && (smokeObstacleTick % 6) === 0)) {
      smokeRepaintObstacle();
    }
    smokeWaterFlowCouple();
    SmokeFluid.step(dt * timeMul);
    SmokeFluid.displayPass();
  }

  /* ==== SLIME ENGINE ====================================================
   * Copied VERBATIM from js/sluice/340-jello.js (game v26.07): the whole
   * soft-body system — XPBD small-steps solver with colored constraints,
   * Mueller shape matching, gas-pressure volume, strain limiting, the
   * unified per-substep body-body contact sweep, sleep/wake, the water
   * DISSOLVE (enough dense water melts a slime into the liquid sim), and
   * the gel renderer (refraction, caustics, rim light, impact ripples).
   *
   * Do not edit the block. Every game coupling it has (player rig, mining
   * activation, dev arena, sfx) is neutralised in the OVERRIDES section
   * after it: in one scope the LAST function declaration wins, so a
   * same-named stub below the copy replaces the game version wholesale.
   * The identifiers it expects (TILE, cam, player, tileAt, ...) are the
   * toy versions declared above.
   *
   * Physics changes go in the GAME fragment first, then re-sync:
   *   node tools/toy-engine-sync.mjs --write
   * The pre-commit hook runs --check and refuses drift. ==== */
  /* >>> ENGINE SYNC: BEGIN jello-engine (verbatim js/sluice/340-jello.js) <<< */
  // ============================================================
  //  JELLO SOFT BODIES — shape-matching lattice (jello v1)
  // ============================================================
  //
  //  ┌────────────────────────────────────────────────────────────────────────┐
  //  │  v22 UNIFIED-CONTACT REBUILD (the big one — flagged by the owner as the  │
  //  │  "biggest win we have ever had"). For a long time piling/pressing blobs  │
  //  │  STUCK together, EXPLODED, and JITTERED endlessly. Those were not tuning │
  //  │  bugs — they were architectural: body-body contact ran ONCE PER FRAME    │
  //  │  after each blob's own solve, as a boundary-ring-only push, so the two   │
  //  │  passes FOUGHT (jitter) and interiors slid through (sticking).           │
  //  │                                                                          │
  //  │  The rebuild (Macklin & Mueller 2014 "Unified Particle Physics" / FleX): │
  //  │  the substep loop runs at the TOP of updateJello; each substep advances  │
  //  │  every active blob's internal solve (jelloBodyInternalSubstep) and then  │
  //  │  a GLOBAL per-PARTICLE contact pass (jelloContactSolve, via a count-sort │
  //  │  spatial hash over ALL active points) runs in the SAME Gauss-Seidel      │
  //  │  sweep. Contact is inelastic (velocity-free separation + normal          │
  //  │  approach-damping + Coulomb friction), unilateral so blobs never merge,  │
  //  │  and self-collision (rest-distance gated) stops a blob folding through   │
  //  │  itself. XSPH viscosity + plastic shape-match give the ooey-goo /        │
  //  │  memory-foam material. The drawn surface is OUTSET by the particle       │
  //  │  radius so touching blobs read as one solid thing (no air gap).          │
  //  │                                                                          │
  //  │  RESULT: no sticking, no blow-up, no jitter, clean contact. Verified     │
  //  │  with JXA numerical pile harnesses (KE-settles / no-interpenetration /   │
  //  │  no-blow-up), because the preview can't run the RAF loop. DO NOT regress │
  //  │  to a once-per-frame body-body push. Levers: JELLO_CONTACT_* / _XSPH /   │
  //  │  _PLASTICITY / _RENDER_OUTSET. Full notes in AGENTS.md (jello gotcha).   │
  //  └────────────────────────────────────────────────────────────────────────┘
  //
  //  A 'jello' tile is unminable (the drill bounces, see drillBlockReason)
  //  and stays a plain static grid tile — ZERO cost — until a neighbouring
  //  cell is mined. markTerrainCleared then calls jelloCheckActivation(),
  //  which flood-fills the connected 4-connected jello cluster and builds a
  //  LIVE SOFT BODY from it (activateJelloCluster -> jelloBuildBody).
  //
  //  SOLVERS (switchable live via JELLO_SOLVER / the 'M' dev hotkey; see the solver-
  //  selection tunables below). Build, activation, sleep/freeze, player coupling (fling /
  //  plow / containment / bowl), body-body separation and rendering are SHARED; only the
  //  inner constraint solve swaps:
  //      'pbd'  — the tagged jello-v1 baseline described under MODEL below.
  //      'xpbd' — compliant distance + volume constraints (Lagrange multipliers), run as
  //               small steps; stiffness is frame-rate independent (jelloSolveXPBD).
  //      'fem'  — XPBD-FEM, per-triangle Stable Neo-Hookean on the lattice mesh
  //               (jelloSolveFEM). mu/lambda come from JELLO_E/NU.
  //  The 'pbd' MODEL below is byte-identical to before this split:
  //
  //  MODEL — "squishy cube with clean edges" (JellyCar-style):
  //    Each body is a regular lattice of point masses (JELLO_NPT points per
  //    tile per axis) covering exactly the cluster's tiles. The points are
  //    held together by THREE things that together give a cube that squishes,
  //    dents and wobbles but always springs back to a crisp square:
  //      1. Verlet integration (gravity + inertia + light damping -> wobble).
  //      2. Distance constraints (springs) along lattice edges + cell
  //         diagonals -> local stiffness, no collapse, no self-fold.
  //      3. Global SHAPE MATCHING (Mueller 2005) -> the whole body is pulled
  //         toward a best-fit rotated + slightly-sheared copy of its rest
  //         square.  THIS is the square-shape memory + the spring-back.
  //
  //  CLEAN EDGES: the rendered outline is a fixed-topology RING of boundary
  //  points computed ONCE at build time (jelloBuildBody traces it). Each
  //  frame the ring points move but their connectivity never changes, so the
  //  outline is a stable closed polygon — it can NEVER fragment or flicker
  //  the way the old metaball iso-surface did. The cube reads as a defined
  //  cube that dents, not a cloud of blobs.
  //
  //  PERFORMANCE: buried jello = zero cost (static tile). A body whose bbox
  //  is off-camera FREEZES (skipped). A body at rest SLEEPS (skipped until
  //  the miner or a bomb disturbs it). Every loop is bounded by point count.
  // ============================================================

  // ---- Soft-body version marker ----
  // 'v1' = the baseline solver: Verlet + PBD distance constraints (springs) + Mueller
  // shape matching + a gas-pressure volume constraint. (Was tagged jello-v1 in the old
  // public repo; the tag did not survive the alpha repo split.) The
  // XPBD / FEM exploration will run as alternate JELLO_SOLVER modes alongside this.
  var JELLO_VERSION        = 'v1';

  // ---- Solver selection (v1 = pbd; xpbd / fem are the exploration tracks) ----
  // JELLO_SOLVER picks the constraint solver run inside the substep loop. Everything
  // else (lattice + ring build, lazy activation, sleep/freeze, Verlet integration,
  // player coupling, body-body separation, rendering) is SHARED across all three.
  //   'pbd'  = the tagged jello-v1 baseline: PBD distance constraints + Mueller shape
  //            matching + a gas-pressure volume constraint, few substeps x several iters.
  //   'xpbd' = compliant distance + volume constraints with tracked Lagrange multipliers,
  //            run as many tiny substeps x ONE iteration (frame-rate-independent stiffness).
  //   'fem'  = XPBD-FEM: per-triangle Stable Neo-Hookean (deviatoric + hydrostatic) on a
  //            triangle mesh, reusing the XPBD substep machinery.
  // Switch live with the 'M' dev hotkey or the gm 'jello.JELLO_SOLVER_ID' lever (0/1/2).
  // DEFAULT is 'xpbd' (the new solver). 'pbd' is the jello-v1 baseline, one 'M' press away,
  // and IS the rollback if the new default ever misbehaves: the old `jello-v1` git tag was
  // lost in the alpha repo split, so the baseline survives only as this live code path.
  var JELLO_SOLVER          = 'xpbd';
  var JELLO_SOLVERS         = ['pbd', 'xpbd', 'fem'];
  // Small-steps refinement for xpbd/fem (Mueller 2020 "Small Steps"): each JELLO_H chunk
  // is split into this many tiny substeps, each with ONE constraint solve. This is what
  // makes XPBD stiffness independent of frame rate. Higher = can be stiffer + costlier.
  // NOTE: substeps also act as a hidden STIFFNESS multiplier (error drops ~K^2), so at 5
  // the compliances were near-rigid for static loads no matter how soft E was dialed —
  // harness-measured 0.2% stack compression. 3 since v24.144 (jelly-tetris feel): real
  // squash under load, and cheaper per frame.
  var JELLO_XPBD_SUBSTEPS   = 3;
  // XPBD compliances (inverse stiffness; 0 = perfectly rigid, larger = softer). Derived
  // from JELLO_E in jelloRecomputeMaterial so the E knob still works, but exposed for
  // direct tuning. Units are px^2 / (force-ish), so the useful range is tiny.
  var JELLO_XPBD_COMPLIANCE       = 0;     // structural (edge) constraints
  var JELLO_XPBD_SHEAR_COMPLIANCE = 0;     // cell-diagonal shear constraints
  var JELLO_XPBD_VOL_COMPLIANCE   = 0;     // gas/volume constraint
  var JELLO_XPBD_SHAPE            = 0.005; // PER-SUBSTEP shape-match pull for xpbd/fem (toward the best-fit
                                           // rotated rest shape). This is the SQUARE-SHAPE MEMORY: with springs
                                           // (hold edge LENGTHS) + volume (holds AREA) but NO shape memory, a
                                           // free-resting cube buckles into a folded hook / slumps to a puddle
                                           // and never recovers the SQUARE. v21.48 moved this INSIDE the substep
                                           // loop (jelloStepXPBD), interleaved with the solve exactly like pbd
                                           // does it per iteration — applied once per frame it was both too weak
                                           // (cubes slumped) and lumpy (one late yank => vibration). Per-substep
                                           // it runs subs*K times/frame, so the value is ~PBD's 0.22 scaled by
                                           // its iters/substeps (2/5) -> ~0.09 reproduces the "perfect slime"
                                           // coherence + calm. Distinct from cranking it HARD as an anti-fold
                                           // brace (rigid, rejected); fold-through is JELLO_GAP_BLOCK's job.
                                           // 0 = pure floppy (hooks); ~0.09 = floppy + coherent; 0.2 = firm.
                                           // Live in the L panel (jello.JELLO_XPBD_SHAPE). Was 0.2 once-per-frame
                                           // (v21.46), 0.0 (v21.45 and earlier).
                                           // 0.005 since v24.144 (jelly-tetris): per-substep it COMPOUNDS to a
                                           // strong per-frame square pull (0.09 x 15-25 substeps ~ rigid memory)
                                           // — harness-measured as THE squash/drape blocker. At 0.005 the body
                                           // visibly slumps/drapes under load and still recovers the square
                                           // (0.0 melts: a dropped cube rests 28% flattened — don't).
  // ---- Constraint-space (internal) damping: the wobble-decay knob ----
  // Damps ONLY the velocity component along each edge (compression/extension
  // rate), via a post-solve relative-velocity pass per spring (jelloDampInternal).
  // Rigid motion is untouched: free fall and whole-body tumbling have zero
  // along-edge relative velocity, so unlike JELLO_DAMPING this can be cranked
  // without the body "floating in oil". The paper-XPBD sec-3.3 gamma form was
  // implemented first and MEASURED useless here: gamma = alpha~*beta*h divides
  // the damping correction by the same alpha~ (~576 at our soft compliances)
  // that under-relaxes the stiffness, so the per-substep velocity bleed came
  // out ~3e-5 (harness T1: zero effect on ring-down). Rayleigh
  // stiffness-PROPORTIONAL damping is inherently feeble on a soft material;
  // the velocity-space pass below is the standard game-soft-body equivalent
  // and is compliance-independent.
  // UNITS: 1/s decay rate of internal vibration. 0 = off (ring forever, v1);
  // ~12 = settle in a few beats; ~30 = one clean overshoot then still;
  // 80+ = near-critical tetris-snap. Applied per substep as rate*h, sequential
  // over springs (Gauss-Seidel style, self-limiting), xpbd + fem only; the
  // 'pbd' v1 baseline keeps its historical feel untouched.
  // SHIPPED 9 in v24.125 (owner: "really really REALLY jello-y — major wobble"):
  // a knock rings visibly before settling, instead of the v24.92-123 single clean
  // overshoot (30). 4 since v24.144 (jelly-tetris feel): ring-down ~1.8s on a hard
  // landing (harness-measured; 9 gave ~0.7s), the slow heavy c4d-style jiggle.
  // Sleep still arrives — singles ~4.5s, a 3-body leaning pile ~9.5s; the
  // frame-displacement gate is unchanged.
  var JELLO_INT_DAMP       = 4;
  // FEM (Stable Neo-Hookean) compliances, also derived from E/NU in jelloRecomputeMaterial.
  var JELLO_FEM_DEV_COMPLIANCE    = 0;     // deviatoric (distortion-resisting) term
  var JELLO_FEM_VOL_COMPLIANCE    = 0;     // hydrostatic (volume-preserving) term

  // ---- Build / sizing tunables ----
  // JELLO_NPT: lattice points per tile per axis. 2 -> a 4x4-tile cube becomes
  // a 9x9 = 81-point lattice with a 32-point boundary ring. Higher = smoother
  // dents + crisper outline at more cost (springs ~ O(points)). Range 2-4.
  var JELLO_NPT            = 3;        // 3 -> finer lattice + more boundary ring points = more detail
                                       // in the outline (smoothed into curves). 2 was too coarse/faceted.
                                       // This is the BASE for big clusters; small bodies build finer
                                       // (see the spawn-size tier block below).
  // ----- Spawn-size-aware lattice density (per-body npt) -----
  // Small bodies are where roundness shows (the dev cubes + the 2-6-cell game
  // patches), and they are nearly free: a 1-tile body is 16 pts at npt 3 but
  // only 36 at npt 5, while an 8x8 cluster would balloon 625 -> 1681. So the
  // BUILD picks a per-body npt from the cluster's tile count: tiny bodies get
  // JELLO_NPT_SMALL, mid-size JELLO_NPT_MED, everything bigger the JELLO_NPT
  // base. The chosen npt is stepped back down toward the base if the finer
  // lattice would blow JELLO_MAX_POINTS, so density is opportunistic - a build
  // that fits today can never start failing. Each body carries b.npt and
  // b.spacing (= TILE / b.npt); contact + render read the PER-BODY radius
  // (mixed radii in one hash: cell size = the largest 2r, separation = the
  // per-pair rA+rB), so different densities collide and draw correctly.
  var JELLO_NPT_SMALL       = 5;   // npt for bodies of <= JELLO_NPT_SMALL_CELLS tiles (1-2-tile cubes)
  var JELLO_NPT_MED         = 4;   // npt for bodies of <= JELLO_NPT_MED_CELLS tiles (game patches)
  var JELLO_NPT_SMALL_CELLS = 2;   // tile-count ceiling for the SMALL tier
  var JELLO_NPT_MED_CELLS   = 8;   // tile-count ceiling for the MED tier (worldgen patches are 2-6)
  // Hard caps (shared budget across all live bodies).
  var JELLO_MAX_POINTS     = 6000;   // total lattice points across every body
  var JELLO_MAX_BODIES     = 64;
  var JELLO_MAX_CELLS      = 64;     // flood-fill cap per cluster (tile count)
  // Back-compat aliases (old MPM names some external code / levers reference).
  var JELLO_MAX_PARTICLES  = JELLO_MAX_POINTS;
  var JELLO_PPT            = JELLO_NPT;

  // ---- Integrator ----
  // Verlet is unconditionally stable, so the substep can be coarse. We still
  // substep for a consistent feel at 60 vs 144 fps.
  var JELLO_H              = 1 / 240;   // sim substep seconds
  var JELLO_MAX_SUBSTEPS   = 5;         // catch-up cap per frame
  var JELLO_ITERS          = 2;         // constraint-solve iterations per substep (fewer = softer / more give)
  // Time scale: feeds the jello sim LESS real time so all of its motion (wobble,
  // droop, response to the rig) runs in slow motion -> reads as a massive, heavy
  // jello. 1 = real-time, 0.5 = half speed, 0.35 = very heavy/slow.
  var JELLO_TIMESCALE      = 0.5;

  // Gravity. REAL px/s^2 (timescale-compensated in jelloIntegrate), so a slime free-falls at
  // the same rate as the miner; defaults to the miner's GRAVITY for exactly equal fall. (Was
  // 540 in raw slow-mo sim units, which fell at only ~135 px/s^2 real, so a rig riding a
  // falling slime sank in slow motion.)
  var JELLO_GRAVITY        = GRAVITY;
  // Per-substep velocity retention (1 = none) - now just a faint AIR DRAG. The
  // wobble-decay duty moved to JELLO_INT_DAMP (internal-mode damping, which
  // leaves falling and tumbling untouched); cranking THIS lever damps EVERYTHING
  // including free fall, which is the old "floats like it's in oil" failure.
  // Keep it >= 0.998 and tune feel with JELLO_INT_DAMP instead. 0.999 keeps
  // ~79% of velocity per second, just enough that a detached blob doesn't
  // glide forever (0.9995 measured too floaty: idle-rig nudge drift held
  // ~30 px/s for 8+ s in the headless run).
  // The 'pbd' v1 baseline still leans on this lever; the GLOOP feel preset
  // restores its historical 0.998 (v19.1's "ring for 1.5-2s" tuning).
  var JELLO_DAMPING        = 0.998;
  // Hard per-point speed cap (px/s). Applied on BOTH sides of the solve: the integrate
  // clamp caps the CARRIED velocity pre-solve, and jelloClampVelocity caps the POST-solve
  // kick (the volume-constraint re-inflation of a pile-crushed body that otherwise pumps a
  // blow-up). A drive-in fling is ~250 px/s, so 600 is far above normal motion and only
  // bleeds off the runaway pile kick — lower it for a calmer heap, raise it for livelier
  // launches. Was 900 (pre-solve only) through v21.44.
  var JELLO_VMAX           = 600;
  // Restitution threshold (anti rest-buzz): contacts slower than this along the
  // contact normal (sim px/s) are perfectly INELASTIC - no bounce term. A point
  // resting on a floor re-penetrates by ~g*h^2 each substep; bouncing that
  // micro-impact every substep was the standing jitter pump. Real impacts
  // (drops, flings) are far above this and keep full JELLO_BOUNCE.
  var JELLO_REST_VEL       = 30;

  // ---- Material: stiffness levers ----
  // The owner-facing knob is JELLO_E (Young's-modulus-style stiffness, 0.5..400)
  // + JELLO_NU.  jelloRecomputeMaterial() maps E -> the three PBD stiffnesses
  // below, so the existing gm 'jello.JELLO_E' slider keeps working and feels
  // intuitive (higher = firmer cube).  MU/LAMBDA are kept for compatibility.
  var JELLO_E              = 0.5;       // overall stiffness (firmer at higher values). 0.5 since v24.144
                                        // (jelly-tetris feel): with substeps 3 + shape 0.005 this lands a
                                        // 28% landing squash / 42% bulge and ~7% stack compression under a
                                        // stacked cube (harness-measured; E=10 gave 5% / 0.2% — rigid bricks).
                                        // The PBD spring maps floor at E<=10, so the 'pbd' reference solver
                                        // keeps its historical feel; xpbd/fem read E through the compliances.
  var JELLO_NU             = 0.3;       // kept for compatibility (Poisson-ish)
  var JELLO_MU             = JELLO_E / (2 * (1 + JELLO_NU));
  var JELLO_LAMBDA         = JELLO_E * JELLO_NU / ((1 + JELLO_NU) * (1 - 2 * JELLO_NU));
  // PBD stiffnesses (0..1 per iteration) — derived from E in jelloRecomputeMaterial.
  var JELLO_SPRING         = 0.30;      // structural (edge) spring stiffness
  var JELLO_SHEAR_SPRING   = 0.18;      // cell-diagonal (shear) spring stiffness
  var JELLO_SHAPE_STIFF    = 0.22;      // global shape-match pull toward rest square
  // Shape-match deformation blend: 0 = goal is the rigidly-rotated rest square
  // (hard spring-back to a perfect square), 1 = goal is the best-fit linear
  // (sheared/stretched) shape (floppy).  Mid values = squishy-but-cubey.
  var JELLO_SHAPE_BETA     = 0.35;
  // Strain limiting (anti-extrude): a HARD cap on how far any lattice edge may stretch,
  // as a multiple of its rest length. A soft body otherwise oozes through a gap narrower
  // than itself by stretching its springs into a long thin sliver (the points flow through
  // one at a time). Capping the stretch tethers the points to their neighbours, so the
  // body can't elongate to thread a crack — it stays bunched and is held out. Applied
  // after the constraint solve in every solver. 1 = inextensible (stiff); higher = more
  // give but more able to squeeze; 0 = off. Keep above the largest stretch a normal squish
  // needs (~1.4) so it only catches the runaway extrusion.
  var JELLO_MAX_STRETCH    = 1.6;

  // ---- Resilience / topology guard --------------------------------------
  // Distance + volume constraints do not know which side of an edge a point
  // belongs on. A hard local shove can therefore mirror a triangle while
  // keeping every spring near its rest length, a zero-energy PBD fold. The
  // production tile lattice already carries a triangle mesh for inversion
  // healing; the round/dev builders install a health-only mesh below. This
  // very-low signed-area barrier touches only those health meshes and only
  // after a cell has actually crossed orientation. Ordinary squash bottoms
  // out well above it, so the soft feel is unchanged.
  var JELLO_ORIENT_MIN      = -0.005; // det(F) below this is a real mirror fold
  var JELLO_ORIENT_TARGET   =  0.015; // small legal area restored by one projection
  var JELLO_ORIENT_MOVE     =  0.35;  // max correction per point, in lattice spacings
  var JELLO_RECOVER_SHAPE   =  0.022; // per-substep rigid rest pull after an external grab
  var JELLO_TERRAIN_EJECT   =  0.45;  // max rigid terrain-containment move, in spacings
  var jelloDirectGrabActive = false;  // snapshots every contact participant while the demo holds one body

  function jelloRecomputeMaterial() {
    // Lever insurance: E <= 0 flips the XPBD compliances negative (constraint denominators
    // can cross zero = blow-up) and NU >= 0.5 divides LAMBDA by zero. The gm slider clamps
    // its own range but gm.set from the console does not — heal here, at the single choke
    // point every E/NU write already goes through. !(x > f) also catches NaN.
    if (!(JELLO_E > 0.05)) JELLO_E = 0.05;
    if (!(JELLO_NU >= 0)) JELLO_NU = 0; else if (JELLO_NU > 0.49) JELLO_NU = 0.49;
    JELLO_MU     = JELLO_E / (2 * (1 + JELLO_NU));
    JELLO_LAMBDA = JELLO_E * JELLO_NU / ((1 + JELLO_NU) * (1 - 2 * JELLO_NU));
    var t = (JELLO_E - 10) / (400 - 10);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    JELLO_SPRING       = 0.04 + t * 0.52;   // 0.04 .. 0.56 (softer floor -> squishier / deforms more)
    JELLO_SHEAR_SPRING = 0.028 + t * 0.38;  // 0.028 .. 0.41
    // Very weak global shape-match (v19.4): barely pulls back toward the rest
    // square, so the body DROOPS under gravity and stays dented after a hit
    // (the owner wants goopy real-jello that "barely comes back"). What keeps it
    // from fully collapsing is the gas pressure (volume), not this. Raise E for
    // a firmer, more shape-holding cube.
    JELLO_SHAPE_STIFF  = 0.012 + t * 0.18;  // 0.012 .. 0.20
    // XPBD compliances (inverse stiffness, px^2-scale) from the SAME E knob. Smaller =
    // stiffer. XPBD makes the resulting stiffness frame-rate independent, so these are a
    // true material property. Constants chosen so E=10 reads as soft jello and E=400 firm.
    JELLO_XPBD_COMPLIANCE       = 4.0e-3 / JELLO_E;   // structural edges (~1% stretch at E=10, matches v1)
    JELLO_XPBD_SHEAR_COMPLIANCE = 8.0e-3 / JELLO_E;   // shear diagonals (softer than structural)
    JELLO_XPBD_VOL_COMPLIANCE   = 1.0e-2 / JELLO_E;   // gas/volume (holds area but allows squish). 1e-2 since
                                                      // v24.144 (was 1e-3): at jelly-tetris E the volume gate was
                                                      // the squash blocker (a gripped base can't spread, so a
                                                      // stiff area lock = no vertical squash). Presets that want
                                                      // the firm look pin JELLO_XPBD_VOL_COMPLIANCE explicitly.
    // FEM (Stable Neo-Hookean) per-unit-area compliances from the Lame parameters; the
    // FEM solve scales these by each triangle's rest area. (Used by the 'fem' solver.)
    // The 0.05 is a calibration so the px-scale + E range read as jello (validated: E=10
    // soft + visibly deforming, E=400 near-rigid, rest-stable at all E). The solve divides
    // these by each triangle's rest area, per the XPBD-FEM derivation alpha = 1/(k*V).
    JELLO_FEM_DEV_COMPLIANCE    = 0.05 / Math.max(1e-3, JELLO_MU);      // deviatoric (shear modulus mu)
    JELLO_FEM_VOL_COMPLIANCE    = 0.05 / Math.max(1e-3, JELLO_LAMBDA);  // hydrostatic (Lame lambda)
  }

  // ---- Plasticity (permanent set) — drifts the REST shape toward the current
  // deformed shape when strain exceeds a yield threshold.  0 = pure elastic
  // (default).  Raise for "settles with a dent" / clay-like behaviour. ----
  var JELLO_PLASTICITY     = 0.0;
  var JELLO_YIELD          = 0.25;
  var JELLO_HARDEN         = 0.0;

  // ---- Non-Newtonian feel — modulate damping by deformation rate. 0 = off.
  //   > 0 shear-thickening (oobleck: firmer under fast hits)
  //   < 0 shear-thinning  (ketchup: flows easier when moving fast)
  var JELLO_SHEAR          = 0.0;
  var JELLO_SHEAR_CAP      = 3.0;

  // ---- XSPH viscosity (Schechter & Bridson 2012) — the "ooze" + the residual-jiggle damper.
  // Each substep, every point's velocity is nudged toward the AVERAGE velocity of its spring
  // neighbours by this fraction. It damps only RELATIVE motion (internal sloshing), never the
  // bulk translate/rotate, so the body flows like honey and a pressed pile dissipates to rest
  // instead of buzzing. 0 = none (springy/jiggly), ~0.2 = subtle + settles, 0.4-0.7 = visibly
  // viscous goo (motion smears between neighbours), ->1 = pasty/locked. The single biggest knob
  // for the ooey-goo feel and for calming a contact pile. v24.92: 0.2 -> 0.12 -
  // with internal-mode damping (JELLO_INT_DAMP) carrying the ring-down, XSPH
  // returns to its real jobs: the ooze character + calming contact-pile slosh.
  // Keep >= ~0.1; below that piles get busier. -----
  var JELLO_XSPH           = 0.12;

  // ---- World-collision response ----
  var JELLO_BOUNCE         = 0.18;   // restitution off solid tiles / walls
  var JELLO_FLOOR_FRICTION = 0.68;   // tangential velocity kept on floor contact. 0.68 since v24.125
                                     // (owner: "stickier — rolls instead of slides"): a gripped base is
                                     // what converts a side push into a TIP — the top keeps moving, the
                                     // base holds, the body leans over and tumbles. 0.86 (v24.92-123)
                                     // let the whole body skate. Live lever jello.JELLO_FLOOR_FRICTION.
  var JELLO_WALL_FRICTION  = 0.94;   // tangential velocity kept on wall contact
  var JELLO_SPLAT_GRAVITY  = 460;    // birth-splat particle gravity

  // ---- Sleep / freeze ----
  var JELLO_SLEEP_VSQ      = 9;      // per-point px^2/s^2 below which it's "still", read at a FIXED
                                     // 60fps reference frame (see jelloUpdateBody). 3 px/s = 0.05 px
                                     // per 60fps frame - invisible. v24.110: 2.5 -> 9; a body resting
                                     // on a gap-blocked 1-wide hole carries ~1.7 px/s of rectified
                                     // contact flicker (fixed ~0.029 px/frame amplitude, harness-
                                     // measured) that pinned sleepFrames under the old bar forever.
  var JELLO_SLEEP_FRAMES   = 50;     // still frames before a body sleeps
  var JELLO_ACTIVE_MARGIN  = 0.85;   // screen-fraction margin for off-camera freeze

  // ---- Miner <-> jello coupling ----
  // Player -> jello (applied per substep in jelloPlayerCouple):
  var JELLO_PLAYER_EJECT   = 220;    // push (px/s) imparted to points the rig overlaps
  var JELLO_TRACTION        = 0.6;   // fraction of player.vx dragged into side-contact points
  var JELLO_PLOW           = 0.9;   // 0..1 — how hard the rig's BODY shoves the gel it overlaps in its travel
                                     // direction (like the jet shoves gel along its thrust). The cube deforms +
                                     // flows out of the way so the miner pushes THROUGH instead of stopping dead.
                                     // 0.6 -> 0.9 in v24.125: with the fling gated above drive speed, the plow
                                     // is now the WHOLE push at walk pace, so it gets more authority.
  var JELLO_PLOW_BASE      = 0.10;   // 0..1 fraction of the plow bite kept at the body's GROUND LINE on a
                                     // horizontal push (full bite at its top). The height gradient turns the
                                     // push into a SHEAR: top leads, sticky base holds, the body tips and
                                     // tumbles instead of skating (v24.125, owner: "rolls instead of slides").
                                     // 1 = uniform push (the old pure-translation skate).
  var JELLO_TRACK_SHEAR    = 0.1;    // top-surface shear opposite travel (drive right -> top shears left).
                                     // The "slosh the gel under the rig" feel — raise for a more violent
                                     // slosh, lower for a stiffer surface (0 = none).
  var JELLO_IMPACT         = 1.2;    // 0..1+ how hard a fast collision caves the contact face in + splashes
                                     // (1.2 since v24.144 — fatter landing dent for the jelly-tetris feel)
  var JELLO_JET_PUSH       = 500;    // near-field crater strength. v22.20: applied VELOCITY-FREE (relocates the
                                     // gel along the exhaust, uncapped) - velocity adds were double-capped (VMAX
                                     // clamp + the springs soak them) and never bit. Kept as the near-field term.
  var JELLO_JET_LEN        = TILE * 4;     // axial reach of the jet cone along the exhaust direction
  var JELLO_JET_R0         = 7;            // cone radius at the nozzle mouth (px)
  var JELLO_JET_TAN        = 0.45;         // tan(cone half-angle) ~ 24 deg; radius grows R0 + s*TAN with distance s
  var JELLO_JET_RANGE      = TILE * 2.4;   // MAX cone radius clamp (caps the far-field footprint; also the
                                           // legacy lever name, so saved presets keep working)
  var JELLO_JET_NEAR       = TILE * 1.2;   // within this axial distance the response is ALL crater (relocation);
                                           // beyond it cross-fades to the far-field velocity push
  var JELLO_JET_VEL        = 900;          // far-field momentum feed (velocity add along the exhaust, solver-dt
                                           // scaled). Soaked by springs by design - it carries motion and surface
                                           // travel, the crater does the biting.
  var JELLO_JET_REACT      = 1.0;          // Newton-pair BACK-PRESSURE on the rig from gel the jet is blasting
                                           // (v24.144, owner: "the jets should have an equally strong impact to
                                           // the miner itself"). Accelerates the rig OPPOSITE the exhaust in
                                           // proportion to the tiles-worth of gel inside the cone, so hovering
                                           // low over a slime rides a soft pillow (~0.5-1 g over a fat blob,
                                           // fading as the crater evacuates the gel) and a sideways blast in
                                           // rotation flight recoils the rig away. 0 = the old one-way jet.
  var JELLO_JET_REACT_CAP  = 1.4;          // back-pressure ceiling, in multiples of GRAVITY — a dense pile can
                                           // cushion hard but can never launch the rig.
  // FLING (drive-into = launch): when the rig drives INTO a blob (not resting on
  // top) faster than JELLO_FLING_MIN, jelloPlayerFling imparts the rig's momentum
  // to the WHOLE body so it tumbles off — "bat the gel around with the miner".
  var JELLO_FLING          = 1.1;    // fraction of the rig's speed the blob is flung at (≈1 = leaves at
                                      // your pace, >1 = it outruns you and clears off, 0 = no fling).
                                      // Gated so it sets the launch speed, never pumps past it -> stable.
  var JELLO_FLING_SPIN     = 0.6;    // 0..1 height-gradient on the fling velocity (v24.125, owner: "rolls"):
                                      // the body's TOP leaves at (1+spin)x the launch speed, the base at
                                      // (1-spin)x, mean exactly 1 — same COM momentum (the no-pump gate is
                                      // COM-based, so its semantics are untouched), but the gradient is an
                                      // angular velocity: a rammed cube TUMBLES off instead of skating off.
                                      // Scaled by |dirx| so a straight-down dive stays a uniform punch.
                                      // 0 = the v24.94 clean whole-body launch, exactly.
  var JELLO_FLING_LOFT     = 0.35;   // upward tilt of a mostly-horizontal fling (0 = launch flat along the
                                      // travel dir). ON THE GROUND a soft body SHEARS instead of tumbling —
                                      // harness-measured: the spin gradient died into the floor contact at
                                      // <10 deg of rotation. Lofting the launch (~19 deg up at 0.35) gets
                                      // the body briefly AIRBORNE, where the gradient survives as a real
                                      // tumble, and it lands rolling. Same gated magnitude, direction only;
                                      // scaled by |dirx| so vertical dives stay straight.
  var JELLO_FLING_MIN      = 200;    // min rig speed (px/s) to count as a drive-into fling. Below this the
                                      // drive is the PUSH tier (v24.151) — a rate-limited sustained shove.
                                      // 200 since v24.125 (owner: "rolls instead of slides when I push it"):
                                      // at 50, ordinary driving (MOVE_SPEED=160) flung the WHOLE body — a
                                      // uniform velocity SET = a pure instant slide. The push tier is the
                                      // fixed version of that idea: it ACCELERATES the body toward the
                                      // target (heavy = slow spool), keeps the height-graded lean, and the
                                      // soft material squashes against the nose — so it reads as bulldozing
                                      // a heavy soft thing, not an air-hockey puck.
  // ---- PUSH (drive-into below fling speed) — "the whole fun part" (v24.151) ----
  // Owner: "pushing these things around with the miner simply doesn't work".
  // Diagnosis: below FLING_MIN *nothing* gave a blob sustained momentum — the
  // plow/yield are velocity-FREE relocations and containment killed the rig's
  // absolute inward velocity, so the rig bonked to a stop while the blob dented
  // in place. The push tier drives the WHOLE body toward JELLO_PUSH x the rig's
  // speed at a mass-scaled rate, with the same set-don't-pump gate as the fling
  // (it can never accelerate a body past the target, so it cannot blow up), and
  // the containment kill is now RELATIVE to the pushed body's velocity, so the
  // rig rolls along with what it shoves instead of grinding to zero each frame.
  var JELLO_PUSH           = 1.05;   // fraction of rig speed the pushed body is driven toward (0 = off).
                                      // MUST be >= 1: below 1 the body permanently lags the rig, so the rig
                                      // grinds into the face forever and the yield carves the soft gel around
                                      // the hull — the rig knifes THROUGH instead of pushing (harness: a 2x2
                                      // at 0.9 stalled after 130px and the rig drove through it). At 1.05 the
                                      // body scoots just ahead, contact pulses, and the bulldoze sustains.
  var JELLO_PUSH_MIN       = 20;     // px/s of rig speed before a contact counts as a deliberate push
                                      // (below = idle lean/jitter, containment only).
  var JELLO_PUSH_ACCEL     = 900;    // px/s^2 drive rate at reference mass (2 tiles). Scaled by 2/tiles
                                      // (clamped 0.35..1): a 1-2-tile slime scoots immediately, a 6-8-tile
                                      // slab leans on you and spools up — weight you can feel. The rig pays
                                      // JELLO_PLOW_REACT of every px/s actually imparted (Newton).
  // ---- Containment pacing + two-way momentum (v24.94 collision overhaul) ----
  var JELLO_EJECT_RATE     = 360;    // px/s max speed the hard containment may push the RIG out at. The old
                                     // one-frame full ejection read as a teleport pop (worst right after a
                                     // drill-into-blob, when containment resumed on a deep overlap).
  var JELLO_EJECT_SNAP     = 6;      // px overlap resolved instantly regardless of rate (shallow grazes stay crisp)
  var JELLO_YIELD_RATE     = 240;    // px/s the BLOB's gel is relocated out of the rig's space (velocity-free).
                                     // Deep overlap resolves by the gel squeezing aside, not the rig popping.
  var JELLO_RIG_PUSH       = 0.8;    // 0..1 fraction of a blob's approach speed transferred to the rig on contact
                                     // (two-way coupling: a moving blob can now SHOVE the parked rig)
  var JELLO_MASS_RATIO     = 0.5;    // per-TILE blob:rig mass ratio for that exchange. Total ratio = this * tiles,
                                     // so a big blob outweighs the rig and wins; a single cube barely nudges it.
  var JELLO_TRAMPOLINE     = 0.45;   // 0..0.9 restitution of a stored hard landing, returned at the EXIT of the
                                     // dip (after the visible sink), so it reads as the gel throwing you back,
                                     // not a rigid first-frame bounce (the v22.18 failure). 0 = pure cushion.
  var JELLO_GAP_FIT        = 1;      // 1 = a 1-wide body fits a 1-wide channel (the core mechanic: a dug-out
                                     // cube drops down a shaft as an elevator cushion or pushes into an
                                     // oil/acid pool). A CLOSED slot always accepts it; an OPEN shaft accepts
                                     // it only while it is GOING DOWN (dropped/pushed) so a resting surface
                                     // slime doesn't passively drain (see JELLO_GAP_FIT_DRIVE + the gap-block).
                                     // 0 = off (a 1-wide body is gap-blocked from every 1-wide channel).
                                     // Multi-tile bodies are always gap-blocked.
  var JELLO_GAP_FIT_DRIVE  = 60;     // px/s downward centroid speed above which a 1-wide body FITS through an
                                     // OPEN-bottom shaft (v24.162). Below it (a slime resting over the mouth)
                                     // it is held on the lip so it can't randomly drain. Resting bodies measure
                                     // ~0 px/s and a drop/push measures hundreds, so 60 is a wide safety gap;
                                     // a CLOSED slot ignores this (always fits).
  // PERCH HOLD (v24.168) — PARKED OFF since v24.189 (default 0). Kept as a one-flip
  // lever, not deleted, because this corner is heavily relitigated.
  // What it did: a body RESTING on tile support remembered its altitude (perchY);
  // when that support was dug away it was PINNED at perchY instead of falling, to
  // kill the "surface slimes drain down when I dig near them" reports.
  // Why it's off now: those drains were ACTUALLY jelloDeformBowl reaching through
  // solid dirt (the rig riding a lower cube dragged a same-column upper cube down),
  // root-caused + fixed at the source in v24.170. With that gone, perch-hold is a
  // redundant band-aid whose only visible effect is the bug in the owner's v24.189
  // video: a cube you dig a shaft UNDER hovers at the surface (pinned) and the
  // contested hold-vs-gravity state deforms it into a goblet, instead of just
  // FALLING down the hole like it should (harness A/B: perch ON pins below≈0.1
  // tiles as a 7-deep shaft opens under it; perch OFF falls smoothly 0→8 and rests).
  // Digging the ground out from under a body and having it fall IS correct sandbox
  // physics; a body on intact ground is unaffected (supported -> perch was a no-op),
  // and a dug-out cube dropped down a shaft / pushed into oil was already DRIVEN
  // (perch never held those). Flip to 1 only if a passive-drain case resurfaces that
  // the v24.170 deformBowl gate does not cover.
  var JELLO_PERCH          = 0;      // 0 = undermined resting bodies FALL (parked off, v24.189); 1 = pin at perch
  var JELLO_PERCH_SLOW     = 60;     // real px/s: at/below this the body is "resting" — track its perch altitude
  var JELLO_PERCH_RELEASE  = 95;     // real px/s: above this the body is "disturbed" (pushed/dropped) — never held
  var JELLO_PERCH_MAXDROP  = 64;     // px: hold only a body sunk <= this far below perchY (a fresh undermine). A
                                     // body far below its perch fell there legitimately — reset the perch, let it be.
  // Jello -> player: soft, FORCE-based memory-foam contact (jelloPlayerCouple +
  // jelloResolvePlayer). The gel compresses around the rig and pushes back with a
  // force (no position teleport), so you sink into a deep give and get cradled.
  // (The old 0..1 "memory-foam ease-out" JELLO_CONTACT that lived here was DELETED in the
  // duplicate-var sweep: nothing read that semantics since the v24.94 containment levers
  // (JELLO_EJECT_RATE / JELLO_YIELD_RATE) took the job, and its re-declaration collided
  // with the per-particle contact MASTER TOGGLE of the same name below — same landmine
  // the gm facade already documents for its lever registration. One name, one var.)
  var JELLO_REACT          = 600;    // soft force shoving the rig back along the CONTACT NORMAL (out of the
                                     // local gel mass), scaled by how embedded it is. Higher = firmer cradle.
  var JELLO_BARRIER        = 3;      // px/frame hard position correction along the contact normal, applied
                                     // ONLY when the rig centre crosses inside the ring (deep-punch backstop
                                     // so a fast hit can never tunnel through; normal grazes never trigger it).
  var JELLO_VISCOSITY      = 4.0;    // how much velocity the gel absorbs on contact (foam catch, no bounce).
  // Anti squeeze/fold-through (jelloGapBlock): treat a 1-tile-wide crack as impassable
  // geometry, ejecting any point that gets into the slot back to the open mouth. Keeps the
  // body fully floppy (only channel points are touched). 1 = on, 0 = off (it can squeeze in).
  var JELLO_GAP_BLOCK      = 1;
  // ===== UNIFIED PER-PARTICLE CONTACT (v22 rebuild) — FleX / Macklin-Mueller 2014 ==========
  // Body-body (and, Phase 3, self-) collision solved as per-PARTICLE constraints INSIDE the
  // substep loop, in the SAME Gauss-Seidel sweep as the internal solve, via a global spatial
  // hash. This replaces the old after-the-fact jelloResolveBodies push, which (a) ran once per
  // frame decoupled from the solver so the two passes fought -> jitter, and (b) only moved the
  // boundary RING so interiors slid through -> sticking. Now every point is a disk of radius r;
  // two points of DIFFERENT bodies within 2r are pushed apart to 2r — a UNILATERAL constraint
  // (only ever separates, never pulls) so blobs touch and stack but never merge. Inverse-mass
  // split, true serial Gauss-Seidel; positional Coulomb friction holds piles from slumping.
  // (Do NOT add a no-correction slop band here: tried for v24.112, it parks faces closer than
  // 2r where slow drift interleaves the rings and the containment backstop teleport-fights the
  // band forever — measured ~600 containment ejections/s on a resting pair. The touching-row
  // standoff is fixed at its real source instead: JELLO_STATIC_CREEP above.)
  var JELLO_CONTACT          = 1;     // master toggle for unified per-particle contact (0 = old behaviour off)
  var JELLO_CONTACT_R_FRAC   = 0.5;   // particle radius as a fraction of lattice spacing h = TILE/JELLO_NPT.
                                      // 2r is the gap kept between points; 0.5 -> 2r = h (rings touch cleanly).
  var JELLO_CONTACT_FRICTION = 0.7;   // 0..1 positional Coulomb friction at contacts (0 = frictionless slide,
                                      // 1 = no tangential slip). Holds a pressed pile from slumping into mush.
                                      // 0.7 since v24.144 — stickier body-body grip, pieces drape + stack
                                      // rather than skating off each other (jelly-tetris feel).
  var JELLO_CONTACT_DAMP     = 0.9;   // 0..1 inelasticity: fraction of the APPROACH (normal) velocity bled off
                                      // at a contact. 1 = fully inelastic (no bounce, settles hard); 0 = the
                                      // separation injects no velocity but the approach persists (pile buzzes).
                                      // Numerically validated: with the velocity-free separation this is what
                                      // makes a pressed pile reach a stable rest instead of pumping to the clamp.
  var JELLO_CONTACT_SELF     = 1;     // self-collision: a body's own points collide so it can't fold THROUGH
                                      // itself (replaces the gap-block + air-mesh hacks). Only fires between
                                      // points that are FAR apart in the REST lattice but folded close now, so
                                      // uniform compression (squish) is untouched — only genuine folds resist.
  var JELLO_SELF_MIN_REST    = 2.5;   // min REST distance (in lattice spacings h=TILE/NPT) for two same-body
                                      // points to self-collide. Below this they're near-neighbours (or moderate
                                      // squish) and are skipped; above, a fold that brings them within 2r resists.
  var JELLO_CONTACT_CONTAIN  = 1;     // boundary CONTAINMENT backstop: per substep, any boundary point found
                                      // INSIDE another blob's outline is pushed back out to that outline. A
                                      // geometric GUARANTEE that no ring ever sits inside another (no
                                      // interleaving / conjoining) that holds at ANY softness — the point-to-
                                      // point contact alone can let very soft, stretched rings interleave
                                      // between boundary points. Run per-substep (converges with the solve, so
                                      // no jitter, unlike the retired once-per-frame jelloResolveBodies). 0 = off.
  var JELLO_CONTACT_ITERS    = 3;     // Gauss-Seidel passes of the contact solve PER substep. 1 leaves residual
                                      // overlap under a hard press (blobs read as conjoined); 2-3 fully separate
                                      // a pressed pile. Cheap (re-solves the cached hash), so raise if they merge.
  var JELLO_STATIC_CREEP     = 0.15;  // fraction of tangential velocity KEPT while a floor/wall contact is in
                                      // the static-friction regime (|v_t| below the rest threshold). The old
                                      // stick was EXACT (kept 0): correct for an isolated resting body, but it
                                      // pinned the base of every body in a touching ROW, and the row's residual
                                      // contact press (faces held ~2px short of full separation) then had no
                                      // relaxation channel — contact spread the faces every substep, shape-match
                                      // re-narrowed the cube around its pinned base, and the internal solve
                                      // converted that churn back into velocity. Energy-budget-measured standoff:
                                      // ~7.3k px^2/sub^2 per second injected and dissipated on a 6-row, ~100 px/s
                                      // visible churn, never sleeps — the owner's flat-ground "spongebob wiggle"
                                      // (v24.112). Keeping a small tangential fraction lets ONLY pressed bodies
                                      // creep apart (an isolated rester has ~zero tangential velocity, and the
                                      // kept fraction per substep decays geometrically — it still reads as a
                                      // dead stop), so a touching row relaxes to full separation and goes quiet.
                                      // The exact stick was also an F32-ULP guard (see the in-function note);
                                      // positions are F64 since v24.93, so the ratchet it guarded against is
                                      // gone. 0.3 -> 0.15 in v24.125 (stickier base for the push-tips-it feel,
                                      // sweep-measured: lean 9deg at 0.22 -> 21deg at 0.12; 0.15 splits it);
                                      // do NOT go to 0 — that is the exact stick the v24.112 row standoff needs
                                      // relaxed. Validate any further drop with the chain-settle harness.
  var JELLO_RENDER_OUTSET    = 1.0;   // draw the gel SURFACE this many particle-radii (r) OUTWARD from each
                                      // boundary point. Contact keeps boundary points 2r apart, so without this
                                      // there's a visible ~2r AIR GAP between touching blobs; at 1.0 the surfaces
                                      // meet exactly (no gap, no overlap). 0 = draw at the points (old, gappy).
  var jelloContactsThisFrame = 0;     // perf gauge: contact corrections applied (replaces the old 'sep' count)
  // ---- Jello COUPLING debug (dev-mode readout: why the rig moves on a cube) ----
  // Captured each frame by the player/jello hooks; shown in drawPerfOverlay (numbers)
  // and as world-space vectors after drawJelloBlobs. Pure instrumentation, no sim effect.
  // ---- Jet frame (cached once per frame by updateJello; read per substep by the
  // couple). Direction = the rig's TRUE exhaust direction (rocketExhaustDir -
  // opposite the thrust heading in rotation flight), origin = the centre nozzle
  // in rotated body space (playerLocalToWorld). Cross-fragment calls are safe via
  // the single-IIFE hoisting (same pattern as tileAt). ----
  var jelloJetOn = false, jelloJetDX = 0, jelloJetDY = 1, jelloJetOX = 0, jelloJetOY = 0;
  // Jet OCCLUSION (v25.20): axial distance to the first SOLID tile along the exhaust,
  // recomputed once per frame with the jet frame. The cone used to be pure geometry,
  // so a slime in a sealed cave 3 tiles under the hovering rig got blasted THROUGH
  // the floor (owner report). Solid-tiles-only on purpose: gel must NOT occlude gel
  // (the cone pushes into the first slime's interior, and blasting through a gel
  // stack is the established feel); walls, floors and ceilings hard-stop the cone.
  var jelloJetMaxS = Infinity;
  var jelloJetSplT = 0;
  var jelloJetReactT = 0;   // tiles-worth of gel the jet cone covered, summed over the frame's substeps
                            // (jelloPlayerCouple accumulates, updateJello averages + applies the back-pressure)

  var jelloDbg = {
    input: 0,        // -1 left, 0 none, +1 right (arrow input this frame)
    onJello: false,  // grounded on a cube this frame
    carryReal: 0,    // supporting cube COM horizontal speed, real px/s (is the cube itself moving?)
    effCarry: 0,     // carry velocity actually applied to player.x this frame (px/s)
    injected: 0,     // dismount vx handed to the rig this frame (px/s)
    plowPts: 0,      // gel points the rig PLOWED (body overlap) this frame
    shearPts: 0,     // gel points the rig TRACK-SHEARED (under-foot) this frame
    flings: 0        // bodies the rig FLUNG (whole-cube launch) this frame -- should stay 0 while on top
  };
  // Side / underside contact (jelloResolvePlayer): how far the rig may sink into a
  // blob's flank before it HARD-STOPS (no tunneling). The stop moves only the RIG; the
  // blob slides on its own via the couple's velocity-free dent + springs (bulk-
  // translating the gel exploded it against the ground clamp).
  var JELLO_SIDE_SINK      = 26;     // px the rig sinks into the side before the firm stop (the dent depth)
  var JELLO_FOAM_DAMP      = 0.3;    // 0..0.9 fraction of along-axis velocity absorbed/frame (memory foam, no
                                     // bounce). HIGH = mushier / slower ooze; LOW = livelier (toward springy).
  var JELLO_SHOVE          = 0.7;    // (reserved; the old whole-blob slide exploded the gel and was removed)
  var JELLO_CRADLE         = 0.35;   // (legacy; the position-eject cradle was replaced by the force reaction)
  var JELLO_BUOYANCY       = 220;    // (legacy; unused)
  var JELLO_TOP_BAND       = 50;     // px below the surface still treated as "resting on top". Raised in v22.18
                                     // so a soft, deep cushioned sink stays grounded; feet deeper than this (a
                                     // side / underside hit) go to the soft force contact instead.
  var JELLO_PLAYER_BLOCK   = 0.45;   // (legacy; the hard side-block was replaced by the airbag deform)
  // (The legacy JELLO_PUSH ("rig dents/envelops") that lived here was DELETED in the
  // duplicate-var sweep: it silently re-declared the v24.151 push-tier lever above and
  // overwrote its 1.05 with 0.7 at load — below the >=1 floor that lever documents, so
  // every walk-speed bulldoze stalled and the rig knifed through the gel. One name, one var.)
  var JELLO_PLAYER_CARRY   = 0.4;    // (kept for compatibility; carry was removed — see jelloResolvePlayer)
  var JELLO_SUPPORT        = 3.0;    // (kept for compatibility; movement owns Y grounding)
  var JELLO_SUPPORT_MIN    = 0.5;    // (kept for compatibility)
  // Drive-on-jello (movement owns Y grounding — see jelloGroundProbe):
  var JELLO_GROUND_MIN     = 1;      // min boundary points under foot to count as standable
  var JELLO_GROUND_GRIP    = 0.85;   // ACC/FRICTION multiplier while standing on jello (subtly slippery)
  var JELLO_GROUND_COYOTE  = 0.12;   // s. Debounced "on a cube top" window (player.jelloGroundT). onJello flickers
                                     // true/false every frame on a deforming cube top; this timer is refreshed
                                     // whenever grounded and gates the FORWARD pushes (fling + plow) so they hold
                                     // OFF through the flicker instead of firing on the false frames (which
                                     // launched the whole cube along with you and slid the pair forever).
  // ---- Plow-and-scatter (drive INTO a pile instead of ramping up + over it) ----
  var JELLO_PLOW_SPEED     = 45;     // px/s. Above this horizontal speed the rig is "driving INTO" cubes, not
                                     // gently stepping, so the auto-step-up reach collapses to JELLO_STEP_UP: a
                                     // tall cube becomes a WALL you plow/scatter, not a staircase you ramp up.
  var JELLO_STEP_UP        = 11;     // px. Max height a cube top may be ABOVE the feet and still be auto-mounted
                                     // WHILE DRIVING (a curb). Slow/landing keeps the full 1.5-tile reach (soft
                                     // catch + step onto a low cube). Raise to climb taller cubes while driving.
  var JELLO_PLOW_REACT     = 0.1;    // 0..1 plow resistance: fraction of the speed the rig imparts to a cube it
                                     // flings that is bled BACK off the rig (Newton reaction). A thick pile flings
                                     // several cubes/frame so it slows you more. 0 = frictionless plow-through.
  var JELLO_SINK           = 20;     // (v22.15: no longer gates the landing — the contact gate is now feet >=
                                     // surfaceY so the catch engages ON the gel, not 20px above it.) The rig's
                                     // rest depth is now EMERGENT (where LAND_SPRING balances gravity). Kept as
                                     // a reference/lever; jelloDeformBowl carves the bowl down to the feet.
  var JELLO_BOWL           = 0.4;    // 0..1 how fast the bowl WALLS conform each frame (visual bowl shape).
  var JELLO_REST_DAMP      = 0.3;    // 0..1 velocity absorbed/frame for the gel right around a RESTING rig, so
                                     // the displaced side-bulges settle instead of joggling. HIGH = settles
                                     // fast (calmer); 0 = the underdamped gel rings forever under the rig.
  var JELLO_LAND_SPRING    = 40;     // slime stiffness catching a landing rig (one-sided, up). Governs the
                                     // TRANSIENT dip only: how hard the gel resists a fast landing punching
                                     // the feet below the surface, and how fast it springs back. LOW = a
                                     // deeper, slower-recovering dip; HIGH = stiffer/shallower. v23.2: the
                                     // RESTING depth is no longer g/k into the gel — gravity is cancelled while
                                     // grounded (the gel supports the weight like a floor) so the rig rests ON
                                     // TOP at the surface; this spring only shapes the dip-and-return.
                                     // v24.125: "the surface" above now means the SINK LINE below —
  var JELLO_RIDE_SINK      = 10;     // px the resting rig BEDS INTO the gel (owner: "major depression").
                                     // The grounded equilibrium in 080 sits this far below the (smoothed)
                                     // gel surface: gravity cancels and the one-sided spring engages
                                     // relative to surface+SINK, so a fresh mount visibly settles DOWN
                                     // into the gel and jelloDeformBowl wraps the bowl around the hull.
                                     // 0 = the v23.2 rest-on-top behaviour, exactly. Containment already
                                     // ignores under-foot vertical contacts while grounded (and TOP_BAND
                                     // is 50px), so the sunken rest rides the proven landing-dip path.
  var JELLO_LAND_DAMP      = 14;     // velocity the slime absorbs catching the fall. Kept near-critical for the
                                     // spring (~2*sqrt(SPRING)) so the rig EASES to rest with no rebound. v22.18:
                                     // 6 -> 14 (6 was badly underdamped, so the catch overshot and bounced).
  var JELLO_RIDE_SMOOTH    = 0.1;    // suspension: low-pass on the surface height the rig rides (per frame).
                                     // LOW = buttery (glides over wobble), HIGH = tracks every jiggle (jolty)
  // ---- Miner ride feel (v22.14): carry + trampoline ----
  var JELLO_CARRY          = 0;      // 0..1 fraction of the supporting cube's HORIZONTAL velocity the rig rides
                                     // with (Celeste/TowerFall solid-vs-actor carry). DISABLED (0) in v23.5:
                                     // these cubes are static squishy terrain, not moving platforms, so riding
                                     // them was net-negative. The rig drove a cube into motion (plow/track-shear),
                                     // then the carry rode that motion back, dragging rig+cube along far past when
                                     // ground friction should have stopped it (the skate-along-an-edge bug). At 0
                                     // the rig drives on a cube like slightly-slippery ground and a moving cube
                                     // slides out from under it. The deadzone, headroom cap and input-gated
                                     // dismount below stay inert as guards in case it is ever re-enabled.
  var JELLO_CARRY_MIN      = 80;     // min blob COM speed (real px/s) before the rig RIDES it. Below this the gel
                                     // is just SETTLING jiggle — largely the rig's own plow/track-shear reflected
                                     // back — not a moving platform; riding it ghost-drifted the parked rig and,
                                     // with the feedback loop, ran the drive speed away. A blob genuinely sliding
                                     // (bomb launch / down a slope) clears this and still carries you.
  // (JELLO_LAND_BOUNCE retired v24.94: the v22.18 first-frame reversal read as a
  // rigid hit, so it shipped at 0 forever. Superseded by JELLO_TRAMPOLINE, which
  // stores the impact and returns it at the EXIT of the dip - see 080's landing.)
  var JELLO_BOUNCE_MIN     = 230;    // min impact speed (px/s) for a landing to store a trampoline rebound.
                                     // Below this it just settles (no pogo off soft touchdowns).

  // ---- Gas pressure / inflation (v19.2 — "blown-up parachute" membrane) ----
  var JELLO_PRESSURE       = 0.28;   // 0..1 trapped-gas resistance to compression. Moderate keeps the very
                                     // soft body "full" (squishy water-balloon, not a collapsing puddle)
                                     // while the soft springs let it deform a lot at constant volume.
  var JELLO_INFLATE        = 1.0;    // target area as a multiple of rest (1 = just hold volume so it
                                     // can droop without collapsing; >1 = puffed taut/bouncy)
  var JELLO_AREA_FLOOR     = 0.45;   // anti-collapse floor: the ring area can never be crushed below this
                                     // fraction of target — past it the boundary eases outward instead of
                                     // collapsing, so it can be MASSIVELY compressed (memory foam) but never
                                     // degenerates into a blow-up. LOW = squishier (more compression allowed),
                                     // 1 = rigid (no squish). The hard containment bounds how far the rig can
                                     // squeeze it, so this is mainly the last-resort no-implode guarantee.
  var JELLO_WEIGHT         = 0;      // px/s down-push under the resting rig. 0 = the rig sits cleanly ON TOP
                                     // of the boundary (no sinking below it). A positive value tries to dimple
                                     // the boundary down, but the gel resists + the render smoothing flattens
                                     // it, so any sink currently reads as clipping — left at 0 until the
                                     // boundary can be made to visibly conform into a bowl.

  // ---- Render tunables (glassy translucent jelly, v19) ----
  var JELLO_RENDER_HUE     = 158;    // base hue (teal) — the default 'slime' type
  // ----- Shade anchors (build time): the lattice points the lighting rides -----
  // Nearest point to a rest-space offset from the rest centroid. The SHEEN anchor sits
  // ~30% up-left of centre (where the legacy bbox sheen lived), the GLINT just above it,
  // two CAUSTIC anchors low-left / mid-right. Picked ONCE from the rest pose, so they
  // translate, lag and slosh with the deformation forever after. O(n) scans, build only.
  function jelloShadeNearest(b, tx, ty) {
    var n = b.n, rx = b.rx, ry = b.ry, best = 0, bestD = 1e18;
    for (var i = 0; i < n; i++) {
      var dx = rx[i] - tx, dy = ry[i] - ty, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function jelloShadeAnchors(b) {
    var n = b.n, rx = b.rx, ry = b.ry;
    var l = 1e18, r = -1e18, t = 1e18, bm = -1e18;
    for (var i = 0; i < n; i++) {
      var x = rx[i], y = ry[i];
      if (x < l) l = x; if (x > r) r = x;
      if (y < t) t = y; if (y > bm) bm = y;
    }
    var hw = (r - l) * 0.5, hh = (bm - t) * 0.5;
    b.rHW = hw; b.rHH = hh;
    b.rMaxR = hw > hh ? hw : hh; if (b.rMaxR < 1) b.rMaxR = 1;
    var cx = b.rcx, cy = b.rcy;                  // rest centroid (jelloComputeRest ran just before)
    b.shineI = jelloShadeNearest(b, cx - hw * 0.30, cy - hh * 0.42);   // big soft sheen
    b.glintI = jelloShadeNearest(b, cx - hw * 0.36, cy - hh * 0.50);   // sharp glint
    b.causI0 = jelloShadeNearest(b, cx - hw * 0.38, cy + hh * 0.10);   // caustic streak A
    b.causI1 = jelloShadeNearest(b, cx + hw * 0.30, cy + hh * 0.30);   // caustic streak B
    b.glintLX = rx[b.glintI]; b.glintLY = ry[b.glintI];                // glint lag follower state
    b.shFrame = -1;                                                    // shade-matrix cache stamp
    b.strain = null; b.strDeg = null; b.strTopI = null; b.strTopE = null; b.strTopN = 0;
  }

  // ----- Jello TYPES (v24.34, Phase 1) -----
  // A jello body carries a `jellyType` string. Phase 1 differentiates types by
  // COLOUR only (the render hue); per-body FEEL overrides + the Noita reactions
  // (right jello in the right liquid = something special) land in follow-up
  // pieces. Tile-sized blobs already work (jelloBuildBody on a single cell), so
  // a "type" is just a stable label + hue carried on the body. Keep the keys
  // stable — reactions + worldgen placement will reference them by name.
  var JELLO_TYPES = {
    slime:  { hue: 158 },   // teal (the original look / default)
    acid:   { hue: 86  },   // lime green
    plasma: { hue: 300 },   // magenta
    ember:  { hue: 18  },   // orange-red
    frost:  { hue: 200 },   // ice blue
    venom:  { hue: 268 }    // violet
  };
  var JELLO_TYPE_KEYS = Object.keys(JELLO_TYPES);
  function jelloHueForType(t) {
    var def = t && JELLO_TYPES[t];
    return def ? def.hue : JELLO_RENDER_HUE;
  }

  // ---- DISSOLVE (v25.53) — enough nearby water turns a slime INTO water ----
  // The owner's design after the v25.50-52 collision generations (buoyancy,
  // tile masks, seep valves, expulsion — all reverted, history in git): a
  // live body that sits near a real BODY of water melts and joins the liquid
  // sim. No coexistence physics to keep honest, no tile-quantized boundary
  // to read wrong, and the "separate layers" question dissolves with it.
  //   TRIGGER: per active body, count mirror particles in DENSE 16-px bins
  //     (>= JELLO_DISSOLVE_DENSE — a ground film or a stray splash droplet
  //     never reads dense) within JELLO_DISSOLVE_R px of the body's bbox,
  //     sustained JELLO_DISSOLVE_DWELL s. One body dissolves at a time.
  //   TRANSITION: a MELT telegraph (~0.5 s: the body wakes, its render hue
  //     eases to water-teal and it goes glassier), then a bottom-up
  //     staggered BURST: each frame the lowest untreated lattice points
  //     each release ~62 water particles (~85% of the sim's 655/tile rest
  //     density) jittered across their cell, inheriting the body's real
  //     velocity; the render clips away below the rising melt line so gel
  //     visibly BECOMES the water that replaces it. One release wake on the
  //     explosion channel + liquidWakeForDig (a settled pond must react) +
  //     a small gel splat, then the body despawns. Spawn is budget-clamped
  //     against LIQUID_MAX_PARTICLES and staggered (~260 adds/frame), so
  //     the op replay and the pressure solver ingest it smoothly.
  // NaN armor: the bin pass drops non-finite mirror entries.
  var JELLO_DISSOLVE       = 1;    // master 0/1 (gm jello.JELLO_DISSOLVE)
  var JELLO_DISSOLVE_R     = 40;   // px beyond the body bbox counted as "near"
  var JELLO_DISSOLVE_N     = 500;  // dense-bin particles within range to trigger
  var JELLO_DISSOLVE_DENSE = 80;   // 16-px bin count that reads as a real water body
                                   // (films/sprays measure 20-60, pond interiors 140+)
  var JELLO_DISSOLVE_DWELL = 0.35; // s the count must hold (no single-frame flukes)
  var JELLO_DISSOLVE_MELT  = 0.7;  // s of colour telegraph before the poof
  var JELLO_DISSOLVE_PPP   = 62;   // particles released per lattice point (~560/tile)
                                   // BEFORE the density scale (see jelloDissolvePoof)
  var jelloWaterBins   = new Map();              // binKey -> slot in the scratch below
  var jelloWaterBinN   = new Float32Array(2048); // particles per bin (2048-bin cap:
                                                 //  overflow bins just read dry, and
                                                 //  the pass is AABB-gated)
  var jelloSplashWakes = [];                     // {cx,cy,r,blast,t0} radial grid wakes
                                                 // (the dissolve release wake channel)
  var jelloSplashTotal = 0;                      // lifetime wake count (dev probe)
  var jelloDissolveTotal = 0;                    // lifetime dissolved bodies (dev probe)
  var jelloDissolving = null;                    // the one body currently melting/bursting
  var JELLO_RENDER_ALPHA   = 0.8;    // overall body opacity (lower = glassier / more see-through)
  var JELLO_REFRACT        = 0.12;   // backdrop lens magnification (0 = off; ~0.1-0.25 = glassy bulge)
  var JELLO_GLOSS          = 0;      // specular sheen + sharp glint strength. SHIPS 0 since v24.160: the
                                     // sheen is a radial highlight CLIPPED to the boundary ring, so over a
                                     // bright background (a slime on the surface) it lit the whole rim and
                                     // read as a bright OUTLINE — exactly what the owner wanted gone, and
                                     // what the flat buried tiles (jelloTileRampCol) never had. At 0 a live
                                     // body is the same flat translucent material as a buried one ("like the
                                     // rest"); refract + shimmer stay on for subtle glassy life (neither
                                     // draws a rim — harness A/B isolated the sheen as the sole outline
                                     // source). Re-dial jello.JELLO_GLOSS for a wet highlight.
  var JELLO_SHIMMER        = 0.18;   // moving internal caustics
  var JELLO_RIM            = 0;      // Fresnel edge (bright + dark rim strokes). SHIPS 0 since v24.121: the
                                     // owner read the stroked edge as a cartoon OUTLINE around the gel and
                                     // vetoed it — the fill's own clipped edge is the silhouette now. Live
                                     // lever jello.JELLO_RIM re-dials it; dev-pen per-body b.rim overrides
                                     // still render their material looks. Was 0.7 through v24.120.
  var JELLO_RENDER_SMOOTH  = 0;      // 0 = crisp straight edges + SHARP corners, 1 = quadratic-smoothed
                                     // curves. SHIPS 0 since v24.121 (owner): the curve pass rounded cube
                                     // corners into balloons; the soft-body-tetris read wants the lattice
                                     // polygon itself (wobble still bends the faces — corners stay
                                     // corners). Was 1.0 from birth through v24.120; lever stays live.
  // ---- EDGE STYLE (v25.27) — the skin treatment, owner-directed ----
  // The silhouette used to be the fill's own hard clipped edge (rim strokes and
  // gloss were vetoed as cartoon OUTLINES, v24.121/v24.160, and stay dead). But
  // under a cram the lattice polygon shows angular KINKS and the crisp clip
  // makes every one obvious (owner: make the edge fuzzy so sharp edges are
  // never clearly visible). The treatment is three stacked render-only moves,
  // none of which re-introduces a vetoed look:
  //   - a single Chaikin pass CHAMFERS the drawn ring (~3px off each corner;
  //     NOT the v24.121 balloon rounding — corners still read as corners),
  //   - a layered SAME-COLOUR fringe diffuses the edge over ~7px (translucent
  //     body hue, alpha stepping down outward — never a bright drawn line),
  //   - deterministic "peach fuzz" hairs along the outward normals, seeded per
  //     ring slot + body so the coat is stable frame-to-frame (no shimmer).
  // Styles (dev 'I' cycles; gm 'jello.JELLO_EDGE_STYLE'; URL ?jelloedge=N):
  //   0 CLASSIC (pre-v25.27 hard edge)  1 SOFT (chamfer + fringe)
  //   2 FUZZY (SOFT + hair coat)        3 PLUSH (longer, denser coat)
  // Physics, contacts and probes never read the drawn ring — zero sim risk.
  // SHIPS 1 = SOFT since v25.28: the owner vetoed the peach-fuzz hairs for the
  // ship look ("don't like the little hairs coming off of it"). FUZZY/PLUSH
  // stay behind the dev 'I' cycle only.
  var JELLO_EDGE_STYLE = 1;
  var JELLO_EDGE_FUZZ  = 1.0;   // fringe + hair scale (0.5 subtle .. 2 heavy)
  (function () {
    var m = /[?&]jelloedge=(\d)/.exec((window.location && window.location.search) || '');
    if (m) JELLO_EDGE_STYLE = +m[1] > 3 ? 3 : +m[1];
  })();
  // Compatibility no-op render vars (still gm-registered; unused by this model).
  var JELLO_ISO            = 0.40;
  var JELLO_METABALL_RADIUS = 12;
  var JELLO_RENDER_CELL    = 6;
  // Debug overlay: draws the lattice POINTS (dots) + the spring GRID (lines) over the gel.
  // OFF by default. Even when on, the draw is gated on devMode (see jelloDrawBody), so it
  // only ever shows in dev mode. The J hotkey toggles it within dev mode;
  // gm.set('jello.JELLO_DEBUG_PARTICLES', 1) turns it on.
  var JELLO_DEBUG_PARTICLES = 0;

  // ---- PHYSICS-ANCHORED SHADING (v24.96) — the lighting rides the solver ----
  // Legacy (JELLO_SHADE = 0): sheen + glint hang off the BBOX centre, caustics slide on a
  // performance.now() sine, subsurface glow sits at the bbox centre, so a wobbling body's
  // lighting sat STILL while the gel moved. JELLO_SHADE = 1 anchors every feature to the
  // sim: sheen + glint ride interior lattice points chosen at build (the glint on a lag
  // follower, liquid-style), the caustic streaks slide with the anchors' real deformation
  // offset vs the rigidly-rotated rest pose (still body = still light), a per-point strain
  // field tints the k most-strained boundary spots (compression = bright + saturated,
  // stretch = dark + desaturated), and the sheen ellipse is rotated + squashed by the
  // shape-match best fit so squash-stretch shows in the highlight. Canvas-2D gradients
  // only, bounded per body, zero feedback into the sim (shading only READS positions).
  var JELLO_SHADE               = 1;     // master: 0 = legacy bbox/timer shading, 1 = physics-anchored
  var JELLO_SHADE_LAG           = 0.22;  // glint follower ease per frame (0..1; lower = longer liquid
                                         // trail, 1 = pinned to its anchor). Visual-only smoothing.
  var JELLO_SHADE_CAUSTIC       = 4;     // px of caustic slide per px of anchor deformation (0 = parked).
                                         // Was 9 through v25.27: anchor deviation is NOISY during motion
                                         // and settling (~0.5-3px per frame), and x9 turned that into
                                         // 10-25px streak JUMPS per frame — the owner's "whole thing
                                         // flashes quickly and often". 4 + the eased follower (see the
                                         // shimmer block) reads as a calm slosh; clamped to the body.
  var JELLO_SHADE_STRAIN        = 0;     // strain-hotspot strength (0 = off). SHIPS 0 since v25.28
                                         // (owner: the compression/stretch spots read as rapid FLICKER
                                         // — settling micro-jiggle rides the STRAIN_MIN threshold, so
                                         // the spots pulse in and out as a body moves or settles).
                                         // Lever jello.JELLO_SHADE_STRAIN re-dials the effect.
  var JELLO_SHADE_STRAIN_K      = 3;     // max hotspots per body (the k most-strained ring points). 0-4.
  var JELLO_SHADE_SQUASH        = 0.8;   // 0..1 how much best-fit squash/rotation deforms the sheen
                                         // ellipse (0 = round sheen as before, 1 = full squash-stretch).
  var JELLO_SHADE_STRAIN_MIN    = 0.035; // |mean edge strain| a ring point needs before it draws a
                                         // hotspot; under this is idle jiggle (settled bodies cost 0).
  var JELLO_SHADE_SQUASH_MAX    = 1.5;   // hard cap on the sheen ellipse stretch (and 1/cap squeeze).
  var JELLO_SHADE_STRAIN_SMOOTH = 0.35;  // per-frame ease of the strain field (kills flicker).
  var jelloFrameNo              = 0;     // sim frame counter; stamps the shape-match shade cache.

  // ---- IMPACT RIPPLES (render-space ring wave, v24.95) ----
  // A displacement wave that travels around the boundary ring on every impact —
  // landings, world hits, bombs, jet wash, flings, body-body knocks. PURE RENDER:
  // it offsets only the DRAWN skin (jelloRingBake) along the local outward normal,
  // on top of the existing contact outset. Physics, contacts, probes and
  // containment never see it — zero sim risk. 1D damped wave equation on the
  // closed ring (leapfrog, CFL-clamped); injections are pure-displacement cosine
  // bumps, which d'Alembert-split into two half waves traveling BOTH ways around
  // the ring. At JELLO_RIPPLE = 0 the system no-ops end to end: injections early-
  // return, the wave step never runs, and the skin draws the TRUE ring.
  var JELLO_RIPPLE          = 0;      // master 0..1 — scales the drawn ripple. SHIPS 0 since v24.121
                                      // (owner): playing with a cube layered injections into a standing
                                      // multi-bump wave (the "super wavy shaky" state — live-measured
                                      // ±3-4.5px while the PHYSICS ring stayed near-perfect), and the
                                      // v24.114 sleep/TTL hard-clears then snapped the skin flat
                                      // mid-ring ("stops as if turned off"). Three gates (v24.102 body-
                                      // motion, v24.114 sleep-clear + TTL) band-aided it; the honest fix
                                      // is that the LATTICE already carries real deformation, so the
                                      // skin wave is opt-in juice: raise jello.JELLO_RIPPLE live to
                                      // audition it, feel presets ship it 0 across the board.
  var JELLO_RIPPLE_SPEED    = 340;    // wave speed ALONG the skin, px/s (a 1-tile cube ring laps in ~0.4s).
                                      // Internally CFL-clamped to 0.85*ds/sdt, so any value is stable.
  var JELLO_RIPPLE_DAMP     = 0.05;   // per-SECOND wave-velocity retention (0.001 = dies instantly,
                                      // 0.3 = long ring-down). Applied as pow(damp, stepDt).
  var JELLO_RIPPLE_MAX      = 5;      // px amplitude clamp. Also capped at outset + 0.35*r so the drawn
                                      // skin can dent but never invert through the raw ring.
  var JELLO_RIPPLE_VMIN     = 90;     // min impact speed (REAL px/s) that injects — resting contact is
                                      // ~5 px/s of gravity bite per substep, far below; it injects nothing.
  var JELLO_RIPPLE_VREF     = 480;    // impact speed (real px/s) that maps to FULL amplitude.
  var JELLO_RIPPLE_BUMP_W   = 2;      // injection bump half-width, ring vertices (cosine profile).
  var JELLO_RIPPLE_JET_PERIOD = 0.09; // s between jet-wash churn injections while raking gel.
  var JELLO_RIPPLE_TTL      = 3;      // s a field may ring CONTINUOUSLY before the watchdog clears it
                                      // (see jelloRippleFrame). Real impacts die in <1.5 s; only a
                                      // pathological re-arm loop (rig parked on gel, settling pile)
                                      // ever reaches this. Jet churn resets the clock by design.
  var jelloStepH            = JELLO_H; // current sim substep h (set each frame in updateJello) — converts
                                       // per-substep Verlet velocities to real px/s at injection sites.

  // Sync the derived stiffnesses to the starting JELLO_E.
  jelloRecomputeMaterial();

  // ---- Live bodies + splats ----
  var jelloBodies  = [];    // array of soft-body objects
  var jelloCount   = 0;     // total live lattice points (perf overlay reads this)
  var jelloSplats  = [];    // short-lived "blorp" splat particles
  var jelloAccum   = 0;     // substep time accumulator
  // Live metrics (read by the dev perf panel only; reset/updated each frame in updateJello).
  var jelloLastSubs     = 0;   // substeps run last frame (sim catch-up load)
  var jelloMaxVsq       = 0;   // max point speed^2 across all bodies, (px/s)^2 — the blow-up gauge
  var jelloSepThisFrame = 0;   // body<->body separations applied this frame (anti-merge activity)

  // ----- Reset -----
  function resetJello() {
    jelloBodies.length = 0;
    jelloSplats.length = 0;
    jelloCount = 0;
    jelloAccum = 0;
    // Dissolve state (v25.53): a world rebuild must not leave a stale wake
    // pushing the new world's water or a ghost body mid-melt.
    if (jelloWaterBins.size) jelloWaterBins.clear();
    jelloSplashWakes.length = 0;
    jelloDissolving = null;
  }

  function jelloTotalPoints() {
    var n = 0;
    for (var i = 0; i < jelloBodies.length; i++) n += jelloBodies[i].n;
    return n;
  }

  // Tile solid test for jello point collision.
  function jelloWorldSolidAt(x, y) {
    // Corrupt (non-finite) coordinates read as OPEN, never as a crash or a phantom
    // wall: collision math on a NaN point is meaningless anyway, and the per-point
    // heal + the finite sweep own the recovery. (Callers like jelloCollideRingEdges
    // probe MIDPOINTS that skip the per-point heal, so this is their only guard.)
    if (!isFinite(x) || !isFinite(y)) return false;
    var row = Math.floor(y / TILE);
    var col = Math.floor(x / TILE);
    return tileAt(row, col) !== null;
  }

  // ===== Shape-matching helpers ====================================

  // (Re)compute a body's rest-shape data: rest centroid, rest offsets q,
  // and invAqq = inverse of sum(q q^T). Called at build + after plastic flow.
  function jelloComputeRest(b) {
    var n = b.n, rx = b.rx, ry = b.ry;
    var cx = 0, cy = 0;
    for (var i = 0; i < n; i++) { cx += rx[i]; cy += ry[i]; }
    cx /= n; cy /= n;
    b.rcx = cx; b.rcy = cy;
    var qx = b.qx, qy = b.qy;
    var Aqq00 = 0, Aqq01 = 0, Aqq11 = 0;
    for (var j = 0; j < n; j++) {
      var x = rx[j] - cx, y = ry[j] - cy;
      qx[j] = x; qy[j] = y;
      Aqq00 += x * x; Aqq01 += x * y; Aqq11 += y * y;
    }
    var det = Aqq00 * Aqq11 - Aqq01 * Aqq01;
    if (Math.abs(det) < 1e-6) {
      // Degenerate (colinear) — fall back to rigid-only shape matching.
      b.invAqq00 = 1; b.invAqq01 = 0; b.invAqq10 = 0; b.invAqq11 = 1;
      b.rigidOnly = true;
    } else {
      var inv = 1 / det;
      b.invAqq00 =  Aqq11 * inv;
      b.invAqq01 = -Aqq01 * inv;
      b.invAqq10 = -Aqq01 * inv;
      b.invAqq11 =  Aqq00 * inv;
      b.rigidOnly = false;
    }
  }

  // Public control seam for future slime actors. An intent describes bulk
  // motion and a smooth target pose. It never mentions solver points, springs,
  // or a particular body topology, so round, tiled, triangular, and later
  // authored silhouettes can share the same locomotion and behavior code.
  function jelloActorFor(b) {
    if (!b) return null;
    if (!b.actor) {
      b.actor = {
        enabled: false,
        moveX: 0, moveY: 0, hasMoveY: false,
        speed: 120, accel: 900, follow: 12,
        jump: 0,
        poseX: 1, poseY: 1, poseFollow: 9,
        wobble: 0, phase: 0, phaseSpeed: 0,
        state: 'idle'
      };
    }
    return b.actor;
  }

  function jelloSetActorIntent(b, intent) {
    var a = jelloActorFor(b);
    if (!a) return null;
    intent = intent || {};
    a.enabled = intent.enabled === undefined ? true : !!intent.enabled;
    if (isFinite(intent.moveX)) a.moveX = Math.max(-1, Math.min(1, intent.moveX));
    if (isFinite(intent.moveY)) {
      a.moveY = Math.max(-1, Math.min(1, intent.moveY));
      a.hasMoveY = true;
    }
    if (intent.moveY === null) a.hasMoveY = false;
    if (isFinite(intent.speed)) a.speed = Math.max(0, intent.speed);
    if (isFinite(intent.accel)) a.accel = Math.max(0, intent.accel);
    if (isFinite(intent.follow)) a.follow = Math.max(0, intent.follow);
    if (isFinite(intent.jump) && intent.jump > 0) a.jump = intent.jump;
    if (isFinite(intent.poseX)) a.poseX = Math.max(0.55, Math.min(1.8, intent.poseX));
    if (isFinite(intent.poseY)) a.poseY = Math.max(0.55, Math.min(1.8, intent.poseY));
    if (isFinite(intent.poseFollow)) a.poseFollow = Math.max(0, intent.poseFollow);
    if (isFinite(intent.wobble)) a.wobble = Math.max(0, Math.min(0.28, intent.wobble));
    if (isFinite(intent.phaseSpeed)) a.phaseSpeed = intent.phaseSpeed;
    if (typeof intent.state === 'string') a.state = intent.state;
    if (a.enabled) { b.sleeping = false; b.sleepFrames = 0; b.frozen = false; }
    return a;
  }

  function jelloClearActorIntent(b) {
    var a = jelloActorFor(b);
    if (!a) return;
    a.enabled = false;
    a.moveX = 0; a.moveY = 0; a.hasMoveY = false; a.jump = 0;
    a.poseX = 1; a.poseY = 1; a.wobble = 0; a.phaseSpeed = 0;
    a.state = 'idle';
    b.poseSX = 1; b.poseSY = 1;
  }

  function jelloActuateBody(b, h) {
    var a = b.actor;
    if (!a || !a.enabled || b._carried || !(h > 0)) return;
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var vx = 0, vy = 0;
    for (var i = 0; i < n; i++) {
      vx += (px[i] - ox[i]) / h;
      vy += (py[i] - oy[i]) / h;
    }
    vx /= n; vy /= n;
    var gain = Math.min(1, a.follow * h);
    var dvx = (a.moveX * a.speed - vx) * gain;
    var dvy = a.hasMoveY ? (a.moveY * a.speed - vy) * gain : 0;
    var dvCap = a.accel * h;
    var dv = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dv > dvCap && dv > 1e-8) { dvx *= dvCap / dv; dvy *= dvCap / dv; }
    if (a.jump > 0) { dvy -= a.jump; a.jump = 0; }
    for (i = 0; i < n; i++) {
      ox[i] -= dvx * h;
      oy[i] -= dvy * h;
    }
    a.phase += a.phaseSpeed * h;
    var pulse = 1 + Math.sin(a.phase) * a.wobble;
    var targetX = Math.max(0.55, Math.min(1.8, a.poseX * pulse));
    var targetY = Math.max(0.55, Math.min(1.8, a.poseY / pulse));
    var poseGain = Math.min(1, a.poseFollow * h);
    b.poseSX = (b.poseSX || 1) + (targetX - (b.poseSX || 1)) * poseGain;
    b.poseSY = (b.poseSY || 1) + (targetY - (b.poseSY || 1)) * poseGain;
    b.sleeping = false; b.sleepFrames = 0;
  }

  // Apply a whole-body launch in REAL world px/s. Solver velocity runs on the
  // slowed material clock, so translating input directly into Verlet history
  // under-shoots by JELLO_TIMESCALE. Keeping this conversion here gives the
  // pointer, future NPC jumps, water play, and scripted interactions one honest
  // launch path. A temporary per-body ceiling admits the rigid flight without
  // raising the normal cap that prevents confined internal-energy blowups. The
  // higher ceiling clears on first terrain contact or once speed falls below the
  // ordinary material limit.
  function jelloLaunchBody(b, vx, vy, opts) {
    if (!b || !(b.n > 0) || !isFinite(vx + vy)) return null;
    opts = opts || {};
    var ts = Math.max(0.02, JELLO_TIMESCALE || 0.5);
    var h = isFinite(opts.h) && opts.h > 1e-6 ? opts.h : JELLO_H;
    var blend = isFinite(opts.blend) ? Math.max(0, Math.min(1, opts.blend)) : 1;
    var maxSpeed = isFinite(opts.maxSpeed) ? Math.max(0, opts.maxSpeed) : 1400;
    var maxPointSpeed = isFinite(opts.maxPointSpeed) ? Math.max(maxSpeed, opts.maxPointSpeed) : 1600;
    var omega = isFinite(opts.omega) ? opts.omega : 0;
    var maxOmega = isFinite(opts.maxOmega) ? Math.max(0, opts.maxOmega) : 8;
    if (omega > maxOmega) omega = maxOmega; else if (omega < -maxOmega) omega = -maxOmega;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxSpeed && speed > 1e-9) {
      var scale = maxSpeed / speed;
      vx *= scale; vy *= scale; speed = maxSpeed;
    }
    var keep = 1 - blend;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var cx = isFinite(b.cx) ? b.cx : 0, cy = isFinite(b.cy) ? b.cy : 0;
    for (var i = 0; i < b.n; i++) {
      var currentX = (px[i] - ox[i]) / h * ts;
      var currentY = (py[i] - oy[i]) / h * ts;
      var rx = px[i] - cx, ry = py[i] - cy;
      var targetX = vx - omega * ry;
      var targetY = vy + omega * rx;
      var outX = currentX * keep + targetX * blend;
      var outY = currentY * keep + targetY * blend;
      var pointSpeed = Math.sqrt(outX * outX + outY * outY);
      if (pointSpeed > maxPointSpeed && pointSpeed > 1e-9) {
        var pointScale = maxPointSpeed / pointSpeed;
        outX *= pointScale; outY *= pointScale;
      }
      ox[i] = px[i] - (outX / ts) * h;
      oy[i] = py[i] - (outY / ts) * h;
    }
    b._launchVMax = maxPointSpeed / ts;
    b._launchHit = false;
    b.sleeping = false; b.sleepFrames = 0; b.frozen = false;
    b._plyMs = performance.now();
    return { vx: vx, vy: vy, speed: speed, omega: omega };
  }

  // Install a triangle HEALTH mesh from the spring graph. The round and
  // equilateral builders are already fully triangulated by their springs, but
  // historically did not retain explicit triangle topology, so the inversion
  // healer had no way to see a mirrored cell. Enumerating local 3-cycles is a
  // one-time build cost. The mesh is marked health-only so switching the dev
  // solver to FEM still falls back to XPBD for these special bodies, preserving
  // their established material feel.
  function jelloInstallSpringHealthMesh(b) {
    var n = b.n, adj = new Array(n), edge = Object.create(null), i;
    for (i = 0; i < n; i++) adj[i] = [];
    for (var s = 0; s < b.springN; s++) {
      var ea = b.sA[s], eb = b.sB[s];
      if (ea === eb) continue;
      var lo = ea < eb ? ea : eb, hi = ea < eb ? eb : ea;
      var ek = lo * n + hi;
      if (edge[ek]) continue;
      edge[ek] = 1;
      adj[ea].push(eb); adj[eb].push(ea);
    }
    var ta = [], tb = [], tc = [], dm = [], area = [];
    for (i = 0; i < n; i++) {
      var ai = adj[i];
      for (var u = 0; u < ai.length; u++) {
        var j = ai[u]; if (j <= i) continue;
        for (var v = u + 1; v < ai.length; v++) {
          var k = ai[v]; if (k <= i || k === j) continue;
          var j0 = j < k ? j : k, k0 = j < k ? k : j;
          if (!edge[j0 * n + k0]) continue;
          var m00 = b.rx[j0] - b.rx[i], m01 = b.rx[k0] - b.rx[i];
          var m10 = b.ry[j0] - b.ry[i], m11 = b.ry[k0] - b.ry[i];
          var det = m00 * m11 - m01 * m10;
          if (det < 1e-6 && det > -1e-6) continue;
          var inv = 1 / det;
          ta.push(i); tb.push(j0); tc.push(k0);
          dm.push(m11 * inv, -m01 * inv, -m10 * inv, m00 * inv);
          area.push(Math.abs(det) * 0.5);
        }
      }
    }
    b.triA = Int32Array.from(ta); b.triB = Int32Array.from(tb); b.triC = Int32Array.from(tc);
    b.triDmInv = Float32Array.from(dm); b.triRestArea = Float32Array.from(area);
    b.triN = ta.length;
    b.triLambda = new Float32Array(b.triN * 2);
    b.triHealthOnly = true;
  }

  // ===== Build a soft body from a set of tile cells ================
  // cells: array of {r, c}. Returns the body (also pushed to jelloBodies),
  // or null if the budget is exhausted / the cluster is empty.
  function jelloBuildBody(cells, jellyType) {
    if (!cells || !cells.length) return null;
    if (jelloBodies.length >= JELLO_MAX_BODIES) return null;

    // Tile bbox.
    var minR = 1e9, maxR = -1e9, minC = 1e9, maxC = -1e9;
    for (var i = 0; i < cells.length; i++) {
      var r = cells[i].r, c = cells[i].c;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
    var TW = maxC - minC + 1;   // tile columns
    var TH = maxR - minR + 1;   // tile rows
    // Per-body lattice density: tier by spawn size, never below the JELLO_NPT
    // base, stepped back down if the finer lattice would blow the point budget
    // ((TW*NPT+1)*(TH*NPT+1) is an exact bound for a filled rect and an upper
    // bound for any polyomino subset of it).
    var NPT = JELLO_NPT;
    var tierNpt = (cells.length <= JELLO_NPT_SMALL_CELLS) ? JELLO_NPT_SMALL
                : (cells.length <= JELLO_NPT_MED_CELLS)   ? JELLO_NPT_MED
                : JELLO_NPT;
    if (tierNpt > NPT) NPT = tierNpt;
    while (NPT > JELLO_NPT &&
           jelloCount + (TW * NPT + 1) * (TH * NPT + 1) > JELLO_MAX_POINTS) NPT--;
    if (NPT < 2) NPT = 2;
    var h = TILE / NPT;         // node spacing (world px)
    var NX = TW * NPT;          // node-cell columns (nodes are 0..NX inclusive)
    var NY = TH * NPT;          // node-cell rows
    var originX = minC * TILE;
    var originY = minR * TILE;

    // Occupied-tile lookup.
    var occ = {};
    for (var oi = 0; oi < cells.length; oi++) {
      occ[(cells[oi].r) * 4096 + cells[oi].c] = true;
    }
    function cellOccupied(a, bcol) {       // node-cell (a in [0,NX), bcol in [0,NY))
      if (a < 0 || a >= NX || bcol < 0 || bcol >= NY) return false;
      var tc = minC + ((a / NPT) | 0);
      var tr = minR + ((bcol / NPT) | 0);
      return occ[tr * 4096 + tc] === true;
    }
    function nodePresent(ni, nj) {         // node (ni in [0,NX], nj in [0,NY])
      return cellOccupied(ni - 1, nj - 1) || cellOccupied(ni, nj - 1) ||
             cellOccupied(ni - 1, nj)     || cellOccupied(ni, nj);
    }

    // Assign a point index to every present node.
    var stride = NY + 1;
    var nodeIndex = new Int32Array((NX + 1) * stride);
    for (var z = 0; z < nodeIndex.length; z++) nodeIndex[z] = -1;
    var pts = [];   // {x,y} rest positions, world px
    for (var ni = 0; ni <= NX; ni++) {
      for (var nj = 0; nj <= NY; nj++) {
        if (!nodePresent(ni, nj)) continue;
        if (jelloCount + pts.length >= JELLO_MAX_POINTS) break;
        nodeIndex[ni * stride + nj] = pts.length;
        pts.push({ x: originX + ni * h, y: originY + nj * h });
      }
    }
    var n = pts.length;
    if (n < 4) return null;   // too small to be a body

    // Allocate body arrays.
    var b = {
      n: n,
      px: new Float64Array(n), py: new Float64Array(n),   // current position (F64: at world x ~ 1e5 the F32
      ox: new Float64Array(n), oy: new Float64Array(n),   // grid is 1/128 px; sub-ULP solver corrections rounded
                                                          // into 1-ULP/substep phantom drifts that pinned sleep)
      rx: new Float32Array(n), ry: new Float32Array(n),   // rest position (world, at build)
      qx: new Float32Array(n), qy: new Float32Array(n),   // rest offset from rest centroid
      sA: null, sB: null, sRest: null, springN: 0,        // springs
      ring: null, ringN: 0, ringPos: null, ringSign: 1,   // ordered boundary + point->ring slot + winding
      rippleU: null, rippleP: null, rippleOn: false, rippleCd: 0,   // impact-ripple ring wave (lazy)
      vx: 0, vy: 0,                                        // body mean velocity (px/s)
      npt: NPT, spacing: h,                                // per-body lattice density (build facts)
      cr: JELLO_CONTACT_R_FRAC * h, selfMin2: 0,           // live per-frame radii (refreshed in updateJello)
      bboxL: 0, bboxR: 0, bboxT: 0, bboxB: 0,
      sleeping: false, sleepFrames: 0, frozen: false,
      tileW: 0, tileH: 0,                                  // cluster extents in tiles (gap-fit test)
      hue: jelloHueForType(jellyType),
      jellyType: jellyType || 'slime'
    };
    b.tileW = TW; b.tileH = TH;
    // Retained for save/load (jelloSaveBodies): the original cluster cells rebuild the
    // SAME lattice on restore. <= JELLO_MAX_CELLS entries, so the retention is trivial.
    b.cells = cells;
    for (var p = 0; p < n; p++) {
      b.px[p] = b.ox[p] = b.rx[p] = pts[p].x;
      b.py[p] = b.oy[p] = b.ry[p] = pts[p].y;
    }
    // Seed the bbox from the rest positions NOW. Without this it stays (0,0,0,0)
    // until the first sim tick — but jelloBodyOnCamera + the draw cull both read
    // the bbox, so a freshly-built body would look like it's at world origin,
    // get frozen + culled, and never run its first tick to fix the bbox. That's
    // the "cube only appears after I drive away and back" bug. Seed it here.
    b.bboxL = originX; b.bboxT = originY;
    b.bboxR = originX + NX * h; b.bboxB = originY + NY * h;
    // Centroid seed: jelloUpdateBody refreshes it every tick, but a body built and
    // BOMBED in the same synchronous pass (blast activates the cluster, then
    // jelloBombShove reads b.cx for the ripple direction) would otherwise see
    // undefined -> NaN amplitude -> the activation ripple silently dropped.
    b.cx = (b.bboxL + b.bboxR) * 0.5; b.cy = (b.bboxT + b.bboxB) * 0.5;

    // ---- Springs ----  (sType: 0 = structural edge, 1 = cell-diagonal shear)
    var sA = [], sB = [], sRest = [], sType = [];
    function addSpring(i0, i1, type) {
      if (i0 < 0 || i1 < 0) return;
      var dx = b.rx[i0] - b.rx[i1], dy = b.ry[i0] - b.ry[i1];
      sA.push(i0); sB.push(i1); sRest.push(Math.sqrt(dx * dx + dy * dy)); sType.push(type);
    }
    for (var gi = 0; gi <= NX; gi++) {
      for (var gj = 0; gj <= NY; gj++) {
        var idx = nodeIndex[gi * stride + gj];
        if (idx < 0) continue;
        // Structural: right + down neighbours.
        if (gi < NX) addSpring(idx, nodeIndex[(gi + 1) * stride + gj], 0);
        if (gj < NY) addSpring(idx, nodeIndex[gi * stride + (gj + 1)], 0);
        // Shear: both diagonals of an occupied node-cell anchored at (gi,gj).
        if (gi < NX && gj < NY && cellOccupied(gi, gj)) {
          addSpring(idx,                              nodeIndex[(gi + 1) * stride + (gj + 1)], 1);
          addSpring(nodeIndex[(gi + 1) * stride + gj], nodeIndex[gi * stride + (gj + 1)], 1);
        }
      }
    }
    b.sA = Int32Array.from(sA);
    b.sB = Int32Array.from(sB);
    b.sRest = Float32Array.from(sRest);
    b.sType = Int8Array.from(sType);
    b.springN = sA.length;
    b.sLambda = new Float32Array(b.springN);   // XPBD per-constraint multipliers (reset each substep)
    b.tris = null;                              // FEM triangle mesh (built lazily on first fem use)

    // ---- Boundary ring (fixed topology — traced once here) ----
    // Collect boundary edges: a side of an occupied node-cell whose neighbour
    // across that side is empty. Edge endpoints are node ids; chain them into
    // one loop (every boundary node of a simply-connected 4-connected region
    // has degree exactly 2).
    var adj = {};   // nodeId -> [neighbourNodeId, ...]
    function nodeId(ni2, nj2) { return ni2 * stride + nj2; }
    function addEdge(idA, idB) {
      if (!adj[idA]) adj[idA] = [];
      if (!adj[idB]) adj[idB] = [];
      adj[idA].push(idB);
      adj[idB].push(idA);
    }
    for (var ca = 0; ca < NX; ca++) {
      for (var cb = 0; cb < NY; cb++) {
        if (!cellOccupied(ca, cb)) continue;
        if (!cellOccupied(ca, cb - 1)) addEdge(nodeId(ca, cb),     nodeId(ca + 1, cb));     // top
        if (!cellOccupied(ca + 1, cb)) addEdge(nodeId(ca + 1, cb), nodeId(ca + 1, cb + 1)); // right
        if (!cellOccupied(ca, cb + 1)) addEdge(nodeId(ca + 1, cb + 1), nodeId(ca, cb + 1)); // bottom
        if (!cellOccupied(ca - 1, cb)) addEdge(nodeId(ca, cb + 1), nodeId(ca, cb));         // left
      }
    }
    // Walk the loop. Start at any boundary node.
    var ring = [];
    var startId = -1;
    for (var key in adj) { startId = +key; break; }
    if (startId >= 0) {
      var used = {};
      var curId = startId, prevId = -1, guard = 0;
      var maxRing = (NX + 1) * (NY + 1) * 2 + 8;
      while (guard++ < maxRing) {
        var pidx = nodeIndex[curId];
        if (pidx >= 0) ring.push(pidx);
        var nbrs = adj[curId];
        var nextId = -1;
        if (nbrs) {
          for (var qn = 0; qn < nbrs.length; qn++) {
            var cand = nbrs[qn];
            var ekey = (curId < cand ? curId : cand) * 8388608 + (curId < cand ? cand : curId);
            if (used[ekey]) continue;
            if (cand === prevId && nbrs.length > 1) continue;
            nextId = cand;
            used[ekey] = true;
            break;
          }
          if (nextId < 0) {
            // fall back: take any neighbour that isn't where we came from
            for (var qn2 = 0; qn2 < nbrs.length; qn2++) {
              if (nbrs[qn2] !== prevId) { nextId = nbrs[qn2]; break; }
            }
          }
        }
        if (nextId < 0 || nextId === startId) break;
        prevId = curId;
        curId = nextId;
      }
    }
    // Ensure CCW winding (positive signed area in screen space y-down -> CW is
    // positive, but winding only matters for consistency, not correctness here).
    b.ring = Int32Array.from(ring);
    // Point index -> ring slot (for impact-ripple injection at a colliding point).
    b.ringPos = new Int32Array(n);
    for (var rp = 0; rp < n; rp++) b.ringPos[rp] = -1;
    b.ringN = ring.length;
    for (var rk = 0; rk < b.ringN; rk++) b.ringPos[b.ring[rk]] = rk;

    // Rest area (shoelace over the rest ring) — the target for the gas-pressure
    // model that makes the body a taut, slightly over-inflated membrane.
    var ra = 0, rPrev = b.ring[b.ringN - 1];
    var raPX = b.rx[rPrev], raPY = b.ry[rPrev];
    for (var rai = 0; rai < b.ringN; rai++) {
      var rCur = b.ring[rai];
      var raCX = b.rx[rCur], raCY = b.ry[rCur];
      ra += raPX * raCY - raCX * raPY;
      raPX = raCX; raPY = raCY;
    }
    b.restArea = Math.abs(ra) * 0.5;
    b.ringSign = ra >= 0 ? 1 : -1;   // traced winding is arbitrary (see jelloVolumeXPBD) — freeze it here

    // ---- FEM triangle mesh: 2 triangles per occupied node-cell, over the lattice nodes.
    // Used by the 'fem' solver (Stable Neo-Hookean). Each triangle stores its rest inverse
    // matrix Dm^-1 (row-major a,b,c,d) and rest area, from the REST positions. Cheap, built
    // once here so any body can run the fem solver live. (jelloBuildTriangle bodies have no
    // mesh -> jelloSolveFEM falls back to XPBD for them.)
    var triA = [], triB = [], triC = [], triDm = [], triArea = [];
    function pushTri(ia, ib, ic) {
      if (ia < 0 || ib < 0 || ic < 0) return;
      var ax = b.rx[ia], ay = b.ry[ia];
      var m00 = b.rx[ib] - ax, m01 = b.rx[ic] - ax;   // Dm = [[e1x,e2x],[e1y,e2y]]
      var m10 = b.ry[ib] - ay, m11 = b.ry[ic] - ay;
      var det = m00 * m11 - m01 * m10;
      if (det < 1e-6 && det > -1e-6) return;          // degenerate triangle
      var inv = 1 / det;
      triDm.push(m11 * inv, -m01 * inv, -m10 * inv, m00 * inv);   // Dm^-1 row-major
      triArea.push(Math.abs(det) * 0.5);
      triA.push(ia); triB.push(ib); triC.push(ic);
    }
    for (var cca = 0; cca < NX; cca++) {
      for (var ccb = 0; ccb < NY; ccb++) {
        if (!cellOccupied(cca, ccb)) continue;
        var n00 = nodeIndex[cca * stride + ccb],         n10 = nodeIndex[(cca + 1) * stride + ccb];
        var n11 = nodeIndex[(cca + 1) * stride + (ccb + 1)], n01 = nodeIndex[cca * stride + (ccb + 1)];
        pushTri(n00, n10, n11);   // lower-right triangle
        pushTri(n00, n11, n01);   // upper-left triangle
      }
    }
    b.triA = Int32Array.from(triA); b.triB = Int32Array.from(triB); b.triC = Int32Array.from(triC);
    b.triDmInv = Float32Array.from(triDm); b.triRestArea = Float32Array.from(triArea);
    b.triN = triA.length;
    b.triLambda = new Float32Array(b.triN * 2);   // [deviatoric, hydrostatic] per triangle
    b.triHealthOnly = false;

    jelloComputeRest(b);
    jelloShadeAnchors(b);   // physics-anchored shading: pick the lighting's lattice anchors
    jelloBodies.push(b);
    jelloCount = jelloTotalPoints();
    return b;
  }

  // ===== Activation: flood-fill a cluster, build a body, clear tiles ======
  function activateJelloCluster(r0, c0) {
    if (!world[r0] || !world[r0][c0] || world[r0][c0].type !== 'jello') return;
    var cells = [];
    var inSet = {};
    var stack = [{ r: r0, c: c0 }];
    inSet[r0 * 4096 + c0] = true;
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (stack.length && cells.length < JELLO_MAX_CELLS) {
      var cur = stack.pop();
      cells.push(cur);
      for (var i = 0; i < 4; i++) {
        var nr = cur.r + dirs[i][0], nc = cur.c + dirs[i][1];
        var k = nr * 4096 + nc;
        if (inSet[k]) continue;
        if (world[nr] && world[nr][nc] && world[nr][nc].type === 'jello') {
          inSet[k] = true;
          stack.push({ r: nr, c: nc });
        }
      }
    }
    if (!cells.length) return;

    // Birth splat centroid.
    var cxSplat = 0, cySplat = 0;
    for (var ci2 = 0; ci2 < cells.length; ci2++) {
      cxSplat += cells[ci2].c * TILE + TILE * 0.5;
      cySplat += cells[ci2].r * TILE + TILE * 0.5;
    }
    cxSplat /= cells.length; cySplat /= cells.length;

    // Carry the placed tile's jello type onto the body (read before the tiles
    // are nulled below). A tile-sized blob is one cell, so cells[0] is correct;
    // null/absent type falls back to the default 'slime'.
    var jt0 = (world[cells[0].r] && world[cells[0].r][cells[0].c]) ? world[cells[0].r][cells[0].c].jellyType : null;
    // A per-tile MATERIAL override (set by the dev test pen) rides on the seed
    // tile so a buried designer-slime keeps its look when mined open. Read before
    // the tiles are nulled below; applied to the body after build. Appearance
    // only (jelloDrawBody reads these) — the SIM is identical.
    var jm0 = (world[cells[0].r] && world[cells[0].r][cells[0].c]) ? world[cells[0].r][cells[0].c].jelloMat : null;
    var body = jelloBuildBody(cells, jt0);
    if (!body) return;
    if (jm0) {
      if (jm0.hue     != null) body.hue     = jm0.hue;
      if (jm0.sat     != null) body.sat     = jm0.sat;
      if (jm0.light   != null) body.light   = jm0.light;
      if (jm0.alpha   != null) body.alpha   = jm0.alpha;
      if (jm0.refract != null) body.refract = jm0.refract;
      if (jm0.shimmer != null) body.shimmer = jm0.shimmer;
      if (jm0.gloss   != null) body.gloss   = jm0.gloss;
      if (jm0.rim     != null) body.rim     = jm0.rim;
    }

    // Null the tiles + invalidate terrain cache.
    for (var ci4 = 0; ci4 < cells.length; ci4++) {
      var cr = cells[ci4].r, cc2 = cells[ci4].c;
      if (world[cr]) world[cr][cc2] = null;
      invalidateTerrainAround(cr, cc2);
    }
    terrainChunkRebuildBoostFrames = Math.max(terrainChunkRebuildBoostFrames, 3);

    spawnJelloSplat(cxSplat, cySplat, 7, 70, 0.8, null);
  }

  // Called from markTerrainCleared — mining (r,c) exposes adjacent jello.
  function jelloCheckActivation(r, c) {
    if (world[r - 1] && world[r - 1][c] && world[r - 1][c].type === 'jello') activateJelloCluster(r - 1, c);
    if (world[r + 1] && world[r + 1][c] && world[r + 1][c].type === 'jello') activateJelloCluster(r + 1, c);
    if (world[r] && world[r][c - 1] && world[r][c - 1].type === 'jello') activateJelloCluster(r, c - 1);
    if (world[r] && world[r][c + 1] && world[r][c + 1].type === 'jello') activateJelloCluster(r, c + 1);
  }

  // ----- Build a PERFECT EQUILATERAL-triangle soft body DIRECTLY on a TRIANGULAR
  // (hex) lattice — apex up, flat base, both 60° sides straight. A square lattice can
  // only make clean 45° edges, so the equilateral uses STAGGERED rows: row r (r=0 apex
  // .. N base) has r+1 points, in-row spacing a = TILE/JELLO_NPT, row pitch a·√3/2,
  // each row centred under the apex. The leftmost / rightmost point of every row lies
  // exactly on the 60° side, so the edges are straight lines of points (not stairs).
  // originCol/originRow = top-left of the bbox; N = lattice rows (base spans N·a, the
  // height is N·a·√3/2); jellyType (optional, v24.123) = type label + hue like
  // jelloBuildBody takes. -----
  function jelloBuildTriangle(originCol, originRow, N, jellyType) {
    if (jelloBodies.length >= JELLO_MAX_BODIES) return null;
    var a = TILE / JELLO_NPT;            // in-row node spacing (world px) — matches the cubes
    var rowH = a * 0.8660254;            // √3/2 row pitch (equilateral)
    if (N < 2) N = 2;
    // Clamp N so the whole point cloud fits the budget (keeps idxOf valid).
    while (N > 2 && jelloCount + ((N + 1) * (N + 2) >> 1) > JELLO_MAX_POINTS) N--;
    var originX = originCol * TILE, originY = originRow * TILE;
    var apexX = originX + N * a * 0.5;   // base spans originX .. originX + N·a
    var idxOf = function (r, k) { return ((r * (r + 1)) >> 1) + k; };   // flat triangular index
    var pts = [];
    for (var r = 0; r <= N; r++) {
      for (var k = 0; k <= r; k++) pts.push({ x: apexX + (k - r * 0.5) * a, y: originY + r * rowH });
    }
    var n = pts.length;
    if (n < 4) return null;

    var b = {
      n: n,
      px: new Float64Array(n), py: new Float64Array(n),   // F64: see jelloBuildBody
      ox: new Float64Array(n), oy: new Float64Array(n),
      rx: new Float32Array(n), ry: new Float32Array(n),
      qx: new Float32Array(n), qy: new Float32Array(n),
      sA: null, sB: null, sRest: null, sType: null, springN: 0,
      ring: null, ringN: 0, ringPos: null, ringSign: 1,
      rippleU: null, rippleP: null, rippleOn: false, rippleCd: 0,
      vx: 0, vy: 0,
      npt: JELLO_NPT, spacing: a,
      cr: JELLO_CONTACT_R_FRAC * a, selfMin2: 0,
      bboxL: 0, bboxR: 0, bboxT: 0, bboxB: 0, cx: 0, cy: 0,
      sleeping: false, sleepFrames: 0, frozen: false,
      tileW: 0, tileH: 0,
      hue: jellyType ? jelloHueForType(jellyType) : JELLO_RENDER_HUE,
      jellyType: jellyType || 'slime'
    };
    var sumX = 0, sumY = 0;
    for (var p = 0; p < n; p++) {
      b.px[p] = b.ox[p] = b.rx[p] = pts[p].x;
      b.py[p] = b.oy[p] = b.ry[p] = pts[p].y;
      sumX += pts[p].x; sumY += pts[p].y;
    }
    b.cx = sumX / n; b.cy = sumY / n;
    b.tileW = N / JELLO_NPT; b.tileH = b.tileW;
    b.bboxL = originX; b.bboxT = originY;
    b.bboxR = originX + N * a; b.bboxB = originY + N * rowH;

    // Springs: the triangular mesh — in-row right neighbour + the two links to the
    // row below (down-left + down-right). Every sub-cell is a rigid little triangle.
    var sA = [], sB = [], sRest = [];
    function addSpring(i0, i1) {
      var dx = b.rx[i0] - b.rx[i1], dy = b.ry[i0] - b.ry[i1];
      sA.push(i0); sB.push(i1); sRest.push(Math.sqrt(dx * dx + dy * dy));
    }
    for (var rr = 0; rr <= N; rr++) {
      for (var kk = 0; kk <= rr; kk++) {
        var cur = idxOf(rr, kk);
        if (kk < rr) addSpring(cur, idxOf(rr, kk + 1));     // right neighbour in row
        if (rr < N) {
          addSpring(cur, idxOf(rr + 1, kk));                // down-left
          addSpring(cur, idxOf(rr + 1, kk + 1));            // down-right
        }
      }
    }
    b.sA = Int32Array.from(sA);
    b.sB = Int32Array.from(sB);
    b.sRest = Float32Array.from(sRest);
    b.sType = new Int8Array(sA.length);   // uniform mesh -> all structural (0)
    b.springN = sA.length;
    b.sLambda = new Float32Array(b.springN);   // XPBD per-constraint multipliers (reset each substep)
    b.tris = null;                              // FEM triangle mesh (built lazily on first fem use)
    jelloInstallSpringHealthMesh(b);             // orientation health; FEM still falls back to XPBD

    // Ring: apex -> down the left side -> along the base -> up the right side — three
    // straight runs of edge points (clean 60° / flat / 60°, no stairs).
    var ring = [];
    for (var lr = 0; lr <= N; lr++) ring.push(idxOf(lr, 0));        // left side: apex -> bottom-left
    for (var bk = 1; bk <= N; bk++) ring.push(idxOf(N, bk));        // base: bottom-left -> bottom-right
    for (var rs = N - 1; rs >= 1; rs--) ring.push(idxOf(rs, rs));   // right side: bottom-right -> apex
    b.ring = Int32Array.from(ring);
    // Point index -> ring slot (for impact-ripple injection at a colliding point).
    b.ringPos = new Int32Array(n);
    for (var rp = 0; rp < n; rp++) b.ringPos[rp] = -1;
    b.ringN = ring.length;
    for (var rk = 0; rk < b.ringN; rk++) b.ringPos[b.ring[rk]] = rk;

    // Rest area (shoelace over the rest ring) for the gas-pressure model.
    var ra = 0, rPrev = b.ring[b.ringN - 1];
    var raPX = b.rx[rPrev], raPY = b.ry[rPrev];
    for (var rai = 0; rai < b.ringN; rai++) {
      var rCur = b.ring[rai];
      var raCX = b.rx[rCur], raCY = b.ry[rCur];
      ra += raPX * raCY - raCX * raPY;
      raPX = raCX; raPY = raCY;
    }
    b.restArea = Math.abs(ra) * 0.5;
    b.ringSign = ra >= 0 ? 1 : -1;   // traced winding is arbitrary (see jelloVolumeXPBD) — freeze it here

    jelloComputeRest(b);
    jelloShadeAnchors(b);   // physics-anchored shading: pick the lighting's lattice anchors
    jelloBodies.push(b);
    jelloCount = jelloTotalPoints();
    return b;
  }

  // ----- Build a TRUE CIRCLE soft body DIRECTLY on a polar lattice (v24.123) — a
  // centre point + M concentric rings: ring j sits at radius j·dr and carries 6j
  // points (hex-like growth, so in-ring spacing stays ~dr everywhere). Springs:
  // in-ring neighbours + each point's TWO nearest in the ring inside it (ring 1
  // spokes to the centre), which fully triangulates the disc — shear-stiff the
  // same way the equilateral's triangle mesh is, no separate shear type needed.
  // The OUTER ring is a perfect circle of points, so even the sharp-edge render
  // (JELLO_RENDER_SMOOTH 0, straight segments) reads as a smooth circle. Like
  // jelloBuildTriangle there is no FEM mesh — the fem solver falls back to XPBD
  // for disc bodies. ccx/ccy/radius in world px. -----
  function jelloBuildDisc(ccx, ccy, radius, jellyType) {
    if (jelloBodies.length >= JELLO_MAX_BODIES) return null;
    var a = TILE / (JELLO_NPT + 1);      // ring pitch — one step finer than the base lattice
    var M = Math.round(radius / a);
    if (M < 2) M = 2;
    // Budget clamp: a disc of M rings holds 1 + 3·M·(M+1) points.
    while (M > 2 && jelloCount + 1 + 3 * M * (M + 1) > JELLO_MAX_POINTS) M--;
    var dr = radius / M;                 // exact requested outer radius after the clamp
    var pts = [{ x: ccx, y: ccy }];
    var ringStart = [0], ringCount = [1], ringPhase = [0];
    for (var j = 1; j <= M; j++) {
      var Nj = 6 * j;
      var phase = (j & 1) * (Math.PI / Nj);   // stagger alternate rings — nicer triangles
      ringStart[j] = pts.length; ringCount[j] = Nj; ringPhase[j] = phase;
      for (var k = 0; k < Nj; k++) {
        var ang = phase + (k / Nj) * 6.2831853;
        pts.push({ x: ccx + Math.cos(ang) * j * dr, y: ccy + Math.sin(ang) * j * dr });
      }
    }
    var n = pts.length;
    if (n < 4) return null;

    var b = {
      n: n,
      px: new Float64Array(n), py: new Float64Array(n),   // F64: see jelloBuildBody
      ox: new Float64Array(n), oy: new Float64Array(n),
      rx: new Float32Array(n), ry: new Float32Array(n),
      qx: new Float32Array(n), qy: new Float32Array(n),
      sA: null, sB: null, sRest: null, sType: null, springN: 0,
      ring: null, ringN: 0, ringPos: null, ringSign: 1,
      rippleU: null, rippleP: null, rippleOn: false, rippleCd: 0,
      vx: 0, vy: 0,
      npt: JELLO_NPT + 1, spacing: a,
      cr: JELLO_CONTACT_R_FRAC * a, selfMin2: 0,
      bboxL: 0, bboxR: 0, bboxT: 0, bboxB: 0, cx: 0, cy: 0,
      sleeping: false, sleepFrames: 0, frozen: false,
      tileW: 0, tileH: 0,
      hue: jellyType ? jelloHueForType(jellyType) : JELLO_RENDER_HUE,
      jellyType: jellyType || 'slime'
    };
    for (var p = 0; p < n; p++) {
      b.px[p] = b.ox[p] = b.rx[p] = pts[p].x;
      b.py[p] = b.oy[p] = b.ry[p] = pts[p].y;
    }
    b.cx = ccx; b.cy = ccy;
    b.tileW = (2 * radius) / TILE; b.tileH = b.tileW;   // gap-fit reads the disc's diameter
    b.bboxL = ccx - radius; b.bboxT = ccy - radius;
    b.bboxR = ccx + radius; b.bboxB = ccy + radius;

    // Springs: tangential ring edges + two nearest inner-ring links per point.
    var sA = [], sB = [], sRest = [];
    function addSpring(i0, i1) {
      var dx = b.rx[i0] - b.rx[i1], dy = b.ry[i0] - b.ry[i1];
      sA.push(i0); sB.push(i1); sRest.push(Math.sqrt(dx * dx + dy * dy));
    }
    for (var sj = 1; sj <= M; sj++) {
      var sN = ringCount[sj], s0 = ringStart[sj], sPh = ringPhase[sj];
      var inN = ringCount[sj - 1], in0 = ringStart[sj - 1], inPh = ringPhase[sj - 1];
      for (var sk = 0; sk < sN; sk++) {
        var cur = s0 + sk;
        addSpring(cur, s0 + ((sk + 1) % sN));            // tangential neighbour
        if (sj === 1) { addSpring(cur, 0); continue; }   // ring 1: spokes to the centre
        // Two nearest points of the ring inside: map this point's angle into the
        // inner ring's index space and take the bracketing pair.
        var angC = sPh + (sk / sN) * 6.2831853;
        var tIn = (angC - inPh) * inN / 6.2831853;
        var k0 = Math.floor(tIn) % inN; if (k0 < 0) k0 += inN;
        addSpring(cur, in0 + k0);
        addSpring(cur, in0 + ((k0 + 1) % inN));
      }
    }
    b.sA = Int32Array.from(sA);
    b.sB = Int32Array.from(sB);
    b.sRest = Float32Array.from(sRest);
    b.sType = new Int8Array(sA.length);   // uniform web -> all structural (0)
    b.springN = sA.length;
    b.sLambda = new Float32Array(b.springN);   // XPBD per-constraint multipliers (reset each substep)
    b.tris = null;                              // no FEM mesh (fem falls back to XPBD)
    jelloInstallSpringHealthMesh(b);             // round bodies must be able to detect/recover folds

    // Ring: the outer ring's points, already a closed loop in angular order.
    var ring = [];
    for (var rk0 = 0; rk0 < ringCount[M]; rk0++) ring.push(ringStart[M] + rk0);
    b.ring = Int32Array.from(ring);
    b.ringPos = new Int32Array(n);
    for (var rp = 0; rp < n; rp++) b.ringPos[rp] = -1;
    b.ringN = ring.length;
    for (var rk = 0; rk < b.ringN; rk++) b.ringPos[b.ring[rk]] = rk;

    // Rest area (shoelace over the rest ring) for the gas-pressure model.
    var ra = 0, rPrev = b.ring[b.ringN - 1];
    var raPX = b.rx[rPrev], raPY = b.ry[rPrev];
    for (var rai = 0; rai < b.ringN; rai++) {
      var rCur = b.ring[rai];
      var raCX = b.rx[rCur], raCY = b.ry[rCur];
      ra += raPX * raCY - raCX * raPY;
      raPX = raCX; raPY = raCY;
    }
    b.restArea = Math.abs(ra) * 0.5;
    b.ringSign = ra >= 0 ? 1 : -1;   // traced winding is arbitrary (see jelloVolumeXPBD) — freeze it here

    jelloComputeRest(b);
    jelloShadeAnchors(b);   // physics-anchored shading: pick the lighting's lattice anchors
    jelloBodies.push(b);
    jelloCount = jelloTotalPoints();
    return b;
  }

  // ----- HARNESS jello PLAYGROUND (v24.123; OFF the 'C' key since v25.16): builds a
  // walled STONE test pen on the ground around the rig (once per session; tracked
  // below) and drops the cube set into it. Driven ONLY by the headless harness now
  // (__jello.spawn); the 'C' key drops a single random-colour cube instead
  // (jelloDevSpawnOne, above). 'V' still clears the bodies AND lifts the pen
  // (350-gameloop-boot wires it).
  // The pen is REAL minable stone (hp 2): it persists into the save like any
  // tile, so after a reload (which empties the tracking list) drill it away.
  // Walls only ever fill AIR cells (never overwrite terrain/station/water), and
  // placement/removal invalidates the terrain chunks + nudges the liquid sim
  // awake so resting water re-reads the new solids. -----
  var jelloArenaCells = [];      // {r,c} stone cells the playground placed ('V' lifts them)
  var jelloArenaLeftC = 0;       // pen interior origin (left interior column)
  var jelloArenaGroundR = 0;     // ground row at the pen centre when built
  var JELLO_PEN_HALF_W = 14;     // interior half-width, tiles (walls sit just outside)
  var JELLO_PEN_WALL_H = 5;      // wall height, tiles above the ground line

  function jelloDevArenaGroundRow(col, fromRow) {
    var r = fromRow < 0 ? 0 : fromRow;
    for (var guard = 0; guard < 240 && r < TOTAL_ROWS; guard++, r++) {
      if (tileAt(r, col)) return r;
    }
    return -1;
  }

  function jelloDevArenaBuild() {
    if (jelloArenaCells.length) return true;   // pen already standing — reuse it
    if (!player) return false;
    var pcol = Math.floor((player.x + PLAYER_W * 0.5) / TILE);
    var feetR = Math.floor((player.y + PLAYER_H * 0.5) / TILE);
    if (pcol - JELLO_PEN_HALF_W - 1 < 1) pcol = JELLO_PEN_HALF_W + 2;
    if (pcol + JELLO_PEN_HALF_W + 1 > COLS - 2) pcol = COLS - JELLO_PEN_HALF_W - 3;
    var gC = jelloDevArenaGroundRow(pcol, feetR);
    if (gC < 2) return false;
    jelloArenaLeftC = pcol - JELLO_PEN_HALF_W;
    jelloArenaGroundR = gC;
    var wallCols = [pcol - JELLO_PEN_HALF_W - 1, pcol + JELLO_PEN_HALF_W + 1];
    for (var w = 0; w < 2; w++) {
      var wc = wallCols[w];
      var g = jelloDevArenaGroundRow(wc, feetR);
      if (g < 2) continue;
      for (var i = 1; i <= JELLO_PEN_WALL_H; i++) {
        var wr = g - i;
        if (wr < 0) break;
        if (world[wr] && world[wr][wc] == null) {   // AIR only — never overwrite anything
          world[wr][wc] = { type: 'stone', hp: ORES.stone.hp };
          jelloArenaCells.push({ r: wr, c: wc });
          invalidateTerrainAround(wr, wc);
          if (typeof liquidWakeForDig === 'function') { try { liquidWakeForDig(wr, wc); } catch (e) {} }
        }
      }
    }
    return jelloArenaCells.length > 0;
  }

  function jelloDevArenaClear() {
    for (var i = 0; i < jelloArenaCells.length; i++) {
      var a = jelloArenaCells[i];
      if (world[a.r] && world[a.r][a.c] && world[a.r][a.c].type === 'stone') {
        world[a.r][a.c] = null;
        invalidateTerrainAround(a.r, a.c);
        if (typeof liquidWakeForDig === 'function') { try { liquidWakeForDig(a.r, a.c); } catch (e) {} }
        if (typeof lightingOnClear === 'function') { try { lightingOnClear(a.r, a.c); } catch (e) {} }
      }
    }
    jelloArenaCells.length = 0;
  }

  // ----- Harness/dev hooks (v24.153): place STATIC jello tiles into the grid +
  // clear a tile through the real dig path. The shapes playground spawns LIVE
  // bodies directly, so until now nothing could exercise the buried-tile form
  // (its renderer in 140, activation by adjacent mining) from a harness. AIR-ONLY
  // placement, the worldgen tile shape verbatim; clear mirrors the drill's
  // bookkeeping via markTerrainCleared (which runs jelloCheckActivation). -----
  function jelloDevPlaceTiles(r0, c0, w, h, jellyType) {
    var placed = 0;
    for (var dr = 0; dr < h; dr++) {
      for (var dc = 0; dc < w; dc++) {
        var rr = r0 - dr, cc = c0 + dc;
        if (rr < 0 || rr >= TOTAL_ROWS || cc < 0 || cc >= COLS) continue;
        if (!world[rr] || world[rr][cc] != null) continue;   // AIR only — never overwrite anything
        var t = { type: 'jello', hp: 999999 };
        if (jellyType) t.jellyType = jellyType;
        world[rr][cc] = t;
        invalidateTerrainAround(rr, cc);
        if (typeof liquidWakeForDig === 'function') { try { liquidWakeForDig(rr, cc); } catch (e) {} }
        placed++;
      }
    }
    return placed;
  }
  function jelloDevClearTile(r, c) {
    if (!world[r] || world[r][c] == null) return false;
    var t = world[r][c];
    world[r][c] = null;
    try { markTerrainCleared(r, c, t); } catch (e) {}
    return true;
  }

  // Nudge a freshly-built body sideways a few px. Spawn x-jitter (v24.116): a
  // repeat 'C' press otherwise drops the new wave dead-centred on the last one,
  // and a perfectly centred soft-on-soft landing tips to 45 deg and CRADLES in
  // the support's dimple (a genuinely stable equilibrium — held even at friction
  // 0, live-measured), filling the pen with frozen diamond pieces. A few px of
  // off-centre makes the gravity torque at 45 deg nonzero, so a tipping piece
  // rolls off and settles flat.
  function jelloDevJitter(b) {
    if (!b) return;
    var jx = (Math.random() - 0.5) * 14;
    for (var pi = 0; pi < b.n; pi++) { b.px[pi] += jx; b.ox[pi] += jx; }
  }

  // ----- 'C' (dev): drop ONE 1-tile cube in a RANDOM colour (v25.16) -----
  // The owner's dial-in loop wants a steady supply of single cubes, not the old
  // walled shape-set drop (jelloDevSpawnTiles below stays for the headless
  // harness via __jello.spawn). Builds in the first AIR cell 3..7 rows above
  // the rig's head at the rig's column, so it always falls in from above; no
  // arena, works anywhere (surface or tunnel; a fully solid ceiling returns
  // false and 350 reports it). The random colour is a render-only hue on the
  // body: the sim and the saved jellyType stay 'slime', and the exact hue
  // persists across save/load via the envelope's h field.
  function jelloDevSpawnOne() {
    if (!player) return false;
    var pcolC = Math.floor((player.x + PLAYER_W * 0.5) / TILE);
    var headRow = Math.floor(player.y / TILE);
    // Prefer dropping BESIDE the rig (2 cols out, then 1), on the head only as
    // the last resort: an on-head drop shoves the rig every press and reads
    // clumsy even now that the engulf cap deflects it cleanly.
    var colTries = [pcolC + 2, pcolC - 2, pcolC + 1, pcolC - 1, pcolC];
    var row = -1, pcol = pcolC;
    // Pass 1 (preferred): an AIR cell 3..7 rows above the head, so the cube
    // falls in from above and lands with a little squash. Open sky above the
    // world top (r < 0 -> tileAt returns null) counts as air: spawn at the very
    // top instead of bailing, so flying high no longer reports "no room".
    for (var ct = 0; ct < colTries.length && row < 0; ct++) {
      var c = colTries[ct];
      if (c < 1 || c > COLS - 2) continue;
      for (var up = 3; up <= 7; up++) {
        var r = headRow - up;
        if (r < 0) { row = 0; pcol = c; break; }
        if (tileAt(r, c) === null) { row = r; pcol = c; break; }
      }
    }
    // Pass 2 (fallback): no 3-tile overhead clearance -- the rig is in a tight
    // tunnel it just dug (ceiling ~1 tile up). A mining game spends most of its
    // time here, so refuse-to-spawn was the common case, not the exception.
    // Drop into the nearest open cell just above / beside the rig (headRow-2,
    // -1, then the rig's own row) so a visible open pocket still takes a cube.
    for (var ct2 = 0; ct2 < colTries.length && row < 0; ct2++) {
      var c2 = colTries[ct2];
      if (c2 < 1 || c2 > COLS - 2) continue;
      for (var dr = 2; dr >= 0; dr--) {
        var r2 = headRow - dr;
        if (r2 < 0) continue;
        if (tileAt(r2, c2) === null) { row = r2; pcol = c2; break; }
      }
    }
    if (row < 0) return false;
    var b = jelloBuildBody([{ r: row, c: pcol }], 'slime');
    if (!b) return false;
    b.hue = Math.floor(Math.random() * 360);
    jelloDevJitter(b);
    spawnJelloSplat((pcol + 0.5) * TILE, (row + 0.5) * TILE, 5, 60, 0.8, null);
    return true;
  }

  function jelloDevSpawnTiles() {
    if (!player) return;
    if (!jelloDevArenaBuild()) return;
    var L = jelloArenaLeftC, g = jelloArenaGroundR;
    var b;
    // CUBES ONLY (v24.160, owner: "make that 'c' button only bring in cubes").
    // The bar / triangle / disc are gone; what's left is a spread of square
    // cubes in varied sizes + types to play with. jelloBuildTriangle / Disc are
    // kept (the __jello harness still exposes them) — just not spawned by C.
    // {col, size(tiles), type} — laid left to right across the pen; each drops a
    // few tiles so it lands with a little squash. x-jitter on every piece.
    var cubes = [
      { c: L + 2,  s: 1, t: 'ember'  },
      { c: L + 4,  s: 1, t: 'frost'  },
      { c: L + 6,  s: 1, t: 'venom'  },
      { c: L + 9,  s: 2, t: 'slime'  },
      { c: L + 13, s: 2, t: 'acid'   },
      { c: L + 17, s: 2, t: 'plasma' },
      { c: L + 22, s: 3, t: 'slime'  }
    ];
    for (var ci = 0; ci < cubes.length; ci++) {
      var cu = cubes[ci], cells = [];
      for (var dr = 0; dr < cu.s; dr++) for (var dc = 0; dc < cu.s; dc++) cells.push({ r: g - 3 - dr, c: cu.c + dc });
      b = jelloBuildBody(cells, cu.t);
      jelloDevJitter(b);
      if (b) spawnJelloSplat((cu.c + cu.s * 0.5) * TILE, (g - 2.5) * TILE, 5, 60, 0.8, null);
    }
  }

  // ----- Jello FEEL PRESETS (dev mode): 'U' cycles five named lever bundles aimed
  // at the "soft-body tetris" feel space — real-time wobble (timescale 1), stiff
  // body (high E), FAST wobble decay (damping well below 0.998), stronger shape
  // snap-back, tighter stretch cap. Preset 0 IS the shipped v1 default, so the
  // reference feel is always in the cycle. Presets only write existing gm levers
  // (E/NU run through jelloRecomputeMaterial so the derived spring stiffnesses +
  // XPBD compliances follow), so after picking a winner every value stays
  // fine-tunable live in the L panel's 'jello' group. Pairs with 'C' (drop the
  // shape set) + 'V' (clear). -----
  // Density tiers (JELLO_NPT_SMALL/MED) are BUILD-time and global on purpose - a
  // feel preset cannot re-lattice an existing body, so presets do not carry npt
  // fields; respawn (V then C) to see density changes.
  var jelloFeelIdx = 0;
  var JELLO_FEELS = [
    // E = stiffness, ts = sim timescale (1 = real-time), damp = per-1/240s AIR DRAG,
    // intDamp = internal wobble-decay rate, 1/s (kills edge buzz / ring breathing,
    // leaves fall/tumble free; THE wobble-decay knob, damp is not),
    // subs = XPBD small-steps, shape = per-substep shape-match snap-back,
    // xsph = internal-jiggle viscosity (contact-pile calm + ooze),
    // bounce = restitution, stretch = hard edge-stretch cap (lower = less smear),
    // restVel = no-bounce contact threshold, tramp = trampoline restitution at
    // dip exit, rigPush = blob->rig momentum coupling, rip* = impact-ripple skin
    // wave (master scale / speed along the skin / per-second decay / px cap).
    // rip ships 0.0 in EVERY preset since v24.121 — the owner vetoed the wavy
    // skin (see the JELLO_RIPPLE block); raise jello.JELLO_RIPPLE live to audition.
    // OPTIONAL per-row fields (v24.144): vol = explicit JELLO_XPBD_VOL_COMPLIANCE
    // (otherwise jelloRecomputeMaterial's E-derived value), fric = body-body
    // JELLO_CONTACT_FRICTION, impact = JELLO_IMPACT face-cave. Added so the firm
    // legacy rows can pin the OLD volume stiffness while the soft default rides
    // the new derivation.
    // DEFAULT = the file-default boot feel, verbatim — the v24.144 JELLY TETRIS
    // bundle (owner: "NOT the soft body jello tetris physics I was shooting
    // for", 2026-06-11): harness-tuned to 28% landing squash / 42% bulge /
    // ~1.8s wobble ring-down / ~7% stack compression under a stacked cube.
    { name: 'DEFAULT (boot)',  E: 0.5, NU: 0.30, ts: 0.50, damp: 0.998,  intDamp: 4,  subs: 3,  shape: 0.005, xsph: 0.12, bounce: 0.18, stretch: 1.6,  restVel: 30, tramp: 0.45, rigPush: 0.8, vol: 0.02, fric: 0.7, impact: 1.2, rip: 0.0, ripSp: 340, ripDamp: 0.05, ripMax: 5, shLag: 0.22, shCaus: 9,  shStrain: 0.6,  shSquash: 0.8  },
    // CLASSIC FIRM = the v24.125-v24.143 boot feel, verbatim (pre-jelly-tetris).
    { name: 'CLASSIC FIRM (v24.125)', E: 10, NU: 0.30, ts: 0.50, damp: 0.998, intDamp: 9, subs: 5, shape: 0.09, xsph: 0.12, bounce: 0.18, stretch: 1.6, restVel: 30, tramp: 0.45, rigPush: 0.8, vol: 0.0001, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 340, ripDamp: 0.05, ripMax: 5, shLag: 0.22, shCaus: 9, shStrain: 0.6, shSquash: 0.8 },
    { name: 'GLOOP (v1 ship)', E: 10,  NU: 0.30, ts: 0.50, damp: 0.998,  intDamp: 0,  subs: 5,  shape: 0.09, xsph: 0.20, bounce: 0.18, stretch: 1.6,  restVel: 40, tramp: 0.15, rigPush: 0.5, vol: 0.0001, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 220, ripDamp: 0.06, ripMax: 6, shLag: 0.10, shCaus: 12, shStrain: 0.5,  shSquash: 0.9  },
    { name: 'TETRIS SNAP',     E: 120, NU: 0.35, ts: 1.00, damp: 0.999,  intDamp: 50, subs: 8,  shape: 0.20, xsph: 0.15, bounce: 0.22, stretch: 1.3,  restVel: 30, tramp: 0.50, rigPush: 0.8, vol: 8.3e-6, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 420, ripDamp: 0.02, ripMax: 4, shLag: 0.55, shCaus: 6,  shStrain: 0.85, shSquash: 0.55 },
    { name: 'FIRM JIGGLE',     E: 55,  NU: 0.33, ts: 0.85, damp: 0.999,  intDamp: 30, subs: 7,  shape: 0.14, xsph: 0.12, bounce: 0.20, stretch: 1.4,  restVel: 30, tramp: 0.35, rigPush: 0.8, vol: 1.8e-5, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 340, ripDamp: 0.035, ripMax: 5, shLag: 0.30, shCaus: 8,  shStrain: 0.7,  shSquash: 0.7  },
    { name: 'BOUNCY GUM',      E: 200, NU: 0.40, ts: 1.00, damp: 0.999,  intDamp: 8,  subs: 10, shape: 0.28, xsph: 0.10, bounce: 0.40, stretch: 1.25, restVel: 20, tramp: 0.65, rigPush: 1.0, vol: 5.0e-6, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 480, ripDamp: 0.05, ripMax: 5, shLag: 0.45, shCaus: 9,  shStrain: 0.9,  shSquash: 1.0  },
    { name: 'LIVE PUDDING',    E: 30,  NU: 0.30, ts: 0.80, damp: 0.999,  intDamp: 60, subs: 6,  shape: 0.11, xsph: 0.30, bounce: 0.12, stretch: 1.5,  restVel: 35, tramp: 0.25, rigPush: 0.6, vol: 3.3e-5, fric: 0.6, impact: 0.85, rip: 0.0, ripSp: 260, ripDamp: 0.10, ripMax: 7, shLag: 0.15, shCaus: 14, shStrain: 0.6,  shSquash: 0.85 }
  ];

  function jelloApplyFeel(i) {
    var f = JELLO_FEELS[i];
    JELLO_E = f.E; JELLO_NU = f.NU;
    jelloRecomputeMaterial();          // derive springs + XPBD/FEM compliances from E/NU
    // Optional explicit overrides (v24.144) — applied AFTER the derivation so a
    // row can pin the exact volume stiffness / contact grip / impact cave of its era.
    if (f.vol    !== undefined) JELLO_XPBD_VOL_COMPLIANCE = f.vol;
    if (f.fric   !== undefined) JELLO_CONTACT_FRICTION    = f.fric;
    if (f.impact !== undefined) JELLO_IMPACT              = f.impact;
    JELLO_TIMESCALE     = f.ts;
    JELLO_DAMPING       = f.damp;
    JELLO_INT_DAMP      = f.intDamp;
    JELLO_XPBD_SUBSTEPS = f.subs;
    JELLO_XPBD_SHAPE    = f.shape;
    JELLO_XSPH          = f.xsph;
    JELLO_BOUNCE        = f.bounce;
    JELLO_REST_VEL      = f.restVel;
    JELLO_TRAMPOLINE    = f.tramp;
    JELLO_RIG_PUSH      = f.rigPush;
    JELLO_MAX_STRETCH   = f.stretch;
    JELLO_RIPPLE        = f.rip;
    JELLO_RIPPLE_SPEED  = f.ripSp;
    JELLO_RIPPLE_DAMP   = f.ripDamp;
    JELLO_RIPPLE_MAX    = f.ripMax;
    // Physics-anchored shading character (master JELLO_SHADE is NOT preset-driven,
    // so the owner's on/off choice survives 'U' cycling).
    JELLO_SHADE_LAG     = f.shLag;
    JELLO_SHADE_CAUSTIC = f.shCaus;
    JELLO_SHADE_STRAIN  = f.shStrain;
    JELLO_SHADE_SQUASH  = f.shSquash;
    // Wake every body so the new feel shows immediately (a sleeper keeps its pose).
    for (var bi = 0; bi < jelloBodies.length; bi++) { jelloBodies[bi].sleeping = false; jelloBodies[bi].sleepFrames = 0; }
  }

  function jelloCycleFeel() {
    jelloFeelIdx = (jelloFeelIdx + 1) % JELLO_FEELS.length;
    jelloApplyFeel(jelloFeelIdx);
    return JELLO_FEELS[jelloFeelIdx].name;
  }

  // ===== Simulation step (per body) ================================

  // Verlet integrate one body's points.
  function jelloIntegrate(b, dt) {
    // REAL-WORLD gravity. The slow-mo timescale (JELLO_TIMESCALE) is only for the gel's
    // internal jiggle, but the gel falls through the same world as the rig, so it must obey
    // the same gravity. Verlet integrates in sim time, where the free-fall accel works out to
    // JELLO_GRAVITY * TIMESCALE^2; dividing by TIMESCALE^2 cancels that so the REAL fall accel
    // equals JELLO_GRAVITY. Without this a slime fell at ~1/4 g, so a rig riding a falling
    // slime sank in slow motion (slimes and the miner must be affected by gravity equally).
    var grav = (JELLO_GRAVITY / (JELLO_TIMESCALE * JELLO_TIMESCALE)) * dt * dt;
    // Damping is per-substep, so XPBD's many tiny substeps would over-damp vs PBD's
    // few. Make it dt-consistent: pbd (dt === JELLO_H) keeps the exact 0.998 (v1
    // identical, fast path); smaller substeps use the matching fractional power so the
    // total velocity retention over the same real time is the same in every mode.
    var damp = (dt === JELLO_H) ? JELLO_DAMPING : Math.pow(JELLO_DAMPING, dt / JELLO_H);
    // Non-Newtonian: modulate damping by the body's deformation rate from the
    // previous solve. >0 = shear-thickening (firmer under fast hits / oobleck),
    // <0 = shear-thinning (flows easier when moving fast / ketchup). 0 = off.
    if (JELLO_SHEAR !== 0 && b.strainRate) {
      var rate = b.strainRate < JELLO_SHEAR_CAP ? b.strainRate : JELLO_SHEAR_CAP;
      damp -= JELLO_SHEAR * rate;
      if (damp < 0.80) damp = 0.80; else if (damp > 1.0) damp = 1.0;
    }
    var stepVMax = b._launchVMax > JELLO_VMAX ? b._launchVMax : JELLO_VMAX;
    var vcap = stepVMax * dt;   // max per-step displacement (px)
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    // v25.85 BANYA soak (plan B-D5): ONE-WAY buoyancy for guest slimes in a
    // tub. Points below the analytic waterline get gravity progressively
    // cancelled and overshoot into lift, plus extra velocity drag, so the
    // body bobs at the line instead of sinking. The water is never pushed
    // back (the v25.50-52 two-way coupling stays dead); the game fakes the
    // splash separately. bathBuoy = { line, x0, x1, lift, drag } | null.
    var bb = b.bathBuoy || null;
    for (var i = 0; i < n; i++) {
      var x = px[i], y = py[i];
      var vx = (x - ox[i]) * damp;
      var vy = (y - oy[i]) * damp;
      var g = grav;
      if (bb && y > bb.line && x >= bb.x0 && x <= bb.x1) {
        var sub = (y - bb.line) * 0.045; if (sub > 1) sub = 1;
        g = grav * (1 - bb.lift * sub);
        vx *= bb.drag; vy *= bb.drag;
      }
      // clamp runaway
      if (vx > vcap) vx = vcap; else if (vx < -vcap) vx = -vcap;
      if (vy > vcap) vy = vcap; else if (vy < -vcap) vy = -vcap;
      ox[i] = x; oy[i] = y;
      px[i] = x + vx;
      py[i] = y + vy + g;
    }
  }

  // One shape-matching pass: pull points toward goal = T * q + currentCentroid.
  function jelloShapeMatch(b, stiff) {
    // A degenerate / thin / tiny cluster (b.rigidOnly, set by jelloComputeRest when the rest
    // shape is near-colinear) has an ILL-CONDITIONED best-fit rotation: the polar decomposition
    // R jitters frame to frame, and a full-strength pull toward that spinning goal injects
    // rotational energy every frame -> the blob spins up and "flies in circles" while staying
    // deformed, behaving nothing like the well-formed cubes. Pull such bodies only WEAKLY so the
    // unstable rotation can't drive them; damping then settles the residual.
    if (b.rigidOnly) stiff *= 0.2;
    var n = b.n, px = b.px, py = b.py, qx = b.qx, qy = b.qy;
    var cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
    cx /= n; cy /= n;
    // Apq = sum( (p-c) q^T )
    var A00 = 0, A01 = 0, A10 = 0, A11 = 0;
    for (i = 0; i < n; i++) {
      var dxp = px[i] - cx, dyp = py[i] - cy;
      A00 += dxp * qx[i]; A01 += dxp * qy[i];
      A10 += dyp * qx[i]; A11 += dyp * qy[i];
    }
    // Rotation R via 2x2 polar decomposition of Apq.
    var rc = A00 + A11, rs = A10 - A01;
    var rd = Math.sqrt(rc * rc + rs * rs);
    var cosA, sinA;
    if (rd > 1e-9) { cosA = rc / rd; sinA = rs / rd; } else { cosA = 1; sinA = 0; }
    var R00 = cosA, R01 = -sinA, R10 = sinA, R11 = cosA;
    // Linear best-fit transform A_lin = Apq * invAqq.
    var T00, T01, T10, T11;
    var beta = JELLO_SHAPE_BETA;
    if (b.rigidOnly || beta <= 0) {
      T00 = R00; T01 = R01; T10 = R10; T11 = R11;
    } else {
      var L00 = A00 * b.invAqq00 + A01 * b.invAqq10;
      var L01 = A00 * b.invAqq01 + A01 * b.invAqq11;
      var L10 = A10 * b.invAqq00 + A11 * b.invAqq10;
      var L11 = A10 * b.invAqq01 + A11 * b.invAqq11;
      // Area-preserve the linear part so the cube doesn't grow/shrink.
      var detL = L00 * L11 - L01 * L10;
      if (isFinite(detL) && Math.abs(detL) > 1e-4) {
        var s = 1 / Math.sqrt(Math.abs(detL));
        L00 *= s; L01 *= s; L10 *= s; L11 *= s;
      }
      T00 = beta * L00 + (1 - beta) * R00;
      T01 = beta * L01 + (1 - beta) * R01;
      T10 = beta * L10 + (1 - beta) * R10;
      T11 = beta * L11 + (1 - beta) * R11;
    }
    // Cache the best fit for the physics-anchored shading (render reads it; the frame
    // stamp lets jelloDrawBody recompute only when this pass didn't run this frame,
    // e.g. JELLO_XPBD_SHAPE dialed to 0). Pure stores, no sim effect. L00.. are only
    // meaningful in the else branch above, hence the branch here.
    b.shRc = cosA; b.shRs = sinA;
    if (b.rigidOnly || beta <= 0) { b.shL00 = R00; b.shL01 = R01; b.shL10 = R10; b.shL11 = R11; }
    else { b.shL00 = L00; b.shL01 = L01; b.shL10 = L10; b.shL11 = L11; }
    b.shFrame = jelloFrameNo;
    // Pull each point toward its goal. Actor pose scales are continuous body
    // controls, independent of the hidden discretization and rest silhouette.
    var poseSX = isFinite(b.poseSX) ? b.poseSX : 1;
    var poseSY = isFinite(b.poseSY) ? b.poseSY : 1;
    for (i = 0; i < n; i++) {
      var pqx = qx[i] * poseSX, pqy = qy[i] * poseSY;
      var gx = T00 * pqx + T01 * pqy + cx;
      var gy = T10 * pqx + T11 * pqy + cy;
      px[i] += (gx - px[i]) * stiff;
      py[i] += (gy - py[i]) * stiff;
    }

    // Deformation strain |T - R| (Frobenius) — drives both plasticity and the
    // non-Newtonian damping (JELLO_SHEAR). Cheap, so compute it always.
    var e00 = T00 - R00, e01 = T01 - R01, e10 = T10 - R10, e11 = T11 - R11;
    var strain = Math.sqrt(e00 * e00 + e01 * e01 + e10 * e10 + e11 * e11);
    b.strainRate = strain;

    // ---- Plasticity: drift rest shape toward current when over-strained ----
    if (JELLO_PLASTICITY > 0) {
      var effYield = JELLO_YIELD + JELLO_HARDEN * (b.plasticAccum || 0);
      if (strain > effYield) {
        var amt = JELLO_PLASTICITY * (strain - effYield);
        if (amt > 0.5) amt = 0.5;
        // Drift the REST positions toward the un-rotated current shape so the
        // set is permanent. We must move rx/ry (not qx/qy) because jelloComputeRest
        // re-derives qx/qy + invAqq from rx/ry on the _restDirty recompute.
        var rxr = b.rx, ryr = b.ry, rcx = b.rcx, rcy = b.rcy;
        for (i = 0; i < n; i++) {
          var ux = px[i] - cx, uy = py[i] - cy;
          var tqx = R00 * ux + R10 * uy;   // R^T * (p - c) — un-rotate current offset
          var tqy = R01 * ux + R11 * uy;
          rxr[i] += amt * ((rcx + tqx) - rxr[i]);
          ryr[i] += amt * ((rcy + tqy) - ryr[i]);
        }
        b.plasticAccum = (b.plasticAccum || 0) + amt * (strain - effYield);
        b._restDirty = true;
      }
    }
  }

  // Distance (spring) constraints — one Gauss-Seidel pass.
  function jelloSolveSprings(b) {
    var sA = b.sA, sB = b.sB, sRest = b.sRest, sType = b.sType, springN = b.springN;
    var px = b.px, py = b.py;
    var kStruct = JELLO_SPRING, kShear = JELLO_SHEAR_SPRING;
    for (var s = 0; s < springN; s++) {
      var i0 = sA[s], i1 = sB[s];
      var dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) continue;
      var k = sType[s] ? kShear : kStruct;
      var diff = (d - sRest[s]) / d * 0.5 * k;
      var ox = dx * diff, oy = dy * diff;
      px[i0] += ox; py[i0] += oy;
      px[i1] -= ox; py[i1] -= oy;
    }
  }

  // Gas-pressure constraint — pushes the boundary ring outward to hold a target
  // area (restArea * JELLO_INFLATE), making the body a taut, slightly
  // over-inflated membrane: press it in and the trapped "gas" shoves back
  // (bouncy parachute), drive on top and it dimples then springs up. One pass.
  function jelloPressure(b) {
    if (JELLO_PRESSURE <= 0 || b.ringN < 3 || !b.restArea) return;
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
    var area = 0, ccx = 0, ccy = 0;
    var prev = ring[rn - 1], pX = px[prev], pY = py[prev];
    for (var i = 0; i < rn; i++) {
      var cur = ring[i], cX = px[cur], cY = py[cur];
      area += pX * cY - cX * pY;
      ccx += cX; ccy += cY;
      pX = cX; pY = cY;
    }
    area = Math.abs(area) * 0.5;
    if (area < 1) area = 1;
    ccx /= rn; ccy /= rn;
    var target = b.restArea * JELLO_INFLATE;
    // HARD incompressibility floor (unbreakable water balloon): a real membrane can't
    // be crushed below a fraction of its volume — it bulges out. If the rig has
    // collapsed the ring past JELLO_AREA_FLOOR of target, scale the boundary outward
    // from its centroid to restore the floor (capped per pass so it converges, not
    // explodes). Velocity-free (shift previous pos too) so it adds NO energy: the gel
    // bulges, it never implodes. This is what stops "compress more and more -> freaks
    // out and implodes".
    var floorA = target * JELLO_AREA_FLOOR;
    if (area < floorA && area > 1) {
      // Ease only PART-way to the floor per pass (it runs every iter/substep, so it
      // converges over a few) and cap the scale low — a full one-shot scale-from-
      // centroid jerked the far apex points up and pulsed the side-bulges (joggle).
      var s = Math.sqrt(floorA / area);
      s = 1 + (s - 1) * 0.4;
      if (s > 1.2) s = 1.2;
      var oxF = b.ox, oyF = b.oy;
      for (var fi = 0; fi < rn; fi++) {
        var ci = ring[fi];
        var ddx = px[ci] - ccx, ddy = py[ci] - ccy;
        var sxp = ccx + ddx * s, syp = ccy + ddy * s;
        oxF[ci] += sxp - px[ci]; oyF[ci] += syp - py[ci];   // keep velocity (no energy injected)
        px[ci] = sxp; py[ci] = syp;
      }
    }
    var deficit = (target - area) / target;     // >0 compressed -> push out
    if (deficit > 0.6) deficit = 0.6; else if (deficit < -0.6) deficit = -0.6;
    var k = JELLO_PRESSURE * deficit;
    prev = ring[rn - 1]; pX = px[prev]; pY = py[prev];
    for (var j = 0; j < rn; j++) {
      var cur2 = ring[j], cX2 = px[cur2], cY2 = py[cur2];
      var ex = cX2 - pX, ey = cY2 - pY;
      var L = Math.sqrt(ex * ex + ey * ey);
      if (L > 1e-4) {
        var nx = ey / L, ny = -ex / L;           // edge normal
        var mx = (pX + cX2) * 0.5, my = (pY + cY2) * 0.5;
        if (nx * (mx - ccx) + ny * (my - ccy) < 0) { nx = -nx; ny = -ny; }  // make it OUTward
        var push = k * L * 0.5;
        px[prev] += nx * push; py[prev] += ny * push;
        px[cur2] += nx * push; py[cur2] += ny * push;
      }
      pX = cX2; pY = cY2; prev = cur2;
    }
  }

  // ----- GAP BLOCK (anti squeeze/fold through a narrow crack) -------------------------
  // A floppy point-blob oozes through a gap one tile wide because each point fits through
  // and the springs follow (stretch = sliver, fold = hook). Rather than stiffen the body
  // (which kills the floppiness), treat a 1-tile channel as IMPASSABLE GEOMETRY at the
  // collision layer: a point that has worked its way into a 1-wide channel is brought back
  // to the nearer open mouth and the mouth plane responds like a TILE SURFACE — rest-
  // threshold inelastic normal + floor/wall friction on the tangential, x/y along the
  // plane untouched (jelloCollidePointWorld's exact response shape). Only points actually
  // inside the channel are touched, so the rest of the body still wobbles and squishes
  // against the opening — floppiness fully preserved; the body just can't get a foothold
  // inside the slot, and it can REST on the plane.
  // (v24.110 anti-seizure: the old response TELEPORTED the point to the channel's centre-x
  // with all velocity wiped. Over a freshly mined 1-wide hole the body's weight re-sank
  // the belly every substep -> snap -> springs pull back = a permanent standing limit
  // cycle, ~86 px/s of point motion forever, never sleeping — the owner's "shaking
  // spongebob" seizure, harness-measured. A teleport cannot SUPPORT weight; a contact
  // can. Same fix mirrored on the horizontal branch for side-mined 1-tall tunnels.)
  function jelloGapBlock(b, i) {
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var x = px[i], y = py[i];
    var col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    var Ls = tileAt(row, col - 1) !== null, Rs = tileAt(row, col + 1) !== null;
    var Us = tileAt(row - 1, col) !== null, Ds = tileAt(row + 1, col) !== null;
    var G = 14, k;
    // Vertical 1-wide channel: solid on left AND right -> the body can't fit; eject up/down.
    if (Ls && Rs && !(Us && Ds)) {
      var topRow = row, botRow = row;
      for (k = 0; k < G; k++) { var r = topRow - 1; if (tileAt(r, col) === null && tileAt(r, col - 1) !== null && tileAt(r, col + 1) !== null) topRow = r; else break; }
      for (k = 0; k < G; k++) { var r2 = botRow + 1; if (tileAt(r2, col) === null && tileAt(r2, col - 1) !== null && tileAt(r2, col + 1) !== null) botRow = r2; else break; }
      var topOpen = tileAt(topRow - 1, col) === null;   // open space just above the channel top?
      var botOpen = tileAt(botRow + 1, col) === null;
      // GAP FIT — a 1-wide body fits a 1-wide channel (the core mechanic: dig a
      // cube out, then drop it down a shaft as an elevator-landing cushion or push
      // it into an oil/acid pool for a reaction). Reconciled with the owner bug
      // (a surface slime stretches/drains down a dug gap to the player):
      //  - CLOSED-bottom channel (a tetris SLOT) -> always fit + land on the floor.
      //  - OPEN-bottom: FIT only when actually GOING DOWN (player dropped/pushed it:
      //    centroid speed > JELLO_GAP_FIT_DRIVE). Otherwise it is RESTING and is
      //    held by ejecting UP to the open top, ALWAYS (v24.167) — never down.
      // v24.167 removes the old "committed" escape (centroid-past-mouth -> drain):
      // a slime that SAGS past the gap mouth used to commit and drain straight
      // down (the owner's video — stretching through the gap to the player, fast
      // at low fps where many substeps run per frame). Now any resting slime over
      // an open gap with an open top is pulled BACK UP no matter how far it sagged,
      // so surface slimes stay on the surface. A genuinely dropped/pushed body
      // (moving) still fits + falls; with no open top to hold against (a capped
      // pocket) gravity takes it (return).
      // v24.191 — cubes SINK INTO open holes. With perch-hold retired (v24.189) this
      // gap-block up-hold was the last "invisible barrier": it ejected a straddling or
      // resting body UP to the lip, so a cube would never enter a hole narrower than
      // itself (nor a 1-wide cube an open shaft) — it sat on an invisible shelf. The
      // owner wants a cube to FALL into a hole dug under it. So now: a CLOSED-bottom
      // 1-wide channel is still a tetris SLOT (rest in it); an OPEN-bottom shaft pulls
      // the body DOWN into it. (JELLO_GAP_FIT_DRIVE is inert as of here — resting and
      // driven 1-wide bodies both fit now, so the resting/driven split is gone.)
      if (JELLO_GAP_FIT && b.tileW <= 1) return;   // 1-wide body fits a 1-wide channel:
                                                   // rests in a closed slot, sinks down an open shaft.
      var cx = (col + 0.5) * TILE, goUp;
      if (botOpen) goUp = false;                   // open shaft below -> ooze DOWN into the hole
      else if (topOpen) goUp = true;               // capped below, open above -> rest up on the lip
      else { b._wedgeHits = (b._wedgeHits | 0) + 1; px[i] = cx; ox[i] = cx; return; }   // capped both ends: just centre it
      b._wedgeHits = (b._wedgeHits | 0) + 1;       // wedge gauge (crowd calm): grinding in a channel
      var ny = goUp ? (topRow * TILE - 0.01) : ((botRow + 1) * TILE + 0.01);
      // PER-FRAME eject clamp (v24.165): a node may be ejected at most one tile
      // from where it was at the START OF THE FRAME (b.fpy), not one tile per
      // SUBSTEP. The eject runs once per substep, and the substep COUNT scales
      // with frametime (subs*K: ~5/frame at 120 fps, ~25/frame at 30 fps), so the
      // old per-substep clamp let a held/ejecting body migrate up to that many
      // tiles in ONE frame at low fps — a surface slime "fast-sliding straight
      // through solid down to me" (owner report; invisible in the 120 fps harness,
      // which runs few substeps/frame). Keyed off the frame-start position it caps
      // the per-FRAME migration to 1 tile regardless of framerate; gravity (which
      // is velocity-clamped) still moves a genuinely falling body, the fit gate
      // owns that. fpy is the per-frame snapshot (set before the substep loop).
      var _ejFy = (b.fpy && i < b.fpy.length) ? b.fpy[i] : y;
      if (ny < _ejFy - TILE) ny = _ejFy - TILE; else if (ny > _ejFy + TILE) ny = _ejFy + TILE;
      if (ny < y - TILE) ny = y - TILE; else if (ny > y + TILE) ny = y + TILE;   // also keep the per-substep snap small
      var vyV = y - oy[i], vxV = x - ox[i];                // px/substep, pre-resolve
      var mBV = JELLO_REST_VEL * jelloStepH;
      py[i] = ny;                                          // mouth plane = floor/ceiling contact, x kept
      oy[i] = ny + vyV * ((vyV > mBV || vyV < -mBV) ? JELLO_BOUNCE : 0);
      ox[i] = x - vxV * ((vxV > mBV || vxV < -mBV) ? JELLO_FLOOR_FRICTION : JELLO_STATIC_CREEP);
      return;
    }
    // Horizontal 1-wide channel: solid above AND below -> eject left/right.
    if (Us && Ds && !(Ls && Rs)) {
      if (JELLO_GAP_FIT && b.tileH <= 1) return;   // a 1-tall body fits a 1-tall crawl
      var lCol = col, rCol = col;
      for (k = 0; k < G; k++) { var c = lCol - 1; if (tileAt(row, c) === null && tileAt(row - 1, c) !== null && tileAt(row + 1, c) !== null) lCol = c; else break; }
      for (k = 0; k < G; k++) { var c2 = rCol + 1; if (tileAt(row, c2) === null && tileAt(row - 1, c2) !== null && tileAt(row + 1, c2) !== null) rCol = c2; else break; }
      var leftOpen = tileAt(row, lCol - 1) === null;
      var rightOpen = tileAt(row, rCol + 1) === null;
      var cy = (row + 0.5) * TILE, goLeft;
      if (leftOpen && rightOpen) goLeft = b.cx < (col + 0.5) * TILE;
                                                             // both mouths open: eject toward the BODY
                                                             // CENTROID's side (v25.22). The old travel-
                                                             // direction rule was a RATCHET under cram
                                                             // pressure: points squeezed into the channel
                                                             // moving cavity-ward got ejected deeper
                                                             // cavity-ward, and the body oozed through
                                                             // the channel one point at a time.
      else if (leftOpen) goLeft = true;
      else if (rightOpen) goLeft = false;
      else { b._wedgeHits = (b._wedgeHits | 0) + 1; py[i] = cy; oy[i] = cy; return; }
      b._wedgeHits = (b._wedgeHits | 0) + 1;       // wedge gauge (crowd calm): grinding in a channel
      var nx = goLeft ? (lCol * TILE - 0.01) : ((rCol + 1) * TILE + 0.01);
      // PER-FRAME eject clamp (v24.165, same rationale as the vertical branch):
      // cap horizontal eject migration to 1 tile per FRAME (off b.fpx), not per
      // substep, so it can't scale with framerate.
      var _ejFx = (b.fpx && i < b.fpx.length) ? b.fpx[i] : x;
      if (nx < _ejFx - TILE) nx = _ejFx - TILE; else if (nx > _ejFx + TILE) nx = _ejFx + TILE;
      if (nx < x - TILE) nx = x - TILE; else if (nx > x + TILE) nx = x + TILE;
      var vxH = x - ox[i], vyH = y - oy[i];                // px/substep, pre-resolve
      var mBH = JELLO_REST_VEL * jelloStepH;
      px[i] = nx;                                          // mouth plane = wall contact, y kept
      ox[i] = nx + vxH * ((vxH > mBH || vxH < -mBH) ? JELLO_BOUNCE : 0);
      oy[i] = y - vyH * ((vyH > mBH || vyH < -mBH) ? JELLO_WALL_FRICTION : JELLO_STATIC_CREEP);
      return;
    }
  }

  // Resolve one point out of solid tiles (Verlet collision response).
  // Allocation-free: scan the 4 push-out candidates (smallest penetration into
  // an OPEN neighbour tile first) without building an array or a sort closure —
  // this runs per-point, per-iteration, per-substep, so no per-call heap churn.
  // v24.94 collision overhaul:
  //  - REST THRESHOLD: contacts slower than JELLO_REST_VEL along the normal are
  //    perfectly inelastic (no bounce term). Unconditional restitution re-bounced
  //    the ~g*h^2 re-penetration of a RESTING point every substep = the standing
  //    micro-buzz.
  //  - CAME-FROM BIAS: the side containing (ox,oy) gets a small penetration
  //    bonus, so a point shoved deep by contact/containment exits back the way
  //    it entered instead of popping out the far side (anti-tunnel).
  //  - UN-STICK: the fully-enclosed fallback walks toward the body centroid for
  //    an open cell when ox/oy is ALSO solid - never welds a point in a wall.
  function jelloCollidePointWorld(b, i, h) {
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var x = px[i], y = py[i];
    if (!isFinite(x) || !isFinite(y)) {
      // Heal a corrupt point to the body's CURRENT centroid, never its BUILD-site rest
      // position: a body pushed/dropped far from its socket would otherwise teleport the
      // point back across the map and the springs would drag the whole body after it.
      // Tiny per-index spread so multiple healed points never land exactly coincident
      // (coincident pairs are skipped by the d<eps guards and would never re-separate).
      var hcx = isFinite(b.cx) ? b.cx : b.rx[i], hcy = isFinite(b.cy) ? b.cy : b.ry[i];
      hcx += ((i % 7) - 3) * 0.4; hcy += ((((i / 7) | 0) % 7) - 3) * 0.4;
      px[i] = ox[i] = hcx; py[i] = oy[i] = hcy;
      return;
    }
    // DIAGONAL CORNER PINCH (v25.20; frame-start anchored v25.25): a point may
    // never cross cells diagonally when BOTH orthogonal intermediate cells are
    // solid — two tiles touching only at a corner are sealed geometry. The "from"
    // cell is the FRAME-START snapshot (b.fpx), NOT the Verlet prev position:
    // half the engine's operations are velocity-free (contact separation,
    // containment, unmerge shifts, rig displacement) and move ox WITH px, so an
    // ox-based check saw a pressure-pushed point as never having moved at all and
    // corners leaked one velocity-free nudge at a time (owner: slimes slip into a
    // diagonally-adjacent cavity, or visibly REACH for it). A legal diagonal move
    // over open ground always has an open intermediate. The undo is a dead stop
    // at the frame-start position.
    var dfx, dfy;
    if (b.fpx && i < b.fpx.length) { dfx = b.fpx[i]; dfy = b.fpy[i]; }
    else { dfx = ox[i]; dfy = oy[i]; }
    var dpr0 = Math.floor(dfy / TILE), dpc0 = Math.floor(dfx / TILE);
    var dpr1 = Math.floor(y / TILE), dpc1 = Math.floor(x / TILE);
    if (dpr1 !== dpr0 && dpc1 !== dpc0 &&
        tileAt(dpr0, dpc1) !== null && tileAt(dpr1, dpc0) !== null) {
      b._wedgeHits = (b._wedgeHits | 0) + 1;   // wedge gauge (crowd calm): pressing a sealed corner
      px[i] = ox[i] = dfx; py[i] = oy[i] = dfy;
      return;
    }
    if (!jelloWorldSolidAt(x, y)) { if (JELLO_GAP_BLOCK) jelloGapBlock(b, i); return; }
    if (b._launchVMax > JELLO_VMAX) b._launchHit = true;
    var col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    var left = col * TILE, right = left + TILE, top = row * TILE, bot = top + TILE;
    // Penetration to each side. dir codes: 0=up,1=down,2=left,3=right.
    var pen0 = y - top, pen1 = bot - y, pen2 = x - left, pen3 = right - x;
    var vx = x - ox[i], vy = y - oy[i];   // velocity prior to resolve (px per substep)
    var minB = JELLO_REST_VEL * (h || JELLO_H);   // rest threshold in px/substep
    // Prefer exiting toward where the point CAME FROM (ox/oy), so a point shoved
    // deep by contact/containment pops back out the entry side, never the far side.
    var fb = 1.5;
    if (oy[i] < top + TILE * 0.5) pen0 -= fb; else pen1 -= fb;
    if (ox[i] < left + TILE * 0.5) pen2 -= fb; else pen3 -= fb;
    // ENTRY-SIDE LOCK (v25.22): when the previous position sits in an ADJACENT OPEN
    // cell, resolve back toward it UNCONDITIONALLY (a -1e9 "penetration" wins the
    // scan, and the side is verified open right here). The small bias above only
    // nudges the ordering, so a point DRIVEN deep by cram pressure could cross the
    // tile's midline and exit the FAR side — straight through a 1-tile wall into
    // whatever cavity lies behind it, with the springs hauling the whole body after
    // it (the owner's "slime stretches into a cavity that isn't even adjacent").
    // The resolve always parks points in open space, so the frame-start cell is an
    // adjacent open cell in virtually every case; diagonal entries fall through to
    // the biased scan, and the diagonal-pinch rule above owns sealed corners.
    // FRAME-START anchored (v25.25): keying on ox was blind to velocity-free
    // pushes (they move ox with px), so a cram-pressed point could carry its
    // "previous position" into the wall with it and exit the far side anyway.
    var epr, epc;
    if (b.fpx && i < b.fpx.length) { epr = Math.floor(b.fpy[i] / TILE); epc = Math.floor(b.fpx[i] / TILE); }
    else { epr = Math.floor(oy[i] / TILE); epc = Math.floor(ox[i] / TILE); }
    var _fAnch = false;
    if (epr === row && epc === col - 1 && tileAt(row, col - 1) === null) { pen2 = -1e9; _fAnch = true; }
    else if (epr === row && epc === col + 1 && tileAt(row, col + 1) === null) { pen3 = -1e9; _fAnch = true; }
    else if (epc === col && epr === row - 1 && tileAt(row - 1, col) === null) { pen0 = -1e9; _fAnch = true; }
    else if (epc === col && epr === row + 1 && tileAt(row + 1, col) === null) { pen1 = -1e9; _fAnch = true; }
    if (!_fAnch && ((epr === row && epc === col) || tileAt(epr, epc) !== null)) {
      // BODY-WARD cascade (v25.26): fires ONLY on a DIRTY snapshot — the frame-
      // start position sits inside THIS tile or inside solid (a finalize-stage
      // mover left the point in a wall at frame end), so it cannot anchor an
      // entry side. Exit TOWARD THE BODY CENTROID: gel must never leave a wall
      // AWAY from its own body — that is exactly the far-side leak (owner: an
      // 8-slime stack pressured down squeezed points into the nearest cavity).
      // A CLEAN but non-adjacent snapshot (a hard-kicked point that crossed a
      // cell) keeps the plain biased scan: steering those body-ward fought the
      // channel guard's mouth-parking and set a wedged body wobbling (harness).
      var _anx = b.cx, _any = b.cy;
      var _adx = _anx - (left + TILE * 0.5), _ady = _any - (top + TILE * 0.5);
      var _aax = _adx < 0 ? -_adx : _adx, _aay = _ady < 0 ? -_ady : _ady;
      for (var _ac = 0; _ac < 2 && !_fAnch; _ac++) {   // dominant axis toward the anchor, then the minor
        if ((_ac === 0) === (_aax >= _aay)) {
          if (_adx < 0 && tileAt(row, col - 1) === null) { pen2 = -1e9; _fAnch = true; }
          else if (_adx >= 0 && tileAt(row, col + 1) === null) { pen3 = -1e9; _fAnch = true; }
        } else {
          if (_ady < 0 && tileAt(row - 1, col) === null) { pen0 = -1e9; _fAnch = true; }
          else if (_ady >= 0 && tileAt(row + 1, col) === null) { pen1 = -1e9; _fAnch = true; }
        }
      }
    }
    // Try the 4 sides in ascending penetration order, picking the first whose
    // neighbour tile is open. Bounded 4-pass selection — no allocation.
    var doneMask = 0;
    for (var k = 0; k < 4; k++) {
      // find smallest remaining penetration
      var best = -1, bestPen = 1e9;
      if (!(doneMask & 1) && pen0 < bestPen) { best = 0; bestPen = pen0; }
      if (!(doneMask & 2) && pen1 < bestPen) { best = 1; bestPen = pen1; }
      if (!(doneMask & 4) && pen2 < bestPen) { best = 2; bestPen = pen2; }
      if (!(doneMask & 8) && pen3 < bestPen) { best = 3; bestPen = pen3; }
      if (best < 0) break;
      doneMask |= (1 << best);
      if (best === 0) {                 // push up
        if (tileAt(row - 1, col) === null) {
          y = top - 0.01; oy[i] = y + vy * ((vy > minB || vy < -minB) ? JELLO_BOUNCE : 0);
          // STATIC friction below the rest threshold: the tangential component is cut to
          // JELLO_STATIC_CREEP (geometric decay per substep — reads as a dead stop, but a
          // body PRESSED sideways by a touching neighbour can creep apart and relax; see
          // the lever note). Historical: this was an EXACT stick (kept 0), partly as an
          // F32-ULP guard (a kept 0.86*v rounded to a self-sustaining 1-ULP phantom drift
          // at world x ~ 1e5); positions are F64 since v24.93, so the small kept fraction
          // decays to true zero.
          ox[i] = x - vx * ((vx > minB || vx < -minB) ? JELLO_FLOOR_FRICTION : JELLO_STATIC_CREEP);
          jelloRippleHit(b, b.ringPos ? b.ringPos[i] : -1, (vy < 0 ? -vy : vy) / jelloStepH * JELLO_TIMESCALE, 0.8, 0.06);
          px[i] = x; py[i] = y; return;
        }
      } else if (best === 1) {          // push down
        if (tileAt(row + 1, col) === null) {
          y = bot + 0.01; oy[i] = y + vy * ((vy > minB || vy < -minB) ? JELLO_BOUNCE : 0);
          ox[i] = x - vx * ((vx > minB || vx < -minB) ? JELLO_FLOOR_FRICTION : JELLO_STATIC_CREEP);
          jelloRippleHit(b, b.ringPos ? b.ringPos[i] : -1, (vy < 0 ? -vy : vy) / jelloStepH * JELLO_TIMESCALE, 0.8, 0.06);
          px[i] = x; py[i] = y; return;
        }
      } else if (best === 2) {          // push left
        if (tileAt(row, col - 1) === null) {
          x = left - 0.01; ox[i] = x + vx * ((vx > minB || vx < -minB) ? JELLO_BOUNCE : 0);
          oy[i] = y - vy * ((vy > minB || vy < -minB) ? JELLO_WALL_FRICTION : JELLO_STATIC_CREEP);
          jelloRippleHit(b, b.ringPos ? b.ringPos[i] : -1, (vx < 0 ? -vx : vx) / jelloStepH * JELLO_TIMESCALE, 0.8, 0.06);
          px[i] = x; py[i] = y; return;
        }
      } else {                          // push right
        if (tileAt(row, col + 1) === null) {
          x = right + 0.01; ox[i] = x + vx * ((vx > minB || vx < -minB) ? JELLO_BOUNCE : 0);
          oy[i] = y - vy * ((vy > minB || vy < -minB) ? JELLO_WALL_FRICTION : JELLO_STATIC_CREEP);
          jelloRippleHit(b, b.ringPos ? b.ringPos[i] : -1, (vx < 0 ? -vx : vx) / jelloStepH * JELLO_TIMESCALE, 0.8, 0.06);
          px[i] = x; py[i] = y; return;
        }
      }
    }
    // Fully enclosed. If the previous position is OPEN, snap back to it (the old
    // behaviour); if it is ALSO solid (a big contact/containment correction carried
    // the pair into the wall), walk toward the body centroid for an open cell and
    // park there - never leave a point welded inside terrain.
    if (!jelloWorldSolidAt(ox[i], oy[i])) { px[i] = ox[i]; py[i] = oy[i]; return; }
    var ucx = b.cx || x, ucy = b.cy || y;
    var ud = Math.sqrt((ucx - x) * (ucx - x) + (ucy - y) * (ucy - y));
    if (ud > 1e-3) {
      var ux = (ucx - x) / ud, uy = (ucy - y) / ud;
      for (var w = 1; w <= 2; w++) {
        var wx2 = (Math.floor((x + ux * TILE * w) / TILE) + 0.5) * TILE;
        var wy2 = (Math.floor((y + uy * TILE * w) / TILE) + 0.5) * TILE;
        if (!jelloWorldSolidAt(wx2, wy2)) { px[i] = wx2; py[i] = wy2; ox[i] = wx2; oy[i] = wy2; return; }
      }
    }
    px[i] = ox[i]; py[i] = oy[i];
  }

  // ----- Ring-EDGE collision (segment-vs-corner): a tile corner can poke between two
  // ring points (spacing h = TILE/NPT ~ 10.7px; worst chord sag ~3.8px + the 5.3px render
  // outset = a visible ~9px stab). Testing each boundary edge's MIDPOINT halves the
  // effective spacing, bounding the residual poke to ~2.7px - under the outset, invisible.
  // The pushout is split half/half to the edge's endpoints, velocity-free (ox follows px),
  // so it lifts the chord off the corner without injecting energy. -----
  function jelloCollideRingEdges(b) {
    var ring = b.ring, rn = b.ringN; if (!ring || rn < 3) return;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var prev = ring[rn - 1];
    for (var i = 0; i < rn; i++) {
      var cur = ring[i];
      var mx = (px[prev] + px[cur]) * 0.5, my = (py[prev] + py[cur]) * 0.5;
      if (jelloWorldSolidAt(mx, my)) {
        var col = Math.floor(mx / TILE), row = Math.floor(my / TILE);
        var top = row * TILE, bot = top + TILE, left = col * TILE, right = left + TILE;
        var dxc = 0, dyc = 0, bestPen = 1e9;
        if (tileAt(row - 1, col) === null && my - top < bestPen)   { bestPen = my - top;   dxc = 0; dyc = -(my - top) - 0.01; }
        if (tileAt(row + 1, col) === null && bot - my < bestPen)   { bestPen = bot - my;   dxc = 0; dyc = (bot - my) + 0.01; }
        if (tileAt(row, col - 1) === null && mx - left < bestPen)  { bestPen = mx - left;  dyc = 0; dxc = -(mx - left) - 0.01; }
        if (tileAt(row, col + 1) === null && right - mx < bestPen) { bestPen = right - mx; dyc = 0; dxc = (right - mx) + 0.01; }
        if (bestPen < 1e8) {
          var hx = dxc * 0.5, hy = dyc * 0.5;
          px[prev] += hx; py[prev] += hy; ox[prev] += hx; oy[prev] += hy;
          px[cur]  += hx; py[cur]  += hy; ox[cur]  += hx; oy[cur]  += hy;
        }
      }
      prev = cur;
    }
  }

  // World boundary clamp (off the map edges).
  function jelloClampWorld(b, i) {
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var r = 2;
    var maxX = COLS * TILE - r;
    var maxY = (TOTAL_ROWS + 1) * TILE;
    if (px[i] < r)    { px[i] = r;    ox[i] = px[i] + (px[i] - ox[i]) * JELLO_BOUNCE; }
    if (px[i] > maxX) { px[i] = maxX; ox[i] = px[i] + (px[i] - ox[i]) * JELLO_BOUNCE; }
    if (py[i] > maxY) { py[i] = maxY; oy[i] = py[i] + (py[i] - oy[i]) * JELLO_BOUNCE; }
  }

  // Player -> jello coupling (per substep): push points the rig overlaps,
  // traction on the sides, track-shear on the top surface, jet cone push-down.
  function jelloPlayerCouple(b, dt) {
    if (!player || gameWon || gameOver) return;
    var px0 = player.x, px1 = player.x + PLAYER_W;
    var py0 = player.y, py1 = player.y + PLAYER_H;
    var pcx = px0 + PLAYER_W * 0.5, pcy = py0 + PLAYER_H * 0.5;
    var vx = player.vx || 0, vy = player.vy || 0;
    var ejecting = JELLO_PLAYER_EJECT * dt;
    var thrust = player.thrusting && player.fuel > 0;
    // Jet back-pressure bookkeeping: each cone-hit point adds its cone weight (jf)
    // times this body's per-point tile fraction, so jelloJetReactT reads as
    // "tiles-worth of gel in the cone" independent of lattice density.
    var _jrFrac = 0;
    if (thrust && jelloJetOn && JELLO_JET_REACT > 0) {
      var _jrSp = b.spacing || (TILE / JELLO_NPT);
      _jrFrac = (_jrSp * _jrSp) / (TILE * TILE);
    }
    // Velocity-injecting couplings below (jet / weight / landing / track-shear) add a
    // dt-scaled bump to POSITION, which in Verlet becomes a fixed velocity kick PER
    // substep call — so xpbd/fem (K x more substeps) would inject K x the velocity for the
    // same frame. iscl (1 for pbd, 1/K otherwise) keeps the per-frame velocity solver-
    // independent. The plow is velocity-free (shifts ox too) so it is left unscaled.
    var iscl = jelloImpulseScale();
    // Contact axis for the dent: prefer the resolve's hysteretic decision (set last
    // frame); fall back to the dominant velocity axis. Keeps the soft-contact push on
    // the same axis the rig is hitting, so it never squirts gel out the perpendicular.
    var horizC = (player._jHoriz !== undefined) ? player._jHoriz : (Math.abs(vx) >= Math.abs(vy));
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy, n = b.n;
    var disturbed = false;
    var jetBestF = 0, jetBX = 0, jetBY = 0;   // deepest jet-dented point (ripple churn centre)
    var underTop = py1 - TILE * 0.7;   // top of the under-foot contact band
    var underBot = py1 + TILE * 0.5;   // bottom of it
    for (var i = 0; i < n; i++) {
      var x = px[i], y = py[i];

      // --- UNDER-FOOT CONTACT PATCH (only while resting/driving ON TOP) ----------
      // Track-shear sloshes the gel under the rig opposite to travel (the "tracks
      // gripping" feel). It is gated on player.onJello so it ONLY happens on top —
      // without that gate it also fired when you FLY INTO THE SIDE, aggressively
      // ripping the rim sideways (the gel beside you got dragged like it was being
      // pulled into the tracks). Side hits skip this and go to the soft contact
      // push-out + the closed-ring barrier below instead.
      if (player.onJello && x > px0 && x < px1 && y >= underTop && y <= underBot) {
        if (Math.abs(vx) > 4) {
          var sh = -Math.sign(vx) * Math.min(Math.abs(vx), JELLO_VMAX * 0.5) * JELLO_TRACK_SHEAR * dt * iscl;
          px[i] += sh;
          disturbed = true;
          if (devMode) jelloDbg.shearPts++;
        }
        // Continuous WEIGHT: while resting on top, the rig's mass presses the
        // membrane down. Gas pressure shoves back -> a springy parachute dimple
        // that tracks the rig as it drives. (Vertical only, never horizontal.)
        if (player.onJello && player.onGround && JELLO_WEIGHT > 0 && y > py1 - TILE * 0.3) {
          py[i] += JELLO_WEIGHT * dt * iscl;
          disturbed = true;
        }
        // Landing weight: descending onto the patch presses it down (splash) —
        // vertical only, never horizontal.
        if (vy > 30 && y > py1 - TILE * 0.25) {
          py[i] += vy * 0.5 * dt * iscl;
          disturbed = true;
        }
        // (The old straight-down patch jet was dead code: this patch requires
        // player.onJello, and the ground probe is gated on !thrusting, so the
        // two could never both be true. The thrust-aligned cone below covers it.)
        continue;
      }

      // --- SQUISH: the rig's body shoves the gel it overlaps in its own TRAVEL
      //     direction, so the cube COMPRESSES / deforms ahead of the miner (memory-
      //     foam give). CRITICAL: this is VELOCITY-FREE (shift the previous position
      //     ox/oy by the same delta) so it relocates the gel WITHOUT injecting any
      //     energy — that is what keeps it calm under heavy compression instead of
      //     pumping energy until it "blows up". The gel's springs/pressure resist +
      //     recover; the HARD CONTAINMENT (jelloResolvePlayer) keeps the rig OUTSIDE
      //     the boundary so it can never pass through or get absorbed.
      if (x > px0 && x < px1 && y > py0 && y < py1) {
        var sp = Math.sqrt(vx * vx + vy * vy);
        // Only SNOWPLOW the cube while driving INTO it (not while riding on top). On top this
        // pushed the cube along in the travel direction, so the rig surfed the cube it was
        // pushing and the pair slid forever while the gas was held (you could never drive OFF
        // it). On-top contact is owned by the ground probe + the (backward) under-foot track-
        // shear; the plow is for side / through hits, which are always !onJello.
        if (sp > 1e-3 && !player.onJello && (player.jelloGroundT || 0) <= 0) {   // also held off through the onJello flicker (jelloGroundT coyote), same as the fling
          var cap = JELLO_VMAX * 0.5;
          var ps = sp < cap ? sp : cap;
          var amt = ps * JELLO_PLOW * dt;
          // TIP-SHEAR (v24.125, owner: "rolls instead of slides"): on a HORIZONTAL
          // push, weight the plow by the point's height within the body — full bite
          // at the body's top, JELLO_PLOW_BASE of it at the ground line. A uniform
          // push is a pure translation (the old skate); the height gradient makes
          // the push a SHEAR, so the top leads, the gripped base holds (sticky
          // floor friction), the body leans past its pivot corner and tumbles.
          // Vertical hits (landing punches, dives) keep the uniform bite.
          // EXCEPT while the PUSH tier is driving this body (v24.151): then the
          // bite is uniform — the gradient leaned the cube into a ramp the rig
          // climbed, ending every bulldoze as a drive-over.
          if (horizC && !(b._pushMs !== undefined && performance.now() - b._pushMs < 120)) {
            var bh2 = b.bboxB - b.bboxT;
            if (bh2 > 4) amt *= JELLO_PLOW_BASE + (1 - JELLO_PLOW_BASE) * ((b.bboxB - y) / bh2);
          }
          var dax = (vx / sp) * amt, day = (vy / sp) * amt;
          ox[i] += dax; oy[i] += day;   // velocity-free: no energy injected -> no blow-up
          px[i] += dax; py[i] += day;
          disturbed = true;
          if (devMode) jelloDbg.plowPts++;
        }
        continue;
      }

      // --- THRUST-ALIGNED jet cone (v24.94): direction = the rig's real exhaust
      //     (rocketExhaustDir; sideways/up in rotation flight), not a fixed down-cone.
      //     Near-field = the v22.20 velocity-free crater (relocation bites, uncapped;
      //     a velocity push was double-capped by the VMAX clamp + the springs soaking
      //     it, so it never dented no matter the lever). Far-field cross-fades to a
      //     velocity feed so momentum travels through the gel (springs soak it
      //     gracefully; the VMAX clamp is the ceiling). ---
      if (thrust && jelloJetOn) {
        var jqx = x - jelloJetOX, jqy = y - jelloJetOY;
        var js = jqx * jelloJetDX + jqy * jelloJetDY;            // axial distance down the jet
        // + half a tile past the occluding wall's first probe so gel resting ON the
        // wall (surface points a few px past the ray's 4px-grid hit) still catches wash.
        if (js > 0 && js < JELLO_JET_LEN && js <= jelloJetMaxS + TILE * 0.5) {
          var jt = jqx * (-jelloJetDY) + jqy * jelloJetDX;       // signed radial distance
          if (jt < 0) jt = -jt;
          var jrad = JELLO_JET_R0 + js * JELLO_JET_TAN;
          if (jrad > JELLO_JET_RANGE) jrad = JELLO_JET_RANGE;
          if (jt < jrad) {
            var jf = (1 - jt / jrad) * (1 - js / JELLO_JET_LEN);
            var wn = js < JELLO_JET_NEAR ? 1 : 1 - (js - JELLO_JET_NEAR) / (JELLO_JET_LEN - JELLO_JET_NEAR);
            var jdent = JELLO_JET_PUSH * jf * wn * dt;           // crater: relocate along the exhaust
            // Don't blow gel INTO solid (v24.171). The crater is an unconditional
            // velocity-free shove along the exhaust, applied every substep. Against
            // an OPEN blob that is fine (the gel flows out of the cone). But against
            // a CONFINING wall/floor — a cube boxed in a pocket while you hold the
            // jet straight down on it — it rammed each point into the floor every
            // substep, and the world-collide in the SAME substep flung it back out
            // with rebound velocity, pumping a violent pulse (the owner's "glitches
            // around quickly"). Stop the crater at the surface: only relocate the
            // point if its destination is open space. Confined gel then COMPACTS
            // against the wall and HOLDS (the volume + shape constraints bulge it
            // aside), squishing to a steady cushion instead of exploding. Same guard
            // on the far-field velocity feed so it can't drive points into solid
            // either. Open craters are untouched (the destination is air there).
            var jnx = px[i] + jelloJetDX * jdent, jny = py[i] + jelloJetDY * jdent;
            if (!jelloWorldSolidAt(jnx, jny)) {
              px[i] = jnx; py[i] = jny;
              ox[i] += jelloJetDX * jdent; oy[i] += jelloJetDY * jdent;
            }
            var jdv = JELLO_JET_VEL * jf * (1 - wn) * dt * iscl; // far-field: real momentum
            ox[i] -= jelloJetDX * jdv; oy[i] -= jelloJetDY * jdv;
            if (_jrFrac > 0) jelloJetReactT += jf * _jrFrac;     // back-pressure: count the covered gel
            if (jf > jetBestF) { jetBestF = jf; jetBX = x; jetBY = y; }
            disturbed = true;
          }
        }
      }
    }
    if (jetBestF > 0.05) { b._ripJetOn = 1; b._ripJetX = jetBX; b._ripJetY = jetBY; }   // churn the skin under the jet
    if (disturbed) {
      b._plyMs = performance.now();   // player-driven: the crowd calm must not eat this motion (v25.21)
      if (b.sleeping) { b.sleeping = false; b.sleepFrames = 0; }
    }
  }

  // Player -> jello DRIVE, two tiers (v24.151). Runs once per frame per awake
  // body, BEFORE the substeps, so the imparted velocity rides the Verlet step.
  //   FLING (rig speed >= JELLO_FLING_MIN): the v24.125 ram — sets the whole
  //     body's launch speed in one shot, with loft + full spin gradient, so it
  //     tumbles off airborne.
  //   PUSH (JELLO_PUSH_MIN..FLING_MIN): the bulldoze — drives the body toward
  //     JELLO_PUSH x rig speed at a mass-scaled RATE (heavy slabs spool up,
  //     slimes scoot), no loft, quarter spin (a forward lean, not a tumble).
  // Both share the no-pump gate: velocity is only added while the body is
  // slower than the target along the travel dir, so neither can accumulate
  // energy. Velocity is reckoned in REAL px/s and converted through
  // JELLO_TIMESCALE + JELLO_H into the Verlet prev-position shift; the
  // integrator's JELLO_VMAX clamp is the hard ceiling.
  function jelloPlayerFling(b, frameDt) {
    if (!player || gameWon || gameOver || drilling) return;
    var vx = player.vx || 0, vy = player.vy || 0;
    var sp = Math.sqrt(vx * vx + vy * vy);
    if (sp < JELLO_PUSH_MIN) return;
    var fling = sp >= JELLO_FLING_MIN;
    if (fling) {
      if (JELLO_FLING <= 0) return;
      // Don't fling while riding on top. onJello flickers true/false every frame on a
      // deforming cube top, so checking it alone let the fling fire on the FALSE frames
      // and relaunch the WHOLE cube each frame (rig + cube slid forever). jelloGroundT
      // is a coyote timer set whenever grounded, so it holds through the flicker.
      if (player.onJello || (player.jelloGroundT || 0) > 0) return;
    } else if (JELLO_PUSH <= 0) {
      return;
    }
    var px0 = player.x, px1 = player.x + PLAYER_W;
    var py0 = player.y, py1 = player.y + PLAYER_H;
    if (b.bboxR < px0 || b.bboxL > px1 || b.bboxB < py0 || b.bboxT > py1) return;   // bbox disjoint
    // PUSH tier target gate (per-body, unlike the fling's blanket ride gate, so
    // you can stand on one cube and shove the NEXT one): only push a body whose
    // top stands CLEARLY above the step-up reach — a real WALL in your way. A
    // body with its top at/below the feet is the floor you're standing on
    // (driving it self-propels the pair, the pre-v24.110 skate), and a low curb
    // within step-up reach is something you walk ONTO, not push.
    if (!fling && b.bboxT >= py1 - JELLO_STEP_UP - 4) return;
    // Contact: rig centre inside the ring, or any boundary point inside the rig AABB.
    var touching = jelloPointInRing(b, (px0 + px1) * 0.5, (py0 + py1) * 0.5);
    if (!touching) {
      var ring = b.ring, rn = b.ringN, rpx = b.px, rpy = b.py;
      for (var i = 0; i < rn; i++) {
        var x = rpx[ring[i]], y = rpy[ring[i]];
        if (x >= px0 && x <= px1 && y >= py0 && y <= py1) { touching = true; break; }
      }
    }
    if (!touching) return;
    // Stamp freshness only while the rig is actually MOVING (v25.31 perf): a
    // rig PARKED against a pile re-stamped every touching body every frame,
    // the chain propagated it pile-wide, and the perpetual freshness disabled
    // every calming system (drain, park ramp) — the pile simmered awake
    // forever and update.jello owned the frame (owner: 250 -> 600 fps with
    // jello off; harness: 9 of 13 bodies awake after 20s, all ply-fresh).
    // A push is by definition a moving rig, so pushes keep their protection.
      b._plyMs = performance.now();   // player-driven: the crowd calm must not eat this motion (v25.21)
    // Mark this body as ACTIVELY BEING PUSHED (ms wall-clock TTL, read by the plow
    // + the ground probe). While fresh: the plow's tip-shear gradient flattens to a
    // uniform bite (rotating the cube forward turned it into a RAMP the rig drove
    // up and over — the harness's "speed bump" failure), and the probe's auto
    // step-up for THIS body collapses so the rig cannot climb the lean it is
    // creating. Stamped before the no-pump gate: following a body already at
    // target speed is still pushing it.
    if (!fling) b._pushMs = performance.now();
    var dirx = vx / sp, diry = vy / sp;
    // Blob's current COM speed along the travel direction, in REAL px/s.
    var blobAlong = (b.vx * dirx + b.vy * diry) * JELLO_TIMESCALE;
    var targetReal = (fling ? JELLO_FLING : JELLO_PUSH) * sp;
    if (blobAlong >= targetReal) return;                       // at/above target — don't pump
    var deficit = targetReal - blobAlong;                      // real px/s still to impart
    if (!fling) {
      // Rate-limited drive: accelerate toward the target instead of setting it in
      // one shot (the one-shot set at walk speed was the rejected v24.125 "slides
      // when I push it" skate). Mass-scaled: 2/tiles, so a couple of tiles takes
      // the full 900 px/s^2 and an 8-tile slab spools at ~a third of that.
      var pppt = (b.npt ? (b.npt + 1) * (b.npt + 1) : 16);
      var ptiles = b.n / pppt; if (ptiles < 1) ptiles = 1;
      var pmassF = 2 / ptiles; if (pmassF > 1) pmassF = 1; else if (pmassF < 0.35) pmassF = 0.35;
      var pmaxAdd = JELLO_PUSH_ACCEL * pmassF * (frameDt || 0.016);
      if (deficit > pmaxAdd) deficit = pmaxAdd;
    }
    var addSim = deficit / JELLO_TIMESCALE;                    // real -> sim px/s
    var shift = addSim * JELLO_H * jelloImpulseScale();        // Verlet prev-pos shift (px; solver-dt aware)
    // BAT LOFT (v24.125, FLING only): tilt a mostly-horizontal launch upward so the
    // body goes briefly airborne (see the JELLO_FLING_LOFT comment) — same gated
    // magnitude, direction only. The no-pump gate keeps reading the TRAVEL dir; the
    // loft's vertical part is reclaimed by gravity, so it cannot accumulate either.
    var ldx = dirx, ldy = diry;
    if (fling && JELLO_FLING_LOFT > 0) {
      ldy = diry - JELLO_FLING_LOFT * (dirx < 0 ? -dirx : dirx);
      var ll = Math.sqrt(ldx * ldx + ldy * ldy);
      if (ll > 1e-6) { ldx /= ll; ldy /= ll; }
    }
    var sx = ldx * shift, sy = ldy * shift;
    var ox = b.ox, oy = b.oy, n = b.n;
    // SPIN GRADIENT (v24.125): grade the launch by each point's height in the body —
    // top leaves faster, base slower, MEAN EXACTLY the uniform shift (the no-pump
    // gate reads the COM, which this leaves untouched). The gradient is an angular
    // velocity, so a rammed body TUMBLES off ("rolls") instead of skating off.
    // |dirx|-scaled: a straight-down dive keeps the v24.94 uniform punch. The push
    // tier takes a quarter of it — a readable forward LEAN while bulldozing.
    var spinS = (fling ? JELLO_FLING_SPIN : JELLO_FLING_SPIN * 0.25) * (dirx < 0 ? -dirx : dirx);
    if (spinS > 0.01) {
      var fpy2 = b.py, fT = b.bboxT, fH = b.bboxB - fT;
      if (fH > 4) {
        for (var k = 0; k < n; k++) {
          var hf = (b.bboxB - fpy2[k]) / fH;                   // 1 at the top, 0 at the base
          if (hf < 0) hf = 0; else if (hf > 1) hf = 1;
          var g = 1 + spinS * (2 * hf - 1);                    // mean 1 over the height
          ox[k] -= sx * g; oy[k] -= sy * g;
        }
      } else {
        for (k = 0; k < n; k++) { ox[k] -= sx; oy[k] -= sy; }
      }
    } else {
      for (k = 0; k < n; k++) { ox[k] -= sx; oy[k] -= sy; }    // uniform -> clean whole-body launch
    }
    if (devMode) { if (fling) jelloDbg.flings++; }   // instrumentation: a whole-cube launch fired this frame
    if (fling && b.rippleCd <= 0) {
      var fAmp = deficit / JELLO_RIPPLE_VREF; if (fAmp > 1) fAmp = 1;
      jelloRippleInject(b, (px0 + px1) * 0.5, (py0 + py1) * 0.5, -fAmp * JELLO_RIPPLE_MAX * 0.7, 0);
      b.rippleCd = 0.1;
    }
    // Plow resistance: imparting momentum to the cube costs the rig some (Newton
    // reaction), so a pile SLOWS you (each driven cube bleeds a bit) and a heavy
    // slab leans on you while it spools. Charged on the APPLIED deficit. Bounded
    // so it can never reverse the rig.
    var _react = deficit * JELLO_PLOW_REACT;                    // real px/s of slowing
    var _along = player.vx * dirx + player.vy * diry;           // rig speed along the travel dir
    if (_react > _along) _react = _along;
    if (_react > 0) { player.vx -= dirx * _react; player.vy -= diry * _react; }
    b.sleeping = false; b.sleepFrames = 0;
  }

  // Bombs never destroy jello — a blast applies a radial impulse to points.
  // ----- Jello SFX (SFX_BIBLE §10 'jello-wobble') -----
  // One squelch per real impact, globally throttled: the solver can land many
  // contact events in a burst (multi-body blasts, ripple echoes) and the pool
  // of 3 + jitter only reads handmade when hits don't machine-gun.
  var jelloSfxLastMs = 0;
  function jelloSfxWobble(amp) {
    var nowW = performance.now();
    if (nowW - jelloSfxLastMs < 180) return;
    jelloSfxLastMs = nowW;
    sfxPlay('jello-wobble', { gain: 0.45 + 0.55 * (amp > 1 ? 1 : (amp < 0 ? 0 : amp)) });
  }

  function jelloBombShove(wx, wy, rad, power) {
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      var px = b.px, py = b.py, ox = b.ox, oy = b.oy, n = b.n;
      var hit = false;
      for (var i = 0; i < n; i++) {
        var dx = px[i] - wx, dy = py[i] - wy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > rad) continue;
        var fall = 1 - d / rad;
        var imp = power * fall * fall * 0.04 * jelloImpulseScale();   // 0.04 + solver-dt scale folded in
        var nx, ny;
        if (d > 1e-3) { nx = dx / d; ny = dy / d; } else { nx = 0; ny = -1; }
        // Verlet impulse = shift previous position opposite the kick.
        ox[i] -= nx * imp;
        oy[i] -= ny * imp;
        hit = true;
      }
      if (hit) {
        // Ripple: wide bump at the blast-facing side, amplitude by blast falloff there.
        var ndx = b.cx - wx, ndy = b.cy - wy;
        var nd = Math.sqrt(ndx * ndx + ndy * ndy);
        var bFall = 1 - nd / rad; if (bFall < 0.25) bFall = 0.25; if (bFall > 1) bFall = 1;
        jelloRippleInject(b, wx, wy, -bFall * JELLO_RIPPLE_MAX, 4);
        b.rippleCd = 0.08;
        b.sleeping = false; b.sleepFrames = 0;
        jelloSfxWobble(bFall);
      }
    }
  }

  // A hard landing on top of a cube punches the contact patch down + wakes it,
  // scaled by impact speed. Called from the movement hook because the per-substep
  // couple can't see the impact (the ground probe zeroes player.vy first).
  function jelloLandImpact(cx, feetY, impactVy) {
    if (impactVy < 120 || jelloBodies.length === 0 || JELLO_IMPACT <= 0) return;
    // Gentle: a hard punch here caved the gel far below where the rig actually
    // lands (a visible disconnect). Small impulse just gives a little splash dip.
    var punch = (impactVy < 600 ? impactVy : 600) * 0.004 * JELLO_IMPACT * jelloImpulseScale();  // downward Verlet impulse (px; solver-dt aware)
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (cx < b.bboxL - 6 || cx > b.bboxR + 6) continue;
      if (b.bboxT > feetY + TILE || b.bboxB < feetY - TILE) continue;
      var px = b.px, py = b.py, oy = b.oy, n = b.n;
      var hit = false;
      for (var i = 0; i < n; i++) {
        var x = px[i];
        if (x < cx - PLAYER_W * 0.7 || x > cx + PLAYER_W * 0.7) continue;
        if (py[i] > feetY + TILE * 0.8) continue;   // only the upper contact region
        oy[i] -= punch;                              // lower prev-Y -> downward velocity (Verlet)
        hit = true;
      }
      if (hit) {
        var lAmp = impactVy / 600; if (lAmp > 1) lAmp = 1;
        jelloRippleInject(b, cx, feetY, -lAmp * JELLO_RIPPLE_MAX, 2);
        b.rippleCd = 0.08;   // the world-hit echoes of the same landing don't double-inject
        b.sleeping = false; b.sleepFrames = 0;
        jelloSfxWobble(lAmp);
      }
    }
  }

  // ----- Splat ("blorp") particles -----
  function spawnJelloSplat(x, y, count, speed, sizeScale, unused) {
    var hue = JELLO_RENDER_HUE;
    for (var i = 0; i < count; i++) {
      if (jelloSplats.length > 200) break;
      var ang = Math.random() * 6.283;
      var spd = speed * (0.35 + Math.random() * 0.85);
      var life = 0.32 + Math.random() * 0.46;
      jelloSplats.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - speed * 0.35,
        life: life, maxLife: life,
        r: (1.4 + Math.random() * 2.4) * sizeScale,
        hue: hue
      });
    }
  }

  function updateJelloSplats(dt) {
    for (var i = jelloSplats.length - 1; i >= 0; i--) {
      var s = jelloSplats[i];
      s.life -= dt;
      if (s.life <= 0) { jelloSplats.splice(i, 1); continue; }
      s.vy += JELLO_SPLAT_GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  // ----- Per-body bookkeeping: bbox, velocity, sleep/freeze -----
  // The sleep gate compares each point's position
  // against its frame-START snapshot (b.fpx/fpy, taken in updateJello). The old
  // gate read per-substep Verlet velocity, but at a tense rest equilibrium the
  // per-substep lambda reset replays the volume-vs-edge constraint fight every
  // substep, pulsing points ~0.1 px/substep — an INSTANTANEOUS read of ~100 px/s
  // that kept maxVsq above any sane threshold forever, so xpbd/fem bodies never
  // slept (harness-measured: sleepFrames pinned at 0). The pulses cancel over a
  // frame; real motion does not — frame-scale displacement is the honest
  // "visually still" signal. JELLO_SLEEP_VSQ keeps its px^2/s^2 units, but the
  // displacement is read at a FIXED 60fps reference frame (disp*60)^2, NOT the
  // live frameDt (v24.110): residual rest-contact noise has ~constant px/FRAME
  // amplitude (0.029 px at 60fps AND 120fps, harness-measured), so dividing by
  // the live frameDt made the same visually-still body read 2x the px/s on a
  // 120Hz display and never sleep there. "Visually still" is a per-rendered-
  // frame property; the reference keeps the lever meaning its 60fps calibration
  // at every refresh rate (slower real motion at low fps reads bigger = sleeps
  // later = the conservative direction).
  function jelloUpdateBody(b, dt) {
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var fpx = b.fpx, fpy = b.fpy;
    var l = 1e9, r = -1e9, t = 1e9, btm = -1e9;
    var sumVX = 0, sumVY = 0, maxVsq = 0, sumX = 0, sumY = 0, maxFsq = 0;
    var invDt = dt > 1e-6 ? 1 / dt : 0;
    for (var i = 0; i < n; i++) {
      var x = px[i], y = py[i];
      if (x < l) l = x; if (x > r) r = x;
      if (y < t) t = y; if (y > btm) btm = y;
      sumX += x; sumY += y;
      var vx = (x - ox[i]) * invDt, vy = (y - oy[i]) * invDt;
      sumVX += vx; sumVY += vy;
      var vsq = vx * vx + vy * vy;
      if (vsq > maxVsq) maxVsq = vsq;
      if (fpx) {
        var fdx = x - fpx[i], fdy = y - fpy[i];
        var fsq = fdx * fdx + fdy * fdy;
        if (fsq > maxFsq) maxFsq = fsq;
      }
    }
    b.bboxL = l; b.bboxR = r; b.bboxT = t; b.bboxB = btm;
    b.cx = sumX / n; b.cy = sumY / n;   // centroid (for the closed-ring miner barrier)
    b.vx = sumVX / n; b.vy = sumVY / n;
    if (maxVsq > jelloMaxVsq) jelloMaxVsq = maxVsq;   // perf-panel blow-up gauge (max across bodies)
    // Sleep tracking (frame-displacement basis at the fixed 60fps reference —
    // see the function banner; falls back to the old instantaneous gate if the
    // frame snapshot is missing).
    var stillSq = fpx ? maxFsq * 3600 : maxVsq;
    // _forceSleep (v25.28): the CHRONIC-fold endpoint. A deep confined fold's
    // constraint fight re-injects motion DURING every solve, so neither the
    // becalm nor any velocity bleed can ever bring stillSq under the bar — the
    // accept/heal cycle churned forever (harness T1, an inv-7 fold pinned at
    // the pen wall). After the third acceptance grant the fold is proven
    // load-bearing: sleep it AS IS (sleep skips the solve, so the fight stops;
    // any disturbance wakes it into fresh heal cycles).
    if (((stillSq < JELLO_SLEEP_VSQ && !b._invHard && !b._grabbed && !b._carried &&
          !(b.actor && b.actor.enabled) && !(b._recoverT > 0))) || b._forceSleep) {   // never sleep mid-mangle, carry, actuation, or recovery
      b.sleepFrames++;
      if (b.sleepFrames > JELLO_SLEEP_FRAMES || b._forceSleep) {
        b._forceSleep = false;
        // Sleep = the "visually still" contract: present the TRUE resting ring. A body
        // that dozes off mid-ring would freeze a wavy outline indefinitely (and a frozen
        // off-camera body holds its field forever by design), so the render-space ripple
        // is cleared at the moment of sleep (v24.114 — the owner's "balloon cubes").
        if (!b.sleeping && b.rippleOn) {
          b.rippleU.fill(0); b.rippleP.fill(0); b.rippleOn = false; b._ripT = 0;
        }
        b.sleeping = true;
      }
    } else {
      b.sleepFrames = 0;
      b.sleeping = false;
    }
  }

  // ----- PERCH HOLD (v24.168) — see the JELLO_PERCH lever banner. Two halves: a
  // tile-support test, and the body-level hold that keeps a resting body from
  // free-falling when its support is dug away (the wide/stepped-hole drain the
  // 1-wide gap block can't see). -----
  // Tile support directly under the body's footprint? Samples three x lines just
  // below the bbox bottom. Tile-only (live bodies aren't in the grid) — which is
  // exactly right: a slime resting on dirt is "supported", and the dirt being dug
  // is the event that removes that support. A body resting on ANOTHER body reads
  // "unsupported", but it also isn't sinking (the body below holds it), so the hold
  // below is a no-op for it (drop ~ 0).
  function jelloSupportedBelowTile(b) {
    var yb = b.bboxB + TILE * 0.35;          // a third of a tile below the lowest point = inside the support row
    var xl = b.bboxL + 3, xc = b.cx, xr = b.bboxR - 3;
    if (xr < xl) { xr = xl; }
    return jelloWorldSolidAt(xl, yb) || jelloWorldSolidAt(xc, yb) || jelloWorldSolidAt(xr, yb);
  }
  // Called once per active body per frame, AFTER jelloUpdateBody (fresh cy / vx / vy).
  function jelloPerchHold(b) {
    if (!JELLO_PERCH) return;
    var spdReal = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * JELLO_TIMESCALE;   // real px/s (match the gap-block convention)
    if (spdReal > JELLO_PERCH_RELEASE) { b.perched = false; return; }       // DELIBERATELY driven -> normal physics
    var supported = jelloSupportedBelowTile(b);
    if (supported) {                                                        // resting on real ground
      b.perched = false;
      if (spdReal <= JELLO_PERCH_SLOW) b.perchY = b.cy;                     // remember the resting altitude
      return;
    }
    // Unsupported AND not deliberately driven.
    if (b.perchY == null) { b.perched = false; return; }                   // never had a perch -> let it fall (a body
                                                                           // spawned over open air just drops)
    var drop = b.cy - b.perchY;                                            // how far it has sunk below the perch
    if (drop > JELLO_PERCH_MAXDROP) { b.perchY = b.cy; b.perched = false; return; }  // far below -> it fell here legitimately
    if (drop <= 0) { b.perched = true; return; }                          // at/above perch already — nothing to undo
    // PIN: shift every point back up by `drop` and kill downward velocity (oy = py),
    // so a freshly undermined resting body holds its altitude instead of draining.
    var n = b.n, py = b.py, oy = b.oy;
    for (var i = 0; i < n; i++) { py[i] -= drop; oy[i] = py[i]; }
    b.cy -= drop; b.bboxT -= drop; b.bboxB -= drop; b.vy = 0; b.perched = true;
  }

  // ----- jelloGroundProbe: is there a jello surface under the player's feet? -----
  // Read-only, bounded. Returns a reused scratch object {surfaceY, vx, vy} or null.
  var _jGroundResult = { surfaceY: 0, vx: 0, vy: 0 };
  function jelloGroundProbe() {
    if (!player || jelloBodies.length === 0) return null;
    // Robust ring-crossing support test at THREE x lines across the footprint —
    // centre + left/right foot (v24.144). Centre-only missed the STRADDLE pose:
    // seated across the seam between two cubes, the centre line falls in the
    // inter-body contact gap (the per-particle contact holds rings a particle
    // radius apart), no ring crosses it, and the probe said "airborne" — so
    // rotation flight engaged and the rig could SPIN while sitting on a pile.
    // A foot line over either cube now counts as support; the topmost crossing
    // wins and its body supplies the ride velocity. Then sample the SURROUNDING
    // surface across the footprint, where the gel ISN'T pressed into the bowl,
    // and return THAT as surfaceY — so the rig sinks below the flat surrounding
    // gel into a bowl, with no feedback loop against the bowl it presses
    // (jelloDeformBowl carves the bowl).
    var feet = player.y + PLAYER_H;
    // Auto-step-up reach (how far ABOVE the feet a cube top may be and still be mountable). Full
    // reach while slow/landing (the soft catch must see the surface above dipping feet, and you can
    // step onto a low cube); DRIVING hard horizontally collapses it to a curb so a tall cube is a
    // WALL you plow into, not a staircase you ramp up. A flat top you rest/drive on is unaffected
    // (its surface is AT the feet, 0 above the feet).
    var _stepUp = (player.vx > JELLO_PLOW_SPEED || player.vx < -JELLO_PLOW_SPEED) ? JELLO_STEP_UP : TILE * 1.5;
    var yLo = feet - _stepUp, yHi = feet + TILE * 2;
    var fpL = player.x, fpR = player.x + PLAYER_W;
    var fpC = (fpL + fpR) * 0.5;
    var probeY = 1e9, bestVX = 0, bestVY = 0, found = false;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.bboxR < fpL || b.bboxL > fpR) continue;   // no part of this body under the rig
      if (b.bboxB < yLo || b.bboxT > yHi) continue;
      // PER-BODY ADAPTIVE probe line (v24.144): the rig centre clamped into this
      // body's overlap with the footprint (2px inboard so a corner graze can't
      // produce a degenerate crossing). A single fixed centre line missed the
      // STRADDLE pose — seated across two touching cubes the centre falls in the
      // inter-body contact gap, no ring crosses it, the probe said "airborne",
      // rotation flight engaged (the owner could spin seated on a pile) and the
      // unsupported rig slowly wedged the pair apart and sank through. Now each
      // overlapping body is probed where it actually sits under the rig, so
      // support holds as long as ANY gel remains under ANY part of the feet.
      // A body the PUSH tier is actively bulldozing is NOT a floor (v24.151): the
      // squeezed gel piles up around the rig's nose down to ground level, the probe
      // grounded the rig on that bulge AT its own feet height, and the ride spring
      // then ratcheted the rig up the growing pile — every bulldoze ended with the
      // rig surfing over the cube. Skipping the pushed body entirely keeps the rig
      // planted; releasing the input (120 ms TTL) restores normal step-up/climbing.
      if (b._pushMs !== undefined && performance.now() - b._pushMs < 120) continue;
      var oL = (b.bboxL + 2 > fpL) ? b.bboxL + 2 : fpL;
      var oR = (b.bboxR - 2 < fpR) ? b.bboxR - 2 : fpR;
      if (oL > oR) continue;                          // sliver overlap — not real support
      var qx = fpC < oL ? oL : (fpC > oR ? oR : fpC);
      var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
      if (rn < 3) continue;
      var localTop = 1e9;
      var prevX = px[ring[rn - 1]], prevY = py[ring[rn - 1]];
      for (var i = 0; i < rn; i++) {
        var cur = ring[i];
        var curX = px[cur], curY = py[cur];
        if ((prevX <= qx && curX >= qx) || (prevX >= qx && curX <= qx)) {
          var dxe = curX - prevX;
          var yC = (dxe < 1e-6 && dxe > -1e-6) ? (prevY < curY ? prevY : curY)
                                               : prevY + (curY - prevY) * (qx - prevX) / dxe;
          if (yC >= yLo && yC <= yHi && yC < localTop) localTop = yC;
        }
        prevX = curX; prevY = curY;
      }
      if (localTop < 1e8 && localTop < probeY) { probeY = localTop; bestVX = b.vx; bestVY = b.vy; found = true; }
    }
    if (!found) return null;
    // Resting surface = the TOPMOST gel under the rig's FOOTPRINT [player.x, +PLAYER_W],
    // PLUS two outboard samples restricted to footprint-overlapping bodies (v24.144).
    // History: the old code sampled ~1*PLAYER_W out on each side and AVERAGED across ALL
    // bodies; next to a tall neighbour the outboard sample hit that taller blob and the rig
    // FLOATED at the mid-air average — so v22.16 cut sampling to the footprint, topmost
    // (min y), relying on the footprint EDGES being the least-bowled spots (jelloDeformBowl
    // tapers the bowl back up there). On a SEAM (seated across two touching cubes) that
    // geometry inverts: the foot lines sit on the cubes' INNER shoulders — the most-bowled
    // spots — so the sampled surface drooped with the carve, the spring equilibrium drooped
    // with it, and the rig ratcheted down the V until it wedged through to the dirt. The
    // outboard samples read the supporting cubes' un-bowled flat tops (topmost wins), which
    // anchors the spring to the REAL resting surface; the footprint-overlap filter on
    // jelloSurfaceYAt keeps taller non-supporting neighbours out (no float regression).
    var surr = 1e9;
    for (var _si = 0; _si <= 4; _si++) {
      var _sy = jelloSurfaceYAt(player.x + PLAYER_W * (_si * 0.25), feet);
      if (isFinite(_sy) && _sy < surr) surr = _sy;
    }
    // ±1.0*PLAYER_W puts the anchor BEYOND jelloDeformBowl's carve reach (halfW +
    // 0.8*W from the rig centre) — anchoring any closer samples the bowl's own
    // taper, so the reference drooped with the carve and the seat ratcheted down.
    var _obL = jelloSurfaceYAt(player.x - PLAYER_W, feet, player.x, player.x + PLAYER_W);
    if (isFinite(_obL) && _obL < surr) surr = _obL;
    var _obR = jelloSurfaceYAt(player.x + PLAYER_W * 2, feet, player.x, player.x + PLAYER_W);
    if (isFinite(_obR) && _obR < surr) surr = _obR;
    if (surr > 1e8) surr = probeY;   // no gel under the footprint band -> fall back to the probe crossing
    _jGroundResult.surfaceY = surr;
    // The ride hands these straight into player.vy (the suspension damps RELATIVE to the
    // gel), so a corrupt body velocity here would NaN the rig's own integrator. The finite
    // sweep makes this unreachable in practice; the guard makes it unreachable, period.
    _jGroundResult.vx = isFinite(bestVX) ? bestVX : 0;
    _jGroundResult.vy = isFinite(bestVY) ? bestVY : 0;
    return _jGroundResult;
  }

  // ----- jelloDeformBowl: carve a real BOWL in the boundary under the resting rig.
  // Directly conforms the top of the gel down to the rig's feet (clamped, so NO
  // gel ever sits above the feet under the rig -> the rig is never visually inside
  // the membrane), tapering back up to the surrounding surface at the bowl walls.
  // This is what makes it read as SINKING INTO the jello (a membrane bowl) rather
  // than clipping below a flat edge. The gel's own springs hold the walls + spring
  // the bowl back once the rig leaves. Runs once per frame while on jello. -----
  function jelloDeformBowl() {
    if (!player || !player.onJello || jelloBodies.length === 0) return;
    var px0 = player.x, px1 = player.x + PLAYER_W;
    var cx = (px0 + px1) * 0.5;
    var feetY = player.y + PLAYER_H;
    var halfW = PLAYER_W * 0.5;
    var wall = PLAYER_W * 0.8;
    var reach = halfW + wall;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.bboxR < cx - reach || b.bboxL > cx + reach) continue;
      if (b.bboxT > feetY + TILE) continue;        // body top must be near the feet (rig on top)
      // ...and the body must reach DOWN to the feet — the rig can only rest ON
      // something below it, never a body floating ABOVE. WITHOUT this, a slime in
      // the SAME COLUMN but far overhead (e.g. on the surface while the rig rides a
      // cube at the bottom of a shaft) passed the column gate, had every point
      // y < feetY, and got its whole top eased DOWN toward feetY every frame — a
      // body 6+ tiles up, separated by SOLID DIRT, dragged straight down to the rig
      // (the owner's "step on one slime and the one above pulls down through dirt").
      // The bowl only ever dents the surface the rig stands ON, so a body entirely
      // above the feet is never a bowl target. (v24.170)
      if (b.bboxB < feetY - TILE) continue;
      var px = b.px, py = b.py, ox = b.ox, oy = b.oy, n = b.n;
      var dampReach = reach * 1.4;                   // settle a bit past the bowl, to catch the side-bulges
      var moved = false;
      for (var i = 0; i < n; i++) {
        var x = px[i], y = py[i];
        if (y > feetY + TILE * 0.6) continue;       // only the top region (don't disturb the floor)
        var dxc = x - cx; if (dxc < 0) dxc = -dxc;
        var tY = -1;
        if (dxc <= halfW) {
          tY = feetY;                                // directly under the rig: dent down toward the feet
        } else if (dxc <= reach) {
          var tprof = (dxc - halfW) / wall;          // 0 at rig edge .. 1 at wall edge
          tY = feetY * (1 - tprof) + y * tprof;      // bowl wall taper (at the edge -> y, no push)
        }
        // GENTLE + VELOCITY-FREE: ease the surface toward the target by a fraction
        // (was a HARD clamp py[i]=feetY directly under the rig, which crushed the gel
        // flat against the ground and made it implode). Now the gel RESISTS being
        // pressed (the incompressibility floor + pressure bulge it back), so it dents
        // like a water balloon instead of being compressed to nothing.
        if (tY >= 0 && y < tY) {
          var ny2 = y + (tY - y) * JELLO_BOWL;
          oy[i] += ny2 - y;                          // shift previous pos too -> no energy injected
          py[i] = ny2; moved = true;
        }
        // SETTLE the gel around a resting rig (the dent + the displaced side-bulges)
        // so it stops "joggling": absorb velocity (move the previous pos toward the
        // current pos). The underdamped gel rings forever otherwise; this only acts
        // local to the rig, so the rest of the body keeps its lively wobble.
        if (dxc <= dampReach) {
          ox[i] += (px[i] - ox[i]) * JELLO_REST_DAMP;
          oy[i] += (py[i] - oy[i]) * JELLO_REST_DAMP;
          moved = true;
        }
      }
      // Contact NUDGE wake (a sleeper touched by an awake neighbour): wake it,
      // but do NOT re-earn the park window — per-frame neighbour nudges were
      // the wake ping-pong that kept piles from ever converging (the islands
      // exist for exactly this). A real shove shows up as stamps/net motion.
      if (moved && b.sleeping) { b.sleeping = false; b.sleepFrames = 0; }
    }
  }

  // Top gel-surface height at an arbitrary world-x (topmost ring crossing of the
  // vertical line x, within a band around feetY). NaN if no surface there. Used
  // to sample the slope under each of the rig's feet for the conform tilt.
  // Optional fL/fR: only consider bodies whose bbox overlaps that x-span (the
  // rig's footprint) — lets the ground probe sample a SUPPORTING body's un-bowled
  // top just OUTSIDE the rig without ever picking up a taller NEIGHBOUR body (the
  // pre-v22.16 float-in-the-gap bug that killed naive outboard sampling).
  function jelloSurfaceYAt(x, feet, fL, fR) {
    if (jelloBodies.length === 0) return NaN;
    var yLo = feet - TILE * 1.6, yHi = feet + TILE * 2;
    var best = 1e9;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (x < b.bboxL || x > b.bboxR) continue;
      if (fL !== undefined && (b.bboxR < fL || b.bboxL > fR)) continue;   // not under the rig -> not a support
      if (b._pushMs !== undefined && performance.now() - b._pushMs < 120) continue;   // being bulldozed -> not a surface
      if (b.bboxB < yLo || b.bboxT > yHi) continue;
      var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
      if (rn < 3) continue;
      var prevX = px[ring[rn - 1]], prevY = py[ring[rn - 1]];
      for (var i = 0; i < rn; i++) {
        var cur = ring[i], cX = px[cur], cY = py[cur];
        if ((prevX <= x && cX >= x) || (prevX >= x && cX <= x)) {
          var dxe = cX - prevX;
          var yC = (dxe < 1e-6 && dxe > -1e-6) ? (prevY < cY ? prevY : cY)
                                               : prevY + (cY - prevY) * (x - prevX) / dxe;
          if (yC >= yLo && yC <= yHi && yC < best) best = yC;
        }
        prevX = cX; prevY = cY;
      }
    }
    return best < 1e8 ? best : NaN;
  }

  // Ray-cast point-in-polygon test against a body's CURRENT boundary ring.
  function jelloPointInRing(b, qx, qy) {
    var ring = b.ring, rn = b.ringN, X = b.px, Y = b.py;
    if (rn < 3) return false;
    var inside = false, j = rn - 1;
    for (var i = 0; i < rn; i++) {
      var xi = X[ring[i]], yi = Y[ring[i]];
      var xj = X[ring[j]], yj = Y[ring[j]];
      if (((yi > qy) !== (yj > qy)) && (qx < (xj - xi) * (qy - yi) / (yj - yi) + xi)) inside = !inside;
      j = i;
    }
    return inside;
  }

  // Extreme ring-crossing of an axis-aligned line through a body — the gel SURFACE
  // depth along one axis. vertical=true: the line is x=c, returns the min-y crossing
  // (wantMax=false) or the max-y crossing; vertical=false: line is y=c, returns the
  // min-x or max-x crossing. NaN if the line misses the ring. Used to measure how far
  // the rig has sunk past a blob's flank (the lateral cousin of jelloSurfaceYAt).
  function jelloRingCross(b, vertical, c, wantMax) {
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
    if (rn < 3) return NaN;
    var best = wantMax ? -1e18 : 1e18, found = false;
    var ja = vertical ? px[ring[rn - 1]] : py[ring[rn - 1]];   // prev line-coordinate
    var jb = vertical ? py[ring[rn - 1]] : px[ring[rn - 1]];   // prev result-coordinate
    for (var i = 0; i < rn; i++) {
      var ia = vertical ? px[ring[i]] : py[ring[i]];
      var ib = vertical ? py[ring[i]] : px[ring[i]];
      if ((ja <= c && ia >= c) || (ja >= c && ia <= c)) {
        var dA = ia - ja;
        var res = (dA < 1e-6 && dA > -1e-6) ? jb : jb + (ib - jb) * (c - ja) / dA;
        if (wantMax ? (res > best) : (res < best)) { best = res; found = true; }
      }
      ja = ia; jb = ib;
    }
    return found ? best : NaN;
  }

  // Closest point on a body's boundary ring to (qx,qy). Writes into _jNear scratch.
  var _jNear = { x: 0, y: 0 };
  function jelloNearestOnRing(b, qx, qy) {
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
    var bestD = 1e18;
    var jx = px[ring[rn - 1]], jy = py[ring[rn - 1]];
    for (var i = 0; i < rn; i++) {
      var ix = px[ring[i]], iy = py[ring[i]];
      var ex = ix - jx, ey = iy - jy;
      var len2 = ex * ex + ey * ey;
      var t = len2 > 1e-9 ? ((qx - jx) * ex + (qy - jy) * ey) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var cx = jx + ex * t, cy = jy + ey * t;
      var ddx = qx - cx, ddy = qy - cy;
      var dd = ddx * ddx + ddy * ddy;
      if (dd < bestD) { bestD = dd; _jNear.x = cx; _jNear.y = cy; }
      jx = ix; jy = iy;
    }
    return _jNear;
  }

  // (v22 unified-contact rebuild) Body-body collision is now jelloContactSolve — a per-particle
  // contact solved INSIDE the substep loop via the global spatial hash. The old once-per-frame
  // boundary push (jelloResolveBodies / jelloPushOutOf / jelloSeparatePair / jelloRefreshBounds)
  // is removed; jelloPointInRing / jelloNearestOnRing above are kept (used by player coupling).

  // ----- jelloResolvePlayer: HARD CONTAINMENT — the rig can NEVER be inside a jello
  // ring (per frame). ----------------------------------------------------------------
  // Collision is kept SEPARATE from the squish (jelloPlayerCouple deforms the gel like
  // memory foam): THIS guarantees, geometrically, that no part of the rig is ever
  // inside a blob's boundary — so the player can't be absorbed or pushed through, no
  // matter how hard they press. Sample the rig's whole perimeter densely (~5px apart,
  // finer than the ring vertex spacing); if ANY sample is inside a ring, eject the rig
  // to just OUTSIDE along the shortest exit (nearest boundary point), a few passes so
  // corners resolve, killing the inward velocity each time so a held drive can't
  // re-penetrate. Because the rig is always held outside, the gel it compresses against
  // a wall is BOUNDED (it can only squeeze as far as the rig+wall geometry allows),
  // which is also what stops the squish from being driven to a blow-up. (On-top resting
  // is owned by the ground probe, so skip it here.)
  function jelloResolvePlayer(frameDt) {
    if (!player || jelloBodies.length === 0 || gameWon || gameOver) return;
    // HARD containment, ALWAYS, including while grounded. Previously this bailed when player.onJello,
    // which switched OFF all side-blocking while you were resting on a cube, so a rig grounded on one
    // cube slid straight THROUGH a neighbouring (e.g. diagonal) cube and then floated out the top.
    // Now it runs while grounded too, but resolves only HORIZONTAL penetration (driving INTO a cube
    // face); the VERTICAL rest contact under the feet is left to the ground probe (grounding owns the
    // vertical, this owns the horizontal). So you impress on a cube face and can never glide inside,
    // even grounded, while resting on / driving across a top is undisturbed.
    // v24.94 overhaul: the ejection is RATE-BUDGETED (JELLO_EJECT_RATE px/s, with a
    // JELLO_EJECT_SNAP instant floor for shallow grazes) instead of a one-frame full
    // teleport - the old full eject read as a POP, worst right after a drill ended on
    // a deep overlap. Deep overlap now ALSO resolves from the blob's side: the gel
    // inside the rig's box yields out of the way (velocity-free) at JELLO_YIELD_RATE.
    // Containment now runs DURING drilling too (only the velocity kill is skipped),
    // so there is no post-drill discontinuity. Anti-softlock: if a deep overlap
    // persists > 0.5 s, one full legacy eject clears it. Two-way momentum: a blob
    // advancing on the rig hands over approach speed, mass-ratio split.
    var _onTop = player.onJello;
    // Planted on solid tiles: gel ejections go HORIZONTAL too (v24.151). While
    // bulldozing, the squeeze-bulge's up-tilted exit normals popped the planted
    // rig a few px airborne every ~half second; rotation flight then captured the
    // held arrow for a beat (walk input died) — the harness's stall rhythm. The
    // floor owns vertical while standing on it; the gel yields aside instead.
    var _onSolid = player.onGround && !player.onJello;
    var _drill = !!drilling;
    var rigSp = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    var flinging = rigSp >= JELLO_FLING_MIN;
    var STEPS = 6;                // samples per rig edge (~5px apart, < ring vertex spacing)
    var MARGIN = 1.0;             // park just outside the membrane
    var ejected = false;
    // DEPTH-ESCALATED budget (v24.154): ordinary contact keeps the gentle
    // JELLO_EJECT_RATE (no pops), but if last frame left the rig DEEP inside gel
    // (a swallow in progress — pile-on, mangled-ring leak, drill exit) the budget
    // ramps up to 4x so the containment can actually win the race out.
    var _deepPrev = player._jDeepLast || 0;
    var budget = JELLO_EJECT_RATE * frameDt * (1 + 3 * Math.min(1, _deepPrev / PLAYER_W));
    if (budget < JELLO_EJECT_SNAP) budget = JELLO_EJECT_SNAP;
    var hitBody = null, nxL = 0, nyL = 0, deepest = 0;
    for (var pass = 0; pass < 6; pass++) {
      var px0 = player.x, px1 = player.x + PLAYER_W;
      var py0 = player.y, py1 = player.y + PLAYER_H;
      var bestD2 = 0, bnx = 0, bny = 0, found = false;
      for (var bi = 0; bi < jelloBodies.length; bi++) {
        var b = jelloBodies[bi];
        if (b.ringN < 3) continue;
        if (b.bboxR <= px0 || b.bboxL >= px1 || b.bboxB <= py0 || b.bboxT >= py1) continue;
        for (var e = 0; e < 4; e++) {
          for (var s = 0; s < STEPS; s++) {
            var t = s / STEPS, sx, sy;
            if (e === 0)      { sx = px0 + (px1 - px0) * t; sy = py0; }   // top edge
            else if (e === 1) { sx = px1; sy = py0 + (py1 - py0) * t; }   // right edge
            else if (e === 2) { sx = px1 - (px1 - px0) * t; sy = py1; }   // bottom edge
            else              { sx = px0; sy = py1 - (py1 - py0) * t; }   // left edge
            if (sx < b.bboxL || sx > b.bboxR || sy < b.bboxT || sy > b.bboxB) continue;
            // While SEATED, the bottom band of the hull (the seam-mouth / ride-sink zone,
            // RIDE_SINK + a few px) belongs to the grounding spring + bowl, not the side
            // blocker. Seated across a SEAM the bottom corners press the V between the two
            // cubes; ejecting them "horizontally out" + yielding the gel sideways acted as a
            // WEDGE that spread the pair a little every frame until the rig fell through
            // (v24.144). Upper side samples still block driving into a tall face.
            if (_onTop && sy > py1 - (JELLO_RIDE_SINK + 6)) continue;
            if (!jelloPointInRing(b, sx, sy)) continue;
            var near = jelloNearestOnRing(b, sx, sy);
            var ex = near.x - sx, ey = near.y - sy;   // sample -> boundary = the outward exit
            // While grounded, ignore VERTICAL (rest) contacts under the feet so containment doesn't
            // fight the ground probe; only block HORIZONTAL penetration (driving INTO a cube face).
            if (_onTop && Math.abs(ey) >= Math.abs(ex)) continue;
            var d2 = ex * ex + ey * ey;
            if (d2 > bestD2) { bestD2 = d2; bnx = ex; bny = ey; found = true; hitBody = b; }
          }
        }
      }
      if (!found) break;                              // no sample inside any ring -> fully contained
      var d = Math.sqrt(bestD2); if (d < 1e-3) d = 1;
      var nx = bnx / d, ny = bny / d;
      if (_onTop || _onSolid) ny = 0;                  // grounded: eject HORIZONTALLY only (ground probe / floor own vertical)
      nxL = nx; nyL = ny;
      if (d > deepest) deepest = d;
      var corr = d + MARGIN;
      if (corr > budget) corr = budget;                // rate-budgeted: never a one-frame teleport
      budget -= corr;
      var nxp = player.x + nx * corr, nyp = player.y + ny * corr;
      if (!solidAt(nxp, player.y, PLAYER_W, PLAYER_H)) player.x = nxp;
      if (!solidAt(player.x, nyp, PLAYER_W, PLAYER_H)) player.y = nyp;
      // Kill the inward velocity RELATIVE to the contacted body (v24.151). The old
      // absolute kill (zero the rig's inward component) is correct against a STATIC
      // wall but wrong against a body the rig is PUSHING: it bonked the rig to a
      // stop every contact frame while the blob rolled away, which is why pushing
      // never worked. Matching the blob's velocity at the contact lets the rig roll
      // along with what it shoves; against a sleeping blob (bv=0) it is exactly the
      // old behaviour. Only while the rig is actively moving INTO the gel (vnAbs<0)
      // — a blob advancing on a still rig keeps the mass-split two-way handover
      // below as its only channel, not an instant infinite-mass velocity match.
      var vnAbs = player.vx * nx + player.vy * ny;     // inward (toward the gel) = negative
      var bvnR = hitBody ? (hitBody.vx * nx + hitBody.vy * ny) * JELLO_TIMESCALE : 0;
      var vn = vnAbs - bvnR;                           // approach RELATIVE to the gel
      if (vnAbs < 0 && vn < 0 && !_drill && (!flinging || d > JELLO_EJECT_SNAP)) { player.vx -= nx * vn; player.vy -= ny * vn; }
      ejected = true;
      if (budget <= 0.01) break;
    }
    player._jDeepLast = deepest;   // drives next frame's escalated budget
    // Anti-softlock backstop: a deep overlap that persists (the budget can't clear
    // it because the blob keeps advancing) gets one full legacy eject. v24.154:
    // threshold 0.5W -> 0.35W and 0.5s -> 0.2s — being inside the slime for half a
    // second read as the engulf glitch; a swallowed rig now pops free fast.
    if (deepest > PLAYER_W * 0.35) {
      player._jStuckT = (player._jStuckT || 0) + frameDt;
      if (player._jStuckT > 0.2) {
        var fxp = player.x + nxL * (deepest + MARGIN), fyp = player.y + nyL * (deepest + MARGIN);
        if (!solidAt(fxp, player.y, PLAYER_W, PLAYER_H)) player.x = fxp;
        if (!solidAt(player.x, fyp, PLAYER_W, PLAYER_H)) player.y = fyp;
        player._jStuckT = 0;
      }
    } else player._jStuckT = 0;
    if (hitBody && ejected) {
      // BLOB YIELD: gel inside the rig's box squeezes OUT along the exit normal
      // (velocity-free), so a deep overlap (e.g. drilling into a blob's space)
      // dissolves by the gel moving aside instead of the rig popping.
      var yAmt = JELLO_YIELD_RATE * frameDt;
      var ypx = hitBody.px, ypy = hitBody.py, yox = hitBody.ox, yoy = hitBody.oy;
      var rx0 = player.x - 1, rx1 = player.x + PLAYER_W + 1;
      var ry0 = player.y - 1, ry1 = player.y + PLAYER_H + 1;
      for (var yi = 0; yi < hitBody.n; yi++) {
        if (ypx[yi] > rx0 && ypx[yi] < rx1 && ypy[yi] > ry0 && ypy[yi] < ry1) {
          ypx[yi] -= nxL * yAmt; ypy[yi] -= nyL * yAmt;
          yox[yi] -= nxL * yAmt; yoy[yi] -= nyL * yAmt;
        }
      }
      // TWO-WAY MOMENTUM: a blob advancing into the rig hands over its approach
      // speed, mass-ratio split, with the equal-and-opposite reaction on the blob
      // (uniform ox shift - the same clean whole-body channel as the fling).
      if (!_drill && JELLO_RIG_PUSH > 0) {
        var bvx = hitBody.vx * JELLO_TIMESCALE, bvy = hitBody.vy * JELLO_TIMESCALE;
        var rel = (bvx - player.vx) * nxL + (bvy - player.vy) * nyL;   // blob gaining on the rig along the exit
        if (rel > 20) {
          // Per-tile mass: points-per-tile depends on the body's lattice density
          // ((npt+1)^2 per single-tile body), so divide by the body's own figure -
          // at fixed density this is the old n/16, and a dense npt-5 cube no
          // longer reads 2.25x heavier than its actual tile count.
          var MRppt = (hitBody.npt ? (hitBody.npt + 1) * (hitBody.npt + 1) : 16);
          var MR = JELLO_MASS_RATIO * hitBody.n / MRppt;
          var dvR = rel * JELLO_RIG_PUSH * (MR / (1 + MR));
          var dvB = rel * JELLO_RIG_PUSH * (1 / (1 + MR));
          player.vx += nxL * dvR; player.vy += nyL * dvR;
          var bShift = (dvB / JELLO_TIMESCALE) * JELLO_H * jelloImpulseScale();
          var box2 = hitBody.ox, boy2 = hitBody.oy;
          for (var bk = 0; bk < hitBody.n; bk++) { box2[bk] += nxL * bShift; boy2[bk] += nyL * bShift; }
          hitBody.sleeping = false; hitBody.sleepFrames = 0;
        }
      }
    }
    if (ejected) {
      var spd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (spd > 180) {
        var nowMs = performance.now();
        if (player._jSplT === undefined || nowMs - player._jSplT > 150) {
          spawnJelloSplat(player.x + PLAYER_W * 0.5, player.y + PLAYER_H * 0.5, 6, spd * 0.4 + 40, 0.85, null);
          player._jSplT = nowMs;
        }
      }
    }
  }

  // ----- BODY-BODY UNMERGE (v25.18) — no slime can stay inside another --------------
  // The per-particle contact + the containment backstop keep normally-colliding
  // bodies apart, but a CONFINED pile (cubes crammed into a dug pocket with more
  // dropped on top) can interleave two very soft rings faster than those passes
  // separate them, and once one body's CENTROID is inside another's ring the
  // point-level machinery has no notion of "who is inside whom" — the pair sits
  // visibly merged (the owner's screenshot). Centroid-inside is unambiguous
  // wrongness (a legal squish never puts one centroid inside another ring), so
  // once per frame any such pair is pulled apart RIGIDLY: both bodies take a
  // uniform, velocity-free, rate-limited shift along their centroid axis, split
  // by tile mass (the lighter one moves more). The normal solve re-settles the
  // gel as they separate, so it reads as blobs oozing apart, never a pop. A
  // shift can nose points into a wall at ~1.5 px/frame worst case; the next
  // substep's world collide (velocity-free) resolves that, as everywhere else.
  var JELLO_UNMERGE_RATE = 90;   // px/s of combined separation while a pair is merged
                                 // (escalates to 4x after 2s stuck — see _mergeT below)
  // ----- CROWD CALM (v25.20) — an overfilled pocket sits still instead of churning ----
  // When the player crams more gel into a dug pocket than fits, the constraint set is
  // INFEASIBLE: volume re-inflation, contact, containment and the walls fight forever,
  // and the only bound left is the VMAX clamp — the pile vibrates at the cap (owner's
  // screenshot: vmax pinned at 600 with 629 contacts). Real crushed gel just sits there
  // pressurized. So each body tracks sustained heavy contact (_cHits per frame vs its
  // point count); past ~0.75s of it, a per-frame velocity bleed drains the churn and the
  // pile parks, squeezed and still. The bleed touches velocity only (ox toward px), never
  // positions, so the squeeze itself is untouched and any real push wakes it right up.
  var JELLO_CROWD_CALM = 0.2;    // fraction of velocity drained per frame under sustained crowd pressure
  var JELLO_CROWD_ON   = 0.12;   // pressure floor of the accrual band: BELOW it pressT decays; the
                                 // accrual rate ramps 0 -> 1 across [ON, ON + 0.18]. (A 0.2 floor was
                                 // tried in v25.24 to keep face contact from priming pressT — it
                                 // weakened cram drainage instead, harness-measured; the SPEED FLOOR
                                 // at the drain is the real fix for the post-push syrup, and with it
                                 // in place an armed pressT is harmless to slow settles.)
  function jelloShiftBody(b, dx, dy) {
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    for (var i = 0; i < n; i++) { px[i] += dx; py[i] += dy; ox[i] += dx; oy[i] += dy; }
    b.cx += dx; b.cy += dy; b.bboxL += dx; b.bboxR += dx; b.bboxT += dy; b.bboxB += dy;
  }
  // ----- IN-WALL RESCUE (v25.23) — nothing may PERSIST inside solid ----------------
  // Belt over every transport guard (entry-side lock, room probes, path-probed
  // shifts): if some race still parks a body inside terrain (the owner's squished
  // ghost among solid blocks), a body whose CENTROID sits in solid for a sustained
  // second is relocated WHOLE to the nearest open tile centre (3-ring spiral),
  // velocity-free with splats at both ends — the established "gel tension releases"
  // read. Returns false when no open tile is in reach (the caller despawns: a
  // popped slime, never a wall ghost).
  function jelloRescueFromWall(b) {
    // Anchor the search on the body's OPEN-POINT MASS, not its centroid (v25.23
    // hotfix): a wall-pressed body's centroid can sit in the wall while most of
    // its points remain on the legitimate side — anchoring on the centroid let
    // the spiral cross a 1-tile wall's far side into a natural cave beyond it
    // (harness R5b: a body rescued OUT of a sealed pocket). Where the body's
    // open points are IS the right side; a fully-embedded ghost (no open
    // points) falls back to the centroid.
    var ax = 0, ay = 0, an = 0;
    for (var pi2 = 0; pi2 < b.n; pi2++) {
      if (!jelloWorldSolidAt(b.px[pi2], b.py[pi2])) { ax += b.px[pi2]; ay += b.py[pi2]; an++; }
    }
    if (an > 0) { ax /= an; ay /= an; } else { ax = b.cx; ay = b.cy; }
    var cr = Math.floor(ay / TILE), cc = Math.floor(ax / TILE);
    var bestD = 1e9, bx = 0, by = 0, found = false;
    for (var ring = 0; ring <= 3 && !found; ring++) {
      for (var dr = -ring; dr <= ring; dr++) {
        for (var dc = -ring; dc <= ring; dc++) {
          var mA = dr < 0 ? -dr : dr, mB = dc < 0 ? -dc : dc;
          if ((mA > mB ? mA : mB) !== ring) continue;    // this ring's shell only
          if (tileAt(cr + dr, cc + dc) !== null) continue;
          var tx = (cc + dc + 0.5) * TILE, ty = (cr + dr + 0.5) * TILE;
          // When the anchor is in OPEN space (a pressed body with a legitimate
          // side), the straight path from anchor to target may cross NO solid —
          // the rescue must never carry a pressed body through a wall (v25.24).
          // A FULLY-embedded body (no open points, anchor = centroid inside the
          // wall) has no meaningful side: skip the path probe and take the
          // nearest opening, or the body could only ever despawn.
          if (an > 0) {
            var pOK = true;
            for (var ps = 1; ps <= 4 && pOK; ps++) {
              if (jelloWorldSolidAt(ax + (tx - ax) * ps / 4, ay + (ty - ay) * ps / 4)) pOK = false;
            }
            if (!pOK) continue;
          }
          var dd = (tx - ax) * (tx - ax) + (ty - ay) * (ty - ay);
          if (dd < bestD) { bestD = dd; bx = tx; by = ty; found = true; }
        }
      }
    }
    if (!found) return false;
    try { console.warn('jello: wall rescue -> ' + Math.round(bx) + ',' + Math.round(by) + ' (open-mass anchor ' + Math.round(ax) + ',' + Math.round(ay) + ')'); } catch (e) {}
    spawnJelloSplat(b.cx, b.cy, 6, 70, 0.8, null);
    jelloShiftBody(b, bx - b.cx, by - b.cy);
    spawnJelloSplat(b.cx, b.cy, 6, 70, 0.8, null);
    b.sleeping = false; b.sleepFrames = 0;
    return true;
  }
  // Probe a body's LEADING bbox edge for solid tiles before a rigid unmerge shift:
  // shifting a body into sealed geometry drives points enclosed, and the enclosed-
  // point fallback (walk toward the centroid) can then WORM the body through a
  // solid wall — the harness caught one escaping a sealed 16-tile pocket. A blocked
  // side's share of the separation goes to the other body; both blocked = wall-
  // pinned, leave it to the crowd calm.
  function jelloUnmergeRoom(b, dx, dy) {
    // The probe span is INSET 3px from the orthogonal edges: a grounded body's
    // bottom points kiss (and transiently dip into) the floor line, so an
    // un-inset horizontal probe read "solid" at the bottom sample and falsely
    // wall-blocked sideways separation — a grounded merged pair then parked
    // forever (harness R9). The inset probes the body's MID-FACE, which is
    // what actually has to fit.
    var x0, y0, x1, y1;
    if ((dx < 0 ? -dx : dx) > (dy < 0 ? -dy : dy)) {
      var lx = (dx > 0 ? b.bboxR : b.bboxL) + dx;
      x0 = x1 = lx; y0 = b.bboxT + 3; y1 = b.bboxB - 3;
      if (y1 < y0) { y0 = y1 = (b.bboxT + b.bboxB) * 0.5; }
    } else {
      var ly = (dy > 0 ? b.bboxB : b.bboxT) + dy;
      y0 = y1 = ly; x0 = b.bboxL + 3; x1 = b.bboxR - 3;
      if (x1 < x0) { x0 = x1 = (b.bboxL + b.bboxR) * 0.5; }
    }
    // Samples every <= 6px (v25.23; was a fixed 5): 8px gaps between samples let a
    // face straddling a solid/air tile boundary pass the probe while part of it
    // entered solid — one of the transports behind the owner's wall ghost.
    var rn = Math.ceil(((x1 - x0) + (y1 - y0)) / 6); if (rn < 4) rn = 4;
    for (var s = 0; s <= rn; s++) {
      if (jelloWorldSolidAt(x0 + (x1 - x0) * s / rn, y0 + (y1 - y0) * s / rn)) return false;
    }
    return true;
  }
  var jelloUnmergePick = [];     // scratch: worst merged partner per active index (-1 = none)
  var jelloUnmergeD2 = [];       // scratch: that partner's centroid distance^2
  function jelloUnmergeBodies(frameDt, active, nActive) {
    if (nActive < 2 || JELLO_UNMERGE_RATE <= 0) return;
    var pick = jelloUnmergePick, pd2 = jelloUnmergeD2;
    pick.length = nActive; pd2.length = nActive;
    var a, c2, A, B;
    for (a = 0; a < nActive; a++) pick[a] = -1;
    // Pass 1: each body's single WORST merge partner (closest centroids). ONE
    // partner per body per frame keeps a multi-way pile-merge COHERENT — the v1
    // all-pairs version let six overlapping neighbours push a middle body in six
    // directions that cancelled to gridlock (harness: 7 pairs still merged after
    // 25s). The deepest pair wins; the rest resolve on later frames as the pile
    // shells apart outside-in.
    for (a = 0; a < nActive; a++) {
      A = active[a];
      if (A.ringN < 3) continue;
      for (c2 = a + 1; c2 < nActive; c2++) {
        B = active[c2];
        if (B.ringN < 3) continue;
        if (A.bboxR < B.bboxL || A.bboxL > B.bboxR || A.bboxB < B.bboxT || A.bboxT > B.bboxB) continue;
        // Fire only on a centroid CLEARLY inside (4px past the ring), not a grazing
        // one: a centroid sitting exactly ON the other ring (two bodies built or
        // squeezed to half-overlap) made this test flicker true/false per frame and
        // the intermittent rigid shifts WALKED the pair around (harness: 194px of
        // wander). Sub-margin overlap belongs to the contact solve, which owns it.
        var aIn = jelloPointInRing(B, A.cx, A.cy);
        var bIn = !aIn && jelloPointInRing(A, B.cx, B.cy);
        if (!aIn && !bIn) continue;
        var mNear = aIn ? jelloNearestOnRing(B, A.cx, A.cy) : jelloNearestOnRing(A, B.cx, B.cy);
        var mqx = aIn ? A.cx : B.cx, mqy = aIn ? A.cy : B.cy;
        var mdx = mNear.x - mqx, mdy = mNear.y - mqy;
        if (mdx * mdx + mdy * mdy < 16) continue;          // < 4px deep: grazing, not merged
        var ddx = A.cx - B.cx, ddy = A.cy - B.cy, dd2 = ddx * ddx + ddy * ddy;
        if (pick[a] < 0 || dd2 < pd2[a]) { pick[a] = c2; pd2[a] = dd2; }
        if (pick[c2] < 0 || dd2 < pd2[c2]) { pick[c2] = a; pd2[c2] = dd2; }
      }
    }
    // Pass 2: apply each selected pair once; stuck pairs escalate (a crammed
    // pocket resists at the base rate, and a merge that lingers is exactly the
    // glitch this pass exists to kill).
    for (a = 0; a < nActive; a++) {
      c2 = pick[a];
      A = active[a];
      if (c2 < 0) {
        // DECAY the merge clock, never hard-reset it (v25.21): a pair dancing at
        // the merge-test threshold (d hovering right at the 4px margin) flickered
        // picked/unpicked every few frames, and the old `_mergeT = 0` here kept
        // the 2.5s phase clock at zero forever — the pair escalated-shifted at
        // ~65 px/s indefinitely and never phased apart (harness R9). A real
        // separation still clears the clock in well under a second.
        A._mergeT = (A._mergeT || 0) * 0.9;
        A._umParked = 0;
        if (A._phaseMate) {                              // no longer merged with anyone: drop a stale mate
          if (A._phaseMate._phaseMate === A) A._phaseMate._phaseMate = null;
          A._phaseMate = null;
        }
        continue;
      }
      A._mergeT = (A._mergeT || 0) + frameDt;
      if (c2 < a && pick[c2] === a) continue;            // pair already applied from the other side
      B = active[c2];
      // A mate from a PREVIOUS pairing that isn't this frame's partner is stale.
      if (A._phaseMate && A._phaseMate !== B) { if (A._phaseMate._phaseMate === A) A._phaseMate._phaseMate = null; A._phaseMate = null; }
      if (B._phaseMate && B._phaseMate !== A) { if (B._phaseMate._phaseMate === B) B._phaseMate._phaseMate = null; B._phaseMate = null; }
      var dx = A.cx - B.cx, dy = A.cy - B.cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var _pd2 = d * d;
      var mt = (A._mergeT > (B._mergeT || 0)) ? A._mergeT : (B._mergeT || 0);
      // PAIR PHASING (v25.20): a DEEPLY merged pair has concentric lattices locked
      // by their own mutual point contact — every rigid shift is undone by the comb
      // re-centering (harness R9: d pinned at 3.5px for 6s), and a teleport "pop"
      // was tried and rejected (it wormed through sealed walls and yanked press-
      // loaded pairs; three harness scenarios regressed). Instead: suspend the
      // pair's MUTUAL contact (world collision and every other pair unaffected) so
      // the ordinary rate shifts can slide the combs apart; contact resumes the
      // moment they are separated (or on the safety timer) and pushes them the
      // rest of the way. Gated on the merge persisting a beat, so ordinary brief
      // overlaps never phase.
      // EVALUATED BEFORE THE PARK GATES since v25.21: with the crowd calm draining
      // a parked concentric pair fully STATIC, its distance never changed, so it
      // never unparked and never reached this trigger — merged forever (harness
      // R9). Phasing IS the escape for exactly that state, so it must see parked
      // pairs; while a pair phases, the park/progress gates are skipped (its
      // shifts are contact-free, not churn) and re-engage fresh when phasing ends.
      var phNeed = (A.bboxR - A.bboxL + B.bboxR - B.bboxL) * 0.5 + 2;
      // TWO gates, both strict (an eager 0.6s phase let settling drops fall THROUGH
      // their seat and press-loaded pairs cycle through each other — three harness
      // scenarios regressed): the merge must have resisted shifting for 2.5s AND be
      // genuinely CONCENTRIC (d under a third of the separated distance). Ordinary
      // deep contact resolves by the contact solve long before either gate trips.
      // 0.35 -> 0.6 concentric gate (v25.21): the threshold-dancing pair (above)
      // hovers at d ~ 0.4-0.5 of the separated distance, outside the old gate, so
      // it escalated forever without ever qualifying to phase. 0.6 still excludes
      // ordinary deep contact (which the contact solve resolves in well under the
      // 2.5s persistence gate anyway).
      // ...and never in a CRAM: sealed-pocket phasing cannot succeed — the pair
      // interpenetrates contact-free, times out still merged, and the resuming
      // contact blasts them apart at ~60 px/s, cycling forever (harness R5b caught
      // exactly two bodies doing this while the other 14 sat drained). The gate is
      // RELATIVE (v25.22): a FREE pair's crowd pressure only comes from each other,
      // so its pressT tracks its merge clock (pressT ~ mt); a crammed pair carries
      // pressure that long predates this merge (pressT 20+ vs mt of a few). A fixed
      // threshold raced the two clocks — mt decays on pick-flicker while pressT
      // keeps accruing, so a free pair could cross the fixed bar before qualifying
      // and never phase (the R9 flake).
      // Two tiers (v25.23): DEEPLY concentric pairs (d under a fifth of the
      // separated distance — unreachable by ordinary contact, which holds bodies
      // ~2r apart) qualify after just 1s, before the clock races that made the
      // open-space unmerge flaky can accumulate; the looser 0.6 tier keeps its
      // 2.5s persistence gate.
      if (((mt > 2.5 && d < phNeed * 0.6) || (mt > 1.0 && d < phNeed * 0.2)) &&
          (A._pressT || 0) < mt * 1.2 + 1.5 && (B._pressT || 0) < mt * 1.2 + 1.5 &&
          !(A._phaseMate === B)) {
        A._phaseMate = B; B._phaseMate = A;
        A._phaseT = 1.5; B._phaseT = 1.5;
        A._umParked = 0; B._umParked = 0;
        A._umStall = 0; B._umStall = 0;
      }
      if (A._phaseMate === B) {
        A._phaseT -= frameDt; B._phaseT = A._phaseT;
        if (d >= phNeed || A._phaseT <= 0) {
          A._phaseMate = null; B._phaseMate = null;      // separated (or timed out): contact resumes
          if (A._phaseT <= 0) { A._mergeT = 0; B._mergeT = 0; }   // timed out: re-gate the next phase
        }
      }
      if (!(A._phaseMate === B)) {
        // PARKED pairs are EVENT-driven (v25.20): a stalled merge stops shifting
        // entirely and re-arms only when its geometry actually CHANGES (the player
        // digs room, a neighbour moves off, a new body lands). Timed retries were
        // tried first and a big merged blob never went quiet — with several parked
        // pairs on staggered timers, some pair was always mid-attempt (harness:
        // 65-120 px/s forever). A static merged pile now reads dead still.
        if (A._umParked || B._umParked) {
          var _dchg = _pd2 - (A._umD2 || 0); if (_dchg < 0) _dchg = -_dchg;
          var _dchgB = _pd2 - (B._umD2 || 0); if (_dchgB > _dchg) _dchg = _dchgB;
          if (_dchg < 9) continue;                         // nothing moved: stay parked
          A._umParked = 0; B._umParked = 0;                // geometry changed: try again
          A._umStall = 0; B._umStall = 0;
        }
        // PROGRESS GATE (v25.20): if the pair's separation hasn't grown for ~40
        // frames of shifting, there is no room — a crowded pocket turns the
        // escalated shifts into a ~50 px/s limit cycle against the neighbours
        // (harness-measured). Park the pair (see above) and trip the crowd calm.
        // (_mergeT deliberately NOT reset: it clocks TOTAL time merged, and the
        // phase gate above needs it to survive park/unpark cycles.)
        if (_pd2 <= (A._umD2 || 0) + 1) A._umStall = (A._umStall | 0) + 1; else A._umStall = 0;
        if (_pd2 <= (B._umD2 || 0) + 1) B._umStall = (B._umStall | 0) + 1; else B._umStall = 0;
        A._umD2 = _pd2; B._umD2 = _pd2;
        if (A._umStall > 40 || B._umStall > 40) {
          A._pressT = 1; B._pressT = 1;
          A._umStall = 0; B._umStall = 0;
          A._umParked = 1; B._umParked = 1;
          continue;
        }
      }
      // No room to separate: while BOTH bodies are crowd-pressed (JELLO_CROWD_CALM
      // banner) the pocket is overfilled and a rigid shift just bounces off the
      // walls into fresh churn. Sit merged-but-CALM; the moment the player digs
      // room and the pressure drops, unmerging resumes on its own. (A phasing pair
      // keeps shifting: with mutual contact off, its shifts are not churn.)
      if (!(A._phaseMate === B) && (A._pressT || 0) > 0.75 && (B._pressT || 0) > 0.75) continue;
      var nx, ny;
      if (d > 1e-3) { nx = dx / d; ny = dy / d; }
      else { nx = 0; ny = 0; }
      // GRAVITY-NEUTRAL split for (near-)vertical merges (v25.20): separating a
      // stacked pair vertically is a Sisyphus loop — the lift falls straight back
      // each frame, net progress ~0, and the stall gate parks the pair still merged
      // (harness R9: two co-located cubes never separated). Bias hard to horizontal;
      // the pair slides apart along the ground instead of fighting gravity.
      if (dx < 6 && dx > -6) {
        nx = ((a + c2) & 1) ? 0.85 : -0.85;
        ny *= 0.4;
        var _nl = Math.sqrt(nx * nx + ny * ny);
        nx /= _nl; ny /= _nl;
      }
      var esc = 1 + 3 * (mt > 2 ? 1 : mt / 2);           // 1x -> 4x over 2 seconds stuck
      var sep = JELLO_UNMERGE_RATE * esc * frameDt;
      var mA = A.n / (A.npt ? (A.npt + 1) * (A.npt + 1) : 16);   // tile mass (density independent)
      var mB = B.n / (B.npt ? (B.npt + 1) * (B.npt + 1) : 16);
      var fA = mB / (mA + mB);
      var sepA = sep * fA, sepB = sep * (1 - fA);
      // COMPONENT-WISE clamp (v25.20): zero only the shift component that would
      // press the body into solid; the other axis keeps working. Blocking the
      // WHOLE shift on one probe was wrong both ways: a grounded pair's floor-
      // kissing bottom edge vetoed sideways separation (pair parked merged), and
      // an unprobed minor axis let diagonal shifts press into floors and WORM a
      // body through a sealed wall via the enclosed-point fallback (both
      // harness-caught). Fully pinned pairs make no progress and the stall gate
      // parks them calm.
      var aX = nx * sepA, aY = ny * sepA;
      if (aX !== 0 && !jelloUnmergeRoom(A, aX, 0)) aX = 0;
      if (aY !== 0 && !jelloUnmergeRoom(A, 0, aY)) aY = 0;
      var bX = -nx * sepB, bY = -ny * sepB;
      if (bX !== 0 && !jelloUnmergeRoom(B, bX, 0)) bX = 0;
      if (bY !== 0 && !jelloUnmergeRoom(B, 0, bY)) bY = 0;
      if (aX === 0 && aY === 0 && bX === 0 && bY === 0) continue;
      jelloShiftBody(A, aX, aY);
      jelloShiftBody(B, bX, bY);
      A.sleeping = false; A.sleepFrames = 0;
      B.sleeping = false; B.sleepFrames = 0;
    }
  }

  // ----- RIG DISPLACES GEL (v25.17) — the "never inside a cube" guarantee -----------
  // The soft containment lets the hull DENT into gel (memory foam) and the yield
  // evacuates overlap at a gentle rate, but a cube falling ONTO the rig (the C drop
  // lands overhead) could still wrap most of the hull for a beat (engulf harness:
  // 71% border coverage on a head-drop), and a fast fly-in buries it briefly — the
  // owner's "you can get inside the cubes". This pass makes the hull a HARD
  // displacer: once per frame, any gel point deeper than JELLO_ENGULF_CAP inside
  // the hull box is relocated (velocity-free, ox co-shifted, sleepers woken) out to
  // CAP depth along its nearest hull face. The CAP of allowed overlap IS the dent
  // feel; past it, gel flows around the hull, never through it. It engages every
  // frame as soon as depth exceeds the cap, so per-frame shifts stay small (one
  // frame's worth of approach) — no snap, no energy injected. While SEATED
  // (onJello) only the TOP THIRD of the hull displaces: the bed-in, the landing
  // dip and the bowl hug the lower hull by design (JELLO_RIDE_SINK / LAND_SPRING)
  // and must keep doing so.
  var JELLO_ENGULF_CAP  = 6;   // px of gel-into-hull overlap kept as the memory-foam dent (side hits)
  var JELLO_ENGULF_RATE = 8;   // px/frame a point may be extruded (smooth eviction, no snap)
  function jelloRigDisplaceGel() {
    if (!player || jelloBodies.length === 0 || gameWon || gameOver) return;
    if (JELLO_ENGULF_CAP <= 0) return;
    var x0 = player.x, x1 = player.x + PLAYER_W;
    var y0 = player.y, y1 = player.y + PLAYER_H;
    var hcx = (x0 + x1) * 0.5, hcy = (y0 + y1) * 0.5;
    var seatY = y1 - (JELLO_RIDE_SINK + 6);      // seated bed-in band: never touched
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.frozen) continue;
      if (b.bboxR < x0 || b.bboxL > x1 || b.bboxB < y0 || b.bboxT > y1) continue;
      // ONE exit side per BODY, the side its centroid already favors (normalized by
      // the hull half-extents so a cube overhead prefers UP even on a tall hull).
      // v1 of this pass exited each point through its NEAREST face, which SPLIT the
      // body's points to all four faces: the ring polygon draped AROUND the hull in
      // a stable wrap, with every point held so shallow that the containment's
      // anti-softlock escape never fired (harness: 4.9s center-inside). A single
      // shared side means the ring can never close around the hull at all.
      var sdx = (b.cx - hcx) / (PLAYER_W * 0.5), sdy = (b.cy - hcy) / (PLAYER_H * 0.5);
      var side = (Math.abs(sdy) >= Math.abs(sdx)) ? (sdy < 0 ? 2 : 3) : (sdx < 0 ? 0 : 1);
      // Exit-side HYSTERESIS (v25.19): a body near dead-centre on the hull has
      // |sdx| ~ |sdy| ~ 0, so the argmax above flips per frame and the eviction
      // direction alternates — a wobble source. Keep the previously chosen side
      // until the new dominant clearly beats it (0.35 of a half-hull margin).
      if (b._rigSide !== undefined && b._rigSide >= 0 && b._rigSide !== side) {
        var sNew = (side === 0) ? -sdx : (side === 1) ? sdx : (side === 2) ? -sdy : sdy;
        var sOld = (b._rigSide === 0) ? -sdx : (b._rigSide === 1) ? sdx : (b._rigSide === 2) ? -sdy : sdy;
        if (sNew < sOld + 0.35) side = b._rigSide;
      }
      // The gel under a rig is the SEAT (probe + bowl own it): seated, never evict
      // downward-favoring bodies; grounded on solid, redirect them sideways instead
      // of pushing gel into the floor.
      if (side === 3 && player.onJello) { b._rigSide = -1; continue; }
      if (side === 3 && player.onGround) side = (sdx < 0) ? 0 : 1;
      b._rigSide = side;
      // Roof crossings evict almost immediately (a cube should rest ON the roof,
      // not sink into the cockpit); side hits keep the memory-foam dent cap.
      var cap = (side === 2) ? 2 : JELLO_ENGULF_CAP;
      var px = b.px, py = b.py, ox = b.ox, oy = b.oy, n = b.n, moved = false;
      for (var i = 0; i < n; i++) {
        var x = px[i], y = py[i];
        if (x <= x0 || x >= x1 || y <= y0 || y >= y1) continue;
        if (player.onJello && y > seatY) continue;          // seated bed-in band stays
        // Intrusion depth along the body's exit side; within the cap = the dent.
        var depth = (side === 0) ? (x - x0) : (side === 1) ? (x1 - x)
                  : (side === 2) ? (y - y0) : (y1 - y);
        if (depth <= cap) continue;
        // Extrude back TO THE CAP DEPTH, not out of the hull (v25.19). The first cut
        // evicted fully outside (face - 0.5), so a body squeezed against the hull
        // (the rig pinched between two slimes in a tight dig) rode a ~7px sawtooth:
        // springs press the face past the cap, the eviction teleported it all the
        // way out, springs pressed it back — an undamped standing oscillation that
        // read as an audio-waveform outline (owner report; vmax 377 while parked).
        // Clamped to the cap, the correction at equilibrium is just one frame's
        // intrusion — sub-pixel. Rate-limited for the deep first-contact case.
        var over = depth - cap, mx2 = 0, my2 = 0, exn = 0, eyn = 0;
        if (over > JELLO_ENGULF_RATE) over = JELLO_ENGULF_RATE;
        if (side === 0)      { mx2 = -over; exn = -1; }
        else if (side === 1) { mx2 =  over; exn =  1; }
        else if (side === 2) { my2 = -over; eyn = -1; }
        else                 { my2 =  over; eyn =  1; }
        // Never relocate gel INTO solid tiles (the jet's v24.171 lesson).
        if (jelloWorldSolidAt(x + mx2, y + my2)) continue;
        px[i] += mx2; py[i] += my2; ox[i] += mx2; oy[i] += my2;   // velocity-free relocation
        // ...then BLEED the approach velocity along the exit normal, inelastic, the
        // same way every other contact in this engine does (world collide's rest
        // threshold, the contact solve's normal damping, the containment backstop).
        // A velocity-PRESERVING eviction is an undamped oscillator: the point keeps
        // its inward speed, dives back past the cap, and gets evicted again forever.
        var vin = (px[i] - ox[i]) * exn + (py[i] - oy[i]) * eyn;   // + = leaving, - = pressing in
        if (vin < 0) {
          ox[i] += exn * vin * JELLO_CONTACT_DAMP;
          oy[i] += eyn * vin * JELLO_CONTACT_DAMP;
        }
        moved = true;
      }
      if (moved) { b.sleeping = false; b.sleepFrames = 0; b._plyMs = performance.now(); }
    }
  }

  // ----- Active-region freeze (off-camera bodies skip simulating) -----
  function jelloBodyOnCamera(b) {
    var mx = screenW * JELLO_ACTIVE_MARGIN, my = screenH * JELLO_ACTIVE_MARGIN;
    return !(b.bboxR < cam.x - mx || b.bboxL > cam.x + screenW + mx ||
             b.bboxB < cam.y - my || b.bboxT > cam.y + screenH + my);
  }

  // ===== IMPACT RIPPLES — render-space displacement wave on the boundary ring ======
  // (See the JELLO_RIPPLE tunables block.) State is per body: rippleU/rippleP are the
  // current/previous skin displacement per RING VERTEX (px, + = outward). Lazy-allocated
  // on the first injection; freed back to "off" when the wave decays below 0.05 px.

  function jelloRippleAlloc(b) {
    if (b.rippleU) return;
    b.rippleU = new Float32Array(b.ringN);
    b.rippleP = new Float32Array(b.ringN);
  }

  // The hard amplitude cap: never deeper than the render outset + a third of the point
  // radius, so the drawn skin can dent inward but can never invert through the raw ring.
  function jelloRippleCap(spacing) {
    var r = JELLO_CONTACT_R_FRAC * (spacing || (TILE / JELLO_NPT));
    var cap = JELLO_RENDER_OUTSET * r + 0.35 * r;
    return JELLO_RIPPLE_MAX < cap ? JELLO_RIPPLE_MAX : cap;
  }

  // Add a raised-cosine displacement bump centred on ring slot k0. Written to BOTH u and
  // p (zero initial wave velocity), so it splits into two half-amplitude waves traveling
  // opposite ways around the ring (d'Alembert). amp < 0 = inward dent (impacts).
  function jelloRippleInjectAt(b, k0, amp, w) {
    if (JELLO_RIPPLE <= 0 || b.ringN < 4 || k0 < 0) return;
    jelloRippleAlloc(b);
    if (!w) w = JELLO_RIPPLE_BUMP_W;
    var u = b.rippleU, p = b.rippleP, rn = b.ringN, cap = jelloRippleCap(b.spacing);
    for (var j = -w; j <= w; j++) {
      var k = k0 + j; if (k < 0) k += rn; else if (k >= rn) k -= rn;
      var v = u[k] + amp * 0.5 * (1 + Math.cos(Math.PI * j / (w + 1)));
      if (v > cap) v = cap; else if (v < -cap) v = -cap;
      p[k] += v - u[k];   // same delta into prev -> pure displacement, no velocity spike
      u[k] = v;
    }
    b.rippleOn = true;
  }

  // World-position variant: nearest ring vertex (linear scan, bounded by ringN; injection
  // is rare + rate-limited, so this never runs hot).
  function jelloRippleInject(b, wx, wy, amp, w) {
    if (JELLO_RIPPLE <= 0 || b.ringN < 4) return;
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
    var best = -1, bd = 1e18;
    for (var k = 0; k < rn; k++) {
      var dx = px[ring[k]] - wx, dy = py[ring[k]] - wy;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = k; }
    }
    jelloRippleInjectAt(b, best, amp, w);
  }

  // Shared impact->amplitude mapping for the velocity-threshold sites. vReal in px/s.
  // BODY-MOTION GATE (v24.102 anti-squiggle): per-substep point velocities on a
  // TOUCHING pile include the contact-equilibrium micro-pulses, which crossed the
  // VMIN bar ~12x/s and held a standing 3-4 px ring wave for the body's whole
  // awake life (the "spongebob" squiggle, headless-measured). A real knock moves
  // the BODY; an equilibrium press does not - so the velocity-threshold sites
  // (world hits + body-body knocks) also require real centroid motion. The
  // explicit events (landing, bomb, fling, jet churn) bypass this by calling
  // jelloRippleInject directly.
  function jelloRippleHit(b, ringK, vReal, gain, cd) {
    if (JELLO_RIPPLE <= 0 || b.rippleCd > 0 || ringK < 0) return;
    if (vReal < JELLO_RIPPLE_VMIN * 1.5) return;       // threshold sites need a STRONG hit (explicit events bypass)
    var bvx = b.vx * JELLO_TIMESCALE, bvy = b.vy * JELLO_TIMESCALE;   // real px/s centroid
    if (bvx * bvx + bvy * bvy < 6400) return;          // < 80 px/s body motion = jostle/equilibrium, not a knock
    var s = vReal / JELLO_RIPPLE_VREF; if (s > 1) s = 1;
    b.rippleCd = cd;
    jelloRippleInjectAt(b, ringK, -s * JELLO_RIPPLE_MAX * gain, 0);
  }

  // Per-FRAME ripple advance (called from updateJello before the substep quantiser, so it
  // runs every rendered frame): cooldowns, jet churn re-injection, then the damped 1D wave
  // on each ringing body. Sleeping bodies still decay to zero, then stop costing anything;
  // frozen (off-camera) bodies hold. Master lever 0 zeroes any leftover state.
  // RIPPLE TTL WATCHDOG (v24.114): the ripple is impact JUICE — an event, never a state.
  // A body the rig stands on (or that a settling pile keeps nudging) can re-arm the
  // velocity-threshold sites through their gates every cooldown, holding a standing
  // 3-4 px outline wave forever (live-measured: a parked rig GREW a sleeping cube's
  // wave back to ~4.5 px — the owner's "balloon cube" look; the v24.110-112 settle
  // fixes exposed it by letting piles actually sleep mid-ring). The watchdog clears
  // any field that has rung continuously past JELLO_RIPPLE_TTL and briefly locks out
  // re-injection. Real impact ripples die in well under 1.5 s by design, so only a
  // pathological re-arm loop ever reaches the TTL. The jet's sustained boil is the
  // one legit long ring — its re-injection resets the timer.
  function jelloRippleFrame(dt) {
    var nb = jelloBodies.length;
    if (nb === 0) return;
    var steps = Math.ceil(dt * 120); if (steps < 1) steps = 1; else if (steps > 4) steps = 4;
    var sdt = dt / steps;
    var dampStep = Math.pow(JELLO_RIPPLE_DAMP, sdt);
    for (var bi = 0; bi < nb; bi++) {
      var b = jelloBodies[bi];
      if (b.rippleCd > 0) b.rippleCd -= dt;
      // Jet-wash churn: while the jet craters this body (flag set by jelloPlayerCouple),
      // re-inject a small dent every JELLO_RIPPLE_JET_PERIOD so the skin boils.
      if (b._ripJetOn) {
        b._ripJetOn = 0;
        b._ripJetT = (b._ripJetT || 0) - dt;
        if (b._ripJetT <= 0 && JELLO_RIPPLE > 0) {
          b._ripJetT = JELLO_RIPPLE_JET_PERIOD;
          jelloRippleInject(b, b._ripJetX, b._ripJetY, -0.30 * JELLO_RIPPLE_MAX, 3);
          b._ripT = 0;   // sustained jet boil is intentional — keep the watchdog fed
        }
      }
      if (!b.rippleOn) { b._ripT = 0; continue; }
      if (JELLO_RIPPLE <= 0) { b.rippleU.fill(0); b.rippleP.fill(0); b.rippleOn = false; continue; }
      b._ripT = (b._ripT || 0) + dt;
      if (b._ripT > JELLO_RIPPLE_TTL) {
        b.rippleU.fill(0); b.rippleP.fill(0); b.rippleOn = false;
        b._ripT = 0; b.rippleCd = 0.6;                   // brief lockout so the re-arm loop can't restart instantly
        continue;
      }
      if (b.frozen) continue;                            // off-camera: hold (not drawn anyway)
      // Per-body CFL: ring vertex spacing is the BODY's lattice spacing now.
      var ds = b.spacing || (TILE / JELLO_NPT);
      var C = JELLO_RIPPLE_SPEED * sdt / ds; if (C > 0.85) C = 0.85;   // leapfrog stable for C <= 1
      var C2 = C * C;
      var cap = jelloRippleCap(b.spacing);
      var u = b.rippleU, p = b.rippleP, rn = b.ringN;
      var maxAbs = 0;
      for (var st = 0; st < steps; st++) {
        var km = rn - 1, k, kp;
        for (k = 0; k < rn; k++) {                       // incremental ring walk, no modulo
          kp = k + 1; if (kp === rn) kp = 0;
          var v = u[k] + (u[k] - p[k]) * dampStep + C2 * (u[km] - 2 * u[k] + u[kp]);
          if (v > cap) v = cap; else if (v < -cap) v = -cap;
          p[k] = v;                                      // p[k] already consumed for this k
          km = k;
        }
        var t2 = b.rippleU; b.rippleU = p; b.rippleP = t2;   // swap (p now holds the new field)
        u = b.rippleU; p = b.rippleP;
      }
      // Remove the DC (ring-mean) component: an injection bump carries net mean
      // displacement, and a uniform offset has zero laplacian + zero velocity, so
      // the wave equation would hold it FOREVER (the skin stays shrunk, rippleOn
      // never clears). Subtracting the same mean from u AND p is velocity-neutral
      // and leaves the traveling wave untouched.
      var mean = 0;
      for (k = 0; k < rn; k++) mean += u[k];
      mean /= rn;
      for (k = 0; k < rn; k++) {
        u[k] -= mean; p[k] -= mean;
        var a = u[k]; if (a < 0) a = -a; if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs < 0.05) { u.fill(0); p.fill(0); b.rippleOn = false; }
    }
  }

  // ----- Per-frame update -----
  // ----- Per-body stepping, dispatched on JELLO_SOLVER ------------------------------
  // 'pbd' is the tagged jello-v1 baseline: a few substeps of JELLO_H, each with several
  // Gauss-Seidel constraint iterations (springs + pressure + shape matching). Phase 2/3
  // route 'xpbd'/'fem' to their own small-steps steppers; until then every mode runs this
  // exact path, so toggling JELLO_SOLVER is always safe.
  // ----- One substep of a body's INTERNAL solve (integrate + constraints + world collision) --
  // Shared by all three solvers. The GLOBAL inter-body contact (jelloContactSolve) and the
  // velocity clamp run at the loop level in updateJello AFTER this, so contact is solved in the
  // SAME per-substep cadence as the internal constraints (FleX Algorithm 1), not as a separate
  // once-per-frame pass that fights the solver. h is the substep dt (JELLO_H/K).
  function jelloBodyInternalSubstep(b, h) {
    var m = JELLO_SOLVER, ci;
    var resilienceGuard = jelloResilienceStepBegin(b);
    jelloActuateBody(b, h);
    jelloIntegrate(b, h);
    // The public physics toy installs this optional compliant pointer grip.
    // The game has no direct mouse grab, so the typeof branch is a clean no-op.
    if (typeof jelloGrabSubstep === 'function') jelloGrabSubstep(b, h);
    jelloPlayerCouple(b, h);
    if (m === 'pbd') {
      for (var it = 0; it < JELLO_ITERS; it++) {
        jelloSolveSprings(b);
        jelloPressure(b);
        jelloShapeMatch(b, JELLO_SHAPE_STIFF);
        jelloStrainLimit(b);
        jelloLimitOrientation(b);
        for (ci = 0; ci < b.n; ci++) { jelloCollidePointWorld(b, ci, h); jelloClampWorld(b, ci); }
        jelloCollideRingEdges(b);
      }
    } else {
      jelloResetLambdas(b);
      if (m === 'fem') jelloSolveFEM(b, h); else jelloSolveXPBD(b, h);
      if (JELLO_XPBD_SHAPE > 0) jelloShapeMatch(b, JELLO_XPBD_SHAPE);
      jelloStrainLimit(b);
      jelloLimitOrientation(b);
      for (ci = 0; ci < b.n; ci++) { jelloCollidePointWorld(b, ci, h); jelloClampWorld(b, ci); }
      jelloCollideRingEdges(b);
      if (JELLO_INT_DAMP > 0) jelloDampInternal(b, h);   // wobble decay (internal modes only)
    }
    if (!b._grabbed && b._recoverT > 0) {
      jelloRecoverShape(b);
      jelloStrainLimit(b);
      jelloLimitOrientation(b);
      for (ci = 0; ci < b.n; ci++) { jelloCollidePointWorld(b, ci, h); jelloClampWorld(b, ci); }
      jelloCollideRingEdges(b);
    }
    if (JELLO_XSPH > 0) jelloViscosityXSPH(b, JELLO_XSPH);   // viscous ooze + relative-motion damping
    if (resilienceGuard) jelloRejectTerrainInside(b);
    if (resilienceGuard) jelloResilienceStepEnd(b);
  }
  // ----- Internal (constraint-space) damping: per-edge relative-velocity bleed --------
  // For every spring, remove a fraction f = JELLO_INT_DAMP * h of the RELATIVE velocity
  // component along the edge direction (velocity lives in px - ox, so it is removed by
  // moving ox toward px's motion). Along-edge relative velocity is exactly the internal
  // vibration coordinate: zero for any rigid translation or rotation, so fall, tumble,
  // flings and bomb launches are untouched while edge buzz / ring breathing / shear
  // chatter decay at the chosen rate. Springs are processed sequentially reading the
  // LIVE velocities (Gauss-Seidel style), which self-limits accumulation at lattice
  // points shared by many springs; f is clamped for stability at extreme lever values.
  function jelloDampInternal(b, h) {
    var f = JELLO_INT_DAMP * h;
    if (f <= 0) return;
    if (f > 0.25) f = 0.25;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var sA = b.sA, sB = b.sB, springN = b.springN;
    for (var s = 0; s < springN; s++) {
      var i0 = sA[s], i1 = sB[s];
      var dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-9) continue;
      var nx = dx / d, ny = dy / d;
      // Relative velocity along the edge (Verlet: v = px - ox per substep).
      var rvx = (px[i1] - ox[i1]) - (px[i0] - ox[i0]);
      var rvy = (py[i1] - oy[i1]) - (py[i0] - oy[i0]);
      var vn = rvx * nx + rvy * ny;
      if (vn === 0) continue;
      var imp = 0.5 * f * vn;
      // v = px - ox, so shifting ox by +d reduces v by d. i0 gains +imp*n, i1 loses.
      ox[i0] -= imp * nx; oy[i0] -= imp * ny;
      ox[i1] += imp * nx; oy[i1] += imp * ny;
    }
  }
  // ----- Strain limiting: HARD cap on edge stretch (anti-extrude-through-gaps) ---------
  // A soft body squeezes through a crack narrower than itself by stretching its springs
  // into a long thin sliver. Clamping every edge to <= JELLO_MAX_STRETCH x its rest length
  // tethers the points so the body can't elongate to thread the gap — it stays bunched and
  // is held out by the part that doesn't fit. A position projection (velocity follows via
  // Verlet, giving the elastic snap-back); runs in every solver via the two steppers.
  function jelloStrainLimit(b) {
    if (JELLO_MAX_STRETCH <= 0) return;
    var sA = b.sA, sB = b.sB, sRest = b.sRest, springN = b.springN, px = b.px, py = b.py;
    var m = JELLO_MAX_STRETCH;
    for (var s = 0; s < springN; s++) {
      var i0 = sA[s], i1 = sB[s];
      var dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      var d = Math.sqrt(dx * dx + dy * dy);
      var lim = sRest[s] * m;
      if (d > lim && d > 1e-6) {
        var f = (d - lim) / d * 0.5;   // pull each point half-way back to the limit
        var ox2 = dx * f, oy2 = dy * f;
        px[i0] += ox2; py[i0] += oy2;
        px[i1] -= ox2; py[i1] -= oy2;
      }
    }
  }

  // A unilateral signed-area projection for the health-only meshes used by
  // round/dev bodies. Springs constrain edge lengths, not orientation, so a
  // reflected triangle is otherwise a perfectly valid equilibrium. Corrections
  // co-move Verlet history, making the repair velocity-free: it removes broken
  // geometry without turning recovery into a launch impulse.
  function jelloLimitOrientation(b) {
    if (!b.triHealthOnly || !(b.triN > 0)) return 0;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var TA = b.triA, TB = b.triB, TC = b.triC, Dm = b.triDmInv;
    var maxMove = (b.spacing || (TILE / JELLO_NPT)) * JELLO_ORIENT_MOVE;
    var fixed = 0;
    for (var t = 0; t < b.triN; t++) {
      var i0 = TA[t], i1 = TB[t], i2 = TC[t];
      var e1x = px[i1] - px[i0], e1y = py[i1] - py[i0];
      var e2x = px[i2] - px[i0], e2y = py[i2] - py[i0];
      var detInv = Dm[t * 4] * Dm[t * 4 + 3] - Dm[t * 4 + 1] * Dm[t * 4 + 2];
      var ratio = (e1x * e2y - e1y * e2x) * detInv;
      if (!(ratio < JELLO_ORIENT_MIN)) continue;
      var g0x = (py[i1] - py[i2]) * detInv, g0y = (px[i2] - px[i1]) * detInv;
      var g1x = (py[i2] - py[i0]) * detInv, g1y = (px[i0] - px[i2]) * detInv;
      var g2x = (py[i0] - py[i1]) * detInv, g2y = (px[i1] - px[i0]) * detInv;
      var den = g0x * g0x + g0y * g0y + g1x * g1x + g1y * g1y + g2x * g2x + g2y * g2y;
      if (!(den > 1e-12)) continue;
      var dl = (JELLO_ORIENT_TARGET - ratio) / den;
      var c0x = dl * g0x, c0y = dl * g0y;
      var c1x = dl * g1x, c1y = dl * g1y;
      var c2x = dl * g2x, c2y = dl * g2y;
      var largest = Math.max(Math.hypot(c0x, c0y), Math.hypot(c1x, c1y), Math.hypot(c2x, c2y));
      if (largest > maxMove && largest > 1e-9) {
        var sc = maxMove / largest;
        c0x *= sc; c0y *= sc; c1x *= sc; c1y *= sc; c2x *= sc; c2y *= sc;
      }
      px[i0] += c0x; py[i0] += c0y; ox[i0] += c0x; oy[i0] += c0y;
      px[i1] += c1x; py[i1] += c1y; ox[i1] += c1x; oy[i1] += c1y;
      px[i2] += c2x; py[i2] += c2y; ox[i2] += c2x; oy[i2] += c2y;
      fixed++;
    }
    b._orientFixes = fixed;
    return fixed;
  }

  // Temporary, rigid rest-shape memory after a direct external grab. Normal
  // play keeps the shipped 0.005 affine-blended shape pull. Only the short
  // release window uses beta=0, and the correction is velocity-free, so the
  // slime re-forms without becoming globally stiffer or springing across a room.
  function jelloRecoverShape(b) {
    if (b._grabbed || !(b._recoverT > 0) || !(JELLO_RECOVER_SHAPE > 0)) return;
    jelloContactAlloc();
    var sx = jelloVAccX, sy = jelloVAccY, n = b.n;
    for (var i = 0; i < n; i++) { sx[i] = b.px[i]; sy[i] = b.py[i]; }
    var oldBeta = JELLO_SHAPE_BETA;
    JELLO_SHAPE_BETA = 0;
    jelloShapeMatch(b, JELLO_RECOVER_SHAPE);
    JELLO_SHAPE_BETA = oldBeta;
    for (i = 0; i < n; i++) {
      b.ox[i] += b.px[i] - sx[i];
      b.oy[i] += b.py[i] - sy[i];
    }
  }

  // While a body is directly manipulated or recovering, retain the position at
  // the start of every solver substep and sweep to the result. This closes the
  // endpoint-only hole where a constraint correction could leap across an
  // entire 8px tile and finish in open space on the far side. Clean-path cost is
  // paid only during the short resilience window.
  function jelloResilienceStepBegin(b) {
    if (!b._grabbed && !(b._recoverT > 0) && !jelloDirectGrabActive) return false;
    if (!b._guardPX || b._guardPX.length < b.n) {
      b._guardPX = new Float64Array(b.px.length);
      b._guardPY = new Float64Array(b.py.length);
    }
    for (var i = 0; i < b.n; i++) { b._guardPX[i] = b.px[i]; b._guardPY[i] = b.py[i]; }
    b._guardHadFold = jelloHasOrientationFold(b);
    b._guardRejectedStep = false;
    if (b._grabbed) {
      b._grabRejectNX = 0; b._grabRejectNY = 0;
      b._grabRejectBody = null;
    }
    return true;
  }

  // Reject an invalid manipulation substep atomically. This is deliberately
  // different from healing a bad pose after it becomes visible: every point
  // returns to the legal start-of-substep snapshot, Verlet history follows it,
  // and the demo's virtual grip rolls back to the same instant. The cursor may
  // keep moving, but the grip stays parked at the obstacle until room exists.
  function jelloRestoreResilienceSnapshot(b, reason) {
    var sx = b._guardPX, sy = b._guardPY;
    if (!sx) return false;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    for (var i = 0; i < b.n; i++) {
      var dx = sx[i] - px[i], dy = sy[i] - py[i];
      px[i] = sx[i]; py[i] = sy[i];
      ox[i] += dx; oy[i] += dy;
    }
    b._guardRejects = (b._guardRejects | 0) + 1;
    b._guardRejectReason = reason || '';
    b._guardRejectedStep = true;
    if (typeof jelloGrabRejectStep === 'function') jelloGrabRejectStep(b, reason);
    return true;
  }

  function jelloResilienceStepEnd(b) {
    var sx = b._guardPX, sy = b._guardPY;
    if (!sx) return;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var stride = Math.min(1, Math.max(0.35, (b.spacing || 2) * 0.35));
    var hits = 0;
    for (var i = 0; i < b.n; i++) {
      var x0 = sx[i], y0 = sy[i];
      if (jelloWorldSolidAt(x0, y0)) continue;
      var dx = px[i] - x0, dy = py[i] - y0, dist = Math.sqrt(dx * dx + dy * dy);
      if (!(dist > stride)) continue;
      var steps = Math.ceil(dist / stride), lastX = x0, lastY = y0;
      for (var q = 1; q <= steps; q++) {
        var f = q / steps, nx = x0 + dx * f, ny = y0 + dy * f;
        if (jelloWorldSolidAt(nx, ny)) {
          var cx = lastX - px[i], cy = lastY - py[i];
          px[i] = lastX; py[i] = lastY;
          ox[i] += cx; oy[i] += cy;
          hits++;
          break;
        }
        lastX = nx; lastY = ny;
      }
    }
    b._guardHits = hits;
  }

  // Particle collision alone cannot stop a tile from entering the empty space
  // BETWEEN legal lattice points. A hard grab can then wrap the closed ring
  // around a ledge: no point is in solid, yet the obstacle is inside the slime
  // and the body hangs from it. During direct manipulation/recovery only, scan
  // solid tile centres inside the live ring and move the WHOLE body away from
  // the deepest one. The rigid, velocity-free shift preserves the deformation
  // and cannot pump energy; the following swept-point guard keeps the escape
  // path legal. Ordinary Sluice bodies never enter this path.
  function jelloRejectTerrainInside(b) {
    if (!b._grabbed && !(b._recoverT > 0)) return 0;
    var px = b.px, py = b.py, ox = b.ox, oy = b.oy, n = b.n;
    var minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18, cx = 0, cy = 0;
    for (var i = 0; i < n; i++) {
      var x = px[i], y = py[i];
      cx += x; cy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    cx /= n; cy /= n;
    var c0 = Math.floor(minX / TILE), c1 = Math.floor(maxX / TILE);
    var r0 = Math.floor(minY / TILE), r1 = Math.floor(maxY / TILE);
    var bestD2 = 0, bestX = 0, bestY = 0, nearX = 0, nearY = 0;
    var probes = [0.5, 0.25, 0.75];
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (tileAt(r, c) === null) continue;
        // Centre plus four inset quadrant probes catch a ledge before its centre
        // is deeply swallowed. Every probe is safely inside the solid tile, so
        // ordinary surface contact cannot trip this test.
        for (var pr = 0; pr < 5; pr++) {
          var fx = pr === 0 ? probes[0] : probes[pr & 1 ? 1 : 2];
          var fy = pr === 0 ? probes[0] : probes[pr <= 2 ? 1 : 2];
          var sx = (c + fx) * TILE, sy = (r + fy) * TILE;
          if (!jelloPointInRing(b, sx, sy)) continue;
          var near = jelloNearestOnRing(b, sx, sy);
          var ndx = sx - near.x, ndy = sy - near.y, d2 = ndx * ndx + ndy * ndy;
          if (d2 > bestD2) {
            bestD2 = d2; bestX = sx; bestY = sy; nearX = near.x; nearY = near.y;
          }
        }
      }
    }
    if (!(bestD2 > 1e-8)) { b._terrainInside = 0; return 0; }
    // While held, containment is a failed input, not a state to repair. Roll
    // back before this substep can be rendered. Recovery retains a continuous
    // rigid eject for legacy poses that predate the guard.
    if (b._grabbed) {
      var rnx = bestX - nearX, rny = bestY - nearY;
      var rnl = Math.sqrt(rnx * rnx + rny * rny);
      if (rnl > 1e-6) {
        b._grabRejectNX = rnx / rnl;
        b._grabRejectNY = rny / rnl;
      }
    }
    if (b._grabbed && b._grabApplied && jelloRestoreResilienceSnapshot(b, 'terrain')) {
      b._terrainInside = 0;
      b._terrainRejects = (b._terrainRejects | 0) + 1;
      return 2;
    }
    // Move the nearest boundary toward and past the enclosed solid sample. The
    // old centroid-away direction could aim into a second wall, get swept back,
    // and make progress only when shape recovery changed the centroid later.
    var dx = bestX - nearX, dy = bestY - nearY;
    var dl = Math.sqrt(dx * dx + dy * dy);
    if (!(dl > 1e-6)) {
      dx = cx - bestX; dy = cy - bestY;
      dl = Math.sqrt(dx * dx + dy * dy);
      if (!(dl > 1e-6)) { dx = 0; dy = -1; dl = 1; }
    }
    var move = Math.sqrt(bestD2) + 0.5;
    var cap = (b.spacing || (TILE / JELLO_NPT)) * JELLO_TERRAIN_EJECT;
    if (move > cap) move = cap;
    dx = dx / dl * move; dy = dy / dl * move;
    for (i = 0; i < n; i++) {
      px[i] += dx; py[i] += dy;
      ox[i] += dx; oy[i] += dy;
    }
    b._terrainInside = 1;
    b._terrainEjects = (b._terrainEjects | 0) + 1;
    return 1;
  }

  function jelloHasOrientationFold(b) {
    if (!b.triHealthOnly || !(b.triN > 0)) return false;
    var px = b.px, py = b.py, TA = b.triA, TB = b.triB, TC = b.triC, Dm = b.triDmInv;
    for (var t = 0; t < b.triN; t++) {
      var i0 = TA[t], i1 = TB[t], i2 = TC[t];
      var e1x = px[i1] - px[i0], e1y = py[i1] - py[i0];
      var e2x = px[i2] - px[i0], e2y = py[i2] - py[i0];
      var detInv = Dm[t * 4] * Dm[t * 4 + 3] - Dm[t * 4 + 1] * Dm[t * 4 + 2];
      if ((e1x * e2y - e1y * e2x) * detInv < JELLO_ORIENT_MIN) return true;
    }
    return false;
  }

  function jelloSegmentsCrossProper(ax, ay, bx, by, cx, cy, dx, dy) {
    if (Math.max(ax, bx) <= Math.min(cx, dx) || Math.max(cx, dx) <= Math.min(ax, bx) ||
        Math.max(ay, by) <= Math.min(cy, dy) || Math.max(cy, dy) <= Math.min(ay, by)) return false;
    var abC = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    var abD = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    var cdA = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    var cdB = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    var eps = 1e-5;
    return ((abC > eps && abD < -eps) || (abC < -eps && abD > eps)) &&
           ((cdA > eps && cdB < -eps) || (cdA < -eps && cdB > eps));
  }

  // Point containment misses the exact failure created by a hard drag: two
  // polygon edges can cross while every sampled boundary point remains outside
  // the other body. Test proper edge crossings after the normal contact pass.
  // Touching and collinear edges are legal, only a true crossing rejects input.
  function jelloRingsCrossProper(A, B) {
    if (!(A.ringN >= 3 && B.ringN >= 3)) return false;
    jelloRingBBox(A); jelloRingBBox(B);
    if (A._cbR <= B._cbL || A._cbL >= B._cbR || A._cbB <= B._cbT || A._cbT >= B._cbB) return false;
    var ar = A.ring, br = B.ring, apx = A.px, apy = A.py, bpx = B.px, bpy = B.py;
    for (var ai = 0; ai < A.ringN; ai++) {
      var ai0 = ar[ai], ai1 = ar[(ai + 1) % A.ringN];
      var ax = apx[ai0], ay = apy[ai0], bx = apx[ai1], by = apy[ai1];
      for (var bi = 0; bi < B.ringN; bi++) {
        var bi0 = br[bi], bi1 = br[(bi + 1) % B.ringN];
        if (jelloSegmentsCrossProper(ax, ay, bx, by,
                                     bpx[bi0], bpy[bi0], bpx[bi1], bpy[bi1])) return true;
      }
    }
    return false;
  }

  function jelloCentroidInsideDeep(A, B) {
    var cx = 0, cy = 0;
    for (var i = 0; i < A.n; i++) { cx += A.px[i]; cy += A.py[i]; }
    cx /= A.n; cy /= A.n;
    if (!jelloPointInRing(B, cx, cy)) return false;
    var near = jelloNearestOnRing(B, cx, cy);
    var dx = near.x - cx, dy = near.y - cy;
    return dx * dx + dy * dy > 16;   // same 4px deep-merge margin as jelloUnmergeBodies
  }

  // Rare direct-grab topology closure. The ordinary guards above already
  // reject points in solid and solid samples enclosed by the ring, but a
  // partial post-contact pose needs the same questions answered without
  // mutating or rejecting it. This slow path runs only after a held body's
  // complete solver result folded, never during normal Sluice simulation.
  function jelloGrabPoseHasTerrainInside(b) {
    var minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18;
    for (var i = 0; i < b.n; i++) {
      var x = b.px[i], y = b.py[i];
      if (jelloWorldSolidAt(x, y)) return true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    var c0 = Math.floor(minX / TILE), c1 = Math.floor(maxX / TILE);
    var r0 = Math.floor(minY / TILE), r1 = Math.floor(maxY / TILE);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (tileAt(r, c) === null) continue;
        for (var pr = 0; pr < 5; pr++) {
          var fx = pr === 0 ? 0.5 : (pr & 1 ? 0.25 : 0.75);
          var fy = pr === 0 ? 0.5 : (pr <= 2 ? 0.25 : 0.75);
          if (jelloPointInRing(b, (c + fx) * TILE, (r + fy) * TILE)) return true;
        }
      }
    }
    return false;
  }

  function jelloGrabPoseLegal(b, active, nActive) {
    if (jelloHasOrientationFold(b) || jelloGrabPoseHasTerrainInside(b)) return false;
    for (var i = 0; i < nActive; i++) {
      var other = active[i];
      if (other === b || other._melting) continue;
      jelloRingBBox(b); jelloRingBBox(other);
      if (b._cbR <= other._cbL || b._cbL >= other._cbR ||
          b._cbB <= other._cbT || b._cbT >= other._cbB) continue;
      if (jelloRingsCrossProper(b, other) ||
          jelloCentroidInsideDeep(b, other) || jelloCentroidInsideDeep(other, b)) return false;
    }
    return true;
  }

  function jelloGrabSetTrialPose(b, sx, sy, tx, ty, alpha) {
    for (var i = 0; i < b.n; i++) {
      b.px[i] = sx[i] + (tx[i] - sx[i]) * alpha;
      b.py[i] = sy[i] + (ty[i] - sy[i]) * alpha;
    }
  }

  // The substep snapshot is legal and the complete post-contact result is not.
  // Line-search the ENTIRE solver result, not just the fingertip correction.
  // Accepting a guarded prefix changes the physical state, so contact and shape
  // solving cannot resubmit one byte-identical rejected pose forever.
  function jelloGrabAcceptStepFraction(b, active, nActive) {
    var sx = b._guardPX, sy = b._guardPY;
    if (!sx || b._guardHadFold) return 0;
    if (!b._guardTryX || b._guardTryX.length < b.n) {
      b._guardTryX = new Float64Array(b.px.length);
      b._guardTryY = new Float64Array(b.py.length);
    }
    var tx = b._guardTryX, ty = b._guardTryY;
    for (var i = 0; i < b.n; i++) { tx[i] = b.px[i]; ty[i] = b.py[i]; }

    jelloGrabSetTrialPose(b, sx, sy, tx, ty, 0);
    if (!jelloGrabPoseLegal(b, active, nActive)) {
      for (i = 0; i < b.n; i++) { b.ox[i] += sx[i] - tx[i]; b.oy[i] += sy[i] - ty[i]; }
      return 0;
    }
    var safe = 0, unsafe = 1;
    for (var q = 0; q < 12; q++) {
      var mid = (safe + unsafe) * 0.5;
      jelloGrabSetTrialPose(b, sx, sy, tx, ty, mid);
      if (jelloGrabPoseLegal(b, active, nActive)) safe = mid;
      else unsafe = mid;
    }
    // Leave ten percent of the discovered interval as orientation/contact
    // reserve. Landing exactly on the boundary only moves the livelock to the
    // following substep.
    var take = safe * 0.9;
    if (!(take >= 1 / 4096)) {
      jelloGrabSetTrialPose(b, sx, sy, tx, ty, 0);
      for (i = 0; i < b.n; i++) { b.ox[i] += sx[i] - tx[i]; b.oy[i] += sy[i] - ty[i]; }
      return 0;
    }
    jelloGrabSetTrialPose(b, sx, sy, tx, ty, take);
    if (!jelloGrabPoseLegal(b, active, nActive)) {
      jelloGrabSetTrialPose(b, sx, sy, tx, ty, 0);
      for (i = 0; i < b.n; i++) { b.ox[i] += sx[i] - tx[i]; b.oy[i] += sy[i] - ty[i]; }
      return 0;
    }
    for (i = 0; i < b.n; i++) {
      b.ox[i] += b.px[i] - tx[i];
      b.oy[i] += b.py[i] - ty[i];
    }
    b._guardTopologyFraction = take;
    return take;
  }

  // If the complete solver direction has no usable legal prefix, the held
  // material is already too flat to take another local pinch. A small RIGID
  // move toward the collision-safe proxy preserves every signed area exactly.
  // Endpoint legality is enough for this sub-spacing shift: it cannot hop an
  // 8px tile, and the pure pose test also protects terrain enclosure and peers.
  function jelloGrabTryRigidShift(b, active, nActive, dx, dy) {
    var d = Math.sqrt(dx * dx + dy * dy);
    if (!(d > 1e-7) || !jelloGrabPoseLegal(b, active, nActive)) return 0;
    if (!b._guardTryX || b._guardTryX.length < b.n) {
      b._guardTryX = new Float64Array(b.px.length);
      b._guardTryY = new Float64Array(b.py.length);
    }
    var sx = b._guardTryX, sy = b._guardTryY;
    for (var i = 0; i < b.n; i++) { sx[i] = b.px[i]; sy[i] = b.py[i]; }
    var safe = 0, unsafe = 1;
    for (var q = 0; q < 10; q++) {
      var mid = (safe + unsafe) * 0.5;
      for (i = 0; i < b.n; i++) { b.px[i] = sx[i] + dx * mid; b.py[i] = sy[i] + dy * mid; }
      if (jelloGrabPoseLegal(b, active, nActive)) safe = mid;
      else unsafe = mid;
    }
    var take = safe > 0.999 ? 1 : safe * 0.9;
    if (!(take >= 1 / 1024)) {
      for (i = 0; i < b.n; i++) { b.px[i] = sx[i]; b.py[i] = sy[i]; }
      return 0;
    }
    var mx = dx * take, my = dy * take;
    for (i = 0; i < b.n; i++) {
      b.px[i] = sx[i] + mx; b.py[i] = sy[i] + my;
      b.ox[i] += mx; b.oy[i] += my;
    }
    b._guardTopologyTraction = Math.sqrt(mx * mx + my * my);
    return take;
  }

  // Runs after global slime contact and ring containment. Those constraints
  // used to be able to fold a body after its own resilience guard had already
  // finished. A bad direct-manipulation substep is now rejected before render,
  // then the ordinary contact solve gets one clean pose to push against.
  function jelloRejectGrabAfterContact(b, active, nActive) {
    if (!b._grabbed || !b._guardPX) return false;
    var heldFold = jelloHasOrientationFold(b);
    var offender = null, reason = '';
    for (var i = 0; i < nActive; i++) {
      var other = active[i];
      if (other === b || other._melting) continue;
      jelloRingBBox(b); jelloRingBBox(other);
      if (b._cbR <= other._cbL || b._cbL >= other._cbR ||
          b._cbB <= other._cbT || b._cbT >= other._cbB) continue;
      var peerFold = !other._guardHadFold && jelloHasOrientationFold(other);
      if (jelloRingsCrossProper(b, other) ||
          jelloCentroidInsideDeep(b, other) || jelloCentroidInsideDeep(other, b)) {
        offender = other; reason = 'slime'; break;
      }
      if (peerFold) { offender = other; reason = 'peer-topology'; break; }
    }
    if (heldFold || offender) {
      // The public toy can request a zero-force topology projection here. It
      // has already line-searched its pointer correction to zero, so rolling
      // the entire legal snapshot back would only reject the ordinary contact
      // solve forever. Sluice has no direct pointer grab and therefore never
      // installs this optional hook.
      if (heldFold && !offender &&
          typeof jelloGrabResolveTopologyStep === 'function' &&
          jelloGrabResolveTopologyStep(b, active, nActive)) return false;
      if (offender) {
        var bcx = (b._cbL + b._cbR) * 0.5, bcy = (b._cbT + b._cbB) * 0.5;
        var ocx = (offender._cbL + offender._cbR) * 0.5;
        var ocy = (offender._cbT + offender._cbB) * 0.5;
        var ndx = ocx - bcx, ndy = ocy - bcy;
        var ndl = Math.sqrt(ndx * ndx + ndy * ndy);
        if (ndl > 1e-6) {
          b._grabRejectNX = ndx / ndl;
          b._grabRejectNY = ndy / ndl;
        }
        b._grabRejectBody = offender;
      }
      jelloRestoreResilienceSnapshot(b, heldFold ? 'topology' : reason);
      // Contact separation is symmetric. If it made the other body invalid,
      // restoring only the held one leaves the peer carrying the fold. Every
      // body was snapshotted while a grab was active, so roll the pair back as
      // one failed contact event.
      if (offender && offender._guardPX) jelloRestoreResilienceSnapshot(offender, reason);
      return true;
    }
    return false;
  }
  // ----- Shade fit: best-fit rotation + area-preserved linear transform, standalone ----
  // The same math as jelloShapeMatch's fit, minus the point pulls. Only runs when the
  // solver's own per-substep cache is stale this frame (shape match disabled); one O(n)
  // pass per visible awake body.
  function jelloShadeFit(b) {
    var n = b.n, px = b.px, py = b.py, qx = b.qx, qy = b.qy;
    var cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
    cx /= n; cy /= n;
    var A00 = 0, A01 = 0, A10 = 0, A11 = 0;
    for (i = 0; i < n; i++) {
      var dxp = px[i] - cx, dyp = py[i] - cy;
      A00 += dxp * qx[i]; A01 += dxp * qy[i];
      A10 += dyp * qx[i]; A11 += dyp * qy[i];
    }
    var rc = A00 + A11, rs = A10 - A01;
    var rd = Math.sqrt(rc * rc + rs * rs);
    if (rd > 1e-9) { b.shRc = rc / rd; b.shRs = rs / rd; } else { b.shRc = 1; b.shRs = 0; }
    if (b.rigidOnly) {
      b.shL00 = b.shRc; b.shL01 = -b.shRs; b.shL10 = b.shRs; b.shL11 = b.shRc;
    } else {
      var L00 = A00 * b.invAqq00 + A01 * b.invAqq10;
      var L01 = A00 * b.invAqq01 + A01 * b.invAqq11;
      var L10 = A10 * b.invAqq00 + A11 * b.invAqq10;
      var L11 = A10 * b.invAqq01 + A11 * b.invAqq11;
      var detL = L00 * L11 - L01 * L10;
      if (isFinite(detL) && Math.abs(detL) > 1e-4) {
        var s = 1 / Math.sqrt(Math.abs(detL));
        L00 *= s; L01 *= s; L10 *= s; L11 *= s;
      }
      b.shL00 = L00; b.shL01 = L01; b.shL10 = L10; b.shL11 = L11;
    }
    b.shFrame = jelloFrameNo;
  }
  // ----- Shade matrix: rotation + BOUNDED squash for the sheen ellipse -----
  // M = R * S', S' = I + (R^T L - I) * JELLO_SHADE_SQUASH, diagonals clamped to
  // [1/SQUASH_MAX, SQUASH_MAX], shear clamped, so a degenerate solve can never smear
  // the highlight. Identity at rest. Writes b.shM00..shM11.
  function jelloShadeMatrix(b) {
    if (b.shFrame !== jelloFrameNo && !b.sleeping) jelloShadeFit(b);
    var c = b.shRc, s = b.shRs;
    if (c === undefined) { b.shM00 = 1; b.shM01 = 0; b.shM10 = 0; b.shM11 = 1; return; }
    var S00 =  c * b.shL00 + s * b.shL10, S01 =  c * b.shL01 + s * b.shL11;
    var S10 = -s * b.shL00 + c * b.shL10, S11 = -s * b.shL01 + c * b.shL11;
    var q = JELLO_SHADE_SQUASH, mx = JELLO_SHADE_SQUASH_MAX, mn = 1 / mx;
    S00 = 1 + (S00 - 1) * q; S11 = 1 + (S11 - 1) * q; S01 *= q; S10 *= q;
    if (S00 > mx) S00 = mx; else if (S00 < mn) S00 = mn;
    if (S11 > mx) S11 = mx; else if (S11 < mn) S11 = mn;
    if (S01 > 0.6) S01 = 0.6; else if (S01 < -0.6) S01 = -0.6;
    if (S10 > 0.6) S10 = 0.6; else if (S10 < -0.6) S10 = -0.6;
    b.shM00 = c * S00 - s * S10; b.shM01 = c * S01 - s * S11;
    b.shM10 = s * S00 + c * S10; b.shM11 = s * S01 + c * S11;
  }
  // ----- Per-point strain field (physics-anchored shading) -----
  // Mean SIGNED edge strain ((len - rest)/rest) of each point's incident springs,
  // temporally smoothed; negative = compressed, positive = stretched. ONE pass over the
  // spring list per awake body per FRAME (not per substep), identical across all three
  // solvers (sA/sB/sRest exist on every body). Also caches the K most-strained BOUNDARY
  // points so the render does zero scanning. Lazy-allocates on first use; borrows the
  // XSPH scratch (jelloVAccX) as the accumulator (free here, substeps are done).
  function jelloStrainField(b) {
    var n = b.n, sN = b.springN, sA = b.sA, sB = b.sB, sRest = b.sRest;
    var px = b.px, py = b.py, i, s;
    if (!b.strain) {
      b.strain = new Float32Array(n);
      b.strDeg = new Float32Array(n);
      b.strTopI = new Int32Array(4);
      b.strTopE = new Float32Array(4);
      for (s = 0; s < sN; s++) { b.strDeg[sA[s]]++; b.strDeg[sB[s]]++; }
      for (i = 0; i < n; i++) if (b.strDeg[i] > 0) b.strDeg[i] = 1 / b.strDeg[i];
    }
    jelloContactAlloc();
    var acc = jelloVAccX;
    acc.fill(0, 0, n);
    for (s = 0; s < sN; s++) {
      var a = sA[s], bb = sB[s];
      var dx = px[bb] - px[a], dy = py[bb] - py[a];
      var d = Math.sqrt(dx * dx + dy * dy);
      var e = (d - sRest[s]) / sRest[s];
      if (e > 1) e = 1; else if (e < -1) e = -1;
      acc[a] += e; acc[bb] += e;
    }
    var sm = JELLO_SHADE_STRAIN_SMOOTH, strain = b.strain, deg = b.strDeg;
    for (i = 0; i < n; i++) strain[i] += (acc[i] * deg[i] - strain[i]) * sm;
    // Top-K most-strained ring points (descending |strain|, threshold-gated).
    var ring = b.ring, rn = b.ringN, K = JELLO_SHADE_STRAIN_K | 0;
    if (K > 4) K = 4;
    var topI = b.strTopI, topE = b.strTopE, topN = 0;
    var minE = JELLO_SHADE_STRAIN_MIN;
    if (K > 0) {
      for (i = 0; i < rn; i++) {
        var p = ring[i], e2 = strain[p], ae = e2 < 0 ? -e2 : e2;
        if (ae < minE) continue;
        var j;
        if (topN < K) { j = topN++; }
        else {
          var tail = topE[K - 1]; if ((tail < 0 ? -tail : tail) >= ae) continue;
          j = K - 1;
        }
        while (j > 0) {
          var pe = topE[j - 1];
          if ((pe < 0 ? -pe : pe) >= ae) break;
          topI[j] = topI[j - 1]; topE[j] = topE[j - 1];
          j--;
        }
        topI[j] = p; topE[j] = e2;
      }
    }
    b.strTopN = topN;
  }

  // ----- Post-solve velocity clamp: cap each point's Verlet velocity isotropically ------
  // The constraint + collision corrections made in a substep become the implicit Verlet
  // velocity (px - ox) on the NEXT step. A floppy body crushed in a pile has its volume
  // constraint RE-INFLATE it every step, and that restoration is injected as velocity;
  // confined below (floor) and above (the blobs stacked on it) it cannot escape, so it
  // pumps a compress -> inflate -> collide oscillation into a blow-up — every cube in a
  // heap kicks, vmax runs to thousands of px/s, and nothing ever settles enough to sleep.
  // The pre-solve integrate clamp only caps the CARRIED velocity (per axis); it never sees
  // these post-solve kicks. This mirrors it on the FAR side of the solve: cap SPEED to
  // JELLO_VMAX by sliding ox toward px. It only ever REMOVES the excess (the capped vector
  // is shorter), so it can never add energy, and it touches ox only — px is untouched, so
  // the constraint corrections themselves stand. Floppy-preserving: a drive-in fling is
  // ~250 px/s, far under the cap, so normal wobble/launch is untouched; only the runaway
  // pile kick is bled off. Runs once per substep in BOTH steppers (solver-independent: the
  // h cancels, so the cap is the same px/s in pbd and xpbd/fem). -----
  function jelloClampVelocity(b, h) {
    if (JELLO_VMAX <= 0 || h <= 0) return;
    if (b._launchHit) { b._launchVMax = 0; b._launchHit = false; }
    var vmax = b._launchVMax > JELLO_VMAX ? b._launchVMax : JELLO_VMAX;
    var vcap = vmax * h, vcap2 = vcap * vcap;
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var bulkX = 0, bulkY = 0;
    for (var i = 0; i < n; i++) {
      var dvx = px[i] - ox[i], dvy = py[i] - oy[i];
      var v2 = dvx * dvx + dvy * dvy;
      if (v2 > vcap2) { var sc = vcap / Math.sqrt(v2); ox[i] = px[i] - dvx * sc; oy[i] = py[i] - dvy * sc; }
      bulkX += px[i] - ox[i]; bulkY += py[i] - oy[i];
    }
    if (b._launchVMax > JELLO_VMAX) {
      var bulkSpeed = Math.sqrt(bulkX * bulkX + bulkY * bulkY) / (n * h);
      if (bulkSpeed < JELLO_VMAX * 0.9) b._launchVMax = 0;
    }
  }
  // Zero a body's XPBD Lagrange multipliers (start of each xpbd/fem substep).
  function jelloResetLambdas(b) {
    var L = b.sLambda;
    if (L) L.fill(0);
    b.volLambda = 0;
    var TL = b.triLambda;   // FEM per-triangle multipliers (deviatoric + hydrostatic), Phase 3
    if (TL) TL.fill(0);
  }

  // ----- XPBD distance constraints (one compliant Gauss-Seidel sweep) ---------------
  // Each edge tracks a Lagrange multiplier so its stiffness is set by a COMPLIANCE
  // (inverse stiffness) that is independent of substep count and frame rate, which is
  // exactly what classic PBD stiffness is not. With alpha~ = compliance / dt^2 and unit
  // inverse mass, the per-edge update is dLambda = (-C - alpha~*lambda) / (2 + alpha~).
  function jelloSolveXPBD(b, h) {
    var px = b.px, py = b.py, sA = b.sA, sB = b.sB, sRest = b.sRest, sType = b.sType;
    var sLam = b.sLambda, springN = b.springN;
    var invh2 = 1 / (h * h);
    var aStruct = JELLO_XPBD_COMPLIANCE * invh2;
    var aShear  = JELLO_XPBD_SHEAR_COMPLIANCE * invh2;
    for (var s = 0; s < springN; s++) {
      var i0 = sA[s], i1 = sB[s];
      var dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-9) continue;
      var C = d - sRest[s];
      var at = sType[s] ? aShear : aStruct;
      var dLam = (-C - at * sLam[s]) / (2 + at);
      sLam[s] += dLam;
      var sx = dLam * (dx / d), sy = dLam * (dy / d);
      px[i0] -= sx; py[i0] -= sy;   // grad at i0 = -n
      px[i1] += sx; py[i1] += sy;   // grad at i1 = +n
    }
    jelloVolumeXPBD(b, h);
    // (Global shape match is applied ONCE PER FRAME in updateJello, not per substep, so
    // the anti-fold strength is frame-rate independent rather than scaling with substeps.)
  }

  // ----- XPBD volume (gas) constraint: ONE compliant constraint over the boundary ring,
  // holding the enclosed shoelace area at restArea * JELLO_INFLATE. Same alpha~ form as
  // the edges; the per-vertex gradient of the area is analytic. This is the XPBD analogue
  // of the v1 jelloPressure pass. -----
  function jelloVolumeXPBD(b, h) {
    var rn = b.ringN; if (rn < 3 || !b.restArea) return;
    var ring = b.ring, px = b.px, py = b.py;
    var A = 0, prev = ring[rn - 1], k, ip, im, gx, gy, km, kp;
    for (var i = 0; i < rn; i++) { var c = ring[i]; A += px[prev] * py[c] - px[c] * py[prev]; prev = c; }
    A *= 0.5;
    var sign = A >= 0 ? 1 : -1;
    var C = sign * A - b.restArea * JELLO_INFLATE;   // |A| - target
    // v23.38 — walk the ring with incremental prev/next indices instead of
    // (k+/-1)%rn. The modulo ran 4x per boundary vertex, twice (gradient sum +
    // correction apply); incrementing km/kp gives the identical indices with no
    // integer division. Bit-identical (harness-verified, /tmp jello-vol-harness).
    var sg = 0;
    km = rn - 1;
    for (k = 0; k < rn; k++) {
      kp = k + 1; if (kp === rn) kp = 0;
      ip = ring[kp]; im = ring[km];
      gx = 0.5 * (py[ip] - py[im]) * sign;
      gy = 0.5 * (px[im] - px[ip]) * sign;
      sg += gx * gx + gy * gy;
      km = k;
    }
    if (sg < 1e-9) return;
    var at = JELLO_XPBD_VOL_COMPLIANCE / (h * h);
    if (b.volLambda === undefined) b.volLambda = 0;
    var dLam = (-C - at * b.volLambda) / (sg + at);
    b.volLambda += dLam;
    km = rn - 1;
    for (k = 0; k < rn; k++) {
      var cv = ring[k];
      kp = k + 1; if (kp === rn) kp = 0;
      ip = ring[kp]; im = ring[km];
      gx = 0.5 * (py[ip] - py[im]) * sign;
      gy = 0.5 * (px[im] - px[ip]) * sign;
      px[cv] += dLam * gx; py[cv] += dLam * gy;
      km = k;
    }
  }

  // Small-steps stepper shared by xpbd + fem (Mueller 2020 "Small Steps"): split each
  // JELLO_H chunk into JELLO_XPBD_SUBSTEPS tiny substeps, each one integrate + ONE
  // constraint solve. solveFn is jelloSolveXPBD or jelloSolveFEM.
  // (jelloStepXPBD removed in the v22 unified-contact rebuild — the per-substep internal solve
  //  is jelloBodyInternalSubstep, driven by the top-level substep loop in updateJello so that
  //  global per-particle contact runs in the same sweep.)
  // ----- XPBD-FEM solver: per-triangle Stable Neo-Hookean (Macklin & Mueller 2021) ------
  // For each triangle: deformation gradient F = Ds * Dm^-1, then TWO compliant constraints
  // solved as XPBD --- a DEVIATORIC term C = ||F||_F (resists distortion, compliance from
  // the shear modulus mu) and a HYDROSTATIC term C = det(F) - (1 + mu/lambda) (resists
  // volume change, compliance from lambda). Their weighted minimum is the Neo-Hookean
  // energy with its minimum at F = I, so the rest shape is stable. Gradients are P * Dm^-T
  // distributed to the 3 vertices (vertex 0 gets the negative sum). Reuses the small-steps
  // substep loop; lambdas reset per substep. A body with no triangle mesh falls back to XPBD.
  function jelloSolveFEM(b, h) {
    var nT = b.triN | 0;
    if (!nT || b.triHealthOnly) { jelloSolveXPBD(b, h); return; }
    var px = b.px, py = b.py, TA = b.triA, TB = b.triB, TC = b.triC;
    var Dm = b.triDmInv, RA = b.triRestArea, TL = b.triLambda;
    var devC = JELLO_FEM_DEV_COMPLIANCE, volC = JELLO_FEM_VOL_COMPLIANCE, invh2 = 1 / (h * h);
    var gamma = 1 + (JELLO_LAMBDA > 1e-6 ? JELLO_MU / JELLO_LAMBDA : 0);
    for (var t = 0; t < nT; t++) {
      var i0 = TA[t], i1 = TB[t], i2 = TC[t];
      var a = Dm[t * 4], bb = Dm[t * 4 + 1], c = Dm[t * 4 + 2], d = Dm[t * 4 + 3];
      var area = RA[t]; if (area < 1e-6) continue;
      // --- deviatoric: C = ||F||_F, P = F / C, grad = P * Dm^-T ---
      var e1x = px[i1] - px[i0], e1y = py[i1] - py[i0], e2x = px[i2] - px[i0], e2y = py[i2] - py[i0];
      var F00 = e1x * a + e2x * c, F01 = e1x * bb + e2x * d, F10 = e1y * a + e2y * c, F11 = e1y * bb + e2y * d;
      var Cd = Math.sqrt(F00 * F00 + F01 * F01 + F10 * F10 + F11 * F11); if (Cd < 1e-9) Cd = 1e-9;
      var iCd = 1 / Cd;
      var P00 = F00 * iCd, P01 = F01 * iCd, P10 = F10 * iCd, P11 = F11 * iCd;
      var G1x = P00 * a + P01 * bb, G2x = P00 * c + P01 * d, G1y = P10 * a + P11 * bb, G2y = P10 * c + P11 * d;
      var G0x = -(G1x + G2x), G0y = -(G1y + G2y);
      var aD = devC / area * invh2;
      var denD = G0x * G0x + G0y * G0y + G1x * G1x + G1y * G1y + G2x * G2x + G2y * G2y + aD;
      var lD = TL[t * 2];
      var dD = (-Cd - aD * lD) / denD; TL[t * 2] = lD + dD;
      px[i0] += dD * G0x; py[i0] += dD * G0y; px[i1] += dD * G1x; py[i1] += dD * G1y; px[i2] += dD * G2x; py[i2] += dD * G2y;
      // --- hydrostatic: C = det(F) - gamma, P = cofactor(F), grad = P * Dm^-T ---
      e1x = px[i1] - px[i0]; e1y = py[i1] - py[i0]; e2x = px[i2] - px[i0]; e2y = py[i2] - py[i0];
      F00 = e1x * a + e2x * c; F01 = e1x * bb + e2x * d; F10 = e1y * a + e2y * c; F11 = e1y * bb + e2y * d;
      var Ch = (F00 * F11 - F01 * F10) - gamma;
      var PH00 = F11, PH01 = -F10, PH10 = -F01, PH11 = F00;   // d(det F)/dF
      var H1x = PH00 * a + PH01 * bb, H2x = PH00 * c + PH01 * d, H1y = PH10 * a + PH11 * bb, H2y = PH10 * c + PH11 * d;
      var H0x = -(H1x + H2x), H0y = -(H1y + H2y);
      var aH = volC / area * invh2;
      var denH = H0x * H0x + H0y * H0y + H1x * H1x + H1y * H1y + H2x * H2x + H2y * H2y + aH;
      var lH = TL[t * 2 + 1];
      var dH = (-Ch - aH * lH) / denH; TL[t * 2 + 1] = lH + dH;
      px[i0] += dH * H0x; py[i0] += dH * H0y; px[i1] += dH * H1x; py[i1] += dH * H1y; px[i2] += dH * H2x; py[i2] += dH * H2y;
    }
  }
  // ----- INVERSION HEAL (v24.154): unfold locally-stable folded lattice -----
  // Extreme crush (rig + wall + jet + bombs + pile weight) can INVERT lattice
  // triangles. An inverted (mirrored) configuration satisfies every DISTANCE
  // constraint — the classic PBD fold-stable failure — and at the jelly-tetris
  // shape-match (0.005/substep) nothing can pull it back out, so the body stayed
  // mangled forever after the pressure was gone and then SLEPT in that shape
  // (the owner's "glitched out shape, stuck after all pressure is released";
  // harness repro: a mirror-folded cube held 88/128 inverted tris, aspect 4.3,
  // asleep). A mangled self-intersecting ring also degrades the player
  // containment (point-in-ring parity flips), which is how the rig could end up
  // INSIDE a slime. Once per frame, per awake meshed body: det(F) per triangle
  // (the same deformation gradient jelloSolveFEM uses); any tri below DET_MIN
  // gets the FEM hydrostatic projection applied RIGIDLY toward DET_TARGET,
  // velocity-free (prev-pos co-shifted), a few relaxed Gauss-Seidel passes.
  // Healthy squash sits at det ~0.4+ even in a hard landing, far above DET_MIN —
  // this NEVER touches ordinary deformation, only broken geometry. A body with
  // any inverted tri is also held awake (sleeping mid-fold = frozen mangle).
  var JELLO_HEAL_DET_MIN    = -0.02; // det(F) below this = genuinely INVERTED (mirrored) tri.
                                     // Crush is not fold: the landing face-cave / plow / bowl
                                     // position-stomps legally pancake boundary tris to
                                     // near-ZERO area for frames at a time (harness: a 0.06
                                     // threshold caught dozens mid-landing, the pull then
                                     // fought every healthy squash — 29% -> 10% — and blocked
                                     // sleep). Only a NEGATIVE det is the fold-stable mirror
                                     // state the heal exists for; a mirror fold sits ~ -1.
  // v24.190 — the heal now tolerates by TIME, not COUNT. The old `inv > 3` count
  // tolerance let a PERSISTENT small fold (1-3 inverted tris) slip through forever,
  // and the severity scaling alone gave a moderate fold (e.g. 4/128 tris) a pull of
  // only ~0.07 — too weak to unfold it, so a cube undermined by digging froze into a
  // stuck mangled cone (the owner's "glitchy cubes"). Healthy play NEVER inverts
  // (measured: 0 inverted tris across hard 2x2 AND 3x3 landings), so a negative-det
  // tri is an unambiguous fold; the only real question is transient vs stuck. Tolerate
  // a brief pinch (GRACE frames — the extreme-crush corner sliver v24.155 protected),
  // then ramp ANY fold that PERSISTS up to a firm unfold over RAMP frames.
  var JELLO_HEAL_GRACE      = 6;     // frames a fold may persist before the heal engages
                                     // (covers a transient hard-crush sliver; healthy
                                     // landings never invert at all, so this is slack).
  var JELLO_HEAL_RAMP       = 8;     // frames over which a persistent fold's pull ramps to
                                     // full — smooth relaxation, not a one-frame snap.
  var JELLO_HEAL_PULL       = 0.35;  // FULL per-frame rigid shape-match pull on a stuck fold
                                     // (now actually REACHED via the persistence ramp; was
                                     // gated down to a useless ~0.07 by severity alone).
  function jelloInversionHeal(b) {
    var nT = b.triN | 0;
    if (!nT) { b._invN = 0; b._invFrames = 0; b._invHard = false; return; }   // dev triangle/disc bodies have no mesh
    var px = b.px, py = b.py;
    var TA = b.triA, TB = b.triB, TC = b.triC, Dm = b.triDmInv;
    var inv = 0;
    for (var t = 0; t < nT; t++) {
      var i0 = TA[t], i1 = TB[t], i2 = TC[t];
      var a = Dm[t * 4], bm = Dm[t * 4 + 1], c = Dm[t * 4 + 2], d = Dm[t * 4 + 3];
      var e1x = px[i1] - px[i0], e1y = py[i1] - py[i0];
      var e2x = px[i2] - px[i0], e2y = py[i2] - py[i0];
      var F00 = e1x * a + e2x * c, F01 = e1x * bm + e2x * d;
      var F10 = e1y * a + e2y * c, F11 = e1y * bm + e2y * d;
      if (F00 * F11 - F01 * F10 < JELLO_HEAL_DET_MIN) inv++;
    }
    b._invN = inv;
    if (inv === 0) { b._invFrames = 0; b._invHard = false; b._acceptN = 0; return; }   // clean -> reset the persistence clock (and the chronic-fold strike count)
    // Accepted confined fold (see the snap-strikes block below): treat as clean
    // so the body can settle and SLEEP. Validity is self-expiring — 6s from the
    // grant (long enough to go still and sleep, short enough that a body dug
    // free resumes healing promptly) or while actually asleep — and it never
    // applies to a merged/phasing body: phasing shifts are velocity-free with
    // mutual contact suspended, so an accepted fold there read "still" and slept
    // MID-MERGE, parking the pair forever (harness R9).
    if (b._invAcceptAt && (b.sleeping || performance.now() - b._invAcceptAt < 6000) &&
        (b._mergeT || 0) < 0.5 && !b._phaseMate) {
      b._invHard = false;
      // BECALM while accepted (v25.28): a DEEP fold's constraint fight can
      // wiggle above the sleep bar indefinitely (harness T1: an inv-7 confined
      // fold never stilled through the window, so accept/heal cycled forever
      // awake). An accepted fold is by definition one we want QUIET: bleed its
      // relative motion (ox toward px — velocity-only, zero transport risk) so
      // stillness lands within a second and the body actually sleeps.
      if (!b.sleeping) {
        for (var az = 0; az < b.n; az++) {
          b.ox[az] += (b.px[az] - b.ox[az]) * 0.3;
          b.oy[az] += (b.py[az] - b.oy[az]) * 0.3;
        }
      }
      return;
    }
    // Time-tolerant trigger (v24.190): a negative-det tri never occurs in healthy
    // play (measured 0 across hard 2x2/3x3 landings), so a fold is real — tolerate a
    // BRIEF pinch (a hard crush can sliver a corner for a few frames), then engage on
    // anything that PERSISTS, regardless of how few tris (the old `inv > 3` count gate
    // let a stuck 1-3-tri fold ride forever = the owner's frozen cone).
    var directGuard = !!(b._grabbed || b._recoverT > 0);
    var healGrace = directGuard ? 0 : JELLO_HEAL_GRACE;
    var healRamp = directGuard ? 3 : JELLO_HEAL_RAMP;
    b._invFrames = (b._invFrames | 0) + 1;
    if (b._invFrames <= healGrace) { b._invHard = false; return; }
    b._invHard = true;
    // UNFOLD: a strong pull toward the RIGIDLY-ROTATED rest pose. The polar
    // rotation has det +1 by construction, so this is a globally COHERENT unfold
    // direction for every point at once. (A per-triangle det projection was tried
    // first and THRASHED: neighbouring flipped tris pull shared points opposite
    // ways, and the strain limit compacts the tug-of-war into a wad — harness
    // measured the body imploding to 13% area.) beta forced 0 because the linear
    // blend goal can itself be the MIRRORED fit. Strength = severity OR persistence,
    // whichever demands it louder: a SEVERE mangle gets the firm pull at once (sev),
    // a mild-but-STUCK fold ramps to it over RAMP frames (dur) so nothing folded
    // lingers — while a body that only just dipped a corner negative (sev tiny, dur
    // ~0) still gets a whisper, never a force-square of healthy squash.
    var sev = (inv / nT) / 0.15; if (sev > 1) sev = 1;
    var dur = (b._invFrames - healGrace) / healRamp; if (dur > 1) dur = 1;
    var _hb = JELLO_SHAPE_BETA;
    JELLO_SHAPE_BETA = 0;
    // VELOCITY-FREE since v25.18: the unfold used to move px only, so the whole
    // correction became Verlet velocity on the next step. On an isolated stuck fold
    // that was fine (one yank, then quiet), but in a CONFINED PILE (a dug pocket
    // crammed with cubes) folds re-form every frame and the heal became an energy
    // PUMP: yank -> volume/contact fight -> new folds -> yank, churning the pile at
    // thousands of px/s (the owner's "slimes get inside each other" report; the
    // perf overlay read vmax 3474 with 521 contacts). Co-shifting ox/oy keeps the
    // unfold purely positional: same per-frame correction, zero injected energy.
    jelloContactAlloc();
    var hpull = JELLO_HEAL_PULL * (sev > dur ? sev : dur);
    if (directGuard && hpull < JELLO_HEAL_PULL) hpull = JELLO_HEAL_PULL;
    // STUCK-FOLD SNAP (v25.18): a velocity-free pull can be resisted FOREVER by the
    // fold-stable distance constraints — the limit cycle (pull in, springs pull
    // back) kept folded cubes visibly wiggling and locked awake (_invHard blocks
    // sleep by design; the pyramid harness caught three of them). If a fold has
    // survived the full ramp plus a second of healing, restore the body to its
    // rigid pose OUTRIGHT (pull 1.0): the rest pose satisfies every internal
    // constraint by construction, so the fold is gone in one frame; the next
    // substep's world collide resolves any wall overlap the snap leaves. Still
    // velocity-free, so it adds no energy, and the clock re-arms so it can only
    // fire once per failed second.
    if (!directGuard && b._invFrames > JELLO_HEAL_GRACE + JELLO_HEAL_RAMP + 60) {
      hpull = 1.0;
      b._invFrames = JELLO_HEAL_GRACE + 1;
      // ACCEPT a CONFINED fold after three failed snaps (v25.26): a body wedged
      // against world geometry re-folds the moment the snap restores its rigid
      // pose — snap, re-fold, snap, forever, and since _invHard blocks sleep by
      // design the body churned eternally (harness: the same cube failed the
      // sleep gate twice at the same spot with invF cycling). Three strikes in
      // ~15s = the fold is load-bearing; tolerate it (see the acceptance gate at
      // the top of this function) so the body settles and SLEEPS slightly
      // imperfect. SOLO bodies only — a merged pair's fold must keep blocking
      // sleep or the pair parks interlocked (harness R9).
      var _snNow = performance.now();
      if ((b._mergeT || 0) < 0.5 && !b._phaseMate) {
        if (!b._snapT0 || _snNow - b._snapT0 > 15000) { b._snapT0 = _snNow; b._snapN = 0; }
        b._snapN = (b._snapN | 0) + 1;
        if (b._snapN >= 3) {
          b._invAcceptAt = _snNow; b._snapN = 0;
          // CHRONIC fold: the third grant means two full accept-settle windows
          // already failed to end in sleep — the fold re-arms as fast as it is
          // tolerated. Force the sleep endpoint (see the _forceSleep note at
          // the sleep gate). Counter resets when the body ever reads clean.
          b._acceptN = (b._acceptN | 0) + 1;
          if (b._acceptN >= 3) b._forceSleep = true;
        }
      }
    }
    var hpx = jelloVAccX, hpy = jelloVAccY, hn = b.n, hi;
    for (hi = 0; hi < hn; hi++) { hpx[hi] = b.px[hi]; hpy[hi] = b.py[hi]; }
    jelloShapeMatch(b, hpull);
    for (hi = 0; hi < hn; hi++) { b.ox[hi] += b.px[hi] - hpx[hi]; b.oy[hi] += b.py[hi] - hpy[hi]; }
    JELLO_SHAPE_BETA = _hb;
  }

  // xpbd/fem integrate at dt = JELLO_H / JELLO_XPBD_SUBSTEPS, so a FIXED Verlet prev-pos
  // impulse (fling / bomb / land-impact) would impart K times the velocity it does at the
  // pbd dt — that is what made xpbd cubes wildly over-energetic. This returns the scale to
  // keep an imparted impulse solver-independent: 1 for pbd, 1/K for the small-steps solvers.
  // (It is also the effective-substep-dt factor used to report true velocities.)
  function jelloImpulseScale() {
    if (JELLO_SOLVER === 'pbd') return 1;
    var K = JELLO_XPBD_SUBSTEPS;
    return K > 1 ? 1 / K : 1;
  }
  // ===== Global spatial hash + per-particle contact (FleX / Teschner et al. 2003) ===========
  // A uniform grid via a hashed cell index, count-sorted into PREALLOCATED buffers (no per-
  // substep allocation). Cell size = the contact diameter 2r, so a point's contacts are exactly
  // the 3x3 neighbour cells. Points are gathered across ALL active bodies each substep.
  var JELLO_HASH_N = 8191;                 // prime bucket count
  var jelloGPX = null, jelloGPY = null;    // gathered point positions (working copy this substep)
  var jelloGOX = null, jelloGOY = null;    // gathered previous positions (read-only, for friction)
  var jelloGR = null;                      // gathered per-point contact radius (mixed lattice densities)
  var jelloGBody = null, jelloGLocal = null, jelloGHash = null;   // gather -> active-idx, local-idx, cell hash
  var jelloHashStart = null, jelloHashCursor = null, jelloHashOrder = null;
  var jelloSweepFlip = false;   // contact sweep direction, alternated per substep + per pass (anti-ratchet)
  var jelloVAccX = null, jelloVAccY = null, jelloVCnt = null;   // XSPH viscosity scratch (per-body)
  var jelloROX = null, jelloROY = null;                         // render: outset (gap-fill) ring scratch
  var jelloRSX = null, jelloRSY = null;                         // render: chamfer-subdivision scratch (v25.27)
  var jelloRingBakeN = 0;                                       // drawn-ring vertex count the last bake produced
  var jelloActive = [];                    // reused per frame: the non-frozen bodies in the sim step
  function jelloContactAlloc() {
    if (jelloGPX) return;
    var MP = JELLO_MAX_POINTS;
    jelloGPX = new Float64Array(MP); jelloGPY = new Float64Array(MP);
    jelloGOX = new Float64Array(MP); jelloGOY = new Float64Array(MP);
    jelloGR = new Float64Array(MP);
    jelloGBody = new Int32Array(MP); jelloGLocal = new Int32Array(MP); jelloGHash = new Int32Array(MP);
    jelloHashStart = new Int32Array(JELLO_HASH_N + 1);
    jelloHashCursor = new Int32Array(JELLO_HASH_N + 1);
    jelloHashOrder = new Int32Array(MP);
    jelloVAccX = new Float64Array(MP); jelloVAccY = new Float64Array(MP); jelloVCnt = new Int32Array(MP);
    jelloROX = new Float64Array(MP); jelloROY = new Float64Array(MP);   // render: outset ring (gap-fill)
    jelloRSX = new Float64Array(MP); jelloRSY = new Float64Array(MP);   // render: chamfer scratch (v25.27)
  }
  // ----- XSPH viscosity (Schechter & Bridson 2012): nudge each point's velocity toward the
  // average of its spring-neighbours by JELLO_XSPH. Damps only RELATIVE motion (the bulk
  // translate/rotate is untouched), so the body oozes + a pressed pile dissipates to rest.
  // Applied in the velocity domain (adjust ox), so it never moves the body, only calms it. -----
  function jelloViscosityXSPH(b, c) {
    if (c <= 0) return;
    jelloContactAlloc();   // scratch (jelloVAccX/Y/Cnt) is lazily allocated; this runs BEFORE the
                           // first jelloContactSolve in the substep loop, so allocate it here too.
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var sA = b.sA, sB = b.sB, sN = b.springN;
    var accX = jelloVAccX, accY = jelloVAccY, cnt = jelloVCnt, i;
    accX.fill(0, 0, n); accY.fill(0, 0, n); cnt.fill(0, 0, n);   // zero only the [0,n) slice in use
    for (var s = 0; s < sN; s++) {
      var a = sA[s], bb = sB[s];
      var vax = px[a] - ox[a], vay = py[a] - oy[a];
      var vbx = px[bb] - ox[bb], vby = py[bb] - oy[bb];
      accX[a] += vbx - vax; accY[a] += vby - vay; cnt[a]++;
      accX[bb] += vax - vbx; accY[bb] += vay - vby; cnt[bb]++;
    }
    for (i = 0; i < n; i++) {
      if (cnt[i] === 0) continue;
      // add c * (neighbour-avg relative velocity) to v_i; v = px-ox, so SUBTRACT from ox to add to v
      ox[i] -= c * accX[i] / cnt[i];
      oy[i] -= c * accY[i] / cnt[i];
    }
  }
  function jelloHashCell(ix, iy) {
    var h = ((ix * 73856093) ^ (iy * 19349663)) % JELLO_HASH_N;
    return h < 0 ? h + JELLO_HASH_N : h;
  }
  // Solve per-particle contact for ONE substep across all active bodies. Gathers points, builds
  // the hash, then a serial Gauss-Seidel sweep: different-body point pairs within 2r are pushed
  // apart to exactly 2r (UNILATERAL -> only separates, never pulls -> never merges; equal-mass
  // half-and-half split) plus positional Coulomb friction. Moves px/py only (it becomes velocity
  // via Verlet; the per-substep clamp + sleeping keep it stable). Sleeping bodies are included so
  // an awake blob collides with a settled pile, and are woken on contact. Returns #corrections.
  function jelloContactSolve(active, nActive, cellSize) {
    jelloContactAlloc();
    var invCell = 1 / cellSize;   // hash cell = the largest 2r among active bodies (covers any rA+rB)
    var GPX = jelloGPX, GPY = jelloGPY, GOX = jelloGOX, GOY = jelloGOY, GR = jelloGR;
    var GB = jelloGBody, GL = jelloGLocal, GH = jelloGHash;
    var START = jelloHashStart, CURSOR = jelloHashCursor, ORDER = jelloHashOrder, HN = JELLO_HASH_N;
    var fric = JELLO_CONTACT_FRICTION, ndamp = JELLO_CONTACT_DAMP, MP = JELLO_MAX_POINTS;
    var ripVnMin = (JELLO_RIPPLE > 0) ? (JELLO_RIPPLE_VMIN / JELLO_TIMESCALE) * jelloStepH : 1e18;   // px/substep
    var citers = (JELLO_CONTACT_ITERS | 0); if (citers < 1) citers = 1;
    var selfOn = JELLO_CONTACT_SELF;   // self-contact rest gate is per-body (b.selfMin2)
    var N = 0, ai, b, i, j, h, n, px, py, ox, oy;
    // 1. gather active points into flat buffers
    for (ai = 0; ai < nActive; ai++) {
      b = active[ai]; n = b.n; px = b.px; py = b.py; ox = b.ox; oy = b.oy;
      var bcr = b.cr;
      for (i = 0; i < n; i++) {
        if (N >= MP) break;
        GPX[N] = px[i]; GPY[N] = py[i]; GOX[N] = ox[i]; GOY[N] = oy[i]; GR[N] = bcr; GB[N] = ai; GL[N] = i; N++;
      }
    }
    if (N < 2) return 0;
    // 2. build the hash (count-sort)
    START.fill(0);                       // START is Int32Array(HN+1); clears the whole bucket table
    for (i = 0; i < N; i++) {
      h = jelloHashCell(Math.floor(GPX[i] * invCell), Math.floor(GPY[i] * invCell));
      GH[i] = h; START[h + 1]++;
    }
    for (j = 0; j < HN; j++) START[j + 1] += START[j];
    CURSOR.set(START);                   // copy the prefix-sum offsets (same-length Int32Array memcpy)
    for (i = 0; i < N; i++) { h = GH[i]; ORDER[CURSOR[h]++] = i; }
    // 3. serial Gauss-Seidel contact sweep, iterated citers times (reuses the cached hash) so a
    //    hard press is fully separated instead of leaving residual overlap (the conjoined look).
    //    The sweep DIRECTION alternates every substep and every pass (v24.112): a fixed-order
    //    serial sweep is a RATCHET — later-processed points see earlier corrections, so the
    //    per-substep solver pulse noise in a touching row rectifies into net transport (a
    //    3-cube row WALKED across the world at a steady ~47 px/s with the row width locked,
    //    harness-measured, churning at ~100 px/s and never sleeping — the flat-ground
    //    "spongebob wiggle"). Ping-pong ordering cancels the directional bias; pair maths is
    //    direction-independent (each unordered pair still solved exactly once per pass).
    var contacts = 0, gx, gy, kk, cend, cx, cy, dx, dy, d2, d, pen, nx, ny, half, cit, si;
    jelloSweepFlip = !jelloSweepFlip;
    for (cit = 0; cit < citers; cit++) {
    contacts = 0;   // report the LAST pass's contact count (it converges down as overlap clears)
    var rev = (cit & 1) ? !jelloSweepFlip : jelloSweepFlip;
    for (si = 0; si < N; si++) {
      i = rev ? (N - 1 - si) : si;
      var bi = GB[i];
      cx = Math.floor(GPX[i] * invCell); cy = Math.floor(GPY[i] * invCell);
      for (gx = cx - 1; gx <= cx + 1; gx++) {
        for (gy = cy - 1; gy <= cy + 1; gy++) {
          h = jelloHashCell(gx, gy);
          cend = START[h + 1];
          for (kk = START[h]; kk < cend; kk++) {
            j = ORDER[kk];
            if (j <= i) continue;            // each unordered pair once (gather-index order)
            if (GB[j] === bi) {              // same body: self-collide ONLY points far apart in the rest
              if (!selfOn) continue;         // lattice (a genuine fold), never near-neighbours / squish
              var bb = active[bi]; if (!bb.rx) continue;
              var rdx = bb.rx[GL[i]] - bb.rx[GL[j]], rdy = bb.ry[GL[i]] - bb.ry[GL[j]];
              if (rdx * rdx + rdy * rdy < bb.selfMin2) continue;
            }
            else if (active[bi]._phaseMate === active[GB[j]]) continue;   // phasing pair (jelloUnmergeBodies):
                                                                          // mutual contact suspended while they slide apart
            dx = GPX[j] - GPX[i]; dy = GPY[j] - GPY[i];
            d2 = dx * dx + dy * dy;
            var rr = GR[i] + GR[j];   // per-pair contact distance (mixed lattice densities)
            // !(d2 < rr*rr) instead of d2 >= rr*rr: identical for real numbers, but a NaN d2
            // (a corrupt point) fails BOTH >= and <, fell through, and the NaN then spread
            // through nx/ny into every body it touched. NaN must never enter the solve.
            if (!(d2 < rr * rr) || d2 < 1e-12) continue;
            d = Math.sqrt(d2); pen = rr - d;
            nx = dx / d; ny = dy / d; half = pen * 0.5;
            // 1. velocity-free positional separation: shift px AND ox by the same delta, so the
            //    separation injects NO velocity (no bounce) — the body just stops penetrating.
            GPX[i] -= nx * half; GPY[i] -= ny * half; GOX[i] -= nx * half; GOY[i] -= ny * half;
            GPX[j] += nx * half; GPY[j] += ny * half; GOX[j] += nx * half; GOY[j] += ny * half;
            var rvx = (GPX[i] - GOX[i]) - (GPX[j] - GOX[j]);
            var rvy = (GPY[i] - GOY[i]) - (GPY[j] - GOY[j]);
            var vn = rvx * nx + rvy * ny;   // relative normal velocity (>0 = approaching; n points i->j)
            if (vn > ripVnMin) {   // body-body knock: cheap one-compare gate, then rate-limited
              var rA = active[jelloGBody[i]], rB = active[jelloGBody[j]];
              var vnReal = vn / jelloStepH * JELLO_TIMESCALE;
              jelloRippleHit(rA, rA.ringPos ? rA.ringPos[jelloGLocal[i]] : -1, vnReal, 0.5, 0.18);
              jelloRippleHit(rB, rB.ringPos ? rB.ringPos[jelloGLocal[j]] : -1, vnReal, 0.5, 0.18);
            }
            // 2. inelastic NORMAL damping: bleed the approach velocity (via ox). Without this the
            //    approach velocity persists and gravity pumps the pile to the clamp; WITH it the
            //    pile reaches a stable rest (numerically validated).
            if (vn > 0 && ndamp > 0) {
              var dvn = vn * ndamp * 0.5;
              GOX[i] += dvn * nx; GOY[i] += dvn * ny; GOX[j] -= dvn * nx; GOY[j] -= dvn * ny;
              rvx = (GPX[i] - GOX[i]) - (GPX[j] - GOX[j]); rvy = (GPY[i] - GOY[i]) - (GPY[j] - GOY[j]);
            }
            // 3. positional Coulomb friction (via ox): remove min(tangential slip, fric*pen).
            if (fric > 0) {
              var rnd = rvx * nx + rvy * ny;
              var tx = rvx - rnd * nx, ty = rvy - rnd * ny;
              var tl = Math.sqrt(tx * tx + ty * ty);
              if (tl > 1e-9) {
                var cap = fric * pen, rem = tl < cap ? tl : cap, sfr = (rem / tl) * 0.5;
                GOX[i] += tx * sfr; GOY[i] += ty * sfr; GOX[j] -= tx * sfr; GOY[j] -= ty * sfr;
              }
            }
            contacts++;
            active[bi]._cHits++; active[GB[j]]._cHits++;   // crowd-pressure gauge (JELLO_CROWD_CALM)
            // PUSH-CHAIN stamp propagation (v25.21): a body being pressed by a
            // player-driven body is part of the player's push and must not be
            // drained either — without this the FAR cube in a two-cube shove was
            // never stamped, the calm froze it, and the whole chain stopped dead
            // (owner's "pushing one against another, it won't move"). Each hop
            // inherits the stamp 120ms older, so the exemption fades across a
            // long chain instead of blanket-exempting a whole touching pile.
            var _psA = active[bi]._plyMs || 0, _psB = active[GB[j]]._plyMs || 0;
            if (_psA > _psB + 120) active[GB[j]]._plyMs = _psA - 120;
            else if (_psB > _psA + 120) active[bi]._plyMs = _psB - 120;
            if (active[bi].sleeping)    { active[bi].sleeping = false;    active[bi]._solve = true; }
            if (active[GB[j]].sleeping) { active[GB[j]].sleeping = false; active[GB[j]]._solve = true; }
          }
        }
      }
    }
    if (contacts === 0) break;   // v25.43 perf (owner-kept in the v25.47 A/B): a zero-contact pass
                                 // means the remaining passes are no-ops (settled / fully separated)
    }   // end citers iteration loop
    // 4. write the corrected positions AND prev-positions back (ox carries the velocity damping)
    for (i = 0; i < N; i++) { b = active[GB[i]]; var li = GL[i]; b.px[li] = GPX[i]; b.py[li] = GPY[i]; b.ox[li] = GOX[i]; b.oy[li] = GOY[i]; }
    return contacts;
  }

  // ----- Boundary CONTAINMENT backstop (the robust anti-conjoin) -----------------------------
  // The per-particle contact above keeps points 2r apart, but two VERY SOFT / stretched rings can
  // still interleave between boundary points (a point of A slips between two of B's, no point-pair
  // within 2r). This pass closes that hole geometrically: any boundary point of A found INSIDE B's
  // ring is pushed back out to B's nearest boundary edge + a margin. No point ends up inside another
  // body => no ring interleaving => no conjoining, at ANY softness. Velocity-free (shift ox with px,
  // injects no energy) + normal approach-damping. Per substep, so it converges WITH the solve (no
  // jitter — that was the flaw of the retired once-per-frame jelloResolveBodies). Cheap in a settled
  // pile (bbox broadphase culls; the ray-cast only runs for points actually overlapping).
  function jelloRingBBox(b) {
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py, l = 1e9, r = -1e9, t = 1e9, bm = -1e9;
    for (var i = 0; i < rn; i++) { var x = px[ring[i]], y = py[ring[i]]; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > bm) bm = y; }
    b._cbL = l; b._cbR = r; b._cbT = t; b._cbB = bm;
  }
  function jelloContainOneWay(A, B, margin, damp) {
    var ring = A.ring, rn = A.ringN, px = A.px, py = A.py, ox = A.ox, oy = A.oy;
    var bl = B._cbL, br = B._cbR, bt = B._cbT, bb = B._cbB;
    for (var i = 0; i < rn; i++) {
      var p = ring[i], x = px[p], y = py[p];
      if (x < bl || x > br || y < bt || y > bb) continue;       // point-bbox cull
      if (!jelloPointInRing(B, x, y)) continue;                 // only points actually inside B
      var near = jelloNearestOnRing(B, x, y);
      var nx = near.x - x, ny = near.y - y, d = Math.sqrt(nx * nx + ny * ny);
      if (!(d > 1e-4)) continue;   // !(...) also rejects a NaN d — never divide by it
      nx /= d; ny /= d;
      var tx = near.x + nx * margin, ty = near.y + ny * margin; // park just OUTSIDE B's boundary
      var ddx = tx - x, ddy = ty - y;
      px[p] = tx; py[p] = ty; ox[p] += ddx; oy[p] += ddy;       // velocity-free positional push
      var vn = (px[p] - ox[p]) * nx + (py[p] - oy[p]) * ny;     // inward approach along the exit normal
      if (vn < 0) { ox[p] += nx * vn * damp; oy[p] += ny * vn * damp; }   // bleed it (inelastic)
    }
  }
  function jelloContainBodies(active, nActive) {
    if (!JELLO_CONTACT_CONTAIN || nActive < 2) return;
    var a, c, A, B, margin = 1.5, damp = JELLO_CONTACT_DAMP;   // 1.5px: park just outside the other ring
                                                               // (was JELLO_BODY_MARGIN, removed in the v22.9 cleanup)
    for (a = 0; a < nActive; a++) { A = active[a]; if (A.ringN >= 3) jelloRingBBox(A); }
    for (a = 0; a < nActive; a++) {
      A = active[a]; if (A.ringN < 3) continue;
      for (c = a + 1; c < nActive; c++) {
        B = active[c]; if (B.ringN < 3) continue;
        if (A._cbR < B._cbL || A._cbL > B._cbR || A._cbB < B._cbT || A._cbT > B._cbB) continue;   // bbox broadphase
        if (A._phaseMate === B) continue;   // phasing pair: the backstop must not re-lock what unmerge is sliding apart
        jelloContainOneWay(A, B, margin, damp);
        jelloContainOneWay(B, A, margin, damp);
      }
    }
  }

  // ----- FINITE SWEEP (last-resort NaN/Inf recovery) --------------------------------
  // Nothing in the solve should ever produce a non-finite coordinate (every division is
  // guarded), but "should" is not a guarantee the rest of the game can live with: ONE NaN
  // reaching jelloDrawBody's canvas gradients THROWS and kills the whole render loop, and
  // a NaN b.vx read by the ground probe corrupts the rig's own physics. So once per frame
  // every active body gets an O(n) isFinite sweep: corrupt points are healed to the
  // centroid of the surviving finite points (velocity zeroed, small deterministic spread
  // so no two land coincident) and the constraints re-form the body over the next ticks.
  // A body with NO finite points (or corrupt REST data, which would re-poison the healed
  // points every solve = a heal livelock) is beyond recovery: despawn it with a splat, so
  // the worst possible numerical failure reads as "the slime popped", never a glitch.
  // Returns false when the body must be despawned. Clean-path cost: two isFinite + two
  // adds per point, once per frame — noise next to one constraint iteration.
  function jelloSanitizeBody(b) {
    var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
    var sumX = 0, sumY = 0, good = 0, bad = false, i, x, y;
    for (i = 0; i < n; i++) {
      x = px[i]; y = py[i];
      if (isFinite(x) && isFinite(y)) { sumX += x; sumY += y; good++; }
      else bad = true;
    }
    if (!bad) return true;
    if (good === 0) return false;                       // every point corrupt -> despawn
    var rx = b.rx, ry = b.ry;
    for (i = 0; i < n; i++) if (!isFinite(rx[i]) || !isFinite(ry[i])) return false;   // rest data gone -> despawn
    var hcx = sumX / good, hcy = sumY / good;
    for (i = 0; i < n; i++) {
      if (isFinite(px[i]) && isFinite(py[i])) {
        if (!isFinite(ox[i]) || !isFinite(oy[i])) { ox[i] = px[i]; oy[i] = py[i]; }   // kill a NaN velocity
        continue;
      }
      px[i] = ox[i] = hcx + ((i % 7) - 3) * 0.4;
      py[i] = oy[i] = hcy + ((((i / 7) | 0) % 7) - 3) * 0.4;
    }
    b.sleeping = false; b.sleepFrames = 0;              // stay awake while the constraints re-form it (park clock KEEPS accruing: a chronic fold must still reach the force-sleep endpoint)
    return true;
  }

  // ===== DISSOLVE (v25.53) — see the JELLO_DISSOLVE tunables banner =====

  // Begin the transition: wake the body and stamp the melt clock. NOTHING
  // pushes the water here or later (v25.55): the v25.53 blast-170 opener
  // and even the v25.54 blast-45 stir both read as an explosion to the
  // owner — the poof pushes nothing at all. The telegraph is purely the
  // colour ease; the swap itself is jelloDissolvePoof.
  function jelloDissolveStart(b) {
    b._melting = true;
    b._meltT = 0;
    b._meltSpawned = 0;
    b.sleeping = false; b.sleepFrames = 0;
    jelloDissolving = b;
    jelloDissolveTotal++;
  }

  // The POOF (v25.55, the owner's call after two burst designs): once the
  // telegraph has played, the WHOLE body converts in ONE frame — water
  // spawns across every lattice point, filling the slime's exact live
  // silhouette, and then simply falls as water. No wake, no melt line, no
  // pacing machinery; the swap is the effect. Two physics guards survive
  // from the burst era: DENSITY-SCALED release (the body interpenetrates
  // the pond, and releasing the full volume where water already stands
  // doubled local density — the pressure solver answered with the blast
  // the owner kept seeing; a pond-interior point releases ~15% of nominal,
  // a dry edge the full JELLO_DISSOLVE_PPP, so a dry-shape spawn sits at
  // rest density = equilibrium, no push), and the LIQUID_MAX_PARTICLES
  // clamp. liquidWakeForDig un-sleeps the receiving pond (zero velocity
  // injected); a few gel droplets are the only flourish.
  function jelloDissolvePoof(b, dt) {
    b._meltT += dt;
    if (b._meltT < JELLO_DISSOLVE_MELT) return false;   // telegraph: colour only
    var n = b.n;
    var canAdd = typeof addLiquidParticle === 'function';
    var rvx = (b.vx || 0) * JELLO_TIMESCALE, rvy = (b.vy || 0) * JELLO_TIMESCALE;
    if (rvx > 300) rvx = 300; else if (rvx < -300) rvx = -300;
    if (rvy > 300) rvy = 300; else if (rvy < -300) rvy = -300;
    if (rvx !== rvx) rvx = 0;
    if (rvy !== rvy) rvy = 0;
    var half = (b.spacing || (TILE / JELLO_NPT)) * 0.55;
    var bins = jelloWaterBins, bN = jelloWaterBinN;
    for (var pi = 0; pi < n && canAdd; pi++) {
      var x = b.px[pi], y = b.py[pi];
      if (x !== x || y !== y) continue;   // corrupt point releases nothing
      var k = JELLO_DISSOLVE_PPP;
      var sl = bins.get(Math.floor(y * 0.0625) * 8192 + Math.floor(x * 0.0625));
      if (sl !== undefined) {
        var sc = 1 - bN[sl] / 140;
        if (sc < 0.15) sc = 0.15; else if (sc > 1) sc = 1;
        k = Math.round(k * sc);
      }
      for (var s = 0; s < k; s++) {
        if (liquidCount >= LIQUID_MAX_PARTICLES - 64) { canAdd = false; break; }
        var h1 = (Math.imul((pi + 1) * 641 + s, 2654435761) >>> 0);
        addLiquidParticle('water',
          x + (((h1 & 255) / 255) * 2 - 1) * half,
          y + ((((h1 >> 8) & 255) / 255) * 2 - 1) * half,
          rvx + (((h1 >> 16) & 63) - 31.5) * 0.6,
          rvy + (((h1 >> 22) & 63) - 31.5) * 0.4,
          0);
        b._meltSpawned++;
      }
    }
    if (typeof liquidWakeForDig === 'function') {
      try { liquidWakeForDig(Math.floor(b.cy / TILE), Math.floor(b.cx / TILE)); } catch (e) {}
    }
    spawnJelloSplat(b.cx, b.cy, 6, 55, 0.7, null);
    return true;
  }

  // Per-frame dissolve pass (replaces the reverted v25.50-52 coupling).
  // Bin the liquid mirror at 16-px cells over the active bodies' union AABB
  // (+ trigger radius), then per body count particles sitting in DENSE bins
  // within JELLO_DISSOLVE_R of its bbox; a sustained count starts the melt.
  // The mirror's x/y refresh per frame from the async GPU readback; on the
  // CPU water path they are simply the live arrays.
  function jelloWaterDissolveFrame(active, nActive, dt) {
    var bins = jelloWaterBins;
    // Expire release wakes (consumers read-gate on t0; this forgets them).
    if (jelloSplashWakes.length) {
      var nowW = performance.now();
      for (var wi = jelloSplashWakes.length - 1; wi >= 0; wi--) {
        if (nowW - jelloSplashWakes[wi].t0 > 260) jelloSplashWakes.splice(wi, 1);
      }
    }
    if (!JELLO_DISSOLVE || nActive === 0 ||
        typeof liquidCount === 'undefined' || liquidCount === 0) {
      if (bins.size) bins.clear();
      return;
    }
    // Union AABB (+R) of the active bodies, then one binning sweep of the
    // mirror. O(liquidCount) with a bbox reject — the same cost class
    // playerWaterCushion already pays while the rig is wet. Runs during a
    // melt too (v25.54): the density-aware release reads FRESH bins.
    var pad = TILE + JELLO_DISSOLVE_R;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ai, b;
    for (ai = 0; ai < nActive; ai++) {
      b = active[ai];
      if (b.bboxL < x0) x0 = b.bboxL;
      if (b.bboxR > x1) x1 = b.bboxR;
      if (b.bboxT < y0) y0 = b.bboxT;
      if (b.bboxB > y1) y1 = b.bboxB;
    }
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    bins.clear();
    var cur = 0, cap = jelloWaterBinN.length;
    for (var i = 0; i < liquidCount; i++) {
      var wx = liquidX[i], wy = liquidY[i];
      if (!(wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1)) continue;   // NaN also skips
      if (liquidType[i] !== 0) continue;   // WATER only (gel-in-oil = future reactions)
      var key = Math.floor(wy * 0.0625) * 8192 + Math.floor(wx * 0.0625);
      var s = bins.get(key);
      if (s === undefined) {
        if (cur >= cap) continue;   // bin cap: overflow just reads dry
        s = cur++;
        bins.set(key, s);
        jelloWaterBinN[s] = 0;
      }
      jelloWaterBinN[s] += 1;
    }
    // Advance the one in-flight melt; no new triggers meanwhile (pacing: a
    // pile beside a flood converts one body at a time, not as a bomb).
    if (jelloDissolving) {
      var db = jelloDissolving;
      if (jelloBodies.indexOf(db) < 0) {
        jelloDissolving = null;   // despawned by another system mid-melt
      } else if (jelloDissolvePoof(db, dt)) {
        var di = jelloBodies.indexOf(db);
        if (di >= 0) jelloBodies.splice(di, 1);
        jelloDissolving = null;
      }
      return;
    }
    if (!bins.size) return;
    // Per body: sum particles in DENSE bins within [bbox +/- R]. The DENSE
    // gate (>= JELLO_DISSOLVE_DENSE per 16-px bin) is the owner's "a ground
    // film or one droplet must not trigger": films/sprays measure 20-60 a
    // bin, real water bodies 140+. Sustained over the dwell -> melt.
    for (ai = 0; ai < nActive; ai++) {
      b = active[ai];
      // v25.85 BANYA: guest slimes are customers, not solutes (plan B-D5).
      if (b.guest) { b._dslT = 0; b._dslNear = 0; continue; }
      var bx0 = Math.floor((b.bboxL - JELLO_DISSOLVE_R) * 0.0625);
      var bx1 = Math.floor((b.bboxR + JELLO_DISSOLVE_R) * 0.0625);
      var by0 = Math.floor((b.bboxT - JELLO_DISSOLVE_R) * 0.0625);
      var by1 = Math.floor((b.bboxB + JELLO_DISSOLVE_R) * 0.0625);
      var near = 0;
      for (var br = by0; br <= by1; br++) {
        for (var bc = bx0; bc <= bx1; bc++) {
          var sl = bins.get(br * 8192 + bc);
          if (sl !== undefined && jelloWaterBinN[sl] >= JELLO_DISSOLVE_DENSE) near += jelloWaterBinN[sl];
        }
      }
      b._dslNear = near;
      if (near >= JELLO_DISSOLVE_N) {
        b._dslT = (b._dslT || 0) + dt;
        if (b._dslT >= JELLO_DISSOLVE_DWELL && !b._melting) {
          jelloDissolveStart(b);
          break;   // one at a time
        }
      } else b._dslT = 0;
    }
  }

  // Dev probe (window.__smokeObst pattern): headless harnesses + owner bug
  // reports read the dissolve state directly. Never read by game code.
  if (typeof window !== 'undefined') {
    window.__jelloWater = function () {
      var binMax = 0;
      jelloWaterBins.forEach(function (slot) {
        if (jelloWaterBinN[slot] > binMax) binMax = jelloWaterBinN[slot];
      });
      var ponds = [];
      if (typeof surfacePonds !== 'undefined' && surfacePonds) {
        for (var pi = 0; pi < surfacePonds.length; pi++) {
          var p = surfacePonds[pi];
          ponds.push({ cL: p.cL, cR: p.cR, d: p.d || 1, filled: !!p.filled });
        }
      }
      return {
        lever: JELLO_DISSOLVE, r: JELLO_DISSOLVE_R, need: JELLO_DISSOLVE_N,
        dissolved: jelloDissolveTotal, melting: !!jelloDissolving,
        bins: jelloWaterBins.size, binMax: binMax,
        wakes: jelloSplashWakes.length, splashes: jelloSplashTotal,
        skyY: SKY_ROWS * TILE, tile: TILE,
        liquidN: (typeof liquidCount !== 'undefined') ? liquidCount : -1,
        ponds: ponds,
        bodies: jelloBodies.map(function (b) {
          return { near: b._dslNear || 0, dwell: b._dslT || 0,
                   melting: !!b._melting,
                   cx: b.cx, cy: b.cy, n: b.n, sleeping: !!b.sleeping,
                   bt: b.bboxT, bb: b.bboxB, vx: b.vx || 0, vy: b.vy || 0 };
        })
      };
    };
  }

  function updateJello(dt) {
    if (jelloBodies.length === 0 && jelloSplats.length === 0) return;
    updateJelloSplats(dt);
    var simFrozen = gameOver || gameWon || (UI_NEW && shopState !== 'closed');
    if (simFrozen || jelloBodies.length === 0) return;
    if (!isFinite(dt) || dt <= 0.0005) return;
    if (dt > 0.05) dt = 0.05;
    // Lever insurance: the timescale divides gravity (grav / ts^2) and converts every
    // real<->sim velocity, so 0 / negative / NaN (a stray gm.set from the console) means
    // Inf gravity on the next integrate = instant corruption. Self-heal it instead.
    if (!(JELLO_TIMESCALE >= 0.02)) JELLO_TIMESCALE = 0.02;
    jelloRippleFrame(dt);   // render-space impact ripples (advances every frame, pre-quantiser)

    // Slow-motion / massive feel: feed the sim a fraction of real time.
    jelloAccum += dt * JELLO_TIMESCALE;
    var subs = 0;
    while (jelloAccum >= JELLO_H && subs < JELLO_MAX_SUBSTEPS) { subs++; jelloAccum -= JELLO_H; }
    if (jelloAccum > JELLO_H) jelloAccum = JELLO_H;
    if (subs === 0) return;
    jelloFrameNo++;   // stamp for the shade-matrix cache (skipped frames keep the cache fresh)
    // Cache the jet frame for this frame's substeps (rotation-flight aware).
    jelloJetOn = !!(player && player.thrusting && player.fuel > 0 && !gameOver && !gameWon &&
                    typeof rocketExhaustDir === 'function' && typeof playerLocalToWorld === 'function');
    if (jelloJetOn) {
      var jed = rocketExhaustDir();
      var jnz = playerLocalToWorld(PLAYER_W * 0.5, PLAYER_H - 1);
      jelloJetDX = jed.x; jelloJetDY = jed.y; jelloJetOX = jnz.x; jelloJetOY = jnz.y;
      // Occlusion ray: solid tiles only (rocketFindImpactAlong also stops at gel,
      // which would shield the very slime the jet is hitting). 4px steps, <= 32 probes.
      jelloJetMaxS = Infinity;
      for (var _jos = 4; _jos <= JELLO_JET_LEN; _jos += 4) {
        if (tileAt(Math.floor((jelloJetOY + jelloJetDY * _jos) / TILE),
                   Math.floor((jelloJetOX + jelloJetDX * _jos) / TILE)) !== null) { jelloJetMaxS = _jos; break; }
      }
    }
    jelloJetReactT = 0;   // back-pressure coverage accumulates fresh each simulated frame

    // Effective substep dt for velocity REPORTING (jelloUpdateBody -> b.vx, jelloMaxVsq,
    // ground probe). xpbd/fem integrate at JELLO_H/K, so report at that dt or every read
    // velocity (and the fling gate + perf vmax) would be 1/K of reality.
    var stepDt = JELLO_H * jelloImpulseScale();
    jelloLastSubs = subs; jelloMaxVsq = 0; jelloSepThisFrame = 0; jelloContactsThisFrame = 0;
    if (devMode) { jelloDbg.plowPts = 0; jelloDbg.shearPts = 0; jelloDbg.flings = 0; }

    // ----- Build the ACTIVE set: every non-frozen body. Awake ones run the internal solve;
    // sleeping ones are still included so an awake blob collides with (and wakes) a settled
    // pile. The old per-body wake/proximity test is preserved for whether a sleeper SOLVES. -----
    var active = jelloActive; active.length = 0;
    var bi, b, maxCr = 0;
    for (bi = 0; bi < jelloBodies.length; bi++) {
      b = jelloBodies[bi];
      b.frozen = !jelloBodyOnCamera(b);
      if (b.frozen) continue;
      // Live per-body contact radii (per-frame so the R_FRAC / SELF_MIN_REST
      // levers stay live). The hash cell must cover the largest possible pair.
      var bsp = b.spacing || (TILE / JELLO_NPT);
      b.cr = JELLO_CONTACT_R_FRAC * bsp;
      var bsm = JELLO_SELF_MIN_REST * bsp;
      b.selfMin2 = bsm * bsm;
      if (b.cr > maxCr) maxCr = b.cr;
      b._cHits = 0;      // crowd-pressure gauge, accumulated by the contact solve this frame
      b._wedgeHits = 0;  // wedge gauge: gap-block ejects + diagonal-pinch undos this frame (v25.21) —
                         // a body grinding inside a too-small tile channel churns against SOLID, which
                         // the body-body gauge above never sees (the owner's wedged-slime shake)
      b._solve = true;
      if (b.sleeping) {
        var awake = false;
        if (player && !gameWon && !gameOver) {
          // Jet wash reaches ~4 tiles below the feet and +/-JELLO_JET_RANGE to the sides; widen
          // the wake region to that cone so a sleeping blob reacts the instant you fly over it.
          var padX = TILE * 0.75, padUp = TILE * 0.75, padDn = TILE * 0.75;
          if (player.thrusting && player.fuel > 0) { padX = JELLO_JET_LEN; padUp = JELLO_JET_LEN; padDn = JELLO_JET_LEN; }
          if (!(b.bboxR < player.x - padX || b.bboxL > player.x + PLAYER_W + padX ||
                b.bboxB < player.y - padUp || b.bboxT > player.y + PLAYER_H + padDn)) awake = true;
        }
        if (!awake) b._solve = false;                  // stays asleep (still collides), no internal solve
        else { b.sleeping = false; b.sleepFrames = 0; }
      }
      if (b._solve) jelloPlayerFling(b, dt);           // drive-into push/fling, once before the substeps
      active[active.length] = b;
    }
    var nActive = active.length;
    jelloDirectGrabActive = false;
    for (var gai = 0; gai < nActive; gai++) {
      if (active[gai]._grabbed) { jelloDirectGrabActive = true; break; }
    }

    // DISSOLVE (v25.53): count dense water near each body, advance any
    // in-flight melt/burst. Runs BEFORE the fpx snapshot so a melt-woken
    // body gets a legal frame anchor. A completed burst splices its body
    // out of jelloBodies here; `active` still holds it for this frame's
    // substeps, which is harmless (the object stays finite) and cheaper
    // than rebuilding the active list mid-frame.
    jelloWaterDissolveFrame(active, nActive, dt);

    // ----- Frame-START position snapshot (for the frame-displacement sleep gate in
    // jelloUpdateBody): per-substep constraint pulses cancel over the frame, real
    // motion doesn't. Lazy-alloc per body; contact/containment can nudge sleeping
    // bodies too, so snapshot every active body, not just the solving ones. -----
    var si2, b2;
    var anySolve = false;
    for (ai = 0; ai < nActive; ai++) {
      b2 = active[ai];
      if (!b2._solve) continue;   // asleep: points do not move, the last snapshot still equals px (v25.31 perf)
      anySolve = true;
      if (!b2.fpx || b2.fpx.length < b2.n) { b2.fpx = new Float64Array(b2.px.length); b2.fpy = new Float64Array(b2.py.length); }
      for (si2 = 0; si2 < b2.n; si2++) { b2.fpx[si2] = b2.px[si2]; b2.fpy[si2] = b2.py[si2]; }
    }

    // ----- THE UNIFIED SUBSTEP LOOP (FleX Algorithm 1). Each substep: advance every active
    // body's INTERNAL solve one step, then solve GLOBAL per-particle contact in the SAME sweep,
    // then clamp velocity. Contact converging WITH the body solve (not as a separate
    // once-per-frame pass) is what removes the press-together STICKING and the contact JITTER. -----
    var m = JELLO_SOLVER;
    var K = (m === 'pbd') ? 1 : (JELLO_XPBD_SUBSTEPS < 1 ? 1 : JELLO_XPBD_SUBSTEPS);
    var h = JELLO_H / K;
    jelloStepH = h;   // expose the substep h to the injection sites (real-px/s conversion)
    var totalSteps = subs * K;
    var contactCell = maxCr * 2;   // hash cell size = the largest 2r (covers any rA+rB pair)
    var step, ai;
    // A fully sleeping scene has nothing to integrate: no solving body means no
    // internal steps, and contact/containment between two STATIC bodies is a
    // no-op by definition — skip the whole substep machinery (v25.31 perf; the
    // parked-pile common case). The rig displace + rescue + render below still
    // run, so a rig pressed into a sleeping pile stays evicted.
    if (!anySolve) totalSteps = 0;
    // Dev-only phase timing (v25.41): jello.internal / jello.contact / etc
    // buckets — where does the AWAKE-solver frame go? Emitted via the perfMark
    // now-minus-acc trick; zero cost outside dev mode. (Measured: the contact
    // sweep is ~75-80% of update.jello with a crammed awake pile.)
    var _phT = devMode ? performance.now() : 0;
    var _phInternal = 0, _phContact = 0, _phTail = 0, _phT0 = 0;
    for (step = 0; step < totalSteps; step++) {
      if (devMode) _phT0 = performance.now();
      // Sleeping bodies still participate in contact and can be woken by the
      // held body after their internal step was skipped. Give those static
      // participants a fresh rollback pose too; never reuse an old snapshot.
      if (jelloDirectGrabActive) {
        for (ai = 0; ai < nActive; ai++) {
          b = active[ai];
          if (!b._solve || b.sleeping) jelloResilienceStepBegin(b);
        }
      }
      for (ai = 0; ai < nActive; ai++) { b = active[ai]; if (b._solve && !b.sleeping) jelloBodyInternalSubstep(b, h); }
      if (devMode) { var _phT1 = performance.now(); _phInternal += _phT1 - _phT0; _phT0 = _phT1; }
      if (JELLO_CONTACT && nActive > 1) jelloContactsThisFrame += jelloContactSolve(active, nActive, contactCell);
      if (devMode) { var _phT2 = performance.now(); _phContact += _phT2 - _phT0; _phT0 = _phT2; }
      jelloContainBodies(active, nActive);   // boundary-containment backstop (no ring ever inside another)
      // Direct manipulation has a stricter contract than ordinary collision:
      // the frame may never expose a crossed ring or mirrored cell and rely on
      // the one-second emergency heal to clean it later. Contact is the final
      // mover in the coupled solve, so validate the held body HERE and atomically
      // discard the attempted grip step when contact made the pose illegal.
      for (ai = 0; ai < nActive; ai++) {
        b = active[ai];
        if (b._solve && b._grabbed && b._grabApplied) {
          // Contact can also press a legal ring around terrain after the body's
          // internal terrain pass. That is the same failed-input case.
          jelloRejectTerrainInside(b);
          jelloResilienceStepEnd(b);
          jelloRejectGrabAfterContact(b, active, nActive);
        }
      }
      // World re-collide AFTER contact + containment: those passes move points without
      // seeing tiles, so a pressed pile could park points inside a wall until the NEXT
      // substep (far-side pop-outs / welds). One cheap pass closes the gap.
      if (nActive > 1) {
        for (ai = 0; ai < nActive; ai++) {
          b = active[ai]; if (!b._solve) continue;
          // A direct-grab rejection already restored this participant to its
          // legal start-of-substep snapshot. Re-colliding that restored pose
          // was able to fold it again, while the final validator correctly
          // skipped an event already marked rejected. Restoration is atomic:
          // no later positional mover may reopen the discarded substep.
          if (jelloDirectGrabActive && b._guardRejectedStep) continue;
          for (var wi2 = 0; wi2 < b.n; wi2++) if (jelloWorldSolidAt(b.px[wi2], b.py[wi2])) jelloCollidePointWorld(b, wi2, h);
        }
      }
      // The post-contact world re-collide above is the LAST positional mover
      // in this substep. It can flatten a just-accepted traction pose against a
      // platform, so accepting before it left the next snapshot born folded
      // and restarted the zero-trust loop. Validate once more here, then and
      // only then capture release motion and advance controller recovery.
      for (ai = 0; ai < nActive; ai++) {
        b = active[ai];
        if (!b._solve || !b._grabbed || !b._grabApplied || b._guardRejectedStep) continue;
        jelloRejectGrabAfterContact(b, active, nActive);
        if (!b._guardRejectedStep && typeof jelloGrabAcceptStep === 'function') {
          jelloGrabAcceptStep(b);
        }
      }
      for (ai = 0; ai < nActive; ai++) {
        b = active[ai];
        if (!b._solve) continue;
        jelloClampVelocity(b, h);
        if (typeof jelloDrivePostSubstep === 'function') jelloDrivePostSubstep(b, h);
      }
      if (devMode) _phTail += performance.now() - _phT0;
    }
    if (devMode && totalSteps > 0) {
      var _phNow = performance.now();
      perfMark('jello.internal', _phNow - _phInternal);
      perfMark('jello.contact', _phNow - _phContact);
      perfMark('jello.tail', _phNow - _phTail);
      perfMark('jello.substepsAll', _phT);
    }

    // ----- Finalize: finite sweep, rest recompute (plasticity), bbox/centroid/velocity/sleep,
    // then the player hard-containment + resting bowl (run on the settled positions, as before). -----
    var deadJ = null;
    for (ai = 0; ai < nActive; ai++) {
      b = active[ai];
      // Finite sweep FIRST, so bbox/centroid/velocity below are recomputed from healed
      // points — the ground probe and the render only ever see finite state.
      if (!jelloSanitizeBody(b)) { if (!deadJ) deadJ = []; deadJ.push(b); continue; }
      if (b._restDirty) { jelloComputeRest(b); b._restDirty = false; }
      // Unfold any inverted lattice cells BEFORE the sleep evaluation, so a
      // mangled body can neither persist nor doze off mid-fold (v24.154).
      if (b._solve && !b.sleeping) jelloInversionHeal(b);
      if (!b._grabbed && b._recoverT > 0) {
        b._recoverT -= dt;
        if (b._recoverT < 0) b._recoverT = 0;
      }
      // Crowd calm (see the JELLO_CROWD_CALM banner): sustained heavy contact means
      // the pile is squeezed with nowhere to go; drain the churn so it parks still
      // instead of vibrating at the VMAX clamp. Velocity-domain only (ox toward px).
      // Wedge events (few points, hard evidence) weigh 3x body-body corrections.
      var _cp = ((b._cHits || 0) + (b._wedgeHits || 0) * 3) / (b.n * totalSteps);
      // Proportional accrual over [ON, ON+0.18]: face-level pressure barely accrues,
      // full crowd pressure trips in under a second (see the JELLO_CROWD_ON banner).
      var _cr = (_cp - JELLO_CROWD_ON) / 0.18;
      if (_cr > 0) b._pressT = (b._pressT || 0) + dt * (_cr > 1 ? 1 : _cr);
      else b._pressT = (b._pressT || 0) * 0.93;   // ~10-frame half-life: a shuffling pile's contact
                                                  // FLICKERS below the band a frame at a time, and a
                                                  // 0.8 decay dropped pressT under the drain gate in
                                                  // 2 such frames (cram simmered at ~50 px/s), while
                                                  // 0.98 held the drain on ~forever and froze bodies
                                                  // long after the pressure ended (both harness-caught)
      // The drain NEVER runs on a body the player touched in the last half second
      // (couple/fling/push/displace stamp _plyMs): draining a driven body ate the
      // push and read as slow motion (v25.21, owner report). pressT still accrues,
      // so the calm re-engages the moment the player lets go.
      // NET-MOTION gate (v25.23): pressure during real TRAVEL is normal physics —
      // a slime knocked through or along others by ANOTHER SLIME's momentum has no
      // player stamp, so the drain hit it ~1s into its slide and read as a sudden
      // switch to slow motion (owner report). Churn is speed WITHOUT net
      // displacement (the same insight as the sleep gate), so the drain requires
      // the body to be going NOWHERE: centroid drift under 12px per 24-frame window
      // (~60 px/s; a knocked slime rides above it for its whole visible slide, a
      // cram's rearrangement shuffle stays under it — 6px exempted the shuffle too
      // and crams went back to simmering, harness-caught).
      b._nmF = (b._nmF | 0) + 1;
      if (b._nmF >= 24) {
        var _nmdx = b.cx - (b._nmX !== undefined ? b._nmX : b.cx);
        var _nmdy = b.cy - (b._nmY !== undefined ? b._nmY : b.cy);
        b._nmD = Math.sqrt(_nmdx * _nmdx + _nmdy * _nmdy);
        b._nmX = b.cx; b._nmY = b.cy; b._nmF = 0;
      }
      // SPEED FLOOR (v25.24): churn is FAST motion going nowhere — every measured
      // pathology (cram simmer, wedge grind, merge cycle) ran 50-600 px/s of body
      // speed, while an ordinary post-push settle (a pushed cube un-tipping after
      // release) crawls at 10-30 px/s with pressT still primed from the squeeze.
      // The drain ate that settle and it played out in syrup (owner video). Below
      // 45 px/s a body is settling, not churning; friction, XSPH and sleep own it.
      // ...but the floor only protects PLAYER-ADJACENT bodies (stamped within 5s):
      // it exists for the post-push settle, which is always near a fresh stamp. A
      // pure cram (no player anywhere) must drain at ANY speed like before — with
      // a blanket floor its sub-45 slow-pressure crawl went undrained and the
      // sealed-pocket escape returned (harness-caught same hour).
      var _cvr = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * JELLO_TIMESCALE;
      var _plyFresh = b._plyMs !== undefined && performance.now() - b._plyMs < 5000;
      if (b._pressT > 0.75 && JELLO_CROWD_CALM > 0 &&
          (_cvr > 45 || !_plyFresh) &&
          b._nmD !== undefined && b._nmD < 12 &&
          !(b._plyMs !== undefined && performance.now() - b._plyMs < 500)) {
        var _cf = JELLO_CROWD_CALM, _cn2 = b.n, _cpx = b.px, _cpy = b.py, _cox = b.ox, _coy = b.oy;
        for (var _ci = 0; _ci < _cn2; _ci++) {
          _cox[_ci] += (_cpx[_ci] - _cox[_ci]) * _cf;
          _coy[_ci] += (_cpy[_ci] - _coy[_ci]) * _cf;
        }
      }
      jelloUpdateBody(b, stepDt);
      // IN-WALL RESCUE (v25.23, see the function banner): a body whose centroid has
      // sat inside solid for a sustained second relocates to the nearest open tile,
      // or despawns when nothing is in reach. Nothing persists inside a wall.
      if (jelloWorldSolidAt(b.cx, b.cy)) {
        b._inWallT = (b._inWallT || 0) + dt;
        if (b._inWallT > 1) {
          b._inWallT = 0;
          // MOSTLY-EMBEDDED gate (v25.23 hotfix, harness-caught): a cram can press a
          // body's centroid just past a wall face while most of its points stay in
          // the chamber — rescuing THAT body teleported it to the nearest open tile,
          // which from inside the wall is often the CAVITY side. The rescue became
          // the leak (R12: 350px past the wall). Only a body with most of its
          // POINTS inside solid is a genuine wall ghost; a pressed body's points
          // are held out by the entry-side lock and it needs no rescue.
          var _iwN = 0, _iwn = b.n;
          for (var _iw = 0; _iw < _iwn; _iw++) if (jelloWorldSolidAt(b.px[_iw], b.py[_iw])) _iwN++;
          if (_iwN > _iwn * 0.6 && !jelloRescueFromWall(b)) {
            if (!deadJ) deadJ = [];
            deadJ.push(b);
            continue;
          }
        }
      } else b._inWallT = 0;
      jelloPerchHold(b);   // hold a resting body undermined by digging (v24.168) — geometry-independent anti-drain
      // Physics-anchored shading: refresh the per-point strain field once per frame for
      // awake bodies (a sleeper keeps its last field, e.g. a pile-crushed cube correctly
      // stays tinted compressed).
      if (JELLO_SHADE && JELLO_SHADE_STRAIN > 0 && JELLO_SHADE_STRAIN_K > 0 && b._solve && !b.sleeping) jelloStrainField(b);
    }
    // Despawn the unrecoverable bodies the sweep flagged (rare to never; see the
    // jelloSanitizeBody banner). The splat centre comes from the frame-START snapshot
    // (the last pose known finite) so the pop shows where the slime actually was.
    if (deadJ) {
      for (var dj = 0; dj < deadJ.length; dj++) {
        b = deadJ[dj];
        var di = jelloBodies.indexOf(b);
        if (di >= 0) jelloBodies.splice(di, 1);
        var dsx = cam.x + screenW * 0.5, dsy = cam.y + screenH * 0.5;
        if (b.fpx) {
          for (var dfi = 0; dfi < b.n; dfi++) {
            if (isFinite(b.fpx[dfi]) && isFinite(b.fpy[dfi])) { dsx = b.fpx[dfi]; dsy = b.fpy[dfi]; break; }
          }
        }
        spawnJelloSplat(dsx, dsy, 10, 90, 1.0, null);
        try { console.warn('jello: despawned an unrecoverable body (non-finite state)'); } catch (e) {}
      }
    }
    jelloCount = jelloTotalPoints();
    // Trampoline bank hygiene: a slam's stored rebound (080's player.jelloImpactVy)
    // must not survive stepping off onto FLUSH solid ground (the airborne clear in
    // 080 never runs on a flush walk-off), or a later gentle step-on fires a stale
    // launch. Solid grounding = on the ground, not on gel -> the bank is void.
    if (player && player.onGround && !player.onJello && player.jelloImpactVy) player.jelloImpactVy = 0;
    // JET BACK-PRESSURE (v24.144): the Newton pair of the thrust-aligned cone. The
    // couple accumulated tiles-worth of covered gel per substep; average over the
    // frame's substeps and shove the RIG opposite the exhaust — hovering over a
    // slime rides a cushion, a sideways blast recoils the rig. Player velocity is
    // real px/s, so this integrates with the real frame dt; the CAP (in gravities)
    // means a dense pile cushions hard but can never launch the rig.
    if (jelloJetOn && JELLO_JET_REACT > 0 && jelloJetReactT > 0 && player && !gameOver && !gameWon) {
      var _jrCover = jelloJetReactT / totalSteps;          // mean tiles-worth of gel in the cone
      var _jrAcc = JELLO_JET_REACT * _jrCover * GRAVITY;   // ~1 tile of gel ≈ 1 g of back-pressure
      var _jrCap = JELLO_JET_REACT_CAP * GRAVITY;
      if (_jrAcc > _jrCap) _jrAcc = _jrCap;
      player.vx -= jelloJetDX * _jrAcc * dt;
      player.vy -= jelloJetDY * _jrAcc * dt;
    }
    jelloUnmergeBodies(dt, active, nActive);   // no slime can stay inside another (rigid rate-limited split)
    jelloResolvePlayer(dt);   // hard containment: rig can never be inside a jello ring
    jelloRigDisplaceGel();    // hard displacement: gel can never be deeper than the dent cap inside the hull
    jelloDeformBowl();        // resting on top: carve the conforming membrane bowl
    // END-OF-FRAME LEGALIZATION (v25.26): every mover above runs AFTER the substep
    // loop's last collide, so under heavy pile pressure they could leave points
    // inside solid at frame end — and the NEXT frame's fpx snapshot (the anchor
    // every anti-slip guard trusts) was then itself inside the wall, re-opening
    // the far-side exit one dirty frame at a time (owner: an 8-slime stack
    // pressured down still leaked). One final resolve makes "a point ends the
    // frame in solid" impossible; the snapshot is legal by construction.
    for (ai = 0; ai < nActive; ai++) {
      b = active[ai];
      for (var lz = 0; lz < b.n; lz++) {
        if (jelloWorldSolidAt(b.px[lz], b.py[lz])) {
          // VELOCITY-FREE unclip: reuse the collide's side choice (entry-lock +
          // body-ward cascade) but discard its bounce/friction velocity writes —
          // a full response fired once per FRAME outside the substep cadence
          // fought the in-substep machinery and set a wedged body's outline
          // flip-flopping 14px (harness-caught). Translation only; the next
          // frame's substeps own the dynamics.
          var _lx0 = b.px[lz], _ly0 = b.py[lz], _lox = b.ox[lz], _loy = b.oy[lz];
          jelloCollidePointWorld(b, lz, jelloStepH);
          b.ox[lz] = _lox + (b.px[lz] - _lx0);
          b.oy[lz] = _loy + (b.py[lz] - _ly0);
        }
      }
    }
    // Jet blast point: a throttled splat (and a surface ripple, when that system is
    // live) where the exhaust ray lands ON a blob - the same ray the flame core +
    // ground wash already use, so all three agree on the impact point.
    if (jelloJetOn && typeof rocketFindImpactAlong === 'function') {
      jelloJetSplT -= dt;
      if (jelloJetSplT <= 0) {
        var jd2 = rocketFindImpactAlong(jelloJetOX, jelloJetOY, jelloJetDX, jelloJetDY, JELLO_JET_LEN);
        if (jd2 !== null) {
          var jix = jelloJetOX + jelloJetDX * jd2, jiy = jelloJetOY + jelloJetDY * jd2;
          if (typeof rocketInJello === 'function' && rocketInJello(jix, jiy)) {
            spawnJelloSplat(jix, jiy, 2, 80, 0.6, null);
            jelloJetSplT = 0.09;
          } else jelloJetSplT = 0.05;
        } else jelloJetSplT = 0.05;
      }
    }
  }

  // ===== Render — clean gel cube with a crisp outline ==============
  // Bake the DRAWN ring into the jelloROX/ROY scratch ONCE per body per frame
  // (jelloRingPath is called 3x per body: clip + 2 rim strokes — the offsets must
  // not be recomputed per call; all three calls happen inside ONE jelloDrawBody,
  // which is the scratch-survival invariant). Base = the existing centroid outset,
  // byte-identical to the pre-ripple render; then the impact-ripple displacement
  // rides on top, along the LOCAL outward normal (centered-difference tangent,
  // b.ringSign winding — the same outward direction jelloVolumeXPBD's area
  // gradient uses).
  function jelloRingBake(b) {
    var ring = b.ring, rn = b.ringN, px = b.px, py = b.py;
    if (rn < 3) return;
    jelloContactAlloc();   // ROX/ROY scratch (render can precede the first sim tick)
    var ROX = jelloROX, ROY = jelloROY;
    var outset = JELLO_RENDER_OUTSET * JELLO_CONTACT_R_FRAC * (b.spacing || (TILE / JELLO_NPT));
    var k, pi;
    if (outset > 0.01) {
      var ocx = b.cx, ocy = b.cy;
      if (!isFinite(ocx)) { ocx = (b.bboxL + b.bboxR) * 0.5; ocy = (b.bboxT + b.bboxB) * 0.5; }
      for (k = 0; k < rn; k++) {
        pi = ring[k];
        var ddx = px[pi] - ocx, ddy = py[pi] - ocy, dl = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dl > 1e-6) { var sc = outset / dl; ROX[k] = px[pi] + ddx * sc; ROY[k] = py[pi] + ddy * sc; }
        else { ROX[k] = px[pi]; ROY[k] = py[pi]; }
      }
    } else {
      for (k = 0; k < rn; k++) { pi = ring[k]; ROX[k] = px[pi]; ROY[k] = py[pi]; }
    }
    // Impact ripple: skin displacement along the outward normal at each ring vertex.
    if (b.rippleOn && JELLO_RIPPLE > 0.001 && b.rippleU) {
      var u = b.rippleU, sign = b.ringSign, km = rn - 1, kp;
      var rcx = isFinite(b.cx) ? b.cx : (b.bboxL + b.bboxR) * 0.5;
      var rcy = isFinite(b.cy) ? b.cy : (b.bboxT + b.bboxB) * 0.5;
      for (k = 0; k < rn; k++) {
        kp = k + 1; if (kp === rn) kp = 0;
        var amp = u[k] * JELLO_RIPPLE;
        if (amp > 0.01 || amp < -0.01) {
          var ip = ring[kp], im = ring[km], cp = ring[k];
          var tx = px[ip] - px[im], ty = py[ip] - py[im];
          var tl = Math.sqrt(tx * tx + ty * ty);
          var nx2, ny2;
          if (tl > 1e-6) { nx2 = sign * ty / tl; ny2 = -sign * tx / tl; }
          else {           // degenerate tangent: fall back to the centroid direction
            nx2 = px[cp] - rcx; ny2 = py[cp] - rcy;
            var cl = Math.sqrt(nx2 * nx2 + ny2 * ny2);
            if (cl > 1e-6) { nx2 /= cl; ny2 /= cl; } else { nx2 = 0; ny2 = -1; }
          }
          ROX[k] += amp * nx2; ROY[k] += amp * ny2;
        }
        km = k;
      }
    }
    // CHAMFER pass (v25.27, edge styles >= 1): one Chaikin corner-cut on the
    // drawn ring — each vertex becomes two points at 1/4 and 3/4 of its edges,
    // so a kink's amplitude halves and a rest-cube corner loses ~3px to a 45°
    // chamfer (deliberately NOT the vetoed v24.121 balloon rounding; corners
    // still read as corners). Render-only: the physics ring is untouched.
    if (JELLO_EDGE_STYLE >= 1 && rn * 2 <= JELLO_MAX_POINTS) {
      var SX = jelloRSX, SY = jelloRSY, j2 = 0, kn;
      for (k = 0; k < rn; k++) {
        kn = k + 1; if (kn === rn) kn = 0;
        SX[j2] = ROX[k] * 0.75 + ROX[kn] * 0.25; SY[j2] = ROY[k] * 0.75 + ROY[kn] * 0.25; j2++;
        SX[j2] = ROX[k] * 0.25 + ROX[kn] * 0.75; SY[j2] = ROY[k] * 0.25 + ROY[kn] * 0.75; j2++;
      }
      jelloRSX = ROX; jelloRSY = ROY; jelloROX = SX; jelloROY = SY;   // swap: ROX holds the chamfered ring
      jelloRingBakeN = j2;
    } else jelloRingBakeN = rn;
  }

  function jelloRingPath(b) {
    var rn = jelloRingBakeN || b.ringN;   // bake runs first (scratch-survival invariant); chamfer changes the count
    if (rn < 3) return false;
    // Reads the ring jelloRingBake wrote (call order: jelloDrawBody bakes once,
    // then paths 3x: clip + two rim strokes).
    var ROX = jelloROX, ROY = jelloROY;
    var k;
    var smooth = JELLO_RENDER_SMOOTH;
    if (smooth <= 0.001) {
      ctx.moveTo(ROX[0], ROY[0]);
      for (var i = 1; i < rn; i++) ctx.lineTo(ROX[i], ROY[i]);
      ctx.closePath();
    } else {
      // Quadratic midpoint smoothing through the offset ring vertices.
      var startX = (ROX[rn - 1] + ROX[0]) * 0.5, startY = (ROY[rn - 1] + ROY[0]) * 0.5;
      ctx.moveTo(startX, startY);
      for (k = 0; k < rn; k++) {
        var nk = (k + 1) % rn;
        var mx = (ROX[k] + ROX[nk]) * 0.5, my = (ROY[k] + ROY[nk]) * 0.5;
        ctx.quadraticCurveTo(ROX[k], ROY[k], mx, my);
      }
      ctx.closePath();
    }
    return true;
  }

  // Clamp a percentage (saturation / lightness) to [0,100] for per-body hsla tints.
  function jelloClampPct(v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }

  // ---- Peach-fuzz coat (v25.27, edge styles >= 2) ----
  // Short hairs along the chamfered ring's outward normals. DETERMINISTIC: each
  // hair is seeded by its ring slot + a per-body constant, so the coat is stable
  // frame to frame (a per-frame re-roll would shimmer at 60fps) while the roots
  // still ride the skin as it wobbles. Two passes: a dense short base coat and
  // sparse longer wisps. Plain strokes only — no gradients, so a non-finite
  // point can never throw (canvas path ops IGNORE non-finite; gradients THROW).
  function jelloFuzzHash(i) {
    var h = (i * 2654435761 + 106039) >>> 0;
    h ^= h >>> 13; h = (h * 2246822519) >>> 0;
    return (h >>> 8) / 16777216;
  }
  function jelloDrawFuzz(b, hue, satMul, lightAdd, alpha, fz) {
    var rn = jelloRingBakeN;
    if (rn < 6) return;
    var ROX = jelloROX, ROY = jelloROY;
    var sign = b.ringSign || 1;
    var seed = (Math.floor(b.hue) * 131 + b.n * 977) | 0;
    var col = 'hsla(' + hue + ',' + jelloClampPct(70 * satMul) + '%,' + jelloClampPct(66 + lightAdd) + '%,';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      var stride = pass === 0 ? 2 : 7;
      var lenMul = pass === 0 ? 1 : 1.9;
      ctx.strokeStyle = col + (alpha * (pass === 0 ? 0.14 : 0.20)).toFixed(3) + ')';
      ctx.beginPath();
      for (var k = pass; k < rn; k += stride) {
        var kp = k + 2 >= rn ? k + 2 - rn : k + 2;
        var km = k - 2 < 0 ? k - 2 + rn : k - 2;
        var tx = ROX[kp] - ROX[km], ty = ROY[kp] - ROY[km];
        var tl = Math.sqrt(tx * tx + ty * ty);
        if (tl < 1e-6) continue;
        var nx = sign * ty / tl, ny = -sign * tx / tl;
        var h1 = jelloFuzzHash(seed + k * 3);
        var h2 = jelloFuzzHash(seed + k * 3 + 1);
        var ln = (1.6 + 2.8 * h1) * fz * lenMul;
        var la = (h2 - 0.5) * 0.9;   // lean up to ±0.45 rad off the normal
        var ca = Math.cos(la), sa = Math.sin(la);
        var hx = nx * ca - ny * sa, hy = nx * sa + ny * ca;
        ctx.moveTo(ROX[k], ROY[k]);
        ctx.lineTo(ROX[k] + hx * ln, ROY[k] + hy * ln);
      }
      ctx.stroke();
    }
  }

  // A continuous depth wash gives the gel material variation without exposing
  // the solver mesh. Physics points and springs are implementation details.
  // Public shading is derived only from the body's silhouette, bulk motion,
  // and smooth best-fit deformation.
  function jelloDrawMaterialVolume(b, hue, satMul, lightAdd, alpha) {
    var l = b.bboxL, r = b.bboxR, t = b.bboxT, bm = b.bboxB;
    var w = r - l, h = bm - t;
    if (!(w > 1 && h > 1)) return;
    var cx = isFinite(b.cx) ? b.cx : (l + r) * 0.5;
    var cy = isFinite(b.cy) ? b.cy : (t + bm) * 0.5;
    var vx = isFinite(b.vx) ? b.vx : 0;
    var vy = isFinite(b.vy) ? b.vy : 0;
    var driftX = Math.max(-w * 0.12, Math.min(w * 0.12, -vx * 0.012));
    var driftY = Math.max(-h * 0.10, Math.min(h * 0.10, -vy * 0.008));
    var radius = Math.max(w, h) * 0.72;
    var depth = ctx.createRadialGradient(
      cx + driftX - w * 0.12, cy + driftY - h * 0.16, 0,
      cx + driftX, cy + driftY, radius
    );
    depth.addColorStop(0, 'hsla(' + (hue + 12) + ',' + jelloClampPct(88 * satMul) + '%,' +
      jelloClampPct(82 + lightAdd) + '%,' + (alpha * 0.16).toFixed(3) + ')');
    depth.addColorStop(0.48, 'hsla(' + hue + ',' + jelloClampPct(82 * satMul) + '%,' +
      jelloClampPct(58 + lightAdd) + '%,' + (alpha * 0.035).toFixed(3) + ')');
    depth.addColorStop(1, 'hsla(' + (hue - 8) + ',' + jelloClampPct(74 * satMul) + '%,' +
      jelloClampPct(30 + lightAdd) + '%,' + (alpha * 0.18).toFixed(3) + ')');
    ctx.fillStyle = depth;
    ctx.fillRect(l, t, w, h);
  }

  function jelloDrawBody(b) {
    if (b.ringN < 3) return;
    // A non-finite bbox must never reach the canvas: createLinearGradient/createRadialGradient
    // THROW on NaN/Inf arguments, which would kill the whole render loop (black screen), and a
    // NaN bbox also defeats the draw cull (every < compare is false, so the body is "visible").
    // The per-frame finite sweep heals active bodies before render; this is the belt-and-braces
    // for anything it can't see (a body corrupted in its very last frame before freezing).
    if (!isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) return;
    // The bbox alone is NOT enough for a PARTIALLY corrupt body: NaN points fail every
    // < compare in the bbox scan, so the bbox comes out finite from the surviving points
    // while a NaN SHADE ANCHOR (sheen/glint/caustic ride specific lattice points) feeds
    // the caustics gradient — createLinearGradient throws and the loop dies (harness-
    // caught). Verify the four anchors before any gradient math.
    if (b.shineI !== undefined &&
        !isFinite(b.px[b.shineI] + b.py[b.shineI] + b.px[b.glintI] + b.py[b.glintI] +
                  b.px[b.causI0] + b.py[b.causI0] + b.px[b.causI1] + b.py[b.causI1])) return;
    jelloRingBake(b);   // bake the drawn ring (outset + ripple) once; the 3 path calls read it
    var l = b.bboxL, r = b.bboxR, t = b.bboxT, bm = b.bboxB;
    var w = r - l, hgt = bm - t;
    if (w < 1 || hgt < 1) return;
    // Appearance levers — per-body overrides (set on dev test-pen blobs) that
    // DEFAULT to the global tunables, so normal jello renders exactly as before.
    // Each blob can read as a distinct MATERIAL (sheen, glassiness, rim glow,
    // shimmer, translucency, saturation, brightness) at identical size + physics.
    var hue = b.hue;
    var alpha    = (b.alpha   != null) ? b.alpha   : JELLO_RENDER_ALPHA;
    var refract  = (b.refract != null) ? b.refract : JELLO_REFRACT;
    var shimmer  = (b.shimmer != null) ? b.shimmer : JELLO_SHIMMER;
    // DISSOLVE melt telegraph (v25.53, render-only): the doomed body's
    // colour eases toward water-teal and it goes a touch glassier while it
    // keeps jiggling, so the burst reads as intended, not as a glitch.
    if (b._melting) {
      var _mk = b._meltT / JELLO_DISSOLVE_MELT;
      if (_mk > 1) _mk = 1;
      hue = hue + (200 - hue) * _mk;
      alpha *= 1 - _mk * 0.25;
      shimmer += _mk * 0.25;
    }
    var gloss    = (b.gloss   != null) ? b.gloss   : JELLO_GLOSS;
    var rim      = (b.rim     != null) ? b.rim     : JELLO_RIM;
    var satMul   = (b.sat     != null) ? b.sat     : 1;
    var lightAdd = (b.light   != null) ? b.light   : 0;
    var cx = (l + r) * 0.5, cy = (t + bm) * 0.5;
    var maxR = Math.max(w, hgt) * 0.5; if (maxR < 1) maxR = 1;
    var tt = performance.now() * 0.001;
    // ----- Physics-anchored shading state (v24.96) -----
    // shadeOn gates every anchored feature; anchors missing (defensive) falls back to
    // legacy. scx/scy = current CENTROID (mass-tracked), bbox centre as the guard.
    var shadeOn = JELLO_SHADE > 0 && b.shineI !== undefined;
    var scx = cx, scy = cy;
    if (shadeOn && isFinite(b.cx)) { scx = b.cx; scy = b.cy; }
    if (shadeOn) jelloShadeMatrix(b);   // ensures shRc/shRs + shM00..11 are fresh
    // The clip ring is drawn OUTSET by the particle radius (jelloRingPath), so the body FILLS
    // must cover that same outset region or a ring of background shows between the fill and the
    // outline (the "slime within an outline with air between" look). Expand the fill rect by the
    // outset on every side; the clip masks it back to the ring, so the gel reads as ONE solid body.
    var rOut = JELLO_RENDER_OUTSET * JELLO_CONTACT_R_FRAC * (b.spacing || (TILE / JELLO_NPT))
             + (b.rippleOn ? jelloRippleCap(b.spacing) * JELLO_RIPPLE : 0);   // cover ripple crests too
    var el = l - rOut, et = t - rOut, ew = w + 2 * rOut, eh = hgt + 2 * rOut;

    ctx.save();
    ctx.beginPath();
    jelloRingPath(b);
    ctx.clip();

    // ---- 1. REFRACTION: magnify the world drawn behind the jelly so it acts
    //         like a glass lens. drawImage reads the canvas (which already holds
    //         the terrain/sky/smoke behind this body — the player is drawn AFTER
    //         jello) and redraws it scaled up about the body centre. ----
    if (refract > 0.001) {
      var ws = (typeof dpr !== 'undefined' ? dpr : 1) * (typeof worldScale !== 'undefined' ? worldScale : 1);
      var camOffX = Math.round(cam.x * ws), camOffY = Math.round(cam.y * ws);
      var sx = l * ws - camOffX, sy = t * ws - camOffY;
      var sw = w * ws, sh = hgt * ws;
      if (sw > 1 && sh > 1) {
        var mag = 1 + refract;
        var dw = w * mag, dh = hgt * mag;
        try { ctx.drawImage(ctx.canvas, sx, sy, sw, sh, cx - dw * 0.5, cy - dh * 0.5, dw, dh); } catch (e) {}
      }
    }

    // ---- 2. Translucent coloured body — you see THROUGH it (glass). Thinner /
    //         clearer at the top, denser + more saturated toward the bottom.
    //         ONE uniform material edge-to-edge (v24.151, owner: "get rid of the
    //         outline — the middle's texture should extend to the edge"): the
    //         gradient spans the EXPANDED fill rect (et..et+eh), never the lattice
    //         bbox — spanning t..bm clamped the lightest stop across the outset
    //         band above the topmost points, which read as a bright rim "outline"
    //         tracing the whole boundary. The old layer-3 radial subsurface glow
    //         (a centre-bright vignette) is deleted for the same reason: it made
    //         the middle a visibly different material from the edge band. Its
    //         brightness is folded into these stops instead. ----
    var g = ctx.createLinearGradient(cx, et, cx, et + eh);
    g.addColorStop(0,   'hsla(' + hue + ',' + jelloClampPct(80 * satMul) + '%,' + jelloClampPct(76 + lightAdd) + '%,' + (alpha * 0.40).toFixed(3) + ')');
    g.addColorStop(0.5, 'hsla(' + hue + ',' + jelloClampPct(84 * satMul) + '%,' + jelloClampPct(58 + lightAdd) + '%,' + (alpha * 0.54).toFixed(3) + ')');
    g.addColorStop(1,   'hsla(' + (hue - 6) + ',' + jelloClampPct(80 * satMul) + '%,' + jelloClampPct(36 + lightAdd) + '%,' + (alpha * 0.68).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(el, et, ew, eh);

    jelloDrawMaterialVolume(b, hue, satMul, lightAdd, alpha);

    // ---- 4. Moving internal caustics (living shimmer). ----
    if (shimmer > 0.001) {
      for (var sb = 0; sb < 2; sb++) {
        var sOffX, sOffY = 0;
        if (shadeOn) {
          // Streak slide = the anchor's ACTUAL deformation offset vs the rigidly-rotated
          // rest pose: dev = (p - c) - R q. Zero at rest in any orientation, so a still
          // body has still light; a hit sloshes the streaks with the interior motion.
          var ca = sb === 0 ? b.causI0 : b.causI1;
          var rc2 = b.shRc !== undefined ? b.shRc : 1, rs2 = b.shRs !== undefined ? b.shRs : 0;
          var devX = (b.px[ca] - scx) - (rc2 * b.qx[ca] - rs2 * b.qy[ca]);
          var devY = (b.py[ca] - scy) - (rs2 * b.qx[ca] + rc2 * b.qy[ca]);
          sOffX = devX * JELLO_SHADE_CAUSTIC; sOffY = devY * JELLO_SHADE_CAUSTIC * 0.6;
          var sLim = maxR * 0.7;
          if (sOffX > sLim) sOffX = sLim; else if (sOffX < -sLim) sOffX = -sLim;
          sLim = maxR * 0.4;
          if (sOffY > sLim) sOffY = sLim; else if (sOffY < -sLim) sOffY = -sLim;
          if (!isFinite(sOffX + sOffY)) { sOffX = 0; sOffY = 0; }   // never poison the persistent follower
          // EASED follower (v25.28): the raw deviation is per-frame NOISY while a
          // body moves or settles, and drawing it directly made the streaks JUMP
          // — the owner's "whole thing flashes / flickers as it moves and as it
          // settles". Each streak drifts toward its target at 10%/frame: still at
          // rest (the follower converges and deviation is zero), a calm glide in
          // motion, no pop at wake/sleep (lazily seeded AT the target).
          if (sb === 0) {
            if (b._cau0X === undefined) { b._cau0X = sOffX; b._cau0Y = sOffY; }
            b._cau0X += (sOffX - b._cau0X) * 0.10; b._cau0Y += (sOffY - b._cau0Y) * 0.10;
            sOffX = b._cau0X; sOffY = b._cau0Y;
          } else {
            if (b._cau1X === undefined) { b._cau1X = sOffX; b._cau1Y = sOffY; }
            b._cau1X += (sOffX - b._cau1X) * 0.10; b._cau1Y += (sOffY - b._cau1Y) * 0.10;
            sOffX = b._cau1X; sOffY = b._cau1Y;
          }
        } else {
          var sph = sb === 0 ? tt * 0.5 : tt * 0.31 + 1.7;   // legacy timer slide
          sOffX = Math.sin(sph) * maxR * 0.5;
        }
        var sg = ctx.createLinearGradient(cx - maxR + sOffX, cy - maxR * 0.5 + sOffY, cx + maxR * 0.4 + sOffX, cy + maxR + sOffY);
        sg.addColorStop(0.0, 'hsla(' + (hue + 18) + ', 100%, 95%, 0)');
        sg.addColorStop(0.45,'hsla(' + (hue + 18) + ', 100%, 95%, ' + (shimmer * 0.30).toFixed(3) + ')');
        sg.addColorStop(0.6, 'hsla(' + (hue + 18) + ', 100%, 95%, ' + (shimmer * 0.16).toFixed(3) + ')');
        sg.addColorStop(1.0, 'hsla(' + (hue + 18) + ', 100%, 95%, 0)');
        ctx.fillStyle = sg;
        ctx.fillRect(el, et, ew, eh);
      }
    }

    // ---- 4b. STRAIN HOTSPOTS (physics-anchored): the k most-strained boundary spots.
    //          Compression brightens + saturates the gel locally (light piling up in
    //          squeezed material); stretch darkens + desaturates (thinned gel). Alpha
    //          ramps from zero at the threshold so spots fade in/out, never pop. ----
    if (shadeOn && JELLO_SHADE_STRAIN > 0.001 && JELLO_SHADE_STRAIN_K > 0 && b.strTopN > 0) {
      var hsp = b.spacing || (TILE / JELLO_NPT);   // lattice spacing: hotspot radius scale
      for (var hk = 0; hk < b.strTopN; hk++) {
        var hpI = b.strTopI[hk], he = b.strTopE[hk];
        var hae = he < 0 ? -he : he;
        var ha = (hae - JELLO_SHADE_STRAIN_MIN) * 4.5 * JELLO_SHADE_STRAIN;
        if (ha <= 0.004) continue;
        if (ha > 0.55) ha = 0.55;
        var hx = b.px[hpI], hy = b.py[hpI];
        var hr = hsp * (1.9 + 1.6 * (hae * 3 < 1 ? hae * 3 : 1));
        var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        if (he < 0) {   // compressed: bright, saturated
          hg.addColorStop(0, 'hsla(' + (hue + 8) + ', 100%, 86%, ' + ha.toFixed(3) + ')');
          hg.addColorStop(1, 'hsla(' + (hue + 8) + ', 100%, 86%, 0)');
        } else {        // stretched: dark, desaturated
          hg.addColorStop(0, 'hsla(' + (hue - 12) + ', 26%, 16%, ' + (ha * 0.85).toFixed(3) + ')');
          hg.addColorStop(1, 'hsla(' + (hue - 12) + ', 26%, 16%, 0)');
        }
        ctx.fillStyle = hg;
        ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
      }
    }

    // ---- 5. Specular: big soft sheen (upper-left) + a small sharp glint. ----
    if (gloss > 0.001) {
      var gx2, gy2;
      if (shadeOn) {
        // Sheen rides its build-time anchor point and is rotated + squashed by the
        // best-fit deformation (M), so squash-stretch shows in the highlight. The
        // radius is REST-based (rMaxR) so it doesn't pump with the bbox.
        var shx = b.px[b.shineI], shy = b.py[b.shineI];
        var shr = (b.rMaxR || maxR) * 0.72;
        ctx.save();
        ctx.translate(shx, shy);
        ctx.transform(b.shM00, b.shM10, b.shM01, b.shM11, 0, 0);
        var glg = ctx.createRadialGradient(0, 0, 0, 0, 0, shr);
        glg.addColorStop(0,   'rgba(255,255,255,' + (gloss * 0.55).toFixed(3) + ')');
        glg.addColorStop(0.4, 'rgba(255,255,255,' + (gloss * 0.14).toFixed(3) + ')');
        glg.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = glg;
        var shspan = shr * 2.2;
        ctx.fillRect(-shspan, -shspan, shspan * 2, shspan * 2);
        ctx.restore();
        // Glint: exponential lag follower trailing its anchor (liquid feel), distance-
        // clamped to 3 lattice spacings so it can never detach from the body.
        var gtx = b.px[b.glintI], gty = b.py[b.glintI];
        b.glintLX += (gtx - b.glintLX) * JELLO_SHADE_LAG;
        b.glintLY += (gty - b.glintLY) * JELLO_SHADE_LAG;
        var gdx = b.glintLX - gtx, gdy = b.glintLY - gty;
        var gcap = (b.spacing || (TILE / JELLO_NPT)) * 3, gd2 = gdx * gdx + gdy * gdy;
        if (gd2 > gcap * gcap) { var gsc = gcap / Math.sqrt(gd2); b.glintLX = gtx + gdx * gsc; b.glintLY = gty + gdy * gsc; }
        gx2 = b.glintLX; gy2 = b.glintLY;
      } else {
        var glx = cx - maxR * 0.30, gly = cy - maxR * 0.42;
        var glg0 = ctx.createRadialGradient(glx, gly, 0, glx, gly, maxR * 0.72);
        glg0.addColorStop(0,   'rgba(255,255,255,' + (gloss * 0.55).toFixed(3) + ')');
        glg0.addColorStop(0.4, 'rgba(255,255,255,' + (gloss * 0.14).toFixed(3) + ')');
        glg0.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = glg0;
        ctx.fillRect(el, et, ew, eh);
        gx2 = cx - maxR * 0.36 + Math.sin(tt * 0.7) * maxR * 0.05;
        gy2 = cy - maxR * 0.5;
      }
      var gr2 = maxR * 0.16; if (gr2 < 2) gr2 = 2;
      var glg2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, gr2);
      glg2.addColorStop(0, 'rgba(255,255,255,' + (gloss * 0.9).toFixed(3) + ')');
      glg2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glg2;
      ctx.fillRect(gx2 - gr2, gy2 - gr2, gr2 * 2, gr2 * 2);
    }
    ctx.restore();

    // ---- 6. EDGE TREATMENT (v25.27). Styles >= 1: a layered SAME-COLOUR
    //         fringe centred on the (chamfered) ring — alpha steps down going
    //         outward, so the gel diffuses into the background over ~7px. Half
    //         of each stroke lies outside the clip and covers the fill's hard
    //         aliased edge; the colour is the body's own mid-tone, never a
    //         bright line (the v24.121 cartoon-outline veto stands). Styles
    //         >= 2 add the peach-fuzz hair coat on top. ----
    if (JELLO_EDGE_STYLE >= 1) {
      var fz = JELLO_EDGE_FUZZ;
      var eCol = 'hsla(' + hue + ',' + jelloClampPct(82 * satMul) + '%,' + jelloClampPct(52 + lightAdd) + '%,';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      jelloRingPath(b);
      ctx.strokeStyle = eCol + (alpha * 0.28).toFixed(3) + ')';
      ctx.lineWidth = 2.2 * fz;
      ctx.stroke();
      ctx.strokeStyle = eCol + (alpha * 0.13).toFixed(3) + ')';
      ctx.lineWidth = 4.6 * fz;
      ctx.stroke();
      ctx.strokeStyle = eCol + (alpha * 0.055).toFixed(3) + ')';
      ctx.lineWidth = 7.6 * fz;
      ctx.stroke();
      if (JELLO_EDGE_STYLE >= 2) jelloDrawFuzz(b, hue, satMul, lightAdd, alpha, fz * (JELLO_EDGE_STYLE >= 3 ? 1.9 : 1));
    } else if (rim > 0.001) {
      // CLASSIC style keeps the legacy Fresnel rim for per-body dev materials
      // (ships 0 since v24.121 — owner-vetoed outline).
      ctx.beginPath();
      jelloRingPath(b);
      ctx.strokeStyle = 'hsla(' + (hue + 14) + ', 100%, 90%, ' + (rim * 0.95).toFixed(3) + ')';
      ctx.lineWidth = 3.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      jelloRingPath(b);
      ctx.strokeStyle = 'hsla(' + (hue - 8) + ', 70%, 30%, ' + (rim * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Debug: lattice points + springs. Gated on devMode so the default-on overlay shows
    // only in dev mode, never in normal play.
    if (JELLO_DEBUG_PARTICLES && devMode) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (var s2 = 0; s2 < b.springN; s2++) {
        ctx.moveTo(b.px[b.sA[s2]], b.py[b.sA[s2]]);
        ctx.lineTo(b.px[b.sB[s2]], b.py[b.sB[s2]]);
      }
      ctx.stroke();
      for (var d = 0; d < b.n; d++) {
        ctx.fillStyle = b.sleeping ? 'rgba(120,120,255,0.8)' : 'rgba(255,240,0,1)';
        ctx.beginPath();
        ctx.arc(b.px[d], b.py[d], 2, 0, 6.283);
        ctx.fill();
      }
    }
  }

  // Dev-mode coupling vectors (see jelloDbg): one arrow per visible cube showing its COM
  // velocity in real px/s, RED if fast enough for the carry to RIDE it (> JELLO_CARRY_MIN),
  // blue if below the deadzone, plus a GREEN arrow for the rig's own vx. Drawn in world space
  // right after the gel so the skate's direction and who is driving it are visible live.
  function drawJelloCoupleVectors() {
    if (jelloBodies.length === 0) return;
    var sc = 0.14;   // arrow length: world px per (px/s)
    ctx.save();
    ctx.lineWidth = 1.4;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.bboxR < cam.x || b.bboxL > cam.x + screenW || b.bboxB < cam.y || b.bboxT > cam.y + screenH) continue;
      var rvx = b.vx * JELLO_TIMESCALE, rvy = b.vy * JELLO_TIMESCALE;   // sim units -> real px/s
      var spd = Math.sqrt(rvx * rvx + rvy * rvy);
      if (spd < 1) continue;
      var col = spd > JELLO_CARRY_MIN ? 'rgba(255,70,70,0.95)' : 'rgba(110,200,255,0.85)';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(b.cx, b.cy); ctx.lineTo(b.cx + rvx * sc, b.cy + rvy * sc); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.cx + rvx * sc, b.cy + rvy * sc, 2.2, 0, 6.283); ctx.fill();
    }
    if (player && Math.abs(player.vx) > 1) {
      var rcx = player.x + PLAYER_W * 0.5, rcy = player.y + PLAYER_H * 0.5;
      ctx.strokeStyle = 'rgba(80,255,120,0.95)';
      ctx.beginPath(); ctx.moveTo(rcx, rcy); ctx.lineTo(rcx + player.vx * sc, rcy); ctx.stroke();
    }
    ctx.restore();
  }

  function drawJelloBlobs() {
    // Splats (drawn first, behind the gel bodies).
    for (var si = 0; si < jelloSplats.length; si++) {
      var s = jelloSplats[si];
      var sa = s.life / s.maxLife;
      ctx.fillStyle = 'hsla(' + s.hue + ', 82%, 72%, ' + (sa * 0.85).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.4 + sa * 0.6), 0, 6.283);
      ctx.fill();
    }
    if (jelloBodies.length === 0) return;
    // Cull off-camera bodies.
    var mx = TILE;   // small margin
    var visL = cam.x - mx, visR = cam.x + screenW + mx;
    var visT = cam.y - mx, visB = cam.y + screenH + mx;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.bboxR < visL || b.bboxL > visR || b.bboxB < visT || b.bboxT > visB) continue;
      jelloDrawBody(b);
    }
  }

  // ----- Save / restore (047 calls these): live bodies persist across reload ---------
  // The grid nulls a cluster's tiles at activation, so before this a live slime simply
  // VANISHED on reload (047's "WHAT IS NOT SAVED" documented it away, but a disappearing
  // slime is still a disappearing slime to the player). A body serializes as its ORIGINAL
  // cluster cells + type + current centroid (~30 bytes); restore rebuilds the same lattice
  // at rest pose translated to that centroid and lets it settle. Pose/velocity/deformation
  // are deliberately NOT saved — a rest-shaped body one settle away from sleeping is
  // indistinguishable from the real thing, at 1/3000th the point-data payload. The grid is
  // the same one it was saved against, so the restored spot is open space by construction.
  // Dev-pen triangles/discs carry no cells and are skipped (dev shapes, not game state).
  function jelloSaveBodies() {
    var out = [];
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (b.devFixture) continue;   // the dev pen re-injects every dev boot (040 tags its
                                    // blobs); persisting them would duplicate the pen set
      if (!b.cells || !b.cells.length) continue;
      if (!isFinite(b.cx) || !isFinite(b.cy)) continue;   // never persist corrupt state
      var flat = [];
      for (var ci = 0; ci < b.cells.length; ci++) flat.push(b.cells[ci].r, b.cells[ci].c);
      out.push({ c: flat, t: b.jellyType || 'slime',
                 h: Math.round(b.hue),   // exact render hue (C-dropped cubes are random-coloured)
                 x: Math.round(b.cx * 10) / 10, y: Math.round(b.cy * 10) / 10 });
    }
    return out;
  }
  function jelloRestoreBodies(list) {
    resetJello();   // also the stale-body guard: restore always starts from empty
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      try {
        var e = list[i];
        if (!e || !e.c || !e.c.length || (e.c.length % 2) || !isFinite(e.x) || !isFinite(e.y)) continue;
        if (e.c.length > JELLO_MAX_CELLS * 2) continue;   // corrupt save: more cells than any cluster can be
        // Bounds envelope: everything save can WRITE must restore (the dev arena spawns
        // cubes whose cells sit a few rows ABOVE the world top near the surface, so a
        // hard 0..TOTAL_ROWS check refused legitimate saves — harness-caught), while a
        // corrupt payload (giant coordinates would make the builder allocate a huge
        // lattice index) still bounces. 16 tiles of slack on every side.
        var cells = [];
        var cMinR = 1e9, cMaxR = -1e9, cMinC = 1e9, cMaxC = -1e9;
        for (var k = 0; k + 1 < e.c.length; k += 2) {
          var rr = e.c[k] | 0, cc = e.c[k + 1] | 0;
          if (rr < -16 || rr >= TOTAL_ROWS + 16 || cc < -16 || cc >= COLS + 16) { cells = null; break; }
          if (rr < cMinR) cMinR = rr; if (rr > cMaxR) cMaxR = rr;
          if (cc < cMinC) cMinC = cc; if (cc > cMaxC) cMaxC = cc;
          cells.push({ r: rr, c: cc });
        }
        if (!cells || !cells.length) continue;
        if (cMaxR - cMinR > 16 || cMaxC - cMinC > 16) continue;   // wider than any real cluster: corrupt
        var b = jelloBuildBody(cells, (typeof e.t === 'string' && JELLO_TYPES[e.t]) ? e.t : 'slime');
        if (!b) continue;                                  // budget exhausted: skip, never throw
        if (typeof e.h === 'number' && isFinite(e.h)) b.hue = ((Math.round(e.h) % 360) + 360) % 360;
        var dx = e.x - b.cx, dy = e.y - b.cy;
        if (dx || dy) {
          for (var p = 0; p < b.n; p++) { b.px[p] += dx; b.ox[p] = b.px[p]; b.py[p] += dy; b.oy[p] = b.py[p]; }
          b.bboxL += dx; b.bboxR += dx; b.bboxT += dy; b.bboxB += dy;
          b.cx += dx; b.cy += dy;
        }
        b.sleeping = false; b.sleepFrames = 0;   // wake to settle; the sleep gate re-parks it
      } catch (err) { /* one malformed entry must never take the boot down */ }
    }
    jelloCount = jelloTotalPoints();
  }

  // ----- Headless-harness export (read/poke hooks, same spirit as window.gm) -----
  // The preview pauses the RAF loop, so jello solver changes are validated by a
  // headless-Chrome harness that boots the real game and needs to (a) spawn the
  // dev cubes without keyboard events, (b) read body state numerically, and
  // (c) switch feel presets per run. Registering this changes nothing about
  // gameplay; jelloBodies keeps its identity across resetJello (length=0), so
  // exposing the live array reference is safe.
  try {
    window.__jello = {
      bodies: jelloBodies,
      spawn: jelloDevSpawnTiles,
      spawnOne: jelloDevSpawnOne,
      reset: resetJello,
      arenaClear: jelloDevArenaClear,
      arenaInfo: function () { return { left: jelloArenaLeftC, ground: jelloArenaGroundR, cells: jelloArenaCells.length }; },
      build: jelloBuildBody,
      buildDisc: jelloBuildDisc,
      buildTriangle: jelloBuildTriangle,
      placeTiles: jelloDevPlaceTiles,
      clearTile: jelloDevClearTile,
      tile: function (r, c) { return tileAt(r, c) === null ? 0 : 1; },   // harness world probe (procedural
                                                                         // caves make blind dig sites flaky)
      saveBodies: jelloSaveBodies,
      restoreBodies: jelloRestoreBodies,
      sanitize: jelloSanitizeBody,
      applyFeel: jelloApplyFeel,
      cycleFeel: jelloCycleFeel,
      setActorIntent: jelloSetActorIntent,
      clearActorIntent: jelloClearActorIntent,
      actor: jelloActorFor,
      launchBody: jelloLaunchBody,
      feels: JELLO_FEELS,
      totalPoints: jelloTotalPoints,
      player: function () { return player; },
      frame: function () { return jelloFrameNo; },   // real sim frames (loop-alive checks)
      camXY: function () {   // world->viewport mapping for clipped screenshots:
        // clipX = (worldX - .x) * .ws lands in viewport CSS px (canvas offset folded in)
        var rect = canvas.getBoundingClientRect();
        var ws2 = (typeof worldScale !== 'undefined' ? worldScale : 1);
        return { x: cam.x - rect.left / ws2, y: cam.y - rect.top / ws2, ws: ws2 };
      }
    };
  } catch (e) {}
  /* >>> ENGINE SYNC: END jello-engine <<< */


  /* ==== SLIME OVERRIDES (toy host) ======================================
   * Later declarations shadow the engine copies above. Rig couplings
   * become no-ops; the disc builder gets the game's 8 px lattice pitch
   * back (at the toy's TILE=8 the original TILE/(NPT+1) formula would
   * build a 2 px lattice — four times the game's density). ==== */
  function jelloPlayerFling() {}
  function jelloPlayerCouple() {}
  function jelloResolvePlayer() {}
  function jelloRigDisplaceGel() {}
  function jelloDeformBowl() {}

  var JELLO_DISC_PITCH = 8;   // the game's disc ring pitch (TILE 32 / (NPT 3 + 1))

  // Byte-for-byte the engine's jelloBuildDisc except `a` (marked below).
  function jelloBuildDisc(ccx, ccy, radius, jellyType) {
    if (jelloBodies.length >= JELLO_MAX_BODIES) return null;
    var a = JELLO_DISC_PITCH;            // toy: fixed pitch (was TILE / (JELLO_NPT + 1))
    var M = Math.round(radius / a);
    if (M < 2) M = 2;
    while (M > 2 && jelloCount + 1 + 3 * M * (M + 1) > JELLO_MAX_POINTS) M--;
    var dr = radius / M;
    var pts = [{ x: ccx, y: ccy }];
    var ringStart = [0], ringCount = [1], ringPhase = [0];
    for (var j = 1; j <= M; j++) {
      var Nj = 6 * j;
      var phase = (j & 1) * (Math.PI / Nj);
      ringStart[j] = pts.length; ringCount[j] = Nj; ringPhase[j] = phase;
      for (var k = 0; k < Nj; k++) {
        var ang = phase + (k / Nj) * 6.2831853;
        pts.push({ x: ccx + Math.cos(ang) * j * dr, y: ccy + Math.sin(ang) * j * dr });
      }
    }
    var n = pts.length;
    if (n < 4) return null;

    var b = {
      n: n,
      px: new Float64Array(n), py: new Float64Array(n),
      ox: new Float64Array(n), oy: new Float64Array(n),
      rx: new Float32Array(n), ry: new Float32Array(n),
      qx: new Float32Array(n), qy: new Float32Array(n),
      sA: null, sB: null, sRest: null, sType: null, springN: 0,
      ring: null, ringN: 0, ringPos: null, ringSign: 1,
      rippleU: null, rippleP: null, rippleOn: false, rippleCd: 0,
      vx: 0, vy: 0,
      npt: JELLO_NPT + 1, spacing: a,
      cr: JELLO_CONTACT_R_FRAC * a, selfMin2: 0,
      bboxL: 0, bboxR: 0, bboxT: 0, bboxB: 0, cx: 0, cy: 0,
      sleeping: false, sleepFrames: 0, frozen: false,
      tileW: 0, tileH: 0,
      hue: jellyType ? jelloHueForType(jellyType) : JELLO_RENDER_HUE,
      jellyType: jellyType || 'slime'
    };
    for (var p = 0; p < n; p++) {
      b.px[p] = b.ox[p] = b.rx[p] = pts[p].x;
      b.py[p] = b.oy[p] = b.ry[p] = pts[p].y;
    }
    b.cx = ccx; b.cy = ccy;
    b.tileW = (2 * radius) / TILE; b.tileH = b.tileW;
    b.bboxL = ccx - radius; b.bboxT = ccy - radius;
    b.bboxR = ccx + radius; b.bboxB = ccy + radius;

    var sA = [], sB = [], sRest = [];
    function addSpring(i0, i1) {
      var dx = b.rx[i0] - b.rx[i1], dy = b.ry[i0] - b.ry[i1];
      sA.push(i0); sB.push(i1); sRest.push(Math.sqrt(dx * dx + dy * dy));
    }
    for (var sj = 1; sj <= M; sj++) {
      var sN = ringCount[sj], s0 = ringStart[sj], sPh = ringPhase[sj];
      var inN = ringCount[sj - 1], in0 = ringStart[sj - 1], inPh = ringPhase[sj - 1];
      for (var sk = 0; sk < sN; sk++) {
        var cur = s0 + sk;
        addSpring(cur, s0 + ((sk + 1) % sN));
        if (sj === 1) { addSpring(cur, 0); continue; }
        var angC = sPh + (sk / sN) * 6.2831853;
        var tIn = (angC - inPh) * inN / 6.2831853;
        var k0 = Math.floor(tIn) % inN; if (k0 < 0) k0 += inN;
        addSpring(cur, in0 + k0);
        addSpring(cur, in0 + ((k0 + 1) % inN));
      }
    }
    b.sA = Int32Array.from(sA);
    b.sB = Int32Array.from(sB);
    b.sRest = Float32Array.from(sRest);
    b.sType = new Int8Array(sA.length);
    b.springN = sA.length;
    b.sLambda = new Float32Array(b.springN);
    b.tris = null;
    jelloInstallSpringHealthMesh(b);             // keep the toy override topology-aware too

    var ring = [];
    for (var rk0 = 0; rk0 < ringCount[M]; rk0++) ring.push(ringStart[M] + rk0);
    b.ring = Int32Array.from(ring);
    b.ringPos = new Int32Array(n);
    for (var rp = 0; rp < n; rp++) b.ringPos[rp] = -1;
    b.ringN = ring.length;
    for (var rk = 0; rk < b.ringN; rk++) b.ringPos[b.ring[rk]] = rk;

    var ra = 0, rPrev = b.ring[b.ringN - 1];
    var raPX = b.rx[rPrev], raPY = b.ry[rPrev];
    for (var rai = 0; rai < b.ringN; rai++) {
      var rCur = b.ring[rai];
      var raCX = b.rx[rCur], raCY = b.ry[rCur];
      ra += raPX * raCY - raCX * raPY;
      raPX = raCX; raPY = raCY;
    }
    b.restArea = Math.abs(ra) * 0.5;
    b.ringSign = ra >= 0 ? 1 : -1;

    jelloComputeRest(b);
    jelloShadeAnchors(b);
    jelloBodies.push(b);
    jelloCount = jelloTotalPoints();
    return b;
  }

  /* ---- Slime spawning + pointer grab ---------------------------------- */
  var slimeHueCycle = 0;

  function spawnSlimeAt(wx, wy, rad) {
    var r = Math.max(18, Math.min(46, rad));
    wx = Math.max(r + TILE * 2, Math.min(worldW - r - TILE * 2, wx));
    wy = Math.max(r + TILE * 2, Math.min(worldH - r - TILE * 2, wy));
    if (tileAt(Math.floor(wy / TILE), Math.floor(wx / TILE)) !== null) return null;
    var key = JELLO_TYPE_KEYS[slimeHueCycle++ % JELLO_TYPE_KEYS.length];
    var b = jelloBuildDisc(wx, wy, r, key);
    return b;
  }

  // Pointer carry state. The public controller below addresses only a
  // continuous surface coordinate and bulk motion.
  var grabBody = null;
  var grabIdx = null, grabOffX = null, grabOffY = null;
  var grabWeight = null, grabRing = null, grabAnchor = -1;
  var grabTargetX = 0, grabTargetY = 0, grabSolveX = 0, grabSolveY = 0;
  var grabPrevSolveX = 0, grabPrevSolveY = 0;
  var grabAttemptDX = 0, grabAttemptDY = 0;
  var grabBlockNX = 0, grabBlockNY = 0, grabBlockReason = '';
  var grabProxyLead = 0, grabCorrectionAlpha = 1;
  var grabReleaseVX = 0, grabReleaseVY = 0, grabReleaseOmega = 0;
  var grabLastH = JELLO_H, grabLastMotionMs = 0;
  var JELLO_GRAB_RELEASE_BLEND = 0.92;
  var JELLO_GRAB_RELEASE_SPEED = 1400;
  var JELLO_GRAB_RELEASE_POINT = 1600;
  var JELLO_GRAB_RELEASE_FRESH = 230;
  var JELLO_GRAB_RELEASE_BOOST_MIN = 1.05;
  var JELLO_GRAB_RELEASE_BOOST_MAX = 1.15;
  var JELLO_GRAB_RELEASE_SPIN = 0.55;
  var JELLO_GRAB_RELEASE_SPIN_MAX = 7;
  var JELLO_GRAB_RECOVER = 1.35;

  function jelloGrabApplyRelease(b) {
    if (!grabLastMotionMs ||
        performance.now() - grabLastMotionMs > JELLO_GRAB_RELEASE_FRESH) return;
    var vx = grabReleaseVX, vy = grabReleaseVY;
    if (!isFinite(vx + vy)) return;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (!(speed > 1)) return;
    var u = Math.max(0, Math.min(1, (speed - 140) / 860));
    u = u * u * (3 - 2 * u);
    var boost = JELLO_GRAB_RELEASE_BOOST_MIN +
      (JELLO_GRAB_RELEASE_BOOST_MAX - JELLO_GRAB_RELEASE_BOOST_MIN) * u;
    vx *= boost; vy *= boost;
    jelloCarryReadSurface(b);
    var rx = carrySurfaceX - b.cx, ry = carrySurfaceY - b.cy;
    var radius = Math.max(8, (b.bboxR - b.bboxL + b.bboxB - b.bboxT) * 0.25);
    var omega = (rx * vy - ry * vx) /
      Math.max(1, rx * rx + ry * ry + radius * radius * 0.45) * JELLO_GRAB_RELEASE_SPIN;
    var launch = jelloLaunchBody(b, vx, vy, {
      h: grabLastH, blend: JELLO_GRAB_RELEASE_BLEND,
      maxSpeed: JELLO_GRAB_RELEASE_SPEED,
      maxPointSpeed: JELLO_GRAB_RELEASE_POINT,
      omega: omega, maxOmega: JELLO_GRAB_RELEASE_SPIN_MAX
    });
    if (launch) {
      carryLastLaunchSpeed = launch.speed;
      carryLastLaunchSpin = launch.omega;
    }
  }

  /* ==== KINEMATIC SURFACE CARRY ========================================
   * The pointer owns one continuous coordinate on the visible boundary.
   * That coordinate follows pointer displacement exactly, with no speed cap,
   * proxy, trust region, or interior-node patch. The soft solver remains free
   * to squash and wobble the rest of the body. A final per-substep pin makes
   * the hand attachment authoritative after contact and world collision.
   *
   * This is also the first consumer of the generic drive seam used by future
   * slime actors. Carry is kinematic. Actor intent is dynamic. Both address a
   * body as a silhouette and a pose, never as a visible lattice. ==== */
  var carrySurfaceA = -1, carrySurfaceB = -1, carrySurfaceT = 0;
  var carrySurfaceX = 0, carrySurfaceY = 0;
  var carryOffsetX = 0, carryOffsetY = 0;
  var carryPointerX = 0, carryPointerY = 0, carryPointerMs = 0;
  var carryPendingX = 0, carryPendingY = 0;
  var carrySessionTravel = 0, carrySessionMaxError = 0;
  var carryLastTravel = 0, carryLastMaxError = 0, carryLastReleaseSpeed = 0;
  var carryLastLaunchSpeed = 0, carryLastLaunchSpin = 0;

  function jelloCarryReadSurface(b) {
    if (!b || carrySurfaceA < 0 || carrySurfaceB < 0) {
      carrySurfaceX = carrySurfaceY = 0;
      return;
    }
    var u = carrySurfaceT, v = 1 - u;
    carrySurfaceX = b.px[carrySurfaceA] * v + b.px[carrySurfaceB] * u;
    carrySurfaceY = b.py[carrySurfaceA] * v + b.py[carrySurfaceB] * u;
  }

  function jelloCarryFindSurface(b, wx, wy) {
    var best = 1e30, bestA = -1, bestB = -1, bestT = 0;
    for (var k = 0; k < b.ringN; k++) {
      var a = b.ring[k], z = b.ring[(k + 1) % b.ringN];
      var ax = b.px[a], ay = b.py[a];
      var dx = b.px[z] - ax, dy = b.py[z] - ay;
      var dd = dx * dx + dy * dy;
      var u = dd > 1e-9 ? ((wx - ax) * dx + (wy - ay) * dy) / dd : 0;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      var sx = ax + dx * u, sy = ay + dy * u;
      var ex = sx - wx, ey = sy - wy, d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bestA = a; bestB = z; bestT = u; }
    }
    carrySurfaceA = bestA; carrySurfaceB = bestB; carrySurfaceT = bestT;
    jelloCarryReadSurface(b);
    return bestA >= 0;
  }

  function jelloCarryTranslate(b, dx, dy) {
    if (!(Math.abs(dx) + Math.abs(dy) > 1e-10)) return;
    for (var i = 0; i < b.n; i++) {
      b.px[i] += dx; b.py[i] += dy;
      b.ox[i] += dx; b.oy[i] += dy;
    }
    b.bboxL += dx; b.bboxR += dx;
    b.bboxT += dy; b.bboxB += dy;
    b.cx += dx; b.cy += dy;
  }

  function jelloCarryPin(b) {
    jelloCarryReadSurface(b);
    var wantedX = grabTargetX + carryOffsetX;
    var wantedY = grabTargetY + carryOffsetY;
    var dx = wantedX - carrySurfaceX;
    var dy = wantedY - carrySurfaceY;
    jelloCarryTranslate(b, dx, dy);
    carrySurfaceX = wantedX; carrySurfaceY = wantedY;
    jelloCarryReadSurface(b);
    var postError = Math.hypot(wantedX - carrySurfaceX, wantedY - carrySurfaceY);
    if (postError > carrySessionMaxError) carrySessionMaxError = postError;
    grabSolveX = grabTargetX; grabSolveY = grabTargetY;
    grabProxyLead = 0; grabCorrectionAlpha = 1;
  }

  function jelloCarryInjectLag(b) {
    var dx = carryPendingX, dy = carryPendingY;
    carryPendingX = carryPendingY = 0;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (!(d > 1e-5)) return;
    var cap = Math.max(2, (b.spacing || JELLO_DISC_PITCH) * 0.9);
    if (d > cap) { dx *= cap / d; dy *= cap / d; d = cap; }
    jelloCarryReadSurface(b);
    var far = 1;
    for (var i = 0; i < b.n; i++) {
      var fx = b.px[i] - carrySurfaceX, fy = b.py[i] - carrySurfaceY;
      var fd = Math.sqrt(fx * fx + fy * fy);
      if (fd > far) far = fd;
    }
    for (i = 0; i < b.n; i++) {
      fx = b.px[i] - carrySurfaceX; fy = b.py[i] - carrySurfaceY;
      var weight = Math.sqrt(fx * fx + fy * fy) / far;
      weight = weight * weight * 0.24;
      b.ox[i] += dx * weight;
      b.oy[i] += dy * weight;
    }
    if (b.rippleCd <= 0 && d > (b.spacing || 1) * 0.45) {
      var amp = Math.min(1, d / Math.max(1, (b.spacing || 1) * 0.9));
      jelloRippleInject(b, carrySurfaceX, carrySurfaceY,
                        -amp * JELLO_RIPPLE_MAX * 0.22, 2);
      b.rippleCd = 0.07;
    }
  }

  function jelloGrabStart(wx, wy) {
    jelloGrabEnd();
    for (var bi = jelloBodies.length - 1; bi >= 0; bi--) {
      var b = jelloBodies[bi], pad = 18;
      if (!b || b._melting || b.ringN < 3) continue;
      if (wx < b.bboxL - pad || wx > b.bboxR + pad ||
          wy < b.bboxT - pad || wy > b.bboxB + pad) continue;
      if (!jelloPointInRing(b, wx, wy)) {
        var near = jelloNearestOnRing(b, wx, wy);
        var ndx = near.x - wx, ndy = near.y - wy;
        if (ndx * ndx + ndy * ndy > pad * pad) continue;
      }
      if (!jelloCarryFindSurface(b, wx, wy)) continue;
      grabBody = b;
      grabAnchor = carrySurfaceA;
      grabIdx = [carrySurfaceA, carrySurfaceB];
      grabOffX = grabOffY = null;
      grabWeight = grabRing = null;
      grabTargetX = grabSolveX = wx;
      grabTargetY = grabSolveY = wy;
      grabPrevSolveX = wx; grabPrevSolveY = wy;
      carryOffsetX = carrySurfaceX - wx;
      carryOffsetY = carrySurfaceY - wy;
      carryPointerX = wx; carryPointerY = wy;
      carryPointerMs = performance.now();
      carryPendingX = carryPendingY = 0;
      carrySessionTravel = carrySessionMaxError = 0;
      carryLastLaunchSpeed = carryLastLaunchSpin = 0;
      grabAttemptDX = grabAttemptDY = 0;
      grabReleaseVX = grabReleaseVY = grabReleaseOmega = 0;
      grabLastMotionMs = 0;
      grabBlockReason = ''; grabBlockNX = grabBlockNY = 0;
      grabProxyLead = 0; grabCorrectionAlpha = 1;
      b._grabbed = false;
      b._carried = true;
      b._grabApplied = 0;
      b._recoverT = 0;
      b.sleeping = false; b.sleepFrames = 0; b.frozen = false;
      return true;
    }
    return false;
  }

  function jelloGrabTick(wx, wy) {
    var b = grabBody;
    if (!b) return;
    if (jelloBodies.indexOf(b) < 0 || b._melting) { jelloGrabEnd(); return; }
    var dx = wx - carryPointerX, dy = wy - carryPointerY;
    if (Math.abs(dx) + Math.abs(dy) > 1e-8) {
      var now = performance.now();
      var sampleDt = Math.max(1, Math.min(80, now - carryPointerMs));
      var svx = dx * 1000 / sampleDt, svy = dy * 1000 / sampleDt;
      var blend = 1 - Math.exp(-sampleDt / 34);
      grabReleaseVX += (svx - grabReleaseVX) * blend;
      grabReleaseVY += (svy - grabReleaseVY) * blend;
      grabLastMotionMs = now;
      carryPendingX += dx; carryPendingY += dy;
      carrySessionTravel += Math.sqrt(dx * dx + dy * dy);
      grabAttemptDX = dx; grabAttemptDY = dy;
      carryPointerX = wx; carryPointerY = wy; carryPointerMs = now;
    }
    grabTargetX = grabSolveX = wx;
    grabTargetY = grabSolveY = wy;
    b.sleeping = false; b.sleepFrames = 0; b.frozen = false;
    b._plyMs = performance.now();
  }

  function jelloGrabSubstep(b, h) {
    if (b !== grabBody || !b._carried) return;
    grabLastH = h;
    b._grabApplied = 0;
    b.sleeping = false; b.sleepFrames = 0;
    jelloCarryPin(b);
    jelloCarryInjectLag(b);
  }

  // The shared solver calls this after collision and its velocity clamp. The
  // surface pin wins last, which is the exact one-to-one hand contract.
  function jelloDrivePostSubstep(b, h) {
    if (b !== grabBody || !b._carried) return;
    grabLastH = h;
    jelloCarryPin(b);
  }

  function jelloGrabRejectStep() {}
  function jelloGrabAcceptStep() {}
  function jelloGrabResolveTopologyStep() { return false; }

  function jelloGrabEnd() {
    var b = grabBody;
    if (b && jelloBodies.indexOf(b) >= 0 && !b._melting) {
      jelloCarryPin(b);
      carryLastTravel = carrySessionTravel;
      carryLastMaxError = carrySessionMaxError;
      carryLastReleaseSpeed = Math.hypot(grabReleaseVX, grabReleaseVY);
      jelloGrabApplyRelease(b);
      b._carried = false;
      b._grabbed = false;
      b._grabApplied = 0;
      b._recoverT = Math.max(b._recoverT || 0, JELLO_GRAB_RECOVER);
      b.sleeping = false; b.sleepFrames = 0; b.frozen = false;
    }
    grabBody = null; grabIdx = null; grabOffX = null; grabOffY = null;
    grabWeight = null; grabRing = null; grabAnchor = -1;
    carrySurfaceA = carrySurfaceB = -1; carrySurfaceT = 0;
    carrySurfaceX = carrySurfaceY = carryOffsetX = carryOffsetY = 0;
    carryPendingX = carryPendingY = 0;
    grabAttemptDX = grabAttemptDY = 0;
    grabReleaseVX = grabReleaseVY = grabReleaseOmega = 0;
    grabLastMotionMs = 0;
    grabBlockReason = ''; grabBlockNX = grabBlockNY = 0;
  }

  if (typeof window !== 'undefined') {
    window.__slimeGrab = function () {
      var b = grabBody, error = 0;
      if (b) {
        jelloCarryReadSurface(b);
        error = Math.hypot(grabTargetX + carryOffsetX - carrySurfaceX,
                           grabTargetY + carryOffsetY - carrySurfaceY);
      }
      return {
        worldW: worldW, worldH: worldH, fitScale: fitScale,
        pointerDown: !!pointerDown, tool: tool || '',
        pointerX: px || 0, pointerY: py || 0,
        active: !!b, mode: b ? 'surface-carry' : 'free',
        targetX: grabTargetX, targetY: grabTargetY,
        solveX: grabTargetX, solveY: grabTargetY,
        gap: 0, anchorError: error,
        sessionTravel: b ? carrySessionTravel : carryLastTravel,
        maxAnchorError: b ? carrySessionMaxError : carryLastMaxError,
        lastReleaseSpeed: carryLastReleaseSpeed,
        lastLaunchSpeed: carryLastLaunchSpeed,
        lastLaunchSpin: carryLastLaunchSpin,
        releaseVX: grabReleaseVX, releaseVY: grabReleaseVY,
        body: b ? {
          cx: b.cx, cy: b.cy, vx: b.vx || 0, vy: b.vy || 0,
          left: b.bboxL, top: b.bboxT, right: b.bboxR, bottom: b.bboxB
        } : null,
        bodies: jelloBodies.map(function (body) {
          return { cx: body.cx, cy: body.cy, left: body.bboxL, top: body.bboxT,
                   right: body.bboxR, bottom: body.bboxB, melting: !!body._melting };
        })
      };
    };
  }

  /* ---- Sleeping-droplet sweep -----------------------------------------
   * A particle that falls asleep while resting on a slime SKIPS
   * integration: no gravity, no motion. When the slime then moves or
   * jiggles, the droplet hangs in space exactly where it slept (owner
   * footage: "some water doesn't move at all and stays in place on top
   * of the slime"). Every 4th frame, wake any sleeping particle inside
   * an AWAKE body's halo; droplets on genuinely sleeping slimes stay
   * parked, which is physical. ---- */
  function wakeSleepersOnBodies() {
    if (typeof jelloBodies === 'undefined' || !jelloBodies.length) return;
    if (waterState !== 'on' || liquidCount === 0) return;
    var boxes = [];
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (!b || b.sleeping || b.frozen) continue;
      if (!isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) continue;
      boxes.push(b.bboxL - 14, b.bboxT - 14, b.bboxR + 14, b.bboxB + 14);
    }
    if (!boxes.length) return;
    var nB = boxes.length, woke = 0;
    for (var i = 0; i < liquidCount; i++) {
      if (!liquidSleeping[i]) continue;
      var x = liquidX[i], y = liquidY[i];
      for (var k = 0; k < nB; k += 4) {
        if (x >= boxes[k] && x <= boxes[k + 2] && y >= boxes[k + 1] && y <= boxes[k + 3]) {
          liquidSleeping[i] = 0; liquidFrozen[i] = 0; liquidRestFrames[i] = 0;
          if (liquidOps.length < LIQUID_OPS_MAX) liquidOps.push(4, i, liquidType[i], liquidOrigin[i]);
          else liquidOpsOverflow = true;
          woke++;
          break;
        }
      }
    }
    if (woke) liquidMutationSeq++;
  }

  /* ---- Water <-> slime coupling, rewritten (v2) -----------------------
   * Per lattice point, two forces, applied with the engine's own
   * real-velocity convention (bathImpulse: o -= dv * H, scaled by the
   * live JELLO_TIMESCALE):
   *
   *   buoyancy  dv_y = -g * (1 + BETA) * phi * dt
   *     phi = GEOMETRIC submergence: depth below the column's free
   *     surface (waterColSurf), ramped over ~10 px. It cannot come from
   *     co-located density, because the guest boundary keeps the inside
   *     of a submerged slime EMPTY (measured: raw cells [0,0,0,0] at a
   *     drowned centroid). The free surface is immune to that hole (the
   *     hole is always under it). Net lift at phi 1 is BETA = 0.36 g, so
   *     a floater rides ~3/4 submerged like real gel. A 2-3 column
   *     stream gives its columns a spout-high surface, but drag from the
   *     stream's downward flow dominates, so slimes still fall through
   *     waterfalls; spray never forms a 2-cell surface run at all.
   *   drag      dv = (v_water - v_point) * (1 - e^(-K * phiD * dt))
   *     phiD = local density where the point actually touches water (the
   *     shell around the bubble, streams, sprays). Currents carry
   *     floaters, plunges damp out, a waterfall pushes down, and in
   *     zero-g a thrown blob drags a slime with it. Inside the bubble a
   *     mild still-water term damps ring-down.
   *
   * One-way by construction (the push the water feels stays the guest
   * rings; the game's two-way experiment died in v25.50-52). The mirror
   * runs at DBG_READBACK_EVERY=2 for the toy, so the field is ~3 frames
   * old instead of ~20.
   *
   * The DISSOLVE stays off (the no-op below shadows the engine's
   * jelloWaterDissolveFrame): slimes float in water, they do not
   * become it. ---- */
  function jelloWaterDissolveFrame() {}

  // Pool-LOCAL surface: from an anchor row, find this pool's own free
  // surface by walking the column. Down first (<= 6 cells) to hook the
  // water the anchor sits in or above, then up through the water,
  // tolerating <= 2-cell dry holes (guest bubbles, foam), stopping dead
  // at a drawn wall or a >= 3-cell air gap. A pool on another floor in
  // the same column sits beyond one of those stops, so it can never be
  // read as this pool's surface (the owner could steer a lower slime by
  // splashing an upper pool before this).
  function poolSurfaceAt(col, anchorRow) {
    if (col < 0 || col >= gridW) return Infinity;
    var r = anchorRow < 0 ? 0 : (anchorRow >= gridH ? gridH - 1 : anchorRow);
    var start = -1;
    for (var d = 0; d <= 6 && r + d < gridH; d++) {
      var idx = (r + d) * gridW + col;
      if (walls[idx]) break;
      if (waterCellCount[idx] >= WATER_CELL_WET) { start = r + d; break; }
    }
    if (start < 0) return Infinity;
    var top = start;
    var dry = 0;
    for (var u = start - 1; u >= 0; u--) {
      var idx2 = u * gridW + col;
      if (walls[idx2]) break;
      if (waterCellCount[idx2] >= WATER_CELL_WET) { top = u; dry = 0; }
      else { dry++; if (dry >= 3) break; }
    }
    return top * TILE;
  }

  var BUOY_BETA = 0.24;         // extra lift beyond gravity-cancel at phi 1 (floats ~4/5 submerged)
  var DRAG_K = 8;               // 1/s pull toward the local water velocity at phi 1
  var COUPLE_DV_CAP = 340;      // px/s of velocity change per frame, per axis
  var RAM_L = 340;              // form-drag length scale, px: entry speed decays
                                // over ~RAM_L of submerged travel (decel = v*v/RAM_L)
  var SURF_RATE = 12;           // px/s cap on measured-surface motion (the anti-splash-chase;
                                //   real fills raise a column ~3 px/s, bob-splash needs ~60)

  function jelloWaterCoupleTick(dt) {
    if (typeof jelloBodies === 'undefined' || !jelloBodies.length) return;
    if (!(dt > 0)) return;
    var invRest = 1 / (WATER_CELL_REST * 0.85);   // interior counts saturate phi at ~0.85 rest
    // Real px/s <-> Verlet state. The engine advances JELLO_TIMESCALE
    // sim-seconds per real second in JELLO_H substeps, so real velocity is
    // (p - o) * TS / H and a real dv lands as o -= dv * H / TS. Using the
    // LIVE timescale keeps the coupling exact under the time slider. (The
    // first draft used 1/H flat and every force arrived at half strength:
    // slimes sank to the pool floor and sat there.)
    var ts = (typeof JELLO_TIMESCALE === 'number' && JELLO_TIMESCALE >= 0.02) ? JELLO_TIMESCALE : 0.5;
    var invV = ts / JELLO_H;
    var applyK = JELLO_H / ts;
    for (var bi = 0; bi < jelloBodies.length; bi++) {
      var b = jelloBodies[bi];
      if (!b || b.frozen || !isFinite(b.bboxL + b.bboxR + b.bboxT + b.bboxB)) continue;
      if (!waterCellsAny) { b._wetCells = 0; continue; }

      // Coarse wet probe over the bbox (cheap, runs even for sleepers so
      // rising water can wake a parked body; a steady floater whose local
      // water has not changed stays asleep).
      var c0 = Math.max(0, ((b.bboxL / TILE) | 0) - 1);
      var c1 = Math.min(gridW - 1, ((b.bboxR / TILE) | 0) + 1);
      var r0 = Math.max(0, ((b.bboxT / TILE) | 0) - 1);
      var r1 = Math.min(gridH - 1, ((b.bboxB / TILE) | 0) + 1);
      var probe = 0;
      for (var pr = r0; pr <= r1; pr++) {
        var off = pr * gridW;
        for (var pc = c0; pc <= c1; pc++) {
          if (waterCellCount[off + pc] >= WATER_CELL_WET) probe++;
        }
      }
      if (b.sleeping) {
        // Wake only on a REAL local water change. The old threshold
        // (max(2, 5% of points)) flapped on mirror-burst wobble, so a
        // parked floater woke every few frames and never truly rested.
        var base = b._wetCells || 0;
        if (probe > 0 && Math.abs(probe - base) > Math.max(4, b.n * 0.1)) {
          b.sleeping = false; b.sleepFrames = 0;
        } else {
          continue;                  // asleep and nothing changed: no forces
        }
      }
      b._wetCells = probe;
      if (!probe) continue;

      // FAR-FIELD surface reference: the level in the columns BESIDE the
      // body, not under it. A floater displaces its own columns (crater
      // going down, heap coming up), and a surface read under the body
      // feeds that straight back into its lift: measured as a slow
      // undamped rise-sink limit cycle (~10 s period, occasionally
      // resonating into real launches). The columns next door only move
      // with genuine fills and waves, so against them buoyancy is a plain
      // damped well and the body parks. Median of up to 5 wet columns per
      // side, the lower (deeper) side wins; bodies with no wet neighbors
      // (mid-air, or wall-to-wall tubes) fall back to the under-column
      // reading, which keeps the waterfall behavior intact.
      // Sampling walks OUTWARD from the bbox and stops at the first
      // barrier column (a drawn wall anywhere in the body's row band), so
      // a pool on the other side of a wall can never leak into this
      // body's reference. Each sampled column reads its POOL-LOCAL
      // surface anchored at the body's depth, so pools on other floors
      // in the same columns are invisible too.
      var farSurf = Infinity;
      var anchorRow = (b.cy / TILE) | 0;
      var bandT = Math.max(0, ((b.bboxT / TILE) | 0) - 1);
      var bandB = Math.min(gridH - 1, ((b.bboxB / TILE) | 0) + 1);
      var mTmp = [];
      for (var fc = c0 - 1; fc >= Math.max(0, c0 - 5); fc--) {
        var blocked = false;
        for (var br = bandT; br <= bandB; br++) {
          if (walls[br * gridW + fc]) { blocked = true; break; }
        }
        if (blocked) break;
        var sL = poolSurfaceAt(fc, anchorRow);
        if (sL < Infinity) mTmp.push(sL);
      }
      if (mTmp.length >= 2) {
        mTmp.sort(function (a2, b2) { return a2 - b2; });
        farSurf = mTmp[(mTmp.length / 2) | 0];
      }
      mTmp = [];
      for (var fc2 = c1 + 1; fc2 <= Math.min(gridW - 1, c1 + 5); fc2++) {
        var blocked2 = false;
        for (var br2 = bandT; br2 <= bandB; br2++) {
          if (walls[br2 * gridW + fc2]) { blocked2 = true; break; }
        }
        if (blocked2) break;
        var sR = poolSurfaceAt(fc2, anchorRow);
        if (sR < Infinity) mTmp.push(sR);
      }
      if (mTmp.length >= 2) {
        mTmp.sort(function (a3, b3) { return a3 - b3; });
        var mR = mTmp[(mTmp.length / 2) | 0];
        if (mR < farSurf) farSurf = mR;
      }
      // Low-pass the reference per body (tau ~1.2 s, 2 px dead-band). In a
      // narrow basin the body's own displacement shifts the GLOBAL level a
      // few px as it bobs, so even the far columns carried a slow echo of
      // its motion (the residual ~20 px wander). Bob frequencies die in
      // the filter; real fills (px/s for minutes) walk straight through.
      if (farSurf < Infinity) {
        if (b._surfRef === undefined || b._surfRef === null) {
          b._surfRef = farSurf;
        } else {
          var sd = farSurf - b._surfRef;
          if (sd > 2 || sd < -2) b._surfRef += sd * (1 - Math.exp(-dt / 1.2));
        }
        farSurf = b._surfRef;
      } else {
        b._surfRef = null;
      }
      var n = b.n, px = b.px, py = b.py, ox = b.ox, oy = b.oy;
      var dbg = (window.__cdb && bi === 0) ? { t: toyFrameNo, dvy: 0, phi: 0, np: 0 } : null;
      // Body real velocity (for entry physics below).
      var bvx = 0, bvy = 0;
      for (var vi = 0; vi < n; vi++) { bvx += px[vi] - ox[vi]; bvy += py[vi] - oy[vi]; }
      bvx = bvx / n * invV; bvy = bvy / n * invV;
      var bSpd = Math.sqrt(bvx * bvx + bvy * bvy);
      // v3.5 — the authored entry wakes are GONE. The engine's guest
      // sweep (liquid-wgpu v26.11) makes the ring an impermeable moving
      // boundary: water is carried ahead of the leading face and routed
      // around the body by continuity, so the crater, crown, and lateral
      // sheets emerge from the boundary itself, at physical scale.
      // Inertia-honest buoyancy: a fast-moving body PENETRATES first and
      // floats second (the instant full-strength lift made the surface a
      // trampoline: balls skipped on a skin-tight notch instead of
      // carving a crater).
      var buoyScale = 1 / (1 + bSpd / 260);
      var buoyA = -JELLO_GRAVITY * (1 + BUOY_BETA) * dt * buoyScale;   // times phi per point
      var rampInv = 1 / (TILE * 2.0);                      // surface straddle ramp, ~16 px
                                                           // (wider = softer response to lapping
                                                           // waves; 10 px made lift jerk per wave)
      for (var i = 0; i < n; i++) {
        // Geometric submergence: depth below the column's free surface.
        // (Local density is useless here: the guest boundary keeps the
        // inside of a submerged slime EMPTY, measured raw [0,0,0,0].)
        var surfY = farSurf;
        if (surfY === Infinity) {
          // No usable far-field (mid-air, wall-to-wall tube): the point's
          // own column, but POOL-LOCAL, anchored at the point itself.
          surfY = poolSurfaceAt((px[i] / TILE) | 0, (py[i] / TILE) | 0);
        }
        var phi = 0;
        if (surfY < Infinity) {
          phi = (py[i] - surfY) * rampInv;
          if (phi < 0) phi = 0; else if (phi > 1) phi = 1;
        }
        // 2x2 bilinear density + mass-weighted velocity, for the drag term
        // (real at the boundary shell where water actually is).
        var gx = px[i] / TILE - 0.5;
        var gy = py[i] / TILE - 0.5;
        var cc = Math.floor(gx), rr = Math.floor(gy);
        var fx = gx - cc, fy = gy - rr;
        var dSum = 0, mvx = 0, mvy = 0;
        for (var s = 0; s < 4; s++) {
          var sc = cc + (s & 1), sr = rr + (s >> 1);
          if (sc < 0 || sc >= gridW || sr < 0 || sr >= gridH) continue;
          var w = ((s & 1) ? fx : 1 - fx) * ((s >> 1) ? fy : 1 - fy);
          var idx = sr * gridW + sc;
          var cnt = waterCellCount[idx];
          if (!cnt) continue;
          dSum += w * cnt;
          mvx += w * waterCellVX[idx];       // velocity SUMS: mass-weighting for free
          mvy += w * waterCellVY[idx];
        }
        if (phi === 0 && dSum < 1.5) continue;
        var vpx = (px[i] - ox[i]) * invV;
        var vpy = (py[i] - oy[i]) * invV;
        var dvx = 0, dvy = buoyA * phi;
        // Viscous body damping wherever the point is submerged: flow drag
        // alone cannot settle a bob, because the splash water around the
        // body co-moves with it and the relative velocity reads ~0.
        if (phi > 0) {
          var kv = 1 - Math.exp(-1.8 * phi * dt);
          dvx += -vpx * kv;
          dvy += -vpy * kv;
          // v3.5 RAM DRAG, Newton's third law for the plunge. The guest
          // boundary (liquid-wgpu v26.11) carries water ahead of the
          // leading face at body speed; with one-way coupling the body
          // never felt the reaction, so it plowed at constant speed and
          // pumped momentum into the pool every frame, and the pool
          // answered with a screen-height jet up the entry cavity.
          // Quadratic form drag with length scale RAM_L: a real ball
          // sheds its entry speed within a couple of body lengths of
          // water. It opposes the point's own velocity, so it can only
          // remove energy (no splash-chasing feedback), and at bob
          // speeds (<60 px/s) it is off entirely.
          var pspd = Math.sqrt(vpx * vpx + vpy * vpy);
          if (pspd > 60) {
            var kr = 1 - Math.exp(-(pspd / RAM_L) * phi * dt);
            dvx += -vpx * kr;
            dvy += -vpy * kr;
          }
        }
        if (dSum >= 1.5 && phi > 0) {
          // SUBMERGED points drag toward the local flow. Two guards keep
          // the body from re-absorbing its own splash momentum (the
          // one-way-coupling pump that kept relaunching it): emerged
          // points feel no flow drag at all (phi scale), and the flow
          // speed is capped at current-speed, so a 600 px/s exit-splash
          // burst tugs like a 150 px/s current instead of a catapult.
          var phiD = dSum * invRest;
          if (phiD > 1) phiD = 1;
          phiD *= phi;
          var vwx = mvx / dSum, vwy = mvy / dSum;
          var wsp = Math.sqrt(vwx * vwx + vwy * vwy);
          if (wsp > 150) { var wsc = 150 / wsp; vwx *= wsc; vwy *= wsc; }
          var k = 1 - Math.exp(-DRAG_K * phiD * dt);
          dvx += (vwx - vpx) * k;
          dvy += (vwy - vpy) * k;
        } else if (phi > 0) {
          // Inside the evacuated bubble: no local flow to read, so a
          // still-water drag damps plunges and ring-down.
          var k2 = 1 - Math.exp(-DRAG_K * 0.55 * phi * dt);
          dvx += -vpx * k2;
          dvy += -vpy * k2;
        }
        if (dvx > COUPLE_DV_CAP) dvx = COUPLE_DV_CAP; else if (dvx < -COUPLE_DV_CAP) dvx = -COUPLE_DV_CAP;
        if (dvy > COUPLE_DV_CAP) dvy = COUPLE_DV_CAP; else if (dvy < -COUPLE_DV_CAP) dvy = -COUPLE_DV_CAP;
        ox[i] -= dvx * applyK;
        oy[i] -= dvy * applyK;
        if (dbg) { dbg.dvy += dvy; dbg.phi += phi; dbg.np++; }
      }
      if (dbg) {
        var vySum = 0;
        for (var di = 0; di < n; di++) vySum += (py[di] - oy[di]);
        dbg.vyPre = vySum / n * invV;
        dbg.cyPre = b.cy;
        window.__cdb.push(dbg);
        if (window.__cdb.length > 2400) window.__cdb.shift();
      }
    }
  }

  /* ==== TOOLS + INPUT ===================================================
   * Six tools, one pointer. Continuous effects (pour, puff, carve, poke)
   * are applied per FRAME in toolTick so rates are framerate-honest; the
   * pointer handlers only track state. ==== */
  var tool = 'draw';
  var pointerDown = false, pointerIn = false;
  var pointerId = -1;
  var px = 0, py = 0;            // current world position
  var pvx = 0, pvy = 0;          // smoothed world velocity, px/s
  var lastPaintX = 0, lastPaintY = 0;
  var lastMoveT = 0;
  var slimeGhost = null;         // {x, y} while placing

  function slimeRadius() { return Math.max(20, Math.min(46, brushR * 1.7)); }

  function toWorld(e) {
    var rect = viewport.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / fitScale,
      y: (e.clientY - rect.top) / fitScale
    };
  }

  var inputEl = document.getElementById('toy-input');

  inputEl.addEventListener('pointerdown', function (e) {
    if (pointerDown) return;
    pointerDown = true;
    pointerId = e.pointerId;
    try { inputEl.setPointerCapture(e.pointerId); } catch (err) {}
    var w = toWorld(e);
    px = lastPaintX = w.x; py = lastPaintY = w.y;
    pvx = 0; pvy = 0; lastMoveT = performance.now();
    if (tool === 'poke') {
      // A grabbed slime is already the water's moving boundary. Registering
      // the pointer circle and an explosion wake at the same place made one
      // gesture inject momentum three times. Wake the local water, but let
      // the slime silhouette provide the only displacement.
      if (jelloGrabStart(px, py)) wakeLiquidNear(px, py, 100);
      else pushWake(px, py, 40, 300);
    } else if (tool === 'slime') {
      slimeGhost = { x: px, y: py };
    }
    e.preventDefault();
  });

  inputEl.addEventListener('pointermove', function (e) {
    var w = toWorld(e);
    pointerIn = true;
    if (pointerDown && e.pointerId === pointerId) {
      var now = performance.now();
      var mdt = Math.max(1, now - lastMoveT) / 1000;
      lastMoveT = now;
      pvx = pvx * 0.5 + ((w.x - px) / mdt) * 0.5;
      pvy = pvy * 0.5 + ((w.y - py) / mdt) * 0.5;
    }
    px = w.x; py = w.y;
    if (grabBody && pointerDown && e.pointerId === pointerId) jelloGrabTick(px, py);
    if (slimeGhost) { slimeGhost.x = px; slimeGhost.y = py; }
    e.preventDefault();
  });

  function releasePointer(e) {
    if (!pointerDown || e.pointerId !== pointerId) return;
    pointerDown = false;
    pointerId = -1;
    if (slimeGhost) {
      spawnSlimeAt(slimeGhost.x, slimeGhost.y, slimeRadius());
      slimeGhost = null;
    }
    jelloGrabEnd();
    pokeGuest = null;
    pvx = 0; pvy = 0;
  }
  inputEl.addEventListener('pointerup', releasePointer);
  inputEl.addEventListener('pointercancel', releasePointer);
  inputEl.addEventListener('pointerleave', function () { pointerIn = false; });
  inputEl.addEventListener('pointerenter', function () { pointerIn = true; });

  var POKE_PTS = 14;
  function updatePokeGuest() {
    // When dragging a slime, its ring is the only physical obstacle. The
    // pointer guest remains useful for stirring water directly in empty
    // space, but overlapping both boundaries caused double projections.
    if (!(pointerDown && tool === 'poke') || grabBody) { pokeGuest = null; return; }
    var R = Math.max(16, brushR);
    var vx = Math.max(-700, Math.min(700, pvx));
    var vy = Math.max(-700, Math.min(700, pvy));
    var pts = new Array(POKE_PTS * 4);
    for (var k = 0; k < POKE_PTS; k++) {
      var a = (k / POKE_PTS) * 6.2831853;
      pts[k * 4] = px + Math.cos(a) * R;
      pts[k * 4 + 1] = py + Math.sin(a) * R;
      pts[k * 4 + 2] = vx;
      pts[k * 4 + 3] = vy;
    }
    pokeGuest = { x: px, y: py, hw: Math.min(34, R), hh: Math.min(34, R), pts: pts };
  }

  function toolTick(dt) {
    updatePokeGuest();
    if (!pointerDown) return;
    if (tool === 'draw' || tool === 'erase') {
      if (px !== lastPaintX || py !== lastPaintY) {
        paintWallsSeg(lastPaintX, lastPaintY, px, py, brushR, tool === 'draw');
        lastPaintX = px; lastPaintY = py;
      } else {
        paintWalls(px, py, brushR, tool === 'draw');
      }
    } else if (tool === 'water') {
      var n = Math.max(4, Math.min(22, Math.round(brushR * 0.55)));
      spawnWaterJet(px, py, Math.max(6, brushR * 0.6),
        pvx * 0.35, pvy * 0.35 + 150 * gravMul, n);
    } else if (tool === 'smoke') {
      // Pointer velocity carries the smoke (Pavel-style): world px/s maps
      // to texel/s at ~0.28, and world +y (down) is UV -y (down).
      var pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.0017);
      smokePuff(px, py,
        pvx * 0.28,
        -pvy * 0.28 + 26 * pulse * (0.25 + 0.75 * gravMul),
        SMOKE_COL, 0.010 * Math.max(0.6, brushR / 16));
    } else if (tool === 'poke') {
      jelloGrabTick(px, py);
      if (smokeActive && smokeAwakeT > 0 && (pvx !== 0 || pvy !== 0)) {
        SmokeFluid.splat(px / worldW, 1 - py / worldH,
          Math.max(-420, Math.min(420, pvx * 0.34)),
          Math.max(-420, Math.min(420, -pvy * 0.34)),
          { r: 0, g: 0, b: 0 }, 0.02);
      }
    }
  }

  /* ---- Toolbar wiring -------------------------------------------------- */
  var toolButtons = [];
  function setTool(name) {
    tool = name;
    if (slimeGhost) slimeGhost = null;
    jelloGrabEnd();
    pokeGuest = null;
    for (var i = 0; i < toolButtons.length; i++) {
      var on = toolButtons[i].getAttribute('data-tool') === name;
      toolButtons[i].classList.toggle('is-on', on);
    }
  }

  function applyGravity() {
    if (liquidWGPU && liquidWGPU.setSimParam) liquidWGPU.setSimParam('GRAVITY', 250 * gravMul);
    JELLO_GRAVITY = GRAVITY * gravMul;
  }

  function applyTimescale() {
    var t = Math.max(0.05, timeMul);
    if (liquidWGPU && liquidWGPU.setSimParam) liquidWGPU.setSimParam('TIMESCALE', 1.55 * t);
    JELLO_TIMESCALE = 0.5 * t;
  }

  function waterFeelName(t) {
    if (t < 0.16) return 'calmer';
    if (t < 0.38) return 'calm';
    if (t < 0.66) return 'balanced';
    if (t < 0.88) return 'lively';
    return 'very lively';
  }

  function applyWaterFeel() {
    if (!liquidWGPU || !liquidWGPU.setSimParam) return;
    var t = Math.max(0, Math.min(1, waterFeel));
    // v4.5: one material, two simultaneous energy scales. Global momentum,
    // time, pressure, and rendering stay fixed. This filter sees only the
    // tiny disagreement between slow neighbouring grid cells. Smooth gates
    // turn it off for waves, impacts, streams, and spray; even the calmer end
    // therefore keeps the deliberate splash that makes the toy worth poking.
    liquidWGPU.setSimParam('CALM', 0);
    liquidWGPU.setSimParam('GRID_VISC', 0);
    liquidWGPU.setSimParam('DAMPING', 1);
    liquidWGPU.setSimParam('WATER_MOTION_SCALE', 1);
    liquidWGPU.setSimParam('AIR_DRAG', 0.996);
    liquidWGPU.setSimParam('QUIET_VISC', 0.04 - 0.024 * t);
    liquidWGPU.setSimParam('QUIET_SPEED', 42 - 14 * t);
    liquidWGPU.setSimParam('QUIET_SHEAR', 14 - 5 * t);
    liquidWGPU.setSimParam('QUIET_SUPPORT', 3);
  }

  function applyParticleDebug() {
    if (liquidWGPU && liquidWGPU.setRenderParam) {
      liquidWGPU.setRenderParam('DBG_PARTICLES', debugParticles ? 1 : 0);
    }
  }

  function syncParticleUI() {
    var btn = document.getElementById('toy-particles');
    if (!btn) return;
    btn.classList.toggle('is-on', debugParticles);
    btn.setAttribute('aria-pressed', debugParticles ? 'true' : 'false');
  }

  function setParticleDebug(on) {
    debugParticles = !!on;
    applyParticleDebug();
    syncParticleUI();
  }

  var gravInput = null, timeInput = null, brushInput = null, flowInput = null;
  function syncSliderUI() {
    if (gravInput) gravInput.value = String(Math.round(gravMul * 100));
    if (timeInput) timeInput.value = String(Math.round(timeMul * 100));
    if (brushInput) brushInput.value = String(brushR);
    if (flowInput) {
      flowInput.value = String(Math.round(waterFeel * 100));
      flowInput.setAttribute('aria-valuetext', waterFeelName(waterFeel));
    }
    var gv = document.getElementById('toy-grav-val');
    var tv = document.getElementById('toy-time-val');
    var bv = document.getElementById('toy-brush-val');
    var fv = document.getElementById('toy-flow-val');
    if (gv) gv.textContent = gravMul === 0 ? 'zero-g' : gravMul.toFixed(2) + 'g';
    if (tv) tv.textContent = Math.round(timeMul * 100) + '%';
    if (bv) bv.textContent = Math.round(brushR) + 'px';
    if (fv) fv.textContent = waterFeelName(waterFeel);
  }

  function wireUI() {
    var btns = document.querySelectorAll('#toy-bar [data-tool]');
    for (var i = 0; i < btns.length; i++) {
      toolButtons.push(btns[i]);
      (function (b) {
        b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
      })(btns[i]);
    }
    var chips = document.querySelectorAll('#toy-bar [data-scene]');
    for (var j = 0; j < chips.length; j++) {
      (function (c) {
        c.addEventListener('click', function () { scene(c.getAttribute('data-scene')); });
      })(chips[j]);
    }
    var clearBtn = document.getElementById('toy-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () { scene('blank'); });
    gravInput = document.getElementById('toy-grav');
    timeInput = document.getElementById('toy-time');
    brushInput = document.getElementById('toy-brush');
    flowInput = document.getElementById('toy-flow');
    var particlesBtn = document.getElementById('toy-particles');
    if (particlesBtn) particlesBtn.addEventListener('click', function () {
      setParticleDebug(!debugParticles);
    });
    if (gravInput) gravInput.addEventListener('input', function () {
      gravMul = Math.max(0, Math.min(2, (+gravInput.value || 0) / 100));
      applyGravity(); syncSliderUI();
    });
    if (timeInput) timeInput.addEventListener('input', function () {
      timeMul = Math.max(0.05, Math.min(1, (+timeInput.value || 100) / 100));
      applyTimescale(); syncSliderUI();
    });
    if (brushInput) brushInput.addEventListener('input', function () {
      brushR = Math.max(8, Math.min(44, +brushInput.value || 16));
      syncSliderUI();
    });
    if (flowInput) flowInput.addEventListener('input', function () {
      waterFeel = Math.max(0, Math.min(1, (+flowInput.value || 0) / 100));
      applyWaterFeel(); syncSliderUI();
    });
    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var map = { '1': 'draw', '2': 'erase', '3': 'water', '4': 'smoke', '5': 'slime', '6': 'poke' };
      if (map[e.key]) setTool(map[e.key]);
    });
    setTool('draw');
    syncParticleUI();
    syncSliderUI();
  }

  function setSceneChip(name) {
    var chips = document.querySelectorAll('#toy-bar [data-scene]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-on', chips[i].getAttribute('data-scene') === name);
    }
  }

  /* ==== SCENES ==========================================================
   * The boot scene has to be alive before the first click: a trickle
   * cascading down two shelves into a lock that overtops into the pool,
   * smoke curling around a shelf lip, slimes parked where the water
   * is not (water passes through gel unless it is dense enough to melt
   * it, so the layout keeps them honest). ==== */
  var emitters = [];      // {kind:'water'|'smoke', x, y, vx, vy, rate, acc}
  var POUR_CAP = Math.floor(LIQUID_MAX_PARTICLES * 0.78);
  var currentScene = 'falls';

  function wallRect(x0, y0, x1, y1) {
    var r0 = Math.max(0, Math.round(y0 / TILE));
    var r1 = Math.min(gridH - 1, Math.round(y1 / TILE) - 1);
    var c0 = Math.max(0, Math.round(x0 / TILE));
    var c1 = Math.min(gridW - 1, Math.round(x1 / TILE) - 1);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) walls[r * gridW + c] = 1;
    }
    wallsVersion++;
  }

  function wallDisc(cx, cy, rad) {
    var r0 = Math.max(0, Math.floor((cy - rad) / TILE));
    var r1 = Math.min(gridH - 1, Math.floor((cy + rad) / TILE));
    var c0 = Math.max(0, Math.floor((cx - rad) / TILE));
    var c1 = Math.min(gridW - 1, Math.floor((cx + rad) / TILE));
    for (var r = r0; r <= r1; r++) {
      var y = (r + 0.5) * TILE;
      for (var c = c0; c <= c1; c++) {
        var x = (c + 0.5) * TILE;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) walls[r * gridW + c] = 1;
      }
    }
    wallsVersion++;
  }

  function clearWorldAll() {
    walls.fill(0);
    addBorder();
    clearLiquid();
    resetJello();
    jelloGrabEnd();
    pokeGuest = null;
    emitters.length = 0;
    if (smokeActive) {
      try { SmokeFluid.clear(); SmokeFluid.displayPass(); } catch (e) {}
    }
    smokeAwakeT = 0;
    smokeWasAwake = false;
  }

  function setGravityUI(g) { gravMul = g; applyGravity(); syncSliderUI(); }

  function emittersTick(dt) {
    for (var i = 0; i < emitters.length; i++) {
      var em = emitters[i];
      if (em.kind === 'water') {
        if (waterState !== 'on' || liquidCount > (em.cap || POUR_CAP)) continue;
        em.acc = (em.acc || 0) + em.rate * dt;
        // Burst cadence, not per-frame: the GPU module's CPU-mirror readback
        // discards itself whenever a mutation lands mid-flight, so a
        // continuous per-frame pour would starve the mirror forever (and the
        // slime DISSOLVE counts water from that mirror). Every 6th frame
        // leaves readback-sized quiet gaps and reads as spring gulps.
        if (toyFrameNo % 6 !== 0) continue;
        var n = em.acc | 0;
        if (n > 0) {
          em.acc -= n;
          if (n > 60) n = 60;
          spawnWaterJet(em.x, em.y, 5, em.vx || 0, (em.vy || 120) * Math.max(0.15, gravMul), n);
        }
      } else if (em.kind === 'smoke') {
        if (!smokeActive) continue;
        // Distinct rising puffs on a slow clock instead of a per-frame
        // stream: a fixed vent that splats every frame stacks dye on the
        // same texels until the core clips to white. A burst every half
        // second reads as breathing smoke and keeps the field in range.
        em.t = (em.t || 0) + dt;
        var period = 0.52 + 0.13 * Math.sin((em.phase || 0) * 5.1);
        if (em.t < period) continue;
        em.t = 0;
        // Velocity units are texels/second (the advection shader multiplies
        // by dt * texelSize), so a visible puff wants dv in the hundreds —
        // Pavel's own mouse splats run 50-600. +dy is up-screen here.
        var sway = Math.sin(performance.now() * 0.00093 + (em.phase || 0) * 3.7) * 34;
        var lift = (0.25 + 0.75 * gravMul) * (95 + Math.random() * 50) * (em.liftK || 1);
        var jx = (Math.random() - 0.5) * 26;
        // Light warm-gray dye: the game's near-black diesel smoke is tuned
        // for a bright sky; on this dark box smoke has to ADD light. Spa
        // steam overrides the color cooler and the lift lazier via em.col
        // and em.liftK.
        var dye = em.col || { r: 0.40, g: 0.38, b: 0.35 };
        smokePuff(em.x, em.y, sway + jx, lift, { r: 0, g: 0, b: 0 }, 0.02);
        smokePuff(em.x, em.y - 6, (sway + jx) * 0.5, lift * 0.55, dye, 0.018);
      }
    }
  }

  function drawEmitterFixtures() {
    for (var i = 0; i < emitters.length; i++) {
      var em = emitters[i];
      if (em.kind === 'water') {
        // A pipe hanging from the lid down to the nozzle mouth.
        ctx.fillStyle = '#39423a';
        ctx.fillRect(em.x - 5, 0, 10, em.y - 6);
        ctx.fillStyle = '#4a544b';
        ctx.fillRect(em.x - 5, 0, 2.5, em.y - 6);
        ctx.fillStyle = '#39423a';
        ctx.fillRect(em.x - 9, em.y - 12, 18, 8);
        ctx.fillStyle = '#5d6a5e';
        ctx.fillRect(em.x - 9, em.y - 12, 18, 1.6);
        ctx.fillStyle = '#141a16';
        ctx.fillRect(em.x - 4, em.y - 5, 8, 4);
      } else {
        // A squat stone vent with a dark mouth.
        ctx.fillStyle = '#454f46';
        ctx.fillRect(em.x - 9, em.y - 3, 18, 9);
        ctx.fillStyle = '#5d6a5e';
        ctx.fillRect(em.x - 9, em.y - 3, 18, 1.6);
        ctx.fillStyle = '#141a16';
        ctx.fillRect(em.x - 4, em.y - 6, 8, 5);
      }
    }
  }

  function scene(name) {
    currentScene = name;
    clearWorldAll();
    var W = worldW, H = worldH;
    if (name === 'blank') {
      setSceneChip('blank');
      return;
    }
    if (name === 'zerog') {
      setGravityUI(0);
      wallDisc(W * 0.28, H * 0.36, Math.min(W, H) * 0.055);
      wallDisc(W * 0.70, H * 0.56, Math.min(W, H) * 0.075);
      wallDisc(W * 0.48, H * 0.78, Math.min(W, H) * 0.045);
      var s1 = spawnSlimeAt(W * 0.18, H * 0.62, 26);
      var s2 = spawnSlimeAt(W * 0.55, H * 0.24, 32);
      var s3 = spawnSlimeAt(W * 0.82, H * 0.30, 22);
      var drift = [[0.9, 0.35], [-0.7, 0.5], [-0.4, -0.65]];
      var bodies = [s1, s2, s3];
      for (var bi = 0; bi < bodies.length; bi++) {
        var b = bodies[bi];
        if (!b) continue;
        for (var p = 0; p < b.n; p++) {
          b.ox[p] = b.px[p] - drift[bi][0];
          b.oy[p] = b.py[p] - drift[bi][1];
        }
      }
      fillPoolRect(W * 0.13, H * 0.16, W * 0.13 + 64, H * 0.16 + 64);
      smokePuff(W * 0.62, H * 0.72, 34, 16, { r: 0.4, g: 0.38, b: 0.35 }, 0.02);
      smokePuff(W * 0.30, H * 0.20, -26, -14, { r: 0.4, g: 0.38, b: 0.35 }, 0.02);
      setSceneChip('zerog');
      return;
    }
    setGravityUI(1);
    if (name === 'chimney') {
      wallRect(0, H * 0.70, W * 0.60, H * 0.70 + TILE * 2);
      wallRect(W * 0.40, H * 0.47, W, H * 0.47 + TILE * 2);
      wallRect(0, H * 0.24, W * 0.60, H * 0.24 + TILE * 2);
      spawnSlimeAt(W * 0.30, H * 0.70 - 32, 30);
      spawnSlimeAt(W * 0.52, H * 0.47 - 28, 26);
      emitters.push({ kind: 'smoke', x: W * 0.22, y: H - TILE * 1.6, phase: 0 });
      emitters.push({ kind: 'smoke', x: W * 0.52, y: H - TILE * 1.6, phase: 2.1 });
      emitters.push({ kind: 'smoke', x: W * 0.80, y: H - TILE * 1.6, phase: 4.4 });
      setSceneChip('chimney');
      return;
    }
    if (name === 'spa') {
      // A wide soaking tub: slimes bob at the line like the game's banya
      // guests, a spring drips from above, steam vents sit on the rims.
      wallRect(W * 0.20, H * 0.44, W * 0.20 + TILE * 2, H);
      wallRect(W * 0.80 - TILE * 2, H * 0.44, W * 0.80, H);
      fillPoolRect(W * 0.20 + TILE * 2.5, H * 0.72, W * 0.80 - TILE * 2.5, H - TILE * 1.5);
      // URL-only regression pose: three intersecting silhouettes reproduce
      // the old fill-and-snap bug without a timing-sensitive pointer drag.
      // Normal visitors keep the wider spa composition.
      var overlapTest = /[?&]guestoverlap=1(?:&|$)/.test(
        (window.location && window.location.search) || '');
      spawnSlimeAt(W * (overlapTest ? 0.43 : 0.36), H * 0.675, 28);
      spawnSlimeAt(W * (overlapTest ? 0.48 : 0.47), H * 0.66, 32);
      spawnSlimeAt(W * (overlapTest ? 0.535 : 0.64), H * 0.675, 26);
      emitters.push({ kind: 'water', x: W * 0.56, y: H * 0.07, vx: 0, vy: 130, rate: 240, acc: 0, cap: 84000 });
      var steam = { r: 0.32, g: 0.32, b: 0.31 };
      emitters.push({ kind: 'smoke', x: W * 0.205 + TILE, y: H * 0.44 - 4, phase: 0, col: steam, liftK: 0.62 });
      emitters.push({ kind: 'smoke', x: W * 0.795 - TILE, y: H * 0.44 - 4, phase: 2.6, col: steam, liftK: 0.62 });
      setSceneChip('spa');
      return;
    }
    // ---- 'falls' (the boot scene) ----
    // Shelf A starts AT the left wall so the trickle can only spill right;
    // shelf B then brims and cascades again. Every slime sits on ground the
    // water can never flood (deep water MELTS a slime; that discovery
    // belongs to the visitor, not the idle scene), and the pour caps out
    // once the terraces are full so the long-idle end state is glassy.
    wallRect(0, H * 0.32, W * 0.40, H * 0.32 + TILE * 2);
    wallRect(W * 0.30, H * 0.55, W * 0.62, H * 0.55 + TILE * 2);
    wallRect(W * 0.66, H * 0.76, W * 0.66 + TILE * 2, H);
    wallRect(W * 0.87, H * 0.56, W, H * 0.56 + TILE * 2);          // dry perch, right wall
    wallRect(0, H * 0.88, W * 0.21, H * 0.88 + TILE * 2);          // dry pedestal, floor left
    fillPoolRect(W * 0.66 + TILE * 2.5, H * 0.80, W - TILE * 1.5, H - TILE * 1.5);
    var srk = W < 560 ? 0.78 : 1;      // narrow worlds get smaller, spread slimes
    spawnSlimeAt(W * 0.935, H * 0.56 - 28 * srk, 26 * srk);
    spawnSlimeAt(W * 0.055, H * 0.88 - 26 * srk, 24 * srk);
    spawnSlimeAt(W * 0.158, H * 0.88 - 32 * srk, 30 * srk);
    spawnSlimeAt(W * 0.84, H * 0.76, 26 * srk);   // in the pool: bobs at the line on boot
    emitters.push({ kind: 'water', x: W * 0.165, y: H * 0.05, vx: 24, vy: 130, rate: 300, acc: 0, cap: 40000 });
    // The vent stands on the pool lip: open column above, never flooded.
    emitters.push({ kind: 'smoke', x: W * 0.672, y: H * 0.755, phase: 0 });
    setSceneChip('falls');
  }

  /* ==== LOOP + BOOT =====================================================
   * Update order mirrors the game: tools -> emitters -> water -> slimes ->
   * smoke -> draw. The loop parks itself when the toy scrolls off screen
   * or the tab hides; a reader in the prose costs nothing. ==== */
  var rafId = 0;
  var lastT = 0;
  var toyFrameNo = 0;
  var fpsEMA = 60;
  var visibleFrac = 1;
  var readoutEl = null;
  var readoutTick = 0;

  function drawCursor() {
    if (!pointerIn && !pointerDown) return;
    if (isMobile && !pointerDown) return;
    var r = tool === 'slime' ? slimeRadius() : brushR;
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(232,226,214,0.55)';
    if (slimeGhost) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(158,199,154,0.8)';
      ctx.beginPath();
      ctx.arc(slimeGhost.x, slimeGhost.y, slimeRadius(), 0, 6.2832);
      ctx.stroke();
    } else if (tool !== 'poke') {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 6.2832);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, 6.2832);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The public canvas never draws solver points, springs, topology, or grab
  // targets. Numerical surface-carry state remains available to the harness.

  function render() {
    bakeWalls();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, worldW, worldH);
    ctx.drawImage(wallsCanvas, 0, 0, wallsCanvas.width, wallsCanvas.height, 0, 0, worldW, worldH);
    drawEmitterFixtures();
    drawJelloBlobs();
    drawCursor();
    drawLiquidToy();
  }

  function updateReadout() {
    if (!readoutEl) return;
    var backend = waterState === 'on' ? 'WebGPU'
                : waterState === 'booting' ? 'WebGPU…'
                : 'no WebGPU';
    var parts = [];
    if (waterState !== 'off') parts.push(liquidCount.toLocaleString('en-US') + ' water');
    parts.push(jelloBodies.length + (jelloBodies.length === 1 ? ' slime' : ' slimes'));
    parts.push(Math.round(fpsEMA) + ' fps');
    parts.push(backend);
    parts.push(TOY_VERSION);
    readoutEl.textContent = parts.join(' · ');
    // Headless/browser probe for the water-to-smoke handoff. Kept out of
    // the visible readout so the toy stays compact.
    readoutEl.setAttribute('data-smoke-water-flow-splats', String(smokeWaterFlowSplats));
    readoutEl.setAttribute('data-pointer-down', pointerDown ? 'true' : 'false');
    readoutEl.setAttribute('data-pointer-x', px.toFixed(2));
    readoutEl.setAttribute('data-pointer-y', py.toFixed(2));
    readoutEl.setAttribute('data-slime-centers', jelloBodies.slice(0, 8).map(function (b) {
      return b.cx.toFixed(2) + ',' + b.cy.toFixed(2);
    }).join(';'));
    readoutEl.setAttribute('data-slime-velocities', jelloBodies.slice(0, 8).map(function (b) {
      return ((b.vx || 0) * JELLO_TIMESCALE).toFixed(2) + ',' +
        ((b.vy || 0) * JELLO_TIMESCALE).toFixed(2);
    }).join(';'));
    readoutEl.setAttribute('data-actor-active', String(jelloBodies.reduce(function (count, b) {
      return count + (b.actor && b.actor.enabled ? 1 : 0);
    }, 0)));
    readoutEl.setAttribute('data-launch-active', String(jelloBodies.reduce(function (count, b) {
      return count + (b._launchVMax > JELLO_VMAX ? 1 : 0);
    }, 0)));
    var carryData = window.__slimeGrab ? window.__slimeGrab() : null;
    readoutEl.setAttribute('data-grab-active', carryData && carryData.active ? 'true' : 'false');
    readoutEl.setAttribute('data-grab-mode', carryData ? carryData.mode : 'free');
    readoutEl.setAttribute('data-grab-cursor-gap', carryData ? carryData.gap.toFixed(3) : '0');
    readoutEl.setAttribute('data-grab-anchor-error', carryData ? carryData.anchorError.toFixed(3) : '0');
    readoutEl.setAttribute('data-grab-release-speed', carryData
      ? (carryData.active
        ? Math.hypot(carryData.releaseVX, carryData.releaseVY)
        : carryData.lastReleaseSpeed).toFixed(2) : '0');
    readoutEl.setAttribute('data-grab-launch-speed', carryData
      ? carryData.lastLaunchSpeed.toFixed(2) : '0');
    readoutEl.setAttribute('data-grab-launch-spin', carryData
      ? carryData.lastLaunchSpin.toFixed(3) : '0');
    readoutEl.setAttribute('data-grab-travel', carryData ? carryData.sessionTravel.toFixed(2) : '0');
    readoutEl.setAttribute('data-grab-max-anchor-error', carryData
      ? carryData.maxAnchorError.toFixed(4) : '0');
  }

  function frame(tNow) {
    rafId = requestAnimationFrame(frame);
    var dt = lastT ? (tNow - lastT) / 1000 : 1 / 60;
    lastT = tNow;
    toyFrameNo++;
    if (dt > 0.05) dt = 0.05;
    if (dt > 0) fpsEMA = fpsEMA * 0.95 + (1 / dt) * 0.05;

    toolTick(dt);
    emittersTick(dt);
    retireLiquidOrphans();
    updateLiquidToy(dt);
    buildWaterCells();
    jelloWaterCoupleTick(dt);
    if (toyFrameNo % 30 === 0) wakeSleepersOnBodies();   // sparse: every WAKE op
      // bumps the mutation seq, and a seq moving every 4th frame starves the
      // GPU->CPU mirror (readbacks discard on any in-flight mutation). The
      // stale mirror then re-reports the same particles sleeping forever, a
      // deadlock that also froze the coupling's surface + flow data. At 30
      // frames the worst frozen-droplet latency is a quarter second and the
      // mirror breathes between sweeps.
    updateJello(dt);
    if (window.__cdb && window.__cdb.length && jelloBodies.length) {
      var dbgB = jelloBodies[0];
      var dbgE = window.__cdb[window.__cdb.length - 1];
      if (dbgE && dbgE.vyPost === undefined) {
        var dvs = 0;
        for (var dpi = 0; dpi < dbgB.n; dpi++) dvs += (dbgB.py[dpi] - dbgB.oy[dpi]);
        dbgE.vyPost = dvs / dbgB.n * (JELLO_TIMESCALE / JELLO_H);
        dbgE.cyPost = dbgB.cy;
      }
    }
    smokeFrame(dt);
    render();

    readoutTick++;
    if (readoutTick >= 15) { readoutTick = 0; updateReadout(); }
  }

  function startLoop() {
    if (rafId) return;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function syncRunning() {
    if (document.hidden || visibleFrac < 0.06) stopLoop();
    else startLoop();
  }

  document.addEventListener('visibilitychange', syncRunning);
  if (typeof IntersectionObserver !== 'undefined') {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) visibleFrac = entries[i].intersectionRatio;
      syncRunning();
    }, { threshold: [0, 0.06, 0.5] });
    io.observe(stage);
  }

  function onEnginesSettled() {
    var chip = document.getElementById('toy-nowater');
    if (chip) chip.hidden = waterState !== 'off';
    var wbtn = document.querySelector('#toy-bar [data-tool="water"]');
    if (wbtn && waterState === 'off') wbtn.classList.add('is-dead');
    var pbtn = document.getElementById('toy-particles');
    if (pbtn) {
      pbtn.disabled = waterState === 'off';
      pbtn.classList.toggle('is-dead', waterState === 'off');
    }
    if (flowInput) flowInput.disabled = waterState === 'off';
    updateReadout();
  }

  // ---- Boot ------------------------------------------------------------
  function boot() {
    readoutEl = document.getElementById('toy-readout');
    var webgl = false;
    try {
      var probe = document.createElement('canvas');
      webgl = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
    } catch (e) {}
    if (!webgl && !(navigator.gpu && window.isSecureContext)) {
      var fb = document.getElementById('toy-fallback');
      if (fb) fb.hidden = false;
      var bar = document.getElementById('toy-bar');
      if (bar) bar.style.display = 'none';
      return;
    }
    addBorder();
    bootLiquid();
    bootSmoke();
    wireUI();
    scene('falls');
    // Opt-in browser probe for the public actor-intent seam. It deliberately
    // speaks only in whole-body motion and pose, never solver topology.
    if (location.search.indexOf('actortest=1') >= 0 && jelloBodies[2]) {
      jelloSetActorIntent(jelloBodies[2], {
        moveX: 1, speed: 150, accel: 1100,
        poseX: 1.12, poseY: 0.9, poseFollow: 9,
        wobble: 0.07, phaseSpeed: 5, state: 'browser-test'
      });
    }
    if (location.search.indexOf('flingtest=1') >= 0 && jelloBodies[2]) {
      jelloLaunchBody(jelloBodies[2], 520, -420, {
        blend: 0.92, maxSpeed: 1400, maxPointSpeed: 1600, omega: 3.5
      });
    }
    fitStage();
    bakeWalls();
    updateReadout();
    startLoop();
    try {
      console.log('water-smoke-slime ' + TOY_VERSION +
        ' — MLS-MPM water (WebGPU) + XPBD slimes (CPU) + fluid smoke (WebGL), ' +
        'pulled from the Sluice mining game on this site. View source, it is all here.');
    } catch (e) {}
  }

  // Headless-harness + curious-console export.
  try {
    window.__toy = {
      version: TOY_VERSION,
      world: function () { return { w: worldW, h: worldH, tile: TILE, cols: gridW, rows: gridH }; },
      stats: function () {
        return {
          water: liquidCount, slimes: jelloBodies.length, jelloPoints: jelloCount,
          fps: Math.round(fpsEMA), waterState: waterState, smoke: smokeActive,
          awake: liquidWGPU ? liquidWGPU.awakeCount : -1,
          scene: currentScene, tool: tool,
          waterFeel: Math.round(waterFeel * 100), debugParticles: debugParticles
        };
      },
      scene: scene,
      tool: setTool,
      paint: function (x0, y0, x1, y1, rad, solid) { paintWallsSeg(x0, y0, x1, y1, rad, !!solid); },
      water: function (x, y, n, vx, vy) { spawnWaterJet(x, y, 8, vx || 0, vy || 0, n || 200); },
      slime: spawnSlimeAt,
      puff: function (x, y, dvx, dvy, rad) {
        smokePuff(x, y, dvx || 0, dvy !== undefined ? dvy : -0.02, SMOKE_COL, rad || 0.016);
      },
      wake: pushWake,
      set: function (k, v) {
        if (k === 'gravity') { gravMul = +v; applyGravity(); syncSliderUI(); }
        else if (k === 'time') { timeMul = +v; applyTimescale(); syncSliderUI(); }
        else if (k === 'brush') { brushR = +v; syncSliderUI(); }
        else if (k === 'flow') { waterFeel = Math.max(0, Math.min(1, +v || 0)); applyWaterFeel(); syncSliderUI(); }
        else if (k === 'particles') { setParticleDebug(!!v); }
      },
      liquid: function () { return liquidWGPU; },
      bodies: function () { return jelloBodies; },
      actor: function (i, intent) {
        var b = jelloBodies[i];
        return b ? jelloSetActorIntent(b, intent) : null;
      },
      fling: function (i, vx, vy, omega) {
        var b = jelloBodies[i];
        return b ? jelloLaunchBody(b, vx, vy, {
          blend: 0.92, maxSpeed: 1400, maxPointSpeed: 1600,
          omega: omega || 0, maxOmega: 7
        }) : null;
      },
      clearActor: function (i) {
        var b = jelloBodies[i];
        if (!b) return false;
        jelloClearActorIntent(b);
        return true;
      },
      smoke: function () {
        return { fluid: SmokeFluid, awake: smokeAwakeT, active: smokeActive,
          waterFlowSplats: smokeWaterFlowSplats };
      },
      poke: function (x, y, vx, vy, R, ms) {
        R = R || 20;
        var pts = new Array(POKE_PTS * 4);
        for (var k = 0; k < POKE_PTS; k++) {
          var a = (k / POKE_PTS) * 6.2831853;
          pts[k * 4] = x + Math.cos(a) * R;
          pts[k * 4 + 1] = y + Math.sin(a) * R;
          pts[k * 4 + 2] = vx || 0;
          pts[k * 4 + 3] = vy || 0;
        }
        pokeGuest = { x: x, y: y, hw: Math.min(34, R), hh: Math.min(34, R), pts: pts };
        wakeLiquidNear(x, y, R + 80);
        setTimeout(function () { pokeGuest = null; }, ms || 400);
      },
      mirror: function (i) { return { x: liquidX[i], y: liquidY[i], sleeping: liquidSleeping[i] }; },
      fling: function (bi2, fvx, fvy) {
        var b = jelloBodies[bi2]; if (!b) return false;
        var ts2 = (typeof JELLO_TIMESCALE === 'number' && JELLO_TIMESCALE >= 0.02) ? JELLO_TIMESCALE : 0.5;
        var kk = JELLO_H / ts2;
        for (var p2 = 0; p2 < b.n; p2++) { b.ox[p2] -= fvx * kk; b.oy[p2] -= fvy * kk; }
        b.sleeping = false; b.sleepFrames = 0;
        return true;
      },
      couple: function (wx, wy) {
        var gx = wx / TILE - 0.5, gy = wy / TILE - 0.5;
        var cc = Math.floor(gx), rr = Math.floor(gy);
        var fx = gx - cc, fy = gy - rr;
        var dSum = 0, mvx = 0, mvy = 0, raw = [];
        for (var s = 0; s < 4; s++) {
          var sc = cc + (s & 1), sr = rr + (s >> 1);
          if (sc < 0 || sc >= gridW || sr < 0 || sr >= gridH) { raw.push(-1); continue; }
          var w = ((s & 1) ? fx : 1 - fx) * ((s >> 1) ? fy : 1 - fy);
          var idx = sr * gridW + sc;
          raw.push(waterCellCount[idx]);
          dSum += w * waterCellCount[idx];
          mvx += w * waterCellVX[idx]; mvy += w * waterCellVY[idx];
        }
        var phiD = Math.min(1, dSum / (WATER_CELL_REST * 0.85));
        var col = Math.max(0, Math.min(gridW - 1, (wx / TILE) | 0));
        var surfY = waterColSurf[col];
        var phiG = surfY < Infinity ? Math.max(0, Math.min(1, (wy - surfY) / (TILE * 1.2))) : 0;
        return { dSum: dSum, phiD: phiD, phiG: phiG, surfY: surfY === Infinity ? -1 : surfY, raw: raw,
                 vw: dSum > 0 ? [mvx / dSum, mvy / dSum] : [0, 0],
                 ts: JELLO_TIMESCALE, h: JELLO_H, g: JELLO_GRAVITY,
                 subs: (typeof jelloLastSubs !== 'undefined' ? jelloLastSubs : -1) };
      }
    };
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
