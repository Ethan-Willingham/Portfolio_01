# Asset brief: Birch Clearing scope detail and dawn exposure

Status: delivered
Date: 2026-10-03
Asset category: first-map detail and atmosphere correction
Runtime destinations: `assets/hunting/detail-v9/`, `birch-terrain-v9.webp`, `birch-detail-v9.json`
Source master directory: `assets/hunting/source-v9/`
Reference packet: `NODE_PATH=/path/to/node_modules node tools/hunting-art-reference.cjs --brief birch-base`

## Subject and correction

The owner found version 8 blurry through the 6x scope and strangely dark at
06:47. Its 1664-pixel terrain supplied too few pixels across the magnified
lens. The linear dawn exposure and color overlays also dulled the original
meadow. This pass adds real fine painted information and clearer morning light
to the existing calm first field, keeping its visible wooden hunting stand.

The wide layout, projected horizon, live clock and saved time remain aligned.
The sky and stand still use their version 8 masters. Animals, ambient wildlife,
Cypress scenery, the interface and effects await their separate painting passes.

## Painting references and production

Primary catalog reference: `salisbury`, John Constable's Salisbury Cathedral
from Lower Marsh Close. The full original and the birch-base studies guide
grouped leaves, branching, fine grass marks, warm highlights and colored shade.
Its source SHA-256 is recorded in `prompts.json`. The version 8 scene retains
its Daubigny and Michel distance/sky treatment and Caravaggio-guided timber.
No cathedral, buildings or human figures are imported into the game.

Tool: built-in `image_gen.imagegen`. Each of 14 calls edits a precisely
registered terrain crop, attaching that crop as the geometry target and
Constable's original as a style reference. The prompts ask for fine plausible
leaves, bark, twigs, stems, seed heads, flowers and soil marks while preserving
large shapes, light direction and transparent sky gaps. `prompts.json` saves
the complete final prompt set, input/output paths, reference and alpha settings.
The selected native outputs are persisted in `tiles/`; exact input crops are
in `inputs/`. No CLI fallback was used.

## Registration and export contract

The original terrain is 1672 by 941 pixels. A four-column, four-row layout uses
418 by 235 cores and 16 horizontal / 9 vertical pixels of overlap at each edge.
Top-row columns 2 and 3 contain only empty sky and need no new tile. Each
450 by 253 crop was repainted at a native 1672 by 941 resolution. The master
contains new detail, rather than an artificial enlargement of the input.

`layout.json` stores normalized rectangles, source paths and the crop grid.
`tools/build-hunting-detail.cjs` exports each master at 1664 by 936 using smooth
Lanczos sampling, WebP quality 95, alpha quality 100 and effort 6. It feathers
overlap edges by multiplying the generated alpha, preserving soft foliage
boundaries. The builder handles only registration, resampling and compositing;
all new painted content comes from the saved imagegen outputs.

The runtime manifest records exact dimensions, placement, byte counts and
SHA-256 fingerprints for crops, masters, exports and the original underpainting.
The terrain's effective runtime density is 6183 by 3481 pixels. Its compact
wide overview is 2048 by 1152. Detail exports total about 10.1 MiB, loaded on
demand rather than all required before play.

The renderer uses the overview in the wide view. The 6x scope draws the original
underpainting plus only intersecting detail tiles, usually one to four. Four
center tiles warm after entry. At most six decoded tile images and light buffers
are retained; old buffers are released during panning. The underpainting is
immediately visible while a tile loads. The viewport canvas follows device
pixel ratio, capped at 2560 by 1440. Uniform scale 1.079 and bottom anchoring
register the source's 44.4-percent skyline to the logical 40-percent horizon.

## Exposure and continuity

Dawn opens promptly into clear light through a curved daylight response.
Saturation is preserved, cool fill is weaker in daylight, and dawn warmth no
longer imposes a brown wash. At 06:47, a matched open-field sample has weighted
luminance 119.70 versus version 8's 96.98, about 23 percent brighter. The
browser check requires that sample to retain at least 88 percent of its midday
luminance. This correction changes lighting, without jumping the saved clock.

All tiles share the same clock-dependent light steps and global coordinates
for the broad moving meadow highlight. Night still becomes distinctly darker,
with its live moon and stars. The sun remains separate and moves with time.

## Visual review and validation

Reviewed native full-scene, four 6x scenery targets, Retina scope, dawn, midday,
dusk, night and both phone orientations. Grass stems, leaves, fine branching,
bark and soil are visible at scope scale. The wide meadow retains connected
plant groups, open hunting ground and the modeled wooden foreground. Tile
boundaries blend without visible rectangular edges in the reviewed captures.
Original animal projection and hit masks remain in use.

Actual game evidence is saved in `review/`: matched `scope-comparison.jpg`,
`morning-0647.jpg`, `sunny-field-canvas.jpg`, birch and flower scope targets,
`retina-scope.jpg`, `night-field.jpg` and phone captures. The comparison uses
the same aim point, 6x zoom and 06:47 clock, without sharpening or retouching.
Full test captures are in `/tmp/hunting-game-v9-qa/`.

Validation: 108 browser checks passed, with no page errors or missing assets.
They include all four detail targets, bounded image/buffer cache, dawn exposure,
Retina rendering, mouse and touch shooting, scope panning, sun travel, saves,
fullscreen and mobile controls. Reference, original scene and new detail
fingerprints were verified. Campaign and physics checks passed with all five
deer and the boar. The preview thumbnail is a real game capture, exported as
JPG and WebP for the archive card and social metadata. CSS and script queries
use version 9.

## Future work

Keep this registered detail layer as the source for scope views when adding
scenery changes. Preserve its placement or regenerate the affected neighboring
tiles together. Cloud masses, source cast shadows and plants remain painted
static forms; future weather and plant movement need their own asset briefs.
Animal and interface art have not yet received their painting conversion.
