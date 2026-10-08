/* The actual October 7 capture gap must not erase aurora while scrubbing.
   Uses unmodified recorded NOAA grids and owns its local browser/server. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),D=require('../js/globe-data.js'),root=path.resolve(__dirname,'..');
const folder=path.join(__dirname,'fixtures/daylight/aurora-gap'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),frames=D.parseAuroraManifest(manifest);
const values=frames.map(frame=>{const bytes=fs.readFileSync(path.join(folder,frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);return JSON.parse(zlib.gunzipSync(bytes));});
const hook=`
window.__auroraReplay={
 seed:function(manifest,values){archiveFrames=data.parseAuroraManifest(manifest);sessionFrames=[];archiveCache.clear();archiveChecked=Date.now();
  values.forEach(function(value,i){cacheArchive(archiveFrames[i].file,data.parseAuroraArchive(value));});
  liveForecast=archiveCache.get(archiveFrames[archiveFrames.length-1].file);sharedManifest=null;cloudCatalog=null;
  refreshPhoto=async function(){};refreshWeather=async function(){};loading=false;container.classList.remove('is-loading');container.classList.add('is-ready');explore.querySelectorAll('input,button').forEach(function(c){c.disabled=false;});returnButton.disabled=false;
 },
 state:function(){return {ready:hasForecast(),layer:wrapper.dataset.aurora,instant:instant.toISOString(),observation:forecast&&forecast.observation.toISOString(),forecast:forecast&&forecast.forecast.toISOString(),historical:forecast&&forecast.historical,pending:replayPendingAurora,visible:auroraMeshes.every(function(mesh){return mesh.visible;})};},
 evict:function(file){archiveCache.delete(file);},
 staleLive:function(){live=true;forecast=archiveCache.get(archiveFrames[0].file);updateAstronomy();},
 warm:async function(end){recentEnd=new Date(end);replayKey='';await warmDayTimeline();return replayAurora.map(function(f){return f.file;});}
};
`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.gz':'application/gzip','.bin':'application/octet-stream','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));let bytes=fs.readFileSync(file);if(file===path.join(root,'js/globe.js'))bytes=Buffer.from(bytes.toString().replace(/\}\(\)\);\s*$/,hook+'\n}());'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
(async()=>{let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Users/ethan/.local/bin/agent-chrome-for-testing':chromium.executablePath()),headless:true});
 for(const mobile of[false,true]){const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.clock.setFixedTime(new Date('2026-10-08T02:18:00Z'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__auroraReplay);await page.evaluate(({manifest,values})=>__auroraReplay.seed(manifest,values),{manifest,values});
  const samples=await page.evaluate(async()=>{const input=document.querySelector('#globe-hour'),out=[];for(let minute=0;minute<=720;minute++){input.value=minute;input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(requestAnimationFrame);out.push(__auroraReplay.state());}return out;});
  assert.equal(samples.length,721);assert(samples.every(s=>s.ready&&s.visible&&s.layer==='ready'&&s.historical),'Every slider minute retains a recorded aurora');assert(samples.every(s=>s.observation<=s.instant),'Replay never uses a later measurement');
  const reported=samples[259];assert.equal(reported.instant,'2026-10-07T18:37:00.000Z');assert.equal(reported.forecast,'2026-10-07T16:05:00.000Z','1:37 PM holds the genuine 11:05 AM forecast');
  await page.evaluate(file=>__auroraReplay.evict(file),frames[1].file);await page.locator('#globe-hour').fill('259');await page.locator('#globe-hour').dispatchEvent('input');await page.evaluate(()=>new Promise(requestAnimationFrame));const pending=await page.evaluate(()=>__auroraReplay.state());assert(pending.ready&&pending.visible&&pending.pending,'An uncached replacement keeps a genuine earlier cached grid visible');assert.equal(pending.forecast,frames[0].forecast.toISOString());
  await page.evaluate(({manifest,values})=>__auroraReplay.seed(manifest,values),{manifest,values});await page.evaluate(()=>__auroraReplay.staleLive());assert.equal((await page.evaluate(()=>__auroraReplay.state())).ready,false,'Live keeps its freshness limits');
  await page.clock.setFixedTime(new Date('2026-10-08T06:18:00Z'));const warmed=await page.evaluate(()=>__auroraReplay.warm('2026-10-08T06:18:00Z'));assert(warmed.includes(frames[1].file),'Replay preloads the carried grid even when its forecast is more than two hours before the window');
  assert.deepEqual(errors,[]);console.log('PASS '+(mobile?'mobile':'desktop')+' all 721 slider minutes, 1:37 PM capture gap, pending cache replacement and stale live rejection');await context.close();
 }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
