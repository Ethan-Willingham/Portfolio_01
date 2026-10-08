# Town flight hitch investigation, v28.173

The supplied v28.172 recording shows a real slowdown while crossing town at
Extreme graphics. The latest screenshot also retains a 180.7 ms callback gap
after a 173.7 ms game frame, including 115.3 ms drawing terrain. This release
bounds that terrain rebuild burst and removes repeated work from water
streaming, smoke obstacles, boiler geometry, and saving. Sustained 144 Hz remains
unmet on the test computer.

## Supplied evidence

The 30-second recording contains 3,939 callbacks, averaging 131.3 callbacks/s
and 4.79 ms of measured game CPU work. Flight above 80 world pixels/s averages
127.2 callbacks/s, compared with 136.8 while stationary. Individual late seconds
fall to about 109 and 102 callbacks/s. Snow and rain are off in this recording.
There are seven residents, usually two awake, and an active boiler.

The canvas is 2561 by 1440 at DPR 1.125. That is approximately 53% more pixels
than the earlier 2023 by 1192 test canvas documented in
[the v28.172 investigation](PERFORMANCE_144_WINDOWS.md). The new native tests
use 2276 by 1280 CSS pixels at DPR 1.125, producing a 2560 by 1440 canvas on
the same i7-9700K, RTX 3080, Chrome 155, and approximately 143.9 Hz display.

The retained history includes a 130.6 ms game frame with 45 terrain chunks
rebuilt and 66.1 ms spent drawing terrain. Large pond-streaming mutation batches
also cost several milliseconds on the GPU. Three roughly 24 ms auxiliary
updates coincide with grounded, ten-second dock autosaves. These are separate
sources of hitching; an unexplained callback gap is still not proof that its
entire duration belongs to the preceding frame's largest CPU bucket.

## Changes

Live terrain rebuilding now retains old ready bitmaps during a render-scale
change and refreshes at most one chunk per frame. Zoom, resizing and slime
activation previously permitted up to 80 synchronous rebuilds during play.
Loading retains its covered warmup allowance. Pending scale changes remain
visible in diagnostics, and strip runs split at bitmap-scale boundaries so a
mixed-scale view uses each chunk's correct source crop.

Large homogeneous water appends use distinct parallel destinations. Pure
swap-removals compute the exact survivor identity map and copy the GPU's live
tail rows in parallel. Changed surviving destinations and their source rows are
disjoint. Mixed edits, small batches, fractional indices and pending or rejected
optional pipelines retain the serial replay. Mutation ordering and asynchronous
readback journals are preserved.

On this RTX 3080, the final eight-trial GPU timestamp check reduced median
11,790-particle append time from 4.17 to 0.0043 ms. Median 7,777-particle removal
time fell from 6.75 to 0.0058 ms, and median 2,520-particle removal time fell
from 2.43 to 0.0059 ms. One candidate removal sample reached 0.12 ms; the other
samples remained below 0.007 ms. These are isolated mutation pass timings, not
complete-frame timings.

Smoke obstacle coverage reads a padded terrain halo once instead of repeatedly
looking up eight neighbors for every empty cell. Chamber walls and vents cache
their immutable mask until the chamber changes. Boiler gas remapping skips its
breadth-first search when no fluid cell became covered, and surface adjacency
keeps the same priority without allocating a four-element array per cell.

Saving builds per-save cleared-air row flags and caches the empty-air palette
index. Accessor or coercible cleared-air dictionaries keep the original lookup
order. The format and synchronous save triggers stay unchanged. On the actual
browser test world, median encoder time fell from 18.4 to 16.75 ms, with exact
output equality. Larger gains in air-heavy synthetic worlds do not describe
this live result.

## Native town flight

Twenty-second visible, focused, normal-vsync captures use the same keyboard
corridor, a running clock, seven ordinary radius-25 residents and three burning
boiler chunks after a ten-second warmup. Fuel and hull remain positive; the
route aborts rather than measuring a death screen or stranded rig. World
generation remains random, so this is a matched workload, not an exact replay
of the owner's save.

| Full-resolution town flight | v28.172 | v28.173 |
| --- | ---: | ---: |
| Native callback rate | 125.6/s | 132.8/s |
| Mean game CPU time | 4.55 ms | 4.15 ms |
| 95th percentile game CPU time | 7.6 ms | 6.6 ms |
| 99th percentile game CPU time | 10.7 ms | 9.2 ms |
| Callback gaps above 8 ms | 335 | 206 |
| 95th percentile callback gap | 13.9 ms | 13.9 ms |
| Largest callback gap | 34.8 ms | 34.7 ms |

That is approximately 39% fewer callbacks missing the next refresh interval,
with a 5.8% higher callback rate. Both runs retain all seven residents and all
three burning chunks, report no browser errors, and keep every captured frame
visible and focused. Boiler steps advance in both runs. This measures native
requestAnimationFrame delivery, not independently measured screen presentation.
The unchanged gap percentiles and occasional 35 ms delays show that the smaller
remaining stutters are not eliminated.

Reproduce with `tools/perf/audit-sluice.mjs`,
`EXPERIMENT=tools/perf/town-flight-fixture.js`, `SCENES=human-flyover`,
`FLIGHT_ROUTE=town`, `QUERY=snow=0&auditfire=1`, `SAVED=extreme`,
`WIDTH=2276`, `HEIGHT=1280`, `DPR=1.125`, `HEADED=1`, `PROFILE=0`, `GPU=0`,
`WARMUP=10`, `SECONDS=20`, `CLOCK=1`, and `TOD=.55`. Put `DUMP` outside the
checkout. For the baseline set `BUNDLE_REF`, `LIQUID_REF` and `FIRE_REF` to
`b6dc539759097cdf386ea535692516c37ae81ea6`.

## Combined snow browser check

A separate full-resolution, Extreme, headless browser run retains all eight
awake residents with finite centers and bounds, 7,104 liquid solver particles,
2,974 physical snow particles, and active snow airflow at the end of a mixed
grab, walk and jet route. The clock runs, all production physics flags remain
enabled, and no browser errors occur. This establishes runtime compatibility,
not native display performance.

The attempted native candidate snow runs became hidden before initial loading
animation frames could execute. They are excluded from performance results.
The native baseline completed at 116.6 callbacks/s, but there is no valid native
candidate snow comparison in this follow-up. A steady 144 FPS claim would be
unsupported in both the town and combined workloads.

## Verification

The terrain budget fixture exercises 25 scale transitions and 1,052 frames,
including repeated scale changes, dirty chunks, loading and live cold views.
A browser check refreshes 96 real chunk bitmaps at one rebuild per frame,
retains their ready state, converges completely, and compares every final
bitmap byte with a full rebuild. The final direct-path terrain composition also
matches exactly. The measured largest refresh frame in that check was 13.5 ms;
the test is a paused rendering workload, not a native flight FPS measurement.

The regression commands are:

```text
node tools/perf/terrain-rebuild-budget.cjs
node tools/perf/liquid-ops-equivalence.cjs
node tools/perf/liquid-ops-gpu.mjs
node tools/perf/fire-geometry-equivalence.cjs
node tools/perf/save-world-equivalence.cjs
node tools/perf/smoke-terrain-coverage.cjs
node --check js/sluice.js
node tools/toy-engine-sync.mjs --check
```

CPU checks cover 729 mutation streams and 458,599 active rows plus five optional
pipeline lifecycle cases, 736 exact boiler geometry/upload snapshots, 277 exact
save outputs plus repeated mutation between saves, and 1,416 exact smoke painter
checks covering 1,205,008 cells. Real GPU checks compare all active position,
affine, auxiliary and flag words and the readback journals across 22 mutation
cases and subsequent mixed edits. No resolution, graphics preset, population,
solver step count, or OS setting is reduced by this release.

Git Bash could not fork the pre-commit hook on this Windows host, reporting
0xC0000142. Direct engine synchronization, staged-content checks, and an exact
comparison of the staged bundle with all 135 staged fragments passed. The
commit uses the repository's documented hook exception.
