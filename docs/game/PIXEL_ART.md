# PIXEL_ART.md — Technique bible for LLM-drawn pixel art

The **how-to-render-well** companion to the *what* bibles (`BUILDING_STYLE.md` = the locked `BLD` palette + Frontier-Soviet motifs; `BACKGROUND_STYLE.md`, `MINERALS_BIBLE.md`). Those say which colours and motifs; this says how to turn `fillRect` calls into pixel art that reads as form, material, and light instead of flat coloured blocks.

This game draws pixel art **programmatically** (canvas, 1-world-pixel `fillRect`s, in world space). That is unusual, and the failure modes are specific: flat fills, no light direction, banding, pillow shading, grey mush. The rules below are written to be applied in draw code.

> **You can SEE your work now.** `build-sluice-lab.js` assembles `sluice-lab.html` from the real fragments (it pulls `BLD` + the material helpers from 170 and the draw code from 172, brace-matched, so it never drifts). It renders **once on load**, so the preview's paused RAF does not blank it. Run `node build-sluice-lab.js`, serve the repo (the `maincheck` launch.json server, port 8783), open `/sluice-lab.html`, and `preview_screenshot`. Then run the §10 rubric on the screenshot and iterate. Generalise this render-on-load + screenshot bench for any sprite. **Never draw blind again.**

Research basis: Pedro Medeiros/Saint11, Slynyrd Pixelblog, *Pixel Logic* (Azzi), Lospec, Derek Yu, Pixel Parmesan, OpenGameArt.

---

## 1. Colour: ramps + the hue-shift law

A **ramp** is an ordered dark→light array for ONE material (4-6 steps). Every pixel of a surface uses only its material's ramp. Off-ramp colours look accidental.

**The hue-shift law (the single most important rule).** NEVER build a ramp by just multiplying brightness on one hue. That gives dead "plastic" / "cement dust" colour. Instead:
- **Shadow end:** value DOWN, saturation DOWN a little, **hue shifts COOL** (toward blue-violet for cool materials: steel, stone, water; toward red-brown for warm materials: wood, gold, rust).
- **Highlight end:** value UP, **hue shifts WARM** (toward yellow-white), saturation drops at the extreme (near-white for metal specular).
- **Midtone (ramp[2]):** the truest, most saturated material hue. Saturation peaks here and falls toward both ends (a bell curve, not flat).

**Value spacing:** adjacent steps need ~15-25% luminance difference or the eye can't tell them apart (`L = 0.299R+0.587G+0.114B`). At small sizes, err toward MORE contrast.

**Concrete ramps (drop-in, already hue-shifted).** The game's `BLD` palette is a 4-step-per-family subset of these; use `BLD` for buildings (BUILDING_STYLE locks it), but these 6-step ramps are the ideal to push `BLD` toward:

```
Steel/iron (cool):  #1c1e22  #3c3f45  #5a6270  #7e8fa0  #afc3d4  #ddeeff(spec)
Wood (warm):        #2e1f12  #523520  #7a5230  #a07040  #c89a60  #e8c898
Stone (warm-grey):  #252320  #3e3830  #5a5248  #7a706a  #9e9488  #c0b8b0
Water (teal):       #1a2e3a  #2a4a5e  #3d6e80  #7fc8d8  #c8eef4(froth)
Gold/brass (warm):  #2a1a06  #5c3010  #a06020  #c88030  #e8b040  #f6cd26(spec)
Rust:               #331c17  #563226  #ac6b26  #bb7f57  #c8874a
```

**Share ramps across materials** to keep the palette tight; don't invent a near-duplicate ramp per object.

---

## 2. Light: one direction, seven zones

**Commit to ONE light direction for the whole scene. Surface convention here = top-left (~45°).** Every highlight/shadow/AO/specular derives from it. Mixing directions between adjacent elements destroys the read.

**Flat-face rule (load-bearing for code):** a flat panel stays a **uniform `base` fill**. Spend the ramp only at EDGES and raised features:
- top edge = 1px `highlight` (ramp[4]); left edge = 1px `midlight` (ramp[3])
- bottom edge = 1px `shadow` (ramp[1]); right edge = 1px `deep shadow` (ramp[0])
- interior = solid `base` (ramp[2])

That four-edge bevel gives every rectangle volume in ~4 fills. Do NOT gradient-fill a flat face.

**Seven zones** (know where each lands under top-left light): specular (tiny, metal only, top-left corner) · direct highlight (top + left faces) · base (front) · form shadow (right + bottom faces) · core shadow (darkest, at the terminator) · ambient occlusion (crevices, undersides, where forms meet → ramp[0]) · reflected light (faint lift at the very bottom of the shadow side, slightly warm; keeps shadows from going dead black).

**Rivet (the metal signature), 3px:** center+cross = `base`; top-left pixel = `highlight`/`specular`; bottom-right pixel = `shadow`/`deep shadow`. 2px rivet = just highlight TL + shadow BR. Optional 1px cast shadow below-right on the plate.

**Vertical cylinder/pipe/tower:** light→dark bands left to right: far-left 1px `highlight`, left third `midlight`, center `base`, right third `shadow`, **far-right 1px reflected light (`base`, NOT the darkest)** — that rim strip is what makes it read round instead of flat. (A tall riveted tower is a cylinder: it must NOT be a uniform flat slab of `base`.)

---

## 3. Outlines

- **Silhouette:** outline the outer perimeter so the object separates from the background. Use the darkest ramp step (or near-black `BLD.outline`), NOT necessarily pure black.
- **Selective outline ("selout"):** an outline pixel = the adjacent interior colour one step darker. On the lit (top/left) side it lightens or vanishes; on the shadow (bottom/right) side it deepens to ramp[0]. Reads "modelled," not stamped. Drop the outline where a form meets the ground (an underside outline makes it float).
- **Do NOT outline every interior edge** (rivets, seams, panels). That is the "coloring-book" look. Express interior edges as a value step: a seam = 1px dark line on one side + 1px light line on the other (an embossed read), no full outline.

---

## 4. Value, contrast, readability

- **Squint test:** blur/downscale until detail vanishes. You must see a clean **3-band dark/mid/light** pattern. All-one-grey = contrast too low (mud). 5 competing bands = too many near-equal colours.
- **Reserve max contrast (ramp[0] + ramp[4]) for FOCAL POINTS** only: the red star, the gold sign, a gauge glint. Structural steel/stone stays ramp[1]-[3]. This auto-creates depth hierarchy.
- **Design in greyscale first** (assign ramp indices by lightness), then add hue via the §1 ramps. If it reads in grey, it reads in colour.
- **Avoid grey/mid-value mush:** shadow floor `L < 45`, highlight ceiling `L > 180` (>210 for polished metal/glass). Background surfaces use a NARROWER range (ramp[1]-[3]) so foreground can own [0] and [4].

---

## 5. Material recipes (canvas `fillRect`)

**Metal plate:** uniform `base`; four-edge bevel (§2); rivets at corners/intervals. **Brushed:** add a 1px `specular` horizontal streak across the upper third. **Chrome:** widen the streak to 2px, raise contrast to near-white, add a thin dark band just under the highlight (reflected dark sky). **Matte iron:** drop the specular step entirely.

**Wood plank:** `base` fill; top edge `highlight`, bottom/seam `deep shadow`; left col `midlight`, right col `shadow`. Grain = SHORT (3-6px) horizontal dashes, 2-4 per plank, alternating `grain-mid`/`shadow`, Y-jittered, never touching edges, never long continuous lines. Sun-bleach: recolour an occasional whole plank to `highlight`; light pixels at knots; end-grain column = lightest.

**Stone:** `base` fill; top `highlight`, left `midlight`, bottom/right `shadow`; mortar = the 1px GAP itself (ramp[0]), not a drawn line. Vary at the WHOLE-BLOCK level (every 3rd-4th block one step lighter/darker), never scatter random pixels.

**FLOWING water (the sluice channel)** — the key illusion is **diagonal highlight bands scrolling DOWNHILL**:
1. fill channel in `body` (#2a4a5e).
2. draw 2-3 1px bands at ~30° (rise 1 / run 3) in `surface-shimmer` + a bright `highlight-line` (#7fc8d8), spanning the width.
3. each frame, shift every band's start DOWN by 1-2px (mod height) so it scrolls toward the foot. (Our channel scroll must move toward +x/down — the v0 bug scrolled up.)
4. froth = 2-3px clustered blobs of `#c8eef4` at the lip/turbulence, lighter than the body, drawn on top, flickering.
5. shallow water over a bed: draw the bed, then the water at `globalAlpha≈0.4`, then the highlight line at full alpha.

**Glass:** draw what's behind, then a 30%-alpha blue tint, a 1px dark frame, a bright diagonal reflection streak top-left→mid-right (offset from center), a softer parallel band below. Reflections do all the work.

**Rust:** NOT an even overlay. Drips DOWN from rivets/seams, pools at bottom edges/corners. Streak = wider warm at top tapering to 1px (`#563226`→`#ac6b26`→`#bb7f57`). Pitting = a few isolated `#331c17` pixels near rivet bases.

**Gold sign:** recessed `shadow` field; letters in `base` with top `highlight`, left `midlight`, bottom/right `deep shadow`, a 1-2px `specular` at each letter's top-left. Both ramp ends warm (shadow→red-brown, highlight→yellow-white).

---

## 6. Dithering + anti-aliasing

**Dither** = alternating two ramp-adjacent colours so the eye blends them. Only between TWO adjacent ramp steps; only on surfaces ≳32px; for gradients on large flat areas, surface texture, or biome transitions. Densities via parity: 50% `(x+y)&1`; 25% `(x&1)&&(y&1)`; smooth gradients via the Bayer 4×4 `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]` (`draw B if intensity > BAYER[y&3][x&3]/16`). Never dither outlines, tiny sprites, or high-contrast pairs (reads as a grid).

**AA** = one intermediate-value pixel at the corner where a diagonal's equal-length runs step. Match direction (horizontal-ish slope → horizontal AA pixel). **Never AA a 45° (1:1) diagonal** — it just doubles/bands. Keep run lengths on a diagonal EQUAL (a different-length run = a "jaggy"); curves change run length progressively (…4,3,2,1,1,2,3,4…), never jump. Skip outer AA against an unknown/parallax background (the pre-blended pixels halo).

---

## 7. Anti-patterns (the LLM failure list — check every time)

1. **Pillow shading** — shading inward from all edges, ignoring light dir → puffy, formless. FIX: directional bevel (§2).
2. **Banding** — parallel same-colour rows hugging a contour → flattens, fake edges. FIX: break the boundary width/angle; irregular, not concentric.
3. **Noise/scatter** — random lone pixels for "texture" → reads as dirt/compression. FIX: structured 2-4px clusters, hashed placement.
4. **Orphan pixels** — a lone pixel with no same-colour neighbour (except a deliberate 1px specular). FIX: connect to a pair.
5. **Mushy low contrast** — ramp steps <15% L apart → flat. FIX: widen value spread.
6. **Over-outlining interior** — black line around every detail → coloring book. FIX: selout + value steps (§3).
7. **Too many near-duplicate ramps** — fragmented palette. FIX: share ramps.
8. **Repetitive/symmetric texture** — visible tiling/symmetry → wallpaper. FIX: hash-vary placement; bias detail to one lit side.
9. **`rgba(0,0,0,0.x)` for shadow** — wrong hue, translucent multiply. FIX: place explicit ramp[0]/[1] pixels.

---

## 8. Detail economy

Detail is finite; spend it at the focal point. Read order: **silhouette (never sacrifice) → focal zone (max texture+contrast) → supporting surfaces (1-2 ramp steps, minimal texture) → background-facing surfaces (flat shadow, no texture).** If removing a detail doesn't change what the object IS, remove it. Keep flat areas >16px calm (at most one sparse 25% dither pass at the shadow transition).

| Sprite | Ramp colours | Dither | AA | Interior detail |
|---|---|---|---|---|
| 8px | 2 | never | never | silhouette only |
| 16px | 3 | avoid | 1 max | 1-2 key details |
| 32px | 3-4 | selective | yes | moderate |
| 64px+ | 4-6 | yes | yes | full texture |

---

## 9. Code patterns

```js
// Ramps are arrays, dark -> light. Look up by a 0..1 light factor.
var STEEL = ['#1c1e22','#3c3f45','#5a6270','#7e8fa0','#afc3d4','#ddeeff'];
function rampAt(r, t){ return r[Math.max(0, Math.min(r.length-1, Math.floor(t*r.length)))]; }

// One light vector for the whole scene; shade a surface by its normal.
var LIGHT = { x:-0.5, y:-0.866 };                 // top-left
function lit(nx, ny){ return ((LIGHT.x*nx + LIGHT.y*ny)+1)*0.5; }  // 0..1

// Flat panel with a directional bevel (4 edges) — the workhorse.
function bevelRect(x,y,w,h,r){ ctx.fillStyle=r[2];ctx.fillRect(x,y,w,h);
  ctx.fillStyle=r[4];ctx.fillRect(x,y,w,1); ctx.fillStyle=r[3];ctx.fillRect(x,y,1,h);
  ctx.fillStyle=r[1];ctx.fillRect(x,y+h-1,w,1); ctx.fillStyle=r[0];ctx.fillRect(x+w-1,y,1,h); }

// Vertical cylinder: light|mid|base|shadow|reflected-rim.
function cylinderV(x,y,w,h,r){ var t=Math.max(1,(w/4)|0);
  ctx.fillStyle=r[4];ctx.fillRect(x,y,1,h); ctx.fillStyle=r[3];ctx.fillRect(x+1,y,t,h);
  ctx.fillStyle=r[2];ctx.fillRect(x+1+t,y,w-2*t-2,h); ctx.fillStyle=r[1];ctx.fillRect(x+w-1-t,y,t,h);
  ctx.fillStyle=r[2];ctx.fillRect(x+w-1,y,1,h); }   // reflected rim

// Bayer dither between two ramp steps over a region.
var BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
function dither(x,y,w,h,a,b,t){ for(var j=0;j<h;j++)for(var i=0;i<w;i++){
  ctx.fillStyle=(t>BAYER[(y+j)&3][(x+i)&3]/16)?b:a; ctx.fillRect(x+i,y+j,1,1);} }

// Flowing-water band scrolling downhill (call with a per-frame offset).
function flowBand(cx,cy,cw,ch,off,col){ ctx.fillStyle=col;
  for(var i=0;i<cw;i++){ var yy=((i/3|0)+off)%ch; ctx.fillRect(cx+i,cy+yy,1,1);} }
```

---

## 10. Self-evaluation loop (use the bench)

After EVERY screenshot, run these 8 tests in order (earlier = bigger problem); fix the **single worst failure**, rebuild the bench, screenshot, re-score. One fix at a time.

1. **Value grouping** (squint): 2-3 clean value bands? (fail → nothing else matters)
2. **Light direction:** every highlight on the same side?
3. **Pillow shading:** any symmetric center-bright/edge-dark region?
4. **Banding:** parallel same-colour rows along an edge?
5. **Silhouette:** recognizable from outline alone?
6. **Material differentiation:** can you tell metal/wood/stone/water apart?
7. **Orphan pixels:** any lone pixel not in a deliberate pattern?
8. **Focal contrast:** sharpest contrast on the focal element?

Translate results into SPECIFIC code changes ("the tower face is uniform ramp[2]; make it a cylinder: left col ramp[4], right third ramp[1], far-right rim ramp[2]"), not "improve shading." If a test keeps failing after ~3 loops, the ramp is wrong (too few value steps / too close), not the draw code.

---

*Sources: Pedro Medeiros/Saint11 (Pixel Grimoire), Slynyrd Pixelblog 1/2/6/10/13/45/47, Pixel Logic (Michael Azzi), Lospec (outlines, palettes, Rust Gold 8), Derek Yu (common mistakes), Pixel Parmesan (dithering, AA, colour), OpenGameArt (shadow/light, lines/curves, AA), Pixnote, Wikipedia (ordered dithering).*
