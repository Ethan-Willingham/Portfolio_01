# Hunting art, version 2

The owner requested replacing the first port's artwork on 2026-09-30.
The replacement uses the built-in imagegen tool, with one generation each
for the environment, deer, and hunter. No CLI image-generation fallback was
used.

## Final assets

- `assets/hunting/clearing-v2.png`: 640 by 360 woodland meadow backdrop.
- `assets/hunting/deer-v2.png`: 64 by 48 transparent right-facing buck.
- `assets/hunting/hunter-v2.png`: 24 by 64 transparent rear-facing hunter.
- `assets/hunting/source-v2/clearing.png`, `deer.png`, and `hunter.png`: full
  generated masters, including the original alpha channels.
- `assets/hunting/source-v2/prompts.json`: the complete, final generation prompts.
- `assets/thumbs/hunting-game-v2.jpg` and `.webp`: a screenshot of the real game.

## Art direction

A woodland clearing in warm early morning light, with layered birch and spruce
at its edges, sage and olive grass, low ferns, dusty gold highlights, and an
open middle for readable animals. The buck uses ochre, walnut, and cream; the
hunter uses a worn rust jacket, olive trousers, and brown boots. The backdrop
and sprites share light from the upper left. No labels or baked-in UI.

The sprite prompts request exact transparent silhouettes and separate legs.
The field prompt reserves clear earth at bottom center for the live stand and
hunter. The full prompts capture the composition, palette, camera, pixel
clusters, and exclusions for each asset.

## Rebuilding

```sh
NODE_PATH=/path/to/node_modules node tools/build-hunting-art.cjs
```

The builder uses the saved masters, crops sprite margins based on opacity,
samples to the logical game sizes with nearest-neighbor resizing, and writes
palette PNGs. The runtime silhouettes use binary alpha, giving the renderer
and per-pixel collision exactly the same boundaries. The generated master
alpha channels remain intact. The field uses 128 palette colors and the
sprites up to 48 each, with no dithering.

The renderer now uses a 640 by 360 canvas and 32 pixels per world unit, so the
playable world is still 20 by 11.25 units. It draws the wooden platform from
pixel planks, posts, fasteners, and a front lip. The new deer silhouette has
its shoulder at normalized u = 0.67, v = 0.45. Its actual PNG supplies the
hit mask, including the transparent spaces between legs and antlers.

Run the simulation and browser checks in `docs/HUNTING_GAME.md` after changes.
They verify both orientations, actual sprite opacity, vital recovery, wind,
reload, scope coordinates, and touch shots. Inspect the desktop and mobile
screenshots too. The first port's sprites and editable Aseprite sources stay
in `assets/hunting/` and `assets/hunting/source/` as source history.
