/* Dataset and feature interpretation for the Twin Cities infrastructure map.
 * Geometry stays in the exports. This registry keeps source-specific meaning
 * out of the renderer, including units, lifecycle states and missing values.
 */
(function () {
  'use strict';

  var C = { water:'#8fb3c7', sewer:'#9ec79a', power:'#d9978c', gas:'#dfc288', net:'#cf9f78', ground:'#b79bc4', cream:'#e8e2d6', faint:'#a4a293' };
  var number = new Intl.NumberFormat('en-US', { maximumFractionDigits:2 });
  var manifestByFile = {};

  function layer(title, file, kind, color, type, minZ, on, note) {
    return { title:title, file:file, kind:kind, color:color, type:type,
      minZ:minZ || 0, on:on !== false, note:note || '' };
  }

  // Existing IDs are kept so shared map links and the rendering styles survive.
  var layers = {
    waterworks:layer('Mapped water facilities', 'data/osm-waterworks.json', 'point', C.water, 'waterfacility', 0, true, 'The water_works tag alone does not establish treatment or drinking-water use'),
    towers:layer('Water towers', 'data/osm-water-towers.json', 'point', C.water, 'tower', 0, true, 'OSM snapshot; includes historic towers'),
    services:layer('Minneapolis service connections', 'data/service-lines.json.gz', 'point', C.water, 'service', 14, true, 'Material inventory, not pipe routes or water tests'),
    hydrants:layer('Minneapolis hydrants', 'hydrants.json', 'point', C.power, 'hydrant', 13.4, false, 'June 2020 snapshot; no public bury-depth values'),
    protection:layer('Drinking-water protection areas', 'data/drinking-water-protection.json', 'polygon', C.water, 'protection', 0, false, 'MDH management boundaries, not water-service territories'),
    vulnerability:layer('Drinking-water vulnerability', 'data/drinking-water-vulnerability.json', 'polygon', C.ground, 'vulnerability', 0, false, 'MDH source-water vulnerability, not measured contamination'),
    interceptors:layer('Regional sewer pipes', 'data/mces-interceptors.json', 'line', C.sewer, 'interceptor', 0, true, 'MCES records include online, offline, abandoned and removed segments'),
    plants:layer('Regional treatment plants', 'data/mces-treatment-plants.json', 'point', C.sewer, 'tplant', 0, true, 'Nine online plants plus former sites'),
    wspSanitary:layer('West Saint Paul sanitary pipes', 'data/wsp-sanitary-pipes.json', 'line', C.sewer, 'sanitary', 12, true, 'Municipal pipe geometry; sparse material and installation fields'),
    lifts:layer('Regional lift stations', 'data/mces-lift-stations.json', 'point', C.sewer, 'lift', 11, false, 'Published status distinguishes online and other records'),
    meters:layer('Regional flow meters', 'data/mces-flow-meters.json', 'point', C.sewer, 'meter', 12, false, 'Includes non-operating records'),
    sheds:layer('Treatment service areas', 'sewersheds.json', 'polygon', C.sewer, 'sewershed', 0, false, 'Plant service boundaries; no building-to-plant pipe tracing'),
    wspSanManholes:layer('West Saint Paul sanitary manholes', 'data/wsp-sanitary-manhole.json', 'point', C.sewer, 'wspSanManhole', 14, false, 'Municipal structure inventory'),
    osmWastewater:layer('Other mapped wastewater sites', 'data/osm-wastewater-plants.json', 'point', C.sewer, 'tplant', 0, false, 'OSM facilities may overlap the MCES inventory'),
    buried:layer('Buried watercourse records', 'streamsug.json', 'line', C.water, 'bstream', 0, true, 'DNR classes include culverts, storm sewers and former channels'),
    bassettPlan:layer('Bassett Creek engineering overview, 2025', 'data/bassett-plan-routes.json', 'line', C.water, 'bassettTunnel', 0, true, 'Three published project phases; approximate routes, not surveyed pipe locations'),
    inlets:layer('Minneapolis storm inlets', 'inlets.json', 'point', C.water, 'inlet', 13.4, true, '6,000 published points; city describes nearly 29,000 inlets'),
    wspStorm:layer('West Saint Paul storm pipes', 'data/wsp-storm-pipes.json', 'line', C.water, 'stormsewer', 12, true, 'Published width and length units are not documented'),
    wspInlets:layer('West Saint Paul street catch basins', 'data/wsp-storm-inlets.json', 'point', C.water, 'wspInlets', 14, false, 'Street catch-basin layer; yard and special basins are separate'),
    wspStormManholes:layer('West Saint Paul storm manholes', 'data/wsp-storm-manhole.json', 'point', C.water, 'wspStormManhole', 14, false, 'Municipal structure inventory'),
    streams:layer('DNR watercourse network', 'data/surface-streams.json', 'line', C.water, 'surfacewater', 11, false, 'Includes surface and other segment types; inspect the DNR class'),
    dams:layer('Mapped dams and navigation locks', 'data/osm-dams-locks.json', 'point', C.water, 'dam', 0, false, 'OSM snapshot; points can represent centers of mapped structures'),
    power:layer('Mapped transmission lines', 'data/osm-power-lines.json', 'line', C.power, 'transmission', 0, true, 'OSM snapshot; location and voltage shown only when tagged'),
    substations:layer('Substations', 'data/osm-substations.json', 'point', C.power, 'sub', 0, true, 'OSM snapshot; incomplete utility inventory'),
    powerplants:layer('EIA generating-site inventory', 'data/eia-power-plants.json', 'point', C.gas, 'pplant', 0, true, 'August 2026 inventory; approximate federal site coordinates'),
    generators:layer('EIA generator records', 'data/eia-generators.json', 'point', C.gas, 'generator', 13, false, 'Units share plant coordinates; status is reported, not live'),
    osmPowerplants:layer('OSM generating sites', 'data/osm-power-plants.json', 'point', C.gas, 'pplant', 0, false, 'Tagged output and fuel; no automatic match to EIA plants'),
    feeders:layer('Mapped local electric lines', 'data/osm-power-minor.json', 'line', C.power, 'distribution', 12, false, 'Partial OSM coverage of distribution lines'),
    cables:layer('Mapped power cables', 'data/osm-power-cables.json', 'line', C.power, 'powercable', 11, false, '463 tagged underground; 12 have no location tag'),
    electricAreas:layer('Electric utility service areas', 'data/electric-service-areas.json', 'polygon', C.power, 'electricarea', 0, false, 'Utility territory context, not cable routes or a legal survey'),
    pipelines:layer('Pipelines by recorded substance', 'data/osm-pipelines.json', 'line', C.gas, 'pipeline', 0, true, '292 of 425 have no substance tag; gas includes landfill gas'),
    pipeStations:layer('Pipeline stations and controls', 'data/osm-pipeline-stations.json', 'point', C.gas, 'pipestation', 11, true, 'Includes valves; a station name does not establish substance'),
    comms:layer('Mapped data centers', 'data/osm-data-centers.json', 'point', C.net, 'dc', 0, true, 'OSM equipment sites; street fiber routes are absent'),
    exchanges:layer('Recorded telephone exchanges', 'data/osm-telephone-exchanges.json', 'point', C.net, 'exch', 0, true, 'An OSM exchange tag does not confirm present building use'),
    telephoneAreas:layer('Telephone exchange territories', 'data/telephone-service-areas.json', 'polygon', C.net, 'telephonearea', 0, false, 'Legacy operator and exchange boundaries, not broadband coverage'),
    rail:layer('Rail routes crossing the street network', 'data/rail-routes.json', 'line', C.net, 'rail', 11, false, 'MnDOT inventory; train-count years vary and are not live schedules'),
    depth:layer('Modeled depth to bedrock, 2025', 'data/bedrock-depth-2025.json', 'raster', C.ground, 'bdepth', 0, true, 'MGS D-03; browser sampling about 120 m, depth in feet'),
    bedrock:layer('Bedrock formations', 'bedrock.json', 'polygon', C.ground, 'bedrock', 0, false, 'Rock formations below the glacial and recent deposits'),
    faults:layer('Mapped bedrock faults', 'bedrockfaults.json', 'line', C.ground, 'fault', 0, true, 'Geologic map interpretation, not a current movement measurement'),
    surficial:layer('Glacial and recent deposits', 'data/surficial-geology.json', 'polygon', C.gas, 'surficial', 0, false, 'MGS D-01; generalized polygons for regional viewing'),
    wells:layer('Recorded wells and boreholes', 'data/wells-complete.json.gz', 'point', C.cream, 'well', 14, true, '110,839 located CWI records; includes sealed and other statuses'),
    groundwater:layer('Groundwater areas of concern', 'data/groundwater-areas.json', 'polygon', C.net, 'groundwater', 0, false, 'MPCA mapped areas; status and mapping dates vary'),
    groundwaterBounds:layer('Groundwater boundary certainty', 'data/groundwater-boundaries.json', 'line', C.net, 'groundwaterBoundary', 0, false, 'Boundary lines retain the published certainty classification'),
    groundwaterSources:layer('Potential groundwater source areas', 'data/groundwater-source-areas.json', 'polygon', C.power, 'groundwaterSource', 0, false, 'Potential source areas differ from mapped groundwater plumes'),
    groundwaterSites:layer('Groundwater investigation sites', 'data/groundwater-sites.json', 'point', C.net, 'groundwaterSite', 0, false, 'Project anchors associated with mapped groundwater areas'),
    groundwaterUnmapped:layer('Groundwater sites without mapped areas', 'data/groundwater-sites-unmapped.json', 'point', C.net, 'groundwaterSite', 0, false, 'A site point does not establish a plume boundary'),
    cleanup:layer('Cleanup and tank program records', 'data/cleanup-sites.json', 'point', C.net, 'cleanup', 13, false, 'Program enrollment alone does not establish current contamination'),
    pavement:layer('Minneapolis street condition, 2015', 'data/pavement-all.json', 'line', C.gas, 'pavement', 12, false, 'Historical export; 8,699 of 12,184 sections have no rating')
  };
  layers.services.tileIndex = 'data/service-lines-tiles.json';
  layers.wells.tileIndex = 'data/wells-complete-tiles.json';
  ['services','interceptors','plants','lifts','meters','wspSanitary','wspSanManholes','powerplants','generators'].forEach(function(id) { layers[id].hasInactive = true; });

  // Municipal snapshots retain native field names, aliases and domains. Their
  // shared interpretation below never fills a missing measurement or status.
  var municipalLayers = {
    maplewoodSanitary:['Maplewood-area sanitary pipes','maplewood-sanitary','sanitary','sanitary',C.sewer,true,'Includes regional, neighboring and private ownership'],
    maplewoodForce:['Maplewood-area force mains','maplewood-force','force','forcemain',C.sewer,false,'Pumped sanitary pipes; source units are unspecified'],
    maplewoodStorm:['Maplewood-area storm pipes','maplewood-storm','storm','stormsewer',C.water,true,'City, county, state and private ownership are recorded'],
    mwmoNorthModel:['North Minneapolis stormwater model','mwmo-north-model','model','stormmodel',C.ground,false,'Model conduits; source comments retain assumptions'],
    bloomWater:['Bloomington-area water mains','bloomington-water','water','watermain',C.water,true,'Supply, raw-water, private and neighboring mains included'],
    bloomServices:['Bloomington-area water services','bloomington-services','service','waterserviceline',C.water,false,'Published line alignments; addresses are omitted'],
    bloomSanitary:['Bloomington-area sanitary pipes','bloomington-sanitary','sanitary','sanitary',C.sewer,true,'Gravity, force-main, regional and private types included'],
    bloomStorm:['Bloomington-area storm pipes','bloomington-storm','storm','stormsewer',C.water,true,'Published diameter inches, length feet and slope percent'],
    bloomPrivateStorm:['Bloomington private storm pipes','bloomington-private-storm','privateStorm','stormsewer',C.water,false,'Separate inventory; width and length units unspecified'],
    bloomCulverts:['Bloomington-area culverts','bloomington-culverts','culvert','culvert',C.water,false,'Published size kept without an assumed diameter unit'],
    bloomDrainTile:['Bloomington storm drain tile','bloomington-drain-tile','drainTile','draintile',C.water,false,'Diameter units are unspecified in the source'],
    bloomConduit:['Bloomington underground utilities','bloomington-conduit','conduit','cityconduit',C.net,false,'Recorded electrical, telephone, gas and other contents'],
    eaganWater:['Eagan-area water mains','eagan-water','water','watermain',C.water,true,'Potable and raw-water types; native lifecycle retained'],
    eaganServices:['Eagan-area water lateral lines','eagan-services','service','waterserviceline',C.water,false,'Includes explicitly assumed and plan-derived geometry'],
    eaganSanitary:['Eagan-area sanitary pipes','eagan-sanitary','sanitary','sanitary',C.sewer,true,'Gravity, lateral and force-main source layers retained'],
    eaganStorm:['Eagan-area storm pipes','eagan-storm','storm','stormsewer',C.water,true,'Gravity, lateral and pressurized pipes; source units vary'],
    eaganFiberCable:['Eagan fiber cables','eagan-fiber-cable','fiber','fibercable',C.net,true,'Explicit fiber cable inventory; conflicting status fields retained'],
    eaganFiberPath:['Eagan utility paths','eagan-fiber-path','fiberPath','fiberpath',C.net,false,'A published utility path does not establish a laid cable']
  };
  Object.keys(municipalLayers).forEach(function(id) {
    var s=municipalLayers[id], cfg=layer(s[0],'data/municipal/'+s[1]+'.json','line',s[4],s[3],s[2]==='service'?15:12,s[5],s[6]);
    cfg.municipal=true; cfg.role=s[2]; cfg.hasInactive=s[2]!=='model';
    layers[id]=cfg;
  });

  var topics = {
    tour:{title:'Start with a place', text:'A river held up by a buried wall, a telephone hotel, a water tower. Pick a place to see what it does.', layers:[]},
    water:{title:'The drinking-water system', text:'Treatment plants, water towers and Minneapolis service connections. The city records connection materials; these points do not show buried mains. Map details adds hydrants and source-water protection.', layers:['waterworks','towers','services','hydrants','protection','vulnerability']},
    wastewater:{title:'Where sewage goes', text:'Regional pipes carry sewage to treatment plants. West Saint Paul also publishes local pipes. The regional inventory keeps abandoned and removed records alongside the online system.', layers:['interceptors','plants','wspSanitary','lifts','meters','sheds','wspSanManholes','osmWastewater']},
    storm:{title:'Rain, creeks and the river', text:'Storm drains carry runoff toward waterways. The Bassett Creek engineering overview separates its three tunnel phases. Buried-watercourse records distinguish culverts, sewers, tunnels and former channels. Minneapolis publishes an inlet subset; West Saint Paul publishes local storm pipes.', layers:['buried','bassettPlan','inlets','wspStorm','streams','dams','wspInlets','wspStormManholes']},
    power:{title:'The electric grid', text:'Transmission lines, substations and the August 2026 EIA plant inventory. Map details adds generator status, tagged underground cables and utility territories. The mapped distribution network remains partial.', layers:['power','substations','powerplants','generators','cables','feeders','electricAreas','osmPowerplants']},
    gas:{title:'Pipelines and district heat', text:'Pipelines carry gas, steam, water, fuel and other substances. Many mapped pipes have no substance tag. Steam routes near the university show part of its heating network; local gas distribution is incomplete.', layers:['pipelines','pipeStations']},
    networks:{title:'Where networks connect', text:'Data centers and recorded telephone exchanges are connection points. Exchange territories describe legacy service boundaries. None of these layers supplies a street-level fiber network.', layers:['comms','exchanges','telephoneAreas','rail']},
    ground:{title:'The ground beneath the street', text:'The official 2025 depth model estimates how far down the rock lies. Well records add reported depths and geologic interpretations. Map details adds rock and sediment formations, groundwater investigations, and historical street condition.', layers:['depth','faults','wells','bedrock','surficial','groundwater','groundwaterBounds','groundwaterSources','groundwaterSites','groundwaterUnmapped','cleanup','pavement','protection','vulnerability']}
  };
  topics.water.layers.push('bloomWater','bloomServices','eaganWater','eaganServices');
  topics.wastewater.layers.push('maplewoodSanitary','maplewoodForce','bloomSanitary','eaganSanitary');
  topics.storm.layers.push('maplewoodStorm','bloomStorm','bloomPrivateStorm','bloomCulverts','bloomDrainTile','mwmoNorthModel','eaganStorm');
  topics.networks.layers.push('bloomConduit','eaganFiberCable','eaganFiberPath');
  topics.water.text='Treatment plants and towers supply the system. Minneapolis publishes connection-material points; Bloomington and Eagan publish water-main and lateral alignments. Native fields distinguish recorded, assumed and former routes.';
  topics.wastewater.text='Regional pipes carry sewage to treatment plants. West Saint Paul, Maplewood, Bloomington and Eagan publish local alignments. Their inventories retain ownership, force-main types and former records.';
  topics.storm.text='Storm drains carry runoff toward waterways. The Bassett Creek engineering overview separates three tunnel phases. Local pipe inventories cover West Saint Paul, Maplewood, Bloomington and Eagan; an optional North Minneapolis stormwater model preserves its assumptions.';
  topics.networks.text='Data centers and telephone exchanges mark connection points. Eagan publishes fiber cables separately from utility paths; Bloomington records underground utility contents. These snapshots do not establish complete provider coverage.';

  var serviceClasses = {1:'Lead', 2:'Non-lead', 3:'Unknown material', 4:'Galvanized requiring replacement'};
  var servicePurposes = {Commercial:'Commercial', Domestic:'Domestic', DomesticFire:'Domestic and fire', Fire:'Fire', Irrigation:'Irrigation', Storm:'Storm', NotaWaterService:'Not a water service'};
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
  var historicTowers = {
    'way/88405612':{status:'No longer used for water storage',url:'https://www.minneapolismn.gov/government/projects/washburn-water-tower/'},
    'way/95763640':{status:'No longer in service',url:'https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-sprws/highland-tower'},
    'way/175087241':{status:'Water-storage service ended in 1952',url:'https://www.minneapolisparks.org/parks-destinations/historical_sites/tower_hill_park/'},
    'way/230142974':{status:'No longer used for water storage',url:'https://www.health.state.mn.us/communities/environment/water/waterline/featurestories/mplsdist.html'},
    'way/896291899':{status:'Replaced for water storage in 1992; converted in 1993',url:'https://www.cityoflindstrom.us/1429/Kaffe-Kanna-Park-Coffee-Pot-Water-Tower'}
  };
  // Exact source IDs preserve verified treatment-plant photographs without
  // interpreting every water_works tag or a facility name as drinking-water use.
  var confirmedWaterFacilities = {
    'way/128646413':{type:'ww',purpose:'Drinking-water treatment at the Fridley campus',url:'https://www.minneapolismn.gov/government/departments/public-works/water-treatment-distribution/treatment-delivery/'},
    'way/217164192':{type:'ww',purpose:'Drinking-water filtration at the Columbia Heights plant',url:'https://www.minneapolismn.gov/government/departments/public-works/water-treatment-distribution/treatment-delivery/'},
    'way/1319645735':{type:'ww',purpose:'Drinking-water treatment at McCarrons',url:'https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-your-water'},
    'way/1323221824':{type:'ww',purpose:'Bloomington drinking-water treatment plant',url:'https://www.bloomingtonmn.gov/util/utilities-division'},
    'way/1039251010':{type:'waterpump',purpose:'Southwest Pump Station in the Minneapolis water system; pumping does not establish treatment',url:'https://www.minneapolismn.gov/media/-www-content-assets/documents/2026-2031-Capital-Budget-Requests.pdf'}
  };

  // Extra kinds reuse verified encyclopedia pages. The media catalog supplies
  // photos and the established kinds; these override only narrower meanings.
  var kinds = {
    waterfacility:{label:'Mapped water facility',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'OSM tags this record as water_works. That tag alone does not establish treatment, drinking-water use or current operation. Names and operators remain source tags; some tagged records describe public works or lift stations.'},
    waterpump:{label:'Water pumping station',wiki:'https://en.wikipedia.org/wiki/Pumping_station',description:'The Minneapolis capital request identifies Southwest Pump Station within its water infrastructure. A pumping station moves water; this classification does not make it a treatment plant or establish current operation.'},
    watermain:{label:'Published water-main record',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'This city inventory gives a water-main alignment and its published type. Public, private, neighboring, supply and former records can occur together. Read the type, ownership and construction fields before treating a segment as a currently operating drinking-water distribution main.'},
    rawwatermain:{label:'Raw-water main record',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'The source identifies this as a raw-water pipe. Raw water has not completed drinking-water treatment; its route is distinct from the distribution mains that serve customers.'},
    waterserviceline:{label:'Published water-service alignment',wiki:'https://en.wikipedia.org/wiki/Water_supply_network',description:'The city publishes this service or lateral as line geometry. Its recorded water type, material, geometry source and status remain separate from Minneapolis connection-inventory points. Geometry can be explicitly assumed; a material record is not a tap-water test.'},
    sanitarylateral:{label:'Sanitary lateral pipe',wiki:'https://en.wikipedia.org/wiki/Sanitary_sewer',description:'The source identifies this as a sanitary lateral, separate from its gravity mains and force mains. Geometry and attribute-source fields preserve any assumed or plan-derived values.'},
    stormlateral:{label:'Storm lateral pipe',wiki:'https://en.wikipedia.org/wiki/Storm_drain',description:'The city identifies this line as a storm lateral. Its original lifecycle, geometry source, dimensions and any unknown measurement units remain part of the record.'},
    stormpressure:{label:'Pressurized storm pipe',wiki:'https://en.wikipedia.org/wiki/Storm_drain',description:'The source identifies this as a pressurized storm main, separate from gravity flow and lateral pipes. That classification does not supply a pressure measurement or establish current pump operation.'},
    fibercable:{label:'Published fiber cable',wiki:'https://en.wikipedia.org/wiki/Optical_fiber_cable',description:'Eagan explicitly records this as a fiber cable. Native status fields can disagree and are retained separately. A mapped cable does not establish its burial method, live traffic, available capacity or complete provider coverage.'},
    fiberpath:{label:'Published utility path',wiki:'https://en.wikipedia.org/wiki/Telecommunications',description:'Eagan publishes this path separately from its fiber cable inventory. A mapped path is not evidence that a cable has been laid, that the route is buried or that broadband service is available at every property along it.'},
    stormmodel:{label:'Stormwater-model conduit',wiki:'https://en.wikipedia.org/wiki/Storm_drain',description:'MWMO publishes this conduit as part of its North Minneapolis stormwater model. Source comments distinguish city GIS, as-built plans, modified links and assumed values. Model geometry and dimensions do not establish a surveyed route, current condition or operating status.'},
    draintile:{label:'Published storm drain-tile record',wiki:'https://en.wikipedia.org/wiki/Drainage',description:'This city inventory records a drainage pipe below the surface. Its diameter units are not stated in the public definitions, so the source value is kept without conversion.'},
    cityconduit:{label:'Published underground utility record',wiki:'https://en.wikipedia.org/wiki/Pipeline_transport',description:'Bloomington records this alignment in its underground utility inventory. Read the published contents and lifecycle fields; an empty or unspecified conduit does not establish an installed cable or pipe substance.'},
    cityelectric:{label:'Published underground electrical record',wiki:'https://en.wikipedia.org/wiki/Undergrounding',description:'Bloomington identifies this underground alignment as electrical. The record does not establish its voltage, current load or every cable within the conduit.'},
    citytelecom:{label:'Published underground telecom record',wiki:'https://en.wikipedia.org/wiki/Telecommunications',description:'Bloomington identifies this underground alignment as phone service or city telecom. The source does not identify fiber versus copper, present broadband availability or a complete provider network.'},
    citygas:{label:'Published underground gas-service record',wiki:'https://en.wikipedia.org/wiki/Pipeline_transport',description:'Bloomington identifies this underground alignment as gas service. Substance, pressure and operating status are not filled in when the source omits them.'},
    bassettTunnel:{label:'Bassett Creek stormwater tunnel', wiki:'https://en.wikipedia.org/wiki/Bassett_Creek_(Mississippi_River_tributary)', description:'This route follows a phase of the newer Bassett Creek flood-control system in the June 2025 engineering overview. It is separate from the old creek tunnel. The overview does not provide a surveyed pipe location or depth along the route.'},
    bassettCulvert:{label:'Bassett Creek box culvert', wiki:'https://en.wikipedia.org/wiki/Culvert', description:'The upstream section carries Bassett Creek through a double box culvert, then a single box, toward the Third Avenue tunnel. Its route is interpreted from the June 2025 engineering overview. The report describes open-cut excavation, rather than a measured roof depth at every point.'},
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
    nonwaterservice:{label:'Non-water service inventory record', wiki:'https://en.wikipedia.org/wiki/Water_supply_network', description:'The Minneapolis inventory identifies this record as a non-water or storm service. Its material field should not be interpreted as a drinking-water lead connection.'}
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
  function isWaterService(p) { return p.t !== 'NotaWaterService' && p.t !== 'Storm'; }
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
    if (config(f).municipal) return municipalType(f);
    if (id==='waterworks') return confirmedWaterFacilities[p.i]?confirmedWaterFacilities[p.i].type:'waterfacility';
    if (id === 'bassettPlan') return p.phase === 3 ? 'bassettCulvert' : 'bassettTunnel';
    if (id === 'services') return !isWaterService(p) ? 'nonwaterservice' : p.c === 1 ? 'leadservice' : p.c === 4 ? 'galvanizedservice' : p.c === 3 || !present(p.c) ? 'unknownservice' : 'service';
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
    if (config(f).municipal) return municipalName(f);
    if (id === 'services') {
      if (!isWaterService(p)) return 'City record: ' + (p.t === 'Storm' ? 'storm service' : 'non-water service');
      return (serviceClasses[p.c] || 'Unknown material') + ' service connection' + (p.x === 1 ? ' (discontinued)' : '');
    }
    if (id === 'generators') return (n || 'EIA plant ' + p.i) + ', generator ' + (present(p.g) ? p.g : 'unknown');
    if (id === 'plants') return (n || 'Regional treatment site') + (retiredRecord(p) ? ' (former plant)' : '');
    if (id === 'sheds') return p.WWTP ? p.WWTP + ' treatment service area' : 'Treatment service area, plant unreported';
    if (id === 'wells') return 'Well record ' + (p.i || 'number unavailable');
    if (id === 'bedrock') return p.d || p.u || 'Bedrock formation';
    if (id === 'surficial') return n || [p.description, p.lithology].filter(Boolean).join(': ') || 'Glacial or recent deposit';
    if (id === 'buried' && !n) return hydroTypes[p.t] || 'Buried watercourse record';
    if (id === 'wspSanitary') return 'Sanitary pipe' + (n ? ' ' + n : '');
    if (id === 'wspSanManholes') return 'Sanitary manhole' + (n ? ' ' + n : '');
    if (id === 'wspStormManholes') return 'Storm manhole' + (n ? ' ' + n : '');
    if (id === 'pipelines') return n || (p.substance ? titlecase(p.substance) + ' pipeline' : 'Pipeline, substance unreported');
    if (id === 'pipeStations') return n || (p.pipeline === 'valve' ? 'Pipeline valve' : 'Pipeline station or control');
    if (id === 'telephoneAreas') return (n || p.wirecenter || 'Telephone') + ' exchange territory';
    if (id === 'protection') return (n || 'Public water supply') + ' protection area';
    if (id === 'vulnerability') return (n || 'Public water supply') + ', ' + (p.v || 'unreported') + ' vulnerability';
    if (id === 'rail') return (p.operator || 'Railroad') + (n ? ', subdivision ' + n : ' route');
    if (n) return n;
    return {interceptors:'Regional sewer segment', lifts:'Lift station', meters:'Sewer flow meter', substations:'Substation', powerplants:'EIA generating site', osmPowerplants:'Mapped generating site', power:'Transmission line', feeders:'Local electric line', cables:p.location === 'underground' ? 'Tagged underground power cable' : 'Power cable, location unreported', hydrants:'Fire hydrant', inlets:'Storm inlet', wspInlets:'Street catch basin', towers:'Water tower', waterworks:'Mapped water facility', comms:'Mapped data center', exchanges:'Recorded telephone exchange', cleanup:'Cleanup or tank program record', groundwater:'Groundwater area of concern', groundwaterSources:'Potential groundwater source area', groundwaterBounds:'Groundwater boundary record', groundwaterSites:'Groundwater investigation site', groundwaterUnmapped:'Groundwater site without mapped area', wspStorm:'Storm pipe', streams:'DNR watercourse segment', faults:'Mapped bedrock fault', pavement:'Street condition record', electricAreas:'Electric utility territory', osmWastewater:'Mapped wastewater site'}[id] || 'Mapped feature';
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
  function municipalMetadata(f) {
    var meta=config(f).metadata || {}, layer=pof(f).sourceLayer;
    return (meta.components || []).find(function(c) { return c.layer===layer; }) || meta;
  }
  function municipalRole(f) { return municipalMetadata(f).conduitRole || config(f).role; }
  function municipalCode(f,key) {
    var value=pof(f)[key], domain=(municipalMetadata(f).fieldDomains || {})[key];
    if (!present(value) || typeof value==='string' && !value.trim()) return '';
    var choice=domain && (domain.codedValues || []).find(function(v) { return String(v.code)===String(value); });
    return choice?choice.name:String(value);
  }
  function municipalType(f) {
    var p=pof(f), cfg=config(f), role=municipalRole(f);
    if (cfg.role==='water' && (p.Type==='Raw Water' || p.WaterType==='Raw')) return 'rawwatermain';
    if (role==='force') return 'forcemain';
    if (role==='stormForce') return 'stormpressure';
    if (role==='sanitaryLateral') return 'sanitarylateral';
    if (role==='stormLateral') return 'stormlateral';
    if (cfg.role==='sanitary' && /force\s*main/i.test(p.main_type || '')) return 'forcemain';
    if (cfg.role==='sanitary' && /interceptor/i.test(p.main_type || '')) return 'interceptor';
    if (cfg.role==='conduit') {
      var contents=p.underground_type || '';
      if (/electrical/i.test(contents)) return 'cityelectric';
      if (/phone|telecom/i.test(contents)) return 'citytelecom';
      if (/gas service/i.test(contents)) return 'citygas';
      if (/fuel line/i.test(contents)) return 'fuelpipe';
    }
    return cfg.type;
  }
  function municipalName(f) {
    var p=pof(f), cfg=config(f), role=municipalRole(f);
    var identifier=p.DIS_P_NM || p.PIPE_ID || p.MainlineID || p.ServiceID || p.mainline_pipe_id || p.PvtPipeID || p.CommonName || p.Culvert_ID || p.DrainTileID || p.ASSET_ID || p.FacilityID || p.FACILITYID;
    if (cfg.role==='model') return 'Model conduit '+p.CONDUIT_ID;
    if (cfg.role==='conduit') return String(p.underground_type || 'Underground utility record')+(present(p.ASSET_ID)?' '+p.ASSET_ID:'');
    var label={water:p.WaterType==='Raw'?'Raw-water main':'Water main',service:'Water lateral',sanitary:/force\s*main/i.test(p.main_type || '')?'Sanitary force main':'Sanitary pipe',sanitaryLateral:'Sanitary lateral',force:'Sanitary force main',storm:'Storm pipe',stormLateral:'Storm lateral',stormForce:'Pressurized storm pipe',privateStorm:'Private storm pipe',culvert:'Culvert',drainTile:'Storm drain tile',fiber:'Fiber cable',fiberPath:'Utility path'}[role];
    return label+(present(identifier)?' '+String(identifier).trim():'');
  }
  function municipalDecommissioned(f) {
    var p=pof(f), source=config(f).source || {}, cutoff=Date.parse(source.retrievedAt || '');
    if (!Number.isFinite(cutoff)) cutoff=Date.now();
    var value=p.Date_Decommissioned || p.DecommissionDate || p.date_decommissioned;
    return typeof value==='number' && value!==0 && Number.isFinite(value) && value<=cutoff && new Date(value).getUTCFullYear()>=1800;
  }
  function municipalStatus(f) {
    var p=pof(f), cfg=config(f), explicit=p.Status || p.STATUS || p.status;
    if (cfg.role==='model') return 'Model record; operating status not supplied';
    var lifecycle=municipalCode(f,'LifecycleStatus') || municipalCode(f,'LifeCycleStatus');
    if (lifecycle) return lifecycle;
    if (cfg.role==='fiber' || cfg.role==='fiberPath') {
      var state=municipalCode(f,'status'), cable=municipalCode(f,'cableStatus');
      return state && cable && state.toLowerCase()!==cable.toLowerCase()?state+'; cable status: '+cable+' (source fields differ)':state || cable || 'Operating status not reported';
    }
    if (present(explicit)) return String(explicit);
    if (/inactive|abandoned|removed|proposed|active/i.test(p.Type || p.main_type || '')) return p.Type || p.main_type;
    if (municipalDecommissioned(f)) return 'Reported decommission date: '+displayDate(p.Date_Decommissioned || p.DecommissionDate || p.date_decommissioned);
    if (p.ConstructionStatus==='Proposed') return 'Proposed';
    return 'Operating status not reported';
  }
  function municipalInactive(f) {
    var p=pof(f);
    var lifecycle=municipalCode(f,'LifecycleStatus') || municipalCode(f,'LifeCycleStatus');
    if (lifecycle) return /^proposed$/i.test(lifecycle) || /^(?:inactive|abandoned|removed(?:\b|$))/i.test(lifecycle);
    if (config(f).role==='fiber' || config(f).role==='fiberPath') return /^(?:proposed|inactive|abandoned|removed)$/i.test(municipalCode(f,'status')) || /^(?:proposed|inactive|abandoned|removed)$/i.test(municipalCode(f,'cableStatus'));
    return config(f).role!=='model' && (/inactive|abandoned|removed|closed|proposed|retired/i.test([p.Status,p.STATUS,p.status,p.Type,p.main_type,p.ConstructionStatus,p.underground_type].filter(present).join(' ')) || municipalDecommissioned(f));
  }
  function municipalFacts(f) {
    var p=pof(f), cfg=config(f), meta=municipalMetadata(f), fields=meta.sourceFields || [], definitions={}, rows=[], seen={};
    fields.forEach(function(field) { definitions[field.name]=field; });
    function add(label,value) { rows.push([label,String(value)]); }
    add('Publisher',meta.source && meta.source.attribution || (cfg.role==='model'?'MWMO':'Municipal GIS'));
    add('Record meaning',cfg.role==='model'?'Stormwater-model conduit, including source assumptions':'Published municipal inventory alignment');
    if (meta.title) add('Native source layer',meta.title);
    add('Published operating status',municipalStatus(f));
    var units=meta.fieldUnits || {};
    var unspecified={LENGTH:1,GRADE:1,Diameter:1,DIAMETER:1,INV_Upstream:1,INV_Downstream:1,Pipe_Length:1,pipe_length:1,PipeLength:1,PipeSize:1,tile_diameter:1,calc_length:1,USINV:1,DSINV:1,Size:1,PipeDepth:1,RecordedLength:1,Slope:1,DownStreamInvert:1,UpStreamInvert:1,UpstreamInvert:1,DownstreamInvert:1,UpstreamDepth:1,DownstreamDepth:1,DepthUpstream:1,DepthDownstream:1,Depth:1,PathLength:1,footage:1};
    function field(key,unknown) {
      if (seen[key] || key==='i') return;
      seen[key]=true;
      var value=p[key], definition=definitions[key] || {}, label=String(definition.alias || key).replace(/\s+/g,' ').trim();
      if (!present(value)) { if (unknown) add(label,'Not reported'); return; }
      var domain=meta.fieldDomains && meta.fieldDomains[key], choice=domain && (domain.codedValues || []).find(function(v) { return String(v.code)===String(value); });
      var measured=units[key] || unspecified[key] || /length|slope|elev|depth|diameter|width|height|roughness|loss|condition|mannings/i.test(key);
      var text=typeof value==='number' && measured?number.format(value):String(value);
      if (definition.type==='esriFieldTypeDate') text=displayDate(value);
      else if (definition.type==='esriFieldTypeOID' || /(?:ID|Id|_id)$|^id$/i.test(key)) text=String(value);
      else if (choice && String(choice.name)!==String(value)) text=choice.name+' (source code: '+value+')';
      if (units[key] && !/\((?:ft|feet|in|inches|%|months)\)/i.test(label)) label+=' ('+units[key]+')';
      else if (!units[key] && unspecified[key]) label+=' (source units unspecified)';
      add(label,text);
    }
    ['CONDUIT_ID','MainlineID','ServiceID','DIS_P_NM','PIPE_ID','mainline_pipe_id','PvtPipeID','Culvert_ID','DrainTileID','ASSET_ID','underground_type','Type','main_type','Status','STATUS','status','ConstructionStatus','Ownership','ownership','OWNERSHIP','Jurisdiction','CITY','MATERIAL','Pipe_Material','PipeMaterial','pipe_material','Material','PIPE_MAT','TYPE','Pipe_Diameter','Diameter','pipe_diameter','PipeDiameter','DIAMETER','DIA_IN','PipeSize','tile_diameter','LENGTH','Pipe_Length','pipe_length','PipeLength','GRADE','PipeSlope','pipe_slope','USINV','DSINV','UpstreamInvertElev','DownstreamInvertElev','INV_Upstream','INV_Downstream'].forEach(function(key) { if (definitions[key] || present(p[key])) field(key,false); });
    fields.forEach(function(definition) { field(definition.name,false); });
    Object.keys(p).forEach(function(key) { field(key,false); });
    if (cfg.role==='model') add('Model interpretation','A source assumption or plan-derived value is retained as reported, not converted into a field observation');
    if (cfg.role==='fiberPath') add('Path interpretation','A mapped utility path does not establish that a fiber cable has been laid along it');
    if (cfg.role==='water' || cfg.role==='service') add('Material meaning','Recorded pipe material, not a measurement of lead in drinking water');
    return rows;
  }
  function facts(f) {
    if (f.layer === 'tour' || f.layer === 'depth') return f.facts || [];
    var p = pof(f), id = f.layer, rows = [], used = {};
    if (config(f).municipal) return municipalFacts(f);
    function add(label, value, field) { if (present(value)) rows.push([label, String(value)]); if (field) used[field] = true; }
    function field(label, key, unit, unknown) { add(label, present(p[key]) ? (typeof p[key] === 'number' && !/^(?:i|id|y)$/.test(key) ? number.format(p[key]) : p[key]) + (unit || '') : unknown ? 'Not reported' : null, key); }
    function date(label, key, compact) { if (present(p[key])) add(label, displayDate(p[key],compact),key); }
    function code(label, key, table) { add(label, present(p[key]) ? (table[String(p[key]).trim()] || 'Unmapped code') + ' (' + p[key] + ')' : 'Not reported',key); }

    if (id === 'services') {
      field('City source ObjectID','i');
      add('City material classification',serviceClasses[p.c] || 'Unknown material','c');
      add('Service purpose',servicePurposes[p.t] || p.t || 'Not reported','t');
      add('Discontinued field',p.x === 1 ? 'Yes' : p.x === 2 ? 'No' : 'Unknown or not reported','x');
      field('First diameter field','d',' in'); field('Second diameter field','d2',' in');
      add('Record meaning',isWaterService(p) ? 'Connection location, not a pipe alignment or tap-water test' : 'Source identifies a non-water or storm record');
    }
    if (/^wspSan/.test(id)) {
      field(id === 'wspSanitary' ? 'Pipe number' : 'Manhole number','n');
      field('Installation year','y','',true); field('Abandonment field','a','',true);
      if (id === 'wspSanitary') { field('Material code','m','',true);field('Published pipe size','d','',true);field('Published grade','g');field('Length','l',' ft'); }
    }
    if (/^wspStorm|^wspInlets$/.test(id)) {
      field('Structure number','n'); field('Published type','t');
      if (id === 'wspStorm') { field('Width, source units unspecified','d','',true);field('Length, source units unspecified','l','',true); }
      add('Enabled field',p.e === 1 ? 'Yes (1)' : p.e === 0 ? 'No (0)' : present(p.e) ? p.e : 'Not reported','e');
    }
    if (['interceptors','plants','lifts','meters'].indexOf(id) >= 0) {
      field('Published status','s','',true); field('Record identifier','i'); field('Operator / owner','operator'); date('Record source date','date');
      if (id === 'interceptors') { field('Published pipe type','type','',true);field('Length','l',' ft');field('Shape classification','shape'); }
      if (id === 'plants') { field('Municipality','city');field('County','county');field('Opened','opened');field('Closed','closed');field('Abandoned','abandoned');field('Abbreviation','abbr'); }
      if (id === 'lifts' || id === 'meters') field('Associated interceptor','interceptor');
    }
    if (id === 'sheds') field('Treatment plant','WWTP','',true);
    if (id === 'bassettPlan') {
      field('Published project phase','phase'); add('Source figure','June 2025 report, Figure 1 (PDF page 9)');
      add('Route meaning','Approximate engineering overview; elevation is not encoded');
      if (p.phase === 1) add('Phase scope','I-94 branch and Second Street tunnel; separate from the old creek tunnel');
      if (p.phase === 2) add('Phase scope','Third Avenue tunnel between the box culvert and Phase 1');
      if (p.phase === 3) {
        add('Construction described','Open-cut excavation 0 to 20 feet below ground surface');
        add('Connection to Third Avenue','Via a 30-foot drop structure');
        add('Published box sections','Double 11 by 11 feet, then single 11 by 15 feet (height by width)');
        add('Construction and ownership','Built by USACE in 1992; transferred to the City of Minneapolis in 2002');
        add('Construction source','Report section 2.1, printed page 6 (PDF page 8)');
      }
    }
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
    if (id === 'pavement') {
      add('Historical condition index',present(p.pci) ? p.pci + ' / 100' : 'Unrated','pci');date('Inspection date','date');field('Construction year','y');field('Renovation year','r');field('Pavement type code','t');add('Dataset edited','December 2, 2015');
    }
    if (id === 'hydrants') {field('Recorded installation year','yr');add('Public bury depth','Not supplied');add('Dataset edited','June 16, 2020');}
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
    if (f.layer==='services' && config(f).source && present(p.i)) return config(f).source.url+'/query?f=pjson&objectIds='+encodeURIComponent(p.i)+'&outFields=OBJECTID,Classification,ServiceType,Diameter1,Diameter2,Discontinued';
    if (config(f).municipal && config(f).source && present(p.OBJECTID)) {
      var meta=municipalMetadata(f), source=meta.source || config(f).source;
      return source.url+'/query?f=pjson&objectIds='+encodeURIComponent(p.OBJECTID)+'&outFields='+encodeURIComponent((meta.sourceFields || []).map(function(d) { return d.name; }).filter(function(key) { return key!=='i' && key!=='sourceLayer'; }).join(','));
    }
    if (f.layer === 'bassettPlan' && /^https:\/\//i.test(p.sourceUrl || '')) return p.sourceUrl;
    if (/^https?:\/\//i.test(p.url || '')) return p.url;
    if (/^(?:node|way|relation)\/\d+$/.test(String(p.i || ''))) return 'https://www.openstreetmap.org/' + p.i;
    // Source territories carry bare hostnames in their published website field.
    if (f.layer === 'electricAreas' && /^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(p.url || '')) return 'https://' + p.url;
    return '';
  }
  function isNamed(f) {
    if (f.layer === 'tour') return true;
    if (config(f).municipal) return !!pof(f).CommonName;
    return !!namedValue(pof(f)) || ['bedrock','surficial','electricAreas'].indexOf(f.layer) >= 0;
  }
  function status(f) {
    var p = pof(f);
    if (config(f).municipal) return municipalStatus(f);
    if (f.layer === 'services') return p.x === 1 ? 'Discontinued' : p.x === 2 ? 'Not discontinued' : 'Discontinued status unknown';
    if (['plants','interceptors','lifts','meters'].indexOf(f.layer) >= 0) return p.s || 'Status unreported';
    if (f.layer === 'generators' || f.layer === 'powerplants') return p.status || p.stage || 'Status unreported';
    if (f.layer === 'wspSanitary' || f.layer === 'wspSanManholes') return p.a === 'Yes' ? 'Abandoned' : 'Abandonment field not reported';
    if (f.layer === 'towers' && historicTowers[p.i]) return historicTowers[p.i].status;
    return '';
  }
  function isVisible(f, showInactive) {
    if (showInactive) return true;
    var p = pof(f), id = f.layer;
    if (config(f).municipal) return !municipalInactive(f);
    if (['plants','interceptors','lifts','meters'].indexOf(id) >= 0) return !/^(offline|abandoned|removed|closed)$/i.test(p.s || '');
    if (id === 'powerplants') return p.status === 'Operating';
    if (id === 'generators') return p.stage === 'Operating' && /^\((?:OP|SB)\)/.test(p.status || '');
    if (id === 'services') return p.x !== 1;
    if (id === 'wspSanitary' || id === 'wspSanManholes') return p.a !== 'Yes';
    return true;
  }
  function color(f) {
    var p = pof(f);
    if (f.color) return f.color;
    if (config(f).municipal) return municipalInactive(f)?C.faint:{cityelectric:C.power,citygas:C.gas,citytelecom:C.net,fuelpipe:C.power}[municipalType(f)] || config(f).color;
    if (f.layer === 'bassettPlan') return {1:C.sewer,2:C.gas,3:C.net}[p.phase] || C.water;
    if (f.layer === 'services') return !isWaterService(p) || p.x === 1 ? C.faint : {1:C.power,2:C.water,3:C.gas,4:C.ground}[p.c] || C.gas;
    if (f.layer === 'pipelines') return {g:C.gas,h:C.net,w:C.water,f:C.power,a:C.ground,o:C.ground}[p.k] || C.faint;
    if (f.layer === 'pavement') return !present(p.pci) ? C.faint : p.pci < 40 ? '#b8796d' : p.pci < 70 ? C.gas : C.sewer;
    if (f.layer === 'generators' && p.stage !== 'Operating') return C.faint;
    if (retiredRecord(p) && ['plants','lifts','meters','interceptors','powerplants'].indexOf(f.layer) >= 0) return C.faint;
    return config(f).color || C.cream;
  }
  function lineStyle(f) {
    var p = pof(f);
    if (config(f).municipal) return {dash:config(f).role==='model'?[3,3]:municipalInactive(f)?[3,5]:municipalType(f)==='forcemain'?[7,4]:[],opacity:municipalInactive(f)?.45:config(f).role==='model'?.7:1};
    if (f.layer === 'interceptors') return {dash:retiredRecord(p) ? [3,5] : /forcemain/i.test(p.type || '') ? [7,4] : /siphon/i.test(p.type || '') ? [1,3] : [],opacity:p.s === 'Online' ? 1 : .45};
    if (f.layer === 'cables') return {dash:[5,3],opacity:p.location === 'underground' ? .9 : .45};
    if (f.layer === 'groundwaterBounds') return {dash:/uncertain|inferred|approximate/i.test(p.certainty || '') ? [5,4] : [],opacity:.9};
    return {dash:[],opacity:1};
  }
  function typeInfo(f) {
    if (f.layer === 'towers') {
      var tower = historicTowers[pof(f).i];
      return {label:'Water tower',wiki:'https://en.wikipedia.org/wiki/Water_tower',description:tower ? 'This tower remains standing after its water-storage service ended. ' + tower.status + '.' : 'An elevated tank can store water and supply pressure to a network. Historic towers can remain standing after water storage ends; this snapshot does not establish each tower’s present use.'};
    }
    return kinds[type(f)] || null;
  }
  function primarySources(f) {
    if (config(f).municipal) {
      var p=pof(f), rows=[], cfg=config(f);
      ['LF_LINK_URL','LF_LINK2_URL','LF_LINK3_URL','SitePlanLink'].forEach(function(key) { if (/^https?:\/\//i.test(p[key] || '')) rows.push({label:'Published plan reference',url:p[key]}); });
      if (cfg.role==='model') rows.push({label:'MWMO stormwater-model context and limitations',url:'https://www.mwmo.org/learn/storymap/'});
      return rows;
    }
    if (f.layer === 'bassettPlan') return [{label:'2025 engineering overview and construction history',url:pof(f).sourceUrl}];
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

  window.UnderStreetData = {topics:topics,layers:layers,name:name,type:type,facts:facts,wiki:wiki,isNamed:isNamed,status:status,isVisible:isVisible,typeInfo:typeInfo,recordURL:recordURL,primarySources:primarySources,color:color,lineStyle:lineStyle,sourceNotes:sourceNotes,applyManifest:applyManifest,displayDate:displayDate};
}());
