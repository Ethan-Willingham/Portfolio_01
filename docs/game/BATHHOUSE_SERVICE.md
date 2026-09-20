# Bathhouse, boiler, and forge

The banya uses physical coal fires as of v28.13. The old ten-coal ignition
button and fixed four-minute fuel timer have been replaced. The visitor loop
remains enabled, and individual guest recipes are still undecided.

Since v28.16, the banya opens by default for returning profiles as well as
new ones. A one-time `sluice.opt.banya-default=open-v1` migration replaces
the old saved off setting. Later choices in Pause > Options > Banya persist
normally. `?bath=0` and `?bath=1` override the setting for that page load.

## First visit

1. Mine coal and two iron. Iron appears from 55 m and needs no drill upgrade.
2. Break stone for flint. Each stone has a 12 percent chance; a piece is
   guaranteed after twelve unsuccessful eligible breaks. Up to three are kept.
3. Scoop water into the rig tank. The forge needs 2 L; the bath needs at least
   40 L and can hold up to 150 L.
4. Enter the banya and choose Forge. Load two iron and drag a coal chunk from
   the bunker onto the forge grate. The forge's banked ember starts this fire,
   so making the first steel striker never requires a striker you do not have.
5. Work the bellows while the iron heats. Once it is ready, hammer three times,
   quench with 2 L, let it cool, and collect the steel striker.
6. Choose Boiler. Load three coal chunks for strong heat, then strike flint
   and steel. Both tools are reusable. Add coal while the fire burns, work the
   bellows for more heat, and rake away spent ash when the grate fills.
7. Choose Bath and ADD WATER. Tap a visitor's bubble once the bath is warm.
   It soaks, pays, and returns outside. The same visitor identity is preserved.

The coal/iron locker keeps up to 24 ordinary coal and 8 ordinary iron on entry
or before a station sale. A radio line reports the transfer. Shiny ores and
surplus materials still sell. Coal can also be drawn directly from ordinary
cargo, so arriving at the banya before selling works. Tools and stored supplies
survive a rig recovery; cargo still follows normal death rules.

## Direct controls

Mouse and touch share the same pointer path. Drag a chunk from the bunker into
the firebox and release: it falls, rolls, collides, and settles. Existing pieces
can be picked up and rearranged. Dropping fresh coal outside the firebox returns
it; moving a burning piece outside returns it to its previous grate position.
Pointer cancellation and leaving the room restore an unfinished drag safely.
A simple tap on the bunker drops one piece, for players who prefer not to drag.

- 1 / 2 / 3: Bath / Boiler / Forge.
- C: place one coal in the current firebox.
- B: work its bellows.
- F: strike flint and steel at the boiler.
- A: rake spent ash.
- E / Enter: advance ready forge work, or admit a ready visitor in Bath.
- W: fill the bath from stored water while viewing Bath.
- Escape: leave the banya.

The fire room keeps the boiler vessel, flint/steel board, anvil, and quench
pail visible on desktop, phone, and short landscape screens. The scene reserves
space for its navigation and controls before sizing the fixtures. The Bath camera
fits the complete ground-floor tub below its controls, and returns to that floor
when entering the Bath tab or resizing. Upper floors remain available by scrolling.

For a quick developer playtest, enable dev mode with backtick, including while
inside the banya, or load `?dev=1`. Coal, iron, water, flint, and ignition steel
are available without limit. Loading coal, adding water, and quenching leave your
real stock, cargo, and rig tank unchanged. Supplies immediately return to their
ordinary counts when dev mode is turned off. The fire still burns and the tub
still spills, so tending and refilling remain testable.

- PREPARE BATH / T lights at least three real boiler coals, warms the bath, and
  starts filling it through the normal water pour. It opens the Bath view.
- ADD GUEST / G brings a real visitor into a free waiting place. Tap its order
  once the bath is ready. The normal two-place and total visitor limits apply.
- Forge work can be repeated in dev mode even after collecting a striker.

These buttons remain visible on touch screens and disappear outside dev mode.
Dev supplies are virtual finite counts, never saved infinite inventory. Created
water, physical fuel, finished forge work, and guests follow ordinary persistence.
A coal created in dev mode cannot refund itself into real stock after a reload.
Dev mode retains its existing free purchases and 999,999 money clamp.

## Coal and heat

Both beds simulate in fixed 1/120-second steps, with a maximum of eighteen
pieces per bed. Chunks have gravity, contact friction, spin, low restitution,
and saved fuel and heat. Held chunks are detached from pile contacts. Cold coal
cannot ignite in the boiler without a spark or a hot neighbor. The forge's
banked ember is local to its bed and never heats the bath for free.

A chunk burns for roughly 48 to 60 seconds at normal air. Bellows raise output
and burn rate together, then settle back. Multiple pieces can burn together;
total remaining fuel is an energy reserve, not a promise of that many seconds
of fire. Coal becomes a physical ash piece and cools when spent. Raking removes
only spent ash, never usable fuel. Small collisions, ignition, and bellows throw
sparks from the actual bodies. The flame field is a bounded visual simulation,
independent of the saved thermal and contact model.

Boiler output warms the bath gradually. Three fully burning pieces can provide
full heat; one provides a weaker fire. Adding cold water dilutes warmth, and the
bath cools when the fire dies. This stored thermal state drives the existing GPU
heat source, water tint, convection, steam, and the copper heat exchanger under
the tub. The CPU fallback uses the same service warmth state. Temperatures on
the dial are a game-scale estimate.

Fuel, heat, forge work, and admitted visitors continue while the player mines.
Pause stops all of them. There is no offline catch-up or day/night service gate.

## Water and visitors

Water uses the shared liquid particles, with 100 particles per displayed litre.
ADD WATER transfers existing rig/stock water to a saved pouring reservoir before
emitting into the tub. A blocked solver retains pending water. Admission never
charges a per-guest dose of coal or water. A low or cold tub pauses earned soak
time until restored.

Guests splash actual water out. Contact with the floor permanently deletes it
through the solver mutation journal, including parked offscreen spills. No
spill returns to the tank or survives a save. Quenching separately consumes 2 L
from tank/stock water exactly once; it does not empty the guest bath.

Two rocky visitors can roam outdoors, counting a carried visitor toward that
limit. Two more visitors can wait or bathe inside. An eighteen-second warm soak pays $75. These are initial service
values, not guest recipes. Sky arrivals still use their existing surface-distance
rules. This change does not implement the earlier day/night proposal.

## Bath-born residents (v28.47)

Five soft residents appear around the starting town for playtesting, including
on existing saves. A completed warm bath changes a rocky guest into the same
kind of creature. Its shell fades during the last part of the soak, and its
surface body spawns at the door after departure. It keeps its visitor identity,
stays in the world, and saves separately from the rocky population. Reloading
does not add another five. The payment still happens once per completed bath.

These are 37- or 61-point deformable meshes in the existing XPBD solver. Their
lobed resting shape, spring network and pressure constraints govern collisions
with terrain, the rig, other gel bodies, and rocky guests. Softer edge and shear
constraints and lower internal damping let them slump, stretch, and wobble.
A travelling muscle wave changes local spring lengths and the target shape.
Patches of skin grip fixed terrain contacts during their contraction and release
during their forward stroke; this contact drives crawling. The muscles have
zero net translation in free space. At a wall the same wave turns upward, then
rounds an exposed top corner onto the ledge. Terrain bonds have finite reach and
strength, and disappear when their supporting tile is mined. Rig impacts, jets,
grabbing and tossing suspend adhesion so a resident can peel off and fall.
They avoid walking into shafts and stay near their own surface neighborhood.
Player pushes can still send them underground. Underground slime brains remain
disabled by default.

Click or touch a soft resident and drag to lift it by a compliant patch of gel.
Release while moving to toss it. The grip keeps terrain and body contacts
active; cancel, pause, focus loss, and entering the banya release it. The liquid
tool and mobile driving controls retain their input. Drive into the residents,
land on them, or brush them with jet exhaust to play without dragging.

Pastel gel, highlights, blinks, smiles, and startled faces follow the deforming
mesh. Pond water provides buoyancy; the real boundary displaces WebGPU water, with contour collision in the CPU fallback.
Residents do not dissolve. Off-camera bodies use the existing simulation culling.
The five starting residents do not count toward either rocky-visitor limit.

`347-surface-slimes.js` owns the mesh, appearance and persistence;
`347-slime-locomotion.js` owns muscles, crawling and terrain adhesion;
`349-slime-touch.js` owns the pointer grip and rock/gel contact. Run
`node tools/surface-slime-smoke.mjs` for real-browser checks of movement,
30/60/144 Hz impacts and launches, mouse/touch input, water, guest conversion,
and full-game save restoration. `node tools/surface-slime-crawl.mjs` verifies
climbing in both directions at those frame rates, loss of propulsion with the
wave disabled, wall knock-off, jets, and mined handholds. Screenshots go to `/tmp`.

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
