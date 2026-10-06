# Wikipedia pixel grid

An In Progress post at `wiki-pixel-grid.html`. The first review set is exactly
250 equal square artworks. Each tile occupies 256 by 256 logical grid units. Do not expand beyond 250 until Ethan approves it.

## Source and artwork workflow

Download a Wikimedia articles dump into `research/wiki-pixel-grid/`, which is
local-only. Import with `python3 tools/wiki-pixel-grid/import-wikipedia.py DUMP`.
The importer stores every nonredirect mainspace article in SQLite and samples
250 articles without replacement with a recorded seed. Do not cherry-pick the
pages. Read each selected article offline, select its most visually interesting
explicitly mentioned subject, save its evidence and source revision, generate
one artwork, then advance to the next article.

At tiles 1, 51, 101, 151 and 201, choose a new overall artistic approach.
These are completely different media or visual approaches, including nonpixel
art. All approaches use the same square footprint. Record choices at the boundary,
so later choices can respond to the preceding artwork. Do not fabricate subjects
or replace thin articles with more interesting pages.

## Fidelity and navigation

Keep original generated PNG masters, each square. Pixel art targets a 256 by 256
art-pixel grid, but generated masters are preserved at their returned resolution. Other media retain higher-resolution masters so zooming reveals
detail. The 256 by 256 tile footprint is not a master-resolution limit. Ship
lossless WebP copies for the detail tier and small previews for the overview.
Do not downsample or recolor masters. The fullscreen viewer contains no visible
header, captions or controls. Pointer drag, wheel and pinch navigate it. Clicking
or tapping a tile opens its article in a new tab. Keyboard arrows pan, plus/minus zoom, Home fits the grid, and Enter opens the center tile. Empty slots
remain empty until actual art exists. Sources and prompts live in the manifest.
Each tile stores both the current article URL and the exact source revision URL.
An accessible list exposes all completed tiles' article links to screen readers.

## Medium decisions

- Tiles 1 to 50: cinematic pixel-art scenes.
- Tiles 51 to 100: tactile layered cut-paper relief sculpture.
- Tiles 101 to 150: monochrome ink engraving with crosshatching.

## Verification

Check the JavaScript syntax and boot in owned Chrome for Testing. Verify
mouse drag, anchored wheel zoom, pinch, resize, keyboard navigation, bounded
image residency and source/master dimensions. Keep at most 12 decoded full-resolution tiles in
memory; use the overview for the remaining distant tiles. Browser tests close their exact
owned browser in a finally block.
