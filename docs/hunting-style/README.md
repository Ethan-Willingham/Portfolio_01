# Hunting Game visual reference

Every visible part of Hunting Game is to take its art direction from the 14
paintings in [the owner's gallery](https://ethanwillingham.com/gallery.html).
This is the owner's instruction of 2026-10-03. It covers all maps, all animals,
the interface, equipment, effects, loading and error states, and future assets.

The paintings are the permanent visual reference. The initial interpretation
below can be refined with the owner as actual game art is reviewed. The old
pixel art describes shipped history, not the target for new visual work.

## Start each visual task here

1. Read this guide and `../HUNTING_GAME.md`. Read `../../STYLE.md` for interface
   color, type and components. `../HUNTING_ART.md` records the old asset pipeline.
2. Run `node tools/hunting-art-reference.cjs --check` from the repo root. It uses
   Node's standard library and checks all painting paths, fingerprints, gallery
   membership, study regions and reference briefs. A mismatch requires inspection
   and a deliberate catalog update; do not silently accept changed references.
3. Build the matching reference packet with `--brief birch-base`, `cypress-base`,
   `animals`, `ui`, `atmosphere`, or `effects`. `--brief all` shows all 14 works.
   Packet export requires Sharp from the bundled Node packages:

   ```sh
   NODE_PATH=/path/to/node_modules node tools/hunting-art-reference.cjs --brief birch-base
   ```

4. Open the packet's `reference-board.html` and inspect its full paintings and
   named detail crops. Open the primary original JPGs before generating or drawing
   art. `packet.json` supplies absolute source paths for tools that accept reference
   images. Attach those real images to generation, along with the specific lessons.
5. Fill `ASSET_BRIEF_TEMPLATE.md` for the task. State which painting supplies
   composition, form, light or materials. Reuse `prompt.md` as a starting direction;
   it is not a complete subject or technical specification.
6. Review the result beside its references and within the live game at its actual
   scale. Record the final prompt, source files, reference IDs, processing, runtime
   destinations and validation in an asset brief beside the new masters.

Packets default to `research/hunting-art-reference/<brief>/` in the checkout's
existing ignored research directory. Use `--out` for another
directory. Generated boards, crops and contact sheets are disposable reference
tools. The catalog, guide, first-map brief and exporter are the durable source.
The board embeds its images and fonts and needs no web server or image downloads.

## What the paintings share

The target is naturalistic oil painting with an original hunting scene. Build
the composition from a few large shapes, give those shapes volume through light,
and spend the finest detail where a person looks. Light and air connect the sky,
ground and animals.

The gallery spans several approaches. Caravaggio's close figures, Bouguereau's
smooth modeling, Homer's directional wheat, Constable's broken foliage, Turner's
atmosphere and Aivazovsky's luminous water should contribute different jobs.
The catalog preserves every painting's observations, use and limits instead of
averaging the collection into one texture.

| Element | Primary references | What to carry into the game |
|---|---|---|
| First field | Salisbury, Plowed Field, Optevoz | Asymmetric tree framing, quiet open ground, horizontal depth, large sky shapes |
| Plants and earth | By the Stream, Salisbury, Veteran | Distinct bark and plant shapes, grouped marks, coherent wind, selective foreground detail |
| Other maps | Optevoz, By the Stream, Venice | Shared paint treatment with different ecology, still water and broken reflections |
| Deer, boar, owls, squirrels | Breton Siblings, Lemons, Musicians | Modeled anatomy, warm and cool planes, selective precision, material-specific coats |
| Animals at field distance | Salisbury, Optevoz | Small grounded silhouettes with only enough detail for their scale |
| Sky and ordinary daylight | Salisbury, Plowed Field, Venice | Connected clouds, colored shadows, pale distance and localized sunlight |
| Dawn, dusk and weather references | Proserpine, Shipwreck, Dutch Boats, Ninth Wave | Broad atmosphere, directional movement and concentrated light |
| Interface and equipment | Musicians, Marseille, Breton Siblings | Dark grounds, cream highlights, wood and cloth, grouping and readable focal detail |
| Effects | Shipwreck, Dutch Boats, Ninth Wave | Brief directional marks and a few bright edges that belong to the scene |

These are art-direction interpretations from visual inspection. The gallery's
portraits are useful for living form, but they do not supply deer, boar, owl or
squirrel anatomy. Pair them with appropriate species references when creating
those assets. The gallery also has no dedicated night landscape; a night palette
will need an explicit visual review when that pass is built.

## Composition, paint and depth

- Group a canopy before painting leaves. Vary branches, gaps and crowns. Repeated
  triangles, identical ellipses and evenly stamped leaf clusters need replacement
  in the eventual visual pass.
- Keep near plants darker, larger and more specific. Reduce contrast, saturation
  and edge definition toward distant land without applying one blur to everything.
- Reserve quiet ground for animals. Frame the corridor from the sides rather than
  covering it with grass marks, reeds or a decorative foreground silhouette.
- Let edges become lost where adjacent forms share shade. Keep the eye, muzzle,
  antler forks and relevant leg separations readable where light permits.
- Make marks follow form: grass with wind, fur over muscle, clouds around their
  volumes, reflections across the water. Random noise is not a paint treatment.
- Match the whole scene's light direction, shadow temperature, ground contact and
  atmosphere. A smoothly modeled animal belongs beside a broader painted landscape
  when both share those conditions.
- Do not reproduce photographed frames, age cracks, signatures or labels. Do not
  place a painting behind the old assets and call the whole game restyled.

## Color and materials

Use earth and vegetation as the large color families: umber shadows, warm gray,
olive and sage, ochre grass, cream light and muted blue distance. The originals
also contain strong blue, crimson, yellow, orange and green. Use those where the
specific light or material earns them; avoid reducing the entire collection to
brown. Dawn warmth must not become a filter applied to every hour.

Reference packets show an average color for each named study crop. Those swatches
are measured from the digital reproduction and summarize that crop; they are not
the painter's pigments, an authoritative color match, or ready-made UI tokens.
Review actual image regions before selecting a scene palette.

The surrounding page retains the shared dark-green background and three fonts.
Inside the game, artwork uses the reference paintings' colors. HTML controls use
the site's tokens wherever they fit and any needed game-local tokens remain scoped
to the game. No shared palette change is needed for painted blue sky or gold grass.

Distinguish materials through mark and edge, not a different art style: broken
bark, soft fur, layered feathers, broad cloth folds, worn wood grain and a few
hard metal highlights. A single glossy shader across every material will miss
the references.

## The whole interface is included

The visual pass must include the field toolbar, clock and time control, ammunition,
wind, scope and reticle, flight inset, aim and fire actions, reload, pause, More,
field choices, settings, records, empty records, loading, reload prompt, save
failure, focus and hover states, touch states and fullscreen presentation. Include
any future map chooser, illustrations, thumbnails and in-game help in the same
reference workflow.

Keep quiet surfaces with a clear hierarchy, cream live text and restrained edges.
Wood and cloth references can inform texture or illustrations where useful. The
paintings do not require ornate gilt frames, fake antique parchment, a museum
menu, distressed labels or a new decorative typeface. Paint textures must not
obscure text, focus or button states. Use Century Supra for titles, Segoe UI for
actions and prose, and Commit Mono for measurements and compact data.

Maintain readable contrast, keyboard focus and at least 44-pixel touch targets.
Small icons, the reticle and data can use crisp vector or CSS geometry to remain
usable, with the same color and visual restraint as the painted scene. Interface
labels stay real text. Reuse the existing watching, time and shooting flow.

## Rendering and asset migration

Birch Clearing now uses the first painted scene, with separate sky, transparent
landscape and close wooden hunting-stand layers. Original sky and stand masters
live in `assets/hunting/source-v8/`; current terrain detail, prompts and review
live in `assets/hunting/source-v9/`. `tools/build-hunting-scene.cjs` and
`tools/build-hunting-detail.cjs` export smooth WebP imagery without the old
palette or binary-alpha conversion. The logical
projection stays at 640 by 360; display rendering uses the viewport and device
pixel ratio, capped at 2560 by 1440. The landscape's source skyline is registered
to the projected horizon with uniform scaling. Sky and scenery share the scope's
camera, while the stand stays in the unscoped foreground.

The current renderer uses a 2048 by 1152 overview in the wide view and 14 overlapping
painted tiles in the scope. Each tile contains new native detail for a small
registered crop, giving the terrain about 6183 by 3481 pixels of effective
density. Only intersecting scope tiles are drawn, with at most six decoded
images retained. Do not replace this with an enlargement of the overview.

Owner correction, 2026-10-03: keep the artwork's original brightness and color.
Version 10 draws painted sky, terrain, tiles and stand directly from their
source images. Do not reintroduce clock-dependent dimming, saturation filters,
cool or brown overlays, or shading inside the lens. This applies at every hour.
The live sun, moon, stars and clock remain active. A future night composition
needs its own painted asset and visual review, rather than a blanket dark filter.

The scene is the first step, described in `FIRST_MAP.md`. Cypress scenery, animals,
ambient wildlife, the interface and effects still need their own painting passes.
Use the relevant packet for each pass and preserve the live hunting loop.

The old builder forces nearest-neighbor resizing, palette quantization and binary
alpha. Those were pixel-art choices. Do not send new painterly masters through
that builder by habit. Preserve full-resolution masters and record deliberate
export settings in the new asset brief. Choose the runtime resolution, filtering
and layer strategy after comparing native wide view with the final 6x scope view.

The current view uses a 640 by 360 logical coordinate system, horizon at y = 144,
an eye 12 world units above the ground and live depth projection. These define
input and ballistics, not a requirement that future paintings contain only 640
pixels. A single flattened low-resolution background magnified by the scope may
lose the detail this direction needs. Use adequate source detail and separate
layers where appropriate. Decide how live plants and sky marks match the scenery
before rendering over it.

Animal alpha currently supplies the actual hit mask. Any future soft edge policy
must specify what counts as visible and hittable. Keep source dimensions, physical
size, facing, shoulder coordinates, masks and the scope aligned. Check transparent
gaps between legs and antlers, all five deer identities, and both orientations.
Painterly presentation must retain readable animals without adding marker outlines
or glowing targets.

Hunting Game supports portrait and landscape phone views. Use one coherent scene
and keep its important area visible across aspect ratios. The Sluice-only rotate
gate does not apply. Keep the sun live and the clock, finite visits, arrival easing,
scope, projectile path and saved state intact through visual changes.

## Review each delivered asset

An asset is ready when the following evidence is present in its brief:

- Named catalog references and specific lessons visible in the result.
- A side-by-side image review with the primary paintings, including the whole scene
  at small size and any focal details at scope scale.
- Matching light, edge treatment, material and depth when placed beside other assets.
- Clear silhouettes and quiet animal ground at native field scale; legible scope,
  text, button states and projectile motion at play scale.
- Dawn, midday, dusk and night review for scenery or animals; desktop and both phone
  orientations for anything visible in those layouts.
- Relevant checks from `HUNTING_GAME.md` when runtime code, collision or input changes.

If the gallery changes, inspect the added or replaced originals, update the notes,
fingerprints and brief mapping, then rerun `--check`. Retain past asset briefs so
the references used for an earlier generation remain traceable.
