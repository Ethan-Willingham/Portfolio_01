/* A usable replay frame must reach the globe even when opening detail fails. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sharp=require('sharp'),{chromium,webkit}=require('playwright'),C=require('../js/globe-clouds.js');
const root=path.resolve(__dirname,'..'),now='2026-10-09T12:00:00.000Z',latest='2026-10-09T11:30:00.000Z',older='2026-10-09T11:15:00.000Z';
const hook=`
var startupRelease,originalFull=detailPreparing.prepareFull,originalCompact=replayPreparing.prepare;
var startupGate=new Promise(resolve=>{startupRelease=resolve;});
detailPreparing.prepareFull=async function(){throw new Error('Opening detail decoder unavailable');};
replayPreparing.prepare=async function(){await startupGate;return originalCompact.apply(this,arguments);};
window.__startup={state:()=>({loading,photo,enabled:earthMaterial.uniforms.photoEnabled.value,mix:earthMaterial.uniforms.photoMix.value,proxy:replayUniforms.replayEnabled.value,live,failed:cloudFailure,stamp:cloudStamp()?.toISOString(),ready:replayClouds.filter(cloudPrepared).length}),release:()=>startupRelease(),recover:()=>{detailPreparing.prepareFull=originalFull;requestedDay='';return refreshPhoto();},stopOpening:()=>{loadingStarted-=30000;replayController?.abort();}};
`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.bin':'application/octet-stream','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{let body=fs.readFileSync(file);if(file.endsWith('/js/globe.js'))body=Buffer.from(body.toString().replace(/\}\(\)\);\s*$/,hook+'\n}());'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}});
(async()=>{let browser;try{
 const bytes=await sharp({create:{width:2048,height:1024,channels:4,background:{r:180,g:180,b:180,alpha:1}}}).webp().toBuffer(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const catalog=C.validate({version:1,checkedAt:now,products:C.GROUPS.map(g=>({source:g.source,layer:g.layers[0],periods:[{start:older,end:latest,step:900000}]}))});
 const manifest={version:2,processing:C.PROCESSING,width:2048,generatedAt:now,catalog,frames:[older,latest].map(time=>({time,natural:true,sourceTimes:Array(10).fill(time),...Object.fromEntries(['visible','infrared'].map(kind=>[kind,{file:time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+hash.slice(0,16)+'.webp',sha256:hash,bytes:bytes.length}]))}))};
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const mobile=process.env.SAFARI_MOBILE==='1';browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});
 const context=await browser.newContext({viewport:{width:mobile?375:1440,height:900},isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(now));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.pathname.includes('/globe-clouds/'))return route.fulfill(u.pathname.endsWith('manifest.json')?{contentType:'application/json',body:JSON.stringify(manifest)}:{contentType:'image/webp',body:bytes});if(u.pathname.endsWith('globe-hourly-catalog.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify(catalog)});if(u.pathname.endsWith('manifest.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,source:'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',updatedAt:now,frames:[]})});return route.fulfill({status:503,body:'Source unavailable'});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__startup&&__startup.state().failed.includes('decoder'),null,{timeout:10000});
 await page.evaluate(()=>__startup.stopOpening());await page.waitForFunction(()=>!__startup.state().loading,null,{timeout:10000});assert.equal((await page.evaluate(()=>__startup.state())).photo,null);
 await page.evaluate(()=>__startup.release());await page.waitForFunction(()=>__startup.state().photo&&__startup.state().enabled===1&&__startup.state().mix===1,null,{timeout:10000});
 let s=await page.evaluate(()=>__startup.state());assert(s.live);assert.equal(s.photo.time,latest);assert.equal(s.proxy,1);assert.equal(s.mix,1);console.log('PASS late compact clouds install at Live without touching the timeline');
 await page.evaluate(()=>__startup.recover());await page.waitForFunction(()=>__startup.state().proxy===0,null,{timeout:10000});s=await page.evaluate(()=>__startup.state());assert(s.live&&s.enabled===1&&s.mix===1);assert.equal(s.photo.time,latest);console.log('PASS recovered full detail replaces compact clouds without changing time');
 await page.locator('#globe-hour').fill('675');await page.locator('#globe-hour').dispatchEvent('input');await page.waitForFunction(time=>__startup.state().photo?.time===time,older);
 await page.locator('#globe-return').click();await page.waitForFunction(()=>__startup.state().live&&__startup.state().photo?.time===__startup.state().stamp);assert.deepEqual(errors,[]);console.log('PASS away and Live both keep the selected source visible'+(mobile?' (mobile WebKit)':' (Chrome)'));
 }finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
