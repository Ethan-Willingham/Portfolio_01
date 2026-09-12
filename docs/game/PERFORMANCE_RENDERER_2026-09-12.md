# Sluice renderer and desktop performance pass

Version v26.123, compared with v26.122 at commit `6e974eb`. This continues
[the first performance audit](PERFORMANCE_AUDIT_2026-09-12.md).
The numerical results, scene state, percentiles, and full CPU bucket rankings are
in [the measurement data](performance-renderer-2026-09-12.json).

The main improvement is a GPU mountain renderer. The previous mountain paths
were inexpensive to submit from JavaScript but expensive for Chrome's raster
thread to process. Fixing that improved actual fullscreen frame delivery. This
build still does not hold 144 FPS in every surface scene.

## Actual fullscreen display results

These are PresentMon display-change measurements on the owner's Windows machine,
i7-9700K, RTX 3080, 2560 x 1440 at 144 Hz. Each measurement is an eight-second
capture after three seconds of scene warmup. Runs were sequential. Chrome was
152.0.7977.83; Electron 44.3.0 used Chromium 152.0.7977.78. Both used the same
Extreme preset, resolution, seed, and local scene fixture. The diagnostic overlay
was hidden. The fixture pins altitude or position while keeping effects and
simulation running, so these are controlled scenes, not a replay of the owner's
exact save. Water and slime dynamics can vary between runs.

The fixed-altitude night-flight fixture reaches the slime pen's pillar partway
through, then thrusts against it. Its horizontal position changes during roughly
28% to 29% of recorded frames. It is a mixed travel/contact workload, not eight
seconds of uninterrupted flight. The driving route continues moving throughout;
an additional fullscreen display comparison of that route is included below.

| Runtime and scene | Before displayed FPS | After displayed FPS | Display intervals over 8 ms, before -> after |
|---|---:|---:|---:|
| Chrome, continuous surface drive | 76.8 | 106.6 | 83.0% -> 34.7% |
| Chrome, night flight/contact | 82.2 | 119.0 | 74.0% -> 20.9% |
| Chrome, hovering over lake | 91.5 | 141.7 | 57.3% -> 1.6% |
| Desktop, night flight/contact | 81.6 | 116.4 | 75.5% -> 23.7% |
| Desktop, hovering over lake | 92.8 | 136.4 | 54.8% -> 5.5% |

At 144 Hz, a refresh lasts 6.94 ms. Many slow frames were displayed for 13.9 ms,
with some reaching 20.8 ms before this change. That uneven cadence explains why
the game looked rough despite a respectable average FPS. After the change,
night-flight display p99 is still about 13.94 ms in both runtimes. The lake is
much closer to the refresh limit, but these samples are not a locked-144 result.
The continuous driving capture covered about 1,560 world pixels in both builds,
with motion on every recorded frame transition. Its display p99 improved from
20.87 to 13.95 ms. This is a roughly 39% increase in displayed FPS during sustained
horizontal travel, while about a third of intervals still exceed one refresh.

PresentMon captured the game's GPU process and its principal swap chain. No
elevation was used. The desktop performance comparison used the local HTTP audit
fixture; the packaged offline application was tested separately. These are
single final captures, not confidence intervals or promises for every machine.

## Whole-game scene sweep

The following is the separate headless Chrome sweep, using the same 2560 x 1440
Extreme render size. Here FPS means requestAnimationFrame callback rate rather
than independently observed display changes. Each scene has eight measured
seconds after three seconds of warmup. These are the final complete sweep's
results, rather than the best result from individual experiments.

| Scene | Before FPS | After FPS | Main-thread mean before -> after, ms | After frame-interval p99, ms |
|---|---:|---:|---:|---:|
| Surface drive | 78.6 | 104.1 | 3.23 -> 3.18 | 20.8 |
| Slime pen | 84.2 | 106.0 | 3.68 -> 4.03 | 14.0 |
| Cave | 144.0 | 144.0 | 1.36 -> 1.37 | 7.1 |
| Deep mined chamber | 144.0 | 144.0 | 2.51 -> 2.44 | 7.1 |
| Storm at surface | 79.9 | 99.8 | 3.61 -> 3.62 | 14.0 |
| Night flight | 84.4 | 114.9 | 3.35 -> 3.55 | 14.0 |
| Hovering over lake at night | 90.8 | 137.1 | 2.14 -> 2.33 | 13.9 |
| Day ascent | 143.1 | 142.7 | 2.14 -> 2.22 | 7.1 |
| Night ascent | 144.0 | 144.0 | 1.62 -> 1.79 | 7.1 |

Main-thread CPU time did not generally fall. The important improvement happened
in work executed later in Chrome's rendering pipeline. Cave and ascent scenes
already approached the refresh limit and show no material FPS gain. The storm
capture still contains a 34.7 ms frame interval, and day ascent has occasional
long CPU samples. Average FPS alone is insufficient to call either fully stable.

## What cost the most, and what remains

### 1. Canvas raster work is still the largest pipeline cost

Matched four-second driving traces measured the following wall time on
`CrGpuMain`, normalized by recorded game callbacks:

| Non-overlapping trace spans | Before, ms/callback | After, ms/callback |
|---|---:|---:|
| Canvas raster, `DoRasterCHROMIUM` | 7.57 | 4.14 |
| Canvas raster completion, `DoEndRasterCHROMIUM` | 3.17 | 2.46 |
| Combined raster spans | 10.73 | 6.60 |
| WebGPU command processing | 1.33 | 1.27 |
| WebGL command processing | 0.37 | 0.78 |

Raster time per callback fell about 39%. The added WebGL work is substantially
smaller than the avoided Canvas work. These spans are CPU-thread wall time,
including possible waits, not GPU shader execution time. Parent trace events
such as `Scheduler::RunTask` are deliberately excluded from the sum. Trace
collection itself adds overhead, so these values are a diagnostic comparison,
not a second end-to-end frame budget to add to the table above.

The evidence for mountains was also causal: suppressing just mountain drawing
in a local night-flight experiment raised callback rate from about 82 to 130
FPS. Suppressing only the atmospheric-sky copy or star copy did not produce that
gain. Those removals were experiments only; all those effects remain enabled.

### 2. Main-thread subsystem rankings depend on the scene

These are mean CPU submission/simulation milliseconds per frame from the final
sweep. Each entry groups disjoint work. Slimes include update and rendering;
smoke and water each include update and rendering. The rig/effects entry removes
the nested slime rendering time. Parent totals such as `render.total`,
`render.sky`, and `jello.substepsAll` are not added to their children.

| Rank | Surface drive | Slime pen | Night flight | Night lake |
|---|---|---|---|---|
| 1 | Smoke, 0.62 | Slimes, 1.90 | Slimes, 1.27 | Water, 0.39 |
| 2 | Terrain chunks, 0.48 | Terrain chunks, 0.35 | Smoke, 0.38 | Terrain chunks, 0.32 |
| 3 | Water, 0.44 | Tiles, 0.35 | Terrain chunks, 0.38 | Tiles, 0.25 |
| 4 | Tiles, 0.30 | Water, 0.33 | Tiles, 0.32 | Sky composite, 0.23 |
| 5 | Rig/effects, 0.26 | Rig/effects, 0.16 | Rig/effects, 0.31 | Slimes, 0.19 |
| 6 | HUD, 0.16 | HUD, 0.13 | Sky composite, 0.20 | Rig/effects, 0.17 |

In the cave, terrain leads at 0.37 ms, followed by rig/effects at 0.17 ms and HUD
at 0.16 ms. In the deep chamber, tiles lead at 0.66 ms, background at 0.37 ms,
and water at 0.34 ms. The JSON contains every measured bucket and tail cost.

The slime pen spends about 0.98 ms updating slimes and 0.91 ms drawing them.
Night flight spends about 0.39 ms updating them and 0.88 ms drawing them. The
renderer's refraction and Canvas copies remain a useful target. During driving,
smoke's obstacle update accounts for about 0.45 ms of its 0.60 ms update total.
Those are child costs, not additional costs to add again.

The remaining raster cost cannot yet be assigned an exact percentage to each
visual subsystem: deferred Canvas work interleaves commands from several
systems. Claiming a precise whole-pipeline ranking from JavaScript timers alone
would repeat the original diagnostic mistake. The next highest-value rendering
investigations are slime refraction/copies, terrain and tile submission, and
cross-context image copies. Water needs separate hardware timestamps rather than
the overlay's asynchronous queue-wait number.

Separate six-second captures sampled asynchronous GPU queries every 24th frame
or command encoder, without `gl.finish` or a queue drain. Mean sampled times:

| Scene | Water simulation, ms | Water drawing, ms | Mountain draw commands, ms | Awake water particles at end |
|---|---:|---:|---:|---:|
| Drive | 1.05 | 0.31 | 0.05 | 17,739 |
| Slime pen | 0.16 | 0.21 | 0.14 | 13,623 |
| Night lake | 0.27 | 0.24 | 0.06 | 15,386 |

The water numbers sum timestamps inside the labeled WebGPU passes and exclude
CPU preparation. Mountain queries stop before Canvas imports the image; that
copy can introduce synchronization and is not mountain shader execution. An
initial query enclosing the copy reported roughly 4 ms and was rejected as an
isolated mountain draw measurement. The final values above contain 23 to 34
samples each, so their tails have limited statistical resolution. Water cost can
vary substantially with the active grid and moving particles, even with similar
particle counts. None of these numbers includes all compositing work or is a
whole-frame GPU total.

For the actual fullscreen Chrome captures, PresentMon's mean GPU-busy time fell
from 3.84 to 2.95 ms in night flight, and from 4.11 to 2.73 ms at the lake. The
much longer display intervals therefore cannot be interpreted simply as the
3080 spending that entire interval executing shaders. Pipeline scheduling,
Canvas raster work, and transfers remain relevant.

## Changes and appearance

- Mountains now reuse static triangle buffers in WebGL2. They use the existing
  procedural geometry, palette, parallax, snow, directional rims, and blinking
  lights. The buffer covers the mountain band and grows in 64-pixel steps to
  avoid reallocating during small vertical camera moves. Canvas remains the
  fallback, including after context loss. `gm.set('perf.mountainGPU', 0)` allows
  a live developer comparison; use `1` to restore it.
- The atmospheric shader skips secondary sunlight rays when sunlight intensity
  is zero. Moon optical depth is still computed. Camera altitude no longer
  invalidates the sky cache when none of the shader's actual inputs change.
- Loading now includes the mountain GPU context in the bounded readiness fence.
  The first pass's asset/cache warmup, saved-preset-before-boot behavior, and
  bounded GPU readiness checks remain in place. A loading screen cannot guarantee
  that every later weather state or new terrain chunk will already be warm.

The mountain image comparison covered 30 camera/scale views. No differences
larger than two channel levels occurred in interiors more than two pixels from
an edge. At most 1.70% of pixels changed at all; 0.37% changed by more than eight
channel levels. Differences are confined to edge antialiasing between Canvas and
WebGL. This is visual preservation with a small edge-rendering difference, not a
claim of byte-identical mountain images. The separate atmospheric shader test
was byte-identical across all 34 tested views.

## Graphics presets

This pass keeps the existing appearance defaults. Additional six-second runs
compared the player-facing presets after the renderer change:

| Preset | Actual render size | Drive FPS | Slime pen FPS |
|---|---|---:|---:|
| Extreme, main eight-second sweep | 2560 x 1440 | 104.1 | 106.0 |
| Balanced | 2309 x 1299 | 112.3 | 105.5 |
| Performance | 1306 x 735 | 127.5 | 117.2 |

Balanced fills the available display but retains its lower internal pixel cap
and effect detail. Performance substantially reduces image resolution. It helps,
but even that preset does not reach 144 FPS in both fixtures. All four additional
captures still have approximately 14 ms frame-interval p99. The pen's weak
response to Balanced is consistent with its slime CPU/rendering cost.

Keep resolution and effect-quality controls separable in any future settings
revision. Reducing particle simulation accuracy would affect gameplay and is not
part of this pass. A claimed 144 Hz preset should wait until sustained display
measurements support that claim. The previous pass's saved-preset-before-loading
fix remains verified.

## Desktop and Steam path

`desktop/` builds a portable Windows Electron application containing the game,
fonts, artwork, music, and sound effects. It runs offline through `sluice://app`,
with no Node access in the game renderer, sandboxing and context isolation, local
saves, and F11 fullscreen. The portfolio and analytics are stripped from the
staged page. See [the desktop build instructions](../../desktop/README.md).

The matched display results do not demonstrate a desktop performance advantage.
Both runtimes benefit from fixing the game's rendering work. The desktop package
provides a reproducible runtime and a starting point for distribution, without
requiring an engine or language rewrite.

This is an unsigned portable prototype, with no Steamworks integration,
achievements, cloud saves, installer, or release submission. Windows Steam
distribution does not require Proton. Proton runs Windows games on Linux/SteamOS;
it is not an engine migration. Valve describes that role in its
[Steam Deck compatibility documentation](https://partner.steamgames.com/doc/steamdeck/proton).
The package has not been tested on Steam Deck or under Proton. That compatibility
test, including WebGL/WebGPU backend availability, controls, audio, saves, and
frame pacing, remains separate release work.

## Validation and limits

- 82 loading checks passed, including saved presets and fallback paths.
- 45 scrolling/overlay checks passed, with 1,144 scrolling frames and no
  background reversals or cold soil builds.
- Mountain geometry: 1,387 polygon-area checks and 2,940 finite stroke meshes.
- Mountain runtime: 240 vertical/day-night frames, bounded four-layer cache,
  one allocation change, no GL errors, context loss/restoration, and fallback.
- Mountain image comparison: 30 views, with the edge-only differences above.
- Atmospheric shader: 34 exact image comparisons; 200 irrelevant altitude
  changes caused zero shader redraws, while actual input changes invalidated it.
- 18 surface-transition checks passed across 21 views, including ascent and sky
  fallback, with no runtime or console errors.
- The final packaged v26.123 build passed offline boot, local asset/font loading,
  option persistence across reload, renderer isolation, sandbox, and fullscreen.
  Three deliberately absent event music cues remain silent as in the shared game;
  there were no other missing assets or remote requests in that check.
- Bundle syntax, desktop/test syntax, whitespace, and shared toy-engine sync
  checked. The game source remains ordered fragments; the bundle is generated.
  Deployed source matches the tested source after Git's CRLF-to-LF normalization;
  the JSON records both byte hashes explicitly.

The physical monitor captures establish that this pass improves visible cadence.
They do not establish perfect pacing, behavior on every driver, hours-long
stability, or Steam Deck compatibility. A 144 Hz frame budget leaves little room
for deferred raster work and spikes. The remaining Canvas pipeline and slime
renderer are the next justified targets. There is still measurable headroom to
pursue in this engine; these results do not justify a Unity or C rewrite.
