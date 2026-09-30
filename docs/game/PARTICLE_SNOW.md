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
Its quiet 120-second capture still sampled a 15.92 ms liquid/snow chain.
The capture used a different input schedule from the v28.129 capture above;
the numbers are not a matched performance comparison.

The next structural prototype should bound work in fully disturbed snow:

- Retain each grain's identity, position, velocity, aerodynamic size and mass.
- Use a separate fixed-stencil GPU compression and friction field for packed
  regions. Do not substitute an averaged grid velocity for particle velocity.
- Keep exact pair contacts where the complete nearby candidate set fits a
  small fixed bound. Overflow must select the packed approximation, never
  discard neighbors or material or return to an unbounded dense pair scan.
- Replace the shielding neighbor scan with bounded occupancy samples too.
- Keep the existing terrain, rig and resident collision geometry. Preserve
  independent release, flight, landing, scoop, melt and save behavior.

Scalar density projection alone can lose static pile friction and look fluid.
The prototype needs unilateral compression, pressure-limited shear resistance,
boundary capacity, a coincident-grain tie-break without launch energy, and
smooth transitions between packed and sparse regions. Test these before
rollout, including deep quiet piles, support removal, rotation/translation,
jet erosion and returning powder. Sleeping is a later optimization for quiet
interiors; it cannot bound a pile that jets or slimes have fully awakened.

Require timestamped full-chain measurements at the active material limit,
moving-boundary stress cases and a real 120 Hz ordinary-game capture before
claiming the performance goal. Correctness fixtures may position materials
and boundaries; ordinary FPS evidence must keep the natural residents.

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
