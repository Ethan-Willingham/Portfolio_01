# v27.2: first-use shader warm-up

Baseline: v27.1, commit `bb09fff`. The measurements use the v27.2 game bundle
from the commit that adds this report. Compact results are in
[the measurement data](performance-shader-warmup-2026-09-13.json).

The long stalls in the [v27 gap diagnosis](PERFORMANCE_STALLS_2026-09-12.md)
were Canvas raster flushes that each built a GPU shader program on first use.
v27.1 drew four rig poses under the loading cover to build some of those
programs early. v27.2 replaces that preview with a warm-up covering eleven
systems. On a scripted tour in a fresh browser profile, the programs built
after the loading screen fell from 40 to 1. Loading takes about 0.27 s longer
on a first visit and 0.17 s longer on a repeat visit.

## Why play still built programs

Chrome's GPU raster builds a program the first time a page draws a new mix of
geometry, paint, blend mode and clip, and the frame waiting on it presents
late. The loading screen renders only the resting spawn view. Flight, digging,
slimes, unusual terrain shapes, depth, blasts, menus and damage all reach
combinations that view never draws, and the v27.1 preview covered only part of
the rig: four poses at the current upgrade tier.

All 2D canvases in a page share one program cache, so a program built for a
hidden canvas also serves the game canvas. The warm-up (`046-shader-warm.js`)
draws with the game's own drawing functions and temporary state into a hidden
canvas, puts every borrowed value back even when a pass throws, and ends with
a 1-pixel readback so Chrome rasters the whole warm-up before loading goes on.
It runs on the first loading frame after assets are ready. A later loading
screen (a new mine, a graphics change or a distant recovery) runs it again only
if the canvas size or drawing scale has changed.

## What the warm-up draws

| Pass | Drawn states |
| --- | --- |
| Sky | The whole scene from two heights above town, where the sky, surface bank and horizon limb use stencil clips |
| Rig | Every drill tier with its booster: parked, reversing, climbing through ignition, a hard bank on a short flame, drilling, and a landing squash, with wake, wash, sparks and pressure rings |
| Shadow | The contact shadow at four lift heights, since its size picks the draw path |
| Digging | Crack telegraphs in four directions at four stages and at three times scale, block-break chips, grit, dust, the rare-ore flash and pickup text |
| Slimes | Live bodies, then temporary cluster and disc bodies at rest, squashed, sheared, moving and enlarged, and splats |
| Terrain | Eleven 8x8 tile layouts at the surface and four at each layer depth, written into the chunk column farthest from the view and put back exactly, then a sample of real chunks from each depth band |
| Scenery | Soil patches, foundation panels off the pixel grid, the lit shop door, pump-pad hazard stripes, grass at three columns, the horizon limb and the storm veil |
| Underground | The surface bank seen from the air at six strip heights, and each layer's wall and heat band where it begins |
| Blasts | Small and large explosions early and late, and both lit charges |
| HUD | Radio plates (tip, alert and fading), the damage flash and the death veil |
| Menus | The store while opening and open on both tabs, drill art for every tier at two sizes, the cargo manifest and the ledger |

Every pass except sky, terrain and menus runs a second time a fraction of a
pixel off the camera grid, because moving edges select anti-aliasing variants
that a resting view never uses.

Some drawing moved into named functions so the warm-up calls the same code a
frame does: `drawUndergroundBackground`, `drawSurfaceGrassLine`,
`drawFoundationTile`, `drawSoilPatch`, `drawFloaterText` and `drawDamageFlash`
in 140, `drawDeathVeil` in 290, and `buildExplosion` in 060, which keeps the
order of its random draws. The extractions render identically (see Validation).

Chrome traces placed each late program in time and in a route phase. A
draw-state logger listed the first use of each paint, clip, transform and path
size with its JavaScript stack, and ANGLE's shader source dump showed what each
program contained: gradient type, clip mask and geometry. Several gaps were
invisible in the draw calls alone. A terrain chunk with one stone tile over a
cave takes different GPU paths than a stone mass. The store's opening fade uses
programs its open state does not. A pattern made from the still-blank storm
veil canvas draws nothing, so that pass paints a filled stand-in of the same
size. Crack and slime clip sizes switch between the mask atlas and other path
renderers.

## Results

Chrome for Testing 148.0.7778.96 on an Apple M1 Pro (macOS 26.6.2), headless,
2048 x 1152 at device scale 1.25 (a 2560 x 1440 game canvas), default graphics.
Chrome's Ganesh raster backend was forced, over ANGLE on Metal. The Windows
traces in the gap diagnosis came from Ganesh over ANGLE on Direct3D 11, so the
program counts here should carry over better than their timings. This pass
made no Windows or PresentMon capture.

### Programs built during play

The tour (`tools/perf/shader-warmup-trace.mjs`, about 70 seconds) idles at
spawn and runs the uneven surface drive, then visits the slime pen, digs,
sells, opens the store, the cargo manifest and the ledger, sets off both
bombs, and visits a cave, deep ground, a pond, high altitude, night, a storm,
upgraded tiers and death. Each version ran it in a fresh profile, then again
in the same profile, where Chrome's disk cache holds the first run's programs.

| Measurement | v27.1 first visit | v27.2 first visit | v27.1 repeat | v27.2 repeat |
| --- | ---: | ---: | ---: | ---: |
| Programs built while loading | 53 | 98 | 57 | 92 |
| Programs built after the reveal | 40 | 1 | 34 | 5 |
| Build time after the reveal | 122.3 ms | 10.2 ms | 24.9 ms | 6.6 ms |
| Raster flushes over 8 ms after the reveal | 5 | 1 | 0 | 0 |
| Raster flushes over 16 ms after the reveal | 2 | 0 | 0 | 0 |
| Longest raster flush after the reveal | 18.0 ms | 11.2 ms | 6.3 ms | 4.4 ms |

v27.1's 40 late programs on a first visit, by tour stop: 8 on the surface
drive, 5 each in the pen, the store and the cave, 4 at the pond, 3 each while
digging and at the bombs, 2 each while idling, in the manifest and at death,
and 1 before the route started. v27.2's one late program came about 2.5 s
into the surface drive. On its repeat visit, v27.2 also built 4 at the pond.
A second first-visit run of each version with the committed tool reproduced
the counts, 40 and 1, with `MAX_COMPILES=3` failing v27.1 and passing v27.2.
Its longest v27.1 flushes were 17.3 ms in the pen (5 programs at once),
16.4 ms at the pond and 14.3 ms at the store.

A repeat visit still builds programs in the new browser session, but Chrome
loads most of them from its disk cache instead of compiling: about 0.7 ms each
here, against 3.1 ms. A first-time visitor has no such cache, and browser or
graphics driver updates clear it.

### Loading time

`tools/perf/loading-time.mjs`, five rounds alternating the version order,
frames paced at 60 Hz, timed in the page from navigation to the end of the
loading fade:

| Visit | v27.1 median | v27.2 median | Change |
| --- | ---: | ---: | ---: |
| First (fresh profile) | 1,642 ms | 1,912 ms | +270 ms |
| Repeat (same profile) | 1,499 ms | 1,666 ms | +167 ms |

The warm-up took a median 348 ms on a first visit, 144 ms of it waiting on GPU
raster, and 224 ms on a repeat visit, where raster took about 23 ms. Its CPU
drawing is about 200 ms either way: terrain layouts 92 ms, underground 48 ms,
sky 19 ms, menus 15 ms, slimes 14 ms, rig 9 ms and the rest under 5 ms each.

Two ways to hide that cost do not apply. Fonts, the moon image and the WebGPU
water are ready within about 260 ms of navigation, before the world exists, so
there is no asset wait for the warm-up to share. The scene settling after it
waits for about 30 completed frames, so spreading the warm-up across those
frames would lengthen them rather than save time. With uncapped frames the
difference grows to 326 ms and 278 ms, because the loading loop spins while
the GPU fence drains; the 60 Hz numbers are closer to a real display.

## Validation

- `tools/perf/shader-warmup-equivalence.mjs` renders 17 frozen scenes: spawn on
  and off the pixel grid, grass, the deck, a topsoil cave, each layer, altitude,
  the bank edge, pickup text, damage, an explosion and death. v27.1 against
  v27.2, and v27.2 with the warm-up disabled against enabled, matched in every
  scene. The warm-up leaves no visible trace, and the extracted functions draw
  exactly what they replaced.
- `tools/sluice-loading-smoke.mjs`: all 84 loading checks pass.
- Chrome's default Mac backend (Graphite over Dawn and Metal): the warm-up ran
  in 250 ms with no errors. Graphite reports its pipelines differently, so its
  counts are not compared.
- A 390 x 844 phone viewport at device scale 3: warm-up 567 ms, no errors, and
  2 programs after the reveal on a 12-second surface drive.
- No run reported a warm-up error or a page error.

## Remaining late programs

- At a pond with slimes nearby: the slime body's material gradient in a
  single-sample form, clipped through the path mask atlas. Loading and the
  warm-up build a form without the atlas lookup whose vertex stage is set up
  for multisampling, which points to Chrome choosing the form from the other
  draws sharing that render pass. In one traced visit it appeared about 0.3 s
  after arrival, as the rig dropped into the water, with no change to the two
  slimes in view. The same fill drawn alone on the game canvas, the HUD canvas
  or a hidden canvas built only the other form, and a page cannot choose the
  pass type. It costs about 4 ms here, once per session, and not on every
  visit.
- About 2.5 s into the surface drive: a rectangle fill with an analytic
  rectangle clip and a solid colour, built by the same geometry operation. Its source draw was
  not identified. Hazard stripes, deck-edge chunks, rig poses at other screen
  positions and clipped fills on each canvas did not remove it.

## Limits

This pass ran on one Mac, with Ganesh forced as a stand-in for the owner's
Windows Chrome. The Windows effect is expected, not measured. The gap diagnosis
found 10 to 32 ms flushes with shader-cache activity there, and Direct3D shader
compiles cost more than the 3 ms seen here. A PresentMon capture with
`tools/perf/audit-sluice.mjs`, as in the v27 report, is the confirmation.

If Chrome loses its GPU context, its compiled programs go with it and rebuild
on first use; the warm-up does not rerun for that.

## Keeping it warm

A new effect, such as a new gradient, clip, blend mode, particle or piece of
menu art, builds its program mid-play unless 046 draws a representative state.
After adding one, run `node tools/perf/shader-warmup-trace.mjs`. The tour
should build no more than a couple of programs after the reveal, and
`MAX_COMPILES=3` turns that into a pass or fail check. `SIGNATURES=1` lists the
first-use draw states and stacks beside each late program. Draw that state in
the matching pass, restore anything it borrows, and run
`tools/perf/shader-warmup-equivalence.mjs` to confirm nothing visible changed.

## Reproduce

Run these one at a time on an idle machine, from the repository root:

```sh
node tools/perf/shader-warmup-trace.mjs
BUNDLE_REF=bb09fff node tools/perf/shader-warmup-trace.mjs
BUNDLE_REF=bb09fff node tools/perf/shader-warmup-equivalence.mjs
BUNDLE_REF=bb09fff node tools/perf/loading-time.mjs
node tools/sluice-loading-smoke.mjs
```

Run the trace twice with the same `PROFILE_DIR` for a repeat visit;
`ROUTE=surface SECONDS=20` drives only the uneven surface route. Headless frames
stop while a Mac display sleeps. The trace and equivalence tools uncap frames by
default, `loading-time.mjs` takes `NOVSYNC=1`, and the smoke test takes `CHROME`
pointing at a wrapper that adds `--disable-gpu-vsync` and
`--disable-frame-rate-limit`. Compare only runs made the same way. The program
contents above came from Chrome's `--enable-angle-features=dumpShaderSource`
with `--disable-gpu-sandbox` and `ANGLE_SHADER_DUMP_PATH`, which the tools do
not enable.
