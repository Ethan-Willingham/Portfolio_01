# One Shift warehouse process

The owner requested the whole game to match the receiving art and a believable
warehouse process on October 22, 2026. One Shift remains an inventory business:
it owns its stock, pays suppliers, and earns sales revenue when customer loads
are released. The process follows a small case-picking distribution warehouse.

## Inbound stock

1. A supplier shipment arrives with a real manifest of pallet IDs, products,
   case counts and lots. Purchased stock is already accounted for in transit.
2. The player checks and scans each pallet label in the illustrated dock.
   Acceptance records the scan once and reserves a reachable rack position.
   The illustrated pallet disappears from the unchecked load. The completion
   message says that labels are checked, not that physical unloading is complete.
3. On returning to the floor, a worker unloads accepted pallets into the marked
   Receiving area. A full receiving area pauses unloading.
4. A separate putaway task takes the same pallet from Receiving to its reserved
   rack location. Cases become available for customer picking after putaway.

The rack reservation follows the pallet through unloading, staging and carrying.
It does not depend on the supplier truck remaining in the building. An empty
supplier trailer can clear the dock while putaway continues. Partially accepted
loads, physical locations and reservations survive saving and loading.

## Customer orders

1. Prepare order reserves exact case quantities from available stock. Older
   received stock is selected first. Another order cannot reserve the same cases.
2. The worker collects a shipping pallet and travels to each assigned source.
   Picking takes time at each rack. Quantities and lot records transfer only as
   that source is picked.
3. The assembled pallet moves to Shipping staging. The worker wraps and labels
   it there. The labels and progress text distinguish this work from picking.
4. A customer truck is called when the prepared shipment is ready. The worker
   physically loads the assigned pallets. The truck waits for its opening to
   clear before closing and moving away.
5. Release records the sale and its stock cost once. Payment does not imply
   that the departing truck has already driven out of the yard.

Cancelling unshipped work releases source claims and returns collected freight
through physical handling. Loaded freight completes its dispatch. Cancellation
must neither duplicate cases nor teleport a carried pallet into a staging bay.

## Readability and limits

The receiving board shows scanning, unloading and putaway separately. Incoming
cases are distinct from ready stock. The floor marks Receiving, Storage and
Shipping, and the order board describes the current physical task. The player
chooses priorities and purchases; workers execute detailed handling.

The dock view holds the business clock during label checks. It is a compact
interaction for accepting a load, not a real-time simulation of a person
climbing through a loaded trailer. Warehouse motion resumes on returning to the
floor. The simulation retains its accelerated clock, four-foot grid, immediate
construction and simplified equipment allocation. These are game abstractions.

## Process references

Microsoft's [inbound load handling documentation](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/inbound-load-handling)
distinguishes arrival registration at a receiving location from subsequent
putaway work. It describes both combined receiving/putaway and two-step flows.
One Shift chooses two steps to make the receiving floor and rack movement visible.

Microsoft's [outbound packing work documentation](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/packing-work)
and [shipment confirmation documentation](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/confirm-and-transfer)
describe picking, packing, staging and confirming outbound loads. These support
the sequence used here; their product-specific screens and paperwork are not
recreated as extra game dialogs.
