# Bathhouse and integrated boiler

The banya uses physical fuel pieces, manually cast sparks, stored liquids and
a conserved thermal field as of v28.97. The visitor loop remains enabled, and
individual guest recipes are still undecided.

Sluice mobile play is landscape only, including the bathhouse. Portrait shows
the rotate screen and stops gameplay and held input; returning to landscape
keeps any manual pause intact. Build and verify mobile bath controls in landscape,
including tablet screens and changing browser-toolbar height. Portrait tests
verify the orientation gate. Landscape mobile and desktop share the same joined
tub and furnace on the right, with controls and trays on the left at the same viewport size. Short
viewports adjust scale and spacing while keeping 44px touch targets.

Since v28.16, the banya opens by default for returning profiles as well as
new ones. A one-time `sluice.opt.banya-default=open-v1` migration replaces
the old saved off setting. Later choices in Pause > Options > Banya persist
normally. `?bath=0` and `?bath=1` override the setting for that page load.

## First visit

1. Mine coal. Break stone for flint, which is guaranteed after twelve eligible
   misses. The boiler already has a reusable steel striker.
2. Scoop water into the rig tank. The bath needs at least 40 L and holds 450 L.
3. Enter the banya. The main room fills the viewport around a wide catenary tub,
   with a copper lining, curved rows of bolts, and the boiler built beneath it.
4. Tend the boiler beneath the bath on every device.
   Select a material, position its translucent preview and click to release it.
   Select the flint and steel, then drag above the pile to cast sparks onto fuel.
   Work the bellows for more heat and turn the grate crank to sift pale ash.
5. Open the liquid control, select water and aim the hose into the tub. Hold to
   pour (use POUR on touch). Three silos beside the building store carried liquids.
   Waiting visitors jump in automatically once the bath has at least 40 L
   at 30 to 48 C. They soak, shed their crust, pay, and return outside.

The forge and its crafting requirement are retired. New and returning games
receive a supplied striker. Old stored iron, forge fuel, and unfinished work
remain in the save without progressing or burning. Ordinary iron now sells
normally; the fuel locker reserves up to 24 ordinary coal on entry or before a
station sale. Shiny coal and surplus coal sell normally. Coal can also be drawn
directly from ordinary cargo. Stored supplies survive rig recovery.

## Direct controls

Mouse and touch share the same pointer path. The room opens directly to the
bath, with the fire chamber and tools below it. Open the material rack to choose
coal, methane ice, amber, sulfur, copper or malachite. The cursor previews the
exact next piece at partial opacity. A click realizes that shape at the preview
position and releases it under gravity. Invalid drops and previews spend nothing.
The rack pages automatically if more materials are registered.

Coal burns steadily; methane ice gives a fast blue flare; amber burns hot and
gold; sulfur has a cooler blue flame. Copper and malachite are noncombustible
additives that tint nearby hot fire green or turquoise. They remain recoverable.
These identities already exist in the mine. No new ore or disabled oil deposit
was enabled. Valuable material is consumed only when deliberately placed.

Select TONGS in the material rack, or right-click, to move existing pieces.
Returning cold unused material outside the chamber refunds its own identity.
A burning piece stays in the chamber. Cancellation restores unfinished drags.
Select the striker and drag above the pile: sparks travel, fall and ignite only
fuel they contact. Clicking the tool or clicking once in the chamber cannot
light the whole bed. The grate crank sends teeth across the bottom, jostling
actual fuel bodies while pale ash sifts through the slots.

- C: select coal for placement.
- B: work the bellows.
- F: select flint and steel, then drag to strike.
- A: turn the travelling grate.
- E / Enter: admit a ready visitor immediately; waiting visitors also enter on their own.
- W: open the liquid stores and selection tray.
- Escape: stow the selected tool or close a tray, then leave the bath.

The room gives its full height to the bathhouse, with no top or bottom HUD
bar since v28.84. Navigation buttons mount directly on the timber wall.
Since v28.161, the tub and its integrated furnace sit on the right. The top
of the copper rim meets the waiting floor, which extends across fourteen tiles
on the left. Two control columns sit below that landing: materials, bellows,
claw and hose alongside the striker, grate, liquid selection and bath readings.
The same arrangement serves desktop, landscape phones and tablets.
Every tool is available in the same view. Selecting the hose exposes POUR/STOP
and JET/SHOWER; selecting the claw exposes GRAB/DROP. Short viewports scale the
joined copper tub and furnace and adapt the left columns. Controls retain targets
at least 44px wide and tall. Waiting visitors have invisible touch padding
of the same minimum size. The guest cards and their connecting lines are removed
since v28.154. The dry guest landing stays visible. Version and FPS remain
beside Pause on the wall.
Liquid and material trays have separate CLOSE buttons and block input to
covered controls. Since v28.80, a 896 by 256 chamber
replaces the narrow firebox. Since v28.90, smooth refractory cheeks sweep
from the basin shoulders into a broad grate spanning 56% of the chamber,
75% wider than the earlier tapered base. Coal and ash collide with the curved
walls, the GPU fire mask follows them, and cut-away corners reject coal drops.
Existing fuel is moved inside the new walls without losing its mass or heat.
The basin stays above the integrated firebox on every active device.
Tool and boiler controls retain 44-pixel-high targets. Fuel,
average exposed air and ash blockage are visible alongside the boiler. The
main basin spans 26 tiles and retains the original catenary
formula. Since v28.65, the drawn copper liner is also an analytic collision boundary in
the WebGPU grid and particle passes and the CPU fallback. A normal projection
keeps particle centers outside the six-pixel liner, including water loaded from
older saves in the concealed tile clearance. The coarse tile mask remains a
backstop, and is uploaded separately so it cannot flatten the curved boundary.
Guest buoyancy integrates the same visible cavity. Existing
saves recarve the larger room on entry without adding water or charging again.
Old waiting guests move to the longer dry landing. The saved layout revision
moves existing basin liquid and soaking guests down forty world pixels once,
retaining liquid identity, quantity, heat and fuel. Outdoor and upper-floor
liquids keep their positions. Purchased upper floors remain
available by immediate scrolling. Without purchased upper floors, wheel and drag
gestures leave the bath fixed. There is no separate boiler screen or camera transition.

Enable dev mode with backtick, including inside the banya, or load `?dev=1`.
Coal, methane ice, amber, sulfur, copper and malachite are all available without
limit, alongside liquids, flint and steel. The desktop material control reads
MATERIALS / UNLIMITED in dev mode; its rack lists every item as FREE under
UNLIMITED MATERIALS. Dev placement and pouring leave real stock and cargo
unchanged. Supplies return to their ordinary counts when dev mode is turned off.
Created particles and physical fuel still
follow the simulation and save rules. Dev material cannot refund itself into
real stock after reloading. Prepare and Guest buttons and their T/G shortcuts
have been removed. The older console fixture actions remain for test harnesses.
The boiler fixture does not fill the tub. Dev mode still requires opening the
hose to add liquid; selecting it or entering the room leaves the valve shut.
Legacy automatic-fill reservations remain stored until the hose uses them.
Bath save v7 moves liquid from older tubs into the silos once because older
saves do not identify automatic fills separately from manual hose pours.
Amounts, liquid identities and stored heat are retained; full silos keep the
excess in the existing reserved supply. New hose-filled baths persist normally,
with saved liquid visibly returning after the entry fade. A roughly two-second
ripple grows from the bottom and center of the tub, with a few faint beads that
appear once. No artificial contour strokes trace the water edge. Real particles
return at their saved coordinates each frame and settle in the shared solver.
Pending drops stay in the parked store,
so saving, leaving, evaporation and full particle budgets cannot duplicate them.
Empty tubs have no arrival effect. The normal outdoor streaming budget is unchanged.

The GPU grid encloses the bath's known vessel from the first poured particle.
An empty tub's small nozzle packet must not size the grid so tightly that the
falling jet outruns a delayed position readback and stalls at the grid edge.
This changes the bath's simulation bounds, not its gravity or collision shape;
outdoor bounds remain fitted to their particles. Verify fresh and saved dry
tubs with `BATH_HOSE=1 node tools/bathhouse-workshop-smoke.mjs` (optionally
provide a local `BATH_SAVE` fixture).

## Ceiling claw and hose (v28.73)

The same rail has CLAW and HOSE switches on every device. Tap the selected switch again to
stow it. Only the selected tool and its ceiling carriage are visible. While a
tool is selected, the mouse moves it without holding a button. Click to grab a
slime and click again to drop it. Hold the mouse button to pour water; release
to stop. Moving over the control rails leaves the tool in place.

On a phone or with a pen, drag to position the tool without activating it.
Tap GRAB SLIME to catch, then DROP SLIME to release. Tap POUR to start the hose,
move it with one finger, then tap STOP. No two-finger gesture is needed.

The claw keeps holding between gestures, so you can reposition your hand.
Guests handled this way use gravity, buoyancy, curved-liner contacts,
and moving water boundaries. Dropping one into a warm bath starts service;
only submerged, unheld time counts toward its soak. Existing guest identity,
payment, and departure rules still apply. Physical guest positions survive a
save, but the claw releases on reload.

The POUR button can also keep the valve open between gestures on a computer;
STOP closes it. JET gives a fast narrow stream and SHOWER spreads
it into five gentler streams. Sideways motion tilts the nozzle, the flexible
hose trails behind, and the pressure ramps smoothly. Its real water particles
hit guests, displace the bath, and spill onto the floor. The claw hub and
fingers also displace water when dipped into the tub.

Since v28.139, collision projects the actual hose outlet as well as its head
outside the copper liner. Dragging low or tilting near a wall no longer puts
the outlet inside solid copper and silently blocks accepted water.

Since v28.140, the tool rail also stays below the physical main-room ceiling.
Extra wall exposed by a tall viewport cannot put the hose into an invisible
upper tub. Entry recovers liquid in locked upper tubs into pending silo stock,
preserving identity, count and remaining warm-inflow credits. Existing stores,
the main thermal field, owned-floor liquid and snow remain intact. Repeated
entry or reload cannot return a parcel twice.

The liquid tray selects water, legacy oil, brine, nectar or lumen. The hose
draws that identity from silos, remaining legacy storage and the rig. It only
debits particles the solver accepts; blocked output remains reserved in a saved
queue. Selecting the hose migrates an older paid water queue without changing
its identity. STORE TANK moves carried liquids into matching or empty silos;
TAKE BACK returns the selected identity within rig capacity. Snow stays snow
in the rig and is excluded from liquid silos. See [BATHHOUSE_STORAGE.md](BATHHOUSE_STORAGE.md).

Keys 1 and 2 switch the claw and hose. Space grabs or drops a slime, or switches
the hose valve. Pause, focus loss, pointer cancellation, resizing, changing rooms,
and leaving stop flow and release a held guest. Controls remain at least 44px
tall on phones and short landscape screens. Coal and ceiling tools own separate
pointer regions: a selected claw or hose does not intercept firebox tending.

`074-bath-tools.js` owns the tools. `node tools/bath-tools-smoke.mjs` exercises
actual mouse and touch controls, water accounting, three simulation rates,
physical guest saves, cancellation and responsive layouts. Screenshots go to
`/tmp/sluice-bath-tools-qa`. The bathhouse unit suite also checks physical soak
progress and CPU moving-boundary water coupling.

`node tools/bath-mobile-smoke.mjs` checks equal desktop/mobile geometry,
the integrated vessel, simultaneous flanking controls and viewport-fitting
trays, guest admission and real touch fuel placement on landscape phones and
tablets. `BATH_HOSE_TOUCH=1 node
tools/bathhouse-workshop-smoke.mjs` drags the hose deep into the bowl on four
phone sizes, reads back real GPU particles and verifies finite liquid supply
accounting. Both own and close a separate Chrome for Testing process.
`BATH_HOSE_VISUAL=1 node tools/bathhouse-workshop-smoke.mjs` checks actual blue
pixels against the copper cavity, the basin meter and finite stock in a bordered
DPR 3 landscape phone canvas after browser-toolbar height changes. It also verifies recovery reaches
the GPU solver and captures a working bath with two visitors and real burning fuel.

## Coal and heat

Coal uses large, seeded convex hulls shared by drawing, picking and collisions.
The 120 Hz solver uses face contacts, actual mass and rotational inertia, low
restitution and static friction. Pieces balance on their faces, tip when their
center of mass overhangs a support, and settle as burning fuel shrinks their
geometry. Held chunks detach from the pile. Loading stops at 32 pieces; sixteen reserved slots allow burning coal to split
under load. Spent material becomes up to 128 persistent ash grains. Sweep them
with A or the mechanical grate crank to restore underfire air.

The 30 Hz burn model separates moisture, volatile fuel and fixed carbon. Coal
warms and dries, releases smoky gases, flames, burns as glowing coke, then leaves
cooling ash. The surface heats before the core. Neighboring hot faces spread
ignition; exposed faces and grate air control oxidation. Crowded coal can
smolder, bellows raise reaction rate and fuel use, and raking spent ash restores
underfire air. A cold boiler still needs a spark or a hot neighbor.

New lumps are roughly twice the former diameter and carry a longer fuel reserve.
Remaining fuel is an energy reserve, not a burn-time countdown. Previously saved
coal keeps its remaining paid fuel and lifetime. Art follows the actual state:
pale drying vapor, smoky ignition, volatile flames, incandescent cracks, mineral
crust and cooling ash. See [COAL_FURNACE.md](COAL_FURNACE.md) for model details,
limits, persistence and verification.

The thermal field tracks energy in 72 cells and the copper heat exchanger.
Actual fire output supplies finite heat; the bottom water warms first, then
buoyancy drives rising currents through the shared GPU or CPU particle solver.
The bath uses the ordinary outdoor simulation clock and gravity. Inflow mixes
with the local water, and cold water dilutes stored heat. The dial reports the
mass-weighted temperature. Evaporation spends latent heat and removes actual
water particles. Condensed mist is emitted from exposed water and carried by
warm air; boiling also makes rising bubbles. Cold water does not emit steam.
Oil or mineral layers cover the water below and suppress its exposed evaporation.
See [BATH_THERMAL.md](BATH_THERMAL.md) for units, limits and verification. This is
a bounded game thermal model, not a full computational fluid dynamics solver.

Boiler fuel, heat, and admitted visitors continue while the player mines.
Retired forge work and its fuel remain frozen in the save.
Pause stops all of them. There is no offline catch-up or day/night service gate.

## Water and visitors

Water uses the shared liquid particles, with 100 particles per displayed litre.
The hose reserves existing silo/rig stock before emitting into the tub. A
blocked solver retains pending liquid of its original identity and temperature. Admission never
charges a per-guest dose of coal or water. A low, cold or hotter-than-48-C tub pauses earned soak time until restored.

Guests splash actual water out. Contact with the floor permanently deletes it
through the solver mutation journal, including parked offscreen spills. No
spill returns to the tank or survives a save. The supplied striker removes the former forge quenching cost.

Two rocky visitors can roam outdoors, counting a carried visitor toward that
limit. Two more visitors can wait or bathe inside. An eighteen-second warm soak pays $75. These are initial service
values, not guest recipes. New games begin at noon without visitors. The first
rocky visitor falls after 90 seconds of play, 30 seconds before sunset, even
while the rig is mining. Later arrivals retain their surface-distance rules.
Service remains available throughout the day and night.

## Bath-born residents (v28.57)

New games have no starter residents. Existing saved residents remain in place.
A warm bath gradually changes a rocky guest into the same kind of creature.
Each fitted crust plate wets and loosens separately. Submerged scales soften
first; water wicks through their cracks into the upper coat. The scales curl,
peel away and drift down as small flakes. Exposed gel moves between remaining
hard islands, so a visitor can have a soft hanging patch beside intact crust.
The changing outline displaces real GPU water and the CPU comparison solver.
Gravity, submerged area, water drag, currents and the hose move bathing guests;
they no longer follow a scripted bobbing path. Only warm, sufficiently submerged,
unheld time advances the soak and peeling. Detached flakes use a bounded visual
pool and do not add or remove water. Reloading retains each plate's wetting and
peeling progress. After the complete soak and shell loss, the surface body
spawns at the door after departure. It keeps its visitor identity,
stays in the world, and saves separately from the rocky population. Reloading
does not add starter residents. The payment still happens once per completed bath.
Unhardening preserves the incoming visitor's individual radius through departure
and saves. The resident keeps the exposed core's 94% radius. Manually placed
residents and older saves use the sky visitors' 22 to 27 pixel radius range instead of the previous, larger 24 to 29 range.

These are 37-point deformable meshes in the existing XPBD solver. Their
softly irregular radial rest shape, spring network and pressure constraints govern collisions
with terrain, the rig, other gel bodies, and rocky guests. Softer edge and shear
constraints let them slump, stretch, and wobble. While supported, viscous muscle
damping follows the travelling target without changing the body's bulk momentum.
A travelling muscle wave changes local spring lengths and the target shape.
A shared transverse bend carries each cross-section together, with longitudinal
contraction driving the foot. The target reserves positive cell area, and local
area corrections respect terrain, avoiding the repeated emergency mesh repairs
that previously snapped the skin. The rounded outline follows these actual
moving physics points, including their collisions. Drawing interpolates the last
two 120 Hz physics poses so faster displays do not repeat a frozen skin frame;
contacts, water and saves continue to use the current physical mesh.
The material has no authored feet or permanently upright face. After a roll or
throw, the next supporting surface becomes its underside; the muscle target
retains that material orientation. At a ledge, leading skin grips the top and
curls the rest over relative to its current pose. It does not reset to birth-up.
Each resident picks a nearby destination, follows it for a longer walking bout,
then briefly rests. Ground travel is about 3 to 9 pixels per second. Wave speed,
amplitude and length vary gently over time, with gradual starts and reversals.
Patches of skin grip fixed terrain contacts during their contraction and release
during their forward stroke; this contact drives crawling. Wall grips overlap,
so the slower, elongated snail-like crawl keeps at least two loaded patches
until another can take over. Bonds gain and release strength gradually; a newly
acquired weak patch cannot release an old supporting one. A resting resident
keeps its wall grip while its walking wave pauses. The muscles have zero net
translation in free space.
At a wall the same wave turns upward, then rounds an exposed top corner onto
the ledge. Terrain bonds have finite reach and
strength, and disappear when their supporting tile is mined. Rig impacts, jets,
grabbing and tossing suspend adhesion so a resident can peel off and fall.
They probe the actual supporting terrain ahead, including every intervening
column, then briefly grip and smoothly reverse before an unsupported edge.
The old narrow-shaft downward ejection does not apply to these residents;
gravity and ordinary terrain collisions govern a real fall. They stay near
their own surface neighborhood.
Player pushes can still send them underground. Underground slime brains remain
disabled by default.

Click or touch a soft resident and drag to lift it by a compliant patch of gel.
Release while moving to toss it. The grip keeps terrain and body contacts
active; cancel, pause, focus loss, and entering the banya release it. The liquid
tool and mobile driving controls retain their input. Drive into the residents,
land on them, or brush them with jet exhaust to play without dragging.

Pastel gel and internal highlights follow the deforming mesh. Each resident has
one cream googly eye with a loose dark pupil, no mouth or cheeks. The pupil lags
local body acceleration and rebounds inside its cup, with small glances and
brief blinks. The eye compresses with the central gel and stays readable through
any roll. Pond water provides buoyancy and releases terrain grips so they can
float; the real boundary displaces WebGPU water, with contour collision in the CPU fallback.
Residents do not dissolve. Off-camera bodies use the existing simulation culling.
Soft residents do not count toward either rocky-visitor limit.

`347-surface-slimes.js` owns the mesh, appearance and persistence;
`347-slime-locomotion.js` owns muscles, crawling and terrain adhesion;
`349-slime-touch.js` owns the pointer grip and rock/gel contact. Run
`node tools/surface-slime-smoke.mjs` for real-browser checks of movement,
30/60/144 Hz impacts and launches, mouse/touch input, water, guest conversion,
and full-game save restoration. `node tools/surface-slime-crawl.mjs` verifies
climbing in both directions at those frame rates, loss of propulsion with the
wave disabled, wall knock-off, jets, and mined handholds.
`node tools/surface-slime-orientation.mjs` checks recovery from quarter, half,
and arbitrary rolls, rolled ledge climbs, naturally changing gaits, and the
pupil's inertial response and containment. `node tools/surface-slime-snail.mjs`
checks pit approaches, sustained wall grip, idle wall pauses, player knock-off,
and travelling deformation of the real skin. `node tools/surface-slime-smooth.mjs`
checks small and large residents, physical continuity, legal muscle targets, deliberate
walking bouts, rest/turn transitions and display interpolation at 30/60/144 Hz.
Screenshots go to `/tmp`.

## Sky visitor physics and appearance (v28.34)

Sky guests are circular bouncy bodies with a rotating stone crust and one classic
white googly eye. Its loose black disk responds to acceleration and only sometimes
glances at a nearby player. Impact squash is brief and visual; it never changes the
collision radius. Existing visitors acquire this appearance when loaded.
The eye makes a subtle 160 ms cartoon blink on ground impacts above 55 px/s
and occasionally at random (3.5 to 8 seconds between blinks). It pinches into a
small curved line, then reopens. A short cooldown prevents contact chatter;
blinks affect only drawing, never body or pupil physics.

Guests have 2.5 times their former collision mass, with gravity reduced from
480 to 300 px/s squared. The rig has mass 6 and a radius-25 guest has mass 2.5;
guest mass scales with radius squared. Hits move a guest less and recoil the
rig more. The lower gravity gives a slower arc and more time to follow it.
Unassisted navigation hop
speeds scale with the square root of gravity, retaining their height and range
at a slower pace. Existing saved guests use the current mass and gravity.

Ground contacts keep a fixed restitution (0.86 to 0.875, multiplied by 0.88 on
soil), with friction transferring slide into spin and rolling slowing gradually.
Sliding friction is 0.24 on stone and 0.30 on soil. Landing deformation also
removes tangential travel and spin together, proportional to impact load, so
a guest already rolling without slip still loses some sideways speed when it
lands. Rolling deceleration is 34 px/s squared on stone and 52 on soil.
Once a guest is bumped into play, rolling resistance ramps up above 35 px/s,
reaching triple strength at 120 px/s: 102 on stone and 156 on soil. Gentle
nudges and jet wash retain the original ground resistance. Horizontal travel
and spin also decay at 0.9 per second (about 59 percent of sideways speed lost
in one second), so a missed header
stays within reach. This extra drag fades with submersion into the existing
water resistance. It does not alter vertical velocity, gravity, or restitution.
Ordinary meteor arrivals and autonomous visitor hops retain their original drag.
At least 240 physics substeps per second prevent fast visitors passing through
terrain. Rig contacts sweep a low convex hull along the rig's traveled path.
The flat roof is 8.8 pixels wide, up from 4.4. Its shoulders move outward by
2.2 pixels on each side, preserving their slope. This gives slightly misplaced
headers more lift and less sideways speed. The sloped shoulders lift a grounded ball; the same geometry sets the direction
of airborne hits. The rig's bumper yields under strong sideways loads: restitution
smoothly drops from 0.90 toward 0.10 as lateral closing load rises around 130 px/s.
A fourth-power blend keeps roof hits springy and softens glances. Roof
restitution rises gently from 0.90 to 0.96 toward a square upward contact.
The tracked underbody uses 0.98 restitution on a square downward hit. A grounded
guest resolves the track and floor impulses together, so the miner rebounds
strongly and the guest also springs off the ground. The floor uses the guest's
material damping, including softer dirt and sand, at 20 percent of its usual
strength while the guest is compressed under the miner. This preserves much
more of the landing energy in the springy body. Each exchange still loses
energy; landing strength and mass determine the result. The earlier 0.38 landing
left only a small miner bounce and treated the guest as vertically immovable.
Airborne contacts follow the real contact normal, with equal opposite recoil
when both bodies are free. Gentle touches retain their spring; stronger hits still give stronger
shots. Contact friction is 0.04 on the sides and rises toward 0.16 on the roof.
The added roof grip further reduces sideways deflection on misplaced headers.
Tangential friction exchanges spin as well as
linear momentum. There is no minimum launch, automatic aim, catch radius, or
aerial boost. Player gravity and flight controls are unchanged. Speed and
contact height control the shot: get underneath to lift, strike level to drive
sideways, and hit from above to spike. Sideways drag during play slows the
resulting shot without imposing a speed limit. A ground pop followed by a timed
jet can chain aerials. The fixed drive/jet browser test checks consecutive aerial
touches. Its separate shallow angle impact checks now leave at 276 to 298 px/s
sideways, close to flight cruise.

Contact separation moves both bodies according to their mass. Terrain carries
the load on any blocked axis, so a slime on the floor supports the falling rig
instead of being repeatedly pushed into the floor and back inside the miner.
A grounded miner also returns the roof bounce without recoiling into the soil.
The flat underside spans 33 pixels, up from 19.4. Landings within 16.5 pixels
of center load the guest vertically, so a modest aiming error no longer kicks
it away before the miner can land for a second bounce. Both bodies remain free
to move; shared sideways motion carries through, and outer-corner landings
still knock the guest away. A standard test drop onto stone gives the miner 61
to 69 pixels of rise and the radius-25 guest 38 to 40 pixels, followed by smaller
rebounds. Ordinary free-fall ground impacts retain their existing material damping.
The full-game soil test gives about 63 pixels for the miner and 37 for the
guest, roughly 2.5 times the previous landing heights.
Small landing contacts settle;
a resting guest counts as foot support, and normal jets can lift off it.
The swept collision path includes position corrections without treating them
as velocity on the next frame. Drawing receives only the small separation
offset, preserving the miner's existing motion smoothing. The previous full
sprite snap on every touch caused visible stutter during dribbling.
Landing, repeat bounces at several offsets, resting, and takeoff checks run
at 30, 60, and 144 Hz; the browser
dribble check also limits contact-induced sprite jumps to less than one pixel.

Live jets now apply pressure to sky guests. Eleven rays from each of the two
banked nozzles cover a spreading cone up to 160 pixels long. Pressure follows
the actual engine force, including spool, boosters, and the flight envelope,
and falls with distance. The curved surface redirects pressure outward on an
off-center hit; skin drag transfers spin. A grounded guest compresses slightly
under the load, using its visual spring without changing collision energy.
Walls, buried gel, and closer guests intercept the gas. Physics follows the
rig's real path, independent of render smoothing or smoke rendering. Releasing
thrust, running out of fuel, and entering an interior stop the force. The flame
and ground wash also stop on the round guest's surface. Jet contact pauses its
navigation through the same free-play state as a chassis contact.

A player-driven contact pauses the guest's navigation, door admission, and
scheduled departure. It resumes after 1.5 seconds at rest, at least 2.5 seconds
after contact, and once the player is five tiles away. This state survives saves
and passes between colliding guests. A stationary rig can still be hopped over
by ordinary visitors, who also hop out when they reach a pond bank. These
navigation hops stay disabled during play. Natural rebounds finish before
another intentional hop.

Water response measures the waterline beside the solid body and computes its
submerged circular area. Shallow puddles cushion a floor bounce; deeper water
slows the plunge and supports the guest at roughly 72 percent immersion. Drag
increases with speed. The existing CPU/GPU guest colliders displace real water,
and the entry splash changes velocity only. Sparse spray is excluded from the
waterline, and ambient flow coupling is filtered so the guest does not repeatedly
accelerate from its own delayed GPU wake.

## Saves and migrations

The additive `bathhouse.workshop` field saves both fuel beds, supply stock,
flint-discovery progress, the reusable striker, and committed forge work. A
saved job cannot charge its iron twice, quench twice, or pay out a second tool.
Reloaded held chunks settle back into their bed without duplicating the bunker.
Older bathhouse fire charges become equivalent coal fuel once, preserving paid
fuel without requiring new tools to keep an already-lit fire going.

The surrounding bathhouse save retains guests, service progress, payment state,
floor ownership, heat, pending water, recovered supplies, and permanent loss.
The actual basin water remains in the existing world/liquid save. Legacy garden
saves still refund retired land/materials and ready pearls, recover their water,
and remove only the former pool footprints. No pearl production is restored.

## Implementation and checks

- `077-hearth-physics.js`: bounded pile contacts, ignition, combustion, air, saves.
- `078-hearth-art.js`: faceted coal, hot cracks, ash, flame transport, event sparks.
- `078-hearth-casing.js`: curved cast-iron surround, flush straps and wide ash drawer.
- `078-hearth-room.js`: shared controls, direct coal manipulation and saved legacy work.
- `078-hearth-station.js`: responsive basin/firebox layout, fuel controls and burn readings.
- `079-forge-resources.js`: mining flint, supply reservation, protected shiny ores.
- `074-bath-service.js`: real bath heat/water, guests, permanent drains, migration.
- `074-bath-skin.js`: local wetting, uneven scale peeling, bounded flakes and shared contours.

Run `node tools/test-hearth-physics.cjs`, `node tools/test-forge-resources.cjs`,
and `node tools/test-bathhouse.cjs` for fixed-step contacts, material conservation,
frame-rate independence, first ignition, forge transactions, reloads, visitor
payments, cancellation refunds, and legacy migration.

`node tools/hearth-smoke.mjs` checks real mouse and touch coal handling, first
striker crafting, boiler ignition, actual WebGPU bath heating, guest service,
save restoration, and desktop/phone/short-landscape views. `node
tools/bathhouse-smoke.mjs` retains the focused bath/visitor visual checks. Both
own a separate Chrome for Testing child process, close that exact child, and
save screenshots under `/tmp`.

`node tools/test-sky-slime-jets.cjs` checks nozzle pressure, spread, mass, spin,
terrain/body shielding, live gating, visual clipping, and 30/60/144 Hz behavior.
`node tools/sky-slime-smoke.mjs` verifies ground launches, chained aerials,
real jet-driven rolling without chassis contact, and WebGPU water response.

Responsive developer UI verification: `node tools/bathhouse-smoke.mjs --layout-only`
checks desktop, phone, and landscape layouts, real pointer input, preparation,
water emission, guest admission, and toggling dev mode inside the bathhouse.

## Unrestricted overflow

The hose has no tub-volume cutoff. It keeps pouring while stock is available
(or indefinitely with developer supplies), including above the old 450 L
threshold. Real liquid crosses the open curved lip, falls outside the copper
bowl and is removed on reaching the floor. Saving flushes live and parked
floor spills before serialization. Airborne splashes are not deleted early.
Old square terrain steps at the lips are cleared when an existing room opens.
The shared simulation's particle allocation remains bounded; only accepted
particles debit finite liquid inventory.

Run `node tools/test-bath-overflow.cjs` for inlet conservation, above-threshold
pours, legacy lip migration and save-time spill removal.

`BUNDLE=1 node tools/bath-guest-soak-smoke.mjs` verifies automatic entry,
actual GPU water displacement and buoyancy, exposed gel beside retained scales,
flakes, held and cold pauses, partial-bath saves, one payment, landscape mobile
and the portrait gate. The bathhouse unit suite checks two automatic guests and
partial crust restoration at 30, 60 and 144 Hz.
