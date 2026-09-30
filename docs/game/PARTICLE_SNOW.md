# Physical snow

Since v28.118, deposited snow uses independent grain contacts through lifting,
flight and landing. It stays in the same particle store throughout. The former
liquid-grid velocity transfer and GPU-readback-triggered airborne handoff made
flat beds lift as coherent sheets and then change falling speeds together.
The mixed weather cycle, protected cloudy interval, snow scoop and
water/cloud-only thaw remain.

Pause > Options > World > Particle weather > Snow first starts a new world
with snow. Rain first opens with sunshine before the first rain front. Both
then cycle through sunshine, gathering clouds, rain or snow, and dry cloudy
breaks between fronts. Existing rain and snow saves join this mixed cycle on reload,
keeping their current front and all deposited material. Old column-based snow
saves migrate to individual particles, keeping their water equivalent.
`?snow=1&nosave=1` opens a disposable world starting in snow.

Snow remains internal material 5 in the existing particle storage, renderer,
mutation journal, tools and saves. It does not contribute to liquid pressure,
liquid grid velocity transfers or liquid declumping. WebGPU advances each grain's
own velocity under gravity and resolved airflow, with unilateral contacts:
touching grains resist compression, while separated grains exert no force on
each other. Position corrections do not become launch velocity. Atmospheric
weather flakes use inexpensive ballistics until their first contact; physical
powder from older saves rejoins the persistent grain store without losing mass.

## Material tuning

| Parameter | Value | Effect |
|---|---:|---|
| Physical grain diameter | `2.5 / sqrt(3.2)` | About 1.4 world pixels at rest |
| Render diameter | 1.8 | Consistent grain size in flight and piles |
| Gravity | 600 px/s squared | Same force through takeoff and landing |
| Drag size | Stable 0.3 to 1 per grain | Distinct aerodynamic response |
| Terminal speed | `32 + 42 * size` px/s | Continuous exponential drag |
| GPU contact iterations | 5 per grain tick, currently about 332 ticks per second | Resolve compression without cohesion |
| Contact friction | 0.35 | Tangential impulse limited by normal impulse |
| Terrain restitution | 0 | Contact does not bounce snow upward |

The solver integrates gravity and drag analytically over each substep.
Airflow acts at each grain's current position, including a continuous local
approximation of grain-scale lift near the ground. Neighbor geometry shields
buried grains from incident airflow. Contact support never switches this force
on or off. Terrain contacts
cancel inward normal velocity and preserve sliding subject to friction.
Jets and blasts move the grains without adding heat. There is no prescribed
flight arc, density-dependent fall mode, or transfer into CPU weather flakes.
GPU readback is used for tools, persistence and melting, not motion decisions.

The existing additive snow-density render channel remains. Each grain adds a
fixed compact kernel (3.2 world-pixel radius, peak 0.34). Body opacity blends
over densities 0.58 to 1.25; 1.8-pixel grains remain visible through the
0.62 to 1.30 blend. A solitary flake stays below the surface threshold.
The density gradient supplies diffuse shading, without water gloss or foam.
WebGL and Canvas retain fine grain rendering. Lighting follows daylight and
moonlight with the existing pale tint. Rendering never joins particle motion.

Snowfall emits 345 grains per second at full intensity over the reference
width, three times the former rate. The denser rest spacing keeps the smaller
grains together in piles without making each storm three times as deep.
The initial dusting uses two or three closely spaced rows.

Snowfall samples one moving world-space field, with a simulation window padded
160 world pixels beyond the view. Three settling speeds and independently
jittered positions prevent rows. A stable per-flake rank selects the same
fraction of that field everywhere as the storm builds. During clearing, the
source loses at most 0.02 intensity per second: a 65% front takes at least
32.5 seconds to stop supplying flakes. Visible flakes are never removed to
reduce density; they finish falling, land or get collected. Retirement happens
at least 96 world pixels beyond the view, inside the larger simulation margin.
Climbing into the thinning source can reveal a gradual density change, with
no visible culling edge. The source strength belongs to the world and persists
through saves and underground travel. Offscreen lake catchment follows it too. Camera movement never translates existing
flakes or refills the rig's wake. There is no altitude cutoff.

`156-particle-weather.js` supplies the same field logic for rain. It remembers
consumed source particles until their source leaves the window, so a landed or
scooped flake cannot appear twice. Unlanded weather leaving the window returns
to the atmosphere instead of waiting in frozen offscreen strips. Revisits sample
the current storm. Deposited and scooped material retains its mass; lofted
physical powder is stored if it leaves the window. `recycled` counts retired
weather. The legacy `parkedAirborne` statistic remains zero.

The v28.42 coverage test ramps intensity while waiting, then moves to unvisited
sky. The old implementation produced 33 versus 197 flakes near the rig. The
new field produced 1,239 versus 1,240 across the full test view, with similar
counts in all twelve horizontal/vertical bins. Later clearing checks preserve
visible particle identities, audit the position of every retirement during
climbing and reversal, and wait for the remaining flakes to fall out naturally.

## Jet airflow

`159-snow-air.js` solves a local 64 by 64 staggered MAC grid at 12 world pixels
per cell. The inlet follows the actual banked nozzles and thrust intensity.
Its spreading downwash extends 600 world pixels beyond the nozzle, fading
out over the last 140 pixels. Terrain still blocks each inlet sample.
High flyovers can disturb the ground well beyond the visible flame.
Semi-Lagrangian velocity advection and a 28-iteration red/black pressure
projection resolve the impinging jet, lateral wall flows and returning eddies.
Terrain and the rig block normal flow. A second projection uses the inlet
momentum before the terrain-only projection and the actual snow boundary.
The GPU splats current resident particle positions into this grid, so delayed
CPU readback cannot hold up the surface.
Bilinear occupancy gives a smooth transition from loose flakes to a packed bed.
Face permeability follows the open fraction; a 60-iteration pressure correction
turns downwash along the snow surface. Particle drag samples the velocity in
that open fraction. Surface lift is bounded at 460 px/s and derives from both
wall shear and the normal momentum stopped at impact. The same field extends
above the pile and carries grains after they separate.

The moving window preserves overlapping
world-space face velocities instead of dragging its wake with the camera.
The airflow decays after thrust stops and idles after three seconds.
The snow coupling fades through the outer 30% of a rounded influence area,
with lateral reach of 348 pixels and downward reach of 576 pixels from the
rig's feet. This trims the old reach modestly while leaving the inner wake
unchanged. The grid's outer four cells also blend to ambient air. Weak-flow
drag and the onset of surface release ease continuously, so crossing the
fringe cannot suddenly apply full drag or switch on a strong flurry.

Banked flight feeds the real nozzle direction into the air solve. Grain drag
samples the projected flow and a bounded approximation of turbulent surface
lift below the air grid's 12-pixel resolution. That contribution fades with
height and local flow, reaching zero away from terrain or packed snow and in still air.
It is applied continuously, with no contact-state or flight-mode gate.

Nearby grains shield each other from incident air. Each grain measures
upstream overlap within 2.5 physical diameters and attenuates local airflow by
`exp(-occlusion)`. The direction points toward the active nozzle region,
or upstream into local wind when thrust stops. Exposed grains erode first;
the same jet cannot accelerate a whole buried bed as an unbroken sheet.
Shielding changes smoothly as particles separate. Gravity is never attenuated.

The GPU contact iterations use immutable position and velocity snapshots.
They remove inward velocity when correcting penetration, without converting
correction into outward velocity.
Terrain, moving rig and bath boundaries constrain particles independently.
Snow shares storage with water but contributes no liquid-grid mass or velocity.
No decorative particles or prescribed flight arcs are created.

This is a 2D granular approximation with porous airflow obstacles
and local shielding. It does not model ice-crystal bonds or a fully coupled
three-dimensional snow/air fluid. The particle render kernels remain unchanged.

## Thaw, storage and limits

A Snow first world starts with a light dusting and a gentle snowfall. Snow
fronts last 90 to 150 seconds. Rain fronts last 75 to 120 seconds, with a 55%
chance of thunder and lightning. Snow leaves 180 to 300 seconds of dry cloudy
weather for play; rain leaves just 30 to 60 seconds. Sunshine then returns for
120 to 210 seconds. Clouds then
gather over 35 to 65 seconds. Rain and snow have equal selection chances,
with no more than two consecutive fronts of the same kind.

Cloud cover keeps snow frozen throughout the cloudy break. As the actual
clouds part, exposed deposited snow gradually turns into water. Terrain roofs
shelter underground snow from this sky-driven thaw. Contact with water also
melts snow; oil and mineral liquids do not. Foundations, player proximity,
tracks, jets and tools supply no heat to snow. The scoop stores snow in its own
chamber and releases physical snow, preserving each grain through save/load.
Legacy five-chamber scoop saves restore with an empty snow chamber.

Deposited snow remains in its grain solver whether it touches the bed or is
fully airborne. It never transfers into the atmospheric flake array. The
5,400-flake weather limit therefore cannot trap or change physical snow.
The 120,000-grain total material budget still bounds all snow. Saving and
loading preserves physical positions, velocities and mass; parked grains
restore into the same solver when the view returns.

Melting changes material 5 to water in place, retaining the GPU's current
position and velocity. One snow particle is exactly one water particle.
The ordered identity-change operation cannot duplicate or teleport it.
A full weather-water reservoir defers melting with the snow intact. Meltwater
uses normal water physics, including soil absorption and finite lake storage.

Snow physics requires WebGPU. An unavailable or lost device stops the world
before it advances or autosaves and displays a reload message.
The solver is capped at 36,000 snow particles, with
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
from existing water, plus the field clock, drift and consumed source identities.
Older saves discard transient atmospheric patches and their stored sky water;
converting that cache into physical snow would preserve its uneven density. Current saves preserve
local meltwater, physical snow and collected/poured water. Pause freezes weather and thaw. Outdoor weather pauses
inside the banya. `window.__particleSnow.stats()` reports the shared-particle
model, active and parked counts, moving powder, collected mass and thaw.

## Verification

### Performance budget, September 30, 2026

The owner's target is 120 FPS during snow and resident handling on an M1 Pro.
That allows 8.33 ms for a whole frame. v28.129 is not verified to meet it;
the owner can still reach 12 FPS in a snowy town with residents.

The v28.126 owner capture and a no-water comparison identified snow contacts,
shielding and resident/terrain clearance as the dominant GPU costs. v28.128
and v28.129 made neighbor traversal and clearance cheaper without changing
particle contact answers, but retained the same unbounded dense work.

An ordinary v28.129 capture with the natural five residents sampled 29.77 ms
in the liquid/snow chain: 13.21 ms in grain contacts, 4.51 ms in shielding,
4.68 ms in clearance fallback and 2.77 ms in primary resident collision.
The contact grid held 2,844 occupied cells, with a maximum of 67 grains in
one cell; 2,707 cells held eight or fewer. The slowdown does not require an
extreme coincident particle knot. Each retained cell is scanned repeatedly,
and slow callbacks request more physics steps, adding catch-up work.

`SNOW_PROFILE=1 node tools/perf/test-ordinary-game.mjs` privately records cell
occupancy, maximum membership, membership histogram and sum of squared cell
counts alongside collision queues and GPU pass timings. These reads never
change production shader math. This sum is a density-work indicator, not the
exact number of tested neighbor pairs. Native headless callbacks are about
60 Hz on this host; their mean FPS cannot establish the owner's 120 FPS goal.

Snow currently rounds 1.445 grain ticks per water quantum up to two. With the
water playback multiplier this runs about 332 grain ticks per real second.
A private independent 240 Hz snow accumulator removes 27.7% of those ticks.
It passed the GPU gap, returning-powder and jet tests with five contact
iterations and unchanged material count. Constraint cadence changes, so this
prototype is not an exact-state optimization and has not been promoted.
Later deep-pile comparisons also found increased residual motion at 240 Hz:
20 world pixels of pile depth measured 1.80 px/s RMS and 32 measured
2.30 px/s RMS. These fixture depths are not counts of grain layers.
Its quiet 120-second capture still sampled a 15.92 ms liquid/snow chain.
The capture used a different input schedule from the v28.129 capture above;
the numbers are not a matched performance comparison.

The scaling measurements below supplied the baseline for bounded dense work.
The v28.130 candidate described below retains the existing compressive pair
response and friction, using weighted representatives in dense cells instead
of introducing a separate compression field. Each grain keeps its identity,
position, velocity, aerodynamic size and mass. Terrain, rig and resident
collision geometry remain. No averaged grid velocity replaces grain velocity.
Sleeping remains a possible later optimization for quiet interiors; it cannot
bound a pile that jets or slimes have fully awakened.

Require timestamped full-chain measurements at the active material limit,
moving-boundary stress cases and a real 120 Hz ordinary-game capture before
claiming the performance goal. Correctness fixtures may position materials
and boundaries; ordinary FPS evidence must keep the natural residents.

### Count and crowding sweep, September 30, 2026

The owner requested a measured scaling curve before changing the model.
The unchanged v28.129 GPU engine (SHA-256 beginning `cd9a7de2628a4061`)
was tested on the M1 Pro in an owned background Chrome for Testing process.
No resident was spawned, stacked or repositioned for the ordinary capture.

`tools/perf/snow-scaling.mjs` runs prediction, the fresh snow-only index,
four contact passes, final contact/shield and displacement tracking. It
excludes terrain, guests, water physics, air projection, rendering and CPU
gameplay. Nine counts from 500 through the 36,000 active-grain limit were
tested in three layouts: constant triangular spacing with growing area,
and fixed 80 by 80 and 40 by 40 world-pixel footprints. The fixed footprints
are artificial compression fixtures, not ordinary snow piles.

Each point has 32 warm-up ticks and 24 timed ticks submitted in one batch,
repeated in reversed order. Every tick starts from the same GPU records;
each count/layout includes every intended grain in the GPU index. Times
span the earliest positive-work pass begin to the latest end, including
inter-pass gaps. Compilation, seed resets and readback are excluded.
These are warm GPU measurements, not frame times or certified capacities.

| Grains | Constant spacing | 80 by 80 footprint | 40 by 40 footprint |
| --- | --- | --- | --- |
| 4,000 | 0.59 ms | 0.54 ms | 0.91 ms |
| 8,000 | 0.66 ms | 0.79 ms | 2.14 ms |
| 16,000 | 1.03 ms | 1.74 ms | 5.48 ms |
| 24,000 | 1.52 ms | 4.59 ms | 10.87 ms |
| 36,000 | 1.57 ms | 6.50 ms | 19.52 ms |

The table gives pooled medians across 48 samples, in milliseconds per grain
tick. At the same 36,000 grains, severe compression costs about 12.4 times
the constant-spacing layout. Constant-spacing cell membership remains at
six grains or fewer; the two fixed footprints reach 36 and 144 per cell.

The unbounded neighbor scan explains the direction of the curve: work is
proportional to the sum of each cell's membership times nearby membership.
At constant density this grows approximately with N. In a fixed area A,
it can approach N squared divided by A. GPU parallelism and fixed costs
change measured elapsed time, so this is not a strict timing law. The
40 by 40 fixture has a positive quadratic timing component and a quadratic
fit R squared of 0.998 versus 0.979 for a line above 4,000 grains. This
supports superlinear dense work; it does not establish an exponential law.
From 4,000 through 36,000 grains (nine times N), the measured 5 by 5 cell
candidate-work envelope grows 9.5 times at constant spacing and about
79 times in either fixed footprint. This proxy is not an exact pair-test
counter, but distinguishes the near-linear and near-quadratic work curves.

A separate 120-second ordinary capture used normal snow, water, smoke and
the five natural residents. It fell to 18.0 FPS around 12,416 active snow,
then recovered to 60.0 FPS with 13,893. The final captured state, after
recovery, supplied 13,932 GPU snow records and 7,208 water records for
`tools/perf/snow-town-scaling.mjs`. This replay holds the actual terrain,
resident poses and uploaded uniforms fixed, and thins only snow using
nested position/index-hash subsets. It does not manufacture more grains.

The complete captured-town snow tick includes production terrain, guest
union exits, fallback and motion tracking. Median spans were 2.09 ms at
4,000 snow, 2.74 ms at 8,000, and 3.48 ms at 13,932. Prediction and each
contact receive their original boundary passes. Water records are retained
unchanged, but water physics, rendering, CPU gameplay and active air are
excluded. Diagnostic pass splits and dispatch-count copies add overhead.
This replay is a controlled end-state measurement, not the worst FPS state.

At 120 FPS, current scheduling requests two or four snow ticks per frame.
Four repetitions of the captured 13,932-grain cost give about 13.9 ms,
exceeding the entire 8.33 ms frame budget. This is a budget illustration,
not a production lower bound or four evolving ticks. Slow callbacks can
request ten ticks, compounding the slowdown. The natural capture's worst
second also spent 13.2 ms on CPU work, including 5.3 ms in jello and 4.3 ms
in rain/snow updates; nested profiler buckets must not be added together.
Bounding neighbor work alone does not remove all of these costs.

There is no single verified safe snow count. Count, local compression,
boundary contacts, tick scheduling and the rest of the game all matter.
The active 36,000 limit is a storage/admission limit, not a 120 FPS promise.
The ordinary capture has a roughly 60 Hz headless callback ceiling and
private instrumentation, so it cannot verify sustained native 120 FPS.
These v28.129 results established the need to bound contact/shield work and
reduce repeated boundary and catch-up costs. The v28.130 measurements below
are preliminary comparisons, not a completed whole-frame performance result.

### v28.130 bounded GPU contacts

v28.130 bounds dense contact and shielding queries without
deleting, merging or handing off physical snow. Each grain retains its own
position, velocity, mass and aerodynamic size, including during release,
flight, landing, collection, melting, parking and saving.

A queried cell containing at most 16 other grains keeps exact pair traversal.
Larger cells divide the complete other-grain rank range into eight integer
strata. Each stratum supplies two representatives at complementary offsets;
each representative carries half that stratum's population weight. The
querying grain's sorted rank is excluded before choosing representatives.
Weights sum to the full other-grain population, and the same weights enter
compression, normal and tangential impulses, contact normalization, density
and shielding. This is a dense force approximation, not an exact contribution
from every individual neighbor. Every physical grain remains in the solver.

Production uses the spatial shader entries and examines at most 16
representatives per accepted cell across a fixed 25-cell stencil. That bounds
each contact or shielding pass to 400 representative evaluations per grain,
or 2,000 across one five-pass grain tick. Expanding cell displacement bounds
can relax trimming but cannot expand the stencil or sample count. The scalar
shader entries retain exact traversal for diagnostics. Sparse queries remain
exact; dense query work no longer grows quadratically with cell population.
Index construction and prediction still visit every grain, and catch-up can
request multiple grain ticks. These bounds do not promise 120 FPS.

The existing compression-only pair law, friction coefficient and world-frame
velocity reconciliation remain. Positional correction removes inward motion
without converting overlap recovery into an outward launch velocity. A
neighbor-frame reconciliation was rejected after increasing deep-pile motion.
The independent 240 Hz clock was also rejected; production keeps the existing
grain cadence and five contact iterations.

Resident clearance now reuses a failed primary evaluation, and terrain
clearance has a bounded 2 by 2 tile all-clear shortcut. These are exact-answer
shortcuts rather than snow force approximations. The combined collision
comparison passed 37 GPU cases and 146 checks against the original answers.

Final warm-GPU measurements of the release engine (SHA-256 beginning
`abdfe2a1826ba3a8`) gave these pooled medians over 48 samples per point:

| Fixture | v28.129 | Bounded contacts |
| --- | --- | --- |
| 36,000 grains, 40 by 40 footprint | 19.5233 ms | 3.4547 ms |
| 36,000 grains, constant spacing | 1.5709 ms | 1.7238 ms |
| Frozen natural town, 13,932 grains | 3.4759 ms | 2.6905 ms |

The compressed fixture cost fell 82.3%, and the frozen town cost fell 22.6%.
Constant-spacing snow at the active limit incurred 9.7% overhead. The first
two fixtures exclude boundary work; the town replay includes it. All three
reset frozen particle states between ticks and omit complete game frame costs.
The 40-pixel compression curve now fits a linear model with R squared 0.981;
adding a quadratic term gives essentially the same fit. The bounded query
count is an algorithmic guarantee; exact wall time still depends on memory
access, cell coverage and GPU scheduling. There is no universal safe count.

Two serial 120-second ordinary-game captures used the same v28.130 bundle,
seed 48271, 680 by 764 viewport at DPR 2, five natural residents, normal water,
snow and stock smoke. Only the GPU engine changed. No resident was spawned,
repositioned or forced to overlap, and no input was injected. The deeper
`SNOW_PROFILE` instrumentation was disabled in both runs. The v28.129 engine
averaged 52.62 FPS and reached a minimum full-second rate of 11.00 FPS with
12,066 active grains. The release engine averaged 59.98 FPS, with a minimum
of 59.08 FPS. It ended with 11,471 active grains versus 13,403 in the reference;
total snow mass was 33,920 versus 33,818. Evolving positions, parking and
random consumption vary with cadence, so these are matched settings rather
than identical trajectories. The fixed-state town comparison separately holds
positions, guest geometry and material records constant.

The sampled liquid/snow pass totals and native traces are retained with the
raw measurements in `Downloads/sluice-snow-bounded-2026-09-30`. The capture's
callbacks topped out near 60 Hz, and it does not exercise the owner's hardest
jet and drag route. It verifies improvement in this run, not the owner's
120 FPS target. Keep that target open for native high-refresh gameplay.

Contact fixtures retained material identity, finite state and zero invented
kinetic energy during coincident recovery. The common-velocity fixture keeps
the baseline limitation unchanged: both versions measured a maximum velocity
error of 21.424 px/s. Sampled approaching clusters measured 0.6299% momentum
error, within that fixture's 1% tolerance. These results do not establish
general momentum conservation or every physical-law invariance.

Deep-pile comparisons used fixture depths in world pixels, not counts of
grain layers. The bounded solver retained the same emitted populations:

| Depth | Grains | Baseline RMS speed | Final-combination RMS speed |
| --- | --- | --- | --- |
| 3 px | 516 | 0.083 px/s | 0.104 px/s |
| 7 px | 1,290 | 0.554 px/s | 0.553 px/s |
| 12 px | 2,064 | 0.854 px/s | 0.855 px/s |
| 20 px | 3,612 | 1.434 px/s | 1.402 px/s |
| 32 px | 5,676 | 2.182 px/s | 1.996 px/s |

The old absolute 1 px/s quiet-pile gate also fails the baseline at 20 and
32 pixels, so the measured-reference run uses a limit of the greater of 1 px/s or
`reference RMS * 1.2 + 0.1`. This is a non-regression gate, not a claim that
all absolute rest gates pass. Contour, material mass,
unsupported release and jet gates passed for the final combination.

Hash phases are stable for identical particle IDs and sorted cell membership;
production atomic scatter can change rank order. Complementary sampling
reduces some quadrature noise but does not guarantee every individual
neighbor is selected over time. Estimated contact normalization and the
nonlinear shielding exponential can still change dense motion and erosion.
Keep these approximation limits distinct from the exact collision shortcuts
and verify ordinary play before claiming the owner's frame-rate target.

Run the tests sequentially so separate processes do not compete for the GPU:

```sh
SNOW_SNAPSHOT=1 SNOW_PROFILE=1 DURATION_MS=120000 \
  DUMP=/tmp/snow-capture node tools/perf/test-ordinary-game.mjs
node tools/perf/snow-scaling.mjs
SNAPSHOT=/tmp/snow-capture/resident-snapshot.json \
  node tools/perf/snow-town-scaling.mjs
python3 tools/perf/plot-snow-scaling.py \
  --grains /tmp/sluice-snow-scaling/report.json \
  --town /tmp/sluice-snow-town-scaling/report.json \
  --trace /tmp/snow-capture/trace.json --out /tmp/snow-analysis
```

The sweep scripts accept `DUMP` for their output directories. The plotting
script combines their raw reports and the native trace into a PNG, SVG,
CSV and analysis JSON; it requires NumPy and Matplotlib. Keep raw captures
outside the public repo.

`node tools/test-snow-support.cjs` checks persistent identity and momentum
with fresh and delayed GPU snapshots, weather admission spacing, legacy
powder migration, melting metadata and exact material budgets.

`node tools/test-weather-cycle.cjs` checks 600 fronts, phase durations,
protected cloudy snow, exposed thaw, water-only melting, shelter, player heat
exclusion and save migration. `node tools/test-snow-scoop.cjs` checks snow
collection, discharge, capacity, blocked outlets and storage accounting.

`node tools/sluice-snow-wave.mjs --only-jets` runs the flat-bed flyover in a
private Chrome for Testing process. It reads GPU resident particles directly and checks physical lofting, velocity
spread, absence of persistent slow arches, stable returning volume, zero
transfers into CPU weather flakes, and exact mass. Add `--snow` for the
mound with continuing snowfall. `--no-gpu` verifies that unsupported snow
worlds stop with a clear explanation. Artifacts remain under `/tmp`.

`node tools/sluice-snow-region.mjs` checks that offscreen resident grains
retain their exact positions and velocities, then resume contacts on re-entry.

`node tools/perf/liquid-materials.mjs --gpu` checks six-material GPU identity
and coexistence. `node tools/perf/snow-air.mjs` checks pressure projection,
recirculation, roof occlusion, moving-window continuity and shutdown.
`node tools/test-snow-coverage.cjs` covers atmospheric travel and budgets.

Older browser scripts that assert dense-to-powder handoff counts describe the
retired model. Use the persistent-grain tests above for motion regressions.
