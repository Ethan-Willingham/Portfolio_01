# What's Under a Saint Paul Street: data notes

The published post and explorer cover Saint Paul city limits only. The map opens
on All lines. The October 6, 2026 interface combines fourteen utility-line
sources and 3,331 records and drawing fragments, with visible counts and coverage gaps for six systems.
The retained city snapshot contains 46 selectable layers, 50 downloadable datasets and four
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
depth, current operation or a home's internet service. All lines includes
abandoned records, radio links and empty conduit, each with its
source classification. In the separate Cables system, abandoned records are hidden
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
sanitary-sewer, storm-drain, gas-distribution or residential-fiber networks.
Six dated line exports have now been recovered from the 2023 St. Thomas PDF.
These provide partial water and local sanitary geometry, with explicit drawing
dates and approximate registration. Additional Hillcrest, St. Albans, Crocus
Place and Ford drawings are linked without fabricating their georeferencing.
The old 2014 storm-drain KML was not recovered.
A GitHub and GitLab repository search found no verified complete public route
export; search limitations and rejected candidates are recorded below.
A blank street means no route in the retained sources; it does not mean no utility.

## All lines inventory

| System | Retained line records | Limits |
| --- | ---: | --- |
| Drinking water | 86 | May 2023 St. Thomas drawing fragments only; no citywide current main network |
| Sewage | 1,247 | 1,203 MCES records and 44 St. Thomas drawing fragments |
| Storm drains | 223 | 76 public GIS records and 147 St. Thomas drawing fragments |
| Gas / unidentified pipelines | 77 | Two gas-tagged and 30 unclassified GIS pipes, plus 45 gas drawing fragments |
| Power | 195 | 88 GIS records and 107 electric drawing fragments; incomplete coverage |
| Cables | 1,503 | 1,407 signal connections and 96 campus telecom drawing fragments |

Counts describe source records and drawing fragments, not unique installed pipes or cable runs. The
interceptor export includes 1,112 online, 64 abandoned, 22 removed and five offline
segments. All lines shows the former records with their retained status and style.
No point, polygon, raster, facility photograph or aerial image is shown in this
view. Dim street centerlines and the city outline provide navigation context.
All fourteen utility sources load at city scale. Group and source switches are
independent of the separate system tabs, and survive a copied map link.

## Recovered public drawings, October 6, 2026

The [city-hosted UST environmental review](https://www.stpaul.gov/sites/default/files/archive/ustarenaeaw062023.pdf#page=56)
contains an Existing Conditions Plan dated May 10, 2023 on PDF page 56. Its original
CAD layers survive as PDF optional-content groups. Six published exports retain
525 drawing fragments: 86 water, 44 sanitary, 147 storm, 45 gas, 107 electric and
96 telecom. They are dashed in the map and each inspector identifies the drawing
date, PDF page, original CAD layer, extraction identifier and unverified current
status. The St. Thomas lines button moves directly to this drawing's coverage.

`build-drawing-lines.py` extracts open straight vectors from precisely selected
`701480 VBASE|V-*` survey layers. It excludes proposed `C-*`, `DEMO-*`, label,
structure and legend layers. The map frame clips the linework before the official
city intersection. Closed symbols, curves and fragments shorter than two metres
are omitted. Gaps caused by line symbols, text or excluded geometry are never
joined. Counts are extraction fragments, not unique assets; no size, depth, owner
or installation year is inferred from nearby text. The 2023 drawing is not a
current condition survey.

Registration uses four named building corners from OpenStreetMap footprints in
UTM zone 15N. Two Grace Hall corners excluded from the fit differ by 2.03 and
0.61 metres. This is a registration check against those footprint controls, not a
guarantee of underground utility accuracy. Control points, source identifiers,
coordinate system and frame are retained in `drawing-controls.json`. The builder
requires the exact source PDF SHA256 and aborts if the independent corner checks
exceed three metres. The original PDF remains hosted by the city; no report
photography or copyrighted basemap is republished as a map asset.

These additional primary documents contain line evidence and are linked in the
folded Map details section. Their geometry has not been added to the map:

| Document | Confirmed content | Limits |
| --- | --- | --- |
| [St. Albans at Grand, pages 8 and 9](https://www.stpaul.gov/DocumentCenter/View2/80468.pdf#page=8) | September 2014 SPRWS drawings label existing sanitary and storm sewer, water and gas; the report is an August 2015 preservation review | Scanned plan; proposed water replacements must stay separate from existing assets |
| [27 Crocus Place survey, page 2](https://rcxnet.co.ramsey.mn.us/GISLibrary/ScannedSurveyRecords/Parcels/RecordedSurveys/4628721.pdf#page=2) | 2016 recorded parcel survey shows utilities around Crocus Place and St. Albans | Underground locations are approximate; one parcel, not the neighborhood network |
| [Hillcrest final plan, page 12](https://www.stpaul.gov/sites/default/files/2022-06/20220614_HillcrestReport_FINAL.pdf#page=12) | March 27, 2020 existing water and sanitary maps; the water paths retain vectors | Final report published June 2022; no verified coordinate registration recovered for these excerpts |
| [Ford survey, pages 18 to 22](https://www.stpaul.gov/DocumentCenter/View2/17151.pdf#page=18) | 2010 drawings label water, sanitary, storm, gas, electric and fire lines | Historical plant and Highland coverage, approximate source locations; current operation unverified |
| [Raymond Avenue county as-built](https://rcxnet.co.ramsey.mn.us/GISLibrary/ScannedSurveyRecords/Roads/County/AsBuilts-Current/28-427_Raymond%20Phase%20II%20-%20AS%20BUILT.pdf) | 2015 street-project as-built sheets with water and other utilities | Scanned sheets and limited corridor coverage; not a complete GIS export |

The city Regional Water Map (EAMS), public web-map item
`f369ef2ce11145feb6b261affafb447d`, references distribution-main layer 8 and
service-lateral layer 14. Both anonymous metadata requests returned ArcGIS error
499, Token Required. The public web-map configuration contains no embedded pipe
features. No authentication was bypassed. Public SPRWS project layers are work-area
polygons, and city utility-construction lines are project corridors; neither is
published here as actual water-main geometry.

The further search inspected the public city and water-utility ArcGIS catalogs,
public web-map configurations, city project attachments, county as-builts and
recorded surveys. Six additional GitHub code searches targeted the exact main and
lateral service names, EAMS references, EPANET and KML filenames. No verified full
network was recovered. Four focused Wayback CDX requests returned HTTP 503, so
those archives were not successfully inspected. Absence from our exports remains
an evidence gap, not a claim that the neighborhood lacks pipes.

## Repository search, October 6, 2026

The search used GitHub code and repository APIs, GitLab public-project search,
repository file trees, and web searches restricted to those two hosts. Terms
included Saint Paul, St. Paul, St Paul, SaintPaul, stpaul, SPRWS, watermain,
WaterMain, SewerMain, pwSanitary, pwStormSewer, sewer, SWMM, EPANET, MCES,
TroutBrookInterceptor and the public agencies' domains. GeoJSON, KML, CSV and
INP searches were checked separately. Existing project copies of the data
were excluded as new evidence.

No verified complete Saint Paul water-main or local sanitary-sewer line dataset
was recovered. These were the closest candidates:

| Candidate | What inspection established |
| --- | --- |
| [ccollins12000/SaintPaulData](https://github.com/ccollins12000/SaintPaulData) | Seven files covering budget, crashes, crime and administrative shapes; no pipes |
| [OpenTwinCities](https://github.com/OpenTwinCities) | Civic repositories and portal links; no identified pipe export |
| [MacGIS urban maps](https://github.com/MacGIS/MacGIS.github.io) | Ward maps; no utility route files in its 17-file tree |
| [LeadServiceLineVerdict](https://github.com/ichbinhyeok/LeadServiceLineVerdict/blob/main/data/normalized/utilities/saint-paul-regional-water-services-mn.json) | SPRWS summary counts and official lead-program links, without route geometry |
| [cmorbitzer/jeeves](https://github.com/cmorbitzer/jeeves/blob/463ad76d29f60d75957ab98884e95035e2b4e44f/functions/src/sprws.ts) | Water-bill statement retrieval code; no pipe dataset |
| [gunnaraas/watermeter](https://github.com/gunnaraas/watermeter) | Home water-meter readings; no route geometry |
| [Harvard wastewater equity study](https://github.com/gradlab/wastewater_equity) | Minnesota collection-system survey tables and Census boundary shapes; no local pipe routes |
| [EPIC drinking-water funding tracker](https://github.com/Environmental-Policy-Innovation-Center/dw-dashboard) | Minnesota project funding lists and descriptions; no pipe geometry |
| [AmericasWater/AWASH](https://github.com/AmericasWater/awash) | Supply/demand modeling and utility cost tables; no identified Saint Paul pipe export |
| [USEPA/Sewersheds](https://github.com/USEPA/Sewersheds) | Sewershed polygons, including modeled areas; not sewer-pipe alignments |
| [GeoCommons archive](https://github.com/geoiq/gc_data) | Ten Saint Paul name-matching exports inspected: points, wards and planning areas; none a pipe-line export |
| [Minnesota GIS workshop on GitLab](https://gitlab.com/mhaffner/mngis-workshop) | Counties, springs, hazard data and a raster; no identified utility route export |

GitHub code searches have a ten-request-per-minute limit. Two initial queries
were rate-limited and were rerun successfully after the window reset. Results
were capped at 100 per query; broad place-name matches were dominated by global
place lists and unrelated data. GitLab's anonymous global code-search endpoint
returned HTTP 401. Its public project search and the relevant workshop file tree
were accessible. Neither platform search covers private repositories, and a
negative search result does not establish that no public copy exists anywhere.

## Reproduction and checks

`tools/under-street/build-saint-paul.py` is the publication build. It requires
Shapely, pyproj, PyMuPDF and numpy. Supply a preserved source-acquisition directory with `--input` and the verified
UST arena PDF with `--drawing-pdf`. The build clips native GIS, queries the six
anonymous layers by native ObjectID in batches, regenerates city street tiles,
removes out-of-scope assets and then appends the verified PDF vector excerpts.
The PDF dependency is checked before published data are rebuilt.
Historical acquisition tools do not define the current published scope.

Run these from the repository root:

```sh
python tools/under-street/build-saint-paul.py --input /path/to/source-archive --drawing-pdf /path/to/ustarenaeaw062023.pdf
node tools/under-street/test-data.cjs
node tools/under-street/test-lines.cjs
python tools/under-street/test-scope.py
node tools/under-street/test-explorer.cjs
node tools/under-street/test-explorer-deep.cjs
node tools/under-street/test-map-context.cjs
node tools/under-street/test-locator.cjs
node tools/under-street/test-compression.cjs
```

The data checks verify hashes, complete record counts, full geometry coverage,
raster centers, native fields, dimension preservation and exact disjoint tiles.
Browser checks cover all 46 layers, source/type panels, inactive records, deep links,
city-only inspection, six-size address search with a live civic query, street-cache
travel and retries, photograph focus restoration and lossless gzip fallback.
The normal laptop checks include 1512 by 820, 1440 by 760 and 1280 by 720 CSS pixels
without fullscreen. Test harnesses own and close Chrome for Testing processes.
