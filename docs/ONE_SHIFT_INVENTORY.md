# One Shift inventory aisles

Version 3.4, public asset query `v37`, replaces the three-position storage pages
with a view into the four aisles visible from the central warehouse floor.
Read [ONE_SHIFT_PLACES.md](ONE_SHIFT_PLACES.md) for the building and
[ONE_SHIFT_HANDLING.md](ONE_SHIFT_HANDLING.md) for physical stock handling.

## Space and navigation

Inventory opens at the cross-aisle, looking toward four rack aisles in the same
building. Aisles A through D run from left to right. Each aisle has a traced
entrance floor and adjacent rack-end frame, with matching contour highlights.
Mouse, keyboard and landscape touch use the same destinations.

Choosing an aisle turns the view toward one rack bay. Each bay has two pallet
positions across and four levels high, with level 1 at the bottom. Up and Down
pan the view one shelf at a time, with a Level 1 / 4 indicator and disabled
controls at the top and bottom. Arrow Up and Arrow Down do the same on a keyboard.
Only the focused level has active pallet and empty-position targets. The
surrounding shelves remain visible for context. Beam tags identify aisle, bay, level and side:
`A01-2L` means aisle A, bay 1, level 2, left position. The full address also
appears in accessible labels and pallet details.

The first four existing racks belong to aisles A, B, C and D. Further purchased
racks add bays to these same aisles in rotation. Numbered Rack buttons replace
Previous and Next, name each destination and mark the current position. Their
numbers follow stable rack ordinals; the adjacent A01-style address identifies
the aisle and bay. Walking to another rack keeps the viewing level. The three
next existing racks recede behind the current rack, with their own real stock.
At the last rack there are no later racks behind it.
All four aisles returns to the entrance view;
Back to warehouse floor returns to the building. Taking an empty shipping
pallet does not choose an aisle for the player. The heading names the actual
source aisle, bay and level for the current pick.

## Physical stock and access

Each displayed loaded pallet represents one real pallet at its recorded
`x`, `y` and `level`. The same generated sprite, case quantity, lot, expiry,
barcode and cost basis follow it through receiving and storage. Carried stock
does not appear in a rack. Navigation never moves, copies or consolidates it.

Selecting an available empty position with stock on the player's jack issues
the existing `handStore` command. Occupied pallets keep alpha-based mouse and
touch targeting and native keyboard controls. Pick one case still transfers
one actual case and its cost through `handPickCase`; changing views performs
no work. Exact pallet pixels take priority over nearby empty-slot touch slop.

All four levels can be inspected from the start, but visible space is not free
capacity. The initial warehouse still has eight usable ground positions.
Upper positions require the existing upper-storage upgrade, forklift ownership
and training. Their beam tags use rust; selecting them explains the missing
requirement. The model remains authoritative for reservations and availability.

## Stable addresses and saves

`js/one-shift-inventory-model.js` is DOM-free. `ensureInventoryLayout(sim)` opts
the public manual business into stable rack addresses, adding only
`rack.inventoryOrdinal` and `map.inventoryNextOrdinal`. Existing rack IDs 1
through 4 retain their initial aisle. Later racks receive increasing ordinals;
removing a rack does not renumber surviving bays or reuse its address.

`inventorySnapshot(sim, aisle, bay)` and `inventoryLocation(sim, pallet)` are
read-only projections. A snapshot exposes all four aisle summaries and the
eight positions of the selected real bay, including locked upper positions.
Legacy manual saves receive address metadata when restored into the public
game. Save validation rejects malformed, duplicate or excessive addresses.
Neither migration nor expansion changes stock, capacity or ledger entries.

## Art and rendering

The built-in image generator produced the masters in
`assets/one-shift/inventory-v1/`: `aisles.png` and `rack.png`. The existing
approved truck print supplies the visual reference; `places-v2/floor.png`
supplies the building. Exact generation and correction prompts are recorded
in `prompts.json`. Runtime WebP siblings are pixel-identical lossless encodings.

The backgrounds contain no permanent freight. The overview establishes the
aisles; the selected bay shows its actual stock as independent pallet layers.
The renderer composites the authored empty rack structure in depth, using
actual rack snapshots for background pallets. The camera stays within the
vertical bounds of the artwork. Its pan runs on the existing DemoActivity
loop, freezes on inactivity or portrait rotation, and moves immediately with
reduced motion. Browsing while manually paused does not resume the simulation.
`hotspots.json` records the aisle contours and eight measured shelf openings
and pallet bases. Run `node tools/build-one-shift-inventory-layout.cjs` after
editing that geometry to rebuild `js/one-shift-inventory-layout.js`.

`js/one-shift-inventory-ui.js` extends the existing warehouse scene renderer.
Receiving and Shipping retain their current views. Inventory reuses the canvas,
alpha highlights, pallet details, direct handling actions and inactivity
controller. `PlaceArt` supplies the aisle and empty-position outlines. Shelf
arrows sit beside the rack and the destination strip sits below the artwork.

## Verification

- `tools/test-one-shift-inventory.cjs` checks physical mapping, stock and cost
  conservation, upper-level access, stable expansion/removal, saves and migration.
- `tools/test-one-shift-inventory-browser.cjs` checks named rack destinations,
  all four levels and eight positions, depth order, camera panning, reduced
  motion, pause and inactivity, stock placement, equipment gates, empty-slot
  putaway, exact pallet touch precedence, new games and landscape controls.
- `tools/test-one-shift-hands-browser.cjs` traverses the new aisles during the
  complete scan, unload, putaway, pick, wrap, label, load and dispatch loop.

Inspect stocked bays on desktop and landscape mobile, including every level.
Portrait must freeze play without clearing a deliberate pause. Returning from
Menu, the office, a save or a new game must preserve the correct location and
show only the actual stock belonging to the selected bay.
