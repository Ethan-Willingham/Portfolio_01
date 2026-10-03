# First map: Birch Clearing

The next task is one complete base scene for the field the player lands in:
an original oil-painted view across a huge birch meadow from the current raised
lookout. This is a prepared brief, not an implemented map or an approved final
composition. The owner requested scenery as the first production step after
the reference infrastructure.

## References and jobs

Build `--brief birch-base`, then inspect these originals and detail studies:

| Priority | Painting ID | Job |
|---|---|---|
| Primary | `salisbury` | Connected left canopy, open meadow, sunlight and ground shadows, cloud structure |
| Secondary | `plowed-field` | Large sky masses, broad field depth, small distant detail |
| Secondary | `optevoz` | Quiet rural atmosphere, grouped foliage and tonal depth |
| Supporting | `stream` | Bark, pale soil, irregular edge plants and species-specific shapes |
| Supporting | `veteran` | Directional grass strokes and a coherent breeze |

Use the references for painting decisions. Keep the actual setting a birch
clearing; invent its landforms and trees. The cathedral, cottages, plowed farm,
human figures and wheat crop are not proposed game content.

## First composition to explore

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

This brief does not schedule a new map, change the hunt loop or replace animals.
It prepares the single starting-field scenery task requested next by the owner.
