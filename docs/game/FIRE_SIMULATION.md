# Reacting fire in Sluice

Version v28.63 replaces the boiler's decorative flame field with a bounded,
GPU-resident reacting-flow simulation. It shares the water solver's WebGPU
device. Coal motion still uses the polygon rigid-body solver from v28.61.
The CPU combustion and flame renderer remain the fallback when WebGPU is
unavailable or `?cpufire=1` is selected.

The implementation is original JavaScript and WGSL, with no added runtime
package or imported simulator source. The surveyed projects, papers, source
revisions and licensing checks are in
[FIRE_SIMULATION_RESEARCH.md](FIRE_SIMULATION_RESEARCH.md).

## What drives the fire

`js/fire-wgpu.js` owns gas species, sensible enthalpy, velocities and the
material reservoirs. The gas fields hold fuel, oxygen, inert gas/products,
soot and water vapor. Hot gas rises, pressure redirects it around fuel,
and vorticity confinement preserves rolling motion. The grate supplies
primary air, side ports admit secondary air above the pile, and the roof
opening vents the chamber. Bellows increase inlet velocities.

Each 60 Hz step performs velocity advection, buoyancy, an approximate pressure
projection with 20 warm-started Jacobi iterations, eight conservative transport
substeps, matched gas/solid surface exchanges, and finite-rate reactions.
Reaction expansion and a bounded density-relaxation term request outward flow;
they do not create or delete species. Velocity limits satisfy the transport
CFL bound. Both sides of each face use the same donor flux. Closed faces pass
neither species nor enthalpy.

Cold fuel/oxygen mixtures stay cold. Hot fuel cannot react without oxygen.
The gas reaction consumes both reactants and produces gas and soot with matching
mass. Soot retains chemical energy until it oxidizes. Brightness follows soot
temperature and reaction activity, using an approximate three-wavelength thermal
spectrum, a blue reaction contribution and a small spatial glow. Exposure affects
only rendering. There are no painted flame sources in the GPU path.

## Material and geometry feedback

The very same convex coal polygons used for drawing, picking and rigid-body
contacts become gas obstacles. Surface cells belong to one fuel body, and both
sides of an exchange gather from the same immutable snapshots. The CPU does not
independently spend fuel while the GPU owns the boiler.

A changed obstacle mask conservatively remaps displaced gas to the nearest
remaining fluid cells. Newly uncovered cells start empty and fill through
transport. A CPU breadth-first search builds bounded donor lists; a GPU gather
moves species and enthalpy without floating-point atomics. This also handles
inserting, dragging, shrinking and lifting coal. It is a conservative displacement
approximation, not a resolved moving-wall momentum boundary.

Bodies retain separate volatile, fixed-carbon and moisture reservoirs, surface
and core temperatures, and an ash coating. Heating spends energy on drying and
pyrolysis. Released gas can travel before burning. Carbon oxidation consumes
actual surface oxygen and divides its heat between solid and gas. The core and
skin exchange heat; nearby bodies exchange contact heat and approximate radiation.
Contact conduction uses polygon separation. Radiation uses bounded view factors
and approximate occlusion by intervening fuel.

The physical scale is a 0.8 by 0.525 metre chamber with a 0.04 metre slice depth.
A reference coal body starts with 0.018 kg of combustible material; other sizes
scale by squared radius. Temperatures are Kelvin and exchange amounts are kg
and kJ. Gas sensible heat uses a constant effective heat capacity. Water warming
uses 4.18 kJ/(kg K), vapor sensible heat uses 1.8, and evaporation costs
2260 kJ/kg. These are simplified material coefficients and game-time kinetics.
The flint interaction is an explicit finite ignition assist; it does not model
the energy of an individual real flint spark.

Coal reserves 28 percent of its combustible mass as volatiles. A tested wood
adapter reserves 76 percent, starts pyrolysis at a lower temperature, and releases
gas faster. `hearthAddChunk(kind, x, y, 'wood')` is a developer material seam;
wood inventory, wood art, paper and liquid-fuel gameplay are not added in this
release. Their material adapters can feed the same gas solver.

The internal `quench(body, kg)` command adds real water mass once, mixes its
sensible heat with the wet skin, and charges evaporation separately. It is
verified as a coupling interface. Pouring the game's water particles directly
onto fuel is not connected yet. Bath water remains owned by the existing
liquid and bath-service systems.

Heat lost from the gas and exposed fuel to the vessel supplies boiler power,
with a configured 65 percent capture factor. `078-fire-bridge.js` maps 2 kW
of slice transfer to full existing boiler power. The bath's existing normalized
heat/storage and gameplay heating rates remain in service; this is not a
calibrated model of the entire bath's water heat capacity. Held coal contributes
no direct radiation to the boiler. Shrinking fuel changes mass and support.

Contact impulses drive a carbon-dependent failure model. Convex fragments inherit
the current GPU body state in a compute pass, with dry reference mass divided by
area. A stale CPU readback cannot refill them. The six reserved body slots allow
fracture beyond the eighteen-piece loading limit, with two split generations.
At capacity a weakened piece continues burning until a slot opens. Exhausted
material becomes bounded mineral ash grains; they retain residue mass, cool,
settle and obstruct primary grate air until swept. Granular ash cooling is a
CPU approximation and is not coupled back into the gas enthalpy field.
See [COAL_FURNACE.md](COAL_FURNACE.md) for the failure and ash model.

## Ownership, saves and display

A single asynchronous readback of 2,560 bytes mirrors bodies and reductions.
Only one can be pending. Slot revisions, reset generations and ignition/quench
serials prevent removed bodies or earlier commands from overwriting current
state. Reservoirs, Kelvin temperatures and material identity persist in hearth
save version 4. Older saves migrate from normalized temperatures without adding
fuel. Saves use the latest acknowledged material snapshot; transient chamber gas
vents on reload rather than being serialized.

Initialization, shader compilation, bind-group validation and a representative
GPU draw complete behind the loading cover. Timeout and reset generations cancel
late initialization. Device loss retires the fire instance; the legacy CPU model
continues from the last acknowledged material state.

Since v28.66, the fire compilation deadline starts after the bounded water-device
gate settles. Previously the two eight-second timers ran together, so waiting
for water could cancel a healthy fire startup. A failed water device still
selects fallback immediately. The CPU flame field now uses smooth image
interpolation, scoped to the flame draw, instead of enlarging its cells with
nearest-neighbor sampling.

A transparent DOM canvas renders directly from resident GPU fields. It follows
both the full boiler and the small hatch beneath the bath, and hides on pause,
transitions and leaving the room. Display resolution is capped at 1.5 device
pixels per CSS pixel. No GPU canvas is copied through Canvas2D. Fully cold fire
sleeps after a five-second vent period, with no continuing compute submissions.

Since v28.65 the chamber extends upward from y = -110 to the original grate at
210, adding 52 percent more physical plume space without enlarging the coal.
The tending view preserves the square chamber aspect ratio and caps its desktop
size at 440 CSS pixels. The bath's integrated hatch is taller and shows the same
complete chamber. Pointer coordinates share this transform.

The normal image reconstructs gas with positive cubic B-spline weights, normalized
over fluid cells. These display samples do not modify simulation mass or heat.
Flame occlusion uses the fuel's actual convex edge planes with a subpixel transition,
instead of magnifying the simulation's square solid mask. A retained 6,144-byte edge
buffer updates with changed geometry. Diagnostic views retain the raw cell mask.
The fire canvas explicitly uses smooth browser scaling.

For inspection, `window.__fire.debug` selects 0 for the normal image, 1 for
heat, 2 for oxygen, 3 for fuel, 4 for velocity and 5 for reaction rate. An active
simulation updates the selection on its next step. `snapshot()` is a diagnostic
full-field readback, never used in the gameplay loop.

## Cost and verification

`node tools/test-fire-startup.cjs` checks slow shared-device startup and bounded
water/fire failures with a deterministic clock. `SLOW_FIRE_BOOT=1 QUICK=1 node
tools/fire-simulation-smoke.mjs` also boots the real browser with a delayed water
device and fire warm-up. The CPU browser test checks interpolation in actual
rendered pixels as well as preserving the surrounding canvas settings.

Desktop uses 192 by 192 cells; mobile uses 128 by 128. There are at most twenty-four
fuel bodies and four 60 Hz steps per game frame. A suspended tab does not catch
up its missed burn time. Buffers, pipelines and bind groups are retained, and
all steps in one game update share one queue submission. The desktop simulation
buffers occupy 4,892,832 bytes, excluding presentation textures and CPU geometry
arrays. The module requests no second GPU device.

On the development Apple M1 Pro, Chrome for Testing with Metal, v28.65 at 1280 by 900:

| Measurement | Result |
| --- | --- |
| Fire CPU geometry and submission, 120 frames with three burning pieces | 1.08 ms average, 1.20 ms p95 |
| Fire-room update/render plus a GPU queue fence | 5.33 ms average, 7.90 ms p95 |
| Full bath frame CPU time, about 51,000 liquid particles, steam and a guest | 3.04 ms average, 5.00 ms p99 |
| Full bath frame interval | 16.67 ms average, 16.80 ms p99 |

The queue-fenced measurement includes browser/driver scheduling and room drawing;
it is not a GPU timestamp. These are local measurements, not guarantees for other
hardware. The production smoke backend in this test is WebGL; liquid and slime
physics and the new fire use WebGPU.

Run `node tools/fire-simulation-smoke.mjs` for actual GPU verification. It owns
its Chrome for Testing process and writes screenshots and `verification.json`
to `/tmp/sluice-fire-qa`. The supporting browser checks verify:

- Cold mixtures, oxygen starvation, reaction mass and CPU-reference reaction energy.
- Every transported species and enthalpy conserved in a sealed box, positivity,
  impermeable walls and reduced divergence after projection.
- Gas mass and enthalpy conserved when inserting, moving and lifting a polygon.
- GPU fracture inheritance, conserved gas/material mass during splitting,
  matched solid/gas mass transfer, one-shot quenching, wet-fuel drying, draft,
  bellows, coal/wood differences, exhausted carbon and residual ash heat.
- Identical fixed steps under different frame batching and no stale readback
  updating removed fuel.
- Neighbor ignition through heat exchange, exact material save round trips,
  mobile layout and real touch ignition, sleep/wake and CPU fallback.
- Full-game water/steam/guest operation and clean browser/shader execution.
- GPU pixel checks for opaque polygon interiors, continuous diagonal boundaries
  and subpixel coverage, plus 1920px Retina and short landscape layout checks.

`node tools/test-hearth-physics.cjs` covers the rigid bodies and fallback material
model. `node tools/test-bathhouse.cjs` covers service, resource conservation,
legacy saves and the retired forge. `node tools/coal-furnace-smoke.mjs` explicitly
selects `?cpufire=1` to retain browser coverage of fallback coal tending.

This is a two-dimensional game simulation, not validated engineering CFD.
Pressure is approximate; there is no multigrid solver, compressible shock model,
3D turbulence or spectral radiation transport. Coal failure uses bounded 2D
polygon splits, not a volumetric material stress solver.
Sub-cell air passages are unresolved. The body core/skin model and gray radiation
are deliberately bounded approximations. Those extensions require separate
quality and frame-cost evidence rather than treating a larger grid as sufficient.
