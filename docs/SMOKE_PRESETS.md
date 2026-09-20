# Exhaust physics experiments

The collection keeps Copperhead and Jade dragon at the owner's exported
settings and adds eight fluid experiments. The two Copperhead downloads were
identical. Original exports in `tools/fixtures/smoke/` protect their source,
color, sampler, scale and tuning data. They retain the legacy display transfer
and have all new forces disabled once the brief transition finishes.

| Retained look | Scale | Density | Liveliness | Size |
| --- | --- | --- | --- | --- |
| Copperhead | Tower | 25% | 65% | 65% |
| Jade dragon | Tower | 40% | 25% | 60% |

## New materials

These all use the shared WebGL smoke solver. There are no supplemental shape
particles, traced ribbons, drawn rings or bubble sprites.

| Look | What changes in the fluid |
| --- | --- |
| Cauldron | Hot smoke rises, cools, becomes heavy and overturns. |
| Dry ice | Negative buoyancy carries fog down onto ledges and over edges. |
| Velvet rope | Strong velocity diffusion keeps a slow plume smooth. |
| Vortex cannon | Brief jet impulses shed rolling mushroom fronts. These are 2D vortex pairs, not 3D toroidal rings. |
| Countercurrent | A fast core meets slower reverse flow along the edges. |
| Witchfire | Strong thermal lift stretches thin green smoke into tongues. |
| Spiral kiln | A signed force tangent to concentration gradients stirs the plume's edges. This is an artistic force, not a model of ordinary exhaust. |
| Falling bloom | Discrete hot bursts cool quickly and collapse into heavy lobes. |

Ink Blossom's repeated sweep came from a shared sideways sine oscillator,
unequal stream weights and a separate pulse clock. The new sources have
balanced lateral momentum and a stationary nozzle. The exported looks still
use their original sampler because the owner wanted them preserved.

## Live auditioning

Open `water-smoke-slime.html?smoke=cauldron`. The Smoke menu opens the library.
Idle, Drive and Boost exercise the preview nozzle. The preview rig is a fixture,
not the game's driving implementation.

Switching preserves dye, temperature, velocity, pressure, water, slimes and
walls. Material forces transition over 0.35 simulation seconds. New color enters
with newly emitted smoke; old smoke continues responding to the current fluid
forces. The source clock is not restarted. The optional clear-on-switch control
is off by default. Clear smoke is an explicit field reset, not a game reset.

The regular tuning controls change emission density, liveliness and size.
Change the physics live exposes heat, heat lift, weight, cooling, internal
friction and signed edge spin. Restore recipe restores all controls without
clearing the field. Favorites and JSON exports include these physics changes.

The new materials also use absorption-based opacity to preserve their hue at
high concentration. The two retained exports use the original renderer.

## Solver contract

`js/sluice/190-smoke-webgl.js` is the source of truth. The toy's engine is an
exact generated copy maintained by `tools/toy-engine-sync.mjs`. The material
extension is in the active WebGL engine, not the parked WebGPU smoke port or
the CPU fallback. All controls default to disabled forces in Sluice.

Temperature lives in dye alpha, which was unused by the display shader.
Emission adds heat proportional to injected dye; advection transports it with
the velocity field and cools it independently of visible density. Scrolling
carries all four dye channels. Clear/resize clears heat with the other fields.
No additional texture, framebuffer, simulation pass or shader compilation is
needed when changing materials.

The existing vorticity pass now applies bounded heat lift and density weight,
optional velocity diffusion and optional tangential edge forcing. These happen
before liquid coupling, moving-body velocity enforcement and pressure
projection. Existing terrain, water and slime coupling remains in effect.

Call `SmokeFluid.setPhysics(values, transitionSeconds)` to replace a complete
material profile, with omitted/invalid fields returning to defaults.
`SmokeFluid.getPhysics()` returns a copy of the target profile. Set transition
seconds to zero for an immediate coefficient change. This still preserves the
fields. Direct `config` changes also apply live on the next step.

| Field | Range | Default | Meaning |
| --- | --- | --- | --- |
| HEAT | 0 to 4 | 0 | Temperature injected per unit dye concentration |
| COOLING | 0 to 6 | 1 | Exponential temperature decay per second |
| BUOYANCY | 0 to 500 | 0 | Upward acceleration from bounded temperature |
| WEIGHT | 0 to 300 | 0 | Downward acceleration from bounded concentration |
| VISCOSITY | 0 to 30 | 0 | Stable neighbor-velocity mixing rate |
| EDGE_SPIN | -250 to 250 | 0 | Signed tangential concentration-gradient force |

Force coefficients are solver tuning units, not physical SI measurements.
Viscosity is bounded explicit diffusion, not a converged implicit viscous solve.
`config.OPTICAL_DENSITY = 1` enables the new absorption display; zero retains
legacy display. In the running game, `gm.smokePhysics(profile)` changes these
material controls without restarting, and `gm.smokePhysics()` reads them.

## Export and future game integration

`js/smoke-presets.js` owns recipes and the deterministic source sampler.
New downloads use `sluice-smoke-recipe` version 3 with `solverVersion: 1`,
`physics`, `preset`, `scale` and `tuning`. The original two recipes still use
sampler version 1; new recipes use sampler version 3. The old shape-effect
version 2 is removed. The shortlist is an envelope of individual recipes.

At equip time apply `export.physics`, `preset.fluid` and effective curl
`clamp(preset.fluid.CURL * tuning.motion + scale.values.curl, 0, 50)`.
Call `SmokePresets.sample(preset, seconds, phase, tuning, scale.values, throttle)`
at 30 Hz of simulation time. It returns zero to four new-source splats, or two
legacy splats. Rotate source-local lateral `x/vx` and outward `y/vy` through
the nozzle orientation and negate world Y velocity for the solver's UV space.
`emitSmokeRecipe()` in the toy is the reference adapter.

The game shop is not connected to these exports yet. Material forces currently
apply to the entire fluid domain, including old smoke. A rig-only cosmetic
integration must isolate its fluid domain or deliberately accept shared forces.
The game host also has a heavy-smoke tint wrapper and per-frame legacy tuning
assignments that an equip adapter must account for. The new physics API itself
is independent of those legacy assignments and can change while the game runs.

## Verification

- `node tools/smoke-presets-smoke.mjs`: retained data, all rendered presets,
  live switching, UI tuning, favorites, downloads, phone layout and game boot.
- `node tools/perf/smoke-physics.cjs`: measured thermal rise, weight, independent
  cooling, viscosity, signed circulation and zero-allocation switching on
  WebGL2, WebGL1 and manual filtering.
- `node tools/perf/smoke-water-coupling.cjs`: existing water entrainment,
  occlusion and dye preservation across the same GL profiles.
- `node tools/toy-engine-sync.mjs --check`: exact shared engine parity.

Screenshots belong in `/tmp/sluice-smoke-presets-qa`, not in the repository.
`ONLY=cauldron,dry-ice` narrows the catalog render sweep; `FRAMES=900` extends
it to 30 simulated seconds per recipe.

The legacy pixel comparison against `651818a` covered 4,687,872 channel bytes
across seven GL profiles. Six profiles were byte-identical; the remaining
profile differed in 71 channel bytes, each by one level out of 255. This is a
visual preservation check, not a claim of bit-identical shader arithmetic.
