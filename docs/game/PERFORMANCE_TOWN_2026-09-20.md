# Town frame-time audit, 2026-09-20

v28.50 removes two unnecessary Canvas snapshots in the slime renderer. Both
can make the browser wait for queued GPU drawing during play:

- New surface residents use painted gel, but the shared refraction backdrop
  treated them as glass. It copied the game canvas every frame even when no
  visible body would read that image. Backdrop bounds now include only glass.
- The world draw cull has a one-tile margin. Glass in that margin still called
  `drawImage` with the game canvas as its own source, even when the entire
  source rectangle lay outside the actual canvas. Those empty copies are now
  rejected before entering Canvas.

Surface residents still enter the backdrop's overlap history after drawing.
A real glass lens over an earlier resident therefore keeps the existing live
canvas fallback. Partially visible glass and the actual lens effect stay intact.
No particle counts, simulation steps, weather, exhaust settings or artwork were
reduced. These are recurring render costs; preloading cannot remove the copies.

## Measurements

Chrome for Testing 148, Apple M1 Pro, Metal, 1798 by 954 CSS viewport at DPR 1.5
(2697 by 1431 backing canvas). Fresh deterministic snow world, Copperhead
purchased, lakes and both the shore glass slimes and surface residents enabled.
The rig parks just left of town for `idle`; `flight` traverses the surface at
fixed altitude. Profiling runs are sequential and use disposable saves.

The uncapped 20-second comparison used the same frozen v28.49 source for both
sides, with only the two render guards injected on the second side. CPU sampling
was off. Uncapping exposes GPU queue pressure beyond this headless browser's
60 Hz presentation rate. It is a stress test, not measured display FPS.

| Uncapped metric | Before | After |
| --- | ---: | ---: |
| Parked render submission p99 | 28.0 ms | 1.6 ms |
| Parked main-thread frame work p99 | 29.7 ms | 7.3 ms |
| Parked render submission average | 2.56 ms | 1.10 ms |
| Flight render submission p99 | 36.7 ms | 28.7 ms |
| Flight callback interval p99 | 55.9 ms | 45.4 ms |

The original parked backdrop copy alone reached 44.3 ms. After excluding
residents, empty self-copies from offscreen glass became the remaining parked
slime stall. Guarding those source rectangles removed that recurring work too.
Visible glass still needs a real snapshot. The uncapped flight retains stalls
in those copies and smoke terrain uploads under GPU pressure. The change does
not establish hitch-free high-refresh presentation on every device.

The normal 60 Hz baseline already delivered its parked and flight callbacks
within 16.8 ms. That run could not reproduce the large stalls seen under queue
pressure. The release smoke check covers town, the left approach and flight at
the same resolution: 2,161 callbacks across three 12-second samples, all at
16.8 ms or less, with zero browser errors. Detailed summaries are in the
adjacent JSON report.
The player's exact saved world and active browser session were not captured.

CPU sampling separately ranked soft-body contact solving and snow's projected
jet airflow above Copperhead's JavaScript submission cost. In 60 Hz samples,
slime simulation used about 2 ms near town; snow and its airflow used about
2 ms while flying. Those are ongoing simulation costs rather than evidence of
an asset-loading pause. Their physics are unchanged in this release.

## Verification and reproduction

`node tools/perf/slime-backdrop.mjs` checks 36 real-browser pixel comparisons
against the previous behavior at three scales: residents, ordinary glass,
separate and overlapping mixtures, partially visible glass, distant glass, and
fully offscreen sources inside each of the four culling margins. All pixels
match exactly. The test asserts zero resident-only backdrop copies and zero
empty margin self-copies while retaining overlap fallbacks.

The normal audit now accepts a world query and a purchased exhaust without
requiring dev-mode fixtures:

```sh
QUERY=snow=1 EXHAUST=copperhead SCENES=town,idle,flight \
SECONDS=20 WIDTH=1798 HEIGHT=954 DPR=1.5 PROFILE=0 \
EXPERIMENT=tools/perf/slime-backdrop-probe.js \
DUMP=/tmp/sluice-town-audit node tools/perf/audit-sluice.mjs
```

Add `NOVSYNC=1` for the GPU queue stress comparison. `BUNDLE_REF=23306a2`
selects the release before these two guards. Use separate output directories
and run sequentially. Source snapshots, raw profiles and screenshots from the
investigation are under `/tmp/sluice-town-*`, outside the checkout. No production
eval or profiling instrumentation was added.
