# Sluice hitch reduction pass

Version v26.125, compared with v26.124 at `6389e98`. This pass targets long
frames during travel, with the day/night clock running. It continues the
[surface bank pass](PERFORMANCE_SURFACE_BANK_2026-09-12.md). The individual
captures, timing distributions, presentation modes, rankings, and bundle hashes
are in [the measurement data](performance-hitches-2026-09-12.json).

## What caused the repeated spikes

The earlier short scene audits froze the clock. That made comparisons easier,
but missed a substantial recurring cost in normal play. The new fixture cruises
across the world with changing light and altitude, including repeated occasions
when the surface bank leaves the viewport and comes back.

1. **Cold surface bank work produced the largest CPU stalls.** A screenful of
   strips could require synchronous construction and recolouring on descent.
   The first baseline capture spent 43 ms in underground background work on one
   frame, including 34.6 ms building bank geometry.
2. **Planet recolouring produced the repeated smaller stalls.** The old painter
   took about 10 ms on active recolour frames. This was nested inside the
   `skyComposite` timer, so the screenshot appeared to implicate sky composition.
   Additional probes separated the planet, clouds, sky draw submission, and the
   WebGL-to-Canvas copy. The recurring cost was the CPU pixel loop.
3. **Presentation remains a separate source of uneven delivery.** CPU work can
   finish quickly while Windows/Chromium delivers the resulting frames unevenly.
   The display captures below show why CPU timing alone cannot certify smoothness.

## Changes

The planet painter now uses fixed red, green, and blue property access instead
of dynamic channel lookup inside its pixel loop. Arithmetic order and rounding
are preserved. The existing art resolution, colours, lighting cadence, and
geometry remain the same. All 84 RGBA comparisons against v26.124 were exact,
covering three viewport sizes, seven times of day, and four moon phases.

The surface bank prepares its current horizontal footprint and both travel
edges even while flight hides it below the viewport. Preparation includes stale
lighting as well as missing geometry. Geometry retains the small incremental
column budget; cached recolouring handles at most one strip per warmup call.
The cache remains bounded to 16 entries. A cold teleport can still require
immediate work. The normal travel captures exercise descent rather than teleport.

Loading also prepares the orbital planet and moon phase behind the cover, before
the existing stable-frame and GPU-readiness checks finish. This avoids leaving
their first construction until takeoff. Gameplay remains stationary during
loading, and missing optional art retains its fallback.

The profiler now decays idle timing buckets. A cached cargo panel could previously
leave its last repaint cost and peak in the rankings indefinitely. This corrects
the ranking; it does not establish that an individual cargo repaint is cheaper.
A new auxiliary-update timer covers work between the main simulation and visual
updates, including saves, camera updates, and optional systems.

## Measurement method

The primary comparison uses two 30-second captures per build on the owner's
i7-9700K and RTX 3080, Windows, Chrome 152.0.7977.83, a 144 Hz display, Extreme
graphics, and a 2560 x 1440 game canvas. Each capture uses a fresh deterministic
world and three seconds of scene warmup. The clock starts at 0.7 and advances.
The rig uses horizontal controls, with altitude following a slow wave; it turns
near the world boundary. This is a controlled stress fixture, not a replay of
the owner's save. Water and slime dynamics can differ between runs.

The diagnostic overlay is hidden. Both builds use the same attribution probes
and a 1 ms CPU sampling profiler, which add measurement overhead. PresentMon
2.5.1 records the game's GPU-process principal swap chain. Callback intervals,
main-thread durations, and actual display intervals are reported separately.
Counts per minute are normalized from short captures, not long-session rates.
These samples do not provide confidence intervals or an hours-long stability test.

One intermediate build failed the runtime-error assertion because cache warmup
was placed in the grass update rather than the renderer. It was corrected before
the final captures. That failed build is excluded from release comparisons.

## Main-thread tail results

Across the two primary captures per build:

| Measure | v26.124 | v26.125 |
|---|---:|---:|
| CPU p99 | 14.7 ms | 6.4 ms |
| CPU p99.9 | 17.2 ms | 8.9 ms |
| Worst CPU frame | 47.6 ms | 12.9 ms |
| CPU frames over 8 ms | 596 | 22 |
| CPU frames over 16 ms | 33 | 0 |
| Frames requiring synchronous bank construction | 4 | 0 |

There were 8,103 baseline frames and 8,297 release frames. CPU spikes over 8 ms
fell about 96% in these equal-duration samples. Active planet recolouring averaged
10.1 to 10.5 ms before and 1.88 to 1.90 ms after. The average whole-frame CPU
duration changed much less, from 3.60 to 3.14 ms.

The remaining worst release CPU frames included a 9.3 ms bank-preparation call
and an 8.8 ms liquid-render call. Those isolated calls remain recorded in the
data. The incremental budget is not a guarantee against allocation, browser
stalls, or scheduling delays inside an operation.

## Display delivery and its limits

The two baseline captures used Hardware Composed Independent Flip throughout.
Their display intervals over 20 ms occurred 9 and 19 times, with maxima of
48.6 ms. The second release capture used the same presentation mode: four
intervals over 20 ms, none over 33 ms, and a 27.8 ms maximum.

The first release capture was different. It spent its early portion in Composed
Flip before switching to Hardware Composed Independent Flip. It recorded 12
intervals over 20 ms and a 53.3 ms maximum despite its 12 ms worst CPU frame.
Nearly every displayed interval in the first ten seconds exceeded 8 ms. The
capture is retained, not silently discarded. Presentation-mode correlation
identifies where the inconsistency occurred; it does not identify why Windows
selected that mode.

Pooling all primary display data, intervals over 20 ms fell from 28 to 16 per
minute, but intervals over 8 ms became more frequent because of that composed
segment. Display p99 stayed near 13.9 ms. These results support a reduction in
specific game-side stalls, not a claim that visible cadence is solved or locked
to 144 Hz.

A third release Chrome capture repeated the CPU improvement (p99 6.7 ms,
maximum 13.3 ms, zero synchronous bank builds), but still caught a 51.8 ms
display interval. Most of that capture used Independent Flip; it also contained
a brief Composed Flip transition. A preferred presentation mode alone therefore
does not guarantee a hitch-free result.

The separate development desktop comparison used Electron 44.3.0, with Chrome
152.0.7977.78, the same fixture, and 30 seconds per build. Both captures stayed
in Hardware Composed Independent Flip. CPU p99 fell from 13.9 to 5.8 ms and the
maximum from 45.1 to 8.8 ms. Display intervals over 20 ms fell from eight to four,
with maxima of 41.7 and 27.8 ms. Intervals over 8 ms fell from 5.37% to 3.83%.
This is one paired runtime comparison, separate from the packaged offline smoke
test. It supports the same game-side improvement, without establishing that the
desktop wrapper universally eliminates Chromium or Windows pacing issues.

## Remaining main-thread costs

These are non-overlapping measured groups in the release cruise captures.
Nested timers are not added to their parents. They measure main-thread work and
waiting inside API calls, not hardware GPU execution time. Rankings are scene
dependent; the prior report includes driving, the slime pen, and underground
scenes. The JSON retains each group's p99, p99.9, and maximum as well as its mean.

| Rank | Group | Mean per frame |
|---|---|---:|
| 1 | Smoke update and rendering submission | 0.610 ms |
| 2 | Water update and rendering submission | 0.387 ms |
| 3 | Sky composition, including planet and clouds | 0.364 ms |
| 4 | Rig, effects, and lighting | 0.289 ms |
| 5 | Slime simulation and rendering | 0.268 ms |
| 6 | Terrain chunks | 0.237 ms |
| 7 | HUD | 0.130 ms |
| 8 | Live tile details | 0.125 ms |
| 9 | Mountains | 0.113 ms |
| 10 | Surface bank preparation | 0.085 ms |
| 11 | Entities | 0.064 ms |
| 12 | Underground background | 0.053 ms |

Smoke's obstacle-mask drawing, occasional liquid/Canvas submission stalls, and
presentation-mode changes remain targets for further tracing. There is still
no complete per-stage hardware GPU ranking. Average CPU rank should not be used
as a substitute for attributing the next visible hitch.

## Reproduction

Run `tools/perf/audit-sluice.mjs` sequentially with `WIDTH=2048`, `HEIGHT=1152`,
`DPR=1.25`, `HEADED=1`, `CLOCK=1`, `TOD=.7`, `SCENES=cruise`, `SECONDS=30`, and
`PRESENTMON` set to the installed PresentMon executable. Set `EXPERIMENT` to
`tools/perf/hitch-audit-probe.js`, `ROOT` to the checkout being measured, and
`DUMP` to a distinct directory outside it. `audit.skyDirty` is a boolean redraw
counter, not milliseconds. `OVERLAY=1` retains the normal diagnostic panel.

For the development desktop runtime, also set `ELECTRON=1`; `ELECTRON_EXE` can
point at a shared Electron installation when the baseline checkout has none.
The visual comparison is `tools/perf/planet-colour-equivalence.mjs`, with
`PLAYWRIGHT_MODULE` set to the installed Playwright module. The idle-cost
regression check is `tools/perf/idle-bucket-check.mjs`.

## Validation and delivery

- 84 exact planet image comparisons passed.
- 84 loading checks passed, including orbital art readiness, hidden gameplay
  remaining stationary, saved graphics presets, restart/respawn, failed fonts
  and moon art, failed/hung workers, GPU timeout, mobile, and reduced motion.
  A mobile test race was corrected by waiting for its loading controller before
  asserting controller state; the complete suite then passed.
- 18 surface checks passed across 21 views. The dusk cruise and excavated
  surface screenshots were also inspected.
- 25 scrolling checks passed over 1,160 scrolling frames, with no background
  reversals or cold bank builds, plus 20 overlay/cache/raster/hover checks.
  This separate headless regression still recorded a 62.5 ms callback gap and
  a 21.6 ms CPU frame. Its workload and instrumentation differ from the cruise
  comparison; the release's 12.9 ms primary maximum is not an all-game ceiling.
- The intermittent-timer regression passed: idle costs fade, active costs
  remain stable, and a fresh repaint replaces the old peak.
- All seven final performance captures had no game errors. Source syntax,
  exact fragment assembly, whitespace, and shared toy-engine sync passed.
- The packaged v26.125 desktop build passed offline boot, local assets/fonts,
  saved option persistence, sandbox/isolation, and fullscreen toggling. The
  existing desktop shortcut points to the updated portable build. User saves
  are separate from its application files. Steam/Proton compatibility was not
  tested in this pass.

The measurement data records both raw local and LF-normalized bundle hashes.
Git normalizes line endings on deployment; the normalized hash identifies the
same tested source across the worktree, main checkout, and live bundle.
