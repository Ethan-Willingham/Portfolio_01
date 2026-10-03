# Hunting art

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

## Version 3, camp and tracking

The original game prompt guided the new camp loop on 2026-09-30. Four additional
assets use the same built-in imagegen workflow and restrained pixel palette:

- `assets/hunting/marsh-v3.png`: 640 by 360 cypress and reed clearing.
- `assets/hunting/boar-v3.png`: 64 by 42 right-facing wild boar, binary alpha.
- `assets/hunting/dog-v3.png`: 40 by 22 right-facing tracking dog, binary alpha.
- `assets/hunting/trail-v3.png`: 640 by 360 illustrated search interstitial.
- `assets/hunting/source-v3/{marsh,boar,dog,trail}.png`: full generated masters.
- `assets/hunting/source-v3/prompts.json`: the complete final prompt set and tool.

The existing birch background, deer and rear-view hunter are reused. The new
boar has a lower silhouette, with the shoulder checked at u = 0.67, v = 0.45.
The species' real alpha masks drive hit detection, and vital guides use those
same sizes. Blood marks, time-of-day shade and the stand are drawn in canvas.
Bracken follows the hunter after purchase and can be left at camp.

`tools/build-hunting-art.cjs` now rebuilds both versions. It preserves aspect
ratio when only one sprite dimension is supplied, while using the authored
logical sizes for the two animal targets. All generated source alpha stays
intact. These are generated assets, not hand-authored or directional animated
sprite sheets. They can be replaced with the owner's future drawn assets,
provided the renderer, native hit mask and vital coordinates are updated together.

## Version 4, five deer levels

The owner requested four-legged deer and five increasingly impressive levels
on 2026-10-02. All active deer art now uses new built-in imagegen masters, with
the original buck as a style reference. Three first-pass variants retained the
extra foreleg and were corrected with targeted imagegen edits before shipping.
The old v2 sprite remains as history and is no longer loaded by the game.

| Asset | Logical size | Appearance |
|---|---|---|
| `deer-1-v4.png` | 56 by 56 | Young tan buck, small forked rack |
| `deer-2-v4.png` | 60 by 57 | Russet woodland adult, branching rack |
| `deer-3-v4.png` | 64 by 59 | Chestnut ridge buck, stronger shoulders and tall tines |
| `deer-4-v4.png` | 70 by 63 | Dark old monarch, weathered muzzle and irregular forks |
| `deer-5-v4.png` | 76 by 75 | Silver winter stag with a large crown of antlers |

The five PNGs live in `assets/hunting/`. Their full transparent masters are
`assets/hunting/source-v4/deer-[1-5].png`, and `source-v4/prompts.json` preserves
the initial prompt set and corrective edits. The builder crops by opacity and
scales by width while preserving each master's aspect ratio, then quantizes
to 48 colors and binary alpha. It does not stretch deer into a shared rectangle.

Every final master was inspected for two hind legs and two forelegs. The physics
test also verifies four separate connected silhouettes in the bottom 15 percent
of each runtime sprite. Each level's shoulder is opaque at u = 0.67, v = 0.45
in both orientations. The renderer, guide and bullet collision select the same
per-animal asset, so a larger rack never inherits another level's hitbox.
