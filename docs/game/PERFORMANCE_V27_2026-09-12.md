# v27: visible terrain and slime smoothness

Baseline: v26.128, commit `2ca95653460b438b91cb9c57f8120c74dfbc158c`.
The paired results below use the final v27 game bundle. Its normalized SHA-256,
individual captures, cost distributions and correctness results are in
[the measurement data](performance-v27-2026-09-12.json).

v27 reduced frequent missed refreshes on the tested surface route. The slime
pen improved modestly. Occasional large presentation gaps remain, and the
surface's rarest tail did not improve. This release does not establish an
all-green experience or an exact cause for every remaining display gap.

## Browser results

Chrome 152.0.7977.83, i7-9700K, RTX 3080, main 144 Hz display, fullscreen
2560 x 1440 game canvas, default graphics, audio engine, diagnostics and day
clock active. Each cell pools two 30-second captures. The surface order was
baseline, release, release, baseline. The pen baselines and final release
captures were separated by correctness checks and browser-capture repair,
so its smaller effect is more exposed to changing system conditions.

PresentMon recorded the browser GPU process. The dominant swapchain used
hardware composed independent flip; all included positive presentation
intervals matched the 144 Hz cadence within 1 ms. A late interval exceeds
9.375 ms, or 1.35 refresh periods. These are presentation records, not a
photodiode measurement and not the in-game callback-gap percentage.

| Metric | Surface before | Surface v27 | Slime pen before | Slime pen v27 |
| --- | ---: | ---: | ---: | ---: |
| Late presentation intervals | 5.96% | 3.64% | 29.37% | 27.61% |
| Late intervals / recorded intervals | 482 / 8,092 | 301 / 8,274 | 1,946 / 6,625 | 1,856 / 6,721 |
| Display interval p99 | 13.93 ms | 13.92 ms | 13.97 ms | 13.97 ms |
| Display interval p99.9 | 27.78 ms | 34.70 ms | 34.74 ms | 27.81 ms |
| Display interval maximum | 41.67 ms | 41.72 ms | 41.65 ms | 41.68 ms |
| Display intervals over 20 ms, per 60 seconds | 38 | 30 | 36 | 35 |
| Display intervals over 33 ms, per 60 seconds | 6 | 9 | 9 | 6 |
| CPU frame mean | 2.77 ms | 2.73 ms | 4.54 ms | 4.52 ms |
| CPU frame p99 | 5.7 ms | 5.5 ms | 7.4 ms | 7.6 ms |

The surface rate fell by 2.32 percentage points, about 39% fewer frequent
misses relative to its baseline. The pen fell by 1.76 points, about 6%.
Individual final surface rates were 3.68% and 3.60%, versus 6.46% and 5.46%.
Final pen rates were 27.61% and 27.62%, versus 29.01% and 29.74%.
The surface's over-33-ms count rose from six to nine. Those small counts
cannot support a claim that rare hitches were eliminated.

The keyboard routes use uneven thrusts, coasting, reversals, landings and
ground contact. The surface route also attempts digging. In the pen, each
gesture observes the rig's position and turns back near the pen's edges.
Only the initial pose is set; positions, velocities, camera and collisions
are not overwritten during input. Real timestep-dependent collisions mean
the trajectories are similar workloads rather than identical simulations.
Both final pen captures exercised awake slimes and body contacts.

No desktop package or Proton work was performed in this pass. No physical
portrait-monitor performance tests were performed.

## Released changes

### Terrain submission and filtering

Up to four adjacent ready terrain chunks share a cached horizontal strip.
Their original bitmap pixels are copied at 1:1 scale, and the final draw
retains high-quality filtering, full resolution and fractional camera motion.
This reduces repeated filtered chunk submissions without lowering the
graphics preset or changing the terrain artwork.

The optimization applies to integer chunk-cache scales. Fractional scales
retain their existing direct draw path: the initial fractional-scale
experiment changed edge sampling more than this pass should accept. Window
sizes or zoom levels using a fractional cache scale will therefore get less
terrain benefit than these fullscreen captures.

The cache holds at most 24 strips and 32 MiB of strip bitmap storage, plus
bounded references to their source chunks. At most two strips are rebuilt
per frame. Large lit views retain their hot strips and draw the remainder
directly, avoiding eviction/rebuild churn. Dirty chunks and world/cache resets
invalidate strips by source identity and paint version. Cold or changed
strips fall back to current individual chunks instead of delaying drawing.
Existing fog culling and terrain warming remain in place.

In the final surface route, terrain submission averaged 7.45 strip draws
plus 1.92 direct chunk draws per frame, with 0.034 strip builds per frame.
Peak strip bitmap storage was 31.59 MiB. The measured benefit was mostly in
presentation delivery; mean terrain CPU duration changed only slightly.

### Slimes

The contact solver rejects separated spatial-hash candidates before reading
same-body rest geometry or phase-mate relationships. The exact distance gate,
accepted-pair order, solver arithmetic, iterations and physics settings stay
the same. Two thousand old/new solves were byte-identical across 200 scenes,
including mixed contact radii, sparse and dense contacts, self-contact,
phase mates, negative coordinates and invalid points.

The drawn outline is shared between clipping and edge strokes through a
Path2D. Its cache compares the actual baked coordinates and smoothing mode,
so deformation, ripples and live tuning invalidate it. Material animation,
refraction, fuzz, shading and simulation continue normally.

In the pen, mean contact time fell from 0.726 to 0.585 ms. Mean slime drawing
rose from 0.923 to 0.982 ms, while combined slime update and drawing fell
only from 2.046 to 2.013 ms. The full-game captures do not establish a
separate drawing-time win for outline reuse. A single old-painter isolation
run suggested a small CPU benefit, but its display result was within the
variation between runs. It is not used as a headline gain.

## Remaining costs, ranked

These are elapsed main-thread bucket durations in the final browser captures.
Canvas/API synchronization waits can be included; asynchronous GPU work and
compositor scheduling cannot be assigned from these numbers. Nested buckets
are not added twice. The rankings cover the major measured groups, not every
small simulation or instrumentation cost, and their p99 values are not additive.

| Rank | Surface group | Mean | p99 |
| --- | --- | ---: | ---: |
| 1 | Terrain chunks and tile details | 0.569 ms | 2.7 ms |
| 2 | Smoke update and drawing | 0.493 ms | 2.1 ms |
| 3 | Sky and background | 0.433 ms | 2.2 ms |
| 4 | Water update and drawing | 0.389 ms | 1.0 ms |
| 5 | Rig and other foreground effects | 0.256 ms | 0.6 ms |
| 6 | HUD and diagnostic overlay | 0.221 ms | 1.4 ms |
| 7 | Other world entities | 0.055 ms | 0.4 ms |
| 8 | Slime physics and drawing | 0.041 ms | 0.6 ms |
| 9 | Fog preparation and drawing | 0.021 ms | 0.2 ms |

| Rank | Slime-pen group | Mean | p99 |
| --- | --- | ---: | ---: |
| 1 | Slime physics and drawing | 2.013 ms | 3.9 ms |
| 2 | Terrain chunks and tile details | 0.593 ms | 0.9 ms |
| 3 | Smoke update and drawing | 0.412 ms | 1.4 ms |
| 4 | Sky and background | 0.393 ms | 1.7 ms |
| 5 | Water update and drawing | 0.326 ms | 1.0 ms |
| 6 | HUD and diagnostic overlay | 0.254 ms | 1.5 ms |
| 7 | Rig and other foreground effects | 0.223 ms | 0.5 ms |
| 8 | Other world entities | 0.052 ms | 0.3 ms |
| 9 | Fog preparation and drawing | 0.017 ms | 0.2 ms |

Slimes consume about 45% of the measured CPU frame near the pen, split
roughly evenly between update and drawing. They remain the clearest local
CPU target there. Away from them, terrain remains first among the measured
groups. The surface's 2.73 ms mean CPU frame also leaves a substantial part
of the 6.94 ms refresh budget outside these CPU calls. Further work should
correlate long presentation gaps with GPU/raster/compositor events before
choosing another renderer change. These tests do not prove that rewriting
JavaScript, changing engines, or moving to Proton would remove those gaps.

## Validation and exclusions

- 240 old/new render comparisons: 48 terrain and 192 slime combinations.
  Fractional terrain cache scales were pixel-identical. Integer batching's
  nontrivial differences stayed within chunk-join filtering footprints.
  Default slime edge-style cases were pixel-identical. One classic-rim case
  had mean channel error 0.095 on a 0-255 scale, with 0.101% of channels
  differing by more than eight; visual inspection found no material change.
- Two thousand byte-identical contact solves; isolated solver benchmarks
  improved by 2.2% to 12.7% across the four tested sizes/contact layouts.
- Twenty exact fog-coverage comparisons with batching disabled in the fixture
  to isolate coverage correctness; the full pipeline is covered above.
- Twenty-five scrolling checks and twenty overlay/cache/raster/hover checks.
- Eighty-four loading checks and a clean shared water/smoke/slime toy boot.
  The loading harness now waits for its controller script as well as markup;
  this repaired a test parsing race, without changing production loading code.
- JavaScript syntax checks, shared toy-engine source synchronization and diff checks.

Two final slime capture attempts were excluded. One recorded no game frames
and no presentation CSV. The next reported a hidden document and zero
animation-loop calls, then failed loading. The harness now brings its page
forward and checks a live, visible, focused loop before capture. One successful
repeat, `pen-final-f`, includes an extra visibility query and Page.bringToFront
call during capture; all its recorded frames stayed focused and visible.
`pen-final-g` ran without that extra inspection. No hidden-frame failure is
interpreted as slow game performance.

Earlier unbounded pen experiments let the rig travel away from the slimes
and made drawing look cheaper. They remain in the data as screening captures,
but are excluded from the paired result. Pre-final bounded runs also remain
separate because the final cache-admission guard had not yet been added.

## Reproduce

Run `tools/perf/audit-sluice.mjs` sequentially with `SCENES=human` or
`SCENES=human-slimes`, `SECONDS=30`, `HEADED=1`, `WIDTH=2048`, `HEIGHT=1152`,
`DPR=1.25`, `OVERLAY=1`, `AUDIO=1`, `CLOCK=1`, `TOD=.02`, `PROFILE=0`,
`REFRESH_HZ=144`, and `PRESENTMON` pointing to PresentMon 2.5.1. Set `DUMP`
outside the repository, use a fresh output directory per capture, and set
`BUNDLE_REF=2ca9565` for the baseline. Leave it unset for v27. Keep the main
display visible, focused and otherwise idle during each capture.

`summarizeInputRun` in `tools/perf/summarize-input-run.mjs` accepts the output
directory, duration limit and scene name. Pool raw CPU frames and positive
display intervals across like-for-like captures; calculate rates from pooled
counts rather than averaging rounded percentages. Correctness entry points
are `terrain-slime-render.mjs`, `slime-contact-equivalence.mjs`,
`fog-occlusion.mjs`, `scroll-smoothness.mjs`, and
`tools/sluice-loading-smoke.mjs`. Browser tooling uses Playwright where needed.
