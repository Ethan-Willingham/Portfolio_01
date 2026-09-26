# Loading and progress

The default loading screen shows SLUICE, one short status, a continuous progress
bar, a percentage and a collapsed Details control. Step lists, elapsed time,
resource names and the full report stay inside Details. They do not repaint
while Details is closed. Pause > Loading report keeps the report afterward.

The percentage measures preparation completed, not download bytes or remaining
time. No timer advances it. A task settles when it completes, selects a working
fallback or reuses existing work. Failed tasks do not count as complete.

Five stages have fixed preparation shares: game files 25, mine setup 10,
fonts/physics 15, scene/effects 45, and graphics completion 5. Tasks within a stage
share its allocation equally. Rebuilds normalize over their relevant stages.
These shares give counted scene preparation space on the bar; they are not
predicted durations or measured bandwidth.

Startup tracks seven deferred scripts; mine generation/save restoration; both
HUD font weights; the optional moon texture; water and fire backends; destination
caches; representative drawing passes; and graphics queue completion. These are
16 gates. Scene rebuilds keep only their relevant gates, with world preparation
included for a new mine.

Running gates with actual counters advance their share fractionally: completed
draws, ready terrain/cloud caches plus complete frames, and graphics queues plus
two presentation opportunities. An invalidated cache can reset its counter; the
bar retains already observed work but reserves task completion for the real
readiness result. The displayed percentage stays below 100 until every gate has
settled and the scene is ready to reveal. Every new loading run starts fresh.

The moon image never blocks scene preparation. If it is still unavailable when
other assets settle, its procedural fallback counts as ready, and a late texture
can replace it. Water and fire retain their bounded fallback deadlines. Ordinary
boots skip the dormant GPU-jello diagnostic; developer boots and
`?jellogpucheck=1` still run it. Live CPU slime physics is unchanged.

## Reading a report

Open Details during startup, or Pause > Loading report afterward. Copy
report uses the clipboard when available; the text is selectable if the browser
denies clipboard access. Reports remain only in memory and include no save data.

The report records build, selected graphics preset, viewport/canvas dimensions,
water backend, cloud worker fallback, task status and duration, actual pass timings,
resource names, and caught errors. Task times include waiting and overlap when
work runs concurrently. Completed Resource Timing entries separately record
request durations and encoded sizes; zero-size entries are reported as unavailable,
not guessed to be cache hits. File tasks finish after script execution, not merely
when a request finishes downloading. Dormant GPU modules downloading does not mean
their solver is active. Audio code is a gate; music and sound downloads are not.

No-progress notices use time since the last changed task result or counter. They
can only update while the browser's main thread can run; a single synchronous
world-generation or drawing operation can still delay the display. Shader warm-up
yields between passes so most of that work remains observable.

Console access:

```js
SluiceLoading.report()  // detached snapshot of the current or last loading run
SluiceLoading.reports() // bounded history, preserving the initial startup
```

Late optional completions do not rewrite a recorded fallback or timeout. The water timeout
also disposes late-created GPU resources. Fatal startup errors retain the cover,
record the actual error, and offer a reload without clearing saved progress.

## Adding startup work

The early controller and critical styles live in `grand-motherload.html`, before
deferred scripts, so a failed game bundle cannot remove diagnostics. Add script
tasks to its definitions and `data-loading-task` attributes together. Core scene
instrumentation lives in `045-loading.js`; save restoration reports in
`380-gm-presets-boot.js`. Keep task completion next to the actual readiness check.
Do not drive counters with elapsed time or mark an unobserved task complete.

Drawing effects belong in `046-shader-warm.js`. Its job list supplies the real
denominator. Each pass must restore all borrowed game state before yielding, and
the main canvas context must be restored in `finally`. Cached warm-up is reported
as reuse. The final readback still flushes the hidden canvas before release.

Run `node --check js/sluice.js` and `node tools/sluice-loading-smoke.mjs` after the
normal version bump and build. The smoke harness owns Chrome for Testing and
checks delayed/failed scripts, font failures, CPU fallback, GPU timeouts, worker
fallback, save restore, New Game, graphics changes, input lock, native report
controls, truthful percentages, phone and landscape layouts, reduced motion,
explicit GPU-jello diagnostics, and the art bench initialization contract.
