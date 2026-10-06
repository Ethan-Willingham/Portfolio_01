/* Saint Paul public infrastructure. Source fields, missing values and status
 * stay separate from display geometry clipped to the city boundary. */
(function () {
  'use strict';
  var C = { water:'#8fb3c7', sewer:'#9ec79a', power:'#d9978c', gas:'#dfc288', net:'#cf9f78', ground:'#b79bc4', cream:'#e8e2d6', faint:'#a4a293' };
  var number = new Intl.NumberFormat('en-US', { maximumFractionDigits:2 });
  var manifestByFile = {};
  var layers = {
  "towers": {
    "title": "Water towers",
    "file": "data/osm-water-towers.json",
    "kind": "point",
    "color": "#8fb3c7",
    "type": "tower",
    "minZ": 0,
    "on": true,
    "note": "Mapped tanks include the historic Highland Park tower"
  },
  "protection": {
    "title": "Drinking-water protection areas",
    "file": "data/drinking-water-protection.json",
    "kind": "polygon",
    "color": "#8fb3c7",
    "type": "protection",
    "minZ": 0,
    "on": false,
    "note": "MDH management boundaries, not water-service territories"
  },
  "vulnerability": {
    "title": "Drinking-water vulnerability",
    "file": "data/drinking-water-vulnerability.json",
    "kind": "polygon",
    "color": "#b79bc4",
    "type": "vulnerability",
    "minZ": 0,
    "on": false,
    "note": "MDH source-water vulnerability, not measured contamination"
  },
  "interceptors": {
    "title": "Interceptor pipes in Saint Paul",
    "file": "data/mces-interceptors.json",
    "kind": "line",
    "color": "#9ec79a",
    "type": "interceptor",
    "minZ": 0,
    "on": true,
    "note": "MCES records include online, offline, abandoned and removed segments",
    "hasInactive": true
  },
  "plants": {
    "title": "Saint Paul treatment plant",
    "file": "data/mces-treatment-plants.json",
    "kind": "point",
    "color": "#9ec79a",
    "type": "tplant",
    "minZ": 0,
    "on": true,
    "note": "Metro plant inventory inside Saint Paul",
    "hasInactive": true
  },
  "lifts": {
    "title": "Lift stations in Saint Paul",
    "file": "data/mces-lift-stations.json",
    "kind": "point",
    "color": "#9ec79a",
    "type": "lift",
    "minZ": 11,
    "on": false,
    "note": "Published status distinguishes online and other records",
    "hasInactive": true
  },
  "meters": {
    "title": "Sewer flow meters in Saint Paul",
    "file": "data/mces-flow-meters.json",
    "kind": "point",
    "color": "#9ec79a",
    "type": "meter",
    "minZ": 12,
    "on": false,
    "note": "Includes non-operating records",
    "hasInactive": true
  },
  "sheds": {
    "title": "Treatment service areas",
    "file": "sewersheds.json",
    "kind": "polygon",
    "color": "#9ec79a",
    "type": "sewershed",
    "minZ": 0,
    "on": false,
    "note": "Plant service boundaries; no building-to-plant pipe tracing"
  },
  "osmWastewater": {
    "title": "Other mapped wastewater sites",
    "file": "data/osm-wastewater-plants.json",
    "kind": "point",
    "color": "#9ec79a",
    "type": "tplant",
    "minZ": 0,
    "on": false,
    "note": "OSM facilities may overlap the MCES inventory"
  },
  "buried": {
    "title": "Buried watercourse records",
    "file": "streamsug.json",
    "kind": "line",
    "color": "#8fb3c7",
    "type": "bstream",
    "minZ": 0,
    "on": true,
    "note": "DNR classes include culverts, storm sewers and former channels"
  },
  "streams": {
    "title": "DNR watercourse network",
    "file": "data/surface-streams.json",
    "kind": "line",
    "color": "#8fb3c7",
    "type": "surfacewater",
    "minZ": 11,
    "on": false,
    "note": "Includes surface and other segment types; inspect the DNR class"
  },
  "dams": {
    "title": "Mapped dams and navigation locks",
    "file": "data/osm-dams-locks.json",
    "kind": "point",
    "color": "#8fb3c7",
    "type": "dam",
    "minZ": 0,
    "on": false,
    "note": "OSM snapshot; points can represent centers of mapped structures"
  },
  "power": {
    "title": "Mapped transmission lines",
    "file": "data/osm-power-lines.json",
    "kind": "line",
    "color": "#d9978c",
    "type": "transmission",
    "minZ": 0,
    "on": true,
    "note": "OSM snapshot; location and voltage shown only when tagged"
  },
  "substations": {
    "title": "Substations",
    "file": "data/osm-substations.json",
    "kind": "point",
    "color": "#d9978c",
    "type": "sub",
    "minZ": 0,
    "on": true,
    "note": "OSM snapshot; incomplete utility inventory"
  },
  "powerplants": {
    "title": "EIA generating-site inventory",
    "file": "data/eia-power-plants.json",
    "kind": "point",
    "color": "#dfc288",
    "type": "pplant",
    "minZ": 0,
    "on": true,
    "note": "August 2026 inventory; approximate federal site coordinates",
    "hasInactive": true
  },
  "generators": {
    "title": "EIA generator records",
    "file": "data/eia-generators.json",
    "kind": "point",
    "color": "#dfc288",
    "type": "generator",
    "minZ": 13,
    "on": false,
    "note": "Units share plant coordinates; status is reported, not live",
    "hasInactive": true
  },
  "osmPowerplants": {
    "title": "OSM generating sites",
    "file": "data/osm-power-plants.json",
    "kind": "point",
    "color": "#dfc288",
    "type": "pplant",
    "minZ": 0,
    "on": false,
    "note": "Tagged output and fuel; no automatic match to EIA plants"
  },
  "feeders": {
    "title": "Mapped local electric lines",
    "file": "data/osm-power-minor.json",
    "kind": "line",
    "color": "#d9978c",
    "type": "distribution",
    "minZ": 12,
    "on": false,
    "note": "Partial OSM coverage of distribution lines"
  },
  "electricAreas": {
    "title": "Electric utility service areas",
    "file": "data/electric-service-areas.json",
    "kind": "polygon",
    "color": "#d9978c",
    "type": "electricarea",
    "minZ": 0,
    "on": false,
    "note": "Utility territory context, not cable routes or a legal survey"
  },
  "pipelines": {
    "title": "Pipelines by recorded substance",
    "file": "data/osm-pipelines.json",
    "kind": "line",
    "color": "#dfc288",
    "type": "pipeline",
    "minZ": 0,
    "on": true,
    "note": "Tagged substances and operators; a complete utility inventory is not available"
  },
  "comms": {
    "title": "Mapped data centers",
    "file": "data/osm-data-centers.json",
    "kind": "point",
    "color": "#cf9f78",
    "type": "dc",
    "minZ": 0,
    "on": true,
    "note": "OSM equipment sites; street fiber routes are absent"
  },
  "exchanges": {
    "title": "Recorded telephone exchanges",
    "file": "data/osm-telephone-exchanges.json",
    "kind": "point",
    "color": "#cf9f78",
    "type": "exch",
    "minZ": 0,
    "on": true,
    "note": "An OSM exchange tag does not confirm present building use"
  },
  "telephoneAreas": {
    "title": "Telephone exchange territories",
    "file": "data/telephone-service-areas.json",
    "kind": "polygon",
    "color": "#cf9f78",
    "type": "telephonearea",
    "minZ": 0,
    "on": false,
    "note": "Legacy operator and exchange boundaries, not broadband coverage"
  },
  "rail": {
    "title": "Rail routes crossing the street network",
    "file": "data/rail-routes.json",
    "kind": "line",
    "color": "#cf9f78",
    "type": "rail",
    "minZ": 11,
    "on": false,
    "note": "MnDOT inventory; train-count years vary and are not live schedules"
  },
  "depth": {
    "title": "Modeled depth to bedrock, 2025",
    "file": "data/bedrock-depth-2025.json",
    "kind": "raster",
    "color": "#b79bc4",
    "type": "bdepth",
    "minZ": 0,
    "on": true,
    "note": "MGS D-03; browser sampling about 120 m, depth in feet"
  },
  "bedrock": {
    "title": "Bedrock formations",
    "file": "bedrock.json",
    "kind": "polygon",
    "color": "#b79bc4",
    "type": "bedrock",
    "minZ": 0,
    "on": false,
    "note": "Rock formations below the glacial and recent deposits"
  },
  "surficial": {
    "title": "Glacial and recent deposits",
    "file": "data/surficial-geology.json",
    "kind": "polygon",
    "color": "#dfc288",
    "type": "surficial",
    "minZ": 0,
    "on": false,
    "note": "MGS D-01; generalized sediment units clipped to Saint Paul"
  },
  "wells": {
    "title": "Recorded wells and boreholes",
    "file": "data/wells-complete.json.gz",
    "kind": "point",
    "color": "#e8e2d6",
    "type": "well",
    "minZ": 13.4,
    "on": true,
    "note": "Saint Paul CWI records; includes sealed and other statuses"
  },
  "groundwater": {
    "title": "Groundwater areas of concern",
    "file": "data/groundwater-areas.json",
    "kind": "polygon",
    "color": "#cf9f78",
    "type": "groundwater",
    "minZ": 0,
    "on": false,
    "note": "MPCA mapped areas; status and mapping dates vary"
  },
  "groundwaterBounds": {
    "title": "Groundwater boundary certainty",
    "file": "data/groundwater-boundaries.json",
    "kind": "line",
    "color": "#cf9f78",
    "type": "groundwaterBoundary",
    "minZ": 0,
    "on": false,
    "note": "Boundary lines retain the published certainty classification"
  },
  "groundwaterSources": {
    "title": "Potential groundwater source areas",
    "file": "data/groundwater-source-areas.json",
    "kind": "polygon",
    "color": "#d9978c",
    "type": "groundwaterSource",
    "minZ": 0,
    "on": false,
    "note": "Potential source areas differ from mapped groundwater plumes"
  },
  "groundwaterSites": {
    "title": "Groundwater investigation sites",
    "file": "data/groundwater-sites.json",
    "kind": "point",
    "color": "#cf9f78",
    "type": "groundwaterSite",
    "minZ": 0,
    "on": false,
    "note": "Project anchors associated with mapped groundwater areas"
  },
  "groundwaterUnmapped": {
    "title": "Groundwater sites without mapped areas",
    "file": "data/groundwater-sites-unmapped.json",
    "kind": "point",
    "color": "#cf9f78",
    "type": "groundwaterSite",
    "minZ": 0,
    "on": false,
    "note": "A site point does not establish a plume boundary"
  },
  "cleanup": {
    "title": "Cleanup and tank program records",
    "file": "data/cleanup-sites.json",
    "kind": "point",
    "color": "#cf9f78",
    "type": "cleanup",
    "minZ": 13,
    "on": false,
    "note": "Program enrollment alone does not establish current contamination"
  },
  "hydrants": {
    "title": "Saint Paul public hydrants, 2021",
    "file": "data/saint-paul-hydrants.json",
    "kind": "point",
    "color": "#8fb3c7",
    "type": "hydrant",
    "minZ": 13.4,
    "on": true,
    "note": "December 2021 public snapshot; hydrants do not show main routes",
    "native": true,
    "oid": "FID"
  },
  "troutBrook": {
    "title": "Trout Brook storm interceptor",
    "file": "data/trout-brook.json",
    "kind": "line",
    "color": "#8fb3c7",
    "type": "stormsewer",
    "minZ": 0,
    "on": true,
    "note": "Published route; stormwater, not sanitary sewage",
    "native": true,
    "oid": "OBJECTID"
  },
  "rwmwdPipes": {
    "title": "District storm pipes",
    "file": "data/rwmwd-pipes.json",
    "kind": "line",
    "color": "#8fb3c7",
    "type": "stormsewer",
    "minZ": 0,
    "on": true,
    "note": "District-owned alignments; partial city coverage",
    "native": true,
    "oid": "OBJECTID"
  },
  "rwmwdStructures": {
    "title": "Storm inlets, outlets and structures",
    "file": "data/rwmwd-structures.json",
    "kind": "point",
    "color": "#8fb3c7",
    "type": "stormstructure",
    "minZ": 13,
    "on": false,
    "note": "District inventory; native structure types retained",
    "native": true,
    "oid": "OBJECTID"
  },
  "rwmwdPonds": {
    "title": "Stormwater treatment ponds",
    "file": "data/rwmwd-ponds.json",
    "kind": "polygon",
    "color": "#8fb3c7",
    "type": "stormpond",
    "minZ": 0,
    "on": false,
    "note": "District-owned stormwater ponds",
    "native": true,
    "oid": "OBJECTID"
  },
  "signalLines": {
    "title": "Traffic-signal fiber and connections",
    "file": "data/saint-paul-signals.json",
    "kind": "line",
    "color": "#cf9f78",
    "type": "signalconnection",
    "minZ": 13,
    "on": true,
    "note": "Fiber, copper and other signal connections; not home internet routes",
    "native": true,
    "oid": "OBJECTID",
    "hasInactive": true
  }
};
  var lineGroups = [
    {id:'water',label:'Water',color:C.water,layers:[],detail:'No water-main routes',missing:'Water mains and service-pipe routes are absent.'},
    {id:'sewer',label:'Sewage',color:C.sewer,layers:['interceptors'],detail:'Interceptors only',missing:'Local sanitary mains and laterals are absent.'},
    {id:'storm',label:'Storm drains',color:C.water,layers:['troutBrook','rwmwdPipes','buried'],detail:'Partial storm routes',missing:'Most local storm drains and laterals are absent.'},
    {id:'gas',label:'Gas / pipes',color:C.gas,layers:['pipelines'],detail:'2 gas; 30 unknown',missing:'The gas-distribution and district-heat networks are absent.'},
    {id:'power',label:'Power',color:C.power,layers:['power','feeders'],detail:'Partial electric lines',missing:'A complete buried-cable and duct-bank network is absent.'},
    {id:'cables',label:'Cables',color:C.net,layers:['signalLines'],detail:'Traffic signals only',missing:'Residential and commercial telecom routes are absent.'}
  ];
  var topics = {
  "water": {
    "title": "Saint Paul drinking water",
    "text": "Historic towers and the public hydrant inventory. Hydrants mark connections to the water system. Main routes are not included in the public exports used here.",
    "layers": [
      "towers",
      "hydrants",
      "protection",
      "vulnerability"
    ]
  },
  "wastewater": {
    "title": "Where Saint Paul sewage goes",
    "text": "Interceptor pipes, the Metro treatment plant, lift stations and flow meters inside Saint Paul. Local sanitary branches are not included as a complete city network.",
    "layers": [
      "interceptors",
      "plants",
      "lifts",
      "meters",
      "sheds",
      "osmWastewater"
    ]
  },
  "storm": {
    "title": "Saint Paul storm drains",
    "text": "The Trout Brook interceptor and district storm pipes, including Beltline and Battle Creek. Add inlets, outfalls and ponds in Map details. These public routes cover part of the city.",
    "layers": [
      "troutBrook",
      "rwmwdPipes",
      "rwmwdStructures",
      "rwmwdPonds",
      "buried",
      "streams",
      "dams"
    ]
  },
  "power": {
    "title": "Power in Saint Paul",
    "text": "Transmission lines, substations and generating sites within the city. Mapped local feeders are partial coverage. A power line is not necessarily underground.",
    "layers": [
      "power",
      "substations",
      "powerplants",
      "generators",
      "feeders",
      "electricAreas",
      "osmPowerplants"
    ]
  },
  "gas": {
    "title": "Saint Paul gas and district heat",
    "text": "Tagged pipeline routes and District Energy Saint Paul. Recorded substances are kept separate; many source records do not identify what the pipe carries.",
    "layers": [
      "pipelines"
    ]
  },
  "networks": {
    "title": "Saint Paul cables and connections",
    "text": "City traffic-signal connections include fiber and copper. Their routes do not establish residential broadband service. Data-center, exchange and railway records add local context.",
    "layers": [
      "signalLines",
      "comms",
      "exchanges",
      "telephoneAreas",
      "rail"
    ]
  },
  "ground": {
    "title": "The ground under Saint Paul",
    "text": "Modeled depth to bedrock, well records, rock and sediment formations, and groundwater investigation records. The depth model is an estimate, not a measurement at each property.",
    "layers": [
      "depth",
      "wells",
      "bedrock",
      "surficial",
      "groundwater",
      "groundwaterBounds",
      "groundwaterSources",
      "groundwaterSites",
      "groundwaterUnmapped",
      "cleanup",
      "protection",
      "vulnerability"
    ]
  }
};

  topics.lines = {title:'All available utility lines',text:'Every retained utility-line record in Saint Paul, including former segments, empty conduit and radio connections. None of these sources covers a complete city network. Streets provide dim navigation context.',layers:lineGroups.reduce(function(ids,g){return ids.concat(g.layers);},[])};

  var hydroTypes = {43:'Aqueduct or tunnel',70:'Road culvert',71:'Underground storm sewer',72:'Force main',90:'Superseded channel'};
  var plantKinds = {nuclear:'nuclearplant',coal:'coalplant',gas:'gasplant',hydro:'hydroplant',solar:'solarplant',wind:'windplant',waste:'wasteplant',biomass:'biomassplant',oil:'oilplant',battery:'batteryplant'};
  var fuelNames = {NG:'Natural gas',NUC:'Nuclear',SUN:'Solar',WND:'Wind',WAT:'Water',BIT:'Bituminous coal',SUB:'Subbituminous coal',LIG:'Lignite',WC:'Waste coal',DFO:'Distillate fuel oil',RFO:'Residual fuel oil',JF:'Jet fuel',KER:'Kerosene',PC:'Petroleum coke',PG:'Propane',LFG:'Landfill gas',OBG:'Other biomass gas',WDS:'Wood and wood-derived solids',BLQ:'Black liquor',MSW:'Municipal solid waste',OBS:'Other biomass solids',AB:'Agricultural byproducts',OBL:'Other biomass liquids',SGC:'Coal-derived synthesis gas',SGP:'Petroleum-derived synthesis gas',OG:'Other gas',WH:'Waste heat',GEO:'Geothermal',MWH:'Electricity for storage',OTH:'Other'};
  // MDH MWIMap tables 8, 10 and 11, queried October 3, 2026.
  // Unknown or newer codes are retained rather than guessed.
  var wellAquifers = {"CAMB":"Cambrian,undifferentiated","CECR":"Eau Claire","CEMS":"Eau Claire-Mt.Simon","CJDN":"Jordan","CJDW":"Jordan-Wonewoc","CJMS":"Jordan-Mt.Simon","CJSL":"Jordan-St.Lawrence","CJTC":"Jordan-Tunnel City","CLBK":"Lone Rock/Birkmose Mbr","CMFL":"Mt.Simon-Fond du Lac","CMRC":"Mt.Simon-Red Clastics","CMSH":"Mt.Simon-Hinckley","CMTS":"Mt.Simon","CSLT":"St.Lawrence-Tunnel City","CSLW":"St.Lawrence-Wonewoc","CSTL":"St.Lawrence","CTCE":"Tunnel City-Eau Claire","CTCG":"Tunnel City Group","CTCM":"Tunnel City-Mt.Simon","CTCW":"Tunnel City-Wonewoc","CTLR":"Tunnel CIty/Lone Rock Fm","CTMZ":"Tunnel City/Mazomanie Fm","CWEC":"Wonewoc-Eau Claire","CWMS":"Wonewoc-Mt.Simon","CWOC":"Wonewoc Sandstone","DCLS":"L.Cedar Valley-Spillville","INDT":"indeterminate","KDNB":"Dakota/Nishnabotna Mbr","KREG":"Cretaceous regolith","KRET":"Cretaceous,undiff.","MTPL":"multiple","ODCR":"Decorah","ODPL":"Decorah-Platteville","OGSP":"Glenwood - St.Peter","OGWD":"Glenwood","OPCJ":"Prairie Du Chien-Jordan","OPCM":"Prairie Du Chien-Mt.Simon","OPCT":"Pr.du Chien-Tunnel City","OPCW":"Prairie du Chien-Wonewoc","OPDC":"Prairie Du Chien Group","OPGW":"Platteville-Glenwood","OPOD":"Oneota Fm(Prairie Du Chien)","OPSH":"Shakopee Fm(Prairie Du Chie","OPSP":"Platteville-St.Peter","OPVJ":"Platteville-Jordan","OPVL":"Platteville","ORDO":"Ordovician,undiff.","OSCJ":"St.Peter-Jordan","OSCM":"St Peter-Prairie Du Chien-Mt. Simon","OSCS":"St.Peter-St.Lawrence","OSCT":"St.Peter-Tunnel City","OSPC":"St.Peter-Prairie Du Chien","OSTP":"St.Peter","OWIN":"Winnipeg","PABG":"Becker terrane-gran. gneiss","PCCR":"Precambrian crystalline rks","PCUU":"Precambrian rocks und.","PEGU":"E.Proterzc granite pluton","PMFL":"Fond Du Lac Formation","PMHF":"Hinckley-Fond Du Lac","PMHN":"Hinckley Sandstone","PMRC":"Red Clastic Series","PMSU":"Mid.Proterozoic sedimentary","PMVU":"Keweenawan volcanics und.","PUDF":"Phanerozoic undiff.","QBAA":"Quat. buried artes. aquifer","QBUA":"Quat. buried unconf. aquif.","QUUU":"Quaternary undiff.","QWTA":"Quat. Water Table Aquifer","UREG":"Weathering Residuum"};
  var wellUses = {"AB":"Abandoned","AC":"Air Conditioning","CO":"Commercial","DO":"Domestic","DW":"Dewatering well","EB":"Exploration boring","EL":"Elevator","EX":"Exploration","HP":"Heat pump","IJ":"Injection","IN":"Industrial","IR":"Irrigation","LA":"Lake level augmentation","LN":"Licensed Non-Public WaterSupply","MD":"Multiple dwelling","MU":"Municipal","MW":"Monitor well","OB":"Observation well","OT":"Other (specify in remarks)","PC":"Community Supply","PN":"Public Supply/non-comm.-transient","PO":"Pump out well","PP":"Public Supply/non-comm.-non-transient","PS":"Public Supply/non-community","PZ":"Piezometer","RC":"Recovery well","RM":"Remedial","RW":"Relief well","SI":"Scientific Investigation","TW":"Test well","UN":"Unknown"};
  var wellVerification = {"1":"Address verification","2":"Name on mailbox","3":"Lot Block","4":"Plat Book","5":"Information from owner-site visit","6":"Information from neighbor","7":"Other, note in remarks","8":"Address with parcel boundary","E":"Emergency services number","G":"Info/GPS from data source","S":"Site Plan","T":"Tag on well","U":"Unlocated (not field located)","X":"Tax Records","Y":"Information from owner-phone call"};
  var wellCoordinates={A:'Digitized map, at least 1:24,000','A**':'Digitized map, irregular section',B:'Digitized map, 1:100,000 to 1:24,000',DS1:'Screen-digitized map, 1:24,000',DS2:'Screen-digitized map, 1:12,000',G:'GPS, source class below 1 meter',G3:'Differentially corrected GPS',G6A:'Averaged GPS, Selective Availability on',G6O:'Averaged GPS, Selective Availability off',I:'GPS, source class 3 to 12 meters',PQ6:'Public Land Survey subsection',S:'Survey',SPL:'Derived State Plane coordinates',UNK:'Unknown coordinate method'};
  var wellGeology={A:'Inferred from geologic map',B:'Inferred from geophysical log',C:'Interpreted from core',D:'Inferred from driller log',E:'Interpreted from core and geophysical log',F:'Interpreted from cuttings',G:'On-site geologist',H:'Cuttings and geophysical log',N:'No source',O:'Other',P:'Geologic study, 1:24,000 or larger',Q:'Geologic study, 1:24,000 to 1:100,000',R:'Geologic study, 1:100,000 or smaller',U:'Unknown',X:'MGS provisional interpretation',Z:'Aquifer code only'};
  var historicTowers = {'way/95763640':{status:'No longer in service',url:'https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-sprws/highland-tower'}};
  var confirmedWaterFacilities = {};

  // Extra kinds reuse verified encyclopedia pages. The media catalog supplies
  // photos and the established kinds; these override only narrower meanings.
  var kinds = {
    signalconnection:{"label": "Traffic-signal connection", "wiki": "https://en.wikipedia.org/wiki/Traffic_light_control_and_coordination", "description": "A city traffic-signal connection. Read the recorded type for overhead, low-voltage, abandoned or unclassified records."},
    emptyconduit:{"label": "Empty signal conduit record", "wiki": "https://en.wikipedia.org/wiki/Electrical_conduit", "description": "The city labels this traffic-signal line EMPTY. This record does not establish that a cable has been installed."},
    signalradio:{"label": "Traffic-signal radio connection", "wiki": "https://en.wikipedia.org/wiki/Radio", "description": "A city record classified as radio. This mapped line is not a buried cable."},
    signalcopper:{"label": "Traffic-signal copper connection", "wiki": "https://en.wikipedia.org/wiki/Copper_cable", "description": "A traffic-signal connection classified as copper in the city inventory. The source does not supply burial depth."},
    signalfiber:{"label": "Traffic-signal fiber connection", "wiki": "https://en.wikipedia.org/wiki/Optical_fiber_cable", "description": "The city classifies this traffic-signal connection as fiber. Burial, active operation and home internet availability are not established by this geometry."},
    stormpond:{"label": "Stormwater treatment pond", "wiki": "https://en.wikipedia.org/wiki/Retention_basin", "description": "A district-owned pond or basin that receives runoff. Basin type and installation year are shown when supplied."},
    storminlet:{"label": "Stormwater inlet", "wiki": "https://en.wikipedia.org/wiki/Storm_drain", "description": "Receives runoff into the district stormwater system. The source retains any more specific intake or catch-basin type."},
    stormmanhole:{"label": "Stormwater manhole", "wiki": "https://en.wikipedia.org/wiki/Manhole", "description": "Provides access to a stormwater pipe or junction. This is not a sanitary-sewer connection."},
    stormoutfall:{"label": "Stormwater outlet", "wiki": "https://en.wikipedia.org/wiki/Outfall", "description": "A recorded outlet or outfall from a stormwater system. Its published structure type identifies what the district recorded."},
    stormstructure:{"label": "Stormwater structure", "wiki": "https://en.wikipedia.org/wiki/Storm_drain", "description": "A district stormwater structure. The source retains its recorded inlet, outlet, drop-shaft or other type."},
    waterfacility:{label:'Mapped water facility',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'OSM tags this record as water_works. That tag alone does not establish treatment, drinking-water use or current operation. Names and operators remain source tags; some tagged records describe public works or lift stations.'},
    watermain:{label:'Published water-main record',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'This city inventory gives a water-main alignment and its published type. Public, private, neighboring, supply and former records can occur together. Read the type, ownership and construction fields before treating a segment as a currently operating drinking-water distribution main.'},
    rawwatermain:{label:'Raw-water main record',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'The source identifies this as a raw-water pipe. Raw water has not completed drinking-water treatment; its route is distinct from the distribution mains that serve customers.'},
    sanitarylateral:{label:'Sanitary lateral pipe',wiki:'https://en.wikipedia.org/wiki/Sanitary_sewer',description:'The source identifies this as a sanitary lateral, separate from its gravity mains and force mains. Geometry and attribute-source fields preserve any assumed or plan-derived values.'},
    stormlateral:{label:'Storm lateral pipe',wiki:'https://en.wikipedia.org/wiki/Storm_drain',description:'The city identifies this line as a storm lateral. Its original lifecycle, geometry source, dimensions and any unknown measurement units remain part of the record.'},
    stormpressure:{label:'Pressurized storm pipe',wiki:'https://en.wikipedia.org/wiki/Storm_drain',description:'The source identifies this as a pressurized storm main, separate from gravity flow and lateral pipes. That classification does not supply a pressure measurement or establish current pump operation.'},
    draintile:{label:'Published storm drain-tile record',wiki:'https://en.wikipedia.org/wiki/Drainage',description:'This city inventory records a drainage pipe below the surface. Its diameter units are not stated in the public definitions, so the source value is kept without conversion.'},
    sanitary:{label:'Local sanitary sewer', wiki:'https://en.wikipedia.org/wiki/Sanitary_sewer', description:'A local sanitary pipe carries wastewater from buildings toward the regional system. Pipe size, material and status are shown only when the city publishes them.'},
    interceptor:{label:'Interceptor sewer', wiki:'https://en.wikipedia.org/wiki/Sanitary_sewer', description:'An interceptor collects wastewater from smaller sewers. Its published type distinguishes gravity flow, pumped force mains, siphons and effluent pipes.'},
    effluent:{label:'Treated-effluent pipe', wiki:'https://en.wikipedia.org/wiki/Effluent', description:'This MCES pipe carries treated effluent. The record preserves its flow type and lifecycle status.'},
    abandonedsewer:{label:'Abandoned or removed sewer record', wiki:'https://en.wikipedia.org/wiki/Sanitary_sewer', description:'MCES records this segment as abandoned or removed. Its geometry is a historical system record.'},
    formerchannel:{label:'Former watercourse channel', wiki:'https://en.wikipedia.org/wiki/Stream', description:'DNR classifies this as a superseded channel. The record does not establish a presently operating underground pipe.'},
    surfacewater:{label:'DNR watercourse segment', wiki:'https://en.wikipedia.org/wiki/Stream', description:'DNR maps a connected hydrographic network with several segment classes. Read this record’s published type before treating it as a surface stream.'},
    steam:{label:'Steam or hot-water pipeline', wiki:'https://en.wikipedia.org/wiki/District_heating', description:'This pipeline has a recorded heating substance. Mapped routes cover only part of the district heating networks.'},
    gas:{label:'Gas-family pipeline', wiki:'https://en.wikipedia.org/wiki/Pipeline_transport', description:'The published substance tag identifies a gas, which can include landfill gas. This classification alone does not establish a natural-gas transmission main.'},
    waterpipe:{label:'Water or drainage pipeline', wiki:'https://en.wikipedia.org/wiki/Water_supply_network', description:'The published substance tag identifies water or drainage. It does not by itself establish a drinking-water main.'},
    fuelpipe:{label:'Fuel or oil pipeline', wiki:'https://en.wikipedia.org/wiki/Pipeline_transport', description:'The recorded substance identifies a fuel or oil pipeline. Its location and usage are retained only when tagged.'},
    ammoniapipe:{label:'Ammonia pipeline', wiki:'https://en.wikipedia.org/wiki/Pipeline_transport', description:'This pipe is tagged as carrying ammonia. The map retains that classification separately from gas and fuel pipes.'},
    powercable:{label:'Mapped power cable', wiki:'https://en.wikipedia.org/wiki/Electric_power_distribution', description:'OSM tags this feature as an electric cable. A missing location tag does not establish that it is buried.'},
    undergroundpower:{label:'Tagged underground power cable', wiki:'https://en.wikipedia.org/wiki/Undergrounding', description:'OSM explicitly tags this cable as underground. These records are partial mapped coverage, with no complete duct-bank or utility connection model.'},
    electricarea:{label:'Electric utility territory', wiki:'https://en.wikipedia.org/wiki/Electric_power_distribution', description:'This boundary identifies an electric utility service territory. It supplies provider context rather than the routes of wires or cables.'},
    telephonearea:{label:'Telephone exchange territory', wiki:'https://en.wikipedia.org/wiki/Telephone_exchange', description:'This published territory describes a legacy exchange, wire center or study area. It does not show fiber routes, present broadband availability or every competing provider.'},
    generator:{label:'EIA generator record', wiki:'https://en.wikipedia.org/wiki/Electric_generator', description:'EIA records this unit’s nameplate capacity, fuel, technology and reported status. Nameplate capacity is a rated amount, not electricity being produced now.'},
    surficial:{label:'Glacial or recent sediment unit', wiki:'https://en.wikipedia.org/wiki/Quaternary_geology', description:'The MGS map describes unconsolidated deposits near the surface, including material, texture and depositional setting. This layer is separate from the underlying bedrock formations.'},
    protection:{label:'Drinking-water supply management area', wiki:'https://en.wikipedia.org/wiki/Aquifer', description:'MDH delineates these areas to help protect public drinking-water sources. A management boundary is not a contamination plume or a water-service territory.'},
    vulnerability:{label:'Source-water vulnerability area', wiki:'https://en.wikipedia.org/wiki/Aquifer', description:'MDH rates how susceptible a drinking-water source area is to contamination. The rating does not say that contamination has been measured at a property.'},
    rail:{label:'Rail route inventory', wiki:'https://en.wikipedia.org/wiki/Rail_transport', description:'MnDOT’s route inventory gives railroad, subdivision and selected movement fields. The count year belongs to the record; this map does not provide live train movements.'},
  };

  function present(v) { return v !== undefined && v !== null && v !== ''; }
  function pof(f) { return f.p || f.properties || {}; }
  function config(f) { return layers[f.layer] || {}; }
  function titlecase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function namedValue(p) {
    var n = p.name || p.n || p.NAME || p.site_name || p.WWTP;
    n=n==null?'':String(n).trim();
    return n && !/^(unnamed(?: plant| stream| creek)?|none(?:-none)?|unknown|n\/a)$/i.test(String(n).trim()) ? String(n) : '';
  }
  function substance(p) { return p.substance || 'Not tagged'; }
  function retiredRecord(p) { return /^(abandoned|removed|closed|retired)$/i.test(String(p.s || p.status || '')); }
  function fuelKind(code) {
    if (code === 'SUN') return 'solarplant';
    if (code === 'WND') return 'windplant';
    if (code === 'WAT') return 'hydroplant';
    if (code === 'NUC') return 'nuclearplant';
    if (code === 'NG') return 'gasplant';
    if (/^(BIT|SUB|LIG|WC)$/.test(code)) return 'coalplant';
    if (code === 'MSW') return 'wasteplant';
    if (/^(LFG|OBG|WDS|BLQ|OBS|AB|OBL)$/.test(code)) return 'biomassplant';
    if (/^(DFO|RFO|JF|KER|PC|PG)$/.test(code)) return 'oilplant';
    if (code === 'MWH') return 'batteryplant';
    return 'pplant';
  }
  function type(f) {
    if (f.layer === 'tour') return f.type;
    var p = pof(f), id = f.layer;
    if (id === 'signalLines') return p.TYPE === 'FIBER' ? 'signalfiber' : p.TYPE === 'COPPER' ? 'signalcopper' : p.TYPE === 'RADIO' ? 'signalradio' : p.TYPE === 'EMPTY' ? 'emptyconduit' : 'signalconnection';
    if (id === 'rwmwdStructures') return /outlet|outfall/i.test(p.STRCT_TYPE || '') ? 'stormoutfall' : /manhole/i.test(p.STRCT_TYPE || '') ? 'stormmanhole' : /catch basin|inlet|intake/i.test(p.STRCT_TYPE || '') ? 'storminlet' : 'stormstructure';
    if (id==='waterworks') return confirmedWaterFacilities[p.i]?confirmedWaterFacilities[p.i].type:'waterfacility';
    if (id === 'plants' && retiredRecord(p)) return 'tplantGhost';
    if (id === 'interceptors') {
      if (retiredRecord(p)) return 'abandonedsewer';
      if (/^Effluent/.test(p.type || '')) return 'effluent';
      if (/forcemain/i.test(p.type || '')) return 'forcemain';
      if (/siphon/i.test(p.type || '')) return 'siphon';
      if (p.type === 'Gravity') return 'gravity';
      return 'interceptor';
    }
    if (id === 'buried' || id === 'streams') return {70:'culvert',71:'stormsewer',43:'aqueduct',72:'forcemain',90:'formerchannel'}[p.t] || config(f).type;
    if (id === 'pipelines') return {g:'gas',h:'steam',w:'waterpipe',f:'fuelpipe',a:'ammoniapipe'}[p.k] || 'pipeline';
    if (id === 'pipeStations') return p.pipeline === 'compressor' || p.pipeline === 'compressor_station' ? 'compressorstation' : 'pipestation';
    if (id === 'cables') return p.location === 'underground' ? 'undergroundpower' : 'powercable';
    if (id === 'dams') return p.waterway === 'lock_gate' || p.lock === 'yes' ? 'lock' : 'dam';
    if (id === 'bedrock') return p.u && p.u.trim() ? 'bedrock-' + p.u.trim() : 'bedrock-window';
    if (id === 'osmPowerplants') return plantKinds[p.src] || 'pplant';
    if (id === 'powerplants') {
      var codes = p.fuels || [], candidates = codes.map(fuelKind);
      return candidates.length && candidates.every(function(k) { return k === candidates[0]; }) ? candidates[0] : 'pplant';
    }
    if (id === 'generators') return fuelKind(p.fuel) === 'pplant' ? 'generator' : fuelKind(p.fuel);
    if (id === 'cleanup' && /tank/i.test(p.a || '')) return /underground/i.test(p.a) ? 'undergroundtank' : 'tank';
    return config(f).type || f.type || 'pipeline';
  }

  function name(f) {
    if (f.layer === 'tour') return f.name;
    var p = pof(f), id = f.layer, n = namedValue(p);
    if (id === 'troutBrook') return 'Trout Brook storm interceptor, segment ' + p.OBJECTID;
    if (id === 'rwmwdPipes') return (p.PROJECT || 'District storm pipe') + ', segment ' + p.OBJECTID;
    if (id === 'rwmwdStructures') return (p.Name || p.PROJECT || 'Storm structure') + ', record ' + p.OBJECTID;
    if (id === 'rwmwdPonds') return p.PROJECT || 'Stormwater pond ' + p.OBJECTID;
    if (id === 'signalLines') return (p.TYPE && p.TYPE.trim() ? p.TYPE.toLowerCase() : 'Unclassified') + ' signal connection, record ' + p.OBJECTID;
    if (id === 'hydrants') return 'Hydrant ' + (p.ASSET_ID || p.FID);
    if (id === 'generators') return (n || 'EIA plant ' + p.i) + ', generator ' + (present(p.g) ? p.g : 'unknown');
    if (id === 'plants') return (n || 'Regional treatment site') + (retiredRecord(p) ? ' (former plant)' : '');
    if (id === 'sheds') return p.WWTP ? p.WWTP + ' treatment service area' : 'Treatment service area, plant unreported';
    if (id === 'wells') return 'Well record ' + (p.i || 'number unavailable');
    if (id === 'bedrock') return p.d || p.u || 'Bedrock formation';
    if (id === 'surficial') return n || [p.description, p.lithology].filter(Boolean).join(': ') || 'Glacial or recent deposit';
    if (id === 'buried' && !n) return hydroTypes[p.t] || 'Buried watercourse record';
    if (id === 'pipelines') return n || (p.substance ? titlecase(p.substance) + ' pipeline' : 'Pipeline, substance unreported');
    if (id === 'pipeStations') return n || (p.pipeline === 'valve' ? 'Pipeline valve' : 'Pipeline station or control');
    if (id === 'telephoneAreas') return (n || p.wirecenter || 'Telephone') + ' exchange territory';
    if (id === 'protection') return (n || 'Public water supply') + ' protection area';
    if (id === 'vulnerability') return (n || 'Public water supply') + ', ' + (p.v || 'unreported') + ' vulnerability';
    if (id === 'rail') return (p.operator || 'Railroad') + (n ? ', subdivision ' + n : ' route');
    if (n) return n;
    return {interceptors:'Regional sewer segment', lifts:'Lift station', meters:'Sewer flow meter', substations:'Substation', powerplants:'EIA generating site', osmPowerplants:'Mapped generating site', power:'Transmission line', feeders:'Local electric line', cables:p.location === 'underground' ? 'Tagged underground power cable' : 'Power cable, location unreported', hydrants:'Fire hydrant', inlets:'Storm inlet', towers:'Water tower', waterworks:'Mapped water facility', comms:'Mapped data center', exchanges:'Recorded telephone exchange', cleanup:'Cleanup or tank program record', groundwater:'Groundwater area of concern', groundwaterSources:'Potential groundwater source area', groundwaterBounds:'Groundwater boundary record', groundwaterSites:'Groundwater investigation site', groundwaterUnmapped:'Groundwater site without mapped area', streams:'DNR watercourse segment', faults:'Mapped bedrock fault', electricAreas:'Electric utility territory', osmWastewater:'Mapped wastewater site'}[id] || 'Mapped feature';
  }

  function displayDate(v, compact) {
    if (!present(v) || v === 0) return 'Not reported';
    if (compact || /^\d{8}$/.test(String(v))) {
      var s = String(v), y = +s.slice(0,4), m = +s.slice(4,6), d = +s.slice(6,8);
      if (m === 0 && d === 0) return String(y) + ' (month and day unreported)';
      if (m < 1 || m > 12 || d < 1 || d > 31) return s + ' (source date)';
      return displayDate(Date.UTC(y,m-1,d));
    }
    if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v)) return v;
    var date = new Date(v);
    return isNaN(date.getTime()) ? String(v) : date.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
  }
  function fuelLabel(code) { return (fuelNames[code] || 'Unmapped source code') + ' (' + code + ')'; }
  function facts(f) {
    if (f.layer === 'tour' || f.layer === 'depth') return f.facts || [];
    var p = pof(f), id = f.layer, rows = [], used = {};
    function add(label, value, field) { if (present(value)) rows.push([label, String(value)]); if (field) used[field] = true; }
    function field(label, key, unit, unknown) { add(label, present(p[key]) ? (typeof p[key] === 'number' && !/^(?:i|id|y|OBJECTID|FID|YEAR_INST_|YEAR_INST)$/.test(key) ? number.format(p[key]) : p[key]) + (unit || '') : unknown ? 'Not reported' : null, key); }
    function date(label, key, compact) { if (present(p[key])) add(label, displayDate(p[key],compact),key); }
    function code(label, key, table) { add(label, present(p[key]) ? (table[String(p[key]).trim()] || 'Unmapped code') + ' (' + p[key] + ')' : 'Not reported',key); }


    if (id === 'troutBrook') {field('Source ObjectID','OBJECTID');add('System','Trout Brook storm interceptor');add('Route meaning','Published alignment clipped to Saint Paul');add('Pipe dimensions','Not supplied in the public view');}
    if (/^rwmwd/.test(id)) {
      field('Source ObjectID','OBJECTID');field('Project','PROJECT');field('Published structure type','STRCT_TYPE');field('Pipe size, source units unspecified','PIPE_SIZE');field('Original length, source units unspecified','PIPE_LNGTH');field('Material code','PIPE_MAT');field('Shape','PIPE_SHP');field('Owner','PIPE_OWNER');
      if (p.YEAR_INST_ > 0) field('Installation year','YEAR_INST_');if(p.YEAR_INST > 0)field('Installation year','YEAR_INST');
      field('Inlet invert, source units unspecified','Inlt_InvEle');field('Outlet invert, source units unspecified','Out_InvElev');field('Published directionality','Directionality');field('Outlet type','OUTLETTYPE');field('Trash rack','TRASHRACK');field('Basin type','BASIN_TYPE');field('Published status','STR_STAT');field('Published condition','STR_COND');field('Published owner','STR_OWNAM');field('Maintenance owner','STR_MAINN');field('Source notes','Notes');field('Additional source notes','Note2');
      add('Coverage','District-owned infrastructure inside Saint Paul; partial municipal coverage');add('Units and datum','Unspecified size and elevation units are not inferred');
    }
    if (id === 'hydrants') {field('Hydrant asset ID','ASSET_ID');field('Published location','LOCATION');add('Snapshot','December 2021');add('Record meaning','Hydrant point, not the route of a water main');}
    if (id === 'signalLines') {field('City ObjectID','OBJECTID');field('Published connection type','TYPE');add('Network','Traffic signals');add('Location','Burial is not established by this line record');add('Coverage','Not a residential broadband-availability map');}

    if (['interceptors','plants','lifts','meters'].indexOf(id) >= 0) {
      field('Published status','s','',true); field('Record identifier','i'); field('Operator / owner','operator'); date('Record source date','date');
      if (id === 'interceptors') { field('Published pipe type','type','',true);field('Length','l',' ft');field('Shape classification','shape'); }
      if (id === 'plants') { field('Municipality','city');field('County','county');field('Opened','opened');field('Closed','closed');field('Abandoned','abandoned');field('Abbreviation','abbr'); }
      if (id === 'lifts' || id === 'meters') field('Associated interceptor','interceptor');
    }
    if (id === 'sheds') field('Treatment plant','WWTP','',true);
    if (id === 'buried' || id === 'streams') {
      add('DNR segment class',p.type || hydroTypes[p.t] || 'Unmapped or unreported class','type'); field('DNR class code','t');field('DNR hydrographic ID','i');field('DNR label','label');date('Content date','date');date('Published date','published');
    }
    if (id === 'wells') {
      field('Well unique number','i');
      if (p.d===0) add('Drilled depth','0 in source; depth unreported','d'); else field('Drilled depth','d',' ft',true);
      field('Reported depth to bedrock','b',' ft',true);code('Aquifer','a',wellAquifers);
      code('Recorded well status','s',{A:'Active',I:'Inactive',S:'Sealed',T:'Temporarily sealed',U:'Unknown'});code('Recorded use','u',wellUses);code('Well-ID verification method','q',wellVerification);code('Coordinate derivation method','coordinateMethod',wellCoordinates);code('Geologic interpretation method','geologyMethod',wellGeology);date('Drilled','y',true);date('Record updated','updated',true);
      add('Depth interpretation','Reported bedrock depth can reflect a geologic interpretation, not necessarily a field measurement');
      add('Coordinate classes','Historical method codes do not measure the error of each current point');
      add('Coverage','Located County Well Index records excluding public-water-supply wells');
    }
    if (id === 'bedrock') {field('Map unit','u');field('Formation description','d');}
    if (id === 'surficial') {
      field('Map unit','unit');field('Deposit description','description');field('Lithology','lithology');field('Soil texture','texture');field('Depositional environment','environment');field('Deposit continuity','deposit');field('Age','age');field('Formation','formation');field('Glacial lobe','lobe');date('Record edited','date');
    }
    if (/^groundwater/.test(id)) {
      field('MPCA project ID','id');field('MPCA item ID','i');field('Project','project');field('Project type','t');field('Published status','s','',true);field('Mapped medium','media');field('Boundary certainty','certainty');field('Mapping method','method');date('Drawn','date');
      if (id === 'groundwaterUnmapped') add('Mapped area','No area boundary supplied in this layer');
    }
    if (id === 'cleanup') {
      field('MPCA site ID','id');field('Program','p');field('Activity','a');add('Program active flag',p.s === 'Y' ? 'Yes (Y)' : p.s === 'N' ? 'No (N)' : p.s || 'Not reported','s');
    }
    if (id === 'towers') {
      var tower = historicTowers[p.i];
      add('Confirmed storage status',tower ? tower.status : 'Not established by this snapshot');
    }
    if (id==='waterworks') {
      var facility=confirmedWaterFacilities[p.i];
      add('Facility purpose',facility?facility.purpose:'Not confirmed by the water_works tag');
      add('Operating status','Not established by this snapshot');
    }
    if (id === 'inlets') {field('Source inlet code','v');add('Coverage','Published subset, not every physical inlet');}
    if (id === 'protection') {
      field('Management area ID','i');field('Public water system ID','pws');
      code('Delineation type','t',{A:'Aquifer delineation',C:'Conjunctive delineation',F:'Fractured rock delineation',FC:'Fractured rock delineation',FA:'Fractured rock delineation'});
      code('Capture zones','zone',{S:'Single',M:'Multiple',C:'Complex, overlapping or adjacent'});field('Source status code','s');date('Approval date','date');
    }
    if (id === 'vulnerability') {field('Vulnerability rating','v','',true);field('Vulnerability code','code');field('Management area ID','area');field('Vulnerability polygon ID','i');field('Source status code','s');field('Source','source');field('Source notes','notes');}
    if (id === 'electricAreas') {field('Published utility name','utility');field('Utility type','t');field('Municipal flag','municipal');date('Edited','date');}
    if (id === 'telephoneAreas') {
      field('Published operator','operator');field('Wire center','wirecenter');code('Boundary type','boundary',{SA:'Study area',EX:'Exchange',WC:'Wire center'});
      add('FCC frozen-support flag',p.frozen === 'Y' ? 'Yes (Y)' : p.frozen === 'N' ? 'No (N)' : p.frozen || 'Not reported','frozen');
    }
    if (id === 'rail') {field('Railroad code','operator');field('Parent railroad code','parent');field('Subdivision','n');field('Crossing ID','i');field('Movement count year','year');field('Inventory total trains','trains');field('Maximum speed, source field','speed');field('Route length','mi',' mi');}
    if (id === 'powerplants' || id === 'generators') {
      field('EIA plant ID','i');field('Reported inventory category','status');field('Operator','operator');add('Reporting period','August 2026 EIA-860M');
      if (id === 'powerplants') {
        field('Operating-sheet nameplate capacity','mw',' MW');field('Planned nameplate capacity','plannedMW',' MW');field('Retired nameplate capacity','retiredMW',' MW');
        add('Capacity meaning','Operating-sheet total includes standby and temporarily out-of-service units');
        add('Operating-sheet fuels',(p.fuels || []).map(fuelLabel).join('; '),'fuels');add('Operating-sheet technologies',(p.technologies || []).join('; '),'technologies');
        (p.units || []).forEach(function(u) {
          var v = [u.status || u.stage || 'Status unreported',present(u.mw) ? number.format(u.mw) + ' MW nameplate' : null,u.technology,u.fuel ? fuelLabel(u.fuel) : null,
            u.opened ? 'opened ' + u.opened : null,u.retired ? 'retired ' + u.retired : null,u.plannedRetirement ? 'planned retirement ' + u.plannedRetirement : null,u.plannedOperation ? 'planned operation ' + u.plannedOperation : null].filter(Boolean);
          add('Generator ' + u.g,v.join('; '));
        });
      } else {
        field('Generator ID','g');field('Workbook category','stage');field('Nameplate capacity','mw',' MW');field('Summer capacity','summerMW',' MW');field('Technology','technology');add('Fuel',p.fuel ? fuelLabel(p.fuel) : 'Not reported','fuel');
        field('Opened','opened');field('Retired','retired');field('Planned retirement','plannedRetirement');field('Planned operation','plannedOperation');
      }
    }

    // OSM IDs distinguish individual records and lead back to their tag history.
    if (/^(?:node|way|relation)\/\d+$/.test(String(p.i || ''))) {
      field('OpenStreetMap record','i');field('Operator tag','operator','',true);
      if (['power','feeders','cables','substations'].indexOf(id) >= 0) {
        field('Voltage tag, volts','voltage','',true);field('Maximum tagged voltage','v',' kV');field('Location tag','location','',true);
      }
      if (id === 'pipelines' || id === 'pipeStations') {field('Substance tag','substance','',true);field('Location tag','location','',true);field('Pipeline equipment tag','pipeline');}
      if (id === 'osmPowerplants') {field('Energy-source tag','src','',true);field('Output tag','capacity','',true);add('Capacity meaning','OSM tagged output, not the August 2026 EIA inventory');}
      // Keep remaining non-derived tags legible instead of discarding information.
      var tagLabels = {power:'Power class',man_made:'Structure class',waterway:'Waterway class',telecom:'Telecom class',building:'Building tag',lock:'Lock tag',start_date:'Start-date tag',end_date:'End-date tag',height:'Height tag',diameter:'Diameter tag',usage:'Usage tag',pressure:'Pressure tag',frequency:'Frequency tag',circuits:'Circuits tag',cables:'Cables tag',wires:'Wires tag',ref:'Reference tag',owner:'Owner tag',capacity:'Output tag',substation:'Substation type',voltage:'Voltage tag, volts'};
      Object.keys(p).forEach(function(k) {
        if (used[k] || ['i','name','n','mw','k','v','wikipedia','wikidata','url'].indexOf(k) >= 0) return;
        add(tagLabels[k] || 'OSM ' + k,p[k],k);
      });
      field('Wikidata identifier','wikidata');
    }
    if (config(f).native) (config(f).metadata && config(f).metadata.sourceFields || []).forEach(function(d){if(used[d.name] || d.name === 'FID')return;var value=p[d.name];if(present(value))add(d.alias || d.name,d.type === 'esriFieldTypeDate' ? displayDate(value) : value,d.name);});
    return rows;
  }

  function wiki(f) {
    if (f.wiki) return f.wiki;
    var w = pof(f).wikipedia;
    if (!w) return '';
    if (/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//i.test(w)) return w;
    var m = /^([a-z-]+):(.+)$/.exec(w);
    return m ? 'https://' + m[1] + '.wikipedia.org/wiki/' + encodeURIComponent(m[2].replace(/ /g,'_')) : '';
  }
  function recordURL(f) {
    var p = pof(f);
    if (config(f).native && config(f).source) return config(f).source.url + '/query?f=pjson&where=' + encodeURIComponent((config(f).oid || 'OBJECTID') + '=' + p[config(f).oid || 'OBJECTID']) + '&outFields=' + encodeURIComponent((config(f).metadata.sourceFields || []).map(function(d){return d.name;}).join(','));
    if (/^https?:\/\//i.test(p.url || '')) return p.url;
    if (/^(?:node|way|relation)\/\d+$/.test(String(p.i || ''))) return 'https://www.openstreetmap.org/' + p.i;
    // Source territories carry bare hostnames in their published website field.
    if (f.layer === 'electricAreas' && /^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(p.url || '')) return 'https://' + p.url;
    return '';
  }
  function isNamed(f) {
    if (f.layer === 'tour') return true;
    if (/^rwmwd/.test(f.layer)) return !!pof(f).PROJECT;
    if (f.layer === 'troutBrook') return true;
    return !!namedValue(pof(f)) || ['bedrock','surficial','electricAreas'].indexOf(f.layer) >= 0;
  }
  function status(f) {
    var p = pof(f);
    if (f.layer === 'signalLines') return p.TYPE === 'ABANDONED' ? 'Abandoned' : '';
    if (['plants','interceptors','lifts','meters'].indexOf(f.layer) >= 0) return p.s || 'Status unreported';
    if (f.layer === 'generators' || f.layer === 'powerplants') return p.status || p.stage || 'Status unreported';
    if (f.layer === 'towers' && historicTowers[p.i]) return historicTowers[p.i].status;
    return '';
  }
  function isVisible(f, showInactive) {
    if (showInactive) return true;
    if (f.layer === 'signalLines') return pof(f).TYPE !== 'ABANDONED';
    var p = pof(f), id = f.layer;
    if (['plants','interceptors','lifts','meters'].indexOf(id) >= 0) return !/^(offline|abandoned|removed|closed)$/i.test(p.s || '');
    if (id === 'powerplants') return p.status === 'Operating';
    if (id === 'generators') return p.stage === 'Operating' && /^\((?:OP|SB)\)/.test(p.status || '');
    return true;
  }
  function color(f) {
    var p = pof(f);
    if (f.color) return f.color;
    if (f.layer === 'signalLines' && p.TYPE === 'ABANDONED') return C.faint;
    if (f.layer === 'pipelines') return {g:C.gas,h:C.net,w:C.water,f:C.power,a:C.ground,o:C.ground}[p.k] || C.faint;
    if (f.layer === 'generators' && p.stage !== 'Operating') return C.faint;
    if (retiredRecord(p) && ['plants','lifts','meters','interceptors','powerplants'].indexOf(f.layer) >= 0) return C.faint;
    return config(f).color || C.cream;
  }
  function lineStyle(f) {
    var p = pof(f);
    if (f.layer === 'signalLines') return {dash:p.TYPE === 'RADIO' ? [2,5] : p.TYPE === 'EMPTY' || p.TYPE === 'ABANDONED' ? [4,4] : [],opacity:p.TYPE === 'ABANDONED' ? .45 : 1};
    if (f.layer === 'interceptors') return {dash:retiredRecord(p) ? [3,5] : /forcemain/i.test(p.type || '') ? [7,4] : /siphon/i.test(p.type || '') ? [1,3] : [],opacity:p.s === 'Online' ? 1 : .45};
    if (f.layer === 'cables') return {dash:[5,3],opacity:p.location === 'underground' ? .9 : .45};
    if (f.layer === 'groundwaterBounds') return {dash:/uncertain|inferred|approximate/i.test(p.certainty || '') ? [5,4] : [],opacity:.9};
    return {dash:[],opacity:1};
  }
  var wellReferences = {
    EB:['Exploration boring record','Borehole'], EX:['Exploration well or borehole record','Borehole'],
    EL:['Elevator boring record','Borehole'], MW:['Monitoring well record','Well'],
    OB:['Observation well record','Well'], PZ:['Piezometer record','Hydraulic_head'],
    HP:['Heat-pump well record','Ground_source_heat_pump']
  };
  function typeInfo(f) {
    if (f.layer === 'rwmwdPipes' && pof(f).PIPE_MAT === 'RCP') return {label:'Reinforced-concrete storm pipe',wiki:'https://en.wikipedia.org/wiki/Reinforced_concrete',description:'The district classifies this storm pipe as RCP, reinforced concrete pipe. Size and installation year are displayed only when supplied in the record.'};
    if (f.layer === 'wells') {
      var use=String(pof(f).u || '').trim(), known=wellReferences[use], supply=/^(?:DO|IR|LA|LN|MD|MU|PC|PN|PP|PS)$/.test(use);
      var entry=known || (supply?['Recorded water well','Water_well']:['Recorded well or borehole','Borehole']);
      return {label:entry[0],wiki:'https://en.wikipedia.org/wiki/'+entry[1],description:'A County Well Index record. '+(wellUses[use]?'Its reported use is '+wellUses[use].toLowerCase()+'. ':'Its use is not established by the available code. ')+'Status, depth and location methods come from the published record.'};
    }
    if (f.layer === 'towers') {
      var tower = historicTowers[pof(f).i];
      return {label:'Water tower',wiki:'https://en.wikipedia.org/wiki/Water_tower',description:tower ? 'This tower remains standing after its water-storage service ended. ' + tower.status + '.' : 'An elevated tank can store water and supply pressure to a network. Historic towers can remain standing after water storage ends; this snapshot does not establish each tower’s present use.'};
    }
    return kinds[type(f)] || null;
  }
  function primarySources(f) {
    if (f.layer === 'troutBrook') return [{label:'Trout Brook history and photographs',url:'https://www.capitolregionwd.org/our-water/stormwater-runoff/trout-brook-storm-sewer-interceptor/'}];
    var facility=f.layer==='waterworks' && confirmedWaterFacilities[pof(f).i];
    if (facility) return [{label:'Primary facility purpose',url:facility.url}];
    var tower = f.layer === 'towers' && historicTowers[pof(f).i];
    if (tower) return [{label:'Tower storage status',url:tower.url}];
    return f.layer === 'wells' ? [{label:'Well code definitions',url:'https://arcgis.web.health.state.mn.us/arcgis/rest/services/3GADX/MWIMap/MapServer'},{label:'Well status definitions',url:'https://mgsweb2.mngs.umn.edu/cwi_doc/status.asp'},{label:'Well-ID verification codes',url:'https://mgsweb2.mngs.umn.edu/cwi_doc/loc_mc.asp'},{label:'Coordinate method codes',url:'https://mgsweb2.mngs.umn.edu/cwi_doc/gcmcode.asp'},{label:'Geologic interpretation codes',url:'https://mgsweb2.mngs.umn.edu/cwi_doc/str_meth.asp'}] : [];
  }
  function sourceNotes(f) {
    var m = manifestByFile[config(f).file], notes = m && m.source && m.source.caveats || [];
    return notes.filter(function(note,index) { return notes.indexOf(note)===index; });
  }
  function applyManifest(m) {
    manifestByFile = {};
    (m && m.datasets || []).forEach(function(d) { manifestByFile[d.file] = d; });
    Object.keys(layers).forEach(function(id) {
      var cfg = layers[id], d = manifestByFile[cfg.file];
      if (!d) return;
      cfg.datasetId = d.id; cfg.count = d.featureCount == null ? d.recordCount : d.featureCount;
      cfg.metadata = d; cfg.source = d.source || {};
    });
  }

  function contains(lon,lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    var boundary=window.UnderStreetBoundary;
    if (!boundary) return false;
    var g=boundary.features[0].geometry, polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    return polygons.some(function(rings){
      var inside=false,onEdge=false;
      rings.forEach(function(r){for(var i=0,j=r.length-1;i<r.length;j=i++){
        var a=r[i],b=r[j],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
        if(length){var t=Math.max(0,Math.min(1,((lon-a[0])*dx+(lat-a[1])*dy)/length));if(Math.hypot(lon-a[0]-t*dx,lat-a[1]-t*dy)<1e-10)onEdge=true;}
        if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }});
      return inside||onEdge;
    });
  }
  window.UnderStreetData = {lineGroups:lineGroups,topics:topics,layers:layers,name:name,type:type,facts:facts,wiki:wiki,isNamed:isNamed,status:status,isVisible:isVisible,typeInfo:typeInfo,recordURL:recordURL,primarySources:primarySources,color:color,lineStyle:lineStyle,sourceNotes:sourceNotes,applyManifest:applyManifest,displayDate:displayDate,contains:contains};
}());
