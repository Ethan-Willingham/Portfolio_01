# Exhaust experiments

The second collection keeps the two looks the owner exported and replaces the
other 28 presets. The two Copperhead downloads were identical. Their original
export data is retained in `tools/fixtures/smoke/` for regression checks.

| Retained look | Size choice | Mass | Liveliness | Size |
| --- | --- | --- | --- | --- |
| Copperhead | Tower | 25% | 65% | 65% |
| Jade dragon | Tower | 40% | 25% | 60% |

Both use the unchanged version 1 sampler, solver parameters, source parameters,
and colors. Selecting one restores its exported settings. Selecting a new look
loads that look's own defaults. Restore recipe returns to those settings.

## The new collection

- **Smoke rings:** hollow vapor hoops widen and roll away from the nozzle.
- **Soap engine:** iridescent bubbles burst into fluid smoke.
- **Star forge:** ballistic metal sparks leave thin cooling trails.
- **Silk engine:** three continuous translucent ribbons weave into the rig's wake.
- **Ink garden:** branching flowers open around a stationary source.
- **Paper lanterns:** glowing shells inflate, tumble, and fold away.
- **Pixel kiln:** square clouds split into four smaller pieces and fade.
- **Return to sender:** curved trails return to the nozzle, following the rig as it moves.
- **Pocket storm:** violet clouds carry slowly brightening branches of blue light.
- **Black pearls:** glossy droplets arc outward and burst into smoke against terrain.

Ink Blossom was removed. Its old source used a shared sine oscillator for
lateral position and force. Two unequally weighted streams, plus a separate
pulse clock, could reinforce the same direction across successive bursts.
The new fluid samplers have balanced opposing lateral impulses and no shared
sideways nozzle oscillator. The retained exports still use their original
motion because preserving their appearance was requested.

## Trying and keeping looks

Open `water-smoke-slime.html?smoke=smoke-rings`. The Smoke menu opens the
library. Idle, Drive, and Boost test the exhaust around a small preview rig.
The fixture is not Sluice's movement implementation.

Mass changes visual density and opacity. Liveliness changes source motion and
fluid curl. Size changes the injection footprint and effect shapes. Size &
energy choices stack with those controls.

Save favorite stores the current recipe, size choice, and tuning in this
browser. Selecting it from the Favorites collection restores that snapshot.
To replace a saved snapshot, remove it and save again after tuning. Export
this look downloads the current recipe; Export favorites downloads the
shortlist. The menu only shows favorites from the current collection.

Clear smoke when switching removes the previous dye, velocity, and shapes.
Turn it off to mix looks. Clear smoke leaves the water, slimes, and walls in
place. Scene changes clear all exhaust shapes and emitter history.

## Portable source and renderer

`js/smoke-presets.js` owns recipe data and deterministic fluid injection.
`js/smoke-effects.js` owns the new bounded shape system. Neither owns a DOM
node, canvas, game clock, or solver. `js/smoke-presets-ui.js` owns the library.
The demo host supplies the canvas, nozzle positions, terrain collision query,
and the callback that releases fluid smoke. The shared game engines are
unchanged by this collection.

The two retained exports use `sluice-smoke-recipe` version 1 with sampler
version 1. New exports use recipe version 2, sampler version 2, and renderer
version 1. Each contains `preset`, `scale`, and `tuning`; the new `preset.effect`
contains its shape type, emission rate, lifetime, size, and motion parameters.
The shortlist remains an envelope around these individual versioned recipes.

Call `SmokePresets.sample(preset, seconds, phase, tuning, scale.values,
throttle)` at 30 Hz of simulation time. It returns zero to eight source-local
fluid splats per sample. Each has lateral `x/vx`, outward `y/vy`, dye `color`,
and solver `radius`. Rotate through the nozzle's outward vector and its
perpendicular, then negate world Y velocity for the smoke solver's upward
UV convention. `emitSmokeRecipe()` is the reference adapter.

Create a `SmokeEffects` instance, call `emit()` with a stable emitter key at the
same source cadence, and call `step()` once per simulation frame. `draw(ctx)`
is presentation only. The host supplies a `solid(x,y)` query and `puff()`
callback. Shape collisions currently query terrain, while the fluid component
continues to use the demo's shared obstacles. Desktop keeps at most 180 shape
particles; mobile keeps 110. Pop events add at most four fluid splats per
frame. Clear the instance when resetting the scene.

Apply the recipe's solver parameters when equipping it, with effective curl
`clamp(preset.fluid.CURL * tuning.motion + scale.values.curl, 0, 50)`. Solver
settings affect the whole domain. The new shapes use world coordinates; they
need the game's camera transform when drawn. Decide how the rig and ambient
smoke share fluid settings before connecting these recipes to the shop.
Exports are integration data, not installed cosmetics or game saves.

## Verification

Run `node tools/smoke-presets-smoke.mjs`. The harness owns and closes its
Chrome for Testing process and server. It verifies the retained exports
against the fixtures, balanced new fluid impulses, bounded particle counts,
GPU and shape rendering, bubble-to-smoke transfer, swept terrain collisions,
favorites, downloaded JSON, scene resets, rig motion, and the phone layout.
Screenshots go to `/tmp/sluice-smoke-presets-qa`. `ONLY=soap-engine,smoke-rings`
limits the render sweep; `FRAMES=900` extends each render to 30 simulated
seconds. Run `node tools/toy-engine-sync.mjs --check` for shared engine parity.
