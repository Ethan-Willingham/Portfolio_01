  /* ---- Game State ---- */
  var world = [];
  var cam = { x: 0, y: 0 };
  var player = {};
  var TERRAIN_CHUNK_TILES = 4;
  var TERRAIN_CHUNK_PX = TERRAIN_CHUNK_TILES * TILE;
  var TERRAIN_CHUNK_PAD = 10;
  // TERRAIN_CHUNK_RENDER_SCALE_MIN/MAX and the live TERRAIN_CHUNK_RENDER_SCALE
  // live in the Resolution config block (v13.21 — all res knobs in one place).
  var TERRAIN_CHUNK_CACHE_LIMIT = 180;
  var TERRAIN_CHUNK_REBUILDS_PER_FRAME = 1;

  // ============================================================
  // TILE DETAIL ATLAS
  // Pre-renders the expensive per-tile clod/chip detail into 16
  // variants per (kind, layer). Chunk rendering then becomes a
  // drawImage from the atlas instead of ~150 hash calls + ellipses
  // per tile. Set USE_TILE_ATLAS = false to revert to live rendering.
  // The variant for each (r,c) is picked by tileHash01 so the same
  // world tile always gets the same detail across chunk rebuilds.
  // ============================================================
  var USE_TILE_ATLAS = false;
  var TILE_ATLAS_VARIANTS = 16;
  var TILE_ATLAS_SCALE = 2;
  var TILE_ATLAS_BLEED = 4;
  var tileAtlasCache = null;
  var TILE_ATLAS_LAYERS = ['topsoil', 'bedrock', 'permafrost', 'fossil', 'deepcrust', 'magma', 'crystal', 'mantle'];
  var USE_EARLY_ORE_ATLAS = true;
  var EARLY_ORE_ATLAS_VARIANTS = 96;
  var EARLY_ORE_ATLAS_SCALE = 2;
  var EARLY_ORE_ATLAS_TYPES = ['coal', 'copper', 'bauxite', 'iron'];
  var earlyOreAtlasCache = null;
  var terrainChunkCache = {};
  var terrainChunkCount = 0;
  var terrainChunkUseTick = 0;
  var terrainChunkRebuildsThisFrame = 0;
  var terrainWarmupFrames = 3;
  var terrainChunkRebuildBoostFrames = 0;
  var introPhase = 'warmup';
  var introHoldTimer = 0.2;
  // Warmup leaves the dark overlay up until the renderer has actually
  // settled — terrainChunkRebuildsThisFrame reaches 0 for a few frames in
  // a row — instead of a hard frame count. That way restart and fresh-load
  // both wait for the visible chunks to be fully built before fading in,
  // and we don't see tiles popping through the fade.
  var introSettledFrames = 0;
  var introWarmupFramesRun = 0;
  var terrainClearOverlays = [];
  var terrainClearedKinds = {};
  var upgrades = {
    drillLevel: 1,
    fuelLevel: 1,
    hullLevel: 1,
    cargoLevel: 1,
    boosterLevel: 1, // booster: 5 thrust tiers, tier 3 = today's flight feel (getBoosterThrustMult)
    heatLevel: 0,    // 0 = no heated drill, 1 = owns it (binary upgrade)
    shieldLevel: 0,  // 0 = no heat shield, 1+ = tiers reduce magma damage
    vertLevel: 0,    // 0 = no upward drill, 1 = owns it (binary upgrade)
    pumpLevel: 0,    // 0 = no oil pump, 1+ = suction range + tank capacity
  };
  var shop = {
    drill:  [0, 120, 350, 900, 2400, 6000, 15000],
    // Fuel: 6 capacity tiers, like the other numeric upgrades. Front-loaded
    // curve (v11.35) so the first upgrade is meaningful and players aren't
    // stuck topping off a tiny tank all run.
    fuel:   [0,  50, 160, 420, 1100, 2800],
    hull:   [0, 150, 420, 1100, 3000, 7200, 18000],
    cargo:  [0, 180, 480, 1200, 3300, 8400, 21000],
    // Booster: 5 thrust tiers (tier 3 = today's feel). Length 5 => max level 5;
    // costs[lvl] = cost from lvl->lvl+1. Fresh runs start at tier 1 (see init()).
    booster:[0, 200, 550, 1500, 4200],
    heat:   [900],          // single purchase: heated drill
    shield: [2400, 5400],   // shield tier 1 (reduce magma dmg), tier 2 (immune)
    vert:   [1500],         // single purchase: drill upward
    pump:   [1600, 5200, 14000], // oil pump tiers: enables suction, bigger range/tank
    teleporter: 400,        // consumable — one-time-use return-to-surface charge
    balloon: 600,           // consumable — one-time-use rover-balloon deep drop
    bombSmall: 250,         // consumable — single-tile blast, breaks barrier
    bombLarge: 800,         // consumable — 3×3 blast, breaks barrier + clears terrain
    reserveFuel: 100,       // consumable — emergency fuel tank, auto-deploys at empty (max 4)
  };
  var DRILL_TIER_NAMES = ['', 'Rusty Auger Drill', 'Workshop Auger Drill', 'Carbide Tooth Drill', 'Tungsten Jaw Drill', 'Diamond Bore Drill', 'Plasma Crown Drill', 'Void Helix Drill'];
  var DRILL_TIER_SHORT_NAMES = ['', 'RUSTY DRILL', 'WORKSHOP DRILL', 'CARBIDE DRILL', 'TUNGSTEN DRILL', 'DIAMOND DRILL', 'PLASMA DRILL', 'VOID DRILL'];
  function drillTierName(level) {
    if (level < 1) level = 1;
    if (level >= DRILL_TIER_NAMES.length) return 'Drill Mk ' + level;
    return DRILL_TIER_NAMES[level];
  }
  function drillTierShortName(level) {
    if (level < 1) level = 1;
    if (level >= DRILL_TIER_SHORT_NAMES.length) return 'MK ' + level + ' DRILL';
    return DRILL_TIER_SHORT_NAMES[level];
  }
  function drillArtTier(level) {
    // Tier 1 is rusty junk; tier 2 is the clean original miner-mounted
    // rotary drill; tier 3 upgrades the teeth; tier 4 reinforces the head;
    // tier 5 is the rugged Diamond Bore core saw; tier 6 is Plasma Crown.
    // Higher levels reuse Plasma Crown until their own item-art passes land.
    if (level <= 1) return 1;
    if (level === 2) return 2;
    if (level === 3) return 3;
    if (level === 4) return 4;
    if (level === 5) return 5;
    return 6;
  }
  var money = 0;
  var cargo = [];
  var maxCargo = 5;
  var maxFuel = 30;
  var teleporters = 0;        // one-time-use teleport-to-surface charges
  var teleportFx = null;      // visual flash when a teleport fires
  var balloons = 0;           // one-time-use rover-balloon drop charges
  var bombsSmall = 0;         // small explosive charges (single-tile blast)
  var bombsLarge = 0;         // large explosive charges (3×3 blast)
  var reserveFuel = 0;        // emergency fuel tanks — auto-deploy when the main tank runs dry
  var RESERVE_FUEL_MAX = 4;       // most reserve tanks the rig can carry at once
  var RESERVE_FUEL_REFILL = 50;   // fuel granted when one reserve tank auto-deploys
  var explosions = [];        // active blast visual+damage effects
  var liveBombs = [];         // bombs that have been dropped and are currently fuse-burning
  var liquidParticles = [];   // compatibility view; liquid hot path uses typed arrays below
  var liquidCount = 0;
  // v14.2 — monotonic counter, bumped whenever the CPU side adds or removes
  // a particle (or oil suction nudges one). The WebGPU solver reads it to
  // decide when to re-seed its GPU buffers from these arrays: on frames
  // where it has not changed, the GPU keeps simulating its own resident
  // buffers, so the sim advances one step every frame regardless of how
  // long the async readback round-trip takes. See runFrame in liquid-wgpu.js.
  var liquidMutationSeq = 0;
  // v25.12 — WebGPU water draw idle countdown. draw() (runRender) always runs a
  // full-screen composite pass regardless of particle count, so on a dry surface
  // it burns GPU for nothing (a big slice of a weak mobile Mali's frame). drawLiquids
  // skips draw() once there is no water, but keeps drawing for this many frames AFTER
  // liquidCount hits 0 before idling: runRender uses the GPU-resident uploadedCount,
  // which lags the CPU liquidCount by the readback round-trip, so we let those tail
  // frames flush the GPU to empty (the composite pass loadOp:'clear' then wipes the
  // canvas to transparent — no ghost water) before stopping the draw entirely.
  var liquidWGPUIdleDrawFrames = 0;
  // v24.109 — GPU-resident mutation ops. Every particle add/remove (and the
  // few CPU-side state writes: the oil-suction nudge, the dig wake) is
  // logged here and REPLAYED on the GPU against its resident buffers,
  // instead of re-uploading the whole readback-lagged CPU mirror over live
  // water (which snapped every particle backwards in time on each mutation).
  // CONTRACT: any code that bumps liquidMutationSeq MUST also push a
  // matching op (or set liquidOpsOverflow), or its change never reaches the
  // GPU while the GPU is resident. Slot layouts (flat number array):
  //   ADD    1, x, y, vx, vy, type, origin
  //   REMOVE 2, i
  //   POKE   3, i, vx, vy, aeration, type, origin   (suction nudge + wake)
  //   WAKE   4, i, type, origin                     (clear sleeping state)
  // Consumed (length = 0) by liquid-wgpu's applyParticleOps; the CPU solver
  // path and init() clear it instead. Overflow forces one full GPU
  // re-upload (the old behaviour) and the log restarts clean.
  var liquidOps = [];
  var liquidOpsOverflow = false;
  var LIQUID_OPS_MAX = 300000;
  // ?pondtest=1 dev hook (040): also enables the POND stat probe (070) so
  // headless runs can chart sleep convergence without the dev overlay.
  var pondTestMode = false;
  // v24.143 — which pondtest scenario: 1 shore spawn, 2 float mid-pond,
  // 3 = shore spawn + timed BREACH (070 digs the pond's right wall open
  // into a fresh pit at t=20s, so the dig -> drain -> flow -> re-settle
  // gameplay loop can be measured headlessly; the rest poses never
  // exercised it and that is exactly where the owner's slush / mid-flow
  // freeze / pressure-pop complaints live).
  var pondTestKind = 0;
  var pondTestBreachT = 0;          // seconds until/past the timed breach
  var pondTestBreachPond = null;    // the breached pond (probe pit/pond split)
  // v24.125 — pending ?wdbg=NAME:V,NAME:V lever sets (parsed in 040 init,
  // applied via gm.set on the first liquid update once the facade is up).
  // Lets headless harness runs set water levers with no keyboard, e.g.
  // ?pondtest=1&wdbg=DBG_DRAW:1,DBG_NO_SLEEP:1
  var pondTestWdbg = '';
  var pondTestProbeTick = 0;
  var liquidType = new Uint8Array(LIQUID_MAX_PARTICLES);       // 0 water, 1 oil
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
  var liquidOrigin = new Uint8Array(LIQUID_MAX_PARTICLES);  // 0 world, 1 surface water, 2 surface oil
  var liquidPrevX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidPrevY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidLX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidLY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidPVX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidPVY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidGX = new Int32Array(LIQUID_MAX_PARTICLES);
  var liquidGY = new Int32Array(LIQUID_MAX_PARTICLES);
  var liquidDX = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidDY = new Float32Array(LIQUID_MAX_PARTICLES);
  var liquidW = new Float32Array(LIQUID_MAX_PARTICLES * 9);
  var liquidNbrs = new Int32Array(LIQUID_MAX_PARTICLES * 9);
  var LIQUID_STENCIL_OX = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
  var LIQUID_STENCIL_OY = [-1, -1, -1, 0, 0, 0, 1, 1, 1];
  // Open-addressed hash table for cell lookup (replaces Map).
  // Power-of-two size keeps slot mod cheap. Frame-stamp trick lets us
  // "clear" by bumping a counter — only O(1) per frame regardless of fill.
  var LIQUID_HASH_BITS = 18;
  var LIQUID_HASH_SIZE = 1 << LIQUID_HASH_BITS;
  var LIQUID_HASH_MASK = LIQUID_HASH_SIZE - 1;
  var liquidHashKeys = new Int32Array(LIQUID_HASH_SIZE);
  var liquidHashVals = new Int32Array(LIQUID_HASH_SIZE);
  var liquidHashStamp = new Int32Array(LIQUID_HASH_SIZE);
  var liquidHashFrame = 0;
  // Sleep + freeze flags. Sleeping = locally still, skips ApplyGridPressure
  // + G2P. Frozen = far outside camera, skips everything.
  var liquidSleeping = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidFrozen = new Uint8Array(LIQUID_MAX_PARTICLES);
  var liquidRestFrames = new Uint16Array(LIQUID_MAX_PARTICLES);
  // v24.175 — ORPHAN DWELL: consecutive orphan-ticks (~0.25s each at 120fps) a
  // particle has been an isolated stray. The orphan tick evaporates slow strays
  // immediately (the v24.158 < 6 px/s rule), but a FAST lone particle (on the
  // pond surface or alone on dirt) slips that guard and, in saharan-raw, has no
  // sleep + no damping below the burst gate + no neighbours to settle against,
  // so it jitters forever (the owner's "giant excited orphan"). A persistent
  // stray is told apart from a transient spew droplet by TIME, not speed: this
  // counts how long it has stayed isolated; past LIQUID_ORPHAN_DWELL_TICKS it
  // evaporates regardless of speed. Spew droplets are clustered (n high) or
  // land/merge quickly, so they never reach the threshold.
  var liquidOrphanDwell = new Uint8Array(LIQUID_MAX_PARTICLES);
  var LIQUID_ORPHAN_DWELL_TICKS = 8;  // orphan ticks a fast stray must persist before evaporating (gm water.ORPHAN_DWELL)
  var LIQUID_SLEEP_FRAMES = 45;       // consecutive low-KE frames before sleeping (v24.112: 60 -> 45; edit2 liquid-wgpu.js)
  var LIQUID_SLEEP_VSQ = 9.0;         // px/s squared — sleep below this (v24.112: 1.0 -> 9.0, |v| < 3 px/s;
                                      // at 1.0 a settled pond's surface simmer kept every particle awake
                                      // forever. edit2 liquid-wgpu.js)
  var LIQUID_WAKE_CELL_VSQ = 0.007;   // cell-units squared — wake if local cell exceeds
                                      // (v24.112: 0.0005 -> 0.002 ~27 px/s; v24.125: -> 0.007 ~53 px/s.
                                      // Measured: an energized pond's ambient ripple peaks 40-90 px/s,
                                      // so at 27 the soup re-woke sleepers forever and never converged;
                                      // at 53 sleep ratchets up. Real disturbances (swim eject, digs,
                                      // bombs, fills) are 100s of px/s or explicit wake ops. edit2
                                      // liquid-wgpu.js)
  // v24.112 rest brake: extra per-substep damping ONLY below |v| = 25 px/s,
  // so the solver's standing pressure-noise floor (measured mean ~20 px/s in
  // a "settled" pond) decays to true rest and the sleep gate can latch.
  // Real flows above the threshold are untouched. edit2 liquid-wgpu.js.
  var LIQUID_REST_BRAKE_VSQ = 625.0;  // px/s squared — gentle stage below |v| = 25 px/s
  var LIQUID_REST_BRAKE = 0.92;       // gentle multiplier per substep
  var LIQUID_REST_BRAKE_HARD_VSQ = 100.0;  // px/s squared — hard stage below |v| = 10 px/s
  var LIQUID_REST_BRAKE_HARD = 0.75;  // hard multiplier per substep (beats the ~1 px/s pressure pump)
  // ---- v24.145 WATER STATE MACHINE: stimulated -> settling -> frozen ----
  // The v24.112-125 rest machinery (brake + viscosity 0.45 + per-particle
  // sleep) was tuned to make a LEVEL RESTING pond converge, but it ran
  // unconditionally, which produced exactly the owner's three complaints:
  //   - SLUSH: the brake grinds ALL motion under 25 px/s + visc 0.45 all
  //     the time, so flowing water moves like cold honey;
  //   - MID-FLOW FREEZE: the brake drags gentle flows under the 3 px/s
  //     sleep gate, freezing water in an UNLEVEL pose with stored head;
  //   - PRESSURE-POP WAVES: sleeping particles splat mass but skip the
  //     pressure solve, so they are walls; awake water piles against them
  //     until a cell bursts the 53 px/s wake threshold and a whole patch
  //     wakes in sync (per-CELL wake) = pop, wave, re-sleep, forever. The
  //     ~200ms idle-skip heartbeat (merged catch-up step) re-kicked full-
  //     sleep ponds the same way.
  // The cure is the rigid-body engine pattern (island sleep): the water
  // body is either LIVELY (calm 0: no brake, low viscosity — splashes and
  // flows like water), SETTLING (calm ramps to 1: the proven brake+visc
  // grind it to stillness), or FROZEN (stepping stops ENTIRELY — time does
  // not pass for the water, so it physically cannot pop; no heartbeat, no
  // banked catch-up dt). Only a real stimulus thaws it: dig-wake/suction
  // ops, rig above the speed gate, explosions, rocket. Fills/drains/sweeps
  // (ADD/REMOVE ops) are SOFT stimuli: they thaw + hold the settle timer
  // but do not drop calm, so a streamed pond arrives serene, not sloshing.
  // Driven per frame by liquidStateTick (070); calm rides to the GPU in
  // SimParams g2pB.w (the old _pad lane) and scales the brake factor
  // toward 1; grid viscosity is host-blended into the same uniform lane
  // the lever already used. edit2 liquid-wgpu.js (kernel + reference).
  var LIQUID_FREEZE = 1;              // 1 = whole-body freeze enabled (0 = legacy idle-skip path)
  // v24.169 — SAHARAN-RAW master switch (the re-port experiment). 1 = run
  // the sim like saharan's demo: ZERO dissipation (damping 1.0, motion 1.0,
  // grid-visc 0), NO sleep, NO brake, NO freeze, calm pinned 0. The bet:
  // our limit-cycle popcorn is the calm-machinery (esp. velocity damping
  // applied to v but NOT its affine matrix, so the affine re-injects what
  // damping removes); saharan damps NOTHING and is calm, so removing it
  // should kill the injection rather than unleash it. A/B via gm water.RAW
  // / ?wdbg=RAW:1 (it IS the default now; 0 restores the old machinery).
  // v24.169 — DEFAULT ON. The re-port: run saharan's model (zero dissipation,
  // no sleep/brake/freeze/visc). Measured vs the old machinery: the violent
  // synchronized pops ("pulled to the middle, BOOM, wave") are GONE; what
  // remains is a faint uniform shimmer (mean ~10 px/s), bounded, no explosion
  // even under sustained stimulus — saharan's actual rest behaviour, mostly
  // hidden under the surface render. water.RAW = 0 restores the old machinery.
  var LIQUID_RAW = 1;
  // v24.170 — RAW UNIFORM DAMPING. Back to 1.0 (= pure saharan, no uniform
  // damp) in v24.173: a uniform per-substep damp settles bursts too weakly
  // AND, with the clamped EOS, creeps the rest baseline up (damp -> particles
  // sink/compress more -> clamp converts it to pressure energy). The settling
  // is now done by the SPEED-GATED burst damp + velocity clamp below, which
  // leave resting water (already mean ~3-4 px/s from the v24.169 fix) alone.
  // Kept as a lever (0.97-1.0) for A/B; default 1.0 = untouched rest.
  var LIQUID_RAW_DAMP = 1.0;
  // v24.183 — RAW grid viscosity (the EOS-limit-cycle killer in RAW mode). 0 =
  // pure saharan (no viscosity, the v24.169 default). Raise it (e.g. 0.1-0.3)
  // to settle a stressed field that the velocity damping can't (the runaway
  // re-saturates the speed cap each step; grid viscosity cancels it at the
  // source). Live via gm water.RAW_VISC; pushed to GRID_VISC each frame by the
  // RAW branch in liquidStateTick (070).
  var LIQUID_RAW_VISC = 0;
  // v24.173 — THE OLD-FAITHFUL FIX (two parts; root-caused with the owner).
  // Stirring/compressing water over-densifies pockets; the clamped pressure
  // model ejects those particles HARD, and with no dissipation (saharan-raw)
  // that energy never leaves — a few "huge crazy particles" appear, hand
  // energy to neighbours, and the EOS re-injects on the next compression =
  // the owner's "infinite explosion fest." Two missing safeguards fix it:
  //   1. MAX_VEL — a hard per-particle speed cap (CFL stability backstop this
  //      sim never had). No particle can go crazy-fast, so a stir can't blow
  //      up into a runaway; the total energy is bounded. High enough to allow
  //      a dramatic Old-Faithful spew, low enough to kill the 1000s-px/s rage.
  //   2. BURST DAMP — speed-gated velocity damping: bleed energy ONLY from
  //      fast (disturbed) water and leave slow/resting water untouched, so a
  //      disturbance spews then settles (Old Faithful) WITHOUT the rest creep
  //      a uniform damp causes. Ramps from GATE_LO (no damp, above the rested
  //      ambient peak) to GATE_HI (full BURST_DAMP). Applied to the CARRIED
  //      linear velocity only (move full, affine full) = the MLS-MPM-
  //      consistent "velocity damping" form, never the move/transfer scale
  //      (that pumps energy). Water only; oil already self-damps. Always-on
  //      (only touches fast water, so the locked resting-calm baseline is
  //      safe). edit2 liquid-wgpu.js (module consts + SimParams g2pC lane +
  //      WGSL g2p kernel + the bit-faithful fr() reference). gm water.MAX_VEL
  //      / water.BURST_DAMP / water.BURST_GATE_LO / water.BURST_GATE_HI.
  var LIQUID_MAX_VEL = 600.0;         // px/s — hard per-particle speed cap (0 = off)
  var LIQUID_BURST_DAMP = 0.985;      // per-substep factor for FULLY-fast water (1.0 = off)
  var LIQUID_BURST_GATE_LO = 100.0;   // px/s — burst damp starts here (above rested ambient)
  var LIQUID_BURST_GATE_HI = 600.0;   // v25.20, was 300; free-fall reaches a realistic terminal (edit² liquid-wgpu.js)
  var LIQUID_VISC_LIVE = 0.10;        // grid viscosity while stimulated (lever target stays LIQUID_GRID_VISC;
                                      // v24.150: 0.15 -> 0.08, v24.152: 0.05, v24.157: -> 0.10 — part of the
                                      // lively dissipation floor that keeps the EOS pump bounded under
                                      // sustained stimulation; the settled grind gets the full lever value)
  // v24.152 — THE SLOSH FIX: the reference demo (saharan, the codebase our
  // solver is ported from) runs essentially UNDAMPED; ours carried months
  // of anti-popcorn dissipation on EVERY substep at 240 Hz: DAMPING 0.992
  // (-> 14.6%/s of velocity kept) x MOTION_SCALE 0.97 (-> 0.07%/s) meant
  // free sloshing died in ~1-2 s ("it just dies pretty quickly after
  // applying stimulus"). Those protections matter for SETTLING, not for
  // play: blend both toward raw while LIVELY (calm 0), restore the full
  // levers as calm ramps to 1. Host-side blend, pushed per frame like the
  // grid viscosity — no kernel changes; boot self-tests see the pristine
  // levers (the first state tick runs after go-live).
  // v24.157 — LIVELY DISSIPATION FLOOR. v24.152's near-raw values
  // (0.9995 / 1.0 / visc 0.05) EXPLODED a freshly-streamed lake under
  // sustained stimulation (the owner flew in: rig stim pinned calm at 0,
  // and the clamped-EOS energy pump compounded unchecked — the old
  // damping stack was what bounded that pump; "the brake must stay" was
  // measured WITH damping on). The lively state must always dissipate
  // faster than the pump injects: these values lose roughly half as much
  // energy as the old always-on stack (still far sloshier than pre-152)
  // and hold a permanently-stimulated fresh fill bounded for minutes
  // (?pondtest=4 is the regression harness for exactly this).
  var LIQUID_DAMP_LIVE = 0.9985;      // per-substep damping while lively (~30%/s kept; was 0.9995 = boom)
  var LIQUID_MOTION_LIVE = 0.997;     // near-full APIC transfer while lively (lever 0.97 = settled target)
  var liquidDampEff = LIQUID_DAMPING;
  var liquidMotionEff = LIQUID_WATER_MOTION_SCALE;
  var LIQUID_CALM_RAMP = 1.2;         // s — calm 0 -> 1 ramp once quiet
  var LIQUID_STIM_HOLD = 1.0;         // s — quiet time before calm starts rising
  var LIQUID_STIM_MAX = 6.0;          // s — hard cap: settle regardless of fast-water hold (convergence guarantee)
  var LIQUID_FAST_VSQ = 576.0;        // px/s squared — "still really flowing" metric (24 px/s, above the
                                      // brakeless ambient mean ~14, far below real flows at 50-300)
  var LIQUID_FREEZE_AWAKE_MIN = 6;    // freeze latch: awake count slack (absolute)
  var LIQUID_FREEZE_AWAKE_FRAC = 0.02; // freeze latch: awake fraction cap
  var LIQUID_FREEZE_HOLD = 0.5;       // s — latch condition must hold this long before freezing
  // v24.164 — FORCE FREEZE (the popcorn killer). A deep lake NEVER reaches
  // the awake-count freeze latch above, because the clamped-EOS limit cycle
  // (clump -> over-compress -> violent pressure release -> wave -> repeat,
  // the owner's "pulled to the middle then BOOM every ~0.5 s") keeps the
  // awake count high forever. Resting water shouldn't be simulated at all
  // (still water doesn't move), so after the body has been CALM (calm==1,
  // no stimulus) this long we freeze it REGARDLESS of awake count — but
  // only in a velocity TROUGH (!fastHold, few fast particles) so the
  // frozen snapshot is near-flat, not mid-wave. A jet/dig thaws it instantly.
  var LIQUID_FORCE_FREEZE_T = 1e9;    // v24.166 — DISABLED (was 2.0): the force-freeze froze mid-splash
                                      // particles in the AIR (owner: "frozen, way too big"). It only
                                      // masked the real bug anyway — our sim GAINED energy at rest. That
                                      // rest runaway is now fixed AT THE SOURCE (LIQUID_DENS_CAP + the
                                      // anti-clump pass, v24.182-186), so this masking force-freeze is no
                                      // longer needed for it. Set to a finite value to re-arm for A/B.
  var liquidCalmHoldT = 0;            // s calm has held at 1 (reset by any stimulus / calm drop)
  var LIQUID_CALM = 1;                // 0 lively .. 1 settled (state machine output, fround-quantized)
  var liquidGridViscEff = 0.45;       // host-blended viscosity = lerp(VISC_LIVE, LIQUID_GRID_VISC, calm)
  var liquidStimT = 99;               // s since last hard/soft stimulus
  var liquidStimSeq = -1;             // liquidMutationSeq tracker for stimulus detection
  var liquidFrozenAll = false;        // the whole-body freeze latch
  var liquidFreezeHoldT = 0;
  var liquidFastCount = 0;            // awake particles above LIQUID_FAST_VSQ (GPU: readback tally)
  var liquidPlayerFastFrames = 0;     // debounce: rig-above-gate must hold ~4 frames to count as
                                      // a stimulus (a single GC-hitch frame spikes |vy| via gravity*dt
                                      // and otherwise snaps a sleeping pond lively for nothing)
  var liquidStateName = 'live';       // probe/meter label: live | settling | settled | frozen
  // ---- v24.148 RIG WATER MEDIUM (deep lakes) ----
  // The lakes are 5-8 tiles deep, so the rig genuinely submerges. One
  // shared step in 080 (after every flight branch) applies drag + partial
  // buoyancy + a terminal sink speed, scaled by measured submersion
  // (playerWaterFrac, 040). The rig is iron: it SINKS, drives the lakebed,
  // and jets out — never bobs (a floating-vehicle model is a deliberately
  // avoided tuning pit). Net-in-water gravity 760*(1-BUOY) with DRAG /s
  // gives ~150 px/s natural terminal; SINK_VMAX pulls that to ~95, well
  // under the 340 px/s fall-damage floor, so lakebed landings are gentle
  // even before the water cushion. gm water.RIG_* levers.
  var WATER_RIG_DRAG = 2.2;           // /s exponential velocity drag at full submersion
  var WATER_RIG_BUOY = 0.55;          // fraction of gravity cancelled at full submersion
  var WATER_RIG_SINK_VMAX = 95;       // px/s terminal sink speed in deep coverage
  // v24.120 WATER DEBUG KIT — live A/B toggles for the resting-pond
  // "firecracker" hunt (whole sections jolt in sync ~1/s, then relax).
  // Each lever disables ONE suspect mechanism so the culprit can be
  // isolated by flipping it while staring at a pond (gm group 'water';
  // pair with DBG_DRAW's on-screen meter). All default 0 = shipping
  // behaviour. NO_SLEEP + NO_BRAKE also ride to the GPU kernels as a
  // bitmask in SimParams coll.w (edit2 liquid-wgpu.js: LIQUID_DBG_FLAGS
  // + WGSL G2P + the stage-5 reference); the rest are game-side only.
  var LIQUID_DBG_NO_SLEEP = 0;    // 1 = never sleep, force-wake sleepers (tests the sleep/wake limit cycle)
  var LIQUID_DBG_NO_BRAKE = 0;    // 1 = skip the two-stage rest brake (tests brake-threshold oscillation)
  var LIQUID_DBG_NO_IDLESKIP = 0; // 1 = never idle-skip sim frames (tests the merged heartbeat-step kick)
  var LIQUID_DBG_NO_SWEEP = 0;    // 1 = disable the ~2s stray sweep (tests sweep-removal jolts)
  var LIQUID_DBG_NO_PLAYER = 0;   // v24.167 DIAGNOSTIC: 1 = the rig is INVISIBLE to the water (no
                                  // eject, no cell-pin, not a stimulus). Isolates whether the resting
                                  // popcorn is the SIM injecting energy or the RIG COUPLING pumping it.
                                  // Game-side only (eject/pin live on the CPU mirror + GameParams).
  var LIQUID_DBG_FIXED_DT = 0;    // 1 = feed the sim a constant 1/60 s (tests frame-hitch/GC coupling)
  var LIQUID_DBG_DT_SPIKE = 0;    // ms — inject one fat frame every ~1.5 s (reproduces hitch coupling on demand)
  var LIQUID_DBG_DRAW = 0;        // 0 off | 1 meter + region box + pond extents | 2 = 1 + particle state dots
  var LIQUID_DBG_READBACK = 20;   // GPU mirror refresh cadence in frames (lower = snappier meter/dots while debugging)
  var LIQUID_ACTIVE_MARGIN = 0.85;    // v11.43 — wider margin so pools settle BEFORE the player arrives, instead of waking aggressively on approach (was 0.25)
  var liquidGridKeys = new Int32Array(LIQUID_MAX_CELLS);
  var liquidGridCount = 0;
  // v13.2 — particle-state census, refreshed each frame by
  // liquidUpdateActiveRegion; surfaced in the dev panel so liquid-sim
  // cost can be split across awake / sleeping / frozen particles.
  var liquidStatAwake = 0, liquidStatSleeping = 0, liquidStatFrozen = 0;
  var liquidCellGX = new Int32Array(LIQUID_MAX_CELLS);
  var liquidCellGY = new Int32Array(LIQUID_MAX_CELLS);
  var liquidCellMass = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellOilMass = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellAeration = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellVX = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellVY = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellDVX = new Float32Array(LIQUID_MAX_CELLS);
  var liquidCellDVY = new Float32Array(LIQUID_MAX_CELLS);
  var liquidGLCanvas = null;
  var liquidGL = null;
  var liquidGLProgram = null;
  var liquidGLBuffer = null;
  var liquidGLLocPos = -1;
  var liquidGLLocSize = -1;
  var liquidGLLocColor = -1;
  var liquidGLLocResolution = null;
  var liquidGLData = new Float32Array(LIQUID_MAX_PARTICLES * 7);
  var liquidGLDisabled = false;
  // v14.30 — WebGPU engine switches. The game has two engines for smoke +
  // water: the WebGPU pair (js/liquid-wgpu.js + js/smoke-wgpu.js) and the
  // original WebGL-smoke + CPU-water path. WebGPU only works in a SECURE
  // context (HTTPS or localhost); on a plain-HTTP LAN address (e.g.
  // http://192.168.x.x) navigator.gpu is absent, so the modules fall back
  // to WebGL/CPU on their own no matter what these flags say.
  // WebGPU WATER is ON for an A/B against the CPU water under the v14.29
  // big-pond stress test; load with ?cpuwater=1 to force CPU water even on
  // HTTPS, so the comparison can be flipped on one device. WebGPU SMOKE
  // stays OFF — the WebGL SmokeFluid renders better (WebGPU smoke was
  // broken on prod).
  var USE_WEBGPU_LIQUID = true;   // WebGPU water — only takes effect in a secure context
  var USE_WEBGPU_SMOKE  = false;  // WebGPU smoke — kept off; WebGL SmokeFluid renders better
  var liquidWGPU = null;          // WebGPU liquid solver; created at boot when USE_WEBGPU_LIQUID (+ secure context)
  var smokeWGPU = null;           // WebGPU smoke sim; shares the liquid device, created when USE_WEBGPU_SMOKE
  var USE_WEBGPU_JELLO = false;   // WebGPU jello inner loop — staged port (js/jello-wgpu.js), default OFF.
                                  // Stage 1 only boots the module + its self-test; nothing reads results yet.
  var jelloWGPU = null;           // WebGPU jello solver; shares the liquid device, created dormant at boot
  // Options handed to LiquidWGPU.create() — the persistent liquid typed
  // arrays (stable refs) + a live-count getter, so the GPU module can
  // mirror particle state without reaching into this IIFE.
  function liquidWGPUOpts() {
    return {
      // Stage 7 — the main game canvas. liquidWGPUCanvas is DOM-inserted
      // as its sibling (z-index 4) so the browser composites the liquid
      // layer natively, exactly like the CPU renderer's liquidGLCanvas.
      mainCanvas: canvas,
      liquid: {
        maxParticles: LIQUID_MAX_PARTICLES,
        getCount: function () { return liquidCount; },
        // v14.2 — GPU-residency signal; see liquidMutationSeq + runFrame.
        getMutationSeq: function () { return liquidMutationSeq; },
        // v24.109 — hand the pending mutation-op stream to the GPU replay
        // (Stage 8b in liquid-wgpu.js). Returns null exactly once after an
        // overflow, which tells the consumer to do a full re-upload; the
        // consumer resets the array's length when it has applied the ops.
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
        // World constants the Stage-5 G2P kernel needs for its world-bounds
        // position clamp (minX/maxX/minY/maxY in grid units).
        world: { COLS: COLS, TILE: TILE, TOTAL_ROWS: TOTAL_ROWS },
        // Stage 7 — live camera + canvas state for the WebGPU renderer.
        // The screen transform mirrors drawLiquidsWebGL: a particle at
        // worldX maps to device px (worldX - cam.x) * dpr * worldScale,
        // and liquidWGPUCanvas is sized to canvas.width/height like
        // liquidGLCanvas. Stage 8 wires this into the per-frame draw; the
        // Stage-7 self-test reads it once so the seeded particles render
        // at the correct on-screen location (the surface ponds).
        getView: function () {
          // v14.31 — active-region box (world px) for the WebGPU sim. It is
          // the same camera + LIQUID_ACTIVE_MARGIN box liquidUpdateActiveRegion
          // uses on the CPU path; the module culls its sim grid + kernels to
          // it so off-screen settled water no longer bloats the cell budget.
          var sw = viewW / worldScale, sh = viewH / worldScale;
          var mx = sw * LIQUID_ACTIVE_MARGIN, my = sh * LIQUID_ACTIVE_MARGIN;
          var rx0 = cam.x - mx, ry0 = cam.y - my;
          var rx1 = cam.x + sw + mx, ry1 = cam.y + sh + my;
          // v24.115 — never CUT a filled surface pond. Zoomed in, the camera
          // region (~38 tiles) is narrower than a wide pond (27-54 tiles), so
          // both region edges sat INSIDE the water; beyond them particles do
          // not even splat mass, so the live water saw vacuum at both cut
          // lines and currents + waves poured in from both sides forever
          // ("pop rocks"). If a filled pond overlaps the box, extend the box
          // to the whole pond (plus wall/splash margin). A pond ENTIRELY
          // outside stays fully static (uniformly skipped = perfectly calm).
          if (typeof surfacePonds !== 'undefined' && surfacePonds) {
            var pTop = (SKY_ROWS - 3) * TILE;
            for (var pi = 0; pi < surfacePonds.length; pi++) {
              var pd = surfacePonds[pi];
              if (!pd.filled) continue;
              // v24.148 — depth-aware bottom (deep lakes; old saves d=1):
              // a vertical cut inside the body is the same vacuum bug.
              var pBot = (SKY_ROWS + (pd.d || 1) + 2) * TILE;
              var pl = (pd.cL - 2) * TILE, pr = (pd.cR + 3) * TILE;
              if (pr <= rx0 || pl >= rx1) continue;          // no X overlap
              if (pBot <= ry0 || pTop >= ry1) continue;      // no Y overlap
              if (pl < rx0) rx0 = pl;
              if (pr > rx1) rx1 = pr;
              if (pTop < ry0) ry0 = pTop;
              if (pBot > ry1) ry1 = pBot;
            }
          }
          return {
            camX: cam.x, camY: cam.y,
            dpr: dpr, worldScale: worldScale,
            canvasW: canvas.width, canvasH: canvas.height,
            viewW: viewW, viewH: viewH,
            regionMinX: rx0, regionMinY: ry0,
            regionMaxX: rx1, regionMaxY: ry1
          };
        },
        // Stage 6 — terrain solidity hook. The GPU collision kernel needs a
        // solid-tile bitmask for the live-particle region with zero CPU
        // readback; the module computes the tile bbox each frame and calls
        // this to fill `out` (one byte/tile, 1 = solid, row-major over the
        // [originCol..originCol+w) x [originRow..originRow+h) tile rect),
        // which it then packs into a 1-bit-per-tile GPU buffer. The probe
        // is liquidWorldSolidAt at each tile centre — the same pure-terrain
        // test the CPU liquidMoveParticle uses (tiles + curved-pond floors,
        // collapsed to tile granularity). NOT the miner silhouette: the
        // dynamic miner collision is a Stage 8 game-bridge concern.
        fillTerrainSolid: function (originCol, originRow, w, h, out) {
          var k = 0;
          for (var r = 0; r < h; r++) {
            var wy = (originRow + r + 0.5) * TILE;
            for (var c = 0; c < w; c++) {
              var wx = (originCol + c + 0.5) * TILE;
              out[k++] = liquidWorldSolidAt(wx, wy) ? 1 : 0;
            }
          }
        },
        // Stage 8 — oil suction hook. The GPU drives the sim, but the pump
        // intake (which removes oil particles + fills the rig tank) stays
        // CPU-side: it owns particle removal + the oilGallons total, and
        // the GPU buffers mirror the CPU arrays each frame, so running it
        // here keeps everything coherent. liquidWGPU.update() calls this
        // once per frame with the clamped dt, in place of updateLiquids's
        // own updateOilSuction call.
        updateOilSuction: function (dt) { updateOilSuction(dt); },
        // Stage 8 — live game state for the GPU grid-update wake kernels +
        // the collide miner-silhouette test. Returns plain JS; the module
        // packs it into the GameParams uniform each frame. Explosions are
        // t-gated + blast-scaled here so the kernel stays branch-light
        // (mirrors liquidApplyExplosionGridWake's ex.t>0.22 skip + the
        // large?1050:660 blast constant).
        getGameState: function () {
          var pl = null;
          if (player && !gameWon) {
            // v24.125 — vx/vy feed the speed-scaled silhouette eject
            // (writeGameParams gates LIQUID_PLAYER_EJECT by rig speed).
            pl = { active: true, x: player.x, y: player.y, dir: player.dir,
                   vx: player.vx || 0, vy: player.vy || 0 };
          }
          var rk = { active: false, intensity: 0, exDirX: 0, exDirY: 0, nozzles: null };
          if (rocketIntensity > 0.02 && player && player.thrusting) {
            var ed = rocketExhaustDir();
            var nz = rocketNozzles();
            rk.active = true;
            rk.intensity = rocketIntensity;
            rk.exDirX = ed.x;
            rk.exDirY = ed.y;
            rk.nozzles = nz;
          }
          var ex = [];
          for (var i = 0; i < explosions.length && ex.length < 8; i++) {
            var e = explosions[i];
            if (e.t > 0.22) continue;   // mirror the CPU wake's t-gate
            ex.push({
              cx: e.cx, cy: e.cy, r: e.r,
              blastScale: e.large ? 1050 : 660
            });
          }
          return { player: pl, rocket: rk, explosions: ex };
        }
      }
    };
  }
  var liquidSurfacePools = { water: null, oil: null };
  var surfacePondBasins = [];
  var oilGallons = 0;         // sellable oil currently in the rig tank
  var oilSuckFx = [];         // short intake streaks from oil particles to pump
  var oilTankWarnTimer = 0;
  var damageFlashT = 0;       // 0..1 red-screen flash timer (decays); set on hull damage
  // Global hit-pause: when > 0, update() early-returns (game logic frozen)
  // while render() and smoke continue. Triggered by impactful events
  // (drill tile-break, hard landings) to give moments of perceived weight.
  // 2-3 frames at 60fps (~33-50ms) is the Hollow Knight / God of War range;
  // longer than that compounds into perceived input lag during drill chains.
  var hitPauseT = 0;
  var roverMode = null;       // active rover-drop state (see activateRoverDrop)
  // Win state is currently unused: the game has no win condition (the moon
  // run, the old win, was removed). Kept as an inert, never-true flag so the
  // internal guards that still reference it keep working.
  var gameWon = false;

  // ----- Dev mode -----
  // Press [`] (backtick) to toggle. When on:
  //   - All shop purchases are free (cost is deducted from a fake bottomless wallet)
  //   - Money display gets a "DEV" tag
  //   - State persists across reloads via localStorage so refreshing the page
  //     during development doesn't make you lose the toggle
  var devMode = false;  // v10.101 — off by default; perf tuning done
  // v13.13 — GPU probes (gpuProbe / gl.finish) are OFF by default even in
  // dev mode. gl.finish() is a hard CPU<->GPU sync: leaving it on serialises
  // the pipeline and the perf panel reports a framerate well below the real
  // one. Press 'G' in dev mode when you actually want the smoke/sky/liquid
  // GPU breakdown (accept that FPS reads low while it is on).
  var gpuProbeEnabled = false;

  // v11.2 — UI_NEW gates the legacy v10 chrome (HUD bar, shop modal,
  // toasts, banners, end-state overlays, floaters). When true the
  // game renders pure world: no HUD, no menus, no text. This is the
  // baseline for the v11 diegetic UI rebuild per UI_STYLE.md.
  // Things that stay regardless of UI_NEW:
  //   - mobile D-pad (still needed for play until the radial wheel ships)
  //   - dev perf overlay (gated by devMode)
  //   - damage screen flash (environmental, no text)
  var UI_NEW = true;

  // v11.3 — Console primitive (UI_STYLE.md §3). Bottom-edge instrument
  // panel that holds the new diegetic gauges. Stage 3 ships the
  // empty frame + bay slots; stage 4 fills the bays with instruments.
  var CONSOLE_HEIGHT_DESKTOP = 88;
  var CONSOLE_HEIGHT_MOBILE_LANDSCAPE = 72;
  var CONSOLE_HEIGHT_MOBILE_PORTRAIT = 88;
  // Bay widths in CSS pixels, left to right. Remaining canvas width is
  // the "free zone" (radial-wheel anchor per §8.2).
  var CONSOLE_BAYS = [
    { id: 'reserve', w: 92  },
    { id: 'fuel',    w: 92  },
    { id: 'speed',   w: 92  },
    { id: 'hull',    w: 92  },
    { id: 'cargo',   w: 110 },
    { id: 'depth',   w: 92  },
    { id: 'sys',     w: 56  },   // v24.126: SAVE annunciator lamp (state in 047, draw in 220)
    { id: 'cash',    w: 110 }
  ];
  // Reference top speed (MPH) for the SPEED readout's colour zones: the number
  // is amber up to 60% of this, orange to 82%, red above (fall-damage
  // territory). Uses the same px→MPH conversion as the 'FELL n MPH' fall readout
  // (32 px = 1 m, then m/s → MPH × 2.237). Terminal fall (~740 px/s) ≈ 52 MPH.
  var SPEEDO_MPH_MAX = 80;
  // Material colours from UI_STYLE.md §4.1.
  var UIMAT_PLATE_BASE       = '#3d3a35';
  var UIMAT_PLATE_HIGHLIGHT  = '#4f4c46';
  var UIMAT_PLATE_SHADOW     = '#2a2724';
  var UIMAT_RIVET_CORE       = '#52504a';
  var UIMAT_RIVET_RIM        = '#2a2724';
  var UIMAT_WELD             = '#5a5750';
  var UIMAT_BAY_RECESS       = '#2e2c28';
  var UIMAT_BAY_RECESS_DARK  = '#1f1d1a';
  var UIMAT_BAY_RECESS_LIGHT = '#3a3833';
  var UI_OUTLINE             = '#1a0a05';   // same as BLD.outline
  // v11.54 — responsive fold. consoleStacked() is true when the single bay
  // row is wider than the viewport; the console then folds into 2 rows,
  // CONSOLE_ROW_STACKED tall per row. consoleStackCols() is the per-row count
  // (ceil(bays/2)) so the fold always fits in exactly two rows regardless of
  // how many bays there are: 6 bays → 3 per row, 7 → 4 (a 4 + 3 split).
  var CONSOLE_ROW_STACKED = 72;
  function consoleStackCols() { return Math.ceil(CONSOLE_BAYS.length / 2); }
  // v23.53: In fullscreen the world zooms in (worldScale floors at 1.2 embedded
  // and rises to ~2.0 at a 1920-wide viewport) but the console is authored at a
  // fixed CSS-pixel size, so it reads too small once the world is zoomed in. Scale
  // the WHOLE console (frame + gauges + linework + fonts) up to track the world
  // zoom, gently (GAIN) and capped (MAX) so it never dominates the screen. The
  // scale is applied as a uniform transform in drawConsole, so detail stays crisp
  // rather than the bezels just stretching. Tunable; GAIN 0 = never grow.
  var CONSOLE_SCALE_GAIN = 0.7;   // fraction of the world-zoom delta the console takes on
  var CONSOLE_SCALE_MAX  = 1.6;   // hard cap on the console magnification
  function consoleScale() {
    var ws = (typeof worldScale === 'number' && worldScale > 0) ? worldScale : 1.2;
    var s = 1 + ((ws / 1.2) - 1) * CONSOLE_SCALE_GAIN;
    return Math.max(1, Math.min(CONSOLE_SCALE_MAX, s));
  }
  function consoleStacked() {
    var total = 0;
    for (var i = 0; i < CONSOLE_BAYS.length; i++) total += CONSOLE_BAYS[i].w;
    var singleRowW = total + CONSOLE_BODY_PAD * 2 + CONSOLE_CAP_W * 2;
    // The console is laid out in a logical space magnified by consoleScale() on
    // screen, so the fold test uses the logical width budget (viewW / scale).
    return singleRowW > (viewW / consoleScale()) - 32;
  }
  // Un-scaled bar height (CSS px). consoleHeight() applies the scale so every
  // external consumer (d-pad, item wheel, smoke clip, shop layouts) reserves the
  // real on-screen height.
  function consoleBaseHeight() {
    if (consoleStacked()) return CONSOLE_ROW_STACKED * 2;
    if (!isMobile) return CONSOLE_HEIGHT_DESKTOP;
    return viewW > viewH ? CONSOLE_HEIGHT_MOBILE_LANDSCAPE : CONSOLE_HEIGHT_MOBILE_PORTRAIT;
  }
  function consoleHeight() { return consoleBaseHeight() * consoleScale(); }
  // v11.27 — centered console with ornate iron-and-brass end caps. Width
  // is sized to the bay set + padding + caps, leaving the side strips of
  // the bottom playfield visible (so the player can see Earth on either
  // side of the toolbar).
  var CONSOLE_CAP_W = 32;
  var CONSOLE_BODY_PAD = 8;
  var CONSOLE_MIN_BODY_W = 120;  // floor so a tiny viewport never makes bays negative
  function consoleRect() {
    // v23.53: lay out in a logical space `scale`× smaller than the screen;
    // drawConsole magnifies the whole console by `scale` (× dpr) so it fills
    // the right on-screen footprint with crisp, uniformly-scaled detail. At
    // scale 1 (embedded) this is identical to the old screen-space layout.
    var scale = consoleScale();
    var lvW = viewW / scale;        // logical viewport width
    var lvH = viewH / scale;        // logical viewport height
    var h = consoleBaseHeight();    // logical (un-scaled) bar height
    var stacked = consoleStacked();
    var bodyW;
    if (stacked) {
      // Folded: consoleStackCols() columns. Width follows the widest bay so the
      // panel doesn't balloon on mid-size screens — still clamps to the viewport.
      var maxBayW = 0;
      for (var i = 0; i < CONSOLE_BAYS.length; i++) {
        if (CONSOLE_BAYS[i].w > maxBayW) maxBayW = CONSOLE_BAYS[i].w;
      }
      bodyW = maxBayW * consoleStackCols() + CONSOLE_BODY_PAD * 2;
    } else {
      var totalBayW = 0;
      for (var j = 0; j < CONSOLE_BAYS.length; j++) totalBayW += CONSOLE_BAYS[j].w;
      bodyW = totalBayW + CONSOLE_BODY_PAD * 2;
    }
    var consoleW = bodyW + CONSOLE_CAP_W * 2;
    var minMargin = 16;
    if (consoleW > lvW - minMargin * 2) {
      consoleW = lvW - minMargin * 2;
      bodyW = consoleW - CONSOLE_CAP_W * 2;
    }
    // A near-zero viewW (a resize or layout transient, a minimized or
    // collapsed window) drives the clamp above negative, which makes the
    // stacked per-bay widths, and the gauge arc radii derived from them,
    // go negative and throw. Floor the body so every bay rect stays positive.
    if (bodyW < CONSOLE_MIN_BODY_W) {
      bodyW = CONSOLE_MIN_BODY_W;
      consoleW = bodyW + CONSOLE_CAP_W * 2;
    }
    var x = Math.floor((lvW - consoleW) / 2);
    var y = lvH - h;
    return {
      x: x, y: y, w: consoleW, h: h,
      bodyX: x + CONSOLE_CAP_W, bodyY: y, bodyW: bodyW, bodyH: h,
      capW: CONSOLE_CAP_W, stacked: stacked,
      scale: scale, viewW: lvW, viewH: lvH
    };
  }
  try {
    // v10.79 — only override the default when there's an explicit
    // stored value; bare-unset means "use the new default" so a fresh
    // mobile install doesn't silently flip to off.
    if (window.localStorage) {
      var _dm = window.localStorage.getItem('sluice_devmode');
      if (_dm === '0') devMode = false;
      else if (_dm === '1') devMode = true;
    }
    // v11.76 — ?dev=1 in the URL force-enables dev mode so the perf overlay
    // is reachable on touch devices that have no backtick key. v14.22 — also
    // accepts ?dev=true; setDevMode() is re-fired at boot (below) so the
    // localStorage persist + panel sync run through the normal path.
    if (window.location && /[?&]dev=(1(?!\d)|true)/i.test(window.location.search)) {
      devMode = true;
    }
    // v11.80 — ?stress=N renders the frame N times/tick (perf measurement).
    if (window.location) {
      var _sm = window.location.search.match(/[?&]stress=(\d+)/);
      if (_sm) PERF_STRESS = Math.max(1, Math.min(20, parseInt(_sm[1], 10)));
    }
  } catch (e) { /* localStorage may be unavailable in strict-privacy modes */ }
  function setDevMode(on) {
    devMode = !!on;
    try {
      if (window.localStorage) {
        // Persist both states (was: removeItem on off → reverted to default
        // next reload). Now an explicit off stays off.
        window.localStorage.setItem('sluice_devmode', devMode ? '1' : '0');
      }
    } catch (e) {}
    // Show / hide the chimney-smoke preset panel along with dev mode.
    // The function is defined later in the file; guard for hoist order.
    if (typeof syncFireplacePresetPanel === 'function') syncFireplacePresetPanel();
    // v14.22 — show/hide the on-screen TUNE button (mobile dev access) with
    // dev mode. Defined later in the file; guard for hoist order.
    if (typeof gmTuningButtonSync === 'function') gmTuningButtonSync();
  }

  // v25.9 — the read-only perf overlay is shown when dev mode is on OR (on a
  // touch device) when the DEBUG_PERF_ON_MOBILE diagnostic flag is set. Kept
  // separate from devMode so a phone can show the perf panel for profiling
  // without the free-purchase / money cheat that full dev mode brings. The perf
  // instrumentation runs every frame regardless (see perfMark), so the numbers
  // are real either way. isMobile is assigned later in this file but resolves at
  // call time (this runs from the render loop), so the late binding is fine.
  function perfOverlayOn() {
    return devMode || (DEBUG_PERF_ON_MOBILE && typeof isMobile !== 'undefined' && isMobile);
  }

  // ----- Perf overlay state (dev mode only) -----
  var perfFps = 0;
  var perfFrameMs = 0;
  var perfFrameSamples = [];
  var perfChunkRebuilds = 0;
  var perfUpdateMs = 0;
  var perfRenderMs = 0;
  var perfSmokeMs = 0;

  // Per-subsystem timing — buckets[name] is the smoothed ms/frame for that
  // named system. Used by drawPerfOverlay to show the top-N offenders so
  // we know what's actually slow instead of guessing. The instrumentation
  // is on every frame (dev mode or not) — the overhead is two
  // performance.now() calls + one multiply-add per measured block, which
  // is sub-microsecond and effectively free.
  var perfBuckets = {};
  // v14.21 — raw + peak-hold companions to the EMA buckets. perfBucketsRaw is
  // this frame's unsmoothed dt per block (reset at the top of loop()), used to
  // attribute a one-frame hitch to a culprit before the EMA averages it away.
  // perfBucketsPk snaps up instantly and decays slowly so a brief spike is
  // still readable on the panel after it has passed.
  var perfBucketsRaw = {};
  var perfBucketsPk = {};
  function perfMark(name, t0) {
    var dt = performance.now() - t0;
    perfBuckets[name] = (perfBuckets[name] || 0) * 0.9 + dt * 0.1;
    perfBucketsRaw[name] = dt;
    var pk = perfBucketsPk[name] || 0;
    perfBucketsPk[name] = dt > pk ? dt : pk * 0.96;   // snap up, slow decay
  }
  // v12.4 — GPU-time probe (dev mode only). The perfMark buckets above time
  // CPU command-issue only; on a GPU-bound frame the real cost is the GPU
  // executing those commands — invisible to performance.now() because WebGL
  // is async. gpuProbe brackets a smoke-pipeline section and calls
  // gl.finish() to drain the GPU, so the elapsed time includes real GPU
  // execution. gl.finish() serialises CPU<->GPU, so this only runs in devMode.
  var gpuBuckets = {};
  var gpuBucketsPeak = {};
  var _smokeProbeGL = null;
  function smokeProbeGL() {
    if (!_smokeProbeGL && smokeFluidCanvas) {
      try {
        _smokeProbeGL = smokeFluidCanvas.getContext('webgl2') ||
                        smokeFluidCanvas.getContext('webgl') ||
                        smokeFluidCanvas.getContext('experimental-webgl') || null;
      } catch (e) { _smokeProbeGL = null; }
    }
    return _smokeProbeGL;
  }
  // v12.5 — generalised: caller passes the GL context whose command queue to
  // drain (gl.finish), so one probe can cover any WebGL subsystem.
  function gpuProbe(name, t0, gl) {
    // v13.13 — opt-in. The gl.finish() below is a hard CPU<->GPU sync; left
    // on it serialises the pipeline and the panel reports a framerate well
    // below the real one. Off unless 'G' is pressed in dev mode.
    if (!gpuProbeEnabled) return;
    // v14.15 — gl.finish only drains a WebGL context. The smoke + water
    // sims are WebGPU now (no finish()); their callers pass gl = null, so
    // bail rather than record CPU command-issue time into a "GPU" bucket
    // and lie. WebGPU GPU time is measured separately by probeWebGPUGpu().
    // This probe still covers the WebGL subsystems — the sky, and smoke /
    // liquid only while they are on their pre-WebGPU fallback paths.
    if (!gl || typeof gl.finish !== 'function') return;
    gl.finish();
    var v = (gpuBuckets[name] || 0) * 0.9 + (performance.now() - t0) * 0.1;
    gpuBuckets[name] = v;
    // Peak-hold — snaps up instantly, decays slowly (~3s) so a cost measured
    // mid-manoeuvre is still on the panel after you stop flying to read it.
    var pk = gpuBucketsPeak[name] || 0;
    gpuBucketsPeak[name] = v > pk ? v : pk * 0.992;
  }
  // BLIND SPOT: gpuProbe drains only the render queue of the single GL
  // context passed in. It cannot see the browser compositor merging the
  // stacked DOM-layer canvases onto the page (see the render-architecture
  // note at the top of the file) — so it can read ~0 while an oversized
  // layer canvas is the frame's dominant cost.
  // v14.15 — WebGPU GPU-time probe. gpuProbe's gl.finish is WebGL-only;
  // the smoke + water sims run on WebGPU, which has no finish(). WebGPU's
  // queue.onSubmittedWorkDone() resolves once the GPU has drained every
  // submitted command — measuring wall-clock to that resolve is an honest
  // GPU-busy signal and, unlike gl.finish, forces NO CPU<->GPU stall, so
  // it runs every frame in dev mode (no FPS skew, no 'G' gate). It is
  // whole-device: one number covering ALL WebGPU work — smoke sim+render
  // AND water sim+render. At a vsync-capped fps it idles near one frame
  // interval (normal pipelining); watch it CLIMB when GPU load rises.
  var gpuWebGPUMs = 0;
  var _gpuWebGPUInFlight = false;
  function probeWebGPUGpu() {
    if (_gpuWebGPUInFlight) return;   // keep exactly one probe outstanding
    var dev = (liquidWGPU && liquidWGPU.device) ||
              (smokeWGPU && smokeWGPU.device) || null;
    if (!dev || !dev.queue || typeof dev.queue.onSubmittedWorkDone !== 'function') return;
    _gpuWebGPUInFlight = true;
    var t0 = performance.now();
    dev.queue.onSubmittedWorkDone().then(function () {
      gpuWebGPUMs = gpuWebGPUMs * 0.9 + (performance.now() - t0) * 0.1;
      _gpuWebGPUInFlight = false;
    }, function () { _gpuWebGPUInFlight = false; });
  }
  // v10.75 — rolling-window frame-time ring for min/max/p99 stats in
  // the debug overlay. 120 entries ≈ 2 seconds at 60fps so the numbers
  // react quickly to a new spike without being too jittery to read.
  var perfFrameRing = new Float32Array(120);
  var perfFrameRingIdx = 0;
  var perfFrameRingFilled = 0;
  function perfPushFrame(ms) {
    perfFrameRing[perfFrameRingIdx] = ms;
    perfFrameRingIdx = (perfFrameRingIdx + 1) % perfFrameRing.length;
    if (perfFrameRingFilled < perfFrameRing.length) perfFrameRingFilled++;
  }
  function perfFrameStats() {
    var n = perfFrameRingFilled;
    if (n === 0) return { min: 0, max: 0, p99: 0, avg: 0 };
    var min = Infinity, max = 0, sum = 0;
    var copy = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var v = perfFrameRing[i];
      copy[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    // Quick partial sort for p99 — Array.sort would clone & box, this
    // is fine for n=120.
    Array.prototype.sort.call(copy, function (a, b) { return a - b; });
    var p99 = copy[Math.floor(n * 0.99)] || max;
    return { min: min, max: max, p99: p99, avg: sum / n };
  }

  // v14.21 — perf DIAGNOSIS. The panel above is all EMA-smoothed, so a
  // one-frame hitch averages away and there is no verdict naming the cause.
  // The vars + helpers below let the overlay say WHAT is slow, not just THAT
  // it is slow.
  //
  // perfFpsCap — the best fps ever observed (no decay). On a vsync-capped
  //   display this settles at the refresh rate and becomes the "healthy"
  //   reference: fps near the cap = fine, fps well below = a real problem.
  // perfHitch — the worst recent frame: its total CPU ms, when it happened,
  //   and a snapshot of the top-6 raw bucket costs from that frame so the
  //   overlay can show what was expensive ON the hitch frame specifically.
  var perfFpsCap = 0;
  var perfHitch = { ms: 0, at: -99999, buckets: null };

  // Top-6 [name, ms] from this frame's RAW buckets, sorted desc. Captured
  // into perfHitch so a spike's breakdown survives the EMA.
  function perfSnapshotRaw() {
    var arr = [];
    for (var k in perfBucketsRaw) {
      if (Object.prototype.hasOwnProperty.call(perfBucketsRaw, k)) {
        arr.push([k, perfBucketsRaw[k]]);
      }
    }
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, 6);
  }

  // v14.22 — microstutter metric. Average fps can sit on the refresh cap
  // while the game still FEELS bad because frame times spike often. A frame
  // counts as "janky" when it runs longer than 1.35× the display interval
  // (capMs). jankPct is the share of janky frames in the ring; low1 is the
  // 1%-low fps (1000 / p99) — the slow tail the average hides. Shared by the
  // Smoothness row and perfDiagnose() so both read the same numbers.
  function perfJankStats() {
    var filled = perfFrameRingFilled;
    var capMs = perfFpsCap > 0 ? 1000 / perfFpsCap : 16.7;
    var jankThresh = capMs * 1.35;
    var jankCount = 0;
    for (var ji = 0; ji < filled; ji++) {
      if (perfFrameRing[ji] > jankThresh) jankCount++;
    }
    var jankPct = filled > 0 ? (jankCount / filled) * 100 : 0;
    var p99 = perfFrameStats().p99;
    var low1 = p99 > 0 ? 1000 / p99 : 0;
    return { jankPct: jankPct, low1: low1 };
  }

  // Returns { verdict, colour, cause }. The verdict is the headline; the
  // cause is a short human string naming the dominant offender. interval is
  // the real frame budget (1000/fps); cpu is the EMA JS cost; gap is whatever
  // is left = GPU exec + compositing + vsync idle. Healthy = fps within 10%
  // of the best fps ever seen (i.e. sitting on the refresh cap).
  function perfDiagnose() {
    var interval = perfFps > 0 ? 1000 / perfFps : 0;
    var cpu = perfFrameMs;                       // EMA CPU frame ms
    var gap = Math.max(0, interval - cpu);       // GPU exec + compositing + vsync idle
    var healthy = (perfFps <= 0) ||
                  (perfFpsCap > 0 && perfFps >= perfFpsCap * 0.90);
    if (healthy) {
      // v14.22 — fps is on the cap, but check for microstutter: if a chunk
      // of recent frames hitched (jankPct > 6) the average is lying and the
      // game feels rough. Flag MICROSTUTTER instead of HEALTHY.
      var _jank = perfJankStats();
      if (_jank.jankPct > 6) {
        return {
          verdict: 'MICROSTUTTER', colour: '#ffcc44',
          cause: _jank.jankPct.toFixed(0) + '% janky frames — see WORST FRAME'
        };
      }
      return {
        verdict: 'HEALTHY', colour: '#66ff66',
        cause: 'capped ~' + Math.round(perfFpsCap) + ' fps'
      };
    }
    if (cpu >= gap) {
      // CPU-bound — name the heaviest EMA bucket.
      var topName = '—', topMs = 0;
      for (var k in perfBuckets) {
        if (!Object.prototype.hasOwnProperty.call(perfBuckets, k)) continue;
        if (perfBuckets[k] > topMs) { topMs = perfBuckets[k]; topName = k; }
      }
      return {
        verdict: 'CPU-BOUND', colour: '#ff6666',
        cause: topName + ' ' + topMs.toFixed(1) + 'ms'
      };
    }
    return {
      verdict: 'GPU-BOUND', colour: '#ff6666',
      cause: (gpuWebGPUMs > interval * 0.55)
        ? ('WebGPU sims ~' + gpuWebGPUMs.toFixed(1) + 'ms')
        : 'fill-rate / compositing'
    };
  }

  // v23.39 — top-N EMA buckets [name, ms], sorted desc. Shared by the console
  // A/B log and the overlay so both rank the same way.
  function perfTopBuckets(n) {
    var arr = [];
    for (var k in perfBuckets) {
      if (Object.prototype.hasOwnProperty.call(perfBuckets, k)) arr.push([k, perfBuckets[k]]);
    }
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, n || 6);
  }
  // v23.39 — dump the active perf-toggle config + the trailing-average perf of
  // the config we are LEAVING to the console, so flipping a toggle leaves an
  // A/B history you can copy out. Called on the 'K' flip; the on-screen
  // capture/compare (v23.40) is the rigorous before/after.
  function perfLogConfig(reason) {
    if (typeof console === 'undefined' || !console.log) return;
    var fs = perfFrameStats();
    var jk = perfJankStats();
    var top = perfTopBuckets(3).map(function (e) { return e[0] + ' ' + e[1].toFixed(1); }).join(', ');
    console.log('[perf] ' + (reason || 'config') +
      '  | idleSkip=' + (PERF_SMOKE_IDLE_SKIP ? 1 : 0) +
      ' obstacleDirty=' + (PERF_SMOKE_OBSTACLE_DIRTY ? 1 : 0) +
      '  | ' + perfFps + 'fps  cpu ' + perfFrameMs.toFixed(1) + 'ms  p99 ' + fs.p99.toFixed(1) +
      '  jank ' + jk.jankPct.toFixed(0) + '%  (prev-config avg)' +
      '  | top: ' + top);
  }

  // v23.40 — A/B snapshot + compare. '[' grabs the live perf stats into slot A
  // (a baseline), ']' into slot B; the overlay shows both + the B-A delta so a
  // toggle change is MEASURED, not eyeballed. Each capture also logs to the
  // console so a session keeps a copyable A/B history.
  var perfAB = { a: null, b: null };
  function perfCaptureSnapshot() {
    var fs = perfFrameStats();
    var jk = perfJankStats();
    return {
      at: performance.now(),
      fps: perfFps,
      avg: fs.avg > 0 ? 1000 / fs.avg : 0,
      cpu: perfFrameMs,
      p99: fs.p99,
      jank: jk.jankPct,
      low1: jk.low1,
      gpu: gpuWebGPUMs,
      idle: PERF_SMOKE_IDLE_SKIP ? 1 : 0,
      obs: PERF_SMOKE_OBSTACLE_DIRTY ? 1 : 0,
      top: perfTopBuckets(5)
    };
  }
  function perfCaptureAB(slot) {
    var s = perfCaptureSnapshot();
    perfAB[slot] = s;
    if (typeof console !== 'undefined' && console.log) {
      var topStr = s.top.slice(0, 3).map(function (e) { return e[0] + ' ' + e[1].toFixed(1); }).join(', ');
      console.log('[perf A/B] captured ' + slot.toUpperCase() +
        '  idleSkip=' + s.idle + ' obstacleDirty=' + s.obs +
        '  | ' + s.fps + 'fps (avg ' + s.avg.toFixed(0) + ')  cpu ' + s.cpu.toFixed(1) +
        '  p99 ' + s.p99.toFixed(1) + '  jank ' + s.jank.toFixed(0) + '%  gpu ' + s.gpu.toFixed(1) +
        '  | top: ' + topStr);
    }
  }

  // v23.41 — Deterministic benchmark run. 'O' starts a fixed-duration auto-fly:
  // the rig jetpacks UP for the first half of the window then releases for the
  // second, sweeping sky -> deck while its exhaust + rocket plume drive a heavy,
  // repeatable smoke load (the exact subsystem the Stage-1 toggles target). Over
  // the window it accumulates per-frame ms (min/max/avg/p99), jank, and the
  // run-average of every perf bucket, then prints a report. Run it from the same
  // spot with config A, flip a toggle, rerun: the two reports compare under an
  // identical scripted load instead of an eyeballed live scene.
  var benchState = {
    running: false, t: 0, dur: 8, frames: 0,
    msSum: 0, msMin: 1e9, msMax: 0, jank: 0, capMs: 16.7,
    bucketSum: {}, sampleN: 0, startCfg: '', result: null, resultAt: 0
  };
  var benchSamples = null;
  function benchStart() {
    if (!benchSamples) benchSamples = new Float32Array(2048);
    benchState.running = true;
    benchState.t = 0; benchState.frames = 0;
    benchState.msSum = 0; benchState.msMin = 1e9; benchState.msMax = 0;
    benchState.jank = 0;
    benchState.capMs = perfFpsCap > 0 ? 1000 / perfFpsCap : 16.7;
    benchState.bucketSum = {}; benchState.sampleN = 0;
    benchState.startCfg = 'idleSkip=' + (PERF_SMOKE_IDLE_SKIP ? 1 : 0) +
                          ' obstacleDirty=' + (PERF_SMOKE_OBSTACLE_DIRTY ? 1 : 0);
  }
  function benchAbort() {
    benchState.running = false;
    keys[' '] = false; if (typeof dpad !== 'undefined' && dpad) dpad.up = false;
  }
  function benchTick(frameMs, dt) {
    if (!benchState.running) return;
    // Bail if the scene is no longer the auto-fly (shop opened / dead): the
    // window would aggregate an unrepresentative scene.
    if (shopState !== 'closed' || gameOver) { benchAbort(); return; }
    benchState.t += dt;
    benchState.frames++;
    benchState.msSum += frameMs;
    if (frameMs < benchState.msMin) benchState.msMin = frameMs;
    if (frameMs > benchState.msMax) benchState.msMax = frameMs;
    if (frameMs > benchState.capMs * 1.35) benchState.jank++;
    if (benchState.sampleN < benchSamples.length) benchSamples[benchState.sampleN++] = frameMs;
    for (var k in perfBucketsRaw) {
      if (Object.prototype.hasOwnProperty.call(perfBucketsRaw, k)) {
        benchState.bucketSum[k] = (benchState.bucketSum[k] || 0) + perfBucketsRaw[k];
      }
    }
    // Scripted auto-fly: jetpack up for the first half, release for the second.
    // Sets the same up-intent a key/d-pad would, so the real movement + thrust +
    // smoke code drives it (dev mode keeps fuel topped up, so it sustains).
    var up = benchState.t < benchState.dur * 0.5;
    keys[' '] = up;
    if (typeof dpad !== 'undefined' && dpad) dpad.up = up;
    if (benchState.t >= benchState.dur) benchFinish();
  }
  function benchFinish() {
    benchState.running = false;
    keys[' '] = false; if (typeof dpad !== 'undefined' && dpad) dpad.up = false;
    var n = benchState.frames || 1;
    var avgMs = benchState.msSum / n;
    var avgFps = avgMs > 0 ? 1000 / avgMs : 0;
    var p99 = benchState.msMax, sn = benchState.sampleN;
    if (sn > 0) {
      var copy = benchSamples.slice(0, sn);
      Array.prototype.sort.call(copy, function (a, b) { return a - b; });
      p99 = copy[Math.floor(sn * 0.99)] || benchState.msMax;
    }
    var jankPct = (benchState.jank / n) * 100;
    var bb = [];
    for (var bk in benchState.bucketSum) {
      if (Object.prototype.hasOwnProperty.call(benchState.bucketSum, bk)) bb.push([bk, benchState.bucketSum[bk] / n]);
    }
    bb.sort(function (a, b) { return b[1] - a[1]; });
    benchState.result = {
      dur: benchState.t, frames: n, avgFps: avgFps, avgMs: avgMs,
      min: benchState.msMin, max: benchState.msMax, p99: p99, jank: jankPct,
      cfg: benchState.startCfg, top: bb.slice(0, 8)
    };
    benchState.resultAt = performance.now();
    if (typeof console !== 'undefined' && console.log) {
      console.log('[perf BENCH] ' + benchState.t.toFixed(1) + 's  ' + n + ' frames  | ' + benchState.startCfg);
      console.log('  avg ' + avgFps.toFixed(1) + 'fps (' + avgMs.toFixed(2) + 'ms)  min ' +
        benchState.msMin.toFixed(1) + '  max ' + benchState.msMax.toFixed(1) + '  p99 ' +
        p99.toFixed(1) + '  jank ' + jankPct.toFixed(1) + '%');
      for (var i = 0; i < benchState.result.top.length; i++) {
        console.log('  ' + (i + 1) + '. ' + benchState.result.top[i][0] + '  ' + benchState.result.top[i][1].toFixed(2) + 'ms avg');
      }
    }
  }

  // ----- Shop scroll state -----
  // The shop has grown well past one screenful on small mobile viewports.
  // shopScroll is the vertical pixel offset (0 = top, max = bottom of items
  // list aligned with bottom of viewport). Updated by wheel events on
  // desktop and touch-drag inside the items region on mobile.
  var shopScroll = 0;
  var shopScrollMax = 0;
  var shopDrag = null;        // { startY, startScroll, lastY, lastT, vy } when actively dragging
  var drilling = null;
  var gameOver = false;
  var deathInfo = null;
  // v11.33 — UI_NEW death screen (UI_STYLE.md §9). Two-phase animation:
  // phase 1 (0-1.5s) the rig is dead in place and the world dims a bit;
  // phase 2 (>=1.5s) a steel plate descends from the top of the canvas
  // with TERMINATED + cause icon + stats. Click/tap raises the plate
  // and restarts the run.
  var deathPhaseT = 0;
  var deathPlateY = 0;     // current plate top in CSS px; -plateH means hidden
  var deathPlateTargetY = 0;
  var shopOpen = false;
  // v11.12 — Walk-up shop state machine (UI_STYLE.md §15). Proximity-driven:
  // walking the rig within range of the shop building sets state to 'floor';
  // walking away returns to 'closed'. No E/P key toggle in UI_NEW. Sub-pages
  // ('workshop' | 'shelf' | 'board') are pushed by clicking a station from
  // the floor and popped by the back-arrow. shopState is independent from
  // legacy shopOpen — they never both run.
  var shopState = 'closed';
  var shopEnterT = 0;       // 0..1 camera-push ramp on enter
  var shopExitT  = 0;       // 0..1 camera-push ramp on exit
  // v11.37 — Animated shop door + fly-up-to-enter mechanic. shopDoorT
  // ramps 0..1 as the player approaches; the doors slide open. Entry
  // only fires when shopDoorT > 0.55 AND the player's body is hovering
  // in the door rect (feet above the deck), so driving past on the
  // ground no longer triggers the shop.
  var shopDoorT = 0;
  // v15.1 — warm doorway light-spill ramp; 0..1 as the rig parks in the
  // shop entry zone. Drives drawShopDoorGlow() — the diegetic "step in"
  // affordance that replaced the old yellow chevron.
  var shopGlowT = 0;
  var msgTimer = 0;
  var msgText = '';
  var restartConfirmT = 0;
  var drillBlockMsgCool = 0;
  var magmaWarnTimer = 0;
  var fuelWarnTimer = 0;
  var cargoFullWarnTimer = 0;
  var lastLayer = null;
  var layerBanner = null;
  var screenW, screenH;
  var scale = 1;
  var lastFrameDt = 1 / 60;
  // v17.82 — pause state. When the window loses focus we fully STOP the rAF
  // loop (not just freeze state) so the CPU/GPU drop to idle and the laptop
  // stops cooking. gameRafId is the handle of the pending frame so we can
  // cancel it on pause and re-kick exactly one on resume (no double loops).
  var gamePaused = false;
  var gameRafId = 0;
  // v17.84: boot-pause toggle. When true, the loop runs the intro warmup (so
  // the world renders behind it) then drops into the pause menu until the player
  // clicks Resume. As of v23.53 the default is false: boot straight into play (owner asked
  // not to start paused). Flip to true to restore the boot-pause menu.
  // bootPauseFired is the one-shot guard.
  var startInPause = false;
  var bootPauseFired = false;
  // Dev/harness boot lever (?nopause=1, the ?nosave=1 idiom): disables the
  // focus auto-pause + boot pause. Headless screenshot/regression runs never
  // hold window focus, so without this the blur handler pauses the loop a
  // moment after boot and every capture shows the pause overlay instead of
  // the game. No effect unless the query param is present.
  var PAUSE_DISABLED = (function () {
    try { return /[?&]nopause=1/.test(window.location.search); } catch (e) { return false; }
  })();
  // Shared pause-overlay reveal — used by pauseGame and the boot-pause trigger.
  // `sub` is the contextual subtitle line (falsy hides it).
  function showPauseOverlay(sub) {
    var ov = document.getElementById('game-pause');
    if (!ov) return;
    var s = document.getElementById('gm-pause-sub');
    if (s) s.textContent = sub || '';
    // v24.126: autosave status on the pause card (saveStatusLine, 047-save.js).
    // Snapshot at pause time; the loop is stopped so it doesn't tick.
    var sv = document.getElementById('gm-pause-save');
    if (sv) sv.textContent = (typeof saveStatusLine === 'function') ? saveStatusLine() : '';
    ov.classList.add('is-visible');
    ov.setAttribute('aria-hidden', 'false');
  }
  var keys = {};
  var touch = { active: false, x: 0, y: 0, startX: 0, startY: 0 };
  var dpad = { left: false, right: false, up: false, down: false };
  // v23.93 — mobile split flight controls: rotate L/R (bottom-left) + thrust
  // hold (bottom-right), shown only in rotation flight on touch. Separate touch
  // ids so rotate + thrust can be held simultaneously. Geometry + draw in 310,
  // hit-test in 050, fed into moveL/moveR/moveU in 080.
  var flightTouch = { rotL: false, rotR: false, thrust: false, rotId: null, thrustId: null };

  // ===== Rotational flight tunables (v23.81) =====
  // Read by update(); registered as the 'flight' GM group (press L in dev mode).
  // This object IS the in-game "flight lab" — tune turn/thrust/gravity/drag live.
  // mode: 0 = today's axis-aligned flight (the pre-rotation legacy); 1 = full
  // rotation (A/D rotate, thrust along the nose, momentum); 2 = VTOL hover
  // (v24.145 — upright rig, direct strafe authority; vtolTune below). Press F
  // (dev) to cycle. Defaults below = the 'Snappy' rotation preset.
  var flightTune = {
    mode: 1,         // 0 = today (legacy) / 1 = full rotation / 2 = VTOL hover.
                     // DEFAULT = rotation. Switch on the pause screen
                     // (Today / Rotation / VTOL) or F in dev mode.
    // Default feel = a TAMED TWITCH: agile, acrobatic spin but a notch below the
    // full 'Twitch' preset, with a real fall + retained inertia (low drag = air).
    thrust: 1450,    // px/s^2 along the heading
    gravity: 600,    // px/s^2 down — fall terminal = gravity/linDamp ~750, clamps to MAX_FALL 740
    linDamp: 0.8,    // 1/s linear drag (INERTIA) — LOW: long coast + real fall
    turnAccel: 26.0, // rad/s^2 — fast ramp to the spin cap
    angDamp: 6.5,    // 1/s angular damping on release — settles fairly fast, stays agile
    maxOmega: 7.5,   // rad/s spin cap ~= 430 deg/s (twitchy; just under Twitch's 9)
    maxSpeed: 0      // hard speed clamp px/s; 0 = off (keep your inertia)
  };
  // Named feel presets for full-rotation flight (the L-panel buttons apply these;
  // owner picks by feel). PURE PHYSICS: thrust, gravity, linDamp (INERTIA), and the
  // spin (turnAccel ramp / angDamp release-settle / maxOmega cap). Controllable
  // presets keep the spin cap in the canon's ~180-300 deg/s band; Twitch is
  // deliberately past it. Each moves several axes so none feel alike.
  var FLIGHT_PRESETS = {
    // max inertia: very low drag = long spacey drift + the nose coasts; lighter gravity
    Drift:  { thrust: 1150, gravity: 460, linDamp: 0.45, turnAccel: 12, angDamp: 4,  maxOmega: 4.0, maxSpeed: 0 },
    // light gravity = floats/hovers easily; gentle, lift-biased cruising (soft fall)
    Glide:  { thrust: 1250, gravity: 360, linDamp: 0.8,  turnAccel: 14, angDamp: 7,  maxOmega: 4.2, maxSpeed: 0 },
    // light drag = real fall + long coast, fast well-damped turn = crisp but airy (DEFAULT)
    Snappy: { thrust: 1450, gravity: 640, linDamp: 0.85, turnAccel: 26, angDamp: 11, maxOmega: 4.6, maxSpeed: 0 },
    // strong gravity (hard fall) + slow deliberate turn + big momentum = heavy mass
    Heavy:  { thrust: 1750, gravity: 820, linDamp: 0.65, turnAccel: 7,  angDamp: 4,  maxOmega: 3.1, maxSpeed: 0 },
    // very fast spin (past the comfortable band) + light gravity = acrobatic, flips
    Twitch: { thrust: 1400, gravity: 440, linDamp: 0.8,  turnAccel: 30, angDamp: 6,  maxOmega: 9.0, maxSpeed: 0 }
  };
  // ===== flight2 — above-ground AERO model (v24.112) =====
  // Layered ON TOP of flightTune by the rotFlight integrator (080). Gives the
  // rig a real flight envelope: angle-of-attack lift + stall (swoop, dive-to-
  // speed exchange, zoom climbs, flare landings, engine-off glides), a ground-
  // effect cushion near terrain (the ekranoplan), a dive-EARNED soft speed cap
  // (momentum from a dive is kept, then decays — replaces the hard sideways
  // clamp while enabled), throttle-coupled turn authority (coast to whip the
  // nose, thrust to commit), and a transonic ladder (controls stiffen toward
  // BOOM_V; crossing it fires a one-shot sonic-boom event for FX/audio).
  // NO WIND ANYWHERE: every force is a pure function of the rig's own state
  // (owner rule 2026-06-09 — air must never shove the rig around).
  // ENABLE: 0 reverts to the pure thrust+drag model above. 'flight2' GM group.
  var flight2 = {
    ENABLE: 1,
    // --- lift + drag (the aero core; facing-vs-velocity angle drives Cl) ---
    CLA: 4.6,          // lift slope per rad of angle-of-attack
    STALL_A: 0.30,     // stall alpha (rad, ~17 deg) — Cl breaks past this
    STALL_BLEND: 1.45, // stall->flat-plate blend width (x STALL_A)
    CLMAX: 1.25,       // lift ceiling
    CD0: 0.09,         // parasitic drag (raise = brickier rig, steeper glides)
    K_IND: 0.30,       // induced drag (cost of pulling lift; bleeds turns)
    AREA_K: 0.011,     // q normalizer (wing area / mass): lift scale
    MIN_AERO_V: 70,    // px/s — below this NO aero at all (hover untouched)
    LINDAMP_MULT: 0.45,// scales flightTune.linDamp while aero drag is live
    // --- stall telegraph + recovery assist (band-limited, v24.116) ---
    // The telegraph + assist fire ONLY in the wing-flight envelope. Past
    // BUFFET_HI x STALL_A the rig is just a falling/ballistic body (tail
    // slides, upright descents, drifting liftoffs): no buzz, no horn, no
    // weathervane there. That band cap is what keeps falls + liftoffs calm.
    BUFFET_A0: 0.75,   // buffet warning starts at this fraction of STALL_A
    BUFFET_HI: 2.0,    // telegraph fades OUT by this multiple of STALL_A
    TELEGRAPH_V: 150,  // px/s min airspeed for any buffet/horn/assist
    WV_TORQUE: 5.0,    // weathervane nose-toward-velocity rate past stall
    WV_HI: 1.15,       // rad: assist fades to zero by this alpha (no tail-slide fighting)
    TREMOR_AMP: 1.0,   // event-shiver strength (0 = off; ~0.2px at 1.0, barely-there by design)
    // --- handling: throttle-coupled turn (Luftrausers) ---
    TURN_THRUST_MULT: 0.62, // turn-accel authority while thrusting
    TURN_OMEGA_MULT: 0.80,  // spin-cap authority while thrusting
    TURN_EASE: 12,          // 1/s ease between coast/thrust turn regimes
    // --- speed envelope: soft cap + dive-earned overshoot ---
    SOFT_CAP: 323,     // px/s sustained envelope (aero wall, not a clamp). ~27 MPH surface cruise (owner 2026-06-21: bump max horizontal from ~18 to ~27; was 215/~15). Underground flight uses UNDERGROUND_AIR_SPEED, unaffected.
    OVER_K: 60,        // steepness of the overspeed drag wall
    DIVE_OVER: 1.45,   // max earned cap multiplier from a committed dive
    OVER_GAIN: 0.28,   // how fast diving earns overshoot budget
    OVER_DECAY: 2.4,   // s — earned overshoot bleeds back after the pullout
    FALL_CAP: 980,     // replaces MAX_FALL 740 while aero is on (dives bite)
    // --- ground effect (ekranoplan cushion near terrain/water decks) ---
    GE_SPAN: 88,       // px "wingspan": cushion strength keyed to h/span
    GE_LIFT: 0.10,     // max bonus lift at the deck
    GE_DRAG: 0.55,     // induced-drag fraction remaining at the deck
    // --- transonic ladder ---
    STIFF_V: 470,      // px/s — rotation authority starts stiffening here
    STIFF_MIN: 0.62,   // floor on rotation authority at the barrier
    BOOM_V: 575,       // px/s — sonic-boom threshold (dive-reachable only)
    // --- thrust spool ADSR (audible spool; ignition kick keeps frame-1 punch) ---
    SPOOL_RISE: 11,    // 1/s attack (~90ms) — was 48 (~20ms) in flight1
    SPOOL_FALL: 26,    // 1/s release — soft enough for a flame tail
    SPOOL_FLOOR: 0.35  // spool snaps here on ignition so taps still kick
  };
  // ----- Aero feel presets (the FLIGHT FEEL strip pinned atop the L panel) -----
  // Base = the stock flight2 values captured right here at boot, so the stock
  // bundle can never drift from the defaults above. Each preset is a FULL
  // bundle (base + overrides): applying one is deterministic and the strip's
  // exact-match highlight works. Tune characters, not single numbers.
  var FLIGHT2_PRESET_BASE = (function () {
    var o = {}, k;
    for (k in flight2) { if (flight2.hasOwnProperty(k)) o[k] = flight2[k]; }
    return o;
  })();
  function buildFlight2Preset(over) {
    var o = {}, k;
    for (k in FLIGHT2_PRESET_BASE) { if (FLIGHT2_PRESET_BASE.hasOwnProperty(k)) o[k] = FLIGHT2_PRESET_BASE[k]; }
    for (k in over) { if (over.hasOwnProperty(k)) o[k] = over[k]; }
    return o;
  }
  var FLIGHT2_PRESETS = {
    // The shipped default: balanced hero rig (swoop with honest weight).
    'Stock Rig': buildFlight2Preset({}),
    // Draggy workhorse: steeper glides, lower envelope, boom takes real commitment.
    'Heavy Hauler': buildFlight2Preset({ CD0: 0.16, K_IND: 0.45, AREA_K: 0.0095, LINDAMP_MULT: 0.55, SOFT_CAP: 200, OVER_K: 70, DIVE_OVER: 1.35, OVER_GAIN: 0.24, FALL_CAP: 940, GE_LIFT: 0.12, STIFF_V: 430, BOOM_V: 520 }),
    // Long floaty glides, generous deck cushion, gentle early stall.
    'Sailplane': buildFlight2Preset({ CD0: 0.05, K_IND: 0.18, AREA_K: 0.014, LINDAMP_MULT: 0.30, SOFT_CAP: 225, DIVE_OVER: 1.55, OVER_DECAY: 3.0, GE_LIFT: 0.14, GE_SPAN: 100, STALL_A: 0.27, BOOM_V: 590 }),
    // Loose and fast: big coast-whip contrast, easy boom, weak assists.
    'Daredevil': buildFlight2Preset({ TURN_THRUST_MULT: 0.52, TURN_OMEGA_MULT: 0.72, DIVE_OVER: 1.65, OVER_GAIN: 0.34, OVER_DECAY: 3.4, SOFT_CAP: 220, BOOM_V: 545, STIFF_MIN: 0.55, WV_TORQUE: 4.0, FALL_CAP: 1060 }),
    // The pre-aero v24.64 model: every aero term off, hard caps back.
    'Classic (no aero)': buildFlight2Preset({ ENABLE: 0 })
  };
  // ===== VTOL hover flight tunables (v24.145, flight mode 2) =====
  // Terraria-wings HANDLING on the same diesel rocket: the rig stays upright
  // (no heading), moveU climbs, L/R is DIRECT horizontal authority, release
  // drifts on mild air friction. Fuel is the only limiter — no flight meter,
  // no run-dry glide state, full fall damage. Input never pushes past the
  // cruise cap, but EARNED overspeed (boost rings, dives) is kept and bled
  // gently so combat/course dynamics survive. The integrator (080) LERPs this
  // whole envelope into the underground air numbers across the 3-block
  // handoff band, so underground/above-ground is one continuous control
  // paradigm — never a flip. Registered as the 'vtol' GM group (L panel).
  var vtolTune = {
    acc: 850,         // px/s^2 direct horizontal authority (the "wings" half)
    speed: 323,       // px/s cruise cap — input stops pushing here. ~27 MPH surface cruise (owner 2026-06-21: bump max horizontal from ~18 to ~27; was 215/~15)
    fric: 240,        // px/s^2 no-input horizontal bleed (a little glide-slide)
    revBoost: 1.9,    // accel multiplier while opposing your own vx (dodge flips)
    climbForce: 1500, // px/s^2 peak upward force
    climbTerm: -380,  // px/s sustained climb ceiling (headroom-eased, like the jet)
    gravity: 760,     // px/s^2 fall pull (= GRAVITY_PLAYER for a real, rockety fall)
    gravRelief: 0.30, // fraction of gravity removed at full thrust spool
    overBleed: 0.55,  // 1/s exp decay on speed past the cap (~1.3s half-life)
    tilt: 0.34        // rad visual bank target while steering (a lean, not physics)
  };
  // Named VTOL feel presets (one-click buttons atop the 'vtol' L-panel group;
  // owner picks by feel). Full bundles — applying one is deterministic.
  var VTOL_PRESETS = {
    // The shipped default: crisp strafe authority, real fall, dodge-flip bite.
    Strafe:  { acc: 850, speed: 323, fric: 240, revBoost: 1.9, climbForce: 1500, climbTerm: -380, gravity: 760, gravRelief: 0.30, overBleed: 0.55, tilt: 0.34 },
    // Light and hangy: softer pull, long slide, gentler climb — the lazy cruiser.
    Feather: { acc: 700, speed: 210, fric: 140, revBoost: 1.6, climbForce: 1400, climbTerm: -330, gravity: 620, gravRelief: 0.42, overBleed: 0.40, tilt: 0.30 },
    // Mass: strong engine, hard fall, deliberate direction changes, keeps speed.
    Freight: { acc: 600, speed: 230, fric: 320, revBoost: 1.5, climbForce: 1650, climbTerm: -300, gravity: 880, gravRelief: 0.25, overBleed: 0.70, tilt: 0.40 }
  };
  var FLIGHT_MODE_NAMES = ['today (legacy)', 'full rotation', 'VTOL hover'];
  var lastTime = 0;
  var depthRecord = 0;
  var gameStartedAt = 0;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var DPAD_SIZE, DPAD_CX, DPAD_CY, DPAD_BTN;

  /* ---- Day/night cycle (Stage 5a) ----
     timeOfDay ∈ [0, 1) drives the entire day/night system. Advanced each
     frame in loop() by dt / DAY_CYCLE_SECONDS, wraps modulo 1.
       t = 0     → midnight (sun at nadir, moon at zenith)
       t = 0.25  → sunrise  (sun on horizon, rising)
       t = 0.5   → noon     (sun at zenith)
       t = 0.75  → sunset   (sun on horizon, setting)
     Sun elevation: elev = (timeOfDay - 0.25) * 2π, then a dwell warp slows
     the sun through the horizon crossings (see computeSunElevation). So
     elev = 0 at sunrise (t=0.25), +π/2 at noon (t=0.5), π at sunset (t=0.75),
     -π/2 at midnight (t=0). sin(elev) is the sun's y-component; positive =
     above horizon.

     Default cycle is 60 seconds for Stage 5 testing. Will likely lengthen
     to 8-12 minutes for normal play once the scattering work settles. */
  var DAY_CYCLE_SECONDS = 480;  // v10.72 — 8 minute cycle
  // v10.68 — sun knobs locked to the values picked via the dev panel
  // before it was removed. Mie phase G stays at the original 0.758
  // default. Tweak in source if you want them different.
  var SUN = {
    paused:       false,
    fovY_deg:     88,
    pitch_deg:    16,
    altitude_deg: 48,
    azimuth_deg:  46,
    intensity:    26.5,
    discSize:     0.05,
    mieG:         0.758
  };

  // ---- Camera framing constants (used by both the camera update and the
  // sky shader / celestialPos so the "horizon" line stays consistent
  // regardless of player altitude). v10.64.
  // v11.27 — lower frac = rig sits higher on screen = more earth visible
  // below it. User wants less sky / more earth on the surface.
  var CAMERA_SURFACE_FRAC = 0.40;
  var CAMERA_DEEP_FRAC    = 0.43;
  // Day/night cycle boot values. Shared by the initializers below and init() so
  // a restart resets the cycle to the same time of day as a fresh boot.
  var TIME_OF_DAY_START = 0.75 - 60 / DAY_CYCLE_SECONDS;  // v10.74: start ~60s before the first dusk (sunset at t=0.75)
  var MOON_PHASE_START  = 0.5;  // 0 = new, 0.5 = full; steps 1/8 each in-game day
  var timeOfDay = TIME_OF_DAY_START;
  var moonPhase = MOON_PHASE_START;
  // Dev boot lever (mirrors ?wmood= for weather): ?tod=0.78 boots the clock
  // at that time of day (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset)
  // and freezes the sun there (SUN.paused) — for sky/horizon screenshot
  // harnesses. init() re-reads timeOfDay from TIME_OF_DAY_START, so the
  // override also re-applies itself there via TOD_BOOT.
  var TOD_BOOT = -1;
  try {
    var todBootM = /[?&]tod=(0?\.\d+|[01])/.exec(location.search);
    if (todBootM) {
      TOD_BOOT = Math.min(0.999, Math.max(0, parseFloat(todBootM[1])));
      timeOfDay = TOD_BOOT;
      SUN.paused = true;
    }
  } catch (e) {}
  // Dwell warp — artificially slow the sun through sunrise/sunset so the
  // dramatic twilight lingers. The raw arc (t-0.25)*2π is reshaped by
  // arcW = arc - 0.5*A*sin(2*arc): the derivative 1 - A*cos(2*arc) drops to
  // (1-A) at the horizon crossings (arc = 0, π → sunrise, sunset) and rises to
  // (1+A) at noon/midnight, so the sun crawls near the horizon and hurries
  // overhead. The warp is 0 at the crossings, so crossing times and total day
  // length are unchanged; monotonic (no time reversal) for A < 1. Every sky
  // consumer routes through here, so the whole scene lingers in twilight
  // together. A = 0 restores the linear cycle.
  var SUN_DWELL = 0.65;
  function computeSunElevation(t) {
    var arc = (t - 0.25) * 2 * Math.PI;   // see header comment
    return arc - 0.5 * SUN_DWELL * Math.sin(2 * arc);
  }
  function computeSunY(t) {
    return Math.sin(computeSunElevation(t));
  }

  /* ---- Smoke: SPH-lite fallback sim STATE (Stam-style grid) ----
     We maintain a 2D grid of velocity (u,v) and density (d, s, T) fields
     covering a rectangular region of world space centered above the rig.
     The grid scrolls with the rig (origin snapped to integer cells; field
     arrays shift to match when the player crosses a cell boundary).

     Each frame, in order:
       1. update grid origin, shift fields if scrolled
       2. bake an obstacle mask from world tiles inside our footprint
       3. inject sources (diesel density at exhaust)
       4. add buoyancy (denser cells rise) + ambient damping
       5. vorticity confinement (re-amplifies small-scale curls)
       6. enforce solid-cell boundaries
       7. pressure project (Gauss-Seidel) → divergence-free velocity
       8. semi-Lagrangian advect velocity, then project again
       9. semi-Lagrangian advect density (D, S, T)
      10. exponential decay of density / temperature
      11. render: density → ImageData → offscreen canvas → drawImage

     The result is one continuous billowing volume — curls, vortex
     shedding, ceiling pooling all emerge from the math. */
  var FLUID_W, FLUID_H, FLUID_CELL;
  var FLUID_PRESSURE_ITERS;
  var FLUID_DENSITY_DECAY;
  var FLUID_TEMP_DECAY;
  var FLUID_BUOYANCY;
  var FLUID_VORT_EPS;
  var FLUID_AMBIENT_DAMP;
  var fluidU = null, fluidV = null, fluidU0 = null, fluidV0 = null;
  var fluidD = null, fluidD0 = null;            // diesel density (dark)
  var fluidS = null, fluidS0 = null;            // steam density (white)
  var fluidT = null;                            // temperature (warm tint)
  var fluidObst = null;                         // 1 = solid tile cell
  var fluidP = null, fluidDiv = null, fluidCurl = null;
  var fluidScratch = null;                      // shift/advect scratch
  var fluidImage = null;
  var fluidCanvas = null, fluidCtx = null;
  var fluidGridX = 0, fluidGridY = 0;
  var fluidShedPhase = 0;
  var fluidReady = false;
  var fluidPerfStress = 0;

  /* ---- Drill animation state ----
     The drill arm physically extends/retracts and points in the direction
     of drilling. `extension` is a 0..1 value that lerps toward target.
     `pumpPhase` is a fast oscillator that adds the in-and-out pumping
     during active drilling. `angle` rotates the arm to face the drill
     target (down/up/left/right). */
  var drillAnim = {
    angle: Math.PI * 0.45,         // current arm angle (radians); pi/2 = down
    targetAngle: Math.PI * 0.45,
    extension: 0,                  // 0..1 how far arm is extended
    targetExtension: 0,
    pumpPhase: 0,
    coneSpin: 0,                   // accumulated rotation of cutter head (radians)
  };

