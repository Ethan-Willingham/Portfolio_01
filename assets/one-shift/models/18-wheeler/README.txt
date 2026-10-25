18 WHEELER
Original generic American long-nose tractor and 53-foot dry van

REPOSITORY SOURCE SNAPSHOT (25 October 2026)
This folder preserves the editable Blender source, generator, verification script,
dimensions and original delivery notes below. The production FBX is tracked at
unity/OneShiftRackLab/Assets/RackLab/Models/18-wheeler.fbx from the repository root.
The GLB and studio PNGs remain in the untouched original Desktop/18 Wheeler folder.
See unity/OneShiftRackLab/RECEIVING_TRUCK.md for the current physical integration.
The original delivery's file list and Unity-later notes below describe its state
on 23 October. The receiving scene now supplies collision, opening and wheel motion.

FILES
18-wheeler.blend: editable Blender 4.0 project, with organized asset and studio collections.
18-wheeler.fbx: Unity-oriented model export. Contains the vehicle hierarchy only.
18-wheeler.glb: portable model with embedded PBR materials.
preview-*.png: rendered views, including open, closed and fully folded rear doors.
build_truck.py: reproducible Blender Python source.
verify_model.py and validation.json: geometry, pivot, clearance and FBX round-trip checks.
model-stats.json: dimensions, mesh counts and wheel positions.

MODEL
66,356 triangles, 41,146 mesh vertices, 27 mesh objects.
18 individually named wheels: 2 steer tires, 8 tractor drive tires, 8 trailer tires.
Two independently hinged rear swing doors with lock rods and hinge straps.
Full cargo interior, plank floor, wall liners, logistics posts and roof bows.
Separate tractor and trailer hierarchy, with the trailer origin at its kingpin.
Modeled chassis, suspension, fuel tanks, entry steps, mirrors, grille, exhaust,
air cleaners, lamps, raised landing gear and rear impact guard.
All meshes have UV coordinates and applied object scale. Geometry is triangulated.
Solid-color PBR materials need no external textures. Windows are opaque tinted glass.
The cab exterior is modeled; there is no detailed cab interior or engine bay.
The design is generic, not a manufacturer-certified replica.

REAL-WORLD SCALE
One Blender unit = one meter.
Trailer box length: 16.1544 m (53 ft).
Trailer box width: 2.5908 m (102 in), excluding hinge/lamp projections.
Trailer roof height above road: 4.1148 m (13 ft 6 in).
Tire radius: 0.505 m. Tires are centered at z = 0.505 m, resting on the ground.
Tractor front axle y = -5.63 m; drive axles y = 0.30 and 1.65 m.
Trailer axles y = 12.60 and 13.8446 m (49-inch tandem spacing).
The landing gear is in a raised transport position.

MOVABLE PARTS IN BLENDER
Truck_Root: move the whole vehicle.
Tractor_Root: tractor assembly.
Trailer_Coupling: rotate local Z to articulate at the kingpin.
Steer_Tractor_Steer_L and Steer_Tractor_Steer_R: rotate local Z to steer.
Wheel_*: rotate local X to spin; origins are centered on the axles.
Rear_Door_L: rotate local Z positively to open.
Rear_Door_R: rotate local Z negatively to open.
Door angles: 0 closed, 110 open for cargo access, 270 folded against the side.
All door hardware moves with its door; stationary hinge barrels stay on the frame.
Door shell clearance was checked at 0, 15, 30, 60, 90, 110, 180, 240, 255 and 270 degrees.
The file and exports are saved with the doors closed and wheels straight.
No scripted drivers or animation clips are required to pose these parts.

UNITY LATER
Import 18-wheeler.fbx. Keep Scale Factor at 1, enable Convert Units, and use
Bake Axis Conversion to bake the coordinate conversion into the imported asset.
The FBX axis convention is -Z forward / Y up; the original Blender model faces -Y.
Retain the movable hierarchy instead of combining all meshes into one.
Assign or extract materials for your chosen Unity render pipeline. The GLB offers
an alternative with PBR properties when using a compatible glTF importer.
WheelColliders, Rigidbody components, collision shapes, door controls and a driving
controller are intentionally left for the later Unity implementation.
This delivery has been checked in Blender and by reimporting the FBX into Blender,
not by running a Unity vehicle simulation.

REFERENCE NOTES
Trailer proportions and construction informed by Great Dane commercial dry vans:
https://buygreatdane.com/trailer/great-dane-dry-van-champion-cp-champion-se-2015-2/
https://greatdane.com/wp-content/uploads/2020/10/Champion_Brochure_Digital.pdf
Unity model import settings:
https://docs.unity.com/en-us/engine/6000.5/manual/assets-and-media/asset-types/models/importing/fbximporter-model

The studio collection, ground, cameras and lights are excluded from both exports.
The original delivery was created separately on the Desktop. The warehouse now
uses a tracked copy of its FBX and these source files; the Desktop files are unchanged.
