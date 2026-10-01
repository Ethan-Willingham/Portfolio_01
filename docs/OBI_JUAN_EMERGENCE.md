# Emergence in Obi Juan

Emergence contains Flocking birds and Ant colony, with three presets each. The Space category and Saturn have been removed. Removed emergence models are absent from the model whitelist, scene chooser and legacy share-link parser. Old static illustrations remain available for visitors with older pages cached.

## Models

Birds use separation, alignment and cohesion from [Craig Reynolds](https://www.red3d.com/cwr/boids/). They respond to the nearest seven birds within a configurable range and forward field of view. Close separation also considers birds behind them. A spatial bin search prunes cells once closer neighbors are found. Force buffers are reused. Predictive obstacle steering and solid collision correction keep birds outside spheres. The pure model also supports a pursuing hawk, obstacles and different steering weights for behavioral checks. These are not user controls. Murmuration, Two flocks and Independent birds start differently.

The bird view has animated wing silhouettes and color derived from steering effort. Perspective size, cooler and dimmer distant birds, depth-tested overlap and a quiet projected floor with a flock shadow give the eye a spatial reference. The Canvas fallback draws birds from farthest to nearest. The orbit resumes immediately from the released orientation. The default camera follows the flock's center smoothly; user rotation and zoom remain independent.

Ant foraging is inspired by [NetLogo Ants](https://ccl.northwestern.edu/netlogo/models/Ants), with additional home scent and individual route memory. Scouts explore with persistent noisy headings and sample food scent at three sensors. Carriers retrace breadcrumbs from their outward trip. They skip a remembered bend only when the shortcut is physically clear. Home scent and a nest bearing help when a route is blocked or exhausted. There is no global route planner. Walls block both movement and chemical diffusion.

Blue ants search; gold ants carry a visible food crumb. Food scent is gold. Food piles shrink as pieces are collected. Delivery, carried food and remaining stock are counted separately. The three maps cover open foraging, one long detour and two routes around an obstacle. Choosing a preset starts that map with replenished food. The pure model retains resource editing and route inspection for behavioral checks, but the demo exposes only the three presets and camera movement.

The rectangular habitat fills the canvas with narrow side margins and space for the title and metrics. One physical distance scale keeps speed, sensors, pickup ranges and circular walls proportional in both directions. The scent grid follows that aspect ratio, with each dimension capped at 512 cells. Resizing interpolates existing scent and retains food, route memory and simulation time. Connected wall strokes remain sealed when the view changes shape. A faint outline shows the finite boundary. Ants anticipate it with inward steering, then reflect a heading that would cross the edge. This response is separate from drawn-wall avoidance, preventing the early-run rows of ants along the perimeter. Pan and zoom support closer inspection.

## UI and lifecycle

`js/random-galaxy-emergence-models.js` exports deterministic pure models for browser and Node. `js/random-galaxy-emergence.js` supplies preset choices, camera interaction, Canvas fields and batched WebGL bird/ant sprites, with shaped Canvas sprites as a fallback. `js/random-galaxy.js` owns the app's frame clock and skips its WebGPU submissions while Emergence is active.

Both worlds advance at 30 fixed steps per second, with at most two updates per frame. Blur, hiding, page exit and an offscreen app stop the complete frame clock. Resuming resets elapsed time instead of catching up. There are no model workers or background timers. Phone populations are reduced and pixel ratio is capped. A lost graphics context stops the model until reload. The Emergence engine also runs without WebGPU, using the same activity gates.

The three illustrated “Start somewhere” presets are the only Emergence simulation controls. They appear directly in the main panel, stacked on desktop views and arranged in one row on phones and very short windows. A gold border and inset mark identify the active preset. Choosing any card starts it immediately, including a fresh start when the active card is chosen again. Standard buttons support keyboard selection. Controls remain to the left above 900px and above the canvas on smaller screens, with at least 44px touch targets.

Pause, Restart, Lab, editing tools, signals, sliders, comparisons, saving and sharing controls have been removed. Their keyboard actions have also been removed. Bird rotation, ant panning, pinch, scroll and keyboard zoom remain available. Changing a bird preset preserves the camera angle; choosing an ant preset fits its map back into view. The app's shared category navigation, info, Hide UI and fullscreen actions remain available.

Older versioned `#em=` links open the named model and one of its known presets. Custom rules, edited resources and camera data from those links are ignored. Old local setups are left in browser storage but are no longer read by the demo.

## Checks

```sh
node --check js/random-galaxy.js
node --check js/random-galaxy-emergence-models.js
node --check js/random-galaxy-emergence.js
node tools/test-galaxy-search.cjs
node tools/test-galaxy-emergence.cjs
node tools/test-galaxy-picker.cjs
node tools/test-galaxy-emergence-browser.cjs
```

Playwright harnesses use the bundled Node dependency path and own their Chrome for Testing process through `~/.local/bin/agent-chrome-for-testing`, closing it in `finally`. Behavioral checks cover all six presets, food conservation, wall detours, impermeable barriers, both scent fields, editing, edge and corner recovery, rectangular distances and resampling, flock alignment, moving threats, solid obstacles and deterministic cloning. Browser checks cover all six preset choices, the absence of removed controls and shortcuts, actual sprite pixels, near/far overlap and perspective scale, habitat fit, dragging, panning, pinch, responsive fit, legacy links, lifecycle sleep and WebGPU/Canvas fallback. Existing search and sorting checks remain in the chooser harness.

Bump all page, script and preview queries together when changing the app. Rebuild vector illustrations with `node tools/build-galaxy-previews.cjs` when scenes or presets change.
