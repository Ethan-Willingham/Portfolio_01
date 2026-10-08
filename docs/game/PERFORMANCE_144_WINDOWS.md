# 144 Hz Windows performance investigation

The full-resolution v28.173 town follow-up is documented in
[Town flight hitch investigation](PERFORMANCE_TOWN_V28_173.md).

Delivered in v28.172. On the owner's computer, the matched eight-resident route
improved from 86.8 to 121.1 callbacks per second, with average game CPU time
falling from 10.13 to 5.28 ms. The sustained 144 Hz target remains unmet. The
owner requested that the verified gains be shipped and the investigation finish.
No graphics preset, rendering resolution, solver iteration count, or population
was reduced to obtain these gains.

## Test computer and workload

- Intel Core i7-9700K, 8 cores, 32 GB RAM.
- NVIDIA RTX 3080, Windows driver 32.0.16.1088.
- Chrome 155.0.8059.39, hardware WebGPU on the NVIDIA adapter.
- Display mode 2560 by 1440, approximately 143.9 Hz.
- Extreme graphics, 1798 by 1060 CSS viewport at DPR 1.125. The game canvas is
  2023 by 1192 pixels, within one pixel of the supplied capture.
- Normal seeded world, native ponds, falling and settled snow, normal water
  streaming, smoke, and all production physics enabled. The combined fixture
  uses two or eight ordinary radius-25 residents. It repeats real grab, walk,
  and jet inputs without reducing solver steps, populations, or resolution.
- Native measurements use a visible, focused disposable Chrome profile, normal
  vsync, a ten-second warmup, and no CPU profiler or GPU timestamp instrumentation.
  Traces and timestamp runs are separate diagnostic captures.

The repeatable route is `tools/perf/audit-sluice.mjs`, with `SCENES=slime-snow`,
`HEADED=1`, `PROFILE=0`, `GPU=0`, `SAVED=extreme`, `WIDTH=1798`, `HEIGHT=1060`,
`DPR=1.125`, `WARMUP=10`, and `RESIDENTS=2` or `8`. Set `SECONDS` explicitly
and put `DUMP` outside the checkout. See `tools/perf/SLIME_SNOW.md`.

## Measured results and limits

These matched native runs used 30-second captures after warmup, with time of day
held at noon. The original bundle and liquid engine were read from commit
`4219c6f6c5e2bf86316d5e14ac156720f0184598` (v28.171).

| Eight-resident mixed route | Original | Delivered optimizations |
| --- | ---: | ---: |
| Native callback rate | 86.8/s | 121.1/s |
| Average game CPU time | 10.13 ms | 5.28 ms |
| 95th percentile game CPU time | 14.8 ms | 7.7 ms |
| 95th percentile callback gap | 20.7 ms | 13.9 ms |
| Largest callback gap | 48.5 ms | 27.8 ms |

That is about 40% more callbacks per second and 48% less game CPU work per
callback. The accepted-build capture predates only a signed-zero equivalence
repair in the CPU snow-air sum, which was subsequently regression tested.
A final 20-second two-resident production check with the clock running averaged
131.5 callbacks/s, 3.77 ms game CPU time, and a 13.9 ms 95th percentile callback
gap. It reported no browser errors. An earlier fixed-noon development run reached
approximately 135 callbacks/s, compared with 110.3/s in the original build.
These are supporting evidence, not a claim that all play holds those rates.

The harness measures native `requestAnimationFrame` delivery, not independently
observed screen presentations. Short controlled captures also do not establish
performance during every weather event or a long play session. Browser and GPU
service overhead still causes missed refresh intervals. The game's performance
panel now budgets against 144 FPS (6.94 ms); changing that target does not change
the fixed 120 Hz physics rate or establish that rendering meets it.

## Supplied capture and bathhouse defects

The v28.171 capture's retained 30 seconds contained 3,728 callbacks: average
CPU work 4.96 ms, 95th percentile 7.8 ms, and average arrival gap 8.05 ms.
Its session history also retained older stalls outside that window. The
124.9 ms arrival gap followed 10.6 ms of CPU work, including 4.8 ms of slime
work. That evidence did not justify blaming the entire delay on slime physics.
The former bathhouse timing bucket also included liquid readback and streaming.
Those operations now have their own measurements, and unexplained gaps retain
an unknown cause instead of inheriting the largest preceding CPU category.

Three physical defects could affect a newly softened guest:

1. Its first launch could encode velocity using the boot-time step rather than
   the actual solver substep, producing three times the intended velocity.
2. Paid guests could be born into the same occupied door position while outdoor
   residents were frozen during the interior view. A blocked guest now waits
   indoors, retaining its payment and identity.
3. Rock contact used stale body velocity and whole-body mass for an impulse
   applied to a small weighted skin patch. Repeated contacts could add energy.
   The response now uses live weighted point velocity and effective patch mass.

Browser verification covered natural payment and departure, an occupied exit,
save and reload while blocked, two released residents, and subsequent live
physics. Both residents remained finite and normally shaped. Save files retain
resident identity and position, and reconstruct their rest skin on load.

## Optimizations with preserved results

CPU changes remove repeated work from slime contacts, spring and movement loops,
terrain queries, snow airflow, snow-bed queries, rig hull construction, smoke
painting, bath waterline calculation, and hearth contact allocation. Regression
fixtures compare full states or typed-array bytes against the prior algorithm,
including mixed body layouts, degenerate contours, terrain boundaries, particle
append invalidation, and sliced snow-support construction. The rock response is
checked for momentum and energy behavior rather than equality to the defective
response.

The live WebGL smoke renderer also avoids resubmitting unchanged uniforms. Its
cache belongs to each uniform location, distinguishes signed zero, and never
elides NaN writes. GPU comparison verified identical fields, pixels and draw
states across 18 scenarios. The dormant WebGPU smoke implementation remains off.

## Browser service bottleneck

A separate 15-second two-resident Chrome trace found roughly 14.47 seconds of
thread CPU on `CrGpuMain` during 15.4 seconds of traced activity, about 94% of
one core. Renderer-main thread CPU was about 8.03 seconds. GPU-process service
spans included about 6.62 seconds processing WebGPU and 6.05 seconds processing
canvas raster commands. These are CPU service costs, not shader execution times.
Main-frame dispatch queues were usually prompt, while compositor swap throttling
and delayed presentation showed backpressure after rendering submissions.

This explains why measured JavaScript work and GPU shader timestamps can both
look acceptable while native frame delivery misses refreshes. An opaque,
desynchronized main-canvas experiment did not improve delivery and is not part
of the production change.

The accepted sparse-field optimization skips liquid-field clears only after a
clear has already made those fields empty, and only within the same frame
encoder. P2G and grid updates invalidate that certificate. The first clear,
neighbor counts, and standalone calls retain their original behavior. This
removes 18 redundant dispatches from a two-quantum mixed fixture. Real GPU tests
verify every field plane is exactly zero at the required checkpoints, including
heated guests, dense/sparse transitions, and moving grid origins.

Guarded snow and collision-queue kernels now dispatch a conservative direct
upper bound. Their existing count guards return before any out-of-range access,
so the active invocation set and shader arithmetic are unchanged. This removes
38 indirect dispatches from that mixed fixture, avoiding their browser validation
overhead while allowing idle lanes to return immediately.

The 64 by 64 snow-air pressure solve retains all 60 iterations inside one
workgroup, reducing command submission by 59 dispatches. Hardware limits choose
256, 512, or 1024 lanes. Cached cell weights preserve the original arithmetic;
real GPU comparisons checked both pressure banks and downstream field/output
bytes. The original 60-dispatch path remains active while the optimized pipeline
compiles, on unsupported adapters, or if validation fails.

Sparse grid clearing combines compatible field and index resets, with the
original clear path retained below the required storage-binding limit. Terrain
passes skip queue resets only when they cannot access those queues; subsequent
particle passes still reset them. Live frames upload only the GameParams slots
they consume, while standalone steps keep all slots available. GPU and lifecycle
fixtures cover fallback limits, delayed compilation, validation rejection,
disposal, dense/sparse transitions, and three-to-five-step catchup frames.

## Verification and handoff

The committed regression fixtures cover bath launch and blocked exits, rock
momentum/energy, full slime state equivalence, thin and degenerate skin contours,
snow airflow including signed zero and subnormal values, rain and snow contact
bounds, smoke shader/draw equivalence, liquid field clearing, direct dispatch
domains, pressure fusion, and asynchronous pipeline fallbacks. Build, JavaScript
syntax, game browser boot, and the shared toy engine synchronization are checked
for the final bundle. The generated physics toy receives the same engine copies
and its own cache version bump.

Git Bash could not fork the pre-commit hook on this Windows host (0xC0000142).
Engine synchronization and the hook's staged-content checks passed when run
directly, as did an exact comparison of the staged bundle with all 135 staged
fragments. The commit used the repository's documented hook exception.

Experiments without demonstrated end-to-end improvement were excluded. These
include an opaque/desynchronized canvas, sky snapshots, grass batching, bank
path caching, compute-pass coalescing, and broader air-rectangle shortcuts.
Packed readback and direct sparse dispatch candidates were also held outside
production when the owner requested the final push. No OS, driver, browser
profile, or power-plan settings were changed.
