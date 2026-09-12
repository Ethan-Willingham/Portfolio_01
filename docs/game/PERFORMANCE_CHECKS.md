# Sluice performance checks

## Repeated terrain and water work (v26.107)

The cave contour cache keeps twelve immutable paths. Each lookup compares the
actual tile occupancy and shape tuning, so direct mining, bomb, save/load and
dev mutations cannot leave a stale collision outline. Camera movement alone
reuses the path while retaining the original fractional raster transform.

Slime water-density lookups reuse an unchanged WebGPU mirror only when the
readback generation, particle mutation sequence, array identities and exact
query bounds also match. CPU water still rebuilds every frame. Dissolve dwell,
melting, density thresholds and the existing bin overflow order are preserved.

```sh
node tools/perf/frame-cache-equivalence.mjs
node tools/perf/scroll-smoothness.mjs
```

The first tool compares against `387a4cb`: 333 exact path-command comparisons
and 659 water-interaction frames, including edits, tuning, readbacks, mutations,
CPU fallback, guests, invalid positions and overflow. It checks bounded path
storage and confirms that repeated water queries actually skip rebuilds.
The second runs a real browser flight and reports raw frame arrival intervals
separately from whole-frame CPU time and rendering time. Its 25 checks cover
scroll direction, texture warming, incremental texture equivalence, timing
metrics and fractional terrain-chunk joins. `CHROME` overrides its browser;
`DUMP` retains reports outside the checkout. Windows uses Chrome with D3D11.

A nine-second 1920x1080 flight on the owner's NVIDIA Ampere adapter, using
WebGL smoke and WebGPU water, gave these paired samples against v26.102:

| Work | Before | After |
| --- | ---: | ---: |
| Cave outline CPU time, whole flight | 453.7 ms | 55.3 ms |
| Average whole-frame CPU work | 3.58 ms | 2.95 ms |
| 99th-percentile whole-frame CPU work | 11.1 ms | 8.4 ms |
| 99th-percentile frame arrival interval | 20.8 ms | 14.1 ms |

These samples ran during concurrent development. Average frame intervals were
about 7.8 ms in both paired runs, so this does not establish a locked 144 FPS
result. Shader cost, graphics compositing and browser scheduling remain areas
to measure. Moving the smoke obstacle canvas to CPU rasterization was also
tested: its upload cost rose to about 2.9 ms per frame, so that experiment was
discarded. No rendering resolution, particle count or physics rate was reduced.

## Earlier optimization passes

The v26.76 optimization preserves the existing water shaders, simulation passes,
substeps, particle counts, smoke resolutions, slime rendering and physics tuning.
The comparison baseline is commit `f392c72` (v26.73); the intervening v26.74
message changes are included in the release. The physics demo embeds the same
smoke/slime code and is synchronized at v4.31 with matching cache versions.

## Changes

- Water records its live simulation passes in one command encoder per frame.
  Pass boundaries, indirect-dispatch copies and substep ordering stay intact.
  Physics uniforms upload once per frame. Terrain is sampled every frame, but
  identical packed masks are not uploaded again. A failed encode clears the
  shared encoder so standalone calls and CPU fallback remain usable.
- The rig's water coverage scan returns once ten of sixteen cells are covered,
  when its existing cushioning/submersion result is already saturated at one.
- Smoke reuses sampler/viewport state within the pressure iterations, retains
  obstacle texture and vertex-buffer allocations, and uploads only drawn
  vertices. Resize and format probes release obsolete GPU resources.
- Small slime contact scenes count-sort occupied hash buckets while preserving
  the exact candidate order. Scenes above 256 points retain the dense index.

## Reproduce the equivalence checks

Run from the repository root with Node 22 or later:

```sh
node tools/perf/liquid-command-order.mjs
node tools/perf/smoke-equivalence.cjs
node tools/perf/slime-contact-equivalence.mjs
node tools/jello/jello-overlap.mjs
```

The three equivalence tools read the baseline through `git show`; `BASE_REF`
can override it. Smoke uses `~/.local/bin/agent-chrome-for-testing` (override
with `CHROME`), owns its browser process, and writes its report under the system
temporary directory unless `DUMP` is supplied. Slime accepts `BENCH=0` to omit
timing. There are no npm dependencies.

- Water: 16 dense/sparse, bath, declump and fixed-step combinations across 48
  live frames have identical command/pass/copy order and uniform bytes. Also
  tests terrain edits, shifted/resized masks, reseeding, tuning, failure cleanup,
  and all 65,536 water-coverage masks. This is a stub GPU test; actual shader
  execution still needs the browser boot and pond checks described in GAME.md.
- Smoke: every rendered byte matches at 28 checkpoints across WebGL2, WebGL1,
  manual filtering, shading, obstacle painting, scrolling, clearing and resize.
- Slime: 2,000 solves across 200 scenes have identical position/velocity bytes,
  contact counts, hit counters, sleep/wake flags and player-interaction stamps.
- Actual WebGPU runs passed dense/sparse five-substep frames with the bath
  heat path enabled and disabled, plus pond drainage. Desktop and mobile
  CPU-water fallback boots and smoke-driven flight completed without errors.
- The full overlap suite passed 29/30 checks. S7, which forcibly creates a
  slime entirely inside solid ground, also fails on the unchanged baseline
  (one embedded point there, two in the release run). This pre-existing rescue
  issue remains. Rams, crowding, walls, falling and water entry passed.

## Measured scope

Local samples on an Apple M1 Pro, Chrome for Testing 148, Metal WebGPU:

| Workload | Before | After |
| --- | ---: | ---: |
| Water command buffers, 480 sparse bench frames | 8,534 | 560 |
| Water buffer uploads, same run | 7,827 | 3,840 |
| Smoke sampler updates, 48 synthetic steps | 1,731 | 915 |
| Smoke viewport changes, same run | 1,395 | 627 |
| Live smoke textures after five resizes | 52 | 9 |
| Two small slime contact solves | 0.0206 ms | 0.0034 ms |
| Eight small slime contact solves | 0.0280 ms | 0.0116 ms |

The water counts include readbacks. The sparse solver's isolated wall time
improved about 10% in the initial sample; the dense pond measured about 4.17 ms
both before and after. Dense slime control scenes measured about 3% slower.
These are subsystem measurements, not whole-game FPS promises. Browser frame
scheduling, evolving water geometry and concurrent workloads affect timings.

## Moving slime smoke boundary (v26.94 / demo v4.34)

Slime rings now carry per-point surface velocity in a separate GPU texture.
The existing vorticity pass imposes that velocity before pressure projection;
advection carries dye through the moving boundary's ghost cells instead of
zeroing it. The display pass occludes the gel interior. This is an immersed
boundary approximation, not an exactly mass-conserving solver. Fast pointer
motion has a bounded air impulse to avoid numerical smoke compression. The
slime solver, water engine, smoke resolution and preset tuning are unchanged.
The game retains its existing exclusion of bath guests.

```sh
BASE_REF=2dcdc5e node tools/perf/smoke-equivalence.cjs
node tools/perf/smoke-moving-boundary.cjs
```

The first check remains byte-identical at all 28 static-obstacle checkpoints.
The second measures a finite cloud with emissions and dissipation disabled,
including dye hidden by the display mask. A two-second crossing retains 94%
(90% with manual filtering), compared with 39% under the old eraser mask, and
moves the cloud in the travel direction. Deformation retains 95% (91% manual);
repeated fast crossings retain 102% (99% manual). It also checks clear, body
removal, resize, shader errors, and one batched boundary draw per frame with
no added fullscreen passes. Desktop mouse and mobile touch drags, all four
scenes, and the existing 41-preset UI were checked in Chrome for Testing.
