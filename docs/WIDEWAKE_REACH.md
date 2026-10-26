# Bracken Reach, the playable world

## Hull collisions, sinking and attack pressure, 2026-10-25 (v0.43.0)

The owner's latest combat direction supersedes the previous standoff orbit and
proximity braking. Attackers keep propulsion through their approach and attack
passes. Skiffs and flankers commit through an intercept, clear the target and
turn back with room for another run. Gunners make firing passes. Rams retain
their warning and committed charge. Crowds and actual banks can still obstruct
a boat, and a real collision can take speed away.

`js/widewake-contacts.js` owns physical hull contacts. It uses the shared hull
outlines, swept movement, mass, angular momentum and sliding friction. Bow
impacts, glancing scrapes and moored hulls therefore have different responses.
Friendly contacts do not damage allied hulls; high-energy enemy contacts damage
both participants. Touching an enemy no longer removes it. Crews detour around
occupied friendly hulls using terrain-checked steering rather than driving into
the flagship while trying to hold a formation slot.

Contact foam and spray follow the actual collision normal and energy. Hulls yaw,
pitch and roll from the impulse, with a separate wood, metal and water sound.
Destroyed enemies split into bow, middle and stern sections, list and plunge
below the sea plane, then leave broken white water, bubbles and floating planks.
The 4.8-second sequence shares fixed effect storage. Visible wrecks are capped
at 128 in WebGL and 32 in Canvas, with 128 aftermath records and 384 floating
planks; damage never depends on these visual limits.
WebGL and Canvas follow the same stages, including waterline clipping. Reduced
motion and graphics-context restoration remain supported.

The owner requested a BELTFED reference review. Its
[official screenshots and motion](https://www.hoodedhorse.com/games/beltfed)
informed the emphasis on sustained pressure, a distinct impact onset and readable
aftermath. This is an interpretation of the published media, not a claim about
that game's implementation. Widewake uses its own nautical models and effects.

Focused checks add `test-boat-contacts.cjs`, `test-enemy-pressure.cjs` and
`test-combat-overhaul-browser.cjs`. The parked snapshot helpers preserve attack
passes and contact totals; this does not enable saving in the game.

## Gunfire, contact and raider handling, 2026-10-25 (v0.42.0)

The owner asked for a substantial improvement to rounds leaving guns, enemy hits
and enemy movement. Friendly turrets now traverse before firing. The simulation
and renderer share the barrel endpoint, including hull heave, pitch, roll and
recoil. Direct rounds inherit the firing vessel's velocity; lead uses relative
motion. Their height follows gravity and is swept against the actual moving
hull outline and deck height. A round passing above a boat cannot damage it.
Mortars retain their authored flight timing and arcing presentation.

Missed rounds meet the moving water surface. Contact effects originate at the
actual entry point and carry the incoming direction. Small kinetic hits transfer
limited hull-weighted momentum and yaw; explosive pressure retains its separate
larger response. Metal strikes, water fans and heavy explosions use different
presentation. Destroyed enemies leave a bounded drifting hull that settles into
the water, rather than disappearing on the damage frame. Damage and removal
remain independent of visual and sound budgets.

Raiders keep heading, yaw and propulsion separately from world velocity. Their
bow turns before lateral momentum catches up. Gunners approach a stable handed
standoff arc, light boats have their own acceleration and steering, and rams
retain a committed warning and charge. Local anticipation and contact braking
keep crossing traffic and queues from passing straight through one another.
Navigation still checks the shared water field and existing bank clearances.

Small projectile heads and thin tapered tracers replace the large opaque rods.
Muzzle flashes, smoke, hostile gun mounts, compact enemy wakes, directional
strikes and sinking use bounded instancing or effect storage. Canvas mirrors the
same events; reduced motion suppresses muzzle flashes and extra wake cues.
Gunfire, metal contacts and water strikes have separate synthesized cues, with
distance attenuation and bounded voice cleanup.

This pass does not enable saving. The parked pure snapshot helpers preserve
trajectory, turret and enemy steering state for continuation checks, accepting
optional defaults for older records. The normal voyage still lives in memory.

Focused checks in `tools/widewake/`: `test-combat-ballistics.cjs`,
`test-enemy-motion.cjs`, `test-combat-snapshots.cjs`, `test-combat-audio.cjs`,
`test-combat-feel-browser.cjs` and `test-combat-runtime-browser.cjs`. The shared
projectile, water-pressure, connected-voyage and full-watch suites remain active.

## Harbors, fleet desk and voyage cues, 2026-10-25 (v0.41.0)

All ten ports now use surveyed banks shared by terrain, structures and pier
collision. Workshops and cargo sit on graded dry ground. Shore-following quay
walls join the working yard to the water, pier roots overlap the bank, and worn
access roads continue inland. Newer ports use the same detailed, separate
building, deck and cargo sprites as the original three. Harbor cameras fit the
viewport and leave room for the service menu.

Fleet is available at sea with F or its labelled button, and from Your boats in
every harbor, including before recruitment unlocks. The paused desk groups boats
by role, filters workboats, escorts and boats needing attention, and shows the
selected boat's hull, cargo and distance. Find on water closes the desk and any
parent service before revealing the actual vessel. Steering returns the camera
to the flagship. Close convoy and Spread out change spacing along the existing
checked wake without moving boats instantly or adding a shortcut across banks.
Workboat recall and the endgame's existing hold/follow order remain real orders.

Dockside cargo transfers move a chosen whole quantity between two actual living
holds. Max respects both the source stock and the destination's free space.
Transfers cannot run at sea or create cargo, change coins or exceed capacity.
Fleet repairs retain their existing price and progression rules.

The harbor voyage action follows delivery readiness: find or load missing goods,
plot the passage, then sell at the receiving port. Partial deliveries show the
remaining quantity. Fishing and oil work first check for the required vessel.
The chart labels the next voyage while retaining all other available choices.
Launch sailing estimates now use the crew's actual 20 m/s cruise setting.

The flagship has original layered combustion, exhaust, mechanical and propeller
sound, including the starter launch. Revs respond to actual throttle before the
hull gathers speed; cargo and hull type affect the motor. Coasting settles into
idle. Three fixed motor sources add no per-boat voices or firing timers. Harbor,
pause, mute, inactivity and context disposal retain the audio lifecycle.

Focused checks: `test-harbor-terrain.cjs`, `test-harbor-terrain-browser.cjs`,
`test-fleet-commands.cjs`, `test-fleet-ux-browser.cjs` and
`test-main-boat-audio.cjs`, plus `test-voyage-guidance.cjs` in
`tools/widewake/`. These supplement the connected
voyage, waterways, interface and session-control suites. Generated WAV listening
samples and browser review frames are test artifacts, not runtime downloads.
Physical phone performance and subjective listening still need owner review.

Owner instruction, 2026-10-19: make the new ocean part of the game, retire the old
world, and bring the graphics into one consistent visual system. This explicitly
supersedes the earlier instruction to keep the new ocean in separate trials.

Version 0.26.1 opens the approved title illustration, then starts at Tern Yard in
Bracken Reach. Each page load starts a fresh session. There is no Earth campaign or
trial chooser in the normal play flow. An old `widewake-estuary.html` bookmark
redirects to the game. `?test` retains the isolated navigation harness; the battle
page remains an engineering benchmark. The owner explicitly requested a public
endgame shortcut; the title and pause menus now launch a new automatic combat
watch in the main shell, separately from that older manual-control harness.

## Owner direction, 2026-10-19: session play and simpler controls

Saving is disabled until the owner asks to implement it again. Do not load,
autosave, back up, import, export or claim ownership of a voyage. The title and
pause menu have no save controls, summaries or storage warnings. Existing browser
save slots remain untouched. Audio and accessibility preferences still persist.

A live voyage can pause, return to the title and resume during the same page
session. Endgame combat also retains that live voyage in memory. Reloading or
quitting ends the session; the next launch starts at Tern Yard. The dormant pure
snapshot helpers remain for simulation checks and future save work, but no
browser or desktop flow calls them.

Reverse and tow-back are removed completely, including their buttons, R and RT
bindings, negative propeller thrust and tow-history playback. Steer to turn and
release the helm to coast. The navigation trial uses the same simplified controls.

## Manual oversteer, 2026-10-23 (v0.40.0)

The owner rejected automatic correction that kept hard turns in a safe arc.
Manual helm now applies angular torque against passive linear and quadratic
water resistance. Holding the helm adds rotation, releasing it leaves angular
momentum, and opposite helm must overcome that momentum before reversing it.
Analog steering has a progressive response for smaller corrections.

Lateral water acceleration is limited. When the bow rotates faster than the
water can redirect the hull, the boat skids across its heading. Sideways flow
reduces drive efficiency and adds drag, so sustained hard turns can spin the
boat and scrub speed. Cargo changes inertia; actual lateral force drives bank.
There is no timed spinout penalty, heading reset or automatic countersteering.
The existing non-inverting hull projection remains; this does not add capsizing.
Crew navigation retains its course-following controller. Controls and reverse
removal are unchanged.

The force/resistance separation follows the structure described in
[Fossen's marine craft model](https://www.fossen.biz/html/marineCraftModel.html).
The coefficients are tuned for Widewake's handling, not a calibrated real vessel.

## Waterway expansion, v0.27

The active route plan is [WIDEWAKE_WATERWAYS.md](WIDEWAKE_WATERWAYS.md). Ten
trading ports and twenty-four named shore scenes now occupy a connected network
of narrow channels and lakes. The first salt delivery goes to Lantern Quay and
measures 56 seconds of sailing in the unupgraded launch. Reed Landing still
accepts the old opening delivery. Tools to Canopy Landing, grain to Bellwether
and oil to Crown add three one-time objectives. Old completed objectives remain.

The paper chart shows estimated sailing time for the current fleet, geographic
patrol pressure and physical hazards. Sheltered and Direct passage select
actual alternative routes around the volcanic reach. The race, whirlpool and
thermal outfall affect player, companion and hostile boats. Enemy pressure is
fixed by region and working fleet size, with finite active caps, rather than
increasing indefinitely with elapsed time or completed watches.

New source: `js/widewake-waterways.js` owns the atlas and environmental fields;
`js/widewake-waterway-art.js` owns the original shore and port geometry. The
existing worker, terrain, navigation and campaign consume that shared data.
The title artwork and separate endgame combat flow remain unchanged. New
snapshot fields default safely in the dormant simulation test helpers. Browser
and desktop saving remain disabled; voyages exist only in the current session.

The sections below retain the earlier three-port loop as implementation history.
The current map, progression and review boundaries are in the atlas document.

## Current connected loop

The launch starts with 520 coins, eight salt and a 32-unit hold. Sell eight salt
at Reed Landing to earn 350 coins and open Fleet. The shallow landing cannot
berth a trawler: return to Tern Yard to buy one. Grain is a useful return cargo.
A completed Tern Shoal fishing watch opens Shipyard. Lockmill exports timber;
Tern Yard buys it. The Outer Sound oil watch earns access to heavy escorts.

All three ports occupy the actual terrain. Their docked views keep the ocean,
piers and buildings on screen, with a quiet service menu. Trade opens one
order at a time. Locked Fleet and Shipyard areas remain visible with a short
requirement. The log records visited landings and rare catches.

Seven goods have regional prices, a buy/sell spread and bounded market pressure.
Cargo occupies actual vessel holds. Six purchasable support roles, three
flagship hulls, four upgrade tracks, repairs, salvage, fishing and oil production
operate in the same region and live session. Watches load the workboats; the player
protects them. The three grounds introduce Glass mullet, Copper pike and Amber
nautilus. A first completed watch at each ground guarantees its discovery.

Routes use the fleet's largest draft and clearance envelope. A launch can use
the Reed cut; bringing deeper boats closes it. Autopilot respects the channel
cruise speed and the slowest surviving boat. Followers advance through the
recorded wake in order, then take checked routes to work stations or harbor berths. A blocked follower
stops at the terrain boundary. Boarding the harbor requires the
fleet within its 360 m anchorage. Boats are not teleported through bends.

Raiders approach through water, using the channel graph where a bank blocks
sight. Projectiles cannot shoot across land. A shared conservative navigation
cell cache replaces repeated full-hull probes for every light enemy. Cells are
8 m across; their clearance rectangle includes the largest raider at every
heading and the cell's half-diagonal. The cache is bounded to 65,536 entries.
Open sea has a constant-time clearance path. Friendly hulls retain exact
oriented clearance and pier collision.

Campaign admission is bounded to 2,048 raiders, with progressive watch waves.
The new endgame button starts a 16,384-enemy open-water watch. The older
battle harness also verifies the shared renderer and combat buffers. Neither
is evidence of 16,384 terrain-aware campaign enemies. Larger fronts in constrained waterways need their own measured pass.

## Endgame combat, v0.25

The title and pause menus both have **Endgame combat**, by explicit owner request.
It opens directly into a three-minute workboat defense with 24 armed friendly
boats, 16,384 raiders, five changing fronts, short flanking raids, repair crates
and a result/retry/return flow. The four workboats load actual holds while on
station. E or the fleet button recalls the fleet to follow the flagship, pausing
production, or holds the current position and resumes work when boats arrive.

The endgame loadout is disposable and does not unlock campaign equipment. An
active voyage is retained in memory before entry. Return restores that same live
voyage; returning to the title offers Resume voyage for the current session.
Reload or desktop quit ends both the combat run and the retained voyage. The
title art and background remain unchanged apart from the requested controls.

Rapid cannons fire short bursts; flak fires pairs; mortars fire staggered salvos
at dense pockets. The flagship automatically releases its gun banks when an
enemy crosses their arc. Shared targeting leads moving boats, divides same-tick
shots between targets, and temporarily reserves impact cells so multiple area
weapons spread their shells. Campaign weapons use the same targeting without
receiving the test loadout's fire rates or free upgrades.

Iron rams have a separate 34 m silhouette. They slow for an 0.8-second wind-up,
show a short dashed lane, then charge along that fixed heading. They cannot
home during the charge. They seek working boats but hit the first friendly hull
in their path. Sparse repair crates heal surviving boats when the flagship
sails within 95 m. They cannot revive a lost boat.

The normal helm, camera, gamepad and touch controls are reused. There
is no click-to-fire, aiming, or active broadside button. The chart is absent in
this open-water watch. A pennant identifies the flagship without covering it;
workboat hull bars, one watch progress bar and a quiet tally carry the essentials.
No per-enemy names or damage numbers cover the swarm. Only committed ram lanes
receive warnings. Reduced motion suppresses hit tints, recoil and edge flashes.

Simulation buffers are fixed: 32,768 enemy capacity, 8,192 rounds including a
1,024-round hostile reserve, 2,048 effects, 24 wake histories and 16 repair crates.
Enemy admission is capped at 48 per tick. A shared cell grid handles queries;
there is no all-pairs fleet/enemy separation. The new targeting and ram state
bring combat typed arrays to 3,645,952 bytes including blast drift, independent of kills or elapsed
session time. Effect, audio and notification budgets remain bounded.

The open-water test is deliberately a powerful fleet. Campaign difficulty,
terrain-aware large raids and earned midgame loadouts still need playtesting.
It is not the finished Steam balance or proof of physical-phone performance.

### Reinforcement arrivals, v0.25.4

Owner direction, 2026-10-19: enemies should enter offscreen at the back of the
swarm, with a tighter limit on zooming out. New endgame arrivals, including
flanking raids, start in a 3.2 to 3.68 km outer band behind the initial fronts.
Panning across that band moves admission beyond the visible water along the
same approach. Detached friendly boats also retain 600 m of arrival clearance.
The starting enemy formation is prepared before the scene opens.

Wide is now the furthest zoom for wheel, pinch, gamepad and the named camera
stops. Viewport size sets a 2.5 km maximum distance from camera to corner;
rotation preserves the chosen stop and clamps intermediate scales. Admission
checks the padded isometric viewport and any pending zoom or recenter destination
before each simulation frame. Endgame admission also reserves its widest view.
It keeps the 48-arrivals-per-tick limit and the same fixed combat buffers.

Campaign waves use the same viewport exclusion, join beyond surviving attackers,
and check nearby friendly boats, water clearance, ports and the world boundary.
River approaches use offscreen channel nodes. A wave with no valid approach
admits fewer enemies instead of putting them into visible water. Camera guards
are transient and do not change the save format. Longer approaches reduce the
old replacement rate and give new waves actual travel time.

## Player helm and projectile contacts, v0.26

W or Up is always forward throttle along the bow. A/D or Left/Right apply left
and right rudder at every heading. S or Down brakes without reverse thrust.
Touch and the left stick use up/down for throttle/braking and left/right for
rudder. The removed R, RT, reverse and tow controls remain absent. There is no camera-relative
heading selection in the player helm. Releasing throttle coasts.

### Floating touch helm, v0.27.1

Touch anywhere on the water to place a joystick at that finger. It starts neutral,
with a six-pixel dead zone and proportional throttle and rudder. Dragging beyond
its travel moves the base with the thumb, keeping direction changes close.
Lifting, cancellation, capture loss, pause, focus loss and viewport changes clear
held steering. The joystick disappears on release and leaves the resting HUD clear.

A second finger releases steering and starts two-finger camera pan and pinch zoom.
After a camera gesture, lift all fingers before starting another helm gesture.
HUD buttons keep their own touches, so the chart, camera choices and fleet order
remain usable. Mouse dragging still pans. Campaign and endgame use the same helm.

The manual helm has faster engine response, speed-dependent steering authority,
smoothed yaw and lateral grip. Turning changes the hull heading before the world
velocity catches up, leaving a curved wake. Larger and loaded boats retain more
inertia. Autopilot and escorts keep their separate direction-vector steering,
and any manual throttle or rudder input takes over a plotted course.

All direct rounds use swept contacts against the same 13-point hull outline used
by the artwork, including the full bow and stern. Collision considers boat motion
during the step and orders contacts by the first hull surface crossed. Hostile
rounds use the same hull checks against friendly boats. Gun rounds retain their
specified two-hull penetration; guards, flak and hostile rounds stop on contact.
Friendly weapons do not damage allied boats.

A tracer trails behind its simulated tip. Direct rounds descend from the muzzle
toward hull level; mortar shells follow their arc and strike a deck on descent
or explode on reaching the water. Flak detonates at the contact point, not at the
end of the frame. Its direct target takes the direct damage once, while nearby
boats take the splash damage. Hit sparks originate at the contact position and
height. Effect, sound and offscreen drawing budgets never suppress hull damage.
The parked serialization code preserves launch height, with defaults for old
snapshots. This does not re-enable saving in the game.

The grid still bounds collision candidates. Hull planes are cached, and contact
scratch space and projectile buffers remain fixed. The collision tests exercise all four enemy silhouettes at 16 headings,
moving crossings, misses, penetration, terrain, every projectile family and
600 simultaneous contacts with exhausted presentation budgets.

## Explosives and water pressure, v0.26.1

Mortars, flak and gun-bank shells now displace surviving enemies. Ordinary
rounds retain their direct-hit behavior. The existing damage and damage radius
remain the core of each blast. A pressure shoulder reaches 1.4 times that radius
and can push an unharmed boat just outside it. Light hulls move most; gunner hulls
receive half the impulse and iron rams receive 32 percent. Pressure falls with
distance. Repeated hits add vectors up to a 140 m/s cap; water drag fades them
exponentially at 2.8 per second. These are gameplay values, not naval modeling.

The shove is separate from AI steering, so a boat slides without snapping its
bow around or losing the force on its next steering update. A charging ram keeps
its committed direction while drifting. Banks stop the displacement and land
blocks the pressure. Friendly hulls keep the existing friendly-fire protection.
The same mechanics apply to the campaign and the endgame shortcut.

Explosive shells detonate at their swept collision point, and missed shells
splash when their travel ends. Mortars burst on a deck or the water on descent.
Automatic aiming accounts
for the remaining drift rather than assuming the initial shove lasts forever.
The dormant snapshot helpers preserve pressure vectors for deterministic tests;
older snapshots supply zero drift. Invalid or incomplete vector arrays are rejected.
Browser and desktop saving remain disabled.

A burst uses one entry in the existing 2,048-effect pool. Its water-plane foam
and trough render beneath hulls, followed by a short, irregular column and spray.
Two instanced effect passes replace the previous single pass. There are no
per-droplet physics objects, new textures or unbounded emitters. Both passes
cull offscreen bursts; the plume quad is cropped to its small visible bounds.
Canvas uses the same timing and silhouettes. Reduced motion shows stationary,
fading foam and suppresses the plume without changing combat.

Two fixed Float32 arrays add 256 KiB at the maximum enemy capacity. Damage and
pressure share one local cell query; no global enemy scan is added per explosion.
The new checks are `test-water-blasts.cjs` and `test-water-blasts-browser.cjs`.
Measured battle comparisons and rendering limits are recorded in the release log.

## Boat definition at distance, v0.28.0

Owner correction, 2026-10-21: distant boats looked like rice or fleas. The old
Wide camera reduced the six-metre launch to a few pixels. Camera limits now use
the projected physical hull at its least readable heading. Sailing keeps every
friendly hull at least 16 CSS pixels across its larger screen dimension; combat
keeps even the smallest raider at least 12. Fleet and Close step inward from that
limit. Wheel, pinch, controller zoom and viewport resizing share the same limits.
Adding a large companion cannot shrink the launch below this floor.

Wide now shows a smaller area, especially on phones. Use camera panning to inspect
the combat perimeter and the chart for regional navigation. Physical hull size,
clearance and projectile contacts are unchanged. No oversized boat icons or
selection rings cover the hulls.

Dark gunwales separate light decks from the water. Small raiders have an open
skiff, red speedboat cowling or raised armored wheelhouse; their shared physical
outline remains intact. Friendly cabins, launch benches and colored workboat
roofs retain larger contrasting shapes. Raider atlas resolution increases from
1.5 to 2 pixels per metre. Existing mipmaps and directional blending remain.

`test-boat-readability-browser.cjs` checks 720 physical hull headings, camera
stops, wheel and pinch limits, rotated viewports, and actual hull pixels in the
water scene. Its eight-heading contact sheet is for visual review. The existing
art, motion and offscreen-arrival suites cover the shared renderer and zoom.

## Interface contract, v0.23

The owner explicitly rejected generic website panels and asked for a distinctive
game interface that is as quiet and obvious as possible. Preserve the approved
title. The harbor uses a short service list over the world, one visible delivery,
and a clear Cast off action. The delivery opens its destination on the chart.
Locked services show their requirement when selected.

Paper is reserved for harbor decisions and the navigation chart. Dark instruments
belong over the water. Do not add dashboard cards, decorative labels, paragraph
instructions or another persistent status strip. Original chart marks and cargo
illustrations live in `js/widewake-reach-ui.js`. Fleet thumbnails use the actual
boat meshes, cached once per view and heading.

Trade shows one good and one order. Buy and Sell show their unit prices; the
confirmation shows quantity and total. Max uses the exact price curve, available
coins and remaining cargo space when buying, or the amount aboard when selling.
Never let a generic Max value refer to two different orders at once. Transaction
feedback stays in the ledger. No silent order is sent when switching a selection.

Fleet separates owned boats from purchases. Available roles appear as progression
opens them; fittings and replacement hulls are separate views. The pause menu keeps
settings folded until requested. Nested help returns to its parent menu.

The sailing HUD keeps hull and depth together. A persistent north-up minimap
occupies the upper right at sea, including endgame combat. It follows the player
independently of camera pan and zoom. The map shows actual channel geometry,
ports, available work grounds, hazards, fleet boats and nearby enemy density.
A gold diamond identifies the active course or current objective, including at
the map edge for distant destinations; its caption gives straight-line distance.
The sailing map defaults to 2 km, while the open-water combat map defaults to 8 km. A scale
bar and north arrow remain visible. It hides in port and on the title screen.
Static geography is baked once at eight metres per pixel. Live marks refresh
at most ten times per second inside the existing activity-controlled frame loop.
Swarms use a fixed 1,024-cell grid; paused map pixels remain frozen. Two buttons
under the minimap halve or double its range, from 500 m to 16 km. Each is at
least 44 px across. The scale bar follows the chosen range, and buttons disable
at the limits. Sailing and combat remember separate ranges for the page session.
Only these buttons take pointer input; the map leaves helm gestures and Chart intact.

Zoom is a labelled control with
Close, Fleet and Wide choices on demand. Wheel, pinch and keyboard camera stops
remain available. Chart and nearby dock/work actions occupy the lower right. All weapons fire
automatically; do not add a manual fire action. The main-world scale lives on the chart, avoiding action overlaps on phones.
Modal decisions hide the inactive HUD, including stale notices behind them.

Use at least 44 px for interactive targets. Preserve the same actions on phones;
compact landscape layouts move contextual actions above the lower row and allow
long fleet and destination lists to scroll. Keep the chart confirmation outside
that scrolling list. Do not restore nearest-neighbor scaling to moving scenery.

## Driving and wakes, v0.24

Friendly hulls use surge, sway and yaw at the existing fixed 60 Hz. Turning the
bow does not rotate its world velocity. Sideways water resistance brings the
trajectory around; engine spool and hull size set response. Cargo adds up to
28 percent inertia without silently changing rated top speed. Releasing the
helm coasts; there is no reverse or tow action. The shared enemy movement remains
lightweight.

The camera's Close stop is measured in CSS pixels per metre, independent of the
viewport shrink used by the scene. Rotation preserves the selected scale. Wheel
and pinch retain their water anchor; stops recenter, and a bounded velocity lead
opens water ahead of the bow. A tiny leader appears above a distant hull only.
There is no hull selection ring or filled marker covering the boat.

A fixed wake history records the stern in world space. It survives turns and
stops, spreads and fades over twelve seconds, and resets on a recovery jump.
Twenty-four 128-point tracks use 61,440 bytes of CPU history. The GPU ribbon has
a fixed 3,120-segment buffer, shared endpoint normals, one instanced draw call,
and reduced sampling at distance. Small bow shoulders share that batch. Canvas
uses the same histories. Raiders do not allocate individual persistent trails.
Context restoration keeps the history and recreates only its GPU resources.

Starter guns and support weapons acquire targets automatically. Larger player
hulls release their rolling bank salvo when a hostile enters a clear broadside
arc; empty water does not consume it. The old isolated battle harness retains
manual firing as an engineering test, not a campaign control.

On departure, each support boat takes a checked approach from its berth to the
captain's recorded path. This prevents a heavy boat cutting across the quay to
reach the first wake point. The approach and engine spool remain part of the live
simulation.

## Independent fleet handling, v0.25.2

Owner instruction, 2026-10-19: the main ship should move more quickly than its
fleet, and the other captains should feel human instead of mirroring each move.
Manual captain speeds are 20 m/s for the launch, 40 for the patrol boat and
38 for the frigate. The endgame flagship makes 40 m/s. Companion cruise speeds
vary slightly by crew and stay below the captain's speed, including with engine
upgrades. The captain accelerates and turns more promptly while keeping world
momentum, cargo inertia and coasting.

Open-water crews track individual delayed formation positions and reconsider
their steering at staggered intervals. They accept a small position error after
settling, so every movement does not trigger a formation correction. Workboats
settle inside the production radius. Holding position leaves the captain free
to circle the fleet; recalling them takes actual travel time.

River crews retain the ordered, checked wake path with small spacing differences
and shorter steering intervals. Bank contact stops the hull and clears its held
decision. Autopilot retains conservative channel speeds; taking manual control
restores captain speed on that same step. Held crew decisions remain in memory with each ship. Crew timing uses ship
identity and simulation ticks, without advancing the combat random stream.

## Graphics contract

One unit is one metre. Decks, piers, doors, railings, trees, weapon mounts and
work equipment use that scale. A six-metre launch is naturally smaller than a
warehouse or a trawler. The default camera keeps at least 40 CSS pixels of projected hull length at
every heading and viewport. Fleet and Wide remain deliberate overview choices.

All nautical and shore models use the same isometric projection, directional
lighting, muted material family, baked color/depth sprites, filtered edges and
mipmaps. Gun mounts now sit on the actual detailed deck and scale to their hull.
Fine material grain and water highlights are quieter. Alder, cypress and willow
crowns have different silhouettes, with visible gaps between branches. Floating salvage uses the same wooden crate materials as the piers. Reeds
root at the bank instead of hovering; vegetation leaves the reed hut clear.

Explosive weapon impacts use blue water columns, spray and broken foam rings.
Sinking hulls retain their short bright core, smoke and small surface disturbance.
The splash radius never becomes a solid disk of fire. Canvas
fallback uses matching silhouettes. Preserve the v0.21 continuous
movement, directional blending and display-aware raster budget. Do not reapply
nearest-neighbor scaling to the moving scene.

The v0.25.5 port pass replaces each low-resolution combined landing with tightly
cropped building, pier and cargo sprites at 10 pixels per metre. Roof panels,
siding, sliding doors, masonry footings, plank decks, pilings, mooring hardware,
ladders and cargo share the nautical materials and light. Static landmark bakes
resolve four-sample coverage before generating mipmaps, avoiding broken seams.
Canvas uses the same geometry at up to 8 pixels per metre. Working yards are
visually graded to meet their decks and exclude trees from building footprints;
the navigation field and pier collisions are unchanged.

All three ports are cached together. The campaign color/depth atlas is about
41 MiB with a 48 MiB test ceiling; the open-water battle retains its 32 MiB
ceiling. Landmarks are individually culled and still draw as cached quads, so
board and roof detail adds no per-frame geometry work. Original title art and
ship/water resolution are preserved.

The title artwork is unchanged. Image generation remains deferred by the owner.
The 24 earlier port prompts are historical material, not a request to generate
Earth-port backgrounds or restore the retired world.

## Source and persistence

- `widewake.html`, `widewake-reach.css`: current shell, ports and quiet ocean HUD.
  `widewake.css` retains the approved title styling.
- `js/widewake-reach-game.js`: pure campaign, market, progression, fleet movement,
  work, terrain-aware combat and dormant snapshot helpers.
- `js/widewake-reach.js`: title, menus, controls, chart, audio and combat entry.
- `js/widewake-combat.js`: disposable endgame watch, loadout, fronts and repair drops.
- `js/widewake-combat-view.js`: fleet camera, flagship pennant, workboat bars and ram lanes.
- `js/widewake-reach-ui.js`: original interface marks, cargo art and vessel previews.
- `js/widewake-minimap.js`: cached waterways and the persistent sailing minimap.
- `js/widewake-estuary-core.js`: authored waterways, field and route clearance.
- `js/widewake-estuary-view.js`, `js/widewake-estuary-worker.js`: bounded terrain,
  background route preparation and region overlays.
- `js/widewake-battle-core.js`, `js/widewake-ocean*.js`: shared combat and graphics.
- `js/widewake-saves.js`: parked single-writer and backup infrastructure, not
  loaded by the game.

The previous Earth modules are historical source, unused by the current HTML or
the desktop package. Current checks are the Reach tests below. Old campaign
browser tests describe the retired shell and must not be presented as validation
of this build.

The old `widewake-reach-v1`, `widewake-reach-backup-v1`, `widewake-save-v1`
and `widewake-save-v2` slots are neither read nor changed. Browser tabs play
independent sessions. The desktop preload exposes no import/export operations,
and window closing performs no save handshake.

## Verification

```sh
node tools/widewake/test-spawns.cjs
node tools/widewake/test-spawns-browser.cjs
node tools/widewake/test-projectiles.cjs


node tools/widewake/test-water-blasts.cjs
node tools/widewake/test-water-blasts-browser.cjs
node tools/widewake/test-combat.cjs
node tools/widewake/test-combat-browser.cjs
node tools/widewake/test-driving.cjs
node tools/widewake/test-fleet-handling.cjs
node tools/widewake/test-driving-browser.cjs
node tools/widewake/test-touch-browser.cjs
node tools/widewake/test-reach-game.cjs
node tools/widewake/test-reach-browser.cjs
node tools/widewake/test-reach-ui.cjs
node tools/widewake/test-reach-saves.cjs
node tools/widewake/test-estuary.cjs
node tools/widewake/test-ocean-motion-browser.cjs
node tools/widewake/test-ocean-art-browser.cjs
node tools/widewake/test-battle-core.cjs
node tools/widewake/test-battle-browser.cjs
node widewake-desktop/prepare.mjs
node widewake-desktop/test-policy.cjs
node widewake-desktop/test-desktop.cjs
```

Browser harnesses require Playwright on NODE_PATH and own their test browser.
Use the agent Chrome for Testing wrapper, never the personal Chrome executable.
`WIDEWAKE_TEST_ENGINE=webkit` selects WebKit in the relevant harnesses.
The touch harness dispatches real multi-touch in Chromium. WebKit checks native
taps and bridges continuous drags through mouse pointer events; its multi-touch
behavior still needs a physical-device check.
The session-storage harness owns its HTTP server and tests untouched old saves,
independent tabs, session resume, fresh reloads and unavailable storage.

The connected core test covers about 43 simulated minutes: the first delivery,
return trade, earned trawler, fishing and salvage sale, upgrades, oil watch,
a four-boat trip to Lockmill and back, active-state restoration and shipwreck
recovery. It uses a funded later-stage fixture for the oil and river convoy;
it is not a claim of a complete organically earned economy playthrough.

## Next quality work

Review the first long passage with a human player, deepen encounter variety,
expand physical fleet orders and trading choices, and measure larger fronts in
narrow water. The current region has three ports, not a finished world-spanning
campaign. The owner-approved production goal remains open.
