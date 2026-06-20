# NIGHT_NOTES — Sluice Underworld Redesign (handoff)

> Handoff for the overnight underworld pass. Pairs with `NIGHT_PLAN.md`
> (the design spec). Read both before continuing the redesign.

---

## TL;DR

**Shipped — `v16.0` + `v16.1`, on `main`, pushed.** Six headline ore
types rebuilt from flat colour-blobs / crude `fillRect` flourishes into
principled, hand-rasterised pixel art at the coal-renderer bar:

**diamond · emerald · ruby · gold · silver · pyrite**

(the first five in v16.0; silver added in v16.1 — same renderer
pattern, completing the gold/silver/pyrite metal family.)

No other game systems were touched. The six renderers are self-contained
and additive — if any one looks wrong it can be tuned or reverted in
isolation without affecting the rest of the game.

---

## Update — v16.2 / v16.3 / v16.4 (post-review revisions)

After an owner review of v16.0/v16.1, three follow-up passes shipped.
**Where the sections below describe a "painted host" or animation on the
ores, that is superseded — see here.**

- **v16.2 — ore de-blob.** The six renderers painted an opaque host
  rectangle (clipped to the deposit blob) to cover the base tint; that
  opaque oval read as a "blob with decorations inside" and didn't match
  how coal/copper are built. Every ore tile *already* has a dirt/stone
  tile rendered behind it — coal draws only its mineral cluster on top
  and lets that underlay show through. The host (fill + host-facet
  specks + AO strip) was removed from all six; each now draws only its
  crystal/cube/nugget/wire cluster on the natural rock. **All animation
  was also removed** — the ores are now fully static (diamond's drift,
  ruby's pulsing glow, gold's/silver's glints gone; ruby's glow bloom
  and gold's quartz host and silver's tarnish gone with it).
- **v16.3 — permafrost layer redesign.** Replaced the placeholder
  permafrost look (flat blue wash + four identical fixed specks per
  tile) with `drawPermafrostFrost` (cached: cold gradient retint +
  hashed rime / ice lens / frost crack), `drawPermafrostIcicles` (live:
  icicles hanging from cave ceilings), and a real frost wall pattern.
  Fully static.
- **v16.4 — bedrock background.** `wallBedrock` was near-black
  (`#15140e`), so near-black oil pools vanished against the bedrock
  cave background. Lightened `wallBedrock` + `bgBedrock` so oil reads.

---

## Update — v16.5–v16.8 (ore system rebuilt)

A second owner review found the ores still read as **a clipped oval of
art inside a dirt/stone tile** — the `oreDepositPath` deposit clip,
present since v16.0. A three-phase rebuild followed. **Everything the
sections below say about the individual ore renderers is now
superseded** — the renderers were all replaced.

- **v16.5 — dev ore gallery.** `injectOreShowcase()` — dev-mode only —
  injects a viewing gallery of every ore near spawn (drill straight
  down, or use the shaft right of the station).
- **v16.6 (Phase 1) — ore system rebuilt on the coal/copper/iron
  model.** `oreDepositPath` now returns the full tile rect for every
  ore — the organic-oval clip is gone. New shared primitives:
  `oreScatter` (jittered 3×3-grid placement spanning the whole tile),
  `drawGemFacet`, `drawOreShard`, `drawOreGrain`, `drawOreCube`,
  `drawOreWires`. The six gems rebuilt as full-tile scatters of small
  ragged features — a patch of ore now merges into one deposit instead
  of a grid of circles.
- **v16.7 (Phase 2) — the other 16 ores** moved onto the same system
  (`drawGemScatter` / `drawShardScatter` / `drawGrainScatter` + per-ore
  renderers). All animation removed; trilobite is a proper segmented
  fossil; amber a resin-grain scatter with a trapped insect.
- **v16.8 (Phase 3) — permafrost.** Split into frost-crusted brown
  **frozen earth** (dirt) vs solid pale **glacier ice** (stone). Ore
  tiles now pick up their layer's treatment on the underlay, so an ore
  no longer punches an un-frosted hole in permafrost (the fix
  generalises to magma/crystal too).

coal / copper / bauxite / iron stay untouched — they are the reference
the rebuilt system is modelled on.

---

## What shipped, per ore

All six live in `js/sluice.js` as standalone functions
inserted immediately **before `drawEarlyOreBase`** (grep
`v16.0 — Underworld ore redesign`). Each is wired into the per-ore
flourish block in `render()` (grep `v16.0 — Underworld ore redesign`
again — the second hit). Common design: the renderer paints its **own
host** first (dark crystalline rock, or pale quartz for gold) so it fully
owns the deposit blob, then draws the mineral. All geometry is keyed only
on `(r,c)` via `tileHash01` — **no neighbour reads** — so mining a
neighbour can never reshape a survivor.

| Ore | Functions | Mineral habit / hook |
|---|---|---|
| Diamond | `drawDiamondCrystal`, `drawDiamondOre` | Octahedral rhombus crystals (1 main + 2 satellites), 4-quadrant facet shading, white specular, slow specular drift, single-pixel R/G/B chromatic dispersion around the rim. |
| Emerald | `drawEmeraldPrism`, `drawEmeraldOre` | 4–6 tall tapered hexagonal prisms erupting from a shared base; lit/base/shadow column shading, tip speculars. |
| Ruby | `drawRubyCrystal`, `drawRubyOre` | 3–4 squat barrel-shaped corundum crystals in a druzy cluster over a soft pulsing internal-fluorescence bloom. |
| Gold | `drawGoldNugget`, `drawGoldOre` | Soft organic nuggets + dendritic wires in a **pale quartz** host; slow metallic glint. |
| Silver | `drawSilverWire`, `drawSilverBead`, `drawSilverOre` | Curly native "wire silver" + small beads + dark tarnish patches, cool palette, in a dark sulfide host; slow cool glint. |
| Pyrite | `drawPyriteCube`, `drawPyriteOre` | 3–5 hard axis-aligned cubes (top/front/side faces, striations, specular + shadow vertices) in a dark host. |

Every renderer commits to: top-left light, hue-shifted ramps (lights
warm, darks cool), real hue-shifted outlines (never pure black), specular
discipline, and a per-mineral recognisability hook.

**Deliberate visual contrasts** (the gameplay-readability payoff):
- **Gold vs pyrite** — gold is soft rounded nuggets in a bright quartz
  host; pyrite is hard geometric cubes in a dark host. Real gold vs
  fool's gold should be tellable at a glance. That contrast is the point.
- **Gold vs silver** — both native metals, but gold is warm rounded
  nuggets in a pale quartz host and silver is cool curly wire in a dark
  host. The metal family (gold / silver / pyrite) reads as three
  distinct materials, not palette swaps of one.
- **Ruby vs emerald** — emerald is a tall thin upward fan; ruby is a
  squat equant cluster with a glow. Different silhouettes so the two
  gems (which share depth bands) never read as palette swaps.

---

## Deviations from NIGHT_PLAN — and why

NIGHT_PLAN is a spec; three calls were made against it during execution.
All three are judgment calls a reviewer should know about:

1. **Ruby was built instead of geode.** NIGHT_PLAN §4.4 scoped a *geode*
   as ore #4 — but a geode is a **new ore type with a new two-hit
   break mechanic**: it needs an `ORES` table entry, generation routing,
   a per-tile `cracked` state flag, drill-hit state machine, and a
   shatter→spawn-loose-gems path. That is a mechanics + world-gen change,
   not a renderer — exactly the high-risk, hard-to-finish-blind work the
   brief warns against. Ruby is an existing ore that was a flat blob with
   *no* flourish renderer at all — same risk profile as diamond/emerald.
   Swapping geode→ruby kept all five deliverables as pure, low-risk,
   fully-finishable renderers. Geode remains a strong idea — see below.

2. **No `PALETTE_MASTER` object.** NIGHT_PLAN §3 proposed a central
   palette object. Each of the five renderers instead carries its own
   local ramp (`var OUT, SHA, BAS, LIT, SPEC` at the top of the
   function). For five self-contained renderers a local ramp is more
   readable and matches the existing file (e.g. the v15.2 `SHOP_MAT`
   kit is a local ramp set). A global object pulled on by five
   functions is a refactor with little payoff at this scale. If the
   redesign expands to layers + 15 ores, revisit and centralise then.

3. **Inline flourish path, not the early-ore atlas.** NIGHT_PLAN §9 said
   route headline ores through the atlas pre-bake. They were kept on the
   inline live-render flourish path instead, for two reasons: (a) the
   atlas bakes art into static bitmaps — that would **freeze** the
   animations these ores rely on (diamond specular drift, ruby glow
   pulse, gold glint); the live path is what makes them move. (b) Routing
   new types through `buildEarlyOreAtlas` risks the four *locked* atlas
   ores. The per-frame raster cost is negligible at these ores' rarity
   (all are uncommon and deep; rarely more than 2–3 on screen). If a
   future perf pass flags it, the static *host + crystal silhouette*
   could be atlas-baked with only the animated glint drawn live.

---

## What did NOT ship (still open from NIGHT_PLAN)

Listed so nothing is lost. None of this is broken — it's simply not
started. The brief's rule was "five great ores beat fifteen mediocre
ones"; this pass stopped at five finished ores rather than starting
sixth-plus work that couldn't be finished and verified.

- **Geode** (NIGHT_PLAN §4.4) — the two-hit breakable ore. New ore type
  + break mechanic. Highest-novelty item left.
- **The Crystal Hollow cave layer** (§5) — a new mostly-void layer.
  Touches `LAYERS`, every ore's `minDepth`/`maxDepth`, moon offsets, the
  void-pocket generator, and a new biome wall. Largest remaining item.
- **`pickOre` peaked distribution** (§7) — gaussian per-ore depth peaks
  so each band has a signature ore. Self-contained, medium effort.
- **Layer identity pass** (§6) — wall/retint/ambient/bleed for deepcrust,
  magma, crystal.
- **The other ~12 ores** still use their original crude flourishes
  (cinnabar, amber, trilobite, uranium, obsidian, tanzanite, painite,
  unobtanium, methaneice). Cinnabar (red crystal druse
  on a host) and obsidian (volcanic glass — conchoidal fracture, sharp
  specular) are reasonable next renderer targets.

---

## Verification — what was and was not possible

**Done:** the file parses, the game boots, and the render loop runs clean
— confirmed by loading `sluice.html` in the preview (canvas
sizes to a real backing store, which only happens if the whole IIFE
parsed; liquid sim and render loop log normal startup). No errors
originate from the ore code (lines ~9170–9470 / the flourish block).
Every new function was also statically audited for runtime hazards
(no divide-by-zero, no out-of-range indexing, all args in valid range).

**Not done — visual pixel review.** The headless preview here **cannot
screenshot** (`preview_screenshot` times out). NIGHT_PLAN §0 proposed a
`toDataURL`→base64→file→Read loop as a workaround; in practice the
base64 export is too large to transcribe back into a file reliably, so
that loop did not pan out either. **The five ores have not been seen.**
They are principled but untuned — they need an owner pixel pass.

### How to review (owner)

1. Open `sluice.html`; press <kbd>`</kbd> (backtick) for dev
   mode — money clamps high, all shop purchases free.
2. Buy drill upgrades (diamond needs drill L4; pyrite/gold/emerald/ruby
   are lower). Drill down.
3. Approximate depths: **pyrite ~44, silver ~60, gold ~90,
   emerald ~140, ruby ~180, diamond ~288.** Compare each cluster
   side-by-side with coal — coal is the bar.
4. Watch for the animations: diamond's drifting glint, ruby's glow
   pulse, gold's travelling glint.

Tuning levers, if something reads wrong: each renderer's ramp is the
five `var`s at the top of the function. Crystal counts / sizes / spread
are the hashed loops in `draw<Ore>Ore`. The deposit blob shape itself
(`oreDepositPath`) was **not** changed.

---

## Pre-existing bug found (out of scope — logged separately)

While boot-testing v16.0, the console showed a repeating
`IndexSizeError: arc ... radius (-15.48) is negative` from the
**re-entry flame plume** (`drawReentryPlume`-area code, far from the ore
section). `git diff` confirms this code was **not touched** by v16.0 —
it is a pre-existing latent bug: a flame-ribbon history entry's age
timer can underflow and drive a computed `arc` radius negative. It fires
briefly during the fast spawn-fall. Unrelated to the ore work; flagged
as its own task so the v16.0 commit stays scoped to the redesign.

---

## For whoever continues

- Code lives in one place: grep `v16.0 — Underworld ore redesign` (two
  hits — the renderers, and the wiring in `render()`).
- The renderer pattern is proven and cheap to extend: write
  `draw<Ore>Ore(tx, ty, r, c, tNow)`, paint a host then the mineral
  with `(r,c)`-hashed geometry, add a one-line branch to the flourish
  block. Silver is the easy next ore (see above).
- Hard invariants still hold: `var` only, single IIFE, `TILE = 32`,
  `(r,c)`-deterministic ore geometry, no neighbour reads in a renderer,
  bump `GAME_VERSION` on every game-code change.
- Recommended next order: **`pickOre` peaked distribution**
  (self-contained, big feel payoff, verifiable as logic) → **geode**
  (the new ore + two-hit mechanic) → another renderer or two (cinnabar,
  obsidian) → **Crystal Hollow** (largest, do last).
