/* A full-detail cloud upgrade must not block the rendered orbit. Uses synthetic
   dated satellite pixels, real reference assets and an owned browser process.
   BASELINE_REF measures an older renderer against the identical input workload.
   SAFARI_MOBILE=1 covers WebKit; NO_WORKER=1 covers a blocked-worker fallback. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),sharp=require('sharp'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),mobile=process.env.SAFARI_MOBILE==='1',blocked=process.env.NO_WORKER==='1',baseline=process.env.BASELINE_REF;
const width=Number(process.env.PERF_WIDTH||(mobile?2048:4096)),dump=process.env.DUMP||'/tmp/daylight-globe-responsiveness';
fs.mkdirSync(dump,{recursive:true});
const hook=`
window.__responsive={samples:[],costs:[],errors:[],running:false,
 state:()=>({loading,photo,worker:(typeof detailPreparing!=='undefined'&&detailPreparing?detailPreparing:replayPreparing).stats(),theta,phi}),
 seed:function(){var canvases=[48,112].map(function(shade){var canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;var context=canvas.getContext('2d');context.fillStyle='rgb('+shade+','+shade+','+shade+')';context.fillRect(0,0,128,64);return canvas;});
  var record={photo:{date:'2026-10-05',time:'2026-10-05T03:00:00.000Z',width:128,coverage:1,natural:true,dense:true},canvases,natural:canvases[0],infrared:canvases[1],memoized:true};cloudMemo.put(record.photo.time,record,128*128*4);installCloudRecord(record,photoGeneration,null,false);},
 job:async function(width){var blobs=await Promise.all(['visible','thermal'].map(async kind=>await (await fetch('/fixture-'+kind+'.png')).blob()));var stamp=new Date('2026-10-05T03:00:00Z'),started=performance.now();
  var result=await decodeDenseCloudRecord({dense:true,width,blobs:Array.from({length:10},(_,i)=>blobs[i<5?0:1]),sourceTimes:Array(10).fill(stamp.toISOString())},stamp,new AbortController().signal);
  var elapsed=performance.now()-started;installCloudRecord(result,photoGeneration,null,false);return {elapsed,width:result.photo.width,coverage:result.photo.coverage,retainedWidth:photo?.width};},
 start:function(){this.samples=[];this.costs=[];this.running=true;},stop:function(){this.running=false;return {gaps:this.samples,costs:this.costs};}};
var originalResponsiveFrame=frame,lastResponsiveFrame=0;
frame=function(time){var start=performance.now();if(__responsive.running){if(lastResponsiveFrame)__responsive.samples.push(time-lastResponsiveFrame);lastResponsiveFrame=time;}
 originalResponsiveFrame(time);if(__responsive.running)__responsive.costs.push(performance.now()-start);};
`;
let browser,server;
function percentile(values,p){const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];}
(async()=>{
 const fixtures={};for(const kind of ['visible','thermal']){
  const pixels=Buffer.alloc(width*width/2*4);
  for(let y=0;y<width/2;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4,cloud=(Math.sin(x/83)+Math.cos(y/61)+2)/4;
   if(kind==='visible')pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(45+cloud*205);
   else if(cloud>.7){pixels[i]=255;pixels[i+1]=0;pixels[i+2]=0;}else pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(70+cloud*100);
   pixels[i+3]=y>width*.045&&y<width*.455?255:0;
  }fixtures[kind]=await sharp(pixels,{raw:{width,height:width/2,channels:4}}).png().toBuffer();
 }
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
 server=http.createServer((req,res)=>{try{
  const u=new URL(req.url,'http://localhost'),fixture=u.pathname.match(/^\/fixture-(visible|thermal)\.png$/);if(fixture)return res.writeHead(200,{'Content-Type':'image/png'}).end(fixtures[fixture[1]]);
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+'/'))return res.writeHead(403).end();let body=fs.readFileSync(file);
  if(baseline&&/\/js\/globe(?:-replay|-clouds|-data)?\.js$/.test(file))body=execFileSync('git',['show',baseline+':'+path.relative(root,file)],{cwd:root});
  if(file.endsWith('/js/globe.js'))body=Buffer.from(body.toString().replace(/\}\(\)\);\s*$/,hook+'\n}());'));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
 }catch(error){res.writeHead(404).end(error.message);}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});
  const context=await browser.newContext({viewport:mobile?{width:375,height:812}:{width:1440,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,timezoneId:'America/Chicago'}),page=await context.newPage(),errors=[];
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  if(blocked)await page.addInitScript(()=>{window.Worker=function(){throw new Error('Fixture worker blocked');};});
  page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-10-05T03:10:00Z'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__responsive&&!__responsive.state().loading,null,{timeout:30000});
  if(!mobile){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await page.locator('#globe-container').scrollIntoViewIfNeeded();await page.evaluate(()=>__responsive.seed());const box=await page.locator('#globe-container canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.evaluate(()=>{
   __responsive.start();window.__responsiveOrbit=setInterval(()=>{const canvas=document.querySelector('#globe-container canvas');canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:innerWidth/2+Math.sin(performance.now()/350)*35,clientY:innerHeight/2+Math.cos(performance.now()/430)*30,bubbles:true}));},16);
  });
  const job=await page.evaluate(width=>__responsive.job(width),width);await page.waitForTimeout(700);await page.mouse.up();const frames=await page.evaluate(()=>{clearInterval(__responsiveOrbit);return __responsive.stop();});await page.waitForFunction(width=>__responsive.state().photo?.width===width,width,{timeout:5000});
  const result={engine:mobile?'WebKit':'Chrome',cpuThrottle:mobile?1:4,blocked,baseline:baseline||null,job,frames:frames.gaps.length,p95:percentile(frames.gaps,.95),max:Math.max(...frames.gaps),over100:frames.gaps.filter(value=>value>100).length,cpuP95:percentile(frames.costs,.95),state:await page.evaluate(()=>__responsive.state()),errors};
  fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify(result,null,2));await page.locator('.globe-wrapper').screenshot({path:path.join(dump,'after-upgrade.png')});console.log(JSON.stringify(result));
  assert.equal(job.width,width);assert(job.coverage>.15);assert.equal(errors.length,0,errors.join('; '));
  if(!baseline){assert.equal(job.retainedWidth,128,'Prepared detail retains the installed clouds while dragging');assert(result.frames>20,'Orbit continues while full detail prepares');assert(result.max<200,'Full-detail work cannot freeze an orbit for 200 ms');assert(result.over100<=1,'No repeated long interaction stalls');assert(result.p95<55,'At least 95 percent of frames stay under 55 ms');}
  await context.close();
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
