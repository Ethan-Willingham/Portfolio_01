# Warehouse forklift

The classic yellow LPG counterbalance forklift is an art asset for One Shift.
It was rebuilt from a fresh scene at the owner's request. The longer body has
a rounded cast counterweight, black engine bonnet, horizontal aluminium propane
bottle, large front tyres, smaller rear tyres and ivory dished wheels. The rear
has rounded shoulders, a recessed five-louvre grille, a small maker plaque,
inset tail lamps and a split bumper around a recessed tow pin. Rear wheel arches
are cut through the counterweight, engine housing and chassis. The open
cab has a black slatted overhead guard, a single vinyl seat, analogue dials,
manual lift levers, pedals and a steering spinner. The mast has channel rails,
twin rams, articulated leaf chains, a load backrest and continuous forged
L-section forks. The parking brake now mounts on the footwell beside the seat,
clear of the bonnet. Hydraulic levers and pedals have independent pivots.
It has no manufacturer branding or assigned load rating. Fleet number 04 is
fictional. Sparse paint chips and polished fork wear are geometry in the export.

Conventional gas counterbalance trucks informed the silhouette, including the
[Cat LPG range](https://www.catlifttruck.com/products/counterbalance-forklift-trucks/lp-gas-powered-forklift-trucks).
The mesh is original and is not a replica of a manufacturer's model.

## Files

- Native editable source: `../../assets/one-shift/models/warehouse-forklift.blend`.
- Front, rear, side and chain studio views sit beside that source as
  `warehouse-forklift-preview.png`, `warehouse-forklift-rear.png` and
  `warehouse-forklift-side.png`, plus `warehouse-forklift-chain.png`.
- Unity export: `Assets/RackLab/Models/warehouse-forklift.fbx`.
- Geometry measurements: `Assets/RackLab/Models/warehouse-forklift-report.json`.
- Generator: `../../tools/blender/build-warehouse-forklift.py`.
- Mast and leaf-chain builder: `../../tools/blender/forklift-mast.py`.
- Clearance check: `../../tools/blender/check-forklift-clearance.py`.

The orange study and comparison scene are retired. The native yellow file opens
with its rear framed in a colored viewport. Studio helpers are hidden from the
viewport so they do not spoil framing. Numpad 0 restores the rear inspection
camera after orbiting. Middle mouse drag orbits, and the wheel zooms.

Run the generator using Blender 5.2's background Python runner. The native file
keeps named editable parts, bevel modifiers, curve hoses and text. The FBX bakes
those into meshes, includes UVs and material assignments, and excludes the studio
floor, camera and lights. One Blender unit is one metre. Blender uses +Y forward
and +Z up; the FBX exports with Y up for Unity.

## Parts and scale

The forks have 1.06 m blades, 100 mm width and a 43 mm heel tapering to 12 mm.
Their centre spacing is 550 mm. The blade undersides begin 77 mm above the floor.
They are sized for the warehouse's existing 40 by 48 inch pallets. The overhead
guard is approximately 2.20 m tall, excluding the amber beacon. Wheelbase is
1.71 m. These are game
model dimensions, not a real equipment specification.

`MastTilt_Pivot`, `InnerMast_Lift`, `ForkCarriage_Lift`, `Fork_Left`, `Fork_Right`,
four wheel spin pivots and `SteeringWheel_Pivot` retain separate transforms.
The rear wheels also have separate `RearSteer_L_Pivot` and `RearSteer_R_Pivot`
parents, beneath `RearAxle_Oscillation`. Wheel spin uses Blender local X, rear
steering uses local Z, and axle oscillation uses local Y. The checked authoring
range is 35 degrees of steering either way and 3 degrees of axle oscillation.
The steering tie rod has its own transform and endpoint anchors. A runtime
steering implementation must solve that linkage and choose its steering law.
`OperatorEye`, `OperatorSeat`, `ForkTips` and `LoadCentre` are placement anchors.
The parking brake, three hydraulic levers, three pedals and fork spacing locks
also retain individual pivots.

## Lift mechanism

Each chain uses interlaced three-plate and four-plate links with shared transverse
pins. There are no rollers or sprocket teeth. Plate proportions use the
[Tsubaki leaf-chain catalogue](https://tsubaki.eu/assets/CAT_1_herdruk_compleet.pdf)
as a reference: 19.05 mm pitch, 3.2 mm plates and 18.1 mm plate height.
The fixed outer-mast anchor, moving inner-stage sheave and carriage anchor
follow the conventional routing illustrated in the
[Cascade mast service manual](https://www.cascorp.com/web2/downloads.nsf/0/E19010C6120F5ED288257B3C00152853/%24FILE/33H-UKC-SEL-83241%20.pdf).
The chain geometry and truck are original art, without a rated lifting capacity.

The native file depicts the lowered position. The builder's `pose()` solver
checks the inner stage over 0 to 0.9 m, with carriage travel twice that distance,
and mast tilt from -6 to 8 degrees. Each rigid chain link has its own transform;
the solver keeps both pin pitch and attachment endpoints fixed, with a minute
radial correction around the sheave to accommodate polygonal chain motion.
Measured errors and clearances are in the JSON report. Both return runs, smooth
flanged sheaves, retained anchor pins, adjusters and mounting tabs are modeled.
Sheaves and piston rods travel with the inner stage. Tilt-cylinder barrels aim
at their moving mast anchors and their rods remain separate. Hose ports are
named for later flexible hose routing.

This short duplex lift is an animation study, not the warehouse's final lift
specification. Its 1.8 m carriage travel does not reach the 3.6576 m rack level.
Choose and model the required longer or additional mast stage before implementing
that interaction. Export preserves authoring transforms without animation clips
or Blender constraints. The Python pose solver is not a Unity runtime controller.

Run Blender with `--background --python-exit-code 1 --python` followed by the
generator path. Add `-- --no-render` for geometry and export only, or `-- --quick`
for draft views. The clearance checker opens the saved native file and tests
rear wheel assemblies against chassis geometry at combined steering and axle
poses, then tests parking brake travel against the engine cover. Its detailed
result is written to ignored `research/forklift/clearance.json`.

The 24 October 2026 export passed 15 combined rear steering/axle poses and three
parking brake poses with no detected clipping. The generator checked 15
lift/tilt combinations. A Unity preview-scene import retained all 22 checked
part and placement transforms and all 350 individual chain links. Imported
dimensions were 1.4100 by 2.3515 by 3.9715 m (width, height, length); maximum
imported pin-pitch error was below 0.001 mm. The warehouse scene was not modified.

This delivery does not place a drivable forklift in the warehouse or change the
published browser player. Physics, compound colliders, LODs, driving, training
flexible hose animation and pallet attachment remain separate work. The
individual chain links preserve editability; combine them into skinned chains
or another efficient runtime rig before shipping the browser game.
Material colors in the Blender
studio are the appearance reference. Procedural microtexture in the Blender
materials is not baked into FBX; solid base colors and material assignments are
exported. Unity uses URP materials when integrated.
