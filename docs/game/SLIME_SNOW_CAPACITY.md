# Slime and snow capacity, October 1, 2026

The target is ordinary Sluice at maximum graphics on Ethan's M1 Pro, with
120 FPS during resident handling and snow. A 120 Hz frame has 8.33 ms available.
Capacity measurements must distinguish CPU physics, snow compute, rendering,
and native browser frame cadence. The component measurements below retain their recorded scope. Earlier fixed-snow
captures bypassed weather bookkeeping and cannot establish full CPU capacity.
Native foreground FPS and normal handling validation remain pending; this is an ongoing project.

## Measurement conditions

The machine has an M1 Pro with eight CPU cores, fourteen GPU cores, and 32 GB
of memory. The built-in panel reports 120 Hz. The controlled full-screen
workload uses a 1512 by 982 CSS viewport, DPR 2, a 3024 by 1964 game canvas,
the Extreme graphics setting, stock exhaust, and existing generated terrain.
Every capture records its power source, thermal report, browser version,
game and GPU source hashes, and instrumentation hashes. Runs are serial.

Owned Chrome for Testing runs keep the owner's windows untouched. A headless
browser has virtual presentation and cannot establish ordinary foreground
game FPS. Native animation callbacks in a focused visible window provide the
practical game FPS comparison; hardware scanout is outside this project. Unlimited animation callbacks also do not demonstrate that
all submitted work completed. The unlimited calibration lost completion
probe coverage and is unsuitable as capacity evidence.

`FRAME_MODE=timer120` requests the complete game workload at 120 updates per
second using real elapsed timestamps. It discards missed timer slots instead
of running bursts. Physics still performs its ordinary elapsed-time catch-up.
This measures service cost and demand response; its callback rate is not
native displayed FPS. Timer jitter and CPU budget violations are reported
separately. CPU buckets overlap and must not be added.

## Controlled populations

`tools/perf/capacity-workload.mjs` injects synthetic initial conditions into
the ordinary game. It removes only soft surface residents, builds replacements
through `surfaceSlimeBuild`, and introduces individual physical snow particles
through `addLiquidParticle`. It uses an existing dry town apron without tile
writes. Initial resident bodies have clear space between their rings and
vertical clearance from the rig and snow. Subsequent movement, contact,
deformation, sleeping and culling are ordinary game behavior.

Fixed snow tests suppress new atmospheric flakes to isolate an initial physical
population. The v28.133 controlled fixture retained the GPU grain solver but
booted with particle weather disabled. WATER=0 also disabled its weather parent,
so those captures omitted CPU maintenance and support construction. v28.134
corrects the weather startup through the ordinary `rainReset(true, true)` snow
front, defaults sweeps to WATER=1, and records climate and support execution.
Ordinary thaw and storage still change active populations; initial
counts alone cannot establish the maintained workload.
Separate normal-weather input routes are needed to validate the full game.
The physical admission limit of 36,000 grains is not a performance promise.

Actual internal body calls, point steps and spring steps are counted without
per-call timers. Reports retain awake counts, actual active and solving body
counts, and bodies intersecting the viewport. A zero-microstep frame has zero
active work in this probe, which does not mean its residents are asleep.
Constructed counts alone cannot establish a capacity if bodies leave the
view or active simulation region. Combined tests use at most six residents,
matching the existing surface moving-boundary export limit.

The first exploratory sweep used a fixture with an initial rig/body overlap
and insufficient snow clearance. It is retained for diagnosis and superseded
by the corrected fixture. It must not establish final capacity limits.

## GPU and completion evidence

The optional recorder retains raw beginning/end timestamp strings and an
encoder span in addition to the old sum of pass times. The span includes gaps
between its recorded passes. Empty indirect queries remain visible in raw
data; malformed or incomplete samples are marked partial and excluded from
cost comparisons. Large integer timestamps are never converted to Number
before subtraction.

Sampled liquid encoders omit queue wait, WebGL smoke, main-canvas raster work,
and composition. A handful of samples cannot establish a strict p99 limit.
The completion probe records submitted water quanta and grain ticks, plus
completion notification times. Notification delay includes renderer delay;
pending promises do not measure actual GPU queue depth. Missing, dropped or
unfinished probe coverage prevents a positive coverage result.

Isolated GPU quantum comparisons use one device, separately compiled engines,
matched particle resets and ABBA ordering. They preserve every production
boundary stage, index rebuild and physical quantum. The earlier attribution
driver split terrain into an extra compute pass; its full spans include that
diagnostic boundary and are not literal production frame costs. Fusion tests
must use the original unsplit passes on both sides.

## Current findings and candidate policy

Late frames request extra slime and snow physics steps. This feedback can
make a modest initial slowdown grow sharply. Raw FPS versus population cannot
by itself prove a quadratic algorithm. Costs must also be compared per actual
body call, point step, grain tick and water quantum.

Several exact candidates have been tested and are not accepted solely because
they reduce operation counts. Touched hash clearing and material array/damping
caches showed no useful measured gain. Smaller snow thread groups did not
improve the whole quantum consistently. Dense unresolved-support bounds made
an adversarial disconnected clump cheaper but regressed ordinary beds.

The pair-bounds cache passed full production material, orientation, skin and
terrain closure comparisons. Whole-game ABBA results showed only modest gains
and substantial trajectory/cadence variation. Shared snow-field clear reuse
passed mixed-water, grid, heat and failed-submission comparisons; larger
isolated quantum workloads improved about 2.5%. The shared-clear candidate remains private because the whole-game comparison
did not show a consistent gain. In v28.133, the simpler strictly disjoint skin
bounds rejection is accepted as a small CPU optimization. It preserves the
original touching/collinear tests and passed 315,792 geometry comparisons plus
30 full production trajectories. Fixed nominal-step CPU savings were about
0.9% for five bodies and 3.5% for 64. Whole-game five-body results overlapped,
so this does not establish a larger 120 FPS capacity.

## Measured service costs

These are headless workload callbacks requested at 120 per second, with the
ordinary elapsed-time catch-up intact. They are not native game FPS. Captures
lasted about 30 seconds after ten seconds of warmup. The selected slime rows
and the combined 36k row are AC repeats. All snow-only and other combined rows
ran on AC. CPU and GPU run concurrently; do not add their durations.

| Active slimes | Service callbacks/s | CPU median / p95, ms | Frames over 8.33 ms | Internal body calls, median |
| --- | ---: | ---: | ---: | ---: |
| 0 | 119.99 | 1.3 / 1.9 | 0 / 3600 | 0 |
| 3 | 119.92 | 2.9 / 3.5 | 0 / 3598 | 9 |
| 4 | 119.22 | 3.2 / 4.1 | 0 / 3577 | 12 |
| 5 | 117.46 | 3.5 / 4.3 | 0 / 3524 | 15 |
| 6 | 105.83 | 4.2 / 6.5 | 0 / 3175 | 18 |
| 8 | 91.18 | 5.1 / 8.4 | 170 / 2736 | 24 |
| 28 | 14.74 | 63.0 / 65.4 | 443 / 443 | 420 |
| 64 | 6.32 | 153.3 / 156.1 | 190 / 190 | 960 |

Six is an observed CPU-budget passing population in this stationary fixture,
not a 120 FPS whole-game limit. This historical fixture also excluded ordinary
particle-weather bookkeeping. At 28 and 64 the solver performs fifteen
microsteps per body per frame, compared with three near 120 callbacks/s. All
requested bodies were solved, but median onscreen counts were 24 and 49. The
large-population rows therefore measure more physics bodies than visible
residents. The fixed-step early-fall CPU benchmark was much closer to linear,
with about 0.8 ms for five and 11.6 ms for 64 before other game work. Sustained
floor contacts and catch-up make the full-game costs larger.

Clustered snow below retained every individual grain. GPU spans are sparse
samples of the liquid encoder, including gaps between its passes. Each
quantum includes three grain ticks. A two-quantum encoder is ordinary work
even near 120 FPS, since the liquid scheduler advances about 166 quanta/s.

| Grains | Snow alone service callbacks/s | GPU median span, one / two quanta, ms | Five slimes plus snow service callbacks/s | Combined GPU median span, one / two quanta, ms |
| --- | ---: | ---: | ---: | ---: |
| 4,000 | 119.89 | 2.36 / 4.77 | 113.36 | 3.24 / 6.77 |
| 8,000 | 119.93 | 2.73 / 5.71 | 112.78 | 3.69 / 7.91 |
| 14,000 | 119.96 | 3.10 / 7.06 | 111.26 | 4.62 / 8.96 |
| 24,000 | 119.92 | 4.10 / 8.31 | 104.39 | 5.32 / 10.96 |
| 36,000 | 117.29 | 5.29 / 10.63 | 54.80 | 6.40 / 13.98 |

The combined 36k AC repeat had 294 of 1644 CPU frames over budget and median
30 internal body calls. It also submitted 553 five-quantum encoders; eighteen
sampled five-quantum spans had a median 31.77 ms. All five residents stayed
active, solving and onscreen on the median stepping frame. The original 36k
combined capture overlapped an unrelated browser test and is superseded by
this repeat. Dense-snow notification delays and sampled over-budget spans
prevent treating fast synthetic callback rates as completed native frames.

The rendering diagnostic drew all five residents on every captured frame.
Their drawing CPU cost was about 0.20 ms/frame, and the bath exterior cost
about 0.22 ms/frame. Accelerated canvas backend/compositor host spans were
larger, but overlap and include waits. They are not calibrated GPU execution
or a measured critical path. Adding resident sprite caches cannot be justified
as the main solution from these CPU timings.

Predict/terrain dispatch fusion passed 684 exact comparisons but failed to
improve the larger isolated GPU workloads, so it remains excluded. Combining
the initial guest parity and nearest-face loops changed a finite contact cache
float by one representable value in a normal floor-pinch fixture. The baseline
repeat passed. That candidate failed its exact gate; a mistakenly launched
subsequent timing run is quarantined and does not support adoption.

A per-grain active-frontier solver could reduce quiet-bed work, but snow
currently ignores and clears the water sleeping bit. Safe resting grains
would need full occupancy, neighbor/support wake coverage and a static contact
model. Low velocity alone is insufficient. Such scheduling cannot reduce the
all-active solver's required work; it remains a design option rather than an
implemented or measured optimization.

## Accepted snow search change, v28.134

Snow support rebuilding is a live CPU bottleneck. A second ten-second natural
capture sampled the actual call tree and timed 157 builds at 5.228 ms/build.
All 157 build frames exceeded 8.33 ms, including 67 with nominal three slime
microsteps and eleven without a slime solve. Another 187 no-build frames also
exceeded the budget. Support is a specific cost, not the sole cause.

v28.134 queries only neighbor cells intersecting a conservatively padded
contact rectangle. The original Number distance predicate and surviving
traversal order remain unchanged. Unsupported coordinates/constants and world
edge columns retain the original traversal. Particle identities, positions,
velocities, mass, GPU steps and rendering are unchanged. The portable frozen
v28.133 differential test checks ordered beds, heads, complete scratch arrays,
queues, ground arguments, signed zero, NaN payloads, f32/Number thresholds and
fallbacks. Both real captured states also pass. The mixed natural state reduces
distance checks from 233,529 to 118,852 while preserving every accepted link.

Six serial ABBA cycles in owned Chrome for Testing measured the complete CPU
support closure with an O(1) recorded ground-root oracle. These are isolated
function costs, excluding production terrain-query service and all GPU work.

| Captured or synthetic state | Original median, ms | v28.134 median, ms |
| --- | ---: | ---: |
| Captured 14,000 snow grains | 4.7 | 3.6 |
| Natural mixed state, 15,902 snow among 36,289 liquids | 5.5 | 4.1 |
| Layered 14,000 grains | 3.2 | 2.4 |
| Layered 36,000 grains | 8.9 | 6.5 |
| Compressed rooted 14,000 grains | 2.9 | 2.4 |
| Disconnected adversarial 4,096 grains | 11.0 | 10.9 |

The natural candidate route subsequently averaged 3.790 ms/build on 141
builds, with median 14,058 active snow grains. Different trajectories and
additional diagnostic counters prevent a controlled FPS or function-speedup
claim from that route alone. All 141 build frames still exceeded the CPU
budget. No 120 FPS capacity is established by this release.

Two exploratory full-game comparisons had zero support calls and are excluded
from candidate acceptance. A corrected bookkeeping run observed completed
support calls, but its seeded snow changed during ordinary maintenance. It is
boot and instrumentation validation, not a sustained 14,000-grain comparison.
The final cold-front boot check maintained all 14,000 active grains and all five
solving, onscreen residents for its ten-second capture. It completed 125 support
builds without errors. CPU median/p95 were 4.4/9.5 ms, with 128 of 953 frames
above 8.33 ms. Five sampled two-quantum GPU spans had median 11.223 ms and all
exceeded 8.33 ms. This short timer-paced service check validates the corrected
workload, not a native FPS limit or a controlled baseline/candidate speedup.
Historical WATER=0 tables above remain component diagnostics.

A separate untimed live debugger run paused the unmodified production support
loop in an ordinary snowy game with all five original residents. It stepped
through one failed distance comparison and the linked-list continuation.
Pausing stopped recording first; its six snapshots contain no FPS inference.

The natural smoke probes identify two other costs: deposits took 390.7 ms and
alpha calculation 204.8 ms over the ten-second window. These are 60.2% and
31.5% of the six measured smoke subpasses. The painter rebuilt on 610 of 761
calls, usually after mutation-sequence changes; 96.0% of alpha bins were empty.
Counters add overhead, and stage spans nest inside smoke drawing. Exact empty
alpha arithmetic and certified deposit-prefix reuse remain measured-target
proposals. GPU contacts, fallback and guest collisions remain substantial.

## Natural input-route follow-up

A separate v28.133 five-minute background route retained the original five
resident IDs, natural snow and rain, water, stock smoke and native headless
animation callbacks. It used real walking, mouse grips and jets, without a
population fixture or body/world writes. Every original resident was held
and transported for more than ten seconds. All five reached a 140 px x-span,
then dispersed again; the full capture is not one permanent stack.

The route retained 33,032 recorded frames. Of these, 6,665 synchronous CPU
frames exceeded 8.33 ms, about 20.18%. Its worst full-second callback rate was
61.90. This is a diagnostic background workload, not a foreground 120 FPS
capacity measurement. It confirms that ordinary handling needs more work
and that a quiet count-only fixture is insufficient to establish the owner's
whole-play target. Most CPU overruns, 5,205 frames, occurred at the normal
three microsteps. Catch-up alone does not explain them. In one slow second,
the particle/weather update took about 4.05 ms, slime work 3.20 ms and drawing
1.84 ms; these selected sibling buckets still omit other frame work. GPU
contacts, guest collision and fallback remained major sampled costs. The
weather bucket prompted the finer attribution below.
The actual viewport counter also avoids treating the recorder's expanded
culling margin as literal onscreen coverage.


A subsequent input-only repeat enabled eleven aggregate particle CPU probes
for ten seconds after the observed carry histories completed. Its 719
instrumented frames contained 130 support builds. Support construction took
650.5 ms in total, 5.00 ms per build on average and 6.6 ms at maximum. All 130
build frames exceeded the synchronous CPU budget, including 57 frames still
at the nominal three slime microsteps. Another 205 frames exceeded the budget
without a support build. This identifies a specific CPU spike to optimize;
it does not establish that support construction is the sole remaining cause.

Support construction was 45.1% of the inclusive snow CPU time in that window.
Air projection took 87.5 ms and the probed synchronous readback method took
111.7 ms in total. These are nested costs, not additional frame totals. The
readback probe omitted direct engine applications outside that method. Snow
scan includes support construction, and the particle parent includes both.
Sampled one-, two- and five-quantum liquid encoder spans had medians of
5.66, 11.39 and 30.26 ms respectively. Workload quanta must remain separate.

All five original residents completed verified carry histories, but their
later positions differed from the prior route. Only two were onscreen at
probe enable; all five were onscreen on 54 of the 719 instrumented frames.
The probe is therefore an attribution experiment, not a maintained five-body
pile or an instrumentation FPS comparison. It remained on AC power, with
natural weather, water and stock smoke. Full raw data and the report are in
`v133-natural-particle-cpu.tar.gz` and
`reports/sluice-v133-natural-particle-cpu-results.md` in the Downloads packet.

## Reproduction and remaining validation

v28.135 adds exact append-prefix reuse and an empty-bin alpha shortcut to the
desktop smoke obstacle painter. Its browser pixel gates and ordinary handling
observations are recorded in [SMOKE_OBSTACLE_CACHE.md](SMOKE_OBSTACLE_CACHE.md).
The candidate's natural route still exceeded the CPU frame budget frequently;
it does not establish the whole-game 120 FPS target.

A private snow guest crossing-edge index passed 3,348 exact GPU cases but saved
only about 0.7 to 3.3 percent in the frozen grain-solver replay. It remains outside
production. That replay excludes water solving; live liquid-frame spans include
water work between grain quanta. A separate four-write endpoint probe still
measured a 9.235693 ms median for three two-quantum samples of the actual controlled
14,000-grain game workload. Its timing trace exported completely, but the subsequent
extended state snapshot failed and supplies no replay state. These small diagnostic
samples establish a budget failure in that workload, not a native FPS limit or a
causal measurement of timestamp overhead.

A subsequent bounded export completed the actual trace-end state using sequential
64 KiB readbacks and persisted chunks. Its ten endpoint samples had no GPU errors;
seven two-quantum spans had a 9.774809 ms median, while two one-quantum spans had a
4.466578 ms median. The snapshot retained 14,000 active snow grains and 4,091 other
material records. Its position-derived histogram had 3,022 occupied global cells,
4.63 grains per occupied cell on average, and 60 at the maximum. The older wide
bed had 3,390 occupied cells, 4.11 on average, and 41 at the maximum. These are
different physical states, not a controlled attribution of the span difference.
The snapshot is complete for current resident, air and active-grid ranges, but
omits persistent mixed-grid tails and CPU histories and is not guaranteed to match
a timestamped frame. It cannot certify a complete mixed-water replay.

Run an explicit serial matrix outside the repository:

```sh
MATRIX=/absolute/path/matrix.json DUMP=/tmp/sluice-capacity \
WARMUP_MS=10000 DURATION_MS=30000 \
node tools/perf/capacity-sweep.mjs
node tools/perf/capacity-report.mjs /tmp/sluice-capacity/run-directory
```

Each matrix row provides a unique name, slime count, snow count and layout.
The report separates workload throughput from native foreground game FPS
and retains CPU budget violations, actual body work and GPU quanta. No solver quality, material count or particle identity
is reduced to pass a performance gate.

Use one dedicated Chrome for Testing window for the controlled native sweep,
after the owner confirms it can stay in front:

```sh
RUN_OWNED=1 OWNER_READY=1 VISIBLE=1 FRAME_MODE=native \
MATRIX=/absolute/path/matrix.json DUMP=/tmp/sluice-native-capacity \
WARMUP_MS=5000 DURATION_MS=20000 \
node tools/perf/run-native-capacity.mjs
```

This parent owns one exact testing process and reuses its page. It verifies
process/profile/debug-socket ownership, tracks focus and visibility throughout
each capture, records the actual viewport, and closes its own process on exit
or interruption. No synthetic pacing is applied in visible mode. A native
limit must include observed frame pacing, workload coverage and graphics
conditions; hardware scanout certification is not required.

Normal handling validation should use the ordinary focused game on the owner's normal
display and graphics settings. Record quiet travel away from town, handling
the natural five residents through snow with pushes, jets and grabs, then
travel away again. F9 starts and saves the recording. This checks native
callback performance and recovery without treating a background 60 Hz or
synthetic timer result as a 120 FPS success.

Raw project captures, rejected candidates, source snapshots and reports are
kept in `~/Downloads/sluice-capacity-project-2026-09-30/`. Final population
limits and native validation remain pending.
