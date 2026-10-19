# Widewake ocean redesign

Owner direction, 2026-10-19. This supersedes the Earth requirement and the old
1,200-enemy ceiling as an endgame design target. Keep the approved title screen.
Final image generation is still deferred.

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

The world is not yet authored, and these regions are not implemented by this
document. Decide the first region's dimensions and route graph using the trial's
tested vessel sizes and maneuvering footprint, before generating a large map.

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
