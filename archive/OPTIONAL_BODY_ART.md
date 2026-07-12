# OPTIONAL_BODY_ART.md — Art Bible (refined flat-vector)

The canonical **art** spec for *The Optional Body* figure and for a **site-wide flat-vector illustration language**. This supersedes the "friendly flat-vector" placeholder note in [`OPTIONAL_BODY_STYLE.md`](OPTIONAL_BODY_STYLE.md) §2 — that shipped art is a deliberate placeholder; this doc is the world-class target.

**Aesthetic:** refined modern flat-vector, **Kurzgesagt-grade** — clean geometric shapes, a disciplined limited palette, *hue-shifted* gradients for volume, a soft colored glow so subjects read as self-luminous on the site's dark forest-green. "Simple, but beautiful": beauty comes from cohesion, light, and finish — not detail.

**Medium:** hand-authored inline **SVG** (vector — each part must stay individually addressable for the removal mechanic). No raster, no build step.

**Workflow reality:** authored **blind** (the owner does visual review). So construction is parametric/grid-based, every asset is reviewed via the harness (§9), and we **perfect one golden asset before scaling**.

---

## 1. The seven non-negotiable laws

These are the highest-leverage rules from the research. Break them and it looks amateur.

1. **Hue-shifted 2-stop gradient on every shape** (the single biggest pro lever). Never shade with black→white. Each shape gets a 2–3 stop gradient: the **light stop** shifts hue toward warm/yellow, **+value, −saturation**; the **shadow stop** shifts toward cool/blue-magenta, **−value, +saturation**. Keep the hue travel ≤ ~40°.
2. **One light direction, locked: top-left (~10–11 o'clock).** Every gradient's light end and every highlight points the same way, on all assets, forever.
3. **Glow on dark.** Every shape is *lighter and more saturated than the `#303931` ground*, with a soft colored outer glow + a brighter rim on the lit edge. Nothing's darkest value may approach the background value.
4. **Value is structure; pass the grayscale gate.** Desaturate every asset (the harness has a toggle) — it must stay legible and high-contrast in grayscale. Too many mid-tones = flat and dull. This is a hard sign-off gate.
5. **Palette restraint.** 3–4 base hues; expand by varying value/saturation, *not* by adding hues. Saturation band ~45–80% (never neon, never gray).
6. **One edge style, never mixed.** This system is **fill-based, no outlines**, separated from the ground by glow + rim-light. Where a stroke is unavoidable (organ-on-organ), use a *darker shade of the fill*, never black, with `vector-effect: non-scaling-stroke`. Never mix stroked and unstroked organs.
7. **Detail budget, held across the whole set.** Max **2 internal feature shapes + 1 highlight** per organ. Same corner-radius family (interior shapes ≈ 0.6× the exterior radius). Reduce each organ to its iconic silhouette first; detail is garnish.

---

## 2. Palette (all hexes tuned to glow on `#303931`)

**Ground:** `#303931` (site `--bg`). Everything out-values and out-saturates it.

**Figure "stage" body** — the protagonist that diminishes. Warm parchment, clearly visible but quieter than the organs so they pop (it must still read on its own once organs are ghosted):
- body light `#cdbfa3` → shadow `#8f8468`; rim-light `#efe7d6`.

**Per-organ gradient stops** (light → shadow; anatomically recognizable *and* glowing). Starting values — tune at golden-asset review:

| Organ | `--hi` (light) | `--lo` (shadow) | Reads as |
|---|---|---|---|
| Heart | `#ff7a6e` | `#b83a46` | crimson |
| Lungs | `#f0a39a` | `#c25f6b` | rosy pink |
| Liver | `#c0795a` | `#7e4231` | mahogany |
| Gallbladder | `#bcc46a` | `#76863a` | olive (bile) |
| Stomach | `#f0b070` | `#c07a3e` | salmon-tan |
| Spleen | `#b06a8f` | `#6e3c5a` | purple-maroon |
| Kidneys | `#d08a5b` | `#8a4a35` | red-brown |
| Brain | `#f2b0c4` | `#c25e90` | pinkish-grey |
| Thyroid | `#d56a78` | `#9a3f50` | red-maroon |
| Colon / intestine | `#e0a98c` | `#b06a4c` | pinkish-tan |
| Appendix | `#e0a98c` | `#b06a4c` | (matches colon) |
| Bladder | `#ecd58a` | `#c0a850` | pale yellow |
| Uterus | `#e090a4` | `#b05a72` | pink-mauve |
| Eyes | `#f5f1ea` + iris `#6b4a2b` | — | white + iris |

**Shared accents (sparingly, across the whole set):**
- Rim / inner-glow light: `#ffe9c7` at 35–60% on the lit edge.
- Outer glow: a blurred copy in the organ's `--hi` hue, 25–40% opacity.
- Cool unifier (vessels, shadow accents that tie warm organs together): teal `#5fb0c9`.
- Vessels convention if drawn: artery `#c0392b`, vein `#3b5ba5`.

**Value gate numbers:** lightest highlight ≈ 92% L; darkest shadow ≥ 30% L (always lighter than ground ≈ 22% L) → guarantees glow.

---

## 3. The shared SVG system (author once, reuse everywhere)

Define lighting/glow/grain **once** in `<defs>`; vary per organ only via CSS custom properties. This is what makes 18 organs feel like one hand.

**Resolution caveat (load-bearing — this bit a v1 draft):** SVG gradient `<stop>`s resolve `var()` in **their own `<defs>` scope**, *not* on the element that references the gradient via `fill="url(#…)"`. So you **cannot** share one gradient and recolor it per organ with a custom property on the organ `<g>`. Two consequences:
- **Gradients: one per organ, hardcoded stops** (geometry copy-shared). Cheap and reliable.
- **Glow: per organ via CSS `drop-shadow(var(--hi))`** — CSS `filter` *does* resolve `var()` on the element it's applied to, so the halo can vary by organ from a `--hi` on the `<g>`.

```svg
<defs>
  <!-- ONE gradient PER organ; same geometry (light focal top-left), own stops. -->
  <radialGradient id="g-heart" cx="0.5" cy="0.5" r="0.66" fx="0.34" fy="0.32">
    <stop offset="0%" stop-color="#ff7a6e"/><stop offset="100%" stop-color="#b83a46"/>
  </radialGradient>
  <radialGradient id="g-kidney" cx="0.5" cy="0.5" r="0.66" fx="0.34" fy="0.32">
    <stop offset="0%" stop-color="#d08a5b"/><stop offset="100%" stop-color="#8a4a35"/>
  </radialGradient>
  <!-- …one per organ. Sheet/tube organs use a linearGradient x1.15 y1.05 → x.85 y.95 … -->
</defs>

<!-- Each organ = one addressable group. Gradient is per-organ; glow rides --hi. -->
<g class="organ" data-organ="heart" style="--hi:#ff7a6e;">
  <path d="…heart…" fill="url(#g-heart)"/>
  <ellipse class="spec" cx="…" cy="…"/>   <!-- 1 small white specular highlight -->
</g>
```
```css
.organ { filter: drop-shadow(0 0 5px var(--hi)) drop-shadow(0 0 12px var(--hi)); }
```

- **Grain (one layer, never per-organ — turbulence is the costliest primitive):** a single fixed full-illustration overlay, `mix-blend-mode: overlay; pointer-events:none;`, ~4% white speckle:
  ```svg
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0"/></filter>
  ```
- **Pairs (kidneys, lungs, eyes):** author once, instance with `<use href="#kidney" transform="scale(-1,1) translate(...)"/>` so the pair shares lighting and the file stays small.
- **Reuse `glow`'s `flood-color: var(--hi)`** so each organ's glow is its own hue automatically.

---

## 4. Figure proportion canon (front view, blind-author grid)

Normalize total height **H = 1.0**, origin = top of head, Y down. **8-head heroic canon.**

| Landmark | Y (×H) | | Widths (×H) | Male | Female |
|---|---|---|---|---|---|
| Top of head | 0.000 | | Head width | 0.083 | 0.080 |
| Chin | 0.125 | | Shoulder | 0.250 | 0.190 |
| Shoulder line | 0.205 | | Waist | 0.150 | 0.145 |
| Nipple line | 0.250 | | Hip | 0.190 | 0.205 |
| Navel | 0.375 | | Neck | 0.045 | 0.040 |
| Crotch (exact mid) | 0.500 | | | | |
| Knee | 0.750 | | **Limb (×H)** | | |
| Ankle | 0.940 | | Upper arm | 0.185 | |
| Sole | 1.000 | | Forearm | 0.145 | |
| Elbow Y ≈ navel | 0.375 | | Hand | 0.110 | |
| Wrist Y | 0.470 | | Thigh | 0.250 | |
| | | | Lower leg | 0.190 | |

---

## 5. Organ placement map (VIEWER frame — already mirrored from anatomy)

Torso box: top `Ty=0.205H` (shoulders), bottom `By=0.50H` (crotch). `u` = horizontal (0 = viewer-left edge, 0.5 = spine, 1.0 = viewer-right edge); `v` = 0 (shoulders) → 1 (crotch). Size = fraction of torso width W.

| Organ | u | v | size (×W) | silhouette + side note |
|---|---|---|---|---|
| Brain | 0.50 | (in head) | 0.85 of cranium | rounded mushroom-dome, gyri ripples, cerebellum bulge low-back |
| Thyroid | 0.50 | −0.05 | 0.18×0.10 | **butterfly/bowtie**, wings up-out, midline neck |
| Heart | 0.56 | 0.20 | 0.22×0.26 | **blunt cone, apex down → viewer-RIGHT**, vessel stubs off top (NOT a valentine heart) |
| Lung (viewer-L) | 0.30 | 0.18 | 0.26×0.42 | half-leaf/mitten, **3 lobes, larger**, hilum notch medial |
| Lung (viewer-R) | 0.70 | 0.20 | 0.23×0.42 | **2 lobes + cardiac notch**, smaller |
| Liver | 0.36 | 0.40 | 0.40×0.24 | **big right-triangle wedge, viewer-LEFT**, crosses midline (largest viscus) |
| Gallbladder | 0.42 | 0.47 | 0.06×0.10 | pear/teardrop under liver edge |
| Stomach | 0.62 | 0.42 | 0.26×0.22 | **J / boxing-glove, viewer-RIGHT** |
| Spleen | 0.78 | 0.40 | 0.12×0.14 | coffee-bean, **viewer-RIGHT**, behind stomach |
| Kidney (viewer-L) | 0.34 | 0.52 | 0.11×0.18 | bean 1.6:1, **sits lower**, hilum notch **medial (inward)** |
| Kidney (viewer-R) | 0.66 | 0.49 | 0.11×0.18 | bean, slightly higher |
| Colon | 0.50 | 0.55 | 0.62×0.40 | **inverted-U frame**: up viewer-L, across, down viewer-R; haustra scallops |
| Appendix | 0.30 | 0.70 | 0.04×0.08 | worm tail, **viewer-LEFT-low** |
| Uterus | 0.50 | 0.85 | 0.12×0.14 | inverted pear/lightbulb, horn stubs |
| Bladder | 0.50 | 0.92 | 0.14×0.12 | rounded triangle, lowest organ |
| Eyes | 0.40 & 0.60 | (head) | 0.10 each | almond, iris ⅓ width |

**Amateur-error checklist (avoid all):** heart on wrong side or valentine-shaped; liver small/centered (it's big + viewer-LEFT); spleen mis-sided (viewer-RIGHT); symmetric lungs (they differ: 3 vs 2 lobes); level kidneys (viewer-L lower); kidney hilum facing outward (faces inward); centered balloon stomach (it's a viewer-RIGHT J); appendix on wrong side (viewer-LEFT-low); organs drawn too far forward (kidneys/spleen are deep/posterior); gallbladder floating free (hugs liver underside); wrong relative sizes (**liver > each lung > stomach > spleen ≈ heart ≈ each kidney > gallbladder > appendix**); bladder/uterus too high (they sit low, v≈0.85–0.92).

---

## 6. States: removed / focus / the diminishing arc

- **Removed = hollow ghost, NOT raw opacity** (opacity alone goes muddy on green). Drop the gradient fill, keep a faint stroke:
  ```css
  .organ { transition: opacity .5s, fill-opacity .5s, stroke-opacity .5s, filter .5s; }
  .organ.is-removed path { fill-opacity: 0; stroke: var(--lo); stroke-opacity: .35; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .organ.is-removed { filter: none; }   /* glow goes out when the part is gone */
  ```
  Optional richer dematerialize: animate `stroke-dasharray`/`dashoffset` so the outline "draws away."
- **Focus** (active station's part): raise its glow + a brighter rim; everything else stays quiet (contrast = focal point).
- **Diminishing arc:** by the deep tiers the figure is a husk of ghost-outlines + the stage body; it should still read as a figure, then dissolve at the finale.

---

## 7. Performance (filters are the cost; treat as scarce)

- **Clamp every filter region** (`x/y/width/height` on `<filter>`), only as big as the glow needs (~160%). Never unbounded.
- **One baked grain layer**, never per-organ. If it janks on scroll, rasterize it once to a PNG `dataURL` and use as `background-image`.
- **`content-visibility: auto` + `contain-intrinsic-size`** per scroll station (already in the piece).
- **`will-change: opacity, filter`** only while a part animates (add on interaction, remove on `transitionend`). Never permanent on 18 elements.
- Animate only `opacity`/`transform`; never `stdDeviation`/`baseFrequency` per frame.
- Use **live** glow for the 1–2 parts the reader is interacting with; **baked/static** glow for resting parts.

---

## 8. Site-wide rollout (sequenced; see audit)

The figure is the flagship. Then, reusing one drawing recipe (one weight, one fill, the palette above), in impact-for-effort order:

1. **Favicon + share image** — the site has *none*; biggest perception gain per minute. A flat-vector mark in parchment-on-green (monogram or emblem) → `.svg` + `.png`, add `<link rel="icon">` / `apple-touch-icon` / `og:image` to every page head. **Do first.**
2. **Extract the art tokens** (`--paper #d9cdb2`, `--ink`, weight, accent swatches) into shared site variables so every future drawing is consistent by default.
3. **Replace the literal `•••` divider** with a small drawn ornament (printer's flower).
4. **Per-post spot illustrations** (the marquee upgrade) — one flat-vector emblem per post, reused as a ~64–80px homepage thumbnail *and* in the already-built-but-unused `.post-hero` slot. Seven emblems (galaxy/dice, the body figure, globe, particle cluster, a site-style drill/ore, etc.).
5. **A small icon set** (footer / back-link / external-link) in the same weight, replacing bare text glyphs.
6. **`og:image` per post** (reuse each hero emblem).

**Exclusions:** do not touch the game's Frontier-Soviet art or the Old Masters gallery images.

---

## 9. Blind-authoring workflow

- **Review harness** (`art-lab.html`): every asset laid out large on the green, with a **grayscale-test toggle** (law #4) and a **ghost-state toggle**. The owner screenshots it; I iterate. Not linked from the site; remove before final ship.
- **Golden asset first:** perfect ONE asset (the heart) end-to-end, lock the gradient/glow/grain/edge system against it, get owner sign-off, *then* scale to the other 17.
- **Parametric construction:** build on the §4/§5 grid with documented coordinates so proportions are reasoned, not eyeballed.
- **Small, described iterations:** each round, state exactly what changed so the owner's screenshot review is targeted.

---

## Sources
- Kurzgesagt style breakdowns (color/contrast, shading/tinting) — YouTube "How to Kurzgesagt?" 2/3 & 3/3; Midlibrary style profile.
- DesignSystems.com iconography guide; DKNG "Illustrating an Icon Set"; Tubik flat-illustration guide; Alvalyn value-contrast.
- MDN: SVG gradients, `<radialGradient>`, filter effects (`feGaussianBlur`/`feFlood`/`feMerge`), `feTurbulence`, `<filter>` regions, `vector-effect`, `content-visibility`. Codrops feTurbulence texture guide. CSS-Tricks SVG shadows.
- Anatomy: Wikipedia body proportions; The Drawing Source / Life Drawing Academy proportions; SimpleNursing & Kenhub abdominal regions; Healthline organ sides; TeachMeAnatomy thyroid.
- Site systems: Stripe, GitLab Pajamas, IBM Design Language, Mailchimp×COLLINS, The Pudding, Maggie Appleton.

## Session log
- **2026-05-22 — Art bible v1.** Synthesized from 4 research tracks (flat-vector craft, SVG technique, blind-author anatomy card, site audit). Direction: refined flat-vector, Kurzgesagt-grade, on the constant forest-green; authored blind with owner review. Next: build `art-lab.html` harness + the **heart golden asset**, ship for the owner's first screenshot review, lock the system, then scale to all organs + figure.
