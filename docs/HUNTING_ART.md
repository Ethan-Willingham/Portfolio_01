# Hunting art

The current visual direction is `hunting-style/README.md`: every map, animal,
interface and effect follows the 14 paintings on the owner's `gallery.html`,
by instruction of 2026-10-03. Use its catalog and reference packets before
creating or changing any hunting visual. The version 2 to 5 descriptions below
are asset history. Their pixel-art prompts and normalization settings do not
define the new painterly target. The first scenery brief is
`hunting-style/FIRST_MAP.md`.

## Version 13, repair the reported center-field vegetation

The owner flagged the scope's oversized hooked plants and artificial-looking
tree line. A registered repaint replaces that weed cluster with low meadow
grass and joins the abrupt ridge step behind the central tree. It retains the
open field, tree locations, light bands and bright source colors. The selected
edit uses Constable and Homer references with the built-in imagegen tool.
`assets/hunting/source-v13/ASSET_BRIEF.md` contains the full production record,
selection review and matched scope comparison.

The repair crosses four existing tiles. The export builder replaces old paint
inside the repair's feathered coverage, including newly opened sky gaps, then
exports those four tiles at the existing 1664 by 936 size. It reuses the other
ten version 9 tiles. The current manifest and overview are `birch-detail-v13.json`
and `birch-terrain-v13.webp`. Fourteen tiles, the six-image cache and display
sampling stay in use; the repair adds no runtime layer or per-frame draw work.

Rebuild the current scene with `NODE_PATH=/path/to/node_modules node
tools/build-hunting-detail.cjs`. Use `--check` for current fingerprints and
`--version 9 --check` for the unchanged original assets. `--scenery-review` on
the browser harness captures the exact reported scenery and the repair edges.

## Version 11, reuse display-resolution scenery

The owner requested better FPS without changing the painted scene. The renderer
now caches raw sky, terrain and stand at the display's existing resolution.
Scope caches include extra coverage for panning, and invalidate when zoom, size,
loaded detail or camera coverage changes. Live sun, wildlife, aiming and shots
still draw each frame. The HUD writes only values that change.

No assets were regenerated, reduced or recolored. The 2560 by 1440 display cap,
native detail tiles and version 10 exposure correction remain active. The
120 browser checks cover source colors, real input and bounded cache memory.
`hunting-style/PERFORMANCE.md` records the before/after measurements and commands.

## Version 10, preserve the painting's exposure

The owner rejected the remaining artificial darkness at 05:30. The version 9
dawn curve still reduced terrain brightness to about half, with additional
saturation changes and cool/warm overlays. Version 10 removes that entire
relighting path. The painted sky, wide terrain, scope tiles and wooden stand
are drawn directly from the existing source images at every hour. The inner
lens vignette is also removed. The outer scope frame and reticle remain usable.

No art was regenerated or destructively edited. Version 8 sky/stand and
version 9 detailed terrain stay active. The six-image cache now retains only
images, without duplicate lighting canvases. The live sun, moon, stars, clock,
wildlife and saves retain their behavior. A painted night variant can be
reviewed separately if the owner later requests one.

Browser checks compare actual scene pixels with independent raw-source
composites at 05:30, 06:47, noon and night, plus four scope targets including
points near both sides of the lens. They allow two RGB steps for browser canvas
sampling differences. `hunting-style/review/v10-0530-comparison.jpg` compares
the old and corrected scene at the owner's exact 05:30 time.

## Version 9, native scenery detail and clearer dawn

The owner found the first scene too dark at 06:47 and blurry in the 6x scope.
Fourteen overlapping crops of its terrain were edited with the built-in
imagegen tool. Each original 450 by 253 crop now has a native 1672 by 941
painting with fine leaves, bark, grasses, seed heads and soil marks, guided by
Constable's `salisbury` reference. Original geometry and transparent sky gaps
remain registered to the version 8 underpainting.

- `assets/hunting/source-v9/inputs/`: exact input crops, including alpha.
- `assets/hunting/source-v9/tiles/`: native generated masters.
- `assets/hunting/source-v9/prompts.json`: all 14 edit prompts and tool provenance.
- `assets/hunting/source-v9/layout.json`: normalized crop placement.
- `assets/hunting/source-v9/ASSET_BRIEF.md`: references, export contract and review.
- `assets/hunting/source-v9/review/`: actual wide, scope, night and phone captures.
- `assets/hunting/detail-v9/`: feathered 1664 by 936 runtime tiles.
- `assets/hunting/birch-terrain-v9.webp`: 2048 by 1152 wide overview.
- `assets/hunting/birch-detail-v9.json`: source hashes, placement and native density.

Rebuild this historical version with `NODE_PATH=/path/to/node_modules node tools/build-hunting-detail.cjs --version 9`.
Its `--check` verifies all native masters, runtime dimensions and fingerprints.
It performs registration, smooth downsampling and edge compositing. It does not
synthesize painted content or enlarge the old source to invent detail.

The 6x lens loads only intersecting tiles and retains at most six decoded images
and lighting buffers. Center field tiles warm after entry. The original terrain
supplies an immediate fallback while a requested tile loads. The 2048 overview
is used for the wide view, rather than sampled as the detail source.

The dawn curve reaches clear light sooner, preserves saturation and reduces
the cool and brown overlay. At 06:47, the sampled open field is about 23 percent
brighter than version 8 in matched captures. The clock, saved time, live sun and
night transition still work. Version 8 sky and wooden stand remain active.
Animals and the rest of the game still await separate painting passes.

## Version 8, painted first scene

Birch Clearing uses an original oil-painted meadow, separate clouded sky and a
transparent wooden stand foreground, generated with the built-in imagegen tool
from the catalog's Constable, Daubigny, Michel and Caravaggio references. Fresh
hunts open at 08:00 for a bright, calm first field; existing saved clocks survive.
The sun, moon, animals, scope and ballistics remain live.

- `assets/hunting/source-v8/{terrain,sky,stand}.png`: native generated masters.
- `assets/hunting/source-v8/prompts.json`: all production and correction prompts.
- `assets/hunting/source-v8/ASSET_BRIEF.md`: reference jobs, registration and review.
- `assets/hunting/source-v8/exports.json`: exact dimensions and SHA-256 fingerprints.
- `assets/hunting/{birch-terrain,birch-sky,lookout-stand}-v8.webp`: runtime layers.

Rebuild with `NODE_PATH=/path/to/node_modules node tools/build-hunting-scene.cjs`.
Use `--check` to verify the masters, transparency corridors and runtime manifest.
Exports use smooth Lanczos resizing, WebP quality 95 and alpha quality 100.
They preserve soft alpha and paint detail. The older pixel-art builder is only
for historical assets. Existing deer and boar still use their established masks;
this scene pass does not turn those sprites into the final animal style.

The display canvas follows viewport resolution and device pixel ratio, capped at
4x the logical dimensions. The original 6x scope sampled those scene layers
directly; version 9 replaces terrain magnification with finer registered tiles.
Clock-dependent layer buffers adjust brightness,
color temperature and broad meadow light while retaining paint relationships.
The close stand stays out of the magnified view. Cypress retains its procedural
landscape and shares the new stand foreground.

## Version 2 history

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

The version 2 renderer used a 640 by 360 canvas and 32 pixels per world unit,
with a 20 by 11.25-unit playable world. It drew the wooden platform from
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
Version 3 allowed Bracken to follow the hunter after purchase or stay at camp.

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

## Version 5, distant lookout

The owner's 2026-10-02 clarification replaces the camp-and-walking presentation
with a stationary view across a much deeper field. The current renderer draws
layered hills, grass, distant trees, a sun whose position follows the game
clock, and changing daylight directly in canvas. The older meadow, marsh,
hunter, dog and tracking assets remain source history; their original scene
composition no longer defines the playable view.

Deer and boar retain their existing source sprites and binary collision masks.
Each animal has a physical size in the depth projection, so distant animals
appear small in the wide view. The 6x scope renders at the final magnified
scale to preserve those sprites' available detail. Rendering, pointer inverse
projection, per-animal dimensions and pixel collision must agree when art is
replaced. See `HUNTING_GAME.md` for the projection and flight equations.

Owls and squirrels are procedural canvas wildlife, with movement distinct
from the hunt animals. They do not use new generated sprite assets. The scope
and wide flight inset are live canvas treatments. The projectile's visible
drop and wind drift come from actual ballistic positions.
