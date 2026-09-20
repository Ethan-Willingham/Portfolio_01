# Loading diagnostics

The loading rail counts settled tasks, not seconds or bytes. A task settles when
it completes, selects a working fallback, or reuses existing work. Failed tasks
do not count as settled. There is no estimated percentage or time remaining.

Startup tracks six deferred scripts; mine generation/save restoration; regular
and bold HUD fonts; moon image decoding; water backend initialization; destination
caches; representative drawing passes; and graphics queue completion. This is 14
gates in five groups. Scene rebuilds have only their relevant gates. A new mine
includes world preparation; a cold return or graphics change does not.

The outer rail uses those gates as equal units, despite their different durations.
The active drawing gate also reports actual completed passes. Terrain and clouds
show ready cache counts for the destination, followed by the existing requirement
for six complete frames. These cache counts can change as caches are invalidated.
The GPU gate counts settled queues and two presentation opportunities. A timeout
is recorded as a fallback, never as confirmed GPU completion.

## Reading a report

Open Loading details during startup, or Pause > Loading report afterward. Copy
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

Late optional completions do not rewrite a recorded timeout. The water timeout
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
controls, mobile/reduced motion, and the art bench initialization contract.
