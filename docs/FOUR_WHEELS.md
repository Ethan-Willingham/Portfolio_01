# All Four Wheels

A standalone JavaScript cart game, listed on In Progress at `archive.html`.
The post stays at `four-wheels.html`. It does not use Sluice's engine, assets,
feature flags, or build step.

## Sources

- `four-wheels.html`: post, accessible controls, briefing and results.
- `four-wheels.css`: responsive game shell, touch controls, fullscreen fallback.
- `js/four-wheels-stock.js`: furniture, supported stock, loose products, breakage and floor films.
- `js/four-wheels-physics.js`: cart physics and course state; browser and CommonJS.
- `js/four-wheels-levels.js`: six courses, ordered markers, props and checkout exits.
- `js/four-wheels.js`: coarse pixel rasterizer, input, audio, UI and local records.

The canvas is 480 by 300 pixels and scales with image smoothing disabled.
Art is drawn locally from the site's warm palette, with silver metal for the
cart. No asset fetches, runtime dependencies, generated bundle, font CDN, or
game network requests.
The post uses the site's analytics and self-hosted fonts.

The page opens directly into the game, following Sluice's layout. The shell is
96vw wide (capped at 1800px) and fills the opening viewport, including toolbar,
route status and keyboard or touch controls. The fixed-resolution course is
contained without stretching or cropping. The title is inside the briefing;
the short about note, optional instructions and site links sit below the game.
Keep blog heroes and the archive banner off this page. Its In Progress card
and search membership remain on `archive.html`.

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
All four tires have an 8-by-4-pixel physical envelope, chamfered rubber ends,
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
Keep the overhead hair detail local to the body rather than offset on the screen.

The simulation uses fixed 1/120-second steps. A cart rectangle and shopper circle
both collide with shelves and walls; each tire also has a separate oriented
collision rectangle. Tire impacts can swivel the fork, move the chassis and
push props even when the basket clears them. Contacts apply torque. Cones and boxes
move, collide with each other and the room, and charge a penalty once per prop.
Cones cost 2 seconds, boxes 3, shelves 5. A shelf charges once when its stock
first falls or the rack topples. Individual products do not add separate penalties.

## Shelves and their contents

The first course has one 32-pixel square wooden table and one water-filled glass
vase, with no cones or other stock. A short normal push knocks the vase off while
the table rocks and settles. Its low board friction, height and break threshold
make the fall reachable at ordinary driving speed. The table has a wider support
base than the tall racks. Later racks have lighter frames and a narrower support
base so normal impacts can topple them; gentle touches can still settle safely.

The rack is a dynamic body with mass, yaw inertia, ground friction and a separate
rocking angle about its supporting feet. A horizontal impulse at basket height
transfers momentum to the rack, twists it around an off-center contact, and adds
a tipping impulse. Gravity restores a small rock until the center of mass passes
its supporting feet; beyond that point it accelerates the fall. Shelves settle at
90 degrees and their expanded, rotated frame stays solid on the floor. Their
collisions can knock over adjacent racks. Supported stock contributes to the
rack's mass and center of mass, so dropping it changes the loaded body.

Every displayed product is the actual simulated item. Each has mass, planar
inertia, material friction, bounce, height, vertical speed and tumbling angle.
Stock keeps its momentum during a rack impact and slides relative to the board.
The smooth boards have less friction than the floor, so a bump can displace stock
before the rack falls. Gravity and static friction govern sliding as the board
tilts. Crossing the edge or losing support releases the product with the board's translation, yaw and
tipping velocity. It then falls under gravity, bounces, collides with walls,
furniture, cones, boxes and other products, and remains on the floor.

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
The original maintenance puddle remains a water surface.

This is a game model in artwork units: planar contact impulses plus separate
height and one rocking axis per rack. It is not a full 3D rigid-body or fluid
solver. The contact solver uses equal and opposite impulses, contact-point
angular velocity, Coulomb friction and low-speed inelastic contacts, following
the principles described in [Box2D's simulation documentation](https://box2d.org/documentation/md_simulation.html).
No Box2D dependency is loaded. Collision broad phases, cached rack geometry,
sleeping floor items, a spatial grid for product pairs and a 220-fragment cap
keep a messy aisle bounded. Films and landed stock persist until retry.

## Checkpoints and checkout

Checkpoints have a continuous circular outline with a shared 20-pixel radius.
The inner edge of the painted ring matches the capture boundary. A small coral
sensor in the basket has radius 4 and sits two thirds of the distance from the
rear edge to the front edge, at local x = 19 2/3. Any touch or overlap of that
sensor counts. Shopper contact or another part of the cart cannot clear a marker
by itself. The sensor rotates with the basket and stays visible through its mesh.
There is no dwell time, heading or speed requirement. Checkpoints count once,
in route order, and the sensor disappears when checkout opens.

The room uses a light plaster rim, thin baseboard and shallow inner shadow,
with a plain ink margin around the canvas. Keep the seam on the actual walls.
Every outer-wall contact turns the contacted edge and the physical cart,
shopper and tire outlines red immediately. Contact feedback is independent
of impact speed or penalties, includes exact resting contact with a 0.04-pixel
tolerance, stays lit while touching, and fades over 0.32 seconds after separating.
Only cart, shopper and tire contact triggers the outline, not loose props.

Each course has a checkout doorway on an outer wall. Its side, center and
width define both the painted opening and the real gap between wall colliders.
The shutter opens after every route marker is cleared. Its jambs and all other
edges remain solid. Finish by driving through the opening until the entire
cart, every tire and the shopper have cleared the outside edge of the canvas.
No heading constraint, speed threshold or parking dwell remains. Deadline
expiry still takes precedence over completion on the same physics step.
Practice has no deadline and does not save records. Timed records use
`four-wheels-records-v4` in localStorage, with validation and blocked-storage
fallback. More marks rank above fewer; equal marks rank by total time.
Earlier records remain untouched under `four-wheels-records-v1`,
`four-wheels-records-v2` and `four-wheels-records-v3`. The introductory table and
more responsive furniture use a new record set so earlier runs are not compared
with the revised course and collision rules.

## Controls and lifecycle

W/S or up/down push and pull; A/D or left/right rotate; Space brakes.
P or Escape pauses, R retries, F toggles fullscreen. Keyboard input is scoped
to focus inside the game. Touch buttons support concurrent captured pointers
and clear cancelled/lost pointers. Blur and hidden tabs pause and clear input.
Sound starts muted and is synthesized after a user gesture. Reduced motion
disables shake and marker particles. Idle and paused screens do not run a loop.

## Verification and deployment

Run `node --check` on each of the four game scripts, then:

```sh
node tools/test-four-wheels.cjs
node tools/test-four-wheels-stock.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
```

The physics checks cover caster trail, travel-dependent alignment, reverse
flips, contact slip, protruding-tire collisions, gentle edge contact, doorway
locking, jambs, all four exit directions and complete departure footprints.
They check the forward basket sensor, external tangency, heading changes and
checkpoint order, with a controller that aims the sensor at the circles.
Stock checks cover momentum transfer, gentle rocking, physical toppling and
falling stock, the introductory vase and persistent water, material-specific
breakage, tire crushing, conservative fluid flow,
tire pickup, smear deposition, unequal braking grip and dense debris stability.
They cover walking cadence, smooth acceleration, reverse steps, posture and
turns in place, and include a controller that drives all six full routes and
drives out through the real contact model before their deadlines. Browser checks
cover keyboard, touch, pause, retry, results, saved records, practice, course
selection, narrow layouts, fullscreen, reduced motion and blocked storage.
Test hooks are injected by the verification server and are never shipped.
Screenshots go to `/tmp/four-wheels-qa` unless `DUMP` is set. The harness owns
Chrome for Testing and closes that process in `finally`. It never launches
personal Chrome. `CART_BROWSER` may point to another dedicated testing build.
The browser checks also render a rack collapse and wheels crossing wine and
ketchup, and verify pause freezes furniture, stock and films.
With `ASSETS=1`, the browser harness refreshes the JPG thumbnail and renders a
two-second `walking.gif`, a posture sheet and a `shopper-motion.gif` showing
pushes, both turn directions and braking, plus six-second `vase-drop.gif` and
`shelf-collapse.gif` clips in the screenshot directory.
Run `tools/build-webp.mjs` after refreshing the thumbnail to update its WebP
sibling.

For edits, increment the five `?v=` values in the post. Keep the post in the
In Progress index, rebuild search when copy changes, and regenerate the sitemap
after committing a new page. Commit explicit paths and push to main.
