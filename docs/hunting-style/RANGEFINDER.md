# Asset brief: scope yardage

Status: reviewed
Date: 2026-10-03
Asset category: UI
Runtime destinations: `hunting-game.html`, `hunting-game.css`, `js/hunting-game.js`, `js/hunting-view.js`
Source master directory: none, live HTML text and existing canvas geometry
Reference packet command: `node tools/hunting-art-reference.cjs --brief ui`

## Subject and role

While aiming, a small centered plate near the scope's lower edge reads
`6x Range 88.5 yd`. It follows the current crosshair immediately as the pointer,
touch input, scope camera or wildlife moves. Lowering the scope hides the plate.
Sky and horizon with no finite surface read `No range`.

Use Commit Mono, cream/gold lettering and the existing dark-green raised surface.
Keep the readout above the wind/ammunition strip on phones and anchored to the
actual canvas when the field has letterboxing. It remains real HTML text, at
least 12 CSS pixels, with pointer events disabled so aiming passes through it.
Expose an output labelled `Distance to the crosshair`, without announcing every
pointer update. No ornament, distress, image texture or new font is introduced.

## Painting references

Catalog schema version 1, catalog SHA-256
`09f438704ddcdcbdfb74c1a50c66b9269364ab6a3068ac9251c42936f71ccef8`.

Primary reference: `musicians`, Caravaggio's *The Musicians*, inspected from
`assets/images/The Musicians - Caravaggio.jpg`. Source SHA-256:
`82d57c6e26834154dd2c76717f300dfab12a77da8d8d4d917b73674108dd3683`.
Its dark ground and restrained cream highlights guide the plate's hierarchy.
The packet's `linen-and-wood` and `face-and-shadow` studies provide the relevant
grouping and contrast. Reuse the established site tokens rather than importing
the portrait's subjects, age cracks, frame or intense red into a data label.

## Drawing and range specification

Use the existing sight ray and projected crosshair, including 6x panning.
For visible deer and boar, invert the sprite's actual screen transform and read
its native alpha mask. Walking bob, facing, downed rotation and opacity match
the visible image. For owls and squirrels, test the current filled/stroked
vector paths. Choose the nearest visible animal covering the sight. A bounding
rectangle alone must not turn a transparent leg or antler gap into an animal hit.

Without an animal hit, intersect the ray with ground height zero. Compute the
3D Euclidean distance from the stand eye to that point, then divide by 0.9144.
Round only the displayed number to one decimal. Include sideways distance and
the 12-unit stand height. Do not report the fixed 100-unit reference used to
describe the shot direction. Upward/parallel rays without a visible animal
have no finite ground distance. Decorative painted foliage has no separate
depth mesh; background range follows the field's existing flat-ground model.

Keep wildlife rendering, aiming, wind, gravity, scope motion and saving intact.
Range computation reads the scene; it does not select or lock a hunting target.
Cache the scenery as in version 11 and write HTML only when the displayed value
or visibility changes. No new raster assets or color processing are needed.

## Review and validation

All 148 browser checks and 35 WebKit range checks pass, plus eight campaign
and 22 physics checks. Known
ground points test near/far distance, sideways displacement and eye height.
Every deer level and boar is checked in both orientations, along with a real
transparent leg gap, owl and squirrel. Pointer/pan movement updates the readout;
sky and horizon do not fabricate a distance. Retina checks retain logical aim
coordinates. Phone checks verify readable text, canvas bounds, no overlap with
field statistics and no interception of pointer events.

Reviewed desktop, portrait and landscape captures in `/tmp/hunting-game-v12-qa`.
The performance benchmark in `performance-v12.json` measures about 120 FPS in
Chrome's wide/steady-scope modes, 115 while panning, and about 60 in WebKit's
wide/steady scope. These are local headless Retina results, not device promises.
The page's CSS and four game scripts use version query 12.
