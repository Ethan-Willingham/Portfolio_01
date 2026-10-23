# Warehouse concrete floor

The floor is a 23 by 22 metre poured-concrete surface, with its top at Unity Y=0.
It has a sealed, power-trowelled finish, shallow saw-cut joints, worn yellow
pedestrian lanes and bay outlines, tire scuffs, a few fluid stains, hairline
cracks and two flush repairs. Bay numbers and a keep-clear hatch are baked into
the surface. The room's racks, lighting and controls remain separate objects.

## Source and rebuild

- Editable Blender source: `../../assets/one-shift/models/warehouse-floor.blend`.
  All four texture maps are packed into the file. The inspection camera and
  lighting are saved in Blender but excluded from the game export.
- Deterministic Blender generator: `../../tools/blender/build-warehouse-floor.py`.
  Run with Blender 4.0's `--background --python` options from the repository root.
  It generates the mesh, textures, native file, preview and asset budget report.
  It uses Blender's bundled numpy, with no downloaded assets or add-ons.
- Unity mesh: `Assets/RackLab/Models/warehouse-floor.fbx`.
- Material: `Assets/RackLab/Materials/WarehouseConcrete.mat`, using URP/Lit.
- Reusable prefab: `Assets/RackLab/Prefabs/WarehouseFloor.prefab`.
- Texture maps: `Assets/RackLab/Textures/WarehouseFloor/`.

Choose **One Shift > Install concrete floor** to update only the floor in the
open `RackFloor.unity` scene. The installer preserves the other scene objects,
saves a local scene snapshot to `Temp/FloorBackup`, and replaces the old concrete,
raised joint strips, original walkway lines and original bay-number text.
The normal **Build rack floor** command also installs this surface before saving.
Rebuild the Windows player after changing source assets.

## Rendering and physics

The complete room surface uses 650 triangles, one renderer and one material.
Thirty-six sections have 8 mm cuts, recessed 6 mm, and 2.5 mm edge bevels.
One continuous box collider covers the room: the cosmetic joints cannot catch
the character or a wheel. The mesh does not need runtime CPU readability.

The 4096-pixel albedo covers the room once, so scuffs and repairs do not repeat.
The 2048-pixel normal and metallic/smoothness maps share that layout. Concrete
is nonmetallic; smoothness is stored in the mask's alpha channel. A separate
1024-pixel normal repeats every 1.5 metres for fine surface grain. Unity imports
the albedo as sRGB, the mask as linear data, and both normals as normal maps.
Mipmaps, trilinear filtering and 16x anisotropy keep the surface stable at low
viewing angles. No floor shader or per-frame floor script is required.

## Verification

`WarehouseFloorBuilder.Validate()` checks dimensions, orientation bounds, mesh
budget, material maps, shader errors and 49 collider samples at cuts and edges.
`WarehouseFloorBuilder.CheckWalk()` runs in Play mode and moves the real character
15 metres across five joints, checking ground contact at every step and restoring
the original position afterward. Results are written to the two
`warehouse-floor-*-validation.txt` files in `Assets/RackLab/Reports`.

Inspect the floor at standing height in Unity after rebuilding, including the
bay numbers, paint edges and grazing-angle normals. The Blender-to-FBX basis
changes handedness; the generator reverses X and polygon winding so the numbers
read correctly in Unity. The screenshot in `Reports/warehouse-floor-game.png`
records the verified in-engine appearance.
