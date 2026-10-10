# Water machines

Release: toy v5.57, shared water engine v28.179. The greedy cup, standalone
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
108 parameter combinations.

The actual released GPU step chain reproduces the loss on nine threshold/open-area
cases with native-grid mass, and another nine with prescribed MAC records and the
actual transformed pressure shaders. Compression below threshold, a surviving
neighbor air core and actual room vent controls pass. The recorder is
tools/test-water-air-pocket-threshold.mjs. Its default mode reproduces the released
defect and reports physicalRetentionPass=false even when the test itself passes.

A private singleton prototype retains independent gas ownership while keeping
LIQUID classification. Its gas row adds liquid compliance/history; each normal
neighboring water row assembles the external face coupling, provisional flux and
neighbor pressure once. Final gas volume includes liquid compression. Exact v2
GPU checks pass nine retention cases and three controls in each transfer mode,
plus 48 finite-neighbor pressure/volume/force cases per mode. The independent
linear two-row matrix and nonlinear EOS bisection use the encoded gas base.
Both face directions, positive/negative/zero provisional inflow, densities 1/2
and sound speeds 250/1000 are exercised. Largest absolute pressure-oracle error
is 0.0047 units without MAC and 0.0110 with prescribed MAC records. Pressure
and volume tolerances account for float and fixed-point encoding, with no
acceptance claim for natural particle motion.

Three guards per mode pass: changed solid coverage and nonzero wall speed reject
before GPU writes; adjacent mixed owners keep their inventories but report an
unsupported interface and unresolved phase. Mixed roots are excluded from the
ordinary liquid residual and cavitation-credit loops. Face openings and room
masks can still change, and static tile-basis mutation is not guarded. The option
is private and disabled in every released scene. Source SHA256 is
f964270a9dbc0eff0436124c017ecd343347c88be935a5b7fbd61038904e3609;
its MAC helper is 3fcf6d0fdd42dd09b93bb1c7aea73225f517829ccd60d51e366d80484b65fe05.

This is a one-way resolved singleton prototype. Returning below the threshold
still drops the liquid compliance contribution; subquantum/zero-volume positive
gas, general advection/split/merge and moving boundaries remain unresolved. MAC
scatter and particle gather are bypassed. The force oracle uses the measured MAC
face density, so it checks the encoded operator rather than the physical accuracy
of interface inertia. MAC support still includes the whole LIQUID mixed cell.
Public evidence: assets/images/water-machines/single-air-pocket-trial-2026-10-09.json.
Use AIR_SOURCE=/absolute/private/air.js, EXPECT_RETENTION=1, PRESSURE=1,
PRESSURE_EXTENDED=1 and GUARDS=1 with the recorder. MAC=1 also requires the paired
MAC_SOURCE. General topology continuation and coupled runtime acceptance remain
pending.

The next private prototype declares one planar liquid strip and its sealed gas
inventory independently of the native phase label. The same water fraction .46
is tested under thresholds .40 and .50, preserving the resulting LIQUID and AIR
kinds. Its mixed liquid compliance, pressure reference and force reconstruction
participate in both classifications. The MAC face basis integrates the declared
water rectangles rather than choosing whole cells by kind. Independent Gaussian
quadrature gives a shared-face basis of 33.7801102 square pixels, where the old
kind-based rule gave 20.4444444 or 40.8888889 for identical water.

Exact v3.1 passes 48 paired GPU comparisons in each transfer mode, 192 individual
fixtures in all. Both face directions, negative/zero/positive inflow, densities
1/2, sound speeds 250/1000 and linear/nonlinear gas are covered. An independent
finite-neighbor matrix or nonlinear EOS bisection uses continuum density, not
measured MAC density. Pressure, neighboring pressure, gas volume and velocity
correction have zero recorded differences between the two phase thresholds.
Largest absolute pressure errors are 0.00360 without MAC and 0.00544 with MAC;
neighbor pressure errors are 0.00229 and 0.01002. Volume error is below 0.000589
square pixels. The known MAC face density differs from continuum by at most
0.00000155. These are numerical fixture measurements, not natural-flow accuracy.

The first extended v3 run fails its zero-flow case: gauge pressure is -0.001364
instead of zero because it subtracts two large room-pressure values. V3.1 uses
atmosphere*(amount-volume)/volume in declared mode. The same unchanged tolerance
then passes. CPU mocks pass 86 checks, including exact v2 default shader,
resource, write and command equality with the declaration absent. Both source
and failure hashes appear in
assets/images/water-machines/declared-plane-pressure-trial-2026-10-09.json.

These checks still prescribe all liquid geometry and native-grid/MAC records.
Scatter and native particle gather are absent; a declared plane is not a natural
interface. Reconstructing volume from actual particles, pressure work and
continuation across real compression/expansion remain the next gate. This is
private, pressure-only evidence, not a release candidate. Run INVARIANCE=1,
INVARIANCE_EXTENDED=1 and EXPECT_RETENTION=1 with the exact v3.1 AIR_SOURCE;
MAC=1 requires its paired MAC_SOURCE. Do not also select PRESSURE or GUARDS,
which exercise the preceding singleton experiment.

The next CPU continuation rejects that common pressure row. A valid initial gas
pressure pulse changes its stored gas volume by about 0.0874123 square pixels as
dt approaches zero, while the predicted native material change approaches zero.
Equilibrated affine flow also gives about 27% disagreement. The declared-plane
GPU agreement therefore cannot establish physical particle continuation.

A separate P1 pressure and mass-adjoint particle transfer passes 124 CPU checks:
48 transfer states, nine Float32 storage controls, 24 repeated steps and five
spatial scales. Its constructive case uses the existing native-format parcel
state, a material-edge pressure knot, positive determinant J update and physical
affine pullback. Its separate liquid/gas pressures use exact water and gas EOS.
Material, geometric gas volume and pressure work close at double roundoff in
that bounded calculation. This changes the interpolation; the existing quadratic
scatter and MLS do not inherit its proof. The coarse pressure-pitch APIC covariance
control is also distinct from native fine-grid APIC and physical parcel energy.
Root independently reran a byte-exact copy with an identical report. Source SHA256
is 8736960edaa556f2a7440dfea6ddca6b1b4a159f7b84a3429ea66a0a05e0d306;
report SHA256 is ac7ece10d035ae78e8d41a3456a36c0ab7d004ba3c3e5357869b2ef2dafba2de.
The actual private native P1 continuation now runs eight native GPU updates in
36 planar configurations, with sixty resident parcels and no runtime/shader/GPU
errors. Density 1/2, sound speed 250/1000, equilibrium/pulse/affine initial state
and dt 1/120, 1/240 and 1/480 are varied. Positions and material state are authored
once before the sequence, never reseeded between steps. All 288 updates execute.
Twenty-nine cases pass every independent per-step scatter, EOS, pressure, gas and
material/position volume, physical kinetic energy, work and gather/collision check.
Seven cases fail sixteen independent EOS residual arithmetic-only checks. The
candidate's larger Newton stopping threshold does not override those failures.
Five global Float32 sequence enclosures pass; 31 remain mathematically unresolved.
Only three of 36 valid cases pass both sets of checks. All five unsupported count,
nonplanar, material, topology and nonfinite-affine controls reject correctly.

A separate display-validation correction equates JSON zero with decoded signed
zero; the raw words and physical allowances remain unchanged. The original pilot
preserves six negative-zero words and no nonfinite words. General interface and
topology acceptance, full machine calibration and performance remain pending.
Evidence: continuation-progress-trial-2026-10-09.json and
native-particle-continuation-trial-2026-10-09.json. A further private candidate
continues Newton iterations past the candidate-only early stop; it must pass the
same unchanged independent hardware gates before any acceptance claim.

That separate private v4.7 candidate now passes all 36 per-step physical cases
over 288 actual native GPU updates, plus all five unsupported-input controls.
The single early-stop condition changes; the EOS, force, particle/material
transfer, final rejection guard and independent arithmetic bounds stay unchanged.
The solve continues until exact evaluated zero, no improving line-search step,
or the existing 32-iteration limit. Some cases reach that limit and still pass
the external accuracy gate. The prior sixteen failing EOS steps now pass. Five
global sequence enclosures pass and 31 remain unresolved, so the complete matrix
is still not accepted. No pressure prototype is released. Evidence:
native-particle-newton-trial-2026-10-09.json preserves the full case summaries,
source/raw/audit hashes and links to the preceding failed trial.

Sixteen private queue-pacing runs use exact v5.46 sources, seed 17, 1512 by 760
Retina rendering, four seconds warmup and eight seconds sampling. They verify
loaded source hashes and close every owned browser. At 1/60 host packets and two
admitted machine frames in flight, siphon and Heron execute about 60 host frames
per wall second. Median sampled native queue-prefix latency is 14.3 and 19.9 ms,
compared with baseline medians of 1.3 to 2.3 seconds. The cup executes 51.6 frames
per second with 25.1 ms median latency and growing host debt. No candidate native
clamp or fixed-bank overflow is measured. Smaller 1/120 cup packets execute
73.3 and 75.6 frames per second but advance the native clock more slowly than
1/60 packets. Higher frame counts therefore do not establish faster water.

These are uncapped scheduling measurements, not physical display FPS, sustained
60 FPS, or machine acceptance. The scheduler remains private: quiet-water banks,
deferred time across input/parameter changes, low-timescale remainder loss, and
paused foreign draws block release. Whole-frame admission preserves the existing
call order but does not prove matching displayed GPU water and CPU slime poses.
The public trial JSON preserves clock frontiers, time accounting, raw prefix
samples, source/report hashes and CPU pressure limits. Those trials changed no published simulation. The later v5.48 release adds
only the independently checked low-speed timing fix described below.

Released v5.48 / native v28.179 fixes the machine slow-motion freeze without
activating a scheduler. `RETAIN_SUBQUANTUM_REMAINDER` is an explicit per-instance
flag, default off. It raises the fixed accumulator cap to at least one native
1/120-second quantum. The toy enables it with its air model and removes both
flag and timing audit on ordinary return. The accumulator remains module-shared;
`getTimingState()` declares this scope and returns a copied audit.

Actual original-host hardware comparisons reproduce zero native advancement at
5% speed in cup, siphon and Heron. With the flag, submitted rates are .0791,
.0729 and .0708 simulated seconds per wall second in four-second samples. The
nominal rate is .0775; retained remainders, ignored tiny host calls and lagged
mirrors prevent treating these short measurements as exact playback rates.
Three actual host lifecycle tests pass slow movement, normal resumption and
flag/audit removal on ordinary return, with no uncaptured GPU errors.

Default-off GPU comparisons pass six dense/sparse fixtures on three seeds,
eighteen resident checkpoints and exact render pixels. With the flag enabled,
normal timescales .5, .775 and 1.55 pass the same comparison: eighteen fixture
instances, fifty-four resident checkpoints and eighteen render captures. GPU
resources, passes, pipelines and all 69 native WGSL literals are unchanged.
Smoke matches byte-for-byte at 49 checkpoints. The rebuilt v28.179 game and
v5.48 toy pass their release boot and engine-sync checks. The rebuilt game also
passes the smoke-coupling browser checks; the fountain preview passes both air
overlay controls with no JavaScript errors.

Private v3 latest-position scheduling passes CPU policy and six actual
interaction cases, but its full canonical cup seed17 delivers 94.46587288% of
initially drainable water at 180.033 submitted seconds. The existing target is
95%. All 69,307 particles remain finite and conserved, with zero hold loss, rim
spills or final centers inside walls. The single-case audit retains all numeric
criteria and explicitly omits matrix completeness; it is not the nine-case
acceptance. The scheduler is not released. Sustained 60 FPS, phone performance,
full pressure/gas and energy acceptance remain unfinished. Evidence:
assets/images/water-machines/slow-motion-and-drag-trial-2026-10-09.json.

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
counts executed host frames, including rates below 20, and shows zero when paused.
Its FPS value does not measure the completion of queued GPU water frames.

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


The compact pressure-dispatch trial remains private. Its default-off compiled
shaders and commands match the current air model; 24 prescribed-input GPU
fixtures match all compared buffers through three pressure steps. A separate
cup off/on/on/off trial retains the original scheduler and native remainder
fix, with two seconds warmup and six seconds sampling per fresh document.
The air pass averages 1.691724 ms off (272 samples) and 1.702492 ms on
(266 samples), with no timestamp drops or runtime errors. This demonstrates
no speed gain, so the option is not activated or copied into public runtime.
The public artifact preserves source hashes, raw air-pass samples, frame
intervals, coverage and the bounded measurement limits. A new native-chain
recorder initially failed on a missing COPY_SRC observation capability; that
failed record is preserved and supplies no equivalence acceptance. The post
uses "unproved" for the remaining initial-condition error bound, rather than
suggesting a proof that error is infinite. The v5.51 host change is its version
label only.


Two further performance experiments are rejected. The private pressure-bound
revision preserves 24 isolated grid/direct/prescribed-MAC fixtures through three
GPU steps, but its paired cup air-pass mean rises from 1.696371 ms to 3.051694 ms
(79.895% slower). All four documents complete with verified source bytes, zero
errors or timestamp drops, and exact owned-browser closure. Fewer dispatches
do not establish faster GPU execution. No repeat or full physical suite runs
for this revision.

The separate strict-default-off explicit-face packing experiment preserves
packed geometry bytes, validation errors and counters, shader/resource/command
records, and complete uploads in 120 bounded CPU geometry pairs. Its first
paired cup trial has OFF 310 calls at 1.869355 ms and ON 308 at 1.679870 ms,
a 10.136% decrease that narrowly clears the fixed 10% pooled and 5% adjacent
thresholds. The unchanged repeat has OFF 310 calls at 1.615161 ms and ON 314
at 1.862739 ms, a 15.328% increase. Both recordings complete with verified
source bytes, zero errors/drops and owned-browser closure. Every observed CPU
call is retained. The failed repeat ends promotion; no full physical suite is
run for this candidate. Headless RAF rates and overlapping CPU spans are not
display FPS or hydraulic acceptance.

The revised native recorder completes the three canonical short-chain sets,
but the next grid fixture uses pressure pitch 16 with native pitch 2.5, an
unsupported fractional ratio. Overall recording remains incomplete and failed.
A separate offline diagnosis verifies 216 compatible native count-sort
contracts and exact captured buffers outside the legal within-cell sort order.
Cup RNG metadata still differs, missing coarse-grid/MAC coverage stays explicit,
and the strict gates remain inconclusive. These short observations establish
neither full native equivalence nor future physical acceptance.

The public pressure-performance-followup-trial-2026-10-09.json artifact retains
the isolated checks, both CPU trials including raw primary call durations,
source/report hashes, rejection decisions and recorder limits. Toy v5.52 changes
only the runtime version label; shared native v28.179 and all rejected options
remain unchanged. The quiet released air-pressure view remains available.


The private cacheWaterWeights revision fails its exact original-output gate.
Three grid/Jacobi fixtures complete nine matching steps. The quantization-edge
fixture matches two more, then changes pressure and fine-grid velocity at
its third step (dt 1/90). Both current-water cache tails still match the
independent original-expression GPU probe word for word. Production and
candidate-off remain byte-exact through all twelve attempted checkpoints.
Standalone coefficient equality therefore does not establish unchanged consumer
arithmetic or final outputs. The observed finite differences remain failures;
no tolerance is relaxed.

The recorder stops before the remaining twenty fixtures and all six deliberately
skipped-refresh controls. RecordingComplete is false, no fixture GPU error is
reported, and the exact owned browser exits. No timing, full physical suite or
promotion is admitted. The public stencil-weight-cache-trial-2026-10-09.json
artifact preserves all recorded raw buffers, hashes, the partial scope and
rejection decision. Toy v5.53 changes the version label and progress evidence
only; the shared native engine, released air solver and overlay are unchanged.


A bounded independent saved-record review reproduces 44 checks, verifies all
648 raw records and replays geometry and actual uniform uploads exactly. The
pressure x difference is at most two ULPs, but it remains an exact-gate failure.
A separate saved-auditor restriction assumes full 64-byte config writes and
would reject the unchanged legal four-byte minimum-pressure update at offset
32. Partial-write replay matches the actual captured uniforms. This recorder
restriction is preserved explicitly; it neither causes nor removes the
observed candidate pressure/velocity mismatch. The precise first divergent
arithmetic instruction is unresolved without intermediate captures or compiler
IR. A change in rounding context remains an inference, not a measured cause.


The narrower private cacheWaterFaces candidate stores only clamped face openings;
consumer timestep multiplication and density division remain unchanged. All 24
isolated grid/direct/prescribed-MAC fixtures complete three original encodes,
with byte-exact production/OFF/ON original allocations and prefixes. Both current
water cache tails match the independent original faceOpen GPU probe, including
the previous quantization case at dt 1/90. All six deliberately skipped-writer
controls are detected. The independent raw audit verifies 6,859,920 bytes and
17,632 face words. This gate prescribes fine-grid/MAC inputs; actual native
particle gather/collision and full-window physical acceptance remain unproved.

Two incomplete recorder attempts are preserved. The first reaches 48 matching
positive checkpoints, then lacks COPY_SRC permission for MAC terrain copy-out.
A symmetric fixture-only device wrapper repairs that readback permission. The
second completes all 72 positives, then supplies a bind-group layout where its
negative-control pipeline needs a pipeline layout. The final recorder constructs
the matching pipeline layout explicitly. Candidate, numerical inputs, raw
acceptance predicates and tolerances remain unchanged. Only the complete final
recording admits timing, and every exact owned Testing child exits.

The paired natural cup trial records four fresh Retina documents in OFF/ON/ON/OFF
order, seed 17, with two seconds warm-up and six seconds sampling per row. All
source and active-option checks pass, with no errors or timestamp drops. Pooled
OFF costs 3.096600 ms across 185 air passes; ON costs 2.763670 ms across 185, a
10.751% decrease. The adjacent ON/OFF ratios are 1.471120 and 0.537226. The fixed
qualification floor requires pooled ratio <= .95 and both adjacent ratios <= .97;
the latter fails. This establishes no reliable playback gain. No repeat, full
physical suite or promotion follows, and RAF rate is not display FPS.

The public stencil-face-cache-trial-2026-10-09.json artifact includes the raw-audit
receipt, timing decision, source pins and lossless gzip/base64 archives of all
four raw reports, including both recorder failures. Decompression reproduces the
original byte lengths and SHA256. Toy v5.54 changes only progress evidence and
the version label; the released air solver, overlay and shared native v28.179
remain unchanged. Gas retention, quantitative flow and energy, sustained laptop
and phone playback, and final polish and audit remain unfinished.

## Actual native air-ownership loss (October 9, 2026)

A bounded read-only recording captures one loss in the released Heron nozzle
with seed 17, original host scheduling and native resident particles. The air core
at pressure cell 2858 crosses from water fraction 0.427658439 to 0.455084264, past
the actual threshold 0.449999988. The three cells previously assigned to that
pocket all become LIQUID with no current air owner. Gas destination is NONE;
its entire prior amount 16422 at volumeScale 256 becomes unassigned. At this step
there is no captured or vented amount, and current inventory decreases by exactly
16422. It is an ownership loss, not a vent of this pocket.

The former core still estimates 54.4916 percent void, and the old footprint still
estimates 63.6762 square world pixels of void. These are the existing sampled
localAirArea diagnostics, not a sharp geometric gas volume. Twenty-five native
particle centers occupy the core cell. This transient sampled cavity proves
modeled inventory loss; it does not prove a stable physical bubble or a matched
interface force, work or material-volume change. A neighboring cell has another
air owner, so spatial proximity alone cannot justify moving the lost inventory
there. Retaining a counter alone would not repair pressure coupling.

The first observed loss is encode 496 after initialization, absolute model
encode 499. The observer retains 511 encodes because polling allows already
submitted work before pause. Actual initialization modelSteps 3 and nativeClock
.025 remain explicit. Uniforms and geometry are unchanged across the captured
seam. All 92603 resident particle inputs are finite. The post-observer copies
exactly match post-pressure bytes, and all retained observer mutation counts are
zero. The witness records actual pre-pressure, post-pressure, post-observer and
previous encode input buffers, including history, labels, geometry, both pressure
buffers, transport, all resident allocations and fixed active native grid
prefixes. PRE history is the preceding pressure state; current PRE particles
already traversed the prior gather and collision. POST is before current gather
and collision. These timestamps do not establish an uninstrumented trajectory or
performance.

The first recorder attempt verifies source bytes but fails before installation
because its CDP expression uses await without an async context. Its exact owned
Testing child exits 0. A fresh derivative wraps only installation/cleanup in async
IIFEs. That run completes 512 observed encodes without a loss, and is inconclusive;
18 additional final encodes are outside observation. A further derivative extends
only the observation ceiling to 8192, with the same 180-second wall cap, and finds
the above event before 511. All prior results remain intact. Different short-run
outcomes reflect host-scheduling trajectory variability; the witness does not
promise deterministic first onset. Original shader physics, settings, iterations,
particles and scheduling remain unchanged. All exact owned browsers exit.

The native-air-ownership-loss-2026-10-09.json public artifact retains the three raw
reports, source freezes, observer/decoder sources and both valid ledger captures.
It reproduces all 40,446,528 bytes of the four-section witness snapshot, using
lossless gzip/base64 blobs shared by identical allocations. Raw sizes and SHA256
are checked after decompression and reassembly. Root independently audits the
saved buffers; a second read-only review reproduces all 76 section/allocation
hashes, each current owner and the exact inventory drop. Toy v5.55 updates progress
and the version label only. The quiet air overlay and released native/AIR solver
remain unchanged. General retention, matched pressure/volume coupling, physical
machine calibration, sustained laptop/phone performance and final polish/audit
remain unfinished.


## Startup pause and smaller native test (October 9, 2026)

Toy v5.56 replaces the unconditional boot startLoop call with syncRunning.
It honors the existing pause, visibility and intersection state before requesting
a simulation frame. Native/AIR/MAC sources and all numerical settings are unchanged.

A private 96 by 88 baffle test uploads 2,048 actual native water parcels once.
The first attempt fails before fixture initialization because Empty ignores the
machine-only paused query. A boot-only private pause seam reveals a second issue:
the released unconditional boot loop advances 0.0916667 native seconds while the
pause flag is true. That incomplete attempt remains failed. A manual pause API
workaround captures the native defect at pressure step 1,532; the released startup
fix passes the unchanged zero-clock boot assertion without that workaround.
Its separate natural trajectory captures loss at step 843. The original overlap
pass is nondeterministic, so these runs are not an exact trajectory comparison.

Both completed tests make 1,024 controlled update calls and record 1,587 real
pressure encodes, totaling 13.225 native seconds. The original sampler's local
45% AIR-to-WATER transition drops positive gas ownership in the smaller apparatus.
In the first completed run, root82 loses 36009/1024 ambient-normalized area units,
while its prior three-cell footprint still estimates 42.8665733 square pixels
of void. All native active fields are finite, observer POST copies match, exact
loaded sources are verified and both owned Testing children exit0. All failed
attempts, frozen sources and complete raw snapshots remain in the public evidence.

The outer border is solid, but the released host still places18 room-reference
seeds in the top band. This is an ownership-loss diagnostic, not a physically
sealed gas-conservation test. It is controlled stepping with observer overhead,
not default-cadence playback, performance or machine physical acceptance.

An offline motion-map derivative follows the native quadratic weight derivative,
the pressure field's midpoint chain rule, radial speed limit and world clamp.
It retains the native CELL constant separately from rounded invCell. On 2,046
smooth saved samples, coordinate perturbations agree within 1.02e-10 in Double.
Two branch-crossing samples remain excluded. Six controls cover known translation
and affine motion, clipping and a deliberately omitted midpoint chain term.
This is not a Float32 bound, intrinsic material J or a pressure-force repair.
Collision, declump and the geometric volume derivative/transpose force remain
unfinished. No new formal initial-condition requirement is imposed.

The actual browser air-view regression boots and plays all three machines and
checks both synchronized overlay controls without errors. Its short frame samples
do not establish sustained 60 FPS or phone performance. Evidence:
assets/images/water-machines/native-baffle-and-startup-progress-2026-10-09.json.


## Native material carrier and air-cell walls (October 9, 2026)

Toy v5.57 publishes the AIR closed-wall reconstruction and its consistent affine derivative, retaining moving closed-face speed. Shared native v28.179, gravity 250, time scale 1.55, gas ownership, pressure settings and MAC remain unchanged. The progress section keeps the current findings visible and folds earlier records behind an existing details component.

The original cup recorder first boots Falls, producing a failed native collision self-test and an 1118 by 663 world. Its complete nine-run delivery audit is limited evidence, and original full qualification remains failed. Machine startup is now explicit and paused, yielding the actual 1120 by 664 apparatus. A clean static-wall suite delivers 101.25105, 101.06017, 94.66792 percent. Seed 913 misses 95 percent, so that version is rejected. No errors or wrong-size recordings are discarded or relabeled as passes.

The moving-wall candidate preserves actual closed-face normal speed, including different speeds on opposing faces and their spatial derivative. Its shader test covers 1,152 configurations, all 16 face masks, three wall-speed patterns, water/air/unsupported cell labels, solid cells and reconstruction disabled. 531 unaffected before/after pairs match exactly; 45 closed-wall combinations repair the old bypass and pass independent affine finite differences. The fresh nine-run cup suite delivers 101.8%, 98.4%, 98.8%; its delivery target result is True. Counts, finite resident fields, containment, pre-drop hold and lower-fill/raised-bend controls pass. These inventories do not certify pressure, gas volume, work or performance.

A new closed 96 by 88 baffle contains 1,680 native water parcels with rest volume 1.5625, no room anchors and ordinary released gravity and timing. This differs from the earlier 2,048-parcel fixture. Private native callbacks carry J from the determinant of the actual quadratic and midpoint displacement map. Sampled density and APIC moments are not material J. Rejected contact, declump/recovery, world-bound and nonpositive events keep old J and an unsupported flag. Baseline parcel 1679 crosses the bottom at native step 20 because AIR cell 118 skips its closed mask 10, then collision rolls it back. The private static-wall carrier records 49 actual steps, 0.408333 native seconds, with all 1,680 supported and no contact/recovery/bounds/nonpositive events. Independent errors are at most 1.66903e-7 in F, 3.85106e-6 world pixels in position and 1.82208e-7 in determinant. Actual released gas ownership still drops at step 32.

The existing sharp contour and overlap ledger reconstruct one connected gas region from accepted native material and positions. A pure noncondensable isothermal adapter uses the released atmosphere setting (3796635.5), without the earlier vapor-background oracle. At six saved checkpoints, water plus gas closes the 5568-pixel domain to about 1e-11, and amountRT stays 11,173,498,276.5. This remains offline and does not resolve general topology or contacts.

An actual-native control adjoint includes the midpoint chain, determinant and spatial/control mixed derivatives. Three directions match freshly reconstructed intrinsic water plus gas energy derivatives within 6.61e-6; omitting material work fails. A bounded nonlinear correction pairs native fine-grid velocity with its measured P2G nodal mass. Its 38 CPU iterations reduce potential plus correction inertia from 3345.15996 to 341.77300, with residual 0.22251 below 0.23948. It holds projected/provisional faces fixed and starts after the released pressure update, so it is not a replacement coupled pressure solve. Its 52.6-second CPU cost is not real-time performance.

One guarded native update applies that correction to 512 grid nodes after all 54,116 input words match the saved solve. All 1,680 materials remain supported. Actual Float32 positions and material J agree with the CPU result within 3.82e-6 and 1.38e-7, respectively. Independently reconstructed potential is 128.63862, compared with the CPU estimate 128.63625. Gas amount stays fixed and water plus gas closes to 1.82e-12. Geometry and energy are still measured offline, and the experiment does not replace runtime gas ownership or handle general contact and topology changes.

Evidence preserves the source freezes, complete candidate 49-step raw traces, selected full baseline contact sections, force and inertia source/results, the failed older recorder and static qualification, and all initial/held/final position bytes needed by the unchanged cup inventory checker. Detailed cup pressure trajectories and other cup native buffers remain private and are not certified. Lossless gzip/base64 blobs are verified by size and SHA256 after reassembly. Runtime gas ownership/force replacement, calibrated flow/energy, natural bubbles, sustained laptop/real-phone performance and final polish/audit remain unfinished.

Evidence: assets/images/water-machines/native-water-volume-and-wall-progress-2026-10-09.json.

## One-pocket pressure reduction (October 9, 2026)

For a fixed closed domain with one connected gas region, gas volume is domain area minus the sum of carried water volumes. Its derivative is the negative of the material-volume derivative. The private inertia correction now uses that identity inside each pressure iteration, retaining the same captured native field, P2G mass, projected/provisional faces, parameters, branch guards and gas amount. This changes no released solver or shared native source.

The unchanged 38-iteration solution reduces potential plus correction inertia from 3345.15996 to 341.77300. Recorded solve time is 14.826 seconds, compared with the earlier 52.594-second trial. These are single CPU trials, not a controlled benchmark or sustained-performance result. A separate 59-second audit reconstructs all 39 accepted iterates with the original sharp geometry, checks actual gas overlap continuation and compares five full transposes. Maximum energy difference is 2.57e-9, gradient difference 2.14e-14, volume closure 6.37e-12. Final positions differ from the original solve by at most 7.11e-14 and material J by 3.56e-14.

The first independent directional audit fails at a 1e-5 perturbation, where energy and contour reconstruction roundoff are amplified by division. Its failed source and stderr remain preserved. A declared five-step sweep checks both directions at initial and final states; three of its 20 checks remain failed. All four checks at 1e-3 agree within 6.06e-7 relative error. A fresh full audit changes only the perturbation to 1e-3, retains the original 2e-5 tolerance and passes. The solver source and result are unchanged.

This reduction assumes one connected gas pocket and a fixed domain. General multiple-pocket ownership, gas topology, contacts, a coupled runtime pressure replacement and repeated actual force application remain unfinished. The separate geometry audit is excluded from the solve cost, and 14.8 seconds is still far from live use. Sources, freezes, original failure, all sweep records, complete accepted corrections and audit: assets/images/water-machines/one-pocket-pressure-reduction-2026-10-09.json. The previous native recording is referenced by its exact public evidence hash.
