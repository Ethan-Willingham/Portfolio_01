# Sluice input and frame-delivery audit

v26.126, compared with v26.125 at `4ae845d`. The smoke display pass is cheaper,
but this pass does **not** demonstrate a reduction in long display stalls.
The new input tests reproduce uneven delivery away from active slimes. The
[measurement data](performance-input-2026-09-12.json) records final captures,
intermediate experiments, exclusions, rankings, and bundle hashes.

## What changed

The smoke display shader skips lighting and obstacle samples when its existing
five-tap dye filter returns exactly zero. Testing all five taps preserves the
soft edge of the cloud. The final display pass also skips blending against its
cleared target, and zero-colour buoyancy splats update velocity without copying
the dye field. Resolution, shading, simulation cadence, pressure iterations,
emissions, art, and physics settings retain their existing values.

The original framebuffer clear remains. Removing it saved a little more GPU
work, but the intermediate captures repeatedly included an isolated 16.5 to
18 ms CPU frame. After restoring the clear, the final profiler-off capture's
worst CPU frame was 8.2 ms, matching the baseline. This observation supports
keeping the clear; it does not establish the driver's internal cause.

The test harness now sends real keyboard events with uneven holds, releases,
short upward bursts, left/right corrections, coasting, digging, and escape
thrust. It records actual positions, velocities, landings, focus, visibility,
and input timings. It no longer overrides the rig's position, camera, velocity,
fuel, or world during this route. The existing artificial cruise fixture remains
available separately. A guard catches an experimental smoke module whose active
driver was not connected. CPU sampling can be disabled with `PROFILE=0`.
Large optional traces stream to disk, and core results are saved before trace
completion so a trace failure cannot discard the main measurement.

## Method

Windows, i7-9700K, RTX 3080, Chrome 152.0.7977.83, 144 Hz display, Extreme
graphics, and a 2560 x 1440 game canvas. The overlay and audio engine remain on;
browser output is muted. The clock starts at 0.02 and advances. Each capture
uses a fresh seeded world, the normal loading gate, audio startup, and three
seconds of scene warmup. Captures run sequentially in their own browser profiles.

The final normal comparison is 45 seconds per build, with no CPU sampling or
GPU timer queries. Both routes made 47 input changes and 17 landings, traversed
about 3,080 world pixels horizontally, and ranged from roughly y = -372 to
y = 199. Every recorded frame remained focused and visible. This is a repeatable
sequence of human-like gestures, not a recording of the owner's save or input.
Physics and water state can diverge slightly between executions. Dev mode matches
the supplied screenshots and retains the game's own dev-mode fuel behaviour.

PresentMon records display intervals from the game's principal swap chain.
Both final captures used Hardware Composed: Independent Flip throughout.
CPU duration, animation-callback interval, display interval, GPU execution time,
and GPU-process CPU work are separate measurements. They cannot be added into
one frame-cost total. In particular, asynchronous queue completion latency is
not the same thing as shader execution time.

## Final frame delivery

| Measure | v26.125 | v26.126 |
|---|---:|---:|
| CPU mean | 2.832 ms | 2.836 ms |
| CPU p99 | 5.6 ms | 5.8 ms |
| Worst CPU frame | 8.2 ms | 8.2 ms |
| Display p99 | 13.934 ms | 13.932 ms |
| Display p99.9 | 27.783 ms | 27.765 ms |
| Display intervals over 8 ms | 774 (13.65%) | 765 (13.47%) |
| Display intervals over 20 ms | 15 | 18 |
| Display intervals over 33 ms | 4 | 4 |
| Worst display interval | 48.575 ms | 41.679 ms |

These results are essentially flat for overall smoothness. The lower single
maximum is not evidence of a reliable hitch reduction: the count over 20 ms
increased, and the p99 remained approximately two refresh intervals. This is a
short comparison, not an hours-long stability result or a confidence interval.

## Costs, ranked within each measurement

The final normal route's non-overlapping top-level CPU buckets were:

| Rank | Work | Mean | p99 |
|---|---|---:|---:|
| 1 | Smoke update, including its collision mask | 0.560 ms | 2.2 ms |
| 2 | Sky, including background composition | 0.410 ms | 2.2 ms |
| 3 | Terrain chunks | 0.353 ms | 2.6 ms |
| 4 | Rig, slimes, and flight effects | 0.300 ms | 1.0 ms |
| 5 | Individual tiles | 0.258 ms | 0.5 ms |
| 6 | Liquid update and submission | 0.253 ms | 0.8 ms |
| 7 | HUD | 0.229 ms | 1.3 ms |

The smoke collision mask accounts for 0.421 ms of the first row, including
0.338 ms building/drawing it. Those are nested costs, not additional rows to
sum. The complete render total is 1.769 ms; it is also a parent, not an extra
rendering stage. The JSON retains the smaller buckets and individual worst frames.

Separate 20-second captures sample asynchronous GPU timestamps every 24 frames.
Among the measured GPU stages, the final ranking is:

| Rank | Stage | Mean | p99 |
|---|---|---:|---:|
| 1 | Water simulation | 0.501 ms | 2.397 ms |
| 2 | Smoke update | 0.252 ms | 0.922 ms |
| 3 | Water drawing | 0.163 ms | 0.241 ms |
| 4 | Smoke display | 0.159 ms | 1.921 ms |
| 5 | Mountains | 0.060 ms | 0.378 ms |

Smoke display fell from 0.224 to 0.159 ms on average, about 29%, and its median
fell from 0.174 to 0.082 ms. Its sampled p99 was worse, so this is a typical-work
saving, not a promise about GPU tails. Smoke update averaged 0.293 to 0.252 ms.
Water state varied between runs. Canvas rasterization and the complete browser
composition pipeline are not included in this GPU-stage table.

## The larger remaining target

A separate eight-second Chromium trace shows substantial work on the GPU
process's CPU thread: 5,144 Canvas raster calls across 790 recorded game frames,
about 2.15 seconds in raster deserialization and 2.43 seconds in raster flush
events. One nested raster flush lasted 31.95 ms. The trace also records WebGPU
and WebGL command processing. Parent scheduler/command-buffer durations overlap
these events and must not be summed with them.

Heavy tracing itself worsened frame delivery, so these durations are diagnostic
evidence of the pipeline structure, not normal-play performance numbers. The
next substantial target is reducing Canvas raster commands, image transfers,
and synchronization between the renderers. The trace does not yet identify a
single surface as the cause of every long flush. Small JavaScript arithmetic
changes alone will not address all the work visible on that thread.

Removing smoke entirely in an exploratory 35-second run reduced display
intervals over 8 ms to 1.23%, versus 12.37% in the initial control prefix.
That ablation removes the simulation, mask work, and presentation layer together;
it does not prove that the smoke shader alone causes the misses. Slimes were
mostly dormant on this route. This supports the user's observation that the
problem occurs away from slimes.

## Experiments left out

- Lower terrain filtering quality, hiding the overlay, and disabling water did
  not provide a compelling solution. No visual-quality downgrade was shipped.
- CPU-backed smoke masks and an opaque main canvas were slower in their trial
  routes. Their context settings were not adopted.
- A fixed padded water mask eliminated 142 canvas resizes in the control route
  and passed 37 exact coverage comparisons. It did not improve hitch timing,
  so the larger padded mask was not adopted. The control's resize frames were
  all below 6.3 ms of CPU work; resizing did not explain its long display gaps.
- Premultiplied transparency failed the composite image comparison and was
  rejected before performance claims or production changes.
- The first injected smoke replacement left the active driver disconnected.
  Those performance captures are invalid and excluded. All final results use
  the actual rebuilt bundle, with the driver guard enabled.

## Verification and reproduction

The final source matches v26.125 byte-for-byte at 49 smoke image checkpoints
across WebGL2, WebGL1, manual filtering, shading, static and moving masks,
scrolling, clears, and resizes. The shared physics toy received the same engine
and booted successfully with smoke, water, and slimes active. Startup and
graphics-switching validation passed 84 checks; motion and overlay validation
passed 45 checks. The final clear restoration also passed normal game boot and
the repeated image suite. The desktop package is checked for its version, local
assets, isolated renderer, saved settings, and fullscreen controls.

The older moving-boundary conservation suite fails its absolute reference-cloud
retention assertion on both baseline and candidate under Windows D3D11. That
assertion was not weakened. The new moving-boundary image comparisons compare
against the baseline on the same driver and are exact. A temporary toy-server
path check initially returned 404 on Windows; correcting path normalization
allowed the toy boot test to pass.

For a normal input capture in PowerShell, set `SCENES=human`, `SECONDS=45`,
`PROFILE=0`, `HEADED=1`, `WIDTH=2048`, `HEIGHT=1152`, `DPR=1.25`, `OVERLAY=1`,
`AUDIO=1`, `CLOCK=1`, and `TOD=.02`, then run `node tools/perf/audit-sluice.mjs`.
`DUMP` names an output directory outside the checkout; `PRESENTMON` names the
local PresentMon executable. `ROOT` selects the baseline checkout. Use
`node tools/perf/summarize-input-run.mjs <capture-directory>` for timing and
motion summaries. `GPU=1` enables separate GPU attribution. `TRACE=1` is for
diagnosis only and should use a short capture. Raw captures remain in the local
temporary directories recorded in the JSON.

Graphics presets and loading policy were not changed in this pass. Passing the
loading gate cannot guarantee that every later movement path is already warm.
The next renderer work should be judged with this input route and actual display
intervals, while continuing to preserve the game's appearance.
