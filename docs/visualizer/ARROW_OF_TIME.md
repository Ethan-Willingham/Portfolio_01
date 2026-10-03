# Arrow of time

Working comparison prototype: [arrow-of-time-lab.html](../../arrow-of-time-lab.html).
Room id: `arrow-of-time`. No homepage, archive, hub, or shared stylesheet changes.
The standalone host is also the example host for the reusable room.

## Exact model

This implements the published **two-layer Q2R** map on an even periodic lattice.
Both fields are byte spins in the CPU reference and packed bits on the GPU.
Bit 1 means +1; bit 0 means -1. The complete microscopic state is `(x,y)`.

```text
phi(x)[i] = -1 if x[left]+x[right]+x[up]+x[down] == 0, otherwise +1
forward: (x,y) -> (y * phi(x), x)
inverse: (x,y) -> (y, x * phi(y))
energyTwiceJ = -sum_i sum_four_neighbors_j x[i] * y[j]
E/J = energyTwiceJ / 2
```

All sites use immutable old fields. Three GPU buffers rotate through current,
previous, and scratch roles. In reverse, the older field supplies the neighbors.
This is not the one-layer checkerboard Ising schedule. There is no parity state.
Each destination word has one writer; its 32 outputs are computed together.
Rows are packed independently. Both toroidal wrap and the last partial word
are handled explicitly, including lattices narrower than one word. Padding
bits are zero. An integer workgroup reduction measures energy, magnetization,
zero-neighbor-sum sites, and domain boundary bonds.

The invariant follows directly: reversing the layer swap restores the old `x`;
applying the same pointwise sign twice restores `y`. For energy, the difference
is `-1/2` times the sum of `y[i] * (phi(x)[i]-1) * neighborSum(x)[i]`, which vanishes at every
site. The tests also check the actual implementation at zero tolerance.

Primary specification: [Montalva-Medel, Rica and Urbina](https://arxiv.org/html/1903.11761v1),
sections 2.1 to 2.3. Their discussion of fixed points and cycles also limits
claims about equilibration. [Lindgren and Olbrich](https://arxiv.org/abs/1703.10527)
connect reversible dynamics with coarse information loss; their exact analysis
is one-dimensional. We do not transfer that exact solution to this 2D orbit.

## Authored preparation

Three original drawings are constructed at cell centers: a moth with patterned
wings and a crescent moon, a seven-petal bloom, and an orbital silhouette. Their
dimensions and inequalities are in `motifAt`. Constructor version 4 measures
both coordinates in `0.14 * lattice-height` units to retain their proportions on
rectangular grids. The drawing occupies 14% of its former lattice height;
camera zoom is a separate control. The legacy motifs remain accepted by the CPU helper. Each is perturbed by the specified coordinate weave:

```text
r = (col^2 + 3*row^2 + 7*col*row + 11*col + 13*row + phase) mod 127
phase = 0, 19, or 38 for moth, bloom, or orbit
flip the motif's base sign where r < 9
initialize x = y
```

This is a fixed algebraic construction, not a PRNG or a thermal draw. A single
coordinate-descent pass brings the initial ordinary bond energy toward the
nearest multiple of four to `-sqrt(2)*N`. With `x=y`, that bond energy equals
Q2R's initial two-layer energy. Traversal uses a fixed stride, initially
`width+1`, increased by two until coprime with `N`; cell `k` is `(k*stride) mod N`.
A flip is accepted only if it strictly reduces the distance to the target and
keeps at most 16 motif disagreements in its 8x8 block. The evolution itself
never uses this preparation search and never changes its rule.

Measured initial presets, constructor version 4, standalone default 2048x1536:

| Motif | E/J | Magnetization | Flippable | Neighbor correlation | Mean line run | Block entropy estimator |
|---|---:|---:|---:|---:|---:|---:|
| Moth | -4448732 | 0.835116 | 3.3157% | 0.707107 | 6.8284 cells | 0.385482 |
| Bloom | -4448732 | 0.837036 | 3.2871% | 0.707107 | 6.8284 cells | 0.389942 |
| Orbit | -4448732 | 0.840769 | 3.2436% | 0.707107 | 6.8284 cells | 0.385322 |

For all three, `E/(NJ)=-1.4142138163248699`. The infinite-volume equilibrium
Ising reference is `E_c/(NJ)=-sqrt(2)` and `k_B*T_c/J=2/log(1+sqrt(2))`.
Energy proximity does **not** establish critical equilibrium, ergodicity,
thermal sampling, or a particular interface dimension. No SLE or 11/8 readout
is shown. The 127-cell weave has deliberate algebraic structure, including
visible alignments; it is not disguised as sampled noise.

## Score, observables, and rendering

The first motif holds for eight active seconds, then evolves for 4320 forward
steps. A two-second turning hold precedes 4320 inverse steps. At 24 updates per
ambient second each direction lasts three minutes. A full comparison of both
computed fields verifies the arrival; the returned state holds for 12 seconds.
Only afterward does the room explicitly reset to the next authored motif.
A custom drawing repeats its own sequence until another image is selected.
The last two seconds fade the image toward the page background and the next
motif enters over two seconds. These display fades do not alter any spin.
The initial opening and the arrival verification are fully visible.

The loop has intentional revisits and authored resets. It is not advertised
as mathematically nonrepeating. Normal playback computes every forward or
inverse update; no cached image or texture feedback drives it. Timeline seeking
uses the explicit checkpoints described below. The initial byte fields remain
available for the full comparison.

### Timeline and drawing

The visible range slider spans positions 0 through 8640. Its first half is
4320 forward steps and its second half is the matching inverse sequence. The
clock labels describe the nominal six minutes of evolution and exclude the
opening and turning holds. Dragging pauses playback; Play continues at the
chosen position. Keyboard arrows, Home, and End use the native range control.
Seeked images are fully visible, including the start of a later cycle.
Diagnostics are marked stale during a drag and refreshed on release.

During initialization, the GPU computes all 4320 forward states and saves both
packed layers every 32 steps, including both endpoints. It then computes all
4320 inverse updates and compares both complete fields with the initial state.
The 136 checkpoints use 106,954,752 bytes at 2048x1536 (26,738,688 at 1024x768). A seek copies the nearest
preceding checkpoint and performs at most 31 forward updates. Inverse positions
also execute a forward/inverse pair to establish the adjacent state used for
interpolation. Images are rendered from these computed bits at the current
viewport size and colors; there is no video or rendered-frame cache. A return
after seeking is labeled in the recorded comparison so it is distinguishable
from an uninterrupted physical traversal.

The drawing pad is a 384x256 transparent mask with a round brush, an eraser,
Clear, and the original Moth template. Mouse and touch share pointer events.
Arrow keys move a keyboard brush and Enter toggles its pen. Render drawing
thresholds alpha above 96 and samples the mask into a centered rectangle with
height `0.14 * lattice-height`, preserving the sketch aspect ratio. It then
applies the same deterministic weave and preparation search. The drawing pad
itself remains large for editing.
The original sketch is retained at coarse scales, with microscopic changes to
activate the rule. Custom image energy is measured rather than assumed to reach
the equilibrium reference. Custom states can be exported as complete packed
arrays even though their source sketch is not persisted across page reloads.
Custom configuration ids include their packed-state checksum.

The renderer builds an exact hierarchy of paired positive-spin counts from
both fields: the local observable is `(x+y)/2`. A layer swap by itself therefore
leaves the image unchanged. Its value can change only at sites whose neighbors
sum to zero, which removes the alternating layer flicker. At each level a
second integer count holds the preceding computed pair. After a forward update,
that pair is `(y,scratch)`; after an inverse update it is `(scratch,x)`. These
three buffers are already required by the solver. A smoothstep transition over
the fractional update interval joins adjacent observables without storing any
image. The scratch field for an exported state is derived from its two layers
and direction. Holds, startup, and exact return display the current pair alone.

Edge block areas are retained even for non-power-of-two sizes. At less than
one display pixel per cell, bilinear block averages use the appropriate level
of the exact hierarchy. Between one and 2.5 physical pixels per cell, sampling
moves smoothly from those averages to the individual paired cell count. At
larger scales each resolved cell has a sharp boundary. There is no extra coarse
filter mixed into a close view. This is an observable of the two time layers,
not a renormalization-group calculation.

The camera covers the stage and starts at 6 times that scale in the standalone
host. Zoom is visible beside the timeline, bounded from 0.4 to 16. Whole image
chooses a viewport-dependent scale that fits the smaller motif's proportions. Square
cells retain those proportions at every zoom. The camera retains its framing
on exact return; only a deliberate control change moves it.

Four adjustable inks encode negative-spin density. A fixed diagonal palette
coordinate `clamp((paletteUV.y-.23)*2.1+(paletteUV.x-.5)*.65,0,1)`,
where `paletteUV=(uv-.5)/0.14+.5`, moves through cyan `#24edff`,
violet `#8f5cff`, pink `#ff42b3`, and amber `#ffce50`, mixed in linear RGB.
The background defaults to navy `#090d20` and is also adjustable. These are
arbitrary display colors, not physical spectra. At the owner's request,
display version 5 retains a navy page background and vivid colors locally;
shared site CSS is unchanged. Palette changes do not alter either spin layer
or require rebuilding the sequence. The exported host parameters include all
four inks and the background in linear RGB.

The room renders linear RGB radiance into the host's `rgba16float` target and
multiplies it by host exposure. The standalone host uses unit exposure, a single
bounded identity tone map (clipping only above one), and one linear-to-sRGB
transfer into an unorm swap chain. There is no bloom, trail accumulation,
cosmetic dither, flow warp, audio, or network seed.

Diagnostics come from actual bits. Magnetization and correlations concern `x`.
Mean line run is the reciprocal of the fraction of unlike horizontal/vertical
bonds, not a connected-cluster radius. The entropy estimator averages binary
Shannon entropy of spin fractions inside 8x8 blocks. It is not microscopic
information loss. Diagnostics refresh about every 1.5 active seconds; Instruments
shows their age in executed steps. An initial measurement is available before
motion begins. A checksum accompanies the full comparison, never replaces it.

## Room interface and replay

`js/arrow-of-time-room.js` exports `roomInfo` and the required async `createRoom`.
The supplied device and target belong to the host. Imports do not touch the DOM,
configure a canvas, request a device, start animation, or fetch anything.
`step` submits integer updates with a bounded number of substeps. `render` adds
hierarchy and scene passes to the supplied encoder and never submits it.
`resize` is intentionally a no-op because render receives physical dimensions;
`dpr` is informational. Disposal releases only room-owned buffers. Host loss and
presentation handling are demonstrated in `js/arrow-of-time.js`.

Quality low is 256x256, medium is 768x512, high is 1024x768, and ultra is
2048x1536. The standalone host defaults to ultra, four times version 4's cell
count. `?quality=high` and `?quality=medium` retain the two earlier resolutions.
The reusable room retains its medium default. No physical scale is assigned.
`assetBaseURL` resolves to the supplied absolute URL or the module-relative
assets directory. The current motifs need no asset fetch. The host hex `seed`
is recorded but unused: constructor id and version identify the starting state.
There is no drand draw and no Verified randomness claim. Network seed failure
cannot interrupt the piece because no seed network request exists.

The room snapshot reports the API/version/model, full control counters, units,
quality, seed provenance, parameters, measured quantities, diagnostic age,
configuration id, and exact return result. `debugReadback` additionally returns
both complete byte and packed fields with the control state captured at the same
GPU submission. `setRate`, `setZoom`, `restart`, `seek`, and `measure` are optional
standalone extensions to the required interface. The slow readback is suitable
for correctness checks, not frame-by-frame rendering.

Save exact state exports row-aligned packed arrays, checksum, constructor id,
version, quality, parameters, direction, phase, cycle, preset index, cumulative
steps, orbit position, forward/inverse counters, hold time, fractional update
accumulator, active seconds, rate, zoom, and host pause/clock/adaptation counters plus the four linear-RGB ink colors and background.
`decodeReplay` validates a saved record and restores its microscopic fields.
Version-1, version-2, version-3, and version-4 packed records remain readable. For example, inside a
host with an existing device:

```js
import { decodeReplay } from './js/arrow-of-time-model.js';
import { createQ2RGPU } from './js/arrow-of-time-gpu.js';
const solver = await createQ2RGPU(device, decodeReplay(record));
solver.update(73, record.direction);
solver.update(73, -record.direction);
const computed = await solver.readback();
solver.dispose();
```

The standalone page exports state and the numerical helper restores it; there
is no user-facing file-import control. Integer equality is demonstrated on
this hardware against the CPU, not claimed for every GPU vendor without tests.

## Runtime and accessibility

The canvas uses most of the first viewport, with a compact title and 44px
controls below. The page starts automatically and silently. Reduced-motion preference starts
with the initial state held still and Play. Manual pause survives hidden tabs,
offscreen suspension, fullscreen changes, and Restart. The fixed host increment
is 1/60 ambient second; at most six increments are caught up in a frame. Large
wall-clock gaps are not simulated. Sustained slow frames first reduce that
catch-up budget, then reduce presentation pixel ratio. These changes affect
pacing or presentation resolution, never the lattice or microscopic rule.
Device pixel ratio begins capped at 3 for sharp Retina and high-density phone
presentation. Slow-frame adaptation keeps at least a 2x cap, so a 2x display
never becomes undersampled. A native 1x display still renders at 1x. The selected lattice stays fixed for
an entire exact-return cycle.

Resize and intersection observers, DOM listeners, GPU buffers/textures, the
animation request, and the host-owned device are released on page exit.
Missing WebGPU, missing adapter, shader failure, or device loss produces an
explicitly labeled still generated from the same CPU-prepared starting state.
The still displays the CPU-prepared cells through the same adjustable palette
and is not a recording or an alternative running model. Native fullscreen has a fixed-panel fallback.
Buttons and inputs use native keyboard behavior, visible focus, and 44px targets.
There is no compulsory camera motion. Portrait and landscape are supported.

## Verification

Run from the repository root:

```sh
node tools/test-arrow-of-time-model.mjs
NODE_PATH=/path/to/playwright-and-pngjs/node_modules node tools/test-arrow-of-time-browser.cjs
```

The browser harness serves local HTTP and owns the exact Chrome for Testing
child process, closing browser and server in `finally`. It uses
`/Users/ethan/.local/bin/agent-chrome-for-testing`, never the personal Chrome app.
`ARROW_CHECK_OUTPUT` selects the screenshots/results directory. `ARROW_QUICK=1`
runs initialization, numerical equivalence, and timing only.

The CPU suite exhaustively enumerates all 256 states on 2x2 and all 65536 states
on 2x4, checking both inverse compositions and energy. It checks all 16 neighbor
sign combinations, explicit periodic addresses, the three supplied mathematical
fixtures (committed separately under this room's assets), packing/padding, and
forward/inverse sequences for eleven sizes. The smaller sequences check energy
after every update; the new 2048x1536 tier checks packing, energy after 24
updates, and both full fields after 24 inverse updates. All integer comparisons
have zero tolerance. Motif bounds are checked at the new scale. The rectangular production tiers execute
96 forward and 96 inverse steps. During forward steps 73 to 96, paired-layer
density changes at 549,095 cells compared with 869,174 single-layer changes
at 768x512, a 36.8% reduction. At 1024x768 the corresponding counts are
1,103,785 and 1,811,588, a 39.1% reduction. These are measured cell changes,
not a photosensitivity certification.

The GPU suite compares full byte arrays and packed words against the CPU at
each of 24 steps on 2x2, 30x6, 32x8, 34x10, 66x4, 256x256, 512x512, 768x512, 1024x768, and 2048x1536. The small
cases include different time layers. It checks integer energy at every compared
step, and long 4320-forward/4320-inverse returns at all five larger sizes.
The solver computes those returns without any initial-reference dependency.
For all ten sizes, the previous-state rendering at interpolation zero must
match the pre-update image exactly, in both directions; midpoint interpolation
must stay within its endpoint radiances. Prepared timelines are checked against
an independent solver at nonsequential and word-boundary positions for all nine
sizes, including continuation under inverse updates.
The browser run watches three complete scored phrases at accelerated wall
pacing using all scheduled solver steps. The arrival's rendered interior pixels
must also match startup exactly. The browser additionally checks start, middle,
and end seeking; rapid pointer changes; keyboard seeking; Play after seeking;
drawing and four ink controls plus the background; custom CPU/GPU preparation equivalence; and
the full custom-image return. A separate visual check covers 6 default zoom,
zoom up to 16, Whole image, palette changes with both complete spin arrays
unchanged, 2x and 3x Retina target dimensions, the medium option and phone controls.
A separate run covers touch drawing, keyboard
drawing, an empty pad, erasing, and a custom-image device-loss still.

The browser suite checks 1440x900, 390x844, and 844x390, Instruments, pause/resume,
Restart, reduced motion, bounded zoom, state export and replay, native and fallback
fullscreen, manual-pause persistence, hidden and offscreen suspension, default
auto-start, missing WebGPU, and device-loss still handling. Validation and shader
errors fail the run. This is Chrome for Testing on real Apple hardware; actual
Safari and Android browser validation remains outside these checks.

## Measured performance

Measured on October 3, 2026, on an Apple M1 Pro, macOS 26.6.2, Chrome for
Testing, the Apple `metal-3` hardware adapter (not a software adapter). The
solver uses u32 packed spins and exact u32 hierarchy sums; the scene target is
rgba16float at 1440x600. Nominal update rate is 24 microscopic steps per active
second. Each mode has 32 samples with the first four discarded. GPU timestamps
measure a batch of 24 updates divided by 24, or just the scene fragment pass.
Submission/completion wall time additionally includes command construction,
queue overhead, and, for rendering, the full block hierarchy. It excludes the
standalone host's final display pass. This short desktop run includes substantial
latency outliers; these are retained in p95 rather than removed.

| Lattice | Work | GPU median / p95, ms | Submission/completion median / p95, ms |
|---|---|---:|---:|
| 256x256 | One microscopic update | 0.00308 / 0.00401 | 0.60 / 1.30 for 24 updates |
| 256x256 | Scene fragment render | 0.24383 / 0.54757 | 0.90 / 1.80 including hierarchy |
| 512x512 | One microscopic update | 0.00368 / 0.00449 | 0.70 / 2.20 for 24 updates |
| 512x512 | Scene fragment render | 0.25033 / 0.35879 | 1.00 / 1.80 including hierarchy |
| 768x512 | One microscopic update | 0.14603 / 0.20257 | 12.70 / 18.80 for 24 updates |
| 768x512 | Scene fragment render | 5.67804 / 10.85496 | 7.70 / 12.70 including hierarchy |
| 1024x768 | One microscopic update | 0.16053 / 0.28344 | 12.00 / 19.70 for 24 updates |
| 1024x768 | Scene fragment render | 6.30157 / 9.82423 | 7.90 / 15.00 including hierarchy |
| 2048x1536 | One microscopic update | 0.02236 / 0.09012 | 1.00 / 2.70 for 24 updates |
| 2048x1536 | Scene fragment render | 1.30015 / 1.73489 | 2.00 / 3.10 including hierarchy |

The standalone default is now 2048x1536. It and all three earlier tiers
are measured. The doubled paired-count hierarchy still fits the frame budget on
this hardware. The six measured default-resolution seeks, including complete
packed readback, took 10.5 to 11.8 ms. They are a small latency sample rather than
a cross-device guarantee. The initial energy matches the requested reference but
criticality and cross-vendor exact replay remain unproved. There are no
unfinished room-contract requirements.
Full machine-readable [verification results](../../assets/visualizer/arrow-of-time/verification.json)
include the numerical checks and the three completed physical phrases.

Owned files: `arrow-of-time-lab.html`, `arrow-of-time.css`, the five
`js/arrow-of-time*.js` modules, this document, the room's `fixtures.json` and
`verification.json`, and the two `tools/test-arrow-of-time-*` harnesses.
