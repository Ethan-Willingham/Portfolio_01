  /* ---- Constants ---- */

  /* ============================================================
     FEATURE FLAGS  (the free-forever single-town sandbox)
     ------------------------------------------------------------
     2026-06-19: Sluice reversed course. It is now FREE FOREVER,
     public, and a single calm mining town. The bigger systems that
     were built out (the wide multi-town world, combat + the rig
     auto-turret, No Man's Zone obstacle courses, the cross-town
     Trade Board, jello/slime soft bodies, underground oil, and ore
     refinement) are DISABLED here, not deleted. Each is one flag away.

     IMPORTANT for future sessions: a disabled system is NOT a bug.
     Do not "fix" missing combat / zones / oil / slimes, and do not
     flip a flag back to true without asking the owner. The systems
     still compile and keep their gm levers; they are just inert.

     Every flag can be overridden per page-load with a URL param, so
     a disabled system can be spot-checked without a rebuild:
       ?multitown=1  wide 4-town world      ?combat=1  enemies + turret
       ?nmz=1        No Man's Zone courses   ?board=1   the Trade Board
       ?jello=1      jello/slime bodies      ?oil=1     oil seams + pump
       ?refine=1     ore-refinement catalog
     ============================================================ */
  var SINGLE_TOWN        = true;   // one coherent town; false = the wide 4-town world
  var ENABLE_COMBAT      = false;  // enemies, missiles, flak, the rig auto-turret
  var ENABLE_NMZ         = false;  // No Man's Zone obstacle courses + exit-arrow HUD
  var ENABLE_TRADE_BOARD = false;  // the cross-town commodity Trade Board station
  var ENABLE_JELLO       = false;  // squishy jello / slime soft bodies
  var ENABLE_OIL         = false;  // underground oil seams + the oil pump upgrade
  var ENABLE_REFINEMENT  = false;  // the (never-finished) ore-refinement item catalog
  // Per-load URL overrides for spot-checking a disabled system (see above).
  try {
    var _ffq = (window.location && window.location.search) || '';
    if (/[?&]multitown=1/.test(_ffq)) SINGLE_TOWN = false;
    if (/[?&]single=1/.test(_ffq))    SINGLE_TOWN = true;
    if (/[?&]combat=1/.test(_ffq))    ENABLE_COMBAT = true;
    if (/[?&]nmz=1/.test(_ffq))       ENABLE_NMZ = true;
    if (/[?&]board=1/.test(_ffq))     ENABLE_TRADE_BOARD = true;
    if (/[?&]jello=1/.test(_ffq))     ENABLE_JELLO = true;
    if (/[?&]oil=1/.test(_ffq))       ENABLE_OIL = true;
    if (/[?&]refine=1/.test(_ffq))    ENABLE_REFINEMENT = true;
  } catch (e) {}

  var TILE = 32;
  var COLS = 160;            // single-town width; reassigned to WORLD_COLS in 015-regions.js once the wide world is built
  var SKY_ROWS = 4;
  var WORLD_ROWS = 1408;     // must be > max(TOWN_DEPTHS) in 015-regions.js (deepest town = 1400) + a few rows of bedrock floor
  var TOTAL_ROWS = SKY_ROWS + WORLD_ROWS;
  var PLAYER_W = 22;
  var PLAYER_H = 26;
  var GRAVITY = 600;
  var MOVE_SPEED = 160;
  var DRILL_TIME = 0.30;        // base seconds per drill hit at drill level 1
  // Per-hit speed multiplier by drill level (1..7): a hit removes 1 HP and
  // takes DRILL_TIME / DRILL_SPEED[level]. Every tier is a real ~20-25%
  // speedup. Replaces the old "tile.hp -= drillLevel" integer model whose
  // ceil(hp/level) left most tiers doing nothing on common ores (a 2-HP ore
  // was maxed at level 3, so levels 4-7 bought zero speed). Deep gems stay
  // weighty even at max drill (unobtanium hp9 ≈ 0.83s of drilling at L7) so
  // the endgame keeps some grind. Tune the curve here.
  var DRILL_SPEED = [0, 1.00, 1.25, 1.55, 1.90, 2.30, 2.75, 3.25];
  var FUEL_DRAIN = 0.8;
  var DRILL_FUEL = 1.5;
  var BASE_HULL = 100;
  var UI_FONT = '"Commit Mono", ui-monospace, Consolas, monospace';
  // ---- Liquid sim tunables (water + underground oil). Every knob below is
  // catalogued — with the algorithm, pipeline, and performance notes — in
  // the LIQUIDS banner; grep "LIQUIDS: SURFACE WATER" to find it. ----
  var LIQUID_CELL = 2.5;
  var LIQUID_MAX_PARTICLES = 120000; // v24.149 — deep lakes at TRUE rest density (655/tile): one
                                     // 9-14 x 5-8 lake = up to ~65k, plus headroom for water the
                                     // player drains down shafts (canal water survives the sweep BY
                                     // DESIGN, so the next lake must still fit). GPU buffers size
                                     // from this at create; the v14.29 stress test ran exactly 120k
                                     // fine on WebGPU. CPU-fallback rest cost stays ~0 via the
                                     // v24.146 whole-body freeze.
  var LIQUID_MAX_CELLS = LIQUID_MAX_PARTICLES * 9;
  var LIQUID_PDELTA = 0.5;
  var LIQUID_DENSITY = 1 / (LIQUID_PDELTA * LIQUID_PDELTA);
  var LIQUID_INV_DENSITY = 1 / LIQUID_DENSITY;
  // v24.182 — DENSITY BLOW-UP CAP. Under hard stress the clamped EOS can run
  // away: a knot of particles collapses to absurd density (measured dn=406, ~90
  // particles in 8px), which the pressure term turns into a ~2000-impulse
  // perpetual-motion engine (the owner's "giant particles that bounce forever").
  // Clamping the gathered density the pressure sees bounds that impulse so a
  // knot can't blow up + sustain itself. Normal water never exceeds ~4x rest
  // (calm tops ~1.6; a stressed field averages ~2.3), so a 6x cap is invisible
  // to real water but kills the runaway. edit2 liquid-wgpu.js (WGSL pressure
  // kernel + both fr() references).
  var LIQUID_DENS_CAP = 6 * LIQUID_DENSITY;
  // v24.185 — MIN-SEPARATION (anti-clump) master on/off. The GPU runs a per-
  // substep min-separation pass (liquid-wgpu.js) so over-dense particle knots
  // are pushed apart and can never get stuck over-pressured. This flag (gm
  // water.DECLUMP) gates the GPU dispatch; the kernel params (DMIN/strength/
  // threshold) live in liquid-wgpu.js. 1 = on, 0 = off (A/B).
  var LIQUID_DECLUMP_ON = 1;
  var LIQUID_AERATION_THRESHOLD = 0.55;
  var LIQUID_AERATION_COEFF = 10.0;
  var LIQUID_AERATION_BLUR = 0.01;
  var LIQUID_AERATION_DAMP = 0.988;
  // ---- Tunable fluid feel ----
  // Lower stiffness = softer, less springy fluid (was effectively 5.0).
  // Damping multiplies particle velocity each substep — global energy bleed
  // that kills MPM "spasms" and lets pools settle. 1.0 = no damping.
  // Wall bounce magnitudes are reflection coefficients for cells inside /
  // adjacent to solid tiles. Lower = wetter (more absorptive walls).
  var LIQUID_PRESSURE_STIFF = 5;         // v24.10 — saharan's exact value (his Water demo EOS is `(d/4-1)*5`; this is the "effectively 5.0" the comment above remembers). v24.8 tried 20 single-step and it splashed constantly; REVERTED. The deep-water "popcorn" was never the stiffness — it was a dt-units mismatch (gravity is dt²-scaled real-time, pressure is dt=1 per-step like saharan's). The real fix is SUBSTEPPING (below), exactly as saharan does. edit² with js/liquid-wgpu.js.
  var LIQUID_DAMPING = 0.992;            // v24.10 — REVERTED to original 0.992 (v24.8's 0.97 made it sluggish). edit² with js/liquid-wgpu.js.
  // ---- Substepping (v24.10) — the deep-water fix, ported from saharan's Water demo ----
  // saharan runs SUBSTEP sub-steps per frame at a fixed dt and keeps gravity +
  // pressure in the SAME per-step time units, so a deep tank stays at ~rest
  // density. Our port left pressure per-step (dt=1, no dt factor in the scatter
  // coeff) but rescaled gravity to real px/s² (×stepDt²). Equilibrium column
  // compression then scales as stepDt², so at the full frame dt (1/60) a deep
  // column over-compresses ~25× and the pent-up pressure detonates it into
  // "popcorn" over time. Substepping shrinks stepDt (compression ∝ stepDt²)
  // WITHOUT changing the real fall speed (ΔV/frame = GRAVITY·dt is invariant of
  // the substep count), so deep water settles like saharan's while splashes
  // feel identical. N = clamp(ceil(dt / LIQUID_SUBSTEP_DT), 1, LIQUID_MAX_SUBSTEPS).
  var LIQUID_SUBSTEP_DT = 1 / 120;       // v24.169 — was 1/240. Matched to saharan's cadence (2 substeps x
                                         // 60fps = 120 steps/s). At 240/s our clamped pressure corrected 2x
                                         // as often as he tuned for = the popcorn limit cycle; 120/s halves
                                         // that. Paired with the LIQUID_GRAVITY drop above. edit² with js/liquid-wgpu.js.
  var LIQUID_MAX_SUBSTEPS = 5;           // cap so a slow frame can't run away on cost. edit² with js/liquid-wgpu.js.
  // v24.124 FIXED-QUANTUM SUBSTEPPING (the 120 Hz "firecracker" fix): the old
  // split (stepDt = totalDt / ceil(totalDt/QUANTUM)) put every vsync rate
  // exactly ON a ceil boundary (1/240 divides both 1/60 and 1/120), so real
  // frame-time jitter flipped the substep count every few frames and stepDt
  // swung (3.0 <-> 4.15 ms at 120 Hz). Rest compression scales with stepDt²,
  // so the pond's equilibrium target jumped ~2x several times a second and
  // the EOS answered with body-wide pressure pops (measured on the owner's
  // 120 Hz machine: sustained max ~140 px/s, wake bursts of 100-900
  // particles every 0.2-0.5 s; the 60 Hz harness only flips 4<->5 = a 1.5x
  // swing, which is why it always read calmer). Fix: advance in EXACT
  // LIQUID_SUBSTEP_DT quanta and bank the remainder in an accumulator, so
  // stepDt is a true constant, the equilibrium never moves, and 60 Hz and
  // 120 Hz machines simulate identically. Heavy frames shed banked time
  // past a 2-quantum cap (water dilates slightly instead of degrading
  // accuracy). Lever: water.FIXED_STEP (0 = legacy split, kept for A/B).
  // edit² with js/liquid-wgpu.js (module twin + runFrame).
  var LIQUID_FIXED_STEP = 1;
  var liquidStepAcc = 0;                 // banked sub-quantum remainder, SIM seconds
  // v25.29 — WATER TIMESCALE (the slo-mo fix). The v24.169 popcorn fix bought
  // rest-calm by dropping LIQUID_GRAVITY 1000 -> 250 (saharan's regime), so
  // water accelerates at well under half the world's GRAVITY (600) and every
  // fall reads as slow motion. Raising gravity back re-enters the over-driven
  // EOS regime the whole v24.169-186 saga climbed out of. Instead: play the
  // SAME sim back faster. Each frame banks dt x TIMESCALE into the fixed-
  // quantum accumulator, so more 1/120 substeps run per wall second while
  // per-substep physics (the calm) is bit-identical — the identical
  // trajectory, fast-forwarded. Effective wall-clock gravity scales by
  // TIMESCALE²: 250 x 1.55² = 600.6 ≈ world GRAVITY, i.e. water finally
  // falls like every other object in the game. Splash heights are unchanged
  // (same trajectories), just snappier. Cost: awake water runs ~3 substeps
  // per 60 Hz frame instead of 2 (+55% sim passes; calm/idle/zero-water
  // skips are all outside the substep loop and still fire). MAX_SUBSTEPS
  // still caps slow frames, so weak devices self-throttle toward 1x speed
  // (never pay more than the old worst case + shed). 1 = the old slo-mo.
  // gm water.TIMESCALE (live); boot A/B ?wdbg=TIMESCALE:1.
  // edit² with js/liquid-wgpu.js (module twin + its runFrame).
  var LIQUID_TIMESCALE = 1.55;
  var LIQUID_WATER_MOTION_SCALE = 0.97;   // v10.107 — restored v10.102 lively tune
  var LIQUID_WALL_BOUNCE_IN = 0.075;
  var LIQUID_WALL_BOUNCE_EDGE = 0.095;
  var LIQUID_OIL_PRESSURE_STIFF = 2.5;
  var LIQUID_OIL_DAMPING = 0.97;
  var LIQUID_OIL_GRAVITY = 600;
  var LIQUID_OIL_WALL_BOUNCE_IN = 0.05;
  var LIQUID_OIL_WALL_BOUNCE_EDGE = 0.06;
  var LIQUID_OIL_FLOOR_FRICTION = 0.89;
  var LIQUID_OIL_WALL_FRICTION = 0.94;
  var LIQUID_OIL_AERATION_THRESHOLD = 0.5;
  var LIQUID_OIL_AERATION_COEFF = 10.0;
  var LIQUID_OIL_AERATION_BLUR = 0.008;
  var LIQUID_OIL_AERATION_DAMP = 0.988;
  // Surface friction. Without these, water on a flat tile keeps any
  // lateral velocity it gets from pressure scatter and accelerates
  // along the surface. Floor friction multiplies horizontal cell
  // velocity when the cell directly below is solid; wall friction
  // multiplies vertical cell velocity when a horizontal neighbor is
  // solid. Lower = more aggressive drag.
  var LIQUID_FLOOR_FRICTION = 0.92;   // v10.102 — was 0.95; water glides more on flats instead of stopping like tar
  var LIQUID_WALL_FRICTION = 0.97;    // v10.102 — was 0.975; very mild loosening
  var LIQUID_GRAVITY = 250;          // v24.169 — was 1000. THE POPCORN FIX: our water gravity was ~4x
                                     // saharan's regime, driving 4x the compression his clamped EOS is
                                     // tuned for, so pressure over-corrected into the limit cycle. Matched
                                     // to his per-step pull at the 1/120 cadence below = calm at rest
                                     // (measured mean 10-13 -> 3-4, pops gone). Cost: water falls gentler.
                                     // Live-tunable now (gm water.LIQUID_GRAVITY updates the GPU). edit2 liquid-wgpu.
  // Per-fluid restitution vs terrain tiles — used by liquidMoveParticle
  // (CPU) and the WebGPU collide kernel. v14.26 — named so the water
  // tuning levers can drive them on both solvers (were inline literals).
  var LIQUID_BOUNCE_WATER = 0.18;
  var LIQUID_BOUNCE_OIL = 0.05;
  // Render colors (0..1 floats). Water lerps base -> foam by aeration.
  // v24.152 — saharan-reference palette (the owner's call, against the
  // demo our solver is ported from): DARK base blue that turns LIGHTER
  // BLUE under turbulence. Foam must never be white: white foam was every
  // "white areas around particles" complaint — spray, rims, churn all
  // read as white paint. edit2 js/liquid-wgpu.js (module twins).
  var LIQUID_WATER_R = 0.165, LIQUID_WATER_G = 0.420, LIQUID_WATER_B = 0.780;
  var LIQUID_WATER_FOAM_R = 0.620, LIQUID_WATER_FOAM_G = 0.840, LIQUID_WATER_FOAM_B = 0.980;
  var LIQUID_WATER_ALPHA = 0.82;   // v24.152 — denser read for the dark palette (was 0.70)
  var LIQUID_OIL_R = 0.051, LIQUID_OIL_G = 0.039, LIQUID_OIL_B = 0.020;
  var LIQUID_OIL_ALPHA = 0.920;
  var LIQUID_WATER_PARTICLE_SIZE = 1.8;  // v24.155 — RESTORED to 1.8 (v24.154's 1.15 starved the merged body
                                         // field: "static TV" holes between particles, see-through water).
                                         // The body's solidity NEEDS fat overlapping splats; stray-droplet
                                         // bloat is fixed by the sleeper size clamp + evaporation instead.
  var LIQUID_OIL_PARTICLE_SIZE = 2.5;
  var LIQUID_PARTICLE_SIZE = LIQUID_WATER_PARTICLE_SIZE;
  // v24.113 — SURFACE RENDER (WebGPU renderer only): splat particles into
  // an offscreen density field and composite through a smoothstep
  // threshold, so water draws as ONE continuous body with a clean surface
  // line instead of visible per-particle balls. Live gm levers (water
  // group); SURFACE_RENDER 0 restores the legacy discs. The CPU/WebGL
  // fallback renderer ignores these (it always draws discs).
  var LIQUID_SURFACE_RENDER = 1;
  // v24.162 — THE GIANT-PARTICLE FIX (proven via DBG_PARTICLES: the scattered
  // "giant particles" are SINGLE particles, one dot each, rendered as full
  // discs). The surface render is a metaball field: a lone particle splats a
  // peak of ~1.0, a real body stacks to 10-50. THRESH 0.85 was so low a single
  // particle's 1.0 bump crossed it and drew a disc. Raised so the lower
  // smoothstep edge (THRESH-SOFT = 1.0) sits ABOVE one particle's peak: lone
  // particles fall below visibility and vanish, bodies (field >> 1) stay fully
  // solid (size kept at 1.8 so the interior field is high — no static-TV, that
  // was caused by SHRINKING size in v24.154, not by threshold). edit2 liquid-wgpu.js.
  var LIQUID_SURFACE_THRESH = 1.8;    // v24.162 — was 0.85; one particle (peak ~1.0) now invisible
  var LIQUID_SURFACE_SOFT = 0.8;      // v24.162 — was 0.35; lower edge THRESH-SOFT=1.0 = exactly one-particle peak
  var LIQUID_SURFACE_RSCALE = 1.7;
  // v24.160 — PARTICLE PROOF overlay (WebGPU only): 1 = draw every particle
  // as its own tiny hard dot (no density scaling, no metaball merge),
  // coloured per-index, on top of the water. Diagnostic for "is that giant
  // thing one particle or a cluster" — a single particle shows one dot, a
  // cluster fills with a speckle. gm water.DBG_PARTICLES (L panel).
  var LIQUID_DBG_PARTICLES = 0;
  // v24.115 GRID VISCOSITY: per substep, each massy grid cell's velocity
  // blends toward its massy 4-neighbour average (momentum diffusion). The
  // clamped EOS is a limit-cycle oscillator at rest, so a settled pond
  // otherwise breathes standing waves forever ("waves from both sides",
  // pop-rocks splashes); anti-phase neighbours cancel under this blend
  // while uniform flow is untouched. 0 disables. edit2 liquid-wgpu.js.
  // v24.164 raised this 0.45->0.7 to overdamp the limit cycle; v24.166
  // reverted to 0.45 (the 0.7 was paired with the now-disabled force-freeze;
  // the runaway it was masking was fixed AT THE SOURCE instead - LIQUID_DENS_CAP
  // + the anti-clump pass in liquid-wgpu.js, v24.182-186 - so more settled
  // damping is not the path).
  var LIQUID_GRID_VISC = 0.45;
  var LIQUID_SURFACE_PARTICLE_MAX = 16000;
  var LIQUID_SURFACE_WATER_TARGET = 1800;
  var LIQUID_SURFACE_OIL_TARGET = 0;
  var LIQUID_SURFACE_WATER_PARTICLES_PER_TILE = 655;   // v24.149 — TRUE rest density (TILE/step)^2 = (32/1.25)^2.
                                                       // The old 400 (v11.44) was ~61% of rest, so a pit filled to
                                                       // only 61% of its height — invisible on 1-deep puddles, but
                                                       // the deep lakes parked their waterline ~2.5 tiles below the
                                                       // brim ("fix it so the water goes all the way to the surface").
                                                       // At 655 the born-settled fill tops out flush with the ground.
  // Ejection force applied to grid cells that fall inside the player AABB
  // so water can't sit on top of (or inside) the miner.
  var LIQUID_PLAYER_EJECT = 720;
  // Visual miner silhouette in player-local coords (dir>0 frame). Hull is the
  // armored cab, tracks is the wider bed below. Cells inside either rect count
  // as solid for water; outside the AABB but inside these is air. When the
  // miner faces left we mirror local-x across PLAYER_W.
  var LIQUID_MINER_HULL_L = 3.0;
  var LIQUID_MINER_HULL_T = 6.0;
  var LIQUID_MINER_HULL_R = 20.0;
  var LIQUID_MINER_HULL_B = 20.0;
  var LIQUID_MINER_TRACK_L = 1.5;
  var LIQUID_MINER_TRACK_T = 18.0;
  var LIQUID_MINER_TRACK_R = 20.5;
  var LIQUID_MINER_TRACK_B = 25.0;
  // Eject center — roughly the centroid of the combined silhouette.
  var LIQUID_MINER_CX = 11.0;
  var LIQUID_MINER_CY = 15.5;
  var LIQUID_OIL_VALUE = 18;       // dollars per gallon when sold at station
  var LIQUID_OIL_PER_PARTICLE = 0.16;

  // Earth bedrock floor: a single row of unbreakable tiles at the very bottom
  // of the Earth world. Stops the player from clipping into the void below
  // the world. Sits one row above what was previously the implicit wall.
  var BEDROCK_ROW = TOTAL_ROWS - 1;                       // last row of the Earth world

  /* ---- Station foundation ----
     The shop and pump pad sit directly on the world surface, on a short
     unbreakable cement foundation so the base can never be undermined. */
  var DECK_ROW = SKY_ROWS;                     // tile row of the station foundation
  // Foundation extends asymmetrically: the surface compound (station +
  // windsock + gas-station) lives mostly to the RIGHT of the station, so
  // there's no reason to pour slate on the far left where nothing stands.
  var DECK_HALF_LEFT = 4;                      // tiles left of deck center — just enough to cover the station footprint
  var DECK_HALF_RIGHT = 11;                    // tiles right of deck center — covers fireplace + gas-station depot (depot pushed +1 tile to seat the fireplace with full 64 px clearance per BUILDING_STYLE §15)
  var DECK_CENTER_COL = Math.floor(COLS / 2) - 1;
  var DECK_LEFT_COL = DECK_CENTER_COL - DECK_HALF_LEFT;
  var DECK_RIGHT_COL = DECK_CENTER_COL + DECK_HALF_RIGHT;

  /* ---- Ore definitions ----
     Each ore has:
       - color, value, hp (drill hits)
       - minDepth / maxDepth: depth range where it can spawn (in tiles below surface)
       - chance: base spawn weight
       - host: 'dirt' | 'stone'. The terrain material this Earth ore is locked
               to. generateWorld() converts each ore's neighbour ring to its
               host, so an ore is never found in both materials (dirt wins where
               a dirt- and a stone-hosted ore meet). Moon ores omit it.
       - reqDrill: minimum drillLevel needed to mine (else: bounces)
       - reqHeat: requires Heated Drill upgrade
  */
  var ORES = {
    // Common rubble (both worthless, dirt is skipped from cargo)
    dirt:       { color: '#6B4226', value: 0,     minDepth: 0,   maxDepth: 999, chance: 0.45, hp: 1, label: 'Dirt' },
    stone:      { color: '#7A7A7A', value: 0,     minDepth: 0,   maxDepth: 999, chance: 0.10, hp: 2, label: 'Stone' },
    // Earth station foundation — solid, cement, unminable. Spawned at fixed positions only.
    foundation: { color: '#8b887c', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Foundation' },

    // Reinforced barrier band — bracketing the permafrost/fossil interface.
    // Drills bounce off; only explosives can clear it. Spawned at fixed
    // depths only, so chance/minDepth here are 0.
    barrier:    { color: '#2a3038', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Reinforced Rock' },

    // Jello — squishy unminable soft-body block. The drill bounces off it
    // like barrier; the player mines AROUND it, shoves it out of its socket,
    // and it becomes a live PBD soft body (see the JELLO SOFT BODIES banner).
    // Spawned only in small clusters by generateJelloPatches(), so chance 0.
    jello:      { color: '#3ce9bf', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Jello', tooltip: 'Squishy — unminable' },

    // ---- Shallow crust: the dirt/stone intro pair ----
    coal:       { color: '#1c1c1c', value: 5,     minDepth: 4,   maxDepth: 45,  chance: 0.10, hp: 2, label: 'Coal', host: 'dirt' },
    copper:     { color: '#c97534', value: 12,    minDepth: 8,   maxDepth: 52,  chance: 0.08, hp: 2, label: 'Copper', host: 'stone' },

    // ---- Subsoil & upper rock ----
    malachite:  { color: '#1e7a44', value: 45,    minDepth: 18,  maxDepth: 80,  chance: 0.03,  hp: 3, label: 'Malachite', tooltip: 'Banded copper ore', host: 'stone' },
    bauxite:    { color: '#c85b2e', value: 25,    minDepth: 38,  maxDepth: 88,  chance: 0.055, hp: 3, label: 'Bauxite', host: 'dirt' },
    iron:       { color: '#8f9294', value: 35,    minDepth: 50,  maxDepth: 105, chance: 0.05, hp: 3, label: 'Iron', host: 'stone' },
    pyrite:     { color: '#D4B33A', value: 60,    minDepth: 66,  maxDepth: 112, chance: 0.022, hp: 3, label: 'Pyrite', tooltip: "Fool's Gold", host: 'stone' },
    galena:     { color: '#8a93a0', value: 70,    minDepth: 45,  maxDepth: 110, chance: 0.024, hp: 3, label: 'Galena', tooltip: 'Lead ore', host: 'stone' },
    magnetite:  { color: '#1a1e26', value: 110,   minDepth: 60,  maxDepth: 180, chance: 0.03,  hp: 4, label: 'Magnetite', tooltip: 'Lodestone', host: 'stone' },

    // ---- Permafrost (depth 70-130, needs the heated drill) ----
    methaneice: { color: '#bfe6ff', value: 180,   minDepth: 82,  maxDepth: 128, chance: 0.04, hp: 4, label: 'Methane Ice', reqHeat: true, host: 'dirt' },
    silver:     { color: '#D8D8E8', value: 90,    minDepth: 88,  maxDepth: 146, chance: 0.026, hp: 3, label: 'Silver', host: 'stone' },
    turquoise:  { color: '#40c4b8', value: 200,   minDepth: 75,  maxDepth: 135, chance: 0.02,  hp: 4, label: 'Turquoise', tooltip: 'Matrix-webbed', host: 'dirt' },
    cobalt:     { color: '#2f5bd8', value: 160,   minDepth: 80,  maxDepth: 200, chance: 0.026, hp: 4, label: 'Cobalt', host: 'stone' },

    // ---- Fossil beds (sedimentary, dirt-rich) ----
    amber:      { color: '#e89a2a', value: 350,   minDepth: 142, maxDepth: 188, chance: 0.026, hp: 3, label: 'Amber', tooltip: 'Insect inside', host: 'dirt' },
    fossil:     { color: '#7a5436', value: 600,   minDepth: 148, maxDepth: 188, chance: 0.013, hp: 4, label: 'Fossil', tooltip: 'Bones', host: 'dirt' },
    cinnabar:   { color: '#c12838', value: 140,   minDepth: 140, maxDepth: 196, chance: 0.024, hp: 4, label: 'Cinnabar', tooltip: 'Mercury ore', host: 'stone' },
    jade:       { color: '#4f9e6e', value: 240,   minDepth: 120, maxDepth: 280, chance: 0.018, hp: 4, label: 'Jade', tooltip: 'Polished nephrite', host: 'stone' },
    lapis:      { color: '#1e3a8f', value: 320,   minDepth: 150, maxDepth: 225, chance: 0.018, hp: 4, label: 'Lapis Lazuli', tooltip: 'Ultramarine', host: 'stone' },
    amethyst:   { color: '#8a5cd0', value: 280,   minDepth: 160, maxDepth: 240, chance: 0.02,  hp: 4, label: 'Amethyst', tooltip: 'Quartz geode', host: 'stone' },

    // ---- Deep crust ----
    gold:       { color: '#FFD700', value: 200,   minDepth: 176, maxDepth: 250, chance: 0.022, hp: 4, label: 'Gold', host: 'dirt' },
    uranium:    { color: '#5fff5a', value: 800,   minDepth: 198, maxDepth: 258, chance: 0.013, hp: 5, label: 'Uranium', tooltip: 'Radioactive', reqDrill: 3, host: 'stone' },
    rhodochrosite: { color: '#d85f86', value: 480, minDepth: 200, maxDepth: 270, chance: 0.012, hp: 5, label: 'Rhodochrosite', tooltip: 'Rose of the Andes', host: 'stone' },

    // ---- Magma (depth 248-318, needs the heat shield): volcanic rock, stone only ----
    obsidian:   { color: '#1a0a18', value: 280,   minDepth: 248, maxDepth: 320, chance: 0.03, hp: 4, label: 'Obsidian', host: 'stone' },
    sulfur:     { color: '#f0d83a', value: 360,   minDepth: 250, maxDepth: 318, chance: 0.022, hp: 4, label: 'Sulfur', tooltip: 'Brimstone crust', reqDrill: 3, host: 'stone' },
    emerald:    { color: '#50C878', value: 900,   minDepth: 270, maxDepth: 340, chance: 0.015, hp: 5, label: 'Emerald', host: 'stone' },
    peridot:    { color: '#9ccb3a', value: 1100,  minDepth: 280, maxDepth: 345, chance: 0.011, hp: 5, label: 'Peridot', tooltip: 'Mantle olivine', reqDrill: 4, host: 'stone' },

    // ---- Crystal caves: the gem jackpot (crystalline, all stone-hosted) ----
    ruby:       { color: '#E0115F', value: 1400,  minDepth: 318, maxDepth: 386, chance: 0.012, hp: 5, label: 'Ruby', host: 'stone' },
    tanzanite:  { color: '#7a5fff', value: 2000,  minDepth: 330, maxDepth: 390, chance: 0.009, hp: 5, label: 'Tanzanite', reqDrill: 3, host: 'stone' },
    diamond:    { color: '#B9F2FF', value: 3000,  minDepth: 345, maxDepth: 396, chance: 0.0075, hp: 6, label: 'Diamond', reqDrill: 4, host: 'stone' },
    opal:       { color: '#dfeaf0', value: 900,   minDepth: 200, maxDepth: 380, chance: 0.008, hp: 5, label: 'Opal', tooltip: 'Play of colour', reqDrill: 4, host: 'dirt' },
    platinum:   { color: '#cdd6de', value: 2200,  minDepth: 330, maxDepth: 396, chance: 0.006, hp: 6, label: 'Platinum', reqDrill: 5, host: 'stone' },

    // ---- Endgame: mantle ----
    painite:    { color: '#d36b8c', value: 6000,  minDepth: 364, maxDepth: 400, chance: 0.004, hp: 7, label: 'Painite', tooltip: 'Rarest gem on Earth', reqDrill: 5, host: 'stone' },
    unobtanium: { color: '#FF00FF', value: 12000, minDepth: 388, maxDepth: 400, chance: 0.002, hp: 9, label: 'Unobtanium', reqDrill: 6, host: 'stone' },

    // The Great Seam (ЖИЛА): the legendary one-time find at the floor of the
    // deepest town. Placed only by carveGreatSeamChamber() (030); the drill
    // cannot break it, extraction is special-cased via seamExtract() (295),
    // so value/chance/minDepth are all 0 here.
    greatseam:  { color: '#ffd24a', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'The Great Seam', tooltip: 'The legend the frontier was dug for' },

    // Earth bedrock floor — unbreakable, a hard cap at the bottom of the
    // Earth world. Spawned only at fixed positions; not selectable by pickOre.
    bedrock:    { color: '#2a2018', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Bedrock' },

    // No Man's Zone substrate: the inaccessible solid below the 3-dirt skin of
    // a combat zone. Unbreakable AND bomb-proof (fully impassable, unlike
    // barrier which bombs clear). Emitted only as virtual zone tiles (see
    // 015-regions.js zoneTileAt); never selected by pickOre.
    voidrock:   { color: '#15171c', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Void Rock', tooltip: 'Impassable' },
  };
  var ORE_KEYS = Object.keys(ORES);
  var EARTH_ORE_SPAWN_MULTIPLIER = 0.26;
  // Shiny ores — a rare, unmistakable variant of any ore (colours inverted +
  // edge sparkles, drawn live in 140 via drawShinyTile). Flag is set per-ore
  // at worldgen (030 depositOreVeins). Rarity is live-tunable via the gm lever
  // 'ore.SHINY_ORE_CHANCE'. "Plenty rare" per owner, so ~1% of ore tiles.
  var SHINY_ORE_CHANCE = 0.01;
  // A shiny unit sells for this multiple of its base ore value (the jackpot
  // payoff for the rare variant). Live-tunable via gm 'ore.SHINY_VALUE_MULT'.
  var SHINY_VALUE_MULT = 5;
  // ----- Cargo entries -----
  // The hold (`cargo`) carries one entry PER MINED UNIT: { type, shiny }. These
  // helpers read an entry uniformly and tolerate a bare ore-type string too, so
  // a legacy/defensive entry never throws. cargoUnitValue folds in the shiny
  // premium and is the single source of a unit's worth (sell + bay readouts).
  function cargoType(u) { return (u && u.type) || u; }
  function cargoShiny(u) { return !!(u && u.shiny); }
  function cargoUnitValue(u) {
    var d = ORES[cargoType(u)];
    if (!d || !d.value) return 0;
    return Math.round(d.value * (cargoShiny(u) ? SHINY_VALUE_MULT : 1));
  }
  var EARTH_SINGLE_VOID_CHANCE = 0.035;

  /* ---- Layers ---- */
  // Each layer is a depth range with its own background tint and special behavior.
  // Order matters: first match wins.
  // Earth is now 400 rows deep, so the old 200-row progression is doubled
  // to keep upgrade gates, hazards, and ore value spread through the map.
  var LAYERS = [
    { name: 'topsoil',    minDepth: 0,   maxDepth: 30,  bg: '#1a1008', tint: null },
    { name: 'bedrock',    minDepth: 30,  maxDepth: 70,  bg: '#161a1d', tint: null },
    { name: 'permafrost', minDepth: 70,  maxDepth: 130, bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
    { name: 'barrier',    minDepth: 130, maxDepth: 138, bg: '#0a0d12', tint: null,      requiresBomb: true },
    { name: 'fossil',     minDepth: 138, maxDepth: 188, bg: '#1a1612', tint: null },
    { name: 'deepcrust',  minDepth: 188, maxDepth: 248, bg: '#13110e', tint: null },
    { name: 'magma',      minDepth: 248, maxDepth: 318, bg: '#220804', tint: '#ff5a1a', dangerous: true, requiresShield: true },
    { name: 'crystal',    minDepth: 318, maxDepth: 388, bg: '#0e0a1c', tint: '#9fb3ff' },
    { name: 'mantle',     minDepth: 388, maxDepth: 999, bg: '#1a0608', tint: '#ff2030', dangerous: true, requiresShield: true },
  ];

  function getLayerForDepth(depth) {
    for (var i = 0; i < LAYERS.length; i++) {
      if (depth >= LAYERS[i].minDepth && depth < LAYERS[i].maxDepth) return LAYERS[i];
    }
    return LAYERS[LAYERS.length - 1];
  }

