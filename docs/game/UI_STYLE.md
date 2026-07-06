# UI_STYLE.md — Frontier Soviet UI

> **Theme note (2026-05-28):** "Frontier Soviet" is the *current* skin, not a permanent contract. Sluice is heading toward a paid Steam release and the theme may be revisited for that build, so treat the palette and the Cyrillic / red-star / propaganda motifs as the present look to match, not as fixed law. The structural principles here (UI-is-in-world, the outline and palette discipline, diegetic walk-up shops, animation restraint) carry across any re-theme; the Soviet hexes and iconography are replaceable. Heads up too: parts of this doc spec work that was never built (per-tier sprites, oil depot, space station) or describe the removed win screen, so check a section against the live game before trusting it.

The canonical art-direction bible for everything the player **interacts with** in Sluice — gauges, controls, shops, end-state screens, future locations like the oil depot and space station. Read this in full before drawing any UI element. Companion to [BUILDING_STYLE.md](BUILDING_STYLE.md), [BACKGROUND_STYLE.md](BACKGROUND_STYLE.md), and [MINERALS_BIBLE.md](MINERALS_BIBLE.md).

The game is undergoing a v11 UI overhaul. Pre-v11 UI (top status bar, modal shop, message toasts, layer banners) is being stripped and rebuilt against this document.

---

## 1. The principle — UI is in-world

Every rule in this document exists for one reason: **the player interface is part of the world, not an overlay on top of it.**

The pre-v11 HUD violated this: floating monospace text, generic bars, modal popovers in browser-chrome typography. None of it belonged to the same universe as the rig, the station, the Soviet propaganda posters on the wall.

The v11 UI is made of the same materials, the same outlines, the same palette discipline as everything else. A fuel gauge is a *gauge that exists in the world*, painted in the same pixel paint as the watchtower's red star. A shop is *a shop you walk into*, not a list with prices.

**One sentence to remember:** *if it would look out of place mounted on the rig, in the station, or stamped on a Soviet shipping crate — it doesn't belong in the UI.*

---

## 2. The four "in-worldness" axes — non-negotiable

A UI element reads as in-world when it satisfies **all four**:

1. **Material truth.** Every UI element is *made of something* — riveted plate steel, etched brass, painted stencil, lit lamp glass. Never "blank panel."
2. **Outline discipline.** The same `BLD.outline` `#1a0a05` 1-px outline grammar as buildings. UI elements are silhouetted shapes, not floating glows.
3. **Pixel discipline.** Integer pixel positions, no antialiasing on text or instruments, no smoothed gradients. Same rasterization rules as foreground sprites.
4. **No floating text.** Every glyph lives on a surface — a stenciled plate, an etched dial face, a printed sign. Text never floats free in screen space.

Violating any of these makes that element start to feel like a generic browser overlay, which kills the spell. This is the single biggest failure mode for game UI.

---

## 3. The Console — the new HUD primitive

The console replaces the v10 top-bar HUD. It is a **horizontal instrument panel along the bottom edge of the canvas**, designed as if it's the dashboard of the player's exterior view of the rig.

### 3.1 Sizing & anchoring

- **Anchor:** bottom-edge of the canvas, full canvas width
- **Height:** 88 CSS pixels (fixed; does not scale with viewport)
- **Inner playable area:** the world is rendered into the area *above* the console (`viewH - 88`). Camera framing accounts for this — `screenH = (viewH - 88) / worldScale`.
- **Mobile portrait:** stays 88 px (still readable)
- **Mobile landscape:** drops to 72 px to preserve vertical play space
- **Letterbox behaviour:** the console always touches the bottom edge of the canvas. Letterbox bars (if any) are above the playfield, never below the console.

### 3.2 Material

The console is **riveted plate steel** painted matte industrial grey. It has visible rivet heads at its corners and along its long top edge (~24 px spacing). A single horizontal weld line runs along the top, lighter than the plate (think arc-welded seam). The whole console reads as a solid heavy panel bolted to the front of the player's view — not floating, not transparent.

Outline grammar: 1-px `BLD.outline` along all four edges. Inside corners have a 1-px highlight.

### 3.3 Bays

The console is divided into named **bays** by 2-px-wide vertical weld seams. Each bay holds one instrument and is sized for it. v11 launch bays:

| Bay | Width | Instrument | Notes |
|---|---|---|---|
| Fuel | 92 px | Needle gauge | Half-circle, 0–F like a real diesel fuel meter |
| Hull | 92 px | Plate counter | N hull plates (5 at level 1, +1 per Hull Plating tier to 11), dim-to-bright as damaged |
| Cargo | 110 px | Bay window | Looks INTO a cargo hold; you see the actual ore inside |
| Depth | 92 px | Dial wheel | Rotating drum showing rolled-up depth tick marks |
| (free) | rest | Reserved | For future instruments — do not fill speculatively |

Bays are added by inserting a new bay **between existing bays**, never appended after. The free area on the right is the future-expansion zone and the home of the radial-wheel anchor (§8.2).

### 3.4 Bays are independent components

Each bay is rendered by its own function. Bays can be hidden, swapped, or replaced without touching the others. A future location (oil depot) can present a totally different bay set against the same console frame.

---

## 4. Materials catalog

These materials are the only valid surfaces for UI elements. Any UI element must be one of these. New surface = new bible entry first, then new code.

### 4.1 Plate steel

The base material for the console, hull plates, large frames.

- **Base tone:** `#3d3a35` (matte industrial grey, mid-value)
- **Highlight:** `#4f4c46` (1-px top + left edges)
- **Shadow:** `#2a2724` (1-px bottom + right edges)
- **Rivet heads:** 2×2 px clusters of `#52504a` core + `#2a2724` outline, every 24 px along edges
- **Weld seams:** 1-px line, `#5a5750` (bay separators)

Used for: console frame, hull plates, shop counter front, depot wall plates.

### 4.2 Etched brass

Smaller instruments and dials. Read as old machined components.

- **Base tone:** `#7a5a2c`
- **Highlight rim:** `#9c7a3e` (1-px)
- **Shadow rim:** `#4f3a1b` (1-px)
- **Etched line / numerals:** `#1f1408` (the same family as `BLD.outline`)

Used for: gauge faces, dial rims, depth wheel ticks.

### 4.3 Lamp glass

Warning / status lamps. Always small (3×3 to 5×5 px).

- **Lit critical:** core `#ff4030`, halo `#a01010`
- **Lit caution:** core `#ffb030`, halo `#b06010`
- **Lit nominal:** core `#40ff60`, halo `#108020` (used sparingly — see §6)
- **Unlit:** core `#1a1a1a`, halo `#2a2a2a`

Lamp halos are 1-px wide. Lit lamps blink with a hard 0/1 toggle (no fade) at 2 Hz for critical, 1 Hz for caution, steady for nominal/info.

### 4.4 Glass instrument cover

Covers gauges and the cargo-bay window.

- **Tint:** `rgba(180, 200, 220, 0.10)` 1-px highlight at the top edge only (suggests reflection)
- Otherwise transparent
- Never frosted, never gradient

### 4.5 Painted stencil

The font surface and any signage. See §7.

- **Paint colour on plate steel:** `#d8d2c4` (off-white)
- **Paint colour on brass:** `#1f1408` (dark etch)
- **Paint colour on wood:** `#0e0908`

### 4.6 Wood

Shop counters, depot interior trim. Suggests the human side of the operation (vs the cold metal of the rig).

- **Base tone:** `#5e3e22` (matches `BG.bgTopsoil` family, deliberately)
- **Grain (1-px streaks):** `#4a2f18`
- **Highlight:** `#6c4828`

Used for: shop counter top, depot intake tray.

### 4.7 Concrete (the deck)

Ground material for shop and depot interiors.

Already specified in BUILDING_STYLE for the foundation panels. Reuse those tones; do not introduce a new concrete palette.

### 4.8 Forbidden materials

- **Drop shadows on text** — flat or nothing
- **Smooth gradients** — only the existing palette dithering grammar
- **Translucent overlay panels** — every panel is solid plate steel or solid wood
- **Glow effects (CSS-style)** — lamps glow via a 1-px halo, that's it

---

## 5. Instrument grammar

The five instrument types. New instrument types must be proposed and added here before being built.

### 5.1 Needle gauge

Half-circle face with a needle. The needle's angle is the value.

- **Face:** etched brass disc (§4.2), 64 px diameter (or scaled to bay size)
- **Tick marks:** 5 major (`#1f1408`, 3-px long) at 0%, 25%, 50%, 75%, 100%
- **Sub-ticks:** 4 minor between each major (`#1f1408`, 1-px long)
- **Needle:** 1-px wide, `#1a1a1a`, with a 2×2 hub
- **Critical zone:** the 0–15% arc is painted `#7a2418` (dark red on the brass face)
- **Cover:** glass (§4.4)
- **Animation:** needle moves smoothly per frame; acceleration capped so big jumps oscillate visibly (this is a real mechanical instrument)

Used for: fuel gauge, future engine RPM, oil pressure.

### 5.2 Plate counter

A row of N segmented plates. Each plate is intact (bright) or progressively damaged.

- **Plate body:** painted armor steel, **tinted by position** in green → yellow → red zones (see below). Hex bolts at four corners, panel groove down the centre.
- **Damage states:** intact → small crack → big crack → destroyed (4 stages per plate)
- **Damaged plate:** keeps the zone tint, gains 1-px crack lines in `BLD.outline`
- **Destroyed plate:** missing from the strip; the recessed dark backing shows through

**Position zones** (deliberate deviation from §6 — see amendment in §6):

- The leftmost **~60%** of plates are **nominal green** (`#40c060` core, `#2a8040` shadow)
- The next **~25%** are **caution amber** (`#ffb030` core, `#a06010` shadow)
- The rightmost **~15%** are **critical red** (`#ff4030` core, `#7a2418` shadow)

Damage takes plates from the **right** first, so a full hull shows the whole green→yellow→red gradient as "you have margin." As damage progresses the red plates go first, then yellow, then green — when you can only see green plates you're holding on to the safe core.

Used for: hull (plate COUNT tracks the Hull Plating upgrade: 5 plates at level 1, +1 per tier to 11 at level 7; width auto-fits the bay), future shield panels.

### 5.3 Bay window

A glass window into a physical chamber. The chamber's contents are the value.

- **Frame:** brass rim (§4.2), 4-px wide
- **Glass cover:** §4.4
- **Interior:** painted dark `#0a0a0a` background
- **Contents:** actual sprites (ore tiles for cargo, fuel droplets for tank, etc.)

Used for: cargo (you see the ore stacked inside), future water tank, future battery cells.

### 5.4 Dial wheel

A vertical or horizontal rotating drum with markings. The visible mark is the value.

- **Drum:** etched brass cylinder (§4.2), partially visible through a slot in the console
- **Slot:** 4-px-tall horizontal cut, edged with a 1-px shadow
- **Markings:** stencil paint numerals (§4.5 on §4.2) at regular intervals
- **Animation:** scrolls as value changes; hard stops on tick boundaries

Used for: depth (rolling 100m increments), future altitude (when above ground), future pressure.

### 5.5 Lever switch

A physical toggle that changes a binary state.

- **Body:** plate steel (§4.1), 12×20 px
- **Lever:** brass (§4.2), 3×14 px, with a 4-px-diameter ball end
- **Position:** UP = on (lever points up-right), DOWN = off (lever points down-right)
- **Animation:** snaps between positions on click; small visible click frame

Used for: shop purchases (pull lever to confirm), future systems on/off toggles.

---

## 6. Color codes — the only allowed signal colours

Borrowed from Airbus dark-cockpit conventions. Three tiers, used exclusively for state communication. Never used decoratively.

| Tier | Colour | Meaning | Usage |
|---|---|---|---|
| **Critical** | `#ff4030` | Imminent failure | Lamp glow only. Hard 2 Hz blink. Player MUST act. |
| **Caution** | `#ffb030` | Degraded | Lamp glow only. 1 Hz blink. Player should act. |
| **Nominal** | unlit / off | Everything fine | Default state. NO green "OK" lights. |
| **Info** | `#4080ff` | Notification (sale, depth tier crossed) | 1× pulse, then off. Used VERY rarely. |
| **Money** | `#d4a838` | Currency / value | Coin piles, price stencil colour, treasure glints |

**The rule:** if the player sees any colour from this table, something demands their attention. If they see *none* of these colours, all is well. This is what replaces the missing "everything is green and OK" pattern from the v10 HUD.

Forbidden: green for "good" *as a general rule*, blue for "info" outside the rare info pulse, purple/cyan/magenta for anything UI.

**§6 amendment — health-zone deviation.** The hull plate counter (§5.2) and the fuel gauge scale arc (§5.1) intentionally violate the no-green-for-good rule. Both use a green → amber → red zone gradient as a "safety margin" indicator: green = lots of margin, amber = caution, red = critical. This works because the player is reading **how much zone is left**, not "is green good." Limited to these two instruments; do not extend without bible amendment.

---

## 7. Typography — the pixel stencil font

The primary typeface for stenciled surfaces (not the only text font in the live game, see the reality check).

> **Reality check (2026-05-28):** the "only typeface" framing in this section was aspirational and never fully shipped. The pixel stencil font is real and used for specific stenciled elements (the console gauges, plates, and end-state text, via `drawStencilGlyph` / `stencilTextWidth` in the Console instruments). It did NOT replace `UI_FONT` (Commit Mono): that constant is alive in the constants block, and `ctx.fillText` with it still draws most HUD, shop, console, and station-decor text. This matches AGENTS.md's three-font rule, where the stencil font is a pixel-art treatment (drawn shapes), not a loaded fourth typeface, and Commit Mono stays the monospace HUD face. Do not delete `UI_FONT` on the strength of §7.2 / §B7 below: that would break live text. Read §7 as the look to aim for on stenciled surfaces, not the current global state.

### 7.1 Specification

A custom **bitmap pixel stencil font** built specifically for Sluice.

- **Glyph size:** 5 px wide × 7 px tall (with 1 px tracking → 6×7 effective)
- **All caps only.** Lowercase has no glyph variants — this is industrial signage, not literature.
- **Stencil cuts:** 1-px white "bridges" interrupt every closed counter (interior of A, O, Q, P, R, etc.) so each letter looks physically stenciled with a real stencil
- **Character set:** A–Z, 0–9, space, period, comma, dash, slash, colon, exclamation, asterisk, question mark, plus/minus, parentheses, currency mark
- **Anti-aliasing:** none. Integer-pixel-aligned only.

### 7.2 Implementation

Render the font as a single glyph atlas (one off-screen canvas, ~96×16 px) at boot. Drawing text is a series of `drawImage(atlas, srcRect, destRect)` calls. (Aspirational, never shipped: the original plan was to use no `ctx.fillText` anywhere, retiring the legacy `UI_FONT` constant. In the live game `UI_FONT` (Commit Mono) is still the working HUD, shop, and console text font. See the reality check at the top of §7.)

Glyph atlas built via a `drawStencilGlyph(ctx, char, x, y, scale, color)` helper. `scale` is an integer multiplier (1, 2, 3, …) so the font scales without blurring.

### 7.3 Where the font is allowed

**Allowed surfaces** (the font lives ON these, not over them):

- Stencilled paint on plate steel (e.g., bay labels if any — minimal)
- Etched numerals on brass dial faces and gauge tick labels
- Printed receipts and shop signs (rare)
- Stamps on death / win screens (§9)

**Forbidden surfaces:**

- Floating in screen space
- Inside the playfield over the world
- On modal popups
- Anywhere as labels for instruments (the instrument's *form* labels itself)

### 7.4 Sizing

The font is rendered at:

- **Scale 1** (5×7 base): rare — for tick labels on dials
- **Scale 2** (10×14): standard — bay labels, signs
- **Scale 3** (15×21): emphasis — death-screen stamp, shop section signs
- **Scale 5+** (25×35+): the rare hero moment — title, win screen

Never odd scales. Never fractional.

### 7.5 Colours

The font is painted in colours from §4.5 only. It is **never** rendered in critical/caution/info colours from §6 — those are reserved for state communication, and a stencil-painted letter is not state.

Currency display (in the shop) is the one exception: numeric prices may be painted in `#d4a838` (money) on a wood surface.

---

## 8. Interaction modes

### 8.1 Diegetic walk-up

The dominant interaction mode. The player walks to a thing and presses interact.

- **Shop:** walk onto the deck. Camera pushes in. Items become physical objects on shelves.
- **Depot:** walk onto the depot platform. Same camera push. Different bay layout.
- **Future stations:** same pattern.

Rules:
- Camera push is a smoothed transition over ~0.3s (not instant, not slow)
- During interaction, the rig is still controllable but slowed to walking pace
- Pressing the back / move-away input exits with a reverse camera transition

### 8.2 Radial wheel

Item selection. The only "menu" in the game.

- **Trigger:** PC: hold middle mouse OR `Q`. Mobile: long-press (350 ms) anywhere on the playfield.
- **Appearance:** circular wheel, 240 px diameter, centred on cursor / finger
- **Frame:** brass rim (§4.2) on a translucent dark backing (one of the few allowed transparent panels — UI specifically because it must dim the world)
- **Slots:** N wedges for N item types. Each wedge holds a 32×32 item icon and a small count
- **Selection:** drag in a direction to highlight a wedge (highlighted wedge brightens, others dim)
- **Confirm:** release to select. For "use here" items (bomb, balloon), a second tap places it.
- **Cancel:** drag back to centre and release (no wedge highlighted)
- **Animation:** wheel pops in over ~0.15s (radial expand from 0 to 240). Out is faster (~0.08s).

The wheel scales to many items by narrowing wedges. v11 launches with 4 items; the format supports up to 12 before wedges become too thin.

### 8.3 Hold-to-peek

The safety net for players who genuinely want raw numbers.

- **Trigger:** PC: hold `Tab`. Mobile: two-finger long-press anywhere.
- **Appearance:** small panel, anchored bottom-left of the playfield (above the console). Plate steel frame, ~140×72 px. Stenciled labels + values.
- **Contents:** fuel %, hull %, cargo N/M, depth m, cash. That's it.
- **Animation:** slides up from the console (~0.1s in, instant out on release).

Used by speedrunners, players curious about exact numbers, and accessibility-conscious players. Not the primary path.

---

## 9. End-state screens

### 9.1 Death — the SALVAGE MANIFEST plate (v24.142)

Death is a respawn with a 10% salvage fee, so the screen speaks incident
paperwork, not GAME OVER. Owner-picked treatment 4 from the death-lab.html
chooser; implementation in `290-death-screen.js`.

- **t=0:** death cause registered. Player input locked. The incident is
  snapshotted (cargo manifest, balance, fee, lifetime incident number from
  `localStorage 'sluice.deaths'`) before any autosave can mutate it.
- **t=0 to 1.35s:** rig dies in place while the world drains to a cold
  desaturated grade under a vignette (no red wash).
- **t=1.35s:** the steel plate (three sheet panels, weld seams, rivets,
  corner brackets, chain stubs) drops the FULL playfield height and locks
  onto the console's top edge with a kachunk. Sparks spray along the
  console line; the landing bounce dips behind the console (clip).
- **Plate contents:** an aged-paper SALVAGE MANIFEST bolted to the steel.
  Header (`SALVAGE MANIFEST` / `RIG SL-1 · {depth} M · NO. {NNNN}`), then
  the lost cargo prints line by line (ore chip, dot leaders, odometer
  count-up; rows are fitted to the paper, the tail sweeps into one
  `OTHER ORES` line; an empty hold prints `HOLD EMPTY`). Then in sequence:
  `CARGO FORFEIT` total (dark red), `BALANCE`, `SALVAGE LEVY 10%` counting
  down in red, a rule, `REMITTED`, and a red `SETTLED` rubber stamp that
  slams in angled with uneven ink (speckles painted in paper colour, never
  erased). A cause-keyed Ministry advisory line in quotes closes the
  report ("THE GAUGE FACES THE OPERATOR." etc, rotated by incident number).
- **Plate bottom panel:** `PROGRESS SAVED` (scale 1, dim) above the pulsing
  gold prompt `TAP/CLICK ▸ RETURN TO TOWN`.
- **Input:** the first tap/click completes the report instantly (every
  element is a pure function of the death clock); the next one recovers
  the rig. R double-press still recovers directly.
- **On respawn:** the plate raises over the live town for ~0.3s
  (`drawDeathPlateRaise`).
- **Dev levers:** `?deathshot=CAUSE` kills the rig on the first live frame
  (seeded hold if empty); add `&deathskip=1` to jump to the settled report
  for headless screenshots.
- Sounds ride the platform keys (`land-hard`, `sell-tick`, `sell-total`,
  `ui-confirm`) and stay silent until assets/sfx lands them.
- The retired TERMINATED plate (cause icons, brass stats plate) lives in
  git history pre-v24.142.

### 9.2 Win

Same structure, different stamp.

- **t=0–1.5s:** rig pose holds.
- **t=1.5s:** a stenciled steel plate descends, but this one is painted with a **green nominal star** (`#40ff60` core, `#108020` halo).
- **Centre:** stenciled `MISSION COMPLETE` at scale 3.
- **Below:** a manifest sheet — printed with totals (depth max, cash earned, time taken) in pixel stencil at scale 1.
- **Tap / click:** plate raises; credits sequence begins (separate treatment — TBD).

### 9.3 Pause / menu

If we ever need a pause overlay (currently not in scope), it follows the same plate-descend pattern with a wrench icon and `PAUSED`.

### 9.4 Forbidden end-state patterns

- Modal HTML `<div>` overlays
- Centred text in a browser font
- "You have died. Click to continue." sentences
- Animated CSS transitions
- Anything that breaks the four in-worldness axes (§2)

---

## 10. Anti-patterns

If a UI element does any of these, it's wrong:

1. **Floating in pure screen space** — every element anchors to a surface, an instrument frame, a signed plate, or the console.
2. **Mid-action reflow** — instruments don't grow, shrink, or rearrange during gameplay. Animation lives inside the instrument, not in its layout.
3. **Drop shadows / glow / blur** — none. Outlines and 1-px halos only.
4. **Antialiased text** — never. The pixel stencil font is bitmap-only.
5. **Generic colour ramps** — every colour is from this document or BUILDING_STYLE / BACKGROUND_STYLE. No new ramps without bible amendment.
6. **Tooltips** — instruments are self-labeling via form. No "?" hovers.
7. **"OK" / nominal indicators lit by default** — silence is OK. See §6.
8. **Casual / chatty copy on stencils** — Frontier Soviet voice means terse, clinical, industrial English. `TERMINATED` not `you died bro`.
9. **Stretching to fit** — UI elements are fixed CSS-pixel sizes. The world resizes around them.
10. **Modal `<dialog>`/`alert`** — never. All UI lives in the canvas.

---

## 11. Cookbook for future locations

How to design a new in-world UI location. Each follows the same recipe.

### 11.1 Recipe template

For each new location:

1. **Frame** — what surface frames the interaction? (Shop = wooden counter + steel back wall. Depot = concrete floor + steel intake. Space station = brass-rimmed porthole.)
2. **Bays** — what console bays are visible while interacting here? Override the default (fuel/hull/cargo/depth) only if relevant. (Shop = same default. Depot = same plus a payout dial. Space station = swap depth for altitude.)
3. **Items** — what physical objects sit in this location? Each item gets a 16×16 to 32×32 pixel sprite in the existing palette.
4. **Categories** — if more than ~6 items, split into bays inside the location (Apple-Store-style sections).
5. **Currency display** — money is shown only when transacting. As a coin pile that grows or shrinks.
6. **Camera framing** — the location's camera push is fixed; the player isn't free to move within it (they're at the counter).
7. **Exit** — backing away or a back input restores normal play.

### 11.2 Oil depot (example)

- **Frame:** steel intake tray (concrete floor, brass-rimmed valve panel above it)
- **Bays:** default + a new "intake gauge" bay temporarily replaces the cargo bay during the visit
- **Item:** none — depot only takes oil and pays cash
- **Interaction:** drive over the intake → oil siphons into the tray → coin pile grows beside the rig → no menu
- **Visual feedback:** the intake-gauge bay's needle climbs as oil flows; cash pile beside the rig grows in step

### 11.3 Space station (example)

- **Frame:** brass-rimmed porthole; the world outside is the cosmic-scale background palette (`SKY.spaceDeepest` etc.)
- **Bays:** swap depth bay for altitude bay (different dial markings); add an oxygen bay
- **Items:** zero-gravity tools, oxygen canisters, repair kits — distinct sprites
- **Interaction:** dock the rig at an airlock → walk in → kiosks for trade
- **Visual feedback:** the rig's hull plate counter is replaced with an EVA-suit hull counter while inside

### 11.4 Underground refinery (example)

- **Frame:** dim industrial concrete, low-key lamp lighting
- **Bays:** default + a "purity" gauge during the visit
- **Items:** refined ore variants, processing upgrades
- **Interaction:** deposit raw ore → refining gauge fills → refined ore appears

---

## 12. Implementation invariants

Drop-in rules for the engine:

1. The console is always rendered, on every frame, into the canvas. Its dirty state is a no-op; instruments redraw only when their value changes (perf).
2. The radial wheel renders on top of the console + world while held; it's never persistent.
3. The hold-to-peek panel renders above the console; it's never persistent.
4. End-state plates render above everything; they take exclusive input.
5. The pixel stencil font glyph atlas is built once at boot and stored as a single offscreen canvas.
6. UI elements are rendered in **CSS-pixel space** (the existing `dpr` transform applies). Internal dimensions are integer CSS pixels; rasterization uses native device pixels.
7. Original plan (never completed): the `UI_FONT` constant and `ctx.fillText` would be removed when the v11 strip flag flipped on. That strip never shipped, so `UI_FONT` (Commit Mono) remains the live HUD text font and its call sites are correct, not bugs. See the §7 reality check.

---

## 13. Glossary

- **Console** — the bottom-edge instrument panel
- **Bay** — a vertical slot in the console holding one instrument
- **Instrument** — gauge / counter / window / dial / switch
- **Lamp** — small lit indicator (critical / caution / info)
- **Stencil paint** — the pixel font on a surface
- **Walk-up** — interaction mode where the player physically approaches a thing
- **Wheel** — radial item selector
- **Peek** — hold-to-show numeric overlay
- **Plate descend** — end-state animation pattern

---

## 15. Shop interior — the first walk-up location

The shop is the canonical implementation of §8.1 (diegetic walk-up). Every future location (oil depot, space station, refinery) uses this as its template. Read this section before designing any new walk-up location.

### 15.1 Always-open proximity model

The shop has **no toggle**. There is no `[E]` key, no "press to enter" prompt, no modal that opens or closes. The shop is a building you walk into.

- **Enter:** when the rig drives within the shop's proximity radius, the camera transitions into the shop interior framing over ~0.3s. The rig parks at the door.
- **Inside:** input is repurposed — left/right move the cursor between stations on the floor, click/tap interacts.
- **Exit:** drive the rig away from the shop (the proximity check inverts) and the camera transitions back out.

There is no "shop modal" that lives in screen space. The shop floor IS a place in the world.

### 15.2 Three work areas (diorama composition)

The shop is a single room with three **work areas** at different DEPTHS in the composition — not three matching tiles on a wall. The depth/angle variation is what makes the room feel like a *place* rather than a UI panel.

| Area | Purpose | Position in the composition |
|---|---|---|
| **WORKSHOP** | Permanent rig upgrades (drill / fuel / hull / cargo, plus specials heat / shield / vert / pump) | Midground, left of frame, at an angle. A workbench with the rig's drill on it, pegboard above with tools, drawer cabinet beneath, vise. Lit by a small clip-on task lamp. |
| **SHELF** | Consumables (teleporter, balloon, bombs) | Foreground center — the front counter the player approaches. The clerk leans on it. Items laid out on the counter top with paper price tags pinned beside each. |
| **BOARD** | Commodities (buy-low / sell-high) | Background, far wall right of frame. Slate chalkboard with brass-trimmed frame, handwritten chalk prices, "COMING SOON" sign tacked to the bottom until the system lands. |

Conspicuously absent: there is **no SELL station**. Cargo and oil sell automatically when the rig drives onto the refuel pad outside the shop. This keeps the core loop frictionless and matches the established pre-v11 behavior the player already knows.

The work areas are not labeled with banner signs. **The objects label themselves** (UI_STYLE.md §2 axis 4): the drill identifies the workshop, the items on the counter identify the shelf, the chalkboard identifies the board.

### 15.3 Floor layout (diorama)

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌─── sun beam ───┐                          ┌─────────────┐     │
│  │ louvered vent  │                          │  CHALKBOARD │     │
│  │                │       (deep shadow)      │  (BOARD)    │     │
│  │  WORKBENCH     │       back-wall door     │             │     │
│  │  (WORKSHOP)    │       (LEAVE)            │  $ $ $      │     │
│  │  drill, tools  │                          │             │     │
│  │  task lamp     │                          └─────────────┘     │
│  │                │      ┌──────────┐                            │
│  └────────────────┘      │  CLERK   │                            │
│                          │ (face)   │              [lantern]     │
│  ╔═══════════════════════╧══════════╧══════════════════════╗     │
│  ║              FRONT COUNTER (SHELF)                       ║     │
│  ║  fuel | dynamite | medkit | battery | drill bit | ...    ║     │
│  ║  $tag   $tag       $tag     $tag      $tag               ║     │
│  ╚═══════════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────────┘
```

The clerk is the eye-magnet of the composition — face dominant, leaning on the counter, watching the player enter. The single dramatic light source (a sun beam through a high louvered iron vent in the upper-left, dust-thick) defines the refuge response (§4 SHOP_PSYCHOLOGY.md). A back-wall door behind the clerk serves as the diegetic LEAVE affordance.

### 15.4 Sub-page push/pop

Click any station and the camera pushes further onto it. The station's sub-page replaces the floor view. A brass back-arrow in the top-left of every sub-page returns to the floor view. Clicking outside the back-arrow's hit-box does nothing — there is no tap-out-to-close, because there is no "close" (see §15.1).

Sub-pages are full-canvas takeovers framed by the station's chrome (e.g., the workshop sub-page is the pegboard wall close-up). Inside a sub-page, the console (§3) remains visible at the bottom edge so the player can still read fuel/hull/depth while shopping.

### 15.5 Theme layer — same shop, different town

The shop must reuse across multiple future towns with **different cultural themes** without rebuilding. The launch town (Soviet) and a future town (Western) must use the same station grammar but visually distinct chrome.

The theme is parameterized via a `townTheme` registry:

| Layer | Soviet | Western |
|---|---|---|
| Back-wall material | Plate steel (§4.1) | Painted plank wood |
| Counter material | Wood (§4.6) | Wood (§4.6) |
| Plaque/poster | Soviet star + propaganda | Sheriff star + bounty notice |
| Currency mark | ₽ (or $ for English) | $ |
| Clerk | Quartermaster (peaked cap, stenciled apron) | Storekeeper (vest, sleeve garters) |
| Pegboard | Painted steel mesh | Plank with iron pegs |
| Chalkboard | Slate, brass frame | Slate, wooden frame |
| Stencil typography | Stenciled paint (§7) | Hand-painted brush lettering (still 5×7 bitmap, just a different font variant) |

**The station mechanics, layouts, hit-boxes, and tier ladders are identical across themes.** Only the surface chrome swaps. New towns add an entry to the theme registry; no station code changes.

Theme is selected by the town the shop building belongs to. The spawn town is `'soviet'`; future Western towns are `'western'`. Adding a third theme (e.g., space-station) is a registry entry plus a sprite set, nothing more.

### 15.6 Camera framing inside the shop

- **Floor framing:** fixed framing of the shop interior at ~1.5× normal world zoom. Camera is locked; the rig is not visible (it's parked outside).
- **Sub-page framing:** further push to ~2.5× zoom on the active station, framed so the back-arrow lands in the same canvas position regardless of station.
- **Transition curve:** smoothed over 0.3s (in) and 0.2s (out). Use the camera-frac smoothing the engine already does for view transitions.
- **Console behaviour:** the bottom-edge console (§3) stays visible through every transition. The shop never paints over it.

### 15.7 Clerk

A standing NPC behind the counter. Single sprite with two states:
- **Idle:** blink every ~3 seconds (1-frame eye close).
- **Looking:** head turns to face the hovered station (-30°, 0°, +30° three-frame turn).

The clerk does not speak. No dialogue boxes — they're a forbidden pattern (§10).

### 15.8 Coin pile

A small visible pile of coins sits on the counter beside the clerk. Its height grows and shrinks with `money`. This is the only persistent currency display while the shop is open — no number floats in screen space.

When a transaction happens (purchase / refund), coins splash from the pile in a 0.4s burst.

### 15.9 Forbidden patterns inside the shop

- Modal overlays (rejected, see §15.1)
- Floating numeric currency display (replaced by §15.8 coin pile)
- "Confirm purchase?" dialogs — the lever pull IS the confirmation
- Any text outside a stenciled surface (§7.3)
- Tabs / categories selected by a strip across the top — categories ARE the stations

---

## 16. Tier visual catalog — every tier is a sprite

Permanent upgrades (gear and specials) earn their cost by being visible objects you can point at. Showing "Lv 3 → Lv 4" as text is a §10 anti-pattern. Instead, **every tier of every upgradable item gets its own dedicated sprite** that the player sees in the workshop.

### 16.1 Sprite sizes

Two sizes per tier, one of each per item-tier:

- **Tile sprite:** 32×32 px. Renders on the workshop pegboard hook for the *currently-installed* tier of that part. Shows what the player currently owns.
- **Detail sprite:** 64×64 px. Renders inside the part's detail card, in the **vertical tier ladder** that shows every tier from 1 to N.

Both are integer-pixel-aligned, palette-faithful, and outline-disciplined per §2.

### 16.2 Tier ladder rendering rule

Inside the part detail card, all N tiers are drawn as a vertical stack of detail sprites:

- Tiers ≤ current: full color, normal outline
- Current tier: full color, **brighter outline (1-px brass `#a07c40`)** to mark "you are here"
- Tiers > current and affordable next: full color, normal outline, **price stencil tag** beside it
- Tiers > current and locked behind affordability: greyscale-tinted, dim outline, red price stencil

This makes the entire tier ladder readable at a glance: how far you've come, what you can buy now, what's still ahead.

### 16.3 Visual progression rule

Each tier must read as a clear *physical* upgrade over the previous, not just bigger. Acceptable progression vocabulary:

- More material (thicker plates, more layers)
- Better material (cast iron → steel → tungsten → unobtanium-edged)
- More mechanism (extra rivets, added gauges, additional pipes, swivel joints)
- Power source visible (heating coils glowing, motor housing, fuel feed)
- Manufacturer markings visible only at higher tiers (a small stencil "MK-V" badge on tier 5+)

A player should be able to tell tier-3 from tier-4 *without reading numbers*. If a tier looks identical to its neighbor, redesign.

### 16.4 Item-by-item tier vocabulary

| Item | Tiers | Vocabulary axis |
|---|---|---|
| Drill | 1-7 named art silhouettes, mapped onto the current numeric upgrade ladder | Rusty Auger Drill -> Workshop Auger Drill -> Carbide Tooth Drill -> Tungsten Jaw Drill -> Diamond Bore Drill -> Plasma Crown Drill -> Void Helix Drill. Tier 1 is deliberately worse than the old baseline: rusty, dull, and patched. Tier 2 is the clean original miner-mounted rotary drill, so the first purchase feels like replacing junk with a real shop-built tool. Tier 3 keeps that exact silhouette and adds pale carbide tooth inserts, a cleaner hub, and brass precision hardware. Tier 4 keeps the same mount but shifts to dark gunmetal, a slightly broader reinforced cutter head, extra bolts, a smaller central hub, and six blockier jaw teeth. Tier 5 becomes a quarry-grade Diamond Bore: same drill footprint, blackened steel body, bronze/worn industrial accents, six blunt cutter blocks capped by oversized cartoon blue-white cut-diamond stones with very wide crown silhouettes, flat bright table facets, bold points, dark prongs, and high-contrast facets, angular hub plate instead of concentric circles, no snowflake spokes. Tier 6 becomes Plasma Crown: same six-tooth footprint, dark purple engineered steel, strong violet plasma seams, small cyan cutting accents in the tooth gaps, and a glowing purple octagonal hub; it must still read as a bolted metal tool, not a pure energy blade. WORKSHOP display glow escalates by preview tier with mobile-readable signals: weak rust ember, clean steel bloom, pale carbide wash, heavy tungsten spotlight, white-gold glint/facet shimmer behind diamond (no literal giant gem outline), violet/cyan plasma arcs, then void effects. |
| Fuel tank | 1–6 | Vessel size + shape: jerrycan → drum → barrel → cylinder → ribbed → reinforced |
| Hull plating | 1–7 | Layer count: single dented plate → double bolt → riveted plate → hex-bolt armor → multi-layer → composite → ceramic-faced |
| Cargo bay | 1–7 | Container: wooden crate → reinforced crate → steel box → riveted container → multi-bay rack → industrial container with capacity stencil → heavy freight pallet |
| Heated drill | 1 | Coil wrap on drill shaft (binary) |
| Heat shield | 1–2 | Mk1 = single ablative layer; Mk2 = double layer + radiator fins |
| Vertical drill | 1 | Drill swivel mount with gear ring (binary) |
| Oil pump | 1–3 | Hose → larger hose with filter → industrial pump with pressure gauge |

Sprite count: 7+7+7+7+1+2+1+3 = **35 tile sprites + 35 detail sprites = 70 sprites total**. Sprite work is the bulk of the workshop implementation (Phase D).

### 16.5 Theme + tier interaction

Tier sprites are **theme-neutral** in v11. A drill is a drill in any town. Only the chrome around them (pegboard material, frame color) themes per §15.5.

If a future town stocks fundamentally different upgrade types (e.g., a Western town selling steam-engine upgrades instead of electric drills), that town gets its own tier vocabulary defined in a future §16 amendment.

---

## 17. Open invariants (revisit before v12)

These are intentionally underspecified at v11.0 and should be revisited:

- **Sound design** — entirely deferred. When sound work begins, this bible needs a new section for audio cues that pair with each instrument state.
- **Controller support** — the radial wheel needs a controller mapping (right-stick + face button is the natural fit).
- **Accessibility** — the hold-to-peek panel is the start of an accessibility story but doesn't address colour-blind safe palettes for the §6 codes (red/amber are the worst pair for protanopia).
- **Localization** — current copy is English only. Adding Cyrillic / CJK / etc. glyph sets needs bible amendment.
- **Animation curves** — currently "smoothed over 0.3s" is hand-wavy. v12 should define an animation grammar (linear / ease-out / hard-snap) per element type.
