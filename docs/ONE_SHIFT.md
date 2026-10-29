# The Warehouse Simulator

The Warehouse Simulator, formerly One Shift, keeps its stable `one-shift.html`
address and click-to-load Unity browser launcher. The current home screen uses an
actual scene image, a clear Start business action, Sandbox, settings and a separate control
guide. The HTML interface supplies the clock, contextual interactions, pause
menu, hydraulic slider and office computer. The old grey debug panels and
floating black pallet labels are absent from the playable scene.
The build is produced by **One Shift > Build browser player** in
`unity/OneShiftRackLab`, or `OneShift.RackLab.WarehouseWebBuilder.BuildWeb()`.
It stages the browser player locally, then copies the four verified build files
to `assets/one-shift-unity/Build/OneShiftWeb.*`. Gzip decompression fallback uses
`.unityweb` data, framework and WebAssembly files on GitHub Pages. The loader
keeps its `.loader.js` extension. Bump the launcher CSS/script query versions and
the build version in `js/one-shift-unity.js` and `BrowserLifecycle.BuildVersion`
whenever the published build changes.

## Current v11: handheld controls and warehouse layout

The TC22 equips automatically as a handheld device with a live WMS screen. Left
click scans the visible label. Right click toggles a larger screen inspection;
Q equips or stows the device, F remains an alternate scan key, and Enter confirms
a ready task. Transfer, Pick, Item lookup, Ship and Receive share the office WMS
stock and document state.

Hold left mouse with the scanner stowed, or hold E with it equipped or stowed,
to carry a carton. Release the held pickup control to drop it. Pickup preserves
the carton's orientation; right mouse and mouse movement deliberately rotate a
held carton, and the wheel adjusts carrying distance. Rotation takes priority
over scanner inspection while carrying. Browser-owned pointer capture handles
returning from the computer and handheld, so a rejected pointer-lock request
does not crash Unity.

Sandbox has five rack rows, A through E, with three bays each and 90 rack bins.
Thirty ground positions are pick faces and 60 upper positions are reserve.
Row endcaps and bay headers explain addresses such as A01-01-01: row A, bay 01,
level 01, position 01. Its 97 total bins include 93 populated storage bins,
holding 100 owned cartons, plus two expected PO cartons in REC-02. The eight
carton varieties and empty career start remain unchanged.

REC-02 receiving and STAGE-01 outbound staging sit together by the north garage
door with floor lettering, stronger painted borders and wall signs. The central
dock route remains clear. REC-01 stays on the front porch for career parcel
deliveries and has its own receiving sign. Location and carton labels no longer
switch off at distance; ordinary depth occlusion and camera framing still apply.

The focused browser check is `tools/test-one-shift-v11-browser.cjs`; set
`SHIFT_V11_OFFICE_ONLY=1` for its shorter computer-return regression. The v11
export is 42,575,081 compressed bytes with zero build errors. Grabber validation
passes 19 checks, including orientation retention; world validation passes 37.
Focused native Chrome sessions verify left-click scanning, the enlarged live
screen, hold/release pickup, deliberate rotation, Q while carrying, and the dock
walk. The 12-check office continuation passes normal return, a deliberately
rejected SecurityError promise, and fresh-click recovery without Unity alerts,
browser errors or active shader failures. Two automated walking waypoints were
corrected to pass around floor stock and stand within computer interaction range.
Full shipment cycles and a long performance profile were not repeated for v11.
The earlier native WMS scripts assume the v10 rack layout
and toggle pickup controls and need adaptation before reuse. The v10 results
below are historical evidence, not verification of the v11 build.

## v10 warehouse management reference

The stock and order rules below remain applicable. Controls, layout counts and
release checks in this section describe v10; use the v11 section above for the
current controls and layout.

`WarehouseWmsRuntime` now owns both browser modes. Its shared
`WarehouseWmsLedger` is the inventory authority for the TC22 handheld and office
WMS. The earlier career and pallet business classes remain as source and test
fixtures; neither runs alongside the WMS. The active trade is sealed cartons
only. A carton handling ID identifies one physical box, not serialized items.
There are no ERP, carrier or Zebra software integrations.

Start business opens an empty leased warehouse with $600. Book PO-1001 for three
cartons of tape in the office. A driver brings the actual boxes to REC-01 outside
the front door. Receive them there, transfer them into floor storage, release
SO-2001 for Miller Motor Works, pick its three allocated cartons into STAGE-01,
then load the collection van. Confirm the shipment after stepping clear. The
$210 payment posts only when the carrier leaves the site. Picking completion
books collection; sales-order release by itself does not summon a van.

Sandbox starts with $10,000, racks, a forklift and 100 owned cartons. Two further
cartons are physically in REC-02 against an open PO, awaiting receipt. Three
example purchase orders and three sales orders include multi-item documents.
Eight carton types represent tape, towels, gloves, mailers, stretch film, labels,
wipes and parts bags. Their sizes, board finishes, tape and printed contents vary.
The old opening trailer and timed free parcels are disabled in both modes.

Every location is a bin: REC-01 on the porch, REC-02 inside, F01 through F03
for floor storage, STAGE-01 for picked stock, and DISPATCH-01 in the moving van.
Sandbox adds three rack rows with 54 individually labelled bins, such as
A01-01-01. Ground positions are pick faces; upper positions are reserve storage.
The complete Sandbox has 61 bins, with all 57 storage bins populated. Stock must
be transferred from reserve to a pick face before allocation. Racks and the forklift remain purchasable career
upgrades after three completed orders. The singing fish and flame kit remain.

Q opens the TC22 task selector and pauses floor controls. Choose Transfer, Pick,
Item lookup, Ship or Receive, then return to scanning. F reads the actual label
under the aiming point; Enter confirms a ready task. Q returns to task selection.
Scanning checks the barcode face, viewing angle, range and intervening solid
geometry. The printed labels encode valid Code128 with checksum and quiet zones.
The simulation reads the targeted label's payload, rather than performing camera
image recognition. Box handling labels use CARTON, side product labels use ITEM,
and locations use BIN prefixes. No textbox substitutes for physical scanning.

Receive checks PO, receiving bin and exact carton before posting one CTN.
Transfer checks source, carton and destination. Pick uses the released order's
oldest eligible cartons and requires their actual placement in staging. Ship
requires the staged allocation, dispatch label and supported placement inside
the open van. Confirming a held, missing or unsupported carton fails. Loading
retains on-hand stock until the offsite shipment completes. Duplicate receipts,
double reservations and repeated shipment callbacks cannot duplicate stock or
cash. Moving a box without posting a task raises a location discrepancy after a
short settling allowance. Transfer can reconcile a misplaced box or return a
picked or loaded carton to storage before departure.

The office opens with a WMS console: operations, inventory, bins, purchase and
sales orders, work queue, transaction history and exceptions. Tables support
search and detail views. Quantities distinguish on hand, available, allocated,
receiving, picked and loaded stock. Orders display line progress and explain
unavailable actions. New purchase and sales orders use the item catalog and one
to six whole cartons, unlocked after the first career shipment. Booking a PO
debits cash; creating or releasing an SO does not pay. Equipment and finance are
in a separate Business app on the same desktop.

E or click carries and sets down cartons, the wheel adjusts distance, and right
mouse rotates. Physics remains dynamic. The computer camera transition, manual
pause, browser inactivity and landscape gate retain independent control locks.
Progress remains session-only. Resume keeps the open page's session; switching
modes confirms a fresh start. The illustrated game's saves are untouched.

The device is original code-authored geometry using the proportions in the
[Zebra TC22/TC27 reference guide](https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/product/tc22-tc27-prg-en.pdf).
Workflow references are Microsoft's documentation for
[warehouse mobile menus](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/configure-mobile-devices-warehouse),
[purchase receiving](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/tasks/set-up-mobile-device-menu-item-register-received-items)
and [putaway](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/tasks/set-up-mobile-device-menu-item-purchase-order-putaway).
This is an independent simplified WMS built for physical play.

Validation entry points are `WarehouseWmsValidation.ValidateAndSave()` for the
ledger, `WarehouseWmsWorldValidation.ValidateAndSave()` for geometry and scans,
and `WarehouseWmsRuntimeValidation.ValidateAndSave()` for integrated transactions.
Read each report's `passed` field, not just command completion. The native browser
walkthrough is `tools/test-one-shift-wms-browser.cjs`; the UI fixture is
`tools/test-one-shift-wms-ui.cjs`. The empty-business route is
`tools/test-one-shift-wms-career-browser.cjs`, and the populated performance run is
`tools/profile-one-shift-wms-browser.cjs`. Run these Unity browser workloads one
at a time, with the Editor closed. The previous career and pallet walkthroughs
describe v9 and earlier layouts and are historical regression fixtures.

### v10 release checks

The browser export is 42,570,428 compressed bytes with zero build errors. The
production ledger passes 29 checks, physical label and bin validation passes
37, and integrated WMS transactions pass nine. Courier validation passes 26
checks, all eight carton sizes complete delivery, and nine orientation checks
cover flat-face dispatch and rejection of unsupported or moving freight.

The UI fixture passes 41 checks and the mocked launcher passes 119. The actual
Sandbox walkthrough passes 213 gameplay assertions: all three barcode types,
blocked scans, transfer, partial receipt, duplicate rejection, live manager
tables, exact picks, loading, offsite shipment and new PO/SO creation. It finishes
with 99 cartons and $10,210 after receiving two cartons and shipping three for
$210. Creating the next documents changes neither stock nor cash.

That walkthrough initially failed its final console classification because its
collector had discarded the first observed state boundary. The original report
is retained separately from the gameplay results. Preserving an actual state
record classifies the three documented unused startup shaders correctly; the
classifier itself is unchanged. The harness now retains that boundary at boot.

The native career check completes the empty start, real courier delivery, porch
receipt, putaway, allocation, all three picks and loads, offsite payment, and a
second purchase. Its original run reached 152 checks before a set-down leaned
against adjacent boxes. The same browser session completed another 105 checks
after native pickup and repositioning, with the production placement checks
unchanged. The harness now uses more widely spaced staging positions. Cash moves
from $600 to $480, then $690 after shipment and $610 after booking two towels.
Those two new cartons remain Expected, with zero on-hand stock until receipt.
Fresh career logs retain the startup boundary and have no active shader failures,
browser errors or failed assets.

The final populated Sandbox profile measures 90.014 seconds on this machine's
RTX 3080 through D3D11, with an 1800 by 1125 canvas, 2x MSAA and SMAA. Active
presentation intervals are 6.9 ms median, 9.5 ms at p95, 12.8 ms at p99 and
36.1 ms maximum. None exceed 50 ms; no measured long tasks or WebGL entry-point
calls exceed 20 ms. These are observed browser presentation and CPU-call timings,
not GPU execution measurements or a guarantee for other hardware. The two
intentional TC22 task-selection pauses are retained separately. All 100 owned
cartons and 102 physical bodies remain unchanged after native walking, camera
movement, three scans and device stowing. Local click-to-ready time is 30.4 s,
including startup and graphical preparation; network download time will vary.

## Earlier v9 career and Sandbox reference

The following sections through the illustrated-game heading record the previous
release, its retained scene systems and verification. For the active inventory,
starting stock and order flow, use the v10 rules above.

### Career: Latchford Distribution

The default starts with an empty warehouse, $600 of working capital and a paid
lease. There is no opening truck, stock, forklift or rack row. The old decorative
parcel van and timed free parcels are also absent. The first purchase order buys
three cartons of packing tape for $120. A courier drives in, opens the van,
carries each real carton to the front porch and leaves. The player carries them
through the office and places them in the highlighted tape bay. A settled carton
must have real support in its bay; a held or airborne carton does not check in.

Miller Motor Works buys that batch for $210. The customer order is available only
after the stock has been received. Accepting books a collection van and marks
the exact oldest cartons. Load those cartons onto the van floor, withdraw and
let the driver leave. Payment posts once the shipment is offsite. Repeated button
presses cannot duplicate a booking, charge or payout. Shop towels and work gloves
open after the first customer order, serving Parkside Service and Northline Trade
Counter. No invisible staff unload, store or load the player's freight.

The HUD presents one next step. There are no timed first-day failures or running
rent charges. Purchases and customer batches match, each product retains a buyer,
and a collection costs no extra cash, so bought stock can fund the next cycle.
Equipment and novelty purchases preserve $120 for a small restock. After three
completed orders, racks cost $300 and the forklift costs $650. Both are required
to order a 450 kg pallet of workshop fasteners at $480. The player must put it away in a purchased rack
before accepting its $840 trade-counter order, then load and dispatch it through
the existing north dock. Forklift training remains required on first entry.

A $95 singing fish becomes available after the first completed order. It mounts
in the office and plays an original synthesized tune with moving jaw and tail.
The $65 flame kit requires an owned forklift and adds painted side decals without
changing handling. These are optional uses of earned cash.

E or a click picks up and puts down an eligible loose carton. The mouse wheel
adjusts hold distance; hold right mouse to rotate it while the view stays still.
The body remains dynamic and collides with the warehouse. Bounded forces and
torques follow a swept target, with a gentle release and clear separation from
player collision. Heavy loads and pallets still need the forklift. Pause, focus
loss, camera transitions and vehicle entry clear the held control state.

Using the computer moves the real camera toward its screen over 0.75 seconds,
then reveals a cream monitor surround, desktop and dispatch application. Closing
returns to the saved camera pose over 0.55 seconds. Movement is locked and freight
physics paused during both transitions. Focus and portrait gates suspend them
independently. The computer exposes the next task, stock, suppliers, customer
orders, upgrades and ledger; it never grants inventory merely by displaying it.

Career and Sandbox are separate fresh sessions. The title retains a Resume action
for the currently loaded session; switching modes explicitly confirms starting
over. Neither mode persists inventory across page loads or changes classic saves.
`WarehouseCareer`, `WarehouseCareerBox`, `WarehouseCourierService`,
`WarehouseGrabber` and `WarehouseComputerTransition` implement the career.
`WarehouseCareerBuilder.Install()` retains runtime material and shader resources.

## Sandbox and shared warehouse

The Sandbox start has three empty rack bays against the west wall, a clear working
floor, a receiving door in the north wall and a parking lot outside. A separate
yard doorway leads onto the access ramp, so parked trailer doors cannot block
the walking route. The first
delivery drives west along the north street, turns into the east driveway,
aligns in the yard, then reverses into the dock. The route takes about 45 active
seconds (44.10 in the route audit); the original trailer doors then open over
four seconds. The raised
warehouse shutter lets the player watch; a dock barrier remains closed until
the trailer doors are fully open and the dock plate is available. Four pallets,
992 lb (450 kg) each, start inside the trailer. The player unloads and stores them;
the status line counts pallets brought inside and resting in the eighteen rack
positions. There is no automatic unloading or putaway. The old rack finishes,
test-load displays and rollover ramp remain as source assets and validation
fixtures, outside the active start.

The southeast office has glazed partitions, blinds and one computer workstation
with a parcel receiving area. E or click opens its south front door onto a
covered parcel shelf and pedestrian ramp. Six neighboring units, visitor
parking, planted verges and a parcel van place the warehouse in a business park.
Three boxes arrive on the shelf after 35 active seconds. E or click carries one
box at a time; use the office parcel desk or its sign to receive it. Carrying
blocks forklift entry. These parcels are session-only and independent of the
pallet stock and business ledger.

Aim at the computer or keyboard and press E to open the warehouse desk. Buy one
supplier pallet at a time, accept a fictional retailer's order, unload the
matching stock, then physically put the oldest matching pallet back onto the
trailer and dispatch it from the desk. Buying debits cash once; accepting an
order does not pay. Payment posts only after the loaded truck has left the
park. An accepted order can be released before dispatch without changing cash
or stock. Accepting another order calls back an empty truck for free if the
previous truck has left, so existing stock never requires a new purchase to
be shipped. The computer shows inventory, inbound cases, lot IDs, offers and the
transaction ledger. Its modal pauses the simulation; close it to let a booked
truck move. The browser bridge confirms each command even while paused.

This is a simplified wholesale business with supplier purchases and retailer
requests, not an Amazon warehouse bidding exchange. The initial four pallets
contain 172 cases across paper, cleaning supplies and pantry goods. Inventory
uses real pallet objects, arrival days and first-in-first-out lots. The case
identity is opening cases plus purchased cases equals shipped cases plus
remaining physical cases. Unity business state is currently session-only and
does not read or write the illustrated game's saves or ledger.

The original worker has deliberately rough proportions and simple work clothes.
Its 1,000 triangles use two skinned renderers, one palette material and thirteen
rigid bones. Walking follows actual movement, with separate carrying and seated
poses. First-person and cab views hide the upper torso and head with
`ShadowsOnly`, preserving their shadows while leaving arms and legs visible.
Chase view shows the full model. It adds no lights or physics
bodies. A single analytic sky pass adds clouds, stars and a sun disc aligned
with the existing moving sun. Six unshadowed exterior wall packs fade with
daylight; two broad unshadowed office fills light the ceiling and walls as well
as the worktop. The existing sun
and twelve warehouse fixtures continue to provide real shadows.

`WarehouseStartBuilder.Install()` installs this layout after the physical
forklift and handling installers. `WarehouseStartBuilder.Validate()` checks
the real opening and continuous support into the trailer;
`WarehouseReceivingValidation.ValidateAndSave()` checks arrival, obstruction,
restraints, doors, dock access and physically supported storage in isolated
PhysX. The v8 suite also verifies queued purchases, exact physical manifests,
blocked dispatch and payment only after departure. A separate route audit
samples 1,202 tractor/trailer poses against the actual scene collision.
The delivery uses the owner's original 18-wheeler and 53-foot trailer from
23 October, with eighteen spinning wheels and its original hinged rear doors.
The doors fold against the trailer sides. Its floor, roof clearance and scale
remain those of the original model. Source provenance and Unity import details
are in `unity/OneShiftRackLab/RECEIVING_TRUCK.md`.
After installing the receiving start, run `WarehouseOfficeBuilder.Install()`,
`WarehouseBusinessParkBuilder.Install()`, `WarehousePlayerBuilder.Install()` and
`WarehouseControlsBuilder.Install()` in that order. Each has a validation method. The separate
`WarehouseFrontOfficeValidation.ValidateAndSave()` checks actual delivery,
pause, carrying, receipt and doorway obstruction logic on a temporary copy.
See the Unity README for menu names and scene backup locations.
The scene retains the moving sun, window shadows, twelve fixtures and three wall
switches. It uses a keyboard and mouse and requires WebGL 2. WASD walks at 2.8 m/s,
Shift runs at 5.4 m/s, the mouse looks, Space jumps, and R returns to the entrance.
E or a click operates a nearby switch. Escape releases the mouse; P pauses.
Mobile portrait shows a rotation gate; landscape still requires a keyboard and
mouse. Touch players can follow the link to the illustrated game.

E gets into the yellow forklift. The first entry teaches three small actions
while parked: hold Space, raise the forks with Left Shift and the mouse, then
centre the lever and release it. Driving unlocks after these actual actions;
there is no briefing to dismiss. Later entries take one E. W/S drives and
reverses, A/D steers, Space brakes, and B gives a slow approach. Driving
releases the parking brake. E brakes to a stop, checks for clear floor, and
steps out. Hold Left Shift to show a vertical hydraulic slider. Moving the
mouse sets its signed position: farther from centre moves the forks faster;
a stationary pointer retains the selected speed. Centre the lever or release
Left Shift to stop. Releasing also returns to looking around. While Left Shift
is held, the actual forks and nearby pallet-board edges show through
the mast and load. WASD positions the truck: line up with a pallet's 40-inch
end, drive the forks into its pockets, then lift through physical contact.
Lower onto a supported floor or rack surface and reverse out. Q/Z also raises
and lowers the forks; T/G tilts the mast. C changes the rear/cab view, and Tab
opens the control guide. Steering responds more quickly, returns to centre
promptly, and finite driveline drag arrests neutral coasting. Walking uses
separate ground acceleration and braking, limited air control and a modest
jump, without camera bob or speed-dependent field of view.

The forklift retains rigidbodies, rear steering, an oscillating rear axle and
force-limited jointed hydraulics. Pallet weight and leverage still affect lifting
and tipping. Cargo is temporarily restrained during road-truck arrival, then
becomes dynamic before the doors open. The forklift never parents, welds or
teleports a load. See `unity/OneShiftRackLab/FORKLIFT.md` for the mechanism and
checks.

The browser's default Smooth picture setting limits the drawing buffer to
2,073,600 pixels and a pixel ratio of 1.25. Settings offers Sharper, capped at
3,686,400 pixels and a pixel ratio of 1.5. Both fill the available view and resize
without restarting the game. The Web build uses smaller shadow maps, downsampled
contact shading, 2x MSAA plus medium SMAA, and less frequent reflection captures.
Physics retains its 0.005-second step. These bounds reduce work on Retina
displays; they are not a measured Mac frame-rate guarantee.

The loading screen reports download percentage, elapsed time and
individual views within seven graphics preparation stages. Labels update before
the heavy operation and progress reflects completed work. They render the actual
night, dawn and daylight scene, both light-row states, the fork placement overlay
and room reflections, including the visible worker in chase view. Gameplay, cargo
physics and audio remain suspended. The opening clock and view are restored
before the launcher reveals the game. Preparation shares the page's inactivity
and portrait gates, with a separate suspension flag so completing it cannot
undo a pause. The small version and FPS display comes from the compiled player
and completed game-camera render frames, updated at most twice per second;
inactive play reads Paused. Its tooltip shows the longest frame in the sample.

The page owns Escape and consumes both keyboard edges before Unity can queue
them. Trusted Resume and Back to floor actions request native pointer lock
directly, then resume the appropriate controller. Entering the forklift transfers
the existing lock without releasing it. Both controllers discard the initial
neutral captured frames, so moving the menu cursor cannot turn the game camera
on resume. Arbitrary pointer-lock changes do not open the pause menu.

The HTML wrapper owns fullscreen events and drawing-buffer sizing. Its
fullscreen notifications must not reach Unity's canvas-only fullscreen handler,
which otherwise corrupts render targets. Changes while paused apply when the
renderer resumes; CSS continues to fit the paused image to the window.

A 90-second Chrome trace of release v5 on this Windows workstation reproduced
stalls lasting up to 4.6 seconds during the opening. A second trace found the
matching stalls in WebGL shader-link status calls. The same trace confirmed
actual 2x multisampled buffers and no SMAA or FXAA shader. The v6 Chrome run
prepared its graphics in 23.23 seconds, then recorded 90.03 seconds of play,
including first forklift entry and X/mouse use. It had no long tasks, no frame
intervals over 50 ms and no blocking WebGL calls over 20 ms during play. The
largest interval was 20.8 ms; the 99th percentile was 14 ms. The trace confirmed
actual 2x multisampling and a compiled SMAA shader at 1800 by 1125 pixels on
this Windows workstation's RTX 3080. These are local measurements, not a
frame-rate guarantee for other computers.

The final v7 player was profiled twice for 90 seconds at the same 1800 by 1125
resolution on this RTX 3080 workstation, including first entry and native
X/mouse use. Both runs confirmed 2x MSAA and SMAA. The first took 27.68 seconds
to prepare graphics and recorded a 7 ms median and 14 ms 95th and 99th percentiles,
but also ten frames over 50 ms and eight long tasks, with a 333.3 ms maximum.
The stalls clustered around 4.9 to 6.3 seconds and 18 seconds; their cause was
not established. An isolated repeat prepared in 34.60 seconds and recorded a
7 ms median, 14 ms 95th percentile, 14.1 ms 99th percentile and 34.7 ms maximum,
with no frames over 50 ms or long tasks. Neither run had a blocking WebGL call
over 20 ms. These are machine-specific measurements.

`DemoActivity` gates the Unity player on tab visibility, window focus and stage
visibility. It calls `BrowserLifecycle.SetBrowserActive` to suspend simulation,
clear input and suspend audio, then pauses the engine's main loop. Resume reverses
that order. The build also exposes Unity's separate display refresh monitor so
the page can stop its animation callbacks during inactivity. Manual pause and
the portrait gate remain independent. Verify these
engine hooks against the generated player before publishing a new Unity version.
The loader downloads only after the player chooses to enter, reports progress,
and provides a retry if the download or initialization fails.

Run `node tools/test-one-shift-unity-browser.cjs` for the launcher's browser
checks with a simulated loader. After exporting the actual Unity player, run
`node tools/test-one-shift-unity-browser.cjs --real` to exercise the compiled
WebGL player. That pass reads the browser bridge's `ReportState` diagnostics,
checks the opening dawn, frame and clock suspension, zero paused animation
callbacks in a browser trace, walking, reset, forklift entry and driving,
braking, rear steering, camera switching, the first mouse-controlled unload and
setdown, stationary and released mouse input, see-through placement, driving pause recovery,
walking through the yard door and around the original truck, fullscreen,
and shader/runtime errors, and saves screenshots and console logs. Set
`SHIFT_TEST_URL=https://ethanwillingham.com/one-shift.html` to run the same real
checks against the deployed page. `SHIFT_DUMP` selects the report directory.
Both checks use Playwright; the real pass also uses Sharp to inspect rendered pixels.
`node tools/test-one-shift-front-office-browser.cjs` checks the compiled WebGL
player through native keyboard and mouse input. It covers the office doorway,
front door, ramp, parcel arrival, carrying, desk receipt, purchases, duplicate
protection, order acceptance/release, transaction conservation and pause, and saves
screenshots. `SHIFT_OFFICE_DUMP` selects its output directory;
`SHIFT_BROWSER_CHANNEL=chrome` selects installed Chrome.
`node tools/profile-one-shift-unity-browser.cjs` measures a separate 90-second
Chrome run without taking screenshots during the sample. Set `SHIFT_PROFILE_FORKS=1`
to include first entry and native Left Shift lever use, and `SHIFT_PROFILE_PLACEMENT_CAPTURE=1`
to capture fork placement after the timing sample. It records preparation time,
completed preparation stages, frame intervals, long tasks and blocking WebGL
calls. `SHIFT_PROFILE_DUMP` selects its output directory.
The real pass uses full Chromium with GPU rendering enabled and reports its actual
renderer. Its default device scale factor of two exercises Retina pixel sizing;
`SHIFT_TEST_DPR=1` selects an ordinary-density browser. Set
`SHIFT_BROWSER_CHANNEL=chrome` to use installed Chrome, including
on this Windows workstation. The console report retains Unity's known startup
internal-format probe warnings; shader failures and render-time GL errors fail
the check. It also identifies startup messages for three bundled shaders unused
by this compatibility-mode scene: CoreCopy, StencilDitherMaskSeed and HDRDebugView.
RenderGraph and runtime debug display remain disabled; revisit that classification
if those settings change.

The 25 October 2026 v6 release passed 64 checks against the compiled browser
player, including native mouse lifting, setdown, fork withdrawal, see-through
placement, the original truck's arrival and the walking route through the yard.
The launcher passed 40 checks, and six new PhysX checks cover stationary and
released mouse input, 30/60/120 Hz control, physical carrying and overload.
The earlier receiving release also passed 57 forklift physics and geometry
checks and thirteen delivery sequence checks. The four compressed v6 browser
files total 42,213,674 bytes. Browser verification used Windows Chrome at device
scale factor two; Mac hardware was not available.

The v9 career fixtures pass 12 stock and transaction cases, 18 pickup cases,
26 courier cases and camera transitions at 30, 60, 120 and 144 Hz. The pickup
fixtures include lifting from another carton and the complete collection route
with the production walking controller at 144 Hz and physics at 200 Hz. The
cargo van has 2.16 m of interior headroom so the player can step from its ramp
onto the deck without the roof blocking the controller's step clearance.
Courier regressions reproduce a shifted, tilted porch carton at both
5 ms and 20 ms physics steps. Placement raises freight clear of the stack before
lowering it, with measured overlap below 2 mm. These fixtures use explicit
setup for stock positions and equipment balances; they do not replace a native
first-order browser walkthrough.

The final v9 export completed with zero errors and totals 42,475,170 compressed
bytes. Its native career walkthrough completed 156 gameplay assertions: empty
start, camera entry and return, purchase, courier delivery, physical storage,
customer acceptance, three carried cartons loaded into the van, departure and
the $210 payment, then a second $160 purchase. The first shipment leaves $690;
the next four cartons reduce cash to $530 without duplicating stock or payment.
The final console scan was rechecked with the same bounded startup-warning
classification as the existing Sandbox harness. The original console remains
available in the local verification artifacts.
The career run recorded 60,921 active frames, a 27.9 ms maximum frame interval,
no intervals over 50 ms and no long tasks during approximately seven minutes
of play. The v9 Sandbox and office runs completed 74 and 43 checks, the
simulated-loader suite completed 112, and the final player passed 18 fullscreen
and display checks. These are local Windows Chrome checks.

A separate 90.04-second v9 Sandbox profile on the RTX 3080, including first
forklift entry, training and native hydraulic use, recorded a 7 ms median,
13.9 ms 95th percentile, 14 ms 99th percentile and 20.9 ms maximum. There were
no intervals over 50 ms, long tasks or blocking WebGL calls over 20 ms during
play. The drawing buffer was 1800 by 1125 with actual 2x MSAA and SMAA.
Startup took 31.71 seconds, with a 10.27-second longest interval between
preparation-view updates. This is a measurement of this workstation,
not a guarantee for other hardware.

The final v8 export completed with zero build errors and totals 42,367,999
compressed bytes. Its compiled Chrome gameplay pass completed all 73 functional
assertions, including physical pallet pickup, unloading, setdown and withdrawal.
That run exposed a final fullscreen render-target error. The shell fix then
passed a focused 18-check real-player fullscreen regression with no graphics or
page failures. The native office walkthrough passed 43 checks, including
purchases, order release, duplicate protection, parcel receipt and preservation
of camera yaw when closing menus. Editor checks include 14 business cases,
11 control cases, 21 driving cases, six mouse-lift cases, 1,202 collision-clear
truck route poses and 88 same-height surface comparisons across 19 slabs.
The actual player confirms three nearby 512-pixel fixture shadow slices and
nine distant 128-pixel slices in the unchanged 1024-pixel atlas.

The final shell passed 85 simulated-loader checks. A separate 90.04-second
Chrome profile of v8 at 1800 by 1125 pixels on the RTX 3080 included native first
entry, practical training and stationary-pointer hydraulic use. It measured a
7 ms median, 13.9 ms 95th percentile, 14 ms 99th percentile and 20.8 ms maximum,
with zero frames over 50 ms, long tasks or WebGL calls over 20 ms during play.
The trace confirmed actual 2x MSAA and SMAA. Startup took 29.98 seconds, with a
9.71-second longest gap between fine preparation callbacks; this remains real
graphics work, not simulated progress. Full lever travel lifted about 0.50 m/s
versus 0.052 m/s near 40 percent travel. These timings describe this workstation.

The final v7 export completed with zero build errors and totals 42,305,038
compressed bytes. Its native-input front-office walkthrough passed 22 checks,
and the launcher passed 40 simulated-loader checks. An earlier v7 export passed
the 64-check full gameplay suite before the final small rendering and HUD fixes;
that result does not cover the exact final export.

The earlier hands-on inventory business, version 3.4, is preserved at
`one-shift-classic.html`. Its scripts, local save keys and assets remain intact;
the Unity warehouse does not read or change those saves. Browser regression
fixtures for the illustrated game target that legacy URL. Existing `#layout=`
links at the original URL redirect to the illustrated game with the layout intact.
Its model is documented
below. The Unity project has its own scene and build documentation in
`unity/OneShiftRackLab/README.md` and `WAREHOUSE_ENVIRONMENT.md`.

## Illustrated game

Read [the building and office model](ONE_SHIFT_PLACES.md) for its time-card
entrance, central floor, seated desk, purchase orders and environmental audio.
The public CSS and script query version is `v37`. Its entrance, central floor
and raised office use connected warehouse architecture and object contours for
interaction. The clock and desk remain visible beneath transparent targets.
Read [the inventory aisles](ONE_SHIFT_INVENTORY.md) for the four-aisle view,
two-position bays, four browsable levels, numbered rack destinations, visible
rows behind the current rack, stable rack addresses and stock controls.

The player now performs every handling step directly. Read
[the direct handling model](ONE_SHIFT_HANDLING.md) for the current controls,
rules, source modules, save migration and checks. This supersedes the earlier
automatic worker behavior documented below. There is no autonomous handling
or worker travel in public play.

The player scans and unloads each pallet, lifts it onto a jack and chooses its
rack. For orders, the player takes an empty pallet, picks each case, sets it in
Shipping, holds to wrap, applies a label, calls the truck, loads and releases it.
Waiting never completes those steps. The eye-level print art remains the target.

## Earlier automated model (historical)

Start at the receiving dock with six pallets of owned stock and $200. Hover or
tap a front pallet, select it, and scan its label. Each accepted pallet clears
from the illustrated trailer, exposing the loads behind it. After all six,
return to the warehouse so the worker can unload into Receiving and put the
stock in the racks. Every scene uses standing eye-level charcoal, rust and cream print art.
There is no playable top-down view.
Customer orders arrive through the day.
Queue shipments, buy replenishment stock, and reinvest in handling equipment,
rack space, doors, and people. The receiving scene has no tutorial dialog.

The owner explicitly replaced the service warehouse direction on October 5, 2026.
The new business owns its inventory. Former client contracts, receipt paperwork,
unit packing, kitting, and service fees are retained for old saves and regression
fixtures, rather than offered in the public business interface.

Read [the design rationale](ONE_SHIFT_DESIGN.md) for the research, intended
experience, choices, pacing, and limits of automated playtesting.
Read [the warehouse process](ONE_SHIFT_PROCESS.md) for the receiving, putaway,
picking, staging and dispatch sequence.

## Source

Classic scripts under `js/one-shift-*.js` share `OneShift`. No bundle step.
`one-shift-commerce.js` extends the DOM-free physical simulation with customer
orders, stock purchasing, ownership costs, cash accounting, milestones, and
validated saves. `one-shift-business-ui.js` supplies the compact public interface.
The data, pathing, physical work, truck safety, renderer, sound, and input remain
shared with the legacy model. Always bump every game CSS/script query together.
Keep the post in In Progress on `archive.html`.

`one-shift-receiving.js` adds the DOM-free manual receipt model after commerce.
`one-shift-receiving-ui.js` and `one-shift-receiving.css` provide the integrated
illustrated dock. The public boot opts into manual receiving and moves the six
existing starting pallets into an opening trailer, preserving their IDs, lots,
case counts and cost basis. Explicit debug fixtures and legacy modes retain
the original stocked start. Read [the receiving art guide](ONE_SHIFT_RECEIVING_ART.md)
before generating or changing receiving imagery.

`new OneShift.Sim(seed, 'business')` creates the public model. The default boot
uses business mode. Explicit `normal`, `sandbox`, and other former modes retain
compatibility. The debug API's `newGame()` default deliberately remains normal
for existing physical regression fixtures; pass `business` to exercise this game.

## Business rules

- Initial inventory: 40 stove cases, 40 lantern cases, 24 chair cases. The stock
  has costs, lots, dates, labels, and physical pallet IDs. The public opening
  places these same cases in a docked trailer for receiving.
  Initial stock and racks are starting capital, not free recurring income.
- Customer requests arrive individually. Five requests teach the first day.
  Later demand rotates among available products, includes mixed orders and rush
  requests, and grows to twelve requests as completed orders increase.
  The stock board shows remaining demand, ready cases, incoming cases, and space.
- Prepare order reserves specific source quantities. Several orders can reserve
  different cases in one source pallet. Reserved cases cannot be sold twice.
  Workers collect all lots for an item into one shipment pallet, preserving
  actual case counts and cost basis. They collect an empty shipping pallet, pick
  at each source rack, then stage, wrap, and load. Truck arrival begins after the
  shipment is ready, keeping the
  dock available to suppliers during picking. There is no teleport fulfillment.
- Orders stay on a real high-level queue. Up and Down change which order is
  planned next. Current work finishes safely. Cancel returns unshipped collected
  cases to available stock and releases every source claim. Loaded orders finish
  rather than being refunded. Expired commitments can earn a discounted partial
  sale; unfilled requests do not create cash or chargeback fines.
- The first decision holds the clock while animation ticks continue. After
  queuing it, time runs. The first day's deadlines are longer. Pause is always
  available for planning. Next order and Finish shift advance real simulation
  ticks, including outstanding work and truck clearance.
- Purchases come in 8, 16, or 32 cases. Small shipments are quicker but cost more
  per case. Bulk stock has a discount and a longer lead time. Every delivery costs
  $6 and reserves enough rack positions before charging. A small credit line can
  cover stock purchases; its use is shown in the quote. Equipment and hiring need
  cash. Paid late deliveries carry to the next shift, rather than disappearing.
- Receiving requires an accepted scan in the public game. Each scan reserves
  one reachable rack position and records its actual pallet barcode, lot and
  count exactly once. It never adds inventory or pays a receiving fee. Front
  rows must be scanned first. The dock view holds the business clock while the
  player scans; physical handling resumes after returning to the warehouse.
  Accepted sprites disappear from the scan view. On returning to the floor,
  workers unload into Receiving, then carry each pallet to its reserved rack.
  The receiving board distinguishes these stages. Cases only become saleable
  after putaway. Rack reservations follow pallets through staging and carrying,
  including after the supplier trailer leaves.
  Workers with a hand jack
  use lower positions; the player and drivers can use upper stock after forklift
  ownership and training. Full racks block new purchasing until stock ships or
  capacity grows. Receiving and Shipping are staging areas. Bare floor is never
  a storage destination.
- Surplus can be sold back to a supplier at 70% of cost. The worker picks and loads
  it like other freight. Buybacks release space and return some cash, while losing
  money on that stock. They do not unlock products or count as customer orders.
- Sales pay when the loaded truck releases, once. Receiving, storage, and old
  handling fees never pay for owned inventory. Reports distinguish cash flow from
  operating profit: stock purchasing reduces cash immediately, while cost of sold
  stock reduces profit at sale. Freight, packaging, rent, wages, interest, and
  forklift power are expenses. Equipment is a capital purchase. Evening purchases
  update the report's closing cash without treating inventory as an immediate loss.
- Eight fulfilled orders unlock radios; twenty unlock notebooks. Service quality
  modestly affects later quotes. Fifty fulfilled orders and $3,000 net worth mark
  an established warehouse; the same business continues afterward. The shop offers
  only implemented capacity and handling upgrades. Racks are available at the
  start. Cart and wrap stand unlock at three orders, walkie and training at five,
  forklift, upper racks and another door at eight, wrapper and expansion at twelve. Faster movement, faster picking,
  wrapping, a second door, upper racks, expansion, and staff change actual work.

The fixed 20 Hz simulation advances 1.37 game minutes per real second. A business
shift starts at 8 AM and closes at 5 PM, roughly 6.6 minutes at 1x or 2.2 at 3x,
plus any safe closing work. Tiles represent four feet. The starting building is
64 by 64 feet, with one east dock door. The business starts with four rack bays
and separate four-row staging areas. An expansion adds 32 feet of depth, enlarges
staging, and opens room for more racks and doors. Older saves keep their dimensions.
Workers use cached A* paths. They still do
not yield to one another, and forklifts remain worker equipment rather than a
scarce vehicle pool. Construction is immediate. These are current abstractions.

## Presentation and persistence

The whole game uses charcoal, muted rust and warm cream print art, with local
Century Supra, Segoe UI, and Commit Mono fonts. The public camera is always at
standing eye level. Receiving floor, Storage aisle and Shipping floor are layered
image scenes with visible, selectable pallets. A paper order board sits beside
the artwork. Store, reports and settings use the same paper and ink controls.

`one-shift-scenes-model.js` projects the physical simulation into scene pages
without changing stock. `one-shift-scenes-ui.js` composites generated backgrounds
and the approved alpha pallet layers, with native keyboard targets, silhouette
hover and touch selection. `one-shift-scenes.css` supplies the scene layout.
The four-foot grid remains only in the hidden routing and reservation model.
No map, floor cursor or zoom controls are offered. Inventory's Up and Down
controls pan between its four rack levels.

The owner-approved receiving view uses image-generated charcoal, muted rust and
cream screen-print artwork. Two registered empty dock backgrounds and four
transparent cargo sprites form the scene. Dock appearance stays fixed, trailer
interiors and pallet variants follow stable shipment IDs, and only actual
manifest pallets are drawn. Hover highlights follow the alpha silhouette.
The barcode and all label text are drawn from real game data. Mouse, keyboard
and landscape touch support the same select, scan and clear loop. Pause,
portrait gating, and page inactivity stop scan progress independently.

Receive stock in the header, or click a docked supplier truck, to reopen the
scene for later paid deliveries. Partial scans survive explicit save/load.
Closing the dock early cancels only an unfinished scan. Accepted loads remain
queued for unloading and putaway; unscanned loads wait. A second dock can keep receiving while
another door has an unscanned load. Overnight carry keeps remaining freight
without moving already stored pallets.

While opening stock moves through Receiving, the board shows its unloading and
putaway progress. After stock reaches the racks, the board shows one order, its
quantity and payout, and Prepare order.
The clock holds for this decision. The source rack is highlighted, and after
preparation starts a Worker label and Pick, Stage, Load stages explain the real
movement. Picking, carrying, packing, truck arrival, and loading have live
statuses, including gaps between tasks. The first sale takes about 30 seconds
at 1x. Payment does not imply the departing truck has already cleared the dock.

The first paid sale reveals Store, speed controls, and the Orders, Stock, and
Worker tabs. A receipt leads to Buy stock, with the relevant product first in
the stock board. The ordinary opening stays below 35 words on the board, with
no duplicate heading, tutorial dialog, goal meter, or planning controls.
Imported no-sale businesses with mixed demand or unavailable stock use the
normal board and buying controls; they are never trapped in the first lesson.
Their clock runs so a needed supplier can arrive.

Store and Menu are centered with consistent buttons. Secondary settings and
stock details stay collapsed. Daily totals appear automatically at closing.
Later equipment and products stay gray until their order milestones; Team needs
a forklift. There are no Results or Home buttons. Capacity purchases place a rack in a
reachable free position without opening a map editor.

Scene navigation changes the view without pausing work. Click or tap a pallet
to inspect its product, cases, lot and physical status. Tab and Enter operate
native targets. Space pauses; M opens Menu. Landscape touch uses the same scenes
with scrolling and 44px controls. Portrait freezes behind the rotate screen
without changing manual pause. Hidden tabs and inactive windows stop scheduling.

Trucks and workers still complete real travel, staging and safe dock clearance
in the simulation. Scene pages show their current work and actual stock, rather
than a moving overhead representation. Cases become available after putaway;
loaded freight leaves stock and payment is recorded only on truck release.

Every browser load starts fresh, including history returns. Manual Menu save/load,
three slots, import/export, and evening autosave remain available. Preferences
survive. Old saves retain their model and geometry. Business imports additionally
validate order lines, quantities, source claims, grouped work, ownership costs,
receipts, the order queue, and demand data. All physical cases and cash must reconcile.

## Checks

Use Node. Browser checks require Playwright in `NODE_PATH`.

- `node tools/test-one-shift-receiving.cjs`: opening capital conservation,
  row access, duplicate rejection, rack reservations, partial saves, full racks,
  staged putaway, receiving-floor capacity, two-worker slot reservations, paid
  stock, overnight carry, old in-transit save migration, multiple docks and
  malformed receipt imports.
- `node tools/test-one-shift-receiving-browser.cjs`: actual hover and click,
  keyboard and touch scanning, pause, explicit save/load, all six disappearing
  loads, physical staging and putaway, the first sale, supplier replenishment,
  receiving header layouts, Menu New game, landscape, large text, narrow desktop
  and portrait gating. Uses bundled Playwright
  Chromium, with an optional `SHIFT_CHROME` executable override. `SHIFT_URL`
  targets a deployed page; `SHIFT_DUMP` selects the screenshot directory.

- `node tools/test-one-shift-business.cjs`: real shipments, receipts, lead times,
  cash and profit, reservations, grouped picks, empty-pallet collection, picking
  at each rack, physical cancellation returns, surplus, full space,
  overnight supply, saves, invalid imports, and multi-day reinvestment.
- `node tools/test-one-shift-business-balance.cjs`: 20 seeds, 24 days, two ordinary
  buying policies, 960 shifts. Validates every shift and compares reinvestment
  against reactive restocking. Writes a source-hashed result.
- `node tools/test-one-shift-scenes.cjs`: scene classification, actual stock,
  pagination, rack purchases and conservation through receiving and dispatch.
- `node tools/test-one-shift-scenes-browser.cjs`: eye-level scene navigation,
  pallet inspection, storage-to-shipping work, saves, capacity purchases,
  desktop and landscape touch, large text and portrait gating. The historical
  opening and business browser suites assert the removed map interface and
  are retained only as historical fixtures, not current visual acceptance.
- `node tools/test-one-shift.cjs`: shared physical simulation, conservation,
  label checksums, recipes, ownership, routes, reservations, cancellations,
  forklift prerequisites, rack-only destinations, layouts, and legacy migrations.
- `node tools/test-one-shift-browser.cjs`, `test-one-shift-queue.cjs`,
  `test-one-shift-motion.cjs`, and `test-one-shift-intro.cjs`: explicit legacy
  fixtures preserve manual floor work, native controls, readable labels, truck
  safety, responsive behavior, and older beginner/save compatibility.
- `node tools/test-one-shift-pathing.cjs`: randomized racks and route checks.
- `node tools/test-one-shift-economy.cjs`: former client-service economy, not the
  business game's balance. Retained as a shared-model regression.

The receiving and business browser harnesses use Playwright's test Chromium by
default and accept `SHIFT_CHROME` for a dedicated test executable. Older legacy
harnesses name `/Users/ethan/.local/bin/agent-chrome-for-testing`. Harnesses close
their exact browser in `finally`. Never launch personal Chrome headlessly.
Automated policies establish reproducible behavior and solvency, not human enjoyment.
The browser scenarios prove that native controls work, not that every new player
will understand or enjoy the game. Human feedback should drive further tuning.
