# One Shift: rack floor

A standalone Unity 6.3 URP prototype for inspecting a warehouse pallet rack at
human scale. This is the first 3D asset trial for One Shift. It does not read or
write the browser game's saves.

Open `Assets/RackLab/Scenes/RackFloor.unity` and press Play, or launch the local
build at `Builds/Windows/OneShiftRackLab.exe`. Click the Game view
to capture the mouse. WASD walks, the mouse looks, Shift runs, Space jumps,
Escape releases the mouse and R returns to the entrance. Aim at a rack within
five metres and press E to cycle its finish.

The scene places Clean, Used and Worn racks next to one another. The wear is
cosmetic: faded coating, chipped edges, exposed steel, rust and contact scratches.
The three materials share the same model, a 512-pixel noise texture and a
256 by 64-pixel location sticker. They do
not represent a rack's structural safety or load rating.

## Rack asset

The rack has roll-formed uprights with teardrop slots, braced end frames,
orange step beams and connectors, retaining pins, waterfall wire decks,
base plates, anchors and separate yellow upright guards.

| Asset | Triangles | Renderers at an active LOD | Materials |
| --- | ---: | ---: | ---: |
| Original detailed Blender export | 226,708 | 306 | 10 |
| Game LOD0 | 10,632 | 1 | 1 |
| Game LOD1 | 1,980 | 1 | 1 |
| Game LOD2 | 724 | 1 | 1 |

LOD0 removes 95.3% of the original triangles. The upright slots are alpha
cutouts; the close wire decking is geometry, replaced by cutout planes in
the two distant LODs. Seven box colliders per rack cover the frames, shelves
and guards. The model contains no mesh colliders.

Vertex colors store the finish colors, including a finish classification in
alpha. UV0 and UV1 carry face coordinates, dimensions and cutout identifiers.
Use the supplied `OneShift/Rack Steel` shader and preserve these attributes.
The three prefabs are under `Assets/RackLab/Prefabs`.

These are asset budgets, not an FPS guarantee for a full warehouse. The room
uses realtime lights and shadows for this inspection scene. Profile a dense
aisle on the target hardware before fixing production lighting and LOD ranges.

## Rebuild

From the repository root, use Blender's background Python runner with
`tools/blender/build-warehouse-rack-game.py`. It reads the detailed source at
`assets/one-shift/models/warehouse-rack.blend`, writes the shared FBX and noise
texture into this project, and saves `warehouse-rack-game.blend` beside the
original. The game Blender file carries the meshes and attributes; Unity supplies
the finished appearance.

`tools/blender/build-rack-font.py` reconstructs the project's existing Segoe UI
font from its WOFF into the TTF format Unity imports. No font download is needed.
It also bakes the small location-sticker texture with Pillow.

In Unity, choose **One Shift > Build rack floor** to regenerate the room,
materials, prefabs and validation report. This replaces the trial scene, so
save any manual scene changes under a different name first.

Choose **One Shift > Build Windows player** to rebuild the standalone version.
The Editor builder validates the mesh bounds, LODs, colliders, materials and
shader. `RackLabBuilder.CheckPlayMode()` checks floor support, clear movement,
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
