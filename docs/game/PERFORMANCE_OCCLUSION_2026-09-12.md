# Hidden terrain and mixed-refresh pacing

Version: v26.128. Baseline: v26.127, commit `44f4131`.

The portrait test exposed a large source of wasted rendering: cached terrain
and live tile artwork were drawn deep below the surface, then covered by fully
opaque black fog. This pass skips those hidden draws. Terrain resolution,
filtering, visible artwork, physics and graphics presets retain their values.

## What the broad isolation found

The Windows display modes were 2560 x 1440 at 144 Hz and 1080 x 1920 at 75 Hz.
The portrait browser window contained a 1035 x 1663 game canvas. Its world view
was about 1386 world pixels tall, much taller than the landscape view. That
made hidden underground rendering particularly expensive.

Each screening capture used 30 seconds of the same uneven keyboard route:
driving, short thrusts, coasting, reversals, landings and digging. These were
real input events, with no position or velocity writes during the route.
The GPU captures ran sequentially, with audio, diagnostics and the clock active,
and without CPU sampling or GPU timer queries. Separate fresh profiles protected
the player's saves and settings.

For the following captures, the presentation intervals matched the 75 Hz
display cadence. A late displayed frame exceeded 18 ms, or 1.35 refresh periods.

| Diagnostic change | Late displayed frames |
| --- | ---: |
| Full game baseline | 39.12% |
| Remove smoke | 34.63% |
| Remove scene drawing, retaining smoke and water | 0.00% |
| Remove terrain chunk drawing only | 1.50% |
| Snapshot terrain canvases into ImageBitmaps | 41.99% |
| Skip fully hidden terrain, production culling algorithm | 9.93% |

The last row reduced frequent missed refreshes by about 75% in this screening
comparison. It retained the two-tile safety margin and normal chunk warming.
The temporary subsystem removals and ImageBitmap experiment are not shipped.
The earlier one-tile culling prototype, which also skipped cache warming,
reached 6.47%; it is not the released behavior.

This identifies terrain drawing as the largest causal contributor in this
portrait route. It does not assign an exact GPU duration to each draw. Canvas
rasterization, image filtering, graphics synchronization and composition are
not fully represented by JavaScript call durations.

## What changed

The existing fog image is prepared before drawing terrain. A small summed-area
table records which fog texels are not fully opaque. Terrain chunks and tile
decorations can then test a rectangle with four array reads. A two-tile margin
preserves filtered boundaries and artwork extending beyond a tile.

Only fully black coverage permits rejection. Translucent or disabled fog,
loading, stale lighting, a different drawing surface or camera, and views beyond
the world's hard side/bottom limits retain the ordinary drawing path. Mining
updates visibility before the next render. Chunk warming and invalidation still
run for hidden chunks, so this does not defer their preparation until a cave
opens. The fog image itself is unchanged.

The overlay now calls its percentage **Callback gaps**, shows the observed
callback reference, and explains that this is not physical displayed-frame
measurement. The old best-rate reference resets when the display context
changes. This changes the interpretation of the diagnostics, not the game's
frame scheduler or the thresholds used to paint the graph.

## Measurement limits and the main monitor

The minimal portrait control produced 144 animation callbacks per second while
the monitor displayed 75 frames per second with zero missed refreshes. Therefore
the old overlay's 99% jank number cannot be read as 99% visibly stuttering frames.
The measured browser callback clock and physical monitor clock differ here.
Chromium's [Windows VSync provider](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/gl/vsync_provider_win.cc)
also documents separate DWM and monitor timing sources.

Later portrait presentation captures reported intervals from incompatible
clocks, including more positive displayed-frame records than a 75 Hz screen
could show. Native window coordinates confirmed the test window was fully on
the portrait display. Those captures are retained in the JSON but excluded from
displayed-stutter improvement claims. This pass did not establish the precise
cause of that presentation-capture discrepancy. The 75% figure above is from
the culling screening comparison, before the diagnostic-label and stale-context
guard additions, rather than a claimed final-package portrait result.

A separate 30-second comparison on the 144 Hz primary monitor used a
2560 x 1440 game canvas and hardware independent-flip presentation:

| Metric | Baseline | Culling build |
| --- | ---: | ---: |
| Late displayed frames | 2.02% | 1.42% |
| Display interval p99 | 13.90 ms | 13.89 ms |
| Display interval p99.9 | 27.75 ms | 27.73 ms |
| Intervals over 20 ms | 11 | 12 |
| CPU frame mean | 2.48 ms | 2.44 ms |

This is a smaller improvement on the main monitor, based on one short pair,
not a claim that rare hitches have disappeared. The hard-world-edge fallback
was added after this capture and is covered by the correctness tests. Average
FPS and the p99 tail alone would obscure the reduction in frequent misses.

## Remaining measured costs

These are non-overlapping top-level CPU wall-time buckets from the portrait
culling candidate. They include waits inside graphics calls. Parent render
totals and nested smoke/mountain/player buckets are excluded from this ranking.

| Rank | Phase | Mean | p99 |
| --- | --- | ---: | ---: |
| 1 | Smoke update and collision masks | 0.680 ms | 3.5 ms |
| 2 | Sky and background submission | 0.413 ms | 2.8 ms |
| 3 | Rig and effects | 0.341 ms | 1.0 ms |
| 4 | HUD | 0.272 ms | 1.4 ms |
| 5 | Terrain chunks | 0.242 ms | 2.5 ms |
| 6 | Live tile artwork | 0.239 ms | 0.5 ms |
| 7 | Liquid update | 0.219 ms | 0.8 ms |
| 8 | Liquid drawing | 0.182 ms | 0.8 ms |

The next useful rendering target is the remaining visible terrain submission
and filtering, followed by the smoke-mask and sky spikes. The broad terrain
removal gives a useful upper bound for that particular scene, not a forecast
of a visually equivalent implementation. Rare stalls outside the measured game
call still need presentation/driver attribution. There is no measured ceiling
for how much of that tail can be removed, and no evidence here that a language
or engine rewrite is required.

## Verification and reproduction

`tools/perf/fog-occlusion.mjs` compares real cached terrain and deliberately
oversized tile decorations with culling enabled and disabled. Two seeded worlds
cover portrait, landscape and small viewports, fractional camera positions,
sealed caves, newly opened shafts, wide light reach, soft/crisp fog, partial
opacity, disabled lighting and hard world boundaries. Every compared channel
must match exactly. The fixtures also require nonzero rejected chunks/tiles.
All 40 pixel comparisons passed with zero changed channels. Loading and
stale-reference guards are checked separately.

The assembled bundle is parse-checked, the shared toy engines are verified,
and the existing 25 scroll checks, 20 overlay checks and 84 loading checks
passed. The desktop package
is rebuilt and its offline boot, saved options, isolation and fullscreen
controls are checked with a disposable profile.

`tools/perf/audit-sluice.mjs` now supports window placement and fullscreen
selection, records the display reference and window bounds, and captures hidden
terrain counts. `tools/perf/summarize-input-run.mjs` reports refresh-relative
late frames and a fixed-rate cadence consistency check. A VRR capture requires
separate interpretation; that consistency check is not a universal validity
test. Use an OS-verified `REFRESH_HZ`, not the game's observed callback rate.

Measurements and validation results are in
[performance-occlusion-2026-09-12.json](performance-occlusion-2026-09-12.json).
