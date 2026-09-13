# Sluice smoothness pass

v26.127 reduces frequent missed display refreshes by about **64%** in the
controlled browser comparison. Display intervals over 8 ms fell from 7.29% to
2.65%. The rarer long pauses remain. This is a measured improvement in these
routes, not a guarantee of uninterrupted 144 Hz in every save and scene.

[Measurement data](performance-smoothness-2026-09-12.json) includes individual
runs, aggregate frame distributions, rankings, experiments, and coverage checks.

## The change

The smoke collision-mask painter was replaying hundreds of Canvas tile and
cave-contour commands as the camera moved. Its JavaScript duration understated
the effect on frame delivery: the browser also had to rasterize those commands.

The static terrain portion now uses a bitmap anchored to world coordinates.
Camera motion draws from that bitmap at full fractional precision. A four-tile
window and extra margins allow reuse between window crossings. The bitmap is
twice the destination mask's sampling density, reducing additional edge filtering.
Actual tile coverage and the shared contour path are checked before reuse, so
mining, bombs, save loads, material edits and shape tuning invalidate it.

Water coverage and moving slime boundaries keep their existing updates. Smoke
resolution, solver cadence, pressure iterations, emissions and lighting retain
their values. The terrain artwork, vehicle physics and graphics presets do not
change. Zoom transitions, hard world boundaries and oversized dev queries use
the original painter. The cache is bounded to one bitmap, with a 4096-pixel
limit per axis and a 65,536-cell limit.

In the second final capture, 6,360 mask paints required only 107 static-terrain
rebuilds between scene start and end, including warmup. That avoided 98.3% of
those repeated terrain rasterizations. The retained bitmap was 1866 x 1610,
about 11.5 MiB of RGBA storage, excluding the browser's additional allocations.

## Browser measurements

Windows, i7-9700K, RTX 3080, 144 Hz, Chrome 152.0.7977.83. Extreme graphics,
2560 x 1440 actual canvas, diagnostics and audio engine active. Output audio is
muted. The clock starts at 0.02 and advances. CPU sampling and GPU queries are
off for these timing captures; PresentMon observes actual displayed intervals.
Every run remained focused and visible and used Hardware Composed: Independent
Flip throughout.

Four sequential 45-second captures ran in baseline, candidate, candidate,
baseline order. Each used the same uneven keyboard route: 47 input changes,
driving, short thrusts, releases, corrections, coasting, digging, and water
entry. Each covered roughly 3,080 world pixels horizontally and included
multiple landings. Positions and simulation state were not pinned. Small
trajectory differences remain because input scheduling and frame timing vary.

| Measure, 90 seconds per build | v26.126 | v26.127 |
|---|---:|---:|
| Display intervals over 8 ms | 877 / 12,026 (7.29%) | 333 / 12,579 (2.65%) |
| Estimated missed refresh slots | 929 (7.17%) | 373 (2.88%) |
| Display p99 | 13.928 ms | 13.903 ms |
| Display p99.9 | 27.747 ms | 20.861 ms |
| Display intervals over 20 ms | 31 | 24 |
| Display intervals over 33 ms | 7 | 5 |
| Worst display interval | 41.672 ms | 34.758 ms |
| CPU mean | 2.624 ms | 2.543 ms |
| CPU p99 | 5.3 ms | 5.1 ms |
| Worst CPU frame | 8.1 ms | 8.6 ms |

Individual over-8-ms rates were 6.89% and 7.69% for the baseline, and 2.87%
and 2.43% for the candidate. The large reduction in ordinary missed refreshes
appears in both comparisons. There are too few long stalls here to claim a
reliable reduction in their frequency. The p99 is still about two refresh
intervals, so the game has not reached uninterrupted delivery.

An interval over 8 ms is a practical missed-refresh indicator at 144 Hz.
Estimated missing slots sum rounded multiples of 6.944 ms minus one for each
displayed interval. These are different metrics from the in-game rolling jank
percentage. They also differ from time executing JavaScript or GPU shaders.

## Desktop check

A separate 30-second pair in Electron 44.3.0 (Chromium 152.0.7977.78), using
the desktop launcher and the same route/settings, supports the browser result:
over-8-ms display intervals fell from 10.93% (423/3870) to 3.72% (154/4138),
about 66% fewer by rate. Both stayed in independent flip, focused and visible.
Long intervals over 20 ms remained at 14 in each run; the worst interval rose
from 34.75 to 41.69 ms. This smaller desktop sample demonstrates the frequent
stutter improvement, not a fix for rare long pauses. It uses the local audit
server; the packaged shortcut build also receives a separate offline boot check.

## Remaining costs

The final route's largest non-overlapping CPU stages were:

| Rank | Work | Mean | p99 |
|---|---|---:|---:|
| 1 | Smoke update, including collision mask | 0.433 ms | 1.9 ms |
| 2 | Sky and background composition | 0.378 ms | 2.1 ms |
| 3 | Terrain chunks | 0.331 ms | 2.4 ms |
| 4 | Rig, slimes and flight effects | 0.286 ms | 0.9 ms |
| 5 | Individual tiles | 0.256 ms | 0.5 ms |
| 6 | Liquid update and submission | 0.237 ms | 0.8 ms |
| 7 | HUD | 0.202 ms | 1.1 ms |

Total rendering is 1.646 ms, a parent of several rows above. Smoke's 0.310 ms
mask stage and the new 0.145 ms static-terrain stage are nested inside smoke
update. Do not add them again. GPU-process rasterization and presentation waits
are not included in these CPU timings. This pass did not remeasure a complete
GPU-stage ranking; the previous report's shader timings are separate evidence.
These rankings describe this surface/input route. Active slime piles, deeper
caves and other saves can have different dominant costs.

The next target is the remaining long display stalls and work around frame
submission. The current data does not identify one function that accounts for
all of those pauses. Lowering graphics settings or changing language/engine
would not follow from this measurement alone.

## Experiments

Initial 30-second diagnostic captures used the same route. These isolate work;
their omitted rendering/collision features are not production options.

| Experiment | Display intervals over 8 ms |
|---|---:|
| Original v26.126 | 6.00% |
| Skip only smoke-mask upload | 6.42% |
| Skip smoke display, retaining simulation | 4.91% |
| Display atmospheric sky as a separate DOM canvas | 6.72% |
| Skip entire smoke-mask painter | 1.18% |
| Skip only water contribution to mask | 5.66% |
| Combine terrain rectangles into one Path2D | 19.18% |
| Explicitly flush smoke GL commands after update | 7.04% |
| Merge terrain rectangles into horizontal runs | 4.35% |
| Cache the static terrain bitmap | 1.71% |

Only the bitmap cache progressed to the final longer comparison. The narrow
upload bypass did not reproduce the benefit of skipping the painter. Combined
with the cache result and the previous GPU-process trace, this supports repeated
terrain rasterization as a cause of frequent missed refreshes. It does not
establish the internal cause of every remaining driver or compositor stall.

## Appearance and validation

Caching changes antialias coverage in the smoke collision mask, so this is not
a byte-identical mask substitution. Across two seeded worlds and 64 comparisons,
fewer than 0.10% of mask pixels changed solid/empty classification in any case.
Mean alpha difference stayed below 2.18 out of 255. Interior changes remained
within two mask texels of the reference boundary. Border pixels contribute to
the error totals but are excluded from the distance test because its full
neighbourhood lies outside the readback image.

Cached results matched forced fresh rebuilds exactly after travel, excavation,
material edits, shape tuning and scale changes. Tests also require nonempty
water and body fixtures to contribute coverage. Direct zoom fallback matched
the original painter exactly. Hard world edges retain direct painting after
the initial edge-coverage investigation. A test's first distance check counted
clipped image-border neighbourhoods as interior failures; recording their
coordinates exposed that test issue, and the final check treats borders
explicitly. The coverage and total-error limits were not loosened.

The test harness can now serve a committed bundle with `BUNDLE_REF`, while
retaining the checkout's other assets. Those assets are identical for the two
builds used here. It hashes the exact bundle served, rather than rereading a
possibly changed working file at capture completion. `BUNDLE_REF=4bcb99e`
selects the baseline. Normal captures use `SCENES=human`, `SECONDS=45`,
`PROFILE=0`, `HEADED=1`, `WIDTH=2048`, `HEIGHT=1152`, `DPR=1.25`, `OVERLAY=1`,
`AUDIO=1`, `CLOCK=1`, and `TOD=.02`; `PRESENTMON` points to the executable and
`DUMP` to a directory outside the checkout.

Startup and graphics-switching validation passed all 84 checks. All 37 isolated
water-mask comparisons remained byte-identical. The new source
and assembled bundle parse successfully, and the shared toy engine check
confirms identical embedded engines with current version stamps.
