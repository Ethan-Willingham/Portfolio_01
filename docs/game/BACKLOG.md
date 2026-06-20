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

## Shop (recipe still live, not lost)
- **Station silhouette-hover mask PNGs**: the how-to is at
  `assets/shop/soviet/masks/README.md`; the four PNGs were never produced, so
  the shop falls back to rect-outline hover.

## To verify
- **Re-entry plume IndexSizeError**: archive/NIGHT_NOTES.md logged a possible
  IndexSizeError in the rover re-entry plume. Confirm whether it still fires
  before assuming it is fixed.
