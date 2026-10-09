# Greedy cup

Release: toy v5.39, shared water engine v28.178. The greedy cup is the only
machine in the public scene menu. Siphon and Heron experiments remain parked.

## Behavior

Open `archive/water-smoke-slime/water-smoke-slime.html?scene=cup` and choose
**Drop the slime**. One large slime raises the water over the bend. The same
native particles travel through the tube into the lower tank. Restart restores
the initial cup. Ordinary scenes and the Build tools remain available.

The apparatus has a fixed 1,120 by 664 world, 8-pixel walls, about 69,000 water
particles, a 16-pixel rising bore and an 8-pixel descending stem. A perforated
shelf holds the slime above the intake. Resizing changes the camera, not the
apparatus or particle count. Selecting the cup from another world reloads its
canonical dimensions and preserves manual pause. A paused initial draw waits
for the rainbow renderer to finish configuring the shared canvas.

The full cup and its controls fit the available browser height, including
1512 by 820 and 1512 by 700 MacBook viewports. The shorter desktop header leaves
more room for the apparatus. Water renders at the fitted display resolution;
the physical world and particle buffers keep their original size. The footer
shows actual presentation FPS, including rates below 20, and zero when paused.

The primary slime always starts as a ball, independently of the ordinary spawn
shape. Its 16-pixel point pitch uses 91 points and 264 springs instead of 397
points and 1182 springs. Its radius and displaced area are preserved within
mesh discretization. A wider held material patch lets the giant follow pointer
drags without the topology guard repeatedly rejecting the same movement.

The cup adds a pressure solve to the existing native water engine. It retains
the native density response and affine particle state. Closed wall faces remove
the normal component of the difference between native and provisional velocity;
the affine state uses the derivative of that same reconstruction. Gas pressure
uses each measured cavity volume while preserving its carried gas amount.
Equal-volume interior splats reduce false drawing gaps without moving water.
There are no timed flow rates, relocated particles or second liquid system.

The cup uses 32 red/black Gauss-Seidel sweeps of the four-face water pressure
stencil. Each color reads the other color while gas pressure stays fixed;
gas updates after both colors, using the previous sweep's water contributions.
The legacy Jacobi solver remains the default outside this opt-in setting.
Pressure maxima reduce inside each 128-thread workgroup before one global
atomic update, preserving the exact bound. Moving slime geometry reuses sorted
scanline crossings rather than repeating a full polygon traversal for every
sample; its 8 by 8 sampling rule and shared face openings are unchanged.

These shared-engine hooks are opt-in. They allocate no air resources in ordinary
Sluice or toy scenes. Integration preserves the newer production snow and water
changes rather than replacing the engine with the older development file.

## Release checks

The focused delivery target is at least 95% of the original drainable bulk water
in the receiver within 180 simulation seconds. Every delivered particle must
cross both the actual crest and outlet. Initial tube water, rim spills and water
retained in the tube do not count. The cup must first hold for 15 seconds.
Lower-fill and correctly raised-bend controls must hold after the same drop.
All three cases run with seeds 17, 42 and 913, with exact particle counts, finite
positions and velocities, and no final particle centers inside physical walls.

`tools/test-water-machines.mjs` freezes the runtime sources and records the real
GPU buffers and passage observer. `tools/check-water-cup-result.mjs` independently
reads the saved native positions, reconstructs the frozen walls and enforces
the inventory and hold checks in these nine cases. It reports the delivery
target separately and exits with status 1 if any canonical run misses it. It writes `cup-acceptance.json` in the output directory.

Useful checks:

```sh
node tools/test-water-machines-scenes.cjs
node tools/test-water-machines-builder.cjs
node tools/test-water-machines-geometry.cjs
node tools/test-water-machines-guests.cjs
node tools/test-water-machines-buoyancy.cjs
node tools/test-water-machines-instruments.cjs
node tools/test-water-machines-physical-scale.cjs
node tools/toy-engine-sync.mjs --check
node --check js/sluice.js
```

For integrated delivery, set `NATIVE_PASSAGE=1`, `SEEDS=17,42,913` and an external
`DUMP` directory. Supply `CASES` as a JSON array, all with `machine: "cup"`,
`world: {"w":1120,"h":664,"tile":8}` and
`actions: [{"at":15,"type":"primary"}]`:

| Case name | Options | Seconds |
| --- | --- | --- |
| `canonical` | `{}` | 180 |
| `lower-fill` | `{"level":288}` | 70 |
| `raised-bend` | `{"crest":84,"level":192}` | 70 |

Screen y increases downward. A smaller crest y raises the bend. Run
`node tools/check-water-cup-result.mjs /path/to/DUMP` after the harness exits.

Feature-off tests take `BEFORE=/path/to/saved-production-liquid-wgpu.js`:
`tools/test-water-pressure-feature-off.mjs` checks all legacy shaders and 96
CPU command-frame pairs. `tools/test-water-pressure-feature-off-gpu.mjs` compares
18 native-buffer captures and six full render targets on real WebGPU, then boots
ordinary Sluice and the toy. The release baseline is production commit `0e2dde82`.

`tools/test-water-cup-viewport.mjs` checks fixed geometry, visible paused water,
manual pause and scene selection at desktop, MacBook, short desktop and
landscape phone sizes. `tools/test-water-cup-handling.mjs` checks an actual
Retina pointer drag, primary shape independence and the GPU pressure maximum
at both full and partial workgroup sizes. It records FPS and simulation timing
without treating hardware-specific timing as a portable pass threshold.
`tools/test-water-machines-geometry.cjs` compares 32 moving concave and
overlapping body poses with an independent point-in-polygon oracle.
`tools/test-water-demo.mjs` covers the ordinary toy and missing-GPU
fallback. `tools/test-water-machines-build-share.mjs` checks actual desktop/touch
construction, undo, redo and sharing with the GPU disabled.

Run GPU checks one at a time using the owned Chrome for Testing harnesses.
Never launch the personal Chrome app headlessly. Shared engine changes require
the game version/build and toy-engine-sync steps in AGENTS.md.

## Limits and evidence

The v5.39 build delivers at least 96.39%, 99.38% and 99.74% in the three canonical
runs, exceeding the 95% target in each. The previous v5.37 measurements were
97.43%, 98.67% and 93.30%, with the third below the target. This remains a
public experiment.

Delivery success does not certify calibrated pressure, exact gas-volume
accounting, smooth guest contact or real-world timing. Pressure and phase checks
still fail during portions of the drop. Local particle crowding and contact
corrections remain. The public post keeps these limits visible next to the
measurements; Instruments labels its readings as diagnostic when appropriate.
Five particles crossed the rim in seed 17. The older passage observer stored
rim and passage flags separately, so the checker conservatively subtracts all
five rim spills in the receiver from that run's delivery count. Its delivery
percentage is a lower bound. The observer now excludes rim flags directly.
The 95% target still passes with those particles excluded; this does not claim
that splash-free contact has been solved.

An owned-browser Retina comparison at 1512 by 820 averaged 31.31 and 30.19
milliseconds per frame in two v5.38 baseline samples, bracketing the v5.39
sample at 21.20 milliseconds. All samples use the primary slime and 69,307
particles. The separate Retina handling check advances 1.53 simulation
seconds per wall second, near the intended 1.55, with zero rejected drag steps.
These are hardware-specific presentation measurements, not a 60 FPS guarantee.

The post links compact public release measurements. Raw buffers, source snapshots
and screenshots for v5.39 are in
`research/water-machines/cup-responsive-validation` in the owner workspace.
The previous release evidence remains in
`research/water-machines/cup-production-validation`; the post labels its
screenshots as the previous version. Earlier numerical experiments and their
many passing unit fixtures are not evidence of a finished pressure model.
