# Warehouse lighting

The room starts at 4:30 a.m. with its three ceiling-light rows on. The exterior
is dark, and the high windows admit no direct sunlight until dawn. The opening
night reaches 7 a.m. in about 17 seconds. The clock then slows: 7 a.m. to sunset
takes nine real minutes. The following night takes 90 seconds. Sunrise is at
6 a.m., noon at 12 and sunset at 6 p.m.
The sun travels from the east wall, across the southern sky, to the west wall.
The 41-degree latitude gives a 49-degree midday elevation at this equinox setting.
Start time, latitude, day and night duration, light intensity and manual pause are Inspector fields on
`High warehouse daylight > Warehouse Day Night`. The clock stops on loss of focus.

## Switches and fixtures

Three surface-mounted industrial switches sit on the south wall beside the
entrance electrical cabinet. Aim at a switch within 2.6 metres and press E or
left-click after capturing the mouse. The west, centre and east rows each contain
four fixtures. Each circuit controls its own actual lights and emissive lenses.
The switch has a physical lever, an indicator and a mechanical click.

The twelve spotlights use distance falloff, a broad downward distribution and
soft real-time shadows. The roof fixture housings remain the existing geometry.
Fixture intensity is 26, peak sunlight is 2.35, and window shafts use 75 percent
of their former energy. Daytime ambient and luminous lenses are softer, while
the low night ambient remains unchanged.
Forward+ lighting allows all twelve fixtures to illuminate the combined room
meshes, without the eight-light-per-object limit. Additional shadows have a
4096-pixel atlas with 1024-pixel high-resolution slices. The rack shader supports
clustered additional lights and punctual shadow bias. The floor and pallet
materials use URP/Lit. There is no baked light remaining when a row switches off.

The room reflection probe captures the actual lighting in time-sliced 128-pixel
faces, every eight seconds and after a switch changes. Reflections can take several
frames to settle. The low night ambient keeps silhouettes readable with every
row off; it does not light the room as if the fixtures were still on.

## Sun and windows

The single real-time sun drives direct illumination, shadow direction, sky color,
ambient light and the sixteen window volumes. The actual openings, frames,
walls, roof, racks and stock cast and receive the moving shadows. At midday
the roof blocks direct sun except through the high windows. Low morning and
evening rays reach farther into the room.

Each sun-facing window updates both its sheared mesh bounds and shader inverse
matrix. Sparse dust follows those coordinates. Back-facing windows and all windows
at night render neither shafts nor illuminated motes. Near-grazing rays fade out
before the volume becomes singular. Camera depth and the main-light shadow atlas
clip the scattering against the room and its contents. This is a bounded dust
effect; it is not a full volumetric atmosphere or ray-traced global illumination.

## Rebuild and verify

Choose **One Shift > Install warehouse day and night** outside Play mode in
`RackFloor.unity`. It backs up and rebuilds the existing architecture while
retaining the floor, rack and player objects, then installs the rows and cycle.
The full rack-floor build and the walls-and-daylight installer also retain this
lighting setup. **Build Windows player** produces the local standalone game.

`WarehouseDayNightBuilder.Validate()` checks nine times across the cycle,
sun-facing volume selection and alignment, moving mesh bounds, twelve unique
shadowed fixtures, independent row states, switch reachability, midnight wrapping
and pause. It also checks the fast opening dawn, nine-minute day, faster night
and a continuous transition across morning at different frame intervals.
It restores the pre-test row states and night start in Edit mode.
The report is `Assets/RackLab/Reports/warehouse-lighting-validation.txt`.
Also inspect night, morning, noon and afternoon captures; verify all-off and each
row independently in Play mode, check the console, and run the floor and rack
movement checks. Source scripts live in `Assets/RackLab/Scripts`, with builders
in `Editor` and the sky shader in `Shaders`.
