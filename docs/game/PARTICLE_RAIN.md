# Particle rain

Pause > Options > World > Particle rain > On, then start a new game from
the pause menu. The mode belongs to that world and survives save loading.
Changing the option only changes the next new game. Existing saves without
the rain field stay dry. `?rain=1&nosave=1` starts a disposable rain world.

Each airborne drop represents one water particle, follows wind and terminal
velocity drag, and transfers exactly one particle into the existing water
solver when it strikes terrain, the rig, or a liquid surface. Drops pass
through open shafts and stop at solid roofs. The scoop can collect the
resulting water, and it can fill a bath or mix with mineral liquids.

The atmosphere uses ballistic particles until contact because isolated drops
do not need the dense liquid solver's pressure grid. The water solver handles
impacts, pooling and flow. The little impact crowns and expanding rings are
visual cues; they add no extra water. Droplet trails run behind their heads,
so the renderer does not paint a trail through the ground after a collision.

The storm has slow changes in intensity, smaller travelling gusts, three
drop-size bands, and the existing overcast cloud palette and rain ambience.
It produces rain even in the cold starting biome. Ordinary worlds keep their
existing weather. Pause freezes the storm, and the banya has its own weather.

## Limits of the experiment

This is a local, finite water cycle, not a planet-wide flood simulation.
Rain is generated near the visible sky. Up to 1,800 drops can be airborne;
the rain reservoir targets 24,000 particles on WebGPU, or 8,000 with the CPU
fallback. At capacity, offscreen rain is recycled first, followed by gradual
recycling of live rain. Ponds, mineral deposits, poured water and water already
collected into the scoop are never recycled by this system. The storm leaves
4,096 slots free in the shared solver for other liquids.

Rain outside the solver's camera window is parked at its actual coordinates.
Settled and parked rain are saved, with quarter-pixel position precision.
Airborne weather and short-lived impact graphics restart on loading. Water
collected and poured by the player enters the ordinary persistent liquid
system, so it leaves the rain reservoir. Buildings drawn behind the gameplay
plane are scenery; their painted roofs do not create new liquid colliders.

## Implementation and checks

`js/sluice/157-particle-rain.js` owns the simulation, drawing, persistence,
residency and budget. Rain uses liquid origin 3; origin 0 is persistent world
and poured liquid, and origins 1 and 2 are streamed pond water and oil.
All adds and removals use the existing ordered CPU/GPU mutation journal.
`window.__particleRain.stats()` exposes counts without enabling cheats.

Integration points: 040 initializes the new world's choice, 047 saves it,
052/053 expose it in Options, 155 supplies clouds and the precipitation draw
dispatch, 350 ticks rain after liquid readback and before the water solver,
and 046 warms the actual rain renderer under the loading cover.

Run `node tools/sluice-rain-smoke.mjs`. It owns a disposable Chrome for Testing
process and saves visual checks under `/tmp/sluice-rain-qa`. It checks native
menu activation, fresh worlds, CPU and GPU paths, collision through an open
shaft versus a sealed roof, collection, persistence, budget pressure, pause,
and desktop and mobile layouts. Screenshots do not belong in the repository.

Validation for v28.4: `node tools/sluice-rain-smoke.mjs --soak` passed with
no runtime errors. The live WebGPU storm processed more than 47,000 drops,
recycled more than 23,000, and held the combined airborne, live and parked
rain count at or below 24,000. At capacity, a 240-frame desktop sample measured
16.7 ms at both median and p95 on the test Mac. Rain's CPU update measured
0.1 ms median and 0.6 ms p95; this excludes GPU solver and rendering cost.
These are local measurements, not a performance guarantee for other devices.
Cloud cache tests and liquid-transfer conservation tests also passed.
