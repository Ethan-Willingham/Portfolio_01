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

Rainwater touching dirt soaks away gradually. Only a six-pixel contact film
drains, including along shaft walls and ceilings; water above it still falls
and spreads through the real solver. A small darkened edge and a receding
glint show the damp soil, then fade over six seconds. Stone, ore and foundation
blocks do not absorb it. Ponds, minerals and water already collected and poured
by the player keep their usual behavior.

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
the rain reservoir targets 6,000 particles on WebGPU, or 2,400 with the CPU
fallback. At capacity, offscreen rain is recycled first, followed by gradual
recycling of live rain. Ponds, mineral deposits, poured water and water already
collected into the scoop are never recycled by this system. The storm leaves
4,096 slots free in the shared solver for other liquids.

Rain outside the solver's camera window is parked at its actual coordinates.
Parked rain touching dirt still drains, so leaving the area cannot preserve
a puddle that should have soaked away.
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

Dirt contact reuses the existing 160 ms occupancy scan and liquid readback.
Its removal probability is `1 - exp(-2.8 * elapsedSeconds)`, independent of
frame rate. It checks only rain, using at most four tile probes per candidate.
The damp effect merges contacts into eight-pixel face segments with a hard
256-entry cap. It uses the current dirt and weather palettes, plain paths,
and no extra simulated particles, gradients, canvases or terrain rebuilds.
Terrain edits invalidate wet marks. The real draw is included in shader warmup.

Integration points: 040 initializes the new world's choice, 047 saves it,
052/053 expose it in Options, 155 supplies clouds and the precipitation draw
dispatch, 350 ticks rain after liquid readback and before the water solver,
and 046 warms the actual rain renderer under the loading cover.

Run `node tools/sluice-rain-smoke.mjs`. It owns a disposable Chrome for Testing
process and saves visual checks under `/tmp/sluice-rain-qa`. It checks native
menu activation, fresh worlds, CPU and GPU paths, collision through an open
shaft versus a sealed roof, collection, persistence, budget pressure, pause,
desktop and mobile layouts, gradual dirt absorption, wall contact, protected
materials and liquids, parked drainage, wet-mark cleanup and budget, and
drainage at 30, 60 and 144 FPS. Screenshots do not belong in the repository.

Validation for v28.6: `node tools/sluice-rain-smoke.mjs --soak` passed with
no runtime or shader errors. The live WebGPU storm processed more than 47,000
drops and soaked more than 44,000 into dirt. During the sustained sample,
settled rain stayed around 2,700 to 3,700 particles without reaching its cap.
A 240-frame desktop sample measured 16.7 ms median and 16.8 ms p95 on the test
Mac. Rain's CPU update measured 0.1 ms median and 0.5 ms p95; this excludes
GPU solver and rendering cost. After one second of dirt contact, a controlled
2,000-particle puddle had 158, 171 and 177 particles left at 30, 60 and 144 FPS.
These are local measurements, not a performance guarantee for other devices.
Liquid-transfer conservation tests also passed.
