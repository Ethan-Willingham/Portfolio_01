# Bath heat and steam

The bath uses the ordinary outdoor liquid solver, world units, gravity and
simulation clock. Entering the room no longer divides water time by the square
root of six or changes guest gravity. Thermal buoyancy is an additional force
only where the bath contains a temperature difference.

## Energy and water

`074-bath-thermal.js` owns a 12 by 6 thermal grid over the real curved basin.
Particle samples provide occupied volume, liquid identity and local velocity.
One litre is 100 particles. Water has a heat capacity of 4.18 kJ/(kg K), density
1 kg/L, and evaporation costs 2257 kJ/kg in addition to the sensible energy the
removed parcel carries away. Temperatures are degrees Celsius, with ambient
water and room air at 20 C.

`bed.thermalKW` comes from actual combustion. The reacting fire simulates a thin
slice of the chamber; `BATH_FIRE_SLICE_GAIN = 160` scales that slice to the
furnace's effective depth. This is an explicit gameplay calibration, not a claim
that the art supplies a measured building volume. Heat first enters an 80 kJ/K
copper exchanger. The copper exchanges heat with occupied bottom cells, loses
heat to the room and radiates. Empty furnaces and cold coals cannot warm water.

Outside the bath, mass snapshots run once per second while energy and evaporation
continue at 20 Hz. Empty cold baths do not scan the outdoor liquid. Entry and
changed water counts refresh immediately, and pending pours remain eligible for
sampling. Parked storage lookups visit only the basin's 256-pixel bins. Leaving
clears the GPU thermal field once; ordinary outdoor frames do not upload it.

Neighboring cells exchange equal and opposite energy. Motion measured from the
liquid solver increases mixing, as does an unstable warm-under-cold column.
A projected finite-volume flow transports heat with the measured circulation.
Upwind fluxes use a shared donor bound, conserving energy even at high speed.
Uniform temperature remains uniform. CPU and GPU interpolate occupied cell
centres, removing rectangular changes in buoyancy. Every diffusive exchange is
bounded by the two cells' equilibrium temperature. Remapping
the thermal field to changed liquid occupancy preserves its total energy;
cold inflow increases capacity without adding energy, and spills remove their
share of sensible heat. This is a reduced thermal model coupled to particle
motion, not a fully resolved three-dimensional CFD or chemical simulation.
The field uses a finite-volume mean when remapping, so it does not track a
separate saved temperature on every liquid particle.

Both CPU and WebGPU use the same thermal field for Boussinesq buoyancy, relative
to the bulk water temperature. Warm regions rise and cooler regions sink.
Uniformly warm water has no upward thermal force. The acceleration is bounded
to 18 world px/s squared, substantially below gravity. Snow is excluded from
thermal forces, heating capacity and evaporation, retaining its separate
water-contact and weather melt rules. Other liquid identities remain intact;
this change models their sensible heating, not boiling or burning chemistry.

## Steam

Only actual water can evaporate. Warm surface cells accumulate a fractional
mass credit, then remove whole particles through the normal CPU/GPU mutation
journal or from parked water. The same operation debits latent and sensible
energy. Near boiling, excess bottom heat reaches the surface and vaporizes
water rather than increasing the local water temperature indefinitely.
Remaining fractional mass credits are bounded and do not become saved water.

`074-bath-vapor.js` receives only actually evaporated mass. A small reservoir
releases each removed particle over time, smoothing quantized evaporation into
continuous emission. A separate bounded air grid advects heat and vapor, solves
pressure and adds temperature-dependent buoyancy. Curl confinement recovers
rotation lost to coarse sampling. Cooling makes vapor visible as translucent
condensate, and room-air mixing thins it. There are no bubble sprites, puff
sprites, scripted oscillations or synthetic smoke emissions. Guest splashes
push the existing airflow. Cold water and oil cannot generate steam.

The air field runs at 30 Hz only while the bath is visible and contains vapor;
mobile uses larger cells. One smoothed canvas upload displays the field. It
works with both liquid backends, has no GPU readback, and never retunes the
outdoor smoke. Outdoor exhaust is paused and its DOM layers hidden in the
bath, so it cannot appear as unheated steam or drift across the water. The receiving liquid backend explicitly disables the legacy
heater, lift and pink tint even if it initializes after room entry.

The copper lining and rim change color with `copperC`, including retained heat
after the fire goes out. Warmth starts subtly above 30 C; a brighter stylized
glow builds above 90 C. This is game temperature feedback rather than a literal
blackbody emission spectrum. Water has no painted heat band.

## Persistence and checks

Bath save version 7 includes thermal grid energy and capacity, copper
temperature, cumulative vapor mass and energy accounting. Legacy normalized
warmth migrates once onto the existing water volume. It never spawns water.

Run `node tools/test-bath-thermal.cjs` for cold-water invariance, equal-and-opposite
mixing, the heat budget, cold dilution, persistence, exact vapor mass removal,
latent heat, and water/oil/snow separation. GPU boot must also compile and execute
the expanded thermal uniform with no shader errors. Existing resting-pond
checks remain necessary because the thermal hooks live in the shared solver;
their disabled path leaves ordinary outdoor water unchanged.

The browser smoke check is `node tools/bath-thermal-smoke.mjs`; repeat with
`CPU=1` for the fallback. It serves a fresh fragment assembly, owns its Chrome
for Testing process, checks shader warm-up and a finite heated field, and checks
that evaporated particles produce a visible air field. `LIVE=1` also measures
the running bath; `BUNDLE=1` verifies the exact assembled release. Screenshots stay under `/tmp`.


The September 26 verification passed all 11 thermal groups and heated-bath
browser runs on CPU and WebGPU. The older outdoor settling assertions require
the test-only `CALM_MAX=1`; shipped `0.45` intentionally prevents sleep. With
that test profile, the GPU shore reached 99.47% asleep and the floating fixture
98.64%. Its peak 10.38 px/s narrowly missed the historical below 10 threshold.
The CPU floating fixture also failed on unchanged HEAD. This change leaves
outdoor tuning intact; it does not resolve those baseline settling limits.

`node tools/test-bath-vapor.cjs` checks the real-mass emission reservoir,
buoyant rise, rotational airflow, nonnegative fields, water exclusion and
outdoor inactivity. It runs the numerical functions in their normal lexical
scope; a VM global proxy is not a representative performance measurement.
