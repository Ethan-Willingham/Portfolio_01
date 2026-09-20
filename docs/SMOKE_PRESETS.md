# Exhaust recipes

The Water, Smoke, and Slime demo has 30 exhaust recipes: six original themes
and 24 new ones. Open `water-smoke-slime.html?smoke=oil-slick` to start in the
rig preview. The Smoke menu opens the library. Idle, Drive, and Boost show
how a trail reads around a small rig. This is a preview fixture, not Sluice's
movement or exhaust implementation.

## Choosing a look

- Foundry: Locomotive, Copperhead, Afterburner, Coal roller.
- Prismatic: Opal, Oil slick, Prism, Gilded.
- Living: Spore cloud, Jade dragon, Jellyfish, Fireflies.
- Cosmic: Nebula, Solar flare, Comet, Eclipse.
- Arcane: Ectoplasm, Witchfire, Void bloom, Phoenix.
- Strange: Candyfloss, Bubblegum, Ink blossom, Cryovent.

Mass changes visible dye density. Liveliness changes source motion and curl.
Size changes the injection footprint. The existing Size & energy choices
stack on these controls. Reset tuning restores all three sliders and the
default size choice. The sliders persist when switching recipes, so reset
them before comparing the authored defaults.

Save favorite stores a snapshot of the recipe, size choice, and tuning in
this browser. Selecting that recipe in the Favorites collection restores
the snapshot. To replace a saved snapshot, remove it and save again with
the new tuning. Export this look downloads the current configuration;
Export favorites downloads all saved snapshots. Storage failures leave the
in-memory shortlist usable and show a message to export it.

Clear smoke when switching prevents the previous recipe's dye and velocity
from affecting a comparison. Turn it off to mix colors. Clear smoke removes
only smoke; it leaves water, slimes, and walls intact.

## Moving a recipe into Sluice

`js/smoke-presets.js` contains plain data and a deterministic source sampler.
It has no DOM, random clock, or game dependencies. `js/smoke-presets-ui.js`
owns the library and downloads. The demo host owns simulation and rendering.
The shared fluid solver and the shipped game are unchanged.

An exported `sluice-smoke-recipe` version 1 contains:

- `preset`: stable ID, name, family, description, display swatches, numerical
  dye palette, solver settings, and source parameters.
- `samplerVersion`: the required `SmokePresets` sampler version.
- `scale`: ID and numerical radius, dye, lift, and curl modifiers.
- `tuning`: mass, motion, and size multipliers, each clamped to 0.25 through 2.5.

Run `SmokePresets.sample(preset, seconds, phase, tuning, scale.values, throttle)`
at 30 Hz of simulation time. It returns two splats per sample, regardless of
recipe. Each contains source-local `x`, `y`, `vx`, `vy`, a dye `color` object,
and the solver's `radius` value. `x` is across the nozzle; `y` points out of it.
Advance `seconds` once per sample. `phase` offsets an emitter's swaying motion.
Pulse timing and color cycling use simulation time, so pause and slow motion
do not skip ahead.

For an outward unit vector `(dx, dy)` in world coordinates with positive Y
down, the cross vector is `(-dy, dx)`. Rotate each position and velocity with
these two vectors, then negate the resulting Y velocity for the solver's
upward UV convention. The demo adapter is `emitSmokeRecipe()` in
`js/water-smoke-slime.js`. It applies the source's scale and gravity, then
converts world positions to UV. Keep the game's own position, radius, and
velocity calibration when wiring the sampler to its nozzle.

Apply `preset.fluid` when equipping, restoring the base solver settings first.
Effective curl is `clamp(preset.fluid.CURL * tuning.motion + scale.values.curl,
0, 50)`. Solver settings affect the whole fluid domain. Decide how ambient
smoke shares that domain before connecting these to a shop item. The JSON
is a recipe format for that integration; it is not a game save or an installed
cosmetic. Prices, purchases, and persistence in Sluice are separate work.

## Verification

Run `node tools/smoke-presets-smoke.mjs`. The harness owns its testing browser
and server and closes them in `finally`. It uses the owner's
`agent-chrome-for-testing` wrapper, never their personal Chrome installation.

The harness validates all recipe samples at minimum and maximum tuning,
renders every preset through WebGL, reads back pixels to catch invisible or
washed-out output, and checks favorites, export data, parameter resets,
rig motion, scene transitions, and the phone layout. Screenshots go to
`/tmp/sluice-smoke-presets-qa`. `ONLY=phoenix,comet` limits the render sweep.
Run `node tools/toy-engine-sync.mjs --check` to confirm shared engine parity.
