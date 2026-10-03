# First map: Birch Clearing

Birch Clearing is the first implemented painted scene: an open, quiet birch
meadow seen from inside a raised wooden hunting stand. On 2026-10-03 the owner
asked for an easy level-one feeling and a foreground that makes the stand clear.
Short grass, gentle landforms and bright morning light make the first field
welcoming. A low shooting rail, edge posts, corner braces and floorboards establish
the player's shelter without filling the animal corridor.

The generated masters, complete prompts, export manifest and completed review
are in `../../assets/hunting/source-v9/`, with the original sky and stand
in `source-v8/`. The owner requested finer zoom detail and brighter light after
reviewing the first scene at 06:47. Version 9 supplies 14 registered native
detail tiles, a compact wide overview and a gentler dawn exposure curve.
Fresh saves begin at 08:00; existing
saves retain their time. Progression and ballistics use the existing tuning.

## References and jobs

Build `--brief birch-base`, then inspect these originals and detail studies:

| Priority | Painting ID | Job |
|---|---|---|
| Primary | `salisbury` | Connected left canopy, open meadow, sunlight and ground shadows, cloud structure |
| Secondary | `plowed-field` | Large sky masses, broad field depth, small distant detail |
| Secondary | `optevoz` | Quiet rural atmosphere, grouped foliage and tonal depth |
| Supporting | `stream` | Bark, pale soil, irregular edge plants and species-specific shapes |
| Supporting | `veteran` | Directional grass strokes and a coherent breeze |
| Foreground | `musicians` | Modeled wood, warm and cool planes, restrained highlights and dark crevices |

Use the references for painting decisions. Keep the actual setting a birch
clearing; invent its landforms and trees. The cathedral, cottages, plowed farm,
human figures and wheat crop are not proposed game content.

## Composition and registration

Use the existing 640 by 360 view as the layout guide. Retain the projection's
horizon at y = 144 (40 percent of the logical height). Michel's very low horizon
is a lesson in sky scale, not an instruction to move the game's ground plane.

- Sky: broad, uneven cloud forms above the distant land. Leave space for the live
  sun to travel visibly through the day.
- Far distance: a subdued tree line and shallow land layers. Avoid equal-height
  trees or repeating waves. The land should feel wide before detail is added.
- Middle field: open grass with a few broad sun and shade bands. Reserve roughly
  x = 18 to 82 percent and y = 40 to 75 percent as a starting quiet area for
  animal visibility; verify it against actual near and far animal positions.
- Left edge: birch trunks and one irregular canopy group, allowing sky holes
  and a clear route into the meadow. Preserve the field's raised viewpoint.
- Right edge: lower, lighter vegetation so the scene stays asymmetric and open.
- Near ground: a limited number of specific grass clumps, rough bark and earth
  marks. Let their direction agree with the wind. Avoid covering the center.

Those proportions are initial art-direction suggestions. Actual projection,
animal placement, scope coverage and phone aspect ratios decide the final framing.
Start with broad values and a single daylight composition before adding texture.

The shipped terrain master places its skyline at 44.4 percent. The renderer
uniformly scales it by 1.079 and anchors its bottom to the logical view, placing
that skyline at y = 144. This crops a small amount of the top and side edges,
retains the source's brush proportions and fills the ground to the bottom. The
stand's low rail is reviewed against actual approaching animals and is omitted
inside the scope. The same stand foreground also appears at Cypress Edge.

## Production contract

Keep the sky, distant land, middle ground and near plants separable when that
helps live lighting and the scope. Preserve a high-resolution source. Decide
whether each layer is painted imagery, canvas marks or a mixture after looking
at a prototype through the actual scope. Current geometry and input stay aligned.

Do not bake animals, a sun or moon, cursor, reticle, scope mask, text or interface
into the scenery. Review the source without display overlays, then in the live
field. A daylight image also needs a deliberate plan for dawn, dusk and night;
one opaque tint over it can erase the light relationships being studied.

The first scene becomes the quality reference for the later UI and animal passes.
Existing animals and controls can be used to test placement while those passes
are still pending. Record that temporary mismatch rather than treating it as the
final game-wide style.

## Acceptance evidence for the map task

1. A coherent full scene with recognizable birch ecology, open field depth,
   asymmetric framing and specific painting references visible in its treatment.
2. Native wide and final 6x scope captures demonstrating enough source detail and
   consistent scenery, without an enlarged pixel-art background.
3. Near and far deer placement that remains readable and agrees with projected
   ground contact and the existing sight ray.
4. Dawn, midday, dusk and night captures with the live sun or moon separated from
   scenery; the sun still moves with fast-forward.
5. Desktop, phone portrait and phone landscape captures with usable controls and
   the important field area visible.
6. The relevant simulation and browser checks from `HUNTING_GAME.md`, plus the
   completed asset brief with source files, final prompt and export settings.

The first scene establishes the environment treatment. Animals and the remaining
interface retain their current art while their separate visual passes are pending.
