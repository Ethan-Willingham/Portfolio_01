# Bathhouse and integrated boiler

The banya uses physical coal fires as of v28.13. The old ten-coal ignition
button and fixed four-minute fuel timer have been replaced. The visitor loop
remains enabled, and individual guest recipes are still undecided.

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
4. Hover the boiler hatch to highlight it, then click or tap to open the firebox.
   Load three coal chunks and strike flint and steel. Both tools are reusable.
   Work the bellows for more heat and rake spent ash when needed.
5. Choose BACK TO BATH or press Escape. ADD WATER fills the tub. Tap a visitor's
   order once the bath is warm. It soaks, pays, and returns outside.

The forge and its crafting requirement are retired. New and returning games
receive a supplied striker. Old stored iron, forge fuel, and unfinished work
remain in the save without progressing or burning. Ordinary iron now sells
normally; the fuel locker reserves up to 24 ordinary coal on entry or before a
station sale. Shiny coal and surplus coal sell normally. Coal can also be drawn
directly from ordinary cargo. Stored supplies survive rig recovery.

## Direct controls

Mouse and touch share the same pointer path. The room opens directly to the
bath. Hovering the integrated boiler highlights its metal surround and changes
the cursor. A click or tap opens it; dragging across the hatch does not. In the
close view, drag a chunk from the bunker into the firebox and release: it falls,
rolls, collides, and settles. Existing pieces can be rearranged. Dropping fresh
coal outside the firebox returns it; moving a burning piece outside restores
its grate position. Pointer cancellation and leaving restore unfinished drags.
A simple tap on the bunker drops one piece.

- C: place one coal in the open boiler.
- B: work the bellows.
- F: strike flint and steel.
- A: rake spent ash.
- E / Enter: admit a ready visitor while viewing the bath.
- W: fill the bath from stored water while viewing the bath.
- Escape: return from the boiler to the bath, or leave from the bath.

The room fits the tub and boiler between compact navigation and a single water
control rail. The main basin spans 26 tiles and retains the original catenary
formula. The drawn lining and carved liquid cavity use the same curve. The carve leaves
only one pixel of clearance, and guest buoyancy includes the remaining tile
clearance beneath the visible lining. Existing
saves recarve the larger room on entry without adding water or charging again.
Old waiting guests move to the dry landing. Purchased upper floors remain
available by scrolling.

Enable dev mode with backtick, including inside the banya, or load `?dev=1`.
Coal, water, flint, and ignition steel are available without limit. Loading coal
and adding water leave real stock, cargo, and the rig tank unchanged. Supplies
return to their ordinary counts when dev mode is turned off. The fire still
burns and the tub still spills.

- PREPARE BATH / T lights at least three real boiler coals, warms the bath, and
  starts filling it through the normal water pour. It opens the bath room.
- ADD GUEST / G brings a real visitor into a free waiting place. Tap its order
  once the bath is ready. The normal visitor limits apply.

These buttons remain visible on touch screens and disappear outside dev mode.
Dev supplies are virtual finite counts. Created water, physical fuel, and guests
follow ordinary persistence. A dev coal cannot refund itself into real stock
after reloading. Dev mode keeps its free purchases and 999,999 money clamp.

## Coal and heat

Coal uses large, seeded convex hulls shared by drawing, picking and collisions.
The 120 Hz solver uses face contacts, actual mass and rotational inertia, low
restitution and static friction. Pieces balance on their faces, tip when their
center of mass overhangs a support, and settle as burning fuel shrinks their
geometry. Held chunks detach from the pile. Each bed holds at most eighteen
pieces, including physical ash.

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

Boiler output warms the bath gradually. Three fully burning pieces can provide
full heat; one provides a weaker fire. Adding cold water dilutes warmth, and the
bath cools when the fire dies. This stored thermal state drives the existing GPU
heat source, water tint, convection, steam, and the copper heat exchanger under
the tub. The CPU fallback uses the same service warmth state. Temperatures on
the dial are a game-scale estimate.

Boiler fuel, heat, and admitted visitors continue while the player mines.
Retired forge work and its fuel remain frozen in the save.
Pause stops all of them. There is no offline catch-up or day/night service gate.

## Water and visitors

Water uses the shared liquid particles, with 100 particles per displayed litre.
ADD WATER transfers existing rig/stock water to a saved pouring reservoir before
emitting into the tub. A blocked solver retains pending water. Admission never
charges a per-guest dose of coal or water. A low or cold tub pauses earned soak
time until restored.

Guests splash actual water out. Contact with the floor permanently deletes it
through the solver mutation journal, including parked offscreen spills. No
spill returns to the tank or survives a save. The supplied striker removes the former forge quenching cost.

Two rocky visitors can roam outdoors, counting a carried visitor toward that
limit. Two more visitors can wait or bathe inside. An eighteen-second warm soak pays $75. These are initial service
values, not guest recipes. Sky arrivals still use their existing surface-distance
rules. This change does not implement the earlier day/night proposal.

## Bath-born residents (v28.57)

Five soft residents appear around the starting town for playtesting, including
on existing saves. A completed warm bath changes a rocky guest into the same
kind of creature. Its shell fades during the last part of the soak, and its
surface body spawns at the door after departure. It keeps its visitor identity,
stays in the world, and saves separately from the rocky population. Reloading
does not add another five. The payment still happens once per completed bath.
Unhardening preserves the incoming visitor's individual radius through departure
and saves. The exposed soft core uses 94% of that radius, as in the bath's shell
fade. Starter residents and older saves use the sky visitors' 22 to 27 pixel
radius range instead of the previous, larger 24 to 29 range.

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
The five starting residents do not count toward either rocky-visitor limit.

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
- `078-hearth-room.js`: direct controls, boiler/forge fixtures, craft transactions.
- `079-forge-resources.js`: mining flint, supply reservation, protected shiny ores.
- `074-bath-service.js`: real bath heat/water, guests, permanent drains, migration.

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
