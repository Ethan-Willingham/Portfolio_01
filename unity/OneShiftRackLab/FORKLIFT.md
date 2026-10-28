# Warehouse forklift

The classic yellow LPG counterbalance forklift drives and handles physical
pallet loads in The Warehouse Simulator.
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

This short duplex lift remains the native animation study. Its 1.8 m carriage
travel does not reach the 3.6576 m rack level. The derived Unity duplex retains
3.9 m of physical carriage travel with a 2.493 m collapsed mast. Longer rail
tails, lower carriage guides and longer cylinder barrels preserve engagement
while fitting the original truck's 2.693 m trailer interior. At full extension,
the rails overlap by 493 mm and the carriage guides remain inside their channels.
The builder adapts connected mesh pieces from the exported FBX and keeps the
original Blender source intact. A separate Unity controller drives the physical
runtime mechanism; the imported model has no animation clips or constraints.

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
For the playable receiving start, run `WarehouseStartBuilder.Install()` after
the driving and physical-handling installers. It puts the practice displays
aside, retains the forklift, and installs the wall racks and receiving yard.
The prefab has URP materials and batches rigid geometry by moving assembly and
material. Its initial lowered leaf chains become two render groups. Installing
physical pallet handling then replaces those render groups with moving chain
geometry. The source FBX retains every individual link, and the runtime retains
their transform anchors.

`ForkliftDriveController` applies wheel torque and tyre braking to a 3,500 kg
main assembly and a 120 kg rear axle joined by a physical hinge. The handling
installer divides the main assembly into a 2,980 kg chassis, 220 kg outer mast,
140 kg inner stage and 160 kg carriage with forks. Its three-degree rear axle
oscillation ends at mechanical stops. Four WheelColliders represent solid tyres
with short compliance. The main centre of mass is 0.72 m above the model origin,
0.18 m behind it. These are game tuning values for this original truck.
Gravity, contact forces and mass distribution determine tipping. Roll and pitch
are free; driving does not replace velocity or apply an upright-restoring torque.
Only the player's explicit recovery command resets its pose.

The rear inertia tensor includes the outboard wheel masses; deriving it from
the narrow axle housing alone made the joint unstable. Rear springs use
600 kN/m with 6 kN s/m damping. Physics advances at 200 Hz so the chassis,
rear axle and hinge respond together every 0.005 seconds. Both bodies use
the project's default joint solver iterations. Wheel forces act 0.02 m above
the resting tyre base to reduce contact jitter.

Tyre rest loads come from the whole truck's mass, centre of mass and axle
positions: about 798.25 kg supported by each front wheel and 1,011.75 kg by
each rear wheel. The controller applies these sprung masses after native
vehicle initialization; setting them earlier is overwritten. Actual body
masses total 3,500 kg for the main assembly and 120 kg for the rear axle. This accounts for the chassis weight passing
through the rear hinge, which the axle's automatic 60 kg per wheel omits.
Native tyre friction remains finite and allows slip. There is no anti-roll
force or velocity snapping.

The separate unpowered axle also needs a 0.001 Nm numerical wake signal
whenever the parking brake is released, including in neutral so gravity can
roll the truck. Unity does not expose PhysX's sticky tyre reset for jointed
vehicles. The same signal reaches the front wheels when neutral driveline drag
is effectively zero. It has no meaningful propulsion; the combined force of
all four wake signals is below 0.014 N. See the
[PhysX jointed truck example](https://nvidia-omniverse.github.io/PhysX/physx/5.1.1/docs/Vehicles.html).
Parking and inactivity clear that signal along with engine torque.

The front wheels drive and brake. Releasing the accelerator immediately clears
the propulsion request. In neutral, driveline drag opposes each front wheel's
rotation, up to 1,200 Nm per wheel, and tapers smoothly to zero below 0.4 m/s tyre
rolling speed. Neutral uses finite opposing motor torque, without applying the
service brake or replacing body velocity. The taper still permits gravity to
roll the truck on a slope after the parking brake is released.

The rear wheels use separate inside/outside
steering angles, with a 60-degree inside limit at low speed reducing to
12 degrees at speed. Engine torque tapers towards 4.3 m/s forward and 3 m/s
reverse. Selecting the opposite direction brakes before reverse drive engages.
The central steering angle moves toward the request at 210 degrees per second,
with a 260-degree return rate. Throttle ramps at 4.8 input units per second.
Holding B reduces power and applies progressive braking towards a slow approach.
The wheels, rear axle and steering wheel follow their physical state. Hydraulic
forces, load mass, tyre contact and free roll/pitch remain part of the same
physical model.

`ForkliftPlayerInteraction` reuses the walking camera, disables the walking
capsule while seated, and requires practical familiarisation before first driving.
E enters the seat. The first entry shows one action at a time: press Space to
check the brake, hold Left Shift and move the mouse up to lift the empty forks
slightly, then centre the lever and release Left Shift. The truck remains parked
through these checks, with drive and steering input blocked. E and Enter do not
skip them. Later entries take one E. Carrying a parcel blocks both entry and its
E prompt. W/S drives and reverses, A/D steers, Space brakes, and B inches.
Throttle releases the parking brake.
E requests a stop and exit, applying the service brake until the truck is slow
enough, then checking for clear floor at either side or behind the truck.
Escape cancels an exit request and releases capture; the browser opens its pause
menu. C changes rear/cab view, and Tab or F1 opens Controls. F parks, V centres,
H sounds the horn, Q/Z raises and lowers, T/G tilts forward and back, and holding
R while stopped recovers to a clear parking bay. Focus loss, pause, portrait
gating and capture loss clear driving and fork input. A trusted Resume button
can recapture the mouse; returning from inactivity needs a fresh click. In either
case, held controls must return to neutral before they can move the truck.

The browser HUD uses `ContextHint`, `ContextHintKey`, `TrainingStep`, `Notice`,
`ForkControlHeld`, `ForkSliderNormalized` and `MouseLiftInput` from the driver.
`ForkSliderNormalized` is the signed lever position; `MouseLiftInput` is its
signed valve command. Both range from -1 to 1. The old IMGUI briefing and control
panels are removed. Walking uses short acceleration and stopping ramps, limited
air control and a 0.34 m jump. Its camera has fixed eye height and perspective,
without head bob, roll or a sprint zoom.

## Mouse fork control and placement view

Hold Left Shift to show a centred vertical hydraulic lever. Right Shift does
not open it. Moving the mouse up or down moves the lever, with its position
setting signed lift speed: up raises, down lowers, centre holds the attained
height. A still mouse away from centre keeps that speed. Releasing Left Shift
closes the valve, resets the lever to centre and returns the mouse to looking.
The same finite-force hydraulics serve the lever and alternate Q/Z keys.

`ForkliftMouseLift` accumulates mouse displacement, independent of render rate.
Twenty Unity mouse-axis units span centre to an end stop. A 7.5 percent central
dead zone closes the valve; the remaining travel uses a squared response for
fine movement near centre and full flow at either end. A frame longer than
0.12 seconds or invalid pointer input clears the lever and requires a release
before another hold. Capture loss, pause and exit also clear it. The neutral
gate prevents a held Left Shift from resuming when capture returns.

Mouse look stays still while Left Shift is held. WASD continues to position the
truck, B inches, Space brakes, and T/G tilts the mast. Q/Z works only while the
mouse lever is closed, so a visible centred lever always means zero vertical
flow. Holding Left Shift starts with zero lift command and never chooses a
load, steers or approaches a pallet. Loads remain independent dynamic bodies,
lifted only through fork contact.

`ForkliftPlacementView` draws the two actual fork collision meshes and the board
edges of one nearby pallet only where ordinary opaque geometry hides them.
The nearest pallet must be ahead, within 1.5 m laterally and 3 m of the fork tips.
Its edge mesh comes from the actual board colliders, leaving the fork pockets
open. The warm, translucent overlay uses at most three draw calls and ordinary
triangles supported by WebGL. It changes no existing materials or collisions,
and disappears when Left Shift is released. The shader is included through Resources.

`ForkliftLoadAssist` remains an isolated validation fixture for historical
handling tests. The player interaction no longer constructs or runs it.

## Retained driving trial

The practice ramp is a narrow tyre track, outside the fork spacing. A normal
wide ramp can catch the lowered forks, which have physical tapered collision.
Reverse onto the practice ramp so the low mast foot follows the tyres. Driving
straight at its steep entrance with the mast first correctly stops against it.
This ramp is kept in the trial builder and isolated checks, not in the public
receiving start.
Body, mast, guard, carriage and fork colliders are compound shapes. The fork
blades retain tapered convex collision, including their heels and thin tips.

## Physical pallet handling

`ForkliftHandlingBuilder.InstallHandling()` upgrades the existing truck, the four
pallet prefabs, the connected rack-row prefab and all scene pallet packages. It
backs up the scene under ignored `Temp/ForkliftHandlingBackup`. Run it after the
driving installer, which rebuilds the base truck.

`ForkliftLiftController` connects the outer mast to the chassis with a tilt hinge
and connects the inner stage and carriage with two sliding joints. A hydraulic
force acts equally and oppositely on the outer and inner mast. Tension in the
reeved chains transfers that force to the carriage at a two-to-one travel ratio.
The actuator has a finite pressure limit; moving a load depends on its actual
weight and leverage. The visual leaf chains follow the anchors and sheaves.
The collision bodies and fork contacts carry the weight, without pickup joints,
cargo parenting, teleportation or an upright-restoring force.

The native slider drive limits cylinder force to 33,943.4 N, equivalent to
16,285 N at the carriage after supporting the inner mast. Lowering vents the
cylinder when downward drive would otherwise be required. Releasing either
lever captures the attained position and preserves its supporting pressure or
torque, avoiding a load drop when the position target changes. The pressure
gauge reports bounded actuator demand; PhysX joint reaction force excludes the
native drive contribution.

The derived truck lowers the original fork resting pose by 40 mm to enter the
floor pallets. Its two 1.95 m sliding stages provide 3.9 m of total fork travel.
The taller rails retain overlap at maximum extension. The source short mast's
Blender animation study remains available separately.

`PalletCargo` assigns each package its real mass, weighted centre of mass and
inertia, with full translational and rotational freedom. The original board
colliders leave the front pockets open. The 43 mm fork heels cannot pass through
the original 38.1 mm side notch, so approach either 40-inch end. Strapped cartons
share a rigidbody with their own pallet; individual carton unloading is not
simulated. The public opening has four 450 kg carton packages in the receiving
trailer and empty wall racks. Road-transit restraints release at the dock,
before the doors open. From that point the player handles each dynamic package.

The retained asset trial has fourteen rack packages: twelve 450 kg carton loads
and two 25 kg empty pallets. Its four floor pallets also weigh 25 kg.

Four additional trial packages show different mass distributions. A timber
crate totals 80 kg, a centred carton package totals 800 kg, steel billets total
3,500 kg, and a second 800 kg carton package sits 180 mm off centre on its pallet.
The two 800 kg examples separate load balance from total weight. Their visible
labels show pounds followed by kilograms. Physical values use kilograms.

The driving root uses metre scale and Unity +Z forward. Imported mechanical
pivots retain the FBX scale and Blender local axes. The physical lift uses
normalized body frames and world-space distances. Chassis mass and centre of
mass are corrected when the three moving bodies are split off, preserving the
unloaded truck's total mass and moment.

The chase camera keeps one orbit around the interpolated chassis pose. It
smooths the viewing angle and outward obstacle clearance without separately
lagging the camera's world position. The former distance check could mistake
that lag for an obstruction during a sharp turn and repeatedly snap the view.

## Validation

`WarehouseControlsBuilder.Install()` updates the saved forklift prefab and the
current scene's control tuning without rebuilding geometry or stock. It saves
backups under `Temp/ControlsBackup`. Reapply it after an older forklift prefab
or scene is restored. `WarehouseControlsValidation.ValidateAndSave()` runs
eleven deterministic checks of the persistent lever, centre/release handling,
invalid and interrupted input, walking acceleration/stopping and air momentum
at 30, 60, 120 and 144 Hz. It writes
`Reports/warehouse-controls-validation.json` and does not simulate browser keys.

`ForkliftHandlingValidation.ValidateMouseLiftAndSave()` checks a centred held
lever, release and interrupted input, persistent physical raising/lowering at
30/60/120 Hz, a working-load pickup and setdown, and the unchanged overload
limit. Its report is `Reports/forklift-mouse-lift-validation.json`. All six
checks passed with the v8 lever and final driveline tuning. The full 21-check
driving pass and all eleven deterministic control checks also passed.

`ForkliftDrivingValidation.ValidateAndSave()` advances the actual prefab in
isolated PhysX scenes and saves measured results to
`Assets/RackLab/Reports/forklift-driving-validation.json`. It checks floor support,
acceleration, service braking, lift-off deceleration, steering response, inching,
reverse, steering in both directions, two-track ramp climbing, one-sided ramp
rollover, free fall and rotation, wall collision and cleared pause input. Grip
checks measure tyre rolling in both directions, rear tyre contact during
sustained turns, parking hold, and parking then releasing the brake on uphill
and downhill slopes. The validation uses the production 0.005-second physics
step and covers unloaded driving, not load capacity or lifting.

With v8's final 1,200 Nm neutral drag, release from 4.16 m/s reached less than
0.12 m/s after 4.59 m and 2.25 seconds. After the first 60 milliseconds the truck
still travelled at 4.05 m/s, confirming a finite slowdown. The service brake
stopped from the same speed in 1.69 m and 0.79 seconds. Central rear steering
reached 21.25 degrees in 100 milliseconds and 49.18 degrees in 300 milliseconds.
The eight-degree slope tests still rolled after parking release. These are
isolated prefab measurements; an exported browser run remains a separate check.

`ForkliftHandlingValidation.ValidateAndSave()` checks all four pallet variants
through floor pickup, transport, release, and placement and retrieval at floor
and upper rack levels. It also checks the middle level, the light and working
packages, an 800 kg upper-rack cycle, hydraulic overload, off-centre loading and
pause input. It uses the saved prefabs and actual collision geometry at the same
physics timestep. `ForkliftCameraValidation.ValidateAndSave()` checks sharp
turns at 30, 60, 120 and 144 Hz, obstruction clearance, and a frozen timestep.

Run `node tools/test-one-shift-unity-browser.cjs --real` from the site root to
exercise the compiled player's native entry, practical familiarisation,
driving, Left Shift lever, placement overlay, physical unload and pause behavior.
Omit `--real` for launcher checks. `tools/profile-one-shift-unity-browser.cjs`
retains a 90-second measurement without screenshots. With `SHIFT_PROFILE_FORKS=1`
it records brake/lift/centre/release steps and fine/full lever samples through
native mouse and key events. Optional placement captures happen only after the
measurement is saved.

### Historical results

The earlier mouse-motion controller's six physical checks passed on 25 October
2026, before the persistent v8 lever. That version used X, and stopping the mouse
closed its valve. Its matched input raised the empty forks 0.61 m at each tested
render rate; the 800 kg package lifted 0.52 m and stayed in place after setdown
and withdrawal. The 3,500 kg load stayed down at the hydraulic pressure limit.

The retained `ForkliftHandlingValidation.ValidateAssistAndSave()` exercises held pickup,
transport and setdown, a modest approach offset, elevated-rack retrieval,
distant and side rejection, obstruction, release and overload. All thirteen checks
passed on 25 October 2026, including 30/60 Hz control updates, low headroom,
manual pickups, interrupted pickups and repick after manual setdown. The guide uses a brief upward command
until the load clears its support, then closes the valve and checks its held
height. Continuous corrections around the requested height had made a loaded
mast oscillate. The result is saved in `Reports/forklift-assist-validation.json`.
All twenty-two handling checks passed in the receiving scene, including full
stroke guide, chain and cylinder engagement for the compact mast.

`ValidateReceivingAssistAndSave()` also passed against the installed warehouse's
actual colliders at 30 Hz control updates. Both the first and deepest delivery
pallets rose 194 to 197 mm, reversed into the warehouse, and stayed still after
setdown and fork withdrawal. The deepest pickup drives the entire forklift into
the original full-scale trailer. The inner mast reaches about 2.615 m beneath
the physical 2.693 m roof. The test also catches dock-plate height differences.

The 24 October 2026 handling validation passed all 21 checks. The 800 kg package
completed the upper-rack placement and retrieval cycle, resting independently
on the 3.6696 m deck with no movement after full fork withdrawal. The maximum
fork top reached 3.9727 m. The 3,500 kg package rose less than 0.02 mm during six
seconds of full raise input. Moving the 800 kg package off centre changed the
mean signed front-wheel load imbalance from 0.04 percent to 13.19 percent.
All six camera checks passed, with orbit-radius error below 0.002 mm.
The separate `ValidateLoadedTiltAndSave()` check also passed: the 800 kg package
remained in contact through approximately eight degrees backward and six degrees
forward tilt, with at least 121 mm of floor clearance throughout the motion.

The 24 October 2026 grip validation with the moving mast passed all 19 checks.
In steady forward and
reverse travel, each tyre's 95th-percentile rolling-speed error stayed below
1 percent; the largest measured value was 0.769 percent. Rear lateral contact
speed at the same percentile stayed below 0.126 m/s in sustained tight turns.
Maximum horizontal drift during 30 seconds parked on level ground was 1.67 mm.
On the eight-degree slope, facing either direction, parked drift stayed below
1.74 cm over 10 seconds; releasing into neutral let gravity roll the truck
5.54 to 5.55 m in three seconds. The one-sided ramp still overturned the truck
after 3.63 seconds, reaching 95.0 degrees of body lean.

The earlier browser release `v=4` passed all 51 compiled-player checks in Chrome with
WebGL 2, including lift, neutral hold, mast tilt, camera switching, driving,
recovery and hydraulic input clearing on pause. The launcher passed its 22
lifecycle checks. Browser and Windows exports completed with zero build errors.
