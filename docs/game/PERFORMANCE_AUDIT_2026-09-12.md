# Sluice performance audit, v26.122

This pass removes avoidable work without replacing the art, changing slime physics, or lowering the default desktop graphics preset. It reduces surface-driving game-thread time by 29%, cuts the storm test's 99th-percentile CPU frame from 26.6 ms to 6.1 ms, and reduces startup decoded music from 1.210 GB to 0.119 GB.

**It does not produce a consistent 144 FPS surface scene.** The main remaining bottleneck extends beyond the JavaScript animation callback into Chrome's Canvas raster processing. The measured gains in CPU time are substantially larger than the gains in delivered frames. A language or engine rewrite is not established as necessary by these results.

## Measurement conditions

- Frozen baseline: `2b587fb17d83b4ad4d0988281e1097104a4cd34a`, v26.121. The supplied screenshot was v26.112; its values are context, not the before measurement.
- After: v26.122, this change. Windows, Intel i7-9700K (8 cores), RTX 3080. The browser reports NVIDIA Ampere through D3D11 and supports WebGPU timestamps.
- Chrome 152.0.7977.83, owned headless browser, local HTTP server, fresh browser profile, seeded world. CSS viewport 1798 by 954, DPR 1.25, measured main canvas 2248 by 1193. The diagnostic panel is hidden during sampling; instrumentation remains enabled.
- Each main scene gets three seconds of settling, then eight seconds of measurement. CPU profiles stop after frame sampling stops, avoiding an export-induced false hitch. GPU timings use separate six-second runs. Preset and effect-isolation comparisons also use six-second runs and a matching six-second control.
- Dev mode includes the slime test pen, as in the supplied screenshot. Most nearby slimes sleep; the pen case presses the rig against active bodies. Flight also passes visible slimes. Normal play without these fixtures can cost less.
- Driving follows the surface; pond is a surface pool; cave uses an existing cavity; deep uses a reproducible mined chamber at 80% of town depth. Night and storm are separate scenes. Disabled game features remain disabled.
- The main comparison has no audio-unlock gesture. Music memory is measured separately after a real input gesture and ten seconds for decoding. Sound output is muted in the test browser.
- RAF intervals measure callback delivery, not physical monitor scanout. These short controlled runs identify costs and regressions; they do not prove every save, browser, or scene has the same performance. Small changes and one-frame extremes should be treated cautiously.

The companion [measurement data](performance-audit-2026-09-12.json) retains the per-scene timing distributions and bucket breakdowns. Raw profiles, trace, screenshots, and per-frame rows were retained outside the checkout under the `sluice-audit-*` result directories.

## Before and after

All times below are milliseconds. CPU includes the whole game animation callback. Frame interval includes the wait until the next callback, so it must not be interpreted as CPU execution time.

| Scene | Mean CPU before | Mean CPU after | CPU p99 before | CPU p99 after | Mean frame before | Mean frame after |
|---|---:|---:|---:|---:|---:|---:|
| Surface driving | 4.10 | 2.91 | 7.3 | 6.3 | 12.56 | 12.12 |
| Horizontal flight | 3.63 | 3.36 | 5.4 | 5.3 | 10.55 | 10.55 |
| Slime pen | 4.07 | 3.85 | 6.0 | 5.1 | 11.73 | 11.58 |
| Surface pond | 2.02 | 1.83 | 3.7 | 3.5 | 9.52 | 9.29 |
| Cave | 1.35 | 1.23 | 3.3 | 2.2 | 6.94 | 6.94 |
| Deep chamber | 2.66 | 2.56 | 5.5 | 4.0 | 6.94 | 6.94 |
| Night | 3.41 | 3.49 | 5.1 | 4.8 | 11.96 | 12.19 |
| Storm | 6.31 | 3.72 | 26.6 | 6.1 | 13.28 | 12.44 |

At 144 Hz, the nominal interval is 6.94 ms. Surface driving still alternates between refresh opportunities: its frame p99 remains 20.9 ms. Flight's frame p99 remains 14.0 ms. Storm frame p99 improves from 27.8 to 20.8 ms. Night's slightly higher mean is not a measured win; its CPU tail improves. Cave and deep scenes already sustain approximately 144 callbacks per second in this setup.

## What costs the most now

### Browser rendering, outside the game's CPU panel

A separate four-second driving trace captured 335 animation callbacks. On Chrome's GPU-process thread, `RasterDecoderImpl::DoRasterCHROMIUM` accumulated 2277 ms, and `DoEndRasterCHROMIUM` accumulated 1004 ms. Together that is approximately **9.8 ms per animation callback in Canvas raster replay and finalization**. These are thread wall-time spans, which can include driver waits, not 9.8 ms of independently measured GPU shader execution.

This is the strongest remaining bottleneck evidence. The game-thread callback and this work overlap, so their times must not be added. The trace's enclosing scheduler/flush spans also nest around these operations; summing all trace rows would multiply-count the same work. Detailed tracing has overhead, so the ordinary eight-second runs above remain the frame-rate comparison.

In six-second isolation runs, disabling smoke changed driving's mean interval from 11.75 to 10.38 ms. Disabling water or sky individually gave 12.05 and 12.04 ms, respectively, without an improvement. Removing slimes from the pen changed 11.58 to 9.22 ms. These are diagnostic removals only; none ships. They indicate that smoke and slime rendering deserve further investigation, while removing a subsystem does not reliably save the sum of its JavaScript timings.

### Game-thread costs, ranked within each scene

These are after-change averages in ms/frame. Simulation and drawing are combined for smoke, water, and slimes. Slime drawing is subtracted from its enclosing `render.player+fx` bucket before listing the remaining rig/effects cost. Parent totals such as `render.total` are not added again. Smaller update phases and callback bookkeeping account for the remaining time.

| Rank | Surface driving | ms | Slime pen | ms |
|---:|---|---:|---|---:|
| 1 | Smoke simulation and drawing | 0.647 | Slime simulation and drawing | 1.930 |
| 2 | Water update and drawing submission | 0.448 | Water update and drawing submission | 0.350 |
| 3 | Tile drawing | 0.295 | Tile drawing | 0.341 |
| 4 | Sky and cave-background drawing | 0.284 | Sky and cave-background drawing | 0.255 |
| 5 | Terrain chunk drawing/rebuilding | 0.271 | Rig and other effects | 0.177 |
| 6 | Rig and other effects | 0.253 | HUD | 0.145 |
| 7 | HUD | 0.159 | Smoke simulation and drawing | 0.138 |
| 8 | Entity drawing | 0.090 | Terrain chunks | 0.122 |
| 9 | Core update | 0.064 | Entity drawing | 0.040 |
| 10 | Slimes | 0.039 | Core update | 0.029 |

The pen's 1.930 ms comprises 1.158 ms of drawing and 0.772 ms of simulation. Contact solving is 0.509 ms within that simulation time, down from 0.630 ms. Glass/refraction drawing is now the larger game-thread slime cost and can also cause additional work in Chrome's rendering process.

Other scenes have different leaders:

| Scene | First | Second | Third | Fourth |
|---|---|---|---|---|
| Flight | Slimes 1.452 | Smoke 0.380 | Sky/background 0.334 | Rig/effects 0.307 |
| Pond | Water 0.381 | Tiles 0.263 | Sky/background 0.240 | Rig/effects 0.176 |
| Cave | Rig/effects 0.217 | HUD 0.187 | Background 0.158 | Terrain 0.126 |
| Deep | Tiles 0.695 | Background 0.372 | Water 0.364 | Rig/effects 0.192 |
| Night | Slimes 0.936 | Tiles 0.455 | Water 0.378 | Terrain 0.359 |
| Storm | Slimes 1.102 | Sky/background 0.469 | Tiles 0.429 | Water 0.389 |

### Actual water GPU work

Optional WebGPU timestamp queries sample every 24th command encoder without a queue drain. The after-change averages are:

| Scene | Simulation passes | Water render passes |
|---|---:|---:|
| Driving | 0.861 ms | 0.224 ms |
| Pen | 0.167 ms | 0.150 ms |
| Pond | 0.506 ms | 0.215 ms |
| Storm | 0.705 ms | 0.129 ms |

There are 20 to 25 samples per group and no query errors. These sum measured pass durations, not command-queue latency. Water shaders were not changed in this pass; small before/after differences are not claimed as improvements. The old 25 ms asynchronous queue-wait display is not evidence that water alone executes for 25 ms. WebGL timer spans around smoke can include dependencies and gaps between commands; they are not directly comparable to the sum of timestamped WebGPU passes. The [Khronos timer-query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) describes the asynchronous WebGL query mechanism used by the harness.

## Changes retained

1. **Reuse the smoke/water obstacle image.** GPU water mirrors update less often than camera motion. A padded, world-anchored window now reuses identical density pixels until particle data, geometry, freeze state, flow tuning, or the window changes. Projection retains fractional camera motion. Smoke update cost in driving falls from 1.64 to 0.62 ms; obstacle-image drawing falls from 1.36 to 0.37 ms. CPU water still rebuilds normally.
2. **Bake cloud geometry in a worker.** The same noise, resolution, density, and lighting maps are transferred back when complete. Existing cloud images stay visible during live replacement. A denied, failed, or hung worker falls back to the original synchronous baker. The storm's periodic main-thread baking spikes are substantially reduced.
3. **Cache exact slime contact-neighbor hashes.** Integer-cell neighbors are reused until the cell changes. Candidate order, contact equations, and solver settings remain unchanged. The sparse bucket path also covers more small scenes. Byte-for-byte solver comparisons cover 2000 solves across 200 scenes.
4. **Reuse the fuel-route search state.** Typed score/visit arrays and generation stamps replace fresh Maps/Sets in the HUD's search every 200 ms. The algorithm and search budget remain unchanged. All 600 route comparisons and generation rollover match. Deep HUD p99 falls from about 3.0 to 1.5 ms. This adds about 5.4 MB of reusable search storage when first needed.
5. **Load music as needed.** The baseline decoded 20 long songs after the first gesture, including parked themes and unused combat tracks: 1,209,922,560 bytes of PCM. Startup now retains the opening song and death cue: 118,640,640 bytes. The cache targets four decoded tracks, protects active voices, and decodes one long track at a time. Upcoming cues prefetch near the end of their quiet interval. Full intended playlists, no immediate repeats, fades, depth/danger selection, and quiet deadlines remain intact. SFX loading is unchanged. This is a 90.2% reduction in resident decoded startup music, not a claim of a 90% reduction in total process memory; JavaScript heap in the separate probes was 116 MB before and 124 MB after.
6. **Apply graphics once.** Saved graphics resolve before world/GPU warmup, with an explicit device-tier URL override taking priority. The old delayed saved-preset application is removed. Resolution changes batch into one resize, and unchanged canvas dimensions are not assigned repeatedly. The pixel budget now works even when CSS dimensions alone exceed it.
7. **Wait for a prepared scene.** Loading exercises actual smoke and water passes, requires six complete-cache frames, seeks six warm frames within an 8 ms CPU budget, and waits for submitted GPU work using asynchronous fences. It stops submitting while draining and allows two presentation opportunities before reveal. Readiness has bounded fallbacks for slow devices and unavailable resources; it does not wait forever for an unattainable FPS target. Input, rig movement, fuel use, and pause state stay protected during the cover. This intentionally adds readiness work: the first driving boot probe took about 5.1 seconds before and 5.8 seconds after; most later page loads in the after run took 2.1 to 2.6 seconds. These are local probe observations, not network loading guarantees.

## Graphics presets

Extreme remains the default for a fresh desktop profile. Balanced now selects the existing High tier rather than Medium, preserving the full-size scene at the tested viewport while reducing smoke and terrain detail. Mobile retains its previous High default. Presets are choices, not promises of a target frame rate.

| Choice | Main canvas in this test | Smoke pressure iterations | Driving FPS | Pen FPS |
|---|---|---:|---:|---:|
| Extreme | 2248 by 1193 | 28 | 85.1 | 86.3 |
| Balanced | 2248 by 1193 | 17 | 85.4 | 85.8 |
| Performance | 1345 by 714 | 12 | 106.5 | 102.3 |

These are matching six-second runs, hence they differ slightly from the eight-second table. Balanced shows little delivery improvement in these cases despite lighter effects. Performance improves delivery through substantially lower image resolution; it still does not hold 144 FPS. No reduced-quality choice is silently forced onto the user's existing Extreme setting. Live changes warm their new resources beneath a loading cover and return to the same paused options screen.

## Appearance and validation

No artwork, shader appearance, world features, slime material settings, or default desktop quality was replaced. All 72 tested cloud maps plus the veil are byte-identical to the original baker. All 37 real-canvas smoke-mask comparisons have zero pixel difference, including fractional camera motion and cache invalidation. The slime solver and fuel-search equivalence checks preserve behavior.

Other verification covers the game and shared toy boot, syntax, exact toy-engine synchronization, 333 contour comparisons, 659 water-interaction frames, 45 camera/overlay checks, 18 surface-transition checks across 21 views, music scheduling and 80 full-pool cache cycles, and all 162 SFX variants plus gameplay/audio integration. The 82 loading checks cover startup, saved runs, new games, live graphics, a large viewport, input during reveal, font and image failure, failed scripts/retry, delayed GPU initialization/disposal, blocked/hung workers, mobile/reduced motion, and the art atlas.

Two rendering experiments were rejected: cropped/batched slime refraction changed some pixels and did not improve delivery enough; a typed smoke-obstacle upload increased CPU cost. Neither is in the release.

## Reproducing the audit

Run `node tools/perf/audit-sluice.mjs` with `DUMP` pointing outside the checkout. `ROOT` can point at the frozen baseline checkout. Defaults are all eight scenes and eight seconds per scene. `SCENES=drive,pen`, `SECONDS=6`, `PRESET=high` or `low`, `GPU=1`, `AUDIO=1`, and `TRACE=1` select the additional probes. Environment variable syntax depends on the shell. `DISABLE` is a test-only comma-separated list of effects; it does not modify production settings.

Run scene timing sequentially on an otherwise idle GPU. Compare main-thread timings, RAF delivery, GPU timestamps, and the browser trace separately. The next renderer investigation should target Canvas raster replay/flush and the slime/background sampling path while retaining pixel comparisons. Further small simulation edits alone are unlikely to remove the remaining surface presentation gap.
