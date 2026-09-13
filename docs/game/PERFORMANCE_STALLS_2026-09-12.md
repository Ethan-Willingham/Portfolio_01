# v27 large-gap diagnosis

Tested game commit: `9a2a07e6d8d34851984545557ac8b3fdd2863b4d`.
This is a bounded diagnostic pass. No gameplay or rendering changes were
released. The temporary subsystem removals were test-only.

## Finding

The baseline Chrome trace contained 11 GPU-process Canvas raster flushes
longer than 10 ms. Every one contained a `GrShaderCache::load` followed by
`GrShaderCache::store`. The longest flush took 32.30 ms. In comparison, the
longest renderer animation callback took 9.84 ms and main-thread major GC
took at most 5.51 ms.

This strongly implicates first-use Canvas shader preparation in the large
stalls captured here. The trace does not directly expose driver compilation
time, so load-to-store time is not presented as an exact shader compile timer.
The long flushes were concentrated in the first 6.4 seconds of movement.
All five baseline presentation intervals over 33 ms occurred in that period.
Smaller gaps continued later, so this is not an explanation for every miss.

## Isolation

Three sequential 30-second captures used Chrome on the main 144 Hz display,
a 2560 x 1440 canvas, default graphics, audio, diagnostics, and the same
uneven keyboard route. No CPU sampling or explicit GPU timer queries ran.
Chrome tracing was enabled in every capture. Each used a fresh browser
profile and the same game source. These trace-instrumented results should
not be compared directly with the untraced v27 release percentages.

| Measurement | Full game | Terrain chunk draws removed | Rig, rocket plume and shadow draws removed |
| --- | ---: | ---: | ---: |
| Canvas raster flushes over 10 ms | 11 | 10 | 6 |
| Maximum Canvas raster flush | 32.30 ms | 32.38 ms | 23.81 ms |
| Long flushes containing shader-cache activity | 11 / 11 | 10 / 10 | 6 / 6 |
| Shader-cache store events | 16 | 18 | 8 |
| Late presentation intervals | 8.27% | 4.45% | 2.26% |
| Presentation intervals over 20 ms | 22 | 11 | 9 |
| Presentation intervals over 33 ms | 5 | 5 | 3 |

Removing terrain lowers routine rendering load but leaves the worst flushes.
Removing the rig group lowers shader-cache activity and the largest flush,
making those effects a stronger next target than another terrain-filtering
change. The rig group was removed together; this does not yet distinguish
the rig body, rocket flame and shadow individually. Removing `drawPlayer`
also removes its internal visual-animation tick, so this is a group isolation,
not a drawing-only timing measurement of that function.

## Limits and next implementation

Fresh profiles expose cold caches. The harness loads at daytime, switches
to nighttime before the three-second measurement warmup, then starts input.
That deliberately controlled setup can expose shader variants earlier than
an already-warm player session. The input route responds to real timestep
and collision differences, so paths are similar rather than identical.
Each isolation has one capture; this establishes a useful target, not a
release-quality improvement estimate.

The next focused implementation should identify the specific rig/effect
drawing state that creates each new shader variant, then exercise those
states during loading or reuse equivalent prepared drawing resources.
Existing loading renders the resting scene; it does not guarantee that
every movement-dependent Canvas shader has been prepared. A longer timer
alone would not exercise those missing states. Preserve appearance and
physics, then validate with fresh-cache and warm-session captures.

The live game remains v27. No claim is made that these stalls have been fixed.
Desktop and Proton were not involved.

## Evidence and reproduction

[Compact measurements and timestamped cache intervals](performance-stalls-2026-09-12.json)
retain the long flushes and their cache-event containment checks. Large raw
traces and screenshots remain outside the repository in the local temporary
folders `sluice-p8-p9-trace`, `sluice-p8-p9-no-terrain`, and
`sluice-p8-p9-no-rig`.

Use the audit settings in the v27 performance report with `TRACE=1`.
The terrain experiment sets `PERF_DISABLE_TERRAIN_CHUNKS = true`.
The rig experiment temporarily replaces `drawPlayer`, `drawRocketPlume`
and `drawPlayerShadow` with empty functions through the harness's
`EXPERIMENT` injection. Neither experiment is in production source.
Parse the trace as newline-separated event objects inside `traceEvents`;
the raw trace can exceed Node's maximum single-string size. Match complete
`RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` events against cache
load/store pairs on the same GPU thread. The measurement JSON contains
the observed timestamps and durations without adding nested durations twice.
