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

Neighboring cells exchange equal and opposite energy. Motion measured from the
liquid solver increases mixing, as does an unstable warm-under-cold column.
Every exchange is bounded by the two cells' equilibrium temperature. Remapping
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

The visible mist consists of condensed vapor parcels emitted by these actual
mass-removal events. Vapor is invisible at release, becomes visible as it cools,
rises with temperature-dependent buoyancy, drifts with a small room draft and
thins as surrounding air mixes into it. Boiling vapor events also seed small
rising bubbles. Cold water and oil cannot generate this mist. Guest splashes
move existing mist; they do not create white smoke. The room no longer borrows
or retunes the outdoor smoke simulation, and water has no artificial pink heat
tint. The canvas vapor renderer works with either liquid backend.

## Persistence and checks

Bath save version 6 includes thermal grid energy and capacity, copper
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
that evaporated particles produce visible mist. Screenshots stay under `/tmp`.


The September 26 verification passed all 11 thermal groups and heated-bath
browser runs on CPU and WebGPU. The older outdoor settling assertions require
the test-only `CALM_MAX=1`; shipped `0.45` intentionally prevents sleep. With
that test profile, the GPU shore reached 99.47% asleep and the floating fixture
98.64%. Its peak 10.38 px/s narrowly missed the historical below 10 threshold.
The CPU floating fixture also failed on unchanged HEAD. This change leaves
outdoor tuning intact; it does not resolve those baseline settling limits.
