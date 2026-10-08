/* Real NOAA capture handoff, causal display continuity and source integrity.
   Browser/server ownership stays in this harness and closes in finally. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const D=require('../js/globe-data.js'),{chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
const folder=path.join(__dirname,'fixtures/daylight/aurora-transition'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),frames=D.parseAuroraManifest(manifest);
const values=frames.map(frame=>{const bytes=fs.readFileSync(path.join(folder,frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);return JSON.parse(zlib.gunzipSync(bytes));});
const dump=process.env.DUMP||'/tmp/earth-now-aurora/transition';fs.mkdirSync(dump,{recursive:true});
function blend(frames,iso){return D.auroraBlendAt(frames,new Date(iso));}
const before=blend(frames,'2026-10-07T23:34:00Z'),boundary=blend(frames,'2026-10-07T23:35:00Z'),middle=blend(frames,'2026-10-07T23:40:00Z'),after=blend(frames,'2026-10-07T23:45:00Z');
assert.equal(before[0].frame.file,frames[0].file);assert.equal(before[0].weight,1);assert.deepEqual(boundary,before,'New measurements do not switch display emission at their arrival');
assert.equal(middle.length,2);assert.equal(middle[0].weight,.5);assert.equal(middle[1].weight,.5);assert.equal(after.length,1);assert.equal(after[0].frame.file,frames[1].file);assert.equal(after[0].weight,1);
assert.deepEqual(blend(frames,'2026-10-07T20:28:59Z'),[],'No glow before the first measurements');
console.log('PASS actual 6:35 arrival crossfades continuously without future measurements');
// Independent dense numerical integration exercises closely spaced arrivals,
// changed forecast lead times, equal targets and overlapping transitions.
const origin=+new Date('2026-10-07T20:00Z'),minute=60000;
const irregular=[[0,45],[5,55],[9,45],[14,32],[19,54],[22,54],[26,46],[28,70]].map((p,i)=>({file:String(i),observation:new Date(origin+p[0]*minute),forecast:new Date(origin+p[1]*minute)}));
for(let m=0;m<=85;m++){
 const t=origin+m*minute,actual=D.auroraBlendAt(irregular,new Date(t)),expected=new Map(),slices=1200;
 for(let i=0;i<slices;i++){const u=(i+.5)/slices,frame=D.auroraFrameAt(irregular,new Date(t-u*10*minute));if(frame)expected.set(frame.file,(expected.get(frame.file)||0)+6*u*(1-u)/slices);}
 for(const frame of irregular){const part=actual.find(p=>p.frame===frame);assert(Math.abs((part?.weight||0)-(expected.get(frame.file)||0))<.002,'Integrated display agrees with independently sampled held forecasts');}
 assert(actual.every(p=>p.weight>0&&p.frame.observation<=t));assert(actual.reduce((s,p)=>s+p.weight,0)<=1+1e-12);
}
console.log('PASS overlapping arrivals and nearest-target switches keep causal weights continuous');
const hook=`
window.__auroraTransition={
 seed:function(manifest,values){if(archiveController)archiveController.abort();if(replayController)replayController.abort();archiveGeneration++;archiveBusy=false;
  archiveFrames=data.parseAuroraManifest(manifest);sessionFrames=[];archiveCache.clear();archiveChecked=Date.now();values.forEach(function(value,i){cacheArchive(archiveFrames[i].file,data.parseAuroraArchive(value));});
  sharedManifest=null;cloudCatalog=null;refreshPhoto=async function(){};refreshWeather=async function(){};refreshData=function(){};warmDayTimeline=function(){};
  loading=false;container.classList.remove('is-loading');container.classList.add('is-ready');explore.querySelectorAll('input,button').forEach(function(c){c.disabled=false;});returnButton.disabled=false;
 },
 at:function(iso,raw){live=false;instant=new Date(iso);recentEnd=new Date('2026-10-08T06:18Z');tilt=undefined;applyCachedTime();if(raw)setForecast(archiveCache.get(data.auroraFrameAt(allAuroraFrames(),instant).file));updateAstronomy();updateLabels();syncInputs();},
 state:function(){return {instant:instant.toISOString(),observation:forecast&&forecast.observation.toISOString(),forecast:forecast&&forecast.forecast.toISOString(),pending:replayPendingAurora,display:auroraDisplayGrid.reduce(function(s,v){return s+v;},0),weights:auroraDisplay.map(function(p){return {observation:p.value.observation.toISOString(),weight:p.weight};}),pin:forecast&&data.auroraAt(forecast,68,0),texture:auroraTexture.uuid,geometry:auroraMeshes.map(function(m){return m.geometry.uuid;})};},
 evict:function(file){archiveCache.delete(file);},fetch:function(){return refreshArchive();},
 glow:function(){var v=math.geographicVector(65,60),oldPosition=camera.position.clone(),oldUp=camera.up.clone(),aspect=camera.aspect,fov=camera.fov,oldTarget=renderer.getRenderTarget(),rt=new THREE.WebGLRenderTarget(512,512);
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
 await page.clock.setFixedTime(new Date('2026-10-08T06:18:00Z'));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__auroraTransition);await page.evaluate(({manifest,values})=>__auroraTransition.seed(manifest,values),{manifest,values});
 const result=await page.evaluate(()=>{const out={raw:[],smooth:[],reverse:[]};for(const iso of ['2026-10-07T23:34:00Z','2026-10-07T23:35:00Z']){__auroraTransition.at(iso,true);out.raw.push({...__auroraTransition.state(),...__auroraTransition.glow()});}
  for(let m=34;m<=46;m++){__auroraTransition.at('2026-10-07T23:'+m+':00Z');out.smooth.push({...__auroraTransition.state(),...__auroraTransition.glow()});}
  for(let m=46;m>=34;m--){__auroraTransition.at('2026-10-07T23:'+m+':00Z');out.reverse.push({...__auroraTransition.state(),...__auroraTransition.glow()});}return out;});
 const oldJump=Math.abs(result.raw[1].energy-result.raw[0].energy)/result.raw[0].energy,newJump=Math.abs(result.smooth[1].energy-result.smooth[0].energy)/result.smooth[0].energy;
 assert(result.raw[0].energy>1000);assert(oldJump>.25,'Actual handoff reproduces the large abrupt brightness change');assert(newJump<.05,'6:34 and 6:35 differ only by gradual astronomy');
 assert.equal(result.smooth[0].display,result.smooth[1].display);assert.equal(result.smooth[1].observation,frames[1].observation.toISOString());
 assert.equal(result.smooth[1].pin,D.auroraAt(D.parseAuroraArchive(values[1]),68,0),'Pin keeps actual NOAA probability');
 for(let i=1;i<result.smooth.length;i++)assert(Math.abs(result.smooth[i].energy-result.smooth[i-1].energy)/result.smooth[0].energy<.18,'No minute abruptly swaps the glow');
 assert.deepEqual(result.reverse.slice().reverse(),result.smooth,'Backward scrubbing repeats the same display exactly');
 assert.equal(new Set(result.smooth.map(s=>s.texture)).size,1);assert(result.smooth.every(s=>JSON.stringify(s.geometry)===JSON.stringify(result.smooth[0].geometry)),'Replay reuses GPU texture and ribbon buffers');
 await page.evaluate(file=>{__auroraTransition.evict(file);__auroraTransition.at('2026-10-07T23:36:00Z');},frames[1].file);const pending=await page.evaluate(()=>__auroraTransition.state());assert(pending.pending&&pending.display>0,'A cold replacement retains cached glow');
 await page.evaluate(()=>__auroraTransition.fetch());const ready=await page.evaluate(()=>__auroraTransition.state());assert(!ready.pending);assert.equal(ready.observation,frames[1].observation.toISOString());assert.equal(ready.display,result.smooth[2].display,'Cold loading resolves to the same deterministic emission');
 fs.writeFileSync(path.join(dump,mobile?'mobile.json':'desktop.json'),JSON.stringify({oldJump,newJump,result,pending,ready,errors},null,2));assert.deepEqual(errors,[]);
 console.log('PASS '+(mobile?'mobile WebKit':'desktop Chrome')+' actual handoff: '+(oldJump*100).toFixed(1)+'% abrupt change becomes '+(newJump*100).toFixed(2)+'%; all transition minutes, reverse replay, source integrity and cold cache');await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
