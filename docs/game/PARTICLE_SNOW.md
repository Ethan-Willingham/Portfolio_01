# Physical snow

Pause > Options > World > Particle weather > Snow, then start a new game.
Existing snow worlds pick up the particle model on reload. Old column-based
snow saves migrate to individual particles, keeping their water equivalent.
Rain and Snow remain separate world choices; existing rain saves stay rain.
`?snow=1&nosave=1` opens a disposable snow world.

Snow uses the existing water solver. Dry snow is internal material 5 in the
same WebGPU MLS-MPM grid, with the same CPU fallback, terrain collision,
rig projection, jets, explosions, spatial culling and particle mutation journal.
The previous column banks, artificial plow wedges and snow foot-support logic
have been removed. The heavy rig stays on the ground and pushes the actual
snow particles aside. Powder rolls, compresses and sprays over the hull.
Removing its supporting terrain lets it fall into the mine.

## Material tuning

The snow constants are mirrored in `010-constants.js` and `liquid-wgpu.js`.
Water, oil and the three mineral liquids keep their own existing behavior.

| Constant | Value | Effect |
|---|---:|---|
| `LIQUID_SNOW_DENSITY` | 3.2 | Fine grains pack at about 1.4 world pixels apart |
| `LIQUID_SNOW_DIAMETER` | 1.8 | Same small grain in flight, piles and spray |
| `LIQUID_SNOW_STIFF` | 1.25 | Softer pressure response under compression |
| `LIQUID_SNOW_SHEAR` | 32 | Dissipates internal shearing instead of storing spring energy |
| `LIQUID_SNOW_DRAG` | 8 | Settles lateral and vertical movement after disturbance |
| `LIQUID_SNOW_FRICTION` | 180 | Frictional yielding holds small piles against sideways creep |
| `LIQUID_SNOW_BOUNCE` | 0.025 | Soft terrain contact |

This is a dry granular tuning of the existing solver, not a full snow-crystal
or temperature simulation. There is no separate snow heightfield or rigid
snow platform. Tiny pressure disturbances settle; track and jet forces can
exceed the friction threshold. The GPU kernels and their CPU/f32 references
use the same material parameters.

Slow atmospheric flakes retain the rain system's inexpensive ballistic
approach until their first contact, then become actual solver particles.
Lateral flutter follows the existing wind. Falling, settled and thrown snow
all use the same particle shader, diameter, tint and canvas. The GPU uploads
flight positions into a small reusable render-only buffer; flight does not
activate physics cells across the sky. WebGL likewise appends the flakes to
its existing vertex stream. Canvas uses the same small square before and
after contact. Transfer preserves position and velocity, with no size change,
colour change or intermediate visual phase. On WebGPU, an independent additive snow-density channel in the existing
surface pass reconstructs a continuous matte boundary. Each real particle
contributes a fixed compact kernel (3.2 world-pixel radius, peak 0.34);
a solitary flake stays below the 0.66 surface threshold. Packed snow joins
into a body, and thinning powder separates continuously into the original
1.8-pixel grains. Falling and simulated snow contribute identical kernels.
The density gradient supplies diffuse shading; snow gets no water foam,
gloss or artificial gap bridging. Removing particles removes the surface.
The WebGL/Canvas fallback retains fine grain rendering. Lighting follows
daylight and moonlight.

Snowfall emits 345 grains per second at full intensity over the reference
width, three times the former rate. The denser rest spacing keeps the smaller
grains together in piles without making each storm three times as deep.
The initial dusting uses two or three closely spaced rows.

Snowfall covers a moving rectangle of open sky, padded 160 world pixels beyond
the view. Horizontal flight, climbing, descending and zooming seed only newly
exposed strips, at a density derived from the snowfall rate and mean fall speed.
Flakes already in the overlapping area keep their world positions and velocities,
including the wake cleared by the rig. New snowfall also enters at the top and
upwind edge. The sky volume reserves a quarter of the airborne budget for drift,
jet interaction and flakes falling through shafts.
The storm's type and intensity apply across the outdoor world. There is no
altitude cutoff or map region without snowfall during a front. Rain uses the
same coverage bounds and exposed-strip calculation in `156-particle-weather.js`.

Airborne flakes leaving the simulation window are stored in world-column buckets
with their position, velocity and flutter phase. Returning restores the same
flakes before filling any density deficit in newly revealed air. Stored flight
is paused offscreen, like stored solver snow; it does not become heavy solver
snow on return. These atmospheric flakes cannot thaw into stored sky water.
They return to the atmosphere when the front ends or when the budget needs room
for snowfall elsewhere. Deposited and scooped material is never recycled this
way. Cached flight is included in saves and the total mass cap.
`parkedAirborne` and `recycled` in the snow stats report storage and retirement.

## Jet airflow

`159-snow-air.js` solves a local 64 by 48 staggered MAC grid at 8 world pixels
per cell. The inlet follows the actual banked nozzles and thrust intensity.
Semi-Lagrangian velocity advection and a 28-iteration red/black pressure
projection resolve the impinging jet, lateral wall flows and returning eddies.
Terrain and the rig block normal flow. The moving window preserves overlapping
world-space face velocities instead of dragging its wake with the camera.
The airflow decays after thrust stops and idles after three seconds.
Its exported velocity blends into ambient air over the outer four cells,
so the finite simulation rectangle has no abrupt influence boundary.

Aerodynamic drag entrains existing snow, with reduced exposure inside dense
powder. The WebGPU kernel updates resident particle velocity before P2G;
CPU fallback samples the same field and applies the same drag. It wakes the
entrained grains without changing their identity or mass. Atmospheric flakes
settle relative to the moving air: the jet velocity adds to their normal falling
and drifting motion. A weak crosswind cannot cancel gravity or build a shelf
of slow flakes above the rig; an actual updraft can still lift them.
No decorative snow, launch wedges or prescribed upward
arcs are created. The existing liquid cone wake continues to work alongside
the resolved air field. Jet heat is confined to a shorter, narrower core, so
the cold return flow can carry powder without instantly turning it into water.

This is a bounded 2D, one-way air-to-snow coupling, not a compressible rocket
exhaust model or a two-way multiphase solver. Snow retains the existing dry
granular MPM material rather than a full elastic/plastic snow constitutive
law. The projection approach follows standard incompressible fluid simulation;
see [Bridson's course material](https://www.cs.ubc.ca/~rbridson/fluidsimulation/).

The dedicated hover/low-pass test retained all 3,290 starting particles through
snow, meltwater and absorption. More than 1,000 grains rose above 25 world
pixels, including outside the jet core. The local air solve measured about
1 to 1.6 ms per update in that headless browser run; hardware and scene load
will affect total frame time. All buffers are bounded and reused. The air
coupling shader is compiled during the existing GPU startup warmup.

## Thaw, storage and limits

A new world starts with a light dusting and a gentle snowfall. The opening
front lasts about a minute. Later fronts last 55 to 80 seconds, separated by
120 to 190 seconds of milder fair weather, with cloud buildup and clearing.
Air stays cold until precipitation finishes, then gradually thaws deposited snow.
Foundations, jet exhaust and contact with
a body of water accelerate thaw; a few droplets do not dissolve an entire pile.
The rig's warm scoop collects snow directly into its water chamber.

Melting changes material 5 to water in place, retaining the GPU's current
position and velocity. One snow particle is exactly one water particle.
The ordered identity-change operation cannot duplicate or teleport it.
A full weather-water reservoir defers melting with the snow intact. Meltwater
uses normal water physics, including soil absorption and finite lake storage.

Active snow is capped at 36,000 particles on WebGPU or 7,000 on CPU, with
5,400 active airborne weather flakes and a 120,000-particle total snow allowance.
New deposition leaves 5,400 of those slots for atmosphere, so a full pile budget
does not stop the storm. At that limit, excess unlanded flakes return to the
atmosphere on contact. Existing physical snow retains its mass.
Offscreen particles are parked at their real coordinates and velocities;
returning to the area restores them into the same solver. Parked snow can
thaw into parked water. The shared solver reserves 4,096 slots for other liquids.
The local solver limit does not stop airborne snowfall; new contact material
waits in storage if the solver is full. Ground beyond the visible snowfall
strip keeps its dusting and parked snow; the finite lakes still use their
existing offscreen catchment accounting at the snowfall rate.

Saves contain the individual solver particles and airborne flakes separately
from existing water. Pause freezes weather and thaw. Outdoor weather pauses
inside the banya. `window.__particleSnow.stats()` reports the shared-particle
model, active and parked counts, moving powder, collected mass and thaw.

## Verification

Run `node tools/sluice-snow-smoke.mjs --soak --cpu`. It owns a disposable Chrome
for Testing process and writes screenshots under `/tmp/sluice-snow-qa`.
It checks native settings, boot, actual GPU snow, pile stability, driving both
ways without alternate foot support, jets, digging, scoop conservation,
in-place melting, exact save/load, legacy migration, budgets and CPU fallback.
It also compares rendered pixels before and after sky-to-solver transfer in
both GPU rendering modes and the CPU fallback, checks that the last grain
clears cleanly, verifies that removing snow mass removes its reconstructed
surface, and tests live GPU absorption for ordinary, poured, pond and
rain water.

`node tools/perf/liquid-materials.mjs --gpu` verifies the five existing liquids
and snow together through GPU identity packing, physics and readback. Run
`node tools/sluice-rain-smoke.mjs --drain` for rain, finite lakes, plow protection,
soil contact, stored-water drainage and a resting puddle on the live solver.

`node tools/perf/snow-air.mjs` checks wall flow, recirculation, pressure
projection, occlusion through a solid roof, window translation and shutdown.
`node tools/sluice-snow-jet.mjs` runs a controlled live hover and low pass,
checks entrainment outside the core and exact material accounting, then flies
through several view widths in both directions and checks surrounding snowfall.
An airborne hover also checks that flakes keep falling through the top of the
jet airflow area without stalling. It writes
its screenshots to `/tmp/sluice-snow-jet-qa`. Add `--cpu` to exercise the
same interactions on the CPU solver.

`node tools/test-snow-coverage.cjs` checks sustained sideways travel, reversals,
unchanged world positions in the overlapping view, offscreen restoration,
exact atmospheric save/load, zoom, altitude, world edges and particle budgets.
It also checks continuous rain coverage during flight, atmospheric recycling,
and that stored sky flakes cannot turn into rain.

`node tools/sluice-weather-coverage.mjs` checks both modes across distant map
locations and high-altitude views, four-column coverage, underground gating,
and rain/snow exclusivity. Add `--cpu` for the fallback. Screenshots go to
`/tmp/sluice-weather-qa`; use `DUMP` and `PORT` for concurrent runs.
