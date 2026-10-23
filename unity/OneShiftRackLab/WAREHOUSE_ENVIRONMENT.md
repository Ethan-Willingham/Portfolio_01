# Warehouse walls, roof and daylight

The Unity room has a 23 by 22 metre footprint and an enclosed roof at 8.3 metres.
Painted concrete block walls rise to 3.2 metres, with ribbed metal cladding above.
The shell includes steel columns and guards, six open-web roof trusses, roof
decking and purlins, suspended high-bay fixtures, sprinkler pipes, a cable tray,
a closed loading shutter and a service door. The existing concrete floor and
rack objects are separate from the architecture.

Sixteen high windows have four columns and two rows of panes, deep sills,
metal frames and rubber beading. They are actual openings in the wall geometry.
The directional sun passes through the glass and casts the frame grid onto
the floor, stock and masonry. Cool ambient and fixture light keep the shaded
interior readable beside the warm sun patches.

## Source and installation

Choose **One Shift > Install warehouse walls and daylight** in the open
`RackFloor.unity` scene, outside Play mode. The targeted installer saves a
timestamped copy in `Temp/EnvironmentBackup`, replaces the architecture and
old placeholder walls, and retains the floor, racks and player. It saves the
scene after validation. The full **Build rack floor** command also installs
the shell before saving.

- `Assets/RackLab/Editor/WarehouseEnvironmentBuilder.cs` constructs the shell,
  materials, collision, window volumes and sparse dust systems.
- `Assets/RackLab/Scripts/WarehouseSunVolume.cs` binds each affine volume and
  moves its dust motes in Play mode. Simulation stops while the app is unfocused.
- `Assets/RackLab/Shaders/WarehouseMasonry.shader` renders real-scale running
  bond, shallow mortar recesses and fine concrete pores in world coordinates.
- `Assets/RackLab/Shaders/WarehouseSunShaft.shader` integrates scattering through
  each rectangular window extrusion, with soft edges and mild density variation.
- Generated meshes, materials and the small dust sprite live in the respective
  `Models/Environment`, `Materials/Environment` and `Textures/Environment` folders.

Geometry is combined by material, keeping thousands of small structural details
out of the draw-call count. The installation uses no downloaded assets.

## Light shafts

All sixteen windows have sheared volumes aligned to the moving directional sun.
Only the windows facing the incoming daylight render a shaft. The scene starts
before dawn, with no shafts. See [warehouse lighting](WAREHOUSE_LIGHTING.md).
Each volume uses sixteen ray samples. Camera depth clips the rays against
opaque surfaces, including the floor and stock. Main-light shadow samples
darken scattering where racks interrupt the sunlight. Soft pane-grid masks
and a gradual end fade prevent the beams from looking like solid cones.
These are bounded scattering volumes, not a full atmospheric simulation.

The URP pipeline needs camera depth, main-light shadows and the supplied shader.
The installer enables depth and uses four cascades with a 4096-pixel main-light
shadow atlas over 45 metres. Each active window holds 72 tiny drifting dust motes.
Subtle screen-space contact shading defines the roof ribs and structural joints.
Individual particles use a soft radial sprite and remain inside their window
volume. Mesh bounds, shader coordinates and particle positions follow the same
sun direction. Some samples below the floor are hidden by depth testing.

## Verification

`WarehouseEnvironmentBuilder.Validate()` checks the window and beam counts,
shader compiler diagnostics, perimeter collision, clear window openings and
the enclosed ceiling. It also runs the existing floor and rack regressions.
The result is saved in `Assets/RackLab/Reports/warehouse-environment-validation.txt`.
Inspect the saved in-engine screenshots from the entrance, toward the west
windows and upward at the roof. Play checks cover floor support and rack
collision as well as dust population and movement.

The architecture and effects are intended for this warehouse room. Profile
the window raymarch and shadow sampling before extending them to a larger
warehouse with many visible volumes.
