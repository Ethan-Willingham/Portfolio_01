# Water machines

Release: toy v5.201. The 76 scenes formerly labeled Partly working now have
working controls, visible physical responses, and scene-specific browser checks.
Twenty water-network scenes use finite-volume inventories, head and flow
relations, and explicit pump work or losses. Other scenes use native water,
smoke and slime solvers or reduced physical models with finite inventories.
The workshop apparatus combine native solvers with reduced models. Candle and
chimney smoke transport is also verified against the native solver. Each
reduced scene describes its modeling boundary
in the scene itself. Full quantitative physical acceptance and steady 60 FPS
across every device remain unverified.

## Water rocket

The Water Rocket scene now uses a bottle with a launch stand, adjustable fill
and pressure, and a complete charge, release, coast and landing sequence. Its
separate flight model replaces the earlier native-pressure tank on a short
vertical guide. It keeps the existing scene URL and menu entry. The default
view shows feet, miles per hour and psi; Metric changes the displayed units.
Slow motion shares the host's playback speed, and the global pause and activity
controller freeze the existing state. Preparing another flight retains the
session's previous height and best result. The toolbar reset clears the session.

The rigid two-liter bottle has 0.145 kg dry mass, a 9 mm nozzle and a 105 mm
body diameter. Water discharge uses a coefficient of 0.86; quadratic drag uses
0.42 with ambient density 1.204 kg per cubic meter. These are declared model
parameters. The compressor adds ideal-gas mass at fixed temperature while the
latch holds the bottle. Release adds no impulse. Expanding dry air follows
P V^1.4; Bernoulli outflow removes actual carried water mass and produces thrust
from its exhaust momentum. Compressible air blowdown follows, including choked
nozzle pressure thrust. A fixed 1 ms step integrates gravity, thrust and drag.
The equations follow [Ohio University's water-rocket analysis](https://people.ohio.edu/urieli/thermo/property_tables/gas/adiabatic/rocket/rocket.html)
and [NASA's thrust summary](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-equations-summary/).

Every spray batch comes from expelled model water, partitioned into visible
ballistic parcels. The camera follows calculated altitude and keeps the launch
plane in view; the bottle is explicitly enlarged in flight. Spray breakup is a
visual approximation. This scene does not use the shared native water solver.
It assumes uniform dry air, constant ambient conditions and an upright vertical
bottle, without slosh, wind, tumbling or interactions between expelled parcels.
Landing ends the flight without rebound. Any residual water or pressure remains
accounted for. This is an illustrative experiment, not a calibrated prediction
for a real bottle or launcher.

Run `node tools/test-water-rocket-model.cjs` for water and air mass accounting,
adiabatic expansion, frame partition equivalence, parameter comparisons,
zero-pressure behavior and landing. Run `node tools/test-water-rocket.mjs` for
ordinary browser playback, real pointer, keyboard and touch controls, pause,
slow motion, reset, scene retirement and responsive layouts. The harness owns
Chrome for Testing and writes captures to `/tmp/water-rocket-review`.

## Water-ballast cliff railway

The upper car fills with native water while both cars wait at their stations.
Once it holds a working load and the lower car has drained, the station brake
releases. The heavier car descends and pulls its partner uphill through one
fixed-length cable. Arrival opens the lower tank's floor gate and moves the
supply to the new upper station. The cycle repeats while the water supply is on.
The supply button stops new filling. It does not erase water already in a tank.
Instruments includes a dry comparison with the same cars, cable and brakes.

Each tank has moving collision walls and a real opening in its floor. The
renderer uses that same geometry. A GPU census measures live native parcels
inside each tank; that inventory supplies the water mass in the mechanical
equation. Both cars share one coordinate, so their distances from the upper
stations always sum to the rail length. Gravity acts on their mass difference,
with the inertia of both cars and their water, against bearing drag. Station
stops dissipate the arriving motion. Filling and draining change the load;
there is no assigned travel duration or car animation.

This is a reduced ballast-load model with ideal rails, cable and station brakes.
It does not resolve cable stretch, pulley inertia or every reciprocal impulse
from sloshing water. The return pump supplies the energy needed to lift water
back to the upper station. It is not a closed-energy or calibrated railway model.
The ordinary native-water solver and its contact approximations still apply.

Run `node tools/test-ballast-railway.cjs` for desktop and landscape touch playback.
The test reads resident GPU particles independently of the ballast census and
checks repeated trips in both directions, cable length, the dry comparison,
supply controls, pause, reset and scene retirement. It owns its Chrome for
Testing process and writes screenshots and measurements to
`/tmp/ballast-railway-review`.
## Machine de Marly

The public Machine de Marly scene is a working cutaway of one river wheel and
one single-acting piston pump. The Seine powered the original waterwheels;
cranks and connecting rods drove pumps that lifted water in three stages to
Louveciennes. The historical installation had 14 wheels. This scene teaches
the energy and valve sequence, not the historical machine's scale or output.
Sources: [Musée du Domaine royal de Marly](https://musee-domaine-marly.fr/collections/vue-et-description-de-la-fameuse-machine-de-marly/)
and [Château de Versailles](https://en.chateauversailles.fr/discover/history/key-dates/water-versailles).

Paddle drag at the current river speed supplies shaft torque against inertia,
bearing friction, the brake and the water's lifting work. Crank displacement
changes a fixed chamber volume. On intake, an ideal inlet valve admits river
water. On delivery, an ideal outlet valve sends that volume up a pipe entering
near the bottom of the upper tank. As the tank fills, its water level adds to
the head opposing the crank. A full tank overflows toward the gardens. The
river is an open boundary, while chamber, tank and overflow water close a
volume ledger. The painted shaft, piston, valves, pipe-flow markers and tank
level read the solved state. No motor or target speed is installed.

The calculation uses a reduced SI-unit model. It does not resolve water
particles, individual paddle impacts, pipe friction, valve dynamics, leakage,
or the full three-stage historical works. Its visible units default to gallons;
the units button switches to liters. The river control and brake act on the
same running model, so closing either does not erase the lifted water.
Manual pause freezes motion and delivery. Restart begins a fresh run.

`node tools/test-marly-model.cjs` checks torque, displacement, valve and water
conservation, the shaft energy ledger, river and brake controls, and frame
cadence. `node tools/test-marly-machine.cjs` uses owned Chrome for Testing to
check playback, pause, restart, touch and keyboard controls, scene cleanup,
and desktop and phone layouts. Screenshots and measurements go to
`/tmp/marly-machine-review`.

## Sewer gas trap

The wet bend blocks pale smoke arriving from the left. Click the water itself
to remove or restore it. Its plain Water on / Water off label sits below the
seal, with no boxed button. Both states work while paused. Water is
seeded only inside the pipe below its waterline, preventing the accidental pool
above the inner wall. The main view names the wet or dry state, with no pressure
readings to wait for.

The inlet has a plain Airflow on / Airflow off toggle centered on the entrance
pipe, with no fan illustration. The water toggle adds or removes only native
water, preserving the smoke field, air velocity, pressure, clock, airflow
setting and manual pause. Refilling uses the same pipe-contained native seed
without reconstructing the scene. Smoke already in the room remains there
and continues moving after the water returns. The airflow toggle starts a
fresh comparison. Smoke injection continues with zero momentum when airflow
is off. How it works explains the calculated airflow, passive smoke tracer
and missing air-to-water pressure response, with links to both source files. The browser regression
compares the driven dry trap with the same fresh dry setup and airflow off:
the latter has zero airflow and no smoke in the room. Switching airflow on
starts a fresh driven setup that advects smoke through the pipe.

This scene enables the shared smoke solver's solid pressure boundaries and an
optional liquid barrier derived from the current native water density field.
Advection clips its backtrace at water and walls instead of sampling through
them. The pressure grid is capped at 128 cells on its short axis, independent
of the visible smoke resolution. Other scenes and the game leave the liquid
barrier disabled. The inlet force supplies momentum and smoke supplies passive dye;
air pressure cannot displace the water seal. The water toggle updates its
boundary immediately, including while paused, without clearing the smoke
solver or simulating evaporation or a drain.

Run `node tools/test-sewer-gas-trap.cjs` for actual wet and dry smoke transport,
room-plume measurements, water placement, continuous smoke across repeated
water toggles, visible controls, keyboard and touch operation, manual pause,
narrow desktop and landscape phone
views, and departure into another smoke scene. The harness owns Chrome for
Testing and saves screenshots and measurements to `/tmp/sewer-trap-review`.

## Breathing cave

The cave starts with equal pressure and still air. Two visible buttons raise
inside or outside pressure by 10 hPa per press. Holding either button for more
than 250 ms keeps raising that side by 40 hPa per active second. Mouse and touch
use pointer capture; Space and Enter hold the focused button. Release, lost
capture, touch cancellation, focus loss, inactivity or a scene change clears the
hold. A release click adds no second step. Inside inputs add recorded
ideal-gas mass at fixed temperature. Outside inputs change the surrounding
reservoir pressure, which then stays fixed until the next input. The pressure
difference drives an entrance with inertia and quadratic pressure loss.
Closing the real mouth valve traps its existing charge. Reopening uses that
charge. Instruments offers equal starting pressures and a closed initial mouth.
Pause freezes the gas and arrow motion; the pressure buttons remain usable.

The arrows are free diagnostic probes carried by air drag. Each probe has
0.002 kg of mass and 0.00004 kg square meters of angular inertia. A front sail
has 0.03 square meters of effective area, 36 cm ahead of the center of mass;
a rear sail has 0.006 square meters, 12 cm behind it. The
[quadratic drag relation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
uses local density and a declared drag coefficient of 1.2. Each sail samples
air at its own location relative to both the probe's translation and rotation.
The summed forces accelerate the probe; their moments turn it. These are
declared visualization-probe parameters, not measurements of airborne objects.

A coupled implicit solve balances linear and angular momentum. Position and
angle advance only through those velocities. There are no pins or springs.
The same arrows persist throughout a run, retaining positions, velocities and
angles across reversals. They are never reseeded, wrapped or replaced. An arrow
that leaves the visible region retains its state and can return with the air.
A swept 0.4-meter contact envelope prevents passage through the actual walls
or closed gate. Inelastic, frictionless contact removes inward normal velocity;
a shutter closed on an arrow displaces it to the nearest exposed face. Tile
seams inside a wall cannot serve as escape faces.

Closing the mouth stops airflow while residual arrow momentum dissipates
through relative drag. The probes have no feedback into the air model. The
twenty-pixel glyphs display their calculated positions and angles, including
with reduced motion enabled. Drawing never changes the physical state.

The readout sits beside the simulation at normal screen resolution. Its
large text shows actual airflow, while one centered pressure gauge shows which
side is higher and the difference in hPa. Absolute readings remain in Instruments.
When pressure reverses before the moving air does, the readout explains that
delay. Closed, still and paused states have explicit text. The layout reserves
space for the readout; a narrow, tall window places it below the cave. It uses
the same layout on desktop and touch screens at the same viewport size.

This scene has a separate large scale: one world pixel is one meter, with ten
meters of section depth. Both pressures start at 101325 Pa. There is no automatic
weather cycle. The pressure mechanism follows the [National Park Service explanation
of Wind Cave](https://www.nps.gov/wica/learn/education/what-causes-the-wind-of-wind-cave.htm).

A backward Euler entrance solve couples neck momentum, pressure loss and the
isothermal gas equation. Neck inertia and loss use mean entrance density; the
signed drive selects the upwind gas density for actual mass transfer. A
finite-volume potential field distributes the
resulting compression or expansion through the actual clear cells. Solid faces
carry no flux; outside cells are reservoir boundaries. Preconditioned conjugate
gradients rebuilds that field only when the collision geometry changes. The
shared WebGL smoke, native water and Sluice source are unchanged. This is a
reduced isothermal and potential-flow approximation; acoustic propagation,
turbulence, thermal exchange and a closed energy budget remain unresolved.
Closing the ideal stationary valve does not model a moving shutter's work.

Run `node tools/test-breathing-cave.cjs` for independent EOS, entrance momentum
and arrow force/torque checks, sampled mouth velocity versus gas transfer,
nineteen reversals driven by test button inputs, persistent identities, passage
out of and back into the cave, swept gate contact, continuous travel and angular
advance, closed-mouth energy dissipation, manual mass accounting and frame-size
checks. The initial sixty-second control stays exactly still. A single input
must move the chamber arrows and visibly turn even the slowest within three seconds. Run
`DUMP=/tmp/breathing-cave-review node tools/test-breathing-cave.mjs` for owned
Chrome for Testing playback at desktop and landscape mobile sizes, mouse and
touch holds, outside-target release, keyboard holds, blur and touch cancellation
on both pressure controls, pause, reduced motion and reset to
equal pressures. The browser regression also checks normal-playback position and angular
continuity, persistent identities during pressure reversal, readable
text contrast, semantic status and meter labels, separation from the apparatus,
shorter landscape heights and narrow desktop layout. Screenshots and
measurements go to that directory. The ordinary smoke scene also boots.

## Water appearance

Every demo uses the shared renderer's `surfaceFromPositions` option. A compact
water-only field measures current particle support, independently of pressure
density, sleeping flags and the simulation neighbor grid. That grid can contain
only grains after sand or ice contacts, which formerly cut holes in occupied
water. Supported parcels gain a bounded kernel radius, from 2.58 to 3.6 world
pixels, to close small sampling gaps in pools and pipes. Sparse parcels keep
the compact footprint and draw as round droplets. The former global radius
scale of 2 enlarged detached groups as well as pools.

Free-space gap filling and terrain seam borrowing are disabled in this mode.
Water still clips to the visible walls. The reconstruction smooths gaps at the
particle sampling scale; larger empty cavities remain visible. Explicit bubble
models supply their current GPU positions, radii and active states to a separate
water cutout, preserving even compressed bubbles smaller than a kernel. Soft
appearance presets cannot promote a lone particle into a surface blob.

`node tools/test-water-surface.mjs` constructs, advances and renders every public
scene, with additional landscape mobile checks across the solver families. Its
frozen fixtures cover shallow layers, narrow pipes, low density, grain-only
neighbor counts, separated splash groups, empty cavities and small gas
interfaces. Drawing preserves exact position, auxiliary, affine, pressure,
material and native inventory buffers. The game retains its existing renderer
and physics defaults. Captures and measurements go outside the repository.

## Sand dam

The `sand-dam` scene starts with a large, dry bank in one open tank. Its
560 by 280 world keeps the bank and the upstream tap close in view on desktop
and landscape mobile. The drawn spout ends at the native water admission
point. Hold to pour admits water; pointer or key release stops admission.
Water builds against the left face, disturbs grains and, with continued
pouring, crosses the bank. A dashed outline records the authored starting
profile. It is a reference, not a restored or enforced boundary.

This scene opts into discrete grain contacts in the demo's material companion.
Grains keep their own velocity and receive force increments from the shared
material grid, rather than having their velocity replaced by the grid mean.
Only fluid parcels scatter compressive pressure. Grain volume still enters
occupied volume, and water-grain drag exchanges opposite grid momentum.
An exact diameter-sized linked grid visits every grain neighbor. Snapshot
contacts resolve compression and Coulomb friction in velocity and position,
with a 0.65 friction coefficient and a 1.8 world-unit grain diameter. Twelve
contact iterations run per native water quantum. The drawn floor and native
bed share their geometry; the swept wall origin survives the bed projection.
There are no retaining posts, initial water, restored grain positions or
assigned erosion paths. These choices are a reduced 2D experiment. Contact
and projection work are unmeasured, and the scene has no calibrated soil,
permeability or erosion law. The companion's other scenes retain their existing
shaders and settings.

Run `node tools/test-sand-dam.mjs` for real WebGPU desktop and landscape mobile
checks. A matched dry comparison distinguishes water-driven grain transport
from settling, with a longer dry run to catch a collapsing pile. Checks cover
bank height, upstream accumulation and downstream flow, the labeled held tap,
release, pause, reset, finite state and conserved sand. Captures and measurements
go to `/tmp/sand-dam-review`.

## Slime submarine

The submarine has four held steering controls (WASD or the visible buttons),
a ballast valve (B), and three numbered course rings. The compact tank uses the
same 560 by 320 world and water charge on desktop and mobile. The gold point on
the deforming hull marks the real valve. Opening it underwater admits native
water. Closing it retains that water. Lifting the open hull above the pool lets
water leave through the same opening. There is no pump or inventory reset.
Dragging still uses the existing elastic grip.

The control panel reports the fraction of the hull occupied by water and its
center depth relative to the measured pool surface and floor. Rings light in
order when the hull center enters their 25-unit radius. Restart course clears
only those markers; the main restart restores the tank. The markers exert no
forces and have no collision geometry.

Steering is a declared external motor, with maximum force equal to 2.4 times
the dry shell's weight. Diagonal input shares that limit. The force is applied
to the existing Verlet material substeps, divided by the current shell and
carried-water mass. It assigns neither a velocity nor a destination. Releasing
input leaves existing inertia, gravity, water drag and the one-way buoyancy
approximation. This is not a fluid-coupled propeller. Native water contact
reactions, asynchronous parcel counts and approximate surface buoyancy retain
the earlier model's limits; no calibrated submarine or closed energy claim is
made. The blocked-valve comparison keeps the same motor and dry shell sealed.

Held controls clear on pause, pointer cancellation, capture loss, inactivity,
scene changes and reset. The panel shares the existing UI activity timer. It
reserves room beside the tank or below it in a narrow window. The valve remains
usable while paused, without advancing water. Run
`node tools/test-slime-submarine.mjs` for owned Chrome for Testing checks of
real steering, water inventory, ballast mass, keyboard and touch controls,
input cleanup and responsive layout. Captures go to a temporary directory or
`DUMP` when specified.

## Hourglass

The hourglass runs at normal playback speed with about 30,000 physical grains.
Their authored diameter is 0.7 units, half the original size, with initial
spacing of 1.03 diameters. The throat is 3.08 units wide and 24 units long.
The longer straight passage collimates the stream through real wall contacts.
There is no lateral attraction, assigned falling path or decorative population.

Grab anywhere on the glass silhouette, swing it, and release to toss. The grip
is a damped point spring with a finite force limit. Its off-center force creates
torque through the body's actual inertia. Release changes only whether the
spring is active; it adds no velocity, angular impulse or prescribed flip.
The arrow keys and Enter also move, grab and release the shared pointer.
Pause, camera changes, lost capture and scene retirement release the grip.

The glass has mass 1.8 and the finite charge has total mass 1 in the model's
mass units. Its rotational inertia comes from the actual wall and cap areas.
The object is drawn at 0.75 of its authored dimensions, leaving room to swing.
The rendered mesh, grain walls, grip coordinates and stage contacts use the
same rigid transform. Stage contacts use the convex hull of every visible
outer mesh vertex, which has the same support against the floor and window
planes as the complete outline. Floor contacts have sliding friction and a
small restitution for harder impacts. There is no automatic righting.

Grain positions stay in glass-local coordinates, while their velocities stay
in inertial world coordinates. Each substep first advances the rigid body,
then transforms each grain's ballistic world motion into its new local frame.
Moving wall contacts use the glass's actual point velocity, including rotation.
Every grain-wall impulse returns its opposite linear impulse and torque to
the body through a GPU reduction. The glass, grain integration, contact sums
and both renderers remain on the GPU. The 64-byte body state is mirrored for
hit testing and inspection, without waiting in the animation loop. The timer
adds 16 bytes of inventory totals to that readback at most ten times per
simulation second. Its two GPU reductions reuse the contact scratch space
after the final impulse has been applied; no grain positions leave the GPU.

The timer displays elapsed simulation time, the fraction of sand through the
neck, and an estimated remaining duration from the last three seconds of net
flow. Grains inside the neck count as unfinished. Completion requires an empty
source bulb and neck, then holds the final duration. Pausing or an inactive demo
freezes the clock. A stable reversal starts a fresh run with the newly elevated
bulb's actual inventory, including partial fills. Fast tumbles and sideways
poses hide the estimate. A stopped stream reports that state rather than
continuing a countdown. The estimate is a measurement, not a target duration
or an input to the physics. The readout stays upright in the viewport.

A diameter-sized linked-cell grid visits every neighbor without bucket caps
or representative sampling. Three position-based contact iterations reconstruct
world velocity from the position correction and apply grain friction. A common
relaxation factor keeps each pair's corrections and impulses symmetric. This
preserves total linear momentum within numerical error in a freely moving
container and charge. Grain spin and a calibrated sand constitutive law are
not included. The reduced contact model has finite overlap and numerical
contact work; it is not a laboratory hourglass model.

The fixed quantum is 1/(720 times the detail scale) seconds. Playback at 100%
advances one simulation second per real second. The scene retains its time
remainder, honors gravity and speed controls, and restores the native engine's
update, draw and timing methods when retired. Rendering reads the actual
resident grains and body pose. Subpixel antialiasing preserves disc area.

The `sand` URL parameter selects a detail scale from 2 to 6. Desktop and mobile
default to 2. Smaller spacing increases the population without changing the
filled region. Capacity grows only for an hourglass boot requesting more than
the normal allocation. `?scene=hourglass&sand=4` selects about 120,000 grains
at one-quarter the old diameter. Scales 5 and 6 remain stress settings.

Run `node tools/test-hourglass.mjs` for real WebGPU containment, inventory,
packing, stream width, grain and glass freefall, inelastic pair contact, floor
friction, grain-to-body momentum transfer and full-charge momentum conservation.
Real pointer gestures check force-driven translation, torque, release adding
no impulse, continuing angular motion, pause, fullscreen, resizing, restart
and scene retirement. Add `--mobile` for touch gestures on landscape mobile.
Use `--boot` for a quick compilation check and `--benchmark` for 300 completed
update-and-render workloads followed by 299 animation-frame intervals.
The browser check also compares the timer's GPU census with the resident
grains, checks the live estimate and verifies pause, restart and retirement.
Run `node tools/test-hourglass-timer.mjs` for measured flow, stalls, stable and
partial reversals, tumbling, last-grain completion and stale readbacks.
The harness owns Chrome for Testing and writes captures and measurements to
`/tmp/hourglass-review`.

The older density trials in `docs/hourglass-benchmark-2026-10-12.json` predate
both the half-size default and dynamic body. They used 20% playback and cannot
predict this version's frame rate or phone speed. High density still encounters
the host's 50 ms frame-input clamp if frame rate falls, so stress settings can
lag behind wall time.

## Smoke wind tunnel

The slime starts at the midpoint of the straight channel, at (416, 200).
A damped spring supports its central material point while its skin remains
elastic and grabbable. The right edge of the smoke domain is an open room-pressure
outlet. Its velocity extends through the exit without reflection, its exterior
pressure is zero, and entering air carries no dye. Outgoing dye is lost through
advection, independently of the usual dye dissipation.

`OPEN_RIGHT` defaults off in the shared smoke engine. The tunnel enables it
and restores the previous setting when leaving the scene. Outlet shader variants
are compiled only on first use. Run `node tools/test-smoke-wind-tunnel.mjs` for
desktop/mobile centering, grab recovery, fan controls, an undissipated dye-packet
exit comparison and boundary restoration. The default smoke regression is
`BASE_REF=44a0f90b node tools/perf/smoke-equivalence.cjs`.

## Particle spacing correction

Toy v5.156 corrects particle spacing. Its physical regression uses the original
surface radius scale of 0.9 with position reconstruction disabled. The rejected
v5.142 change widened the drawn kernels to 2 without correcting the particles.
Its frozen-image hole comparison did not test the cause of the strands.

The demo now opts into a terrain-aware spacing correction in the shared water
engine. It separates water parcels closer than 1.1 world pixels, below the
1.25-pixel resting pitch. The old emergency correction required density above
1.6 times rest, so ordinary APIC compression could leave persistent filaments
below that threshold. Some pressure companions also skipped the density gather,
leaving the value used by the correction and renderer at its initial value.

The small Heron apparatus also restores the native fine-grid liquid pressure
response alongside its coarse air solve. The coarse correction alone allowed
underdense sheets to persist.

The correction reads a GPU position snapshot and writes each parcel's own
position. Each displacement is bounded to 0.275 world pixels per substep and
checks the leading edge against the collision terrain. Frozen and parked parcels
retain their state. Velocities, affine matrices, particle identity and particle
count are preserved by the isolated correction. Pressure modes that replace the
native pressure impulse now refresh density and aeration separately; modes that
own material density remain excluded. The game keeps its original correction,
with no additional buffer or dispatch when this option is omitted.

`node tools/test-water-spacing.mjs` compares actual GPU particle distributions
with correction off and on, at the original drawing width. It covers the
fountain on desktop and landscape mobile and the cascade. It also isolates
uniform translation, a compressed cloud, walls, a floor, a corner and inactive
parcels, checking carried momentum and containment rather than treating filled
rendering gaps as physical evidence.

## Entrained air

Toy v5.167 gives compact submerged gas in the small Heron apparatus and its
smoke variant the existing bubble transport model. A detached finite gas pocket
with at most 200 square world pixels of void transfers its exact room-reference
gas amount to a mobile parcel. Its center must belong to that pocket and its
pressure-dependent radius must fit the collision geometry. Atmospheric regions,
large vessel headspaces and zero-amount vapor cavities retain their existing
representation.

The parcel samples surrounding water velocity and rises with the existing
size-dependent buoyancy and quadratic drag model. Water contact preserves its
interface. Gas is released only at a current atmospheric gas cell; there is no
age cutoff. The native pressure coupling removes the previously represented
share before remapping and reinjects it at the current valid gas owner. An
unresolved owner leaves the gas in its mobile parcel. The parcel ledger records
captured, coupled, moving and escaped amounts. Coupled amount is already part
of the pressure inventory and is counted once when checking its balance.

The small apparatus also uses the direct pressure transport and boundary
reconstruction already used by the larger water machines. Fine-grid particle
pressure and the spacing correction remain active. The shared game engine and
surface rendering are unchanged.

`node tools/test-water-entrained-air.mjs` checks actual GPU gas transfer, an
independent pressure/radius relation, buoyancy, uniform carrier flow, zero
gravity, a sealed ceiling and exclusion of large headspaces, atmosphere and
vapor. A native pool comparison tracks a pocket through the water to the
atmosphere. The real smoke fountain runs with three desktop seeds and a
landscape phone viewport, checking exact water count, finite state, both gas
ledgers, owner handoffs and scene cleanup. The dedicated air hose also boots
and injects through its original path. Source hashes, measurements and captures
are saved under `/tmp/water-entrained-air-review`.

This is the existing reduced isothermal bubble model, with approximate drag and
coalescence. It does not add gas dissolution or establish full physical
acceptance of the fountain's pressure solver.

## Persistent source-tank cavities

Toy v5.182 fixes the remaining holes in the small Heron source jar. The earlier
bubble transfer handled finite gas parcels but missed empty regions with no gas
owner. The air classifier relabeled those regions as liquid, leaving them open
without a gas pressure response. The apparatus now enables the existing empty
cavity and vapor closure branches. Pressure moves native water into an unowned
cavity until it closes. Finite gas keeps its inventory and buoyancy model.

Natural gas parcels now collide against the native water terrain mask. Partial
solid fractions in the coarse air grid cannot locate the actual wall inside a
cell, so using them as collision tests could block open space. An expanded
parcel also resolves its wall overlap before transport. Circular sweeps prevent
crossing a wall, including near corners. The dedicated air hose retains its
existing collision path. Retiring an older companion no longer detaches a newer
companion during an overlapping reset.

`node tools/test-water-cavities.mjs` reproduces the released behavior by disabling
these two changes, then compares actual GPU particle positions. It detects empty
components in the submerged lower half of the right-hand source jar, separately
from its free surface and headspace. Each run advances sixty seconds of host
frame time. Corrected cases cover three seeds, desktop at 30 and 60 Hz, and a
landscape phone at 30 Hz. The test checks actual empty area, liquid phase
classification, finite state, water count and both gas ledgers. Rendering
parameters are unchanged. Measurements and screenshots are saved under
`/tmp/water-cavity-review`.

The bubble component regression also covers partial wall cells, expansion beside
a wall, expansion into a corner and swept contact. These checks supplement the
existing pressure/radius, zero-gravity, headspace and finite-gas checks. They do
not establish full quantitative acceptance of the fountain pressure solver.

## Bubble audit across demos

Toy v5.196 extends native terrain contact to every `WSSBubbles` companion,
including Air hose, Aquarium bubbler, Air-lift pump and Ringing bubbles. Their
ordinary source runs were clearing, but the inherited coarse collision path
could pin a parcel after expansion beside a wall. Injected and natural gas now
share the same overlap recovery and circular sweep. The gas source, pressure
relation and buoyancy model are unchanged.

Glugging bottle also enables finite natural gas transport. Compact detached
pockets were moving too slowly through its water. The existing 200-square-pixel
limit applies; a captured parcel carries its actual native gas amount. Large
sealed headspaces remain native pressure pockets. Gas reaching a sealed
headspace stays accounted for. There is no age cutoff or underwater gas deletion.
This does not establish the bottle's complete glug cycle or calibrated
counterflow through its narrow mouth.

The audit inventoried 119 registered definitions, including 55 with seeded water
and native particle pressure. A native-buffer survey advanced thirteen relevant
apparatus for thirty seconds of host frame time: the four gas supplies, cup,
siphon, large Heron fountain, glugging bottle, upside-down tank, Mariotte bottle,
sewer gas trap, Roman inverted siphon and water tower. The ordinary cup, large
fountain and inverted siphon did not show the small fountain's retained-empty-cell
failure. Dynamic body and thermal mechanisms were inventoried but are outside
this native-water-only survey. Their dedicated gas companions are unchanged.

`node tools/test-water-bubble-demos.mjs` checks that all four supplies release
all admitted gas after stopping, with exact water and gas counts and no native
wall penetration. The bottle runs for thirty seconds of host frame time with two
desktop seeds, a landscape phone and an open-vent control. It verifies an actual
rise of more than seventy world pixels within 2.5 native simulation seconds,
large sealed-headspace preservation, finite state and both gas ledgers. Source
hashes and screenshots are saved under `/tmp/water-bubble-demos-review`.
`AUDIT=1` runs the observational thirteen-apparatus survey; `SCENES` may select a
comma-separated subset. The expanded component test in
`tools/test-water-entrained-air.mjs` covers injected gas beside partial wall cells,
expansion beside a wall and corner, swept contact, zero gravity and a sealed
ceiling. These observations do not certify every apparatus mechanism or its
mechanical work balance.

## Spatial oxygen and combustion

The six fuel-burning scenes share a spatial oxygen solver: Candle in a jar,
Chimney draft, Slime sauna, Douse a fire, Fire brigade and the declared burner in
Oil slick fire. Thermoscope, kettle and steam apparatus use declared heaters;
their heaters do not consume oxygen. Passive smoke tracers do not burn fuel.

Toy v5.171 gives these scenes their own physical airflow. The older model
inherited artistic vorticity from smoke presets and put an invisible ceiling
around the entire scene. An open fire could therefore stir the whole drawing.
The reacting solver now owns momentum, oxygen and gas enthalpy together. Smoke
presets change appearance; their wind, curl and heat controls do not force air.

Velocity lives on staggered faces in metres per physical second. Momentum is
advected with midpoint trajectories and bounded MacCormack correction, using
staggered interpolation and molecular viscosity of 0.000015
square metres per second. Hot air rises under bounded thermal-density buoyancy
using 9.80665 metres per second squared and a 293.15-kelvin ambient temperature.
One wall-aware pressure projection supplies the faces used by every scalar.
Cached multigrid-preconditioned conjugate gradients solve the pressure operator
in double precision. Coarse operators retain the fine grid's actual wall and
outlet links. Closed components have explicit pressure gauges and compatibility
checks. The uploaded pressure must pass the actual GPU face-divergence limit of
0.08 per physical second. Iterations, elapsed solve time, CPU residual and GPU
convergence are exposed separately.
Its pressure potential is in square metres per second, not pascals.

The scene perimeter is open atmosphere. Incoming faces carry 20.9% oxygen and
20-degree-Celsius air; outgoing faces export their actual oxygen and heat.
Ambient pressure is imposed at exterior faces. Only drawn apparatus walls
block flow. A sealed jar therefore remains sealed while its surrounding room
can vent. There is no interior reservoir strip or invisible outer wall.
Native water and moving bodies affect nearby momentum once, before projection;
water samples older than 0.2 physical seconds stop forcing the air.

The native water clock uses 250 world pixels per simulation second squared.
The instrument scale maps those ticks to physical seconds. Air, fuel and stone
heat now use that same mapping, and native boundary velocities are converted
once. Cached snapshots retain both clocks and both velocity units.

Oxygen, carrier gas, exhaust and enthalpy use conservative face fluxes. Oxygen
is recovered from carrier and the oxygen-equivalent spent tracer. This conserved
mixture basis keeps untouched ambient gas at 20.9% without clipping or adding
oxygen, while reaction and exterior exchange remain separately measured. Oxygen
mixing uses 0.000020 square metres per second and thermal diffusion uses
0.000022 square metres per second. Heat uses symmetric harmonic face capacities,
so a newly opened cell conducts only through the gas actually reaching it.
Scalar substeps bound combined advection and conductive loss. Boundary exchange,
reaction, displaced gas and
conductive heat losses have separate ledgers. Building a wall records its
displaced gas rather than calling it burned oxygen.
Combustion scenes retain their physical world coordinates while the camera
crops the drawing. Panning, zooming and toolbar resize do not reset oxygen.

The field stores reference-volume inventories. Normal room air contains 20.9%
oxygen by volume, not by mass. Oxygen mass uses 1.331 kilograms per cubic metre
at the reference temperature. Local hot fuel consumes the oxygen that reaches
its surface; reacted oxygen becomes an advected exhaust tracer. A finite fuel
inventory limits the reaction. The small candle has a declared 60-watt capacity;
the miniature hearth has 250 watts. These are source capacities, not guaranteed
outputs. Actual heat follows consumed oxygen at 13.1 megajoules per kilogram,
the common oxygen-consumption calorimetry approximation described by
[NIST](https://nvlpubs.nist.gov/nistpubs/sp958-lide/280-282.pdf).
The declared exposed fuel surface has a small fixed variation across its
reacting cells. Positive weights sum to the same source capacity; local oxygen,
wet contact and finite fuel still limit the actual reaction. This allows an
uneven buoyant plume without adding wind or vorticity forces to the room.

Thirty percent of chemical heat enters the advected gas enthalpy; the rest
is credited exactly once to the fuel's native sensible-heat sensor. The source
has finite stored heat, room losses and actual water contact. The former
fixed-temperature ember and mixed air counter are removed from these scenes.
The candle samples oxygen arriving outside its reacting patch, so spent gas
inside the flame does not falsely extinguish it. A declared smooth flame-support
closure acts between 15% and 18% incoming oxygen; losing heat then extinguishes
the wick. Detailed temperature-dependent flame extinction is not solved.
Closing the chimney inlet can reduce the reaction while the open flue still
permits inflow and outflow. There is no required three-second extinction.

Oxygen in the top bar, or the O key, enables a read-only overlay. Smooth shading,
measured contours, flow paths and a pointer probe show the same field that feeds
the reaction. Flow uses centered velocities and measured elapsed simulation
time. Still air has no moving trails. Old trails fade when flow stops, and
arrows scale with actual displacement without a minimum length. Instruments
reports local oxygen, consumed mass and heat output. The overlay requests no
additional GPU sampling and never changes the solver.

Toy v5.186 restores a separate fine appearance field for combustion. A previous
display pass copied nearest-filtered gas cells into the finer smoke texture
and treated air only eighteen degrees above ambient as luminous flame. Recent
oxygen consumption now supplies a short-lived optical emission tracer, while
smoke is emitted once per reaction and steam retains its existing color.
Both follow the interpolated physical airflow with midpoint trajectories.
Display reconstruction filters the numerical cells without changing their
inventories. The canvas follows device density and camera scale, and optical
coverage uses straight alpha. The emission lifetime and fine surface flicker
are rendering approximations, separate from gas enthalpy, oxygen and momentum.
There is no transported fuel-vapor chemistry or resolved soot model.

This is a two-dimensional incompressible, reference-density approximation with
bounded thermal buoyancy. The exhaust field is an
oxygen-equivalent product tracer, not separate carbon dioxide and water species.
Source kinetics, fuel shapes and heat partition are simplified. Thermal gas
expansion, detailed chemistry and experimental validation remain outside this
model. Water and slime coupling remains approximate rather than a resolved
three-phase moving interface. The numerical oxygen ledger includes reaction,
external exchange and geometry edits; its residual is reported rather than
hidden by normalization.

The pressure discretization follows the staggered-grid construction in
[Bridson's fluid simulation notes](https://www.cs.ubc.ca/~rbridson/fluidsimulation/fluids_notes.pdf).
Full low-Mach thermodynamics would additionally need background pressure and
thermal expansion in each sealed component, as distinguished in the
[NIST governing equations](https://github.com/firemodels/fds/blob/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex).

Run `node tools/test-fire-airflow.mjs` for still ambient air, localized rising
heat, cooling after a source stops, hot lid changes, native pour wakes, pressure energy,
resolution and timestep comparisons, and independence from decorative presets.
Use `PHASE=appearance` for normal-view desktop and landscape-mobile captures,
fine emission, changing flame outlines, smooth opacity, and rendering isolation.
It also checks that a funded heater can warm the gas without producing flame
light after combustion stops.
Run `node tools/test-oxygen-transport.mjs` for production-shader transport,
wall isolation, reaction accounting, ordinary browser combustion and overlays.
The harness owns and closes Chrome for Testing. Visual captures stay outside
the repository.

The pressure loops use an embedded, import-free WebAssembly accelerator with
the same JavaScript fallback. Both evaluate the same float64 operations. Its
editable source is `tools/air-pressure-kernel.c`. Rebuild and verify it with
`node tools/build-air-pressure-kernel.mjs --linker /path/to/wasm-ld --check
--embed js/wss-oxygen.js` (a WebAssembly-capable Clang is required). The helper
does not install a compiler. Momentum and scalar transport remain on the GPU.

## Air pressure view

Machine scenes show a faint tint inside sealed gas pockets. Gold means positive
gauge pressure, rose means negative. Room air and liquid receive no air tint.
Up to three small labels show psi relative to the room; labels fit wholly inside
sampled gas and disappear when no readable space remains. Vapor is labeled
separately. Air pressure beside the head/flow readout and in Instruments controls
the same overlay. The former Pressure colors control is now named Water pressure
and retains its water coloring. All overlays are read-only and remain diagnostic.

Pressure images and static apparatus annotations are cached between GPU snapshots,
and the pressure image uses the displayed resolution. A fresh paused apparatus
requests its initial snapshot. Both overlay controls redraw while paused. This
reduces canvas work but does not establish a 60 FPS performance result.

The native gas boundary has opt-in nonlinearGas and vaporClosure experiments,
both off in the released scenes. The first solves the isothermal gas equation in
gauge pressure, avoiding room-pressure subtraction. The second allows an empty
vapor cavity to close at zero volume and raises pressure when further closure
would make its volume negative. The fifteen-case, three-seed Heron matrix passes
all 90 behavior/accounting
checks and all gas geometry health checks with these options. Physical gas
conservation, pressure convergence, phase boundaries and energy remain unresolved,
so both options remain off in public scenes. The trial report is
assets/images/water-machines/heron-cavity-trial-2026-10-09.json. A captured transient
negative volume in a
fountain trial had zero stored gas and was a collapsing vapor cavity. The native
observer now preserves the first event's amount, volume, flux and phase.

Checks: node tools/test-water-air-view.cjs, node tools/test-water-gas-boundary.cjs,
node tools/test-water-air-view.mjs, and the existing viewport/ordinary regression
harnesses. For a GPU before/after comparison, save the prior air module outside
the checkout and pass REFERENCE=/absolute/path/liquid-air-wgpu.js EQUIVALENCE=1
when running the browser air-view harness. Each capture now requires a new
document and verifies the loaded script SHA256. For host comparisons also pass
HOST_REFERENCE=/absolute/path/water-smoke-slime.js. HOST_BENCH=1 records real
Retina playback and per-function CPU samples. EQUIVALENCE_GEOMETRY=1 with
GEOMETRY_ONLY=1 and SCENES=cup checks prescribed immersed-guest geometry on
three seeds without asserting full native-state equality.

## Native overlap recovery investigation

This experiment remains outside the released native engine. The existing overlap
pass reads neighbor positions while writing positions in the same dispatch.
Identical initial buffers and packed step inputs diverge by over 90 world pixels
per second after three native substeps in a prescribed immersed-slime test.
Skipping the pass gives exact short repeats, but the nine-case cup matrix delivers
98.3582%, 98.5473% and 91.4620% of initially drainable water on the three canonical
seeds. The last misses 95%, so disabling recovery is rejected. Hold, finite-state,
particle-inventory and final containment controls pass.

A private per-instance DECLUMP_JACOBI option instead snapshots positions before
each overlap pass and canonicalizes that pass's neighbor IDs. Other native stages
keep their original neighbor list. Snapshotting alone still permits different
samples when buckets have more than 128 entries. The controlled first update
contains four such buckets, with a maximum of 148 entries. With canonical ordering,
all recorded native, pressure, gas, geometry and packed-input buffers repeat
exactly on seeds 17, 42 and 913 over four updates (twelve native substeps).

The isolated positional oracle passes 28 cases and 224 iterations, including
compressed clouds, 1,024 exact coincidences, wall/floor/corner containment,
below-density-gate controls, unchanged velocity/material/frozen/grain/tail state,
reversed lists and copies preceding the pass inside a shared frame encoder.
Default-off CPU command comparisons pass 96 frame pairs and 76 legacy shaders.
The actual GPU differential passes eighteen captures, including native words,
rendered pixels and resource/command comparisons. Default toy and game boots
load the exact private candidate with no optional resources or runtime errors.
The complete rank-candidate cup matrix passes all nine delivery, hold, finite,
inventory and final-containment cases. Canonical delivery is 100.5081%, 100.4026%
and 96.8008% of the initially estimated drainable amount, with no rim spills.
This volume-equivalent denominator excludes estimated water below the intake;
more than 100% means some of that estimated dead volume also drains. Fluid mixing
does not require the initially high particle IDs themselves to leave the cup.
The total particle inventory stays conserved.

A second private revision replaces unbounded per-bucket ranking with 1,024-pair
workgroup bitonic sorting and binary-search parallel merging. Keys are native
segment start and particle ID, preserving sparse scan order. Worst-case merge
work is O(n log^2 n), with fixed local network size. Its ordering oracle passes
104 real GPU dense/sparse cases, including negative/nonzero origins, exact cull
edges, stale tail IDs, changing counts and merge parity, up to 40,000 particles.
An independent CPU network oracle passes 90 cases. The strengthened 28-case
recovery oracle checks leading-edge terrain clearance, unique release of exact
coincidences and at least 25% reduction of sub-half-spacing pairs. Optional
preparation publishes only after asynchronous pipelines and bind groups validate;
eleven injected failure/lifecycle cases pass. Call prepareDeclumpJacobi() and
check its result before an accepted trial: DECLUMP_JACOBI reports the request,
and the native legacy pass remains active while preparation is pending or failed.
Disabling the request does not enable it again when compilation finishes.

The scalable candidate matches the rank candidate's native, pressure, gas, phase
and geometry hashes on three seeds at updates 1, 5 and 20 with prescribed immersed
guest motion. Exact-source default-off comparisons pass 96 CPU frame pairs,
76 legacy shaders and eighteen real GPU captures, plus default toy/game boots.
Four paired twelve-second Retina samples average 52.7, 45.4, 53.0 and 46.7 FPS
for rank, merge, merge and rank. They establish no reliable speedup or sustained
60 FPS. The complete scalable-candidate cup matrix conserves every particle,
passes both hold controls and records no rim spills, but canonical delivery is
100.6507%, 99.6091% and 93.7088%. Seed 913 misses the 95% target. The scalable
candidate is rejected for release; short trajectory equality does not establish
long drainage acceptance. Pressure, phase/gas conservation, energy calibration
and final natural-slime handling remain open.

An isolated CPU topology/remapping counterexample reproduces positive gas
inventory becoming unassigned when the last air-core cell crosses the phase
threshold. On nine threshold/open-area combinations, geometric air remains,
yet the following step retains neither that gas nor its unassigned diagnostic.
Per-step balance error stays zero, so accounting alone does not certify physical
retention. A mixed-cell pressure closure must preserve gas ownership independently
of the water classification, include liquid and gas compliance, and apply the
resulting pressure to the external water flux. Its isolated matrix oracle passes
108 parameter combinations.

The actual released GPU step chain reproduces the loss on nine threshold/open-area
cases with native-grid mass, and another nine with prescribed MAC records and the
actual transformed pressure shaders. Compression below threshold, a surviving
neighbor air core and actual room vent controls pass. The recorder is
tools/test-water-air-pocket-threshold.mjs. Its default mode reproduces the released
defect and reports physicalRetentionPass=false even when the test itself passes.

A private singleton prototype retains independent gas ownership while keeping
LIQUID classification. Its gas row adds liquid compliance/history; each normal
neighboring water row assembles the external face coupling, provisional flux and
neighbor pressure once. Final gas volume includes liquid compression. Exact v2
GPU checks pass nine retention cases and three controls in each transfer mode,
plus 48 finite-neighbor pressure/volume/force cases per mode. The independent
linear two-row matrix and nonlinear EOS bisection use the encoded gas base.
Both face directions, positive/negative/zero provisional inflow, densities 1/2
and sound speeds 250/1000 are exercised. Largest absolute pressure-oracle error
is 0.0047 units without MAC and 0.0110 with prescribed MAC records. Pressure
and volume tolerances account for float and fixed-point encoding, with no
acceptance claim for natural particle motion.

Three guards per mode pass: changed solid coverage and nonzero wall speed reject
before GPU writes; adjacent mixed owners keep their inventories but report an
unsupported interface and unresolved phase. Mixed roots are excluded from the
ordinary liquid residual and cavitation-credit loops. Face openings and room
masks can still change, and static tile-basis mutation is not guarded. The option
is private and disabled in every released scene. Source SHA256 is
f964270a9dbc0eff0436124c017ecd343347c88be935a5b7fbd61038904e3609;
its MAC helper is 3fcf6d0fdd42dd09b93bb1c7aea73225f517829ccd60d51e366d80484b65fe05.

This is a one-way resolved singleton prototype. Returning below the threshold
still drops the liquid compliance contribution; subquantum/zero-volume positive
gas, general advection/split/merge and moving boundaries remain unresolved. MAC
scatter and particle gather are bypassed. The force oracle uses the measured MAC
face density, so it checks the encoded operator rather than the physical accuracy
of interface inertia. MAC support still includes the whole LIQUID mixed cell.
Public evidence: assets/images/water-machines/single-air-pocket-trial-2026-10-09.json.
Use AIR_SOURCE=/absolute/private/air.js, EXPECT_RETENTION=1, PRESSURE=1,
PRESSURE_EXTENDED=1 and GUARDS=1 with the recorder. MAC=1 also requires the paired
MAC_SOURCE. General topology continuation and coupled runtime acceptance remain
pending.

The next private prototype declares one planar liquid strip and its sealed gas
inventory independently of the native phase label. The same water fraction .46
is tested under thresholds .40 and .50, preserving the resulting LIQUID and AIR
kinds. Its mixed liquid compliance, pressure reference and force reconstruction
participate in both classifications. The MAC face basis integrates the declared
water rectangles rather than choosing whole cells by kind. Independent Gaussian
quadrature gives a shared-face basis of 33.7801102 square pixels, where the old
kind-based rule gave 20.4444444 or 40.8888889 for identical water.

Exact v3.1 passes 48 paired GPU comparisons in each transfer mode, 192 individual
fixtures in all. Both face directions, negative/zero/positive inflow, densities
1/2, sound speeds 250/1000 and linear/nonlinear gas are covered. An independent
finite-neighbor matrix or nonlinear EOS bisection uses continuum density, not
measured MAC density. Pressure, neighboring pressure, gas volume and velocity
correction have zero recorded differences between the two phase thresholds.
Largest absolute pressure errors are 0.00360 without MAC and 0.00544 with MAC;
neighbor pressure errors are 0.00229 and 0.01002. Volume error is below 0.000589
square pixels. The known MAC face density differs from continuum by at most
0.00000155. These are numerical fixture measurements, not natural-flow accuracy.

The first extended v3 run fails its zero-flow case: gauge pressure is -0.001364
instead of zero because it subtracts two large room-pressure values. V3.1 uses
atmosphere*(amount-volume)/volume in declared mode. The same unchanged tolerance
then passes. CPU mocks pass 86 checks, including exact v2 default shader,
resource, write and command equality with the declaration absent. Both source
and failure hashes appear in
assets/images/water-machines/declared-plane-pressure-trial-2026-10-09.json.

These checks still prescribe all liquid geometry and native-grid/MAC records.
Scatter and native particle gather are absent; a declared plane is not a natural
interface. Reconstructing volume from actual particles, pressure work and
continuation across real compression/expansion remain the next gate. This is
private, pressure-only evidence, not a release candidate. Run INVARIANCE=1,
INVARIANCE_EXTENDED=1 and EXPECT_RETENTION=1 with the exact v3.1 AIR_SOURCE;
MAC=1 requires its paired MAC_SOURCE. Do not also select PRESSURE or GUARDS,
which exercise the preceding singleton experiment.

The next CPU continuation rejects that common pressure row. A valid initial gas
pressure pulse changes its stored gas volume by about 0.0874123 square pixels as
dt approaches zero, while the predicted native material change approaches zero.
Equilibrated affine flow also gives about 27% disagreement. The declared-plane
GPU agreement therefore cannot establish physical particle continuation.

A separate P1 pressure and mass-adjoint particle transfer passes 124 CPU checks:
48 transfer states, nine Float32 storage controls, 24 repeated steps and five
spatial scales. Its constructive case uses the existing native-format parcel
state, a material-edge pressure knot, positive determinant J update and physical
affine pullback. Its separate liquid/gas pressures use exact water and gas EOS.
Material, geometric gas volume and pressure work close at double roundoff in
that bounded calculation. This changes the interpolation; the existing quadratic
scatter and MLS do not inherit its proof. The coarse pressure-pitch APIC covariance
control is also distinct from native fine-grid APIC and physical parcel energy.
Root independently reran a byte-exact copy with an identical report. Source SHA256
is 8736960edaa556f2a7440dfea6ddca6b1b4a159f7b84a3429ea66a0a05e0d306;
report SHA256 is ac7ece10d035ae78e8d41a3456a36c0ab7d004ba3c3e5357869b2ef2dafba2de.
The actual private native P1 continuation now runs eight native GPU updates in
36 planar configurations, with sixty resident parcels and no runtime/shader/GPU
errors. Density 1/2, sound speed 250/1000, equilibrium/pulse/affine initial state
and dt 1/120, 1/240 and 1/480 are varied. Positions and material state are authored
once before the sequence, never reseeded between steps. All 288 updates execute.
Twenty-nine cases pass every independent per-step scatter, EOS, pressure, gas and
material/position volume, physical kinetic energy, work and gather/collision check.
Seven cases fail sixteen independent EOS residual arithmetic-only checks. The
candidate's larger Newton stopping threshold does not override those failures.
Five global Float32 sequence enclosures pass; 31 remain mathematically unresolved.
Only three of 36 valid cases pass both sets of checks. All five unsupported count,
nonplanar, material, topology and nonfinite-affine controls reject correctly.

A separate display-validation correction equates JSON zero with decoded signed
zero; the raw words and physical allowances remain unchanged. The original pilot
preserves six negative-zero words and no nonfinite words. General interface and
topology acceptance, full machine calibration and performance remain pending.
Evidence: continuation-progress-trial-2026-10-09.json and
native-particle-continuation-trial-2026-10-09.json. A further private candidate
continues Newton iterations past the candidate-only early stop; it must pass the
same unchanged independent hardware gates before any acceptance claim.

That separate private v4.7 candidate now passes all 36 per-step physical cases
over 288 actual native GPU updates, plus all five unsupported-input controls.
The single early-stop condition changes; the EOS, force, particle/material
transfer, final rejection guard and independent arithmetic bounds stay unchanged.
The solve continues until exact evaluated zero, no improving line-search step,
or the existing 32-iteration limit. Some cases reach that limit and still pass
the external accuracy gate. The prior sixteen failing EOS steps now pass. Five
global sequence enclosures pass and 31 remain unresolved, so the complete matrix
is still not accepted. No pressure prototype is released. Evidence:
native-particle-newton-trial-2026-10-09.json preserves the full case summaries,
source/raw/audit hashes and links to the preceding failed trial.

Sixteen private queue-pacing runs use exact v5.46 sources, seed 17, 1512 by 760
Retina rendering, four seconds warmup and eight seconds sampling. They verify
loaded source hashes and close every owned browser. At 1/60 host packets and two
admitted machine frames in flight, siphon and Heron execute about 60 host frames
per wall second. Median sampled native queue-prefix latency is 14.3 and 19.9 ms,
compared with baseline medians of 1.3 to 2.3 seconds. The cup executes 51.6 frames
per second with 25.1 ms median latency and growing host debt. No candidate native
clamp or fixed-bank overflow is measured. Smaller 1/120 cup packets execute
73.3 and 75.6 frames per second but advance the native clock more slowly than
1/60 packets. Higher frame counts therefore do not establish faster water.

These are uncapped scheduling measurements, not physical display FPS, sustained
60 FPS, or machine acceptance. The scheduler remains private: quiet-water banks,
deferred time across input/parameter changes, low-timescale remainder loss, and
paused foreign draws block release. Whole-frame admission preserves the existing
call order but does not prove matching displayed GPU water and CPU slime poses.
The public trial JSON preserves clock frontiers, time accounting, raw prefix
samples, source/report hashes and CPU pressure limits. Those trials changed no published simulation. The later v5.48 release adds
only the independently checked low-speed timing fix described below.

Released v5.48 / native v28.179 fixes the machine slow-motion freeze without
activating a scheduler. `RETAIN_SUBQUANTUM_REMAINDER` is an explicit per-instance
flag, default off. It raises the fixed accumulator cap to at least one native
1/120-second quantum. The toy enables it with its air model and removes both
flag and timing audit on ordinary return. The accumulator remains module-shared;
`getTimingState()` declares this scope and returns a copied audit.

Actual original-host hardware comparisons reproduce zero native advancement at
5% speed in cup, siphon and Heron. With the flag, submitted rates are .0791,
.0729 and .0708 simulated seconds per wall second in four-second samples. The
nominal rate is .0775; retained remainders, ignored tiny host calls and lagged
mirrors prevent treating these short measurements as exact playback rates.
Three actual host lifecycle tests pass slow movement, normal resumption and
flag/audit removal on ordinary return, with no uncaptured GPU errors.

Default-off GPU comparisons pass six dense/sparse fixtures on three seeds,
eighteen resident checkpoints and exact render pixels. With the flag enabled,
normal timescales .5, .775 and 1.55 pass the same comparison: eighteen fixture
instances, fifty-four resident checkpoints and eighteen render captures. GPU
resources, passes, pipelines and all 69 native WGSL literals are unchanged.
Smoke matches byte-for-byte at 49 checkpoints. The rebuilt v28.179 game and
v5.48 toy pass their release boot and engine-sync checks. The rebuilt game also
passes the smoke-coupling browser checks; the fountain preview passes both air
overlay controls with no JavaScript errors.

Private v3 latest-position scheduling passes CPU policy and six actual
interaction cases, but its full canonical cup seed17 delivers 94.46587288% of
initially drainable water at 180.033 submitted seconds. The existing target is
95%. All 69,307 particles remain finite and conserved, with zero hold loss, rim
spills or final centers inside walls. The single-case audit retains all numeric
criteria and explicitly omits matrix completeness; it is not the nine-case
acceptance. The scheduler is not released. Sustained 60 FPS, phone performance,
full pressure/gas and energy acceptance remain unfinished. Evidence:
assets/images/water-machines/slow-motion-and-drag-trial-2026-10-09.json.

Run the repeat recorder with CURRENT_NATIVE=/absolute/private/native.js,
REPEAT_NATIVE=1, DECLUMP_JACOBI=1, FRAMES=4 and EXPECT_REPEAT=1. Audit its raw
files with tools/check-water-native-repeat.mjs /absolute/capture --expect-equal.
DECLUMP_ISOLATED=1 runs tools/water-declump-isolated.mjs through the same owned
browser harness. The integrated machine recorder accepts per-case nativeParams
and freezes private CURRENT_NATIVE source bytes before recording. The public
experimental evidence is assets/images/water-machines/native-overlap-trial-2026-10-09.json.
The follow-up is assets/images/water-machines/native-overlap-scalability-trial-2026-10-09.json.
DECLUMP_SORT_NATIVE=1 runs tools/water-declump-sort-oracle.mjs against actual native
builders. AFTER=/absolute/private/native.js runs tools/test-water-declump-preparation.mjs.
NATIVE_REFERENCE=/absolute/prior/native.js, CURRENT_NATIVE=/absolute/private/native.js
and NATIVE_JACOBI=1 support deterministic EQUIVALENCE comparisons and paired
HOST_BENCH presentation samples in tools/test-water-air-view.mjs.


## Standalone siphon

Open `archive/water-smoke-slime/water-smoke-slime.html?scene=siphon`. The tube
starts filled, with a closed valve near its outlet. **Open valve** releases the
column; water from the upper tank crosses the bend and enters the lower tank.
Closing the valve holds the column, and reopening resumes delivery. The outlet
becomes submerged as the lower tank fills. Flow slows as the two free surfaces
approach the same height.

Instruments includes three initial setups: **Filled tube**, **Empty tube** and
**Raised outlet**. Changing the setup reconstructs both tanks and the selected
water inventory, preserving manual pause. Restart repeats that selection. There
is no in-run water replacement, automatic re-priming or scripted flow rate.

The siphon uses the same 1120 by 664 world and 8-pixel walls as the cup, with a
24-pixel tube and about 56,000 native particles when primed. Its outlet face is
at y=600, its crest at y=228 and its source surface initially at y=320. The raised
outlet face is at y=304. Selecting either released machine from a different
world reloads its fixed dimensions, preserving pause. The camera fits the whole
apparatus and controls into the available screen, including short MacBook
viewports. The pressure transfer, cavity volume, boundary reconstruction and
32 red/black sweeps are the same opt-in settings used by the cup.

The receiving-level measurement excludes primer still inside the descending
tube. The predicted head uses the outlet height before submersion, then the
receiving free surface. Its ideal speed remains sqrt(2gh). The measured speed
is lower; absolute flow and pressure are not calibrated.

The integrated siphon check uses six cases on seeds 17, 42 and 913: stock flow,
valve close/reopen, approximately half the initial head, empty tube, raised
outlet, and a pressure-capacity break followed by capacity restoration. The
passive GPU observer reads positions after every native update. It credits
only original source-tank particles observed crossing both the crest and outlet;
primer, rim spills and unrecorded passage are excluded.

`tools/check-water-siphon-result.mjs` independently checks copied native buffers,
containment and inventories. Its stock transfer target is at least 40% of the
original source bulk by 120 simulation seconds, with final levels within two
wall cells. Stock runs also require net native speed below 1 world pixel per
simulation second over the final ten seconds. Stock runs last two minutes;
interrupted valve runs last three minutes and retain a native-buffer transfer
checkpoint at two minutes. Their receiving inventory must change by less than
0.5% of original source bulk during that final minute. The same velocity target
is reported separately for those runs and can fail through backward/forward
oscillation. Both the original two-minute observations and the longer records
are preserved. These checks do not certify quiescence.
The passive observer weights signed parcel velocity by
residence time in the crest section after every native update. It also records
the fastest parcel, so residual oscillation remains visible. The displayed
instrument sample can lag and is not the settling criterion. The
valve control permits at most 0.5% bulk delivery while closed, including its
short downstream tail, and requires another 10% after reopening. Empty, raised
and broken/restored cases require zero source passage. The break uses a -15,000
pressure floor, restored to -80,000 at 30 simulation seconds without rebuilding
the water. A fresh filled setup supplies the actual primer needed to run again.

Head response compares the same fixed five-second interval, two to seven
simulation seconds after opening. Greater head must increase speed, and the
ratio must be within 35% of the square-root head ratio. This is a directional
game-physics check, not a calibration of absolute Bernoulli speed. Pressure
convergence and cavity-volume diagnostics can still fail during otherwise
working transfer. No physically accurate cavitation limit is claimed.

Private buffers, frozen runtime sources, screenshots and the acceptance report
are under `research/water-machines/siphon-release-validation/`. The selected
18-case report and acceptance are in its `acceptance/` subdirectory, with the
original recordings, fresh settling records and extended valve records retained
alongside it. All stock runs transfer 50.27% to 51.42% by two minutes. Interrupted
receiver inventory changes range from -0.075% to 0.265% over the final minute.
One extended valve run still misses the final ten-second speed target through
backward oscillation; that result remains explicit in the public JSON.
Head-response ratios are 5.1% to 7.6% below the ideal square-root ratios, and
absolute initial speed is about one quarter of the ideal value. Run the integrated
harness with `FRAME_MODE=native NATIVE_PASSAGE=1`, the six cases above and the
three seeds, then run the siphon result checker against that output directory.
The valve case uses primary actions at 10, 25 and 35 seconds and an `observe`
checkpoint at 120. Public measurements are in
`assets/images/water-machines/siphon-result-2026-10-09.json`.

## Greedy cup behavior

Open `archive/water-smoke-slime/water-smoke-slime.html?scene=cup` and choose
**Drop the slime**. One large slime raises the water over the bend. The same
native particles travel through the tube into the lower tank. Restart restores
the initial cup. Ordinary scenes and the Build tools remain available.

The apparatus has a fixed 1,120 by 664 world, 8-pixel walls, about 69,000 water
particles, a 16-pixel rising bore and an 8-pixel descending stem. A perforated
shelf holds the slime above the intake. Resizing changes the camera, not the
apparatus or particle count. Selecting the cup from another world reloads its
canonical dimensions and preserves manual pause. A paused initial draw waits
for the rainbow renderer to finish configuring the shared canvas.

The full cup and its controls fit the available browser height, including
1512 by 820 and 1512 by 700 MacBook viewports. The shorter desktop header leaves
more room for the apparatus. Water renders at the fitted display resolution;
the physical world and particle buffers keep their original size. The footer
counts executed host frames, including rates below 20, and shows zero when paused.
Its FPS value does not measure the completion of queued GPU water frames.

The primary slime always starts as a ball, independently of the ordinary spawn
shape. Its 16-pixel point pitch uses 91 points and 264 springs instead of 397
points and 1182 springs. Its radius and displaced area are preserved within
mesh discretization. A wider held material patch lets the giant follow pointer
drags without the topology guard repeatedly rejecting the same movement.

The cup adds a pressure solve to the existing native water engine. It retains
the native density response and affine particle state. Closed wall faces remove
the normal component of the difference between native and provisional velocity;
the affine state uses the derivative of that same reconstruction. Gas pressure
uses each measured cavity volume while preserving its carried gas amount.
Density-sensitive kernels preserve dense interiors and expose separated water
without moving any parcels.
There are no timed flow rates, relocated particles or second liquid system.

The cup uses 32 red/black Gauss-Seidel sweeps of the four-face water pressure
stencil. Each color reads the other color while gas pressure stays fixed;
gas updates after both colors, using the previous sweep's water contributions.
The legacy Jacobi solver remains the default outside this opt-in setting.
Pressure maxima reduce inside each 128-thread workgroup before one global
atomic update, preserving the exact bound. Moving slime geometry reuses sorted
scanline crossings rather than repeating a full polygon traversal for every
sample; its 8 by 8 sampling rule and shared face openings are unchanged. Further
wall/face caching and sparse geometry uploads were tested and discarded: they
reduced CPU geometry work but did not improve real presentation FPS in the paired
Retina runs. These changes are not in the released host or air module.
A moving-guest repeat control also did not reproduce full native hashes with
identical sources; geometry-only comparisons are not treated as a full native
simulation-equivalence certificate.

These shared-engine hooks are opt-in. They allocate no air resources in ordinary
Sluice or toy scenes. Integration preserves the newer production snow and water
changes rather than replacing the engine with the older development file.

## Release checks

The focused delivery target is at least 95% of the original drainable bulk water
in the receiver within 180 simulation seconds. Every delivered particle must
cross both the actual crest and outlet. Initial tube water, rim spills and water
retained in the tube do not count. The cup must first hold for 15 seconds.
Lower-fill and correctly raised-bend controls must hold after the same drop.
All three cases run with seeds 17, 42 and 913, with exact particle counts, finite
positions and velocities, and no final particle centers inside physical walls.

`tools/test-water-machines.mjs` freezes the runtime sources and records the real
GPU buffers and passage observer. `tools/check-water-cup-result.mjs` independently
reads the saved native positions, reconstructs the frozen walls and enforces
the inventory and hold checks in these nine cases. It reports the delivery
target separately and exits with status 1 if any canonical run misses it. It writes `cup-acceptance.json` in the output directory.

Useful checks:

```sh
node tools/test-water-machines-scenes.cjs
node tools/test-water-machines-builder.cjs
node tools/test-water-machines-geometry.cjs
node tools/test-water-machines-guests.cjs
node tools/test-water-machines-buoyancy.cjs
node tools/test-water-machines-instruments.cjs
node tools/test-water-machines-physical-scale.cjs
node tools/toy-engine-sync.mjs --check
node --check js/sluice.js
```

For integrated delivery, set `NATIVE_PASSAGE=1`, `SEEDS=17,42,913` and an external
`DUMP` directory. Supply `CASES` as a JSON array, all with `machine: "cup"`,
`world: {"w":1120,"h":664,"tile":8}` and
`actions: [{"at":15,"type":"primary"}]`:

| Case name | Options | Seconds |
| --- | --- | --- |
| `canonical` | `{}` | 180 |
| `lower-fill` | `{"level":288}` | 70 |
| `raised-bend` | `{"crest":84,"level":192}` | 70 |

Screen y increases downward. A smaller crest y raises the bend. Run
`node tools/check-water-cup-result.mjs /path/to/DUMP` after the harness exits.

Feature-off tests take `BEFORE=/path/to/saved-production-liquid-wgpu.js`:
`tools/test-water-pressure-feature-off.mjs` checks all legacy shaders and 96
CPU command-frame pairs. `tools/test-water-pressure-feature-off-gpu.mjs` compares
18 native-buffer captures and six full render targets on real WebGPU, then boots
ordinary Sluice and the toy. The release baseline is production commit `0e2dde82`.

`tools/test-water-cup-viewport.mjs` checks fixed geometry, visible paused water,
manual pause and scene selection at desktop, MacBook, short desktop and
landscape phone sizes. `tools/test-water-cup-handling.mjs` checks an actual
Retina pointer drag, primary shape independence and the GPU pressure maximum
at both full and partial workgroup sizes. It records FPS and simulation timing
without treating hardware-specific timing as a portable pass threshold.
`tools/test-water-machines-geometry.cjs` compares 32 moving concave and
overlapping body poses with an independent point-in-polygon oracle.
`tools/test-water-demo.mjs` covers the ordinary toy and missing-GPU
fallback. `tools/test-water-machines-build-share.mjs` checks actual desktop/touch
construction, undo, redo and sharing with the GPU disabled.

Run GPU checks one at a time using the owned Chrome for Testing harnesses.
Never launch the personal Chrome app headlessly. Shared engine changes require
the game version/build and toy-engine-sync steps in AGENTS.md.

## Limits and evidence

The v5.39 build delivers at least 96.39%, 99.38% and 99.74% in the three canonical
runs, exceeding the 95% target in each. The previous v5.37 measurements were
97.43%, 98.67% and 93.30%, with the third below the target. This remains a
public experiment.

Delivery success does not certify calibrated pressure, exact gas-volume
accounting, smooth guest contact or real-world timing. Pressure and phase checks
still fail during portions of the drop. Local particle crowding and contact
corrections remain. The public post keeps these limits visible next to the
measurements; Instruments labels its readings as diagnostic when appropriate.
Five particles crossed the rim in seed 17. The older passage observer stored
rim and passage flags separately, so the checker conservatively subtracts all
five rim spills in the receiver from that run's delivery count. Its delivery
percentage is a lower bound. The observer now excludes rim flags directly.
The 95% target still passes with those particles excluded; this does not claim
that splash-free contact has been solved.

An owned-browser Retina comparison at 1512 by 820 averaged 31.31 and 30.19
milliseconds per frame in two v5.38 baseline samples, bracketing the v5.39
sample at 21.20 milliseconds. All samples use the primary slime and 69,307
particles. The separate Retina handling check advances 1.53 simulation
seconds per wall second, near the intended 1.55, with zero rejected drag steps.
These are hardware-specific presentation measurements, not a 60 FPS guarantee.

The post links compact public release measurements. Raw buffers, source snapshots
and screenshots for v5.39 are in
`research/water-machines/cup-responsive-validation` in the owner workspace.
The previous release evidence remains in
`research/water-machines/cup-production-validation`; the post labels its
screenshots as the previous version. Earlier numerical experiments and their
many passing unit fixtures are not evidence of a finished pressure model.


The compact pressure-dispatch trial remains private. Its default-off compiled
shaders and commands match the current air model; 24 prescribed-input GPU
fixtures match all compared buffers through three pressure steps. A separate
cup off/on/on/off trial retains the original scheduler and native remainder
fix, with two seconds warmup and six seconds sampling per fresh document.
The air pass averages 1.691724 ms off (272 samples) and 1.702492 ms on
(266 samples), with no timestamp drops or runtime errors. This demonstrates
no speed gain, so the option is not activated or copied into public runtime.
The public artifact preserves source hashes, raw air-pass samples, frame
intervals, coverage and the bounded measurement limits. A new native-chain
recorder initially failed on a missing COPY_SRC observation capability; that
failed record is preserved and supplies no equivalence acceptance. The post
uses "unproved" for the remaining initial-condition error bound, rather than
suggesting a proof that error is infinite. The v5.51 host change is its version
label only.


Two further performance experiments are rejected. The private pressure-bound
revision preserves 24 isolated grid/direct/prescribed-MAC fixtures through three
GPU steps, but its paired cup air-pass mean rises from 1.696371 ms to 3.051694 ms
(79.895% slower). All four documents complete with verified source bytes, zero
errors or timestamp drops, and exact owned-browser closure. Fewer dispatches
do not establish faster GPU execution. No repeat or full physical suite runs
for this revision.

The separate strict-default-off explicit-face packing experiment preserves
packed geometry bytes, validation errors and counters, shader/resource/command
records, and complete uploads in 120 bounded CPU geometry pairs. Its first
paired cup trial has OFF 310 calls at 1.869355 ms and ON 308 at 1.679870 ms,
a 10.136% decrease that narrowly clears the fixed 10% pooled and 5% adjacent
thresholds. The unchanged repeat has OFF 310 calls at 1.615161 ms and ON 314
at 1.862739 ms, a 15.328% increase. Both recordings complete with verified
source bytes, zero errors/drops and owned-browser closure. Every observed CPU
call is retained. The failed repeat ends promotion; no full physical suite is
run for this candidate. Headless RAF rates and overlapping CPU spans are not
display FPS or hydraulic acceptance.

The revised native recorder completes the three canonical short-chain sets,
but the next grid fixture uses pressure pitch 16 with native pitch 2.5, an
unsupported fractional ratio. Overall recording remains incomplete and failed.
A separate offline diagnosis verifies 216 compatible native count-sort
contracts and exact captured buffers outside the legal within-cell sort order.
Cup RNG metadata still differs, missing coarse-grid/MAC coverage stays explicit,
and the strict gates remain inconclusive. These short observations establish
neither full native equivalence nor future physical acceptance.

The public pressure-performance-followup-trial-2026-10-09.json artifact retains
the isolated checks, both CPU trials including raw primary call durations,
source/report hashes, rejection decisions and recorder limits. Toy v5.52 changes
only the runtime version label; shared native v28.179 and all rejected options
remain unchanged. The quiet released air-pressure view remains available.


The private cacheWaterWeights revision fails its exact original-output gate.
Three grid/Jacobi fixtures complete nine matching steps. The quantization-edge
fixture matches two more, then changes pressure and fine-grid velocity at
its third step (dt 1/90). Both current-water cache tails still match the
independent original-expression GPU probe word for word. Production and
candidate-off remain byte-exact through all twelve attempted checkpoints.
Standalone coefficient equality therefore does not establish unchanged consumer
arithmetic or final outputs. The observed finite differences remain failures;
no tolerance is relaxed.

The recorder stops before the remaining twenty fixtures and all six deliberately
skipped-refresh controls. RecordingComplete is false, no fixture GPU error is
reported, and the exact owned browser exits. No timing, full physical suite or
promotion is admitted. The public stencil-weight-cache-trial-2026-10-09.json
artifact preserves all recorded raw buffers, hashes, the partial scope and
rejection decision. Toy v5.53 changes the version label and progress evidence
only; the shared native engine, released air solver and overlay are unchanged.


A bounded independent saved-record review reproduces 44 checks, verifies all
648 raw records and replays geometry and actual uniform uploads exactly. The
pressure x difference is at most two ULPs, but it remains an exact-gate failure.
A separate saved-auditor restriction assumes full 64-byte config writes and
would reject the unchanged legal four-byte minimum-pressure update at offset
32. Partial-write replay matches the actual captured uniforms. This recorder
restriction is preserved explicitly; it neither causes nor removes the
observed candidate pressure/velocity mismatch. The precise first divergent
arithmetic instruction is unresolved without intermediate captures or compiler
IR. A change in rounding context remains an inference, not a measured cause.


The narrower private cacheWaterFaces candidate stores only clamped face openings;
consumer timestep multiplication and density division remain unchanged. All 24
isolated grid/direct/prescribed-MAC fixtures complete three original encodes,
with byte-exact production/OFF/ON original allocations and prefixes. Both current
water cache tails match the independent original faceOpen GPU probe, including
the previous quantization case at dt 1/90. All six deliberately skipped-writer
controls are detected. The independent raw audit verifies 6,859,920 bytes and
17,632 face words. This gate prescribes fine-grid/MAC inputs; actual native
particle gather/collision and full-window physical acceptance remain unproved.

Two incomplete recorder attempts are preserved. The first reaches 48 matching
positive checkpoints, then lacks COPY_SRC permission for MAC terrain copy-out.
A symmetric fixture-only device wrapper repairs that readback permission. The
second completes all 72 positives, then supplies a bind-group layout where its
negative-control pipeline needs a pipeline layout. The final recorder constructs
the matching pipeline layout explicitly. Candidate, numerical inputs, raw
acceptance predicates and tolerances remain unchanged. Only the complete final
recording admits timing, and every exact owned Testing child exits.

The paired natural cup trial records four fresh Retina documents in OFF/ON/ON/OFF
order, seed 17, with two seconds warm-up and six seconds sampling per row. All
source and active-option checks pass, with no errors or timestamp drops. Pooled
OFF costs 3.096600 ms across 185 air passes; ON costs 2.763670 ms across 185, a
10.751% decrease. The adjacent ON/OFF ratios are 1.471120 and 0.537226. The fixed
qualification floor requires pooled ratio <= .95 and both adjacent ratios <= .97;
the latter fails. This establishes no reliable playback gain. No repeat, full
physical suite or promotion follows, and RAF rate is not display FPS.

The public stencil-face-cache-trial-2026-10-09.json artifact includes the raw-audit
receipt, timing decision, source pins and lossless gzip/base64 archives of all
four raw reports, including both recorder failures. Decompression reproduces the
original byte lengths and SHA256. Toy v5.54 changes only progress evidence and
the version label; the released air solver, overlay and shared native v28.179
remain unchanged. Gas retention, quantitative flow and energy, sustained laptop
and phone playback, and final polish and audit remain unfinished.

## Actual native air-ownership loss (October 9, 2026)

A bounded read-only recording captures one loss in the released Heron nozzle
with seed 17, original host scheduling and native resident particles. The air core
at pressure cell 2858 crosses from water fraction 0.427658439 to 0.455084264, past
the actual threshold 0.449999988. The three cells previously assigned to that
pocket all become LIQUID with no current air owner. Gas destination is NONE;
its entire prior amount 16422 at volumeScale 256 becomes unassigned. At this step
there is no captured or vented amount, and current inventory decreases by exactly
16422. It is an ownership loss, not a vent of this pocket.

The former core still estimates 54.4916 percent void, and the old footprint still
estimates 63.6762 square world pixels of void. These are the existing sampled
localAirArea diagnostics, not a sharp geometric gas volume. Twenty-five native
particle centers occupy the core cell. This transient sampled cavity proves
modeled inventory loss; it does not prove a stable physical bubble or a matched
interface force, work or material-volume change. A neighboring cell has another
air owner, so spatial proximity alone cannot justify moving the lost inventory
there. Retaining a counter alone would not repair pressure coupling.

The first observed loss is encode 496 after initialization, absolute model
encode 499. The observer retains 511 encodes because polling allows already
submitted work before pause. Actual initialization modelSteps 3 and nativeClock
.025 remain explicit. Uniforms and geometry are unchanged across the captured
seam. All 92603 resident particle inputs are finite. The post-observer copies
exactly match post-pressure bytes, and all retained observer mutation counts are
zero. The witness records actual pre-pressure, post-pressure, post-observer and
previous encode input buffers, including history, labels, geometry, both pressure
buffers, transport, all resident allocations and fixed active native grid
prefixes. PRE history is the preceding pressure state; current PRE particles
already traversed the prior gather and collision. POST is before current gather
and collision. These timestamps do not establish an uninstrumented trajectory or
performance.

The first recorder attempt verifies source bytes but fails before installation
because its CDP expression uses await without an async context. Its exact owned
Testing child exits 0. A fresh derivative wraps only installation/cleanup in async
IIFEs. That run completes 512 observed encodes without a loss, and is inconclusive;
18 additional final encodes are outside observation. A further derivative extends
only the observation ceiling to 8192, with the same 180-second wall cap, and finds
the above event before 511. All prior results remain intact. Different short-run
outcomes reflect host-scheduling trajectory variability; the witness does not
promise deterministic first onset. Original shader physics, settings, iterations,
particles and scheduling remain unchanged. All exact owned browsers exit.

The native-air-ownership-loss-2026-10-09.json public artifact retains the three raw
reports, source freezes, observer/decoder sources and both valid ledger captures.
It reproduces all 40,446,528 bytes of the four-section witness snapshot, using
lossless gzip/base64 blobs shared by identical allocations. Raw sizes and SHA256
are checked after decompression and reassembly. Root independently audits the
saved buffers; a second read-only review reproduces all 76 section/allocation
hashes, each current owner and the exact inventory drop. Toy v5.55 updates progress
and the version label only. The quiet air overlay and released native/AIR solver
remain unchanged. General retention, matched pressure/volume coupling, physical
machine calibration, sustained laptop/phone performance and final polish/audit
remain unfinished.


## Startup pause and smaller native test (October 9, 2026)

Toy v5.56 replaces the unconditional boot startLoop call with syncRunning.
It honors the existing pause, visibility and intersection state before requesting
a simulation frame. Native/AIR/MAC sources and all numerical settings are unchanged.

A private 96 by 88 baffle test uploads 2,048 actual native water parcels once.
The first attempt fails before fixture initialization because Empty ignores the
machine-only paused query. A boot-only private pause seam reveals a second issue:
the released unconditional boot loop advances 0.0916667 native seconds while the
pause flag is true. That incomplete attempt remains failed. A manual pause API
workaround captures the native defect at pressure step 1,532; the released startup
fix passes the unchanged zero-clock boot assertion without that workaround.
Its separate natural trajectory captures loss at step 843. The original overlap
pass is nondeterministic, so these runs are not an exact trajectory comparison.

Both completed tests make 1,024 controlled update calls and record 1,587 real
pressure encodes, totaling 13.225 native seconds. The original sampler's local
45% AIR-to-WATER transition drops positive gas ownership in the smaller apparatus.
In the first completed run, root82 loses 36009/1024 ambient-normalized area units,
while its prior three-cell footprint still estimates 42.8665733 square pixels
of void. All native active fields are finite, observer POST copies match, exact
loaded sources are verified and both owned Testing children exit0. All failed
attempts, frozen sources and complete raw snapshots remain in the public evidence.

The outer border is solid, but the released host still places18 room-reference
seeds in the top band. This is an ownership-loss diagnostic, not a physically
sealed gas-conservation test. It is controlled stepping with observer overhead,
not default-cadence playback, performance or machine physical acceptance.

An offline motion-map derivative follows the native quadratic weight derivative,
the pressure field's midpoint chain rule, radial speed limit and world clamp.
It retains the native CELL constant separately from rounded invCell. On 2,046
smooth saved samples, coordinate perturbations agree within 1.02e-10 in Double.
Two branch-crossing samples remain excluded. Six controls cover known translation
and affine motion, clipping and a deliberately omitted midpoint chain term.
This is not a Float32 bound, intrinsic material J or a pressure-force repair.
Collision, declump and the geometric volume derivative/transpose force remain
unfinished. No new formal initial-condition requirement is imposed.

The actual browser air-view regression boots and plays all three machines and
checks both synchronized overlay controls without errors. Its short frame samples
do not establish sustained 60 FPS or phone performance. Evidence:
assets/images/water-machines/native-baffle-and-startup-progress-2026-10-09.json.


## Native material carrier and air-cell walls (October 9, 2026)

Toy v5.57 publishes the AIR closed-wall reconstruction and its consistent affine derivative, retaining moving closed-face speed. Shared native v28.179, gravity 250, time scale 1.55, gas ownership, pressure settings and MAC remain unchanged. The progress section keeps the current findings visible and folds earlier records behind an existing details component.

The original cup recorder first boots Falls, producing a failed native collision self-test and an 1118 by 663 world. Its complete nine-run delivery audit is limited evidence, and original full qualification remains failed. Machine startup is now explicit and paused, yielding the actual 1120 by 664 apparatus. A clean static-wall suite delivers 101.25105, 101.06017, 94.66792 percent. Seed 913 misses 95 percent, so that version is rejected. No errors or wrong-size recordings are discarded or relabeled as passes.

The moving-wall candidate preserves actual closed-face normal speed, including different speeds on opposing faces and their spatial derivative. Its shader test covers 1,152 configurations, all 16 face masks, three wall-speed patterns, water/air/unsupported cell labels, solid cells and reconstruction disabled. 531 unaffected before/after pairs match exactly; 45 closed-wall combinations repair the old bypass and pass independent affine finite differences. The fresh nine-run cup suite delivers 101.8%, 98.4%, 98.8%; its delivery target result is True. Counts, finite resident fields, containment, pre-drop hold and lower-fill/raised-bend controls pass. These inventories do not certify pressure, gas volume, work or performance.

A new closed 96 by 88 baffle contains 1,680 native water parcels with rest volume 1.5625, no room anchors and ordinary released gravity and timing. This differs from the earlier 2,048-parcel fixture. Private native callbacks carry J from the determinant of the actual quadratic and midpoint displacement map. Sampled density and APIC moments are not material J. Rejected contact, declump/recovery, world-bound and nonpositive events keep old J and an unsupported flag. Baseline parcel 1679 crosses the bottom at native step 20 because AIR cell 118 skips its closed mask 10, then collision rolls it back. The private static-wall carrier records 49 actual steps, 0.408333 native seconds, with all 1,680 supported and no contact/recovery/bounds/nonpositive events. Independent errors are at most 1.66903e-7 in F, 3.85106e-6 world pixels in position and 1.82208e-7 in determinant. Actual released gas ownership still drops at step 32.

The existing sharp contour and overlap ledger reconstruct one connected gas region from accepted native material and positions. A pure noncondensable isothermal adapter uses the released atmosphere setting (3796635.5), without the earlier vapor-background oracle. At six saved checkpoints, water plus gas closes the 5568-pixel domain to about 1e-11, and amountRT stays 11,173,498,276.5. This remains offline and does not resolve general topology or contacts.

An actual-native control adjoint includes the midpoint chain, determinant and spatial/control mixed derivatives. Three directions match freshly reconstructed intrinsic water plus gas energy derivatives within 6.61e-6; omitting material work fails. A bounded nonlinear correction pairs native fine-grid velocity with its measured P2G nodal mass. Its 38 CPU iterations reduce potential plus correction inertia from 3345.15996 to 341.77300, with residual 0.22251 below 0.23948. It holds projected/provisional faces fixed and starts after the released pressure update, so it is not a replacement coupled pressure solve. Its 52.6-second CPU cost is not real-time performance.

One guarded native update applies that correction to 512 grid nodes after all 54,116 input words match the saved solve. All 1,680 materials remain supported. Actual Float32 positions and material J agree with the CPU result within 3.82e-6 and 1.38e-7, respectively. Independently reconstructed potential is 128.63862, compared with the CPU estimate 128.63625. Gas amount stays fixed and water plus gas closes to 1.82e-12. Geometry and energy are still measured offline, and the experiment does not replace runtime gas ownership or handle general contact and topology changes.

Evidence preserves the source freezes, complete candidate 49-step raw traces, selected full baseline contact sections, force and inertia source/results, the failed older recorder and static qualification, and all initial/held/final position bytes needed by the unchanged cup inventory checker. Detailed cup pressure trajectories and other cup native buffers remain private and are not certified. Lossless recording blobs are verified by size and SHA256 after reassembly. Runtime gas ownership/force replacement, calibrated flow/energy, natural bubbles, sustained laptop/real-phone performance and final polish/audit remain unfinished.

Evidence: assets/images/water-machines/native-water-volume-and-wall-progress-2026-10-09.json.

The recording package uses a JSON index and native-water-volume-and-wall-recordings-2026-10-09.zip. Reversible byte-lane shuffling improves the ZIP compression of particle fields. The compacted pair occupies about 26.9 MB, compared with the original 43.4 MB embedded index. All 383 original archive paths and all 873 original blob hashes remain byte-identical; the decoder and packaging source add two more records. The ZIP is a public asset on GitHub release water-machines-evidence-2026-10-09, keeping its 26,494,208 bytes outside the Pages site artifact. The same ZIP checksum and original records are retained. Verify or restore files with tools/unpack-water-evidence.py, which also accepts the older embedded gzip/base64 packages. Its --output destination must be a new directory.

## One-pocket pressure reduction (October 9, 2026)

For a fixed closed domain with one connected gas region, gas volume is domain area minus the sum of carried water volumes. Its derivative is the negative of the material-volume derivative. The private inertia correction now uses that identity inside each pressure iteration, retaining the same captured native field, P2G mass, projected/provisional faces, parameters, branch guards and gas amount. This changes no released solver or shared native source.

The unchanged 38-iteration solution reduces potential plus correction inertia from 3345.15996 to 341.77300. Recorded solve time is 14.826 seconds, compared with the earlier 52.594-second trial. These are single CPU trials, not a controlled benchmark or sustained-performance result. A separate 59-second audit reconstructs all 39 accepted iterates with the original sharp geometry, checks actual gas overlap continuation and compares five full transposes. Maximum energy difference is 2.57e-9, gradient difference 2.14e-14, volume closure 6.37e-12. Final positions differ from the original solve by at most 7.11e-14 and material J by 3.56e-14.

The first independent directional audit fails at a 1e-5 perturbation, where energy and contour reconstruction roundoff are amplified by division. Its failed source and stderr remain preserved. A declared five-step sweep checks both directions at initial and final states; three of its 20 checks remain failed. All four checks at 1e-3 agree within 6.06e-7 relative error. A fresh full audit changes only the perturbation to 1e-3, retains the original 2e-5 tolerance and passes. The solver source and result are unchanged.

This reduction assumes one connected gas pocket and a fixed domain. General multiple-pocket ownership, gas topology, contacts, a coupled runtime pressure replacement and repeated actual force application remain unfinished. The separate geometry audit is excluded from the solve cost, and 14.8 seconds is still far from live use. Sources, freezes, original failure, all sweep records, complete accepted corrections and audit: assets/images/water-machines/one-pocket-pressure-reduction-2026-10-09.json. The previous native recording is referenced by its exact public evidence hash.


## Slime sauna

The stone shelf sits above a small fire. Pour water onto the shelf to make white
steam. The stones have finite stored heat, lose heat to contacting water and
exchange heat with the finite fuel reservoir. Heat gained by the stones is
subtracted from the fuel on the same GPU queue, and hotter stones can return
heat to it. Oxygen consumption supplies the fire's new chemical heat. A native
water parcel leaves the liquid only after
receiving its sensible and latent heat at room-pressure boiling. Its inactive
slot records escaped vapor, so pouring repeatedly does not duplicate water.

The room and bath warm gradually. The slime blushes and gently moves when
relaxed, then becomes restless when too hot. Temperature labels show the stones,
room and guest. Stop pouring to let the vented room cool. Grabbing a slime
suppresses its automatic motion; carrying it outside the sauna cools it.

The white plume uses the existing air solver. Room mixing, bath temperature and
guest comfort are approximate: twenty percent of vapor enthalpy heats a mixed
room, with finite cooling and temperature relaxation. This open sauna does not
resolve steam pressure, condensation or a calibrated biological model. The
shared liquid engine and Sluice are unchanged.

Validation stays small: JavaScript syntax checks and one owned Chrome for
Testing interaction check. Pouring makes paid evaporation warm the guest;
repeated pours draw down the finite stone heat rather than guaranteeing that
every admitted parcel boils. The test copies both GPU reservoirs after their
last exchange and verifies that fuel heat lost equals stone heat gained,
chemical input stays within measured oxygen reaction heat, and the combined
ledger closes. Pause and changing scenes are also checked.
Run `node tools/test-water-sauna.cjs` for that interaction check.

## Thirsty slime

Toy v5.179 lets the slime drink up to sixteen times its dry area, then expel
that water when squeezed. Drag either gold handle inward. Compressive contact
with the jaws raises pore pressure, and several exposed pores send water jets
outward. The slime shrinks as its stored water leaves. Release the press to
unload it and let it drink again. The source toggles the falling supply;
Water off starts with a dry slime.

The 127-node mesh uses central nonlinear elastic springs and local signed
triangle-area constraints. Four XPBD iterations run inside every existing
microstep, with terrain and jaw contact interleaved. The linked jaws have
finite mass, compliant pointer and return springs, and reciprocal gel contact.
The pointer never assigns a jaw or skin position. Contact friction and internal
damping control sliding and rebound. Material flecks follow their triangles;
Instruments reveals the actual spring mesh.

Eight pores follow fixed material vertices and their current surface normals.
Pores covered by a jaw or terrain cannot discharge. Compressive jaw traction
during an active squeeze, averaged over the loaded height, supplies pressure.
Bumping an idle jaw does not open the pores. An orifice approximation
sets exit speed from pressure above a small opening threshold and the water's
mass per area. Each open pore has a 3.2-pixel width and a 0.78 discharge
coefficient. The numerical exit-speed limit is 350 pixels per native second.
The same native liquid solver carries the jets after exit, including gravity,
collisions, breakup and runoff. No separate decorative spray is drawn.

The contact pass transfers a native parcel that reaches the skin from flowing
ownership (state 1) into absorbed ownership (state 2). A serial discharge pass
releases only those stored slots, preserving their IDs and the fixed 32,768-slot
inventory. It decrements the stored count and increments the discharged count.
Cumulative uptake equals stored plus discharged parcels. A released parcel
stays live but has a 0.65-native-second reabsorption delay; positive pore
pressure also prevents immediate uptake. Falling water can be absorbed again
after unloading. Other scenes keep their existing allocation and solvers.

Each currently stored parcel adds 1.5625 square pixels to elastic rest area.
Springs, spacing, triangle areas and material highlights follow both growth
and shrinkage. GPU readback records the cohort applied to the host mesh as
grownParcels. Per-pore jet impulses return as opposite impulses to normalized
local material patches on that readback. Both jaws remain moving obstacles
for native water, and the skin uses its full grown bounds.

This is an approximate porous-gel toy. Pore pressure is inferred from contact
traction rather than a resolved internal pore-fluid field. Readback delays the
returned jet impulse, and ordinary water drag and swelling work remain
approximate. The complete system does not claim calibrated material properties
or a closed energy budget. The shared Sluice engines are unchanged.

Run `node tools/test-thirsty-slime.mjs` with owned Chrome for Testing. The test
uses desktop mouse and emulated landscape touch, with screenshots and measured
states in `/tmp/thirsty-slime-review`. It checks dry and off-stream controls,
full growth, multiple native jets, faster jets under greater load, decreasing
stored water and skin area, exact ownership, recoil, release, refill, pause,
restart and scene cleanup. These checks do not establish real-device performance.

## Gold sluice box

Toy v5.197 uses the dimensions of the [Keene A52](https://www.keene.store/?Product_Code=A52&Screen=PROD): 51 inches long, 10 inches wide, and 4.5-inch sides. Set up also offers the [36-inch A51](https://www.keene.store/mm5/merchant.mvc?Product_Code=A51&Screen=PROD). Both use 24 world pixels per inch in a 1440 by 584 world. Changing the angle projects the same physical bed length onto x and y; the ruler follows the slope. This is a longitudinal section, with width extending out of the page. Riffle spacing, the thickened collision floor, and the cleanout chute are model choices. Manufacturer matting, expanded mesh and exact lining profiles are not reproduced.

The drawn polygons are the collision polygons. Water, quartz, magnetite and gold keep separate APIC momentum, shared compressive pressure and common gravity. Density ratios are 1, 2.65, 5.2 and 19.3. Magnetite is a common component of placer black sand; its density is documented by [USGS prospecting guidance](https://pubs.usgs.gov/gip/70039396/report.pdf). Native grain origins 2 and 3 select magnetite and gold mass and pigment. The unused oil momentum slot carries magnetite here, without oil transport or filters. Other jars retain their original three-phase shader. Shared rendering adds an optional black-sand pigment; default game grains retain their original appearance.

Grain pairs use complete neighbor traversal, snapshot Jacobi updates, inverse-mass position correction and equal/opposite normal and Coulomb-friction impulses. Water/grain drag uses the same volume-based coefficient for all three minerals. There are no destination forces, capture switches or frozen gold. During washing and rinsing, every admitted particle stays in the simulated world.

The water slider is also the valve: zero is off; 25 to 150 percent supplies a trickle through strong flow. The drawn faucet uses the same valve. The paydirt slider admits zero to 240 grains per native second. One scoop or a tap on the drawn hopper releases at most 120 grains from the same supply. The practice hopper contains 2,400 grains: 2,202 quartz, 192 magnetite, and six gold. Gold is 0.25 percent of the grain count, deliberately enriched for visibility rather than an assay of natural placer grade. The approximately 1.5 mm grains represent screened material. Oversize gravel, clay cohesion and gold-flake shape are outside this model. The optional starting sample contains 176 quartz, 15 magnetite and one gold. Seeded shuffling is independent of the seven outlet lanes, and a material comparison starts with identical positions and identities.

The external water tank initially accounts for 36,000 additional parcels. An explicit refill adds up to 18,000 parcels to the finite reserve, limited by the tank level and native resident capacity. It does not inject any water into the box. Supply clocks follow native time, including quarter-speed playback, without banking time while a valve is closed or the app is paused. Pause and focus loss close both valves.

Cleanout closes the inputs, lifts the riffles, and inserts a solid return chute above a separate concentrate pan. Water then carries the mixed residue left into the pan. The other receiver remains the tailings bin. Pick up pan reads the stopped GPU positions and material flags, transfers every water and mineral particle actually inside its bounds, and records all four materials in external storage. Empty tailings bin transfers everything in that bin to a separate discard ledger. Native swap-removal preserves every survivor's position, velocity, affine tensor and material identity. Uncollected water and minerals elsewhere remain resident. Continued water can overflow a receiver and spill mineral grains. A difficult grain may require more rinsing, and cleanout never guarantees recovery.

The console shows gold in the box, traveling, in the pan, saved, in tailings and spilled. Contents accounts for quartz and black sand too. A grain in the box may still be moving; only a pan pickup saves it. Live locations use the native position mirror and carry readback latency. The pickup selection uses an exact frozen GPU snapshot. Setup changes the next run's physical length, slope, riffle height, density comparison and initial sample. New run and restart restore supplies and preserve selected hardware settings. Inspector zoom pans between pockets without moving particles; optional procedural audio follows actual runoff and hopper transfers. It starts muted and closes its context on scene exit.

W toggles water, G releases one scoop, S selects quarter speed, and I opens inspection. Space pauses. Desktop and landscape touch use the same controls with targets at least 44 pixels tall. `node tools/test-gold-sluice.mjs` runs seeded washes, density and riffle comparisons, eleven GPU contact fixtures, source and stock controls, actual cleanup transport, inventory transfers, conservation and landscape interactions. `GOLD_CASES=station,operations node tools/test-gold-sluice.mjs` runs the operator checks. The harness owns and closes Chrome for Testing. Screenshots and measurements default to `/tmp/gold-sluice-review`. Shared grain pixels and game boot are checked by `node tools/test-water-grain-visibility.mjs`.

These are behavior and contact-operator checks. The reduced 2D model retains
exploratory drag, the native water filters, pressure limiting and unmeasured
contact/pressure projection work. It does not predict calibrated recovery
percentages, grain shape effects, turbulence or full mixture energy conservation.

The old short-box v5.154 reference runs (17, 42 and 913) wash out 44, 45 and 42 of 54 quartz
parcels at about 24.8 native seconds, retaining all 55 gold parcels. Equal
densities washes out 44 of 55 gold parcels; removing the riffles loses 31 of
55. Every checkpoint has finite state and zero bed/riffle penetrations. The
held source admits 9,615 measured water parcels before the test releases it,
then admits no further water. These are recorded examples, not fixed recovery
percentages or deterministic trajectories. The ordinary three-phase shader
remains byte-identical; the shared rendering and Sluice boot regression passes.
