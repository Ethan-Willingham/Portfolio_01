# Water machines

Release: toy v5.44, shared water engine v28.178. The greedy cup, standalone
siphon and Heron's fountain are in the public scene menu, with published behavior
measurements. Full quantitative physical acceptance and steady 60 FPS remain unverified.

## Air pressure view

Machine scenes show a faint tint inside sealed gas pockets. Gold means positive
gauge pressure, rose means negative. Room air and liquid receive no air tint.
Up to three small labels show psi relative to the room; labels fit wholly inside
sampled gas and disappear when no readable space remains. Vapor is labeled
separately. Air pressure beside the head/flow readout and in Instruments controls
the same overlay. The former Pressure colors control is now named Water pressure
and retains its water coloring. All overlays are read-only and remain diagnostic.

Pressure images and static apparatus annotations are cached between GPU snapshots,
and the pressure image uses the displayed resolution. A fresh paused apparatus
requests its initial snapshot. Both overlay controls redraw while paused. This
reduces canvas work but does not establish a 60 FPS performance result.

The native gas boundary has opt-in nonlinearGas and vaporClosure experiments,
both off in the released scenes. The first solves the isothermal gas equation in
gauge pressure, avoiding room-pressure subtraction. The second allows an empty
vapor cavity to close at zero volume and raises pressure when further closure
would make its volume negative. The fifteen-case, three-seed Heron matrix passes
all 90 behavior/accounting
checks and all gas geometry health checks with these options. Physical gas
conservation, pressure convergence, phase boundaries and energy remain unresolved,
so both options remain off in public scenes. The trial report is
assets/images/water-machines/heron-cavity-trial-2026-10-09.json. A captured transient
negative volume in a
fountain trial had zero stored gas and was a collapsing vapor cavity. The native
observer now preserves the first event's amount, volume, flux and phase.

Checks: node tools/test-water-air-view.cjs, node tools/test-water-gas-boundary.cjs,
node tools/test-water-air-view.mjs, and the existing viewport/ordinary regression
harnesses. For a GPU before/after comparison, save the prior air module outside
the checkout and pass REFERENCE=/absolute/path/liquid-air-wgpu.js EQUIVALENCE=1
when running the browser air-view harness. Each capture now requires a new
document and verifies the loaded script SHA256. For host comparisons also pass
HOST_REFERENCE=/absolute/path/water-smoke-slime.js. HOST_BENCH=1 records real
Retina playback and per-function CPU samples. EQUIVALENCE_GEOMETRY=1 with
GEOMETRY_ONLY=1 and SCENES=cup checks prescribed immersed-guest geometry on
three seeds without asserting full native-state equality.

## Native overlap recovery investigation

This experiment remains outside the released native engine. The existing overlap
pass reads neighbor positions while writing positions in the same dispatch.
Identical initial buffers and packed step inputs diverge by over 90 world pixels
per second after three native substeps in a prescribed immersed-slime test.
Skipping the pass gives exact short repeats, but the nine-case cup matrix delivers
98.3582%, 98.5473% and 91.4620% of initially drainable water on the three canonical
seeds. The last misses 95%, so disabling recovery is rejected. Hold, finite-state,
particle-inventory and final containment controls pass.

A private per-instance DECLUMP_JACOBI option instead snapshots positions before
each overlap pass and canonicalizes that pass's neighbor IDs. Other native stages
keep their original neighbor list. Snapshotting alone still permits different
samples when buckets have more than 128 entries. The controlled first update
contains four such buckets, with a maximum of 148 entries. With canonical ordering,
all recorded native, pressure, gas, geometry and packed-input buffers repeat
exactly on seeds 17, 42 and 913 over four updates (twelve native substeps).

The isolated positional oracle passes 28 cases and 224 iterations, including
compressed clouds, 1,024 exact coincidences, wall/floor/corner containment,
below-density-gate controls, unchanged velocity/material/frozen/grain/tail state,
reversed lists and copies preceding the pass inside a shared frame encoder.
Default-off CPU command comparisons pass 96 frame pairs and 76 legacy shaders.
The actual GPU differential passes eighteen captures, including native words,
rendered pixels and resource/command comparisons. Default toy and game boots
load the exact private candidate with no optional resources or runtime errors.
The complete rank-candidate cup matrix passes all nine delivery, hold, finite,
inventory and final-containment cases. Canonical delivery is 100.5081%, 100.4026%
and 96.8008% of the initially estimated drainable amount, with no rim spills.
This volume-equivalent denominator excludes estimated water below the intake;
more than 100% means some of that estimated dead volume also drains. Fluid mixing
does not require the initially high particle IDs themselves to leave the cup.
The total particle inventory stays conserved.

A second private revision replaces unbounded per-bucket ranking with 1,024-pair
workgroup bitonic sorting and binary-search parallel merging. Keys are native
segment start and particle ID, preserving sparse scan order. Worst-case merge
work is O(n log^2 n), with fixed local network size. Its ordering oracle passes
104 real GPU dense/sparse cases, including negative/nonzero origins, exact cull
edges, stale tail IDs, changing counts and merge parity, up to 40,000 particles.
An independent CPU network oracle passes 90 cases. The strengthened 28-case
recovery oracle checks leading-edge terrain clearance, unique release of exact
coincidences and at least 25% reduction of sub-half-spacing pairs. Optional
preparation publishes only after asynchronous pipelines and bind groups validate;
eleven injected failure/lifecycle cases pass. Call prepareDeclumpJacobi() and
check its result before an accepted trial: DECLUMP_JACOBI reports the request,
and the native legacy pass remains active while preparation is pending or failed.
Disabling the request does not enable it again when compilation finishes.

The scalable candidate matches the rank candidate's native, pressure, gas, phase
and geometry hashes on three seeds at updates 1, 5 and 20 with prescribed immersed
guest motion. Exact-source default-off comparisons pass 96 CPU frame pairs,
76 legacy shaders and eighteen real GPU captures, plus default toy/game boots.
Four paired twelve-second Retina samples average 52.7, 45.4, 53.0 and 46.7 FPS
for rank, merge, merge and rank. They establish no reliable speedup or sustained
60 FPS. The complete scalable-candidate cup matrix conserves every particle,
passes both hold controls and records no rim spills, but canonical delivery is
100.6507%, 99.6091% and 93.7088%. Seed 913 misses the 95% target. The scalable
candidate is rejected for release; short trajectory equality does not establish
long drainage acceptance. Pressure, phase/gas conservation, energy calibration
and final natural-slime handling remain open.

An isolated CPU topology/remapping counterexample reproduces positive gas
inventory becoming unassigned when the last air-core cell crosses the phase
threshold. On nine threshold/open-area combinations, geometric air remains,
yet the following step retains neither that gas nor its unassigned diagnostic.
Per-step balance error stays zero, so accounting alone does not certify physical
retention. A mixed-cell pressure closure must preserve gas ownership independently
of the water classification, include liquid and gas compliance, and apply the
resulting pressure to the external water flux. Its isolated matrix oracle passes
108 parameter combinations. GPU reproduction, topology continuation and coupled
runtime acceptance remain pending.

Run the repeat recorder with CURRENT_NATIVE=/absolute/private/native.js,
REPEAT_NATIVE=1, DECLUMP_JACOBI=1, FRAMES=4 and EXPECT_REPEAT=1. Audit its raw
files with tools/check-water-native-repeat.mjs /absolute/capture --expect-equal.
DECLUMP_ISOLATED=1 runs tools/water-declump-isolated.mjs through the same owned
browser harness. The integrated machine recorder accepts per-case nativeParams
and freezes private CURRENT_NATIVE source bytes before recording. The public
experimental evidence is assets/images/water-machines/native-overlap-trial-2026-10-09.json.
The follow-up is assets/images/water-machines/native-overlap-scalability-trial-2026-10-09.json.
DECLUMP_SORT_NATIVE=1 runs tools/water-declump-sort-oracle.mjs against actual native
builders. AFTER=/absolute/private/native.js runs tools/test-water-declump-preparation.mjs.
NATIVE_REFERENCE=/absolute/prior/native.js, CURRENT_NATIVE=/absolute/private/native.js
and NATIVE_JACOBI=1 support deterministic EQUIVALENCE comparisons and paired
HOST_BENCH presentation samples in tools/test-water-air-view.mjs.


## Standalone siphon

Open `archive/water-smoke-slime/water-smoke-slime.html?scene=siphon`. The tube
starts filled, with a closed valve near its outlet. **Open valve** releases the
column; water from the upper tank crosses the bend and enters the lower tank.
Closing the valve holds the column, and reopening resumes delivery. The outlet
becomes submerged as the lower tank fills. Flow slows as the two free surfaces
approach the same height.

Instruments includes three initial setups: **Filled tube**, **Empty tube** and
**Raised outlet**. Changing the setup reconstructs both tanks and the selected
water inventory, preserving manual pause. Restart repeats that selection. There
is no in-run water replacement, automatic re-priming or scripted flow rate.

The siphon uses the same 1120 by 664 world and 8-pixel walls as the cup, with a
24-pixel tube and about 56,000 native particles when primed. Its outlet face is
at y=600, its crest at y=228 and its source surface initially at y=320. The raised
outlet face is at y=304. Selecting either released machine from a different
world reloads its fixed dimensions, preserving pause. The camera fits the whole
apparatus and controls into the available screen, including short MacBook
viewports. The pressure transfer, cavity volume, boundary reconstruction and
32 red/black sweeps are the same opt-in settings used by the cup.

The receiving-level measurement excludes primer still inside the descending
tube. The predicted head uses the outlet height before submersion, then the
receiving free surface. Its ideal speed remains sqrt(2gh). The measured speed
is lower; absolute flow and pressure are not calibrated.

The integrated siphon check uses six cases on seeds 17, 42 and 913: stock flow,
valve close/reopen, approximately half the initial head, empty tube, raised
outlet, and a pressure-capacity break followed by capacity restoration. The
passive GPU observer reads positions after every native update. It credits
only original source-tank particles observed crossing both the crest and outlet;
primer, rim spills and unrecorded passage are excluded.

`tools/check-water-siphon-result.mjs` independently checks copied native buffers,
containment and inventories. Its stock transfer target is at least 40% of the
original source bulk by 120 simulation seconds, with final levels within two
wall cells. Stock runs also require net native speed below 1 world pixel per
simulation second over the final ten seconds. Stock runs last two minutes;
interrupted valve runs last three minutes and retain a native-buffer transfer
checkpoint at two minutes. Their receiving inventory must change by less than
0.5% of original source bulk during that final minute. The same velocity target
is reported separately for those runs and can fail through backward/forward
oscillation. Both the original two-minute observations and the longer records
are preserved. These checks do not certify quiescence.
The passive observer weights signed parcel velocity by
residence time in the crest section after every native update. It also records
the fastest parcel, so residual oscillation remains visible. The displayed
instrument sample can lag and is not the settling criterion. The
valve control permits at most 0.5% bulk delivery while closed, including its
short downstream tail, and requires another 10% after reopening. Empty, raised
and broken/restored cases require zero source passage. The break uses a -15,000
pressure floor, restored to -80,000 at 30 simulation seconds without rebuilding
the water. A fresh filled setup supplies the actual primer needed to run again.

Head response compares the same fixed five-second interval, two to seven
simulation seconds after opening. Greater head must increase speed, and the
ratio must be within 35% of the square-root head ratio. This is a directional
game-physics check, not a calibration of absolute Bernoulli speed. Pressure
convergence and cavity-volume diagnostics can still fail during otherwise
working transfer. No physically accurate cavitation limit is claimed.

Private buffers, frozen runtime sources, screenshots and the acceptance report
are under `research/water-machines/siphon-release-validation/`. The selected
18-case report and acceptance are in its `acceptance/` subdirectory, with the
original recordings, fresh settling records and extended valve records retained
alongside it. All stock runs transfer 50.27% to 51.42% by two minutes. Interrupted
receiver inventory changes range from -0.075% to 0.265% over the final minute.
One extended valve run still misses the final ten-second speed target through
backward oscillation; that result remains explicit in the public JSON.
Head-response ratios are 5.1% to 7.6% below the ideal square-root ratios, and
absolute initial speed is about one quarter of the ideal value. Run the integrated
harness with `FRAME_MODE=native NATIVE_PASSAGE=1`, the six cases above and the
three seeds, then run the siphon result checker against that output directory.
The valve case uses primary actions at 10, 25 and 35 seconds and an `observe`
checkpoint at 120. Public measurements are in
`assets/images/water-machines/siphon-result-2026-10-09.json`.

## Greedy cup behavior

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
sample; its 8 by 8 sampling rule and shared face openings are unchanged. Further
wall/face caching and sparse geometry uploads were tested and discarded: they
reduced CPU geometry work but did not improve real presentation FPS in the paired
Retina runs. These changes are not in the released host or air module.
A moving-guest repeat control also did not reproduce full native hashes with
identical sources; geometry-only comparisons are not treated as a full native
simulation-equivalence certificate.

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
