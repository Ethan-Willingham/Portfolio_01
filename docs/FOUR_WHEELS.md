# All Four Wheels

A standalone JavaScript cart game, listed on In Progress at `archive.html`.
The post stays at `four-wheels.html`. It does not use Sluice's engine, assets,
feature flags, or build step.

## Sources

- `four-wheels.html`: post, accessible controls, briefing and results.
- `four-wheels.css`: responsive game shell, touch controls, fullscreen fallback.
- `js/four-wheels-physics.js`: pure physics and course state; browser and CommonJS.
- `js/four-wheels-levels.js`: six courses, ordered markers, props and checkout exits.
- `js/four-wheels.js`: coarse pixel rasterizer, input, audio, UI and local records.

The canvas is 480 by 300 pixels and scales with image smoothing disabled.
Art is drawn locally from the site's warm palette. No asset fetches, runtime
dependencies, generated bundle, font CDN, or game network requests.
The post uses the site's analytics and self-hosted fonts.

The page opens directly into the game, following Sluice's layout. The shell is
96vw wide (capped at 1800px) and fills the opening viewport, including toolbar,
route status and keyboard or touch controls. The fixed-resolution course is
contained without stretching or cropping. The title is inside the briefing;
the short about note, optional instructions and site links sit below the game.
Keep blog heroes and the archive banner off this page. Its In Progress card
and search membership remain on `archive.html`.

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
Tires and forks are opaque; basket mesh, rails and contents are translucent.
Do not hide inward-swung casters behind an opaque basket fill. Pivot pins stay
attached to the body while the tire and fork swing around them.

The simulation uses fixed 1/120-second steps. A cart rectangle and shopper circle
both collide with shelves and walls; each tire also has a separate oriented
collision rectangle. Tire impacts can swivel the fork, move the chassis and
push props even when the basket clears them. Contacts apply torque. Cones and boxes
move, collide with each other and the room, and charge a penalty once per prop.
Shelves spill once. Cones cost 2 seconds, boxes 3, shelves 5.

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
`four-wheels-records-v2` in localStorage, with validation and blocked-storage
fallback. More marks rank above fewer; equal marks rank by total time.
The earlier parking records remain untouched under `four-wheels-records-v1`;
the exit courses use a separate record set because the finish condition changed.

## Controls and lifecycle

W/S or up/down push and pull; A/D or left/right rotate; Space brakes.
P or Escape pauses, R retries, F toggles fullscreen. Keyboard input is scoped
to focus inside the game. Touch buttons support concurrent captured pointers
and clear cancelled/lost pointers. Blur and hidden tabs pause and clear input.
Sound starts muted and is synthesized after a user gesture. Reduced motion
disables shake and marker particles. Idle and paused screens do not run a loop.

## Verification and deployment

Run `node --check` on each of the three game scripts, then:

```sh
node tools/test-four-wheels.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
```

The physics checks cover caster trail, travel-dependent alignment, reverse
flips, contact slip, protruding-tire collisions, gentle edge contact, doorway
locking, jambs, all four exit directions and complete departure footprints. They
also include a controller that drives all six full routes and
drives out through the real contact model before their deadlines. Browser checks
cover keyboard, touch, pause, retry, results, saved records, practice, course
selection, narrow layouts, fullscreen, reduced motion and blocked storage.
Test hooks are injected by the verification server and are never shipped.
Screenshots go to `/tmp/four-wheels-qa` unless `DUMP` is set. The harness owns
Chrome for Testing and closes that process in `finally`. It never launches
personal Chrome. `CART_BROWSER` may point to another dedicated testing build.

For edits, increment the four `?v=` values in the post. Keep the post in the
In Progress index, rebuild search when copy changes, and regenerate the sitemap
after committing a new page. Commit explicit paths and push to main.
