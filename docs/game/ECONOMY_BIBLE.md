# ECONOMY BIBLE

The trading economy for Sluice: buy low, sell high, with risk. Inspired by
Tradewinds. This is the spec the Trade Board's static placeholder prices were
always waiting for ("the economy lands later", `260-shop-board.js`). It is the
named, deferred system that the four towns were built to enable (see
EXPANSION_PLAN.md, "Explicitly out of scope (deferred): the trading system,
prices that rise and fall across towns").

Status: in active build (see "Staged build plan" at the bottom). When a stage
ships, tick it here.

No em dashes anywhere in this repo. Commas, periods, parentheses, or "to".

---

## 1. The pitch, in one paragraph

Each town quotes its own live price for each tradeable good. Prices drift over
time and sag when you sell into them, then recover. Every town specializes:
the salt-flats start town floods the market with staples but pays a premium for
deep wonders, while the deepest town is the reverse. So you buy a town's cheap
exports, carry them across a No Man's Zone (the combat gauntlet between towns,
which is the risk), and sell them where they are scarce. Mining ore is the
free cash engine that funds your starting capital; the Board is the merchant
game played on top of it.

---

## 2. Two loops, kept separate (this is load bearing)

Sluice has two selling loops. They must not be conflated. UI_STYLE.md 15.2 is
explicit and we honor it.

1. **Ore selling is automatic and frictionless.** Cargo and oil sell the
   instant the rig drives onto the refuel pad outside the shop. There is no
   ore SELL station and there is no haggling over ore. Ore is the production
   engine. It stays simple. We do NOT make ore prices vary by town in v1
   (that would fight the auto-sell and the "calm" intent of the production
   loop). Ore funds the trading; ore is not the thing you trade.

2. **The Trade Board is the merchant loop.** The 43 trade goods
   (`NS_BOARD_GOODS`) are distinct from ore (some are ore-derived fiction like
   REFINED IRON INGOT or GOLD BAR, most are frontier goods like ROCK SALT,
   WHISKEY, TELEGRAPH KEY). The Board is where buy-low/sell-high lives. This is
   the Animal Crossing "Stalk Market" turnip engine that SHOP_PSYCHOLOGY.md
   names as the direct inspiration: a built-in variable-ratio reward that the
   player checks "just in case prices spiked".

Everything in this document is about loop 2. Loop 1 is untouched.

---

## 3. Research distilled (why the design is shaped this way)

From a study of Tradewinds, Taipan, Dope Wars, Elite, Port Royale, Offworld
Trading Company, EVE, Recettear, and Mount and Blade. The reusable levers:

- **Spatial price gaps plus a capacity cap make opportunity cost.** Different
  towns price the same good differently; the cargo you carry is cargo you
  cannot carry. (Sluice already caps cargo and the tradeGoods you can haul.)
- **Saturation is the non-negotiable one.** Tradewinds' fatal flaw is that
  selling does not move the price, so the loop gets "solved" and grinds. Elite,
  Port Royale, Offworld, and Recettear all make each sale push the local price
  down. We do the same: sell into a town and that good's price there sags,
  recovering over time. Without this, a player would dump infinite goods at the
  single best town forever.
- **Drift, telegraphed, is the engagement hook.** A visible wander plus the
  occasional telegraphed shock converts randomness into a decision (hold, or
  pre-buy). This is the "check the board each visit" pull.
- **Danger premium: loss scales with the haul.** The fattest spread is across
  the most dangerous crossing. Sluice already built this as the No Man's Zones.
  Carrying a big valuable load through the gauntlet is the bet.
- **The production wrinkle.** Sluice mines goods rather than buying them, so the
  pure merchant "buy low" half is supplied by the trade goods (which you DO buy),
  while ore stays the production cash engine. This is the Elite / X model:
  production feeds the economy, arbitrage rides on top.

Anti-pattern guard (SHOP_PSYCHOLOGY.md 13, the binding part): no fake scarcity,
no "LIMITED TIME OFFER", no "BEST VALUE" badges, no countdown manipulation. Our
sag-and-recover must read as honest supply and demand. The price delta we show
is a true statement about the market, never a nudge.

---

## 4. The core model: one multiplier per (town, good)

The whole economy is a single number per town per good: a price **multiplier**
`m`, centered near 1.0, that scales the catalog price. This preserves every
existing catalog price as the "neutral market" baseline and keeps the model
trivially legible and testable.

For town `t` and good `g`:

```
sellPrice(t, g) = round(g.sell * m[t][g])
buyPrice(t, g)  = round(g.buy  * m[t][g])
```

`g.buy` and `g.sell` are the untouched literals in `NS_BOARD_GOODS` (they
already encode the ~22% buy/sell spread per good). The multiplier carries
everything dynamic.

### 4.1 Baseline: specialization

Each `m[t][g]` is pulled toward a baseline `base[t][g] = spec[t][cat(g)]`, the
town's specialization multiplier for that good's category (section 5). A
baseline below 1.0 means the town produces or is glutted on that category, so
it is cheap there and good to BUY. Above 1.0 means the town is scarce and wants
it, so it is dear there and good to SELL.

### 4.2 Drift: a mean-reverting random walk (variable ratio)

Every `SECONDS_PER_TICK` of game time, each multiplier steps:

```
m += REVERSION * (base - m) + VOLATILITY * base * noise()
m  = clamp(m, M_MIN, M_MAX)
```

`noise()` is a cheap zero-centered random in roughly [-1, 1]. REVERSION pulls
`m` home; VOLATILITY wobbles it. This is the wander that makes checking the
board worthwhile.

### 4.3 Saturation: trades move the price, reversion recovers it

Selling into a town pushes its price down; buying pushes it up. We mutate the
same `m`, so recovery is just the existing reversion term pulling it home over
the next ticks. No separate state, no separate recovery clock.

```
on SELL qty of g in t:  m[t][g] -= IMPACT * qty / DEPTH[cat(g)]
on BUY  qty of g in t:  m[t][g] += IMPACT * qty / DEPTH[cat(g)]
clamp(m, M_MIN, M_MAX)
```

`DEPTH[cat]` is how much volume a category absorbs before the price moves
(bulk staples deep, exotica shallow). So dumping a big load visibly sags the
price and teaches you to spread sales across towns or wait for recovery.

### 4.4 Lazy time advance

Prices must move while you are away mining, so you return to a changed board.
We do not tick from the main loop (low coupling). Instead the model stores the
last game time it advanced to, and on any access (open the board, make a trade,
the board's own 5s redraw tick) it catches up: advance `floor(elapsed /
SECONDS_PER_TICK)` ticks, capped (say 240) so a long absence cannot stall the
frame. On load, re-anchor to "now" and drift on from the saved multipliers.

### 4.5 The honest delta we display

```
pct(t, g) = round((m[t][g] - 1) * 100)
```

Shown with an up or down arrow next to the price. A staple in the start town
sits near m = 0.70 and reads "-30%" (cheap here, buy). The same staple in the
deep town reads "+45%" (dear here, sell). That is a true statement and it is
exactly the information the player needs. This is the Bloomberg-terminal
legibility SHOP_PSYCHOLOGY.md 2 asks for: specific numbers, not "ore is cheap".

---

## 5. The four town economies

Goods are grouped into six categories. The 43 keys map as:

- **STAPLE** (surface life): saltblock, coalBrick, rope, tobacco, lampoil,
  calico, coffeesack, whiskey, pelt
- **METAL** (forge, rail, hardware): railspike, leadpig, nailkeg, ironIngot,
  copperWire, horseshoe
- **MINING** (tools, blasting, light): niter, sulfur, pickaxe, dynamite,
  powderkeg, lantern
- **ASSAY** (raw and refined precious, the silver economy): silverore, quartz,
  turquoise, silverbar, golddust, quicksilver, goldbar
- **INSTRUMENT** (fine brass, precision, survey): compass, pocketwatch,
  telegraphkey, cog
- **EXOTIC** (deep strange wonders): crowfeather, fossil, glowmilk, opal,
  meteorite, brassfinger, geode, lightning, diamond, saltidol, letter

Town order follows the world, right to left, shallow to deep: Town 1 is the
start (surface, `townIndex` 0), Town 4 is the deepest (`townIndex` 3). Names
are drawn from the existing ticker flavor and are provisional.

Specialization baseline multipliers `spec[town][category]`:

```
                STAPLE  METAL  MINING  ASSAY  INSTR  EXOTIC
T1 DRYWELL       0.70   1.00   1.20    1.30   1.25   1.45
T2 IRONHEAD      1.05   0.70   0.72    1.05   1.00   1.25
T3 COLD SPRING   1.10   0.95   0.85    0.70   1.05   1.20
T4 HOLLOW DEEP   1.45   1.10   1.05    1.00   0.72   0.72
```

Identities and the routes they create:

- **T1 DRYWELL**, salt-flats surface frontier. Floods staples (0.70). Starves
  for deep wonders (EXOTIC 1.45) and precious assay goods (1.30).
- **T2 IRONHEAD**, rail and forge town. Floods metal and mining gear (0.70,
  0.80). Pays up for staples and exotica.
- **T3 COLD SPRING**, silver and assay camp. Floods assay goods (0.70). Pays
  up for staples, instruments, exotica.
- **T4 HOLLOW DEEP**, the deepest strange town. Floods exotica and instruments
  (0.72, 0.80). Starves for staples (1.45, it is far from the surface) and
  mining gear.

The headline routes:

- **STAPLE down**: buy at T1 (0.70), sell at T4 (1.45). The deepest, most
  dangerous crossing, the fattest spread. The danger premium in action.
- **EXOTIC up**: buy at T4 (0.72), sell at T1 (1.45). The return leg.
- **ASSAY**: buy at T3 (0.70), sell at T1 (1.30).
- **METAL**: buy at T2 (0.70), sell deeper.

Two-way trade falls out naturally: haul food and salt down, haul wonders up.
The longest route has the biggest gross spread (about 2x before the buy/sell
spread and saturation), so it earns the most and risks the most.

**Balance (route headroom, v24.29).** A category's spatial margin is roughly
`(sell/buy) * (maxSpec / minSpec) - 1`, with the catalog sell/buy near 0.78 (a
~22% spread you pay every round trip). At first pass MINING and INSTRUMENT had
thin spreads (max/min only ~1.3 to 1.4, about 2 to 7% margin), so they were
widened (DRYWELL now wants tools and instruments, IRONHEAD floods tools, HOLLOW
DEEP floods instruments). Resulting per-category headroom and approximate
best-route margin: STAPLE 2.07x (~62%), EXOTIC 2.01x (~57%), ASSAY 1.86x (~45%),
INSTRUMENT 1.74x (~35%), MINING 1.67x (~30%), METAL 1.57x (~23%). Every category
is now a worthwhile route. The ~22% spread is a deliberate transaction cost: in
the single-town temporal loop, drift noise alone does NOT clear it (so there is
no free money from noise), but a telegraphed shock (EVENT_MAG 0.25 to 0.55) does
on tighter-spread high-value goods, so single-town play is event-driven
speculation. Final feel-tuning (cadence, volatility, shock size) is the owner's
via the gm `market` lever group plus playtest in `~/sluice-play`.

---

## 6. The danger premium (risk coupling)

The spread does not arbitrage itself away because the crossing is dangerous.
Carrying a valuable load of trade goods through a No Man's Zone means flying
the combat gauntlet with that load aboard. If you die in a zone, you lose a
tunable portion of your carried trade goods (not your money, not your
upgrades). Bigger haul, bigger loss. This is what makes "buy here, sell there"
a bet rather than a solved optimization.

Tunable and conservative by default. Exact behavior is set when we inspect the
death and zone code (`290-death-screen.js`, `085-combat.js`,
`015-regions.js`). Options considered: lose all carried goods, lose a fraction,
or scatter and let some be recovered. v1 starts gentle and we tune.

---

## 7. Rumors and scheduled shocks (speculation)

On top of the wander, the model schedules occasional per-town events: a spike
(a town's demand for a category jumps) or a crash (a glut). Events are
telegraphed ahead of time through the existing notices wall and telegraph
ticker, in the Western voice already there ("QUARTZ scarce in Drywell by
Thursday"). That lets a player speculate: pre-buy before a spike, sell into it.
This is the Tradewinds alehouse rumor and the Dope Wars price shock, reusing
the UI the Board already has. Honest framing only: the rumor states a coming
condition, it never manufactures urgency.

---

## 8. UI rules

The Board is a literal slate chalkboard with pinned paper, drawn on canvas
(`260-shop-board.js`). All additions obey UI_STYLE.md:

- Every glyph lives on a surface. No floating text, no tooltips, no modal
  dialogs, no DOM overlays.
- Money is `#d4a838` (gold), shown as a coin pile, never a bare number.
- Affordability color only: green affordable, red critical, amber caution.
- The price delta is chalk text with a small up or down mark. Keep it legible
  and specific.
- Header carries the SHOP_PSYCHOLOGY "TODAY'S PRICE, DAY N" framing (urgency
  from the passage of days, never from a fake countdown).
- Motion is barely perceptible. Any price-change flash reuses the existing
  `nsBoardRollFx` register (a brief, faint digit shimmer), gated to fire only
  when a price actually changed. Nothing pulses or glows.

---

## 9. Tuning knobs

All live in `var MARKET` at the top of `265-economy.js`, ALL_CAPS, grouped, and
exposed to the `gm` facade as a `market` lever group so the owner can tune the
feel live in game (per TUNING.md, the `gm` group pattern, panel toggles with
L).

```
SECONDS_PER_TICK   game seconds between drift steps          (start 30)
REVERSION          pull back to baseline per tick, 0..1       (start 0.06)
VOLATILITY         wander amplitude per tick                  (start 0.04)
M_MIN, M_MAX       global multiplier clamp                    (0.45, 2.20)
IMPACT             how hard one unit traded moves m           (start 0.5)
DEPTH[cat]         volume a category absorbs before moving    (staple deep)
SPEC[town][cat]    specialization baseline table (section 5)
EVENT_*            shock cadence and magnitude (section 7)
RISK_LOSS_FRAC     fraction of carried goods lost on zone death (section 6)
```

Defaults are a starting point. The lab (section 11) is where they get tuned by
feel before they reach the game, and the balance pass (stage 14) sets the final
numbers against ore income.

---

## 10. Architecture

- **`js/sluice/265-economy.js`** is a new bundle fragment (after 260, which
  defines `NS_BOARD_GOODS`). It holds:
  - `var MARKET = { ... }` config (section 9), plus the good-to-category map.
  - `var marketModel = (function(){ ... })()`: pure math, uses only `Math` and
    `MARKET`. It is **stateless**: every function takes the price `state` as an
    argument. Exposes `ensure(state)`, `advance(state, ticks)`,
    `buyPrice(state,t,g,catalog)`, `sellPrice(...)`, `applyBuy/applySell`,
    `pctDelta`, `topMovers`. Because it is a self-contained assignment using
    only `Math`, `economy-lab.html` can load this fragment standalone with a
    `<script src>` (the same trick `255-commodity-sprites.js` uses), which makes
    the model unit-testable and lab-tunable without booting the whole game.
  - Thin game glue that DOES touch game globals: `nsMarketState()` (lazy init
    and lazy time advance, stored on `player.market`), `nsBuyPrice(good)` and
    `nsSellPrice(good)` (resolve `playerTownIndex()` then call `marketModel`).
    These are only ever called inside the running game, never by the lab, so
    referencing game globals here is safe even when the fragment is loaded
    standalone (the functions are defined but not called).
- **Persistence**: market state lives on `player.market`, initialized with the
  same default-object guard pattern as `player.tradeGoods`
  (`040-init-resize-resolution.js`), so old saves load and seed cleanly.
- **`260-shop-board.js`** changes are surgical: every `good.buy`/`good.sell`
  read routes through `nsBuyPrice`/`nsSellPrice`; the 5s tick advances the real
  model; the ticker and a new per-row delta read real state. The catalog
  literals and the sprite engine (255) are untouched.

This keeps almost all new logic in one new fragment (265), minimizing edits to
the large, central, frequently-touched 260 and avoiding clobber with the other
sessions working this shared repo.

---

## 11. Verification

We cannot playtest the live feel here (the preview pauses the RAF loop and
cannot drive flight or clicks; the owner playtests the pinned `~/sluice-play`
clone after pulling). So we verify what we can, mechanically:

- **The lab** (`economy-lab.html`) renders the model's behavior: price charts
  over time, a sell button that sags then recovers, the four-town spread. This
  is both the tuning surface and the visual proof the math is right.
- **`node --check js/sluice.js`** after every build (syntax).
- **Boot check** via the preview tools: load the game, read the console for
  errors, and use `window.gm` plus direct console calls to drive the model
  (advance ticks, simulate trades, read prices back) and assert the numbers.
- **The owner** does the final feel playtest in `~/sluice-play`.

---

## 12. Build and push ritual (every stage)

Per AGENTS.md, on the shared repo. This work happens in an isolated worktree
(`.claude/worktrees/economy`, branch `economy`) off `origin/main`, because the
repo is edited concurrently by several sessions.

1. Revisit: `git fetch`, rebase the worktree on `origin/main`, re-read the file
   about to change (it may have moved under the rebase).
2. Edit the fragment(s). Never edit `js/sluice.js` directly.
3. Bump `GAME_VERSION` in `000-head.js`.
4. `./build-sluice.sh` to reassemble the bundle.
5. `node --check js/sluice.js`, then boot-check.
6. Commit the fragment(s) plus the rebuilt bundle (path-scoped). No em dashes
   in the message.
7. `git push origin HEAD:main`. If the bundle conflicts on rebase, do not merge
   it by hand: rebuild it from the merged fragments and continue.

A change is not done until it is pushed.

---

## 13. Staged build plan

- [x] 1. This bible.
- [x] 2. `economy-lab.html`: feel and tune the model.
- [x] 3. `265-economy.js`: MARKET config, category map, pure marketModel, glue.
- [x] 4. Route the Board's prices through `nsBuyPrice`/`nsSellPrice`.
- [x] 5. The 5s tick advances the real model; flash only on real changes.
- [x] 6. Ticker reflects real per-town movers.
- [x] 7. Per-row price delta plus "DAY N" header framing.
- [x] 8. `gm` market lever group.
- [x] 9. Finalize and wire the four town specialization identities.
- [ ] 10. Multi-town markets: a Board reachable in each town. DEFERRED, see section 16.
- [x] 11. Board shows town identity plus cross-town telegraph quotes.
- [ ] 12. Risk coupling: trade goods at risk crossing a No Man's Zone. DEFERRED, see section 16.
- [x] 13. Rumors and scheduled shocks for speculation.
- [x] 14. Balance pass against ore income.
- [x] 15. Un-defer the economy in the docs, final verify, summary.

---

## 14. Open questions for the owner (playtest)

- Does the longest route (staples down, exotica up) feel worth the deepest
  crossing, or is the spread too fat or too thin?
- Is losing carried trade goods on a zone death the right risk, or too harsh?
  (RISK_LOSS_FRAC is tunable.)
- Should the player also be able to read other towns' prices remotely (the
  telegraph), or should the information asymmetry be stricter (you only know a
  town's prices by standing in it)?
- Cadence: do prices move at the right speed relative to a mining run?

---

## 16. Spatial layer (multi-town STORES built v24.30-32; risk + pumps remain)

UPDATE 2026-05-30: the multi-town STORES landed (v24.30 to v24.32). Every town
now renders its own recoloured store (TOWN_BLD palettes in 170, drawn per town
from 140), you can open the Board in whichever town you stand in (it prices that
town via playerTownIndex), and you exit beside the store you used. So the
spatial buy-here/sell-there loop is now physically playable. The handoff notes
below are kept as the record of how it was done. What still remains of the
spatial layer, both optional follow-ups: (1) per-town REFUEL pumps + the ore
auto-sell pad (today refuel and ore-selling are Town-1 only; the fireplace, pump
pad, and chimney cap deliberately stay at Town 1 via stationCenterCol(), while
shop ENTRY is per-town via nearestTownStationCol()), and (2) the No Man's Zone
risk on carried trade goods (losing some on death in a zone).

### Multi-town markets (was stage 10)

Already done, no model work needed: `MARKET.SPEC` defines all four towns;
`nsMarketTown()` returns `playerTownIndex()` (clamped) so the Board already
prices the town you stand in; every price read already routes through
`nsBuyPrice`/`nsSellPrice`. The moment a Board can be opened in another town, it
shows that town's market for free.

What blocks it: every shop-entry point is hardwired to the single Town-1 station
building via `stationCenterCol()` = `DECK_CENTER_COL - 2` (with `DECK_CENTER_COL`
pinned to Town 1 in `015-regions.js`): `isPointOnShop`, `playerNearShop`,
`getShopDoorRect`, `playerInShopEntryArea`, `pumpPadRect` (all `050-input.js`),
the station render in `170-render-station-decor.js`, and the respawn in `290`.
Towns 2-4 have no station structure at all.

To finish: (a) place a market interactable plus station decor in each town (the
same world/decor task as the deferred towns-2-4 stations), (b) generalize the
entry trigger to detect proximity to each town's centre (computable from
`REGIONS` in 015), and (c) open the Board (or a Board-only sub-shop) for that
town. Decide whether each town gets the full hub (workshop/shelf/refuel) or only
the Board.

### No Man's Zone risk on carried goods (was stage 12)

The spatial danger premium: dying mid-crossing should cost you the cargo you
were hauling. In the death handler (`290-death-screen.js`), if the player died
in a zone (`regionAt(col).kind === REGION_NOMANS`, from 015), reduce
`player.tradeGoods` by a tunable `RISK_LOSS_FRAC` (add it to `MARKET`). Money and
upgrades stay untouched; only carried trade goods are at risk, and the loss
scales with the haul. This only matters once you can buy in one town and sell in
another, so it pairs with the multi-town markets above. It touches the
death/combat flow the active combat session owns, so land it in a worktree with
rebase.
