# BACKLOG.md: salvaged ideas

Unbuilt or deferred ideas kept when their source design docs were archived
(see `archive/`). This is a holding pen, not a spec; flesh an item out before
building it.

## Underworld / ores (from archive/NIGHT_PLAN.md, archive/NIGHT_NOTES.md)
- **Crystal Hollow layer**: a deep cavern biome that was specced but never built.
- **Geode ore**: dropped during the v16 underworld pass; the renderer concept
  is in the archived NIGHT_PLAN.
- **Peaked pickOre distribution**: replace the flat per-depth chance with
  gaussian peaks per ore, so each ore has a depth band where it is most common.
- **Layer-identity pass**: stronger visual identity per underground layer.

## Perf (from the v25.31 optimization pass; baseline harness = scratchpad perf-baseline.mjs recipe)
- **Next buckets after the console cache** (4x-throttle flight scene, ms/frame):
  update.smoke 0.9 + smokeObstacle 0.7 + smokeObstacleDraw 0.5 (the obstacle
  chain re-runs whenever the camera moves; a coarser dirty grid or half-rate
  repaint is the obvious lever), render.undergroundBg 0.5 on the SURFACE
  (parallax cave walls painting under an almost fully covered band),
  render.skyComposite 0.4 (WebGL sky drawImage'd into the 2D canvas per frame;
  celestials are screen-pinned and time-of-day is slow, so a 2D staging copy
  refreshed a few times a second may cut the cross-context sync).
- **Deep-idle p99 spikes** (22ms, jank 5%): terrain chunk rebuild bursts while
  parked underground; consider budgeting rebuilds per frame.
- **Flaky jello harness scenarios to stabilize** (shipped-code dice rolls, NOT
  regressions): stress T1 sometimes leaves one chronically folded cube churning
  at the dev-pen wall top (force-sleep endpoint exists but the fold flickers
  through its strike counters); engulf R16 reach occasionally lands 8-10px vs
  the 8px bar; engulf R9 parked once. Stabilize the scenarios (or bars) in a
  dedicated session; three same-hour attempts flaked differently each run.

## Shop (recipe still live, not lost)
- **Station silhouette-hover mask PNGs**: the how-to is at
  `assets/shop/soviet/masks/README.md`; the four PNGs were never produced, so
  the shop falls back to rect-outline hover.

## To verify
- **Re-entry plume IndexSizeError**: archive/NIGHT_NOTES.md logged a possible
  IndexSizeError in the rover re-entry plume. Confirm whether it still fires
  before assuming it is fixed.
