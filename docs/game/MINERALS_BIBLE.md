# Ore Design Bible — Sluice

*(file: `MINERALS_BIBLE.md` — `AGENTS.md` points here)*

The foundation + repeatable loop for designing the **remaining Earth ore
renderers**. Four ores are done (coal, copper, bauxite, iron) and set the
bar. This doc exists so every per-ore session is a bounded exercise instead
of relitigating system questions.

**There are no moon ores.** The playable moon and its ores were removed in v23.18; this bible covers Earth ores only. Don't reintroduce moon ores here.

## How to use this doc

- **§1–§8 are the foundation.** Done once. You are reading the result.
- **Phase 1 is one ore per session.** Open by reading this whole doc, run
  the §9 loop on one ore, then append the result to §8 and the session log.
- Paste this doc at the start of every ore session. It is the project
  state — do not rely on memory between sessions. Keep it lean: per-ore
  entries are short fingerprints, not essays.

---

## 1. The four reference ores — the bar

These four are finished, atlas-baked, and static. Every new ore is measured
against them. They live in `drawEarlyOreBase()` in `js/sluice.js`
(grep `type === 'coal'`). Palettes live in `TILE_MATERIALS`.

| Ore | Archetype | base / highlight / shadow / accent | Signature accent | Depth (tiles) | Host |
|---|---|---|---|---|---|
| **Coal** | Banded | `#1a1c22` / `#3d3a48` / `#070608` / `#b8c4d0` | 0–2 fused clump knots; silver upper-edge shine `#6c7280` | 4–120 | dirt |
| **Copper** | Vein | `#9d5128` / `#e29754` / `#3b1a10` / `#72a778` | verdigris-green patina freckles; dendritic branch forks | 8–140 | stone |
| **Bauxite** | Pocket aggregate | `#a04724` / `#df7b3d` / `#35150d` / `#e5bd7e` | cream pisolith chips `#f0c98a`; rounded pea-grains | 20–160 | stone |
| **Iron** | Banded | `#55595c` / `#b6b7b0` / `#202326` / `#a8502b` | rust seams + dot; translucent rust stain specks | 30–220 | stone |

What they establish (every new ore inherits this):

- Coal and iron are the **same archetype** — a cluster of tilted lozenge
  bands. Coal owns it shallow and near-black; iron is the deeper, greyer,
  flatter cousin. They coexist because of palette + depth, not shape.
- Copper is the **vein anchor** (branching ribbons + nuggets).
- Bauxite is the **pocket-aggregate anchor** (grains packed in a host pocket).
- All four: per-pixel rendering, upper-left light, `tileHash01`-only
  geometry, a centered cluster that leaves a clear host margin.

---

## 2. Tier structure — depth bands (already in the code)

Tiers are **depth bands**, defined in the `LAYERS` array. This is not a
decision to make — it exists. An ore's tier = which bands its
`minDepth`/`maxDepth` span (see the `ORES` table).

| Band | Depth (tiles) | Notes |
|---|---|---|
| topsoil | 0–30 | intro band |
| bedrock | 30–70 | |
| permafrost | 70–130 | ice; needs Heated Drill |
| barrier | 130–138 | reinforced; bomb-only |
| fossil | 138–188 | |
| deepcrust | 188–248 | |
| magma | 248–318 | hot; needs Heat Shield |
| crystal | 318–388 | |
| mantle | 388–400 | hottest |

Design rules from this:

- **Each ore is locked to ONE host material** (`host: 'dirt' | 'stone'` in the
  `ORES` table) and lives in a **tight depth band** (~2-3 ore types coexist at
  any depth). v23.16 retired the old wide, overlapping bands, so coal no longer
  bleeds toward the mantle. Design each ore for its host and the **shallowest**
  row of its band, where the player first meets it.
- An ore only ever appears in its host material, so it must read against that
  host and that host's per-layer **retint** (permafrost blue, magma red), not
  against both dirt and stone.
- Gameplay gates (`reqHeat`, `reqDrill`, Heat Shield) shape *where* the
  player meets an ore but never its art.

**Host roster (v23.16).** Every Earth ore, locked:

- **dirt** (soft / sediment / organic): coal · bauxite · methane ice · amber ·
  fossil · gold
- **stone** (hard rock / vein / crystal): copper · iron · pyrite · silver ·
  cinnabar · uranium · obsidian · emerald · ruby · tanzanite · diamond ·
  painite · unobtanium

---

## 3. Rarity — spawn `chance` (already in the code)

Rarity is the `chance` field in `ORES`. Bands:

| Rarity | `chance` | Ores |
|---|---|---|
| Common | ≥ 0.025 | coal, copper, bauxite, iron, methaneice, obsidian, pyrite, silver, amber, cobalt, magnetite |
| Uncommon | 0.012–0.024 | cinnabar, gold, emerald, fossil, uranium, jade |
| Rare | 0.004–0.011 | ruby, tanzanite, diamond, painite, opal |
| Legendary | < 0.004 | unobtanium |

**What rarity buys, visually — it buys *flash budget*, not saturation:**

- **Common** ores are 90% of what the player sees. Rich but *calm* detail.
  They must not vibrate or shimmer — dozens are on screen at once. Cheap.
- **Uncommon** ores earn one quiet glint or specular dot.
- **Rare** ores earn a clear sparkle / internal light / hue play.
- **Legendary** (unobtanium) earns iridescence and may break a rule.

Cranking saturation on everything flattens the screen. Flash is the lever.

---

## 4. Palette atlas — claim the colour space

The four done ores have claimed regions. New ores **may not** reuse a
claimed region; where a roster ore is unavoidably near one, the differentiator
is locked below.

**Claimed:** near-black blue-grey → *coal* · neutral steel-grey → *iron* ·
metallic copper-orange → *copper* · earthy rust-red-brown → *bauxite*.
**Accents in use:** verdigris-green (copper), cream/tan (bauxite),
rust-orange (iron).

| Ore | Palette region | Adjacency risk | Locked differentiator |
|---|---|---|---|
| pyrite | brassy pale gold | **gold** | pyrite = paler/greyer brass + hard geometric cubes; gold = richer warm yellow + soft veins. Contrast is intentional ("fool's gold"). |
| silver | cool near-white, faint blue | **iron** | silver = bright cool near-white, curly wire; iron = mid steel-grey, banded. |
| methaneice | pale icy blue + white frost | diamond | methaneice = frosty matte ball; diamond = brilliant faceted clear gem. |
| amber | translucent honey-gold | **copper** | amber = translucent, glowing, yellow-honey; copper = opaque metallic orange. |
| fossil | ivory bones + dark outline | bauxite cream | tell is *shape* (skull + bones), not colour. |
| cinnabar | matte scarlet / vermilion | **ruby** | cinnabar = matte opaque scarlet crystal druse; ruby = glassy faceted transparent jewel-red. |
| gold | rich warm yellow | **pyrite** | see pyrite row. |
| uranium | acid / lime green + glow | emerald, copper-patina | uranium = lime/acid + glow rim; emerald = deep jewel-green faceted; patina is a tiny muted freckle. |
| obsidian | glossy purple-black + violet sheen | **coal** | obsidian = glossy, sharp specular, mirror shines, violet body; coal = matte, banded, neutral. |
| emerald | deep jewel green | uranium | see uranium row. |
| ruby | crimson (warm red) | cinnabar, painite | ruby = pure crimson, glassy, squat barrel. |
| tanzanite | violet-blue (hue-shifts) | painite | colour alone separates them; tanzanite also shifts hue along its length. |
| diamond | near-colourless icy + rainbow | methaneice, silver | diamond = brightest sparkle + R/G/B dispersion fringe; faceted. |
| painite | dark garnet red-orange-brown | ruby, tanzanite | painite = dark, warm, browner; an orthorhombic prism. |
| unobtanium | impossible magenta + iridescent | **opal** | unobtanium = impossible geometry + chrome iridescence; opal = milky organic nodule + scattered rainbow flecks. |
| cobalt | cool blue + angular | silver, iron | cobalt = blue tabular crystals; silver = near-white curls; iron = grey banded. |
| magnetite | almost-black octahedral | iron, coal | magnetite = sharp black crystal druse; iron = banded; coal = matte rounded bands. |
| jade | deep mottled green | **emerald** | jade = smooth polished opaque mottled stone; emerald = tall faceted prism (cut gem). |
| opal | milky white + rainbow flecks | every cut gem, unobtanium | opal = amorphous nodule + scattered iridescent flecks; cut gems = single faceted colour; unobtanium = impossible chrome geometry. |

---

## 5. Archetypes — derived from the roster (not quota'd)

There are no distribution quotas. Each ore's archetype falls out of its real
mineral; we just name the families and watch for crowding.

| # | Archetype | What it is | Ores | Code helper |
|---|---|---|---|---|
| 1 | **Banded** | cluster of tilted lozenge bands | coal, iron | `drawOreShard`, coal/iron branches |
| 2 | **Vein** | branching tapered ribbons ± nuggets (native metal) | copper, gold, silver | copper branch, `drawOreWires` |
| 3 | **Cut gem** | 1 large + few satellite faceted crystals | diamond, emerald, ruby, tanzanite, painite | `drawGemFacet` |
| 4 | **Crystal druse** | many small sharp crystals/cubes clustered | pyrite, cinnabar, uranium | `drawGemScatter`; pyrite cube classifier |
| 5 | **Pocket aggregate** | rounded grains packed in a host pocket | bauxite | `drawOreGrain` |
| 6 | **Encased** | translucent medium with a suspended inclusion | amber, methaneice | `drawEncasedNodule` |
| 7 | **Massive glass** | glossy conchoidal-fracture mass | obsidian | — |
| 8 | **Fossil** | dinosaur skull paired with big bones in iconic configurations | fossil | — |
| 9 | **Polished stone** | smooth opaque mottled pebble, NO facets, waxy sheen | jade | — (custom mottled renderer) |
| 10 | **Iridescent nodule** | milky amorphous base with scattered rainbow flecks (animated) | opal | could reuse `drawEncasedNodule` base + per-tile-phase iridescent fleck cycle |

**Cut gem (5 ores) is the only crowded family.** The fix is not fewer gems —
it is locking their differentiators. See the gem table in §8.

`unobtanium` has no archetype: it is a deliberate **exotic** that references
the cut-gem vocabulary and then violates it (impossible geometry,
iridescence). Designed last, once every convention is mature.

---

## 6. Accent vocabulary — the "tell" detail

Each ore picks **one** signature accent — the thing named in its
one-sentence tell. An accent is ≤ ~5% of the tile's pixels. More than one
accent reads as noise.

Catalogued (✓ = already used by a reference ore):

- edge-shine line ✓ (coal) · glint speck ✓ (coal) · fused clump/knot ✓ (coal)
- oxide/patina freckle ✓ (copper) · dendritic branch fork ✓ (copper)
- colour chip ✓ (bauxite) · embedded grain ✓ (bauxite)
- rust seam / drip ✓ (iron) · translucent stain speck ✓ (iron)
- facet sparkle / specular dot · chromatic dispersion fringe (1-px R/G/B rim)
- internal crack / fissure · frost halo / rime fringe · glow rim
- inclusion silhouette (insect, fossil body) · conchoidal flake-scar
- face striations (cube faces)

---

## 7. The tile contract — lighting + technical invariants

Non-negotiable. A renderer that breaks these produces art that cannot ship.

- **32×32 tile. Light from the upper-LEFT, always.**
- **Per-pixel `ctx.fillRect(x, y, 1, 1)` only.** No `ctx.ellipse`, no
  gradients, no anti-aliasing (`imageSmoothingEnabled = false`). Crisp
  pixel art.
- **All geometry from `tileHash01(r, c, seed)`. Never read neighbor tiles.**
  Two reasons: mining a tile must not reshape a survivor; and atlas baking
  uses synthetic coords where neighbors are meaningless.
- **The host shows through.** Dirt/stone (layer-retinted) is drawn beneath
  the tile by the chunk pipeline. The ore renderer draws *only* its mineral,
  on top. The cluster occupies the center **~55–65%** of the tile with a
  clear host margin all round (the v16.9 embedded-clump model). No painted
  host rectangle, no full-tile fill, no smooth oval.
- **4-tone-by-edge scheme:** outline ring on the perimeter, highlight just
  inside the upper/upper-left edge, base in the interior, soft shadow just
  inside the lower/lower-right edge.
- **Palette** lives in `TILE_MATERIALS[ore].default` as
  `{base, highlight, shadow, accent}`. Renderer-local extra tones (a mid, a
  shine) are fine — derive them in the function, don't bloat the palette.
- **Static.** The four reference ores are baked into an offscreen atlas
  (rendered once, blitted). A new ore that joins the atlas must be fully
  static. Per-frame animation is possible only on the inline render path and
  is only justified for a legendary.
- A renderer is a function `draw…(tx, ty, r, c, type)` that draws and
  returns `true`, wired into the tile render pass.

---

## 8. The full roster — 32 ores

`status`: ✅ done · ⬜ placeholder (needs art). `host`: dirt/stone material the
ore is locked to (v23.16). Order is by shallowest depth. Depths/host reflect
v23.16; the live values are in the `ORES` table (planned ⬜ ores show their
intended placement).

| Ore | Status | Host | Depth | Rarity | Archetype | Palette region |
|---|---|---|---|---|---|---|
| coal | ✅ | dirt | 4–45 | common | Banded | near-black grey |
| copper | ✅ | stone | 8–52 | common | Vein | copper-orange |
| malachite | ✅ | stone | 18–80 | common | Banded botryoidal | banded green |
| bauxite | ✅ | dirt | 38–88 | common | Pocket aggregate | rust-red-brown |
| galena | ✅ | stone | 45–110 | common | Cube druse | lead-grey metallic |
| iron | ✅ | stone | 50–105 | common | Banded | steel-grey |
| magnetite | ✅ | stone | 60–180 | common | Octahedral druse | almost-black |
| pyrite | ✅ | stone | 66–112 | common | Crystal druse | brassy pale gold |
| turquoise | ✅ | dirt | 75–135 | uncommon | Polished + matrix | blue-green + black web |
| cobalt | ✅ | stone | 80–200 | common | Tabular crystal | electric blue |
| methaneice | ✅ | dirt | 82–128 | common | Encased | icy blue |
| silver | ✅ | stone | 88–146 | common | Vein | cool near-white |
| jade | ✅ | stone | 120–280 | uncommon | Polished stone | mottled deep green |
| cinnabar | ✅ | stone | 140–196 | uncommon | Crystal druse | matte scarlet |
| amber | ✅ | dirt | 142–188 | common | Encased | honey-gold |
| fossil | ✅ | dirt | 148–188 | uncommon | Fossil | dinosaur skull + bones |
| lapis | ✅ | stone | 150–225 | uncommon | Massive + flecks | ultramarine + gold |
| amethyst | ✅ | stone | 160–240 | uncommon | Crystal points (geode) | purple |
| gold | ✅ | dirt | 176–250 | uncommon | Vein | rich warm yellow |
| uranium | ✅ | stone | 198–258 | uncommon | Crystal druse | acid green + glow |
| opal | ✅ | dirt | 200–380 | rare | Iridescent nodule | milky white + rainbow flecks |
| rhodochrosite | ✅ | stone | 200–270 | uncommon | Banded botryoidal | rose-pink |
| obsidian | ✅ | stone | 248–320 | common | Massive glass | purple-black glass |
| sulfur | ✅ | stone | 250–318 | common | Crystal crust | lemon-yellow |
| emerald | ✅ | stone | 270–340 | uncommon | Cut gem | deep jewel green |
| peridot | ✅ | stone | 280–345 | rare | Cut gem | olive-lime |
| ruby | ✅ | stone | 318–386 | rare | Cut gem | crimson |
| platinum | ✅ | stone | 330–396 | rare | Vein | white precious metal |
| tanzanite | ✅ | stone | 330–390 | rare | Cut gem | violet-blue |
| diamond | ✅ | stone | 345–396 | rare | Cut gem | near-colourless icy |
| painite | ✅ | stone | 364–400 | rare | Cut gem | garnet orange |
| unobtanium | ✅ | stone | 388–400 | legendary | Exotic | magenta iridescent |

### Per-ore design direction (the one-line tell)

- **pyrite** — hard brassy cubes clustered on dark rock; paler and more
  geometric than gold.
- **silver** — cool curly native-silver wire + small beads, near-white.
- **methaneice** — a pale icy-blue nodule with a white frost halo, gas
  bubbles trapped inside.
- **gold** — soft rounded warm-yellow nuggets strung on dendritic wires.
- **cinnabar** — matte blood-scarlet rhombic crystals dusting dark rock.
- **amber** — translucent honey-gold resin with a dark insect silhouette
  suspended inside.
- **emerald** — a tall deep-green hexagonal prism cluster.
- **fossil** — a dinosaur skull paired with big bones in iconic configurations (museum-shelf, profile skull + crossed bones, or jolly roger). Renamed from `trilobite` in v17.35.
- **ruby** — UNREFINED natural-specimen aesthetic (NOT polished cut gem). ONE unified hex-prism crystal helper with full 0..2π rotation + chamfered short ends + per-row ±1 px width jitter (the v17.57 rough-mineral edge language). Per-tile composition mirrors obsidian: a dominant hero crystal (squat / equant / tall aspect bucket, randomised rotation, ±2 px centre jitter) + 2-3 small satellite chips orbiting at varied angles/distances/sizes/own-rotations. Burgundy palette, screen-space lighting (lit side stays upper-left regardless of crystal rotation).
- **uranium** — acid-green crystalline crackle with a dim radioactive glow rim.
- **obsidian** — a cluster of angular purple-black volcanic-glass chunks
  (one hero + smaller shards) with sharp diagonal mirror shines and a
  hard pure-white specular.
- **tanzanite** — a violet-blue orthorhombic prism that shifts hue along
  its length.
- **diamond** — a single brilliant octahedral gem, near-colourless,
  strongest sparkle + a rainbow dispersion fringe.
- **painite** — a dark garnet-orange orthorhombic prism, exceptional clarity.
- **unobtanium** — an impossible magenta crystal that breaks the cut-gem
  rules: iridescent, geometry that shouldn't close.
- **cobalt** — cool-toned blue tabular crystals scattered on dark rock;
  vein archetype but more crystalline + angular than silver's curls.
- **magnetite** — tight cluster of small black octahedral crystals on
  dark rock; denser and more angular than iron's smooth banded surface.
- **jade** — smooth opaque mottled-green pebble with a subtle waxy
  sheen; NO facets — distinct from emerald (cut gem).
- **opal** — milky-white amorphous nodule with iridescent rainbow flecks
  (magenta, cyan, lime, gold) inside; the **animated play-of-color** is
  the key tell. Hue-cycle per-tile-phase, ~6-second period.

### Cut-gem differentiation lock (load-bearing)

Five gems share archetype = Cut gem. They MUST differ on **crystal shape +
aspect ratio + colour**, or they collapse into recolours.

| Gem | Crystal shape | Aspect | Colour | Flash |
|---|---|---|---|---|
| emerald | hexagonal prism | **tall column** | deep jewel green | modest twinkle |
| ruby | corundum barrel | **squat / equant** | crimson | modest + internal glow |
| tanzanite | orthorhombic prism | medium, leaning | violet-blue, hue-shifts | modest |
| diamond | octahedral bipyramid | squat | near-colourless icy | **brightest** + dispersion |
| painite | orthorhombic prism | medium | dark garnet orange-brown | modest |

tanzanite and painite share shape — colour separates them hard (violet vs
dark-orange) and tanzanite hue-shifts. Aspect ratio is non-negotiable:
emerald TALL, ruby SQUAT, diamond SQUAT-bipyramid.

---

## 9. The per-ore loop — Phase 1, one ore per session

Run the stages **in order**. Each stage's output constrains the next. When
something feels wrong, go **back** a stage — never push forward.

- **A — Role.** Confirm depth band, rarity, value, hp from the `ORES` table.
  There is no crafting: the ore's purpose is the *progression beat* — what
  depth the player meets it, what price jump it represents, what upgrade
  selling it funds. If you can't state why it exists, stop.
- **B — Reference.** Pull 3–5 photos of the real mineral specimen. (Only
  `unobtanium` has no real anchor — for it, a coherent invented-material
  language replaces this.) Also glance at how Terraria / Core Keeper /
  Stardew / Deep Rock render the archetype — to calibrate detail scale, not
  to copy.
- **C — Archetype.** Confirm the §5 family. Cross-check the same-depth
  ores: does it clash?
- **D — Palette.** Pull the §4 region. Pick base / highlight / shadow /
  accent. Squint-test against every claimed colour and every same-depth ore.
- **E — Signature accent.** Pick exactly one from §6. ≤ ~5% of pixels.
- **F — Parametric spec.** Write the pseudocode params before any pixels:
  feature count, size ranges, tilt/spread, variant probabilities — all keyed
  to `tileHash01`. Lock them, then render.
- **G — Implementation.** Write the renderer matching the §7 contract and
  the reference-ore structure. Reuse the §5 code helper if one fits.
  **Register the ore in `drawEarlyOreBase`** (draw it, then `return true`) so
  the tile skips the flat `ORES.color` placeholder fill and the dirt/stone
  host shows through; add the ore to the per-tile edge-inset exclusion list,
  and delete its per-ore flourish-block call. Bump `GAME_VERSION`.
- **H — Four review gates.** Must pass all:
  1. **Squint** — blur to 40%: still distinct from every other ore?
  2. **Neighbor** — render beside its same-depth ores: belongs to the
     system, yet distinctly itself?
  3. **Lighting** — upper-left light holds across all `tileHash01` variants?
  4. **Accent** — the signature detail reads at 1× zoom without zooming in?
- **I — Update this doc.** Flip the ore to ✅ in §8, record final palette +
  params, add a session-log line. Commit + ff-merge to `main` + push.

**Suggested order** — anchor each archetype with its first/cheapest ore so
later siblings are fast variants: pyrite → silver → gold (vein family) →
methaneice → amber (encased) → cinnabar → uranium (druse) → fossil →
obsidian → emerald → ruby → tanzanite → diamond → painite → unobtanium
→ **then the four planned ores:** magnetite (druse variant) → cobalt
(vein variant) → jade (polished stone, new archetype) → opal (iridescent
nodule, new archetype).

**Planned ores not yet in `ORES` table:** magnetite, cobalt, jade, opal
all live as ⬜ entries in §8 with palette + archetype + design direction
locked in. Code-side implementation (ORES table row, draw function,
drawEarlyOreBase registration, exclusions, showcase array) is deferred
until after the 7 in-bible ⬜ ores (obsidian, emerald, ruby, tanzanite,
diamond, painite, unobtanium) are migrated.

---

## Session log

- *(foundation)* — Phase 0 complete. Back-documented the four reference
  ores; tiers/rarity/roster pulled from `ORES` + `LAYERS`; 8 archetypes
  derived; palette atlas + adjacency locks set. 15 ores remain (⬜ in §8).
- **pyrite** — done; redrawn v17.3, refined v17.4–v17.5. Crystal druse: 1
  hero + 2–4 satellite cubes interpenetrating into a clump. Each cube is a
  true three-face box (lit top / mid front / shaded side) rasterised by a
  per-pixel face classifier. Rotation is discrete, not jittered: most
  cubes are flat (axis-aligned), a minority pick a bold variant (±45°,
  ±30°) — hero 78% flat, satellites 62% flat. Bright rim on the up-left
  contour, warmed to gold low in the tile so it does not read white at the
  base; ~12% of the dark outline chips away for a weathered edge. Accents:
  jittered parallel striations grooving the top + front faces
  (perpendicular), plus sparse dark grit specks pitting the front faces.
  Palette `#b89638` / `#e6c659` / `#544017` / `#fff2c0` (TILE_MATERIALS);
  13-tone brass ramp in-renderer. Renders via the `drawEarlyOreBase`
  branch — host shows through.
- **silver** — done v17.6, enlarged v17.9. Vein archetype: a generous
  tangle of 3–4 long curly native-silver wires crossing near the tile
  centre, with pooled beads — a knot at the centre and caps on ~half the
  wire ends. (v17.6 read too small; v17.9 lengthened the wires, relaxed
  the curl so they sweep wider, added a wire, and bumped the bead sizes.)
  Reusable `drawCurlWire` helper walks a curved centreline (drift + two
  heading harmonics + optional hook). Signature accent: dark tarnish
  freckles. Palette base `#aab8c6` / light `#d8e2ea` / outline `#2b313b`
  / shadow `#5d6b7a` / shine `#f4f8fc` / tarnish `#3e4856`. Cooler and
  calmer than gold — gold stays the showier metal. Renders via the
  `drawEarlyOreBase` branch.
- **gold** — v17.7 first cut; v17.8 thin-wire spray; v17.11 denser;
  v17.12 cleaned up. Vein archetype, wire-led like silver: a clean
  gleaming dendrite — a shared root throws 4–5 thin gold wires fanning
  wide, ~two-thirds carrying one sub-branch that sprouts from the arm
  wire's EXACT far endpoint (so every joint connects — no detached
  bits). No twigs; sub-branches taper to fine points; bright gold nodes
  only at the root and the arm joints. Strings stay thin and continuous
  — presence is the wide reach + node mass, cleanliness the low part
  count. Palette out `#5e3f0a` / shadow `#bd8a1f` / base `#e8b22e` /
  light `#ffd24a` / gleam `#fff8d0`; hot gleam + a glint per node.
  Reuses `drawCurlWire` (curlScale 0.55) + `drawOreGrain`. Renders via
  the `drawEarlyOreBase` branch.
- **methaneice** — done v17.13; shading redesigned v17.14; frost spray
  v17.15. First Encased ore: a matte, translucent icy-blue nodule — a
  lumpy rounded blob, NOT a faceted gem (diamond's lane). Signature
  accent: gas bubbles trapped inside. Wrapped in a frost-spray halo —
  ~20–30 fine frost crystals radiating off the surface: bright 1–3px
  needles dense at the rim, fading to sparse dim specks reaching into
  the host. New reusable `drawEncasedNodule` helper — the lumpy blob is
  shaded as a 3-D sphere (surface-normal diffuse) with a 4×4 ordered
  dither, so tone bands curve with the form and blend smooth. Palette:
  outline `#33505f`, frost `#f0fafc` / `#aecdd6`, a 6-step icy body ramp
  `#5d8295`→`#d8edf3`. amber reuses the helper. Renders via
  `drawEarlyOreBase`.
- **amber** — done v17.16; second Encased ore. A blob of translucent
  honey-gold fossil resin with a dark insect silhouette suspended inside
  — the signature accent: a fixed bug (segmented body, six splayed legs,
  two antennae) drawn rotated at a hashed angle, plus a fleck or two of
  trapped debris. Reuses `drawEncasedNodule` (sphere shading + ordered
  dither) — warm and glowing where methaneice is cold; a matte rounded
  lump, NOT faceted. Palette: outline `#3f2207`, glossy rim `#ffeaad`, a
  6-step honey body ramp `#7a4410`→`#ffd472`. Renders via the
  `drawEarlyOreBase` branch.
- **cinnabar** — v17.17→v17.21 evolution (sharp druse → botryoidal
  cluster → spatial fade → smeared); **v17.22 production-locked**. A
  spatial-fade puff cluster anchored at the *head* of a per-tile drag
  stroke (cluster pulled ~1 px against `smearAng`) with an elliptical
  scatter halo of 42 loose pigment specks (1×1 dots in base / shadow /
  outline, ~22% gap) trailing along the drag direction (bias 0.60 along
  smearAng, annulus radius 5.5–15 px from cluster centre). Tone bands
  shadow-weighted in the mid (≤40% inner base/shadow, 40–85% mid
  shadow/out, 85–100% far outline) so the smear has strong readable
  midtone with outline tone only in the far tail. Puff cluster is a
  jittered 5×5 grid of matte blood-scarlet puffs via `drawOreGrain`
  with spatial fade (skipChance 18% centre → 73% edge, max radius 2.8
  centre → 1.4 edge, round cull at r²=81), drawn on top of the halo so
  the centre punches through. Single bright peach glint `#f59078` on
  the biggest puff — uncommon rarity flash per bible §3 (one pixel).
  Matte and opaque — NOT a glassy faceted jewel (ruby's lane). Palette
  out `#380c0a` / shadow `#7c1d15` / base `#a82e1f` / light `#cc4530`.
  Renders via the `drawEarlyOreBase` branch.
- **uranium** — v17.23 redrawn: acid-green crystalline *starburst* with
  a luminous yellow-green glow rim. 6–8 tapered shards radiate outward
  from a central core, each drawn twice via `drawOreShard` — first a
  fatter "halo shard" in glow colour `#beff5c`, then the real shard on
  top in the dark / acid-green ramp — so a 1-pixel luminous rim shows
  through around every silhouette edge once the body overdraws the
  centre. Spike count 6–8 per tile, evenly distributed with ~±13°
  per-spike jitter; shard half-length 2.8–5 px (total spike length
  5.6–10 px) anchored so the near end sits at cluster centre. Central
  glow heart at cluster centre (`#a2f342` peak + 4 cardinal `#beff5c`
  cross) suggests the radioactive core. 2–4 pale `#e8ffaf` *decay
  specks* scattered 10–14 px from centre (35% gap, edge-clipped)
  suggest alpha emission. **v17.25 breathing aura** (v17.24 was too
  faint to see): two animated layers on top of the static design.
  *Layer A* — 40 sparse `glowColor` pixels in a wide outer ring (radius
  7–13 px, so the aura extends past the spike silhouette into open
  host) breathing via `ctx.globalAlpha` over a ~4.5-second sine, peak
  alpha 0.9 so the difference between trough (invisible) and peak
  (clear bright halo) is visible frame-to-frame. *Layer B* — a hot
  `#eaff96` core glow pulses during the top half of the cycle (alpha
  rises 0→1 as the pulse crosses 0.3→1). Per-tile phase offset
  (`tileHash01(r, c, 0xF300)`) so neighbouring uranium tiles don't beat
  in lockstep. Animation works because `drawEarlyOreBase` runs live
  per frame for uranium (not atlas-baked — it's outside
  `EARLY_ORE_ATLAS_TYPES`). Palette out `#0e2a0a` / shadow `#2e5a18` /
  base `#5fc028` / light `#9be148` / shine `#cbff6e`. Renders via the
  `drawEarlyOreBase` branch (host shows through between shards); excluded
  from the high-value generic-shine block so the radioactive glow isn't
  drowned by the flat white shine pixels.
- **fossil** *(renamed from trilobite in v17.35)* — v17.33 dropped the ammonite spiral per
  user feedback and made every variation a **skull + big bones**
  composition. Three variations per-tile via hash:
  (A) ~40% **profile skull + 2 parallel femurs** (= sign style) —
  v17.33's single-femur version was too bare. v17.34 stacks two
  horizontal femurs underneath the skull: upper at (0, +1) with
  halfLen=11/baseHW=3.3 (slightly bigger), lower at (0, +9) with
  halfLen=10/baseHW=2.8 (slightly smaller). Skull moved up to (0, -9)
  to make vertical room. Museum-shelf bone collection look.
  (B) ~30% **profile skull + 2 crossed femurs** — same profile skull
  but at (0, -8), with two femurs crossed at (0, +6) at ang ±0.20π
  (halfLen=9, baseHW=2.6). The dinosaur-version of the jolly roger.
  (C) ~30% **classic jolly roger** — front-view rounded skull at
  (0, -7) (10×7 oval, two 2×2 dark eye sockets at u=±2/3, nasal
  cavity, 3-tooth row), two femurs crossed at (0, +6) at ang ±0.20π.
  All three rotate together as one rigid piece via cos/sin on
  body-local `(u, v)` with per-tile rotation. Bone palette unchanged:
  out `#3a2410` / shadow `#7a6450` / mid `#c8b08a` (ivory) / lit
  `#e8d4a8` / hole `#1c1206`. Three helpers (`paintLocal`,
  `boneToneAt`, `drawFemurAt`, `drawSmallProfileSkull`) keep code
  reuse high across variations. Renders via the `drawEarlyOreBase`
  branch; excluded from edge-inset and from the value-90-to-800
  generic-shine block.
- **obsidian** — v17.36 (smooth oval + arcs) and v17.37 (two rhombus
  shards) both rejected — the rhombus shards reused the diamond/shard
  primitive and read as "two thin arrows," not massive volcanic glass.
  **v17.38–v17.43 full redesign**, production-locked v17.43 ("one of
  our best yet"). Obsidian is a **CLUSTER of angular volcanic-glass
  chunks**: one dominant hero chunk + 2–3 smaller broken-off shards
  (the pyrite hero+satellites composition). Real obsidian shatters
  into interlocking pieces, so a cluster of chunks reads truer than
  one perfect blob — and the multi-chunk *is* the natural variation
  (a v17.41 generic scatter-speck halo was tried and rejected first).
  Each chunk is a true **5-vertex polygon** — ray-cast point-in-polygon
  fill + per-pixel distance-to-edge for sharp straight outlines along
  the flat sides; vertex radii vary widely so it reads as a jagged
  slab, never a bumpy circle. Hero scale 1.05 (effective radii
  ~6.3–12.6 px, matching the single chunk the owner liked); satellites
  scale 0.40–0.54 at distance 6–9.5 px, kept distinctly smaller so the
  hero always dominates. Body is sphere-shaded in 4 **purple-violet**
  tones — the purple lives in the body, not just the rim. Each chunk
  carries 1–2 sharp diagonal lavender **mirror shines** on the lit
  hemisphere (the "polished glass" tell, length scaled to the chunk);
  the hero also gets the **HERO accent** — one pure-white specular
  pixel + 2 HOT halo pixels at its upper-left surface peak — plus 2–3
  vivid-violet **SHEEN** rim pixels. Light direction + shine angle are
  shared across every chunk so the cluster reads as one fractured mass
  under one light. `drawChunk` loops only the polygon's vertex bounding
  box to keep the multi-chunk cost down. Palette out `#000000` /
  shadow `#0a0418` / base `#1e1232` / lit `#3c2a60`; shine HOT
  `#b095d8`, spec `#ffffff`, sheen `#b06ce8`. Renders via the
  `drawEarlyOreBase` branch (host shows through between chunks);
  excluded from edge-inset and from the value-90-to-800 generic-shine
  block (the mirror shines ARE the shine).
- **emerald** — done; v17.46 world-class repaint over the v17.38/44
  composition (kept: hero + 1–2 satellite tall hexagonal prisms, bottoms
  aligned, host-through). The v17.44 prism was a rotated rectangle with
  flat L/M/R face bands — it read as a *rounded rectangular* column, not
  a six-sided crystal. The repaint rasterises each prism as a true
  hexagonal cross-section keyed off the column index k: `OUT | lit-left
  LIT | bright vertical FRONT EDGE | translucent front face (GLOW core →
  BASE) | shadow-right DEEP | OUT`. The **bright front edge** (a single
  vertical line, brightest tone after the specular) is the load-bearing
  hexagonal tell — it's what separates "six-sided prism" from "box". A
  **foreshortened flat-topped basal termination** (`capInset` narrows the
  top 2–3 rows by 1px/side, EDGE→GLOW facet) sits the crystal in 3-space
  and reads as terminated beryl, not a cut-off bar. Translucency comes
  from the GLOW core band one column inside the front edge (light passing
  *through* the stone), deepening toward the shadow side. Hero-only tells:
  one vertical **beryl striation** groove (DEEP over BASE, wide prisms
  halfW≥4), a single ~40%-chance **jardin** inclusion fleck, and the lone
  **specular twinkle** (SHINE at the lit top-facet corner + 1px tail down
  the front edge — modest uncommon flash, NOT the diamond's hard white).
  Satellites stay faces-only so the hero dominates. Palette out `#072a1c`
  / deep `#0f4631` / base `#188a55` / lit `#34ac6e` / glow `#5ed79a` /
  edge `#9bf0c0` / shine `#eafff4` (a tight 7-tone bluish-jewel-green
  ramp, monotonic in luminance). Renders host-through via the
  `drawEarlyOreBase` branch; excluded from edge-inset and from the
  value≥800 generic-shine block (v17.45 — the white squares were landing
  on bare host between the crystals).
  v17.47 enrich pass ("more detail, more variation"): drawPrism gained a
  `tip` param — flat pinacoid (0) vs pyramidal termination (1), chosen
  per crystal — and a `seed` so each crystal's randomness is independent.
  Added horizontal **growth-zoning** bands (BASEZ `#136b4c` deeper-green
  stripes crossing the front face, 1-2 per crystal), a **jardin field**
  (1-3 flecks, the first a bright GLOWH `#7be6b6` internal reflection),
  occasional satellite **glints**, and a **base druse** of 2-4 tiny
  pointed nubs so the cluster reads as growing from rock. Cluster grew to
  hero + 2-3 satellites + nubs; striation moved to `kEdge+2` (clear of
  the shadow face) and dashed (`top%5`). Specular is now tip-aware so it
  always lands on crystal, never bare host. Levers if it reads busy:
  `nNub` (0xE090), `nSat` (0xE010), zoning probability (seed+2).
  v17.49 — **whole-cluster rotation** + lighter outline. (A v17.48 attempt
  that re-rotated each crystal independently into a centred spray was
  reverted — the owner wanted the *existing* specimen spun as one rigid
  unit, not a recomposition.) The fix is small: one per-tile angle
  `clusterAng = tileHash01(...,0xE0FF)*TAU`, a `place(px,py)` helper that
  rotates each component's position about the hero centre `(cx,cy)`, and
  the same angle added to every component's own tilt. Arrangement and
  relative crystal angles are preserved exactly; only the whole thing
  turns. Lighting is left baked (it spins with the sprite) — if fixed
  upper-left light under rotation is wanted later, that needs the
  screen-space `mirror`/`termLit` shading (built + reverted in v17.48,
  recover from git if needed). Outline lightened `#072a1c → #0a3826`.
  v17.50 — satellite **roots scattered**: the `satY = cy+(heroLen-satLen)`
  bottoms-align made all three crystals emerge from one too-perfect point,
  so each satellite now gets independent ±3px x/y root jitter (seeds
  0xE0E0/0xE0F0) — applied before the cluster spin, so they read as
  growing from slightly different spots in the matrix.
- **ruby** — Long iteration journey. **v17.51** copied emerald's
  hero+satellite cluster (user: *"do not poison this by making it look
  like emerald"*). **v17.52** went the opposite direction — single
  cushion-cut polished gem (too lonely). **v17.54** brilliant-cut side
  profile + 2 mirrored satellites (satellites looked uniform/robotic).
  **v17.55** sized variations of the same shape (still all looked like
  the same gem). **v17.56** three round brilliants viewed face-up with
  size/shape/facet/table differences (closer but still felt repetitive).
  **v17.57** scrapped all "polished cut gem" framing and rebuilt around
  UNREFINED natural-mineral specimen with a pale marble matrix grounding
  the crystals (user: *"throw it all out, brand new perspective…
  unrefined look this time"*). User asked to remove the matrix and said
  the crystals needed *more shape than just blobs*.
  **v17.58** rebuilt around clean hex-prism geometry with hard tonal
  steps between three faces — user feedback: *"before was actually way
  better"* (v17.57's rough crystal feel read truer than v17.58's
  machine-cut geometry); the real issue was that every tile looked the
  same template, not that the crystals lacked structure.
  **v17.59** restored v17.57's rough-crystal approach + introduced a
  variant pool of 8 designed scenes (squat-barrel, tall column, tabular
  plate, bipyramidal pair, twin V, tilted shard, cross-section hex,
  druzy cluster). User feedback: *"we are getting really close. I see
  a couple variants that are roughly hexagonal — take that, add
  variation and rotations, then look at obsidian and see how it has
  irregular shapes and kinda like satellites"*.
  **v17.60 (final)** consolidates around the hex-prism shape language
  and mirrors obsidian's composition. The 8 separate scene helpers
  are gone; instead ONE unified `drawHexPrism(cu, cv, halfW, halfH,
  angle, seed, detail)` handles every crystal, with full 0..2π
  rotation via backward-mapped sampling. Per-tile composition is
  always **hero + 2-3 orbital satellites** (the obsidian dominance
  rule). All the variety comes from continuous randomisation rather
  than scene buckets, so neighbouring tiles read as a varied specimen
  field of rotated, jittered, irregular hex crystals — exactly what
  obsidian does, applied to ruby's hex-prism habit.
  *Per-tile variation* (every parameter randomised independently):
    - **Hero aspect**: 3 buckets randomised inside each (v17.64 sizing).
        - Squat barrel (a < 0.33): `halfW = 6..7`, `halfH = 4..5`.
        - Equant (0.33 ≤ a < 0.66): `halfW = 5..6`, `halfH = 5..6`.
        - Tall column (a ≥ 0.66): `halfW = 5` (v17.64 bumped from 4),
          `halfH = 7..8`.
    - **Hero rotation**: `tileHash01(r, c, 0xF020) * Math.PI * 2`
      — every tile orients differently across the full 360°.
    - **Hero centre**: `cx, cy = (tx+16, ty+16) + ±2 px jitter`
      via `tileHash01(r, c, 0xF000/0xF001)`.
    - **Satellite count**: 2-3 via `tileHash01(r, c, 0xF030) * 2`.
    - **Satellite orbit**: each satellite at
      `satAng = (si/nSat) * 2π + jitter ±0.75` and
      `satDist = 5..8.5 px` from hero centre (v17.61 tuned this band
      to STRADDLE the hero edge so satellites tuck partway into the
      hero — the hero's outline then erases the satellite's where
      they overlap and the cluster reads as one merged shape, the
      "obsidian blending rule"). Earlier v17.60 band 7..11 px was
      too far for the v17.60 hero size and read as floating chunks.
    - **Satellite shape** (v17.65): 4-5 vertex angular polygon
      (`drawShardChip`), NOT a hex prism. At satellite scale a
      chamfered hex doesn't have enough rows to read as hex. Polygon
      `baseRad = 2.5..3.5` → spans ~3.5-9 px across (40-55% of hero
      radius, matching obsidian's satellite scale). Per-vertex random
      radius and full-360° rotation make every shard angular.
    - **Satellite rotation**: each satellite has its own random
      0..2π angle so the cluster reads natural, not mirrored.
    - **Detail levels**: hero = 2 (body + zoning + crack + core +
      silk), first satellite = 1 (body + zoning + crack), rest = 0
      (body only).
  *`drawHexPrism` internals*:
    - **Backward-mapped sampling**: for every screen pixel (su, sv)
      within the rotated bbox of size `ceil(sqrt(halfW² + halfH²)) + 2`,
      compute local coords `(lu, lv) = (su*cos(-θ) - sv*sin(-θ),
      su*sin(-θ) + sv*cos(-θ))`, round to `(iu, iv)`, and use those
      for shape / outline / interior classification.
    - **Hex silhouette**: chamfered short ends (basal pinacoid faces)
      via `chamferAt(iv) = max(1, round(halfW * 0.33))` at the edge
      row, `1` at the inner row when `halfH ≥ 4`. Per-row width jitter
      `±1 px` (`Math.round((hash - 0.5) * 1.5)` — ~17% of rows on
      each side, v17.62 tightened from ~25% with `* 2`) applies to
      non-chamfered middle rows ONLY when `halfW ≥ 3` — tiny satellites
      skip jitter entirely so they don't read as noise. Outline rows
      (`atSide`/`atTopBot`) painted `OUT`.
    - **Lighting in SCREEN space** (`lightTone(su, sv, halfW)`): lit
      side stays at the upper-left regardless of crystal rotation.
    - **Colour zoning in LOCAL space** (`zoneTone(iu, iv, ...)`,
      thresholds `> 0.90 / < 0.10` — v17.62 cut from `0.86 / 0.14`):
      patches stay glued to the crystal as it rotates. Gated on
      `detail ≥ 1 && halfW ≥ 4` so only hero-scale crystals get
      zoning — small satellites skip it (the 2×2 block patches read
      as noise rather than zones at small pixel counts).
    - **Pigeon's blood core** (detail ≥ 2): small circular patch in
      LOCAL coords, tones shift one step deeper inside.
    - **Crack** (detail ≥ 1 && halfH ≥ 3 — v17.62 added the halfH
      gate): 4-pixel jagged diagonal drawn in LOCAL coords then
      rotated back to screen via the forward rotation
      (`cosF/sinF = cos(angle)/sin(angle)`). Short satellites skip
      the crack — at halfH ≤ 2 the diagonal reads as scattered dark
      pixels rather than a coherent fissure.
    - **Silk inclusion** (detail ≥ 2): single pale pixel near the
      local "top" of the crystal, rotated to screen.
  **v17.65 (shard satellites)** — user feedback after v17.64: *"still
  multiple examples off the edges that are just like rectangles…I am
  sure you meant for them to be shards, but it doesn't come off that
  way in this pixel world"*. The hero silhouette read fine after v17.64,
  but the satellites — drawn as `drawHexPrism` calls at halfW 2-3,
  halfH 1-2 — were too small for the chamfer to express a hex
  silhouette (a 5×3 hex with chamfer 1 has middle rows all at width 5,
  reads as a stubby rectangle). The fix: stop drawing satellites as
  hex prisms entirely. New `drawShardChip(cu, cv, baseRad, seed)`
  helper modelled directly on obsidian's `drawChunk`:
    - **4 or 5 vertex polygon** chosen per-satellite via
      `tileHash01(r, c, seed) > 0.5`.
    - **Per-vertex random radius**: `vRad = baseRad * (0.7 + hash * 0.6)`
      so every vertex sticks out at a different distance — visibly
      distinct corners regardless of pixel scale.
    - **Random rotation**: `rotBase = hash * 2π`, then vertices at
      `rotBase + vi * (2π / nVerts)`.
    - **Clean OUT outline** via `distToEdge < 0.7` (the obsidian
      approach — uniform 1-px outline regardless of polygon rotation).
    - **Body painted** with the existing screen-space `lightTone`
      so lit side stays at the upper-left and the palette matches
      the hex-prism hero.
    - `baseRad 2.5..3.5` gives polygons ~3.5-9 px across (40-55% of
      hero radius — matches obsidian's 0.40-0.54 satellite scale).
  Net: hero remains a smooth hex prism; satellites are now visibly
  angular fragments. The two shape languages contrast clearly and the
  satellites never read rectangular.

  **v17.64 (silhouette pass)** — user feedback after v17.63: *"thats
  perfect but one last pass through, I dont want any pixel art that
  ends up looking like a rectangle, some of it is like that now"*. The
  v17.63 chamfer was only 2 rows, which left squat/equant heroes with
  too many middle rows at full width — at certain rotations they read
  as bevelled rectangles, not hex prisms. Stronger size-scaled chamfer:
    - **Tall** (`halfH ≥ 7 && halfW ≥ 5`): 4-row chamfer (4/3/2/1).
      The elongated body still tapers to a 3-px-wide basal pinacoid
      at the very top so the hex termination reads clearly. Tall
      hero `halfW` bumped 4 → 5 so the body has enough width to
      carry the 4-row chamfer without bottoming out at width 1.
    - **Standard** (`halfH ≥ 4 && halfW ≥ 5`): 3-row chamfer (3/2/1).
      Squat (`halfW 6-7`, `halfH 4-5`) and equant (`halfW 5-6`,
      `halfH 5-6`) heroes both fall here and now show a clear hex
      taper at top and bottom rather than a near-flat edge.
    - **Narrow** (`halfW = 4`): 2-row chamfer fallback (no v17.64
      hero falls here but kept for future tweaks).
    - **Satellites** (`halfH < 4`): 1-row chamfer scaled to `halfW`
      (unchanged).
  Net: every hero silhouette now has at least 3 rows of taper on each
  end and tall ones get 4 — no aspect bucket can read as a rectangle.

  **v17.63 (polish pass)** — user feedback: *"okay so its lackluster
  now, take a full polish pass on it"*. The v17.62 noise cuts left the
  body reading muddy and flat — no specular peak, no truly bright zone,
  burgundy palette lacked precious-gem identity. v17.63 lays five
  polish features on the v17.62 framework:
    - **Palette overhaul** — every body tone pushed toward more
      saturated, more vibrant ruby red. `MID` `#7a142e → #a0183a`
      (vivid blood-red, was burgundy); `LIT` `#a83048 → #d83458`
      (bright ruby); `HOT` `#c85070 → #f04068` (vivid pink-red).
      Added `FIRE` `#ff90a8` (internal sparkle) and `SPEC` `#fff0f4`
      (near-white catchlight). `DEEP`, `OUT`, `CRACK`, `SILK` also
      nudged.
    - **4-tone lighting** — `lightTone` now returns `HOT` for
      `lit > 5`, then `LIT > 2`, `MID > -1`, else `DEEP`. The upper-
      left wedge of the crystal now reads truly bright, not just
      "less mid".
    - **Specular peak** (hero only) — searches diagonally from
      screen upper-left toward the centre for the first position
      whose inverse-rotated local coords land on a body interior
      pixel with at least 2 px of inset from outline + chamfer
      (never sits on `OUT`). Paints 1 `SPEC` + 2 `HOT` halo pixels.
      Modelled on obsidian's pure-white specular.
    - **Internal fire** (hero only) — 1-2 `FIRE` pixels at hash-
      driven positions in LOCAL coords (stays glued to the crystal
      as it rotates). Inset check rejects positions outside the
      body. The "internal sparkle" gemstones have.
    - **Core glow halo** — the pigeon's blood core (detail ≥ 2)
      now gets a 1.5-px-wide brighter ring around it (`DEEP → MID`,
      `MID → LIT`, `LIT → HOT`). Reads as the gem glowing from
      inside rather than a flat dark spot at the core.
  All five polish features apply to the hero only (`detail = 2`);
  satellites stay clean (just body + 4-tone lighting). The hero now
  pops; the cluster still reads as one unified specimen.
  *Palette* (v17.63 polish) — `OUT` `#1c0408` / `CRACK` `#280608` /
  `DEEP` `#5a1024` / `MID` `#a0183a` / `LIT` `#d83458` / `HOT`
  `#f04068` / `FIRE` `#ff90a8` / `SPEC` `#fff0f4` / `SILK` `#f8e0e0`.
  Renders host-through via the `drawEarlyOreBase` branch; excluded
  from edge-inset and from the value≥800 generic-shine block.
- **tanzanite** — done (v17.66); redesigned from the drawGemScatter
  placeholder. Cut-gem cluster of **orthorhombic** prisms — crisp
  rectangular cross-section + a low wedge termination, deliberately NOT
  the chamfered hex of ruby/emerald. 1 hero (medium prism, halfH 7-9 ×
  halfW 3-4, ±0.35 rad lean) + 1-2 smaller leaning satellites kept
  clearly smaller. Signature = **pleochroism**: a violet→indigo→blue
  hue-shift along each crystal's long axis (3 zones on LOCAL `iv` so it
  stays glued under lean) — tanzanite's real tell and the hard
  differentiator from painite (the other orthorhombic prism, which is
  dark-orange + static). Built on ruby's **backward-mapped rotation +
  screen-space 4-tone lighting** (lit upper-left whatever the lean);
  hero also gets a silk fleck + one rotation-proof specular (upper-left
  bright extreme). Palette: `OUT` `#0d0a30`; violet
  `#2c1f72/#523fb4/#7d64ea/#ab93ff`, indigo
  `#241f82/#3f48be/#5f6fe6/#8f9bff`, blue
  `#15296e/#2a57c4/#4f88ee/#86b8ff`; `SPEC` `#eef0ff`, `SILK` `#cfe0ff`.
  Renders host-through via `drawEarlyOreBase`; excluded from edge-inset
  and the value≥800 generic-shine block. Lean is the one tuning dial
  (`heroAng` multiplier) if a future pass wants more/less tilt.
  v17.67 "more" enrich (owner: "too simple, needs more more more") —
  pushed it to a lush, premium-feeling druse: cluster grew to 1 hero +
  **2-3 satellites + 2-4 base nubs**; added the authentic **trichroic
  burgundy flash** (`BUR` ramp `#3e1242/#6e1f63/#a8357f/#e070a8` replaces
  the indigo mid-zone on ~42% of crystals → real blue/violet/burgundy
  pleochroism), **internal FIRE** sparkle `#dffaff` (1-2 px, hero),
  block **colour zoning** (±1 brightness on local 2×2 blocks, detail≥1),
  a brighter **table facet** on the termination, and a per-crystal
  **hue-direction flip**. Verified across 16 variations in a throwaway
  harness — reads dense + vivid, no host-scatter. Dials if it reads too
  busy/too pink: `nNub`/`nSat` (density), the `seed+2` burgundy
  probability, `seed+8` fire count.
  v17.68 polish/refine pass — three cohesion + form refinements over
  v17.67: (1) **rim catch-light** — the upper-left silhouette edge now
  takes the bright hue tone (`ramp[3]`) instead of dark outline on
  detail≥1 crystals, so each prism reads crisp/3-D instead of soft;
  (2) **tight base druse** — nubs pulled in (spread ±18→±11) and biased
  to the base (`cy+4..cy+12`) + count 2-4→1-3, killing the scattered
  "floating speck" nubs so the cluster reads as one specimen; satellites
  snugged (`±3..6`); (3) **burgundy balance** — trichroic flash dropped
  0.42→0.36 so blue-violet stays dominant and burgundy reads as a flash,
  not the body. Geometry/lighting model unchanged.
- **ore placement revamp (v23.16).** A system change, not an art pass. Every
  Earth ore is now locked to one **host** material (`host: 'dirt' | 'stone'` in
  `ORES`) so nothing is found in both dirt and stone; `generateWorld()` converts
  each ore's neighbour ring to its host in two ordered sweeps (stone first, dirt
  last, so dirt wins contested tiles). Depth bands were **tightened** (coal
  4–120 → 4–45, etc.) so only ~2-3 ore types coexist at any depth and shallow
  ores no longer bleed deep; ores were made **sparser**
  (`EARTH_ORE_SPAWN_MULTIPLIER` 0.38 → 0.26). Hosts: dirt = coal, bauxite,
  methane ice, amber, fossil, gold; stone = everything else. Per-ore *art* is
  unchanged. Verified with a throwaway pickOre distribution harness (tight
  bands, ~halved density) + clean boot (no console errors, `generateWorld`
  completed).
- **batch-2 ore expansion (v24.15).** Thirteen ores added/upgraded in one
  pass — roster 19 → 32. Five shared top-level primitives in
  `js/sluice/108-ore-helpers-2.js`: `drawMetalCube` (beveled cube /
  point-up octahedron + cleavage steps + specular), `drawBandedBotryoidal`
  (concentric-banded bulbs), `drawPolishedStone` (mottled pebble + waxy
  sheen), `drawMatrixVeins` (dark random-walk webbing), `drawFlecks`
  (sparkle scatter). Renderers split across `111-ore-banded-druse.js`,
  `112-ore-stone-polished.js`, `113-ore-gems.js`, `114-ore-exotic.js`; all
  host-through via `drawEarlyOreBase`, excluded from edge-inset +
  generic-shine, and the legacy 140 dispatch for diamond/painite/unobtanium
  was removed (those three were the last `drawGemScatter` placeholders).
  - **malachite** — banded green botryoidal: main bulb + 1 satellite via
    `drawBandedBotryoidal`. out `#06241a`, bands
    `#0c3b22/#157a44/#2faa66/#6fd99a`, sheen `#9ff0c0`. Concentric bands are
    the tell (vs faceted emerald, mottled jade).
  - **galena** — lead-grey cleaved cubes: hero + 2-3 satellite `drawMetalCube`
    (octa false), ~70% axis-aligned. `#15181d/#3a4048/#6b7480/#aeb8c4/#eef4fa`.
  - **magnetite** — near-black octahedral druse: 4-6 tight `drawMetalCube`
    (octa true). `#05070a/#14181f/#262d38/#46505e/#7a8696` + `#8fa0b4` glints.
  - **turquoise** — polished blue-green + black matrix: `drawPolishedStone`
    body + `drawMatrixVeins`. body `#10403e/#1c6f68/#2fa298/#48c9bd/#9fe8dd`,
    veins `#1a1410/#4a3a28`.
  - **cobalt** — electric-blue tabular blades: 3-4 thin `drawOreShard`.
    `#0c1638/#1f3f9e/#2f5bd8/#5a86f0/#bcd4ff`.
  - **lapis** — ultramarine + gold pyrite/calcite flecks: `drawPolishedStone`
    + `drawFlecks`. body `#0c1a4a/#142a6e/#22398f/#3257b8/#5a82e0`, flecks
    `#e8c24a/#f0d878/#dfe6ee`.
  - **amethyst** — purple quartz geode: 4-6 tall `drawGemFacet` points, bases
    aligned, tips fanning up. `#1e0c40/#4a2a86/#3a1b6e/#6a3bb5/#9b6fe0/#e8d8ff`.
  - **jade** — mottled-green polished stone (canonical `drawPolishedStone`),
    ~40% pebble-pair. `#10301f/#1c4a32/#2f7a4e/#4f9e6e/#86c79a/#d8f0e0`. No
    facets/bands/veins.
  - **rhodochrosite** — rose-pink banded botryoidal (malachite sibling): bands
    `#5e1733/#9c2a52/#cf5378/#f29ab4/#ffd7e3`, white-pink crown `#fff0f5`.
  - **sulfur** — lemon crystal crust: ~6-9 tiny `drawGemFacet` chips +
    `drawOreGrain` bits + 1 orange realgar fleck `#e8641e`.
    `#6a4e08/#c9a318/#b89018/#e8cf2a/#f7ea5e/#fff7a0`.
  - **peridot** — olive-lime equant cut gem + 2 satellites + oily `#c8f060`
    core. `#1e3408/#4a7016/#3a5a10/#6a9e1e/#9ccb3a/#e8ff9a`.
  - **platinum** — heavy white-metal vein: stout `drawCurlWire` + big
    `drawOreGrain` nuggets at joints. `#3a4048/#5a6068/#9aa4ae/#d8e0e8/#fbfeff`.
  - **diamond** (upgrade) — brilliant octahedral `drawGemFacet` hero +
    satellites, 4-point white sparkle star + R/G/B dispersion. `#3a6a8a` →
    `#ffffff`.
  - **painite** (upgrade) — dark garnet-orange orthorhombic prism via chunky
    `drawOreShard`, `#e89a5a` clarity glow. `#2a0e08/#5a2410/#a8501e/#d68a4a/#ffd0a0`.
  - **unobtanium** (upgrade, legendary) — magenta `drawGemFacet` hero +
    ANIMATED iridescent chrome rim (`performance.now()` cycle) + "impossible"
    open facet lines. `#3a0a4a/#a020c0/#7a1490/#c828d8/#ff6af0`.
  - **opal** (new, animated) — milky `drawEncasedNodule` + ~10-14
    play-of-colour flecks cycling `#ff4ad0/#3ad0ff/#7aff5a/#ffd84a` (~6s,
    per-fleck + per-tile phase). The animation is the tell.
  Built Opus-plans / Sonnet-executes (4 parallel agents, one fragment each).
  Verified: build (46 fragments), `node --check` parse OK, clean boot
  (`window.gm` present, `generateWorld` ran, zero console errors). Live
  per-tile render is owner-playtest only (preview pauses RAF); visual polish
  pending playtest.
