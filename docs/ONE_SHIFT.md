# One Shift

The warehouse at `one-shift.html` has a click-to-load Unity browser launcher.
The build is produced by **One Shift > Build browser player** in
`unity/OneShiftRackLab`, or `OneShift.RackLab.WarehouseWebBuilder.BuildWeb()`.
It stages the browser player locally, then copies the four verified build files
to `assets/one-shift-unity/Build/OneShiftWeb.*`. Gzip decompression fallback uses
`.unityweb` data, framework and WebAssembly files on GitHub Pages. The loader
keeps its `.loader.js` extension. Bump the launcher CSS/script query versions and
the build version in `js/one-shift-unity.js` and `BrowserLifecycle.BuildVersion`
whenever the published build changes.

The Unity start has three empty rack bays against the west wall, a clear working
floor, a receiving door in the north wall and a parking lot outside. A separate
yard doorway leads onto the access ramp, so parked trailer doors cannot block
the walking route. The first
delivery reverses into the dock, parks, then opens its trailer doors. The raised
warehouse shutter lets the player watch; a dock barrier remains closed until
the trailer doors are fully open and the dock plate is available. Four pallets,
992 lb (450 kg) each, start inside the trailer. The player unloads and stores them;
the status line counts pallets brought inside and resting in the eighteen rack
positions. There is no automatic unloading or putaway. The old rack finishes,
test-load displays and rollover ramp remain as source assets and validation
fixtures, outside the active start.

The v7 scene adds a southeast dispatch office and a south front door for small
parcel deliveries. The office has glazed partitions, blinds, filing cabinets,
a computer desk and a coffee counter. E or click opens its front door onto a
covered parcel shelf and pedestrian ramp. Six neighboring units, visitor
parking, planted verges and a parcel van place the warehouse in a business park.
Three boxes arrive on the shelf after 35 active seconds. E or click carries one
box at a time; use the office parcel desk or its sign to receive it. Carrying
blocks forklift entry. These parcels are session-only and independent of the
pallet stock, business ledger and illustrated game's saves.

The original worker has deliberately rough proportions and simple work clothes.
Its 1,000 triangles use two skinned renderers, one palette material and thirteen
rigid bones. Walking follows actual movement, with separate carrying and seated
poses. First-person and cab views hide the upper torso and head with
`ShadowsOnly`, preserving their shadows while leaving arms and legs visible.
Chase view shows the full model. It adds no lights or physics
bodies. A single analytic sky pass adds clouds, stars and a sun disc aligned
with the existing moving sun. Six unshadowed exterior wall packs fade with
daylight; two unshadowed office spots light the smaller room. The existing sun
and twelve warehouse fixtures continue to provide real shadows.

`WarehouseStartBuilder.Install()` installs this layout after the physical
forklift and handling installers. `WarehouseStartBuilder.Validate()` checks
the real opening and continuous support into the trailer;
`WarehouseReceivingValidation.ValidateAndSave()` checks arrival, obstruction,
restraints, doors, dock access and physically supported storage in isolated
PhysX. All thirteen sequence checks passed on 25 October 2026.
The delivery uses the owner's original 18-wheeler and 53-foot trailer from
23 October, with eighteen spinning wheels and its original hinged rear doors.
The doors fold against the trailer sides. Its floor, roof clearance and scale
remain those of the original model. Source provenance and Unity import details
are in `unity/OneShiftRackLab/RECEIVING_TRUCK.md`.
After installing the receiving start, run `WarehouseOfficeBuilder.Install()`,
`WarehouseBusinessParkBuilder.Install()` and `WarehousePlayerBuilder.Install()`
in that order. Each has a `Validate()` method. The separate
`WarehouseFrontOfficeValidation.ValidateAndSave()` checks actual delivery,
pause, carrying, receipt and doorway obstruction logic on a temporary copy.
See the Unity README for menu names and scene backup locations.
The scene retains the moving sun, window shadows, twelve fixtures and three wall
switches. It uses a keyboard and mouse and requires WebGL 2. WASD walks at 2.8 m/s,
Shift runs at 5.4 m/s, the mouse looks, Space jumps, and R returns to the entrance.
E or a click operates a nearby switch. Escape releases the mouse; P pauses.
Mobile portrait shows a rotation gate; landscape still requires a keyboard and
mouse. Touch players can follow the link to the illustrated game.

E gets into the yellow forklift. On the first entry, a short seated briefing
requires E or Enter before driving. Later entries take one E. W/S drives and
reverses, A/D steers, Space brakes, and Shift gives a slow approach. Driving
releases the parking brake. E brakes to a stop, checks for clear floor, and
steps out. Hold X and move the mouse up or down to raise or lower the forks.
A still mouse holds their height; releasing X returns to looking around.
While X is held, the actual forks and nearby pallet-board edges show through
the mast and load. WASD positions the truck: line up with a pallet's 40-inch
end, drive the forks into its pockets, then lift through physical contact.
Lower onto a supported floor or rack surface and reverse out. Q/Z also raises
and lowers the forks; T/G tilts the mast. C changes the rear/cab view, and Tab
shows the extra controls.

The forklift retains rigidbodies, rear steering, an oscillating rear axle and
force-limited jointed hydraulics. Pallet weight and leverage still affect lifting
and tipping. Cargo is temporarily restrained during road-truck arrival, then
becomes dynamic before the doors open. The forklift never parents, welds or
teleports a load. See `unity/OneShiftRackLab/FORKLIFT.md` for the mechanism and
checks.

The browser's default Smooth picture setting limits the drawing buffer to
2,073,600 pixels and a pixel ratio of 1.25. Controls offers Sharper, capped at
3,686,400 pixels and a pixel ratio of 1.5. Both fill the available view and resize
without restarting the game. The Web build uses smaller shadow maps, downsampled
contact shading, 2x MSAA plus medium SMAA, and less frequent reflection captures.
Physics retains its 0.005-second step. These bounds reduce work on Retina
displays; they are not a measured Mac frame-rate guarantee.

After downloading, the loading screen reports seven graphics preparation
stages. They render the actual night, dawn and daylight scene, both light-row
states, the fork placement overlay and the room reflections. Gameplay, cargo
physics and audio remain suspended. The opening clock and view are restored
before the launcher reveals the game. Preparation shares the page's inactivity
and portrait gates, with a separate suspension flag so completing it cannot
undo a pause. The small version and FPS display comes from the compiled player
and completed game-camera render frames, updated at most twice per second;
inactive play reads Paused. Its tooltip shows the longest frame in the sample.

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
front door, ramp, parcel arrival, carrying, desk receipt and pause, and saves
screenshots. `SHIFT_OFFICE_DUMP` selects its output directory;
`SHIFT_BROWSER_CHANNEL=chrome` selects installed Chrome.
`node tools/profile-one-shift-unity-browser.cjs` measures a separate 90-second
Chrome run without taking screenshots during the sample. Set `SHIFT_PROFILE_FORKS=1`
to include first entry and native X/mouse use, and `SHIFT_PROFILE_PLACEMENT_CAPTURE=1`
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
