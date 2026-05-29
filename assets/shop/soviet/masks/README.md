# Shop station mask PNGs — recipe

Drop four transparent-background PNGs in this folder. The renderer auto-detects them and switches from rect-outline hover to silhouette-outline hover. No code change needed.

## File names (exact)

```
workshop.png
shelf.png
board.png
leave.png
```

## Specification

- **Same dimensions as `../background.png`** (1920×1080 or whatever the source is — the renderer scales them together).
- **Transparent background.** Anything that is part of the station = opaque. Anything that is NOT part of the station = transparent (alpha 0).
- **Color of the opaque pixels does not matter.** Use solid white, solid black, magenta — the renderer reads only the alpha channel and recolors at runtime.
- **No anti-aliased edges.** The outline renderer assumes hard binary edges. Soft edges produce fuzzy outlines.

## What "the station" means per file

| File | What's opaque |
|---|---|
| `workshop.png` | The whole workbench: wood top, drawer cabinet, drill machine, lamp, pegboard with tools, tools themselves. Everything the player should see outlined when hovering "the workshop." |
| `shelf.png` | The front counter (wood top + front face), and the items sitting on it (jerrycan, dynamite, medkit, repair kit, batteries, etc.). |
| `board.png` | The chalkboard with its brass-trimmed frame, plus the "COMING SOON" paper sign tacked to it. |
| `leave.png` | The metal door behind the clerk (the one with the rivets and handle). Just the door rectangle; not the wall around it. |

## Easy way to make them — Photopea (free, browser-based)

1. Open [photopea.com](https://www.photopea.com).
2. File → Open → select `assets/shop/soviet/background.png`.
3. For each station:
   1. Use the **Magic Wand** (tolerance ~30, click inside the station) or the **Object Selection / Quick Selection** tool to select that station's silhouette.
   2. Refine with Lasso/Pen if needed — get the outline as accurate as you want.
   3. **Layer → New → Layer via Cut** (creates a new layer with just the selection).
   4. Hide the original background layer (eye icon).
   5. Select All → Edit → Fill → White (so the new layer is solid white where the station was, transparent everywhere else).
   6. **File → Export As → PNG**, save into `assets/shop/soviet/masks/` with the right filename.

Each mask should take about 3-5 minutes once you have the rhythm. ~20 minutes total for all four.

## AI-generation alternative

If you'd rather generate masks via AI:

> Same scene as background.png but everything is solid black except the [WORKBENCH AREA / FRONT COUNTER / CHALKBOARD AREA / METAL DOOR], which is solid white. No other detail. Pure two-tone.

Then in Photopea: Magic Wand the white area → Select Inverse → Delete → Export PNG. Done.

## Verifying the result

1. Drop the PNGs into this folder.
2. Refresh the game.
3. Walk into the depot, hover over the workbench. The yellow outline should follow the workbench's exact silhouette.
4. If the outline is offset / mis-shaped, the mask is at a different resolution than the background — re-export at exactly the same dimensions as `background.png`.
