# One Shift

The public game at `one-shift.html` is an inventory business game, version 2.1.
Start with six stocked pallets and $200. Customer orders arrive through the day.
Queue shipments, buy replenishment stock, and reinvest in handling equipment,
rack space, doors, and people. The first screen has one order and no tutorial dialog.

The owner explicitly replaced the service warehouse direction on October 5, 2026.
The new business owns its inventory. Former client contracts, receipt paperwork,
unit packing, kitting, and service fees are retained for old saves and regression
fixtures, rather than offered in the public business interface.

Read [the design rationale](ONE_SHIFT_DESIGN.md) for the research, intended
experience, choices, pacing, and limits of automated playtesting.

## Source

Classic scripts under `js/one-shift-*.js` share `OneShift`. No bundle step.
`one-shift-commerce.js` extends the DOM-free physical simulation with customer
orders, stock purchasing, ownership costs, cash accounting, milestones, and
validated saves. `one-shift-business-ui.js` supplies the compact public interface.
The data, pathing, physical work, truck safety, renderer, sound, and input remain
shared with the legacy model. Always bump every game CSS/script query together.
Keep the post in In Progress on `archive.html`.

`new OneShift.Sim(seed, 'business')` creates the public model. The default boot
uses business mode. Explicit `normal`, `sandbox`, and other former modes retain
compatibility. The debug API's `newGame()` default deliberately remains normal
for existing physical regression fixtures; pass `business` to exercise this game.

## Business rules

- Initial inventory: 40 stove cases, 40 lantern cases, 24 chair cases. The stock
  has actual rack positions, costs, lots, dates, labels, and physical pallet IDs.
  Initial stock and racks are starting capital, not free recurring income.
- Customer requests arrive individually. Five requests teach the first day.
  Later demand rotates among available products, includes mixed orders and rush
  requests, and grows to twelve requests as completed orders increase.
  The stock board shows remaining demand, ready cases, incoming cases, and space.
- Ship order reserves specific source quantities. Several orders can reserve
  different cases in one source pallet. Reserved cases cannot be sold twice.
  Workers collect all lots for an item into one shipment pallet, preserving
  actual case counts and cost basis. They walk from source to source, then stage,
  wrap, and load. Truck arrival begins after the shipment is ready, keeping the
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
- Receiving puts paid stock directly into actual racks. Workers with a hand jack
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
100 by 80 feet, with east dock doors. Workers use cached A* paths. They still do
not yield to one another, and forklifts remain worker equipment rather than a
scarce vehicle pool. Construction is immediate. These are current abstractions.

## Presentation and persistence

Steel blue, concrete gray, charcoal, white markings, and restrained safety orange.
Local Century Supra, Segoe UI, and Commit Mono fonts. Procedural Canvas art and
crisp display-resolution labels. The stocked racks show their product and quantity.
Orders, Stock, and Worker share the right board. Floor details open on the left.
The ordinary beginning screen stays below 65 words on the board. Store is the
only floor toolbar button. Daily totals appear automatically at closing. Later
equipment and products stay gray until their order milestones; Team needs a
forklift. There are no Results or Home buttons. Warehouse walls have a plain
perimeter without roof stripes, detached pipes, vents, or parking outlines.

Right or middle mouse drag pans. Wheel, + and - zoom. The camera frames the
warehouse automatically at launch and when a fitted view resizes. Keyboard buttons work natively. Touch uses
the same layout in landscape, with scrolling and 44px targets. Portrait touch
freezes behind the rotate screen without changing a deliberate manual pause.
Large-text landscape views keep the first Ship order button above the fold.

Trucks ease in, park, and leave along the right road. Before moving out, each
truck waits for the worker to clear its rear opening, closes its doors, and then
accelerates. Required exit walks cannot be removed or reassigned. Rendering
interpolates motion without changing simulation or saved state.

Every browser load starts fresh, including history returns. Manual Menu save/load,
three slots, import/export, and evening autosave remain available. Preferences
survive. Old saves retain their model and geometry. Business imports additionally
validate order lines, quantities, source claims, grouped work, ownership costs,
receipts, the order queue, and demand data. All physical cases and cash must reconcile.

## Checks

Use Node. Browser checks require Playwright in `NODE_PATH`.

- `node tools/test-one-shift-business.cjs`: real shipments, receipts, lead times,
  cash and profit, reservations, grouped picks, cancellation, surplus, full space,
  overnight supply, saves, invalid imports, and multi-day reinvestment.
- `node tools/test-one-shift-business-balance.cjs`: 20 seeds, 24 days, two ordinary
  buying policies, 960 shifts. Validates every shift and compares reinvestment
  against reactive restocking. Writes a source-hashed result.
- `node tools/test-one-shift-business-browser.cjs`: native mouse and keyboard
  actions, first sale, replenishment, mixed orders, reload, explicit save loading,
  reports, upgrades, right-drag camera, landscape touch, enlarged type, and portrait
  freeze. `SHIFT_URL` targets a deployed build; `SHIFT_DUMP` chooses screenshots.
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

Harnesses own `/Users/ethan/.local/bin/agent-chrome-for-testing` and close their
exact browser in `finally`. Never launch the owner's personal Chrome headlessly.
Automated policies establish reproducible behavior and solvency, not human enjoyment.
The browser scenarios prove that native controls work, not that every new player
will understand or enjoy the game. Human feedback should drive further tuning.
