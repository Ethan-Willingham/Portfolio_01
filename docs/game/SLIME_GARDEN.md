# Surface slime garden

The garden expands the mining loop with a reason to return to the surface:
catch a falling sky slime, build a bath, carry up mineral liquids, and collect
the pearl that grows while the slime soaks. Raw ore still sells. The largest
pearls require a bath lining and liquids from deeper strata.

This system is independent of the optional indoor banya. Its four lots are
always available in the public game. It does not enable the parked underground
slime NPC brains, oil deposits, ore refinement, combat, or multiple towns.

## Land and construction

Four signs mark the land immediately west of town. Number 1 is nearest town;
number 4 is farthest west. Each bath has an 11 tile wide, 2 tile deep interior,
one tile side walls, and a one tile floor. Two full tiles separate the outer
shells. For lot index `i`, its inner left column is
`DECK_LEFT_COL - 16 - i * 15`. The full reserved span, including margins, is
`DECK_LEFT_COL - 63` through `DECK_LEFT_COL - 4`.

Vacant lots remain flat ground until purchased. A purchase pays cash and spends
the listed minerals from the current cargo. Ordinary specimens are spent before
shiny specimens. Construction carves real terrain and installs unbreakable
foundation tiles. No water is supplied. First-lot stone is provided, but the
land still costs money.

| Lot | Construction cost | Bath recipe | Time | Pearl payment |
| --- | --- | --- | --- | --- |
| Stone | $180; stone supplied | Water | 40 seconds | River pearl, $260 |
| Copper | $650 + 3 Copper | Water + Brine | 48 seconds | Salt pearl, $900 |
| Iron | $1,800 + 3 Iron + 1 Amber | Water + Nectar | 56 seconds | Honey pearl, $2,600 |
| Crystal | $4,800 + 2 Amethyst + 1 Gold | Brine + Nectar + Lumen | 65 seconds | Aurora pearl, $6,000 |

These are first-pass tuning values. They intentionally make a filled bath more
valuable than an equivalent early raw-ore haul without creating an unlimited
idle payout. Copper gives a reachable second goal before the heated drill.

## The player's routine

1. Buy the lot at its sign with E or a tap.
2. Gather lake water or a mineral liquid by switching on the scoop and driving or flying over it. Pour it into the
   bath. The sign lists the recipe; brass marks inside the walls show the
   minimum working level.
3. Catch a settled sky slime and release it into the bath.
4. Let it soak. The sign reports a missing liquid, missing slime, insufficient
   fill, or growing progress. Mining elsewhere is allowed while the bath works.
5. Return to the sign to collect the pearl and receive payment. Refill as needed.

The first arrivals aim at a garden shoulder so their entire bounce sequence
remains visible before the player moves them into a bath. They are guests,
never consumed by pearl production. One guest can work in each bath. Additional
guests do not multiply that bath's output.

A bath needs roughly 43 percent of its volume filled. Mixed recipes accept broad
ratios: a meaningful dose of each named liquid is enough; exact laboratory
percentages are not required. Other liquids do not poison or reset progress.
Progress pauses when the recipe or resident is missing. It never erases earned
time. One completed pearl waits per bath; further production waits for collection.

At completion, the pearl incorporates a real dose of 1,800 liquid particles,
divided equally among the named recipe liquids. This consumes volume from the
actual simulation, including parked offscreen liquid. A ready pearl remains
collectable if the player later moves the slime or drains the bath.

## Scoop controls

F toggles collection beneath and slightly beside the rig. Suction runs while
moving or hovering and needs no pointer input. Curved gusts and collected drops
converge beneath the chassis; there is no visible hose or aiming reticle.
Terrain blocks the intake, so buried liquid still needs an opening.

Hold right mouse to pour straight down. Releasing stops the pump and leaves
collection off so freshly poured water stays in the bath. R changes the liquid
chamber. Touch players tap SCOOP or POUR for continuous collection or pouring;
tapping the active button stops it. The tank stays visible while holding liquid
or a passenger. A successful slime release stops pouring.

## Art and interaction amendment

Open-air bath installations use the existing `BLD` palette and outlined
Frontier Soviet construction. They are intentionally low terrain bowls, not
additional houses. The bath's material is visible on its rim and shell:
hand-laid slate, patched warm copper, riveted iron, then mineral-inlaid metal.
The existing wood family supplies weathered copper tones; existing water-family
accents supply reflective crystal facets. No additional building palette is
introduced.

Each survey sign has slate feet, old plank framing, a riveted recipe plate, and
a small static star. It composes the established `drawStoneFoundation`,
`drawWoodPlanking`, `drawRivetedPlate`, `drawSignBoard`, and `drawRedStar` helpers.
The new local helpers `slimeGardenDrawMasonry`, `slimeGardenDrawLadder`, and
`slimeGardenDrawPearl` retain the same one pixel outline and palette discipline.

Signs carry the recipe, material requirement, price, growing state, and direct
action on a compact 172 by 72 world pixel board. The nearby sign gets a brass outline. Interaction is a single in-world
E action or tap, with the existing radio channel for transaction feedback.
There is no new modal or additional screen panel.

The radio gives mobile-specific tap instructions and points to the nearest
surviving surface lake by distance and east/west direction. This also works with
older saves whose lakes differ from the fresh world's east-of-town source.

## Persistence and seams

`074-slime-garden.js` owns lot records, construction, recipes, drawings, and
transactions. `slimeGardenSave/Restore` persist ownership, progress, ready
pearls, and collection count. Saves without the field get four unowned lots.
Restoration repairs owned shells without flattening unrelated mined terrain.
The liquid manager persists the real poured liquid and parks it while away;
the garden reads combined live and parked counts through `liquidSampleRect`.

Useful integration points are `slimeGardenReset`, `slimeGardenPrepareWorld`,
`slimeGardenTick`, `slimeGardenDraw`, `slimeGardenInteract`, and
`slimeGardenPointer`. `slimeGardenReservedCol` keeps ponds and trees out of the
plot span. `slimeGardenAt` and `skySlimeLandingX` connect sky guests to terrain.
A resident receives `gardenLot` and `pearlProgress` for visual feedback.

Verification covers the 11 by 2 interior and sealed shell, unaffordable and
missing-material purchases, preservation of shiny cargo, recipe gating, actual
liquid consumption, one-time payout, and save round trips. Full browser testing
also needs a built bath filled with the live liquid solver and a captured guest.

Run `node tools/slime-garden-economy.mjs` for the deterministic economy and
old-save migration checks. The test uses no browser or external packages.
