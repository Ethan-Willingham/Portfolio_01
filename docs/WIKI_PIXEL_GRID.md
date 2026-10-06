# Wikipedia art grid

An In Progress post at `wiki-pixel-grid.html`. The first review set is exactly
250 equal square artworks. Do not expand beyond 250 until Ethan approves it.

## Creation policy

Ethan's instruction: never use GPT-Image-2.5 for this project. Use the LLM and
ordinary drawing and rendering tools, without any image-generation models.
This applies to every future tile, revision, thumbnail and expansion.

The current grid is drawn by `tools/wiki-pixel-grid/draw-art.py` with Pillow.
Its shapes, scene compositions and surface treatments are written in code.
`subjects.json` records each individual article selection and evidence.
No image model or downloaded artwork is used by this renderer. Earlier
image-model experiments are retired in the ignored local directory
`research/wiki-pixel-grid/retired-model-art/`; they are not part of this grid.

## Offline source

The complete Simple English Wikipedia articles dump is stored locally in
`research/wiki-pixel-grid/`, with its download URL, date and verified checksum
in the public manifest. The SQLite collection has 285,478 nonredirect mainspace
articles. The 250 articles were sampled uniformly without replacement with the
recorded seed. Keep their sequence. Do not substitute more interesting pages.

Read the selected article offline, choose a subject explicitly mentioned there,
record evidence and the exact revision, draw one tile, then advance. Short
articles may get symbolic place compositions. Buildings and people in these
interpretations do not claim documentary accuracy or exact likenesses.
Sensitive historical articles use restrained subjects, without celebratory
portraits of perpetrators or illustrations of violence.

Each tile keeps its current Wikipedia page URL and exact source revision URL.
The manifest attributes the source text under CC BY-SA 4.0. Clicking a tile
opens its article. The accessible link list exposes every source to readers.

## Five media

- Tiles 1 to 50: actual 256 by 256 pixel-art scenes, with hard pixel clusters.
- Tiles 51 to 100: paper collage, layered shapes, shadows and paper grain.
- Tiles 101 to 150: ink engraving, monochrome hatching and fine outlines.
- Tiles 151 to 200: stained glass, triangular panes and lead lines.
- Tiles 201 to 250: woven tapestry, rows of individual threads and stitches.

Every tile occupies the same 256 by 256 logical grid units. The four nonpixel
sets have 1024 by 1024 masters. This preserves detail without forcing other
media onto a 256-pixel raster. Code and recorded seeds remain editable and
allow higher-resolution rendering later.

## Rebuild and fidelity

Use Python with Pillow:

```
python3 tools/wiki-pixel-grid/draw-art.py
```

Use `--tiles 1 51` to rebuild specific tiles. The public subject records let the drawings rebuild without another download.
PNG masters are saved to `research/wiki-pixel-grid/code-masters/`. Public detail
images are lossless WebP with the same decoded pixels. A SHA-256 of the RGB
pixels is recorded per tile. Thumbnails and the small overview are separate
navigation assets; neither replaces a master.

## Navigation and checks

The fullscreen viewer contains no visible header, captions or controls. Drag
pans, wheel and pinch zoom, arrows pan, plus/minus zoom, and Home fits the grid.
Click or tap opens the tile's Wikipedia page. Enter opens the center tile.

Only visible previews and up to 12 full-detail tiles are decoded, with old
buffers released before new ones are allocated. Drawing is event-driven;
inertia respects reduced motion. Browser tests own and close their exact
Chrome for Testing process. Never launch the owner's personal Chrome headlessly.

Run `node --check js/wiki-pixel-grid.js` and
`node tools/wiki-pixel-grid/test-viewer.cjs`. Validate all 250 source URLs,
evidence, media boundaries, distinct decoded hashes and lossless master copies.
Review contact sheets and browser screenshots before publishing.
