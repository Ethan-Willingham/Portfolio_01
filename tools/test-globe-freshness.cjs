/* Native archives advance independently, survive stale replicas, and never fall
   back to the display palettes that caused the reported cloud holes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const sharp=require('sharp'),{chromium,webkit}=require('playwright'),C=require('../js/globe-clouds.js'),A=require('../js/globe-archive.js');
const root=path.resolve(__dirname,'..'),mobile=process.env.SAFARI_MOBILE==='1',now='2026-10-09T16:30:00.000Z';
const hook=`window.__fresh={state:()=>({loading,photo,instant:instant.toISOString(),stamp:cloudStamp()?.toISOString(),catalogEnd:cloudCatalog&&cloudCatalog.end.toISOString(),frames:replayClouds.map(t=>t.toISOString()),busy:replayBusy,ready:replayClouds.filter(cloudPrepared).length}),poll:()=>refreshPhoto(),refresh:()=>{requestedDay='';sharedChecked=0;return refreshPhoto();},pose:()=>{autoSpin=false;sunFraming=false;targetTheta=theta=Math.PI/2-85*DEG;targetPhi=phi=Math.PI/2-25*DEG;targetRadius=radius=2.8;},time:iso=>{live=false;instant=new Date(iso);applyCachedTime();return refreshPhoto();}};`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.bin':'application/octet-stream','.json':'application/json','.gz':'application/gzip','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{let bytes=process.env.BASELINE_REF&&file.endsWith('/js/globe.js')?execFileSync('git',['show',process.env.BASELINE_REF+':js/globe.js'],{cwd:root}):fs.readFileSync(file);if(file.endsWith('/js/globe.js'))bytes=Buffer.from(bytes.toString().replace(/\}\(\)\);\s*$/,hook+'\n}());'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
function manifest(times,assets){
 const ids=['goes18','goes19','himawari9','meteosat-iodc','meteosat-mtg'],methods=['ABI-L2-CMI-C13','ABI-L2-CMI-C13','AHI-HSD-B13','msg_iodc:ir108','mtg_fd:ir105_hrfi'];
 const frames=times.map(time=>{const observations=Array(5).fill(null).concat(ids.map((id,i)=>({id,method:methods[i],start:new Date(Date.parse(time)-(i===3?3600000:600000)).toISOString(),end:new Date(Date.parse(time)-(i===3?2700000:0)).toISOString()}))),frame={time,natural:false,observations,sourceTimes:observations.map(o=>o&&o.start)};
  for(const kind of ['visible','infrared']){const bytes=assets[kind],hash=crypto.createHash('sha256').update(bytes).digest('hex');frame[kind]={file:time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+hash.slice(0,16)+'.webp',sha256:hash,bytes:bytes.length};}return frame;});
 return {version:3,processing:C.PROCESSING,width:2048,generatedAt:now,catalog:{version:2,checkedAt:now,times},frames};
}
(async()=>{
 const field=fs.readFileSync(path.join(__dirname,'fixtures/daylight/cloud-numeric/infrared.webp'));
 const blank=await sharp({create:{width:2048,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).webp({lossless:true}).toBuffer(),assets={infrared:field,visible:blank};
 const older=manifest(['2026-10-09T14:00:00.000Z'],assets),times=Array.from({length:15},(_,i)=>new Date(Date.parse('2026-10-09T14:00:00Z')+i*600000).toISOString()),current=manifest(times,assets);A.validate(current);
 let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
  browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});
  for(const workerBlocked of [false,true]){const context=await browser.newContext({viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago'}),page=await context.newPage(),errors=[],palette=[];let state='old';
   await page.clock.setFixedTime(new Date(now));if(workerBlocked)await page.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Fixture blocks worker');}};});
   await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.href.startsWith(A.BASE)){if(u.pathname.endsWith('manifest.json'))return route.fulfill(state==='failed'?{status:503,body:'Outage'}:{contentType:'application/json',body:JSON.stringify(state==='new'||state==='images-failed'?current:older)});return route.fulfill(state==='images-failed'?{status:503,body:'New snapshot temporarily unavailable'}:{contentType:'image/webp',body:u.pathname.includes('-visible-')?blank:field});}
    if(u.hostname==='gibs.earthdata.nasa.gov'||u.hostname==='view.eumetsat.int')palette.push(u.href);
    if(u.pathname.endsWith('manifest.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,source:'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',updatedAt:now,frames:[]})});return route.fulfill({status:503,body:'Fixture source unavailable'});
   });page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__fresh&&!__fresh.state().loading&&__fresh.state().photo,null,{timeout:35000});assert.equal((await page.evaluate(()=>__fresh.state())).photo.time,older.frames[0].time);
   state='images-failed';await page.clock.setFixedTime(new Date(Date.parse(now)+60000));await page.evaluate(()=>__fresh.poll());
   assert.equal((await page.evaluate(()=>__fresh.state())).catalogEnd,'2026-10-09T16:20:00.000Z','The next minute fetches metadata without resetting throttles');
   assert.equal((await page.evaluate(()=>__fresh.state())).photo.time,older.frames[0].time,'Unavailable replacement pixels retain the actual older clouds');
   assert.match(await page.locator('#globe-replay-status').innerText(),/Updating clouds/);
   state='new';await page.clock.setFixedTime(new Date(Date.parse(now)+120000));await page.evaluate(()=>__fresh.poll());await page.waitForFunction(()=>__fresh.state().photo?.time==='2026-10-09T16:20:00.000Z',null,{timeout:15000});
   assert.match(await page.locator('#globe-replay-status').innerText(),/22 to 72m old/);assert.match(await page.locator('#globe-cloud-times').textContent(),/GOES East: 11:10 AM/);assert.equal((await page.evaluate(()=>__fresh.state())).catalogEnd,'2026-10-09T16:20:00.000Z');
   state='old';await page.evaluate(()=>__fresh.refresh());assert.equal((await page.evaluate(()=>__fresh.state())).photo.time,'2026-10-09T16:20:00.000Z');
   state='failed';await page.evaluate(()=>__fresh.refresh());assert.equal((await page.evaluate(()=>__fresh.state())).photo.time,'2026-10-09T16:20:00.000Z');
   state='new';for(const iso of ['2026-10-09T15:31:00.000Z','2026-10-09T14:59:00.000Z','2026-10-09T16:29:00.000Z']){await page.evaluate(iso=>__fresh.time(iso),iso);const s=await page.evaluate(()=>__fresh.state());assert.equal(s.photo.time,s.stamp);assert.equal(Date.parse(s.photo.time),Math.floor(Date.parse(iso)/600000)*600000);}
   await page.evaluate(()=>__fresh.pose());await page.waitForTimeout(300);const dump=process.env.DUMP||'/tmp/globe-cloud-oct9/browser';fs.mkdirSync(dump,{recursive:true});await page.locator('.globe-wrapper').screenshot({path:path.join(dump,(mobile?'mobile':'desktop')+(workerBlocked?'-fallback':'')+'.png')});
   assert.equal(palette.length,0,'A slow or failed archive cannot reintroduce ambiguous palette imagery');assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('PASS '+(mobile?'mobile WebKit':'Chrome')+' startup, newer regional data, stale replica, outage, scrub and '+(workerBlocked?'yielding fallback':'worker')+' decoding');await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
