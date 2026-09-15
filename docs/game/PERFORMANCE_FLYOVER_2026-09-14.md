# v27.3: flying up and down across town

Baseline: v27.2, commit `68551eb`. The measurements use the v27.3 game bundle
from the commit that adds this report. Run data:
[performance-flyover-2026-09-14.json](performance-flyover-2026-09-14.json).

The v27.2 shader warm-up removed the large first-use stalls. What remained was
most visible while flying up and down across the town and the dev slime pen,
and more so on a 144 Hz 1440p display, where a frame has 6.94 ms. Tracing that
route found two costs that repeated every frame. Both are gone, without
changing the picture:

- Every refracting slime drew the game canvas into itself to magnify what sits
  behind it. Each of those draws made Chrome copy the whole canvas and made the
  main thread wait on the GPU. Seven of the eight dev pen slimes refract, so
  crossing the pen meant seven full-canvas copies per frame.
- The sky's atmosphere shader re-ran over the whole view whenever the horizon
  line moved on screen, which is every frame of vertical flight near the
  surface. Its only use of the horizon was to clear the rows below it.

## The route

`tools/perf/audit-sluice.mjs` gains `SCENES=human-flyover`: key presses through
the game's own controls, flying climbs of uneven length, glides, drops, short
hops and the odd backtrack between the slime pen and the far end of the station
deck. Each gesture reads the rig's position to turn around at either end and to
stop climbing about 28 tiles up. The dev boot builds the pen and the day clock
runs. Only keys are sent.

## Measuring on this Mac

Chrome for Testing 148.0.7778.96 on an Apple M1 Pro, headless, 2048 x 1152 at
device scale 1.25 (a 2560 x 1440 game canvas), with Chrome's Ganesh raster
backend forced as a stand-in for Windows Chrome. Frames were paced two ways,
for two different questions.

Paced at 60 Hz, v27.2's main thread was healthy. In two 45-second flights the
median frame took 2.6 and 3.0 ms and the 99th percentile 4.9 and 5.1 ms; 3 and
2 of 2,700 frames went past 6.94 ms. No call that makes the CPU wait on the GPU
took more than 0.7 ms. That pacing hides the GPU work, which is what decides
whether a 144 Hz frame is on time.

Uncapped (`NOVSYNC=1`), each frame starts as soon as the last one allows, so
frames per second measures the CPU and GPU work of a frame together. The GPU
never catches up in this mode, so whichever call first waits on it absorbs the
whole backlog. In v27.2 the longest of those waits, up to 69 ms, sat inside the
slime self-copies; in v27.3 the same backlog lands on the backdrop copy, the
smoke update and the town props, for up to 59, 60 and 34 ms. Uncapped runs are
used here to compare throughput, not stall lengths.
`tools/perf/sync-audit-probe.js` times each of those waiting calls per frame.

## What costs frame time

Uncapped flyovers of v27.2 with one system switched off by a test-only switch:

| Run | Frames per second | Main thread p99 |
| --- | ---: | ---: |
| v27.2 | 140 | 47.9 ms |
| v27.2, repeat | 137 | 48.6 ms |
| Slime refraction off | 161 | 10.5 ms |
| Slimes off | 162 | 9.7 ms |
| Smoke off | 188 | 40.1 ms |
| Night sky and atmosphere off | 165 | 39.1 ms |
| Weather clouds off | 137 | 48.7 ms |
| Water off | 135 | 49.2 ms |

The whole slime drawing cost was refraction. Smoke is the largest total cost,
about 1.9 ms per frame here. The station, fireplace and pump pad redraw their
cached artwork 20 times a second while visible, because their lamps, antenna,
door glow and hearth fire animate; holding them on one frame changed nothing
measurable (127 against 133 and 136 frames per second), so they were left alone.

## Changes

### One refraction backdrop per frame

Before drawing any body, the slime pass copies the region behind every visible
lens once, into a small canvas, with two spare pixels so edge filtering reads
real neighbours. Each lens then magnifies from that copy. A lens that reaches
past the copy, or overlaps the reach of a body already drawn this frame (its
gel, edge fringe and hair), still reads the game canvas directly, as before.
The shader warm-up draws its test slimes through the same path, and no tour
built a program in the pen.

In a batch with the sync probes, v27.2 with one copy per frame ran at 153
frames per second, against 136 and 133 without it. In the first batch, turning
refraction off entirely gave 161 against 140 and 137.

### The sky renders once per time step

The atmosphere raymarch now renders the whole view into an offscreen texture
when the time of day, zoom, size, moon phase or sunset grade changes. A
scissored nearest-neighbour copy then writes only the rows the old in-shader
clip kept into the sky canvas: a row stays when its centre, `row + 0.5`, is not
past the horizon cut, compared in float32 as the shader did. The cut refreshes
at the moments the old cache key re-rendered, on a whole-pixel change or a
re-render, so the canvas holds the same bytes and the frame composite and the
horizon limb read it unchanged. Without a complete framebuffer, the old
in-shader clip remains.

Holding the sky entirely while only the horizon moved, as an upper bound,
raised a build with the slime change from about 179 to 204 frames per second
and cut its 99th-percentile frame interval from about 38 to 24 ms.

## Results

The final comparison alternated the builds in one batch of 45-second uncapped
flyovers, v27.2, v27.3, v27.3, v27.2, with the frame probe from the hitch
report (`tools/perf/hitch-audit-probe.js`). Main thread time is the time
spent inside the game loop in a frame, including any wait on the GPU.

| Measurement | v27.2 | v27.3 |
| --- | ---: | ---: |
| Frames per second | 167, 166 | 198, 195 |
| Frame interval, 99th percentile | 40.3, 40.8 ms | 24.7, 24.6 ms |
| Frame intervals over 25 ms | 270, 266 | 83, 78 |
| Main thread, 99th percentile | 38.9, 39.6 ms | 29.6, 30.1 ms |
| Page errors | 0, 0 | 0, 0 |

At those rates a frame's CPU and GPU work together averages 5.1 ms, against
6.0 ms before. Measured against a 144 Hz frame's 6.94 ms, the spare time on
this Mac went from about 0.9 ms to 1.8 to 1.9 ms. An earlier pair with only the
refraction change ran at 181 and 177 frames per second against 169 and 169.
The baseline ranged from 137 to 169 frames per second between batches on this
machine, so each comparison here is within one batch.

With the wait timers (`tools/perf/sync-audit-probe.js`) in one more uncapped
pair, v27.3 ran at 202 frames per second against 165. The GPU backlog that
v27.2's main thread absorbed in the slime self-copies, 1.94 ms per frame on
average and 37 ms at the 99th percentile, now lands on the one backdrop copy:
1.36 ms on average and 27 ms at the 99th percentile.

Paced at 60 Hz with the same timers, alternating the same way, the main
thread's median frame took 2.4 and 2.5 ms in v27.2 and 3.1 and 3.0 ms in
v27.3, and the 99th percentile 4.6 and 4.6 ms against 5.1 and 5.1 ms. No run
had more than 2 of its 2,700 frames past 6.94 ms. The difference is slime
physics, not drawing. How long the pen's slimes stay awake depends on where
the flight brushes the pen: 74 and 70% of the v27.3 flights against 38 and 41%
of the v27.2 ones, with physics at 0.83 and 0.76 ms per frame against 0.29 and
0.31 ms. An earlier pair of v27.2 flights that kept them awake 54 and 63% of
the time spent 0.45 and 0.68 ms. Drawing took 1.43 to 1.44 ms per frame in all
four runs, and the uncapped runs show no physics difference between versions.

## Validation

- `tools/perf/shader-warmup-equivalence.mjs` renders 20 frozen scenes: spawn
  on and off the pixel grid, grass, the deck, a topsoil cave, each layer,
  altitude, the bank edge, the horizon limb seen from altitude, the slime pen
  on and off the pixel grid, pickup text, damage, an explosion and death. In a
  normal boot, v27.2 and v27.3 matched exactly in all 20. In the dev boot, 16
  matched exactly; the bank edge, the horizon limb and both pen scenes differed
  in one or two 32-pixel blocks by at most 0.003 levels per pixel, against the
  tool's half-level tolerance. The refraction change alone gave the same
  differences in the bank edge and pen scenes, before the horizon limb scene
  existed. The warm-up disabled against enabled matched exactly in both boots.
- `tools/perf/shader-warmup-trace.mjs`: every tour of either version built 98
  programs while loading, and none in the pen. Three tours of v27.3 built 3, 1
  and 2 programs after the reveal, all within `MAX_COMPILES=3`: the surface
  drive program in each, the digging program in two, and once a second surface
  program 7 s into the drive. Four v27.2 tours on the same day built 1, 2, 2
  and 2, with the digging program in three.
- `tools/sluice-loading-smoke.mjs`: all 84 loading checks pass.
- Water, Smoke, and Slime (v4.38) carries the new jello engine. It booted with
  4 canvases and ran 3,718 frames in 8 uncapped seconds, with no page errors or
  missing files.
- No flyover reported a page error.

## Remaining costs

- Smoke: about 1.9 ms per frame here. Its pressure solver runs 25 iterations;
  fewer would change how the smoke moves and looks, which is the owner's call.
- Late shader programs. The surface drive and pond programs are described in
  the warm-up report. The digging program is Chrome's GPU stroke tessellator
  with a solid colour inside a rectangle clip (program 12414374534287149317,
  about 5 ms once, about 19 s into the tour). It predates this release. Both
  of its shader stages already compile during loading as parts of other
  programs; only this pairing links late.
- Paced at 60 Hz, v27.3's slowest main thread frames came from one smoke
  obstacle mask redraw per flight, 4.4 to 4.7 ms, and from slime contact
  physics at 2 to 4 ms while the rig pushed into the pen. v27.2's also
  included sky re-renders of 3.7 to 3.9 ms.
- Autosave. When money, cargo, the depth record or an upgrade has changed,
  the next moment the rig stands on the ground in town (at most every 10
  seconds) saves in a single frame: the whole world grid is serialized, turned
  into JSON and written to local storage on the main thread. Timed on the dev
  world here, each save took 20 to 22 ms, nearly all of it building the 73 KB
  save; that is three frames at 144 Hz. The flights measured here change none
  of those, so they never saved.

## Limits

This pass ran on one Mac, with Ganesh forced as a stand-in for the owner's
Windows Chrome, and made no Windows or PresentMon capture. Both changes remove
work every Chrome backend does: full-canvas copies that wait on the GPU, and a
full-view raymarch on every frame of vertical flight. How much that buys on a
144 Hz, 2560 x 1440 Windows display was not measured. A PresentMon capture with
`tools/perf/audit-sluice.mjs`, as in the v27 report, is the confirmation.

## Reproduce

Run sequentially on an idle machine, from the repository root, alternating the
two builds with a fresh `DUMP` outside the checkout for each run:

```sh
SCENES=human-flyover SECONDS=45 NOVSYNC=1 GANESH=1 WIDTH=2048 HEIGHT=1152 DPR=1.25 PROFILE=0 CLOCK=1 TOD=.5 EXPERIMENT=tools/perf/hitch-audit-probe.js DUMP=/tmp/flyover-new node tools/perf/audit-sluice.mjs
BUNDLE_REF=68551eb SCENES=human-flyover SECONDS=45 NOVSYNC=1 GANESH=1 WIDTH=2048 HEIGHT=1152 DPR=1.25 PROFILE=0 CLOCK=1 TOD=.5 EXPERIMENT=tools/perf/hitch-audit-probe.js DUMP=/tmp/flyover-old node tools/perf/audit-sluice.mjs
node tools/perf/shader-warmup-equivalence.mjs
DEV=1 node tools/perf/shader-warmup-equivalence.mjs
BUNDLE_REF=68551eb node tools/perf/shader-warmup-trace.mjs
node tools/perf/shader-warmup-trace.mjs
```

Both equivalence commands compare against `HEAD`; add `BUNDLE_REF=68551eb` to
compare against v27.2 after this commit lands. Omitting `NOVSYNC` paces frames
at the display rate, which stops while a Mac display sleeps.
`EXPERIMENT=tools/perf/sync-audit-probe.js` swaps in the per-call wait timers.
`SHADER_DUMP=<dir>` on the trace tool writes each compiled shader's source; a
late program's `.program` file there names its two shader stages. On the
Windows machine at 144 Hz, drop `NOVSYNC` and `GANESH` and add `HEADED=1` and
`PRESENTMON` to capture displayed frames, as in the v27 report.
