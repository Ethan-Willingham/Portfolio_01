# One Shift receiving art

The receiving scene uses the warehouse print approved by the owner in this chat.
The owner requested image-generated artwork, visible selectable pallets, and
variation between docks, trailers, and shipments. On October 22, 2026, the owner
extended this direction to the whole game, including the warehouse and controls.

## The visual target

Use charcoal black, muted rust, and warm cream. Build forms from broad flat
areas of ink, with a few deliberate edges, modest local ink grain, and clear
empty space. Keep the ordinary warehouse subject: a dock doorway, a trailer
interior, wooden pallet bases, cardboard cartons, packing tape, and sparse
stretch-wrap marks.

The approved reference is
[`reference-print.png`](../assets/one-shift/receiving/reference-print.png).
Keep its standing eye-level view from the warehouse into the open rear of the
trailer. The boxes have nearly frontal faces and only a narrow visible side.
Pallet bases must remain distinct beneath the cartons. Avoid isometric views,
gloss, gradients, excessive distress, bright orange, and extra decorative cargo.

Use the site's local Century Supra, Segoe UI, and Commit Mono typefaces for
controls and labels. Generate no lettering in the artwork. Product names, exact
case counts, lot IDs, dock numbers, barcodes, highlights, and scan effects belong
to the runtime.

## The warehouse and controls

Warehouse views use standing eye-level illustrated scenery and separate
selectable pallet layers, including Receiving staging, storage aisles and Shipping.
The office uses a seated perspective at one desk, by the owner's direction.
The owner explicitly corrected the earlier palette-only conversion on October 22,
2026: there is no public top-down view. Do not restore a map camera or map controls.
The hidden four-foot simulation grid is not part of the visual presentation.

The new scene masters and exact generation prompts live in
`assets/one-shift/scenes/`. Their WebP siblings are the runtime backgrounds.
Backgrounds contain empty rack bays and work areas. Pallets are generated alpha
layers placed from actual physical state, never painted into the background.
The renderer must distinguish storage, receiving, shipping and loaded freight.
Pages change which actual pallets are visible; they do not duplicate inventory.
All warehouse handling is performed by the player. Keep direct lift, rack
placement, individual case pick, wrap hold, label, load and release actions in
the scenes. Do not portray invisible workers progressing freight on a timer.
Storage pages follow fixed physical rack positions, including empty slots.
Every pallet keeps the same generated cargo variant between trailer and floor.
The open-door variants are composited only inside each doorway, preserving the
background outside it. A docked truck opens that aperture and shows its actual
remaining inbound or loaded outbound cargo. Loaded pallets leave the floor.

The warehouse HUD, order board, selected objects, shop, report and settings use
flat paper panels, fine ink rules, square controls, serif titles and monospace
operational labels. Rust identifies actions and current work. Disabled and
selected states need clear contrast; touch targets remain at least 44px.
Review receiving, storage and shipping together after every visual change.

## The time cards, floor and office

Version 3.1 adds three generated scenes in `assets/one-shift/places/`:
the mechanical punch-clock wall, a central warehouse crossroads and the office
seen from a seated position behind one desk. Exact prompts, source provenance,
PNG masters, lossless WebP siblings and measured target bounds live together
in that directory. Read [ONE_SHIFT_PLACES.md](ONE_SHIFT_PLACES.md) for navigation
and paperwork behavior.

Keep the same limited-ink print style. The building should look maintained,
durable and used, with rubbed metal touch points, scuffed concrete, old steel
furniture and repaired walls. Avoid excessive distress and pristine showroom
surfaces. The central view has separate office, Receiving, Inventory, Shipping
and time-card entrances. The office desk has a purchase pad, customer in-tray,
equipment catalog and ledger; its rear door returns to the floor.

Targets are positioned relative to the source image, preserving alignment as
the full composition scales. Labels are runtime controls with visible keyboard
focus and at least 44px touch targets. Do not crop away a destination or paint
fake inventory into these backgrounds. Verify the three new views beside the
existing dock, racks and shipping scene before accepting new artwork.

## Layered scene

A background contains an entirely empty trailer. Each real pallet is a separate
transparent sprite. Scanning keeps it visible and exposes Unload to Receiving.
Unloading removes its sprite and reveals the same floor,
walls, and deeper loads. The backdrop and camera stay registered throughout the
shipment.

| File | Role |
| --- | --- |
| `reference-print.png` | Approved source image, retained for future style matching |
| `trailer-empty.png` | Empty first dock and trailer |
| `trailer-dock-two.png` | Alternate dock hardware, wall stripe, and trailer tie-down rails |
| `pallet-cargo.png` | Medium rust-carton stack, narrow right face |
| `pallet-mixed.png` | Shorter uneven-top stack, narrow left face |
| `pallet-low.png` | Low stack of broad rust cartons |
| `pallet-tall.png` | Tall stack of smaller mixed cream and rust cartons |
| `prompts.txt` | Exact prompts for the first background and two cargo sprites |
| `variants-prompts.txt` | Exact prompts for the alternate dock and low/tall sprites |
| `shipment-prompts.json` | Parameterized prompts, recipes, geometry, and source provenance |

All paths in this table are under `assets/one-shift/receiving/`.

The game loads lossless WebP siblings of the six runtime PNG masters. Run
`node tools/build-one-shift-receiving-art.cjs` with Sharp available to regenerate
them. The encoder verifies every alpha value and every visible RGB value against
the PNG. The current delivery set is 9.53 MB, down from 14.72 MB, with no visual
pixel changes. The PNG masters remain the source for later image generation.

## Background registration

Both backgrounds are 1536 by 1024 pixels, with a 3:2 aspect ratio. Use the empty
background as the edit target for every later dock or trailer variation.
Preserve the canvas, camera, doorway, threshold, dock leveler, sidewall planes,
rear wall boundaries, and floor perspective.

These approximate coordinates help inspect a new master:

| Feature | Coordinates in the 1536 by 1024 master |
| --- | --- |
| Trailer opening | Left x390, right x1150, lower edge near y670 |
| Near floor corners | (400, 660), (1136, 660) |
| Far floor corners | (620, 510), (898, 510) |

The reference image itself governs alignment. These approximate values do not
justify moving a corner. The renderer may crop the broad cream foreground for
short viewports; it retains the same source coordinate system.

A second dock can have a different wall stripe, bumper bolt pattern, or control
box. A different trailer can have altered tie-down rails, wall-panel seams, or
local wear. Keep those changes within the existing planes. Do not add cargo,
shadows shaped like removed cargo, people, labels, or scenery that changes the
space available for the pallet sprites.

## Pallet masters and transparency

Generate one complete loaded pallet per image with true alpha transparency.
Leave a modest transparent margin. Keep every wooden foot and carton edge
inside the canvas. Printed object pixels must remain opaque; the space outside
the object must remain transparent. No floor rectangle, paper background, glow,
or exterior ground shadow.

The bottom center of the visible pallet base is its placement anchor.
Transparent margins do not count toward its physical width. The renderer reads
the alpha silhouette to find bounds and target the visible load. It draws
highlights from that silhouette, so the pointer can distinguish adjacent loads.

The low master is 1536 by 1024. Its measured alpha-at-least-128 bounds are
approximately [274, 116, 1256, 910]. The tall master is 1024 by 1536, with bounds
approximately [80, 118, 942, 1402]. These were measured on a two-pixel grid.
Runtime computes its own full-resolution bounds.

Preserve the PNG masters and their alpha. Do not flatten a cargo sprite onto
cream or convert it to JPEG. The preview shown by an image generator can expose
RGB color outside the object even when its alpha is zero; verify alpha in the
actual file and inspect the composited result in the game.

## Reusable shipment prompts

[`shipment-prompts.json`](../assets/one-shift/receiving/shipment-prompts.json)
contains a complete pallet prompt and dock prompt. Replace the named
`{{parameters}}` with one recipe, then supply the indicated reference image
to the built-in image generator.

The product keys match the simulation catalog:

| Product key | Shape to emphasize |
| --- | --- |
| `stove` | Medium stack of broad, shallow cartons |
| `lantern` | Compact stack of squarer cartons with a modest uneven top |
| `chair` | Low load of long shallow cartons arranged flat |
| `radio` | Tall stable stack of small master cartons |
| `notebook` | Dense low block of paper-goods cartons |

These recipes describe future artwork and suggest existing sprites to reuse.
The current renderer can choose among the four approved variants. A new
product-specific master needs an explicit renderer mapping.

The simulation manifest remains the source for pallet identity, product,
quantity, lot, row, and scan eligibility. Draw exactly one sprite for each real
visible pallet. Use the actual dock and stable truck identity for the
background choice, and the product, load size, and stable pallet identity for
cargo variation. Reopening a truck or restoring a save must retain that choice.

Visible carton marks communicate the kind and scale of a load. The exact case
count and barcode come from the simulation. Do not invent extra pallets to fill
space, bake permanent cargo into a backdrop, or change quantities to match a
generated illustration.

## Generation and verification

All current receiving artwork was produced with the built-in `image_gen`
tool. The tool did not expose a numbered model selector. Keep the source record
accurate; do not describe these assets as having used a particular numbered
model.

The approved print was copied into the repo as `reference-print.png`.
It supplied the source for the empty trailer and cargo sprites.
`trailer-dock-two.png` was edited from `trailer-empty.png`.
The exact completed prompts are stored beside the assets; the JSON catalog
also records the original generation artifact names for the three later variants.

For each new asset:

1. Inspect the approved reference and the relevant edit target.
2. Generate using the saved style and geometry constraints.
3. Save a new versioned asset and preserve the original output.
4. Verify the palette, stable carton construction, entire pallet base, and
   actual alpha channel.
5. Composite it in the real scene at front and rear row sizes.
6. Check overlap, hover boundaries, keyboard focus, scan removal, and the
   revealed floor on desktop and landscape mobile.
7. Confirm that variation remains stable and no artwork creates a phantom
   pallet or changes inventory.

Image quality and game correctness need the same final check: receive a full
truck and inspect every intermediate load state, including the empty trailer.
