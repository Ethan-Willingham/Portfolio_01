# OPTIONAL_BODY_POLISH.md: World-class UI principles for the Recovered Atlas

A study of what genuinely world-class UI does, distilled into rules for this piece (the art-forward "Recovered Atlas" descent). Researched 2026-05-22 across four tracks: UI craft and detail, typography and editorial, motion and micro-interaction, and the immersive scrollytelling canon. The guiding line, from the scrollytelling track: at this level, **elevation is subtraction and timing, not addition.** No em dashes in this doc (house rule).

Site context this is tuned to: dark forest-green `#303931`, parchment accent `#D4C4A0`, Century Supra serif, 780px column.

---

## 1. Depth from light, not weight

- Raise elements by **lightening the surface** plus a **1px top highlight**, not by stacking black shadow. Build a surface ramp off the green: base `#303931`, raised `~#283129`, overlay lighter.
- **Layered, hue-matched shadows.** Never one shadow, never pure black. Stack 3 to 5 with doubling blur and offset, tinted toward the background hue, for example `hsl(150 32% 4% / a)`. As elevation rises, increase offset and blur, decrease opacity. One light source page-wide.
- **Hairlines, not borders.** On dark, use a translucent light line, for example `rgba(232,226,214,0.11)`, plus an inset top highlight to fake a bevel. Render at 1 device pixel, never pure `#000` or `#fff`.

## 2. Type is the lever

- **One modular scale** (1.25 major third), 19px base, defined as tokens. Derive sizes by ratio, then trust the eye and nudge (Rendle: a scale is a starting point, not scripture).
- **Measure** 60 to 75 characters for body, shorter (45 to 55) for captions. **Leading** about 1.55 for body, tighter as size grows.
- **Display tracking** negative on large serif headings (-0.015em to -0.02em, never past -0.03em), zero on body, never tighten small text. Use `font-optical-sizing: auto` if the face has an optical axis.
- **Figures:** old-style figures in running prose (`font-variant-numeric: oldstyle-nums`), tabular lining figures in data and the meter (`tabular-nums`) so counts do not jitter.
- **`text-wrap: balance`** on headings and captions, **`text-wrap: pretty`** on body. Bind stubborn widows with a non-breaking space.
- **Dark-mode type:** never pure white (parchment is correct). Dim the body a touch and reserve full parchment for headings, so hierarchy comes partly from luminance. Go one weight lighter on dark than you would on white. Body contrast lands comfortably high (parchment on the green is roughly 7:1).

## 3. Motion is short, eased-out, and physical

- **Transform and opacity only** (compositor). Never animate width, height, top, or margin per frame. `will-change` only while animating, then remove.
- **Default to ease-out.** Stronger than the CSS built-ins: `cubic-bezier(0.23, 1, 0.32, 1)` for entrances, reveals, and the meter. Reserve ease-in for exits, ease-in-out for on-screen movement.
- **Durations:** micro 100 to 160ms, small 125 to 200ms, medium 200 to 350ms, large 350 to 600ms. For a contemplative piece, sit at the slow end, but never use a sluggish curve.
- **Cross-fade** whole images by overlapping the fades so density stays constant, with a subtle settling scale (1 to 3%) on the incoming plate. For a true premium feel, map the fade to scroll position so scrubbing reverses cleanly.
- **The meter:** animate the bar with `transform: scaleX()` (origin at the depleting edge), synced to the same duration and curve as the counting number, with tabular figures so digits do not shift. Count via requestAnimationFrame, not a CSS property.
- **Caption swap:** old line out and up (ease-in, ~150ms), new line in from below (ease-out, ~220ms), overlapping. Only the contents move, the panel stays fixed.
- **Reduced motion:** keep opacity fades, remove transform-based motion and parallax, snap the count to its value. Treat motion as enhancement, never load-bearing.

## 4. Immersive scrollytelling

- **One image, one beat, one idea.** Each scroll step does exactly one thing. Borrowed from NYT Close Read, the closest exemplar (image-led, not chart-led).
- **Never jack the scroll.** Map motion to native scroll position so fast and slow readers both feel right. This is the single biggest premium-versus-amateur tell, and it protects accessibility.
- **Earn the first scroll with stillness.** Open on one quiet treated plate, a small parchment title, and negative space. No autoplay, no instruction. The image and the silence are the invitation (Wellcome, NLM Dream Anatomy).
- **Captions are labels, not paragraphs.** Aim near a 280 character ceiling (Google Arts and Culture), McCandless's "as little text as possible." The plate is the protagonist, the words are the wall label.
- **Motion only where it deepens.** Make the cross-fade itself the craft (a plate dissolving into the next like a memory). Reserve larger motion for one or two narrative peaks (Active Theory: the web does not need more noise, it needs intention).
- **Atmosphere through consistency.** One green, one parchment, one accent. Treat every plate identically (same duotone, grain, vignette) so they read as one recovered atlas. Let large fields of dark green do nothing, that emptiness is the luxury.
- **Land the ending.** Pull back from the last detail to a final held image and a closing line in parchment, then quiet. The descent should arrive somewhere, not run out of scroll.

---

## Applied to the prototype (v4 status)

- [x] Stronger ease-out curve across motion; refined dissolve (recede with a slight scale, light blur).
- [x] Cross-fade with a settling scale on the incoming plate (quick version; full scroll-linked scrub still pending).
- [x] Meter bar via `transform: scaleX()` synced to the 720ms counting number; tabular figures.
- [x] Depth via layered green-tinted shadows and a light top edge on the ledger and frame; translucent hairline border.
- [x] 1.25 type scale tokens; `text-wrap: balance`/`pretty`; negative tracking on the big meter number; old-style figures in the credits, tabular in the meter.
- [x] Caption swap with the small asymmetric lift.
- [x] Opening hero plate plus title and silence; gentle on-load rise.
- [x] `:focus-visible` ring in parchment; in-brand `::selection`.
- [x] Refined reduced-motion (keep fades, kill movement, snap the count).
- [ ] Full scroll-linked cross-fade scrub (decide after feeling the quick version).
- [ ] Final-build: pull back to a held closing plate before the closing line.

## Key sources

- Rauno Freiberg, craft and depth: https://rauno.me/craft/depth
- Emil Kowalski, great animations: https://emilkowal.ski/ui/great-animations
- Josh W. Comeau, shadows and transitions: https://www.joshwcomeau.com/css/designing-shadows/
- Butterick, Practical Typography: https://practicaltypography.com/typography-in-ten-minutes.html
- Material 3 motion tokens: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- NYT Close Read (Bruegel): https://www.nytimes.com/interactive/2020/12/16/arts/design/bruegel-tower-of-babel.html
- NN/g, Scrolljacking 101: https://www.nngroup.com/articles/scrolljacking-101/
- NLM Dream Anatomy: https://www.nlm.nih.gov/exhibition/dream-anatomy/index.html

## Session log

- **2026-05-22, Polish study + v4 pass.** Four-track world-class UI study completed and distilled here. Applied Tier A and B (and most of C) to atlas-descent.html v4. Pending: full scroll-linked cross-fade, and the held closing plate in the real build.
