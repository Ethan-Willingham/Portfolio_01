/* Owns Chrome for Testing or WebKit and an ephemeral HTTP/file fixture.
   Uses real reference maps and GPU pixels, plus controlled location callbacks.
   Weather is blocked here; dated weather is verified by the replay harnesses.
   REAL_ASSETS=1 leaves the four file-view astronomy downloads unmocked. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),mobile=process.env.SAFARI_MOBILE==='1';
const dump=process.env.DUMP||'/tmp/daylight-globe-location';fs.mkdirSync(dump,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'daylight-location-')),checks=[],evidence=[],errors=[];
const point={latitude:37.7749,longitude:-122.4194},now='2026-10-05T20:00:00Z';
function check(name,pass,detail){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name);}
const hooks=`
window.__locationAudit={
 state:function(){return {base:baseState,night:nightState,stars:starCatalog&&starCatalog.count,moon:moonTexture.image.width,
  baseWidth:baseTexture.image.width,nightWidth:nightTexture.image.width,loading:loading,sunFraming:sunFraming,autoSpin:autoSpin,
  target:{lat:90-targetPhi/DEG,lon:((targetTheta/DEG-90)%360+540)%360-180},
  location:wrapper.dataset.location,status:locationStatus.textContent,home:homeLocation};},
 pixel:function(lat,lon,options){
  var oldCamera=camera.position.clone(),oldAim=cameraAim.clone(),oldSun=sunUniform.value.clone(),oldPhotoSun=photoSunUniform.value.clone();
  var uniforms=earthMaterial.uniforms,keys=['photoMap','infraredMap','photoMix','photoEnabled','thermalEnabled','naturalEnabled','denseEnabled'],old=keys.map(function(key){return uniforms[key].value;});
  var objects=[atmosphere,moon,sunBody,sunGlow,starField,pinMarker].concat(auroraMeshes),visible=objects.map(function(o){return o.visible;});
  var vector=math.geographicVector(lat,lon),v=new THREE.Vector3(vector.x,vector.y,vector.z),cloud=solidTexture(options.cloud?255:0,options.cloud?255:0,options.cloud?255:0);
  var target=renderer.getRenderTarget(),w=container.clientWidth,h=container.clientHeight,rt=new THREE.WebGLRenderTarget(w,h),pixel=new Uint8Array(4);
  try{camera.position.copy(v).multiplyScalar(4);camera.lookAt(0,0,0);camera.updateMatrixWorld();sunUniform.value.copy(v).multiplyScalar(options.night?-1:1);photoSunUniform.value.copy(v).negate();
   uniforms.photoMap.value=cloud;uniforms.infraredMap.value=cloud;uniforms.photoMix.value=1;uniforms.photoEnabled.value=options.reference?0:1;
   uniforms.thermalEnabled.value=1;uniforms.naturalEnabled.value=1;uniforms.denseEnabled.value=1;objects.forEach(function(o){o.visible=false;});
   renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,Math.floor(w/2),Math.floor(h/2),1,1,pixel);return Array.from(pixel);
  }finally{keys.forEach(function(key,i){uniforms[key].value=old[i];});objects.forEach(function(o,i){o.visible=visible[i];});sunUniform.value.copy(oldSun);photoSunUniform.value.copy(oldPhotoSun);camera.position.copy(oldCamera);camera.lookAt(oldAim);camera.updateMatrixWorld();renderer.setRenderTarget(target);rt.dispose();cloud.dispose();}
 }
};`;
const source=fs.readFileSync(path.join(root,'js/globe.js'),'utf8'),end=source.lastIndexOf('}());');assert(end>=0);
const instrumented=source.slice(0,end)+hooks+source.slice(end);
fs.writeFileSync(path.join(temporary,'globe.js'),instrumented);
let fileHtml=fs.readFileSync(path.join(root,'daylight-globe.html'),'utf8');
fileHtml=fileHtml.replace('<head>','<head><base href="'+pathToFileURL(root+path.sep).href+'">').replace(/src="js\/globe\.js[^\"]*"/,'src="'+pathToFileURL(path.join(temporary,'globe.js')).href+'"');
fs.writeFileSync(path.join(temporary,'daylight-globe.html'),fileHtml);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{const body=file.endsWith('/js/globe.js')?instrumented:fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}});
let browser;
async function setup(options={}){
 const context=await browser.newContext({viewport:mobile?{width:375,height:812}:{width:1440,height:950},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago',permissions:options.deferred?[]:['geolocation'],geolocation:point});
 const requests=[];context.on('request',r=>requests.push(r.url()));
 await context.route('https://**',async route=>{
  const url=new URL(route.request().url()),asset=url.pathname.match(/\/main\/(assets\/(?:images\/(?:earth|earth-night-2016|moon)\.jpg|data\/stars-hyg-v41\.bin))$/);
  if(asset){if(process.env.REAL_ASSETS==='1')return route.continue();return route.fulfill({contentType:mime[path.extname(asset[1])],headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(root,asset[1]))});}
  return route.fulfill({contentType:'application/json',body:'{}'});
 });
 if(options.deferred)await context.addInitScript(saved=>{
  window.__geoCalls=[];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success,error,settings)=>__geoCalls.push({success,error,settings})}});
  if(saved!==undefined)localStorage.setItem('daylight-globe-location',JSON.stringify(saved));
 },options.saved);
 if(options.badNight)await context.route('**/assets/images/earth-night-2016.jpg',route=>route.fulfill({contentType:'image/jpeg',body:'Corrupt city-light fixture'}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(now));
 await page.goto(options.file?pathToFileURL(path.join(temporary,'daylight-globe.html')).href:'http://127.0.0.1:'+server.address().port+'/daylight-globe.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__locationAudit&&__locationAudit.state().base!=='loading'&&__locationAudit.state().night!=='loading'&&__locationAudit.state().stars===5070,null,{timeout:16000});
 await page.locator('#globe-container').scrollIntoViewIfNeeded();return {context,page,requests};
}
const state=page=>page.evaluate(()=>__locationAudit.state());
const near=(a,b)=>Math.abs(a-b)<.001;
const centered=(s,p)=>near(s.target.lat,p.latitude)&&near(s.target.lon,p.longitude)&&!s.sunFraming&&!s.autoSpin;
async function deliver(page,index,latitude,longitude){await page.evaluate(({index,latitude,longitude})=>__geoCalls[index].success({coords:{latitude,longitude}}),{index,latitude,longitude});}
function controls(page){return page.evaluate(()=>{const buttons=Array.from(document.querySelectorAll('.globe-view-controls button')),rects=buttons.map(b=>b.getBoundingClientRect());
 return {width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:rects.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height,right:r.right})),overlap:rects.some((a,i)=>rects.some((b,j)=>i<j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))};});}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true,args:['--disable-gpu-vsync','--disable-frame-rate-limit']});
 for(const file of [false,true]){
  const start=performance.now(),{context,page,requests}=await setup({file});await page.waitForFunction(()=>__locationAudit.state().location==='ready',null,{timeout:9000});
  const s=await state(page),label=file?'file view':'HTTP view';
  check(label+' decodes terrain, historical lights, Moon and 5070 real stars',s.base==='ready'&&s.night==='ready'&&s.baseWidth>=2048&&s.nightWidth>=2048&&s.moon>1&&s.stars===5070,s);
  check(label+' opens at the browser-granted device location',centered(s,point),s.target);
  check(label+' settles astronomy and location within 20 seconds',performance.now()-start<20000,performance.now()-start);
  check(label+' makes no weather or astronomy request with the device coordinates',!requests.some(url=>url.includes(String(point.latitude))||url.includes(String(point.longitude))),requests.length);
  const land=await page.evaluate(()=>__locationAudit.pixel(38,-99,{reference:true})),sea=await page.evaluate(()=>__locationAudit.pixel(0,-140,{reference:true}));
  check(label+' GPU shows distinct land and blue ocean rather than a flat placeholder',sea[2]>sea[0]+25&&land.some((v,i)=>i<3&&Math.abs(v-sea[i])>30),{land,sea});
  const city=await page.evaluate(()=>__locationAudit.pixel(35.68,139.76,{night:true})),cloudyCity=await page.evaluate(()=>__locationAudit.pixel(35.68,139.76,{night:true,cloud:true})),cloudySea=await page.evaluate(()=>__locationAudit.pixel(0,-140,{night:true,cloud:true})),darkSea=await page.evaluate(()=>__locationAudit.pixel(0,-140,{night:true}));
  check(label+' real Tokyo lights remain visible through night clouds',city.slice(0,3).reduce((a,b)=>a+b)>80&&cloudyCity.slice(0,3).reduce((a,b)=>a+b)>cloudySea.slice(0,3).reduce((a,b)=>a+b)+20&&cloudyCity.slice(0,3).reduce((a,b)=>a+b)<city.slice(0,3).reduce((a,b)=>a+b),{city,cloudyCity,cloudySea});
  check(label+' night clouds are visible over an otherwise dark ocean',cloudySea[2]>darkSea[2]+12&&cloudySea.slice(0,3).reduce((sum,value,i)=>sum+value-darkSea[i],0)>30,{cloudySea,darkSea});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('daylight-globe-location')));
  check(label+' remembers only a rounded on-device position',saved.lat===37.8&&saved.lon===-122.4&&Object.keys(saved).length===3,saved);
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');const layout=await controls(page);
  check(label+' enlarged controls retain 44px targets without overlap or horizontal overflow',!layout.overlap&&layout.scroll<=layout.width&&layout.buttons.every(r=>r.width>=44&&r.height>=44&&r.x>=0&&r.right<=layout.width),layout);
  evidence.push({label,state:s,land,sea,city,cloudyCity,cloudySea,layout});await context.close();
 }
 const cached={lat:-33.9,lon:151.2,savedAt:Date.parse(now)-60000};
 {const {context,page}=await setup({deferred:true,saved:cached}),initial=await state(page);
  check('a remembered location centers immediately while a fresh device fix is pending',centered(initial,{latitude:cached.lat,longitude:cached.lon}),initial);
  await deliver(page,0,point.latitude,point.longitude);const current=await state(page);
  check('a new visit refreshes a remembered location after travel',centered(current,point),current);
  check('location requests use bounded low-power acquisition and a five-minute cache',await page.evaluate(()=>__geoCalls[0].settings.timeout===8000&&__geoCalls[0].settings.maximumAge===300000&&!__geoCalls[0].settings.enableHighAccuracy));await context.close();}
 for(const action of ['keyboard','drag','wheel','sun']){const {context,page}=await setup({deferred:true});
  if(action==='keyboard'){await page.locator('#globe-container').focus();await page.keyboard.press('ArrowRight');}
  if(action==='drag'){await page.waitForFunction(()=>!__locationAudit.state().loading,null,{timeout:30000});const r=await page.locator('#globe-container canvas').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+40,r.y+r.height/2+10,{steps:4});await page.mouse.up();}
  if(action==='wheel')await page.locator('#globe-container canvas').dispatchEvent('wheel',{deltaY:100});
  if(action==='sun')await page.locator('#globe-sun').click();
  const before=await state(page);await deliver(page,0,point.latitude,point.longitude);const after=await state(page);
  check('a late location response preserves the reader\'s '+action+' view',near(before.target.lat,after.target.lat)&&near(before.target.lon,after.target.lon)&&before.sunFraming===after.sunFraming,{before:before.target,after:after.target});
  await page.locator('#globe-location').click();await deliver(page,1,point.latitude,point.longitude);
  check('My location returns home after '+action,centered(await state(page),point));await context.close();}
 {const {context,page}=await setup({deferred:true,saved:cached});await page.evaluate(()=>__geoCalls[0].error({code:1}));
  check('denied permission explains the missing location and clears its saved position',await page.evaluate(()=>__locationAudit.state().location==='blocked'&&!document.getElementById('globe-location-status').hidden&&!localStorage.getItem('daylight-globe-location')));
  await page.locator('#globe-location').click();await deliver(page,1,point.latitude,point.longitude);await deliver(page,0,0,0);
  check('an old request cannot overwrite a successful retry',centered(await state(page),point));await context.close();}
 for(const saved of [{...cached,savedAt:Date.parse(now)+1000},{...cached,savedAt:Date.parse(now)-31*86400000},{...cached,lat:100},{...cached,lon:'151.2'}]){const {context,page}=await setup({deferred:true,saved});
  check('invalid, future or expired remembered coordinates cannot control the opening',centered(await state(page),{latitude:20,longitude:0}),saved);await context.close();}
 {const {context,page}=await setup({badNight:true});check('a failed city-light texture is disclosed in Sources',await page.evaluate(()=>__locationAudit.state().night==='unavailable'&&document.getElementById('globe-data').textContent.includes('City-light map unavailable.')));await context.close();}
 check('location and local-file rendering cause no JavaScript errors',errors.length===0,errors);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temporary,{recursive:true,force:true});fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify({engine:mobile?'WebKit':'Chrome',checks,evidence,errors},null,2));}
 const failed=checks.filter(c=>!c.pass);console.log(checks.length+' checks, '+failed.length+' failures. Evidence: '+dump);if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
