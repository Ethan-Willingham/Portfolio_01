# The Warehouse Simulator

A Unity 6.3 URP warehouse with an empty distribution-business career and a separate
equipped Sandbox. It does not read or write the illustrated game's saves.
Deliveries, stock, cash and equipment are session state, with no checkpoint persistence yet.
Internal OneShift paths, namespace and Editor menus remain stable.

The v12 browser offers an empty $600 distribution business and a stocked
Sandbox with $10,000, 100 owned cartons, two unreceived PO cartons, 90 rack bins,
three floor storage bins, two receiving bins, staging and a moving dispatch bin.
The active goods are eight varieties of sealed cartons. The opening pallet truck
and timed free parcels are disabled; their authored sources and checks remain.
Customer demos is a third mode with prepared receiving/putaway, transfer and
pick/shipping walkthroughs. Each uses the real WMS ledger and physical cartons,
starts at 9 a.m., and gives one instruction and a location marker at a time.
H opens its guide. Completion follows confirmed physical work, including actual
carrier departure for shipping. See the v12 section in docs/ONE_SHIFT.md.

The room uses a saved reflection cubemap. Direct daylight, fixture lights and
shadows remain live, with no recurring room captures in the browser. Rebuild the
saved reflection after changing static room geometry; see WAREHOUSE_LIGHTING.md.

The Zebra TC22 equips automatically with a live WMS screen and no hand model.
Hold left click to angle its top scan window and keep the red aimer on;
stable labels decode once until the target changes or the trigger is released.
Right click toggles enlarged screen inspection; Q equips or stows it. F is an
alternate scan key and Enter confirms a ready task. Its tiles are Receive,
Transfer, Pick, Ship and Item lookup. Hold left mouse while the device is stowed,
or hold E in either state, to carry a carton; release that control to drop it.
Pickup preserves orientation, right mouse and mouse movement rotate a held
carton, and the wheel adjusts distance. Carry rotation takes priority over
scanner inspection. The office monitor opens the manager WMS with PO/SO examples, stock, bin
contents, task lines and transaction history. The Business app handles equipment
and finance. New orders use whole-carton quantities from the eight-item catalog.

Five labelled rack rows, A through E, each contain three bays. Bin addresses such
as A01-01-01 identify row, bay, level and position; row endcaps and bay headers
make the arrangement visible. There are 97 total bins and all 93 storage bins
are populated in Sandbox. REC-02 and STAGE-01 sit beside the north garage door
with floor lettering, borders and wall signs, leaving the central dock route
clear. REC-01 remains the front-door parcel receiving bin. Labels retain normal
depth occlusion without distance-based visibility toggles.

WarehouseWmsLedger is the one stock authority. WarehouseWmsRuntime,
WarehouseWmsWorkflow and WarehouseWmsSnapshot connect it to physical bins,
WarehouseWmsScanner, courier visits and both browser interfaces. Receive posts
stock into receiving; Transfer makes it available in pickable storage; SO release
allocates the oldest eligible cartons; Pick stages them. Collection is booked
only after all picks. Ship loads the exact manifest and authorizes departure after
the player steps clear. Payment and stock decrement happen offsite, once.
The full rules, limits and primary references are in docs/ONE_SHIFT.md.

The handheld model, carton geometry and Code128 label meshes are original code.
Barcodes check range, orientation and solid occlusion. Labels use per-carton
handling IDs, not item serial numbers. Physics, pickup and supported placement
remain real. A physically moved box does not silently change the WMS record.
Racks, forklift, singing fish and flame decals remain career purchases.

BrowserLifecycle installs the WMS at runtime before the authored receiving
service starts. Editor Play without that browser bootstrap retains the authored
legacy rack/pallet trial. Do not use that Editor start as a current browser validation.
Install WarehouseCareerBuilder.Install() before exporting to retain runtime
materials and shaders. Preserve the office camera transition and input locks.
Pointer capture belongs to the browser launcher, including returns from the
computer and handheld; rejected pointer-lock requests must not crash Unity.

Run WarehouseWmsValidation.ValidateAndSave(),
WarehouseWmsWorldValidation.ValidateAndSave() and
WarehouseWmsRuntimeValidation.ValidateAndSave(), then inspect their JSON passed
fields. These fixtures include explicit physical setup; they do not replace the
focused v11 browser check tools/test-one-shift-v11-browser.cjs. The v11 export is
42,575,081 compressed bytes with zero build errors. Grabber and world fixtures
pass 19 and 37 checks. Focused Chrome sessions verify the handheld, box controls,
dock route and computer return, including rejected pointer capture and recovery.
Set SHIFT_V11_OFFICE_ONLY=1 for the shorter office regression. Full shipment
cycles and long performance profiling were not repeated; see docs/ONE_SHIFT.md
for the exact scope. The previous native WMS browser scripts assume the v10 layout and toggle
pickup controls and need adaptation before reuse. The UI fixture is
tools/test-one-shift-wms-ui.cjs. Run relevant grabber, courier and controls checks
when changing those systems. Earlier v9 career and pallet tests retain historical
coverage but assume a different start and are not the current WMS walkthrough.

Historical v10 verification: the export is 42,570,428 compressed bytes with zero build errors. Ledger,
world and runtime fixtures pass 29, 37 and nine checks respectively. Native
browser sessions verify full Sandbox and career receiving-to-shipping cycles,
including offsite payment and repeat ordering. The career route is
tools/test-one-shift-wms-career-browser.cjs; populated performance is measured by
tools/profile-one-shift-wms-browser.cjs. Close the Editor and run Unity browser
workloads one at a time. See docs/ONE_SHIFT.md for validation scope and results.

The original yellow forklift, owner's rack geometry, road truck and pallet assets
remain in the project. The truck is documented in RECEIVING_TRUCK.md; it is not
part of the current carton-only opening. Source and build details below remain valid.

The room now has concrete block walls, ribbed upper cladding, an exposed steel
roof, high multi-pane windows and warm sunlight with sparse drifting dust.
See [warehouse walls and daylight](WAREHOUSE_ENVIRONMENT.md) for the targeted
installer, source geometry, lighting setup and checks.

The southeast corner contains a small dispatch office with glazed partitions,
blinds and one computer workstation with space for received parcels. Its south front door opens
onto a covered parcel shelf and a pedestrian ramp. Aim at the door and press E
or click to open or close it. The surrounding business park has six neighboring
units, visitor parking, planted verges and a parcel van; the north truck yard
and its walking route remain in use.

Open `Assets/RackLab/Scenes/RackFloor.unity` and press Play. The browser player
is the current release target; rebuild the Windows player before using
`Builds/Windows/OneShiftRackLab.exe` to test this layout. Click the Game view
to capture the mouse. WASD walks, the mouse looks, Shift runs, Space jumps,
Escape releases the mouse and R returns to the entrance.

The yellow forklift is parked ahead of the entrance. E gets into the seat. On
the first entry, complete the parked brake, lift and centre/release prompts to
unlock driving. Later entries take one E. W/S drives and reverses; A/D steers the rear
wheels. Space brakes, B inches slowly, and driving releases the parking
brake. E brakes to a stop and steps out where there is clear floor.

Hold Left Shift to show the centred vertical hydraulic slider. Mouse movement
sets a persistent signed lever position; farther from centre raises or lowers
faster, including while the pointer is stationary. Centre the slider or release
Left Shift to stop. Release returns the mouse to looking around. While held,
hidden forks and nearby pallet board edges show through the mast or load.
Use WASD to put the forks into the pockets, lift, reverse, then lower onto the
floor or rack. Q/Z also raises and lowers; T/G tilts the mast. C changes rear/cab view, and Tab opens the
controls. V centres the view, H sounds the horn, F sets the parking brake, and
holding R while stopped recovers the forklift to a clear parking bay.
See [forklift driving and handling](FORKLIFT.md) for the physical mechanism,
the direct fork control, retained load examples and checks.

The v8 controls use faster steering response and finite neutral driveline drag.
The isolated actual-prefab test stops from 4.16 m/s in 2.25 seconds over 4.59 m
after accelerator release, without service braking or snapping velocity to zero.
Ground movement now has separate acceleration and braking, limited air steering
and a smaller jump. Camera bob and speed-based field-of-view changes are absent.

Browser mouse ownership transfers from walking to driving without unlocking.
The HTML shell consumes Escape, requests native pointer lock from trusted
Resume/Back to floor clicks, then calls the controller resume command. The
first two neutral captured frames discard pending UI mouse motion. Keep these
boundaries when changing input: Unity's deferred pointer-lock request cannot
reliably capture from its ordinary frame loop after an intentional release.

In the browser, aim at the office monitor or keyboard and press E. The camera
moves into the screen before the WMS desktop opens. Close it to let time and the
courier advance. The manager shares the handheld's ledger and never grants stock
by displaying it. Computer UI is browser-only; the Editor interaction logs that
fact and leaves movement active. The illustrated game's saves remain untouched.

The warehouse starts at 4:30 a.m. Three industrial switches on the south wall,
beside the entrance electrical cabinet, control the west, centre and east rows
of ceiling lights. Walk within 2.6 metres, aim at a switch, then press E or click.
Each switch operates four fixtures. The lever position, indicator, glowing
diffusers and actual light follow the same circuit state.

The opening night reaches 7 a.m. in about 17 seconds. Daylight then lasts nine
real minutes until sunset at 6 p.m.; the following night lasts 90 seconds.
The sun crosses the southern sky from east to west with softer light and glare.
Window-frame shadows and dust shafts follow its direction. The clock stops
when the game loses focus. See [warehouse lighting](WAREHOUSE_LIGHTING.md) for
the controls, tuning and verification.

In the Game view's resolution menu, leave **Low Resolution Aspect Ratios** off
and keep the zoom at 1x for a sharp preview. The camera renders at full resolution
with 4x MSAA and high-quality SMAA to smooth fine rack details.

One Unity unit is one metre. The player is 1.78 m tall (about 5 feet 10 inches),
with eyes 1.65 m above the feet, beside 4.88 m (16-foot) upright frames. The view keeps a
90-degree horizontal field of view on wide windows, with vertical field of view
capped at 65 degrees on taller windows. Walking is 2.8 m/s and running is 5.4 m/s.

The original worker model uses deliberately blunt proportions, a work shirt,
worn trousers and a cap. Its 1,000 triangles use two skinned renderers, one tiny
palette material and thirteen rigid bones with one influence per vertex.
Walking follows measured movement; carrying and forklift seating use simple
poses. The first-person and cab views hide the upper torso and head with
`ShadowsOnly`, preserving their shadows while the arms and legs remain visible.
The chase camera shows the complete worker. It uses the
existing sun and fixture shadows, with no extra lights, colliders or Animator.

## Asset trial reference

The following describes the preserved rack-floor trial and its source assets,
not the arrangement of the receiving start. Rebuilding the rack floor restores
these displays. Restore the receiving start, then the office, business park and
worker installers described below to return to the public layout.

The original green racks in the trial occupy the right side, in clean,
used and worn finishes. The new blue and orange rack is a connected three-bay
run: four braced upright frames support three pairs of beam levels. Adjacent
bays share one frame, without overlapping posts. Its finish can be cycled with E.

The four owner-created Blender pallets are imported at their actual size, with
original board geometry, splits, splinters, nails, UVs and PBR maps. Empty examples
of fresh pine, working wear, split and battered, and repaired pallets are laid out
on the left. Fresh, used and repaired variants also occupy the rack. The damaged
sample stays empty. The source file in `assets/one-shift/models/pallets` is unchanged.
All eighteen trial pallets are dynamic, including the loaded pallets on the
upper rack. Four additional packages in the northwest floor area demonstrate
light, ordinary, excessive and off-centre loads. Their labels show pounds first
and kilograms second; the actual total masses are 80, 800, 3,500 and 800 kg.

## Rack and pallet dimensions

Each bay stores two pallets on the concrete floor and two on each of two raised
levels. Beam tops are at 1.8288 and 3.6576 m. The frame is 4.8768 m tall.
The clear span is 2.44 m and adjacent frame centres are 2.53 m apart.
Each pallet is 1.016 m wide and 1.2192 m deep (40 by 48 inches), with a nominal
0.12065 m board stack. Small chips, warped boards and splinters affect the height
by a few millimetres. These pallets are rectangular, not half pallets.

The 40-inch side faces the aisle. Two pallets fit across a bay with about
136 mm between them and between each outside edge and the upright. Pallets extend
about 75 mm beyond the front and rear of the approximately 42-inch-deep frame.
The full pallet footprint is preserved; it has not been stretched or shrunk to fit.
Example carton loads reach about 1.529 m including the pallet. The lower levels
allow a 100 mm lift clear of the deck without hitting the beam overhead.

The rack proportions follow the [Interlake Mecalux selection guide](https://static.globalindustrial.com/products/pdf/4904-interlake-mecalux-inc/347129.pdf)
and [Uline's selective rack component layout](https://www.uline.com/Product/Detail/H-5715/Pallet-Racks/Pallet-Rack-Starter-Unit-96-x-42-x-96).
The load height and room layout are choices for this game scene. The rack has
roll-formed uprights, teardrop slots, braced frames, step beams, connectors using
separate upright columns at shared connections, retaining pins, wire decks,
base plates, anchors and yellow upright guards. Wear is cosmetic, without an
assigned structural grade or load rating.

## Game assets

| Asset | LOD0 triangles | LOD1 | LOD2 |
| --- | ---: | ---: | ---: |
| Shared upright frame | 1,488 | 408 | 212 |
| Bay beams and decks | 5,104 | 760 | 184 |
| Fresh pine pallet | 11,700 | 468 | 468 |
| Working wear pallet | 12,124 | 856 | 536 |
| Split and battered pallet | 12,372 | 1,528 | 648 |
| Repaired pallet | 12,288 | 1,188 | 616 |
| Carton load | 1,226 | 122 | 86 |

The original green rack retains its existing three LODs. Each new steel module
uses one renderer and material at an active LOD. Each pallet uses one renderer,
with wood and nail materials nearby and only wood at distance. Detailed nail
geometry and bevels disappear at the first LOD transition; distant boards keep
their original UVs. The four 2048-pixel material sets have mipmaps and texture
compression. Metallic/smoothness maps pack zero metal into RGB and inverted
source roughness into alpha for URP/Lit. Normal maps are imported as normal maps.

All collision uses compound boxes. Pallet board colliders preserve front fork
pockets and rounded side-notch shoulders. Fork-entry transforms are included.
The connected-row source prefab has 18 named placement anchors, with 14 example
slots occupied by 12 loaded pallets and two empty pallets. The receiving installer
removes those examples from its scene instance. Each empty pallet weighs 25 kg, and each
existing strapped carton package weighs 450 kg including its pallet. Each is
one freely moving rigidbody with its original compound board colliders and
open front fork pockets. The fork heel fits through the 40-inch front or rear
face; it is thicker than the original side notch. Enter from the front or rear.
Cartons remain strapped to their own pallet. Nothing attaches a load to the forklift.

`Assets/RackLab/Prefabs` contains four `Pallet_` variants, `CartonLoad`,
`PalletRackUpright`, `PalletRackBay`, and `ConnectedPalletRackRow`. The existing
`RackClean`, `RackUsed` and `RackWorn` prefabs are restored to the original green
rack model. The older `StandardLoadedPallet` placeholder is retained as an unused
prototype asset; the receiving scene uses the owner's detailed pallet geometry.

Rack vertex colors store finish colors and classification. UV0 and UV1 carry
face coordinates, dimensions and cutout identifiers. Preserve these attributes
and use `OneShift/Rack Steel`. The pallet wood uses ordinary URP/Lit.

These are asset budgets, not an FPS guarantee for a full warehouse. Profile a
dense aisle on target hardware before fixing production lighting and LOD ranges.

## Rebuild

From the repository root, use Blender's background Python runner with
`tools/blender/build-forklift-rack.py`. It reuses construction details from
`assets/one-shift/models/warehouse-rack.blend`, generates the shared frame and two
beam levels, and writes modular rack and separate carton-load FBX assets.
The editable native file is `assets/one-shift/models/forklift-pallet-rack.blend`.
`tools/blender/rack_mesh.py` packs the mesh attributes and verifies vertex colors
after allocating all UV layers. The original rack study and its generator remain
available. Its `build-warehouse-rack-game.py` also generates the shared wear noise.

Run `tools/blender/export-warehouse-pallets.py` with Blender 5.2 to export the
four existing pallet collections to `owner-pallets-lods.fbx`. This reads the
source file without saving it. Then run `tools/blender/pack-pallet-materials.py`
with Python and Pillow to pack the source roughness maps for Unity.

`tools/blender/build-rack-font.py` reconstructs the project's existing Segoe UI
font from its WOFF into the TTF format Unity imports. No font download is needed.
It also bakes the small location-sticker texture with Pillow.
`tools/blender/build-pallet-label.py` creates the fictional cargo label with that font.

In Unity, choose **One Shift > Build rack floor** to regenerate the room,
materials, prefabs and validation report. This replaces the trial scene, so
save any manual scene changes under a different name first.

After rebuilding the room, choose **One Shift > Install forklift driving** to
restore the truck and its practice area. This targeted installer preserves the
room and saves a scene backup under `Temp/ForkliftBackup`. Choose
**One Shift > Validate forklift driving** to run the actual prefab through
isolated PhysX scenes, including acceleration, braking, steering, ramps and
rollover. It writes `Assets/RackLab/Reports/forklift-driving-validation.json`.
Then choose **One Shift > Install physical pallet handling** to add the jointed
lift mechanism, upgrade the pallet and connected-row prefabs, and restore the
four mass examples. This preserves the warehouse and saves a scene backup under
`Temp/ForkliftHandlingBackup`. Reinstall handling after rebuilding the driving
prefab. The source Blender file retains its authoring mast. The derived Unity
duplex has a 2.493 m collapsed height and 3.9 m physical carriage travel, with
adapted rail tails, guides and cylinders that fit the original truck's trailer.
`ForkliftHandlingBuilder.InstallCompactForklift()` replaces only the forklift
while preserving the receiving scene and its independent stock.

Then choose **One Shift > Install receiving warehouse start**, or call
`WarehouseStartBuilder.Install()`. This backs up the scene under
`Temp/ReceivingBackup`, removes trial displays, cuts the real dock opening,
and installs the empty wall rack, yard, truck sequence and four delivery pallets.
Run this after regenerating the trial scene or its forklift examples, before
the front-office additions below.
`WarehouseStartBuilder.Validate()` checks the starter stock, rack positions,
door clearance and dock/trailer support. Its report is
`Assets/RackLab/Reports/warehouse-start-validation.txt`.

For the current office and exterior, run `WarehouseOfficeBuilder.Install()`, then
`WarehouseBusinessParkBuilder.Install()`, `WarehousePlayerBuilder.Install()` and
`WarehouseControlsBuilder.Install()`.
The office installer rebuilds the shell to cut the real south door; the park
installer then restores its longer view and fog distances. Each saves a scene
backup under `Temp` before editing. The equivalent One Shift menu items are
**Install front office and parcels**, **Install warehouse business park**, and
**Install warehouse worker**.

Their `Validate()` methods check door and ramp clearance, parcel bindings,
park geometry and light budgets, and worker mesh, skinning and shadow setup.
`WarehouseFrontOfficeValidation.ValidateAndSave()` exercises the actual parcel
timer, inactivity and pause gates, carrying, one-time receipt, and door occupant
protection on a temporary copy. Reports are in `Assets/RackLab/Reports`.
Also inspect the front entrance, office, worker shadows, seated camera and
day/night exterior in the exported browser player. Historical performance
measurements below remain separate from the current export.

Choose **One Shift > Validate forklift handling** for physical pickup, transport,
release, rack placement and retrieval with the saved prefabs. It also measures
overload and off-centre load behavior. **One Shift > Validate forklift camera**
checks tight turns at several frame rates and camera obstacle clearance. Their
reports are saved beside the driving report under `Assets/RackLab/Reports`.

Choose **One Shift > Build Windows player** to rebuild the standalone version.
With Unity's Web Build Support module installed, choose **One Shift > Build
browser player** to export the browser version. `WarehouseWebBuilder.BuildWeb()`
requires Web as the active platform in Build Profiles. After changing between
Web and Windows, wait for the platform import and script compilation to finish
before exporting; otherwise Unity can omit platform-specific input assemblies.
The browser builder
stages the build under `Builds/WebGL/OneShiftWeb` and copies its four compressed
player files to `assets/one-shift-unity/Build` in the site repository. Gzip
decompression fallback supports static hosting without custom encoding headers.
The Web profile keeps Forward+ lighting with a 2048-pixel sun shadow map,
1024-pixel fixture atlas with three nearby 512-pixel slices and nine distant
128-pixel slices. The sun and nearby fixtures use medium soft-shadow filtering.
The image uses 2x MSAA plus medium SMAA, downsampled
four-sample contact shading and 64-pixel reflection faces. Periodic reflection
captures run every twenty seconds; light switches still request a refresh.
Desktop asset settings are restored after the build. The browser defaults to
Smooth, with at most 2,073,600 drawing-buffer pixels and a pixel ratio of 1.25.
Settings offers Sharper, with at most 3,686,400 pixels and a ratio of 1.5. Both
retain the same full-screen composition and 0.005-second physics step.

The loading gate remains visible through seven bounded graphics preparation
stages in `BrowserLifecycle`, with individual view labels and honest completed
progress within each stage: night, dawn, morning, afternoon, rows off,
the fork placement overlay, and the restored opening scene. They use actual
rendered frames and wait for each room probe to finish, without advancing
physics. A probe that fails to finish within ninety active rendered frames
leaves a retry message. This moves first-use shader linking out of gameplay.
The launcher's version and FPS readout uses the compiled build version and
completed game-camera frames, sampled at most twice per second, with no extra
animation loop. The v6 Chrome trace confirmed actual 2x multisampling and SMAA.
After 23.23 seconds of graphics loading, a 90-second run including first X/mouse
use had no long tasks or frame intervals above 50 ms (largest 20.8 ms) on the
Windows RTX 3080 workstation.

The final v8 export completed with zero build errors and totals 42,367,999
compressed bytes. Its actual Chrome player passed 73 functional gameplay
assertions and 43 office checks. A final fullscreen render-target failure was
fixed in the HTML shell and verified with an 18-check focused real-player
regression without graphics or page failures. The wrapper owns fullscreen
notifications; paused drawing-buffer changes apply on resume. The office checks
also verify that modal pointer movement cannot rotate the camera on return.
See `docs/ONE_SHIFT.md` at the repository root for the current verification
scope, physical business loop and browser profiling command.

The final v8 shell also passed 85 simulated-loader checks. Its separate
90.04-second Chrome profile at 1800 by 1125 on the RTX 3080 included practical
forklift training and native Left Shift lever operation. Startup took 29.98
seconds. Gameplay measured 7 ms median, 13.9 ms 95th percentile, 14 ms 99th
percentile and 20.8 ms maximum, with no frames over 50 ms, long tasks or blocking
WebGL calls over 20 ms. Actual 2x MSAA and SMAA were confirmed. Results are
machine-specific. The longest fine preparation callback gap was 9.71 seconds.

The final v7 export completed with zero build errors and totals 42,305,038
compressed bytes. Its office walkthrough passed 22 checks and the launcher
passed 40 simulated-loader checks. An earlier v7 export passed the 64-check
full gameplay suite before the final small rendering and HUD fixes; that result
does not cover the exact final export.

Two 90-second Chrome profiles of the final v7 player included first forklift
entry and native X/mouse use at 1800 by 1125 pixels on the RTX 3080 workstation.
Both confirmed actual 2x MSAA and SMAA. The first took 27.68 seconds to prepare
graphics, then recorded a 7 ms median and 14 ms 95th and 99th percentiles, but
also ten frames over 50 ms and eight long tasks, with a 333.3 ms maximum.
Those stalls clustered around 4.9 to 6.3 seconds and 18 seconds; their cause was
not established. An isolated repeat took 34.60 seconds to prepare, then recorded
a 7 ms median, 14 ms 95th percentile, 14.1 ms 99th percentile and 34.7 ms maximum,
with no frames over 50 ms or long tasks. Neither run recorded a blocking WebGL
call over 20 ms. These are machine-specific measurements, not a frame-rate
guarantee. Repeat the browser trace after rendering changes.

From the repository root, run `node tools/test-one-shift-unity-browser.cjs --real`
against the exported WebGL player for the existing receiving and forklift checks.
Run `node tools/test-one-shift-front-office-browser.cjs` for native keyboard and
mouse checks of the office doorway, front door, ramp, parcel arrival, carrying,
desk receipt, purchases, order acceptance/release, transaction conservation and
pause, with screenshots. `SHIFT_OFFICE_DUMP` selects its output
directory; `SHIFT_BROWSER_CHANNEL=chrome` selects installed Chrome.

The browser page controls focus, visibility, manual pause and portrait gating.
`BrowserLifecycle` clears held input and freezes the clock and audio before the
page stops Unity's main loop. Returning requires a fresh click to capture the
mouse. Keyboard and mouse controls are required for the Unity game.

The original asset-trial Editor builder validates mesh bounds, LODs, colliders, materials,
shader, original rack preservation, four shared frames, all four pallet finishes,
six pallet positions per bay, front and side fork passage and a 100 mm
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
