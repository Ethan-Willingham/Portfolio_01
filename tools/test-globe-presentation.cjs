/* NODE_PATH=/path/to/node_modules node tools/test-globe-presentation.cjs
   REAL_DATA=1 adds actual upstream three-hour cloud screenshots.
   REAL_ONLY=1 runs only the actual-data viewport matrix.
   REAL_WIDTHS=768 optionally limits an upstream retry to named widths.
   TARGETED=1 skips the full matrix for loading, cache and presentation regressions.
   NATIVE_ONLY=1 runs the real native-fullscreen Escape regression alone.
   MOBILE_ONLY=1 runs phone, short-landscape and enlarged-text panel checks.
   DUMP=/absolute/folder writes evidence. All renderer hooks are private to the
   owned local server. Chrome for Testing and that server close in finally. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const zlib = require('node:zlib'), crypto = require('node:crypto');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP || '/Users/ethan/Portfolio_01/research/daylight-live/sun-polish/presentation-browser';
const realOnly = process.env.REAL_ONLY === '1', real = realOnly || process.env.REAL_DATA === '1';
const nativeOnly = process.env.NATIVE_ONLY === '1';
const mobileOnly = process.env.MOBILE_ONLY === '1';
const fixedNow = '2026-10-05T03:10:00Z';
const checks=[], evidence=[], errors=[], requests=[];
fs.mkdirSync(dump,{recursive:true});
function check(name, pass, detail) {checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});console.log((pass?'PASS ':'FAIL ')+name);}
const hooks = `
window.__globePresentation = {
 state:function(){
  var clip=sunBody.position.clone().project(camera),ray=sunBody.position.clone().sub(camera.position);
  return {loading:loading,loaded:Object.assign({},loaded),progress:loadingProgress.value,progressMax:loadingProgress.max,
   baseState:baseState,photo:photo,photoBusy:fetchingPhoto,photoMix:photoMix,cloudFailure:cloudFailure,
   naturalEnabled:earthMaterial.uniforms.naturalEnabled.value,thermalEnabled:earthMaterial.uniforms.thermalEnabled.value,
   forecast:forecast?{observation:forecast.observation.toISOString(),forecast:forecast.forecast.toISOString(),historical:!!forecast.historical}:null,
   starCount:starCatalog?starCatalog.count:0,pointCount:starGeometry.getAttribute('position')?starGeometry.getAttribute('position').count:0,
   starVertex:starGeometry.getAttribute('position')?Array.from(starGeometry.getAttribute('position').array.slice(0,3)):null,
   sunFraming:sunFraming,live:live,instant:instant.toISOString(),tilt:tilt===undefined?null:tilt,
   sun:{ndc:clip.toArray(),inFrame:clip.z>=-1&&clip.z<=1&&Math.abs(clip.x)<1&&Math.abs(clip.y)<1&&ray.dot(camera.getWorldDirection(new THREE.Vector3()))>0,
    bearing:ray.normalize().toArray(),light:sunUniform.value.toArray(),visibleFraction:sunView.visibleFraction,fluxFraction:sunView.fluxFraction},
   canvas:{width:container.clientWidth,height:container.clientHeight},status:status.textContent,data:dataLine.textContent,
   aurora:byId('globe-aurora-status').textContent,clock:clock.textContent};
 },
 earthBounds:function(){
  var positions=earth.geometry.getAttribute('position'),point=new THREE.Vector3(),bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(var i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(earth.matrixWorld).project(camera);bounds.left=Math.min(bounds.left,point.x);bounds.right=Math.max(bounds.right,point.x);bounds.top=Math.min(bounds.top,point.y);bounds.bottom=Math.max(bounds.bottom,point.y);}
  return bounds;
 },
 pin:function(lat,lon){setPin(lat===null?null:{lat:lat,lon:lon});},
 pixelVisibility:function(kind){
  var w=container.clientWidth,h=container.clientHeight,rt=new THREE.WebGLRenderTarget(w,h),items=kind==='stars'?[starField]:[sunBody,sunGlow],previous=items.map(function(m){return m.visible;}),oldTarget=renderer.getRenderTarget();
  function read(){renderer.setRenderTarget(rt);renderer.render(scene,camera);var bytes=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,bytes);return bytes;}
  try{
   items.forEach(function(m){m.visible=false;});var off=read();items.forEach(function(m,i){m.visible=previous[i];});var on=read();
   var clip=sunBody.position.clone().project(camera),sx=(clip.x+1)*w/2,sy=(clip.y+1)*h/2,changed=0,maxGain=0,nearSun=0;
   for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=(y*w+x)*4,gain=Math.max(on[i]-off[i],on[i+1]-off[i+1],on[i+2]-off[i+2]);if(gain>8){changed++;if(Math.hypot(x-sx,y-sy)<15)nearSun++;}maxGain=Math.max(maxGain,gain);}
   return {kind:kind,changed:changed,maxGain:maxGain,nearSun:nearSun,pixel:{x:sx,y:h-sy}};
  }finally{items.forEach(function(m,i){m.visible=previous[i];});renderer.setRenderTarget(oldTarget);rt.dispose();renderer.render(scene,camera);}
 }
};
`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json','.gz':'application/gzip','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{let body=fs.readFileSync(file);if(file.endsWith('/js/globe.js')){const source=body.toString(),index=source.lastIndexOf('}());');if(index<0)throw new Error('Renderer closure not found');body=Buffer.from(source.slice(0,index)+hooks+source.slice(index));}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(body);}catch{res.writeHead(404).end();}
});
function hashes(){return Object.fromEntries(['daylight-globe.html','globe.css','js/globe.js','js/globe-stars.js','js/globe-optics.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));}
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,body){const tag=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,body])));return Buffer.concat([size,tag,body,crc]);}
const pngs=new Map();
function png(width,color){const key=width+'/'+color;if(pngs.has(key))return pngs.get(key);const height=width/2,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const row=Buffer.alloc(width*4+1);for(let x=0;x<width;x++)for(let c=0;c<4;c++)row[x*4+c+1]=color[c];const pixels=Buffer.alloc(row.length*height);for(let y=0;y<height;y++)row.copy(pixels,y*row.length);const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);pngs.set(key,bytes);return bytes;}
const capabilities='<WMS_Capabilities>'+['mumi:wideareacoverage_rgb_natural','mumi:worldcloudmap_ir108'].map(layer=>'<Layer><Name>'+layer+'</Name><Dimension name="time">2026-10-04T21:00:00.000Z/2026-10-05T03:00:00.000Z/PT3H</Dimension></Layer>').join('')+'</WMS_Capabilities>';
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/daylight/ovation-2026-10-04-storm.json')));
fixture['Observation Time']='2026-10-05T03:00:00Z';fixture['Forecast Time']='2026-10-05T03:40:00Z';
async function routes(context,options={}){
 if(options.real)return;
 await context.route('https://view.eumetsat.int/**',async route=>{
  const q=new URL(route.request().url()).searchParams;
  if(q.get('request')==='GetCapabilities')return route.fulfill({contentType:'text/xml',body:capabilities});
  requests.push({kind:'cloud',time:q.get('time'),width:Number(q.get('width')),layer:q.get('layers')});
  if(options.highResolutionIRFails&&Number(q.get('width'))===2048&&q.get('layers').endsWith('ir108'))return route.fulfill({status:503,contentType:'text/plain',body:'High-resolution infrared unavailable'});
  if(options.naturalUnavailable&&q.get('layers').endsWith('rgb_natural'))return route.fulfill({status:503,contentType:'text/plain',body:'Natural-colour layer unavailable'});
  if(options.cloudGate)await options.cloudGate;
  try{let body=png(Number(q.get('width')),options.failed?[0,0,0,0]:q.get('layers').endsWith('ir108')?[56,93,132,255]:[120,150,185,255]);if(options.reducedDamage?.corrupt&&Number(q.get('width'))===1024&&q.get('layers').endsWith('ir108'))body=body.subarray(0,33);await route.fulfill({contentType:'image/png',body});}catch{}
 });
 await context.route('https://gibs.earthdata.nasa.gov/**',route=>{const q=new URL(route.request().url()).searchParams;requests.push({kind:'daily',time:q.get('TIME')});return route.fulfill({contentType:'image/png',body:png(Number(q.get('WIDTH')),[0,0,0,255])});});
 await context.route('https://services.swpc.noaa.gov/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(options.failed?{}:route.request().url().includes('ovation')?fixture:[['time_tag','Kp'],['2026-10-05 00:00:00','4.67']])}));
 await context.route('https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/main/assets/data/aurora/**',route=>{const name=path.basename(new URL(route.request().url()).pathname);return route.fulfill({contentType:name.endsWith('.gz')?'application/gzip':'application/json',body:fs.readFileSync(path.join(root,'assets/data/aurora',name))});});
}
function listen(page,name){page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(name+': '+m.text());if(m.type()==='warning'&&/Texture is not power of two|Image in DataTexture/.test(m.text()))errors.push(name+': '+m.text());});}
async function state(page){return page.evaluate(()=>__globePresentation.state());}
async function ready(page){await page.waitForFunction(()=>window.__globePresentation&&!__globePresentation.state().loading,null,{timeout:60000});}
async function capture(page,name){await page.screenshot({path:path.join(dump,name+'.png'),fullPage:!await page.locator('.globe-wrapper.is-fullscreen').count()});}
async function layout(page){return page.evaluate(()=>{
 const selectors=['#globe-date','#globe-hour','#globe-return','.globe-tilt-options'];
 const results=selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let p=el.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(cs.overflowX+' '+cs.overflowY)){const b=p.getBoundingClientRect();clip={left:Math.max(clip.left,b.left),top:Math.max(clip.top,b.top),right:Math.min(clip.right,b.right),bottom:Math.min(clip.bottom,b.bottom)};}}
 return {selector,rect:r.toJSON(),displayed:r.width>0&&r.height>0&&!el.closest('[hidden]')&&!el.disabled,inViewport:r.left>=clip.left-1&&r.right<=clip.right+1&&r.top>=clip.top-1&&r.bottom<=clip.bottom+1,horizontal:r.left>=0&&r.right<=innerWidth+1,clipped:el.scrollWidth>el.clientWidth+2};});
 const source=document.querySelector('.globe-sources');
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),pieces=[];
 while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!n.textContent.trim()||p.closest('script,style,.globe-sr-only')||p.closest('details:not([open])')&&!p.closest('summary'))continue;const cs=getComputedStyle(p);if(cs.display==='none'||cs.visibility==='hidden'||p.closest('[hidden]'))continue;pieces.push(n.textContent.trim());}
 return {controls:results,sourceClosed:!source.open,sourceInert:source.inert||!!source.closest('[inert]'),words:pieces.join(' ').split(/\s+/).length,text:pieces.join(' '),overflow:document.documentElement.scrollWidth>innerWidth+1};
 });}
async function matrix(browser,isReal){
 for(const [width,height] of(isReal?[[375,812],[768,900],[1440,900]].filter(([width])=>!process.env.REAL_WIDTHS||process.env.REAL_WIDTHS.split(',').map(Number).includes(width)):[[375,812],[768,900],[1440,900],[667,375],[844,390]])){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===375?2:1,isMobile:width===375,hasTouch:width===375,timezoneId:'America/Chicago'});await routes(context,{real:isReal});
  const page=await context.newPage(),name=(isReal?'real-':'mock-')+width;listen(page,name);if(!isReal)await page.clock.setFixedTime(new Date(fixedNow));
  await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);
  const s=await state(page),initial=await layout(page);await capture(page,name+'-opening');
  check(name+' date, time, tilt and Live are present without disclosure',initial.controls.every(c=>c.displayed&&c.horizontal)&&!initial.overflow,initial);
  check(name+' source detail stays closed and default words stay concise',initial.sourceClosed&&initial.words<=75,{words:initial.words,text:initial.text});
  check(name+' exactly 5070 catalog stars are installed',s.starCount===5070&&s.pointCount===5070);
  const sun=await page.evaluate(()=>__globePresentation.pixelVisibility('sun')),stars=await page.evaluate(()=>__globePresentation.pixelVisibility('stars'));
  check(name+' initial Sun is projected and changes nearby pixels',s.sun.inFrame&&sun.nearSun>=2&&sun.maxGain>30,{sun:s.sun,pixels:sun});
  check(name+' catalog stars visibly change sky pixels',stars.changed>=10&&stars.maxGain>8,stars);
  if(isReal)check(name+' actual three-hour EUMETSAT frame is installed',s.photo?.source==='EUMETSAT'&&!!s.photo.time&&!s.photoBusy,s.photo);
  await page.locator('#globe-container').focus();for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(700);
  check(name+' ordinary rotation leaves Sun framing mode',!(await state(page)).sunFraming);
  await page.locator('#globe-sun').click();await page.waitForTimeout(900);const restored=await state(page),restoredPixels=await page.evaluate(()=>__globePresentation.pixelVisibility('sun'));
  check(name+' ordinary Sun button restores visible framing',restored.sunFraming&&restored.sun.inFrame&&restoredPixels.nearSun>=2,{sun:restored.sun,pixels:restoredPixels});
  const vertexBefore=await state(page),chosen=await page.evaluate(()=>{const next=new Date(Date.parse(__globePresentation.state().instant)+3*3600000);return {date:next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0'),minute:next.getHours()*60+next.getMinutes()};});
  await page.locator('#globe-date').fill(chosen.date);await page.locator('#globe-date').dispatchEvent('change');await page.locator('#globe-hour').fill(String(chosen.minute));await page.locator('#globe-hour').dispatchEvent('input');await page.waitForTimeout(250);const vertexAfter=await state(page);
  const longitudeBefore=Math.atan2(vertexBefore.starVertex[2],vertexBefore.starVertex[0]),longitudeAfter=Math.atan2(vertexAfter.starVertex[2],vertexAfter.starVertex[0]);
  const angle=Math.atan2(Math.sin(longitudeAfter-longitudeBefore),Math.cos(longitudeAfter-longitudeBefore)),hours=(Date.parse(vertexAfter.instant)-Date.parse(vertexBefore.instant))/3600000,expected=hours*2*Math.PI/23.9344696;
  check(name+' changing the clock rotates a tracked measured star by sidereal time',hours>2.9&&hours<3.1&&Math.abs(angle-expected)<.0001,{hours,angleDegrees:angle*180/Math.PI,expectedDegrees:expected*180/Math.PI,before:vertexBefore.starVertex,after:vertexAfter.starVertex});
  await page.locator('#globe-return').click();await page.locator('#globe-sun').click();await page.waitForTimeout(500);
  await page.locator('#globe-fullscreen').click();await page.waitForTimeout(300);const fsLayout=await layout(page);await capture(page,name+'-fullscreen');
  check(name+' fullscreen keeps all main controls in viewport',fsLayout.controls.every(c=>c.displayed&&c.inViewport)&&!fsLayout.overflow,fsLayout);
  check(name+' fullscreen retains access to Sources',!fsLayout.sourceInert,fsLayout.sourceInert);
  const summary=page.locator('.globe-sources summary');await page.locator('#globe-container').focus();let reachedSources=false;const tabOrder=[];for(let i=0;i<20;i++){await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const el=document.activeElement;return {id:el.id,tag:el.tagName,text:el.textContent.trim().slice(0,35),source:el.matches('.globe-sources summary')};});tabOrder.push(focus);if(focus.source){reachedSources=true;break;}}
  check(name+' keyboard Tab can reach fullscreen Sources',reachedSources,tabOrder);if(reachedSources){await page.keyboard.press('Enter');check(name+' keyboard opens fullscreen source details',await page.locator('.globe-sources').evaluate(el=>el.open));await page.keyboard.press('Enter');}
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});await page.waitForTimeout(350);const large=await layout(page);await capture(page,name+'-fullscreen-200-text');
  check(name+' 200 percent fullscreen controls remain present and horizontally unclipped',large.controls.every(c=>c.displayed&&c.horizontal&&!c.clipped)&&!large.overflow,large);
  const reachability=[];for(const selector of['#globe-date','#globe-hour','.globe-tilt-options button:last-child','#globe-return']){await page.locator(selector).scrollIntoViewIfNeeded();reachability.push(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),parents=[];for(let p=el.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY))parents.push(p.getBoundingClientRect());}return r.top>=0&&r.bottom<=innerHeight+1&&parents.every(b=>r.top>=b.top-1&&r.bottom<=b.bottom+1);}));}
  check(name+' 200 percent fullscreen controls remain reachable through dock scrolling',reachability.every(Boolean),reachability);
  await page.locator('#globe-container').focus();const nativeFocus=[];for(let i=0;i<16;i++){await page.keyboard.press('Tab');nativeFocus.push(await page.evaluate(()=>{const el=document.activeElement,r=el.getBoundingClientRect();const main=el.matches('#globe-date,#globe-hour,#globe-return,.tilt-btn');if(!main)return null;let good=r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;for(let p=el.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();good=good&&r.top>=b.top-1&&r.bottom<=b.bottom+1;}}return {id:el.id,tilt:el.dataset.tilt,good};}));}
  const focusedControls=nativeFocus.filter(Boolean),focusedKeys=new Set(focusedControls.map(c=>c.id||'tilt:'+c.tilt));check(name+' keyboard focus scrolls each enlarged control fully into view',['globe-date','globe-hour','globe-return','tilt:22.1','tilt:current','tilt:24.5','tilt:45'].every(k=>focusedKeys.has(k))&&focusedControls.every(c=>c.good),focusedControls);
  check(name+' enlarged fullscreen keeps a visible globe area',(await state(page)).canvas.height>=120);
  evidence.push({keyboard:{name,tabOrder,nativeFocus}});
  evidence.push({name,state:s,initial,sun,stars,restored,fullscreen:fsLayout,large});await context.close();
 }
}
async function loadingChecks(browser){
 let releaseCloud;const cloudGate=new Promise(resolve=>{releaseCloud=resolve;});
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Chicago'});await routes(context,{cloudGate});
 const page=await context.newPage();listen(page,'deferred-cloud');await page.clock.setFixedTime(new Date(fixedNow));
 let releaseDecode,decodeReleased=false;
 await page.exposeFunction('__cloudDecodeGate',()=>decodeReleased?Promise.resolve():new Promise(resolve=>{releaseDecode=resolve;}));
 await page.addInitScript(()=>{const create=window.createImageBitmap.bind(window);window.createImageBitmap=async function(blob,...args){if(blob.type==='image/png'&&!window.__decodeDelayed){window.__decodeDelayed=true;await window.__cloudDecodeGate();}return create(blob,...args);};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__globePresentation&&['base','night','moon','stars'].every(k=>__globePresentation.state().loaded[k]));
 const pending=await state(page),over=await page.locator('.globe-loading').evaluate(el=>{const r=el.getBoundingClientRect(),canvas=document.querySelector('#globe-container canvas').getBoundingClientRect();return {top:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.globe-loading')===el,contains:r.left<=canvas.left&&r.top<=canvas.top&&r.right>=canvas.right&&r.bottom>=canvas.bottom};});
 check('local textures can be ready while decoded clouds are still pending',pending.baseState==='ready'&&!pending.photo&&pending.loading&&pending.progress<pending.progressMax,pending);
 check('pending-cloud progress overlay stays above the entire canvas',await page.locator('.globe-loading').isVisible()&&over.top&&over.contains,over);await capture(page,'loading-before-cloud-response');
 const fsHit=await page.locator('#globe-fullscreen').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});
 check('fullscreen entry remains clickable while loading',fsHit);
 if(fsHit){await page.locator('#globe-fullscreen').click();await page.waitForTimeout(150);check('fullscreen loading preserves the pending-cloud barrier',(await state(page)).loading&&await page.locator('.globe-loading').isVisible());await capture(page,'loading-fullscreen-cloud-response');}
 releaseCloud();await page.waitForFunction(()=>window.__decodeDelayed);await page.waitForTimeout(100);const decoding=await state(page);
 check('successful PNG response does not end loading before decode',decoding.loading&&!decoding.photo&&await page.locator('.globe-loading').isVisible(),decoding);await capture(page,'loading-cloud-decode');
 decodeReleased=true;if(releaseDecode)releaseDecode();await ready(page);const done=await state(page);
 check('loading ends only after cloud installation and blend',done.photo?.source==='EUMETSAT'&&done.photoMix===1&&done.progress===done.progressMax&&!await page.locator('.globe-loading').isVisible(),done);
 const coldRequests=requests.filter(r=>r.kind==='cloud').length;await page.reload({waitUntil:'domcontentloaded'});await ready(page);const warm=await state(page),warmRequests=requests.filter(r=>r.kind==='cloud').length;
 check('warm reload reuses exact cached cloud bytes',warm.photo?.time===done.photo.time&&warmRequests===coldRequests,{coldRequests,warmRequests});
 evidence.push({loading:{pending,over,decoding,done,warm}});await context.close();
 const failed=await browser.newContext({viewport:{width:375,height:812},timezoneId:'America/Chicago'});await routes(failed,{failed:true});const failPage=await failed.newPage();listen(failPage,'failed-cloud');await failPage.clock.setFixedTime(new Date(fixedNow));const began=Date.now();await failPage.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(failPage);const failState=await state(failPage);
 check('empty cloud and daily sources settle to truthful unavailable text',!failState.photo&&failState.status==='Clouds unavailable'&&failState.aurora==='Aurora unavailable'&&!failState.loading&&Date.now()-began<20000,failState);await capture(failPage,'failed-cloud-reference');evidence.push({failedSource:failState});await failed.close();
 const noStars=await browser.newContext({viewport:{width:768,height:900},timezoneId:'America/Chicago'});await routes(noStars);await noStars.route('**/assets/data/stars-hyg-v41.bin',route=>route.fulfill({status:404,contentType:'text/plain',body:'Catalog unavailable'}));const noStarPage=await noStars.newPage();listen(noStarPage,'missing-catalog');await noStarPage.clock.setFixedTime(new Date(fixedNow));await noStarPage.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(noStarPage);const noStarState=await state(noStarPage),noStarPixels=await noStarPage.evaluate(()=>__globePresentation.pixelVisibility('stars'));check('missing catalog settles loading and reports its unavailable state',!noStarState.loading&&noStarState.data.includes('Star catalog unavailable'),noStarState);check('missing catalog does not replace measured stars with invented points',noStarState.starCount===0&&noStarState.pointCount===0&&noStarPixels.changed===0,noStarPixels);await noStarPage.locator('.globe-sources summary').click();await capture(noStarPage,'missing-catalog-sources');evidence.push({missingCatalog:noStarState,pixels:noStarPixels});await noStars.close();
}
async function reducedResolutionCheck(browser){
 const before=requests.length,context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Chicago'});await routes(context,{highResolutionIRFails:true});const page=await context.newPage();listen(page,'reduced-cloud-detail');await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);const s=await state(page),attempts=requests.slice(before);
 check('failed 2048 infrared retries the identical timestamp at 1024',attempts.some(r=>r.kind==='cloud'&&r.width===2048&&r.layer.endsWith('ir108'))&&attempts.filter(r=>r.kind==='cloud'&&r.width===1024&&r.time==='2026-10-05T03:00:00.000Z').length===2,attempts);
 check('reduced-detail retry preserves EUMETSAT frame rather than daily fallback',s.photo?.source==='EUMETSAT'&&s.photo.time==='2026-10-05T03:00:00.000Z'&&s.photo.width===1024&&!attempts.some(r=>r.kind==='daily')&&!s.loading,{state:s,attempts});await capture(page,'reduced-cloud-detail');evidence.push({reducedResolution:{state:s,attempts}});await context.close();
}
async function damagedRetryRecoveryCheck(browser){
 const reducedDamage={corrupt:true},context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Chicago'});await routes(context,{highResolutionIRFails:true,reducedDamage});const page=await context.newPage();listen(page,'damaged-reduced-retry');await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);const rejected=await state(page),keys=await page.evaluate(async()=>{const cache=await caches.open(GlobeData.CLOUD_CACHE);return (await cache.keys()).map(r=>({width:Number(new URL(r.url).searchParams.get('width')),layer:new URL(r.url).searchParams.get('layers')}));});
 check('header-valid corrupt 1024 retry is rejected after image decoding',!rejected.photo&&!rejected.loading&&rejected.status==='Clouds unavailable',{state:rejected,keys});
 check('damaged reduced retry evicts its own 1024 cache entries',!keys.some(k=>k.width===1024)&&keys.some(k=>k.width===2048&&k.layer.endsWith('rgb_natural')),keys);
 reducedDamage.corrupt=false;const before=requests.length;await page.reload({waitUntil:'domcontentloaded'});await ready(page);const recovered=await state(page),recoveryRequests=requests.slice(before);
 check('corrected reduced frame is fetched again and recovers the same timestamp',recovered.photo?.source==='EUMETSAT'&&recovered.photo.width===1024&&recovered.photo.time==='2026-10-05T03:00:00.000Z'&&recoveryRequests.filter(r=>r.kind==='cloud'&&r.width===1024&&r.time==='2026-10-05T03:00:00.000Z').length===2&&!recoveryRequests.some(r=>r.kind==='daily'),{state:recovered,requests:recoveryRequests});
 await capture(page,'damaged-retry-recovered');evidence.push({damagedRetryRecovery:{rejected,keys,recovered,recoveryRequests}});await context.close();
}
async function infraredOnlyCheck(browser){
 const before=requests.length,context=await browser.newContext({viewport:{width:768,height:900},timezoneId:'America/Chicago'});await routes(context,{naturalUnavailable:true});const page=await context.newPage();listen(page,'infrared-only');await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);const s=await state(page),attempts=requests.slice(before),gap=await page.locator('#globe-gap-key').textContent();
 check('natural-colour failure installs a current infrared-only EUMETSAT frame',s.photo?.source==='EUMETSAT'&&s.photo.time==='2026-10-05T03:00:00.000Z'&&s.photo.natural===false&&s.naturalEnabled===0&&s.thermalEnabled===1&&!attempts.some(r=>r.kind==='daily'),{state:s,attempts});
 check('infrared-only frame has an accurate default label and source explanation',s.status.endsWith('(infrared)')&&gap.startsWith('Infrared brightness over reference terrain')&&!gap.includes('Visible imagery'),{status:s.status,gap});
 await capture(page,'infrared-only-opening');await page.locator('.globe-sources summary').click();check('infrared-only source explanation is available to keyboard and touch',await page.locator('#globe-gap-key').isVisible()&&(await page.locator('.globe-sources').innerText()).includes('Infrared brightness over reference terrain'));await capture(page,'infrared-only-sources');evidence.push({infraredOnly:{state:s,gap,attempts}});await context.close();
}
async function enlargedLandscapeCheck(browser){
 for(const [width,height]of[[667,375],[844,390]]){const context=await browser.newContext({viewport:{width,height},timezoneId:'America/Chicago'});await routes(context);const page=await context.newPage();listen(page,'large-landscape-'+width);await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);await page.locator('#globe-fullscreen').click();await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});await page.waitForTimeout(400);const s=await state(page),bounds=await page.evaluate(()=>__globePresentation.earthBounds()),l=await layout(page);
 check(width+' enlarged short landscape projects the entire Earth inside the scene',bounds.left>=-1&&bounds.right<=1&&bounds.top>=-1&&bounds.bottom<=1&&s.sun.inFrame,{bounds,state:s});check(width+' enlarged short landscape has no horizontal control overflow',!l.overflow&&l.controls.every(c=>c.horizontal&&!c.clipped),l);await capture(page,'enlarged-landscape-'+width);evidence.push({enlargedLandscape:{width,height,bounds,state:s,layout:l}});await context.close();}
}
async function nativeFullscreenCheck(browser){
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Chicago'});await routes(context);const page=await context.newPage();listen(page,'native-fullscreen');await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);
 const before=await page.evaluate(()=>({available:document.fullscreenEnabled&&typeof document.querySelector('.globe-wrapper').requestFullscreen==='function',native:/\[native code\]/.test(Function.prototype.toString.call(Element.prototype.requestFullscreen)),overflow:document.body.style.overflow,inert:Array.from(document.querySelectorAll('[inert]')).map(el=>el.id||el.className)}));
 check('native fullscreen uses the real available browser API',before.available&&before.native,before);
 await page.locator('#globe-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('.globe-wrapper'),null,{timeout:5000}).catch(()=>{});
 const entered=await page.evaluate(()=>({native:document.fullscreenElement===document.querySelector('.globe-wrapper'),css:document.querySelector('.globe-wrapper').classList.contains('is-fullscreen'),overflow:document.body.style.overflow,backgroundInert:!!document.querySelector('.post-back').closest('[inert]')}));
 check('native fullscreen entry installs both browser fullscreen and page isolation',entered.native&&entered.css&&entered.overflow==='hidden'&&entered.backgroundInert,entered);await capture(page,'native-fullscreen-entered');
 await page.locator('#globe-container').focus();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('.globe-wrapper').classList.contains('is-fullscreen'),null,{timeout:5000}).catch(()=>{});
 const exited=await page.evaluate(()=>({native:!!document.fullscreenElement,css:document.querySelector('.globe-wrapper').classList.contains('is-fullscreen'),focus:document.activeElement.id,label:document.querySelector('#globe-fullscreen').getAttribute('aria-label'),overflow:document.body.style.overflow,inert:Array.from(document.querySelectorAll('[inert]')).map(el=>el.id||el.className),backgroundInert:!!document.querySelector('.post-back').closest('[inert]')}));
 check('Escape clears both native fullscreen and the wrapper fullscreen class',!exited.native&&!exited.css,exited);
 check('Escape restores launcher focus, page scrolling and prior background isolation',exited.focus==='globe-fullscreen'&&exited.label==='Enter fullscreen'&&exited.overflow===before.overflow&&JSON.stringify(exited.inert)===JSON.stringify(before.inert)&&!exited.backgroundInert,exited);
 await page.evaluate(()=>{const home=document.querySelector('.post-back');home.focus();window.__nativeBackgroundFocus=document.activeElement===home;home.addEventListener('click',function(event){event.preventDefault();window.__nativeBackgroundClick=event.isTrusted;},{once:true});});
 let clicked=false;try{await page.locator('.post-back').click({timeout:5000});clicked=true;}catch{}
 const background=await page.evaluate(()=>({focused:window.__nativeBackgroundFocus,trustedClick:window.__nativeBackgroundClick===true,inert:!!document.querySelector('.post-back').closest('[inert]')}));
 check('background link accepts focus and an ordinary trusted click after Escape',clicked&&background.focused&&background.trustedClick&&!background.inert,background);await capture(page,'native-fullscreen-exited');evidence.push({nativeFullscreen:{before,entered,exited,background}});await context.close();
}
async function mobilePanelsCheck(browser){
 for(const [width,height]of[[320,568],[375,812],[667,375],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,timezoneId:'America/Chicago'});await routes(context);const page=await context.newPage(),name='mobile-'+width;listen(page,name);await page.clock.setFixedTime(new Date(fixedNow));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});await ready(page);await capture(page,name+'-opening');
  for(const mode of['page','fullscreen','fullscreen-200-text','page-200-text']){
   if(mode==='fullscreen'){await page.locator('#globe-fullscreen').click();await page.locator('.globe-foot').evaluate(el=>{el.scrollTop=0;});await page.waitForTimeout(250);const core=await layout(page);check(name+' ordinary fullscreen shows date, time, Live and every tilt choice together',core.controls.every(c=>c.inViewport),core);await capture(page,name+'-fullscreen-controls');}
   if(mode==='fullscreen-200-text')await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
   if(mode==='page-200-text'){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('.globe-wrapper').classList.contains('is-fullscreen'));}
   await page.evaluate(()=>__globePresentation.pin(69.6492,18.9553));await page.locator('.globe-sources').evaluate(el=>{el.open=true;});await page.waitForTimeout(250);
   const fit=await page.evaluate(()=>{
    const foot=document.querySelector('.globe-foot'),fr=foot.getBoundingClientRect(),targets=Array.from(document.querySelectorAll('.globe-wrapper button,.globe-wrapper input,.globe-sources summary')).filter(el=>el.getClientRects().length&&!el.closest('[hidden]')).map(el=>{const r=el.getBoundingClientRect();return {id:el.id||el.className,width:r.width,height:r.height,clipped:el.scrollWidth>el.clientWidth+2,horizontal:r.left>=-1&&r.right<=innerWidth+1};});
    const text=Array.from(foot.querySelectorAll('p,output,h2,dt,dd')).filter(el=>el.getClientRects().length&&!el.closest('[hidden]')&&!el.classList.contains('globe-sr-only')).map(el=>({text:el.textContent.trim().slice(0,75),clipped:el.scrollWidth>el.clientWidth+2,horizontal:el.getBoundingClientRect().left>=fr.left-1&&el.getBoundingClientRect().right<=fr.right+1}));
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,foot:fr.toJSON(),targets,text,canvas:document.querySelector('#globe-container').getBoundingClientRect().toJSON(),space:getComputedStyle(document.querySelector('#globe-container')).backgroundColor};
   });
   check(name+' '+mode+' open Sources and pin panels fit horizontally',!fit.overflow&&fit.targets.every(t=>t.horizontal&&!t.clipped)&&fit.text.every(t=>t.horizontal&&!t.clipped),fit);
   check(name+' '+mode+' control touch targets stay at least 44 pixels',fit.targets.every(t=>t.width>=43.9&&t.height>=43.9),fit.targets);
   check(name+' '+mode+' scene fallback is physically black',fit.space==='rgb(0, 0, 0)',fit.space);
   check(name+' '+mode+' separate tilt controls keep complete outlines',await page.locator('.tilt-btn').evaluateAll(elements=>elements.every(el=>{const s=getComputedStyle(el);return ['Top','Right','Bottom','Left'].every(side=>s['border'+side+'Style']!=='none'&&parseFloat(s['border'+side+'Width'])>0);})));
   if(mode.startsWith('fullscreen'))check(name+' '+mode+' keeps the scene visible beside or above the panels',fit.canvas.height>=120&&fit.canvas.width>=120&&fit.canvas.left>=0&&fit.canvas.right<=width+1&&fit.canvas.top>=0&&fit.canvas.bottom<=height+1,fit.canvas);
   const reachable=[];for(const selector of['#globe-date','#globe-hour','.globe-tilt-options button:last-child','#globe-pin-close','.globe-sources summary','.globe-sources a']){const el=page.locator(selector).last();await el.scrollIntoViewIfNeeded();reachable.push(await el.evaluate(el=>{const r=el.getBoundingClientRect();let good=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;for(let p=el.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();good=good&&r.top>=b.top-1&&r.bottom<=b.bottom+1;}}return {text:el.textContent.trim().slice(0,40),good};}));if(selector==='#globe-pin-close')await capture(page,name+'-'+mode+'-pin');}
   check(name+' '+mode+' every main control, pin close and source link can be revealed',reachable.every(x=>x.good),reachable);await capture(page,name+'-'+mode+'-sources-pin');evidence.push({mobilePanels:{width,height,mode,fit,reachable}});
   if(mode==='fullscreen-200-text'){
    await page.locator('#globe-container').focus();const focused=[];for(let i=0;i<28;i++){await page.keyboard.press('Tab');focused.push(await page.evaluate(()=>{const el=document.activeElement;if(!el.matches('#globe-date,#globe-hour,#globe-return,.tilt-btn,#globe-pin-close,.globe-sources summary'))return null;const r=el.getBoundingClientRect();let good=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;for(let p=el.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();good=good&&r.top>=b.top-1&&r.bottom<=b.bottom+1;}}return {id:el.id||el.dataset.tilt||el.tagName,good};}));}
    const main=focused.filter(Boolean),ids=new Set(main.map(x=>x.id));check(name+' enlarged keyboard focus reveals every main control, pin close and Sources',main.every(x=>x.good)&&['globe-date','globe-hour','globe-return','22.1','current','24.5','45','globe-pin-close','SUMMARY'].every(id=>ids.has(id)),main);evidence.push({mobileKeyboard:{width,height,focused}});
   }
   await page.locator('.globe-sources').evaluate(el=>{el.open=false;});await page.evaluate(()=>__globePresentation.pin(null));
  }
  await context.close();
 }
}
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const startSources=hashes();
 try{
  browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:process.env.HEADFUL!=='1'});
  if(mobileOnly)await mobilePanelsCheck(browser);
  else if(nativeOnly)await nativeFullscreenCheck(browser);
  else{if(!realOnly){if(process.env.TARGETED!=='1'){await matrix(browser,false);await mobilePanelsCheck(browser);}await loadingChecks(browser);await reducedResolutionCheck(browser);await damagedRetryRecoveryCheck(browser);await infraredOnlyCheck(browser);await enlargedLandscapeCheck(browser);await nativeFullscreenCheck(browser);}if(real)await matrix(browser,true);}
  check('no JavaScript, shader or invalid-texture errors',errors.length===0,errors);
 }finally{
  fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify({real,realOnly,nativeOnly,mobileOnly,fixedNow,startSources,endSources:hashes(),checks,evidence,errors,requests},null,2));
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 }
 const failures=checks.filter(c=>!c.pass);if(failures.length)throw new Error(failures.length+' presentation checks failed');console.log(checks.length+' presentation checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
