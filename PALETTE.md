# PALETTE.md — the site color system

The canonical color reference for this site. Read this before adding or changing **any**
color, on the homepage or in any post. One warm, OKLCH-tuned system runs the whole site;
the goal is that a reader never notices where one page ends and the next begins.

**Source of truth: the `:root` block in `style.css`** (mirrored into the `--d-*` block for the
data/dev sections). Always reach for a `var(--token)` over a raw hex. The values below are
documented in OKLCH (L = perceptual lightness 0-100, C = chroma, H = hue angle) because that
is the space the system was tuned in. Hex is what ships.

---

## 1. The one rule that explains everything

The whole palette is **warm and low-chroma**, sitting on a **locked dark green background**.
Nothing on the site is a neutral gray or a pure white: the darks are green-warm, the "whites"
are cream, the accents are dusty. Hold that temperature and everything harmonizes.

- **`--bg: #303931`** (L33 C0.018 H148) is a near-neutral green and is **LOCKED. Never change it.**
  Everything else may change to serve it.
- The core accent is **warm-analogous gold**, a deliberate choice, not the only option (green is
  mid-spectrum and would also take cool or complementary accents). We chose warm. Stay warm.

## 2. Neutral + text ramp (dark to light)

One smooth curve: hue glides green (~150) to cream (~85) as lightness rises, chroma stays low.

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `--bg` | `#303931` | L33 H148 | page background (LOCKED) |
| `--bg-raised` | `#1e2420` | L25 H156 | raised panels |
| `--rule` | `#4a544b` | L43 H148 | faint hairline / divider |
| `--rule-strong` | `#5a675c` | L50 H150 | stronger hairline |
| `--line-mid` | `#767d71` | L58 H132 | **mid divider / gridline / active border** |
| `--text-faint` | `#a4a293` | L71 H102 | **tertiary text** (dates, captions, footnotes, footer). AA 4.65:1 on `--bg` |
| `--text-dim` | `#b8b2a2` | L76 H90 | secondary text (nav, taglines, intro) |
| `--accent` | `#d4c4a0` | L82 H87 | core accent + links (gold) |
| `--accent-hover` | `#ede0c0` | L91 H88 | link/accent hover |
| `--text` | `#e8e2d6` | L91 H85 | body text |
| `--text-bright` | `#f5f1ea` | L96 H82 | headings / brightest |

Three text tiers exist now: `--text` (body), `--text-dim` (secondary), `--text-faint` (tertiary).
Use the faint tier for genuinely tertiary text only; keep it AA (it clears 4.5:1 on `--bg`).

## 3. The rose emphasis (use sparingly)

The background's **complement**, built as the exact mirror of the gold accent (same lightness and
chroma, hue rotated to 342, nudged warm so it reads rose, not cold mauve). It is a **reserve
accent**: the single most important link or callout on a page, at most once. It rings against the
green without competing with the gold.

| Token | Hex | Role |
|---|---|---|
| `--emphasis` | `#deb9cf` | the one key link / accent (6.8:1 on `--bg`) |
| `--emphasis-hover` | `#f7d6e9` | its hover |
| `--emphasis-strong` | `#d697be` | a true CTA (more chroma, 5.1:1) |
| `--emphasis-weak` | `#55384a` | a tinted chip background (put light rose text on it) |

Wired as `.post-body a.key` (print-safe). Apply `class="key"` to **one** link per essay, never
scatter it.

`--warn` / `--d-warn` `#d99090` stays the alert color; do not repurpose it as a general accent.

## 4. The categorical / per-post accent set

Posts pick an accent (or per-section accents) from one shared, muted, **chroma-equalized** set.
Every member sits at **C <= 0.082** so they read as true peers. Keep new accents inside this band
(do not flatten reds to gray, but do not let a warm one run hot either).

`sage #9ec79a` · `gold #dfc288` · `coral #d9978c` · `clay #cf9f78` · `pine #6f9a6c` ·
`brick #b8796d` · `deep gold #bc9d65` · `blue #8fb3c7` · `purple #b79bc4`

(If you see the louder originals `#e6c074` / `#e98e7f` / `#cf6a59` / `#c79a3f` anywhere new,
they are pre-equalization values; cap them to the band.)

## 5. What is deliberately NOT on this system (do not "fix" these)

- **Photographs and their `--img-bg` mattes.** Those colors are sampled from the photos. Warming
  them breaks the match. Leave every `--img-bg` alone.
- **`@media print` blocks** (white background, near-black ink). Correct by design.
- **`archive/best-photographs/`** is intentionally neutral: the 0-IV buttons are a photographer's
  zone-system tonal scale and the SVG fills are illustrations. Neutral serves the photos.
- **Olive accents** (hue ~110 to 135) are warm-greens that sit on the ramp; they are on-system.
- A **deliberate cool accent** a post uses for meaning (for example a cool blue paired with a blue
  background) is character. Keep it.

## 6. Method notes

- Tune and check colors in **OKLCH**, not HSL. Verify text contrast (AA 4.5:1 for normal text)
  on `--bg` before shipping a new text color.
- Gotcha: a regex that scans for `#[0-9a-f]{3,8}` will falsely catch **HTML entities**
  (`&#183;` = middot, `&#215;` = times sign, `&#8594;` = arrow) as colors. Exclude them with a
  `(?<!&)` look-behind before classifying.
