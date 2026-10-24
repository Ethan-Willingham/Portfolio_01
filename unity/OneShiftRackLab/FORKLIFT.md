# Warehouse forklift

The original compact electric counterbalance forklift is an art asset for
One Shift. It has four solid tyres, an orange battery chassis and counterweight,
an open overhead guard, operator controls, duplex mast and tapered steel forks.
It has no manufacturer branding or assigned load rating.

## Files

- Native editable source: `../../assets/one-shift/models/warehouse-forklift.blend`.
- Front and rear studio views sit beside that source as
  `warehouse-forklift-preview.png` and `warehouse-forklift-rear.png`.
- Unity export: `Assets/RackLab/Models/warehouse-forklift.fbx`.
- Geometry measurements: `Assets/RackLab/Models/warehouse-forklift-report.json`.
- Generator: `../../tools/blender/build-warehouse-forklift.py`.

Run the generator using Blender 5.2's background Python runner. The native file
keeps named editable parts, bevel modifiers, curve hoses and text. The FBX bakes
those into meshes, includes UVs and material assignments, and excludes the studio
floor, camera and lights. One Blender unit is one metre. Blender uses +Y forward
and +Z up; the FBX exports with Y up for Unity.

## Parts and scale

The forks have 1.07 m blades, 100 mm width and a 40 mm heel tapering to 12 mm.
Their centre spacing is 550 mm. The blade undersides begin 100 mm above the floor.
They are sized for the warehouse's existing 40 by 48 inch pallets. The overhead
guard is approximately 2.18 m tall, excluding the amber beacon. These are game
model dimensions, not a real equipment specification.

`MastTilt_Pivot`, `InnerMast_Lift`, `ForkCarriage_Lift`, `Fork_Left`, `Fork_Right`,
four wheel pivots and `SteeringWheel_Pivot` retain separate transforms.
`OperatorEye`, `OperatorSeat`, `ForkTips` and `LoadCentre` are placement anchors.
The model depicts the lowered position. A lifting implementation still needs
staged mast movement, chain and hose animation, limits and collision checks.

This delivery does not place a drivable forklift in the warehouse or change the
published browser player. Physics, compound colliders, LODs, driving, training
and pallet attachment remain separate work. Material colors in the Blender
studio are the appearance reference; Unity uses URP materials when integrated.
