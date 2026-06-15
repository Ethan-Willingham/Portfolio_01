# STYLE.md - the site style guide

The single canonical reference for how this site looks: **color, type, and components.**
Read this before adding or changing any visual detail, on the homepage or in any post. One
warm, OKLCH-tuned system runs the whole site; a reader should never notice where one page
ends and the next begins.

This file folds in the old `PALETTE.md` (now removed) and adds the type system and the
component kit. The CSS source of truth is `style.css` (`:root`) + `kit.css` (components).

---

## 0. The three non-negotiables

1. **Green background, locked.** `--bg: #303931`. Never change it. Everything else serves it.
2. **Three fonts, no others.** Century Supra (serif headings/editorial), Segoe UI (body/UI),
   Commit Mono (data/labels/code). Reached via `--font-heading`, `--font-body`, `--font-mono`.
3. **Warm, low-chroma palette only.** No neutral gray, no pure white. Darks are green-warm,
   "whites" are cream, accents are dusty gold + a muted rhythm. Hold the temperature.

---

## 1. Color

The whole palette is **warm and low-chroma** on the **locked dark-green background**. Always
prefer a `var(--token)` over a raw hex. Values documented in OKLCH (the space it was tuned in);
hex is what ships.

### Neutral + text ramp (dark → light)
One smooth curve: hue glides green (~150) → cream (~85) as lightness rises; chroma stays low.

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `--bg` | `#303931` | L33 H148 | page background (LOCKED) |
| `--bg-raised` | `#1e2420` | L25 H156 | raised panels |
| `--rule` | `#4a544b` | L43 H148 | faint hairline / divider |
| `--rule-strong` | `#5a675c` | L50 H150 | stronger hairline |
| `--line-mid` | `#767d71` | L58 H132 | mid divider / gridline / active border |
| `--text-faint` | `#a4a293` | L71 H102 | tertiary text (dates, captions, footnotes, footer); AA 4.65:1 on `--bg` |
| `--text-dim` | `#b8b2a2` | L76 H90 | secondary text (nav, taglines, intro) |
| `--accent` | `#d4c4a0` | L82 H87 | core accent + links (gold) |
| `--accent-hover` | `#ede0c0` | L91 H88 | link/accent hover |
| `--text` | `#e8e2d6` | L91 H85 | body text |
| `--text-bright` | `#f5f1ea` | L96 H82 | headings / brightest |

### The rose emphasis (use sparingly)
The background's complement, the exact mirror of the gold accent. A **reserve accent**: the
single most important link or callout on a page, at most once. Wired as `.post-body a.key`
(print-safe). Apply `class="key"` to one link per essay; never scatter it.

| Token | Hex | Role |
|---|---|---|
| `--emphasis` | `#deb9cf` | the one key link / accent (6.8:1 on `--bg`) |
| `--emphasis-hover` | `#f7d6e9` | its hover |
| `--emphasis-strong` | `#d697be` | a true CTA (5.1:1) |
| `--emphasis-weak` | `#55384a` | a tinted chip background (light rose text on it) |

`--warn` `#d99090` is the alert color; do not repurpose it as a general accent.

### The categorical / per-post accent set
Posts pick an accent (or per-section accents) from one shared, muted, chroma-equalized set
(every member at C ≤ 0.082, so they read as true peers):

`sage #9ec79a` · `gold #dfc288` · `coral #d9978c` · `clay #cf9f78` · `pine #6f9a6c` ·
`brick #b8796d` · `deep gold #bc9d65` · `blue #8fb3c7` · `purple #b79bc4`

> **Kit note:** a few kit components were built with the louder pre-equalization values
> (`#e6c074` amber, `#e98e7f` rose) for semantic warmth (the safety banner's emergency rose,
> the stat-card amber). They are deliberate. If you want them fully on-system, cap to the band
> (`#e6c074`→`#dfc288`, `#e98e7f`→`#d9978c` or `#b8796d`).

### What is deliberately NOT on this system (do not "fix")
- Photographs and their `--img-bg` mattes (sampled from the photos).
- `@media print` blocks (white bg, near-black ink).
- `archive/best-photographs/` (a photographer's neutral zone-system scale).
- Olive accents (hue ~110–135) are warm-greens, on-system.
- A deliberate cool accent a post uses for meaning is character; keep it.

Method: tune in **OKLCH**, verify AA 4.5:1 for normal text on `--bg` before shipping a new color.

---

## 2. Type

Three faces, nothing else:
- **Century Supra** (`--font-heading`) - headings, display, editorial moments, big numerals.
- **Segoe UI** (`--font-body`) - body copy and UI.
- **Commit Mono** (`--font-mono`) - data, gauges, labels, kickers, code, eyebrows.

### Type scale (a smooth, gap-free ramp; sizes in rem unless noted)
| Element | Size | Notes |
|---|---|---|
| body | 1.2 → 1.25 → 1.28rem | mobile / 720 / 1024 |
| h3 / small heading | ~1.45rem | keep it above the body + homepage-list size |
| article-list title | ~1.6rem | homepage |
| h2 / section heading | ~2rem | the heading tier |
| **default post title** | the **Field guide hero** (`clamp(3rem, 11vw, 6rem)`) | your chosen default |
| showpiece title | up to ~7rem | rare, one per piece at most |

Body line-height ~1.7; headings ~1.1–1.3. Tight tracking on big serif (`-0.02em`).

---

## 3. The component kit

Every component below is your chosen design for that job. The CSS lives in **`kit.css`**,
which is auto-loaded everywhere via `@import` in `style.css` - so in a post you just write the
markup, no extra `<link>` needed. Most components use `.u-*` classes; a few keep their own
names. All are green/parchment/gold and use only the three fonts.

### Post title - `.u-hero` (Field guide)
```html
<header class="u-hero">
  <p class="u-eyebrow">Field guide</p>
  <h1 class="u-title">How Long Can You Live?</h1>
  <p class="u-dek">The italic serif standfirst.</p>
  <p class="u-meta">A field guide <span class="u-sep">/</span> <b>28 sources</b> <span class="u-sep">/</span> 25 min read</p>
</header>
```
Use at the top of every post. The eyebrow + meta strip are optional.

**Title tiers (one per scale).** `.u-hero` (the Field-guide hero, `clamp(3rem,11vw,6rem)`) is the default. For a full-bleed cover post, the bespoke `.cover h1` pattern (`clamp(4rem,17vw,9rem)`) is the big option. `.post-title` (the small `min(2.8rem,9vw)` title in `style.css`) is **legacy**: it still titles six older posts (the four demo pages + gallery + git-history), but it is not a choice for new posts - reach for `.u-hero`.

### Section heading - `.u-sechead` (or plain `.u-h2`)
```html
<div class="u-sechead"><p class="u-sechead-k">Chapter two</p><h2 class="u-sechead-h">What moves the needle</h2></div>
<h2 class="u-h2">A plainer inline heading</h2>
```

### Lead / body - `.u-lead`, `.u-link`
```html
<p class="u-lead">A bigger opening paragraph with a <a class="u-link" href="#">link</a> and <strong>bold</strong>.</p>
```

### Photo with a caption - `.u-figure`
```html
<figure class="u-figure"><img class="u-figure-img" src="assets/..." alt=""><figcaption class="u-figure-cap">Caption.</figcaption></figure>
```

### Grid of photos - `.u-grid` (Reflows 2-3-4)
```html
<div class="u-grid"><figure><img src="assets/..." alt=""><figcaption><b>Name</b>Caption.</figcaption></figure> … </div>
```

### Highlight / titled callout - `.u-callout` (+ `.u-move` takeaway line)
```html
<aside class="u-callout"><p class="u-callout-k">The honest goal</p><p class="u-callout-body">The point.</p></aside>
<aside class="u-callout u-move"><p class="u-callout-k">label (hidden)</p><p class="u-callout-body">The takeaway, in the essay's own voice.</p></aside>
```
Plain `.u-callout` is a boxed, **labelled** highlight: use it for a one-off, meaningfully-named callout. Add **`.u-move`** for a long essay's *recurring* takeaway after every section: it drops the box and hides the label, leaving a quiet gold marker line in the essay's italic voice (a labelled box repeated a dozen-plus times reads like homework). Keep the label in the markup; `.u-move` just hides it. Add **`.u-aside`** for a *recurring synthesis / connective* beat (the "notice the pattern", "the one catch" step-backs): it drops the box for a quiet gold left-rule line in the essay's voice, with the opening sentence bolded as a run-in lead. Reserve the boxed `.u-callout` for the things that earn weight (titled highlights, myth-busters, disclaimers); if a post leans on the box a dozen-plus times for different jobs, that is the signal to demote the soft ones to `.u-aside`.

### Two sides of a debate - `.debateA` (Stacked tint)
```html
<div class="debateA"><div class="debateA-claim"><span class="debateA-kicker">The claim</span><p class="debateA-text">…</p></div><div class="debateA-truth"><span class="debateA-kicker">The reality</span><p class="debateA-text">…</p></div></div>
```

### Do / skip checklist - `.u-checks` (Sharp)
```html
<ul class="u-checks"><li class="u-check u-use"><strong>Do this.</strong> …</li><li class="u-check u-meh"><strong>Maybe.</strong> …</li><li class="u-check u-skip"><strong>Skip.</strong> …</li></ul>
```

### Dictionary definition opener - `.u-def` (single entry)
```html
<dl class="u-def"><dt class="u-def-term"><dfn class="u-def-word">old master</dfn> <span class="u-def-pos">(n.)</span></dt><dd class="u-def-gloss">a European painter working before about 1800, or a painting by one.</dd></dl>
```
For one set-apart definition (an epigraph opener). Use `.dlnum-*` below when you have several terms to number.

### Define terms - `.dlnum-*` (Numbered glossary)
```html
<div class="dlnum-wrap"><p class="dlnum-head">Define some terms.</p><div class="dlnum-item"><div class="dlnum-numeral">1</div><div class="dlnum-body"><h3 class="dlnum-term">Term</h3><p class="dlnum-def">Definition.</p></div></div> … </div>
```
Default is a single column with hairline rules. For a **short** glossary (roughly 4 to 6 terms) where the single column eats too much height, add **`.dlnum-2up`** to `.dlnum-wrap` for a compact 2-up grid (about half the height; drops the rules, stacks on mobile). An odd last term spans both columns, so odd counts work too.

### Numbers - inline `.u-stats`, neutral cards `.stat-bartab`, giant `.u-bignum`
```html
<div class="u-stats"><div class="u-stat"><span class="u-fig">82%</span><span class="u-fig-lbl">label</span></div> … </div>
<div class="stat-bartab-row"><div class="stat-bartab"><div class="stat-num">120</div><p class="stat-label">label</p></div><div class="stat-bartab">…</div><div class="stat-bartab">…</div></div>
<div class="u-bignum"><span class="u-bignum-fig">82<span class="u-bignum-u">%</span></span><span class="u-bignum-cap">caption</span><span class="u-bignum-src">source</span></div>
```
`.u-bignum` lays out **figure on the left, caption + source filling the right** (it stacks on narrow screens), so the card never reads as a number floating in empty space. `.stat-bartab` cards are **neutral** (cream figure, dim top rule): gold is the site's positive accent, so stat numbers - especially cautionary ones - stay neutral rather than reading as "look how great."

### Data table - `.u-table` (feature a row with `.u-feature`)
```html
<table class="u-table"><thead><tr><th>Lever</th><th>Years</th><th>Evidence</th></tr></thead><tbody><tr><td>Movement</td><td class="u-num">~3–7</td><td>strong</td></tr><tr class="u-feature"><td>Connection</td><td class="u-num">~5+</td><td>strong</td></tr></tbody></table>
```

### Dashboard readout `.u-kpis` (legacy)
`.u-kpis` is grandfathered - it dashboards big-enough (its only user). Not a choice for new posts; use `.u-stats` or `.stat-bartab` cards instead.
```html
<div class="u-kpis"><div class="u-kpi"><span class="u-kpi-lbl">label</span><span class="u-kpi-val">38</span><span class="u-kpi-sub">sub</span></div><div class="u-kpi u-kpi-main">…</div>…</div>
```

### Pull-quote `.u-pq` (Left bar)
```html
<blockquote class="u-pq">A line worth dwelling on.<cite class="u-pq-cite">Source</cite></blockquote>
```

### Sources & footnotes - chips `.u-citep`/`.u-src`/`.u-grade` (grades a/b/c/d), footnotes `.u-fnp`/`.u-cite`
```html
<p class="u-citep">A claim. <span class="u-src"><a href="#">the roll</a></span> <span class="u-grade u-grade-a">solid</span> <span class="u-grade u-grade-b">good</span> <span class="u-grade u-grade-c">contested</span> <span class="u-grade u-grade-d">weak</span></p>
<p class="u-fnp">A claim with a footnote.<sup class="u-cite"><a href="#">1</a></sup></p>
```

### Numbered entries `.u-entries` · numbered steps `.u-steps` (both Editorial)
```html
<div class="u-entries"><article class="u-entry"><span class="u-entry-num">No. 01</span><h3 class="u-entry-h">Headline.</h3><p class="u-entry-p">Body.</p></article>…</div>
<ol class="u-steps"><li class="u-step"><span class="u-step-h">Step.</span><p class="u-step-p">Detail.</p></li>…</ol>
```

### Table of contents `.u-toc` · info cards `.u-cards` · collapsible `.u-collapse`
```html
<nav class="u-toc"><p class="u-toc-k">What is inside</p><ul class="u-toc-list"><li><a class="u-toc-row" href="#"><span class="u-toc-name"><span class="u-toc-n">01</span>Chapter</span><span class="u-toc-m">8 min</span></a></li>…</ul></nav>
<div class="u-cards"><div class="u-card"><h4 class="u-card-h">Title</h4><p class="u-card-p">Body.</p></div>…</div>
<details class="u-collapse"><summary class="u-collapse-s">Sources</summary><ol class="u-collapse-list"><li><b>Name.</b> <a href="#">link</a></li></ol></details>
```

### Dividers - `.u-divider`
```html
<hr class="u-divider">
```

### Interactive demo panel - `.pillbar` (Pillbar)
For posts with a live demo. Wire the slider/buttons up in the post's own JS.
```html
<div class="pillbar"><div class="pillbar-stage"></div><div class="pillbar-head"><span class="pillbar-title">Demo</span><span class="pillbar-readout"><b>58</b><span>FPS</span></span></div><div class="pillbar-sliderrow"><label>Density</label><input type="range" value="62"><span class="pillbar-sliderval">620</span></div><div class="pillbar-foot"><div class="pillbar-seg"><button>Low</button><button class="is-on">Med</button><button>High</button></div><div class="pillbar-actions"><button class="pillbar-btn pillbar-btn--reset"><span class="gl">↻</span> Reset</button><button class="pillbar-btn pillbar-btn--primary">Run</button></div></div></div>
```

---

## 4. Writing a new post

1. Start from the standard post shell (`.site-wrapper` / `.post-header` / `.post-body`), open
   the `.u-hero` Field-guide title.
2. Reach for a kit component before inventing one. The classes above are global (via `kit.css`).
3. Stay on the palette (§1) and the three fonts (§0). New color → cap it to the accent band (§1).
4. Keep motion barely-there and gated behind `prefers-reduced-motion` + fine-pointer.
5. To compare the kit against older variants, open `/components-lab.html?all=1`. The three full
   style directions live at `/styles-lab.html`.

The lab files (`components-lab.html`, `styles-lab.html`, `style-*.html`, `lab-*.js`) are dev
tools, `noindex`, not linked from the site.
