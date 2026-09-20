# Physical snow

Pause > Options > World > Particle weather > Snow, then start a new game.
Rain and Snow are separate world choices; changing the setting leaves the world
in play alone. Existing rain saves remain rain. `?snow=1&nosave=1` opens a fresh
snow world for testing. `?rain=1` still opens the rain experiment.

A snow world starts with an uneven dusting and a gentle snowfall. Flakes fall
at roughly 32 to 74 world pixels per second, flutter sideways, turn in the wind,
and settle on actual terrain. They enter open shafts and stop at solid roofs.
The three small stone-lined lakes start low and remain liquid. Snow that reaches
water melts into it, including snow falling into offscreen lakes.

## Playing with it

- Drive through powder to compact a trail and roll a bank ahead of the tracks.
  Loose pieces break away, fly and settle again. Deep powder adds drag.
- Jet exhaust lifts powder sideways and warms the ground beneath it.
- Landings and bomb blasts throw real snow. Deep banks cushion falls, but a
  dusting does not make a dangerous fall safe.
- The scoop takes both settled snow and flying powder into the rig's warm tank
  as their exact water equivalent. It works through the existing desktop,
  controller and touch controls.
- Down pushes through the cover and drills the terrain as usual. Removing a
  bank's support makes it fall into the opening.

Cold fronts lay down powder. Milder dry spells thaw it; daylight accelerates
this, and the warm rig, exhaust, town foundations and contact with water melt
it faster. Meltwater enters the ordinary water solver, where it can be scooped,
flow into a lake, or soak into dirt and foundations. Packed tracks are denser
than fresh powder. Compression lowers their height without deleting material.

The opening snow front lasts about a minute. Later fronts last 55 to 80 seconds,
with 18 seconds of approaching clouds, 24 seconds of clearing and 120 to 190
seconds of milder fair weather. The same clouds and wind drive the flakes.
Snowfall keeps the quiet surface ambience rather than playing the rain loop.
`?wmood=4` holds snowfall; `?wmood=0` holds fair weather and thaw for checks.

## Material model and cost

`159-snow-physics.js` implements a hybrid simulation. Flying flakes and kicked
powder use ballistic motion with drag. Resting material uses sparse four-pixel
columns attached to the terrain ledge supporting them. A column stores water
mass, packing and accumulated heat. Fresh snow occupies more space than packed
snow; neither compression nor slope relaxation changes its water mass.

The material step runs at 20 Hz independently of rendering. Neighbor transfers
relax steep banks. Tracks press down the material under the rig and distribute
most displaced snow into a broader wedge ahead, with a smaller amount released
as powder. The rig sinks into the snow to a shallow supported position instead
of treating the bank as an impassable stone wall. Foot support has hysteresis
so compression and tiny track grooves do not continually toggle flight physics.

The system does not add a new fluid type or change the GPU water solver. Frozen
snow stays outside that solver until melting. One mass unit becomes exactly
one water particle, using the existing ordered CPU/GPU mutation journal. If the
water budget is full, melting waits with the snow intact. Snow is porous: water
can pass through a bank and accelerate its thaw. This is a gameplay material
model, not a temperature or fluid-pressure simulation inside the snowpack.

Snowfall beyond the emitted visible strip uses surface deposition accounting.
It deposits on actual terrain at the same precipitation rate without keeping
thousands of invisible flakes airborne. Camera movement does not erase snow.
Unseen lakes use their existing finite catchment accounting at the snowfall
rate. Buildings painted behind the gameplay plane remain scenery; their roof
art does not introduce a separate snow collider.

Limits: 1,800 airborne weather flakes, 384 disturbed powder grains, 8,192 sparse
bank entries, and 60,000 water-equivalent snow units. Banks stop accepting new
material around three tiles deep and spread it sideways. At the total snow
limit, new deposition waits for thaw or collection. The separate rain reservoir
still bounds meltwater and reserves 4,096 shared solver slots for other liquids.
All snow physics works with the CPU water fallback too.

## Appearance and persistence

`159-snow-render.js` draws connected banks, compressed grooves and three flake
size bands. Adjacent bank columns share edges. Flake silhouettes tumble rather
than stretch into rain streaks. Color follows the game's snow, cloud, moon and
sunset palette. Rendering uses batched paths with no new textures, blur passes,
terrain rebuilds or per-flake canvases. Both actual draw functions are warmed
under the loading cover.

Banks, packing, partial melt progress and moving grains are saved with the
world. Snow and existing liquid are serialized separately so melted mass is
never restored in both states. The weather phase and its progress persist too.
Pause freezes both snowfall and thaw; the banya leaves outdoor snow untouched.
`window.__particleSnow.stats()` reports budgets, packing, temperature and mass
transfers without enabling cheats.

## Verification

Run `node tools/sluice-snow-smoke.mjs --soak`. It owns a disposable Chrome for
Testing process and writes screenshots outside the repository under
`/tmp/sluice-snow-qa`. It checks native mode selection, boot and shader warmup,
day/dusk/night appearance, driving and compaction, powder, ordinary digging,
jet disturbance, pause, complete save/load, support removal, open shafts,
solid roofs, meltwater conversion, scoop conservation, full-solver behavior,
malformed saves, 30/60/144 FPS thaw, long snowfall, budgets, and mobile controls.
Run the existing `tools/sluice-rain-smoke.mjs` for rain regression coverage.
