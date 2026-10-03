/* Public infrastructure snapshots, topic loading and an accessible place list. */
(function () {
  'use strict';
  var HOST=document.getElementById('undermap');if(!HOST)return;
  var CANVAS=HOST.querySelector('canvas'),STAGE=HOST.querySelector('.um-stage'),PANEL=HOST.querySelector('.um-panel');
  var STATUS=HOST.querySelector('.um-status'),SCALE=HOST.querySelector('.um-scale'),TOOLTIP=HOST.querySelector('.um-tooltip');
  var RESULTS=HOST.querySelector('.um-results'),SEARCH=HOST.querySelector('.um-search input'),ctx=CANVAS.getContext('2d');
  var ROOT='assets/map/',VERSION='20261003-3',W=0,H=0,DPR=1,raf=null,started=false,topic='tour',scope='all';
  var showInactive=false,sourceScope='current',catalogLoading=false,catalogError=false;
  var selection=null,hovered=null,addressPin=null,media={photos:[],types:{}},manifest=null,visibleLimit=30,resultItems=[],data={};
  var fmt=new Intl.NumberFormat('en-US'),MINZ=9,MAXZ=18,view={x:mx(-93.19),y:my(44.985),z:10.6};
  var HOME={x:view.x,y:view.y,z:view.z},fitted=false,savedView=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var C={water:'#8fb3c7',sewer:'#9ec79a',power:'#d9978c',gas:'#dfc288',net:'#cf9f78',ground:'#b79bc4',cream:'#e8e2d6'};
  var catalog=window.UnderStreetData;
  if(!catalog){STATUS.textContent='The map data definitions could not load. The article and sources are below.';return;}
  var topics=catalog.topics,layers=catalog.layers;
  topics.tour.text='A wall beneath the falls, a building where internet networks meet, a creek beneath downtown. Choose a place to see what is there.';
  var tour=[
    {id:'falls',name:'The wall under St. Anthony Falls',lon:-93.257,lat:44.9806,z:15,type:'cutoffwall',color:C.ground,topic:'tour',photoName:'St. Anthony Falls + the 1876 dike',blurb:'A concrete cutoff wall beneath the limestone blocks water from eroding the sandstone under the falls. The Corps finished the 1,850-foot wall in 1876; it reaches about 40 feet into the sandstone.',facts:[['Completed','1876'],['Wall length','1,850 ft']],source:'https://www.mvp.usace.army.mil/Home/Projects/Article/626089/engineering-the-falls-the-corps-of-engineers-role-at-st-anthony-falls/',wiki:'https://en.wikipedia.org/wiki/Saint_Anthony_Falls'},
    {id:'511',name:'The 511 Building',lon:-93.25458,lat:44.97141,z:16,type:'carrierhotel',color:C.net,topic:'networks',blurb:'Networks connect their equipment in this carrier hotel at 511 11th Avenue South. Cologix MIN1 hosts the Midwest Internet Cooperative Exchange.',source:'https://cologix.com/data-centers/minneapolis/min1/',wiki:'https://en.wikipedia.org/wiki/511_Building_(Minneapolis)'},
    {id:'metro',name:'Metro wastewater plant',photoName:'Metro',lon:-93.04547,lat:44.92526,z:14.3,type:'tplant',color:C.sewer,topic:'wastewater',blurb:'The regional plant near Pig\'s Eye Lake treats an average of 172 million gallons a day for 1.8 million people. It opened in 1938.',facts:[['Average flow','172 million gal/day'],['Service population','1.8 million']],source:'https://metrocouncil.org/Wastewater-Water/Services/Wastewater-Treatment/Communities/Metro.aspx'},
    {id:'fridley',name:'Fridley waterworks',photoName:'Minneapolis Water Treatment Plant',lon:-93.27868,lat:45.04322,z:15.2,type:'ww',color:C.water,topic:'water',blurb:'Minneapolis draws its drinking water from the Mississippi River. Its Fridley and Columbia Heights campuses treat the water before distribution.',source:'https://www.minneapolismn.gov/government/departments/public-works/water-treatment-distribution/treatment-delivery/'},
    {id:'steam',name:'Southeast Steam Plant',lon:-93.24965,lat:44.98077,z:15.3,type:'districtheat',color:C.gas,topic:'gas',blurb:'The university\'s steam plant stands beside the Mississippi. Mapped steam pipes nearby are part of a district heating system.',source:'https://campusmaps.umn.edu/southeast-steam-plant',wiki:'https://en.wikipedia.org/wiki/Southeast_Steam_Plant'},
    {id:'highland',name:'Highland Park Water Tower',lon:-93.16661,lat:44.91766,z:15,type:'tower',color:C.water,topic:'water',blurb:'Saint Paul Regional Water Services says this historic tower is no longer in service. It still stands in Highland Park.',facts:[['Water storage','No longer in service']],source:'https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-sprws/highland-tower',wiki:'https://en.wikipedia.org/wiki/Highland_Park_Tower'},
    {id:'mccarrons',name:'McCarrons water treatment plant',lon:-93.1007,lat:44.99649,z:15,type:'ww',color:C.water,topic:'water',blurb:'Saint Paul routes Mississippi water through lakes before treating it here. New facilities came online in 2025, with softening, filtration and disinfection. The aerial photograph predates that upgrade.',facts:[['Water source','Mississippi River, through the lake system'],['New facilities','2025']],source:'https://www.stpaul.gov/departments/saint-paul-regional-water-services/about-your-water'},
    {id:'district-stpaul',name:'District Energy Saint Paul',lon:-93.0963,lat:44.9432,z:15.5,type:'districtheat',color:C.gas,topic:'gas',blurb:'The plant sends hot water to buildings and receives cooler water back. It also chills water overnight and stores it in large tanks for daytime cooling demand.',facts:[['Supply and return piping','56 miles combined'],['Hot-water supply','180 to 250 F'],['Chilled-water supply','42 F']],source:'https://www.districtenergy.com/wp-content/uploads/2025/02/DESP_tour_brochure_print-2025.pdf'},
    {id:'washburn',name:'Washburn Park Water Tower',lon:-93.28428,lat:44.91075,z:15.5,type:'tower',color:C.water,topic:'water',blurb:'The historic tower remains a neighborhood landmark. Minneapolis says it is no longer in use for water storage.',facts:[['Water storage','No longer in use']],source:'https://www.minneapolismn.gov/government/projects/washburn-water-tower/',wiki:'https://en.wikipedia.org/wiki/Washburn_Park_Water_Tower'},
    {id:'wsp',name:'Local pipes in West Saint Paul',lon:-93.087,lat:44.904,z:14,type:'sewer',color:C.sewer,topic:'wastewater',blurb:'This city publishes local sanitary and storm pipe geometry. Zoom in and select a pipe to inspect its available material and size fields.'},
    {id:'bassett',name:'Old Bassett Creek Tunnel outlet',photoName:'Old Bassett Creek Tunnel outlet',lon:-93.273508,lat:44.990355,z:15.5,type:'bstream',color:C.water,topic:'storm',blurb:'The 1923 tunnel still carries stormwater from north Minneapolis. MWMO cleared accumulated sediment and debris between 2017 and 2020. The map anchor is an approximate outlet location derived from DNR hydrography, rather than a surveyed pipe route.',source:'https://www.mwmo.org/projects/old-bassett-creek-tunnel/',wiki:'https://en.wikipedia.org/wiki/Bassett_Creek_(Mississippi_River_tributary)'}
  ];
  tour.forEach(function(f){f.x=mx(f.lon);f.y=my(f.lat);f.kind='point';f.p={};f.layer='tour';});
  function mx(lon){return (lon+180)/360;}
  function my(lat){var r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2;}
  function lonOf(x){return x*360-180;}
  function latOf(y){return Math.atan(Math.sinh(Math.PI-2*Math.PI*y))*180/Math.PI;}
  function scale(){return 256*Math.pow(2,view.z);}
  function toPx(x,y){var s=scale();return [(x-view.x)*s+W/2,(y-view.y)*s+H/2];}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeLink(s){return /^https?:\/\//.test(s||'')?esc(s):'';}
  function requestDraw(){if(!raf)raf=requestAnimationFrame(function(){raf=null;draw();});}
  function activeIds(){return topics[topic].layers.filter(function(id){return layers[id].on;});}
  var gzipDecoderLoading=null;
  function gzipDecoder(){
    if(window.fflate)return Promise.resolve(window.fflate);
    if(!gzipDecoderLoading)gzipDecoderLoading=new Promise(function(resolve,reject){
      var script=document.createElement('script');script.src=ROOT+'vendor/fflate-0.8.3.min.js?v='+VERSION;
      script.onload=function(){script.remove();if(window.fflate)resolve(window.fflate);else reject(new Error('The compressed map decoder could not load.'));};
      script.onerror=function(){script.remove();reject(new Error('The compressed map decoder could not load.'));};document.head.appendChild(script);
    }).catch(function(error){gzipDecoderLoading=null;throw error;});
    return gzipDecoderLoading;
  }
  function fetchJSON(file){
    return fetch(ROOT+file+'?v='+VERSION).then(function(r){
      if(!r.ok)throw new Error(file);
      if(!/\.gz$/.test(file))return r.json();
      return r.arrayBuffer().then(function(buffer){
        var bytes=new Uint8Array(buffer);
        // A server may already decode a Content-Encoding: gzip response.
        if(bytes[0]!==31||bytes[1]!==139)return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if(typeof DecompressionStream==='function')return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        return gzipDecoder().then(function(decoder){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoder.gunzipSync(bytes)));});
      });
    });
  }
  function rings(g){if(g.type==='LineString')return [g.coordinates];if(g.type==='MultiLineString'||g.type==='Polygon')return g.coordinates;if(g.type==='MultiPolygon')return g.coordinates.reduce(function(a,p){return a.concat(p);},[]);return [];}
  function ingest(gj,id){
    var cfg=layers[id]||{},packed=[],grid=new Map();
    (gj.features||[]).forEach(function(f,i){
      var g=f.geometry,p=f.properties||{};if(!g)return;
      var nativeId=['contextStreets','services','wells','powerplants','rail','protection','interceptors','lifts','meters','plants'].indexOf(id)>=0||cfg.file&&cfg.file.indexOf('data/osm-')===0?p.i:id==='cleanup'?p.id:null;
      var identity=cfg.municipal&&f.id!=null?f.id:id==='generators'?String(p.i)+'-'+String(p.g):nativeId!=null?nativeId:f.id!=null?f.id:'row-'+i;
      var o={id:id+'-'+identity,layer:id,p:p,kind:g.type==='Point'?'point':cfg.kind||(g.type.indexOf('Polygon')>=0?'polygon':'line')};
      if(o.kind==='point'){
        o.x=mx(g.coordinates[0]);o.y=my(g.coordinates[1]);
        var k=Math.floor(o.x*8192)+','+Math.floor(o.y*8192),bucket=grid.get(k);if(!bucket)grid.set(k,bucket=[]);bucket.push(o);
      }else{
        o.rings=rings(g).map(function(r){return r.map(function(c){return [mx(c[0]),my(c[1])];});});o.b=[Infinity,Infinity,-Infinity,-Infinity];
        o.rings.forEach(function(r){r.forEach(function(c){o.b[0]=Math.min(o.b[0],c[0]);o.b[1]=Math.min(o.b[1],c[1]);o.b[2]=Math.max(o.b[2],c[0]);o.b[3]=Math.max(o.b[3],c[1]);});});o.x=(o.b[0]+o.b[2])/2;o.y=(o.b[1]+o.b[3])/2;
      }
      o.name=id==='contextStreets'?p.n||'':featureName(o);o.type=id==='contextStreets'?'street':featureType(o);packed.push(o);
    });return {features:packed,grid:grid,count:packed.length};
  }
  function ensure(id){
    if(data[id]&&data[id].promise)return data[id].promise;
    var cfg=layers[id],state=data[id]={loading:true};
    if(cfg.tileIndex){state.features=[];state.grid=new Map();state.loadedTiles=new Map();state.tileParts=new Map();state.tileUsed=new Map();state.promise=fetchJSON(cfg.tileIndex).then(function(index){state.index=index;state.count=index.featureCount;state.loading=false;loadViewportTiles(id);updateLayers();renderResults();return state;}).catch(function(){state.loading=false;state.error=true;updateLayers();renderResults();return state;});updateLayers();return state.promise;}
    state.promise=fetchJSON(cfg.file).then(function(gj){var packed=cfg.kind==='raster'?{raster:gj,count:gj.width*gj.height}:ingest(gj,id);Object.assign(state,packed,{loading:false});updateLayers();renderResults();restoreFeature();requestDraw();return state;}).catch(function(){state.loading=false;state.error=true;updateLayers();renderResults();requestDraw();return state;});
    updateLayers();return state.promise;
  }
  function shouldLoad(id){
    var cfg=layers[id];if(requestedFeature&&requestedFeature.indexOf(id+'-')===0)return true;if(cfg.tileIndex)return true;if(view.z<cfg.minZ)return false;
    if(!cfg.municipal)return true;if(!cfg.metadata)return false;
    var b=cfg.metadata.bounds;if(!b)return true;var s=scale(),bounds=[lonOf(view.x-W/2/s),latOf(view.y+H/2/s),lonOf(view.x+W/2/s),latOf(view.y-H/2/s)];
    return b[2]>=bounds[0]&&b[0]<=bounds[2]&&b[3]>=bounds[1]&&b[1]<=bounds[3];
  }
  function ensureActive(){return Promise.all(activeIds().filter(shouldLoad).map(ensure));}
  layers.services.tileIndex='data/service-lines-tiles.json';
  layers.wells.tileIndex='data/wells-complete-tiles.json';
  function loadViewportTiles(id){
    var cfg=layers[id],state=data[id],pin=requestedFeature&&requestedFeature.indexOf(id+'-')===0?requestedPin:null;if(!state||!state.index||activeIds().indexOf(id)<0)return;pruneTileCache(id);if(view.z<cfg.minZ&&!pin)return;
    var s=scale(),bounds=[lonOf(view.x-W/2/s),latOf(view.y+H/2/s),lonOf(view.x+W/2/s),latOf(view.y-H/2/s)];
    state.index.tiles.forEach(function(t){var b=t.bounds,inView=view.z>=cfg.minZ&&b[2]>=bounds[0]&&b[0]<=bounds[2]&&b[3]>=bounds[1]&&b[1]<=bounds[3],atPin=pin&&pin.lon>=b[0]&&pin.lon<=b[2]&&pin.lat>=b[1]&&pin.lat<=b[3];if(!inView&&!atPin)return;state.tileUsed.set(t.file,Date.now());if(state.loadedTiles.has(t.file))return;
      state.loadedTiles.set(t.file,'loading');state.pending=(state.pending||0)+1;updateLayers();
      var prefix=cfg.tileIndex.slice(0,cfg.tileIndex.lastIndexOf('/')+1);
      fetchJSON(prefix+t.file).then(function(gj){var part=ingest(gj,id);state.tileParts.set(t.file,part);state.features=state.features.concat(part.features);part.grid.forEach(function(a,k){var b=state.grid.get(k);state.grid.set(k,b?b.concat(a):a);});state.loadedTiles.set(t.file,'ready');pruneTileCache(id);}).catch(function(){state.loadedTiles.set(t.file,'error');state.tileError=true;}).finally(function(){state.pending--;updateLayers();updateLegend();renderResults();restoreFeature();requestDraw();});
    });
  }
  function viewBounds(){var s=scale();return [lonOf(view.x-W/2/s),latOf(view.y+H/2/s),lonOf(view.x+W/2/s),latOf(view.y-H/2/s)];}
  function boundsIntersect(a,b){return a[2]>=b[0]&&a[0]<=b[2]&&a[3]>=b[1]&&a[1]<=b[3];}
  function pruneTileCache(id){
    var state=data[id],cap=id==='services'?10:24;if(!state||!state.tileParts||state.tileParts.size<=cap)return;
    var bounds=viewBounds(),protectView=id==='contextStreets'?view.z>=13.2:activeIds().indexOf(id)>=0&&view.z>=layers[id].minZ,pin=requestedFeature&&requestedFeature.indexOf(id+'-')===0?requestedPin:null,changed=false;
    Array.from(state.tileParts.keys()).sort(function(a,b){return state.tileUsed.get(a)-state.tileUsed.get(b);}).some(function(file){
      if(state.tileParts.size<=cap)return true;var t=state.index.tiles.find(function(t){return t.file===file;}),b=t.bounds;
      if(protectView&&boundsIntersect(b,bounds)||pin&&pin.lon>=b[0]&&pin.lon<=b[2]&&pin.lat>=b[1]&&pin.lat<=b[3])return false;
      state.tileParts.delete(file);state.loadedTiles.delete(file);state.tileUsed.delete(file);changed=true;return false;
    });
    if(changed){state.features=[];state.grid=new Map();state.tileParts.forEach(function(part){state.features=state.features.concat(part.features);part.grid.forEach(function(a,k){var b=state.grid.get(k);state.grid.set(k,b?b.concat(a):a);});});}
  }
  function loadStreets(){
    var id='contextStreets',state=data[id];if(state)pruneTileCache(id);if(view.z<13.2)return;
    if(!state){state=data[id]={loading:true,features:[],loadedTiles:new Map(),tileParts:new Map(),tileUsed:new Map()};fetchJSON('data/context-streets-tiles.json').then(function(index){state.index=index;state.count=index.featureCount;state.loading=false;loadStreets();}).catch(function(){state.loading=false;state.error=true;updateLayers();});return;}
    if(!state.index)return;var bounds=viewBounds();
    state.index.tiles.forEach(function(t){if(!boundsIntersect(t.bounds,bounds))return;state.tileUsed.set(t.file,Date.now());if(state.loadedTiles.has(t.file))return;
      state.loadedTiles.set(t.file,'loading');state.pending=(state.pending||0)+1;
      fetchJSON('data/'+t.file).then(function(gj){var part=ingest(gj,id);state.tileParts.set(t.file,part);state.features=state.features.concat(part.features);state.loadedTiles.set(t.file,'ready');pruneTileCache(id);}).catch(function(){state.loadedTiles.set(t.file,'error');state.tileError=true;}).finally(function(){state.pending--;updateLayers();requestDraw();});
    });
  }
  function drawStreets(hasAerial){
    var state=data.contextStreets;if(!state||!state.features||view.z<13.2)return false;var roads=state.features.filter(function(f){return visible(f);});if(!roads.length)return false;
    if(!hasAerial)strokeFeatures(roads,{color:'rgba(232,226,214,.25)',width:view.z>=15?.95:.7,dash:[]});
    if(view.z>=14.2){var seen=new Set();roads.sort(function(a,b){return Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y);}).forEach(function(f){if(!f.p.n||seen.has(f.p.n)||f.p.k==='Ramp'&&view.z<17)return;var anchor=null,best=Infinity;f.rings.forEach(function(r){for(var i=1;i<r.length;i++){var a=toPx(r[i-1][0],r[i-1][1]),b=toPx(r[i][0],r[i][1]),dx=b[0]-a[0],dy=b[1]-a[1];if(Math.hypot(dx,dy)<32)continue;var t=Math.max(0,Math.min(1,((W/2-a[0])*dx+(H/2-a[1])*dy)/(dx*dx+dy*dy))),x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(x-W/2,y-H/2);if(x>12&&x<W-12&&y>60&&y<H-70&&d<best){best=d;anchor=[x,y];}}});if(anchor){seen.add(f.p.n);queueLabel(f.p.n,anchor[0],anchor[1]-3,-2);}});}
    return true;
  }
  function visible(f,pad){var s=scale(),r=pad||20;if(f.kind==='point'){var p=toPx(f.x,f.y);return p[0]>-r&&p[0]<W+r&&p[1]>-r&&p[1]<H+r;}return (f.b[2]-view.x)*s+W/2>-r&&(f.b[0]-view.x)*s+W/2<W+r&&(f.b[3]-view.y)*s+H/2>-r&&(f.b[1]-view.y)*s+H/2<H+r;}
  function visiblePoints(state,pad){
    if(!state||!state.grid)return [];
    var s=scale(),r=pad||20,x0=Math.floor((view.x-(W/2+r)/s)*8192),x1=Math.floor((view.x+(W/2+r)/s)*8192),y0=Math.floor((view.y-(H/2+r)/s)*8192),y1=Math.floor((view.y+(H/2+r)/s)*8192),out=[];
    for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){var b=state.grid.get(x+','+y);if(b)out=out.concat(b);}return out;
  }
  function featureType(f){return catalog.type(f);}
  function featureName(f){return catalog.name(f);}
  function allowed(f){return catalog.isVisible(f,showInactive);}
  var fallbackTypes={
    ww:['Drinking-water plant','Water_treatment','Treats water for the public drinking-water supply.'],
    tower:['Water tower','Water_tower','Elevated storage helps maintain water pressure and meet changes in demand.'],
    hydrant:['Fire hydrant','Fire_hydrant','A connection that firefighters can use to draw water from a drinking-water main. The main is not drawn here.'],
    service:['Water service connection','Water_supply_network','The connection between a water main and a building. This point records city inventory information, not the route of the pipe.'],
    leadservice:['Lead service connection','Lead_service_line','A service connection classified as lead in the city inventory. Open the city record source for classification details.'],
    tplant:['Wastewater treatment plant','Sewage_treatment','Treats sewage collected from its service area before discharging treated water.'],
    tplantGhost:['Closed wastewater plant','Sewage_treatment','Recorded as a former treatment plant.'],
    interceptor:['Gravity interceptor','Sanitary_sewer','A regional sewer pipe or tunnel carrying sewage downhill. Smaller local pipes feed into it.'],
    sewer:['Local sanitary sewer','Sanitary_sewer','Carries sewage from buildings toward the regional wastewater system.'],
    forcemain:['Force main','Sanitary_sewer#Lift_stations','A pressurized sewer carrying wastewater pumped from a lift station.'],
    siphon:['Inverted siphon','Inverted_siphon','A full pipe that descends beneath an obstacle and rises on the far side, driven by the pressure difference.'],
    abandonedsewer:['Abandoned regional sewer','Sanitary_sewer','Recorded as abandoned or removed; it is not shown as an operating pipe.'],
    lift:['Sewage lift station','Sewage_pumping','Pumps sewage where it cannot continue downhill by gravity.'],
    meter:['Sewer flow meter','Flow_measurement','A point where the regional system measures wastewater flow.'],
    shed:['Wastewater service area','Sewage_treatment','The mapped area served by this treatment plant. Boundaries describe service coverage rather than the route from a particular building.'],
    inlet:['Storm inlet','Storm_drain','Collects street runoff for the storm drainage system. This city layer is a published subset.'],
    stormsewer:['Storm sewer','Storm_drain','Carries runoff toward surface water. It is separate from the sanitary sewer system.'],
    bstream:['Buried watercourse','Culvert','A watercourse recorded in an underground channel or crossing.'],
    culvert:['Culvert','Culvert','Carries water beneath a road or another crossing.'],
    aqueduct:['Aqueduct or tunnel','Aqueduct_(water_supply)','The DNR classifies this segment as an aqueduct or tunnel.'],
    formerchannel:['Former channel','Stream','A DNR superseded-channel record, not evidence of a currently operating underground pipe.'],
    stream:['Surface stream','Stream','A mapped surface watercourse.'],
    dam:['Dam','Dam','A structure that controls water levels or flow.'],lock:['Navigation lock','Lock_(water_navigation)','Moves boats between different water levels.'],
    transmission:['Electric transmission line','Electric_power_transmission','Moves power between generating plants and substations. Mapped lines are mostly overhead.'],
    distribution:['Electric distribution feeder','Electric_power_distribution','A mapped local feeder. This layer covers only part of the distribution network.'],
    sub:['Electric substation','Electrical_substation','Switches power and changes voltage between parts of the grid.'],
    pplant:['Generating site','Power_station','A mapped site for electricity generation. Capacity and fuel are recorded values, not live operating data.'],
    nuclearplant:['Nuclear power plant','Nuclear_power_plant','Uses nuclear fission to produce heat for electricity generation.'],
    gasplant:['Gas-fired generating site','Gas-fired_power_plant','A generating site recorded as using natural gas.'],
    coalplant:['Coal-fired generating site','Coal-fired_power_station','A generating site recorded as using coal. The map is not a current unit-status inventory.'],
    hydroplant:['Hydroelectric plant','Hydroelectricity','Generates electricity from flowing water.'],
    solar:['Solar generating site','Photovoltaic_power_station','Converts sunlight into electricity.'],wind:['Wind generating site','Wind_farm','Generates electricity from wind.'],
    wasteplant:['Waste-to-energy plant','Waste-to-energy','Burns waste to produce useful energy.'],biomass:['Biomass plant','Biomass_(energy)','Uses plant material as fuel.'],battery:['Battery storage','Battery_storage_power_station','Stores electricity for later use.'],
    gas:['Gas pipeline','Natural_gas#Transportation','A pipeline recorded as carrying gas. Local street distribution routes are not included as a complete network.'],
    steam:['Steam pipeline','District_heating','Carries steam through a heating network.'],waterpipe:['Water pipeline','Water_supply_network','A pipeline recorded as carrying water.'],
    pipeline:['Pipeline','Pipeline_transport','A mapped pipe. Substance and operator are shown only when the source records them.'],
    pipestation:['Pipeline station','Pipeline_transport','A recorded station or control point on a pipeline.'],districtheat:['District heating','District_heating','A central plant supplies heat to buildings through pipes.'],
    dc:['Data center','Data_center','Houses computing and network equipment. Some sites connect different network operators.'],carrierhotel:['Carrier hotel','Carrier_hotel','A building where telecommunications providers connect their equipment.'],exch:['Recorded telephone exchange','Telephone_exchange','A central office from the telephone network. OpenStreetMap tags may describe a former use.'],
    bdepth:['Modeled depth to bedrock','Bedrock','The MGS 2025 regional model estimates the distance from the ground surface to rock. It is not a site measurement.'],
    bedrock:['Bedrock formation','Bedrock','The mapped rock unit beneath the glacial deposits.'],fault:['Mapped bedrock fault','Fault_(geology)','A geological fault recorded in the bedrock map.'],
    well:['Recorded water well','Water_well','A drilled well recorded in the County Well Index. Depth and aquifer fields come from its record.'],
    groundwater:['Groundwater contamination area','Groundwater_pollution','An MPCA inventory polygon. It is not a parcel-level determination of exposure or current conditions.'],
    cleanup:['Cleanup or tank record','Environmental_remediation','A regulated-site inventory record. Program activity and status need to be read in the source record.'],
    pavement:['Street condition record','Pavement_Condition_Index','Historical Minneapolis ratings on a 0-to-100 scale. Unrated segments remain unclassified.'],
    cutoffwall:['Buried cutoff wall','Saint_Anthony_Falls','A buried barrier that restricts water moving through the ground.']
  };
  function typeInfo(f){
    if(f.layer==='generators'){var tech=f.p.technology||'Electric generator',page=/combined cycle/i.test(tech)?'Combined_cycle_power_plant':/combustion turbine/i.test(tech)?'Gas_turbine':/photovoltaic/i.test(tech)?'Photovoltaic_power_station':/wind/i.test(tech)?'Wind_turbine':/hydroelectric/i.test(tech)?'Hydroelectricity':/nuclear/i.test(tech)?'Nuclear_power_plant':/batter/i.test(tech)?'Battery_storage_power_station':'Electric_generator';return {label:tech,wiki:'https://en.wikipedia.org/wiki/'+page,description:'This is one reported generating unit at '+(f.p.name||'this site')+'. The map uses the plant’s approximate EIA coordinates. Nameplate capacity is a rating; the inventory status does not describe production at this moment.'};}
    var precise=catalog.typeInfo(f);if(precise)return precise;
    var k=f.type||featureType(f),external=media.types[k],base=fallbackTypes[k]||fallbackTypes[(layers[f.layer]||{}).type]||['Published map record','Geographic_information_system','The source record supplies the available attributes for this mapped feature.'];
    return external?{label:external.label||base[0],wiki:external.wikipedia||('https://en.wikipedia.org/wiki/'+base[1]),description:external.description||base[2]}:{label:base[0],wiki:'https://en.wikipedia.org/wiki/'+base[1],description:base[2]};
  }
  function featureFacts(f){return f.facts||catalog.facts(f);}
  function metaFor(id){
    if(!manifest)return null;var list=Array.isArray(manifest)?manifest:manifest.datasets||manifest.layers||[];
    if(!Array.isArray(list))list=Object.keys(list).map(function(k){return Object.assign({id:k},list[k]);});
    var file=(layers[id]||{}).file;return list.find(function(m){return m.id===id||file&&(m.file===file||m.path===file||String(m.file||m.path||'').endsWith('/'+file));})||null;
  }
  function photoFor(f){
    var name=f.photoName||f.name,lon=lonOf(f.x),lat=latOf(f.y),best=null;
    media.photos.some(function(p){if(p.illustrative)return false;var m=p.match||{};if((m.names||[]).indexOf(name)>=0&&(!(m.kinds||[]).length||(m.kinds||[]).indexOf(f.type)>=0)){best=p;return true;}if(m.near&&(m.kinds||[]).indexOf(f.type)>=0){var dx=(lon-m.near[0])*Math.cos(lat*Math.PI/180),dy=lat-m.near[1];if(Math.hypot(dx,dy)*111320<=(m.radiusM||80)){best=p;return true;}}return false;});return best;
  }
  function photoAsset(file){return /^assets\/map\//.test(file||'')?file+(file.indexOf('?')>=0?'&':'?')+'v='+VERSION:file;}
  function photoHTML(p){if(!p)return '';var src=photoAsset(p.src||''),webp=photoAsset(p.webp||''),w=p.width||800,h=p.height||500;return '<figure class="um-pimg'+(h>w?' is-portrait':'')+'"><picture>'+(webp?'<source type="image/webp" srcset="'+esc(webp)+'">':'')+'<img src="'+esc(src)+'" width="'+w+'" height="'+h+'" alt="'+esc(p.alt||p.title)+'" loading="lazy"></picture><button type="button" class="um-photo-open">View photograph</button><figcaption>'+esc(p.caption||p.title)+' <a href="'+safeLink(p.sourceUrl)+'" target="_blank" rel="noopener">'+esc(p.creator)+'</a> · <a href="'+safeLink(p.licenseUrl||p.sourceUrl)+'" target="_blank" rel="noopener">'+esc(p.license)+'</a></figcaption></figure>';}
  function showMap(){STAGE.scrollIntoView({block:'center',behavior:reduced?'instant':'smooth'});CANVAS.focus({preventScroll:true});}
  function openPanel(f,focus){
    var updating=selection&&selection.id===f.id&&!PANEL.hidden,scrollTop=updating?PANEL.scrollTop:0,active=document.activeElement,focusKey=null,openDetails=updating?Array.from(PANEL.querySelectorAll('details[open]')).map(function(d){return d.className;}):[];
    if(updating&&PANEL.contains(active))focusKey=active.dataset.pa?'[data-pa="'+active.dataset.pa+'"]':active.classList.contains('um-pback')?'.um-pback':active.dataset.related?'[data-related]':active.classList.contains('um-photo-open')?'.um-photo-open':active.dataset.unit?'[data-unit="'+active.dataset.unit+'"]':active.tagName==='SUMMARY'?'.'+active.parentElement.className+' > summary':active.tagName==='A'?{href:active.getAttribute('href')}:null;
    selection=f;hovered=null;if(TOOLTIP)TOOLTIP.hidden=true;
    var info=typeInfo(f),rows=featureFacts(f),meta=metaFor(f.layer),photo=photoFor(f),placeWiki=catalog.wiki(f),record=catalog.recordURL(f),source=f.source||(meta&&(meta.sourceUrl||meta.url||meta.source&&meta.source.url));
    if(f.layer==='powerplants')rows=rows.filter(function(r){return r[0].indexOf('Generator ')!==0;});
    var links='<a href="'+safeLink(info.wiki)+'" target="_blank" rel="noopener">'+esc(info.label)+' <span>Wikipedia</span></a>';
    if(placeWiki&&placeWiki!==info.wiki)links+='<a href="'+safeLink(placeWiki)+'" target="_blank" rel="noopener">About this place <span>Wikipedia</span></a>';
    if(source)links+='<a href="'+safeLink(source)+'" target="_blank" rel="noopener">'+(f.source?'Primary source':'Dataset source')+'</a>';
    if(photo&&photo.wikipedia&&photo.wikipedia!==placeWiki&&photo.wikipedia!==info.wiki)links+='<a href="'+safeLink(photo.wikipedia)+'" target="_blank" rel="noopener">About this place <span>Wikipedia</span></a>';
    catalog.primarySources(f).forEach(function(l){links+='<a href="'+safeLink(l.url)+'" target="_blank" rel="noopener">'+esc(l.label)+'</a>';});
    if(record&&record!==source)links+='<a href="'+safeLink(record)+'" target="_blank" rel="noopener">Source record</a>';
    if(f.layer==='tour'&&f.topic!=='tour')links+='<button type="button" data-related="'+esc(f.topic)+'">Browse this system</button>';
    var extraRows=rows.length>10?rows.slice(10):[],primaryRows=rows.slice(0,10);
    function factRows(rs){return rs.map(function(r){return '<div><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>';}).join('');}
    var extra=extraRows.length?'<details class="um-record-details"><summary>More record details ('+extraRows.length+')</summary><dl class="um-facts">'+factRows(extraRows)+'</dl></details>':'';
    PANEL.innerHTML='<button class="um-pback" type="button">Back to places</button>'+photoHTML(photo)+'<p class="um-pk" style="--pk:'+(f.color||(layers[f.layer]||{}).color||C.cream)+'">'+esc(info.label)+'</p><h3 class="um-ptitle">'+esc(f.name)+'</h3><dl class="um-facts">'+factRows(primaryRows)+'</dl><p class="um-pblurb">'+esc(f.blurb||info.description)+'</p>'+(meta?'<p class="um-record-note">'+esc(meta.caveat||meta.notes||(meta.source&&meta.source.caveats||[]).slice(0,2).join(' '))+'</p>':'')+extra+'<div class="um-links">'+links+'</div><div class="um-pact"><button type="button" data-pa="closer">Zoom to place</button><button type="button" data-pa="aerial">Aerial photo</button><button type="button" data-pa="share">Copy map link</button></div><p class="um-coords">'+latOf(f.y).toFixed(5)+', '+lonOf(f.x).toFixed(5)+'</p>';
    PANEL.hidden=false;HOST.querySelector('.um-browser').dataset.inspecting='true';
    var actions=PANEL.querySelector('.um-pact');PANEL.querySelector('.um-ptitle').after(actions);
    PANEL.querySelector('.um-pback').addEventListener('click',function(){closePanel(true);});
    PANEL.querySelector('[data-pa="closer"]').addEventListener('click',function(){flyTo(f.x,f.y,f.z||15.5);showMap();});
    PANEL.querySelector('[data-pa="aerial"]').addEventListener('click',function(){setBase(true);flyTo(f.x,f.y,f.z?Math.max(15.5,f.z):16);showMap();});
    PANEL.querySelector('[data-pa="share"]').addEventListener('click',async function(e){var button=e.currentTarget;writeHash();try{await navigator.clipboard.writeText(location.href);button.textContent='Link copied';}catch(err){button.textContent='Link is in address bar';}});
    var related=PANEL.querySelector('[data-related]');if(related)related.addEventListener('click',function(){setTopic(f.topic,false);});
    if(f.layer==='powerplants'&&f.p.units&&f.p.units.length){var unitDetails=document.createElement('details');unitDetails.className='um-unit-details';unitDetails.innerHTML='<summary>Generating units and history ('+f.p.units.length+')</summary><p>August 2026 EIA inventory. Operating, planned and retired units are listed separately in each record.</p><div class="um-unit-list">'+f.p.units.map(function(u,i){return '<button type="button" data-unit="'+i+'"><b>Generator '+esc(u.g)+'</b><span>'+esc(u.status||u.stage)+' · '+esc(u.mw)+' MW nameplate</span></button>';}).join('')+'</div>';PANEL.querySelector('.um-links').before(unitDetails);unitDetails.querySelectorAll('[data-unit]').forEach(function(b){b.addEventListener('click',function(){var u=f.p.units[+b.dataset.unit],unit={id:'generators-'+f.p.i+'-'+u.g,layer:'generators',kind:'point',x:f.x,y:f.y,p:Object.assign({i:f.p.i,name:f.p.name,operator:f.p.operator},u)};unit.name=featureName(unit);unit.type=featureType(unit);layers.generators.on=true;if(!allowed(unit))showInactive=true;HOST.querySelector('[data-um-inactive]').setAttribute('aria-pressed',String(showInactive));updateLayers();updateLegend();ensure('generators');lastSelected=unit.id;openPanel(unit,true);});});}
    var photoButton=PANEL.querySelector('.um-photo-open');if(photoButton)photoButton.addEventListener('click',function(){var dialog=HOST.querySelector('.um-photo-dialog');dialog.querySelector('.um-photo-full').innerHTML=photoHTML(photo).replace(/<button[^>]*class="um-photo-open"[^>]*>.*?<\/button>/,'');dialog.querySelector('h3').textContent=photo.title;dialog.showModal();});
    openDetails.forEach(function(c){var d=PANEL.querySelector('details.'+c);if(d)d.open=true;});
    PANEL.scrollTop=scrollTop;var oldFocus=focusKey&&(typeof focusKey==='string'?PANEL.querySelector(focusKey):Array.from(PANEL.querySelectorAll('a')).find(function(a){return a.getAttribute('href')===focusKey.href;}));if(oldFocus)oldFocus.focus({preventScroll:true});else if(focus){PANEL.querySelector('.um-pback').focus({preventScroll:true});if(matchMedia('(max-width: 960px)').matches)PANEL.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});}requestDraw();writeHash();
  }
  function closePanel(focus){PANEL.hidden=true;HOST.querySelector('.um-browser').dataset.inspecting='false';selection=null;renderResults();requestDraw();writeHash();if(focus){var last=RESULTS.querySelector('[data-id="'+esc(lastSelected||'')+'"]');(lastFocusControl===CANVAS?CANVAS:last||lastFocusControl&&lastFocusControl.isConnected&&lastFocusControl||SEARCH).focus({preventScroll:true});if(lastFocusControl===CANVAS&&matchMedia('(max-width: 960px)').matches)showMap();}}
  var lastSelected=null,lastFocusControl=null;

  var SAT = { on: false, failed:false, cache: new Map(), maxTiles: 96 };
  function tileURL(z, x, y) { return 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/' + z + '/' + y + '/' + x; }
  function tileGet(z, x, y) {
    var k = z + '/' + x + '/' + y;
    var t = SAT.cache.get(k);
    if (t) return t;
    if (SAT.cache.size > SAT.maxTiles) SAT.cache.delete(SAT.cache.keys().next().value);
    t = { img: new Image(), ok: false, dead: false };
    t.img.onload = function () { t.ok = true; requestDraw(); };
    t.img.onerror = function () { t.dead = true; requestDraw(); };
    t.img.src = tileURL(z, x, y);
    SAT.cache.set(k, t);
    return t;
  }
  var HQ = { img: null, box: null, pending: null, timer: null };
  var WORLD_M = 40075016.686;
  function hqRefresh() {
    if (!SAT.on || view.z < 14.2) {if(HQ.timer)clearTimeout(HQ.timer);return;}
    if (HQ.timer) clearTimeout(HQ.timer);
    HQ.timer = setTimeout(function () {
      var s = scale();
      var wpx = Math.min(2200, Math.round(W * DPR)), hpx = Math.min(2200, Math.round(H * DPR));
      var x0 = view.x - (W / 2) / s, x1 = view.x + (W / 2) / s;
      var y0 = view.y - (H / 2) / s, y1 = view.y + (H / 2) / s;
      var mx0 = (x0 - 0.5) * WORLD_M, mx1 = (x1 - 0.5) * WORLD_M;
      var my0 = (0.5 - y1) * WORLD_M, my1 = (0.5 - y0) * WORLD_M;
      var url = 'https://imageserver.gisdata.mn.gov/cgi-bin/mncomp?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=mncomp&STYLES=&CRS=EPSG:3857' +
        '&BBOX=' + mx0.toFixed(1) + ',' + my0.toFixed(1) + ',' + mx1.toFixed(1) + ',' + my1.toFixed(1) +
        '&WIDTH=' + wpx + '&HEIGHT=' + hpx + '&FORMAT=image/jpeg';
      var img = new Image();
      HQ.pending = img;
      img.onload = function () {
        if (HQ.pending !== img) return;
        HQ.pending=null;HQ.img = img; HQ.box = { x0: x0, x1: x1, y0: y0, y1: y1 };
        requestDraw();
      };
      img.onerror = function () { if (HQ.pending === img) HQ.pending = null;requestDraw(); };
      img.src = url;
    }, 380);
  }
  function drawTiles() {
    var painted=false,failed=false,zi = Math.max(3, Math.min(16, Math.floor(view.z + 0.4)));
    var n = Math.pow(2, zi), s = scale(), ts = s / n;
    var x0 = Math.floor((view.x - (W / 2) / s) * n), x1 = Math.floor((view.x + (W / 2) / s) * n);
    var y0 = Math.floor((view.y - (H / 2) / s) * n), y1 = Math.floor((view.y + (H / 2) / s) * n);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        var t = tileGet(zi, tx, ty);
        if(t.dead)failed=true;if (!t.ok || t.dead) continue;
        var px = (tx / n - view.x) * s + W / 2, py = (ty / n - view.y) * s + H / 2;
        try { ctx.drawImage(t.img, px, py, ts + 0.6, ts + 0.6);painted=true; } catch (err) {}
      }
    }
    // the sharp state overlay, reprojected from its captured view
    if (HQ.img && HQ.box && view.z >= 14.2) {
      var b = HQ.box;
      var px0 = (b.x0 - view.x) * s + W / 2, py0 = (b.y0 - view.y) * s + H / 2;
      var pw = (b.x1 - b.x0) * s, ph = (b.y1 - b.y0) * s;
      try { if(px0<W&&py0<H&&px0+pw>0&&py0+ph>0){ctx.drawImage(HQ.img, px0, py0, pw, ph);painted=true;} } catch (err) {}
    }
    var unavailable=failed&&!painted;if(SAT.failed!==unavailable){SAT.failed=unavailable;updateLayers();}return painted;
  }

  // Geometry is drawn in batches. Dense point layers use a spatial grid.
  function path(f){f.rings.forEach(function(r){r.forEach(function(c,i){var p=toPx(c[0],c[1]);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});if(f.kind==='polygon')ctx.closePath();});}
  function lineStyle(f){
    var p=f.p||{},id=f.layer,st=catalog.lineStyle(f),color=layers[id]?catalog.color(f):'rgba(232,226,214,.22)',width=1.5,dash=st.dash;
    if(id==='power'){width=p.v>=300?2.5:p.v>=200?2:p.v>=100?1.6:1.2;if(p.location==='underground')dash=[4,3];}
    if(id==='feeders'||id==='rail')width=1;
    if(id==='interceptors'||id==='pavement')width=2;
    if(id==='buried'){dash=p.t===90?[2,5]:[6,3];}
    if(id==='pipelines'&&!p.substance)dash=[2,4];
    if(id==='faults')dash=[4,3];
    if(id==='streams')width=1.3;
    return {color:color,width:width,dash:dash,opacity:st.opacity};
  }
  function strokeFeatures(fs,override){
    var buckets=new Map();fs.forEach(function(f){if(!visible(f)||layers[f.layer]&&!allowed(f))return;var st=override||lineStyle(f),k=st.color+'|'+st.width+'|'+st.dash.join(',')+'|'+st.opacity;if(!buckets.has(k))buckets.set(k,{s:st,fs:[]});buckets.get(k).fs.push(f);});
    buckets.forEach(function(b){ctx.globalAlpha=b.s.opacity==null?1:b.s.opacity;ctx.beginPath();b.fs.forEach(path);ctx.setLineDash(b.s.dash);if(SAT.on){ctx.strokeStyle='rgba(16,21,17,.85)';ctx.lineWidth=b.s.width+2;ctx.stroke();}ctx.strokeStyle=b.s.color;ctx.lineWidth=b.s.width;ctx.stroke();});ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  function pointColor(f){return catalog.color(f);}
  var labelQ=[];
  function queueLabel(text,x,y,priority){if(text&&text.length<90)labelQ.push({text:text,x:x,y:y,priority:priority||0});}
  function drawLabels(){
    ctx.font='600 11px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';var placed=[];
    labelQ.sort(function(a,b){return b.priority-a.priority;}).forEach(function(q){ctx.font=(q.priority===-2?'400 11px':q.priority===-1||q.priority===11?'600 12px':'600 11px')+' \"Segoe UI\",sans-serif';var w=ctx.measureText(q.text).width/2+5,b=[q.x-w,q.y-14,q.x+w,q.y+1];if(b[0]<8||b[2]>W-8||b[1]<55||b[3]>H-65||placed.some(function(o){return b[0]<o[2]&&b[2]>o[0]&&b[1]<o[3]&&b[3]>o[1];}))return;placed.push(b);ctx.lineWidth=q.priority===-2?3:4;ctx.strokeStyle='rgba(30,36,32,.95)';ctx.strokeText(q.text,q.x,q.y);ctx.fillStyle=q.priority===-2?'rgba(232,226,214,.72)':'#e8e2d6';ctx.fillText(q.text,q.x,q.y);});labelQ=[];
  }
  var depthCanvas=null;
  function rasterBounds(r){if(r.extentMeters){var e=r.extentMeters;if(!Array.isArray(e))e=[e.xmin,e.ymin,e.xmax,e.ymax];return [e[0]/WORLD_M+.5,.5-e[3]/WORLD_M,e[2]/WORLD_M+.5,.5-e[1]/WORLD_M];}return [mx(r.bounds[0]),my(r.bounds[3]),mx(r.bounds[2]),my(r.bounds[1])];}
  function depthColor(ft){return ft<50?[223,194,136]:ft<150?[207,159,120]:ft<300?[184,121,109]:[183,155,196];}
  function drawDepth(state){
    var r=state.raster;if(!r)return;
    if(!depthCanvas){depthCanvas=document.createElement('canvas');depthCanvas.width=r.width;depthCanvas.height=r.height;var c=depthCanvas.getContext('2d'),pixels=c.createImageData(r.width,r.height);r.values.forEach(function(v,i){if(v==null||v===r.nodata)return;var rgb=depthColor(v),j=i*4;pixels.data[j]=rgb[0];pixels.data[j+1]=rgb[1];pixels.data[j+2]=rgb[2];pixels.data[j+3]=130;});c.putImageData(pixels,0,0);}
    var b=rasterBounds(r),p0=toPx(b[0],b[1]),p1=toPx(b[2],b[3]);ctx.imageSmoothingEnabled=false;ctx.drawImage(depthCanvas,p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1]);ctx.imageSmoothingEnabled=true;
  }
  function draw(){
    if(!W||!H)return;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#1e2420';ctx.fillRect(0,0,W,H);ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash([]);
    var hasAerial=SAT.on&&drawTiles();
    if(topic==='ground'&&layers.depth.on&&data.depth)drawDepth(data.depth);
    activeIds().forEach(function(id){var cfg=layers[id],state=data[id];if(view.z<cfg.minZ||cfg.kind!=='polygon'||!state||!state.features)return;state.features.forEach(function(f){if(!visible(f)||!allowed(f))return;ctx.beginPath();path(f);ctx.fillStyle=id==='bedrock'?(f.p.u||'').charAt(0)==='C'?'rgba(223,194,136,.22)':'rgba(183,155,196,.25)':id==='sheds'?'rgba(158,199,154,.07)':'rgba(207,159,120,.20)';ctx.fill('evenodd');ctx.strokeStyle=cfg.color;ctx.globalAlpha=.35;ctx.lineWidth=.7;ctx.stroke();ctx.globalAlpha=1;});});
    if(!hasAerial){
      if(data.contextWater&&data.contextWater.features){ctx.beginPath();data.contextWater.features.filter(function(f){return visible(f);}).forEach(path);ctx.fillStyle='#273e43';ctx.fill('evenodd');}
      if(data.contextCounties&&data.contextCounties.features)strokeFeatures(data.contextCounties.features,{color:'rgba(232,226,214,.12)',width:.7,dash:[]});
    }
    var streetsDrawn=drawStreets(hasAerial);if(!hasAerial&&!streetsDrawn&&data.contextRoads&&data.contextRoads.features)strokeFeatures(data.contextRoads.features,{color:'rgba(232,226,214,.2)',width:.8,dash:[]});
    activeIds().forEach(function(id){var cfg=layers[id],state=data[id];if(!state||!state.features||view.z<cfg.minZ)return;
      if(cfg.kind==='line'){strokeFeatures(state.features);return;}if(cfg.kind!=='point')return;
      visiblePoints(state).forEach(function(f){if(!visible(f)||!allowed(f))return;var p=toPx(f.x,f.y),dense=['services','hydrants','inlets','wells','cleanup'].indexOf(id)>=0,r=dense?(view.z>15?2.5:1.6):3.6;
        if(id==='powerplants'&&f.p.mw)r=Math.max(3.5,Math.min(10,2+Math.sqrt(f.p.mw)*.3));
        ctx.fillStyle=pointColor(f);ctx.strokeStyle='#1e2420';ctx.lineWidth=1.2;ctx.beginPath();
        if(id==='substations'||id==='comms'||id==='exchanges'){ctx.rect(p[0]-r,p[1]-r,r*2,r*2);}else ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();ctx.stroke();
        if(!dense&&view.z>11.4&&catalog.isNamed(f))queueLabel(f.name,p[0],p[1]-r-4,id==='plants'?5:2);
      });
    });
    if(topic==='tour')tour.forEach(function(f,i){if(!visible(f))return;var p=toPx(f.x,f.y);ctx.fillStyle=f.color;ctx.strokeStyle='#1e2420';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p[0],p[1],6,0,Math.PI*2);ctx.fill();ctx.stroke();queueLabel(f.name,p[0],p[1]-10,10-i);});
    if(addressPin){var ap=toPx(addressPin.x,addressPin.y);ctx.strokeStyle=C.cream;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(ap[0],ap[1],7,0,Math.PI*2);ctx.moveTo(ap[0]-11,ap[1]);ctx.lineTo(ap[0]+11,ap[1]);ctx.moveTo(ap[0],ap[1]-11);ctx.lineTo(ap[0],ap[1]+11);ctx.stroke();}
    if(document.activeElement===CANVAS){ctx.strokeStyle=C.cream;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(W/2-8,H/2);ctx.lineTo(W/2+8,H/2);ctx.moveTo(W/2,H/2-8);ctx.lineTo(W/2,H/2+8);ctx.stroke();}
    if(selection){if(selection.rings){ctx.beginPath();path(selection);ctx.strokeStyle='#ede0c0';ctx.lineWidth=3;ctx.stroke();}else{var sp=toPx(selection.x,selection.y);ctx.strokeStyle='#ede0c0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sp[0],sp[1],10,0,Math.PI*2);ctx.stroke();}}
    if(hovered&&hovered.rings){ctx.beginPath();path(hovered);ctx.strokeStyle='#ede0c0';ctx.lineWidth=2.5;ctx.stroke();}
    [['Minneapolis',-93.265,44.978],['Saint Paul',-93.09,44.954],['Bloomington',-93.30,44.826],['Maple Grove',-93.455,45.07],['Woodbury',-92.955,44.91],['Coon Rapids',-93.31,45.16]].forEach(function(p){var xy=toPx(mx(p[1]),my(p[2])),major=view.z<12.5&&(p[0]==='Minneapolis'||p[0]==='Saint Paul');queueLabel(p[0],xy[0],xy[1]+(major?(p[0]==='Minneapolis'?-8:12):0),major?11:-1);});
    drawLabels();drawScale();
  }
  function drawScale(){var metersPerPx=WORLD_M*Math.cos(latOf(view.y)*Math.PI/180)/scale(),target=90*metersPerPx/1609.344,mi=.05;[.05,.1,.25,.5,1,2,5,10,20].forEach(function(v){if(v<=target)mi=v;});SCALE.textContent=mi+' mi';SCALE.style.width=mi*1609.344/metersPerPx+'px';}

  function countFor(id){var m=metaFor(id),d=data[id];return m&&m.featureCount!=null?m.featureCount:m&&m.count!=null?m.count:d&&d.count!=null?d.count:null;}
  function updateLayers(){
    var list=HOST.querySelector('.um-layer-list');
    topics[topic].layers.forEach(function(id){var btn=list.querySelector('[data-layer="'+id+'"]');if(!btn)return;var cfg=layers[id],state=data[id]||{},n=countFor(id),small=btn.querySelector('small');btn.setAttribute('aria-pressed',String(cfg.on));btn.classList.toggle('is-error',!!state.error||!!state.tileError);small.textContent=state.error?'Could not load. Select to retry.':state.loading||state.pending?'Loading records…':(n!=null?fmt.format(n)+(cfg.kind==='raster'?' model cells':' records')+' · ':'')+(view.z<cfg.minZ?'Zoom in to see these records. ':cfg.municipal&&!shouldLoad(id)?'Choose this city to load its records. ':'')+(cfg.note||'Published snapshot');});
    var loading=activeIds().some(function(id){return data[id]&&(data[id].loading||data[id].pending);}),errors=activeIds().filter(function(id){return data[id]&&(data[id].error||data[id].tileError);});
    var streetError=data.contextStreets&&(data.contextStreets.error||data.contextStreets.tileError);STATUS.hidden=!loading&&!errors.length&&!catalogError&&!streetError&&!(SAT.on&&SAT.failed);STATUS.textContent=loading?'Loading this system…':errors.length?'Some records could not load. Retry in Map details.':catalogError?'Dataset catalog could not load. Retry in Sources and downloads.':streetError?'Street context could not load. Select Map to retry.':SAT.on&&SAT.failed?'Aerial imagery could not load. Showing the map. Select Aerial to retry.':'';
  }
  function buildLayerControls(){
    var list=HOST.querySelector('.um-layer-list');list.innerHTML=topics[topic].layers.map(function(id){var cfg=layers[id];return '<button class="um-layer" type="button" data-layer="'+id+'" aria-pressed="'+cfg.on+'" style="--layer-color:'+cfg.color+'"><i aria-hidden="true"></i><span><b>'+esc(cfg.title)+'</b><small></small></span><span class="um-layer-state" aria-hidden="true"></span></button>';}).join('');
    list.querySelectorAll('button').forEach(function(btn){btn.addEventListener('click',function(){var id=btn.dataset.layer,state=data[id];if(state&&(state.error||state.tileError)){delete data[id];layers[id].on=true;}else layers[id].on=!layers[id].on;hovered=null;if(layers[id].on&&shouldLoad(id))ensure(id);if(selection&&selection.layer===id&&!layers[id].on)closePanel(false);updateLayers();updateLegend();renderResults();requestDraw();writeHash();});});updateLayers();updateLegend();
    HOST.querySelector('.um-layers').hidden=topic==='tour';
    var inactive=HOST.querySelector('.um-inactive');inactive.hidden=!topics[topic].layers.some(function(id){return layers[id].hasInactive;});
    inactive.querySelector('button').setAttribute('aria-pressed',String(showInactive));
  }
  function updateLegend(){
    var entries=[];activeIds().forEach(function(id){var cfg=layers[id];if(view.z<cfg.minZ)return;if(id==='services'){entries.push(['Lead',C.power],['Non-lead',C.water],['Unknown material',C.gas],['Galvanized requiring replacement',C.ground]);}else if(id==='depth'){entries.push(['Under 50 ft','#dfc288'],['50–149 ft','#cf9f78'],['150–299 ft','#b8796d'],['300 ft or more',C.ground]);}else if(id==='pipelines'){entries.push(['Gas',C.gas],['Steam',C.net],['Water or drainage',C.water],['Other substance',C.ground],['Unclassified','#a4a293']);}else if(id==='interceptors'){entries.push(['Gravity',C.sewer,'solid'],['Pumped force main',C.sewer,'dashed'],['Inverted siphon',C.sewer,'dotted']);}else if(id==='pavement'){entries.push(['PCI under 40','#b8796d'],['PCI 40–69',C.gas],['PCI 70–100',C.sewer],['Unrated','#a4a293']);}else entries.push([cfg.title,cfg.color,cfg.kind==='line'?'solid':null]);});
    if(showInactive&&topics[topic].layers.some(function(id){return layers[id].hasInactive;}))entries.push(['Inactive records','#a4a293']);
    HOST.querySelector('.um-legend').innerHTML=entries.map(function(e){return '<span><i style="--legend-color:'+e[1]+';'+(e[2]?'border-top:2px '+e[2]+' '+e[1]+';background:none;width:20px;height:0;border-radius:0':'')+'" aria-hidden="true"></i>'+esc(e[0])+'</span>';}).join('');
    var key=HOST.querySelector('.um-map-key'),keyEntries=[],keyTitle='';
    if(topic==='ground'&&layers.depth.on){keyTitle='Depth to bedrock, feet';keyEntries=[['Under 50','#dfc288'],['50–149','#cf9f78'],['150–299','#b8796d'],['300+',C.ground]];}
    else if(topic==='water'&&layers.services.on&&view.z>=layers.services.minZ&&visiblePoints(data.services).some(function(f){return visible(f)&&allowed(f);})){keyTitle='Minneapolis connection material';keyEntries=[['Lead',C.power],['Non-lead',C.water],['Unknown',C.gas],['Galvanized requiring replacement',C.ground],['Non-water record','#a4a293']];}
    key.hidden=!keyTitle;key.innerHTML=key.hidden?'':'<span>'+keyTitle+'</span>'+keyEntries.map(function(e){return '<span><i style="--legend-color:'+e[1]+'" aria-hidden="true"></i>'+esc(e[0])+'</span>';}).join('');

  }
  function namedFeature(f){return catalog.isNamed(f);}
  function renderResults(){
    if(!RESULTS)return;var active=document.activeElement,focusedResult=RESULTS.contains(active)&&active.dataset.id,resultsScroll=RESULTS.scrollTop;var q=SEARCH.value.trim().toLowerCase(),items=[],busy=false,denseHidden=false;
    if(topic==='tour')items=tour.slice();else activeIds().forEach(function(id){var d=data[id],cfg=layers[id];if(view.z<cfg.minZ||cfg.municipal&&!shouldLoad(id)){denseHidden=true;return;}if(!d||d.loading){busy=true;return;}if(!d.features)return;
      var dense=['services','wells','hydrants','inlets','cleanup','meters','lifts','wspInlets','wspSanManholes','wspStormManholes'].indexOf(id)>=0;
      if(dense&&view.z<cfg.minZ){denseHidden=true;return;}
      var fs=cfg.municipal?d.features.filter(function(f){return visible(f);}):dense?visiblePoints(d):d.features;
      fs.forEach(function(f){if(!allowed(f)||scope==='view'&&!visible(f))return;if(!q&&!namedFeature(f)&&!dense&&view.z<12.5)return;
        if(q){var text=(f.name+' '+f.id+' '+typeInfo(f).label+' '+Object.values(f.p).join(' ')).toLowerCase();if(text.indexOf(q)<0)return;}items.push(f);
      });
    });
    if(topic==='tour'&&q)items=items.filter(function(f){return (f.name+' '+f.blurb+' '+typeInfo(f).label).toLowerCase().indexOf(q)>=0;});
    if(topic!=='tour')items.sort(function(a,b){var an=namedFeature(a)?0:1,bn=namedFeature(b)?0:1;return an-bn||Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y);});
    resultItems=items;var heading=HOST.querySelector('.um-results-heading'),shown=Math.min(items.length,visibleLimit),hasModel=topic==='ground'&&layers.depth.on&&data.depth&&data.depth.raster;
    heading.textContent=topic==='tour'?'Places to begin':hasModel&&!items.length&&!q?'Explore the depth model':busy&&!items.length?'Loading places…':fmt.format(items.length)+' matching '+(items.length===1?'record':'records')+(scope==='view'?' in this view':'');
    var nameCounts=Object.create(null);items.forEach(function(f){nameCounts[f.name]=(nameCounts[f.name]||0)+1;});
    RESULTS.innerHTML=items.slice(0,visibleLimit).map(function(f,i){var info=typeInfo(f),p=photoFor(f),thumb=topic==='tour'&&p?'<picture class="um-result-thumb">'+(p.webp?'<source type="image/webp" srcset="'+esc(photoAsset(p.webp))+'">':'')+'<img src="'+esc(photoAsset(p.src))+'" alt="" width="56" height="56" loading="'+(i===0?'eager':'lazy')+'"></picture>':'';return '<button class="um-result" type="button" data-id="'+esc(f.id)+'" style="--result-color:'+pointColor(f)+'">'+thumb+'<span class="um-result-text"><span class="um-result-name">'+esc(f.name)+'</span><span class="um-result-meta">'+esc(info.label)+(catalog.status(f)&&layers[f.layer]&&layers[f.layer].hasInactive?' · '+catalog.status(f):'')+(nameCounts[f.name]>1&&f.layer==='interceptors'&&f.p.i!=null?' · Record '+esc(f.p.i):'')+'</span></span></button>';}).join('');
    if(!items.length)RESULTS.innerHTML='<p class="um-empty">'+(busy?'Loading this system.':q?denseHidden?'No matching records at this scale. Zoom in to search street records, or try a facility name.':'No matching records. Try a name, type or record ID.':hasModel?'Select a colored part of the map to see the modeled depth. Zoom in for well records, or add a geology layer in Map details.':denseHidden?'Zoom in for individual connections and records, or turn on another layer in Map details.':'No records in this view. Choose Browse records or another layer.')+'</p>';
    else if(denseHidden)RESULTS.insertAdjacentHTML('beforeend','<p class="um-empty">Zoom in for individual connections and street records.</p>');
    RESULTS.querySelectorAll('[data-id]').forEach(function(btn){btn.addEventListener('click',function(){var f=items.find(function(f){return f.id===btn.dataset.id;});if(!f)return;lastSelected=f.id;lastFocusControl=btn;if(f.layer==='tour'&&f.z>=14)setBase(true);openPanel(f,true);flyTo(f.x,f.y,f.z||Math.max(view.z,f.kind==='point'?14.5:14));});});
    RESULTS.scrollTop=resultsScroll;if(focusedResult){var replacement=Array.from(RESULTS.querySelectorAll('[data-id]')).find(function(b){return b.dataset.id===focusedResult;});if(replacement)replacement.focus({preventScroll:true});}
    var browseNote=HOST.querySelector('.um-browse-note');browseNote.hidden=!topics[topic].layers.some(function(id){return (layers[id].tileIndex||layers[id].municipal)&&layers[id].on;});browseNote.textContent='Street records and wells are browsed near the map view. Zoom in, or choose a city to explore its published pipes.';
    var more=HOST.querySelector('.um-results-more');more.hidden=shown>=items.length||!items.length;more.textContent='Show '+Math.min(30,items.length-shown)+' more';
  }
  function setTopic(id,reset){
    if(!topics[id])return;if(started&&restoring){restoring=false;requestedFeature=null;}topic=id;visibleLimit=30;SEARCH.value='';closePanel(false);HOST.querySelector('.um-browse-controls').hidden=id==='tour';
    HOST.querySelectorAll('[data-um-topic]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.umTopic===id));});
    var intro=HOST.querySelector('.um-topic-copy');intro.innerHTML='<h3>'+esc(topics[id].title)+'</h3><p>'+esc(topics[id].text)+'</p>';
    buildLayerControls();if(manifest)renderSources();if(started)ensureActive();if(reset){view.x=HOME.x;view.y=HOME.y;view.z=HOME.z;}
    renderResults();requestDraw();writeHash();
  }
  function displayDate(value){
    value=catalog.displayDate(value);if(!value)return 'Source date not supplied';
    if(typeof value==='string'&&!/^\d{4}-\d{2}-\d{2}T/.test(value))return value;
    var date=new Date(value);return isNaN(date)?String(value):date.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
  }
  function renderSources(){
    if(!manifest)return;
    var all=manifest.datasets||[],mapped=Object.keys(layers).map(function(id){return layers[id].file;}).concat(['counties.json','water.json','roads-context.json','data/context-streets.json.gz']),selected=topics[topic].layers.map(function(id){return layers[id].file;}),query=(HOST.querySelector('.um-source-search input').value||'').trim().toLowerCase();
    HOST.querySelector('.um-summary').textContent=Object.keys(layers).length+' map layers · Public records for the Twin Cities region';
    HOST.querySelectorAll('[data-um-topic]').forEach(function(b){var key=b.dataset.umTopic,n=key==='tour'?tour.length:topics[key].layers.length;b.querySelector('.um-topic-count').textContent=n;b.setAttribute('aria-label',b.firstChild.textContent.trim()+', '+n+(key==='tour'?' places':' layers'));});
    var list=all.filter(function(m){
      var current=mapped.indexOf(m.file)>=0,match=sourceScope==='earlier'?!current&&m.legacy:sourceScope==='all'?true:topic==='tour'?current:selected.indexOf(m.file)>=0;
      return match&&(!query||(m.title+' '+m.id+' '+(m.source||{}).coverage).toLowerCase().indexOf(query)>=0);
    });
    HOST.querySelector('.um-source-count').textContent=fmt.format(list.length)+' '+(list.length===1?'dataset':'datasets')+(sourceScope==='current'&&topic!=='tour'?' for '+topics[topic].title.toLowerCase():'')+'. Source dates describe the published snapshot. Map expanded October 3, 2026; retrieval dates vary by dataset.';
    HOST.querySelector('.um-datasets').innerHTML=list.length?'<div class="um-source-grid">'+list.map(function(m){
      var source=m.source||{},url=source.url,file=m.file,title=m.title||m.id,date=source.sourceDate,license=source.license,n=m.featureCount!=null?m.featureCount:m.recordCount,caveats=source.caveats||[],format=m.format==='DepthRaster'?'depth model JSON':m.format==='Table'?'table JSON':'GeoJSON',used=mapped.indexOf(file)>=0;if(/\.gz$/.test(file||''))format+=' (gzip)';var downloadSize=m.bytes!=null?' · '+(m.bytes>=1000000?(m.bytes/1000000).toFixed(1)+' MB':Math.max(1,Math.round(m.bytes/1000))+' KB'):'';
      return '<article class="um-source-item"><h4>'+esc(title)+'</h4><p class="um-source-meta">'+(n!=null?fmt.format(n)+' '+(m.format==='DepthRaster'?'model cells':'records')+' · ':'')+esc(displayDate(date))+'</p>'+(source.retrievedAt?'<p class="um-source-meta">Retrieved: '+esc(displayDate(source.retrievedAt))+'</p>':'')+(!used&&m.legacy?'<p class="um-source-version">Reference snapshot; this version is not drawn on the map.</p>':'')+'<p>'+esc(m.coverage||source.coverage||'')+'</p>'+'<div>'+(url?'<a href="'+safeLink(url)+'" target="_blank" rel="noopener">Source</a>':'')+(file?'<a href="'+esc(ROOT+file)+'" download>Download '+esc(format+downloadSize)+'</a>':'')+(source.itemUrl?'<a href="'+safeLink(source.itemUrl)+'" target="_blank" rel="noopener">Metadata</a>':'')+'</div>'+((caveats.length||license)?'<details class="um-source-notes"><summary>Record notes and terms</summary>'+(caveats.length?'<p>'+esc(caveats.join(' '))+'</p>':'')+(license?'<small>'+esc(license)+'</small>':'')+'</details>':'')+'</article>';
    }).join('')+'</div>':'<p class="um-empty">No datasets match this search.</p>';
  }

  // A click pins one inspector. Hover only shows a short map label.
  function hitTest(px,py){
    var best=null,distance=14,s=scale(),wx=view.x+(px-W/2)/s,wy=view.y+(py-H/2)/s;
    function point(f){if(!allowed(f))return;var p=toPx(f.x,f.y),d=Math.hypot(p[0]-px,p[1]-py);if(d<distance){distance=d;best=f;}}
    if(topic==='tour')tour.forEach(point);
    activeIds().forEach(function(id){var cfg=layers[id],state=data[id];if(!state||!state.features||cfg.kind!=='point'||view.z<cfg.minZ)return;visiblePoints(state).forEach(point);});if(best)return best;
    distance=7;
    activeIds().forEach(function(id){var cfg=layers[id],state=data[id];if(!state||!state.features||cfg.kind!=='line'||view.z<cfg.minZ)return;state.features.forEach(function(f){if(!allowed(f))return;if(wx<f.b[0]-8/s||wx>f.b[2]+8/s||wy<f.b[1]-8/s||wy>f.b[3]+8/s)return;f.rings.forEach(function(r){for(var i=1;i<r.length;i++){var a=toPx(r[i-1][0],r[i-1][1]),b=toPx(r[i][0],r[i][1]),dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy);if(d<distance){distance=d;best=f;}}});});});if(best)return best;
    activeIds().slice().reverse().forEach(function(id){var cfg=layers[id],state=data[id];if(best||!state||!state.features||cfg.kind!=='polygon'||view.z<cfg.minZ)return;state.features.slice().sort(function(a,b){return (a.b[2]-a.b[0])*(a.b[3]-a.b[1])-(b.b[2]-b.b[0])*(b.b[3]-b.b[1]);}).some(function(f){if(!allowed(f))return false;if(wx<f.b[0]||wx>f.b[2]||wy<f.b[1]||wy>f.b[3])return false;var inside=false;f.rings.forEach(function(r){for(var i=0,j=r.length-1;i<r.length;j=i++){var a=r[i],b=r[j];if((a[1]>wy)!==(b[1]>wy)&&wx<(b[0]-a[0])*(wy-a[1])/(b[1]-a[1])+a[0])inside=!inside;}});if(inside){best=f;return true;}return false;});});if(best)return best;
    if(topic==='ground'&&layers.depth.on&&data.depth&&data.depth.raster){var r=data.depth.raster,b=rasterBounds(r),col=Math.floor((wx-b[0])/(b[2]-b[0])*r.width),row=Math.floor((wy-b[1])/(b[3]-b[1])*r.height);if(col>=0&&col<r.width&&row>=0&&row<r.height){var ft=r.values[row*r.width+col];if(ft!=null&&ft!==r.nodata)return {id:'depth-'+row+'-'+col,layer:'depth',type:'bdepth',kind:'point',x:wx,y:wy,p:{},name:'About '+fmt.format(ft)+' ft to bedrock',facts:[['Modeled depth',ft+' ft'],['Model','MGS D-03, 2025'],['Display cell','About 400 ft across (120 m)'],['Meaning','Regional estimate, rounded to feet']],blurb:'This regional depth model estimates the thickness of Quaternary deposits above bedrock. It is resampled from the native 30-m model. Blank areas have no modeled depth in this export. A rounded value of zero does not establish exposed rock at a property. Utility depth, fill and groundwater level are separate.'};}}
    return null;
  }
  var lastHover=0,tooltipTimer=null;
  function hover(e){if(e.pointerType==='touch'||performance.now()-lastHover<90)return;lastHover=performance.now();var r=CANVAS.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,f=hitTest(px,py);hovered=f;TOOLTIP.hidden=!f;if(f){TOOLTIP.textContent=f.name;TOOLTIP.style.left=Math.min(W-180,Math.max(12,px+12))+'px';TOOLTIP.style.top=Math.max(54,py-34)+'px';}requestDraw();}
  var hashTimer=null,resultsTimer=null,requestedFeature=null,requestedPin=null,restoring=true;
  function writeHash(){if(restoring)return;var h='#map='+view.z.toFixed(2)+'/'+latOf(view.y).toFixed(5)+'/'+lonOf(view.x).toFixed(5)+(SAT.on?'/sat':'')+'&topic='+topic;h+='&layers='+activeIds().join(',');if(showInactive)h+='&inactive=1';if(selection)h+='&feature='+encodeURIComponent(selection.id)+'&pin='+latOf(selection.y).toFixed(7)+'/'+lonOf(selection.x).toFixed(7);try{history.replaceState(null,'',h);}catch(err){}}
  function noteMoved(){hovered=null;TOOLTIP.hidden=true;hqRefresh();clearTimeout(hashTimer);clearTimeout(resultsTimer);hashTimer=setTimeout(writeHash,350);resultsTimer=setTimeout(function(){ensureActive();activeIds().forEach(loadViewportTiles);loadStreets();updateLayers();updateLegend();renderResults();},160);}
  function clampView(){view.z=Math.max(MINZ,Math.min(MAXZ,view.z));view.x=Math.max(mx(-94.6),Math.min(mx(-92),view.x));view.y=Math.max(my(45.75),Math.min(my(44.2),view.y));}
  function zoomAt(px,py,dz){var s0=scale(),wx=view.x+(px-W/2)/s0,wy=view.y+(py-H/2)/s0;view.z+=dz;clampView();var s1=scale();view.x=wx-(px-W/2)/s1;view.y=wy-(py-H/2)/s1;clampView();noteMoved();requestDraw();}
  var flyRaf=null;
  function flyTo(x,y,z){
    if(flyRaf)cancelAnimationFrame(flyRaf);z=Math.max(MINZ,Math.min(MAXZ,z));
    if(reduced){view.x=x;view.y=y;view.z=z;clampView();noteMoved();requestDraw();return;}
    var from={x:view.x,y:view.y,z:view.z},start=performance.now();
    function frame(now){var t=Math.min(1,(now-start)/600),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;view.x=from.x+(x-from.x)*e;view.y=from.y+(y-from.y)*e;view.z=from.z+(z-from.z)*e;clampView();requestDraw();if(t<1)flyRaf=requestAnimationFrame(frame);else{flyRaf=null;noteMoved();}}
    flyRaf=requestAnimationFrame(frame);
  }
  function resize(){
    var left=HOST.parentElement.getBoundingClientRect().left;HOST.style.marginLeft=-left+'px';HOST.style.width=document.documentElement.clientWidth+'px';DPR=Math.min(devicePixelRatio||1,2);var r=STAGE.getBoundingClientRect();W=Math.round(r.width);H=Math.round(r.height);CANVAS.width=W*DPR;CANVAS.height=H*DPR;CANVAS.style.width=W+'px';CANVAS.style.height=H+'px';
    if(!fitted&&W){HOME.z=Math.max(MINZ,Math.min(11.3,Math.log2(W/((mx(-92.72)-mx(-93.72))*256))));if(!savedView)view.z=HOME.z;fitted=true;}requestDraw();if(started){activeIds().forEach(loadViewportTiles);loadStreets();renderResults();}
  }
  var interacting=false,pointers=new Map(),pinch=null,down=null;
  function setInteracting(on){interacting=!!on;STAGE.classList.toggle('is-interacting',interacting);var b=HOST.querySelector('[data-um-interact]');b.setAttribute('aria-pressed',String(interacting));b.textContent=interacting?'Stop map dragging':'Enable map dragging';pointers.clear();pinch=null;}
  CANVAS.addEventListener('pointerdown',function(e){if(flyRaf){cancelAnimationFrame(flyRaf);flyRaf=null;}down={x:e.clientX,y:e.clientY,t:Date.now(),moved:false};if(e.pointerType==='touch'&&!interacting&&!document.fullscreenElement)return;CANVAS.focus({preventScroll:true});try{CANVAS.setPointerCapture(e.pointerId);}catch(err){}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){var p=Array.from(pointers.values());pinch={d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),z:view.z};if(down)down.moved=true;}});
  CANVAS.addEventListener('pointermove',function(e){if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)down.moved=true;var prev=pointers.get(e.pointerId);if(!prev){hover(e);return;}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){view.x-=(e.clientX-prev.x)/scale();view.y-=(e.clientY-prev.y)/scale();clampView();noteMoved();requestDraw();}else if(pointers.size===2&&pinch){var p=Array.from(pointers.values()),d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),r=CANVAS.getBoundingClientRect();zoomAt((p[0].x+p[1].x)/2-r.left,(p[0].y+p[1].y)/2-r.top,pinch.z+Math.log2(Math.max(.05,d/pinch.d))-view.z);}});
  CANVAS.addEventListener('pointerup',function(e){pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(down&&!down.moved&&Date.now()-down.t<700){var r=CANVAS.getBoundingClientRect(),f=hitTest(e.clientX-r.left,e.clientY-r.top);if(f){lastSelected=f.id;lastFocusControl=CANVAS;openPanel(f,true);}}down=null;});
  CANVAS.addEventListener('pointercancel',function(e){pointers.delete(e.pointerId);pinch=null;down=null;});
  CANVAS.addEventListener('pointerleave',function(){hovered=null;TOOLTIP.hidden=true;requestDraw();});
  CANVAS.addEventListener('wheel',function(e){if(!e.ctrlKey&&!e.metaKey&&document.activeElement!==CANVAS&&!document.fullscreenElement)return;e.preventDefault();var r=CANVAS.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:1);zoomAt(e.clientX-r.left,e.clientY-r.top,Math.max(-.8,Math.min(.8,-delta*.0022)));},{passive:false});
  CANVAS.addEventListener('dblclick',function(e){var r=CANVAS.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,.8);});
  CANVAS.addEventListener('keydown',function(e){var step=80/scale();if(flyRaf&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','0','Enter',' '].indexOf(e.key)>=0){cancelAnimationFrame(flyRaf);flyRaf=null;noteMoved();}if(e.key==='Enter'||e.key===' '){e.preventDefault();var f=hitTest(W/2,H/2);if(f){lastSelected=f.id;lastFocusControl=CANVAS;openPanel(f,true);}else{STATUS.hidden=false;STATUS.textContent='No selectable record at the map center. Move the map, or choose a record from the list.';}return;}if(e.key==='ArrowLeft')view.x-=step;else if(e.key==='ArrowRight')view.x+=step;else if(e.key==='ArrowUp')view.y-=step;else if(e.key==='ArrowDown')view.y+=step;else if(e.key==='+'||e.key==='='){e.preventDefault();zoomAt(W/2,H/2,.6);return;}else if(e.key==='-'||e.key==='_'){e.preventDefault();zoomAt(W/2,H/2,-.6);return;}else if(e.key==='0'){view.x=HOME.x;view.y=HOME.y;view.z=HOME.z;}else return;e.preventDefault();clampView();noteMoved();requestDraw();});
  CANVAS.addEventListener('focus',requestDraw);CANVAS.addEventListener('blur',requestDraw);
  function setBase(sat){if(!sat&&data.contextStreets&&(data.contextStreets.error||data.contextStreets.tileError)){delete data.contextStreets;loadStreets();}if(sat&&SAT.failed){SAT.cache.forEach(function(t,k){if(t.dead)SAT.cache.delete(k);});SAT.failed=false;}SAT.on=!!sat;updateLayers();HOST.querySelectorAll('[data-um-base]').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.umBase==='sat')===SAT.on));});noteMoved();requestDraw();}
  document.querySelectorAll('[data-map-topic]').forEach(function(a){a.addEventListener('click',function(){setTopic(a.dataset.mapTopic,true);HOST.querySelector('[data-um-topic="'+a.dataset.mapTopic+'"]').focus({preventScroll:true});});});
  HOST.querySelectorAll('[data-um-topic]').forEach(function(b){b.addEventListener('click',function(){setTopic(b.dataset.umTopic,false);});});
  HOST.querySelectorAll('[data-um-scope]').forEach(function(b){b.addEventListener('click',function(){scope=b.dataset.umScope;visibleLimit=30;HOST.querySelectorAll('[data-um-scope]').forEach(function(c){c.setAttribute('aria-pressed',String(c===b));});renderResults();});});
  HOST.querySelectorAll('[data-um-base]').forEach(function(b){b.addEventListener('click',function(){setBase(b.dataset.umBase==='sat');});});
  HOST.querySelector('.um-photo-dialog [data-photo-close]').addEventListener('click',function(){HOST.querySelector('.um-photo-dialog').close();});
  HOST.querySelector('.um-photo-dialog').addEventListener('close',function(){var opener=PANEL.hidden?RESULTS.querySelector('[data-id="'+esc(lastSelected||'')+'"]')||SEARCH:PANEL.querySelector('.um-photo-open')||PANEL.querySelector('.um-pback');opener.focus({preventScroll:true});});
  HOST.querySelector('.um-photo-dialog').addEventListener('click',function(e){if(e.target===e.currentTarget)e.currentTarget.close();});
  function browseNearLocation(local){scope=local?'view':'all';visibleLimit=30;SEARCH.value='';HOST.querySelectorAll('[data-um-scope]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.umScope===scope));});renderResults();}
  HOST.addEventListener('understreet:locate',function(e){var p=e.detail;if(!p||!Number.isFinite(p.lon)||!Number.isFinite(p.lat)||p.lon<-94.05||p.lon>-92.52||p.lat<44.47||p.lat>45.42)return;closePanel(false);browseNearLocation(true);addressPin={x:mx(p.lon),y:my(p.lat)};flyTo(addressPin.x,addressPin.y,15.5);showMap();});
  var cityViews={metro:[-93.19,44.985,HOME.z],minneapolis:[-93.27,44.976,13.2],saintPaul:[-93.091,44.955,13.2],bloomington:[-93.304,44.837,13.2],eagan:[-93.17,44.817,13.2],maplewood:[-93.021,44.995,13.2],westSaintPaul:[-93.087,44.904,13.8]};
  HOST.querySelector('#um-city').addEventListener('change',function(e){var c=cityViews[e.target.value];if(c){addressPin=null;closePanel(false);browseNearLocation(e.target.value!=='metro');flyTo(mx(c[0]),my(c[1]),e.target.value==='metro'?HOME.z:c[2]);}});
  HOST.querySelector('.um-results-more').addEventListener('click',function(){visibleLimit+=30;renderResults();});
  HOST.querySelector('[data-um-inactive]').addEventListener('click',function(e){showInactive=!showInactive;e.currentTarget.setAttribute('aria-pressed',String(showInactive));if(selection&&!allowed(selection))closePanel(false);updateLegend();renderResults();requestDraw();writeHash();});
  HOST.querySelectorAll('[data-um-source-scope]').forEach(function(b){b.addEventListener('click',function(){sourceScope=b.dataset.umSourceScope;HOST.querySelectorAll('[data-um-source-scope]').forEach(function(c){c.setAttribute('aria-pressed',String(c===b));});renderSources();});});
  HOST.querySelector('.um-source-search input').addEventListener('input',renderSources);
  var searchTimer=null;SEARCH.addEventListener('input',function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){visibleLimit=30;renderResults();},140);});
  HOST.querySelector('[data-um-interact]').addEventListener('click',function(){setInteracting(!interacting);});
  HOST.querySelectorAll('[data-um-pan]').forEach(function(b){b.addEventListener('click',function(){var step=H*.35/scale(),d=b.dataset.umPan;if(d==='n')view.y-=step;if(d==='s')view.y+=step;if(d==='w')view.x-=step;if(d==='e')view.x+=step;clampView();noteMoved();requestDraw();});});
  HOST.querySelector('[data-um-zoom="in"]').addEventListener('click',function(){zoomAt(W/2,H/2,.6);});
  HOST.querySelector('[data-um-zoom="out"]').addEventListener('click',function(){zoomAt(W/2,H/2,-.6);});
  HOST.querySelector('[data-um-zoom="home"]').addEventListener('click',function(){flyTo(HOME.x,HOME.y,HOME.z);});
  var shell=HOST.querySelector('.um-shell'),full=HOST.querySelector('[data-um-zoom="full"]'),expanded=false,disclosureState=null,oldBodyOverflow='',outsideInert=[];
  function prepareExpanded(on){
    if(on&&!disclosureState){disclosureState=Array.from(shell.querySelectorAll('details')).map(function(d){var state={node:d,open:d.open};d.open=false;return state;});oldBodyOverflow=document.body.style.overflow;shell.scrollTop=0;}
    if(!on&&disclosureState){disclosureState.forEach(function(d){d.node.open=d.open;});disclosureState=null;}
    full.setAttribute('aria-label',on?'Close expanded map':'Expand map');setInteracting(on);resize();
  }
  full.addEventListener('click',async function(){
    if(expanded){toggleExpanded();return;}
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(shell.requestFullscreen){prepareExpanded(true);await shell.requestFullscreen();}else toggleExpanded();}catch(err){toggleExpanded();}
  });
  function toggleExpanded(){expanded=!expanded;if(expanded){var branch=shell;while(branch.parentElement&&branch.parentElement!==document.documentElement){Array.from(branch.parentElement.children).forEach(function(n){if(n===branch||n.tagName==='SCRIPT')return;outsideInert.push({node:n,inert:n.inert});n.inert=true;});branch=branch.parentElement;}}else{outsideInert.forEach(function(s){s.node.inert=s.inert;});outsideInert=[];}shell.classList.toggle('is-expanded',expanded);prepareExpanded(expanded);document.body.style.overflow=expanded?'hidden':oldBodyOverflow;full.focus({preventScroll:true});}
  document.addEventListener('fullscreenchange',function(){prepareExpanded(!!document.fullscreenElement);full.focus({preventScroll:true});});
  document.addEventListener('keydown',function(e){if(HOST.querySelector('.um-photo-dialog').open)return;if(expanded&&e.key==='Tab'){var nodes=Array.from(shell.querySelectorAll('button,a[href],input,select,summary,[tabindex="0"]')).filter(function(n){if(n.hidden||n.disabled||!n.getClientRects().length)return false;for(var a=n.parentElement;a&&a!==shell;a=a.parentElement){if(a.tagName==='DETAILS'&&!a.open){var summary=a.querySelector(':scope > summary');if(!summary||!summary.contains(n))return false;}}return true;}),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}if(e.key!=='Escape')return;if(expanded)toggleExpanded();else if(selection&&!document.fullscreenElement)closePanel(true);});
  HOST.querySelector('.um-source-link').addEventListener('click',function(){HOST.querySelector('.um-data').open=true;});
  function restoreFeature(){
    if(!requestedFeature)return;var all=topic==='tour'?tour:activeIds().reduce(function(a,id){return a.concat(data[id]&&data[id].features||[]);},[]),f=all.find(function(f){return f.id===requestedFeature;});
    if(!f&&requestedFeature.indexOf('depth-')===0&&data.depth&&data.depth.raster){var parts=requestedFeature.split('-'),r=data.depth.raster,row=+parts[1],col=+parts[2];if(row>=0&&row<r.height&&col>=0&&col<r.width){var ft=r.values[row*r.width+col],b=rasterBounds(r);if(ft!=null)f={id:requestedFeature,layer:'depth',kind:'point',type:'bdepth',x:b[0]+(col+.5)/r.width*(b[2]-b[0]),y:b[1]+(row+.5)/r.height*(b[3]-b[1]),p:{},name:'About '+fmt.format(ft)+' ft to bedrock',facts:[['Modeled depth',ft+' ft'],['Model','MGS D-03, 2025'],['Display cell','About 400 ft across (120 m)'],['Meaning','Regional estimate, rounded to feet']],blurb:'This regional depth model estimates the thickness of Quaternary deposits above bedrock. It is resampled from the native 30-m model. Blank areas have no modeled depth in this export. A rounded value of zero does not establish exposed rock at a property. Utility depth, fill and groundwater level are separate.'};}}
    if(f){if(!allowed(f)){showInactive=true;var inactive=HOST.querySelector('[data-um-inactive]');inactive.setAttribute('aria-pressed','true');updateLegend();}requestedFeature=null;restoring=false;lastSelected=f.id;openPanel(f,false);(matchMedia('(max-width: 960px)').matches?PANEL:HOST).scrollIntoView({block:'start',behavior:'instant'});PANEL.querySelector('.um-pback').focus({preventScroll:true});}
  }
  function loadManifest(){
    if(catalogLoading)return;catalogLoading=true;catalogError=false;
    HOST.querySelector('.um-datasets').innerHTML='<p class="um-empty">Loading the dataset catalog…</p>';
    fetchJSON('datasets.json').then(function(m){manifest=m;catalog.applyManifest(m);ensureActive();renderSources();if(selection)openPanel(selection,false);}).catch(function(){catalogError=true;HOST.querySelector('.um-datasets').innerHTML='<p class="um-error">The dataset catalog could not load. The article sources are below.</p><button type="button" data-catalog-retry>Retry dataset catalog</button>';HOST.querySelector('[data-catalog-retry]').addEventListener('click',loadManifest);}).finally(function(){catalogLoading=false;updateLayers();});
  }
  function start(){
    if(started)return;started=true;STATUS.textContent='Loading the map…';
    Promise.allSettled(['counties','water','roads-context'].map(function(file){return fetchJSON(file+'.json').then(function(gj){var id={counties:'contextCounties',water:'contextWater','roads-context':'contextRoads'}[file];data[id]=ingest(gj,id);requestDraw();});})).then(function(){updateLayers();});
    fetchJSON('media.json').then(function(m){media=m;renderResults();if(selection)openPanel(selection,false);}).catch(function(){});
    loadManifest();
    loadStreets();ensureActive().then(function(){restoreFeature();if(!requestedFeature)restoring=false;updateLayers();requestDraw();});setTimeout(function finishRestore(){if(!restoring)return;var pending=catalogLoading||activeIds().filter(shouldLoad).some(function(id){var d=data[id];return !d||d.loading||d.pending;});if(pending){setTimeout(finishRestore,1000);return;}restoring=false;requestedFeature=null;writeHash();},15000);renderResults();
  }
  var hash=location.hash,m=hash.match(/map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(\/sat)?/),params=new URLSearchParams(hash.replace(/^#/,''));
  if(m&&isFinite(+m[1])&&isFinite(+m[2])&&isFinite(+m[3])&&Math.abs(+m[2])<=85&&Math.abs(+m[3])<=180){view.z=+m[1];view.y=my(+m[2]);view.x=mx(+m[3]);clampView();savedView=true;SAT.on=!!m[4];}
  requestedFeature=params.get('feature');var pinValue=(params.get('pin')||'').match(/^(-?[\d.]+)\/(-?[\d.]+)$/);if(pinValue&&isFinite(+pinValue[1])&&isFinite(+pinValue[2])&&Math.abs(+pinValue[1])<=85&&Math.abs(+pinValue[2])<=180)requestedPin={lat:+pinValue[1],lon:+pinValue[2]};var initial=params.get('topic');if(topics[initial])topic=initial;showInactive=params.get('inactive')==='1';
  if(params.has('layers')){var enabled=params.get('layers').split(',');topics[topic].layers.forEach(function(id){layers[id].on=enabled.indexOf(id)>=0;});}
  if(requestedFeature){var selectedLayer=Object.keys(layers).find(function(id){return requestedFeature.indexOf(id+'-')===0;});if(selectedLayer){layers[selectedLayer].on=true;if(topics[topic].layers.indexOf(selectedLayer)<0)topic=Object.keys(topics).find(function(t){return topics[t].layers.indexOf(selectedLayer)>=0;})||topic;}}
  setTopic(topic,false);HOST.querySelectorAll('[data-um-base]').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.umBase==='sat')===SAT.on));});
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(entries){if(entries.some(function(e){return e.isIntersecting;})){start();io.disconnect();}},{rootMargin:'500px'});io.observe(HOST);}else start();
  window.addEventListener('resize',resize);if('ResizeObserver' in window)new ResizeObserver(resize).observe(STAGE);resize();if(savedView||requestedFeature){HOST.scrollIntoView({block:'start',behavior:'instant'});start();}
})();
