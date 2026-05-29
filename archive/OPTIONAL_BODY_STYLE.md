# OPTIONAL_BODY_STYLE.md — Craft Bible

The canonical **how-it-looks-and-feels** reference for **"How Much of You Do You Need?"** (codename **Optional Body**). Content, facts, arc, and tone live in [`OPTIONAL_BODY_BIBLE.md`](OPTIONAL_BODY_BIBLE.md). Read that first; this doc owns **art direction, narrative pacing, layout, interaction patterns, and the technical architecture.**

Hard constraint from the owner: **mobile-first, and flawless on both phone and desktop.** Every rule below is written with phone-first in mind.

---

## 1. Where it lives (site conventions — match them)

This is a vanilla static site. Match the sibling pieces (`particles.html`, `particle-life.html`, `daylight-globe.html`) exactly:

- **One HTML shell + one JS file.** `optional-body.html` + `js/optional-body.js`. No framework, no bundler, no build step.
- **Page-specific CSS in a `<style>` block in the page `<head>`** (like `sluice.html`), reusing the shared `style.css` for chrome (header, `.post-back` Home link, footer, `.reading-progress`, fonts).
- **`var` + single IIFE** in the JS (`(function(){ 'use strict'; … })();`), to match house style. No ES modules, no TS, no JSX.
- **Add the standard page head:** the gtag + Microsoft Clarity snippets, `<meta name="viewport">`, the Century Supra font preload, `<link rel="stylesheet" href="style.css">`.
- **Add an entry to `index.html`'s `.article-list`** when it ships (newest first), matching the existing `<li class="article-list-item fade-in">` pattern.
- **No screenshot PNGs committed to the repo** (per AGENTS.md). Use preview tools in-session only.

---

## 2. Art direction — friendly flat-vector

The owner picked **friendly flat-vector**: clean, simple, approachable anatomy — not gore, not clip-art, not clinical realism. Consistency is what will make it feel "smooth and well thought out." Lock this before scaling scenes.

### 2.1 Palette (tie into the site, don't fight it)

Base it on the site's existing CSS variables so the piece feels native:

- **Page background:** `--bg: #303931` (forest green) at the top, **darkening down the descent** toward near-black/void at the consciousness tiers (Deep-Sea-style mood gradient).
- **Body/figure base ("flesh-neutral," NOT literal skin):** warm parchment from the site accent family — `--text: #E8E2D6` / `--accent: #D4C4A0`. The figure reads as a warm paper cutout, not a medical cadaver.
- **Line/outline:** a single consistent dark stroke, e.g. `--rule: #4A544B` deepened, used on every silhouette (echoes the game's "every silhouette gets an outline" discipline — it unifies the look).
- **Organ accent fills:** a small, **locked** flat palette — muted, desaturated, friendly. Suggested starting set (tune in the vertical slice): warm red `#C96A5E` (heart/muscle), clay `#B5705A` (liver), dusty rose `#D8978B` (lungs), ochre `#C7A24C` (bone/teeth), sage `#7E9A7A` (kidney/spleen), bile-green only where literal. **No pure saturated primaries; no glossy gradients.** Flat fills + one stroke weight.
- **"Removed" state:** desaturated + dropped opacity (e.g. 25%) or a dashed ghost outline — the part is gone but its *absence* is legible.
- **The counter / UI chrome:** site accent `#D4C4A0` on the dark bg; `Still alive ✓` in a calm green, flipping to an uncertain tint at the turn.
- **Reserved:** save **pure white** and any glow for the consciousness tier (the one thing we can't locate gets the one color we never used).

### 2.2 The figure

- **A single, simple, front-facing human** — clean shapes, rounded, gender-neutral, friendly proportions (not anatomically heroic, not a medical plate). Think "elegant paper doll," not "Gray's Anatomy."
- **Built as SVG**, every removable part its own addressable element: `<g id="appendix">`, `<path id="spleen">`, etc. This lets us fade/translate/ghost each part independently with CSS `transform`/`opacity` (compositor-cheap) and keeps everything crisp at any DPR.
- **The figure is pinned and persistent** (see §4) and **visibly diminishes** as you descend: full body (Tier 1) → torso+head (Tier 3) → head + machines (Tier 4) → head/brain (Tier 5) → a point of light (Tier 6). The shrinking figure is the emotional engine.
- **Layering:** organs in an inner group revealed when the descent goes "inside"; skin/outline as an outer group. A simple front view is enough — avoid the cost/complexity of true 3D.
- **Effects layer (canvas, optional):** use a small `<canvas>` only for things SVG does poorly — a part "dissolving" into particles, the cosmic consciousness field at the end. Lazy-init it, like the game's smoke/jello systems.

### 2.3 The discard tray ("the pile of you")

- Every removed part slides into a **tray/jar at the edge** that fills up as you descend. By the end it's a heap of "you" beside a tiny remaining core — the visual punchline of the subtraction game.
- On mobile, the tray is a compact strip (top or bottom) or a tap-to-expand drawer — never crowding the figure. On desktop it can sit beside the figure.

### 2.4 Mood / atmosphere per tier

Warm and light at the top → cooler and more clinical through the organ/machine tiers → cosmic void at the consciousness end. Background color, ambient motion, and contrast all track the descent. (Same instinct as the game's altitude→space sky biome blend and Deep Sea's darkening water.)

---

## 3. Narrative & pacing rules (the neal.fun DNA)

From the format teardown — these are non-negotiable craft rules:

1. **One core interaction, repeated: SCROLL.** Pick the single verb and never add a second engine. Scroll *down* = descend = subtract. Secondary spice (a "Remove" tap, a DIY body-check) rides on top but never replaces scroll.
2. **One persistent running number is the spine.** The `Still alive ✓` / `Removed: N` / cost HUD (BIBLE §4). Always visible; it carries continuity and *is* the payoff.
3. **One idea per screen.** A label + one sentence. If a beat needs a paragraph, it's two beats. Huge type, generous whitespace.
4. **Earn payoffs with dead air.** Deep Sea's empty water is the model — low-information stretches make the rare reveal land. Don't fill every screen. The liver "it grows back," the no-pulse flatline, and the PVS turn are *payoffs* — give them silence before and after.
5. **End on the turn.** It's planned first (BIBLE §2). Everything paces toward it.
6. **Augment scroll — never hijack it.** No scroll-jacking (see §6 anti-patterns). The reader's scrollbar is sacred.

---

## 4. Layout — mobile-first hybrid

The owner's call: hybrid (prose in a readable column; big interactive scenes break full-bleed). Built phone-first.

- **Prose/steps** live in the site's reading column (`--content-width: 780px`) so it reads like an article and degrades to a legible page with JS off.
- **Scenes break full-bleed** (full viewport width) for the visual moments — the pinned figure, the machine wall, the void.
- **The pinned figure uses `position: sticky`** inside a tall scene container; the short text "steps" scroll past and *mutate the pinned figure* (the canonical Pudding sticky-graphic + scrolling-text pattern). All pinning is CSS — no JS scroll math.
- **Use `100dvh`, never `100vh`** for full-screen beats (mobile address bar swallows `vh`).
- **Mobile composition:** text *overlays* or *stacks under* the sticky figure — never a desktop-style side-by-side that collapses. Figure sticky on top, step text below/over it.
- **Touch targets ≥ 44×44px**, kept out of the bottom-edge browser-gesture zone.
- **Full-bleed = "feel this"; column = "understand this."** Alternate deliberately: drop to full-bleed for scale/emotion, return to the column to explain the fact + cite the source.

---

## 5. Signature interaction patterns

These are the beats that make it sing (content in BIBLE §5):

- **DIY body-checks (Tier 1).** The reader acts on their *own* body: the **palmaris longus** tendon test (thumb-to-pinky, flex wrist), ear-wiggle, find-your-Darwin's-tubercle. A tiny prompt + an SVG demonstrating the move. Highest-engagement interaction in the light tier — lean on it.
- **The "Remove" affordance.** Each station can offer an optional tap to subtract the part (agency), but **scrolling past also subtracts it** so the piece never stalls behind a click. Removal animation: part desaturates, lifts, slides to the discard tray, counter ticks.
- **The no-pulse beat (Tier 4).** "Feel for a pulse" — a dot pulses (optionally a soft heartbeat sound), then the rotor spins up and it goes **flat** — but `Still alive ✓` holds. The single most chilling true beat; stage it with dead air.
- **The reversal (Tier 5→6).** Mechanically identical "removal" as everywhere else, but this time the counter's `Still alive ✓` hesitates / the screen behavior changes — the same gesture that kept you alive now erases *you*.
- **The mirror ending (Tier 6).** The figure dissolves into the reader — the cursor, the screen, a prompt. `Still you?` with no checkmark. One final line, then silence.
- **Optional "I'd stop here."** Let readers mark how far down they'd actually go — shareable. Scope permitting; decide in the vertical slice.

---

## 6. Technical architecture (vanilla, no framework)

Distilled from the format teardown into implementable rules.

### 6.1 The scroll engine — ONE IntersectionObserver

Don't use scroll-event listeners (jank). Use a single `IntersectionObserver` that fires each step at the **viewport middle** by collapsing the root to a center line:

```js
// step becomes "active" when it crosses the vertical middle of the screen
var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (e.isIntersecting) activateStep(e.target.dataset.step);
  });
}, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
document.querySelectorAll('.step').forEach(function (s) { io.observe(s); });
```

- `rootMargin: '-50% 0px -50% 0px'` → exactly one step active at a time (the one at screen-center).
- Make **step state idempotent** — re-entering on scroll-up must reverse cleanly (removed parts come *back* if you scroll up; the counter decrements).
- For continuous effects (a part dissolving as you scroll *through* a beat), add a second observer with many thresholds (`threshold: [...Array(101)].map((_,n)=>n/100)`).

### 6.2 The pinned figure — `position: sticky`, no JS

The sticky-tall-container pattern (offload all pinning to CSS):

```html
<section class="scene">                  <!-- tall: height comes from its steps -->
  <div class="graphic">…sticky SVG figure…</div>  <!-- position:sticky; top:0; height:100dvh -->
  <div class="step" data-step="appendix">…</div>   <!-- each min-height ~100dvh -->
  <div class="step" data-step="spleen">…</div>
</section>
```

- The figure stays pinned for exactly as long as the steps fill the parent. **One beat ≈ one screen** → each `.step` gets `min-height: 90–100dvh`.
- Sticky degrades to static in old browsers → content still reads top-to-bottom. Good.

### 6.3 Scroll-driven CSS animation — progressive enhancement

Native `animation-timeline: view()/scroll()` runs scroll-linked animation off the main thread, but support is partial — **feature-gate it** and keep the IntersectionObserver path as the baseline:

```css
@supports (animation-timeline: view()) {
  .reveal { animation: fadeUp linear both; animation-timeline: view(); }
}
```

### 6.4 Performance on a long page

- **Lazy-activate off-screen scenes.** Only run a scene's JS/canvas when its observer reports it near-viewport; pause when it exits. *Don't simulate/animate what isn't on screen* — the same discipline the game uses for jello/smoke.
- **`content-visibility: auto` + `contain-intrinsic-size`** on each scene so the browser skips layout/paint for off-screen sections. You **must** supply an intrinsic size or the scrollbar jumps:
  ```css
  .scene { content-visibility: auto; contain-intrinsic-size: 100dvh; }
  ```
- **Animate only `transform` and `opacity`** (compositor-only). Never animate `top/left/width/height` per frame.
- **`will-change: transform`** only on the element actively animating; remove it when idle (it's a cost, not a free hint).
- **Batch reads then writes** inside one `requestAnimationFrame`; never read `getBoundingClientRect()` and then write styles in the same iteration (layout thrash).
- **Lazy-init the effects canvas**; size it modestly and pause its rAF loop when off-screen.

### 6.5 Accessibility & progressive enhancement (load-bearing for "flawless on both")

- **`prefers-reduced-motion`:** gate every motion effect; reduced-motion users get instant state changes, not animation.
  ```css
  @media (prefers-reduced-motion: no-preference) { /* animations here */ }
  ```
- **Readable without JS.** Author the steps as real, in-order HTML so the piece is a legible, sourced article with JS disabled. IntersectionObserver + animation are *enhancement*. This also gives SEO + screen-reader support for free.
- **Keyboard + focus order** follow DOM order (don't reorder via JS); don't trap focus inside a sticky scene.
- **Never `preventDefault` wheel/touchmove** — that's the scroll-jacking failure mode for keyboard and assistive-tech users.
- **Alt text / labels** on the figure and each removable part; the counter announces changes (`aria-live="polite"`).

---

## 7. Anti-patterns (don't)

- ❌ **Scroll-jacking** — hijacking the scrollbar, forcing fixed jumps, intercepting wheel/touch. Augment native scroll only.
- ❌ **`100vh`** for full-screen beats on mobile → use `100dvh`.
- ❌ **Animating layout properties** (`top/left/width/height`) per frame → `transform`/`opacity` only.
- ❌ **A second core interaction.** One verb (scroll). Everything else is spice on top.
- ❌ **Overfilling screens.** Dead air is a feature; one idea per screen.
- ❌ **Realistic gore / saturated medical-plate rendering.** Friendly flat-vector, locked palette.
- ❌ **Desktop-style side-by-side that collapses on phones.** Mobile-first stack/overlay.
- ❌ **Calling the appendix/tonsils "useless," or repeating any BIBLE §7 myth.** Accuracy is the credibility.
- ❌ **A build step / framework / heavy library.** Vanilla `var`/IIFE, one HTML + one JS, matching the site.

---

## 8. Build order (recommended)

1. **Lock the figure art** (the flat-vector SVG body + organ palette) — do this in the vertical slice; it's the highest-risk-of-drift asset.
2. **Vertical slice — Tier 0–1 end to end:** sticky diminishing figure + the one IntersectionObserver engine + the running counter + the discard tray + 3–4 stations (spine-ligament frame, palmaris self-check, appendix, wisdom teeth). Prove the *feel* on phone and desktop before scaling.
3. **Tier-by-tier buildout**, each shipped + playtested by the owner.
4. **The ending** (its own mini-project — it carries the piece).
5. **Polish:** mood gradient, motion, reduced-motion, optional sound, optional "I'd stop here," `index.html` entry.

---

## 9. Reference index (key sources from the format teardown)

- The Pudding — [scrollytelling with `position: sticky`](https://pudding.cool/process/scrollytelling-sticky/) · [intro to Scrollama](https://pudding.cool/process/introducing-scrollama/) · [six-library how-to](https://pudding.cool/process/how-to-implement-scrollytelling/)
- [Scrollama (offset 0.5 model, API)](https://github.com/russellsamora/scrollama)
- neal.fun exemplars — [The Deep Sea](https://neal.fun/deep-sea/) · [The Size of Space](https://neal.fun/size-of-space/) · [Absurd Trolley Problems](https://neal.fun/absurd-trolley-problems/)
- [NN/g — Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/) · [SitePoint — Scrolljacking & accessibility](https://www.sitepoint.com/scrolljacking-accessibility/)
- [CSS-Tricks — viewport units on mobile (100dvh)](https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
- [MDN — scroll-driven animation timelines](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines) · [Codrops — practical intro to scroll()/view()](https://tympanus.net/codrops/2024/01/17/a-practical-introduction-to-scroll-driven-animations-with-css-scroll-and-view/) · [Josh Comeau — scroll-driven animations](https://www.joshwcomeau.com/animation/scroll-driven-animations/)
- [MDN — content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility) · [DebugBear — content-visibility](https://www.debugbear.com/blog/content-visibility-api)

---

## Session log

- **2026-05-21 — Craft bible v1.** Locked: vanilla one-HTML+one-JS structure matching sibling pieces; friendly flat-vector art with a site-derived palette; mobile-first hybrid layout (sticky figure + scrolling steps, full-bleed scenes); the single-IntersectionObserver engine; perf + a11y + progressive-enhancement rules. Next: vertical slice to lock the figure art and prove the feel.
- **2026-05-21 — Build v1 (LAYOUT PIVOT).** The owner redirected: build it in the **site's native post format**, not full-bleed. So §1/§4 above are overridden in the shipped build — it lives in the standard `.site-wrapper` 780px column with the normal `.post-header`/Home/footer chrome, and the **forest-green page background never changes** (no light→dark descent). The descent's mood is carried by the figure halo + a per-tier `--t-accent` only. Composition is **figure-top / caption-bottom at every width** (true side-by-side is too cramped in a 780px column). Dropped the floating discard tray and floating vitals — the diminishing figure *is* the pile, and the no-pulse ECG lives inside the heart card. Kept everything else: one IntersectionObserver (`-50%` center line), cumulative idempotent removal, `.js` PE gate (`html:not(.js)` forces content visible), reduced-motion. Figure SVG is intentionally simple/diagrammatic — refine in playtest.
