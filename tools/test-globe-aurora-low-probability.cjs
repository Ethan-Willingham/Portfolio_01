/* The actual October 8 forecast was weak, but the renderer must not erase it.
   Read original NOAA probabilities through the uploaded texture and the GPU. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..'),D=require('../js/globe-data.js');
const folder=path.join(__dirname,'fixtures/daylight/aurora-oct8-gap'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),frames=D.parseAuroraManifest(manifest);
const values=frames.map(frame=>{const bytes=fs.readFileSync(path.join(folder,frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);return JSON.parse(zlib.gunzipSync(bytes));});
const original=values.map(value=>D.parseAuroraArchive(value));
const dump=process.env.DUMP||'/tmp/earth-now-aurora-v50/low-probability';fs.mkdirSync(dump,{recursive:true});
const hook=`
window.__auroraLow={
 seed:function(manifest,values){if(archiveController)archiveController.abort();if(replayController)replayController.abort();archiveGeneration++;archiveBusy=false;
  archiveFrames=data.parseAuroraManifest(manifest);sessionFrames=[];archiveCache.clear();archiveChecked=Date.now();values.forEach(function(value,i){cacheArchive(archiveFrames[i].file,data.parseAuroraArchive(value));});
  sharedManifest=null;cloudCatalog=null;refreshPhoto=async function(){};refreshWeather=async function(){};refreshData=function(){};warmDayTimeline=function(){};
  loading=false;container.classList.remove('is-loading');container.classList.add('is-ready');explore.querySelectorAll('input,button').forEach(function(c){c.disabled=false;});returnButton.disabled=false;
 },
 at:function(iso,raw){live=false;instant=new Date(iso);recentEnd=new Date('2026-10-09T12:00Z');tilt=undefined;applyCachedTime();if(raw)setForecast(archiveCache.get(data.auroraFrameAt(allAuroraFrames(),instant).file));updateAstronomy();updateLabels();syncInputs();},
 raw:function(index){setForecast(archiveCache.get(archiveFrames[index].file));},
 texture:function(){return Array.from(auroraTexture.image.data);},
 state:function(){return {instant:instant.toISOString(),observation:forecast&&forecast.observation.toISOString(),forecast:forecast&&forecast.forecast.toISOString(),pending:replayPendingAurora,visible:auroraMeshes.every(function(m){return m.visible;}),note:byId('globe-aurora-status').textContent,noteHidden:byId('globe-aurora-status').hidden,display:auroraDisplayGrid.reduce(function(s,v){return s+v;},0),weights:auroraDisplay.map(function(p){return {observation:p.value.observation.toISOString(),weight:p.weight};}),pin:forecast&&data.auroraAt(forecast,68,0),texture:auroraTexture.uuid,geometry:auroraMeshes.map(function(m){return m.geometry.uuid;})};},
 evict:function(file){archiveCache.delete(file);},fetch:function(){return refreshArchive();},
 glow:function(latitude,longitude,capture){var v=math.geographicVector(latitude===undefined?65:latitude,longitude===undefined?60:longitude),oldPosition=camera.position.clone(),oldUp=camera.up.clone(),aspect=camera.aspect,fov=camera.fov,oldTarget=renderer.getRenderTarget(),rt=new THREE.WebGLRenderTarget(512,512);
  var items=[atmosphere,moon,sunBody,sunGlow,starField,pinMarker],visible=items.map(function(m){return m.visible;}),shown=auroraMeshes.map(function(m){return m.visible;}),ticks=auroraMeshes.map(function(m){return m.material.uniforms.tick.value;});
  var base=new Uint8Array(512*512*4),lit=new Uint8Array(base.length);
  try{items.forEach(function(m){m.visible=false;});auroraMeshes.forEach(function(m){m.material.uniforms.tick.value=0;});camera.position.set(v.x*3.2,v.y*3.2,v.z*3.2);camera.up.set(0,1,0);camera.aspect=1;camera.fov=58;camera.updateProjectionMatrix();camera.lookAt(0,0,0);camera.updateMatrixWorld();renderer.setRenderTarget(rt);
   auroraMeshes.forEach(function(m){m.visible=false;});renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,512,512,base);
   auroraMeshes.forEach(function(m){m.visible=hasForecast();});renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,512,512,lit);
   var energy=0,pixels=0;for(var i=1;i<base.length;i+=4){var gain=Math.max(0,lit[i]-base[i]);energy+=gain;if(gain>=3)pixels++;}return {energy:energy,pixels:pixels,maximum:lit.reduce(function(m,v,i){return i%4===1?Math.max(m,v-base[i]):m;},0),image:capture?Array.from(lit):undefined};
  }finally{items.forEach(function(m,i){m.visible=visible[i];});auroraMeshes.forEach(function(m,i){m.visible=shown[i];m.material.uniforms.tick.value=ticks[i];});camera.position.copy(oldPosition);camera.up.copy(oldUp);camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();camera.lookAt(cameraAim);renderer.setRenderTarget(oldTarget);rt.dispose();}
 }
};
`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.gz':'application/gzip','.bin':'application/octet-stream','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));let bytes=fs.readFileSync(file);if(file===path.join(root,'js/globe.js'))bytes=Buffer.from(bytes.toString().replace(/\}\(\)\);\s*$/,hook+'\n}());'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
(async()=>{let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 const mobile=process.env.SAFARI_MOBILE==='1';browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Users/ethan/.local/bin/agent-chrome-for-testing':chromium.executablePath()),headless:true});
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text());});
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();const frame=frames.find(f=>url.pathname.endsWith('/'+f.file));return frame?route.fulfill({contentType:'application/gzip',body:fs.readFileSync(path.join(folder,frame.file))}):route.abort();});
 await page.clock.setFixedTime(new Date('2026-10-09T12:00Z'));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__auroraLow);await page.evaluate(({manifest,values})=>__auroraLow.seed(manifest,values),{manifest,values});
 const views=[{name:'North Atlantic',lat:50,lon:-40},{name:'North America',lat:45,lon:-100}];
 const times=['2026-10-09T00:00Z','2026-10-09T00:54Z','2026-10-09T01:14Z','2026-10-09T01:59Z','2026-10-09T02:14Z','2026-10-09T02:15Z','2026-10-09T02:18Z'];
 const samples=await page.evaluate(({views,times})=>times.map(iso=>{__auroraLow.at(iso);return {...__auroraLow.state(),views:views.map(view=>({...view,...__auroraLow.glow(view.lat,view.lon)}))};}),{views,times});
 const comparison=await page.evaluate(views=>[0,1].map(index=>{__auroraLow.at('2026-10-09T02:35Z');__auroraLow.raw(index);return {...__auroraLow.state(),texture:__auroraLow.texture(),views:views.map(view=>({...view,...__auroraLow.glow(view.lat,view.lon)}))};}),views);
 const precision=comparison.map((sample,index)=>{const grid=original[index].grid;let maximumError=0,suppressed=0,positive=0,sourceNorth=0,displayNorth=0,zeroLit=0;
  for(let y=0;y<181;y++)for(let x=1;x<=360;x++){const p=grid[y*360+(x+539)%360],byte=sample.texture[(y*362+x)*4];maximumError=Math.max(maximumError,Math.abs(byte/255*100-p));if(p>0){positive++;if(byte===0)suppressed++;}else if(byte)zeroLit++;if(y>140){sourceNorth+=p;displayNorth+=byte/255*100;}}
  delete sample.texture;return {maximumError,suppressed,positive,zeroLit,sourceNorth,displayNorth};});
 fs.writeFileSync(path.join(dump,mobile?'mobile.json':'desktop.json'),JSON.stringify({samples,comparison,precision,errors},null,2));
 for(const p of precision){assert(p.maximumError<=100/510+1e-6,'Uploaded probabilities retain source values within half of one texture byte');assert.equal(p.suppressed,0,'No positive NOAA cell is silently discarded');assert.equal(p.zeroLit,0,'Zero-probability cells never gain a forecast');}
 for(const sample of samples){assert(sample.visible);assert.equal(sample.observation,frames[+(sample.instant>='2026-10-09T02:18:00.000Z')].observation.toISOString(),'The selected grid retains its actual observation time');for(const view of sample.views){assert(view.pixels>100,'Weak forecast is visibly present in '+view.name+' at '+sample.instant);assert(view.maximum>=8,'Weak forecast has discernible contrast rather than only nonzero hidden pixels');}}
 for(let i=0;i<views.length;i++){assert(comparison[1].views[i].energy>comparison[0].views[i].energy,'The genuinely stronger forecast remains stronger');assert(comparison[1].views[i].energy<comparison[0].views[i].energy*5,'The display does not turn a modest probability increase into apparent absence');}
 assert.equal(samples[4].pin,D.auroraAt(original[0],68,0),'Pins keep the original forecast probability');assert.deepEqual(errors,[]);
 const pictures=await page.evaluate(()=>[0,1].map(index=>{__auroraLow.at('2026-10-09T02:35Z');__auroraLow.raw(index);return __auroraLow.glow(50,-40,true).image;}));
 for(let i=0;i<pictures.length;i++)await require('sharp')(Buffer.from(pictures[i]),{raw:{width:512,height:512,channels:4}}).flip().png().toFile(path.join(dump,(mobile?'mobile-':'desktop-')+(i?'stronger':'weak')+'.png'));
 console.log('PASS '+(mobile?'mobile WebKit':'desktop Chrome')+' actual weak NOAA forecast at 7:00, 7:54, 8:14, 8:59, 9:14, 9:15 and 9:18 PM: intact probabilities and visible North Atlantic/North American glow');await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
