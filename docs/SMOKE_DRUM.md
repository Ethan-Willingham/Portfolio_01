# Smoke-ring drum

The `smoke-ring-cannon` scene uses a physical rear membrane. Clicking or tapping
adds velocity to its 37 material nodes. Fixed endpoints, tension, damping,
backing stops and the previous air-pressure sample determine its motion.
The casing, clamps and skin are drawn at the same coordinates as their physical
boundaries. The skin has no animation curve.

The membrane's measured swept area sets a forward chamber-flow target during
compression. A bounded velocity penalty supplies the chamber flow that the
immersed-boundary-only calculation failed to resolve. Its response scales with
elapsed time. Outward refill uses the moving skin and pressure solver, without
an additional reversed jet. Each skin segment also remains an immersed moving
solid, and current pressure loads the skin and the existing elastic slime.

The cannon uses the original smoke projection with a 224-cell short axis and
32 pressure iterations. The optional sealed `SOLID_PROJECTION` experiment is
off in this scene. The previous sealed calculation, narrow mouth and weak dye
charge produced a small front with a long tail instead of the earlier clear
ring. The repaired chamber restores the 64-pixel opening and smoke charge.

Smoke dye is passive and replenished inside the chamber on accepted strikes.
The fluid solver generates the rolling front. No ring shape, prescribed vortex,
travel path or shot animation is supplied. Freezing the membrane prevents the
compression flow, even when its strike velocity has been set.

This is an approximate two-dimensional incompressible section. It shows the
counter-rotating pair through a three-dimensional smoke ring. The chamber
velocity penalty's work is not balanced against the membrane energy ledger;
pressure feedback lags one step, and the fluid has numerical dissipation.
This is not a converged sealed moving-wall solve, calibrated pressure,
three-dimensional drum acoustics or a closed energy budget. Leaving the drum
restores saved configuration and simulation resolution.

Verification:

- `node tools/test-smoke-drum.mjs` checks mouse, touch and Enter input,
  a strong detached front, opposite circulation, fixed endpoint attachment,
  unstruck and frozen-head comparisons, restarts, layout and console errors.
  Screenshots go to `/tmp/smoke-drum-review`.
- Visual comparison with the pre-drum cannon checks the front after 0.4, 1
  and 2 simulation seconds. Inspect the rendered ring as well as measurements;
  rotating smoke alone did not catch the previous regression.
- `node tools/toy-engine-sync.mjs --check` verifies that the toy's embedded
  shared engine matches the canonical game fragment. This repair changes the
  scene adapter and presentation, not that shared engine.
