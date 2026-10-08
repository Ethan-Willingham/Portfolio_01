# Town flight and terrain mask uploads, v28.177

Measured on the owner's MacBook on 2026-10-08. This change reduces repeated
terrain-mask uploads and texture allocation during flight. The isolated tests
do not show a meaningful callback-rate improvement, and do not establish that
this patch removes the previously observed 100 to 300 ms stalls.

## Change and isolated comparison

The liquid renderer previously recomputed its mask bounds at individual tile
crossings. Independent rounding of opposite edges also changed the texture
dimensions during camera movement. The new bounds advance in four-tile steps
and keep a fixed size at fixed zoom. They contain the previous padded window;
terrain edits and newly revealed air still invalidate immediately. Physics,
particle populations, graphics quality and render resolution are unchanged.

Sequential before/after captures used the same keyboard flight from home to
the west lake, across to the east lake, and home. Each one-lap capture lasted
about 43.4 seconds, with native snowfall, all three lakes seeded to 6,000 water
particles each, and five residents. Extreme graphics rendered a 2900 by 1906
canvas. The harness paced callbacks at 120 Hz; these are callback-delivery
measurements, not independently measured display FPS. Queue-completion sampling
was disabled in this pair.

| One-lap measurement | v28.176 | v28.177 |
| --- | ---: | ---: |
| Callbacks per second | 119.6 | 119.4 |
| Mean game CPU time | 3.799 ms | 3.797 ms |
| Largest callback gap | 26.9 ms | 18.9 ms |
| Callback gaps above 50 ms | 0 | 0 |
| Terrain mask rebuilds | 417 | 131 |
| Terrain texture recreations during capture | 90 | 0 |
| Mask upload payload, bytes | 1,560,526,848 | 606,867,456 |

Rebuilds fell 68.6% and estimated upload payload fell 61.1%. Payload sums
`width * height * 4` for each rebuilt RGBA mask; it is not a GPU bus-bandwidth
measurement. The new window is slightly larger, so each upload costs more
bytes, but uploads occur less often. Initial allocation happens before capture.
One pair cannot establish a repeatable improvement in the largest gap.

## Large stalls and test isolation

A separate GPU benchmark continued running after its chat was paused. The
contended v28.176 native capture delivered 34.9 callbacks/s, with 99.4% average
machine GPU utilization, 129 callback gaps above 50 ms, and a largest gap of
141.7 ms. Game CPU work before that largest gap was 11.0 ms. The sampled WebGPU
queue completion latency had a 105.6 ms median and 249.2 ms maximum; the next
callback after the largest gap began 1.8 ms after that long queue wait resolved.

This supports GPU/browser backpressure as a lead, but machine utilization
includes the other benchmark and queue completion includes main-thread
notification delay. The trace failed to export, so it cannot identify the
responsible GPU stage. The exact competing test process tree was temporarily
suspended for the isolated comparisons. All eight original processes were
resumed after verification, checking PID start times before sending SIGCONT.
Under isolation, unmodified v28.176 already had no gaps above
50 ms. The mask change therefore cannot be credited with eliminating the
severe stalls or raising average FPS.

## Final native comparison

Two full laps used a 2900 by 1394 canvas with native requestAnimationFrame,
observed at 60 Hz. Capture order was v28.177, then v28.176, reversing the paced
pair's order. Queue sampling was off; these runs provide no queue-latency
comparison and do not demonstrate native 120 Hz delivery.

| Two-lap native measurement | v28.176 | v28.177 |
| --- | ---: | ---: |
| Callbacks per second | 59.976 | 60.003 |
| Mean game CPU time | 4.884 ms | 4.893 ms |
| 95th / 99th percentile callback gap | 16.8 / 16.8 ms | 16.8 / 16.8 ms |
| Largest callback gap | 29.1 ms | 24.3 ms |
| Callback gaps above 25 ms | 3 | 0 |
| Callback gaps above 50 ms | 0 | 0 |
| Terrain mask rebuilds | 746 | 174 |
| Terrain texture recreations during capture | 88 | 0 |
| Mask upload payload, bytes | 2,221,572,096 | 667,090,944 |

Both runs remained visible and focused, reached west, east and home twice,
visited all three lakes with active water on both laps, and saw all five
residents with continuing airborne and ground snow. Eligible straight,
airborne cruise had no camera or scenery reversals. World transforms matched
exactly; sampled water-camera error stayed below 0.000370 CSS pixels. These
state checks do not measure physical presentation or every particle's motion.
Both versions were already smooth in this isolated pair. The repeatable result
across both pacing modes is less mask upload and allocation work, with no
meaningful change in callback throughput or average game CPU time.

## Verification and retained evidence

`tools/perf/liquid-terrain-window.cjs` passed 2,200 CPU bounds cases and cache
invalidation checks, plus 108 browser pixel/clip comparisons. Of those pixel
comparisons, 77 were exact; remaining edge differences stayed within the old
one-world-pixel neighborhood, with no changed flat coverage. Fixtures include
long cave walls, surface mouths, discovery edits, bath coordinates, camera
boundaries, resizing and zoom. The existing water-contour smoke check also
passed in WebGPU and CPU modes, with screenshots retained outside the repo.

Raw captures and diagnostics are retained locally under
`~/Downloads/sluice-v137-comparison-2026-10-07/stalls/`: `isolated-before.json`,
`isolated-after.json`, `native-before.json`, `native-after.json`, their analysis
files, `before.json`, and `before.queue-analysis.json`. Process restoration is
recorded separately in `resumed-test-processes.json` in the comparison folder.
