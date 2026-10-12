# Smoke-ring drum

The `smoke-ring-cannon` scene uses a physical rear membrane. Clicking or tapping
the skin adds velocity to its 37 material nodes. Fixed ends, tension, damping,
backing stops and the previous air-pressure sample determine its motion.
The visible skin follows those same nodes. It has no animation curve.

Each membrane segment enters the shared smoke solver as an immersed moving
solid. The opt-in `SOLID_PROJECTION` mode reflects normal velocity at static
and moving walls, applies Neumann pressure boundaries, and uses red/black SOR
with relaxation 1.85. The cannon uses a 128-cell short axis and 128 pairs of
pressure iterations. The pressure gradient includes the central difference's
one-half factor; pressure readback uses the corresponding `dx² / dt` scale.

Smoke dye is passive and replenished inside the chamber on accepted strikes.
No strike injects fluid velocity, vorticity or a smoke shape. The membrane
displaces air through the 32-pixel opening, and fluid advection carries the
rolling front. Pressure also loads the existing elastic slime.

This remains an approximate two-dimensional incompressible section. It shows
the counter-rotating pair that cuts through a three-dimensional smoke ring.
It does not simulate a three-dimensional drum, acoustic sound, calibrated
pressure or a closed energy budget. Pressure feedback lags one step, moving
air velocity is bounded at the grid resolution, and the collocated projection
and subsequent advection leave numerical divergence and dissipation.

The default `SOLID_PROJECTION = 0` retains the previous game and other-scene
smoke path. Leaving the drum restores its saved configuration and forces a
buffer rebuild at the previous simulation resolution.

Verification:

- `node tools/test-smoke-drum.mjs` checks real mouse, touch and Enter input,
  rolling-front transport, opposite circulation, still-air comparisons with
  an unstruck membrane and a disconnected moving boundary, restarts, layout
  and console errors. Screenshots go to `/tmp/smoke-drum-review`.
- `BASE_REF=origin/main node tools/perf/smoke-equivalence.cjs` compares the
  default shared solver with the upstream version. Before publication,
  49 checkpoints were byte-identical across WebGL 1 and 2, manual filtering,
  shading, static and moving masks, scrolling, clearing and resizing.
- `node tools/toy-engine-sync.mjs --check` verifies that the toy's engine
  matches the canonical game fragment. Rebuild Sluice after fragment changes.
