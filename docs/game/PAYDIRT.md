# Dirt, stone and the level-one sluice

Owner direction, 2026-10-27: collect dirt and stone throughout mining, with
different materials and rarer finds deeper down. Carry a large finite amount.
When full, keep mining and leave extra rubble behind. Wash the collected material
in a sluice inspired by the gold-sluice demo in Water, Smoke and Slime.

Implemented in v28.214. This is separate from the disabled ore-refinement system.
Do not enable `ENABLE_REFINEMENT` to use the wash station.

## Player loop

1. Drilling and bombs collect one scoop per dirt or stone tile actually removed.
   Ore still goes to its existing slot-based cargo hold. Foundation and other
   unmineable cells do not yield bulk material.
2. The bulk bin holds 600 scoops at cargo level one, plus 200 per cargo upgrade.
   Its limit is shared by all material types. A single full notice explains that
   digging continues. The cargo instrument and I inspector show bulk separately.
3. Landing on the fuel pad unloads the bin into station storage, including on a
   trip with no ore. Opening the sluice near the surface also unloads it. Stored
   material has no capacity limit and is not sold by the ordinary ore sale.
4. Press P near the station or use the visible Sluice button. The existing tower
   to the left of the shop also opens it when tapped from nearby. On a controller,
   click the left stick to enter, use D-pad to focus controls, A to select, Y to
   wash/collect and B to return.
5. Choose a material. One action washes the whole stored stack, taking
   `6 + min(12, scoops / 50)` active seconds. The free first machine screens
   broken stone and recirculates its own water. It does not consume bath supplies.
6. A batch can run while the player mines, shops or tends the bath. The open
   station itself holds the mine still. Pause, hidden/inactive game, portrait,
   cargo inspection and mineral-ledger browsing stop processing. No offline time
   is credited. Only one batch can occupy the machine and pan at a time.
7. Collect the pan to receive its cash value. Ordinary minerals are recorded in
   the mineral ledger. Rare and exceptional finds also remain in the station's
   specimen collection. The current pan survives closing the view and reloading.

The station uses the same two-column layout on desktop and landscape mobile,
with native scrolling, keyboard focus containment and controls at least 44px.
The mobile portrait gate and deliberate pause stay independent.

## Materials and odds

Depth uses the existing one-metre terrain rows. The tile grid and its saved
identities remain unchanged; the collected material is assigned from kind/depth.

| Depth | Dirt | Broken stone |
|---|---|---|
| 0 to 59 m | Topsoil | River gravel |
| 60 to 129 m | Red clay | Shale |
| 130 to 199 m | Ochre silt | Quartz gravel |
| 200 to 269 m | Glacial silt | Froststone grit |
| 270 to 339 m | Volcanic ash | Basalt grit |
| 340 to 399 m | Mantle dust | Crystal grit |

`PAYDIRT_TYPES` in `171-pay-dirt.js` is the catalog source for inventory, loot
tables, save validation and station copy. Each material has five possible finds:

- Fine concentrate: 70% per scoop, worth $1/$2/$4/$6/$10/$14 by depth band.
- A regional ordinary mineral: about 6%/1.5%/.67%/.38%/.24%/.17% by band.
- A better regional mineral: 0.4% per scoop.
- One exclusive rare specimen: 0.1%, or 1 in 1,000 per scoop.
- One exclusive exceptional specimen: 0.02%, or 1 in 5,000 per scoop.

All other rolls are tailings. Each scoop produces at most one result. These
probabilities are shown in the station, including material not discovered yet.
There is no guaranteed rare drop and no hidden pity counter. A 600-scoop batch
has about a 51% chance of at least one special specimen. Every material has
different named specials, 24 in total. A first descent can finish without one.

Expected payout per scoop ranges from $1.88 for topsoil to $40.13 for mantle
dust. Common payouts add value to ordinary digging; rare specimens are occasional
bonuses. Ore cargo, existing prices and drill/heat gates are unchanged. Ordinary
ore chances fall in deeper wash pools to avoid replacing mining high-value veins.
The old progression timing in BALANCE.md predates this added income and needs
player pacing feedback before being treated as a current completion estimate.

## Persistence and conservation

The save envelope adds `paydirt`: held/stored counts, discovered material,
washed totals, specimens, a run seed, a roll counter per material and one pending
batch. Existing saves default to an empty system. The normal save version remains
compatible. New Game resets the entire collection and sequence.

Starting a wash removes stored scoops once, advances that material's counter,
generates its results once and saves the pending pan. Splitting a stack consumes
the same sequence as washing it whole. Closing and reopening cannot reroll it.
Collect clears the pending owner before crediting cash and specimens, then saves.
Reload validates catalog IDs/counts and reconstructs values from current rules.
The completion transition saves; closing or hiding also preserves elapsed time.

Death and paid recovery discard carried bulk alongside ordinary cargo. Safe
station stock, pending results and the permanent specimen record survive.

## Code and verification

- `171-pay-dirt.js`: materials, capacity, collection, deposits, seeded results,
  one-time claims and save validation.
- `172-sluice.js`: existing surface tower exterior, now accessible.
- `173-sluice-machine.js`: bounded canvas presentation of the batch. It uses the
  demo's hopper, riffles, cleanout, separate receivers and return-water layout.
  It has no timer, randomness or inventory mutation. It is not the laboratory's
  GPU recovery simulation, and no real recovery-efficiency claim is made.
- `174-sluice-station.js`: native station controls, loot pools, results and collection.
- Mining, blasts, pump docking, saves, death, cargo, upgrades and onboarding hook
  into the model. The existing lifecycle owns all updates.

Run `node tools/test-sluice-paydirt.cjs` for model, conservation, deterministic
batching and migration. Run `node tools/test-sluice-paydirt-save.cjs` for actual
save-envelope, quota-failure, rotating-slot, death and New Game regressions. Run
`node tools/sluice-paydirt-smoke.mjs` for the real browser/game loop, mining,
blasts, docking, reload, station interactions, landscape layout and pause gates.
The browser harness uses a disposable profile and a test-only injected probe;
it does not modify ordinary player saves. Set `DUMP` to a directory outside the
repository for screenshots. Rebuild and syntax-check the assembled game as usual.
