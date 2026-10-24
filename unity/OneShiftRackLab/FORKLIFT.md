# Warehouse forklift

The classic yellow LPG counterbalance forklift is drivable in One Shift.
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
range is 60 degrees of steering either way and 3 degrees of axle oscillation.
The steering tie rod has its own transform and endpoint anchors. The runtime
uses Ackermann rear steering; the tie rod remains an authoring part awaiting
its own linkage animation.
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

The 24 October 2026 export passed 81 combined rear steering/axle/suspension poses and three
parking brake poses with no detected clipping. The generator checked 15
lift/tilt combinations. A Unity preview-scene import retained all 22 checked
part and placement transforms and all 350 individual chain links. Imported
dimensions were 1.4100 by 2.3515 by 3.9715 m (width, height, length); maximum
imported pin-pitch error was below 0.001 mm. The extended clearance check uses
`-- --steering-limit 60 --suspension-travel .055` and covers both steering
directions, three axle poses and three hub positions across the suspension travel.

Material colors in the Blender
studio are the appearance reference. Procedural microtexture in the Blender
materials is not baked into FBX; solid base colors and material assignments are
exported. Unity uses URP materials when integrated.

## Driving

`ForkliftBuilder.InstallDriver()` installs the derived
`Assets/RackLab/Prefabs/WarehouseForklift.prefab` and practice area in the existing
warehouse without rebuilding its racks or lighting. It backs up the scene under
ignored `Temp/ForkliftBackup`. Re-run this installer after regenerating the room.
The prefab has URP materials and batches rigid geometry by moving assembly and
material. The lowered leaf chains become two render groups. The source FBX
retains every individual link, and the runtime retains their transform anchors.

`ForkliftDriveController` applies wheel torque and tyre braking to a 3,500 kg
main rigidbody and a 120 kg rear axle joined by a physical hinge. Its three-degree
oscillation ends at mechanical stops. Four WheelColliders represent solid tyres
with short compliance. The main centre of mass is 0.72 m above the model origin,
0.18 m behind it. These are game tuning values for this original truck.
Gravity, contact forces and mass distribution determine tipping. Roll and pitch
are free; driving does not replace velocity or apply an upright-restoring torque.
Only the player's explicit recovery command resets its pose.

The rear inertia tensor includes the outboard wheel masses; deriving it from
the narrow axle housing alone made the joint unstable. Rear springs use
600 kN/m with 1 kN s/m damping. Wheel sprung masses remain automatic for each
rigidbody. The separate unpowered axle also needs a 0.001 Nm numerical wake
signal while rolling, because Unity does not expose PhysX's sticky tyre reset
for jointed vehicles. Its combined tyre force is below 0.008 N. See the
[PhysX jointed truck example](https://nvidia-omniverse.github.io/PhysX/physx/5.1.1/docs/Vehicles.html).
Parking and inactivity clear that signal along with engine torque.

The front wheels drive and brake. The rear wheels use separate inside/outside
steering angles, with a 60-degree inside limit at low speed reducing to
12 degrees at speed. Engine torque tapers towards 4.3 m/s forward and 3 m/s
reverse. Selecting the opposite direction brakes before reverse drive engages.
Shift reduces power and applies progressive braking towards a slow approach.
The wheels, rear axle and steering wheel follow their physical state.

`ForkliftPlayerInteraction` reuses the walking camera, disables the walking
capsule while seated, and requires a brief familiarisation before first entry.
Controls are E to enter/exit, W/S to drive/reverse, A/D to steer, Space to brake,
Shift to inch, F to park, C for rear/cab camera, V to centre, H for the horn,
and hold R while stopped to recover. Leaving requires clear floor beside the
truck. Recovery checks that the parking bay is clear. Focus loss and browser
pause clear driving inputs; resuming requires a fresh click and neutral controls.

The practice ramp is a narrow tyre track, outside the fork spacing. A normal
wide ramp can catch the lowered forks, which have physical tapered collision.
Reverse onto the practice ramp so the low mast foot follows the tyres. Driving
straight at its steep entrance with the mast first correctly stops against it.
Body, mast, guard, carriage and fork colliders are compound shapes. Forks and
carriage currently remain fixed to the truck; warehouse pallets are static.

## Next physical interactions

Lifting needs a force-limited hydraulic actuator, moving mast/carriage bodies,
and a runtime chain and hose solution. Pallets and cargo need their own mass,
centre of mass, inertia and collision geometry. Supporting a load through fork
contacts should transmit its weight and moment into the truck, so an overloaded
actuator can stall and an off-centre load can tilt or topple the system. Do not
implement carrying by parenting cargo to the truck or directly teleporting it.
The short mast's travel must also be redesigned before reaching the upper rack.
The driving root uses metre scale and Unity +Z forward. Imported mechanical
pivots retain the FBX scale and Blender local axes; future lift motion should
use normalized control frames or body/world-space distances rather than adding
metres directly to an imported pivot's local Y coordinate.

`ForkliftDrivingValidation.ValidateAndSave()` advances the actual prefab in
isolated PhysX scenes and saves measured results to
`Assets/RackLab/Reports/forklift-driving-validation.json`. It checks floor support,
acceleration, service braking, inching, reverse, steering in both directions,
two-track ramp climbing, one-sided ramp rollover, free fall and rotation, wall
collision and cleared pause input. This pass covers unloaded driving, not load
capacity or lifting. The browser test additionally exercises the compiled
player's entry, driving controls, cameras and pause behavior.
