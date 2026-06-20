# BUILDING_STYLE.md — Frontier Soviet

> **Theme note (2026-05-28):** "Frontier Soviet" is the *current* skin, not a permanent contract. Sluice is heading toward a paid Steam release and the visual theme may be revisited for that build, so treat the locked palette and the red-star / Cyrillic / propaganda motifs as the present look to match for cross-session consistency, not as fixed law. The structural rules here (silhouette and outline discipline, the three-era stratification logic, the value and contrast budget, animation restraint) carry across any re-theme; the specific Soviet hexes and iconography are the replaceable layer.

The canonical art-direction bible for every **surface building** in Sluice. Read this in full before drawing a new building, tower, fence, sign, or vehicle. Match the rules; deviation is corrosive because every building is seen in the same shot.

Reference: see the in-game KOMENDATURA station — implemented in [`js/sluice.js`](js/sluice.js) in the `RENDER: Station + decor` section. That building is the worked example; this doc is the system behind it.

---

## 1. The style — Frontier Soviet

An **old Western prospecting outpost** later **repurposed by an authoritarian industrial regime**. Every building shows multiple eras layered together:

- Concrete poured over the original site (the regime's foundation)
- Wooden middle floor preserved from the prospector era (saloon planks, saturated red-brown)
- Corrugated iron and steel plate bolted on top (the regime's industrial additions)
- Stenciled red paint and Cyrillic signage layered over older Western nameboards

The visual story is always *the new bureaucracy reusing the older frontier*. Never make a building that's purely Western or purely Soviet — the tension between the two is the whole aesthetic.

**One sentence to remember**: the regime never quite finished, the frontier never quite left.

---

## 2. Palette — locked

All colors live in the `BLD` constant in [`js/sluice.js`](js/sluice.js). 26 colors total (the original 23, plus `waterBase` + `waterLight` + `waterFoam` added for the Sluice wash channel, the one element the warm/metal palette had no blue for, an "obvious meaning" exception per this section). New buildings draw exclusively from this palette. Region-specific buildings (moon, alien biomes) may add **at most 2-3** accent colors, and only when they carry obvious meaning.

| Role | Hex | When to use |
|---|---|---|
| `outline` | `#1a0a05` | **Every** silhouette edge gets this. Non-negotiable. |
| **Wood** — saturated saloon-red planks | | |
| `woodDeep` | `#2c1408` | Deepest shadow, batten gaps, plank bottom |
| `woodDark` | `#6e3719` | Plank shadow side, batten lines |
| `woodBase` | `#a0533a` | Plank face — the main wood color |
| `woodMid` | `#b96b48` | Mid-tone plank highlight stripe |
| `woodLight` | `#d68a5a` | Sun-bleached plank top |
| `woodPale` | `#e9a87a` | Sharp highlight, top-edge bleach |
| **Stone** — slate foundation | | |
| `stoneDark` | `#3a3834` | Mortar seams, shadow |
| `stoneBase` | `#5a5854` | Slab face |
| `stoneLight` | `#8a8884` | Slab highlight |
| `stonePale` | `#b0aea8` | Sharp slab specular dot |
| **Metal** — cold blue-grey iron | | |
| `metalDark` | `#1f2933` | Iron shadow, seam |
| `metalBase` | `#4a5560` | Iron face — riveted plate, smokestack body |
| `metalLight` | `#7a8590` | Iron highlight strip |
| `metalPale` | `#a4afba` | Rivet specular dot |
| **Gold** — sign letters and brass | | |
| `goldDark` | `#8a6320` | Sign bevel shadow |
| `goldBase` | `#c98e2a` | Sign board fill |
| `goldBright` | `#e9b54a` | Sign highlight |
| `goldPale` | `#f5d680` | Brass door knobs, letter highlights |
| **Red** — propaganda accents | | |
| `redDeep` | `#5a1108` | Poster shadow, red bulb off-state |
| `redDark` | `#8a1a10` | Poster field shadow side |
| `redBase` | `#c8341c` | Red star fill, poster red field |
| `redBright` | `#e85c40` | Poster bevel, bulb on-state highlight |
| **Atmosphere** | | |
| `warmGlow` | `#fbc55a` | Window glow, oil lamp |
| `cream` | `#e6d5a8` | Poster borders, faint warm trim |

---

## 3. The outline rule — the single biggest stylistic move

**Every major shape carries a 1-px outline in `BLD.outline`.** Use the `strokeRect1(x, y, w, h, color)` helper for axis-aligned rectangles, or hand-paint outline pixels for arched / diagonal silhouettes (see `fillArchedFacade`, `drawRedStar`).

The outline is what makes the building read as "hand-painted pixel illustration" instead of "flat color blocks." Skipping outlines is the single fastest way to break the style.

**When NOT to outline:** purely interior decoration (a sign's bevel inside an outlined frame, rust streaks on an already-outlined wall, the glowing center of a lamp). The rule is: *anything that has its own silhouette against the world gets an outline.*

---

## 4. Materials — when to use what

Buildings stack materials from bottom to top, oldest era to newest:

1. **Stone foundation** (`drawStoneFoundation`) — every building sits on this. Irregular slate slabs with mortar seams. ~6-10 world px tall.
2. **Wood body** (`drawWoodPlanking`) — the saloon-era walls. Board-and-batten, warm red-brown. The bulk of every building.
3. **False-front facade** (`fillArchedFacade`) — Western callback for any building tall enough to deserve one. Always carries the sign and the red star.
4. **Porch awning** (`drawPorchAwning`) — wooden plank roof with a thin metal cap. Slightly wider than the body, supported by two posts.
5. **Riveted iron plate** (`drawRivetedPlate`) — Soviet additions: doors, smokestacks, oil drums, watchtower roofs, gates.
6. **Corrugated iron** *(reserved for future helpers)* — when buildings need full-height industrial walls instead of wood.

**Pick wood OR concrete for big surfaces, not both.** Mixing on the same wall reads as chaos. Use stone *only* at the foundation; use riveted iron for *additions* (doors, stacks, gates), never as the main wall.

---

## 5. Required motifs

Every Frontier Soviet building must include at least 4 of these. Pick the combination that fits the building's purpose:

- **The red star** — small (~3-5 px radius), slightly tilted, mounted somewhere prominent. The regime's signature.
- **Stenciled Cyrillic signage** — paired with an English subtitle when the building has a sign board. Use `drawSignBoard`.
- **Layered repurpose** — a Soviet element painted *over* a Western one (star over a sign, Cyrillic over Roman). Even subtle palimpsest counts. Implementation: draw the old element first at ~20% alpha, then the new element on top.
- **Bolted-on patches** — visible rivets where new material covers old. Use `drawRivetedPlate` even for small patches.
- **Smokestack venting** (`drawSmokestack`) — any building that's actively "occupied" gets one chimney, emitting via `SmokeFluid.splat()`. Only emit when on-screen.
- **Blinking red antenna bulb** (`drawAntenna`) — abrupt 1 Hz on/off (mechanical, not sinusoidal). One per building max.
- **Warm window glow** — the only warm color in an otherwise grey-rust-red palette. Single biggest atmospheric lever.
- **Propaganda poster** (`drawPropagandaPoster`) — red field with cream border, either a star or a face silhouette.

Specifically *do not* go past the chosen 4-6 motifs. A building stuffed with every motif reads as parody.

---

## 6. Required structural anchors

These three are present in EVERY building, regardless of motif choice:

1. **Outlined silhouette** — see §3.
2. **Stone foundation at the bottom** — even a 4-px-tall band counts. The building never floats.
3. **Three-era stratification** — bottom to top, the visible materials always read older-to-newer. Stone (foundation), wood (body), iron/painted-iron (additions). Even if the building is short, this gradient must be perceptible.

---

## 7. Helper API — the actual vocabulary

These live in [`js/sluice.js`](js/sluice.js) just above `drawStation`. Compose new buildings from these — do not reinvent them.

| Helper | Signature | Purpose |
|---|---|---|
| `strokeRect1` | `(x, y, w, h, color?)` | 1-px outline overlay on a rect |
| `drawWoodPlanking` | `(x, y, w, h, plankSpacing=6)` | Saloon-red board-and-batten with nail dots |
| `drawStoneFoundation` | `(x, y, w, h)` | Irregular slate slab pattern |
| `drawRivetedPlate` | `(x, y, w, h)` | Blue-grey iron with rivet highlights |
| `drawRedStar` | `(cx, cy, r, tilt=0)` | Outlined 5-pt star with highlight wedge |
| `drawRustStreak` | `(x, y0, y1, intensity=0.4)` | Vertical weathering streak |
| `drawSmokestack` | `(x, y, w, h, emit)` | Iron stack with cap + elbow + `SmokeFluid` emit |
| `drawAntenna` | `(baseX, baseY, height, time)` | Pole + abrupt 1 Hz red bulb blink |
| `drawSignBoard` | `(x, y, w, h, text)` | Gold board with dark engraved Cyrillic text |
| `drawDoubleDoor` | `(x, y, w, h, time)` | Wood double doors with warm-glowing upper windows |
| `drawPropagandaPoster` | `(x, y, w, h, kind)` | Red poster, `kind` ∈ `'star' \| 'face'` |
| `drawPorchAwning` | `(x, y, w, h)` | Plank awning with metal cap |
| `fillArchedFacade` | `(x, y, w, h, archH=6)` | False-front silhouette with curved top |
| `drawOilLamp` | `(x, y, time)` | Hanging warm lamp with halo |
| `drawOilDrum` | `(x, y)` | Riveted drum with faded red stripe |
| `drawCrate` | `(x, y, w, h)` | Wooden crate with diagonal bracing |
| `drawLadder` | `(x, y, h)` | Two side rails + rungs |
| `drawSearchlight` | `(x, y, time, facing)` | Outlined lens housing + soft cone |
| `drawWatchtower` | `(x, groundY, time, facing)` | Elevated platform with riveted roof, ladder, searchlight, red-star plaque |
| `drawFlagpole` | `(baseX, groundY, height, time)` | Pole + red banner with the hammer-and-pickaxe icon, waves on `surfaceWind` |
| `drawFuelPump` | `(x, groundY, time, active)` | Old-school cream-bodied gas pump — brass globe finial, large round mechanical gauge with red needle, green-digit odometer screen, red label panel with fuel-droplet icon, curving hose with brass nozzle on a hook. 16 × 36 wide × tall. |
| `drawWindsockTower` | `(baseX, groundY, time)` | Tall standalone iron windsock tower — pyramidal base, bolted pole with mid-plaque, pivot housing with red star, striped sock animated via `surfaceWind` |
| `drawHazardStripes` | `(x, y, w, h, time, active)` | Diagonal yellow/black hazard stripes; scrolls when `active` |
| `drawFuelTank` | `(x, groundY, w, h, time)` | Large cylindrical fuel tank — outlined silhouette, red star + horizontal stripes, top vent + pressure gauge |
| `drawOreHopper` | `(x, y, w, h)` | Coal-filled scoop with red riveted funnel below |
| `drawAlertDome` | `(x, y, time)` | Red flashing dome alarm — 1 Hz blink |
| `drawControlPanel` | `(x, y, w, h, time)` | Small metal electrical box with a green power light and orange status buttons |
| `drawPayoutTerminal` | `(x, groundY, time, active)` | Slim cabinet with green LCD readout, gold ₽ coin slot, receipt paper slot. COLD STORAGE since the v24.138 depot v2 (the КАССА booth is the pay point) |
| `drawCanopy` | `(x, y, w, h)` | Wide flat gas-station canopy — wooden plank top with a red trim strip along the bottom edge. COLD STORAGE since the v24.138 depot v2 (`drawDepotCanopy` is the live canopy) |
| `drawCashBooth` | `(x, groundY, w, h, time)` | Cashier booth, the depot's pay point: stone base + wood-plank walls + iron stovepipe (three-era stratification), КАССА service window with warm glow + mullion cross, transaction shelf, posted tariff board. Stovepipe draws but NEVER emits |
| `drawDepotCanopy` | `(x, y, w, signCx)` | Flat modernist canopy slab: thin iron roof sheet with standing seams over a deep CLEAN dark fascia carrying the sign board inset flush at `signCx`. The classic Soviet АЗС silhouette — one slab, one column, the booth holding up the other end |
| `drawParkingArrow` | `(centerX, padY, time, active)` | Bobbing downward chevron that marks the parking spot under the canopy |
| `drawSupportPost` | `(x, groundY, height)` | Iron support post — wider capital at top + wider base flange at bottom, riveted body with bolts. Used to hold up the gas-station canopy |
| `drawChair` | `(x, groundY)` | Wooden outdoor chair, 10 × 14, plank seat + slatted back with a small red star on the lower slat |
| `drawHearthFire` | `(x, y, w, h, time)` | Animated layered flames (red shell → orange → yellow core → white-hot embers). Fills the given rect from the bottom up |
| `drawLogEnd` | `(x, y)` | Single 5×5 wood log seen end-on, with concentric ring shading. Stack these for a wood pile |
| `drawRustyIronBand` | `(x, y, w, h)` | Rust-red iron strap with bolt heads — wraps stonework like a chimney or mantle. Carries the "regime addition over older work" motif |
| `drawStackedStoneColumn` | `(x, y, w, h)` | Tall brick-stacked irregular stones with alternating seam offsets and per-stone shading pips. Used for chimneys + hearth bodies — anything taller than it is wide that should read as hand-laid masonry |
| `drawStoneCorbel` | `(x, y, w, h)` | Flared crown / shelf with crisp top highlight + bottom shadow and two internal block seams. Used as the transition from a narrow chimney to its wider iron cap |
(The v24.130 station-v2 helper set — `bldHash01`, `drawLapSiding`, `drawBattenWall`, `drawGlowWindow`, `drawStoneBase` — left the file with the v24.135 revert to the original station art. If a future rebuild wants them, recover from commit `b43320e`.)

All sizes are in **world pixels** (not CSS pixels — the render pass is in world space). All `time` params are `performance.now() / 1000` (seconds).

If you need a new shape that isn't in this list, add it as a helper FIRST (with consistent outline + palette discipline), then use it in your building. The helpers are the canon.

---

## 8. Building anatomy — vertical zones

Use this as the template for any new building. Adjust heights for the building's purpose but keep the order.

```
y = by                                     ─┐
                                            │  Roof additions (smokestack,
y = by + arch_top                           │  antenna, watchtower roof, flag)
                                           ─┤  Drawn BEHIND the facade so
y = by + (arch_top + arch_curve)            │  the facade overlaps them.
                                            │
                          ┌─────────────┐  ─┤
y = by + facade_top      │   FACADE    │   │  False-front with arched top.
                          │  ★ + SIGN   │   │  Red star + gold sign board.
                          └─────────────┘  ─┤
y = by + facade_bottom    ▔▔▔▔▔▔▔▔▔▔▔▔▔     │  Porch awning (wider than body)
                                            │  on two outlined posts.
                          ┌─────────────┐  ─┤
y = by + body_top         │   POSTERS   │   │  Wood body. Posters flank the
                          │   + DOOR    │   │  centered door. Optional small
                          │   + WINDOWS │   │  windows.
                          └─────────────┘  ─┤
y = groundY - 8           ▓▓▓▓▓▓▓▓▓▓▓▓▓     │  Stone foundation. Always.
y = groundY               ─────────────    ─┘  Ground line.
```

Decor (oil drums, crates, hitching posts) flanks the building at ground level, OUTSIDE the body bounds.

---

## 9. Animation hooks

Use these and only these. Don't invent new animations — consistency across buildings matters more than novelty.

| Element | Motion | Frequency |
|---|---|---|
| Window glow | Sinusoidal pulse | 0.27–0.40 Hz — **never sync** two windows to the same phase |
| Oil lamp | Tiny flicker noise | 8 Hz noise, amplitude ≤ 5% |
| Antenna bulb | Abrupt on/off | 1 Hz, *not* sinusoidal (mechanical feel) |
| Smokestack | Continuous emit via `SmokeFluid.splat` | On-screen only; subtle slow pulse |
| Windsock | Existing `drawWindsock(x, y)` | Reads from `surfaceWind` |
| Red star | **None** | Stillness gives weight. Never animated. |
| Propaganda posters | **None** | Same. |
| Door | **None** | Doors don't open in this game — leave them static |

---

## 10. Scale guidance

The KOMENDATURA station is 88 wide × ~86 tall world px (original arched false-front + body + foundation; the v24.130 two-storey rebuild was reverted to this in v24.135 — owner call; hit box 96 × 86 in `isPointOnShop`). For other buildings:

| Building type | Suggested size (world px) |
|---|---|
| Watchtower (worked example) | 28 wide × 72 tall (stone base 8 + ladder body 48 + roof+platform 16) |
| Flagpole | 4 wide × 50–70 tall, banner 18 × 12 |
| Windsock tower | 22 wide × ~92 tall (stone pad 6 + iron pyramid base 14 + pole 60 + pivot 12); sock extends ~25 outward |
| Open-air fireplace | 36 wide × ~114 tall — hearth 28 × 22 (stacked-stone) + mantle 36 × 6 + chimney 14 × 70 (stacked-stone, with two rust-red iron bands) + stone corbel 20 × 4 + iron cap 24 × 8. Flanked by two `drawChair` and a `drawLogEnd` × 3 stack on the left, iron poker + shovel on the right. Emits real wood smoke from the chimney top via `SmokeFluid.splat` (use `{r,g,b}` object, NOT array — see v9.88) |
| Fuel pump | 16 wide × 36 tall on its 3 px concrete island curb |
| Gas station (v24.138 depot v2) | ~177 wide × ~81 tall footprint, `pad.x − 72` (tank plinth) to `pad.x + 105` (slab edge). One flat iron canopy slab (152 × 18 at `groundY − 69`: 3 px roof sheet + 15 px clean dark fascia carrying the ЗАПРАВКА board inset flush) over an asymmetric bay: fuel TANK 20 × 42 on a plinth OUTSIDE the canopy (vented storage never sits under a roof) → ground pipe with red valve wheel → one riveted column → pump on its island → parking pad (64, the hit zone) → КАССА booth 26 × 50 carrying the slab's right end. Hanging REFUEL · DEPOSIT plate on chains at pad center; oil lamp lights the walk to the cashier. The fuel's path from storage to nozzle to till is legible — every element has a physical reason |
| Tiny shack | 32–48 wide × 48–60 tall |
| Standard outpost / store | 80–96 wide × 80–96 tall |
| Compound centerpiece (HQ, factory) | 120–160 wide × 100–140 tall |
| Backdrop silhouette only | 200+ wide × 50–80 tall (no walking detail) |

At world scale ≈ 32 px per tile, an 88-wide building spans ~2.75 tiles. Plan around tile counts so the building sits cleanly on the surface grid.

**Detail floor**: smallest meaningful sprite element is 1 × 1 world pixel. Anything that needs to read as a recognizable shape needs at least 3 × 3 of fill. Below that you're just hinting at color.

---

## 11. Checklist before shipping a new building

- [ ] Stone foundation present, at least 4 px tall, outlined.
- [ ] Building silhouette has a 1-px outline on every exterior edge.
- [ ] Wood body uses `drawWoodPlanking` (or a justified material if not wood) — NOT raw `fillRect`.
- [ ] At least 4 of the 8 motifs from §5 are present.
- [ ] A red star somewhere, *small and slightly tilted*, never animated.
- [ ] If the building has a sign, it uses `drawSignBoard` with Cyrillic primary + English subtitle (when room allows).
- [ ] If it's "occupied," a smokestack with `emit=true`.
- [ ] Bounding box added to `isPointOnShop` (or equivalent hit-test) if interactable.
- [ ] No new colors introduced. If absolutely required, add ≤ 2 to `BLD` with a comment justifying them.
- [ ] No raw hex strings in the body — read from `BLD.*`.
- [ ] No `let` / `const` — `var` per AGENTS.md.
- [ ] Render function early-out when off-screen (`if (cx + ... < cam.x || ...) return;`).

---

## 12. Anti-patterns — do not

- **Skip outlines.** Flat shapes are immediately wrong.
- **Use modern UI colors** (clean greys, pure whites, neon accents). Everything in this world is weathered.
- **Animate the red star or propaganda.** Static accents = weight; animated = parody.
- **Stack every motif** on one building. Pick 4–6 and commit.
- **Make sci-fi or fantasy elements.** This is a grounded, weathered frontier world.
- **Introduce new palette colors casually.** The palette is the contract.
- **Use sinusoidal blink for the antenna bulb.** Mechanical equipment doesn't fade — it switches.
- **Sync window glows.** Always offset phases.

---

## 13. Compound composition (the worked Earth example)

The current Earth surface compound, left to right relative to the station center column `cx`:

```
   ┌─────────────────────┐         ▌▌                ┌────────────────────────────────┐
   │     KOMENDATURA     │      🪑 ▌▌ 🪑            │  ▁▁▁▁▁ ★ ЗАПРАВКА ★ ▁▁▁▁▁▁▁  │
   │       station       │         ▌▌                │ 🛢═▌ ⛽   [pad]   КАССА booth  │
   │     (no smoke)      │      🪵🔥🔧               │ tank pipe column      (pay)    │
   └─────────────────────┘      fireplace             └────────────────────────────────┘
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ slate foundation tile ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

Placement (world px relative to `cx`):

- **Station** — centered at `cx`, the ORIGINAL arched false-front (88-wide body, porch awning, posters + double door, stone foundation). The v24.130 two-storey v2 rebuild was reverted to this in v24.135 (owner call; recover from `b43320e` if ever wanted). The double-door rect is mirrored by `getShopDoorRect()` in 050 and the 96 × 86 hit box by `isPointOnShop()` — keep all three in sync if the geometry moves. Smokestack draws but never emits — the fireplace is the compound's only active smoke source.
- **Open-air fireplace** — at `cx + 150`. Hearth + chimney span ~36 wide × 114 tall (cap at `groundY − 114`). Chair-to-chair silhouette: `cx + 113` to `cx + 181`. Leaves ~65 px to the station's right edge and exactly 64 px to the depot's tank plinth — both meet the 64 px rule.
- **Gas-station depot (v24.138 v2)** — anchored on `pumpPadRect` at `(DECK_CENTER_COL + 8) * TILE`. Footprint `pad.x − 72` (tank plinth — the 64 px fireplace gap holds exactly) to `pad.x + 105` (canopy slab edge). Bay reads left to right: tank → ground pipe + valve → column → pump island → parking pad (hit zone, untouched) → КАССА booth; one flat iron slab over all of it, ЗАПРАВКА board inset in the fascia, stovepipe cap as the skyline accent.
- **Foundation** — asymmetric: `DECK_HALF_LEFT = 4` and `DECK_HALF_RIGHT = 11`. The fireplace lives on the RIGHT half of the deck now, between station and depot.

**Cold storage** — `drawSurfaceWindsock`, `drawWindsockTower`, and `drawWindsockSock` are preserved in the file (with their helpers) but the render call is commented out. Swap them back in by uncommenting the line in the render entities pass; no other change required as long as a free 22-wide × 64-clearance slot exists somewhere in the compound.

**Render order:** `drawStation()` → `drawSurfaceFireplace()` → (windsock disabled) → `drawPumpPad()`. The fireplace has its OWN top-level render function with its own visibility check, so it doesn't get culled when the player walks far enough that the station goes off-screen. Same pattern applies to any future structure that doesn't belong inside another building's draw.

**Future expansions** (watchtowers, flag pole, fence) re-occupy the symmetric slots once the shop iteration is done.

**Render order:** windsock renders FROM the station's draw call so it sits behind any station/depot extensions if they ever overlap.

## 14. Future expansion

Not yet implemented but reserved for follow-up passes:

- **Fence + gate** — wood-plank palisade between concrete pillars (red star caps), iron sliding gate centered between watchtowers. Will need to integrate with surface-tile generation so the palisade columns sit between the watchtower legs and the station.
- **Covered wagon** — Western leftover, parked near the fence. Canvas top with a small red star painted on.

When you add one of these, **update this doc first** in the relevant section, then implement.

---

## 15. Spacing rule — ≥ 2 tiles between structures

Every surface structure must have **at least 2 tiles (64 world px) of clear ground** between its full bounding box (including extending decor — crates, drums, fluttering banner reach, etc.) and the next structure's bounding box. Crowding the deck makes the whole compound read as one blob; breathing room lets the eye parse each piece as a distinct landmark.

One exception to the 64 px rule:

- **Decor exception** — tightly-clustered props that read as ONE installation (a hitching post + barrel, a stack of crates) can sit flush against their parent building.

The earlier "slim tower exception" was tried for the windsock between the station and depot and reverted — playtest confirmed 64 px on every side is non-negotiable. The compound was widened to accommodate.

For every distinct surface structure (station, windsock, gas-station, watchtower, etc.) the 64 px rule applies on **both** sides.

## 16. Where to extend the doc

If you add a new helper or motif, document it here in §5 / §7 *before* shipping the code. The doc is the source of truth; code follows the doc. If you find yourself doing something the doc forbids, either update the doc with a justified exception or change the code.

This file is short on purpose. When it gets longer than ~400 lines, split by domain (palette, materials, motifs, animation) into separate files under a `docs/style/` folder.
