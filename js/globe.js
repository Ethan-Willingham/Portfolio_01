/* Daylight Globe. Astronomy and data parsing have independent numeric tests.
   See docs/DAYLIGHT_GLOBE.md for sources, bounds and the browser harness. */
(function () {
  'use strict';
  var container = document.getElementById('globe-container');
  if (!container) return;
  var THREE = window.THREE, math = window.GlobeMath, data = window.GlobeData;
  var byId = function (id) { return document.getElementById(id); };
  var wrapper = document.querySelector('.globe-wrapper');
  var status = byId('globe-status'), clock = byId('globe-clock'), dataLine = byId('globe-data');
  var explore = byId('globe-explore'), exploreButton = byId('globe-explore-toggle');
  var dateInput = byId('globe-date'), hourInput = byId('globe-hour'), returnButton = byId('globe-return');
  var pinPanel = byId('globe-pin'), summary = byId('globe-summary');
  var DEG = Math.PI / 180, DAY = 86400000;
  var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var dateFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',timeZone:'UTC'});
  var clockFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  var timeFormatter = new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit'});
  var forecastFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  var solarFormatter = new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit',timeZone:'UTC'});
  var solarDateFormatter = new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'});
  var live = true, instant = new Date(), tilt = undefined, pin = null;
  var photo = null, forecast = null, kp = null, fetchingPhoto = false, fetchingWeather = false;
  var baseState = 'loading';
  var requestedDay = '', photoChecked = 0, weatherChecked = 0, photoGeneration = 0;
  var photoMix = 0, lastLabels = 0, lastFrame = 0, frameRequest = null, inView = true;
  var autoSpin = true, targetTheta = 0, targetPhi = 1.1, targetRadius = 3;
  var theta = 0, phi = 1.1, radius = 3;
  var auroraStyle = new URLSearchParams(location.search).get('auroraStyle') || 'layered';
  if (!['shell','halo','curtain','layered'].includes(auroraStyle)) auroraStyle = 'layered';
  var css = getComputedStyle(document.documentElement);
  function cssColor(name) { return new THREE.Color(css.getPropertyValue(name).trim()); }
  function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
  function formatDay(day) { var date=new Date(day+'T12:00:00Z');return dateFormatter.format(date)+(date.getUTCFullYear()===new Date().getUTCFullYear()?'':', '+date.getUTCFullYear())+' (UTC)'; }
  function completedDay(now) { return new Date(Math.floor(now.getTime() / DAY) * DAY - DAY).toISOString().slice(0,10); }
  function coordinate(lat, lon) { return Math.abs(lat).toFixed(1) + '\u00b0' + (lat < 0 ? 'S' : 'N') + ', ' + Math.abs(lon).toFixed(1) + '\u00b0' + (lon < 0 ? 'W' : 'E'); }
  function solarDate(date, lon) { return new Date(date.getTime() + (lon * 4 + math.solar(date,tilt).equationOfTime) * 60000); }
  function announce() {
    var message = status.textContent + ' ' + clock.textContent + '. ' + dataLine.textContent;
    if (pin) message += ' Pinned at ' + coordinate(pin.lat, pin.lon) + '. ' + pinPanel.innerText;
    text(summary, message);
  }
  function syncInputs() {
    var year = instant.getFullYear(), month = String(instant.getMonth()+1).padStart(2,'0'), day = String(instant.getDate()).padStart(2,'0');
    dateInput.value = year + '-' + month + '-' + day;
    hourInput.value = instant.getHours() * 60 + instant.getMinutes();
    text(byId('globe-hour-label'), timeFormatter.format(instant));
    hourInput.setAttribute('aria-valuetext',timeFormatter.format(instant) + ' in ' + zone);
  }
  text(byId('globe-time-basis'), 'Time in ' + zone.replace(/_/g,' ') + ', with daylight saving handled automatically.');
  function updateLabels() {
    var hypothetical = tilt !== undefined;
    var line = hypothetical ? 'Reference map. Lighting at a ' + tilt + '\u00b0 tilt.' :
      (photo ? 'Satellite photo ' + formatDay(photo.date) + '. ' : baseState === 'ready' ? 'Reference map. ' : baseState === 'loading' ? 'Loading reference map. ' : 'Reference map unavailable. ') + (live ? 'Live sunlight.' : 'Lighting for the time you chose.');
    if(hypothetical && baseState !== 'ready') line = (baseState === 'loading' ? 'Loading reference map. ' : 'Reference map unavailable. ') + 'Lighting at a ' + tilt + '\u00b0 tilt.';
    text(status, line);
    text(clock, (live ? 'Now: ' : 'Chosen time: ') + clockFormatter.format(instant));
    clock.dateTime = instant.toISOString();
    var parts = [];
    var fresh = forecast && data.auroraFreshness(forecast, new Date()).fresh;
    if (live && !hypothetical && fresh) {
      parts.push('Aurora forecast ' + forecastFormatter.format(forecast.forecast));
      parts.push('measurements from ' + forecastFormatter.format(forecast.observation));
    } else if (!live || hypothetical) parts.push('Current aurora is hidden in Explore.');
    else parts.push(fetchingWeather && !weatherChecked ? 'Checking aurora forecast.' : 'Aurora forecast unavailable.');
    var kpAge = kp ? new Date() - kp.time : Infinity;
    if (live && kpAge >= -5 * 60000 && kpAge < 9 * 3600000) parts.push('Magnetic activity: Kp ' + kp.kp.toFixed(2) + ' at ' + forecastFormatter.format(kp.time));
    text(dataLine, parts.join(' / '));
    byId('globe-gap-key').hidden = !photo || hypothetical;
    text(byId('globe-gap-key'),baseState === 'ready' ? 'Reference map in hatched photo gaps.' : 'No photo data in hatched gaps.');
    returnButton.hidden = live;
    wrapper.dataset.mode = live ? 'live' : 'explore';
    if (live) syncInputs();
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
    if (!live || tilt !== undefined) aurora = 'Hidden in Explore';
    else if (forecast && data.auroraFreshness(forecast,new Date()).fresh) {
      var probability = data.auroraAt(forecast,pin.lat,pin.lon);
      var elevation = math.solarElevation(instant,pin.lat,pin.lon);
      aurora = Math.round(probability) + '% modeled overhead';
      aurora += elevation >= 0 ? '. Daylight hides it.' : elevation >= -12 ? '. Twilight may hide it.' : '. Dark sky; clouds can hide it.';
      if (probability < 5 && elevation < -6) {
        var nearby = data.auroraVisibility(forecast,pin.lat,pin.lon,elevation);
        if (nearby.nearestOvalMiles !== null) aurora += ' Modeled oval within ' + Math.round(nearby.nearestOvalMiles/10)*10 + ' miles.';
      }
    }
    text(byId('globe-pin-aurora'), aurora);
  }
  exploreButton.addEventListener('click',function () {
    explore.hidden = !explore.hidden;
    exploreButton.setAttribute('aria-expanded',String(!explore.hidden));
    text(exploreButton, explore.hidden ? 'Explore another time' : 'Close Explore');
  });
  function editTime() {
    if (!dateInput.value || !dateInput.validity.valid) return;
    var fields = dateInput.value.split('-').map(Number), minutes = Number(hourInput.value);
    var chosen = new Date(fields[0],fields[1]-1,fields[2],Math.floor(minutes/60),minutes%60);
    if (!Number.isFinite(chosen.getTime())) return;
    instant = chosen; live = false; syncInputs(); updateAstronomy(); updateLabels(); announce();
  }
  dateInput.addEventListener('change',editTime); hourInput.addEventListener('input',editTime);
  document.querySelectorAll('.tilt-btn').forEach(function (button) {
    button.addEventListener('click',function () {
      tilt = button.dataset.tilt === 'current' ? undefined : Number(button.dataset.tilt);
      live = false;
      document.querySelectorAll('.tilt-btn').forEach(function (b) { b.setAttribute('aria-pressed',String(b === button)); });
      text(byId('globe-tilt-note'), tilt === undefined ? 'Current tilt. The Moon follows its real orbit.' : tilt === 45 ? 'A hypothetical tilt. Reference map; Moon hidden.' : 'A hypothetical tilt. Reference map; real lunar orbit.');
      updateAstronomy(); updateLabels(); announce();
    });
  });
  returnButton.addEventListener('click',function () {
    var returnHadFocus = document.activeElement === returnButton;
    live = true; instant = new Date(); tilt = undefined; pinDayKey = '';
    document.querySelectorAll('.tilt-btn').forEach(function (b) {b.setAttribute('aria-pressed',String(b.dataset.tilt === 'current'));});
    text(byId('globe-tilt-note'),'Current tilt. The Moon follows its real orbit.');
    updateAstronomy(); updateLabels(); announce(); refreshData();
    if (returnHadFocus) exploreButton.focus({preventScroll:true});
  });
  byId('globe-pin-close').addEventListener('click',function () { setPin(null); container.focus({preventScroll:true}); });
  function unavailable(message) {
    text(status,message); text(dataLine,'You can still follow the source links below.');
    text(container.querySelector('.globe-loading'),'Interactive globe unavailable');
    exploreButton.hidden = true; exploreButton.disabled = true;
    byId('globe-fullscreen').hidden = true; byId('globe-fullscreen').disabled = true;
    container.removeAttribute('tabindex');container.setAttribute('aria-label','Earth globe unavailable');
    container.removeAttribute('aria-describedby');container.querySelector('.globe-info').remove();
    text(byId('globe-keyboard'),'The interactive globe is unavailable. Source links are below.');
    text(summary,message+' '+dataLine.textContent);
  }
  if (!THREE || !math || !data) {
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setClearColor(cssColor('--d-canvas-bg'));
  renderer.domElement.setAttribute('aria-hidden','true'); container.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42,1,.1,200);
  var mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  var textureWidth = Math.min(mobile ? 2048 : 4096,renderer.capabilities.maxTextureSize);
  textureWidth = Math.pow(2,Math.floor(Math.log2(textureWidth)));
  var sunUniform = {value:new THREE.Vector3(1,0,0)};
  var moonSunUniform = {value:new THREE.Vector3(1,0,0)}, lunarState = null, moonDisplayDistance = 5.5;
  function solidTexture(r,g,b) {
    var tex = new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1,THREE.RGBAFormat); tex.needsUpdate = true; return tex;
  }
  var baseTexture = solidTexture(60,90,87), nightTexture = solidTexture(1,2,1), satelliteTexture = solidTexture(60,90,87), moonTexture = solidTexture(130,128,117);
  var vertex = 'varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld; void main(){ vUv=uv; vNormal=normalize((modelMatrix*vec4(normal,0.0)).xyz); vWorld=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  var earthMaterial = new THREE.ShaderMaterial({uniforms:{baseMap:{value:baseTexture},nightMap:{value:nightTexture},photoMap:{value:satelliteTexture},sunDir:sunUniform,photoMix:{value:0},photoEnabled:{value:0}},vertexShader:vertex,fragmentShader:[
    'uniform sampler2D baseMap, nightMap, photoMap; uniform vec3 sunDir; uniform float photoMix,photoEnabled; varying vec2 vUv; varying vec3 vNormal;',
    'void main(){ vec3 base=texture2D(baseMap,vUv).rgb; vec4 photo=texture2D(photoMap,vUv);',
    'float missing=1.0-photo.a; float hatch=step(.72,fract((vUv.x+vUv.y)*190.0));',
    'vec3 muted=mix(vec3(dot(base,vec3(.299,.587,.114))),base,.38)*.67+vec3(.07)*hatch;',
    'vec3 liveColor=mix(muted,photo.rgb,photo.a); vec3 day=mix(base,liveColor,photoMix*photoEnabled);',
    'float light=dot(normalize(vNormal),sunDir); float daylight=smoothstep(-.10,.04,light);',
    'vec3 litDay=day*(.52+.52*max(0.0,light)); vec3 night=texture2D(nightMap,vUv).rgb*1.35+base*.018;',
    'gl_FragColor=vec4(mix(night,litDay,daylight),1.0); }'
  ].join('\n')});
  var earth = new THREE.Mesh(new THREE.SphereGeometry(1,96,64),earthMaterial); scene.add(earth);
  var moonMaterial = new THREE.ShaderMaterial({uniforms:{moonMap:{value:moonTexture},sunDir:moonSunUniform},vertexShader:vertex,fragmentShader:'uniform sampler2D moonMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormal; void main(){ float light=max(0.0,dot(normalize(vNormal),sunDir)); gl_FragColor=vec4(texture2D(moonMap,vUv).rgb*(.025+light*.98),1.0); }'});
  var moon = new THREE.Mesh(new THREE.SphereGeometry(.273,40,28),moonMaterial); scene.add(moon);
  var atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.015,64,40),new THREE.ShaderMaterial({uniforms:{sunDir:sunUniform},vertexShader:vertex,fragmentShader:'uniform vec3 sunDir; varying vec3 vNormal,vWorld; void main(){ vec3 eye=normalize(cameraPosition-vWorld); float rim=pow(1.0-abs(dot(normalize(vNormal),eye)),3.5); float day=smoothstep(-.25,.3,dot(normalize(vNormal),sunDir)); gl_FragColor=vec4(.28,.46,.59,rim*(.08+.3*day)); }',transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending})); scene.add(atmosphere);
  var starPositions = [];
  for (var i=0;i<450;i++) {
    var z=1-2*(i+.5)/450, angle=i*2.39996323, scale=Math.sqrt(1-z*z)*65;
    starPositions.push(Math.cos(angle)*scale,z*65,Math.sin(angle)*scale);
  }
  var stars = new THREE.BufferGeometry(); stars.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:cssColor('--text-dim'),size:.08,transparent:true,opacity:.45})));
  var pinMarker = new THREE.Mesh(new THREE.RingGeometry(.014,.021,24),new THREE.MeshBasicMaterial({color:cssColor('--accent-hover'),side:THREE.DoubleSide}));
  pinMarker.visible=false; scene.add(pinMarker);
  var auroraTexture = solidTexture(0,0,0), auroraMeshes = [];
  function buildAurora() {
    auroraMeshes.forEach(function (mesh) {scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}); auroraMeshes=[];
    var layers = auroraStyle === 'shell' ? [1.028] : auroraStyle === 'halo' ? [1.035,1.055,1.08] : auroraStyle === 'curtain' ? [1.016,1.03,1.045,1.06] : [1.023,1.038,1.052];
    layers.forEach(function (height,index) {
      var material = new THREE.ShaderMaterial({uniforms:{auroraMap:{value:auroraTexture},sunDir:sunUniform,tick:{value:0},layer:{value:index},style:{value:auroraStyle==='curtain'?1:0},strength:{value:auroraStyle==='halo'?.3:auroraStyle==='shell'?.75:.46}},vertexShader:vertex,fragmentShader:[
        'uniform sampler2D auroraMap; uniform vec3 sunDir; uniform float tick,layer,style,strength; varying vec2 vUv; varying vec3 vNormal,vWorld;',
        'void main(){ vec2 gridUv=vec2(vUv.x+.5/360.0,(vUv.y*180.0+.5)/181.0); float probability=texture2D(auroraMap,gridUv).r; float night=1.0-smoothstep(-.20,-.035,dot(normalize(vNormal),sunDir));',
        'float curtain=.72+.28*sin(vUv.x*900.0+sin(vUv.y*32.0+tick*.22)*2.0);',
        'float pulse=.92+.08*sin(tick*.5+vUv.x*24.0+layer); float glow=pow(probability,.70)*night*strength*pulse*mix(1.0,curtain,style);',
        'vec3 color=mix(vec3(.28,.76,.43),vec3(.43,.64,.36),layer/4.0); gl_FragColor=vec4(color,glow); }'
      ].join('\n'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(height,96,64),material); mesh.visible=false; scene.add(mesh); auroraMeshes.push(mesh);
    });
  }
  buildAurora();
  function configureTexture(texture) { texture.wrapS=THREE.RepeatWrapping;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture; }
  async function decodeBlob(blob,width) {
    var bitmap;
    try {
      bitmap = await createImageBitmap(blob);
      var canvas=document.createElement('canvas');
      var ratio=Math.min(1,width/bitmap.width,textureWidth/bitmap.height);
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
    } finally {if(bitmap) bitmap.close();}
  }
  async function loadLocal(path,kind) {
    try {
      var response=await fetch(path);if(!response.ok) throw new Error('Local texture unavailable');
      var canvas=await decodeBlob(await response.blob(),textureWidth);
      var texture=configureTexture(new THREE.CanvasTexture(canvas));
      if(kind==='base'){baseTexture.dispose();baseTexture=texture;earthMaterial.uniforms.baseMap.value=texture;baseState='ready';updateLabels();announce();}
      else if(kind==='night'){nightTexture.dispose();nightTexture=texture;earthMaterial.uniforms.nightMap.value=texture;}
      else {moonTexture.dispose();moonTexture=texture;moonMaterial.uniforms.moonMap.value=texture;}
    } catch (error) {if(kind==='base'){baseState='unavailable';updateLabels();announce();}}
  }
  loadLocal('assets/images/earth.jpg','base');loadLocal('assets/images/earth-night-2016.jpg','night');loadLocal('assets/images/moon.jpg','moon');
  container.classList.remove('is-loading');container.classList.add('is-ready');
  var initialSun=math.solar(instant);
  targetTheta=theta=Math.PI/2+(initialSun.longitude-52)*DEG;targetPhi=phi=Math.PI/2-32*DEG;
  function updateAstronomy() {
    var sun=math.solar(instant,tilt);sunUniform.value.set(sun.vector.x,sun.vector.y,sun.vector.z);
    lunarState=math.moon(instant);moonDisplayDistance=5.5*lunarState.distance/60.2666;
    moon.position.set(lunarState.vector.x,lunarState.vector.y,lunarState.vector.z).multiplyScalar(moonDisplayDistance);moon.lookAt(0,0,0);moon.visible=tilt!==45;
    earthMaterial.uniforms.photoEnabled.value=tilt===undefined?1:0;
    var current=live&&tilt===undefined&&forecast&&data.auroraFreshness(forecast,new Date()).fresh;
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
    event.preventDefault();container.focus({preventScroll:true});autoSpin=false;dragTotal=pointers.size?999:0;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
    gesturePin=hitAt(event.clientX,event.clientY);pinchDistance=0;
  });
  renderer.domElement.addEventListener('pointermove',function (event) {
    var previous=pointers.get(event.pointerId);
    if(!previous)return;
    var dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>1){var list=Array.from(pointers.values());var distance=Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y);if(pinchDistance)targetRadius=Math.max(1.5,Math.min(10,targetRadius+(pinchDistance-distance)*.012));pinchDistance=distance;dragTotal=999;return;}
    dragTotal+=Math.abs(dx)+Math.abs(dy);
    var factor=2*Math.max(radius-1,.1)*Math.tan(camera.fov*DEG/2)/renderer.domElement.clientHeight;
    targetTheta-=dx*factor;targetPhi=Math.max(.08,Math.min(Math.PI-.08,targetPhi-dy*factor));
  });
  function endPointer(event) {
    if(!pointers.has(event.pointerId))return;
    if(event.type==='pointerup'&&pointers.size===1&&dragTotal<7&&gesturePin)setPin(gesturePin);
    pointers.delete(event.pointerId);pinchDistance=0;
  }
  renderer.domElement.addEventListener('pointerup',endPointer);renderer.domElement.addEventListener('pointercancel',endPointer);renderer.domElement.addEventListener('lostpointercapture',function (event) {pointers.delete(event.pointerId);});
  window.addEventListener('blur',function () {pointers.clear();pinchDistance=0;});
  renderer.domElement.addEventListener('wheel',function (event) {event.preventDefault();autoSpin=false;targetRadius=Math.max(1.5,Math.min(10,targetRadius+event.deltaY*.002));},{passive:false});
  container.addEventListener('keydown',function (event) {
    if(event.target!==container)return;
    if(event.key==='Escape'&&wrapper.classList.contains('is-fullscreen'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Enter','Escape'].indexOf(event.key)<0)return;
    event.preventDefault();autoSpin=false;
    if(event.key==='ArrowLeft')targetTheta-=.14;if(event.key==='ArrowRight')targetTheta+=.14;
    if(event.key==='ArrowUp')targetPhi=Math.max(.08,targetPhi-.14);if(event.key==='ArrowDown')targetPhi=Math.min(Math.PI-.08,targetPhi+.14);
    if(event.key==='+'||event.key==='=')targetRadius=Math.max(1.5,targetRadius-.25);if(event.key==='-')targetRadius=Math.min(10,targetRadius+.25);
    if(event.key==='Enter'){var rect=renderer.domElement.getBoundingClientRect();setPin(hitAt(rect.left+rect.width/2,rect.top+rect.height/2));}
    if(event.key==='Escape')setPin(null);
  });
  function resize() {
    var w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    camera.aspect=w/h;
    // Keep at least a 42-degree horizontal field in narrow frames. This fits
    // both Earth limbs while retaining the camera distance and the user's zoom.
    camera.fov=2*Math.atan(Math.tan(21*DEG)/Math.min(1,camera.aspect))/DEG;
    camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  }
  new ResizeObserver(resize).observe(container);resize();
  function frame(time) {
    frameRequest=null;if(document.hidden||!inView)return;
    var dt=Math.min(.1,lastFrame?(time-lastFrame)/1000:1/60);lastFrame=time;
    if(live)instant=new Date();
    if(autoSpin)targetTheta-=dt*.022;
    var ease=1-Math.exp(-dt*10);theta+=(targetTheta-theta)*ease;phi+=(targetPhi-phi)*ease;radius+=(targetRadius-radius)*ease;
    camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(0,0,0);
    if(time-lastLabels>1000){updateAstronomy();updateLabels();lastLabels=time;}
    // Distance compression changes the viewing angle. Transport the actual
    // solar light into the display frame so the Moon retains its physical phase.
    if(lunarState){var moonLight=math.moonDisplayLight(lunarState,camera.position,moonDisplayDistance);moonSunUniform.value.set(moonLight.x,moonLight.y,moonLight.z);}
    photoMix=Math.min(1,photoMix+dt*.7);earthMaterial.uniforms.photoMix.value=photo?photoMix:0;
    auroraMeshes.forEach(function (mesh) {mesh.material.uniforms.tick.value=time/1000;});
    renderer.render(scene,camera);frameRequest=requestAnimationFrame(frame);
  }
  function resume() {if(!document.hidden&&inView&&frameRequest===null){lastFrame=0;frameRequest=requestAnimationFrame(frame);}}
  document.addEventListener('visibilitychange',function () {if(document.hidden&&frameRequest!==null){cancelAnimationFrame(frameRequest);frameRequest=null;}else{updateAstronomy();updateLabels();resume();refreshData();}});
  new IntersectionObserver(function (entries) {inView=entries[0].isIntersecting;if(!inView&&frameRequest!==null){cancelAnimationFrame(frameRequest);frameRequest=null;}resume();},{rootMargin:'100px'}).observe(container);
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
    requestAnimationFrame(resize);fullscreenButton.focus({preventScroll:true});
  }
  fullscreenButton.addEventListener('click',function () {
    if(wrapper.classList.contains('is-fullscreen')){exitFullscreen();return;}
    savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';wrapper.classList.add('is-fullscreen');isolateFullscreen(true);fullscreenButton.setAttribute('aria-label','Exit fullscreen');
    if(wrapper.requestFullscreen)wrapper.requestFullscreen().catch(function(){});requestAnimationFrame(resize);
  });
  document.addEventListener('fullscreenchange',function () {if(!document.fullscreenElement&&wrapper.classList.contains('is-fullscreen')){wrapper.classList.remove('is-fullscreen');document.body.style.overflow=savedOverflow;isolateFullscreen(false);fullscreenButton.setAttribute('aria-label','Enter fullscreen');requestAnimationFrame(resize);fullscreenButton.focus({preventScroll:true});}});
  document.addEventListener('keydown',function (event) {
    if(!wrapper.classList.contains('is-fullscreen'))return;
    if(event.key==='Escape'&&!document.fullscreenElement)exitFullscreen();
    if(event.key==='Tab'){
      var candidates=Array.from(wrapper.querySelectorAll('button,input,[tabindex="0"]')).filter(function(element){return !element.disabled&&element.getClientRects().length>0;});
      var first=candidates[0],last=candidates[candidates.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function refreshPhoto() {
    if(fetchingPhoto)return;
    var offline=navigator.onLine===false;
    var target=completedDay(new Date());
    if(requestedDay===target && (photo && photo.date===target || Date.now()-photoChecked<5*60000))return;
    requestedDay=target;fetchingPhoto=true;var generation=++photoGeneration;
    try {
      for(var back=0;back<4;back++){
        var day=new Date(new Date(target+'T00:00:00Z').getTime()-back*DAY).toISOString().slice(0,10);
        try {
          var result=await data.fetchPhotoDay(day,textureWidth,{timeout:18000,cacheOnly:offline});
          var canvases=await Promise.all(result.blobs.map(function(blob){return decodeBlob(blob,textureWidth);}));
          var primary=canvases[0],ctx=primary.getContext('2d'),pixels=ctx.getImageData(0,0,primary.width,primary.height);
          var secondary=canvases[1]&&canvases[1].getContext('2d').getImageData(0,0,primary.width,primary.height);
          var composite=data.compositeRGBA(secondary ? [pixels.data,secondary.data] : [pixels.data]);
          if(composite.coverage<.15){await data.discardPhotoDay(day,textureWidth);canvases.forEach(function(canvas){canvas.width=canvas.height=1;});continue;}
          pixels.data.set(composite.pixels);ctx.putImageData(pixels,0,0);
          if(generation!==photoGeneration){canvases.forEach(function(canvas){canvas.width=canvas.height=1;});return;}
          var texture=configureTexture(new THREE.CanvasTexture(primary));satelliteTexture.dispose();satelliteTexture=texture;earthMaterial.uniforms.photoMap.value=texture;
          photo={date:day,coverage:composite.coverage,width:primary.width};photoMix=0;wrapper.dataset.photo='ready';
          canvases.slice(1).forEach(function(canvas){canvas.width=canvas.height=1;});updateLabels();announce();break;
        } catch(error) {
          // A PNG header can be valid while its compressed pixels are damaged.
          // Evict that day's responses so a later visit can recover.
          await data.discardPhotoDay(day,textureWidth);
        }
      }
    } finally {fetchingPhoto=false;photoChecked=Date.now();updateLabels();}
  }
  function setForecast(value) {
    forecast=value;var rgba=new Uint8Array(360*181*4);
    for(var lat=-90;lat<=90;lat++)for(var lon=0;lon<360;lon++){
      var offset=((lat+90)*360+(lon+180)%360)*4;rgba[offset]=Math.round(value.grid[(lat+90)*360+lon]/100*255);rgba[offset+3]=255;
    }
    auroraTexture.dispose();auroraTexture=configureTexture(new THREE.DataTexture(rgba,360,181,THREE.RGBAFormat));
    auroraMeshes.forEach(function(mesh){mesh.material.uniforms.auroraMap.value=auroraTexture;});updateAstronomy();
  }
  async function refreshWeather() {
    if(fetchingWeather||navigator.onLine===false||Date.now()-weatherChecked<60000)return;
    fetchingWeather=true;
    if(!weatherChecked){updateLabels();announce();}
    try {
      var results=await Promise.allSettled([data.fetchJSON('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',{timeout:10000}),data.fetchJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',{timeout:10000})]);
      if(results[0].status==='fulfilled'){try{var next=data.parseAurora(results[0].value);if(data.auroraFreshness(next,new Date()).fresh)setForecast(next);}catch(error){}}
      if(results[1].status==='fulfilled'){try{kp=data.parseKp(results[1].value);}catch(error){}}
    } finally {fetchingWeather=false;weatherChecked=Date.now();updateAstronomy();updateLabels();announce();}
  }
  function refreshData() {refreshPhoto();refreshWeather();}
  window.addEventListener('online',function(){requestedDay='';weatherChecked=0;refreshData();});
  updateAstronomy();updateLabels();announce();resume();refreshData();
  setInterval(function(){if(live)instant=new Date();updateAstronomy();updateLabels();refreshData();},5*60000);
}());
