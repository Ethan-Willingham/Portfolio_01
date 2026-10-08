# Combined snow and resident performance capture

Run each command sequentially on the same otherwise idle host. The harness owns
its Chrome for Testing process and closes that process on exit. It never uses
the owner's personal Chrome application on macOS.

The normal scene retains the build's ordinary starting population. The combined
scene defaults to eight ordinary resident bodies in an overlapping 4 by 2 arrangement
on an existing dry town apron. Both boot the normal generated world with snow,
ponds, liquids, smoke, weather and rendering active. The combined scene then
uses actual keyboard and pointer events to hold, walk and jet. It does not
manually step physics, replenish fuel during capture, force sleeping, clear
liquids, change terrain, or pin the rig during measurement. Native liquid
population streams with the camera region, so town centre and the dry apron
are separate workloads. Compare each scene against its own matching baseline.
`RESIDENTS=2` through `RESIDENTS=32` selects a different combined population;
the capture records the requested and surviving counts. The default remains eight.
On Windows the harness uses installed Chrome in a disposable test profile.
Run `node tools/build-sluice.mjs` to rebuild without requiring a Unix shell.

```sh
SCENES=town-normal,slime-snow HEADED=1 PROFILE=0 GPU=0 \
  WIDTH=1440 HEIGHT=900 DPR=2 WARMUP=6 SECONDS=60 TIMELINE=1 RECOVERY=10 \
  DUMP=/tmp/sluice-combined-native node tools/perf/audit-sluice.mjs
```

These scenes default to `snow=1`, with saves disabled and no slime opt-in.
`QUERY` can override that query explicitly. Historical comparisons that need
the former opt-in should state `QUERY='snow=1&softnext=1'`. There is no `dev=1` or playground reset in these scenes.
The combined capture requires at least 5,000 liquid solver particles when snow
is enabled and requires physical snow in the solver. It records actual snow and resident
counts rather than waiting for snowfall to inflate the workload. A historical workload
that needs another threshold must state it explicitly with `PARTICLE_MIN`.

Run a separate GPU attribution capture to collect asynchronous timestamp samples
without mixing sampling overhead into the native delivery baseline:

```sh
SCENES=town-normal,slime-snow HEADED=1 PROFILE=0 GPU=1 \
  WIDTH=1440 HEIGHT=900 DPR=2 WARMUP=6 SECONDS=60 TIMELINE=1 RECOVERY=10 \
  DUMP=/tmp/sluice-combined-gpu node tools/perf/audit-sluice.mjs
```

For a two by two attribution matrix, every variant receives an independent
normal boot with explicit `snow=0/1` and `jello=0/1` query overrides. The variants
are diagnostic only. The final game performance gate is the `both` capture.

```sh
SCENES=slime-snow VARIANTS=both,slimes,snow,neither \
  HEADED=1 PROFILE=0 GPU=0 WIDTH=1440 HEIGHT=900 DPR=2 \
  WARMUP=6 SECONDS=60 TIMELINE=1 RECOVERY=10 DUMP=/tmp/sluice-combined-matrix \
  node tools/perf/audit-sluice.mjs
```

Use `ACTIONS=idle`, `walk`, `jet` or `hold` for narrower routes. The combined
scene defaults to `ACTIONS=mixed`. Use `DRY_RUN=1` with any command to print its
effective queries, viewport and timing modes without launching a browser.

Each capture writes raw frame rows, boot/warmup/end counts, actual feature flags,
input events (including whether a grab succeeded), a screenshot, and a summary.
The GPU summary groups sampled encoder totals and individual passes. Those
totals are sums of measured passes, not total display GPU time. Every combined
frame records liquid readback generation, age, count, pending/resolved state,
and awake/sleeping counts. `outerTicks` counts the fixed jello ticks consumed
in that callback; `microsteps` records the actual unified solver-loop count,
including zero when nothing solves. `microstepMultiplier` records the configured
subdivision. Historical bundles without the step observer report unavailable
microsteps as null. Full particle-type scans occur only at snapshots.

`timeMode: nativeRAF` means unmodified rAF callback intervals. The reported
`callbackFps` is a callback rate, not proof of compositor presentation rate.
`display.json` records `requestedRefreshHz` only when `REFRESH_HZ` is explicit;
otherwise it is null. The harness does not measure the display refresh rate.
`_rafTimer=1` reports `timeMode: timer`; `SIM_HZ` reports `timeMode: fixedDt` and
also records the scheduler. Neither is a native display-FPS measurement.
`NOVSYNC=1` and CPU sampling are separately recorded in `environment.json`.
Use native rAF, `PROFILE=0`, `GPU=0` and normal vsync for the delivery baseline.

A private liquid engine candidate can be measured without replacing the working
copy. `LIQUID_SOURCE` must be an absolute path and cannot be combined with
`LIQUID_REF`. The harness snapshots those bytes at launch and records their path
and SHA-256 in the environment, each capture and the summary. Ordinary working
copy and historical `LIQUID_REF` captures also record the served source hash.

```sh
SCENES=town-normal QUERY='snow=1&softnext=1' HEADED=1 PROFILE=0 GPU=1 \
  LIQUID_SOURCE=/tmp/liquid-wgpu-candidate.js \
  DUMP=/tmp/sluice-liquid-candidate node tools/perf/audit-sluice.mjs
```


`TIMELINE=1` retains every observed callback from loading through warmup,
capture, and recovery. It writes `<scene>.timeline.json`, raw per-frame
`<scene>.timeline.jsonl`, and live one-second `<scene>.timeline-bins.jsonl`.
Each bin includes callback FPS, HUD FPS, CPU time, snow population, actual
slime microsteps, and liquid readback age. `RECOVERY=10` continues simulation
after releasing capture inputs. A headed combined run fails if the document
became hidden or the observed capture did not cover its requested duration.
Keep the game visible for the entire run. On macOS, a normal window avoids
switching away from the fullscreen game into another desktop Space.

The v28.123 native captures used `FULLSCREEN=0 WINDOW_X=0 WINDOW_Y=25
WINDOW_WIDTH=1512 WINDOW_HEIGHT=950`. The original engine averaged 14.3 callbacks per second in a matched
20-second normal-town capture. Final normal-town and eight-resident routes
averaged 59.3 and 62.3 callbacks per second over 60 seconds, respectively;
the lowest full-second bins were 49.2 and 52.6. Both retained startup and ten
seconds of recovery with no browser or shader errors. The test host does not
establish the owner's 120 Hz presentation rate.
