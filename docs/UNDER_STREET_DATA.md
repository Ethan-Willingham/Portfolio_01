# What is under Twin Cities streets: data notes

The map follows public records through several systems: drinking water, wastewater,
stormwater, electricity, pipelines, communications and the ground. A service
connection point, a utility territory and a pipe route describe different things.
Keep those distinctions in the layer title, selection facts and source notes.

The October 3, 2026 expansion registers 91 datasets and displays 66 layers. Those
counts come from the registry and adapter. The registry also retains older exports
that are replaced in the current map. Do not sum every registered dataset as though
it were a separate operating network.

## Files and provenance

- `archive/under-the-street/assets/map/datasets.json` records each file's publisher,
  coverage, source date, retrieval date, terms, caveats, count, bounds and SHA256.
- `archive/under-the-street/under-data.js` interprets source fields, lifecycle states,
  missing values, units and feature types. The renderer consumes these definitions.
- `archive/under-the-street/assets/map/media.json` records the image subject,
  attribution, license, date notes, source and matching conditions. It contains 43
  images: 37 place photographs or aerial crops and six illustrative photographs.
- `archive/under-the-street/assets/map/data/` contains fresh source exports, source
  metadata, point tiles and the Bassett Creek report interpretation.

An ArcGIS service edit timestamp is separate from an individual record's edit date.
Municipal exports record the newest retained record edit in `latestRecordEdit` when
the source has no service-wide timestamp. Neither is a survey date. Retrieval dates
are separate. OpenStreetMap records describe the
tags present in the acquisition snapshot, which can include historic structures.

## Named street context

The neighborhood background contains 182,154 complete road-centerline segments
from the [MnGeo opt-in public compilation](https://www.arcgis.com/home/item.html?id=515028a0cb3a42e0b6470b2af035121c).
All have a name from source fields and a unique native `roadseg_id`: 182,141 retain
the exact published full name, and 13 use preserved name/type/direction components.
Selection
uses the left or right county name for Anoka, Carver, Dakota, Hennepin, Ramsey,
Scott and Washington. Shared border roads can extend beyond those counties.
These lines provide navigation context; they do not describe underground routes.
They are separate from the 66 selectable infrastructure layers.

Official metadata lists June 18, 2026 as the publication date. The public item was
modified September 17, 2026, and the snapshot was retrieved October 3. The quarterly
compilation combines MetroGIS and Minnesota NG9-1-1 supplier data. Quality varies
by supplier, and some GAC-only fields are passed through without full validation.
The source includes 182,056 Active records, two Out of Service records and 96
records with absent or blank lifecycle fields. Missing status remains unknown.

`data/context-streets.json.gz` is the complete gzip-compressed GeoJSON download. Compact
property keys have explicit native-field mappings in the registry: `i` is
`roadseg_id`, `n` is the exact full source street name where supplied, `r` is route system,
`h` is federal functional class, `k` is cartographic class, `s` is lifecycle,
and `cl`/`cr` and `ml`/`mr` are the left/right county and municipal names.
For the 13 records without a full-name field, `nameParts` retains the original
native name components and `n` joins them for display.
The separate `c` field supplies a rendering hierarchy from the published functional,
cartographic and route codes. It does not infer pavement, access or operation.

The browser uses 2,252 disjoint spatial tiles near neighborhood zoom. Each segment
is assigned once using the center of its complete geometry's bounds. A tile's
bounds are the union of all its complete line geometry, so a long crossing segment
can load from either side. The index records each tile's count, byte size and SHA256.
Geometry is neither clipped nor simplified; WGS84 coordinates are rounded to six
decimal places. The complete file and tiles contain the same records. Download
compression is deterministic, with a zero timestamp and no machine-specific
filename; it preserves the complete decoded GeoJSON. The registry records both
compressed and decoded byte sizes and hashes. Local browser tiles remain ordinary JSON.

Named streets load at zoom 13.2 and above. Ready-tile cache limits are soft caps:
10 for Minneapolis services, 24 for wells and 24 for named streets. Currently visible
tiles and pending bookmark tiles are protected, so a very wide view can exceed a
cap. Cleanup runs when the view loads or zooms. Selected records and exact shared
coordinates survive eviction; returning to a discarded neighborhood refetches
its tile. Street labels stay subordinate to infrastructure labels, and ramps are
labeled only from zoom 17.

The complete service-line and well downloads also use deterministic gzip:
`data/service-lines.json.gz` and `data/wells-complete.json.gz`. Their ordinary JSON
point tiles retain the same complete source records and identities. Browser loading
uses those local tiles; the compressed files are downloadable inventories.

[MnGeo's redistribution conditions](https://mn.gov/mngeo/gis-data-and-maps/disclaimer.jsp)
permit use for any purpose and put responsibility on downstream distributors to
carry appropriate content, limitations, warranty and liability information.
MnGeo supplies the data as is, without guarantees of accuracy, currency,
completeness or suitability. Consult original county data for the most current
roads. No Creative Commons or public-domain designation is asserted here.

## Coverage that changes the meaning

| Records | What the map can establish |
|---|---|
| Minneapolis water services | Published connection locations and material classifications, including discontinued and non-water records. They are not pipe alignments or tap-water measurements. |
| MCES regional sewers | Regional segments and their published flow types and lifecycle states. Local collection systems are separate. |
| West Saint Paul pipes | Published municipal sanitary and storm routes. Storm width and length units are unspecified in the public source and remain unspecified in the map. |
| Maplewood-area pipes | 6,316 sanitary, 83 force-main and 12,740 storm records. Ownership includes municipal, MCES, adjacent-city and private records. Source diameter, length, grade and invert units remain unspecified. |
| Bloomington-area pipes | 11,704 water mains, 30,511 water services, 8,215 sanitary pipes, 20,533 storm pipes, 7,354 private storm pipes, 123 culverts and 861 drain-tile records. Source type, ownership and construction fields are retained. |
| Bloomington underground utilities | 1,199 records with published electrical, phone, telecom, gas and other contents. A telecom record does not identify fiber, copper or a complete provider network. |
| Eagan-area pipes | 14,163 water mains, 22,114 water laterals, 12,469 sanitary and 25,606 storm pipes. Combined sanitary/storm downloads retain each original source layer and native identity. Geometry-source fields can explicitly say assumed. |
| Eagan networks | 134 published fiber cable records and 463 utility path records. Cable and path geometry remain separate. A path does not prove that a cable is laid, buried or carrying traffic. |
| North Minneapolis stormwater model | 6,659 MWMO pipe conduits with source-specific GIS, as-built, modification and assumption comments. Model geometry does not establish surveyed alignments, condition or live operation. |
| Minneapolis storm inlets | All 6,000 records in the linked public service. The city describes nearly 29,000 physical inlets, so this published layer is a subset. |
| County Well Index | 110,839 located records from the non-public-water-supply source, including active, inactive and sealed wells. Unique-number verification, coordinate derivation and geological interpretation have separate codes. |
| EIA generation | Reported plant and generator inventory for August 2026. Nameplate capacity is a rating. Multiple units can share a site's approximate federal coordinates. |
| OpenStreetMap utilities | Tagged mapped structures and routes. An absent location, substance or voltage tag remains absent. Coverage is partial. |
| OpenStreetMap water facilities | The water_works tag alone does not establish treatment or drinking-water use. Exact verified Fridley, Columbia Heights, McCarrons and Bloomington records retain treatment-plant types and photographs; Southwest is a separately verified pumping station. Other names remain source labels. |
| Service territories | Provider or management context. Boundaries do not supply cable, fiber or water-main routes. |
| Pavement condition | A historical export last edited in 2015. Unrated sections remain unrated. |

The acquisition rectangle is a regional query envelope. Some ArcGIS points returned
through a projected envelope and some facility centers lie just beyond its nominal
longitude and latitude bounds. File bounds describe the coordinates actually
retained. Those nearby records are not silently moved onto the rectangle.

The fresh MCES snapshot has 12,494 interceptor records: 11,092 Online, 40 Offline,
860 Abandoned and 502 Removed. Its 39 treatment-plant records contain nine Online
sites and 30 Abandoned sites. Published inventory totals must not become counts of
operating assets. The same rule applies to lift stations, flow meters and EIA units.

The 25 OSM water-facility records include public-works and lift-station names as
well as treatment plants. Their generic type is a mapped water facility. Primary
[Minneapolis treatment information](https://www.minneapolismn.gov/government/departments/public-works/water-treatment-distribution/treatment-delivery/),
[SPRWS process information](https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-your-water)
and [Bloomington's plant address](https://www.bloomingtonmn.gov/util/utilities-division)
support the four exact treatment-plant overrides. The Minneapolis capital request
identifies [Southwest Pump Station](https://www.minneapolismn.gov/media/-www-content-assets/documents/2026-2031-Capital-Budget-Requests.pdf)
in its water infrastructure. That supports pumping, not treatment or current
operation. The Chanhassen Lift Station 24 name remains in its original tagged
layer with purpose uncertainty; its name alone does not silently move the record
to a different system. No unnamed or merely treatment-named OSM facility acquires
a verified drinking-water classification without primary identity evidence.

## Depth to bedrock

The depth layer is the [MGS D-03 2025 model](https://mgs-gispub.mngs.umn.edu/arcgis/rest/services/mosaics/D_03_Depth_to_Bedrock_2025/ImageServer).
The service description identifies feet as the pixel units, despite a separate
service height-model field referring to meters. Its native pixels are about 30 m.
The browser copy uses a 1000 by 875 export in EPSG:3857, approximately 120 m on the
ground at Twin Cities latitude, with bilinear interpolation and integer-foot storage.
Integer storage does not establish one-foot accuracy.

The 875,000 browser cells include 764,659 valid values and 110,341 null cells. Numeric
zero is a valid model value; null means absent coverage. The model excludes certain
Tribal Nations by their choice. Six checks against the native identify service
confirmed the numerical interpretation. Comparing native values at browser-cell
centers gave differences up to 7.7 feet, consistent with the coarser resampling.
Three sampled null centers returned native `NoData`.

This is regional modeled thickness above bedrock. It does not give utility burial
depth, water-table depth or a measured excavation section at a selected property.
Individual reported well depths and geologic interpretations remain separate from the model. The older median-well
grid remains registered as deprecated and is not the current depth layer.

`LOC_MC`, exported as `q`, verifies that a location corresponds to the correct well
unique number. Its [identity-code dictionary](https://mgsweb2.mngs.umn.edu/cwi_doc/loc_mc.asp)
does not describe how geographic coordinates were measured. `GCM_CODE`, exported as
`coordinateMethod`, instead records the [coordinate derivation method](https://mgsweb2.mngs.umn.edu/cwi_doc/gcmcode.asp).
Its historical precision classes are source method labels, not measured errors for
each current point. Padded codes retain their raw value; lookup trims whitespace.

`STRAT_MC`, exported as `geologyMethod`, records the
[geologic interpretation method](https://mgsweb2.mngs.umn.edu/cwi_doc/str_meth.asp).
It can identify map inference, a geophysical or driller log, samples, a geologic
study, provisional interpretation or an aquifer code alone. Reported bedrock depth
must not automatically be called a direct field observation. Bedrock zero remains
zero: sampled source reports show rock at the surface. Drilled-depth zero remains
in the download but displays as unreported depth; it is not used as a measurement.

## Municipal pipe snapshots and model distinctions

The 18 complete municipal exports use deterministic `.json.gz` files. Decoding
preserves the exact original GeoJSON bytes, including every native field and
coordinate. The registry records compressed and decoded SHA256 hashes and sizes.
Together they occupy 14,489,092 bytes instead of 120,695,707 bytes, an 88 percent
reduction. This is compression, without geometry simplification or record removal.

The browser prefers native `DecompressionStream` and accepts responses a server
has already decoded. Older browsers load the self-hosted, unmodified fflate 0.8.3
decoder only when needed. Its MIT license, package integrity and upstream tag are
retained in `assets/map/vendor/`. A failed decoder request can retry through the
same layer control as a failed dataset. Downloads retain the explicit gzip format.

[Maplewood's anonymous city service](https://gis.maplewoodmn.gov/arcgis/rest/services/PublicWorks/Cartegraph_MS/MapServer)
publishes sanitary gravity pipes, force mains and storm pipes. The sanitary source
includes 1,509 MCES records, so these counts do not represent additional unique
regional assets. Active and abandoned values remain intact. Numeric years and
technical identifiers display without thousands separators. As-built links remain
available when supplied.

[Eagan's current Storm Drain Locator](https://cityofeagan.maps.arcgis.com/apps/webappviewer/index.html?id=514dc132f418488d817f6cf71b71bbb7)
publishes an anonymous ArcGIS server proxy in its
[web-map configuration](https://www.arcgis.com/home/item.html?id=0391652170f14eea9d2084e744adf604).
That proxy returns the utility layer metadata and records without credentials.
The six browser layers combine sanitary gravity/lateral/force-main records and
storm gravity/lateral/pressurized records while keeping original source-layer
numbers, field definitions, domains and per-record query links. Compound identities
include the source layer and its native GlobalID. Water mains, water laterals,
fiber cables and utility paths remain separate.

Eagan water diameter coded labels explicitly use inch notation. Sanitary/storm
size, slope, length, depth and invert units are unspecified in these public
definitions and stay unspecified. Source-derived coordinates are not uniformly
surveyed: 12,599 water laterals explicitly record `GeometrySource=Assumed`.
Source attribute methods also retain estimated, researched, plan-derived and
field-verified categories. A planned or proposed removal is an intention, not
completed removal. General `Existing` and cable-specific `Proposed` disagree in
13 cable records; both fields remain visible in the inspector and proposed cable
records are excluded by default. The source does not publish a service-wide edit
timestamp; fiber edit dates are unavailable. The newest retained pipe edits fall
on October 1 or 2, 2026.

[Bloomington's GSOCMapping service](https://gis.bloomingtonmn.gov/arcgis/rest/services/PW_Utilities/GSOCMapping/MapServer)
returns the published water, sanitary and storm inventories anonymously even though
other city service folders require sign-in. Diameter inches are explicit in water
and sanitary coded-value labels. Public storm aliases explicitly identify inches,
feet and percent. Private storm diameter/length, water and sanitary length,
culvert size and drain-tile diameter units are not filled in by analogy. No source
vertical datum is inferred from an elevation value.

Downloadable snapshots retain each original source inventory. Eagan sanitary and
storm components share a system download with separate component provenance.
The exports omit
addresses, editor names and unrestricted asset comments. Native field aliases and
domains remain in the manifest. Explicit proposed, inactive, abandoned, removed
and reported past decommission records are hidden by default, with all records
available through the inactive toggle. A GIS `Enabled` flag alone does not establish
the asset's physical operating state. Decommission dates are evaluated against the
snapshot retrieval date, so a future date does not silently become an accomplished
event when the website is opened later.

The [MWMO North Minneapolis source](https://services3.arcgis.com/5aiR7gURjh2E0gMd/arcgis/rest/services/N_Minneapolis_Model_Data/FeatureServer/84)
is a model layer throughout the map, including records whose source comments cite
city GIS or an as-built. The `CMT_*` fields preserve assumptions about material,
dimensions, geometry and invert elevation. `CONDUIT_ID` is unique in this snapshot;
the original `LINK_ID` is not. The broader MWMO
[model-context page](https://www.mwmo.org/learn/storymap/) explains that public flow-path
applications can simplify model outputs. That page is context, not a claim that
every simplification described there applies to this source record.

These anonymous services do not supply an explicit reuse license in their metadata.
The map retains the municipal or MWMO attribution and this limitation rather than
calling them public domain. Public access, publisher attribution, source caveats
and legal survey accuracy are distinct questions.

## Bassett Creek engineering overview

The map's three Bassett Creek features interpret Figure 1 of the
[June 2025 BCWMC feasibility report](https://www.bassettcreekwmo.org/download_file/view/720550e9-eb72-46aa-865d-0aec666002f7/167):
I-94 and Second Street, Third Avenue, and the Double Box Culvert. They depict the
newer flood-control system, separately from the old creek tunnel and its outlet.

`tools/under-street/extract-bassett-plan.py` selects the figure's phase-colored vector
paths, excludes legend swatches, removes one redundant line overlay and transforms
the paths using the embedded GeoPDF controls and StatePlane coordinate system.
Parallel box-culvert paths remain as depicted. Their spacing is not a survey of the
distance between boxes. The small control-fit residual measures transformation fit,
not route accuracy. Source line widths and rounded control coordinates limit the
interpretation's precision.

Report section 2.1 describes Phase 3 construction by open-cut excavation 0 to 20 feet
below ground surface. That is construction wording, not a precise roof-depth field.
It describes a 30-foot drop into the Third Avenue tunnel. Elevation is not encoded in
the map geometry. Proposed repairs in the 2025 report are not presented as completed.

The report is publicly posted but states no explicit reuse license. The map distributes
an approximate interpretation of route facts with attribution, source and caveats.
It contains no report artwork or NearMap aerial imagery. Source-image audit visuals
stay in research scratch and must not be used as site imagery.

## Photograph identity and dates

A local subject photo needs a confirmed identity, explicit matching conditions and
its own license. Proximity alone cannot establish that an EIA point and an OSM
facility are the same site. An illustrative photo cannot match a named place.

The Highland photograph and feature refer to Saint Paul's Highland Park Tower. The
Wikipedia article named `Highland_Park_Water_Tower` describes an Illinois structure
and must not be linked to this photo. Its correct place article is
[Highland Park Tower](https://en.wikipedia.org/wiki/Highland_Park_Tower).

Standing towers do not all remain working storage. Primary sources confirm retired
storage at [Washburn](https://www.minneapolismn.gov/government/projects/washburn-water-tower/),
[Highland](https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-sprws/highland-tower),
[Prospect Park](https://www.minneapolisparks.org/parks-destinations/historical_sites/tower_hill_park/),
[Kenwood](https://www.health.state.mn.us/communities/environment/water/waterline/featurestories/mplsdist.html)
and [Lindstrom's Coffee Pot](https://www.cityoflindstrom.us/1429/Kaffe-Kanna-Park-Coffee-Pot-Water-Tower).
The catalog and adapter retain these record-specific facts.

The Monticello, Riverside and Sherburne coal-site photographs also match exact
federal names from the August 2026 EIA-860M workbook: plant 1922, `Monticello Nuclear
Facility`; plant 1927, `Riverside (MN)`; and plant 6090, `Sherburne County`. Compatible
nuclear, gas and coal kinds are required. The Sherco solar and storage sites are
separate EIA records and do not acquire the coal-site photograph. Approximate
federal coordinates do not enlarge the local photograph radius.

Commons upload dates are not assumed to be capture dates. High Bridge's June 2024
capture date is supported by EXIF; Black Dog's upload supplies no confirmed capture
date. The illustrative Finnish gas station's original description says 2007 while
its Commons Date field and upload say 2011; the catalog preserves that discrepancy.

The USGS aerial crops come from the public-domain CONUS imagery service. Its
published collection range is 2017 to 2021, with a service refresh in June 2024.
The catalog does not assign a precise flight year to an individual crop when the
service has not supplied one. Existing imagery and photographs retain their source
colors.

Well reference links follow reported use: exploration and elevator borings,
monitoring wells, piezometers and heat-pump wells have distinct labels. Unknown
uses remain well or borehole records, rather than assumed water-supply wells.

## Address navigation

`under-locate.js` submits searches to the Metropolitan Council's anonymous
[Address Points Metro locator](https://arcgis.metc.state.mn.us/server/rest/services/Locators/AddressPointsMetro/GeocodeServer).
The underlying [MetroGIS aggregation](https://metrogis.org/projects/address-point-aggregation/)
combines the seven metro counties' public address points. A lookup is a navigation
result, separate from a pipe, service connection, well or operating asset.

Search runs only on form submission. The browser requests EPSG:4326, checks finite
longitude/latitude and the regional envelope, rejects scores below 90, removes
identical candidates and asks the reader to choose a match. No result silently
moves the map. Scores are matching scores, not measured positional accuracy.
The locator's point coverage can omit a valid address; no match does not establish
absence of a building or a utility. Previous requests are canceled, and errors or
timeouts leave city navigation available.

The service publishes no separate license, quota or SLA in its item metadata.
Interactive public use is supported by its anonymous publication and the
[MetroGIS free and open data policy](https://metrogis.org/projects/free-plus-open-data/),
not a claim of a service-specific license. Keep source attribution next to the
results. Queries go directly from the reader's browser to the public locator;
the site does not collect them in a dataset.

## Verification and refresh

Run the read-only checks after changing source files or their registry:

```sh
node tools/under-street/test-data.cjs
python3 tools/under-street/audit-geography.py
node --check archive/under-the-street/under-data.js
node --check archive/under-the-street/under-map.js
node --check archive/under-the-street/under-locate.js
```

The first check verifies compressed and decoded file hashes, counts, exact point
and street tiles, adapter interpretations,
native municipal identity uniqueness, omitted address/editor fields, URL contracts,
every tiled point's stable identity, exact Eagan component counts and record query
provenance, lifecycle domains and conflicting cable statuses,
model assumptions, source units, well methods and targeted lifecycle examples.
For named street context, it also verifies disjoint identities, exact complete-record
coverage, every tile hash and whole-geometry bounds, and the center assignment rule.
The geographic audit checks finite
coordinates, retained bounds, raster dimensions and values, photo metadata and
nearby facility identities for manual review. Neither check establishes survey
accuracy or present operations independently of the cited sources.

The browser checks use Playwright and an owned Chrome for Testing process:

```sh
node tools/under-street/test-explorer.cjs
node tools/under-street/test-explorer-deep.cjs
node tools/under-street/test-locator.cjs
node tools/under-street/test-map-context.cjs
node tools/under-street/test-compression.cjs
```

They cover the opening, all 66 layer selections, exact record coordinates and IDs,
source/type links, complete fact disclosure, tiles and offscreen bookmarks,
direct shared-link landing and visible map/detail transitions,
refreshing a record without browser scroll restoration clipping its controls,
keyboard model inspection, data/catalog/imagery retries, phone layouts and
address matching and local result browsing after city or address navigation. Address cases use controlled responses plus one live civic
query to check browser CORS and the source schema. The harness uses an installed Playwright package or the bundled Codex runtime.

The context/cache check travels through all 15 service and 36 well tile neighborhoods,
verifies eviction and refetch without duplicate IDs or stale grid references,
and confirms that selected-record inspection and exact shared coordinates survive
cache cleanup. It checks lazy street loading below zoom 13.2, actual source street
names, and explicit retries after an index or tile returns HTTP 503.

The compression check exercises complete records through native decoding, the
lazy fallback, an already decoded server response, corrupt-data retry and failed
decoder loading. The offline check also compares the fallback's decoded bytes
against the standard-library decoder for all 18 municipal files.

`UNDER_MAP_PLAYWRIGHT` and `UNDER_MAP_CHROME` can select another test installation;
the owner's personal Chrome application is rejected. The browser closes in a
`finally` block. Test outputs default to `/tmp/under-street-*`.

The municipal acquisition defaults to scratch:

```sh
python3 tools/under-street/acquire-municipal.py
python3 tools/under-street/acquire-municipal.py --publish --from-review
python3 tools/under-street/compress-municipal.py
```

Acquisition packages final municipal exports automatically; grouped Eagan scratch
components stay plain JSON until combined. The separate compression command checks
recorded hashes, packages reviewed plain exports and validates already compressed
ones without changing them. It refuses to delete a plain export whose bytes have
changed. Use `--assets /path/to/reviewed --manifest municipal-manifest.json` for a
review directory.

Named road context has its own standard-library acquisition. A fresh directory
produces a new snapshot; an existing staging directory resumes cached batches and
preserves the original retrieval date. `--refresh` explicitly starts over.

```sh
python3 tools/under-street/acquire-context-streets.py --review-dir /tmp/under-street-roads-review
python3 tools/under-street/acquire-context-streets.py --review-dir /tmp/under-street-roads-review --publish
```

Inspect `review.json` for the count, unique native IDs, named count, bounds and
file/tile bytes before publishing. The source's native functional, cartographic and
route codes remain separate from the small rendering hierarchy. All source name
and identity values remain intact; discarded fields are irrelevant to street
context. Publishing verifies full-file and tile hashes and touches only the
context assets and their registry row.

The municipal script also reproduces the Eagan public proxy acquisition and
combined source-layer identities. An older failed proxy, a token-required direct
service or a map with a promising title is not evidence that no public viewer
exists. The detailed ten-city search is recorded in
`research/under-street/expansion-2026-10/municipal-availability-audit.md`.

The second command copies the reviewed files after checking their hashes and updates
only their registry rows. Use the managed worktree for source refreshes. Other
acquisition tools can write production files directly, including
`python3 tools/under-street/acquire-public-data.py wells-complete`, which refreshes
the complete well export and its point tiles. Inspect publisher metadata and
differences before replacing production data. Preserve source IDs,
unknown values and source-specific caveats, then update bytes, hashes and counts in
the registry. The Bassett extraction additionally requires `pypdf`, `pdfplumber`,
`numpy` and PROJ's `cs2cs`; its command is recorded in the manifest.
