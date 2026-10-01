# Emergence in Obi Juan

Emergence contains Flocking birds and Ant colony, with three presets each. The Space category and Saturn have been removed. Removed emergence models are absent from the model whitelist, scene chooser, saved setup list and share-link parser. Old static illustrations remain available for visitors with older pages cached.

## Models

Birds use separation, alignment and cohesion from [Craig Reynolds](https://www.red3d.com/cwr/boids/). They respond to the nearest seven birds within a configurable range and forward field of view. Close separation also considers birds behind them. A spatial bin search prunes cells once closer neighbors are found. Force buffers are reused. Predictive obstacle steering and solid collision correction keep birds outside spheres. A steerable hawk pursues a nearby bird. Flight speed, seeing distance and the three steering weights can be changed. Murmuration, Two flocks and Independent birds start differently.

The bird view has animated wing silhouettes and color derived from steering effort. Perspective size, cooler and dimmer distant birds, depth-tested overlap and a quiet projected floor with a flock shadow give the eye a spatial reference. The Canvas fallback draws birds from farthest to nearest. Follow a bird highlights it, tracks its position and reveals its actual local neighbors, heading and steering. Screen interactions use a visible bird's depth, so obstacles and the hawk land under the pointer after rotation. The orbit resumes immediately from the released orientation. The default camera follows the flock's center smoothly; user rotation and zoom remain independent.

Ant foraging is inspired by [NetLogo Ants](https://ccl.northwestern.edu/netlogo/models/Ants), with additional home scent and individual route memory. Scouts explore with persistent noisy headings and sample food scent at three sensors. Carriers retrace breadcrumbs from their outward trip. They skip a remembered bend only when the shortcut is physically clear. Home scent and a nest bearing help when a route is blocked or exhausted. There is no global route planner. Walls block both movement and chemical diffusion.

Blue ants search; gold ants carry a visible food crumb. Food scent is gold; home scent appears blue when signals are enabled. Food piles shrink as pieces are collected. Delivery, carried food and remaining stock are counted separately. Food and the nest can be dragged, walls drawn or erased, scent cleared, and depleted piles refilled. Restart and saved setups replenish each pile to its configured capacity. The three maps cover open foraging, one long detour and two routes around an obstacle. Follow an ant reveals its state, sensors and remembered route.

The rectangular habitat fills the canvas with narrow side margins and space for the title and metrics. One physical distance scale keeps speed, sensors, pickup ranges and circular walls proportional in both directions. The scent grid follows that aspect ratio, with each dimension capped at 512 cells. Resizing interpolates existing scent and retains food, route memory and simulation time. Connected wall strokes remain sealed when the view changes shape. A faint outline shows the finite boundary. Ants anticipate it with inward steering, then reflect a heading that would cross the edge. This response is separate from drawn-wall avoidance, preventing the early-run rows of ants along the perimeter. Pan and zoom support closer inspection.

## UI and lifecycle

`js/random-galaxy-emergence-models.js` exports deterministic pure models for browser and Node. `js/random-galaxy-emergence.js` supplies interaction, the Lab dialog, Canvas fields and batched WebGL bird/ant sprites, with shaped Canvas sprites as a fallback. `js/random-galaxy.js` owns the app's frame clock and skips its WebGPU submissions while Emergence is active.

Both worlds advance at 30 fixed steps per second, with at most two updates per frame. Blur, hiding, page exit and an offscreen app stop the complete frame clock. Resuming resets elapsed time instead of catching up. There are no model workers or background timers. Phone populations are reduced and pixel ratio is capped. Paused scenes redraw only after a change. The Emergence engine also runs without WebGPU, using the same activity gates.

Controls remain to the left above 900px and above the canvas on smaller screens. The interaction selector stays accessible alongside playback on phones. Picking a Lab tool returns directly to the world. Pinch gestures do not place food or barriers. Advanced rules, signals, presets and comparison stay in the internally scrolling Lab dialog. No controls are mounted below the canvas.

Comparison clones the entire current state and random sequence, then changes one rule on the right. Further rule edits affect only the right world. Both views share a camera. `gx-emergence-setups` stores up to six configurations locally. Versioned `#em=` links include model, preset, seed, rules, food capacities, nest, walls, hawk and camera. They reproduce a starting configuration, not a simulation frame. Populations vary by device. Inputs are constrained to known models and presets, finite rule ranges and bounded resource counts.

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

Playwright harnesses use the bundled Node dependency path and own their Chrome for Testing process through `~/.local/bin/agent-chrome-for-testing`, closing it in `finally`. Behavioral checks cover all six presets, food conservation, wall detours, impermeable barriers, both scent fields, editing, edge and corner recovery, rectangular distances and resampling, flock alignment, moving threats, solid obstacles and deterministic cloning. Browser checks cover actual sprite pixels, near/far overlap and perspective scale, habitat fit, comparisons, saved and shared setups, dragging, panning, pinch, rotated 3D placement, responsive fit, lifecycle sleep and WebGPU fallback. Existing search and sorting checks remain in the chooser harness.

Bump all page, script and preview queries together when changing the app. Rebuild vector illustrations with `node tools/build-galaxy-previews.cjs` when scenes or presets change.
