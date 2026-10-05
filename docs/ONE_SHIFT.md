# One Shift

One Shift is a standalone overhead warehouse game at `one-shift.html`. Its
editable sources are classic scripts under `js/one-shift-*.js`, with one global
`OneShift` namespace and no bundle step. Keep the post in In Progress on
`archive.html`. Bump every game CSS and script query version together.

Version 1.2 is an expanded playable release. It is not the finished commercial
quality game described in the kickoff brief. Research, raw evidence and the
remaining work are kept locally in `research/one-shift/PROGRESS.md`.

## Model and boundaries

The fixed 20 Hz simulation uses seeded randomness and plain JSON state. A tile
represents four feet; the initial building is 100 by 80 feet. The clock advances
1.37 game minutes per real second, independently of worker movement. A normal
6:55 AM to 4:30 PM shift lasts about seven minutes.

New warehouses have their dock doors on the east wall. Trucks back in from
the right, and the first delivery is already approaching when a new game opens.
The Home view frames the warehouse and active trucks. Receiving and shipping
lanes sit beside the dock; expansions extend the building along that wall.
Saves and layout links without a dock orientation retain the original south
doors. Imported layouts start the player on reachable floor inside the building.

The first three shifts introduce receiving, manual putaway, full-pallet
shipping, a visible 39-versus-40 shortage, case picking and wrapping. Later,
clients and purchases are optional. Forklift training precedes operation and
hiring. A small credit facility covers purchases and operating shortfalls.

Eight fictional clients include full-pallet, retail case, food, electronics,
parcel, kit, slow-storage and cross-dock work. Goods retain client ownership,
item, lot, received date and best-by date. Holds, task reservations, FIFO and
FEFO restrict availability. A loading scan catches wrong items and ownership;
a deliberate bypass can earn a chargeback. Food past the contractual best-by
cutoff is held. This cutoff is a game contract, not a claim that every best-by
date is a legal safety deadline.

Single-unit fulfillment opens a case using its real case pack. Units travel
with a packing task, become individually identified parcels and load against
a specific order at the carrier cutoff. Cancelled or overnight packing returns
unpacked units safely. Kitting and assembly collect floor-level component cases
from partial pallets, carry them to the bench and build against outbound
demand. Collected cases remain inventory until the work finishes. The services
panel shows the worker and collection progress, and can return components
from an unfinished job. Overnight cleanup and holds also return those cases. Packing and
service recipes enforce client ownership. Ready parcels and queued carrier
loads reserve the order balance, including orders packed in several parts.

Drivers can replenish configured ground pick faces from upper reserve. Loaders
can stage released waves before the truck arrives. A task can be reassigned
from one worker's queue to another person while retaining its reservation.
Idle staff can be dismissed, with final shift wages charged once. Evening
dismissal safely returns stock from unfinished work. Empty pick pallets can be
reused or returned to the stack. Shipping sends the wooden pallet away with its
goods; replacement pallets cost packaging money. Evening purchases update the
closing report, and consumables count against operating profit. Case picking takes an empty
pallet from the stack to its source and visibly transfers cases.
Painted zones supply putaway destinations. Cold and secure storage validate
client requirements. Layouts can be shared by URL into a separate sandbox.

Purchases have 39 available catalog entries. Unfinished gifts, displays,
returns, refurbishing, conveyors, sortation, kanban, inspection fixtures, robot
arms, ASRS, a second building and yard tractors are hidden. Several available
systems are still simplified: the line speeds a work order rather than moving
it through separate stations; carts and carton flow shorten picking time;
yard and recycling income settle as ledger abstractions. They do not establish
finished physical versions of those systems.

Workers route independently using cached A*. They do not yet yield to each
other, and vehicles are worker equipment rather than a scarce vehicle pool.
Construction places racks immediately. Rack and dock-door purchases check
space before charging. Rack clearance enforces a working
aisle, but routes do not model separate vehicle turning envelopes. Fatigue is
recorded but does not yet cause accuracy errors. The active situation deck has
10 events; the optional notebook has 160 definitions. These counts do not
establish the requested 90 working situations or 150 taught terms.

## Interface and assets

The warehouse uses a separate palette: concrete gray, blue steel,
charcoal panels, off-white markings and restrained safety orange. Active and
primary buttons are blue. The selection clipboard opens on the left so trucks
remain visible on the right. A received pallet offers Put away / choose storage.
The panel lists named rack positions and highlights available ground positions
on the floor. Occupied positions, reserved moves, required storage areas and
forklift access are checked before offering a destination. The selected pallet
shows its destination while the worker moves it, then its named storage position.
A stored pallet offers the next accessible delivery pallet. Selecting freight
behind an occupied trailer row explains which pallet to unload first and offers
a direct button. Counting becomes available when that row clears.

Mouse, keyboard and landscape touch control the same view. Drag with the right
or middle mouse button to pan. A stationary right-click or Escape clears the
selection; left-drag selects pallets. Object selection,
a floor cursor and panel focus support keyboard play. The menu remaps controls,
changes text scale, volume, reduced motion and redundant color marks. Buttons
are at least 44 by 44 CSS pixels. Portrait on a touch device freezes the shift
without changing manual pause. An idle floor offers a jump to the next truck
through normal simulation ticks.

Every browser load starts a fresh day-one warehouse for now, including a
return through browser history. Existing autosaves are not resumed automatically.
Three manual save slots, end-of-day autosave, import/export and a version-zero
migration remain supported. Continuing a saved game requires Menu > Load or
Import save. Preferences and existing save slots survive a fresh browser load.
Import rejects malformed nested state, orphaned reservations,
bad label data, future label counters, floor wear, station identifiers,
goods imbalance and ledger imbalance. Purchases cannot exceed the
128-person team or 512-tile site limits, and workstations stay in the building. Imported names, lots
and seals display as literal text. An art preview cannot
replace the live autosave. Standalone recall and power-outage challenges are
hidden until their starting states are developed. `one-shift-lab.html` offers four playable color
studies and five title proposals. They are provisional studies, not an owner
art approval or four independently designed sprite systems.

Sprites are procedural and cached at 192 by 192 pixels. World labels are drawn
at display resolution so zooming does not enlarge cached text. The facility sign
sits below the roof cap; truck labels fit the visible trailer and avoid the
camera controls. Static floor chunks and light layers are cached; only the top
stored pallet at a position is drawn in the world, with other levels available in the rack inset. Quiet Web Audio cues
accompany important actions. Low air noise fades during
pause, menus and hidden tabs. Equipment tones stop during an outage. Stations have distinct bench, packing,
wrapping and recycling drawings; forklift operators sit within the vehicle.
Opened cartons show loose units, and bench workers push a component cart.
Dock shutters ease open, pallets settle when set down, and a brief label flash
confirms scanning. Night work has fixed light pools and forklift lamps; an
outage removes powered lights. Reduced motion removes settle and idle sway.
Truck positions advance between simulation ticks, with eased backing and smooth
transitions between yard positions and the dock. Departing trucks continue out
of view after their simulation release. Pause and menus freeze truck motion.
Suspension details from the art bible remain unfinished.

## Checks and reproduction

- `node tools/test-one-shift.cjs`: ramp, deterministic state, goods and ledger,
  recipes, physical component collection, interrupted bench work, ownership,
  reservations, cancellation, pick faces, waves, task
  handoff, layouts, migration and corrupt saves.
- `node tools/test-one-shift-economy.cjs`: nine command-driven policies, each
  running 200 seeds for 60 shifts. Every shift reconciles goods and its ledger;
  saves validate every ten shifts. The first three shifts have no missed truck
  and positive operating profit. Results include full profit and cash curves,
  acquisition days, missed trucks and simulation timing. Service policies bring
  upper component reserve to floor level and finish partial work orders. The
  fulfillment policy disposes of unresolved held stock through the scrap control
  so those goods cannot suppress replenishment indefinitely.
  `SHIFT_STYLES` selects policies for a targeted rerun; `summarize` verifies
  recorded results against the current core hash and checks profitability.
  Set `SHIFT_EVIDENCE`
  to choose the output directory. Policies cannot edit cash or inventory.
- `node tools/test-one-shift-pathing.cjs`: 1,000 randomized rack-layout shifts,
  accepted and rejected placements, route checks, task-progress monitoring and
  inventory reconciliation. This fixture supplies starting cash and hires to
  exercise routing; it is not an economy playthrough.
- `node tools/test-one-shift-browser.cjs`: real browser clicks, native buttons,
  right-side arrivals and opening camera bounds, bench collection and component
  returns, opened-case unit counts, keyboard
  receiving, remapping, autosave, viewport checks, landscape touch,
  portrait freeze, 1.3 text scale, phone panels and preview save isolation.
  Playwright and Sharp must be available in `NODE_PATH`. `ASSETS=1` refreshes
  the card and sharing images from actual gameplay.
- `node tools/test-one-shift-motion.cjs`: frame-by-frame truck movement at all
  three speeds, pause, menu freeze, queued docking, departure, hit positions and
  presentation-state isolation.
- `node tools/test-one-shift-barcode.cjs <desktop-label.png> <phone-label.png>`:
  independent ZXing decoding of the published GS1 vector, generated labels and
  actual CSS-sized browser labels. Set `ZXING_PATH` to `@zxing/library` installed
  as a local test dependency. It is not shipped with the game.
- `node tools/capture-one-shift.cjs`: five real gameplay captures, their source
  states and automated ramp measurements. This does not measure human confusion.

Browser harnesses own Google Chrome for Testing and close that exact process
in `finally`. Never use the owner's personal Chrome binary for headless tests.

On the Apple M1 Pro with 32 GB, the synthetic large fixture contains 8,000 stored
pallets plus 30 inbound pallets, 60 workers, 20 rendered forklifts and 30 trucks.
The latest browser check measured 13.9 ms 95th-percentile draw work at
1440 by 900 in daylight and 13.7 ms at night with work lights and forklift lamps.
The previous release measured 425 to 526 ms for five complete simulation shifts.
This is a synthetic load on one host, not a claim of performance on every phone
or of 20 independently allocated vehicle entities. Headless frame-rate caps
were disabled for the cadence check.

The strategy test's positive-profit and less-than-threefold median-spread gates
are useful regressions. They do not prove equal strategy strength, human fun,
cold-player clarity or absence of a dominant strategy. No human playtest panel,
independent art-director review or ten qualifying polish rounds has occurred.

## Sources

The label carries AI 00 and an 18-digit SSCC in real GS1-128: Code 128 C, FNC1,
mod-10 data check digit, symbol checksum and quiet zones. It uses GS1's
example prefix 0614141; `106141412345678908` is a published regression vector.

- [GS1 logistic label guideline](https://ref.gs1.org/guidelines/logistic-label/)
  and [tag data standard](https://ref.gs1.org/standards/tds/1.12.0/).
- [OSHA powered industrial trucks](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178)
  and [warehousing hazards](https://www.osha.gov/warehousing/hazards-solutions).
- [Red Stag warehouse services](https://redstagfulfillment.com/warehouse-services/).
- [MET CO published rates](https://metcorpusa.com/pricing).
- [FMCSA detention research](https://www.fmcsa.dot.gov/research-and-analysis/impact-driver-detention-time-safety-and-operations).
- [FDA traceability lot codes](https://www.fda.gov/food/food-safety-modernization-act-fsma/traceability-lot-code).
- [CHEP North American pallet](https://www.chep.com/us/en/product/pooled-wood-block-pallet-north-america-48-x-40-inches).

Fees, equipment prices, wages, frequencies and service times are scaled game
balance values. They are not quotations, operating instructions or training.
