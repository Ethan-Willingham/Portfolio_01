# Exhaust physics experiments

The demo contains eleven recipes: Copperhead, Jade dragon and nine fluid
experiments. Six owner-selected exports are sold in Sluice's Store > Exhaust,
alongside free stock exhaust and the premium rainbow look, Prismatic.
Original exports in `tools/fixtures/smoke/` record the chosen source, color,
sampler, scale, tuning and physics data. The two Copperhead downloads were
identical and count as one look.

Copperhead and Jade dragon retain their exported settings, legacy display
transfer and disabled material forces once the brief transition finishes.

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
| Velvet rope | Strong velocity diffusion keeps a slow crimson plume smooth. |
| Vortex cannon | Brief jet impulses shed rolling mushroom fronts. These are 2D vortex pairs, not 3D toroidal rings. |
| Countercurrent | A fast core meets slower reverse flow along the edges. |
| Witchfire | Strong thermal lift stretches thin green smoke into tongues. |
| Spiral kiln | A signed force tangent to concentration gradients stirs the plume's edges. This is an artistic force, not a model of ordinary exhaust. |
| Falling bloom | Discrete hot bursts cool quickly and collapse into heavy lobes. |
| Prismatic | A continuous rainbow rolls through a viscous plume with gentle edge circulation. |

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
the CPU fallback. The ambient Sluice smoke instance keeps disabled material
forces by default; purchased rig exhaust uses an independent instance.

`SmokeFluid.create()` returns a new solver with its own config, canvas, GPU
fields and material profile. Initialize it once, then reuse it across live
material changes. The original `SmokeFluid` instance remains available to
existing callers.

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
legacy display. `OPTICAL_BRIGHTNESS` and `OPTICAL_ABSORPTION` are display-only
controls, defaulting to 0.9 and 1. Velvet rope uses 0.64 and 3.2 to keep its
crimson body visible without the previous pale finish. Prismatic uses absorption
2.4. These values live in `recipe.fluid` and do not change the exported motion
or material forces. In the running game, `gm.smokePhysics(profile)` changes
the ambient material controls without restarting, and `gm.smokePhysics()`
reads them.

## Store and ownership

Store > Exhaust sells cosmetics for in-game cash. Buying equips the look
immediately. Owned looks can be equipped again for free, including stock.
They do not change rig performance or upgrade levels.

| Exhaust | Price |
| --- | ---: |
| Stock exhaust | Free |
| Copperhead | $750 |
| Jade dragon | $1,500 |
| Velvet rope | $2,500 |
| Countercurrent | $4,500 |
| Witchfire | $7,500 |
| Spiral kiln | $12,000 |
| Prismatic | $25,000 |

`195-exhaust-catalog.js` contains the six selected export snapshots, prices,
ownership and purchase validation. Their scale, tuning and physics remain as
exported. Velvet rope's palette changes to crimson (`#b51238`, `#6e0927`)
with the display settings above. Prismatic uses the shared demo recipe.
`275-shop-exhaust.js` presents the catalog and free equip actions.

Ownership lasts for the current save. Purchases and equip changes save
immediately through the existing save system. The optional
`profile.rigExhaust` field contains known owned IDs and an equipped ID;
legacy saves default to stock, unknown IDs are ignored, and unowned equipment
is rejected. Death and recovery retain the collection. New Game clears it.
An unavailable smoke renderer disables custom purchases and equips without
charging, while previously saved ownership remains intact.

## Export and game integration

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

`191-rig-exhaust.js` adapts this sampler to the game's nozzle, scales the demo
fixture to the rig and converts velocity and force units to the current fluid
domain. It creates and warms one independent rig solver during loading.
Equipping reuses its fields and GPU resources, transitions material forces,
and introduces the new color through fresh emissions. No game reset is needed.
Switching to stock lets the previous colored plume fade.

The rig solver follows the camera and receives terrain, water and slime
boundaries. Ambient smoke keeps its own material settings, heavy-smoke tint
and emission cadence. Cosmetic forces apply only inside the rig smoke field;
they do not retune the ambient instance.

### In-game appearance controls and rig interaction

Pause > Options > Exhaust has three controls for the equipped purchased look:

- Smoke amount changes source density from 10% to 200%.
- Edge definition reduces the display filter and tightens the opacity edge,
  from Soft to Crisp. It never changes the stored smoke or its material forces.
- Linger time changes visible density decay from 0.5x to 3x the recipe's
  normal duration. It does not slow cooling or the velocity field.

Changes apply live and are saved separately per owned exhaust. Restore recipe
returns all three controls to that look's defaults. Original recipe physics,
source motion, colors and export fixtures remain unchanged. Stock exhaust has
no separate appearance controls because it shares the ambient smoke field.
The additive `profile.rigExhaust.settings` map validates known keys and finite
numbers, clamps supported ranges, and ignores unowned/unknown recipes. Old
saves keep their original appearance. Range changes apply immediately, with
save serialization deferred until the native change event or a short idle.

Both smoke fields now receive the rocket's air jet after camera scrolling and
before the pressure solve. World-space acceleration is integrated with elapsed
time and converted to each solver's cells; widths are converted from world
pixels. The jet follows the tilted nozzles, stops at terrain or slimes, and
spreads along an impact surface. Releasing thrust stops new jet impulses.
The moving chassis joins the existing slime boundary batch so driving through
smoke displaces it. These are bounded 2D fluid interactions, not a full 3D
compressible exhaust model. The CPU fallback receives the same bounded jet.

## Verification

- `node tools/sluice-exhaust-smoke.mjs`: export fidelity, crimson and rainbow
  rendering, purchases, free switching, save migration, death retention,
  New Game reset, appearance controls and persistence, isolated fluid resources
  and desktop/phone store and pause controls.
- `node tools/sluice-smoke-coupling.mjs`: rocket transfer to both smoke fields,
  direction, release, blockers, cadence, zoom and moving chassis boundaries.
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
