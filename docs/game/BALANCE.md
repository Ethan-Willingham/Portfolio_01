# BALANCE.md: Sluice single-town progression model

This is the balance model for the free-forever **single-town** game (SINGLE_TOWN,
v25.x). The loop is: dig down, collect ore, fly up to sell + refuel + upgrade, go
deeper, repeat. Targets: a skilled **speedrun to the bottom ~33 min**, a normal
**playthrough ~2 to 3 hours**.

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

`TOWN_DEPTHS[0] = 800`. The shaft floor is bedrock at depth 800; `WORLD_ROWS`
(1408) still caps the grid (kept >= 1400 so `?multitown=1` town 4 still fits).

| Layer | Depth (m) | Gate | Feel |
|---|---|---|---|
| topsoil | 0 to 120 | none | the bootstrap; cheap metals |
| subsoil | 120 to 280 | none | base metals |
| deepcrust | 280 to 440 | none | precious metals, first gems |
| permafrost | 440 to 580 | **Heated Drill** ($900) hard-gates the whole layer | ice band |
| magma | 580 to 720 | **Heat Shield** (8 hull/s without; halved L1, immune L2) | volcanic, push-your-luck |
| mantle | 720 to 800 | Heat Shield (same) | the legendary core |

- Permafrost is a HARD gate: `drillBlockReason` refuses every tile in the layer
  until `heatLevel >= 1`. By depth 440 the player has mined deepcrust gold/amber,
  so the $900 is affordable. Well telegraphed ("Need Heated Drill").
- Magma/mantle are SOFT gates: hull drains 8/s (shield 0), 3.2/s (shield 1), 0
  (shield 2). You can dip in unshielded (~12 s at 100 hull) but not linger.

---

## 3. Ore distribution (value rises with depth)

`TOWN_ORES[0]`, 19 ores. Only renderer-proven ores (each already shipped in a live
town) are used, so nothing renders as a fallback. `vein` = connected seam (bulk,
follow it); `scatter` = isolated find. reqDrill / reqHeat are intrinsic to `ORES`.

Tile counts from the real `depositOreVeins` math:
`tiles = 320 * bandH * chance * 0.26 * (1 + bandH*0.001)`, only overwriting
dirt/stone (so live counts run a bit below these).

| ore | band (m) | $/ea | hp | gate | placement | ~tiles | band $ |
|---|---|---|---|---|---|---|---|
| coal | 4-150 | 5 | 2 | - | vein | 1462 | 7.3k |
| copper | 30-240 | 12 | 2 | - | vein | 1586 | 19k |
| bauxite | 120-320 | 25 | 3 | - | vein | 998 | 25k |
| iron | 150-380 | 35 | 3 | - | vein | 1177 | 41k |
| pyrite | 200-420 | 60 | 3 | - | vein | 670 | 40k |
| silver | 280-500 | 90 | 3 | - | vein | 670 | 60k |
| cinnabar | 300-500 | 140 | 4 | - | scatter | 439 | 61k |
| gold | 320-560 | 200 | 4 | - | scatter | 495 | 99k |
| amber | 300-520 | 350 | 3 | - | scatter | 447 | 156k |
| methaneice | 440-600 | 180 | 4 | reqHeat | vein | 695 | 125k |
| fossil | 420-600 | 600 | 4 | - | scatter | 247 | 148k |
| obsidian | 560-740 | 280 | 4 | - | vein | 530 | 148k |
| uranium | 600-760 | 800 | 5 | reqDrill3 | scatter | 247 | 198k |
| ruby | 620-760 | 1400 | 5 | - | scatter | 159 | 223k |
| tanzanite | 640-760 | 2000 | 5 | reqDrill3 | scatter | 101 | 202k |
| emerald | 700-800 | 900 | 5 | - | scatter | 128 | 115k |
| diamond | 720-800 | 3000 | 6 | reqDrill4 | scatter | 65 | 195k |
| painite | 740-800 | 6000 | 7 | reqDrill5 | scatter | 26 | 156k |
| unobtanium | 760-800 | 12000 | 9 | reqDrill6 | scatter | 10 | 120k |

**Total minable value in the world ~ $2.14M.** Maxing every upgrade costs ~$55k
(Section 7), so the player only extracts ~2.5% of the world to win the economy:
abundant, not grindy. No ore is strictly dominated (each owns a depth band and
deeper bands carry higher ceilings); none is unreachable (all within 0-800, and
reqDrill gates sit below where that drill level is affordable). Endgame ores stay
weighty by hp + rarity: unobtanium hp9 ~ 0.83 s/hit at max drill, only ~10 tiles.

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

Each trip you fall down the EXISTING shaft for free (800 tiles is ~34 s at
MAX_FALL 740 px/s) to the dig face, then dig the increment above. So reaching 800
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
| bootstrap | 0-150 | 5-9 | ~10 (coal/copper) | $50-150 |
| early | 150-300 | 9-13 | ~40 (iron/pyrite/bauxite) | $400-700 |
| mid | 300-440 | 13-17 | ~200 (silver/gold/amber) | $2.6k-4k |
| deep | 440-580 | 17-21 | ~300 (ice/fossil) | $5k-7k |
| magma | 580-720 | 21-25 | ~1000 (uranium/ruby/tanz) | $20k-30k |
| mantle | 720-800 | 21-29 | ~3000+ (diamond/painite/unob) | $60k-300k |

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

**Skilled speedrun (~33 min):**
1. Bootstrap + early (0 -> ~300 m, $0 -> ~$15k for the drill L5 / fuel L5 / cargo
   L4 / booster L3 / heat "reach-magma" kit): ~8-12 trips, **~14-18 min**. The
   dominant cost.
2. Mid -> magma (buy shield, drill L6, fuel max): ~3-5 trips, **~8-12 min**.
3. Magma -> mantle -> floor (money floods, finish the descent): ~2-4 trips,
   **~6-10 min**.
   Total **~28-40 min**, centered ~33.

**Normal playthrough (~2-3 hr):** a casual player drills slower (lower drill tiers
longer), explores horizontally, dies sometimes (respawn costs the cargo + a 10%
salvage fee), and buys sub-optimally. That is ~3-5x the speedrun = **~1.5-3 hr**,
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
