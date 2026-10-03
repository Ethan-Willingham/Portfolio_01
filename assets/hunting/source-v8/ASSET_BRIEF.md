# Asset brief: Birch Clearing and the hunting stand

Status: shipped
Date: 2026-10-03
Asset category: first map, atmosphere and foreground equipment
Runtime destinations: `assets/hunting/{birch-terrain,birch-sky,lookout-stand}-v8.webp`
Source master directory: `assets/hunting/source-v8/`
Reference packet: `NODE_PATH=/path/to/node_modules node tools/hunting-art-reference.cjs --brief birch-base`

## Subject and role

The player looks out from inside an elevated wooden hunting stand over a broad
birch meadow. The owner's request was an easy level-one feeling, with the stand
clearly visible in the foreground. Short grass, quiet open ground, gentle
landforms and bright morning light establish the first field. Edge posts, a
low shooting rest, corner braces and floorboards put the player inside a
practical shelter. No roof or upper beam covers the sky.

Fresh saves start in Birch Clearing at 08:00. Returning saves retain their
clock. Deer progression, visits, arrival easing, scope controls and ballistics
keep their existing tuning.

## Painting references

| Catalog ID | Job | Inspected study |
|---|---|---|
| `salisbury` | Main landscape and sky: connected irregular foliage, asymmetry, meadow light and cloud structure | Full original, meadow and foliage studies |
| `optevoz` | Rural distance, quiet low tree groups and connected land masses | Full original and village landscape studies |
| `plowed-field` | Sky scale and broad cloud masses | Full original and sky study |
| `musicians` | Stand timber: warm and cool planes, modeled grain, crevices and selective highlights | Full original, linen-and-wood study |

Catalog schema version: 1. `prompts.json` records the exact source paths and
SHA-256 fingerprints for all four attached painting reproductions. Constable
and Daubigny were attached to the terrain generation, Constable and Michel to
the sky, and Caravaggio to the stand. The correction calls used the preceding
generated master. The final stand was a new generation with Caravaggio attached.

The references supply painting treatment and composition lessons. The game
imports no cathedral, cottage, figures, instruments, photographed frames,
signatures or age cracks.

## Production prompts and tool

Tool: built-in `image_gen.imagegen`. All production and correction prompts,
reference IDs, transparency settings and original generation paths are in
`prompts.json`. The selected native outputs are saved as `terrain.png`,
`sky.png` and `stand.png`. Original tool files remain in the local generated
image directory.

The first terrain placed the horizon too low. A correction raised its skyline;
the final rendering registration completes the alignment without stretching
its brushwork. Two early stand versions covered too much of the field. The
final generation uses a lower rail and a smaller timber mass. The chosen stand
is visually reviewed in the real scene, where the fine alpha boundaries blend
with the field.

The prompts requested larger images, but the generator returned 1672 by 941
native masters. These are the actual preserved source dimensions. No artificial
upscaling is included.

## Export and runtime contract

`tools/build-hunting-scene.cjs` exports 1664 by 936 layers with Lanczos3
resampling, WebP quality 95, alpha quality 100 and effort 6. Normalizing the
generator's fractional aspect discrepancy changes the vertical registration by
less than one source pixel. There is no crop in the exported assets, palette
quantization, binary-alpha conversion or new sprite mask. `exports.json`
records all native and runtime dimensions, byte counts and fingerprints.

The sky is fully opaque. Terrain sky holes and the stand opening retain soft
alpha. The builder checks that the upper central sky is clear, the animal ground
is continuous and the stand leaves the central view unobstructed above the rail.

The logical view remains 640 by 360, with eye height 12, focal length 300 and
projected horizon y = 144. The terrain master skyline is at 44.4 percent; uniform
scale 1.079 and bottom anchoring place it at 40 percent in the view. This trims
a little of the top and sides at rendering time while preserving aspect ratio
and continuous ground. The stand uses full-frame placement, with its rail near
81 percent down and posts confined to the edges. The nearest animal feet may
briefly pass behind the rail, as they would from this viewpoint.

The backing canvas follows the viewport and device pixel ratio, capped at 2560
by 1440. Painted layers use smooth high-quality sampling at wide and 6x scope
scales; the scope samples the native layers rather than a 640-pixel overview.
The stand stays in the unscoped foreground and disappears inside the lens.
Cypress Edge shares this stand but retains its procedural scenery.

Each painted layer owns one reusable light buffer. Clock-dependent brightness,
saturation, cool night color, modest dawn warmth and broad moving meadow light
retain the source's tonal relationships. The sun, moon and stars remain separate
live marks. The sun has a soft luminous edge, and the moon's crescent leaves
the painted sky visible through its cutout.

## Integration review and validation

Reviewed the actual game beside the birch reference packet. The scene retains
Constable-like connected foliage and cloud marks, subdued rural distance,
selective corner plants and a modeled warm wooden foreground. Three test deer
at depths 36, 78 and 130 stand on readable open ground. The near and distant
silhouettes remain available to the scope; projected sight and hit masks stay
aligned. The scope background is smoothly enlarged paint, with the current
animal sprite's native detail in front.

Captures are produced by `tools/test-hunting-browser.cjs` in
`/tmp/hunting-game-v8-qa/`: `sunny-field.png`, `sunny-field-canvas.png`,
`scope-aim.png`, `dawn-field.png`, `noon-field.png`, `dusk-field.png`,
`night-field.png`, `phone-portrait.png` and `phone-landscape.png`. Reviewed
daylight, dawn, dusk and night, the wooden stand, the 6x lens and both phone
orientations. The whole field remains visible on phones, with the existing
44-pixel controls.

Validation completed:

- Syntax checks for hunting scripts and the new builder.
- Reference catalog: 14 paintings, 29 studies and six briefs verified.
- Scene builder and `--check`: three layer registrations, alpha contracts and
  export fingerprints passed.
- Campaign: eight checks passed, including the morning default and retained
  old saved times.
- Physics: 22 checks passed using all five deer and boar masks, wind, gravity,
  mirrored bodies, transparent gaps, finite visits and ambient wildlife.
- Browser: 100 checks passed, including actual rendered sun travel, display
  resolution, native layer loading, mouse and touch shooting, scope panning,
  reload, fullscreen, pause, saves, old saves and phone layouts. No script errors
  or missing local assets.
- `node tools/build-webp.mjs` created the new thumbnail WebP.
  `node tools/wrap-picture.mjs hunting-game.html archive.html` confirmed the
  existing picture wrappers.

The game's CSS and all four script queries use version 8. The preview in
`assets/thumbs/hunting-game-v8.{jpg,webp}` is a capture of the real scene, also
used by the In Progress card and social metadata.

## Remaining visual passes

Current deer and boar are the version 4 and 3 pixel sprites, with unchanged
collision alpha. Owls and squirrels, controls, scope graphics and effects retain
their existing rendering. They and Cypress need separate passes using their
catalog briefs. This delivered scene establishes the environment and foreground
direction; it does not complete the whole game's art conversion.

The painted cloud masses, grass and source cast shadows are static. Live time
adjusts light and the celestial marks; later weather or moving-plant work should
preserve these references and the clear hunting corridor.
