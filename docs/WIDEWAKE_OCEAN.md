# Widewake ocean redesign

Owner direction, 2026-10-19. This supersedes the Earth requirement and the old
1,200-enemy ceiling as an endgame design target. Keep the approved title screen.
Final image generation is still deferred.

The later owner clarification makes Factorio a reference for sprite detail,
animation and rendering efficiency. Widewake retains its nautical identity.
Publish tested milestones regularly. The owner's next instruction explicitly
asks to retire the old world and make this ocean the game. Version 0.22 connects
routes, trading, work, progression and saves in Bracken Reach. See
`WIDEWAKE_REACH.md`. The stages below record the earlier development order.

## Order of work

Do not attempt the world, combat, graphics and campaign overhaul in one pass.

1. Establish a playable endgame sea trial. Test real kills, replacement fronts,
   finite friendly hulls, moving formations, production and input. Build an
   isometric renderer and zoom around this load. The trial must not read or write
   the captain's campaign save.
2. Review that experience in motion. Establish minimum-device evidence, readable
   weapon roles, near and far camera behavior, and sustained frame budgets.
3. Establish one navigable region at believable local scale. Use its channels,
   currents, banks and water transitions to test the fleet and camera. Only then
   expand to other regions and connect the economy and progression.
4. Migrate the campaign deliberately. Existing voyages need an explicit migration
   or retained version. Do not silently replace Earth under an active saved fleet.

## Combat and the reference

The [official BELTFED gallery](https://www.hoodedhorse.com/games/beltfed) was
inspected as full-size images on 2026-10-19. The broad battlefield image shows
dense fronts around an occupied interior; the flame images show a visible
boundary between attackers and protected production. These are visual
observations, not measurements of BELTFED's engine or claims about its internals.

Widewake's adaptation is a moving defensive perimeter. Rapid guns chew at the
front, flak clears local pockets, and arcing batteries open deeper gaps. Workboats
and cargo remain the things inside that perimeter worth protecting. The flagship
can move to a weak side. A formation that looks powerful must actually intercept
enemies and projectiles; a decorative torrent of particles is not enough.

The first engineering load is 16,384 active light raiders, 24 friendly vessels,
thousands of traveling rounds and sustained replacement of destroyed enemies.
This is a test target, not a measured guarantee or final campaign balance.
Measure simulation, frame time, input response, drawing, memory and GPU batches
separately. Keep the population identical across viewport sizes. Reduce decorative
detail before changing the simulation. An immortal-enemy test remains useful for
comparison but does not establish turnover performance.

The implementation should keep light raiders in fixed typed buffers, index local
collisions, share coarse steering decisions, and batch rendering. Large vessels,
important attacks and fleet orders retain individual behavior. Reserve space for
hostile shots so defensive fire cannot consume their capacity. Death, pickup and
audio work need their own budgets. Performance must include them.

## Isometric sea and camera

The ocean becomes an orthographic isometric scene with real hull sides, decks,
cabins, weapon height, arcing shells and water-level wakes. Simulation remains on
the water plane. Projection and its inverse are shared by drawing, aiming,
steering, touch and tests. Rotating a flat top-down sprite is not this redesign.

Use a steady camera. Do not unexpectedly pull it away during an attack. Establish
three useful stops on a continuous zoom: Helm for individual handling, Fleet for
the defensive perimeter, Survey for approaches and route choices. Wheel and
pinch should retain the water point being inspected. Keyboard and controller
zoom retain the flagship. Inspect the smallest real boat at every stop. Distant
fronts can simplify visually; telegraphs and protected hulls cannot disappear.

The default should show the fleet, useful water ahead, and enough of an incoming
front to make a decision. It should not expose a page of labels. Damage, a selected
vessel and the current task receive the scarce label space.

## World direction, to develop after the combat baseline

Build an original connected water world, not a compressed real-Earth globe.
Local dimensions must have meaning: a six-metre launch, a forty-metre escort,
and a large industrial ship cannot use the same narrow shortcut. Draft, width,
turning space, current and formation clearance should produce route choices.
Do not add these restrictions before routes and recovery make them understandable.

Plan regions around navigation and ecology, not only recolored water:

- Open salt water: long sightlines, swell, shipping lanes and broad attacks.
- Estuaries: tidal channels, changing current, mixed salinity and cargo exchanges.
- Freshwater rivers: bends, branches, banks, bridges and useful smaller boats.
- Swamps: shallow winding routes, vegetation, concealed approaches and local fish.
- Lakes and uplands: sheltered water, isolated industries and different species.

Use salinity, depth, current and habitat as shared data for movement, fishing,
industry, encounters, sound and art. A coast should have shoals, shallows, reeds,
rock and human use at the scale of its boats. Water movement and small ambient
events should make calm travel worth watching. Threats must remain legible over
that detail. Streaming boundaries must never be a combat or save boundary.

Bracken Reach now implements the first navigation region described below. The
other regions are still design requirements. Prove its connected play before
generating a large map.

## First region, a design to prove before building outward

Use one river mouth as the next navigation test. The working extent is roughly
eight by twelve kilometres. One world unit means one metre; geography is sized
around the hulls instead of fitting a continent into the camera. These dimensions
are starting assumptions for a greybox, not finished content or a realism claim
about the current trial's deliberately fast handling.

The region needs three readable destinations: a sheltered home yard near the
mouth, a working mill upriver, and a small reed landing on a tributary. A main
channel connects home and mill. A winding shallow cut rejoins it, creating an
actual shortcut for a light boat. Open water outside the mouth gives industrial
boats room to work. Do not build a lake region, an entire ocean and a global
economy alongside this test.

| Waterway | Initial dimensions | Decision it must support |
| --- | --- | --- |
| Outer approaches | More than 1 km clear water | Deploy the wide endgame defensive formation; see an approaching front |
| Estuary channel | 180 to 300 m usable width | Enter in column, judge banks and current, find turning room |
| Main river | 90 to 150 m usable width, wider bends | Trade speed for clearance; pass a loaded convoy without clipping hulls |
| Reed cut | 22 to 35 m usable width, shallow bottom | A launch keeps a valuable route that a large industrial fleet cannot use |
| Landings and work basins | Sized from measured stopping and turning footprints | Reach the actual berth or working position without teleporting boats |

Measure the starter launch, the trial's 38 m escort and the 61 m industrial boat
through the same bends. Its 86 m flagship is a later constraint, not the starting
vessel. Establish their turning and braking before locking channel dimensions.
The current trial has neither bank collision nor a finished rudder model, so its
handling alone cannot validate these widths. Route clearance uses the largest
assigned hull and safe spacing, not only the flagship's centre point.

The v0.19 trial replaces sideways sliding with heading, angular acceleration,
throttle and braking. Its 86 m flagship reaches 95 percent of its 26 m/s cruise
in 3.38 seconds and stops in 31.56 m after release. The trawler stops in 13.74 m;
the slower industrial vessel stops in 10.00 m. These are measured arcade handling
values, not real-vessel specifications. The renderer interpolates fixed-step
motion. Test full hull clearance, collision and reversing in the region before
using these centre-point distances to approve a channel or berth.

Keep the player in control of formation changes. Preview a column order at a
channel entrance; let the captain deploy a perimeter in a basin. The camera may
offer an appropriate stop but must not forcibly zoom during a fight. A blocked
large ship waits in navigable water and marks the obstruction. Reverse, reform
or call a tow must work before grounding penalties are added. Small boats should
keep useful jobs after large hulls become affordable.

Fresh water flows toward the estuary; salinity changes gradually near the mouth.
Depth, bottom material and habitat belong to the same authored surface used by
navigation and fishing. Rare catches arise from those places and conditions.
Oil sites require a geological deposit and suitable working room; they are not
an arbitrary reward attached to every blue patch. First prove one fishing ground
and one industrial station, each with a different approach and escape route.

Visual detail follows function. A pale shoal exposes a shallow route, a broken
reed edge reveals the channel, and floating debris shows current. Put quieter
ripples and small wildlife near calm banks. Preserve clear water around attack
lanes and reduce foreground vegetation where it hides a ship. Shared depth and
current data should make the artwork informative without another panel of text.

Use streamed local tiles with persistent region coordinates and bounded active
entities. Neighbouring tiles must share banks, depth and flow at their edges.
Do not run a path search for every raider: start with a shared water-route field,
then local collision and avoidance. The open-water stress result does not prove
this will meet the budget. Repeat that load at a bend, bridge and tile boundary
before expanding the world.

The region passes when a new captain can read the safe route without a wall of
instructions, trade out and back, catch fish, protect a working vessel, and recover
from a bad turn. A later fleet must complete the wider route, while a small launch
still benefits from the cut. Test the same geography at Helm, Fleet and Survey,
on desktop and touch, including rain, combat effects and paused recovery. Judge
calm travel in motion before spending time populating a larger world.

## v0.20 implementation and graphics

Bracken Reach has an 8 by 12 km extent, a 9.0 km main passage from Tern Yard to
Lockmill and a launch-only reed cut that saves 1.24 km. Reed Landing lies on the
cut. The 6 m launch, 38 m escort and 61 m industrial hull physically sail their
permitted round trips. Draft, oriented hull clearance, current and salinity come
from one authored field. Swept movement stops before a bank or pier. Reverse and
a tow along recorded safe positions allow recovery. The piers use the same
footprints for rendering and collision. The berth is an open-water anchorage;
walking ashore and docking services are not implemented.

The renderer uses original models with shaped bows, separate hull sides, inset
decks, seams, railings, cabin windows, fittings and role-specific equipment. It
bakes 64 friendly headings and 32 raider headings into color/depth sprites at
startup. Per-pixel depth lets independent turrets, recoil, equipment and scenery
overlap correctly. A hull's bob is shared by its attached equipment. Winches and
drill rods move only while the vessel is on station with room to produce. They
freeze when production stops instead of snapping to the start of a cycle.
Propeller motion, speed-driven wakes, water and foliage use bounded draw batches.
Pause stops animation; reduced motion freezes decorative movement.

The [Factorio water rendering article](https://www.factorio.com/blog/post/fff-323)
informed the use of texture noise and a quiet water surface; its assets and code
are not included. The [terrain composition article](https://www.factorio.com/blog/post/fff-401)
informed grouping vegetation around readable banks. The resulting work is still
an initial authored region, not a claim of matching Factorio's finished art.

Water colors and shoreline wash follow depth and salinity. Current moves the
surface texture. Three canopy shapes, reeds, stones, timber piers and distinct
yard, mill and reed buildings establish the shore. Terrain tiles are prepared in
a worker and retained in a bounded cache; the overview remains available while
nearby tiles load. Routes also run in that worker. Atlas storage is 20.06 MiB for
the battle and 22.73 MiB for the region. Scenery shares atlas shelves, avoiding a
power-of-two allocation that previously wasted nearly half the texture memory.
The Canvas fallback keeps the same hulls, buildings and vegetation, with simpler
water and without the WebGL machinery effects.

The navigation trial has no fleet columns, enemy route fields, tide cycle,
fishing, oil sites, trading, region saves or campaign migration yet. Calm travel
still lacks encounters and discovery. Banks and foliage need more variety, and
distant small ships need further readability work. Next prove a convoy through
the same geography, including work and a return to port; repeat the enemy load
there before expanding the world. Physical mobile devices remain a release gate.

## v0.21 motion correction

The v0.20 nearest-filtered sprites and half-resolution pixelated presentation
caused visible shimmer even with simulation time frozen. Friendly headings also
jumped between baked views. The revised renderer keeps logical camera coordinates
separate from a raster sized for the display, capped near 2.1 million pixels and
1.5 device pixels per CSS pixel. Aiming, anchored zoom and label sizes retain their
world scale.

Each original hull heading now has its own texture-array layer and complete mip
chain. Minification cannot bleed into another heading. Adjacent headings blend
continuously. Color and encoded depth both carry coverage through the mip chain.
Opaque surfaces establish depth first; a second batched pass blends fractional
silhouettes without writing depth. Instance buffers upload once. This avoids both
hard alpha-cutoff flicker and transparent fringes hiding opaque boats behind them.
Geometry uses the browser's multisample buffer where available. No full-scene
blur, temporal history, or reduced enemy population is involved.

Water, foliage, hull bob and work gear use interpolated visual time. Canvas fallback
uses display-aware resolution and smooth sampling. The retained campaign also
interpolates vessels and rounds between simulation ticks and removes coordinate
snapping from moving ships. Title and harbor art are unchanged.

`test-ocean-motion-browser.cjs` measures real frame pixels across slow subpixel
pans, heading changes and a mip-level zoom. Its temporal second difference detects
the former hold-and-jump motion; integrated brightness catches detail blinking
in and out. A tiny distant raider must remain visible at every tested position.
The existing scene, touch, context-recovery, fallback and sustained-combat checks
remain required. Physical mobile hardware still needs direct validation.
