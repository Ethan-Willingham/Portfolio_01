# Hunting rendering performance

Version 11 addresses the owner's 2026-10-03 report of slow FPS. The old renderer
resampled the large painted layers every frame and rewrote unchanged HUD text
and attributes. The new renderer reuses scenery sampled at display resolution
and updates UI values only when they change.

## Measured comparison

Local headless tests on a MacBookPro18,3, with a 1440 by 1000 viewport, device
pixel ratio 2 and the unchanged 2560 by 1440 backing canvas. Each mode samples
2.5 seconds of the real simulation, input, HUD and drawing loop. Scope detail
is loaded before measurement. The baseline serves the immutable version 10
runtime from commit `b06ca85b4af87dd7664ff10299852f8a15ae22b0` with the same
current harness and assets. The data is in `performance-v11.json`.

| Browser | Mode | Before FPS | After FPS | Before p95 frame interval | After p95 frame interval |
|---|---|---:|---:|---:|---:|
| Chrome for Testing | Wide view | 58.7 | 120.0 | 48.0 ms | 9.0 ms |
| Chrome for Testing | Steady scope | 61.3 | 120.0 | 33.8 ms | 9.1 ms |
| Chrome for Testing | Scope panning | 59.4 | 118.0 | 33.4 ms | 9.0 ms |
| WebKit | Wide view | 59.9 | 60.0 | 17.0 ms | 18.0 ms |
| WebKit | Steady scope | 60.3 | 59.6 | 17.0 ms | 18.0 ms |
| WebKit | Scope panning | 60.0 | 57.8 | 18.0 ms | 17.0 ms |

An earlier pair of runs measured Chrome at 62 to 69 FPS before and 118 to 120
after. WebKit's panning varied from 51 to 60 FPS before and around 58 after.
These short runs establish a substantial Chrome gain. They do not establish a
WebKit FPS gain or predict every device's frame rate. WebKit stays near 60 FPS
in this environment. Background activity and refresh scheduling affect results.

During the recorded 2.5-second modes, redundant HUD mutations fell from 2,058
to 2,311 per mode to zero to two. Stationary scenery requires zero cache rebuilds
after priming. Continuous scope panning rebuilt 16 or 17 layer canvases, rather
than resampling every layer on every frame. JavaScript draw submission remains
small in both versions; its timing alone misses browser raster/compositor work.

## Rendering contract

- Preserve all existing source assets, native tile dimensions, authored colors,
  the 6x camera and backing-canvas resolution. Apply no lighting filters.
- Cache raw sky, terrain and foreground stand separately so the sun, moon,
  stars, wildlife, bullets, trails and reticle remain live.
- Copy cached display pixels at 1:1 scale. Scope caches have 96 logical pixels
  of horizontal guard coverage and 54 vertical pixels on each side. Rebuild
  before the camera consumes three quarters of either guard area.
- Rebuild for changed canvas dimensions, zoom or ready detail tile IDs. Select
  native detail tiles for the visible lens plus guard coverage. Late tile loads
  invalidate terrain, including while paused.
- Release the stand buffer while scoped and painted sky/terrain buffers on
  Cypress. Keep at most three layer buffers. At the largest display size the
  wide buffers hold 11,059,200 pixels; the two scope buffers hold 12,460,032
  pixels, about 48 MiB at four bytes per pixel, excluding browser overhead.
  The existing six decoded native-tile limit is separate and still enforced.
- Use an opaque main canvas. Scenery layer caches retain alpha for compositing.
- Keep the simulation's fixed step and real elapsed time. Do not cap animation
  FPS or change animal speed, flight, save state or clock behavior.

## Repeatable checks

Use the bundled Playwright packages through `NODE_PATH` where needed:

```sh
DUMP=/tmp/hunting-before node tools/test-hunting-browser.cjs --benchmark --baseline b06ca85b4af87dd7664ff10299852f8a15ae22b0
DUMP=/tmp/hunting-after node tools/test-hunting-browser.cjs --benchmark
node tools/test-hunting-browser.cjs
```

Run the two benchmarks sequentially to avoid competing test browsers. The
harness closes each owned browser process in `finally`; it uses the dedicated
Chrome for Testing wrapper and never launches the owner's personal Chrome.
Benchmark output includes FPS, p95 frame intervals, JavaScript draw submission,
HUD mutations and scenery rebuild counts. Do not set a fixed FPS assertion.

All 120 browser checks pass, including painting color comparisons at 05:30,
06:47, noon and night, four scope detail targets, real mouse/touch shots,
fullscreen, phone layouts, saves and the Retina canvas. Cache reuse and memory
are checked directly. The eight campaign and 22 physics checks also pass.
