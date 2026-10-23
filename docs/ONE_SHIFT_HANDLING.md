# One Shift direct handling

Version 3.1 adds the [time cards, central floor and office desk](ONE_SHIFT_PLACES.md)
around this handling model. Clocking out saves a checkpoint without moving
freight or settling an unfinished shift. Purchase orders and customer acceptance
take place at the desk; every physical handling action below remains the player's.

Version 3.0 implements the owner's October 22, 2026 instruction: the player
performs every warehouse handling step. There is no autonomous worker travel
or stock handling in public play. Waiting and changing scenes cannot unload,
put away, pick, wrap, label or load stock.

## Player actions

1. Select a trailer pallet and scan its real label. It remains in the trailer.
2. Unload to Receiving. The same pallet moves to a floor position. Rear rows
   stay blocked until their front pallets are physically removed.
3. Select a receiving pallet and lift it onto the player's jack.
4. Open Inventory, choose one of four aisles, then click an available position
   in its four-level rack bay to place that pallet there.
   Its cases become available for orders after putaway.
5. Release the empty supplier trailer to free its dock.
6. Start an order to reserve exact cases, then take an empty shipping pallet.
7. Select a source rack and pick each case with Pick one case. Each activation
   transfers one actual case and its cost basis. Lot dates follow the stock.
8. Open Shipping and click an empty floor target to set down the finished pick.
9. Hold to wrap the pallet. Releasing early, pausing, rotating or losing focus
   cancels the unfinished hold without charging. A finished wrap costs $0.50.
10. Apply its shipping label, then call the customer truck after every pallet
    for that order is prepared. Mixed orders can have separate product pallets.
11. Lift a wrapped, labelled pallet and load it at the correct truck doorway.
12. Release the complete customer truck. Payment and stock cost post once.

Only one pallet can be carried. A strip beneath the artwork shows the actual
load on the player's jack. Empty destination targets belong to the illustrated
racks and staging spots. Choosing a different rack can exchange pending receipt
reservations; the other pallet stays where it is.

Cancellation releases remaining source claims. Already collected stock stays
with the player or at its staging position and can be put into a rack. Loaded
orders must finish. Cases, empty bases and payments cannot be duplicated.

## Model and persistence

The DOM-free module is `js/one-shift-hands.js`. The public boot calls
`setManualHandling()`, persisting `commerce.manualHandling` and `commerce.hands`.
Worker assignment and work are disabled for this mode. The existing simulation
still supplies stock records, source claims, lots, prices, capacity and ledger.
Truck drivers arrive and depart after the player's call or release. Wait controls
advance the environment without performing warehouse work.
Accepted orders stay active until the player finishes or cancels them. Late
release uses the existing discounted payment. The clock waits just before shift
close while an accepted order or carried pallet still needs player handling.

Old business saves convert into direct handling without losing stock or cost.
Existing work stops, interrupted freight returns to staging, and partial picked
pallets can be resumed. Carried pallets and partial case picks save normally.
An unfinished wrapping hold is transient and has no material charge.

`js/one-shift-hands-ui.js` supplies direct actions, rack and floor targets, the
carried load strip, pointer/keyboard wrap holds and the player work board.
The direct-play store offers equipment and capacity, with no autonomous staff.
Forklift ownership and training still gate upper stock.

Mouse, keyboard and landscape touch share the same actions. Buttons have 44px
targets. Portrait and inactivity freeze handling without undoing manual pause.
The wrapper supports pointer holds and holding Space or Enter on its button.

## Verification

- `node tools/test-one-shift-hands.cjs` covers waiting without stock movement,
  scan/unload separation, rack choices, carried saves, per-case accounting,
  partial and mixed picks, cancellation, paid supply, old-save conversion and
  explicit dispatch payment.
- `node tools/test-one-shift-hands-browser.cjs` exercises the full native
  scan, unload, putaway, pick, wrap, label, call, load and release loop, plus
  hold cancellation, saves, desktop, landscape touch and portrait gating.
  Playwright uses bundled Chromium. `SHIFT_URL` targets deployment and
  `SHIFT_DUMP` chooses screenshot output.
- The DOM-free receiving, commerce, scene and shared simulation suites still
  cover their underlying invariants. They preserve the old autonomous model
  unless a fixture explicitly enables manual handling.

The earlier receiving, opening, business and scenes browser harnesses describe
the retired autonomous interface. The hands browser suite is current acceptance.
