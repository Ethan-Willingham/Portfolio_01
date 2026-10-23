# Warehouse pallets

Open `warehouse-pallets.blend` in Blender 5.2. The four collections are editable
assets, with separate deckboards, notched stringers and nail-head meshes.
All textures and the presentation font are packed into the file.

| Collection | Condition |
| --- | --- |
| 01 Fresh Pine | Pale, rough-sawn softwood, dark knots, resin and small manufacturing irregularities. |
| 02 Working Wear | Dirt in the grain, rubbed edges, shallow scrape marks and a small end split. |
| 03 Split Battered | Open end splits, a torn lead-board corner, attached splinters and heavy abrasion. |
| 04 Repaired | Old gray-brown timber with one contrasting fresh replacement deckboard. |

Each pallet uses a nominal 40-inch width across the deckboards and 48-inch
length along the three stringers: 1.016 by 1.2192 metres. The board stack is
0.12065 metres high. Seven top boards and five bottom boards sit on three
notched stringers. Larger splits and chips are actual geometry. Fine grain,
small scratches, dirt and growth rings use original generated PBR textures.
This is an appearance study for a game, without an assigned structural grade.

Construction reference: [Mallard Manufacturing's pallet type and quality
sheet](https://mallardmfg.com/wp-content/uploads/2024/02/Pallet-Type-Quality-Spec-Sheet-FINAL-2024.pdf).
The model height is calculated from the individual board dimensions.

## Working in Blender

The collection named `STUDIO` holds only presentation elements. Hide it to work
on the pallet assets. Move each pallet using its named root empty. The empty's
origin is at the floor centre; local +Y follows the long stringers. The overview
arranges these roots apart for comparison. Each asset collection's instance
offset matches its root, so collection instances insert at the pallet centre.

All four collections are marked as Blender assets. Each board has UVs, a small
editable bevel and weighted normals. Nails are grouped into one mesh per
pallet. Select a board and press Numpad Period to frame it. The scene contains
an overview camera plus close-up cameras for fresh pine and the damaged pallet.

The `textures` folder also contains unpacked 2048 by 2048 PNG atlases for later
use: base color in sRGB, tangent-space normal and roughness in non-color space.
Each material uses one set of three maps. Rows hold individual board surfaces;
the right-hand strip holds end grain. Roughness is stored in all RGB channels.

No Unity scene, material, prefab or existing rack model is changed by this set.
These are detailed editable source assets; LODs, colliders and engine import
are a separate integration step. Exact evaluated triangle counts and topology
checks are recorded in `warehouse-pallets-build.json`.

## Rebuild

From the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/build-warehouse-pallets.py
```

The builder runs in its own process and writes only this pallet folder.
It regenerates the textures, editable scene, validation report and three PNG
renders. Append `-- --quick` for a smaller overview proof, or `-- --no-render`
to save the assets without rendering. Regeneration replaces edits to this
generated Blender file, so save manual variations under a different filename.
