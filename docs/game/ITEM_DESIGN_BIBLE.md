# ITEM_DESIGN_BIBLE.md — what makes a huge, beloved item library

A world-class research synthesis on item design, drawn from the games most
famous for having a TON of items and for the rarest, most-loved items out
there. Pure industry research: this doc studies the best systems on their own
terms first, then (only in the last section) maps the lessons onto Sluice.

Pairs with `MINERALS_BIBLE.md` (ore ART framework) and `SHOP_PSYCHOLOGY.md`
(the variable-ratio shop). Sourced from five parallel research passes across
ARPG/looter, sandbox/survival, roguelike, MMO/cosmetic, and item-art-craft
domains; source links are collected at the bottom.

> One-line thesis: a great item library is one **rarity color ladder** + a
> few **orthogonal axes** to organize on + a **two-track naming system** +
> **silhouette-first art that signals rarity off the base icon** + a **drop
> moment with real juice**, and its most beloved items are the rare ones that
> **transform play, carry a story, and are seen by others.**

---

## 1. Why players love items (the psychology)

The pull is not the item, it is the **anticipation**. Unpredictable rewards
(a sub-1% drop) run the same variable-ratio schedule that makes slot machines
compelling; the dopamine fires on the chase, not the payout. Seven reinforcing
drivers turn a rare item from "owned" into "beloved":

1. **Scarcity + drop-rate folklore.** A known brutal number becomes legend.
   Players quote "1 in 10,000" (Terraria Slime Staff) or "~1%" (WoW Invincible)
   like scripture; the camp-for-two-years story becomes part of the item.
2. **Power that transforms play.** The most-loved items are not stat sticks,
   they change HOW you play: PoE Mageblood/Headhunter, Isaac Brimstone, the
   Borderlands Bee. "I can never go back" effects.
3. **Status / flex / being seen.** Rare gear is an identity marker others can
   read across a town square. Prestige is social proof of dedication, wealth,
   or luck.
4. **Grind-as-story (you earned it).** A maxed FFXIV relic or a Terraria Zenith
   is a "badge of the whole journey." The labor narrative is loved more than
   the stats.
5. **Surprise / the gamble.** Power-with-a-drawback (RoR2 Lunars, Slay the Spire
   boss relics, Isaac devil deals) makes the BEST decisions, because they are a
   real bet.
6. **Beauty / spectacle.** Custom particles, glow, animation make an item a
   performance, not a number (TF2 Unusuals, Dota Arcanas).
7. **Exclusivity + completion.** "Can never be obtained again" is the strongest
   multiplier (RuneScape party hats, CS Contraband); and a checklist you can
   finish (Stardew Collections, a museum) drives collection for its own sake.

**Take:** make rarity legible and quotable, reserve a few items that change
play, let rares be SEEN, and frame the grind as a story the player retells.

---

## 2. The rarity ladder (the universal system)

Every great loot game converged on the same idea: **color is the UI.** Label
color = power at a glance, before any text is read.

**The canonical ladder** (lineage: Angband to Diablo 1996 to WoW 2004, now
near-universal across Borderlands, Destiny, Fortnite):

| Tier | Color | Hex (WoW) | Feel |
|---|---|---|---|
| Poor / junk | gray | `#9d9d9d` | vendor trash |
| Common | white | `#ffffff` | the baseline |
| Uncommon | green | `#1eff00` | a small upgrade |
| Rare | blue | `#0070dd` | worth stopping for |
| Epic | purple | `#a335ee` | a real find |
| Legendary | orange/gold | `#ff8000` | the chase |
| Artifact / Mythic | light gold | `#e6cc80` | one-of-a-kind |

Above the ladder sits a **shock/halo tier** reserved for hype: Borderlands
Pearlescent (cyan) and Effervescent (rainbow), gacha red/rainbow, Diablo 4's
**purple Mythic beam**. Keep exactly one shock color so the apex always feels
special.

**How rarity is signaled (the toolkit, all of it OFF the base art):**
- **Name-color text** tinted to the tier (read value before parsing the icon).
- **Colored borders / frames / background tiles** on the inventory cell.
- **Glows / auras**, and **animated or particle borders** reserved for the top.
- **The gacha "burst" frame**: a gold burst-of-light + star count-up on a 5-star.
- **Drop beams**: a floor pillar of light, colored to rarity, seen before you
  reach the loot (Diablo, Borderlands; bigger beam = bigger tier).
- **Audio**: a distinct sound IS a rarity signal. The Diablo high-rune chime
  and the Borderlands legendary tone train players to HEAR a great drop.

**Two big principles:**
- **Rarity is orthogonal to type.** Any base can roll any rarity. This
  multiplies meaningful permutations cheaply and keeps every slot exciting.
- **Tie rarity to SOURCE, not just a number.** Item pools (boss / shop / event /
  devil / biome) make a drop feel earned and narratively flavored. The source
  tells you what you sacrificed to get it.

---

## 3. Taxonomy (how to organize a TON of items)

Terraria carries ~5,000 items and stays legible. The trick is **orthogonal,
taggable axes**, not one rigid folder tree. Any item is findable from several
angles:

- **TYPE / slot** — the primary spine (weapon, armor head/chest/legs, ring,
  tool, material). Usually equals the equip slot. The default sort.
- **RARITY** — the color ladder doubles as a sort/filter key.
- **SOURCE** — where it comes from (boss, biome, vendor, event, dig depth).
- **SET / collection** — membership in a named group; drives completion goals.
- **FUNCTION / tag** — cross-cutting labels (fire, healing, ranged, currency)
  that ignore slot.

**The universal bucket model** (superset across all the studied games):

| Bucket | Examples |
|---|---|
| Tools | pickaxe, drill, rod, lantern |
| Weapons | melee / ranged / magic / summon |
| Armor / wearables | head, chest, accessories, charms, trinkets |
| Consumables | potions, food, buffs, bombs |
| Materials | ores, bars, components, reagents |
| Currency | coins, orbs, runes, special-denomination rares |
| Blocks / furniture / stations | building + crafting |
| Vanity / cosmetic | dyes, skins, effects |
| Pets / mounts | summons, rides |
| Relics / artifacts / curios | found treasures, lore items |
| Keys / quest | gated, special-tier |

**Scaling rules that keep a big library navigable:**
- **Tag, do not just bucket.** One item carries many tags; let players filter by
  intersection (PoE loot filters; FilterBlade S-to-E tiers).
- **Ship an in-game browser, and make completing it a reward.** Terraria's
  Bestiary (540 sortable entries) and Minecraft's recipe book turn "too many
  items" into a rewarding index. The browser is itself content.
- **A recipe / crafting graph is a second axis** orthogonal to slot ("what makes
  what").
- **Sort + filter + search are non-negotiable** past a few hundred items.

---

## 4. Naming (the two-track system)

Every great library runs **two naming systems in parallel:**

**Track A, procedural affix grammar** (the long tail, commons to rares):
- Template: `[prefix] + [base type] + [suffix "of the X"]`, e.g. "Glowing Ring
  of the Mind" (prefix grants light radius, suffix grants energy).
- Diablo magic-item odds (~50% suffix-only / 25% prefix-only / 25% both) keep
  most names short; rares stack up to ~3 prefixes + 3 suffixes for variety.
- PoE rare names pull TWO words from a pool: an evocative prefix word (Agony,
  Kraken, Phoenix) + an item-type-bound suffix word ("Shell" for armor). The
  name is cosmetic but flavorful.
- Borderlands encodes the gun's PARTS into its title, so the name describes
  behavior.
- The grammar's whole job: combinatorial breadth that never produces an
  unreadable name.

**Track B, hand-named uniques** (the chase items players name-drop):
- Bespoke, evocative, mythic, often lore-loaded: Harlequin Crest ("Shako"),
  Stone of Jordan, Windforce, Mageblood, Headhunter, The Grandfather.
- Naming craft for uniques:
  - **Imply a history** (a prior owner, a broken kingdom, the monster it was
    forged to kill) so it "has a history before stats appear."
  - **Material cues** for origin: sunsteel, moonbone, ashglass, starwood.
  - **One strong noun, used once:** doom, mercy, hunger, dawn, verdict, frost.
- **Rarity correlates with naming:** commons stay plain and templated; the
  rarer the tier, the more bespoke and lore-laden. The naming STYLE itself
  becomes a rarity tell.

**Flavor text craft:** end on an image, not a stat; "when the description leaves
more questions than answers, it has found the right voice." Roguelikes prove
wit and theme give items soul for near-zero art cost (Slay the Spire's deadpan
one-liners, Enter the Gungeon's pun synergies, Don't Starve's per-character
examine quotes).

---

## 5. Item ART (the deep dive)

The whole point of the art is to make a tiny image carry an item's entire
identity, read at a glance in a cluttered grid, and signal rarity without
redrawing the base.

### 5.1 Icon pipelines (pick by how the item is seen)
- **Pixel art** (Terraria, Stardew, Dead Cells). Cheapest per icon, infinitely
  consistent, reads as handmade/charming. Canvas tiers: **16x16** inventory-tile
  standard; bump to **24/32px** when an item needs a readable focal detail;
  Dead Cells runs "HD pixel art" 32 to 128px. (Sluice's commodity sprites are
  32x32, this is our lane.)
- **Hand-painted / illustrated** (Hearthstone, Hades' inked boons). Highest
  warmth and character; expensive; needs an art bible to stay uniform.
- **3D-rendered-to-2D** (Diablo, WoW, RuneScape bakes 3D models to 32x32 / 96x96
  icons). Rotations + recolors nearly free; heavy upfront tooling.
- **Flat / vector** for UI, currency, mobile. Cheapest to scale; low warmth.

### 5.2 Readability at small size (the craft rules)
- **Silhouette first.** If the shape is not readable in one flat color, shading
  will not save it. Design the outline before any interior detail.
- **The squint test.** Squint until detail is lost; if the shape and its
  light/dark masses still read, it works. Fastest QA an artist has.
- **Value / contrast hierarchy.** One clear darkest-dark to lightest-light;
  reserve the highest contrast for the focal point, let the rest recede.
- **Limited palette.** At 16 to 32px extra hues read as mud. Color is a budget.
- **One consistent light direction** across the WHOLE set (top, or top-left).
  Consistency is what makes a catalog feel authored, not assembled.
- **Rim / edge light + a dark outline (selout)** to pop the item off the cell.
- **One focal point; kill noise.** Detail spent away from the focus is clutter.

### 5.3 The rarity-signaling toolkit (recap, art side)
Frame color, name-color, background tile, glow/aura, animated borders, the gacha
gold burst, the colored drop beam, and a per-tier sound. Reserve MOTION and big
juice for the top tiers only, so escalation stays legible.

### 5.4 The drop moment (juice)
The reveal must feel as good as the item is strong, because the memory lives in
the moment, not the stat line.
- **Stack the channels:** beam + screen flash + sound + minimap ping, fired
  together so it is unmissable.
- **Build-up then burst:** a held beat before the payoff (gacha pacing) is what
  sells it.
- **Reserve intensity for the top:** bigger beams, slow-mo, unique chimes only
  for the rarest tiers (Diablo 4 gave Mythics NEW sounds to out-signal
  legendaries).
- **Let the player linger:** a hover-zoom / inspect that shows off the art
  rewards the win and justifies the icon craft.

---

## 6. Hall of Fame (the most beloved + rarest items, and WHY)

The reference set: what "world-class" looks like. Pattern to notice, the rarest
beloved item is often NOT the strongest, it is the best STORY.

| Item | Game | Scarcity | Why it is loved |
|---|---|---|---|
| Harlequin Crest "Shako" | Diablo II/IV | ~1/2000 (D2) | universal power + nickname culture |
| Stone of Jordan | Diablo II | rare | BECAME the trade currency; legend by economic role |
| High runes (Zod/Ber) | Diablo II | up to ~1/2.5M | enable the best runewords; folklore drop odds |
| Mirror of Kalandra | Path of Exile | apex of economy | duplicates an item; the unit perfection is priced in |
| Mageblood / Headhunter | Path of Exile | very rare | TRANSFORM play (permanent flasks; steal rare mods) |
| The Bee / Conference Call | Borderlands 2 | legendary | community-defining "broken" combo + red flavor text |
| Slime Staff | Terraria | **1/10,000** | a pure LUCK TROPHY (and the pet is adorably weak) |
| Zenith | Terraria | crafted | a sword built from your whole journey of earlier swords |
| Dragon Egg | Minecraft | **1 per world** | purely decorative; the ultimate status symbol |
| Elytra / Totem of Undying | Minecraft | End-only / rare | unlock flight / cheat death; mechanic-defining |
| Prismatic Shard | Stardew | ~0.1% | rainbow shimmer; gateway to the Galaxy Sword |
| Brimstone / Sacred Heart | Isaac | quality 4 | run-defining transformation; holy chase item |
| The D6 | Isaac | starter-iconic | pure AGENCY (reroll any pedestal) |
| Pandora's Box / Snecko Eye | Slay the Spire | boss relic | the beloved GAMBLE; changes every turn |
| Tougher Times | Risk of Rain 2 | common | a humble white item that everyone loves (stacks to tanky) |
| Duo Boons | Hades | build-gated | the PAYOFF of build discovery; often the strongest |
| Party Hat (blue) | RuneScape | discontinued 2001 | most valuable object; OG flex + wealth vault |
| Twisted Bow | OSRS | ~1/1000 raids | pinnacle PvM prestige + multi-billion value |
| Invincible / Ashes of Al'ar | WoW | ~1% | lore weight (Arthas) + spectacle; people stop and stare |
| AWP Dragon Lore / M4A4 Howl | CS2 | ~114 exist / Contraband | unrepeatable; $35k to $750k+; a piece of game history |
| Burning Flames Unusual | TF2 | <1% | a flaming-head SPECTACLE; pure visual flex |
| Arcanas (Rubick) | Dota 2 | event-only | full hero overhaul: anims, FX, voice, never re-sold |
| Riven mods | Warframe | randomized, unique | no two alike; the chase is the god-roll stat combo |

Recurring love-drivers: **run-defining power, synergy discovery, the gamble,
humor/personality, true scarcity (discontinuation > low %), a shareable
grind/luck story, visible spectacle, and stacked orthogonal rarity axes**
(finish x wear x pattern x stat-roll = a near-infinite "best copy" chase).

---

## 7. The Playbook (do this)

1. **Color IS the UI.** Adopt the standard ladder (gray to white to green to
   blue to purple to orange, plus ONE rainbow/shock halo). Players already speak
   it. Never break the palette.
2. **Signal rarity OFF the base art** (name-color + frame + glow + beam), so one
   icon serves every tier.
3. **Make the drop a MOMENT.** Beam + flash + sound + ping, with a build-up beat;
   reserve the biggest juice for the top tier. Give every rarity a sound.
4. **Silhouette before pixels.** Approve every icon by the squint test; one
   light direction + a master palette for the whole set.
5. **The best items TRANSFORM play, not just numbers.** Bake a few "I can never
   go back" effects into the top tier.
6. **Tie rarity to SOURCE.** Pools/biomes/depths make a drop feel earned and
   give it narrative flavor.
7. **Synergy is the real content.** Design items to multiply each other and
   surface the combos (a codex/Ammonomicon).
8. **Let humble commons matter via stacking,** so rarity is not the only path to
   power.
9. **Two naming tracks:** procedural affix grammar for the long tail, bespoke
   lore names for the chase. Let names be flavorful even when cosmetic.
10. **Scarcity makes legend,** and discontinuation/limited windows make the
    strongest legend of all. Publish the brutal number; let it become folklore.
11. **The rarest item should be a TROPHY,** not necessarily the strongest (Slime
    Staff, Dragon Egg). Crown achievements should be crafted from the journey
    (Zenith).
12. **Organize on orthogonal taggable axes** (type x rarity x source x set x
    function) and ship an in-game browser/collection whose COMPLETION is itself
    a reward.

---

## 8. Application to Sluice (the bridge to building)

Sluice already has three item layers: **ores** (mined; `MINERALS_BIBLE`),
**commodities** (the 43-good Trade Board on the 32x32 sprite engine), and
**workshop upgrades**. The research points at one missing layer that fits a
DIGGING game better than any other genre could hope for, the thing you unearth.

**Proposed new layer: FINDABLES, a rarity-tiered library of things you dig up.**
This is the Terraria-rare-drop / Stardew-artifact / RuneScape-rare experience,
native to a mine:

- **A rarity ladder** mapped to our warm palette: Common, Uncommon, Rare, Epic,
  Legendary, plus ONE Mythic shock tier. Name-color + a colored "find" frame +
  a depth-scaled drop beam + a per-tier chime (hooks into `js/audio.js`).
- **Categories** that suit the world (frontier / rail / telegraph / uncanny,
  the same fiction as the Trade Board): **Gems & Crystals, Relics & Antiques,
  Fossils & Bones, Curiosities, Machine Parts, Lost Caches,** and a thin
  **Mythic Wonders** tail (the "singing geode / bottled lightning" register we
  already established).
- **Art** built on the SAME 32x32 sprite engine (`255-commodity-sprites.js`) so
  the whole game stays one cohesive pixel-art family. Silhouette-first, one light
  direction, rarity signaled off the base icon. A LOT of icons, this is the "full
  pixel art project" path again, scaled up.
- **Two-track names:** procedural affix flavor for common gems ("Flawed",
  "Brilliant", "Star-cut" + base), bespoke lore names for the chase relics.
- **The dig-up moment:** the buried item glints in the rock before you break it,
  then a beam + count-up + chime on reveal, intensity scaling with rarity.
- **A Collection / Assay Ledger:** an in-game browser that logs every find by
  category and rarity, with completion rewards. The browser is content.
- **Scarcity as folklore:** a handful of marquee ultra-rares with a pity floor
  (cannot appear before depth/time N) so the rarest is earned, plus one or two
  "trophy not power" finds (our Slime Staff equivalent).

Open scoping forks to settle before building (see the proposal that follows this
doc): findables-only vs. also wearable trinkets/charms with rolled rarity; how
big the first library is; and where they slot (pure collectibles + sell value,
or some that grant effects).

---

## Sources

Rarity / ARPG: Wowhead D2R rarity, DiabloWiki Rarity/Stone of Jordan/Zod,
Icy-Veins rune guide, PoEWiki Mirror of Kalandra/Mageblood, PoE Rare Item Name
Index, Borderlands Wiki Rarity/Norfleet/Red Text, Last Epoch rarity guide,
Maxroll D4 uniques. Sandbox: Terraria Wiki Rarity/sprite-sizes/Slime
Staff/Guide/Bestiary, Minecraft Wiki enchantment-glint/textures, Stardew Wiki
Prismatic Shard/Galaxy Sword, Noita Wiki spell tiers. Roguelike: Isaac Wiki Item
Quality, RoR2 Wiki Items/Tougher Times, Hades Wiki Boons/Duo Boons + Jen Zee
interviews, Slay the Spire Wiki Relics, Enter the Gungeon Wiki Synergies. Rare
economies: RuneScape Wiki Partyhat, OSRS Wiki Twisted Bow, Warcraft Wiki Quality
(hex), Tradeit/Pricempire CS skin rarity + float, TF2 Wiki Unusual/Australium/
Item Quality, Liquipedia Arcana, Warframe Wiki Riven Mods, FFXIV Anima Weapons,
Genshin pity. Art craft: Saint11/Pedro Medeiros pixel tutorials, Game UX Master
Guide iconography, Tales of the Aggronaut "Origins of Color-Coded Loot", TV
Tropes Color-Coded Item Tiers, Hearthstone Wiki card art, Diablo 4 loot sounds,
HoYoLAB 5-star burst, Story Shack flavor-text craft, NeverSink PoE filter,
NCBI/PMC loot-box reward study.
