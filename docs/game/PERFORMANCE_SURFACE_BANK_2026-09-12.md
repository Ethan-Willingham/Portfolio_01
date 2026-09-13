# Sluice surface bank performance pass

Version v26.124, compared with v26.123 at `b1cb81c`. This continues
[the renderer pass](PERFORMANCE_RENDERER_2026-09-12.md). Full numerical results,
CPU rankings, and diagnostic experiments are in
[the measurement data](performance-surface-bank-2026-09-12.json).

## Fullscreen frame delivery

Measured sequentially on the owner's i7-9700K and RTX 3080, Windows, Chrome
152.0.7977.83, Extreme graphics, 2560 x 1440 canvas, 144 Hz monitor. PresentMon
captured display changes on the game's GPU process principal swap chain. Each
scene had three seconds of warmup and eight seconds of measurement. The overlay
was hidden. These are individual controlled captures, not confidence intervals
or a replay of the owner's save.

| Scene | Displayed FPS before | After | Intervals over 8 ms, before -> after | Display p99 after |
|---|---:|---:|---:|---:|
| Continuous surface drive | 109.9 | 128.7 | 30.7% -> 11.9% | 13.92 ms |
| Slime pen | 102.4 | 122.8 | 40.7% -> 17.2% | 13.95 ms |
| Hover over lake at night | 140.6 | 144.0 | 2.4% -> 0.0% | 7.00 ms |

Surface driving gained about 17% displayed FPS. Slow display intervals became
much less frequent, but the surface still misses refreshes. The pen also remains
below a steady 144. The lake's clean sample does not establish a permanent lock.
Driving continued throughout both captures; the pen and lake fixtures pin the
rig's position. Slime and water state can vary between runs.

## The change

The irregular cut-bank contour was used as a clip for the entire topsoil wall,
including hundreds of screen pixels below its edge. JavaScript spent little
time submitting this work, but Canvas paid a substantial raster cost later.
Removing only that clip during diagnostic tests largely removed the bottleneck.

The release keeps the contour and restricts its complex clip to the narrow strip
that contains the surface edge. A second pass paints the wall below it using a
rectangle. The dividing line is aligned to native pixels, including fractional
zoom and camera shake. Views without an applicable split use the original path.
The wall texture, roots, lighting, parallax, terrain, resolution, effects, and
physics settings retain their previous definitions.

## Remaining costs

These are ranked, non-overlapping **main-thread** groups from the final
fullscreen captures. They include API submission and waiting inside calls, not
just arithmetic. They are not a ranking of hardware GPU execution time. Nested
timers such as `jello.contact` and `update.smokeObstacle` are already inside their
parent groups and must not be added again.

| Rank | Continuous driving group | Mean per frame |
|---|---|---:|
| 1 | Smoke update and submission | 0.594 ms |
| 2 | Terrain chunks | 0.455 ms |
| 3 | Water update and rendering submission | 0.421 ms |
| 4 | Live tile details | 0.298 ms |
| 5 | Rig, effects, and lighting | 0.262 ms |

Near the slime pen, slime physics and rendering become first at **1.787 ms**,
followed by live tile details (0.344 ms), terrain (0.332 ms), and water (0.329 ms).
The complete rankings and individual timer percentiles are in the JSON.

Average driving CPU time barely changed, 2.98 to 3.01 ms, despite the display
improvement. This again shows why sorting JavaScript timers alone misses the
largest rendering problems. There is not yet a reliable, complete per-stage GPU
ranking for the remaining frame. Slime refraction, Canvas composition, and moving
smoke obstacle masks remain useful targets for another measured pass.

## Experiments kept out of the release

The exploratory tests used a **3200 x 1800** canvas, because the 2560 x 1440 CSS
viewport was multiplied by DPR 1.25. They are a separate stress workload and
must not be presented as the physical 2560 x 1440 fullscreen result above.

Reusing terrain through ImageBitmap, culling additional chunk blits, caching
foundation tiles, taking a shared slime refraction snapshot, and copying smaller
refraction regions produced no reliable live-scene improvement. Collision rest
caches were slower. A conservative no-contact fast path helped separated-body
microbenchmarks but hurt the real pen workload. Hoisting contact-loop lookups
passed 2,000 exact solver comparisons but did not demonstrate a frame-delivery
gain in the live scene. These candidates were excluded.

## Validation and desktop delivery

The focused comparison renders the old and new underground passes across 180
combinations of camera position, surface height, zoom, lighting, and shake.
It checks the contour separately from interior texture resampling and records
raw pixel differences. Canvas uses different raster paths for the two clip
types, so this is not a claim of byte-identical output.
The contour differs by at most one 8-bit level. Interior texture resampling
differs by at most five; the largest frame-average channel difference is 0.0132
levels. A larger difference, up to 39, occurs at the outer viewport border
during fractional shake. The worst interior comparison was also inspected
visually. All 18 existing surface-transition checks passed across 21 views.

The separate five-second headless regression sweep measured cave at 144.0 FPS,
deep chamber at 143.6, storm at 119.1, and night ascent at 144.0, with no game
errors. These callback measurements are not physical display measurements and
have no fresh paired baseline in this pass.
The scrolling suite passed 25 checks over 1,201 frames with no background
reversals or cold soil builds, plus 20 overlay, cache, raster, and hover checks.

The captured bundle digests remain in the data. Final source cleanup removed
trailing spaces from one blank line after the display capture; it did not change
the implementation. The release digests identify the cleaned bundle, both with
local line endings and after Git normalizes them.

The Windows desktop package receives the same v26.124 bundle. Its offline boot,
local assets, version stamp, persistent options, sandbox, and fullscreen toggle
are verified separately from the Chrome performance captures. A `Sluice.lnk`
shortcut on the owner's desktop opens the portable `Sluice.exe` build. No Steam,
Proton, or Steam Deck compatibility result is implied by that Windows test.

To reproduce the physical comparison, run `tools/perf/audit-sluice.mjs` with
`WIDTH=2048`, `HEIGHT=1152`, `DPR=1.25`, `HEADED=1`, `SECONDS=8`,
`SCENES=drive,pen,nightpond`, and `PRESENTMON` pointing to PresentMon 2.5.1.
Use `ROOT` for the baseline checkout and separate `DUMP` folders outside either
checkout. Run builds sequentially on an otherwise idle GPU. The dedicated pixel
test is `tools/perf/surface-bank-equivalence.mjs`, with `PLAYWRIGHT_MODULE` set to
the installed Playwright module and optional `DUMP` and `BASE_REF` overrides.
