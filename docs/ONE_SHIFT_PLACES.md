# One Shift: the building

Version 3.1, public asset query `v33`, gives the game a time-card entrance,
central warehouse floor and seated office desk. These are physical destinations
within the same charcoal, rust and cream print world. This document describes
the current navigation and paperwork. [ONE_SHIFT_HANDLING.md](ONE_SHIFT_HANDLING.md)
remains the source for direct pallet handling and case conservation.

## Entering and leaving

The game opens at a mechanical punch clock and time-card pockets. Punching in
enters the central floor. A saved automatic checkpoint is restored only when
the player punches in; merely opening the page does not resume its clock.
Named save slots and imports remain explicit actions in Menu.

Older service-mode saves cannot drive the new business interface. Public slot
loads and imports reject those modes before changing live state. An older
automatic save stays untouched at the entrance; explicitly starting a new
warehouse first keeps it in a separate backup, exportable from Menu. Generic
save decoding and simulation restore remain available to legacy model tests.

The central floor leads to the office, Receiving, Inventory, Shipping and the
time cards. Each entrance is a focusable target registered to the generated
image. Tab and Enter, mouse and landscape touch use the same targets. Work
areas return to this central floor. The office's rear door also returns there.

Clocking out is a checkpoint during an unfinished shift. It saves the exact
current stock, carried pallet, orders, clock and ledger without settling the
day or completing any work. Clocking back in resumes that state. When the
simulation has already closed a shift, punching in uses the existing next-day
command and begins the next day. Do not use clocking out as an alternate way
to dispatch orders, clear pallets or award revenue.

The clock waits at the time-card station and in the office. Paperwork adds its
own pause flag. Manual pause, portrait gating and page inactivity remain
independent. Entering another area cannot resume a manual pause. Browser
storage failures must be reported; Menu export remains available.

## The desk

One desk is viewed from the seated player's position. Its objects open four
working documents:

- The purchase pad creates supplier purchase orders.
- The in-tray contains actual customer requests and accepted orders.
- The equipment catalog purchases supported equipment and capacity.
- The ledger shows current cash, operating profit, credit and cash entries.

Paper documents open above the office artwork, stop the world clock, trap
keyboard focus and make the underlying controls inert until closed. Escape
or Back to desk closes the document and restores focus. The rear door is
separate from the paperwork.

Purchasing has a draft, review and placement step. Choose a product and 8, 16
or 32 cases. The draft displays real available and incoming quantities, rack
capacity, unit cost, the $6 delivery charge, total, expected arrival and any
credit used. Review does not spend money. Place order rechecks the quote and
issues the existing `restock` command once. The receipt names the actual
purchase record and tracks delivery and putaway. Purchased cases remain in
the incoming shipment until the player scans, unloads and stores them.

Accept order reserves the requested cases and stays at the desk. It does not
pick stock. Go pick selects that customer order and opens Inventory. Finished
picks can be reviewed in Shipping. Cancellation uses the existing conservation
rules; loaded orders cannot be cancelled. Switching paperwork never changes
which customer owns the pallet currently on the player's jack.

The equipment catalog uses existing unlocks, prices and purchase validation.
Forklift training still precedes operation. Racks add real reachable positions.
Automatic worker upgrades and hiring are absent. The ledger derives figures
from the actual journal and order cost records: buying stock reduces cash,
while its cost enters operating profit when those cases are sold.

## Artwork and sound

The three masters live in `assets/one-shift/places/`: `clock.png`, `floor.png`
and `office.png`. Their lossless WebP siblings are used at runtime. The exact
built-in image generation prompts, provenance and measured target bounds are
in `prompts.json` beside them. The tool did not expose a numbered model selector.

Warehouse views stay at standing eye level; the office is deliberately seated
at one desk. Materials look durable and used: worn paint at touch points,
scuffed concrete, patched block walls, old steel furniture and practical
conduit. Avoid a pristine showroom, abandoned ruin or generalized grunge.
Keep the approved limited-ink style. Runtime text supplies labels and state.
Permanent scene art contains no freight that could be mistaken for actual
inventory. Pallets remain separate layers driven by the model.

There is no music track. Web Audio synthesizes room tone, ventilation, distant
mechanical sounds and small paper, door and punch-clock sounds. The office
muffles the warehouse; handling areas have more open room sound. This is
synthesized ambience, not recorded location audio. Audio starts after a user
gesture, follows the saved volume preference and stops with inactivity.
Intermittent sounds are driven by the existing update loop, not extra timers.

## Source contracts

- `js/one-shift-places.js` owns navigation, the clock checkpoint and scene
  targets. Its `Places` instance is `app.places`; `go(name)` changes location.
- `js/one-shift-office.js` owns desk documents. `app.office.open(kind)` accepts
  `purchases`, `orders`, `equipment` or `ledger`; `close()` returns to the desk.
  `update()` changes document markup only when its contents change.
- `one-shift-places.css` and `one-shift-office.css` style those views with the
  same three local fonts and approved palette as the receiving scene.
- `js/one-shift-audio.js` exposes `setPlace(name)` and `clockPunch()` while
  retaining `unlock`, `update`, volume and inactivity handling.
- `js/one-shift-main.js` integrates location and paperwork pause flags with
  the existing simulation and DemoActivity frame loop.

These presentation modules issue existing simulation commands. Simulation
modules remain DOM-free. The floor grid remains hidden, and navigation does
not schedule a worker, move freight, alter counts or change cost basis.

## Verification

Check the opening clock before and after an automatic checkpoint, clocking
out and back in midshift, a carried-pallet reload, and evening rollover. The
pre-punch scene must not advance stock or the clock. Visit every floor entrance
and desk object with native mouse, keyboard and landscape touch controls.

Exercise a complete purchase draft and review without spending, then confirm
one actual purchase. Repeated confirmation must not duplicate it. Check its
receipt, arrival and subsequent direct receiving. Accepting a customer order
must reserve cases without producing a picked pallet. Check equipment prices,
real rack capacity, cash entries and the separation of inventory spending
from profit. Close each paper with Escape and verify focus and pause recovery.

`tools/test-one-shift-hands.cjs` covers underlying manual handling and save
invariants. `tools/test-one-shift-hands-browser.cjs` verifies the direct
scan, unload, putaway, pick, wrap, label, call, load and release loop through
the building. Keep the receiving, commerce, scene and shared simulation
regression suites passing. Verify narrow landscape at 667 by 375 with a 1.3
interface scale, 44px controls, portrait gating and no horizontal paper overflow.
Inspect the actual scenes and check browser exceptions before publishing.
`tools/test-one-shift-places-browser.cjs` covers the entrance, desk documents,
purchase confirmation, checkpoint reload, import and end-of-day transitions.
