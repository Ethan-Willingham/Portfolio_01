# One Shift

The public game at `one-shift.html` is a hands-on inventory business, version 3.4.
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
