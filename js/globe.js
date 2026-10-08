/* Earth Now. Astronomy and data parsing have independent numeric tests.
   See docs/DAYLIGHT_GLOBE.md for sources, bounds and the browser harness. */
(function () {
  'use strict';
  var container = document.getElementById('globe-container');
  if (!container) return;
  var THREE = window.THREE, math = window.GlobeMath, data = window.GlobeData, stars = window.GlobeStars, optics = window.GlobeOptics, timeline=window.GlobeTimeline, clouds=window.GlobeClouds, shared=window.GlobeArchive, replay=window.GlobeReplay, aurora=window.GlobeAurora;
  var byId = function (id) { return document.getElementById(id); };
  var wrapper = document.querySelector('.globe-wrapper');
  var cloudDescription = '', clock = byId('globe-clock'), dataLine = byId('globe-data');
  var explore = byId('globe-explore');
  var hourInput = byId('globe-hour'), returnButton = byId('globe-return');
  var pinPanel = byId('globe-pin'), summary = byId('globe-summary');
  var DEG = Math.PI / 180, DAY = 86400000;
  // Progress counts completed work, including decoded clouds. It is not a
  // fabricated download percentage; failures settle into labeled fallbacks.
  var loading = true, loadingStarted=performance.now(), loadingJobsStarted = false, loaded = {}, loadWeights = {base:1,night:1,moon:1,stars:1,clouds:5,aurora:1,history:1,replay:3};
  var cloudFailure = '', starCatalog = null, starField = null, starDate = NaN;
  var loadingLabel = byId('globe-loading-label'), loadingProgress = byId('globe-loading-progress');
  var loadingDetail = byId('globe-loading-detail'), loadingElapsed = byId('globe-loading-elapsed');
  var loadingTimer = null, loadingLastValue = 0, loadingLastChange = loadingStarted;
  function settleLoad(kind) {
    loaded[kind]=true;
    updateLoadingProgress();
  }
  function updateLoadingProgress(){
    if(!loading)return;
    var now=performance.now(),ready=replayClouds?replayClouds.filter(cloudPrepared).length:0;
    var value=Object.keys(loaded).reduce(function(total,key){return total+loadWeights[key];},0);
    if(!loaded.replay&&replayClouds&&replayClouds.length)value+=loadWeights.replay*ready/replayClouds.length;
    if(value!==loadingLastValue){loadingLastValue=value;loadingLastChange=now;}
    loadingProgress.value=value;
    loadingProgress.setAttribute('aria-valuetext',Math.round(value/14*100)+'% of preparation complete');
    var label=!loaded.base||!loaded.night||!loaded.moon?'Loading Earth and Moon':!loaded.stars?'Loading stars':!loaded.clouds?'Loading satellite clouds':!loaded.aurora?'Checking aurora forecast':!loaded.history?'Checking weather history':!loaded.replay?'Preparing 12-hour replay':'Rendering the view';
    text(loadingLabel,label);
    text(loadingDetail,!loaded.replay&&replayClouds&&replayClouds.length?ready+' / '+replayClouds.length+' cloud frames':now-loadingLastChange>=8000?'Still working on this step':'');
    text(loadingElapsed,Math.floor((now-loadingStarted)/1000)+'s');
  }
  function stopLoadingFeedback(){
    clearInterval(loadingTimer);loadingTimer=null;
    container.querySelector('.globe-loading-activity').hidden=true;
  }
  function finishLoading() {
    if(!loading||fetchingPhoto||replayBusy||Object.keys(loadWeights).some(function(key){return !loaded[key];})||photo&&photoMix<1)return;
    stopLoadingFeedback();loading=false;explore.querySelectorAll('input,button').forEach(function(control){control.disabled=false;});returnButton.disabled=false;container.classList.remove('is-loading');container.classList.add('is-ready');container.setAttribute('aria-busy','false');warmDayTimeline();
  }
  var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var dateFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',timeZone:'UTC'});
  var clockFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  var timeFormatter = new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit'});
  var zoneFormatter=new Intl.DateTimeFormat(undefined,{timeZoneName:'short'});
  var forecastFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  var solarFormatter = new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit',timeZone:'UTC'});
  var solarDateFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'});
  var live = true, instant = new Date(), tilt = undefined, pin = null;
  var recentMode=true,recentEnd=timeline.recentBounds(instant).end,sharedManifest=null,sharedChecked=0;
  var photo = null, forecast = null, liveForecast = null, kp = null, fetchingPhoto = false, fetchingWeather = false;
  var cloudCatalog=null,cloudCatalogChecked=0,cloudController=null,timeEditTimer=null;
  var detailController=null,detailKey='',detailChecked=0;
  var cloudMemo=null,installedCloud=null,cloudPending=new Map(),archivePending=new Map();
  var compressedClouds=null,preparedClouds=new Set(),decodingReplay=false,startupReplay=null;
  var interactionUntil=0,deferredCloud=null,detailPreparing=null;
  var scrubFrame=null,scrubUntil=0,replayMemo=null,replayPending=new Map(),replayPreparing=null,replayTextures=new Map(),replayTarget=null,replayBlendStarted=0,replayFadeStarted=0,replayBakeIndex=0;
  var replayController=null,replayKey='',replayBusy=false,replayChecked=0,replayClouds=[],replayAurora=[],replayFailed=new Set(),sessionFrames=[];
  var replayPendingCloud=false,replayPendingAurora=false;
  var archiveFrames=[],archiveChecked=0,archiveBusy=false,archiveController=null,archiveGeneration=0,archiveCache=new Map();
  var archiveBase='https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/assets/data/aurora/';
  var baseState = 'loading', nightState = 'loading';
  var requestedDay = '', photoChecked = 0, weatherChecked = 0, photoGeneration = 0;
  var photoMix = 0, lastLabels = 0, lastFrame = 0, frameRequest = null, inView = true;
  var autoSpin = true, targetTheta = 0, targetPhi = 1.1, targetRadius = 4;
  var theta = 0, phi = 1.1, radius = 4;
  var sunFraming = true, aimShift = 0;
  var locationStatus=byId('globe-location-status');
  var locationKey='daylight-globe-location',homeLocation=null,viewGeneration=0,locationGeneration=0;
  var auroraStyle = 'curtain';
  var css = getComputedStyle(document.documentElement);
  function cssColor(name) { return new THREE.Color(css.getPropertyValue(name).trim()); }
  function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
  text(byId('globe-version'),'v44');
  function formatDay(day) { var date=new Date(day+'T12:00:00Z');return dateFormatter.format(date)+(date.getUTCFullYear()===new Date().getUTCFullYear()?'':', '+date.getUTCFullYear())+' (UTC)'; }
  function completedDay(now) { return new Date(Math.floor(now.getTime() / DAY) * DAY - DAY).toISOString().slice(0,10); }
  function expireLivePhoto() {
    if(!live||!photo)return;
    var age=Date.now()-new Date(photo.time||photo.date+'T00:00:00Z');
    var invalid=photo.time?age < -5*60000||age > 5*3600000:photo.date>completedDay(new Date())||age>=5*DAY;
    if(invalid){photo=null;photoMix=0;wrapper.dataset.photo='unavailable';}
  }
  function hasForecast() {
    return !!(tilt===undefined&&forecast&&(live?data.auroraFreshness(forecast,new Date()).fresh:instant<=Date.now()+300000&&forecast.historical&&forecast.observation<=instant));
  }
  function coordinate(lat, lon) { return Math.abs(lat).toFixed(1) + '\u00b0' + (lat < 0 ? 'S' : 'N') + ', ' + Math.abs(lon).toFixed(1) + '\u00b0' + (lon < 0 ? 'W' : 'E'); }
  function solarDate(date, lon) { return new Date(date.getTime() + (lon * 4 + math.solar(date,tilt).equationOfTime) * 60000); }
  function announce() {
    var message = cloudDescription + ' ' + clock.textContent + '. ' + dataLine.textContent;
    if (pin) message += ' Pinned at ' + coordinate(pin.lat, pin.lon) + '. ' + pinPanel.innerText;
    text(summary, message);
  }
  function syncInputs() {
    if(live)recentEnd=timeline.recentBounds(instant).end;
    hourInput.value = Math.max(0,Math.min(720,720-Math.round((recentEnd-instant)/60000)));
    text(byId('globe-hour-label'),timeFormatter.format(instant)+' '+zoneFormatter.formatToParts(instant).find(function(part){return part.type==='timeZoneName';}).value);
    hourInput.setAttribute('aria-valuetext',timeFormatter.format(instant) + ' in ' + zone);
  }
  text(byId('globe-time-basis'), 'Time in ' + zone.replace(/_/g,' ') + ', with daylight saving handled automatically.');
  function updateLabels() {
    var hypothetical=tilt!==undefined,fresh=hasForecast();
    var shot=photo&&(photo.time?new Date(photo.time):new Date(photo.date+'T12:00:00Z'));
    var sameDay=shot&&shot.toDateString()===instant.toDateString();
    var shortShot=shot?(photo.time?(sameDay?timeFormatter.format(shot):forecastFormatter.format(shot)):dateFormatter.format(shot)):'';
    cloudDescription=hypothetical?'Reference map':photo?'Clouds '+shortShot+(photo.time?(photo.natural?'':' (infrared)'):' (daily)'):fetchingPhoto||replayPendingCloud?'Loading clouds':'Clouds unavailable';
    text(clock,new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(instant));
    clock.dateTime=instant.toISOString();clock.title=clockFormatter.format(instant);
    var parts=[photo?(photo.time?'Satellite clouds '+forecastFormatter.format(shot):'Daily satellite photo '+formatDay(photo.date)):'Satellite clouds unavailable.'];
    if(photo&&photo.sourceTimes){var observations=photo.sourceTimes.filter(Boolean).map(Date.parse),first=Math.min.apply(null,observations),last=Math.max.apply(null,observations);if(first!==last)parts.push('Observed '+forecastFormatter.format(new Date(first))+' to '+timeFormatter.format(new Date(last)));}
    if(fresh){parts.push((live?'Aurora forecast ':'Archived aurora forecast ')+forecastFormatter.format(forecast.forecast));parts.push('measurements from '+forecastFormatter.format(forecast.observation));}
    else parts.push(hypothetical?'Aurora hidden for hypothetical tilt.':!live?'No saved aurora forecast near this time.':fetchingWeather&&!weatherChecked?'Checking aurora forecast.':'Aurora forecast unavailable.');
    var kpAge=kp?new Date()-kp.time:Infinity;
    if(live&&kpAge>=-5*60000&&kpAge<9*3600000)parts.push('Magnetic activity: Kp '+kp.kp.toFixed(2)+' at '+forecastFormatter.format(kp.time));
    if(wrapper.dataset.stars==='unavailable')parts.push('Star catalog unavailable.');
    if(baseState==='unavailable')parts.push('Reference map unavailable.');else if(baseState==='loading')parts.push('Loading reference map.');
    if(nightState==='unavailable')parts.push('City-light map unavailable.');
    if(photo&&!photo.time&&cloudFailure)parts.push('Daily fallback after '+cloudFailure+'.');
    text(dataLine,parts.join(' / '));
    returnButton.setAttribute('aria-pressed',String(live));returnButton.title=live?'Following the current time':'Return to the current time';
    wrapper.dataset.mode=live?'live':'explore';
    updateReplayLabel();
    if(live)syncInputs();
    updatePin();
  }
  var pinDayKey = '', pinDaylight = null;
  function updatePin() {
    pinPanel.hidden = !pin;
    if (!pin) return;
    text(byId('globe-pin-title'), coordinate(pin.lat,pin.lon));
    var local = solarDate(instant,pin.lon);
    text(byId('globe-pin-clock'), solarDateFormatter.format(local));
    var key = local.toISOString().slice(0,10) + '/' + pin.lat + '/' + pin.lon + '/' + tilt;
    if (key !== pinDayKey) { pinDayKey = key; pinDaylight = math.daylight(instant,pin.lat,pin.lon,tilt); }
    var daylight = pinDaylight;
    var totalMinutes = Math.round(daylight.hours * 60);
    text(byId('globe-pin-daylight'), daylight.polar === 'day' ? '24 hours, polar day' : daylight.polar === 'night' ? '0 hours, polar night' : Math.floor(totalMinutes / 60) + 'h ' + String(totalMinutes % 60).padStart(2,'0') + 'm');
    var events = daylight.polar === 'day' ? 'Sun stays up' : daylight.polar === 'night' ? 'Sun stays down' :
      (daylight.sunrise ? solarFormatter.format(solarDate(daylight.sunrise,pin.lon)) : 'No sunrise') + ' / ' + (daylight.sunset ? solarFormatter.format(solarDate(daylight.sunset,pin.lon)) : 'No sunset');
    text(byId('globe-pin-events'), events);
    var aurora = 'Forecast unavailable';
    if (tilt !== undefined) aurora = 'Hidden for hypothetical tilt';
    else if (hasForecast()) {
      var probability = data.auroraAt(forecast,pin.lat,pin.lon);
      var elevation = math.solarElevation(instant,pin.lat,pin.lon);
      aurora = Math.round(probability) + '% modeled overhead'+(live?'':' (archived)');
      aurora += elevation >= 0 ? '. Daylight hides it.' : elevation >= -12 ? '. Twilight may hide it.' : '. Dark sky; clouds can hide it.';
      if (probability < 5 && elevation < -6) {
        var nearby = data.auroraVisibility(forecast,pin.lat,pin.lon,elevation);
        if (nearby.nearestOvalMiles !== null) aurora += ' Modeled oval within ' + Math.round(nearby.nearestOvalMiles/10)*10 + ' miles.';
      }
    }
    text(byId('globe-pin-aurora'), aurora);
  }
  function interacting(){interactionUntil=performance.now()+350;}
  function editTime() {
    interacting();
    var minutes = Number(hourInput.value);
    var chosen = new Date(+recentEnd-(720-minutes)*60000);
    if (!Number.isFinite(chosen.getTime())) return;
    instant = chosen; live = false; syncInputs();
    scheduleTimeData();
  }
  function scheduleTimeData() {
    clearTimeout(timeEditTimer);
    if(cloudController)cloudController.abort();
    if(detailController){detailController.abort();detailController=null;}
    if(archiveController)archiveController.abort();
    photoGeneration++;archiveGeneration++;fetchingPhoto=false;archiveBusy=false;requestedDay='';
    scrubUntil=performance.now()+350;
    if(scrubFrame===null)scrubFrame=requestAnimationFrame(function(){scrubFrame=null;applyCachedTime();updateAstronomy();updateLabels();announce();});
    timeEditTimer=setTimeout(function(){timeEditTimer=null;refreshData();},350);
  }
  hourInput.addEventListener('input',editTime);
  returnButton.addEventListener('click',function () {
    if(scrubFrame!==null){cancelAnimationFrame(scrubFrame);scrubFrame=null;}scrubUntil=0;
    clearTimeout(timeEditTimer);timeEditTimer=null;if(cloudController)cloudController.abort();if(detailController){detailController.abort();detailController=null;}if(archiveController)archiveController.abort();
    photoGeneration++;archiveGeneration++;fetchingPhoto=false;archiveBusy=false;requestedDay='';
    live = true; instant = new Date();recentMode=true;recentEnd=timeline.recentBounds(instant).end; tilt = undefined; pinDayKey = '';expireLivePhoto();if(liveForecast)setForecast(liveForecast);else forecast=null;
    applyCachedTime();updateAstronomy(); updateLabels(); announce(); refreshData();
  });
  byId('globe-pin-close').addEventListener('click',function () { setPin(null); container.focus({preventScroll:true}); });
  function unavailable(message) {
    stopLoadingFeedback();
    cloudDescription=message; text(dataLine,'You can still follow the source links below.');
    text(loadingLabel,'Interactive globe unavailable');
    text(loadingDetail,message);loadingElapsed.hidden=true;
    explore.querySelectorAll('input,button').forEach(function(control){control.disabled=true;});returnButton.disabled=true;container.setAttribute('aria-busy','false');loadingProgress.hidden=true;
    byId('globe-fullscreen').hidden = true; byId('globe-fullscreen').disabled = true;
    container.removeAttribute('tabindex');container.setAttribute('aria-label','Earth globe unavailable');
    container.removeAttribute('aria-describedby');container.querySelector('.globe-info').remove();
    text(byId('globe-keyboard'),'The interactive globe is unavailable. Source links are below.');
    text(summary,message+' '+dataLine.textContent);
  }
  if (!THREE || !math || !data || !stars || !optics || !timeline || !clouds || !replay || !aurora) {
    unavailable('The interactive globe could not load.'); return;
  }
  var renderer;
  try {
    var renderCanvas=document.createElement('canvas'), contextOptions={antialias:true,alpha:false};
    var context=renderCanvas.getContext('webgl2',contextOptions)||renderCanvas.getContext('webgl',contextOptions)||renderCanvas.getContext('experimental-webgl',contextOptions);
    if(!context){unavailable('The interactive globe needs WebGL.');return;}
    renderer = new THREE.WebGLRenderer({canvas:renderCanvas,context:context,antialias:true,alpha:false});
  }
  catch (error) {
    unavailable('The interactive globe needs WebGL.'); return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setClearColor(0x000000);
  renderer.domElement.setAttribute('aria-hidden','true'); container.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(58,1,.1,200);
  var mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  var textureWidth = Math.min(mobile ? 2048 : 4096,renderer.capabilities.maxTextureSize);
  textureWidth = Math.pow(2,Math.floor(Math.log2(textureWidth)));
  var cloudWidth=Math.min(textureWidth,2048);
  compressedClouds=timeline.memoryCache((mobile?48:96)*1024*1024,{prefer:function(next,old){return next.width>=old.width;}});
  cloudMemo=timeline.memoryCache((mobile?32:80)*1024*1024,{
    prefer:function(next,old){return next.photo.width>=old.photo.width&&(!old.photo.natural||next.photo.natural);},
    dispose:function(record){record.memoized=false;if(record!==installedCloud)record.canvases.forEach(function(canvas){canvas.width=canvas.height=1;});}
  });
  var replayWidth=Math.min(textureWidth,mobile?(renderer.capabilities.isWebGL2?1024:512):(renderer.capabilities.isWebGL2?1536:1024));
  replayMemo=timeline.memoryCache((mobile?104:224)*1024*1024,{dispose:function(record){var texture=replayTextures.get(record.photo.time);if(texture&&record!==replayTarget){texture.dispose();replayTextures.delete(record.photo.time);}}});
  replayPreparing=replay.preparer(new URL('js/globe-replay.js?v=20261008-44',document.baseURI).href);
  detailPreparing=replay.preparer(new URL('js/globe-replay.js?v=20261008-44',document.baseURI).href);
  var sunUniform = {value:new THREE.Vector3(1,0,0)};
  var moonSunUniform = {value:new THREE.Vector3(1,0,0)}, lunarState = null, moonDisplayDistance = 5.5;
  function solidTexture(r,g,b) {
    var tex = new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1,THREE.RGBAFormat); tex.needsUpdate = true; return tex;
  }
  var baseTexture = solidTexture(60,90,87), nightTexture = solidTexture(1,2,1), satelliteTexture = solidTexture(60,90,87), infraredTexture=solidTexture(0,0,0), moonTexture = solidTexture(130,128,117);
  var photoSunUniform={value:new THREE.Vector3(1,0,0)};
  var replayUniforms={replayFrom:{value:infraredTexture},replayTo:{value:infraredTexture},replayFromBaked:{value:0},replayBlend:{value:1},replayEnabled:{value:0}};
  // Infrared gives every region the same cloud brightness day and night.
  // Visible coverage borders must not introduce a second cloud terminator.
  var replayLayer='vec2 replayLayer(vec4 c,float baked){float coverage=c.b*c.a+c.r*c.g*(1.0-c.a);return mix(vec2(coverage),c.rg,baked);}';
  var vertex = 'varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld; void main(){ vUv=uv; vNormal=normalize((modelMatrix*vec4(normal,0.0)).xyz); vWorld=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  var earthMaterial = new THREE.ShaderMaterial({uniforms:Object.assign({},replayUniforms,{baseMap:{value:baseTexture},nightMap:{value:nightTexture},photoMap:{value:satelliteTexture},infraredMap:{value:infraredTexture},sunDir:sunUniform,photoSunDir:photoSunUniform,photoMix:{value:0},photoEnabled:{value:0},thermalEnabled:{value:0},naturalEnabled:{value:0},denseEnabled:{value:0}}),vertexShader:vertex,fragmentShader:[
    'uniform sampler2D baseMap, nightMap, photoMap,infraredMap; uniform vec3 sunDir,photoSunDir; uniform float photoMix,photoEnabled,thermalEnabled,naturalEnabled,denseEnabled; varying vec2 vUv; varying vec3 vNormal;',
    'uniform sampler2D replayFrom,replayTo; uniform float replayFromBaked,replayBlend,replayEnabled;',replayLayer,
    'void main(){ vec3 base=texture2D(baseMap,vUv).rgb; vec4 photo=texture2D(photoMap,vUv); vec4 infrared=texture2D(infraredMap,vUv);',
    // Natural RGB puts near infrared in red: ice clouds and snow become cyan.
    // Neutralize that bright cyan only, retaining observed structure and land.
    'float cyan=min(photo.g,photo.b)-photo.r; float ice=smoothstep(.04,.16,cyan)*smoothstep(.18,.36,min(photo.g,photo.b))*(1.0-smoothstep(.12,.32,abs(photo.g-photo.b)));',
    'photo.rgb=mix(photo.rgb,vec3(max(photo.g,photo.b)),ice*thermalEnabled*naturalEnabled);',
    // Capture observed brightness before mixing in the reference terrain.
    // Otherwise bright reference land could become an invented night cloud.
    'float visibleCloud=smoothstep(.22,.85,min(photo.r,min(photo.g,photo.b)))*photo.a;',
    // One reference surface avoids regional RGB and monochrome products
    // switching the colour of land and oceans at their coverage borders.
    'vec3 cloudColour=mix(base,vec3(1.0),smoothstep(.22,.85,min(photo.r,min(photo.g,photo.b))));',
    'float mono=1.0-smoothstep(.005,.025,max(photo.r,max(photo.g,photo.b))-min(photo.r,min(photo.g,photo.b)));',
    'photo.rgb=mix(photo.rgb,cloudColour,thermalEnabled*mix(mono,1.0,denseEnabled));',
    'float shotDay=smoothstep(.10,.25,dot(normalize(vNormal),photoSunDir))*naturalEnabled*photo.a;',
    // Thermal brightness includes ground temperature. Display cold features as
    // white over reference terrain, not a grayscale replacement for Earth's
    // entire surface. This is a display curve, not measured cloud opacity.
    'vec4 thermal=vec4(mix(base,vec3(1.0),smoothstep(.35,.90,infrared.r)),infrared.a);',
    // Keep the cold-cloud range instead of clipping every bright storm core
    // to the same white. Replay packs the identical observed brightness curve.
    'float thermalCloud=smoothstep(.35,.90,infrared.r)*infrared.a; float denseCloud=smoothstep(.28,1.0,infrared.r)*infrared.a+visibleCloud*naturalEnabled*(1.0-infrared.a);',
    'vec4 shot=mix(photo,mix(thermal,photo,shotDay),thermalEnabled); vec3 liveColor=mix(base,shot.rgb,shot.a); vec3 day=mix(base,liveColor,photoMix*photoEnabled);',
    'day=mix(day,mix(base,vec3(1.0),denseCloud*photoMix*photoEnabled),denseEnabled*thermalEnabled);',
    'vec2 replayCover=vec2(0.0);if(replayEnabled>0.0){replayCover=mix(replayLayer(texture2D(replayFrom,vUv),replayFromBaked),replayLayer(texture2D(replayTo,vUv),0.0),replayBlend);} day=mix(day,mix(base,vec3(1.0),replayCover.x*photoMix*photoEnabled),replayEnabled);',
    'float light=dot(normalize(vNormal),sunDir); float daylight=smoothstep(-.10,.04,light);',
    'float surfaceLight=.52+.52*max(0.0,light); vec3 night=texture2D(nightMap,vUv).rgb*1.35+base*.018;',
    // Use the same observed cloud structure on both hemispheres.
    // Night clouds dim the historical lights without completely hiding them.
    'float cloudCover=mix(visibleCloud,mix(thermalCloud,visibleCloud,shotDay),thermalEnabled)*photoMix*photoEnabled;',
    'cloudCover=mix(cloudCover,denseCloud*photoMix*photoEnabled,denseEnabled*thermalEnabled);',
    'cloudCover=mix(cloudCover,replayCover.y*photoMix*photoEnabled,replayEnabled);',
    // Keep observed cloud whites bright until the same day/night fade as the
    // surface. A second cosine dimming made them darken ahead of that edge.
    'vec3 litDay=day*surfaceLight+vec3(1.0-surfaceLight)*cloudCover;',
    'night=night*(1.0-cloudCover*.65)+vec3(.085,.10,.115)*cloudCover;',
    'gl_FragColor=vec4(mix(night,litDay,daylight),1.0); }'
  ].join('\n')});
  var replayBakeScene=new THREE.Scene(),replayBakeCamera=new THREE.Camera();
  var replayBakeMaterial=new THREE.ShaderMaterial({uniforms:replayUniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:'varying vec2 vUv;uniform sampler2D replayFrom,replayTo;uniform float replayFromBaked,replayBlend;'+replayLayer+'void main(){vec2 cover=mix(replayLayer(texture2D(replayFrom,vUv),replayFromBaked),replayLayer(texture2D(replayTo,vUv),0.0),replayBlend);gl_FragColor=vec4(cover,0.0,1.0);}'});
  replayBakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),replayBakeMaterial));
  var replayBakes=[0,1].map(function(){var target=new THREE.WebGLRenderTarget(replayWidth,replayWidth/2,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});target.texture.wrapS=THREE.RepeatWrapping;return target;});
  var earth = new THREE.Mesh(new THREE.SphereGeometry(1,128,96),earthMaterial); scene.add(earth);
  var moonMaterial = new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{moonMap:{value:moonTexture},sunDir:moonSunUniform},vertexShader:vertex,fragmentShader:'uniform sampler2D moonMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormal; void main(){ float light=max(0.0,dot(normalize(vNormal),sunDir)); gl_FragColor=vec4(texture2D(moonMap,vUv).rgb*(.025+light*.98),1.0); }'});
  var moon = new THREE.Mesh(new THREE.SphereGeometry(.273,64,48),moonMaterial); scene.add(moon);
  var atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.015,128,64),new THREE.ShaderMaterial({uniforms:{sunDir:sunUniform},vertexShader:vertex,fragmentShader:'uniform vec3 sunDir; varying vec3 vNormal,vWorld; void main(){ vec3 eye=normalize(cameraPosition-vWorld); float rim=pow(1.0-abs(dot(normalize(vNormal),eye)),3.5); float day=smoothstep(-.25,.3,dot(normalize(vNormal),sunDir)); gl_FragColor=vec4(.28,.46,.59,rim*(.08+.3*day)); }',transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending})); scene.add(atmosphere);
  // Catalog directions are centered on the camera to keep distant stars at
  // infinity. Magnitude controls integrated point brightness and point size.
  var starGeometry=new THREE.BufferGeometry();
  var starMaterial=new THREE.ShaderMaterial({
    uniforms:{pixelRatio:{value:renderer.getPixelRatio()},sunDir:sunUniform,solarFlux:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'attribute float magnitude; attribute vec3 starColor; uniform float pixelRatio,solarFlux; uniform vec3 sunDir; varying vec3 vColor; varying float vBrightness; void main(){vColor=starColor;float flux=pow(10.,-.4*(magnitude-1.));float size=clamp(2.+pow(flux,.3),2.,7.);vBrightness=clamp(.8*pow(flux,.25),.10,.95);float glare=smoothstep(.99756,.99996,dot(normalize(position),sunDir));vBrightness*=1.-glare*.9*solarFlux;gl_PointSize=size*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vColor; varying float vBrightness; void main(){float r=length(gl_PointCoord-.5)*2.;float core=exp(-r*r*5.);gl_FragColor=vec4(vColor,vBrightness*core);}'
  });
  starField=new THREE.Points(starGeometry,starMaterial);starField.frustumCulled=false;starField.visible=false;scene.add(starField);
  // The true solar direction is effectively at infinity. Display distance is
  // compressed, but a camera-centered Sun avoids false orbital parallax.
  var solarRadius=75*Math.sin(.535*DEG/2);
  var sunBody=new THREE.Mesh(new THREE.SphereGeometry(solarRadius,48,32),new THREE.ShaderMaterial({
    vertexShader:vertex,fragmentShader:'varying vec3 vNormal,vWorld; void main(){float mu=max(0.,dot(normalize(vNormal),normalize(cameraPosition-vWorld)));float limb=.4+.6*mu;gl_FragColor=vec4(vec3(1.,.96,.87)*limb,1.);}'
  }));scene.add(sunBody);
  var sunGlow=new THREE.Sprite(new THREE.ShaderMaterial({
    uniforms:{flux:{value:1}},transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);center.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*center;}',
    fragmentShader:'uniform float flux; varying vec2 vUv; void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float halo=.55*exp(-r*7.)+.45*exp(-r*r*70.);float angle=atan(p.y,p.x);float rays=pow(abs(cos(angle*4.)),48.)*.10*exp(-r*4.)*smoothstep(.06,.14,r);float fade=1.-smoothstep(.75,1.,r);gl_FragColor=vec4(vec3(1.,.88,.64),(halo+rays)*fade*pow(flux,.65));}'
  }));sunGlow.scale.set(11,11,1);sunGlow.renderOrder=20;scene.add(sunGlow);
  var sunView={visibleFraction:1,fluxFraction:1},sunProjected=new THREE.Vector3(),cameraAim=new THREE.Vector3();
  var pinMarker = new THREE.Mesh(new THREE.RingGeometry(.014,.021,24),new THREE.MeshBasicMaterial({color:cssColor('--accent-hover'),side:THREE.DoubleSide}));
  pinMarker.visible=false; scene.add(pinMarker);
  var auroraTexture = solidTexture(0,0,0), auroraMeshes = [];
  var auroraScaffold = aurora.scaffold();
  function buildAurora() {
    // Thin double-sided curtains have real depth, rise above the limb and are
    // occluded by Earth. Their geographic footpoints sample the untouched grid.
    auroraScaffold.forEach(function(group){
      var geometry=new THREE.BufferGeometry();
      ['position','foot','pattern','uv'].forEach(function(name){geometry.setAttribute(name,new THREE.BufferAttribute(group[name],name==='position'||name==='foot'?3:2));});
      geometry.setIndex(new THREE.BufferAttribute(group.indices,1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);geometry.computeBoundingSphere();
      var material=new THREE.ShaderMaterial({
        uniforms:{auroraMap:{value:auroraTexture},sunDir:sunUniform,tick:{value:0},strength:{value:1.5}},
        vertexShader:[
          'attribute vec3 foot; attribute vec2 pattern; uniform float tick; varying vec3 vFoot; varying vec2 vPattern,vUv;',
          'void main(){vFoot=foot;vPattern=pattern;vUv=uv;vec3 lifted=position+normalize(position-foot)*uv.y*uv.y*.0012*sin(pattern.x*13.0+pattern.y+tick*.22);gl_Position=projectionMatrix*modelViewMatrix*vec4(lifted,1.0);}'
        ].join('\n'),
        fragmentShader:[
          'uniform sampler2D auroraMap; uniform vec3 sunDir; uniform float tick,strength; varying vec3 vFoot; varying vec2 vPattern,vUv;',
          'void main(){vec3 n=normalize(vFoot);float lon=atan(-n.z,n.x);vec2 gridUv=vec2((lon/6.2831853*360.0+181.5)/362.0,(asin(clamp(n.y,-1.0,1.0))/3.14159265*180.0+90.5)/181.0);',
          'float p=texture2D(auroraMap,gridUv).r;float night=1.0-smoothstep(-.20,-.035,dot(n,sunDir));float probability=p*smoothstep(.10,.22,p);if(probability*night<.0001)discard;',
          'float h=vUv.y,angle=vPattern.x,phase=vPattern.y;float folds=sin(angle*9.0+phase+tick*.13)*.6+sin(angle*23.0-phase)*.25;',
          'float ray=angle*311.0+folds*3.0;float fine=.5+.5*sin(ray);fine=mix(fine,.5,smoothstep(.7,2.5,fwidth(ray)));float threads=.30+.70*pow(fine,2.0);',
          'float bands=.70+.30*sin(angle*61.0+phase+tick*.27);float tips=.58+.24*sin(angle*17.0+phase)+.12*sin(angle*43.0-phase);float fade=1.0-smoothstep(tips-.15,min(1.0,tips+.24),h);',
          'float lower=smoothstep(0.0,.10,h);float green=exp(-pow((h-.23)/.30,2.0));float red=exp(-pow((h-.67)/.26,2.0))*.22;float violet=exp(-pow((h-.075)/.055,2.0))*.13;',
          'vec3 emission=vec3(.12,.95,.38)*green+vec3(.65,.075,.12)*red+vec3(.38,.12,.58)*violet;',
          'float glow=probability*night*strength*lower*fade*threads*bands;gl_FragColor=vec4(emission,glow);}'
        ].join('\n'),extensions:{derivatives:true},side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      var mesh=new THREE.Mesh(geometry,material);mesh.visible=false;scene.add(mesh);auroraMeshes.push(mesh);
    });
  }
  buildAurora();
  function configureTexture(texture) {
    var image=texture.image,powerOfTwo=image&&image.width&&(image.width&(image.width-1))===0&&(image.height&(image.height-1))===0;
    texture.wrapS=THREE.RepeatWrapping;texture.minFilter=powerOfTwo?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=!!powerOfTwo;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;return texture;
  }
  async function decodeBlob(blob,width,signal) {
    var bitmap;
    try {
      if(signal&&signal.aborted){var before=new Error('Image decode aborted');before.name='AbortError';throw before;}
      bitmap = await createImageBitmap(blob);
      if(signal&&signal.aborted){var after=new Error('Image decode aborted');after.name='AbortError';throw after;}
      var canvas=document.createElement('canvas');
      var ratio=Math.min(1,width/bitmap.width,textureWidth/bitmap.height);
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
    } finally {if(bitmap) bitmap.close();}
  }
  function astronomyAsset(path) {
    // file:// pages cannot fetch their neighbouring files in Chrome. The
    // published copies explicitly allow CORS, including a local-file origin.
    return location.protocol==='file:'?'https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/'+path:path;
  }
  async function loadLocal(path,kind) {
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000);
    try {
      var response=await fetch(astronomyAsset(path),{signal:controller.signal});if(!response.ok)throw new Error('Reference texture unavailable');
      var canvas=await decodeBlob(await response.blob(),textureWidth),texture=configureTexture(new THREE.CanvasTexture(canvas));
      if(kind==='base'){baseTexture.dispose();baseTexture=texture;earthMaterial.uniforms.baseMap.value=texture;baseState='ready';}
      else if(kind==='night'){nightTexture.dispose();nightTexture=texture;earthMaterial.uniforms.nightMap.value=texture;nightState='ready';}
      else{moonTexture.dispose();moonTexture=texture;moonMaterial.uniforms.moonMap.value=texture;}
    }catch(error){if(kind==='base')baseState='unavailable';if(kind==='night')nightState='unavailable';}
    finally{clearTimeout(timer);settleLoad(kind);updateLabels();announce();}
  }
  async function loadStars() {
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000);
    try{
      starCatalog=await stars.load(astronomyAsset('assets/data/stars-hyg-v41.bin'),{signal:controller.signal});
      starGeometry.setAttribute('position',new THREE.BufferAttribute(stars.worldPositions(starCatalog,instant,120),3));starDate=+instant;
      starGeometry.setAttribute('magnitude',new THREE.BufferAttribute(starCatalog.magnitudes,1));
      // Tone-map measured colors for a display without tinting every star gold.
      var colors=new Float32Array(starCatalog.colors.length);
      for(var i=0;i<colors.length;i+=3){var peak=Math.max(starCatalog.colors[i],starCatalog.colors[i+1],starCatalog.colors[i+2]);for(var j=0;j<3;j++)colors[i+j]=Math.pow(starCatalog.colors[i+j]/peak,1/2.2);}
      starGeometry.setAttribute('starColor',new THREE.BufferAttribute(colors,3));starField.visible=true;wrapper.dataset.stars='ready';
    }catch(error){starField.visible=false;wrapper.dataset.stars='unavailable';}
    finally{clearTimeout(timer);settleLoad('stars');}
  }
  explore.querySelectorAll('input,button').forEach(function(control){control.disabled=true;});returnButton.disabled=true;
  updateLoadingProgress();loadingTimer=setInterval(updateLoadingProgress,1000);
  loadLocal('assets/images/earth.jpg','base');loadLocal('assets/images/earth-night-2016.jpg','night');loadLocal('assets/images/moon.jpg','moon');loadStars();
  function nearestOrbitAngle(angle,current) {
    return current+Math.atan2(Math.sin(angle-current),Math.cos(angle-current));
  }
  function frameSun() {
    viewGeneration++;
    var sun=math.solar(instant,tilt),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(sun.vector.x,sun.vector.y,sun.vector.z);
    // Rotate the observer 145 degrees from the Sun, perpendicular to north.
    // The resulting 35-degree separation fits a dusk Earth and the real Sun.
    var axis=up.clone().addScaledVector(direction,-up.dot(direction)).normalize();
    var observer=direction.clone().applyAxisAngle(axis,145*DEG);
    targetTheta=nearestOrbitAngle(Math.atan2(observer.x,observer.z),theta);targetPhi=nearestOrbitAngle(Math.acos(observer.y),phi);targetRadius=4;sunFraming=true;autoSpin=false;
  }
  function validLocation(point) {
    return point&&Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lon)&&Math.abs(point.lon)<=180;
  }
  function centerLocation(point,immediate) {
    var desired=Math.PI/2+point.lon*DEG;
    targetTheta=nearestOrbitAngle(desired,theta);
    targetPhi=nearestOrbitAngle(Math.PI/2-point.lat*DEG,phi);targetRadius=4;
    sunFraming=false;autoSpin=false;
    if(immediate){theta=targetTheta;phi=targetPhi;radius=targetRadius;aimShift=0;}
  }
  function locationMessage(message,state) {
    wrapper.dataset.location=state;locationStatus.hidden=!message;text(locationStatus,message);
  }
  function requestLocation() {
    var generation=++locationGeneration,view=viewGeneration,timer;
    function failed(error) {
      if(generation!==locationGeneration)return;clearTimeout(timer);
      if(error&&error.code===1){homeLocation=null;try{localStorage.removeItem(locationKey);}catch(ignore){} }
      locationMessage(error&&error.code===1?'Allow location to start here.':'Location unavailable.',error&&error.code===1?'blocked':'unavailable');
    }
    if(!navigator.geolocation){failed();return;}
    locationMessage('', 'loading');
    // Permission may remain pending longer than the device-position timeout.
    // It never holds the Earth or replay loading screen open.
    timer=setTimeout(function(){if(generation===locationGeneration)locationMessage('Allow location to start here.','pending');},9000);
    try{navigator.geolocation.getCurrentPosition(function(position){
      if(generation!==locationGeneration)return;clearTimeout(timer);
      var point={lat:position.coords.latitude,lon:position.coords.longitude};
      if(!validLocation(point)){failed();return;}
      homeLocation=point;
      // Only a rounded camera position is remembered on this device. No
      // coordinates are included in the global weather or astronomy requests.
      try{localStorage.setItem(locationKey,JSON.stringify({lat:Math.round(point.lat*10)/10,lon:Math.round(point.lon*10)/10,savedAt:Date.now()}));}catch(ignore){}
      locationMessage('','ready');
      if(view===viewGeneration)centerLocation(point,loading);
    },failed,{enableHighAccuracy:false,maximumAge:300000,timeout:8000});}catch(error){failed(error);}
  }
  // Start over land while permission is pending. A previously granted position
  // appears immediately and is refreshed on every visit, including after travel.
  centerLocation({lat:20,lon:0},true);
  try{
    var savedLocation=JSON.parse(localStorage.getItem(locationKey));
    if(validLocation(savedLocation)&&Number.isFinite(savedLocation.savedAt)&&Date.now()-savedLocation.savedAt>=0&&Date.now()-savedLocation.savedAt<30*DAY){homeLocation=savedLocation;centerLocation(homeLocation,true);}
  }catch(ignore){}
  requestLocation();
  function updateAstronomy() {
    expireLivePhoto();
    var sun=math.solar(instant,tilt);sunUniform.value.set(sun.vector.x,sun.vector.y,sun.vector.z);
    lunarState=math.moon(instant);moonDisplayDistance=5.5*lunarState.distance/60.2666;
    moon.position.set(lunarState.vector.x,lunarState.vector.y,lunarState.vector.z).multiplyScalar(moonDisplayDistance);moon.lookAt(0,0,0);moon.visible=tilt!==45;
    earthMaterial.uniforms.photoEnabled.value=tilt===undefined&&photo?1:0;
    var current=hasForecast();
    auroraMeshes.forEach(function (mesh) {mesh.visible=!!current;});
    wrapper.dataset.aurora=current?'ready':'hidden';
  }
  function setPin(point) {
    pin=point;pinDayKey='';pinMarker.visible=!!pin;
    if(pin){var vector=math.geographicVector(pin.lat,pin.lon);pinMarker.position.set(vector.x,vector.y,vector.z).multiplyScalar(1.004);pinMarker.lookAt(0,0,0);}
    updateLabels();announce();
  }
  var raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
  function hitAt(x,y) {
    var rect=renderer.domElement.getBoundingClientRect();ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);
    var hits=raycaster.intersectObject(earth);if(!hits.length)return null;
    var p=hits[0].point;return {lat:Math.asin(Math.max(-1,Math.min(1,p.y)))/DEG,lon:Math.atan2(-p.z,p.x)/DEG};
  }
  var pointers=new Map(), dragTotal=0, pinchDistance=0, gesturePin=null;
  renderer.domElement.addEventListener('pointerdown',function (event) {
    interacting();event.preventDefault();container.focus({preventScroll:true});viewGeneration++;autoSpin=false;dragTotal=pointers.size?999:0;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
    gesturePin=hitAt(event.clientX,event.clientY);pinchDistance=0;
  });
  renderer.domElement.addEventListener('pointermove',function (event) {
    var previous=pointers.get(event.pointerId);
    if(!previous)return;
    interacting();
    var dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>1){var list=Array.from(pointers.values());var distance=Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y);sunFraming=false;if(pinchDistance)targetRadius=Math.max(1.5,Math.min(10,targetRadius+(pinchDistance-distance)*.012));pinchDistance=distance;dragTotal=999;return;}
    dragTotal+=Math.abs(dx)+Math.abs(dy);if(dragTotal>7)sunFraming=false;
    var factor=2*Math.max(radius-1,.1)*Math.tan(camera.fov*DEG/2)/renderer.domElement.clientHeight;
    targetTheta-=dx*factor*(Math.sin(phi)<0?-1:1);targetPhi-=dy*factor;
  });
  function endPointer(event) {
    if(!pointers.has(event.pointerId))return;
    if(event.type==='pointerup'&&pointers.size===1&&dragTotal<7&&gesturePin)setPin(gesturePin);
    pointers.delete(event.pointerId);pinchDistance=0;
  }
  renderer.domElement.addEventListener('pointerup',endPointer);renderer.domElement.addEventListener('pointercancel',endPointer);renderer.domElement.addEventListener('lostpointercapture',function (event) {pointers.delete(event.pointerId);});
  window.addEventListener('blur',function () {pointers.clear();pinchDistance=0;});
  renderer.domElement.addEventListener('wheel',function (event) {interacting();event.preventDefault();viewGeneration++;autoSpin=false;sunFraming=false;targetRadius=Math.max(1.5,Math.min(10,targetRadius+event.deltaY*.002));},{passive:false});
  container.addEventListener('keydown',function (event) {
    if(event.target!==container)return;
    if(event.key==='Escape'&&wrapper.classList.contains('is-fullscreen'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Enter','Escape'].indexOf(event.key)<0)return;
    interacting();event.preventDefault();viewGeneration++;autoSpin=false;if(event.key!=='Enter'&&event.key!=='Escape')sunFraming=false;
    var horizontalDirection=Math.sin(phi)<0?-1:1;
    if(event.key==='ArrowLeft')targetTheta-=.14*horizontalDirection;if(event.key==='ArrowRight')targetTheta+=.14*horizontalDirection;
    if(event.key==='ArrowUp')targetPhi-=.14;if(event.key==='ArrowDown')targetPhi+=.14;
    if(event.key==='+'||event.key==='=')targetRadius=Math.max(1.5,targetRadius-.25);if(event.key==='-')targetRadius=Math.min(10,targetRadius+.25);
    if(event.key==='Enter'){var rect=renderer.domElement.getBoundingClientRect();setPin(hitAt(rect.left+rect.width/2,rect.top+rect.height/2));}
    if(event.key==='Escape')setPin(null);
  });
  function resize() {
    var w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    camera.aspect=w/h;
    // Keep the Earth/Sun composition in a 58-degree horizontal field.
    // Retain a vertical floor so wide fullscreen views fit Earth's limbs.
    camera.fov=Math.max(42,2*Math.atan(Math.tan(29*DEG)/camera.aspect)/DEG);
    camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  }
  new ResizeObserver(resize).observe(container);resize();
  function frame(time) {
    frameRequest=null;if(!renderingVisible())return;
    if(deferredCloud&&time>=interactionUntil&&time>=scrubUntil&&!pointers.size){var pending=deferredCloud;deferredCloud=null;installCloudRecord(pending.record,pending.generation,pending.signal,pending.upgrade);}
    var dt=Math.min(.1,lastFrame?(time-lastFrame)/1000:1/60);lastFrame=time;
    if(live)instant=new Date();
    if(autoSpin)targetTheta-=dt*.022;
    var ease=1-Math.exp(-dt*10);theta+=(targetTheta-theta)*ease;phi+=(targetPhi-phi)*ease;radius+=(targetRadius-radius)*ease;
    camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));
    // Carry the tangent up vector through both poles instead of asking lookAt
    // to use world north, which becomes singular there and flips the view.
    camera.up.set(-Math.cos(phi)*Math.sin(theta),Math.sin(phi),-Math.cos(phi)*Math.cos(theta));
    if(time-lastLabels>1000)updateAstronomy();
    var earthDirection=camera.position.clone().negate().normalize();
    var separation=optics.angleBetween(earthDirection,sunUniform.value);
    var desiredShift=sunFraming&&separation<80*DEG?optics.frameEarthSun(radius,1,separation,.535*DEG/2,4*DEG).aimShift:0;
    aimShift+=(desiredShift-aimShift)*ease;
    var aimDirection=earthDirection.clone();
    if(aimShift&&separation>1e-8){var axis=new THREE.Vector3().crossVectors(earthDirection,sunUniform.value).normalize();aimDirection.applyAxisAngle(axis,aimShift);}
    cameraAim.copy(camera.position).addScaledVector(aimDirection,radius);camera.lookAt(cameraAim);
    sunBody.position.copy(camera.position).addScaledVector(sunUniform.value,75);sunGlow.position.copy(sunBody.position);
    starField.position.copy(camera.position);
    if(starCatalog&&(!Number.isFinite(starDate)||Math.abs(+instant-starDate)>1000)){var attribute=starGeometry.getAttribute('position');stars.worldPositions(starCatalog,instant,120,attribute.array);attribute.needsUpdate=true;starDate=+instant;}
    var occluders=[{center:earth.position,radius:1,name:'Earth'}];if(moon.visible)occluders.push({center:moon.position,radius:.273,name:'Moon'});
    sunView=optics.sunVisibility(camera.position,{center:sunBody.position,radius:solarRadius},occluders,{limbDarkening:.6});
    // A near-plane slice through the compressed Moon must not reveal a
    // fully occulted photosphere. Partial silhouettes still use GPU depth.
    sunBody.visible=sunView.visibleFraction>0;
    sunProjected.copy(sunBody.position).project(camera);
    sunGlow.visible=sunUniform.value.dot(aimDirection)>0&&Math.abs(sunProjected.x)<1.25&&Math.abs(sunProjected.y)<1.25&&sunView.fluxFraction>0;
    sunGlow.material.uniforms.flux.value=sunView.fluxFraction;starMaterial.uniforms.solarFlux.value=sunView.fluxFraction;
    if(time-lastLabels>1000){updateAstronomy();updateLabels();lastLabels=time;}
    // Distance compression changes the viewing angle. Transport the actual
    // solar light into the display frame so the Moon retains its physical phase.
    if(lunarState){var moonLight=math.moonDisplayLight(lunarState,camera.position,moonDisplayDistance);moonSunUniform.value.set(moonLight.x,moonLight.y,moonLight.z);}
    photoMix=Math.min(1,photoMix+dt*.7);earthMaterial.uniforms.photoMix.value=photo?photoMix:0;
    auroraMeshes.forEach(function (mesh) {mesh.material.uniforms.tick.value=time/1000;});
    advanceReplay(time);renderer.render(scene,camera);finishLoading();frameRequest=requestAnimationFrame(frame);
    upgradePhotoDetail();
  }
  function renderingVisible() {return !document.hidden&&(inView||wrapper.classList.contains('is-fullscreen'));}
  function resume() {if(renderingVisible()&&frameRequest===null){lastFrame=0;frameRequest=requestAnimationFrame(frame);}}
  function syncViewportVisibility() {
    var rect=container.getBoundingClientRect();inView=rect.bottom>=-100&&rect.top<=innerHeight+100&&rect.right>=-100&&rect.left<=innerWidth+100;
    if(!renderingVisible()&&frameRequest!==null){cancelAnimationFrame(frameRequest);frameRequest=null;}
    resume();
  }
  document.addEventListener('visibilitychange',function () {if(document.hidden&&frameRequest!==null){cancelAnimationFrame(frameRequest);frameRequest=null;}else{updateAstronomy();updateLabels();resume();refreshData();}});
  new IntersectionObserver(function (entries) {inView=entries[0].isIntersecting;if(!renderingVisible()&&frameRequest!==null){cancelAnimationFrame(frameRequest);frameRequest=null;}resume();},{rootMargin:'100px'}).observe(container);
  var fullscreenButton=byId('globe-fullscreen'), savedOverflow='', inertElements=[];
  function isolateFullscreen(on) {
    if(!on){inertElements.forEach(function(item){item.element.inert=item.previous;});inertElements=[];return;}
    var branch=wrapper;
    while(branch.parentElement){
      Array.from(branch.parentElement.children).forEach(function(sibling){if(sibling!==branch){inertElements.push({element:sibling,previous:sibling.inert});sibling.inert=true;}});
      branch=branch.parentElement;
      if(branch===document.body)break;
    }
  }
  function exitFullscreen() {
    wrapper.classList.remove('is-fullscreen');document.body.style.overflow=savedOverflow;isolateFullscreen(false);
    fullscreenButton.setAttribute('aria-label','Enter fullscreen');
    if(document.fullscreenElement)document.exitFullscreen().catch(function(){});
    requestAnimationFrame(resize);syncViewportVisibility();fullscreenButton.focus({preventScroll:true});
  }
  fullscreenButton.addEventListener('click',function () {
    if(wrapper.classList.contains('is-fullscreen')){exitFullscreen();return;}
    savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';wrapper.classList.add('is-fullscreen');isolateFullscreen(true);fullscreenButton.setAttribute('aria-label','Exit fullscreen');
    if(wrapper.requestFullscreen)wrapper.requestFullscreen().catch(function(){});requestAnimationFrame(resize);syncViewportVisibility();
  });
  document.addEventListener('fullscreenchange',function () {if(!document.fullscreenElement&&wrapper.classList.contains('is-fullscreen')){wrapper.classList.remove('is-fullscreen');document.body.style.overflow=savedOverflow;isolateFullscreen(false);fullscreenButton.setAttribute('aria-label','Enter fullscreen');requestAnimationFrame(resize);syncViewportVisibility();fullscreenButton.focus({preventScroll:true});}});
  document.addEventListener('keydown',function (event) {
    if(!wrapper.classList.contains('is-fullscreen'))return;
    if(event.key==='Escape'){event.preventDefault();exitFullscreen();return;}
    if(event.key==='Tab'){
      var candidates=Array.from(wrapper.querySelectorAll('button,input,summary,a[href],[tabindex="0"]')).filter(function(element){return !element.disabled&&element.getClientRects().length>0;});
      var first=candidates[0],last=candidates[candidates.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function refreshDailyPhoto(generation,signal) {
    var offline=navigator.onLine===false,target=live?completedDay(new Date()):data.utcDate(instant);
    try {
      for(var back=0;back<(loading?1:live?4:1);back++){
        var day=new Date(new Date(target+'T00:00:00Z').getTime()-back*DAY).toISOString().slice(0,10);
        try {
          var dailyWidth=loading?Math.min(textureWidth,1024):textureWidth;
          var result=await data.fetchPhotoDay(day,dailyWidth,{timeout:loading?5000:10000,cacheOnly:offline,signal:signal});
          var canvases=await Promise.all(result.blobs.map(function(blob){return decodeBlob(blob,textureWidth);}));
          var primary=canvases[0],ctx=primary.getContext('2d'),pixels=ctx.getImageData(0,0,primary.width,primary.height);
          var secondary=canvases[1]&&canvases[1].getContext('2d').getImageData(0,0,primary.width,primary.height);
          var composite=data.compositeRGBA(secondary ? [pixels.data,secondary.data] : [pixels.data]);
          if(composite.coverage<.15){await data.discardPhotoDay(day,dailyWidth);canvases.forEach(function(canvas){canvas.width=canvas.height=1;});continue;}
          pixels.data.set(data.featherCoverage(composite.pixels,primary.width));ctx.putImageData(pixels,0,0);
          if(generation!==photoGeneration){canvases.forEach(function(canvas){canvas.width=canvas.height=1;});return;}
          var texture=configureTexture(new THREE.CanvasTexture(primary));satelliteTexture.dispose();satelliteTexture=texture;earthMaterial.uniforms.photoMap.value=texture;
          earthMaterial.uniforms.thermalEnabled.value=0;
          installedCloud=null;replayUniforms.replayEnabled.value=0;replayTarget=null;photo={date:day,coverage:composite.coverage,width:primary.width};photoMix=loading?0:1;wrapper.dataset.photo='ready';
          canvases.slice(1).forEach(function(canvas){canvas.width=canvas.height=1;});updateLabels();announce();break;
        } catch(error) {
          if(error.name==='AbortError')return;
          // A PNG header can be valid while its compressed pixels are damaged.
          // Evict that day's responses so a later visit can recover.
          await data.discardPhotoDay(day,dailyWidth||textureWidth);
        }
      }
    } catch(_){}
  }
  async function refreshPhoto() {
    if(tilt!==undefined)return;
    var key=String(Math.floor(instant.getTime()/(hourlyClouds()?clouds.STEP:3600000))),offline=navigator.onLine===false;
    if(requestedDay===key&&(fetchingPhoto||Date.now()-photoChecked<5*60000))return;
    if(cloudController)cloudController.abort();
    if(detailController){detailController.abort();detailController=null;}
    cloudController=new AbortController();var signal=cloudController.signal,generation=++photoGeneration;
    fetchingPhoto=true;requestedDay=key;var deadline=setTimeout(function(){cloudController&&generation===photoGeneration&&cloudController.abort();},loading?24000:20000);
    try {
      if(instant-Date.now()>5*60000){photo=null;return;}
      if(!sharedManifest)try{sharedManifest=shared.validate(JSON.parse(localStorage.getItem('globe-shared-clouds')));}catch(_){}
      if(!offline&&Date.now()-sharedChecked>5*60000){
        try{sharedManifest=await shared.fetchManifest({timeout:3500,signal:signal});try{localStorage.setItem('globe-shared-clouds',JSON.stringify(sharedManifest));}catch(_){} }catch(error){if(error.name==='AbortError')return;}sharedChecked=Date.now();
      }
      if(sharedManifest&&sharedManifest.catalog.end<=Date.now()+300000&&sharedManifest.catalog.end>=Date.now()-5*3600000&&(!cloudCatalog||sharedManifest.catalog.end>=cloudCatalog.end))cloudCatalog=sharedManifest.catalog;
      if(!cloudCatalog){try{var stored=JSON.parse(localStorage.getItem('globe-cloud-catalog'));if(stored)cloudCatalog=stored.dense?clouds.validate(stored):{start:new Date(stored.start),end:new Date(stored.end)};}catch(_){}}
      if(!offline&&(!cloudCatalog||Date.now()-cloudCatalogChecked>5*60000)){
        try{
          var currentCatalogs=await Promise.allSettled([
            clouds.fetchCatalog({timeout:6000,signal:signal}),
            data.fetchJSON('https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/assets/data/globe-hourly-catalog.json?v='+Math.floor(Date.now()/60000),{timeout:3500,signal:signal,allowText:true}).then(clouds.validate)
          ]),validCatalogs=currentCatalogs.filter(function(r){return r.status==='fulfilled';}).map(function(r){return r.value;});
          if(signal.aborted){var abort=new Error('Cloud check cancelled');abort.name='AbortError';throw abort;}
          if(!validCatalogs.length)throw new Error('Current satellite metadata unavailable');
          validCatalogs.forEach(function(current){if(!cloudCatalog||!cloudCatalog.dense||current.end>=cloudCatalog.end)cloudCatalog=current;});
          cloudCatalogChecked=Date.now();try{localStorage.setItem('globe-cloud-catalog',JSON.stringify(cloudCatalog));}catch(_){}
        }catch(error){
          if(error.name==='AbortError')return;
          try{
            var snapshots=await Promise.allSettled([
              data.fetchJSON('https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/assets/data/globe-hourly-catalog.json?v='+Math.floor(Date.now()/300000),{timeout:2000,signal:signal,allowText:true}).then(clouds.validate),
              data.fetchJSON('assets/data/globe-hourly-catalog.json',{timeout:1000,signal:signal}).then(clouds.validate),
              data.fetchJSON('https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/assets/data/globe-cloud-catalog.json?v='+Math.floor(Date.now()/300000),{timeout:2000,signal:signal,allowText:true}).then(data.parseCloudSnapshot),
              data.fetchJSON('assets/data/globe-cloud-catalog.json',{timeout:1000,signal:signal}).then(data.parseCloudSnapshot)
            ]);
            snapshots.forEach(function(result){if(result.status==='fulfilled'&&+result.value.end<=Date.now()+300000&&(!cloudCatalog||result.value.dense&&!cloudCatalog.dense||result.value.dense===cloudCatalog.dense&&result.value.end>cloudCatalog.end))cloudCatalog=result.value;});
            if(cloudCatalog){cloudCatalogChecked=Date.now();try{localStorage.setItem('globe-cloud-catalog',JSON.stringify(cloudCatalog));}catch(_){}}
          }catch(_){}
        }
      }
      if(!cloudCatalog)cloudCatalog=await data.fetchCloudCatalog({timeout:2000,signal:signal});
      if(cloudCatalog.dense&&instant<cloudCatalog.start&&!cloudCatalog.legacy)try{cloudCatalog.legacy=await data.fetchCloudCatalog({timeout:2000,signal:signal});}catch(_){}
      var stamp=cloudStamp();
      if(!stamp||live&&new Date()-stamp>5*3600000)throw new Error('Dated cloud imagery unavailable');
      if(loading&&!startupReplay&&hourlyClouds())startupReplay=warmDayTimeline(true);
      if(photo&&photo.time===stamp.toISOString()&&!replayUniforms.replayEnabled.value)return;
      var cached=cloudMemo.get(stamp.toISOString());
      if(cached){installCloudRecord(cached,generation,signal,false);return;}
      if(hourlyClouds()){var dense=await requestCloudRecord(stamp,cloudWidth,signal,14000,offline);installCloudRecord(dense,generation,signal,false);return;}
      // A slow large image must not hold up a usable dated view. The smaller
      // request starts after four seconds, or immediately if the larger fails.
      var lowStart,lowTimer,lowStarted=false,lowReject;
      var preview=new Promise(function(resolve,reject){lowReject=reject;lowStart=function(){
        if(lowStarted)return;lowStarted=true;
        requestCloudRecord(stamp,Math.min(1024,cloudWidth),signal,8000,offline).then(resolve,reject);
      };});
      var high=requestCloudRecord(stamp,cloudWidth,signal,14000,offline);
      high.catch(lowStart);lowTimer=setTimeout(lowStart,4000);
      var record;
      try{record=await timeline.waitFor(Promise.any([high,preview]),signal);}
      finally{clearTimeout(lowTimer);if(!lowStarted){var cancelled=new Error('Preview unnecessary');cancelled.name='AbortError';lowReject(cancelled);}}
      installCloudRecord(record,generation,signal,false);
      if(record.photo.width<cloudWidth){
        var promotion=cloudController;detailController=promotion;
        high.then(function(sharper){installCloudRecord(sharper,generation,signal,true);}).catch(function(){}).finally(function(){if(detailController===promotion)detailController=null;});
      }
    }catch(error){
      if(error.name!=='AbortError'&&generation===photoGeneration){cloudFailure=error.message||'primary imagery unavailable';var retained=cloudStamp();if(!(replayUniforms.replayEnabled.value&&photo&&retained&&photo.time===retained.toISOString()))await refreshDailyPhoto(generation,signal);}
    }finally{
      clearTimeout(deadline);
      if(generation===photoGeneration){
        // Holding the last frame avoids a blank layer while decoding. Once a
        // request settles, failed selections must still become a real gap.
        var selected=cloudStamp();
        if(photo&&photo.time&&(!selected||photo.time!==selected.toISOString()))photo=null;
        fetchingPhoto=false;replayPendingCloud=false;photoChecked=Date.now();updateAstronomy();updateLabels();announce();
      }
    }
  }
  async function decodeCloudRecord(result,stamp,signal) {
    if(result.shared)return decodeSharedCloudRecord(result,stamp,signal);
    if(result.dense)return decodeDenseCloudRecord(result,stamp,signal);
    try{return await preparedCloudRecord({width:result.width,natural:!!result.natural,blobs:[result.natural||result.infrared,result.infrared]},stamp,signal);}
    catch(error){if(error.name!=='AbortError')await data.discardCloudFrame(stamp,result.width);throw error;}
  }
  function hourlyClouds(){return !!(cloudCatalog&&cloudCatalog.dense&&instant>=cloudCatalog.start);}
  function cloudStamp(){if(!cloudCatalog)return null;return hourlyClouds()?(recentMode?shared.frameAt(sharedManifest,cloudCatalog,instant,new Date()):clouds.frameAt(cloudCatalog,instant,new Date())):data.cloudFrameAt(cloudCatalog.dense?cloudCatalog.legacy:cloudCatalog,instant,new Date());}
  async function requestCloudBytes(stamp,width,signal,timeout,offline,force){
    if(!cloudCatalog.dense||stamp<cloudCatalog.start)return data.fetchCloudFrame(stamp,width,{timeout:timeout,signal:signal,cacheOnly:offline});
    var key=stamp.toISOString()+'/'+width,cached=compressedClouds.get(key);if(cached&&(!force||cached.shared||cached.blobs.slice(0,5).every(Boolean)))return cached;
    var pendingKey='bytes/'+key;
    if(cloudPending.has(pendingKey)&&cloudPending.get(pendingKey).signal.aborted)cloudPending.delete(pendingKey);
    if(!cloudPending.has(pendingKey)){
      var task={signal:signal};task.promise=(async function(){try{
        var result=null;
        if(sharedManifest&&width===sharedManifest.width&&sharedManifest.frames.some(function(f){return +f.time===+stamp;}))try{result=await shared.fetchFrame(sharedManifest,stamp,{timeout:Math.min(timeout,8000),signal:signal,cacheOnly:offline});}catch(error){if(error.name==='AbortError')throw error;}
        if(!result)result=await clouds.fetchFrame(stamp,width,{timeout:timeout,signal:signal,cacheOnly:offline,catalog:cloudCatalog});
        var bytes=result.blobs.reduce(function(total,b){return total+(b?b.size:0);},0);
        compressedClouds.put(key,result,bytes);preparedClouds.add(key);return result;
      }finally{if(cloudPending.get(pendingKey)===task)cloudPending.delete(pendingKey);}})();cloudPending.set(pendingKey,task);
    }
    return timeline.waitFor(cloudPending.get(pendingKey).promise,signal);
  }
  async function preparedCloudRecord(result,stamp,signal){
    var outputs=[],memoized=false,prepared;
    try{
      var natural=result.natural===undefined?result.blobs.slice(0,5).some(Boolean):result.natural;
      prepared=await detailPreparing.prepareFull(result.blobs,result.width,natural,!!result.shared,100,stamp.toISOString()+'/'+result.width);
      if(signal.aborted){var aborted=new Error('Cloud decode aborted');aborted.name='AbortError';throw aborted;}
      for(var i=0;i<2;i++){
        var image=prepared.images[i],canvas;
        if(image.getContext)canvas=image;
        else{canvas=document.createElement('canvas');canvas.width=result.width;canvas.height=result.width/2;canvas.getContext('2d').drawImage(image,0,0);image.close();}
        outputs.push(canvas);prepared.images[i]=null;
      }
      var record={photo:{date:data.utcDate(stamp),time:stamp.toISOString(),sourceTimes:result.sourceTimes,width:result.width,coverage:prepared.coverage,source:result.dense||result.shared?'NASA / EUMETSAT':'EUMETSAT',natural:natural,dense:!!(result.dense||result.shared),shared:!!result.shared},canvases:outputs,natural:outputs[0],infrared:outputs[1],memoized:true};
      memoized=true;return cloudMemo.put(stamp.toISOString(),record,result.width*result.width*4);
    }finally{
      if(prepared)prepared.images.forEach(function(image){if(!image)return;if(image.close)image.close();else image.width=image.height=1;});
      if(!memoized)outputs.forEach(function(canvas){canvas.width=canvas.height=1;});
    }
  }
  function decodeSharedCloudRecord(result,stamp,signal){return preparedCloudRecord(result,stamp,signal);}
  async function decodeDenseCloudRecord(result,stamp,signal){
    try{return await preparedCloudRecord(result,stamp,signal);}
    catch(error){if(error.name!=='AbortError'){await clouds.discard(stamp,result.width,cloudCatalog);compressedClouds.delete(stamp.toISOString()+'/'+result.width);preparedClouds.delete(stamp.toISOString()+'/'+result.width);}throw error;}
  }
  function decodeCachedSelection(){
    if(decodingReplay||!hourlyClouds())return;
    var stamp=cloudStamp(),record=stamp&&compressedClouds.get(stamp.toISOString()+'/'+cloudWidth);if(!record)return;
    decodingReplay=true;var controller=new AbortController();
    decodeCloudRecord(record,stamp,controller.signal).then(function(value){var current=cloudStamp();if(tilt===undefined&&current&&+current===+stamp)installCloudRecord(value,photoGeneration,null,false);}).catch(function(){}).finally(function(){decodingReplay=false;var current=cloudStamp();if(current&&+current!==+stamp)decodeCachedSelection();});
  }
  async function prepareReplayRecord(stamp,priority){
    var key=stamp.toISOString(),cached=replayMemo.get(key);if(cached)return cached;
    if(!replayPending.has(key)){
      var controller=new AbortController(),task=(async function(){
        var result=await requestCloudBytes(stamp,cloudWidth,controller.signal,14000,navigator.onLine===false),packed;
        packed=await replayPreparing.prepare(result.blobs,replayWidth,result.natural===undefined?result.blobs.slice(0,5).some(Boolean):result.natural,task.priority,key,result.width);
        var record={photo:{date:data.utcDate(stamp),time:key,sourceTimes:result.sourceTimes,width:result.width,coverage:packed.coverage,source:'NASA / EUMETSAT',natural:result.natural===undefined?result.blobs.slice(0,5).some(Boolean):result.natural,dense:true,shared:!!result.shared},width:packed.width,pixels:packed.pixels};
        return replayMemo.put(key,record,packed.pixels.byteLength);
      }());task.priority=priority||0;replayPending.set(key,task);task.finally(function(){if(replayPending.get(key)===task)replayPending.delete(key);}).catch(function(){});
    }
    if(priority){replayPending.get(key).priority=Math.max(replayPending.get(key).priority,priority);replayPreparing.boost(key,priority);}
    return replayPending.get(key);
  }
  function replayTexture(record){
    var key=record.photo.time,texture=replayTextures.get(key);
    if(texture)replayTextures.delete(key);
    else{texture=new THREE.DataTexture(record.pixels,record.width,record.width/2,THREE.RGBAFormat);texture.flipY=true;texture.generateMipmaps=renderer.capabilities.isWebGL2||!(record.width&(record.width-1));texture.wrapS=texture.generateMipmaps?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;texture.minFilter=texture.generateMipmaps?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;renderer.initTexture(texture);}
    replayTextures.set(key,texture);
    for(var entry of replayTextures){if(replayTextures.size<=6)break;if(entry[1]!==replayUniforms.replayFrom.value&&entry[1]!==replayUniforms.replayTo.value&&entry[1]!==texture){entry[1].dispose();replayTextures.delete(entry[0]);}}
    return texture;
  }
  function advanceReplay(time){
    if(!replayUniforms.replayEnabled.value)return;
    var t=Math.max(0,Math.min(1,(time-replayBlendStarted)/120));replayUniforms.replayBlend.value=t*t*(3-2*t);
    if(replayFadeStarted&&time>=scrubUntil){var fade=Math.min(1,(time-replayFadeStarted)/220);replayUniforms.replayEnabled.value=1-fade;}
  }
  function installReplayRecord(record){
    if(!record||tilt!==undefined||!hourlyClouds())return;
    var stamp=cloudStamp();if(!stamp||record.photo.time!==stamp.toISOString())return;
    if(performance.now()>=scrubUntil&&installedCloud&&installedCloud.photo.time===record.photo.time)return;
    if(photo&&photo.time===record.photo.time&&!replayUniforms.replayEnabled.value)return;
    if(replayTarget===record&&replayUniforms.replayEnabled.value){replayFadeStarted=0;replayUniforms.replayEnabled.value=1;return;}
    var time=performance.now(),old=replayTarget||photo&&replayMemo.get(photo.time),texture;
    if(!replayUniforms.replayEnabled.value&&old){texture=replayTexture(old);replayUniforms.replayFrom.value=replayUniforms.replayTo.value=texture;replayUniforms.replayFromBaked.value=0;replayUniforms.replayBlend.value=1;}
    if(old){
      advanceReplay(time);var target=replayBakes[replayBakeIndex++%2],prior=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(replayBakeScene,replayBakeCamera);renderer.setRenderTarget(prior);replayUniforms.replayFrom.value=target.texture;replayUniforms.replayFromBaked.value=1;
    }
    texture=replayTexture(record);replayUniforms.replayTo.value=texture;
    if(!old){replayUniforms.replayFrom.value=texture;replayUniforms.replayFromBaked.value=0;}
    replayBlendStarted=time;replayFadeStarted=0;replayUniforms.replayBlend.value=old?0:1;replayUniforms.replayEnabled.value=1;
    replayTarget=record;replayMemo.pin(record.photo.time);photo=record.photo;photoMix=1;replayPendingCloud=false;wrapper.dataset.photo='ready';
  }
  function selectReplayRecord(stamp){
    var record=replayMemo.get(stamp.toISOString());if(record){installReplayRecord(record);return;}
    replayPendingCloud=true;prepareReplayRecord(stamp,100).then(function(value){var selected=cloudStamp();if(selected&&+selected===+stamp&&!live){installReplayRecord(value);updateAstronomy();updateLabels();}}).catch(function(){});
  }
  function installCloudRecord(record,generation,signal,upgrade) {
    if(!record||generation!==photoGeneration||signal&&signal.aborted||upgrade&&(!photo||photo.time!==record.photo.time||photo.width>record.photo.width||photo.width===record.photo.width&&(photo.natural||!record.photo.natural)||photo.natural&&!record.photo.natural))return;
    if(installedCloud===record&&photo===record.photo)return;
    if(!loading&&(performance.now()<interactionUntil||pointers.size)){deferredCloud={record:record,generation:generation,signal:signal,upgrade:upgrade};cloudMemo.pin(record.photo.time);return;}
    if(!loading&&performance.now()<scrubUntil&&hourlyClouds())return;
    var previous=installedCloud,oldCanvas=satelliteTexture.image;
    satelliteTexture.dispose();infraredTexture.dispose();installedCloud=record;
    satelliteTexture=configureTexture(new THREE.CanvasTexture(record.natural));infraredTexture=configureTexture(new THREE.CanvasTexture(record.infrared));
    earthMaterial.uniforms.photoMap.value=satelliteTexture;earthMaterial.uniforms.infraredMap.value=infraredTexture;
    earthMaterial.uniforms.thermalEnabled.value=1;earthMaterial.uniforms.naturalEnabled.value=record.photo.natural?1:0;
    earthMaterial.uniforms.denseEnabled.value=record.photo.dense?1:0;
    var sourceSun=math.solar(new Date(record.photo.time));photoSunUniform.value.set(sourceSun.vector.x,sourceSun.vector.y,sourceSun.vector.z);
    photo=record.photo;cloudMemo.pin(photo.time);compressedClouds.pin(photo.time+'/'+cloudWidth);photoMix=loading&&!upgrade?0:1;cloudFailure='';replayPendingCloud=false;wrapper.dataset.photo='ready';
    if(replayUniforms.replayEnabled.value){if(renderingVisible())replayFadeStarted=performance.now();else replayUniforms.replayEnabled.value=0;}
    if(record.photo.dense&&!replayMemo.has(photo.time))prepareReplayRecord(new Date(photo.time),100).catch(function(){});
    if(previous&&!previous.memoized)previous.canvases.forEach(function(canvas){canvas.width=canvas.height=1;});
    else if(!previous&&oldCanvas&&oldCanvas.getContext)oldCanvas.width=oldCanvas.height=1;
    updateAstronomy();updateLabels();announce();
  }
  function requestCloudRecord(stamp,width,signal,timeout,offline,force) {
    var key=stamp.toISOString()+'/'+width,cached=cloudMemo.get(stamp.toISOString());
    if(cached&&cached.photo.width>=width&&(!force||cached.photo.natural))return Promise.resolve(cached);
    if(cloudPending.has(key)&&cloudPending.get(key).signal.aborted)cloudPending.delete(key);
    if(!cloudPending.has(key)){
      var task={signal:signal};task.promise=(async function(){try{return await decodeCloudRecord(await requestCloudBytes(stamp,width,signal,timeout,offline,force),stamp,signal);}finally{if(cloudPending.get(key)===task)cloudPending.delete(key);}})();
      cloudPending.set(key,task);
    }
    return timeline.waitFor(cloudPending.get(key).promise,signal);
  }
  async function upgradePhotoDetail() {
    if(loading||performance.now()<interactionUntil||pointers.size||performance.now()<scrubUntil||replayUniforms.replayEnabled.value>0||timeEditTimer!==null||fetchingPhoto||detailController||!photo||!photo.time||tilt!==undefined||navigator.onLine===false)return;
    // Promote before close zoom magnifies the base map. Tall fullscreen and
    // high-density canvases need the same detail even at the opening distance.
    var desired=Math.max(photo.width,Math.min(textureWidth,radius<3.5||container.clientHeight*renderer.getPixelRatio()>900?4096:2048));
    if(photo.width>=desired&&photo.natural)return;
    var key=photo.time+'/'+desired+'/'+photoGeneration;
    if(key===detailKey&&Date.now()-detailChecked<60000)return;
    detailKey=key;detailChecked=Date.now();
    var controller=new AbortController(),generation=photoGeneration,stamp=new Date(photo.time);detailController=controller;
    try {
      // Keep the installed frame and controls while a sharper copy arrives.
      var record=await requestCloudRecord(stamp,desired,controller.signal,20000,false,true);
      installCloudRecord(record,generation,controller.signal,true);
    }catch(_){}
    finally{if(detailController===controller)detailController=null;}
  }
  function setForecast(value) {
    if(forecast===value)return;
    forecast=value;var rgba=new Uint8Array(362*181*4);
    // Duplicate the seam's neighbors instead of repeating a non-power-of-two
    // texture, which WebGL1 cannot wrap correctly.
    for(var lat=-90;lat<=90;lat++)for(var column=0;column<362;column++){
      var lon=(column+539)%360;
      var offset=((lat+90)*362+column)*4;rgba[offset]=Math.round(value.grid[(lat+90)*360+lon]/100*255);rgba[offset+3]=255;
    }
    auroraTexture.dispose();auroraTexture=configureTexture(new THREE.DataTexture(rgba,362,181,THREE.RGBAFormat));auroraTexture.wrapS=THREE.ClampToEdgeWrapping;
    aurora.select(auroraScaffold,value.grid);
    auroraMeshes.forEach(function(mesh,i){mesh.material.uniforms.auroraMap.value=auroraTexture;var geometry=mesh.geometry;geometry.index.needsUpdate=true;geometry.index.updateRange.offset=0;geometry.index.updateRange.count=auroraScaffold[i].count;geometry.setDrawRange(0,auroraScaffold[i].count);});updateAstronomy();
  }
  async function refreshWeather() {
    if(fetchingWeather||navigator.onLine===false||Date.now()-weatherChecked<60000)return;
    fetchingWeather=true;
    if(!weatherChecked){updateLabels();announce();}
    try {
      var results=await Promise.allSettled([data.fetchJSON('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',{timeout:10000}),data.fetchJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',{timeout:10000})]);
      if(results[0].status==='fulfilled'){try{var next=data.parseAurora(results[0].value);if(data.auroraFreshness(next,new Date()).fresh){
        liveForecast=next;if(live)setForecast(next);
        var file='session:'+next.observation.toISOString()+'/'+next.forecast.toISOString();
        if(!archiveCache.has(file)){sessionFrames.push({file:file,observation:next.observation,forecast:next.forecast,session:true});cacheArchive(file,Object.assign({},next,{historical:true}));if(sessionFrames.length>16)archiveCache.delete(sessionFrames.shift().file);}
      }}catch(error){}}
      if(results[1].status==='fulfilled'){try{kp=data.parseKp(results[1].value);}catch(error){}}
    } finally {fetchingWeather=false;weatherChecked=Date.now();updateAstronomy();updateLabels();announce();}
  }
  async function refreshArchive() {
    if(archiveBusy||navigator.onLine===false||tilt!==undefined||live&&Date.now()-archiveChecked<10*60000)return;
    if(!live&&instant>Date.now()+300000){forecast=null;replayPendingAurora=false;return;}
    archiveBusy=true;updateLabels();var generation=++archiveGeneration;
    if(archiveController)archiveController.abort();archiveController=new AbortController();var signal=archiveController.signal;
    try{
      if(!archiveFrames.length||Date.now()-archiveChecked>5*60000){
        try{
          var manifest=await data.fetchJSON(archiveBase+'manifest.json?v='+Math.floor(Date.now()/300000),{timeout:10000,signal:signal,allowText:true});
          archiveFrames=data.parseAuroraManifest(manifest);archiveChecked=Date.now();
        }catch(error){
          if(error.name==='AbortError')return;
          if(!archiveFrames.length){try{archiveFrames=data.parseAuroraManifest(await data.fetchJSON('assets/data/aurora/manifest.json',{timeout:3000,signal:signal}));archiveChecked=Date.now();}catch(_){}}
        }
      }
      if(!live){
        var entry=data.auroraFrameAt(allAuroraFrames(),instant);
        if(!entry){forecast=null;return;}
        var value=archiveCache.get(entry.file);
        if(!value)value=await requestArchive(entry,signal);
        if(generation===archiveGeneration&&!signal.aborted&&!live)setForecast(value);
      }
    }catch(_){}
    finally{if(generation===archiveGeneration){archiveBusy=false;replayPendingAurora=false;updateAstronomy();updateLabels();announce();}}
  }
  function allAuroraFrames(){return archiveFrames.concat(sessionFrames);}
  function cacheArchive(file,value){archiveCache.delete(file);archiveCache.set(file,value);if(archiveCache.size>400)archiveCache.delete(archiveCache.keys().next().value);return value;}
  function requestArchive(entry,signal){
    if(archiveCache.has(entry.file))return Promise.resolve(archiveCache.get(entry.file));
    if(archivePending.has(entry.file)&&archivePending.get(entry.file).signal.aborted)archivePending.delete(entry.file);
    if(!archivePending.has(entry.file)){
      var task={signal:signal};task.promise=(async function(){try{
        var value;
        try{value=await data.fetchAuroraArchive(entry,archiveBase,{timeout:6000,signal:signal});}
        catch(error){if(error.name==='AbortError')throw error;value=await data.fetchAuroraArchive(entry,'assets/data/aurora/',{timeout:2000,signal:signal});}
        if(signal.aborted){var aborted=new Error('Aurora request aborted');aborted.name='AbortError';throw aborted;}
        return cacheArchive(entry.file,value);
      }finally{if(archivePending.get(entry.file)===task)archivePending.delete(entry.file);}})();archivePending.set(entry.file,task);
    }
    return timeline.waitFor(archivePending.get(entry.file).promise,signal);
  }
  function applyCachedTime(){
    replayPendingCloud=replayPendingAurora=false;
    if(tilt!==undefined||!live&&instant>Date.now()+300000){photo=null;forecast=null;replayUniforms.replayEnabled.value=0;replayTarget=null;return;}
    var stamp=cloudStamp();
    if(live&&stamp&&Date.now()-stamp>5*3600000)stamp=null;
    var record=stamp&&cloudMemo&&cloudMemo.get(stamp.toISOString());
    if(stamp&&!live&&hourlyClouds()&&(performance.now()<scrubUntil||replayUniforms.replayEnabled.value))selectReplayRecord(stamp);
    else if(record)installCloudRecord(record,photoGeneration,null,false);
    else if(!stamp){photo=null;replayUniforms.replayEnabled.value=0;replayTarget=null;}
    else if(!photo||photo.time!==stamp.toISOString()){
      // Keep the installed, pinned textures until both replacement maps are
      // decoded. Their labels retain the actual source time during the wait.
      if(photo&&!photo.time)photo=null;
      replayPendingCloud=instant<=Date.now();decodeCachedSelection();
    }
    if(live){forecast=liveForecast;return;}
    var entry=data.auroraFrameAt(allAuroraFrames(),instant),value=entry&&archiveCache.get(entry.file);
    if(value)setForecast(value);else{
      var cached=data.auroraFrameAt(allAuroraFrames().filter(function(frame){return archiveCache.has(frame.file);}),instant);
      if(cached)setForecast(archiveCache.get(cached.file));else forecast=null;
      replayPendingAurora=!!entry;
    }
  }
  function updateReplayLabel(){
    updateLoadingProgress();
    var label=byId('globe-replay-status');if(!label)return;
    if(tilt!==undefined){text(label,'Sunlight only at this tilt.');return;}
    if(replayPendingCloud){text(label,'Loading clouds');return;}
    if(recentMode&&photo&&photo.time){var cloudTime=new Date(photo.time);text(label,'Clouds through '+timeFormatter.format(cloudTime)+(live?' ('+Math.max(0,Math.round((instant-cloudTime)/60000))+'m old).':'.'));return;}
    if(!live&&instant>Date.now()+300000){text(label,'Future time: sunlight only.');return;}
    if(loading&&!replayBusy){text(label,'Preparing replay');return;}
    var total=replayClouds.length+replayAurora.length,ready=replayClouds.filter(cloudPrepared).length+replayAurora.filter(function(entry){return archiveCache.has(entry.file);}).length;
    text(label,replayBusy&&ready<total?'Preparing replay '+ready+'/'+total:!replayClouds.length&&!replayAurora.length?'Weather history unavailable.':replayFailed.size?'Replay ready, with data gaps.':(hourlyClouds()?'Clouds every 15m. ':'Clouds every 3h. ')+'Recorded aurora.');
  }
  function cloudPrepared(t){return hourlyClouds()?replayMemo&&replayMemo.has(t.toISOString()):cloudMemo&&cloudMemo.has(t.toISOString())||compressedClouds&&compressedClouds.has(t.toISOString()+'/'+cloudWidth);}
  function warmDayTimeline(initial){
    if(loading&&!initial||tilt!==undefined||navigator.onLine===false)return;
    var day=recentMode?timeline.recentBounds(recentEnd):timeline.dayBounds(instant),frames=allAuroraFrames(),key=(initial?'opening/':'full/')+(recentMode?'recent/':'day/')+Math.floor(+day.start/3600000)+'/'+(cloudCatalog&&+cloudCatalog.end)+'/'+frames.length+'/'+(frames.length&&frames[frames.length-1].file);
    if(replayKey===key&&(replayBusy||Date.now()-replayChecked<60000))return;
    if(replayController)replayController.abort();replayController=new AbortController();var controller=replayController,signal=controller.signal;
    replayKey=key;replayChecked=Date.now();replayBusy=true;replayFailed=new Set();
    replayClouds=recentMode?timeline.rangeFrames(cloudCatalog&&cloudCatalog.dense&&!hourlyClouds()?cloudCatalog.legacy:cloudCatalog,day,new Date(),hourlyClouds()?clouds.STEP:3*3600000,hourlyClouds()?clouds.published:null):hourlyClouds()?clouds.frames(cloudCatalog,instant,new Date()):timeline.cloudFrames(cloudCatalog&&cloudCatalog.dense?cloudCatalog.legacy:cloudCatalog,instant,new Date());
    if(recentMode&&hourlyClouds()&&sharedManifest&&sharedManifest.frames[sharedManifest.frames.length-1].time>=Date.now()-5*3600000)replayClouds=shared.replayFrames(sharedManifest,replayClouds,day);
    replayAurora=frames.filter(function(entry){return entry.forecast>=day.start-120*60000&&entry.forecast<+day.end+120*60000&&entry.observation<=Date.now();});
    var firstAurora=data.auroraFrameAt(frames,day.start);
    if(firstAurora&&!replayAurora.some(function(entry){return entry.file===firstAurora.file;}))replayAurora.unshift(firstAurora);
    var lastAurora=data.auroraFrameAt(frames,day.end);
    if(lastAurora&&!replayAurora.some(function(entry){return entry.file===lastAurora.file;}))replayAurora.push(lastAurora);
    cloudMemo.retain(replayClouds.map(function(t){return t.toISOString();}));
    replayMemo.retain(replayClouds.map(function(t){return t.toISOString();}));
    var keepPrepared=new Set(replayClouds.map(function(t){return t.toISOString()+'/'+cloudWidth;}));preparedClouds=new Set(Array.from(preparedClouds).filter(function(k){return keepPrepared.has(k);}));
    compressedClouds.retain(replayClouds.map(function(t){return t.toISOString()+'/'+cloudWidth;}));
    var cloudQueue=timeline.order(replayClouds,instant).filter(function(t){return !cloudPrepared(t);}),auroraQueue=replayAurora.filter(function(e){return !archiveCache.has(e.file);});
    // Prepare compact display maps off the input thread. Full observations are
    // retained for the stopped view; dragging only changes small GPU buffers.
    async function cloudWorker(){while(cloudQueue.length&&!signal.aborted){cloudQueue=timeline.order(cloudQueue,instant);var stamp=cloudQueue.shift();try{if(hourlyClouds())await timeline.waitFor(prepareReplayRecord(stamp,0),signal);else await requestCloudRecord(stamp,Math.min(1024,cloudWidth),signal,10000,false);}catch(error){if(error.name==='AbortError')return;replayFailed.add(stamp.toISOString());}if(replayController===controller)updateReplayLabel();}}
    async function auroras(){while(auroraQueue.length&&!signal.aborted){var entry=auroraQueue.shift();try{await requestArchive(entry,signal);}catch(error){if(error.name==='AbortError')return;replayFailed.add(entry.file);}if(replayController===controller)updateReplayLabel();}}
    var deadline=initial?setTimeout(function(){controller.abort();},Math.max(1,26000-(performance.now()-loadingStarted))):null;
    updateReplayLabel();return Promise.allSettled([cloudWorker(),cloudWorker(),cloudWorker(),cloudWorker(),cloudWorker(),cloudWorker(),auroras(),auroras()]).finally(function(){clearTimeout(deadline);if(replayController===controller){replayBusy=false;if(signal.aborted)replayKey='';updateReplayLabel();}});
  }
  function refreshData() {
    var jobs=[['clouds',refreshPhoto()],['aurora',refreshWeather()],['history',refreshArchive()]];
    if(!loading)warmDayTimeline();
    if(!loadingJobsStarted){loadingJobsStarted=true;jobs.forEach(function(job){Promise.resolve(job[1]).finally(function(){settleLoad(job[0]);});});
      Promise.allSettled(jobs.map(function(job){return job[1];})).then(function(){startupReplay=warmDayTimeline(true)||startupReplay;return startupReplay;}).finally(function(){settleLoad('replay');});
    }
    Promise.allSettled(jobs.map(function(job){return job[1];})).then(function(){return warmDayTimeline();});
  }
  window.addEventListener('online',function(){requestedDay='';weatherChecked=0;sharedChecked=0;cloudCatalogChecked=0;refreshData();});
  updateAstronomy();updateLabels();announce();resume();refreshData();
  setInterval(function(){if(live)instant=new Date();updateAstronomy();updateLabels();refreshData();},60000);
}());
