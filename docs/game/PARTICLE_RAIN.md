# Particle rain

Pause > Options > World > Particle weather > Rain, then start a new game from
the pause menu. The mode belongs to that world and survives save loading.
Changing the option only changes the next new game. Existing saves without
the rain field stay dry. `?rain=1&nosave=1` starts a disposable rain world.

Each airborne drop represents one water particle, follows wind and terminal
velocity drag, and transfers exactly one particle into the existing water
solver when it strikes terrain, the rig, or a liquid surface. Drops pass
through open shafts and stop at solid roofs. The scoop can collect the
resulting water, and it can fill a bath or mix with mineral liquids.

Water in a rain or snow world touching dirt or town foundations soaks away gradually. Only a six-pixel contact film
drains, including along shaft walls and ceilings; water above it still falls
and spreads through the real solver. A small darkened edge and a receding
glint show the damp soil, then fade over six seconds. Foundations use the same
absorption rate without the soil stain. Stone and ore retain water. Mineral liquids keep their usual behavior. Scooping, pouring or spilling water
from a pond does not make it waterproof. The actual stone lining retains lake
water; an old lake rectangle does not protect water touching exposed dirt.

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

New rain worlds open with 55 to 80 seconds of fair weather, then 20 seconds
of gathering clouds. Showers last 35 to 55 seconds, easing in and out over
seven seconds with smaller travelling gusts. Clearing clouds last 20 seconds;
later fair spells last 150 to 240 seconds. The existing cloud palette, wind
and rain ambience follow the same front. It rains even in the cold starting
biome. Ordinary worlds keep their existing weather. Pause freezes the weather,
and the banya has its own weather. The current phase and elapsed time persist.
The development override `?wmood=4` locks steady rain for testing.

The same front covers the entire outdoor map. A sky rectangle extends 160
world pixels beyond the view and fills newly exposed strips during sideways
flight, climbing, descending or zooming. Rain is already falling when another
area comes into view, at any altitude. Existing drops keep their world positions
in the overlap; the rig's wake is not refilled. Top and upwind edge emission
sustain the density between camera movements. Snow uses the same bounds and
coverage calculation, with its own fall speed and particle budget. A snow
world suppresses rain drawing, and cached atmospheric snow cannot thaw into
water overhead. Physical snow can still melt from local heat after contact.

Rain worlds generate three small lakes, six to eight tiles wide and two deep.
Stone walls and floors retain water while neighboring dirt absorbs it. Each
starts at 16% of its nominal capacity, about ten pixels of water. The near-town
lakes sit outside the station and bathhouse approach. This layout replaces the
ordinary pond-style choice for rain worlds; non-rain worlds keep that choice.
Existing worlds retain their saved terrain and pond behavior.

These lakes are finite. Scooping lowers them, and streaming or reloading cannot
refill them. Stored lake water is excluded from rain recycling. Offscreen
basins collect the same shower using width and intensity accounting, placing
water at rest spacing without running fluid physics. Only the portion outside
the emitted rain strip receives this accounting, to avoid counting visible rain
twice. A broken stone wall or floor disables offscreen catchment until repaired;
visible water still uses the ordinary solver and can escape through the breach.
Full offscreen basins stop collecting at their brim. Visible rain can overflow
onto the absorbent soil. Poured liquid also counts toward available capacity.

## Limits of the experiment

This is a local, finite water cycle, not a planet-wide flood simulation.
Only nearby sky needs active drops to present that map-wide storm. Drops
leaving the padded view return to the atmosphere before newly exposed sky
uses the budget. Up to 1,800 drops can be airborne;
loose rain targets 6,000 particles on WebGPU, or 2,400 with the CPU
fallback. Lake water has a separate finite allowance within a 40,000-particle
hard storage cap for all settled rain and airborne drops. At capacity, offscreen rain is recycled first, followed by gradual
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

`js/sluice/156-particle-weather.js` owns the shared rain/snow sky bounds and
newly exposed strips. `157-particle-rain.js` owns the simulation, drawing, persistence,
residency and budget. `158-rain-lakes.js` owns the front schedule, lake generation
and offscreen catchment. Rain uses liquid origin 3; origin 0 is persistent world
and poured liquid, and origins 1 and 2 are streamed pond water and oil.
All adds and removals use the existing ordered CPU/GPU mutation journal.
`window.__particleRain.stats()` exposes counts without enabling cheats.

Dirt and foundation contact reuse the existing 160 ms occupancy scan and liquid readback.
Its removal probability is `1 - exp(-5.5 * elapsedSeconds)`, independent of
frame rate. It checks all ordinary water, using at most four tile probes per candidate.
A ready GPU mirror is consumed before the scan. Parked poured water uses the
same contact rule when its storage region is visited. Dry snow stays frozen
until the snow material changes into water.
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

Add `--lakes` for before/after/clearing lake screenshots and a live GPU check
that rainfall raises the water. The standard run also checks the dry opening,
front schedule, mid-shower persistence, offscreen filling, finite lake save/load,
scooping and revisiting, lining breaches, protected storage, and foundation
absorption. The v28.18 run passed with no runtime or shader errors; the original
plow and deep-puddle drainage checks also passed.

Snow uses the same weather and meltwater storage through a separate material
simulation. See [PARTICLE_SNOW.md](PARTICLE_SNOW.md). Existing rain saves retain
rain; choosing Snow only changes the next new world.

`node tools/sluice-weather-coverage.mjs` checks both modes across distant map
locations and high flight, underground gating and rain/snow exclusivity.
Add `--cpu` for the fallback. `node tools/test-snow-coverage.cjs` also checks
continuous sideways rain and snow coverage with reversals and budget pressure.
