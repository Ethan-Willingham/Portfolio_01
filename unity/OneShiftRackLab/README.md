# One Shift: rack floor

A standalone Unity 6.3 URP prototype for inspecting a warehouse pallet rack at
human scale. This is a 3D asset trial for One Shift. It does not read or
write the browser game's saves.

Open `Assets/RackLab/Scenes/RackFloor.unity` and press Play, or launch the local
build at `Builds/Windows/OneShiftRackLab.exe`. Click the Game view
to capture the mouse. WASD walks, the mouse looks, Shift runs, Space jumps,
Escape releases the mouse and R returns to the entrance. Aim at a rack within
five metres and press E to cycle its finish.

In the Game view's resolution menu, leave **Low Resolution Aspect Ratios** off
and keep the zoom at 1x for a sharp preview. The camera renders at full resolution
with 4x MSAA and high-quality SMAA to smooth fine rack details.

One Unity unit is one metre. The player is 1.78 m tall (about 5 feet 10 inches),
with eyes 1.65 m above the feet, beside 4.88 m (16-foot) upright frames. The view keeps a
90-degree horizontal field of view on wide windows, with vertical field of view
capped at 65 degrees on taller windows. Walking is 1.5 m/s and running is 4.2 m/s.

The original green racks remain in the room along the right side, in clean,
used and worn finishes. The new blue and orange rack is a connected three-bay
run: four braced upright frames support three pairs of beam levels. Adjacent
bays share one frame, without overlapping posts. Its finish can be cycled with E.

The four owner-created Blender pallets are imported at their actual size, with
original board geometry, splits, splinters, nails, UVs and PBR maps. Empty examples
of fresh pine, working wear, split and battered, and repaired pallets are laid out
on the left. Fresh, used and repaired variants also occupy the rack. The damaged
sample stays empty. The source file in `assets/one-shift/models/pallets` is unchanged.

## Rack and pallet dimensions

Each bay stores two pallets on the concrete floor and two on each of two raised
levels. Beam tops are at 1.8288 and 3.6576 m. The frame is 4.8768 m tall.
The clear span is 2.44 m and adjacent frame centres are 2.53 m apart.
Each pallet is 1.016 m wide and 1.2192 m deep (40 by 48 inches), with a nominal
0.12065 m board stack. Small chips, warped boards and splinters affect the height
by a few millimetres. These pallets are rectangular, not half pallets.

The 40-inch side faces the aisle. Two pallets fit across a bay with about
136 mm between them and between each outside edge and the upright. Pallets extend
about 75 mm beyond the front and rear of the approximately 42-inch-deep frame.
The full pallet footprint is preserved; it has not been stretched or shrunk to fit.
Example carton loads reach about 1.529 m including the pallet. The lower levels
allow a 100 mm lift clear of the deck without hitting the beam overhead.

The rack proportions follow the [Interlake Mecalux selection guide](https://static.globalindustrial.com/products/pdf/4904-interlake-mecalux-inc/347129.pdf)
and [Uline's selective rack component layout](https://www.uline.com/Product/Detail/H-5715/Pallet-Racks/Pallet-Rack-Starter-Unit-96-x-42-x-96).
The load height and room layout are choices for this game scene. The rack has
roll-formed uprights, teardrop slots, braced frames, step beams, connectors using
separate upright columns at shared connections, retaining pins, wire decks,
base plates, anchors and yellow upright guards. Wear is cosmetic, without an
assigned structural grade or load rating.

## Game assets

| Asset | LOD0 triangles | LOD1 | LOD2 |
| --- | ---: | ---: | ---: |
| Shared upright frame | 1,488 | 408 | 212 |
| Bay beams and decks | 5,104 | 760 | 184 |
| Fresh pine pallet | 11,700 | 468 | 468 |
| Working wear pallet | 12,124 | 856 | 536 |
| Split and battered pallet | 12,372 | 1,528 | 648 |
| Repaired pallet | 12,288 | 1,188 | 616 |
| Carton load | 1,226 | 122 | 86 |

The original green rack retains its existing three LODs. Each new steel module
uses one renderer and material at an active LOD. Each pallet uses one renderer,
with wood and nail materials nearby and only wood at distance. Detailed nail
geometry and bevels disappear at the first LOD transition; distant boards keep
their original UVs. The four 2048-pixel material sets have mipmaps and texture
compression. Metallic/smoothness maps pack zero metal into RGB and inverted
source roughness into alpha for URP/Lit. Normal maps are imported as normal maps.

All collision uses compound boxes. Pallet board colliders preserve front fork
pockets and rounded side-notch shoulders. Fork-entry transforms are included.
The connected row has 18 named placement anchors, with 14 occupied slots: 12
loaded pallets and two empty pallets. Driving, mast controls and lifting gameplay
are not implemented in this asset trial.

`Assets/RackLab/Prefabs` contains four `Pallet_` variants, `CartonLoad`,
`PalletRackUpright`, `PalletRackBay`, and `ConnectedPalletRackRow`. The existing
`RackClean`, `RackUsed` and `RackWorn` prefabs are restored to the original green
rack model. The older `StandardLoadedPallet` placeholder is retained as an unused
prototype asset; the playable scene uses the owner's four detailed pallets.

Rack vertex colors store finish colors and classification. UV0 and UV1 carry
face coordinates, dimensions and cutout identifiers. Preserve these attributes
and use `OneShift/Rack Steel`. The pallet wood uses ordinary URP/Lit.

These are asset budgets, not an FPS guarantee for a full warehouse. Profile a
dense aisle on target hardware before fixing production lighting and LOD ranges.

## Rebuild

From the repository root, use Blender's background Python runner with
`tools/blender/build-forklift-rack.py`. It reuses construction details from
`assets/one-shift/models/warehouse-rack.blend`, generates the shared frame and two
beam levels, and writes modular rack and separate carton-load FBX assets.
The editable native file is `assets/one-shift/models/forklift-pallet-rack.blend`.
`tools/blender/rack_mesh.py` packs the mesh attributes and verifies vertex colors
after allocating all UV layers. The original rack study and its generator remain
available. Its `build-warehouse-rack-game.py` also generates the shared wear noise.

Run `tools/blender/export-warehouse-pallets.py` with Blender 5.2 to export the
four existing pallet collections to `owner-pallets-lods.fbx`. This reads the
source file without saving it. Then run `tools/blender/pack-pallet-materials.py`
with Python and Pillow to pack the source roughness maps for Unity.

`tools/blender/build-rack-font.py` reconstructs the project's existing Segoe UI
font from its WOFF into the TTF format Unity imports. No font download is needed.
It also bakes the small location-sticker texture with Pillow.
`tools/blender/build-pallet-label.py` creates the fictional cargo label with that font.

In Unity, choose **One Shift > Build rack floor** to regenerate the room,
materials, prefabs and validation report. This replaces the trial scene, so
save any manual scene changes under a different name first.

Choose **One Shift > Build Windows player** to rebuild the standalone version.
The Editor builder validates the mesh bounds, LODs, colliders, materials,
shader, original rack preservation, four shared frames, all four pallet finishes,
six pallet positions per bay, front and side fork passage and a 100 mm
lift of every loaded pallet. `RackLabBuilder.CheckPlayMode()` checks floor support, clear movement,
rack collision and finish switching while playing. Reports and a verified
scene capture are under `Assets/RackLab/Reports`.

The project includes the official Unity Pipeline package. Use the standalone
Unity CLI and always pass this project's full path when controlling an Editor:

```powershell
unity open "<repo>/unity/OneShiftRackLab"
unity status --until-ready --project-path "<repo>/unity/OneShiftRackLab"
unity command --project-path "<repo>/unity/OneShiftRackLab"
```

Unity generates the imported cache, build output and user settings locally;
these are excluded from Git. Source assets and their `.meta` files are tracked.
