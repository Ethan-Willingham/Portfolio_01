# Warehouse forklift

The classic yellow LPG counterbalance forklift is an art asset for One Shift.
It was rebuilt from a fresh scene at the owner's request. The longer body has
a rounded cast counterweight, black engine bonnet, horizontal aluminium propane
bottle, large front tyres, smaller rear tyres and ivory dished wheels. The open
cab has a black slatted overhead guard, a single vinyl seat, analogue dials,
manual lift levers, pedals and a steering spinner. The mast has channel rails,
twin rams, chains, a load backrest and continuous forged L-section forks.
It has no manufacturer branding or assigned load rating. Fleet number 04 is
fictional. Sparse paint chips and polished fork wear are geometry in the export.

Conventional gas counterbalance trucks informed the silhouette, including the
[Cat LPG range](https://www.catlifttruck.com/products/counterbalance-forklift-trucks/lp-gas-powered-forklift-trucks).
The mesh is original and is not a replica of a manufacturer's model.

## Files

- Native editable source: `../../assets/one-shift/models/warehouse-forklift.blend`.
- Front, rear and side studio views sit beside that source as
  `warehouse-forklift-preview.png`, `warehouse-forklift-rear.png` and
  `warehouse-forklift-side.png`.
- Unity export: `Assets/RackLab/Models/warehouse-forklift.fbx`.
- Geometry measurements: `Assets/RackLab/Models/warehouse-forklift-report.json`.
- Generator: `../../tools/blender/build-warehouse-forklift.py`.

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
four wheel pivots and `SteeringWheel_Pivot` retain separate transforms.
`OperatorEye`, `OperatorSeat`, `ForkTips` and `LoadCentre` are placement anchors.
The model depicts the lowered position. A lifting implementation still needs
staged mast movement, chain and hose animation, limits and collision checks.

This delivery does not place a drivable forklift in the warehouse or change the
published browser player. Physics, compound colliders, LODs, driving, training
and pallet attachment remain separate work. Material colors in the Blender
studio are the appearance reference. Procedural microtexture in the Blender
materials is not baked into FBX; solid base colors and material assignments are
exported. Unity uses URP materials when integrated.
