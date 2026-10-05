/* NODE_PATH=/path/to/node_modules node tools/test-globe-sun.cjs
   Local-server-only private hooks audit the real renderer. Earth crossings
   move the actual camera; Moon crossings inject explicitly synthetic geometry.
   Owns Chrome for Testing and closes that exact browser in finally. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const dump=process.env.DUMP||'/tmp/daylight-globe-sun-qa';
fs.mkdirSync(dump,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.bin':'application/octet-stream','.json':'application/json'};
const hooks=`
window.__sunAudit={
 state:()=>{const p=sunBody.position.clone().project(camera),earthP=earth.position.clone().project(camera);return {
   camera:camera.position.toArray(),aim:cameraAim.toArray(),sun:sunBody.position.toArray(),sunDirection:sunUniform.value.toArray(),solarRadius,
   projected:p.toArray(),earthProjected:earthP.toArray(),fov:camera.fov,aspect:camera.aspect,width:container.clientWidth,height:container.clientHeight,
   flux:sunView.fluxFraction,area:sunView.visibleFraction,glow: sunGlow.visible,glowFlux:sunGlow.material.uniforms.flux.value,
   coreDepth:sunBody.material.depthTest,coreVisible:sunBody.visible,haloDepth:sunGlow.material.depthTest,moonSide:moonMaterial.side,cameraMoonDistance:camera.position.distanceTo(moon.position),loading,stars:starCatalog&&starCatalog.count,
   framePending:frameRequest!==null,theta,phi,radius,targetTheta,targetPhi,targetRadius,
   bearingError:optics.angleBetween(sunBody.position.clone().sub(camera.position),sunUniform.value),
   solarSnapshot:math.solar(instant,tilt),syntheticMoon:!!window.__sunMoonOverride};},
 freeze:value=>{live=false;instant=new Date(value||'2026-10-05T00:05:00Z');updateAstronomy();updateLabels();syncInputs();autoSpin=false;},
 earthContact:offset=>{window.__sunMoonOverride=null;moon.visible=false;const delta=Math.asin(1/4)+offset*.535*DEG/2,s=sunUniform.value.clone(),axis=new THREE.Vector3(0,1,0).cross(s).normalize();const observer=s.negate().multiplyScalar(Math.cos(delta)).addScaledVector(axis,Math.sin(delta));targetTheta=theta=Math.atan2(observer.x,observer.z);targetPhi=phi=Math.acos(observer.y);targetRadius=radius=4;aimShift=0;sunFraming=false;autoSpin=false;},
 moonContact:offset=>{moon.visible=true;const delta=Math.asin(.273/5.5)+offset*.535*DEG/2,s=sunUniform.value.clone(),axis=new THREE.Vector3(0,1,0).cross(s).normalize();const direction=s.multiplyScalar(Math.cos(delta)).addScaledVector(axis,Math.sin(delta));window.__sunMoonOverride=camera.position.clone().addScaledVector(direction,5.5);},
 restore:()=>{window.__sunMoonOverride=null;window.__sunAuditAimSolar=false;updateAstronomy();frameSun();theta=targetTheta;phi=targetPhi;radius=targetRadius;},
 insideDisplayedMoon:offset=>{window.__sunMoonOverride=null;updateAstronomy();moon.visible=true;const center=moon.position.clone().addScaledVector(sunUniform.value,offset||0);targetTheta=theta=Math.atan2(center.x,center.z);targetPhi=phi=Math.acos(center.y/center.length());targetRadius=radius=center.length();autoSpin=false;sunFraming=false;aimShift=0;window.__sunAuditAimSolar=true;},
 wideLayout:on=>{wrapper.classList.toggle('is-fullscreen',on);resize();},
 diskBounds:()=>{
   const disk=(mesh,r)=>{const direction=mesh.position.clone().sub(camera.position),distance=direction.length(),angle=Math.asin(r/distance);direction.normalize();const first=new THREE.Vector3(Math.abs(direction.y)<.9?0:1,Math.abs(direction.y)<.9?1:0,0).cross(direction).normalize(),second=direction.clone().cross(first);const bounds={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};
     for(let i=0;i<128;i++){const azimuth=i*Math.PI*2/128,ray=direction.clone().multiplyScalar(Math.cos(angle)).addScaledVector(first,Math.sin(angle)*Math.cos(azimuth)).addScaledVector(second,Math.sin(angle)*Math.sin(azimuth));const p=camera.position.clone().addScaledVector(ray,10).project(camera);bounds.left=Math.min(bounds.left,p.x);bounds.right=Math.max(bounds.right,p.x);bounds.bottom=Math.min(bounds.bottom,p.y);bounds.top=Math.max(bounds.top,p.y);}return bounds;};
   return {earth:disk(earth,1),sun:disk(sunBody,solarRadius)};
 },
 orbit:(lat,lon,r)=>{window.__sunMoonOverride=null;moon.visible=false;sunFraming=false;autoSpin=false;targetTheta=theta=Math.PI/2+lon*DEG;targetPhi=phi=Math.PI/2-lat*DEG;targetRadius=radius=r;aimShift=0;},
 measure:()=>{
   const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,p=sunBody.position.clone().project(camera);
   const centerX=Math.round((p.x+1)*w/2),centerY=Math.round((p.y+1)*h/2),size=64,left=Math.max(0,Math.min(w-size,centerX-size/2)),bottom=Math.max(0,Math.min(h-size,centerY-size/2));
   const coreBefore=sunBody.visible,glowBefore=sunGlow.visible;
   const read=()=>{renderer.render(scene,camera);const pixels=new Uint8Array(size*size*4);gl.readPixels(left,bottom,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   sunBody.visible=false;sunGlow.visible=false;const baseline=read();sunBody.visible=coreBefore;const core=read();sunBody.visible=false;sunGlow.visible=glowBefore;const halo=read();
   sunBody.visible=coreBefore;sunGlow.visible=glowBefore;renderer.render(scene,camera);
   let energy=0,lit=0,haloEnergy=0,haloLit=0;
   for(let i=0;i<core.length;i+=4){let gain=0,haloGain=0;for(let j=0;j<3;j++){gain+=Math.max(0,core[i+j]-baseline[i+j]);haloGain+=Math.max(0,halo[i+j]-baseline[i+j]);}energy+=gain;haloEnergy+=haloGain;if(gain>20)lit++;if(haloGain>3)haloLit++;}
   const index=((centerY-bottom)*size+centerX-left)*4;
   const ndc=new THREE.Vector2(p.x,p.y),testRay=new THREE.Raycaster();testRay.setFromCamera(ndc,camera);
   const bodies=[earth];if(moon.visible)bodies.push(moon);const hits=testRay.intersectObjects(bodies);
   return {coreEnergy:energy,corePixels:lit,haloEnergy,haloPixels:haloLit,centerBaseline:Array.from(baseline.slice(index,index+3)),centerCore:Array.from(core.slice(index,index+3)),centerHalo:Array.from(halo.slice(index,index+3)),centerForeground:hits.length?hits[0].object===earth?'Earth':'Moon':null,roi:{left,bottom,size,centerX,centerY},buffer:{w,h}};
 }
};
`;
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{
   let content=fs.readFileSync(file);
   if(file.endsWith('/js/globe.js')){
     let source=content.toString();assert(source.includes('var occluders=[{center:earth.position'),'fixture insertion point exists');
     source=source.replace('var occluders=[{center:earth.position','if(window.__sunMoonOverride)moon.position.copy(window.__sunMoonOverride);var occluders=[{center:earth.position');
     assert(source.includes('cameraAim.copy(camera.position)'),'camera aim fixture insertion exists');
     source=source.replace('cameraAim.copy(camera.position)','if(window.__sunAuditAimSolar)aimDirection.copy(sunUniform.value);cameraAim.copy(camera.position)');
     const end=source.lastIndexOf('}());');assert(end>=0);source=source.slice(0,end)+hooks+source.slice(end);content=Buffer.from(source);
   }
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(content);
 }catch(error){res.writeHead(404).end(error.message);}
});
const interiorOnly=process.env.SUN_INTERIOR_ONLY==='1';
const evidenceFile=interiorOnly?'sun-interior-regression-evidence.json':'sun-optics-browser-evidence.json';
let browser;const evidence={mode:'Local reference Earth and real HYG stars; external services blocked to isolate optics.',interiorOnly,checks:[],initial:[],earth:[],moon:[],orbit:[],input:[],wide:[],insideMoonCases:[],errors:[]};
function check(name,value){assert(value,name);evidence.checks.push(name);console.log('PASS '+name);}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function snapshot(page){await settle(page);return page.evaluate(()=>({state:__sunAudit.state(),pixels:__sunAudit.measure()}));}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true,args:['--disable-gpu-vsync','--disable-frame-rate-limit']});
   const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,timezoneId:'America/Chicago'});
   await context.addInitScript(()=>{const fetchOriginal=window.fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('https://')?Promise.reject(new TypeError('External services blocked for optics fixture')):fetchOriginal(url,options);});
   const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
   await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');
   await page.waitForFunction(()=>window.__sunAudit&&!__sunAudit.state().loading,null,{timeout:30000});
   await page.evaluate(()=>__sunAudit.freeze());await page.locator('#globe-sun').click();await page.waitForTimeout(700);
   if(!interiorOnly){
   for(const width of [1440,375]){
     await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
     const sample=await snapshot(page);sample.width=width;evidence.initial.push(sample);
     check(width+' opening projects the Sun inside the actual frustum',Math.abs(sample.state.projected[0])<1&&Math.abs(sample.state.projected[1])<1&&sample.state.projected[2]<1);
     check(width+' opening contains measured bright solar disk pixels',sample.pixels.coreEnergy>100&&sample.pixels.corePixels>=2);
     check(width+' opening has a complete Earth disk horizontal fit',Math.abs(sample.state.earthProjected[0])+sample.state.width/(Math.sqrt(sample.state.radius**2-1)*Math.tan(sample.state.fov*Math.PI/360)*sample.state.aspect)/sample.state.width<1.01);
     await page.locator('.globe-wrapper').screenshot({path:path.join(dump,'sun-opening-'+width+'.png')});
   }
   await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(200);
   for(const offset of [-1.05,-.85,-.5,0,.5,.85,1.05]){
     await page.evaluate(offset=>__sunAudit.earthContact(offset),offset);const sample=await snapshot(page);sample.offset=offset;evidence.earth.push(sample);
     check('Earth offset '+offset+' glare uniform has current-frame flux',sample.state.flux===sample.state.glowFlux);
     check('Earth offset '+offset+' core uses GPU depth',sample.state.coreDepth);
     if(offset<0)check('Earth offset '+offset+' core is absent over its opaque foreground pixel',sample.pixels.centerCore.every((value,index)=>value===sample.pixels.centerBaseline[index]));
     if(Math.abs(offset)<=.5)await page.locator('#globe-container').screenshot({path:path.join(dump,'sun-earth-'+String(offset).replace('-','minus')+'.png')});
   }
   const earthFull=evidence.earth[0],earthClear=evidence.earth.at(-1);
   check('Earth full coverage has zero photosphere and direct bloom pixels',earthFull.state.flux===0&&!earthFull.state.glow&&earthFull.pixels.coreEnergy===0&&earthFull.pixels.haloEnergy===0);
   check('Earth last contact recovers visible photosphere and bloom',earthClear.state.flux===1&&earthClear.pixels.coreEnergy>100&&earthClear.pixels.haloEnergy>100);
   for(let i=1;i<evidence.earth.length;i++)check('Earth crossing '+i+' has monotonic light recovery',evidence.earth[i].state.flux>=evidence.earth[i-1].state.flux&&evidence.earth[i].pixels.coreEnergy>=evidence.earth[i-1].pixels.coreEnergy-400);
   await page.evaluate(()=>__sunAudit.restore());await page.waitForTimeout(500);
   for(const offset of [-1.05,-.85,-.5,0,.5,.85,1.05]){
     await page.evaluate(offset=>__sunAudit.moonContact(offset),offset);const sample=await snapshot(page);sample.offset=offset;sample.synthetic=true;evidence.moon.push(sample);
     check('Synthetic Moon offset '+offset+' glare uniform has current-frame flux',sample.state.flux===sample.state.glowFlux);
     if(offset<0)check('Synthetic Moon offset '+offset+' core is absent over its opaque foreground pixel',sample.pixels.centerCore.every((value,index)=>value===sample.pixels.centerBaseline[index]));
     if(Math.abs(offset)<=.5)await page.locator('#globe-container').screenshot({path:path.join(dump,'sun-synthetic-moon-'+String(offset).replace('-','minus')+'.png')});
   }
   const moonFull=evidence.moon[0],moonClear=evidence.moon.at(-1);
   check('Synthetic Moon total coverage has zero photosphere and direct bloom pixels',moonFull.state.flux===0&&!moonFull.state.glow&&moonFull.pixels.coreEnergy===0&&moonFull.pixels.haloEnergy===0);
   check('Synthetic Moon clears the photosphere with visible disk pixels',moonClear.state.flux===1&&moonClear.pixels.coreEnergy>100);
   for(const view of [[0,0,1.5],[35,80,4],[-45,-135,10],[85,170,3]]){
     await page.evaluate(([lat,lon,r])=>__sunAudit.orbit(lat,lon,r),view);await settle(page);const state=await page.evaluate(()=>__sunAudit.state());evidence.orbit.push({view,state});
     check('Orbit '+view.join('/')+' preserves calculated Sun direction',state.bearingError<1e-12);
   }
   await page.evaluate(()=>__sunAudit.earthContact(-1.05));await settle(page);await page.locator('#globe-container').focus();
   await page.keyboard.press('ArrowLeft');
   for(let i=0;i<8;i++){await page.waitForTimeout(25);const state=await page.evaluate(()=>__sunAudit.state());evidence.input.push(state);check('Keyboard frame '+i+' has no stale bloom flux',state.flux===state.glowFlux&&(state.flux>0||!state.glow));}
   check('Keyboard rotation advances actual camera after full coverage',evidence.input.some(state=>state.flux>0));
   await page.evaluate(()=>__sunAudit.earthContact(1.05));await settle(page);await page.keyboard.press('ArrowRight');
   const incoming=[];
   for(let i=0;i<8;i++){await page.waitForTimeout(25);const state=await page.evaluate(()=>__sunAudit.state());incoming.push(state);check('Incoming keyboard frame '+i+' removes bloom when fully covered',state.flux===state.glowFlux&&(state.flux>0||!state.glow));}
   evidence.inputIncoming=incoming;
   check('Keyboard motion into full coverage removes direct glare',incoming.some(state=>state.flux===0&&!state.glow));
   await page.evaluate(()=>__sunAudit.restore());await page.waitForTimeout(400);
   await page.locator('.globe-wrapper').screenshot({path:path.join(dump,'sun-opening-refreshed.png')});
   }
   for(const offset of [0,.20,.272]){
     await page.evaluate(offset=>__sunAudit.insideDisplayedMoon(offset),offset);const interior=await snapshot(page);interior.displayGeometryOnly=true;interior.offsetTowardSun=offset;evidence.insideMoonCases.push(interior);
     const label='Displayed Moon interior offset '+offset;
     check(label+' actually aims at the solar disk',Math.abs(interior.state.cameraMoonDistance-offset)<1e-8&&Math.abs(interior.state.projected[0])<1e-8&&Math.abs(interior.state.projected[1])<1e-8);
     check(label+' production core visibility follows zero numeric coverage',interior.state.flux===0&&interior.state.area===0&&!interior.state.coreVisible);
     check(label+' has zero actual solar core contribution',interior.pixels.coreEnergy===0&&interior.pixels.corePixels===0);
     check(label+' has zero direct bloom contribution',!interior.state.glow&&interior.state.glowFlux===0&&interior.pixels.haloEnergy===0);
     await page.locator('#globe-container').screenshot({path:path.join(dump,'sun-inside-displayed-moon-offset-'+String(offset).replace('.','p')+'.png')});
   }
   evidence.insideMoon=evidence.insideMoonCases[0];
   if(!interiorOnly){
   for(const instant of ['2026-06-21T12:00:00Z','2026-12-21T12:00:00Z'])for(const height of [720,1080]){
     await page.setViewportSize({width:2560,height});await page.evaluate(instant=>{__sunAudit.freeze(instant);__sunAudit.restore();__sunAudit.wideLayout(true);},instant);await page.waitForTimeout(450);
     const sample=await snapshot(page);sample.viewport={width:2560,height};sample.instant=instant;sample.bounds=await page.evaluate(()=>__sunAudit.diskBounds());evidence.wide.push(sample);
     const label=instant.slice(0,10)+' 2560x'+height;
     check(label+' fullscreen uses the wide viewport and keeps the vertical field floor',sample.state.width>2000&&sample.state.height>=height-2&&sample.state.fov>=42);
     check(label+' opening contains actual Sun pixels',sample.pixels.coreEnergy>100&&sample.pixels.corePixels>=2);
     check(label+' entire Earth and solar disks fit in both dimensions',Object.values(sample.bounds).every(bounds=>bounds.left>-1&&bounds.right<1&&bounds.bottom>-1&&bounds.top<1));
     await page.locator('.globe-wrapper').screenshot({path:path.join(dump,'sun-solstice-'+instant.slice(0,10)+'-2560x'+height+'.png')});
   }
   await page.evaluate(()=>__sunAudit.wideLayout(false));
   }
   check('Optics audit has no browser JavaScript or console errors',evidence.errors.length===0);
   fs.writeFileSync(path.join(dump,evidenceFile),JSON.stringify(evidence,null,2));
   console.log('Saved '+evidence.checks.length+' checks and screenshots to '+dump);
   await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{fs.writeFileSync(path.join(dump,evidenceFile),JSON.stringify(evidence,null,2));console.error(error);process.exitCode=1;});
