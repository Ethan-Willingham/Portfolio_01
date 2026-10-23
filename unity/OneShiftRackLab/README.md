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

The scene places an empty clean rack, a used rack with four loaded pallets, and a
worn rack with all six locations occupied next to one another. The wear is
cosmetic: faded coating, chipped edges, exposed steel, rust and contact scratches.
The three materials share the same model, a 512-pixel noise texture and a
256 by 64-pixel location sticker. They do
not represent a rack's structural safety or load rating.

## Rack asset

Each bay stores two pallets on the concrete floor and two on each of two raised
levels. The beam tops are at 1.83 m and 3.66 m. There is no third elevated shelf.
The 96-inch clear span and approximately 42-inch frame depth fit two standard
48-inch-deep by 40-inch-wide pallets. Each example load is 1.55 m tall including
its wooden pallet, leaving approximately 135 to 145 mm of overhead clearance at
the lower levels. The top load reaches approximately 5.22 m in the 6 m room.
The painted aisle leaves 3.81 m in front of the guards.

These proportions follow the [Interlake Mecalux selection guide](https://static.globalindustrial.com/products/pdf/4904-interlake-mecalux-inc/347129.pdf)
and [Uline's selective rack component layout](https://www.uline.com/Product/Detail/H-5715/Pallet-Racks/Pallet-Rack-Starter-Unit-96-x-42-x-96).
The load height and aisle width are choices for this game scene.

The rack has roll-formed uprights with teardrop slots, braced end frames,
orange step beams and connectors, retaining pins, waterfall wire decks,
base plates, anchors and separate yellow upright guards.

| Asset | Triangles | Renderers at an active LOD | Materials |
| --- | ---: | ---: | ---: |
| Rack LOD0 | 8,864 | 1 | 1 |
| Rack LOD1 | 1,720 | 1 | 1 |
| Rack LOD2 | 608 | 1 | 1 |
| Loaded pallet LOD0 | 1,994 | 1 | 1 |
| Loaded pallet LOD1 | 386 | 1 | 1 |
| Loaded pallet LOD2 | 170 | 1 | 1 |

The upright slots are alpha
cutouts; the close wire decking is geometry, replaced by cutout planes in
the two distant LODs. Ten box colliders per rack cover the frames, beams, decks
and guards. The model contains no mesh colliders. Six named pallet-position
transforms provide placement anchors. The loaded pallet prefab has compound
board and cargo colliders with open front pockets and notched side entries,
plus named fork-entry transforms. The example loads are static; driving a
forklift, mast controls and pallet handling are not implemented in this trial.

Vertex colors store the finish colors, including a finish classification in
alpha. UV0 and UV1 carry face coordinates, dimensions and cutout identifiers.
Use the supplied `OneShift/Rack Steel` shader and preserve these attributes.
The three rack prefabs and `StandardLoadedPallet.prefab` are under
`Assets/RackLab/Prefabs`. The pallet material uses the same shader's organic
surface mode for wood grain, dry cardboard, packing tape and a stock label.

These are asset budgets, not an FPS guarantee for a full warehouse. The room
uses realtime lights and shadows for this inspection scene. Profile a dense
aisle on the target hardware before fixing production lighting and LOD ranges.

## Rebuild

From the repository root, use Blender's background Python runner with
`tools/blender/build-forklift-rack.py`. It reuses construction details from
`assets/one-shift/models/warehouse-rack.blend`, generates the new frame and two
beam levels, and writes the rack and loaded-pallet FBX assets into this project.
The editable native file is `assets/one-shift/models/forklift-pallet-rack.blend`.
`tools/blender/rack_mesh.py` packs the mesh attributes and verifies vertex colors
after allocating all UV layers. The original rack study and its generator remain
available. Its `build-warehouse-rack-game.py` also generates the shared wear noise.

`tools/blender/build-rack-font.py` reconstructs the project's existing Segoe UI
font from its WOFF into the TTF format Unity imports. No font download is needed.
It also bakes the small location-sticker texture with Pillow.
`tools/blender/build-pallet-label.py` creates the fictional cargo label with that font.

In Unity, choose **One Shift > Build rack floor** to regenerate the room,
materials, prefabs and validation report. This replaces the trial scene, so
save any manual scene changes under a different name first.

Choose **One Shift > Build Windows player** to rebuild the standalone version.
The Editor builder validates the mesh bounds, LODs, colliders, materials,
shader, six pallet positions per bay, front and side fork passage and a 100 mm
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
