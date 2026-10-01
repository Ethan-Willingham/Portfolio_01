# All Four Wheels

A standalone JavaScript cart game, listed on In Progress at `archive.html`.
The post stays at `four-wheels.html`. It does not use Sluice's engine, assets,
feature flags, or build step.

## Sources

- `four-wheels.html`: post, accessible controls, briefing and results.
- `four-wheels.css`: responsive game shell, touch controls, fullscreen fallback.
- `js/four-wheels-stock.js`: furniture, supported stock, loose products, breakage and floor films.
- `js/four-wheels-physics.js`: cart physics and course state; browser and CommonJS.
- `js/four-wheels-tricks.js`: physical clearance, moving spins, sideways glides, combos and bounded clock bonuses.
- `js/four-wheels-levels.js`: six rooms, ordered wheel markers, hazards and the connected-world layout.
- `js/four-wheels-view.js`: shared isometric camera, pixel rasterizer and 3D scene.
- `js/four-wheels.js`: input, audio, UI, fixed-step loop and local records.

The camera looks down at roughly 52 degrees above the floor. Its shared
projection is x = 290 + 0.84(x - y), y = 24 + 0.66(x + y) - 0.74z.
Input and physics remain in world coordinates. Projection and its inverse are
exported for verification. Keyboard and touch controls remain relative to the
cart's heading.

The six 480-by-300 rooms form a snake through a three-column, two-row store.
Their origins are (0,0), (520,0), (1040,0), (1040,340), (520,340), and (0,340).
`CartLevels.journey(startRoom)` builds one level with all floors, corridors,
wall gaps, portal barriers, shelves, stock, hazards and 29 ordered checkpoints.
Every room is present from the start. The cart is never replaced, teleported or
reset when crossing a doorway. Velocity, caster angles and rolling distance,
walking phase, time, penalties, loose stock and floor spills all continue.
The clock covers the remaining trip through the final checkout. Selecting a
later starting room skips earlier route marks and starts at that room's entrance.
There are no intermediate results, briefings or loading screens.

Coral, mint, lavender, blue, gold and clay define the rooms' floors, wall trims
and shelf decks. Silver metal and empty translucent cart mesh remain unchanged.
The deterministic terrazzo texture is baked into six transparent local canvases,
then translated into the same world view as every moving model. Color changes
also follow the room badge, clock bar and toolbar accent. The script draws its
art locally, with no asset requests during a room crossing, runtime dependencies,
generated bundle or font CDN. The page uses the site's analytics and fonts.

The page opens directly into the viewport-sized game. A following camera works
on desktop and phones. Wide layouts use a 960-pixel canvas; portrait uses 480
pixels. Canvas height matches the stage's aspect ratio, with smoothing disabled.
The camera scale is 1.45 on desktop and 1.8 in portrait. It follows global cart
coordinates without clamping to a room, so neighboring rooms and connecting
corridors scroll past continuously. A small projected map shows all rooms,
lakes, the next marker, the cart and the visible area. The Store map button fits
the whole connected store into the viewport. Neither drawing nor a camera change
advances physics. Room previews use a 720-by-580 local scene.
The title is inside the briefing; notes and site links sit below the game.
Keep blog heroes and the archive banner off this page. The game remains on
`archive.html` under In Progress.

The game has its own warm paper, dark ink and muted coral interface, at the
owner's request to replace the green shell. Colors are scoped to `.cart-page`;
shared site tokens and the store's pixel-art palette stay separate. The bold
title, menu buttons, receipt-like results and course cards use the site's Segoe
UI and Commit Mono. The start illustration reuses the playable cart renderer.
The HUD shows a shrinking clock bar, actual penalty seconds and each route
marker's state. The pause button switches to a resume icon while paused.
Keep the entire briefing and result card visible on short laptop and phone
screens, and retain at least 44-pixel utility targets on touch devices.

## The handling to preserve

The cart and shopper are a rigid body with its center of mass behind the basket.
The basket center is 14 pixels ahead of it and the shopper center is 16 behind.
Do not rotate the velocity vector when steering. A and D apply a force couple,
rotating the body without directly redirecting its linear momentum. W adds force along the
current heading; S pulls backward. Space brakes the body's actual velocity.

All four wheels have separate swivel states, angular velocities and signed
rolling distances. A fixed pivot attaches each fork to the chassis; the tire's
ground contact trails 5.5 pixels behind it. The tire center is not the pivot.
The tiny mirrored axle offset starts the swing when pulling exactly backward.
Bearing drag exchanges angular momentum with the chassis and leaves idle
casters at their last orientation.

Ground impulses enforce zero lateral velocity at each tire contact, accounting
for body translation, body rotation, caster swivel rate and caster inertia.
Each wheel follows its own curve instead of easing toward the cart's heading.
The small caster inertia keeps these reactions subtle and preserves the game's
sliding feel. Wet floor reduces rolling resistance and braking force.
The fixed pivot and trailing contact geometry follows the caster model in
[Arrizabalaga et al., 2021](https://arxiv.org/abs/2110.05604). This is a simplified
game model, not a calibrated simulation of a particular cart.

The rasterizer uses that same caster geometry for the tire, fork and gold pivot.
Tires and forks are opaque; basket mesh and rails are translucent. The basket
stays empty, with silver rails and a three-pixel wire spacing in both directions.
Do not hide inward-swung casters behind an opaque basket fill. Pivot pins stay
attached to the body while the tire and fork swing around them.
All four tires have an 8-by-4-unit physical envelope, faceted rubber cylinders,
thin steel forks, axle caps and individual travel-driven tread animation.
The smaller gold bearing stays distinct from the silver axle. Keep the art
and `CASTER.halfWidth` consistent so red contact outlines match the slim tires.

The shopper's gait advances on physics steps using velocity at the shopper,
including the arc around the handle during rotation. Phase is integrated, so
speed changes do not jump the legs to a new pose. Normal travel is about two
alternating footfalls per second, capped at three at a jog. Stride settles at
rest; pulling backward and sliding sideways move the feet in those directions.
Tapered trouser legs bend at the knees. Rounded shoes have cuffs, toe caps,
laces and pale soles. Each foot stays planted for most of its step, then lifts
and swings forward; the feet point slightly outward and follow sideways travel.
The upper body eases into pushes, pulls and turns, braces opposite travel when
braking, and settles at rest. Hips and hands stay anchored to the ground pose
and handle; the lean is visual and does not change the collision footprint.
Rendering and pauses do not advance the gait. The title illustration and course
previews stand still.
The rounded head, ears, nose and shaded brown crown rotate with the shopper.
Keep the hair detail local to the raised head rather than offset on the screen.
The torso, head, arms, bending knees and lifted shoes use real world heights.
The planted feet follow the original cadence; the hands stay on the raised handle.

The simulation uses fixed 1/120-second steps. A cart rectangle and shopper circle
both collide with shelves and walls; each tire also has a separate oriented
collision rectangle. Tire impacts can swivel the fork, move the chassis and
push props even when the basket clears them. Contacts apply torque. Cones and boxes
move, collide with each other and the room, and charge a penalty once per prop.
Cones cost 2 seconds, boxes 3, shelves 5. A shelf charges once when its stock
first falls or the rack topples. Individual products do not add separate penalties.

## Shelves and their contents

The first room has one 32-pixel square wooden table and one water-filled glass
vase, with no cones or other stock. A short normal push knocks the vase off while
the table rocks and settles. Its low board friction, height and break threshold
make the fall reachable at ordinary driving speed. The table has a wider support
base than the tall racks. Later racks have lighter frames and a narrower support
base so normal impacts can topple them; gentle touches can still settle safely.

The rack is a dynamic body with mass, yaw inertia, ground friction and a separate
rocking angle. Its full three-dimensional prism rotates about the leading floor
edge, keeping every structural dimension and staying above the tiles. The
collision hull comes from the ground projection of those same eight vertices.
The gravity support span remains tuned for responsive impacts at cart speed.
A horizontal impulse at basket height transfers momentum to the rack, twists it
around an off-center contact, and adds a tipping impulse. Gravity restores a small
rock and accelerates the fall after the support threshold. Shelves settle at
90 degrees. Their former width becomes vertical depth, and the rotated frame
stays solid on the floor instead of flattening into its old footprint. Their
collisions can knock over adjacent racks. Supported stock contributes to the
rack's mass and center of mass, so dropping it changes the loaded body.

The view uses a shared isometric scene for shelves, their stock, props, the
cart and the shopper. Thick wood decks, framed end panels, a back panel and
square steel uprights are shaded and culled by their rotated face normals.
All visible faces, limbs and basket wires are sorted together by camera depth,
so a shopper or loose bottle can move behind a rack instead of popping in
front of it. This is a painter's renderer, not a per-pixel depth buffer.
The raised basket has tapered side walls, an empty translucent bottom, three-unit
wire spacing and a handle at hand height. Tires are vertical cylinders with
visible axle caps and slender offset forks; their centers use the same caster
pose as collision and liquid pickup. Do not rotate or flatten a completed 2D sprite.

Upright bottles, vases, cans, dishes, pots, folded towels and cartons are solid
models. Supported products use the actual rocking board transform. Loose
products use their simulated position, height, yaw and tumble; floor bottles
lie around their physical center, and crushed ketchup bottles flatten visibly.
Shelf decks sit at the supported tiers (12, 22 and 32 units). Labels are mounted
on the frame and their textures are cached. Cast shadows follow the actual
furniture vertices and are clipped to the diamond-shaped floor. Table legs
and its three-unit tabletop use the same solid-face renderer. Long pixel edges
are batched by row to keep the detail inexpensive.

The room is a cutaway diorama with a solid floor slab, plaster back walls and
low front curbs that leave the shopper and casters visible. Checkout cuts through
the appropriate wall and continues onto an outside apron. Room edges, puddles,
tracks, shadows, checkpoints, contact outlines and the velocity guide share the
same projection. Opening art and every course preview use this renderer too.

Every displayed product is the actual simulated item. Each has mass, planar
inertia, material friction, bounce, height, vertical speed and tumbling angle.
Stock keeps its momentum during a rack impact and slides relative to the board.
The smooth boards have less friction than the floor, so a bump can displace stock
before the rack falls. Gravity and static friction govern sliding as the board
tilts. Crossing the edge or losing support releases the product with the board's
translation, yaw and tipping velocity. Release velocity is the derivative of the
same rigid pose, including board sliding, yaw and the raised edge of the frame.
It then falls under gravity, bounces, collides with walls, furniture, cones, boxes
and other products, and remains on the floor.

Vases, wine bottles, jars, plates and plant pots break on sufficiently hard impacts
or under a rolling tire. Glass, ceramic and terracotta fragments have small physical
footprints. Cans bounce and roll. Cloth and cartons have higher drag. Ketchup
bottles survive ordinary drops, but a hard landing or tire contact flattens the
bottle and releases its contents. Floor items fit under the raised basket;
airborne products can hit its rails. Shoes can kick low stock and all four tires
have their own product contacts, loss of rolling energy and caster reaction.

Water, wine, ketchup, oil and soil use separate conservative 4-pixel floor grids.
A broken vase pours a connected pool of clear water. The renderer preserves the
tile seams through it, with a dark meniscus, pale rim and small reflected glints.
Water tracks are translucent; the pool and its effect on tire grip persist until
retry, just like the other films.
Pairwise film flow runs at 20 Hz. Wine spreads readily, ketchup stays thicker,
and soil barely spreads. Each caster samples its own contact's surface grip and
rolling resistance. Unequal grip creates a braking yaw moment. Tires pick up a
limited amount of the film and deposit it onto clean tiles, conserving volume
between floor and tire. Colored tread and persistent thin tracks show the route.
The second room retains a shallow maintenance spill. The blue lakes are separate
holes in the supporting floor, not thin films.

This is a game model in artwork units: planar contact impulses plus separate
height and one rocking axis per rack. It is not a full 3D rigid-body or fluid
solver. The contact solver uses equal and opposite impulses, contact-point
angular velocity, Coulomb friction and low-speed inelastic contacts, following
the principles described in [Box2D's simulation documentation](https://box2d.org/documentation/md_simulation.html).
No Box2D dependency is loaded. Collision broad phases, cached rack geometry,
sleeping floor items, a spatial grid for product pairs and a 220-fragment cap
keep a messy aisle bounded. Films and landed stock persist until retry.

## Wheel checkpoints, doors and hazards

Checkpoints are circles with a shared 20-unit radius, projected to ellipses on
the floor. Any one of the four actual tire rectangles can touch a circle to clear
it. Contact uses the trailing tire center and its independent swivel angle,
transforms the circle center into tire coordinates, and measures the nearest
point on the 8-by-4 tire envelope. Exact tangency counts. The basket and shopper
alone cannot clear a circle. There is no dwell time, heading or speed requirement.
Markers count once and in route order. Their numbers restart in each room.
The former basket sensor, badge and connecting line are removed.

Each room's final marker opens its outgoing portal. Both neighboring walls have
matching openings, with a supported 56-unit corridor between them. The shutter
is a real collider until the preceding room's markers are cleared. Jambs and
corridor sides stay solid. Room membership changes when the body's world position
enters a room, updating the HUD without stopping the simulation or input.
After all 29 marks, the final checkout on the garden room's left wall opens.
The whole cart, every tire and shopper must clear the outside edge. No parking,
heading constraint or speed threshold remains.

Walls report resting and moving contact, including actual tire protrusions.
The contacted wall and the cart, tire and shopper footprints turn red immediately,
with a 0.04-unit tolerance and a 0.32-second fade after separation. Bare cliff
segments omit those wall colliders and rails. Their striped lips and deep layered
floor faces show that they are open drops. Lakes use the same ellipse for visible
water and missing support. Painted shallow spills still have a floor.

Every wheel samples floor support at its real tire contact. An unsupported wheel
has no ground grip or rolling resistance and receives a red warning ring. Two
unsupported wheels, or the combined body's center leaving supported floor, start
an irreversible fall. The body's planar velocity and yaw momentum continue while
gravity accelerates its height downward. Input and ground contact forces stop.
Pitch and roll turn the cart, casters and shopper toward the unsupported side.
Water falls draw a splash and expanding ripple; cliff falls expose the drop.
This is a planar cart with a separate falling height and visual tilt, not a full
six-degree rigid-body solver. Pause freezes the fall too.

A fall costs eight seconds and one mishap, charged once. After 1.15 seconds the
same body returns to the current room's safe entrance, with motion settled.
Earlier route marks, stock and spilled liquids remain. No room is reloaded.
Loose products and props crossing unsupported floor drop out of the playfield.
The clock still runs during a fall and timeout takes precedence over recovery
or checkout. Practice has no deadline and does not save records.

The film grid spans the whole world rather than aliasing cells back into the
first room. Each grid cell is checked against supported floors and lake holes.
Wine, water and other films in later rooms remain local to those coordinates,
and wheel pickup and deposition continue across corridors. Full shelves retain
their existing ground and tipping contact model.

Timed trip records use `four-wheels-records-v6`, with a separate slot for each
starting room, validation and blocked-storage fallback. More marks rank above
fewer; equal marks rank by time including earned clock bonuses. Older v1 through
v5 records remain untouched, since the new bonuses change the timed rules.

## Close calls, rotations and style

Style observes the simulation at its fixed step and never changes cart forces,
velocities, caster angles, gait or contact impulses. Clearances use the actual
oriented basket and all four tire rectangles, the shopper circle, the current
3D shelf's projected collision hull and each cone or box's physical radius.
At 20 Hz, a pass arms within six units at a speed of at least 22. It earns a
Close call only after clearing twelve units, traveling fourteen units during
the pass and still moving at sixteen. Touches within 0.15 units do not count.
An impacted obstacle stays blocked for that entire pass. An intact shelf or
prop can pay once per trip. Down, spilled or falling stock does not count.
Walls, loose products and hazard edges are not close-call targets.

A spin starts under active steering while moving at fourteen units per second.
It tracks signed pose changes across the angle wrap. Reversals, a settled turn,
slow travel, contacts, missing wheel support, falls and pose jumps interrupt it.
A half rotation needs twenty units of travel; a full rotation needs forty-five.
A 180 earns 100 style and one second. Finishing its 360 adds 250 style and two
seconds, upgrades the same maneuver and does not increase its own combo.
One uninterrupted spin pays only those two milestones. A new paid maneuver
needs settled rotation and another forty-five units of travel.
A sustained sideways coast, over 86 percent sideways and at least 28 units per
second for 0.6 seconds and twenty units of travel, earns a Power slide. Braking
or an active spin prevents it, and another slide requires 100 units of travel.
Close calls and slides each earn 75 style and one second.

Clean awards within five simulation seconds chain up to x4. The multiplier
affects style points, not time. Contact breaks the chain and unbanked progress;
banked points and seconds remain. Practice earns style with no clock credit.
Timed runs can earn at most twelve seconds in total. Deadline precedence remains:
an already expired clock cannot be revived by a trick or checkout on that step.
Results show style, best combo, maneuver counts and earned time separately from
driving time and penalties.

The floor draws the spin's actual swept angle, a fading completion arc, close-pass
glints at the measured clearance point and short sideways wheel streaks.
Earned moves receive a paper-and-ink callout, colored pixel confetti and distinct
ascending tones when sound is enabled. Callouts announce through the existing
live region. Pause freezes detection, combo time, effects and callout life.
Reduced motion keeps the text and rewards while disabling trails, confetti,
shake and entrance animation. Feedback never captures input or covers the thumb
pads. The compact Style counter lives beside route progress on all screen sizes.

## Controls and lifecycle

W/S or up/down push and pull; A/D or left/right rotate; Space brakes.
P or Escape pauses, R retries, F toggles fullscreen. Keyboard input is scoped
to focus inside the game. Touch devices use two independent analog thumb pads
over the lower corners of the view, with a 64-pixel-wide brake between them.
The left pad rotates with horizontal movement; the right pushes upward and
pulls downward. Force follows displacement from the pad's fixed center, with
a 12-percent neutral zone and full force at 28 percent of its width. The knob,
caption and accessible slider value follow the actual input. Pads are 96 to
120 pixels across in portrait and 100 in short landscape views. Controls use
safe-area insets, leave the center of the view clear and do not shorten the canvas.
The Store map button moves above the left pad on touch devices.

Releasing a pad applies no force, preserving the cart's coast. Holding Brake
overrides a held push or pull; rotation remains independent. Each pad owns one
captured pointer, so a second finger cannot take it over. Push, turn and brake
can be held together. Cancelled or lost captures, pause, retry, picker, blur,
hidden tabs and viewport resizing clear input and return the knobs to center.
An attached keyboard can also adjust the focused sliders or hold the brake.
Sound starts muted and is synthesized after a user gesture. Reduced motion
disables shake and marker particles. Idle and paused screens do not run a loop.

## Verification and deployment

Run `node --check` on each of the six game scripts, then:

```sh
node tools/test-four-wheels.cjs
node tools/test-four-wheels-stock.cjs
node tools/test-four-wheels-view.cjs
node tools/test-four-wheels-journey.cjs
node tools/test-four-wheels-tricks.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
```

Handling tests cover momentum, caster trail and reverse flips, real tire impacts,
walking and posture, exact wall contact, wheel-circle tangency, route order,
checkout gaps and deadline precedence. Stock tests cover supported and loose
items, 3D shelf toppling, momentum transfer, vase water, bottle breakage, tire
crushing, conservative film flow, unequal grip and dense debris stability.
Journey tests cover supported corridor continuity, locked doors, persistent body,
wheels, gait, clock, stock and spills across a seam, global liquid cells, lakes,
cliffs, recovery and timeout while falling. The verification pilot drives the
whole connected trip with the same push, pull, turn and brake controls as players.
It must clear every room before closing, with no forced fall.

View tests cover projection, inversion, physical caster points, circles, height,
following cameras and whole-store framing. Browser tests check keyboard and
concurrent analog touch controls, dead zones, gentle and full force, reversal,
brake priority, off-pad capture, cancellation, orientation changes and thumb
target geometry; actual wheel capture, continuous room entry with no
new requests or overlay, color, six room previews, map controls, both fall types,
pause and recovery, vase water, final checkout, new and older records, fullscreen,
small phones, landscape, blocked storage and reduced motion. Hooks and the pilot
are injected by a local verification server; none are shipped in game scripts.
Browser checks use an owned Chrome for Testing process closed in `finally`.
Trick tests cover real tire and shopper clearance, clean passes, impact rejection,
both spin directions across the angle wrap, stationary and repeated spin rejection,
slides, combo expiry, interruption and upgrades, clock caps, falls, pose jumps,
deadline precedence and unchanged physical trajectories. Browser checks also
verify actual 180, 360 and close-pass callouts, chain feedback, pause, results,
small-screen placement, old records and reduced-motion feedback.

`ASSETS=1` writes fall animation GIFs into the QA directory and refreshes the
1200-by-750 game thumbnail. Rebuild its WebP sibling and preserve the picture
wrapper. Bump all seven CSS/game-script query versions in `four-wheels.html` for
any deployed edit. Commit only this game's changes and push to main; GitHub Pages
publishes it automatically. Verify the deployed asset bytes and desktop/mobile
boot before calling a release live.
