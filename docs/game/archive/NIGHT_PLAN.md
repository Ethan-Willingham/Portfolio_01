# NIGHT_PLAN — Sluice Underworld Redesign

> Status doc + executable design spec. Read this top-to-bottom before
> touching `sluice.js`.

---

## 0. STATUS — read this first

**No game code was changed in this pass.** This file is the deliverable.

**Why.** The Underworld brief's method is, verbatim, *visual*: "Run the
game. Walk up to a cluster of the new ore. Compare side-by-side with
coal. If it's not as good as coal, fix it." Every step is build → look →
compare → iterate. The headless preview here **cannot be seen**:

- `preview_screenshot` times out every time — resized viewport, frozen
  rAF loop, both. It does not work for this project's canvas.
- The game canvas is 0-width until the preview viewport is given a real
  size via `preview_resize` (then it renders at e.g. 778×1275 — good).
- `canvas.getImageData()` / `canvas.toDataURL()` **do** work (confirmed:
  a mid-screen pixel read back `rgb(54,36,14)` — real dirt).

Blind-grinding 8 ore renderers with no way to iterate is precisely the
"20 mediocre items, game looks worse" outcome the brief names as the
worst possible result, and the brief says the quality bar is
non-negotiable. So this pass produced the **plan** (the brief's Step 1)
to a high standard instead of un-verifiable sprites. The plan below is
written so the next session can execute it fast and well.

### Verification pipeline for the next session (USE THIS)

The `preview_screenshot` tool is dead, but you can still see your work:

1. `preview_resize` the preview to ~1100×1500 so the game canvas gets a
   real backing store.
2. Load `sluice.html?dev=1&_rafTimer=1` (the `_rafTimer` query
   makes the rAF loop run in the headless tab).
3. Drill / dev-teleport to the ore you want to inspect.
4. `preview_eval`: kill the loop so the page is stable —
   `window.requestAnimationFrame = function(){return 0;};` — then build
   a small zoom canvas and export it:
   ```js
   var cv = document.getElementById('game-canvas');
   var z = document.createElement('canvas'); z.width = 320; z.height = 320;
   var zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
   zc.drawImage(cv, SX, SY, 40, 40, 0, 0, 320, 320); // 8x zoom of a 40px region
   return z.toDataURL('image/png');   // base64 string
   ```
5. The returned base64 → write it to a file with PowerShell
   (`[IO.File]::WriteAllBytes(p,[Convert]::FromBase64String($b64))`) →
   open it with the Read tool (Read renders images). Now you can see a
   pixel-accurate 8× zoom of any ore and compare it to coal.

Keep the export region small (≤320px) so the base64 returns intact
through `preview_eval`. This loop is slow (~4 tool calls per look) but it
is real verification — use it. **Do not ship ore art you have not seen.**

---

## 1. The bar, restated

Coal (`drawEarlyOreBase` `type==='coal'`, ~line 9179) is the bar. Its
technique, for reference when building new ores:

- Per-tile cluster keyed **only** on `(r,c)` via `tileHash01` — never a
  neighbor read. (Mining a neighbor must never reshape a survivor.)
- Each shard rasterized column-by-column along a tilted long axis with
  1px `fillRect`s; lozenge taper + per-column wobble = an irregular but
  intentional pixel edge.
- Tone picked by **perpendicular row**: outline rim → silver shine band
  (cool, `#6c7280`) → near-black base → soft shadow → lower outline.
- A separate "clump bulge" pass fuses knots into host shards.
- Zero anti-aliasing. ~140 lines for one tile type. That is the cost of
  the bar — budget it.

New headline ores go through the **early-ore atlas** path
(`USE_EARLY_ORE_ATLAS`, 96 variants × type, pre-baked) so the fidelity
is free at runtime. Cheap accent ores can stay inline.

---

## 2. Scope — the 4–8 things, in priority order

Picked for maximum visual impact per the brief's own Step-3 guidance.
Each is a finish-before-moving-on unit.

1. **Diamond** — currently a flat blue blob; the single most
   upgradeable ore in the game.
2. **Pyrite** — the fool's-gold tease; cubic habit is the showcase.
3. **Emerald** — currently a flat green wash; hexagonal prisms transform it.
4. **Geode** — new two-hit breakable ore; visual + mechanical novelty.
5. **Gold** — solid today but generic; the metallic-specular pass elevates it.
6. **The Crystal Hollow** — a new mostly-void cave layer (depth ~188–218).
7. **`pickOre` peaked distribution** — give every depth band a signature ore.
8. **Layer identity pass** — wall pattern + retint + ambient + bleed
   transitions for 2–3 existing layers (deepcrust, magma, crystal).

If a session runs short: 1–5 alone, done at the coal bar, is a win.
Five great ores beat fifteen mediocre ones.

---

## 3. `PALETTE_MASTER` — the master palette spec

Add a `PALETTE_MASTER` object near the top of the RENDER section. Every
new ore/layer pulls from it; no inline hex proliferation. ~48 colors,
organised in **ramps**. Each ramp obeys the hue-shift law: **lighter →
shift warm (toward yellow); darker → shift cool (toward blue/violet).**
Never a straight HSL-lightness ramp.

Ramp structure — every ore ramp is `{ outline, shadow, base, light,
specular }` (+ optional `bounce`). Representative values below are
**starting points to tune visually**, not finished:

| Ramp | outline | shadow | base | light | specular | Notes |
|---|---|---|---|---|---|---|
| stone | `#23252b` | `#3a3f47` | `#5b626d` | `#838b97` | — | matte, no specular |
| dirt | reuse topsoil | | | | | keep existing |
| gold | `#5a3c0a` | `#8a5e14` | `#cf9a22` | `#f0c64e` | `#fff3c2` | specular = warm near-white |
| silver | `#2c3138` | `#566069` | `#9aa6b2` | `#cdd6de` | `#f4f8fb` | specular = cool near-white |
| pyrite | `#4a3a10` | `#7a6420` | `#b59a34` | `#d8c258` | `#fdf2b0` | paler/greener-yellow than gold; flat metallic |
| diamond | `#1f3a52` | `#3f6f93` | `#9fd4ec` | `#d8f2fb` | `#ffffff` | + dispersion R/G/B rim pixels |
| emerald | `#0c3b27` | `#155e3a` | `#1f8f54` | `#56c882` | `#d6f6e0` | cool deep green |
| ruby | `#4a0a1c` | `#7e1230` | `#c01f44` | `#e8537a` | `#ffe2ea` | |
| hot/glow | `#5a1408` | `#9c2e10` | `#e8721e` | `#ffc24a` | `#fff0c0` | black-body ramp; for magma, uranium, heated rock |
| ice/cool | `#2a4654` | `#4d7d8e` | `#9fc6cf` | `#d3ebef` | `#ffffff` | permafrost, methane ice, cryogenic |
| exotic | `#241344` | `#43287e` | `#7a4ad0` | `#b58cf0` | `#f0e6ff` | moon/mantle; pair with hue-rotation at draw time |

**Cohesion rule:** adjacent ores share ≥1 colour. e.g. pyrite's `shadow`
and gold's `shadow` should be within a few values of each other so a
pyrite-vs-gold tile pair reads as one artist. Coal/copper/bauxite/iron
are locked — sample their existing hexes into `PALETTE_MASTER` so the
new ores harmonise with the four that stay.

---

## 4. Ore specs (executable)

Light is **top-left** for every ore. All geometry keyed on `(r,c)` via
`tileHash01`. Atlas-bake ores 1–4.

### 4.1 Diamond — octahedral, dispersive
- **Habit:** octahedral. Render 1 large + 1–2 small rhombus crystals.
  Large = ~10–12px tall, ~7px wide, pointed top and bottom, a faceted
  centre seam.
- **Facets:** 4 visible facet planes per crystal; top-left two get
  `light`, bottom-right two get `shadow`/`base`. A crisp `specular` (pure
  white) 1–2px cluster on the top-left facet.
- **Killer feature — chromatic dispersion.** Walk the crystal's
  silhouette rim and drop a single pixel of pure red, then green, then
  blue, cycling. ~6–10 dispersion pixels total. This is what makes it a
  *diamond* and not a glass square. Without it the ore fails.
- **Animation:** a faint specular that drifts 1px on a per-tile
  `tileHash01` phase, slow.
- **Palette:** `diamond` ramp. Host shows cool-dark around it.

### 4.2 Pyrite — cubic, "fool's gold"
- **Habit:** 2–5 **axis-aligned** cubes (NOT random angles — the
  axis-aligned cubic habit IS the read). Sizes vary 3–6px, loose cluster.
- **Per cube:** flat-shaded top face (`light`), front face (`base`),
  side face (`shadow`). One crisp `specular` pixel on the top-left
  vertex; one `outline`-dark pixel on the bottom-right vertex.
- **Striations:** 1px parallel lines across each cube face (real pyrite
  is striated) — same direction per cube.
- **Palette:** `pyrite` ramp — deliberately paler and greener-yellow
  than `gold`, and flat (metallic-matte), so a player who's seen real
  gold feels the let-down. That contrast is the gameplay point.

### 4.3 Emerald — hexagonal prisms
- **Habit:** 3–7 thin tapered **hexagonal** prisms erupting from a
  shared base point near tile-bottom. Each prism 2–3px wide, 6–10px
  tall, pointed top and bottom, tilt varied per prism by `tileHash01`.
- **Per prism:** light-facing long edge = `light`; dark edge = a thin
  `shadow` rim; one `specular` pixel near the top.
- **Silhouette first:** players read the hex-prism cluster shape before
  the green. Get the silhouette right; colour is secondary.
- **Palette:** `emerald` ramp.

### 4.4 Geode — two-hit breakable (visual + mechanic)
- **State 0 (intact):** a dull rounded rock nodule, 18–22px, matte
  `stone` ramp, slightly botryoidal (overlapping circles) outline. Looks
  unremarkable — a plain lump.
- **State 1 (cracked):** after the first drill hit, a jagged dark crack
  line splits the nodule; a sliver of glittering interior shows. Set a
  per-tile `cracked` flag (see Mechanic spec §6).
- **State 2 (shattered):** second hit shatters it open → spawns 3–5
  small gems (random colour each from {emerald, ruby, diamond, gold})
  as collectible ore. Big particle burst, brief hit-pause.
- **Why:** mechanically unlike any other tile; visually unforgettable.
  Rare — a few per crystal band / cave layer.

### 4.5 Gold — metallic specular pass
- Keep the existing massive-nodule wiggly-blob technique (copper/iron
  family) — it's good. Add what's missing:
- **Specular:** a tight 1–2px near-white-**yellow** cluster (`gold`
  ramp `specular`), not pure white — metals reflect body colour.
- **Shine→base→shadow→base rhythm:** across the nodule the value walks
  bright → dark (terminator) → slightly-bright again (ambient bounce).
  This is what makes metal read as round and shiny.
- **Bounce light:** 1px warm stroke along the bottom-right rim.

---

## 5. The Crystal Hollow — new cave layer

A mostly-**void** layer, depth **~188–218** (insert between fossil and
deepcrust; push deepcrust/magma/crystal/mantle down ~30 rows; update
`LAYERS`, `ORES.*.minDepth/maxDepth`, and the moon offsets).

- **Morphology:** `growEarthVoidPockets` tuned for *large connected*
  caverns here, not small pockets — open space the player flies through.
  Stalactites (ceiling spikes) + stalagmites (floor spikes) as tile
  decorations. A few water pools on cavern floors (reuse the liquid sim,
  surface-water type).
- **Wall:** a new biome wall pattern — crystal-facet texture, faint
  embedded glints, deep violet-blue.
- **Light:** bioluminescent moss patches on walls — soft cyan-green
  glow pools, gentle pulse on `tNow` + per-tile phase. The only light
  source down here; everything else is dark.
- **Ambient:** glittering motes drifting slowly (sparkle caught in moss
  light).
- **Ore:** crystal ore embedded sparsely in the *walls* — mining by
  exploration, not strip-mining. This is where geodes concentrate.
- **Vignette:** violet cast, ~15% alpha.
- Reference: Hollow Knight's Crystal Peak, Owlboy's caverns.

---

## 6. Layer identity pass — table

For deepcrust, magma, crystal apply the full per-layer signature. Each
gets: wall pattern, dirt/stone retint, ambient particle, one flourish,
and **bleed transitions** (top 4–8 rows hint at this layer, bottom 4–8
hint at the next — Steamworld-Dig cinematic descent).

| Layer | wall | dirt retint | ambient | flourish | vignette |
|---|---|---|---|---|---|
| deepcrust | pressure micro-cracks | compacted, hairline cracks | dust from above | occasional creak-dust fall | neutral-dark |
| magma | heat fissures, glowing seams | molten red veins, pulsing | rising ember sparks + heat shimmer | lava drip from ceiling | orange-red ~18% |
| crystal | crystal facets, glints | sparkly speckle | glitter motes | random sparkle catch | violet ~15% |

(Permafrost already has a wall builder — verify it has frost crystals;
add player-breath fog as its flourish if time.)

---

## 7. `pickOre` — peaked distribution

Today `pickOre` walks rarest→common with a flat depth multiplier. Give
each ore a **peak**: add `peakDepth`, `falloffWidth`, `peakChance` to
each `ORES` entry. Effective chance at depth `d`:

```
chance(d) = peakChance * exp(-((d - peakDepth)^2) / (2 * falloffWidth^2))
```

A gaussian bump. Result: every depth band has a *signature* ore that's
common there and rare elsewhere — drilling through 200 feels different
from 250, not just looks different. Keep coal/copper/bauxite/iron's
existing feel by setting their peaks shallow and falloff wide.

Also (if time): a **rich-vein pass** — after per-tile rolls, scatter
2–4 dense 6–15-tile veins of one ore per layer (vein shapes: sphere,
sheet, column, bullseye). The "I hit a vein!" moment.

---

## 8. Execution order & estimates (next session, ~3h budget)

1. ~25 min — re-read coal in full; read `pickOre`, `generateWorld`,
   `growEarthVoidPockets`, the biome wall builders; set up the §0
   verification loop and confirm it works once.
2. ~30 min — add `PALETTE_MASTER`; build **diamond**; verify vs coal.
3. ~25 min — **pyrite**; verify.
4. ~25 min — **emerald**; verify.
5. ~30 min — **geode** (art + the §6 two-hit mechanic); verify.
6. ~15 min — **gold** specular pass; verify.
7. ~40 min — **Crystal Hollow** layer (§5) if ore budget held.
8. ~15 min — `pickOre` peaked distribution (§7).
9. ~15 min — handoff: bump `GAME_VERSION`, write what shipped.

Do them in order; finish each before the next. If you fall behind, stop
at a clean ore — never a half-drawn one.

---

## 9. Hard invariants (do not violate)

- `var` only; no modules; no build step; single IIFE; `TILE = 32`.
- Per-tile ore geometry deterministic on `(r,c)` via `tileHash01` — no
  neighbour reads inside an ore renderer. (Neighbours fine for layer /
  cave shaping.)
- Headline ores → the early-ore atlas pre-bake path.
- Coal, copper, bauxite, iron, topsoil dirt/stone — **locked, do not
  touch.** They are the bar; sample their hexes into `PALETTE_MASTER`.
- Bump `GAME_VERSION` (top of file) when game code changes — suggest
  `v16.0` for a change of this scale.

---

## 10. One-line summary for whoever picks this up

The design is fully specified above — the work that remains is the
meticulous pixel execution, which needs the §0 verification loop.
Start at §8 step 1. Five ores at the coal bar is the win.
