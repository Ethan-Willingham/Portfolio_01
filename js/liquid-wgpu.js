/* ============================================================
 * liquid-wgpu.js — WebGPU compute port of the APIC/MLS-MPM fluid
 * ------------------------------------------------------------
 * Goal: run the liquid solver that currently lives in
 * sluice.js (the `liquid*` APIC sim — P2G / grid /
 * G2P) as WebGPU compute shaders, with all particle state in
 * GPU storage buffers and zero CPU readback on the hot path.
 *
 * The CPU solver in sluice.js stays as-is and remains
 * the fallback for browsers without WebGPU (or if device init
 * fails) — exactly like the existing liquidGL -> 2d-canvas
 * fallback.
 *
 * Integration contract: the game holds one instance
 *   liquidWGPU = LiquidWGPU.create(opts)
 * and updateLiquids() / drawLiquids() delegate to it ONLY when
 * instance.simActive / instance.renderActive are true. Until the
 * port is complete those stay false, so the game runs the CPU
 * solver completely unchanged. create() never throws.
 *
 * Staged port — each stage keeps the game playable via the
 * CPU fallback; simActive/renderActive flip on at the end:
 *   Stage 0  done .. device init + fallback routing.
 *   Stage 1  done .. GPU storage buffers for particle state,
 *                    CPU->GPU upload, debug readback + a
 *                    round-trip self-test. Sim still on CPU.
 *   Stage 2  done .. GPU spatial grid: a parallel prefix-sum
 *                    count-sort (clearCells / countCells /
 *                    prefixSum / scatter) building cellStart +
 *                    sortedIdx for the later P2G/G2P walks.
 *                    Sim still on CPU.
 *   Stage 3  done .. P2G compute kernel: one thread per particle
 *                    splats mass / APIC momentum / oil-mass /
 *                    aeration into its 3x3 quadratic-B-spline
 *                    stencil. Fixed-point i32 atomics stand in
 *                    for the float atomics WGSL lacks. Sim still
 *                    on CPU.
 *   Stage 4  done .. grid pressure + grid update kernels. The
 *                    pressure kernel re-derives each awake
 *                    particle's 3x3 stencil, gathers density /
 *                    aeration, and scatters the weakly-
 *                    compressible pressure impulse into two new
 *                    fixed-point cellDVX/cellDVY accumulators.
 *                    The grid-update kernel resolves per-cell
 *                    velocity from momentum + pressure impulse
 *                    and adds (oil-lerped) gravity into the new
 *                    plain cellVelX/cellVelY buffers. Tile-
 *                    boundary bounce/friction + player/rocket/
 *                    explosion wakes are deferred. Sim still on
 *                    CPU.
 *   Stage 5  done .. G2P compute kernel — one thread per particle
 *                    GATHERs the resolved cell velocity over its
 *                    3x3 stencil, rebuilds the APIC affine matrix,
 *                    advances aeration, clamps the new position to
 *                    world bounds, and runs the sleep/wake
 *                    tracking. Terrain collision is deferred.
 *                    Completes the core MPM step (P2G -> pressure
 *                    -> grid -> G2P). Sim still on CPU.
 *   Stage 6  done .. GPU terrain collision — a port of the CPU
 *                    liquidMoveParticle. Each frame the game fills a
 *                    1-bit-per-tile solidity mask for the live-
 *                    particle tile bbox (via the fillTerrainSolid
 *                    hook); the module packs + uploads it. A collide
 *                    kernel runs after g2p: one thread per particle
 *                    samples the mask, and on a hit rolls the
 *                    particle back to its pre-step position, reflects
 *                    velocity and tries 8 nudge directions, then
 *                    clamps to world bounds. Terrain-only — the
 *                    dynamic miner-silhouette collision stays a
 *                    Stage-8 game-bridge concern. Sim still on CPU.
 *   Stage 7  done .. liquidWGPUCanvas + render-from-buffer. A new
 *                    <canvas> with a webgpu context (sibling of the
 *                    main game canvas, z-index 4 — replaces the CPU
 *                    renderer's liquidGLCanvas) plus an instanced
 *                    soft-disc render pipeline that reads buf.pos /
 *                    buf.aux / buf.flag straight as storage buffers
 *                    in the vertex shader — zero CPU readback. The
 *                    draw(view) method writes the camera to a render
 *                    uniform and runs one render pass.
 *   Stage 8  HERE .. flip simActive/renderActive on + bridge the
 *                    game-coupled layers. instance.update(dt) runs the
 *                    full GPU per-frame chain; the flags flip true once
 *                    every pipeline is built (and stay false / revert on
 *                    any WebGPU absence or runtime fault — the CPU solver
 *                    is the fallback). The public liquid API is bridged
 *                    by a per-frame upload + an async GPU->CPU readback
 *                    mirror, so addLiquidParticle / removeLiquidParticle /
 *                    liquidCount / world-gen presettle keep working. The
 *                    game-coupled forces — the player/rocket/explosion
 *                    grid wakes + the miner-silhouette collision — are
 *                    ported into the grid-update + collide kernels via a
 *                    GameParams uniform; oil suction stays the CPU hook
 *                    (it owns particle removal + oilGallons).
 *
 *   STABILITY (v24.169-186) — the giant-particle / runaway fix.
 *   The clamped weakly-compressible EOS is a limit-cycle oscillator far
 *   from rest; under hard stress (jetting at terrain, deep columns)
 *   particles collapse into over-dense knots it turns into a perpetual
 *   bounce engine ("infinite energetic mass / giants that never shrink").
 *   Velocity damping/viscosity only MASK it. The cure, layered:
 *     - LIQUID_DENS_CAP (v24.182, edit2): clamp the density the pressure
 *       kernel sees, so a knot's impulse is bounded (a jet knot hit dn 406
 *       = a ~2000 impulse; the cap is invisible to real water at <~4x rest).
 *     - WGSL_DECLUMP (v24.185): a per-substep PBD/FleX min-separation pass
 *       (runDeclump, after buildGrid) that pushes over-dense neighbours
 *       apart so the over-packing can't PERSIST. Gated to over-dense
 *       particles only; dormant on a calm pond. gm water.DECLUMP.
 *     - v24.186 TERRAIN CLAMP: the declump push is clamped per-axis at the
 *       leading edge against the collide kernel's terrainMask, so a
 *       wall-packed knot spreads ALONG the wall, never INTO it.
 *   See TUNING.md §2.10. The harness can't reproduce the dug-cavern
 *   runaway; efficacy is owner-verified via the dev X water overlay.
 *
 *   v15.0 — SPARSE ACTIVE-BLOCK GRID (the big-grid perf rewrite).
 *   Every cell-space pass used to run over the whole particle-bbox grid
 *   (up to 2^21 cells) every sub-step; the whole grid pipeline is now
 *   GPU-driven sparse: 16x16-cell blocks, a bitmap marked from the
 *   particle stencils, a single-workgroup compaction that writes the
 *   indirect-dispatch args, every cell kernel dispatched indirectly over
 *   ACTIVE blocks only, all per-sub-step full-grid clears replaced by a
 *   global-zero invariant + a tiny indirect end-of-sub-step clear, and
 *   the cellStart->cellCursor full-grid copy retired. Zero CPU readback;
 *   cost scales with wet area instead of bounding-box area. The dense
 *   chain is kept behind the live water.SPARSE lever (A/B + fallback for
 *   devices under 10 storage buffers/stage). See the v15.0 banner above
 *   BLOCK_W for the invariant details.
 *
 * The GPU path is now LIVE when WebGPU is available.
 * ============================================================ */
(function () {
  'use strict';

  var STAGE = 8;

  /* ---- Stage 4 — fluid-feel constants --------------------------------
   * Mirror the CPU liquid tunables in sluice.js the pressure +
   * grid-update kernels read. Kept here as plain JS numbers so the
   * Stage-4 CPU reference and the WGSL template (which interpolates the
   * literals) draw from one source. Values must track the CPU side; if
   * they drift, the self-test diff catches it.
   * -------------------------------------------------------------------- */
  var LIQUID_PDELTA            = 0.5;
  var LIQUID_DENSITY           = 1 / (LIQUID_PDELTA * LIQUID_PDELTA);  // 4
  // v24.182 — density blow-up cap (edit2 sluice 010-constants). Clamps the
  // gathered density the pressure kernel sees so a collapsed knot can't reach
  // dn=406 and become a perpetual bounce engine. 6x rest is far above any real
  // water (calm ~1.6, stressed field ~2.3) but well below the runaway. Baked as
  // a literal into the WGSL pressure kernel + both fr() references below.
  var LIQUID_DENS_CAP          = 6 * LIQUID_DENSITY;  // = 24
  // v24.185 — MIN-SEPARATION (anti-clump), the general "particles can't get
  // stuck over-pressured" fix. A particle can never pack tighter than DECLUMP_DMIN
  // world px: over-dense particles (a knot) are pushed apart from over-close
  // neighbours each substep (Jacobi positional separation via the count-sort
  // grid), so an over-pressured knot physically can't form or persist, no matter
  // how it got over-pressured (jet, terrain, anything). Only runs for particles
  // above DECLUMP_OVERDENSE for cost (normal water never enters the loop). edit2
  // sluice 010-constants (CPU fallback).
  var LIQUID_DECLUMP_ON        = 1;                    // master on/off (gm water.DECLUMP; skips the dispatch when 0)
  var LIQUID_DECLUMP_DMIN      = 1.1;                  // world px (rest spacing PDELTA*CELL = 1.25)
  var LIQUID_DECLUMP_STRENGTH  = 0.4;                  // 0..1 positional relaxation / substep
  var LIQUID_DECLUMP_OVERDENSE = 1.6 * LIQUID_DENSITY; // only de-clump above ~dn 1.6
  var LIQUID_GRAVITY = 250;
  var LIQUID_OIL_GRAVITY       = 600;
  var LIQUID_PRESSURE_STIFF    = 5;     // v24.10 — saharan's exact EOS stiffness (his is `(d/4-1)*5`). v24.8's 20 splashed; REVERTED. Deep-water "popcorn" is fixed by SUBSTEPPING (below), not stiffness. edit² with 010-constants.js.
  var LIQUID_OIL_PRESSURE_STIFF = 2.5;
  // Substepping (v24.10) — the deep-water fix, ported from saharan's Water demo.
  // Equilibrium column compression scales as stepDt² (gravity is dt²-scaled but
  // the pressure scatter is per-step / dt=1, so at the full frame dt a deep
  // column over-compresses ~25× and detonates into "popcorn"). Running the
  // kernel chain N small substeps per frame shrinks stepDt → compression drops
  // ∝ stepDt² while the real fall speed (ΔV/frame = GRAVITY·dt) is unchanged.
  // N = clamp(ceil(dt / LIQUID_SUBSTEP_DT), 1, LIQUID_MAX_SUBSTEPS). edit² with 010-constants.js.
  var LIQUID_SUBSTEP_DT        = 1 / 120;
  var LIQUID_MAX_SUBSTEPS      = 5;
  // v24.124 FIXED-QUANTUM SUBSTEPPING — see the rationale at the
  // 010-constants twin: the old ceil-split put 60/120 Hz exactly on a
  // substep-count boundary, so frame jitter swung stepDt (rest compression
  // ∝ stepDt²) and pumped body-wide pressure pops on 120 Hz machines.
  // Advance in exact LIQUID_SUBSTEP_DT quanta instead, banking the
  // remainder; stepDt is then a true constant. Live toggle via
  // setSimParam('FIXED_STEP') (gm lever water.FIXED_STEP; 0 = legacy).
  var LIQUID_FIXED_STEP = 1;
  var liquidStepAcc = 0;                // banked sub-quantum remainder, SIM seconds
  // v25.29 — WATER TIMESCALE (the slo-mo fix; full rationale at the
  // 010-constants twin). runFrame banks dt x TIMESCALE into the accumulator:
  // more 1/120 substeps per wall second, per-substep physics untouched (the
  // identical trajectory, fast-forwarded, so the v24.169 calm survives).
  // Wall-clock effective gravity = TIMESCALE² x 250 = 600.6 ≈ the game's
  // world GRAVITY (600). Live via setSimParam('TIMESCALE') (gm
  // water.TIMESCALE). 1 = the old slo-mo.
  var LIQUID_TIMESCALE = 1.55;
  var LIQUID_AERATION_BLUR     = 0.01;
  var LIQUID_AERATION_DAMP     = 0.988;
  var LIQUID_OIL_AERATION_BLUR = 0.008;
  var LIQUID_OIL_AERATION_DAMP = 0.988;

  /* ---- Stage 4b — grid-boundary constants (v14.3) --------------------
   * The CPU liquidUpdateGrid ends with a tile-boundary reflection +
   * floor/wall friction pass on the resolved cell velocity — the drag
   * its own comment credits with stopping the "shoot-along-the-surface"
   * jet pressure scatter creates on flat floors. The v14.0 port shipped
   * gridUpdate without it; v14.3 ports it as the gridBoundary kernel.
   * These mirror the CPU literals it reads.
   * -------------------------------------------------------------------- */
  var LIQUID_WALL_BOUNCE_IN       = 0.075;
  var LIQUID_WALL_BOUNCE_EDGE     = 0.095;
  var LIQUID_FLOOR_FRICTION       = 0.97;    // v25.44 honey fix — edit² 010-constants (per-substep; was 0.92)
  var LIQUID_WALL_FRICTION        = 0.985;   // v25.44 honey fix — edit² 010-constants (per-substep; was 0.97)
  var LIQUID_LIP_FRICTION         = 0.999;   // v25.45 ledge-lip spill — edit² 010-constants (feel.w lane)
  var LIQUID_OIL_WALL_BOUNCE_IN   = 0.05;
  var LIQUID_OIL_WALL_BOUNCE_EDGE = 0.06;
  var LIQUID_OIL_FLOOR_FRICTION   = 0.89;
  var LIQUID_OIL_WALL_FRICTION    = 0.94;

  /* ---- Stage 5 — G2P feel constants ----------------------------------
   * The grid->particle gather kernel reads these. As with the Stage-4
   * block they mirror the CPU liquid tunables in sluice.js and
   * are interpolated as literals into the WGSL G2P kernel; the self-test
   * diff catches any drift from the CPU side.
   * -------------------------------------------------------------------- */
  var LIQUID_DAMPING               = 0.992;  // v24.10 — REVERTED to original 0.992 (v24.8's 0.97 was sluggish). edit² with 010-constants.js.
  var LIQUID_OIL_DAMPING           = 0.97;
  var LIQUID_WATER_MOTION_SCALE    = 0.97;
  var LIQUID_INV_DENSITY           = 1 / LIQUID_DENSITY;   // 0.25
  var LIQUID_AERATION_THRESHOLD     = 0.55;
  var LIQUID_OIL_AERATION_THRESHOLD = 0.5;
  var LIQUID_AERATION_COEFF         = 10.0;
  var LIQUID_OIL_AERATION_COEFF     = 10.0;

  /* ---- v25.56 BATHHOUSE B1: water temperature (docs/game/BATHHOUSE_PLAN.md)
   * Heat is stored per particle as "heat above ambient" in flag bits 24:31
   * (raw 0..255 = T 0..2, floor-encoded so decay always reaches 0). Every
   * kernel term MULTIPLIES by the heat, so with BATH_ON = 0 (or all-zero
   * heat, which is the boot state) every pass is byte-identical to v25.55
   * and the boot self-tests hold unchanged (plan decision B-D1). The cell
   * field (cellHeat) lives in the PRESSURE layout: splat in gridPressure,
   * mass-normalize in heatNormalize, gather + advance + buoyancy in G2P.
   * Levers flow live through setSimParam('BATH_*'). */
  var LIQUID_BATH_ON       = 0;     // 0/1 master gate; the game flips it (ENABLE_BATH)
  var LIQUID_BATH_EXCHANGE = 0.03;  // per-substep particle<->field relax: small (heat RIDES parcels, v25.94) but enough to feather the interface a particle-cluster wide (v25.95)
  var LIQUID_BATH_COOL     = 0.09;  // 1/s heat decay: surface water cools and SINKS at the walls, closing the circulation loop
  var LIQUID_BATH_BUOY     = 260;   // px/s^2 upward at T=1 (gravity is 600 down)
  var LIQUID_BATH_SRC_X0   = 0;     // heat-source rect, world px (ONE rect in v1;
  var LIQUID_BATH_SRC_Y0   = 0;     // B2 grows this into a proper source list)
  var LIQUID_BATH_SRC_X1   = 0;
  var LIQUID_BATH_SRC_Y1   = 0;
  var LIQUID_BATH_SRC_T    = 1.4;   // source target temperature (T units, cap 2)
  var LIQUID_BATH_SRC_RATE = 0.03;  // per-substep relax toward SRC_T inside the rect
  /* v25.57 BATH B1: the heat TINT (a B4-preview pulled forward so B1 is
   * actually visible for the feel-check). Hot water lerps toward this warm
   * hot-spring colour by its temperature x strength. Rides the surface
   * field's free alpha channel, so it is a byte-for-byte no-op with the
   * bath off (heat bits are 0 -> field alpha 0 -> zero tint). Live via
   * setRenderParam('BATH_TINT_*'). Deliberately a HINT, not a highlighter;
   * the final look is a taste call for the owner (dial STR, or 0 to kill). */
  var LIQUID_BATH_TINT_R   = 0.95;
  var LIQUID_BATH_TINT_G   = 0.45;
  var LIQUID_BATH_TINT_B   = 0.30;
  var LIQUID_BATH_TINT_STR = 0.55;  // max fraction toward the tint at T=1 (0 = off)
  var LIQUID_SLEEP_FRAMES   = 45;       // consecutive low-KE frames before sleeping (v24.112: 60 -> 45)
  var LIQUID_SLEEP_VSQ      = 9.0;      // px/s squared — sleep below this (v24.112: 1.0 -> 9.0, |v| < 3 px/s;
                                        // at 1.0 a settled pond's surface simmer kept every particle awake
                                        // FOREVER — measured awake=9877 flatlined over 45 s)
  var LIQUID_WAKE_CELL_VSQ  = 0.007;    // cell-units^2 — wake if a stencil cell exceeds
                                        // (v24.112: 0.0005 -> 0.002 ~27 px/s; v24.125: -> 0.007 ~53 px/s.
                                        // Measured: an energized pond's ambient ripple peaks 40-90 px/s,
                                        // so at 27 the soup re-woke sleepers forever; at 53 sleep
                                        // ratchets up. Real disturbances are hundreds of px/s and the
                                        // dig wake is explicit. edit2 sluice.js 020-state.)
  // v24.112 rest brake: extra per-substep velocity damping applied ONLY
  // below a low speed threshold. The weakly-compressible pressure cycle
  // keeps a standing pond churning at a measured mean ~20 px/s (spikes to
  // ~300) forever; plain damping (0.992) never beats it, so nothing ever
  // passed the sleep gate. The brake decays that noise floor to true rest
  // while leaving real flows above the threshold untouched. edit2 twins in
  // sluice.js 020-state (CPU fallback reads those).
  var LIQUID_REST_BRAKE_VSQ = 625.0;    // px/s squared — gentle brake below |v| = 25 px/s
  var LIQUID_REST_BRAKE     = 0.92;     // gentle multiplier per substep (splash tails stay natural)
  // Second, HARD stage: the cancellation residue re-pumps ~1 px/s each
  // substep, so a gentle brake alone plateaus ~12 px/s (measured). Below
  // 10 px/s the motion is pure dregs; brake hard enough that the pump
  // cannot sustain it (equilibrium lands under the 3 px/s sleep gate).
  var LIQUID_REST_BRAKE_HARD_VSQ = 100.0;  // px/s squared — hard brake below |v| = 10 px/s
  var LIQUID_REST_BRAKE_HARD     = 0.75;   // hard multiplier per substep
  // v24.145 WATER STATE MACHINE (game-side liquidStateTick, sluice 070):
  // calm 0 = stimulated/lively, 1 = settling/settled. Rides SimParams
  // g2pB.w (the old _pad lane) and scales BOTH brake factors toward 1, so
  // stimulated water flows undamped and only settling water is ground to
  // rest. The game fround-quantizes before setSimParam('CALM'), keeping
  // this f64 mirror == the f32 uniform lane (the stage-5 reference's math
  // stays in lockstep with the kernel). Default 1 = the exact v24.112
  // brake at boot, so the numbered self-tests are byte-identical.
  var LIQUID_CALM = 1;
  // Awake particles moving faster than this (px/s squared) are tallied by
  // applyReadback into instance.fastCount — the state machine's "still
  // really flowing" signal. Measurement only, no sim effect.
  var LIQUID_FAST_VSQ = 576.0;
  // v24.115 GRID VISCOSITY: per substep, blend each massy cell's resolved
  // velocity toward the average of its massy 4-neighbours (momentum
  // diffusion). The clamped weakly-compressible EOS is a LIMIT-CYCLE
  // oscillator at rest (gravity compresses, pressure over-corrects, the
  // p>=0 clamp removes the restoring half-cycle), so a settled pond
  // breathes standing waves forever that no per-particle damping can beat;
  // anti-phase neighbour velocities cancel under this blend while uniform
  // flow passes through untouched. Lives in SimParams coll.z (live via
  // setSimParam('GRID_VISC') / the gm water lever). edit2: 010-constants.
  var LIQUID_GRID_VISC = 0.45;  // v24.166 — reverted from the v24.164 0.7 (paired with the now-disabled force-freeze); live value is the calm-blend pushed each frame
  // v26.53 — TWO-SCALE QUIET FILTER. The grid stage removes local neighbour
  // disagreement, now including one-cell-thick sheets (two cardinal
  // neighbours). The particle stage adds a separate smooth low-speed tail
  // brake to body-supported water. The brake is zero at impact/splash speed
  // and is density-gated away from airborne spray. This gives the host a real
  // calm-to-lively range without changing the material clock or render size.
  // Module defaults remain zero so boot references stay exact; shipping hosts
  // push live values after the self-tests.
  var LIQUID_QUIET_VISC    = 0;
  var LIQUID_QUIET_SPEED   = 34;   // px/s: filter fully gone by this cell speed
  var LIQUID_QUIET_SHEAR   = 11;   // px/s: filter fully gone by this neighbour delta
  var LIQUID_QUIET_DRAG    = 0;    // per-substep low-speed body-water tail brake
  // v24.120 WATER DEBUG KIT — live diagnostic bitmask from the game's gm
  // 'water' levers (edit2 twins in sluice.js 020-state). Rides to the
  // kernels in SimParams coll.w, so flipping a lever needs NO recompile:
  //   bit 1 = NO_SLEEP (never set the sleep bit; force-wake sleepers at
  //           the G2P gate instead of scanning)
  //   bit 2 = NO_BRAKE (skip the v24.112 two-stage rest brake)
  // 0 = shipping behaviour; the boot self-tests run at 0, so their diffs
  // do not move. Set via setSimParam('DBG_FLAGS', mask).
  var LIQUID_DBG_FLAGS = 0;
  // v24.173 OLD-FAITHFUL FIX — speed-gated burst damp + hard velocity clamp.
  // Saharan-raw conserves energy, so a stir over-compresses pockets, the
  // clamped EOS ejects them hard, and the energy never leaves = the owner's
  // "huge crazy particles / infinite explosion fest". MAX_VEL caps the speed
  // (CFL backstop, bounds the runaway); BURST_DAMP bleeds energy from FAST
  // water only (ramped GATE_LO->GATE_HI) so a disturbance settles while
  // resting water (below GATE_LO) is untouched (no rest-baseline creep). The
  // G2P kernel reads these LIVE from SimParams g2pC (lanes 28-31), so the gm
  // levers retune with no recompile. edit2 twins in sluice.js 020-state (the
  // CPU fallback reads those); the fr() reference below reads these.
  var LIQUID_MAX_VEL        = 600.0;   // px/s — hard per-particle speed cap (0 = off)
  var LIQUID_BURST_DAMP     = 0.985;   // per-substep factor for FULLY-fast water (1.0 = off)
  // v25.41 — the shallow-popcorn root fix (rationale at the 010-constants
  // twins). PRESSURE_MAX_DV is the fix: a per-substep cap (px/s) on the
  // velocity change a grid cell may receive from the pressure impulse —
  // the one-substep 50-200 px/s spike off a density blip IS the pop.
  // AIR_DRAG decelerates separated droplets (densityRatio < 0.55) so any
  // residue arcs down. COHESION (detachment surface tension) is KEPT AT 0:
  // both a flat negative floor AND a dn<0.7-gated pull were measured
  // EXPLOSIVE (the skin is permanently under-dense; attraction there pumps
  // the surface limit cycle to the speed cap). Uniform lanes sp.feel.xyz;
  // 0 / 1 / 0 = old physics.
  var LIQUID_COHESION        = 0;
  var LIQUID_AIR_DRAG        = 0.993;
  var LIQUID_PRESSURE_MAX_DV = 10;
  var LIQUID_BURST_GATE_LO  = 100.0;   // px/s — burst damp starts (above rested ambient peak)
  var LIQUID_BURST_GATE_HI  = 300.0;   // px/s — burst damp reaches full BURST_DAMP

  /* ---- Grid sizing constants ----------------------------------------
   * The count-sort builds a uniform grid over the live particles each
   * frame. Cells use the same LIQUID_CELL = 2.5 world-px pitch as the
   * CPU particle grid, so the GPU grid and the CPU grid agree cell for
   * cell. The cell buffers are allocated once at a fixed maximum
   * (GRID_MAX_CELLS); each frame only the gridW*gridH prefix of them is
   * touched. The cap is 2^21 cells: the whole-world particle set
   * (surface ponds + scattered world water) spans a wide cell-space
   * bounding box — measured ~1.1M cells on a default world — so 2^20
   * is too tight and would clamp. 2^21 clears it with headroom for
   * ~25 MB of cell buffers; true active-region capping (a tight box
   * around just the live sim region) arrives with the later sim
   * stages and will shrink this dramatically.
   * ------------------------------------------------------------------- */
  var LIQUID_CELL_DEFAULT = 2.5;

  /* ---- Stage 6 — terrain collision constants -------------------------
   * The collide kernel ports the CPU liquidMoveParticle. Its probe radius
   * and the per-fluid bounce factors mirror the literals at the top of
   * that function (r = LIQUID_CELL * LIQUID_PDELTA * 0.85; bounce 0.05 oil
   * / 0.18 water). Interpolated into the WGSL collide kernel; if the CPU
   * literals drift, the Stage-6 self-test diff catches it.
   * MUST come after LIQUID_CELL_DEFAULT — it is computed from it, and `var`
   * hoisting would otherwise make this NaN (NaN poisons both the WGSL
   * COLLIDE_RADIUS literal and the CPU reference's probe radius).
   * -------------------------------------------------------------------- */
  var LIQUID_COLLIDE_RADIUS   = LIQUID_CELL_DEFAULT * 0.5 * 0.85;  // world px
  var LIQUID_BOUNCE_WATER     = 0.18;
  var LIQUID_BOUNCE_OIL       = 0.05;

  /* ---- Stage 7 — render constants ------------------------------------
   * Mirror the CPU liquid-renderer colours/sizes in sluice.js
   * (LIQUID_WATER_R/G/B, LIQUID_WATER_FOAM_R/G/B, LIQUID_OIL_R/G/B, the
   * per-fluid particle sizes + alphas). The WGSL render shaders
   * interpolate these as literals so the WebGPU renderer matches the
   * existing liquidGLCanvas output pixel-for-pixel. Must come after
   * LIQUID_CELL_DEFAULT — the point-size base is computed from it (var
   * hoisting would otherwise make LIQUID_RENDER_SIZE_BASE NaN).
   * -------------------------------------------------------------------- */
  // v24.152 — saharan-reference palette twins (edit2 sluice 010): dark
  // base, light-BLUE turbulence tint, foam never white.
  var LIQUID_WATER_R = 0.165, LIQUID_WATER_G = 0.420, LIQUID_WATER_B = 0.780;
  var LIQUID_WATER_FOAM_R = 0.620, LIQUID_WATER_FOAM_G = 0.840, LIQUID_WATER_FOAM_B = 0.980;
  var LIQUID_WATER_ALPHA = 0.82;
  var LIQUID_OIL_R = 0.051, LIQUID_OIL_G = 0.039, LIQUID_OIL_B = 0.020;
  var LIQUID_OIL_ALPHA = 0.920;
  var LIQUID_WATER_PARTICLE_SIZE = 1.8;   // v24.155 — restored, edit2 sluice 010 (1.15 starved the body field)
  var LIQUID_OIL_PARTICLE_SIZE   = 2.5;
  // Shared point-diameter base — LIQUID_CELL * LIQUID_PDELTA * 0.85 * 2,
  // exactly the `sizeBase` the CPU drawLiquidsWebGL computes (before the
  // per-fluid LIQUID_*_PARTICLE_SIZE multiplier and the density scale).
  var LIQUID_RENDER_SIZE_BASE = LIQUID_CELL_DEFAULT * LIQUID_PDELTA * 0.85 * 2;
  // v24.113 — SURFACE RENDER (WebGPU only): instead of drawing each
  // particle as a visible soft disc, splat all particles into an offscreen
  // density FIELD and composite it through a smoothstep threshold, so
  // water reads as one continuous body with a clean surface line (and the
  // per-particle micro-motion stops being visible as "boiling balls").
  // Live-tunable via setRenderParam / the gm 'water' group; SURFACE_RENDER
  // 0 falls back to the legacy per-particle discs.
  var LIQUID_SURFACE_RENDER  = 1;     // 1 = field+threshold compositing, 0 = legacy discs
  var LIQUID_SURFACE_THRESH  = 1.8;   // v24.162 — raised from 0.85: a lone particle's metaball peak is ~1.0, so THRESH-SOFT=1.0 makes single particles invisible while bodies (field >> 1) stay solid. edit2 sluice 010
  var LIQUID_SURFACE_SOFT    = 0.8;   // v24.162 — was 0.35 (lower edge = one-particle peak)
  var LIQUID_SURFACE_RSCALE  = 0.9;   // v26.17 honest footprint: body support spans ~2 rest spacings, not a 10px halo
  var LIQUID_DROPLETS        = 1;     // v25.32 — visible-droplet pass for low-support particles
                                      // (strays/spray render as small drops instead of nothing;
                                      // the fat-disc bug is impossible: droplet size is fixed,
                                      // never density-scaled). edit² with 010-constants.js.
  // v24.160 — PARTICLE PROOF overlay. 1 = draw every particle as its own
  // tiny hard dot (fixed size, NO density scaling, NO threshold merge),
  // coloured by a per-index hash, ON TOP of the normal water. The owner's
  // diagnostic: is a "giant particle" one particle rendered huge, or many
  // particles merged into a circle by the metaball composite? With this on,
  // a single particle = one lone dot; a cluster = the circle fills with a
  // speckle of many differently-coloured dots. gm water.DBG_PARTICLES.
  var LIQUID_DBG_PARTICLES   = 0;

  /* ---- Stage 8 — game-coupled-force constants ------------------------
   * The grid-update wake kernels + the collide kernel's miner-silhouette
   * test mirror the CPU literals in sluice.js: the player-eject
   * force (LIQUID_PLAYER_EJECT), the player box (PLAYER_W/H) and the miner
   * hull/track silhouette rects (player-local px — liquidPointInMiner /
   * liquidApplyPlayerGridWake). They are static tuned constants on both
   * sides; the values below mirror sluice.js exactly and are
   * interpolated as literals into the WGSL game-coupled kernels. Keep them
   * in sync if the CPU constants ever change. Stage-8 caps: the wake
   * uniform carries at most GS_MAX_NOZZLES rocket nozzles and
   * GS_MAX_EXPLOSIONS explosions (the game never exceeds either).
   * -------------------------------------------------------------------- */
  var LIQUID_PLAYER_EJECT = 720;
  var LIQUID_PLAYER_W = 22, LIQUID_PLAYER_H = 26;
  var LIQUID_MINER_HULL_L = 3.0,  LIQUID_MINER_HULL_T = 6.0;
  var LIQUID_MINER_HULL_R = 20.0, LIQUID_MINER_HULL_B = 20.0;
  var LIQUID_MINER_TRACK_L = 1.5,  LIQUID_MINER_TRACK_T = 18.0;
  var LIQUID_MINER_TRACK_R = 20.5, LIQUID_MINER_TRACK_B = 25.0;
  var GS_MAX_NOZZLES = 4;            // rocket-plume nozzle cap (game uses 2)
  var GS_MAX_EXPLOSIONS = 8;         // explosion-wake cap per frame
  var GS_MAX_GUESTS = 8;             // v26.04 — bath-guest moving boundaries
                                     // v26.09 — 3 -> 8: the physics-toy page
                                     // registers every wet slime as a moving
                                     // boundary; the banya still registers <= 3.
                                     // Layout below is DERIVED from these
                                     // constants (no magic lane numbers), so
                                     // this is the only line to touch.
  // GameParams guest-lane layout, derived (v26.09): 15 legacy vec4 lanes
  // (player/rocket/counts/nozzles/explosions = f32 lanes 0..59), then 2 meta
  // vec4 per guest, then GS_RING ring vec4 per guest. writeGameParams and
  // the buffer allocation read these; the WGSL struct interpolates the same
  // constants, so JS and GPU can never disagree on the layout.
  var GS_META_BASE = 60;             // f32 lane where guest meta begins
  var GS_RING = 20;                  // v26.05 — ring vertices per guest (the
                                     // EXACT deforming silhouette, resampled
                                     // from the jello boundary each frame)
  var GS_RING_BASE = GS_META_BASE + GS_MAX_GUESTS * 8;               // rings start after the meta
  var GS_PARAM_LANES = GS_RING_BASE + GS_MAX_GUESTS * GS_RING * 4;   // total f32 lanes
  // v26.13 — one immutable GameParams uniform per fixed water substep.
  // A single buffer cannot be rewritten between command buffers that are
  // batched into one queue.submit: every pass would see the final write.
  // Five tiny buffers let each pass bind its own interpolated guest pose.
  var GS_FRAME_SLOTS = LIQUID_MAX_SUBSTEPS;

  var GRID_MAX_CELLS = 1 << 21;      // 2,097,152 — hard cap on grid cells
  var WG = 256;                       // compute workgroup size
  var SCAN_BLOCKS = (GRID_MAX_CELLS + WG - 1) / WG | 0;  // 8192 prefix-sum blocks

  /* ---- v15.0 — SPARSE ACTIVE-BLOCK GRID -------------------------------
   * The pre-v15 pipeline ran EVERY cell-space kernel (clears, the count-
   * sort scan, gridUpdate, gridBoundary) plus a cellStart->cellCursor
   * buffer copy over the whole particle-bbox grid, every sub-step. Cost
   * scaled with the BOUNDING BOX (up to GRID_MAX_CELLS = 2^21 cells), not
   * with the water: two small ponds far apart paid for every empty cell
   * between them (~124 ms/frame measured on a mobile Mali).
   *
   * v15.0 makes the grid sparse and fully GPU-driven:
   *   - the grid is tiled into 16x16-cell BLOCKS (256 cells = exactly one
   *     workgroup; gridW/gridH are padded to multiples of 16).
   *   - the count kernel additionally marks, in a 1 KB bitmap, every block
   *     the particle's 3x3 splat stencil overlaps.
   *   - one single-workgroup kernel compacts the bitmap into a dense
   *     active-block list (deterministic, blockId order) and writes the
   *     block count into an INDIRECT-dispatch args buffer. The CPU never
   *     reads the count back — zero sync points.
   *   - every cell-space kernel is dispatched INDIRECTLY over the active
   *     list: one workgroup per active block, lane i -> cell (i%16, i/16)
   *     of the block. Cost is now proportional to wet area.
   *   - the per-sub-step full-grid CLEARS are gone entirely, replaced by
   *     a global-zero invariant: all cell buffers are zero outside the
   *     running sub-step (kernels only ever write inside active blocks; a
   *     tiny indirect clear re-zeroes those blocks at sub-step end; seeds
   *     and harness runs re-establish the invariant with clearBuffer).
   *     Reads that reach one cell past a stencil into an inactive block
   *     (the gridUpdate viscosity gather) therefore see true zeros, so
   *     the sparse chain is bit-equivalent to the dense one.
   *   - the cellStart->cellCursor copy is gone (the sparse scan-add pass
   *     writes both).
   * The dense pipelines are kept and the live lever water.SPARSE (via
   * setSimParam('SPARSE', 0/1)) switches paths per-frame — the shipping
   * default is sparse; dense is the A/B baseline + automatic fallback if
   * the sparse pipelines cannot build (needs 10 storage buffers/stage;
   * the dense chain already needs 9).
   * -------------------------------------------------------------------- */
  var BLOCK_W = 16;                                   // cells per block side
  var BLOCK_CELLS = BLOCK_W * BLOCK_W;                // 256 — one workgroup
  var BLOCK_MAX = GRID_MAX_CELLS / BLOCK_CELLS | 0;   // 8192 blocks
  var BLOCK_BITMAP_WORDS = BLOCK_MAX >> 5;            // 256 u32 = 1 KB
  var LIQUID_SPARSE = 1;              // live via setSimParam('SPARSE', 0/1)
  // Hybrid gate: the sparse bookkeeping (extra passes, the args copy, the
  // tiny dispatches) is a FIXED ~0.35 ms/frame on desktop Metal, while the
  // dense chain's cost is LINEAR in bbox cells. Below this many cells the
  // dense chain is provably cheap and runs instead; above it the sparse
  // chain caps the blowup (a 2^21-cell bbox measured 4.1 ms sparse vs
  // >7.4 ms dense on an M-series — and the gap is what saves Mali). The
  // runFrame gate has 2x hysteresis so a bbox hovering at the threshold
  // cannot flap modes (each dense->sparse entry pays one denseClearAll).
  // Live via setSimParam('SPARSE_MIN_CELLS'); harness/self-test chains
  // ignore the gate (they always exercise the lever-selected path).
  var LIQUID_SPARSE_MIN_CELLS = 32768;

  /* ---- Stage 6 — terrain bitmask sizing ------------------------------
   * The collide kernel samples a 1-bit-per-tile solidity mask covering
   * the live-particle tile bbox plus a 1-tile halo (so the +/-r collision
   * probes — r ~ 1.06 world px — never read past the rect). Particles
   * cluster in ponds, so the tile bbox is small and bounded; this cap is
   * a 512x512-tile region (16384 px square — far larger than any pond +
   * halo) packed into 8 KB. If a degenerate particle spread ever exceeds
   * it, computeTerrainBounds clamps and the kernel cannot index past the
   * buffer (mirrors the GRID_MAX_CELLS cap behaviour).
   * -------------------------------------------------------------------- */
  var TERRAIN_MAX_TILES = 1 << 18;          // 262,144 tiles — bitmask cap
  var TERRAIN_MASK_WORDS = TERRAIN_MAX_TILES >> 5;  // u32 words (1 bit/tile)
  // v15.1 — was 1 (sized for the +/-r collide probes). The rocket-wake
  // occlusion march (wakeLineClear) samples the nozzle->cell segment, and
  // out-of-rect samples read NON-solid, so the mask must cover the walls
  // between a nozzle and any wake-eligible cell. The plume reaches at most
  // TILE*5.5 from a nozzle, so a 6-tile halo around the water bbox covers
  // every possible segment (cell in rect, nozzle <= 5.5 tiles away). Costs
  // a slightly larger per-frame mask fill; still far under the cap.
  var TERRAIN_HALO = 6;

  /* ---- Stage 3 — fixed-point scatter scale --------------------------
   * WGSL has no float atomics, so the P2G cell accumulators are
   * array<atomic<i32>>. Each splat contribution is encoded as
   * i32(round(value * FIXED_SCALE)) and atomicAdd'd; the normalize /
   * readback decode back with f32(x) / FIXED_SCALE. 2^20 keeps a ~1e-6
   * quantum while leaving headroom: a busy cell carries O(tens), so
   * tens * 2^20 ~ 1e8 is well under i32's 2.1e9 range. Momentum is
   * signed — two's-complement atomicAdd handles negative values.
   * ------------------------------------------------------------------- */
  var FIXED_SCALE = 1048576.0;        // 2^20

  /* ---- GPU buffer layout — persistent particle state -----------------
   * 4 storage buffers, array-of-structs, indexed by particle slot
   * [0, count). The 15 persistent CPU arrays in sluice.js
   * (liquidX/Y/VX/VY, liquidG00..G11, liquidDensity, liquidAeration,
   * liquidType/Origin/Sleeping/Frozen/RestFrames) pack into:
   *
   *   pos     vec4<f32>   (x, y, vx, vy)
   *   affine  vec4<f32>   (G00, G01, G10, G11)  — the APIC "C" matrix
   *   aux     vec4<f32>   (density, aeration, _, _)  — 2 spare lanes
   *   flag    u32         bitpack: type[0:1] origin[2:3] sleeping[4]
   *                       frozen[5] restFrames[8:23]
   *
   * 52 bytes/particle. Per-step scratch (LX/LY/W/Nbrs/...) and the
   * cell + hash buffers are GPU-only and arrive in Stages 2-3.
   * -------------------------------------------------------------------- */

  function buildBuffers(instance) {
    var dev = instance.device;
    var n = instance.maxParticles;
    function mk(label, bytes) {
      return dev.createBuffer({
        label: label,
        size: bytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      });
    }
    instance.buf = {
      pos:    mk('liquid.pos',    n * 16),
      affine: mk('liquid.affine', n * 16),
      aux:    mk('liquid.aux',    n * 16),
      flag:   mk('liquid.flag',   n * 4),
      /* ---- Stage 2 — spatial grid (count-sort) ----
       * cellCount  : atomic<u32>/cell — particles landing in each cell.
       * cellStart  : u32/cell — exclusive prefix-sum of cellCount; the
       *              first sortedIdx slot owned by each cell.
       * cellCursor : atomic<u32>/cell — working copy of cellStart that
       *              the scatter kernel bumps as it places particles.
       * blockSums  : u32/scan-block — per-workgroup totals from the
       *              prefix-sum pass A, scanned in pass B.
       * cellOf     : u32/particle — flat cell index (cy*gridW+cx).
       * sortedIdx  : u32/particle — particle indices grouped by cell. */
      cellCount:  mk('liquid.cellCount',  GRID_MAX_CELLS * 4),
      cellStart:  mk('liquid.cellStart',  GRID_MAX_CELLS * 4),
      cellCursor: mk('liquid.cellCursor', GRID_MAX_CELLS * 4),
      blockSums:  mk('liquid.blockSums',  SCAN_BLOCKS * 4),
      cellOf:     mk('liquid.cellOf',     n * 4),
      sortedIdx:  mk('liquid.sortedIdx',  n * 4),
      /* ---- Stage 3 — P2G fixed-point cell accumulators ----
       * The particle->grid scatter splats into these via i32 atomicAdd
       * (WGSL lacks float atomics). Each is GRID_MAX_CELLS wide; only
       * the gridW*gridH prefix is cleared + used per build. Decode is
       * f32(x) / FIXED_SCALE.
       *   cellMass    : mass accumulator (sum of B-spline weights).
       *   cellOilMass : oil-only mass (oilWeight 1 for oil, 0 water).
       *   cellAeration: weighted aeration; mass-normalized post-scatter.
       *   cellVX/VY   : APIC momentum, affine-corrected per stencil
       *                 corner — signed, two's-complement atomicAdd. */
      cellMass:    mk('liquid.cellMass',    GRID_MAX_CELLS * 4),
      cellOilMass: mk('liquid.cellOilMass', GRID_MAX_CELLS * 4),
      cellAeration:mk('liquid.cellAeration',GRID_MAX_CELLS * 4),
      cellVX:      mk('liquid.cellVX',      GRID_MAX_CELLS * 4),
      cellVY:      mk('liquid.cellVY',      GRID_MAX_CELLS * 4),
      /* v25.56 BATH B1: fixed-point heat accumulator (pressure layout:
       * splat by gridPressure, normalized by heatNormalize, read by G2P).
       * Cleared with the DV impulses (dense) / heatClearSparse (sparse). */
      cellHeat:    mk('liquid.cellHeat',    GRID_MAX_CELLS * 4),
      /* ---- Stage 4 — pressure impulse + resolved cell velocity ----
       * cellDVX/DVY  : fixed-point i32 atomics — the weakly-compressible
       *               pressure impulse scattered by the pressure kernel
       *               (same FIXED_SCALE encoding + signed two's-complement
       *               atomicAdd as the Stage-3 momentum accumulators).
       *               Zeroed by clearDV before each pressure pass.
       * cellVelX/VelY: plain (non-atomic) f32 — the grid-update kernel
       *               writes the resolved velocity (momentum + impulse) /
       *               mass + gravity here, one thread per cell, each cell
       *               written exactly once. Stage 5's G2P gathers these. */
      cellDVX:     mk('liquid.cellDVX',     GRID_MAX_CELLS * 4),
      cellDVY:     mk('liquid.cellDVY',     GRID_MAX_CELLS * 4),
      cellVelX:    mk('liquid.cellVelX',    GRID_MAX_CELLS * 4),
      cellVelY:    mk('liquid.cellVelY',    GRID_MAX_CELLS * 4),
      /* ---- Stage 6 — terrain solidity bitmask ----
       * 1 bit/tile, row-major over the live-particle tile rect (bbox +
       * halo). The game fills a byte/tile array via the fillTerrainSolid
       * hook; uploadTerrainMask packs it 32 tiles to a u32 and writeBuffers
       * the active prefix. The collide kernel reads it to test solidity. */
      terrainMask: mk('liquid.terrainMask', TERRAIN_MASK_WORDS * 4),
      /* ---- v15.0 — sparse active-block grid ----
       * blockBitmap : 1 bit/block — the count kernel marks every block a
       *               particle's 3x3 stencil overlaps (atomicOr).
       * blockList   : compacted active blockIds, blockId order (built by
       *               the single-workgroup compact kernel each build).
       * blockMeta   : lane 0 = active-block count, lanes 1-2 = (1,1) —
       *               the indirect args VALUES. Dawn validates buffer usage
       *               per compute PASS (and by bind-group contents), so one
       *               buffer cannot be writable storage and the indirect
       *               source; the compact pass writes here and a 16-byte
       *               copyBufferToBuffer (transfer scope) publishes it to:
       * blockDispatch: the dispatchWorkgroupsIndirect args buffer — INDIRECT
       *               usage only, never bound as storage, so every indirect
       *               cell-space dispatch is conflict-free. The GPU sizes
       *               every pass itself; the CPU never reads the count. */
      blockBitmap: mk('liquid.blockBitmap', BLOCK_BITMAP_WORDS * 4),
      blockList:   mk('liquid.blockList',   BLOCK_MAX * 4),
      blockMeta:   mk('liquid.blockMeta',   16),
      blockDispatch: dev.createBuffer({
        label: 'liquid.blockDispatch',
        size: 16,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
      })
    };
    // Params uniform — grid origin/dims + particle count, handed to
    // every grid kernel. std140-friendly: 20 lanes, 80 bytes. Lanes 0-5
    // are u32 (count/dims/origin/cells); lanes 6-7 are f32 (stepDt,
    // invCell) for the P2G splat; lanes 8-10 are f32 (COLS, TILE,
    // TOTAL_ROWS) — the world constants the Stage-5 G2P kernel needs for
    // its world-bounds position clamp; lane 11 is padding. Lanes 12-15
    // are the Stage-6 terrain-mask tile rect: originCol/originRow (i32 bit
    // pattern — either can be negative; the moon lives at negative rows),
    // tileW/tileH (u32). Lanes 16-19 are the v14.31 active-region box
    // (minX, minY, maxX, maxY world px) — the camera-derived cull region;
    // the kernels' per-particle guard early-returns any particle outside
    // it. paramsHost (u32 view) and paramsHostF (f32 view) alias one
    // ArrayBuffer so a single writeBuffer pushes the whole struct.
    instance.paramsBuf = dev.createBuffer({
      label: 'liquid.gridParams',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var paramsAB = new ArrayBuffer(80);
    instance.paramsHost = new Uint32Array(paramsAB);
    instance.paramsHostF = new Float32Array(paramsAB);
    // Stage 8 — GameParams uniform: the live game state the grid-update
    // wake kernels + the collide miner test read each frame. Each buffer is
    // GS_PARAM_LANES*4 bytes (see the WGSL_GAME_PARAMS banner for the lane
    // layout). Each immutable slot carries the interpolated guest pose for
    // one fixed substep; writeGameParams() fills every slot before the
    // per-frame GPU chain.
    instance.gameParamsBufs = [];
    for (var gpb = 0; gpb < GS_FRAME_SLOTS; gpb++) {
      instance.gameParamsBufs.push(dev.createBuffer({
        label: 'liquid.gameParams.' + gpb,
        size: GS_PARAM_LANES * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }));
    }
    // Slot zero stays aliased for the standalone stage harnesses.
    instance.gameParamsBuf = instance.gameParamsBufs[0];
    // 15 legacy vec4 lanes + guest meta + guest ring vertices, sized from
    // the GS_* constants (v26.09; see the derivation at GS_META_BASE).
    instance.gameParamsHost = new Float32Array(GS_PARAM_LANES * GS_FRAME_SLOTS);
    // v14.26 — SimParams uniform: the live-tunable fluid-feel physics
    // constants every compute kernel reads. 13 vec4 = 208 bytes (v26.53 quiet
    // stages; see the WGSL_SIM_PARAMS banner for the lane layout). simParamsHost
    // is the f32 staging view; writeSimParams() fills it from the module
    // LIQUID_* vars and a single writeBuffer pushes it before the per-frame
    // GPU chain (and before each harness run* call). Bind groups bind the
    // whole buffer (no explicit size), so the larger buffer needs no other
    // change.
    instance.simParamsBuf = dev.createBuffer({
      label: 'liquid.simParams',
      size: 208,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    instance.simParamsHost = new Float32Array(52);   // 13 vec4 lanes (v26.53 two-scale quiet)
    // CPU-side staging arrays, allocated once and reused for upload.
    // terrainSolid is the byte/tile array the game fills; terrainMask is
    // its bit-packed (32 tiles/u32) form uploaded to the GPU.
    instance.staging = {
      pos:    new Float32Array(n * 4),
      affine: new Float32Array(n * 4),
      aux:    new Float32Array(n * 4),
      flag:   new Uint32Array(n),
      terrainSolid: new Uint8Array(TERRAIN_MAX_TILES),
      terrainMask:  new Uint32Array(TERRAIN_MASK_WORDS)
    };
    instance.buffersReady = true;
  }

  // Pack the live CPU liquid arrays into the staging arrays and
  // writeBuffer them to the GPU. Returns the uploaded particle count.
  // (Pre-Stage-8 this is a seeding/verification path; once the GPU
  // owns the state there is no per-frame upload.)
  //
  // stripFrozen (v24.112): the LIVE runFrame path passes true. The frozen
  // bit is the CPU solver's off-region perf flag; under the GPU the kernels
  // already cull by the live region box, but a frozen bit seeded from the
  // CPU-driven boot frames could never be cleared again (the CPU classifier
  // stops running once simActive flips), leaving a wide pond's far side
  // permanently skipped AND invisible (the render collapses frozen quads).
  // The boot self-tests keep packing frozen as-is (their CPU references
  // snapshot the same arrays, so both sides must agree).
  /* v15.0 — re-establish the sparse global-zero invariant: zero every cell
   * buffer end to end with encoder clearBuffer (a transfer op — no pipeline
   * needed, so it works before any pipeline is built). Called on every FULL
   * particle upload (first seed, CPU-solver handoff, every harness/self-test
   * run) and on a dense->sparse lever flip; the live sparse chain never
   * needs it (its end-of-sub-step indirect clear keeps the invariant). */
  function denseClearAll(instance) {
    if (!instance.buffersReady || !instance.device) return;
    var b = instance.buf;
    var enc = instance.device.createCommandEncoder({ label: 'liquid.denseClearAll' });
    enc.clearBuffer(b.cellCount);
    enc.clearBuffer(b.cellStart);
    enc.clearBuffer(b.cellCursor);
    enc.clearBuffer(b.cellMass);
    enc.clearBuffer(b.cellOilMass);
    enc.clearBuffer(b.cellAeration);
    enc.clearBuffer(b.cellVX);
    enc.clearBuffer(b.cellVY);
    enc.clearBuffer(b.cellDVX);
    enc.clearBuffer(b.cellDVY);
    enc.clearBuffer(b.cellVelX);
    enc.clearBuffer(b.cellVelY);
    enc.clearBuffer(b.cellHeat);
    enc.clearBuffer(b.blockBitmap);
    enc.clearBuffer(b.blockMeta);
    enc.clearBuffer(b.blockDispatch);
    instance.queue.submit([enc.finish()]);
  }

  function uploadParticles(instance, stripFrozen) {
    var L = instance.liquid;
    if (!L || !instance.buffersReady) return 0;
    var count = L.getCount() | 0;
    if (count > instance.maxParticles) count = instance.maxParticles;
    var a = L.arrays;
    var sp = instance.staging.pos, sa = instance.staging.affine,
        sx = instance.staging.aux, sf = instance.staging.flag;
    for (var i = 0; i < count; i++) {
      var p = i * 4;
      sp[p]     = a.x[i];   sp[p + 1] = a.y[i];
      sp[p + 2] = a.vx[i];  sp[p + 3] = a.vy[i];
      sa[p]     = a.g00[i]; sa[p + 1] = a.g01[i];
      sa[p + 2] = a.g10[i]; sa[p + 3] = a.g11[i];
      sx[p]     = a.density[i]; sx[p + 1] = a.aeration[i];
      sx[p + 2] = 0; sx[p + 3] = 0;
      sf[i] = (a.type[i] & 3) | ((a.origin[i] & 3) << 2) |
              ((a.sleeping[i] & 1) << 4) |
              (stripFrozen ? 0 : ((a.frozen[i] & 1) << 5)) |
              ((a.restFrames[i] & 0xffff) << 8);
    }
    if (count > 0) {
      var q = instance.queue;
      q.writeBuffer(instance.buf.pos,    0, sp, 0, count * 4);
      q.writeBuffer(instance.buf.affine, 0, sa, 0, count * 4);
      q.writeBuffer(instance.buf.aux,    0, sx, 0, count * 4);
      q.writeBuffer(instance.buf.flag,   0, sf, 0, count);
    }
    // v15.0 — a full upload is one of the sparse invariant's entry points
    // (boot self-tests leave the cell buffers dirty in blocks the next grid
    // mapping treats as inactive; a CPU-solver handoff arrives after dense
    // frames that never end-cleared). Cheap (transfer-queue clears) and
    // rare on the live path (first seed / handoff only).
    denseClearAll(instance);
    instance.uploadedCount = count;
    return count;
  }

  /* ---- Stage 2 — grid build ------------------------------------------
   * computeGridBounds: scan the uploaded CPU snapshot for the integer
   * cell-space bounding box, set instance.grid {originX,originY,w,h},
   * and push it to the Params uniform. Done CPU-side because the bbox
   * is needed before the GPU kernels can index cells; the per-particle
   * cell math itself stays on the GPU.
   *
   * Stage 3 — the P2G stencil reaches +/-1 cell from a particle's base
   * cell, so the bbox is padded by GRID_MARGIN (1) cell on every side:
   * the origin shifts out by one and the dims grow by two. That keeps
   * all 9 stencil cells of every edge particle inside the dense grid
   * (the GPU clamps strays anyway, but the margin means no real
   * particle's splat is ever clipped). The Stage 2 count-sort is
   * unaffected — a wider grid with the same particle->cell mapping.
   * -------------------------------------------------------------------- */
  // Stencil halo is 1 cell (the P2G 3x3 splat). v14.2 — padded wider so the
  // grid still encloses every GPU-resident particle on frames where the bbox
  // is scanned from the CPU mirror while the GPU buffers have drifted a few
  // sim steps ahead (runFrame's residency path). v14.5 widened it again: the
  // CPU mirror is refreshed only every LIQUID_READBACK_EVERY frames now, so
  // the mirror-derived bbox can lag that many sim steps — the margin has to
  // cover that drift. Empty perimeter cells are cheap; an under-sized grid
  // would clip edge particles' splats.
  var GRID_MARGIN = 16;

  // v14.5 — kick the GPU->CPU readback only every Nth runFrame, not every
  // frame. The readback's mapAsync is a sync point: doing it per frame stops
  // the browser pipelining GPU work ahead of the CPU, so the frame time came
  // out as CPU + GPU back-to-back (~9.7ms) instead of the overlapped
  // max(CPU,GPU) (~5.9ms). Kicking it rarely restores the overlap. The
  // mirror it feeds is purely game-side (oil-suction probe + the grid bbox)
  // — the renderer reads the GPU buffer directly, so on-screen water is
  // never stale regardless of this.
  var LIQUID_READBACK_EVERY = 20;

  function computeGridBounds(instance, count) {
    var a = instance.liquid.arrays;
    var inv = 1 / instance.cellSize;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // v14.31 — cull the bbox to the active region with the SAME test the
    // WGSL kernels' outOfRegion() guard uses, so the grid only encloses
    // the particles the kernels will actually simulate. With the
    // whole-world +/-1e9 region (boot self-tests) the continue never fires.
    var rMinX = instance.regionMinX, rMinY = instance.regionMinY;
    var rMaxX = instance.regionMaxX, rMaxY = instance.regionMaxY;
    for (var i = 0; i < count; i++) {
      var px = a.x[i], py = a.y[i];
      if (px < rMinX || px > rMaxX || py < rMinY || py > rMaxY) continue;
      var cx = Math.floor(px * inv);
      var cy = Math.floor(py * inv);
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
    if (!isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
    // Pad the bbox by the stencil halo so edge particles' 3x3 splat
    // cells are all in-grid.
    minX -= GRID_MARGIN; minY -= GRID_MARGIN;
    maxX += GRID_MARGIN; maxY += GRID_MARGIN;
    var gw = (maxX - minX + 1) | 0;
    var gh = (maxY - minY + 1) | 0;
    if (gw < 1) gw = 1;
    if (gh < 1) gh = 1;
    // v15.0 — pad both dims up to multiples of BLOCK_W (16) so the sparse
    // 16x16 blocks tile the grid exactly (bw = gridW >> 4 in-shader, every
    // block cell a valid dense index, and the 2^21-cell cap is exactly
    // 8192 blocks). Padding cells are empty and — under the sparse path —
    // never touched; under the dense path they cost the same as the old
    // GRID_MARGIN perimeter cells.
    gw = (gw + BLOCK_W - 1) & ~(BLOCK_W - 1);
    gh = (gh + BLOCK_W - 1) & ~(BLOCK_W - 1);
    var capped = false;
    if (gw * gh > GRID_MAX_CELLS) {
      // Active-region capping is a later-stage concern; the GRID_MAX_CELLS
      // cap is sized to clear a default world's whole-particle bbox. If
      // this fires, log loudly and clamp so the kernels cannot index past
      // the fixed cell buffers. Shrink in block steps so the dims stay
      // multiples of BLOCK_W.
      capped = true;
      try {
        console.warn('LiquidWGPU Stage 2: grid ' + gw + 'x' + gh +
          ' = ' + (gw * gh) + ' cells exceeds ' + GRID_MAX_CELLS +
          '-cell cap — clamping.');
      } catch (_) {}
      while (gw * gh > GRID_MAX_CELLS && gh > BLOCK_W) gh -= BLOCK_W;
      while (gw * gh > GRID_MAX_CELLS && gw > BLOCK_W) gw -= BLOCK_W;
    }
    instance.grid = {
      originX: minX, originY: minY, w: gw, h: gh,
      cells: gw * gh, capped: capped
    };
    var ph = instance.paramsHost;
    var phf = instance.paramsHostF;
    ph[0] = count >>> 0;
    ph[1] = gw >>> 0;
    ph[2] = gh >>> 0;
    // originX/Y can be negative — reinterpret the i32 bit pattern as
    // u32 for the uniform, the WGSL side reads it back with bitcast.
    ph[3] = minX | 0;
    ph[4] = minY | 0;
    ph[5] = (gw * gh) >>> 0;     // total active cells
    // Lanes 6-7 — f32 P2G params. stepDt scales particle velocity into
    // cell-space momentum; invCell converts world px -> cell units.
    phf[6] = instance.stepDt;
    phf[7] = 1 / instance.cellSize;
    // Lanes 8-10 — f32 world constants for the Stage-5 G2P world-bounds
    // position clamp. Static for a run; rewritten here so a single
    // writeBuffer keeps pushing the whole struct.
    phf[8]  = instance.worldCols;
    phf[9]  = instance.worldTile;
    phf[10] = instance.worldTotalRows;
    // Lanes 16-19 — v14.31 active-region box (world px). The kernels'
    // per-particle guard early-returns any particle outside this box,
    // before it computes a cell index, so the smaller grid is never
    // indexed out of bounds.
    phf[16] = instance.regionMinX;
    phf[17] = instance.regionMinY;
    phf[18] = instance.regionMaxX;
    phf[19] = instance.regionMaxY;
    instance.queue.writeBuffer(instance.paramsBuf, 0, ph);
    return instance.grid;
  }

  /* ---- Stage 6 — terrain bitmask bounds + upload ----------------------
   * computeTerrainBounds: scan the uploaded CPU snapshot for the integer
   * TILE-space bounding box of the live particles, pad by TERRAIN_HALO so
   * the +/-r collision probes never read past the rect, clamp to the
   * TERRAIN_MAX_TILES cap, store instance.terrain {originCol,originRow,
   * w,h} and push the tile rect into Params lanes 12-15 (a partial
   * writeBuffer of the 16-byte tail — independent of computeGridBounds'
   * whole-struct push). Done CPU-side, like computeGridBounds: the bbox
   * is needed before the game can fill the mask.
   *
   * uploadTerrainMask: ask the game (the fillTerrainSolid hook) to fill a
   * byte/tile solidity array for the rect, pack it 32 tiles to a u32, and
   * writeBuffer the active prefix to the terrainMask GPU buffer. Returns
   * the rect cell count (0 if no hook / no particles).
   * -------------------------------------------------------------------- */
  function computeTerrainBounds(instance, count) {
    var a = instance.liquid.arrays;
    var invTile = 1 / instance.worldTile;
    var minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (var i = 0; i < count; i++) {
      var tc = Math.floor(a.x[i] * invTile);
      var tr = Math.floor(a.y[i] * invTile);
      if (tc < minC) minC = tc;
      if (tc > maxC) maxC = tc;
      if (tr < minR) minR = tr;
      if (tr > maxR) maxR = tr;
    }
    if (!isFinite(minC)) { minC = 0; maxC = 0; minR = 0; maxR = 0; }
    // Pad by the probe halo — the collide probes reach +/-r (~1.06 px)
    // beyond a particle, which can cross into the neighbour tile.
    minC -= TERRAIN_HALO; minR -= TERRAIN_HALO;
    maxC += TERRAIN_HALO; maxR += TERRAIN_HALO;
    var tw = (maxC - minC + 1) | 0;
    var th = (maxR - minR + 1) | 0;
    if (tw < 1) tw = 1;
    if (th < 1) th = 1;
    var capped = false;
    if (tw * th > TERRAIN_MAX_TILES) {
      // Ponds keep the tile bbox small; the cap is sized to clear any real
      // pond + halo. If a degenerate spread trips it, log + clamp so the
      // collide kernel cannot index past the fixed bitmask buffer.
      capped = true;
      try {
        console.warn('LiquidWGPU Stage 6: terrain rect ' + tw + 'x' + th +
          ' = ' + (tw * th) + ' tiles exceeds ' + TERRAIN_MAX_TILES +
          '-tile cap — clamping.');
      } catch (_) {}
      while (tw * th > TERRAIN_MAX_TILES && th > 1) th--;
      while (tw * th > TERRAIN_MAX_TILES && tw > 1) tw--;
    }
    instance.terrain = {
      originCol: minC, originRow: minR, w: tw, h: th,
      tiles: tw * th, capped: capped
    };
    var ph = instance.paramsHost;
    // Lanes 12-15 — the terrain tile rect. originCol/Row can be negative
    // (the moon lives at negative rows), so store the i32 bit pattern;
    // the WGSL side reads it back with bitcast.
    ph[12] = minC | 0;
    ph[13] = minR | 0;
    ph[14] = tw >>> 0;
    ph[15] = th >>> 0;
    // Partial push — just the 16-byte tail (lanes 12-15 at byte 48), so
    // this stays independent of computeGridBounds' whole-struct write.
    instance.queue.writeBuffer(instance.paramsBuf, 48, ph, 12, 4);
    return instance.terrain;
  }

  function uploadTerrainMask(instance) {
    var t = instance.terrain;
    if (!t || t.tiles <= 0) return 0;
    var hook = instance.liquid && instance.liquid.fillTerrainSolid;
    var solid = instance.staging.terrainSolid;
    var mask  = instance.staging.terrainMask;
    var tiles = t.tiles;
    var words = (tiles + 31) >> 5;
    if (typeof hook === 'function') {
      hook(t.originCol, t.originRow, t.w, t.h, solid);
    } else {
      // No game hook — treat the whole region as non-solid (the collide
      // kernel then becomes a pure world-bounds clamp). Belt-and-braces;
      // the game always passes fillTerrainSolid.
      for (var z = 0; z < tiles; z++) solid[z] = 0;
    }
    // Pack 32 tiles per u32, bit k = tile (wordBase + k). Clear each word
    // then OR in the set bits.
    for (var w = 0; w < words; w++) {
      var bits = 0;
      var base = w << 5;
      var lim = tiles - base; if (lim > 32) lim = 32;
      for (var k = 0; k < lim; k++) {
        if (solid[base + k]) bits |= (1 << k);
      }
      mask[w] = bits >>> 0;
    }
    instance.queue.writeBuffer(instance.buf.terrainMask, 0, mask, 0, words);
    return tiles;
  }

  /* ---- Stage 8 — game-coupled state upload ----------------------------
   * writeGameParams: ask the game (the getGameState hook) for the live
   * player, rocket, explosion and guest state, then pack one interpolated
   * guest pose per fixed substep into immutable GameParams uniforms. Run
   * once per frame before the GPU chain so grid-update and collision see
   * the right game state for each batched substep.
   *
   * The hook returns plain JS (no GPU types); the CPU side does the
   * t-gating + blast-scale precompute so the kernels stay branch-light.
   * If the hook is absent or returns nothing, the uniform is zeroed —
   * every kernel's game-coupled path then no-ops (active flags are 0).
   * -------------------------------------------------------------------- */
  function writeGameParams(instance, subSteps) {
    var allGh = instance.gameParamsHost;
    var bufs = instance.gameParamsBufs;
    if (!allGh || !bufs) return;
    var slots = subSteps | 0;
    if (slots < 1) slots = 1;
    if (slots > GS_FRAME_SLOTS) slots = GS_FRAME_SLOTS;
    var hook = instance.liquid && instance.liquid.getGameState;
    var gs = (typeof hook === 'function') ? hook() : null;
    for (var slot = 0; slot < GS_FRAME_SLOTS; slot++) {
      var gh = allGh.subarray(slot * GS_PARAM_LANES, (slot + 1) * GS_PARAM_LANES);
      gh.fill(0);
      // The host supplies the latest ring pose plus world-px/s face
      // velocities. Rewind the early water substeps along those velocities
      // so a batched frame sees a moving boundary, not the final pose N
      // times. Extra unused slots hold the final pose for harness calls.
      var liveSlot = slot < slots ? slot : slots - 1;
      var backTime = (slots - 1 - liveSlot) * (instance.stepDt || LIQUID_SUBSTEP_DT);
      if (gs) {
      // player vec4 — lanes 0-3: (active, worldX, worldY, dir).
      var pl = gs.player;
      if (pl && pl.active) {
        gh[0] = 1;
        gh[1] = pl.x || 0;
        gh[2] = pl.y || 0;
        gh[3] = (pl.dir < 0) ? -1 : 1;
      }
      // rocket vec4 — lanes 4-7: (active, intensity, exDirX, exDirY).
      var rk = gs.rocket;
      var nozN = 0;
      if (rk && rk.active) {
        gh[4] = 1;
        gh[5] = rk.intensity || 0;
        gh[6] = rk.exDirX || 0;
        gh[7] = rk.exDirY || 0;
        var noz = rk.nozzles || [];
        nozN = noz.length;
        if (nozN > GS_MAX_NOZZLES) nozN = GS_MAX_NOZZLES;
        // nozzles array<vec4,4> — lanes 12-27, (x, y, _, _) per nozzle.
        for (var n = 0; n < nozN; n++) {
          gh[12 + n * 4]     = noz[n].x || 0;
          gh[12 + n * 4 + 1] = noz[n].y || 0;
        }
      }
      // explosions array<vec4,8> — lanes 28-59, (cx, cy, r, blastScale).
      var ex = gs.explosions || [];
      var exN = ex.length;
      if (exN > GS_MAX_EXPLOSIONS) exN = GS_MAX_EXPLOSIONS;
      for (var e = 0; e < exN; e++) {
        gh[28 + e * 4]     = ex[e].cx || 0;
        gh[28 + e * 4 + 1] = ex[e].cy || 0;
        gh[28 + e * 4 + 2] = ex[e].r || 0;
        gh[28 + e * 4 + 3] = ex[e].blastScale || 0;
      }
      // guests meta from lane GS_META_BASE + ring vertices from GS_RING_BASE
      // (v26.05; layout derived since v26.09): per guest, meta = (cx, cy,
      // hw, hh) + (active, ringN, _, _); ring = up to GS_RING x (x, y, vx,
      // vy). A guest without a valid ring is skipped entirely (the kernels
      // only ever walk real silhouettes).
      var gu = gs.guests || [];
      var guN = gu.length;
      if (guN > GS_MAX_GUESTS) guN = GS_MAX_GUESTS;
      for (var q = 0; q < guN; q++) {
        var pts = gu[q].pts;
        var ptN = pts ? (pts.length >> 2) : 0;
        if (ptN < 3) continue;
        if (ptN > GS_RING) ptN = GS_RING;
        // v26.10 — guest mean velocity (motion-aware lateral eviction in
        // the grid kernel). v26.13 derives it from the face velocities for
        // hosts that omit mvx/mvy, which also gives substep interpolation a
        // coherent centre path for the banya and direct-pointer guest.
        var hasMean = typeof gu[q].mvx === 'number' && isFinite(gu[q].mvx) &&
                      typeof gu[q].mvy === 'number' && isFinite(gu[q].mvy);
        var gmvx = hasMean ? gu[q].mvx : 0;
        var gmvy = hasMean ? gu[q].mvy : 0;
        if (!hasMean) {
          for (var pm = 0; pm < ptN; pm++) {
            var pmBase = pm * 4;
            var pmvx = pts[pmBase + 2] || 0;
            var pmvy = pts[pmBase + 3] || 0;
            var pmSp2 = pmvx * pmvx + pmvy * pmvy;
            if (LIQUID_MAX_VEL > 0 && pmSp2 > LIQUID_MAX_VEL * LIQUID_MAX_VEL) {
              var pmSc = LIQUID_MAX_VEL / Math.sqrt(pmSp2);
              pmvx *= pmSc; pmvy *= pmSc;
            }
            gmvx += pmvx; gmvy += pmvy;
          }
          gmvx /= ptN; gmvy /= ptN;
        }
        var gmSp2 = gmvx * gmvx + gmvy * gmvy;
        var gmMax = LIQUID_MAX_VEL;
        if (gmMax > 0 && gmSp2 > gmMax * gmMax) {
          var gmSc = gmMax / Math.sqrt(gmSp2);
          gmvx *= gmSc; gmvy *= gmSc;
        }
        gh[GS_META_BASE + q * 8]     = (gu[q].x || 0) - gmvx * backTime;
        gh[GS_META_BASE + q * 8 + 1] = (gu[q].y || 0) - gmvy * backTime;
        gh[GS_META_BASE + q * 8 + 2] = gu[q].hw || 0;
        gh[GS_META_BASE + q * 8 + 3] = gu[q].hh || 0;
        gh[GS_META_BASE + q * 8 + 4] = 1;
        gh[GS_META_BASE + q * 8 + 5] = ptN;
        gh[GS_META_BASE + q * 8 + 6] = gmvx;
        gh[GS_META_BASE + q * 8 + 7] = gmvy;
        var base = GS_RING_BASE + q * GS_RING * 4;
        for (var pk = 0; pk < ptN; pk++) {
          var pBase = pk * 4;
          var gvx = pts[pBase + 2] || 0;
          var gvy = pts[pBase + 3] || 0;
          var gvSp2 = gvx * gvx + gvy * gvy;
          if (gmMax > 0 && gvSp2 > gmMax * gmMax) {
            var gvSc = gmMax / Math.sqrt(gvSp2);
            gvx *= gvSc; gvy *= gvSc;
          }
          gh[base + pBase]     = (pts[pBase] || 0) - gvx * backTime;
          gh[base + pBase + 1] = (pts[pBase + 1] || 0) - gvy * backTime;
          gh[base + pBase + 2] = gvx;
          gh[base + pBase + 3] = gvy;
        }
      }
      // counts vec4 — lanes 8-11: (nozzleCount, explosionCount, playerVx, playerVy).
      gh[8] = nozN;
      gh[9] = exN;
      // v24.125 — rig velocity (counts.zw) for the silhouette coupling in
      // gridWake: the kernel speed-gates the plow eject from it AND pins
      // in-silhouette cells to the hull velocity when static (rigid
      // boundary). edit² sluice.js 070 liquidApplyPlayerGridWake.
      if (pl && pl.active) {
        gh[10] = pl.vx || 0;
        gh[11] = pl.vy || 0;
      }
      }
      instance.queue.writeBuffer(bufs[slot], 0, gh);
    }
  }

  /* ---- Per-material property table (material-id generalization) ------
   * Index = material id: 0 water, 1 oil (lava/acid/mud/glowmilk become rows
   * 2..5 in the staged refactor). Each row holds the per-material physics
   * constants that USED to be water/oil scalar pairs; writeSimParams sources
   * the SimParams lanes from it, so adding a liquid is adding a row instead of
   * editing the packer. Mirrors sluice.js LIQUID_MATS (the edit² lockstep);
   * at the default water/oil values the SimParams bytes are unchanged, so the
   * boot self-tests still pass with the same diffs. The N-material weighted
   * cell blend that consumes the rest of each row lands in the next step.
   * -------------------------------------------------------------------- */
  var LIQUID_MATS = [
    { name: 'water',
      gravity: LIQUID_GRAVITY,         pressureStiff: LIQUID_PRESSURE_STIFF,
      aerBlur: LIQUID_AERATION_BLUR,   aerDamp: LIQUID_AERATION_DAMP,
      wallBounceIn: LIQUID_WALL_BOUNCE_IN, wallBounceEdge: LIQUID_WALL_BOUNCE_EDGE,
      floorFriction: LIQUID_FLOOR_FRICTION, wallFriction: LIQUID_WALL_FRICTION,
      motionScale: LIQUID_WATER_MOTION_SCALE, damping: LIQUID_DAMPING,
      aerThreshold: LIQUID_AERATION_THRESHOLD, aerCoeff: LIQUID_AERATION_COEFF,
      bounce: LIQUID_BOUNCE_WATER },
    { name: 'oil',
      gravity: LIQUID_OIL_GRAVITY,     pressureStiff: LIQUID_OIL_PRESSURE_STIFF,
      aerBlur: LIQUID_OIL_AERATION_BLUR, aerDamp: LIQUID_OIL_AERATION_DAMP,
      wallBounceIn: LIQUID_OIL_WALL_BOUNCE_IN, wallBounceEdge: LIQUID_OIL_WALL_BOUNCE_EDGE,
      floorFriction: LIQUID_OIL_FLOOR_FRICTION, wallFriction: LIQUID_OIL_WALL_FRICTION,
      motionScale: LIQUID_WATER_MOTION_SCALE, damping: LIQUID_OIL_DAMPING,
      aerThreshold: LIQUID_OIL_AERATION_THRESHOLD, aerCoeff: LIQUID_OIL_AERATION_COEFF,
      bounce: LIQUID_BOUNCE_OIL }
  ];

  /* ---- v14.26 — fill + push the SimParams uniform --------------------
   * Pack the module's live fluid-feel physics vars into the 52-lane f32
   * staging array (13 vec4 — see the WGSL_SIM_PARAMS banner for the field
   * map) and writeBuffer it. Called before every kernel that reads `sp`
   * (the live runFrame chain AND each harness run* call), so a setSimParam
   * mutation is picked up on the very next step with no recompile.
   *
   * The lane order MUST match the WGSL SimParams struct exactly:
   *   0-3   grav   : gravity, oilGravity, pressureStiff, oilPressureStiff
   *   4-7   aer    : aerBlur, aerDamp, oilAerBlur, oilAerDamp
   *   8-11  bound  : wallBounceIn, wallBounceEdge, floorFriction, wallFriction
   *   12-15 oilBnd : oilWallBounceIn, oilWallBounceEdge, oilFloorFriction,
   *                  oilWallFriction
   *   16-19 g2pA   : waterMotionScale, damping, oilDamping, aerThreshold
   *   20-23 g2pB   : oilAerThreshold, aerCoeff, oilAerCoeff, calm (v24.145)
   *   24-27 coll   : bounceWater, bounceOil, gridVisc, dbgFlags
   *   28-31 g2pC   : maxVel, burstDamp, burstGateLo, burstGateHi (v24.173)
   *   48-51 quiet  : low-energy viscosity, speed gate, shear gate, support
   * Filled from the same LIQUID_* numbers the WGSL `${...}` literals used
   * before v14.26 — at default values the GPU sees byte-identical input,
   * so the boot self-tests still pass with unchanged diffs.
   * -------------------------------------------------------------------- */
  function writeSimParams(instance) {
    var sh = instance.simParamsHost;
    if (!sh) return;
    // v23.x — sourced from the LIQUID_MATS table (water = row 0, oil = row 1)
    // instead of scalar pairs. Lane order unchanged, so the bytes are identical
    // at default values and the self-test diffs do not move.
    var w = LIQUID_MATS[0], o = LIQUID_MATS[1];
    // grav : gravity, oilGravity, pressureStiff, oilPressureStiff
    sh[0]  = w.gravity;        sh[1]  = o.gravity;
    sh[2]  = w.pressureStiff;  sh[3]  = o.pressureStiff;
    // aer : aerBlur, aerDamp, oilAerBlur, oilAerDamp
    sh[4]  = w.aerBlur;        sh[5]  = w.aerDamp;
    sh[6]  = o.aerBlur;        sh[7]  = o.aerDamp;
    // bound (water) : wallBounceIn, wallBounceEdge, floorFriction, wallFriction
    sh[8]  = w.wallBounceIn;   sh[9]  = w.wallBounceEdge;
    sh[10] = w.floorFriction;  sh[11] = w.wallFriction;
    // oilBnd (oil)
    sh[12] = o.wallBounceIn;   sh[13] = o.wallBounceEdge;
    sh[14] = o.floorFriction;  sh[15] = o.wallFriction;
    // g2pA : waterMotionScale, damping, oilDamping, aerThreshold
    sh[16] = w.motionScale;    sh[17] = w.damping;
    sh[18] = o.damping;        sh[19] = w.aerThreshold;
    // g2pB : oilAerThreshold, aerCoeff, oilAerCoeff, calm (v24.145)
    sh[20] = o.aerThreshold;   sh[21] = w.aerCoeff;
    sh[22] = o.aerCoeff;       sh[23] = LIQUID_CALM;
    // coll : bounceWater, bounceOil, gridVisc (v24.115), dbgFlags (v24.120)
    sh[24] = w.bounce;         sh[25] = o.bounce;
    sh[26] = LIQUID_GRID_VISC; sh[27] = LIQUID_DBG_FLAGS;
    // g2pC : maxVel, burstDamp, burstGateLo, burstGateHi (v24.173 Old-Faithful)
    sh[28] = LIQUID_MAX_VEL;        sh[29] = LIQUID_BURST_DAMP;
    sh[30] = LIQUID_BURST_GATE_LO;  sh[31] = LIQUID_BURST_GATE_HI;
    // feel : cohesion, airDrag, pressureMaxDv (v25.41), lipFriction (v25.45)
    sh[32] = LIQUID_COHESION;        sh[33] = LIQUID_AIR_DRAG;
    sh[34] = LIQUID_PRESSURE_MAX_DV; sh[35] = LIQUID_LIP_FRICTION;
    // bathA/B/C : v25.56 BATHHOUSE B1 (docs/game/BATHHOUSE_PLAN.md). Every
    // heat term multiplies by T (0 at ambient), so with BATH_ON = 0 or
    // all-zero heat the kernels are byte-identical and the boot self-tests
    // hold with unchanged diffs (plan decision B-D1).
    sh[36] = LIQUID_BATH_EXCHANGE;  sh[37] = LIQUID_BATH_COOL;
    sh[38] = LIQUID_BATH_BUOY;      sh[39] = LIQUID_BATH_ON;
    sh[40] = LIQUID_BATH_SRC_X0;    sh[41] = LIQUID_BATH_SRC_Y0;
    sh[42] = LIQUID_BATH_SRC_X1;    sh[43] = LIQUID_BATH_SRC_Y1;
    sh[44] = LIQUID_BATH_SRC_T;     sh[45] = LIQUID_BATH_SRC_RATE;
    sh[46] = 0; sh[47] = 0;
    // quiet : v26.53 two-scale rest filter. Module boot stays zero; the game
    // and standalone host push their chosen live values afterward.
    sh[48] = LIQUID_QUIET_VISC;  sh[49] = LIQUID_QUIET_SPEED;
    sh[50] = LIQUID_QUIET_SHEAR; sh[51] = LIQUID_QUIET_DRAG;
    instance.queue.writeBuffer(instance.simParamsBuf, 0, sh);
  }

  // Run the 4 count-sort kernels in one command encoder:
  //   clearCells  -> zero cellCount over the active grid
  //   countCells  -> per particle, cellOf[i] + atomicAdd(cellCount)
  //   prefixSum   -> exclusive scan cellCount -> cellStart (3 passes)
  //   (copy)      -> cellStart -> cellCursor for the scatter
  //   scatter     -> per particle, sortedIdx[atomicAdd(cellCursor)] = i
  // Assumes uploadParticles() + computeGridBounds() already ran.
  // v14.7 — per-frame compute-submit batcher. runFrame sets instance.batchCBs
  // to an array; each stage (buildGrid/runP2G/runGrid2/runG2P/runCollide)
  // routes its command buffer here, and runFrame submits them all in one
  // queue.submit instead of five — one submit's worth of CPU + driver
  // overhead, and fewer CPU<->GPU handoff points. Standalone callers (the
  // self-tests) leave batchCBs null, so each stage submits itself as before.
  function liquidSubmit(instance, enc) {
    var cb = enc.finish();
    if (instance.batchCBs) { instance.batchCBs.push(cb); }
    else { instance.queue.submit([cb]); }
  }

  function buildGrid(instance, clearPrev) {
    if (!instance.gridReady) return;
    var g = instance.grid;
    if (!g || g.cells <= 0) return;
    var count = instance.uploadedCount | 0;
    var dev = instance.device;
    var P = instance.pipe;

    /* ---- v15.0 SPARSE build ------------------------------------------
     * Two compute passes + one 16-byte copy, zero full-grid dispatches:
     *   A: [deferred clear of the PREVIOUS sub-step's active blocks] ->
     *      bitmapReset(1 wg) -> countCells+mark(particles) ->
     *      blockCompact(1 wg, writes the args blockMeta)
     *   copy blockMeta -> blockDispatch (transfer scope; Dawn forbids one
     *      buffer being writable storage AND the indirect source in a pass)
     *   B: scanLocal/scanBlocks/scanAdd over the ACTIVE blocks only
     *      (indirect; scanAdd also seeds cellCursor, retiring the dense
     *      cellStart->cellCursor copy) -> scatter(particles).
     * Relies on the global-zero invariant for cellCount (no clear pass):
     * within a frame, sub-step N's dirt is cleared here at the head of
     * sub-step N+1 (clearPrev — same grid mapping, prev args still in
     * blockDispatch/blockList); the LAST sub-step's dirt is cleared by
     * runFrame's end-of-frame runSparseEndClear, BEFORE the mapping can
     * change. denseClearAll covers seeds/handoffs/harness runs.
     * ------------------------------------------------------------------ */
    if (useSparse(instance)) {
      var encS = dev.createCommandEncoder({ label: 'liquid.buildGridSparse' });
      var partGroupsS = Math.max(1, Math.ceil(count / WG));
      // Pass A — [deferred prev clear] + mark + compact.
      var cpA = encS.beginComputePass({ label: 'liquid.gridSparseMark' });
      if (clearPrev) {
        cpA.setPipeline(P.clearCountSparse);
        cpA.setBindGroup(0, instance.bg.grid);
        cpA.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
        cpA.setPipeline(instance.p2gPipe.clearSparse);
        cpA.setBindGroup(0, instance.p2gBG);
        cpA.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
        cpA.setPipeline(instance.grid2Pipe.clearGrid2Sparse);
        cpA.setBindGroup(0, instance.gridUpdateBG);
        cpA.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
        // v25.56 BATH B1: pressure-layout share (cellHeat).
        if (instance.grid2Pipe.heatClearSparse) {
          cpA.setPipeline(instance.grid2Pipe.heatClearSparse);
          cpA.setBindGroup(0, instance.pressureBG);
          cpA.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
        }
      }
      cpA.setBindGroup(0, instance.bg.grid);
      cpA.setPipeline(P.bitmapReset);
      cpA.dispatchWorkgroups(1);
      if (count > 0) {
        cpA.setPipeline(P.countCellsMark);
        cpA.dispatchWorkgroups(partGroupsS);
      }
      cpA.setPipeline(P.blockCompact);
      cpA.dispatchWorkgroups(1);
      cpA.end();
      // Publish the GPU-written args to the INDIRECT-only buffer (transfer
      // scope — Dawn validates buffer usage per compute pass, so the
      // storage-written blockMeta cannot itself be the indirect source).
      encS.copyBufferToBuffer(instance.buf.blockMeta, 0,
                              instance.buf.blockDispatch, 0, 16);
      // Pass B — the sparse count-sort scan + scatter, sized by the GPU.
      var cpS = encS.beginComputePass({ label: 'liquid.gridSparseScan' });
      cpS.setBindGroup(0, instance.bg.grid);
      cpS.setPipeline(P.scanLocalSparse);
      cpS.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
      cpS.setPipeline(P.scanBlocksSparse);
      cpS.dispatchWorkgroups(1);
      cpS.setPipeline(P.scanAddSparse);
      cpS.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
      if (count > 0) {
        cpS.setPipeline(P.scatter);
        cpS.dispatchWorkgroups(partGroupsS);
      }
      cpS.end();
      liquidSubmit(instance, encS);
      return;
    }

    var enc = dev.createCommandEncoder({ label: 'liquid.buildGrid' });

    var cellGroups  = Math.ceil(g.cells / WG);
    var partGroups  = Math.max(1, Math.ceil(count / WG));
    var blockGroups = Math.ceil(g.cells / WG);   // == scan blocks in use

    var cp = enc.beginComputePass({ label: 'liquid.grid' });

    // 1. clearCells — zero cellCount[0 .. cells).
    cp.setPipeline(P.clearCells);
    cp.setBindGroup(0, instance.bg.grid);
    cp.dispatchWorkgroups(cellGroups);

    if (count > 0) {
      // 2. countCells — per particle: cellOf + atomicAdd(cellCount).
      cp.setPipeline(P.countCells);
      cp.setBindGroup(0, instance.bg.grid);
      cp.dispatchWorkgroups(partGroups);
    }

    // 3a. prefixSum pass A — per-workgroup local scan of cellCount into
    //     cellStart, plus each workgroup's total into blockSums.
    cp.setPipeline(P.scanLocal);
    cp.setBindGroup(0, instance.bg.grid);
    cp.dispatchWorkgroups(blockGroups);

    // 3b. prefixSum pass B — a single workgroup exclusive-scans the
    //     blockSums array in place (<= 4096 entries).
    cp.setPipeline(P.scanBlocks);
    cp.setBindGroup(0, instance.bg.grid);
    cp.dispatchWorkgroups(1);

    // 3c. prefixSum pass C — add each block's scanned base back onto
    //     its cellStart segment, yielding the global exclusive scan.
    cp.setPipeline(P.scanAdd);
    cp.setBindGroup(0, instance.bg.grid);
    cp.dispatchWorkgroups(blockGroups);

    cp.end();

    // 4a. copy cellStart -> cellCursor (the scatter consumes a mutable
    //     copy; cellStart itself must survive for the P2G/G2P walks).
    enc.copyBufferToBuffer(instance.buf.cellStart, 0,
                           instance.buf.cellCursor, 0, g.cells * 4);

    if (count > 0) {
      // 4b. scatter — per particle: slot = atomicAdd(cellCursor[cell]);
      //     sortedIdx[slot] = i.
      var cp2 = enc.beginComputePass({ label: 'liquid.scatter' });
      cp2.setPipeline(P.scatter);
      cp2.setBindGroup(0, instance.bg.grid);
      cp2.dispatchWorkgroups(partGroups);
      cp2.end();
    }

    liquidSubmit(instance, enc);
  }

  // Debug only: copy a storage buffer back to the CPU via a transient
  // MAP_READ buffer. Returns a Promise<ArrayBuffer>. The shipped hot
  // path never reads back — this is for stage verification.
  function readbackBuffer(instance, srcBuf, byteLen) {
    var dev = instance.device;
    var rb = dev.createBuffer({
      label: 'liquid.readback',
      size: byteLen,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
    var enc = dev.createCommandEncoder();
    enc.copyBufferToBuffer(srcBuf, 0, rb, 0, byteLen);
    instance.queue.submit([enc.finish()]);
    return rb.mapAsync(GPUMapMode.READ).then(function () {
      var copy = rb.getMappedRange().slice(0);
      rb.unmap();
      rb.destroy();
      return copy;
    });
  }

  // Stage 1 verification: upload the live CPU particle state, read the
  // pos + flag buffers back, unpack, and diff against the CPU arrays.
  // A clean round-trip proves the buffer layout + pack/unpack indexing.
  function runStage1SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 1: no liquid arrays wired — buffers built, self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 1: 0 live particles — buffers built, self-test deferred.'); } catch (_) {}
      return;
    }
    // Snapshot the CPU arrays at the instant of upload. The CPU MPM
    // solver keeps mutating them every frame and the GPU readback
    // resolves asynchronously, so the diff must be against this frozen
    // copy — not the live (already-moved) arrays.
    var a = L.arrays;
    var snap = {
      x: a.x.slice(0, count), y: a.y.slice(0, count),
      vx: a.vx.slice(0, count), vy: a.vy.slice(0, count),
      type: a.type.slice(0, count), sleeping: a.sleeping.slice(0, count),
      frozen: a.frozen.slice(0, count), restFrames: a.restFrames.slice(0, count)
    };
    Promise.all([
      readbackBuffer(instance, instance.buf.pos,  count * 16),
      readbackBuffer(instance, instance.buf.flag, count * 4)
    ]).then(function (res) {
      var pos = new Float32Array(res[0]);
      var flag = new Uint32Array(res[1]);
      var maxPosDiff = 0, flagFails = 0;
      for (var i = 0; i < count; i++) {
        var p = i * 4;
        var d0 = Math.abs(pos[p] - snap.x[i]);
        var d1 = Math.abs(pos[p + 1] - snap.y[i]);
        var d2 = Math.abs(pos[p + 2] - snap.vx[i]);
        var d3 = Math.abs(pos[p + 3] - snap.vy[i]);
        if (d0 > maxPosDiff) maxPosDiff = d0;
        if (d1 > maxPosDiff) maxPosDiff = d1;
        if (d2 > maxPosDiff) maxPosDiff = d2;
        if (d3 > maxPosDiff) maxPosDiff = d3;
        var f = flag[i];
        if ((f & 3) !== snap.type[i] ||
            ((f >> 4) & 1) !== snap.sleeping[i] ||
            ((f >> 5) & 1) !== snap.frozen[i] ||
            ((f >> 8) & 0xffff) !== snap.restFrames[i]) flagFails++;
      }
      var ok = maxPosDiff < 1e-3 && flagFails === 0;
      try {
        console.log('LiquidWGPU Stage 1: round-trip ' + (ok ? 'OK' : 'FAIL') +
          ' — ' + count + ' particles, maxPosDiff=' + maxPosDiff.toExponential(2) +
          ', flagFails=' + flagFails);
      } catch (_) {}
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 1: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
  }

  // Stage 2 verification: upload the live particle state, build the GPU
  // spatial grid, then read cellCount + cellStart + sortedIdx back and
  // diff against a CPU reference count-sort over the SAME snapshot.
  //
  // What it proves:
  //   - countCells lands every particle in the right flat cell index.
  //   - prefixSum produces exact exclusive offsets (cellStart).
  //   - scatter fills sortedIdx as a stable per-cell grouping.
  //
  // Snapshot discipline: the CPU MPM solver mutates the arrays every
  // frame and the GPU readback is async, so the reference is computed
  // over a frozen copy taken at upload time — never the live arrays.
  function runStage2SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 2: no liquid arrays wired — grid built, self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 2: 0 live particles — grid self-test deferred.'); } catch (_) {}
      return;
    }
    // Freeze positions BEFORE building the grid / before any further
    // CPU sim step can move them.
    var a = L.arrays;
    var snapX = a.x.slice(0, count);
    var snapY = a.y.slice(0, count);

    // GPU: bounds from the same snapshot, then the 4-kernel build.
    computeGridBounds(instance, count);
    var g = instance.grid;
    buildGrid(instance);

    // CPU reference count-sort over the frozen snapshot.
    var cells = g.cells;
    var inv = 1 / instance.cellSize;
    var refCount = new Uint32Array(cells);
    var refCellOf = new Uint32Array(count);
    var i, c;
    for (i = 0; i < count; i++) {
      var cx = Math.floor(snapX[i] * inv) - g.originX;
      var cy = Math.floor(snapY[i] * inv) - g.originY;
      if (cx < 0) cx = 0; if (cx >= g.w) cx = g.w - 1;
      if (cy < 0) cy = 0; if (cy >= g.h) cy = g.h - 1;
      c = cy * g.w + cx;
      refCellOf[i] = c;
      refCount[c]++;
    }
    var refStart = new Uint32Array(cells);
    var acc = 0;
    for (c = 0; c < cells; c++) { refStart[c] = acc; acc += refCount[c]; }
    var refSorted = new Uint32Array(count);
    var cursor = refStart.slice(0);
    for (i = 0; i < count; i++) {
      c = refCellOf[i];
      refSorted[cursor[c]++] = i;
    }
    var nonEmpty = 0;
    for (c = 0; c < cells; c++) { if (refCount[c] > 0) nonEmpty++; }

    Promise.all([
      readbackBuffer(instance, instance.buf.cellCount, cells * 4),
      readbackBuffer(instance, instance.buf.cellStart, cells * 4),
      readbackBuffer(instance, instance.buf.sortedIdx, count * 4)
    ]).then(function (res) {
      var gpuCount  = new Uint32Array(res[0]);
      var gpuStart  = new Uint32Array(res[1]);
      var gpuSorted = new Uint32Array(res[2]);
      var fail = '';

      // (a) per-cell count must match exactly.
      var countMismatch = 0, firstCountCell = -1;
      for (var k = 0; k < cells; k++) {
        if (gpuCount[k] !== refCount[k]) {
          countMismatch++;
          if (firstCountCell < 0) firstCountCell = k;
        }
      }
      if (countMismatch) {
        fail = 'cellCount mismatch in ' + countMismatch + ' cells (first cell ' +
          firstCountCell + ': gpu=' + gpuCount[firstCountCell] +
          ' ref=' + refCount[firstCountCell] + ')';
      }

      // (b)+(c) v15.0 — under the sparse grid, cellStart is an exclusive
      // scan in ACTIVE-BLOCK compaction order, not the dense row-major
      // order the CPU reference computes, so the offset VALUES are not
      // comparable (they were never load-bearing). What every consumer
      // (scatter, declump's neighbour walks) relies on is the count-sort
      // CONTRACT, which is what is verified now, driven by the GPU's own
      // offsets: each cell's segment [start, start+count) must stay inside
      // [0, totalBinned), never overlap another cell's segment, and hold
      // exactly that cell's particles (order-free — the scatter races
      // within a cell on both paths). The same check passes for the dense
      // path, whose offsets also satisfy the contract.
      if (!fail) {
        var total = 0;
        for (var t = 0; t < cells; t++) { total += refCount[t]; }
        var slotSeen = new Uint8Array(total);
        var sortMismatch = 0, firstSortCell = -1;
        for (var cc = 0; cc < cells && sortMismatch === 0; cc++) {
          var n = refCount[cc];
          if (n === 0) continue;
          var base = gpuStart[cc];
          var bad = false;
          if (base + n > total) {
            bad = true;   // segment escapes the binned range
          } else {
            var seen = {};
            for (var j = 0; j < n; j++) {
              if (slotSeen[base + j]) { bad = true; break; }   // overlap
              slotSeen[base + j] = 1;
              var idx = gpuSorted[base + j];
              if (idx >= count || refCellOf[idx] !== cc || seen[idx]) { bad = true; break; }
              seen[idx] = 1;
            }
          }
          if (bad) { sortMismatch++; firstSortCell = cc; }
        }
        if (sortMismatch) {
          fail = 'sortedIdx segment contract broken for cell ' + firstSortCell;
        }
      }

      if (fail) {
        try {
          console.log('LiquidWGPU Stage 2: grid FAIL — ' + fail +
            ' (' + count + ' particles, grid ' + g.w + 'x' + g.h + ').');
        } catch (_) {}
      } else {
        try {
          console.log('LiquidWGPU Stage 2: grid OK — ' + count +
            ' particles, ' + nonEmpty + ' non-empty cells.');
        } catch (_) {}
      }
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 2: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
  }

  /* ---- Stage 3 verification — P2G --------------------------------------
   * Upload the live particle state, build the grid, run clear+P2G+
   * normalize on the GPU, read cellMass/cellVX/cellVY/cellAeration back
   * and diff against a compact CPU re-implementation of liquidP2G over
   * the SAME frozen snapshot.
   *
   * What it proves:
   *   - the 3x3 quadratic-B-spline weights + base-cell math are right.
   *   - the APIC affine correction (per-corner momentum) is faithful.
   *   - the fixed-point i32 atomic scatter round-trips within quantum.
   *   - mass conservation: every non-frozen particle's 9 weights sum to
   *     1, so sum(cellMass) ~= awake-particle count.
   *
   * Snapshot discipline: the CPU MPM solver mutates the arrays every
   * frame and the readback is async — the reference runs over a copy
   * frozen at upload time, never the live arrays.
   * -------------------------------------------------------------------- */
  function runStage3SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 3: no liquid arrays wired — P2G kernels built, self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 3: 0 live particles — P2G self-test deferred.'); } catch (_) {}
      return;
    }
    // Freeze every input liquidP2G reads, BEFORE any further CPU step.
    var a = L.arrays;
    var snap = {
      x: a.x.slice(0, count),     y: a.y.slice(0, count),
      vx: a.vx.slice(0, count),   vy: a.vy.slice(0, count),
      g00: a.g00.slice(0, count), g01: a.g01.slice(0, count),
      g10: a.g10.slice(0, count), g11: a.g11.slice(0, count),
      aeration: a.aeration.slice(0, count),
      type: a.type.slice(0, count), frozen: a.frozen.slice(0, count)
    };

    // GPU: grid bounds (with the Stage-3 stencil margin) from the same
    // snapshot, build the count-sort grid, then clear+scatter+normalize.
    computeGridBounds(instance, count);
    var g = instance.grid;
    buildGrid(instance);
    runP2G(instance);

    // ---- CPU reference — a bit-faithful re-implementation of the P2G ----
    // kernels over the snapshot, on the SAME dense grid the GPU indexes
    // (flat = (gy-oy)*gridW + (gx-ox); the 1-cell margin keeps the full
    // 3x3 stencil of every non-frozen particle inside [0, cells)).
    //
    // Two faithfulness rules, both load-bearing:
    //  1. f32 arithmetic — the WGSL kernel works in f32 and JS numbers
    //     are f64. A plain f64 reference can land floor(lx) on the wrong
    //     side of an integer boundary, shifting a particle's whole 3x3
    //     stencil one cell over. So every op is wrapped in Math.fround
    //     (== a WGSL f32 op) and stepDt/invCell come from the uniform's
    //     f32 lanes — the exact bits the GPU reads.
    //  2. fixed-point accumulation — the GPU accumulates i32
    //     atomicAdd(encodeFx(v)); summing raw f64 weights instead and
    //     diffing afterwards lets quantization leak. In particular a
    //     cell whose mass quantizes to 0 must take the same
    //     normalize branch on both sides. So the reference accumulates
    //     into Int32Array fixed-point cells with enc()==encodeFx and
    //     runs the identical mass>0 normalize. The diff is then pure
    //     round() tie noise (~0).
    var fr = Math.fround;
    var FX = FIXED_SCALE;
    // == WGSL encodeFx: i32(round(v * FIXED_SCALE)). The multiply is an
    // f32 op (fr); round() ties differ from WGSL's round-half-to-even
    // only on an exact N.5, where the gap is one 2^-20 unit — far under
    // the self-test tolerance. `| 0` wraps to i32 like the GPU atomic.
    function enc(v) { return Math.round(fr(v * FX)) | 0; }
    var cells = g.cells;
    var inv = instance.paramsHostF[7];   // f32 invCell — same as GPU
    var dt = instance.paramsHostF[6];    // f32 stepDt  — same as GPU
    var ox = g.originX, oy = g.originY, gw = g.w;
    // Fixed-point cell accumulators — mirror the GPU's atomic<i32>.
    var refMassFx = new Int32Array(cells);
    var refAerFx  = new Int32Array(cells);
    var refVXFx   = new Int32Array(cells);
    var refVYFx   = new Int32Array(cells);
    var awake = 0;
    var i;
    for (i = 0; i < count; i++) {
      if (snap.frozen[i]) continue;
      awake++;
      var lx = fr(fr(snap.x[i]) * inv);
      var ly = fr(fr(snap.y[i]) * inv);
      var pvx = fr(fr(fr(snap.vx[i]) * dt) * inv);
      var pvy = fr(fr(fr(snap.vy[i]) * dt) * inv);
      var gx = Math.floor(lx);
      var gy = Math.floor(ly);
      var dx = fr(fr(fr(gx) + 0.5) - lx);
      var dy = fr(fr(fr(gy) + 0.5) - ly);
      var wx0 = fr(fr(fr(dx + 0.5) * fr(dx + 0.5)) * 0.5);
      var wx1 = fr(0.75 - fr(dx * dx));
      var wx2 = fr(fr(fr(dx - 0.5) * fr(dx - 0.5)) * 0.5);
      var wy0 = fr(fr(fr(dy + 0.5) * fr(dy + 0.5)) * 0.5);
      var wy1 = fr(0.75 - fr(dy * dy));
      var wy2 = fr(fr(fr(dy - 0.5) * fr(dy - 0.5)) * 0.5);
      var g00 = fr(snap.g00[i]), g01 = fr(snap.g01[i]),
          g10 = fr(snap.g10[i]), g11 = fr(snap.g11[i]);
      var cvx = fr(fr(pvx + fr(g00 * dx)) + fr(g01 * dy));
      var cvy = fr(fr(pvy + fr(g10 * dx)) + fr(g11 * dy));
      var aer = fr(snap.aeration[i]);
      var bx = gx - ox, by = gy - oy;
      // Each stencil corner: dense cell index + (mass weight, the
      // affine-corrected corner velocity for momentum). The corner
      // velocities expand the CPU literals; each add is an f32 op.
      var corner = [
        [(by - 1) * gw + bx - 1, fr(wx0 * wy0), fr(fr(cvx - g00) - g01), fr(fr(cvy - g10) - g11)],
        [(by - 1) * gw + bx,     fr(wx1 * wy0), fr(cvx - g01),           fr(cvy - g11)],
        [(by - 1) * gw + bx + 1, fr(wx2 * wy0), fr(fr(cvx + g00) - g01), fr(fr(cvy + g10) - g11)],
        [ by      * gw + bx - 1, fr(wx0 * wy1), fr(cvx - g00),           fr(cvy - g10)],
        [ by      * gw + bx,     fr(wx1 * wy1), cvx,                     cvy],
        [ by      * gw + bx + 1, fr(wx2 * wy1), fr(cvx + g00),           fr(cvy + g10)],
        [(by + 1) * gw + bx - 1, fr(wx0 * wy2), fr(fr(cvx - g00) + g01), fr(fr(cvy - g10) + g11)],
        [(by + 1) * gw + bx,     fr(wx1 * wy2), fr(cvx + g01),           fr(cvy + g11)],
        [(by + 1) * gw + bx + 1, fr(wx2 * wy2), fr(fr(cvx + g00) + g01), fr(fr(cvy + g10) + g11)]
      ];
      for (var s = 0; s < 9; s++) {
        var c = corner[s][0];
        if (c < 0 || c >= cells) continue;   // strays — GPU drops too
        var w = corner[s][1];
        // Mirror the GPU splat(): quantize each term then i32-add.
        refMassFx[c] += enc(w);
        refAerFx[c]  += enc(fr(w * aer));
        refVXFx[c]   += enc(fr(w * corner[s][2]));
        refVYFx[c]   += enc(fr(w * corner[s][3]));
      }
    }
    // Mass-normalize aeration — bit-mirror the p2gNormalize kernel:
    // decode mass + aeration from fixed-point (f32 ops, matching the
    // WGSL f32(atomicLoad(...)) / FIXED_SCALE), and only when the
    // decoded mass is > 0 re-encode aeration/mass in place.
    for (var ci = 0; ci < cells; ci++) {
      var cm = fr(fr(refMassFx[ci]) / FX);
      if (cm > 0) {
        var ca = fr(fr(refAerFx[ci]) / FX);
        refAerFx[ci] = enc(fr(ca / cm));
      }
    }
    // Decoded reference fields for the diff (same units as the GPU
    // decode below) + the decoded grid-total mass for the OK log.
    var refMass = new Float64Array(cells);
    var refAer  = new Float64Array(cells);
    var refVX   = new Float64Array(cells);
    var refVY   = new Float64Array(cells);
    var refTotalMass = 0;
    for (ci = 0; ci < cells; ci++) {
      refMass[ci] = refMassFx[ci] / FX;
      refAer[ci]  = refAerFx[ci] / FX;
      refVX[ci]   = refVXFx[ci] / FX;
      refVY[ci]   = refVYFx[ci] / FX;
      refTotalMass += refMass[ci];
    }

    Promise.all([
      readbackBuffer(instance, instance.buf.cellMass,     cells * 4),
      readbackBuffer(instance, instance.buf.cellVX,       cells * 4),
      readbackBuffer(instance, instance.buf.cellVY,       cells * 4),
      readbackBuffer(instance, instance.buf.cellAeration, cells * 4)
    ]).then(function (res) {
      var gm = new Int32Array(res[0]);
      var gvx = new Int32Array(res[1]);
      var gvy = new Int32Array(res[2]);
      var ga = new Int32Array(res[3]);
      var dec = 1 / FIXED_SCALE;
      var maxCellDiff = 0, worstCell = -1, worstField = '';
      var gpuTotalMass = 0;
      for (var k = 0; k < cells; k++) {
        var gMass = gm[k] * dec;
        var gVX   = gvx[k] * dec;
        var gVY   = gvy[k] * dec;
        var gAer  = ga[k] * dec;
        gpuTotalMass += gMass;
        var dM = Math.abs(gMass - refMass[k]);
        var dX = Math.abs(gVX - refVX[k]);
        var dY = Math.abs(gVY - refVY[k]);
        var dA = Math.abs(gAer - refAer[k]);
        if (dM > maxCellDiff) { maxCellDiff = dM; worstCell = k; worstField = 'mass'; }
        if (dX > maxCellDiff) { maxCellDiff = dX; worstCell = k; worstField = 'vx'; }
        if (dY > maxCellDiff) { maxCellDiff = dY; worstCell = k; worstField = 'vy'; }
        if (dA > maxCellDiff) { maxCellDiff = dA; worstCell = k; worstField = 'aeration'; }
      }
      // Mass conservation: each non-frozen particle's 9 weights sum to
      // 1 exactly, so the grid total must equal the awake count (within
      // fixed-point quantization scaled by 9 corners x cells touched).
      var massErr = Math.abs(gpuTotalMass - awake);
      var massTol = 0.02 + awake * 1e-5;

      var fail = '';
      if (maxCellDiff >= 0.02) {
        fail = 'cell ' + worstField + ' diff ' + maxCellDiff.toFixed(5) +
          ' at cell ' + worstCell + ' (gpu vs CPU reference)';
      } else if (massErr > massTol) {
        fail = 'mass not conserved — sum(cellMass)=' + gpuTotalMass.toFixed(3) +
          ' vs awake count ' + awake + ' (err ' + massErr.toFixed(4) + ')';
      }

      if (fail) {
        try {
          console.log('LiquidWGPU Stage 3: P2G FAIL — ' + fail +
            ' (' + count + ' particles, ' + awake + ' awake, grid ' +
            g.w + 'x' + g.h + ').');
        } catch (_) {}
      } else {
        try {
          console.log('LiquidWGPU Stage 3: P2G OK — ' + count +
            ' particles, maxCellDiff=' + maxCellDiff.toFixed(6) +
            ' (' + awake + ' awake, sum(cellMass)=' + gpuTotalMass.toFixed(2) +
            ' vs ' + refTotalMass.toFixed(2) + ' ref).');
        } catch (_) {}
      }
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 3: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
  }

  /* ---- Stage 4 verification — pressure + grid update -------------------
   * Upload the live particle state, run the full GPU per-frame sequence
   * (buildGrid -> P2G -> clearDV -> pressure -> gridUpdate), read back the
   * resolved per-cell velocity (cellVelX/cellVelY) plus the per-particle
   * density+aeration (aux.x/aux.y) and diff against a bit-faithful CPU
   * reference of the SAME scope.
   *
   * The reference scope deliberately MATCHES the GPU kernels — it ports
   * liquidApplyGridPressure in full plus the velocity+gravity core of
   * liquidUpdateGrid, but EXCLUDES the tile-boundary bounce/friction
   * (Stage 6) and the player/rocket/explosion wakes (Stage 8), exactly
   * as the GPU gridUpdate kernel does. A diff against the full CPU
   * liquidUpdateGrid would (correctly) fail wherever a cell sits in or
   * beside a solid tile.
   *
   * Faithfulness — same two rules as the Stage-3 reference:
   *  1. f32 arithmetic — every op wrapped in Math.fround so JS f64 cannot
   *     land a floor() on the wrong side of an integer boundary.
   *  2. fixed-point accumulation — the P2G cell fields and the pressure
   *     impulse are accumulated in Int32Array fixed-point with enc()==
   *     encodeFx; the pressure gather + grid-update read them back
   *     decoded (f32(x)/FIXED_SCALE) exactly as the WGSL atomicLoad path.
   *
   * Snapshot discipline: the CPU MPM solver mutates the arrays every
   * frame and the readback is async — the reference runs over a copy
   * frozen at upload time, never the live arrays.
   * -------------------------------------------------------------------- */
  function runStage4SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 4: no liquid arrays wired — pressure/grid kernels built, self-test skipped.'); } catch (_) {}
      return;
    }
    if (!instance.grid2Ready) {
      try { console.log('LiquidWGPU Stage 4: pressure/grid pipelines unavailable — self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 4: 0 live particles — pressure/grid self-test deferred.'); } catch (_) {}
      return;
    }
    // Freeze every input the P2G + pressure + grid-update reads, BEFORE
    // any further CPU step can move a particle.
    var a = L.arrays;
    var snap = {
      x: a.x.slice(0, count),     y: a.y.slice(0, count),
      vx: a.vx.slice(0, count),   vy: a.vy.slice(0, count),
      g00: a.g00.slice(0, count), g01: a.g01.slice(0, count),
      g10: a.g10.slice(0, count), g11: a.g11.slice(0, count),
      aeration: a.aeration.slice(0, count),
      type: a.type.slice(0, count),
      sleeping: a.sleeping.slice(0, count),
      frozen: a.frozen.slice(0, count)
    };

    // GPU: grid bounds from the snapshot, then the full per-frame chain.
    computeGridBounds(instance, count);
    var g = instance.grid;
    buildGrid(instance);
    runP2G(instance);
    runGrid2(instance);

    // ---- CPU reference — bit-faithful P2G + pressure + grid update ----
    var fr = Math.fround;
    var FX = FIXED_SCALE;
    // == WGSL encodeFx: i32(round(v * FIXED_SCALE)).
    function enc(v) { return Math.round(fr(v * FX)) | 0; }
    var cells = g.cells;
    var inv = instance.paramsHostF[7];   // f32 invCell — same bits as GPU
    var dt  = instance.paramsHostF[6];   // f32 stepDt  — same bits as GPU
    var ox = g.originX, oy = g.originY, gw = g.w;
    var i, s, ci;

    // --- Pass 1: P2G — fixed-point cell accumulators (mirror Stage 3) ---
    var refMassFx = new Int32Array(cells);
    var refOilFx  = new Int32Array(cells);
    var refAerFx  = new Int32Array(cells);
    var refVXFx   = new Int32Array(cells);
    var refVYFx   = new Int32Array(cells);
    for (i = 0; i < count; i++) {
      if (snap.frozen[i]) continue;        // P2G skips frozen only
      var lx = fr(fr(snap.x[i]) * inv);
      var ly = fr(fr(snap.y[i]) * inv);
      var pvx = fr(fr(fr(snap.vx[i]) * dt) * inv);
      var pvy = fr(fr(fr(snap.vy[i]) * dt) * inv);
      var gx = Math.floor(lx);
      var gy = Math.floor(ly);
      var dx = fr(fr(fr(gx) + 0.5) - lx);
      var dy = fr(fr(fr(gy) + 0.5) - ly);
      var wx0 = fr(fr(fr(dx + 0.5) * fr(dx + 0.5)) * 0.5);
      var wx1 = fr(0.75 - fr(dx * dx));
      var wx2 = fr(fr(fr(dx - 0.5) * fr(dx - 0.5)) * 0.5);
      var wy0 = fr(fr(fr(dy + 0.5) * fr(dy + 0.5)) * 0.5);
      var wy1 = fr(0.75 - fr(dy * dy));
      var wy2 = fr(fr(fr(dy - 0.5) * fr(dy - 0.5)) * 0.5);
      var g00 = fr(snap.g00[i]), g01 = fr(snap.g01[i]),
          g10 = fr(snap.g10[i]), g11 = fr(snap.g11[i]);
      var cvx = fr(fr(pvx + fr(g00 * dx)) + fr(g01 * dy));
      var cvy = fr(fr(pvy + fr(g10 * dx)) + fr(g11 * dy));
      var aer = fr(snap.aeration[i]);
      var oilW = snap.type[i] === 1 ? 1 : 0;
      var bx = gx - ox, by = gy - oy;
      var corner = [
        [(by - 1) * gw + bx - 1, fr(wx0 * wy0), fr(fr(cvx - g00) - g01), fr(fr(cvy - g10) - g11)],
        [(by - 1) * gw + bx,     fr(wx1 * wy0), fr(cvx - g01),           fr(cvy - g11)],
        [(by - 1) * gw + bx + 1, fr(wx2 * wy0), fr(fr(cvx + g00) - g01), fr(fr(cvy + g10) - g11)],
        [ by      * gw + bx - 1, fr(wx0 * wy1), fr(cvx - g00),           fr(cvy - g10)],
        [ by      * gw + bx,     fr(wx1 * wy1), cvx,                     cvy],
        [ by      * gw + bx + 1, fr(wx2 * wy1), fr(cvx + g00),           fr(cvy + g10)],
        [(by + 1) * gw + bx - 1, fr(wx0 * wy2), fr(fr(cvx - g00) + g01), fr(fr(cvy - g10) + g11)],
        [(by + 1) * gw + bx,     fr(wx1 * wy2), fr(cvx + g01),           fr(cvy + g11)],
        [(by + 1) * gw + bx + 1, fr(wx2 * wy2), fr(fr(cvx + g00) + g01), fr(fr(cvy + g10) + g11)]
      ];
      for (s = 0; s < 9; s++) {
        var c = corner[s][0];
        if (c < 0 || c >= cells) continue;
        var w = corner[s][1];
        refMassFx[c] += enc(w);
        refOilFx[c]  += enc(fr(oilW * w));
        refAerFx[c]  += enc(fr(w * aer));
        refVXFx[c]   += enc(fr(w * corner[s][2]));
        refVYFx[c]   += enc(fr(w * corner[s][3]));
      }
    }
    // p2gNormalize — mass-normalize aeration in place (mirror Stage 3).
    for (ci = 0; ci < cells; ci++) {
      var cm0 = fr(fr(refMassFx[ci]) / FX);
      if (cm0 > 0) {
        var ca0 = fr(fr(refAerFx[ci]) / FX);
        refAerFx[ci] = enc(fr(ca0 / cm0));
      }
    }

    // --- Pass 2: pressure — port of liquidApplyGridPressure ---
    // Per AWAKE particle (skip frozen OR sleeping): recompute the 3x3
    // stencil, gather density/aeration from the decoded cell fields,
    // store density into refDensity[i], advance refAerationOut[i], and
    // scatter the pressure impulse into the fixed-point refDVXFx/DVYFx.
    var refDVXFx = new Int32Array(cells);
    var refDVYFx = new Int32Array(cells);
    var refDensity     = new Float64Array(count);
    var refAerationOut = new Float64Array(count);
    var awake = 0;
    for (i = 0; i < count; i++) {
      if (snap.frozen[i] || snap.sleeping[i]) continue;
      awake++;
      var plx = fr(fr(snap.x[i]) * inv);
      var ply = fr(fr(snap.y[i]) * inv);
      var pgx = Math.floor(plx);
      var pgy = Math.floor(ply);
      var pdx = fr(fr(fr(pgx) + 0.5) - plx);
      var pdy = fr(fr(fr(pgy) + 0.5) - ply);
      var pwx0 = fr(fr(fr(pdx + 0.5) * fr(pdx + 0.5)) * 0.5);
      var pwx1 = fr(0.75 - fr(pdx * pdx));
      var pwx2 = fr(fr(fr(pdx - 0.5) * fr(pdx - 0.5)) * 0.5);
      var pwy0 = fr(fr(fr(pdy + 0.5) * fr(pdy + 0.5)) * 0.5);
      var pwy1 = fr(0.75 - fr(pdy * pdy));
      var pwy2 = fr(fr(fr(pdy - 0.5) * fr(pdy - 0.5)) * 0.5);
      var pbx = pgx - ox, pby = pgy - oy;
      var r0 = (pby - 1) * gw + pbx;
      var r1 =  pby      * gw + pbx;
      var r2 = (pby + 1) * gw + pbx;
      var nbr = [r0 - 1, r0, r0 + 1, r1 - 1, r1, r1 + 1, r2 - 1, r2, r2 + 1];
      var wgt = [
        fr(pwx0 * pwy0), fr(pwx1 * pwy0), fr(pwx2 * pwy0),
        fr(pwx0 * pwy1), fr(pwx1 * pwy1), fr(pwx2 * pwy1),
        fr(pwx0 * pwy2), fr(pwx1 * pwy2), fr(pwx2 * pwy2)
      ];
      // Gather — density/aeration from the decoded fixed-point cells.
      var density = 0, aeration = 0;
      for (s = 0; s < 9; s++) {
        var gc = nbr[s];
        var gw_ = wgt[s];
        density  = fr(density  + fr(gw_ * fr(fr(refMassFx[gc]) / FX)));
        aeration = fr(aeration + fr(gw_ * fr(fr(refAerFx[gc]) / FX)));
      }
      var oil = snap.type[i] === 1;
      var aerDamp = oil ? LIQUID_OIL_AERATION_DAMP : LIQUID_AERATION_DAMP;
      var aerBlur = oil ? LIQUID_OIL_AERATION_BLUR : LIQUID_AERATION_BLUR;
      var stiff   = oil ? LIQUID_OIL_PRESSURE_STIFF : LIQUID_PRESSURE_STIFF;
      var oldAer = fr(snap.aeration[i]);
      var newAer = fr(fr(aerDamp) * fr(oldAer + fr(fr(aeration - oldAer) * fr(aerBlur))));
      density = Math.min(density, LIQUID_DENS_CAP);   // v24.182 — anti-runaway cap (matches the WGSL min)
      refDensity[i] = density;
      refAerationOut[i] = newAer;
      var pressure = fr(fr(fr(density / fr(LIQUID_DENSITY)) - 1) * fr(stiff));
      // v25.41 — detachment cohesion (water only), matches the WGSL block.
      if (pressure < 0) {
        var dnR = fr(density / fr(LIQUID_DENSITY));
        var ck = fr(fr(fr(0.7) - dnR) * fr(1 / 0.3));
        if (ck < 0) ck = 0; else if (ck > 1) ck = 1;
        pressure = oil ? 0 : fr(-fr(fr(LIQUID_COHESION) * fr(stiff)) * ck);
      }
      if (density <= 0) pressure = 0;
      var volume = density > 0 ? fr(1 / density) : 0;
      var coeff  = fr(fr(volume * 4) * fr(-pressure));
      var coeffx = fr(coeff * pdx);
      var coeffy = fr(coeff * pdy);
      if (coeff !== 0) {
        var cxm = fr(coeffx - coeff), cxp = fr(coeffx + coeff);
        var cym = fr(coeffy - coeff), cyp = fr(coeffy + coeff);
        var ix = [cxm, coeffx, cxp, cxm, coeffx, cxp, cxm, coeffx, cxp];
        var iy = [cym, cym, cym, coeffy, coeffy, coeffy, cyp, cyp, cyp];
        for (s = 0; s < 9; s++) {
          var dc = nbr[s];
          var dw = wgt[s];
          refDVXFx[dc] += enc(fr(-fr(dw * ix[s])));
          refDVYFx[dc] += enc(fr(-fr(dw * iy[s])));
        }
      }
    }

    // --- Pass 3: grid update — velocity + gravity core ---
    // Per cell with mass: resolve velocity from (momentum + impulse)/mass
    // and add the oil-lerped gravity. Boundary + wake are deferred — the
    // GPU kernel omits them too, so the reference does as well.
    var refVelX = new Float64Array(cells);
    var refVelY = new Float64Array(cells);
    for (ci = 0; ci < cells; ci++) {
      var massC = fr(fr(refMassFx[ci]) / FX);
      if (massC > 0) {
        var invm = fr(1 / massC);
        var oilMassC = fr(fr(refOilFx[ci]) / FX);
        var oilK = fr(oilMassC * invm);
        var gravPx = fr(fr(LIQUID_GRAVITY) +
          fr(fr(LIQUID_OIL_GRAVITY - LIQUID_GRAVITY) * oilK));
        var gravScale = fr(fr(fr(dt) * fr(dt)) * fr(inv));
        var grav = fr(gravPx * gravScale);
        var momX = fr(fr(refVXFx[ci]) / FX);
        var momY = fr(fr(refVYFx[ci]) / FX);
        var dvX  = fr(fr(refDVXFx[ci]) / FX);
        var dvY  = fr(fr(refDVYFx[ci]) / FX);
        // v25.41 — shock limiter (matches the kernel dvCap block).
        var dvCapR = fr(fr(fr(fr(LIQUID_PRESSURE_MAX_DV) * fr(dt)) * fr(inv)) * massC);
        if (fr(LIQUID_PRESSURE_MAX_DV) > 0) {
          var dvL2R = fr(fr(dvX * dvX) + fr(dvY * dvY));
          if (dvL2R > fr(dvCapR * dvCapR)) {
            var dvScR = fr(dvCapR / fr(Math.sqrt(dvL2R)));
            dvX = fr(dvX * dvScR);
            dvY = fr(dvY * dvScR);
          }
        }
        refVelX[ci] = fr(fr(momX + dvX) * invm);
        refVelY[ci] = fr(fr(fr(momY + dvY) * invm) + grav);
      } else {
        refVelX[ci] = 0;
        refVelY[ci] = 0;
      }
    }
    // v24.115 — grid viscosity blend (mirrors the kernel's massy-4-neighbour
    // average; fr() keeps every step f32). Raw values are snapshotted first
    // so each cell blends against neighbours' UN-blended velocity, exactly
    // like the kernel's race-free recompute-from-accumulators gather.
    if (LIQUID_GRID_VISC > 0) {
      var rawVX = Float64Array.from(refVelX);
      var rawVY = Float64Array.from(refVelY);
      var gwV = g.w | 0;
      for (ci = 0; ci < cells; ci++) {
        if (fr(fr(refMassFx[ci]) / FX) <= 0) continue;
        var colV = ci % gwV;
        var sXV = 0, sYV = 0, sNV = 0;
        if (colV > 0 && fr(fr(refMassFx[ci - 1]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci - 1]); sYV = fr(sYV + rawVY[ci - 1]); sNV++;
        }
        if (colV + 1 < gwV && fr(fr(refMassFx[ci + 1]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci + 1]); sYV = fr(sYV + rawVY[ci + 1]); sNV++;
        }
        if (ci >= gwV && fr(fr(refMassFx[ci - gwV]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci - gwV]); sYV = fr(sYV + rawVY[ci - gwV]); sNV++;
        }
        if (ci + gwV < cells && fr(fr(refMassFx[ci + gwV]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci + gwV]); sYV = fr(sYV + rawVY[ci + gwV]); sNV++;
        }
        if (sNV > 0) {
          var aXV = fr(sXV / sNV), aYV = fr(sYV / sNV);
          refVelX[ci] = fr(rawVX[ci] + fr(fr(aXV - rawVX[ci]) * LIQUID_GRID_VISC));
          refVelY[ci] = fr(rawVY[ci] + fr(fr(aYV - rawVY[ci]) * LIQUID_GRID_VISC));
        }
      }
    }

    Promise.all([
      readbackBuffer(instance, instance.buf.cellVelX, cells * 4),
      readbackBuffer(instance, instance.buf.cellVelY, cells * 4),
      readbackBuffer(instance, instance.buf.aux,      count * 16)
    ]).then(function (res) {
      var gVelX = new Float32Array(res[0]);
      var gVelY = new Float32Array(res[1]);
      var gAux  = new Float32Array(res[2]);

      // (a) resolved per-cell velocity must match the reference.
      var maxVelDiff = 0, worstCell = -1, worstAxis = '';
      for (var k = 0; k < cells; k++) {
        var dX = Math.abs(gVelX[k] - refVelX[k]);
        var dY = Math.abs(gVelY[k] - refVelY[k]);
        if (dX > maxVelDiff) { maxVelDiff = dX; worstCell = k; worstAxis = 'x'; }
        if (dY > maxVelDiff) { maxVelDiff = dY; worstCell = k; worstAxis = 'y'; }
      }

      // (b) per-particle density (aux.x) + advanced aeration (aux.y).
      var maxAuxDiff = 0, worstP = -1, worstField = '';
      for (var p = 0; p < count; p++) {
        if (snap.frozen[p] || snap.sleeping[p]) continue;  // untouched
        var dDen = Math.abs(gAux[p * 4]     - refDensity[p]);
        var dAer = Math.abs(gAux[p * 4 + 1] - refAerationOut[p]);
        if (dDen > maxAuxDiff) { maxAuxDiff = dDen; worstP = p; worstField = 'density'; }
        if (dAer > maxAuxDiff) { maxAuxDiff = dAer; worstP = p; worstField = 'aeration'; }
      }

      // Tolerances — pure fixed-point round() tie noise, scaled a little
      // by the multi-corner gather (density sums 9 decoded cells, the
      // resolved velocity divides by a small mass).
      var velTol = 0.05;
      var auxTol = 0.02;
      var fail = '';
      if (maxVelDiff >= velTol) {
        fail = 'cellVel' + worstAxis + ' diff ' + maxVelDiff.toFixed(5) +
          ' at cell ' + worstCell + ' (gpu vs CPU reference)';
      } else if (maxAuxDiff >= auxTol) {
        fail = 'particle ' + worstField + ' diff ' + maxAuxDiff.toFixed(5) +
          ' at particle ' + worstP + ' (gpu vs CPU reference)';
      }

      if (fail) {
        try {
          console.log('LiquidWGPU Stage 4: pressure+grid FAIL — ' + fail +
            ' (' + count + ' particles, ' + awake + ' awake, grid ' +
            g.w + 'x' + g.h + ').');
        } catch (_) {}
      } else {
        try {
          console.log('LiquidWGPU Stage 4: pressure+grid OK — ' + count +
            ' particles, maxVelDiff=' + maxVelDiff.toFixed(6) +
            ' (' + awake + ' awake, maxAuxDiff=' + maxAuxDiff.toFixed(6) +
            ', grid ' + g.w + 'x' + g.h + ').');
        } catch (_) {}
      }
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 4: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
  }

  /* ---- Bit-faithful CPU reference — P2G + pressure + grid + G2P --------
   * The core-MPM-step reference, shared by the Stage-5 and Stage-6 self-
   * tests. Given a frozen particle snapshot it re-runs the four passes a
   * bit-faithful CPU re-implementation of liquidP2G + liquidApplyGrid-
   * Pressure + liquidUpdateGrid (velocity+gravity core) + liquidG2P, then
   * returns the per-particle post-G2P references (position, velocity, the
   * APIC C matrix, aeration, the sleeping bit + restFrames). Scope matches
   * the GPU g2p kernel — it EXCLUDES terrain collision (that is the
   * Stage-6 collide kernel; the Stage-6 self-test ports liquidMoveParticle
   * on top of this reference's output).
   *
   * Faithfulness — the two rules used throughout the self-tests:
   *  1. f32 arithmetic — every op wrapped in Math.fround so JS f64 cannot
   *     land a floor() on the wrong side of an integer boundary.
   *  2. fixed-point accumulation — the P2G cell fields + pressure impulse
   *     go through Int32Array fixed-point with enc()==encodeFx; the
   *     gathers decode (f32(x)/FIXED_SCALE) exactly as the WGSL atomicLoad
   *     path. The resolved cell velocity is plain f32 (gridUpdate writes it
   *     non-atomically) — the G2P gather reads it raw.
   *
   * Requires computeGridBounds() to have run (instance.grid + the f32
   * stepDt/invCell uniform lanes are read here).
   * -------------------------------------------------------------------- */
  function liquidG2PReference(instance, count, snap) {
    var g = instance.grid;
    var fr = Math.fround;
    var FX = FIXED_SCALE;
    // == WGSL encodeFx: i32(round(v * FIXED_SCALE)).
    function enc(v) { return Math.round(fr(v * FX)) | 0; }
    var cells = g.cells;
    var inv = instance.paramsHostF[7];   // f32 invCell — same bits as GPU
    var dt  = instance.paramsHostF[6];   // f32 stepDt  — same bits as GPU
    var ox = g.originX, oy = g.originY, gw = g.w;
    var i, s, ci;

    // --- Pass 1: P2G — fixed-point cell accumulators (mirror Stage 3/4) ---
    var refMassFx = new Int32Array(cells);
    var refOilFx  = new Int32Array(cells);
    var refAerFx  = new Int32Array(cells);
    var refVXFx   = new Int32Array(cells);
    var refVYFx   = new Int32Array(cells);
    for (i = 0; i < count; i++) {
      if (snap.frozen[i]) continue;        // P2G skips frozen only
      var lx0 = fr(fr(snap.x[i]) * inv);
      var ly0 = fr(fr(snap.y[i]) * inv);
      var pvx0 = fr(fr(fr(snap.vx[i]) * dt) * inv);
      var pvy0 = fr(fr(fr(snap.vy[i]) * dt) * inv);
      var gx0 = Math.floor(lx0);
      var gy0 = Math.floor(ly0);
      var dx0 = fr(fr(fr(gx0) + 0.5) - lx0);
      var dy0 = fr(fr(fr(gy0) + 0.5) - ly0);
      var wx0 = fr(fr(fr(dx0 + 0.5) * fr(dx0 + 0.5)) * 0.5);
      var wx1 = fr(0.75 - fr(dx0 * dx0));
      var wx2 = fr(fr(fr(dx0 - 0.5) * fr(dx0 - 0.5)) * 0.5);
      var wy0 = fr(fr(fr(dy0 + 0.5) * fr(dy0 + 0.5)) * 0.5);
      var wy1 = fr(0.75 - fr(dy0 * dy0));
      var wy2 = fr(fr(fr(dy0 - 0.5) * fr(dy0 - 0.5)) * 0.5);
      var pg00 = fr(snap.g00[i]), pg01 = fr(snap.g01[i]),
          pg10 = fr(snap.g10[i]), pg11 = fr(snap.g11[i]);
      var cvx = fr(fr(pvx0 + fr(pg00 * dx0)) + fr(pg01 * dy0));
      var cvy = fr(fr(pvy0 + fr(pg10 * dx0)) + fr(pg11 * dy0));
      var aer0 = fr(snap.aeration[i]);
      var oilW = snap.type[i] === 1 ? 1 : 0;
      var bx0 = gx0 - ox, by0 = gy0 - oy;
      var corner = [
        [(by0 - 1) * gw + bx0 - 1, fr(wx0 * wy0), fr(fr(cvx - pg00) - pg01), fr(fr(cvy - pg10) - pg11)],
        [(by0 - 1) * gw + bx0,     fr(wx1 * wy0), fr(cvx - pg01),            fr(cvy - pg11)],
        [(by0 - 1) * gw + bx0 + 1, fr(wx2 * wy0), fr(fr(cvx + pg00) - pg01), fr(fr(cvy + pg10) - pg11)],
        [ by0      * gw + bx0 - 1, fr(wx0 * wy1), fr(cvx - pg00),            fr(cvy - pg10)],
        [ by0      * gw + bx0,     fr(wx1 * wy1), cvx,                       cvy],
        [ by0      * gw + bx0 + 1, fr(wx2 * wy1), fr(cvx + pg00),            fr(cvy + pg10)],
        [(by0 + 1) * gw + bx0 - 1, fr(wx0 * wy2), fr(fr(cvx - pg00) + pg01), fr(fr(cvy - pg10) + pg11)],
        [(by0 + 1) * gw + bx0,     fr(wx1 * wy2), fr(cvx + pg01),            fr(cvy + pg11)],
        [(by0 + 1) * gw + bx0 + 1, fr(wx2 * wy2), fr(fr(cvx + pg00) + pg01), fr(fr(cvy + pg10) + pg11)]
      ];
      for (s = 0; s < 9; s++) {
        var c = corner[s][0];
        if (c < 0 || c >= cells) continue;
        var w = corner[s][1];
        refMassFx[c] += enc(w);
        refOilFx[c]  += enc(fr(oilW * w));
        refAerFx[c]  += enc(fr(w * aer0));
        refVXFx[c]   += enc(fr(w * corner[s][2]));
        refVYFx[c]   += enc(fr(w * corner[s][3]));
      }
    }
    // p2gNormalize — mass-normalize aeration in place.
    for (ci = 0; ci < cells; ci++) {
      var cm0 = fr(fr(refMassFx[ci]) / FX);
      if (cm0 > 0) {
        var ca0 = fr(fr(refAerFx[ci]) / FX);
        refAerFx[ci] = enc(fr(ca0 / cm0));
      }
    }

    // --- Pass 2: pressure — port of liquidApplyGridPressure ---
    var refDVXFx = new Int32Array(cells);
    var refDVYFx = new Int32Array(cells);
    var refDensity     = new Float64Array(count);
    var refAerationOut = new Float64Array(count);
    for (i = 0; i < count; i++) {
      if (snap.frozen[i] || snap.sleeping[i]) continue;
      var plx = fr(fr(snap.x[i]) * inv);
      var ply = fr(fr(snap.y[i]) * inv);
      var pgx = Math.floor(plx);
      var pgy = Math.floor(ply);
      var pdx = fr(fr(fr(pgx) + 0.5) - plx);
      var pdy = fr(fr(fr(pgy) + 0.5) - ply);
      var pwx0 = fr(fr(fr(pdx + 0.5) * fr(pdx + 0.5)) * 0.5);
      var pwx1 = fr(0.75 - fr(pdx * pdx));
      var pwx2 = fr(fr(fr(pdx - 0.5) * fr(pdx - 0.5)) * 0.5);
      var pwy0 = fr(fr(fr(pdy + 0.5) * fr(pdy + 0.5)) * 0.5);
      var pwy1 = fr(0.75 - fr(pdy * pdy));
      var pwy2 = fr(fr(fr(pdy - 0.5) * fr(pdy - 0.5)) * 0.5);
      var pbx = pgx - ox, pby = pgy - oy;
      var r0 = (pby - 1) * gw + pbx;
      var r1 =  pby      * gw + pbx;
      var r2 = (pby + 1) * gw + pbx;
      var nbr = [r0 - 1, r0, r0 + 1, r1 - 1, r1, r1 + 1, r2 - 1, r2, r2 + 1];
      var wgt = [
        fr(pwx0 * pwy0), fr(pwx1 * pwy0), fr(pwx2 * pwy0),
        fr(pwx0 * pwy1), fr(pwx1 * pwy1), fr(pwx2 * pwy1),
        fr(pwx0 * pwy2), fr(pwx1 * pwy2), fr(pwx2 * pwy2)
      ];
      var density = 0, aeration = 0;
      for (s = 0; s < 9; s++) {
        var gc = nbr[s];
        var gwt = wgt[s];
        density  = fr(density  + fr(gwt * fr(fr(refMassFx[gc]) / FX)));
        aeration = fr(aeration + fr(gwt * fr(fr(refAerFx[gc]) / FX)));
      }
      var oilP = snap.type[i] === 1;
      var aerDamp = oilP ? LIQUID_OIL_AERATION_DAMP : LIQUID_AERATION_DAMP;
      var aerBlur = oilP ? LIQUID_OIL_AERATION_BLUR : LIQUID_AERATION_BLUR;
      var stiff   = oilP ? LIQUID_OIL_PRESSURE_STIFF : LIQUID_PRESSURE_STIFF;
      var oldAer = fr(snap.aeration[i]);
      var newAerP = fr(fr(aerDamp) * fr(oldAer + fr(fr(aeration - oldAer) * fr(aerBlur))));
      density = Math.min(density, LIQUID_DENS_CAP);   // v24.182 — anti-runaway cap (matches the WGSL min)
      refDensity[i] = density;
      refAerationOut[i] = newAerP;
      var pressure = fr(fr(fr(density / fr(LIQUID_DENSITY)) - 1) * fr(stiff));
      // v25.41 — detachment cohesion (water only), matches the WGSL block.
      if (pressure < 0) {
        var dnR = fr(density / fr(LIQUID_DENSITY));
        var ck = fr(fr(fr(0.7) - dnR) * fr(1 / 0.3));
        if (ck < 0) ck = 0; else if (ck > 1) ck = 1;
        pressure = oilP ? 0 : fr(-fr(fr(LIQUID_COHESION) * fr(stiff)) * ck);
      }
      if (density <= 0) pressure = 0;
      var volume = density > 0 ? fr(1 / density) : 0;
      var coeff  = fr(fr(volume * 4) * fr(-pressure));
      var coeffx = fr(coeff * pdx);
      var coeffy = fr(coeff * pdy);
      if (coeff !== 0) {
        var cxm = fr(coeffx - coeff), cxp = fr(coeffx + coeff);
        var cym = fr(coeffy - coeff), cyp = fr(coeffy + coeff);
        var ix = [cxm, coeffx, cxp, cxm, coeffx, cxp, cxm, coeffx, cxp];
        var iy = [cym, cym, cym, coeffy, coeffy, coeffy, cyp, cyp, cyp];
        for (s = 0; s < 9; s++) {
          var dc = nbr[s];
          var dw = wgt[s];
          refDVXFx[dc] += enc(fr(-fr(dw * ix[s])));
          refDVYFx[dc] += enc(fr(-fr(dw * iy[s])));
        }
      }
    }

    // --- Pass 3: grid update — velocity + gravity core ---
    var refVelX = new Float64Array(cells);
    var refVelY = new Float64Array(cells);
    for (ci = 0; ci < cells; ci++) {
      var massC = fr(fr(refMassFx[ci]) / FX);
      if (massC > 0) {
        var invm = fr(1 / massC);
        var oilMassC = fr(fr(refOilFx[ci]) / FX);
        var oilK = fr(oilMassC * invm);
        var gravPx = fr(fr(LIQUID_GRAVITY) +
          fr(fr(LIQUID_OIL_GRAVITY - LIQUID_GRAVITY) * oilK));
        var gravScale = fr(fr(fr(dt) * fr(dt)) * fr(inv));
        var grav = fr(gravPx * gravScale);
        var momX = fr(fr(refVXFx[ci]) / FX);
        var momY = fr(fr(refVYFx[ci]) / FX);
        var dvX  = fr(fr(refDVXFx[ci]) / FX);
        var dvY  = fr(fr(refDVYFx[ci]) / FX);
        // v25.41 — shock limiter (matches the kernel dvCap block).
        var dvCapR = fr(fr(fr(fr(LIQUID_PRESSURE_MAX_DV) * fr(dt)) * fr(inv)) * massC);
        if (fr(LIQUID_PRESSURE_MAX_DV) > 0) {
          var dvL2R = fr(fr(dvX * dvX) + fr(dvY * dvY));
          if (dvL2R > fr(dvCapR * dvCapR)) {
            var dvScR = fr(dvCapR / fr(Math.sqrt(dvL2R)));
            dvX = fr(dvX * dvScR);
            dvY = fr(dvY * dvScR);
          }
        }
        refVelX[ci] = fr(fr(momX + dvX) * invm);
        refVelY[ci] = fr(fr(fr(momY + dvY) * invm) + grav);
      } else {
        refVelX[ci] = 0;
        refVelY[ci] = 0;
      }
    }
    // v24.115 — grid viscosity blend (mirrors the kernel's massy-4-neighbour
    // average; fr() keeps every step f32). Raw values are snapshotted first
    // so each cell blends against neighbours' UN-blended velocity, exactly
    // like the kernel's race-free recompute-from-accumulators gather.
    if (LIQUID_GRID_VISC > 0) {
      var rawVX = Float64Array.from(refVelX);
      var rawVY = Float64Array.from(refVelY);
      var gwV = g.w | 0;
      for (ci = 0; ci < cells; ci++) {
        if (fr(fr(refMassFx[ci]) / FX) <= 0) continue;
        var colV = ci % gwV;
        var sXV = 0, sYV = 0, sNV = 0;
        if (colV > 0 && fr(fr(refMassFx[ci - 1]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci - 1]); sYV = fr(sYV + rawVY[ci - 1]); sNV++;
        }
        if (colV + 1 < gwV && fr(fr(refMassFx[ci + 1]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci + 1]); sYV = fr(sYV + rawVY[ci + 1]); sNV++;
        }
        if (ci >= gwV && fr(fr(refMassFx[ci - gwV]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci - gwV]); sYV = fr(sYV + rawVY[ci - gwV]); sNV++;
        }
        if (ci + gwV < cells && fr(fr(refMassFx[ci + gwV]) / FX) > 0) {
          sXV = fr(sXV + rawVX[ci + gwV]); sYV = fr(sYV + rawVY[ci + gwV]); sNV++;
        }
        if (sNV > 0) {
          var aXV = fr(sXV / sNV), aYV = fr(sYV / sNV);
          refVelX[ci] = fr(rawVX[ci] + fr(fr(aXV - rawVX[ci]) * LIQUID_GRID_VISC));
          refVelY[ci] = fr(rawVY[ci] + fr(fr(aYV - rawVY[ci]) * LIQUID_GRID_VISC));
        }
      }
    }

    // --- Pass 4: G2P — port of liquidG2P (no terrain collision) ---
    // Per particle, gather the resolved velocity over the 3x3 stencil,
    // rebuild the APIC affine matrix, clamp the new position, advance
    // aeration, run the sleep/wake tracking.
    // World-bounds clamp — f32, exactly as the WGSL kernel computes it.
    var CELL = instance.cellSize;
    var minX = fr(1 + 1e-3);
    var maxX = fr(fr(fr(instance.worldCols * instance.worldTile) / CELL) - minX);
    var minY = fr(fr(-400 * instance.worldTile) / CELL);
    var maxY = fr(fr(fr(instance.worldTotalRows + 1) * instance.worldTile) / CELL);
    var invStep = fr(1 / dt);
    // v24.174/v26.15 LOCKSTEP: the G2P kernel reads waterMotionScale +
    // damping from SimParams (sp.g2pA.x/.y/.z), and writeSimParams fills those
    // lanes from LIQUID_MATS (water = row 0, oil = row 1), not the legacy
    // LIQUID_* scalars. The live setters now update both sources. Mirror the
    // kernel's material-row source here (fr() == the f32 uniform lane the
    // kernel sees), exactly as GRAVITY/OIL_GRAVITY already do.
    var refMotion = fr(LIQUID_MATS[0].motionScale);
    var refDampW  = fr(LIQUID_MATS[0].damping);
    var refDampO  = fr(LIQUID_MATS[1].damping);
    // Reference particle outputs, seeded from the snapshot — frozen and
    // still-asleep particles stay untouched, exactly like the kernel.
    var refPX = snap.x.slice(0),   refPY = snap.y.slice(0);
    var refVXp = snap.vx.slice(0), refVYp = snap.vy.slice(0);
    var refG00 = snap.g00.slice(0), refG01 = snap.g01.slice(0);
    var refG10 = snap.g10.slice(0), refG11 = snap.g11.slice(0);
    var refAerP = new Float64Array(count);
    var refSleep = new Uint8Array(count);
    var refRest  = new Uint16Array(count);
    var g2pAwake = 0;
    for (i = 0; i < count; i++) {
      // Seed the aeration/sleep/rest reference from the pressure-pass
      // output (the CPU pressure step wrote liquidAeration before G2P).
      refSleep[i] = snap.sleeping[i];
      refRest[i]  = snap.restFrames[i];
      refAerP[i]  = (snap.frozen[i] || snap.sleeping[i]) ? snap.aeration[i] : refAerationOut[i];
      if (snap.frozen[i]) continue;

      // 3x3 stencil from the pre-step position (== P2G's lx/dx).
      var glx = fr(fr(snap.x[i]) * inv);
      var gly = fr(fr(snap.y[i]) * inv);
      var ggx = Math.floor(glx);
      var ggy = Math.floor(gly);
      var ddx = fr(fr(fr(ggx) + 0.5) - glx);
      var ddy = fr(fr(fr(ggy) + 0.5) - gly);
      var gwx0 = fr(fr(fr(ddx + 0.5) * fr(ddx + 0.5)) * 0.5);
      var gwx1 = fr(0.75 - fr(ddx * ddx));
      var gwx2 = fr(fr(fr(ddx - 0.5) * fr(ddx - 0.5)) * 0.5);
      var gwy0 = fr(fr(fr(ddy + 0.5) * fr(ddy + 0.5)) * 0.5);
      var gwy1 = fr(0.75 - fr(ddy * ddy));
      var gwy2 = fr(fr(fr(ddy - 0.5) * fr(ddy - 0.5)) * 0.5);
      var gbx = ggx - ox, gby = ggy - oy;
      var gr0 = (gby - 1) * gw + gbx;
      var gr1 =  gby      * gw + gbx;
      var gr2 = (gby + 1) * gw + gbx;
      var gnbr = [gr0 - 1, gr0, gr0 + 1, gr1 - 1, gr1, gr1 + 1, gr2 - 1, gr2, gr2 + 1];
      var gwgt = [
        fr(gwx0 * gwy0), fr(gwx1 * gwy0), fr(gwx2 * gwy0),
        fr(gwx0 * gwy1), fr(gwx1 * gwy1), fr(gwx2 * gwy1),
        fr(gwx0 * gwy2), fr(gwx1 * gwy2), fr(gwx2 * gwy2)
      ];

      // Sleeping particles — scan the 9 stencil cells for a wake.
      if (snap.sleeping[i]) {
        if (LIQUID_DBG_FLAGS & 1) {
          // v24.120 debug kit — no-sleep: force-wake (matches the kernel).
          refSleep[i] = 0;
          refRest[i] = 0;
        } else {
          var wakeMax = 0;
          for (s = 0; s < 9; s++) {
            var wc = gnbr[s];
            var wvx = refVelX[wc], wvy = refVelY[wc];
            var wmag = fr(fr(wvx * wvx) + fr(wvy * wvy));
            if (wmag > wakeMax) wakeMax = wmag;
          }
          // v24.150 — lively wake bar drops ~8x (matches the kernel branch).
          var wakeBarR = LIQUID_WAKE_CELL_VSQ;
          if (LIQUID_CALM < 0.5) wakeBarR = fr(LIQUID_WAKE_CELL_VSQ * 0.12);
          if (wakeMax < wakeBarR) continue;   // stays asleep
          refSleep[i] = 0;
          refRest[i] = 0;
        }
      }
      g2pAwake++;

      // Awake 9-corner gather — unrolled, mirrors the CPU stencil folds.
      var vx = 0, vy = 0, gv00 = 0, gv01 = 0, gv10 = 0, gv11 = 0;
      var wi, vxi, vyi, wvxi, wvyi;
      // s=0  ox=-1 oy=-1
      wi = gwgt[0]; vxi = refVelX[gnbr[0]]; vyi = refVelY[gnbr[0]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 - wvxi); gv01 = fr(gv01 - wvxi); gv10 = fr(gv10 - wvyi); gv11 = fr(gv11 - wvyi);
      // s=1  ox=0  oy=-1
      wi = gwgt[1]; vxi = refVelX[gnbr[1]]; vyi = refVelY[gnbr[1]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv01 = fr(gv01 - wvxi); gv11 = fr(gv11 - wvyi);
      // s=2  ox=+1 oy=-1
      wi = gwgt[2]; vxi = refVelX[gnbr[2]]; vyi = refVelY[gnbr[2]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 + wvxi); gv01 = fr(gv01 - wvxi); gv10 = fr(gv10 + wvyi); gv11 = fr(gv11 - wvyi);
      // s=3  ox=-1 oy=0
      wi = gwgt[3]; vxi = refVelX[gnbr[3]]; vyi = refVelY[gnbr[3]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 - wvxi); gv10 = fr(gv10 - wvyi);
      // s=4  ox=0  oy=0  (centre)
      wi = gwgt[4]; vxi = refVelX[gnbr[4]]; vyi = refVelY[gnbr[4]];
      vx = fr(vx + fr(wi * vxi)); vy = fr(vy + fr(wi * vyi));
      // s=5  ox=+1 oy=0
      wi = gwgt[5]; vxi = refVelX[gnbr[5]]; vyi = refVelY[gnbr[5]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 + wvxi); gv10 = fr(gv10 + wvyi);
      // s=6  ox=-1 oy=+1
      wi = gwgt[6]; vxi = refVelX[gnbr[6]]; vyi = refVelY[gnbr[6]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 - wvxi); gv01 = fr(gv01 + wvxi); gv10 = fr(gv10 - wvyi); gv11 = fr(gv11 + wvyi);
      // s=7  ox=0  oy=+1
      wi = gwgt[7]; vxi = refVelX[gnbr[7]]; vyi = refVelY[gnbr[7]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv01 = fr(gv01 + wvxi); gv11 = fr(gv11 + wvyi);
      // s=8  ox=+1 oy=+1
      wi = gwgt[8]; vxi = refVelX[gnbr[8]]; vyi = refVelY[gnbr[8]];
      wvxi = fr(wi * vxi); wvyi = fr(wi * vyi); vx = fr(vx + wvxi); vy = fr(vy + wvyi);
      gv00 = fr(gv00 + wvxi); gv01 = fr(gv01 + wvxi); gv10 = fr(gv10 + wvyi); gv11 = fr(gv11 + wvyi);

      // APIC affine reconstruct — 4*(gv + v*dd).
      gv00 = fr(4 * fr(gv00 + fr(vx * ddx)));
      gv01 = fr(4 * fr(gv01 + fr(vx * ddy)));
      gv10 = fr(4 * fr(gv10 + fr(vy * ddx)));
      gv11 = fr(4 * fr(gv11 + fr(vy * ddy)));

      var oilG = snap.type[i] === 1;
      if (!oilG) {
        // refMotion = fr(LIQUID_MATS[0].motionScale) — the kernel's sp.g2pA.x,
        // NOT the live LIQUID_WATER_MOTION_SCALE scalar (see the lockstep note).
        vx = fr(vx * refMotion);
        vy = fr(vy * refMotion);
        gv00 = fr(gv00 * refMotion);
        gv01 = fr(gv01 * refMotion);
        gv10 = fr(gv10 * refMotion);
        gv11 = fr(gv11 * refMotion);
      }

      // v26.13 — mirror the kernel's pre-advection CFL cap. MAX_VEL is
      // world px/s; vx/vy are cell displacement for this substep.
      if (!oilG && LIQUID_MAX_VEL > 0) {
        var maxDispR = fr(fr(fr(LIQUID_MAX_VEL) * dt) * inv);
        var move2R = fr(fr(vx * vx) + fr(vy * vy));
        if (move2R > fr(maxDispR * maxDispR)) {
          var moveScR = fr(maxDispR / fr(Math.sqrt(move2R)));
          vx = fr(vx * moveScR); vy = fr(vy * moveScR);
          gv00 = fr(gv00 * moveScR); gv01 = fr(gv01 * moveScR);
          gv10 = fr(gv10 * moveScR); gv11 = fr(gv11 * moveScR);
        }
      }

      // World-bounds clamp; re-derive vx/vy as the clamped displacement.
      var npx = fr(Math.max(minX, fr(Math.min(maxX, fr(glx + vx)))));
      var npy = fr(Math.max(minY, fr(Math.min(maxY, fr(gly + vy)))));
      vx = fr(npx - glx);
      vy = fr(npy - gly);

      // Aeration — bleed in from the per-step acceleration magnitude.
      // The density + aeration this gather reads are aux.x / aux.y. The
      // Stage-4 gridPressure kernel only writes those for particles awake
      // AT PRESSURE TIME; a particle that was sleeping then but is woken
      // here still carries its uploaded (snapshot) density / aeration —
      // mirror that, else refDensity/refAerationOut are 0 for it.
      var gpvx = fr(fr(fr(snap.vx[i]) * dt) * inv);
      var gpvy = fr(fr(fr(snap.vy[i]) * dt) * inv);
      var aX = fr(vx - gpvx);
      var aY = fr(vy - gpvy);
      var alen = fr(Math.sqrt(fr(fr(aX * aX) + fr(aY * aY))));
      var auxDensity = snap.sleeping[i] ? fr(snap.density[i]) : fr(refDensity[i]);
      var auxAer     = snap.sleeping[i] ? fr(snap.aeration[i]) : fr(refAerationOut[i]);
      var densityRatio = fr(auxDensity * LIQUID_INV_DENSITY);
      var aerThr  = oilG ? LIQUID_OIL_AERATION_THRESHOLD : LIQUID_AERATION_THRESHOLD;
      var aerCoef = oilG ? LIQUID_OIL_AERATION_COEFF : LIQUID_AERATION_COEFF;
      var aerNow = auxAer;
      if (densityRatio < aerThr) {
        aerNow = fr(Math.min(1, fr(aerNow +
          fr(fr(alen * fr(1 - fr(densityRatio / aerThr))) * aerCoef))));
      }
      refAerP[i] = aerNow;

      // Damped velocity (cell -> world px/s).
      // refDampW/O = fr(LIQUID_MATS[*].damping) — the kernel's sp.g2pA.y/.z,
      // NOT the live LIQUID_DAMPING scalar (see the lockstep note above).
      var dampG = oilG ? refDampO : refDampW;
      var newVX = fr(fr(fr(vx * CELL) * invStep) * dampG);
      var newVY = fr(fr(fr(vy * CELL) * invStep) * dampG);
      // v24.112 rest brake (matches the kernel, two stages).
      var vBrk = fr(fr(newVX * newVX) + fr(newVY * newVY));
      if (!(LIQUID_DBG_FLAGS & 2) && vBrk < LIQUID_REST_BRAKE_VSQ) {
        var bfR = (vBrk < LIQUID_REST_BRAKE_HARD_VSQ) ? LIQUID_REST_BRAKE_HARD : LIQUID_REST_BRAKE;
        // v24.145 — calm-scaled brake (matches the kernel; LIQUID_CALM is
        // the fround-quantized mirror of the g2pB.w uniform lane).
        var bfC = fr(1 + fr(fr(bfR - 1) * LIQUID_CALM));
        newVX = fr(newVX * bfC);
        newVY = fr(newVY * bfC);
      }
      // v24.173 Old-Faithful — speed-gated burst damp + hard velocity clamp
      // (water only; bit-faithful twin of the WGSL g2p kernel). The g2pC
      // lanes are the f32-rounded module consts (writeSimParams assigns into a
      // Float32Array), so each const read is fr()-wrapped to match the uniform.
      if (!oilG) {
        var bdAmp = fr(LIQUID_BURST_DAMP);
        if (bdAmp < 1) {
          var bdGLoF = fr(LIQUID_BURST_GATE_LO);
          var bdLo = fr(bdGLoF * bdGLoF);
          if (vBrk > bdLo) {
            var bdGHiF = fr(LIQUID_BURST_GATE_HI);
            var bdHi = fr(bdGHiF * bdGHiF);
            var bdT = fr(fr(vBrk - bdLo) / fr(bdHi - bdLo));
            if (bdT > 1) bdT = 1;
            var bdF = fr(1 + fr(fr(bdAmp - 1) * bdT));
            newVX = fr(newVX * bdF);
            newVY = fr(newVY * bdF);
          }
        }
        var mvMax = fr(LIQUID_MAX_VEL);
        if (mvMax > 0) {
          var mvSp2 = fr(fr(newVX * newVX) + fr(newVY * newVY));
          var mvMx2 = fr(mvMax * mvMax);
          if (mvSp2 > mvMx2) {
            var mvSc = fr(mvMax / fr(Math.sqrt(mvSp2)));
            newVX = fr(newVX * mvSc);
            newVY = fr(newVY * mvSc);
          }
        }
        // v25.41 — air drag on separated droplets (matches the WGSL g2p).
        var adAmp = fr(LIQUID_AIR_DRAG);
        if (adAmp < 1 && densityRatio < fr(0.55)) {
          var adT = fr(fr(fr(0.55) - densityRatio) * 5);
          if (adT > 1) adT = 1;
          var adF = fr(1 + fr(fr(adAmp - 1) * adT));
          newVX = fr(newVX * adF);
          newVY = fr(newVY * adF);
        }
      }
      refPX[i] = fr(npx * CELL);
      refPY[i] = fr(npy * CELL);
      refVXp[i] = newVX;
      refVYp[i] = newVY;
      refG00[i] = gv00; refG01[i] = gv01; refG10[i] = gv10; refG11[i] = gv11;

      // Sleep tracking. (debug kit: no-sleep routes to the reset branch.)
      // v24.150 — latch only while SETTLING (matches the kernel calm gate).
      if (!(LIQUID_DBG_FLAGS & 1) && LIQUID_CALM >= 0.5 && fr(fr(newVX * newVX) + fr(newVY * newVY)) < LIQUID_SLEEP_VSQ) {
        var rf = refRest[i] + 1;
        if (rf > LIQUID_SLEEP_FRAMES) {
          refSleep[i] = 1; rf = LIQUID_SLEEP_FRAMES;
          refAerP[i] = 0;   // v24.112 — foam drops at the sleep transition (matches the kernel)
        }
        refRest[i] = rf;
      } else {
        refRest[i] = 0;
      }
    }

    return {
      cells: cells, g: g,
      refPX: refPX, refPY: refPY, refVXp: refVXp, refVYp: refVYp,
      refG00: refG00, refG01: refG01, refG10: refG10, refG11: refG11,
      refAerP: refAerP, refSleep: refSleep, refRest: refRest,
      g2pAwake: g2pAwake
    };
  }

  /* ---- Stage 5 verification — G2P --------------------------------------
   * Upload the live particle state, run the full GPU core MPM step
   * (buildGrid -> P2G -> clearDV -> pressure -> gridUpdate -> g2p), read
   * back the four particle buffers (pos / affine / aux / flag) and diff
   * each vs a bit-faithful CPU reference of the SAME scope.
   *
   * The reference re-runs the Stage-4 chain in full (P2G + pressure +
   * grid-update — they produce the resolved per-cell velocity refVelX/
   * refVelY plus the per-particle refDensity / refAerationOut the G2P
   * reads), then ports liquidG2P on top: the sleeping-particle wake scan,
   * the awake 9-corner velocity + affine gather, the APIC C rebuild, the
   * water motion scale, the world-bounds position clamp, the aeration
   * advance and the sleep/wake tracking.
   *
   * Scope deliberately MATCHES the GPU kernel — it EXCLUDES the terrain
   * collision (liquidMoveParticle), exactly as the G2P kernel does. That
   * is the next stage. // TODO Stage 6
   *
   * Faithfulness — same two rules as the Stage-3/4 references:
   *  1. f32 arithmetic — every op wrapped in Math.fround so JS f64 cannot
   *     land a floor() on the wrong side of an integer boundary.
   *  2. fixed-point accumulation — the P2G cell fields + pressure impulse
   *     go through Int32Array fixed-point with enc()==encodeFx; the
   *     gathers decode (f32(x)/FIXED_SCALE) exactly as the WGSL atomicLoad
   *     path. The resolved cell velocity refVelX/refVelY is plain f32 (the
   *     gridUpdate writes it non-atomically) — the G2P gather reads it raw.
   *
   * Snapshot discipline: the CPU MPM solver mutates the arrays every
   * frame and the readback is async — the reference runs over a copy
   * frozen at upload time, never the live arrays.
   * -------------------------------------------------------------------- */
  function runStage5SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 5: no liquid arrays wired — G2P kernel built, self-test skipped.'); } catch (_) {}
      instance.stage5Done = Promise.resolve();
      return instance.stage5Done;
    }
    if (!instance.g2pReady) {
      try { console.log('LiquidWGPU Stage 5: G2P pipeline unavailable — self-test skipped.'); } catch (_) {}
      instance.stage5Done = Promise.resolve();
      return instance.stage5Done;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 5: 0 live particles — G2P self-test deferred.'); } catch (_) {}
      instance.stage5Done = Promise.resolve();
      return instance.stage5Done;
    }
    // Freeze every input the P2G + pressure + grid-update + G2P reads,
    // BEFORE any further CPU step can move a particle.
    var a = L.arrays;
    var snap = {
      x: a.x.slice(0, count),     y: a.y.slice(0, count),
      vx: a.vx.slice(0, count),   vy: a.vy.slice(0, count),
      g00: a.g00.slice(0, count), g01: a.g01.slice(0, count),
      g10: a.g10.slice(0, count), g11: a.g11.slice(0, count),
      density: a.density.slice(0, count),
      aeration: a.aeration.slice(0, count),
      type: a.type.slice(0, count),
      origin: a.origin.slice(0, count),
      sleeping: a.sleeping.slice(0, count),
      frozen: a.frozen.slice(0, count),
      restFrames: a.restFrames.slice(0, count)
    };

    // GPU: grid bounds from the snapshot, then the full core MPM step.
    computeGridBounds(instance, count);
    var g = instance.grid;
    buildGrid(instance);
    runP2G(instance);
    runGrid2(instance);
    runG2P(instance);

    // ---- CPU reference — the shared bit-faithful core-MPM-step reference
    // (P2G + pressure + grid + G2P). Scope matches the GPU g2p kernel.
    var R = liquidG2PReference(instance, count, snap);
    var refPX = R.refPX, refPY = R.refPY, refVXp = R.refVXp, refVYp = R.refVYp;
    var refG00 = R.refG00, refG01 = R.refG01, refG10 = R.refG10, refG11 = R.refG11;
    var refAerP = R.refAerP, refSleep = R.refSleep, refRest = R.refRest;
    var g2pAwake = R.g2pAwake;

    // v26.15: keep this continuation visible to readyPromise. Host pages
    // retune the live SimParams as soon as readyPromise resolves; previously
    // that could happen while this readback was still comparing the boot
    // uniforms, producing a one-particle sleep-threshold false FAIL.
    instance.stage5Done = Promise.all([
      readbackBuffer(instance, instance.buf.pos,    count * 16),
      readbackBuffer(instance, instance.buf.affine, count * 16),
      readbackBuffer(instance, instance.buf.aux,    count * 16),
      readbackBuffer(instance, instance.buf.flag,   count * 4)
    ]).then(function (res) {
      var gPos = new Float32Array(res[0]);
      var gAff = new Float32Array(res[1]);
      var gAux = new Float32Array(res[2]);
      var gFlag = new Uint32Array(res[3]);

      var maxPosDiff = 0, maxVelDiff = 0, maxAffineDiff = 0, maxAerDiff = 0;
      var maxRefVelMag = 0;
      var flagFails = 0, identityFlagFails = 0, sleepThresholdTies = 0;
      var worstP = -1, worstWhat = '';
      for (var p = 0; p < count; p++) {
        var q = p * 4;
        // pos.xy = new position; pos.zw = new velocity.
        var dPX = Math.abs(gPos[q]     - refPX[p]);
        var dPY = Math.abs(gPos[q + 1] - refPY[p]);
        var dVX = Math.abs(gPos[q + 2] - refVXp[p]);
        var dVY = Math.abs(gPos[q + 3] - refVYp[p]);
        if (dPX > maxPosDiff) { maxPosDiff = dPX; worstP = p; worstWhat = 'pos.x'; }
        if (dPY > maxPosDiff) { maxPosDiff = dPY; worstP = p; worstWhat = 'pos.y'; }
        if (dVX > maxVelDiff) { maxVelDiff = dVX; }
        if (dVY > maxVelDiff) { maxVelDiff = dVY; }
        var avx = Math.abs(refVXp[p]); if (avx > maxRefVelMag) maxRefVelMag = avx;
        var avy = Math.abs(refVYp[p]); if (avy > maxRefVelMag) maxRefVelMag = avy;
        var dA0 = Math.abs(gAff[q]     - refG00[p]);
        var dA1 = Math.abs(gAff[q + 1] - refG01[p]);
        var dA2 = Math.abs(gAff[q + 2] - refG10[p]);
        var dA3 = Math.abs(gAff[q + 3] - refG11[p]);
        if (dA0 > maxAffineDiff) maxAffineDiff = dA0;
        if (dA1 > maxAffineDiff) maxAffineDiff = dA1;
        if (dA2 > maxAffineDiff) maxAffineDiff = dA2;
        if (dA3 > maxAffineDiff) maxAffineDiff = dA3;
        var dAer = Math.abs(gAux[q + 1] - refAerP[p]);
        if (dAer > maxAerDiff) maxAerDiff = dAer;
        // flag: type/origin must match exactly. Sleeping/restFrames also
        // match except for a narrow f32 threshold tie: GPU and reference
        // velocities may differ within the accepted numeric tolerance but
        // land on opposite sides of the hard |v| < 3 sleep comparison.
        var f = gFlag[p];
        var identityWrong = (f & 3) !== snap.type[p] ||
          ((f >> 2) & 3) !== snap.origin[p];
        var sleepWrong = ((f >> 4) & 1) !== refSleep[p] ||
          ((f >> 8) & 0xffff) !== refRest[p];
        if (identityWrong || sleepWrong) {
          flagFails++;
          if (identityWrong) {
            identityFlagFails++;
          } else {
            var gpuVSq = Math.fround(Math.fround(gPos[q + 2] * gPos[q + 2]) +
              Math.fround(gPos[q + 3] * gPos[q + 3]));
            var refVSq = Math.fround(Math.fround(refVXp[p] * refVXp[p]) +
              Math.fround(refVYp[p] * refVYp[p]));
            if ((gpuVSq < LIQUID_SLEEP_VSQ) !== (refVSq < LIQUID_SLEEP_VSQ)) {
              sleepThresholdTies++;
            }
          }
          if (worstWhat === '' || worstWhat.indexOf('flag') < 0) {
            worstP = p; worstWhat = 'flag';
          }
        }
      }

      // Tolerances — pure f32 / fixed-point round() tie noise, scaled a
      // little by the multi-corner gather + the cell->world unit changes.
      // v24.10 — the velocity tolerance is RELATIVE. f32 rounding error is
      // proportional to magnitude, and a DEEP pool that hasn't fully settled at
      // boot has fast transient particles (hundreds of px/s) whose ~0.1% f32
      // divergence dwarfs the old 0.05 absolute floor (a false FAIL even though
      // position barely moves — vel FAILs while pos/affine/aer PASS). A real
      // code drift is a large FRACTION of the velocity, so 1% of the peak speed
      // (floored at 0.05) still catches drift while passing benign magnitude
      // noise. velTol scales with maxRefVelMag, reported below for triage.
      var posTol = 0.02;
      var velTol = Math.max(0.05, maxRefVelMag * 0.01);
      var affineTol = 0.05;
      var aerTol = 0.02;
      var fail = '';
      if (maxPosDiff >= posTol) {
        fail = worstWhat + ' diff ' + maxPosDiff.toFixed(5) +
          ' at particle ' + worstP + ' (gpu vs CPU reference)';
      } else if (maxVelDiff >= velTol) {
        fail = 'velocity diff ' + maxVelDiff.toFixed(5) + ' vs tol ' +
          velTol.toFixed(5) + ' (peak|v|=' + maxRefVelMag.toFixed(1) +
          ', gpu vs CPU reference)';
      } else if (maxAffineDiff >= affineTol) {
        fail = 'affine diff ' + maxAffineDiff.toFixed(5) + ' (gpu vs CPU reference)';
      } else if (maxAerDiff >= aerTol) {
        fail = 'aeration diff ' + maxAerDiff.toFixed(5) + ' (gpu vs CPU reference)';
      } else if (identityFlagFails > 0 ||
                 flagFails > sleepThresholdTies || sleepThresholdTies > 4) {
        fail = flagFails + ' particles with wrong sleeping/restFrames flag';
      }

      if (fail) {
        try {
          console.log('LiquidWGPU Stage 5: G2P FAIL — ' + fail +
            ' (' + count + ' particles, ' + g2pAwake + ' awake, grid ' +
            g.w + 'x' + g.h + ').');
        } catch (_) {}
      } else {
        try {
          console.log('LiquidWGPU Stage 5: G2P OK — ' + count +
            ' particles, maxPosDiff=' + maxPosDiff.toFixed(6) +
            ', maxVelDiff=' + maxVelDiff.toFixed(6) + '/tol' + velTol.toFixed(4) +
            ', maxAffineDiff=' + maxAffineDiff.toFixed(6) +
            ' (' + g2pAwake + ' awake, peak|v|=' + maxRefVelMag.toFixed(1) +
            ', maxAerDiff=' + maxAerDiff.toFixed(6) +
            (sleepThresholdTies ? ', sleepTie=' + sleepThresholdTies : '') +
            ', grid ' + g.w + 'x' + g.h + ').');
        } catch (_) {}
      }
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 5: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
    return instance.stage5Done;
  }

  /* ---- Stage 6 verification — terrain collision ------------------------
   * Upload the live particle state, run the full GPU per-frame chain with
   * GPU terrain collision (buildGrid -> P2G -> clearDV -> pressure ->
   * gridUpdate -> g2p -> collide), read back buf.pos and diff vs a bit-
   * faithful CPU reference of the SAME scope.
   *
   * The reference re-runs the shared core-MPM-step reference (liquidG2P-
   * Reference — P2G + pressure + grid + G2P, producing the post-G2P
   * position/velocity), then ports liquidMoveParticle on top: the 4-point
   * solidity probe, the rollback to the pre-step position, the velocity
   * reflect, the 8 nudge directions and the world-bounds clamp. It samples
   * the SAME terrain bitmask the GPU was handed (instance.staging.terrain-
   * Solid, snapshotted right after uploadTerrainMask), so the CPU and GPU
   * solidity tests agree tile-for-tile.
   *
   * Scope deliberately MATCHES the GPU collide kernel — terrain only. The
   * miner-silhouette half of the CPU liquidSolidAt is excluded (Stage 8),
   * and the CPU's remove-on-non-finite is replaced by a clamp/zero on
   * both sides (Stage 8 will port removal).
   *
   * Two assertions:
   *  - maxPosDiff: GPU buf.pos vs the CPU reference (a faithful port diff
   *    — pure f32 round() tie noise).
   *  - inSolid: for EVERY GPU output position, sample the bitmask CPU-side
   *    — no particle may end inside a solid tile. Must be exactly 0.
   *
   * Snapshot discipline: the CPU MPM solver mutates the arrays every
   * frame and the readback is async — the reference runs over a copy
   * frozen at upload time, never the live arrays.
   * -------------------------------------------------------------------- */
  function runStage6SelfTest(instance) {
    var L = instance.liquid;
    if (!L) {
      try { console.log('LiquidWGPU Stage 6: no liquid arrays wired — collide kernel built, self-test skipped.'); } catch (_) {}
      return;
    }
    if (!instance.collideReady) {
      try { console.log('LiquidWGPU Stage 6: collide pipeline unavailable — self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 6: 0 live particles — collide self-test deferred.'); } catch (_) {}
      return;
    }
    // Freeze every input the chain reads, BEFORE any further CPU step.
    var a = L.arrays;
    var snap = {
      x: a.x.slice(0, count),     y: a.y.slice(0, count),
      vx: a.vx.slice(0, count),   vy: a.vy.slice(0, count),
      g00: a.g00.slice(0, count), g01: a.g01.slice(0, count),
      g10: a.g10.slice(0, count), g11: a.g11.slice(0, count),
      density: a.density.slice(0, count),
      aeration: a.aeration.slice(0, count),
      type: a.type.slice(0, count),
      origin: a.origin.slice(0, count),
      sleeping: a.sleeping.slice(0, count),
      frozen: a.frozen.slice(0, count),
      restFrames: a.restFrames.slice(0, count)
    };

    // GPU: grid + terrain bounds from the snapshot, fill + upload the
    // solidity mask, then the full per-frame chain ending with collide.
    computeGridBounds(instance, count);
    var g = instance.grid;
    computeTerrainBounds(instance, count);
    var terr = instance.terrain;
    uploadTerrainMask(instance);
    // Snapshot the byte/tile solidity array the GPU was handed — the CPU
    // collide reference samples the exact same mask (the staging buffer is
    // reused, so copy the active prefix now).
    var solidSnap = instance.staging.terrainSolid.slice(0, terr.tiles);
    buildGrid(instance);
    runP2G(instance);
    runGrid2(instance);
    runG2P(instance);

    // ---- CPU reference — the shared core-MPM-step reference, then a
    // bit-faithful port of liquidMoveParticle (terrain-only) on top.
    // NOTE: the collide skip predicate is NOT R.refSleep — it is the
    // GPU's own post-G2P flag buffer, read back below. See the rationale
    // at the buf.flag readback.
    var R = liquidG2PReference(instance, count, snap);
    var fr = Math.fround;
    var TILE = instance.worldTile;
    var oc = terr.originCol, orow = terr.originRow, tw = terr.w, th = terr.h;

    // terrainSolidAt — sample the snapshotted byte/tile mask. Mirrors the
    // WGSL terrainSolidAt: tile = floor(px/TILE), local index into the
    // rect, out-of-rect reads non-solid.
    function terrainSolidAt(px, py) {
      var tc = Math.floor(fr(px / TILE)) - oc;
      var tr = Math.floor(fr(py / TILE)) - orow;
      if (tc < 0 || tr < 0 || tc >= tw || tr >= th) return false;
      return solidSnap[tr * tw + tc] !== 0;
    }
    // solidRing — the 4-point probe (terrain-only liquidSolidAt). The
    // probe offsets are f32 adds, matching the WGSL solidRing exactly.
    function solidRing(x, y, rad) {
      if (terrainSolidAt(x, fr(y + rad))) return true;
      if (terrainSolidAt(fr(x - rad), y)) return true;
      if (terrainSolidAt(fr(x + rad), y)) return true;
      if (terrainSolidAt(x, fr(y - rad))) return true;
      return false;
    }

    // The collide kernel under test consumes the GPU's OWN post-G2P state
    // (buf.pos = post-G2P x/y/vx/vy; buf.aux.zw = the g2p-stashed pre-step
    // rollback target; buf.flag = post-G2P flag, whose sleeping[4] bit is
    // the collide skip predicate). Seeding the CPU reference from the CPU
    // G2P reference (R.refPX/... , R.refSleep) instead would feed it
    // positions / a sleep bit that differ from the GPU by up to the Stage-5
    // G2P tolerance (~0.02 px on velocity) — and:
    //  - a sub-tolerance position drift across a tile boundary flips a
    //    floor(px/TILE) solidRing probe, so one side rolls back + reflects
    //    velocity (v -> -bounce*v) and the other does not;
    //  - the G2P sleep test (newVX^2+newVY^2 < LIQUID_SLEEP_VSQ) is a HARD
    //    threshold, so a sub-tolerance velocity drift for a particle near
    //    that boundary flips the sleeping bit — collide skips sleeping
    //    particles, so one side collides (reflects velocity on a terrain
    //    hit) and the other skips entirely.
    // Either way a full v*(1+bounce) divergence. Read buf.pos + buf.aux +
    // buf.flag back AFTER runG2P and BEFORE runCollide so the reference
    // collides the exact same input — and skips the exact same set — the
    // kernel does; this isolates the test to the collide logic (Stage 5
    // already independently verifies G2P matches within tolerance).
    var rC = fr(LIQUID_COLLIDE_RADIUS);
    var maxXw = fr(fr(instance.worldCols * TILE) - rC);
    var maxYw = fr(fr(instance.worldTotalRows + 2) * TILE);
    var yReset = fr(fr(instance.worldTotalRows + 1) * TILE);
    var step = fr(rC * 0.9);

    // v24.112 — the continuation below WRITES the live particle buffers (the
    // post-G2P restore) on a later task. Stage 8 defers the GPU go-live on
    // this promise so the restore can never land on top of a resident,
    // already-live sim (it used to clobber the live flag buffer with the
    // boot CPU classifier's frozen bits a few frames after go-live, leaving
    // a permanently skipped + invisible slice of the first pond).
    instance.stage6Done = Promise.all([
      readbackBuffer(instance, instance.buf.pos, count * 16),
      readbackBuffer(instance, instance.buf.aux, count * 16),
      readbackBuffer(instance, instance.buf.flag, count * 4)
    ]).then(function (g2pRes) {
      var g2pPos = new Float32Array(g2pRes[0]);   // post-G2P x/y/vx/vy
      var g2pAux = new Float32Array(g2pRes[1]);   // post-G2P aux; .zw = rollback target
      var g2pFlag = new Uint32Array(g2pRes[2]);   // post-G2P flag; bit 4 = sleeping
      // Re-seed buf.pos/aux/flag with the captured post-G2P state before
      // runCollide. The mapAsync readbacks above resolve on a LATER task,
      // so the synchronous remainder of LiquidWGPU.create() — in
      // particular runStage7SelfTest's uploadParticles() — has already run
      // and OVERWRITTEN buf.pos/aux/flag with the raw (pre-step) CPU
      // particle state. Without this restore the collide kernel would run
      // on Stage 7's upload, not the post-G2P state the CPU reference
      // collides — a data-dependent solidRing mismatch that rolls back +
      // reflects velocity on one side only (~145 px/s vel.y divergence).
      // Writing the exact captured buffers back makes the kernel collide
      // precisely g2pPos / g2pAux / g2pFlag, immune to buffer clobbering
      // by any later stage's self-test.
      instance.queue.writeBuffer(instance.buf.pos,  0, g2pPos);
      instance.queue.writeBuffer(instance.buf.aux,  0, g2pAux);
      instance.queue.writeBuffer(instance.buf.flag, 0, g2pFlag);
      // runCollide dispatches instance.uploadedCount threads; a later
      // stage's uploadParticles may have changed it (the live CPU sim
      // adds/removes particles every frame). Restore it to this test's
      // captured count so the kernel collides exactly [0,count) — the
      // same range the CPU reference and the buffer restores above cover.
      instance.uploadedCount = count;
      // Now run the GPU collide kernel — its buf.pos input is the exact
      // g2pPos just captured, its rollback target the exact g2pAux.zw.
      runCollide(instance);

      // Reference post-collide state, seeded from the GPU post-G2P output
      // (frozen / still-asleep particles stay untouched, like the kernel).
      var refPX2 = new Float32Array(count), refPY2 = new Float32Array(count);
      var refVX2 = new Float32Array(count), refVY2 = new Float32Array(count);
      var collideCount = 0;
      for (var i = 0; i < count; i++) {
        var qi = i * 4;
        var x  = g2pPos[qi];
        var y  = g2pPos[qi + 1];
        var vx = g2pPos[qi + 2];
        var vy = g2pPos[qi + 3];
        // Seed untouched: frozen / still-asleep particles keep post-G2P.
        refPX2[i] = x; refPY2[i] = y;
        refVX2[i] = vx; refVY2[i] = vy;
        // Skip frozen OR (post-G2P) sleeping — exactly the GPU collide skip.
        // The kernel reads BOTH bits from the post-G2P flag buffer
        // (sleeping[4], frozen[5]) that g2p just rewrote; mirror that read
        // bit-for-bit. Using R.refSleep here instead would re-derive the
        // sleep bit from the CPU G2P reference's velocity, which differs
        // from the GPU's by up to the Stage-5 tolerance — and the sleep
        // test is a hard threshold, so a particle near it flips. That made
        // the reference skip a particle the kernel collides (or vice
        // versa) → a full velocity divergence on any terrain hit.
        var fl = g2pFlag[i];
        var flSleeping = (fl >>> 4) & 1;
        var flFrozen   = (fl >>> 5) & 1;
        if (flFrozen || flSleeping) continue;
        collideCount++;
        // Sanitize non-finite (the GPU clamps/zeros instead of removing).
        if (!(x === x))   { x = 0; }
        if (!(y === y))   { y = 0; }
        if (!(vx === vx)) { vx = 0; }
        if (!(vy === vy)) { vy = 0; }
        // bounce as f32 — the GPU's select() picks an f32 const.
        var bounce = fr(snap.type[i] === 1 ? LIQUID_BOUNCE_OIL : LIQUID_BOUNCE_WATER);
        // Rollback target — the pre-step world position the g2p kernel
        // stashed into aux.zw. The WGSL `select(x, aux.z, aux.z != 0)`
        // falls back to the current x on a 0 prev — mirror that.
        var prevX = g2pAux[qi + 2] !== 0 ? g2pAux[qi + 2] : x;
        var prevY = g2pAux[qi + 3] !== 0 ? g2pAux[qi + 3] : y;
        // v26.13 — bit-faithful reference for the kernel's swept segment
        // collision. All arithmetic that feeds a probe is rounded to f32.
        var moveDXR = fr(x - prevX);
        var moveDYR = fr(y - prevY);
        var moveDistR = fr(Math.sqrt(fr(fr(moveDXR * moveDXR) + fr(moveDYR * moveDYR))));
        var moveHitR = false;
        if (moveDistR > 0.001) {
          var moveStepR = fr(Math.max(0.75, fr(rC * 0.75)));
          var moveNR = Math.min(128, Math.max(1, Math.ceil(fr(moveDistR / moveStepR))));
          var clearXR = prevX, clearYR = prevY;
          for (var moveIR = 1; moveIR <= moveNR; moveIR++) {
            var mtR = fr(moveIR / moveNR);
            var sampleXR = fr(prevX + fr(moveDXR * mtR));
            var sampleYR = fr(prevY + fr(moveDYR * mtR));
            if (solidRing(sampleXR, sampleYR, rC)) {
              x = clearXR; y = clearYR; moveHitR = true; break;
            }
            clearXR = sampleXR; clearYR = sampleYR;
          }
        } else if (solidRing(x, y, rC)) {
          x = prevX; y = prevY; moveHitR = true;
        }
        if (moveHitR) {
          vx = fr(vx * (-bounce));
          vy = fr(vy * (-bounce));
          if (solidRing(x, y, rC)) {
            // 8 nudge directions (CPU LIQ_NUDGES order); first clear wins.
            var nx, ny;
            // (0,-1)
            nx = x; ny = fr(y - step);
            if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
            else {
              // (-1,0)
              nx = fr(x - step); ny = y;
              if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
              else {
                // (1,0)
                nx = fr(x + step); ny = y;
                if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                else {
                  // (0,1)
                  nx = x; ny = fr(y + step);
                  if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                  else {
                    // (-1,-1)
                    nx = fr(x - step); ny = fr(y - step);
                    if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                    else {
                      // (1,-1)
                      nx = fr(x + step); ny = fr(y - step);
                      if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                      else {
                        // (-1,1)
                        nx = fr(x - step); ny = fr(y + step);
                        if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                        else {
                          // (1,1)
                          nx = fr(x + step); ny = fr(y + step);
                          if (!solidRing(nx, ny, rC)) { x = nx; y = ny; }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        // World-bounds clamp — x both edges, y lower edge only.
        if (x < rC) { x = rC; vx = fr(Math.abs(vx) * bounce); }
        if (x > maxXw) { x = maxXw; vx = fr(-fr(Math.abs(vx) * bounce)); }
        if (y > maxYw) { y = yReset; vy = fr(-fr(Math.abs(vy) * bounce)); }
        // Final sanitize.
        if (!(x === x))   { x = rC; }
        if (!(y === y))   { y = 0; }
        if (!(vx === vx)) { vx = 0; }
        if (!(vy === vy)) { vy = 0; }
        refPX2[i] = x; refPY2[i] = y;
        refVX2[i] = vx; refVY2[i] = vy;
      }

      return readbackBuffer(instance, instance.buf.pos, count * 16)
        .then(function (res) {
      var gPos = new Float32Array(res);
      var maxPosDiff = 0, worstP = -1, worstWhat = '';
      var inSolid = 0;
      for (var p = 0; p < count; p++) {
        var q = p * 4;
        var dPX = Math.abs(gPos[q]     - refPX2[p]);
        var dPY = Math.abs(gPos[q + 1] - refPY2[p]);
        var dVX = Math.abs(gPos[q + 2] - refVX2[p]);
        var dVY = Math.abs(gPos[q + 3] - refVY2[p]);
        if (dPX > maxPosDiff) { maxPosDiff = dPX; worstP = p; worstWhat = 'pos.x'; }
        if (dPY > maxPosDiff) { maxPosDiff = dPY; worstP = p; worstWhat = 'pos.y'; }
        if (dVX > maxPosDiff) { maxPosDiff = dVX; worstP = p; worstWhat = 'vel.x'; }
        if (dVY > maxPosDiff) { maxPosDiff = dVY; worstP = p; worstWhat = 'vel.y'; }
        // Invariant — no GPU output position's CENTRE may sit inside a
        // solid tile. The centre-tile test is the true "embedded in
        // terrain" check: the 4-point probe ring legitimately touches a
        // wall for any particle resting against one (and liquidMove-
        // Particle does not guarantee a ring-clear result — it gives up
        // after 8 nudges), so ring-touch is normal; a solid CENTRE tile
        // is the actual failure. Checked for every output position.
        if (terrainSolidAt(gPos[q], gPos[q + 1])) inSolid++;
      }
      // Tolerance — pure f32 round() tie noise from the port diff.
      var posTol = 0.02;
      var fail = '';
      if (maxPosDiff >= posTol) {
        fail = worstWhat + ' diff ' + maxPosDiff.toFixed(5) +
          ' at particle ' + worstP + ' (gpu vs CPU reference)';
      } else if (inSolid > 0) {
        fail = inSolid + ' particle(s) ended inside a solid tile';
      }
      if (fail) {
        try {
          console.log('LiquidWGPU Stage 6: collision FAIL — ' + fail +
            ' (' + count + ' particles, ' + collideCount + ' collided, terrain ' +
            tw + 'x' + th + ').');
        } catch (_) {}
      } else {
        try {
          console.log('LiquidWGPU Stage 6: collision OK — ' + count +
            ' particles, maxPosDiff=' + maxPosDiff.toFixed(6) +
            ', inSolid=' + inSolid);
        } catch (_) {}
      }
        });   // end post-collide buf.pos readback .then
    }).catch(function (e) {
      try { console.log('LiquidWGPU Stage 6: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
    });
  }

  /* ---- WGSL — spatial-grid count-sort kernels ------------------------
   * Shared header: the Params uniform + the 6 grid storage buffers.
   * gridParams.originX/Y arrive as the i32 bit pattern in a u32 lane;
   * bitcast recovers the signed value. flatCell() does the per-particle
   * cx,cy and clamps to the grid like the CPU reference.
   * -------------------------------------------------------------------- */
  var WGSL_GRID_COMMON = /* wgsl */ `
struct GridParams {
  count   : u32,   // live particle count
  gridW   : u32,   // grid width  in cells
  gridH   : u32,   // grid height in cells
  originX : u32,   // i32 bit pattern — cell-space bbox min x
  originY : u32,   // i32 bit pattern — cell-space bbox min y
  cells   : u32,   // gridW * gridH
  stepDt  : f32,   // (shared paramsBuf lane 6 — named, was _pad0)
  invCell : f32,   // v15.0 — the block-marking base MUST use the same
                   // x * invCell math the P2G/pressure/G2P kernels use
                   // (flatCell's x / CELL floor can differ by one at cell
                   // boundaries in f32, letting a splat escape the marks)
  _pad2   : u32,
  _pad3   : u32,
  _pad4   : u32,
  _pad5   : u32,
  _pad6   : u32,
  _pad7   : u32,
  _pad8   : u32,
  _pad9   : u32,
  region  : vec4<f32>,   // v14.31 active-region box world px: minX,minY,maxX,maxY
};
@group(0) @binding(0) var<uniform> gp : GridParams;
@group(0) @binding(1) var<storage, read>       pos        : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> cellCount  : array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> cellStart  : array<u32>;
@group(0) @binding(4) var<storage, read_write> cellCursor : array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> blockSums  : array<u32>;
@group(0) @binding(6) var<storage, read_write> cellOf     : array<u32>;
@group(0) @binding(7) var<storage, read_write> sortedIdx  : array<u32>;
// v15.0 sparse — declared here for the sparse kernels; the dense kernels
// never reference them (unused declarations are not validated against the
// layout, so a sparse-incapable device's 8-entry layout still builds the
// dense pipelines from this same header).
@group(0) @binding(8)  var<storage, read_write> blockBitmap : array<atomic<u32>>;
@group(0) @binding(9)  var<storage, read_write> blockList   : array<u32>;
@group(0) @binding(10) var<storage, read_write> blockMeta   : array<atomic<u32>>;

const CELL : f32 = ${LIQUID_CELL_DEFAULT};
const WG   : u32 = ${WG}u;
const BLOCK_BITMAP_WORDS : u32 = ${BLOCK_BITMAP_WORDS}u;

// v15.0 — mark a block live in the bitmap (blockId = by * (gridW/16) + bx).
// Test-before-or: thousands of particles share a handful of pond blocks, so
// a plain atomicOr serialises on the few hot words; once the bit is set
// (the overwhelmingly common case) a read suffices.
fn markBlock(b : u32) {
  let w = b >> 5u;
  let m = 1u << (b & 31u);
  if ((atomicLoad(&blockBitmap[w]) & m) == 0u) {
    atomicOr(&blockBitmap[w], m);
  }
}

// Flat cell index for a particle position, clamped into the grid the
// same way the CPU reference clamps (so out-of-bbox strays still land
// in a valid cell rather than indexing past the buffers).
fn flatCell(p : vec2<f32>) -> u32 {
  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);
  var cx = i32(floor(p.x / CELL)) - ox;
  var cy = i32(floor(p.y / CELL)) - oy;
  cx = clamp(cx, 0, i32(gp.gridW) - 1);
  cy = clamp(cy, 0, i32(gp.gridH) - 1);
  return u32(cy) * gp.gridW + u32(cx);
}

// v14.31 — active-region cull. A particle outside gp.region is settled
// off-screen water; the sim skips it (the smaller grid does not enclose
// its cell). Must be tested before any cell-index math.
fn outOfRegion(p : vec2<f32>) -> bool {
  return p.x < gp.region.x || p.x > gp.region.z
      || p.y < gp.region.y || p.y > gp.region.w;
}
`;

  // 1. clearCells — zero cellCount over [0, cells).
  var WGSL_CLEAR = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.cells) { return; }
  atomicStore(&cellCount[i], 0u);
}
`;

  // 2. countCells — per particle: compute + store its flat cell index,
  //    then atomicAdd a 1 into that cell's counter. v15.0 — built by a
  //    template: the sparse variant (mark=true) additionally marks every
  //    16x16 block the particle's 3x3 stencil overlaps (up to 4 blocks —
  //    the stencil spans at most 2 blocks per axis). Marking from the
  //    CLAMPED cell keeps it consistent with cellOf; every cell any grid
  //    kernel can WRITE for this particle lies inside a marked block.
  function countKernel(mark) {
    return '\n@compute @workgroup_size(256)\n' +
      'fn main(@builtin(global_invocation_id) gid : vec3<u32>) {\n' +
      '  let i = gid.x;\n' +
      '  if (i >= gp.count) { return; }\n' +
      '  if (outOfRegion(pos[i].xy)) { return; }   // v14.31 - skip off-region\n' +
      '  let cell = flatCell(pos[i].xy);\n' +
      '  cellOf[i] = cell;\n' +
      '  atomicAdd(&cellCount[cell], 1u);\n' +
      (mark ?
      // The mark base is the P2G/pressure/G2P stencil base — the SAME
      // x * invCell floor those kernels compute (NOT flatCell's x / CELL,
      // whose f32 floor can land one cell off at boundaries). Marks cover
      // the 3x3 stencil around it; block coords clamp at the grid edge
      // (strays skip their splats via the kernel-side stray guard).
      '  let ox  = bitcast<i32>(gp.originX);\n' +
      '  let oy  = bitcast<i32>(gp.originY);\n' +
      '  let mgx = i32(floor(pos[i].x * gp.invCell)) - ox;\n' +
      '  let mgy = i32(floor(pos[i].y * gp.invCell)) - oy;\n' +
      '  let bw  = gp.gridW >> 4u;\n' +
      // +/-2 (not the stencil's +/-1): declump runs AFTER this marking and
      // may move a particle up to one cell before P2G splats, shifting the
      // 3x3 stencil by one. +/-2 covers the worst case; a 5-cell span still
      // overlaps at most 2 blocks per axis, so the 4 atomicOrs below hold.
      '  let bx0 = u32(clamp(mgx - 2, 0, i32(gp.gridW) - 1)) >> 4u;\n' +
      '  let by0 = u32(clamp(mgy - 2, 0, i32(gp.gridH) - 1)) >> 4u;\n' +
      '  let bx1 = u32(clamp(mgx + 2, 0, i32(gp.gridW) - 1)) >> 4u;\n' +
      '  let by1 = u32(clamp(mgy + 2, 0, i32(gp.gridH) - 1)) >> 4u;\n' +
      '  markBlock(by0 * bw + bx0);\n' +
      '  if (bx1 != bx0) { markBlock(by0 * bw + bx1); }\n' +
      '  if (by1 != by0) {\n' +
      '    markBlock(by1 * bw + bx0);\n' +
      '    if (bx1 != bx0) { markBlock(by1 * bw + bx1); }\n' +
      '  }\n' : '') +
      '}\n';
  }
  var WGSL_COUNT = countKernel(false);
  var WGSL_COUNT_MARK = countKernel(true);

  /* ---- v15.0 — sparse block bookkeeping kernels ----------------------
   * bitmapReset : ONE workgroup — zero the 256 bitmap words and reset the
   *               blockMeta indirect args to (0, 1, 1, 0).
   * blockCompact: ONE workgroup — deterministic bitmap->list compaction.
   *               Each lane owns one bitmap word (32 blocks); a workgroup
   *               scan of the per-word popcounts assigns each word its
   *               output base, then the lane streams its set bits into
   *               blockList in blockId order. Lane 255 publishes the total
   *               into blockMeta[0] — the x lane of every subsequent
   *               dispatchWorkgroupsIndirect. No CPU involvement.
   * ------------------------------------------------------------------- */
  var WGSL_BITMAP_RESET = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let lx = lid.x;
  if (lx < BLOCK_BITMAP_WORDS) { atomicStore(&blockBitmap[lx], 0u); }
  if (lx == 0u) {
    atomicStore(&blockMeta[0], 0u);
    atomicStore(&blockMeta[1], 1u);
    atomicStore(&blockMeta[2], 1u);
    atomicStore(&blockMeta[3], 0u);
  }
}
`;

  var WGSL_BLOCK_COMPACT = /* wgsl */ `
var<workgroup> wsum : array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let lx = lid.x;
  let word = atomicLoad(&blockBitmap[lx]);
  let n = countOneBits(word);
  wsum[lx] = n;
  workgroupBarrier();

  // Inclusive Hillis-Steele scan of the 256 per-word popcounts.
  var offset : u32 = 1u;
  loop {
    if (offset >= 256u) { break; }
    var add : u32 = 0u;
    if (lx >= offset) { add = wsum[lx - offset]; }
    workgroupBarrier();
    if (lx >= offset) { wsum[lx] = wsum[lx] + add; }
    workgroupBarrier();
    offset = offset * 2u;
  }

  // Stream this word's set bits to blockList at the exclusive base.
  var m : u32 = word;
  var o : u32 = wsum[lx] - n;
  loop {
    if (m == 0u) { break; }
    let b = firstTrailingBit(m);
    blockList[o] = lx * 32u + b;
    m = m & (m - 1u);
    o = o + 1u;
  }
  if (lx == 255u) { atomicStore(&blockMeta[0], wsum[lx]); }
}
`;

  /* ---- v15.0 — sparse count-sort scan ---------------------------------
   * Same two-level exclusive scan as the dense passes A/B/C, but over the
   * ACTIVE blocks only: pass A scans each active block's 256 cellCounts
   * (one workgroup per active block, indirect), pass B single-workgroup
   * scans the per-block totals (dynamic count from blockMeta), pass C adds
   * the block bases back AND seeds cellCursor — which retires the dense
   * cellStart->cellCursor buffer copy. cellStart values land in active-
   * list compaction order rather than dense row-major order; every
   * consumer (scatter, declump's neighbour walk) only requires that the
   * per-cell segments partition [0, inRegionCount), which holds.
   * ------------------------------------------------------------------- */
  var WGSL_SCAN_LOCAL_SPARSE = /* wgsl */ `
var<workgroup> tmp : array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>,
        @builtin(workgroup_id)        wid : vec3<u32>) {
  let lx  = lid.x;
  let blk = blockList[wid.x];
  let bw  = gp.gridW >> 4u;
  let i = ((blk / bw) * 16u + (lx >> 4u)) * gp.gridW
        +  (blk % bw) * 16u + (lx & 15u);
  let v = atomicLoad(&cellCount[i]);
  tmp[lx] = v;
  workgroupBarrier();

  var offset : u32 = 1u;
  loop {
    if (offset >= WG) { break; }
    var add : u32 = 0u;
    if (lx >= offset) { add = tmp[lx - offset]; }
    workgroupBarrier();
    if (lx >= offset) { tmp[lx] = tmp[lx] + add; }
    workgroupBarrier();
    offset = offset * 2u;
  }

  cellStart[i] = tmp[lx] - v;
  if (lx == WG - 1u) {
    blockSums[wid.x] = tmp[lx];
  }
}
`;

  // B-sparse — a single workgroup exclusive-scans the ACTIVE blockSums
  // prefix (dynamic count from blockMeta[0], <= 8192; the strided
  // two-phase layout mirrors the dense WGSL_SCAN_BLOCKS).
  var WGSL_SCAN_BLOCKS_SPARSE = /* wgsl */ `
var<workgroup> chunk : array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let lx = lid.x;
  let nblocks = atomicLoad(&blockMeta[0]);
  let per = (nblocks + WG - 1u) / WG;
  let base = lx * per;

  var s : u32 = 0u;
  var k : u32 = 0u;
  loop {
    if (k >= per) { break; }
    let idx = base + k;
    if (idx < nblocks) { s = s + blockSums[idx]; }
    k = k + 1u;
  }
  chunk[lx] = s;
  workgroupBarrier();

  var offset : u32 = 1u;
  loop {
    if (offset >= WG) { break; }
    var add : u32 = 0u;
    if (lx >= offset) { add = chunk[lx - offset]; }
    workgroupBarrier();
    if (lx >= offset) { chunk[lx] = chunk[lx] + add; }
    workgroupBarrier();
    offset = offset * 2u;
  }

  var running : u32 = 0u;
  if (lx > 0u) { running = chunk[lx - 1u]; }
  var k2 : u32 = 0u;
  loop {
    if (k2 >= per) { break; }
    let idx = base + k2;
    if (idx < nblocks) {
      let cv = blockSums[idx];
      blockSums[idx] = running;
      running = running + cv;
    }
    k2 = k2 + 1u;
  }
}
`;

  // C-sparse — add the block bases back onto each active block's 256
  // cellStarts, and seed cellCursor with the final value (replaces the
  // dense pass C + the cellStart->cellCursor copyBufferToBuffer).
  var WGSL_SCAN_ADD_SPARSE = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>,
        @builtin(workgroup_id)        wid : vec3<u32>) {
  let lx  = lid.x;
  let blk = blockList[wid.x];
  let bw  = gp.gridW >> 4u;
  let i = ((blk / bw) * 16u + (lx >> 4u)) * gp.gridW
        +  (blk % bw) * 16u + (lx & 15u);
  let v = cellStart[i] + blockSums[wid.x];
  cellStart[i] = v;
  atomicStore(&cellCursor[i], v);
}
`;

  // v15.0 — end-of-sub-step clear, grid-layout share: re-zero the active
  // blocks' cellCounts so the global-zero invariant holds for the next
  // sub-step (the p2g / grid2 shares clear the other cell buffers).
  var WGSL_CLEAR_COUNT_SPARSE = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>,
        @builtin(workgroup_id)        wid : vec3<u32>) {
  let blk = blockList[wid.x];
  let bw  = gp.gridW >> 4u;
  let i = ((blk / bw) * 16u + (lid.x >> 4u)) * gp.gridW
        +  (blk % bw) * 16u + (lid.x & 15u);
  atomicStore(&cellCount[i], 0u);
}
`;

  /* prefixSum — exclusive scan of cellCount -> cellStart in 3 passes:
   *   A scanLocal  : each workgroup Hillis-Steele-scans its 256-cell
   *                  block in shared memory, writes the per-cell
   *                  exclusive value to cellStart and the block total
   *                  to blockSums[workgroup].
   *   B scanBlocks : one workgroup exclusive-scans blockSums in place
   *                  (<= 4096 entries, strided to cover them all).
   *   C scanAdd    : each cell adds its block's scanned base
   *                  (blockSums[workgroup]) onto cellStart, producing
   *                  the global exclusive prefix-sum.
   * Standard two-level scan — exact, no precision loss (all u32). */
  var WGSL_SCAN_LOCAL = /* wgsl */ `
var<workgroup> tmp : array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>,
        @builtin(local_invocation_id)  lid : vec3<u32>,
        @builtin(workgroup_id)         wid : vec3<u32>) {
  let i  = gid.x;
  let lx = lid.x;
  // Load this cell's count (0 past the active grid).
  var v : u32 = 0u;
  if (i < gp.cells) { v = atomicLoad(&cellCount[i]); }
  tmp[lx] = v;
  workgroupBarrier();

  // Inclusive Hillis-Steele scan over the 256-wide block.
  var offset : u32 = 1u;
  loop {
    if (offset >= WG) { break; }
    var add : u32 = 0u;
    if (lx >= offset) { add = tmp[lx - offset]; }
    workgroupBarrier();
    if (lx >= offset) { tmp[lx] = tmp[lx] + add; }
    workgroupBarrier();
    offset = offset * 2u;
  }

  // Inclusive -> exclusive: subtract the cell's own value.
  if (i < gp.cells) {
    cellStart[i] = tmp[lx] - v;
  }
  // Last lane publishes the block total (inclusive scan of last cell).
  if (lx == WG - 1u) {
    blockSums[wid.x] = tmp[lx];
  }
}
`;

  // B. scanBlocks — a single workgroup exclusive-scans blockSums.
  // Strided so 256 threads cover up to 256*256 = 65536 block sums
  // (we only ever have <= 4096). Two-phase: serialize per-thread
  // chunk sums through shared memory, then add the chunk base back.
  var WGSL_SCAN_BLOCKS = /* wgsl */ `
const NBLOCKS : u32 = ${SCAN_BLOCKS}u;
var<workgroup> chunk : array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let lx = lid.x;
  // How many block-sums each thread owns (ceil division).
  let per = (NBLOCKS + WG - 1u) / WG;
  let base = lx * per;

  // Phase 1 — each thread sums its own contiguous chunk.
  var s : u32 = 0u;
  var k : u32 = 0u;
  loop {
    if (k >= per) { break; }
    let idx = base + k;
    if (idx < NBLOCKS) { s = s + blockSums[idx]; }
    k = k + 1u;
  }
  chunk[lx] = s;
  workgroupBarrier();

  // Phase 2 — inclusive Hillis-Steele scan of the per-thread chunk sums.
  var offset : u32 = 1u;
  loop {
    if (offset >= WG) { break; }
    var add : u32 = 0u;
    if (lx >= offset) { add = chunk[lx - offset]; }
    workgroupBarrier();
    if (lx >= offset) { chunk[lx] = chunk[lx] + add; }
    workgroupBarrier();
    offset = offset * 2u;
  }

  // Phase 3 — exclusive base for this thread's chunk, then a serial
  // exclusive scan inside the chunk.
  var running : u32 = 0u;
  if (lx > 0u) { running = chunk[lx - 1u]; }
  var k2 : u32 = 0u;
  loop {
    if (k2 >= per) { break; }
    let idx = base + k2;
    if (idx < NBLOCKS) {
      let cv = blockSums[idx];
      blockSums[idx] = running;
      running = running + cv;
    }
    k2 = k2 + 1u;
  }
}
`;

  // C. scanAdd — add each block's scanned base onto its cellStart segment.
  var WGSL_SCAN_ADD = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>,
        @builtin(workgroup_id)         wid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.cells) { return; }
  cellStart[i] = cellStart[i] + blockSums[wid.x];
}
`;

  // 4. scatter — per particle: claim the next free slot in its cell
  //    (atomic bump of cellCursor, pre-seeded from cellStart) and write
  //    the particle index there. Produces sortedIdx grouped by cell.
  var WGSL_SCATTER = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  if (outOfRegion(pos[i].xy)) { return; }   // v14.31 - skip off-region
  let cell = cellOf[i];
  let slot = atomicAdd(&cellCursor[cell], 1u);
  sortedIdx[slot] = i;
}
`;

  /* ---- WGSL — P2G particle->grid scatter (Stage 3) -------------------
   * Shared header for the 3 P2G kernels. The Params uniform here adds
   * the f32 stepDt / invCell lanes; the particle buffers (pos/affine/
   * aux/flag) are read-only, the 5 fixed-point cell accumulators are
   * read_write atomics.
   *
   * Fixed-point: WGSL has no atomic<f32>, so each cell accumulator is
   * atomic<i32>. encodeFx() quantizes a float to i32; the normalize /
   * readback decode with f32(x) / FIXED_SCALE.
   * -------------------------------------------------------------------- */
  var WGSL_P2G_COMMON = /* wgsl */ `
struct P2GParams {
  count   : u32,   // live particle count
  gridW   : u32,   // grid width  in cells
  gridH   : u32,   // grid height in cells
  originX : u32,   // i32 bit pattern — cell-space bbox min x
  originY : u32,   // i32 bit pattern — cell-space bbox min y
  cells   : u32,   // gridW * gridH
  stepDt  : f32,   // sim sub-step (s) — scales velocity into momentum
  invCell : f32,   // 1 / cell pitch  — world px -> cell units
  _pad0   : u32,
  _pad1   : u32,
  _pad2   : u32,
  _pad3   : u32,
  _pad4   : u32,
  _pad5   : u32,
  _pad6   : u32,
  _pad7   : u32,
  region  : vec4<f32>,   // v14.31 active-region box world px: minX,minY,maxX,maxY
};
@group(0) @binding(0) var<uniform> gp : P2GParams;
@group(0) @binding(1) var<storage, read>       pos          : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       affine       : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       aux          : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read>       flag         : array<u32>;
@group(0) @binding(5) var<storage, read_write> cellMass     : array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> cellOilMass  : array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> cellAeration : array<atomic<i32>>;
@group(0) @binding(8) var<storage, read_write> cellVX       : array<atomic<i32>>;
@group(0) @binding(9) var<storage, read_write> cellVY       : array<atomic<i32>>;

const FIXED_SCALE : f32 = ${FIXED_SCALE};

// Float -> fixed-point i32. round() matches the CPU reference's
// nearest-integer quantization for the verification diff.
fn encodeFx(v : f32) -> i32 {
  return i32(round(v * FIXED_SCALE));
}

// v14.31 — active-region cull. A particle outside gp.region is settled
// off-screen water; the sim skips it (the smaller grid does not enclose
// its cell). Must be tested before any cell-index math.
fn outOfRegion(p : vec2<f32>) -> bool {
  return p.x < gp.region.x || p.x > gp.region.z
      || p.y < gp.region.y || p.y > gp.region.w;
}
`;

  // 1. clearP2GCells — zero the 5 fixed-point accumulators over the
  //    active grid. One thread per cell.
  var WGSL_P2G_CLEAR = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.cells) { return; }
  atomicStore(&cellMass[i], 0);
  atomicStore(&cellOilMass[i], 0);
  atomicStore(&cellAeration[i], 0);
  atomicStore(&cellVX[i], 0);
  atomicStore(&cellVY[i], 0);
}
`;

  /* 2. p2gScatter — one thread per particle. Splats mass, APIC affine-
   *    corrected momentum, oil-mass and aeration into the 3x3 quadratic
   *    B-spline stencil. A faithful kernel-for-kernel port of the CPU
   *    liquidP2G inner loop:
   *      - frozen particles are skipped (same as the CPU `continue`).
   *      - lx/ly = world px * invCell; base cell gx,gy = floor(lx,ly).
   *      - dx,dy = cell-centre offset; quadratic weights
   *          w0 = (d+0.5)^2 * 0.5,  w1 = 0.75 - d*d,  w2 = (d-0.5)^2*0.5.
   *      - APIC: cvx = pvx + g00*dx + g01*dy (pvx already in cell units),
   *        and each of the 9 corners adds the affine term for its
   *        (+/-1, +/-1) offset, exactly as the CPU literals expand.
   *    Oil vs water: the CPU has split paths; on the GPU we always
   *    accumulate cellOilMass += oilWeight * w with oilWeight 1/0 — the
   *    water case contributes 0, branchless.
   *    The grid margin guarantees all 9 stencil cells are in [0,cells),
   *    so the dense index is computed directly with no clamp/hash. */
  var WGSL_P2G_SCATTER = /* wgsl */ `
// One stencil-corner contribution: mass += w, oilMass += oilWeight*w,
// aeration += w*aer, momentum += w*cornerVel. Each term is quantized
// then atomicAdd'd into the fixed-point accumulator.
fn splat(cell : u32, w : f32, oilWeight : f32, aer : f32, cvx : f32, cvy : f32) {
  atomicAdd(&cellMass[cell],     encodeFx(w));
  atomicAdd(&cellOilMass[cell],  encodeFx(oilWeight * w));
  atomicAdd(&cellAeration[cell], encodeFx(w * aer));
  atomicAdd(&cellVX[cell],       encodeFx(w * cvx));
  atomicAdd(&cellVY[cell],       encodeFx(w * cvy));
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  let fl = flag[i];
  // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5] rest[8:23].
  let frozen = (fl >> 5u) & 1u;
  if (frozen != 0u) { return; }
  if (outOfRegion(pos[i].xy)) { return; }   // v14.31 - skip off-region

  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);

  let pp = pos[i];
  let lx = pp.x * gp.invCell;
  let ly = pp.y * gp.invCell;
  // Velocity in cell units (CPU: vx * stepDt * invCell).
  let pvx = pp.z * gp.stepDt * gp.invCell;
  let pvy = pp.w * gp.stepDt * gp.invCell;

  let gx = i32(floor(lx));
  let gy = i32(floor(ly));
  let dx = f32(gx) + 0.5 - lx;
  let dy = f32(gy) + 0.5 - ly;

  let wx0 = (dx + 0.5) * (dx + 0.5) * 0.5;
  let wx1 = 0.75 - dx * dx;
  let wx2 = (dx - 0.5) * (dx - 0.5) * 0.5;
  let wy0 = (dy + 0.5) * (dy + 0.5) * 0.5;
  let wy1 = 0.75 - dy * dy;
  let wy2 = (dy - 0.5) * (dy - 0.5) * 0.5;

  let af = affine[i];
  let g00 = af.x;
  let g01 = af.y;
  let g10 = af.z;
  let g11 = af.w;
  let cvx = pvx + g00 * dx + g01 * dy;
  let cvy = pvy + g10 * dx + g11 * dy;
  let aer = aux[i].y;
  let oilWeight = select(0.0, 1.0, (fl & 3u) == 1u);

  // Base cell for the dense grid; the 1-cell margin keeps the whole
  // 3x3 in range so no clamp is needed.
  let bx = gx - ox;
  let by = gy - oy;
  // v15.0 — stray guard. A particle whose UNCLAMPED base sits outside the
  // padded grid (CPU-mirror-lag drift beyond the 16-cell GRID_MARGIN) used
  // to scatter through wrapped row indices into unrelated cells; the dense
  // chain wiped that garbage on the next sub-step's full clear, but the
  // sparse chain must never write outside its marked blocks. The stray's
  // splat was meaningless either way — skip it. countCells still bins it
  // (clamped flatCell) and G2P/collide keep advancing it back into range.
  if (bx < 1 || by < 1 || bx >= i32(gp.gridW) - 1 || by >= i32(gp.gridH) - 1) { return; }
  let row0 = u32((by - 1) * i32(gp.gridW) + bx);
  let row1 = u32( by      * i32(gp.gridW) + bx);
  let row2 = u32((by + 1) * i32(gp.gridW) + bx);

  // --- top row (gy - 1) ---
  splat(row0 - 1u, wx0 * wy0, oilWeight, aer, cvx - g00 - g01, cvy - g10 - g11);
  splat(row0,      wx1 * wy0, oilWeight, aer, cvx - g01,       cvy - g11);
  splat(row0 + 1u, wx2 * wy0, oilWeight, aer, cvx + g00 - g01, cvy + g10 - g11);
  // --- middle row (gy) ---
  splat(row1 - 1u, wx0 * wy1, oilWeight, aer, cvx - g00,       cvy - g10);
  splat(row1,      wx1 * wy1, oilWeight, aer, cvx,             cvy);
  splat(row1 + 1u, wx2 * wy1, oilWeight, aer, cvx + g00,       cvy + g10);
  // --- bottom row (gy + 1) ---
  splat(row2 - 1u, wx0 * wy2, oilWeight, aer, cvx - g00 + g01, cvy - g10 + g11);
  splat(row2,      wx1 * wy2, oilWeight, aer, cvx + g01,       cvy + g11);
  splat(row2 + 1u, wx2 * wy2, oilWeight, aer, cvx + g00 + g01, cvy + g10 + g11);
}
`;

  /* ---- v15.0 — dense/sparse cell-kernel entry templating --------------
   * Every per-cell kernel body below is written once, starting from `c` =
   * the flat dense cell index, and assembled behind one of two entries:
   *   dense  — one thread per cell of the whole bbox grid (gid.x), the
   *            pre-v15 dispatch, kept as the A/B fallback path.
   *   sparse — one 256-lane workgroup per ACTIVE block from blockList
   *            (dispatched indirectly off blockMeta); lane i maps to cell
   *            (i%16, i/16) of the block. gridW is a multiple of 16, so
   *            bw = gridW >> 4 and every mapped c is a valid dense index.
   * The `if (c >= gp.cells) return` guard inside each body stays for both
   * (a no-op under sparse; belt and braces).
   * -------------------------------------------------------------------- */
  function cellEntryDense(body) {
    return '\n@compute @workgroup_size(256)\n' +
      'fn main(@builtin(global_invocation_id) gid : vec3<u32>) {\n' +
      '  let c = gid.x;\n' + body + '}\n';
  }
  function cellEntrySparse(body) {
    return '\n@compute @workgroup_size(256)\n' +
      'fn main(@builtin(local_invocation_id) lid : vec3<u32>,\n' +
      '        @builtin(workgroup_id)        wid : vec3<u32>) {\n' +
      '  let blk = blockList[wid.x];\n' +
      '  let bw  = gp.gridW >> 4u;\n' +
      '  let c = ((blk / bw) * 16u + (lid.x >> 4u)) * gp.gridW\n' +
      '        +  (blk % bw) * 16u + (lid.x & 15u);\n' + body + '}\n';
  }
  // Per-layout read-only blockList declaration for the sparse variants
  // (the grid layout declares its own read_write copy in the common
  // header; binding numbers differ per layout, same pattern as simBind).
  function sparseListBind(binding) {
    return '\n@group(0) @binding(' + binding +
      ') var<storage, read> blockList : array<u32>;\n';
  }

  /* 3. p2gNormalize — per-cell mass-normalize of aeration. Ports the
   *    CPU tail loop `if (mass > 0) cellAeration /= cellMass`. Mass and
   *    aeration are both fixed-point i32; decode both, divide in float,
   *    re-encode aeration in place. cellMass / momentum are left as-is
   *    (the downstream grid-update kernel consumes the raw fixed point). */
  var WGSL_P2G_NORMALIZE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  let mass = f32(atomicLoad(&cellMass[c])) / FIXED_SCALE;
  if (mass > 0.0) {
    let aer = f32(atomicLoad(&cellAeration[c])) / FIXED_SCALE;
    atomicStore(&cellAeration[c], encodeFx(aer / mass));
  }
`;
  var WGSL_P2G_NORMALIZE = cellEntryDense(WGSL_P2G_NORMALIZE_BODY);

  // v15.0 — end-of-sub-step clear, p2g-layout share: re-zero the active
  // blocks' five fixed-point accumulators (the grid share clears
  // cellCount, the grid2 share clears the DV impulses + resolved
  // velocity). Together they restore the global-zero invariant, which is
  // what lets the sparse chain skip the per-sub-step full-grid clears
  // (WGSL_P2G_CLEAR / clearDV / clearCells) entirely.
  var WGSL_CLEAR_P2G_SPARSE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  atomicStore(&cellMass[c], 0);
  atomicStore(&cellOilMass[c], 0);
  atomicStore(&cellAeration[c], 0);
  atomicStore(&cellVX[c], 0);
  atomicStore(&cellVY[c], 0);
`;

  /* ---- WGSL — pressure + grid-update kernels (Stage 4) ---------------
   * The Stage-4 kernels need more cell buffers than a single bind group
   * can comfortably hold (the WebGPU minimum is 8 storage buffers per
   * stage), so they split across TWO bind-group layouts — pressure and
   * grid-update — each within the 8-buffer floor.
   *
   * Shared preamble (WGSL_GRID2_PRELUDE): the P2GParams uniform struct,
   * the FIXED_SCALE / fluid-feel constants, and encodeFx. Each layout's
   * header then declares only the buffers that layout binds.
   *
   * PRESSURE layout (clearDV + gridPressure) — 6 storage buffers:
   *   0  uniform  P2GParams
   *   1  pos          read  — particle x,y,vx,vy
   *   2  aux          rw    — density (.x) + aeration (.y) per particle
   *   3  flag         read  — type/origin/sleeping/frozen bitpack
   *   4  cellMass     rw    — fixed-point mass (read; atomic for layout)
   *   5  cellAeration rw    — fixed-point mass-normalized aeration (read)
   *   6  cellDVX      rw    — fixed-point pressure impulse, x
   *   7  cellDVY      rw    — fixed-point pressure impulse, y
   *
   * GRID-UPDATE layout (gridUpdate) — 8 storage buffers:
   *   0  uniform  P2GParams
   *   1  cellMass     rw    — fixed-point mass (read)
   *   2  cellOilMass  rw    — fixed-point oil mass (read)
   *   3  cellVX       rw    — fixed-point Stage-3 momentum, x (read)
   *   4  cellVY       rw    — fixed-point Stage-3 momentum, y (read)
   *   5  cellDVX      rw    — fixed-point pressure impulse, x (read)
   *   6  cellDVY      rw    — fixed-point pressure impulse, y (read)
   *   7  cellVelX     rw    — plain f32 resolved velocity, x (write)
   *   8  cellVelY     rw    — plain f32 resolved velocity, y (write)
   *
   * cellMass / cellAeration / cellVX / cellVY are only ever READ by the
   * Stage-4 kernels but are declared atomic<i32> because the same
   * physical buffers are the Stage-3 atomic accumulators — WGSL requires
   * the declared type to match across pipelines sharing a buffer.
   * -------------------------------------------------------------------- */
  var WGSL_GRID2_PRELUDE = /* wgsl */ `
struct P2GParams {
  count     : u32,
  gridW     : u32,
  gridH     : u32,
  originX   : u32,   // i32 bit pattern
  originY   : u32,   // i32 bit pattern
  cells     : u32,
  stepDt    : f32,
  invCell   : f32,
  worldCols : f32,
  worldTile : f32,   // v15.1 — the wake occlusion march needs the tile
  worldRows : f32,   //         pitch + the terrain rect (lanes 12-15)
  _pad0     : f32,
  tileOrigC : u32,   // i32 bit pattern
  tileOrigR : u32,   // i32 bit pattern
  tileW     : u32,
  tileH     : u32,
};
@group(0) @binding(0) var<uniform> gp : P2GParams;

const FIXED_SCALE : f32 = ${FIXED_SCALE};

// Rest density — derived (1/PDELTA^2), structural; stays a baked const.
const LIQUID_DENSITY : f32 = ${LIQUID_DENSITY};
// v14.26 — the fluid-feel physics constants (gravity, pressure stiffness,
// aeration blur/damp) now flow live through the SimParams uniform sp
// instead of being baked here. The binding is injected per-pipeline.

fn encodeFx(v : f32) -> i32 {
  return i32(round(v * FIXED_SCALE));
}
`;

  // Pressure-layout buffer header — bindings 1..7.
  var WGSL_PRESSURE_BUFS = /* wgsl */ `
@group(0) @binding(1) var<storage, read>       pos          : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> aux          : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       flag         : array<u32>;
@group(0) @binding(4) var<storage, read_write> cellMass     : array<atomic<i32>>;
@group(0) @binding(5) var<storage, read_write> cellAeration : array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> cellDVX      : array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> cellDVY      : array<atomic<i32>>;
@group(0) @binding(9) var<storage, read_write> cellHeat     : array<atomic<i32>>;
`;

  // Grid-update-layout buffer header — bindings 1..8.
  var WGSL_GRIDUPDATE_BUFS = /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> cellMass    : array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> cellOilMass : array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> cellVX      : array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> cellVY      : array<atomic<i32>>;
@group(0) @binding(5) var<storage, read_write> cellDVX     : array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> cellDVY     : array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> cellVelX    : array<f32>;
@group(0) @binding(8) var<storage, read_write> cellVelY    : array<f32>;
`;

  /* ---- Stage 8 — game-coupled-force uniform --------------------------
   * GameParams carries the live game state the grid-update wake kernels +
   * the collide miner test read each frame: the player pose, the rocket-
   * plume state + nozzle positions, and the active explosion list. It is a
   * SECOND uniform (uniforms have their own, higher per-stage limit — the
   * 8-storage-buffer floor is untouched): binding 9 on the grid-update
   * layout, binding 5 on the collide layout.
   *
   * vec4-packed for std140 alignment:
   *   player  : (active, worldX, worldY, dir)        — dir is +1 / -1
   *   rocket  : (active, intensity, exhaustDirX, exhaustDirY)
   *   counts  : (nozzleCount, explosionCount, playerVx, playerVy)
   *             playerVx/Vy drive the silhouette coupling (v24.125):
   *             speed-gated plow eject + static rigid-boundary pin
   *   nozzles : 4 x (worldX, worldY, _, _)            — GS_MAX_NOZZLES
   *   explos  : 8 x (worldCx, worldCy, radius, blastScale)
   *             blastScale is CPU-precomputed (large ? 1050 : 660); only
   *             explosions with the CPU t-gate already passed are uploaded,
   *             so the kernel needs no timer lane.
   * 15 vec4 = 240 bytes. Built by writeGameParams() each frame; the CPU
   * fill is the one place the game state crosses into the GPU sim.
   * -------------------------------------------------------------------- */
  var WGSL_GAME_PARAMS = /* wgsl */ `
struct GameParams {
  player  : vec4<f32>,
  rocket  : vec4<f32>,
  counts  : vec4<f32>,
  nozzles : array<vec4<f32>, ${GS_MAX_NOZZLES}>,
  explos  : array<vec4<f32>, ${GS_MAX_EXPLOSIONS}>,
  // v26.05 — bath-guest EXACT moving boundaries. Meta, 2 vec4 per guest:
  // (cx, cy, halfW, halfH) bbox reject + (active, ringN, _, _). Zeroed
  // outside the scene, so every guest path below no-ops in the world.
  guests   : array<vec4<f32>, ${GS_MAX_GUESTS * 2}>,
  // The deforming silhouette: up to ${GS_RING} ring vertices per guest,
  // (x, y, vx, vy) each — position AND local Verlet velocity, so the
  // fluid feels the true shape and the true motion of every face.
  guestPts : array<vec4<f32>, ${GS_MAX_GUESTS * GS_RING}>,
};

// v26.05 — a cell inside a guest is pinned to the LOCAL surface velocity
// of the nearest ring edge plus a depth-scaled outward decompression, so
// water cannot take residence inside the body and the meniscus hugs the
// exact silhouette (the v26.04 box eject evacuated water past the visible
// edge: black voids).
const GUEST_PUSH : f32 = 26.0;   // px/s of outward push per px of depth

// Miner silhouette rects (player-local px) — mirror the CPU literals.
const MINER_HULL_L  : f32 = ${LIQUID_MINER_HULL_L};
const MINER_HULL_T  : f32 = ${LIQUID_MINER_HULL_T};
const MINER_HULL_R  : f32 = ${LIQUID_MINER_HULL_R};
const MINER_HULL_B  : f32 = ${LIQUID_MINER_HULL_B};
const MINER_TRACK_L : f32 = ${LIQUID_MINER_TRACK_L};
const MINER_TRACK_T : f32 = ${LIQUID_MINER_TRACK_T};
const MINER_TRACK_R : f32 = ${LIQUID_MINER_TRACK_R};
const MINER_TRACK_B : f32 = ${LIQUID_MINER_TRACK_B};
const PLAYER_EJECT  : f32 = ${LIQUID_PLAYER_EJECT};
const PLAYER_W      : f32 = ${LIQUID_PLAYER_W};
const PLAYER_H      : f32 = ${LIQUID_PLAYER_H};
// Cell pitch (world px / cell) — the wake needs it to place cell centres.
// WGSL_GRID2_PRELUDE does not define it (only the G2P prelude does), so
// the game-coupled block carries its own copy.
const CELL : f32 = ${LIQUID_CELL_DEFAULT};
`;

  /* Shared guest geometry for the grid wake and particle collision. The
   * previous kernels each walked guests inline and therefore let array order
   * become physics when rings touched. These helpers make containment and
   * candidate tie-breaking identical in both stages. */
  var WGSL_GUEST_GEOMETRY = /* wgsl */ `
fn guestContainsPoint(gi : i32, px : f32, py : f32) -> bool {
  let gA = gameP.guests[gi * 2];
  let gB = gameP.guests[gi * 2 + 1];
  if (gB.x < 0.5) { return false; }
  if (abs(px - gA.x) > gA.z + 4.0 || abs(py - gA.y) > gA.w + 4.0) {
    return false;
  }
  let gn = i32(gB.y);
  let gBase = gi * ${GS_RING};
  var inside = false;
  var gj = gn - 1;
  for (var gk : i32 = 0; gk < gn; gk = gk + 1) {
    let pa = gameP.guestPts[gBase + gk];
    let pb = gameP.guestPts[gBase + gj];
    if (((pa.y > py) != (pb.y > py)) &&
        (px < (pb.x - pa.x) * (py - pa.y) / (pb.y - pa.y) + pa.x)) {
      inside = !inside;
    }
    gj = gk;
  }
  return inside;
}

fn guestAnyContainsPoint(px : f32, py : f32) -> bool {
  for (var gi : i32 = 0; gi < ${GS_MAX_GUESTS}; gi = gi + 1) {
    if (guestContainsPoint(gi, px, py)) { return true; }
  }
  return false;
}

// A geometry-first lexicographic tie-break makes an exact or symmetric
// overlap choose the same exterior face under every guest-slot permutation.
fn guestCandidateWins(d2 : f32, qx : f32, qy : f32,
                      fvx : f32, fvy : f32,
                      bestD2 : f32, bestQX : f32, bestQY : f32,
                      bestFVX : f32, bestFVY : f32) -> bool {
  let eps = 0.0001;
  if (d2 < bestD2 - eps) { return true; }
  if (abs(d2 - bestD2) > eps) { return false; }
  if (qx < bestQX - eps) { return true; }
  if (abs(qx - bestQX) > eps) { return false; }
  if (qy < bestQY - eps) { return true; }
  if (abs(qy - bestQY) > eps) { return false; }
  if (fvx < bestFVX - eps) { return true; }
  if (abs(fvx - bestFVX) > eps) { return false; }
  return fvy < bestFVY - eps;
}
`;

  // CPU reference for the overlap invariant. This is intentionally small and
  // independent of the live arrays: three intersecting 20-gons are projected
  // under every slot permutation. It catches a return to sequential/last-slot
  // semantics before the GPU path is allowed to call itself healthy in logs.
  function runGuestUnionOrderRegression() {
    function contains(g, x, y) {
      var inside = false;
      var j = g.length - 1;
      for (var i = 0; i < g.length; i++) {
        var a = g[i], b = g[j];
        if (((a[1] > y) !== (b[1] > y)) &&
            x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) {
          inside = !inside;
        }
        j = i;
      }
      return inside;
    }
    function anyContains(gs, x, y) {
      for (var i = 0; i < gs.length; i++) if (contains(gs[i], x, y)) return true;
      return false;
    }
    function wins(c, b) {
      if (!b) return true;
      var eps = 0.0001;
      var keys = ['d2', 'qx', 'qy', 'vx', 'vy'];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (c[k] < b[k] - eps) return true;
        if (Math.abs(c[k] - b[k]) > eps) return false;
      }
      return false;
    }
    function project(gs, x, y) {
      var best = null;
      for (var gi = 0; gi < gs.length; gi++) {
        var g = gs[gi];
        if (!contains(g, x, y)) continue;
        var j = g.length - 1;
        for (var i = 0; i < g.length; i++) {
          var a = g[i], b = g[j];
          j = i;
          var ex = b[0] - a[0], ey = b[1] - a[1];
          var el2 = Math.max(ex * ex + ey * ey, 1e-6);
          var et = Math.max(0, Math.min(1,
            ((x - a[0]) * ex + (y - a[1]) * ey) / el2));
          var qx = a[0] + ex * et, qy = a[1] + ey * et;
          var dx = qx - x, dy = qy - y, d2 = dx * dx + dy * dy;
          if (d2 < 1e-6) continue;
          var dl = Math.sqrt(d2);
          var tx = qx + dx / dl * 0.5, ty = qy + dy / dl * 0.5;
          if (anyContains(gs, tx, ty)) continue;
          var c = {
            d2: d2, qx: qx, qy: qy,
            vx: a[2] + (b[2] - a[2]) * et,
            vy: a[3] + (b[3] - a[3]) * et,
            tx: tx, ty: ty
          };
          if (wins(c, best)) best = c;
        }
      }
      return best;
    }
    function ring(cx, cy, r, vx, vy) {
      var out = [];
      for (var i = 0; i < GS_RING; i++) {
        var a = Math.PI * 2 * i / GS_RING;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, vx, vy]);
      }
      return out;
    }
    var base = [ring(-10, 0, 22, -4, 1), ring(10, 0, 22, 3, -2),
                ring(0, 12, 22, 1, 2)];
    var orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2],
                  [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    var ref = null;
    for (var p = 0; p < orders.length; p++) {
      var gs = [base[orders[p][0]], base[orders[p][1]], base[orders[p][2]]];
      var got = project(gs, 0, 0);
      if (!got || anyContains(gs, got.tx, got.ty)) return false;
      if (!ref) ref = got;
      else if (Math.abs(got.tx - ref.tx) > 1e-6 ||
               Math.abs(got.ty - ref.ty) > 1e-6 ||
               Math.abs(got.vx - ref.vx) > 1e-6 ||
               Math.abs(got.vy - ref.vy) > 1e-6) return false;
    }
    return true;
  }

  /* ---- v14.26 — live-tunable sim physics uniform ---------------------
   * The fluid-feel physics constants used to be string-baked into the
   * compute kernels as WGSL `const`s (interpolated at module load), so a
   * physics edit needed a pipeline rebuild. v14.26 routes the 25 baked
   * physics constants through ONE shared "sim tunables" uniform buffer
   * (the same trick v14.25 used for the render colours): every compute
   * kernel that read a baked feel const now reads `sp.<field>`, and
   * writeSimParams() refills the buffer CPU-side each step from the
   * module's LIQUID_* vars — a uniform write is instant, no recompile.
   *
   * The boot self-tests still pass byte-identically: the uniform is
   * filled from the exact same LIQUID_* numbers the WGSL `${...}` literals
   * used, so the GPU sees the same values it always did.
   *
   * Derived / structural constants (LIQUID_DENSITY, LIQUID_INV_DENSITY,
   * FIXED_SCALE, CELL, LIQUID_COLLIDE_RADIUS) stay baked `const`s — they
   * are not feel knobs (TUNING.md §2.1 marks them "don't set directly").
   *
   * vec4-packed for std140 alignment — 13 vec4 = 208 bytes (a multiple of
   * 16; each vec4 lands 16-byte aligned). Field map (mirrors the lane
   * order writeSimParams fills):
   *   grav    : (gravity, oilGravity, pressureStiff, oilPressureStiff)
   *   aer     : (aerBlur, aerDamp, oilAerBlur, oilAerDamp)
   *   bound   : (wallBounceIn, wallBounceEdge, floorFriction, wallFriction)
   *   oilBnd  : (oilWallBounceIn, oilWallBounceEdge, oilFloorFriction,
   *              oilWallFriction)
   *   g2pA    : (waterMotionScale, damping, oilDamping, aerThreshold)
   *   g2pB    : (oilAerThreshold, aerCoeff, oilAerCoeff, calm v24.145)
   *   coll    : (bounceWater, bounceOil, _pad, _pad)
   * The struct is shared; the `@binding` line is injected per-pipeline
   * (binding numbers differ per layout), exactly like GameParams.
   * -------------------------------------------------------------------- */
  var WGSL_SIM_PARAMS = /* wgsl */ `
struct SimParams {
  grav   : vec4<f32>,
  aer    : vec4<f32>,
  bound  : vec4<f32>,
  oilBnd : vec4<f32>,
  g2pA   : vec4<f32>,
  g2pB   : vec4<f32>,
  coll   : vec4<f32>,
  g2pC   : vec4<f32>,
  feel   : vec4<f32>,   // v25.41 — cohesion, airDrag, spare, spare
  bathA  : vec4<f32>,   // v25.56 bath: heatExchange, heatCool, heatBuoy, bathOn
  bathB  : vec4<f32>,   // v25.56 bath: heat-source rect x0, y0, x1, y1 (world px)
  bathC  : vec4<f32>,   // v25.56 bath: source target T, source rate, spare, spare
  quiet  : vec4<f32>,   // v26.53: low-energy visc, speed gate, shear gate, tail drag
};
`;
  // Per-pipeline SimParams binding line. The struct above is shared but
  // the binding index differs per bind-group layout, so the decl is
  // injected separately (same pattern as gameBindGrid for GameParams).
  function simBind(binding) {
    return '\n@group(0) @binding(' + binding +
      ') var<uniform> sp : SimParams;\n';
  }

  /* gridWake — the per-cell game-coupled velocity perturbation. Ports the
   * CPU liquidApplyPlayerGridWake + liquidApplyRocketGridWake +
   * liquidApplyExplosionGridWake, called by gridUpdate once a cell's
   * resolved velocity is known. The cell-centre world position is
   * (gx+0.5)*CELL — the CPU passes liquidCellGX/GY which equal the dense
   * cell's grid coords. All three only ADD to cellVelX/cellVelY, so the
   * Stage-4 velocity+gravity core is untouched.
   *
   * Faithful-port notes:
   *  - player wake: nearest-face eject out of the hull/track rect the cell
   *    centre sits in (mirrored when the rig faces left). Identical math to
   *    the CPU; no outside-silhouette drag ring (the CPU has none either).
   *  - rocket wake: per-nozzle cone push along the exhaust direction.
   *    v15.1 — the CPU's liquidLineClear terrain occlusion test is now
   *    ported too (wakeLineClear + the terrain mask at binding 12, with
   *    TERRAIN_HALO widened to cover the plume reach); jets no longer
   *    push water through solid ground into ponds below.
   *  - explosion wake: radial blast + slight downward bias. blastScale is
   *    CPU-precomputed; the CPU t-gate is applied CPU-side (only live
   *    explosions are uploaded).
   * gp is the P2GParams uniform, gameP the GameParams uniform; CELL is the
   * WGSL_GAME_PARAMS const (the grid2 prelude does not define it). */
  /* v15.1 — wake terrain occlusion. The CPU liquidApplyRocketGridWake runs
   * a liquidLineClear line-of-sight test per cell so the plume cannot push
   * water through solid ground; the Stage-8 GPU port omitted it (the
   * grid-update layout could not spare a storage buffer at the old 8-floor,
   * left as a TODO) — the owner-visible bug: jets energising water THROUGH
   * solid blocks into ponds below. The layout now binds the terrain mask at
   * binding 12 (the GPU path already requires 9+ storage buffers via P2G),
   * and TERRAIN_HALO grew to 6 tiles so the mask actually covers the walls
   * between a nozzle and any cell the plume can reach (out-of-rect samples
   * read non-solid). Same probe as the boundary/collide kernels; the march
   * mirrors the CPU literal (14 px steps, endpoints excluded).
   */
  var WGSL_WAKE_TERRAIN = /* wgsl */ `
@group(0) @binding(12) var<storage, read> terrainMask : array<u32>;

fn wakeSolidAt(px : f32, py : f32) -> bool {
  let oc   = bitcast<i32>(gp.tileOrigC);
  let orow = bitcast<i32>(gp.tileOrigR);
  let tc = i32(floor(px / gp.worldTile)) - oc;
  let tr = i32(floor(py / gp.worldTile)) - orow;
  if (tc < 0 || tr < 0 || tc >= i32(gp.tileW) || tr >= i32(gp.tileH)) {
    return false;
  }
  let idx  = u32(tr) * gp.tileW + u32(tc);
  let word = terrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

// CPU liquidLineClear: sample the open segment every ~14 px (endpoints
// excluded); any solid sample blocks the wake. Plume reach is <= 176 px,
// so this is at most ~12 samples for a cell already inside the cone.
fn wakeLineClear(x0 : f32, y0 : f32, x1 : f32, y1 : f32) -> bool {
  let dx = x1 - x0;
  let dy = y1 - y0;
  let dist = sqrt(dx * dx + dy * dy);
  let steps = max(1.0, ceil(dist / 14.0));
  var i : f32 = 1.0;
  loop {
    if (i >= steps) { break; }
    let t = i / steps;
    if (wakeSolidAt(x0 + dx * t, y0 + dy * t)) { return false; }
    i = i + 1.0;
  }
  return true;
}
`;

  var WGSL_GRID_WAKE = /* wgsl */ `
fn gridWake(c : u32, cgx : i32, cgy : i32) {
  let wx = (f32(cgx) + 0.5) * CELL;
  let wy = (f32(cgy) + 0.5) * CELL;
  let stepDt = gp.stepDt;

  // --- player wake — miner-silhouette coupling (v24.125) ---
  // counts.zw carry the rig velocity. Moving: nearest-face eject scaled by
  // speed (deadzone 8 px/s, full at 60 px/s) clears plowed water. Static:
  // in-silhouette cells PIN to the hull velocity — they hold splat mass
  // but contain no particles and sit outside the terrain boundary
  // handling, so under gravity they free-fall forever and G2P feeds that
  // back as a perpetual jet at the hull base (the resting-pond
  // firecracker pump). edit² sluice.js 070 liquidApplyPlayerGridWake.
  if (gameP.player.x > 0.5) {
    let px = gameP.player.y;
    let py = gameP.player.z;
    let dir = gameP.player.w;
    var lx = wx - px;
    let ly = wy - py;
    let mirrored = dir < 0.0;
    if (mirrored) { lx = PLAYER_W - lx; }
    let inHull  = lx >= MINER_HULL_L  && lx <= MINER_HULL_R
               && ly >= MINER_HULL_T  && ly <= MINER_HULL_B;
    let inTrack = lx >= MINER_TRACK_L && lx <= MINER_TRACK_R
               && ly >= MINER_TRACK_T && ly <= MINER_TRACK_B;
    if (inHull || inTrack) {
      let pvx = gameP.counts.z;
      let pvy = gameP.counts.w;
      let ejs = clamp((abs(pvx) + abs(pvy) - 8.0) / 52.0, 0.0, 1.0);
      if (ejs > 0.0) {
        var rL = MINER_TRACK_L; var rT = MINER_TRACK_T;
        var rR = MINER_TRACK_R; var rB = MINER_TRACK_B;
        if (inHull) {
          rL = MINER_HULL_L; rT = MINER_HULL_T;
          rR = MINER_HULL_R; rB = MINER_HULL_B;
        }
        let dL = lx - rL;
        let dR = rR - lx;
        let dT = ly - rT;
        let dB = rB - ly;
        var nx : f32 = -1.0; var ny : f32 = 0.0; var minD = dL;
        if (dR < minD) { minD = dR; nx =  1.0; ny =  0.0; }
        if (dT < minD) { minD = dT; nx =  0.0; ny = -1.0; }
        if (dB < minD) { minD = dB; nx =  0.0; ny =  1.0; }
        if (mirrored) { nx = -nx; }
        let eject = PLAYER_EJECT * ejs * stepDt / CELL;
        cellVelX[c] = cellVelX[c] + nx * eject;
        cellVelY[c] = cellVelY[c] + ny * eject;
      } else {
        // Static rig — rigid-boundary pin to EXACT zero (an idle rig can
        // carry a small residual contact vx/vy; pinning to it would
        // re-inject a few px/s forever). v25.14 — but NOT while the jets
        // fire: the pin is the resting-rig firecracker fix, and zeroing
        // in-silhouette cells every substep kept plume velocity from ever
        // accumulating under a slow-moving thrusting rig (weak-feeling
        // thrust over thin water). edit² sluice.js 070
        // liquidApplyPlayerGridWake.
        if (gameP.rocket.x < 0.5) {
          cellVelX[c] = 0.0;
          cellVelY[c] = 0.0;
        }
      }
    }
  }

  // --- guest wake (v26.14): touching rings form one solid union. ---
  // First find the nearest face of each ring that contains this cell. If
  // that face exits into another guest, search every edge of the containing
  // rings and choose the closest point on the UNION exterior. The old loop
  // assigned cell velocity once per guest, so the last slot won and changing
  // host order periodically inverted the constraint. This block writes one
  // order-independent boundary condition exactly once.
  var guestInsideCount : i32 = 0;
  var bestD2 : f32 = 1e9;
  var bestPX : f32 = wx; var bestPY : f32 = wy;
  var bestVX : f32 = 0.0; var bestVY : f32 = 0.0;
  var bestGI : i32 = -1;
  for (var gi : i32 = 0; gi < ${GS_MAX_GUESTS}; gi = gi + 1) {
    if (!guestContainsPoint(gi, wx, wy)) { continue; }
    guestInsideCount = guestInsideCount + 1;
    let gB = gameP.guests[gi * 2 + 1];
    let gn = i32(gB.y);
    let gBase = gi * ${GS_RING};
    var gj = gn - 1;
    var ringD2 : f32 = 1e9;
    var ringPX : f32 = wx; var ringPY : f32 = wy;
    var ringVX : f32 = 0.0; var ringVY : f32 = 0.0;
    for (var ge : i32 = 0; ge < gn; ge = ge + 1) {
      let pa = gameP.guestPts[gBase + ge];
      let pb = gameP.guestPts[gBase + gj];
      let ex = pb.x - pa.x;
      let ey = pb.y - pa.y;
      let el2 = max(ex * ex + ey * ey, 1e-6);
      let et = clamp(((wx - pa.x) * ex + (wy - pa.y) * ey) / el2, 0.0, 1.0);
      let qx = pa.x + ex * et;
      let qy = pa.y + ey * et;
      let fvx = pa.z + (pb.z - pa.z) * et;
      let fvy = pa.w + (pb.w - pa.w) * et;
      let dq2 = (wx - qx) * (wx - qx) + (wy - qy) * (wy - qy);
      if (guestCandidateWins(dq2, qx, qy, fvx, fvy,
                             ringD2, ringPX, ringPY, ringVX, ringVY)) {
        ringD2 = dq2;
        ringPX = qx; ringPY = qy;
        ringVX = fvx; ringVY = fvy;
      }
      gj = ge;
    }
    if (guestCandidateWins(ringD2, ringPX, ringPY, ringVX, ringVY,
                           bestD2, bestPX, bestPY, bestVX, bestVY)) {
      bestD2 = ringD2;
      bestPX = ringPX; bestPY = ringPY;
      bestVX = ringVX; bestVY = ringVY;
      bestGI = gi;
    }
  }

  var needGuestUnion = guestInsideCount > 1;
  if (bestGI >= 0 && bestD2 > 1e-6) {
    let preDep = sqrt(bestD2);
    let preNX = (bestPX - wx) / preDep;
    let preNY = (bestPY - wy) / preDep;
    if (guestAnyContainsPoint(bestPX + preNX * 0.5,
                              bestPY + preNY * 0.5)) {
      needGuestUnion = true;
    }
  }

  if (needGuestUnion) {
    var unionD2 : f32 = 1e9;
    var unionPX : f32 = wx; var unionPY : f32 = wy;
    var unionVX : f32 = 0.0; var unionVY : f32 = 0.0;
    var unionGI : i32 = -1;
    for (var ui : i32 = 0; ui < ${GS_MAX_GUESTS}; ui = ui + 1) {
      if (!guestContainsPoint(ui, wx, wy)) { continue; }
      let uB = gameP.guests[ui * 2 + 1];
      let un = i32(uB.y);
      let uBase = ui * ${GS_RING};
      var uj = un - 1;
      for (var ue : i32 = 0; ue < un; ue = ue + 1) {
        let pa = gameP.guestPts[uBase + ue];
        let pb = gameP.guestPts[uBase + uj];
        uj = ue;
        let ex = pb.x - pa.x;
        let ey = pb.y - pa.y;
        let el2 = max(ex * ex + ey * ey, 1e-6);
        let et = clamp(((wx - pa.x) * ex + (wy - pa.y) * ey) / el2, 0.0, 1.0);
        let qx = pa.x + ex * et;
        let qy = pa.y + ey * et;
        let ddx = qx - wx;
        let ddy = qy - wy;
        let dq2 = ddx * ddx + ddy * ddy;
        if (dq2 < 1e-6) { continue; }
        let dl = sqrt(dq2);
        let nx = ddx / dl;
        let ny = ddy / dl;
        // Reject a face hidden inside any other slime. Only an exterior
        // sample can define the union boundary.
        if (guestAnyContainsPoint(qx + nx * 0.5, qy + ny * 0.5)) { continue; }
        let fvx = pa.z + (pb.z - pa.z) * et;
        let fvy = pa.w + (pb.w - pa.w) * et;
        if (guestCandidateWins(dq2, qx, qy, fvx, fvy,
                               unionD2, unionPX, unionPY, unionVX, unionVY)) {
          unionD2 = dq2;
          unionPX = qx; unionPY = qy;
          unionVX = fvx; unionVY = fvy;
          unionGI = ui;
        }
      }
    }
    // A valid union exterior should always exist for a finite collection of
    // closed rings. Keep the deterministic nearest-ring fallback if corrupt
    // geometry defeats the search so the cell still receives a safe bound.
    if (unionGI >= 0) {
      bestD2 = unionD2;
      bestPX = unionPX; bestPY = unionPY;
      bestVX = unionVX; bestVY = unionVY;
      bestGI = unionGI;
    }
  }

  if (bestGI >= 0) {
    let gA = gameP.guests[bestGI * 2];
    let gB = gameP.guests[bestGI * 2 + 1];
    let gdep = sqrt(bestD2);
    var gox : f32 = 0.0; var goy : f32 = -1.0;
    if (gdep > 0.001) {
      gox = (bestPX - wx) / gdep;
      goy = (bestPY - wy) / gdep;
    }
    // Motion-aware eviction survives as a direction correction only. While
    // a guest moves fast, a trailing/crown exit becomes lateral so the
    // decompression term cannot lift water over a plunging body.
    let gmvx = gB.z;
    let gmvy = gB.w;
    let gspd = sqrt(gmvx * gmvx + gmvy * gmvy);
    if (gspd > 120.0) {
      let mvnx = gmvx / gspd;
      let mvny = gmvy / gspd;
      var latx = -mvny;
      var laty = mvnx;
      let sideD = (wx - gA.x) * latx + (wy - gA.y) * laty;
      if (sideD < 0.0) { latx = -latx; laty = -laty; }
      if (gox * mvnx + goy * mvny < -0.35) {
        gox = latx;
        goy = laty;
      }
    }
    // Cell velocity is displacement in grid cells per fixed substep; face
    // velocity and decompression are world px/s.
    let guestToGrid = stepDt / CELL;
    cellVelX[c] = (bestVX + gox * min(gdep, 10.0) * GUEST_PUSH) * guestToGrid;
    cellVelY[c] = (bestVY + goy * min(gdep, 10.0) * GUEST_PUSH) * guestToGrid;
  }

  // --- rocket-plume wake — per-nozzle cone push along the exhaust dir ---
  if (gameP.rocket.x > 0.5) {
    let intensity = gameP.rocket.y;
    let edx = gameP.rocket.z;
    let edy = gameP.rocket.w;
    let nCount = i32(gameP.counts.x);
    var wakeVX : f32 = 0.0;
    var wakeVY : f32 = 0.0;
    for (var n : i32 = 0; n < nCount; n = n + 1) {
      let nz = gameP.nozzles[n];
      let dx = wx - nz.x;
      let dy = wy - nz.y;
      let along = dx * edx + dy * edy;
      if (along < -4.0 || along > 176.0) { continue; }   // TILE*5.5
      let alongPos = max(0.0, along);
      let perp = abs(dx * -edy + dy * edx);
      let cone = 13.0 + alongPos * 0.22;
      if (perp > cone) { continue; }
      // v15.1 — terrain occlusion (CPU liquidLineClear parity): a solid
      // tile between the nozzle and this cell blocks the plume, so jets
      // no longer push water through the ground into ponds below.
      if (!wakeLineClear(nz.x, nz.y, wx, wy)) { continue; }
      var mouthBoost : f32 = 1.0;
      if (alongPos < 18.0) { mouthBoost = 1.35; }
      let falloff = (1.0 - alongPos / 176.0) * (1.0 - perp / cone) * mouthBoost;
      let force = 560.0 * intensity * falloff * stepDt / CELL;
      wakeVX = wakeVX + edx * force;
      wakeVY = wakeVY + edy * force;
    }
    cellVelX[c] = cellVelX[c] + wakeVX;
    cellVelY[c] = cellVelY[c] + wakeVY;
  }

  // --- explosion wake — radial blast + slight downward bias ---
  let eCount = i32(gameP.counts.y);
  for (var e : i32 = 0; e < eCount; e = e + 1) {
    let ex = gameP.explos[e];
    let dx = wx - ex.x;
    let dy = wy - ex.y;
    let d2 = dx * dx + dy * dy;
    let r = ex.z * 1.15;
    if (d2 > r * r || d2 <= 0.0001) { continue; }
    let d = sqrt(d2);
    let k = 1.0 - d / r;
    let blast = ex.w * k * stepDt / CELL;
    cellVelX[c] = cellVelX[c] + dx / d * blast;
    cellVelY[c] = cellVelY[c] + dy / d * blast - 90.0 * k * stepDt / CELL;
  }
}
`;

  /* 1. clearDV — zero the cellDVX/cellDVY pressure-impulse accumulators
   *    over the active grid before the pressure scatter. One thread per
   *    cell. (cellVX/cellVY momentum stays — it carries the P2G result.)
   *    Runs on the pressure layout. */
  var WGSL_DV_CLEAR = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.cells) { return; }
  atomicStore(&cellDVX[i], 0);
  atomicStore(&cellDVY[i], 0);
  atomicStore(&cellHeat[i], 0);
}
`;

  // v25.56 BATH B1 (pressure layout). heatNormalize: mass-normalize the
  // heat field right after gridPressure splats it (the aeration pattern);
  // no-op unless bath is on. The sparse clear body re-zeroes cellHeat at
  // the same points the other bind-group shares clear theirs (clearPrev +
  // runSparseEndClear); the dense chain clears it in clearDV above.
  var WGSL_HEAT_NORMALIZE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  if (sp.bathA.w < 0.5) { return; }
  let m = f32(atomicLoad(&cellMass[c])) / FIXED_SCALE;
  if (m > 0.0) {
    let h = f32(atomicLoad(&cellHeat[c])) / FIXED_SCALE;
    atomicStore(&cellHeat[c], encodeFx(h / m));
  }
`;
  var WGSL_HEAT_CLEAR_SPARSE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  atomicStore(&cellHeat[c], 0);
`;

  /* 2. gridPressure — one thread per particle. A faithful port of the CPU
   *    liquidApplyGridPressure:
   *      - awake-only: frozen OR sleeping particles are skipped (the CPU
   *        `if (liquidFrozen[i] || liquidSleeping[i]) continue`).
   *      - re-derive the 3x3 quadratic-B-spline stencil exactly as P2G
   *        does (recompute lx/ly, base cell, dx/dy, the 6 weights) —
   *        the CPU reuses P2G's cached liquidDX/W/Nbrs, but the particle
   *        has not moved between P2G and pressure so a recompute is
   *        bit-identical.
   *      - gather: density += w*cellMass, aeration += w*cellAeration over
   *        the 9 stencil cells (cellMass / cellAeration decoded from
   *        fixed point).
   *      - store density into aux.x; advance aux.y (aeration) with the
   *        damp/blur lerp — oil and water use separate constants.
   *      - weakly-compressible pressure: p = (density/DENSITY - 1)*stiff,
   *        clamped >= 0; coeff = (1/density)*4*(-pressure); the per-axis
   *        impulse is coeff*dx, coeff*dy.
   *      - scatter: cellDVX -= w*coeffx-term, cellDVY -= w*coeffy-term,
   *        the corner terms expanding the CPU's cxm/cxp/cym/cyp folds.
   *        Each contribution is quantized + atomicAdd'd into the fixed-
   *        point impulse accumulators.
   *    The 1-cell grid margin keeps the whole 3x3 in [0, cells) so the
   *    dense cell index needs no clamp. */
  var WGSL_GRID_PRESSURE = /* wgsl */ `
// Scatter one stencil-corner pressure impulse into the fixed-point
// accumulators: cellDVX -= w*ix, cellDVY -= w*iy.
fn scatterDV(cell : u32, w : f32, ix : f32, iy : f32) {
  atomicAdd(&cellDVX[cell], encodeFx(-(w * ix)));
  atomicAdd(&cellDVY[cell], encodeFx(-(w * iy)));
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  let fl = flag[i];
  // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5] rest[8:23].
  let sleeping = (fl >> 4u) & 1u;
  let frozen   = (fl >> 5u) & 1u;
  if (frozen != 0u || sleeping != 0u) { return; }

  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);

  let pp = pos[i];
  let lx = pp.x * gp.invCell;
  let ly = pp.y * gp.invCell;
  let gx = i32(floor(lx));
  let gy = i32(floor(ly));
  let dx = f32(gx) + 0.5 - lx;
  let dy = f32(gy) + 0.5 - ly;

  let wx0 = (dx + 0.5) * (dx + 0.5) * 0.5;
  let wx1 = 0.75 - dx * dx;
  let wx2 = (dx - 0.5) * (dx - 0.5) * 0.5;
  let wy0 = (dy + 0.5) * (dy + 0.5) * 0.5;
  let wy1 = 0.75 - dy * dy;
  let wy2 = (dy - 0.5) * (dy - 0.5) * 0.5;

  // Dense base cell; the 1-cell margin keeps the full 3x3 in range.
  let bx = gx - ox;
  let by = gy - oy;
  // v15.0 — stray guard (see the P2G scatter twin): never gather from or
  // scatter DV into wrapped cells for a particle outside the padded grid.
  if (bx < 1 || by < 1 || bx >= i32(gp.gridW) - 1 || by >= i32(gp.gridH) - 1) { return; }
  let row0 = (by - 1) * i32(gp.gridW) + bx;
  let row1 =  by      * i32(gp.gridW) + bx;
  let row2 = (by + 1) * i32(gp.gridW) + bx;
  // 9 stencil cells, row-major (matches the CPU liquidNbrs 0..8 order).
  var nbr : array<u32, 9>;
  nbr[0] = u32(row0 - 1); nbr[1] = u32(row0); nbr[2] = u32(row0 + 1);
  nbr[3] = u32(row1 - 1); nbr[4] = u32(row1); nbr[5] = u32(row1 + 1);
  nbr[6] = u32(row2 - 1); nbr[7] = u32(row2); nbr[8] = u32(row2 + 1);
  var wgt : array<f32, 9>;
  wgt[0] = wx0 * wy0; wgt[1] = wx1 * wy0; wgt[2] = wx2 * wy0;
  wgt[3] = wx0 * wy1; wgt[4] = wx1 * wy1; wgt[5] = wx2 * wy1;
  wgt[6] = wx0 * wy2; wgt[7] = wx1 * wy2; wgt[8] = wx2 * wy2;

  // Gather density + aeration from the 9 cells (decode from fixed point).
  var density  : f32 = 0.0;
  var aeration : f32 = 0.0;
  for (var s : u32 = 0u; s < 9u; s = s + 1u) {
    let c = nbr[s];
    let w = wgt[s];
    density  = density  + w * (f32(atomicLoad(&cellMass[c]))     / FIXED_SCALE);
    aeration = aeration + w * (f32(atomicLoad(&cellAeration[c])) / FIXED_SCALE);
  }

  let oil = (fl & 3u) == 1u;
  // v14.26 — feel consts from the SimParams uniform (sp.aer / sp.grav).
  let aerDamp = select(sp.aer.y, sp.aer.w, oil);
  let aerBlur = select(sp.aer.x, sp.aer.z, oil);
  let stiff   = select(sp.grav.z, sp.grav.w, oil);

  // v24.182 — clamp the density blow-up before it feeds aux.x + the pressure
  // (anti-runaway cap; LIQUID_DENS_CAP, edit2 sluice 010-constants).
  density = min(density, f32(${LIQUID_DENS_CAP}));
  // density -> aux.x; advance aeration -> aux.y (damp/blur lerp).
  let oldAer = aux[i].y;
  let newAer = aerDamp * (oldAer + (aeration - oldAer) * aerBlur);
  aux[i].x = density;
  aux[i].y = newAer;

  // Weakly-compressible pressure. v25.41 — DETACHMENT COHESION: the old
  // non-negative clamp made the EOS a one-way spring (push when
  // over-packed, never pull), so a thin pond's surface could only ever
  // SPIT particles — the shallow "popcorn". Water leaving the body
  // (dn < 0.7, ramping to full pull by 0.4) now feels a small negative
  // pressure that hauls it back = surface tension at the skin. CRITICAL:
  // the bulk fluctuation band (dn 0.7-1.0) keeps the EXACT old zero clamp
  // — measured: a flat -0.25·stiff floor there is a tensile instability
  // (attraction amplifies density noise; the test pond exploded to the
  // 600 px/s cap within seconds). Oil keeps the old clamp everywhere.
  // sp.feel.x = 0 restores the exact old behavior.
  var pressure = (density / LIQUID_DENSITY - 1.0) * stiff;
  if (pressure < 0.0) {
    let dnR = density / LIQUID_DENSITY;
    var ck = (0.7 - dnR) * ${1 / 0.3};
    ck = clamp(ck, 0.0, 1.0);
    let coh = select(sp.feel.x, 0.0, oil);
    pressure = (-(coh * stiff)) * ck;
  }
  if (density <= 0.0) { pressure = 0.0; }
  var volume : f32 = 0.0;
  if (density > 0.0) { volume = 1.0 / density; }
  let coeff  = volume * 4.0 * (-pressure);
  let coeffx = coeff * dx;
  let coeffy = coeff * dy;

  // Scatter the pressure impulse into the 9 stencil cells. The corner
  // impulse expands the CPU cxm/cxp/cym/cyp folds:
  //   col -1 -> coeffx - coeff,  col 0 -> coeffx,  col +1 -> coeffx + coeff
  //   row -1 -> coeffy - coeff,  row 0 -> coeffy,  row +1 -> coeffy + coeff
  if (coeff != 0.0) {
    let cxm = coeffx - coeff;
    let cxp = coeffx + coeff;
    let cym = coeffy - coeff;
    let cyp = coeffy + coeff;
    scatterDV(nbr[0], wgt[0], cxm,    cym);
    scatterDV(nbr[1], wgt[1], coeffx, cym);
    scatterDV(nbr[2], wgt[2], cxp,    cym);
    scatterDV(nbr[3], wgt[3], cxm,    coeffy);
    scatterDV(nbr[4], wgt[4], coeffx, coeffy);
    scatterDV(nbr[5], wgt[5], cxp,    coeffy);
    scatterDV(nbr[6], wgt[6], cxm,    cyp);
    scatterDV(nbr[7], wgt[7], coeffx, cyp);
    scatterDV(nbr[8], wgt[8], cxp,    cyp);
  }

  // v25.56 BATH B1: splat this particle's heat (flag bits 24:31, raw
  // 0..255) into the cell field; heatNormalize divides by mass next.
  // Zero heat adds nothing, so the non-bath path is byte-identical.
  if (sp.bathA.w > 0.5) {
    let tmpFx = f32((fl >> 24u) & 0xffu);
    if (tmpFx > 0.0) {
      for (var s : u32 = 0u; s < 9u; s = s + 1u) {
        atomicAdd(&cellHeat[nbr[s]], encodeFx(wgt[s] * tmpFx));
      }
    }
  }
}
`;

  /* 3. gridUpdate — one thread per cell. Ports the velocity+gravity core
   *    of the CPU liquidUpdateGrid. No atomics: each cell is written
   *    exactly once.
   *      - empty cell (mass <= 0): cellVelX/Y = 0.
   *      - else: invm = 1/mass; oilK = cellOilMass/mass; gravity lerps
   *        water<->oil by oilK. Resolved velocity is
   *          vx = (cellVX + cellDVX) * invm
   *          vy = (cellVY + cellDVY) * invm + grav
   *        where cellVX/VY is the Stage-3 momentum, cellDVX/DVY the
   *        Stage-4 pressure impulse, both decoded from fixed point, and
   *          grav = (LIQUID_GRAVITY + (OIL-WATER)*oilK) * stepDt^2 / cell.
   *    DEFERRED (NOT ported here — clear TODO markers):
   *      - the tile-boundary reflection + floor/wall friction block: it
   *        needs the terrain solidity mask. DONE (v14.3) — the separate
   *        gridBoundary kernel; see WGSL_GRID_BOUNDARY.
   *      - liquidApplyPlayerGridWake / RocketGridWake / ExplosionGridWake:
   *        they need live game state (player, rocket, explosions).
   *        // TODO Stage 8
   *    The Stage-4 kernel is the verifiable velocity+gravity core; the
   *    deferred pieces only ever ADD to the resolved velocity, so wiring
   *    them in later does not disturb this kernel's structure.
   *
   *    Stage 8 — the player/rocket/explosion wakes ARE now wired in:
   *    gridWake() (WGSL_GRID_WAKE, the GameParams uniform) runs after the
   *    resolved velocity is known, exactly where the CPU liquidUpdateGrid
   *    calls the three liquidApply*GridWake functions. Each cell's dense
   *    grid coords (the CPU's liquidCellGX/GY) are recovered from the flat
   *    cell index. v14.3 — the tile-boundary reflection + friction tail is
   *    now ported too, as the separate gridBoundary kernel. */
  // v15.0 — split into helpers + body so the dense and sparse pipelines
  // assemble the SAME physics text behind their two entries (see
  // cellEntryDense / cellEntrySparse); zero drift between the paths.
  var WGSL_GRID_UPDATE_HELPERS = /* wgsl */ `
// v24.115 — raw resolved velocity of a cell, recomputed from the P2G /
// pressure accumulators (NOT from cellVelX/Y, so the viscosity gather
// below is race-free: every thread reads only kernel INPUTS). Returns
// (vx, vy, 1) for a massy cell, (0, 0, 0) for an empty one.
fn rawCellVel(n : u32) -> vec3<f32> {
  let nm = f32(atomicLoad(&cellMass[n])) / FIXED_SCALE;
  if (nm <= 0.0) { return vec3<f32>(0.0, 0.0, 0.0); }
  let ninv  = 1.0 / nm;
  let nOilK = (f32(atomicLoad(&cellOilMass[n])) / FIXED_SCALE) * ninv;
  let nGrav = (sp.grav.x + (sp.grav.y - sp.grav.x) * nOilK) *
              (gp.stepDt * gp.stepDt * gp.invCell);
  let nvx = (f32(atomicLoad(&cellVX[n])) / FIXED_SCALE +
             f32(atomicLoad(&cellDVX[n])) / FIXED_SCALE) * ninv;
  let nvy = (f32(atomicLoad(&cellVY[n])) / FIXED_SCALE +
             f32(atomicLoad(&cellDVY[n])) / FIXED_SCALE) * ninv + nGrav;
  return vec3<f32>(nvx, nvy, 1.0);
}
`;

  var WGSL_GRID_UPDATE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  let mass = f32(atomicLoad(&cellMass[c])) / FIXED_SCALE;
  if (mass > 0.0) {
    let invm    = 1.0 / mass;
    let oilMass = f32(atomicLoad(&cellOilMass[c])) / FIXED_SCALE;
    let oilK    = oilMass * invm;
    // Gravity lerps water<->oil by the cell's oil fraction. v14.26 — the
    // two gravities are live in the SimParams uniform (sp.grav.xy).
    let gravPx  = sp.grav.x + (sp.grav.y - sp.grav.x) * oilK;
    let gravScale = gp.stepDt * gp.stepDt * gp.invCell;
    let grav    = gravPx * gravScale;
    let momX = f32(atomicLoad(&cellVX[c]))  / FIXED_SCALE;
    let momY = f32(atomicLoad(&cellVY[c]))  / FIXED_SCALE;
    var dvX  = f32(atomicLoad(&cellDVX[c])) / FIXED_SCALE;
    var dvY  = f32(atomicLoad(&cellDVY[c])) / FIXED_SCALE;
    // v25.41 — SHOCK LIMITER (the popcorn quantum fix). The pressure
    // scatter is a per-substep impulse in per-step units, so ONE substep
    // can kick a cell 50-200 px/s off a single-frame density blip (grid
    // aliasing) — that spike IS the at-rest pop on shallow water. Cap the
    // per-substep velocity change a cell may receive from pressure
    // (sp.feel.z, px/s; 0 = off). Rest corrections (~2 px/s vs gravity)
    // never touch the cap; a sustained splash gradient re-earns it every
    // substep (feel.z x 120+/s of correction), so geysers survive — only
    // the one-substep spike dies. Unconditionally stabilizing: this only
    // ever REMOVES energy. edit2 the CPU fallback (070) + both fr() refs.
    let dvCap = sp.feel.z * gp.stepDt * gp.invCell * mass;
    if (sp.feel.z > 0.0) {
      let dvLen2 = dvX * dvX + dvY * dvY;
      if (dvLen2 > dvCap * dvCap) {
        let dvSc = dvCap / sqrt(dvLen2);
        dvX = dvX * dvSc;
        dvY = dvY * dvSc;
      }
    }
    var velX = (momX + dvX) * invm;
    var velY = (momY + dvY) * invm + grav;
    // v24.115 — grid viscosity (sp.coll.z): blend toward the massy
    // 4-neighbour average. v26.53 adds a separate quiet-shear contribution:
    // it exists only below smooth speed + neighbour-difference gates and in
    // water with at least two massy cardinal neighbours. Two is deliberate:
    // a one-cell-thick horizontal puddle has left/right support but failed the
    // old three-neighbour test. Wakes and terrain boundaries are applied after
    // this block, so a player/slime impact is not pre-damped.
    let visc = sp.coll.z;
    let quietVisc = sp.quiet.x;
    if (visc > 0.0 || quietVisc > 0.0) {
      let col = c % gp.gridW;
      var nSum = vec3<f32>(0.0, 0.0, 0.0);
      if (col > 0u)             { nSum = nSum + rawCellVel(c - 1u); }
      if (col + 1u < gp.gridW)  { nSum = nSum + rawCellVel(c + 1u); }
      if (c >= gp.gridW)        { nSum = nSum + rawCellVel(c - gp.gridW); }
      if (c + gp.gridW < gp.cells) { nSum = nSum + rawCellVel(c + gp.gridW); }
      if (nSum.z > 0.0) {
        let nAvgX = nSum.x / nSum.z;
        let nAvgY = nSum.y / nSum.z;
        var viscEff = clamp(visc, 0.0, 0.95);
        if (quietVisc > 0.0 && nSum.z >= 2.0) {
          // Grid velocity is cells moved this substep. Convert both the
          // absolute speed and neighbour delta back to world px/s so the
          // gates stay invariant under cell size and fixed-step tuning.
          let pxPerStep = 1.0 / max(gp.stepDt * gp.invCell, 0.000001);
          let speedPx = length(vec2<f32>(velX, velY)) * pxPerStep;
          let shearPx = length(vec2<f32>(nAvgX - velX, nAvgY - velY)) * pxPerStep;
          let speedQuiet = 1.0 - smoothstep(sp.quiet.y * 0.4, sp.quiet.y, speedPx);
          let shearQuiet = 1.0 - smoothstep(sp.quiet.z * 0.3, sp.quiet.z, shearPx);
          let quietK = clamp(quietVisc * speedQuiet * shearQuiet * (1.0 - oilK), 0.0, 0.95);
          // Compose rather than add so the combined coefficient cannot
          // overshoot when a developer also enables the legacy viscosity.
          viscEff = 1.0 - (1.0 - viscEff) * (1.0 - quietK);
        }
        velX = velX + (nAvgX - velX) * viscEff;
        velY = velY + (nAvgY - velY) * viscEff;
      }
    }
    cellVelX[c] = velX;
    cellVelY[c] = velY;
    // Stage 8 — game-coupled wakes (player eject / rocket plume /
    // explosion blast). The cell's dense grid coords are recovered from
    // the flat index: cgx = c % gridW + originX, cgy = c / gridW + originY.
    let ox  = bitcast<i32>(gp.originX);
    let oy  = bitcast<i32>(gp.originY);
    let cgx = i32(c % gp.gridW) + ox;
    let cgy = i32(c / gp.gridW) + oy;
    gridWake(c, cgx, cgy);
    // v14.3 — the tile-boundary reflection (bounceIn / bounceEdge) +
    // floor/wall friction tail of the CPU liquidUpdateGrid now runs as
    // the separate gridBoundary kernel, chained right after this one
    // (it needs the terrain mask; see WGSL_GRID_BOUNDARY).
  } else {
    cellVelX[c] = 0.0;
    cellVelY[c] = 0.0;
  }
`;
  var WGSL_GRID_UPDATE =
    WGSL_GRID_UPDATE_HELPERS + cellEntryDense(WGSL_GRID_UPDATE_BODY);

  // v15.0 — end-of-sub-step clear, grid2-layout share: zero the active
  // blocks' pressure impulses + resolved velocity (see the p2g share).
  var WGSL_CLEAR_GRID2_SPARSE_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  atomicStore(&cellDVX[c], 0);
  atomicStore(&cellDVY[c], 0);
  cellVelX[c] = 0.0;
  cellVelY[c] = 0.0;
`;

  /* ---- WGSL — grid boundary (Stage 4b, v14.3) ------------------------
   * gridBoundary ports the tail of the CPU liquidUpdateGrid: the tile-
   * boundary reflection + floor/wall friction applied to the resolved
   * cell velocity. The v14.0 port shipped gridUpdate without it (it was
   * left a TODO — it needs the terrain solidity mask, and the grid-update
   * bind group was already at the 8-storage-buffer floor). Its absence
   * let pressure scatter fire an undamped lateral jet along flat floors,
   * so settled water sheared into thin stratified "wine lines".
   *
   * Runs as the 4th grid2 kernel (clearDV -> pressure -> gridUpdate ->
   * gridBoundary), one thread per cell, on its own bind-group layout:
   * uniform + cellMass/cellOilMass (read — the empty-cell skip + the
   * oil/water lerp), cellVelX/cellVelY (read_write) and the terrain mask
   * (read). 5 storage buffers — within the 8-buffer floor.
   * -------------------------------------------------------------------- */
  // v15.0 — split into head (struct + bindings + terrain probes) and body
  // so the dense and sparse pipelines assemble the same physics text.
  var WGSL_GRID_BOUNDARY_HEAD = /* wgsl */ `
struct P2GParams {
  count     : u32,
  gridW     : u32,
  gridH     : u32,
  originX   : u32,
  originY   : u32,
  cells     : u32,
  stepDt    : f32,
  invCell   : f32,
  worldCols : f32,
  worldTile : f32,
  worldRows : f32,
  _pad0     : f32,
  tileOrigC : u32,
  tileOrigR : u32,
  tileW     : u32,
  tileH     : u32,
};
@group(0) @binding(0) var<uniform> gp : P2GParams;
@group(0) @binding(1) var<storage, read>       cellMass    : array<i32>;
@group(0) @binding(2) var<storage, read>       cellOilMass : array<i32>;
@group(0) @binding(3) var<storage, read_write> cellVelX    : array<f32>;
@group(0) @binding(4) var<storage, read_write> cellVelY    : array<f32>;
@group(0) @binding(5) var<storage, read>       terrainMask : array<u32>;

const FIXED_SCALE : f32 = ${FIXED_SCALE};
const CELL        : f32 = ${LIQUID_CELL_DEFAULT};
// v14.26 — the boundary tunables (wall bounce + floor/wall friction, water
// and oil) are now live in the SimParams uniform sp (sp.bound / sp.oilBnd)
// instead of being baked here. The struct + binding are appended per-pipeline.

// Sample the uploaded terrain bitmask at a world-px point — the same
// probe the collide kernel uses. A point outside the rect reads non-solid.
fn terrainSolidAt(px : f32, py : f32) -> bool {
  let oc   = bitcast<i32>(gp.tileOrigC);
  let orow = bitcast<i32>(gp.tileOrigR);
  let tc = i32(floor(px / gp.worldTile)) - oc;
  let tr = i32(floor(py / gp.worldTile)) - orow;
  if (tc < 0 || tr < 0 || tc >= i32(gp.tileW) || tr >= i32(gp.tileH)) {
    return false;
  }
  let idx  = u32(tr) * gp.tileW + u32(tc);
  let word = terrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

// Solidity of a grid cell — the CPU liquidGridWorldSolid: probe the tile
// at the cell centre, ((gx+0.5)*CELL, (gy+0.5)*CELL).
fn gridSolid(gx : i32, gy : i32) -> bool {
  return terrainSolidAt((f32(gx) + 0.5) * CELL, (f32(gy) + 0.5) * CELL);
}
`;

  var WGSL_GRID_BOUNDARY_BODY = /* wgsl */ `
  if (c >= gp.cells) { return; }
  // Empty cells: gridUpdate already zeroed their velocity, and the CPU
  // boundary block runs only inside its mass > 0 branch — skip them.
  let mass = f32(cellMass[c]) / FIXED_SCALE;
  if (mass <= 0.0) { return; }
  let oilMass = f32(cellOilMass[c]) / FIXED_SCALE;
  let oilK    = oilMass / mass;
  // Oil<->water lerp of the four boundary constants (CPU OIL_*_DLT folds).
  // v14.26 — water set in sp.bound.xyzw, oil set in sp.oilBnd.xyzw.
  let bounceIn   = sp.bound.x + (sp.oilBnd.x - sp.bound.x) * oilK;
  let bounceEdge = sp.bound.y + (sp.oilBnd.y - sp.bound.y) * oilK;
  let floorFric  = sp.bound.z + (sp.oilBnd.z - sp.bound.z) * oilK;
  let wallFric   = sp.bound.w + (sp.oilBnd.w - sp.bound.w) * oilK;

  // Cell grid coords — the same recovery gridUpdate uses for the wakes.
  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);
  let cgx = i32(c % gp.gridW) + ox;
  let cgy = i32(c / gp.gridW) + oy;

  var vx = cellVelX[c];
  var vy = cellVelY[c];
  if (gridSolid(cgx, cgy)) {
    // Cell centre is inside a solid tile — reflect both axes inward.
    vx = vx * (-bounceIn);
    vy = vy * (-bounceIn);
  } else {
    let leftSolid  = gridSolid(cgx - 1, cgy);
    let rightSolid = gridSolid(cgx + 1, cgy);
    let upSolid    = gridSolid(cgx, cgy - 1);
    let downSolid  = gridSolid(cgx, cgy + 1);
    let bEdge = -bounceEdge;
    // Reflect the velocity component heading into a solid neighbour.
    if (leftSolid  && vx < 0.0) { vx = vx * bEdge; }
    if (rightSolid && vx > 0.0) { vx = vx * bEdge; }
    if (upSolid    && vy < 0.0) { vy = vy * bEdge; }
    if (downSolid  && vy > 0.0) { vy = vy * bEdge; }
    // Surface friction — a floor brakes lateral motion, walls brake
    // vertical. This is the drag that kills the shoot-along-the-surface
    // jet pressure scatter creates on flat floors.
    if (downSolid) {
      var fricF = floorFric;
      // v25.45 — LEDGE LIP: a floor cell at an OPEN edge (a passable
      // horizontal neighbour with no floor under it) barely grips
      // (sp.feel.w), so a body pushed toward the lip SPILLS over instead
      // of damming into a fat blob hanging at the edge; only bead-scale
      // water (no push behind it) can rest there. Walled edges (stone-
      // lined ponds) are not lips — full friction. max() so a lip can
      // never grip harder than the floor. edit2 the CPU twin (070).
      let leftOpen  = !leftSolid  && !gridSolid(cgx - 1, cgy + 1);
      let rightOpen = !rightSolid && !gridSolid(cgx + 1, cgy + 1);
      if (leftOpen || rightOpen) { fricF = max(fricF, sp.feel.w); }
      vx = vx * fricF;
    }
    if (leftSolid || rightSolid) { vy = vy * wallFric; }
  }
  cellVelX[c] = vx;
  cellVelY[c] = vy;
`;
  var WGSL_GRID_BOUNDARY =
    WGSL_GRID_BOUNDARY_HEAD + cellEntryDense(WGSL_GRID_BOUNDARY_BODY);

  /* ---- WGSL — G2P grid->particle gather (Stage 5) --------------------
   * The final kernel of the core MPM step. One thread per particle GATHERs
   * the resolved per-cell velocity (cellVelX/cellVelY, written by the
   * Stage-4 gridUpdate) over its 3x3 quadratic-B-spline stencil — no
   * atomics, every cell only read.
   *
   * G2P needs its own bind-group layout: the count-sort, P2G and Stage-4
   * layouts do not bind the right mix. G2P touches pos (rw — writes the
   * new position + velocity), affine (rw — writes the new APIC C matrix),
   * aux (rw — reads density, advances aeration), flag (rw — writes the
   * sleeping bit + restFrames) and cellVelX/cellVelY (read). 6 storage
   * buffers + the uniform — within the 8-buffer WebGPU floor.
   *
   * cellVelX/cellVelY are plain f32 here (the gridUpdate kernel wrote them
   * non-atomically, one thread per cell); the G2P kernel only reads them.
   * -------------------------------------------------------------------- */
  var WGSL_G2P_PRELUDE = /* wgsl */ `
struct P2GParams {
  count      : u32,
  gridW      : u32,
  gridH      : u32,
  originX    : u32,   // i32 bit pattern
  originY    : u32,   // i32 bit pattern
  cells      : u32,
  stepDt     : f32,
  invCell    : f32,
  worldCols  : f32,   // COLS      — world-bounds clamp
  worldTile  : f32,   // TILE      — world-bounds clamp
  worldRows  : f32,   // TOTAL_ROWS — world-bounds clamp
  _pad0      : f32,
  _pad1      : u32,
  _pad2      : u32,
  _pad3      : u32,
  _pad4      : u32,
  region     : vec4<f32>,   // v14.31 active-region box world px: minX,minY,maxX,maxY
};
@group(0) @binding(0) var<uniform> gp : P2GParams;
@group(0) @binding(1) var<storage, read_write> pos      : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> affine   : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> aux      : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> flag     : array<u32>;
@group(0) @binding(5) var<storage, read>       cellVelX : array<f32>;
@group(0) @binding(6) var<storage, read>       cellVelY : array<f32>;
// v25.56 BATH B1: the mass-normalized heat field (pressure layout wrote
// it this substep). Bound rw because the buffer is an atomic accumulator.
@group(0) @binding(8) var<storage, read_write> cellHeat : array<atomic<i32>>;

// Cell pitch (world px / cell) — LIQUID_CELL on the CPU side.
const CELL : f32 = ${LIQUID_CELL_DEFAULT};
const FIXED_SCALE : f32 = ${FIXED_SCALE};

// v14.26 — the fluid-feel constants liquidG2P reads (water motion scale,
// damping, aeration threshold/coeff) now flow live through the SimParams
// uniform sp (sp.g2pA / sp.g2pB); the binding is injected per-pipeline.
// LIQUID_INV_DENSITY is derived/structural and stays a baked const; the
// sleep / wake thresholds are perf-mitigation knobs (TUNING.md §2.8), not
// fluid feel, so they stay baked too.
const LIQUID_INV_DENSITY    : f32 = ${LIQUID_INV_DENSITY};
const LIQUID_SLEEP_FRAMES   : u32 = ${LIQUID_SLEEP_FRAMES}u;
const LIQUID_SLEEP_VSQ      : f32 = ${LIQUID_SLEEP_VSQ};
const LIQUID_WAKE_CELL_VSQ  : f32 = ${LIQUID_WAKE_CELL_VSQ};
const LIQUID_REST_BRAKE_VSQ : f32 = ${LIQUID_REST_BRAKE_VSQ};
const LIQUID_REST_BRAKE     : f32 = ${LIQUID_REST_BRAKE};
const LIQUID_REST_BRAKE_HARD_VSQ : f32 = ${LIQUID_REST_BRAKE_HARD_VSQ};
const LIQUID_REST_BRAKE_HARD     : f32 = ${LIQUID_REST_BRAKE_HARD};

// v14.31 — active-region cull. A particle outside gp.region is settled
// off-screen water; the sim skips it (the smaller grid does not enclose
// its cell). Must be tested before any cell-index math.
fn outOfRegion(p : vec2<f32>) -> bool {
  return p.x < gp.region.x || p.x > gp.region.z
      || p.y < gp.region.y || p.y > gp.region.w;
}
`;

  /* g2pGather — one thread per particle. A faithful port of the CPU
   * liquidG2P:
   *   - frozen particles are skipped (the CPU `continue`).
   *   - sleeping particles scan the 9 stencil cells' resolved velocity;
   *     if the max cell kinetic energy stays below LIQUID_WAKE_CELL_VSQ
   *     the particle is left untouched (stays asleep), else the sleeping
   *     bit clears + restFrames resets and the particle proceeds.
   *   - awake particles recompute the 3x3 quadratic-B-spline stencil from
   *     pos (pos has not moved — G2P runs before it writes the new pos),
   *     gather velocity from the 9 cellVelX/cellVelY cells with the
   *     unrolled gv00..gv11 affine accumulation, then reconstruct the
   *     APIC C matrix as gv00 = 4*(gv00 + vx*ddx) etc.
   *   - water (type 0) scales gathered velocity + C by LIQUID_WATER_-
   *     MOTION_SCALE.
   *   - the new grid-unit position is clamped to world bounds, the damped
   *     velocity (cell -> world px/s) is written, aeration is advanced
   *     from the per-step acceleration magnitude, and the sleep tracking
   *     (restFrames vs LIQUID_SLEEP_FRAMES / LIQUID_SLEEP_VSQ) writes the
   *     sleeping bit + restFrames back into flag.
   *   - Stage 6 — the pre-step world position is stashed into aux.zw
   *     before pos is overwritten; the collide kernel (chained straight
   *     after) reads it as the terrain-collision rollback target.
   * The 1-cell grid margin keeps the whole 3x3 in [0, cells) so the dense
   * cell index needs no clamp.
   * Terrain collision (liquidMoveParticle) is NOT part of G2P — it is the
   * separate collide kernel, chained after this one (Stage 6). */
  var WGSL_G2P_GATHER = /* wgsl */ `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  let fl = flag[i];
  // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5] rest[8:23].
  let frozen   = (fl >> 5u) & 1u;
  if (frozen != 0u) { return; }
  if (outOfRegion(pos[i].xy)) { return; }   // v14.31 - skip off-region

  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);

  // Stencil from the pre-step position (P2G's lx/dx, recomputed —
  // bit-identical since the particle has not moved between P2G and G2P).
  let pp  = pos[i];
  let lx  = pp.x * gp.invCell;
  let ly  = pp.y * gp.invCell;
  let gx  = i32(floor(lx));
  let gy  = i32(floor(ly));
  let ddx = f32(gx) + 0.5 - lx;
  let ddy = f32(gy) + 0.5 - ly;

  let wx0 = (ddx + 0.5) * (ddx + 0.5) * 0.5;
  let wx1 = 0.75 - ddx * ddx;
  let wx2 = (ddx - 0.5) * (ddx - 0.5) * 0.5;
  let wy0 = (ddy + 0.5) * (ddy + 0.5) * 0.5;
  let wy1 = 0.75 - ddy * ddy;
  let wy2 = (ddy - 0.5) * (ddy - 0.5) * 0.5;

  // Dense base cell; the 1-cell margin keeps the full 3x3 in range.
  let bx = gx - ox;
  let by = gy - oy;
  let row0 = (by - 1) * i32(gp.gridW) + bx;
  let row1 =  by      * i32(gp.gridW) + bx;
  let row2 = (by + 1) * i32(gp.gridW) + bx;
  var nbr : array<u32, 9>;
  nbr[0] = u32(row0 - 1); nbr[1] = u32(row0); nbr[2] = u32(row0 + 1);
  nbr[3] = u32(row1 - 1); nbr[4] = u32(row1); nbr[5] = u32(row1 + 1);
  nbr[6] = u32(row2 - 1); nbr[7] = u32(row2); nbr[8] = u32(row2 + 1);
  var wgt : array<f32, 9>;
  wgt[0] = wx0 * wy0; wgt[1] = wx1 * wy0; wgt[2] = wx2 * wy0;
  wgt[3] = wx0 * wy1; wgt[4] = wx1 * wy1; wgt[5] = wx2 * wy1;
  wgt[6] = wx0 * wy2; wgt[7] = wx1 * wy2; wgt[8] = wx2 * wy2;

  // --- Sleeping particles: scan the 9 stencil cells' resolved velocity.
  // Any cell whose kinetic energy clears the wake threshold re-wakes the
  // particle (a disturbance directly under it must wake it too, not just
  // one at its centre cell). If nothing is loud enough, leave it asleep.
  // restBase carries the pre-step restFrames into the sleep tracking; a
  // woken particle resets it to 0 (the CPU sets liquidRestFrames=0 on wake).
  var restBase : u32 = (fl >> 8u) & 0xffffu;
  let sleeping = (fl >> 4u) & 1u;
  // v24.120 debug kit — coll.w carries the live debug bitmask (bit 1 =
  // no-sleep, bit 2 = no-brake); see LIQUID_DBG_FLAGS / writeSimParams.
  let dbgF = u32(sp.coll.w + 0.5);
  if (sleeping != 0u) {
    if ((dbgF & 1u) != 0u) {
      // No-sleep — force-wake; skip the scan. The flag rebuild at the
      // bottom clears the sleep bit (this branch never re-sets it).
      restBase = 0u;
    } else if (sp.bathA.w > 0.5 && ((fl >> 24u) & 0xffu) > 20u) {
      // v25.92 BANYA: HOT water never stays asleep. A sleeping parcel
      // skips the rest of G2P, where buoyancy lives, so heated water froze
      // into a painted blanket (hot but paralyzed). Bath-gated: with the
      // bath off the heat bits are 0 and this branch never takes.
      restBase = 0u;
    } else {
      var wakeMax : f32 = 0.0;
      for (var s : u32 = 0u; s < 9u; s = s + 1u) {
        let wc  = nbr[s];
        let wvx = cellVelX[wc];
        let wvy = cellVelY[wc];
        let wmag = wvx * wvx + wvy * wvy;
        if (wmag > wakeMax) { wakeMax = wmag; }
      }
      // v24.150 — while the body is LIVELY (calm < 0.5, g2pB.w) the wake
      // bar drops ~8x so long low-amplitude swells recruit sleepers and a
      // big wave can cross the whole lake (saharan's tank: nothing sleeps,
      // everything participates). Settled keeps the strict v24.125 bar.
      // Branch (not mix) so calm=1 is byte-identical for the self-tests.
      var wakeBar = LIQUID_WAKE_CELL_VSQ;
      if (sp.g2pB.w < 0.5) { wakeBar = LIQUID_WAKE_CELL_VSQ * 0.12; }
      if (wakeMax < wakeBar) { return; }   // stays asleep
      // Woken — the rest of the gather runs for it this frame; restFrames
      // starts from 0 (the CPU resets liquidRestFrames to 0 on wake).
      restBase = 0u;
    }
  }

  // --- Awake gather — unrolled 9-corner velocity + affine accumulation.
  // Mirrors the CPU's hardcoded stencil ox/oy folds (centre column/row
  // contribute no gradient term).
  var vx   : f32 = 0.0;
  var vy   : f32 = 0.0;
  var gv00 : f32 = 0.0;
  var gv01 : f32 = 0.0;
  var gv10 : f32 = 0.0;
  var gv11 : f32 = 0.0;
  var wi : f32; var vxi : f32; var vyi : f32; var wvxi : f32; var wvyi : f32;
  // s=0  ox=-1 oy=-1
  wi = wgt[0]; vxi = cellVelX[nbr[0]]; vyi = cellVelY[nbr[0]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 - wvxi; gv01 = gv01 - wvxi; gv10 = gv10 - wvyi; gv11 = gv11 - wvyi;
  // s=1  ox=0  oy=-1
  wi = wgt[1]; vxi = cellVelX[nbr[1]]; vyi = cellVelY[nbr[1]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv01 = gv01 - wvxi; gv11 = gv11 - wvyi;
  // s=2  ox=+1 oy=-1
  wi = wgt[2]; vxi = cellVelX[nbr[2]]; vyi = cellVelY[nbr[2]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 + wvxi; gv01 = gv01 - wvxi; gv10 = gv10 + wvyi; gv11 = gv11 - wvyi;
  // s=3  ox=-1 oy=0
  wi = wgt[3]; vxi = cellVelX[nbr[3]]; vyi = cellVelY[nbr[3]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 - wvxi; gv10 = gv10 - wvyi;
  // s=4  ox=0  oy=0  (centre, no gradient contribution)
  wi = wgt[4]; vxi = cellVelX[nbr[4]]; vyi = cellVelY[nbr[4]];
  vx = vx + wi * vxi; vy = vy + wi * vyi;
  // s=5  ox=+1 oy=0
  wi = wgt[5]; vxi = cellVelX[nbr[5]]; vyi = cellVelY[nbr[5]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 + wvxi; gv10 = gv10 + wvyi;
  // s=6  ox=-1 oy=+1
  wi = wgt[6]; vxi = cellVelX[nbr[6]]; vyi = cellVelY[nbr[6]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 - wvxi; gv01 = gv01 + wvxi; gv10 = gv10 - wvyi; gv11 = gv11 + wvyi;
  // s=7  ox=0  oy=+1
  wi = wgt[7]; vxi = cellVelX[nbr[7]]; vyi = cellVelY[nbr[7]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv01 = gv01 + wvxi; gv11 = gv11 + wvyi;
  // s=8  ox=+1 oy=+1
  wi = wgt[8]; vxi = cellVelX[nbr[8]]; vyi = cellVelY[nbr[8]];
  wvxi = wi * vxi; wvyi = wi * vyi; vx = vx + wvxi; vy = vy + wvyi;
  gv00 = gv00 + wvxi; gv01 = gv01 + wvxi; gv10 = gv10 + wvyi; gv11 = gv11 + wvyi;

  // v25.56 BATH B1: gather the mass-normalized cell heat with the same
  // stencil, relax the particle's heat toward it (diffusion), take the
  // source rect, and cool toward ambient. tHeat stays 0 unless the bath
  // is on, and every term below multiplies by it: byte-identical when off.
  var tHeat : f32 = 0.0;
  if (sp.bathA.w > 0.5) {
    var hAcc : f32 = 0.0;
    for (var s : u32 = 0u; s < 9u; s = s + 1u) {
      hAcc = hAcc + wgt[s] * (f32(atomicLoad(&cellHeat[nbr[s]])) / FIXED_SCALE);
    }
    tHeat = f32((fl >> 24u) & 0xffu) / 127.5;
    tHeat = tHeat + (hAcc / 127.5 - tHeat) * sp.bathA.x;
    if (pp.x >= sp.bathB.x && pp.x <= sp.bathB.z &&
        pp.y >= sp.bathB.y && pp.y <= sp.bathB.w) {
      tHeat = tHeat + (sp.bathC.x - tHeat) * sp.bathC.y;
    }
    tHeat = tHeat * max(0.0, 1.0 - sp.bathA.y * gp.stepDt);
    tHeat = clamp(tHeat, 0.0, 2.0);
  }

  // Reconstruct the APIC affine matrix C (== the CPU's 4*(gv + v*dd)).
  gv00 = 4.0 * (gv00 + vx * ddx);
  gv01 = 4.0 * (gv01 + vx * ddy);
  gv10 = 4.0 * (gv10 + vy * ddx);
  gv11 = 4.0 * (gv11 + vy * ddy);

  let oil = (fl & 3u) == 1u;
  if (!oil) {
    // v14.26 — water motion scale is live in the SimParams uniform.
    let motion = sp.g2pA.x;
    vx = vx * motion;
    vy = vy * motion;
    gv00 = gv00 * motion;
    gv01 = gv01 * motion;
    gv10 = gv10 * motion;
    gv11 = gv11 * motion;
  }

  // v26.13 — CFL/transport invariant. vx/vy are grid-cell displacement
  // for THIS substep, so cap them before they are added to position. The
  // old MAX_VEL block ran only after npx/npy were committed; it limited
  // the velocity stored for the next step but allowed the current step to
  // teleport arbitrarily far. Scale the affine term with the same factor
  // when the gathered field is clipped so APIC cannot re-inject the
  // discarded extreme gradient on the next P2G pass.
  if (!oil && sp.g2pC.x > 0.0) {
    let maxDisp = sp.g2pC.x * gp.stepDt * gp.invCell;
    let move2 = vx * vx + vy * vy;
    if (move2 > maxDisp * maxDisp) {
      let moveSc = maxDisp / sqrt(move2);
      vx = vx * moveSc;
      vy = vy * moveSc;
      gv00 = gv00 * moveSc;
      gv01 = gv01 * moveSc;
      gv10 = gv10 * moveSc;
      gv11 = gv11 * moveSc;
    }
  }

  // World-bounds clamp on the new grid-unit position (CPU minX/maxX/minY/
  // maxY). vx/vy are then re-derived as the clamped displacement.
  let minX = 1.0 + 1e-3;
  let maxX = gp.worldCols * gp.worldTile / CELL - minX;
  let minY = -400.0 * gp.worldTile / CELL;
  let maxY = (gp.worldRows + 1.0) * gp.worldTile / CELL;
  let npx = max(minX, min(maxX, lx + vx));
  let npy = max(minY, min(maxY, ly + vy));
  vx = npx - lx;
  vy = npy - ly;

  // Aeration — bleed in from the per-step acceleration magnitude. The
  // pre-step velocity is liquidPVX/PVY == pos.zw * stepDt * invCell.
  let pvx = pp.z * gp.stepDt * gp.invCell;
  let pvy = pp.w * gp.stepDt * gp.invCell;
  let ax = vx - pvx;
  let ay = vy - pvy;
  let alen = sqrt(ax * ax + ay * ay);
  let densityRatio = aux[i].x * LIQUID_INV_DENSITY;
  // v14.26 — aeration threshold/coeff live in the SimParams uniform.
  let aerThreshold = select(sp.g2pA.w, sp.g2pB.x, oil);
  let aerCoeff     = select(sp.g2pB.y, sp.g2pB.z, oil);
  var newAer : f32 = aux[i].y;
  if (densityRatio < aerThreshold) {
    newAer = min(1.0, newAer + alen * (1.0 - densityRatio / aerThreshold) * aerCoeff);
  }

  // Write back: new position (cell -> world px), damped velocity
  // (cell -> world px/s), the APIC C matrix, the advanced aeration.
  // Stage 6 — stash the pre-step world position into aux.zw BEFORE pos is
  // overwritten: the collide kernel (which runs after g2p) needs it as the
  // rollback target, the CPU liquidMoveParticle's liquidPrevX/PrevY (set
  // in liquidP2G to the position at the start of the step). aux.zw is
  // written only for particles that reach here — frozen/still-asleep
  // particles returned early, and collide skips exactly that same set.
  aux[i].z = pp.x;
  aux[i].w = pp.y;
  let invStep = 1.0 / gp.stepDt;
  // v14.26 — per-step velocity damping is live in the SimParams uniform.
  let damp  = select(sp.g2pA.y, sp.g2pA.z, oil);
  var newVX = vx * CELL * invStep * damp;
  var newVY = vy * CELL * invStep * damp;
  // v24.112 rest brake — extra low-speed damping so the standing pressure
  // noise floor decays to true rest and the sleep gate can latch; real
  // flows above the threshold are untouched. Two stages: gentle under
  // 25 px/s, hard under 10 px/s (the pressure-cycle pump otherwise
  // sustains a ~12 px/s shimmer forever).
  let vBrk = newVX * newVX + newVY * newVY;
  if ((dbgF & 2u) == 0u && vBrk < LIQUID_REST_BRAKE_VSQ) {
    var bf = LIQUID_REST_BRAKE;
    if (vBrk < LIQUID_REST_BRAKE_HARD_VSQ) { bf = LIQUID_REST_BRAKE_HARD; }
    // v24.145 — the brake is a REST device: scale toward 1 by the calm
    // ramp (g2pB.w; 0 = stimulated, 1 = settling), so active water flows
    // undamped. At calm=1 this is exactly bf (Sterbenz: 1+(bf-1) is
    // lossless in f32), so the self-tests are byte-identical.
    let bfC = 1.0 + (bf - 1.0) * sp.g2pB.w;
    newVX = newVX * bfC;
    newVY = newVY * bfC;
  }
  // v26.53 — smooth LOW-SPEED tail brake for supported body water. The
  // neighbour filter above cannot shorten coherent slosh by design, which
  // made the standalone slider's endpoints look identical. This second stage
  // removes a tunable amount of shared low-speed momentum, but only after the
  // water is below the quiet speed gate. Density support fades the brake out
  // below 0.55 and removes it entirely by 0.30, so separate spray keeps its
  // complete arc. sp.quiet.w is a per-substep strength; zero is an exact no-op.
  if (!oil && sp.quiet.w > 0.0) {
    let quietSpeed = sqrt(newVX * newVX + newVY * newVY);
    let quietTail = 1.0 - smoothstep(sp.quiet.y * 0.25, sp.quiet.y, quietSpeed);
    let quietBody = smoothstep(0.30, 0.55, densityRatio);
    let quietKeep = 1.0 - clamp(sp.quiet.w * quietTail * quietBody, 0.0, 0.2);
    newVX = newVX * quietKeep;
    newVY = newVY * quietKeep;
  }
  // v24.173 Old-Faithful — speed-gated burst damp + hard velocity clamp
  // (water only). Bleed energy from FAST water so a stir settles while
  // resting water (below the gate) is untouched, then cap the speed so an
  // over-compressed ejection cannot run away into the "explosion fest".
  // Carried linear velocity only (move + affine stay full = MLS-MPM-
  // consistent). vBrk is the pre-brake speed^2; the burst gate sits above
  // the rest-brake band so the two never overlap. g2pC = (maxVel, burstDamp,
  // gateLo, gateHi). edit2 the CPU fallback (sluice 070) + the fr() reference.
  if (!oil) {
    let burstDamp = sp.g2pC.y;
    if (burstDamp < 1.0) {
      let gLo = sp.g2pC.z * sp.g2pC.z;
      if (vBrk > gLo) {
        let gHi = sp.g2pC.w * sp.g2pC.w;
        var bT = (vBrk - gLo) / (gHi - gLo);
        if (bT > 1.0) { bT = 1.0; }
        let bF = 1.0 + (burstDamp - 1.0) * bT;
        newVX = newVX * bF;
        newVY = newVY * bF;
      }
    }
    let maxVel = sp.g2pC.x;
    if (maxVel > 0.0) {
      let spd2 = newVX * newVX + newVY * newVY;
      let mv2 = maxVel * maxVel;
      if (spd2 > mv2) {
        let sc = maxVel / sqrt(spd2);
        newVX = newVX * sc;
        newVY = newVY * sc;
      }
    }
    // v25.41 — AIR DRAG: a separated droplet decelerates in air instead of
    // flying ballistic (the sim had zero air resistance). densityRatio
    // < 0.55 means the particle has left the body (surface skin reads
    // 0.5-0.9, airborne spray 0.1-0.3); drag ramps to full by 0.35.
    // sp.feel.y = per-substep keep factor; 1 = off (exact old path).
    // edit2 the CPU fallback (sluice 070) + the fr() reference.
    let airDrag = sp.feel.y;
    if (airDrag < 1.0 && densityRatio < 0.55) {
      var adT = (0.55 - densityRatio) * 5.0;
      if (adT > 1.0) { adT = 1.0; }
      let adF = 1.0 + (airDrag - 1.0) * adT;
      newVX = newVX * adF;
      newVY = newVY * adF;
    }
  }
  // v25.56 BATH B1: thermal buoyancy (water only). Upward is negative y;
  // it scales with heat above ambient, so ambient water is untouched.
  // v25.96: capped BELOW gravity (600). Buoyancy is a body force here, so
  // an uncapped lift let hot parcels outrun free fall and stand as a
  // permanent fountain above the surface. Under the cap, hot water rises
  // only relative to cooler water and always falls back through air.
  if (!oil) {
    newVY = newVY - min(sp.bathA.z * tHeat, 450.0) * gp.stepDt;
  }
  pos[i] = vec4<f32>(npx * CELL, npy * CELL, newVX, newVY);
  affine[i] = vec4<f32>(gv00, gv01, gv10, gv11);
  aux[i].y = newAer;

  // Sleep tracking — a particle that has barely moved for many frames is
  // marked sleeping so future substeps skip pressure + G2P for it.
  // restBase is the pre-step restFrames (0 if the particle was just woken).
  var rest : u32 = restBase;
  var sleepBit : u32 = 0u;
  // v24.150 — latch only while SETTLING (calm >= 0.5): lively water never
  // freezes mid-wave, so swells keep their whole body. Settled behaviour
  // is byte-identical (calm = 1).
  // v25.92 BANYA: a hot particle refuses the sleep latch too, or it dozes
  // off between convection pulses and the cell dies. Zero-effect when off.
  let bathHot = sp.bathA.w > 0.5 && tHeat > 0.16;
  if ((dbgF & 1u) == 0u && !bathHot && sp.g2pB.w >= 0.5 && newVX * newVX + newVY * newVY < LIQUID_SLEEP_VSQ) {
    rest = rest + 1u;
    if (rest > LIQUID_SLEEP_FRAMES) {
      sleepBit = 1u;
      rest = LIQUID_SLEEP_FRAMES;
      // v24.112 — drop any residual foam at the sleep transition. A
      // sleeping particle skips the passes that decay aeration, so leftover
      // foam would otherwise freeze on the surface as permanent speckles.
      aux[i].y = 0.0;
    }
  } else {
    rest = 0u;
  }
  // Rebuild the flag: keep type[0:1]+origin[2:3], set sleeping[4],
  // clear frozen[5] (a frozen particle never reaches here), set rest[8:23].
  // v25.56 BATH B1: bits 24:31 carry the particle heat, floor-encoded so
  // cooling always reaches true 0 (and 0 when the bath is off = old bits).
  let tBits = u32(clamp(floor(tHeat * 127.5), 0.0, 255.0));
  flag[i] = (fl & 0xfu) | (sleepBit << 4u) | (rest << 8u) | (tBits << 24u);
}
`;

  /* ---- WGSL — terrain collision (Stage 6) ----------------------------
   * The collide kernel ports the CPU liquidMoveParticle. It runs as the
   * final kernel of the per-frame chain (... -> g2p -> collide), one
   * thread per particle, after g2p has written the new position.
   *
   * It needs its own bind-group layout: pos (rw — reads + writes the new
   * position/velocity), aux (rw — reads the g2p-stashed pre-step position
   * from .zw as the rollback target, may bump aeration .y), flag (read —
   * type for the bounce factor, frozen/sleeping to skip) and terrainMask
   * (read — the uploaded 1-bit-per-tile solidity mask). 3 storage buffers
   * + the uniform, within the 8-buffer WebGPU floor.
   *
   * Faithful port of liquidMoveParticle:
   *   - skip frozen OR sleeping (the CPU move loop's `continue` — those
   *     particles never call liquidMoveParticle).
   *   - probe solidity at 4 points (x,y+/-r) and (x+/-r,y); on a hit roll
   *     back to the pre-step position, reflect velocity by -bounce, bump
   *     aeration, and if still solid try up to 8 nudge offsets.
   *   - clamp to world bounds (x to [r, COLS*TILE-r]; y only on the lower
   *     edge — y > (TOTAL_ROWS+2)*TILE — there is NO upper clamp, the moon
   *     lives at negative rows).
   * The miner-silhouette half of the CPU liquidSolidAt is NOT ported —
   * Stage 6 is terrain-only; the dynamic miner collision is a Stage-8
   * game-bridge concern. // TODO Stage 8
   * -------------------------------------------------------------------- */
  var WGSL_COLLIDE_PRELUDE = /* wgsl */ `
struct P2GParams {
  count      : u32,
  gridW      : u32,
  gridH      : u32,
  originX    : u32,   // i32 bit pattern
  originY    : u32,   // i32 bit pattern
  cells      : u32,
  stepDt     : f32,
  invCell    : f32,
  worldCols  : f32,   // COLS       — world-bounds clamp
  worldTile  : f32,   // TILE       — world-bounds clamp / tile lookup
  worldRows  : f32,   // TOTAL_ROWS — world-bounds clamp
  _pad0      : f32,
  tileOrigC  : u32,   // i32 bit pattern — terrain rect origin column
  tileOrigR  : u32,   // i32 bit pattern — terrain rect origin row
  tileW      : u32,   // terrain rect width  in tiles
  tileH      : u32,   // terrain rect height in tiles
  region     : vec4<f32>,   // v14.31 active-region box world px: minX,minY,maxX,maxY
};
@group(0) @binding(0) var<uniform> gp : P2GParams;
@group(0) @binding(1) var<storage, read_write> pos         : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> aux         : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       flag        : array<u32>;
@group(0) @binding(4) var<storage, read>       terrainMask : array<u32>;
// Stage 8 — the GameParams uniform (binding 5) carries the player pose so
// the collide ring can also test the moving miner silhouette.
@group(0) @binding(5) var<uniform> gameP : GameParams;

// Collision tunables. COLLIDE_RADIUS is derived (CELL * 0.5 * 0.85),
// structural — stays a baked const. v14.26 — the per-fluid terrain
// restitution (BOUNCE_WATER / BOUNCE_OIL) is now live in the SimParams
// uniform sp (sp.coll.xy); the struct + binding are appended per-pipeline.
const COLLIDE_RADIUS : f32 = ${LIQUID_COLLIDE_RADIUS};

// v14.31 — active-region cull. A particle outside gp.region is settled
// off-screen water; the sim skips it (the smaller grid does not enclose
// its cell). Must be tested before any cell-index math.
fn outOfRegion(p : vec2<f32>) -> bool {
  return p.x < gp.region.x || p.x > gp.region.z
      || p.y < gp.region.y || p.y > gp.region.w;
}
`;

  /* collideMove — the per-particle terrain-collision kernel. One thread
   * per particle; a faithful port of the CPU liquidMoveParticle (terrain-
   * only — see the WGSL_COLLIDE_PRELUDE banner). */
  var WGSL_COLLIDE = /* wgsl */ `
// Sample the uploaded terrain bitmask at a world-px point. The mask is
// 1 bit/tile, row-major over the [tileOrigC..+tileW) x [tileOrigR..+tileH)
// tile rect. A point in a tile outside that rect reads non-solid — the
// rect is the particle bbox + a 1-tile halo, so a world-bounds-clamped
// particle's +/-r probes always land inside; this just keeps a stray
// index safe (== the CPU clamp behaviour for out-of-region probes).
fn terrainSolidAt(px : f32, py : f32) -> bool {
  let oc = bitcast<i32>(gp.tileOrigC);
  let orow = bitcast<i32>(gp.tileOrigR);
  let tc = i32(floor(px / gp.worldTile)) - oc;
  let tr = i32(floor(py / gp.worldTile)) - orow;
  if (tc < 0 || tr < 0 || tc >= i32(gp.tileW) || tr >= i32(gp.tileH)) {
    return false;
  }
  let idx = u32(tr) * gp.tileW + u32(tc);
  let word = terrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

// Stage 8 — the moving-miner silhouette test. A faithful port of the CPU
// liquidPointInMiner: a world point is mapped into player-local space
// (mirrored when the rig faces left) and tested against the hull + track
// AABBs. gameP.player.x is the active flag (0 when there is no player or
// the game is won — the CPU returns false then).
fn pointInMiner(x : f32, y : f32) -> bool {
  if (gameP.player.x < 0.5) { return false; }
  var lx = x - gameP.player.y;
  let ly = y - gameP.player.z;
  if (gameP.player.w < 0.0) { lx = PLAYER_W - lx; }
  if (lx >= MINER_HULL_L  && lx <= MINER_HULL_R
      && ly >= MINER_HULL_T  && ly <= MINER_HULL_B) { return true; }
  if (lx >= MINER_TRACK_L && lx <= MINER_TRACK_R
      && ly >= MINER_TRACK_T && ly <= MINER_TRACK_B) { return true; }
  return false;
}

// v26.11 — guests left the terrain probe. v26.05 ran them through the
// solidRing rollback+reflect path, which is correct for STATIC solids
// only: when a fast-moving ring sweeps over a still particle, the
// particle's own previous position is inside too, the r-sized nudges
// cannot clear a body-sized overlap, and the particle rides INSIDE the
// silhouette until the body passes (a visible through-path), exiting at
// the grid's pinned face velocity (the crown-cannon blowback). Guests
// are handled by the dedicated sweep block in main() instead.

// liquidSolidAt — the 4-point probe ring at radius r. Mirrors the CPU
// liquidSolidAt: each ring point is solid if it is in a solid tile OR
// inside the miner silhouette (Stage 8 — the miner half is now ported).
// Guests are NOT here (v26.11): a deforming moving boundary needs the
// sweep treatment in main(), not static rollback.
fn solidRing(x : f32, y : f32, r : f32) -> bool {
  if (terrainSolidAt(x,     y + r) || pointInMiner(x,     y + r)) { return true; }
  if (terrainSolidAt(x - r, y    ) || pointInMiner(x - r, y    )) { return true; }
  if (terrainSolidAt(x + r, y    ) || pointInMiner(x + r, y    )) { return true; }
  if (terrainSolidAt(x,     y - r) || pointInMiner(x,     y - r)) { return true; }
  return false;
}

// v26.12 — a guest projection is a collision correction, not a teleport.
// Test the whole particle ring along the correction segment at <= r spacing.
// Checking only the destination let a fast/deformed guest choose a clear
// point across an 8 px wall, after the normal terrain pass had already run.
fn guestExitClear(x0 : f32, y0 : f32, x1 : f32, y1 : f32, r : f32) -> bool {
  let dx = x1 - x0;
  let dy = y1 - y0;
  let dist = sqrt(dx * dx + dy * dy);
  let steps = max(1.0, ceil(dist / max(1.0, r)));
  var s : f32 = 1.0;
  loop {
    if (s > steps) { break; }
    let t = s / steps;
    if (solidRing(x0 + dx * t, y0 + dy * t, r)) { return false; }
    s = s + 1.0;
  }
  return true;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  let fl = flag[i];
  // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5] rest[8:23].
  // The CPU move loop skips frozen AND sleeping particles (they never
  // call liquidMoveParticle), so the kernel skips exactly that set.
  let sleeping = (fl >> 4u) & 1u;
  let frozen   = (fl >> 5u) & 1u;
  if (frozen != 0u || sleeping != 0u) { return; }
  if (outOfRegion(pos[i].xy)) { return; }   // v14.31 - skip off-region

  let r = COLLIDE_RADIUS;
  // v14.26 — terrain restitution is live in the SimParams uniform.
  let bounce = select(sp.coll.x, sp.coll.y, (fl & 3u) == 1u);

  let pp = pos[i];
  var x  = pp.x;
  var y  = pp.y;
  var vx = pp.z;
  var vy = pp.w;
  // The CPU returns false on a non-finite state and the particle is then
  // removed. On the GPU there is no removal yet — sanitize any non-finite
  // lane to 0 and carry on; the collision probe + world-bounds clamp below
  // still guarantee the particle does not end inside a solid tile.
  // TODO Stage 8 — port the CPU's remove-on-non-finite (needs a compaction
  // pass; the game bridge owns particle add/remove).
  let finiteIn = (x == x) && (y == y) && (vx == vx) && (vy == vy);
  if (!finiteIn) {
    if (x != x) { x = 0.0; }
    if (y != y) { y = 0.0; }
    if (vx != vx) { vx = 0.0; }
    if (vy != vy) { vy = 0.0; }
  }

  // The pre-step position g2p stashed into aux.zw is the rollback target
  // (the CPU's liquidPrevX/PrevY). The CPU uses liquidPrevX[i] || x, so
  // a 0 (falsy) prev falls back to the current position — mirror that.
  let auxv  = aux[i];
  let prevX = select(x, auxv.z, auxv.z != 0.0);
  let prevY = select(y, auxv.w, auxv.w != 0.0);

  // v26.13 — continuous terrain/miner collision. Endpoint-only probing
  // accepted a particle that started before a thin wall and landed clear
  // on its far side. March the complete ring along the G2P segment at
  // sub-radius spacing, stopping at the last clear sample. MAX_VEL keeps
  // normal water to a handful of samples; the 128 ceiling is a corruption
  // backstop for uncapped oil/non-finite recovery paths.
  var moveHit = false;
  let moveDX = x - prevX;
  let moveDY = y - prevY;
  let moveDist = sqrt(moveDX * moveDX + moveDY * moveDY);
  if (moveDist > 0.001) {
    let moveStep = max(0.75, r * 0.75);
    let moveN = min(128.0, max(1.0, ceil(moveDist / moveStep)));
    var moveI : f32 = 1.0;
    var clearX = prevX;
    var clearY = prevY;
    loop {
      if (moveI > moveN) { break; }
      let mt = moveI / moveN;
      let sampleX = prevX + moveDX * mt;
      let sampleY = prevY + moveDY * mt;
      if (solidRing(sampleX, sampleY, r)) {
        x = clearX;
        y = clearY;
        moveHit = true;
        break;
      }
      clearX = sampleX;
      clearY = sampleY;
      moveI = moveI + 1.0;
    }
  } else if (solidRing(x, y, r)) {
    x = prevX;
    y = prevY;
    moveHit = true;
  }

  // On a hit: reflect velocity, bump aeration, then nudge only if the
  // rollback/last-clear point was already embedded by moving geometry.
  if (moveHit) {
    vx = vx * (-bounce);
    vy = vy * (-bounce);
    aux[i].y = min(1.0, auxv.y + 0.12);
    if (solidRing(x, y, r)) {
      // 8 nudge directions (CPU LIQ_NUDGES order), first clear one wins.
      var nudged = false;
      let step = r * 0.9;
      var nx : f32; var ny : f32;
      // (0,-1)
      if (!nudged) { nx = x; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,0)
      if (!nudged) { nx = x - step; ny = y;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,0)
      if (!nudged) { nx = x + step; ny = y;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (0,1)
      if (!nudged) { nx = x; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,-1)
      if (!nudged) { nx = x - step; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,-1)
      if (!nudged) { nx = x + step; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,1)
      if (!nudged) { nx = x - step; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,1)
      if (!nudged) { nx = x + step; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
    }
  }

  // Preserve the terrain-resolved state. Guest correction runs after the
  // terrain pass, so any rejected correction must return here, not to the
  // pre-G2P position that may itself be on the wrong side of a wall.
  let terrainX = x; let terrainY = y;
  let terrainVX = vx; let terrainVY = vy;
  var guestProjected = false;

  // --- guest sweep (v26.14): collide against the UNION exterior. ---
  // Collect the nearest face from every ring containing this particle, then
  // validate that its projected point is outside every active guest. If the
  // nearest face is hidden inside a touching neighbour, search all candidate
  // edges and choose the shortest terrain-clear route to the union exterior.
  // One projection and one velocity constraint are applied, so guest array
  // order cannot change the result.
  var guestInsideCount : i32 = 0;
  var gD2 : f32 = 1e9;
  var gPX : f32 = x; var gPY : f32 = y;
  var gFVX : f32 = 0.0; var gFVY : f32 = 0.0;
  for (var gi : i32 = 0; gi < ${GS_MAX_GUESTS}; gi = gi + 1) {
    if (!guestContainsPoint(gi, x, y)) { continue; }
    guestInsideCount = guestInsideCount + 1;
    let gB = gameP.guests[gi * 2 + 1];
    let gn = i32(gB.y);
    let gBase = gi * ${GS_RING};
    var gj = gn - 1;
    var ringD2 : f32 = 1e9;
    var ringPX : f32 = x; var ringPY : f32 = y;
    var ringFVX : f32 = 0.0; var ringFVY : f32 = 0.0;
    for (var ge : i32 = 0; ge < gn; ge = ge + 1) {
      let pa = gameP.guestPts[gBase + ge];
      let pb = gameP.guestPts[gBase + gj];
      let ex = pb.x - pa.x;
      let ey = pb.y - pa.y;
      let el2 = max(ex * ex + ey * ey, 1e-6);
      let et = clamp(((x - pa.x) * ex + (y - pa.y) * ey) / el2, 0.0, 1.0);
      let qx = pa.x + ex * et;
      let qy = pa.y + ey * et;
      let fvx = pa.z + (pb.z - pa.z) * et;
      let fvy = pa.w + (pb.w - pa.w) * et;
      let dq2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (guestCandidateWins(dq2, qx, qy, fvx, fvy,
                             ringD2, ringPX, ringPY, ringFVX, ringFVY)) {
        ringD2 = dq2;
        ringPX = qx; ringPY = qy;
        ringFVX = fvx; ringFVY = fvy;
      }
      gj = ge;
    }
    if (guestCandidateWins(ringD2, ringPX, ringPY, ringFVX, ringFVY,
                           gD2, gPX, gPY, gFVX, gFVY)) {
      gD2 = ringD2;
      gPX = ringPX; gPY = ringPY;
      gFVX = ringFVX; gFVY = ringFVY;
    }
  }

  if (guestInsideCount > 0) {
    var gdep = sqrt(gD2);
    var gnx : f32 = 0.0; var gny : f32 = -1.0;
    if (gdep > 0.001) {
      gnx = (gPX - x) / gdep;
      gny = (gPY - y) / gdep;
    }
    var gtx = gPX + gnx * 0.5;
    var gty = gPY + gny * 0.5;
    var canProject = gdep > 0.001 &&
                     !guestAnyContainsPoint(gtx, gty) &&
                     guestExitClear(x, y, gtx, gty, r);

    if (!canProject) {
      // The nearest face is either internal to the union or blocked by
      // terrain/miner. Search exact closest points on every edge belonging
      // to a ring that contains the original particle.
      var uD2 : f32 = 1e9;
      var uPX : f32 = x; var uPY : f32 = y;
      var uFVX : f32 = 0.0; var uFVY : f32 = 0.0;
      for (var ui : i32 = 0; ui < ${GS_MAX_GUESTS}; ui = ui + 1) {
        if (!guestContainsPoint(ui, x, y)) { continue; }
        let uB = gameP.guests[ui * 2 + 1];
        let un = i32(uB.y);
        let uBase = ui * ${GS_RING};
        var uj = un - 1;
        for (var ue : i32 = 0; ue < un; ue = ue + 1) {
          let pa = gameP.guestPts[uBase + ue];
          let pb = gameP.guestPts[uBase + uj];
          uj = ue;
          let ex = pb.x - pa.x;
          let ey = pb.y - pa.y;
          let el2 = max(ex * ex + ey * ey, 1e-6);
          let et = clamp(((x - pa.x) * ex + (y - pa.y) * ey) / el2, 0.0, 1.0);
          let qx = pa.x + ex * et;
          let qy = pa.y + ey * et;
          let ddx = qx - x;
          let ddy = qy - y;
          let dd2 = ddx * ddx + ddy * ddy;
          if (dd2 < 1e-6) { continue; }
          let dl = sqrt(dd2);
          let tx = qx + ddx / dl * 0.5;
          let ty = qy + ddy / dl * 0.5;
          if (guestAnyContainsPoint(tx, ty) ||
              !guestExitClear(x, y, tx, ty, r)) { continue; }
          let fvx = pa.z + (pb.z - pa.z) * et;
          let fvy = pa.w + (pb.w - pa.w) * et;
          if (guestCandidateWins(dd2, qx, qy, fvx, fvy,
                                 uD2, uPX, uPY, uFVX, uFVY)) {
            uD2 = dd2;
            uPX = qx; uPY = qy;
            uFVX = fvx; uFVY = fvy;
          }
        }
      }
      if (uD2 < 1e9) {
        gD2 = uD2;
        gPX = uPX; gPY = uPY;
        gFVX = uFVX; gFVY = uFVY;
        gdep = sqrt(gD2);
        gnx = (gPX - x) / gdep;
        gny = (gPY - y) / gdep;
        gtx = gPX + gnx * 0.5;
        gty = gPY + gny * 0.5;
        canProject = true;
      }
    }

    if (!canProject) {
      // A floor pinch can block the closest point on every edge. Retry the
      // edge midpoints, which mirrors the old squeeze escape but rejects
      // every midpoint hidden inside another guest.
      var oD2 : f32 = 1e9;
      for (var oi : i32 = 0; oi < ${GS_MAX_GUESTS}; oi = oi + 1) {
        if (!guestContainsPoint(oi, x, y)) { continue; }
        let oB = gameP.guests[oi * 2 + 1];
        let on = i32(oB.y);
        let oBase = oi * ${GS_RING};
        var oj = on - 1;
        for (var oe : i32 = 0; oe < on; oe = oe + 1) {
          let pa = gameP.guestPts[oBase + oe];
          let pb = gameP.guestPts[oBase + oj];
          oj = oe;
          let mx = (pa.x + pb.x) * 0.5;
          let my = (pa.y + pb.y) * 0.5;
          let ddx = mx - x;
          let ddy = my - y;
          let dd2 = ddx * ddx + ddy * ddy;
          if (dd2 < 1e-6) { continue; }
          let dl = sqrt(dd2);
          let tx = mx + ddx / dl * 0.5;
          let ty = my + ddy / dl * 0.5;
          if (guestAnyContainsPoint(tx, ty) ||
              !guestExitClear(x, y, tx, ty, r)) { continue; }
          let fvx = (pa.z + pb.z) * 0.5;
          let fvy = (pa.w + pb.w) * 0.5;
          if (guestCandidateWins(dd2, mx, my, fvx, fvy,
                                 oD2, gPX, gPY, gFVX, gFVY)) {
            oD2 = dd2;
            gPX = mx; gPY = my;
            gFVX = fvx; gFVY = fvy;
          }
        }
      }
      if (oD2 < 1e9) {
        gD2 = oD2;
        gdep = sqrt(gD2);
        gnx = (gPX - x) / gdep;
        gny = (gPY - y) / gdep;
        gtx = gPX + gnx * 0.5;
        gty = gPY + gny * 0.5;
        canProject = true;
      }
    }

    // Skin dead-band: a contact shallower than 1.5 px is ring-resample
    // jitter, not a meaningful sweep. Deeper overlaps receive one union
    // face constraint and, if a clear exterior was found, one projection.
    if (gdep > 1.5) {
      let gvn = (vx - gFVX) * gnx + (vy - gFVY) * gny;
      if (gvn < 0.0) {
        vx = vx - gnx * gvn;
        vy = vy - gny * gvn;
      }
      if (canProject) {
        x = gtx;
        y = gty;
        guestProjected = true;
      }
      if (gvn < -40.0 || gdep > 3.0) {
        aux[i].y = min(1.0, aux[i].y + 0.12);
      }
    }
  }

  // v26.12 — guests used to run after both safety nets: the terrain pass
  // and G2P's MAX_VEL clamp. Reassert both invariants after every guest has
  // had its turn. This also catches overlapping guest rings without letting
  // the second projection strand a particle inside terrain.
  if (guestProjected && solidRing(x, y, r)) {
    x = terrainX; y = terrainY;
    vx = terrainVX; vy = terrainVY;
  }
  if ((fl & 3u) != 1u) {
    let guestMaxVel = sp.g2pC.x;
    if (guestMaxVel > 0.0) {
      let guestSp2 = vx * vx + vy * vy;
      let guestMax2 = guestMaxVel * guestMaxVel;
      if (guestSp2 > guestMax2) {
        let guestSc = guestMaxVel / sqrt(guestSp2);
        vx = vx * guestSc;
        vy = vy * guestSc;
      }
    }
  }

  // World-bounds clamp — CPU liquidMoveParticle. x clamps both edges; y
  // only the lower edge ((TOTAL_ROWS+2)*TILE) — there is deliberately NO
  // upper-y clamp, the moon lives at negative world rows.
  if (x < r) { x = r; vx = abs(vx) * bounce; }
  let maxX = gp.worldCols * gp.worldTile - r;
  if (x > maxX) { x = maxX; vx = -abs(vx) * bounce; }
  let maxY = (gp.worldRows + 2.0) * gp.worldTile;
  if (y > maxY) {
    y = (gp.worldRows + 1.0) * gp.worldTile;
    vy = -abs(vy) * bounce;
  }

  // Final sanitize — the CPU return value is the finite check; here just
  // zero any lane that went non-finite so the particle stays usable.
  if (x != x)  { x = r; }
  if (y != y)  { y = 0.0; }
  if (vx != vx) { vx = 0.0; }
  if (vy != vy) { vy = 0.0; }

  pos[i] = vec4<f32>(x, y, vx, vy);
}
`;

  /* ---- WGSL — min-separation (anti-clump) pass (v24.185) --------------
   * Runs once per substep right after buildGrid (fresh count-sort grid). For
   * each OVER-DENSE particle (a knot), walk its 3x3 grid cells and push it away
   * from any neighbour closer than DMIN, so particles can never pack tighter
   * than DMIN — an over-pressured knot physically can't form or persist. Jacobi
   * positional separation (read neighbours, write own pos); one iteration per
   * substep, converges over frames. Normal water (below ODEN) returns at once,
   * so the neighbour walk is paid only by the few knot particles. The in-place
   * read of neighbour positions can tear by at most one displacement (~1px) and
   * is benign for a relaxation. Reads the grid built by buildGrid: cellCount /
   * cellStart / sortedIdx + GridParams. -------------------------------------- */
  var WGSL_DECLUMP = /* wgsl */ `
// paramsBuf (binding 0) is the SHARED uniform: computeGridBounds writes the
// grid lanes (0-10,16-19) and computeTerrainBounds writes the terrain rect
// (lanes 12-15), both before the substep loop, so the same view the collide
// kernel uses (P2GParams) gives us grid + terrain here. The terrainMask
// (binding 7) is the collide kernel's 1-bit-per-tile solidity mask.
struct DeclumpParams {
  count:u32, gridW:u32, gridH:u32, originX:u32, originY:u32, cells:u32,
  stepDt:f32, invCell:f32,
  worldCols:f32, worldTile:f32, worldRows:f32, _pad0:f32,
  tileOrigC:u32, tileOrigR:u32, tileW:u32, tileH:u32,
  region : vec4<f32>,
};
@group(0) @binding(0) var<uniform> gp : DeclumpParams;
@group(0) @binding(1) var<storage, read_write> pos : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> aux : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> flag : array<u32>;
@group(0) @binding(4) var<storage, read> cellCount : array<u32>;
@group(0) @binding(5) var<storage, read> cellStart : array<u32>;
@group(0) @binding(6) var<storage, read> sortedIdx : array<u32>;
@group(0) @binding(7) var<storage, read> terrainMask : array<u32>;
const CELL : f32 = ${LIQUID_CELL_DEFAULT};
const DMIN : f32 = ${LIQUID_DECLUMP_DMIN};
const STR  : f32 = ${LIQUID_DECLUMP_STRENGTH};
const ODEN : f32 = ${LIQUID_DECLUMP_OVERDENSE};
const RAD  : f32 = ${LIQUID_COLLIDE_RADIUS};

// Same terrain probe the collide kernel uses (1 bit/tile, row-major over the
// [tileOrigC..+tileW) x [tileOrigR..+tileH) rect; out-of-rect reads non-solid).
fn declumpSolidAt(px : f32, py : f32) -> bool {
  let oc = bitcast<i32>(gp.tileOrigC);
  let orow = bitcast<i32>(gp.tileOrigR);
  let tc = i32(floor(px / gp.worldTile)) - oc;
  let tr = i32(floor(py / gp.worldTile)) - orow;
  if (tc < 0 || tr < 0 || tc >= i32(gp.tileW) || tr >= i32(gp.tileH)) { return false; }
  let idx = u32(tr) * gp.tileW + u32(tc);
  let word = terrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= gp.count) { return; }
  let fl = flag[i];
  if (((fl >> 5u) & 1u) != 0u) { return; }   // frozen
  if (aux[i].x < ODEN) { return; }            // only over-dense knots
  let p = pos[i].xy;
  let ox = bitcast<i32>(gp.originX);
  let oy = bitcast<i32>(gp.originY);
  let cx = i32(floor(p.x / CELL)) - ox;
  let cy = i32(floor(p.y / CELL)) - oy;
  let gw = i32(gp.gridW);
  let gh = i32(gp.gridH);
  if (cx < 1 || cy < 1 || cx >= gw - 1 || cy >= gh - 1) { return; }
  var push = vec2<f32>(0.0, 0.0);
  let dmin2 = DMIN * DMIN;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let c = u32((cy + dy) * gw + (cx + dx));
      let st = cellStart[c];
      let cn = cellCount[c];
      for (var k = 0u; k < cn; k = k + 1u) {
        let j = sortedIdx[st + k];
        if (j == i) { continue; }
        let d = p - pos[j].xy;
        let dd = dot(d, d);
        if (dd < dmin2 && dd > 1e-8) {
          let dist = sqrt(dd);
          push = push + (d / dist) * (DMIN - dist) * 0.5;
        }
      }
    }
  }
  // v24.186 — TERRAIN CLAMP. A knot packed against a wall has all its
  // neighbours on the open side, so "away from neighbours" points INTO the
  // wall; an unclamped push drove water into the dirt (the owner's bleed).
  // Move each axis only if the particle's LEADING EDGE (centre +/- radius in
  // the push direction) stays out of solid, so a wall-packed knot spreads
  // ALONG / away from the wall into open water but never penetrates it. The
  // collide pass still resolves the fine radius after.
  // v15.0 — cap the relaxation move at one cell per substep. A degenerate
  // fully-coincident knot could sum a push of several cells in one step;
  // the Jacobi relaxation converges over frames either way, and the cap is
  // what lets the sparse grid's block marking (+/-2 cells around the
  // pre-declump stencil base) provably cover every post-declump splat.
  var mv = push * STR;
  mv.x = clamp(mv.x, -CELL, CELL);
  mv.y = clamp(mv.y, -CELL, CELL);
  let cand = p + mv;
  var np = p;
  let dxm = cand.x - p.x;
  if (dxm != 0.0) {
    let edge = cand.x + select(-RAD, RAD, dxm > 0.0);
    if (!declumpSolidAt(edge, p.y)) { np.x = cand.x; }
  }
  let dym = cand.y - p.y;
  if (dym != 0.0) {
    let edge = cand.y + select(-RAD, RAD, dym > 0.0);
    if (!declumpSolidAt(np.x, edge)) { np.y = cand.y; }
  }
  pos[i] = vec4<f32>(np, pos[i].z, pos[i].w);
}
`;

  /* ---- WGSL — Stage 7 particle renderer ------------------------------
   * One instanced soft-disc draw per particle: a 6-vertex unit quad, the
   * instance count = particle count. The vertex shader reads buf.pos /
   * buf.aux / buf.flag straight as storage buffers (zero CPU readback),
   * applies the world->clip transform from a small RenderParams uniform,
   * and sizes the quad from the per-type particle diameter scaled by the
   * particle's density (mirrors the CPU drawLiquidsWebGL pointSize). The
   * fragment is the same soft round disc (1 - dot(uv,uv)) the CPU GL
   * fragment shader draws, with the water colour lerped base->foam by
   * aeration and oil flat — premultiplied-alpha output.
   *
   * RenderParams (32 bytes, 8 f32 lanes): camX, camY, dpws (= dpr*
   * worldScale), canvasW, canvasH, sizeBaseWater, sizeBaseOil, _pad.
   * dpws / sizeBase* are CPU-computed so the shader stays a pure mul-add.
   * -------------------------------------------------------------------- */
  var WGSL_RENDER = /* wgsl */ `
struct RenderParams {
  camX          : f32,   // camera world x
  camY          : f32,   // camera world y
  dpws          : f32,   // dpr * worldScale — world px -> device px
  canvasW       : f32,   // render canvas width  in device px
  canvasH       : f32,   // render canvas height in device px
  sizeBaseWater : f32,   // water point DIAMETER base in device px
  sizeBaseOil   : f32,   // oil   point DIAMETER base in device px
  _pad          : f32,
  // Live-tunable fluid colours (v14.25) — the 8 scalars above fill exactly
  // 32 bytes, so this first vec4 lands naturally 16-byte aligned. Fed every
  // frame from the CPU LIQUID_* render vars; no shader recompile on change.
  waterColor    : vec4<f32>,   // rgb = water colour, a = water alpha
  waterFoam     : vec4<f32>,   // rgb = foam colour,  a = unused
  oilColor      : vec4<f32>,   // rgb = oil colour,   a = oil alpha
};
@group(0) @binding(0) var<uniform> rp : RenderParams;
@group(0) @binding(1) var<storage, read> pos  : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> aux  : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> flag : array<u32>;

// Density scale constant — mirrors the CPU LIQUID_INV_DENSITY render const.
// The fluid colours/alphas are NOT baked here any more; they flow live
// through RenderParams (rp.waterColor / rp.waterFoam / rp.oilColor).
const INV_DENSITY    : f32 = ${LIQUID_INV_DENSITY};

struct VOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       uv    : vec2<f32>,   // [-1,1] quad-local
  @location(1)       color : vec4<f32>,   // straight (un-premultiplied) rgba
};

// Unit quad — two triangles, corners in [-1,1]. vid in [0,6).
fn quadCorner(vid : u32) -> vec2<f32> {
  var c = vec2<f32>(-1.0, -1.0);
  if (vid == 1u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 2u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 3u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 4u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 5u) { c = vec2<f32>( 1.0,  1.0); }
  return c;
}

@vertex
fn vs(@builtin(vertex_index)   vid : u32,
      @builtin(instance_index) iid : u32) -> VOut {
  var out : VOut;
  let fl = flag[iid];
  // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5] rest[8:23].
  // Frozen particles are off-screen / not drawn — collapse their quad to
  // a degenerate point so the rasterizer discards it (matches the CPU
  // renderer skipping frozen particles in drawLiquidsWebGL).
  let frozen = (fl >> 5u) & 1u;
  if (frozen != 0u) {
    out.pos   = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    out.uv    = vec2<f32>(0.0, 0.0);
    out.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
  }

  let p = pos[iid];
  // Density scale — exactly the CPU drawLiquidsWebGL d factor: density *
  // INV_DENSITY + 0.5, clamped to <= 1.5.
  let density = aux[iid].x;
  var d = density * INV_DENSITY + 0.5;
  d = min(d, 1.5);

  let isOil = (fl & 3u) == 1u;
  let sizeBase = select(rp.sizeBaseWater, rp.sizeBaseOil, isOil);
  // pointSize is the DIAMETER in device px; floor at 1.15 like the CPU.
  var pointSize = sizeBase * d;
  pointSize = max(pointSize, 1.15);
  let halfPx = pointSize * 0.5;

  // World -> device-px screen position (== CPU (px - camX) * dpws).
  let scrX = (p.x - rp.camX) * rp.dpws;
  let scrY = (p.y - rp.camY) * rp.dpws;
  let corner = quadCorner(vid);
  let devX = scrX + corner.x * halfPx;
  let devY = scrY + corner.y * halfPx;
  // Device px -> clip space [-1,1]; y flipped (device y grows downward).
  let clipX = devX / (rp.canvasW * 0.5) - 1.0;
  let clipY = 1.0 - devY / (rp.canvasH * 0.5);
  out.pos = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.uv  = corner;

  // Colour — water lerps base->foam by aeration; oil is flat. Colours come
  // live from the RenderParams uniform (v14.25) so a recolour needs no
  // shader recompile.
  if (isOil) {
    out.color = vec4<f32>(rp.oilColor.rgb, rp.oilColor.a);
  } else {
    let a = clamp(aux[iid].y, 0.0, 1.0);
    out.color = vec4<f32>(mix(rp.waterColor.rgb, rp.waterFoam.rgb, a), rp.waterColor.a);
  }
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  // Soft round disc — the exact CPU GL fragment: a = clamp(1 - r^2, 0, 1).
  let aDisc = clamp(1.0 - dot(in.uv, in.uv), 0.0, 1.0);
  if (aDisc <= 0.0) { discard; }
  let alpha = in.color.a * aDisc;
  // Premultiplied-alpha output (the context is configured premultiplied).
  return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;

  /* ---- Stage 7b — surface-render shaders (v24.113) --------------------
   * Two passes replace the visible per-particle discs when
   * LIQUID_SURFACE_RENDER is on:
   *   FIELD — the same instanced splat geometry as the legacy renderer
   *     (radius scaled by rp.surf.z) accumulating ADDITIVELY into an
   *     offscreen rgba16float density field: R = water weight, G = water
   *     aeration-weighted, B = oil weight.
   *   COMPOSITE — a fullscreen triangle thresholds the field
   *     (smoothstep around rp.surf.x, half-width rp.surf.y) and tints it
   *     with the live fluid colours; oil composites over water. The
   *     smoothstep edge doubles as anti-aliasing, so the water reads as
   *     one continuous body with a clean surface line instead of a pile
   *     of balls, and per-particle micro-motion mostly disappears.
   * -------------------------------------------------------------------- */
  var WGSL_SURFACE_COMMON = /* wgsl */ `
struct RenderParams {
  camX          : f32,
  camY          : f32,
  dpws          : f32,
  canvasW       : f32,
  canvasH       : f32,
  sizeBaseWater : f32,
  sizeBaseOil   : f32,
  _pad          : f32,
  waterColor    : vec4<f32>,
  waterFoam     : vec4<f32>,
  oilColor      : vec4<f32>,
  surf          : vec4<f32>,   // x = threshold, y = softness, z = splat radius scale, w = on/off
  bathTint      : vec4<f32>,   // v25.57 bath: rgb = hot-water tint, w = strength (0 = off)
};
@group(0) @binding(0) var<uniform> rp : RenderParams;
`;

  var WGSL_SURFACE_FIELD = /* wgsl */ `
@group(0) @binding(1) var<storage, read> pos  : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> aux  : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> flag : array<u32>;
// v24.179 — NEIGHBOUR-COUNT SIZE GATE. The size below is driven by density,
// but a jet-stranded SINGLE particle reads a high density while being utterly
// alone, so it draws as a fat disc that never shrinks (the owner's "giant
// single-particle circles"). Density lies about isolation; the real signal is
// how many actual water particles are nearby. The count-sort grid already has
// per-cell particle counts, so gate the splat size by the 3x3 cell count: a
// lone particle (count ~1) shrinks to a speck, the body interior (count ~36)
// is untouched. Reads the grid's GridParams (origin/dims) + cellCount; both are
// fresh from this frame's buildGrid. Off-grid keeps full size.
struct GParams { c0:u32, gridW:u32, gridH:u32, originX:u32, originY:u32, c5:u32, c6:u32, c7:u32 };
@group(0) @binding(4) var<uniform> gpc : GParams;
@group(0) @binding(5) var<storage, read> cellCnt : array<u32>;
const NB_CELL : f32 = ${LIQUID_CELL_DEFAULT};
const NB_FULL : f32 = 12.0;   // 3x3 neighbour count for full size; below this the splat shrinks (body interior ~36)

const INV_DENSITY : f32 = ${LIQUID_INV_DENSITY};

struct VOut {
  @builtin(position) pos    : vec4<f32>,
  @location(0)       uv     : vec2<f32>,
  @location(1)       weight : vec3<f32>,   // x = water, y = water aeration, z = oil
  @location(2)       heat   : f32,         // v25.57 bath: temperature (0 when off)
};

fn quadCorner(vid : u32) -> vec2<f32> {
  var c = vec2<f32>(-1.0, -1.0);
  if (vid == 1u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 2u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 3u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 4u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 5u) { c = vec2<f32>( 1.0,  1.0); }
  return c;
}

@vertex
fn vs(@builtin(vertex_index)   vid : u32,
      @builtin(instance_index) iid : u32) -> VOut {
  var out : VOut;
  let fl = flag[iid];
  let frozen = (fl >> 5u) & 1u;
  if (frozen != 0u) {
    out.pos    = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    out.uv     = vec2<f32>(0.0, 0.0);
    out.weight = vec3<f32>(0.0, 0.0, 0.0);
    out.heat   = 0.0;
    return out;
  }
  let p = pos[iid];
  // v24.155 — density-scaled size RESTORED (v24.154 removed it and the
  // lake interior went "static TV": the merged body field NEEDS the fat
  // overlapping splats to stay past threshold between particles). The
  // actual stray bug was STALENESS: a sleeping particle skips the
  // pressure pass, so a stray that once slept dense kept its interior
  // size forever — clamp SLEEPERS to nominal instead. Inside a body the
  // merged field dwarfs per-splat size, so lakes are unchanged; the
  // stranded-speck residue itself now EVAPORATES (070 orphan pass).
  let density = aux[iid].x;
  let dn = density * INV_DENSITY;
  // v24.163 — SIZE BY ISOLATION (aggressive). The splat size that merges
  // the body is the same size that makes a lone SPLASH particle a fat disc;
  // the only honest cure is to size each particle by how densely surrounded
  // it is. Body (dn>=1, at/above rest density) keeps the full 1.5 so the
  // merged surface is unchanged (no static-TV — that came from shrinking the
  // BODY, not the strays). Below rest density it now falls off as dn^3
  // (was the gentler dn^2): a surface/splash particle at 0.7 density goes
  // from a ~2px-radius blob to a speck (0.7^3*1.5 = 0.51 vs the old 0.84),
  // so as a particle separates from the body and its density drops, it
  // shrinks toward a droplet within a frame instead of poking out fat.
  let dnc = clamp(dn, 0.0, 1.0);
  var d = select(1.5 * dnc * dnc * dnc, 1.5, dn >= 1.0);
  let sleepBit = (fl >> 4u) & 1u;
  if (sleepBit != 0u) { d = min(d, 1.0); }
  let isOil = (fl & 3u) == 1u;
  // v24.179 — gate the size by REAL neighbour count (water only; oil keeps its
  // own look). The density-based size above says a jet-stranded single particle
  // is full size; counting its actual neighbours (the 3x3 grid cell-count)
  // sizes it down to a speck instead, while the body interior (~36) is
  // unaffected. The 1-cell in-bounds margin keeps the 3x3 fetch safe; off-grid
  // keeps full size.
  if (!isOil) {
    // v24.180 — look up the cell at the PRE-STEP position (aux.zw), NOT the
    // post-move render position (p.xy). The grid cell counts were built from
    // the pre-step positions (buildGrid runs before g2p moves the particle),
    // so a FAST particle whose render position is >1 cell from where it was
    // counted would read an empty cell (nb 0) and slip through the gate at full
    // size — exactly the jet-flung giants. The slow body barely moves, so this
    // was invisible in the harness. aux.zw is the pre-step world pos g2p stashed.
    let gpx = aux[iid].z;
    let gpy = aux[iid].w;
    let cgx = i32(floor(gpx / NB_CELL)) - bitcast<i32>(gpc.originX);
    let cgy = i32(floor(gpy / NB_CELL)) - bitcast<i32>(gpc.originY);
    let gw = i32(gpc.gridW);
    let gh = i32(gpc.gridH);
    if (cgx >= 1 && cgy >= 1 && cgx < gw - 1 && cgy < gh - 1) {
      var nb : u32 = 0u;
      for (var ddy = -1; ddy <= 1; ddy = ddy + 1) {
        let rowb = (cgy + ddy) * gw + cgx;
        nb = nb + cellCnt[u32(rowb - 1)] + cellCnt[u32(rowb)] + cellCnt[u32(rowb + 1)];
      }
      // Looked up at the grid-build position, a real particle always counts its
      // own cell, so nb >= 1; nb 0 means a truly stale grid (boot) — keep full.
      if (nb >= 1u) { d = d * clamp(f32(nb) / NB_FULL, 0.0, 1.0); }
    }
  }
  let sizeBase = select(rp.sizeBaseWater, rp.sizeBaseOil, isOil);
  var pointSize = sizeBase * d * rp.surf.z;
  pointSize = max(pointSize, 0.8);   // v24.158 — was 1.15; let very-sparse strays be specks (body is far above this)
  let halfPx = pointSize * 0.5;
  let scrX = (p.x - rp.camX) * rp.dpws;
  let scrY = (p.y - rp.camY) * rp.dpws;
  let corner = quadCorner(vid);
  let devX = scrX + corner.x * halfPx;
  let devY = scrY + corner.y * halfPx;
  out.pos = vec4<f32>(devX / (rp.canvasW * 0.5) - 1.0,
                      1.0 - devY / (rp.canvasH * 0.5), 0.0, 1.0);
  out.uv  = corner;
  let aer = clamp(aux[iid].y, 0.0, 1.0);
  // v24.153 — foam needs MOTION: weight aeration by current speed so
  // clusters wedged in block corners (micro-jittering at ~10 px/s, which
  // regenerates aeration forever) can never glow; real churn at 50-300
  // px/s foams fully. Kills the owner's "white around corners of blocks"
  // at the source — static water is always the base colour.
  let spd = length(p.zw);
  let aerW = aer * clamp((spd - 12.0) / 68.0, 0.0, 1.0);
  if (isOil) {
    out.weight = vec3<f32>(0.0, 0.0, 1.0);
    out.heat   = 0.0;
  } else {
    out.weight = vec3<f32>(1.0, aerW, 0.0);
    // v25.57 bath: temperature from flag bits 24:31 (0 = ambient / bath off).
    out.heat   = f32((fl >> 24u) & 0xffu) / 127.5;
  }
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let w = clamp(1.0 - dot(in.uv, in.uv), 0.0, 1.0);
  if (w <= 0.0) { discard; }
  // Additive accumulation into the field: R water, G aeration, B oil, and
  // A = temperature-weighted (v25.57 bath). A stays 0 with the bath off, so
  // the composite's heat tint is a no-op then.
  return vec4<f32>(in.weight * w, in.heat * w);
}
`;

  var WGSL_SURFACE_COMPOSITE = /* wgsl */ `
@group(0) @binding(1) var fieldTex : texture_2d<f32>;
struct TerrainParams {
  c0:u32, gridW:u32, gridH:u32, originX:u32, originY:u32, c5:u32,
  stepDt:f32, invCell:f32,
  worldCols:f32, worldTile:f32, worldRows:f32, _pad0:f32,
  tileOrigC:u32, tileOrigR:u32, tileW:u32, tileH:u32,
  region:vec4<f32>,
};
@group(0) @binding(2) var<uniform> tp : TerrainParams;
@group(0) @binding(3) var<storage, read> compositeTerrainMask : array<u32>;

struct VOut {
  @builtin(position) pos : vec4<f32>,
};

fn compositeTerrainSolid(wp : vec2<f32>) -> bool {
  if (tp.worldTile <= 0.0) { return false; }
  let tc = i32(floor(wp.x / tp.worldTile)) - bitcast<i32>(tp.tileOrigC);
  let tr = i32(floor(wp.y / tp.worldTile)) - bitcast<i32>(tp.tileOrigR);
  if (tc < 0 || tr < 0 || tc >= i32(tp.tileW) || tr >= i32(tp.tileH)) { return false; }
  let idx = u32(tr) * tp.tileW + u32(tc);
  let word = compositeTerrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VOut {
  // Fullscreen triangle.
  var out : VOut;
  var p = vec2<f32>(-1.0, -1.0);
  if (vid == 1u) { p = vec2<f32>(3.0, -1.0); }
  else if (vid == 2u) { p = vec2<f32>(-1.0, 3.0); }
  out.pos = vec4<f32>(p, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let f = textureLoad(fieldTex, vec2<i32>(in.pos.xy), 0);
  let t = rp.surf.x;
  let s = max(rp.surf.y, 0.001);
  let aWaterEdge = smoothstep(t - s, t + s, f.r);
  let aOilEdge   = smoothstep(t - s, t + s, f.b);
  if (aWaterEdge <= 0.001 && aOilEdge <= 0.001) { discard; }
  // Clip the finished surface once per visible pixel. This uses the exact
  // bitmask collision reads, without paying a storage lookup for every
  // overlapping particle splat fragment.
  let wp = vec2<f32>(rp.camX + in.pos.x / max(rp.dpws, 0.001),
                     rp.camY + in.pos.y / max(rp.dpws, 0.001));
  if (compositeTerrainSolid(wp)) { discard; }
  // Water tint: foam fraction from the aeration-weighted channel.
  // v24.150 — foam needs a real BODY behind it; v24.152 softened (0.6t to
  // 1.6t) now that foam is light BLUE, not white: turbulence tint shows in
  // wave crests and churn like the reference demo, while lone droplets
  // still read as plain water.
  let bodyK = smoothstep(t * 0.6, t * 1.6, f.r);
  let foam = clamp(f.g / max(f.r, 0.001), 0.0, 1.0) * bodyK;
  var waterRGB = mix(rp.waterColor.rgb, rp.waterFoam.rgb, foam);
  // v25.57 bath: warm the water by its mean temperature (field A / water
  // weight). f.a is 0 with the bath off, so heatN 0 -> no tint (byte-exact
  // old look). Tint fights foam so hot churn still reads as hot, not white.
  let heatN = clamp(f.a / max(f.r, 0.001), 0.0, 2.0);
  // v25.95: soft thermal ramp (1 - e^-kT). Temperature in the tub is nearly
  // bimodal, so a linear tint painted a hard border; the exponential gives
  // a wide warm halo around a hot core and the interface reads as a glow.
  let warmK = (1.0 - exp(-1.7 * heatN)) * rp.bathTint.w;
  let midRGB = mix(rp.waterColor.rgb, rp.bathTint.rgb, 0.45) * 1.08;
  waterRGB = mix(waterRGB, midRGB, clamp(warmK * 1.6, 0.0, 1.0));
  waterRGB = mix(waterRGB, rp.bathTint.rgb, clamp(warmK * warmK, 0.0, 1.0));
  var outA = aWaterEdge * rp.waterColor.a;
  var outRGB = waterRGB * outA;
  // Oil composites over water.
  let oilA = aOilEdge * rp.oilColor.a;
  outRGB = outRGB * (1.0 - oilA) + rp.oilColor.rgb * oilA;
  outA   = outA   * (1.0 - oilA) + oilA;
  return vec4<f32>(outRGB, outA);
}
`;

  /* ---- WGSL — DROPLET pass (v26.16) ----------------------------------
   * "It is dumb to render particles but not have them visible" (the
   * owner). The old pass guessed visibility from PRE-STEP neighbour count.
   * A fast sheet could count as supported, separate during G2P, then miss
   * the merged surface threshold while the droplet pass also culled it.
   * This pass now samples the ACTUAL post-render density field at each
   * particle centre. A particle whose centre is already covered by the
   * composite gets no extra draw; one in a thin sheet, spray, or isolation
   * gets a compact velocity-aligned mark (~2 px wide and up to 8 px long,
   * never density-scaled). The two
   * render paths are complementary by construction, without drawing dots
   * through the interior of a pool. Water only; the legacy disc renderer
   * already draws everything. gm water.DROPLETS.
   * ------------------------------------------------------------------ */
  var WGSL_SURFACE_DROPLETS = /* wgsl */ `
@group(0) @binding(1) var<storage, read> pos  : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> flag : array<u32>;
@group(0) @binding(4) var fieldTex : texture_2d<f32>;
struct TerrainParams {
  c0:u32, gridW:u32, gridH:u32, originX:u32, originY:u32, c5:u32,
  stepDt:f32, invCell:f32,
  worldCols:f32, worldTile:f32, worldRows:f32, _pad0:f32,
  tileOrigC:u32, tileOrigR:u32, tileW:u32, tileH:u32,
  region:vec4<f32>,
};
@group(0) @binding(5) var<uniform> tp : TerrainParams;
@group(0) @binding(6) var<storage, read> dropTerrainMask : array<u32>;

struct VOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       uv    : vec2<f32>,
  @location(1)       alpha : f32,
  @location(2)       world : vec2<f32>,
};

fn dropletTerrainSolid(wp : vec2<f32>) -> bool {
  if (tp.worldTile <= 0.0) { return false; }
  let tc = i32(floor(wp.x / tp.worldTile)) - bitcast<i32>(tp.tileOrigC);
  let tr = i32(floor(wp.y / tp.worldTile)) - bitcast<i32>(tp.tileOrigR);
  if (tc < 0 || tr < 0 || tc >= i32(tp.tileW) || tr >= i32(tp.tileH)) { return false; }
  let idx = u32(tr) * tp.tileW + u32(tc);
  let word = dropTerrainMask[idx >> 5u];
  return ((word >> (idx & 31u)) & 1u) != 0u;
}

fn corner(vid : u32) -> vec2<f32> {
  var c = vec2<f32>(-1.0, -1.0);
  if (vid == 1u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 2u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 3u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 4u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 5u) { c = vec2<f32>( 1.0,  1.0); }
  return c;
}

@vertex
fn vs(@builtin(vertex_index)   vid : u32,
      @builtin(instance_index) iid : u32) -> VOut {
  var out : VOut;
  out.pos = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  out.uv  = vec2<f32>(0.0, 0.0);
  out.alpha = 0.0;
  out.world = vec2<f32>(0.0, 0.0);
  let fl = flag[iid];
  let frozen = (fl >> 5u) & 1u;
  let isOil  = (fl & 3u) == 1u;
  if (frozen != 0u || isOil) { return out; }
  let p = pos[iid];
  let scrX = (p.x - rp.camX) * rp.dpws;
  let scrY = (p.y - rp.camY) * rp.dpws;
  if (scrX < 0.0 || scrY < 0.0 || scrX >= rp.canvasW || scrY >= rp.canvasH) { return out; }
  let dims = vec2<i32>(textureDimensions(fieldTex));
  let samplePx = clamp(vec2<i32>(floor(vec2<f32>(scrX, scrY) + 0.5)),
                       vec2<i32>(0), dims - vec2<i32>(1));
  let field = textureLoad(fieldTex, samplePx, 0);
  let surfaceA = smoothstep(rp.surf.x - max(rp.surf.y, 0.001),
                            rp.surf.x + max(rp.surf.y, 0.001), field.r);
  // Fully exposed centres get a full drop. Fade through partially covered
  // film so the pass fills holes without stippling an already solid body.
  let a = 1.0 - smoothstep(0.25, 0.70, surfaceA);
  if (a <= 0.01) { return out; }
  // Slow drops stay compact. Moving spray becomes a short ellipse aligned
  // with its real velocity. This connects a narrow pour visually without
  // restoring wide circular halos.
  let speed = length(p.zw);
  var along = vec2<f32>(0.0, 1.0);
  if (speed > 0.5) { along = p.zw / speed; }
  let across = vec2<f32>(-along.y, along.x);
  let widthPx = max(2.0 * rp.dpws, 2.2);
  let lengthWorld = 2.2 + 5.8 * clamp(speed / 240.0, 0.0, 1.0);
  let lengthPx = max(lengthWorld * rp.dpws, widthPx);
  let halfW = widthPx * 0.5;
  let halfL = lengthPx * 0.5;
  let c = corner(vid);
  let devOff = across * c.x * halfW + along * c.y * halfL;
  out.pos = vec4<f32>((scrX + devOff.x) / (rp.canvasW * 0.5) - 1.0,
                      1.0 - (scrY + devOff.y) / (rp.canvasH * 0.5), 0.0, 1.0);
  out.uv = c;
  out.alpha = a * 0.92 * rp.waterColor.a;
  out.world = p.xy + devOff / max(rp.dpws, 0.001);
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  if (dropletTerrainSolid(in.world)) { discard; }
  let r2 = dot(in.uv, in.uv);
  if (r2 >= 1.0) { discard; }
  let a = smoothstep(0.0, 0.45, 1.0 - r2) * in.alpha;
  // A trace of foam tint keeps a two-pixel airborne drop legible against
  // dark terrain while preserving the base-water identity.
  let dropRGB = mix(rp.waterColor.rgb, rp.waterFoam.rgb, 0.22);
  return vec4<f32>(dropRGB * a, a);
}
`;

  /* ---- WGSL — PARTICLE PROOF dots (v24.160) --------------------------
   * Draws ONE small hard dot per particle at its true centre — no density
   * scaling, no metaball merge — coloured by a per-index hash, on top of
   * the normal water. The owner's diagnostic: a "giant particle" that is
   * really one particle shows a lone dot; one that is a merged cluster
   * shows a dense speckle of many differently-coloured dots filling the
   * circle. Reuses the render bind group (params/pos/aux/flag).
   * ------------------------------------------------------------------ */
  var WGSL_DBG_DOTS = WGSL_SURFACE_COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read> dpos  : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> daux  : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> dflag : array<u32>;

struct DOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
  @location(1)       col : vec3<f32>,
};

fn dcorner(vid : u32) -> vec2<f32> {
  var c = vec2<f32>(-1.0, -1.0);
  if (vid == 1u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 2u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 3u) { c = vec2<f32>(-1.0,  1.0); }
  else if (vid == 4u) { c = vec2<f32>( 1.0, -1.0); }
  else if (vid == 5u) { c = vec2<f32>( 1.0,  1.0); }
  return c;
}

@vertex
fn vs(@builtin(vertex_index) vid : u32, @builtin(instance_index) iid : u32) -> DOut {
  var o : DOut;
  let fl = dflag[iid];
  if (((fl >> 5u) & 1u) != 0u) {              // frozen -> clip offscreen
    o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    o.uv  = vec2<f32>(0.0, 0.0);
    o.col = vec3<f32>(0.0, 0.0, 0.0);
    return o;
  }
  let p = dpos[iid];
  let half = 1.8;                              // fixed device px — hard dot, no scaling
  let scrX = (p.x - rp.camX) * rp.dpws;
  let scrY = (p.y - rp.camY) * rp.dpws;
  let cc = dcorner(vid);
  let dx = scrX + cc.x * half;
  let dy = scrY + cc.y * half;
  o.pos = vec4<f32>(dx / (rp.canvasW * 0.5) - 1.0, 1.0 - dy / (rp.canvasH * 0.5), 0.0, 1.0);
  o.uv  = cc;
  let h = iid * 2654435761u;                   // distinct bright colour per particle index
  let hv = vec3<f32>(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0;
  o.col = vec3<f32>(0.35, 0.35, 0.35) + 0.65 * hv;
  return o;
}

@fragment
fn fs(i : DOut) -> @location(0) vec4<f32> {
  if (dot(i.uv, i.uv) > 1.0) { discard; }      // round dot
  return vec4<f32>(i.col, 1.0);
}
`;

  /* ---- Stage 2 — pipelines + bind group ------------------------------
   * One bind-group layout shared by all 6 grid kernels (the Params
   * uniform + 7 storage bindings). countCells reads pos; scanLocal /
   * scanBlocks / scanAdd touch cellCount/cellStart/blockSums; scatter
   * touches cellCursor/cellOf/sortedIdx — declaring them all in one
   * layout keeps a single bind group for the whole buildGrid encoder.
   * -------------------------------------------------------------------- */
  function buildGridPipelines(instance) {
    var dev = instance.device;
    // v15.0 — the sparse kernels put 10 storage buffers on the grid layout
    // (the dense chain's own high-water mark is the 9-buffer P2G layout, so
    // in practice any device running the GPU path at all clears 10). On a
    // device that genuinely caps at 8-9 the layout stays at 8 entries, the
    // sparse pipelines are skipped and the dense path drives — same
    // graceful-degradation pattern as buildP2GPipelines.
    var lim = (dev.limits && dev.limits.maxStorageBuffersPerShaderStage) || 8;
    instance.sparseCapable = lim >= 10;
    if (!instance.sparseCapable) {
      try {
        console.log('LiquidWGPU v15: device maxStorageBuffersPerShaderStage=' +
          lim + ' < 10 — sparse block grid unavailable, dense grid drives.');
      } catch (_) {}
    }
    var entries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ];
    if (instance.sparseCapable) {
      entries.push(
        { binding: 8,  visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9,  visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
      );
    }
    var bgl = dev.createBindGroupLayout({ label: 'liquid.gridBGL', entries: entries });
    var layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    function pipe(label, body) {
      return dev.createComputePipeline({
        label: label,
        layout: layout,
        compute: {
          module: dev.createShaderModule({ code: WGSL_GRID_COMMON + body }),
          entryPoint: 'main'
        }
      });
    }
    instance.pipe = {
      clearCells: pipe('liquid.clearCells', WGSL_CLEAR),
      countCells: pipe('liquid.countCells', WGSL_COUNT),
      scanLocal:  pipe('liquid.scanLocal',  WGSL_SCAN_LOCAL),
      scanBlocks: pipe('liquid.scanBlocks', WGSL_SCAN_BLOCKS),
      scanAdd:    pipe('liquid.scanAdd',    WGSL_SCAN_ADD),
      scatter:    pipe('liquid.scatter',    WGSL_SCATTER)
    };
    // v15.0 — the sparse block pipelines (grid-layout share). Wrapped so a
    // WGSL compile failure only disables the sparse path, never the grid.
    instance.sparseGridOK = false;
    if (instance.sparseCapable) {
      try {
        instance.pipe.countCellsMark   = pipe('liquid.countCellsMark',   WGSL_COUNT_MARK);
        instance.pipe.bitmapReset      = pipe('liquid.bitmapReset',      WGSL_BITMAP_RESET);
        instance.pipe.blockCompact     = pipe('liquid.blockCompact',     WGSL_BLOCK_COMPACT);
        instance.pipe.scanLocalSparse  = pipe('liquid.scanLocalSparse',  WGSL_SCAN_LOCAL_SPARSE);
        instance.pipe.scanBlocksSparse = pipe('liquid.scanBlocksSparse', WGSL_SCAN_BLOCKS_SPARSE);
        instance.pipe.scanAddSparse    = pipe('liquid.scanAddSparse',    WGSL_SCAN_ADD_SPARSE);
        instance.pipe.clearCountSparse = pipe('liquid.clearCountSparse', WGSL_CLEAR_COUNT_SPARSE);
        instance.sparseGridOK = true;
      } catch (eSp) {
        try { console.log('LiquidWGPU v15: sparse grid pipelines failed (' + ((eSp && eSp.message) || eSp) + ') — dense grid drives.'); } catch (_) {}
      }
    }
    var bgEntries = [
      { binding: 0, resource: { buffer: instance.paramsBuf } },
      { binding: 1, resource: { buffer: instance.buf.pos } },
      { binding: 2, resource: { buffer: instance.buf.cellCount } },
      { binding: 3, resource: { buffer: instance.buf.cellStart } },
      { binding: 4, resource: { buffer: instance.buf.cellCursor } },
      { binding: 5, resource: { buffer: instance.buf.blockSums } },
      { binding: 6, resource: { buffer: instance.buf.cellOf } },
      { binding: 7, resource: { buffer: instance.buf.sortedIdx } }
    ];
    if (instance.sparseCapable) {
      bgEntries.push(
        { binding: 8,  resource: { buffer: instance.buf.blockBitmap } },
        { binding: 9,  resource: { buffer: instance.buf.blockList } },
        { binding: 10, resource: { buffer: instance.buf.blockMeta } }
      );
    }
    instance.bg = {
      grid: dev.createBindGroup({
        label: 'liquid.gridBG',
        layout: bgl,
        entries: bgEntries
      })
    };
    instance.gridReady = true;
  }

  /* ---- Stage 3 — P2G pipelines + bind group --------------------------
   * The 3 P2G kernels share one bind-group layout: the Params uniform
   * (binding 0), the 4 read-only particle buffers (pos/affine/aux/flag,
   * bindings 1-4) and the 5 read_write fixed-point cell accumulators
   * (bindings 5-9). Separate from the grid layout because P2G needs the
   * affine + aux + flag buffers the count-sort never touches.
   * -------------------------------------------------------------------- */
  // P2G needs 9 storage buffers bound in one compute stage. WebGPU only
  // guarantees 8 (the spec default / minimum). initDevice requests the
  // adapter's full maxStorageBuffersPerShaderStage, but a device that
  // genuinely caps below 9 cannot run this layout — bail cleanly and
  // leave p2gReady=false so the CPU solver keeps driving.
  var P2G_STORAGE_BUFFERS = 9;

  function buildP2GPipelines(instance) {
    var dev = instance.device;
    var lim = (dev.limits && dev.limits.maxStorageBuffersPerShaderStage) || 8;
    if (lim < P2G_STORAGE_BUFFERS) {
      try {
        console.log('LiquidWGPU Stage 3: device maxStorageBuffersPerShaderStage=' +
          lim + ' < ' + P2G_STORAGE_BUFFERS + ' — P2G unavailable, CPU solver stays.');
      } catch (_) {}
      return;
    }
    var entries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ];
    // v15.0 — the sparse variants (indirect normalize + the end-of-sub-step
    // accumulator clear) read the active-block list at binding 10.
    if (instance.sparseCapable) {
      entries.push({ binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    }
    var bgl = dev.createBindGroupLayout({ label: 'liquid.p2gBGL', entries: entries });
    var layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    function pipe(label, body) {
      return dev.createComputePipeline({
        label: label,
        layout: layout,
        compute: {
          module: dev.createShaderModule({ code: WGSL_P2G_COMMON + body }),
          entryPoint: 'main'
        }
      });
    }
    instance.p2gPipe = {
      clear:     pipe('liquid.p2gClear',     WGSL_P2G_CLEAR),
      scatter:   pipe('liquid.p2gScatter',   WGSL_P2G_SCATTER),
      normalize: pipe('liquid.p2gNormalize', WGSL_P2G_NORMALIZE)
    };
    instance.sparseP2GOK = false;
    if (instance.sparseCapable) {
      try {
        instance.p2gPipe.normalizeSparse = pipe('liquid.p2gNormalizeSparse',
          sparseListBind(10) + cellEntrySparse(WGSL_P2G_NORMALIZE_BODY));
        instance.p2gPipe.clearSparse = pipe('liquid.p2gClearSparse',
          sparseListBind(10) + cellEntrySparse(WGSL_CLEAR_P2G_SPARSE_BODY));
        instance.sparseP2GOK = true;
      } catch (eSp) {
        try { console.log('LiquidWGPU v15: sparse P2G pipelines failed (' + ((eSp && eSp.message) || eSp) + ') — dense grid drives.'); } catch (_) {}
      }
    }
    var bgEntries = [
      { binding: 0, resource: { buffer: instance.paramsBuf } },
      { binding: 1, resource: { buffer: instance.buf.pos } },
      { binding: 2, resource: { buffer: instance.buf.affine } },
      { binding: 3, resource: { buffer: instance.buf.aux } },
      { binding: 4, resource: { buffer: instance.buf.flag } },
      { binding: 5, resource: { buffer: instance.buf.cellMass } },
      { binding: 6, resource: { buffer: instance.buf.cellOilMass } },
      { binding: 7, resource: { buffer: instance.buf.cellAeration } },
      { binding: 8, resource: { buffer: instance.buf.cellVX } },
      { binding: 9, resource: { buffer: instance.buf.cellVY } }
    ];
    if (instance.sparseCapable) {
      bgEntries.push({ binding: 10, resource: { buffer: instance.buf.blockList } });
    }
    instance.p2gBG = dev.createBindGroup({
      label: 'liquid.p2gBG',
      layout: bgl,
      entries: bgEntries
    });
    instance.p2gReady = true;
  }

  /* ---- Stage 4 — pressure + grid-update pipelines --------------------
   * Two bind-group layouts (see WGSL_GRID2_PRELUDE comment): the pressure
   * layout (7 storage buffers) drives clearDV + gridPressure; the grid-
   * update layout (8 storage buffers) drives gridUpdate. Both stay within
   * the 8-storage-buffer WebGPU floor, so unlike the P2G layout no extra
   * device-limit check is needed. Gated on p2gReady — the Stage-4 kernels
   * read the P2G cell accumulators, so without the P2G pipelines there is
   * nothing to pressure-solve.
   * -------------------------------------------------------------------- */
  function buildGrid2Pipelines(instance) {
    if (!instance.p2gReady) {
      try { console.log('LiquidWGPU Stage 4: P2G unavailable — pressure/grid kernels skipped, CPU solver stays.'); } catch (_) {}
      return;
    }
    var dev = instance.device;

    // --- pressure layout: uniform + 7 storage buffers (bindings 1..7)
    //     + the v14.26 SimParams uniform (binding 8). SimParams is a second
    //     UNIFORM — uniforms have their own per-stage limit, so the
    //     8-storage-buffer floor is untouched. clearDV shares the layout
    //     but does not reference `sp`; gridPressure reads it. ---
    var pEntries = [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        // v25.56 BATH B1: the heat accumulator. 8 storage buffers dense,
        // 9 sparse (with blockList below): both within what the dense (9
        // via P2G) and sparse (10) chains already require, so no new
        // device-limit gate is needed.
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ];
    if (instance.sparseCapable) {
      // The sparse heat normalize/clear variants read blockList at 10.
      pEntries.push({ binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    }
    var pBgl = dev.createBindGroupLayout({
      label: 'liquid.pressureBGL',
      entries: pEntries
    });
    var pLayout = dev.createPipelineLayout({ bindGroupLayouts: [pBgl] });
    function pPipe(label, body) {
      return dev.createComputePipeline({
        label: label,
        layout: pLayout,
        compute: {
          // v14.26 — the SimParams struct + its binding (8) appended after
          // the pressure buffer header so gridPressure can read `sp`.
          module: dev.createShaderModule({
            code: WGSL_GRID2_PRELUDE + WGSL_PRESSURE_BUFS +
                  WGSL_SIM_PARAMS + simBind(8) + body
          }),
          entryPoint: 'main'
        }
      });
    }

    // --- grid-update layout: uniform + 8 storage buffers (bindings 1..8)
    //     + the Stage-8 GameParams uniform (binding 9) + the v14.26
    //     SimParams uniform (binding 10). Both GameParams and SimParams are
    //     UNIFORMs — uniforms have their own per-stage limit, so the
    //     8-storage-buffer floor is untouched. ---
    var uEntries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
    ];
    // v15.0 — the sparse gridUpdate + the end-of-sub-step DV/velocity clear
    // read the active-block list at binding 11 (a 9th storage buffer; the
    // dense chain already requires 9 via the P2G layout).
    if (instance.sparseCapable) {
      uEntries.push({ binding: 11, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    }
    // v15.1 — the terrain mask for the rocket-wake occlusion march
    // (wakeLineClear). Read-only; same buffer the boundary/collide layouts
    // bind. Dense layout lands at 9 storage buffers (the GPU path already
    // requires 9 via P2G), sparse at 10 (already required).
    uEntries.push({ binding: 12, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    var uBgl = dev.createBindGroupLayout({
      label: 'liquid.gridUpdateBGL',
      entries: uEntries
    });
    var uLayout = dev.createPipelineLayout({ bindGroupLayouts: [uBgl] });
    // GameParams binding line for the grid-update layout (binding 9).
    var gameBindGrid = '\n@group(0) @binding(9) var<uniform> gameP : GameParams;\n';

    function uPipe(label, code) {
      return dev.createComputePipeline({
        label: label,
        layout: uLayout,
        compute: {
          module: dev.createShaderModule({ code: code }),
          entryPoint: 'main'
        }
      });
    }
    instance.grid2Pipe = {
      clearDV:    pPipe('liquid.clearDV',      WGSL_DV_CLEAR),
      pressure:   pPipe('liquid.gridPressure', WGSL_GRID_PRESSURE),
      // v25.56 BATH B1: per-cell heat mass-normalize (pressure layout).
      heatNormalize: pPipe('liquid.heatNormalize', cellEntryDense(WGSL_HEAT_NORMALIZE_BODY)),
      // Stage 8 — gridUpdate carries the game-coupled wake code: the
      // GameParams struct + binding + gridWake() before the kernel body
      // that calls it. v14.26 — the SimParams struct + its binding (10)
      // so the kernel can read `sp` (live gravity). v15.1 — the wake
      // terrain block (binding 12 + wakeLineClear) for plume occlusion.
      gridUpdate: uPipe('liquid.gridUpdate',
        WGSL_GRID2_PRELUDE + WGSL_GRIDUPDATE_BUFS +
        WGSL_GAME_PARAMS + gameBindGrid +
        WGSL_GUEST_GEOMETRY +
        WGSL_SIM_PARAMS + simBind(10) +
        WGSL_WAKE_TERRAIN + WGSL_GRID_WAKE +
        WGSL_GRID_UPDATE)
    };
    instance.sparseGrid2OK = false;
    if (instance.sparseCapable) {
      try {
        // v15.0 — same physics text as the dense gridUpdate, sparse entry.
        instance.grid2Pipe.gridUpdateSparse = uPipe('liquid.gridUpdateSparse',
          WGSL_GRID2_PRELUDE + WGSL_GRIDUPDATE_BUFS +
          WGSL_GAME_PARAMS + gameBindGrid +
          WGSL_GUEST_GEOMETRY +
          WGSL_SIM_PARAMS + simBind(10) +
          WGSL_WAKE_TERRAIN + WGSL_GRID_WAKE +
          WGSL_GRID_UPDATE_HELPERS + sparseListBind(11) +
          cellEntrySparse(WGSL_GRID_UPDATE_BODY));
        // v15.0 — end-of-sub-step clear, grid2-layout share (DV + vel).
        instance.grid2Pipe.clearGrid2Sparse = uPipe('liquid.clearGrid2Sparse',
          WGSL_GRID2_PRELUDE + WGSL_GRIDUPDATE_BUFS +
          sparseListBind(11) +
          cellEntrySparse(WGSL_CLEAR_GRID2_SPARSE_BODY));
        // v25.56 BATH B1: sparse heat normalize + the pressure-layout
        // share of the end-of-sub-step clear (blockList at binding 10).
        instance.grid2Pipe.heatNormalizeSparse = pPipe('liquid.heatNormalizeSparse',
          sparseListBind(10) + cellEntrySparse(WGSL_HEAT_NORMALIZE_BODY));
        instance.grid2Pipe.heatClearSparse = pPipe('liquid.heatClearSparse',
          sparseListBind(10) + cellEntrySparse(WGSL_HEAT_CLEAR_SPARSE_BODY));
        instance.sparseGrid2OK = true;
      } catch (eSp) {
        try { console.log('LiquidWGPU v15: sparse grid2 pipelines failed (' + ((eSp && eSp.message) || eSp) + ') — dense grid drives.'); } catch (_) {}
      }
    }
    // Pressure bind group — note cellMass / cellAeration are bound as
    // plain 'storage' (read-only in WGSL via atomicLoad; the layout entry
    // is 'storage' because the buffers are atomic<i32>).
    var pBgEntries = [
        { binding: 0, resource: { buffer: instance.paramsBuf } },
        { binding: 1, resource: { buffer: instance.buf.pos } },
        { binding: 2, resource: { buffer: instance.buf.aux } },
        { binding: 3, resource: { buffer: instance.buf.flag } },
        { binding: 4, resource: { buffer: instance.buf.cellMass } },
        { binding: 5, resource: { buffer: instance.buf.cellAeration } },
        { binding: 6, resource: { buffer: instance.buf.cellDVX } },
        { binding: 7, resource: { buffer: instance.buf.cellDVY } },
        { binding: 8, resource: { buffer: instance.simParamsBuf } },
        { binding: 9, resource: { buffer: instance.buf.cellHeat } }   // v25.56 bath
    ];
    if (instance.sparseCapable) {
      pBgEntries.push({ binding: 10, resource: { buffer: instance.buf.blockList } });
    }
    instance.pressureBG = dev.createBindGroup({
      label: 'liquid.pressureBG',
      layout: pBgl,
      entries: pBgEntries
    });
    instance.gridUpdateBGs = [];
    for (var gbs = 0; gbs < GS_FRAME_SLOTS; gbs++) {
      var uBgEntries = [
        { binding: 0, resource: { buffer: instance.paramsBuf } },
        { binding: 1, resource: { buffer: instance.buf.cellMass } },
        { binding: 2, resource: { buffer: instance.buf.cellOilMass } },
        { binding: 3, resource: { buffer: instance.buf.cellVX } },
        { binding: 4, resource: { buffer: instance.buf.cellVY } },
        { binding: 5, resource: { buffer: instance.buf.cellDVX } },
        { binding: 6, resource: { buffer: instance.buf.cellDVY } },
        { binding: 7, resource: { buffer: instance.buf.cellVelX } },
        { binding: 8, resource: { buffer: instance.buf.cellVelY } },
        { binding: 9, resource: { buffer: instance.gameParamsBufs[gbs] } },
        { binding: 10, resource: { buffer: instance.simParamsBuf } }
      ];
      if (instance.sparseCapable) {
        uBgEntries.push({ binding: 11, resource: { buffer: instance.buf.blockList } });
      }
      uBgEntries.push({ binding: 12, resource: { buffer: instance.buf.terrainMask } });
      instance.gridUpdateBGs.push(dev.createBindGroup({
        label: 'liquid.gridUpdateBG.' + gbs,
        layout: uBgl,
        entries: uBgEntries
      }));
    }
    instance.gridUpdateBG = instance.gridUpdateBGs[0];

    // --- grid-boundary layout (v14.3): uniform + 5 storage buffers + the
    //     v14.26 SimParams uniform (binding 6). The tile-boundary
    //     reflection + floor/wall friction tail of the CPU liquidUpdateGrid,
    //     ported as its own kernel — gridUpdate's layout is already at the
    //     8-storage-buffer floor, and this kernel additionally needs the
    //     terrain mask. SimParams is a uniform, so the floor is untouched.
    //     v15.0 — the sparse variant reads blockList at binding 7. ---
    var bEntries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
    ];
    if (instance.sparseCapable) {
      bEntries.push({ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    }
    var bBgl = dev.createBindGroupLayout({
      label: 'liquid.gridBoundaryBGL',
      entries: bEntries
    });
    var bLayout = dev.createPipelineLayout({ bindGroupLayouts: [bBgl] });
    instance.grid2Pipe.gridBoundary = dev.createComputePipeline({
      label: 'liquid.gridBoundary',
      layout: bLayout,
      compute: {
        // v14.26 — the SimParams struct + its binding (6) prepended so the
        // boundary kernel reads the live wall-bounce / friction constants.
        module: dev.createShaderModule({
          code: WGSL_SIM_PARAMS + simBind(6) + WGSL_GRID_BOUNDARY
        }),
        entryPoint: 'main'
      }
    });
    if (instance.sparseCapable && instance.sparseGrid2OK) {
      try {
        instance.grid2Pipe.gridBoundarySparse = dev.createComputePipeline({
          label: 'liquid.gridBoundarySparse',
          layout: bLayout,
          compute: {
            module: dev.createShaderModule({
              code: WGSL_SIM_PARAMS + simBind(6) + WGSL_GRID_BOUNDARY_HEAD +
                    sparseListBind(7) + cellEntrySparse(WGSL_GRID_BOUNDARY_BODY)
            }),
            entryPoint: 'main'
          }
        });
      } catch (eSp) {
        instance.sparseGrid2OK = false;
        try { console.log('LiquidWGPU v15: sparse boundary pipeline failed (' + ((eSp && eSp.message) || eSp) + ') — dense grid drives.'); } catch (_) {}
      }
    }
    var bBgEntries = [
      { binding: 0, resource: { buffer: instance.paramsBuf } },
      { binding: 1, resource: { buffer: instance.buf.cellMass } },
      { binding: 2, resource: { buffer: instance.buf.cellOilMass } },
      { binding: 3, resource: { buffer: instance.buf.cellVelX } },
      { binding: 4, resource: { buffer: instance.buf.cellVelY } },
      { binding: 5, resource: { buffer: instance.buf.terrainMask } },
      { binding: 6, resource: { buffer: instance.simParamsBuf } }
    ];
    if (instance.sparseCapable) {
      bBgEntries.push({ binding: 7, resource: { buffer: instance.buf.blockList } });
    }
    instance.gridBoundaryBG = dev.createBindGroup({
      label: 'liquid.gridBoundaryBG',
      layout: bBgl,
      entries: bBgEntries
    });
    instance.grid2Ready = true;
  }

  // v15.0 — is the sparse block path driving this chain? All three sparse
  // pipeline shares must have built and the live lever must be on;
  // sparseVeto is runFrame's per-frame hybrid gate (small bboxes run the
  // dense chain — its cost is linear in cells, so under the threshold it
  // beats the sparse bookkeeping). Harness/self-test chains run before any
  // live frame (veto false) or after uploadParticles' denseClearAll, so
  // they exercise the lever-selected path either way.
  function useSparse(instance) {
    return !!(LIQUID_SPARSE && !instance.sparseVeto && instance.sparseGridOK &&
              instance.sparseP2GOK && instance.sparseGrid2OK);
  }

  /* Run the Stage-4 pressure + grid-update kernels in one command
   * encoder, chained after the P2G pass:
   *   clearDV    -> zero the cellDVX/cellDVY pressure-impulse accumulators
   *   gridPressure -> per particle: gather density/aeration, scatter the
   *                   pressure impulse into cellDVX/cellDVY
   *   gridUpdate -> per cell: resolve velocity from momentum + impulse,
   *                 add gravity, write cellVelX/cellVelY
   *   gridBoundary -> per cell: tile-boundary reflection + floor/wall
   *                 friction on the resolved velocity (v14.3)
   * Assumes runP2G() already populated cellMass/cellOilMass/cellAeration/
   * cellVX/cellVY for the current grid. */
  function runGrid2(instance, substepSlot) {
    if (!instance.grid2Ready) return;
    var g = instance.grid;
    if (!g || g.cells <= 0) return;
    var count = instance.uploadedCount | 0;
    var dev = instance.device;
    var P = instance.grid2Pipe;
    // v14.26 — refresh the live physics uniform before the pressure +
    // grid-update kernels read it. queue.writeBuffer is ordered before the
    // submit that follows (live batch or standalone), so the kernels see
    // the current LIQUID_* values.
    writeSimParams(instance);
    var cellGroups = Math.ceil(g.cells / WG);
    var partGroups = Math.max(1, Math.ceil(count / WG));
    var sparse = useSparse(instance);
    var enc = dev.createCommandEncoder({ label: 'liquid.runGrid2' });
    var cp = enc.beginComputePass({ label: 'liquid.grid2' });

    // 1. clearDV — zero the pressure-impulse accumulators over [0, cells).
    //    v15.0 sparse: SKIPPED — already zero (global-zero invariant).
    if (!sparse) {
      cp.setPipeline(P.clearDV);
      cp.setBindGroup(0, instance.pressureBG);
      cp.dispatchWorkgroups(cellGroups);
    }

    if (count > 0) {
      // 2. gridPressure — per awake particle: gather + scatter impulse.
      cp.setPipeline(P.pressure);
      cp.setBindGroup(0, instance.pressureBG);
      cp.dispatchWorkgroups(partGroups);
    }

    // 2b. heatNormalize, v25.56 BATH B1: mass-normalize the heat field
    //     the pressure pass splat. Dispatched only while the bath is live
    //     (non-bath players pay nothing; the kernel also self-gates).
    if (LIQUID_BATH_ON) {
      var hnSparse = sparse && P.heatNormalizeSparse;
      cp.setPipeline(hnSparse ? P.heatNormalizeSparse : P.heatNormalize);
      cp.setBindGroup(0, instance.pressureBG);
      if (hnSparse) { cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0); }
      else { cp.dispatchWorkgroups(cellGroups); }
    }

    // 3. gridUpdate — per cell: resolve velocity + gravity. v15.0 sparse:
    //    active blocks only (indirect); massy cells only exist there.
    cp.setPipeline(sparse ? P.gridUpdateSparse : P.gridUpdate);
    var gridUpdateBG = instance.gridUpdateBGs && instance.gridUpdateBGs[substepSlot | 0];
    cp.setBindGroup(0, gridUpdateBG || instance.gridUpdateBG);
    if (sparse) { cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0); }
    else { cp.dispatchWorkgroups(cellGroups); }

    // 4. gridBoundary — per cell: tile-boundary reflection + floor/wall
    //    friction on the resolved velocity (v14.3 — the CPU
    //    liquidUpdateGrid boundary tail, finally ported).
    cp.setPipeline(sparse ? P.gridBoundarySparse : P.gridBoundary);
    cp.setBindGroup(0, instance.gridBoundaryBG);
    if (sparse) { cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0); }
    else { cp.dispatchWorkgroups(cellGroups); }

    cp.end();
    liquidSubmit(instance, enc);
  }

  /* v15.0 — end-of-FRAME sparse clear: re-zero every cell buffer the LAST
   * sub-step dirtied, active blocks only (three indirect dispatches, one
   * per bind-group share). Together with buildGrid's clearPrev (which
   * handles sub-steps 2..N inside a frame, where the grid mapping is
   * constant) this maintains the global-zero invariant that lets the
   * sparse chain drop ALL its full-grid clear passes, and guarantees
   * reads that reach one cell past a stencil into a now-inactive block
   * (the viscosity gather) see true zeros. It must run before the next
   * frame recomputes the grid mapping — a deferred clear under a MOVED
   * origin/gridW would zero the wrong cells and leak dirt.
   * cellStart/cellCursor/sortedIdx are left as-is: they are only ever
   * read through segments of cells whose cellCount > 0. */
  function runSparseEndClear(instance) {
    if (!useSparse(instance)) return;
    var g = instance.grid;
    if (!g || g.cells <= 0) return;
    var dev = instance.device;
    var enc = dev.createCommandEncoder({ label: 'liquid.sparseEndClear' });
    var cp = enc.beginComputePass({ label: 'liquid.sparseEndClear' });
    cp.setPipeline(instance.pipe.clearCountSparse);
    cp.setBindGroup(0, instance.bg.grid);
    cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
    cp.setPipeline(instance.p2gPipe.clearSparse);
    cp.setBindGroup(0, instance.p2gBG);
    cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
    cp.setPipeline(instance.grid2Pipe.clearGrid2Sparse);
    cp.setBindGroup(0, instance.gridUpdateBG);
    cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
    // v25.56 BATH B1: pressure-layout share (cellHeat). Always cleared
    // when the pipe exists so a bath toggled off leaves no stale field.
    if (instance.grid2Pipe.heatClearSparse) {
      cp.setPipeline(instance.grid2Pipe.heatClearSparse);
      cp.setBindGroup(0, instance.pressureBG);
      cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
    }
    cp.end();
    liquidSubmit(instance, enc);
  }

  /* ---- Stage 5 — G2P pipeline + bind group ---------------------------
   * One bind-group layout (the Params uniform + 6 storage buffers): pos /
   * affine / aux / flag are read_write (the gather writes the new particle
   * state back), cellVelX / cellVelY are read-only (the resolved velocity
   * the Stage-4 gridUpdate produced). 7 storage bindings stay within the
   * 8-buffer WebGPU floor, so — like the Stage-4 pressure layout — no
   * extra device-limit check is needed. Gated on grid2Ready: G2P gathers
   * cellVelX/cellVelY, so without the Stage-4 grid-update pipeline there
   * is nothing to gather.
   * -------------------------------------------------------------------- */
  function buildG2PPipelines(instance) {
    if (!instance.grid2Ready) {
      try { console.log('LiquidWGPU Stage 5: pressure/grid unavailable — G2P kernel skipped, CPU solver stays.'); } catch (_) {}
      return;
    }
    var dev = instance.device;
    // 6 storage buffers (bindings 1..6) + the v14.26 SimParams uniform
    // (binding 7). SimParams is a uniform — the 8-storage-buffer floor is
    // untouched.
    var bgl = dev.createBindGroupLayout({
      label: 'liquid.g2pBGL',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        // v25.56 BATH B1: cellHeat (7 storage buffers, still within the
        // 8-storage-buffer WebGPU floor this layout has always relied on).
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
      ]
    });
    var layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    instance.g2pPipe = {
      gather: dev.createComputePipeline({
        label: 'liquid.g2pGather',
        layout: layout,
        compute: {
          // v14.26 — the SimParams struct + its binding (7) so the gather
          // reads the live motion-scale / damping / aeration constants.
          module: dev.createShaderModule({
            code: WGSL_G2P_PRELUDE + WGSL_SIM_PARAMS + simBind(7) +
                  WGSL_G2P_GATHER
          }),
          entryPoint: 'main'
        }
      })
    };
    instance.g2pBG = dev.createBindGroup({
      label: 'liquid.g2pBG',
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: instance.paramsBuf } },
        { binding: 1, resource: { buffer: instance.buf.pos } },
        { binding: 2, resource: { buffer: instance.buf.affine } },
        { binding: 3, resource: { buffer: instance.buf.aux } },
        { binding: 4, resource: { buffer: instance.buf.flag } },
        { binding: 5, resource: { buffer: instance.buf.cellVelX } },
        { binding: 6, resource: { buffer: instance.buf.cellVelY } },
        { binding: 7, resource: { buffer: instance.simParamsBuf } },
        { binding: 8, resource: { buffer: instance.buf.cellHeat } }   // v25.56 bath
      ]
    });
    instance.g2pReady = true;
  }

  /* ---- Stage 6 — collide pipeline + bind group -----------------------
   * One bind-group layout (the Params uniform + 4 storage buffers): pos is
   * read_write (the kernel reads the g2p-output position and writes the
   * collision-resolved one), aux is read_write (reads the g2p-stashed
   * pre-step position from .zw, may bump aeration .y), flag + terrainMask
   * are read-only. 4 storage bindings stay within the 8-buffer WebGPU
   * floor, so — like the Stage-5 G2P layout — no extra device-limit check
   * is needed. Gated on g2pReady: collide runs straight after g2p and
   * relies on the pre-step position g2p stashes into aux.zw.
   * -------------------------------------------------------------------- */
  function buildCollidePipelines(instance) {
    if (!instance.g2pReady) {
      try { console.log('LiquidWGPU Stage 6: G2P unavailable — collide kernel skipped, CPU solver stays.'); } catch (_) {}
      return;
    }
    var dev = instance.device;
    var bgl = dev.createBindGroupLayout({
      label: 'liquid.collideBGL',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        // Stage 8 — the GameParams uniform (binding 5) for the miner test.
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        // v14.26 — the SimParams uniform (binding 6) for live terrain bounce.
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
      ]
    });
    var layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    instance.collidePipe = {
      collide: dev.createComputePipeline({
        label: 'liquid.collideMove',
        layout: layout,
        compute: {
          // Stage 8 — WGSL_GAME_PARAMS prepended: the collide prelude's
          // binding-5 decl references the GameParams struct, and the
          // miner test in WGSL_COLLIDE reads its player lane + the miner
          // silhouette consts. v14.26 — the SimParams struct + its binding
          // (6) so WGSL_COLLIDE can read the live per-fluid restitution.
          module: dev.createShaderModule({
            code: WGSL_GAME_PARAMS + WGSL_COLLIDE_PRELUDE +
                  WGSL_GUEST_GEOMETRY +
                  WGSL_SIM_PARAMS + simBind(6) + WGSL_COLLIDE
          }),
          entryPoint: 'main'
        }
      })
    };
    instance.collideBGs = [];
    for (var cbs = 0; cbs < GS_FRAME_SLOTS; cbs++) {
      instance.collideBGs.push(dev.createBindGroup({
        label: 'liquid.collideBG.' + cbs,
        layout: bgl,
        entries: [
          { binding: 0, resource: { buffer: instance.paramsBuf } },
          { binding: 1, resource: { buffer: instance.buf.pos } },
          { binding: 2, resource: { buffer: instance.buf.aux } },
          { binding: 3, resource: { buffer: instance.buf.flag } },
          { binding: 4, resource: { buffer: instance.buf.terrainMask } },
          { binding: 5, resource: { buffer: instance.gameParamsBufs[cbs] } },
          { binding: 6, resource: { buffer: instance.simParamsBuf } }
        ]
      }));
    }
    instance.collideBG = instance.collideBGs[0];
    instance.collideReady = true;

    // v24.185 — min-separation (anti-clump) pipeline. Reuses the count-sort grid
    // (cellCount/cellStart/sortedIdx) built by buildGrid + pos (rw) + aux/flag.
    // Wrapped so a build failure leaves declumpReady false and the sim runs
    // exactly as before (the pass is simply skipped).
    try {
      var dclBGL = dev.createBindGroupLayout({
        label: 'liquid.declumpBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
        ]
      });
      instance.declumpPipe = dev.createComputePipeline({
        label: 'liquid.declump',
        layout: dev.createPipelineLayout({ bindGroupLayouts: [dclBGL] }),
        compute: { module: dev.createShaderModule({ code: WGSL_DECLUMP }), entryPoint: 'main' }
      });
      instance.declumpBG = dev.createBindGroup({
        label: 'liquid.declumpBG',
        layout: dclBGL,
        entries: [
          { binding: 0, resource: { buffer: instance.paramsBuf } },
          { binding: 1, resource: { buffer: instance.buf.pos } },
          { binding: 2, resource: { buffer: instance.buf.aux } },
          { binding: 3, resource: { buffer: instance.buf.flag } },
          { binding: 4, resource: { buffer: instance.buf.cellCount } },
          { binding: 5, resource: { buffer: instance.buf.cellStart } },
          { binding: 6, resource: { buffer: instance.buf.sortedIdx } },
          { binding: 7, resource: { buffer: instance.buf.terrainMask } }
        ]
      });
      instance.declumpReady = true;
    } catch (e) {
      instance.declumpReady = false;
      try { console.log('LiquidWGPU declump: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
    }
  }

  /* Run the Stage-5 G2P gather in one command encoder. One kernel — one
   * thread per particle, no clear/normalize passes (G2P only reads the
   * cell velocity + writes particle state). Assumes runGrid2() already
   * resolved cellVelX/cellVelY for the current grid. */
  function runG2P(instance) {
    if (!instance.g2pReady) return;
    var g = instance.grid;
    if (!g || g.cells <= 0) return;
    var count = instance.uploadedCount | 0;
    if (count <= 0) return;
    var dev = instance.device;
    // v14.26 — refresh the live physics uniform before the G2P gather
    // reads it (motion scale / damping / aeration feel).
    writeSimParams(instance);
    var enc = dev.createCommandEncoder({ label: 'liquid.runG2P' });
    var cp = enc.beginComputePass({ label: 'liquid.g2p' });
    cp.setPipeline(instance.g2pPipe.gather);
    cp.setBindGroup(0, instance.g2pBG);
    cp.dispatchWorkgroups(Math.max(1, Math.ceil(count / WG)));
    cp.end();
    liquidSubmit(instance, enc);
  }

  /* Run the Stage-6 collide kernel in one command encoder. One kernel —
   * one thread per particle; resolves terrain collision against the
   * uploaded terrainMask. Assumes runG2P() already wrote the new particle
   * positions + stashed the pre-step position into aux.zw, and that
   * computeTerrainBounds() + uploadTerrainMask() have pushed the tile rect
   * + mask. Chained as the final kernel of the per-frame step. */
  function runCollide(instance, substepSlot) {
    if (!instance.collideReady) return;
    var count = instance.uploadedCount | 0;
    if (count <= 0) return;
    var dev = instance.device;
    // v14.26 — refresh the live physics uniform before the collide kernel
    // reads the per-fluid terrain restitution (sp.coll).
    writeSimParams(instance);
    var enc = dev.createCommandEncoder({ label: 'liquid.runCollide' });
    var cp = enc.beginComputePass({ label: 'liquid.collide' });
    cp.setPipeline(instance.collidePipe.collide);
    var collideBG = instance.collideBGs && instance.collideBGs[substepSlot | 0];
    cp.setBindGroup(0, collideBG || instance.collideBG);
    cp.dispatchWorkgroups(Math.max(1, Math.ceil(count / WG)));
    cp.end();
    liquidSubmit(instance, enc);
  }

  // v24.185 — min-separation (anti-clump) dispatch. Runs after buildGrid (fresh
  // grid) each substep; the kernel itself early-returns for all but over-dense
  // knot particles, so this is cheap on a calm pond. Skipped entirely when off.
  function runDeclump(instance) {
    if (!instance.declumpReady || !LIQUID_DECLUMP_ON) return;
    var count = instance.uploadedCount | 0;
    if (count <= 0) return;
    var dev = instance.device;
    var enc = dev.createCommandEncoder({ label: 'liquid.runDeclump' });
    var cp = enc.beginComputePass({ label: 'liquid.declump' });
    cp.setPipeline(instance.declumpPipe);
    cp.setBindGroup(0, instance.declumpBG);
    cp.dispatchWorkgroups(Math.max(1, Math.ceil(count / WG)));
    cp.end();
    liquidSubmit(instance, enc);
  }

  /* ---- Stage 7 — liquidWGPUCanvas + render pipeline ------------------
   * The CPU liquid renderer (drawLiquidsWebGL in sluice.js)
   * draws particles onto a sibling <canvas> (liquidGLCanvas) layered over
   * the main game canvas at z-index 4 — composited natively by the
   * browser, no cross-context blit. Stage 7's liquidWGPUCanvas is that
   * canvas's WebGPU twin: created + DOM-inserted identically, configured
   * with the preferred format + premultiplied alpha, and drawn by an
   * instanced soft-disc render pipeline reading the GPU particle buffers
   * directly (zero CPU readback). It REPLACES liquidGLCanvas at the same
   * z-layer once renderActive flips on at Stage 8.
   * -------------------------------------------------------------------- */
  // Bottom-HUD clip — mirrors the CPU liquidGLConsoleClipPath (a clean
  // 36-px bottom inset so liquid never bleeds through the console HUD).
  var LIQUID_WGPU_HUD_INSET = 36;
  function liquidWGPUClipPath() {
    return 'inset(0px 0px ' + LIQUID_WGPU_HUD_INSET + 'px 0px)';
  }

  // Position + CSS-size the render canvas over the main viewport. The
  // shader works in cam-relative device px, so the canvas covers the
  // main canvas 1:1 (left/top 0). view.viewW/viewH are the CSS px size;
  // they fall back to the device px size if the caller omits them.
  function liquidWGPUPositionDOM(instance, view) {
    var cv = instance.renderCanvas;
    if (!cv) return;
    var cssW = (view && view.viewW) || cv.width;
    var cssH = (view && view.viewH) || cv.height;
    cv.style.left   = '0';
    cv.style.top    = '0';
    cv.style.width  = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.style.clipPath = liquidWGPUClipPath();
  }

  /* Build the Stage-7 render canvas + pipeline. Creates liquidWGPUCanvas
   * (a <canvas> with a webgpu context, sibling of the main game canvas at
   * z-index 4, exactly like liquidGLCanvas), the instanced soft-disc
   * render pipeline (reads pos/aux/flag as storage buffers in the vertex
   * shader), its bind group + the small RenderParams uniform. Gated on
   * buffersReady — the render pipeline binds buf.pos/aux/flag, so without
   * the Stage-1 particle buffers there is nothing to draw. Wrapped by the
   * caller so a WGSL compile failure leaves renderReady=false (the game
   * keeps the CPU renderer). create() supplies opts.mainCanvas so the
   * module can DOM-insert the sibling without reaching into the game IIFE;
   * if absent, the canvas is built detached (still drawable, just not
   * composited — the Stage-7 self-test does not need it on screen).
   */
  function buildRenderPipeline(instance) {
    if (!instance.buffersReady) {
      try { console.log('LiquidWGPU Stage 7: particle buffers unavailable — render pipeline skipped, CPU renderer stays.'); } catch (_) {}
      return;
    }
    if (typeof document === 'undefined') {
      try { console.log('LiquidWGPU Stage 7: no document — render pipeline skipped.'); } catch (_) {}
      return;
    }
    var dev = instance.device;

    // --- liquidWGPUCanvas — sibling of the main canvas, z-index 4 ---
    var main = instance.mainCanvas;
    var cv = document.createElement('canvas');
    // Match the main canvas device-pixel size (== how liquidGLCanvas is
    // sized). draw() resizes it to view.canvasW/H each frame anyway.
    cv.width  = (main && main.width)  || 1280;
    cv.height = (main && main.height) || 720;
    cv.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;z-index:4;display:block;';
    var ctx = cv.getContext('webgpu');
    if (!ctx) {
      try { console.log('LiquidWGPU Stage 7: webgpu canvas context unavailable — render skipped.'); } catch (_) {}
      return;
    }
    var fmt = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: dev, format: fmt, alphaMode: 'premultiplied' });
    if (main && main.parentElement) {
      main.parentElement.appendChild(cv);
    }
    instance.renderCanvas  = cv;
    instance.renderCtx     = ctx;
    instance.renderFormat  = fmt;

    // --- RenderParams uniform — 28 f32 lanes, 112 bytes ---
    // 8 scalars (32 B) + 3 vec4 colour fields (48 B) + the v24.113 surf
    // vec4 (16 B: threshold, softness, splat scale, on/off). The legacy
    // disc shader's struct only declares the first 80 bytes; binding the
    // larger buffer to it is valid (buffer >= struct).
    instance.renderParamsBuf = dev.createBuffer({
      label: 'liquid.renderParams',
      size: 112,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    instance.renderParamsHost = new Float32Array(28);

    // --- render bind group layout: uniform + 3 read-only particle bufs --
    var bgl = dev.createBindGroupLayout({
      label: 'liquid.renderBGL',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        // v24.179 — grid params + per-cell counts for the field pass's
        // neighbour-count size gate (only WGSL_SURFACE_FIELD reads these; the
        // legacy-disc + dbg-dots shaders that share this layout ignore them).
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
      ]
    });
    var mod = dev.createShaderModule({ code: WGSL_RENDER });
    instance.renderPipeline = dev.createRenderPipeline({
      label: 'liquid.renderPipeline',
      layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: {
        module: mod,
        entryPoint: 'fs',
        targets: [{
          format: fmt,
          // Straight alpha-over blend. The fragment outputs premultiplied
          // rgb (rgb*alpha) so the colour factor is `one`; this matches
          // the CPU GL renderer's SRC_ALPHA / ONE_MINUS_SRC_ALPHA over a
          // premultiplied-alpha context.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });
    instance.renderBG = dev.createBindGroup({
      label: 'liquid.renderBG',
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: instance.renderParamsBuf } },
        { binding: 1, resource: { buffer: instance.buf.pos } },
        { binding: 2, resource: { buffer: instance.buf.aux } },
        { binding: 3, resource: { buffer: instance.buf.flag } },
        // v24.179 — grid params + cell counts for the field-pass size gate.
        { binding: 4, resource: { buffer: instance.paramsBuf } },
        { binding: 5, resource: { buffer: instance.buf.cellCount } }
      ]
    });
    instance.renderReady = true;

    // --- v24.160 PARTICLE PROOF dots pipeline (debug overlay) ---
    // Reuses the render bind group layout (bgl) + swapchain format (fmt).
    // Wrapped so a build failure never takes down the live renderer.
    try {
      var dotMod = dev.createShaderModule({ code: WGSL_DBG_DOTS });
      instance.dbgDotsPipeline = dev.createRenderPipeline({
        label: 'liquid.dbgDots',
        layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        vertex: { module: dotMod, entryPoint: 'vs' },
        fragment: {
          module: dotMod,
          entryPoint: 'fs',
          targets: [{
            format: fmt,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
    } catch (eDot) {
      instance.dbgDotsPipeline = null;
      try { console.log('LiquidWGPU: dbg-dots pipeline build failed (' + ((eDot && eDot.message) || eDot) + ')'); } catch (_) {}
    }

    // --- Stage 7b — surface-render pipelines (v24.113) ---
    // Optional: any failure here leaves surfReady=false and the legacy
    // disc renderer keeps drawing; it must never take down Stage 7.
    try {
      var fieldMod = dev.createShaderModule({ code: WGSL_SURFACE_COMMON + WGSL_SURFACE_FIELD });
      instance.surfFieldPipeline = dev.createRenderPipeline({
        label: 'liquid.surfField',
        layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        vertex: { module: fieldMod, entryPoint: 'vs' },
        fragment: {
          module: fieldMod,
          entryPoint: 'fs',
          targets: [{
            format: 'rgba16float',
            // Pure additive accumulation of the splat weights.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
      instance.surfCompositeBGL = dev.createBindGroupLayout({
        label: 'liquid.surfCompositeBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
        ]
      });
      var compMod = dev.createShaderModule({ code: WGSL_SURFACE_COMMON + WGSL_SURFACE_COMPOSITE });
      instance.surfCompositePipeline = dev.createRenderPipeline({
        label: 'liquid.surfComposite',
        layout: dev.createPipelineLayout({ bindGroupLayouts: [instance.surfCompositeBGL] }),
        vertex: { module: compMod, entryPoint: 'vs' },
        fragment: {
          module: compMod,
          entryPoint: 'fs',
          targets: [{
            format: fmt,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
      instance.surfReady = true;
    } catch (eSurf) {
      instance.surfReady = false;
      try { console.log('LiquidWGPU Stage 7b: surface-render pipeline build failed (' + ((eSurf && eSurf.message) || eSurf) + '); legacy disc renderer stays.'); } catch (_) {}
    }

    // --- v26.16 field-coverage droplet pipeline (visible strays/spray) ---
    // Its own layout adds the completed density field as a vertex-stage
    // texture. A build failure only loses droplets, never the surface path.
    try {
      instance.surfDropletBGL = dev.createBindGroupLayout({
        label: 'liquid.surfDropletBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
        ]
      });
      var dropMod = dev.createShaderModule({ code: WGSL_SURFACE_COMMON + WGSL_SURFACE_DROPLETS });
      instance.surfDropletPipeline = dev.createRenderPipeline({
        label: 'liquid.surfDroplets',
        layout: dev.createPipelineLayout({ bindGroupLayouts: [instance.surfDropletBGL] }),
        vertex: { module: dropMod, entryPoint: 'vs' },
        fragment: {
          module: dropMod,
          entryPoint: 'fs',
          targets: [{
            format: fmt,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
    } catch (eDrop) {
      instance.surfDropletPipeline = null;
      instance.surfDropletBGL = null;
      try { console.log('LiquidWGPU: droplet pipeline build failed (' + ((eDrop && eDrop.message) || eDrop) + ')'); } catch (_) {}
    }
  }

  // (Re)create the offscreen field texture + the composite bind group when
  // the canvas size changes. Returns true when the surface path is usable.
  function ensureSurfaceTargets(instance, cw, ch) {
    if (!instance.surfReady) return false;
    if (instance.surfTex && instance.surfTexW === cw && instance.surfTexH === ch) return true;
    try {
      if (instance.surfTex) { try { instance.surfTex.destroy(); } catch (_) {} }
      instance.surfTex = instance.device.createTexture({
        label: 'liquid.surfField',
        size: { width: Math.max(1, cw), height: Math.max(1, ch) },
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      instance.surfTexView = instance.surfTex.createView();
      instance.surfTexW = cw;
      instance.surfTexH = ch;
      instance.surfCompositeBG = instance.device.createBindGroup({
        label: 'liquid.surfCompositeBG',
        layout: instance.surfCompositeBGL,
        entries: [
          { binding: 0, resource: { buffer: instance.renderParamsBuf } },
          { binding: 1, resource: instance.surfTexView },
          { binding: 2, resource: { buffer: instance.paramsBuf } },
          { binding: 3, resource: { buffer: instance.buf.terrainMask } }
        ]
      });
      if (instance.surfDropletBGL) {
        instance.surfDropletBG = instance.device.createBindGroup({
          label: 'liquid.surfDropletBG',
          layout: instance.surfDropletBGL,
          entries: [
            { binding: 0, resource: { buffer: instance.renderParamsBuf } },
            { binding: 1, resource: { buffer: instance.buf.pos } },
            { binding: 3, resource: { buffer: instance.buf.flag } },
            { binding: 4, resource: instance.surfTexView },
            { binding: 5, resource: { buffer: instance.paramsBuf } },
            { binding: 6, resource: { buffer: instance.buf.terrainMask } }
          ]
        });
      } else {
        instance.surfDropletBG = null;
      }
      return true;
    } catch (eTex) {
      instance.surfReady = false;
      try { console.log('LiquidWGPU Stage 7b: field texture build failed (' + ((eTex && eTex.message) || eTex) + '); legacy disc renderer stays.'); } catch (_) {}
      return false;
    }
  }

  /* Render the GPU particle buffer to liquidWGPUCanvas. `view` carries the
   * camera + canvas state: { camX, camY, dpr, worldScale, canvasW,
   * canvasH, viewW?, viewH?, count? }. Writes the RenderParams uniform,
   * resizes the canvas to view.canvasW/H if needed, and runs one render
   * pass (clear -> instanced soft-disc draw of `count` particles). The
   * pass clears the canvas each frame — as a DOM-layered canvas the
   * previous frame's pixels persist until overwritten (same reason the
   * CPU renderer always clears). Returns the drawn particle count. */
  function runRender(instance, view) {
    if (!instance.renderReady) return 0;
    view = view || {};
    var cv  = instance.renderCanvas;
    var ctx = instance.renderCtx;
    var dev = instance.device;
    // Resize to the requested device-pixel size (mirrors the CPU
    // renderer's per-frame canvas.width sync). A webgpu context tracks its
    // canvas size automatically — no reconfigure needed on resize.
    var cw = (view.canvasW | 0) || cv.width;
    var ch = (view.canvasH | 0) || cv.height;
    if (cv.width !== cw)  cv.width  = cw;
    if (cv.height !== ch) cv.height = ch;
    liquidWGPUPositionDOM(instance, view);

    // Live particle count to draw — clamp to the allocated buffer.
    var count = (typeof view.count === 'number')
      ? (view.count | 0)
      : (instance.uploadedCount | 0);
    if (count < 0) count = 0;
    if (count > instance.maxParticles) count = instance.maxParticles;

    // RenderParams — CPU-compute dpws + the per-fluid size bases so the
    // shader is a pure mul-add (== CPU drawLiquidsWebGL sizeBase chain).
    var dpws = (typeof view.dpws === 'number')
      ? view.dpws
      : ((view.dpr || 1) * (view.worldScale || 1));
    var sizeBase = LIQUID_RENDER_SIZE_BASE * dpws;
    var rh = instance.renderParamsHost;
    rh[0] = view.camX || 0;
    rh[1] = view.camY || 0;
    rh[2] = dpws;
    rh[3] = cw;
    rh[4] = ch;
    rh[5] = sizeBase * LIQUID_WATER_PARTICLE_SIZE;
    rh[6] = sizeBase * LIQUID_OIL_PARTICLE_SIZE;
    rh[7] = 0;
    // v14.25 — live fluid colours. Lanes 8..19 mirror the WGSL vec4 fields
    // waterColor / waterFoam / oilColor; setRenderParam() mutates these
    // module vars so the next frame picks up the new colour, no recompile.
    rh[8]  = LIQUID_WATER_R;      rh[9]  = LIQUID_WATER_G;
    rh[10] = LIQUID_WATER_B;     rh[11] = LIQUID_WATER_ALPHA;
    rh[12] = LIQUID_WATER_FOAM_R; rh[13] = LIQUID_WATER_FOAM_G;
    rh[14] = LIQUID_WATER_FOAM_B; rh[15] = 0;
    rh[16] = LIQUID_OIL_R;       rh[17] = LIQUID_OIL_G;
    rh[18] = LIQUID_OIL_B;       rh[19] = LIQUID_OIL_ALPHA;
    // v24.113 — surface-render params (threshold, softness, splat scale, on).
    rh[20] = LIQUID_SURFACE_THRESH;
    rh[21] = LIQUID_SURFACE_SOFT;
    rh[22] = LIQUID_SURFACE_RSCALE;
    rh[23] = LIQUID_SURFACE_RENDER;
    // v25.57 bath heat tint (lanes 24-27). Only the surface composite reads
    // it; with the bath off the field's heat alpha is 0, so it never applies.
    rh[24] = LIQUID_BATH_TINT_R;   rh[25] = LIQUID_BATH_TINT_G;
    rh[26] = LIQUID_BATH_TINT_B;   rh[27] = LIQUID_BATH_TINT_STR;
    instance.queue.writeBuffer(instance.renderParamsBuf, 0, rh);

    // v24.113 — surface render: splat the particles into the offscreen
    // density field, then composite it through the threshold. Falls back
    // to the legacy per-particle discs when toggled off or unavailable.
    var useSurface = LIQUID_SURFACE_RENDER >= 0.5 &&
      ensureSurfaceTargets(instance, cw, ch);

    var enc = dev.createCommandEncoder({ label: 'liquid.runRender' });
    if (useSurface) {
      var fieldPass = enc.beginRenderPass({
        label: 'liquid.surfFieldPass',
        colorAttachments: [{
          view: instance.surfTexView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      if (count > 0) {
        fieldPass.setPipeline(instance.surfFieldPipeline);
        fieldPass.setBindGroup(0, instance.renderBG);
        fieldPass.draw(6, count);
      }
      fieldPass.end();
      var compPass = enc.beginRenderPass({
        label: 'liquid.surfCompositePass',
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      compPass.setPipeline(instance.surfCompositePipeline);
      compPass.setBindGroup(0, instance.surfCompositeBG);
      compPass.draw(3);
      compPass.end();
    } else {
      var pass = enc.beginRenderPass({
        label: 'liquid.renderPass',
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      if (count > 0) {
        pass.setPipeline(instance.renderPipeline);
        pass.setBindGroup(0, instance.renderBG);
        // 6 verts (unit quad) x `count` instances — one soft disc / particle.
        pass.draw(6, count);
      }
      pass.end();
    }
    // v26.16: particles not covered by the actual field composite draw as
    // small visible droplets. Interior particles remain surface-only.
    if (useSurface && LIQUID_DROPLETS >= 0.5 && instance.surfDropletPipeline &&
        instance.surfDropletBG && count > 0) {
      var dropPass = enc.beginRenderPass({
        label: 'liquid.dropletPass',
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      dropPass.setPipeline(instance.surfDropletPipeline);
      dropPass.setBindGroup(0, instance.surfDropletBG);
      dropPass.draw(6, count);
      dropPass.end();
    }
    // v24.160 — PARTICLE PROOF overlay: draw each particle as one hard dot
    // ON TOP of the water (loadOp 'load' preserves the composite). Proof of
    // whether a "giant particle" is one particle or a merged cluster.
    if (LIQUID_DBG_PARTICLES >= 0.5 && instance.dbgDotsPipeline && count > 0) {
      var dotPass = enc.beginRenderPass({
        label: 'liquid.dbgDotsPass',
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      dotPass.setPipeline(instance.dbgDotsPipeline);
      dotPass.setBindGroup(0, instance.renderBG);
      dotPass.draw(6, count);
      dotPass.end();
    }
    instance.queue.submit([enc.finish()]);
    return count;
  }

  /* ---- Stage 8 — GPU->CPU readback mirror -----------------------------
   * The Stage-8 bridge: the public liquid API (addLiquidParticle /
   * removeLiquidParticle / liquidCount / updateOilSuction) all read + write
   * the CPU typed arrays. When the GPU drives the sim those arrays must
   * still reflect the live particle state — for the HUD count, for
   * oil-suction's distance test + removal, and so the next frame's upload
   * re-seeds the GPU from a coherent snapshot.
   *
   * So each GPU frame, after the compute chain, the pos/affine/aux/flag
   * buffers are copied into 4 persistent MAP_READ buffers and mapAsync'd.
   * The result is applied into the CPU arrays at the START of the next
   * frame (the mapAsync has long since resolved across a ~16 ms gap — no
   * stall). The readback is async: the cost is PCIe bandwidth + a single
   * frame of CPU-mirror latency, both invisible. The renderer does NOT use
   * this path — draw() reads the GPU buffers directly (zero readback).
   *
   * A later pure-GPU residency model (GPU-side add/remove + compaction)
   * can replace this without touching the public API; for Stage 8 the
   * mirror keeps every game-coupled consumer correct and the game
   * fully playable.
   * -------------------------------------------------------------------- */
  function buildReadback(instance) {
    if (!instance.buffersReady) {
      try { console.log('LiquidWGPU Stage 8: particle buffers unavailable — readback mirror skipped, CPU solver stays.'); } catch (_) {}
      return;
    }
    var dev = instance.device;
    var n = instance.maxParticles;
    function mkRB(label, bytes) {
      return dev.createBuffer({
        label: label,
        size: bytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });
    }
    instance.rb = {
      pos:    mkRB('liquid.rb.pos',    n * 16),
      affine: mkRB('liquid.rb.affine', n * 16),
      aux:    mkRB('liquid.rb.aux',    n * 16),
      flag:   mkRB('liquid.rb.flag',   n * 4),
      // v15.0 — 16-byte mirror of blockMeta, piggybacked on the readback
      // cadence so instance.activeBlocks tracks the sparse working set
      // (observability only — the sim never reads it).
      meta:   mkRB('liquid.rb.meta',   16)
    };
    instance.readbackPending = false;   // a mapAsync is in flight
    instance.readbackResolved = false;  // the in-flight map has resolved
    instance.readbackCount = 0;         // particle count of the pending map
    instance.readbackReady = true;
  }

  // Copy the GPU particle buffers into the readback buffers and kick the
  // async map. count = how many particle slots to mirror back.
  function kickReadback(instance, count) {
    if (!instance.readbackReady || instance.readbackPending) return;
    if (count <= 0) return;
    if (count > instance.maxParticles) count = instance.maxParticles;
    var dev = instance.device;
    var rb = instance.rb;
    var enc = dev.createCommandEncoder({ label: 'liquid.kickReadback' });
    enc.copyBufferToBuffer(instance.buf.pos,    0, rb.pos,    0, count * 16);
    enc.copyBufferToBuffer(instance.buf.affine, 0, rb.affine, 0, count * 16);
    enc.copyBufferToBuffer(instance.buf.aux,    0, rb.aux,    0, count * 16);
    enc.copyBufferToBuffer(instance.buf.flag,   0, rb.flag,   0, count * 4);
    if (rb.meta) {
      enc.copyBufferToBuffer(instance.buf.blockMeta, 0, rb.meta, 0, 16);
    }
    instance.queue.submit([enc.finish()]);
    instance.readbackPending = true;
    instance.readbackResolved = false;
    instance.readbackCount = count;
    // v24.109 — stamp the mutation seq at kick time; applyReadback discards
    // the map if ANY mutation landed in between (slot indices may have
    // shuffled even when the count happens to match).
    instance.readbackSeq = (instance.liquid && typeof instance.liquid.getMutationSeq === 'function')
      ? instance.liquid.getMutationSeq() : 0;
    var maps = [
      rb.pos.mapAsync(GPUMapMode.READ,    0, count * 16),
      rb.affine.mapAsync(GPUMapMode.READ, 0, count * 16),
      rb.aux.mapAsync(GPUMapMode.READ,    0, count * 16),
      rb.flag.mapAsync(GPUMapMode.READ,   0, count * 4)
    ];
    if (rb.meta) { maps.push(rb.meta.mapAsync(GPUMapMode.READ, 0, 16)); }
    Promise.all(maps).then(function () {
      instance.readbackResolved = true;
    }).catch(function () {
      // A map failure (e.g. the device went away) — drop this readback;
      // the CPU arrays keep their last state and the game stays playable.
      instance.readbackPending = false;
      instance.readbackResolved = false;
    });
  }

  // Apply a resolved readback into the CPU liquid arrays. Only applies
  // when the live liquidCount still equals the count that was mapped — if
  // a particle was added/removed out-of-band since the upload, the slot
  // indices no longer line up, so the stale map is discarded (the CPU
  // arrays keep their own slightly-older-but-coherent state; the next
  // upload re-syncs the GPU). Always unmaps so the buffers are free for
  // the next kickReadback.
  function applyReadback(instance) {
    if (!instance.readbackPending) return;
    if (!instance.readbackResolved) return;   // still in flight — try later
    var rb = instance.rb;
    var count = instance.readbackCount | 0;
    var L = instance.liquid;
    try {
      var liveCount = (L && L.getCount) ? (L.getCount() | 0) : count;
      var liveSeq = (L && typeof L.getMutationSeq === 'function')
        ? L.getMutationSeq() : instance.readbackSeq;
      if (L && L.arrays && count > 0 && liveCount === count &&
          liveSeq === instance.readbackSeq) {
        var a = L.arrays;
        var pos    = new Float32Array(rb.pos.getMappedRange(0, count * 16));
        var affine = new Float32Array(rb.affine.getMappedRange(0, count * 16));
        var aux    = new Float32Array(rb.aux.getMappedRange(0, count * 16));
        var flag   = new Uint32Array(rb.flag.getMappedRange(0, count * 4));
        // v14.4 — tally awake (neither sleeping[4] nor frozen[5]) particles
        // as we copy, so the GPU-path idle-skip in updateLiquids has a fresh
        // "is anything still moving" signal with no extra scan.
        var awake = 0, sleeping = 0, frozen = 0, fast = 0;
        for (var i = 0; i < count; i++) {
          var p = i * 4;
          a.x[i]  = pos[p];     a.y[i]  = pos[p + 1];
          a.vx[i] = pos[p + 2]; a.vy[i] = pos[p + 3];
          a.g00[i] = affine[p];     a.g01[i] = affine[p + 1];
          a.g10[i] = affine[p + 2]; a.g11[i] = affine[p + 3];
          a.density[i]  = aux[p];
          a.aeration[i] = aux[p + 1];
          var f = flag[i];
          // flag bitpack: type[0:1] origin[2:3] sleeping[4] frozen[5]
          // restFrames[8:23]. type/origin are GPU-immutable but harmless
          // to restore; sleeping/frozen/restFrames are the live sim state.
          a.type[i]       = f & 3;
          a.origin[i]     = (f >> 2) & 3;
          a.sleeping[i]   = (f >> 4) & 1;
          a.frozen[i]     = (f >> 5) & 1;
          a.restFrames[i] = (f >> 8) & 0xffff;
          // v17.89 — split the non-awake remainder so the dev panel's
          // "Liq state" line is accurate under WebGPU: bit5 (frozen/off-screen)
          // takes precedence over bit4 (sleeping/settled-on-screen).
          if ((f & 0x30) === 0) {
            awake++;
            // v24.145 — fast-mover tally for the game's water state machine
            // (liquidStateTick): "is anything still really flowing".
            var fvx = pos[p + 2], fvy = pos[p + 3];
            if (fvx * fvx + fvy * fvy > LIQUID_FAST_VSQ) fast++;
          }
          else if (f & 0x20) frozen++;
          else sleeping++;
        }
        instance.awakeCount = awake;
        instance.sleepingCount = sleeping;
        instance.frozenCount = frozen;
        instance.fastCount = fast;
      }
    } catch (_) {
      // Ignore — the unmap below still runs so the buffers are reusable.
    }
    // v15.0 — active-block stat (sparse working set) from the meta mirror.
    try {
      if (rb.meta) {
        instance.activeBlocks = new Uint32Array(rb.meta.getMappedRange(0, 16))[0];
      }
    } catch (_) {}
    try { rb.pos.unmap(); } catch (_) {}
    try { rb.affine.unmap(); } catch (_) {}
    try { rb.aux.unmap(); } catch (_) {}
    try { rb.flag.unmap(); } catch (_) {}
    try { if (rb.meta) { rb.meta.unmap(); } } catch (_) {}
    instance.readbackPending = false;
    instance.readbackResolved = false;
  }

  /* ---- Stage 8b — GPU-resident mutation ops (v24.109) ------------------
   * The fix for "the CPU mirror clobbers live water". Before this, ANY
   * particle add/remove (pond fill/drain, oil suction) re-uploaded the
   * whole CPU mirror over the resident GPU buffers. The mirror lags the
   * GPU by up to LIQUID_READBACK_EVERY frames, and during continuous
   * suction the in-flight readbacks are discarded as count-misaligned so
   * it lags far more, which meant every mutation snapped live water
   * backwards in time (visible stutter/rewind while pumping or crossing
   * pond streaming edges).
   *
   * Now the game logs every mutation as a compact op stream (liquidOps in
   * sluice.js 020-state, slot layouts documented there) and a single-thread
   * compute kernel replays it against the resident buffers in exact CPU
   * order: ADDs append CPU-authored rows, REMOVEs replicate the CPU's
   * swap-remove by moving the GPU's OWN live tail row (never mirror data),
   * POKEs/WAKEs write only the lanes the game actually changed. Live rows
   * are never regressed to mirror state, and the slot layout stays
   * bit-identical to the CPU arrays so the readback mirror keeps folding
   * cleanly.
   *
   * Fallback: if the ops pipeline is unavailable, the stream overflowed,
   * or validation fails, applyParticleOps falls back to the old full
   * re-upload (rare, defensive). Harness/self-test paths still use
   * uploadParticles directly.
   * -------------------------------------------------------------------- */
  var OPS_CAPACITY = 262144;   // f32 slots; a worst-case pond teleport (drain + fill ~21.6k particles) is ~195k

  var WGSL_OPS_REPLAY = /* wgsl */ `
struct OpsParams {
  opsLen     : u32,
  startCount : u32,
  _pad0      : u32,
  _pad1      : u32,
};
@group(0) @binding(0) var<uniform> op : OpsParams;
@group(0) @binding(1) var<storage, read_write> pos : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> affine : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> aux : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> flag : array<u32>;
@group(0) @binding(5) var<storage, read> ops : array<f32>;

// Single-thread sequential replay: op order IS the CPU mutation order, so
// the GPU ends the pass with the same slot layout as the CPU arrays.
// Indices/types ride as f32 (exact for ints below 2^24; counts cap at 40k).
@compute @workgroup_size(1)
fn main() {
  var cnt : u32 = op.startCount;
  var k : u32 = 0u;
  loop {
    if (k >= op.opsLen) { break; }
    let tag = u32(ops[k]);
    if (tag == 1u) {            // ADD: append a freshly spawned row
      pos[cnt] = vec4<f32>(ops[k + 1u], ops[k + 2u], ops[k + 3u], ops[k + 4u]);
      affine[cnt] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
      aux[cnt] = vec4<f32>(${LIQUID_DENSITY.toFixed(1)}, 0.0, 0.0, 0.0);
      flag[cnt] = (u32(ops[k + 5u]) & 3u) | ((u32(ops[k + 6u]) & 3u) << 2u);
      cnt = cnt + 1u;
      k = k + 7u;
    } else if (tag == 2u) {     // REMOVE: swap-remove, moving the LIVE tail row
      let i = u32(ops[k + 1u]);
      cnt = cnt - 1u;
      if (i < cnt) {
        pos[i] = pos[cnt];
        affine[i] = affine[cnt];
        aux[i] = aux[cnt];
        flag[i] = flag[cnt];
      }
      k = k + 2u;
    } else if (tag == 3u) {     // POKE: suction nudge (vx/vy + aeration + wake)
      let i = u32(ops[k + 1u]);
      pos[i] = vec4<f32>(pos[i].x, pos[i].y, ops[k + 2u], ops[k + 3u]);
      aux[i] = vec4<f32>(aux[i].x, ops[k + 4u], aux[i].z, aux[i].w);
      flag[i] = (u32(ops[k + 5u]) & 3u) | ((u32(ops[k + 6u]) & 3u) << 2u);
      k = k + 7u;
    } else if (tag == 4u) {     // WAKE: clear sleeping + restFrames
      let i = u32(ops[k + 1u]);
      flag[i] = (u32(ops[k + 2u]) & 3u) | ((u32(ops[k + 3u]) & 3u) << 2u);
      k = k + 4u;
    } else {                    // corrupt tag (CPU validates; never expected)
      break;
    }
  }
}
`;

  function buildOpsPipeline(instance) {
    if (!instance.buffersReady) return;
    var dev = instance.device;
    var bgl = dev.createBindGroupLayout({
      label: 'liquid.opsBGL',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
      ]
    });
    instance.opsBuf = dev.createBuffer({
      label: 'liquid.ops',
      size: OPS_CAPACITY * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    instance.opsParamsBuf = dev.createBuffer({
      label: 'liquid.opsParams',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    instance.opsHost = new Float32Array(OPS_CAPACITY);
    instance.opsParamsHost = new Uint32Array(4);
    instance.opsPipe = dev.createComputePipeline({
      label: 'liquid.opsReplay',
      layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      compute: {
        module: dev.createShaderModule({ code: WGSL_OPS_REPLAY }),
        entryPoint: 'main'
      }
    });
    instance.opsBG = dev.createBindGroup({
      label: 'liquid.opsBG',
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: instance.opsParamsBuf } },
        { binding: 1, resource: { buffer: instance.buf.pos } },
        { binding: 2, resource: { buffer: instance.buf.affine } },
        { binding: 3, resource: { buffer: instance.buf.aux } },
        { binding: 4, resource: { buffer: instance.buf.flag } },
        { binding: 5, resource: { buffer: instance.opsBuf } }
      ]
    });
    instance.opsReady = true;
  }

  // Drop any pending op stream without applying it. Used right after a
  // FULL upload, which already pushed the complete CPU truth (replaying
  // the same ops on top of it would double-apply them).
  function discardPendingOps(instance) {
    var L = instance.liquid;
    if (L && typeof L.takeOps === 'function') {
      var o = L.takeOps();
      if (o) o.length = 0;
    }
  }

  // Apply the game's pending mutation ops to the resident GPU buffers.
  // Returns the new live count. Falls back to a full uploadParticles when
  // the ops path is unavailable or the stream fails validation.
  function applyParticleOps(instance) {
    var L = instance.liquid;
    var target = L.getCount() | 0;
    if (target > instance.maxParticles) target = instance.maxParticles;
    var ops = (typeof L.takeOps === 'function') ? L.takeOps() : null;
    if (!ops || !instance.opsReady) {
      if (ops) ops.length = 0;
      return uploadParticles(instance, true);
    }
    // CPU dry-walk: validate tags + indices and confirm the stream lands
    // exactly on the live CPU count. Any surprise means the log is not a
    // faithful delta (a mutator that bumped the seq without logging, an
    // overflow, corruption), so fall back to the full re-seed.
    var cnt = instance.uploadedCount | 0;
    var n = ops.length | 0;
    var k = 0, ok = (n <= OPS_CAPACITY);
    while (ok && k < n) {
      var tag = ops[k];
      if (tag === 1) {
        if (cnt >= instance.maxParticles) { ok = false; break; }
        cnt++; k += 7;
      } else if (tag === 2) {
        if (!(ops[k + 1] >= 0 && ops[k + 1] < cnt)) { ok = false; break; }
        cnt--; k += 2;
      } else if (tag === 3) {
        if (!(ops[k + 1] >= 0 && ops[k + 1] < cnt)) { ok = false; break; }
        k += 7;
      } else if (tag === 4) {
        if (!(ops[k + 1] >= 0 && ops[k + 1] < cnt)) { ok = false; break; }
        k += 4;
      } else { ok = false; break; }
    }
    if (!ok || k !== n || cnt !== target) {
      ops.length = 0;
      return uploadParticles(instance, true);
    }
    if (n > 0) {
      instance.opsHost.set(ops);
      instance.queue.writeBuffer(instance.opsBuf, 0, instance.opsHost, 0, n);
      var u = instance.opsParamsHost;
      u[0] = n >>> 0;
      u[1] = instance.uploadedCount >>> 0;
      u[2] = 0; u[3] = 0;
      instance.queue.writeBuffer(instance.opsParamsBuf, 0, u);
      var enc = instance.device.createCommandEncoder({ label: 'liquid.opsReplay' });
      var pass = enc.beginComputePass({ label: 'liquid.opsReplay' });
      pass.setPipeline(instance.opsPipe);
      pass.setBindGroup(0, instance.opsBG);
      pass.dispatchWorkgroups(1);
      pass.end();
      instance.queue.submit([enc.finish()]);
    }
    ops.length = 0;
    instance.uploadedCount = target;
    return target;
  }

  /* ---- Stage 8 — the live per-frame GPU sim step ----------------------
   * runFrame is what instance.update(dt) calls. It mirrors the CPU
   * updateLiquids structure: honour the dt clamp + the single-substep
   * model, then run the full GPU chain in place of the CPU
   * P2G/pressure/grid/G2P/move pipeline.
   *
   *   1. applyReadback   — fold last frame's GPU state into the CPU arrays
   *                        (the public-API mirror; oil-suction reads it).
   *   2. updateOilSuction— the game's CPU hook: pump intake. It reads the
   *                        mirrored positions, removes sucked oil from the
   *                        CPU arrays + updates oilGallons. Runs CPU-side
   *                        so the agreed particle count stays the CPU
   *                        liquidCount (item 4 — oil suction stays here).
   *   3. applyParticleOps— replay the game's mutation-op stream against
   *                        the resident GPU buffers when the CPU set
   *                        changed (v24.109, Stage 8b); a FULL
   *                        uploadParticles re-seed happens only on first
   *                        seed or as the defensive fallback.
   *   4. writeGameParams — push the live player / rocket / explosion state
   *                        for the grid-update wakes + collide miner test.
   *   5. computeGridBounds / computeTerrainBounds / uploadTerrainMask.
   *   6. buildGrid -> P2G -> grid2 (clearDV/pressure/gridUpdate+wakes) ->
   *      G2P -> collide (terrain + miner).
   *   7. kickReadback    — start the async copy-back for next frame.
   *
   * dt handling mirrors updateLiquids: ignore non-finite / tiny dt, clamp
   * to 0.05 s, one substep. A thrown error anywhere flips simActive false
   * (the caller wrapper) so the CPU solver takes over from the next frame.
   * -------------------------------------------------------------------- */
  function runFrame(instance, dt) {
    // 1. Fold last frame's GPU result into the CPU mirror. Always runs
    // (even on a bad-dt frame) so the buffers free up for the next kick.
    applyReadback(instance);

    // dt clamp — mirror updateLiquids: ignore non-finite / tiny dt, clamp
    // to 0.05 s. Done first so a degenerate dt never reaches oil suction
    // (its pull is dt-scaled) or the uniform.
    if (!isFinite(dt) || dt <= 0.0005) return;
    if (dt > 0.05) dt = 0.05;
    // v24.10 — substep the sim like saharan's Water demo. Equilibrium column
    // compression scales as stepDt², so advancing the chain in N small
    // sub-steps (dt/N each) lets a DEEP pool settle at ~rest density instead
    // of over-compressing then detonating into "popcorn" over time. The real
    // fall speed is unchanged (ΔV/frame = GRAVITY·dt is invariant of N) so
    // splashes feel identical. The uniform carries stepDt = dt/N.
    var subSteps;
    if (LIQUID_FIXED_STEP) {
      // v24.124 — fixed-quantum substepping (mirrors updateLiquids): exact
      // LIQUID_SUBSTEP_DT chunks, remainder banked, excess shed past a
      // 2-quantum cap. stepDt is a true constant so the compression
      // equilibrium never moves with frame jitter. v25.29 — dt banks
      // x TIMESCALE (sim playback rate; the bank holds SIM seconds), shed
      // cap scaled with it so the bank still holds ~one 60 Hz frame.
      liquidStepAcc += dt * LIQUID_TIMESCALE;
      subSteps = Math.floor(liquidStepAcc / LIQUID_SUBSTEP_DT);
      if (subSteps > LIQUID_MAX_SUBSTEPS) subSteps = LIQUID_MAX_SUBSTEPS;
      liquidStepAcc -= subSteps * LIQUID_SUBSTEP_DT;
      if (liquidStepAcc > LIQUID_SUBSTEP_DT * 2 * LIQUID_TIMESCALE) liquidStepAcc = LIQUID_SUBSTEP_DT * 2 * LIQUID_TIMESCALE;
      if (subSteps <= 0) return;        // banked — nothing to advance this frame
      instance.stepDt = LIQUID_SUBSTEP_DT;   // computeGridBounds pushes this into the uniform
    } else {
      subSteps = Math.ceil(dt * LIQUID_TIMESCALE / LIQUID_SUBSTEP_DT);
      if (subSteps < 1) subSteps = 1;
      if (subSteps > LIQUID_MAX_SUBSTEPS) subSteps = LIQUID_MAX_SUBSTEPS;
      instance.stepDt = dt * LIQUID_TIMESCALE / subSteps;   // computeGridBounds pushes this into the uniform
    }

    var L = instance.liquid;
    // 2. Oil-suction (CPU game hook) — reads the mirror, mutates the CPU
    // arrays + oilGallons. Runs CPU-side so the agreed particle count
    // stays the CPU liquidCount (item 4 — oil suction owns removal).
    if (L && typeof L.updateOilSuction === 'function') {
      L.updateOilSuction(dt);
    }

    // 3. Sync game mutations into the resident GPU buffers. On every
    // unchanged frame we skip this entirely and let the GPU keep simulating
    // its own resident state, so the sim advances exactly one dt-step per
    // frame no matter how many frames the async readback round-trip takes.
    //
    // v24.109 — when the particle set DID change (liquidMutationSeq moved:
    // pond fill/drain, oil suction, dig wake), the change now reaches the
    // GPU as a replayed op stream (applyParticleOps / Stage 8b above)
    // instead of a full re-upload of the CPU mirror. The mirror lags the
    // GPU by up to LIQUID_READBACK_EVERY frames, so the old full re-upload
    // snapped every live particle backwards in time on each mutation
    // (stutter/rewind while pumping or crossing pond streaming edges).
    // A FULL upload now happens only on first seed, after a CPU-solver
    // handoff, or as the defensive fallback inside applyParticleOps; it
    // discards the pending ops since it already carries the full truth.
    var count;
    var hasSeq = !!(L && typeof L.getMutationSeq === 'function');
    var seq = hasSeq ? L.getMutationSeq() : 0;
    if (!hasSeq || !instance.residentSeeded) {
      count = uploadParticles(instance, true);
      discardPendingOps(instance);
      instance.lastUploadSeq = seq;
      instance.residentSeeded = count > 0;
    } else if (seq !== instance.lastUploadSeq) {
      count = applyParticleOps(instance);
      instance.lastUploadSeq = seq;
      instance.residentSeeded = count > 0;
    } else {
      count = instance.uploadedCount | 0;
    }
    if (count <= 0) {
      // Nothing to simulate — drop the resident flag so the next particle
      // re-seeds, and bail.
      instance.residentSeeded = false;
      return;
    }
    // 4. Live game state for the wake kernels + the collide miner test.
    writeGameParams(instance, subSteps);
    // v14.31 — pull the live camera active-region box from the game's
    // getView hook. computeGridBounds + the kernels' per-particle guard
    // cull water outside it. A missing/degenerate box falls back to the
    // whole-world box (cull nothing — safe).
    var rv = (L && typeof L.getView === 'function') ? L.getView() : null;
    if (rv && isFinite(rv.regionMinX) && isFinite(rv.regionMaxX) &&
        rv.regionMaxX > rv.regionMinX && rv.regionMaxY > rv.regionMinY) {
      instance.regionMinX = rv.regionMinX; instance.regionMinY = rv.regionMinY;
      instance.regionMaxX = rv.regionMaxX; instance.regionMaxY = rv.regionMaxY;
    } else {
      instance.regionMinX = -1e9; instance.regionMinY = -1e9;
      instance.regionMaxX =  1e9; instance.regionMaxY =  1e9;
    }
    // 5. Grid + terrain bounds from the snapshot.
    computeGridBounds(instance, count);
    computeTerrainBounds(instance, count);
    uploadTerrainMask(instance);
    // v15.0 — the hybrid gate: below LIQUID_SPARSE_MIN_CELLS bbox cells
    // the dense chain is cheaper than the sparse bookkeeping, so small
    // settled ponds keep the zero-overhead legacy path and big bboxes get
    // the sparse cap. 2x hysteresis (enter at MIN, exit at MIN/2) so a
    // hovering bbox cannot flap; each dense->sparse entry re-establishes
    // the global-zero invariant via needsDenseClear below.
    if (LIQUID_SPARSE && instance.sparseGridOK &&
        instance.sparseP2GOK && instance.sparseGrid2OK) {
      var cellsNow = instance.grid ? instance.grid.cells : 0;
      var vetoNow = instance.sparseVeto
        ? (cellsNow < LIQUID_SPARSE_MIN_CELLS)
        : (cellsNow < (LIQUID_SPARSE_MIN_CELLS >> 1));
      if (instance.sparseVeto && !vetoNow) { instance.needsDenseClear = true; }
      instance.sparseVeto = vetoNow;
    }
    // v15.0 — a dense->sparse lever flip re-enters the sparse invariant
    // from dense-dirtied buffers (the dense chain start-clears rather than
    // end-clears, so it leaves the last sub-step's counts/accumulators
    // populated). One transfer-queue clear re-establishes global zero.
    if (instance.needsDenseClear) {
      denseClearAll(instance);
      instance.needsDenseClear = false;
    }
    // 6. The full GPU per-frame chain — batched into one queue.submit,
    // run subSteps× (v24.10). Each stage records its own command buffer
    // and routes it through liquidSubmit, which collects them while
    // batchCBs is set; they execute in array order on the queue. Each
    // sub-step rebuilds the grid from the resident (GPU-evolved) particle
    // buffers and advances dt/N — uploadParticles seeded them once above,
    // so the sub-steps compound on the GPU with no extra upload or
    // readback. v15.0 — ONE submit for the whole frame (was one per
    // sub-step; submits are real driver overhead on mobile), and under the
    // sparse path each sub-step ends with the indirect active-block clear
    // that maintains the global-zero invariant.
    instance.batchCBs = [];
    for (var ss = 0; ss < subSteps; ss++) {
      // v15.0 — sub-steps after the first fold the previous sub-step's
      // active-block clear into their own first pass (same grid mapping).
      buildGrid(instance, ss > 0);
      runDeclump(instance);   // v24.185 — min-separation, after the fresh grid
      runP2G(instance);
      runGrid2(instance, ss);
      runG2P(instance);
      runCollide(instance, ss);
    }
    // v15.0 — clear the LAST sub-step's active blocks while this frame's
    // grid mapping still holds (sparse path only; no-op dense).
    runSparseEndClear(instance);
    if (instance.batchCBs.length > 0) {
      instance.queue.submit(instance.batchCBs);
    }
    instance.batchCBs = null;
    // 7. Kick the async copy-back for the CPU mirror — but only every
    // LIQUID_READBACK_EVERY runFrames (v14.5). Per-frame mapAsync serialises
    // the CPU and GPU; kicking it rarely lets them pipeline. The mirror is
    // game-side only (oil suction + the grid bbox); the renderer reads the
    // GPU buffer straight, so the on-screen water never lags.
    if ((instance.readbackTick % LIQUID_READBACK_EVERY) === 0) {
      kickReadback(instance, count);
    }
    instance.readbackTick = (instance.readbackTick + 1) | 0;
  }

  /* ---- Stage 7 verification — render from buffer -----------------------
   * Seed the GPU particle buffers from the live CPU liquid state (Stage
   * 1's uploadParticles), draw one frame with the camera state at seed
   * time, and log the drawn count. There is no CPU reference to diff —
   * Stage 7 only builds the renderer; the visual confirmation (the live
   * build owner's playtest + the harness screenshot) is that the surface
   * ponds render as cyan blobs in the expected on-screen location.
   *
   * The camera state is taken from instance.liquid.getView() if the game
   * supplies it (Stage 8 wires the live camera); otherwise a default
   * identity camera frames the seeded particles at the world origin.
   * -------------------------------------------------------------------- */
  function runStage7SelfTest(instance) {
    var L = instance.liquid;
    if (!instance.renderReady) {
      try { console.log('LiquidWGPU Stage 7: render pipeline unavailable — self-test skipped.'); } catch (_) {}
      return;
    }
    if (!L) {
      try { console.log('LiquidWGPU Stage 7: no liquid arrays wired — renderer built, self-test skipped.'); } catch (_) {}
      return;
    }
    var count = uploadParticles(instance);
    if (count === 0) {
      try { console.log('LiquidWGPU Stage 7: 0 live particles — renderer built, self-test deferred.'); } catch (_) {}
      return;
    }
    // Camera at seed time — the game's live view if exposed, else an
    // identity camera over the seeded particles.
    var view = (typeof L.getView === 'function' && L.getView()) || null;
    if (!view) {
      var cv = instance.renderCanvas;
      view = {
        camX: 0, camY: 0, dpr: 1, worldScale: 1,
        canvasW: (cv && cv.width) || 1280,
        canvasH: (cv && cv.height) || 720
      };
    }
    view.count = count;
    var drawn = runRender(instance, view);
    try {
      console.log('LiquidWGPU Stage 7: renderer built — drew ' + drawn +
        ' particles to liquidWGPUCanvas');
    } catch (_) {}
  }

  // Run the P2G scatter in one command encoder:
  //   clearP2GCells -> zero the 5 fixed-point accumulators (per cell)
  //   p2gScatter    -> per particle, splat the 3x3 quadratic stencil
  //   p2gNormalize  -> per cell, cellAeration /= cellMass
  // Assumes uploadParticles() + computeGridBounds() already ran (the
  // Params uniform must carry the current grid + stepDt). P2G does not
  // need the count-sort — the dense stencil index is computed directly.
  function runP2G(instance) {
    if (!instance.p2gReady) return;
    var g = instance.grid;
    if (!g || g.cells <= 0) return;
    var count = instance.uploadedCount | 0;
    var dev = instance.device;
    var P = instance.p2gPipe;
    var cellGroups = Math.ceil(g.cells / WG);
    var partGroups = Math.max(1, Math.ceil(count / WG));
    var enc = dev.createCommandEncoder({ label: 'liquid.runP2G' });
    var cp = enc.beginComputePass({ label: 'liquid.p2g' });
    var sparse = useSparse(instance);

    // 1. clearP2GCells — zero accumulators over [0, cells). v15.0 sparse:
    //    SKIPPED — the accumulators are already zero everywhere (the
    //    global-zero invariant; see the end-of-sub-step clear).
    if (!sparse) {
      cp.setPipeline(P.clear);
      cp.setBindGroup(0, instance.p2gBG);
      cp.dispatchWorkgroups(cellGroups);
    }

    if (count > 0) {
      // 2. p2gScatter — per particle: splat the 3x3 stencil.
      cp.setPipeline(P.scatter);
      cp.setBindGroup(0, instance.p2gBG);
      cp.dispatchWorkgroups(partGroups);
    }

    // 3. p2gNormalize — per cell: mass-normalize aeration. v15.0 sparse:
    //    active blocks only, sized by the GPU-written indirect args.
    if (sparse) {
      cp.setPipeline(P.normalizeSparse);
      cp.setBindGroup(0, instance.p2gBG);
      cp.dispatchWorkgroupsIndirect(instance.buf.blockDispatch, 0);
    } else {
      cp.setPipeline(P.normalize);
      cp.setBindGroup(0, instance.p2gBG);
      cp.dispatchWorkgroups(cellGroups);
    }

    cp.end();
    liquidSubmit(instance, enc);
  }

  // ----- Device init -------------------------------------------------
  // Async: requestAdapter -> requestDevice, asking for the adapter's
  // max storage-buffer / buffer limits. Mirrors js/particle-life.js.
  // Resolves true on success, false on any failure (CPU fallback).
  function initDevice(instance) {
    var guestUnionOK = runGuestUnionOrderRegression();
    try {
      console.log('LiquidWGPU guest union: ' +
        (guestUnionOK ? 'OK, 6 slot permutations agree.' :
          'FAIL, slot order changes the overlap result.'));
    } catch (_) {}
    if (!guestUnionOK) {
      instance.failed = true;
      return Promise.resolve(false);
    }
    return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      .then(function (adapter) {
        if (!adapter) throw new Error('no WebGPU adapter');
        var requiredLimits = {};
        if (adapter.limits.maxStorageBufferBindingSize) {
          requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
        }
        if (adapter.limits.maxBufferSize) {
          requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
        }
        // Stage 3 — the P2G bind group needs 9 storage buffers in one
        // compute stage (4 read-only particle buffers + 5 fixed-point
        // cell accumulators). The WebGPU default maxStorageBuffersPer-
        // ShaderStage is only 8/10, so request the adapter's full limit
        // (same pattern as the binding-size limits above). On an adapter
        // that genuinely caps below 9 the P2G bind-group layout is
        // invalid; buildP2GPipelines detects that and leaves
        // p2gReady=false so the CPU solver keeps driving.
        if (adapter.limits.maxStorageBuffersPerShaderStage) {
          requiredLimits.maxStorageBuffersPerShaderStage =
            adapter.limits.maxStorageBuffersPerShaderStage;
        }
        instance.adapter = adapter;
        return adapter.requestDevice({ requiredLimits: requiredLimits });
      })
      .then(function (device) {
        instance.device = device;
        instance.queue = device.queue;
        // Surface asynchronous shader/bind validation instead of leaving a
        // boot self-test waiting forever on an invalid command buffer.
        device.addEventListener('uncapturederror', function (ev) {
          try {
            console.error('LiquidWGPU WebGPU validation: ' +
              ((ev && ev.error && ev.error.message) || 'unknown error'));
          } catch (_) {}
        });
        instance.deviceReady = true;
        instance.available = true;
        // A lost device permanently drops the GPU path; the game falls
        // back to the CPU solver from the next frame.
        device.lost.then(function (info) {
          instance.available = false;
          instance.simActive = false;
          instance.renderActive = false;
          instance.failed = true;
          try { console.warn('LiquidWGPU: device lost —', info && info.message); } catch (_) {}
        });
        try { console.log('LiquidWGPU: device ready (Stage ' + STAGE + ' — CPU solver still driving).'); } catch (_) {}
        // Stage 1 — allocate the particle-state + grid buffers.
        buildBuffers(instance);
        runStage1SelfTest(instance);
        // Stage 2 — build the spatial-grid pipelines and self-test the
        // count-sort. Wrapped so a WGSL compile failure can't take down
        // device init (the game keeps the CPU solver either way).
        try {
          buildGridPipelines(instance);
          runStage2SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 2: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // Stage 3 — build the P2G pipelines and self-test the particle->
        // grid scatter. Independently wrapped for the same reason.
        try {
          buildP2GPipelines(instance);
          runStage3SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 3: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // Stage 4 — build the pressure + grid-update pipelines and
        // self-test the per-frame chain (P2G -> pressure -> grid update).
        // Independently wrapped — a WGSL compile failure must not take
        // down device init; the game keeps the CPU solver either way.
        try {
          buildGrid2Pipelines(instance);
          runStage4SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 4: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // Stage 5 — build the G2P pipeline and self-test the full core
        // MPM step (P2G -> pressure -> grid update -> G2P). Independently
        // wrapped for the same reason.
        try {
          buildG2PPipelines(instance);
          runStage5SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 5: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // Stage 6 — build the collide pipeline and self-test the full
        // per-frame chain with GPU terrain collision (P2G -> pressure ->
        // grid update -> G2P -> collide). Independently wrapped for the
        // same reason.
        try {
          buildCollidePipelines(instance);
          runStage6SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 6: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // Stage 7 — build the liquidWGPUCanvas + the instanced soft-disc
        // render pipeline, then self-test by drawing the seeded particle
        // buffer once. Independently wrapped — a WGSL compile / canvas-
        // context failure must not take down device init; the game keeps
        // the CPU renderer (renderActive stays false until Stage 8).
        try {
          buildRenderPipeline(instance);
          runStage7SelfTest(instance);
        } catch (e) {
          try { console.log('LiquidWGPU Stage 7: pipeline build failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
        // ---- Stage 8 — flip the GPU path live --------------------------
        // The GPU drives sim + render ONLY if every pipeline the per-frame
        // chain needs is built (buffers + grid + P2G + pressure/grid +
        // G2P + collide for the sim; the render pipeline for the draw). If
        // ANY stage's build failed above, its *Ready flag stayed false and
        // the corresponding flag below stays false — the CPU solver keeps
        // driving. Wrapped so even this last step cannot brick the game.
        try {
          buildReadback(instance);
          // v24.109 — Stage 8b mutation-op replay. Optional: a build
          // failure only means mutations fall back to the old full
          // re-upload, so it must never block the GPU path going live.
          try {
            buildOpsPipeline(instance);
          } catch (eOps) {
            try { console.log('LiquidWGPU Stage 8b: ops-replay pipeline build failed (' + ((eOps && eOps.message) || eOps) + '); mutations fall back to full re-upload.'); } catch (_) {}
          }
        } catch (e) {
          try { console.log('LiquidWGPU Stage 8: readback build failed (' + ((e && e.message) || e) + '); CPU fallback.'); } catch (_) {}
        }
        // v24.112 — the go-live flip is DEFERRED until the Stage 6 self-test's
        // async continuation has settled. That continuation restores its
        // captured post-G2P snapshot into the LIVE particle buffers (its
        // collide-isolation trick); before GPU residency (v14.2) the
        // per-frame re-upload healed that overwrite immediately, but a
        // resident sim kept it forever — the boot CPU classifier's frozen
        // bits rode the restore and left a permanently skipped + invisible
        // slice of the first pond on every boot. The CPU solver simply
        // drives a moment longer; the build steps above stay synchronous.
        var goLive = function () {
          try {
            var simOK = !!(instance.buffersReady && instance.gridReady &&
              instance.p2gReady && instance.grid2Ready && instance.g2pReady &&
              instance.collideReady);
            if (simOK && instance.readbackReady) {
              instance.simActive = true;
            }
            // renderActive is GATED on simActive: drawing straight from the
            // GPU particle buffers only shows live water if the GPU is also
            // the one advancing it. If the sim stays on the CPU, the render
            // must too (else draw() would blit a frozen GPU snapshot while
            // the CPU solver moves the real particles).
            if (instance.simActive && instance.renderReady) {
              instance.renderActive = true;
            }
            try {
              console.log('LiquidWGPU Stage 8: GPU path ' +
                (instance.simActive ? 'LIVE (sim)' : 'sim-disabled') + ' / ' +
                (instance.renderActive ? 'LIVE (render)' : 'render-disabled') +
                ' — ' + (instance.simActive ? 'GPU' : 'CPU') + ' solver driving' +
                (instance.simActive
                  ? (useSparse(instance)
                      ? ' (v15 sparse block grid — cost scales with wet area, not bbox).'
                      : ' (dense grid — sparse ' +
                        (instance.sparseCapable ? 'off' : 'unavailable') + ').')
                  : '.'));
            } catch (_) {}
          } catch (e) {
            instance.simActive = false;
            instance.renderActive = false;
            try { console.log('LiquidWGPU Stage 8: flip-live failed — ' + ((e && e.message) || e) + ' — CPU fallback.'); } catch (_) {}
          }
          return true;
        };
        // v26.15: Stage 5 also owns an async readback. Do not resolve the
        // public readyPromise, or let a host retune live uniforms, until both
        // verification continuations have finished.
        return Promise.all([
          Promise.resolve(instance.stage5Done),
          Promise.resolve(instance.stage6Done)
        ]).then(goLive, goLive);
      })
      .catch(function (err) {
        instance.failed = true;
        instance.available = false;
        try { console.log('LiquidWGPU: device init failed (' + ((err && err.message) || err) + ') — CPU solver fallback.'); } catch (_) {}
        return false;
      });
  }

  // ----- create(opts) ------------------------------------------------
  // Returns a solver instance. Never throws — on any failure the
  // instance simply reports available=false / simActive=false and the
  // game keeps using its CPU solver.
  //
  // opts.liquid = {
  //   maxParticles : int,
  //   getCount     : () => live particle count,
  //   arrays       : { type,x,y,vx,vy,g00,g01,g10,g11,density,
  //                    aeration,origin,sleeping,frozen,restFrames }
  //                  — the persistent CPU typed arrays (stable refs).
  // }
  function create(opts) {
    opts = opts || {};
    var liquid = opts.liquid || null;
    var instance = {
      stage: STAGE,
      opts: opts,
      liquid: liquid,
      maxParticles: (liquid && liquid.maxParticles) || 40000,
      cellSize: (liquid && liquid.cellSize) || LIQUID_CELL_DEFAULT,
      // Sim sub-step (s). Fixed to 1/60 for the Stage-3 self-test; the
      // later sim stages will drive this from the real frame timestep.
      stepDt: (liquid && liquid.stepDt) || (1 / 60),
      // World constants for the Stage-5 G2P world-bounds clamp. Defaults
      // match the game's sluice.js values; carried into the
      // Params uniform so the WGSL kernel can clamp the new position.
      worldCols:      (liquid && liquid.world && liquid.world.COLS)       || 160,
      worldTile:      (liquid && liquid.world && liquid.world.TILE)       || 32,
      worldTotalRows: (liquid && liquid.world && liquid.world.TOTAL_ROWS) || 0,
      // Stage 7 — the main game <canvas>. liquidWGPUCanvas is inserted as
      // its sibling (z-index 4) so the browser composites the liquid layer
      // natively, exactly like the CPU renderer's liquidGLCanvas. May be
      // null (then the render canvas is built detached — still drawable).
      mainCanvas: opts.mainCanvas || (liquid && liquid.mainCanvas) || null,
      adapter: null,
      device: null,
      queue: null,
      buf: null,
      paramsBuf: null,
      paramsHost: null,
      paramsHostF: null,    // f32 view aliasing paramsHost's ArrayBuffer
      gameParamsBuf: null,  // GameParams uniform — game-coupled state (Stage 8)
      gameParamsBufs: null, // one immutable GameParams uniform per substep (v26.13)
      gameParamsHost: null, // f32 staging view for GameParams (Stage 8)
      simParamsBuf: null,   // SimParams uniform — live fluid-feel physics (v14.26)
      simParamsHost: null,  // f32 staging view for SimParams (v14.26)
      rb: null,             // readback mirror buffers pos/affine/aux/flag (Stage 8)
      readbackReady: false, // readback mirror buffers built (Stage 8)
      readbackPending: false,  // a readback mapAsync is in flight (Stage 8)
      readbackResolved: false, // the in-flight readback map has resolved (Stage 8)
      readbackCount: 0,     // particle count of the pending readback (Stage 8)
      staging: null,
      pipe: null,           // grid compute pipelines (Stage 2)
      bg: null,             // grid bind group (Stage 2)
      p2gPipe: null,        // P2G compute pipelines (Stage 3)
      p2gBG: null,          // P2G bind group (Stage 3)
      grid2Pipe: null,      // pressure + grid-update pipelines (Stage 4)
      pressureBG: null,     // pressure bind group (Stage 4)
      gridUpdateBG: null,   // grid-update bind group (Stage 4)
      gridUpdateBGs: null,  // per-substep guest-pose bind groups (v26.13)
      gridBoundaryBG: null, // grid-boundary bind group (Stage 4b, v14.3)
      g2pPipe: null,        // G2P compute pipeline (Stage 5)
      g2pBG: null,          // G2P bind group (Stage 5)
      collidePipe: null,    // collide compute pipeline (Stage 6)
      collideBG: null,      // collide bind group (Stage 6)
      collideBGs: null,     // per-substep guest-pose bind groups (v26.13)
      renderCanvas: null,   // liquidWGPUCanvas — the <canvas> (Stage 7)
      renderCtx: null,      // its webgpu context (Stage 7)
      renderFormat: null,   // preferred canvas format (Stage 7)
      renderPipeline: null, // instanced soft-disc render pipeline (Stage 7)
      renderBG: null,       // render bind group (Stage 7)
      renderParamsBuf: null,// RenderParams uniform buffer (Stage 7)
      renderParamsHost: null,// f32 staging view for RenderParams (Stage 7)
      grid: null,           // {originX,originY,w,h,cells,capped} per build
      terrain: null,        // {originCol,originRow,w,h,tiles,capped} per build
      // v14.31 — active-region cull box (world px). Initialized to a box that
      // encloses the whole world so the boot self-tests (Stages 1-8) cull
      // nothing; runFrame overwrites it per frame with the live camera region.
      regionMinX: -1e9, regionMinY: -1e9,
      regionMaxX:  1e9, regionMaxY:  1e9,
      buffersReady: false,
      gridReady: false,     // grid pipelines + bind group built
      p2gReady: false,      // P2G pipelines + bind group built
      grid2Ready: false,    // pressure + grid-update pipelines built
      g2pReady: false,      // G2P pipeline + bind group built
      collideReady: false,  // collide pipeline + bind group built
      renderReady: false,   // render canvas + pipeline built (Stage 7)
      surfReady: false,         // v24.113 — surface-render pipelines built (Stage 7b)
      surfFieldPipeline: null,  // v24.113 — particle -> density-field splat pipeline
      surfCompositePipeline: null, // v24.113 — field -> canvas threshold composite
      surfDropletPipeline: null,   // v26.16 — field-coverage droplet pass
      surfDropletBGL: null,        // v26.16 — params + particles + density field
      surfDropletBG: null,         // v26.16 — rebuilt with the field texture
      surfCompositeBGL: null,   // v24.113 — composite bind-group layout
      surfCompositeBG: null,    // v24.113 — composite bind group (rebuilt with the texture)
      surfTex: null,            // v24.113 — offscreen rgba16float density field
      surfTexView: null,        // v24.113 — its view
      surfTexW: 0, surfTexH: 0, // v24.113 — current field texture size
      uploadedCount: 0,
      lastUploadSeq: -1,     // v14.2 — liquidMutationSeq at the last upload
      residentSeeded: false, // v14.2 — GPU buffers hold a live particle set
      awakeCount: -1,        // v14.4 — awake-particle tally from the last readback (-1 = unknown)
      fastCount: 0,          // v24.145 — awake particles above LIQUID_FAST_VSQ (state machine signal)
      sleepingCount: -1,     // v17.89 — settled (on-screen) tally from the last readback
      frozenCount: -1,       // v17.89 — off-screen tally from the last readback
      readbackTick: 0,       // v14.5 — runFrame counter gating the readback cadence
      readbackSeq: 0,        // v24.109 — mutation seq at the last readback kick (apply discards on mismatch)
      stage5Done: null,      // v26.15, Stage 5 readback promise; readyPromise waits before host retuning
      stage6Done: null,      // v24.112 — Stage 6 self-test continuation promise; Stage 8 go-live waits on it
      opsBuf: null,          // v24.109 — mutation-op stream buffer (Stage 8b)
      opsParamsBuf: null,    // v24.109 — {opsLen, startCount} uniform
      opsHost: null,         // v24.109 — f32 staging for the op stream
      opsParamsHost: null,   // v24.109 — u32 staging for the ops uniform
      opsPipe: null,         // v24.109 — single-thread replay pipeline
      opsBG: null,           // v24.109 — replay bind group
      opsReady: false,       // v24.109 — ops-replay path available (else full re-upload)
      batchCBs: null,        // v14.7 — per-frame compute command-buffer batch
      // v15.0 — sparse active-block grid state.
      sparseCapable: false,  // device grants >= 10 storage buffers/stage
      sparseGridOK: false,   // sparse grid-layout pipelines built
      sparseP2GOK: false,    // sparse p2g-layout pipelines built
      sparseGrid2OK: false,  // sparse grid2 + boundary pipelines built
      sparseVeto: false,     // per-frame hybrid gate: small bbox -> dense
      needsDenseClear: false,// re-zero everything before the next frame
      activeBlocks: -1,      // last readback's active-block count (-1 unknown)
      deviceReady: false,   // requestDevice resolved
      available: false,     // WebGPU usable
      failed: false,        // unrecoverable — stay on CPU fallback
      simActive: false,     // GPU drives updateLiquids()  (flips on at Stage 8)
      renderActive: false,  // GPU drives drawLiquids()    (flips on at Stage 7/8)
      readyPromise: null,
      // --- methods ---
      // Stage 8 — the live per-frame GPU sim step. updateLiquids() in
      // sluice.js delegates here when simActive is true. The
      // whole GPU path is wrapped: any runtime error flips simActive +
      // renderActive false so the CPU solver takes over from the next
      // frame — the fallback must always hold; a GPU fault never bricks
      // the game.
      update: function (dt) {
        if (!instance.simActive) return;
        try {
          runFrame(instance, dt);
        } catch (e) {
          instance.simActive = false;
          instance.renderActive = false;
          try { console.warn('LiquidWGPU Stage 8: runtime error in sim step — ' + ((e && e.message) || e) + ' — reverting to CPU solver.'); } catch (_) {}
        }
      },
      // Stage 7/8 — render the GPU particle buffer to liquidWGPUCanvas.
      // `view` carries the camera + canvas state { camX, camY, dpr,
      // worldScale, canvasW, canvasH, viewW?, viewH?, count? }. Zero CPU
      // readback — the vertex shader reads buf.pos/aux/flag directly. When
      // called with no view (the game's drawLiquids() does), the live
      // camera is pulled from the getView hook and the draw count is the
      // GPU buffers' uploaded count. Wrapped like update() — a render
      // fault flips renderActive false (the CPU renderer takes over).
      // Returns the drawn particle count (0 if the renderer is not built).
      draw: function (view) {
        if (!instance.renderActive && !view) {
          // Direct harness call (Stage-7 self-test passes its own view)
          // still works; the live game path is gated on renderActive.
        }
        try {
          if (!view) {
            var L2 = instance.liquid;
            view = (L2 && typeof L2.getView === 'function' && L2.getView()) || {};
            if (view.count === undefined) view.count = instance.uploadedCount | 0;
          }
          return runRender(instance, view);
        } catch (e) {
          instance.renderActive = false;
          try { console.warn('LiquidWGPU Stage 8: runtime error in render — ' + ((e && e.message) || e) + ' — reverting to CPU renderer.'); } catch (_) {}
          return 0;
        }
      },
      // v14.25 — live render-look setter. Mutates one of the module's
      // LIQUID_* colour / alpha / particle-size render vars by name; the
      // next per-frame RenderParams fill picks it up — NO shader recompile
      // (the render shader reads colours from the uniform). `name` is the
      // var name WITHOUT the LIQUID_ prefix, e.g. 'WATER_R'. Unknown names
      // are a no-op. Particle SIZE is already uniform-fed; it is included
      // here for a single uniform tuning entry point.
      setRenderParam: function (name, value) {
        try {
          var v = +value;
          if (!isFinite(v)) return;
          switch (name) {
            case 'WATER_R':              LIQUID_WATER_R = v; break;
            case 'WATER_G':              LIQUID_WATER_G = v; break;
            case 'WATER_B':              LIQUID_WATER_B = v; break;
            case 'WATER_ALPHA':          LIQUID_WATER_ALPHA = v; break;
            case 'WATER_FOAM_R':         LIQUID_WATER_FOAM_R = v; break;
            case 'WATER_FOAM_G':         LIQUID_WATER_FOAM_G = v; break;
            case 'WATER_FOAM_B':         LIQUID_WATER_FOAM_B = v; break;
            case 'OIL_R':                LIQUID_OIL_R = v; break;
            case 'OIL_G':                LIQUID_OIL_G = v; break;
            case 'OIL_B':                LIQUID_OIL_B = v; break;
            case 'OIL_ALPHA':            LIQUID_OIL_ALPHA = v; break;
            case 'WATER_PARTICLE_SIZE':  LIQUID_WATER_PARTICLE_SIZE = v; break;
            case 'OIL_PARTICLE_SIZE':    LIQUID_OIL_PARTICLE_SIZE = v; break;
            // v24.113 — surface render (field + threshold compositing).
            case 'SURFACE_RENDER':       LIQUID_SURFACE_RENDER = v; break;
            case 'SURFACE_THRESH':       LIQUID_SURFACE_THRESH = v; break;
            case 'SURFACE_SOFT':         LIQUID_SURFACE_SOFT = v; break;
            case 'SURFACE_RSCALE':       LIQUID_SURFACE_RSCALE = v; break;
            case 'DROPLETS':             LIQUID_DROPLETS = v ? 1 : 0; break;   // v25.32 visible strays/spray
            // v25.57 BATH B1 heat tint (docs/game/BATHHOUSE_PLAN.md): dial
            // the hot-water look for the feel-check; STR 0 kills the tint.
            case 'BATH_TINT_R':          LIQUID_BATH_TINT_R = v; break;
            case 'BATH_TINT_G':          LIQUID_BATH_TINT_G = v; break;
            case 'BATH_TINT_B':          LIQUID_BATH_TINT_B = v; break;
            case 'BATH_TINT_STR':        LIQUID_BATH_TINT_STR = v < 0 ? 0 : v; break;
            case 'DBG_PARTICLES':        LIQUID_DBG_PARTICLES = v ? 1 : 0; break;   // v24.160 particle-proof overlay
            default: break;  // unknown name — no-op
          }
        } catch (_) {}
      },
      // v14.26 — live sim-physics setter. Mutates one of the module's
      // LIQUID_* fluid-feel physics vars by name; the next writeSimParams()
      // (run at the top of runGrid2 / runG2P / runCollide) pushes it into
      // the SimParams uniform, so the GPU compute kernels pick it up on the
      // very next sim step — NO shader recompile (the kernels read `sp`).
      // `name` is the var name WITHOUT the LIQUID_ prefix, e.g. 'GRAVITY'.
      // Unknown names are a no-op. Mirrors setRenderParam.
      setSimParam: function (name, value) {
        try {
          var v = +value;
          if (!isFinite(v)) return;
          switch (name) {
            // grav / pressure
            // v24.169 — also update the LIQUID_MATS row so the change reaches
            // the GPU: writeSimParams() sources MATS[0].gravity each frame, so
            // setting only LIQUID_GRAVITY left the kernel on the boot value
            // (the old "gravity is compile-time baked" gotcha). Now live.
            case 'GRAVITY':              LIQUID_GRAVITY = v; if (LIQUID_MATS && LIQUID_MATS[0]) LIQUID_MATS[0].gravity = v; break;
            case 'OIL_GRAVITY':          LIQUID_OIL_GRAVITY = v; if (LIQUID_MATS && LIQUID_MATS[1]) LIQUID_MATS[1].gravity = v; break;
            case 'PRESSURE_STIFF':       LIQUID_PRESSURE_STIFF = v; break;
            case 'OIL_PRESSURE_STIFF':   LIQUID_OIL_PRESSURE_STIFF = v; break;
            // aeration (foam) — water + oil
            case 'AERATION_BLUR':        LIQUID_AERATION_BLUR = v; break;
            case 'AERATION_DAMP':        LIQUID_AERATION_DAMP = v; break;
            case 'OIL_AERATION_BLUR':    LIQUID_OIL_AERATION_BLUR = v; break;
            case 'OIL_AERATION_DAMP':    LIQUID_OIL_AERATION_DAMP = v; break;
            case 'AERATION_THRESHOLD':     LIQUID_AERATION_THRESHOLD = v; break;
            case 'OIL_AERATION_THRESHOLD': LIQUID_OIL_AERATION_THRESHOLD = v; break;
            case 'AERATION_COEFF':         LIQUID_AERATION_COEFF = v; break;
            case 'OIL_AERATION_COEFF':     LIQUID_OIL_AERATION_COEFF = v; break;
            // damping / motion
            // v26.15: writeSimParams sources these three lanes from the
            // material table, so updating only the legacy scalar left the GPU
            // frozen at its boot damping/motion values. That made every live
            // RAW/lively push a no-op on WebGPU while CPU fallback obeyed it.
            case 'DAMPING':              LIQUID_DAMPING = v; if (LIQUID_MATS && LIQUID_MATS[0]) LIQUID_MATS[0].damping = v; break;
            case 'OIL_DAMPING':          LIQUID_OIL_DAMPING = v; if (LIQUID_MATS && LIQUID_MATS[1]) LIQUID_MATS[1].damping = v; break;
            case 'GRID_VISC':            LIQUID_GRID_VISC = v; break;
            // v26.53 two-scale quiet filter. These values affect only
            // low-energy body water; they never resize the renderer or alter time.
            case 'QUIET_VISC':           LIQUID_QUIET_VISC = v < 0 ? 0 : (v > 0.2 ? 0.2 : v); break;
            case 'QUIET_SPEED':          LIQUID_QUIET_SPEED = v < 1 ? 1 : v; break;
            case 'QUIET_SHEAR':          LIQUID_QUIET_SHEAR = v < 1 ? 1 : v; break;
            case 'QUIET_DRAG':           LIQUID_QUIET_DRAG = v < 0 ? 0 : (v > 0.05 ? 0.05 : v); break;
            case 'DECLUMP_ON':           LIQUID_DECLUMP_ON = v ? 1 : 0; break;   // v24.185 anti-clump on/off
            // v24.173 Old-Faithful — speed cap + speed-gated burst damp (g2pC)
            case 'MAX_VEL':              LIQUID_MAX_VEL = v < 0 ? 0 : v; break;
            // v25.41 — shallow-popcorn root fix (feel lanes)
            case 'COHESION':             LIQUID_COHESION = v < 0 ? 0 : (v > 1 ? 1 : v); break;
            case 'AIR_DRAG':             LIQUID_AIR_DRAG = v < 0.9 ? 0.9 : (v > 1 ? 1 : v); break;
            case 'PRESSURE_MAX_DV':      LIQUID_PRESSURE_MAX_DV = v < 0 ? 0 : v; break;
            case 'LIP_FRICTION':         LIQUID_LIP_FRICTION = v < 0.9 ? 0.9 : (v > 1 ? 1 : v); break;   // v25.45 ledge spill
            case 'BURST_DAMP':           LIQUID_BURST_DAMP = v; break;
            case 'BURST_GATE_LO':        LIQUID_BURST_GATE_LO = v; break;
            case 'BURST_GATE_HI':        LIQUID_BURST_GATE_HI = v; break;
            // v24.145 — calm ramp (g2pB.w): 0 stimulated .. 1 settled; the
            // game's liquidStateTick pushes this (fround-quantized) per
            // frame. GRID_VISC above also receives the calm-BLENDED value
            // per frame from the same tick (the gm lever's pristine target
            // lives game-side in 020).
            // v25.56 BATHHOUSE B1 (docs/game/BATHHOUSE_PLAN.md): the
            // heat channel. BATH_ON also gates the heatNormalize dispatch.
            case 'BATH_ON':              LIQUID_BATH_ON = v ? 1 : 0; break;
            case 'BATH_EXCHANGE':        LIQUID_BATH_EXCHANGE = v < 0 ? 0 : (v > 1 ? 1 : v); break;
            case 'BATH_COOL':            LIQUID_BATH_COOL = v < 0 ? 0 : v; break;
            case 'BATH_BUOY':            LIQUID_BATH_BUOY = v; break;
            case 'BATH_SRC_X0':          LIQUID_BATH_SRC_X0 = v; break;
            case 'BATH_SRC_Y0':          LIQUID_BATH_SRC_Y0 = v; break;
            case 'BATH_SRC_X1':          LIQUID_BATH_SRC_X1 = v; break;
            case 'BATH_SRC_Y1':          LIQUID_BATH_SRC_Y1 = v; break;
            case 'BATH_SRC_T':           LIQUID_BATH_SRC_T = v < 0 ? 0 : (v > 2 ? 2 : v); break;
            case 'BATH_SRC_RATE':        LIQUID_BATH_SRC_RATE = v < 0 ? 0 : (v > 1 ? 1 : v); break;
            case 'CALM':                 LIQUID_CALM = v < 0 ? 0 : (v > 1 ? 1 : v); break;
            // v24.124 — fixed-quantum substepping toggle (runFrame host
            // partitioning, not a SimParams lane); reset the bank on flip
            case 'FIXED_STEP':           LIQUID_FIXED_STEP = v ? 1 : 0; liquidStepAcc = 0; break;
            // v25.29 — sim playback rate (runFrame host partitioning, not a
            // SimParams lane); reset the bank so the flip is clean
            case 'TIMESCALE':            LIQUID_TIMESCALE = (v > 0 && isFinite(v)) ? v : 1; liquidStepAcc = 0; break;
            // v24.120 debug kit — bit 1 no-sleep, bit 2 no-brake (coll.w)
            case 'DBG_FLAGS':            LIQUID_DBG_FLAGS = v & 3; break;
            // v24.120 debug kit — CPU-mirror refresh cadence in frames (not
            // a SimParams lane; the DBG_DRAW overlay samples the mirror)
            case 'DBG_READBACK_EVERY':   LIQUID_READBACK_EVERY = Math.max(2, Math.min(120, v | 0)); break;
            case 'WATER_MOTION_SCALE':   LIQUID_WATER_MOTION_SCALE = v; if (LIQUID_MATS && LIQUID_MATS[0]) LIQUID_MATS[0].motionScale = v; break;
            // grid-boundary — wall bounce + floor/wall friction (water + oil)
            case 'WALL_BOUNCE_IN':       LIQUID_WALL_BOUNCE_IN = v; break;
            case 'WALL_BOUNCE_EDGE':     LIQUID_WALL_BOUNCE_EDGE = v; break;
            case 'FLOOR_FRICTION':       LIQUID_FLOOR_FRICTION = v; break;
            case 'WALL_FRICTION':        LIQUID_WALL_FRICTION = v; break;
            case 'OIL_WALL_BOUNCE_IN':   LIQUID_OIL_WALL_BOUNCE_IN = v; break;
            case 'OIL_WALL_BOUNCE_EDGE': LIQUID_OIL_WALL_BOUNCE_EDGE = v; break;
            case 'OIL_FLOOR_FRICTION':   LIQUID_OIL_FLOOR_FRICTION = v; break;
            case 'OIL_WALL_FRICTION':    LIQUID_OIL_WALL_FRICTION = v; break;
            // terrain restitution
            case 'BOUNCE_WATER':         LIQUID_BOUNCE_WATER = v; break;
            case 'BOUNCE_OIL':           LIQUID_BOUNCE_OIL = v; break;
            // v15.0 — sparse block grid on/off (a dispatch-path flag, not a
            // SimParams lane). Live A/B: 1 = sparse active-block chain
            // (shipping default), 0 = the dense full-bbox chain. A
            // dense->sparse flip must re-establish the global-zero
            // invariant (dense start-clears rather than end-clears), so
            // runFrame runs one denseClearAll first.
            case 'SPARSE':
              var wasSparse = LIQUID_SPARSE;
              LIQUID_SPARSE = v ? 1 : 0;
              if (!wasSparse && LIQUID_SPARSE) { instance.needsDenseClear = true; }
              break;
            // v15.0 — hybrid-gate threshold (bbox cells; dense below,
            // sparse at/above; exit at half). 0 = always sparse.
            case 'SPARSE_MIN_CELLS':
              LIQUID_SPARSE_MIN_CELLS = Math.max(0, v | 0);
              break;
            default: break;  // unknown name — no-op
          }
        } catch (_) {}
      },
      // v15.0 — dev perf probe: run the live sim chain `frames` times,
      // serializing each frame against onSubmittedWorkDone, and resolve
      // with the average wall ms per frame (CPU encode + full GPU solve),
      // the active-block count and the grid size. Call from the console:
      //   LiquidWGPU.last.bench(120).then(console.log)
      // Flip water.SPARSE 0/1 between runs for the A/B. Advances the real
      // sim (it IS the live chain), so bench on settled water.
      bench: function (frames, dt) {
        if (!instance.simActive) { return Promise.resolve(null); }
        var n = Math.max(1, frames | 0 || 60);
        var d = (typeof dt === 'number' && dt > 0) ? dt : (1 / 60);
        var seq = Promise.resolve();
        var t0 = 0;
        var step = function () {
          runFrame(instance, d);
          return instance.queue.onSubmittedWorkDone();
        };
        seq = seq.then(function () { t0 = performance.now(); });
        for (var k = 0; k < n; k++) { seq = seq.then(step); }
        return seq.then(function () {
          return {
            sparse: !!useSparse(instance),
            frames: n,
            msPerFrame: (performance.now() - t0) / n,
            activeBlocks: instance.activeBlocks,
            gridCells: instance.grid ? instance.grid.cells : 0,
            particles: instance.uploadedCount | 0
          };
        });
      },
      uploadParticles: function () { return uploadParticles(instance); },
      // Stage 2 — rebuild the spatial grid from the current particle
      // buffers. Caller is expected to uploadParticles() first; the
      // bbox is recomputed from the CPU snapshot each build.
      buildGrid: function () {
        var n = uploadParticles(instance);
        if (n > 0 || (instance.grid && instance.grid.cells > 0)) {
          computeGridBounds(instance, n);
          buildGrid(instance);
        }
        return n;
      },
      // Stage 3 — upload + build the grid + run the P2G scatter. The
      // later sim stages chain runP2G into the full per-frame step;
      // exposed now for harness use.
      runP2G: function () {
        var n = uploadParticles(instance);
        if (n > 0 || (instance.grid && instance.grid.cells > 0)) {
          computeGridBounds(instance, n);
          buildGrid(instance);
          runP2G(instance);
        }
        return n;
      },
      // Stage 4 — upload + build the grid + run P2G + the pressure/grid
      // chain (P2G -> clearDV -> pressure -> grid update). Exposed for
      // harness use; Stage 5's runG2P chains G2P on after this.
      runGrid2: function () {
        var n = uploadParticles(instance);
        if (n > 0 || (instance.grid && instance.grid.cells > 0)) {
          computeGridBounds(instance, n);
          buildGrid(instance);
          runP2G(instance);
          runGrid2(instance);
        }
        return n;
      },
      // Stage 5 — upload + build the grid + run the full core MPM step:
      // buildGrid -> P2G -> clearDV -> pressure -> gridUpdate -> g2p.
      // The later sim stages chain this as the per-frame step; exposed
      // now for harness use.
      runG2P: function () {
        var n = uploadParticles(instance);
        if (n > 0 || (instance.grid && instance.grid.cells > 0)) {
          computeGridBounds(instance, n);
          buildGrid(instance);
          runP2G(instance);
          runGrid2(instance);
          runG2P(instance);
        }
        return n;
      },
      // Stage 6 — upload + build the grid + run the full per-frame step
      // with GPU terrain collision: buildGrid -> P2G -> clearDV ->
      // pressure -> gridUpdate -> g2p -> collide. The terrain tile rect is
      // recomputed from the particle snapshot each call and the solidity
      // mask refilled (via the game's fillTerrainSolid hook) + uploaded
      // before the collide kernel. The later sim stages chain this as the
      // per-frame step; exposed now for harness use.
      runCollide: function () {
        var n = uploadParticles(instance);
        if (n > 0 || (instance.grid && instance.grid.cells > 0)) {
          computeGridBounds(instance, n);
          computeTerrainBounds(instance, n);
          uploadTerrainMask(instance);
          buildGrid(instance);
          runP2G(instance);
          runGrid2(instance);
          runG2P(instance);
          runCollide(instance);
        }
        return n;
      },
      dispose: function () {
        if (instance.buf) {
          for (var k in instance.buf) {
            if (instance.buf[k]) { try { instance.buf[k].destroy(); } catch (_) {} }
          }
        }
        if (instance.paramsBuf) { try { instance.paramsBuf.destroy(); } catch (_) {} }
        if (instance.gameParamsBufs) {
          for (var gb = 0; gb < instance.gameParamsBufs.length; gb++) {
            try { instance.gameParamsBufs[gb].destroy(); } catch (_) {}
          }
        }
        if (instance.simParamsBuf) { try { instance.simParamsBuf.destroy(); } catch (_) {} }
        if (instance.renderParamsBuf) { try { instance.renderParamsBuf.destroy(); } catch (_) {} }
        // Stage 8 — the readback mirror buffers. Unmap any in-flight map
        // before destroy (destroying a mapped buffer is fine, but unmap
        // keeps the teardown clean).
        if (instance.rb) {
          for (var rk in instance.rb) {
            if (instance.rb[rk]) {
              try { instance.rb[rk].unmap(); } catch (_) {}
              try { instance.rb[rk].destroy(); } catch (_) {}
            }
          }
        }
        // Stage 7 — drop the render canvas from the DOM + unconfigure it.
        if (instance.renderCanvas) {
          try {
            if (instance.renderCtx) instance.renderCtx.unconfigure();
            if (instance.renderCanvas.parentElement) {
              instance.renderCanvas.parentElement.removeChild(instance.renderCanvas);
            }
          } catch (_) {}
        }
        if (instance.device) { try { instance.device.destroy(); } catch (_) {} }
        instance.available = false;
        instance.simActive = false;
        instance.renderActive = false;
        instance.renderReady = false;
      }
    };

    if (typeof navigator === 'undefined' || !navigator.gpu) {
      instance.failed = true;
      instance.readyPromise = Promise.resolve(false);
      try { console.log('LiquidWGPU: navigator.gpu unavailable — CPU solver fallback.'); } catch (_) {}
      return instance;
    }

    instance.readyPromise = initDevice(instance);
    // v15.0 — console/dev handle to the newest instance (the game keeps
    // its own reference in a closure): LiquidWGPU.last.bench(120),
    // LiquidWGPU.last.setSimParam('SPARSE', 0), LiquidWGPU.last.activeBlocks.
    window.LiquidWGPU.last = instance;
    return instance;
  }

  window.LiquidWGPU = { create: create, stage: STAGE, last: null };
})();
