# BACKGROUND_STYLE.md — Frontier Soviet Backgrounds

The canonical art-direction bible for everything that lives **behind** the play plane in Sluice — sky gradient, stars, distant mountains, underground biome wall pattern, atmospheric effects. Read this in full before painting any background. Companion to [BUILDING_STYLE.md](BUILDING_STYLE.md) and [MINERALS_BIBLE.md](MINERALS_BIBLE.md).

Reference palettes: see the `SKY` and `BG` constants in [`js/sluice.js`](js/sluice.js), defined immediately after `BLD`.

---

## 1. The principle — backgrounds serve the foreground

Every rule in this document exists for one reason: **the background must read as background.** A beautiful background that competes with gameplay is a worse background than a plain one.

Backgrounds in this game support — never lead — the Frontier Soviet pixel-illustration style established for buildings. Same palette family, same outline discipline, same per-pixel rasterization. The sky is the same world as the watchtower; the distant mountain is the same world as the propaganda poster.

**One sentence to remember:** *if you can't squint and tell the layers apart, the design is wrong before the colour is wrong.*

---

## 2. The four "backgroundness" axes — non-negotiable

A scene reads as background when it satisfies **all four**:

1. **Compressed value range.** No near-black (`< #0a`), no near-white (`> #e8`). `BLD.outline` `#1a0a05` and pure white `#ffffff` are reserved for foreground.
2. **Lower saturation than foreground.** Backgrounds use roughly half the max saturation foregrounds use.
3. **Lower contrast within itself.** A single background layer's lightest pixel to darkest pixel should not span more than ~40% of the value scale.
4. **Lower detail frequency than foreground.** Distant detail is silhouette only; mid detail is shape with one or two interior tones; near detail is the only place full pixel detail belongs. **Underground wall texture has different SHAPE LANGUAGE than the foreground material** (geometric/sparse, not organic clumps) — otherwise the wall reads as more foreground material rather than as a layer behind it.

Violating any of these makes that element start to feel like foreground, which misallocates player attention. This is the single biggest failure mode for backgrounds.

---

## 3. Atmospheric perspective budget — value/saturation per layer

Every layer occupies a *narrower band of the value/saturation scale* than the layer in front of it. The bands don't meaningfully overlap — that's what creates clean depth separation.

| Layer | Value range | Saturation range | Examples |
|---|---|---|---|
| **Foreground gameplay** (player, ores, station, NPCs) | 5–95 | 20–80 | Full BLD palette, ore palettes |
| **Near background** (foreground hills, surface decor at distance) | 5–55 | 15–55 | `BG.nearMtnFill` `#0a0c14`, `BG.nearMtnRim` `#181a26` |
| **Mid background** (mid mountain layer, snow caps) | 12–55 | 8–35 | `BG.midMtnFill` `#1c1f30`, `BG.midMtnSnow` `#c8d0dc` (snow is the one allowed value-pop, capped at V≈85) |
| **Far background** (distant ridge, hazy peaks) | 18–35 | 5–22 | `BG.farMtnFill` `#2a2f40`, `BG.farMtnRim` `#363b4c` |
| **Sky** | 6–25 | 8–25 | `SKY.skyDeepest` `#0a0d16` → `SKY.skyHorizon` `#2c3142` (anchors; Stage 5 derives these from atmospheric scattering) |
| **Distant stars** (sky-reserved) | 35–95 | 0–18 | `SKY.starDim` → `SKY.starHot` |
| **Underground biome fill** (cave edges, behind-tile failsafe) | 8–35 | 8–35 | `BG.bgTopsoil` `#5a3e22` through `BG.bgMantle` |
| **Underground wall pattern** (parallax background layer) | 5–18 | 8–30 | `BG.wallTopsoil` `#36240e` through `BG.wallCrystal`, plus shared `BG.wallMortar` `#06050a` |

Note the **wall is darker than the biome fill** by design — typically ~half the value. This is what makes the cave read as "behind" rather than "loose dirt." See §10 for the architecture.

**The squint test** — desaturate the whole frame mentally. Foreground / near / mid / far / sky must each read as a separate value step. Underground wall and bg fill must also read as separate steps (wall further away than fill).

---

## 4. Reserved colours — locked

These colours appear in **exactly one place** and nowhere else. Reserving them gives the player's eye unambiguous "look here" signals AND keeps unrelated systems from accidentally drifting into each other's identity.

| Colour | Reserved for | Forbidden in |
|---|---|---|
| `BLD.outline` `#1a0a05` | Foreground sprite outlines (BUILDING_STYLE §3) | Backgrounds, sky, mountains, biome fills, wall patterns |
| Pure white `#ffffff` | Future "look-here" key | Everywhere |
| `SKY.starHot` `#e8eef8` | Brightest star cores only | Mountains, foreground, underground |
| `SKY.auroraGreen` / `auroraViolet` | Stage 6 aurora ribbons only | Everywhere else |
| `BLD.redBright` `#e85c40` | Antenna bulbs, propaganda accents, hazard, **and distant outpost lights** | Sky body, mountain fills, biome wall patterns |
| `BLD.warmGlow` `#fbc55a` | Window glow, oil lamps, **and distant outpost windows** | Sky body, mountain fills, biome wall patterns |
| `BG.wallMortar` `#06050a` | Underground wall pattern noise specks only | Sky, mountains, foreground, ore tiles |
| Each `BG.wall<Biome>` colour | Wall pattern fill for *that biome only* | Other biomes' walls, all foreground |
| Each `BG.bgPermafrostFeature` / `bgCrystalFeature` | Their biome's feature accent only (kept in palette but presently unused after the wall-pattern rewrite — Stage 6a reintroduces) | Other biomes |
| Ore palette colours | Ore tiles only (per MINERALS_BIBLE) | Backgrounds |

**The `redBright` + `warmGlow` shared use** is intentional: distant outpost lights blinking on far ridges reuse the same red/amber language as the player's nearby station, so the world feels like one continuous frontier rather than two unrelated layers.

---

## 5. The outline rule — adapted for distance

BUILDING_STYLE.md §3 enforces a 1-px outline on every foreground silhouette. Backgrounds **invert this rule by distance**:

- **Near background layer:** carries a 1-px `BG.nearMtnRim` outline on its top edge — *not* `BLD.outline`. Slightly lighter than the near fill.
- **Mid background layer:** soft top-edge feather in the *layer-behind*'s fill colour (`BG.farMtnRim`). No hard outline. Snow caps get `BG.midMtnSnowRim` on the moon-facing edge.
- **Far background layer:** **no outline at all.** Hard outline at this distance breaks atmospheric perspective.
- **Mountain moon-side rim:** every major peak in mid + near gets a 1-px brighter stroke from peak → sub-right → mid-right → outer-right. Mid uses `BG.farMtnRim`; near uses `BG.nearMtnRim`. Single biggest "rocks feel solid" lever after atmospheric perspective.
- **Sky, biome fills, wall pattern:** never outlined.

Distant Soviet outposts on far ridges may carry a 1-px outline because they're *recognisable structures*, but only at the mid-layer distance. Far-layer structures collapse to silhouette flecks with no edge detail.

---

## 6. Pixel discipline — backgrounds match foreground

Backgrounds use the same pixel-art rasterization as everything else:

- **Per-pixel `fillRect`** for stars, distant lights, wall pattern specks. No `ctx.arc`, no `ctx.ellipse` for sub-5-px detail.
- **Dithered gradients**, not smooth. Sky gradient uses a **pure per-cell hash dither** (after experimenting with Bayer 4×4 → Bayer 8×8 + jitter → finally landed on pure hash because Bayer's diagonal correlation kept showing through). Smooth `createLinearGradient` reads as a different art style and is forbidden for sky.
- **Sky is built via `ImageData` direct pixel writes** (v10.27), not `fillRect` per cell. ~50× faster on rebuilds. The dither cell size is **decoupled from the world-pixel unit**: dither cells are ~1-2 device pixels (so the pattern is at the edge of perceptibility), stars stay at the chunky world-pixel size.
- **Mountain silhouettes are polygons drawn ONE PEAK PER POLYGON** — see §11. A single continuous polygon walking through all peaks self-intersects when adjacent peaks overlap horizontally (which the asymmetric tilt allows), creating bowtie holes via Canvas's nonzero fill rule.
- **No alpha-blended fog.** Atmospheric haze is dithered, not faded. (v10.24 attempted alpha-blended horizon haze and it read as chunky noise; the lesson was that haze cells must be device-pixel-fine, not world-pixel-sized — see §10 anti-patterns.)
- **Underground wall pattern** is a repeating `ctx.createPattern` fill — the X+Y parallax rides on the pattern's own `setTransform` matrix (see §8, §10). One patterned `fillRect` per visible biome band; earlier builds tiled the 64×64 canvas with per-cell `drawImage`.

This is what makes the background read as the *same world* as the foreground. The frequency profile matches.

---

## 7. Animation — backgrounds breathe, not perform

Same rule as BUILDING_STYLE §9: subtle, slow, mostly still.

| Element | Motion | Frequency |
|---|---|---|
| Twinkling foreground stars (`nightSkyTwinklers`) | Sinusoidal alpha pulse | 0.4–1.6 Hz, never sync — phases offset per star |
| Distant outpost lights on mid ridges | Abrupt 1 Hz blink (mechanical, not sinusoidal) | Match `drawAntenna` exactly |
| Distant outpost windows | Slow sinusoidal glow | 0.27–0.40 Hz, never sync (matches station window discipline) |
| Drift particles (Stage 6a — snow, dust, embers, sparkles) | Slow vertical drift + tiny lateral wobble | Per-biome speed |
| Weather clouds (§15) | Slow horizontal drift on `surfaceWind`; shape held (morph off by default) | Far layer slower than near; never faster than the player |
| Precipitation (§15) | Rain streaks fall fast + wind-skewed; snow drifts slow with lateral wobble | Per precip type |
| Lightning (§15) | Abrupt full-screen flash + fast decay, occasional double-strike | Every ~4–12 s, storm mood only |
| Sky gradient | Stage 5 only — atmospheric-scattering driven by `timeT` and sun elevation. Slow seconds-scale transitions, bucketed rebuilds (~0.5° elevation per bucket) | |
| Sun + moon transit (Stage 5c) | Slow arc across the sky | One full cycle per day/night cycle (default ~10 min real time) |
| Mountains | None (static silhouette only) | The moon-side rim direction is allowed to *change with sun position* in Stage 5c but the silhouette geometry never animates |
| Aurora | Slow vertical breathing, low amplitude | 0.05–0.15 Hz, only on aurora ribbons (Stage 6b) |
| Magma/mantle heat pulse + lava streak + embers | Existing — keep | |

**Anti-pattern: parallax that's faster than gameplay motion.** Near mountain layer lags the camera, never leads it. If a background element moves faster than the player's running speed it pulls the eye and breaks.

---

## 8. Parallax discipline

Two-axis parallax. `parallaxStrength ∈ [0, 1]` where 1 means "fully locked to screen" (drifts at 100% of camera speed = appears stationary on screen) and 0 means "moves with world" (1:1, no parallax). World-coord position of a peak/cell at any frame:

```
worldX_drawn = logicalX + cam.x * parallaxStrength
```

Equivalent for Y. Smaller `parallaxStrength` → tile is closer to the camera (less lag). Larger → further (more lag, appears to drift slower).

| Layer | X parallax | Y parallax | Notes |
|---|---|---|---|
| Sky texture | 1.0 (screen-locked) | 1.0 (screen-locked) | Built into native-pixel ImageData blit; doesn't translate with camera at all |
| Far mountains | 0.78 | 0 (1:1 with world) | Y must stay locked or biome bands misalign |
| Mid mountains | 0.50 | 0 (1:1) | |
| Near mountains | 0.22 | 0 (1:1) | |
| Underground wall pattern | `BIOME_WALL_PARALLAX_X = 0.55` (45% lag) | `BIOME_WALL_PARALLAX_Y = 0.70` (30% lag) | Y parallax works here because biome COLOUR is keyed to depth (fixed world-Y bands), but the pattern texture within each biome drifts smoothly across boundaries |
| Tile world / foreground | 0 | 0 | 1:1 with camera |

Speed is derived from implied depth, never picked by feel. If a layer "looks too fast," its parallax strength is wrong, not its texture.

The **wall pattern's Y parallax** is the one piece of vertical parallax in the project — only works because biome colour transitions happen at fixed world-Y boundaries (which never parallax), and only the noise pattern within each biome drifts.

---

## 9. Camera framing — depth-aware vertical

The camera's vertical framing depends on the player's altitude. Pure function of `player.y`, so flying back up reverses the transition smoothly.

```
camFrac = where the player sits on screen, as a fraction of screen height from the top
        = 0.5 → centered
        = 0.55 → slightly above centre (default at/above surface)
        = lower number = player higher on screen = more ground visible below
```

| Player position | `camFrac` | Effect |
|---|---|---|
| At or above surface (`player.y ≤ surfaceY`) | `0.55` (SURFACE_FRAC) | Player slightly above centre — small amount of sky above, decent ground below visible |
| 32 tiles below surface or deeper | `0.50` (DEEP_FRAC) | Standard centered framing |
| Between | Ease-in-out cubic over the 32-tile transition window | Smooth handoff |

Implementation: see `updateCamera` in `js/sluice.js`. The `camFrac` is recomputed every frame from `(player.y + PLAYER_H/2) - surfaceY`; pure function, no state.

**The principle is "atmosphere visible at the surface, centered framing underground."** The exact values are tunable. Currently 0.55/0.50; was 0.72/0.50 in v10.46 before the user requested less sky on screen.

When Stage 5 lands and the sky goes through full day/night cycles, the surface framing matters more — sunset/sunrise sky deserves more screen real estate during dawn/dusk than during midday. Consider letting `SURFACE_FRAC` vary with `timeT` so dusk shows more sky, midday shows less. Not implemented yet; flag for Stage 5c polish.

---

## 10. Underground biome wall pattern — occlusion architecture

The wall behind every cave and tunnel. **v13.11/v13.12 architecture:** the wall is a *parallax background layer occluded by the terrain* — not a masked overlay. This is how 2D games normally do parallax backgrounds, and it replaced a per-chunk clip-and-fill pass that cost ~200 complex `Path2D` fills per frame.

### The model in one paragraph

The biome wall pattern is the underground background. It is painted in the `undergroundBg` pass — one `fillRect` per visible biome band, full screen width, BEHIND the terrain chunks. The terrain chunks draw on top with their cave voids punched out to transparent, so the wall shows through every cave. The rock **occludes** the wall; the cave shape is just the terrain's negative space. No per-chunk masking, no contour fill at main-render time.

### Pass 1 — the wall (`undergroundBg` pass, every frame)

The undergroundBg loop walks `LAYERS` and fills one band per visible biome:
- Non-magma/mantle biomes: `getBiomeWallFill(layerName)` returns a cached repeating `CanvasPattern`. The X+Y parallax rides on the pattern's own matrix — `pattern.setTransform(new DOMMatrix([1,0,0,1, ox, oy]))`, where `ox = cam.x * (1 - BIOME_WALL_PARALLAX_X)` and `oy = cam.y * (1 - BIOME_WALL_PARALLAX_Y)`. Then one `fillRect(worldLeft, visTop, screenW, bandHeight)`, `imageSmoothingEnabled = false` so the speckle stays crisp.
- Magma/mantle: `getBiomeWallFill` returns null. They get the animated heat gradient + embers + lava streak instead — that IS their wall.

### Pass 2 — the terrain punches the voids (`drawSmoothVoids`, cached in the chunk)

`drawSmoothVoids` runs inside `renderTerrainChunk` when a chunk is dirty. It makes the chunk opaque everywhere EXCEPT the smooth cave contour, in two composited steps:
1. `destination-over` — flood a rock backing (the layer's dirt `pal.mid`) behind the already-drawn tiles, making every empty cell opaque.
2. `destination-out` — erase along the marching-squares contour from `buildVoidContourPath`, punching the cave out in exactly that smooth rounded + wobbled shape.

Net: the chunk bitmap is opaque rock + tiles everywhere, transparent only inside the smooth contour. Blitted over the wall, it reveals the wall through exactly that contour.

### The load-bearing invariant — why step 1 exists

Empty cells render to *nothing* (the chunk loop skips them), so a dug-out void is already transparent before `drawSmoothVoids` runs. With step 2 alone, the erase is a no-op wherever the cell was already empty — and the cave reverts to the **blocky empty-cell grid**: right angles at every tile corner (the v13.11 bug, fixed in v13.12). Step 1's backing flood is what lets the contour erase actually define the shape. **Do not remove the backing flood.** (It is a flat colour, fully erased back out inside the contour, so it never changes the cave shape — unlike the long-removed `drawVoidTerrainBacking`, §12.)

### Wall pattern source canvases

- 64×64 world pixels per biome (`BIOME_WALL_TILE_PX`).
- Six biomes: topsoil, bedrock, permafrost, fossil, deepcrust, crystal. Magma + mantle skip it.
- `buildSubtleWallPattern(seed, wallColor, brightAccent)`: solid `BG.wall<Biome>` + ~6 `BG.wallMortar` darker specks + ~3 brighter `BG.bg<Biome>` accent specks. **No grid, no block edges, no organic loose-material features** — earlier iterations had brick grids ("chocolate squares" defect) and loose pebbles (looked identical to foreground dirt). The wall must read as a textured DARKER PLANE, distinct in shape language from the organic foreground.
- `getBiomeWallFill(layerName)` wraps the 64×64 canvas in a cached `ctx.createPattern(img, 'repeat')`. Two caches: `biomeWallCache` (the canvas), `biomeWallFillCache` (the pattern).

### Why this architecture

The pre-v13.11 model cached a marching-squares `Path2D` per chunk and, every frame, `ctx.fill(voidContour)`'d each visible chunk with the parallax pattern — ~200 complex path fills/frame, ~2 ms of underground GPU. The occlusion model is ~1 `fillRect` per biome band; the cave shape costs nothing extra (it is the terrain's negative space, which the chunk renders anyway). Parallax is identical — same pattern matrix. Full hunt: the v13.9–v13.12 commits.

### Adding a parallax layer / restyling — for future work

The occlusion model makes this easy: any new background layer is just another draw in the `undergroundBg` pass, painted back-to-front, and the terrain occludes all of it.
- **Restyle the wall:** edit `buildSubtleWallPattern` (or a per-biome `build<Biome>WallPattern`) and the `BG.wall*` / `BG.bg*` palette. Patterns are cached lazily — clear `biomeWallCache` + `biomeWallFillCache` for a live rebuild.
- **Add a deeper parallax layer:** draw it in the undergroundBg loop BEFORE the wall `fillRect`, with a *higher* parallax constant (more lag = further back). Each layer is one `fillRect` with its own pattern + parallax matrix. Obey §3 — every layer further back occupies a narrower, darker value band.
- **Parallax constants** sit next to `BIOME_WALL_TILE_PX`: `BIOME_WALL_PARALLAX_X = 0.55`, `BIOME_WALL_PARALLAX_Y = 0.70`. See §8.

### Surface dirt cap — static foreground topsoil lip over the wall's top (v23.21)

The topsoil wall band stops at a **dead-straight line at `surfaceY`**, right where the sky starts — through any near-surface shaft the parallax background visibly "just ends" at a ruler edge. `drawSurfaceDirtCap` (next to `getBiomeWallFill`) hides that edge with a **solid foreground dirt lip**, for the **topsoil band only** and **only while the surface is on screen**:

- A band that is **flat along the top (`surfaceY`)** and **wavy along the bottom** (`surfaceCapShape`, a sum of sines, depth ≈ 1.2–3.6 tiles below `surfaceY`, averaging ~2.4).
- Filled in the **foreground terrain's own topsoil colours** (`TILE_MATERIALS.dirt.topsoil`: `top → mid → bot` gradient, `grit` + `warm` grain flecks, `cool` shaded rim along the wavy underside) so it reads as the same ground the player digs — *foreground*, distinctly lighter/warmer than the darker `BG.wallTopsoil` parallax wall that recedes below its wavy edge.

Load-bearing invariants:
- **It is STATIC — locked to the world surface, no parallax.** The wavy shape is a pure function of world X (no `cam` term) and the top is pinned to `surfaceY`, so the cap never drifts off the seam it's hiding. This is the whole point: unlike the drifting parallax wall, the cap doesn't move relative to the ground, so it reliably covers the wall's top edge.
- It is drawn in the `undergroundBg` pass **in front of the wall but behind the terrain chunks**, so the terrain occludes it everywhere except the caves — exactly where the seam used to show. It is opaque (a true foreground layer over the background), not a tint.
- The cap's own flat top at `surfaceY` is just the normal ground/sky horizon (the surface), so it doesn't reintroduce a "floating layer" edge; the wavy bottom carries the cap → receding-wall transition.
- No new palette colours — reuses `TILE_MATERIALS.dirt.topsoil`. Tuning levers: `SURFACE_CAP_MIN`, `SURFACE_CAP_WAVE`.

---

## 11. Mountain rendering rules

Built up through v10.20-v10.47. Key invariants:

1. **Per-peak polygons, not single continuous path.**
   With per-peak asymmetric tilt, adjacent peaks can overlap horizontally (one peak's right shoulder extends right of the next peak's left shoulder). A single closed polygon walking through every peak self-intersects at overlaps; Canvas's nonzero fill rule leaves the overlap area UNFILLED — visible as a bowtie hole inside the mountain body. **Each peak as its own closed polygon.** Adjacent peaks just paint the same colour twice with no hole.

2. **Per-peak rim strokes (no single polyline).**
   Same issue. A single rim polyline through all peaks draws a connector line between peak N's right shoulder and peak N+1's left shoulder — visible as a faint stroke through valleys. Per-peak stroke avoids it.

3. **Asymmetric tilt** via `tileHash01(idx, seed, 0xA730)`.
   tilt ∈ [-0.7, +0.7]; positive shrinks `widR` and grows `widL` (right slope steeper, left gentler). Symmetric pyramids are the "kid drawing" failure mode from the mountain research.

4. **Wide sub-peak height variance.**
   `subL`/`subR` heights span 0.60–0.92 of peak height. Some peaks read as twin-peaks, others as clear shoulders. Same 7-vertex silhouette, more visual variety.

5. **Moon-side rim highlight on every major peak.**
   Stroke peak → sub-right → mid-right → outer-right with `cfg.moonRimColor`. Mid uses `BG.farMtnRim`; near uses `BG.nearMtnRim`. In Stage 5c the rim *direction* will track the actual sun/moon position — currently locked to upper-right.

6. **No internal shadow polygons.**
   v10.29 added a 4-vertex shadow polygon on the upper-left slope as a depth cue. Rendered as a visible darker triangle inside the mountain body ("inner peak" defect, v10.44). Removed. Snow caps + moon-side rim + asymmetric shape carry depth.

7. **Far layer is silhouette only** (no rim, no snow, no shadow). Atmospheric perspective discipline — far things have no contrast against the sky.

8. **Density and heights are tuned for the spawn town.**
   Step counts and max heights were trimmed in v10.46 (mid step 118→150, maxHMajor 180→130; near step 78→105, maxHMajor 105→80) because the surface compound was too visually busy. Mountain seeds shuffled in v10.47 to dodge an ugly spawn-area layout.

---

## 12. Anti-patterns — discovered the hard way

Each of these cost a commit cycle to find.

- **Use smooth `createLinearGradient` for sky.** Always dither to match the pixel-art frequency.
- **Use `ctx.ellipse` or `ctx.arc` for small stars or distant features.** Per-pixel `fillRect` only at sub-5-px scale.
- **Use raw hex/rgba in a background fill.** New colours go in the SKY/BG palette first.
- **Outline far-layer mountains in `BLD.outline`.** Hard black outline at distance breaks atmospheric perspective.
- **Use `BLD.outline` in a background fill.** Reserve it for foreground silhouettes only.
- **Place pure white anywhere.** Reserved.
- **Photographic textures in the sky.** Frequency mismatch with the pixel foreground — lesson from the v10.19 NASA Milky Way attempt.
- **Mix multiple parallax layers without value/saturation differentiation.** Reads as one busy wallpaper instead of depth.
- **Bayer dither with ±0.5-level jitter on the sky gradient.** Diagonal correlation in the matrix still shows through. Use pure per-cell hash instead.
- **World-pixel-sized dither cells for horizon haze.** At fullscreen each "world pixel" is 3-5 device pixels, so a "subtle dither" reads as obvious chunky noise dots. Haze cells must be ≤2 device pixels OR don't render haze in world space at all.
- **Drawing the underground wall as loose pebbles in warm earth.** Same shape language + same colour family as foreground dirt → the eye can't separate them. Wall must be DISTINCT shape language (geometric or sparse-noise, never organic-loose) AND darker.
- **Block-grid walls with bright `bg`-colour top-left highlights.** Reads as chocolate squares. The brightness contrast on grid lines makes the wall look like obvious recessed blocks rather than a textured plane.
- **Single-polygon mountain fills walking through all peaks.** Self-intersects with asymmetric tilt → bowtie holes via nonzero fill rule. Per-peak polygons fix it.
- **Single-polyline rim strokes walking through all peaks.** Connector lines through valleys. Per-peak stroke fixes it.
- **Inner-triangle shadow polygons on mid mountains.** Reads as geometric "inner peak" defect, not natural shading.
- **`drawVoidTerrainBacking` painting dirt/stone material in cave-edge cells.** This changed the cave appearance based on what was mined. Removed. (Not the same as the v13.12 backing flood — that is a flat colour fully erased back out by the contour, so it never alters the cave shape.)
- **Erasing the cave void along the contour without first flooding a backing.** Empty cells render to nothing, so they are already transparent — the `destination-out` contour erase is a no-op there and the cave reverts to the blocky tile-cell grid (right angles everywhere, the v13.11 bug). `drawSmoothVoids` must `destination-over` an opaque backing flood BEFORE the contour erase. See §10.
- **Wrong chunk key format.** The terrain chunk cache uses `chunkR + ':' + chunkC` via `terrainChunkKey()`. Building the key by hand with `,` instead silently returns `undefined` on every lookup. Always use the helper.
- **Object-literal missing comma before a comment-block-separated next entry.** v10.31, v10.37: both times I added a final entry to the BG palette literal without a trailing comma, the next property after the comment block had no separator, parser threw SyntaxError, IIFE failed to load, **black screen on startup**. Always trailing-comma the LAST entry when the next property is comment-separated, OR put new entries between existing ones.

---

## 13. The current staged roadmap

Single chapter ahead: **Stage 5 atmospheric scattering day/night cycle**, based on Maxime Heckel's article ([On Rendering the Sky, Sunsets, and Planets](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/)). The previously-planned Stages 4a (snowfall), 4b (horizon haze), and 4c (fog plates) are SKIPPED — the haze and fog-plate concerns are absorbed into the atmospheric-scattering pipeline (horizon haze emerges naturally from Mie scattering near the sun; fog plates between mountain layers become a separate small additive once Stage 5 is in).

| Stage | What lands | Status |
|---|---|---|
| **1** | Palette discipline + this bible | ✓ Done (v10.21) |
| **2** | Procedural pixel sky | ✓ Done (v10.22-v10.27, perf fix v10.27) |
| **3** | Mountain layer audit + atmospheric perspective | ✓ Done (v10.24-v10.47, polygon refactor) |
| **3.5** | Underground biome wall pattern (Terraria-style) | ✓ Done (v10.28-v10.43; per-frame parallax via clip v10.42-v10.45; reworked to the occlusion model v13.11-v13.12 — see §10) |
| **3.6** | Camera framing depth-aware | ✓ Done (v10.46-v10.47) |
| **5a** | Time-of-day core (`timeT`, sun-elevation derivation, dev HUD readout, cycle length config) | NEXT |
| **5b** | CPU port of Maxime's scattering integral — Rayleigh + Mie + Ozone — evaluated at 5 gradient stops per rebuild. Existing dithered ImageData pipeline preserved; only the 5 stop colours change | The engineering stage |
| **5c** | Sun + moon transit as drawn celestial bodies. Mountain moon-side rim direction tracks actual sun/moon position | |
| **5d** | Star + nebula fade through twilight. Zenith luminance threshold + dithered transition band. No alpha blending | |
| **6a** | Per-biome underground drift particles (dust motes in topsoil, drips in stone, refined embers in magma, sparkles in crystal, ash in mantle) | |
| **6b** | Reactive touches (stars twinkle briefly after explosions, snow kicks up on hard landings, aurora intensifies on big events) | |
| **6c** | Final readability audit (every ore visible against every biome at every time of day; squint test passes everywhere; reserved-colour audit) | |

After every stage the squint test (§3) is the acceptance criterion.

### The Maxime-driven Stage 5 anchor

The full set of constants we're locking in for Stage 5b:

```
RAYLEIGH_SCALE_HEIGHT = 8.0 km
MIE_SCALE_HEIGHT       = 1.2 km
ATMOSPHERE_HEIGHT      = 100 km (Karman line)
VIEW_DISTANCE          = 200 km

PRIMARY_STEPS    = 24    (view-ray samples)
LIGHTMARCH_STEPS = 6     (sun-ray samples per primary sample)

BETA_R              = vec3(0.0058, 0.0135, 0.0331)   // Rayleigh scatter
MIE_BETA_SCATTER    = vec3(0.003)                    // Mie scatter (wavelength-independent)
MIE_BETA_EXT        = (Mie extinction; slightly higher than scatter)
OZONE_BETA_ABS      = vec3(0.00065, 0.00188, 0.00008) // ozone absorption
MIE_G               ≈ 0.76 (Henyey-Greenstein asymmetry)
```

**Phase functions** (verbatim from Maxime):
- Rayleigh: `3 / (16π) · (1 + μ²)`
- Mie (Henyey-Greenstein): `3·(1-g²)·(1+μ²) / (8π·(2+g²)·(1+g²-2gμ)^1.5)`

where `μ = dot(viewDir, sunDir)`.

**Algorithm** (the nested raymarch):
```
for each primary view-ray sample (24 steps):
  h = sample altitude
  accumulate Rayleigh + Mie + Ozone density along view ray
  lightMarch toward sun (6 steps) to get sun-direction optical depth
  tau = BETA_R*(viewOD_R + sunOD_R) + BETA_M_EXT*(viewOD_M + sunOD_M) + BETA_OZONE_ABS*(viewOD_O + sunOD_O)
  transmittance = exp(-tau)
  accumulate scattered light: sumR += dR · transmittance · stepSize  (and sumM, sumO)

scattering = SUN_INTENSITY · (phaseR·BETA_R·sumR + phaseM·BETA_M_SCATTER·sumM + BETA_OZONE_SCATTER·sumO)
horizon = smoothstep(-0.12, 0.05, skyDir.y)
color = mix(SPACE_COLOR, scattering, horizon)
color = ACESFilm(color)   // HDR → LDR tone map
```

### Adaptation for our 2D canvas

- Our sky is horizontally uniform → `skyDir` collapses to just a vertical component. Only 5 evaluations per rebuild (one per gradient stop's vertical position).
- Sun direction = 2D unit vector `(cos(elev), sin(elev))`. `sunY = sin(elev)`.
- Cost per rebuild: 5 stops × 24 × 6 = **720 inner iterations**, ~50 µs on modern CPU.
- Rebuild trigger: `timeT` change resulting in **sun elevation crossing a ~0.5° bucket boundary** (a few rebuilds per second during normal play, fewer during slow time).
- Math runs in linear HDR floats, ACES tone-map → sRGB → quantise to nearest `SKY.*` palette entry, *then* feed into the existing pure-hash dither ImageData pipeline.

### Stage 5b architecture summary

```
timeT (global, advanced each frame by dt / CYCLE_LENGTH_SECONDS)
   ↓
sunElevation = (timeT * 2π) - π/2     [t=0 sunrise, t=0.25 noon, t=0.5 sunset, t=0.75 midnight]
   ↓
elevationBucket = round(sunElevation / 0.5°)
   ↓
[if bucket changed since last rebuild]
   computeStopRGBs(elevationBucket)
   for each of 5 vertical positions:
     run Maxime's nested raymarch in linear HDR
     ACES tone-map
     sRGB → quantise to nearest SKY palette entry
   ↓
rebuild ImageData with the 5 quantised stops + existing pure-hash dither
   ↓
blit to canvas (screen-locked)
```

### Pitfalls from research (review before Stage 5b coding)

1. **Linear vs sRGB.** Do math in linear HDR floats. Convert to sRGB *before* palette quantisation. Otherwise dusk colours go muddy.
2. **`SUN_INTENSITY` is an arbitrary HDR knob**, not a physical unit. Tune last.
3. **Clamp `cosθ` away from zero at the horizon** — optical depth integral blows up otherwise.
4. **Clamp Henyey-Greenstein output to ≥ 0** — high `g` + `μ` near -1 can produce tiny negative values from FP.
5. **Quantise late.** Quantising HDR-to-linear output too early loses the dawn pink band entirely. Dither pass runs on the un-quantised linear output.
6. **Bucket sun elevation aggressively** (~0.5° per bucket). Don't tie rebuild to continuous time or you'll rebuild every frame.
7. **Sprite-halo + Mie-halo double-corona.** If the sun sprite art has its own halo *and* Mie scattering produces a halo, they stack and look fake. Pick one as primary; the other should be subtle/absent.
8. **Mountain rim direction tracks sun in 5c.** Currently locked to upper-right (the moon-side rim assumption). When we make it dynamic, no other code paths should assume the fixed direction.

### Optional Stage 5e (eclipse)

Maxime's article includes a `sunVisibility(point)` function comparing sun-direction to moon-direction with apparent angular radii. Could let the moon eclipse the sun at rare time-of-day values. Tack on later if wanted; doesn't change Stage 5 architecture.

### Stage 5f — exaggerated sunset grade ("Volcanic", LIVE v23.58)

Clear-sky scattering physics caps the palette at blue-orange and ACES desaturates the result, so a *physically honest* sunset reads flat. The brief was "wayyyyy prettier, exaggerated for the vibes, lots of colour" — **not** a lever tweak, a new set of pipeline stages on top of the Maxime base. Four stages stack inside the GL sky shader (`SKY_GL_FS` in `js/sluice/150-render-nightsky.js`), all gated to a tight twilight window so **daytime stays pure blue**:

1. **Ozone absorption** — a mid-atmosphere ozone tent (`ozoneDensity`, peak ~0.33 of the slab) folded into both the light-march optical depth and `viewTransmittance` via `ozoneBetaAbs` (the Chappuis band). Paints the deep-twilight blue/violet the clear-sky model otherwise can't reach.
2. **Multi-scatter glow** — a cheap Hillaire-style isotropic ambient fill added to `scatteredLight` (`uMulti`). Keeps the twilight sky from going black between the lit band and zenith.
3. **Twilight colour-grade** — a 5-stop colour ramp (`uG0..uG4`, sampled along a radial-from-sun / vertical blend `uRadial`) multiplied by a luminance curve (`uGain`/`uFloor`/`uContrast`) of the scattered light, composited over the baseline ACES look. This is where the "lots of colour" comes from.
4. **Saturation-preserving Reinhard** — the graded HDR is tone-mapped with a hue-preserving `x/(1+x)` Reinhard (not ACES, which desaturates) then saturation-lifted (`uSat`), so the colour survives to the screen.

**The twilight gate (why midday stays blue).** `twilight = 1 - smoothstep(0, uTwi, abs(sunElevation))` in **sin-of-elevation** space, then `twilight = pow(twilight, uTwiShape)`. The `uTwiShape` exponent (>1) is load-bearing: it biases the whole grade hard toward the horizon so the blue daytime sky is untouched and only the sunrise/sunset window lights up. `dramaW = clamp(uDrama,0,2) * twilight` is the final blend weight; at noon it's ~0 (pure baseline blue), at the horizon it's full. **Do not widen `uTwi` or drop `uTwiShape` toward 1** without re-checking that midday stays blue — over-affected midday was the explicit thing the owner rejected.

**The locked "Volcanic" palette** (chosen in `sunset-lab.html` over Tropical / Painterly / Cosmic). Stops run sun-side → anti-sun, raw sRGB:

| Stop | Hex | Role |
|---|---|---|
| `uG0` | `#ffd27a` | warm gold (sun core) |
| `uG1` | `#ff7e36` | orange |
| `uG2` | `#e63a1e` | ember red |
| `uG3` | `#8e1e18` | deep maroon |
| `uG4` | `#2a1410` | near-black ash (anti-sun) |

All grade values live in one named block, **`SKY_SUNSET_GRADE`** (top of `150-render-nightsky.js`), uploaded as uniforms each frame: `drama 1.0, sat 1.26, ozone 0.32, multi 0.24, gain 1.8, floor 0.06, contrast 1.02, radial 0.7, twi 0.28, twiShape 2.8`. Tune there; `drama 0` restores the exact pre-grade Maxime look.

**Slow-sunset dwell warp.** Separately, the owner wanted sunrise/sunset to *linger*. `computeSunElevation` (in `js/sluice/020-state.js`) reshapes the sun's arc with `arc - 0.5·A·sin(2·arc)` (`SUN_DWELL = 0.65`): the sun crawls through the horizon crossings (where the grade is strongest) and hurries overhead. The warp is 0 at the crossings, so crossing times and total day length are unchanged, and it's monotonic for A<1. It lives in the single global sun-angle chokepoint, so the sky shader, mountain aerial tint, biome-bg tint, night-gradient, and celestial positions **all slow down together** — the whole scene dwells in twilight, not just the sky colour.

> Scope note: the colour stages (1–4) live only in the **GL sky shader**. The CPU `scat*` fallback path (`scatComputeColor` etc.) routes through `computeSunElevation`, so it inherits the dwell **timing** for free but **not** the colour vividness. If a device falls back to the CPU sky it gets the slow sunset without the volcanic grade. Porting the grade to the CPU stops is a possible fast-follow, not done.

---

## 14. Where to extend the doc

If you add a new background colour, motif, or layer, document it here in §3 / §4 / §10 *before* shipping the code. The doc is the source of truth; code follows the doc.

If you discover a new anti-pattern by hitting it, add it to §12 with the version that exposed it.

This file is long now (~580 lines). When it grows past ~700, split by domain — `BACKGROUND_PALETTE.md` for §3/§4, `BACKGROUND_RENDERING.md` for §6/§10/§11, `BACKGROUND_ROADMAP.md` for §13.

---

## 15. Weather — clouds, precipitation, storms (v24.16; clouds rebuilt as an instanced cumulus field v26.21)

Live above-ground weather, added on owner request ("introduce weather… the clouds have to be gorgeous"). Outside the original §13 roadmap. Code: `js/sluice/155-weather.js`; palette anchors in the `SKY` block (§4); levers in TUNING.md §5.4; dev hotkey **N** force-cycles the mood.

**Mood machine.** One Markov state machine — `clear → fair → cloudy → overcast → precip → storm` — eases continuous targets (coverage, storm-darkening, precip intensity, wind bias) over tens of seconds. Fair/cloudy dominate; storms are reachable but transient. `weatherForce` / the `weather.MOOD` lever / the N key lock a mood for testing.

**Clouds — the centrepiece (v26.21 rebuild).** The deck era (v24.36–v26.20) drew 10 horizontal strips of tiling noise; the owner's verdict was that it "clearly looks like bands." The rebuild scatters INDIVIDUAL cloud sprites instead — the sky has discrete, non-repeating clouds you can point at. Drawn inside `drawNightSkyToScreen`, clipped to the sky, OVER the stars + sun/moon (clouds occlude them) and BEHIND the parallax mountains.
- **The sprite pool.** 3 appearance classes (`CLOUD_CLASSES`: wispy anisotropic cirrus, mid cumulus, big cumulus) × 4 seeded variants = 12 baked sprites, each ONE cloud: a warped-billow field × a cumulus envelope (wavy flat BASE, lumpy domed CROWN with a cauliflower carve that fades out at the base), thresholded to solid cores with soft edges, then the top-light march (exponential self-shadow → bright crowns, shaded underside) + the silver rim, exactly the volume cues the deck bake proved out. Bakes amortise one sprite per frame (whole cast ~13 frames at boot); coverage changes NEVER re-bake — only `softness`/`rimGlow` moves or morphing do. Per-instance flips, scales and alpha jitter keep the 12 sprites from reading as repeats.
- **The lattice (how the sky is populated).** `CLOUD_LANES` is a stack of world-anchored altitude registers (~160 → ~3050 world px above the surface). Each lane is an infinite row of slots (hash lattice, cell width `cellW`): slot k holds a cloud iff `hash(k)` clears the live coverage × lane density, with each cloud's variant, x-jitter, altitude-jitter, scale, flip and fade drawn from more hashes — deterministic, infinite, non-repeating, zero storage, and coverage smoothly fades individual clouds in low-hash-first as weather changes. Heavy skies also fatten every instance slightly (the swell). A separate `CLOUD_HORIZON_LANE` of tiny pale far puffs hugs the ridgeline for the resting view's depth cue and fades out once you are airborne.
- **Fly-through + parallax.** A lane's vertical screen position tracks its world altitude (parallax 1) — climbing slides each lane down past you, so you fly through cumulus at ~500–1500 px, thin cirrus wisps at ~1800–3400, and break out above the weather into clear sky. Sprites have FIXED world size (the deck-era expand/contract bug stays dodged by construction). Horizontal motion is per-lane camera parallax (`hPar`: low lanes scud at ~half camera speed, high lanes barely shift) + accumulated wind drift.
- **The overcast VEIL.** Overcast/storm additionally ease in ONE continuous stratus sheet (cov ≳ 0.7): a soft seamless tile stretched over the whole sky + a top-weighted gradient (denser aloft, lighter at the horizon), NOT a strip stack — so a grey day reads as a grey DOME that swallows the sun, with the cumulus field in front of it. It fades with player altitude (`VEIL_ALT_FADE0/1`), so a high climb comes out on top of the weather.
- **Recolour (unchanged pipeline).** Sprites + veil are recoloured per lighting bucket from the live atmospheric-scatter cache: `colour = lerp(shadow, highlight, baked luminance)`, highlight white → warm gold near the horizon → moon-silver at night, shadow cool grey → dusky violet → deep blue, both pulled toward flat slate by storm darkening. Night/storm anchors: `SKY.cloudSunHi / cloudMoonHi / cloudNightBase / cloudStormHi / cloudStormBase`. Recolours amortise 4 tiles per frame.

**Precipitation.** Screen-space pooled particles, drawn over the world and beneath the HUD, only while the sky is on screen (no rain in a sealed shaft). Rain = wind-skewed streaks (one batched stroke); snow = drifting flakes with lateral wobble. Type comes from `weatherPrecipType()` — **snow** in the current single cold (permafrost) spawn biome; when the horizontal town/biome expansion (`015-regions.js`) feeds worldgen, key it to surface temperature. Colours: `SKY.rainStreak / rainStreakFg / snowFlake`.

**Storms.** Coverage→1, dark clouds, heavy precip, and full-screen lightning (`SKY.lightningFlash`, additive, fast decay, occasional double-strike) that lights the whole scene.

**The one deliberate bible deviation — and why.** Clouds are *smooth-upscaled*, not pure-hash dithered like the §6 sky gradient. The brief was "gorgeous, don't skimp, overdone" — the smooth upscale matches the live GL sky (also upscaled) and is what makes the clouds read as voluminous rather than as the chunky device-pixel noise §6/§12 warns about. The compensating discipline: clouds stay inside the §3 *Sky* value band, well away from the gameplay plane; they fade with altitude; and the single bright value-pop (`cloudSunHi`, the sunlit midday face) is treated like the one allowed snow-cap pop in §3. If a perf/low-detail pass is ever needed, `weatherTune.softness` plus a dither toggle are the levers to add.

**Perf.** The bake is cached + throttled to one layer/frame; `PERF_DISABLE_WEATHER`, the PERF ISO step "no weather" (H in dev), and the `weather.enabled` lever all gate the whole system.

---

## 16. Horizon limb — the sky continues below the ground edge (v24.132)

The ascent-horizon treatment. Code: `js/sluice/158-horizon-atmos.js` (`drawHorizonLimb`), dispatched from `render()` after the fog-of-war overlay, beneath precip + HUD. Levers: TUNING.md §5.5 (the `haze` gm group, `limb.*`).

**The defect it fixes.** The sky pass paints the full canvas, then clips at the surface line. On ascent the line slides down the screen and the visible sky grows — at dusk that means the brightest graded sunset band ends up hard-cut against the unlit terrain cross-section. The owner's complaint (2026-06-10): "when you fly up it shows this sharp horizon that kinda kills the immersiveness."

**Why not fog.** The first attempt (v24.45, `drawHorizonHaze`) washed the whole visible ground in one flat veil colour, keyed to altitude. Owner-vetoed in v24.53 — fogging the near-field play plane "read as strange on every ascent." The veil is parked in 158, not deleted. Do not re-enable it as the fix for the horizon edge; the limb below is the fix.

**The architecture.** The GL sky raymarch (`renderSkyGL`, 150) already computes the rows BELOW its in-shader horizon every frame: view rays there strike the planet and return the true "distant land seen through maximum air" colours — the bright Mie band hugging the limb, darkening with depression angle, with the Volcanic sunset grade, sun-azimuth glow and anti-twilight baked in. The clip used to discard all of it. `drawHorizonLimb` recomposites that discarded slice over the ground: alpha 1.0 exactly at the surface line (the same texture continuing — the seam is invisible by construction), fading to 0 over a band whose height grows from zero as the player climbs (zoom-independent screen-fraction lean, like the parked veil). The land edge dissolves into the planet's lit atmospheric limb: a setting sun melts into it, a low moon's corona silvers it, night blacks it out on its own — no per-time-of-day branches.

**Rules (load-bearing):**
- **Alpha at the surface line is ALWAYS 1.0 while active.** The ascent ease-in comes from the band HEIGHT growing, never from thinning the line alpha — a thinned line re-exposes the hard edge as a ghost seam at (1 − alpha).
- **Resting framing draws nothing.** The surface view stays pristine (the v24.53 lesson). `limb.startPad` guards it.
- **No new colours.** The limb is the sky's own output recomposited — §4 reserved colours untouched. Do not tint it.
- **Smooth, not dithered — by the §15 precedent.** The limb is a slice of the smooth-upscaled GL sky; dithering it would seam against the sky it must continue.
- **It rides the sky pass.** `PERF_DISABLE_NIGHTSKY` (perf-iso H) silences both together; the CPU 5-stop gradient is the automatic fallback source when GL is unavailable.

**The SECOND line — the shader razor, fixed in the geometry (v24.138).** Dissolving the terrain edge exposed a second hard line one layer deeper: the GL raymarch originally modelled a FLAT ground plane (`rayEnd = observerAltitude / -rayDir.y`), so a ray's lit path collapsed within a few pixels of the 0°-elevation row — a razor at a FIXED screen height (`yFrac = (1 + tan(pitch)/tan(fovY/2))/2` ≈ 0.65), hidden by the sky clip at rest and revealed on every climb (the owner's original complaint was THIS line). The fix is in the shader: the PRIMARY ray is bent over a spherical planet (`planetRadius = 6371`, units ≈ km, matching the in-file JS reference `scatComputeColor` which always used `scatRaySphere`). Rays just below 0° now clear the limb smoothly and ground chords grow gradually, so the blaze rolls off over several degrees — and because it happens inside the sky render, clouds and mountains draw over it correctly by construction. `lightMarch` + `sunlightVisibility` deliberately stay flat-slab: they carry the dialled twilight behaviour, and only the primary geometry made the razor. (A v24.136 screen-space "razor skirt" band-aided this for a few hours; it composited AFTER the world and smeared over the world-anchored cloud decks — owner-rejected, removed same day. Do not reintroduce a post-world smear for sky-internal edges; fix them in the shader.)

**Harness.** Boot levers `?tod=` (clock + `SUN.paused`, 020) and `?alt=` (spawn altitude, 040) exist for headless screenshot runs: `sluice.html?nosave=1&tod=0.755&alt=1200` reproduces the sunset-ascent money shot deterministically.
