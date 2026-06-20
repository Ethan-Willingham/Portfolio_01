# WORLD_DESIGN.md: Sluice layers, ores, liquids, slimes

The content-design think-tank for the wide four-town world. This is the design
SEQUENCE the owner asked for: figure out the layers (how big, what), then every
special, then every ore, then every liquid, then every slime, THEN art, THEN
banners + stations. Pairs with **MINERALS_BIBLE.md** (the ore ART framework,
already mature) and **EXPANSION_PLAN.md** (the build plan + decision log).

Research-driven (Terraria, SteamWorld Dig, Motherload, Minecraft, Stardew, Deep
Rock Galactic, Dome Keeper, Core Keeper, Noita, The Powder Toy). Living DRAFT,
2026-05-28: react and refine stage by stage; nothing here is built yet.

**Two givens that shape everything:**
- The ore ART is mostly done (~16 of ~20 ores) and SETS THE TONE; see MINERALS_BIBLE (tile contract, 10 archetypes, palette atlas). New ores match it. Existing ores are NOT locked to their current depths: redistribute freely.
- Town 1 (intro) is deliberately LOW variety: fewer but BIGGER layers, ~2 specials plus a few regular ores. Variety + exotica grow town by town.

---

## 0. Design pillars (from the research)

- **Layers:** a thin intro band, then one BIG signature band, then a thin dramatic payoff cap (the Terraria shape). A layer reads as "new" only when 2-3 identity dimensions change at once; palette + terrain hardness + ore set are the cheap ones for an intro.
- **Ores:** a short spine of grindable **regulars** (vein, follow-the-seam) plus a thin garnish of dramatic **specials** (scatter, a memorable reveal), about 3-4 to 1. Value is **geometric** (2-5x per tier). Low tiers **retire** (round toward worthless) as you descend, so no obsolete grind. Each town **owns a depth band** with a triangular ore peak.
- **Liquids:** a Noita-style **data-table** of reactions resolved by **probabilistic local contact** (gradual hiss-and-convert, cheap), but **Minecraft restraint**: about 6 to 10 iconic, memorizable, exploitable reactions, not a chemistry set. Each liquid has ONE verb and a distinct flow speed.
- **Slimes:** tile-sized, dig-out-able, pushable blocks; push the correct slime into the correct pooled liquid to transmute it into a NEW liquid. Learn by doing; telegraph every reaction.
- **Cognitive load:** keep the LIVE set small. 4 to 6 ore types readable in any one depth band; the full library can be ~20.
- **Escalation:** variety grows monotonically across the four towns (more layers, more ores, plus one NEW special verb and one new hazard per town). Visual drama should escalate even faster than mechanical difficulty.

---

## 1. Layers: how big, and what

**Layer template** (every layer is defined on these dimensions):

| Field | Notes |
|---|---|
| depthStart / depthEnd (tiles) | band thickness |
| palette / bg | must change between adjacent layers (the instant read) |
| terrain hardness (hp / dig time) | ramps monotonically with depth; the primary felt gate |
| ore set | which ORES + value band; 1-2 in intro layers, more later |
| hazard | none for intro layers; +1 new hazard per layer from Town 2 |
| gate | at most one hard gate per town (reqDrill / reqHeat / barrier), at a tense-to-payoff boundary |
| music / ambience | optional early; a strong identity lever later |
| special feature | reserved for mid/late towns (structures, lava pools, glowmilk caverns) |

**Layer-size targets:** intro layers **80-180 tiles**; mid/late layers **60-120**; a town's signature band may run **150-250** if it has internal variety; the climactic **payoff cap 30-60** (thin and loud). Below ~25-30 tiles a layer is whiplash; above ~250 of one identity with no new idea is a grind.

**Count + size scaling across the four towns** (~350 to ~1400 tiles deep):

| Town | Total depth | Layers | Feel | Variety |
|---|---|---|---|---|
| 1 (intro) | ~350 | **3** | big, even (~100-130 each) | low: palette + ore only, 1 soft gate |
| 2 | ~600 | 4 | ~120-160 each | +1 hazard, +ore tier |
| 3 | ~1000 | 5 | ~150-200 each | +1 hazard, harder gates, a special feature in the payoff band |
| 4 (endgame) | ~1400 | 6 | one long signature band + several tense bands + a thin climactic cap | full: stacked hazards, multiple gates, music shift, structures |

The COUNT scales with depth; individual layers do not grow proportionally.

**Town 1 stack (proposed):** safe, tense, payoff; only palette + ore + a small hardness bump change:
1. **Topsoil / Loam: depth 0 to ~130 (~130 tiles, SAFE).** Warmest/softest palette, lowest hp. The two starter regulars. No hazard. Where the player learns dig, sell, upgrade. Big on purpose.
2. **Hardpan / Stone: ~130 to ~280 (~150 tiles, TENSE).** Cooler/greyer, a clear hardness step (the drill first feels slow). Adds one mid regular. ONE soft gate near the bottom (a reqDrill-2 ore, or a light barrier seam) to teach the gating language without hard-walling.
3. **Bedrock Shelf: ~280 to ~350 (~70 tiles, PAYOFF CAP).** Darkest of Town 1, faintly dramatic (a hint of the heat/warning vocabulary later towns exploit). Town 1's best ore concentrated here; the barrier-band boundary at ~350 caps the town and motivates crossing the first No Man's Zone.

This replaces MINERALS_BIBLE's old single-town depth bands (its §2); each town gets its own `LAYERS`-style stack and `getLayerForDepth` becomes `getLayerForRegion(depth, townIndex)`.

---

## 2. Specials: the memorable garnish

A **special** is: scattered (NOT veined, so you cannot farm it on demand), a distinct silhouette / reveal, and ideally a different **verb**. Specials interrupt the rhythm of regular mining, which is what makes them memorable (Stardew geodes, Minecraft ancient debris). Ratio ~3-4 regulars to 1 special per area. Give a marquee rare a **pity floor** (cannot appear before N finds) so the rarest is earned, not cruel.

**One new special VERB per town**, so progression is felt as widening possibility, not just bigger numbers:
- **Town 1:** the **fossil** reveal + the **amber** inclusion (two flavors of "ooh", visual-only for now).
- **Town 2:** a **crackable geode** node (a Stardew-style mystery box you process).
- **Town 3:** a **multi-piece fossil / assembly** (collect parts for a bonus).
- **Town 4:** a **volatile / exotic** find (a one-off, maybe reacts).

OPEN: do specials need a real "verb" system (geode cracking, fossil assembly) in P1, or stay visual-only at first? Recommend visual-only for Town 1, build the first verb (geode) at Town 2.

---

## 3. Ores: roster + per-town distribution

The ART library is ~20 ores (MINERALS_BIBLE). Distribution is the design work: which ores live in which town/layer, the value curve, and the few new ones to add. Keep the LIVE set per band to **4 to 6**.

**Value framework across the four towns** (geometric; cheapest regular of a town is roughly the previous town's mid-tier; low tiers retire one town later):

| Town | Regular value band | Top special | # specials |
|---|---|---|---|
| 1 | $10 to $80 | ~$300-500 | 2 |
| 2 | $80 to $600 | ~$2-3k | 3 |
| 3 | $500 to $5k | ~$20k | 4 |
| 4 | $4k to $40k | ~$200-500k | 5 |

**Town 1 ore set (proposed, all existing art):**
- **Coal** ~$10: cheapest grindable, dense veins, teaches "follow the seam."
- **Copper** ~$30: the staple regular, the income backbone.
- **Iron** ~$70-80: rarer regular, bigger value step, gated behind the first drill tier (teaches "upgrades unlock ore").
- **Fossil** (special) ~$300: the showcase, scattered singletons, ~1 per descent, the big reveal.
- **Amber** (special) ~$150-200: the second, more-common special so the player learns specials are not all alike.

Distribution: **regulars vein** (clusters that reward following), **specials scatter** (single blocks, a detour decision), each town a **triangular depth peak**. BUILT (v23.57): `pickOre` was replaced by `depositOreVeins()` (030), which injects ore into settled rock after the cave CA. Regulars carry `vein:N` (a frontier random-walk grows a connected seam of mean ~N tiles); specials carry `scatter` (single tiles). Density is preserved from the old per-tile roll. Still tunable: depth-weighted triangular peaks within a band, a pity floor for the rarest specials.

OPEN: the full town-by-town map of all ~20 existing ores + which new ones to add for Towns 2-4.

---

## 4. Liquids: roster + reaction system

Roster + reactions researched 2026-05-28 (Noita / The Powder Toy / Sandspiel / Minecraft / Terraria / ONI). The ARCHITECTURE was revised 2026-05-29 by owner directive, below.

### 4.0 ARCHITECTURE: extend the WebGPU MLS-MPM particle sim to N materials

**Owner directive (2026-05-29, LOCKED):** every new liquid is a new MATERIAL inside the existing MLS-MPM water/oil PARTICLE sim. There is ONE liquid system. Do not build a separate/cellular liquid layer.
- The LIVE solver is the WebGPU compute MLS-MPM in `js/liquid-wgpu.js`; the CPU code in `070-collision-liquids.js` is the bit-faithful fallback + self-test reference. Changes land in the WGSL kernels FIRST (the live path) and mirror into the CPU reference (the `edit²` lockstep, TUNING §2.9). The self-test must stay green.

**The generalization.** Today a particle carries a 1-bit `liquidType` (water=0, oil=1) and per grid cell the physics constants are a mass-weighted blend of the water/oil constant-sets via `oilK = liquidCellOilMass / cellMass` (`070:558-563` + the WGSL mirror). Oil floats only because its gravity is lower. Generalize to a material id (0 to 5) + per-material property tables, and make the per-cell blend an **N-material mass-weighted average** of those tables. This preserves water/oil behaviour exactly and density ordering (lava sinks, oil floats) falls out of per-material gravity, as oil's does now.

**The known-hard bits are problems to solve IN the sim, not reasons to fork:** widen the `flag` type field 2 to 3 bits (6 materials overflow 2 bits); add per-material `SimParams` lanes; swap every WGSL `select(water, oil, …)` for an indexed material lookup; per-cell per-material mass accumulators for the weighted blend; a per-material `RenderParams` colour + a new emissive path for lava/glowmilk; reactions as a sim pass.

**Reverted (2026-05-29):** the earlier two-tier proposal (a separate cellular tile-grid for the new liquids, shipped as `075-cellular-liquids.js` v23.60 to v23.62) was vetoed by the owner and fully removed. Roster + reaction design below survive; only the implementation substrate changed (particle sim, not cellular grid).

### 4.1 Roster (6 liquids, all particle materials)

| Liquid | Flow | Density | Damage | hot | Emissive | Verb / role |
|---|---|---|---|---|---|---|
| Water (have) | fast | 50 | 0 | no | no | base reagent; douses; the swimming fluid |
| Oil (have) | medium, floats | 40 | 0 | no | no | flammable fuel; floats on water |
| **Lava** | very slow | 90 | high | YES | YES (orange) | marquee hazard + light; the reaction hub |
| **Acid** | medium | 55 | mid | no | no | dissolves corrodible tiles + damages hull |
| **Mud / slurry** | very slow | 70 | 0 | no | no | harmless; slows movement; soft landing; bakes to stone in lava |
| **Glowmilk** | medium | 45 | 0 | no | YES (cyan) | the reward liquid: lights caverns, marks rare pockets; mostly slime-made |

**Property model (per-material tables; ONI/DF temperature/state is a tax we skip):** the existing `LIQUID_*` physics set (gravity, damping, bounce, friction, aeration) per material, plus `density` (int; sink/float ordering), `damage` (hull/heat per tick), `hot` (bool; drives the lava rows), `emissive` (colour or null), `color`/`alpha`/`size`. Gravity encodes density ordering (as oil does now). Deliberately NOT modelled: continuous temperature, pressure, gas/state chains, heat conductivity.

**Brine and tar are slime PRODUCTS, not found liquids** (made in §5: salt-slime + water -> brine, ash-slime + oil -> tar). Keeping them out of the found-roster lands us at Terraria's proven 6-liquid ceiling.

### 4.2 Reaction system (data table, ~8 rows)

A Noita-style flat table of rows `{ a, b, outA, outB, p, fx }` (a/b can be a TAG: `[hot]`, `[corrodible-tile]`, so one row covers many materials). Resolved as a **sim pass over particles/cells on local contact**: where two different materials (or a material and a corrodible tile) occupy adjacent cells, fire with probability `p` per step. Auto-rate-limited (gradual visible convert), O(contacts). EVERY reaction must TERMINATE (steam expires, stone is solid) so nothing loops forever (Sandspiel's non-negotiable). Because all liquids now live in ONE sim, water/oil-involving rows are just same-sim material contacts (no cross-system bridge needed).

| # | a | b | outA | outB | p | Exploit / precedent |
|---|---|---|---|---|---|---|
| 1 | lava | water | stone (tile) | steam | 0.7 | bridge / wall-making (Minecraft, Noita 80) |
| 2 | lava | oil | lava | fire | 0.7 | burn off flammable pools (Noita lava+burnable) |
| 3 | `[hot]` | water | same | steam | 0.2 | extinguish; safe descent (Noita 20) |
| 4 | acid | `[corrodible-tile]` | acid | (tile dissolves) + fizz | 0.15 | dig channels (Noita acid 50) |
| 5 | mud | lava | stone (tile) | steam | 0.5 | bake slurry into permanent floor (Minecraft) |
| 6 | acid | slime | water | (slime consumed) | 0.2 | slime neutralizes acid (§5; Noita slime-as-stabilizer) |
| 7 | slime | water | glowmilk | (slime consumed) | det. | the reward transmute (§5; Terraria shimmer) |
| 8 | slime | lava | mud | (slime consumed) | det. | slime tames lava to walkable mud (§5) |

Rows 1 to 5 ship in the liquids stage; rows 6 to 8 are slime-driven and ship with §5.

**Telegraph every reaction (teach by feedback):** instant output colour shift + a short particle burst at the contact (steam / acid fizz / glow spark) + a distinct one-shot sound (audio workstream, `audio-lab.html`) + a first-time-only floating label ("LAVA + WATER = STONE").

### 4.3 Build order (each its own focused session + commit; validate against the GPU/CPU self-test + a Node/JXA harness, since the preview cannot run the RAF loop)

- **0 Revert the cellular detour: [DONE 2026-05-29]** removed `075-cellular-liquids.js` + its wiring (030 seed, 350 step + F demo, 140 draw, 120 wake); docs flipped to this section.
- **1 Material-id refactor [NEXT, behavior-preserving]:** generalize `liquidType` (bit) to a material id + per-material property tables + the N-material weighted-average cell blend, across the WGSL kernels AND the CPU reference. Water/oil must behave IDENTICALLY and the self-test must stay green. No new liquids visible yet. This is the foundation and the riskiest piece, so prove it bit-faithful first.
- **2 Add lava** as the first real new material (own gravity/density/colour); verify it sinks/flows/pools as particles.
- **3 Acid + mud + glowmilk** + the emissive render path (lava/glowmilk glow).
- **4 Reactions** (the rows above) as a sim pass + telegraphs.
- Then worldgen pools (spawn the materials via `addLiquidParticle`) + a dev demo to view them at spawn.

Per-cell blend decision (owner-approved): **mass-weighted average** of per-material constants (preserves water/oil exactly; costs N per-cell mass accumulators), over the cheaper dominant-material alternative.
- **3c Cross-tier bridge:** rows 1 to 3 (lava+water->stone+steam, lava+oil->fire, hot+water->steam) via the particle-field query.
- **3d Glowmilk polish:** emissive render path (additive / soft bloom) + rare generation; sets up the §5 slime transmute that makes it.

---

## 5. Slimes: pushable material blocks + the combine mechanic

Tile-sized **slime blocks** generate underground, the player **digs them out and pushes them**, and pushing the correct slime into the correct pooled liquid transmutes the pool into a NEW liquid (consuming the slime). The player chooses to combine, watches the pool convert, and learns the reaction table one push at a time.

**Build on the jello system (confirmed by the research).** Sluice's jello soft-body engine (`340-jello.js`: flood-fill activation, PBD/XPBD sim, FleX contact, player-shove coupling, squeeze-through-gaps, lazy activation, per-body `hue`) already delivers the squishy push feel the owner wants, and its squeeze-through-gaps behavior structurally avoids the Sokoban soft-lock (a slime can never permanently wedge, so no undo needed). So a slime is a **jello body with a variant profile**, NOT a new rigid pushable:
- variant fields: `hue` (per reagent), a softer/lighter material preset (lower stiffness, higher inflation), and a `reagent` id;
- **gravity + minability as per-variant booleans** (slimes fall when undermined and are diggable; jello today is unminable + bomb-proof, so add these as variant PROPERTIES and leave jello's invariants untouched);
- do NOT fork the solver; respect the `JELLO_MAX_BODIES` / `MAX_POINTS` budget (keep clusters tiny; buried ones stay free static tiles per the lazy-activation invariant).

**Generation:** re-enable the `generateJelloPatches` scaffold (currently `bands = []`, v17.96) for a `slime` tile, seeding **1-2 small 4-connected clusters (2-4 tiles) as a halo within ~6-10 tiles of the liquids they react with**, embedded in solid terrain so the player digs them out (Boulder Dash "mine it, then it is yours"). Reagent-tinted so a sharp player infers "this slime near that liquid does something."

**Push + delivery:** the existing jello shove (momentum + squish). Slimes **fall when undermined and sink slowly**, so dropping one down a shaft onto a liquid pool below is the most satisfying delivery (Boulder Dash gravity).

**The reaction (alchemy, not accident):** each frame, sample the liquid grid under an active slime body's boundary ring; if enough perimeter is submerged in the matching liquid, fire a **clean deterministic conversion** (not Noita's slow drip): dissolve the slime, convert the contacted liquid cells to the product. Feedback is the whole point: a brief flash, the slime visibly melting in, a color bloom spreading through the liquid, a chime + bubbling SFX (an audio-workstream item), and a first-time floating-text label naming the recipe ("OIL + ASH SLIME = TAR"). **Teach by necessity (Baba Is You's principle):** stage one guaranteed shallow setup (a water pool with a slime embedded beside it + a faint hint) so the player's first dig-and-push necessarily produces a reaction; after that it is discovery.

**Reaction target vs build start.** The full design target is the curated slime+liquid table from §4 (slime + water / lava / acid / brine / oil / glowmilk). But the BUILD starts small with the **two liquids that already exist** and **two recipes**, then grows multiplicatively as liquids are added:
- **Salt slime + water -> brine** (a denser water variant).
- **Ash slime + oil -> tar** (a thick, slow, sticky/flammable pool).
Add a third liquid as a **product-only** material first (you make it before you can find it) so discovery feels earned; later let products be reagents (chained alchemy). A small **recipe book** records found recipes (Terraria gates gel behind a station; same "this is special" framing).

**Build order (each its own session + commit):** (1) `slime` tile + worldgen halo seeding; (2) jello variant flag with the soft/light preset + gravity + minability; (3) one safe surface teaching setup; (4) the boundary-vs-liquid reaction probe + the first water recipe with full feedback; (5) the second recipe; (6) recipe-book UI. Validate contact/reaction changes with a JXA/Node numerical harness (the preview cannot run the RAF loop).

---

## 6. Art (after the systems are designed)

The remaining unfinished ores (magnetite, cobalt, jade, opal, diamond, painite, unobtanium) get art via the MINERALS_BIBLE §9 per-ore loop. Any NEW ores for Towns 2-4, plus the new liquids and slime materials, follow the bible's tile contract (32x32, upper-left light, per-pixel, host-shows-through) + the palette atlas.

---

## 7. Build sequence (the staged order the owner set)

Design each stage, lock it, THEN build it. Implementation slots into the region-aware world from EXPANSION_PLAN P0.

1. **Layers** (§1): per-town `TOWN_LAYERS` stacks + `getLayerForRegion(depth, townIndex)`; Town 1 first. **[SHIPPED v23.53]**
2. **Specials + Ores** (§2/§3): per-town `TOWN_ORES` tables + a `depositOreVeins()` pass (regulars grow `vein:N` seams, specials `scatter` as singles); existing ores redistributed. **[SHIPPED v23.57]**
3. **Liquids** (§4): the curated roster + the data-table reaction system. **[NEXT]**
4. **Slimes** (§5): the dig-out/push mechanic (jello-based) + the slime+liquid reactions.
5. **Art** (§6): remaining ores + new material art.
6. **THEN** zone banners (Frontier-Soviet, threat-tier escalating per EXPANSION_PLAN) + per-town stations.

---

## Open questions (to resolve with the owner)

- Town 1 exact layer depths + the hardness curve. [RESOLVED, shipped v23.53: topsoil 0-130 / hardpan 130-280 / shelf 280-350. Hardness curve still a tuning pass.]
- The full town-by-town redistribution of all ~20 existing ores. [RESOLVED, shipped v23.57: TOWN_ORES. New ores for Towns 2-4 still open, gated on art.]
- Final liquid set: LOCKED at 6 (water + oil Tier-1 MLS-MPM; lava + acid + mud + glowmilk Tier-2 cellular; brine + tar are slime products), pending owner veto of the two-tier architecture (§4.0). Open: the "glowmilk" name.
- Slimes: jello-reuse is CONFIRMED (variant flag); start with 2 slime types / 2 recipes on water+oil. Open: the exact soft-feel preset values; do reactions key on a specific slime type or does any slime work on a given liquid.
- Do specials get real verbs (geode cracking, fossil assembly) in P1, or visual-only first?
