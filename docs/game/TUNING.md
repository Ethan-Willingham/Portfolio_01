# TUNING.md — Sluice visual & performance levers

The complete catalogue of every adjustable visual / quality / performance knob
in the game — what it does, its current value, a sensible range, and how to
change it. This is the reference for tuning fidelity up and cost down.

**Values are as of v14.15.** They drift — if a number here looks wrong, re-grep
the source. Locations are given as **grep targets** (banner comments), never
line numbers (those drift every session).

---

## How to read this doc

Every lever has a **tier** — how you change it today:

| Tier | Meaning |
|---|---|
| **`live`** | Exposed on `window`, read fresh every frame. Change it in the **browser console** and see it instantly — no reload. (`window.smokeTune`, `window.fireplaceTune`.) |
| **`edit`** | A `var` in the source. Change the value, reload the page. |
| **`edit²`** | Like `edit`, but the value is **duplicated in `js/liquid-wgpu.js`** — change BOTH copies or the GPU sim drifts from the CPU reference. |

> **Phase 2 will widen the `live` set.** A planned `window.gm` facade will make most
> `edit` levers console-tunable with their side-effects (cache flush, resize,
> pipeline rebuild) wired in. Until then, `edit` = source change + reload.

**Changing `edit` levers:** edit `js/sluice.js` (or `js/liquid-wgpu.js`),
**bump `GAME_VERSION`** (grep `GAME_VERSION`), reload. The owner playtests the
build, so the version must be visible in the HUD.

**Catalogue size:** ~220 named levers below, plus the `smokeTune` / `fireplaceTune`
/ `rocketTune` objects which expand to **300+ individual fields**.

---

# 1 · SMOKE

The diesel-exhaust + chimney fluid sim (Pavel-Dobryakov solver, now WebGPU).

## 1.1 `smokeTune` — master smoke control · tier `live`

`window.smokeTune` (grep `var smokeTune = {`). Read every frame — tweak in the
console. **This is the main smoke tuning surface.**

### Toggles / mode
| Lever | Now | Range | Effect |
|---|---|---|---|
| `enabled` | `true` | bool | Master smoke on/off |
| `diesel_enabled` | `true` | bool | Miner diesel-exhaust plume on/off |
| `thruster_enabled` | `false` | bool | Jetpack-thruster smoke source on/off |
| `world_lock` | `true` | bool | Smoke field scrolls with the camera (stays attached to the tunnel) vs. screen-locked |

### Diesel emission rate / radius (plume volume)
| Lever | Now | Range | Effect |
|---|---|---|---|
| `diesel_rate_active` | `0.05` | 0–0.2 | Dye injected/frame while drilling |
| `diesel_rate_moving` | `0.085` | 0–0.2 | Dye injected/frame while moving |
| `diesel_rate_idle` | `0` | 0–0.1 | Dye injected/frame while idle |
| `diesel_rad_active` | `0.105` | 0–0.5 | Plume spread while drilling |
| `diesel_rad_moving` | `0.165` | 0–0.5 | Plume spread while moving |
| `diesel_rad_idle` | `0.215` | 0–0.5 | Plume spread while idle |

### Diesel motion / velocity
| Lever | Now | Range | Effect |
|---|---|---|---|
| `diesel_velY_active` | `2.75` | 0–8 | Upward splat velocity while drilling |
| `diesel_velY_idle` | `0.5` | 0–4 | Upward splat velocity while idle |
| `diesel_shed_amp` | `1.31` | 0–4 | Vortex-shedding side-jet amplitude (plume wobble) |
| `diesel_shed_freq` | `10.8` | 0–30 | Vortex-shedding frequency (Hz) |
| `diesel_dir_force` | `1.57` | 0–4 | Horizontal push opposite player facing |
| `diesel_vx_coupling` | `0.0375` | 0–0.2 | How much player vx drags the smoke |
| `diesel_motion_scale` | `0.34` | 0.02–2 | Global multiplier on shed + buoyancy (overall liveliness) |
| `diesel_rise_cap` | `1.36` | 0.1–999 | Cap on upward rise velocity |

### Diesel colour (added to the dye field — keep small or it whites out)
| Lever | Now | Range | Effect |
|---|---|---|---|
| `diesel_color_r` | `0.14` | 0–0.3 | Red component (× rate) |
| `diesel_color_g` | `0.13` | 0–0.3 | Green component |
| `diesel_color_b` | `0.11` | 0–0.3 | Blue component |
| `diesel_color_jitter` | `0` | 0–0.05 | Per-splat random RGB jitter (±) |

### Diesel source / bloom geometry
| Lever | Now | Range | Effect |
|---|---|---|---|
| `diesel_source_lift` | `1.4` | 0–15 | World-px lift of the source splat |
| `diesel_source_radius` | `0.014` | 0.001–0.05 | Radius of the tight mouth splat |
| `diesel_bloom_lift` | `3.6` | 0–15 | World-px lift of the secondary bloom splat |
| `diesel_bloom_radius` | `0.078` | 0.002–0.1 | Bloom splat radius — **big factor in how soft the plume reads** |
| `diesel_bloom_amount` | `0.82` | 0–1.5 | Bloom colour multiplier |

### Wind bias
| Lever | Now | Range | Effect |
|---|---|---|---|
| `wind_x` | `0` | -1–1 | Horizontal wind — **overwritten live by the surface-wind state machine (§1.4)** |
| `wind_y` | `3.35` | 0–8 | Constant vertical updraft bias |

### Pulse modulation
| Lever | Now | Range | Effect |
|---|---|---|---|
| `pulse_rate` | `0` | 0–4 | Emission-rate pulsing frequency, Hz (0 = off) |
| `pulse_depth` | `0` | 0–1 | Pulse modulation depth |

### Buoyancy (wide upward velocity splat)
| Lever | Now | Range | Effect |
|---|---|---|---|
| `buoyancy_strength` | `0.35` | 0–2 | Extra upward push at the exhaust |
| `buoyancy_radius` | `0.1` | 0.02–0.3 | Buoyancy splat radius |

### Sim physics — the solver tunables
These are mirrored into the active backend's config every frame, so they are
the *effective* sim settings on both WebGPU and WebGL.
| Lever | Now | Range | Effect |
|---|---|---|---|
| `sim_time_scale` | `0.22` | 0.02–2 | Sim-step dt multiplier (how fast smoke evolves) |
| `sim_density_dissipation` | `1.5` | 0.1–3 | Dye fade rate — ↑ = thinner, faster-fading smoke |
| `sim_velocity_dissipation` | `0.03` | 0–1 | Velocity-field damping |
| `sim_curl` | `28.5` | 0–50 | **Vorticity confinement — crispness of swirls. ↑ = sharper, more turbulent** |
| `sim_pressure` | `0.24` | 0–0.99 | Pressure-decay coefficient |
| `sim_pressure_iters` | `17` | 1–30 | **Jacobi pressure iterations — bulk of the sim cost.** Perf knob |
| `sim_splat_radius` | `0.255` | 0.05–0.5 | Global splat radius — **↑ = blurrier/softer smoke** |

## 1.2 Smoke resolution / sharpness · tier `edit`

grep `function smokeFluidScaledRes` and `SMOKE_RENDER_SCALE_DESKTOP`. **These
drive how blurry the smoke reads** — see the deblur recipe in §9.
| Lever | Now | Range | Effect / cost |
|---|---|---|---|
| `smokeFluidScaledRes` desktop `sim` | `160` | 96–256 | Desktop velocity/pressure grid. Perf: ~quadratic |
| `smokeFluidScaledRes` desktop `dye` | `shortAxis×0.62`, clamp 384–672 | 384–1024 | **Desktop dye (colour) field — the #2 sharpness lever.** Perf: ~quadratic |
| `smokeFluidScaledRes` mobile `sim` | `96` | 64–160 | Mobile velocity grid |
| `smokeFluidScaledRes` mobile `dye` | `256` | 192–512 | Mobile dye field |
| `SMOKE_RENDER_SCALE_DESKTOP` | `0.6` | 0.5–1.0 | **#1 deblur lever** — smoke canvas renders at this fraction then upscales. Perf: ~quadratic |
| `SMOKE_RENDER_SCALE_MOBILE` | `0.7` | 0.5–1.0 | Same, mobile |
| `SMOKE_FLUID_OVERSCAN` | `0.2` | 0.0–0.6 | Smoke-domain margin beyond viewport. ↑ = smoke persists further off-screen but spreads the dye budget thinner (softer) |
| `smokeFluidObstacleW/H` | desktop `768×576`, mobile `320×240` | — | Obstacle-mask resolution — crispness of smoke-vs-terrain edges. grep `smokeFluidObstacleW` |

## 1.3 `fireplaceTune` — station chimney smoke · tier `live`

`window.fireplaceTune` (grep `var fireplaceTune = {`). Independent source, same
fluid sim. 10 one-click looks via `FIREPLACE_PRESETS` + `applyFireplacePreset(idx)`.
| Lever | Now | Effect |
|---|---|---|
| `enabled` | `true` | Chimney smoke on/off |
| `color_r / _g / _b` | `0.0082 / 0.0078 / 0.0072` | Smoke colour (3 levers) |
| `color_jitter` | `0.0006` | Per-splat RGB jitter |
| `radius` | `0.021` | Main splat radius |
| `velY` | `1.00` | Upward velocity per splat |
| `sway_amp` | `0.18` | Horizontal sway amplitude |
| `sway_freq` | `0.55` | Sway frequency (Hz) |
| `pulse_rate` | `0.9` | Rate-breathing frequency |
| `pulse_depth` | `0.35` | Pulse depth |
| `bloom_enabled` | `true` | Secondary bloom splat on/off |
| `bloom_lift` | `7` | World-px above main splat |
| `bloom_radius` | `0.030` | Bloom splat radius |
| `bloom_amount` | `0.55` | Bloom colour multiplier |
| `bloom_velY` | `0.70` | Bloom upward velocity |
| `buoyancy_enabled` | `true` | Buoyancy splat on/off |
| `buoyancy_strength` | `0.55` | Extra upward push |
| `buoyancy_radius` | `0.060` | Buoyancy splat radius |

## 1.4 Surface wind state machine · tier `edit`

grep `WIND_CALM`. Continuously overwrites `smokeTune.wind_x` — the *real* wind control.
| Lever | Now | Range | Effect |
|---|---|---|---|
| `WIND_CALM` | `0.083` | 0–0.3 | Effective wind_x at the calm tier |
| `WIND_STRONG` | `0.45` | 0–1 | wind_x at the strong tier |
| `WIND_GUST` | `0.95` | 0–2 | wind_x at gust peaks |
| `WIND_VISUAL_MAX` | `0.45` | 0–1 | Windsock/banner full-deflect reference |
| `WIND_SPLAT_VEL` | `1.0` | 0–3 | Velocity of standalone wind splats |
| `WIND_SPLAT_RADIUS` | `0.045` | 0.01–0.2 | Radius of wind splats |
| `WIND_SPLAT_NX` | `9` | 1–20 | Number of wind splats across width |
| `WIND_FALLBACK` | `12` | — | Wind fallback constant |

## 1.5 Backend init configs (mostly dormant)

Both smoke backends carry an init config — `defaultConfig()` in `js/smoke-wgpu.js`,
and the `config` object + the `opts` passed to `SmokeFluid.init()` in
`sluice.js`. **At runtime `smokeFluidEmit()` overwrites the live sim
params from `smokeTune` every frame**, so these only matter pre-first-emit. Tune
via `smokeTune` §1.1, not here. One exception worth knowing: the WebGL `opts`
set `SHADING` (desktop off — the gradient kinks into a visible grid at large
texel size; mobile on). The WebGPU display path runs SHADING-off always.

---

# 2 · WATER

Particle water + oil sim (APIC / MLS-MPM). All `LIQUID_*` constants are in the
`sluice.js` constants block (grep `var LIQUID_CELL`); the algorithm
banner is `LIQUIDS: SURFACE WATER`. Tier `edit` unless marked `edit²`
(**duplicated in `js/liquid-wgpu.js` — change both**).

## 2.1 Grid / particle sizing
| Lever | Now | Range | Effect / cost |
|---|---|---|---|
| `LIQUID_CELL` `edit²` | `2.5` | 1.5–4.0 | Grid cell size (world px). Smaller = finer sim. Perf knob |
| `LIQUID_MAX_PARTICLES` | `120000` | 15k–120k | Hard particle cap (sizes every array). v24.149: 40k→120k for deep lakes at true rest density. Perf knob |
| `LIQUID_PDELTA` `edit²` | `0.5` | 0.4–0.7 | Particle spacing; rest density = 1/PDELTA² |
| `LIQUID_HASH_BITS` | `18` | 16–20 | Hash-grid table size. Perf knob |
| `LIQUID_DENSITY` / `LIQUID_INV_DENSITY` / `LIQUID_MAX_CELLS` | derived | — | Computed — don't set directly |
| `LIQUID_STENCIL_OX/OY` | fixed | — | B-spline stencil — structural, do not tune |

## 2.2 Water physics feel
| Lever | Now | Range | Effect |
|---|---|---|---|
| `LIQUID_PRESSURE_STIFF` `edit²` | `5` | 1.0–6.0 | Incompressibility stiffness — ↑ = springier/bouncier. v24.10 set saharan's exact 5; do NOT re-try 20 (splash chaos) |
| `LIQUID_DAMPING` `edit²` | `0.992` | 0.95–1.0 | Per-step velocity bleed. **LEGACY (RAW=0) path only** — with `LIQUID_RAW`=1 (the default since v24.169) the live damping is `LIQUID_DAMP_LIVE`/`MOTION_LIVE` blended by the calm ramp; this static value is bypassed |
| `LIQUID_WATER_MOTION_SCALE` | `0.97` | 0.8–1.0 | Global scale on water motion (liveliness). LEGACY (RAW=0) path; `MOTION_LIVE` is the live value under RAW |
| `LIQUID_GRAVITY` | `250` | 200–1000 | Downward accel (px/s²). **v24.169: 1000→250** — the old ~4x-saharan gravity was THE POPCORN driver (see §2.10). gm-LIVE |
| `LIQUID_FLOOR_FRICTION` | `0.97` | 0.85–1.0 | Horizontal drag over solid floor, PER SUBSTEP — lower = more drag. v25.44 HONEY FIX: was 0.92, tuned in the single-step era; at 186 substeps/s it compounded to a near-instant stop for floor-adjacent cells, which is why shallow water spread like tar. gm `water.FLOOR_FRICTION` |
| `LIQUID_LIP_FRICTION` `edit²` | `0.999` | 0.9–1.0 | v25.45 — LEDGE-LIP SPILL (the owner's "big blobs hanging at the edge" fix). A floor cell at an OPEN edge (passable horizontal neighbour with no floor under it) uses this nearly-slick friction instead of `LIQUID_FLOOR_FRICTION`, so a body pushed toward a lip pours over instead of damming; only bead-scale water can rest at an edge (the droplet pass renders it as small drops). Walled edges (stone-lined ponds) are NOT lips and keep full grip. Set equal to FLOOR_FRICTION for the old damming. gm `water.LIP_FRICTION` |
| `LIQUID_WALL_FRICTION` | `0.97` | 0.85–1.0 | Vertical drag against a side wall |
| `LIQUID_WALL_BOUNCE_IN` | `0.075` | 0.0–0.4 | Reflection for cells inside solids — lower = wetter |
| `LIQUID_WALL_BOUNCE_EDGE` | `0.095` | 0.0–0.4 | Reflection for cells adjacent to solids |

## 2.3 Oil physics feel (separate fluid)
| Lever | Now | (water counterpart) |
|---|---|---|
| `LIQUID_OIL_PRESSURE_STIFF` | `2.5` | (5) |
| `LIQUID_OIL_DAMPING` | `0.97` | (0.992) — oil more viscous |
| `LIQUID_OIL_GRAVITY` | `600` | (1000) — oil falls slower |
| `LIQUID_OIL_WALL_BOUNCE_IN` | `0.05` | (0.075) |
| `LIQUID_OIL_WALL_BOUNCE_EDGE` | `0.06` | (0.095) |
| `LIQUID_OIL_FLOOR_FRICTION` | `0.89` | (0.92) — oil sticks more |
| `LIQUID_OIL_WALL_FRICTION` | `0.94` | (0.97) |

## 2.4 Aeration / foam (white churn — water set + oil set)
| Lever (water `_` / oil `_OIL_`) | Water | Oil | Effect |
|---|---|---|---|
| `LIQUID_[OIL_]AERATION_THRESHOLD` | `0.55` | `0.5` | Density below which fluid reads aerated |
| `LIQUID_[OIL_]AERATION_COEFF` | `10.0` | `10.0` | How fast churn adds foam |
| `LIQUID_[OIL_]AERATION_BLUR` | `0.01` | `0.008` | Neighbour blend of the foam field |
| `LIQUID_[OIL_]AERATION_DAMP` | `0.988` | `0.988` | Per-step foam decay |

## 2.5 Rendering — colour / size / opacity
Drawn by `drawLiquidsWebGL` (CPU GL) / the WGSL render shader (GPU). All of
these are LIVE since v14.25 — the `water` gm group (L panel) pushes them via
`setRenderParam`, no reload needed. `edit²`.
| Lever | Now | Range | Effect |
|---|---|---|---|
| `LIQUID_DROPLETS` `edit²` | `1` | 0/1 | v25.32 — visible-droplet pass (GPU surface renderer only): every low-neighbour-support water particle draws as a small hard drop (~1.4 world px, size fixed, never density-scaled, so the v24.162 giant-disc bug cannot return), fading out as support rises (nb 8→14) and the merged body field takes over. Fixes "particles render but are invisible" (lone peaks sit under the surface threshold); spray reads as spray. gm `water.DROPLETS`; boot A/B `?wdbg=DROPLETS:0`. The CPU/WebGL fallback already draws all particles |
| `LIQUID_WATER_R / _G / _B` | `0.365 / 0.780 / 0.933` | 0–1 | Water base colour |
| `LIQUID_WATER_FOAM_R / _G / _B` | `1.0 / 1.0 / 1.0` | 0–1 | Foam colour (water lerps base→foam by aeration) |
| `LIQUID_WATER_ALPHA` | `0.70` | 0.4–1.0 | Water particle opacity |
| `LIQUID_OIL_R / _G / _B` | `0.051 / 0.039 / 0.020` | 0–1 | Oil colour (near-black brown) |
| `LIQUID_OIL_ALPHA` | `0.920` | 0.5–1.0 | Oil particle opacity |
| `LIQUID_WATER_PARTICLE_SIZE` | `1.8` | 0.8–3.0 | Water render kernel radius (overdraw cost) |
| `LIQUID_OIL_PARTICLE_SIZE` | `2.5` | 0.8–3.5 | Oil render kernel radius |

**Surface render (v24.113, WebGPU renderer only).** Particles splat into an
offscreen rgba16float density field which is composited through a smoothstep
threshold, so water draws as ONE continuous body with a clean surface line
instead of visible balls. The CPU/WebGL fallback ignores these (always
discs). Live gm levers (`water` group):
| Lever | Now | Range | Effect |
|---|---|---|---|
| `LIQUID_SURFACE_RENDER` | `1` | 0/1 | 1 = field + threshold compositing, 0 = legacy per-particle discs |
| `LIQUID_SURFACE_THRESH` | `0.85` | 0.2–2.5 | Field value where fluid turns visible — ↑ shrinks the body, kills lone droplets |
| `LIQUID_SURFACE_SOFT` | `0.35` | 0.05–1 | Smoothstep half-width (edge anti-aliasing / meniscus softness) |
| `LIQUID_SURFACE_RSCALE` | `1.7` | 1–3 | Splat radius vs the disc size — ↑ merges blobs sooner, rounder surface |

Non-constant render math (tunable but hardcoded in function bodies): the
soft-disc falloff `a = clamp(1 - dot(uv,uv), 0, 1)`; the `0.85` size base
factor; the density-size scale (`≤1.5` clamp); the `1.15`px min point size.

## 2.6 Surface pools
| Lever | Now | Range | Effect |
|---|---|---|---|
| `LIQUID_SURFACE_PARTICLE_MAX` | `16000` | 4k–30k | Cap on surface-origin particles. Perf |
| `LIQUID_SURFACE_WATER_TARGET` | `1800` | 0–16000 | Desired surface water count |
| `LIQUID_SURFACE_OIL_TARGET` | `0` | 0–16000 | Desired surface oil count (oil is underground) |
| `LIQUID_SURFACE_WATER_PARTICLES_PER_TILE` | `400` | 150–1000 | Pond fill density per tile |

## 2.7 Miner interaction
| Lever | Now | Effect |
|---|---|---|
| `LIQUID_PLAYER_EJECT` `edit²` | `720` | Force pushing fluid out of the miner |
| `LIQUID_MINER_HULL_L/T/R/B` `edit²` | `3 / 6 / 20 / 20` | Cab silhouette rect (player-local px) |
| `LIQUID_MINER_TRACK_L/T/R/B` `edit²` | `1.5 / 18 / 20.5 / 25` | Track-bed silhouette rect |
| `LIQUID_MINER_CX / CY` `edit²` | `11 / 15.5` | Eject centre |

## 2.8 Active region / sleep / skip (perf mitigations)
| Lever | Now | Range | Effect |
|---|---|---|---|
| `LIQUID_ACTIVE_MARGIN` | `0.85` | 0.25–1.5 | Freeze margin around camera (screens). Wider = pools settle before you arrive |
| `LIQUID_SLEEP_FRAMES` `edit²` | `45` | 20–120 | Low-motion frames before a particle sleeps (v24.112: was 60) |
| `LIQUID_SLEEP_VSQ` `edit²` | `9.0` | 1–25 | Velocity² below which a particle is "still" (v24.112: was 1.0 — that strict gate + the standing pressure churn meant NOTHING ever slept) |
| `LIQUID_WAKE_CELL_VSQ` `edit²` | `0.002` | 0.0005–0.01 | Cell velocity² that re-wakes a sleeper (v24.112: was 0.0005, a hair-trigger that let ambient ripple re-wake everything) |
| `LIQUID_REST_BRAKE_VSQ` `edit²` | `625` | 100–2500 | v24.112 rest brake: gentle extra damping below this |v|² (25 px/s) |
| `LIQUID_REST_BRAKE` `edit²` | `0.92` | 0.85–0.98 | Gentle brake multiplier per substep |
| `LIQUID_REST_BRAKE_HARD_VSQ` `edit²` | `100` | 25–400 | Hard-brake stage below this |v|² (10 px/s) |
| `LIQUID_REST_BRAKE_HARD` `edit²` | `0.75` | 0.6–0.9 | Hard brake multiplier. CAUTION: 0.55 destabilised the pressure solver (churn went UP); do not crank. Also do NOT remove: an A/B with the brake off plateaued at ~14 px/s with zero sleep even under grid viscosity |
| `LIQUID_GRID_VISC` `edit²` | `0.45` | 0–0.6 | v24.115 — per-substep blend of each massy cell's velocity toward its massy 4-neighbour average (momentum diffusion). THE rest-calm lever: cancels the clamped-EOS limit-cycle standing waves; 0 disables, high = syrupy splashes. Live gm lever |
| `LIQUID_SIM_FORCE_EVERY` | `12` | 6–30 | Heartbeat — force a full sim step every N frames (legacy idle-skip path; the v24.145 freeze supersedes it while `FREEZE`=1) |
| `LIQUID_SIM_PLAYER_VEL_GATE` | `8` | 4–20 | Player speed below which "calm" skip is allowed |
| `LIQUID_FREEZE` | `1` | 0/1 | v24.145 WATER STATE MACHINE master: 1 = whole-body freeze when settled (stepping stops entirely; only a stimulus thaws), 0 = legacy idle-skip heartbeat. gm `water.FREEZE` |
| `LIQUID_FORCE_FREEZE_T` | `2.0` | 0.5–6 | v24.164 THE POPCORN KILLER: seconds of sustained calm (calm==1, no stimulus) before the body freezes REGARDLESS of awake/fast count. A deep lake's clamped-EOS limit cycle (clump→over-compress→pop→wave→repeat) keeps 30k/39k particles fast at rest forever, so the original awake-floor latch never engages; this forces it. Verified: lake reaches `state=frozen`, BURSTS→none. The churn is velocity (vibration in place), not displacement, so the frozen dense lake's positions stay ~uniform = flat still surface |
| `LIQUID_GRID_VISC` `edit²` | `0.7` | 0–0.9 | v24.164: 0.45→0.7. The SETTLED-state viscosity target (lively uses VISC_LIVE 0.10); raised to overdamp the limit cycle during the settle ramp before the force-freeze engages. Velocity smoothing, NOT the rest brake (the 0.55 hard-brake destabilisation doesn't apply) |
| `LIQUID_VISC_LIVE` | `0` | 0–0.6 | Grid viscosity while STIMULATED; blends to `LIQUID_GRID_VISC` as calm ramps. **v25.44 HONEY FIX: 0 = raw (was 0.10, the v24.157 floor — retired, see DAMP_LIVE)**. gm `water.VISC_LIVE` |
| `LIQUID_DAMP_LIVE` | `1.0` | 0.99–1.0 | THE SLOSH KNOB: per-substep damping while LIVELY (blends to `LIQUID_DAMPING` as calm ramps). gm `water.DAMP_LIVE`. **v25.44 HONEY FIX: 1.0 = pure saharan-raw. The v24.157 safety floor (0.9985 + MOTION 0.997 + VISC 0.10, "the lively state must out-dissipate the EOS pump") is RETIRED: the v25.42 SHOCK LIMITER (`LIQUID_PRESSURE_MAX_DV`, §2.10) bounds the pump at the source, and the floor — compounding 1.55x harder per wall second since the v25.29 timescale — kept only ~43%/s of velocity: bomb slosh died in ~1.5 s, every flow oozed like honey. Measured at raw: 3.6-5x bigger splash, living slosh 6+ s, drain 324 vs 209 particles/s, `?pondtest=4` STILL bounded (mean 2.2-3.5, max 27) and rest pop-free (fast avg 1.6). If the limiter is ever disabled, restore the floor before sustained-stim play** |
| `LIQUID_MOTION_LIVE` | `1.0` | — | Full APIC transfer while lively (blends to `LIQUID_WATER_MOTION_SCALE` 0.97 as calm ramps). v25.44: was 0.997 (the floor); 1.0 is safe now — the v24.156 explosion this once fed is killed by the shock limiter. gm `water.MOTION_LIVE` |
| (v24.152 palette) | — | — | Water base DARKENED (0.165/0.42/0.78, alpha 0.82) + foam is LIGHT BLUE (0.62/0.84/0.98), never white: turbulence reads as lighter blue like the reference demo, and the "white areas around particles" cannot exist. `WATER_R/G/B/ALPHA` + `WATER_FOAM_R/G/B` levers; edit² module twins. Orphan-wake bar 8→24 (catches 10-60 particle leftover blobs; puddles hold hundreds) |
| (v24.153 corner/hang pass) | — | — | Foam is SPEED-WEIGHTED in the field splat (aer × clamp((speed-12)/68)): clusters wedged in block corners micro-jitter ~10 px/s and regenerate aeration forever, but can no longer glow — static water is always base colour. Orphan HANG TEST: a sleeping particle with zero particles AND no solid tile in the 16px cell below wakes regardless of neighbour count, so sheets asleep under overhangs peel from their unsupported edges and drain level instead of fossilizing mid-air |
| (v24.156 stray endgame; supersedes the v24.154 attempt) | — | — | v24.154 shrank ALL splats (size 1.15, thresh 0.95) and the lake interior went "static TV" see-through — REVERTED (1.8 / 0.85 / 0.35 restored: the merged body field NEEDS fat overlapping splats). The real fixes: (1) SLEEPER SIZE CLAMP in the splat vs (a sleeping particle's aux density is stale, so a stray that once slept dense rendered fat forever; sleepers clamp to nominal d=1.0), (2) EVAPORATION in the orphan pass: a tiny stranded cluster (<24 in its 3x3 of 16px) that has SETTLED (sleeping = still 45+ frames) is removed — reads as soaking into the ground ~1.25s after landing; real puddles (hundreds) and mid-splash droplets (awake) are untouchable; removals ride REMOVE ops and are counted into the housekeeping seq-skip so they are never a stimulus |
| (v24.158 awake-stray endgame) | — | — | Perf panel on the owner's lake showed 44789 AWAKE / 24 sleeping — the accumulating fat discs + mid-air freezes were AWAKE strays (wedged on terrain, jittering ~4-5 px/s: too fast to ever sleep, too slow to fall), which the v24.156 SLEEP-GATED evaporation never touched. FIX: evaporation decoupled from sleep — any non-frozen particle with <24 neighbours AND speed²<36 (slow) evaporates regardless of sleep state (neighbour+velocity guards keep bodies/streams safe). Plus the splat size curve steepened: sub-rest-density (dn<1) falls off QUADRATICALLY (`0.2+1.3·dn²`) so a half-density stray is ~1.6 px not ~3, while body (dn≥1) stays at the 1.5 cap (no static-TV); pointSize floor 1.15→0.8 |
| `LIQUID_SURFACE_THRESH` `edit²` | `1.8` | 0.5–3 | v24.162 — was 0.85. Metaball visibility threshold: a lone particle splats a field peak of ~1.0, a real body stacks to 10-50, so THRESH−SOFT=1.0 makes SINGLE particles invisible (the proven "giant single particles" fix) while bodies stay fully solid. Keep size at 1.8 (do NOT shrink — that caused the v24.154 static-TV). Live gm lever |
| `LIQUID_SURFACE_SOFT` `edit²` | `0.8` | 0.1–1.5 | v24.162 — was 0.35. Smoothstep half-width; lower edge (THRESH−SOFT) = one-particle peak so singletons fully drop out |
| `water.DBG_PARTICLES` | `0` | 0/1 | v24.161 PARTICLE PROOF overlay (WebGPU render only): draws every particle as its own tiny hard dot (fixed 3.6px device, NO density scaling, NO metaball merge), coloured by a per-index hash, ON TOP of the water. Diagnostic for "is that giant thing one particle or a merged cluster" — a single particle = one lone dot, a cluster = the circle fills with a speckle of many colours. Separate `dbgDotsPipeline` (reuses the render bind group); a build failure leaves it null and never touches the live render. Toggle in the L panel water group |
| `LIQUID_CALM_RAMP` | `1.2` | 0.2–4 | Seconds for calm 0→1 (brake + viscosity fade-in) once quiet. gm `water.CALM_RAMP` |
| `LIQUID_CALM_MAX` | `0` | 0–1 | v25.39 — REST LIVELINESS CAP: the calm ramp parks here instead of 1.0. **v25.41 — DEFAULT 0 (the owner: water must never brake/settle/freeze on screen): with the popcorn fixed at the physics root (`LIQUID_PRESSURE_MAX_DV`, §2.10), the whole brake/settle/freeze machinery is dormant — water is pure fluid at all times on screen and is QUIETER at rest (fast 0, mean 1.5 px/s) than the machinery ever made it. Per-particle off-screen freezing (camera-distance) is untouched.** Raise toward 0.5 for the mid-settle brake shimmer, 1 = the old full grind + freeze latch. gm `water.CALM_MAX` (live) |
| `LIQUID_STIM_HOLD` | `1.0` | 0.2–4 | Seconds of quiet before calm starts rising. gm `water.STIM_HOLD` |
| `LIQUID_STIM_MAX` | `6.0` | 2–15 | Hard cap: settle regardless of the fast-water hold (convergence guarantee). gm `water.STIM_MAX` |
| `LIQUID_FAST_VSQ` | `576` | — | "Still really flowing" metric (24 px/s squared): fast-count above ~0.4% of particles holds the body lively so flows are never braked mid-stream |
| (v24.150 wave/blob pass) | — | — | While LIVELY (calm < 0.5): sleep never latches + the wake bar drops ~8x, so swells recruit the whole body (big demo waves); ORPHAN WAKE (every ~30 frames, 070) wakes sleepers with <8 neighbours in a 3x3 of 16px cells so droplets can't freeze mid-air as water drains; composite foam is body-gated (smoothstep t..2.2t on the field) so spray/strays render water-blue, not white-rimmed |
| `WATER_RIG_DRAG` | `2.2` | 0–6 | v24.148 rig water medium: exponential velocity drag at full submersion (deep lakes). gm `water.RIG_DRAG` |
| `WATER_RIG_BUOY` | `0.55` | 0–0.95 | Fraction of gravity cancelled while submerged (rig sinks slowly, never floats). gm `water.RIG_BUOY` |
| `WATER_RIG_SINK_VMAX` | `95` | 40–250 | Terminal sink speed at deep coverage (under the 340 px/s fall-damage floor). gm `water.RIG_SINK_VMAX` |

**v25.x LOW-END LAKE SIZING (free-forever relaunch, Phase C):** the carve loop in
030 was shrunk so the one streamed-live lake is light enough for low-end GPUs. The
WATER SIM IS UNTOUCHED and density stays FULL (655/tile, owner-locked); only the
geometry levers changed: width 9-14 -> **6-9**, depth 5-8 -> **3-4**, area clamp
100 -> **24 tiles** (so one live lake is ~15.7k particles, ~4x lighter than the old
~65k), and the inter-lake gap 96-150 -> **130-210** (fewer lakes, still > the
~81-tile active region so only one ever streams in at once). To go back to big
lakes, restore those four numbers. The geometry note below is the original design.

**v24.148-149 LAKE GEOMETRY (the fundamental fix):** surface ponds became
DEEP NARROW LAKES (9-14 wide x 5-8 deep, carve loop in 030; `pond.d`;
budget clamp area <= 100 tiles; `LIQUID_MAX_PARTICLES` 40k -> 120k;
`LIQUID_SURFACE_WATER_PARTICLES_PER_TILE` 400 -> 655 = TRUE rest density,
so the fill reaches the brim — 400 was 61% and parked the waterline ~2.5
tiles low on deep lakes). Owner-diagnosed
via saharan's reference demo (the codebase the solver is ported from): at
1 tile deep, every surface particle is also a floor-contact particle, so
boundary noise IS the surface ("too shakey") and nothing can absorb a
disturbance; 5-8 tiles of bulk under the surface line is what makes the
reference tank read calm. Depth-aware sites if you change geometry again:
fillSurfacePond + surfacePondNeed (070), BOTH region-extension copies
(getView 020 + liquidUpdateActiveRegion 070 — cutting a body vertically =
the v24.118 vacuum-wave bug), liquidWakeForDig lake expansion (030), probe
floor band + pondtest=3 breach (070), save round-trip of `d` (047).

Measured (`?pondtest=1` probe): a settled pond's standing churn is the
clamped-EOS limit cycle (gravity compresses, pressure over-corrects, the
p>=0 clamp removes the restoring half-cycle). v24.112 brake: 26→15 px/s
mean. v24.115 grid viscosity 0.45 + brake: 5–9 px/s mean, spikes 330→~80,
~half the pond under 3 px/s, partial sleep. NOT YET 100% sleep (the wake
gate still flaps near the threshold) — the idle-skip perf prize stays open.
ALSO v24.115: the sim REGION may never cut a filled pond (it is extended to
cover any filled pond it overlaps, getView in 020 + the CPU classifier in
070). Before that, a pond wider than the zoomed-in region (~38 tiles) had
both region edges INSIDE the water; beyond them particles do not splat
mass, so the live water saw vacuum at both cut lines and waves poured in
from both sides forever — the owner's "waves from both sides / pop rocks".
Dev: `?pondtest=1` spawns the rig at the nearest pond and logs a `POND:`
stat line (count/awake/sleeping/frozen/seq/ops + density bands + speed
mean/max/under-3) every ~5 s. `?pondtest=2` floats the rig mid-pond.
`?pondtest=3` (v24.143) = shore spawn + a timed BREACH at t=20 s (digs the
pond's right wall open into a 3x4 pit through the real dig path) — the
dig→drain→flow→re-settle gameplay loop, measured via the probe's
`PIT n=… pond=…` split. v24.145 STATE MACHINE (liquidStateTick, 070): the
brake/viscosity rest machinery is now gated by a calm ramp (stimulated =
no brake + `VISC_LIVE`; settling = the proven v24.112/115 grind; settled =
whole-body FREEZE where stepping stops entirely and only a stimulus thaws).
Probe carries `state=… calm=… fast=…`; the v24.143 baseline measured the
old always-on machinery freezing a breached pond mid-drain at ~1% drained
with wake-burst storms — keep that run in mind before re-tightening.

## 2.9 WebGPU water module · `js/liquid-wgpu.js` · tier `edit`
| Lever | Now | Effect |
|---|---|---|
| `LIQUID_SPARSE` | `1` | **v15.0 sparse active-block grid** (gm `water.SPARSE`, boot `?wdbg=SPARSE:0`). 1 = every cell-space pass runs indirect over the GPU-built 16×16-cell active-block list, so grid cost scales with WET AREA, not bbox (2^21-cell bbox measured 4.3ms vs 7.8ms dense on M-series; the gap is what rescues Mali). 0 = the legacy dense full-bbox chain (A/B baseline; also the automatic fallback on devices under 10 storage buffers/stage). Physics is bit-identical — the boot Stage 2-6 self-tests diff the sparse chain against the CPU references every boot |
| `LIQUID_SPARSE_MIN_CELLS` | `32768` | Hybrid gate (`setSimParam('SPARSE_MIN_CELLS')`): below this many bbox cells the dense chain is cheaper than the sparse bookkeeping (~0.35ms/frame fixed), so tight ponds keep the zero-overhead path; enter sparse at ≥ MIN, drop back under MIN/2 (hysteresis so a hovering bbox can't flap). 0 = always sparse. `LiquidWGPU.last.activeBlocks` + `LiquidWGPU.last.bench(120)` are the console probes |
| `GRID_MARGIN` | `16` | Cell-padding halo on the sim grid bbox. Perf (minor) |
| `LIQUID_READBACK_EVERY` | `20` | GPU→CPU readback cadence. Lower = fresher mirror but breaks pipelining. Perf |
| `LIQUID_COLLIDE_RADIUS` | `≈1.06` | Particle terrain-collision probe radius |
| `LIQUID_BOUNCE_WATER` | `0.18` | Water restitution vs terrain tiles |
| `LIQUID_BOUNCE_OIL` | `0.05` | Oil restitution vs terrain tiles |
| `LIQUID_RENDER_SIZE_BASE` | `2.125` | GPU render point-diameter base |
| `GRID_MAX_CELLS` | `1<<21` | Hard cap on GPU grid cells (~25MB buffers). Perf |
| `TERRAIN_MAX_TILES` / `TERRAIN_HALO` | `1<<18` / `1` | Collision-bitmask region cap + halo. Perf |
| `WG` / `SCAN_BLOCKS` / `FIXED_SCALE` / `GS_MAX_*` | — | Workgroup size, prefix-sum, fixed-point scale, wake caps — **structural, do not tune casually** |

Hardcoded force literals (in `updateGrid` — adjustable but require editing
function bodies): rocket push `560×intensity`, explosion blast `1050`/`660`,
explosion uplift `90×k`.

**v24.111-113 architecture notes (not levers, but read before touching):**
the CPU mirror can no longer overwrite live GPU water — game mutations reach
the resident buffers as a replayed op stream (`liquidOps` in 020-state +
the Stage 8b kernel; CONTRACT: anything that bumps `liquidMutationSeq` must
also log an op). Stage 8 go-live now WAITS on the Stage 6 self-test's async
continuation (`stage6Done`) because that continuation re-seeds the live
buffers; flipping live first left a permanently frozen slice of the first
pond on every boot. The live upload path strips the CPU-era frozen bit
(`uploadParticles(instance, true)`); under the GPU the region box culls
off-screen water instead.

**v15.0 sparse-grid contract (read before touching any grid kernel):** the
sparse chain has NO full-grid clears — it relies on a global-zero invariant
(every cell buffer is zero outside the running sub-step). That only holds
because every grid-buffer WRITE provably lands inside a marked block: the
count kernel marks ±2 cells around the `x * invCell` stencil base (the same
float math P2G/pressure/G2P use — `flatCell`'s `x / CELL` floor can differ
by one, which was a real shipped bug), the declump move is capped at one
cell per sub-step, and out-of-grid strays skip their scatters entirely (the
kernel-side stray guards). If you add a kernel that writes any cell buffer,
it must either dispatch over the active-block list or its writes must stay
inside the marking window — otherwise dirt persists forever and reads as
ghost mass. Clears: `clearPrev` at the head of sub-steps 2..N (same frame,
same grid mapping) + `runSparseEndClear` once per frame, and
`denseClearAll` (plain `clearBuffer`s) on every full upload / lever flip.
Dawn validates buffer usage per compute pass, so the GPU-written dispatch
args live in `blockMeta` (storage) and are copied 16 bytes into
`blockDispatch` (INDIRECT-only, never bound as storage) between passes.

## 2.10 Stability — the giant-particle / runaway fix (v24.169-186) ✅ SOLVED

The months-long water saga ("popcorn", "infinite energetic mass", "giant
particles that never shrink and bounce off the ground forever") all traced to
ONE root: the clamped weakly-compressible EOS (`pressure = max(0, (density/rest
- 1)·stiff)`) is a limit-cycle oscillator far from rest — it only pushes when
OVER-packed, never pulls when under-packed. Under hard stress (jetting water at
terrain, deep hydrostatic columns) particles collapse into over-dense knots the
EOS turns into a self-sustaining bounce engine. **Velocity damping / viscosity
only MASK this** (slow the symptom, never remove the source). This layered fix
removes the source. Do NOT reach for more damping to fix a runaway — that path
was exhausted across ~15 versions.

| Lever | Now | Effect |
|---|---|---|
| `LIQUID_RAW` | `0` | v24.169 — run saharan's model: the RAW branch at the top of `liquidStateTick` forces damp/motion=1, visc=0, no sleep/freeze/brake, calm pinned 0. **v25.32 — DEFAULT OFF (the owner's shallow-popcorn call): raw's permanent limit-cycle simmer + periodic 30-100 px/s bursts read as endless boil on 1-2 tile water ("when only 1 tile deep, it should be calm"). The v24.145 state machine (live -> settling -> settled) is back: lively water keeps near-raw feel (DAMP_LIVE/MOTION_LIVE/VISC_LIVE floors), quiet water grinds still (measured: 1-tile pond settles ~13 s from boot to mean 1.2-2.2 px/s and holds; a bombed pond returns to settled ~10 s after the last blast; pondtest=4 permanent stim stays bounded 60 s at 120 fps; the drain leg never congeals mid-flow). Rare brief wake-blips (~3 per 47 s, snuffed <2.5 s by the settled brake) remain — the freeze latch (awake ≤2%) is unreachable at ~8-11k awake, so full whole-body freeze never engages; relax the converged latch if the blips still read as pops. Raw remains one flip away: gm water.RAW / ?wdbg=RAW:1 (the lever setter now also clears the kernel no-sleep bit on a live 1->0 flip). v25.39: the owner then vetoed the fully-settled look too — the calm ramp now parks at `LIQUID_CALM_MAX` (0.5, §2.8), so rest = the mid-settle shimmer and the freeze latch is structurally disarmed unless CALM_MAX is dialed back to 1** |
| `LIQUID_SUBSTEP_DT` `edit²` | `1/120` | v24.169 — was 1/240. Matched to saharan's cadence; 1/240 corrected pressure 2x as often against an over-strong gravity = the over-correction limit cycle |
| `LIQUID_GRAVITY` | `250` | v24.169 — was 1000 (~4x saharan). THE POPCORN FIX (with SUBSTEP_DT). gm-LIVE |
| `LIQUID_TIMESCALE` `edit²` | `1.55` | v25.29 — THE SLO-MO FIX. The gravity drop above made water fall at well under half the world's GRAVITY (600), so the whole sim read as slow motion. Do NOT raise gravity back (re-enters the over-driven EOS regime); this banks dt×TIMESCALE into the fixed-quantum accumulator instead, so more 1/120 substeps run per wall second while per-substep physics stay bit-identical (the same trajectory fast-forwarded = the calm survives by construction). Wall-clock effective gravity = TIMESCALE²·250 = 600.6 ≈ world GRAVITY; splash heights unchanged, everything ~1.55x snappier (headless drain harness measured ~1.7x to the same drained state). Cost: awake water runs ~3 substeps per 60 Hz frame instead of 2; MAX_SUBSTEPS still caps slow frames so weak devices self-throttle toward 1x speed rather than paying more (verified: pondtest=4 all-awake permanent stim holds 120 fps, bounded, 60 s). gm `water.TIMESCALE` (live, resets the bank); boot A/B `?wdbg=TIMESCALE:1` = the old slo-mo |
| `LIQUID_DENS_CAP` `edit²` | `6·LIQUID_DENSITY` (=24) | **v24.182** — clamp the density the pressure pass sees. A jet-formed knot blew to ~100x rest (dn 406 on the owner's overlay), which the EOS turned into a ~2000 impulse = the bounce engine. Normal water never exceeds ~4x, so the cap is invisible to real water but bounds the knot. Lockstep all 4 density-gather sites (CPU 070, WGSL pressure, both `fr()` refs) |
| `LIQUID_DECLUMP_ON` | `1` | **v24.185 — ANTI-CLUMP min-separation, the keystone.** The cap bounds the impulse; this stops the over-packing from PERSISTING. A per-substep PBD/FleX positional pass (`WGSL_DECLUMP`, run after buildGrid) gated to over-dense particles only (`LIQUID_DECLUMP_OVERDENSE` 1.6·rest = 6.4), pushing any neighbour closer than `LIQUID_DECLUMP_DMIN` (1.1px ≈ rest spacing) apart by `LIQUID_DECLUMP_STRENGTH` (0.4/substep). Dormant on a calm pond (floor ~6.2 < trigger). gm `water.DECLUMP` (1/0). GPU-only; CPU fallback keeps old behaviour |
| (v24.186 terrain clamp) | — | The declump push is clamped per-axis at the LEADING EDGE against the same terrain mask the collide kernel uses (`paramsBuf` already carries the terrain rect; `terrainMask` = declump binding 7), so a wall-packed knot spreads ALONG/away from the wall but never bleeds INTO solid dirt. RULE: any positional pass that moves particles MUST be terrain-aware (neighbour-only repulsion against a wall always points into it) |
| `LIQUID_MAX_VEL` | `600` | v24.173 — hard per-particle speed cap / CFL backstop (0 = off). gm `water.MAX_VEL` |
| `LIQUID_PRESSURE_MAX_DV` `edit²` | `10` | **v25.41 — THE SHALLOW-POPCORN ROOT FIX.** The pressure scatter is a per-step (dt=1) impulse, so ONE substep can kick a grid cell 50-200 px/s off a single-frame density blip (grid aliasing) — that one-substep spike IS the at-rest pop on 1-tile water. This caps the per-substep velocity change a cell may receive from pressure (px/s). Rest corrections (~2 px/s vs gravity) never touch it; sustained splash gradients re-earn the cap every substep (10 x 120+/s of correction), so geysers survive. Unconditionally stabilizing (only removes energy). Measured at rest with the calm machinery fully OFF: fast count 0 (old physics: 3-56 popping constantly), mean 1.5 px/s, bombs/drains/permanent-stim all intact at 120 fps. Raise toward 20-40 for wilder blast ejecta; 0 = the old unbounded impulse. gm `water.PRESSURE_MAX_DV` |
| `LIQUID_AIR_DRAG` `edit²` | `0.993` | v25.41 — per-substep velocity keep-factor for SEPARATED water (densityRatio < 0.55, full by 0.35): droplets decelerate in air instead of flying ballistic (the sim had zero air resistance). 1 = off. gm `water.AIR_DRAG` |
| `LIQUID_COHESION` `edit²` | `0` | v25.41 — detachment surface tension, **EXPERIMENTAL, KEEP 0**: both a flat negative-pressure floor and a dn<0.7-gated pull were measured EXPLOSIVE (the skin is permanently under-dense; any sustained attraction there pumps the surface limit cycle to the 600 px/s cap in seconds). The gated code remains for supervised A/B. gm `water.COHESION` |
| `LIQUID_BURST_DAMP` | `0.985` | v24.173 — speed-gated damping: bleeds energy ONLY from FAST water (gate `LIQUID_BURST_GATE_LO/HI` 100→300 px/s), resting water untouched. A SAFEGUARD, not the fix |
| `LIQUID_RAW_VISC` | `0` | v24.183 — optional grid viscosity in the RAW branch. **Leave at 0: >~0.2 destabilizes (dn goes negative). Anti-clump is the fix, not viscosity** |

**The keystones are `DENS_CAP` + `DECLUMP` (+ the v24.186 terrain clamp).** RAW /
SUBSTEP / GRAVITY set the calm liveliness baseline; MAX_VEL / BURST_DAMP are
bounded safeguards. The harness CANNOT reproduce the dug-cavern runaway (every
pond is a dense body below the 6.4 declump trigger), so efficacy is owner-
verified via the dev `X` water overlay (the `dn MAX` and `v: mean` lines). To
A/B the fix live: `water.DECLUMP` 1/0, or boot `?wdbg=DECLUMP:0`.

---

# 3 · RESOLUTION · tier `edit`

The 8 documented levers live in the `Resolution config` block (grep
`/* ---- Resolution config`). The pipeline: `nativeDPR` → capped by
`RES_PIXEL_BUDGET` → ×`RENDER_SCALE_*` = `dpr` → backing-store size.

| Lever | Now | Range | Effect / cost |
|---|---|---|---|
| `RES_PIXEL_BUDGET` | `3,000,000` | 1.0M–6M | Hard cap on main-canvas pixels/frame. ↑ = globally sharper. Perf: proportional |
| `RENDER_SCALE_DESKTOP` | `1.0` | 0.75–1.25 | Global dpr multiplier, desktop. <1 softens the whole frame. Perf: ~quadratic |
| `RENDER_SCALE_MOBILE` | `0.55` | 0.4–0.85 | Same, mobile (deliberately aggressive) |
| `TERRAIN_RES_FACTOR` | `0.62` | 0.5–1.0 | Terrain chunk bitmaps bake at this fraction of `ws`. Softens **blocks only**. (v13.18 tried 1.0 → −19fps; reverted) |
| `TERRAIN_CHUNK_RENDER_SCALE_MIN` | `1.5` | 1.0–2.0 | Floor on auto chunk scale |
| `TERRAIN_CHUNK_RENDER_SCALE_MAX` | `3` | 2–4 | Ceiling — caps how sharp zoomed-in terrain gets |
| `SMOKE_RENDER_SCALE_DESKTOP` | `0.6` | 0.4–1.0 | Smoke canvas fraction (see §1.2) |
| `SMOKE_RENDER_SCALE_MOBILE` | `0.7` | 0.4–1.0 | Same, mobile |

**5 more resolution levers outside that block:**
| Lever | Where | Now | Range | Effect |
|---|---|---|---|---|
| `SKY_GL_RES_SCALE` | `RENDER: Night sky` | `0.5` | 0.25–1.0 | WebGL atmosphere renders at this fraction then upscales. Perf: ~quadratic |
| `PRIMARY_STEPS` | sky fragment shader | `24` | 12–48 | Atmospheric raymarch primary steps. Perf |
| `LIGHT_STEPS` | sky fragment shader | `4` | 2–8 | Light-march steps per primary step. Perf |
| `nightSkyPixUnit()` floor | `RENDER: Night sky` | `2` | 1–4 | Min world-px size of stars (chunkier pixel-art sky) |
| `TERRAIN_CHUNK_TILES` | Game State | `4` | 3–8 | Tiles per terrain cache chunk (rebuild granularity) |

---

# 4 · TERRAIN · tier `edit`

| Lever | Where | Now | Effect |
|---|---|---|---|
| `TILE_MATERIALS` | `RENDER: Terrain materials` | palette table | **Master palette** — all dirt/stone/ore colour ramps |
| `USE_TILE_ATLAS` | `TILE DETAIL ATLAS` | `false` | Pre-render tile clod detail to an atlas vs live. Perf |
| `TILE_ATLAS_VARIANTS` | `TILE DETAIL ATLAS` | `16` | Distinct tile-detail variants (atlas on) |
| `TILE_ATLAS_SCALE` | `TILE DETAIL ATLAS` | `2` | Atlas supersampling. Perf |
| `USE_EARLY_ORE_ATLAS` | `TILE DETAIL ATLAS` | `true` | Pre-render early ore tiles to an atlas. Perf |
| `EARLY_ORE_ATLAS_VARIANTS` | `TILE DETAIL ATLAS` | `96` | Ore-tile variant count |
| `EARLY_ORE_ATLAS_SCALE` | `TILE DETAIL ATLAS` | `2` | Ore atlas supersampling. Perf |
| `TERRAIN_CHUNK_CACHE_LIMIT` | Game State | `180` | Max cached chunk bitmaps (LRU). Perf/memory |
| `TERRAIN_CHUNK_REBUILDS_PER_FRAME` | Game State | `1` | Chunk rebuilds/frame (smoothness vs pop-in). Perf |
| `TERRAIN_CHUNK_PAD` | Game State | `10` | Chunk bitmap bleed padding (seam prevention) |
| `BIOME_WALL_TILE_PX` | `Underground biome wall patterns` | `64` | Wall pattern source-canvas size (world px) |
| `BIOME_WALL_PARALLAX_X` | `Underground biome wall patterns` | `0.55` | Wall slides at 55% camera-X speed |
| `BIOME_WALL_PARALLAX_Y` | `Underground biome wall patterns` | `0.70` | Wall slides at 70% camera-Y speed |
| Wall speck counts | `buildSubtleWallPattern` | ~15 mortar + ~6 accent | Wall-noise speck density per biome |

---

# 5 · BACKGROUND · tier `edit`

## 5.1 Night sky · grep `RENDER: Night sky`
| Lever | Now | Effect |
|---|---|---|
| `NIGHT_SKY.intensity` (gm `sky.NIGHT_DIM`) | `0.6` | **Master dimmer** over the whole baked star+nebula layer AND the twinklers (0–1, 1 = pre-v25.34 strong look). The one knob to chill the night sky |
| `NIGHT_SKY.twinkle` (gm `sky.TWINKLE`) | `0.30` | Twinkle pulse DEPTH (was 0.45); lower = gentler breath, less eye-catching motion |
| Star tier 1 density | `(cols*rows)/28 ×0.30` | Dim background star count |
| Star tier 2 density | `(cols*rows)/220` | Medium star count |
| Star tier 3 density | `max(8,(cols*rows)/1800)` | Bright large-core star count |
| Twinkler count `n` | `50` | Animated twinkling stars/frame. Perf |
| Twinkler rate | `0.4–1.8 Hz` | Twinkle pulse frequency range |
| Twinkler baseA | `0.40–0.85` | Twinkler base-alpha range (before the master dimmer) |
| Nebula band density | formula | Faint nebula pixel-scatter density |
| Nebula band geometry | cx0.55w cy0.34h len1.05w thk0.18h ang-0.22 | Nebula position/size/tilt |
| 4×4 Bayer dither LUT | `nightSkyDitherLUT` | Sky-gradient banding hardness |

## 5.2 Mountains · grep `RENDER: Parallax mountain layers`
| Lever | Now | Effect |
|---|---|---|
| Layer count | `3` (FAR/MID/NEAR) | Number of parallax mountain layers |
| FAR layer config | parallax0.78 step96 h50-95 aerial0.55 | Far ridge silhouette/density/depth |
| MID layer config | parallax0.50 step150 h80-130 snow95 lights | Main ridge + snow + outpost lights |
| NEAR layer config | parallax0.22 step105 h48-80 snow65 rim1 | Nearest dark ridge + rim |
| Per-peak tilt | `±0.7` | Fault-block tilt amount |
| Sub-peak variance | `0.60–0.92` | Twin-peak vs shoulder variation |
| `MTN_CACHE_MARGIN` | `4` | Peaks cached each side of viewport. Perf |
| `MTN_TIME_BUCKETS` | `600` | Day/night quantization — strip-rebuild frequency. Perf |

## 5.3 Sky / atmosphere / day-night · grep `SUN`, `DAY_CYCLE_SECONDS`
| Lever | Now | Range | Effect |
|---|---|---|---|
| `DAY_CYCLE_SECONDS` | `480` | 120–900 | Full day/night cycle length (8 min) |
| `timeOfDay` start | `0.75 − 60/cycle` | 0–1 | Initial time of day (~60s before dusk) |
| `SUN.fovY_deg` | `88` | 60–110 | Sky-shader vertical FOV |
| `SUN.pitch_deg` | `16` | 0–40 | Camera pitch into the sky dome |
| `SUN.altitude_deg` | `48` | 20–80 | Sun-arc max altitude |
| `SUN.azimuth_deg` | `46` | 0–90 | Sun-arc azimuth swing |
| `SUN.intensity` | `26.5` | 10–40 | Sun brightness in the scattering math |
| `SUN.discSize` | `0.05` | 0.02–0.12 | Sun disc angular size |
| `SUN.mieG` | `0.758` | 0.6–0.9 | Mie phase asymmetry (corona tightness) |
| `SUN.paused` | `false` | bool | Freeze the day/night cycle |
| `SKY_BIOME_SURFACE_CEIL_ALT` | `1000` | 500–2000 | Altitude where surface→space sky blend starts |
| `SKY_BIOME_SPACE_FLOOR_ALT` | `3800` | 2500–6000 | Altitude fully into the deep-space palette |
| `SKY` palette | hex block | — | **Master palette** — sky stops, star tiers, nebula |
| `BG` palette | hex block | — | **Master palette** — mountain fills/rims/snow, biome bg + wall |
| `moonPhase` step | `1/8 per day` | — | Moon-phase progression |

## 5.4 Weather — clouds / precip / storms · grep `weatherTune` · tier `live` (the `weather` gm group)
Clouds + rain/snow + lightning (`js/sluice/155-weather.js`). A mood machine drives the SIM (coverage / precip / wind); these are the LOOK levers. Dev **N** force-cycles the mood; `PERF_DISABLE_WEATHER` / PERF ISO "no weather" / `weather.enabled` gate it. See BACKGROUND_STYLE §15. The cloud bake itself (`CLOUD_TW/TH/OCT`, the `CLOUD_LAYERS` table) is an `edit`-tier code change in 155, not a live lever. Boot lever: `?wmood=N` (0 clear … 5 storm) locks the mood from the first frame with values snapped — the weather twin of `?wdbg=`, for screenshot harnesses.

**One-click presets (L panel).** The `L` panel's PRESETS section has two weather button groups (defined in `380-gm-presets-boot.js`): **`weather`** flips the sky TYPE (clear / fair / cloudy / overcast / rainfall / snowfall / thunderstorm / blizzard / dynamic) by setting `weather.MOOD` (+ precip), leaving the look dials alone; **`clouds`** are full cloud-LOOK swaps (puffy cumulus, wispy cirrus, dramatic sunset, moody overcast, soft & dreamy, fast front, golden hour, plus `cloud defaults` to reset). Pick a TYPE for cover, then a LOOK, then fine-tune the dials. All also reachable from the console via `gm.preset('name')` / `gm.presetList('weather'|'clouds')`.
| Lever | Now | Range | Effect |
|---|---|---|---|
| `weather.enabled` | `1` | 0/1 | Master on/off |
| `weather.MOOD` | `-1` | -1..5 | -1 auto; 0–5 lock clear/fair/cloudy/overcast/precip/storm |
| `weather.driftScale` | `1` | 0–4 | surfaceWind → cloud-drift multiplier |
| `weather.baseDrift` | `6` | 0–40 | px/s gentle cloud drift in dead calm |
| `weather.layerAlpha` | `1` | 0–1.5 | Global cloud opacity |
| `weather.highlight` | `1` | 0–2 | Sunlit cloud-face brightness |
| `weather.shadow` | `1` | 0–2 | Cloud-base brightness (lower = moodier) |
| `weather.contrast` | `1` | 0.2–2.5 | Cloud internal contrast |
| `weather.rimGlow` | `1` | 0–3 | Silver-lining edge brightness |
| `weather.softness` | `1` | 0.2–3 | Coverage-edge feather (puff hardness) |
| `weather.morphSpeed` | `0` | 0–1 | Cloud shape-morph rate (0 = drift only) |
| `weather.cloudTop` | `0.0` | -0.3–0.6 | Cloud band top, fraction of screen height (FIXED screen pos) |
| `weather.cloudHeight` | `0.5` | 0.2–1.5 | Cloud band height, fraction of screen height. Default <= the ~0.55 surface horizon so the band sits above it and the sky clip never bites during flight. Constant by design so flying never rescales clouds (screen-pinned, not horizon-sized) |
| `weather.precipRate` | `1` | 0–3 | Precip particle-count multiplier |
| `weather.precipSpeed` | `1` | 0.2–3 | Precip fall-speed multiplier |
| `weather.precipMode` | `0` | 0/1/2 | 0 auto (snow in cold spawn biome) / 1 rain / 2 snow |
| `weather.lightning` | `1` | 0/1 | Storms throw full-screen lightning flashes |

## 5.5 Horizon atmosphere — haze veil + horizon limb · grep `HORIZON LIMB` · tier `live` (the `haze` gm group)
The ascent horizon treatment (`js/sluice/158-horizon-atmos.js`, BACKGROUND_STYLE §16). Two systems share the `haze` gm group: the original aerial-perspective **veil** (`haze.*`, parked OFF since v24.53 — it fogged the whole visible ground) and the **horizon limb** (`limb.*`, ON since v24.132) — it recomposites the below-line slice of the already-rendered sky over the ground as the player climbs, so the land edge dissolves into the lit atmospheric limb instead of hard-cutting at the sunset glow. Limb alpha at the surface line is always 1.0 by design (the ascent ease comes from the band height growing); thinning it re-exposes the hard edge as a ghost seam. The sky's own horizon razor (the SECOND line, revealed on climb) is fixed in the shader itself — spherical primary ray, `planetRadius` const in 150 (v24.138) — not by a screen-space layer. Boot levers for screenshot harnesses: `?tod=0.755` boots the clock at that time of day and freezes the sun (`SUN.paused`); `?alt=N` boots the rig N world px above the surface, falling free. Pair with `?nosave=1`.
| Lever | Now | Range | Effect |
|---|---|---|---|
| `limb.enabled` | `1` | 0/1 | Master on/off for the limb composite |
| `limb.startPad` | `0.03` | -0.2–0.4 | Activation pad below the resting framing (frac of screen h) |
| `limb.fullAt` | `0.85` | 0.5–1.05 | Surface-line screen fraction where the band reaches full height |
| `limb.band` | `0.13` | 0–0.35 | Max band height (frac of screen h) |
| `limb.shapePos` | `0.42` | 0.05–0.95 | Downward-fade mid-stop position within the band |
| `limb.shapeA` | `0.42` | 0–1 | Limb alpha remaining at the mid-stop (falloff shape) |
| `haze.enabled` | `0` | 0/1 | The parked v24.45 whole-ground veil (kept for preview/A-B only) |

## 5.6 Surface trees · grep `SURFACE TREES` · tier `live` (the `trees` gm group)
Pixel-art flora across the whole wide surface (`js/sluice/165-render-trees.js`, v24.133): spruce/birch/bush groves in the towns, scorched snags in the No Man's Zones, nothing on oceans, ponds, or station compounds. DERIVED from the world grid, never saved: a tree stands where its ground tile at `(SKY_ROWS, c)` is still solid, so felling one (dig that tile out: tip-over, then a leaf + chip burst at ~77 degrees) persists through save/load for free. Sprites are baked once at world-px (BLD wood + the mandatory outline ring + 3 locked flora greens `#2e4420`/`#4a6631`/`#8f9c52` + birch bark `#d4c89f`; keep canopy greens under the grass speck `#9bb963`). Rig gusts are SPEED-GATED (an idle hover does nothing, the same discipline as the water player-coupling); the jet downwash shivers canopies it hovers over; a sonic boom whips every visible tree. Spruce/birch canopies hold perched birds that launch into the 205-birds boids (ambient timer, hard gust passes, and falls). Headless work: `?treeshot=COL` parks the rig at a surface column, `?treefell=COL` fells the nearest tree through the real dig path 1s in, the `[trees]` dev boot probe logs counts + the densest grove column, and `window.__trees` exposes rebuild/count/info/shoot. Pair with `?nopause=1` (020): it disables the focus auto-pause + boot pause, which otherwise freeze any headless/unfocused run a moment after boot. Gotcha: headless Chrome `--screenshot` of sluice.html directly captures a blank canvas; screenshot a same-origin wrapper page that iframes the game instead.

| Lever | Now | Range | Effect |
|---|---|---|---|
| `trees.enabled` | `1` | 0/1 | Master on/off (update + draw) |
| `trees.density` | `1.0` | 0-3 | Spawn multiplier; applies on the next rebuild (`window.__trees.rebuild()`) |
| `trees.swayAmp` | `1.0` | 0-4 | Ambient sway amplitude |
| `trees.windCouple` | `1.0` | 0-3 | How hard `surfaceWind` leans the canopies |
| `trees.gustR` | `96` | 20-240 | Rig flyby gust radius around a canopy, px |
| `trees.gustGain` | `1.0` | 0-4 | Flyby shove strength (gated above ~46 px/s rig speed) |
| `trees.leafRate` | `1.0` | 0-4 | Leaf/chip shed master (0 = no particles) |
| `trees.birdPeriod` | `11` | 2-60 | Mean seconds between ambient canopy bird launches |
| `trees.fallRate` | `1.0` | 0.2-3 | Tip-over torque (higher = faster timber) |

---

# 6 · PARTICLES & EFFECTS · tier `edit`

| Lever | Where | Now | Effect |
|---|---|---|---|
| Ember grid `step` | `drawEmbers` | `38` | Magma/mantle ember spacing (lower = denser). Perf |
| Ember drift/flicker | `drawEmbers` | speed 0.4-0.9, α0.7 | Ember rise speed + brightness |
| Impact `sparkCount` | collision | `min(28, speed/18)` | Wall-impact spark count |
| Bomb `sparkCount` | bomb code | `min(10, level+1)` | Bomb spark count |
| Explosion `emberCount` | explosions | `floor(velP2×8)` | Explosion ember count |
| Explosion glow/streaks | `drawExplosions` | radial glow + dust | Flash size + dust-streak look |

## 6.1 `rocketTune` — jetpack plume · grep `var rocketTune` · tier `edit`

The densest single object — 73 fields. Not yet on `window` (Phase 2 will
expose it). Procedural flame core + additive sparks + smoke wake + ground wash.

**Toggle / ramp:** `enabled` true · `ramp_up` 30 · `ramp_down` 20

**Flame core:** `core_length` 40 · `core_length_min` 37 · `core_width` 3 ·
`core_width_taper` 0.04 · `core_jitter` 2.3 · `core_pulse_amp` 0.28 ·
`core_pulse_freq` 26.5 · `core_inner_r/g/b` 1.67/0.22/1.71 ·
`core_mid_r/g/b` 0.68/0.89/1.9 · `core_outer_r/g/b` 1.92/1.94/1.22 ·
`core_alpha` 0.34

**Shock diamonds:** `shock_enabled` true · `shock_count` 5 *(perf cap)* ·
`shock_size` 1.5 · `shock_brightness` 0.17 · `shock_pulse_freq` 60

**Ground wash:** `wash_enabled` true · `wash_distance` 155 · `wash_rate` 840 ·
`wash_speed` 160 · `wash_speed_jitter` 0.4 · `wash_lift` 35 · `wash_life` 0.4 ·
`wash_size` 2.2 · `wash_growth` 10 · `wash_drag` 1.9 · `wash_lobes` 4 ·
`wash_lobe_spread` 0.55 · `wash_rot_speed` 1.8 · `wash_top_light` 0.45 ·
`wash_shadow` 0.35 · `wash_top_r/g/b` 1/0.85/0.55 · `wash_r/g/b` 0.67/0.7/0.7 ·
`wash_alpha` 0.29 · `wash_streak_enabled` true · `wash_streak_alpha` 0.35 ·
`wash_streak_length` 0.06 · `wash_impact_enabled` true · `wash_impact_size` 28 ·
`wash_impact_alpha` 0.85 · `wash_impact_r/g/b` 1/0.65/0.25 ·
`wash_impact_pulse_freq` 14

**Sparks:** `spark_rate` 0 · `spark_max` 510 *(perf cap)* · `spark_speed` 680 ·
`spark_speed_jitter` 0.3 · `spark_spread` 1.06 · `spark_life` 1.45 ·
`spark_size` 1.55 · `spark_drag` 2.85 · `spark_gravity` 240 ·
`spark_r/g/b` 0.07/0.55/0.56 · `spark_alpha` 0.61

**Smoke wake:** `wake_rate` 0 · `wake_max` 70 *(perf cap)* · `wake_speed` 40 ·
`wake_spread` 0.36 · `wake_life` 0.5 · `wake_size` 1.2 · `wake_growth` 0.2 ·
`wake_drag` 0.1 · `wake_buoyancy` 68 · `wake_r/g/b` 1.76/0.85/1.36 ·
`wake_alpha` 0.91

## 6.2 `flightTune` — rotation flight feel · grep `var flightTune` · tier `live` (the `flight` gm group)

Above-ground flight. `mode`: **0** = today's axis-aligned/directional flight (legacy d-pad style) · **1** = full rotation (A/D rotate, thrust along the nose, momentum) · **2** = VTOL hover (v24.145 — upright rig, direct strafe; its levers are §6.5). **DEFAULT = 1** (v23.96 — owner: rotation is the flight now). Switch on the **pause screen** (Today / Rotation / VTOL) or **F** in dev mode (cycles all three). Both sky models persist until **~3 blocks below the surface** (`flightDeepUnder`, 080) before handing off to the underground/legacy flight + d-pad.

Default feel = a **tamed Twitch** (agile spin, a notch under the Twitch preset) with a real fall + low-drag inertia:
`thrust` 1450 · `gravity` 600 *(fall terminal = gravity/linDamp, clamps to MAX_FALL 740)* · `linDamp` 0.8 *(linear drag = INERTIA — low = long coast + real fall; the "grape in oil" complaint was 2.6)* · `turnAccel` 26 · `angDamp` 6.5 *(angular damping, applied only when NOT steering — settle-on-release)* · `maxOmega` 7.5 *(spin cap ≈ 430°/s)* · `maxSpeed` 0 *(hard total-speed clamp; 0 = off, keep inertia)*

Model (080, the `rotFlight` branch): semi-implicit Euler, thrust along `player.angle`, exp linear + angular damping (emergent top speed = thrust/linDamp). Takeoff from the ground always seeds UPRIGHT (coyote timer `flightGroundT`) even on held thrust. The visual body tilt is one eased `player.bodyTiltRender` shared by `drawPlayer` + the exhaust so they rotate in lockstep and EASE (not snap) at the rotation→upright boundary.

**No camera juice** (owner rule): the feel is PURE physics. A velocity look-ahead was tried (v23.83) and fully removed (v23.86) — do not re-add camera motion.

**`FLIGHT_PRESETS`** (grep `var FLIGHT_PRESETS`) — one-click feel buttons at the top of the `flight` L-panel group; each applies a full bundle. All low-drag; controllable spin caps sit in ~180-300°/s, Twitch deliberately past it:

| Preset | Feel | thrust · gravity · linDamp · turnAccel · angDamp · maxOmega |
|---|---|---|
| Drift | spacey, max inertia, long coast | 1150 · 460 · 0.45 · 12 · 4 · 4.0 |
| Glide | floaty, lift-biased | 1250 · 360 · 0.8 · 14 · 7 · 4.2 |
| Snappy | crisp arcade | 1450 · 640 · 0.85 · 26 · 11 · 4.6 |
| Heavy | high mass, hard fall, slow turn | 1750 · 820 · 0.65 · 7 · 4 · 3.1 |
| Twitch | acrobatic, fast spin | 1400 · 440 · 0.8 · 30 · 6 · 9.0 |

## 6.3 Booster — 5-tier flight upgrade · grep `BOOST_THRUST_MULT` · tier `edit`

A `booster` Workshop upgrade, 5 tiers, **tier 3 = today's feel (1.0×)**. `BOOST_THRUST_MULT` (040) `[_, 0.70, 0.85, 1.00, 1.25, 1.55]` scales flight thrust (both models). Fresh runs start at **tier 1** — `upgrades.boosterLevel: 1` in 020 AND the `init()` reset in 040 (change BOTH to 3 to start at today's feel). Prices `shop.booster` (020). Per-tier exhaust in 200: `BOOST_FLAME` (per-tier core colours; tier 3 = today's live `rocketTune` unchanged) + per-tier flame size, shock-diamond count, and a tier-4/5 additive halo. Shop icon `buildBooster` (240).

## 6.4 Mobile split touch controls · grep `flightTouchGeom` / `drawFlightPad` · tier `edit`

Rotation flight on touch: **rotate L/R chevrons bottom-LEFT (always on)** + **thrust hold bottom-RIGHT** (cross-fades with the dig d-pad). Independent touch ids so rotate + thrust hold at once. Geometry mirrors the d-pad (`flightTouchGeom`, 310); hit-test `flightControlsActive` / `inFlightBtn` / `updateFlightRot` (050) — **the whole touch-flight hit-test is wrapped in `if (isMobile)`; do NOT un-gate it (desktop clicks would move the rig).** Visibility eases via `player.flightCtrlT` (dwell) + `player.flightCtrlAlpha` (cross-fade) in 080. Players switch flight mode on the pause screen (`sluice.html` → `window.gm` flight.mode). VTOL (mode 2) never raises `flightCtrlT`, so touch keeps the plain dig d-pad in every regime — no split controls to learn. Deferred: haptics, left-handed mirror, size/opacity options.

## 6.5 `vtolTune` — VTOL hover flight (mode 2) · grep `var vtolTune` · tier `live` (the `vtol` gm group)

Terraria-wings HANDLING on the same rocket (v24.145): upright rig (no heading), `moveU` climbs, L/R is **direct** horizontal authority, release drifts on mild air friction. Fuel is the **only** limiter — no flight meter, no run-dry glide, full fall damage. The vertical model reuses the legacy jet's shape (tap kick, spool, headroom toward a terminal, hover assist, gravity relief, apex easing, hover-settle — the shared constants in 080) at sky authority. The integrator (080, the `vtolFlight` branch) **lerps the whole envelope to the underground air numbers across the 3-block handoff band**, so the underground takeover is a parameter slide, not a control flip — one paradigm everywhere.

| Lever | Now | Range | Effect |
|---|---|---|---|
| `acc` | `850` | 0–3000 | Direct horizontal accel (px/s²) — the "wings" authority |
| `speed` | `420` | 50–900 | Cruise cap (px/s); input stops pushing here |
| `fric` | `240` | 0–1200 | No-input horizontal bleed (px/s²) — lower = longer glide-slide |
| `revBoost` | `1.9` | 1–4 | Accel multiplier while opposing your own vx (dodge flips) |
| `climbForce` | `1500` | 0–4000 | Peak upward force (px/s²) |
| `climbTerm` | `-380` | -900–-50 | Sustained climb ceiling (px/s, negative = up) |
| `gravity` | `760` | 0–1500 | Fall pull (px/s²); falls cap at MAX_FALL 740 |
| `gravRelief` | `0.30` | 0–0.9 | Fraction of gravity removed at full spool |
| `overBleed` | `0.55` | 0–3 | 1/s exp decay on speed past the cap — **earned overspeed (boost rings, dives) is kept and bled, never clamped** |
| `tilt` | `0.34` | 0–0.56 | Visual bank while steering (a lean; physics stays axis-aligned) |

**`VTOL_PRESETS`** (020): `Strafe` (default — crisp authority, real fall, dodge bite) · `Feather` (light + hangy, long slide) · `Freight` (mass — strong engine, hard fall, deliberate). One-click buttons live in the **VTOL FEEL strip pinned at the top of the L panel** (directly under FLIGHT FEEL, v24.146 — each button switches to mode 2 + applies the full bundle), plus a contextual row atop the collapsible `vtol` group. Combat invariants: input never exceeds `speed`, the NMZ storm-shear cap still applies, and the booster upgrade still never changes above-ground flight (its multiplier fades in only across the handoff band, v24.59 rule).

## 6.5 Bomb physics · grep `BOMB PHYSICS` · tier `live` (the `bombs` gm group)

Live charges are projectiles (`065-bombs.js`, v24.144): release inherits the rig's velocity, then gravity + bounce + tumble + roll on the tile grid (substepped, max ~8 px per substep, so no tunneling at dive speeds). The blast aims at the cell the charge ends up in (one cell down when bedded, preserving the drop-to-dig move). Debug handle `window.__bombs` (count / info / spawn / boomAll / tune).

| Lever | Now | Range | Effect |
|---|---|---|---|
| `bombs.GRAV` | `640` | 200–1200 | Gravity on live charges (px/s²) |
| `bombs.REST_SMALL` | `0.42` | 0–0.9 | Small-charge bounce energy kept (lively lobber) |
| `bombs.REST_LARGE` | `0.20` | 0–0.9 | Large-charge bounce (lands like a brick) |
| `bombs.FRICT` | `7` | 0–20 | Ground roll friction (1/s); lower = rolls farther |
| `bombs.DRAG` | `0.12` | 0–1 | Air drag on horizontal speed (1/s) |
| `bombs.INHERIT` | `1.0` | 0–1.5 | Fraction of rig velocity a charge keeps at release |
| `bombs.TOSS_X` | `70` | 0–300 | Sideways toss along facing (px/s) |
| `bombs.TOSS_UP` | `90` | 0–300 | Grounded-release upward pop (px/s) |
| `bombs.FUSE_SMALL` | `2.0` | 0.5–6 | Small fuse (s) |
| `bombs.FUSE_LARGE` | `2.4` | 0.5–6 | Large fuse (s) |
| `bombs.IMPACT_V` | `430` | 0–1200 | Large-charge impact-detonation speed (px/s); `0` = fuse only |
| `bombs.CHAIN` | `1` | 0/1 | Blasts kick other live charges + crimp their fuses (staggered sympathetic booms) |
| `bombs.SHAKE` | `1` | 0–3 | Blast screen-shake trauma scale (gated by the player shake option) |
| `bombs.EMBERS` | `1` | 0/1 | Fuse ember spray off the burning tip |

---

# 7 · CAMERA & GLOBAL · tier `edit`

| Lever | Where | Now | Range | Effect |
|---|---|---|---|---|
| `CAMERA_SURFACE_FRAC` | Camera framing | `0.40` | 0.3–0.7 | Player vertical screen position at surface (lower = more ground) |
| `CAMERA_DEEP_FRAC` | Camera framing | `0.43` | 0.3–0.6 | Player vertical position 32+ tiles deep |
| `worldScale` default | constants | `2` | 1.5–3 | Base CSS-pixel world scale |
| `ZOOM_TILES` | constants | `{in:14, out:30}` | — | Tiles-across at each zoom level. Perf (more tiles = more chunks) |
| `damageFlashT` decay | game loop | `dt×1.4` | 1.0–2.5 | Red damage-flash fade speed |
| Damage flash intensity | hull damage | `0.4 + prox×0.6` | — | Red wash + edge vignette strength |
| Shop interior vignette | shop render | radius 0.25–0.75w, α0.45 | — | Shop-screen vignette darkness |
| Intro fade / warmup | boot | `terrainWarmupFrames` 3 | — | Black-overlay fade-in on load/restart |
| `TILE` | constants | `32` | 24–48 | World tile pixel size — global scale of everything (structural) |

---

# 8 · How to change a lever

**`live` levers** — open the browser console (dev mode, backtick), type e.g.
`window.smokeTune.sim_curl = 38`. Instant. Find the look you like, then bake the
value into `var smokeTune = { … }` in the source so it persists.

**`edit` levers** — edit `js/sluice.js`, change the value, **bump
`GAME_VERSION`**, reload.

**`edit²` levers** — the value is **duplicated in `js/liquid-wgpu.js`**. Change
**both** copies, or the GPU water sim drifts from the CPU reference (the
module self-tests will flag the drift in the console).

**Perf vs. look** — levers marked *Perf* cost frame time; the rest are free
look changes. The dev perf panel (backtick → `G` / `H`) shows where the cost
goes — "GPU/idle" is the whole-frame GPU signal, "WebGPU GPU" the sim cost.

---

# 9 · Recipes

**Sharpen the smoke** (you have FPS headroom — spend it):
1. `SMOKE_RENDER_SCALE_DESKTOP` 0.6 → 0.85 — biggest single deblur.
2. `smokeFluidScaledRes()` desktop `dye` — raise the `0.62` factor / `672` cap.
3. Tighten the plume: lower `smokeTune.sim_splat_radius` (0.255) and
   `diesel_bloom_radius` (0.078); raise `sim_curl` (28.5) for crisper swirls.

**Crank global sharpness:** raise `RES_PIXEL_BUDGET` and keep
`RENDER_SCALE_DESKTOP` at 1.0; raise `TERRAIN_RES_FACTOR` toward 0.8 (watch fps —
it cost ~19fps at 1.0 historically).

**Lower-end device:** drop `RENDER_SCALE_*`, `SMOKE_RENDER_SCALE_*`,
`smokeFluidScaledRes` grids, `LIQUID_MAX_PARTICLES`, `sim_pressure_iters`, and
the particle `*_max` caps. (Phase 4 will package these as low/med/high/ultra
presets with auto-detection.)
