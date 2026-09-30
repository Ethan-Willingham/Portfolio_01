# All Four Wheels

A standalone JavaScript cart game, listed on In Progress at `archive.html`.
The post stays at `four-wheels.html`. It does not use Sluice's engine, assets,
feature flags, or build step.

## Sources

- `four-wheels.html`: post, accessible controls, briefing and results.
- `four-wheels.css`: responsive game shell, touch controls, fullscreen fallback.
- `js/four-wheels-physics.js`: pure physics and course state; browser and CommonJS.
- `js/four-wheels-levels.js`: six courses, ordered markers, props and checkout bays.
- `js/four-wheels.js`: coarse pixel rasterizer, input, audio, UI and local records.

The canvas is 480 by 300 pixels and scales with image smoothing disabled.
Art is drawn locally from the site's warm palette. No asset fetches, runtime
dependencies, generated bundle, font CDN, or game network requests.
The post uses the site's analytics and self-hosted fonts.

## The handling to preserve

The cart and shopper are a rigid body with its center of mass behind the basket.
The basket center is 14 pixels ahead of it and the shopper center is 16 behind.
Do not rotate the velocity vector when steering. A and D apply a force couple,
rotating the body without changing its linear momentum. W adds force along the
current heading; S pulls backward. Space brakes the body's actual velocity.

All four wheels swivel. Each aligns with its own contact velocity, including
the angular contribution at that wheel. Lateral and forward rolling resistance
are equal. The wheels do not create the directional grip of fixed grocery-cart
rear wheels. Wet floor reduces drag and braking force.

The simulation uses fixed 1/120-second steps. A cart rectangle and shopper circle
both collide with shelves and walls; contacts apply torque. Cones and boxes
move, collide with each other and the room, and charge a penalty once per prop.
Shelves spill once. Cones cost 2 seconds, boxes 3, shelves 5.

Finish by visiting every marker in order, placing the entire cart and shopper
inside checkout, facing the bay arrow, and holding still for 0.55 seconds.
Practice has no deadline and does not save records. Timed records use
`four-wheels-records-v1` in localStorage, with validation and blocked-storage
fallback. More marks rank above fewer; equal marks rank by total time.

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

The physics checks include a controller that drives all six full routes and
parks through the real contact model before their deadlines. Browser checks
cover keyboard, touch, pause, retry, results, saved records, practice, course
selection, narrow layouts, fullscreen, reduced motion and blocked storage.
Test hooks are injected by the verification server and are never shipped.
Screenshots go to `/tmp/four-wheels-qa` unless `DUMP` is set. The harness owns
Chrome for Testing and closes that process in `finally`. It never launches
personal Chrome. `CART_BROWSER` may point to another dedicated testing build.

For edits, increment the four `?v=` values in the post. Keep the post in the
In Progress index, rebuild search when copy changes, and regenerate the sitemap
after committing a new page. Commit explicit paths and push to main.
