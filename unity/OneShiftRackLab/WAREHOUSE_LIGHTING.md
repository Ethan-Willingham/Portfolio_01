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
of their former energy. Lens emission is a warm (.84, .80, .70), avoiding white
clipping in the browser while the fixture's actual light output stays at 26.
Daytime ambient is softer, while the low night ambient remains unchanged.
Forward+ lighting allows all twelve fixtures to illuminate the combined room
meshes, without the eight-light-per-object limit. Desktop additional shadows have a
4096-pixel atlas with 1024-pixel high-resolution slices. The rack shader supports
clustered additional lights and punctual shadow bias. The floor and pallet
materials use URP/Lit. There is no baked light remaining when a row switches off.

The exterior has six warm wall-pack spotlights that fade with the same
`WarehouseDayNight.Daylight` value as the sky. The v8 office uses two broad point
fills, each at intensity 13 with a 6.2 m range. They light the upper partitions,
ceiling and single computer workstation. The former short downward cones left
the room's vertical surfaces dark. These eight lights are unshadowed; the worker's real
shadows come from the existing sun and twelve warehouse fixtures. They add no
shadow maps or reflection probes, and do not request extra reflection captures.
Inspect office light spill and exterior visibility at night when tuning them.

V9 retains this lighting budget in both Career and Sandbox. The career courier
adds no lights or reflection probes. Carton and floor-guide materials are retained
in Resources for WebGL; their shaders do not add a lighting pass. The monitor's
physical bezel and screen are included in the existing office material batches.
Its close-up camera transition uses the existing game camera. The singing fish
and flame decals add geometry only when bought; the decals sit 3 and 5 mm above
the forklift's actual flat service panels, avoiding overlapping paint surfaces.
Runtime-created bay labels, carton labels and the fish plaque bind to the same
depth-tested font material as the authored signs. Each scene shares one material
per font and refreshes its texture when Unity rebuilds the font atlas.

The desktop room reflection probe captures the actual lighting in time-sliced 128-pixel
faces, every eight seconds and after a switch changes. Reflections can take several
frames to settle. The low night ambient keeps silhouettes readable with every
row off; it does not light the room as if the fixtures were still on.

The browser export retains all twelve shadowed fixtures and the moving sun.
Its main shadow map is 2048 pixels with two cascades, a 25 percent near split and
a 60-metre range. The fixture atlas remains 1024 pixels. In v8,
`WarehouseShadowBudget` gives the three fixtures nearest the camera 512-pixel
slices and the other nine 128-pixel slices, totaling 933,888 requested texels
inside the existing 1,048,576-pixel atlas. Distance selection runs every 0.4
seconds with hysteresis to avoid changes from small camera movement. The three
near fixtures and the sun use medium soft-shadow filtering; the remaining
fixtures use low filtering. All twelve lights still cast shadows. This spends
detail on nearby stock and the worker without increasing every map or adding
shadow-casting lights. The export maps URP's High tier to 512 and Low to 128.
The runtime changes only the serialized tier on `UniversalAdditionalLightData`
through `JsonUtility.FromJsonOverwrite` when a light changes priority. This
version of Unity rejects pixel counts in the native `Light.shadowResolution`
enum, despite the older custom-resolution path still present in URP. The
moving-camera check verifies both allocations and unchanged independent light
settings; the browser diagnostics expose the actual tier and atlas values.

The browser uses 2x MSAA plus medium SMAA and downsampled contact
shading with four samples, medium normal reconstruction and medium blur.
The time-sliced reflection faces are 64 pixels and periodic captures occur
every twenty seconds. Switch changes and explicit clock changes still request
a fresh capture. Normal clock advancement does not request extra cubemaps on
slow frames. The builder restores the desktop pipeline and contact-shading
assets after export.

The browser launcher defaults to Smooth, capping the drawing buffer at
2,073,600 pixels and a pixel ratio of 1.25. Sharper in Controls raises those
limits to 3,686,400 pixels and 1.5. This prevents a Retina display from silently
quadrupling the render workload. It does not change the layout, camera view or
physics timestep. The actual gain still needs measurement on target Macs.

The browser prepares actual rendered night, dawn, morning, afternoon and
all-rows-off variants behind the loading screen, including completed room
captures. The v8 preparation retains seven stages and reports the current
lighting phase and view. Its four lit phases visit eight views, including the
street truck, office, business park and worker shadows. The remaining stages
cover both all-off lighting states, the fork visibility overlay, and restoration
of the opening view, reflection and 4:30 clock. Truck movement, physical freight
and the simulation clock remain frozen throughout. Preparation yields before
each work label so the browser can paint it before shader work begins.
This addresses the first-use shader-link stalls measured
in Chrome on the Windows workstation. Periodic live reflections remain enabled;
the long trace did not show continuing stalls after the opening variants had
linked. The v6 Chrome trace confirmed 2x multisampling and SMAA, with no long
tasks or frame intervals over 50 ms in 90 seconds after preparation, including
the first held-X mouse operation. The largest interval was 20.8 ms on the
Windows RTX 3080 workstation. Recheck the exported player after rendering edits.
The following measurements are historical, not results for the v8 changes.
The final v7 player was measured in two 90-second Chrome runs at 1800 by
1125 pixels on that RTX 3080 workstation, including first entry and native
X/mouse use. Both confirmed 2x MSAA and SMAA. The first prepared in 27.68 seconds
and had a 7 ms median, 14 ms 95th and 99th percentiles, ten frames over 50 ms,
eight long tasks and a 333.3 ms maximum. Stalls clustered around 4.9 to 6.3 seconds
and 18 seconds, with no established cause. An isolated repeat prepared in 34.60
seconds and had a 7 ms median, 14 ms 95th percentile, 14.1 ms 99th percentile and
34.7 ms maximum, with no frames over 50 ms or long tasks. Neither recorded a
blocking WebGL call over 20 ms. These measurements apply to this machine.

The sun has explicit URP additional light data with pipeline bias inheritance
disabled, so its .018 depth and normal biases take effect. The 60-metre shadow
range keeps the thin corrugated roof and walls inside the shadow volume. Editor
A/B captures at morning, noon and afternoon, from opposite room views, removed
the bright strips seen at the previous 40-metre cascade boundary. The shell
geometry and material brightness remain unchanged. Apply the focused repair
with `WarehouseLightingRepair.Install()` without rebuilding the receiving scene.

The v8 surface repair also removes sources of flicker that are independent of
shadow resolution. Road and apron rectangles now meet at their boundaries.
Previously, visitor parking overlapped the front road and foundation apron,
while both side drives overlapped the crossing streets at the same top height.
The dock bridge now sits in a recessed concrete seat: the old apron coincided
with 0.71 m of its steel top. The plate ends at the trailer deck edge at
z=13.19. The office west partition and north doorway pier also meet without
overlapping top faces. `WarehouseSurfaceAudit.Validate()` checks these authored
slabs and the office junction; it does not claim to inspect every triangle of
the original imported vehicle and pallet models. The first installed v8 audit
passed 19 slabs and 88 matching-height comparisons.

## Sun and windows

The single real-time sun drives direct illumination, shadow direction, sky color,
ambient light and the sixteen window volumes. The actual openings, frames,
walls, roof, racks and stock cast and receive the moving shadows. At midday
the roof blocks direct sun except through the high windows. Low morning and
evening rays reach farther into the room.

The sky shader draws the sun disc from that exact light direction, with warm
twilight, sparse stars and one layer of analytic clouds. Cloud drift follows
the game hour continuously across midnight, so pause and inactivity freeze it
with the sun. It uses one sky pass without cloud textures, cloud meshes or
volumetric ray marching. Clouds do not cast an additional moving shadow layer.

Each sun-facing window updates both its sheared mesh bounds and shader inverse
matrix. Sparse dust follows those coordinates, with one particle upload per
frame rather than a second upload from the clock update. Back-facing windows and all windows
at night render neither shafts nor illuminated motes. Near-grazing rays fade out
before the volume becomes singular. Camera depth and the main-light shadow atlas
clip the scattering against the room and its contents. This is a bounded dust
effect; it is not a full volumetric atmosphere or ray-traced global illumination.

## Rebuild and verify

The v10 WMS keeps this light and shadow budget. Its three rack rows reuse the
authored geometry and materials. Cartons use shared meshes and materials, real
shadows and sleeping rigidbodies after settling. Since v11, Code128 label bars
and text remain enabled at every distance; normal frustum and depth tests apply.
The first-person TC22 updates its live text at 5 Hz. The handheld,
cartons, bin markings and labels introduce no lights. Profile the populated
Sandbox browser build when changing this system; the earlier mostly empty
warehouse traces do not establish the cost of its 102 opening cartons.

The v10 populated 90.014-second browser profile on the local RTX 3080 uses an
1800 by 1125 canvas with 2x MSAA and SMAA. Active presentation intervals measure
6.9 ms median, 9.5 ms p95, 12.8 ms p99 and 36.1 ms maximum, with none above
50 ms and no measured long tasks. The two TC22 selection pauses are identified
from independent frame observations and reported separately. These are browser
presentation intervals, not GPU execution times or minimum-hardware guarantees.
All 102 physical cartons remain accounted for after walking, panning and scans.

Choose **One Shift > Install warehouse day and night** outside Play mode in
`RackFloor.unity`. It backs up and rebuilds the existing architecture while
retaining the floor, rack and player objects, then installs the rows and cycle.
The full rack-floor build and the walls-and-daylight installer also retain this
lighting setup. **Build Windows player** produces the local standalone game.
The receiving-start marker preserves the north dock opening when rebuilding
the shell. A full rack-floor rebuild restores the asset trial; restore
**Install receiving warehouse start**, followed in order by
`WarehouseOfficeBuilder.Install()`, `WarehouseBusinessParkBuilder.Install()` and
`WarehousePlayerBuilder.Install()` to rebuild the public layout. The office
marker also preserves its south opening during later shell rebuilds.

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
The office, business-park and worker builders each provide `Validate()` checks;
`WarehouseFrontOfficeValidation.ValidateAndSave()` covers parcel lifecycle and
door obstruction on a temporary copy. Capture the entrance and worker shadows
at dawn, noon and night, then rerun the actual browser performance trace after
rendering changes. The final v7 export had zero build errors and 42,305,038
compressed bytes; its office walkthrough passed 22 checks and the launcher
passed 40 simulated-loader checks. The earlier 64-check v7 gameplay pass
preceded the final small rendering and HUD fixes.
For v8, also run `WarehouseSurfaceAudit.Validate()`,
`WarehouseReceivingValidation.ValidateRoadRoute()` and
`WarehouseReceivingValidation.ValidateAndSave()` after the installers. Capture
the office at night and daylight, and compare nearby worker, pallet and rack
shadows while walking between fixtures. Repeat the browser performance trace
after exporting; the older v6 and v7 traces do not validate the new shadow budget.

The final v8 player confirms the 1024-pixel fixture atlas with three 512-pixel
nearby slices and nine 128-pixel distant slices. An Editor camera audit verified
that the detailed slices move to the opposite end of the room while preserving
independent light settings. The surface audit passed 88 same-height comparisons
across 19 slabs. The compiled office walkthrough passed 43 checks; office night
and daylight captures were inspected. The corrected shell passed 18 focused
fullscreen checks without graphics errors and 85 simulated-loader checks.

A 90.04-second v8 Chrome trace on the RTX 3080 at 1800 by 1125 pixels included
first forklift entry, training and native Left Shift lever operation. It confirmed
2x MSAA and SMAA and measured 7 ms median, 13.9 ms 95th percentile, 14 ms 99th
percentile and 20.8 ms maximum. There were no frames over 50 ms, long tasks or
blocking WebGL calls over 20 ms during play. Startup took 29.98 seconds; the
longest gap between fine preparation callbacks was 9.71 seconds. These results
apply to this workstation and do not establish performance on other hardware.
