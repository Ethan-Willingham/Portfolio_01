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
| `LIQUID_SNOW_DENSITY` | 1.1 | About 3.6 times water's resting volume per particle |
| `LIQUID_SNOW_STIFF` | 1.25 | Softer pressure response under compression |
| `LIQUID_SNOW_SHEAR` | 32 | Dissipates internal shearing instead of storing spring energy |
| `LIQUID_SNOW_DRAG` | 5 | Settles lateral movement after disturbance |
| `LIQUID_SNOW_FRICTION` | 180 | Frictional yielding holds small piles against sideways creep |
| `LIQUID_SNOW_BOUNCE` | 0.025 | Soft terrain contact |

This is a dry granular tuning of the existing solver, not a full snow-crystal
or temperature simulation. There is no separate snow heightfield or rigid
snow platform. Tiny pressure disturbances settle; track and jet forces can
exceed the friction threshold. The GPU kernels and their CPU/f32 references
use the same material parameters.

Slow atmospheric flakes retain the rain system's inexpensive ballistic
approach until their first contact, then become actual solver particles.
Their lateral flutter and turning silhouettes follow the existing wind.
The solver draws settled and thrown snow as matte overlapping grains in its
existing particle pass. They never enter the glossy water surface pass.
Lighting follows daylight and moonlight. There are no new textures or canvases.

## Thaw, storage and limits

A new world starts with a light dusting and a gentle snowfall. The opening
front lasts about a minute. Later fronts last 55 to 80 seconds, separated by
120 to 190 seconds of milder fair weather, with cloud buildup and clearing.
Warm air gradually thaws the snow. Foundations, jet exhaust and contact with
a body of water accelerate thaw; a few droplets do not dissolve an entire pile.
The rig's warm scoop collects snow directly into its water chamber.

Melting changes material 5 to water in place, retaining the GPU's current
position and velocity. One snow particle is exactly one water particle.
The ordered identity-change operation cannot duplicate or teleport it.
A full weather-water reservoir defers melting with the snow intact. Meltwater
uses normal water physics, including soil absorption and finite lake storage.

Active snow is capped at 18,000 particles on WebGPU or 5,000 on CPU, with
1,800 airborne weather flakes and a 60,000-particle total snow allowance.
Offscreen particles are parked at their real coordinates and velocities;
returning to the area restores them into the same solver. Parked snow can
thaw into parked water. The shared solver reserves 4,096 slots for other liquids.
Snowfall pauses when its budget is full. Ground beyond the visible snowfall
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
It also tests live GPU absorption for ordinary, poured, pond and rain water.

`node tools/perf/liquid-materials.mjs --gpu` verifies the five existing liquids
and snow together through GPU identity packing, physics and readback. Run
`node tools/sluice-rain-smoke.mjs --drain` for rain, finite lakes, plow protection,
soil contact, stored-water drainage and a resting puddle on the live solver.
