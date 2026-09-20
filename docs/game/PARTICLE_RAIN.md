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

Driving along the ground gathers a small bow wave. At speeds above 12 pixels
per second, the rig protects at most 96 rainwater particles within 48 pixels
ahead of the advancing track and 18 pixels above ground contact.
Excess water and water behind the rig keep soaking into dirt during driving.
Compressed water is protected even when briefly stationary. After stopping,
the pocket holds for 0.12 seconds; water still moving above 12 pixels per second
can finish its wake for up to 0.45 seconds. Then normal soaking resumes. Flying
does not renew the pocket, and distant dirt keeps absorbing throughout.
Reservoir recycling also skips this pocket; the overall rain cap stays the same.

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
Its removal probability is `1 - exp(-5.5 * elapsedSeconds)`, independent of
frame rate. It checks only rain, using at most four tile probes per candidate.
The damp effect merges contacts into eight-pixel face segments with a hard
256-entry cap. It uses the current dirt and weather palettes, plain paths,
and no extra simulated particles, gradients, canvases or terrain rebuilds.
Terrain edits invalidate wet marks. The real draw is included in shader warmup.
The plow pocket uses one shared rectangle and expiry times, checked in that
same scan. It adds no per-particle state or liquid readback.

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
Add `--plow` to drive through live GPU rain, measure the moving bow wave, and
capture driving and settled views. Controlled checks cover both directions,
stopping, flying, distant dirt, and reservoir recycling of other rain.
Add `--drain` to test a sleeping 2,000-particle puddle on dirt with new rainfall
stopped, checking that all its layers settle and soak away in the live solver.

Validation for v28.11: `node tools/sluice-rain-smoke.mjs --plow --drain`
passed with no runtime or shader errors. The live GPU drive retained a small
crest and left a thin wet surface after stopping. Both directions, the 96-particle
protection limit, drainage behind the rig, short expiry and reservoir cap passed.
A controlled 2,000-particle contact film had 17, 15 and 14 particles left after
one second at 30, 60 and 144 FPS. A deeper sleeping puddle had only 7 of its
2,000 particles left after two seconds, versus 135 with the old tuning, and
none after four seconds. Rain's CPU update measured 0.1 ms median and 0.3 ms
p95 in the final run, excluding GPU solver and rendering cost. These are local
measurements, not a performance guarantee for other devices.
