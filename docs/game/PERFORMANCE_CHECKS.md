# Sluice performance checks

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
