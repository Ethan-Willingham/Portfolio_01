/* ============================================================
   SLUICE - browser mining game
   Canvas-based, touch + mouse, no dependencies.

   Cross-LLM onboarding doc: see AGENTS.md (read by Codex) and
   CLAUDE.md (imports AGENTS.md via @-syntax for Claude Code).
   Read those before doing anything non-trivial here.

   SOURCE LAYOUT: js/sluice.js is ASSEMBLED by ./build-sluice.sh, which
   concatenates the fragments in js/sluice/ (NNN-*.js) in order. The
   fragments are the editable source. If you are reading this inside the
   assembled js/sluice.js, do NOT edit it here; find the matching
   fragment in js/sluice/ and edit that, then run ./build-sluice.sh
   (a direct edit to the bundle is overwritten on the next build).
   To collapse back to one hand-edited file: build once, then
   "rm -rf js/sluice build-sluice.sh". See AGENTS.md "Split layout".

   NAVIGATION: Every section has a banner comment. Grep for the
   banner text to jump there; don't use hardcoded line numbers.
   See AGENTS.md for the full section index + the fragment map.

   Hotkeys (full list in AGENTS.md): WASD/arrows move,
   Space jetpack, E shop, T teleport, B balloons, 1/2 bombs,
   Z zoom, R restart, ` dev mode, Esc closes shop.

   Style invariants — DO NOT MODERNIZE:
     - var, not let/const                  - no dependencies
     - single IIFE wrapper                 - concat-only build
     - no ES modules, no JSX, no TS        - no top-level await
   ============================================================ */
(function () {
  'use strict';

  /* ---- Analytics helper (safe no-op if gtag is missing) ---- */
  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }
  var hasDrilledOnce = false;

  var canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ---- Render architecture: stacked canvas layers ----
  // The frame is composited from several <canvas> elements, not one:
  //   base   #game-canvas      this 2D canvas — world, sprites, HUD,
  //                            console; the WebGL sky shader is drawn
  //                            INTO it each frame via ctx.drawImage.
  //   z-4    liquidGLCanvas    WebGL liquid renderer (oil + water).
  //   z-5    smokeFluidCanvas  WebGL smoke fluid sim.
  // The two WebGL layers are absolutely-positioned DOM siblings of the
  // main canvas, NOT blitted into it. That deliberately avoids a
  // per-frame cross-context drawImage sync barrier (see the v10.83 /
  // v10.90 notes at each canvas's setup) — but it hands the final merge
  // to the browser's compositor, which stacks all layers every frame.
  // That composite cost scales with each canvas's pixel area and is
  // paid by the compositor, off the JS thread.
  //
  // GOTCHA: compositor cost is invisible to every in-page probe.
  // performance.now() (the perfMark buckets) sees only JS; gl.finish()
  // (gpuProbe) drains only one GL context's render queue, never the
  // compositor. An oversized DOM-layer canvas can halve the frame rate
  // while every probe still reads ~0. That is exactly what the
  // v12.4-v12.18 M1 Air thrust-fps hunt chased for ~15 versions: a
  // smokeFluidCanvas larger than the main canvas — cheap to render but
  // expensive for the M1 GPU to composite — dropped 60fps to ~30 in
  // flight. Fixed in v12.18 by shrinking the canvas. To catch this
  // class of bug: A/B-toggle the subsystem with a PERF_DISABLE_* flag
  // and watch real FPS, or compare a layer canvas's width x height
  // against the main canvas.

  // Build version — bumped with every shipped change so playtest screenshots
  // can be matched to a specific commit. Format is v<stage>.<iter>:
  //   stage = current movement design stage (Stage 3 = corner correction)
  //   iter  = sequential iteration number within that stage
  // See archive/MOVEMENT_DESIGN.md for what each stage covers.
  var GAME_VERSION = 'v25.36';
  // ---- Debug toggles ----
  // Per-subsystem A/B switches kept from the v11/v12 perf-optimization
  // sessions. All default OFF (false = the subsystem runs normally); flip
  // one to true to remove that system while profiling with ?dev=1.
  var PERF_DISABLE_SMOKE_FLUID    = false;  // WebGL smoke fluid sim
  var PERF_DISABLE_ROCKET         = false;  // rocket plume (flame + wake + wash)
  var PERF_DISABLE_EXHAUST_BRIDGE = false;  // diesel exhaust-pipe smoke bridge
  var PERF_DISABLE_WATER          = false;  // liquid / water sim
  var PERF_DISABLE_CAVE_WALLS     = false;  // true = flat biome fill instead of the parallax wall pattern (v13.11)
  var PERF_DISABLE_TERRAIN_CHUNKS = false;  // v13.7 — cached terrain chunk blits
  var PERF_DISABLE_NIGHTSKY       = false;  // v13.14 — procedural night-sky cosmos blit
  var PERF_DISABLE_MOUNTAINS      = false;  // v13.14 — parallax mountain silhouettes
  var PERF_DISABLE_CONSOLE        = false;  // v13.14 — bottom gauge console (drawConsole)
  var PERF_DISABLE_WEATHER        = false;  // clouds + precip + storm (155-weather.js)
  // v13.14 — surface-FPS A/B isolation. 'H' in dev mode cycles which
  // subsystem is disabled so the GPU hog can be found empirically — the
  // perf panel cannot break the single per-frame canvas GPUTask down.
  var PERF_ISO_NAMES = ['normal', 'no smoke fluid', 'no rocket plume', 'no night sky', 'no mountains', 'no console/gauges', 'no terrain chunks', 'no water', 'no weather'];
  var perfIso = 0;
  // ---- Stage-1 perf toggles (v23.32) ----
  // Default ON (true = the optimization runs); flip false to restore the exact
  // pre-v23.32 every-frame behavior so each can be A/B-measured in Stage 2.
  // Both shed per-frame smoke-sim work without changing output while the dye
  // field is busy:
  //   IDLE_SKIP     — skip the smoke sim step + world-lock scroll once the dye
  //                   field has had no emission for ~5s (rig parked, away from
  //                   the chimney): the field has fully dissipated, so the step
  //                   is a no-op. Any new splat wakes it within a frame.
  //   OBSTACLE_DIRTY— repaint + re-upload the smoke collision mask only when the
  //                   camera/screen moved or terrain/jello/blasts could have
  //                   reshaped it, instead of every frame.
  var PERF_SMOKE_IDLE_SKIP      = true;
  var PERF_SMOKE_OBSTACLE_DIRTY = true;
  // v23.39 — dev 'K' cycles the two smoke optimizations through their 4 on/off
  // combinations for in-flight A/B (0: both on, 1: idle-skip off, 2: obstacle-
  // dirty off, 3: both off). Also flippable via the gm 'perf.*' levers / L panel.
  var perfSmokeOptCycle = 0;
  // v23.44 — the magma/mantle molten-rock tint is baked into the terrain chunk
  // (drawCachedLayerDecoration) AND redrawn live every frame in render(). The
  // live redraw is what fills the smooth void-erased cave edges. Flip true (gm
  // 'perf.magmaSkipLiveTint' / OPT TOGGLES) to skip the per-tile live fillRect
  // and rely on the baked tint only — an A/B for the redundant-draw win. Default
  // false = current look exactly.
  var PERF_MAGMA_SKIP_LIVE_TINT = false;
  // v25.31 — console instrument cache. render.console was the #1 CPU bucket in
  // EVERY scene (harness-ranked, 1.8-2.3ms/frame at 4x throttle): all 8 gauges
  // repainted every frame even parked. The instruments now render into an
  // offscreen layer and a gauge repaints ONLY when its value signature changes
  // (per-bay dirty tracking; the per-frame cost of a static console is two
  // drawImage blits). Flip false (gm 'perf.consoleCache') to restore the
  // pre-v25.31 direct draw for A/B.
  var PERF_CONSOLE_CACHE = true;
  // Perf stress multiplier: renders the frame N times per tick so the true
  // frame cost surfaces past a vsync cap. Set via ?stress=N in the URL.
  var PERF_STRESS = 1;
  // ---- Mobile perf overlay (v25.9, diagnostic) ----
  // Show the dev perf overlay on touch devices by default, WITHOUT enabling the
  // rest of dev mode (no free purchases / no money-to-999,999 cheat — those stay
  // tied to the backtick `devMode` toggle / ?dev=1). It is purely the read-only
  // perf panel, so a phone can be profiled where there is no backtick key. The
  // panel is auto-trimmed to the diagnostic sections on mobile (the keyboard-only
  // A/B, BENCH, OPT and DEV-KEY sections are dropped) so it fits the screen for a
  // screenshot. Set false and rebuild to hide it once mobile profiling is done.
  var DEBUG_PERF_ON_MOBILE = true;
  // ---- Hard-landing impact FX master switch (testing aid, v22.17) ----
  // Everything that fires when the rig SLAMS into solid ground or a slime: fall damage,
  // the landing squash, the red damage-flash, and the hit-pause (a brief game-loop FREEZE).
  // Defaulted OFF so none of it disrupts physics testing (the freeze + flash are jarring while
  // watching the jello, and fall death forces a restart mid-test). Set true, or flip the gm
  // lever 'jello.FALL_IMPACT_FX' (top of the L panel), to restore the full landing feel.
  var FALL_IMPACT_FX = false;

