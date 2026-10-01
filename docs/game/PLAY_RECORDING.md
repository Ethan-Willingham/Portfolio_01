# Recording a gameplay slowdown

Since v28.124, ordinary play has a local performance recorder. Press F9 to
start, play through the drop and recovery, then press F9 again to stop and
download JSON. `?perfrec=1` shows the controls and starts on the first gameplay
frame. This preserves normal saving, weather, physics, and graphics settings.
Keep the tab open until the recording is saved. Nothing is uploaded.

Every gameplay callback retains its unclamped interval, CPU frame cost,
individual CPU buckets, player and camera position, held inputs, snow and
liquid counts, awake residents, actual slime microsteps, and contact counts.
Manifest, ledger, and subsequent loading frames are also retained with a view
code (0 ordinary, 1 manifest, 2 ledger, 3 loading). Pause/resume, focus,
visibility, keyboard, pointer, wheel, control clicks, errors, and long tasks
are recorded separately. Pointer moves are sampled at most ten times per
second. One-second snapshots retain resident positions and bounds, particle
types, settings, frame pacing, and the largest CPU buckets. The latest existing
save is included as context without advancing or rewriting the save slots.
It can precede the capture; this is not deterministic replay.

`readbackAgeMs` measures elapsed simulation time since the applied liquid
mirror. Since v28.126 it is converted to milliseconds in both packed frames
and snapshots. In v28.124 and v28.125 exports, that field contains seconds
despite its name; multiply those older values by 1,000 when analyzing them.

On supported WebGPU devices, timestamp queries sample up to one command encoder
per label per second. They time actual compute/render passes without waiting
for the queue. Four pending samples and 512 passes per sample bound the work.
A sample reports `partial` and `skippedPasses` if that limit or existing timestamp
writes prevent complete coverage. Unsupported devices retain all CPU, input,
state, and pacing data. GPU samples omit WebGL execution and browser composition.
CPU buckets include command submission, overlap with parent buckets, and must
not be added together. Sampled GPU pass sums are not whole-frame GPU times. Since
v28.133, each pass retains beginning/end timestamp strings and each encoder
retains `spanMs`, the interval from its first to last valid timestamp. This
includes gaps between passes but excludes queue wait and other encoders.
Empty indirect timestamps remain in raw data; invalid samples are partial.
The trace reader groups liquid spans by actual scheduler quanta and grain
ticks, rather than comparing catch-up frames as if their work were equal.

Frame storage uses packed Float32 chunks, bounded at 72,000 frames or ten minutes.
The capture stops at the first limit and remains available under Save recording.
The earlier slowdown remains in the trace. A new recording replaces the retained
one, so save before starting again. Export serialization runs after recording
stops, in chunks. It can still affect the game while saving. Recording has a
small measurement cost; per-frame recorder and snapshot costs are retained so
they can be assessed alongside the game. GPU timestamp overhead is separate.

The hidden `#gm-performance-live` node contains the current JSON summary,
updated once per second. A read-only browser tool can inspect this while the
owner plays without opening developer mode or taking keyboard control.
`window.__sluicePerformance` also offers start, stop, download, status, and bounded
frame-chunk reads for local diagnostics. No recorder state is sent to analytics.

Analyze an exported trace with:

```sh
node tools/perf/read-play-recording.mjs /absolute/path/sluice-performance.json
```

The reader validates frame counts and prints interval/CPU distributions, the
slowest seconds, hitches, subsystem averages, GPU pass distributions, and lost
event/sample counters. Pauses and hidden periods remain visible in the trace.
The recorder's worst-active-FPS label excludes interrupted one-second bins.
Use individual frame timings and pause events when examining transitions.

Verification: `node tools/test-play-recording.mjs` boots the real game with native
callbacks in an owned Chrome for Testing process. It uses actual input to
record movement, inventory pages and a short pause, induces a main-thread
hitch, saves and parses a trace spanning multiple chunks, checks actual GPU
timestamps, and exercises both storage and time limits. The browser is closed
in `finally`. This tests capture correctness; it is not a display-refresh benchmark.

For background performance checks, `node tools/perf/test-ordinary-game.mjs`
uses an owned headless Chrome for Testing process, native animation callbacks,
stock smoke, snowfall, and the five natural starting residents. It exports a
complete trace and ten-second checkpoints without opening a visible window or
taking the owner's keyboard focus. `INPUT=/absolute/path/recording.json` schedules
the recording's keyboard events; `NO_POINTER=0` also schedules pointer events.
The seeded world and timed inputs do not establish deterministic replay or the
owner's 120 Hz presentation rate. `nopause=1` keeps this background test active;
it does not change physics. GPU tests should run serially to avoid competing
with each other for the device.

Since v28.128, add `&perfwater=0&nosave=1` to a fresh game to remove all non-snow
liquid particles. This includes water, oil, and loose mineral grains. Snow still
uses its ordinary emission, contacts, resident boundaries, and shared GPU
infrastructure. The diagnostic requires `nosave=1`; it cannot rewrite a stored
world and is off in ordinary play. In the background harness, `WATER=0` selects
this diagnostic and verifies that every retained particle type is snow:

```sh
DUMP=/tmp/sluice-dry WATER=0 DURATION_MS=90000 node tools/perf/test-ordinary-game.mjs
```


The capacity tools also support `COUNT_BODY_WORK=1` in an ordinary background
capture without a population fixture. This counts actual internal body calls,
point and spring steps, active/solving bodies and onscreen bodies. It retains
the natural residents, weather, water and stock smoke. `capacity.controlled`
is false for these captures. The counter is test-only and adds no per-call
clock reads. The existing recorder `visibleResidents` field uses the
expanded jello culling region; the body-work probe counts actual viewport
intersection separately. See [SLIME_SNOW_CAPACITY.md](SLIME_SNOW_CAPACITY.md) for the serial
matrix and one-window native runner.
