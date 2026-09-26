# v28.100: startup and the moon image

The moon texture no longer blocks startup. Previously the main bundle requested
the image during execution, then scene preparation waited for it to load and
read back its pixels, with a five-second fallback deadline. The existing
procedural moon now covers a pending or failed image immediately. A late texture
still replaces it without a reload.

The page preloads the moon and the stylesheet imported by `style.css`. The moon's
temporary readback canvas uses `willReadFrequently` so extracting CPU pixels
does not require a GPU upload and readback.

Drawing warm-up retains all 29 passes, batching up to four inexpensive passes
within a four-millisecond budget. An expensive individual pass still yields
afterward. During loading, the cloud worker receives its next job as soon as
the previous one completes. Normal gameplay retains its previous dispatch
pacing. Asset readiness, completed scene frames, graphics fences, and input
protection remain in place.

## Measurements

Baseline: `e7fd288` (v28.99). Chrome for Testing 148 on macOS, default graphics
backend, local HTTP server, 1440 by 900 at device scale 1. Times run from
navigation through the first game frame after the loading fade. Each normal
measurement is the median of three alternating baseline/candidate rounds.
Repeat visits reuse the browser profile and GPU cache; the harness serves HTTP
resources with `no-store`. These are local startup measurements, not internet
download benchmarks.

| Scenario | Before | After |
| --- | ---: | ---: |
| Fresh browser profile | 1,735 ms | 1,687 ms |
| Repeat browser profile | 1,690 ms | 1,581 ms |
| Moon response delayed four seconds, one fresh-profile pair | 5,551 ms | 1,653 ms |

Fresh samples were 1701, 1753, 1735 ms before and 1680, 1687, 1692 ms after.
Repeat samples were 1674, 1690, 1699 ms before and 1569, 1581, 1590 ms after.
All measured boots completed all drawing passes with zero browser errors.

The slow-image comparison is an injected regression scenario, not a claim
that every visitor saves four seconds. The main improvement is eliminating
the moon download as a startup dependency. Normal local gains are modest.

## Verification

- `node --check js/sluice.js` passed.
- `tools/sluice-loading-smoke.mjs` passed 126 checks, including an indefinitely
  held moon request, late texture arrival, saved games, graphics changes,
  resource failures, blocked and hung cloud workers, GPU timeout cleanup,
  mobile layout, and reduced motion.
- All 18 scenes in `tools/perf/shader-warmup-equivalence.mjs` matched the
  baseline exactly. Warm-up enabled versus disabled also matched exactly.
- `tools/test-sluice-clouds.cjs` verified deterministic geometry, cache reuse,
  worker draining without another render, and unchanged live dispatch pacing.
- `tools/test-fire-startup.cjs` preserved the water/fire dependency deadlines.

The loading smoke harness had two stale assumptions predating the fire backend:
five companion scripts and 14 report tasks. It now derives both from the report.
The timing harness now accumulates incremental warm-up work, serves each
version's HTML, records stage/resource timings, and accepts `MOON_DELAY_MS`.

## Reproduce

Run these sequentially on an idle machine with the display awake:

```sh
BUNDLE_REF=e7fd288 ROUNDS=3 WIDTH=1440 HEIGHT=900 DPR=1 GANESH=0 node tools/perf/loading-time.mjs
BUNDLE_REF=e7fd288 ROUNDS=1 KINDS=cold WIDTH=1440 HEIGHT=900 DPR=1 GANESH=0 MOON_DELAY_MS=4000 node tools/perf/loading-time.mjs
node tools/sluice-loading-smoke.mjs
BUNDLE_REF=e7fd288 GANESH=0 node tools/perf/shader-warmup-equivalence.mjs
node tools/test-sluice-clouds.cjs
node tools/test-fire-startup.cjs
```
