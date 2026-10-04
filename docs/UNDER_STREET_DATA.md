# What's Under a Saint Paul Street: data notes

The published post and explorer cover Saint Paul city limits only. The map opens on the Trout Brook and district storm routes. The October 3,
2026 release contains 40 selectable layers, 44 downloadable datasets and four
photographs of exact mapped sites. Source snapshots vary in age; the retrieval
or clipping date does not establish the condition of an asset today.

## Scope and source files

- `archive/under-the-street/assets/map/datasets.json` records source URLs, native
  fields, dates, terms, caveats, geometry counts, file sizes and SHA256 hashes.
- `cities.json` contains the official Metropolitan Council municipal polygon for
  `CTU_NAME = 'St. Paul'`. `city-boundary.js` provides the same polygon before map
  startup so drawing and address filtering use the actual city boundary.
- Every retained vector geometry is intersected with that polygon. Crossing
  segments stop at the boundary. Original record IDs and attributes remain intact;
  an original length field can refer to a complete segment before clipping.
- Invalid geometries are repaired with GEOS. Shapes reduced to a lower dimension
  are omitted; three zero-length interceptor lines are excluded for this reason.
- The depth raster is cropped to the city extent. Cells whose centers fall outside
  Saint Paul are null. Canvas clipping prevents edge cells or aerial tiles from
  displaying outside the municipal polygon.
- Other municipalities' layers, reference exports, tile indexes, photographs and
  named destinations have been deleted from the published assets.
- Old regional URLs outside the city open the city overview. Removed layer IDs
  fall back to the selected system's defaults. An explicitly empty layer list
  remains empty. Address search rejects candidates outside the exact polygon.

## New public records

| Dataset | Saint Paul records | What it establishes |
| --- | ---: | --- |
| Trout Brook interceptor | 6 route segments | Published storm-interceptor alignment |
| District storm pipes | 60 segments | RWMWD alignments, original size/material/year fields |
| District storm structures | 90 points | Recorded intake, outlet, manhole, drop-shaft or other type |
| District storm ponds | 4 polygons | District-owned stormwater basins |
| Public hydrants, December 2021 | 6,441 points | Published hydrant locations and identifiers |
| City traffic-signal connections | 1,407 lines | Signal connections classified by their published type |

Trout Brook comes from Capitol Region Watershed District's anonymous public
[interceptor view](https://services1.arcgis.com/7OeMclmTSGm7zTuf/arcgis/rest/services/TroutBrookInterceptor_Public_view/FeatureServer/2).
That view supplies geometry and ObjectID; it does not supply diameter, burial depth
or material. The [district history](https://www.capitolregionwd.org/our-water/stormwater-runoff/trout-brook-storm-sewer-interceptor/)
establishes its stormwater use, separation in 1988, ownership and inspection photos.

The [Ramsey-Washington inventory](https://services1.arcgis.com/akJvlMqEfOC1yVhp/arcgis/rest/services/Infrastructure_DistOwned/FeatureServer)
supplies layers 0, 1 and 4. These are district-owned assets, including Saint Paul
Beltline, Battle Creek and Fish Creek records. They are partial municipal coverage.
Size and elevation units and the vertical datum are absent from the public field
metadata. Preserve the supplied values without inventing inches, feet or a datum.
RCP receives a reinforced-concrete type link. Native source fields remain in each
record and additional fields appear in a folded inspector section.

[SPRWS public hydrants](https://services9.arcgis.com/OhApV2tSBivqSpuX/arcgis/rest/services/Public_Hydrants_2021_View/FeatureServer/0)
use `FID` as the service ObjectID field. A hydrant point does not establish the
alignment or size of a water main. Keep the December 2021 snapshot date visible.

[City signal connections](https://services1.arcgis.com/9meaaHE3uiba0zr8/arcgis/rest/services/pwTrafficSignalLines_COPY/FeatureServer/35)
include 1,297 fiber, 65 copper, 31 empty, six radio, four low-voltage, two abandoned,
one overhead low-voltage and one unclassified record. Radio is not cable. Empty
conduit does not establish an installed cable. These routes do not establish burial
depth, current operation or a home's internet service. Abandoned records are hidden
until the inactive-record switch is enabled.

## Other retained records

The city extracts include 1,203 MCES interceptor segments, 38 flow meters, three
lift stations and the Metro treatment plant. Source lifecycle and flow types remain
separate: gravity, force main, inverted siphon, treated effluent and former records.
The city also intersects two plant service-area polygons; that does not mean two
plants stand inside Saint Paul or trace a property's complete sewer route.

Other sources include nine OSM tower records, 55 transmission lines, 33 mapped
local electric lines, 11 substations, five EIA plant sites and 14 generator records,
32 tagged pipelines, a data-center record, a telephone-exchange record, 13 legacy
telephone territories and 73 rail inventory segments. OSM and EIA records can
refer to the same site without sharing an identifier. Capacity is nameplate capacity,
and source status is not a live production reading.

Ground layers include six bedrock polygons, 51 surficial-geology polygons, 1,816
located well or borehole records and 1,224 cleanup or tank records. MPCA groundwater
areas, source areas, boundary certainty and project anchors stay separate. Source
well codes distinguish monitoring, exploration and supply wells; an interpreted
bedrock depth is not automatically a direct measurement. The 2025 MGS depth model
retains 9,953 non-null browser cells, sampled at about 120 metres from its native
30-metre model. A modeled depth is not a utility burial depth.

The download of named street context contains 12,597 Saint Paul centerline records
from MnGeo's opt-in compilation. It is separate from the infrastructure layers.
Its 56 disjoint neighborhood tiles carry the exact clipped records and native
`roadseg_id` values. The browser loads them above zoom 13.2, retains a bounded cache,
and displays the published street names. The complete city download is lossless gzip.

## Photographs and type links

`media.json` retains only Highland Park Water Tower, District Energy Saint Paul,
the High Bridge gas plant and a Metro plant aerial crop. Their verified coordinates
lie inside the city. A photograph matches its named site or a close coordinate and
compatible feature type. No generic illustration is passed off as the selected
pipe, hydrant or network. Credits, license links and source-date notes appear with
photographs and in the enlargement dialog.

The historical Highland tower is no longer in water-storage service. Its photograph
is from December 2006. The district plant photograph is from July 2020, and the
High Bridge gas-plant photograph is from June 2024. The Metro aerial comes from a
2017 to 2021 USGS/USDA mosaic refreshed in June 2024; the exact frame date is unknown.

Wikipedia links follow the selected record's actual type where established:
reinforced concrete, optical-fiber cable, radio, empty conduit, manhole, outfall,
force main, monitoring well, generator technology and the published bedrock map unit.
A separate place link appears when a named site's article is available.

## Coverage gaps

These public snapshots do not supply complete current city water-main, local
sanitary-sewer, storm-drain, gas-distribution or residential-fiber networks. The
2021 Hillcrest PDF is linked as published project-area evidence, without invented
traces. The old 2014 storm-drain KML was not recovered and is not fabricated here.
The owner's SPRWS access request is separate from these anonymous public exports.
A blank street means no route in the retained sources; it does not mean no utility.

## Reproduction and checks

`tools/under-street/build-saint-paul.py` is the publication build. It requires
Shapely and pyproj. Supply a preserved source-acquisition directory with `--input`;
it clips retained sources, queries all six new anonymous layers by native ObjectID
in batches, regenerates city street tiles and removes out-of-scope published assets.
Historical acquisition tools do not define the current published scope.

Run these from the repository root:

```sh
python tools/under-street/build-saint-paul.py --input /path/to/source-archive
node tools/under-street/test-data.cjs
python tools/under-street/test-scope.py
node tools/under-street/test-explorer.cjs
node tools/under-street/test-explorer-deep.cjs
node tools/under-street/test-map-context.cjs
node tools/under-street/test-locator.cjs
node tools/under-street/test-compression.cjs
```

The data checks verify hashes, complete record counts, full geometry coverage,
raster centers, native fields, dimension preservation and exact disjoint tiles.
Browser checks cover all 40 layers, source/type panels, inactive records, deep links,
city-only inspection, six-size address search with a live civic query, street-cache
travel and retries, photograph focus restoration and lossless gzip fallback.
The normal laptop checks include 1512 by 820, 1440 by 760 and 1280 by 720 CSS pixels
without fullscreen. Test harnesses own and close Chrome for Testing processes.
