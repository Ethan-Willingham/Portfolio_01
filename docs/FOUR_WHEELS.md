# All Four Wheels

A standalone JavaScript game in progress at `four-wheels.html`, listed in the
In Progress section of `archive.html`. It has no Sluice dependencies or bundle step.

## The current game

One continuous, hand-built route, approximately 2,335 feet long in the game's
scale. The goal is to get the cart to the end. There is no countdown. The HUD
shows current distance, furthest distance, falls and style. Sections change the
HUD and scenery without stopping the simulation, replacing the cart, resetting
momentum or requesting another scene.

The route combines dirt, asphalt, grass shoulders, red and white racing curbs,
physical guardrails, bare cliff edges, two water crossings, and three grocery
stores. Turns are rounded centerline curves. Every road ribbon and rounded join
supplies the renderer and floor support. Tiles inside stores take priority over
road materials. Each tire samples the material under its own actual contact.
Dirt has grip 0.85 and drag 1.38; grass has grip 0.7 and drag 3.8; asphalt has grip
1 and drag 0.68; tile has grip and drag 1. Spills modify those same tire samples.

The twelve sections and their fall destinations are:

| Section | Surface | Rail sides | Fall returns to |
| --- | --- | --- | --- |
| The first push | Dirt | Both | The first push |
| Blacktop bend | Asphalt | One | The first push |
| A grocery detour | Dirt and tile | One | The first push |
| The water crossing | Asphalt | One | Blacktop bend |
| Quarry switchbacks | Dirt | One | A grocery detour |
| The picnic straight | Asphalt | Both | The water crossing |
| No rail, no bargain | Dirt | None | The first push |
| The big weekly shop | Dirt and tile | One | Quarry switchbacks |
| Grass on the outside | Dirt | One | The picnic straight |
| The thin end | Asphalt | One | The picnic straight |
| Last bottles | Asphalt and tile | One | The big weekly shop |
| The last long turn | Dirt | None | Grass on the outside |

The course is planar, with solid cliff slabs drawn down to -30 artwork units
and water below at -35. It does not simulate driving over a raised ramp. Falling
uses gravity, continuing planar momentum, and visual pitch and roll. The shopper
and cart have heights for drawing and stock impacts, but this is not a general
six-degree rigid-body solver.

## Editable sources

- `four-wheels.html`: game shell, briefing, results and play notes.
- `four-wheels.css`: scoped paper and ink UI, phone controls and fullscreen.
- `js/four-wheels-course.js`: route geometry, spatial hashes, surfaces, stores,
  guardrails, swinging-door poses, route distance, catches and saved-world schema.
- `js/four-wheels-stock.js`: furniture, supported stock, products, breakage and films.
- `js/four-wheels-tricks.js`: clearances, spins, slides, combos and style.
- `js/four-wheels-physics.js`: cart, four caster constraints, contacts and fixed steps.
- `js/four-wheels-view.js`: shared isometric camera, pixel rasterizer and 3D models.
- `js/four-wheels.js`: input, audio, lifecycle, saved run, records and UI.

`js/four-wheels-levels.js` and `tools/four-wheels-driver.cjs` remain as legacy
regression fixtures for the old timed store. The live page loads the course
module instead. Keep browser order: stock, tricks, course, physics, view, main.

## Handling to preserve

The cart and shopper are a rigid body with the center of mass behind the basket.
The basket center is 14 units ahead and the shopper is 16 behind. Steering applies
a force couple. It rotates the body without rotating the existing velocity vector.
Push and pull apply force along the heading. Brake acts on the actual velocity.

All four wheels have independent swivel angles, angular velocities and signed
rolling distances. Each fixed pivot carries a fork whose tire trails 5.5 units
behind it. The tire center is not the pivot. A tiny mirrored axle offset starts
the swing when pulling directly backward. Bearing drag exchanges angular momentum
with the chassis; idle casters keep their last angles. Ground impulses constrain
lateral tire velocity using body translation, yaw and caster swivel inertia.
Unsupported tires receive no ground grip. Unequal surfaces can produce braking yaw.

The tire envelope is 8 by 4 units. Physical fork pivots, trailing tire contacts,
collision rectangles, colored tread and visible wheel models share the same pose.
The silver cart stays empty and translucent, with three-unit wire spacing so all
four wheels remain visible. The shopper has articulated trouser legs, planted and
swinging feet, travel-driven walking phase, a shaded head and eased effort/braking
lean. Gait advances during physics, including travel around the handle while
rotating. Rendering and pause do not advance it.

The caster model follows the principles described by
[Arrizabalaga et al., 2021](https://arxiv.org/abs/2110.05604), simplified for a game.
The contact solver uses point velocity, equal and opposite impulses and Coulomb
friction, as described in [Box2D's simulation documentation](https://box2d.org/documentation/md_simulation.html).
No Box2D dependency is loaded.

## Route, collisions and falls

55 ordered wheel checkpoints keep progress tied to driving the route. A tire's
actual oriented envelope touching the 20-unit circle clears it, including exact
tangency. The basket or shopper alone cannot clear a checkpoint. The current
circle is visible, with a section number at an entrance and GO on intermediate
marks. Offscreen guidance points to that same circle. Direction arrows, numbered
roadside signs and a minimap show the route. Distance projects between consecutive
cleared and upcoming marks, preventing a shortcut to the final platform from
raising the record. Four artwork units equal one displayed foot.

Guardrails and store walls use convex polygon collisions from their displayed
geometry. Basket, shopper and each tire receive separate contact impulses.
Contacts immediately turn the exact outlines and contact point red, including
resting contact with a 0.04-unit tolerance. The highlight fades over 0.32 seconds.
Grass remains supporting floor. Curbs are paint, not an invisible wall.

Each wheel samples support at its trailing contact. Two unsupported wheels, or
the body center leaving floor, starts an irreversible fall. It continues linear
and yaw momentum while gravity lowers the body and turns it toward the unsupported
side. Water adds a splash/ripple. After 1.15 seconds the same body and wheels return
to an earlier catch with settled motion. Ordered progress rewinds to that catch.
Furthest distance, style, shelves, products, doors and spills remain. There is no
time penalty. Pause freezes gravity too. Practice catches at the practiced
section instead. Props and loose products can fall off the track.

At the end, all route marks must be cleared and the complete basket, four tire
envelopes and shopper circle must fit inside the finish pad. Completion records
elapsed rolling time and falls without adding a deadline.

## The stores and persistent mess

Quick Mart, The Weekly Shop and Last Bottles have tiled floors, physical walls
with matching entrance/exit gaps, storefront signs and two hinged glass leaves
per entrance. The leaves rotate about fixed jambs, respond to cart and tire
impulses, spring closed with damping, and stop at their angular limits. Gentle
force opens them. A high impact breaks the actual leaf and spawns falling glass
pieces. Those share the 220-fragment cap with broken stock.

Ten tables and racks contain real supported products. Tables hold one water vase.
Racks populate tiers at 12, 22 and 32 units, with at most two rows per tier to keep
large racks bounded. Supported stock adds to mass, inertia and center of mass.
A bump transfers yaw, translation and tipping torque. Stock retains momentum
relative to a moved board. Gravity slides it as the board tilts. Crossing the
edge or losing support releases it with the board's actual 3D velocity.

Furniture is a full prism, rotating about its leading floor edge as it topples.
Its projected hull supplies the collision shape. Falling frames can hit each
other. A down rack remains a solid three-dimensional object on the floor.

Wine bottles, jars, vases, dishes, pots, cans, ketchup and cartons have mass,
friction, bounce, height, vertical velocity and tumbling. Fragile objects break
into physical fragments and pour their contents. A tire can crush a bottle that
the basket clears. Ketchup flattens and pours sauce. A water vase makes a clear
puddle. Cans roll and rattle; ceramic breaks differently from glass.

Floor films have material-specific flow, grip and drag. Flow runs at 20 Hz and
conserves volume. Tires pick up a limited coating and deposit it into clean cells,
leaving wet or colored tracks. Global cells cover the entire course. Supported
floor checks keep liquid out of the void. Collision broad phases, sleeping landed
items and a spatial product grid bound the simulation. Obstacles do not impose
clock penalties. Contact still breaks an unbanked stunt combo.

## Style

Close calls use the real basket, shopper, four tire envelopes, props and current
rack hull. At 20 Hz, a pass arms inside six units at speed 22, then must clear
twelve units with fourteen units of travel and speed at least sixteen. Contacts
within 0.15 units do not count. An impacted obstacle stays blocked for that pass;
an intact rack or prop pays once per run. Walls, glass doors, fallen stock and
hazard edges are not near-miss targets.

Moving spins track signed rotation across the angle wrap. A 180 needs twenty
units of travel; a 360 needs forty-five. Slow/stationary turns, reversals, contact,
missing support, falls and pose jumps interrupt them. The 360 upgrades its 180.
One uninterrupted spin pays those milestones once. Slides require sustained
sideways coasting without braking or an active spin. A new paid spin or slide
requires further travel. Clean moves within five simulation seconds chain to x4.
Points: 75 close call, 100 half turn, 250 additional full turn, 75 slide.

The course awards style without time bonuses. Preserve that distinction from
the legacy timed fixtures. Raised confetti, swept floor arcs, short wheel streaks,
callouts and synthesized tones acknowledge moves. Reduced motion keeps rewards
and text, while disabling particles, shake and animated trails. Pause freezes
combo and effect lifetimes. Feedback never captures input or covers thumb pads.

## Camera, art and controls

The camera looks down about 52 degrees. Projection is x = 290 + 0.84(x-y),
y = 24 + 0.66(x+y) - 0.74z. Input and physics use world coordinates. Depth-sorted
solid faces draw the shopper, cart, furniture and products at their real heights.
It is a painter's renderer, not a per-pixel depth buffer.

The following camera uses a 960-pixel canvas on wide views and 480 in portrait,
at scales 1.45 and 1.8 respectively. Canvas height matches the stage aspect ratio.
Course map fits the entire route without advancing physics. Lazy 256-unit floor
tiles cache deterministic gravel, asphalt flecks, grass tufts, flowers, curbs and
store tiles, capped at 32 canvases. Floor polygons, support, rails, spills, shadows,
markers and overlays share the projection. The art is drawn locally and the game
has no runtime art requests or third-party engine.

Keyboard: W/S or up/down push/pull; A/D or left/right rotate; Space brakes;
P/Escape pauses; R requests a fresh run; F toggles fullscreen. Inputs are scoped
to focus inside the game. Restart asks in-game before discarding the run and
retains records and unlocked practice. Escape cancels that confirmation.

Phones have two independent captured analog thumb pads and a central brake.
The left rotates horizontally; the right pushes upward and pulls downward.
A 12-percent neutral zone prevents accidental force. Full displacement is 28
percent of pad width. Releasing coasts. Brake overrides push/pull while preserving
rotation. Pads, captions and accessible slider values reflect the actual force.
Each pad owns one pointer; another finger cannot steal it. Inputs clear on pause,
picker, blur, hidden tab, cancellation, lost capture and viewport changes.

## Saves and practice

`four-wheels-course-v1` holds best distance, completion/time/falls, and one parked
challenge run. Older v1 through v6 timed record keys remain untouched. Every two
seconds of play, on pause, fall, recovery and pagehide, the game saves the cart,
casters, gait, route state, time, falls, furniture, props, supported and loose
stock, films, hinged doors and banked style. Restoring rebuilds shelf references
and film maps; it does not turn supported stock into falling products. Active
unbanked combo detection and short-lived particles restart after reload.

Loading parks a valid saved run behind Continue. Invalid versions or malformed
physics values start a fresh run safely. Blocked storage shows a short message
and permits play. Record distance stays after a fall or fresh start.

Reached sections unlock practice cards. Practice creates its own world while
parking the challenge snapshot. It cannot alter the challenge record or overwrite
its save. Exit practice/Return to run restores that parked challenge, including
its exact body momentum and mess. Reload during practice loads the parked challenge.

## Verification and release

Run `node --check` on all six live scripts and the legacy fixture, then:

```sh
node tools/test-four-wheels.cjs
node tools/test-four-wheels-stock.cjs
node tools/test-four-wheels-view.cjs
node tools/test-four-wheels-journey.cjs
node tools/test-four-wheels-tricks.cjs
node tools/test-four-wheels-course.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
```

The old room and journey tests preserve handling and stock regression fixtures.
The new course tests verify floor continuity, material forces, real rail contacts,
water/cliff setbacks, retained world identity and mess, swinging/broken doors,
stock tiers, saved debris and films, corruption rejection, ordered tire progress,
complete finish footprint and unchanged stunts. The verification pilot drives all
twelve sections using player forces, without teleporting or forced falls.

The browser suite covers the same whole journey, desktop/mobile input, parked
reloads, practice isolation, restart confirmation, both falls, paused gravity,
stunts, overview, fullscreen, 320-pixel phones, short landscape, blocked storage,
reduced motion, no scene requests and JavaScript errors. Private hooks and the
pilot are injected by the local test server, never shipped. Use the owned
`/Users/ethan/.local/bin/agent-chrome-for-testing` process and close it in finally.

`ASSETS=1` refreshes the 1200 by 750 thumbnail and WebP sibling from the renderer.
Keep the archive picture wrapper. Bump all seven CSS/script query versions for
any deployment. Commit only the game's changes and push main, which deploys via
GitHub Pages. Check deployed bytes and real desktop/mobile input before reporting
that a release is live.
