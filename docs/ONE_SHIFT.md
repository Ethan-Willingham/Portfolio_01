# The Warehouse Simulator

`one-shift.html` now opens Receiving practice. The owner's 2026-11-03 direction
makes each lesson a playable first-person warehouse, reached through an immediate
"What would you like to do?" opening and an Inbound choice. Walk to the delivery,
handle cartons and scan their labels, then use receiving software on the TC22
or office computer. Plain instructions guide people unfamiliar with computers.
The original Warehouse Simulator launcher,
formerly One Shift, remains available at `one-shift.html?view=warehouse`; its
two-carton receiving and putaway briefing is
`one-shift.html?mode=demo&demo=receive`.

The retained Unity launcher offers Start business, Sandbox, Customer demos and a
separate control guide. Its HTML interface supplies the clock, contextual
interactions, pause menu, hydraulic slider and office computer. The old grey
debug panels and floating black pallet labels are absent from the playable scene.
The build is produced by **One Shift > Build browser player** in
`unity/OneShiftRackLab`, or `OneShift.RackLab.WarehouseWebBuilder.BuildWeb()`.
It stages the browser player locally, then copies the four verified build files
to `assets/one-shift-unity/Build/OneShiftWeb.*`. Gzip decompression fallback uses
`.unityweb` data, framework and WebAssembly files on GitHub Pages. The loader
keeps its `.loader.js` extension. Bump the launcher CSS/script query versions and
the build versions in `js/one-shift-unity.js`,
`js/one-shift-inbound-warehouse.js` and `BrowserLifecycle.BuildVersion`
whenever the published build changes.

## Current v15: playable receiving in the warehouse

The default path is Home > Inbound > a receiving method. Mobile purchase-order
receiving has basic, lot-number, serial-number, expiration-date and partial-delivery
examples. ASN container receiving, web receiving and purchase-order completion
are separate examples. Each selected example opens the playable 3D warehouse
with its actual delivered unit count and labels. A small contextual guide gives
one next instruction and the current quantities. Receiving screens open on
demand through the handheld or office computer. Buttons are large, keyboard
focus is visible, feedback includes words, and there is no timer. Returning to
the menus keeps practice records while the page is open; Start again confirms
before clearing that example. The warehouse stays loaded while changing examples.
Gameplay requires a keyboard and mouse. Coarse-pointer portrait views show the
rotation gate and suspend interaction; returning to landscape preserves manual
pause.

WASD or arrow keys walk, and the mouse looks around after Start playing captures
it. Hold E to carry a carton; releasing E sets it down. Holding left mouse also
carries while the scanner is stowed. Right mouse rotates a held carton. Q equips
or stows the TC22. Hold left mouse to aim its imager and scan a visible barcode;
F takes a single scan. Right click or Tab opens the handheld software. Web
receiving requires walking to the glass office, aiming at the monitor and
pressing E. H opens the guide and Escape opens the menu. A first click that
captures the mouse does not also scan. Device screens release pointer capture;
returning to the floor reacquires it through a deliberate user action.

These are simplified practice screens following the linked Endpoint Cloud
articles, not an exact reproduction of the company's interface. All goods,
orders, labels and receiving bins are fictional fixtures. Quantities are whole
units (`EA`), and every example vendor disallows over-receiving. The partial
delivery contains three units against six ordered; the web example contains
three good units and one damaged unit. There is no company API connection,
company inventory write, export, authentication or persistence. The integration selector
only demonstrates the documented completion status. Refreshing the page clears
the practice sessions.

### Source and runtime boundaries

- `one-shift.html` contains the immediately visible splash and the hidden Unity
  shell. `one-shift-inbound.css` uses the existing One Shift charcoal, rust and
  cream exception with local Segoe UI. It does not restyle the shared site.
- `js/one-shift-entry.js` selects the runtime. The default loads only
  `js/one-shift-inbound-model.js` and `js/one-shift-inbound.js` for the opening
  menus. Selecting a lesson loads `js/demo-activity.js` and
  `js/one-shift-inbound-warehouse.js`, then the shared Unity build. Opening a
  lesson URL directly requires its Play this lesson action. Any `mode` query,
  or `view=warehouse`, opens the retained game launcher instead. The splash does
  not request the old warehouse cover or compiled player.
- `js/one-shift-inbound-model.js` owns the eight fixtures, receipts, inventory,
  journal and order status. Its browser export is `InboundPracticeModel`; Node
  uses the same module. `create`, `setLocation`, `selectContainer`, `receive`,
  `complete` and `undoLast` are the transaction boundary.
- `js/one-shift-inbound.js` renders hash routes (`#inbound`, `#mobile` and
  `#practice/<id>`) and keeps each example's state in memory. It provides the
  playable scene, current objective, device dialogs, labeled forms, result
  tables, source links, guide and restart confirmation. No browser storage or
  network writes are used by this practice runtime.
- `js/one-shift-inbound-warehouse.js` is the dedicated receiving Unity host. It
  does not load the original game's HUD or WMS browser interface. It retains one
  player instance, mounts it as the selected lesson's main view, and parks it on
  menu screens. It owns pointer capture and the handheld interface. The native
  office camera transition continues until the computer opens. `DemoActivity`
  stops frame scheduling on inactivity; manual pause, dialogs and the mobile
  orientation gate are independent. Each gate clears held input. Controls wait
  for graphics preparation and acknowledgement of the current receipt snapshot.
- `WarehouseInboundPractice.cs` is an isolated native scene adapter, selected as
  mode 5 by `BrowserLoop.jslib` from `window.OneShiftShell.lesson`. It reads
  `initialInboundState` before graphics preparation and creates exactly the
  delivered units in REC-02, each representing one `EA`. It suppresses the old
  pallet, parcel, business and forklift simulations and creates no
  `WarehouseWmsRuntime` or second inventory ledger. It retains the walking
  controller, physical carton grabber, office camera and TC22 scanner.

The browser model is the receiving authority. `inbound-setup` explicitly replaces
the native fixture; `inbound-sync` only updates the recorded-status labels and
colors of the same physical units. Neither action silently transfers stock to
another location. Explicit setup reseeds the selected example; ordinary receipt,
Undo and completion actions preserve the physical bodies and their positions.
Before posting a receipt, the browser requests a fresh `inbound-report` and
requires every delivered unit to be settled in REC-02 with nothing held. The
native adapter independently checks newly recorded units against their actual
supported placement, as well as receipt quantities, tracking values and the
REC-02 location. `InboundWarehouse.onSceneSynced` includes the lesson, sync
version, delivered/good/damaged/waiting counts, physical unit count, placement
and held state, and unit scan codes with viewport positions. Old snapshots
cannot replace newer state. The UI remains gated until its current sync version
is acknowledged.

The physical TC22 decodes visible Code128 labels through the scanner's range,
orientation and occlusion checks, then calls `InboundWarehouse.onScan(code)`.
The browser interprets that code for the current guided step and validates any
receipt. A mouse click on a carton is not a substitute for scanning its label.
ASN has five inner units and a labelled outer container; serial units have
distinct labels. The web example visibly distinguishes its damaged unit. The
player can carry cartons, but moving one does not change its inventory record.
The record likewise never moves a carton. There is no automatic unloading,
putaway or scripted carton transport in this receiving mode.

The v15 source selects this dedicated playable mode. The original game modes retain their v13
carton ledger, keyboard and mouse controls, landscape gate, independent
activity/manual pause and all three demonstration scenarios. Their two-carton
receiving walkthrough still includes physical putaway and is separate from these
new receiving lessons. The earlier illustrated game remains separate from both.

### Receiving contracts

Mobile PO practice follows Receiving > assigned PO > Receive Detail > Receive
Item Detail. Basic receipt records a quantity. Lot and date examples also require
the value on the delivered label. Each valid serial scan records one unit, and
duplicate or unknown serials are rejected. Receipt changes the order to
`Receiving`; receiving the final unit does not silently complete it. Partial
receipts preserve the outstanding amount and offer a path to leave the order open.

ASN practice follows Receive Inventory, an assigned container scan, review and
OK. Looking up the container posts no stock. OK receives every manifest line in
one transaction, retaining its tracking values. The linked article documents
receiving-bin overrides; this physical fixture uses REC-02 throughout. The same
container cannot post twice. ASN receiving is not offered on the web path.

Web practice opens at the physical office monitor using E, then follows Process
Receipt, PO Number and GO. It requires a manually
selected Bin Number, then separate Add Qty Recv'd and Add Qty Damaged values.
COMMIT TRANSACTIONS records good stock in REC-02 and damaged stock under the
`DAMAGE` condition/location in the practice record. Both counts reduce the
outstanding order quantity. The fixture rejects attempts to classify its damaged
unit as good stock. Committing does not remove the red damaged unit from the
dock; this lesson does not perform subsequent physical removal or putaway.

Completing a PO requires an explicit confirmation and never receives missing
units. Without an external integration, completion gives `Receiving Complete`.
For the integrated example it gives `Unassigned`, with export and closure in the
external system still outstanding. Completed practice orders reject further
receipts and Undo. The dedicated completion example starts with all four units
already received. The closing article's table says "Pick Detail" while its
narrative says "Receive Detail"; the practice follows the receiving narrative.

Undo is a training-only correction of the last receipt. It reverses that receipt's
inventory and adds a reversal to the journal; an ASN reverses as one container.
It does not export anything, move cartons or model every production Undo
restriction. Invalid input leaves the record unchanged. Received good plus
damaged plus outstanding must equal ordered; recorded inventory and the net
journal quantities must equal received good plus damaged.

### Knowledge-base map

The owner supplied these articles for the 2026-11-03 implementation:

| Article | Practice scope |
| --- | --- |
| [Receiving Types](https://endpoint.my.site.com/supportportal/s/article/Receiving-Types) | PO and ASN method selection; mobile versus web availability. |
| [Inbound Overview](https://endpoint.my.site.com/supportportal/s/article/Inbound-Overview) | Receiving context and the opening help link. |
| [Receive Items on Mobile](https://endpoint.my.site.com/supportportal/s/article/Receive-Items-on-Mobile) | Assigned PO, item detail, quantity and tracking values. |
| [Receive Purchase Orders with Advanced Ship Notices (ASNs)](https://endpoint.my.site.com/supportportal/s/article/Receive-Purchase-Orders-with-Advanced-Ship-Notices-ASNs) | Container lookup and manifest receipt. The source supports bin override; this fixture stays at REC-02. |
| [Close Purchase Orders from Mobile](https://endpoint.my.site.com/supportportal/s/article/Close-Purchase-Orders-from-Mobile) | Explicit completion and the two integration-dependent statuses. |
| [Receiving on the Web](https://endpoint.my.site.com/supportportal/s/article/Receiving-on-the-Web) | Process Receipt, manual bin selection, good/damaged quantities and commit. |

### v15 checks and limits

Run `node tools/test-one-shift-inbound-model.cjs` for fixture isolation,
quantities, tracking values, duplicate serials, atomic ASN receipt, bin selection,
damage, conservation, Undo and completion. Run
`node tools/test-one-shift-inbound-host.cjs` for current acknowledgement and
graphics readiness, stale acknowledgements, first-click pointer capture,
capture rejection and retry, scanner trigger release, the F scan shortcut, device inspection,
office transitions, fresh physical receipt preflight, Escape handling, player
reuse and loading failures. These host tests use small DOM and Unity stubs;
they do not prove that the exported game's controls or rendered labels work.

Run `node tools/test-one-shift-inbound-browser.cjs` for the exported player in
Chrome. It uses actual mouse, keyboard and page controls, observing the native
HUD without injecting scans, transforms or transactions. Reports and screenshots
are written to `research/receiving-v15-browser` by default; `SHIFT_INBOUND_DUMP`
can select another output directory.

`WarehouseInboundPracticeValidation.ValidateAndSave()` exercises the native
adapter in a disposable preview of RackFloor. Its report is
`Assets/RackLab/Reports/inbound-practice-validation.json`. Verify exact fixture
counts and codes, movement and physical handling, receipt/Undo body conservation,
supported placement, and rejection of conflicting tracking, serial, bin,
quantity or stale snapshots. Keep validation results tied to the exact source
and exported build being tested.

For batch work, run `ValidateAndSave()`, verify the report's `passed` field, exit
that Editor process, then run `WarehouseWebBuilder.BuildWeb()` in a fresh one.
The combined `ValidateAndBuild()` entry point also rejects a failed report;
separate processes are recommended for batch validation and export. Validation
does not save changes to the authored scene.

Verify the actual exported browser player after native changes: walk and look,
carry and release cartons, scan real visible labels, use the handheld, walk to
the office and return, and complete every receiving path. Check rejection while
holding a carton or leaving one outside REC-02, followed by successful receipt
after supported placement. Also check lesson switching without another download,
receipt/scene acknowledgement, pointer-lock retry, pause/activity/orientation
gates and narrow landscape layout. Keyboard and mouse are required; a portrait
gate is not evidence of touch play support. Bump the
entry, model, interface, host and CSS query versions when changing those files;
native adapter or bridge changes also require a versioned Unity export.

The 2026-11-03 v15 export passed all 83 native checks, 20 receiving-model checks
and 17 host checks. Unity produced 42,790,835 compressed bytes with zero build
errors. The native report covers all eight fixtures, actual Code128 ray queries,
force-based carrying, receipt rejection for held or displaced freight, and
unchanged physical bodies through receipt and Undo.
The Chrome walkthrough passed 47 checks across all eight receiving paths in one
player instance: movement, carrying, physical scans, mobile tracking values,
duplicate serial rejection, ASN receipt, partial orders, office receiving and
return, explicit completion, and Escape pause. No browser errors or gameplay
shader failures were reported. Screenshots and the report are retained in
`research/receiving-v15-browser`.

Mouse capture must be supported by the browser. The embedded in-app browser
rejected capture during v15 testing with a Chromium error; the same exported
player accepted capture and real game input in Chrome. Failed capture offers
a retry and instructions to open the page in Chrome or Edge.

### Historical v14 verification

The previous fixed-camera receiving version passed 20 model checks, nine stubbed
host lifecycle checks and 68 native adapter checks. Native checks covered exact
unit counts, printed codes, fixed-camera sightlines, unchanged body identities
and positions through receipt/Undo, and conflicting or stale snapshots. Its
browser export had zero build errors and 42,788,552 compressed bytes.

The v14 browser checks covered all eight lessons and their native receipt counts.
Basic, lot, serial and ASN used clicks on physical cartons or the container.
They covered over-receiving, duplicate serials, Undo, manual web-bin selection,
three good units plus one damaged unit, partial remaining quantities and explicit
integrated completion. One player/loader served every lesson. Pause/resume,
Help and return, 844 by 390 landscape, 390 by 844 narrow desktop and offscreen
rendering gates were checked. The retained receiving/putaway demo booted with
its guide and scanner, and both hosts had no browser console errors. Those
results describe v14; they do not validate v15 walking, scanning, handling or
device transitions. The original game's checks below describe their named
historical releases.

## Unity v13: a readable warehouse and a first electronic stock record

The customer-facing demonstration keeps the five real floor tasks but explains
them in everyday terms. Supplier orders are purchase orders; customer orders are
sales orders. Product names lead each inventory row, with short product codes
beside them. Location descriptions explain row, bay, level and left/right position
while the exact printed scan addresses remain unchanged. The office overview
offers one next useful action based on actual stock and order state. In a guided
demo that action follows the current walkthrough. Expandable explanations cover
the move from paper records and how to read a shelf address. Every quantity remains
a whole sealed carton, and the ledger still owns every transaction.

All modes open at 9 a.m. The sky travels smoothly to 4 p.m. over thirty real
minutes, then returns over thirty minutes, without a night phase or an abrupt
reset. Pause and browser inactivity still stop time independently. More indirect
fill keeps shaded carton faces readable. The saved environment reflection and
disabled local probe retain the v12 flicker repair. Browser rendering uses 4x
MSAA with SMAA; no lights or shadow maps were added.

The five main rack rows are grouped against the side walls, with an eleven-metre
central loading space. Right-hand rows face inward. The three floor-storage zones
are gone. Two copies of the original compact rack model sit along the forklift
wall, with twelve labelled shelf positions. Career starts with these shelves empty.
Sandbox has 106 total locations, 102 storage locations, 100 owned cartons and two
expected cartons. Ninety main-rack locations and ten compact-shelf locations hold
the opening stock; two small slots are deliberately empty. Sandbox forklift entry
skips the practical introduction. Career still requires it.

Large signs use matte charcoal panels, cream legends and restrained mounting and
border details. Carton and location labels stay plain, with higher-resolution
type and less luminous paper. Office blinds now have thin angled slats, headrails
and cords; the door pull mounts on its solid latch stile. A few desk and wall
essentials keep the single-computer office simple.

The TC22 projects a flat horizontal red stripe onto nearby surfaces while held.
It stops at occluders and splits across disconnected faces. The screen and LED
show scanning, accepted and rejected results, so sound is optional. A held label
still reads once; an empty hold reports once and can then acquire a real label.

Integrated Editor checks pass 46 world assertions, nine runtime scenarios and
19 demonstration assertions. The browser UI contract passes 42 checks.
Native Chrome checks pass 29 transfer checks, 69 receiving/putaway checks and
64 picking/shipping checks, including held-scan feedback and one offsite payment.
The Sandbox/office walkthrough passes 25 checks, including immediate forklift
driving, inward-facing rack scans and returning from the computer. It was rerun
on the final export, with the darker label ink and clearer physical device text.
The build has zero errors and 42,778,788 compressed bytes. A 24-second populated
Sandbox pan measured 7 ms median, 14 ms p95 and 27.7 ms maximum browser presentation
intervals, with no long tasks on this Windows workstation. This is a short
presentation sample, not GPU timing or a guarantee for other hardware. Entry points are
`tools/test-one-shift-v13-browser.cjs`, `tools/test-one-shift-demos-browser.cjs`
and `tools/test-one-shift-wms-ui.cjs`.

## v12: scanner presentation and customer demonstrations

The title screen has three modes: Start business, Sandbox and Customer demos.
The demonstration gallery describes the work, prepared documents and outcome
before loading Unity. Receiving starts with two expected cartons in REC-02 and
finishes after receipt and rack putaway. Transfer moves one carton between two
low rack bins. Pick, stage and ship starts with one allocated customer carton;
it finishes only after physical van loading and the offsite shipment callback.
Demonstrations open at 9 a.m. and use isolated session state. Their office console
remains inspectable, while unrelated purchases, order changes and upgrades are
disabled. There is no automatic worker or scripted stock completion.

`WarehouseWmsDemonstration` observes the normal workflow, physical placement and
ledger. Its snapshot supplies one current instruction, confirmed milestones and
a camera-projected location target. The shipping route leaves turning clearance
before the office doorway. H opens the guide; it pauses separately from
browser inactivity. Completion presents the actual result and offers another
scenario or continued exploration. Restarting opens a fresh page. A one-use,
short-lived session flag carries an explicit Start click across that reset;
visiting a demo URL by itself still requires clicking Start.

The TC22 uses original geometry based on Zebra's TC22 proportions and SE4710
red aiming-dot configuration. It floats without a hand. Hold left mouse to tilt
the top exit window toward the target and keep the red beam and surface dot on.
The ray stops at the nearest physical surface. Stable new labels decode once per
held acquisition; keeping the same barcode under the aimer does not repeat the
transaction. Release, stow, inspection, carrying, pause and focus loss cancel
the trigger. Right click inspects the live screen, Q equips or stows it, and F
remains a single-scan alternate. No additional lights are used for the aimer.

Rack tickets now sit on the actual beam face inside its 130 mm height, retaining
Code128 quiet zones and matching scan colliders. Row end markers, beam-mounted
bay IDs and receiving/staging signs use a consistent hierarchy. Labels retain
ordinary depth tests without distance visibility toggles.

The office comparison found a browser-only brightness jump, with unchanged
fixture intensities and shadow tiers. Fixed-camera isolation ruled out the
32-light camera limit and recovered normal wall detail with the live reflection
path disabled. The release uses a saved environment reflection with the local
probe disabled; direct sun, shadows,
ambient daylight and the two office fills remain dynamic. Painted concrete has
matte highlights, and diffuser faces use a steady unlit material. The saved
reflection does not track moving cartons or vehicles.

The three native Chrome walkthroughs passed: receiving and putaway (60 checks),
transfer (23), and picking through actual offsite shipment (58). They use real
mouse/keyboard controls and read-only state observation. The isolated Editor
scenario checks passed 19 assertions, and warehouse world checks passed 39.
Title/gallery layout and keyboard checks passed 28 at 1280 by 720 and 900 by 600.
The final 42,669,123-byte browser export has zero build errors. Seven stationary
morning captures and eight office-entry poses preserve wall and desk detail
without the previous brightness jump. Returning from the office computer restores
pointer capture with no browser or active shader errors. Entry points are
`WarehouseOfficeLightingRepair.Install()`,
`WarehouseWmsWorldValidation.ValidateAndSave()`,
`WarehouseWmsDemonstrationValidation.ValidateAndSave()`, and the browser checks
`tools/test-one-shift-demos-ui.cjs`, `tools/test-one-shift-demos-browser.cjs` and
`tools/test-one-shift-office-lighting.cjs`. Close the Editor before browser work
and run one Unity rendering workload at a time.

## v11: handheld controls and warehouse layout

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
