/* Original NOAA grids around the reported October 8, 9:23 PM CDT change.
   A three-hour recording gap must be visible in the UI, never a hidden layer. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..'),D=require('../js/globe-data.js');
const folder=path.join(__dirname,'fixtures/daylight/aurora-oct8-gap'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),frames=D.parseAuroraManifest(manifest);
const values=frames.map(frame=>{const bytes=fs.readFileSync(path.join(folder,frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);return JSON.parse(zlib.gunzipSync(bytes));});
const original=values.map(value=>D.parseAuroraArchive(value));
assert.equal(+frames[1].observation- +frames[0].observation,189*60000,'The actual archive missed 3h 9m of observations');
assert.equal(D.auroraReplayGap(frames,new Date('2026-10-09T00:25Z')),null,'A forecast is not missing merely because its input measurements precede the forecast target');
for(const iso of ['2026-10-09T01:00Z','2026-10-09T02:18Z','2026-10-09T02:23Z']){const gap=D.auroraReplayGap(frames,new Date(iso));assert.equal(gap.from.toISOString(),frames[0].observation.toISOString());assert.equal(gap.to.toISOString(),frames[1].observation.toISOString());}
assert.equal(D.auroraReplayGap(frames,new Date('2026-10-09T02:28Z')),null,'The gap note ends when the new recorded grid finishes fading in');
assert.equal(D.auroraReplayGap([],new Date('2026-10-09T02:23Z')),null);
const origin=+new Date('2026-10-08T00:00Z'),irregular=[[0,20],[30,130],[70,150]].map(([observation,forecast])=>({observation:new Date(origin+observation*60000),forecast:new Date(origin+forecast*60000)}));
for(const minute of [60,88,90,94])assert.equal(D.auroraReplayGap(irregular,new Date(origin+minute*60000)),null,'Changed forecast lead does not turn skipped selections into missing recordings');
const dump=process.env.DUMP||'/tmp/earth-now-aurora-v49/regression';fs.mkdirSync(dump,{recursive:true});
const hook=`
window.__auroraTransition={
 seed:function(manifest,values){if(archiveController)archiveController.abort();if(replayController)replayController.abort();archiveGeneration++;archiveBusy=false;
  archiveFrames=data.parseAuroraManifest(manifest);sessionFrames=[];archiveCache.clear();archiveChecked=Date.now();values.forEach(function(value,i){cacheArchive(archiveFrames[i].file,data.parseAuroraArchive(value));});
  sharedManifest=null;cloudCatalog=null;refreshPhoto=async function(){};refreshWeather=async function(){};refreshData=function(){};warmDayTimeline=function(){};
  loading=false;container.classList.remove('is-loading');container.classList.add('is-ready');explore.querySelectorAll('input,button').forEach(function(c){c.disabled=false;});returnButton.disabled=false;
 },
 at:function(iso,raw){live=false;instant=new Date(iso);recentEnd=new Date('2026-10-09T12:00Z');tilt=undefined;applyCachedTime();if(raw)setForecast(archiveCache.get(data.auroraFrameAt(allAuroraFrames(),instant).file));updateAstronomy();updateLabels();syncInputs();},
 state:function(){return {instant:instant.toISOString(),observation:forecast&&forecast.observation.toISOString(),forecast:forecast&&forecast.forecast.toISOString(),pending:replayPendingAurora,visible:auroraMeshes.every(function(m){return m.visible;}),note:byId('globe-aurora-status').textContent,noteHidden:byId('globe-aurora-status').hidden,display:auroraDisplayGrid.reduce(function(s,v){return s+v;},0),weights:auroraDisplay.map(function(p){return {observation:p.value.observation.toISOString(),weight:p.weight};}),pin:forecast&&data.auroraAt(forecast,68,0),texture:auroraTexture.uuid,geometry:auroraMeshes.map(function(m){return m.geometry.uuid;})};},
 evict:function(file){archiveCache.delete(file);},fetch:function(){return refreshArchive();},
 glow:function(latitude,longitude){var v=math.geographicVector(latitude===undefined?65:latitude,longitude===undefined?60:longitude),oldPosition=camera.position.clone(),oldUp=camera.up.clone(),aspect=camera.aspect,fov=camera.fov,oldTarget=renderer.getRenderTarget(),rt=new THREE.WebGLRenderTarget(512,512);
  var items=[atmosphere,moon,sunBody,sunGlow,starField,pinMarker],visible=items.map(function(m){return m.visible;}),shown=auroraMeshes.map(function(m){return m.visible;}),ticks=auroraMeshes.map(function(m){return m.material.uniforms.tick.value;});
  var base=new Uint8Array(512*512*4),lit=new Uint8Array(base.length);
  try{items.forEach(function(m){m.visible=false;});auroraMeshes.forEach(function(m){m.material.uniforms.tick.value=0;});camera.position.set(v.x*3.2,v.y*3.2,v.z*3.2);camera.up.set(0,1,0);camera.aspect=1;camera.fov=58;camera.updateProjectionMatrix();camera.lookAt(0,0,0);camera.updateMatrixWorld();renderer.setRenderTarget(rt);
   auroraMeshes.forEach(function(m){m.visible=false;});renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,512,512,base);
   auroraMeshes.forEach(function(m){m.visible=hasForecast();});renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,512,512,lit);
   var energy=0,pixels=0;for(var i=1;i<base.length;i+=4){var gain=Math.max(0,lit[i]-base[i]);energy+=gain;if(gain>=3)pixels++;}return {energy:energy,pixels:pixels};
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
 await page.clock.setFixedTime(new Date('2026-10-09T12:00Z'));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__auroraTransition);await page.evaluate(({manifest,values})=>__auroraTransition.seed(manifest,values),{manifest,values});
 const result=await page.evaluate(()=>{const forward=[],reverse=[];for(let minute=10;minute<=35;minute++){__auroraTransition.at('2026-10-09T02:'+minute+':00Z');forward.push({...__auroraTransition.state(),...__auroraTransition.glow()});}for(let minute=35;minute>=10;minute--){__auroraTransition.at('2026-10-09T02:'+minute+':00Z');reverse.push({...__auroraTransition.state(),...__auroraTransition.glow()});}return {forward,reverse};});
 assert.deepEqual(result.reverse.slice().reverse(),result.forward,'Backward scrubbing has the same source, GPU emission, visibility and gap status');
 assert(result.forward.every(s=>s.visible&&s.energy>0),'Every minute around 9:23 retains rendered aurora');
 const reported=result.forward.find(s=>s.instant==='2026-10-09T02:23:00.000Z');assert(reported.note.includes('6:09 PM to 9:18 PM'));assert.equal(reported.noteHidden,false);assert.deepEqual(reported.weights.map(p=>p.weight),[.5,.5]);
 const first=result.forward[0].energy,last=result.forward.at(-1).energy;assert(last>first*10,'Actual NOAA grids explain the large strength difference across the recording gap');
 for(let i=1;i<result.forward.length;i++)assert(Math.abs(result.forward[i].energy-result.forward[i-1].energy)<last*.18,'No minute turns the whole glow on or off');
 const india=await page.evaluate(()=>[22,23,24].map(function(minute){__auroraTransition.at('2026-10-09T02:'+minute+':00Z');return {...__auroraTransition.state(),...__auroraTransition.glow(20,80)};}));assert(india.every(s=>s.visible&&s.energy>0),'The India-facing hemisphere also retains aurora at 9:22, 9:23 and 9:24');
 assert.equal(result.forward.at(-1).noteHidden,true);assert.equal(reported.pin,D.auroraAt(original[1],68,0),'Pinned probability uses the original forecast rather than a smoothed invention');
 await page.evaluate(file=>{__auroraTransition.evict(file);__auroraTransition.at('2026-10-09T02:23:00Z');},frames[1].file);const pending=await page.evaluate(()=>({...__auroraTransition.state(),...__auroraTransition.glow()}));assert(pending.visible&&pending.pending&&pending.energy>0,'Cold replacement retains the genuine earlier glow');
 await page.evaluate(()=>__auroraTransition.fetch());const ready=await page.evaluate(()=>({...__auroraTransition.state(),...__auroraTransition.glow()}));assert.equal(ready.pending,false);assert.equal(ready.display,reported.display);assert.equal(ready.energy,reported.energy,'Late loading resolves to the same selected-time glow');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dump,mobile?'mobile.json':'desktop.json'),JSON.stringify({result,india,pending,ready},null,2));console.log('PASS '+(mobile?'mobile WebKit':'desktop Chrome')+' original October 8 9:23 gap, all surrounding minutes forward/backward, source probabilities, cold cache and honest gap status');await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
