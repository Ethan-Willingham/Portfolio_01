# BALANCE.md: Sluice single-town progression model

This is the balance model for the free-forever **single-town** game (SINGLE_TOWN,
v25.x). The loop is: dig down, collect ore, fly up to sell + refuel + upgrade, go
deeper, repeat. Targets: a skilled **speedrun to the bottom ~20 min**, a normal
**playthrough ~1.5 hours**.

> **2026-07-03 ore redistribution (v25.35).** Town 0 was compressed 800 m -> **400 m**
> and its ore set widened from 19 to **all 32 ORES** (every one has a finished renderer,
> checked live). The old open read as coal + copper for 120 m; now the first 60 m carries
> coal, copper, malachite, bauxite + a rare gold "lucky strike", and each ~65 m band rotates
> a curated ~5-ore set with deliberate overlap (so the visible set changes as you descend).
> Ore VALUES and the drill/fuel/hull/upgrade curves are UNCHANGED (they were already tuned
> for this ~400 m arc). Total minable value ~**$1.43 M** (max upgrades ~$55 k = 3.8% of the
> world: abundant, not grindy). The world/ore tables below are updated; the time + income
> sections scale with the halved depth (roughly **0.6x** the old clock). Old saves retire on
> the SAVE_VERSION 2 -> 3 bump.

> This is a MODELED first pass. The math below is internally consistent and lands
> the targets, but feel (how the early grind reads, whether the magma gate bites
> too hard) is owner-playtest-only. See the Playtest checklist at the bottom. Use
> dev mode (backtick: money clamps to 999,999, purchases free) to jump around.

Conversion: 32 px = 1 tile = 1 meter. Depth in tiles == depth in meters.

---

## 1. The tuning decision (what changed, what did not)

The progression numbers (drill speed curve, fuel/cargo/hull caps, upgrade costs,
ore values/hp) were already tuned across many sessions for the 4-town world. The
single-town relaunch did NOT need new value/cost curves; it needed the **world
re-pointed at one deep town**. So the change is structural, not numeric:

- **Changed:** town 0 depth 350 -> **800**; its layer stack 3 calm layers -> a
  full **6-layer arc** (topsoil / subsoil / deepcrust / permafrost / magma /
  mantle); its ore set 5 ores -> the full **19-ore arc** (coal to unobtanium),
  value rising with depth. All in `015-regions.js` (`TOWN_DEPTHS[0]`,
  `TOWN_LAYERS[0]`, `TOWN_ORES[0]`).
- **Deliberately NOT changed:** `ORES` values/hp, `DRILL_SPEED`, fuel/cargo/hull
  caps, `shop.*` cost arrays. The model below shows they hit the targets as-is;
  re-tuning them would churn known-good numbers for no gain. They remain the
  levers if playtest says otherwise (Section 9).

This also re-justifies two upgrades the cuts had made dead in the old shallow
town 0: **Heated Drill** (the permafrost layer is a hard heat gate) and **Heat
Shield** (magma/mantle deal damage). The oil pump is hidden (oil is off). No dead
upgrade tiers remain (Section 7).

---

## 2. The world: 800 tiles, six layers, two gates

`TOWN_DEPTHS[0] = 400`. The shaft floor is bedrock at depth 400; `WORLD_ROWS`
(1408) still caps the grid (kept >= 1400 so `?multitown=1` town 4 still fits; the
single town leaves the rows below 400 as shared frozen bedrock, so it costs nothing).

| Layer | Depth (m) | Gate | Feel |
|---|---|---|---|
| topsoil | 0 to 60 | none | varied bootstrap: coal/copper/malachite/bauxite + rare gold |
| subsoil | 60 to 130 | none | base metals: iron/galena/magnetite/pyrite + rare amethyst |
| deepcrust | 130 to 200 | none | first treasures: silver/gold/jade/cinnabar/amber |
| permafrost | 200 to 270 | **Heated Drill** ($900) hard-gates the whole layer | blue ice: methaneice/cobalt/turquoise/lapis/fossil |
| magma | 270 to 340 | **Heat Shield** (8 hull/s without; halved L1, immune L2) | volcanic: obsidian/uranium/sulfur/emerald/peridot |
| mantle | 340 to 400 | Heat Shield (same) | crystal core: ruby/tanzanite/opal/diamond/platinum/painite/unobtanium |

- Permafrost is a HARD gate: `drillBlockReason` refuses every tile in the layer
  until `heatLevel >= 1`. By depth 440 the player has mined deepcrust gold/amber,
  so the $900 is affordable. Well telegraphed ("Need Heated Drill").
- Magma/mantle are SOFT gates: hull drains 8/s (shield 0), 3.2/s (shield 1), 0
  (shield 2). You can dip in unshielded (~12 s at 100 hull) but not linger.

---

## 3. Ore distribution (value rises with depth)

`TOWN_ORES[0]`, **all 32 ORES** across 400 m. Every type has a finished renderer (the
full set was rendered live and screenshotted, no fallback). `vein` = connected seam
(bulk metals, follow it); `scatter` = isolated find (gems + specials). reqDrill / reqHeat
are intrinsic to `ORES`. Bands **overlap deliberately** so the visible set rotates as you
descend, and two rare shallow **lucky strikes** (gold from ~22 m, amethyst from ~95 m)
give a new player an early jackpot. `015-regions.js` `TOWN_ORES[0]` is the source of truth.

Live tile counts + band value from an actual `?nosave=1` boot (`depositOreVeins` only
overwrites dirt/stone, so these are the real numbers, not the formula ceiling):

| layer | depth (m) | ores ($/ea) | ~tiles | band $ |
|---|---|---|---|---|
| topsoil | 0-60 | coal 5, copper 12, bauxite 25, malachite 45 | 1430 | $24k |
| subsoil | 60-130 | iron 35, pyrite 60, galena 70, magnetite 110 | 1150 | $76k |
| deepcrust | 130-200 | silver 90, cinnabar 140, gold 200, jade 240, amber 350, rhodochrosite 480 | 1230 | $260k |
| permafrost | 200-270 | cobalt 160, methaneice 180 (reqHeat), turquoise 200, lapis 320, fossil 600 | 840 | $205k |
| magma | 270-340 | obsidian 280, sulfur 360 (rD3), uranium 800 (rD3), emerald 900, peridot 1100 (rD4) | 630 | $340k |
| mantle | 340-400 | opal 900 (rD4), ruby 1400, tanzanite 2000 (rD3), platinum 2200 (rD5), diamond 3000 (rD4), painite 6000 (rD5), unobtanium 12000 (rD6) | 230 | $503k |
| lucky | 22-212 | shallow gold 200 + amethyst 280 | ~110 | $60k |

**Total minable value in the world ~ $1.43M.** Maxing every upgrade costs ~$55k
(Section 7), so the player extracts only ~3.8% of the world to win the economy:
abundant, not grindy. Money is bottom-heavy (mantle + magma hold ~60% of it), the
classic Motherload curve: the deep game floods cash, so the real time cost is the
early bootstrap. No ore is dominated (each owns a band, deeper bands carry higher
ceilings); none is unreachable (all within 0-400, reqDrill gates sit below where that
drill is affordable). Endgame ores stay weighty by hp + rarity: unobtanium hp9 is
~0.83 s/hit at max drill and only ~5 tiles exist in the whole world.

---

## 4. Drill model (descent speed)

`s/hit = DRILL_TIME(0.30) / DRILL_SPEED[L]`. A shaft tile is mostly dirt (hp1) /
stone (hp2); model the average shaft tile at **hp ~1.5**.

| drill L | s/hit | s/shaft-tile | reqDrill ores unlocked |
|---|---|---|---|
| 1 | 0.300 | 0.45 | - |
| 2 | 0.240 | 0.36 | - |
| 3 | 0.194 | 0.29 | sulfur, uranium, tanzanite |
| 4 | 0.158 | 0.24 | diamond, opal, peridot |
| 5 | 0.130 | 0.20 | painite, platinum |
| 6 | 0.109 | 0.16 | unobtanium |
| 7 | 0.092 | 0.14 | (max speed) |

Every tier is a real ~20-25% speedup AND most unlock deeper ore. No dead levels.

**Depth hardness (v25.61):** the s/hit above is the SURFACE time. Dirt/stone
(the worthless shaft filler, NOT ore) get tougher with depth so an under-tiered
drill feels the descent instead of only hitting the hard `reqDrill` walls. The
per-hit time is multiplied by `terrainDepthHardness(depth)` (040): 1.0 through the
topsoil intro (0..`TERRAIN_HARD_START` = 40 m), then a linear ramp to
`TERRAIN_HARD_MAX` (2.4x) at `TERRAIN_HARD_FULL` (380 m). So a level-1 drill in dirt
goes 0.30 s/tile at the surface to 0.72 s/tile at the floor, while a max drill stays
0.09 to 0.22. Ore hit times are untouched (the tuned hp curve above still holds).
The three constants live in 010 and are live-tunable as `drill.TERRAIN_HARD_*` in
the L panel (set `MAX` to 1 to disable). Note the fuel knock-on: `fuel/tile =
2.3 * s/tile`, so deep filler also costs more fuel per tile for an under-tiered rig.

---

## 5. Fuel model (depth per trip is the descent limiter)

Falling burns 0 fuel; drilling burns `DRILL_FUEL(1.5) + FUEL_DRAIN(0.8) = 2.3/s`.
So `fuel/tile = 2.3 * s/shaft-tile`. With a teleporter to exit (the standard
deep-run tool, $400) you can spend ~85% of a tank digging:
`tiles/trip = 0.85 * tankCap / (fuel/tile)`.

| fuel L | tank | paired drill L | fuel/tile | new tiles dug per trip |
|---|---|---|---|---|
| 1 | 30 | 1 | 1.04 | ~25 |
| 2 | 55 | 2 | 0.83 | ~56 |
| 3 | 85 | 3 | 0.67 | ~108 |
| 4 | 120 | 4 | 0.55 | ~187 |
| 5 | 165 | 5 | 0.45 | ~312 |
| 6 | 220 | 6 | 0.38 | ~496 |
| 6 | 220 | 7 | 0.32 | ~590 |

Each trip you fall down the EXISTING shaft for free (400 tiles is ~17 s at
MAX_FALL 740 px/s) to the dig face, then dig the increment above. So reaching 400
is naturally multi-trip early (deep, fuel-limited) and collapses to ~2 trips once
fuel/drill are high. This is the "go a little deeper each run" rhythm.

---

## 6. Income model (per trip, by phase)

`income/trip ~= cargoCap * avg ore value in the band`. Cargo cap = `5 + 4*(L-1)`:
5 / 9 / 13 / 17 / 21 / 25 / 29 for L1..7. Selling is the flat refuel-pad payout
(`sellCargo`), no market multiplier, so model it as raw `ORES.value` (x5 if shiny,
1% chance).

| phase | depth | cargo | avg ore $ | $/trip |
|---|---|---|---|---|
| bootstrap | 0-60 | 5-9 | ~15 (coal/copper/malachite) | $75-200 |
| early | 60-130 | 9-13 | ~55 (iron/galena/magnetite/pyrite) | $500-900 |
| mid | 130-200 | 13-17 | ~230 (silver/gold/jade/amber) | $3k-4k |
| deep | 200-270 | 17-21 | ~300 (ice/cobalt/lapis/fossil) | $5k-7k |
| magma | 270-340 | 21-25 | ~800 (uranium/emerald/peridot) | $17k-25k |
| mantle | 340-400 | 21-29 | ~3000+ (diamond/painite/unob) | $60k-300k |

Income is gently exponential: the mantle floods money, so the time cost is the
**early/mid bootstrap**, not the deep game (classic Motherload curve).

---

## 7. Upgrade ladder (no dead tiers; ~$55k to max)

Costs from `shop.*` (`020-state.js`). `costs[L]` = price L -> L+1.

| line | tiers | total to max | what each tier buys |
|---|---|---|---|
| drill | 1->7 | $24,770 | -20%/tier dig time + reqDrill unlocks |
| fuel | 1->6 | $4,530 | +25 to +55 tank = deeper per trip |
| cargo | 1->7 | $34,560 | +4 slots = more $/trip |
| hull | 1->7 | $29,870 | +60 HP = magma + fall survival |
| booster | 1->5 | $6,450 | faster shaft climb-out |
| heat | 0/1 | $900 | unlock permafrost (hard gate) |
| shield | 0/1/2 | $7,800 | magma damage halved -> immune |
| vert | 0/1 | $1,500 | drill upward (QoL) |
| ~pump~ | - | - | HIDDEN (oil off); not buyable |

A "bottom-ready" speedrun loadout (not everything maxed) is roughly: drill L6,
fuel L6, cargo L5, booster L4, hull L4, heat, shield L2, ~8 teleporters ~=
**$40-50k**. Maxing literally everything ~ $110k, still a small fraction of the
$2.14M in the ground.

Every tier gives a felt benefit (smooth curves, no breakpoint dead-zones). The
only pruned line is the oil pump, hidden behind `ENABLE_OIL`.

---

## 8. Time-to-bottom estimate

A round trip (fall to face + dig increment + teleport out + sell + buy) is ~1 to
3 minutes depending on depth.

**Skilled speedrun (~20 min):**
1. Bootstrap + early (0 -> ~150 m, $0 -> ~$15k for the drill L5 / fuel L5 / cargo
   L4 / booster L3 / heat "reach-magma" kit): ~5-8 trips, **~9-12 min**. The
   dominant cost.
2. Mid -> magma (buy shield, drill L6, fuel max): ~2-4 trips, **~5-8 min**.
3. Magma -> mantle -> floor (money floods, finish the descent): ~1-3 trips,
   **~4-6 min**.
   Total **~18-26 min**, centered ~20.

**Normal playthrough (~1-2 hr):** a casual player drills slower (lower drill tiers
longer), explores horizontally, dies sometimes (respawn costs the cargo + a 10%
salvage fee), and buys sub-optimally. That is ~3-5x the speedrun = **~1-2 hr**,
landing in the target band.

The single biggest time lever is the **bootstrap** (Section 6 phase 1-2): how fast
$0 becomes the ~$15k reach-magma kit. If playtest says the open is a slog, the
cheapest fixes are Section 9.

---

## 9. Levers to re-tune (in priority order)

If playtest feel is off, change these (one at a time, re-measure):

1. **World depth** `TOWN_DEPTHS[0]` (015): deeper = longer everything. The master
   time dial. (Keep `WORLD_ROWS` >= it.)
2. **Bootstrap speed** (if the open drags): nudge `TOWN_ORES[0]` topsoil/subsoil
   `chance` up, or raise early `ORES` values (coal/copper/iron), or start the
   player with a little money (`init()` in 040), or +1 starting cargo
   (`getMaxCargo`). Smallest, highest-impact feel fix.
3. **Income rate overall**: `EARTH_ORE_SPAWN_MULTIPLIER` (010, currently 0.26)
   scales ALL ore density at once. Up = richer/faster, down = leaner/longer.
4. **Upgrade pace**: `shop.drill` / `shop.fuel` / `shop.booster` arrays (020).
   Front-load cheaper to speed the early arc.
5. **Depth-per-trip**: fuel caps `getMaxFuel` (040) and the `2.3/s` drill burn
   (`DRILL_FUEL`+`FUEL_DRAIN`, 010). Bigger tanks = fewer trips.
6. **Gate placement**: the permafrost/magma `minDepth` in `TOWN_LAYERS[0]` (015)
   set when Heated Drill / Heat Shield become mandatory.

---

## 10. Playtest checklist (dev mode = backtick)

- [ ] Fresh boot (no old save): world is ONE town, surface station + rig deck,
      terrain renders, no console errors. (`?nosave=1` for a clean run.)
- [ ] Drill straight down. Confirm the six layers read distinctly: topsoil ->
      subsoil -> deepcrust -> the blue permafrost ice band -> orange magma ->
      red mantle, with the floor (bedrock) at ~800 m.
- [ ] Permafrost gate: without Heated Drill, the drill refuses every permafrost
      tile ("Need Heated Drill"). Buy it ($900), confirm you pass.
- [ ] Magma gate: unshielded, hull drains with the warning; Heat Shield L2 makes
      magma/mantle safe. Confirm it is survivable-but-tense, not instant death.
- [ ] Ore arc reads: cheap metals shallow, gems deep, value clearly rising. Deep
      gems (diamond/painite/unobtanium) feel weighty to extract and are rare.
- [ ] Economy pace: time a rough run. Does the bootstrap drag? Does the mantle
      flood money too early? Tune via Section 9.
- [ ] Dev shortcut: backtick clamps money to 999,999 and frees purchases, so you
      can buy the bottom-ready loadout and dive to verify the deep layers fast.
